// Original Workbench block rules, independently authored from the references
// recorded in schemas/AUTHORING.md. Unknown components/parameters stay open.
const string = description => ({ type: 'string', ...(description ? { description } : {}) });
const object = (properties, required = []) => ({ type: 'object', properties, ...(required.length ? { required } : {}) });
const array = items => ({ type: 'array', items });
const ref = name => ({ $ref: '#/definitions/' + name });
const choices = values => ({ anyOf: [{ type: 'string', enum: values }, { type: 'string' }] });
const boolOr = schema => ({ anyOf: [schema, { type: 'boolean' }] });
const vector = { type: 'array', minItems: 3, maxItems: 3, items: { type: 'number' } };
const color = { anyOf: [string(), { ...array({ type: 'number' }), minItems: 3, maxItems: 3 }] };
const box = object({ origin: ref('vector'), size: ref('vector') });
const componentProperties = {
  'minecraft:friction': { type: 'number', minimum: 0, maximum: 0.9, description: 'Surface friction for entities moving across this block.' },
  'minecraft:light_emission': { type: 'integer', minimum: 0, maximum: 15, description: 'Light level emitted by the block.' },
  'minecraft:light_dampening': { type: 'integer', minimum: 0, maximum: 15, description: 'Amount of light blocked by the block.' },
  'minecraft:destructible_by_mining': { ...boolOr(object({ seconds_to_destroy: { type: 'number', minimum: 0 }, item_specific_speeds: array(object({ item: { anyOf: [string(), object({ tags: string(), name: string() })] }, destroy_speed: { type: 'number' } }, ['item', 'destroy_speed'])) })), description: 'Mining behavior, with optional per-item speeds.' },
  'minecraft:destructible_by_explosion': { ...boolOr(object({ explosion_resistance: { type: 'number', minimum: 0 } })), description: 'Explosion resistance, or a boolean switch.' },
  'minecraft:collision_box': { anyOf: [{ type: 'boolean' }, ref('box'), array(ref('box'))], description: 'Collision shape; box arrays require a supporting format and engine.' },
  'minecraft:selection_box': { ...boolOr(ref('box')), description: 'Outline used when targeting the block.' },
  'minecraft:geometry': { anyOf: [object({ identifier: string('Geometry identifier from a resource pack.'), bone_visibility: { type: 'object', additionalProperties: { type: ['boolean', 'string'] } }, culling: string(), culling_layer: string(), culling_shape: string(), uv_lock: { anyOf: [{ type: 'boolean' }, array(string())] } }, ['identifier']), string('Geometry identifier from a resource pack.')], description: 'Geometry and optional bone visibility/culling settings.' },
  'minecraft:material_instances': { type: 'object', additionalProperties: { anyOf: [ref('material'), string('Reference another named material instance.')] }, description: 'Maps geometry material slots or faces to textures and rendering settings.' },
  'minecraft:transformation': { ...object(Object.fromEntries(['translation', 'rotation', 'scale', 'rotation_pivot', 'scale_pivot'].map(name => [name, ref('vector')]))), description: 'Local translation, rotation, and scaling vectors.' },
  'minecraft:map_color': { anyOf: [string(), ref('color'), object({ color: ref('color'), tint_method: string() })], description: 'Map color, retaining legacy color forms.' },
  'minecraft:tick': { ...object({ interval_range: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'integer', minimum: 0 } }, looping: { type: 'boolean' } }), description: 'Tick interval used by script-driven block behavior.' },
  'minecraft:random_ticking': { type: 'object', description: 'Enable random-tick behavior; legacy fields remain allowed.' },
  'minecraft:loot': { ...string(), description: 'Loot-table path relative to the behavior pack.' },
  'minecraft:display_name': { ...string(), description: 'Display text or a localization key.' },
  'minecraft:crafting_table': { ...object({ table_name: string(), crafting_tags: array(string()) }), description: 'Custom crafting station name and accepted recipe tags.' },
  'minecraft:flammable': { ...boolOr(object({ catch_chance_modifier: { type: 'integer' }, destroy_chance_modifier: { type: 'integer' } })), description: 'Fire behavior and spread modifiers.' },
  'minecraft:placement_filter': { ...object({ conditions: array(object({ allowed_faces: array(choices(['up', 'down', 'north', 'south', 'east', 'west', 'side', 'all'])), block_filter: array({ anyOf: [string(), object({ tags: string(), states: { type: 'object' } })] }) })) }), description: 'Placement and survival requirements.' },
  'minecraft:entity_fall_on': { ...object({ minimum_fall_distance: { type: 'number' } }), description: 'Fall distance threshold for script callbacks.' },
  'minecraft:custom_components': { ...array(string()), description: 'Legacy custom-component ID list. Modern components use their ID directly as a component key.' },
  'minecraft:tags': { ...array(string()), description: 'Tags associated with the block.' },
  'minecraft:movable': { ...object({ movement_type: choices(['push_pull', 'push', 'popped', 'immovable']), sticky: string() }), description: 'Piston movement behavior.' },
  'minecraft:liquid_detection': { ...object({ detection_rules: array(object({ liquid_type: string(), can_contain_liquid: { type: 'boolean' }, on_liquid_touches: string(), use_liquid_clipping: { type: 'boolean' } })) }), description: 'Rules for interactions with liquids.' }
};
const components = { type: 'object', properties: componentProperties, additionalProperties: true, description: 'Built-in and script-registered custom block components. Custom parameter values are not inferred.' };
module.exports = require('./block-components.cjs')({
  $schema: 'http://json-schema.org/draft-07/schema#', title: 'Bedrock Workbench block',
  ...object({ format_version: string('Block format version; older versions remain accepted.'), 'minecraft:block': object({
    description: object({ identifier: { type: 'string', pattern: '^[a-z0-9_.-]+:[a-z0-9_./-]+$' },
      menu_category: object({ category: choices(['construction', 'nature', 'equipment', 'items', 'none']), group: string(), is_hidden_in_commands: { type: 'boolean' } }),
      states: { type: 'object', additionalProperties: { anyOf: [array({ type: ['integer', 'boolean', 'string'] }), object({ values: object({ min: { type: 'integer' }, max: { type: 'integer' } }, ['min', 'max']) }, ['values'])] } },
      traits: object({ 'minecraft:placement_direction': object({ enabled_states: array(string()), y_rotation_offset: { type: 'number' } }), 'minecraft:placement_position': object({ enabled_states: array(string()) }) })
    }, ['identifier']),
    components: ref('components'), permutations: array(object({ condition: string('Molang expression selecting this permutation.'), components: ref('components') }, ['condition', 'components']))
  }, ['description']) }, ['format_version', 'minecraft:block']),
  definitions: { vector, color, box, components, material: object({ texture: string('Texture-atlas identifier.'), render_method: choices(['opaque', 'alpha_test', 'alpha_test_single_sided', 'blend', 'double_sided']), ambient_occlusion: { type: ['boolean', 'number'] }, face_dimming: { type: 'boolean' }, isotropic: { type: 'boolean' }, tint_method: string(), alpha_masked_tint: { type: 'boolean' } }) }
});
