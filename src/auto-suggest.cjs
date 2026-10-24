const json = require('jsonc-parser');
const content = require('./content.cjs');

function emptyContext(text, offset) {
  const left = text.slice(0, offset), right = text.slice(offset);
  let kind, opening;
  const array = /\[\s*$/.exec(left), object = /\{\s*$/.exec(left);
  if (left.endsWith('"') && right.startsWith('"')) { kind = 'string'; opening = offset - 1; }
  else if (array && /^\s*\]/.test(right)) { kind = 'array'; opening = array.index; }
  else if (object && /^\s*\}/.test(right)) { kind = 'object'; opening = object.index; }
  if (!kind) return;
  // Parsing prevents braces inside strings/comments from opening suggestions.
  const node = json.findNodeAtOffset(json.parseTree(text.replace(/^\uFEFF/, ' ')), offset, true);
  if (node?.type !== kind || node.offset !== opening) return;
  if (kind === 'string' ? node.value !== '' : node.children?.length) return;
  return kind;
}

function attach(vscode, context, getProject, output) {
  if (!vscode.workspace.onDidChangeTextDocument) return;
  let timer, sequence = 0, disposed = false;
  function cancel() { sequence++; clearTimeout(timer); }
  const listener = vscode.workspace.onDidChangeTextDocument(event => {
    cancel();
    const editor = vscode.window.activeTextEditor, project = getProject();
    if (disposed || !project || event.reason || !editor || editor.document !== event.document || event.document.uri.scheme !== 'file') return;
    if (!['json', 'jsonc'].includes(event.document.languageId) || !content.fileKind(project, event.document.uri.fsPath)) return;
    if (event.contentChanges.length !== 1) return;
    const change = event.contentChanges[0], inserted = change.text;
    // Also handle property/snippet insertion that leaves an empty value, rather
    // than restricting this to single-character keyboard events.
    if (!inserted || inserted.length > 1024 || (!/[\[{"]/.test(inserted) && !/^\s+$/.test(inserted))) return;
    if (vscode.workspace.getConfiguration('editor', event.document.uri).get('suggestOnTriggerCharacters', true) === false) return;
    const ticket = sequence, version = event.document.version;
    timer = setTimeout(async () => {
      try {
        if (disposed || ticket !== sequence || editor !== vscode.window.activeTextEditor || editor.document.version !== version || editor.selections.length !== 1 || !editor.selection.isEmpty) return;
        const position = editor.selection.active;
        const offset = event.document.offsetAt(position);
        if (Number.isInteger(change.rangeOffset) && (offset < change.rangeOffset || offset > change.rangeOffset + inserted.length)) return;
        if (!emptyContext(event.document.getText(), offset)) return;
        const result = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', event.document.uri, position);
        if (disposed || ticket !== sequence || editor !== vscode.window.activeTextEditor || editor.document.version !== version || editor.selections.length !== 1 || !editor.selection.active.isEqual(position) || !editor.selection.isEmpty) return;
        if (result?.items?.length) await vscode.commands.executeCommand('editor.action.triggerSuggest');
      } catch (error) { output.warn(`Automatic suggestions: ${error.message}`); }
    }, 80);
  });
  context.subscriptions.push(listener, { dispose() { disposed = true; cancel(); } });
}
module.exports = { attach, emptyContext };
