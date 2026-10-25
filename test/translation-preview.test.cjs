const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const lang=require('../src/localization.cjs');
const decorations=require('../src/translation-decorations.cjs');
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
