const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const json=require('jsonc-parser');
const schema=require('../schemas/item.schema.json');
const validate=new(require('ajv'))({strict:false,allErrors:true}).compile(schema);
const content=require('../src/content.cjs');
const parameters=require('../src/component-parameters.cjs');
const {analyze}=require('../src/script-components.cjs');
const item=components=>({format_version:'1.26.50','minecraft:item':{description:{identifier:'test:item'},components}});
test('item components retain legacy unions, nested selectors, Molang amounts and custom payloads',()=>{
  const data=item({
    'minecraft:max_stack_size':{value:16},'minecraft:glint':true,
    'minecraft:icon':{textures:{default:'test_icon'}},
    'minecraft:food':{nutrition:4,saturation_modifier:0.6,using_converts_to:'minecraft:bowl'},
    'minecraft:use_modifiers':{use_duration:1.6,movement_modifier:0.35},
    'minecraft:block_placer':{block:'test:block',use_on:[{name:'minecraft:dirt',states:{wet:true}},'minecraft:stone']},
    'minecraft:digger':{destroy_speeds:[{block:{tags:"q.any_tag('minecraft:stone')"},speed:1.5}]},
    'minecraft:repairable':{repair_items:[{items:[{tags:"q.all_tags('minecraft:planks')"},'minecraft:stick'],repair_amount:'q.max_durability * 0.25'}]},
    'minecraft:kinetic_weapon':{reach:{min:0,max:3},damage_conditions:{max_duration:-1,min_speed:2}},
    'test:custom':{unrestricted:[true,'a',1]},'test:scalar':42
  });assert.ok(validate(data),JSON.stringify(validate.errors));
  assert.ok(validate({format_version:'1.10','minecraft:item':{description:{identifier:'minecraft:appleEnchanted'},components:{'minecraft:seed':{plant_at:'soul_sand'}}}}));
});
test('item rules reject concrete structural defects without enforcing inferred custom parameter types',()=>{
  for(const components of [
    {'minecraft:durability':{max_durability:'wrong'}},
    {'minecraft:durability':{damage_chance:{min:10,max:50}}},
    {'minecraft:durability':{max_durability:10,damage_chance:{max:101}}},
    {'minecraft:max_stack_size':65},{'minecraft:damage':32768},{'minecraft:bundle_interaction':{num_viewable_slots:0}},
    {'minecraft:compostable':{composting_chance:101}},
    {'minecraft:wearable':{slot:'head'}},
    {'minecraft:repairable':{repair_items:[{repair_amount:[]}] }},
    {'minecraft:digger':{destroy_speeds:[{block:'minecraft:stone'}]}},
    {'minecraft:shooter':{ammunition:[{item:4}]}},
    {'minecraft:kinetic_weapon':{reach:{min:'wrong'}}},
    {'minecraft:use_modifiers':{movement_modifier:2}}
  ])assert.equal(validate(item(components)),false,JSON.stringify(components));
  assert.ok(validate(item({'test:known':{count:'not inferred as a constraint'}})));
});
test('contextual item lists select blocks, items, entities, atlases and sounds without guessing custom fields',()=>{
  const doc={side:'behavior',relative:'items/test.json'};
  for(const [component,tail,kind]of [
    ['block_placer',['block'],'block'],['block_placer',['use_on',0,'name'],'block'],
    ['digger',['destroy_speeds',0,'block','name'],'block'],['entity_placer',['entity'],'entity'],
    ['entity_placer',['dispense_on',0],'block'],['food',['using_converts_to'],'item'],
    ['repairable',['repair_items',0,'items',0,'name'],'item'],['shooter',['ammunition',0,'item'],'item'],
    ['storage_item',['banned_items',0],'item'],['projectile',['projectile_entity'],'entity'],
    ['icon',['textures','default'],'item_texture'],['swing_sounds',['attack_hit'],'sound'],
    ['use_modifiers',['start_sound'],'sound']
  ])assert.equal(content.referenceKind(['minecraft:item','components','minecraft:'+component,...tail],'',doc),kind);
  assert.equal(content.referenceKind(['minecraft:item','components','minecraft:repairable','repair_items',0,'items',0,'tags'],'',doc),undefined);
  assert.equal(content.referenceKind(['minecraft:item','components','test:custom','item'],'',doc),undefined);
});
test('custom item registrations and nested parameter hints remain separate from block registrations',()=>{
  const file=path.resolve('fixtures/items/script.ts');
  const registrations=analyze(new Map([[file,`const ID='test:usable'; event.itemComponentRegistry.registerCustomComponent(ID,{onUse(e,{params}){if(typeof params.enabled==='boolean'){}if(typeof params.nested.mode==='string'){} }});event.blockComponentRegistry.registerCustomComponent('test:block_only',{});`]]));
  const hints=parameters.hints({customComponents:registrations,documents:new Map()},'item','test:usable');
  assert.ok(hints.some(h=>h.path.join('.')==='enabled'&&h.types.includes('boolean')));
  assert.ok(hints.some(h=>h.path.join('.')==='nested.mode'&&h.types.includes('string')));
  assert.deepEqual(parameters.hints({customComponents:registrations,documents:new Map()},'item','test:block_only'),[]);
  const text=JSON.stringify(item({'test:usable':{enabled:true}})),document={side:'behavior',text,tree:json.parseTree(text)};
  assert.equal(parameters.context(document,text.indexOf('enabled')+2).kind,'item');
});
test('all authored item components and nested descriptions use Learn links',()=>{
  assert.equal(Object.keys(schema.definitions.components.properties).length,52);
  function walk(node){if(!node||typeof node!=='object')return;if(node.description)assert.match(node.markdownDescription,/learn.microsoft.com/);for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);}
  for(const component of Object.values(schema.definitions.components.properties))walk(component);
});
test('invalid tag containers do not crash content indexing or produce character suggestions',async t=>{
  const fs=require('node:fs/promises');await fs.mkdir('.test-temp',{recursive:true});
  const root=await fs.mkdtemp(path.resolve('.test-temp/item-tags-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const packs={behavior:path.join(root,'BP'),resource:path.join(root,'RP')};
  await fs.mkdir(path.join(packs.behavior,'items'),{recursive:true});await fs.mkdir(packs.resource);
  await fs.writeFile(path.join(packs.behavior,'items/bad.json'),JSON.stringify(item({'minecraft:tags':{tags:{invalid:true}}})));
  await fs.writeFile(path.join(packs.behavior,'items/good.json'),JSON.stringify(item({'minecraft:tags':{tags:['test:known']}})));
  const index=await content.scan({root,packs,config:{}});assert.deepEqual([...index.values('item_tag').keys()],['test:known']);
});
