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
// Function names/parameter shapes are checked against Mojang's documentation
// and sample loot tables; descriptions and starter objects are authored here.
const functions = {
  set_count: ['Choose the stack size.', { count: ref('range'), add: { type: 'boolean' } }, { count: 1 }],
  set_damage: ['Choose remaining item durability.', { damage: ref('range'), add: { type: 'boolean' } }, { damage: { min: 0.5, max: 1 } }],
  set_data: ['Choose legacy item data.', { data: ref('range') }, { data: 0 }],
  enchant_randomly: ['Choose a compatible random enchantment.', { treasure: { type: 'boolean' } }, { treasure: false }],
  enchant_with_levels: ['Enchant using an experience level.', { levels: ref('range'), treasure: { type: 'boolean' } }, { levels: 30, treasure: false }],
  enchant_random_gear: ['Apply mob-equipment enchantment rules.', { chance: { type: 'number' } }, { chance: 0.25 }],
  specific_enchants: ['Choose explicit enchantments.', { enchants: array({ anyOf: [string(), object({ id: { type: ['string', 'integer'] }, level: { anyOf: [ref('range'), array({ type: 'number' })] } })] }) }, { enchants: [{ id: 'sharpness', level: 1 }] }],
  looting_enchant: ['Adjust drops for Looting.', { count: ref('range'), limit: { type: 'number' } }, { count: { min: 0, max: 1 } }],
  furnace_smelt: ['Use the cooked item variant.', { conditions: array(ref('lootCondition')) }, {}],
  explosion_decay: ['Reduce drops after an explosion.', {}, {}],
  set_actor_id: ['Choose a spawn-egg entity.', { id: string() }, { id: 'minecraft:pig' }],
  set_data_from_color_index: ['Inherit the source entity color.', {}, {}],
  set_name: ['Set the item display name.', { name: string() }, { name: 'Custom item' }],
  set_lore: ['Set item description lines.', { lore: array(string()) }, { lore: ['Custom lore'] }],
  set_potion: ['Choose a potion type.', { id: string() }, { id: 'healing' }],
  set_book_contents: ['Set written-book content.', { author: string(), title: string(), pages: array({ anyOf: [string(), { type: 'object' }] }) }, { author: 'Author', title: 'Title', pages: ['Page text'] }],
  set_banner_details: ['Set banner appearance.', { type: { type: ['integer', 'string'] }, base_color: { type: ['integer', 'string'] }, patterns: array({ type: 'object' }) }, { type: 0 }],
  set_armor_trim: ['Choose an armor trim.', { material: string(), pattern: string() }, { material: 'copper', pattern: 'flow' }],
  set_stew_effect: ['Choose suspicious-stew effects.', { effects: array(object({ id: { type: ['integer', 'string'] } })) }, { effects: [{ id: 0 }] }],
  set_ominous_bottle_amplifier: ['Choose the Bad Omen amplifier.', { amplifier: ref('range') }, { amplifier: { min: 0, max: 3 } }],
  random_aux_value: ['Randomize legacy item data.', { values: ref('range') }, { values: { min: 0, max: 6 } }],
  random_block_state: ['Randomize an item block state.', {}, {}],
  exploration_map: ['Create a destination map.', { destination: string() }, { destination: 'buriedtreasure' }],
  fill_container: ['Fill a placed container from loot.', { loot_table: string() }, { loot_table: 'loot_tables/chests/custom.json' }]
};
const canonicalFunction = name => name === 'set_stew_effect' ? 'minecraft:' + name : name;
const toolRange = { anyOf: [{ type: 'number' }, object({ range_min: { type: 'number' }, range_max: { type: 'number' } })] };
const conditions = {
  random_chance: ['Test a drop probability.', { chance: { type: 'number' } }, { chance: 0.5 }],
  random_chance_with_looting: ['Adjust probability for Looting.', { chance: { type: 'number' }, looting_multiplier: { type: 'number' } }, { chance: 0.1, looting_multiplier: 0.02 }],
  random_difficulty_chance: ['Choose probability by world difficulty.', Object.fromEntries(['default_chance', 'peaceful', 'easy', 'normal', 'hard'].map(key => [key, { type: 'number' }])), { default_chance: 0.5, peaceful: 0, hard: 0.6 }],
  random_regional_difficulty_chance: ['Test regional drop probability.', { max_chance: { type: 'number' } }, { max_chance: 0.15 }],
  killed_by_player: ['Require a player kill.', {}, {}],
  killed_by_player_or_pets: ['Include player and pet kills.', {}, {}],
  killed_by_entity: ['Require a particular killer.', { entity_type: string() }, { entity_type: 'minecraft:skeleton' }],
  damaged_by_entity: ['Check the damaging entity type.', { entity_type: string() }, { entity_type: 'minecraft:fireball' }],
  entity_killed: ['Check the defeated entity type.', { entity_type: string() }, { entity_type: 'minecraft:slime' }],
  passenger_of_entity: ['Check the ridden entity type.', { entity_type: string() }, { entity_type: 'minecraft:chicken' }],
  is_baby: ['Require a baby entity.', {}, {}],
  has_variant: ['Check the entity variant.', { value: { type: 'integer' } }, { value: 0 }],
  has_mark_variant: ['Check the marked variant.', { value: { type: 'integer' } }, { value: 0 }],
  bool_property: ['Check an entity boolean property.', { domain: string(), value: { type: 'boolean' }, operator: string() }, { domain: 'example:property', value: true }],
  biome_has_tag: ['Check a biome tag.', { tag: string(), operator: string() }, { tag: 'forest', operator: '==' }],
  entity_properties: ['Check properties of an entity.', { entity: string('Entity context, such as this.'), properties: object({ on_fire: { type: 'boolean' } }) }, { entity: 'this', properties: { on_fire: true } }],
  match_tool: ['Check the tool used for loot.', {
    item: string('Tool item identifier.'), count: ref('toolRange'), durability: ref('toolRange'),
    enchantments: array(object({ enchantment: string(), levels: ref('toolRange') })),
    ...Object.fromEntries(['any', 'all', 'none'].map(kind => ['minecraft:match_tool_filter_' + kind, { ...array(string()), description: 'Tool item tags to match (' + kind + ').' }]))
  }, { item: 'minecraft:diamond_sword' }]
};
const lootCondition = {
  ...object({ condition: { anyOf: [{ type: 'string', enum: Object.keys(conditions) }, string('Condition identifier; additional engine conditions remain allowed.')], description: 'Requirement to test before selecting loot.' } }, ['condition']),
  defaultSnippets: Object.entries(conditions).map(([name, [description, , body]]) => ({ label: name, description, body: { condition: name, ...body } })),
  allOf: Object.entries(conditions).map(([name, [description, properties]]) => ({ if: { properties: { condition: { type: 'string', pattern: '^(minecraft:)?' + name + '$' } }, required: ['condition'] }, then: { description, properties } }))
};
const lootConditions = { type: 'array', description: 'Requirements for this pool, entry, or function. Choose a condition starter.', items: ref('lootCondition') };
const lootFunction = {
  ...object({ function: { anyOf: [{ type: 'string', enum: Object.keys(functions).map(canonicalFunction) }, string('Function identifier; additional engine functions remain allowed.')], description: 'Loot modifier to apply to this item.' } }, ['function']),
  // Conditions remain valid and receive their schema when explicitly present,
  // but do not crowd the property list of a new, unselected function object.
  patternProperties: { '^conditions$': lootConditions },
  defaultSnippets: Object.entries(functions).map(([name, [description, , body]]) => ({ label: name, description, body: { function: canonicalFunction(name), ...body } })),
  // Patterns discriminate aliases without leaking both spellings into native
  // JSON value completion (enum values in an if schema are also suggested).
  allOf: Object.entries(functions).map(([name, [description, properties]]) => ({ if: { properties: { function: { type: 'string', pattern: '^(minecraft:)?' + name + '$' } }, required: ['function'] }, then: { description, properties } }))
};
const lootFunctions = { type: 'array', description: 'Item modifiers. Add a function object or choose a starter.', items: ref('lootFunction') };
const lootEntry = object({ type: string('Entry kind, such as item, loot_table, or empty.'), name: string(), weight: { type: 'number' }, quality: { type: 'number' }, functions: lootFunctions, conditions: lootConditions });
const loot = { ...header('loot table'), ...object({ pools: array(object({ rolls: ref('range'), bonus_rolls: ref('range'), conditions: lootConditions, entries: array(lootEntry), functions: lootFunctions })) }),
  definitions: { range: { anyOf: [{ type: 'number' }, object({ min: { type: 'number' }, max: { type: 'number' } })] }, lootFunction, lootCondition, toolRange }
};
for (const [name, schema] of Object.entries({ 'creative-catalog':require('./creative-catalog-schema.cjs'), recipe, 'texture-atlas': atlas, 'sound-definitions': sounds, 'loot-table': loot, block: require('./block-schema.cjs'), item:require('./item-schema.cjs') })) fs.writeFileSync(path.join(__dirname, '../schemas', name + '.schema.json'), JSON.stringify(schema, null, 2) + '\n');
