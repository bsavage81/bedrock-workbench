const fs=require('node:fs/promises'),path=require('node:path'),json=require('jsonc-parser'),crypto=require('node:crypto');
(async()=>{
 const source=path.resolve('projects/SavageCraft v2'),root=path.resolve('.test-temp/vanilla-preview-project'),hashes={};
 async function copy(relative){const bytes=await fs.readFile(path.join(source,relative));hashes[relative]=crypto.createHash('sha256').update(bytes).digest('hex');const dest=path.join(root,relative);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,bytes);}
 const files=['BP/entities/savage_koi.json','RP/entity/savage_koi.entity.json','RP/render_controllers/savage_koi.render_controllers.json','RP/models/entity/savage_koi.geo.json','RP/attachables/savage_stone_pellet.attachable.json','RP/entity/savage_stone_pellet_projectile.entity.json','RP/models/entity/attachable/savage_slingshot_pellet.geo.json','RP/models/entity/attachable/savage_slingshot_pellet_held.geo.json','RP/render_controllers/savage_pellet_projectile.render_controller.json'];
 for(const file of files)await copy(file);
 for(const file of files.filter(f=>/^RP\/(entity|attachables)\//.test(f))){const data=json.parse(await fs.readFile(path.join(source,file),'utf8')),desc=(data['minecraft:client_entity']||data['minecraft:attachable']).description;for(const id of Object.values(desc.textures||{}))for(const ext of ['.png','.tga'])if(await fs.access(path.join(source,'RP',id+ext)).then(()=>true,()=>false))await copy('RP/'+id+ext);}
 // Copy shared egg/fry geometry by identifier, never rename pack assets.
 for(const name of await fs.readdir(path.join(source,'RP/models/entity'))){if(!name.endsWith('.json'))continue;const text=await fs.readFile(path.join(source,'RP/models/entity',name),'utf8');if(/"geometry\.savage_(?:fry|fish_egg)"/.test(text))await copy('RP/models/entity/'+name);}
 await fs.writeFile(path.resolve('.test-temp/appearance-source-hashes.json'),JSON.stringify(hashes,null,2));console.log(`Copied ${Object.keys(hashes).length} source assets to isolated fixture.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
