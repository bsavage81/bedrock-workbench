// Run alone: generator inputs are loaded with description selection disabled for comparison.
const fs=require('node:fs'),docs=require('../src/documentation.cjs');
const select=docs.componentDescription;docs.componentDescription=(kind,id,fallback)=>fallback;
const schemas={block:require('./block-schema.cjs'),item:require('./item-schema.cjs'),entity:require('./entity-schema.cjs')};
docs.componentDescription=select;
const catalog=require('../src/component-descriptions.json'),entries=[];
for(const [kind,schema]of Object.entries(schemas))for(const [id,node]of Object.entries(schema.definitions.components.properties)){
 const authored=node.description||'',published=catalog.components[kind]?.[id],selected=select(kind,id,authored),generated=require('../schemas/'+kind+'.schema.json').definitions.components.properties[id];
 entries.push({kind,id,decision:!published?'no-useful-learn-intro':published.review?'reviewed-retain-authored':selected===authored?'retain-clearer-authored':selected===published.description?'use-learn':'learn-with-authored-compatibility-notes',authored,selected,source:published?.source});
 if(generated.description!==selected)throw Error('Stale description: '+kind+' '+id);
}
const decisions={};for(const entry of entries)decisions[entry.decision]=(decisions[entry.decision]||0)+1;
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify({revision:catalog.revision,decisions,entries},null,2)+'\n');
console.log(JSON.stringify({reviewedCatalogEntries:Object.values(catalog.components).reduce((sum,values)=>sum+Object.keys(values).length,0),ownedComponents:entries.length,decisions,missingPublishedIntros:catalog.unavailable},null,2));
