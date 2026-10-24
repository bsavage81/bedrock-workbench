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
    return hovers.some(hover => hover.contents.some(content => content.value?.includes('Surface friction')));
  }, 'Workbench block documentation hover missing');
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
  assert.ok(commands.includes('bedrock.vanillaSource'),'Vanilla reference source command missing');
  const referenceFixtureFile=path.join(root,'.bedrock/reference/components.json'),referenceFixture=await core.readJson(referenceFixtureFile);
  referenceFixture.vanillaReferences={item:['minecraft:horsearmoriron']};await core.writeJson(referenceFixtureFile,referenceFixture);
  await core.writeJson(path.join(root,'BP/recipes/vanilla-validation.json'),{format_version:'1.26.50','minecraft:recipe_shapeless':{description:{identifier:'test:vanilla_validation'},tags:['crafting_table'],ingredients:[{item:'minecraft:diamnod'},{item:'minecraft:horsearmoriron'}],result:'minecraft:diamond'}});
  await vscode.commands.executeCommand('bedrock.validate');
  const vanillaReport=await core.readJson(path.join(root,'.bedrock/validation-report.json'));
  assert.ok(vanillaReport.vanillaSources.some(source=>source.type==='samples'),'Validation report omitted the vanilla source');
  assert.ok(vanillaReport.issues.some(issue=>issue.message.includes("'minecraft:diamnod'")&&issue.severity==='information'),'Unknown vanilla item was not identified');
  assert.ok(!vanillaReport.issues.some(issue=>issue.message.includes("'minecraft:diamond' was not found")),'Valid vanilla item was marked missing');
  assert.ok(!vanillaReport.issues.some(issue=>issue.message.includes("'minecraft:horsearmoriron' was not found")),'Known vanilla legacy name was marked missing');
  const intendedUris=['first','second'].map(name=>vscode.Uri.file(path.join(root,'RP/entity/intended-'+name+'.json')));
  const intendedDocs=[];
  for(const [i,uri]of intendedUris.entries()) {
    await core.writeJson(uri.fsPath,{format_version:'1.10.0','minecraft:client_entity':{description:{identifier:'test:intended_'+i,textures:{default:'textures/intended_external'}}}});
    intendedDocs.push(await vscode.workspace.openTextDocument(uri));
  }
  await vscode.window.showTextDocument(intendedDocs[0]);
  await until(async()=>vscode.languages.getDiagnostics(intendedUris[0]).some(d=>d.code==='bedrock.missingReference'),'Intended-reference diagnostic missing');
  async function intendedAction(i,scope) {
    const position=intendedDocs[i].positionAt(intendedDocs[i].getText().indexOf('textures/intended_external')+4);
    const actions=await vscode.commands.executeCommand('vscode.executeCodeActionProvider',intendedUris[i],new vscode.Range(position,position));
    const action=actions.find(a=>a.command?.command==='bedrock.ignoreReference'&&a.command.arguments[0].scope===scope);
    assert.ok(action,'Mark-as-intended Quick Fix missing: '+scope);
    await vscode.commands.executeCommand(action.command.command,...action.command.arguments);
  }
  await intendedAction(0,'file');
  await until(async()=>!vscode.languages.getDiagnostics(intendedUris[0]).some(d=>d.code==='bedrock.missingReference'),'File ignore did not clear live findings');
  await until(async()=>vscode.languages.getDiagnostics(intendedUris[1]).some(d=>d.code==='bedrock.missingReference'),'File ignore leaked into another file');
  await intendedAction(1,'project');
  await until(async()=>!vscode.languages.getDiagnostics(intendedUris[1]).some(d=>d.code==='bedrock.missingReference'),'Project ignore did not clear live findings');
  const ignoredReport=await core.readJson(path.join(root,'.bedrock/validation-report.json'));
  assert.equal(ignoredReport.suppressedIssues.filter(i=>i.reference?.value==='textures/intended_external').length,2);
  const intendedConfig=await core.readJson(path.join(root,'bedrock-project.json'));intendedConfig.validation.ignoredReferences=[];
  await core.writeJson(path.join(root,'bedrock-project.json'),intendedConfig);
  await until(async()=>vscode.languages.getDiagnostics(intendedUris[0]).some(d=>d.code==='bedrock.missingReference'),'Removing ignore rules did not restore live findings');
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
  const customIds = path.join(root, 'BP/scripts/component-ids.ts'), customScript = path.join(root, 'BP/scripts/custom-components.ts');
  await fs.mkdir(path.dirname(customIds), { recursive: true });
  await fs.writeFile(customIds, "export const BLOCK_ID = 'test:host_block' as const;");
  await fs.writeFile(customScript, "import {system} from '@minecraft/server'; import {BLOCK_ID} from './component-ids.js'; system.beforeEvents.startup.subscribe(({blockComponentRegistry: blocks, itemComponentRegistry}) => { blocks.registerCustomComponent(BLOCK_ID, {onTick(event, {params}) { if (typeof params.golden === 'boolean') {} if(typeof params.nested.label === 'string') {} }}); blocks.registerCustomComponent('test:host_itemless', {onTick() {}}); itemComponentRegistry.registerCustomComponent('test:host_item', {}); });");
  const customUri = vscode.Uri.file(path.join(root, 'BP/blocks/custom-components.json'));
  await core.writeJson(customUri.fsPath, { format_version: '1.21.90', 'minecraft:block': { description: { identifier: 'test:host_custom' }, components: { '': {} } } });
  const customDoc = await vscode.workspace.openTextDocument(customUri); await vscode.window.showTextDocument(customDoc);
  const customPosition = customDoc.positionAt(customDoc.getText().indexOf('"":') + 1);
  await until(async () => {
    const completion = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', customUri, customPosition);
    assert.ok(!completion?.items.some(item => item.label === 'test:host_item'), 'Item-only custom component leaked into block suggestions');
    return completion?.items.some(item => item.label === 'test:host_block' && item.detail === 'Project block custom component');
  }, 'Imported script-registered block component completion missing');
  async function setCustomBlock(components, permutations) {
    const edit = new vscode.WorkspaceEdit();
    edit.replace(customUri, new vscode.Range(customDoc.positionAt(0), customDoc.positionAt(customDoc.getText().length)), JSON.stringify({ format_version: '1.21.90', 'minecraft:block': { description: { identifier: 'test:host_custom' }, components, ...(permutations ? { permutations } : {}) } }));
    assert.ok(await vscode.workspace.applyEdit(edit));
  }
  await setCustomBlock({'minecraft:collision_box':null});
  const collisionPosition=customDoc.positionAt(customDoc.getText().indexOf('null'));
  const collisionHints=await vscode.commands.executeCommand('vscode.executeCompletionItemProvider',customUri,collisionPosition);
  const collisionArray=collisionHints.items.find(item=>item.label==='Collision box array');
  assert.ok(collisionArray,'Collision-box array starter missing');
  assert.ok(collisionArray.insertText.value.includes('[')&&collisionArray.insertText.value.includes('origin'),'Collision-array suggestion does not insert boxes');
  assert.ok(collisionHints.items.some(item=>item.label==='Single collision box'),'Single collision-box starter missing');
  assert.ok(collisionHints.items.some(item=>item.label==='true')&&collisionHints.items.some(item=>item.label==='false'),'Boolean collision values missing');
  await setCustomBlock({'minecraft:collision_box':[]});
  const collisionItemHints=await vscode.commands.executeCommand('vscode.executeCompletionItemProvider',customUri,customDoc.positionAt(customDoc.getText().indexOf('[]')+1));
  assert.ok(collisionItemHints.items.some(item=>item.label==='Single collision box'),'Collision array entry starter missing');
  const collisionHover=await vscode.commands.executeCommand('vscode.executeHoverProvider',customUri,customDoc.positionAt(customDoc.getText().indexOf('minecraft:collision_box')+5));
  assert.ok(collisionHover.some(h=>h.contents.some(c=>c.value?.includes('array defines multiple boxes')&&c.value.includes('learn.microsoft.com'))),'Collision array hover missing');
  await setCustomBlock({'minecraft:random_offset':{x:{range:{min:-4,max:4},steps:0}},'minecraft:flower_pottable':{}});
  for(const [needle,expected] of [['minecraft:random_offset','Position-seeded'],['minecraft:flower_pottable','flower pot'],['steps','Zero permits'],['min','Minimum displacement']]) {
    const position=customDoc.positionAt(customDoc.getText().indexOf('"'+needle+'"')+2);
    const hovers=await vscode.commands.executeCommand('vscode.executeHoverProvider',customUri,position);
    assert.ok(hovers.some(h=>h.contents.some(c=>c.value?.includes(expected))), 'Missing authored block hover: '+needle);
    assert.ok(hovers.some(h=>h.contents.some(c=>c.value?.includes('https://learn.microsoft.com/en-us/minecraft/creator/'))), 'Microsoft Learn hover link missing: '+needle);
  }
  await setCustomBlock({'minecraft:random_offset':{x:{range:{}}}});
  const offsetHints=await vscode.commands.executeCommand('vscode.executeCompletionItemProvider',customUri,customDoc.positionAt(customDoc.getText().indexOf('{}')+1));
  assert.ok(offsetHints.items.some(item=>item.label==='min')&&offsetHints.items.some(item=>item.label==='max'),'Nested offset range completion missing');
  await setCustomBlock({'minecraft:flower_pottable':{}});
  const pottedHints=await vscode.commands.executeCommand('vscode.executeCompletionItemProvider',customUri,customDoc.positionAt(customDoc.getText().indexOf('{}')+1));
  assert.equal(pottedHints.items.length,0,'Parameterless flower_pottable offered invalid fields');
  for(const [components,expected,excluded] of [
    [{'minecraft:placement_filter':{conditions:[{block_filter:['']}] }},'minecraft:stone','minecraft:diamond'],
    [{'minecraft:placement_filter':{conditions:[{block_filter:[{name:''}]}] }},'minecraft:stone','minecraft:diamond'],
    [{'minecraft:destructible_by_mining':{item_specific_speeds:[{item:'',destroy_speed:1}]}},'minecraft:diamond','minecraft:stone']
  ]) {
    await setCustomBlock(components);
    const hints=await vscode.commands.executeCommand('vscode.executeCompletionItemProvider',customUri,customDoc.positionAt(customDoc.getText().indexOf('""')+1));
    assert.ok(hints.items.some(item=>item.label===expected),'Identifier completion missing: '+expected);
    assert.ok(!hints.items.some(item=>item.label===excluded),'Wrong identifier kind in block component: '+excluded);
  }
  await setCustomBlock({ 'test:host_itemless': {} });
  // Locate the innermost empty object, rather than the document wrapper.
  const emptyParameterPosition = customDoc.positionAt(customDoc.getText().indexOf('{}') + 1);
  const emptyParameterHints = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', customUri, emptyParameterPosition);
  assert.equal(emptyParameterHints.items.length, 0, 'Unrelated completion items leaked into a parameterless custom component: ' + emptyParameterHints.items.map(item => item.label).join(', '));
  await setCustomBlock({ 'test:host_block': { arbitrary_parameter: true } });
  const registeredPosition = customDoc.positionAt(customDoc.getText().indexOf('test:host_block') + 6);
  const componentHover = await vscode.commands.executeCommand('vscode.executeHoverProvider', customUri, registeredPosition);
  assert.ok(componentHover.some(h => h.contents.some(c => c.value?.includes('onTick'))), 'Custom component registration hover missing');
  const componentDefinitions = await vscode.commands.executeCommand('vscode.executeDefinitionProvider', customUri, registeredPosition);
  assert.ok(componentDefinitions.some(definition => definition.uri?.fsPath.toLowerCase() === customScript.toLowerCase()), 'Custom component registration navigation missing');
  await setCustomBlock({ 'test:host_block': { '': 0 } });
  const parameterCompletions = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', customUri, customDoc.positionAt(customDoc.getText().indexOf('"":') + 1));
  assert.ok(parameterCompletions.items.some(item => item.label === 'golden'), 'Script parameter completion missing');
  assert.ok(parameterCompletions.items.some(item => item.label === 'nested'), 'Nested parameter container completion missing');
  await setCustomBlock({ 'test:host_block': { golden: false, nested: { '': '' } } });
  const parameterHover = await vscode.commands.executeCommand('vscode.executeHoverProvider', customUri, customDoc.positionAt(customDoc.getText().indexOf('golden') + 2));
  assert.ok(parameterHover.some(h => h.contents.some(c => c.value?.includes('boolean') && c.value?.includes('Script:'))), 'Script parameter hover missing');
  const nestedHints = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', customUri, customDoc.positionAt(customDoc.getText().indexOf('"":') + 1));
  assert.ok(nestedHints.items.some(item => item.label === 'label'), 'Nested script parameter completion missing');
  const boolHints = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', customUri, customDoc.positionAt(customDoc.getText().indexOf('false') + 2));
  assert.ok(boolHints.items.some(item => item.label === 'true') && boolHints.items.some(item => item.label === 'false'), 'Boolean custom parameter values missing');
  async function rawBlock(source) {
    const edit=new vscode.WorkspaceEdit();
    edit.replace(customUri,new vscode.Range(customDoc.positionAt(0),customDoc.positionAt(customDoc.getText().length)),source.replace('|',''));
    assert.ok(await vscode.workspace.applyEdit(edit));
    return customDoc.positionAt(source.indexOf('|'));
  }
  const commaCases=[
    ['{"minecraft:block":{"components":{"test:host_block":{"golden":fa|lse "other":0}}}}','true','true,'],
    ['{"minecraft:block":{"components":{"minecraft:placement_filter":{"conditions":[{"block_filter":["|" "minecraft:dirt"]}]}}}}','minecraft:stone','"minecraft:stone",'],
    ['{"minecraft:block":{"components":{"minecraft:placement_filter":{"conditions":[{"block_filter":["|", "minecraft:dirt"]}]}}}}','minecraft:stone','"minecraft:stone"']
  ];
  for(const [source,label,expected]of commaCases) {
    const position=await rawBlock(source);
    const hints=await vscode.commands.executeCommand('vscode.executeCompletionItemProvider',customUri,position);
    const item=hints.items.find(item=>item.label===label);assert.ok(item,'Comma case completion missing: '+label);
    assert.equal(item.insertText,expected);
    const edit=new vscode.WorkspaceEdit();edit.replace(customUri,item.range,item.insertText);assert.ok(await vscode.workspace.applyEdit(edit));
    const errors=[];require('jsonc-parser').parse(customDoc.getText(),errors);assert.deepEqual(errors,[],'Accepting a value left invalid JSON');
  }
  const geometryFile = path.join(root,'RP/models/blocks/host.geo.json'), terrainFile = path.join(root,'RP/textures/terrain_texture.json');
  await core.writeJson(geometryFile, {format_version:'1.12.0', 'minecraft:geometry': [{description:{identifier:'geometry.host_test'}}]});
  await core.writeJson(terrainFile, {texture_data:{host_texture:{textures:'textures/blocks/host'}}});
  await setCustomBlock({'minecraft:geometry':'', 'minecraft:material_instances': {'*': {texture:''}}});
  await until(async () => {
    const hints = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', customUri, customDoc.positionAt(customDoc.getText().indexOf('"minecraft:geometry":"') + '"minecraft:geometry":"'.length));
    return hints.items.some(item => item.label === 'geometry.host_test') && hints.items.some(item => item.label === 'minecraft:geometry.cross');
  }, 'Pack and vanilla block geometries missing');
  await until(async () => {
    const hints = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', customUri, customDoc.positionAt(customDoc.getText().indexOf('"texture":"') + '"texture":"'.length));
    return hints.items.some(item => item.label === 'host_texture');
  }, 'Terrain atlas material texture completion missing');
  await setCustomBlock({'minecraft:material_instances': {'*': {texture:'host_texture'}}});
  const textureDefs = await vscode.commands.executeCommand('vscode.executeDefinitionProvider',customUri,customDoc.positionAt(customDoc.getText().indexOf('host_texture')+3));
  assert.ok(textureDefs.some(d => d.uri?.fsPath.toLowerCase() === terrainFile.toLowerCase() && d.range.start.line > 0), 'Atlas entry navigation missing');
  await setCustomBlock({}, [{ condition: '1', components: { '': {} } }]);
  await until(async () => {
    const position = customDoc.positionAt(customDoc.getText().indexOf('"":') + 1);
    const completion = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', customUri, position);
    return completion?.items.some(item => item.label === 'test:host_block');
  }, 'Custom component completion missing in permutations');
  await setCustomBlock({ 'minecraft:custom_components': [''] });
  await until(async () => {
    const position = customDoc.positionAt(customDoc.getText().indexOf('[""') + 2);
    const completion = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', customUri, position);
    return completion?.items.some(item => item.label === 'test:host_block');
  }, 'Legacy custom-component list completion missing');
  await fs.writeFile(customIds, "export const BLOCK_ID = 'test:host_updated' as const;");
  await until(async () => {
    const position = customDoc.positionAt(customDoc.getText().indexOf('[""') + 2);
    const completion = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', customUri, position);
    return completion?.items.some(item => item.label === 'test:host_updated') && !completion.items.some(item => item.label === 'test:host_block');
  }, 'Saved imported component ID changes did not refresh suggestions');
  const validationReport = await core.readJson(path.join(root, '.bedrock/validation-report.json'));
  assert.ok(validationReport.files >= 6); assert.equal(validationReport.schemaVersion, '1.26.50');
  state = await core.readJson(stateFile);
  const result = { activated: true, commands: true, manualBuild: true, automaticCreateChangeSaveDelete: true, automaticIconCompilation: true, versionUnchanged: true, betaBuilds: state.betaBuild, jsonCompletion: true, jsonValidation: true, mojangCompletion: true, mojangHover: true, componentQuickFix: true, officialLootValidation: true, projectReferenceCompletion: true, projectDefinition: true, molangDiagnostics: true, molangCompletion: true, projectValidation: true };
  await fs.writeFile(path.resolve(__dirname, '../HOST_VERIFICATION.json'), JSON.stringify(result, null, 2) + '\n');
  console.log('HOST VERIFICATION PASSED', result);
}
module.exports = { run };
