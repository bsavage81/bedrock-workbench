// Independently extract documentation facts, never upstream parser/schema code.
// Inputs: saved Microsoft Learn queryfunctions/mathfunctions HTML and Mojang metadata JSON.
const fs=require('node:fs'),path=require('node:path');
const [queries,math,metadata,previewQueries,previewMath]=process.argv.slice(2);
if(!metadata)throw Error('Usage: node tools/update-molang-catalog.cjs <Learn queries.html> <Learn math.html> <Mojang queries.json>');
const base='https://learn.microsoft.com/en-us/minecraft/creator/reference/content/molangreference/examples/molangconcepts/';
const facts=JSON.parse(fs.readFileSync(metadata));
function plain(s){return s.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;|&apos;/g,"'").replace(/&quot;/g,'"').trim();}
function extract(files){const entries=[];for(const file of files)for(const match of fs.readFileSync(file,'utf8').matchAll(/<tr[^>]*>\s*<td[^>]*>\s*<a href="([^"]+)"[^>]*>([^<]+)<\/a>\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/g)){
 const signature=plain(match[2]),label=signature.split('(')[0],name=label.replace(/^query_/,'query.'),fact=[...facts.queries,...facts.math_functions].find(e=>e.name===name),internal=label.startsWith('query_');
 const parameters=signature.includes('(')?signature.slice(signature.indexOf('(')+1,-1).split(',').map(s=>s.trim()).filter(Boolean):undefined;
 entries.push({name,description:plain(match[3]),url:new URL(match[1],base).href,...(internal?{internal:true}:{}), ...(parameters?{parameters}:{}),...(fact?{minArgs:fact.min_args,maxArgs:fact.max_args,returns:fact.return_type,restrictions:fact.description.match(/[^.]*\b(?:only|requires|must|deprecated|available|valid in)\b[^.]*(?:\.|$)/gi)?.map(s=>s.trim()),querySets:[...new Set((fact.version_ranges||[]).flatMap(r=>r.query_sets||[]))]}:{} )});
}return entries;}
const stable=extract([queries,math]);if(stable.length<300)throw Error('Incomplete Learn tables: '+stable.length);
let channels=['release'],entries=stable,channelAudit;
if(previewQueries&&previewMath){const preview=extract([previewQueries,previewMath]);if(preview.length<300)throw Error('Incomplete Preview tables');channels.push('preview');const union=new Map(stable.map(e=>[e.name,{...e,channels:['release']}])),changedDescriptions=[];
 for(const e of preview){const old=union.get(e.name);if(!old)union.set(e.name,{...e,channels:['preview']});else{old.channels.push('preview');if(old.description!==e.description||JSON.stringify(old.parameters)!==JSON.stringify(e.parameters)){old.previewDocumentation={description:e.description,parameters:e.parameters,url:e.url};changedDescriptions.push(e.name);}}}
 entries=[...union.values()];channelAudit={releaseCount:stable.length,previewCount:preview.length,previewOnly:preview.filter(e=>!stable.some(s=>s.name===e.name)).map(e=>e.name),releaseOnly:stable.filter(e=>!preview.some(s=>s.name===e.name)).map(e=>e.name),changedDescriptions};
}
fs.writeFileSync(path.join(__dirname,'../src/molang-catalog.json'),JSON.stringify({provenance:{primary:base,descriptions:'Microsoft Learn reference descriptions; function names and arity are documentation facts.',supporting:'https://github.com/Mojang/bedrock-samples/tree/v1.26.50.4/metadata/molang_modules',reviewed:'2026-10-26',channels,channelAudit,inputs:[queries,math,metadata,...previewQueries&&previewMath?[previewQueries,previewMath]:[]].map(file=>({name:path.basename(file),sha256:require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex')}))},entries},null,2)+'\n');
console.log(entries.length+' documented Molang entries');
