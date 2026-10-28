const test=require('node:test'),assert=require('node:assert/strict'),p=require('../src/preview-properties.cjs'),m=require('../src/molang.cjs'),{resolver,infer}=require('../src/preview-render-bindings.cjs'),{convert}=require('../src/preview-geometry.cjs');
test('appearance components expose authored group values and feed matching query inputs',()=>{
 const doc={side:'behavior',data:{'minecraft:entity':{description:{identifier:'test:fish'},components:{'minecraft:variant':{value:0},'minecraft:color':{value:2}},component_groups:{other:{'minecraft:variant':{value:1},'minecraft:color2':{value:14},'minecraft:skin_id':{value:3},'minecraft:mark_variant':{value:4}}}}}};
 const info=p.properties({documents:new Map([['fish',doc]])},'test:fish');assert.deepEqual(info.fields.find(f=>f.name==='query.variant').values,[0,1]);assert.equal(info.fields.find(f=>f.name==='query.color2').default,undefined);
 const values=p.inputs(info.fields,{'query.variant':1});assert.equal(p.literal(m.lex('q.variant'),values),1);assert.equal(p.literal(m.lex('q.color2'),values),undefined);assert.deepEqual(p.referenced('q.variant + q.color',values),['query.variant','query.color']);
});
function index(properties){const d={side:'behavior',file:'/BP/entity.json',data:{'minecraft:entity':{description:{identifier:'test:entity',properties}}}};return {documents:new Map([[d.file,d]])};}
test('only uniquely owned client-synced valid schemas become controls; computed defaults remain unresolved',()=>{
 const i=index({skin:{type:'enum',values:['base','warm'],default:'base',client_sync:true},flag:{type:'bool',default:false,client_sync:true},count:{type:'int',range:[0,3],default:2,client_sync:true},weight:{type:'float',range:[-1,1],default:'.5',client_sync:true},private:{type:'bool',default:true},bad:{type:'enum',values:[],client_sync:true}});
 const info=p.properties(i,'test:entity');assert.deepEqual(info.fields.map(f=>f.name),['skin','flag','count','weight']);assert.deepEqual({...p.inputs(info.fields)},{skin:'base',flag:false,count:2});assert.deepEqual({...p.inputs(info.fields,{skin:'warm',flag:true,count:1.5,weight:.5,private:true})},{skin:'warm',flag:true,count:2,weight:.5});assert.equal(p.valid(info.fields[2],Infinity),false);
 i.documents.set('/BP/duplicate.json',{...i.documents.values().next().value});assert.equal(p.properties(i,'test:entity').fields.length,0);assert.match(p.properties(i,'test:entity').warning,/Multiple/);assert.equal(p.properties(i,'other:entity').fields.length,0);
});
test('property predicates use only explicit inputs, numeric/boolean literals and comparisons',()=>{
 const values={'test:horn':'curve','test:flag':false,'test:index':2};const pred=s=>p.predicate(m.lex(s),values);
 assert.equal(pred("q.property('test:horn') == 'curve'"),true);assert.equal(pred("Q.PROPERTY('test:flag') == false"),true);assert.equal(pred("!q.property('test:flag')"),true);assert.equal(pred("q.property('test:index') >= 2"),true);
 for(const s of ["q.property('missing') == 0",'q.is_baby','math.random(0,1)','v.a = 1',"q.property('test:horn') == 'Curve'"])assert.equal(pred(s),s.includes("'Curve'")?false:undefined);
});
test('property ternaries and numeric array indices constrain resource aliases',()=>{
 const c={geometry:'geometry.default',arrays:{textures:{'array.skin':['texture.default','texture.warm']}},textures:["q.property('test:skin') == 'warm' ? texture.warm : texture.default"]};
 const desc={geometry:{default:'g'},textures:{default:'base',warm:'warm'}};assert.deepEqual(resolver(c,desc,{'test:skin':'warm'}).expression(c.textures[0],'texture').map(x=>x.alias),['warm']);
 assert.deepEqual(resolver(c,desc,{'test:index':1}).expression("array.skin[q.property('test:index')]",'texture').map(x=>x.alias),['warm']);
});
test('straight-line property bindings expand without executing scripts or assuming forward references',()=>{
 const scripts=["t.climate = q.property('climate');","v.index = t.climate == 'warm' ? 1 : 0;"];
 const value=p.expand('array.geo[v.index]',scripts),r=resolver({arrays:{geometries:{'array.geo':['geometry.default','geometry.warm']}}},{geometry:{default:'g',warm:'w'}},{climate:'warm'});assert.deepEqual(r.expression(value,'geometry').map(x=>x.alias),['warm']);
 assert.match(p.expand('v.index',[scripts[1],scripts[0]]),/t.climate/);assert.match(p.expand('v.index',['v.index = 0;','v.index = 1;']),/v.index/);assert.match(p.expand('v.index',['v.index = v.index + 1;']),/v.index/);
});
test('visibility patterns are case insensitive, ordered and affect each bone without removing its transforms',()=>{
 const model={bones:[{name:'root',pivot:[0,0,0],rotation:[0,0,90],cubes:[{size:[1,1,1],uv:[0,0]}]},{name:'lBasicHorn',parent:'root',cubes:[{size:[1,1,1],uv:[0,0]}]},{name:'lLongHorn',parent:'root',cubes:[{size:[2,1,1],uv:[0,0]}]}]};
 const rules=[{root:0},{'*basicHorn':"q.property('horn') == 'basic'"},{'*longHorn':"q.property('horn') == 'long'"}];
 let result=p.visible(model,rules,{horn:'basic'});assert.deepEqual({...result.visibility},{root:false,lBasicHorn:true,lLongHorn:false});const mesh=convert(model,result.visibility);assert.equal(mesh.faces.length,6);assert.ok(mesh.faces[0].positions.some(v=>v[0]<0),'Hidden parent transform is retained');
 result=p.visible(model,[{'*':0},{lBasicHorn:'q.is_baby'}],{});assert.equal(result.visibility.lBasicHorn,true);assert.match(result.warning,/Unresolved/);
});
test('unsupported or duplicate controller definitions cannot hide bones by inference',()=>{
 const i=index({}),owner={side:'resource',file:'/RP/entity.json',relative:'entity/test.json',data:{'minecraft:client_entity':{description:{identifier:'test:entity',geometry:{default:'g'},textures:{default:'t'},render_controllers:['controller.render.test']}}}},controller={side:'resource',file:'/RP/controller.json',data:{render_controllers:{'controller.render.test':{geometry:'geometry.default',textures:['texture.default'],part_visibility:[{'*':false}]}}}};i.documents.set(owner.file,owner);i.documents.set(controller.file,controller);
 assert.equal(infer(i,{ownerFile:owner.file,alias:'default'}).rules.length,1);i.documents.set('/RP/duplicate.json',{...controller,file:'/RP/duplicate.json'});assert.equal(infer(i,{ownerFile:owner.file,alias:'default'}).rules.length,0);
});
