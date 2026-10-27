const fs = require('node:fs/promises'), path = require('node:path'), crypto = require('node:crypto'), { execFileSync } = require('node:child_process');
const { unzipSync } = require('fflate');
const jsonc = require('jsonc-parser'), data = require('../src/authoring-data.cjs'), updates = require('../src/authoring-updates.cjs');
const { buildIndex, engine } = require('../src/reference.cjs');
async function build(directory, output, channel, id) {
  if (!['stable', 'preview'].includes(channel) || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/.test(id)) throw Error('Invalid channel or snapshot ID');
  const input = JSON.parse(await fs.readFile(path.join(directory, 'inputs.json'))), source = input.channels[channel], generatedAt = new Date().toISOString();
  if (!source?.available || !!source.prerelease !== (channel === 'preview')) throw Error('Channel source is unavailable; no substitute is permitted');
  for (const [name, record] of Object.entries(input.downloads)) if (updates.sha256(await fs.readFile(path.join(directory, name))) !== record.sha256) throw Error(`Source checksum failed: ${name}`);
  const archive = await fs.readFile(path.join(directory, `${channel}.zip`));
  const sources = [
    { url: 'https://github.com/Mojang/bedrock-samples', revision: source.revision, tag: source.tag, channel, available: true, license: 'Minecraft EULA (upstream LICENSE.md)', attribution: '(c) Mojang AB. All rights reserved.' },
    { url: 'https://github.com/MicrosoftDocs/minecraft-creator', revision: input.learnRevision, license: 'CC-BY-4.0', attribution: 'Microsoft Learn contributors; descriptions extracted and adapted by Bedrock Workbench.' },
    { url: 'https://github.com/Mojang/minecraft-creator-tools', revision: input.creatorRevision, license: 'MIT (supporting reference only; no code included)', attribution: 'Mojang; supporting reference, parser not distributed in data.' }
  ];
  if (channel === 'preview') {
    const stable = input.channels.stable;
    if (!stable?.available || stable.prerelease) throw Error('Stable comparison source unavailable; Preview requires review');
    sources.push({ url: sources[0].url, revision: stable.revision, tag: stable.tag, channel: 'stable', available: true, license: sources[0].license, attribution: sources[0].attribution });
  }
  const files = structuredClone(data.bundled), docsZip = await fs.readFile(path.join(directory, 'learn.zip'));
  const markdown = unzipSync(docsZip, { filter: e => /\/creator\/Reference\/Content\/.*\.md$/i.test(e.name) });
  const byPath = new Map(Object.entries(markdown).map(([file, bytes]) => [file.replace(/^[^/]+\//, '').toLowerCase(), { file: file.replace(/^[^/]+\//, ''), text: Buffer.from(bytes).toString() }]));
  const pages = {}, missingPages = [];
  for (const [kind, links] of Object.entries(files['src/documentation-links.json'].components)) for (const [name, relative] of Object.entries(links)) {
    const page = byPath.get(`creator/${relative}.md`.toLowerCase()); if (!page) { missingPages.push(`${kind}|${name}`); continue; }
    pages[`${kind}|${name}`] = { path: page.file, text: page.text, sha: crypto.createHash('sha1').update(`blob ${Buffer.byteLength(page.text)}\0`).update(page.text).digest('hex') };
  }
  const verified = { source: sources[1].url, revision: input.learnRevision, pages };
  files['src/component-descriptions.json'] = require('./update-component-descriptions.cjs').extract(verified);
  files['src/event-forms.json'] = require('./update-event-forms.cjs').extract(verified);
  files['src/format-requirements.json'] = require('./extract-format-requirements.cjs').extract(docsZip);
  files['src/format-requirements.json'].updated = (input.learnDate || input.generatedAt).slice(0, 10);
  const reference = buildIndex(archive, source.tag); reference.sourceChannel = channel; reference.requestedChannel = channel === 'stable' ? 'release' : 'preview';
  let previewReview;
  if (channel === 'preview') {
    const stable = buildIndex(await fs.readFile(path.join(directory, 'stable.zip')), input.channels.stable.tag);
    if (require('../src/releases.cjs').compareVersions(stable.engine, reference.engine) > 0 || stable.engine === reference.engine && parseInt(stable.tag.split('.').at(-1), 10) > parseInt(reference.tag.split('.').at(-1), 10)) throw Error('Stable comparison is newer than Preview; select a compatible historical Stable source');
    const examples = unzipSync(archive, { filter: e => /^behavior_pack\/entities\/.*\.json$/.test(e.name) });
    previewReview = require('./preview-reference-fallback.cjs').mergePreviewReference(reference, stable, examples);
    reference.sourceFallbacks = previewReview.inherited;
  }
  files['src/filter-catalog.json'] = { source: reference.source, engine: reference.engine, tests: reference.filters, families: reference.vanilla?.entity_family || [] };
  // The existing independently authored extractor runs in a private temporary
  // directory so a candidate build never overwrites the bundled fallback.
  const scratch = path.join(output, 'private-generator'); await fs.mkdir(path.join(scratch, 'tools'), { recursive: true }); await fs.mkdir(path.join(scratch, 'src'), { recursive: true });
  const tool = path.join(scratch, 'tools/update-molang-catalog.cjs'); await fs.copyFile(path.join(__dirname, 'update-molang-catalog.cjs'), tool);
  const metadata = unzipSync(archive, { filter: e => /^metadata\/molang_modules\/.*\.json$/.test(e.name) });
  const facts = Object.values(metadata).map(b => JSON.parse(Buffer.from(b))).find(v => Array.isArray(v.queries) && Array.isArray(v.math_functions));
  if (!facts) throw Error('Molang metadata layout changed: review required');
  const factsFile = path.join(scratch, 'facts.json'); await fs.writeFile(factsFile, JSON.stringify(facts));
  const html = (c, p) => path.resolve(directory, `${c}-${p}.html`);
  execFileSync(process.execPath, [tool, html('stable', 'queryfunctions'), html('stable', 'mathfunctions'), factsFile, ...(input.channels.preview?.available ? [html('preview', 'queryfunctions'), html('preview', 'mathfunctions')] : [])]);
  files['src/molang-catalog.json'] = JSON.parse(await fs.readFile(path.join(scratch, 'src/molang-catalog.json')));
  files['src/molang-catalog.json'].provenance.supporting = `${sources[0].url}/tree/${source.revision}/metadata/molang_modules`;
  delete files['src/molang-catalog.json'].provenance.reviewed;
  // Game assets and vanilla translations are not public authoring payloads.
  for (const name of ['previewGeometry', 'previewOwners', 'previewControllers', 'languages']) delete reference[name];
  const licenses = Object.fromEntries(Object.entries(unzipSync(archive, { filter: e => /^(LICENSE|LICENSE.md)$/i.test(e.name) })).map(([name, bytes]) => [name, Buffer.from(bytes).toString()]));
  const learnLicense = Object.entries(unzipSync(docsZip, { filter: e => /\/LICENSE$/.test(e.name) })).map(([, bytes]) => Buffer.from(bytes).toString()).join('\n');
  const snapshot = { dataFormatVersion: 1, id, channel, sources, files, reference, notices: { authored: await fs.readFile(path.join(__dirname, '../data-public/LICENSE'), 'utf8'), samples: licenses, learn: learnLicense, creator: await fs.readFile(path.join(directory, 'creator-license.txt'), 'utf8') } };
  const bytes = Buffer.from(JSON.stringify(snapshot));
  const entry = { dataFormatVersion: 1, id, channel, generatedAt, extension: { min: require('../package.json').version, max: require('../package.json').version }, minecraft: { min: engine(source.tag), max: engine(source.tag) }, sources, url: '', sha256: updates.sha256(bytes), bytes: bytes.length }; entry.url = updates.artifactUrl(entry);
  updates.validateManifest({ dataFormatVersion: 1, channel, generatedAt, snapshots: [entry] }, channel); updates.validateSnapshot(snapshot, entry);
  const coverage = Object.fromEntries(['block', 'item', 'entity'].map(kind => [kind, require('./audit-component-hovers.cjs').audit(files[`schemas/${kind}.schema.json`])]));
  const fixtures = [], ajv = new (require('ajv'))({ strict: false, allErrors: true });
  const validators = Object.fromEntries(['block', 'item', 'entity', 'client-entity'].map(kind => [kind, ajv.compile(files[`schemas/${kind}.schema.json`])]));
  const vanilla = unzipSync(archive, { filter: e => /^(behavior_pack\/(blocks|items|entities)|resource_pack\/entity)\/.*\.json$/.test(e.name) });
  for (const [file, raw] of Object.entries(vanilla)) {
    const doc = jsonc.parse(Buffer.from(raw).toString()), kind = file.startsWith('resource') ? 'client-entity' : { blocks: 'block', items: 'item', entities: 'entity' }[file.split('/')[1]];
    if (!validators[kind](doc)) fixtures.push({ file, errors: validators[kind].errors });
  }
  const fallbackFailures = [];
  if (previewReview?.inherited.length) {
    const inherited = Object.fromEntries(previewReview.inherited.map(({ name }) => [name, reference.components.entity[name]]));
    const fallbackSchema = require('../src/reference.cjs').componentSchema({ ...reference, components: { ...reference.components, entity: inherited } }, 'entity');
    const validate = ajv.compile(fallbackSchema);
    for (const [file, raw] of Object.entries(vanilla)) if (file.startsWith('behavior_pack/entities/')) {
      if (!validate(jsonc.parse(Buffer.from(raw).toString()))) fallbackFailures.push({ file, errors: validate.errors });
    }
  }
  const report = { channel, id, sources, coverage, missingPages, previewReview, fallbackFailures, vanillaDocuments: Object.keys(vanilla).length, fixtureFailures: fixtures, generatedFileHashes: Object.fromEntries(Object.entries(files).map(([file, content]) => [file, updates.sha256(Buffer.from(JSON.stringify(content)))])) };
  const destination = path.join(output, channel); await fs.mkdir(destination, { recursive: true });
  await fs.writeFile(path.join(destination, 'snapshot.json'), bytes); await fs.writeFile(path.join(destination, 'entry.json'), JSON.stringify(entry, null, 2)); await fs.writeFile(path.join(destination, 'verification.json'), JSON.stringify(report, null, 2));
  await fs.writeFile(path.join(destination, 'manifest.json'), JSON.stringify({ dataFormatVersion: 1, channel, generatedAt, snapshots: [entry] }, null, 2));
  try {
    const log = execFileSync(process.execPath, ['--require', path.join(__dirname, 'use-authoring-candidate.cjs'), '--test', ...['entity-authoring','format-versions','filters','molang','hover-coverage'].map(name => path.join(__dirname, `../test/${name}.test.cjs`))], { env: { ...process.env, BEDROCK_CANDIDATE_DIRECTORY: destination }, maxBuffer: 8 * 1024 * 1024 });
    await fs.writeFile(path.join(destination, 'regressions.log'), log); report.projectRegressionsPassed = true;
  } catch (error) { await fs.writeFile(path.join(destination, 'regressions.log'), error.stdout || error.message); report.projectRegressionsPassed = false; }
  const review = JSON.parse(await fs.readFile(path.join(__dirname, '../data-public/reviewed.json')));
  const key = updates.reviewFingerprint(snapshot, entry);
  report.reviewFingerprint = key; await fs.writeFile(path.join(destination, 'verification.json'), JSON.stringify(report, null, 2));
  entry.reviewFingerprint = key;
  await fs.writeFile(path.join(destination, 'entry.json'), JSON.stringify(entry, null, 2));
  await fs.writeFile(path.join(destination, 'manifest.json'), JSON.stringify({ dataFormatVersion: 1, channel, generatedAt, snapshots: [entry] }, null, 2));
  if (fixtures.length || fallbackFailures.length || previewReview?.unresolved.length || missingPages.length || !report.projectRegressionsPassed || Object.values(coverage).some(v => v.missing.length) || !review.approvedFingerprints.includes(key)) throw Error(`Candidate held for review: ${key}. Inspect ${destination}/verification.json`);
  await fs.writeFile(path.join(destination, 'verified.json'), JSON.stringify({ sha256: entry.sha256, reviewFingerprint: key }));
  return entry;
}
if (require.main === module) build(path.resolve(process.argv[2] || '.test-temp/data-inputs'), path.resolve(process.argv[3] || '.test-temp/data-output'), process.argv[4] || 'stable', process.argv[5] || 'candidate').catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { build };
