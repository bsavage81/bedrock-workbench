const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const core = require('../src/core.cjs');
const schemas = require('../src/official-schemas.cjs');
const content = require('../src/content.cjs');
const { validateProject } = require('../src/validation.cjs');
async function fixture(t) {
  const base = path.resolve('.test-temp'); await fs.mkdir(base, { recursive: true });
  const root = await fs.mkdtemp(path.join(base, 'intelligence-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const [folder, type] of [['BP', 'data'], ['RP', 'resources']]) {
    await fs.mkdir(path.join(root, folder));
    await core.writeJson(path.join(root, folder, 'manifest.json'), { format_version: 2, header: { name: 'Intelligence', description: 'Test', uuid: randomUUID(), version: [1, 0, 0], min_engine_version: [1, 26, 50] }, modules: [{ type, uuid: randomUUID(), version: [1, 0, 0] }] });
  }
  await core.initialize(root); return core.loadProject(root);
}
test('schema routes scope exact file types to their correct pack and handle nested paths', () => {
  const routes = schemas.routes();
  const sounds = routes.find(r => r.name === 'Sound Definition');
  assert.equal(sounds.side, 'resource'); assert.ok(schemas.match(sounds, 'sounds/sound_definitions.json')); assert.ok(!schemas.match(sounds, 'sounds/arbitrary.json'));
  const textures = routes.find(r => r.name === 'Texture Set');
  assert.ok(schemas.match(textures, 'textures/blocks/stone.texture_set.json'));
  const models = routes.find(r => r.name === 'Model Geometry'); assert.ok(schemas.match(models, 'models/entity/nested/model.geo.json'));
  assert.ok(!schemas.match(models, 'textures/model.json'));
});
test('schema compatibility adapts known root/recipe/vector issues and strips problematic relative IDs', () => {
  const adapted = schemas.adapt({ $id: 'relative/id', properties: { pivot: { type: 'array', items: { type: 'string' } } } }, 'rp/models/index.schema.json');
  assert.equal(adapted.$id, undefined);
  const validate = new (require('ajv'))({ strict: false }).compile(adapted);
  assert.ok(validate({ pivot: [0, 0, 0] })); assert.ok(validate({ pivot: ['0', '0', '0'] })); assert.ok(!validate({ pivot: 'invalid' }));
  const recipes = schemas.adapt({}, 'bp/recipes/index.schema.json'); assert.ok(recipes.properties['minecraft:recipe_shaped']); assert.ok(!recipes.required.includes('minecraft:recipe_brewing_mix'));
  assert.equal(schemas.adapt({}, 'rp/texts/languages.schema.json').type, 'array');
});
test('incremental index refresh removes renamed identifiers, deleted textures, and fixed JSON issues', async t => {
  const project = await fixture(t), file = path.join(project.packs.behavior, 'items/item.json');
  await core.writeJson(file, { 'minecraft:item': { description: { identifier: 'test:old' } } });
  const index = await content.scan(project); assert.ok(index.values('item').has('test:old'));
  await core.writeJson(file, { 'minecraft:item': { description: { identifier: 'test:new' } } });
  await content.update(index, process.platform === 'win32' ? file.toLowerCase() : file); assert.ok(!index.values('item').has('test:old')); assert.ok(index.values('item').has('test:new'));
  await fs.writeFile(file, '{invalid'); await content.update(index, file); assert.ok(index.issues.some(issue => issue.file === file));
  await fs.writeFile(file, '\uFEFF{"minecraft:item":{"description":{"identifier":"test:fixed"}}}');
  await content.update(index, file); assert.ok(!index.issues.some(issue => issue.file === file)); assert.ok(index.values('item').has('test:fixed'));
  await fs.rm(file); await content.update(index, file); assert.ok(!index.values('item').has('test:fixed'));
});
test('older targets receive version-aware owned schemas without newer Mojang fallback routes', async t => {
  const project = await fixture(t); project.config.targetVersion = '1.21.0';
  const prepared=await schemas.prepare(project);assert.ok(prepared.associations.length);assert.ok(prepared.routes.some(r=>r.relative==='bp/blocks/index.schema.json'));assert.ok(!prepared.routes.some(r=>r.relative==='rp/entity/index.schema.json'));assert.ok(!prepared.routes.some(r=>r.relative==='bp/features/index.schema.json'));
});
test('content indexing supplies identifiers, textures, geometry and reference diagnostics without treating vanilla IDs as missing', async t => {
  const project = await fixture(t);
  await core.writeJson(path.join(project.packs.behavior, 'items/custom.json'), { format_version: '1.26.50', 'minecraft:item': { description: { identifier: 'test:item' }, components: {} } });
  await core.writeJson(path.join(project.packs.resource, 'models/entity/custom.geo.json'), { format_version: '1.12.0', 'minecraft:geometry': [{ description: { identifier: 'geometry.test' }, bones: [] }] });
  await fs.mkdir(path.join(project.packs.resource, 'textures/entity'), { recursive: true }); await fs.writeFile(path.join(project.packs.resource, 'textures/entity/test.png'), 'image');
  await core.writeJson(path.join(project.packs.resource, 'entity/custom.json'), { format_version: '1.10.0', 'minecraft:client_entity': { description: { identifier: 'test:mob', textures: { default: 'textures/entity/test', missing: 'textures/entity/other' }, geometry: { default: 'geometry.test' } } } });
  const index = await content.scan(project); assert.ok(index.values('item').has('test:item')); assert.ok(index.values('geometry').has('geometry.test')); assert.ok(index.values('texture').has('textures/entity/test'));
  const doc = index.documents.get(path.join(project.packs.resource, 'entity/custom.json'));
  const issues = content.referenceIssues(index, doc); assert.equal(issues.length, 1); assert.match(issues[0].message, /another pack/);
});
test('Mojang Molang parser supplies basic diagnostics and descriptions, without parsing ordinary identifiers', () => {
  const json = require('jsonc-parser');
  const text = '{"animations":{"animation.test":{"bones":{"body":{"rotation":["math.sin(query.anim_time",0,0]}}}}}';
  const document = { relative: 'animations/test.json', text, tree: json.parseTree(text), file: 'test.json' };
  assert.ok(content.molangIssues(document).some(e => e.message.includes('closing parenthesis')));
  assert.ok(content.MOLANG_QUERIES.some(e => e.name === 'query.anim_time'));
  const ordinary = { ...document, relative: 'texts/test.json' }; assert.deepEqual(content.molangIssues(ordinary), []);
});
test('official schema runtime validates real file shapes and reports useful project findings', async t => {
  const project = await fixture(t), prepared = await schemas.prepare(project), validate = await schemas.validator(prepared);
  const examples = [
    ['behavior', 'recipes/shaped.json', { format_version: '1.20.10', 'minecraft:recipe_shaped': { description: { identifier: 'test:craft' }, tags: ['crafting_table'], pattern: ['A'], key: { A: { item: 'minecraft:stone' } }, result: { item: 'minecraft:cobblestone' } } }],
    ['resource', 'models/entity/test.geo.json', { format_version: '1.12.0', 'minecraft:geometry': [{ description: { identifier: 'geometry.test', texture_width: 16, texture_height: 16, visible_bounds_offset: [0, 0, 0] }, bones: [{ name: 'body', pivot: [0, 0, 0], cubes: [{ origin: [-1, 0, -1], size: [2, 2, 2], uv: [0, 0] }] }] }] }],
    ['resource', 'texts/languages.json', ['en_US']],
    ['resource', 'textures/flipbook_textures.json', [{ flipbook_texture: 'textures/blocks/test', atlas_tile: 'test', ticks_per_frame: 1 }]],
    ['resource', 'textures/blocks/test.texture_set.json', { format_version: '1.16.100', 'minecraft:texture_set': { color: 'test' } }],
    ['behavior', 'feature_rules/test.json', { format_version: '1.13.0', 'minecraft:feature_rules': { description: { identifier: 'test:feature', places_feature: 'test:placed' }, conditions: { placement_pass: 'surface_pass' }, distribution: { iterations: 1, x: 0, y: 64, z: 0 } } }]
  ];
  for (const [side, file, data] of examples) assert.deepEqual(await validate(side, file, data), [], file);
  assert.ok((await validate('behavior', 'loot_tables/test.json', { pools: 'invalid' })).length);
  await core.writeJson(path.join(project.packs.behavior, 'loot_tables/test.json'), { pools: 'invalid' });
  const manifest = await core.readJson(path.join(project.packs.behavior, 'manifest.json'));
  manifest.modules.push({ type: 'script', language: 'javascript', uuid: randomUUID(), version: [1, 0, 0], entry: 'scripts/missing.js' });
  await core.writeJson(path.join(project.packs.behavior, 'manifest.json'), manifest);
  const before = await fs.readFile(path.join(project.packs.behavior, 'manifest.json'), 'utf8');
  const result = await validateProject(project.root);
  assert.ok(result.issues.some(e => e.message.includes('Script entry'))); assert.ok(result.issues.some(e => e.message.includes('Loot Table')));
  assert.equal(await fs.readFile(path.join(project.packs.behavior, 'manifest.json'), 'utf8'), before);
});
