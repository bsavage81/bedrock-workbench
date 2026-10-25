const {test}=require('node:test'),assert=require('node:assert/strict'),json=require('jsonc-parser');const compatibility=require('../src/component-compatibility.cjs'),versions=require('../src/format-versions.cjs'),actions=require('../src/compatibility-actions.cjs');
const project={config:{target:'release',targetVersion:'1.26.50',experimentalGameplay:{}}};
function doc(kind,components,format='1.26.50',extra={}){const data={format_version:format,['minecraft:'+kind]:{description:{identifier:'test:thing'},components,...extra}},text=JSON.stringify(data);return {file:'test.json',side:'behavior',relative:kind+'s/test.json',data,text,tree:json.parseTree(text)};}
function applyFix(document,fix){return JSON.parse(fix.edits.reduce((text,e)=>text.slice(0,e.offset)+e.text+text.slice(e.offset+e.length),document.text));}
test('ambient-occlusion shape is version-aware in root and nested material instances',()=>{
 const validate=new(require('ajv'))({strict:false}).compile(versions.apply(require('../schemas/block.schema.json'),'block','1.26.50'));
 for(const [format,value,expected]of [['1.26.10',false,true],['1.26.20',false,false],['1.26.50',0,true],['1.26.50',10,true],['1.26.50',11,false],['1.26.50',-1,false]]){
 const document=doc('block',{'minecraft:material_instances':{'*':{ambient_occlusion:value}},'minecraft:geometry':'minecraft:geometry.full_block'},format);assert.equal(validate(document.data),expected,format+' '+value);
 }
 const nested=doc('block',{'minecraft:embedded_visual':{material_instances:{'*':{ambient_occlusion:true}}}});assert.equal(validate(nested.data),false);const fix=compatibility.issues(nested,project).find(i=>i.native).fixes[0];assert.equal(applyFix(nested,fix)['minecraft:block'].components['minecraft:embedded_visual'].material_instances['*'].ambient_occlusion,1);
});
test('field renames preserve values, respect boundaries, and never overwrite a conflicting field',()=>{
 for(const [format,oldName,newName]of [['1.26.50','propogates_power','propagates_power'],['1.21.130','propagates_power','propogates_power']]){const document=doc('block',{'minecraft:redstone_consumer':{[oldName]:false}},format);const issue=compatibility.issues(document,project).find(i=>i.fixes?.length);const data=applyFix(document,issue.fixes[0]);assert.equal(data['minecraft:block'].components['minecraft:redstone_consumer'][newName],false);assert.ok(!Object.hasOwn(data['minecraft:block'].components['minecraft:redstone_consumer'],oldName));}
 const conflict=doc('block',{'minecraft:redstone_consumer':{propogates_power:false,propagates_power:true}});assert.deepEqual(compatibility.issues(conflict,project).find(i=>i.message.includes('Both fields')).fixes,[]);
 const entity=doc('entity',{'minecraft:ageable':{feed_items:[{item:'minecraft:wheat',transform_to_item:'minecraft:bucket'}]}});const fix=compatibility.issues(entity,project)[0].fixes[0];assert.equal(applyFix(entity,fix)['minecraft:entity'].components['minecraft:ageable'].feed_items[0].result_item,'minecraft:bucket');
});
test('component requirements account for permutation inheritance and modern food usage',()=>{
 const complete=doc('block',{'minecraft:geometry':'geometry.test','minecraft:material_instances':{'*':{texture:'test'}}},'1.26.50',{permutations:[{components:{'minecraft:geometry':'geometry.other'}}]});assert.deepEqual(compatibility.issues(complete,project),[]);
 const missing=doc('block',{'minecraft:geometry':'geometry.test'});assert.equal(compatibility.issues(missing,project).length,1);
 assert.ok(compatibility.issues(doc('item',{'minecraft:food':{nutrition:2}}),project).some(i=>i.message.includes('requires minecraft:use_modifiers')));
 assert.deepEqual(compatibility.issues(doc('item',{'minecraft:food':{nutrition:2},'minecraft:use_modifiers':{use_duration:1.6}}),project),[]);
});
test('experiments are required only where documented and are removed at stable boundaries',()=>{
 const old=doc('block',{'minecraft:redstone_consumer':{}},'1.21.130'),newer=doc('block',{'minecraft:redstone_consumer':{}},'1.26.0');assert.ok(compatibility.issues(old,project).some(i=>i.experiment?.id==='upcomingCreatorFeatures'));assert.ok(!compatibility.issues(newer,project).some(i=>i.experiment));
 const enabled={config:{...project.config,experimentalGameplay:{upcomingCreatorFeatures:true}}};assert.ok(!compatibility.issues(old,enabled).some(i=>i.experiment));
 const shape=doc('block',{'minecraft:geometry':{identifier:'geometry.test',culling:'test:rule',culling_shape:'test:shape'},'minecraft:material_instances':{}});assert.ok(!compatibility.issues(shape,project).some(i=>i.experiment?.id==='voxelShapes'));shape.data['minecraft:block'].description.identifier='minecraft:stone';shape.text=JSON.stringify(shape.data);shape.tree=json.parseTree(shape.text);assert.ok(compatibility.issues(shape,project).some(i=>i.experiment?.id==='voxelShapes'));
});
test('deprecated fields have explicit fixes while chargeable events require manual migration',()=>{
 const food=doc('item',{'minecraft:food':{remove_effects:['poison']},'minecraft:use_modifiers':{}});const fix=compatibility.issues(food,project).find(i=>i.fixes?.length).fixes[0];assert.ok(!Object.hasOwn(applyFix(food,fix)['minecraft:item'].components['minecraft:food'],'remove_effects'));
 const chargeable=doc('item',{'minecraft:chargeable':{on_complete:{event:'test:done'}}});assert.ok(!compatibility.issues(chargeable,project).some(i=>i.fixes?.length));
 const snow=doc('block',{'minecraft:precipitation_interactions':{precipitation_behavior:'snow_log_no_collision'}});const snowFix=compatibility.issues(snow,project).find(i=>i.fixes?.length).fixes[0];assert.equal(applyFix(snow,snowFix)['minecraft:block'].components['minecraft:precipitation_interactions'].precipitation_behavior,'snowlogging');
});
test('format update fixes honor the target ceiling and require an explicit selection',()=>{
 const document=doc('block',{'minecraft:random_offset':{}},'1.21.90');const fixes=actions.fixes(document,project);assert.ok(fixes.some(f=>f.title.includes('1.21.100')));assert.ok(!actions.fixes(document,{config:{...project.config,targetVersion:'1.21.90'}}).some(f=>f.title.startsWith('Raise')));assert.equal(JSON.parse(document.text).format_version,'1.21.90');
 assert.equal(versions.directCustom('1.10'),false);
});

