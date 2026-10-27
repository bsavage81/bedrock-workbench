const fs=require('node:fs'),path=require('node:path'),json=require('jsonc-parser'),{unzipSync}=require('fflate'),molang=require('../src/molang.cjs');
const archive=process.argv[2];if(!archive)throw Error('Usage: node tools/audit-molang.cjs <bedrock-samples.zip> [project-root]');
const report={source:'Mojang bedrock-samples v1.26.50.4',documents:0,expressions:0,issues:[],unrecognized:[],queryNames:[],missingQueries:[]},names=new Set(),documents=[];
function inspect(side,relative,text,file){const document={side,relative,text,file,tree:json.parseTree(text),cohort:/^(behavior_pack|resource_pack)\//.test(file)?'vanilla':'project'};documents.push(document);report.documents++;const recognized=new Set(molang.nodes(document));report.expressions+=recognized.size;
 function walk(n){if(n.type==='string'&&!(n.parent?.type==='property'&&n.parent.children[0]===n)){
  if(/\b(?:query|q|math|v|variable|temp|t|context|c)\./i.test(n.value)&&!recognized.has(n))report.unrecognized.push({file,path:json.getNodePath(n),value:n.value});
  if(recognized.has(n))for(const t of molang.lex(n.value))if(/^q(?:uery)?\./i.test(t.value))names.add(molang.canonical(t.value));
 }for(const c of n.children||[])walk(c);}if(document.tree)walk(document.tree);
}
const files=unzipSync(fs.readFileSync(archive),{filter:e=>/^(behavior_pack|resource_pack)\/.*\.json$/.test(e.name)});
for(const [name,bytes]of Object.entries(files)){const [folder,...rest]=name.split('/');inspect(folder==='behavior_pack'?'behavior':'resource',rest.join('/'),Buffer.from(bytes).toString(),name);}
if(process.argv[3]){const root=path.resolve(process.argv[3]),config=json.parse(fs.readFileSync(path.join(root,'bedrock-project.json'),'utf8'));for(const side of ['behavior','resource']){
 const folder=path.resolve(root,config.packs?.[side]|| (side==='behavior'?'BP':'RP'));
 function walk(dir){if(!fs.existsSync(dir))return;for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory())walk(file);else if(e.name.endsWith('.json'))inspect(side,path.relative(folder,file).replaceAll('\\','/'),fs.readFileSync(file,'utf8'),file);}}walk(folder);
}}
for(const cohort of ['vanilla','project']){const group=documents.filter(d=>d.cohort===cohort),index={documents:new Map(group.map(d=>[d.file,d]))};for(const document of group)for(const issue of molang.issues(document,index))report.issues.push({...issue,expression:json.findNodeAtOffset(document.tree,issue.offset)?.value});}
report.queryNames=[...names].sort();report.missingQueries=report.queryNames.filter(n=>!molang.info(n));
const output=path.resolve('.test-temp/molang-audit.json');fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify({documents:report.documents,expressions:report.expressions,issues:report.issues.length,unrecognized:report.unrecognized.length,missingQueries:report.missingQueries,output},null,2));
