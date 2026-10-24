const { test } = require('node:test');
const assert = require('node:assert/strict');
const Ajv = require('ajv');
const ajv = new Ajv({ strict: false, allErrors: true });
const recipe = ajv.compile(require('../schemas/recipe.schema.json'));
const atlas = ajv.compile(require('../schemas/texture-atlas.schema.json'));
const sounds = ajv.compile(require('../schemas/sound-definitions.schema.json'));
const doc = (kind, payload, version = '1.20.10') => ({ format_version: version, ['minecraft:recipe_' + kind]: { description: { identifier: 'example:recipe' }, ...payload } });
const validRecipes = [
  doc('shaped', { pattern: ['A ', ' A'], key: { A: { tag: 'minecraft:planks' } }, result: { item: 'example:tool', count: 2 }, unlock: { context: 'PlayerHasManyItems' } }, '1.16'),
  doc('shapeless', { ingredients: [{ item: 'example:ore', data: -1 }, { tag: 'minecraft:coals' }], result: [{ item: 'example:ingot' }], unlock: [{ item: 'example:ore' }] }),
  doc('furnace', { input: 'example:ore', output: 'example:ingot' }, '1.12'),
  doc('furnace', { input: { item: 'example:ore', count: 1 }, output: { item: 'example:ingot' } }),
  doc('brewing_mix', { input: 'minecraft:potion_type:awkward', reagent: 'example:herb', output: 'minecraft:potion_type:healing' }),
  doc('brewing_container', { input: 'minecraft:potion', reagent: 'minecraft:gunpowder', output: 'minecraft:splash_potion' }),
  doc('smithing_transform', { template: 'example:template', base: 'example:tool', addition: 'example:ingot', result: 'example:upgraded' }),
  doc('smithing_transform', { base: 'example:tool', addition: 'example:ingot', result: 'example:upgraded' }, '1.16'),
  doc('smithing_trim', { template: { tag: 'minecraft:trim_templates' }, base: { tag: 'minecraft:trimmable_armors' }, addition: { tag: 'minecraft:trim_materials' } })
];
test('recipe compatibility: legacy forms, tag ingredients, modern unlock forms and each verified variant', () => {
  for (const value of validRecipes) assert.ok(recipe(value), JSON.stringify(recipe.errors));
  assert.ok(recipe(doc('future_station', { custom_future_payload: true })));
  assert.ok(recipe(doc('furnace', { input: 'example:ore', output: 'example:ingot', tags: ['example:custom_furnace'] })));
});
test('recipe defects: missing fields, invalid nested counts, symbol keys and container types', () => {
  const invalid = [
    {}, doc('shaped', { pattern: ['A'], key: { A: { item: 'example:ore' } } }),
    doc('shaped', { pattern: ['AAAA'], key: { A: 'example:ore' }, result: 'example:ingot' }),
    doc('shaped', { pattern: ['A'], key: { AB: 'example:ore' }, result: 'example:ingot' }),
    doc('shapeless', { ingredients: 'example:ore', result: 'example:ingot' }),
    doc('shapeless', { ingredients: [{ item: 'example:ore', count: 0 }], result: 'example:ingot' }),
    doc('furnace', { input: { item: 7 }, output: 'example:ingot' }),
    doc('brewing_mix', { input: 'example:potion', output: 'example:potion' }),
    doc('smithing_transform', { base: 'example:tool', addition: 'example:ore', result: { count: 1 } }),
    doc('smithing_trim', { base: 'example:tool', addition: 'example:ore' })
  ];
  for (const value of invalid) assert.equal(recipe(value), false, JSON.stringify(value));
});
test('atlas compatibility: minimal add-ons, arrays and tinted path objects', () => {
  assert.ok(atlas({ texture_data: { icon: { textures: 'textures/items/example' } } }));
  assert.ok(atlas({ texture_name: 'atlas.terrain', padding: 8, num_mip_levels: 4, texture_data: { block: { textures: ['textures/blocks/example', { path: 'textures/blocks/tinted', overlay_color: '#abcdef', custom: true }] } } }));
  assert.ok(atlas({ texture_data: { block: { textures: { path: 'textures/blocks/example' } } }, custom: {} }));
  for (const value of [{ texture_data: [] }, { texture_data: { block: { textures: 42 } } }, { texture_data: { block: {} } }, { texture_data: { block: { textures: [false] } } }]) assert.equal(atlas(value), false);
});
test('sound compatibility: null distances, legacy flag strings, playback objects and open categories', () => {
  assert.ok(sounds({ format_version: '1.14.0', sound_definitions: { 'example.chime': { category: 'future_category', min_distance: null, max_distance: null, __use_legacy_max_distance: 'true', sounds: ['sounds/example/chime', { name: 'sounds/example/other', stream: true, volume: 0.7, is3D: false }] } } }));
  for (const value of [{ sound_definitions: [] }, { sound_definitions: { example: { sounds: 'wrong' } } }, { sound_definitions: { example: { sounds: [{ volume: 1 }] } } }, { sound_definitions: { example: { sounds: [{ name: 'sounds/example', stream: 'true' }] } } }]) assert.equal(sounds(value), false);
});
test('audited nested constraints survive the actual cached schema routes', async t => {
  const fs = require('node:fs/promises'), path = require('node:path');
  const base = path.resolve('.test-temp'); await fs.mkdir(base, { recursive: true });
  const root = await fs.mkdtemp(path.join(base, 'authored-schemas-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const runtime = require('../src/official-schemas.cjs');
  const prepared = await runtime.prepare({ root, packs: { behavior: path.join(root, 'custom-behavior'), resource: path.join(root, 'custom-resource') }, config: { targetVersion: '1.26.50' } });
  const validate = await runtime.validator(prepared);
  assert.equal((await validate('behavior', 'recipes/nested/example.json', validRecipes[0])).length, 0);
  assert.ok((await validate('behavior', 'recipes/example.json', doc('shapeless', { ingredients: [{ item: 'test:ore', count: 0 }], result: 'test:ingot' }))).some(e => e.path.endsWith('/count')));
  assert.ok((await validate('resource', 'textures/item_texture.json', { texture_data: { bad: { textures: false } } })).length);
  assert.ok((await validate('resource', 'textures/terrain_texture.json', { texture_data: [] })).length);
  assert.ok((await validate('resource', 'sounds/sound_definitions.json', { sound_definitions: { bad: { sounds: [{ name: 42 }] } } })).length);
  assert.equal((await validate('behavior', 'sounds/sound_definitions.json', { sound_definitions: [] })).length, 0);
  assert.ok(prepared.associations.some(a => a.fileMatch.some(p => p.includes('custom-behavior/recipes/'))));
  // Simulate an older cache revision: changed entry points must be repaired,
  // while unrelated schemas keep their timestamps (and avoid watcher events).
  const untouched = path.join(prepared.directory, 'rp/texts/languages.schema.json');
  await fs.utimes(untouched, new Date(1000000), new Date(1000000));
  const before = (await fs.stat(untouched)).mtimeMs;
  await fs.writeFile(path.join(prepared.directory, 'bp/recipes/index.schema.json'), '{}');
  await fs.writeFile(path.join(prepared.directory, 'ready.json'), JSON.stringify({ build: 3 }));
  const refreshed = await runtime.prepare({ root, packs: { behavior: path.join(root, 'other-bp'), resource: path.join(root, 'other-rp') }, config: { targetVersion: '1.26.50' } });
  assert.equal((await fs.stat(untouched)).mtimeMs, before);
  const revalidate = await runtime.validator(refreshed);
  assert.ok((await revalidate('behavior', 'recipes/test.json', doc('furnace', { input: 42, output: 'test:ore' }))).length);
});
