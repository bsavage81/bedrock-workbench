// Original Workbench schema definitions. References and compatibility policy:
// schemas/AUTHORING.md. This generator does not read third-party schemas.
const fs = require('node:fs');
const path = require('node:path');
const string = description => ({ type: 'string', ...(description ? { description } : {}) });
const object = (properties, required = []) => ({ type: 'object', properties, ...(required.length ? { required } : {}) });
const array = items => ({ type: 'array', items });
const ref = name => ({ $ref: '#/definitions/' + name });
const header = title => ({ $schema: 'http://json-schema.org/draft-07/schema#', title: 'Bedrock Workbench ' + title });
const ingredient = { anyOf: [{
  ...object({ item: string('Input item identifier.'), tag: string('An item tag matching eligible ingredients.'), data: { type: 'integer', description: 'Legacy auxiliary value.' }, count: { type: 'integer', minimum: 1 } }),
  anyOf: [{ required: ['item'] }, { required: ['tag'] }]
}, string('Item identifier, including a legacy auxiliary suffix where supported.')] };
const result = { anyOf: [object({ item: string('Output item identifier.'), data: { type: 'integer' }, count: { type: 'integer', minimum: 1 } }, ['item']), string('Output item identifier.')] };
const common = {
  description: object({ identifier: string('Unique recipe identifier.') }, ['identifier']),
  tags: { ...array(string()), description: 'Stations that can use this recipe, such as crafting_table, stonecutter, or furnace.' },
  priority: { type: 'integer', description: 'Smaller values take precedence among competing recipes.' },
  unlock: { anyOf: [ref('unlock'), array(ref('unlock'))], description: 'Recipe-book discovery conditions; a context object or an ingredient/context array. Availability depends on format version.' }
};
const variants = {
  shaped: object({ ...common,
    pattern: { ...array({ type: 'string', minLength: 1, maxLength: 3 }), minItems: 1, maxItems: 3, description: 'Crafting rows. Spaces leave slots empty; other characters refer to key.' },
    key: { type: 'object', propertyNames: { minLength: 1, maxLength: 1, pattern: '^[^ ]$' }, additionalProperties: ref('ingredient'), description: 'Maps each non-space pattern symbol to an ingredient.' },
    result: ref('results'), assume_symmetry: { type: 'boolean', description: 'Allow mirrored patterns to use this recipe.' }
  }, ['description', 'pattern', 'key', 'result']),
  shapeless: object({ ...common, ingredients: { ...array(ref('ingredient')), minItems: 1, description: 'Ingredients accepted in any arrangement.' }, result: ref('results') }, ['description', 'ingredients', 'result']),
  furnace: object({ ...common, input: ref('ingredient'), output: ref('result') }, ['description', 'input', 'output']),
  brewing_mix: object({ ...common, input: ref('ingredient'), reagent: ref('ingredient'), output: ref('result') }, ['description', 'input', 'reagent', 'output']),
  brewing_container: object({ ...common, input: ref('ingredient'), reagent: ref('ingredient'), output: ref('result') }, ['description', 'input', 'reagent', 'output']),
  smithing_transform: object({ ...common, template: ref('ingredient'), base: ref('ingredient'), addition: ref('ingredient'), result: ref('result') }, ['description', 'base', 'addition', 'result']),
  smithing_trim: object({ ...common, template: ref('ingredient'), base: ref('ingredient'), addition: ref('ingredient') }, ['description', 'template', 'base', 'addition'])
};
const stationTags = {
  shaped: ['crafting_table'],
  shapeless: ['crafting_table', 'stonecutter', 'cartography_table'],
  furnace: ['furnace', 'blast_furnace', 'smoker', 'campfire', 'soul_campfire'],
  brewing_mix: ['brewing_stand'], brewing_container: ['brewing_stand'],
  smithing_transform: ['smithing_table'], smithing_trim: ['smithing_table']
};
for (const [kind, schema] of Object.entries(variants)) {
  schema.description = `Workbench structural validation for ${kind.replaceAll('_', ' ')} recipes. Unknown extension fields are allowed.`;
  // The enum contributes native JSON suggestions; the open string alternative
  // keeps custom station tags valid rather than turning suggestions into limits.
  schema.properties.tags = { ...common.tags, items: { anyOf: [{ type: 'string', enum: stationTags[kind] }, string('Custom recipe station tag.')] } };
}
const recipe = { ...header('recipe'), ...object({ format_version: string('Recipe format version; older two-part versions remain valid.'), ...Object.fromEntries(Object.entries(variants).map(([kind, value]) => ['minecraft:recipe_' + kind, value])) }, ['format_version']),
  patternProperties: { '^minecraft:recipe_': { type: 'object' } },
  definitions: { ingredient, result, unlock: object({ item: string(), data: { type: 'integer' }, context: string('Recipe discovery context, such as AlwaysUnlocked.') }), results: { anyOf: [ref('result'), { ...array(ref('result')), minItems: 1 }] } }
};
const texturePath = { anyOf: [string('Texture path relative to the resource pack, normally without its extension.'), object({ path: string('Texture image path.'), overlay_color: string('Optional color overlay.'), tint_color: string('Optional tint color.') }, ['path'])] };
const atlas = { ...header('texture atlas'), ...object({
  resource_pack_name: string('Optional resource-pack label.'), texture_name: string('Atlas name, normally atlas.items or atlas.terrain.'),
  padding: { type: 'integer', minimum: 0, description: 'Padding used when constructing the atlas.' }, num_mip_levels: { type: 'integer', minimum: 0 },
  texture_data: { type: 'object', description: 'Named texture entries referenced by items and blocks.', additionalProperties: object({ textures: { anyOf: [ref('texturePath'), { ...array(ref('texturePath')), minItems: 1 }] } }, ['textures']) }
}, ['texture_data']), definitions: { texturePath } };
const soundFile = { anyOf: [string('Sound file path, usually without an extension.'), object({
  name: string('Sound file path.'), volume: { type: 'number' }, pitch: { type: 'number' }, weight: { type: 'number' },
  stream: { type: 'boolean', description: 'Stream this audio instead of loading it all at once.' }, load_on_low_memory: { type: 'boolean' }, is3D: { type: 'boolean' }
}, ['name'])] };
const soundEvent = object({
  category: string('Sound mixer category. Kept open for supported engine categories.'),
  sounds: { ...array(ref('soundFile')), description: 'Candidate audio files, as paths or objects with playback settings.' },
  min_distance: { type: ['number', 'null'] }, max_distance: { type: ['number', 'null'] },
  use_legacy_max_distance: { type: 'boolean' },
  __use_legacy_max_distance: { type: ['boolean', 'string'], description: 'Legacy compatibility setting; published packs also use string values.' }
});
const sounds = { ...header('sound definitions'), ...object({
  format_version: string('Sound-definition format version.'),
  sound_definitions: { type: 'object', description: 'Maps sound event identifiers to audio definitions.', additionalProperties: ref('soundEvent') }
}, ['sound_definitions']), definitions: { soundFile, soundEvent } };
for (const [name, schema] of Object.entries({ recipe, 'texture-atlas': atlas, 'sound-definitions': sounds })) fs.writeFileSync(path.join(__dirname, '../schemas', name + '.schema.json'), JSON.stringify(schema, null, 2) + '\n');
