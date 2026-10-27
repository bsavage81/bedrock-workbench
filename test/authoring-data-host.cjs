// Actual VS Code editor integration. No extension installation, pack build or deployment.
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict'), vscode = require('vscode');
const data = require('../src/authoring-data.cjs'), u = require('../src/authoring-updates.cjs');
async function until(check, message) { const end = Date.now() + 30000; while (Date.now() < end) { if (await check()) return; await new Promise(r => setTimeout(r, 150)); } throw Error(message); }
async function run() {
  const root = vscode.workspace.workspaceFolders[0].uri.fsPath, extension = vscode.extensions.getExtension('bsavage81.bedrock-workbench');
  const stamp = Date.now(), extensionVersion = require('../package.json').version;
  function fixture(number) {
    const id = `host-${stamp}-${number}`, sources = [{ url: 'https://github.com/MicrosoftDocs/minecraft-creator', revision: 'a'.repeat(40), license: 'CC-BY-4.0', attribution: 'Test fixture' }];
    const snapshot = { dataFormatVersion: 1, id, channel: 'stable', sources, files: structuredClone(data.bundled) };
    snapshot.files['schemas/block.schema.json'].properties.workbench_data_fixture = { type: number === 1 ? 'string' : 'number', description: `Live authoring snapshot ${number}.` };
    snapshot.files['src/molang-catalog.json'].entries.push({ name: 'query.workbench_data_fixture', description: `Live catalog ${number}.`, channels: ['release'], url: 'https://learn.microsoft.com/en-us/minecraft/creator/documents/molang/syntax-guide' });
    const bytes = Buffer.from(JSON.stringify(snapshot));
    const entry = { dataFormatVersion: 1, id, channel: 'stable', sources, extension: { min: extensionVersion, max: extensionVersion }, minecraft: { min: '1.26.50', max: '1.26.50' }, generatedAt: new Date(stamp + number * 1000).toISOString(), sha256: u.sha256(bytes), bytes: bytes.length }; entry.url = u.artifactUrl(entry);
    return { bytes, entry, manifest: { dataFormatVersion: 1, channel: 'stable', generatedAt: entry.generatedAt, snapshots: [entry] } };
  }
  let current = fixture(1), corrupt = false, calls = 0;
  const originalFetch = globalThis.fetch, originalPicker = vscode.window.showQuickPick;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes(u.REPOSITORY)) { calls++; assert.equal(options.headers.Authorization, undefined); return new Response(String(url).includes('/feeds/') ? JSON.stringify(current.manifest) : corrupt ? Buffer.from('corrupt') : current.bytes); }
    return originalFetch(url, options);
  };
  vscode.window.showQuickPick = async () => undefined;
  try {
    await extension.activate();
    await vscode.commands.executeCommand('bedrock.refresh');
    await vscode.commands.executeCommand('bedrock.refreshAuthoringData');
    await until(() => data.revision === current.entry.id, 'Snapshot was not activated');
    assert.equal((await require('../src/core.cjs').loadProject(root)).config.build.autoDeploy, false);
    const file = path.join(root, 'BP/blocks/data-fixture.json'); await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, '{\n "format_version":"1.26.50",\n "minecraft:block":{"description":{"identifier":"test:data"},"components":{}},\n "workbench_data_fixture":42\n}');
    const uri = vscode.Uri.file(file), doc = await vscode.workspace.openTextDocument(uri); await vscode.window.showTextDocument(doc, { preview: false });
    const at = doc.positionAt(doc.getText().indexOf('workbench_data_fixture') + 4);
    const hoverText = async () => (await vscode.commands.executeCommand('vscode.executeHoverProvider', uri, at)).flatMap(h => h.contents.map(c => c.value || String(c))).join('\n');
    await until(async () => (await hoverText()).includes('Live authoring snapshot 1'), 'Updated schema hover missing');
    const complete = async () => (await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', uri, at)).items;
    assert.ok((await complete()).some(i => i.label === 'workbench_data_fixture'), 'Updated schema completion missing');
    await until(() => vscode.languages.getDiagnostics(uri).some(d => /string/.test(d.message)), 'Updated validation constraint missing');
    assert.ok(require('../src/molang.cjs').entries.some(e => e.name === 'query.workbench_data_fixture'), 'Molang catalog did not refresh');
    current = fixture(2); await vscode.commands.executeCommand('bedrock.refreshAuthoringData');
    await until(async () => (await hoverText()).includes('Live authoring snapshot 2'), 'Second snapshot did not refresh live hover');
    await until(() => !vscode.languages.getDiagnostics(uri).some(d => /string/.test(d.message)), 'Old schema constraint survived update');
    await vscode.commands.executeCommand('bedrock.rollbackAuthoringData');
    await until(async () => (await hoverText()).includes('Live authoring snapshot 1'), 'Rollback did not restore editor associations');
    current = fixture(3); corrupt = true; await vscode.commands.executeCommand('bedrock.refreshAuthoringData');
    const state = await vscode.commands.executeCommand('bedrock.authoringData'); assert.match(state.error, /checksum|size/); assert.ok(state.version.endsWith('-1'));
    await until(async () => (await hoverText()).includes('Live authoring snapshot 1'), 'Failed download disrupted last-known-good hover');
    await vscode.commands.executeCommand('bedrock.rollbackAuthoringData');
    await until(async () => !(await hoverText()).includes('Live authoring snapshot'), 'Bundled fallback did not refresh editor');
    const result = { version: require('../package.json').version, timestamp: new Date().toISOString(), authoringOnly: true, anonymousDownload: true, liveSchemaCompletion: true, liveSchemaHover: true, liveValidation: true, liveMolangCatalog: true, atomicReplacement: true, rollback: true, failedChecksumRecovery: true, bundledFallback: true, downloadCalls: calls, deploymentPerformed: false };
    await fs.writeFile(path.resolve(__dirname, '../HOST_VERIFICATION.json'), JSON.stringify(result, null, 2)); await fs.writeFile(path.resolve(__dirname, '../.test-temp/authoring-data-host.json'), JSON.stringify(result, null, 2)); console.log('AUTHORING DATA HOST PASSED', result);
  } finally { globalThis.fetch = originalFetch; vscode.window.showQuickPick = originalPicker; }
}
module.exports = { run };
