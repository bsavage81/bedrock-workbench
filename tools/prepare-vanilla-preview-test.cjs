// Isolated native-host fixtures from an explicitly supplied Mojang archive.
// Reads SavageCraft texture overrides; never writes into pack sources.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{unzipSync}=require('fflate'),json=require('jsonc-parser'),core=require('../src/core.cjs');
(async()=>{
 const [archive,tag]=process.argv.slice(2);if(!archive||!/^v\d+\.\d+\.\d+\.\d+$/.test(tag))throw Error('Usage: node tools/prepare-vanilla-preview-test.cjs <samples-min.zip> <tag>');
 const root=path.resolve('.test-temp/vanilla-preview-project');for(const dir of ['BP','RP/entity','RP/textures/entity/fish'])await fs.mkdir(path.join(root,dir),{recursive:true});
 for(const [side,type]of [['BP','data'],['RP','resources']])await core.writeJson(path.join(root,side,'manifest.json'),{format_version:2,header:{name:'Vanilla preview fixture',description:'Read-only source test',uuid:crypto.randomUUID(),version:[1,0,0],min_engine_version:[1,21,0]},modules:[{uuid:crypto.randomUUID(),type,version:[1,0,0]}]});
 const config=await core.exists(path.join(root,'bedrock-project.json'))?(await core.loadProject(root)).config:await core.initialize(root);config.targetVersion=tag.slice(1).split('.').slice(0,3).join('.');await core.writeJson(path.join(root,'bedrock-project.json'),config);
 const docs=unzipSync(await fs.readFile(archive),{filter:e=>/^resource_pack\/(models|entity|attachables)\/.*\.json$/.test(e.name)&&e.originalSize<8*1024*1024}),previewGeometry=[],previewOwners=[];
 for(const [file,bytes]of Object.entries(docs)){const errors=[],data=json.parse(Buffer.from(bytes).toString(),errors,{allowTrailingComma:true});if(errors.length)continue;const relative=file.slice('resource_pack/'.length);if(relative.startsWith('models/'))previewGeometry.push({relative,data});else previewOwners.push({relative,data});}
 await core.writeJson(path.join(root,'.bedrock/reference/components.json'),{intelligenceVersion:12,tag,engine:config.targetVersion,target:config.targetVersion,updated:Date.now(),components:{block:{},item:{},entity:{}},previewGeometry,previewOwners});
 for(const fish of ['cod','salmon'])await core.writeJson(path.join(root,'RP/entity/'+fish+'.json'),{'minecraft:client_entity':{description:{identifier:'minecraft:'+fish,geometry:{default:'geometry.'+fish},textures:fish==='cod'?{default:'textures/entity/fish/cod'}:{ocean:'textures/entity/fish/savage_salmon-ocean',river:'textures/entity/fish/savage_salmon-river'}}}});
 for(const skin of ['ocean','river'])await core.writeJson(path.join(root,'RP/entity/salmon-'+skin+'.json'),{'minecraft:client_entity':{description:{identifier:'test:salmon_'+skin,geometry:{default:'geometry.salmon'},textures:{default:'textures/entity/fish/savage_salmon-'+skin}}}});
 await core.writeJson(path.join(root,'RP/entity/salmon-default.json'),{'minecraft:client_entity':{description:{identifier:'test:salmon_default',geometry:{default:'geometry.salmon'},textures:{river:'textures/entity/fish/savage_salmon-river',default:'textures/entity/fish/savage_salmon-ocean'}}}});
 for(const name of ['savage_salmon-ocean.png','savage_salmon-river.png'])await fs.copyFile(path.resolve('projects/SavageCraft v2/RP/textures/entity/fish',name),path.join(root,'RP/textures/entity/fish',name));
 console.log(root);
})().catch(e=>{console.error(e);process.exitCode=1;});