test('rename fixes retain surrounding JSONC comments and unrelated values',()=>{
 const text='// Header\n{"format_version":"1.26.50","minecraft:block":{"components":{"minecraft:redstone_consumer":{"propogates_power":false},"test:other":{"keep":"literal"}}}}';const document={file:'test.json',text,tree:json.parseTree(text),side:'behavior',relative:'blocks/test.json'};
 const fix=compatibility.issues(document,project).find(i=>i.fixes?.length).fixes[0],edit=fix.edits[0],next=text.slice(0,edit.offset)+edit.text+text.slice(edit.offset+edit.length);assert.ok(next.startsWith('// Header'));assert.equal(json.parse(next)['minecraft:block'].components['test:other'].keep,'literal');assert.equal(json.parse(next)['minecraft:block'].components['minecraft:redstone_consumer'].propagates_power,false);assert.ok(edit.length<text.length);
});

test('pushable retirement is gated by the file format in root components and groups',()=>{
 const legacy={'minecraft:pushable':{is_pushable:true,is_pushable_by_piston:true}};
 for(const format of ['1.26.0','1.26.9','1.26.10','1.26.50']){
  const document=doc('entity',legacy,format,{component_groups:{pushed:legacy}}),issues=compatibility.issues(document,project).filter(i=>i.message.includes('minecraft:pushable is no longer parsed'));
  assert.equal(issues.length,['1.26.10','1.26.50'].includes(format)?2:0,format);
  for(const issue of issues){assert.equal(issue.severity,'warning');assert.match(issue.message,/minecraft:pushable_by_block/);assert.match(issue.message,/minecraft:pushable_by_entity/);assert.match(issue.source,/minecraftcomponent_pushable/);assert.ok(!issue.fixes?.length,'Do not silently convert false values or overwrite replacements');}
 }
 const schema=require('../schemas/entity.schema.json').definitions.components.properties['minecraft:pushable'];for(const field of [schema,...Object.values(schema.properties)]){assert.match(field.markdownDescription,/1\.26\.10/);assert.match(field.markdownDescription,/minecraft:pushable_by_/);assert.match(field.markdownDescription,/learn.microsoft.com/);}
});
