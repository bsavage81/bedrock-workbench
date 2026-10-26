// Independently authored from Learn's client-entity reference and vanilla examples.
const BASE='https://learn.microsoft.com/en-us/minecraft/creator/';
const INTRO=BASE+'reference/content/entityreference/examples/cliententitydocumentation/cliententitydocumentationintroduction?view=minecraft-bedrock-stable';
const VISUAL=BASE+'reference/content/visualreference/actor_resource_definition.v1.26.0?view=minecraft-bedrock-stable';
const s=description=>({type:'string',description}),o=(description,properties={})=>({type:'object',description,properties}),a=(description,items)=>({type:'array',description,items});
const expression=description=>({type:['string','number'],description});
const vector={type:'array',minItems:3,maxItems:3,items:{type:'number'},description:'X, Y and Z model-space offset.'};
const binding=(description,valueDescription)=>({description,anyOf:[s(valueDescription),{type:'object',additionalProperties:s(valueDescription)}]});
const conditional=(description,value)=>({description,anyOf:[s(value),{type:'object',additionalProperties:expression('Molang condition controlling this entry.')} ]});
const scales=Object.fromEntries(['x','y','z','X','Y','Z'].map(axis=>['scale'+axis,expression('Molang scale multiplier for the '+axis.toUpperCase()+' axis.')]));
const scripts=o('Client Molang initialization, per-frame calculations and animation playback.',{
 initialize:a('Molang evaluated when the client entity is initialized. Brace-scope script delimiters require client format 1.26.0 or newer.',expression('Initialization Molang expression.')),
 pre_animation:a('Molang evaluated before animations each frame. Brace-scope script delimiters require client format 1.26.0 or newer.',expression('Per-frame Molang expression.')),
 animate:{description:'Animation aliases to play, optionally controlled by Molang conditions.',anyOf:[s('Legacy animation expression.'),a('Animation aliases and conditional aliases.',conditional('Animation alias or conditional animation entry.','Alias declared in animations or legacy animation_controllers.'))]},
 parent_setup:expression('Molang setup evaluated for the parent attachment context.'),scale:expression('Overall model scale computed with Molang.'),...scales,
 hide_held_items:expression('Hide held items when this Molang expression is nonzero, overriding attachable rendering.'),
 should_update_effects_offscreen:expression('Keep particle and sound effects updating offscreen when nonzero. Bone updates can also enable this.'),
 should_update_bones_and_effects_offscreen:expression('Keep bone transforms and effects updating offscreen when nonzero.'),
 variables:{type:'object',description:'Visibility declarations for client Molang variables.',additionalProperties:{...s('Public variables can be read from another entity using the Molang arrow operator.'),anyOf:[{enum:['public']},{type:'string'}]}}
});
const description=o('The entity identifier and named resources used to render it.',{
 identifier:s('Entity identifier matching the behavior-pack entity. Use Go to Definition to find the behavior definition.'),
 min_engine_version:{description:'Minimum resource-pack engine version for choosing this client definition. For duplicate identifiers Minecraft selects the closest eligible definition; this differs from file format_version.',anyOf:[{type:'string'},{type:'array',items:{type:'integer'},minItems:3,maxItems:3}]},
 materials:binding('Material aliases used by Material.<alias> in render controllers.','Rendering material identifier.'),
 textures:binding('Texture aliases used by Texture.<alias> in render controllers.','Resource-pack texture image path, normally without its extension.'),
 geometry:binding('Geometry aliases used by Geometry.<alias> in render controllers.','Geometry identifier from a model file.'),
 animations:binding('Short aliases for animation or animation-controller identifiers.','Animation or animation-controller identifier.'),
 animation_controllers:a('Legacy named animation-controller list. Newer layouts declare these aliases in animations.',{type:'object',description:'Named animation-controller binding.',additionalProperties:s('Animation-controller identifier.')}),
 render_controllers:{description:'Render controllers selecting geometry, materials and textures, optionally gated by Molang.',anyOf:[expression('Legacy render-controller expression.'),a('Render-controller identifiers or conditional entries.',conditional('Render-controller entry.','Render-controller identifier.'))]},
 particle_effects:binding('Particle aliases available to entity animations and controllers.','Particle effect identifier.'),
 particle_emitters:binding('Legacy particle-emitter animation bindings.','Animation identifier driving a legacy emitter.'),
 sound_effects:binding('Sound aliases available to entity animations and controllers.','Sound event identifier.'),
 scripts,
 spawn_egg:o('Spawn egg appearance using colors or an item texture atlas entry.',{base_color:s('Base spawn egg color as a hexadecimal color.'),overlay_color:s('Overlay spawn egg color as a hexadecimal color.'),texture:s('Entry name from textures/item_texture.json.'),texture_index:{type:'integer',minimum:0,description:'Zero-based texture variant index within the atlas entry.',default:0}}),
 enable_attachables:{type:'boolean',description:'Allow attached armor, held items and other attachable rendering.'},
 held_item_ignores_lighting:{type:'boolean',description:'Render held items fully lit instead of using surrounding lighting.'},
 held_item_scale:{type:'number',description:'Scale of rendered held items; also present in vanilla client definitions.'},
 hide_armor:{type:'boolean',description:'Hide equipped armor even when attachable rendering is enabled.'},
 queryable_geometry:s('Geometry binding used for geometry-related client queries.'),
 locators:{type:'object',description:'Legacy named locator offsets, expressed in model space.',additionalProperties:{type:'object',description:'Bone names mapped to model-space offsets for this locator.',additionalProperties:vector}},
 item:{description:'Item association used by the shared actor-resource layout, principally for attachables.',anyOf:[s('Item identifier or Molang expression.'),{type:'object',additionalProperties:expression('Molang condition for an item association.')}]}
});
description.required=['identifier'];
const schema={$schema:'http://json-schema.org/draft-07/schema#',title:'Bedrock Workbench client entity',type:'object',required:['format_version','minecraft:client_entity'],properties:{format_version:s('Client entity syntax version. Preserve older formats unless intentionally upgrading their behavior.'),'minecraft:client_entity':{...o('Client-side rendering and animation bindings for a behavior-pack entity.',{description}),required:['description']}}};
function link(node,url=INTRO){if(!node||typeof node!=='object')return;if(typeof node.description==='string')node.markdownDescription=node.description+'\n\n[Microsoft Learn documentation]('+url+')';for(const [key,value]of Object.entries(node)){if(['default','defaultSnippets'].includes(key))continue;if(Array.isArray(value))value.forEach(child=>link(child,url));else if(value&&typeof value==='object')link(value,url);}}
link(schema);link(scripts,VISUAL);module.exports=schema;
