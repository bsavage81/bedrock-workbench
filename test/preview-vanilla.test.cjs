const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {ContentIndex}=require('../src/content.cjs'),preview=require('../src/model-preview.cjs'),vanilla=require('../src/preview-vanilla.cjs');
const {PNG}=require('pngjs');
test('compatible vanilla controller payloads fill missing definitions while project overrides win',async t=>{
 const i=await fixture(t),owner=i.documents.get(path.join(i.project.packs.resource,'cod.json'));
 owner.data['minecraft:client_entity'].description.render_controllers=['controller.render.cod'];
 i.reference.previewControllers=[{relative:'render_controllers/cod.json',data:{render_controllers:{'controller.render.cod':{geometry:'geometry.default',textures:['texture.default']}}}}];
 await vanilla.supplement(i);let m=preview.candidates(i,owner.file)[0];assert.equal(m.inference.complete,true);assert.deepEqual(m.inference.aliases,['default']);
 const projectFile=path.join(i.project.packs.resource,'render_controllers/custom.json');i.documents.set(projectFile,{file:projectFile,side:'resource',relative:'render_controllers/custom.json',data:{render_controllers:{'controller.render.cod':{geometry:'geometry.default',textures:['texture.absent']}}}});
 // Simulate a fresh saved scan, which excludes previously supplemented payloads.
 for(const [file,d]of i.documents)if(d.previewSource)i.documents.delete(file);
 await vanilla.supplement(i);m=preview.candidates(i,owner.file)[0];assert.equal(m.inference.complete,false);assert.deepEqual(m.inference.aliases,[]);
});
function legacy(id){return {format_version:'1.8.0',[id]:{texturewidth:32,textureheight:32,bones:[{name:'body',cubes:[{origin:[-1,0,0],size:[2,4,7],uv:[0,0]}]}]}};}
async function fixture(t){const base=path.resolve('.test-temp');await fs.mkdir(base,{recursive:true});const root=await fs.mkdtemp(path.join(base,'preview-vanilla-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));for(const dir of ['BP','RP'])await fs.mkdir(path.join(root,dir));const index=new ContentIndex({root,packs:{behavior:path.join(root,'BP'),resource:path.join(root,'RP')},config:{target:'release',targetVersion:'1.26.50'}});index.reference={tag:'v1.26.50.4',engine:'1.26.50',vanilla:{texture:['textures/entity/fish/cod','textures/entity/fish/salmon']},previewGeometry:['cod','salmon'].map(name=>({relative:`models/entity/${name}.geo.json`,data:legacy('geometry.'+name)}))};for(const name of ['cod','salmon']){const file=path.join(root,'RP',name+'.json');index.documents.set(file,{file,side:'resource',data:{'minecraft:client_entity':{description:{identifier:'minecraft:'+name,geometry:{default:'geometry.'+name},textures:{default:'textures/entity/fish/'+name}}}}});}return index;}
test('compatible samples resolve vanilla cod/salmon for owners and reverse texture previews',async t=>{
 const i=await fixture(t);const fishTexture=path.join(i.project.packs.resource,'salmon.png');i.add('texture','textures/entity/fish/salmon',fishTexture);
 await vanilla.supplement(i,{fetchImpl:()=>{throw Error('offline');}});
 const cod=preview.candidates(i,path.join(i.project.packs.resource,'cod.json'));assert.equal(cod.length,1);assert.equal(cod[0].id,'geometry.cod');assert.match(i.previewAssets.get(cod[0].geometryFile).label,/v1.26.50.4/);
 assert.equal(require('../src/preview-geometry.cjs').convert(preview.geometries(i.documents.get(cod[0].geometryFile).data)[0]).faces.length,6);
 assert.equal(preview.candidates(i,fishTexture)[0].id,'geometry.salmon');
 assert.ok((await vanilla.read(i,cod[0].geometryFile)).length>0,'Cached vanilla geometry is readable offline');
});
test('project geometry and textures override vanilla without downloading assets',async t=>{
 const i=await fixture(t);for(const name of ['cod','salmon']){const file=path.join(i.project.packs.resource,name+'.geo.json');i.add('geometry','geometry.'+name,file);i.documents.set(file,{file,data:legacy('geometry.'+name)});i.add('texture','textures/entity/fish/'+name,path.join(i.project.packs.resource,name+'.png'));}
 let loaded=false;await vanilla.supplement(i,{loadReference:()=>{loaded=true;throw Error('should not download');}});assert.equal(loaded,false);assert.equal(i.previewAssets.size,0);assert.ok(preview.candidates(i,path.join(i.project.packs.resource,'cod.json'))[0].geometryFile.endsWith('RP'+path.sep+'cod.geo.json'));
});
test('selected installed packs supply models/textures and preserve multiple candidates',async t=>{
 const i=await fixture(t),selected=path.join(i.project.root,'selected');i.project.vanillaSource={folder:selected,version:'1.26.50'};
 for(const name of ['vanilla','vanilla_extra']){const root=path.join(selected,'resource_packs',name);await fs.mkdir(path.join(root,'models'),{recursive:true});await fs.mkdir(path.join(root,'textures/entity/fish'),{recursive:true});await fs.writeFile(path.join(root,'models/cod.json'),JSON.stringify(legacy('geometry.cod')));await fs.writeFile(path.join(root,'textures/entity/fish/cod.png'),'png');}
 await vanilla.supplement(i);const choices=preview.candidates(i,path.join(i.project.packs.resource,'cod.json'));assert.equal(choices.length,2);assert.equal(choices[0].textures.length,2);assert.match(i.previewAssets.get(choices[0].geometryFile).label,/Selected vanilla/);
 assert.ok((await vanilla.read(i,choices[0].geometryFile)).length);
});
test('selected-source and sample versions cannot exceed the target; missing references stay explicit',async t=>{
 const i=await fixture(t);i.project.vanillaSource={folder:i.project.root,version:'1.26.60'};i.reference.engine='1.26.60';await vanilla.supplement(i);assert.equal(i.values('geometry').size,0);assert.ok(i.previewWarnings.some(w=>w.includes('newer')));assert.ok(i.previewWarnings.some(w=>w.includes('compatible')));
});
test('sample tag and engine must agree before any preview asset is accepted',async t=>{
 const i=await fixture(t);i.reference.tag='v1.26.60.4';await vanilla.supplement(i);assert.equal(i.previewAssets.size,0);assert.match(i.previewWarnings.join(' '),/compatible pinned/);
});
test('pinned vanilla PNG downloads occur only after selection, then work offline',async t=>{
 const i=await fixture(t),png=new PNG({width:2,height:2});png.data.fill(255);const bytes=PNG.sync.write(png);let calls=0;
 await vanilla.supplement(i,{fetchImpl:async url=>{calls++;assert.equal(url,'https://raw.githubusercontent.com/Mojang/bedrock-samples/v1.26.50.4/resource_pack/textures/entity/fish/cod.png');return {ok:true,headers:{get:()=>null},body:[bytes]};}});assert.equal(calls,0);
 const file=i.values('texture').get('textures/entity/fish/cod')[0];assert.deepEqual(await vanilla.read(i,file),bytes);assert.deepEqual(await vanilla.read(i,file),bytes);assert.equal(calls,1);
});
test('texture requests reject traversal, oversized downloads and non-image responses',async t=>{
 for(const value of ['textures/../secret','textures/%2e%2e/secret','C:/secret','textures/a\\b','textures//a'])assert.equal(vanilla.texturePath(value),undefined);
 const i=await fixture(t);await vanilla.supplement(i,{fetchImpl:async()=>({ok:true,headers:{get:()=>String(20*1024*1024)},body:[]})});const file=i.values('texture').get('textures/entity/fish/cod')[0];await assert.rejects(vanilla.read(i,file),/size limit/);
 i.previewAssets.get(file).fetchImpl=async()=>({ok:true,headers:{get:()=>null},body:[Buffer.from('<script>')]});await assert.rejects(vanilla.read(i,file),/not a PNG/);
 await assert.rejects(vanilla.read(i,path.join(i.project.root,'secret')),/approved/);
});
test('missing custom texture paths are not guessed or sent to the samples server',async t=>{
 const i=await fixture(t);i.documents.get(path.join(i.project.packs.resource,'cod.json')).data['minecraft:client_entity'].description.textures.default='textures/private_custom_skin';let calls=0;await vanilla.supplement(i,{fetchImpl:()=>{calls++;throw Error('unexpected fetch');}});assert.equal(i.values('texture').has('textures/private_custom_skin'),false);assert.equal(calls,0);
});
test('an old ID-only reference cache is enriched on demand, with offline failure explained',async t=>{
 const i=await fixture(t),reference=i.reference;delete i.reference;let requested;
 await vanilla.supplement(i,{loadReference:async(root,target,options)=>{requested=options;return reference;}});assert.equal(requested.includePreviewGeometry,true);assert.equal(i.values('geometry').size,2);
 const offline=await fixture(t);delete offline.reference;await vanilla.supplement(offline,{loadReference:async()=>{throw Error('offline');}});assert.match(offline.previewWarnings.join(' '),/offline/);
});
test('a vanilla texture override resolves a sample owner without a copied client entity',async t=>{
 const i=await fixture(t),owner=i.documents.get(path.join(i.project.packs.resource,'cod.json'));
 i.documents.clear();i.reference.previewOwners=[{relative:'entity/cod.entity.json',data:owner.data}];
 const file=path.join(i.project.packs.resource,'cod.png');i.add('texture','textures/entity/fish/cod',file);
 await vanilla.supplement(i,{file});const [candidate]=preview.candidates(i,file);assert.equal(candidate.id,'geometry.cod');assert.match(candidate.warning,/Owner source: Mojang/);
});
test('a project owner takes priority over a vanilla owner even if it changes that texture binding',async t=>{
 const i=await fixture(t),file=path.join(i.project.packs.resource,'cod.png');
 const owner=i.documents.get(path.join(i.project.packs.resource,'cod.json'));i.reference.previewOwners=[{relative:'entity/cod.entity.json',data:structuredClone(owner.data)}];owner.data['minecraft:client_entity'].description.textures.default='textures/project_cod';i.add('texture','textures/entity/fish/cod',file);
 await vanilla.supplement(i,{file});assert.equal(preview.candidates(i,file).length,0);assert.ok(![...i.documents.values()].some(d=>d.previewLabel));
});
