const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL, fileURLToPath } = require('node:url');
const core = require('./core.cjs');
const { compareVersions } = require('./releases.cjs');
const PACKAGE = path.dirname(require.resolve('@minecraft/bedrock-schemas/catalog.json'));
const VERSION = require(path.join(PACKAGE, 'package.json')).version;
const catalog = require('@minecraft/bedrock-schemas/catalog.json');
const BUILD = 6;
// Independent Workbench replacements. Broader Mojang routes remain fallbacks.
const OWNED = {
  'bp/loot_tables/index.schema.json': require('../schemas/loot-table.schema.json'),
  'bp/recipes/index.schema.json': require('../schemas/recipe.schema.json'),
  'rp/textures/item_texture.schema.json': require('../schemas/texture-atlas.schema.json'),
  'rp/textures/terrain_texture.schema.json': require('../schemas/texture-atlas.schema.json'),
  'rp/sounds/index.schema.json': require('../schemas/sound-definitions.schema.json')
};
const preparing = new Map();
function adapt(schema, relative) {
  function visit(node, key = '') {
    if (!node || typeof node !== 'object') return;
    delete node.$id;
    if (['pivot', 'rotation', 'origin', 'uv', 'position', 'scale', 'visible_bounds_offset', 'size'].includes(key) && node.type === 'array' && node.items?.type === 'string') node.items.type = ['string', 'number'];
    for (const [name, value] of Object.entries(node)) {
      if (name === 'properties') for (const [property, child] of Object.entries(value)) visit(child, property);
      else if (Array.isArray(value)) value.forEach(child => visit(child, key));
      else if (value && typeof value === 'object') visit(value, key);
    }
  }
  visit(schema);
  if (relative === 'bp/recipes/index.schema.json') {
    const kinds = ['shaped', 'shapeless', 'furnace', 'brewing_mix', 'brewing_container', 'smithing_transform', 'smithing_trim', 'material_reduction'];
    schema = { $schema: schema.$schema, title: 'Bedrock recipe', type: 'object', required: ['format_version'], properties: { format_version: { type: 'string' }, ...Object.fromEntries(kinds.map(kind => ['minecraft:recipe_' + kind, kind === 'brewing_mix' ? { $ref: './brewing_mix_recipe_definition.schema.json' } : { type: 'object', description: `Bedrock ${kind.replaceAll('_', ' ')} recipe.`, properties: { description: { type: 'object', properties: { identifier: { type: 'string' } } }, tags: { type: 'array', items: { type: 'string' } }, ingredients: { type: 'array', items: { type: 'object' } }, pattern: { type: 'array', items: { type: 'string' } }, key: { type: 'object' }, result: { anyOf: [{ type: 'string' }, { type: 'object' }, { type: 'array' }] } } }])) } };
  }
  if (relative === 'bp/feature_rules/index.schema.json') schema = { type: 'object', properties: { format_version: { type: 'string' }, 'minecraft:feature_rules': schema }, required: ['format_version', 'minecraft:feature_rules'] };
  if (relative === 'bp/trading/index.schema.json') schema = { type: 'object', properties: { tiers: { type: 'array', items: { type: 'object', properties: { trades: { type: 'array', items: { type: 'object', properties: { wants: { type: 'array' }, gives: { type: 'array' }, max_uses: { type: 'integer' } } } }, groups: { type: 'array' } } } } } };
  if (relative === 'rp/textures/texture_set.schema.json') schema = { type: 'object', properties: { format_version: { type: 'string' }, 'minecraft:texture_set': schema }, required: ['format_version', 'minecraft:texture_set'] };
  if (relative === 'rp/textures/flipbook_textures.schema.json') schema = { type: 'array', items: schema };
  if (relative === 'rp/texts/languages.schema.json') schema = { type: 'array', items: { type: 'string' } };
  if (relative === 'rp/sounds/music_definitions.schema.json') schema = { type: 'object', additionalProperties: { type: 'object', properties: { event_name: { type: 'string' }, min_delay: { type: 'number' }, max_delay: { type: 'number' } } } };
  if (relative === 'rp/textures/item_texture.schema.json' || relative === 'rp/textures/terrain_texture.schema.json') {
    schema.properties.texture_data = { type: 'object', additionalProperties: { type: 'object', properties: { textures: { anyOf: [{ type: 'string' }, { type: 'array' }, { type: 'object' }] } } } };
    schema.required = (schema.required || []).filter(key => key !== 'resource_pack_name');
  }
  if (relative === 'rp/textures/blocks_resource.schema.json' && schema.properties?.format_version) schema.properties.format_version.type = ['string', 'array'];
  // Generated component/subform constraints in this package are incomplete:
  // common legal unions and numeric vectors are sometimes narrowed incorrectly.
  // Retain their documentation/completions, but enforce types only at audited
  // document boundaries. Native component reference schemas provide additional
  // documented BP type checks; semantic checks run separately.
  const entry = catalog.schemas.some(item => item.url === './schemas/' + relative);
  function conservative(node, depth = 0) {
    if (!node || typeof node !== 'object') return;
    if (!entry || depth > 1) for (const key of ['type', 'enum', 'const', 'required', 'minimum', 'maximum', 'minItems', 'maxItems', 'pattern']) delete node[key];
    if (node.additionalProperties === false) node.additionalProperties = true;
    if (node.oneOf) { node.anyOf = node.oneOf; delete node.oneOf; }
    for (const [key, value] of Object.entries(node)) {
      if (['default', 'examples', 'defaultSnippets'].includes(key)) continue;
      if (key === 'properties' || key === 'patternProperties' || key === '$defs' || key === 'definitions') for (const child of Object.values(value)) conservative(child, depth + 1);
      else if (Array.isArray(value)) value.forEach(child => conservative(child, depth));
      else if (value && typeof value === 'object') conservative(value, depth + (['items', 'additionalProperties'].includes(key) ? 1 : 0));
    }
  }
  conservative(schema);
  return schema;
}
function routes() {
  return catalog.schemas.map(entry => {
    const relative = entry.url.replace('./schemas/', ''), side = relative.startsWith('bp/') ? 'behavior' : 'resource';
    const specific = {
      'bp/functions/tick.schema.json': ['functions/tick.json'],
      'rp/sounds/index.schema.json': ['sounds/sound_definitions.json'],
      'rp/textures/blocks_resource.schema.json': ['blocks.json'],
      'rp/textures/terrain_texture.schema.json': ['textures/terrain_texture.json'],
      'rp/textures/item_texture.schema.json': ['textures/item_texture.json'],
      'rp/textures/flipbook_textures.schema.json': ['textures/flipbook_textures.json'],
      'rp/textures/texture_set.schema.json': ['textures/**/*.texture_set.json', 'textures/texture_set.json'],
      'rp/texts/languages.schema.json': ['texts/languages.json'],
      'rp/sounds/music_definitions.schema.json': ['sounds/music_definitions.json'],
      'rp/ui/global_variables.schema.json': ['ui/_global_variables.json'],
      'rp/deferred_rendering/lighting.schema.json': ['lighting/**/*.json'],
      'rp/deferred_rendering/color_grading.schema.json': [],
      'rp/deferred_rendering/atmospherics.schema.json': ['atmospherics/**/*.json'],
      'rp/deferred_rendering/pbr.schema.json': ['pbr/**/*.json'],
      'rp/deferred_rendering/point_lights.schema.json': ['point_lights/**/*.json'],
      'rp/deferred_rendering/shadows.schema.json': ['shadows/**/*.json'],
      'rp/deferred_rendering/water.schema.json': ['water/**/*.json']
    };
    const patterns = specific[relative] || entry.fileMatch.map(pattern => pattern.replace(/^\*\*\//, ''));
    if (relative === 'rp/ui/index.schema.json') patterns.push('!ui/_global_variables.json', '!ui/_ui_defs.json');
    return { relative, side, patterns, name: entry.name };
  }).concat([
    { relative: 'bp/animations/index.schema.json', side: 'resource', patterns: ['animations/**/*.json'], name: 'Resource animations' },
    { relative: 'bp/animation_controllers/index.schema.json', side: 'resource', patterns: ['animation_controllers/**/*.json'], name: 'Resource animation controllers' }
  ]).filter(entry => entry.patterns.length);
}
function glob(pattern) {
  return new RegExp('^' + pattern.split('**/').map(part => part.split('**').map(piece => piece.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*')).join('(?:.*/)?') + '$');
}
function match(route, file) { return route.patterns.some(p => !p.startsWith('!') && glob(p).test(file)) && !route.patterns.some(p => p.startsWith('!') && glob(p.slice(1)).test(file)); }
async function prepare(project) {
  if (compareVersions(project.config.targetVersion, VERSION) < 0) return { version: VERSION, directory: null, associations: [], routes: [] };
  const directory = await core.local(project.root, `.bedrock/reference/official-${VERSION}`);
  const cacheKey = JSON.stringify([directory, project.packs]);
  if (!preparing.has(cacheKey)) preparing.set(cacheKey, (async () => {
    const marker = path.join(directory, 'ready.json');
    const ready = await core.readJson(marker).catch(() => null);
    if (ready?.build !== BUILD) {
      for await (const file of core.files(path.join(PACKAGE, 'schemas'))) {
        if (!file.endsWith('.json')) continue;
        const destination = await core.local(project.root, path.relative(project.root, path.join(directory, file)));
        const schema = JSON.parse(await fs.readFile(path.join(PACKAGE, 'schemas', file), 'utf8'));
        const relative = file.replaceAll(path.sep, '/');
        const owned = OWNED[relative];
        const next = owned || adapt(schema, relative);
        const current = await core.readJson(destination).catch(() => null);
        // Schema revisions usually replace only a few entry points. Avoid
        // flooding file watchers by rewriting every unchanged cached file.
        if (JSON.stringify(current) !== JSON.stringify(next)) await core.writeJson(destination, next);
      }
      await core.writeJson(await core.local(project.root, path.relative(project.root, path.join(directory, 'common/expression.schema.json'))), { anyOf: [{ type: 'string' }, { type: 'number' }], description: 'Molang expression: a string expression or numeric literal.' });
      await core.writeJson(marker, { build: BUILD, version: VERSION });
    }
    const mappings = routes();
    return { version: VERSION, directory, routes: mappings, associations: mappings.map(route => ({ fileMatch: route.patterns.map(p => (p.startsWith('!') ? '!' : '') + path.join(project.packs[route.side], p.replace(/^!/, '')).replaceAll(path.sep, '/')), url: pathToFileURL(path.join(directory, route.relative)).href })) };
  })().catch(error => { preparing.delete(cacheKey); throw error; }));
  return preparing.get(cacheKey);
}
async function validator(prepared) {
  const Ajv = require('ajv');
  const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false, loadSchema: async uri => {
    const file = fileURLToPath(uri);
    if (!core.inside(prepared.directory, file)) throw new Error('Schema reference leaves the official schema directory');
    return { ...await core.readJson(file), $id: uri };
  } });
  const compiled = new Map();
  return async (side, relative, data) => {
    const route = prepared.routes.find(route => route.side === side && match(route, relative));
    if (!route) return [];
    const uri = pathToFileURL(path.join(prepared.directory, route.relative)).href;
    if (!compiled.has(uri)) compiled.set(uri, ajv.compileAsync({ ...await core.readJson(fileURLToPath(uri)), $id: uri }));
    const validate = await compiled.get(uri); validate(data);
    return (validate.errors || []).map(error => ({ path: error.instancePath, message: `${route.name}: ${error.message}`, keyword: error.keyword }));
  };
}
module.exports = { VERSION, adapt, routes, match, prepare, validator };
