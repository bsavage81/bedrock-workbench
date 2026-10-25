const {test}=require('node:test');
const assert=require('node:assert/strict');
const docs=require('../src/documentation.cjs');
const {adapt}=require('../src/official-schemas.cjs');
test('component documentation uses published Learn pages, including irregular names and goals',()=>{
  for(const [kind,id,suffix]of [
    ['block','minecraft:random_offset','blockcomponents/minecraftblock_random_offset'],
    ['block','minecraft:flower_pottable','blockcomponents/minecraftblock_flower_pottable'],
    ['block','minecraft:queued_ticking','blockcomponents/minecraftblock_queued_ticking'],
    ['item','minecraft:food','itemcomponents/minecraft_food'],
    ['entity','minecraft:health','entitycomponents/minecraftcomponent_health'],
    ['entity','minecraft:annotation.break_door','entitycomponents/minecraftcomponent_annotation_break_door'],
    ['entity','minecraft:behavior.random_stroll','entitygoals/minecraftbehavior_random_stroll']
  ])assert.ok(docs.componentUrl(kind,id).endsWith(suffix+'?view=minecraft-bedrock-stable'));
  assert.match(docs.componentUrl('block','minecraft:unknown'),/blockcomponentslist\?view=/);
  assert.match(docs.componentUrl('block','test:custom'),/documents\/scripting\/components-tutorial\?view=/);
});
test('authored and adapted component/field hovers link to Microsoft Learn without replacing descriptions',()=>{
  const block=require('../schemas/block.schema.json').definitions.components.properties;
  for(const component of Object.values(block)) assert.match(component.markdownDescription,/\[Microsoft Learn documentation\]\(https:\/\/learn.microsoft.com/);
  const definitions=require('../schemas/block.schema.json').definitions;
  assert.match(definitions.material.properties.face_dimming.markdownDescription,/minecraftblock_material_instances/);
  assert.match(definitions.box.properties.origin.markdownDescription,/minecraftblock_collision_box/);
  const input={description:'Starting health.',properties:{value:{type:'integer',description:'Initial health points.'}}};
  const schema=adapt(input,'bp/entities/entity_minecraft_health.schema.json');
  assert.match(schema.markdownDescription,/minecraftcomponent_health/);
  assert.match(schema.properties.value.markdownDescription,/Initial health points\..*\n\n.*minecraftcomponent_health/);
  const index=adapt({properties:{'minecraft:health':{$ref:'./entity_minecraft_health.schema.json'}}},'bp/entities/index.schema.json');
  assert.match(index.properties['minecraft:health'].markdownDescription,/minecraftcomponent_health/);
});


test('Learn descriptions cover component roots and preserve authored compatibility guidance',()=>{
 const expected={'minecraft:movement':'base movement speed','minecraft:movement.hover':'causes the mob to hover','minecraft:nameable':'name tag','minecraft:navigation.hover':'generate paths in the air'};
 const components=require('../schemas/entity.schema.json').definitions.components.properties;
 for(const [id,phrase]of Object.entries(expected)){
  assert.ok(components[id].description.includes(phrase),id);
  assert.ok(components[id].markdownDescription.includes(docs.componentUrl('entity',id)),id);
 }
 assert.match(docs.componentDescription('entity','minecraft:pushable','Deprecated in version 1.26.10.'),/Deprecated in version 1.26.10/);
 assert.equal(docs.componentDescription('entity','minecraft:behavior.stay_near_noteblock','Accurate authored guidance.'),'Accurate authored guidance.');
 assert.equal(docs.componentDescription('entity','minecraft:unknown','Fallback.'),'Fallback.');
 const catalog=require('../src/component-descriptions.json');
 assert.equal(Object.values(catalog.components).reduce((n,v)=>n+Object.keys(v).length,0),512);
 for(const values of Object.values(catalog.components))for(const entry of Object.values(values)){
  assert.match(entry.source,/^https:\/\/learn.microsoft.com\//);assert.match(entry.blob,/^[a-f0-9]{40}$/);assert.ok(entry.description.split(/\s+/).length<=150);
 }
});
test('Learn introduction extraction skips navigation and retains identifier underscores',()=>{
 const {introduction}=require('../tools/update-component-descriptions.cjs');
 assert.equal(introduction('# Component\n\n## Contents\n\n- Properties\n\nControls minecraft:some_component.\n\n## Properties\n\nOther text.'),'Controls minecraft:some_component.');
 assert.equal(introduction('# Component\n\n.\n\n## Properties'),'');
});
