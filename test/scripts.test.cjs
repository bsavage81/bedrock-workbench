const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const core = require('../src/core.cjs');
const scripts = require('../src/scripts.cjs');
const experiments = require('../src/experiments.cjs');
const versions = { versions: Object.fromEntries(['2.0.0', '2.10.0', '2.10.0-rc.1.26.50-preview.20', '2.11.0-beta.1.26.50-stable', '2.11.0-beta.1.26.52-stable', '2.12.0-rc.1.26.70-preview.21', '2.13.0-beta.1.26.70-preview.20', '2.13.0-beta.1.26.70-preview.21', '9.0.0-internal.1'].map(v => [v, {}])) };
const config = (target = 'release', betaApis = false, targetVersion = '1.26.52') => ({ target, targetVersion, experimentalGameplay: { betaApis } });
test('Release regular APIs exclude Preview, beta and internal variants', () => {
  const selected = scripts.selectVersion(versions, config(), '2.0.0');
  assert.equal(selected.runtime, '2.10.0'); assert.equal(selected.version, '2.10.0');
});
test('beta API selection distinguishes Release and Preview and selects latest matching build', () => {
  assert.equal(scripts.selectVersion(versions, config('release', true), '2.0.0').version, '2.11.0-beta.1.26.52-stable');
  assert.equal(scripts.selectVersion(versions, config('preview', true, '1.26.70'), '2.0.0').version, '2.13.0-beta.1.26.70-preview.21');
  assert.equal(scripts.selectVersion(versions, config('preview', false, '1.26.70'), '2.0.0').runtime, '2.12.0');
});
test('typings map rc to regular manifest versions, beta to beta versions, and respect engine caps', () => {
  assert.equal(scripts.variant('2.12.0-rc.1.26.70-preview.21').runtime, '2.12.0');
  assert.equal(scripts.variant('2.13.0-beta.1.26.70-preview.21').runtime, '2.13.0-beta');
  assert.equal(scripts.selectVersion(versions, config('release', false, '1.26.40'), '2.0.0').runtime, '2.0.0');
  assert.equal(scripts.selectVersion(versions, config(), '2.0.0', true).runtime, '2.0.0');
  assert.equal(scripts.selectVersion(versions, config(), '3.0.0', true), undefined);
});
test('modules without beta variants retain stable versions when beta APIs are enabled', () => {
  assert.equal(scripts.selectVersion({ versions: { '1.3.0': {} } }, config('preview', true, '1.26.70')).runtime, '1.3.0');
});
test('experiment catalog follows channel and target and retains previously saved requirements', () => {
  assert.ok(experiments.available(config()).some(e => e.id === 'worldClocks'));
  assert.ok(!experiments.available(config()).some(e => e.id === 'renderDragon'));
  assert.ok(!experiments.available(config('preview', false, '1.26.70')).some(e => e.id === 'worldClocks'));
  assert.ok(experiments.available(config('preview', false, '1.26.70')).some(e => e.id === 'netherSpawning'));
  assert.ok(experiments.available({ ...config(), experimentalGameplay: { customSetting: true } }).some(e => e.id === 'customSetting' && e.legacy));
});
async function fixture(t) {
  const base = path.resolve('.test-temp'); await fs.mkdir(base, { recursive: true });
  const root = await fs.mkdtemp(path.join(base, 'scripts-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const [folder, type] of [['BP', 'data'], ['RP', 'resources']]) {
    await fs.mkdir(path.join(root, folder));
    await core.writeJson(path.join(root, folder, 'manifest.json'), { format_version: 2, header: { name: 'Scripts', description: 'Test', uuid: randomUUID(), version: [1, 0, 0], min_engine_version: [1, 26, 52] }, modules: [{ type, uuid: randomUUID(), version: [1, 0, 0] }], dependencies: [{ module_name: '@minecraft/server', version: '2.0.0' }] });
  }
  await core.initialize(root); return core.loadProject(root);
}
test('script checks read declared dependencies and approval updates both manifests only', async t => {
  const project = await fixture(t), configuration = await fs.readFile(path.join(project.root, 'bedrock-project.json'), 'utf8');
  const plan = await scripts.inspect(project, { fetchImpl: async () => ({ ok: true, json: async () => versions }) });
  assert.equal(plan.length, 2);
  await scripts.apply(project, plan);
  for (const kind of ['behavior', 'resource']) {
    const manifest = await core.readJson(path.join(project.packs[kind], 'manifest.json'));
    assert.equal(manifest.dependencies[0].version, '2.10.0'); assert.deepEqual(manifest.header.version, [1, 0, 0]);
  }
  assert.equal(await fs.readFile(path.join(project.root, 'bedrock-project.json'), 'utf8'), configuration);
});
test('stale settings or manifests invalidate a pending script update', async t => {
  const project = await fixture(t), plan = await scripts.inspect(project, { fetchImpl: async () => ({ ok: true, json: async () => versions }) });
  const file = path.join(project.packs.behavior, 'manifest.json'), manifest = await core.readJson(file); manifest.dependencies[0].version = '2.5.0'; await core.writeJson(file, manifest);
  await assert.rejects(scripts.apply(project, plan), /dependencies changed/);
  assert.equal((await core.readJson(path.join(project.packs.resource, 'manifest.json'))).dependencies[0].version, '2.0.0');
});
test('adding a module appends a valid manifest dependency without altering UUIDs', async t => {
  const project = await fixture(t), plan = await scripts.inspect(project, { add: '@minecraft/server-ui', fetchImpl: async () => ({ ok: true, json: async () => versions }) });
  await scripts.apply(project, plan.filter(e => e.index === -1));
  assert.deepEqual((await core.readJson(path.join(project.packs.behavior, 'manifest.json'))).dependencies[1], { module_name: '@minecraft/server-ui', version: '2.10.0' });
});

test('legacy experiment aliases normalize without overriding explicit new choices', () => {
  assert.deepEqual(experiments.normalize({ enableGameTestFramework: true, experimentalCreatorCameraFeatures: true }), { betaApis: true, creatorCameras: true });
  assert.deepEqual(experiments.normalize({ enableGameTestFramework: true, betaApis: false }), { betaApis: false });
});
test('typings installer uses exact package variants and disables lifecycle scripts', async t => {
  const project = await fixture(t);
  let called;
  const plan = [{ name: '@minecraft/server', current: '2.10.0', selected: { runtime: '2.10.0', version: '2.10.0' } }];
  await scripts.installTypings(project, plan, { execFileImpl: async (...args) => { called = args; return { stdout: 'ok' }; } });
  assert.equal(called[0], 'node'); assert.ok(called[1].includes('--ignore-scripts')); assert.ok(called[1].includes('@minecraft/server@2.10.0'));
  assert.equal(called[1][called[1].indexOf('--prefix') + 1], project.root);
  assert.ok(called[1].includes('--workspaces=false'));
  assert.equal(called[2].cwd, project.root); assert.equal(called[2].windowsHide, true);
});
test('published typings supersede an older RC for the same regular API version', () => {
  const data = { versions: { '1.3.0': {}, '1.3.0-rc.1.26.30-preview.26': {} } };
  assert.equal(scripts.selectVersion(data, config('preview', true, '1.26.70')).version, '1.3.0');
});
