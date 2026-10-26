const { test } = require('node:test');
const assert = require('node:assert/strict');
const { zipSync, strToU8 } = require('fflate');
const { buildIndex, chooseRelease, closest, componentSchema } = require('../src/reference.cjs');
function archive() {
  const json = value => strToU8(JSON.stringify(value));
  return zipSync({
    'metadata/vanilladata_modules/mojang-items.json':json({data_items:[{command_name:'minecraft:cod',serialization_id:'item.fish'}]}),
    'metadata/vanilladata_modules/mojang-blocks.json':json({data_items:[{name:'minecraft:stone',serialization_id:'tile.stone.stone'}]}),
    'behavior_pack/items/apple.json':json({'minecraft:item':{description:{identifier:'minecraft:apple'}}}),
    'behavior_pack/blocks/stone.json':json({'minecraft:block':{description:{identifier:'minecraft:stone'}}}),
    'behavior_pack/loot_tables/blocks/stone.json':json({pools:[]}),
    'resource_pack/models/entity/test.geo.json':json({'minecraft:geometry':[{description:{identifier:'geometry.vanilla_test'}}]}),
    'resource_pack/texts/en_US.lang':strToU8('item.apple.name=Apple\n'),
    'resource_pack/animations/test.json':json({animations:{'animation.vanilla_test':{}}}),
    'behavior_pack/animations/server.json':json({animations:{'animation.server_only':{}}}),
    'resource_pack/materials/test.material':strToU8('{// custom material\n"materials":{"version":"1.0.0","vanilla_material:entity":{}}}'),
    'resource_pack/textures/terrain_texture.json': strToU8('{// atlas\n"texture_data":{"stone":{"textures":"textures/blocks/stone"}}}'),
    'resource_pack/textures/item_texture.json': json({texture_data: {apple: {textures: 'textures/items/apple'}}}),
    'metadata/doc_modules/blocks.json': json({ name: 'Blocks', nodes: [{ name: 'Block Components', nodes: [{ name: 'minecraft:friction', type: 'number', description: ['Controls friction.'], nodes: [] }] }] }),
    'metadata/doc_modules/entities.json': json({ name: 'Entities', nodes: [{ name: 'Server Entity Documentation', nodes: [{ name: 'Components', nodes: [{ name: 'minecraft:health', description: ['Entity health.'], nodes: [{ name: 'value', type: 'Integer', description: ['Starting health.'] }] }] }] }] }),
    'metadata/json_schemas/server/item/1.26.30/Item Components.json': json({ properties: { 'minecraft:food': { $ref: '../1.20.50/food.json', description: 'Food behavior.' } } }),
    'metadata/json_schemas/server/item/1.20.50/food.json': json({ type: 'object', properties: { nutrition: { type: 'integer', description: 'Nutrition.', default: 4 } } }),
    'metadata/json_schemas/server/item/beta/Item Components.json': json({ properties: { 'minecraft:future': { type: 'boolean' } } })
  });
}
test('Mojang documentation and schema references supply component and field descriptions without beta content', () => {
  const index = buildIndex(archive(), 'v1.26.50.4');
  assert.deepEqual(index.vanillaNames.item['minecraft:cod'],['item.fish.name','item.fish']);assert.deepEqual(index.vanillaNames.block['minecraft:stone'],['tile.stone.stone.name','tile.stone.stone']);assert.equal(index.intelligenceVersion, 12);assert.deepEqual(index.languages[0].values,[['item.apple.name','Apple',0]]);
  assert.deepEqual(index.vanilla.terrain_texture, ['stone']);
  assert.ok(index.vanilla.material.includes('vanilla_material'));assert.ok(index.vanillaBySide.resource.animation.includes('animation.vanilla_test'));assert.ok(!index.vanillaBySide.resource.animation.includes('animation.server_only'));
  assert.deepEqual(index.vanilla.item_texture, ['apple']);
  assert.ok(index.vanilla.item.includes('minecraft:apple'));
  assert.ok(index.vanilla.block.includes('minecraft:stone'));
  assert.deepEqual(index.vanilla.geometry,['geometry.vanilla_test']);
  assert.ok(index.vanilla.texture.includes('textures/blocks/stone'));
  assert.deepEqual(index.vanilla.loot_table,['loot_tables/blocks/stone.json']);
  assert.equal(index.components.block['minecraft:friction'].description, 'Controls friction.');
  assert.equal(index.components.entity['minecraft:health'].fields.value.description, 'Starting health.');
  assert.equal(index.components.item['minecraft:food'].fields.nutrition.default, 4);
  assert.equal(index.components.item['minecraft:future'], undefined);
  const schema = componentSchema(index, 'item');
  const components = schema.properties['minecraft:item'].properties.components;
  const food=schema.allOf.find(branch=>branch.then?.properties['minecraft:item']?.properties.components.properties['minecraft:food'])?.then.properties['minecraft:item'].properties.components.properties['minecraft:food'];
  assert.equal(food.properties.nutrition.type, 'integer');
  assert.match(food.markdownDescription, /Reference data: Mojang v1.26.50.4/);
  assert.match(food.markdownDescription, /learn.microsoft.com.*minecraft_food\?view=minecraft-bedrock-stable/);
  assert.match(food.properties.nutrition.markdownDescription, /learn.microsoft.com.*minecraft_food/);
  assert.match(food.properties.nutrition.markdownDescription, /Type: integer/);
  assert.equal(components.additionalProperties, true);
  assert.equal(componentSchema(index, 'item', { omit: ['minecraft:food'] }).properties['minecraft:item'].properties.components.properties['minecraft:food'], undefined);
});
test('reference selection respects project target and excludes preview releases', () => {
  const releases = [{ tag_name: 'v1.26.50.4' }, { tag_name: 'v1.26.60.1', prerelease: true }, { tag_name: 'v1.26.40.5' }];
  assert.equal(chooseRelease(releases, '1.26.52').tag_name, 'v1.26.50.4');
  assert.equal(chooseRelease(releases, '1.26.40').tag_name, 'v1.26.40.5');
  assert.equal(chooseRelease(releases, '1.21.0'), undefined);
});
test('spelling suggestions remain close and malformed reference archives fail', () => {
  assert.deepEqual(closest('minecraft:helth', ['minecraft:health', 'minecraft:friction']), ['minecraft:health']);
  assert.throws(() => buildIndex(zipSync({}), 'v1.26.50.4'), /missing component/);
});

