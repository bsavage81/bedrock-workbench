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
  const hovers = await vscode.commands.executeCommand('vscode.executeHoverProvider', blockUri, keyPosition);
  assert.ok(hovers.some(hover => hover.contents.some(content => content.value?.includes('Controls block friction.'))), 'Mojang documentation hover missing');
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
  const validationReport = await core.readJson(path.join(root, '.bedrock/validation-report.json'));
  assert.ok(validationReport.files >= 6); assert.equal(validationReport.schemaVersion, '1.26.50');
  state = await core.readJson(stateFile);
  const result = { activated: true, commands: true, manualBuild: true, automaticCreateChangeSaveDelete: true, automaticIconCompilation: true, versionUnchanged: true, betaBuilds: state.betaBuild, jsonCompletion: true, jsonValidation: true, mojangCompletion: true, mojangHover: true, componentQuickFix: true, officialLootValidation: true, projectReferenceCompletion: true, projectDefinition: true, molangDiagnostics: true, molangCompletion: true, projectValidation: true };
  await fs.writeFile(path.resolve(__dirname, '../HOST_VERIFICATION.json'), JSON.stringify(result, null, 2) + '\n');
  console.log('HOST VERIFICATION PASSED', result);
}
module.exports = { run };
