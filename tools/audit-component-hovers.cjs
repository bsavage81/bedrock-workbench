const FILTER_FIELDS=new Set(['test','subject','operator','domain','value','all_of','any_of','none_of']);
function audit(schema){const parameters=new Map();function resolve(node){return node?.$ref?.startsWith('#/')?node.$ref.slice(2).split('/').reduce((value,key)=>value?.[key.replaceAll('~1','/').replaceAll('~0','~')],schema):undefined;}
 function documented(node,seen=new Set()){if(!node||seen.has(node))return false;seen.add(node);return !!(node.description&&/learn\.microsoft\.com/.test(node.markdownDescription||''))||documented(resolve(node),seen);}
 function walk(node,path,filter=false,seen=new Set()){
  if(!node||seen.has(node))return;seen=new Set(seen).add(node);
  if(node.$ref){const isFilter=node.$ref==='#/definitions/filter';walk(resolve(node),path,filter||isFilter,seen);}
  for(const [name,child]of Object.entries(node.properties||{})){const key=[...path,name].join('/'),custom=filter&&FILTER_FIELDS.has(name),covered=custom||documented(child);const previous=parameters.get(key);parameters.set(key,{path:key,covered:covered&&(previous?.covered??true),provider:custom?'filter':'schema'});walk(child,[...path,name],filter,seen);}
  for(const kind of ['anyOf','oneOf','allOf'])for(const child of node[kind]||[])walk(child,path,filter,seen);
  if(node.items&&!Array.isArray(node.items))walk(node.items,[...path,'[]'],filter,seen);
  if(node.additionalProperties&&typeof node.additionalProperties==='object')walk(node.additionalProperties,[...path,'*'],filter,seen);
  for(const child of Object.values(node.patternProperties||{}))walk(child,[...path,'*'],filter,seen);
 }
 const components=schema.definitions.components.properties;for(const [id,node]of Object.entries(components))walk(node,[id]);return {components:Object.keys(components).length,namedParameters:parameters.size,schemaHovers:[...parameters.values()].filter(p=>p.covered&&p.provider==='schema').length,filterHovers:[...parameters.values()].filter(p=>p.covered&&p.provider==='filter').length,missing:[...parameters.values()].filter(p=>!p.covered).map(p=>p.path)};
}
function all(){return Object.fromEntries(['block','item','entity'].map(kind=>[kind,audit(require('../schemas/'+kind+'.schema.json'))]));}
if(require.main===module){const report=all();console.log(JSON.stringify(report,null,2));if(Object.values(report).some(r=>r.missing.length))process.exitCode=1;}
module.exports={audit,all};
