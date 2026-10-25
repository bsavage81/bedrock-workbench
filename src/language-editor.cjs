const path=require('node:path'),json=require('jsonc-parser'),lang=require('./localization.cjs'),content=require('./content.cjs');
const labels={entity:'Entity name',spawnEgg:'Spawn egg name',item:'Item name',block:'Block name',ui:'Interface text',action:'Action text',pack:'Pack metadata',other:'Translation'};
function category(key){if(key.startsWith('item.spawn_egg.'))return 'spawnEgg';if(key.startsWith('entity.'))return 'entity';if(key.startsWith('item.'))return 'item';if(/^(tile|block)\./.test(key))return 'block';if(/^(action|death|deathScreen)\./.test(key))return 'action';if(/^(pack|manifest)\./.test(key))return 'pack';if(/^(ui|gui|menu|container|itemGroup|screen|options|commands|chat)\./.test(key))return 'ui';return 'other';}
function keyRanges(text,file){return lang.parse(text,file).entries.map(entry=>({offset:entry.offset,length:entry.length,category:category(entry.key)}));}
function references(index,key){const result=[],seen=new Set();
 function add(document,node,reason){const id=document.file+':'+node.offset;if(seen.has(id))return;seen.add(id);const prefix=document.text.slice(0,node.offset),line=(prefix.match(/\n/g)||[]).length,column=node.offset-(prefix.lastIndexOf('\n')+1);result.push({file:document.file,line,column,reason,offset:node.offset,length:node.length});}
 function matches(value,kind){return lang.candidates(value,kind).includes(key)||['item','block'].includes(kind)&&(index.reference?.vanillaNames?.[kind]?.[value]||[]).includes(key);}
 for(const document of index.documents.values()){
  function visit(node){if(node.type==='string'&&!(node.parent?.type==='property'&&node.parent.children[0]===node)){
   const keys=json.getNodePath(node),value=node.value;
   if(lang.isTextField(keys,document)&&value.replace(/^%/,'')===key)add(document,node,'Translation reference');
   const rootKind={'minecraft:entity':'entity','minecraft:client_entity':'entity','minecraft:item':'item','minecraft:block':'block'}[keys[0]];
   const owner=keys.length===3&&keys[1]==='description'&&keys[2]==='identifier'&&rootKind;
   const kind=owner||content.referenceKind(keys,value,document);
   if(['entity','item','block'].includes(kind)&&matches(value,kind))add(document,node,owner?'Automatic '+labels[category(key)].toLowerCase():'Localized '+kind+' reference');
   if(owner==='entity'&&key==='item.spawn_egg.entity.'+value+'.name')add(document,node,'Automatic spawn egg name');
  }for(const child of node.children||[])visit(child);}if(document.tree)visit(document.tree);
 }
 for(const [file,text]of index.scriptSources||[])for(const node of lang.scriptStrings(text,file))if(node.value===key)add({file,text},node,'Script translation reference');
 for(const [file,text]of index.commandSources||[]){let offset=0;for(const line of text.split(/(?<=\n)/)){if(!/^\s*#/.test(line)&&/(?:^|\brun\s+)(?:tellraw|titleraw)\s/.test(line)){const start=line.search(/\{\s*"rawtext"\s*:/);if(start>=0){const tree=json.parseTree(line.slice(start));function visit(node){if(node.type==='string'&&json.getNodePath(node).at(-1)==='translate'&&node.parent?.children[1]===node&&node.value===key)add({file,text},{...node,offset:offset+start+node.offset},'Function translation reference');for(const child of node.children||[])visit(child);}if(tree)visit(tree);}}offset+=line.length;}}
 return result.sort((a,b)=>a.file.localeCompare(b.file)||a.offset-b.offset);
}
function hover(vscode,index,key){const md=new vscode.MarkdownString(),found=references(index,key),files=new Map();for(const ref of found){if(!files.has(ref.file))files.set(ref.file,[]);files.get(ref.file).push(ref);}
 md.appendText(labels[category(key)]+'\n\n');
 if(!found.length)md.appendText('No references found in this project. Minecraft may also use this key at runtime.');
 else{
  md.appendText('Used by '+files.size+' pack '+(files.size===1?'file':'files')+'\n\n');
  // File links remain usable with isTrusted=false; no command links are needed.
  for(const group of [...files.values()].slice(0,60)){const ref=group[0],label=path.relative(index.project.root,ref.file).replaceAll('\\','/')+':'+(ref.line+1),uri=vscode.Uri.file(ref.file).with({fragment:'L'+(ref.line+1)+','+(ref.column+1)});md.appendMarkdown('- ['+label.replace(/[\\\[\]]/g,'\\$&')+'](<'+uri.toString().replaceAll('>','%3E')+'>)');md.appendText(' — '+ref.reason+(group.length>1?' ('+group.length+' references)':'')+'\n');}
  if(files.size>60)md.appendText('\n'+(files.size-60)+' more files.');
 }
 md.isTrusted=false;return md;
}
function attach(vscode,context,getProject){if(!vscode.window.createTextEditorDecorationType)return;
 const types=Object.fromEntries(Object.keys(labels).map(kind=>[kind,vscode.window.createTextEditorDecorationType({color:new vscode.ThemeColor('bedrock.lang.'+kind),rangeBehavior:vscode.DecorationRangeBehavior.ClosedClosed})]));
 let timer;function update(){const project=getProject();for(const editor of vscode.window.visibleTextEditors){const groups={};if(project&&editor.document.uri.scheme==='file'&&lang.isLanguageFile(project,editor.document.uri.fsPath))for(const entry of keyRanges(editor.document.getText(),editor.document.uri.fsPath))(groups[entry.category]??=[]).push(new vscode.Range(editor.document.positionAt(entry.offset),editor.document.positionAt(entry.offset+entry.length)));for(const [kind,type]of Object.entries(types))editor.setDecorations(type,groups[kind]||[]);}}
 function schedule(){clearTimeout(timer);timer=setTimeout(update,100);}
 context.subscriptions.push(...Object.values(types),vscode.window.onDidChangeVisibleTextEditors(schedule),vscode.workspace.onDidChangeTextDocument(schedule),{dispose(){clearTimeout(timer);}});schedule();
}
module.exports={category,keyRanges,references,hover,attach};
