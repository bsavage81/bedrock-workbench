const {test}=require('node:test'),assert=require('node:assert/strict'),json=require('jsonc-parser'),m=require('../src/molang.cjs'),bindings=require('../src/molang-bindings.cjs');
function doc(value,relative='animations/main.json',side='resource'){const text=typeof value==='string'?value:JSON.stringify(value);return {text,tree:json.parseTree(text),data:json.parse(text),relative,side,file:side+'/'+relative};}
function animation(expression,id='animation.main',file='animations/main.json'){return doc({animations:{[id]:{bones:{body:{rotation:[expression,0,0]}}}}},file);}
function entity(variable='base',file='entity/main.json',extra={}){return doc({'minecraft:client_entity':{description:{identifier:'test:actor',animations:{main:'animation.main',controller:'controller.animation.main',nested:'controller.animation.nested',helper:'animation.helper'},textures:{skin:'textures/'+variable},scripts:{initialize:['v.'+variable+' = 1;']},...extra}}},file);}
function index(documents,selected){return {documents:new Map(documents.map(d=>[d.file,d])),project:{config:{target:'release',targetVersion:'1.26.50',authoring:{resourceSubpack:selected}}}};}
function node(d,text){return m.nodes(d).find(n=>text===undefined||n.value===text);}
function choices(d,i,text){const n=node(d,text);return m.completions(d,n,m.offsets(d,n).at(-1),i);}
test('controller cycles and nested aliases retain one owner without importing unrelated actors',()=>{
 const main=doc({animation_controllers:{'controller.animation.main':{states:{a:{animations:['nested'],on_entry:['v.main = 1;']}}},'controller.animation.unrelated':{states:{a:{on_entry:['v.secret = 1;']}}}}},'animation_controllers/main.json');
 const nested=doc({animation_controllers:{'controller.animation.nested':{states:{a:{animations:['controller','helper'],on_entry:['v.']}}}}},'animation_controllers/nested.json');
 const helper=animation('v.helper = 3;','animation.helper','animations/helper.json'),owner=entity(),i=index([main,nested,helper,owner]);
 assert.equal(bindings.owners(i,nested,'controller.animation.nested').length,1);const values=choices(nested,i).map(e=>e.name);assert.ok(values.includes('v.helper'));assert.ok(values.includes('v.base'));assert.ok(!values.includes('v.secret'));
 const other=entity('other','entity/other.json',{identifier:'test:other',animations:{nested:'controller.animation.nested'}});i.documents.set(other.file,other);const shared=choices(nested,i).map(e=>e.name);assert.ok(!shared.includes('v.base')&&!shared.includes('v.other'));
});
test('declared subpack selection overlays whole files with base fallback and no sibling merge',()=>{
 const manifest=doc({subpacks:[{folder_name:'high'},{folder_name:'low'}]},'manifest.json'),base=entity(),high=entity('high','subpacks/high/entity/main.json'),low=entity('low','subpacks/low/entity/main.json'),current=animation('v.');
 const i=index([manifest,base,high,low,current],'high');let names=choices(current,i).map(e=>e.name);assert.ok(names.includes('v.high'));assert.ok(!names.includes('v.base')&&!names.includes('v.low'));
 i.project.config.authoring.resourceSubpack=undefined;names=choices(current,i).map(e=>e.name);assert.ok(names.includes('v.base'));assert.ok(!names.includes('v.high'));
 i.project.config.authoring.resourceSubpack='not_declared';assert.ok(choices(current,i).some(e=>e.name==='v.base'));
 const baseAnimations=doc({animations:{'animation.main':{},'animation.hidden':{}}},'animations/multiple.json'),override=doc({animations:{'animation.main':{}}},'subpacks/high/animations/multiple.json');
 const g=bindings.graph(index([manifest,baseAnimations,override],'high'),override);assert.ok(!g.definitions.some(d=>d.id==='animation.hidden'));
});
test('edited subpack wins over project preview, duplicate IDs stay ambiguous, and edits invalidate bindings',()=>{
 const manifest=doc({subpacks:[{folder_name:'high'},{folder_name:'low'}]},'manifest.json'),base=entity(),high=entity('high','subpacks/high/entity/main.json'),low=entity('low','subpacks/low/entity/main.json'),current=animation('v.','animation.main','subpacks/low/animations/main.json'),i=index([manifest,base,high,low,current],'high');
 assert.ok(choices(current,i).some(e=>e.name==='v.low'));assert.ok(!choices(current,i).some(e=>e.name==='v.high'));
 const edited=entity('edited',low.relative);i.documents.set(edited.file,edited);assert.ok(choices(current,i).some(e=>e.name==='v.edited'));assert.ok(!choices(current,i).some(e=>e.name==='v.low'));
 const duplicate=animation('v.','animation.main','subpacks/low/animations/duplicate.json');i.documents.set(duplicate.file,duplicate);assert.equal(bindings.owners(i,current,'animation.main').length,0);
});
test('variable and compound resource definitions use exact escaped source ranges and owning declarations',()=>{
 const escaped=doc('{"animations":{"animation.helper":{"bones":{"body":{"rotation":["\\u0076.helper = 1;",0,0]}}}}}','animations/helper.json'),owner=entity(),current=animation('v.helper + 1'),i=index([escaped,owner,current]);
 const n=node(current),defs=bindings.definitions(i,current,n,m.offsets(current,n)[2]);assert.equal(defs.length,1);assert.equal(defs[0].document.file,escaped.file);assert.equal(escaped.text.slice(defs[0].offset,defs[0].offset+defs[0].length),'\\u0076.helper');
 const render=doc({render_controllers:{'controller.render.main':{textures:['q.is_baby ? Texture.skin : Texture.skin']}}},'render_controllers/main.json'),renderOwner=entity('base','entity/main.json',{render_controllers:['controller.render.main']});const ri=index([render,renderOwner]),rn=node(render),at=rn.value.indexOf('Texture.skin')+9;
 const resource=bindings.definitions(ri,render,rn,m.offsets(render,rn)[at]);assert.equal(resource.length,1);assert.equal(resource[0].document.text.slice(resource[0].offset,resource[0].offset+resource[0].length),'"skin"');
});
test('runtime actor aliases navigate locally but arrow members never leak caller variables or properties',()=>{
 const current=animation('t.wearer = c.owning_entity; t.alias = t.wearer; t.alias->v.'),owner=entity('private'),i=index([current,owner]),n=node(current),map=m.offsets(current,n);
 assert.ok(!choices(current,i).some(e=>e.name==='v.private'));assert.deepEqual(m.issues(current).filter(i=>i.code==='bedrock.molangRestriction'),[]);
 const alias=bindings.definitions(i,current,n,map[n.value.lastIndexOf('t.alias')+3]);assert.equal(alias.length,1);assert.equal(current.text.slice(alias[0].offset,alias[0].offset+alias[0].length),'t.alias');
 assert.deepEqual(bindings.definitions(i,current,n,map.at(-1)),[]);
 const property=animation("t.wearer->q.property('test:')"),pn=node(property);assert.deepEqual(m.completions(property,pn,m.offsets(property,pn)[pn.value.indexOf("test:")+5],index([property,owner])),[]);
 const grouped=animation('t.wearer->(v.');assert.ok(!choices(grouped,index([grouped,owner])).some(e=>e.name==='v.private'));
 assert.deepEqual(require('../src/entity-authoring.cjs').uses(property),[]);
 const after=animation('t.wearer->(v.external_only); v.');assert.ok(!choices(after,index([after,owner])).some(e=>e.name==='v.external_only'));
});
test('controller state and particle curve declarations provide scoped completion and navigation',()=>{
 const controller=doc({animation_controllers:{main:{states:{a:{variables:{speed:{input:'q.ground_speed',remap_curve:{0:0,1:1}}},transitions:[{b:'v.'}]},b:{variables:{hidden:{input:'1'}}}}}}},'animation_controllers/main.json'),i=index([controller]);
 const names=choices(controller,i,'v.').map(e=>e.name);assert.ok(names.includes('v.speed'));assert.ok(!names.includes('v.hidden'));
 const particle=doc({particle_effect:{curves:{'variable.curve':{type:'linear',input:'',nodes:['',1]}},events:{spawn:{sequence:[{expression:''},{particle_effect:{effect:'test:effect',type:'emitter',pre_effect_expression:''}}]}}}},'particles/main.json');
 assert.equal(m.nodes(particle).length,4);assert.ok(choices(particle,index([particle])).some(e=>e.name==='variable.curve'));assert.ok(!m.nodes(particle).some(n=>n.value==='linear'||n.value==='test:effect'));
});
test('documented optional/slot overloads select the right signature without speculative query arity errors',()=>{
 let d=animation("q.is_item_name_any('slot.hotbar', 2, "),n=node(d),s=m.signature(d,n,m.offsets(d,n).at(-1));assert.equal(s.signatures.length,2);assert.equal(s.activeSignature,1);assert.equal(s.entry.parameters[s.parameter],'item_name');
 d=animation("q.is_item_name_any('slot.weapon.mainhand', ");n=node(d);s=m.signature(d,n,m.offsets(d,n).at(-1));assert.equal(s.activeSignature,0);assert.equal(s.entry.parameters[s.parameter],'item_name');
 d=animation('q.is_item_equipped(');n=node(d);s=m.signature(d,n,m.offsets(d,n).at(-1));assert.equal(s.signatures.length,2);assert.deepEqual(s.signatures[0].parameters,[]);assert.equal(s.entry.parameters[0],'hand');
 assert.deepEqual(m.issues(animation("q.is_item_equipped + q.cooldown_time_remaining")),[]);assert.equal(choices(animation('q.is_item_equipp')).find(e=>e.name==='q.is_item_equipped').insert,'q.is_item_equipped');
});
test('reviewed format and experiment guidance is not confused with an introduction version',()=>{
 const d=animation('q.bone_orientation_trs'),n=node(d),h=m.hover(d,n,m.offsets(d,n)[3],index([d]));assert.match(h.markdown,/1.20.60/);assert.match(h.markdown,/experimental toggle/);assert.match(h.markdown,/not an inferred first engine/);assert.deepEqual(m.issues(d),[]);
 const old=doc({format_version:'1.10.0',animation_controllers:{main:{states:{a:{transitions:[{b:'q.state_time > 2'}]}}}}},'animation_controllers/old.json');assert.deepEqual(m.issues(old),[]);
});
test('channel descriptions and documentation views are selected independently, with a recorded zero-difference audit',()=>{
 const fixture={name:'query.test',description:'release fact',url:'https://learn.microsoft.com/test?view=minecraft-bedrock-stable',previewDocumentation:{description:'preview fact'}};
 assert.equal(m.forChannel(fixture,{project:{config:{target:'preview'}}}).description,'preview fact');assert.match(m.forChannel(fixture,{project:{config:{target:'preview'}}}).url,/experimental/);assert.equal(m.forChannel(fixture,index([])).description,'release fact');
 assert.deepEqual(m.catalog.provenance.channelAudit.changedDescriptions,[]);assert.deepEqual(m.catalog.provenance.channelAudit.previewOnly,[]);
});
test('additional empty worldgen fields and legacy/current numeric forms receive expression assistance without enum noise',()=>{
 for(const value of [{distribution:{scatter_chance:'',x:{distribution:'uniform',extent:['',8]}}},{scatter_chance:'',x:''}]){const d=doc({'minecraft:scatter_feature':value},'features/scatter.json','behavior');assert.equal(m.nodes(d).length,2);assert.ok(!m.nodes(d).some(n=>n.value==='uniform'));}
 const animationDoc=doc({animations:{main:{loop:'hold_on_last_frame',bones:{body:{rotation:{0:{lerp_mode:'catmullrom',post:['',0,0]}}}}}}});assert.equal(m.nodes(animationDoc).length,1);
 const aliases=doc({'minecraft:client_entity':{description:{animations:{walk:'variable.animation'},scripts:{animate:['v.walk']}}}},'entity/aliases.json');assert.deepEqual(m.nodes(aliases),[]);
 const literal=doc({'minecraft:item':{components:{'minecraft:tags':{tags:['query.external:tag']}}}},'items/tags.json','behavior');assert.deepEqual(m.issues(literal),[]);
});
test('authoring selection schema allows named choices and rejects paths without changing pack/build settings',()=>{
 const schema=require('../schemas/project.schema.json').properties.authoring,validate=new(require('ajv'))({strict:false}).compile(schema);
 assert.ok(validate({resourceSubpack:'high'}));assert.ok(validate({resourceSubpack:''}));assert.ok(!validate({resourceSubpack:'../high'}));assert.ok(!validate({resourceSubpack:'a\\b'}));
});
