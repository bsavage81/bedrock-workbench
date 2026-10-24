const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { unzipSync } = require('fflate');
(async () => {
  const version = require('../package.json').version;
  const archive = unzipSync(await fs.readFile(`bedrock-workbench-win32-x64-${version}.vsix`));
  assert.match(Buffer.from(archive['extension.vsixmanifest']).toString(), /TargetPlatform="win32-x64"/);
  assert.ok(!Object.keys(archive).some(file => file.startsWith('extension/projects/')));
  const base = path.resolve('.test-temp'); await fs.mkdir(base, { recursive: true });
  const unpacked = await fs.mkdtemp(path.join(base, 'packaged-'));
  for (const [relative, bytes] of Object.entries(archive)) {
    const destination = path.resolve(unpacked, relative);
    if (!destination.startsWith(unpacked + path.sep)) throw new Error('Unsafe archive path');
    await fs.mkdir(path.dirname(destination), { recursive: true }); await fs.writeFile(destination, bytes);
  }
  const core = require(path.join(unpacked, 'extension/src/core.cjs'));
  const sample = path.resolve('projects/SavageCraft v2');
  const sourceProject = await core.loadProject(sample);
  const isolatedSample = await fs.mkdtemp(path.join(base, 'package-sample-'));
  const isolatedConfig = structuredClone(sourceProject.config);
  isolatedConfig.packs = { behavior: 'BP', resource: 'RP' };
  for (const [kind, source] of Object.entries(sourceProject.packs)) await fs.cp(source, path.join(isolatedSample, isolatedConfig.packs[kind]), { recursive: true });
  await core.writeJson(path.join(isolatedSample, 'bedrock-project.json'), isolatedConfig);
  const build = await core.compile(isolatedSample, 'beta');
  try {
    const config = build.config;
    const beta = await core.readJson(path.join(build.directory, 'behavior/manifest.json'));
    assert.equal(beta.header.uuid, config.profiles.beta.identities.behavior.header);
    const exportsDirectory = path.join(sample, config.build.exports);
    const candidates = await Promise.all((await fs.readdir(exportsDirectory)).filter(file => file.endsWith('.mcaddon')).map(async file => ({ file, modified: (await fs.stat(path.join(exportsDirectory, file))).mtimeMs })));
    candidates.sort((a, b) => b.modified - a.modified);
    assert.ok(candidates.length, 'A sample export must exist');
    const exported = path.join(exportsDirectory, candidates[0].file);
    const addon = unzipSync(await fs.readFile(exported));
    const manifests = Object.keys(addon).filter(file => file.endsWith('/manifest.json')).map(file => ({ file, manifest: JSON.parse(Buffer.from(addon[file]).toString()) }));
    const behavior = manifests.find(entry => entry.manifest.modules.some(module => module.type === 'data'));
    const bp = behavior.manifest;
    const rp = manifests.find(entry => entry.manifest.modules.some(module => module.type === 'resources')).manifest;
    assert.equal(bp.header.uuid, config.profiles.stable.identities.behavior.header);
    assert.equal(rp.header.uuid, config.profiles.stable.identities.resource.header);
    assert.equal(bp.dependencies.find(d => d.uuid)?.uuid, rp.header.uuid);
    assert.ok(addon[behavior.file.replace(/manifest.json$/, 'scripts/main.js')]);
    console.log(`Packaged runtime compiles SavageCraft successfully; stable archive has ${Object.keys(addon).length} files and consistent pack identities.`);
    const official = require(path.join(unpacked, 'extension/src/official-schemas.cjs'));
    const prepared = await official.prepare(await core.loadProject(isolatedSample));
    if (prepared.directory) {
      const validate = await official.validator(prepared);
      assert.ok((await validate('behavior', 'loot_tables/check.json', { pools: 'invalid' })).length);
    }
    const molang = require(path.join(unpacked, 'extension/src/vendor/molang.cjs'));
    assert.ok(molang.molangParser.parse('math.sin(query.anim_time').errors.length);
    assert.ok(archive['extension/third_party/mojang/LICENSE.md']);
    assert.ok(!Object.keys(archive).some(file => file.startsWith('extension/node_modules/@minecraft/bedrock-schemas/forms/')));
    console.log('Packaged official schemas, Molang parser, and third-party license verified.');
  } finally { await fs.rm(isolatedSample, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
