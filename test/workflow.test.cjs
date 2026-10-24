const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { randomUUID } = require('node:crypto');
const { unzipSync } = require('fflate');
const { PNG } = require('pngjs');
const core = require('../src/core.cjs');

async function harness(t, autoDeploy = false, releaseScenario = {}) {
  const base = path.resolve('.test-temp'); await fs.mkdir(base, { recursive: true });
  const root = await fs.mkdtemp(path.join(base, 'workflow-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const ids = { BP: randomUUID(), RP: randomUUID() };
  for (const [folder, type, other] of [['BP', 'data', 'RP'], ['RP', 'resources', 'BP']]) {
    await fs.mkdir(path.join(root, folder));
    await core.writeJson(path.join(root, folder, 'manifest.json'), { format_version: 2, header: { name: 'Workflow Pack', description: 'Test', uuid: ids[folder], version: [1, 0, 0], min_engine_version: [1, 21, 0] }, modules: [{ uuid: randomUUID(), type, version: [1, 0, 0] }], dependencies: [{ uuid: ids[other], version: [1, 0, 0] }, { module_name: '@minecraft/server', version: '2.0.0' }] });
  }
  const config = await core.initialize(root);
  config.name = 'Workflow Pack'; config.profiles.beta.title = 'Workflow Pack Beta'; config.profiles.stable.title = 'Workflow Pack';
  const destination = path.join(root, 'minecraft/com.mojang'); await fs.mkdir(destination, { recursive: true });
  config.build.autoDeploy = autoDeploy; config.build.destinations = { release: destination };
  if (releaseScenario.initialExperiments) config.experimentalGameplay = releaseScenario.initialExperiments;
  await core.writeJson(path.join(root, 'bedrock-project.json'), config);
  const commands = new Map(), inputs = [], prompts = [], errors = [], disposables = [], fileSelections = [], iconPrompts = [];
  const disposable = () => ({ dispose() {} });
  const information = [];
  let releaseCalls = 0, finishRelease;
  const releaseGate = releaseScenario.wait ? new Promise(resolve => { finishRelease = resolve; }) : Promise.resolve();
  const releaseApi = { ...require('../src/releases.cjs'), getCurrentRelease: async () => {
    releaseCalls++; await releaseGate;
    if (releaseScenario.error) throw new Error(releaseScenario.error);
    return { version: releaseScenario.version || '1.21.0', source: 'official release metadata (test fixture)' };
  } };
  const actualScripts = require('../src/scripts.cjs');
  const scriptApi = { ...actualScripts, inspect: async project => {
    if (releaseScenario.scriptError) throw new Error('Registry offline');
    if (!releaseScenario.scriptVersion) return [];
    return (await actualScripts.readDependencies(project)).map(entry => ({ ...entry, selected: { runtime: releaseScenario.scriptVersion, version: releaseScenario.scriptVersion } }));
  }, installTypings: async () => ({ stdout: 'Test typings installed' }) };
  const updates = { ...require('../src/experiment-updates.cjs'), load: async () => releaseScenario.experiments || null };
  let provider, quickPick, checkboxHandler;
  const uri = file => ({ scheme: 'file', fsPath: file, with(changes) { return { ...this, ...changes }; } });
  const vscode = {
    EventEmitter: class { event = () => disposable(); fire() {} dispose() {} },
    TreeItem: class { constructor(label) { this.label = label; } }, ThemeIcon: class {}, Range: class {}, Position: class {}, Diagnostic: class {},
    DiagnosticSeverity: { Error: 0 }, StatusBarAlignment: { Left: 0 },
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    TreeItemCheckboxState: { Unchecked: 0, Checked: 1 },
    Uri: { file: uri, joinPath: (base, relative) => uri(path.join(base.fsPath, relative)) },
    workspace: { workspaceFolders: [{ uri: uri(root) }], isTrusted: true, textDocuments: [], onDidChangeWorkspaceFolders: () => disposable(), createFileSystemWatcher: () => ({ dispose() {}, onDidCreate: () => disposable(), onDidChange: () => disposable(), onDidDelete: () => disposable() }) },
    languages: { createDiagnosticCollection: () => ({ clear() {}, get() { return []; }, set() {}, delete() {}, dispose() {} }) },
    window: {
      createOutputChannel: () => ({ info() {}, warn() {}, error() {}, dispose() {} }),
      createStatusBarItem: () => ({ show() {}, dispose() {} }),
      registerTreeDataProvider: (_, value) => { provider = value; return disposable(); },
      createTreeView: (_, options) => { provider = options.treeDataProvider; return { dispose() {}, onDidChangeCheckboxState: callback => { checkboxHandler = callback; return disposable(); } }; },
      showInputBox: async options => { prompts.push(options); return inputs.shift(); },
      showOpenDialog: async options => { iconPrompts.push(options); return fileSelections.shift(); },
      showQuickPick: async (items, options) => options?.canPickMany ? (releaseScenario.pickExperiments ? items.filter(item => releaseScenario.pickExperiments.includes(item.experimentId)) : undefined) : quickPick,
      showInformationMessage: async (message, ...actions) => { information.push({ message, actions }); return actions.includes('Update target') ? releaseScenario.choice : actions.includes('Update dependencies') ? releaseScenario.scriptChoice : actions.includes('Choose experiments') ? releaseScenario.experimentChoice : actions.includes('Remove retired requirements') ? releaseScenario.retirementChoice : undefined; },
      showErrorMessage: message => { errors.push(message); return Promise.resolve(undefined); }
    },
    commands: { registerCommand: (name, fn) => { commands.set(name, fn); return disposable(); }, executeCommand: async (name, ...args) => commands.get(name)?.(...args) }
  };
  const extensionFile = path.resolve('src/extension.cjs'), actualRequire = createRequire(extensionFile), module = { exports: {} };
  const factory = vm.runInNewContext(`(function(require, module, exports) { ${await fs.readFile(extensionFile, 'utf8')}\n})`, { console, process, setTimeout, clearTimeout }, { filename: extensionFile });
  factory(name => name === 'vscode' ? vscode : name === './releases.cjs' ? releaseApi : name === './scripts.cjs' ? scriptApi : name === './experiment-updates.cjs' ? updates : actualRequire(name), module, module.exports);
  module.exports.activate({ subscriptions: disposables, extensionUri: uri(path.dirname(path.dirname(extensionFile))) });
  t.after(() => disposables.forEach(d => d.dispose()));
  await commands.get('bedrock.refresh')();
  async function sidebar(node) {
    const result = [];
    for (const child of await provider.getChildren(node)) {
      result.push(child);
      if (child.collapsibleState) result.push(...await sidebar(child));
    }
    return result;
  }
  return { root, config, destination, inputs, prompts, errors, vscode, commands, fileSelections, iconPrompts, information, finishRelease, releaseCalls: () => releaseCalls, setQuickPick: choice => { quickPick = choice; }, sidebar, checkbox: (node, state) => checkboxHandler({ items: [[node, state]] }) };
}
async function assertVersion(root, version) {
  assert.deepEqual((await core.loadProject(root)).config.version, version);
  for (const folder of ['BP', 'RP']) {
    const manifest = await core.readJson(path.join(root, folder, 'manifest.json'));
    assert.deepEqual(manifest.header.version, version); assert.deepEqual(manifest.modules[0].version, version);
    assert.deepEqual(manifest.dependencies[0].version, version); assert.equal(manifest.dependencies[1].version, '2.0.0');
  }
}
test('Bump version synchronizes project, source manifests, modules and linked dependencies', async t => {
  const h = await harness(t); h.setQuickPick('patch');
  await h.commands.get('bedrock.version')();
  assert.deepEqual(h.errors, []); await assertVersion(h.root, [1, 0, 1]);
});
test('canceling stable deploy or export leaves source and destination unchanged', async t => {
  const h = await harness(t);
  await h.commands.get('bedrock.deployStable')(); await h.commands.get('bedrock.export')();
  assert.equal(h.prompts.length, 2); assert.deepEqual(h.errors, []); await assertVersion(h.root, [1, 0, 0]);
  assert.equal(await core.exists(path.join(h.root, '.bedrock')), false);
  assert.deepEqual(await fs.readdir(h.destination), []);
});
test('stable deploy prompts, installs regular packs and refreshes auto-deployed beta at the chosen version', async t => {
  const h = await harness(t, true); h.inputs.push('2.3.4');
  await h.commands.get('bedrock.deployStable')();
  assert.deepEqual(h.errors, []); assert.equal(h.prompts[0].value, '1.0.0');
  assert.ok(h.prompts[0].validateInput('2.bad.0')); assert.equal(h.prompts[0].validateInput('2.3.4'), undefined);
  await assertVersion(h.root, [2, 3, 4]);
  for (const [parent, name, identity] of [
    ['behavior_packs', 'Workflow Pack 2.3.4 BP', h.config.profiles.stable.identities.behavior.header],
    ['resource_packs', 'Workflow Pack 2.3.4 RP', h.config.profiles.stable.identities.resource.header],
    ['development_behavior_packs', 'Workflow Pack beta 2.3.4 BP', h.config.profiles.beta.identities.behavior.header],
    ['development_resource_packs', 'Workflow Pack beta 2.3.4 RP', h.config.profiles.beta.identities.resource.header]
  ]) assert.equal((await core.readJson(path.join(h.destination, parent, name, 'manifest.json'))).header.uuid, identity);
  const state = await core.readJson(path.join(h.root, '.bedrock/state.json'));
  assert.deepEqual(state.lastRelease.version, [2, 3, 4]); assert.equal(state.lastRelease.mode, 'deployStable');
  assert.equal(await core.exists(path.join(h.root, '.bedrock/exports')), false);
  assert.ok((await h.sidebar()).some(node => node.label === 'Deploy stable'));
});
test('stable export synchronizes manifests and rebuilds beta locally when auto-deploy is off', async t => {
  const h = await harness(t); h.inputs.push('1.5.0');
  await h.commands.get('bedrock.export')();
  assert.deepEqual(h.errors, []); await assertVersion(h.root, [1, 5, 0]);
  const archive = unzipSync(await fs.readFile(path.join(h.root, '.bedrock/exports/Workflow Pack 1.5.0.mcaddon')));
  assert.deepEqual(JSON.parse(Buffer.from(archive['Workflow Pack 1.5.0 BP/manifest.json']).toString()).header.version, [1, 5, 0]);
  const state = await core.readJson(path.join(h.root, '.bedrock/state.json'));
  assert.deepEqual((await core.readJson(path.join(state.betaDirectory, 'behavior/manifest.json'))).header.version, [1, 5, 0]);
  assert.deepEqual(await fs.readdir(h.destination), []);
});
test('failed export does not advance source versions or refresh beta', async t => {
  const h = await harness(t); h.inputs.push('2.0.0');
  await fs.mkdir(path.join(h.root, '.bedrock/exports'), { recursive: true });
  await fs.writeFile(path.join(h.root, '.bedrock/exports/Workflow Pack 2.0.0.mcaddon'), 'existing release');
  await h.commands.get('bedrock.export')();
  assert.ok(h.errors.some(error => error.includes('EEXIST'))); await assertVersion(h.root, [1, 0, 0]);
  assert.equal(await fs.readFile(path.join(h.root, '.bedrock/exports/Workflow Pack 2.0.0.mcaddon'), 'utf8'), 'existing release');
  assert.equal(await core.exists(path.join(h.root, '.bedrock/state.json')), false);
});
test('manual beta deploy prompts for a version; automatic startup deployment never prompts', async t => {
  const h = await harness(t, true); assert.equal(h.prompts.length, 0);
  h.inputs.push('1.1.0'); await h.commands.get('bedrock.deploy')();
  assert.equal(h.prompts.length, 1); assert.deepEqual(h.errors, []); await assertVersion(h.root, [1, 1, 0]);
  assert.ok(await core.exists(path.join(h.destination, 'development_behavior_packs/Workflow Pack beta 1.1.0 BP/manifest.json')));
});
test('unsaved manifest edits prevent version commands from overwriting editor content', async t => {
  const h = await harness(t); h.setQuickPick('patch');
  h.vscode.workspace.textDocuments.push({ isDirty: true, uri: { fsPath: path.join(h.root, 'BP/manifest.json') } });
  await h.commands.get('bedrock.version')();
  assert.ok(h.errors.some(error => error.includes('Save project settings and both pack manifests'))); await assertVersion(h.root, [1, 0, 0]);
});
test('sidebar BP/RP selectors copy the chosen icons, and cancellation leaves existing icons unchanged', async t => {
  const h = await harness(t);
  const source = path.join(h.root, 'selected-icon.png'), png = new PNG({ width: 1, height: 1 }); png.data.set([17, 120, 249, 111]);
  const bytes = PNG.sync.write(png); await fs.writeFile(source, bytes);
  for (const [command, folder] of [['bedrock.iconBP', 'BP'], ['bedrock.iconRP', 'RP']]) {
    h.fileSelections.push([{ scheme: 'file', fsPath: source }]); await h.commands.get(command)();
    assert.deepEqual(await fs.readFile(path.join(h.root, folder, 'pack_icon.png')), bytes);
    await h.commands.get(command)(); // Cancel the next selection.
    assert.deepEqual(await fs.readFile(path.join(h.root, folder, 'pack_icon.png')), bytes);
  }
  assert.deepEqual(h.errors, []);
  assert.equal(h.iconPrompts[0].filters['PNG images'][0], 'png');
  const sidebar = await h.sidebar();
  for (const label of ['BP pack icon', 'RP pack icon']) {
    const node = sidebar.find(item => item.label === label);
    assert.ok(node); assert.equal(node.description, 'pack_icon.png'); assert.equal(node.iconPath.scheme, 'file');
  }
  const settings = await core.readJson(path.join(h.root, 'bedrock-project.json'));
  assert.equal(settings.profiles.beta.icons, undefined); assert.equal(settings.profiles.stable.icons, undefined);
});
test('project icon follows BP with RP fallback, and same-path replacements invalidate thumbnails', async t => {
  const h = await harness(t);
  const png = new PNG({ width: 1, height: 1 }); png.data.set([20, 100, 230, 255]);
  await fs.writeFile(path.join(h.root, 'RP/pack_icon.png'), PNG.sync.write(png));
  let sidebar = await h.sidebar();
  assert.equal(sidebar[0].iconPath.fsPath, path.join(h.root, 'RP/pack_icon.png'));
  await fs.writeFile(path.join(h.root, 'BP/pack_icon.png'), PNG.sync.write(png));
  sidebar = await h.sidebar();
  const before = sidebar.find(node => node.label === 'BP pack icon').iconPath;
  assert.equal(sidebar[0].iconPath.fsPath, path.join(h.root, 'BP/pack_icon.png'));
  assert.equal(sidebar[0].iconPath.query, before.query);
  const iconFile = path.join(h.root, 'BP/pack_icon.png'), stat = await fs.stat(iconFile);
  png.data.set([230, 100, 20, 255]); await fs.writeFile(iconFile, PNG.sync.write(png));
  await fs.utimes(iconFile, stat.atime, stat.mtime);
  sidebar = await h.sidebar();
  const after = sidebar.find(node => node.label === 'BP pack icon').iconPath;
  assert.equal(after.fsPath, before.fsPath); assert.notEqual(after.query, before.query);
  assert.equal(sidebar[0].iconPath.query, after.query);
  await fs.rm(iconFile);
  assert.equal((await h.sidebar())[0].iconPath.fsPath, path.join(h.root, 'RP/pack_icon.png'));
});
test('project opening offers a newer release once; accepting changes only target and minimum engine versions', async t => {
  const h = await harness(t, false, { wait: true, version: '1.26.52', choice: 'Update target' });
  const check = h.commands.get('bedrock.checkTargetVersion')(); h.finishRelease(); await check;
  assert.equal(h.releaseCalls(), 1);
  assert.equal(h.information.filter(message => message.actions.includes('Update target')).length, 1);
  assert.equal((await core.loadProject(h.root)).config.targetVersion, '1.26.52');
  for (const pack of ['BP', 'RP']) assert.deepEqual((await core.readJson(path.join(h.root, pack, 'manifest.json'))).header.min_engine_version, [1, 26, 52]);
  await assertVersion(h.root, [1, 0, 0]);
  assert.deepEqual((await core.loadProject(h.root)).config.profiles, h.config.profiles);
  await h.commands.get('bedrock.refresh')(); await h.sidebar();
  assert.equal(h.releaseCalls(), 1); assert.deepEqual(h.errors, []);
});
test('declining a target update leaves files unchanged and ordinary refreshes do not repeat the prompt', async t => {
  const h = await harness(t, false, { wait: true, version: '1.26.52', choice: 'Not now' });
  const files = ['bedrock-project.json', 'BP/manifest.json', 'RP/manifest.json'].map(file => path.join(h.root, file));
  const originals = await Promise.all(files.map(file => fs.readFile(file, 'utf8')));
  const check = h.commands.get('bedrock.checkTargetVersion')(); h.finishRelease(); await check;
  await h.commands.get('bedrock.refresh')(); await h.commands.get('bedrock.refresh')();
  assert.deepEqual(await Promise.all(files.map(file => fs.readFile(file, 'utf8'))), originals);
  assert.equal(h.releaseCalls(), 1);
  await h.commands.get('bedrock.checkTargetVersion')(); assert.equal(h.releaseCalls(), 2);
});
test('a current or future target is never prompted to downgrade on project opening', async t => {
  for (const version of ['1.21.0', '1.20.99']) {
    const h = await harness(t, false, { wait: true, version, choice: 'Update target' });
    const check = h.commands.get('bedrock.checkTargetVersion')(); h.finishRelease(); await check;
    assert.equal(h.information.length, 0);
    assert.equal((await core.loadProject(h.root)).config.targetVersion, '1.21.0');
  }
});
test('an offline automatic release check is quiet and leaves the target unchanged', async t => {
  const h = await harness(t, false, { wait: true, error: 'Network unavailable' });
  const check = h.commands.get('bedrock.checkTargetVersion')(); h.finishRelease(); await check;
  assert.deepEqual(h.errors, []); assert.equal(h.information.length, 0);
  assert.equal((await core.loadProject(h.root)).config.targetVersion, '1.21.0');
});
test('an unanswered target prompt does not block builds', async t => {
  let answer;
  const h = await harness(t, false, { wait: true, version: '1.26.52', choice: new Promise(resolve => { answer = resolve; }) });
  const check = h.commands.get('bedrock.checkTargetVersion')(); h.finishRelease();
  await h.commands.get('bedrock.build')();
  assert.ok(await core.exists(path.join(h.root, '.bedrock/state.json')));
  assert.equal((await core.loadProject(h.root)).config.targetVersion, '1.21.0');
  answer(undefined); await check;
  assert.equal((await core.loadProject(h.root)).config.targetVersion, '1.21.0');
});
test('unsaved manifests prevent an approved target update from overwriting edits', async t => {
  const h = await harness(t, false, { wait: true, version: '1.26.52', choice: 'Update target' });
  h.vscode.workspace.textDocuments.push({ isDirty: true, uri: { fsPath: path.join(h.root, 'BP/manifest.json') } });
  const check = h.commands.get('bedrock.checkTargetVersion')(); h.finishRelease(); await check;
  assert.equal((await core.loadProject(h.root)).config.targetVersion, '1.21.0');
  assert.ok(h.errors.some(error => error.includes('Save project settings and both pack manifests')));
});

test('script version check asks before synchronizing both manifests and does not bump pack versions', async t => {
  const h = await harness(t, false, { scriptVersion: '2.2.0', scriptChoice: 'Update dependencies' });
  await h.commands.get('bedrock.checkScriptVersions')();
  for (const folder of ['BP', 'RP']) {
    const manifest = await core.readJson(path.join(h.root, folder, 'manifest.json'));
    assert.equal(manifest.dependencies[1].version, '2.2.0');
    assert.deepEqual(manifest.header.version, [1, 0, 0]);
  }
  assert.ok(h.information.some(v => v.message.includes('typings 2.2.0')));
});
test('declining script updates and an offline registry leave manifests intact', async t => {
  const h = await harness(t, false, { scriptVersion: '2.2.0' });
  await h.commands.get('bedrock.checkScriptVersions')(); await assertVersion(h.root, [1, 0, 0]);
  const offline = await harness(t, false, { scriptError: true });
  await offline.commands.get('bedrock.checkScriptVersions')(); await assertVersion(offline.root, [1, 0, 0]);
});
test('Beta Script APIs and world experiment toggles persist the same setting and appear in sidebar', async t => {
  const h = await harness(t);
  await h.commands.get('bedrock.betaScripts')();
  assert.equal((await core.loadProject(h.root)).config.experimentalGameplay.betaApis, true);
  await h.commands.get('bedrock.experiment')('betaApis');
  assert.equal((await core.loadProject(h.root)).config.experimentalGameplay.betaApis, false);
  await h.commands.get('bedrock.experiment')('upcomingCreatorFeatures');
  assert.equal((await core.loadProject(h.root)).config.experimentalGameplay.upcomingCreatorFeatures, true);
  const sidebar = await h.sidebar();
  assert.ok(sidebar.some(v => v.label === 'Beta Script APIs' && v.description === 'Off'));
  assert.ok(sidebar.some(v => v.label === 'Upcoming Creator Features' && v.description === 'On'));
});

const experimentSnapshot = { formatVersion: 1, revision: 123, latestRelease: '1.21.0', definitions: [
  { id: 'betaApis', label: 'Beta APIs', source: 'https://minecraft.wiki/w/Experiments' },
  { id: 'upcomingCreatorFeatures', label: 'Upcoming Creator Features', source: 'https://minecraft.wiki/w/Experiments' },
  { id: 'newExperiment', label: 'New Test Experiment', source: 'https://minecraft.wiki/w/Experiments' }
], removed: [{ id: 'retiredExperiment', label: 'Retired Experiment' }], events: [] };
test('experiment sidebar checkboxes persist explicit On and Off states', async t => {
  const h = await harness(t);
  let node = (await h.sidebar()).find(item => item.experimentId === 'upcomingCreatorFeatures');
  assert.equal(node.checkboxState, 0);
  await h.checkbox(node, 1);
  assert.equal((await core.loadProject(h.root)).config.experimentalGameplay.upcomingCreatorFeatures, true);
  node = (await h.sidebar()).find(item => item.experimentId === 'upcomingCreatorFeatures'); assert.equal(node.checkboxState, 1);
  await h.checkbox(node, 0);
  assert.equal((await core.loadProject(h.root)).config.experimentalGameplay.upcomingCreatorFeatures, false);
});
test('new experiment prompt enables only selected entries and remembers the review', async t => {
  const h = await harness(t, false, { experiments: experimentSnapshot, experimentChoice: 'Choose experiments', pickExperiments: ['newExperiment'] });
  await h.commands.get('bedrock.checkExperiments')();
  const settings = (await core.loadProject(h.root)).config.experimentalGameplay;
  assert.equal(settings.newExperiment, true); assert.equal(settings.betaApis, undefined);
  const count = h.information.filter(m => m.actions.includes('Choose experiments')).length;
  await h.commands.get('bedrock.checkExperiments')();
  assert.equal(h.information.filter(m => m.actions.includes('Choose experiments')).length, count);
});
test('keeping new experiments disabled remembers the decision without editing settings', async t => {
  const h = await harness(t, false, { experiments: experimentSnapshot, experimentChoice: 'Keep disabled' });
  await h.commands.get('bedrock.checkExperiments')();
  assert.equal((await core.loadProject(h.root)).config.experimentalGameplay, undefined);
  const state = await core.readJson(path.join(h.root, '.bedrock/experiments/state.json'));
  assert.ok(state.reviewed.includes('newExperiment'));
});
test('retired requirements have no checkbox and can be explicitly cleaned up', async t => {
  const h = await harness(t, false, { experiments: experimentSnapshot, initialExperiments: { retiredExperiment: true }, retirementChoice: 'Keep saved requirements', experimentChoice: 'Keep disabled' });
  await h.commands.get('bedrock.checkExperiments')();
  const retired = (await h.sidebar()).find(item => item.experimentId === 'retiredExperiment');
  assert.equal(retired.checkboxState, undefined); assert.equal(retired.command, undefined);
  assert.match(retired.description, /Removed/);
  assert.equal((await core.loadProject(h.root)).config.experimentalGameplay.retiredExperiment, true);
  const cleanup = await harness(t, false, { experiments: experimentSnapshot, initialExperiments: { retiredExperiment: true }, retirementChoice: 'Remove retired requirements', experimentChoice: 'Keep disabled' });
  await cleanup.commands.get('bedrock.checkExperiments')();
  assert.equal((await core.loadProject(cleanup.root)).config.experimentalGameplay.retiredExperiment, undefined);
});

test('Validate project produces a saved report without changing pack manifests or deploying', async t => {
  const h = await harness(t);
  const file = path.join(h.root, 'BP/manifest.json'), before = await fs.readFile(file, 'utf8');
  await h.commands.get('bedrock.validate')();
  const report = await core.readJson(path.join(h.root, '.bedrock/validation-report.json'));
  assert.equal(report.files, 2); assert.equal(report.schemaVersion, null);
  assert.equal(await fs.readFile(file, 'utf8'), before); assert.deepEqual(h.errors, []);
});
