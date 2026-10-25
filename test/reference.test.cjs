const { test } = require('node:test');
const assert = require('node:assert/strict');
const { zipSync, strToU8 } = require('fflate');
const { buildIndex, chooseRelease, closest, componentSchema } = require('../src/reference.cjs');
function archive() {
  const json = value => strToU8(JSON.stringify(value));
  return zipSync({
    'behavior_pack/items/apple.json':json({'minecraft:item':{description:{identifier:'minecraft:apple'}}}),
    'behavior_pack/blocks/stone.json':json({'minecraft:block':{description:{identifier:'minecraft:stone'}}}),
    'behavior_pack/loot_tables/blocks/stone.json':json({pools:[]}),
    'resource_pack/models/entity/test.geo.json':json({'minecraft:geometry':[{description:{identifier:'geometry.vanilla_test'}}]}),
    'resource_pack/texts/en_US.lang':strToU8('item.apple.name=Apple\n'),
    'resource_pack/animations/test.json':json({animations:{'animation.vanilla_test':{}}}),
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
  assert.equal(index.intelligenceVersion, 7);assert.deepEqual(index.languages[0].values,[['item.apple.name','Apple',0]]);
  assert.deepEqual(index.vanilla.terrain_texture, ['stone']);
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
