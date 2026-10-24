const {test} = require('node:test');
const assert = require('node:assert/strict');
const json = require('jsonc-parser');
const {keyEdit} = require('../src/completion-key.cjs');
test('accepting quoted keys supplies a quoted value and places the snippet inside it', () => {
  for (const text of ['{""}', '{"gr"}', '{ "gr"\n}']) {
    const tree = json.parseTree(text), node = tree.children[0].children[0];
    const edit = keyEdit(text,node,'growth_state','"${1:}"');
    assert.equal(text.slice(0,edit.start)+edit.text+text.slice(edit.end), text.replace(/"(?:gr)?"/, '"growth_state": "${1:}"'));
    assert.ok(edit.snippet);
  }
});
test('existing values and colons are preserved; unquoted and component keys get snippets', () => {
  for (const text of ['{"old": 42}', '{"old": }']) {
    const node = json.parseTree(text).children[0].children[0];
    const edit = keyEdit(text,node,'new','"${1:}"');
    assert.equal(text.slice(0,edit.start)+edit.text+text.slice(edit.end), text.replace('old','new'));
    assert.equal(edit.snippet,false);
  }
  assert.equal(keyEdit('{}',undefined,'test:block','{\n\t$0\n}').text, '"test:block": {\n\t$0\n}');
});
