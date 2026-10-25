const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),json=require('jsonc-parser');const content=require('../src/content.cjs'),entity=require('../src/entity-authoring.cjs'),symbols=require('../src/project-symbols.cjs'),lang=require('../src/localization.cjs');
const doc=data=>({file:'entity.json',side:'behavior',relative:'entities/test.json',data,text:JSON.stringify(data),tree:json.parseTree(JSON.stringify(data))});
test('owned entity schema validates meaningful nested forms and rejects broken payloads',()=>{
 const schema=require('../schemas/entity.schema.json'),validate=new(require('ajv'))({strict:false}).compile(schema);assert.equal(Object.keys(schema.definitions.components.properties).length,89);
 const good={format_version:'1.26.50','minecraft:entity':{description:{identifier:'test:fish',properties:{'test:mode':{type:'enum',values:['idle','swim'],default:'idle'}}},components:{'minecraft:health':{value:{range_min:3,range_max:5},max:5},'minecraft:behavior.tempt':{priority:1,items:[{tags:"q.any_tag('test:food')"},'minecraft:fish']},'test:unknown':{arbitrary:[true]}},component_groups:{wet:{'minecraft:timer':{time:[1,3],time_down_event:{event:'test:done',target:'self'}}}},events:{'test:done':{sequence:[{add:{component_groups:['wet']}}]}}}};assert.ok(validate(good),JSON.stringify(validate.errors));
 const bad=structuredClone(good);bad['minecraft:entity'].components['minecraft:health'].max='bad';assert.equal(validate(bad),false);bad['minecraft:entity'].components['minecraft:health'].max=5;bad['minecraft:entity'].events['test:done'].sequence='bad';assert.equal(validate(bad),false);
 for(const value of Object.values(schema.definitions.components.properties))if(value.description)assert.match(value.markdownDescription,/learn.microsoft.com/);
});
test('scoped entity references avoid foreign-target events and track nested actions and property queries',()=>{
 const document=doc({'minecraft:entity':{description:{identifier:'test:fish',properties:{'test:mood':{type:'enum',values:['calm','angry'],default:'calm'}},animations:{idle:'animation.test.idle'},scripts:{animate:['idle']}},component_groups:{wet:{}},components:{'minecraft:timer':{time_down_event:{event:'done',target:'self'}},'minecraft:interact':{interactions:[{on_interact:{event:'external',target:'other'}}]}},events:{done:{sequence:[{add:{component_groups:['wet']}},{set_property:{'test:mood':'angry'}},{trigger:'done'}]},missing:{add:{component_groups:['not_here']}},query:{set_property:{'test:mood':"q.property('test:mood')"}}}}});
 const refs=entity.uses(document);assert.ok(refs.some(r=>r.kind==='entity_property'&&r.node.type==='fragment'));assert.ok(!refs.some(r=>r.id==='external'));const issues=entity.issues(document);assert.equal(issues.length,1);assert.match(issues[0].message,/not_here/);
 const state=entity.completionContext(document,document.text.indexOf('"angry"',document.text.indexOf('"set_property"'))+2);assert.equal(state.kind,'property_value');assert.deepEqual(state.definition.values,['calm','angry']);
 const controller=doc({animation_controllers:{'controller.animation.a':{initial_state:'walk',states:{walk:{transitions:[{idle:'1.0'}]},idle:{}}},'controller.animation.b':{initial_state:'walk',states:{walk:{}}}}});assert.deepEqual(entity.issues(controller),[]);assert.equal(entity.symbols(controller).filter(s=>s.kind==='controller_state').length,3);
});
test('language parser preserves values, embedded equals, comments, offsets and locale ordering',()=>{
 const text='\uFEFF# comment\r\nentity.test:fish.name=Fish=Friend\t### Translator context\r\nkey=literal # hash\nempty=\n';const parsed=lang.parse(text,'en_US.lang');assert.equal(parsed.entries.length,3);assert.equal(parsed.entries[0].value,'Fish=Friend');assert.equal(parsed.entries[0].comment,'Translator context');assert.equal(text.slice(parsed.entries[0].offset,parsed.entries[0].offset+parsed.entries[0].length),'entity.test:fish.name');assert.equal(parsed.entries[1].value,'literal # hash');
 const index={project:{packs:{resource:path.resolve('RP')}},languages:new Map([['de',lang.parse('key=Fisch','de_DE.lang')],['en',lang.parse('key=Fish','en_US.lang')]])};assert.deepEqual(lang.lookup(index,'key').map(e=>e.locale),['en_US','de_DE']);assert.equal(lang.resolve(index,'%key')[0].entries[0].value,'Fish');
});
async function fixture(t){await fs.mkdir('.test-temp',{recursive:true});const root=await fs.mkdtemp(path.resolve('.test-temp/entity-authoring-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const packs={behavior:path.join(root,'BP'),resource:path.join(root,'RP')};for(const relative of ['BP/entities','BP/scripts','RP/entity','RP/texts','RP/ui'])await fs.mkdir(path.join(root,relative),{recursive:true});const write=(relative,data)=>fs.writeFile(path.join(root,relative),typeof data==='string'?data:JSON.stringify(data));return {root,packs,write};}
test('project rename updates owned entity identifiers, typed references, translation keys and static script translations',async t=>{
 const f=await fixture(t);await f.write('BP/entities/fish.json',{'minecraft:entity':{description:{identifier:'test:fish'},component_groups:{wet:{}},events:{done:{add:{component_groups:['wet']}}}}});await f.write('BP/entities/other.json',{'minecraft:entity':{description:{identifier:'test:other'},components:{'minecraft:spawn_entity':{entities:[{spawn_entity:'test:fish<done>'}]}},component_groups:{wet:{}},events:{done:{add:{component_groups:['wet']}}}}});await f.write('RP/entity/fish.json',{'minecraft:client_entity':{description:{identifier:'test:fish'}}});
 await f.write('RP/texts/en_US.lang','entity.test:fish.name=Fish\nitem.spawn_egg.entity.test:fish.name=Spawn Fish\n');await f.write('RP/texts/de_DE.lang','entity.test:fish.name=Fisch\n');await f.write('RP/ui/test.json',{rawtext:[{translate:'entity.test:fish.name'}]});await f.write('BP/scripts/main.ts',"const text = { translate: 'entity.test:fish.name' }; const unrelated = 'test:fish';");const index=await content.scan({...f,config:{}});
 const symbol=symbols.declarations(index).find(s=>s.kind==='entity'&&s.id==='test:fish'),edits=symbols.plan(index,symbol,'test:eel');assert.ok(edits.some(e=>e.file.endsWith('main.ts')&&e.text==='"entity.test:eel.name"'));assert.ok(edits.some(e=>e.text==='"test:eel<done>"'));assert.equal(edits.filter(e=>e.file.endsWith('.lang')).length,3);assert.ok(!edits.some(e=>e.text==='"test:eel"'&&e.file.endsWith('main.ts')));
 const group=symbols.declarations(index).find(s=>s.kind==='entity_group'&&s.file.endsWith('fish.json')),localEdits=symbols.plan(index,group,'swimming');assert.equal(localEdits.length,2);assert.ok(localEdits.every(e=>e.file.endsWith('fish.json')));
 assert.throws(()=>symbols.plan(index,symbol,'test:other'),/already declared/);
 const file=path.join(f.packs.resource,'texts/en_US.lang');await fs.writeFile(file,'entity.test:fish.name=Updated\n');await content.update(index,file);assert.equal(lang.lookup(index,'entity.test:fish.name')[0].value,'Updated');await fs.unlink(file);await content.update(index,file);assert.deepEqual(lang.lookup(index,'entity.test:fish.name').map(e=>e.locale),['de_DE']);
});
test('entity property range and enum defaults produce targeted semantic warnings',()=>{
 const document=doc({'minecraft:entity':{description:{properties:{'test:mode':{type:'enum',values:['a'],default:'b'},'test:count':{type:'int',range:[5,1],default:3}}}}});assert.equal(entity.issues(document).filter(i=>i.code==='bedrock.entityProperty').length,2);
});

test('linked controllers resolve aliases and rename synced properties across their owning entity',async t=>{
 const f=await fixture(t);await fs.mkdir(path.join(f.packs.resource,'animation_controllers'));await fs.mkdir(path.join(f.packs.resource,'render_controllers'));
 await f.write('BP/entities/fish.json',{'minecraft:entity':{description:{identifier:'test:fish',properties:{'test:mode':{type:'bool',default:false,client_sync:true}}}}});
 await f.write('RP/entity/fish.json',{'minecraft:client_entity':{description:{identifier:'test:fish',animations:{main:'controller.animation.test',swim:'animation.test.swim'},geometry:{default:'geometry.test'},render_controllers:[{'controller.render.test':'1.0'}]}}});
 await f.write('RP/animation_controllers/test.json',{animation_controllers:{'controller.animation.test':{states:{idle:{animations:['swim'],transitions:[{idle:"q.has_property('test:mode') && q.property('test:mode')"}]}}}}});
 await f.write('RP/render_controllers/test.json',{render_controllers:{'controller.render.test':{geometry:'Geometry.default'}}});const index=await content.scan({...f,config:{}}),linked=require('../src/linked-entities.cjs');const controller=[...index.documents.values()].find(d=>d.relative==='animation_controllers/test.json');const refs=linked.references(index,controller);assert.equal(refs[0].id,'swim');assert.equal(linked.definitions(index,controller,refs[0])[0].id,'main');
 const property=symbols.declarations(index).find(s=>s.kind==='entity_property'),propertyEdits=symbols.plan(index,property,'test:new_mode');assert.equal(propertyEdits.filter(e=>e.file.includes('animation_controllers')).length,2);
 const render=symbols.declarations(index).find(s=>s.kind==='render_controller'),renderEdits=symbols.plan(index,render,'controller.render.changed');assert.equal(renderEdits.length,2);
 const alias=symbols.declarations(index).find(s=>s.kind==='animation_alias'&&s.id==='swim');assert.equal(symbols.plan(index,alias,'swimming').length,2);
 await f.write('RP/entity/other.json',{'minecraft:client_entity':{description:{identifier:'test:other',animations:{main:'controller.animation.test',swim:'animation.test.other'}}}});await content.update(index,path.join(f.packs.resource,'entity/other.json'));assert.throws(()=>symbols.plan(index,alias,'swimming'),/shared controller/);
});

test('optional property checks and Molang enum defaults stay permissive',()=>{
 const document=doc({'minecraft:entity':{description:{properties:{'test:mode':{type:'enum',values:['calm','angry'],default:"q.had_component_group('old:group') ? 'calm' : 'angry'"}}},events:{check:{set_property:{'test:mode':"q.has_property('test:optional') ? 'calm' : 'angry'"}}}}});assert.deepEqual(entity.issues(document),[]);
});

test('entity metadata supplements uncurated fields without duplicating authored fields or enforcing guessed types',()=>{
 const schema=require('../src/reference.cjs').componentSchema({tag:'v1.26.50.4',target:'1.26.50',components:{entity:{'minecraft:health':{description:'Health.',fields:{value:{type:'number',description:'Value.'},new_hint:{type:'string',description:'New documented hint.'}}}}}},'entity',{omit:['minecraft:health'],supplement:require('../schemas/entity.schema.json')});
 const health=schema.properties['minecraft:entity'].properties.components.properties['minecraft:health'];assert.equal(health.doNotSuggest,true);assert.equal(health.properties.value,undefined);assert.match(health.properties.new_hint.markdownDescription,/learn.microsoft.com/);assert.equal(health.properties.new_hint.type,undefined);
});

test('version-aware component schemas keep entity groups and block permutations in their supported document kinds',()=>{
 const versions=require('../src/format-versions.cjs');
 for(const kind of ['entity','block','item']){const schema=versions.apply(require('../schemas/'+kind+'.schema.json'),kind,'1.26.50');function check(node){if(!node||typeof node!=='object')return;const root=node.properties?.['minecraft:'+kind];if(root?.properties){if(kind!=='block')assert.equal(root.properties.permutations,undefined);if(kind!=='entity')assert.equal(root.properties.component_groups,undefined);}for(const value of Object.values(node))if(Array.isArray(value))value.forEach(check);else if(value&&typeof value==='object')check(value);}check(schema);}
});

test('event completion contexts cover quoted, empty and unfinished values without claiming foreign targets',()=>{
 for(const target of [undefined,'self','other'])for(const value of ['savage:talk7','']){
  const document=doc({'minecraft:entity':{component_groups:{talk:{'minecraft:environment_sensor':{triggers:[{event:value,...(target?{target}:{})}]}}},events:{'savage:talk7':{},'savage:talk8':{}}}});
  const start=document.text.indexOf('"event":')+8,offset=start+1,state=entity.completionContext(document,offset);assert.equal(state?.kind,'entity_event');assert.equal(state.mode,'value');assert.deepEqual(entity.symbols(document).filter(s=>s.kind===state.kind).map(s=>s.id),['savage:talk7','savage:talk8']);
  if(target==='other')assert.ok(!entity.uses(document).some(s=>s.kind==='entity_event'));
 }
 const text='{"minecraft:entity":{"components":{"minecraft:timer":{"time_down_event":{"event": } }},"events":{"savage:talk7":{}}}}';const document={text,tree:json.parseTree(text),file:'test.json'};assert.equal(entity.completionContext(document,text.indexOf('"event":')+9)?.kind,'entity_event');
 const keyOffset=text.indexOf('"event":')+2;assert.notEqual(entity.completionContext(document,keyOffset)?.kind,'entity_event');
});

test('move_to_block validates documented shapes and links block selectors and self-target events',()=>{
 const schema=require('../schemas/entity.schema.json'),validate=new(require('ajv'))({strict:false}).compile(schema);
 const goal={target_blocks:['minecraft:seagrass','minecraft:kelp'],target_selection_method:'nearest',stay_duration:1200,priority:0,search_range:32,on_reach:{event:'savage:set_egg_drifting_f',target:'self'},goal_radius:0};
 const document=doc({format_version:'1.26.50','minecraft:entity':{description:{identifier:'test:mob'},components:{'minecraft:behavior.move_to_block':goal},events:{'savage:set_egg_drifting_f':{}}}});assert.ok(validate(document.data),JSON.stringify(validate.errors));
 const refs=content.references({...document,side:'behavior',relative:'entities/test.json'});assert.deepEqual(refs.filter(r=>r.type==='block').map(r=>r.value),['minecraft:seagrass','minecraft:kelp']);assert.ok(entity.uses(document).some(r=>r.kind==='entity_event'&&r.id==='savage:set_egg_drifting_f'));assert.deepEqual(entity.issues(document),[]);
 const alternate=structuredClone(document.data),g=alternate['minecraft:entity'].components['minecraft:behavior.move_to_block'];g.on_reach=[{event:'savage:set_egg_drifting_f',target:'self'}];g.on_stay_completed={event:'savage:set_egg_drifting_f'};g.target_offset={x:0,y:1,z:0};assert.ok(validate(alternate),JSON.stringify(validate.errors));g.target_selection_method='invalid';assert.equal(validate(alternate),false);g.target_selection_method='random';g.goal_radius='invalid';assert.equal(validate(alternate),false);
 const definition=schema.definitions.components.properties['minecraft:behavior.move_to_block'];for(const field of Object.values(definition.properties))if(field.description)assert.match(field.markdownDescription,/minecraftbehavior_move_to_block/);
});

test('movement.sway exposes movement-control fields with numeric defaults and correct hover links',()=>{
 const schema=require('../schemas/entity.schema.json'),definition=schema.definitions.components.properties['minecraft:movement.sway'];
 assert.deepEqual(Object.keys(definition.properties),['max_turn','sway_amplitude','sway_frequency']);assert.deepEqual(Object.values(definition.properties).map(p=>p.default),[30,0.05,0.5]);for(const field of Object.values(definition.properties)){assert.equal(field.type,'number');assert.ok(field.description);assert.match(field.markdownDescription,/minecraftcomponent_movement\.sway/);}
 const validate=new(require('ajv'))({strict:false}).compile(schema);for(const components of [{components:{'minecraft:movement.sway':{sway_amplitude:0}}},{component_groups:{swim:{'minecraft:movement.sway':{max_turn:30,sway_amplitude:0.05,sway_frequency:0.5}}}}])assert.ok(validate({format_version:'1.26.50','minecraft:entity':{description:{identifier:'test:fish'},...components}}),JSON.stringify(validate.errors));assert.equal(validate({format_version:'1.26.50','minecraft:entity':{components:{'minecraft:movement.sway':{sway_amplitude:'bad'}}}}),false);
});

test('avoid_mob_type entity_types fields have goal-specific descriptions and numeric rules',()=>{
 const schema=require('../schemas/entity.schema.json'),definition=schema.definitions.components.properties['minecraft:behavior.avoid_mob_type'],entry=definition.properties.entity_types.anyOf[0];
 for(const name of ['max_dist','walk_speed_multiplier','sprint_speed_multiplier']){assert.equal(entry.properties[name].type,'number');assert.match(entry.properties[name].markdownDescription,/minecraftbehavior_avoid_mob_type/);assert.ok(entry.properties[name].description.length>20);}
 assert.match(definition.properties.entity_types.markdownDescription,/avoid/);assert.ok(!Object.hasOwn(definition.properties,'speed_multiplier'));
 const validate=new(require('ajv'))({strict:false}).compile(schema),avoid={entity_types:[{filters:{any_of:[{test:'is_family',subject:'other',value:'player'},{test:'is_family',subject:'other',value:'axolotl'}]},max_dist:6,walk_speed_multiplier:1.6,sprint_speed_multiplier:2.1}]};const data={format_version:'1.26.50','minecraft:entity':{components:{'minecraft:behavior.avoid_mob_type':avoid}}};assert.ok(validate(data),JSON.stringify(validate.errors));avoid.entity_types[0].max_dist='bad';assert.equal(validate(data),false);
});

test('offspring property inheritance uses file declarations without confusing mutation parameters',()=>{
 for(const grouped of [false,true]){
  const offspring={'minecraft:offspring':{property_inheritance:{'savage:size':{mutation_chance:0.03125,mutation_values:[1,2,3]}}}},document=doc({'minecraft:entity':{description:{properties:{'savage:size':{type:'int',range:[1,3],default:2},'savage:color':{type:'enum',values:['red','blue'],default:'red'}}},...(grouped?{component_groups:{breeding:offspring}}:{components:offspring})}});
  const offset=document.text.indexOf('"savage:size"',document.text.indexOf('property_inheritance'))+3,state=entity.completionContext(document,offset);assert.equal(state.kind,'entity_property');assert.equal(state.mode,'key');assert.equal(state.inheritance,true);assert.ok(entity.uses(document).some(s=>s.kind==='entity_property'&&s.id==='savage:size'));
  const mutation=document.text.indexOf('mutation_chance')+3;assert.equal(entity.completionContext(document,mutation),undefined);
  const index=new content.ContentIndex({});index.documents.set(document.file,document);const changes=symbols.plan(index,{kind:'entity_property',id:'savage:size',scope:'entity',local:true,file:document.file},'savage:weight');assert.equal(changes.filter(c=>c.text==='"savage:weight"').length,2);
 }
 const document=doc({'minecraft:entity':{description:{properties:{'savage:size':{type:'int'}}},components:{'minecraft:offspring':{property_inheritance:{}}}}});const offset=document.text.indexOf('{}')+1;assert.equal(entity.completionContext(document,offset)?.inheritance,true);
});
