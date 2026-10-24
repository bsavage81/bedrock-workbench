const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { attach, emptyContext } = require('../src/auto-suggest.cjs');
function marked(value) { const offset = value.indexOf('|'); return { text: value.replace('|', ''), offset }; }
test('empty arrays, objects and strings are recognized without mistaking text/comments for containers', () => {
  for (const [source, kind] of [['{"x":[|]}', 'array'], ['{"x":{ | }}', 'object'], ['{"x":"|"}', 'string'], ['{"|":0}', 'string'], ['{"x":[\n  |\n]}', 'array']]) {
    const { text, offset } = marked(source); assert.equal(emptyContext(text, offset), kind);
  }
  for (const source of ['{"x":"[|]"}', '{"x":1, /* [|] */ "y":2}', '[ /* [|] */ ]', '{ /* {|} */ }', '{"x":[1,|]}', '{"x":{"y":1,|}}', '{"x":" | "}']) {
    const { text, offset } = marked(source); assert.equal(emptyContext(text, offset), undefined);
  }
});
function harness(t) {
  let listener, items = [{ label: 'available' }], suggestions = 0, queries = 0;
  const project = { root: path.resolve('example'), packs: { behavior: path.resolve('example/BP'), resource: path.resolve('example/RP') } };
  const document = { uri: { scheme: 'file', fsPath: path.join(project.packs.behavior, 'test.json') }, languageId: 'json', version: 1, getText: () => document.text, offsetAt: p => p.offset };
  function cursor(offset) { return { offset, isEqual: other => offset === other.offset }; }
  const editor = { document, selections: [{}], selection: { isEmpty: true, active: cursor(0) } };
  const vscode = {
    window: { activeTextEditor: editor },
    workspace: { onDidChangeTextDocument: callback => { listener = callback; return { dispose() {} }; }, getConfiguration: () => ({ get: () => true }) },
    commands: { executeCommand: async command => { if (command === 'vscode.executeCompletionItemProvider') { queries++; return { items: await items }; } if (command === 'editor.action.triggerSuggest') suggestions++; } }
  };
  const context = { subscriptions: [] };
  attach(vscode, context, () => project, { warn: error => assert.fail(error) });
  t.after(() => context.subscriptions.forEach(item => item.dispose()));
  function change(source, inserted = '{}', reason) {
    const { text, offset } = marked(source); document.text = text; document.version++;
    editor.selection.active = cursor(offset);
    listener({ document, contentChanges: [{ text: inserted }], reason });
  }
  return { change, document, editor, vscode, setItems: value => { items = value; }, suggestions: () => suggestions, queries: () => queries, move: offset => { editor.selection.active = cursor(offset); } };
}
const settle = () => new Promise(resolve => setTimeout(resolve, 140));
test('typing any empty pair requests and opens available completions', async t => {
  const h = harness(t);
  for (const [source, inserted] of [['{"x":[|]}', '[]'], ['{"x":[{}, {|}]}', '{}'], ['{"x":"|"}', '""'], ['{"function":"|"}', '"function": ""']]) {
    const before = h.suggestions(); h.change(source, inserted); await settle(); assert.equal(h.suggestions(), before + 1);
  }
});
test('unavailable suggestions, undo, non-pack documents and disabled triggers stay quiet', async t => {
  const h = harness(t); h.setItems([]); h.change('{"x":[|]}', '[]'); await settle(); assert.equal(h.suggestions(), 0);
  h.setItems([{ label: 'available' }]); h.change('{"x":[|]}', '[]', 1); await settle(); assert.equal(h.suggestions(), 0);
  h.document.uri.fsPath = path.resolve('unrelated.json'); h.change('{"x":[|]}', '[]'); await settle(); assert.equal(h.suggestions(), 0);
  h.document.uri.fsPath = path.resolve('example/BP/test.json'); h.vscode.workspace.getConfiguration = () => ({ get: () => false });
  h.change('{"x":[|]}', '[]'); await settle(); assert.equal(h.suggestions(), 0);
});
test('late completion responses cannot reopen suggestions after the cursor moves or text changes', async t => {
  const h = harness(t); let finish;
  h.setItems(new Promise(resolve => { finish = resolve; })); h.change('{"x":[|]}', '[]'); await settle(); assert.equal(h.queries(), 1);
  h.move(0); finish([{ label: 'stale' }]); await settle(); assert.equal(h.suggestions(), 0);
  h.setItems([{ label: 'available' }]); h.change('{"x":[|]}', '[]'); h.change('{"x":[1|]}', '1'); await settle(); assert.equal(h.suggestions(), 0);
});
