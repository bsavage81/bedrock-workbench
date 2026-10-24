const {test} = require('node:test');
const assert = require('node:assert/strict');
const json = require('jsonc-parser');
const {keyEdit,valueEdit} = require('../src/completion-key.cjs');
test('accepting quoted keys supplies a quoted value and places the snippet inside it', () => {
  for (const text of ['{""}', '{"gr"}', '{ "gr"\n}']) {
    const tree = json.parseTree(text), node = tree.children[0].children[0];
    const edit = keyEdit(text,node,'growth_state','"${1:}"');
    assert.equal(text.slice(0,edit.start)+edit.text+text.slice(edit.end), text.replace(/"(?:gr)?"/, '"growth_state": "${1:}"'));
    assert.ok(edit.snippet);
  }
});

test('value selection inserts only required sibling separators outside quotes, including JSONC comments',()=>{
  for(const [source,value,expected] of [
    ['{"value":"|" "next":1}','hello','{"value":"hello", "next":1}'],
    ['{"value":fa|lse "next":1}',true,'{"value":true, "next":1}'],
    ['["|" {}]','hello','["hello", {}]'],
    ['{"value":"|" /* comment */ "next":1}','hello','{"value":"hello", /* comment */ "next":1}'],
    ['{"value":"|", "next":1}','hello','{"value":"hello", "next":1}'],
    ['{"value":"|"}','hello','{"value":"hello"}'],
    ['["|"]','hello','["hello"]'],
    ['{"value":"|" // final\n}','hello','{"value":"hello" // final\n}'],
    ['{"value":"|"}', 'a"b', '{"value":"a\\"b"}']
  ]) {
    const offset=source.indexOf('|'),text=source.replace('|',''),node=json.findNodeAtOffset(json.parseTree(text),offset,true);
    const edit=valueEdit(text,node,offset,value),result=text.slice(0,edit.start)+edit.text+text.slice(edit.end);
    assert.equal(result,expected);
    const errors=[];json.parse(result,errors);assert.deepEqual(errors,[]);
  }
});
test('new-key snippets also separate following properties',()=>{
  const text='{"gr" "next":1}',node=json.parseTree(text).children[0].children[0];
  assert.equal(keyEdit(text,node,'growth','"${1:}"').text,'"growth": "${1:}",');
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
