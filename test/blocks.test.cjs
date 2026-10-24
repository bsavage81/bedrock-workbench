const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { analyze } = require('../src/script-components.cjs');
const content = require('../src/content.cjs');
const Ajv = require('ajv');
const validate = new Ajv({ strict: false, allErrors: true }).compile(require('../schemas/block.schema.json'));
const block = components => ({ format_version: '1.21.90', 'minecraft:block': { description: { identifier: 'test:block' }, components } });
test('original block rules cover common components, permutations, legacy unions and unrestricted custom parameters', () => {
  const data = block({ 'minecraft:geometry': { identifier: 'geometry.test', bone_visibility: { leaf: "q.block_state('test:grown')" }, uv_lock: ['leaf'] }, 'minecraft:material_instances': { '*': { texture: 'test', ambient_occlusion: false }, north: '*' }, 'minecraft:collision_box': false, 'minecraft:selection_box': { origin: [-4, 0, -4], size: [8, 16, 8] }, 'minecraft:destructible_by_mining': true, 'minecraft:map_color': '#123456', 'minecraft:tick': { interval_range: [20, 40], looping: true }, 'test:registered': { arbitrary: [1, true] }, 'test:boolean': true });
  data['minecraft:block'].description.states = { 'test:grown': [false, true], 'test:age': { values: { min: 0, max: 7 } } };
  data['minecraft:block'].permutations = [{ condition: "q.block_state('test:grown')", components: { 'minecraft:geometry': 'geometry.grown', 'test:registered': 42 } }];
  assert.ok(validate(data), JSON.stringify(validate.errors));
  assert.ok(validate(block({ 'minecraft:custom_components': ['test:legacy'], 'minecraft:collision_box': [{ origin: [0, 0, 0], size: [1, 1, 1] }] })));
  for (const components of [{ 'minecraft:friction': 1.5 }, { 'minecraft:light_emission': 16 }, { 'minecraft:geometry': 42 }, { 'minecraft:material_instances': { '*': { face_dimming: 'wrong' } } }, { 'minecraft:tick': { interval_range: [1] } }, { 'minecraft:collision_box': { size: [1, 2] } }]) assert.equal(validate(block(components)), false);
});

test('expanded block rules cover offset, potted/embedded/item visuals, redstone and block/item descriptors', () => {
  const components = {
    'minecraft:random_offset': {x:{range:{min:-4,max:4},steps:0},z:{range:{min:-4,max:4},steps:0}},
    'minecraft:flower_pottable': {},
    'minecraft:embedded_visual': {geometry:{identifier:'geometry.potted'},material_instances:{'*':{texture:'plant',render_method:'alpha_test'}}},
    'minecraft:item_visual': {geometry:'geometry.item',material_instances:{'*':{texture:'plant'}}},
    'minecraft:placement_filter': {conditions:[{allowed_faces:['up'],block_filter:['minecraft:dirt',{name:'test:soil',states:{'test:wet':true}}]}]},
    'minecraft:destructible_by_mining': {item_specific_speeds:[{item:{name:'minecraft:iron_pickaxe'},destroy_speed:2}]},
    'minecraft:redstone_producer':{power:15,connected_faces:['up']},
    'minecraft:block_entity': {container:{slot_count:27},dynamic_properties:true}
  };
  assert.ok(validate(block(components)), JSON.stringify(validate.errors));
  for (const bad of [
    {'minecraft:random_offset':{x:{range:{min:'wrong'}}}},
    {'minecraft:random_offset':{z:{steps:1.5}}},
    {'minecraft:flower_pottable':[]},
    {'minecraft:redstone_producer':{power:16}},
    {'minecraft:connection_rule':{enabled_directions:['up']}},
    {'minecraft:block_entity':{container:{slot_count:55}}},
    {'minecraft:liquid_detection':{detection_rules:[{on_liquid_touches:'unknown'}]}},
    {'minecraft:placement_filter':{conditions:[{block_filter:[{states:{bad:[]}}]}]}}
  ]) assert.equal(validate(block(bad)),false,JSON.stringify(bad));
  assert.ok(validate(block({'minecraft:precipitation_interactions':{precipitation_behavior:'snow_log_no_collision'},'minecraft:redstone_consumer':{propogates_power:true}})));
  const rules=require('../schemas/block.schema.json').definitions.components.properties;
  assert.equal(Object.keys(rules).length,46);
  assert.match(rules['minecraft:flower_pottable'].description,/No parameters/);
  assert.match(rules['minecraft:random_offset'].properties.x.properties.steps.description,/Zero/);
});