test('offline cache stays usable only when its engine does not exceed the target', async t => {
  const fs = require('node:fs/promises'), path = require('node:path');
  const { loadReference } = require('../src/reference.cjs');
  const base = path.resolve('.test-temp'); await fs.mkdir(base, { recursive: true });
  const root = await fs.mkdtemp(path.join(base, 'reference-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, '.bedrock/reference'), { recursive: true });
  const index = { ...buildIndex(archive(), 'v1.26.50.4'), target: '1.26.50', updated: 0 };
  await fs.writeFile(path.join(root, '.bedrock/reference/components.json'), JSON.stringify(index));
  const fetchImpl = async () => { throw new Error('offline'); };
  assert.equal((await loadReference(root, '1.26.52', { fetchImpl })).tag, index.tag);
  await assert.rejects(loadReference(root, '1.26.40', { fetchImpl }), /offline/);
  await assert.rejects(loadReference(root, '1.26.52', { force: true, fetchImpl }), /offline/);
});

test('duplicate hidden metadata references cannot overwrite component prose or fields',()=>{
 const {unzipSync}=require('fflate'),files=unzipSync(archive());
 const declared={name:'minecraft:behavior.open_door',show_in_index:true,description:['Allows the mob to open doors.'],nodes:[{name:'close_door_after',type:'Boolean',description:['Closes the door after passing through.']}]};
 const placeholder={name:declared.name,show_in_index:false,description:['-906200433']};
 for(const nodes of [[declared,placeholder],[placeholder,declared]]){
  files['metadata/doc_modules/entities.json']=strToU8(JSON.stringify({name:'Server Entity Documentation',nodes:[{name:'AI Goals',nodes}]}));
  const index=buildIndex(zipSync(files),'v1.26.50.4'),value=index.components.entity[declared.name];assert.equal(value.description,'Allows the mob to open doors.');assert.equal(value.fields.close_door_after.type,'Boolean');
  const schema=componentSchema(index,'entity');assert.ok(!JSON.stringify(schema).includes('-906200433'));assert.ok(JSON.stringify(schema).includes('minecraftbehavior_open_door'));
 }
});
test('description rendering discards numeric IDs in stale caches without losing real prose',()=>{
 const {descriptionText}=require('../src/reference.cjs');for(const value of [-906200433,'-906200433',' 123456 ',null,{}])assert.equal(descriptionText(value),'');assert.equal(descriptionText(['First paragraph.','-906200433','Second paragraph.']),'First paragraph.\n\nSecond paragraph.');
 const index=buildIndex(archive(),'v1.26.50.4');index.components.entity['minecraft:health'].description='-906200433';assert.ok(!JSON.stringify(componentSchema(index,'entity')).includes('-906200433'));
});

test('trade_interest retains its description and timing fields after a numeric cross-reference',()=>{
 const {unzipSync}=require('fflate'),files=unzipSync(archive());
 const fields=['within_radius','interest_time','remove_item_time','carried_item_switch_time','cooldown'];
 files['metadata/doc_modules/entities.json']=strToU8(JSON.stringify({name:'Server Entity Documentation',nodes:[{name:'AI Goals',nodes:[{name:'minecraft:behavior.trade_interest',show_in_index:true,description:['Allows the mob to look at a player that is holding a tradable item.'],nodes:fields.map(name=>({name,type:'Decimal',description:['Trade interest '+name.replaceAll('_',' ')+'.']}))},{name:'minecraft:behavior.trade_interest',show_in_index:false,description:['-574851053']}]}]}));
 const index=buildIndex(zipSync(files),'v1.26.50.4'),goal=index.components.entity['minecraft:behavior.trade_interest'];
 assert.equal(goal.description,'Allows the mob to look at a player that is holding a tradable item.');assert.deepEqual(Object.keys(goal.fields),[...fields,'priority']);assert.ok(fields.every(name=>goal.fields[name].description));assert.ok(!JSON.stringify(componentSchema(index,'entity')).includes('-574851053'));
});

test('restrict_open_door preserves its real description when a hidden reference has a positive ID',()=>{
 const {unzipSync}=require('fflate'),files=unzipSync(archive());
 files['metadata/doc_modules/entities.json']=strToU8(JSON.stringify({name:'Server Entity Documentation',nodes:[{name:'AI Goals',nodes:[{name:'minecraft:behavior.restrict_open_door',show_in_index:true,description:['Allows the mob to stay indoors during night time.']},{name:'minecraft:behavior.restrict_open_door',show_in_index:false,description:['715583988']}]}]}));
 const index=buildIndex(zipSync(files),'v1.26.50.4');assert.equal(index.components.entity['minecraft:behavior.restrict_open_door'].description,'Allows the mob to stay indoors during night time.');assert.ok(!JSON.stringify(componentSchema(index,'entity')).includes('715583988'));
});

test('pushable_by_block keeps its prose and minimum format after numeric cross-reference import',()=>{
 const {unzipSync}=require('fflate'),files=unzipSync(archive());
 files['metadata/doc_modules/entities.json']=strToU8(JSON.stringify({name:'Server Entity Documentation',nodes:[{name:'Components',nodes:[{name:'minecraft:pushable_by_block',show_in_index:true,description:['Allows block mechanisms to push this entity.']},{name:'minecraft:pushable_by_block',show_in_index:false,description:['-2087846040']}]}]}));
 const index=buildIndex(zipSync(files),'v1.26.50.4'),schema=componentSchema(index,'entity');assert.equal(index.components.entity['minecraft:pushable_by_block'].description,'Allows block mechanisms to push this entity.');assert.ok(!JSON.stringify(schema).includes('-2087846040'));assert.ok(JSON.stringify(schema).includes('1.26.10'));assert.ok(JSON.stringify(schema).includes('minecraftcomponent_pushable_by_block'));
});

test('pushable_by_entity keeps its description and minimum version after numeric cross-reference import',()=>{
 const {unzipSync}=require('fflate'),files=unzipSync(archive());
 files['metadata/doc_modules/entities.json']=strToU8(JSON.stringify({name:'Server Entity Documentation',nodes:[{name:'Components',nodes:[{name:'minecraft:pushable_by_entity',show_in_index:true,description:['Other entities can push this entity.']},{name:'minecraft:pushable_by_entity',show_in_index:false,description:['-1023158512']}]}]}));
 const index=buildIndex(zipSync(files),'v1.26.50.4'),schema=componentSchema(index,'entity');assert.equal(index.components.entity['minecraft:pushable_by_entity'].description,'Other entities can push this entity.');assert.ok(!JSON.stringify(schema).includes('-1023158512'));assert.ok(JSON.stringify(schema).includes('1.26.10'));assert.ok(JSON.stringify(schema).includes('minecraftcomponent_pushable_by_entity'));
});

test('standard AI goal priority is documented when omitted by Mojang field metadata',()=>{
 const {unzipSync}=require('fflate'),files=unzipSync(archive());files['metadata/doc_modules/entities.json']=strToU8(JSON.stringify({name:'Server Entity Documentation',nodes:[{name:'AI Goals',nodes:[{name:'minecraft:behavior.random_hover',description:['Randomly hovers.'],nodes:[{name:'interval',type:'Integer'}]}]}]}));const index=buildIndex(zipSync(files),'v1.26.50.4');assert.equal(index.components.entity['minecraft:behavior.random_hover'].fields.priority.type,'Integer');assert.match(index.components.entity['minecraft:behavior.random_hover'].fields.priority.description,/Lower numbers/);
});
