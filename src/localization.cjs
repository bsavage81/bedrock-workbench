const path=require('node:path');
function isLanguageFile(project,file){if(!require('./core.cjs').inside(project.packs.resource,file))return false;return /^(?:subpacks\/[^/]+\/)?texts\/[^/]+\.lang$/.test(path.relative(project.packs.resource,file).replaceAll(path.sep,'/'));}
function parse(text,file){const locale=path.basename(file,'.lang'),entries=[];let offset=0,lineNumber=0;
 for(const raw of text.split(/(?<=\n)/)){const line=raw.replace(/\r?\n$/,''),clean=line.replace(/^\uFEFF/,'');if(!/^\s*#/.test(clean)){const equal=clean.indexOf('=');if(equal>0){const prefix=line.length-clean.length,key=clean.slice(0,equal).trim();if(key){let value=clean.slice(equal+1),comment;const marker=/\t#+|\s+###/.exec(value);if(marker){comment=value.slice(marker.index+marker[0].length).trim();value=value.slice(0,marker.index);}entries.push({key,value,comment,locale,file,line:lineNumber,offset:offset+prefix+clean.indexOf(key),length:key.length,valueOffset:offset+prefix+equal+1});}}}offset+=raw.length;lineNumber++;
 }return {file,text,locale,entries};
}
function documents(index,open=[]){const normalize=file=>process.platform==='win32'?path.resolve(file).toLowerCase():path.resolve(file);const map=new Map([...(index.languages||[])].map(([file,value])=>[normalize(file),value]));for(const document of open){const file=document.uri?.fsPath;if(document.uri?.scheme==='file'&&file?.endsWith('.lang')&&isLanguageFile(index.project,file)&&document.isDirty)map.set(normalize(file),parse(document.getText(),file));}return map;}
// Keep vanilla declarations out of project rename ownership. Merge only for previews/completions.
const catalogs=new WeakMap();
function vanillaDocument(text,file){const parsed=parse(text,file);return {file,locale:parsed.locale,values:parsed.entries.map(e=>[e.key,e.value,e.line])};}
function scriptStrings(text,file){
 const result=[];if(text.length>2*1024*1024)return result;
 try{const ast=require('@babel/parser').parse(text,{sourceType:'unambiguous',plugins:['typescript',...(/\.[jt]sx$/.test(file)?['jsx']:[])],errorRecovery:true});
 function visit(node){if(!node||typeof node!=='object')return;if(node.type==='ObjectProperty'&&!node.computed&&(node.key?.name==='translate'||node.key?.value==='translate')&&node.value?.type==='StringLiteral')result.push({offset:node.value.start,length:node.value.end-node.value.start,value:node.value.value});for(const [key,value]of Object.entries(node))if(!['loc','tokens','comments'].includes(key)){if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);}}visit(ast);
 }catch{/* Incomplete scripts do not establish translation contexts. */}return result;
}
function catalog(index,open=[]){
 const sources=[...(index.languages?.values()||[]),...(index.reference?.languages||[])];
 const dirty=open.filter(d=>d.isDirty&&d.uri?.scheme==='file'&&d.uri.fsPath.endsWith('.lang')&&isLanguageFile(index.project,d.uri.fsPath)).map(d=>[d.uri.fsPath,d.version,d.getText()]);
 const previous=catalogs.get(index),signature=JSON.stringify(dirty);
 if(previous&&previous.signature===signature&&previous.sources.length===sources.length&&sources.every((doc,i)=>doc===previous.sources[i]))return previous.result;
 const result=new Map();
 const add=(entry,vanilla)=>{let entries=result.get(entry.key);if(!entries)result.set(entry.key,entries=[]);const locale=entry.locale.toLowerCase();if(vanilla){const existing=entries.findIndex(e=>e.vanilla&&e.locale.toLowerCase()===locale);if(existing>=0)entries.splice(existing,1);}else{for(let i=entries.length-1;i>=0;i--)if(entries[i].vanilla&&entries[i].locale.toLowerCase()===locale)entries.splice(i,1);}entries.push({...entry,vanilla});};
 for(const doc of index.reference?.languages||[])for(const entry of doc.values?doc.values.map(([key,value,line])=>({key,value,line,locale:doc.locale,file:doc.file})):doc.entries||[])add(entry,true);
 for(const doc of documents(index,open).values())for(const entry of doc.entries)add(entry,false);
 const rank=e=>e.locale.toLowerCase()==='en_us'?0:/^en_/i.test(e.locale)?1:2;
 for(const entries of result.values())entries.sort((a,b)=>rank(a)-rank(b)||a.locale.localeCompare(b.locale)||Number(a.vanilla)-Number(b.vanilla)||a.file.localeCompare(b.file));
 catalogs.set(index,{sources,signature,result});return result;
}
function lookup(index,key,open=[]){return catalog(index,open).get(key)||[];}
function keys(index,open=[]){return [...catalog(index,open).keys()].sort();}
function isTextField(keys,document){
 const key=keys.at(-1);
 if(key==='translate')return true;
 if(document?.relative==='manifest.json'&&keys.length===2&&keys[0]==='header'&&['name','description'].includes(key))return true;
 if(key==='death_message_override'&&keys.at(-2)==='minecraft:area_attack')return true;
 if(key==='text'&&document?.side==='resource'&&document.relative.startsWith('ui/')){const node=require('jsonc-parser').findNodeAtLocation(document.tree,keys.slice(0,-1));return require('jsonc-parser').findNodeAtLocation(node,['type'])?.value==='label'&&require('jsonc-parser').findNodeAtLocation(node,['localize'])?.value!==false;}
 if(key==='interact_text')return true;
 if(key==='minecraft:display_name'||(key==='value'&&keys.at(-2)==='minecraft:display_name'))return true;
 if(key==='minecraft:interact_button')return true;
 return key==='table_name'&&keys.at(-2)==='minecraft:crafting_table';
}
function candidates(value,kind){
 if(typeof value!=='string')return [];const key=value.startsWith('%')?value.slice(1):value,result=[key];
 if(kind==='entity'||kind==='client_entity')result.push('entity.'+value+'.name');
 if(kind==='item')result.push('item.'+value+'.name','item.'+value,'tile.'+value+'.name');
 if(kind==='block')result.push('tile.'+value+'.name','tile.'+value,'item.'+value+'.name');
 if(value.startsWith('minecraft:')){const id=value.slice(10);if(kind==='item'||kind==='block'){const prefixes=kind==='block'?['tile','item']:['item','tile'];for(const prefix of prefixes)result.push(prefix+'.'+id+'.name',prefix+'.'+id);const parts=id.split('_');if(parts.length>1)result.push('tile.'+parts.at(-1)+'.'+parts.slice(0,-1).join('_')+'.name');}if(kind==='entity'||kind==='client_entity')result.push('entity.'+id+'.name');}
 return [...new Set(result)];
}
function resolve(index,value,kind,open=[],values=catalog(index,open)){
 if(!kind&&typeof value==='string'&&value.startsWith('minecraft:')){if(index.reference?.vanilla?.item?.includes(value))kind='item';else if(index.reference?.vanilla?.block?.includes(value))kind='block';}
 const keys=candidates(value,kind);if(value?.startsWith('minecraft:')&&['item','block'].includes(kind))for(const type of kind==='item'?['item','block']:['block','item'])keys.push(...(index.reference?.vanillaNames?.[type]?.[value]||[]));
 return [...new Set(keys)].map(key=>({key,entries:values.get(key)||[]})).filter(r=>r.entries.length);
}
function markdown(vscode,resolved,root){const md=new vscode.MarkdownString();for(const {key,entries}of resolved){md.appendText(key+'\n\n');for(const e of entries)md.appendText(e.locale+': '+e.value+'\n'+(e.vanilla?'Vanilla: '+e.file:root?path.relative(root,e.file):path.basename(e.file))+':'+(e.line+1)+'\n\n');}md.isTrusted=false;return md;}
module.exports={vanillaDocument,scriptStrings,catalog,isTextField,isLanguageFile,parse,documents,lookup,keys,candidates,resolve,markdown};