test('collision starter array validates as a multi-box shape and rejects malformed entries',()=>{
  const schema=require('../schemas/block.schema.json');
  const component=schema.definitions.components.properties['minecraft:collision_box'];
  const starter=component.defaultSnippets.find(s=>s.label==='Collision box array').body;
  assert.ok(Array.isArray(starter));
  assert.ok(validate(block({'minecraft:collision_box':[...starter,{origin:[-4,16,-4],size:[8,8,8]}]})),JSON.stringify(validate.errors));
  assert.equal(validate(block({'minecraft:collision_box':[...starter,{size:[8,8]}]})),false);
  assert.match(component.markdownDescription,/array defines multiple boxes/);
  assert.match(component.markdownDescription,/learn.microsoft.com/);
});
test('script discovery handles TypeScript, imported/reexported constants, registry aliases and block/item separation', () => {
  const base = path.resolve('fixtures/BP/scripts');
  const sources = new Map([
    [path.join(base, 'constants.ts'), "export const PREFIX = 'test'; export const IDS = { growth: `${PREFIX}:growth` } as const;"],
    [path.join(base, 'reexport.ts'), "export { IDS } from './constants.js';"],
    [path.join(base, 'main.ts'), `import { IDS } from './reexport.js';
      const EGG = 'test:egg'; class Egg { onTick() {} }
      system.beforeEvents.startup.subscribe(({blockComponentRegistry: blocks, itemComponentRegistry}) => {
        const registry = blocks;
        registry.registerCustomComponent(IDS.growth, { onRandomTick() {} });
        blocks.registerCustomComponent(EGG, new Egg());
        itemComponentRegistry.registerCustomComponent('test:item', {onUse() {}});
      });`]
  ]);
  const found = analyze(sources);
  assert.deepEqual(found.map(c => [c.id, c.kind]).sort(), [['test:egg', 'block'], ['test:growth', 'block'], ['test:item', 'item']]);
  assert.deepEqual(found.find(c => c.id === 'test:egg').callbacks, ['onTick']);
  assert.deepEqual(found.find(c => c.id === 'test:growth').callbacks, ['onRandomTick']);
  assert.ok(found.every(c => Number.isInteger(c.line) && c.column >= 0));
});
test('script discovery does not execute code or mistake comments, strings, shadowed/dynamic IDs or unrelated registries for registrations', () => {
  const file = path.resolve('fixtures/BP/scripts/safe.js');
  const code = `globalThis.__workbenchScriptExecuted = true;
    // event.blockComponentRegistry.registerCustomComponent('test:comment', {});
    const text = "event.blockComponentRegistry.registerCustomComponent('test:string', {})";
    const ID = 'test:outer'; const changed = { id: 'test:mutated' }; changed.id = getId();
    const unrelated = { registerCustomComponent() {} }; unrelated.registerCustomComponent('test:unrelated', {});
    function shadow(ID) { event.blockComponentRegistry.registerCustomComponent(ID, {}); }
    event.blockComponentRegistry.registerCustomComponent(changed.id, {});
    event.blockComponentRegistry.registerCustomComponent(getId(), {});
    event.blockComponentRegistry.registerCustomComponent(ID, {});`;
  assert.deepEqual(analyze(new Map([[file, code]])).map(c => c.id), ['test:outer']);
  assert.equal(globalThis.__workbenchScriptExecuted, undefined);
  assert.deepEqual(analyze(new Map([[file, 'const broken = {']])) , []);
});
test('saved import changes, script renames/deletions and legacy references update the component index', async t => {
  const base = path.resolve('.test-temp'); await fs.mkdir(base, { recursive: true });
  const root = await fs.mkdtemp(path.join(base, 'blocks-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const project = { root, packs: { behavior: path.join(root, 'custom-bp'), resource: path.join(root, 'custom-rp') } };
  await fs.mkdir(path.join(project.packs.behavior, 'scripts'), { recursive: true }); await fs.mkdir(project.packs.resource);
  const ids = path.join(project.packs.behavior, 'scripts/ids.ts'), main = path.join(project.packs.behavior, 'scripts/main.ts');
  await fs.writeFile(ids, "export const ID = 'test:before';");
  await fs.writeFile(main, "import {ID} from './ids.js'; event.blockComponentRegistry.registerCustomComponent(ID, {}); event.itemComponentRegistry.registerCustomComponent('test:item', {});");
  const index = await content.scan(project); assert.ok(index.values('block_component').has('test:before')); assert.ok(!index.values('block_component').has('test:item'));
  await fs.writeFile(ids, "export const ID = 'test:after';"); await content.update(index, ids);
  assert.ok(index.values('block_component').has('test:after')); assert.ok(!index.values('block_component').has('test:before'));
  const json = require('jsonc-parser'), text = JSON.stringify(block({ 'test:after': true, 'test:item': {}, 'minecraft:custom_components': ['test:after'] }));
  const document = { side: 'behavior', file: 'blocks/example.json', text, tree: json.parseTree(text) };
  const issues = content.customComponentIssues(index, document); assert.equal(issues.length, 1); assert.match(issues[0].message, /registered for items/);
  const renamed = path.join(project.packs.behavior, 'scripts/renamed.ts');
  await fs.rename(main, renamed); await content.update(index, main); await content.update(index, renamed);
  assert.ok(index.values('block_component').has('test:after'));
  await fs.rm(renamed); await content.update(index, renamed); assert.equal(index.values('block_component').size, 0);
});
