const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto'),{PNG}=require('pngjs');
const core=require('./core.cjs'),scripts=require('./scripts.cjs');
function validateName(name){return typeof name!=='string'||!name.trim()?'Enter a project name.':name.trim().length>100?'Use a project name of 100 characters or fewer.':/[\x00-\x1f]/.test(name)?'Project names cannot contain control characters.':undefined;}
function folderName(name){let value=name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'');if(!value||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value))value='Project_'+value;return value;}
async function validateLocation(root){if(!path.isAbsolute(root)||path.dirname(root)===root)throw new Error('Choose a new project folder with an absolute path.');const parent=path.dirname(root);await core.local(parent,path.basename(root));if(!(await fs.stat(parent)).isDirectory())throw new Error('The parent folder must exist.');try{await fs.lstat(root);throw new Error('This folder already exists. Choose a new folder; use Initialize Existing Project for an existing BP/RP project.');}catch(error){if(error.code!=='ENOENT')throw error;}}
function validateScript(selection,config){const parsed=scripts.variant(selection?.version||'');if(!parsed||parsed.runtime!==selection.runtime)throw new Error('Choose matching Script API runtime and typing versions.');if(parsed.beta!==!!config.experimentalGameplay?.betaApis)throw new Error('The Script API version must match the selected stable or beta APIs.');if(parsed.engine&&(parsed.channel!==config.target||require('./releases.cjs').compareVersions(parsed.engine,config.targetVersion)>0))throw new Error('The Script API typings must support the selected Minecraft channel and target.');return parsed;}
async function selectScript(config,{fetchImpl=globalThis.fetch}={}){const response=await fetchImpl('https://registry.npmjs.org/%40minecraft%2Fserver',{headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('Script API registry returned HTTP '+response.status);const metadata=await response.json();if(metadata.name&&metadata.name!=='@minecraft/server')throw new Error('Unexpected Script API metadata.');const selected=scripts.selectVersion(metadata,config);validateScript(selected,config);return {...selected,peers:metadata.versions[selected.version]?.peerDependencies||{}};}
function placeholderIcon(){const icon=new PNG({width:128,height:128});for(let y=0;y<128;y++)for(let x=0;x<128;x++){const offset=(y*128+x)*4,edge=x<8||y<8||x>119||y>119,top=y<45;icon.data.set(edge?[30,43,51,255]:top?[87,174,106,255]:((x>>4)+(y>>4))%2?[112,79,53,255]:[133,94,62,255],offset);}return PNG.sync.write(icon);}
const folders={BP:['blocks','entities','items','recipes','loot_tables','functions','spawn_rules','trading','animations','animation_controllers'],RP:['entity','attachables','models/entity','textures/blocks','textures/items','texts','animations','animation_controllers','render_controllers','particles','sounds','ui']};
async function create(options){
 const name=options.name?.trim(),invalid=validateName(name);if(invalid)throw new Error(invalid);
 const root=path.resolve(options.root),target=options.target||'release',targetVersion=core.parseVersion(options.targetVersion).join('.'),language=options.scripting||'none';
 if(!['release','preview'].includes(target)||!['none','typescript','javascript'].includes(language))throw new Error('Choose a supported Minecraft channel and scripting language.');
 const experimentalGameplay={...(options.experiments||{})};if(language==='none')experimentalGameplay.betaApis=false;
 if(Object.values(experimentalGameplay).some(value=>typeof value!=='boolean'))throw new Error('Experiment requirements must be on/off values.');
 const settings={target,targetVersion,experimentalGameplay};if(language!=='none')validateScript(options.scriptApi,settings);
 await validateLocation(root);
 const icon=options.icon?await fs.readFile(options.icon):placeholderIcon();if(icon.length>8*1024*1024)throw new Error('Choose a PNG icon smaller than 8 MB.');try{PNG.sync.read(icon);}catch{throw new Error('The pack icon must be a valid PNG image.');}
 const parent=path.dirname(root),stage=await fs.mkdtemp(path.join(parent,'.bedrock-new-'));let claimed=false;
 try{
  const version=[1,0,0],ids={behavior:randomUUID(),resource:randomUUID()},description=name+' Minecraft Bedrock add-on.';
  for(const [folder,kind,type]of [['BP','behavior','data'],['RP','resource','resources']]){
   await fs.mkdir(path.join(stage,folder));for(const directory of folders[folder])await fs.mkdir(path.join(stage,folder,directory),{recursive:true});
   const manifest={format_version:2,header:{name:name+(kind==='behavior'?' BP':' RP'),description,uuid:ids[kind],version,min_engine_version:core.parseVersion(targetVersion)},modules:[{type,uuid:randomUUID(),version}]};
   if(kind==='behavior'){manifest.dependencies=[{uuid:ids.resource,version}];if(language!=='none'){manifest.modules.push({type:'script',language:'javascript',uuid:randomUUID(),version,entry:'scripts/main.js'});manifest.dependencies.push({module_name:'@minecraft/server',version:options.scriptApi.runtime});}}
   await core.writeJson(path.join(stage,folder,'manifest.json'),manifest);await fs.writeFile(path.join(stage,folder,'pack_icon.png'),icon,{flag:'wx'});
  }
  const config=await core.initialize(stage);Object.assign(config,{name,namespace:folderName(name).toLowerCase().replace(/[^a-z0-9_]/g,'_')||'my_pack',description,...settings});config.profiles.beta.title=name+' Beta';config.profiles.stable.title=name;
  await core.writeJson(path.join(stage,'bedrock-project.json'),config);
  await fs.writeFile(path.join(stage,'RP/texts/en_US.lang'),'pack.name='+name+'\npack.description='+description+'\n',{flag:'wx'});await core.writeJson(path.join(stage,'RP/texts/languages.json'),['en_US']);
  if(language!=='none'){
   await fs.mkdir(path.join(stage,'BP/scripts'));const extension=language==='typescript'?'ts':'js';
   await fs.writeFile(path.join(stage,'BP/scripts/main.'+extension),'import { system } from "@minecraft/server";\n\nsystem.run(() => {\n  console.warn('+JSON.stringify(name+' scripts loaded.')+');\n});\n',{flag:'wx'});
   const packageName=folderName(name).toLowerCase().replace(/[^a-z0-9-]/g,'-').replace(/^-+|-+$/g,'')||'bedrock-project';
   await core.writeJson(path.join(stage,'package.json'),{name:packageName,version:'1.0.0',private:true,type:'module',devDependencies:{'@minecraft/server':options.scriptApi.version}});
   await core.writeJson(path.join(stage,language==='typescript'?'tsconfig.json':'jsconfig.json'),{compilerOptions:{target:'ES2020',module:'ESNext',moduleResolution:'Bundler',noEmit:true,strict:true,...(language==='javascript'?{allowJs:true,checkJs:true}:{})},include:['BP/scripts/**/*'],exclude:['node_modules','.bedrock']});
  }
  await fs.writeFile(path.join(stage,'.gitignore'),'.bedrock/\nnode_modules/\n',{flag:'wx'});
  const requirements=Object.entries(experimentalGameplay).filter(([,enabled])=>enabled).map(([id])=>id);
  await fs.writeFile(path.join(stage,'README.md'),'# '+name+'\n\nEdit source files in BP and RP using the normal VS Code Explorer.\n\nUse Bedrock: Build Beta, Deploy Beta, Deploy Stable, or Export Stable mcaddon. Initial version: 1.0.0. Auto deployment starts off; enable it from the project sidebar when ready. Beta builds grayscale pack icons automatically.\n\nTarget: '+target+' '+targetVersion+'.\n\nWorld experiments: '+(requirements.length?requirements.join(', '):'none')+'. Enable the selected experiments in Minecraft world settings; project settings record requirements and do not edit worlds.\n'+(language!=='none'?'\nScript source: BP/scripts/main.'+(language==='typescript'?'ts':'js')+'. The compiler emits scripts/main.js. Use Bedrock: Install Script API Typings when dependencies need to be installed or refreshed.\n':''),{flag:'wx'});
  await core.loadProject(stage);
  // Claim the destination exclusively, even if another process creates it while
  // the wizard is open. Copies must never replace an existing source file.
  await fs.mkdir(root);claimed=true;await fs.cp(stage,root,{recursive:true,force:false,errorOnExist:true});
  return await core.loadProject(root);
 }catch(error){if(claimed)throw new Error('Project creation could not finish. Created files are preserved at '+root+'. '+error.message,{cause:error});throw error;}
 finally{if(core.inside(parent,stage)&&path.basename(stage).startsWith('.bedrock-new-'))await fs.rm(stage,{recursive:true,force:true});}
}
module.exports={create,folderName,validateName,validateLocation,validateScript,selectScript};
