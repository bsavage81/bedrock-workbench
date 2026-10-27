const { test } = require('node:test'), assert = require('node:assert/strict');
const data = require('../src/authoring-data.cjs'), updates = require('../src/authoring-updates.cjs');
const { validateCandidate, digest } = require('../data-public/.github/scripts/publish.cjs');
function fixture() {
  const sources = [{ url:'https://github.com/Mojang/bedrock-samples', revision:'a'.repeat(40), license:'Minecraft EULA', attribution:'Mojang', channel:'stable', available:true }];
  const snapshot = { dataFormatVersion:1, id:'reviewed-1', channel:'stable', sources, files:structuredClone(data.bundled), notices:{author:'MIT'} };
  const bytes = Buffer.from(JSON.stringify(snapshot)), entry = { dataFormatVersion:1, id:snapshot.id, channel:snapshot.channel, extension:{min:'0.26.8',max:'0.26.8'}, minecraft:{min:'1.26.50',max:'1.26.50'}, sources, url:'', bytes:bytes.length, sha256:digest(bytes) };
  entry.url = updates.artifactUrl(entry); entry.reviewFingerprint = updates.reviewFingerprint(snapshot,entry);
  return { entry, snapshot, bytes, verified:{sha256:entry.sha256,reviewFingerprint:entry.reviewFingerprint}, reviewed:{approvedFingerprints:[entry.reviewFingerprint]} };
}
test('public publisher independently accepts only owner-reviewed exact data and compatibility', () => {
  const f=fixture(); assert.equal(validateCandidate(f.entry,f.snapshot,f.bytes,f.verified,f.reviewed),f.entry.reviewFingerprint);
  assert.throws(()=>validateCandidate({...f.entry,minecraft:{min:'1.20.0',max:'1.26.50'}},f.snapshot,f.bytes,f.verified,f.reviewed),/approved/);
  const changed=structuredClone(f.snapshot); changed.files['src/molang-catalog.json'].entries[0].description='Unreviewed change'; const bytes=Buffer.from(JSON.stringify(changed)), hash=digest(bytes);
  assert.throws(()=>validateCandidate({...f.entry,sha256:hash,bytes:bytes.length},changed,bytes,{...f.verified,sha256:hash},f.reviewed),/approved/);
  assert.throws(()=>validateCandidate(f.entry,f.snapshot,f.bytes,f.verified,{approvedFingerprints:[]}),/approved/);
  assert.throws(()=>validateCandidate({...f.entry,url:'https://evil.example/snapshot.json'},f.snapshot,f.bytes,f.verified,f.reviewed),/Untrusted/);
});
test('public publisher refuses arbitrary additional files and mislabeled Preview data', () => {
  const f=fixture(), changed=structuredClone(f.snapshot); changed.files['../executable.js']={}; const bytes=Buffer.from(JSON.stringify(changed)), hash=digest(bytes);
  assert.throws(()=>validateCandidate({...f.entry,sha256:hash,bytes:bytes.length},changed,bytes,{...f.verified,sha256:hash},f.reviewed),/unapproved files/);
  const preview=fixture(); preview.snapshot.channel='preview'; preview.entry.channel='preview'; const previewBytes=Buffer.from(JSON.stringify(preview.snapshot)); preview.entry.bytes=previewBytes.length;preview.entry.sha256=digest(previewBytes);preview.entry.reviewFingerprint=updates.reviewFingerprint(preview.snapshot,preview.entry);preview.verified={sha256:preview.entry.sha256,reviewFingerprint:preview.entry.reviewFingerprint};preview.reviewed={approvedFingerprints:[preview.entry.reviewFingerprint]};
  assert.throws(()=>validateCandidate(preview.entry,preview.snapshot,previewBytes,preview.verified,preview.reviewed),/No Preview source/);
});
