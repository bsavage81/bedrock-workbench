const { test } = require('node:test');
const assert = require('node:assert/strict');
const { context, tokenize } = require('../src/commands.cjs');
const { ContentIndex } = require('../src/content.cjs');
const parameter = (name, type) => ({ name, type: { name: type } });
const command = (name, ...params) => ({ name, description: name, overloads: [{ params }] });
const reference = {
  vanilla: { item: ['minecraft:diamond'], block: ['minecraft:stone'], entity: ['minecraft:pig'] },
  commands: { command_enums: [
    { name: 'OPTION_AS', values: [{ value: 'as' }] }, { name: 'OPTION_RUN', values: [{ value: 'run' }] }
  ], commands: [
    command('give', parameter('player', 'SELECTION'), parameter('item', 'ITEM')),
    command('setblock', parameter('position', 'POSITION'), parameter('block', 'BLOCK')),
    command('function', parameter('name', 'PATHCOMMAND')),
    { name: 'execute', overloads: [
      { params: [parameter('as', 'OPTION_AS'), parameter('target', 'SELECTION'), parameter('chain', 'EXECUTECHAINEDOPTION_0')] },
      { params: [parameter('run', 'OPTION_RUN'), parameter('command', 'CODEBUILDERARGS')] }
    ] }
  ] }
};
const index = new ContentIndex({}); index.add('item', 'test:sword', 'sword.json'); index.add('function', 'rewards/coins', 'coins.mcfunction'); index.add('tag', 'boss', 'setup.mcfunction');
test('command completion combines vanilla and project IDs, coordinates consume three arguments', () => {
  assert.ok(context('gi', reference, index).values.includes('give'));
  assert.deepEqual(context('give @s test:', reference, index).values, ['test:sword']);
  assert.ok(context('give @s minecraft:', reference, index).values.includes('minecraft:diamond'));
  assert.ok(context('setblock ~ ~ ~ ', reference, index).values.includes('minecraft:stone'));
  assert.deepEqual(context('setblock ~ ', reference, index).values, ['~', '^']);
  assert.ok(context('function rewards/', reference, index).values.includes('rewards/coins'));
  assert.equal(context('# give ', reference, index), undefined);
});
test('execute chain and run recurse into the correct command grammar', () => {
  assert.ok(context('execute as @s ', reference, index).values.includes('run'));
  assert.ok(context('execute as @s run give @s ', reference, index).values.includes('test:sword'));
  assert.ok(context('execute run execute as @s run setblock ~ ~ ~ ', reference, index).values.includes('minecraft:stone'));
  assert.ok(context('give @s ', reference, index).signatures.some(s => s.parameter === 1));
});
test('selectors preserve quoted/grouped values and replace only the selected value', () => {
  assert.equal(tokenize('give @e[name="Two words",scores={coins=1..}] stone').length, 3);
  const state = context('give @e[type=!minecraft:p', reference, index);
  assert.deepEqual(state.values, ['minecraft:pig']);
  assert.equal('give @e[type=!minecraft:p'.slice(0, state.start), 'give @e[type=!');
  assert.deepEqual(context('give @e[tag=b', reference, index).values, ['boss']);
});
test('original loot schema checks nested types while permitting extension payloads', () => {
  const validate = new (require('ajv'))({ strict: false }).compile(require('../schemas/loot-table.schema.json'));
  assert.ok(validate({ pools: [{ rolls: { min: 1, max: 3 }, entries: [{ type: 'item', name: 'test:sword', functions: [{ function: 'custom_function', arbitrary: true }] }] }], custom: {} }));
  assert.ok(!validate({ pools: [{ entries: 'wrong' }] }));
  assert.ok(!validate({ pools: [{ rolls: { min: 'wrong' } }] }));
  assert.ok(!validate({ pools: 'wrong' }));
});
