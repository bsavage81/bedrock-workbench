// Read-only source audit. Writes evidence only under .test-temp.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),core=require('../src/core.cjs'),content=require('../src/content.cjs'),preview=require('../src/model-preview.cjs'),{convert}=require('../src/preview-geometry.cjs');
(async()=>{
 const project=await core.loadProject(path.resolve(process.argv[2]||'projects/SavageCraft v2')),index=await content.scan(project),report={geometryFiles:0,models:0,faces:0,warnings:{},bindings:preview.bindings(index).length,examples:[]};
 for(const doc of index.documents.values()){const gs=preview.geometries(doc.data);if(!gs.length)continue;report.geometryFiles++;for(const g of gs){const m=convert(g);report.models++;report.faces+=m.faces.length;for(const w of m.warnings)report.warnings[w]=(report.warnings[w]||0)+1;}if(/platypus|cattail|corn|trout/.test(doc.relative))report.examples.push({file:doc.relative,sha256:crypto.createHash('sha256').update(await fs.readFile(doc.file)).digest('hex'),models:preview.candidates(index,doc.file).map(m=>({id:m.id,owner:m.owner,textures:m.textures.map(t=>({id:t.id,exists:!!t.file}))}))});}
 await fs.mkdir('.test-temp',{recursive:true});await fs.writeFile('.test-temp/preview-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
