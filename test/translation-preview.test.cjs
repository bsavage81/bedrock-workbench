const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const lang=require('../src/localization.cjs');
const decorations=require('../src/translation-decorations.cjs');
const languageEditor=require('../src/language-editor.cjs');

test('language colors identify key families and leave values and comments untouched',()=>{
 const source='\uFEFFentity.test:fish.name=Fish\r\nitem.spawn_egg.entity.test:fish.name=Egg\r\nitem.test:rod.name=Rod\r\ntile.test:stone.name=Stone\r\nui.greeting=Hello\r\naction.catch=Catch\r\npack.name=Pack\r\ncustom.key=Other\r\n# entity.comment=Ignored\r\n';
 const ranges=languageEditor.keyRanges(source,'en_US.lang');assert.deepEqual(ranges.map(r=>r.category),['entity','spawnEgg','item','block','ui','action','pack','other']);
 for(const range of ranges){assert.ok(!source.slice(range.offset,range.offset+range.length).includes('='));assert.equal(source[range.offset+range.length],'=');}
 const pkg=require('../package.json');assert.equal(pkg.contributes.languages.find(l=>l.extensions.includes('.lang')).id,'bedrock-lang');
 for(const range of ranges)assert.ok(pkg.contributes.colors.some(c=>c.id==='bedrock.lang.'+range.category));
});

