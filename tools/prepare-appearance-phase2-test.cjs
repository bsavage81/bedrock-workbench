// Isolated, reproducible native viewer fixture. Never edits original packs.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),core=require('../src/core.cjs');
(async()=>{
 const root=path.resolve('.test-temp/appearance-phase2-project'),fixtures=path.resolve('test/fixtures/appearance'),provenance=require('../test/fixtures/appearance/provenance.json');
 for(const side of ['BP','RP'])await fs.mkdir(path.join(root,side),{recursive:true});
 if(!await core.exists(path.join(root,'bedrock-project.json'))){for(const [side,type]of [['BP','data'],['RP','resources']])await core.writeJson(path.join(root,side,'manifest.json'),{format_version:2,header:{name:'Isolated appearance acceptance',description:'Pinned Mojang '+provenance.release.tag,uuid:crypto.randomUUID(),version:[1,0,0],min_engine_version:[1,26,50]},modules:[{type,uuid:crypto.randomUUID(),version:[1,0,0]}]});await core.initialize(root);}
 const config=await core.readJson(path.join(root,'bedrock-project.json'));config.targetVersion='1.26.50';config.build.autoDeploy=false;await core.writeJson(path.join(root,'bedrock-project.json'),config);
 for(const [file,meta]of Object.entries(provenance.files)){
  if(!meta.sourcePath.startsWith('resource_pack/')||/entity\/villager(?:\.v1\.0)?\.entity\.json$/.test(meta.sourcePath))continue;
  const bytes=await fs.readFile(path.join(fixtures,file));if(crypto.createHash('sha256').update(bytes).digest('hex')!==meta.sha256)throw Error('Fixture hash mismatch: '+file);
  const target=path.join(root,'RP',meta.sourcePath.slice('resource_pack/'.length));await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);
 }
 console.log(root);
})().catch(e=>{console.error(e);process.exitCode=1;});
