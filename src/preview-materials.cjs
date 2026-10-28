// Conservative built-in profiles. Unknown shaders remain explicit approximations.
function profile(id='',definitions){
 if(definitions){try{const d=inherit(definitions,id),flags=new Set(d.defines||[]),states=new Set(d.states||[]);return {id,known:true,depth:d.depthFunc||'Less',translucent:states.has('Blending'),emissive:flags.has('USE_EMISSIVE'),opaque:!flags.has('ALPHA_TEST')&&!states.has('Blending'),masked:flags.has('MASKED_MULTITEXTURE'),multiplicative:flags.has('MULTIPLICATIVE_TINT'),colorMask:flags.has('USE_COLOR_MASK'),noCull:states.has('DisableCulling'),depthWrite:!states.has('DisableDepthWrite')};}catch{}}

 const translucent=/alphablend|translucent|ghost|spectator/.test(id),emissive=/emissive|bioluminescent/.test(id);
 if(id==='tropicalfish'||id==='entity_multitexture_multiplicative_blend')return {id,known:true,multiplicative:true,colorMask:true,noCull:true,depth:'Less',opaque:false};
 if(id==='villager_v2_masked'||id==='entity_multitexture_masked')return {id,known:true,masked:true,noCull:true,depth:'LessEqual',opaque:false};
 const depth=/^(?:zombie_)?villager_v2/.test(id)?'LessEqual':'Less';
 const known=/^(entity(?:_.*)?|villager_v2(?:_masked)?|zombie_villager_v2(?:_masked)?|cow|cod|salmon)$/.test(id);
 return {id,depth,translucent,emissive,opaque:id==='entity'||id==='entity_emissive',known};
}
function resolve(geometry,rules,aliases,definitions){
 const bones={},warnings=new Set();
 for(const bone of geometry.bones||[]){let id;
  for(const rule of rules||[])for(const [pattern,value]of Object.entries(rule||{})){
   const regex=new RegExp('^'+pattern.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*')+'$','i');if(!regex.test(bone.name))continue;
   const match=/^material\.(\w+)$/i.exec(value);const keys=match?Object.keys(aliases||{}).filter(k=>k.toLowerCase()===match[1].toLowerCase()):[];
   id=keys.length===1?aliases[keys[0]]:undefined;if(!id)warnings.add(`Unresolved material binding: ${value}`);
  }
  const material=profile(id,definitions);bones[bone.name]=material;if(!material.known)warnings.add(`Material ${id||'(missing)'} uses an approximate cutout profile.`);
 }
 return {bones,warnings:[...warnings]};
}
function inherit(definitions,id,seen=[]){
 if(seen.includes(id)||seen.length>32)throw Error('Cyclic or excessive material inheritance: '+id);
 const matches=Object.entries(definitions).filter(([key])=>key.split(':')[0]===id);if(matches.length!==1)throw Error('Missing or ambiguous material: '+id);
 const [key,value]=matches[0],parent=key.split(':')[1];const result=parent?inherit(definitions,parent,[...seen,id]):{};
 for(const [name,data]of Object.entries(value)){if(name.startsWith('+'))result[name.slice(1)]=[...new Set([...(result[name.slice(1)]||[]),...data])];else if(name.startsWith('-'))result[name.slice(1)]=(result[name.slice(1)]||[]).filter(v=>!data.includes(v));else result[name]=data;}
 return result;
}
async function load(project){
 const fs=require('node:fs/promises'),path=require('node:path'),json=require('jsonc-parser'),core=require('./core.cjs');const definitions={};
 const roots=[];if(project.vanillaSource?.folder)roots.push(path.join(project.vanillaSource.folder,'resource_packs/vanilla/materials'));
 roots.push(path.join(project.packs.resource,'materials'));
 for(const root of roots){try{for await(const file of core.files(root)){if(!file.endsWith('.material'))continue;const target=path.join(root,file),real=await fs.realpath(target);if(!core.inside(await fs.realpath(root),real)||(await fs.stat(real)).size>8*1024*1024)continue;const errors=[],data=json.parse(await fs.readFile(real,'utf8'),errors,{allowTrailingComma:true});if(errors.length)continue;for(const [key,value]of Object.entries(data?.materials||{})){if(key==='version')continue;for(const old of Object.keys(definitions))if(old.split(':')[0]===key.split(':')[0])delete definitions[old];definitions[key]=value;}}}catch(e){if(e.code!=='ENOENT')throw e;}}
 return definitions;
}
module.exports={profile,resolve,inherit,load};
