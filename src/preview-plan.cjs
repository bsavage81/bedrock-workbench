// Controller passes retain declaration order. Duplicate bindings stay unresolved.
const props=require('./preview-properties.cjs');
function plan(models,{choices={}}={}){
 const passes=[],warnings=[],references=new Set(),groups=new Map(),variants=[];
 for(const model of models){for(const name of model.inference?.references||[])references.add(name);if(model.inference?.active!==true)continue;
  for(const p of model.inference.passes||[]){
   if(p.complete===false){warnings.push(`${p.controller}: unsupported branches prevent a conclusive pass.`);continue;}
   if(p.selections.length>2){warnings.push(`${p.controller}: more than two texture samplers are unsupported.`);continue;}
   if(p.selections.length===2&&p.selections[1].length!==1){warnings.push(`${p.controller}: second sampler is unresolved.`);continue;}
   const secondary=p.selections.length===2?model.textures.filter(t=>t.alias===p.selections[1][0]):[];
   if(p.selections.length===2&&(secondary.length!==1||!secondary[0].file)){warnings.push(`${p.controller}: second sampler asset is missing or ambiguous.`);continue;}
   if(!p.selections[0].length){warnings.push(`${p.controller}: texture alias is unresolved.`);continue;}
   for(const alias of p.selections[0]){const textures=model.textures.filter(t=>t.alias===alias);if(textures.length!==1||!textures[0].file){warnings.push(`${p.controller}: texture asset is missing or ambiguous.`);continue;}
    const options=groups.get(p.controller)||[];if(options.length<256)options.push({model,...p,texture:textures[0],secondary:secondary[0],key:JSON.stringify([model.alias,alias])});else warnings.push(`${p.controller}: candidate limit exceeded.`);groups.set(p.controller,options);
   }
  }
 }
 for(const [controller,options]of groups){const unique=options.filter(p=>options.filter(q=>q.key===p.key).length===1);if(unique.length!==options.length)warnings.push(`${controller}: geometry asset is ambiguous.`);
  const conditional=unique.some(p=>p.conditional);
  if(unique.length===1&&!conditional)passes.push(unique[0]);else if(unique.length){variants.push({controller,selected:choices[controller],options:[...(conditional?[{key:'@inactive',label:'Inactive (runtime condition false)'}]:[]),...unique.map(p=>({key:p.key,label:`${p.model.alias} · ${p.texture.alias}`}))]});const selected=unique.find(p=>p.key===choices[controller]);if(selected)passes.push(selected);else if(!(conditional&&choices[controller]==='@inactive'))warnings.push(`${controller}: resource selection is unresolved; choose a reachable controller variant.`);}
 }
 const unique=passes;
 unique.sort((a,b)=>a.order-b.order);
 const rendered=unique.slice(0,32),records=models.flatMap(m=>m.inference?.records||[]),controllers=[...new Set([...records.map(r=>r.controller),...models.flatMap(m=>m.inference?.passes?.map(p=>p.controller)||[])])];
 const outcomes=controllers.map(controller=>{
  const pass=rendered.find(p=>p.controller===controller),variant=variants.find(v=>v.controller===controller),entries=records.filter(r=>r.controller===controller),first=entries[0];
  const inactive=entries.length&&entries.every(r=>r.status==='inactive')||variant?.options.some(o=>o.key==='@inactive')&&choices[controller]==='@inactive';
  const expressions=[...new Map(entries.flatMap(r=>r.expressions).map(e=>[JSON.stringify(e),e])).values()];
  return {controller,order:first?.order??pass?.order,status:inactive?'inactive':pass?'resolved':variant||entries.some(r=>r.status==='ambiguous')?'ambiguous':'unknown',activation:first?.activation,expressions,sources:first?.sources||[],reason:first?.reason,override:choices[controller]?{origin:'controller branch inspection',value:choices[controller]}:undefined,...(pass?{geometry:pass.model.id,textures:[pass.texture,pass.secondary].filter(Boolean),source:{ownerFile:pass.model.ownerFile,geometryFile:pass.model.geometryFile},manual:choices[controller]===pass.key}:{}),...(variant?{alternatives:variant.options}:{}),warnings:warnings.filter(w=>w.startsWith(controller+':'))};
 }).sort((a,b)=>(a.order??0)-(b.order??0));
 return {passes:rendered,variants,outcomes,warnings:[...new Set(warnings),...(unique.length>32?['Controller pass limit exceeded.']:[])],references};
}
function visibilityReferences(geometry,rules,values){const found=new Set();for(const rule of rules)for(const [pattern,value]of Object.entries(rule)){const regex=new RegExp('^'+pattern.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*')+'$','i');if(typeof value==='string'&&(geometry.bones||[]).some(b=>regex.test(b.name)))for(const name of props.referenced(value,values))found.add(name);}return found;}
module.exports={plan,visibilityReferences};
// Resolve all renderer-facing state here. The webview consumes this same plan;
// it never evaluates controller expressions or looks resources up independently.
async function appearance(models,{index,read,materialDefinitions={},choices={}}={}){
 const selected=plan(models,{choices}),anchor=models[0],warnings=[...selected.warnings,...(index.previewWarnings||[]),...models.map(m=>m.properties?.warning).filter(Boolean)],renderPasses=[],layers=[];
 const cache=new Map();let totalBytes=0;
 async function asset(file){if(cache.has(file))return cache.get(file);if(cache.size>=128)throw Error('Appearance asset traversal limit exceeded.');const bytes=await read(file);totalBytes+=bytes.length;if(bytes.length>16*1024*1024||totalBytes>128*1024*1024)throw Error('Appearance asset byte budget exceeded.');cache.set(file,bytes);return bytes;}
 const source=file=>({file,label:index.previewAssets?.get(file)?.label||index.documents.get(file)?.previewLabel||index.documents.get(file)?.relative||(file&&index.project?.root?require('node:path').relative(index.project.root,file):file)});
 const controllers=selected.outcomes;
 for(const pass of selected.passes){
  const model=pass.model,record=controllers.find(c=>c.controller===pass.controller),id=JSON.stringify([model.ownerFile,pass.controller,model.alias,model.geometryFile]);
  const layer={id,controller:pass.controller,order:pass.order,status:'resolved',geometryId:model.id,geometryAlias:model.alias,textures:[pass.texture,pass.secondary].filter(Boolean).map(t=>({...t,source:source(t.file)})),sources:{owner:source(model.ownerFile),geometry:source(model.geometryFile)},override:record?.override,warnings:[]};layers.push(layer);
  try{
   await asset(model.geometryFile);
   const geometry=require('./model-preview.cjs').geometries(index.documents.get(model.geometryFile)?.data).find(g=>g.description?.identifier===model.id);
   if(!geometry)throw Error('Selected geometry definition is missing.');
   const visibility=props.visible(geometry,pass.rules||[],model.values||{});
   const materials=require('./preview-materials.cjs').resolve(geometry,pass.materials,pass.materialAliases,materialDefinitions);
   layer.visibility=visibility.visibility;layer.materialBindings=pass.materials;layer.materialAliases=pass.materialAliases;layer.materials=materials.bones;
   layer.warnings.push(...materials.warnings,...(visibility.warning?[visibility.warning]:[]));
   for(const name of visibilityReferences(geometry,pass.rules||[],model.values||{}))selected.references.add(name);
   if((geometry.bones||[]).length&&(geometry.bones||[]).every(b=>visibility.visibility[b.name]===false)){layer.status='inactive';layer.reason='All bones hidden by evaluated visibility rules.';continue;}
   if(materials.warnings.some(w=>w.startsWith('Unresolved material binding:'))){layer.status='unknown';layer.reason='Material expression or alias is unresolved; pass omitted.';continue;}
   if(visibility.warning)layer.status='unknown';
   const texture=require('./preview-images.cjs').image(await asset(pass.texture.file),pass.texture.file);
   if(texture.transparent&&Object.values(materials.bones).every(p=>!p.opaque&&!p.colorMask)){layer.status='inactive';layer.reason='Primary texture is fully transparent.';continue;}
   const groups=new Map();for(const [bone,profile]of Object.entries(materials.bones)){const key=JSON.stringify(profile);if(!groups.has(key))groups.set(key,{profile,bones:[]});groups.get(key).bones.push(bone);}
   let groupIndex=0;
   for(const group of groups.values()){
    if(groupIndex>=64||renderPasses.length>=128)throw Error('Appearance material pass limit exceeded.');
    const mask={...visibility.visibility};for(const bone of geometry.bones||[])if(!group.bones.includes(bone.name))mask[bone.name]=false;
    if((geometry.bones||[]).every(b=>mask[b.name]===false))continue;
    let renderedTexture=texture.uri;
    if(pass.secondary&&!group.profile.known){layer.status='unknown';layer.reason='Secondary sampler routing for this material is unsupported.';continue;}
    const compositeSecondary=pass.secondary&&(group.profile.masked||group.profile.multiplicative)?pass.secondary:undefined;
    const tintInputs=[...(group.profile.colorMask?['query.color']:[]),...(compositeSecondary&&group.profile.multiplicative?['query.color2']:[])];
    if(tintInputs.some(name=>!require('./preview-composite.cjs').palette[model.values?.[name]])){layer.status='unknown';layer.reason='Tint requires explicit supported palette inputs: '+tintInputs.join(', ');continue;}
    if(pass.secondary&&!compositeSecondary)layer.warnings.push('Secondary texture binding is unused by the supported single-sampler material profile.');
    if(compositeSecondary||group.profile.colorMask){const composite=require('./preview-composite.cjs');renderedTexture=composite.compose(composite.decode(await asset(pass.texture.file),pass.texture.file),compositeSecondary?composite.decode(await asset(compositeSecondary.file),compositeSecondary.file):undefined,group.profile,model.values);layer.warnings.push(group.profile.masked?'Masked composition retains primary alpha; secondary pixels outside that mask may be omitted. Minecraft shader parity is unverified.':'Two-sampler/tint composition approximates supported material profiles; shader parity is unverified.');}
    renderPasses.push({id:id+':'+groupIndex++,layerId:id,materials:materials.bones,geometry,geometryId:model.id,texture:renderedTexture,textureAlias:pass.texture.alias,textureId:pass.texture.id,secondaryTextureAlias:pass.secondary?.alias,visibility:mask,hiddenBones:Object.keys(mask).filter(n=>mask[n]===false),controller:pass.controller});
   }
  }catch(e){layer.status='unknown';layer.reason=e.message;layer.warnings.push(e.message);}
 }
 for(const record of controllers){const owned=layers.filter(l=>l.controller===record.controller);if(owned.length){record.layers=owned.map(l=>l.id);if(owned.every(l=>l.status==='inactive'))record.status='inactive';else if(owned.some(l=>l.status==='unknown'))record.status='unknown';record.warnings.push(...owned.flatMap(l=>l.warnings));}}
 warnings.push(...layers.flatMap(l=>[...(l.reason&&l.status==='unknown'?[l.controller+': '+l.reason]:[]),...l.warnings]));
 const dependencies=controllers.length?[...new Set(controllers.flatMap(c=>[...(c.activation?.dependencies||[]),...(c.expressions||[]).filter(e=>c.status!=='inactive'||e.kind==='visibility').flatMap(e=>e.dependencies||[])]))]:[...selected.references],fields=[...new Map(models.flatMap(m=>m.properties?.fields||[]).map(f=>[f.name,f])).values()],values=Object.assign({},...models.map(m=>m.values));
 const bindingContext=anchor?.ownerFile&&index.documents.get(anchor.ownerFile)?require('./molang-bindings.cjs').view(index,index.documents.get(anchor.ownerFile)):undefined;
 return {schemaVersion:1,entity:{identifier:anchor?.owner,source:anchor?.ownerFile?source(anchor.ownerFile):undefined},context:{target:index.project?.config?.target,targetVersion:index.project?.config?.targetVersion,resourceSubpack:bindingContext?.selected||'',requestedResourceSubpack:bindingContext?.requested||''},values,inputs:fields.map(f=>({name:f.name,status:Object.prototype.hasOwnProperty.call(values,f.name)?'resolved':'unknown',value:values[f.name],origin:models.some(m=>Object.prototype.hasOwnProperty.call(m.previewOverrides||{},f.name))?'explicit preview override':Object.prototype.hasOwnProperty.call(f,'default')?'entity definition default':'unresolved',source:f.source})),dependencies,controls:fields.filter(f=>dependencies.includes(f.name)),controllers,layers,renderPasses,variants:selected.variants,warnings:[...new Set(warnings)]};
}
module.exports.appearance=appearance;
