// Invoked by a separate VS Code Extension Development Host, not node --test.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vscode = require('vscode');
const { PNG } = require('pngjs');
const core = require('../src/core.cjs');
async function until(check, message) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 150)); }
  throw new Error(message);
}
async function run() {
  const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const extension = vscode.extensions.getExtension('bsavage81.bedrock-workbench');
  assert.ok(extension, 'Extension must be registered'); await extension.activate();
  await vscode.commands.executeCommand('workbench.view.extension.bedrock');
  const commands = await vscode.commands.getCommands(true);
  for (const name of ['build', 'deploy', 'deployStable', 'export', 'autoDeploy', 'target', 'version', 'settings', 'iconBP', 'iconRP', 'betaScripts', 'experiment', 'checkScriptVersions', 'addScriptDependency', 'installScriptTypings', 'checkExperiments', 'experimentReference']) assert.ok(commands.includes(`bedrock.${name}`));
  await vscode.commands.executeCommand('bedrock.build');
  const stateFile = path.join(root, '.bedrock/state.json');
  await until(() => core.exists(stateFile), 'Manual beta build did not finish');
  let state = await core.readJson(stateFile); assert.equal(state.betaBuild, 1);
  const config = (await core.loadProject(root)).config;
  const target = path.join(config.build.destinations.release, 'development_behavior_packs', core.buildName(config, 'beta', 'behavior'));
  await vscode.commands.executeCommand('bedrock.autoDeploy');
  await until(() => core.exists(path.join(target, 'manifest.json')), 'Initial deployment did not finish');
  const file = path.join(root, 'BP/watcher.json');
  await fs.writeFile(file, '{"value":1}');
  await until(async () => (await core.readJson(path.join(target, 'watcher.json')).catch(() => null))?.value === 1, 'Create event did not deploy');
  await fs.writeFile(file, '{"value":2}');
  await until(async () => (await core.readJson(path.join(target, 'watcher.json')).catch(() => null))?.value === 2, 'Change event did not deploy');
  // Saving an open document also triggers the same on-disk watcher.
  const doc = await vscode.workspace.openTextDocument(file), edit = new vscode.WorkspaceEdit();
  edit.replace(doc.uri, new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), '{"value":3}');
  assert.ok(await vscode.workspace.applyEdit(edit)); assert.ok(await doc.save());
  await until(async () => (await core.readJson(path.join(target, 'watcher.json')).catch(() => null))?.value === 3, 'Editor save did not deploy');
  await fs.rm(file);
  await until(async () => !(await core.exists(path.join(target, 'watcher.json'))), 'Delete event left a stale deployed file');
  const selectedIcon = path.join(root, 'selected.png'), png = new PNG({ width: 1, height: 1 }); png.data.set([12, 180, 240, 107]);
  await fs.writeFile(selectedIcon, PNG.sync.write(png));
  await core.copyPackIcon(root, 'behavior', selectedIcon);
  await until(async () => {
    try {
      const pixels = PNG.sync.read(await fs.readFile(path.join(target, 'pack_icon.png'))).data;
      return pixels[0] === pixels[1] && pixels[1] === pixels[2] && pixels[3] === 107;
    } catch { return false; }
  }, 'Selecting a source pack icon did not automatically deploy a grayscale beta icon');
  assert.deepEqual([...PNG.sync.read(await fs.readFile(path.join(root, 'BP/pack_icon.png'))).data], [12, 180, 240, 107]);
  await vscode.commands.executeCommand('bedrock.autoDeploy');
  const finalConfig = (await core.loadProject(root)).config;
  assert.equal(finalConfig.build.autoDeploy, false); assert.deepEqual(finalConfig.version, [1, 0, 0]);
  // Verify bundled manifest schema supplies completion through VS Code's JSON service.
  const uri = vscode.Uri.file(path.join(root, 'BP/manifest.json'));
  await fs.writeFile(uri.fsPath, '{"format_version": 2,\n  \n}');
  const manifestDoc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(manifestDoc);
  const jsonExtension = vscode.extensions.getExtension('vscode.json-language-features'); await jsonExtension.activate();
  await until(async () => {
    const completion = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', uri, new vscode.Position(1, 2));
    return completion?.items.some(item => String(typeof item.label === 'string' ? item.label : item.label.label).includes('header'));
  }, 'Bundled manifest schema did not provide header completion');
  await until(async () => vscode.languages.getDiagnostics(uri).some(d => d.message.toLowerCase().includes('header')), 'Manifest schema did not validate required fields');
  const blockUri = vscode.Uri.file(path.join(root, 'BP/blocks/reference.json'));
  await fs.mkdir(path.dirname(blockUri.fsPath), { recursive: true });
  await fs.writeFile(blockUri.fsPath, '{"format_version":"1.21.0","minecraft:block":{"description":{"identifier":"test:reference"},"components":{"minecraft:frictio":0.4}}}');
  const blockDoc = await vscode.workspace.openTextDocument(blockUri); await vscode.window.showTextDocument(blockDoc);
  const keyPosition = blockDoc.positionAt(blockDoc.getText().indexOf('minecraft:frictio') + 5);
  await until(async () => {
    const completion = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', blockUri, keyPosition);
    return completion?.items.some(item => item.label === 'minecraft:friction');
  }, 'Mojang component completion did not load');
  let fix;
  await until(async () => {
    const fixes = await vscode.commands.executeCommand('vscode.executeCodeActionProvider', blockUri, new vscode.Range(keyPosition, keyPosition));
    fix = fixes.find(action => action.title === 'Change to minecraft:friction');
    return !!fix?.edit;
  }, 'Component spelling quick fix missing');
  assert.ok(await vscode.workspace.applyEdit(fix.edit));
  await until(async () => {
    const hovers = await vscode.commands.executeCommand('vscode.executeHoverProvider', blockUri, keyPosition);
    assert.ok(hovers.length <= 1, 'Component documentation was duplicated by multiple hover providers');
    return hovers.some(hover => hover.contents.some(content => content.value?.includes('Controls block friction.')));
  }, 'Mojang schema documentation hover missing');
  assert.ok(await blockDoc.save());
  const badType = new vscode.WorkspaceEdit();
  const valueOffset = blockDoc.getText().indexOf('0.4');
  badType.replace(blockUri, new vscode.Range(blockDoc.positionAt(valueOffset), blockDoc.positionAt(valueOffset + 3)), '"invalid"');
  assert.ok(await vscode.workspace.applyEdit(badType));
  await until(async () => vscode.languages.getDiagnostics(blockUri).some(d => d.message.includes('number')), 'Generated Mojang schema did not validate documented component types');
  await vscode.commands.executeCommand('bedrock.experiment', 'upcomingCreatorFeatures');
  assert.equal((await core.loadProject(root)).config.experimentalGameplay.upcomingCreatorFeatures, true);
  await vscode.commands.executeCommand('bedrock.betaScripts');
  assert.equal((await core.loadProject(root)).config.experimentalGameplay.betaApis, true);
  await vscode.commands.executeCommand('bedrock.betaScripts');
  assert.equal((await core.loadProject(root)).config.experimentalGameplay.betaApis, false);
  const lootUri = vscode.Uri.file(path.join(root, 'BP/loot_tables/test.json'));
  await core.writeJson(lootUri.fsPath, { pools: 'invalid' });
  const lootDoc = await vscode.workspace.openTextDocument(lootUri); await vscode.window.showTextDocument(lootDoc);
  await until(async () => vscode.languages.getDiagnostics(lootUri).some(d => d.message.toLowerCase().includes('array')), 'Official loot table schema did not validate pools');
  const geometry = path.join(root, 'RP/models/entity/test.geo.json');
  await core.writeJson(geometry, { format_version: '1.12.0', 'minecraft:geometry': [{ description: { identifier: 'geometry.host_test', texture_width: 16, texture_height: 16 }, bones: [] }] });
  const clientUri = vscode.Uri.file(path.join(root, 'RP/entity/test.json'));
  await core.writeJson(clientUri.fsPath, { format_version: '1.10.0', 'minecraft:client_entity': { description: { identifier: 'test:host', geometry: { default: 'geometry.host_test' } } } });
  const clientDoc = await vscode.workspace.openTextDocument(clientUri); await vscode.window.showTextDocument(clientDoc);
  const geometryPosition = clientDoc.positionAt(clientDoc.getText().lastIndexOf('geometry.host_test') + 10);
  await until(async () => {
    const completion = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', clientUri, geometryPosition);
    return completion?.items.some(item => item.label === 'geometry.host_test' && item.detail?.startsWith('Project'));
  }, 'Project geometry reference completion did not load');
  const definitions = await vscode.commands.executeCommand('vscode.executeDefinitionProvider', clientUri, geometryPosition);
  assert.ok(definitions.some(definition => definition.uri?.fsPath.toLowerCase() === geometry.toLowerCase()), 'Project geometry definition navigation missing');
  const animationUri = vscode.Uri.file(path.join(root, 'RP/animations/test.json'));
  await core.writeJson(animationUri.fsPath, { format_version: '1.8.0', animations: { 'animation.host': { bones: { body: { rotation: ['math.sin(query.anim_time', 0, 0] } } } } });
  const animationDoc = await vscode.workspace.openTextDocument(animationUri); await vscode.window.showTextDocument(animationDoc);
  await until(async () => vscode.languages.getDiagnostics(animationUri).some(d => d.message.startsWith('Molang:')), 'Molang diagnostics missing');
  const molangPosition = animationDoc.positionAt(animationDoc.getText().indexOf('query.anim_time') + 'query.anim_'.length);
  const molangCompletions = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', animationUri, molangPosition);
  assert.ok(molangCompletions.items.some(item => item.label === 'query.anim_time' && item.detail === 'Mojang Molang reference'), 'Molang completion missing');
  await vscode.commands.executeCommand('bedrock.validate');
  const functionUri = vscode.Uri.file(path.join(root, 'BP/functions/editor.mcfunction'));
  await fs.mkdir(path.dirname(functionUri.fsPath), { recursive: true });
  await fs.writeFile(functionUri.fsPath, 'give @s minecraft:di');
  const functionDoc = await vscode.workspace.openTextDocument(functionUri); await vscode.window.showTextDocument(functionDoc);
  assert.equal(functionDoc.languageId, 'mcfunction');
  await until(async () => {
    const completion = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', functionUri, new vscode.Position(0, 20));
    return completion?.items.some(item => item.label === 'minecraft:diamond');
  }, 'Vanilla command completion missing');
  const signature = await vscode.commands.executeCommand('vscode.executeSignatureHelpProvider', functionUri, new vscode.Position(0, 8));
  assert.ok(signature?.signatures.some(item => item.label.startsWith('give ')), 'Command signature help missing');
  const recipeUri = vscode.Uri.file(path.join(root, 'BP/recipes/vanilla.json'));
  await core.writeJson(recipeUri.fsPath, { format_version: '1.20.0', 'minecraft:recipe_shapeless': { description: { identifier: 'test:recipe' }, tags: ['crafting_table'], ingredients: [{ item: 'minecraft:diamond' }], result: { item: 'minecraft:diamond' } } });
  const recipeDoc = await vscode.workspace.openTextDocument(recipeUri);
  const recipePosition = recipeDoc.positionAt(recipeDoc.getText().lastIndexOf('minecraft:diamond') + 12);
  const recipeCompletion = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', recipeUri, recipePosition);
  assert.ok(recipeCompletion?.items.some(item => item.label === 'minecraft:diamond' && item.detail?.startsWith('Minecraft')), 'Vanilla JSON value completion missing');
  await core.writeJson(path.join(root, 'BP/recipes/invalid.json'), { format_version: '1.20.10', 'minecraft:recipe_shapeless': { description: { identifier: 'test:invalid' }, ingredients: [{ item: 'minecraft:stone', count: 0 }], result: 'minecraft:diamond' } });
  const invalidRecipeUri = vscode.Uri.file(path.join(root, 'BP/recipes/invalid.json'));
  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(invalidRecipeUri));
  await until(async () => vscode.languages.getDiagnostics(invalidRecipeUri).some(d => /minimum|less than|below|greater|smaller|at least/i.test(d.message)), 'Authored recipe schema did not validate ingredient count').catch(error => { throw new Error(error.message + ': ' + JSON.stringify(vscode.languages.getDiagnostics(invalidRecipeUri).map(d => d.message))); });
  const atlasUri = vscode.Uri.file(path.join(root, 'RP/textures/item_texture.json'));
  await core.writeJson(atlasUri.fsPath, { texture_data: { bad: { textures: false } } });
  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(atlasUri));
  await until(async () => vscode.languages.getDiagnostics(atlasUri).some(d => /string|object|array/i.test(d.message)), 'Authored atlas schema did not validate texture entries');
  const soundsUri = vscode.Uri.file(path.join(root, 'RP/sounds/sound_definitions.json'));
  await core.writeJson(soundsUri.fsPath, { sound_definitions: { 'test.chime': { sounds: [{ name: 'sounds/test/chime', stream: 'wrong' }] } } });
  const soundsDoc = await vscode.workspace.openTextDocument(soundsUri);
  await vscode.window.showTextDocument(soundsDoc);
  await until(async () => vscode.languages.getDiagnostics(soundsUri).some(d => d.message.includes('boolean')), 'Authored sound schema did not validate playback settings');
  const streamPosition = soundsDoc.positionAt(soundsDoc.getText().indexOf('stream') + 3);
  const soundHover = await vscode.commands.executeCommand('vscode.executeHoverProvider', soundsUri, streamPosition);
  assert.ok(soundHover.some(h => h.contents.some(c => c.value?.includes('Stream this audio'))), 'Authored sound field hover missing');
  const tagUri = vscode.Uri.file(path.join(root, 'BP/recipes/furnace-tags.json'));
  await fs.writeFile(tagUri.fsPath, '{"format_version":"1.20.10","minecraft:recipe_furnace":{"description":{"identifier":"test:tags"},"input":"minecraft:stone","output":"minecraft:diamond","tags":[""]}}');
  const tagDoc = await vscode.workspace.openTextDocument(tagUri); await vscode.window.showTextDocument(tagDoc);
  const tagPosition = tagDoc.positionAt(tagDoc.getText().indexOf('[""') + 2);
  await until(async () => {
    const completion = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', tagUri, tagPosition);
    return ['furnace', 'blast_furnace', 'smoker', 'campfire', 'soul_campfire'].every(tag => completion?.items.some(item => String(item.label).replaceAll('"', '') === tag));
  }, 'Recipe station tags were not suggested inside an empty quoted string');
  const functionLootUri = vscode.Uri.file(path.join(root, 'BP/loot_tables/function-completion.json'));
  const lootStart = '{"pools":[{"entries":[{"type":"item","name":"minecraft:iron_sword","weight":6,"functions":[] }]}]}';
  await fs.writeFile(functionLootUri.fsPath, lootStart);
  let functionLootDoc = await vscode.workspace.openTextDocument(functionLootUri); await vscode.window.showTextDocument(functionLootDoc);
  await until(async () => {
    const completion = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', functionLootUri, functionLootDoc.positionAt(functionLootDoc.getText().indexOf('[]') + 1));
    return completion?.items.some(item => item.label === 'set_count' && String(item.insertText?.value || item.insertText).includes('function'));
  }, 'Loot function starter objects missing inside the empty functions array');
  async function setLootFunctions(value) {
    const edit = new vscode.WorkspaceEdit();
    edit.replace(functionLootUri, new vscode.Range(functionLootDoc.positionAt(0), functionLootDoc.positionAt(functionLootDoc.getText().length)), lootStart.replace('[]', JSON.stringify(value)));
    assert.ok(await vscode.workspace.applyEdit(edit));
  }
  await setLootFunctions([{ function: '' }]);
  await until(async () => {
    const position = functionLootDoc.positionAt(functionLootDoc.getText().indexOf('"function":""') + '"function":"'.length);
    const completion = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', functionLootUri, position);
    const labels = completion?.items.map(item => String(item.label).replaceAll('"', '')) || [];
    if (!labels.includes('enchant_with_levels')) return false;
    const normalized = labels.filter(label => /^(minecraft:)?(?:enchant_|set_|furnace_|exploration_|explosion_|fill_|looting_|random_)/.test(label)).map(label => label.replace(/^minecraft:/, ''));
    assert.equal(new Set(normalized).size, normalized.length, 'Loot function choices include duplicate namespaced aliases');
    return true;
  }, 'Loot function names missing inside a quoted function value');
  await setLootFunctions([{}]);
  await until(async () => {
    const position = functionLootDoc.positionAt(functionLootDoc.getText().indexOf('[{}]') + 2);
    const completion = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', functionLootUri, position);
    const labels = completion?.items.map(item => String(item.label).replaceAll('"', '')) || [];
    if (!labels.includes('function')) return false;
    assert.ok(!labels.includes('conditions'), 'A blank function object should not suggest conditions');
    return true;
  }, 'Blank loot function object did not offer its discriminator');
  await setLootFunctions([{ function: 'enchant_with_levels', '': 0 }]);
  await until(async () => {
    const position = functionLootDoc.positionAt(functionLootDoc.getText().indexOf('"":0') + 1);
    const completion = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', functionLootUri, position);
    return ['levels', 'treasure'].every(key => completion?.items.some(item => String(item.label).replaceAll('"', '') === key));
  }, 'Loot function parameters did not follow the selected function');
  const conditionUri = vscode.Uri.file(path.join(root, 'BP/loot_tables/condition-completion.json'));
  const entry = { type: 'item', name: 'minecraft:iron_sword', weight: 6 };
  const conditionContexts = [
    { pools: [{ entries: [{ ...entry, conditions: [] }] }] },
    { pools: [{ conditions: [], entries: [entry] }] },
    { pools: [{ entries: [{ ...entry, functions: [{ function: 'furnace_smelt', conditions: [] }] }] }] }
  ];
  await fs.writeFile(conditionUri.fsPath, JSON.stringify(conditionContexts[0]));
  const conditionDoc = await vscode.workspace.openTextDocument(conditionUri); await vscode.window.showTextDocument(conditionDoc);
  async function setConditionsDocument(data) {
    const edit = new vscode.WorkspaceEdit();
    edit.replace(conditionUri, new vscode.Range(conditionDoc.positionAt(0), conditionDoc.positionAt(conditionDoc.getText().length)), JSON.stringify(data));
    assert.ok(await vscode.workspace.applyEdit(edit));
  }
  for (const data of conditionContexts) {
    await setConditionsDocument(data);
    await until(async () => {
      const position = conditionDoc.positionAt(conditionDoc.getText().indexOf('[]') + 1);
      const completion = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', conditionUri, position);
      return completion?.items.some(item => item.label === 'random_chance' && String(item.insertText?.value || item.insertText).includes('condition'));
    }, 'Loot condition starters missing in a pool, entry, or function');
  }
  await setConditionsDocument({ pools: [{ entries: [{ ...entry, conditions: [{ condition: '' }] }] }] });
  await until(async () => {
    const position = conditionDoc.positionAt(conditionDoc.getText().indexOf('"condition":""') + '"condition":"'.length);
    const completion = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', conditionUri, position);
    return completion?.items.some(item => String(item.label).replaceAll('"', '') === 'match_tool');
  }, 'Loot condition names missing inside a quoted value');
  await setConditionsDocument({ pools: [{ entries: [{ ...entry, conditions: [{ condition: 'random_chance_with_looting', '': 0 }] }] }] });
  await until(async () => {
    const position = conditionDoc.positionAt(conditionDoc.getText().indexOf('"":0') + 1);
    const completion = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', conditionUri, position);
    return ['chance', 'looting_multiplier'].every(key => completion?.items.some(item => String(item.label).replaceAll('"', '') === key));
  }, 'Loot condition parameters did not follow the selected condition');
  // Exercise real typing/caret updates and the real completion providers. The
  // probe observes the automatic trigger command; ordinary native triggers are
  // disabled temporarily so they cannot produce a false positive.
  const editorSettings = vscode.workspace.getConfiguration('editor', conditionUri);
  const previousTriggers = editorSettings.inspect('suggestOnTriggerCharacters')?.workspaceFolderValue;
  await editorSettings.update('suggestOnTriggerCharacters', false, vscode.ConfigurationTarget.WorkspaceFolder);
  const automaticContext = { subscriptions: [] }; let automaticTriggers = 0;
  const probe = {
    window: vscode.window,
    workspace: { onDidChangeTextDocument: vscode.workspace.onDidChangeTextDocument, getConfiguration: (section, uri) => section === 'editor' ? { get: (name, fallback) => name === 'suggestOnTriggerCharacters' ? true : vscode.workspace.getConfiguration(section, uri).get(name, fallback) } : vscode.workspace.getConfiguration(section, uri) },
    commands: { executeCommand: async (name, ...args) => {
      if (name === 'editor.action.triggerSuggest') automaticTriggers++;
      return vscode.commands.executeCommand(name, ...args);
    } }
  };
  const coreProject = await core.loadProject(root);
  require('../src/auto-suggest.cjs').attach(probe, automaticContext, () => coreProject, { warn: message => console.error(message) });
  try {
    const typingCases = [
      ['{"pools":[{"entries":[{"functions":|}]}]}', '[', 'array'],
      ['{"pools":[{"entries":[{"functions":[{"function":"set_count","count":1},|]}]}]}', '{', 'object'],
      ['{"pools":[{"entries":[{"functions":[{"function":|}]}]}]}', '"', 'string']
    ];
    for (const [source, character, kind] of typingCases) {
      await vscode.commands.executeCommand('hideSuggestWidget');
      const edit = new vscode.WorkspaceEdit();
      edit.replace(conditionUri, new vscode.Range(conditionDoc.positionAt(0), conditionDoc.positionAt(conditionDoc.getText().length)), source.replace('|', ''));
      assert.ok(await vscode.workspace.applyEdit(edit));
      const editor = await vscode.window.showTextDocument(conditionDoc), position = conditionDoc.positionAt(source.indexOf('|'));
      editor.selection = new vscode.Selection(position, position);
      await new Promise(resolve => setTimeout(resolve, 120));
      const before = automaticTriggers;
      await vscode.commands.executeCommand('type', { text: character });
      await until(async () => automaticTriggers > before, `Empty ${kind} did not automatically trigger available suggestions`);
      assert.equal(require('../src/auto-suggest.cjs').emptyContext(conditionDoc.getText(), conditionDoc.offsetAt(editor.selection.active)), kind);
    }
    await vscode.commands.executeCommand('hideSuggestWidget');
    const nested = new vscode.WorkspaceEdit();
    const nestedSource = '{"pools":[{"entries":[{"functions":[|]}]}]}';
    nested.replace(conditionUri, new vscode.Range(conditionDoc.positionAt(0), conditionDoc.positionAt(conditionDoc.getText().length)), nestedSource.replace('|', ''));
    assert.ok(await vscode.workspace.applyEdit(nested));
    const nestedEditor = await vscode.window.showTextDocument(conditionDoc), nestedPosition = conditionDoc.positionAt(nestedSource.indexOf('|'));
    nestedEditor.selection = new vscode.Selection(nestedPosition, nestedPosition);
    await new Promise(resolve => setTimeout(resolve, 120));
    const beforeNested = automaticTriggers;
    await vscode.commands.executeCommand('type', { text: '[' });
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(automaticTriggers, beforeNested, 'An array nested directly inside another array triggered automatic suggestions');
  } finally {
    automaticContext.subscriptions.forEach(subscription => subscription.dispose());
    await editorSettings.update('suggestOnTriggerCharacters', previousTriggers, vscode.ConfigurationTarget.WorkspaceFolder);
    await vscode.commands.executeCommand('hideSuggestWidget');
  }
  const validationReport = await core.readJson(path.join(root, '.bedrock/validation-report.json'));
  assert.ok(validationReport.files >= 6); assert.equal(validationReport.schemaVersion, '1.26.50');
  state = await core.readJson(stateFile);
  const result = { activated: true, commands: true, manualBuild: true, automaticCreateChangeSaveDelete: true, automaticIconCompilation: true, versionUnchanged: true, betaBuilds: state.betaBuild, jsonCompletion: true, jsonValidation: true, mojangCompletion: true, mojangHover: true, componentQuickFix: true, officialLootValidation: true, projectReferenceCompletion: true, projectDefinition: true, molangDiagnostics: true, molangCompletion: true, projectValidation: true };
  await fs.writeFile(path.resolve(__dirname, '../HOST_VERIFICATION.json'), JSON.stringify(result, null, 2) + '\n');
  console.log('HOST VERIFICATION PASSED', result);
}
module.exports = { run };
