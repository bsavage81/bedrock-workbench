const {test}=require('node:test'),assert=require('node:assert/strict'),json=require('jsonc-parser'),m=require('../src/molang.cjs');
function document(data,relative='animations/test.json',side='resource',file=relative){const text=typeof data==='string'?data:JSON.stringify(data);return {text,tree:json.parseTree(text),data:json.parse(text),relative,side,file};}
function animation(value){return document({animations:{'animation.test':{bones:{body:{rotation:[value,0,0]}}}}});}
function expression(doc){return m.nodes(doc)[0];}
function choices(doc,suffix,index){const node=expression(doc),pos=suffix===undefined?node.value.length:node.value.indexOf(suffix);return m.completions(doc,node,m.offsets(doc,node)[pos],index);}
test('Learn inventory uses canonical names, unique entries, dedicated URLs and math signatures',()=>{
 assert.equal(m.catalog.entries.length,378);assert.equal(new Set(m.catalog.entries.map(e=>e.name)).size,378);
 assert.ok(m.entries.every(e=>e.url.startsWith('https://learn.microsoft.com/')));
 assert.ok(m.info('Q.SpellColor.r'));assert.ok(m.info('q.get_name').internal);
 assert.deepEqual(m.info('math.clamp').parameters,['value','min','max']);
});
test('empty/numeric/partial expression slots work across BP/RP families without ordinary ID noise',()=>{
 for(const doc of [animation(''),document({'minecraft:block':{permutations:[{condition:''}]}},'blocks/a.json','behavior'),document({animation_controllers:{'controller.animation.test':{states:{default:{transitions:[{next:''}]}}}}},'animation_controllers/a.json'),document({render_controllers:{'controller.render.test':{textures:['']}}},'render_controllers/a.json'),document({'minecraft:client_entity':{description:{scripts:{pre_animation:['']}}}},'entity/a.json'),document({'minecraft:item':{components:{'minecraft:repairable':{repair_items:[{items:['a'],repair_amount:''}]}}}},'items/a.json','behavior'),document({'minecraft:geometry':[{bones:[{binding:''}]}]},'models/entity/a.geo.json'),document({entity_sounds:{entities:{cat:{variants:{key:''}}}}},'sounds.json')])assert.ok(choices(doc).some(e=>e.name==='math.clamp'),doc.relative);
 const ids=document({'minecraft:client_entity':{description:{identifier:'test:id',textures:{default:'textures/entity/test'},animations:{walk:'animation.walk'},scripts:{variables:{'variable.public':'public'},animate:['walk']}}}},'entity/a.json');assert.deepEqual(m.nodes(ids),[]);
 assert.deepEqual(m.nodes({...animation('math.sin('),relative:'texts/test.json'}),[]);
});
test('query availability follows explicit controller/side/tag contexts without duplicates or alias noise',()=>{
 const doc=animation('q.');const names=choices(doc).map(e=>e.name);assert.ok(names.includes('q.anim_time'));assert.ok(!names.includes('query.anim_time'));assert.ok(!names.includes('q.state_time'));assert.ok(!names.includes('q.anger_level'));assert.equal(new Set(names).size,names.length);
 const controller=document({animation_controllers:{test:{states:{a:{transitions:[{b:'q.'}]}}}}},'animation_controllers/a.json');assert.ok(choices(controller).some(e=>e.name==='q.state_time'));
});
test('insertion replaces the whole token, retains suffix calls, and offers snippet placeholders',()=>{
 const doc=animation('2 + math.clam + 1'),node=expression(doc),pos=node.value.indexOf('clam')+2;
 const choice=m.completions(doc,node,m.offsets(doc,node)[pos]).find(e=>e.name==='math.clamp');assert.ok(choice);assert.equal(node.value.slice(choice.start,choice.end),'math.clam');assert.equal(choice.insert,'math.clamp(${1:value}, ${2:min}, ${3:max})');
 const existing=animation('math.si(90)');assert.equal(choices(existing,'(').find(e=>e.name==='math.sin').insert,'math.sin');
 assert.ok(choices(animation('loo')).find(e=>e.name==='loop').insert.includes('{ ${2} }'));
});
test('JSON escapes and surrogate code units map hovers/diagnostics/signatures precisely',()=>{
 const doc=animation('q.is_name_any(\'😀\') + math.sin('),node=expression(doc);assert.equal(m.issues(doc)[0].offset,doc.text.lastIndexOf('('));
 const escaped=document('{"animations":{"test":{"bones":{"body":{"rotation":["\\u006dath.clamp(1,\\n2,",0,0]}}}}}'),n=expression(escaped);
 const signature=m.signature(escaped,n,escaped.text.indexOf('",0'));assert.equal(signature.entry.name,'math.clamp');assert.equal(signature.parameter,2);
 const h=m.hover(escaped,n,n.offset+2);assert.match(h.markdown,/Microsoft Learn/);assert.match(h.markdown,/Returns: number/);
});
test('nested calls, strings with commas, arrays and scopes do not corrupt parameter guidance',()=>{
 const doc=animation("math.clamp(q.property('a,b'), math.max(1,2), "),n=expression(doc),s=m.signature(doc,n,m.offsets(doc,n).at(-1));assert.equal(s.entry.name,'math.clamp');assert.equal(s.parameter,2);
 assert.deepEqual(choices(animation("q.property('ma")),[]);
});
test('valid complex and legacy grammar stays permissive',()=>{
 for(const s of ["q.is_baby ? q.is_sleeping ? 1 : 2 : 3",'v.x = 0.2f; loop(10, {t.x = v.x; v.x = t.x + 1; (v.x > 5) ? break;}); return v.x;',"for_each(t.e, q.get_nearby_entities(4, 'minecraft:pig'), {v.x = t.e->v.x;});",'return (v.struct.x ?? 0) + q.unknown_runtime_query;',"q.property('CaseSensitive') == 'SomeName'",'Geometry.default','Array.skins[q.variant]','math.sin(-90)','v.x = 2; v.x > 1 ? {v.y = 4;}','1.e-2 + .25'])assert.deepEqual(m.errors(s),[],s);
 assert.deepEqual(m.errors('('.repeat(256)+'1'+')'.repeat(256)),[]);
});
test('definite syntax errors report locations without cascading runtime-variable errors',()=>{
 for(const s of ['1 +','math.sin(1 2)','math.sin([1))',"q.property('unfinished",'v.x = ;','1 + $'])assert.ok(m.errors(s).length,s);
 assert.deepEqual(m.issues(animation('v.runtime + t.runtime + c.runtime + q.external')),[]);
});
test('multi-string client scripts share syntax while diagnostics retain source locations',()=>{
 const doc=document({'minecraft:client_entity':{description:{scripts:{pre_animation:['v.x ? {','v.y = 1;','};']}}}},'entity/a.json');assert.deepEqual(m.issues(doc),[]);
 const bad=document({'minecraft:client_entity':{description:{scripts:{pre_animation:['v.x ? {','v.y = ;','};']}}}},'entity/a.json');const issue=m.issues(bad)[0];assert.ok(issue.offset>bad.text.indexOf('v.y'));
});
test('documented restrictions use pack min_engine_version rather than file format or target',()=>{
 const doc=animation('q.is_scenting'),manifest=document({header:{min_engine_version:[1,20,40]}},'manifest.json'),index={documents:new Map([['manifest',manifest]]),project:{config:{target:'release',targetVersion:'1.26.50'}}};
 assert.deepEqual(m.issues(doc,index),[]);manifest.data.header.min_engine_version=[1,20,50];assert.match(m.issues(doc,index)[0].message,/1.20.50/);
 assert.match(m.issues(animation('context.foo = 1;'))[0].message,/read-only/);assert.match(m.issues(animation('math.clamp(1,2)'))[0].message,/3 arguments/);assert.deepEqual(m.issues(animation("q.some_runtime_func(1,2,3,4)")),[]);
});
test('local temporary variables respect closed braces and do not leak between expressions',()=>{
 const doc=animation('t.outer = 1; loop(2, {t.inner = 2;}); t.');const names=choices(doc).map(e=>e.name);assert.ok(names.includes('t.outer'));assert.ok(!names.includes('t.inner'));
 const separate=document({animations:{a:{bones:{body:{rotation:['t.other = 1;','t.',0]}}}}});const n=m.nodes(separate)[1];assert.ok(!m.completions(separate,n,m.offsets(separate,n).at(-1)).some(e=>e.name==='t.other'));
});
test('project variables/resources obey unique ownership and separate named definitions',()=>{
 const current=document({animations:{'animation.test':{bones:{body:{rotation:['v.',0,0]}}},'animation.unrelated':{bones:{body:{rotation:['v.secret = 1;',0,0]}}}}});
 const owner=document({'minecraft:client_entity':{description:{identifier:'test:mob',animations:{main:'animation.test'},scripts:{initialize:['v.owned = 1;']}}}},'entity/mob.json');
 const index={documents:new Map([[current.file,current],[owner.file,owner]])};assert.ok(choices(current,undefined,index).some(e=>e.name==='v.owned'));assert.ok(!choices(current,undefined,index).some(e=>e.name==='v.secret'));
 const other=document({'minecraft:client_entity':{description:{identifier:'test:other',animations:{main:'animation.test'},scripts:{initialize:['v.other = 1;']}}}},'entity/other.json');index.documents.set(other.file,other);assert.ok(!choices(current,undefined,index).some(e=>e.name==='v.owned'||e.name==='v.other'));
});
test('particle resource IDs, hex colors and controller commands are not parsed as expressions',()=>{
 const d=document({particle_effect:{components:{'minecraft:particle_lifetime_expire_if_not_in_blocks':['minecraft:water'],'minecraft:particle_appearance_tinting':{color:'#ffffffff'}}}},'particles/a.json');assert.deepEqual(m.nodes(d),[]);
 const controller=document({animation_controllers:{a:{states:{default:{on_entry:['@s event','/say hello']}}}}},'animation_controllers/a.json','behavior');assert.deepEqual(m.nodes(controller),[]);
});
test('documented property/permutation restrictions guide suggestions and preserve direct enum values',()=>{
 const permutation=document({'minecraft:block':{permutations:[{condition:'q.'}]}},'blocks/a.json','behavior');const names=choices(permutation).map(e=>e.name);assert.ok(names.includes('q.block_state'));assert.ok(!names.includes('q.is_baby'));
 const defaults=document({'minecraft:entity':{description:{properties:{'test:default':{type:'float',default:'q.'}}}}},'entities/a.json','behavior');assert.deepEqual(choices(defaults).filter(e=>e.name.startsWith('q.')).map(e=>e.name),['q.had_component_group']);
 const enums=document({'minecraft:entity':{description:{properties:{'test:mode':{type:'enum',values:['calm'],default:'calm'}}},events:{go:{set_property:{'test:mode':'calm'}}}}},'entities/a.json','behavior');assert.deepEqual(m.nodes(enums),[]);
 const invalid=document({'minecraft:entity':{description:{properties:{'test:default':{type:'float',default:'v.x'}}}}},'entities/a.json','behavior');assert.match(m.issues(invalid)[0].message,/cannot read/);
});
test('script brace support follows document format, independently from target and pack rules',()=>{
 const data={format_version:'1.10.0','minecraft:client_entity':{description:{scripts:{pre_animation:['v.x ? {','t.previous = 1;','};']}}}},doc=document(data,'entity/a.json');
 assert.match(m.issues(doc)[0].message,/1.26.0/);data.format_version='1.26.0';assert.deepEqual(m.issues(document(data,'entity/a.json')),[]);
 data['minecraft:client_entity'].description.scripts.pre_animation=['t.previous = 1;','t.'];const scope=document(data,'entity/a.json'),node=m.nodes(scope)[1];assert.ok(m.completions(scope,node,m.offsets(scope,node).at(-1)).some(e=>e.name==='t.previous'));
});
test('subpack expression locations and incomplete JSON retain useful completion ranges',()=>{
 const sub={...animation('math.si'),relative:'subpacks/high/animations/a.json'};assert.ok(choices(sub).some(e=>e.name==='math.sin'));
 const complete=animation('math.si'),partial=document(complete.text.slice(0,complete.text.indexOf('math.si')+7));const n=expression(partial);assert.ok(m.completions(partial,n,partial.text.length).some(e=>e.name==='math.sin'));assert.equal(m.offsets(partial,n).at(-1),partial.text.length);
});
test('quoted argument insertion and local state/property references preserve surrounding expressions',()=>{
 const block=document({'minecraft:block':{description:{states:{'test:active':[true,false]}},permutations:[{condition:"q.block_state('test:a') == true"}]}},'blocks/a.json','behavior'),node=expression(block),pos=node.value.indexOf("a')")+1;
 const found=m.completions(block,node,m.offsets(block,node)[pos]);assert.equal(found.length,1);assert.equal(found[0].insert,'test:active');assert.equal(node.value.slice(found[0].start,found[0].end),'test:a');
 const entry=choices(animation('q.block_sta')).find(e=>e.name==='q.block_state');assert.equal(entry.insert,"q.block_state('${1:state_name}')");
 const entity=document({'minecraft:entity':{description:{properties:{'test:mode':{type:'int',default:0}}},events:{go:{set_property:{'test:mode':"q.property('test:m')+1"}}}}},'entities/a.json','behavior'),n=expression(entity),offset=m.offsets(entity,n)[n.value.indexOf("m')")+1];assert.ok(m.completions(entity,n,offset).some(e=>e.name==='test:mode'));
});
test('numeric parameter hovers explain the argument while string payloads stay with reference providers',()=>{
 const doc=animation('math.clamp(4, 0, 10)'),node=expression(doc),map=m.offsets(doc,node),hover=m.hover(doc,node,map[node.value.indexOf('10')]);assert.match(hover.markdown,/Inclusive upper bound/);assert.match(hover.markdown,/Microsoft Learn/);
 assert.ok(!choices(animation('loop(2, {v.x = 1;}); ')).some(e=>e.name==='break'));
});
