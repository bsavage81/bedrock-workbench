// Preview-only asset access: project overrides > explicitly selected packs >
// target-compatible, pinned Mojang samples. Never scan an unselected game path.
const fs=require('node:fs/promises'),path=require('node:path'),json=require('jsonc-parser');
const core=require('./core.cjs'),{compareVersions}=require('./releases.cjs');
const LIMIT=16*1024*1024;
function compatible(reference,target){const engine=require('./reference.cjs').engine(reference?.tag);return !!engine&&reference.engine===engine&&compareVersions(engine,target)<=0;}
function ids(data){return Array.isArray(data?.['minecraft:geometry'])?data['minecraft:geometry'].map(g=>g.description?.identifier):Object.keys(data||{}).filter(k=>k.startsWith('geometry.'));}
function texturePath(value){
 if(typeof value!=='string'||value.length>512||!/^textures\/[a-zA-Z0-9_./ -]+$/.test(value)||value.split('/').some(s=>!s||s==='.'||s==='..'))return;
 return value.replace(/\.(png|tga|jpe?g)$/i,'');
}
async function contained(root,file,limit=LIMIT){
 const real=await fs.realpath(file),base=await fs.realpath(root);if(!core.inside(base,real))throw Error('Vanilla preview asset escapes its approved source.');
 const stat=await fs.stat(real);if(!stat.isFile()||stat.size>limit)throw Error('Vanilla preview asset exceeds the size limit.');return {real,bytes:await fs.readFile(real)};
}
async function selectedPacks(project){
 const source=project.vanillaSource;if(!source)return [];
 if(!path.isAbsolute(source.folder)||!/^\d+\.\d+\.\d+$/.test(source.version))throw Error('Invalid selected vanilla source.');
 if(compareVersions(source.version,project.config.targetVersion)>0)throw Error(`Selected vanilla ${source.version} is newer than project target ${project.config.targetVersion}.`);
 const root=await fs.realpath(source.folder),packs=[];
 async function add(folder){try{const stat=await fs.lstat(folder);if(!stat.isDirectory()||stat.isSymbolicLink())return;const real=await fs.realpath(folder);if(core.inside(root,real)&&!packs.includes(real))packs.push(real);}catch(e){if(!['ENOENT','ENOTDIR'].includes(e.code))throw e;}}
 for(const base of ['', 'data','Content','Content/data']){
  await add(path.join(root,base,'resource_pack'));
  const directory=path.join(root,base,'resource_packs'),stat=await fs.lstat(directory).catch(()=>null);
  if(stat?.isDirectory()&&!stat.isSymbolicLink()&&core.inside(root,await fs.realpath(directory)))for(const entry of await fs.readdir(directory,{withFileTypes:true}))if(entry.isDirectory()&&/^vanilla(?:[_-].*)?$/i.test(entry.name))await add(path.join(directory,entry.name));
 }
 if(!packs.length&&(await core.exists(path.join(root,'models'))||await core.exists(path.join(root,'textures'))))await add(root);
 return packs;
}
function register(index,type,id,file,asset){index.previewAssets.set(file,asset);index.add(type,id,file);}
async function supplement(index,{fetchImpl=globalThis.fetch,loadReference=require('./reference.cjs').loadReference,file}={}){
 const project=index.project;index.previewAssets=new Map();index.previewWarnings=[];
 // A texture override can use the vanilla owner even when the pack has no
 // copied client entity. Never replace a project-owned client identifier.
 const selectedTextures=[...index.values('texture')].filter(([,files])=>files.includes(file)).map(([id])=>id);
 if(selectedTextures.length&&!require('./model-preview.cjs').bindings(index).some(b=>b.textures.some(t=>selectedTextures.includes(texturePath(t.id)))))try{
  let reference=index.reference;if(!Array.isArray(reference?.previewOwners))reference=await loadReference(project.root,project.config.targetVersion,{includePreviewGeometry:true,fetchImpl,channel:project.config.target});
  if(!compatible(reference,project.config.targetVersion))throw Error('No compatible vanilla owner reference.');
  index.reference=reference;
  const owned=new Set([...index.documents.values()].flatMap(d=>['minecraft:client_entity','minecraft:attachable'].map(root=>d.data?.[root]?.description?.identifier)).filter(Boolean));
  for(const doc of reference.previewOwners||[]){
   const desc=(doc.data?.['minecraft:client_entity']||doc.data?.['minecraft:attachable'])?.description;
   if(!desc||owned.has(desc.identifier)||!Object.values(typeof desc.textures==='string'?{default:desc.textures}:desc.textures||{}).some(t=>selectedTextures.includes(texturePath(t))))continue;
   if(!/^(entity|attachables)\/[a-zA-Z0-9_./ -]+\.json$/.test(doc.relative)||doc.relative.split('/').some(s=>s==='..'||s==='.'||!s))continue;
   const cache=await core.local(project.root,'.bedrock/reference/preview-assets/'+reference.tag),ownerFile=await core.local(project.root,path.relative(project.root,path.join(cache,doc.relative)));await core.writeJson(ownerFile,doc.data);
   index.documents.set(ownerFile,{file:ownerFile,side:'resource',relative:doc.relative,data:doc.data,previewSource:true,previewLabel:`Mojang samples ${reference.tag}: ${doc.relative}`});
  }
 }catch(e){index.previewWarnings.push(`Vanilla texture ownership: ${e.message}`);}
 const bindings=require('./model-preview.cjs').bindings(index),missing=new Set(bindings.map(b=>b.id).filter(id=>typeof id==='string'&&!index.values('geometry').has(id)));
 const controllerIds=new Set([...index.documents.values()].flatMap(d=>{
  const desc=(d.data?.['minecraft:client_entity']||d.data?.['minecraft:attachable'])?.description;
  const refs=desc?.render_controllers;return (typeof refs==='string'?[refs]:Array.isArray(refs)?refs:[]).flatMap(r=>typeof r==='string'?[r]:Object.keys(r||{}));
 }));
 const definedControllers=()=>new Set([...index.documents.values()].flatMap(d=>Object.keys(d.data?.render_controllers||{}).map(id=>id.toLowerCase())));
 const projectControllers=definedControllers();
 const needsControllers=()=>[...controllerIds].some(id=>!definedControllers().has(id.toLowerCase()));
 const textureIds=[...new Set(bindings.flatMap(b=>b.textures.map(t=>texturePath(t.id))).filter(Boolean))].filter(id=>!index.values('texture').has(id));
 // Capture project ownership before adding fallbacks; duplicates within a source
 // remain choices rather than inheriting filesystem enumeration order.
 const projectIds=new Set(index.values('geometry').keys()),projectTextures=new Set(index.values('texture').keys());let packs=[];
 try{packs=await selectedPacks(project);}catch(e){index.previewWarnings.push(e.message);}
 let entries=0,bytes=0;
 async function walk(root,folder){
  const stat=await fs.lstat(folder).catch(()=>null);if(!stat?.isDirectory()||stat.isSymbolicLink())return;
  for(const entry of await fs.readdir(folder,{withFileTypes:true})){
   if(++entries>100000)throw Error('Selected vanilla model inventory exceeds the entry limit.');
   if(entry.isSymbolicLink())continue;const file=path.join(folder,entry.name);
   if(entry.isDirectory()){await walk(root,file);continue;}
   if(!entry.isFile()||!entry.name.endsWith('.json'))continue;
   const resource=await contained(root,file,8*1024*1024);bytes+=resource.bytes.length;if(bytes>128*1024*1024)throw Error('Selected vanilla model inventory exceeds the size limit.');
   const errors=[],data=json.parse(resource.bytes.toString('utf8').replace(/^\uFEFF/,''),errors,{allowTrailingComma:true});if(errors.length)continue;
   if(data?.render_controllers){const kept=Object.fromEntries(Object.entries(data.render_controllers).filter(([id])=>[...controllerIds].some(w=>w.toLowerCase()===id.toLowerCase())&&!projectControllers.has(id.toLowerCase())));if(Object.keys(kept).length)index.documents.set(file,{file,side:'resource',relative:path.relative(root,file).replaceAll(path.sep,'/'),data:{render_controllers:kept},previewSource:true});}
   for(const id of ids(data))if(missing.has(id)&&!projectIds.has(id)){
    register(index,'geometry',id,file,{root,real:resource.real,label:`Selected vanilla ${project.vanillaSource.version}: ${path.relative(root,file)}`});
    index.documents.set(file,{file,side:'resource',relative:path.relative(root,file).replaceAll(path.sep,'/'),data,previewSource:true});
   }
  }
 }
 for(const root of packs)try{if(missing.size)await walk(root,path.join(root,'models'));if(controllerIds.size)await walk(root,path.join(root,'render_controllers'));}catch(e){index.previewWarnings.push(e.message);}
 for(const id of textureIds)if(!projectTextures.has(id))for(const root of packs)for(const ext of ['.png','.jpg','.jpeg','.tga']){
  const file=path.join(root,id+ext);try{const asset=await contained(root,file);register(index,'texture',id,file,{root,real:asset.real,label:`Selected vanilla ${project.vanillaSource.version}: ${path.relative(root,file)}`});}catch(e){if(!['ENOENT','ENOTDIR'].includes(e.code))index.previewWarnings.push(e.message);}
 }
 const unresolved=[...missing].filter(id=>!index.values('geometry').has(id));
 const absentTextures=textureIds.filter(id=>!index.values('texture').has(id));if(!unresolved.length&&!absentTextures.length&&!needsControllers())return index;
 let reference=index.reference;
 try{
  if(!reference?.tag||unresolved.length&&!Array.isArray(reference.previewGeometry)||needsControllers()&&!Array.isArray(reference.previewControllers))reference=await loadReference(project.root,project.config.targetVersion,{includePreviewGeometry:true,fetchImpl,channel:project.config.target});
  const tag=reference?.tag;if(!compatible(reference,project.config.targetVersion))throw Error('No compatible pinned Mojang samples are available for this target.');
  const cache=await core.local(project.root,'.bedrock/reference/preview-assets/'+tag);
  const existingControllers=definedControllers();
  for(const doc of reference.previewControllers||[]){
   if(!/^render_controllers\/[a-zA-Z0-9_./ -]+\.json$/.test(doc.relative)||doc.relative.split('/').some(s=>s==='..'||s==='.'||!s))continue;
   const kept=Object.fromEntries(Object.entries(doc.data?.render_controllers||{}).filter(([id])=>[...controllerIds].some(w=>w.toLowerCase()===id.toLowerCase())&&!existingControllers.has(id.toLowerCase())));
   if(Object.keys(kept).length){const file=path.join(cache,doc.relative);index.documents.set(file,{file,side:'resource',relative:doc.relative,data:{render_controllers:kept},previewSource:true});}
  }
  for(const doc of reference.previewGeometry||[]){
   if(!/^models\/[a-zA-Z0-9_./ -]+\.json$/.test(doc.relative)||doc.relative.split('/').some(s=>s==='..'||s==='.'||!s))continue;
   const needed=ids(doc.data).filter(id=>unresolved.includes(id));if(!needed.length)continue;
   const file=await core.local(project.root,path.relative(project.root,path.join(cache,doc.relative)));await core.writeJson(file,doc.data);
   const asset=await contained(cache,file);index.documents.set(file,{file,side:'resource',relative:doc.relative,data:doc.data,previewSource:true});
   for(const id of needed)register(index,'geometry',id,file,{root:cache,real:asset.real,label:`Mojang samples ${tag}: ${doc.relative}`});
  }
  const knownTextures=new Set([...(reference.vanilla?.texture||[]),...(reference.vanillaReferences?.texture||[]),...(reference.previewOwners||[]).flatMap(doc=>{const desc=(doc.data?.['minecraft:client_entity']||doc.data?.['minecraft:attachable'])?.description;return Object.values(typeof desc?.textures==='string'?{default:desc.textures}:desc?.textures||{});})].map(texturePath).filter(Boolean));
  for(const id of absentTextures)if(knownTextures.has(id)){const file=path.join(cache,id+'.png');register(index,'texture',id,file,{root:cache,tag,id,label:`Mojang samples ${tag}: ${id}.png`,fetchImpl});}
  if(unresolved.some(id=>!index.values('geometry').has(id)))index.previewWarnings.push('Some geometry is absent from the compatible vanilla reference. Refresh Mojang Reference Data or select a compatible vanilla pack.');
 }catch(e){index.previewWarnings.push(`Vanilla preview reference: ${e.message}`);}
 return index;
}
async function read(index,file){
 const asset=index.previewAssets?.get(file);if(!asset)throw Error('Preview resource is not in the approved vanilla inventory.');
 if(asset.tag){
  await core.local(index.project.root,path.relative(index.project.root,file));
  // Read cached images offline. A missing image is fetched only after selection,
  // from the exact same released tag as the geometry reference.
  try{return (await contained(asset.root,file)).bytes;}catch(e){if(e.code!=='ENOENT')throw e;}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
   const url=`https://raw.githubusercontent.com/Mojang/bedrock-samples/${asset.tag}/resource_pack/${asset.id}.png`;
   const response=await asset.fetchImpl(url,{signal:controller.signal,headers:{'User-Agent':'Bedrock-Workbench'}});if(!response.ok)throw Error(`Vanilla texture ${asset.id} returned HTTP ${response.status}.`);
   if(Number(response.headers.get('content-length'))>LIMIT)throw Error('Vanilla texture exceeds the size limit.');
   const chunks=[];let length=0;for await(const chunk of response.body){length+=chunk.length;if(length>LIMIT)throw Error('Vanilla texture exceeds the size limit.');chunks.push(chunk);}const data=Buffer.concat(chunks);
   if(!data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Vanilla texture response is not a PNG image.');
   await core.local(index.project.root,path.relative(index.project.root,file));await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,data);return (await contained(asset.root,file)).bytes;
  }finally{clearTimeout(timer);}
 }
 const resource=await contained(asset.root,file);if(resource.real!==asset.real)throw Error('Vanilla preview asset changed location.');return resource.bytes;
}
module.exports={supplement,read,selectedPacks,texturePath};
