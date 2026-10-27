const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const data = require('../src/authoring-data.cjs'), u = require('../src/authoring-updates.cjs');
const config = { target: 'release', targetVersion: '1.26.50' };
function fixture(id = 'test-1', channel = 'stable') {
  const sources = [{ url: 'https://github.com/Mojang/bedrock-samples', revision: 'a'.repeat(40), license: 'MIT', attribution: 'Mojang', channel, available: true }];
  const snapshot = { dataFormatVersion: 1, id, channel, sources, files: structuredClone(data.bundled) };
  const bytes = Buffer.from(JSON.stringify(snapshot));
  const entry = { dataFormatVersion: 1, id, channel, generatedAt: '2026-10-27T00:00:00Z', extension: { min: '0.26.6', max: '0.26.99' }, minecraft: { min: '1.26.50', max: '1.26.50' }, sources, url: '', sha256: u.sha256(bytes), bytes: bytes.length };
  entry.url = u.artifactUrl(entry);
  return { snapshot, bytes, entry, manifest: { dataFormatVersion: 1, generatedAt: entry.generatedAt, channel, snapshots: [entry] } };
}
function transport(getFixture, state = {}) { return async (url, options) => {
  assert.equal(options.redirect, 'manual'); assert.equal(options.headers.Authorization, undefined);
  state.calls = (state.calls || 0) + 1;
  const f = getFixture(); return new Response(url.includes('/feeds/') ? JSON.stringify(f.manifest) : f.bytes, { status: 200 });
}; }
afterEach(() => data.apply());
test('manifest selects exact channel, extension and historical target coverage', () => {
  const f = fixture(); u.validateManifest(f.manifest, 'stable');
  assert.equal(u.select(f.manifest, config, '0.26.6').id, f.entry.id);
  assert.equal(u.select(f.manifest, { ...config, targetVersion: '1.21.0' }, '0.26.6'), undefined);
  assert.equal(u.select(f.manifest, config, '0.24.0'), undefined);
  assert.throws(() => u.validateManifest(f.manifest, 'preview'));
  const p = fixture('preview-1', 'preview'); p.entry.sources[0].available = false;
  assert.throws(() => u.validateManifest(p.manifest, 'preview'), /Preview/);
  f.entry.url = 'https://evil.example/snapshot.json'; assert.throws(() => u.validateManifest(f.manifest, 'stable'), /Untrusted/);
});
test('review fingerprints bind content, reference facts, notices and compatibility coverage', () => {
  const f = fixture(), before = u.reviewFingerprint(f.snapshot, f.entry);
  f.entry.id = 'new-transport-id'; assert.equal(u.reviewFingerprint(f.snapshot, f.entry), before);
  f.entry.minecraft.min = '1.21.0'; assert.notEqual(u.reviewFingerprint(f.snapshot, f.entry), before);
  f.entry.minecraft.min = '1.26.50'; f.snapshot.reference = { engine: '1.26.50' }; assert.notEqual(u.reviewFingerprint(f.snapshot, f.entry), before);
});
test('downloaded data rejects executables, paths, broken schemas and incompatible catalogs', () => {
  const f = fixture(); u.validateSnapshot(f.snapshot, f.entry);
  for (const name of ['../evil.json', 'src/parser.cjs', 'schemas/evil.json']) {
    const s = structuredClone(f.snapshot); s.files[name] = {}; assert.throws(() => u.validateSnapshot(s, f.entry));
  }
  const s = structuredClone(f.snapshot); s.files['schemas/block.schema.json'].$ref = 'https://evil.example/code';
  assert.throws(() => u.validateSnapshot(s, f.entry), /references/);
  s.files['schemas/block.schema.json'] = { type: 'bad' }; assert.throws(() => u.validateSnapshot(s, f.entry), /Invalid JSON schema/);
  const malformed = structuredClone(f.snapshot); malformed.files['src/molang-catalog.json'].entries[0].minArgs = 1e9;
  assert.throws(() => u.validateSnapshot(malformed, f.entry));
  assert.throws(() => u.safeJson(Buffer.from('{"__proto__":{}}')), /Unsafe/);
});
test('redirect trust and bounded streaming work without authentication', async () => {
  await assert.rejects(u.download(fixture().entry.url, 10, new AbortController().signal, async () => new Response(null, { status: 302, headers: { location: 'http://localhost/x' } })), /Untrusted/);
  await assert.rejects(u.download(fixture().entry.url, 2, new AbortController().signal, async () => new Response('oversized')), /size/);
});
test('atomic apply, offline restoration, failed checksum recovery, deduplication and rollback hold', async t => {
  const directory = await fs.mkdtemp(path.join(path.resolve('.test-temp'), 'bedrock-data-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  let f = fixture(); const state = {}; let applied = 0;
  const updater = new u.Updater(directory, { fetchImpl: transport(() => f, state), onApply: async () => applied++ });
  const before = data.get('schemas/block.schema.json').definitions.components.properties;
  const a = updater.check(config, { force: true }); assert.equal(a, updater.check(config, { force: true })); await a;
  assert.equal(updater.state.version, 'test-1', JSON.stringify(updater.state)); assert.equal(applied, 1); assert.equal(before, data.get('schemas/block.schema.json').definitions.components.properties);
  const calls = state.calls; await updater.check(config); assert.equal(state.calls, calls);
  data.apply(); const offline = new u.Updater(directory, { fetchImpl: async () => { throw Error('offline'); } }); await offline.activate(config); assert.equal(data.revision, 'test-1');
  f = fixture('test-2'); await updater.check(config, { force: true }); assert.equal(data.revision, 'test-2');
  f = fixture('test-3'); f.bytes = Buffer.from('corrupt'); await updater.check(config, { force: true }); assert.equal(data.revision, 'test-2'); assert.match(updater.state.error, /checksum|size/);
  await updater.rollback(config); assert.equal(data.revision, 'test-1');
  f = fixture('test-2'); await updater.check(config, { force: true }); assert.equal(data.revision, 'test-1'); assert.match(updater.state.error, /held/);
});
test('service refresh failure restores both disk pointer and in-memory data', async t => {
  const directory = await fs.mkdtemp(path.join(path.resolve('.test-temp'), 'bedrock-data-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  let f = fixture(); let fail = false;
  const updater = new u.Updater(directory, { fetchImpl: transport(() => f), onApply: async () => { if (fail) throw Error('editor failed'); } });
  await updater.check(config, { force: true }); fail = true; f = fixture('bad-activation'); await updater.check(config, { force: true });
  assert.equal(data.revision, 'test-1'); assert.match(updater.state.error, /editor failed/);
  assert.equal((await updater.read(config)).entry.id, 'test-1');
  fail = false; f = fixture('test-2'); await updater.check(config, { force: true });
  fail = true; await updater.rollback(config); assert.equal(data.revision, 'test-2'); assert.match(updater.state.error, /Rollback refresh failed/);
  assert.equal((await updater.read(config)).entry.id, 'test-2');
});
test('cancellation prevents a pending manifest from committing', async t => {
  const directory = await fs.mkdtemp(path.join(path.resolve('.test-temp'), 'bedrock-data-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const f = fixture(); let resolve;
  const updater = new u.Updater(directory, { fetchImpl: () => new Promise(r => { resolve = r; }) });
  const running = updater.check(config, { force: true });
  for(let i=0;!resolve&&i<100;i++) await new Promise(r => setTimeout(r, 5)); assert.ok(resolve,JSON.stringify(updater.state)); updater.cancel(); resolve(new Response(JSON.stringify(f.manifest))); await running;
  assert.equal(data.revision, 'bundled'); assert.equal((await updater.read(config)).entry, undefined);
});
test('separate window updaters cannot overlap writes to shared storage', async t => {
  const directory = await fs.mkdtemp(path.join(path.resolve('.test-temp'), 'bedrock-windows-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const f = fixture(); let respond;
  const first = new u.Updater(directory, { fetchImpl: url => url.includes('/feeds/') ? new Promise(resolve => { respond = resolve; }) : Promise.resolve(new Response(f.bytes)) });
  const second = new u.Updater(directory, { fetchImpl: () => { throw Error('Overlapping download'); } });
  const pending = first.check(config, { force: true });
  for (let i = 0; !respond && i < 200; i++) await new Promise(r => setTimeout(r, 5)); assert.ok(respond);
  await second.check(config, { force: true }); assert.match(second.state.error, /Another VS Code window/);
  respond(new Response(JSON.stringify(f.manifest))); await pending; assert.equal(data.revision, f.entry.id);
  assert.equal(await fs.stat(path.join(directory, 'update.lock')).catch(() => null), null);
});
test('Molang and format-version providers observe updated catalogs immediately', () => {
  const molang = require('../src/molang.cjs'), formats = require('../src/format-versions.cjs');
  const f = fixture(); f.snapshot.files['src/molang-catalog.json'].entries.push({ name: 'query.workbench_fixture', description: 'Updated data.' });
  f.snapshot.files['src/format-requirements.json'].components.entity['minecraft:workbench_fixture'] = { min: '1.26.50' };
  data.apply(f.snapshot, f.entry.id); assert.ok(molang.entries.some(e => e.name === 'query.workbench_fixture'));
  assert.equal(formats.supported('entity', 'minecraft:workbench_fixture', '1.21.0', '1.26.50'), false);
  data.apply(); assert.ok(!molang.entries.some(e => e.name === 'query.workbench_fixture'));
});
test('corrupt cache restores previous data and a different target selects bundled fallback', async t => {
  const directory = await fs.mkdtemp(path.join(path.resolve('.test-temp'), 'bedrock-data-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  let f = fixture(); const updater = new u.Updater(directory, { fetchImpl: transport(() => f) });
  await updater.check(config, { force: true }); f = fixture('test-2'); await updater.check(config, { force: true });
  await fs.writeFile(path.join(directory, f.entry.sha256 + '.json'), 'corrupt');
  await updater.activate(config); assert.equal(data.revision, 'test-1');
  await updater.activate({ ...config, targetVersion: '1.21.0' }); assert.equal(data.revision, 'bundled');
});
test('real service checks on open and timer, throttles, refreshes and cancels on disposal', async t => {
  const directory = await fs.mkdtemp(path.join(path.resolve('.test-temp'), 'bedrock-service-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const commands = new Map(), subscriptions = [], context = { globalStorageUri: { fsPath: directory }, subscriptions };
  const vscode = { workspace: { isTrusted: true, getConfiguration: () => ({ get: () => true }) }, commands: { registerCommand(name, fn) { commands.set(name, fn); return { dispose() {} }; } } };
  const project = { root: directory, config }; let refreshed = 0, now = Date.now();
  const service = require('../src/authoring-service.cjs').attach(vscode, context, () => project, { warn() {} }, async () => refreshed++, () => {});
  t.after(() => subscriptions.forEach(s => s.dispose()));
  const f = fixture(), state = {}; service.updater.fetchImpl = transport(() => f, state); service.updater.now = () => now;
  await service.open(); await service.updater.pending; assert.equal(refreshed, 1); const calls = state.calls;
  now += 1800000; await service.open(); assert.equal(state.calls, calls);
  now += 6 * 3600000; await service.open(); await service.updater.pending; assert.equal(state.calls, calls + 1);
  await commands.get('bedrock.refreshAuthoringData')(); assert.equal(state.calls, calls + 2);
  subscriptions.forEach(s => s.dispose()); assert.equal(service.updater.controller.signal.aborted, true);
});
module.exports = { fixture, transport };
