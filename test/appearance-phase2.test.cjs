const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),json=require('jsonc-parser');
const {ContentIndex}=require('../src/content.cjs'),preview=require('../src/model-preview.cjs'),{appearance,plan}=require('../src/preview-plan.cjs'),props=require('../src/preview-properties.cjs');
const root=path.join(__dirname,'fixtures/appearance'),provenance=require('./fixtures/appearance/provenance.json');
function fixture(){
 const project={root,packs:{resource:root,behavior:path.join(root,'unused-behavior')},config:{target:'release',targetVersion:'1.26.50'}},index=new ContentIndex(project);let owner;
 for(const [relative,source]of Object.entries(provenance.files)){
  const file=path.join(root,relative);if(source.sourcePath.startsWith('resource_pack/textures/')){index.add('texture',source.sourcePath.slice('resource_pack/'.length).replace(/\.(png|tga)$/,''),file);continue;}
  if(!relative.endsWith('.json')||/^villager(?:\.v1\.0)?\.entity/.test(relative))continue;
  const data=json.parse(fs.readFileSync(file,'utf8')),doc={file,side:'resource',relative:source.sourcePath.slice('resource_pack/'.length),data};index.documents.set(file,doc);
  for(const g of preview.geometries(data))index.add('geometry',g.description.identifier,file);
  if(relative==='villager_v2.entity.json')owner=file;
 }
 return {index,owner};
}
const state={'query.is_baby':false,'query.skin_id':0,'query.variant':1,'query.mark_variant':0,'query.trade_tier':0};
async function resolved(values=state,{reverse=false,readFiles=[]}={}){const {index,owner}=fixture(),models=preview.candidates(index,owner,{propertyValues:new Map([[owner,values]])});if(reverse)models.reverse();return appearance(models,{index,read:async file=>{readFiles.push(file);return fs.promises.readFile(file);}});}
test('shared plan prepares pinned villager geometry, material routing and images for renderer and UI',async()=>{
 const p=await resolved();assert.equal(p.schemaVersion,1);assert.equal(p.context.targetVersion,'1.26.50');assert.equal(p.entity.identifier,'minecraft:villager_v2');assert.equal(p.inputs.find(input=>input.name==='query.trade_tier').origin,'explicit preview override');assert.equal(p.layers.length,3);assert.equal(p.renderPasses.length,3);assert.ok(p.controllers.every(c=>c.status==='resolved'));assert.deepEqual(p.renderPasses.map(p=>p.textureAlias),['base','plains','level_stone']);assert.equal(p.renderPasses[1].secondaryTextureAlias,'farmer');
 assert.ok(p.renderPasses.every(pass=>p.layers.some(layer=>pass.layerId===layer.id)));assert.ok(p.renderPasses.every(pass=>pass.texture.startsWith('data:image/png;base64,')));
 assert.ok(p.controllers[1].expressions.some(e=>e.kind==='material'&&e.status==='resolved'&&e.aliases.includes('masked')));assert.equal(p.layers[1].materialBindings[0]['*'],'Material.masked');assert.ok(p.controllers[1].sources[0].file.endsWith('villager_v3.render_controllers.json'));assert.ok(p.layers[1].textures[1].file.endsWith('farmer.tga'));
});
test('geometry candidate order cannot discard relevant controls or stored preview state',async()=>{
 const p=await resolved({...state,'query.trade_tier':2},{reverse:true});assert.equal(p.values['query.trade_tier'],2);assert.ok(p.controls.some(f=>f.name==='query.trade_tier'));assert.equal(p.renderPasses[2].textureAlias,'level_gold');
 const baby=await resolved({...state,'query.is_baby':true,'query.trade_tier':2},{reverse:true});assert.equal(baby.values['query.trade_tier'],2,'Hidden values survive geometry changes');assert.equal(baby.renderPasses.length,2);assert.equal(baby.renderPasses[0].geometryId,'geometry.villager.baby');assert.ok(!baby.controls.some(f=>f.name==='query.trade_tier'),'All-hidden tier layer does not expose its texture-only input');
});
test('all-hidden passes are inactive before texture reads and retain visibility explanations',async()=>{
 const readFiles=[],p=await resolved({...state,'query.variant':14},{readFiles});assert.equal(p.controllers[2].status,'inactive');assert.equal(p.layers[2].status,'inactive');assert.match(p.layers[2].reason,/All bones hidden/);assert.equal(p.renderPasses.length,2);assert.ok(!readFiles.some(f=>f.includes('level_stone')));assert.equal(p.layers[2].visibility.head,false);
});
test('unknown queries are never defaulted; only supported source-referenced inputs appear',async()=>{
 const p=await resolved({});assert.deepEqual(p.values,{});assert.equal(p.renderPasses.length,0);assert.ok(p.controllers.some(c=>c.status==='ambiguous'||c.status==='unknown'));assert.ok(p.controls.some(f=>f.name==='query.is_baby'&&f.default===undefined));assert.ok(p.controls.every(f=>p.dependencies.includes(f.name)));
 const info=props.appearanceInputs({fields:[]},{references:['query.is_baby','query.trade_tier','query.time_of_day','variable.skin','variable.cyclic']},['v.cyclic=v.cyclic+1;']);assert.deepEqual(info.fields.map(f=>f.name),['query.is_baby','query.trade_tier','variable.skin']);assert.deepEqual({...props.inputs(info.fields,{'query.is_baby':false,'query.trade_tier':-1,'variable.skin':3,'query.time_of_day':2})},{'query.is_baby':false,'variable.skin':3});assert.equal(props.evaluate('v.skin + 2',{'variable.skin':3}).value,5);
});
test('inactive activation and explicit inactive inspection branch have distinct plan outcomes',()=>{
 const model={alias:'default',textures:[{alias:'base',file:'/base.png'}],inference:{active:false,records:[{controller:'disabled',order:0,status:'inactive',activation:{status:'resolved',value:0},expressions:[],sources:[]}],passes:[]}};assert.equal(plan([model]).outcomes[0].status,'inactive');model.inference.active=true;model.inference.records[0].status='unknown';model.inference.passes=[{controller:'disabled',order:0,conditional:true,selections:[['base']]}];const p=plan([model],{choices:{disabled:'@inactive'}});assert.equal(p.outcomes[0].status,'inactive');assert.equal(p.passes.length,0);assert.equal(p.outcomes[0].override.origin,'controller branch inspection');
});

