const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PNG } = require('pngjs');
const { unzipSync } = require('fflate');
const core = require('../src/core.cjs');
const tempRoot = path.resolve(__dirname, '../.test-temp');

async function fixture(t) {
  await fs.mkdir(tempRoot, { recursive: true });
  const root = await fs.mkdtemp(path.join(tempRoot, 'bedrock-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const bp = randomUUID(), rp = randomUUID();
  const png = new PNG({ width: 1, height: 1 }); png.data.set([200, 60, 20, 128]);
  for (const [folder, uuid, type] of [['BP', bp, 'data'], ['RP', rp, 'resources']]) {
    await fs.mkdir(path.join(root, folder, 'scripts'), { recursive: true });
    await core.writeJson(path.join(root, folder, 'manifest.json'), { format_version: 2, header: { name: 'Original', description: 'Test', uuid, version: [1, 2, 3], min_engine_version: [1, 21, 0] }, modules: [{ uuid: randomUUID(), type, version: [1, 2, 3] }], dependencies: [{ uuid: folder === 'BP' ? rp : bp, version: [1, 2, 3] }] });
    await fs.writeFile(path.join(root, folder, 'pack_icon.png'), PNG.sync.write(png));
  }
  const config = await core.initialize(root);
  config.name = 'SavageCraft v2'; config.profiles.beta.title = 'SavageCraft v2 Beta'; config.profiles.stable.title = 'SavageCraft v2';
  await core.writeJson(path.join(root, 'bedrock-project.json'), config);
  return { root, config };
}
async function configWrite(root, config) { await core.writeJson(path.join(root, 'bedrock-project.json'), config); }

test('beta preserves version, rewrites all identities and dependencies, grayscales icon', async t => {
  const { root, config } = await fixture(t);
  const build = await core.compile(root);
  const bp = await core.readJson(path.join(build.directory, 'behavior/manifest.json'));
  assert.deepEqual(bp.header.version, [1, 2, 3]);
  assert.equal(bp.header.uuid, config.profiles.beta.identities.behavior.header);
  assert.equal(bp.modules[0].uuid, config.profiles.beta.identities.behavior.modules[0]);
  assert.equal(bp.dependencies[0].uuid, config.profiles.beta.identities.resource.header);
  assert.equal(bp.header.name, 'SavageCraft v2 beta 1.2.3 BP');
  const image = PNG.sync.read(await fs.readFile(path.join(build.directory, 'behavior/pack_icon.png')));
  assert.equal(image.data[0], image.data[1]); assert.equal(image.data[1], image.data[2]); assert.equal(image.data[3], 128);
  const again = await core.compile(root);
  assert.equal((await core.readJson(path.join(again.directory, 'behavior/manifest.json'))).header.uuid, bp.header.uuid);
  assert.deepEqual((await core.loadProject(root)).config.version, [1, 2, 3]);
});
test('stable mcaddon contains two packs and original colored icon; release cannot overwrite', async t => {
  const { root, config } = await fixture(t), build = await core.compile(root, 'stable');
  const file = await core.exportAddon(build), entries = unzipSync(await fs.readFile(file));
  assert.equal(path.basename(file), 'SavageCraft v2 1.2.3.mcaddon');
  const bp = JSON.parse(Buffer.from(entries['SavageCraft v2 1.2.3 BP/manifest.json']).toString());
  assert.equal(bp.header.uuid, config.profiles.stable.identities.behavior.header);
  assert.equal(bp.header.name, 'SavageCraft v2 1.2.3 BP');
  assert.ok(entries['SavageCraft v2 1.2.3 RP/manifest.json']);
  assert.deepEqual([...PNG.sync.read(Buffer.from(entries['SavageCraft v2 1.2.3 BP/pack_icon.png'])).data], [200, 60, 20, 128]);
  await assert.rejects(core.exportAddon(build), { code: 'EEXIST' });
});
test('TypeScript, static and dynamic relative imports compile; strings remain untouched', async t => {
  const { root } = await fixture(t);
  await fs.writeFile(path.join(root, 'BP/scripts/value.ts'), 'export const value: number = 42;');
  await fs.writeFile(path.join(root, 'BP/scripts/main.ts'), `import { world } from '@minecraft/server';\nimport { value } from './value.ts';\nconst text: string = "from './fake'";\nworld.sendMessage(text + value);\nexport const later = () => import('./value');`);
  const build = await core.compile(root);
  const text = await fs.readFile(path.join(build.directory, 'behavior/scripts/main.js'), 'utf8');
  assert.match(text, /@minecraft\/server/); assert.match(text, /\.\/value\.js/); assert.match(text, /from '\.\/fake'/); assert.doesNotMatch(text, /: string/);
  assert.ok(await core.exists(path.join(build.directory, 'behavior/scripts/value.js')));
});
test('colliding JS/TS output and missing script imports fail before publishing', async t => {
  const { root } = await fixture(t);
  await fs.writeFile(path.join(root, 'BP/scripts/main.js'), 'export const x=1;');
  await fs.writeFile(path.join(root, 'BP/scripts/main.ts'), 'export const x:number=1;');
  await assert.rejects(core.compile(root), /collision/);
  await fs.rm(path.join(root, 'BP/scripts/main.ts'));
  await fs.writeFile(path.join(root, 'BP/scripts/main.js'), `import './missing';`);
  await assert.rejects(core.compile(root), /missing or escaping/);
});
test('JSON comments, BOM and trailing commas normalize; malformed JSON fails', async t => {
  const { root } = await fixture(t);
  const file = path.join(root, 'BP/test.json');
  await fs.writeFile(file, '\uFEFF{ /* note */ "x": 1, }');
  const build = await core.compile(root);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(build.directory, 'behavior/test.json'))), { x: 1 });
  await fs.writeFile(file, '{broken');
  await assert.rejects(core.compile(root), /test.json/);
});
test('owned deployments replace stale files; unowned folders block both packs', async t => {
  const { root, config } = await fixture(t);
  const destination = path.join(root, 'fake-minecraft/com.mojang'); await fs.mkdir(destination, { recursive: true });
  await fs.writeFile(path.join(root, 'BP/old.txt'), 'old');
  let build = await core.compile(root), targets = await core.deploy(build, destination);
  assert.ok(await core.exists(path.join(targets[0], 'old.txt')));
  await fs.rm(path.join(root, 'BP/old.txt'));
  await fs.writeFile(path.join(root, 'BP/new.txt'), 'new');
  build = await core.compile(root); await core.deploy(build, destination);
  assert.equal(await core.exists(path.join(targets[0], 'old.txt')), false);
  await fs.writeFile(path.join(root, 'BP/new.txt'), 'changed');
  await fs.rm(path.join(targets[1], '.bedrock-owner.json'));
  build = await core.compile(root);
  await assert.rejects(core.deploy(build, destination), /unowned/);
  assert.equal(await fs.readFile(path.join(targets[0], 'new.txt'), 'utf8'), 'new');
  assert.equal(config.build.autoDeploy, false);
});
test('source, output and UUID configuration hazards are rejected', async t => {
  const { root, config } = await fixture(t);
  config.build.output = '../elsewhere'; await configWrite(root, config);
  await assert.rejects(core.loadProject(root), /settings/);
  config.build.output = '.bedrock/build'; config.packs.resource = 'BP/subfolder'; await configWrite(root, config);
  await assert.rejects(core.loadProject(root), /separate/);
  config.packs.resource = 'RP'; config.profiles.beta.identities.behavior.header = config.profiles.stable.identities.behavior.header; await configWrite(root, config);
  await assert.rejects(core.loadProject(root), /unique/);
});
test('symlinked output cannot redirect build writes', async t => {
  const { root } = await fixture(t);
  const elsewhere = await fs.mkdtemp(path.join(tempRoot, 'bedrock-outside-')); t.after(() => fs.rm(elsewhere, { recursive: true, force: true }));
  try { await fs.symlink(elsewhere, path.join(root, '.bedrock'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (error.code === 'EPERM') { t.skip('Windows junction creation requires an unrestricted test process'); return; } throw error; }
  await assert.rejects(core.compile(root), /Links/);
  assert.deepEqual(await fs.readdir(elsewhere), []);
});
test('legacy beta-only icons are removed; beta always grayscales the source pack icon', async t => {
  const { root, config } = await fixture(t);
  config.profiles.beta.icons = { behavior: 'unused-beta.png' }; await configWrite(root, config);
  const build = await core.compile(root);
  const pixels = PNG.sync.read(await fs.readFile(path.join(build.directory, 'behavior/pack_icon.png'))).data;
  assert.equal(pixels[0], pixels[1]); assert.equal(pixels[1], pixels[2]); assert.equal(pixels[3], 128);
  assert.deepEqual([...PNG.sync.read(await fs.readFile(path.join(root, 'BP/pack_icon.png'))).data], [200, 60, 20, 128]);
  assert.equal((await core.readJson(path.join(root, 'bedrock-project.json'))).profiles.beta.icons, undefined);
});
test('module changes require persisted identities instead of regenerating UUIDs', async t => {
  const { root } = await fixture(t);
  const file = path.join(root, 'BP/manifest.json'), manifest = await core.readJson(file);
  manifest.modules.push({ uuid: randomUUID(), type: 'script', version: [1, 2, 3], entry: 'scripts/main.js' });
  await core.writeJson(file, manifest); await assert.rejects(core.compile(root), /module count changed/);
});
test('Release and Preview resolve separately including legacy Windows folders', () => {
  const env = { APPDATA: 'C:/Roaming', LOCALAPPDATA: 'C:/Local' };
  assert.match(core.defaultDestinations('release', env)[0], /Minecraft Bedrock[\\/]users/);
  assert.match(core.defaultDestinations('preview', env)[0], /Minecraft Bedrock Preview/);
  assert.match(core.defaultDestinations('preview', env)[1], /MinecraftWindowsBeta/);
});
test('deployment restores both packs after a file update fails', async t => {
  const { root } = await fixture(t), destination = path.join(root, 'minecraft/com.mojang');
  await fs.mkdir(destination, { recursive: true });
  await fs.writeFile(path.join(root, 'BP/state.txt'), 'old');
  await fs.writeFile(path.join(root, 'RP/state.txt'), 'old resource');
  const original = await core.compile(root), targets = await core.deploy(original, destination);
  await fs.writeFile(path.join(root, 'BP/state.txt'), 'new');
  await fs.writeFile(path.join(root, 'RP/state.txt'), 'new resource');
  const next = await core.compile(root), copyFile = fs.copyFile;
  fs.copyFile = async (from, to, ...args) => {
    if (from.includes(path.sep + 'next' + path.sep) && to === path.join(targets[1], 'state.txt')) {
      const error = new Error('Simulated locked resource file'); error.code = 'EPERM'; throw error;
    }
    return copyFile(from, to, ...args);
  };
  try { await assert.rejects(core.deploy(next, destination), /Simulated locked/); }
  finally { fs.copyFile = copyFile; }
  assert.equal(await fs.readFile(path.join(targets[0], 'state.txt'), 'utf8'), 'old');
  assert.equal(await fs.readFile(path.join(targets[1], 'state.txt'), 'utf8'), 'old resource');
  assert.ok(await core.exists(path.join(targets[1], 'manifest.json')));
});
test('deployment succeeds when Windows refuses to rename the deployed pack root', async t => {
  const { root } = await fixture(t), destination = path.join(root, 'minecraft/com.mojang');
  await fs.mkdir(destination, { recursive: true });
  await fs.writeFile(path.join(root, 'BP/state.txt'), 'old');
  const first = await core.compile(root), targets = await core.deploy(first, destination);
  await fs.writeFile(path.join(root, 'BP/state.txt'), 'new');
  const next = await core.compile(root), rename = fs.rename;
  let rootRenameAttempts = 0;
  fs.rename = async (from, to) => {
    if (targets.includes(from)) { rootRenameAttempts++; const error = new Error('Directory is held open'); error.code = 'EPERM'; throw error; }
    return rename(from, to);
  };
  try { await core.deploy(next, destination); }
  finally { fs.rename = rename; }
  assert.equal(rootRenameAttempts, 0);
  assert.equal(await fs.readFile(path.join(targets[0], 'state.txt'), 'utf8'), 'new');
});
test('unchanged files are not rewritten; temporarily locked writes are retried', async t => {
  const { root } = await fixture(t), destination = path.join(root, 'minecraft/com.mojang');
  await fs.mkdir(destination, { recursive: true });
  await fs.writeFile(path.join(root, 'BP/state.txt'), 'old');
  const first = await core.compile(root), targets = await core.deploy(first, destination);
  await fs.writeFile(path.join(root, 'BP/state.txt'), 'new');
  const next = await core.compile(root), copyFile = fs.copyFile;
  let attempts = 0;
  fs.copyFile = async (from, to, ...args) => {
    if (to === path.join(targets[0], 'manifest.json')) throw new Error('Unchanged manifest must not be touched');
    if (to === path.join(targets[0], 'state.txt') && attempts++ === 0) { const error = new Error('Temporary file lock'); error.code = 'EBUSY'; throw error; }
    return copyFile(from, to, ...args);
  };
  try { await core.deploy(next, destination); }
  finally { fs.copyFile = copyFile; }
  assert.equal(attempts, 2);
  assert.equal(await fs.readFile(path.join(targets[0], 'state.txt'), 'utf8'), 'new');
});
test('non-Minecraft bare package imports fail with an actionable message', async t => {
  const { root } = await fixture(t);
  await fs.writeFile(path.join(root, 'BP/scripts/main.js'), `import value from 'some-npm-package'; console.log(value);`);
  await assert.rejects(core.compile(root), /unsupported package import some-npm-package/);
});
test('failed recovery preserves prior files and journals instead of deleting backups', async t => {
  const { root } = await fixture(t), destination = path.join(root, 'minecraft/com.mojang');
  await fs.mkdir(destination, { recursive: true });
  for (const pack of ['BP', 'RP']) await fs.writeFile(path.join(root, pack, 'state.txt'), 'old');
  const first = await core.compile(root), targets = await core.deploy(first, destination);
  for (const pack of ['BP', 'RP']) await fs.writeFile(path.join(root, pack, 'state.txt'), 'new');
  const next = await core.compile(root), copyFile = fs.copyFile;
  fs.copyFile = async (from, to, ...args) => {
    if (to === path.join(targets[1], 'state.txt') && from.includes(path.sep + 'next' + path.sep)) throw new Error('Simulated write failure');
    if (to === path.join(targets[0], 'state.txt') && from.includes(path.sep + 'previous' + path.sep)) throw new Error('Simulated recovery failure');
    return copyFile(from, to, ...args);
  };
  try { await assert.rejects(core.deploy(next, destination), /Recovery could not restore every file.*[\s\S]*Previous files and journals are preserved/); }
  finally { fs.copyFile = copyFile; }
  const parent = path.dirname(targets[0]);
  const backups = (await fs.readdir(parent)).filter(name => name.startsWith('.bedrock-stage-'));
  assert.equal(backups.length, 1);
  assert.equal(await fs.readFile(path.join(parent, backups[0], 'previous/state.txt'), 'utf8'), 'old');
  assert.ok(await core.exists(path.join(parent, backups[0], 'journal.json')));
});
test('stale files can change between a file and directory without replacing pack roots', async t => {
  const { root } = await fixture(t), destination = path.join(root, 'minecraft/com.mojang');
  await fs.mkdir(destination, { recursive: true });
  await fs.writeFile(path.join(root, 'BP/shape'), 'file');
  const first = await core.compile(root), targets = await core.deploy(first, destination);
  await fs.rm(path.join(root, 'BP/shape')); await fs.mkdir(path.join(root, 'BP/shape'));
  await fs.writeFile(path.join(root, 'BP/shape/nested.txt'), 'nested');
  await core.deploy(await core.compile(root), destination);
  assert.equal(await fs.readFile(path.join(targets[0], 'shape/nested.txt'), 'utf8'), 'nested');
  await fs.rm(path.join(root, 'BP/shape/nested.txt')); await fs.rmdir(path.join(root, 'BP/shape'));
  await fs.writeFile(path.join(root, 'BP/shape'), 'file again');
  await core.deploy(await core.compile(root), destination);
  assert.equal(await fs.readFile(path.join(targets[0], 'shape'), 'utf8'), 'file again');
});
test('human-readable deployment migrates owned UUID folders and removes older version folders', async t => {
  const { root, config } = await fixture(t), destination = path.join(root, 'minecraft/com.mojang');
  await fs.mkdir(destination, { recursive: true });
  const first = await core.compile(root), targets = await core.deploy(first, destination);
  assert.equal(path.basename(targets[0]), 'SavageCraft v2 beta 1.2.3 BP');
  assert.equal(path.basename(targets[1]), 'SavageCraft v2 beta 1.2.3 RP');
  const legacy = [];
  for (const [index, kind] of ['behavior', 'resource'].entries()) {
    const old = path.join(path.dirname(targets[index]), `bedrock-${config.profiles.beta.identities[kind].header}`);
    await fs.rename(targets[index], old); legacy.push(old);
  }
  const migrated = await core.deploy(await core.compile(root), destination);
  for (const old of legacy) assert.equal(await core.exists(old), false);
  for (const folder of migrated) assert.ok(await core.exists(path.join(folder, 'manifest.json')));
  config.version = [1, 2, 4]; await configWrite(root, config);
  const updated = await core.deploy(await core.compile(root), destination);
  assert.equal(path.basename(updated[0]), 'SavageCraft v2 beta 1.2.4 BP');
  for (const old of migrated) assert.equal(await core.exists(old), false);
  assert.equal((await core.readJson(path.join(updated[0], 'manifest.json'))).header.uuid, config.profiles.beta.identities.behavior.header);
});
test('a locked obsolete root keeps only its marker, with cleanup retried next deployment', async t => {
  const { root, config } = await fixture(t), destination = path.join(root, 'minecraft/com.mojang');
  await fs.mkdir(destination, { recursive: true });
  const targets = await core.deploy(await core.compile(root), destination);
  config.version = [1, 2, 4]; await configWrite(root, config);
  const build = await core.compile(root), rmdir = fs.rmdir;
  fs.rmdir = async (folder, ...args) => {
    if (folder === targets[0]) { const error = new Error('Root held open'); error.code = 'EPERM'; throw error; }
    return rmdir(folder, ...args);
  };
  try { await core.deploy(build, destination); }
  finally { fs.rmdir = rmdir; }
  assert.equal(await core.exists(path.join(targets[0], 'manifest.json')), false);
  assert.ok(await core.exists(path.join(targets[0], '.bedrock-owner.json')));
  assert.ok(build.warnings.some(warning => warning.includes('empty folder')));
  await core.deploy(await core.compile(root), destination);
  assert.equal(await core.exists(targets[0]), false);
});
test('migration failure restores old pack manifests and avoids duplicate valid packs', async t => {
  const { root, config } = await fixture(t), destination = path.join(root, 'minecraft/com.mojang');
  await fs.mkdir(destination, { recursive: true });
  const old = await core.deploy(await core.compile(root), destination);
  config.version = [1, 2, 4]; await configWrite(root, config);
  const build = await core.compile(root), copyFile = fs.copyFile;
  fs.copyFile = async (from, to, ...args) => {
    if (from.includes(path.sep + 'next' + path.sep) && to.endsWith(path.join('SavageCraft v2 beta 1.2.4 RP', 'manifest.json'))) throw new Error('Migration write failed');
    return copyFile(from, to, ...args);
  };
  try { await assert.rejects(core.deploy(build, destination), /Migration write failed/); }
  finally { fs.copyFile = copyFile; }
  for (const folder of old) assert.ok(await core.exists(path.join(folder, 'manifest.json')));
  for (const [index, suffix] of ['BP', 'RP'].entries()) assert.equal(await core.exists(path.join(path.dirname(old[index]), `SavageCraft v2 beta 1.2.4 ${suffix}`, 'manifest.json')), false);
});
test('a naming collision with an unowned folder does not remove the previous version', async t => {
  const { root, config } = await fixture(t), destination = path.join(root, 'minecraft/com.mojang');
  await fs.mkdir(destination, { recursive: true });
  const old = await core.deploy(await core.compile(root), destination);
  config.version = [1, 2, 4]; await configWrite(root, config);
  const collision = path.join(path.dirname(old[0]), 'SavageCraft v2 beta 1.2.4 BP');
  await fs.mkdir(collision); await fs.writeFile(path.join(collision, 'user.txt'), 'preserve');
  await assert.rejects(core.deploy(await core.compile(root), destination), /unowned/);
  assert.equal(await fs.readFile(path.join(collision, 'user.txt'), 'utf8'), 'preserve');
  for (const folder of old) assert.ok(await core.exists(path.join(folder, 'manifest.json')));
});
test('stable deployment writes normal pack folders with separate identities and preserves beta', async t => {
  const { root, config } = await fixture(t), destination = path.join(root, 'minecraft/com.mojang');
  await fs.mkdir(destination, { recursive: true });
  const beta = await core.deploy(await core.compile(root), destination);
  const stable = await core.deploy(await core.compile(root, 'stable'), destination);
  assert.equal(path.basename(path.dirname(stable[0])), 'behavior_packs');
  assert.equal(path.basename(path.dirname(stable[1])), 'resource_packs');
  assert.equal(path.basename(stable[0]), 'SavageCraft v2 1.2.3 BP');
  const manifest = await core.readJson(path.join(stable[0], 'manifest.json'));
  assert.equal(manifest.header.uuid, config.profiles.stable.identities.behavior.header);
  assert.equal(manifest.dependencies[0].uuid, config.profiles.stable.identities.resource.header);
  const marker = await core.readJson(path.join(stable[0], '.bedrock-owner.json')); assert.equal(marker.profile, 'stable');
  for (const folder of beta) assert.ok(await core.exists(path.join(folder, 'manifest.json')));
  assert.equal(await core.exists(path.join(root, config.build.exports)), false);
  config.version = [1, 2, 4]; await configWrite(root, config);
  const next = await core.deploy(await core.compile(root, 'stable'), destination);
  for (const folder of stable) assert.equal(await core.exists(folder), false);
  for (const folder of beta) assert.ok(await core.exists(path.join(folder, 'manifest.json')));
  assert.equal((await core.readJson(path.join(next[0], 'manifest.json'))).header.uuid, manifest.header.uuid);
});
test('stable deployment refuses duplicate imported pack UUIDs in unowned folders', async t => {
  const { root } = await fixture(t), destination = path.join(root, 'minecraft/com.mojang');
  const imported = path.join(destination, 'behavior_packs/imported'); await fs.mkdir(imported, { recursive: true });
  const build = await core.compile(root, 'stable');
  await fs.copyFile(path.join(build.directory, 'behavior/manifest.json'), path.join(imported, 'manifest.json'));
  await assert.rejects(core.deploy(build, destination), /imported stable pack/);
  assert.ok(await core.exists(path.join(imported, 'manifest.json')));
});
test('project version update changes source manifest modules and linked packs, preserving API versions, comments and UUIDs', async t => {
  const { root, config } = await fixture(t), bpFile = path.join(root, 'BP/manifest.json');
  const manifest = await core.readJson(bpFile);
  manifest.dependencies.push({ module_name: '@minecraft/server', version: '2.0.0' });
  manifest.dependencies.push({ uuid: randomUUID(), version: [7, 0, 0] });
  await fs.writeFile(bpFile, '\uFEFF// Keep my manifest comment\n' + JSON.stringify(manifest, null, 2));
  await core.setProjectVersion(root, '3.4.5');
  assert.deepEqual((await core.loadProject(root)).config.version, [3, 4, 5]);
  const updated = await core.readJson(bpFile);
  assert.deepEqual(updated.header.version, [3, 4, 5]); assert.deepEqual(updated.modules[0].version, [3, 4, 5]);
  assert.deepEqual(updated.dependencies[0].version, [3, 4, 5]); assert.equal(updated.dependencies[1].version, '2.0.0');
  assert.deepEqual(updated.dependencies[2].version, [7, 0, 0]); assert.equal(updated.header.uuid, manifest.header.uuid);
  assert.match(await fs.readFile(bpFile, 'utf8'), /Keep my manifest comment/);
  assert.ok((await fs.readFile(bpFile, 'utf8')).startsWith('\uFEFF'));
  const rp = await core.readJson(path.join(root, 'RP/manifest.json'));
  assert.deepEqual(rp.header.version, [3, 4, 5]); assert.deepEqual(rp.modules[0].version, [3, 4, 5]); assert.deepEqual(rp.dependencies[0].version, [3, 4, 5]);
  assert.deepEqual((await core.loadProject(root)).config.profiles, config.profiles);
});
test('source version transaction restores config and manifests when a write fails', async t => {
  const { root } = await fixture(t), files = ['bedrock-project.json', 'BP/manifest.json', 'RP/manifest.json'].map(f => path.join(root, f));
  const originals = await Promise.all(files.map(file => fs.readFile(file, 'utf8'))), rename = fs.rename;
  fs.rename = async (from, to) => { if (to === files[2]) throw new Error('Simulated manifest write failure'); return rename(from, to); };
  try { await assert.rejects(core.setProjectVersion(root, [4, 0, 0]), /Simulated manifest write failure/); }
  finally { fs.rename = rename; }
  assert.deepEqual(await Promise.all(files.map(file => fs.readFile(file, 'utf8'))), originals);
});
test('build can stage a selected release version without changing source versions', async t => {
  const { root } = await fixture(t);
  const build = await core.compile(root, 'stable', { version: [4, 5, 6] });
  assert.deepEqual((await core.readJson(path.join(build.directory, 'behavior/manifest.json'))).header.version, [4, 5, 6]);
  assert.deepEqual((await core.loadProject(root)).config.version, [1, 2, 3]);
  assert.deepEqual((await core.readJson(path.join(root, 'BP/manifest.json'))).header.version, [1, 2, 3]);
  for (const input of ['1.0', '1.-1.0', '65536.0.0', '1.2.3.4', [], [1, 0, -1], 'abc']) assert.throws(() => core.parseVersion(input), /three whole numbers/);
});
test('selected PNGs outside the project copy into the correct packs; stable stays colored and beta preserves alpha', async t => {
  const { root } = await fixture(t);
  const external = await fs.mkdtemp(path.join(tempRoot, 'icon-source-')); t.after(() => fs.rm(external, { recursive: true, force: true }));
  const expected = { behavior: [11, 180, 29, 90], resource: [210, 14, 77, 255] };
  for (const [kind, rgba] of Object.entries(expected)) {
    const png = new PNG({ width: 1, height: 1 }); png.data.set(rgba);
    const source = path.join(external, `${kind}.png`), bytes = PNG.sync.write(png); await fs.writeFile(source, bytes);
    const target = await core.copyPackIcon(root, kind, source);
    assert.equal(path.basename(target), 'pack_icon.png'); assert.deepEqual(await fs.readFile(target), bytes);
  }
  const beta = await core.compile(root), stable = await core.compile(root, 'stable');
  for (const [kind, rgba] of Object.entries(expected)) {
    const betaPixels = PNG.sync.read(await fs.readFile(path.join(beta.directory, kind, 'pack_icon.png'))).data;
    const stablePixels = PNG.sync.read(await fs.readFile(path.join(stable.directory, kind, 'pack_icon.png'))).data;
    assert.equal(betaPixels[0], betaPixels[1]); assert.equal(betaPixels[1], betaPixels[2]); assert.equal(betaPixels[3], rgba[3]);
    assert.deepEqual([...stablePixels], rgba);
    assert.deepEqual([...PNG.sync.read(await fs.readFile(path.join(root, kind === 'behavior' ? 'BP' : 'RP', 'pack_icon.png'))).data], rgba);
  }
});
test('invalid icon files cannot overwrite an existing pack icon', async t => {
  const { root } = await fixture(t), target = path.join(root, 'BP/pack_icon.png');
  const before = await fs.readFile(target), invalid = path.join(root, 'invalid.png'); await fs.writeFile(invalid, 'not an image');
  await assert.rejects(core.copyPackIcon(root, 'behavior', invalid), /valid PNG image/);
  assert.deepEqual(await fs.readFile(target), before);
});
test('legacy stable icon selections are copied to source packs before obsolete profile settings are removed', async t => {
  const { root, config } = await fixture(t), file = path.join(root, 'bedrock-project.json');
  const png = new PNG({ width: 1, height: 1 }); png.data.set([90, 200, 5, 255]);
  const data = PNG.sync.write(png); await fs.writeFile(path.join(root, 'branding.png'), data);
  config.profiles.stable.icons = { behavior: 'branding.png' }; config.profiles.beta.icons = { behavior: 'old-beta.png' };
  await configWrite(root, config); await core.migratePackIcons(root);
  assert.deepEqual(await fs.readFile(path.join(root, 'BP/pack_icon.png')), data);
  const updated = await core.readJson(file);
  assert.equal(updated.profiles.beta.icons, undefined); assert.equal(updated.profiles.stable.icons, undefined);
  assert.deepEqual(updated.profiles.stable.identities, config.profiles.stable.identities);
  await core.migratePackIcons(root); // Idempotent; no settings or image references are needed now.
});
