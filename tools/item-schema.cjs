// Original Workbench rules authored from Microsoft Learn's item documentation.
// Source/compatibility decisions live in schemas/AUTHORING.md, not third-party schemas.
const documentation=require('../src/documentation.cjs');
const s=description=>({type:'string',description});
const b=description=>({type:'boolean',description});
const n=(description,minimum)=>({type:'number',description,...(minimum===undefined?{}:{minimum})});
const i=(description,minimum,maximum)=>({type:'integer',description,...(minimum===undefined?{}:{minimum}),...(maximum===undefined?{}:{maximum})});
const o=(description,properties={},required=[])=>({type:'object',description,properties,...(required.length?{required}:{})});
const a=(description,items)=>({type:'array',description,items});
const e=(description,values)=>({type:'string',description,enum:values});
const union=(description,...anyOf)=>({description,anyOf});
const wrapped=(description,value)=>union(description,value,o(description,{value}));
const r=(name,description)=>({$ref:'#/definitions/'+name,description});
const items=description=>union(description,s('Item identifier.'),a('Item identifiers.',s('Item identifier.')));
const itemDescriptor=()=>union('Item identifier or tag descriptor.',s('Item identifier.'),o('Item selector.',{name:s('Item identifier.'),tags:s('Molang item-tag predicate.')}));
const block=()=>union('A block identifier or tag/state descriptor.',s('Block identifier.'),o('Block selector.',{name:s('Block identifier.'),tags:s('Molang predicate selecting blocks by tag.'),states:{type:'object',description:'Block state names and required values.',additionalProperties:{type:['string','integer','boolean']}}}));
const range=description=>o(description,{min:n('Lower bound.'),max:n('Upper bound.')});
const expression=()=>union('A number or Molang expression.',n('Numeric amount.'),s('Molang expression.'),o('Legacy versioned Molang expression.',{expression:s('Expression to evaluate.'),version:i('Expression language version.')}));
const vector=()=>({...a('X, Y, Z vector.',n('Coordinate.')),minItems:3,maxItems:3});
const trigger=()=>union('Legacy event trigger; modern items use script callbacks.',s('Event identifier.'),o('Event trigger.',{event:s('Event identifier.'),target:s('Event recipient.'),condition:s('Molang condition.')}));
const conditions=()=>o('Kinetic effect conditions.',{max_duration:i('Maximum effect duration in ticks; negative means indefinite.'),min_relative_speed:n('Minimum closing speed between user and target.'),min_speed:n('Minimum user movement speed.')});
const c={
  'minecraft:allow_off_hand':wrapped('Whether this item can be held in the offhand.',b('Allow offhand placement.')),
  'minecraft:block_placer':o('Places a block when used. replace_block_item requires matching item and block identifiers.',{block:block(),use_on:a('Blocks that may be targeted; empty allows all.',block()),replace_block_item:b('Use this as the block item for picking and drops.'),aligned_placement:b('Align placement while use is held; requires a supporting 1.26.x format.')}),
  'minecraft:bundle_interaction':o('Bundle-style interactions and tooltip. Requires storage_item for storage.',{num_viewable_slots:i('Visible bundle slots.',1,64)}),
  'minecraft:can_destroy_in_creative':wrapped('Whether this held item can break blocks in Creative mode.',b('Allow Creative block breaking.')),
  'minecraft:compostable':o('Chance to add a compost layer.',{composting_chance:i('Composting success percentage.',1,100)}),
  'minecraft:cooldown':o('Shared cooldown for items in the same category.',{category:s('Cooldown group identifier.'),duration:n('Cooldown duration in seconds.',0),type:e('Action that starts the cooldown.',['use','attack'])}),
  'minecraft:damage':wrapped('Extra attack damage contributed by the item. Format 1.26.0 supports values through 32767.',i('Additional attack damage.',0,32767)),
  'minecraft:damage_absorption':o('Damage causes absorbed while this item is worn.',{absorbable_causes:a('Accepted damage causes.',s('Damage cause identifier.'))}),
  'minecraft:digger':o('Tool mining speeds for block selectors.',{use_efficiency:b('Apply the Efficiency enchantment to mining speed.'),destroy_speeds:a('Block-specific mining speed entries.',o('Mining speed entry.',{block:block(),speed:n('Mining speed for the selected block(s).')},['block','speed']))}),
  'minecraft:display_name':wrapped('Item display text or localization key.',s('Display name or localization key.')),
  'minecraft:durability':o('Durability before breaking, including a chance of losing durability.',{max_durability:i('Maximum durability.',0),damage_chance:o('Durability loss percentage range.',{min:i('Minimum loss chance.',0,100),max:i('Maximum loss chance.',0,100)})},['max_durability']),
    'minecraft:durability_sensor':o('Effects when remaining durability crosses a threshold.',{durability_thresholds:a('Durability thresholds; the lowest reached threshold takes priority.',o('Threshold effects.',{durability:i('Trigger at or below this remaining durability.',0),particle_type:union('Built-in particle type, not a resource-pack particle identifier.',e('Built-in particle type.',['none','crit','smoke','flame','heart','iconcrack','terrain','totem','villagerangry','villagerhappy','enchantingtable','endrod','electricspark','soul','snowflake','wax','wolfarmorcrack']),s('Additional built-in particle type.')),sound_event:s('Sound definition identifier.')})),sound_event:s('Legacy component-level sound event.')}),
  'minecraft:dyeable':o('Allows crafting-grid dyes to color this item.',{default_color:union('Default color as hexadecimal text or RGB.',s('Hexadecimal color.'),{...a('RGB color channels.',i('Color channel.',0,255)),minItems:3,maxItems:3})}),
  'minecraft:enchantable':o('Enchantments applicable to this item.',{slot:e('Enchantment category.',['none','all','g_armor','armor_head','armor_torso','armor_feet','armor_legs','sword','bow','spear','crossbow','melee_spear','g_tool','hoe','shears','flintsteel','shield','g_digging','axe','pickaxe','shovel','fishing_rod','carrot_stick','elytra','cosmetic_head']),value:i('Enchantability.',0)},['slot','value']),
  'minecraft:entity_placer':o('Spawns an entity when used or dispensed.',{entity:s('Entity identifier to spawn.'),use_on:a('Blocks this item may be used on.',block()),dispense_on:a('Blocks this item may be dispensed on.',block())}),
  'minecraft:fire_resistant':wrapped('Protect the dropped item from fire and lava.',b('Enable fire resistance.')),
  'minecraft:food':o('Edible item settings. Modern food also needs use_modifiers to define eating duration.',{can_always_eat:b('Allow eating even when the hunger bar is full.'),nutrition:i('Hunger restored.',0),saturation_modifier:union('Saturation multiplier; legacy named levels remain accepted.',n('Saturation multiplier.'),{type:'string',pattern:'^(poor|low|normal|good|max|supernatural)$'}),using_converts_to:items('Item left after consuming this food.')}),
  'minecraft:fuel':union('Burn duration when used as furnace fuel.',n('Burn duration in seconds.',0),o('Fuel settings.',{duration:n('Burn duration in seconds.',0)})),
  'minecraft:glint':wrapped('Enchanted visual glint.',b('Enable enchanted glint.')),
  'minecraft:hand_equipped':wrapped('Render like a held tool.',b('Use tool-style held rendering.')),
  'minecraft:hover_text_color':wrapped('Color name for the item tooltip.',s('Tooltip text color.')),
  'minecraft:icon':union('Item icon texture-atlas alias, or a map of icon texture roles.',s('Item texture-atlas alias.'),o('Icon textures.',{texture:s('Legacy single atlas alias.'),textures:{type:'object',description:'Icon roles mapped to item texture-atlas aliases.',properties:{default:s('Primary icon atlas alias.'),dyed:s('Dyed icon atlas alias.'),icon_trim:s('Trim icon atlas alias.'),icon_trim_palette:s('Trim palette atlas alias.')},additionalProperties:{type:'string'}}})),
  'minecraft:interact_button':union('Touch-control interaction button visibility or label.',b('Show the interaction button.'),s('Button text or localization key.')),
  'minecraft:kinetic_weapon':o('Velocity-based weapon damage while in use; requires format 1.21.130 or newer.',{reach:range('Survival reach in blocks.'),creative_reach:range('Creative reach in blocks.'),hitbox_margin:n('Additional hit-detection tolerance.'),delay:i('Delay before kinetic effects, in ticks.'),damage_multiplier:n('Multiplier applied to relative velocity damage.'),damage_modifier:n('Flat adjustment to kinetic damage.'),damage_conditions:conditions(),knockback_conditions:conditions(),dismount_conditions:conditions()}),
  'minecraft:liquid_clipped':wrapped('Whether use interactions target liquids.',b('Target liquid blocks.')),
  'minecraft:max_stack_size':wrapped('Maximum count in a stack.',i('Maximum stack count.',1,64)),
  'minecraft:piercing_weapon':o('Hits entities along the view ray; requires format 1.21.130 or newer.',{reach:range('Survival reach in blocks.'),creative_reach:range('Creative reach in blocks.'),hitbox_margin:n('Additional hit-detection tolerance.')}),
  'minecraft:projectile':o('Entity fired by this projectile item.',{projectile_entity:s('Projectile entity identifier.'),minimum_critical_power:n('Minimum charged power for a critical hit.')}),
  'minecraft:rarity':wrapped('Base rarity used for tooltip color.',e('Base item rarity.',['common','uncommon','rare','epic'])),
  'minecraft:record':o('Music disc playback settings.',{sound_event:union('Record sound-event name.',e('Documented record event.',['13','cat','blocks','chirp','far','mall','mellohi','stal','strad','ward','11','wait','pigstep','otherside','5','relic']),s('Additional record event.')),duration:n('Playback duration in seconds.',0),comparator_signal:i('Comparator output strength.',1,15)}),
  'minecraft:repairable':o('Repair ingredients and recovered durability.',{repair_items:a('Repair entries.',union('Repair entry or legacy ingredient string.',s('Legacy repair item identifier.'),o('Ingredient and repair amount.',{items:union('Items accepted for this repair.',itemDescriptor(),a('Repair ingredients.',itemDescriptor())),repair_amount:expression()}))),on_repaired:trigger()}),
  'minecraft:seed':o('Legacy seed planting settings; modern custom items use block_placer.',{crop_result:s('Crop block identifier.'),plant_at:union('Plantable supporting blocks.',s('Legacy supporting block identifier.'),a('Supporting block identifiers.',s('Block identifier.'))),plant_at_any_solid_surface:b('Legacy unrestricted surface planting.'),plant_at_face:e('Legacy planting face.',['UP','DOWN'])}),
  'minecraft:shooter':o('Shoots projectile ammunition. Pair with use_modifiers for draw duration.',{ammunition:a('Permitted ammunition.',o('Ammunition entry.',{item:items('Ammunition item identifier(s).'),search_inventory:b('Search inventory for ammunition.'),use_in_creative:b('Use this ammunition in Creative.'),use_offhand:b('Search the offhand for ammunition.')},['item'])),scale_power_by_draw_duration:b('Scale projectile power by draw time.'),max_draw_duration:n('Maximum draw duration in seconds.',0),charge_on_draw:b('Charge while drawing, like a crossbow.')}),
  'minecraft:should_despawn':wrapped('Whether the dropped item eventually despawns.',b('Allow dropped-item despawning.')),
  'minecraft:stacked_by_data':wrapped('Whether differing auxiliary values may share a stack.',b('Enable auxiliary-data stacking behavior.')),
  'minecraft:storage_item':o('Dynamic inventory storage, such as a bundle.',{allow_nested_storage_items:b('Allow other storage items inside.'),allowed_items:items('Exclusive allowed-item list; empty permits all.'),banned_items:items('Items forbidden inside storage.'),max_slots:i('Maximum storage slots.',1,64)}),
  'minecraft:storage_weight_limit':o('Maximum combined contained-item weight.',{max_weight_limit:i('Storage weight limit.',0,64)}),
  'minecraft:storage_weight_modifier':o('Weight when stored in another storage item.',{weight_in_storage_item:i('Stored weight; zero disallows storage.',0)}),
  'minecraft:swing_duration':wrapped('Visual swing duration; does not change attack frequency.',n('Swing duration in seconds.',0)),
  'minecraft:swing_sounds':o('Attack swing sound overrides.',{attack_critical_hit:s('Critical-hit sound definition.'),attack_hit:s('Successful-hit sound definition.'),attack_miss:s('Miss or ineffective-hit sound definition.')}),
  'minecraft:tags':o('Item tags used by recipes, filters and scripts.',{tags:a('Item tag names.',s('Tag name.'))}),
  'minecraft:throwable':o('Throw power and draw behavior; normally paired with projectile.',{do_swing_animation:b('Swing the hand when throwing.'),launch_power_scale:n('Power scaling factor.'),max_draw_duration:n('Maximum draw duration in seconds.',0),max_launch_power:n('Maximum launch power.'),min_draw_duration:n('Minimum draw duration in seconds.',0),scale_power_by_draw_duration:b('Scale throw power with draw time.')}),
  'minecraft:use_animation':wrapped('Animation played while using this item.',union('Use animation.',e('Common use animation.',['none','eat','drink','block','bow','camera','crossbow','spear','spyglass','brush']),s('Additional engine-supported animation.'))),
  'minecraft:use_modifiers':o('Item use timing and movement modifiers.',{use_duration:n('Use duration in seconds.',0),movement_modifier:{...n('Movement multiplier while using the item.',0),maximum:1},emit_vibrations:b('Emit start/stop use vibrations.'),start_sound:s('Sound definition played when use starts.'),start_using:union('When to begin using the item. Requires format 1.26.30 or newer.',e('Use trigger.',['always','if_first']),{type:'string',pattern:'^on_attack$'})}),
  'minecraft:wearable':o('Equipment slot and armor behavior.',{slot:e('Equipment slot.',['slot.armor.body','slot.armor.chest','slot.armor.feet','slot.armor.head','slot.armor.legs','slot.weapon.mainhand','slot.weapon.offhand']),protection:i('Armor protection.',0),dispensable:b('Allow equipping from a dispenser.'),hides_player_location:b('Hide the wearer on locator maps and the locator bar.')}),
  'minecraft:custom_components':a('Legacy ordered script-registered item component IDs.',s('Registered item component ID.')),
  'minecraft:chargeable':o('Deprecated item charging behavior; use use_modifiers.',{on_complete:trigger(),movement_modifier:n('Movement multiplier while charging.')}),
  'minecraft:use_duration':wrapped('Legacy use duration. Modern items use use_modifiers.',n('Use duration.',0)),
  'minecraft:on_use':trigger(),'minecraft:on_use_on':trigger(),
  'minecraft:weapon':o('Deprecated event-driven weapon behavior; use script custom components.',{on_hurt_entity:trigger(),on_not_hurt_entity:trigger(),on_hit_block:trigger()}),
  'minecraft:render_offsets':o('Legacy held-item rendering transforms.',Object.fromEntries(['main_hand','off_hand'].map(hand=>[hand,o('Transforms for this hand.',Object.fromEntries(['first_person','third_person'].map(view=>[view,o('View transform.',{position:vector(),rotation:vector(),scale:vector()})])))])))
};
const deprecated=['seed','custom_components','chargeable','use_duration','on_use','on_use_on','weapon','render_offsets'];
for(const [component,field,label,body]of [
  ['repairable','repair_items','Repair ingredient',{items:['minecraft:iron_ingot'],repair_amount:1}],
  ['shooter','ammunition','Ammunition entry',{item:'minecraft:arrow',search_inventory:true}],
  ['digger','destroy_speeds','Mining speed entry',{block:'minecraft:stone',speed:1}],
  ['durability_sensor','durability_thresholds','Durability threshold',{durability:1,particle_type:'none'}]
])c['minecraft:'+component].properties[field].items.defaultSnippets=[{label,description:'Start a '+label.toLowerCase()+'.',body}];
for(const name of deprecated)c['minecraft:'+name].doNotSuggest=true;
// Deprecated fields still validate but are hidden from modern property suggestions.
c['minecraft:food'].patternProperties={'^remove_effects$':a('Deprecated food effects.',s('Effect identifier.'))};
for(const [id,component]of Object.entries(c)) {
  const link=documentation.componentLink('item',id),seen=new Set();
  function describe(node){if(!node||typeof node!=='object'||seen.has(node))return;seen.add(node);if(node.description)node.markdownDescription=node.description+'\n\n'+link;for(const value of Object.values(node))if(Array.isArray(value))value.forEach(describe);else if(value&&typeof value==='object')describe(value);}
  describe(component);
}
module.exports={
  $schema:'http://json-schema.org/draft-07/schema#',title:'Bedrock Workbench item',
  ...o('Behavior-pack item definition.',{
    format_version:s('Item format version; historical forms remain supported.'),
    'minecraft:item':o('Item description and components.',{
      description:o('Item identity and Creative inventory settings.',{
        identifier:{...s('Namespaced item identifier. Historical vanilla serialization names retain their case.'),pattern:'^(?:[a-z0-9_.-]+:[a-z0-9_./-]+|minecraft:[A-Za-z0-9_./-]+)$'},
        menu_category:o('Creative inventory placement.',{category:e('Creative category.',['construction','nature','equipment','items','none']),group:s('Creative inventory group.'),is_hidden_in_commands:b('Hide this item from commands.')}),
        category:s('Legacy Creative category.')
      },['identifier']),components:r('components','Built-in and script-registered item components.')
    },['description'])
  },['format_version','minecraft:item']),
  definitions:{components:{type:'object',description:'Built-in and custom item components. Custom parameter hints are advisory.',properties:c,additionalProperties:true}}
};
