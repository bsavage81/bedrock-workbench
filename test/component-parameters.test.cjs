const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const json = require('jsonc-parser');
const {analyze} = require('../src/script-components.cjs');
const parameters = require('../src/component-parameters.cjs');
const content = require('../src/content.cjs');
function document(data, relative = 'blocks/test.json', side = 'behavior') {
  const text = JSON.stringify(data, null, 2);
  return {data, text, tree: json.parseTree(text), relative, side, file: path.resolve('fixtures', relative)};
}
test('custom parameters combine script type hints, nested reads and project examples without requiring fields', () => {
  const file = path.resolve('fixtures/BP/scripts/main.ts');
  const customComponents = analyze(new Map([[file, `
    interface Options { /** Whether this block is golden. */ golden: boolean; count: number; nested: {label: string} }
    event.blockComponentRegistry.registerCustomComponent('test:growth', {
      onTick(event, {params}) { const options = params as Options; if (options.golden === true) {} if(typeof options.nested.label === 'string') {} }
    });
    function inspect(block) { const p = block.getComponent('test:growth').customComponentParameters.params; if(typeof p.extra === 'string') {} }
    const unrelated = {} as Options;
  `]]));
  const doc = document({'minecraft:block': {components: {'test:growth': {observed: 4, nested: {label: 'hello'}}}}});
  const hints = parameters.hints({customComponents, documents: new Map([[doc.file,doc]])}, 'block', 'test:growth');
  const find = name => hints.find(h => h.path.join('.') === name);
  assert.deepEqual(find('golden').types, ['boolean']);
  assert.match(find('golden').description, /golden/);
  assert.deepEqual(find('count').types, ['number']);
  assert.deepEqual(find('nested.label').samples, ['hello']);
  assert.deepEqual(find('extra').types, ['string']);
  assert.deepEqual(find('observed').types, ['integer']);
  assert.ok(find('golden').sources.some(s => s.origin === 'script'));
  assert.ok(find('observed').sources.some(s => s.origin === 'example'));
  const offset = doc.text.indexOf('"observed"') + 2;
  assert.deepEqual(parameters.context(doc, offset).path, []);
  assert.equal(parameters.context(doc, offset).field, 'observed');
  assert.equal(parameters.context(doc, doc.text.indexOf('test:growth') + 3), undefined);
});
test('shared callback parameter inference stays separate for each registered component', () => {
  const file = path.resolve('fixtures/shared.ts');
  const found = analyze(new Map([[file, `
    const handler = {onTick(e, {params}) { if(typeof params.shared === 'number') {} }};
    event.blockComponentRegistry.registerCustomComponent('test:first',handler);
    event.blockComponentRegistry.registerCustomComponent('test:second',handler);
    function read(b) { const p = b.getComponent('test:first').customComponentParameters.params; if(typeof p.onlyFirst === 'boolean') {} }
  `]]));
  assert.ok(found.every(c => c.parameters.some(p => p.path.join('.') === 'shared')));
  assert.ok(found.find(c => c.id === 'test:first').parameters.some(p => p.path.join('.') === 'onlyFirst'));
  assert.ok(!found.find(c => c.id === 'test:second').parameters.some(p => p.path.join('.') === 'onlyFirst'));
});
test('geometry and texture reference contexts use the correct atlas and gate newer built-ins', () => {
  const doc = document({format_version: '1.26.0', 'minecraft:block': {components: {}}});
  const kind = keys => content.referenceKind(keys, '', doc);
  assert.equal(kind(['minecraft:block','components','minecraft:material_instances','*','texture']), 'terrain_texture');
  assert.equal(kind(['minecraft:block','permutations',0,'components','minecraft:geometry','identifier']), 'geometry');
  assert.equal(kind(['minecraft:block','components','test:custom','texture']), undefined);
  assert.equal(kind(['minecraft:block','components','minecraft:placement_filter','conditions',0,'block_filter',0]),'block');
  assert.equal(kind(['minecraft:block','permutations',0,'components','minecraft:placement_filter','conditions',0,'block_filter',0,'name']),'block');
  assert.equal(kind(['minecraft:block','components','minecraft:placement_filter','conditions',0,'block_filter',0,'tags']),undefined);
  assert.equal(kind(['minecraft:block','components','minecraft:destructible_by_mining','item_specific_speeds',0,'item']),'item');
  assert.equal(kind(['minecraft:block','components','minecraft:destructible_by_mining','item_specific_speeds',0,'item','name']),'item');
  assert.equal(kind(['minecraft:block','components','minecraft:item_visual','material_instances','*','texture']),'terrain_texture');
  assert.equal(kind(['minecraft:block','components','minecraft:embedded_visual','geometry','identifier']),'geometry');
  assert.deepEqual(content.builtinGeometries(doc, {config: {targetVersion: '1.26.50'}}), ['minecraft:geometry.full_block','minecraft:geometry.cross','minecraft:geometry.full_block_v1']);
  assert.ok(!content.builtinGeometries(doc, {config: {targetVersion: '1.21.90'}}).includes('minecraft:geometry.full_block_v1'));
  const item = document({'minecraft:item': {}});
  assert.equal(content.referenceKind(['minecraft:item','components','minecraft:icon','textures','default'],'',item),'item_texture');
  const atlas = document({texture_data: {stone: {textures: 'textures/blocks/stone'}}}, 'textures/terrain_texture.json','resource');
  const index = {project: {config: {targetVersion: '1.26.50'}}, documents: new Map([[atlas.file,atlas]]), values: kind => new Map(kind === 'terrain_texture' ? [['stone',[atlas.file]]] : []), reference: {vanilla: {terrain_texture: ['stone','dirt']}}};
  assert.deepEqual([...content.referenceValues(index,'terrain_texture',doc).keys()], ['stone','dirt']);
  const definition = content.referenceDefinitions(index,'terrain_texture','stone')[0];
  assert.equal(atlas.text.split('\n')[definition.line].slice(definition.column,definition.column+7), '"stone"');
  assert.equal(content.referenceKind(['texture_data','stone','textures'],'',atlas),'texture');
});
