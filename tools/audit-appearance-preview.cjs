const fs=require('node:fs/promises'),path=require('node:path'),json=require('jsonc-parser'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{PNG}=require('pngjs'),{convert}=require('../src/preview-geometry.cjs');
(async()=>{
 const source=path.resolve('projects/SavageCraft v2'),results=[];
 for(const [geometryFile,textureFile,bone]of [['RP/models/entity/savage_bull.geo.json','RP/textures/entity/cow/cow_v2.png','Horn'],['RP/models/entity/attachable/savage_slingshot_pellet.geo.json','RP/textures/entity/attachable/savage_stone_pellet_projectile.png','']]){
  const model=json.parse(await fs.readFile(path.join(source,geometryFile),'utf8'))['minecraft:geometry'][0],image=PNG.sync.read(await fs.readFile(path.join(source,textureFile)));let samples=0,transparent=0;
  for(const f of convert(model).faces.filter(f=>f.bone.includes(bone)))for(const u of [.1,.3,.5,.7,.9])for(const v of [.1,.3,.5,.7,.9]){
   const uv=[0,1].map(i=>f.uv[0][i]*(1-u)*(1-v)+f.uv[1][i]*u*(1-v)+f.uv[2][i]*u*v+f.uv[3][i]*(1-u)*v),x=Math.min(image.width-1,Math.max(0,Math.floor(uv[0]*image.width))),y=Math.min(image.height-1,Math.max(0,Math.floor(uv[1]*image.height)));samples++;if(image.data[(y*image.width+x)*4+3]===0)transparent++;
  }
  assert.equal(transparent,0);results.push({geometryFile,textureFile,samples,transparent});
 }
 const hashes=JSON.parse(await fs.readFile(path.resolve('.test-temp/appearance-source-hashes.json'),'utf8'));for(const [file,hash]of Object.entries(hashes))assert.equal(crypto.createHash('sha256').update(await fs.readFile(path.join(source,file))).digest('hex'),hash);
 await fs.writeFile(path.resolve('.test-temp/appearance-uv-audit.json'),JSON.stringify({verifiedAt:new Date().toISOString(),results,unchangedSourceAssets:Object.keys(hashes).length},null,2));console.log(JSON.stringify(results));
})().catch(e=>{console.error(e);process.exitCode=1;});