test('language decoration colors provide explicit visible fallbacks for both editor themes',()=>{
 for(const kind of ['entity','spawnEgg','item','block','ui','action','pack','other']){
  const options=languageEditor.decorationColors(kind),entry=require('../package.json').contributes.colors.find(c=>c.id==='bedrock.lang.'+kind);
  assert.ok(options.color.includes(entry.defaults.dark));assert.ok(options.light.color.includes(entry.defaults.light));assert.ok(options.dark.color.includes(entry.defaults.dark));
  for(const value of [options.color,options.light.color,options.dark.color])assert.match(value,/^var\(--vscode-bedrock-lang-\w+, #[a-fA-F0-9]{6}\)$/);
 }
});

test('language usage includes implicit names, explicit localized fields and scripts but excludes unrelated strings',()=>{
 const json=require('jsonc-parser'),index=fixture();index.documents=new Map();index.scriptSources=new Map();
 function add(file,value,side='behavior'){const text=JSON.stringify(value,null,2),full=path.join(index.project.root,file);index.documents.set(full,{file:full,relative:file.slice(3),side,text,data:value,tree:json.parseTree(text)});return full;}
 const owner=add('BP/entities/fish.json',{'minecraft:entity':{description:{identifier:'test:fish'}}});
 const client=add('RP/entity/fish.json',{'minecraft:client_entity':{description:{identifier:'test:fish'}}},'resource');
 assert.deepEqual(languageEditor.references(index,'entity.test:fish.name').map(r=>r.file).sort(),[owner,client].sort());
 assert.equal(languageEditor.references(index,'item.spawn_egg.entity.test:fish.name').length,2);
 const item=add('BP/items/rod.json',{'minecraft:item':{description:{identifier:'test:rod'}}});
 assert.equal(languageEditor.references(index,'item.test:rod.name')[0].file,item);
 const block=add('BP/blocks/stone.json',{'minecraft:block':{description:{identifier:'test:stone'}}});
 assert.equal(languageEditor.references(index,'tile.test:stone.name')[0].file,block);
 add('RP/texts/message.json',{rawtext:[{translate:'ui.greeting'}]},'resource');
 add('RP/ui/screen.json',{label:{type:'label',text:'%ui.greeting'},literal:{type:'label',localize:false,text:'ui.greeting'},unrelated:'ui.greeting'},'resource');
 add('BP/manifest.json',{header:{name:'ui.greeting',description:'ui.greeting'}});
 index.scriptSources.set(path.join(index.project.root,'BP/scripts/main.ts'),"const message={translate:'ui.greeting'}; const unrelated='ui.greeting';");
 const refs=languageEditor.references(index,'ui.greeting');assert.equal(refs.length,5);assert.equal(new Set(refs.map(r=>r.file)).size,4);assert.ok(refs.every(r=>Number.isInteger(r.line)&&Number.isInteger(r.column)));
 index.commandSources=new Map([[path.join(index.project.root,'BP/functions/greet.mcfunction'),'# tellraw @a {"rawtext":[{"translate":"ui.greeting"}]}\r\nexecute as @a run tellraw @s {"rawtext":[{"translate":"ui.greeting"}]}\r\n']]);
 const commandRef=languageEditor.references(index,'ui.greeting').find(r=>r.reason==='Function translation reference');assert.equal(commandRef.line,1);assert.equal(languageEditor.references(index,'ui.greeting').length,6);
 assert.deepEqual(languageEditor.references(index,'missing'),[]);
});

test('language hover shows safe clickable usage paths instead of repeating the declaration',()=>{
 const json=require('jsonc-parser'),index=fixture(),file=path.join(index.project.root,'BP/entities/fish.json'),text='{"minecraft:entity":{"description":{"identifier":"test:fish"}}}';index.documents=new Map([[file,{file,relative:'entities/fish.json',side:'behavior',text,tree:json.parseTree(text)}]]);index.scriptSources=new Map();
 const vscode={MarkdownString:class{value='';appendText(s){this.value+=s;return this;}appendMarkdown(s){this.value+=s;return this;}},Uri:{file:file=>({with:({fragment})=>({toString:()=> 'file:///'+file.replaceAll('\\','/')+'#'+fragment})})}};
 const hover=languageEditor.hover(vscode,index,'entity.test:fish.name');assert.match(hover.value,/Used by 1 pack file/);assert.match(hover.value,/BP\/entities\/fish.json:1/);assert.match(hover.value,/#L1,/);assert.ok(!hover.value.includes('entity.test:fish.name'));assert.equal(hover.isTrusted,false);
 assert.match(languageEditor.hover(vscode,index,'unreferenced').value,/No references found/);
});

test('language decorations refresh only the parsed key ranges and clear non-pack editors',async t=>{
 const index=fixture(),file=[...index.languages.keys()][0],listeners={},calls=[],subscriptions=[];let text='entity.test:fish.name=Fish';
 const event=name=>callback=>{listeners[name]=callback;return {dispose(){}};};
 const editor={document:{uri:{scheme:'file',fsPath:file},getText:()=>text,positionAt:n=>n},setDecorations:(type,ranges)=>calls.push({id:type.id,ranges})};
 const vscode={ThemeColor:class{constructor(id){this.id=id;}},Range:class{constructor(start,end){this.start=start;this.end=end;}},DecorationRangeBehavior:{ClosedClosed:1},window:{visibleTextEditors:[editor],createTextEditorDecorationType:options=>({id:options.color.match(/--vscode-([^,]+)/)[1].replaceAll('-','.'),dispose(){}}),onDidChangeVisibleTextEditors:event('visible')},workspace:{onDidChangeTextDocument:event('edit')}};
 languageEditor.attach(vscode,{subscriptions},()=>index.project);t.after(()=>subscriptions.forEach(s=>s.dispose()));await new Promise(r=>setTimeout(r,150));assert.equal(calls.find(c=>c.id==='bedrock.lang.entity').ranges[0].end,text.indexOf('='));
 text='item.test:rod.name=Rod';calls.length=0;listeners.edit();await new Promise(r=>setTimeout(r,150));assert.equal(calls.find(c=>c.id==='bedrock.lang.entity').ranges.length,0);assert.equal(calls.find(c=>c.id==='bedrock.lang.item').ranges.length,1);
 editor.document.uri.fsPath=path.join(index.project.root,'notes.lang');calls.length=0;listeners.visible();await new Promise(r=>setTimeout(r,150));assert.ok(calls.every(c=>!c.ranges.length));
});
function fixture(){const root=path.resolve('.test-temp/translation-preview'),project={root,packs:{behavior:path.join(root,'BP'),resource:path.join(root,'RP')}};const file=path.join(project.packs.resource,'texts/en_US.lang');return {project,languages:new Map([[file,lang.parse('action.catch=Catch\nitem.test:fish.name=Fish\nshared=Project\n',file)]]),reference:{languages:[lang.vanillaDocument('shared=Vanilla\nvanilla.only=Vanilla only\n','resource_pack/texts/en_US.lang'),lang.vanillaDocument('action.catch=Fangen\n','resource_pack/texts/de_DE.lang')]}};}
function document(index,value,file='BP/entities/test.json'){const text=typeof value==='string'?value:JSON.stringify(value);return {uri:{scheme:'file',fsPath:path.join(index.project.root,file)},getText:()=>text};}
test('inline previews sit after values, prefer English and preserve source',()=>{
 const index=fixture(),doc=document(index,{components:{'minecraft:interact':{interact_text:'action.catch'}},untranslated:'missing',other:'vanilla.only'}),original=doc.getText(),previews=decorations.previews(index,doc);
 assert.deepEqual(previews.map(p=>p.text),['  → Catch','  → Vanilla only']);assert.equal(original[previews[0].offset-1],'"');assert.equal(previews[0].resolved[0].entries[1].value,'Fangen');assert.equal(doc.getText(),original);
 assert.deepEqual(decorations.previews(index,document(index,{key:'action.catch'},'outside/test.json')),[]);
 assert.equal(decorations.previews(index,document(index,{'action.catch':false})).length,0,'Do not annotate JSON property keys');
});
test('vanilla and project keys merge once with project overrides and dirty buffer refresh',()=>{
 const index=fixture();assert.deepEqual(lang.keys(index),['action.catch','item.test:fish.name','shared','vanilla.only']);assert.equal(lang.lookup(index,'shared').length,1);assert.equal(lang.lookup(index,'shared')[0].value,'Project');assert.equal(lang.lookup(index,'vanilla.only')[0].vanilla,true);
 const file=[...index.languages.keys()][0],open=[{uri:{scheme:'file',fsPath:file},isDirty:true,version:2,getText:()=> 'action.catch=Fresh Catch\nshared=Unsaved'}];
 assert.equal(lang.lookup(index,'shared',open)[0].value,'Unsaved');assert.equal(decorations.previews(index,document(index,{interact_text:'action.catch'}),open)[0].text,'  → Fresh Catch');
 index.languages.set(file,lang.parse('shared=Saved',file));assert.equal(lang.lookup(index,'shared')[0].value,'Saved');index.languages.delete(file);assert.equal(lang.lookup(index,'shared')[0].value,'Vanilla');assert.equal(lang.documents(index).size,0,'Vanilla must not become project rename declarations');
});
test('only translation-capable fields offer language keys',()=>{
 for(const keys of [['translate'],['rawtext',0,'translate'],['components','minecraft:display_name'],['components','minecraft:display_name','value'],['components','minecraft:interact_button'],['components','minecraft:interact','interactions',0,'interact_text'],['components','minecraft:crafting_table','table_name']])assert.equal(lang.isTextField(keys),true,keys.join('.'));
 for(const keys of [['text'],['name'],['value'],['table_name'],['components','minecraft:display_name','unrelated']])assert.equal(lang.isTextField(keys),false,keys.join('.'));
});
test('script RawMessage translations get previews without evaluating source',()=>{
 const index=fixture(),source="const message = {translate: 'action.catch'}; const literal = 'action.catch';";
 const strings=lang.scriptStrings(source,'main.ts');assert.equal(strings.length,1);assert.equal(source.slice(strings[0].offset,strings[0].offset+strings[0].length),"'action.catch'");
 assert.deepEqual(decorations.previews(index,document(index,source,'BP/scripts/main.ts')).map(p=>p.text),['  → Catch']);
 assert.deepEqual(lang.scriptStrings('const bad = { translate: dynamic };','main.ts'),[]);
});

test('decorations use the contributed color and refresh visible editors on unsaved language changes',async t=>{
 const index=fixture(),doc=document(index,{interact_text:'action.catch'}),listeners={},calls=[],subscriptions=[];
 const event=name=>callback=>{listeners[name]=callback;return {dispose(){}};};
 const vscode={ThemeColor:class{constructor(id){this.id=id;}},DecorationRangeBehavior:{ClosedClosed:1},Range:class{constructor(start,end){this.start=start;this.end=end;}},MarkdownString:class{value='';appendText(text){this.value+=text;return this;}},window:{visibleTextEditors:[{document:{...doc,positionAt:offset=>offset},setDecorations:(type,values)=>calls.push(values)}],createTextEditorDecorationType:options=>{assert.equal(options.after.color.id,'bedrock.translationPreview');return {dispose(){}};},onDidChangeVisibleTextEditors:event('visible')},workspace:{textDocuments:[],onDidChangeTextDocument:event('edit'),onDidCloseTextDocument:event('close'),createFileSystemWatcher:()=>({dispose(){},onDidCreate:event('create'),onDidChange:event('change'),onDidDelete:event('delete')})}};
 decorations.attach(vscode,{subscriptions},()=>index.project,async()=>index);t.after(()=>subscriptions.forEach(d=>d.dispose()));
 await new Promise(resolve=>setTimeout(resolve,220));assert.equal(calls.at(-1)[0].renderOptions.after.contentText,'  → Catch');
 const file=[...index.languages.keys()][0];vscode.workspace.textDocuments=[{uri:{scheme:'file',fsPath:file},isDirty:true,version:1,getText:()=> 'action.catch=Live Catch'}];listeners.edit({document:vscode.workspace.textDocuments[0]});await new Promise(resolve=>setTimeout(resolve,220));assert.equal(calls.at(-1)[0].renderOptions.after.contentText,'  → Live Catch');assert.equal(calls.at(-1)[0].range.start,calls.at(-1)[0].range.end);
});

test('manifest, UI label and death message translation fields stay scoped',()=>{
 const json=require('jsonc-parser');
 assert.equal(lang.isTextField(['header','name'],{relative:'manifest.json'}),true);
 assert.equal(lang.isTextField(['header','description'],{relative:'manifest.json'}),true);
 assert.equal(lang.isTextField(['header','name'],{relative:'entities/test.json'}),false);
 assert.equal(lang.isTextField(['components','minecraft:area_attack','death_message_override']),true);
 for(const localize of [true,false]){const tree=json.parseTree(JSON.stringify({label:{type:'label',localize,text:''}}));assert.equal(lang.isTextField(['label','text'],{relative:'ui/test.json',side:'resource',tree}),localize);}
 assert.equal(lang.isTextField(['rawtext',0,'text']),false);
});

test('vanilla namespaced items and blocks resolve their supplied names and legacy serialization keys',()=>{
 const index=fixture();index.reference.vanilla={item:['minecraft:bamboo','minecraft:cod','minecraft:stone'],block:['minecraft:bamboo','minecraft:stone','minecraft:oak_planks']};index.reference.vanillaNames={item:{'minecraft:cod':['item.fish.name']},block:{'minecraft:stone':['tile.stone.stone.name']}};index.reference.languages.push(lang.vanillaDocument('tile.bamboo.name=Bamboo\nitem.fish.name=Raw Cod\ntile.stone.stone.name=Stone\ntile.planks.oak.name=Oak Planks\naction.interact.trade=Trade\n','resource_pack/texts/en_US.lang'));
 for(const [id,kind,expected]of [['minecraft:bamboo','item','Bamboo'],['minecraft:cod','item','Raw Cod'],['minecraft:stone','block','Stone'],['minecraft:oak_planks','block','Oak Planks']])assert.equal(lang.resolve(index,id,kind)[0].entries[0].value,expected,id);
 assert.equal(lang.resolve(index,'minecraft:cod')[0].entries[0].value,'Raw Cod');assert.equal(lang.resolve(index,'action.interact.trade')[0].entries[0].value,'Trade');assert.equal(lang.resolve(index,'%action.interact.trade')[0].entries[0].value,'Trade');assert.deepEqual(lang.resolve(index,'minecraft:made_up'),[]);
 const data={'minecraft:entity':{components:{'minecraft:behavior.tempt':{items:['minecraft:bamboo','minecraft:cod']},'minecraft:behavior.move_to_block':{target_blocks:['minecraft:stone']},'minecraft:interact':{interactions:[{interact_text:'action.interact.trade'}]}}}};const doc=document(index,data),before=doc.getText();assert.deepEqual(decorations.previews(index,doc).map(p=>p.text),['  → Bamboo','  → Raw Cod','  → Stone','  → Trade']);assert.equal(doc.getText(),before);
 const file=[...index.languages.keys()][0];index.languages.set(file,lang.parse('tile.bamboo.name=Pack Bamboo',file));assert.equal(lang.resolve(index,'minecraft:bamboo','item')[0].entries[0].value,'Pack Bamboo');
 assert.deepEqual(decorations.previews(index,document(index,"const message = {translate: 'action.interact.trade'};",'BP/scripts/main.ts')).map(p=>p.text),['  → Trade']);
});
