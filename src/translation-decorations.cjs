const json = require('jsonc-parser');
const content = require('./content.cjs');
const lang = require('./localization.cjs');

// Decorations are visual hints only: never insert translated text into source.
function previews(index, document, open = []) {
  const kind = content.fileKind(index.project, document.uri.fsPath);
  if (!kind) return [];
  if (/\.[cm]?[jt]sx?$/i.test(document.uri.fsPath)) return lang.scriptStrings(document.getText(),document.uri.fsPath).flatMap(node=>{const resolved=lang.resolve(index,node.value,undefined,open);return resolved.length?[{offset:node.offset+node.length,text:'  → '+resolved[0].entries[0].value.replace(/[\r\n\t\u2028\u2029]/g,' '),resolved}]:[];});
  if (!/\.json$/i.test(document.uri.fsPath)) return [];
  const values = lang.catalog(index, open);
  const text = document.getText(), tree = json.parseTree(text.replace(/^\uFEFF/, ' ')), result = [];
  function visit(node) {
    if (node.type === 'string' && !(node.parent?.type === 'property' && node.parent.children[0] === node)) {
      const keys = json.getNodePath(node);
      const type = keys.at(-1) === 'identifier' ? keys[0]?.replace('minecraft:', '') : content.referenceKind(keys, node.value, kind);
      const resolved = lang.resolve(index, node.value, type, open, values);
      if (resolved.length) {
        const entry = resolved[0].entries[0];
        const value = entry.value.replace(/[\r\n\t\u2028\u2029]/g, ' ');
        result.push({offset: node.offset + node.length, text: `  → ${value}`, resolved});
      }
    }
    for (const child of node.children || []) visit(child);
  }
  if (tree) visit(tree);
  return result;
}
function attach(vscode, context, getProject, ensure) {
  if (!vscode.window.createTextEditorDecorationType) return;
  const decoration = vscode.window.createTextEditorDecorationType({
    after: {color: new vscode.ThemeColor('bedrock.translationPreview'), margin: '0 0 0 0.5em', fontStyle: 'italic'},
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
  });
  let timer, generation = 0, disposed = false;
  async function update() {
    const request = ++generation;
    const index = getProject() && await ensure();
    if (disposed || request !== generation) return;
    for (const editor of vscode.window.visibleTextEditors) {
      const options = index && editor.document.uri.scheme === 'file' ? previews(index, editor.document, vscode.workspace.textDocuments).map(preview => {
        const position = editor.document.positionAt(preview.offset);
        return {range: new vscode.Range(position, position), renderOptions: {after: {contentText: preview.text}}, hoverMessage: lang.markdown(vscode, preview.resolved, index.project.root)};
      }) : [];
      editor.setDecorations(decoration, options);
    }
  }
  function schedule(delay = 150) { ++generation; clearTimeout(timer); timer = setTimeout(() => {void update().catch(() => {});}, typeof delay === 'number' ? delay : 150); }
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.{lang,json}');
  context.subscriptions.push(decoration, watcher,
    vscode.window.onDidChangeVisibleTextEditors(schedule),
    vscode.workspace.onDidChangeTextDocument(schedule),
    vscode.workspace.onDidCloseTextDocument(schedule),
    watcher.onDidCreate(() => schedule(750)), watcher.onDidChange(() => schedule(750)), watcher.onDidDelete(() => schedule(750)),
    {dispose() {disposed = true; ++generation; clearTimeout(timer);}});
  schedule();
}
module.exports = {previews, attach};
