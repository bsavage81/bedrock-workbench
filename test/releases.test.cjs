const { test } = require('node:test');
const assert = require('node:assert/strict');
const releases = require('../src/releases.cjs');
const metadata = { result: { links: [
  { downloadType: 'serverBedrockPreviewWindows', downloadUrl: 'https://www.minecraft.net/bedrockdedicatedserver/bin-win-preview/bedrock-server-1.26.70.21.zip' },
  { downloadType: 'serverBedrockWindows', downloadUrl: 'https://www.minecraft.net/bedrockdedicatedserver/bin-win/bedrock-server-1.26.52.3.zip' }
] } };
test('official Windows release is selected separately from Preview and internal build suffix is omitted', () => {
  const release = releases.parseReleaseMetadata(metadata);
  assert.equal(release.version, '1.26.52'); assert.equal(release.buildVersion, '1.26.52.3');
});
test('version comparisons are numeric and preserve future project targets', () => {
  assert.equal(releases.compareVersions('1.26.9', '1.26.10'), -1);
  assert.equal(releases.compareVersions('1.26.70', '1.26.52'), 1);
  assert.equal(releases.compareVersions('1.26.52', '1.26.52'), 0);
});
test('incomplete, untrusted and prerelease download metadata cannot trigger an upgrade', () => {
  for (const data of [{}, { result: { links: metadata.result.links.slice(0, 1) } }, { result: { links: [{ downloadType: 'serverBedrockWindows', downloadUrl: 'https://example.com/bedrock-server-1.99.0.1.zip' }] } }, { result: { links: [{ downloadType: 'serverBedrockWindows', downloadUrl: metadata.result.links[0].downloadUrl }] } }]) assert.throws(() => releases.parseReleaseMetadata(data));
});
test('only small public metadata is requested; no server zip is downloaded', async () => {
  const calls = [];
  const release = await releases.getCurrentRelease({ fetchImpl: async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => metadata }; } });
  assert.equal(calls.length, 1); assert.equal(calls[0].url, releases.METADATA_URL); assert.ok(calls[0].options.signal);
  assert.equal(release.version, '1.26.52');
});
test('HTTP failures and malformed responses fail without inventing a version', async () => {
  await assert.rejects(releases.getCurrentRelease({ fetchImpl: async () => ({ ok: false, status: 503 }) }), /HTTP 503/);
  await assert.rejects(releases.getCurrentRelease({ fetchImpl: async () => ({ ok: true, json: async () => { throw new Error('Invalid JSON'); } }) }), /Invalid JSON/);
});
test('release requests time out instead of hanging', async () => {
  await assert.rejects(releases.getCurrentRelease({ timeoutMs: 15, fetchImpl: async (_, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Timed out')), { once: true })) }), /Timed out/);
});

test('Preview engine metadata is selected independently from Release', async () => {
  assert.equal(releases.parseReleaseMetadata(metadata, 'preview').version, '1.26.70');
  const preview = await releases.getCurrentRelease({ target: 'preview', fetchImpl: async () => ({ ok: true, json: async () => metadata }) });
  assert.equal(preview.buildVersion, '1.26.70.21');
  assert.throws(() => releases.parseReleaseMetadata({ result: { links: [{ downloadType: 'serverBedrockPreviewWindows', downloadUrl: metadata.result.links[1].downloadUrl }] } }, 'preview'));
});
