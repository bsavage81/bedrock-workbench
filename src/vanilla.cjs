const fs=require('node:fs/promises');
const path=require('node:path');
const json=require('jsonc-parser');
const core=require('./core.cjs');
const {compareVersions}=require('./releases.cjs');
function collector() {
  const values=new Map(),referenced=new Map();
  const add=(kind,id)=>{if(typeof id!=='string'||!id)return; if(!values.has(kind))values.set(kind,new Set());values.get(kind).add(id);};
  const used=(kind,id)=>{if(typeof id!=='string'||!id||/[\s?()[\]{}]/.test(id))return;id=kind==='entity'?id.replace(/<[^<>]*>$/,''):kind==='item'?id.replace(/:\d+$/,''):id;if(['item','block','entity'].includes(kind)&&!id.includes(':'))id='minecraft:'+id;if(!referenced.has(kind))referenced.set(kind,new Set());referenced.get(kind).add(id);};
  function file(side,relative,data) {
    relative=relative.replaceAll('\\','/');
    if(side==='behavior') {
      for(const kind of ['block','item','entity']) add(kind,data?.['minecraft:'+kind]?.description?.identifier);
      if(/^loot_tables\/.*\.json$/i.test(relative))add('loot_table',relative);
      if(/^functions\/.*\.mcfunction$/i.test(relative))add('function',relative.slice(10,-11));
      function uses(node) {
        if(!node||typeof node!=='object')return;
        if(node.type==='item'||node.type==='minecraft:item')used('item',node.name);
        if(node['minecraft:loot']?.table)used('loot_table',node['minecraft:loot'].table);
        for(const [key,value]of Object.entries(node)) {
          if(['item','spawn_item','using_converts_to'].includes(key))used('item',value);
          if(relative.startsWith('recipes/')&&['input','output','result','reagent','base','addition','template'].includes(key))used('item',value);
          if(relative.startsWith('entities/')&&['entity_type','spawn_entity','into'].includes(key))used('entity',value);
          if(Array.isArray(value))value.forEach(uses);else if(value&&typeof value==='object')uses(value);
        }
      }
      uses(data);
      // Use the same typed item field contexts as diagnostics. This records
      // supported vanilla aliases/events without offering duplicate spellings.
      if(data?.['minecraft:item']) {
        const text=JSON.stringify(data),tree=json.parseTree(text);
        for(const ref of require('./content.cjs').references({side,relative,text,tree}))if(ref.type!=='item_tag')used(ref.type,ref.value);
      }
    } else {
      add('client_entity',data?.['minecraft:client_entity']?.description?.identifier);
      add('particle',data?.particle_effect?.description?.identifier);
      for(const geometry of Array.isArray(data?.['minecraft:geometry'])?data['minecraft:geometry']:[]) add('geometry',geometry?.description?.identifier);
      for(const id of Object.keys(data||{})) if(id.startsWith('geometry.'))add('geometry',id);
      for(const kind of ['terrain_texture','item_texture']) if(relative==='textures/'+kind+'.json') for(const [id,value]of Object.entries(data?.texture_data||{})) {
        add(kind,id);
        const texture=value?.textures;
        for(const entry of Array.isArray(texture)?texture:[texture]) { const name=typeof entry==='string'?entry:entry?.path;if(typeof name==='string')add('texture',name.replace(/\.(png|tga|jpe?g)$/i,'')); }
      }
      for(const id of Object.keys(data?.sound_definitions||{}))add('sound',id);
      if(/^textures\/.*\.(png|tga|jpe?g)$/i.test(relative))add('texture',relative.replace(/\.[^.]+$/,''));
      const description=(data?.['minecraft:client_entity']||data?.['minecraft:attachable'])?.description;
      const particleTexture=data?.particle_effect?.description?.basic_render_parameters?.texture;
      if(typeof particleTexture==='string'&&particleTexture.startsWith('textures/'))used('texture',particleTexture.replace(/\.(png|tga|jpe?g)$/i,''));
      for(const texture of Object.values(description?.textures||{}))if(typeof texture==='string'&&texture.startsWith('textures/'))used('texture',texture.replace(/\.(png|tga|jpe?g)$/i,''));
      for(const id of Object.values(description?.animations||{}))if(typeof id==='string') {
        if(id.startsWith('animation.'))used('animation',id);
        if(id.startsWith('controller.animation.'))used('animation_controller',id);
      }
      for(const entry of description?.render_controllers||[])for(const id of typeof entry==='string'?[entry]:Object.keys(entry||{}))if(id.startsWith('controller.render.'))used('render_controller',id);
    }
    for(const [key,kind]of [['animations','animation'],['animation_controllers','animation_controller'],['render_controllers','render_controller']])for(const id of Object.keys(data?.[key]||{}))add(kind,id);
  }
  const finish=map=>Object.fromEntries([...map].map(([kind,ids])=>[kind,[...ids].sort()]));
  return {add,file,finish:()=>finish(values),references:()=>finish(referenced)};
}
function merge(reference,local) {
  if(!local)return reference;
  const vanilla={...reference?.vanilla};
  for(const [kind,ids]of Object.entries(local.vanilla||{}))vanilla[kind]=[...new Set([...(vanilla[kind]||[]),...ids])];
  const vanillaReferences={...reference?.vanillaReferences};
  for(const [kind,ids]of Object.entries(local.vanillaReferences||{}))vanillaReferences[kind]=[...new Set([...(vanillaReferences[kind]||[]),...ids])];
  return {...reference,vanilla,vanillaReferences,languages:[...(reference?.languages||[]),...(local.languages||[])],localSource:local.source};
}
const allowed=(side,relative)=>side==='behavior'? /^(blocks|items|entities|loot_tables|functions|recipes|trading)\//.test(relative) : /^(texts|models|entity|attachables|animations|animation_controllers|render_controllers|particles|textures|sounds)\//.test(relative);
async function local(project,{force=false}={}) {
  const source=project.vanillaSource;
  if(!source)return;
  if(!path.isAbsolute(source.folder)||!/^\d+\.\d+\.\d+$/.test(source.version))throw Error('Invalid installed vanilla reference selection');
  if(compareVersions(source.version,project.config.targetVersion)>0)throw Error(`Installed vanilla ${source.version} is newer than target ${project.config.targetVersion}; using samples instead.`);
  const cacheFile=await core.local(project.root,'.bedrock/reference/local-'+project.config.target+'.json');
  const cached=await core.readJson(cacheFile).catch(()=>null);
  const same=cached?.indexVersion===4 && cached?.source?.folder===source.folder && cached.source.version===source.version && cached.source.channel===project.config.target;
  if(!force && same && Date.now()-cached.updated<86400000)return cached;
  const root=await fs.realpath(source.folder), packs=[];
  // Inspect only expected layouts beneath the explicitly selected directory.
  for(const base of ['', 'data','Content','Content/data'])for(const [side,singular,plural]of [['behavior','behavior_pack','behavior_packs'],['resource','resource_pack','resource_packs']]) {
    const parent=path.join(root,base);
    const add=async folder=>{try{const stat=await fs.lstat(folder);if(stat.isDirectory()&&!stat.isSymbolicLink()){const real=await fs.realpath(folder);if(core.inside(root,real)&&!packs.some(p=>p.folder===real))packs.push({side,folder:real});}}catch(e){if(e.code!=='ENOENT'&&e.code!=='ENOTDIR')throw e;}};
    await add(path.join(parent,singular));
    const directory=path.join(parent,plural);
    // Do not follow junctions into another location.
    const stat=await fs.lstat(directory).catch(e=>{if(e.code!=='ENOENT'&&e.code!=='ENOTDIR')throw e;});
    if(stat?.isDirectory()&&!stat.isSymbolicLink()&&core.inside(root,await fs.realpath(directory)))for(const entry of await fs.readdir(directory,{withFileTypes:true}))if(entry.isDirectory()&&/^vanilla(?:[_-].*)?$/i.test(entry.name))await add(path.join(directory,entry.name));
  }
  // Also allow selecting the vanilla pack folder itself.
  if(!packs.length) {
    if(await core.exists(path.join(root,'textures')))packs.push({side:'resource',folder:root});
    else if(await core.exists(path.join(root,'entities'))||await core.exists(path.join(root,'items'))||await core.exists(path.join(root,'blocks')))packs.push({side:'behavior',folder:root});
  }
  if(!packs.length)throw Error('No readable vanilla packs found. Select the game Content/data folder, a samples folder, or a vanilla pack folder.');
  const index=collector(),languages=[];let bytes=0,entries=0;
  async function walk(pack,folder,relative='') {
    for(const entry of await fs.readdir(folder,{withFileTypes:true})) {
      if(++entries>100000)throw Error('Vanilla reference directory exceeds the entry limit');
      if(entry.isSymbolicLink())continue;
      const rel=(relative?relative+'/':'')+entry.name,file=path.join(folder,entry.name);
      if(entry.isDirectory()){if(allowed(pack.side,rel+'/'))await walk(pack,file,rel);continue;}
      if(!entry.isFile()||!allowed(pack.side,rel))continue;
      if(pack.side==='resource'&&/^texts\/[^/]+\.lang$/.test(rel)){const stat=await fs.stat(file);if(stat.size>2*1024*1024)continue;bytes+=stat.size;if(bytes>128*1024*1024)throw Error('Vanilla reference data exceeds the size limit');languages.push(require('./localization.cjs').vanillaDocument(await fs.readFile(file,'utf8'),file));continue;}
      if(!/\.json$/i.test(rel)){index.file(pack.side,rel);continue;}
      const stat=await fs.stat(file);if(stat.size>8*1024*1024)continue;
      bytes+=stat.size;if(bytes>128*1024*1024)throw Error('Vanilla JSON reference data exceeds the size limit');
      const errors=[],data=json.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''),errors,{allowTrailingComma:true});
      if(!errors.length)index.file(pack.side,rel,data);
    }
  }
  for(const pack of packs)await walk(pack,pack.folder);
  const result={indexVersion:4,source:{...source,channel:project.config.target},updated:Date.now(),languages,vanilla:index.finish(),vanillaReferences:index.references(),packs:packs.length};
  if(!Object.keys(result.vanilla).length)throw Error('The selected packs did not contain readable vanilla identifiers');
  await core.writeJson(cacheFile,result);return result;
}
module.exports={collector,merge,local};