test('material composition rejects excessive PNG dimensions before decoding pixels',()=>{const {decode}=require('../src/preview-composite.cjs'),bytes=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(bytes);bytes.writeUInt32BE(100000,16);bytes.writeUInt32BE(100000,20);assert.throws(()=>decode(bytes,'oversized.png'),/dimensions limit/);});

test('shared plan retains existing declared-subpack controller precedence',async()=>{
 const {index,owner}=fixture(),base=[...index.documents.values()].find(d=>d.relative==='render_controllers/villager_v3.render_controllers.json');
 index.documents.set('/RP/manifest.json',{file:'/RP/manifest.json',side:'resource',relative:'manifest.json',data:{subpacks:[{folder_name:'high'}]}});
 const high={...base,file:'/RP/subpacks/high/render_controllers/villager_v3.render_controllers.json',relative:'subpacks/high/render_controllers/villager_v3.render_controllers.json',data:structuredClone(base.data)};high.data.render_controllers['controller.render.villager_v3_base'].textures=['Texture.desert'];index.documents.set(high.file,high);index.project.config.authoring={resourceSubpack:'high'};
 let p=await appearance(preview.candidates(index,owner,{propertyValues:new Map([[owner,state]])}),{index,read:fs.promises.readFile});assert.equal(p.renderPasses[0].textureAlias,'desert');assert.equal(p.context.resourceSubpack,'high');
 index.project.config.authoring={resourceSubpack:''};p=await appearance(preview.candidates(index,owner,{propertyValues:new Map([[owner,state]])}),{index,read:fs.promises.readFile});assert.equal(p.renderPasses[0].textureAlias,'base');
});
