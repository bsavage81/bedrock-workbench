// Independently authored supplemental block rules. Primary documentation and
// compatibility notes are recorded in schemas/AUTHORING.md.
module.exports = function extend(schema) {
  const d = schema.definitions, c = d.components.properties;
  const s = description => ({type:'string', description});
  const b = description => ({type:'boolean', description});
  const n = description => ({type:'number', description});
  const i = description => ({type:'integer', description});
  const o = (description, properties = {}) => ({type:'object',description,properties});
  const a = (description, items) => ({type:'array',description,items});
  const e = (description, values) => ({type:'string',description,enum:values});
  const r = (name, description) => ({$ref:'#/definitions/'+name, description});
  const faces = ['up','down','north','south','east','west'];
  const tint = () => e('Biome tint applied to the rendered color.', ['none','default_foliage','birch_foliage','evergreen_foliage','dry_foliage','grass','water']);
  const trigger = o('Legacy event trigger. Prefer script custom component callbacks for modern blocks.', {event:s('Event identifier to run.'),target:s('Event recipient, normally self.'),condition:s('Molang condition controlling whether the event runs.')});
  const axis = () => o('Random displacement along this axis, in model units.', {
    range:o('Lower and upper limits for this axis.',{min:n('Minimum displacement.'),max:n('Maximum displacement.')}),
    steps:{...i('Number of discrete steps. Zero permits continuous offsets within the range.'),minimum:0,default:0}
  });
  Object.assign(c, {
    'minecraft:random_offset':o('Position-seeded offset affecting rendering, selection and collision. Requires format 1.21.100 or newer. Multi-blocks must define this at the root from 1.26.20.',{x:axis(),y:axis(),z:axis()}),
    'minecraft:flower_pottable':o('Allows this block to be placed in a flower pot. No parameters. Requires format 1.21.120; root components only from 1.26.20.'),
    'minecraft:embedded_visual':o('Geometry and materials used when embedded inside another block, such as a flower pot. Requires format 1.21.120.',{geometry:r('blockGeometry','Geometry of the embedded block.'),material_instances:r('blockMaterials','Materials of the embedded block.')}),
    'minecraft:item_visual':o('Geometry and materials for the inventory/held block item. Requires format 1.21.60.',{geometry:r('blockGeometry','Geometry for the block item.'),material_instances:r('blockMaterials','Materials for the block item.')}),
    'minecraft:chest_obstruction':o('Controls whether this block obstructs a chest beneath it.',{obstruction_rule:e('Always obstruct, never obstruct, or check the block shape.', ['always','never','shape'])}),
    'minecraft:connection_rule':o('Controls connections from fences, walls, panes and similar neighboring blocks.',{accepts_connections_from:e('Neighbor classes permitted to connect.', ['all','only_fences','none']),enabled_directions:a('Cardinal directions accepting connections.',e('Connection direction.',faces.filter(v=>!['up','down'].includes(v))))}),
    'minecraft:destruction_particles':o('Particle appearance when this block breaks.',{texture:s('Terrain texture-atlas alias for the particles.'),particle_count:{...i('Number of particles to spawn; maximum 255.'),minimum:0,maximum:255},tint_method:tint()}),
    'minecraft:precipitation_interactions':o('Controls rain obstruction and snow behavior. Snowlogging requires a supporting format and engine.',{precipitation_behavior:e('Rain/snow response. snowlogging is the current spelling from 1.26.30.', ['none','obstruct_rain','obstruct_rain_accumulate_snow','snowlogging'])}),
    'minecraft:redstone_conductivity':o('Redstone conduction and wire stair-step behavior.',{allows_wire_to_step_down:b('Allows wire to descend along this block.'),redstone_conductor:b('Allows the block to conduct redstone power.')}),
    'minecraft:redstone_consumer':o('Receives redstone updates for scripts; not supported in permutations. Stable from format 1.26.0.',{min_power:{...i('Minimum incoming power that sends a script update.'),minimum:0,maximum:15},propagates_power:b('Allows the incoming redstone signal to pass through.')}),
    'minecraft:redstone_producer':o('Produces a redstone signal. Requires format 1.21.120.',{power:{...i('Signal strength emitted by the block.'),minimum:0,maximum:15},connected_faces:a('Faces that provide power.',e('Connected block face.',faces)),strongly_powered_face:e('Neighbor face receiving strong power.',faces),transform_relative:b('Rotate powered faces with the block transformation.')}),
    'minecraft:replaceable':o('Allows another placed block to replace this block. No parameters. Stable from format 1.21.60.'),
    'minecraft:support':o('Support shape used by neighboring blocks.',{shape:e('Support shape classification.', ['fence','stair'])}),
    'minecraft:block_entity':o('Per-position metadata and optional inventory container.',{dynamic_properties:b('Enables script-accessible dynamic properties on block instances.'),container:o('Inventory container attached to this block.',{slot_count:{...i('Number of inventory slots, from 1 to 54.'),minimum:1,maximum:54}})}),
    'minecraft:instrument_sound':o('Experimental note-block instrument override for the upper and lower faces.',Object.fromEntries(['up','down'].map(face=>[face,e('Note-block sound for the '+face+' face; note.none disables sound.', ['harp','bd','snare','hat','bassattack','flute','bell','guitar','chime','xylophone','iron_xylophone','cow_bell','didgeridoo','bit','banjo','pling','trumpet','trumpet_exposed','trumpet_weathered','trumpet_oxidized','zombie','skeleton','creeper','enderdragon','witherskeleton','piglin','none'].map(v=>'note.'+v))]))),
    'minecraft:queued_ticking':o('Deprecated scheduled event behavior; use minecraft:tick and scripts for modern blocks.',{interval_range:{...a('Minimum and maximum delay, in ticks.',i('Tick delay.')),minItems:2,maxItems:2},looping:b('Repeat the scheduled trigger.'),on_tick:trigger}),
    'minecraft:random_ticking':o('Deprecated random tick event behavior; modern scripts use onRandomTick.',{on_tick:trigger}),
    'minecraft:unit_cube':o('Legacy full-cube geometry marker. Prefer minecraft:geometry.full_block.'),
    'minecraft:breathability':e('Legacy air/solid breathing classification.', ['air','solid']),
    'minecraft:bone_visibility':{type:'object',description:'Legacy bone visibility map. Use the geometry component for modern blocks.',additionalProperties:{type:['boolean','string']}},
    'minecraft:block_light_absorption':{...i('Legacy light absorption; use minecraft:light_dampening.'),minimum:0,maximum:15},
    'minecraft:block_light_emission':n('Legacy emitted light; use minecraft:light_emission.'),
    'minecraft:destroy_time':n('Legacy mining time; use minecraft:destructible_by_mining.'),
    'minecraft:explosion_resistance':n('Legacy explosion resistance; use minecraft:destructible_by_explosion.')
  });
  // Keep historical spellings valid without advertising them for new content.
  c['minecraft:redstone_consumer'].patternProperties = {'^propogates_power$':b('Legacy spelling before format 1.26.0.')};
  c['minecraft:precipitation_interactions'].properties.precipitation_behavior = {anyOf:[c['minecraft:precipitation_interactions'].properties.precipitation_behavior,{type:'string',pattern:'^snow_log_no_collision$'}],description:'Rain/snow response. snowlogging replaces snow_log_no_collision in 1.26.30.'};
  const geom = c['minecraft:geometry'].anyOf[0];
  geom.properties.n_way_visual_rotation = o('Maps axes to block states driving visual-only rotation.',Object.fromEntries(['x','y','z'].map(axis=>[axis,s('Block state controlling rotation around '+axis+'.')])));
  d.blockGeometry = c['minecraft:geometry']; d.blockMaterials = c['minecraft:material_instances'];
  const pf = c['minecraft:placement_filter'].properties.conditions.items.properties;
  pf.block_filter.items.anyOf[1].properties.name = s('Block identifier matched by this descriptor.');
  pf.block_filter.items.anyOf[1].properties.states = {type:'object',description:'Block-state names and required values.',additionalProperties:{type:['string','integer','boolean']}};
  c['minecraft:movable'].properties.sticky = e('Whether adjacent blocks move with this block.', ['none','same']);
  c['minecraft:map_color'].anyOf[2].properties.tint_method = tint();
  d.material.properties.tint_method = tint();
  // Preserve older rendering spellings but only offer documented choices.
  d.material.properties.render_method = {anyOf:[e('Texture transparency/culling mode.', ['opaque','alpha_test','blend','double_sided']),{type:'string',pattern:'^alpha_test_single_sided$'}],description:'How the material handles transparency and backface culling.'};
  const rule = c['minecraft:liquid_detection'].properties.detection_rules.items.properties;
  rule.liquid_type = e('Liquid matched by this rule; currently water.', ['water']);
  rule.on_liquid_touches = e('Reaction to incoming flowing liquid.', ['blocking','broken','popped','no_reaction']);
  rule.stops_liquid_flowing_from_direction = a('Faces that stop liquid flow.',e('Blocked flow direction.',faces));
  // Historical flat fields remain valid but are not recommended to new users.
  c['minecraft:liquid_detection'].patternProperties = Object.fromEntries(Object.entries(rule).map(([key,value])=>['^'+key+'$',value]));
  Object.assign(d.box.properties,{min:r('vector','Minimum corner in the newer box representation.'),max:r('vector','Maximum corner in the newer box representation.')});
  const descriptions = {
    seconds_to_destroy:'Base mining time in seconds.',item_specific_speeds:'Tool-specific mining speeds.',item:'Item identifier or item descriptor selecting the mining tool.',destroy_speed:'Mining time applied for this item.',name:'Identifier matched by this descriptor.',tags:'Molang tag predicate; this field is an expression, not an identifier.',explosion_resistance:'Resistance to explosions.',origin:'Lower corner of the box in model coordinates.',size:'Box dimensions in model units.',bone_visibility:'Bone names mapped to visibility booleans or Molang expressions.',culling:'Resource-pack block culling rule identifier.',culling_layer:'Layer used when comparing neighboring blocks for culling.',culling_shape:'Voxel shape identifier; requires the Voxel Shapes experiment.',uv_lock:'Lock all bone UVs, or only the listed bone names.',rotation:'Rotation around each axis, in degrees.',rotation_pivot:'Pivot used for rotation.',scale:'Scale factors for x, y and z.',scale_pivot:'Pivot used for scaling.',translation:'Displacement along x, y and z.',color:'Map color, as a hexadecimal string or RGB triplet.',interval_range:'Minimum and maximum interval, in ticks.',looping:'Continue ticking after the first tick.',table_name:'Crafting screen title or localization key.',crafting_tags:'Recipe tags accepted at this crafting station.',catch_chance_modifier:'Chance modifier for catching fire; zero prevents spreading fire onto this block.',destroy_chance_modifier:'Chance modifier for destruction by fire; zero prevents burning away.',conditions:'Placement and survival conditions.',allowed_faces:'Faces on which this block may be placed.',block_filter:'Neighbor block identifiers or tag/state descriptors.',minimum_fall_distance:'Fall distance needed to invoke the script callback.',movement_type:'Piston movement response.',can_contain_liquid:'Whether this block can contain the matched liquid.',use_liquid_clipping:'Use the collision bounds to clip the visible liquid.',detection_rules:'Liquid-specific interaction rules.',ambient_occlusion:'Ambient shading strength. Older formats accept booleans; modern formats use a numeric exponent.',face_dimming:'Shade the surface according to its facing direction.',isotropic:'Randomize the material UV orientation.',alpha_masked_tint:'Multiply biome tint by the texture alpha channel. Requires format 1.21.120, opaque rendering, and an enabled tint method.'
  };
  const visited = new Set();
  function describe(node) {
    if (!node || typeof node !== 'object' || visited.has(node)) return; visited.add(node);
    for (const [key,value] of Object.entries(node.properties||{})) if (!value.description && descriptions[key]) value.description=descriptions[key];
    for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(describe); else if(value && typeof value==='object') describe(value);
  }
  describe(schema);
  for(const [id,component] of Object.entries(c)) {
    const link=require('../src/documentation.cjs').componentLink('block',id);
    component.markdownDescription = (component.description||'')+'\n\n'+link;
    const seen=new Set();
    function linkFields(node) {
      if(!node || typeof node!=='object' || seen.has(node)) return; seen.add(node);
      if(node.description && !node.markdownDescription) node.markdownDescription=node.description+'\n\n'+link;
      for(const value of Object.values(node)) if(Array.isArray(value)) value.forEach(linkFields); else if(value && typeof value==='object') linkFields(value);
    }
    linkFields(component);
  }
  for(const name of ['breathability','bone_visibility','unit_cube','queued_ticking','random_ticking','block_light_absorption','block_light_emission','destroy_time','explosion_resistance']) c['minecraft:'+name].doNotSuggest=true;
  d.components.description='Built-in and script-registered block components. Custom parameter hints are advisory.';
  return schema;
};
