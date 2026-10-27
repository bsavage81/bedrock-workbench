// Build tooling. Never copy this file or extension sources to the data repo.
const fs = require('node:fs/promises'), path = require('node:path');
const { createHash } = require('node:crypto');
const { chooseRelease } = require('../src/reference.cjs');
const sha256 = b => createHash('sha256').update(b).digest('hex');
async function get(url, limit = 4 * 1024 * 1024) {
  const r = await fetch(url, { signal: AbortSignal.timeout(90000), headers: { 'User-Agent': 'Bedrock-Workbench-data-builder', ...(url.startsWith('https://api.github.com/') && process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) } });
  if (!r.ok) throw Error(`Official source HTTP ${r.status}: ${url}`);
  const chunks = []; let size = 0;
  for await (const b of r.body) { size += b.length; if (size > limit) throw Error('Official source size limit'); chunks.push(b); }
  return Buffer.concat(chunks);
}
async function fetchInputs(directory) {
  await fs.mkdir(directory, { recursive: true });
  const json = async url => JSON.parse(await get(url));
  const releases = await json('https://api.github.com/repos/Mojang/bedrock-samples/releases?per_page=100');
  const learn = await json('https://api.github.com/repos/MicrosoftDocs/minecraft-creator/commits/main');
  const creator = await json('https://api.github.com/repos/Mojang/minecraft-creator-tools/commits/main');
  const inputs = { generatedAt: new Date().toISOString(), learnRevision: learn.sha, learnDate: learn.commit.committer.date, creatorRevision: creator.sha, channels: {}, downloads: {} };
  async function save(name, url, limit) { const bytes = await get(url, limit); await fs.writeFile(path.join(directory, name), bytes); inputs.downloads[name] = { url, sha256: sha256(bytes), bytes: bytes.length }; }
  // The documentation repo also contains large media. Fetch only the pinned
  // Markdown pages used by our catalog, with bounded concurrent anonymous GETs.
  const tree = JSON.parse(await get(`https://api.github.com/repos/MicrosoftDocs/minecraft-creator/git/trees/${learn.sha}?recursive=1`, 24 * 1024 * 1024));
  if (tree.truncated) throw Error('Learn source tree truncated: review required');
  const needed = new Set(Object.values(require('../src/documentation-links.json').components).flatMap(links => Object.values(links)).map(p => `creator/${p}.md`.toLowerCase()));
  const pages = tree.tree.filter(e => e.type === 'blob' && (needed.has(e.path.toLowerCase()) || e.path === 'LICENSE'));
  const zip = {}, queue = [...pages];
  await Promise.all(Array.from({ length: 8 }, async () => {
    for (let item; (item = queue.shift());) {
      const bytes = await get(`https://raw.githubusercontent.com/MicrosoftDocs/minecraft-creator/${learn.sha}/${item.path}`);
      const digest = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
      if (digest !== item.sha) throw Error(`Learn blob verification failed: ${item.path}`);
      zip[`minecraft-creator-${learn.sha}/${item.path}`] = bytes;
    }
  }));
  const learnBytes = Buffer.from(require('fflate').zipSync(zip));
  await fs.writeFile(path.join(directory, 'learn.zip'), learnBytes);
  inputs.downloads['learn.zip'] = { url: `https://github.com/MicrosoftDocs/minecraft-creator/tree/${learn.sha}`, sha256: sha256(learnBytes), bytes: learnBytes.length };
  // Supporting source: inspect and preserve its notice, never ship parser code.
  await save('creator-license.txt', `https://raw.githubusercontent.com/Mojang/minecraft-creator-tools/${creator.sha}/LICENSE.md`);
  for (const channel of ['stable', 'preview']) {
    const candidates = releases.filter(r => !!r.prerelease === (channel === 'preview'));
    const pinned = channel === 'stable' && process.env.BEDROCK_DATA_STABLE_TAG || process.env.BEDROCK_DATA_CHANNEL === channel && process.env.BEDROCK_DATA_SOURCE_TAG;
    if (pinned && !/^v\d+\.\d+\.\d+\.\d+(?:-preview)?$/.test(pinned)) throw Error('Invalid historical source tag');
    const release = pinned ? await json(`https://api.github.com/repos/Mojang/bedrock-samples/releases/tags/${pinned}`) : chooseRelease(candidates, '999.999.999', channel === 'preview' ? 'preview' : 'release');
    if (!release) { inputs.channels[channel] = { available: false }; continue; }
    if (release.draft || !!release.prerelease !== (channel === 'preview')) throw Error('Historical source tag does not match its requested channel');
    const name = `bedrock-samples-${release.tag_name}-min.zip`, asset = release.assets.find(a => a.name === name);
    const url = `https://github.com/Mojang/bedrock-samples/releases/download/${release.tag_name}/${name}`;
    if (!asset || asset.browser_download_url !== url) throw Error(`Unverified ${channel} samples archive`);
    const commit = await json(`https://api.github.com/repos/Mojang/bedrock-samples/commits/${release.tag_name}`);
    inputs.channels[channel] = { available: true, tag: release.tag_name, revision: commit.sha, prerelease: release.prerelease };
    await save(`${channel}.zip`, url, 40 * 1024 * 1024);
    const base = 'https://learn.microsoft.com/en-us/minecraft/creator/reference/content/molangreference/examples/molangconcepts/';
    for (const page of ['queryfunctions', 'mathfunctions']) await save(`${channel}-${page}.html`, `${base}${page}?view=minecraft-bedrock-${channel === 'preview' ? 'experimental' : 'stable'}`);
  }
  await fs.writeFile(path.join(directory, 'inputs.json'), JSON.stringify(inputs, null, 2)); return inputs;
}
if (require.main === module) fetchInputs(path.resolve(process.argv[2] || '.test-temp/data-inputs')).catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { fetchInputs, get };
