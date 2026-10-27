// This command is deliberately not called by local verification.
const fs = require('node:fs/promises'), path = require('node:path'), { execFileSync } = require('node:child_process');
const u = require('../src/authoring-updates.cjs');
const gh = args => execFileSync('gh', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] });
async function publish(directory) {
  if (process.env.AUTHORING_PUBLICATION_ENABLED !== 'true') throw Error('Public data publication is disabled');
  const entry = JSON.parse(await fs.readFile(path.join(directory, 'entry.json'))), verified = JSON.parse(await fs.readFile(path.join(directory, 'verified.json')));
  const bytes = await fs.readFile(path.join(directory, 'snapshot.json'));
  const reviewed = JSON.parse(await fs.readFile(path.join(__dirname, '../data-public/reviewed.json')));
  if (verified.sha256 !== u.sha256(bytes) || entry.sha256 !== verified.sha256 || !reviewed.approvedFingerprints.includes(verified.reviewFingerprint)) throw Error('Candidate verification or approval is stale');
  u.validateManifest({ dataFormatVersion: 1, generatedAt: entry.generatedAt, channel: entry.channel, snapshots: [entry] }, entry.channel); const snapshot = u.validateSnapshot(u.safeJson(bytes), entry);
  if (u.reviewFingerprint(snapshot, entry) !== verified.reviewFingerprint) throw Error('Candidate content or compatibility coverage differs from the reviewed fingerprint');
  const releaseManifest = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json')));
  u.validateManifest(releaseManifest, entry.channel);
  if (releaseManifest.snapshots.length !== 1 || JSON.stringify(releaseManifest.snapshots[0]) !== JSON.stringify(entry)) throw Error('Versioned manifest differs from verified entry');
  const immutable = JSON.parse(gh(['api', '-H', 'X-GitHub-Api-Version: 2026-03-10', `repos/${u.REPOSITORY}/immutable-releases`]));
  if (!immutable.enabled) throw Error('Immutable releases are not enabled; no release was created');
  const tag = `data-${entry.id}`;
  // gh fails if the tag/release already exists; assets are never clobbered.
  gh(['release', 'create', tag, '--repo', u.REPOSITORY, '--draft', '--title', `Authoring data ${entry.id}`, '--notes', `Declarative ${entry.channel} authoring data. Source attribution and licenses are embedded in snapshot.json.`, ...(entry.channel === 'preview' ? ['--prerelease'] : [])]);
  gh(['release', 'upload', tag, path.join(directory, 'snapshot.json'), path.join(directory, 'manifest.json'), '--repo', u.REPOSITORY]);
  gh(['release', 'edit', tag, '--repo', u.REPOSITORY, '--draft=false']);
  const release = JSON.parse(gh(['api', `repos/${u.REPOSITORY}/releases/tags/${tag}`]));
  if (release.immutable !== true) throw Error('Release is not immutable. Feed unchanged. Enable immutable releases before publishing another candidate.');
  // Anonymous download verification precedes feed advancement.
  const downloaded = await u.download(entry.url, entry.bytes, AbortSignal.timeout(60000));
  if (u.sha256(downloaded) !== entry.sha256) throw Error('Anonymous release verification failed; feed unchanged');
  const endpoint = `repos/${u.REPOSITORY}/contents/feeds/${entry.channel}.json`;
  let previous;
  try { previous = JSON.parse(gh(['api', endpoint])); }
  catch (error) { // Distinguish a genuinely absent feed from auth/network failures.
    let problem; try { problem = JSON.parse(String(error.stdout)); } catch { throw Error('Cannot safely read the existing feed'); }
    if (String(problem.status) !== '404') throw Error('Cannot safely read the existing feed');
    gh(['api', `repos/${u.REPOSITORY}`]); // Do not interpret inaccessible repo as a new feed.
  }
  const old = previous ? JSON.parse(Buffer.from(previous.content, 'base64')) : { dataFormatVersion: 1, channel: entry.channel, snapshots: [] };
  if (old.snapshots.some(s => s.id === entry.id)) throw Error('Snapshot ID already indexed');
  const manifest = { ...old, generatedAt: new Date().toISOString(), snapshots: [...old.snapshots, entry] };
  u.validateManifest(manifest, entry.channel);
  const payload = { message: `Index ${tag}`, content: Buffer.from(JSON.stringify(manifest, null, 2) + '\n').toString('base64'), ...(previous ? { sha: previous.sha } : {}) };
  execFileSync('gh', ['api', endpoint, '--method', 'PUT', '--input', '-'], { input: JSON.stringify(payload), stdio: ['pipe', 'pipe', 'inherit'] });
}
if (require.main === module) publish(path.resolve(process.argv[2])).catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { publish };
