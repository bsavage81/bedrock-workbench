// Data-repository publisher. Only this repository's scoped Actions token is used.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), { execFileSync } = require('node:child_process');
const repository = 'bsavage81/bedrock-workbench-data';
const files = ['src/documentation-links.json','src/component-descriptions.json','src/format-requirements.json','src/filter-catalog.json','src/molang-catalog.json','src/molang-guidance.json','src/event-forms.json',...['block','entity','item','client-entity','creative-catalog','loot-table','recipe','texture-atlas','sound-definitions'].map(n=>`schemas/${n}.schema.json`)];
const digest = value => crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value ?? null))).digest('hex');
function check(ok, message) { if (!ok) throw Error(message); }
function validateCandidate(entry, snapshot, bytes, verified, reviewed) {
  check(entry.dataFormatVersion === 1 && ['stable','preview'].includes(entry.channel) && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/.test(entry.id), 'Invalid candidate identity');
  check(entry.url === `https://github.com/${repository}/releases/download/data-${entry.id}/snapshot.json`, 'Untrusted artifact URL');
  check(bytes.length === entry.bytes && entry.bytes <= 24*1024*1024 && digest(bytes) === entry.sha256 && verified.sha256 === entry.sha256, 'Candidate checksum mismatch');
  check(snapshot.dataFormatVersion === 1 && snapshot.id === entry.id && snapshot.channel === entry.channel && JSON.stringify(snapshot.sources) === JSON.stringify(entry.sources), 'Candidate provenance mismatch');
  check(snapshot.files && Object.keys(snapshot.files).length === files.length && files.every(f => Object.hasOwn(snapshot.files, f)), 'Candidate contains unapproved files');
  const fingerprint = digest({ dataFormatVersion: entry.dataFormatVersion, channel: entry.channel, extension: entry.extension, minecraft: entry.minecraft, sources: entry.sources, files: Object.fromEntries(files.map(file => [file, digest(snapshot.files[file])])), reference: digest(snapshot.reference), notices: digest(snapshot.notices) });
  check(fingerprint === verified.reviewFingerprint && fingerprint === entry.reviewFingerprint && reviewed.approvedFingerprints?.includes(fingerprint), 'Candidate has not been approved by the owner');
  if (entry.channel === 'preview') check(entry.sources.some(s => s.url === 'https://github.com/Mojang/bedrock-samples' && s.channel === 'preview' && s.available === true), 'No Preview source');
  return fingerprint;
}
const gh = args => execFileSync('gh', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] });
async function anonymousAsset(url, limit) {
  let current = url;
  for (let i=0;i<5;i++) {
    const parsed = new URL(current);
    check(parsed.protocol === 'https:' && (current === url || ['release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(parsed.hostname)), 'Untrusted asset redirect');
    const response = await fetch(current, { redirect:'manual', signal:AbortSignal.timeout(60000) });
    if ([301,302,303,307,308].includes(response.status)) { current = new URL(response.headers.get('location'), current).href; continue; }
    check(response.ok, `Anonymous asset HTTP ${response.status}`); const chunks=[]; let size=0;
    for await (const chunk of response.body) { size += chunk.length; check(size <= limit, 'Anonymous asset exceeds declared size'); chunks.push(chunk); }
    return Buffer.concat(chunks);
  }
  throw Error('Too many asset redirects');
}
async function publish(directory, sourceRevision) {
  check(/^[a-f0-9]{40}$/.test(sourceRevision), 'Invalid source revision');
  const get = name => fs.readFileSync(path.join(directory, name));
  const entry = JSON.parse(get('entry.json')), manifest = JSON.parse(get('manifest.json')), verified = JSON.parse(get('verified.json')), bytes = get('snapshot.json'), snapshot = JSON.parse(bytes);
  check(manifest.dataFormatVersion === 1 && manifest.channel === entry.channel && manifest.snapshots?.length === 1 && JSON.stringify(manifest.snapshots[0]) === JSON.stringify(entry), 'Versioned manifest mismatch');
  const response = await fetch(`https://raw.githubusercontent.com/bsavage81/bedrock-workbench/${sourceRevision}/data-public/reviewed.json`, { signal:AbortSignal.timeout(30000) });
  check(response.ok, `Cannot read owner approval: HTTP ${response.status}`);
  const reviewed = await response.json(); const fingerprint = validateCandidate(entry, snapshot, bytes, verified, reviewed);
  const endpoint = `repos/${repository}/contents/feeds/${entry.channel}.json`; let previous;
  try { previous = JSON.parse(gh(['api', endpoint])); }
  catch (error) { let problem; try { problem = JSON.parse(String(error.stdout)); } catch { throw Error('Cannot read feed'); } if (String(problem.status) !== '404') throw Error('Cannot read feed'); gh(['api', `repos/${repository}`]); }
  const old = previous ? JSON.parse(Buffer.from(previous.content, 'base64')) : { dataFormatVersion:1, channel:entry.channel, snapshots:[] };
  check(old.channel === entry.channel && old.dataFormatVersion === 1 && Array.isArray(old.snapshots) && old.snapshots.length < 300, 'Invalid or full feed');
  if (old.snapshots.some(item => item.reviewFingerprint === fingerprint)) { console.log(`Reviewed ${entry.channel} data is already published; no duplicate release.`); return; }
  check(!old.snapshots.some(item => item.id === entry.id), 'Snapshot ID already exists');
  // The scoped Actions token cannot read repository administration settings.
  // Require GitHub's release-level immutable flag before advancing any feed.
  const tag = `data-${entry.id}`;
  gh(['release','create',tag,'--repo',repository,'--draft','--title',`Authoring data ${entry.id}`,'--notes',`Reviewed ${entry.channel} declarative data. Attribution and licenses are in snapshot.json.`,...(entry.channel === 'preview' ? ['--prerelease'] : [])]);
  gh(['release','upload',tag,path.join(directory,'snapshot.json'),path.join(directory,'manifest.json'),'--repo',repository]);
  gh(['release','edit',tag,'--repo',repository,'--draft=false']);
  const release = JSON.parse(gh(['api',`repos/${repository}/releases/tags/${tag}`])); check(release.immutable === true, 'Release is not immutable; feed unchanged');
  check(digest(await anonymousAsset(entry.url, entry.bytes)) === entry.sha256, 'Anonymous verification failed; feed unchanged');
  const feed = { ...old, generatedAt:new Date().toISOString(), snapshots:[...old.snapshots,entry] };
  const payload = { message:`Index ${tag}`, content:Buffer.from(JSON.stringify(feed,null,2)+'\n').toString('base64'), ...(previous ? {sha:previous.sha} : {}) };
  execFileSync('gh',['api',endpoint,'--method','PUT','--input','-'],{input:JSON.stringify(payload),stdio:['pipe','pipe','inherit']});
  console.log(`Published and anonymously verified ${entry.channel} data ${entry.id}.`);
}
if (require.main === module) publish(process.env.CANDIDATE_DIR, process.env.SOURCE_REVISION).catch(error => { console.error(error.message); process.exitCode=1; });
module.exports = { validateCandidate, digest };
