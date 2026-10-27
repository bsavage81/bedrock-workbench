// Copy representative saved assets into an isolated test project; never edit packs.
const fs=require('node:fs/promises'),path=require('node:path'),json=require('jsonc-parser'),{ContentIndex}=require('../src/content.cjs'),preview=require('../src/model-preview.cjs');
(async()=>{
 const root=path.resolve('.test-temp/vanilla-preview-project'),source=path.resolve('projects/SavageCraft v2/RP'),index=new ContentIndex({});
 const owners=[];for(const name of ['cod','salmon','cow']){const file=path.join(source,'entity',name+'.entity.json'),data=json.parse(await fs.readFile(file,'utf8'));index.documents.set(file,{file,relative:'entity/'+name+'.json',side:'resource',data});owners.push({name,data});}
 for(const name of ['cod.json','salmon.render_cntrollers.json','cow.v3.render_controllers.json']){const file=path.join(source,'render_controllers',name),data=json.parse(await fs.readFile(file,'utf8'));index.documents.set(file,{file,relative:'render_controllers/'+name,side:'resource',data});await fs.mkdir(path.join(root,'RP/render_controllers'),{recursive:true});await fs.writeFile(path.join(root,'RP/render_controllers',name),JSON.stringify(data));}
 const audit=[];for(const b of preview.bindings(index))audit.push({owner:b.owner,geometry:b.alias,...require('../src/preview-render-bindings.cjs').infer(index,b)});
 await fs.writeFile(path.resolve('.test-temp/controller-savagecraft-audit.json'),JSON.stringify(audit,null,2));
 const wanted=new Set(owners.flatMap(o=>Object.values(o.data['minecraft:client_entity'].description.geometry)));
 for(const relative of await fs.readdir(path.join(source,'models/entity'))){if(!relative.endsWith('.json'))continue;const data=json.parse(await fs.readFile(path.join(source,'models/entity',relative),'utf8'));if(!preview.geometries(data).some(g=>wanted.has(g.description?.identifier)))continue;const dest=path.join(root,'RP/models/entity',relative);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,JSON.stringify(data));}
 for(const {name,data}of owners){await fs.writeFile(path.join(root,'RP/entity',name+'.json'),JSON.stringify(data));for(const id of Object.values(data['minecraft:client_entity'].description.textures)){const file=path.join(source,id+'.png');try{await fs.access(file);}catch{continue;}const dest=path.join(root,'RP',id+'.png');await fs.mkdir(path.dirname(dest),{recursive:true});await fs.copyFile(file,dest);}}
 console.log(JSON.stringify(audit.map(a=>({owner:a.owner,geometry:a.geometry,textures:a.aliases,complete:a.complete})),null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
