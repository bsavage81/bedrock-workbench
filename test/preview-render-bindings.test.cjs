const test=require('node:test'),assert=require('node:assert/strict');
const {infer,resolver}=require('../src/preview-render-bindings.cjs'),preview=require('../src/model-preview.cjs');
function fixture(controller,overrides={}){
 const desc={identifier:'test:fish',geometry:{egg:'geometry.egg',fry:'geometry.fry',default:'geometry.adult'},textures:{default:'textures/adult',egg:'textures/egg',fry:'textures/fry',river:'textures/river'},render_controllers:['controller.render.fish'],...overrides};
 const owner={file:'/RP/entity/fish.json',relative:'entity/fish.json',side:'resource',data:{'minecraft:client_entity':{description:desc}}};
 const doc={file:'/RP/render_controllers/fish.json',relative:'render_controllers/fish.json',side:'resource',data:{render_controllers:{'controller.render.fish':controller}}};
 const index={documents:new Map([[owner.file,owner],[doc.file,doc]])};return {index,desc,owner,binding:alias=>({ownerFile:owner.file,alias})};
}
test('correlates paired life-stage arrays and chooses the inferred texture before declared default',()=>{
 const selector="(q.property('stage') == 'egg' ? 0 : (q.property('stage') == 'fry' ? 1 : 2))";
 const f=fixture({arrays:{geometries:{'Array.geo':['Geometry.egg','Geometry.fry','Geometry.default']},textures:{'Array.skin':['Texture.egg','Texture.fry','Texture.default']}},geometry:`Array.geo[${selector}]`,textures:[`Array.skin[${selector}]`]});
 for(const alias of ['egg','fry','default']){const result=infer(f.index,f.binding(alias));assert.equal(result.complete,true);assert.deepEqual(result.aliases,[alias]);const textures=Object.entries(f.desc.textures).map(([alias,id])=>({alias,id,file:id+'.png'}));assert.equal(textures[preview.defaultTexture({textures,inference:result})].alias,alias);assert.equal(preview.defaultTexture({textures,inference:result},'textures/river.png'),3);}
});
test('correlates conditional index branches with texture ternaries; adult skins remain ambiguous',()=>{
 const f=fixture({arrays:{geometries:{'array.geo':['geometry.egg','geometry.fry','geometry.default']},textures:{'array.skins':['texture.default','texture.river']}},geometry:"array.geo[(q.property('stage') == 'egg' ? 0 : (q.property('stage') == 'fry' ? 1 : 2))]",textures:["q.property('stage') == 'egg' ? texture.egg : (q.property('stage') == 'fry' ? texture.fry : array.skins[q.variant])"]});
 assert.deepEqual(infer(f.index,f.binding('egg')).aliases,['egg']);assert.deepEqual(infer(f.index,f.binding('fry')).aliases,['fry']);assert.deepEqual(infer(f.index,f.binding('default')).aliases,['default','river']);assert.match(infer(f.index,f.binding('default')).message,/Runtime variant/);
});
test('canonical shared array selectors correlate slots; independent selectors do not',()=>{
 const c={arrays:{geometries:{'array.geo':['geometry.egg','geometry.default']},textures:{'array.skin':['texture.egg','texture.default']}},geometry:'array.geo[v.index]',textures:['array.skin[variable.index]']};let f=fixture(c);assert.deepEqual(infer(f.index,f.binding('egg')).aliases,['egg']);c.textures=['array.skin[q.variant]'];f=fixture(c);assert.deepEqual(infer(f.index,f.binding('egg')).aliases,['egg','default']);
 c.geometry='array.geo[math.random(0,1)]';c.textures=['array.skin[math.random(0,1)]'];f=fixture(c);assert.deepEqual(infer(f.index,f.binding('egg')).aliases,['egg','default']);
});
test('arrays flatten nested arrays, wrap positive indices and clamp negative indices',()=>{
 const desc={geometry:{default:'g'},textures:{egg:'e',default:'d'}};
 const c={arrays:{textures:{'array.nested':['texture.egg','texture.default'],'array.outer':['array.nested','texture.egg']}}};
 for(const [n,alias]of [[-2,'egg'],[4.9,'default'],[2,'egg']]){const r=resolver(c,desc);assert.deepEqual(r.expression(`array.outer[${n}]`,'texture').map(t=>t.alias),[alias]);assert.equal(r.complete,true);}
 c.arrays.textures['array.outer']=['array.outer'];const r=resolver(c,desc);assert.deepEqual(r.expression('array.outer[0]','texture'),[]);assert.equal(r.complete,false);
});
test('missing, duplicate and partially unsupported bindings never produce a conclusive recommendation',()=>{
 const f=fixture({geometry:'geometry.egg',textures:['q.is_baby ? texture.egg : texture.missing']});let result=infer(f.index,f.binding('egg'));assert.equal(result.complete,false);assert.match(result.message,/missing, ambiguous or unsupported/);
 const textures=[{alias:'default'},{alias:'egg'}];assert.equal(preview.defaultTexture({textures,inference:result}),0);
 const controller=[...f.index.documents.values()][1];f.index.documents.set('/RP/other.json',{...controller,file:'/RP/other.json'});assert.equal(infer(f.index,f.binding('egg')).complete,false);f.index.documents.clear();assert.equal(infer(f.index,f.binding('egg')),undefined);
});
test('layers and conditional controller activation are explicit; aliases stay owner scoped',()=>{
 let f=fixture({geometry:'GEOMETRY.EGG',textures:['Texture.EGG','texture.default']},{render_controllers:[{'controller.render.fish':'q.is_baby'}]});let r=infer(f.index,f.binding('egg'));assert.equal(r.complete,false);assert.match(r.message,/layers/);assert.match(r.message,/activation/);
 f=fixture({geometry:'geometry.egg',textures:['texture.egg']},{textures:{default:'texture/other-owner'}});assert.equal(infer(f.index,f.binding('egg')).complete,false);
});
