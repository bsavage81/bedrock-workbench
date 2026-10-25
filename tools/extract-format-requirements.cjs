const {unzipSync}=require('fflate');const docs=require('../src/documentation.cjs');const catalog=require('../src/documentation-links.json');
function extract(bytes){const files=unzipSync(bytes,{filter:entry=>/\/creator\/Reference\/Content\/.*\.md$/i.test(entry.name)});const byPath=new Map(Object.entries(files).map(([name,bytes])=>[name.replace(/^.*?\/creator\//,'').replace(/\.md$/,'').toLowerCase(),Buffer.from(bytes).toString('utf8')]));
 const output={source:'https://github.com/MicrosoftDocs/minecraft-creator',updated:new Date().toISOString().slice(0,10),components:{block:{},item:{},entity:{}}};let scanned=0;
 const requirement=text=>/This (?:item|component|block) requires (?:a )?format version of at least\s*\*?\*?`?(\d+\.\d+\.\d+)/i.exec(text);
 for(const [kind,items]of Object.entries(catalog.components))for(const [id,relative]of Object.entries(items)){if(!/^minecraft:[a-z0-9_.]+$/.test(id)||['minecraft:item','minecraft:item_v1_21_90','minecraft:item_v1_26_0'].includes(id))continue;const text=byPath.get(relative.toLowerCase());if(!text)continue;scanned++;const intro=text.split(/^##\s/m)[0],match=requirement(intro),fields={};
 // Only the first property table describes direct component fields. Later tables can belong to nested objects.
 const firstTable=/^\|?Name\s*\|[^\n]*\n\|?\s*:?-+[^\n]*\n((?:\|[^\n]*(?:\n|$))+)/mi.exec(text);
 for(const line of (firstTable?.[1]||'').split('\n')){const cells=line.replace(/^\|/,'').split('|');const name=cells[0].trim().replace(/`/g,'');const fieldMatch=requirement(line);if(/^[a-z_][a-z0-9_]*$/.test(name)&&fieldMatch)fields[name]={min:fieldMatch[1]};}
 // Direct-field subheadings supplement tables; ignore subsection names and nested types.
 for(const section of text.split(/^###\s+/m).slice(1)){const name=section.split('\n')[0].trim().replace(/`/g,'');const fieldMatch=requirement(section.split(/^#/m)[0]);if(/^[a-z_][a-z0-9_]*$/.test(name)&&fieldMatch)fields[name]={min:fieldMatch[1]};}
 if(kind==='block'&&id==='minecraft:material_instances'){
  for(const line of text.split('\n')){const cells=line.replace(/^\|/,'').split('|'),name=cells[0]?.trim(),m=requirement(line);if(/^[a-z_]+$/.test(name)&&m)fields[name]={min:m[1],path:['*',name]};}
  for(const section of text.split(/^#{3,5}\s+/m).slice(1)){const name=section.split('\n')[0].trim(),m=requirement(section.split(/^#/m)[0]);if(/^[a-z_]+$/.test(name)&&m)fields[name]={min:m[1],path:['*',name]};}
 }
 if(match||Object.keys(fields).length)output.components[kind][id]={...(match?{min:match[1]}:{}),...(Object.keys(fields).length?{fields}:{}),source:docs.componentUrl(kind,id)};
 }
 if(scanned<100)throw Error('Documentation archive incomplete');return output;
}
module.exports={extract};
