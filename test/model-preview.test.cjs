const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {convert,rotate}=require('../src/preview-geometry.cjs');
const preview=require('../src/model-preview.cjs'),{ContentIndex}=require('../src/content.cjs');
const model=cube=>({description:{texture_width:64,texture_height:32},bones:[{name:'root',cubes:[cube]}]});
test('initial texture prefers explicit file, then default alias, then first declaration without hiding collisions',()=>{
 const textures=[{alias:'ocean',file:'/ocean.png'},{alias:'default',file:'/base.png'},{alias:'river',file:'/river.png'}];
 assert.equal(preview.defaultTexture({textures}),1);assert.equal(preview.defaultTexture({textures},'/river.png'),2);
 assert.equal(preview.defaultTexture({textures:[textures[0],textures[2]]}),0);
 assert.equal(preview.defaultTexture({textures:[textures[0],{alias:'default',file:undefined}]}),1,'Missing default is explained instead of silently replaced');
 assert.equal(preview.defaultTexture({textures:[...textures,{alias:'default',file:'/duplicate.png'}]}),-1);
 assert.equal(preview.defaultTexture({textures:[]}),-1);
});
test('side-view actions find geometry declarations and owner/block references without treating other strings as links',()=>{
 const {geometryLinks}=require('../src/preview-actions.cjs');
 const modern=JSON.stringify({'minecraft:geometry':[{description:{identifier:'geometry.one'}},{description:{identifier:'geometry.two'}}]});assert.deepEqual(geometryLinks(modern,{side:'resource'}).map(l=>l.id),['geometry.one','geometry.two']);
 assert.deepEqual(geometryLinks('{"geometry.legacy":{"bones":[]},"notes":"geometry.fake"}',{side:'resource'}).map(l=>l.id),['geometry.legacy']);
 const owner='{// comment\n"minecraft:client_entity":{"description":{"geometry":{"default":"geometry.cod"},"textures":{"default":"textures/fish/cod"}}}}';assert.deepEqual(geometryLinks(owner,{side:'resource'}).map(l=>l.id),['geometry.cod']);
 const block=JSON.stringify({'minecraft:block':{components:{'minecraft:geometry':{identifier:'geometry.block'}},permutations:[{components:{'minecraft:geometry':'geometry.variant'}}]}});assert.deepEqual(geometryLinks(block,{side:'behavior'}).map(l=>l.id),['geometry.block','geometry.variant']);
});
test('side-view CodeLens passes the exact URI and geometry while respecting trust and project scope',()=>{
 let provider;const context={subscriptions:[]},root=path.resolve('.test-temp/actions'),project={packs:{behavior:path.join(root,'BP'),resource:path.join(root,'RP')}};
 const vscode={workspace:{isTrusted:true},languages:{registerCodeLensProvider(selector,p){provider=p;return {};}},Range:class{constructor(start,end){this.start=start;this.end=end;}},CodeLens:class{constructor(range,command){this.range=range;this.command=command;}}};require('../src/preview-actions.cjs').attach(vscode,context,()=>project);
 const uri={scheme:'file',fsPath:path.join(project.packs.resource,'entity/cod.json')},document={uri,getText:()=>'{"minecraft:client_entity":{"description":{"geometry":{"default":"geometry.cod"}}}}',positionAt:n=>n};const [lens]=provider.provideCodeLenses(document);assert.equal(lens.command.command,'bedrock.openModelPreviewBeside');assert.deepEqual(lens.command.arguments,[uri,'geometry.cod']);
 vscode.workspace.isTrusted=false;assert.deepEqual(provider.provideCodeLenses(document),[]);vscode.workspace.isTrusted=true;assert.deepEqual(provider.provideCodeLenses({...document,uri:{scheme:'file',fsPath:path.join(root,'outside.json')}}),[]);
});
test('box UV dimensions, face directions, omitted per-face UVs and signed sizes',()=>{
 const m=convert(model({origin:[0,0,0],size:[8,12,4],uv:[2,3]}));assert.equal(m.faces.length,6);
 assert.deepEqual(m.faces.find(f=>f.name==='north').uv,[[6/64,7/32],[14/64,7/32],[14/64,19/32],[6/64,19/32]]);
 const per=convert(model({size:[8,12,4],uv:{north:{uv:[16,8],uv_size:[-8,12]}}}));assert.equal(per.faces.length,1);assert.equal(per.faces[0].uv[1][0],8/64);
 assert.ok(m.faces.find(f=>f.name==='north').positions.every(p=>p[2]===0));
});
test('pivot rotation, parent hierarchy, inflation, inherited mirror and cycles',()=>{
 assert.deepEqual(rotate([2,0,0],[1,0,0],[0,0,90]).map(Math.round),[1,1,0]);
 assert.deepEqual(rotate([1,2,3],[0,0,0],[90,90,90]).map(Math.round),[3,2,-1]);
 const m=convert({bones:[{name:'parent',pivot:[0,0,0],rotation:[0,0,90]},{name:'child',parent:'parent',cubes:[{origin:[1,0,0],size:[1,1,1],inflate:1,uv:[0,0]}]}]});
 assert.ok(m.faces.flatMap(f=>f.positions).some(p=>Math.abs(p[1]+3)<1e-8));
 assert.throws(()=>convert({bones:[{name:'a',parent:'b'},{name:'b',parent:'a'}]}),/Cyclic/);
 const normal=convert(model({size:[8,8,8],uv:[0,0]})),mirrored=convert(model({size:[8,8,8],uv:[0,0],mirror:true}));assert.deepEqual(mirrored.faces[0].uv,[normal.faces[0].uv[1],normal.faces[0].uv[0],normal.faces[0].uv[3],normal.faces[0].uv[2]]);
});
test('asymmetric box net assigns atlas corners to reflected Bedrock face corners',()=>{
 const g=convert(model({origin:[2,3,4],size:[8,12,4],uv:[2,3]}));
 // Each entry is [first scene corner, first atlas corner, opposite atlas corner].
 // Unequal width/depth and off-origin coordinates expose swaps and mirroring.
 const expected={north:[[-2,15,4],[6,7],[14,19]],south:[[-10,15,8],[18,7],[26,19]],east:[[-2,15,8],[2,7],[6,19]],west:[[-10,15,4],[14,7],[18,19]],up:[[-10,15,4],[14,7],[6,3]],down:[[-10,3,8],[22,3],[14,7]]};
 for(const f of g.faces){const [position,first,opposite]=expected[f.name];assert.deepEqual(f.positions[0],position,f.name+' scene corner');assert.deepEqual(f.uv[0],first.map((v,i)=>v/[64,32][i]),f.name+' atlas start');assert.deepEqual(f.uv[2],opposite.map((v,i)=>v/[64,32][i]),f.name+' atlas end');}
});
test('per-face top/bottom orientation differs from side faces and preserves signed UV sizes',()=>{
 const uv={};for(const name of ['north','south','east','west','up','down'])uv[name]={uv:[10,5],uv_size:[-6,3]};
 const g=convert(model({size:[8,12,4],uv}));for(const f of g.faces){const corners=f.uv.map(p=>p.map((v,i)=>v*[64,32][i]));assert.deepEqual(corners,['up','down'].includes(f.name)?[[4,8],[10,8],[10,5],[4,5]]:[[10,5],[4,5],[4,8],[10,8]],f.name);}
});
test('mirrored box UVs swap side strips, flip U and honor cube override of bone mirror',()=>{
 const g=convert({description:{texture_width:64,texture_height:32},bones:[{name:'root',mirror:true,cubes:[{size:[8,12,4],uv:[2,3]}]}]});
 assert.deepEqual(g.faces.find(f=>f.name==='east').uv[0],[18/64,7/32]);
 assert.deepEqual(g.faces.find(f=>f.name==='west').uv[0],[6/64,7/32]);
 assert.deepEqual(g.faces.find(f=>f.name==='up').uv[0],[6/64,7/32]);
 const override=convert({bones:[{name:'root',mirror:true,cubes:[{size:[8,12,4],uv:[2,3],mirror:false}]}]});assert.deepEqual(override.faces.find(f=>f.name==='east').uv[0],[2/64,7/64]);
});
test('Bedrock cow neck X rotation leans its upper corner toward the head',()=>{
 const g=convert({bones:[{name:'neck',cubes:[{origin:[-3,13,-12],size:[6,10,6],pivot:[0,18,-9],rotation:[40,0,0],uv:[0,63]}]}]});
 const corner=g.faces.find(f=>f.name==='south').positions[1],r=40*Math.PI/180;
 assert.ok(Math.abs(corner[1]-(18+5*Math.cos(r)+3*Math.sin(r)))<1e-8);
 assert.ok(Math.abs(corner[2]-(-9-5*Math.sin(r)+3*Math.cos(r)))<1e-8);
 assert.ok(corner[2]<-9,'Upper neck leans forward, not backward into the body.');
});
test('cube and nested bone pivots share one handedness conversion',()=>{
 const g=convert({bones:[{name:'grandparent',rotation:[0,90,0]},{name:'parent',parent:'grandparent',rotation:[0,0,90]},{name:'child',parent:'parent',cubes:[{origin:[1,0,0],size:[1,1,1],pivot:[1,0,0],rotation:[90,0,0],uv:[0,0]}]}]});
 assert.ok(g.faces.flatMap(f=>f.positions).some(p=>p.every((v,i)=>Math.abs(v-[1,-2,0][i])<1e-8)));
});
test('legacy geometry preserves identifiers and texture space',()=>{const [g]=preview.geometries({'geometry.old':{texturewidth:128,textureheight:64,bones:[]}});assert.equal(g.description.identifier,'geometry.old');assert.equal(convert(g).width,128);});
function fixture(){const index=new ContentIndex({packs:{resource:'/RP',behavior:'/BP'}});index.add('geometry','geometry.a','/RP/a.geo.json');index.documents.set('/RP/a.geo.json',{data:{'minecraft:geometry':[{description:{identifier:'geometry.a'}}]}});return index;}
test('reverse texture discovery preserves ambiguous owners, aliases, duplicate assets and missing textures',()=>{
 const i=fixture();for(const [n,root]of [['one','minecraft:client_entity'],['two','minecraft:attachable']])i.documents.set('/RP/'+n+'.json',{file:'/RP/'+n+'.json',data:{[root]:{description:{identifier:n,geometry:{default:'geometry.a'},textures:{default:'textures/a',other:'textures/missing'}}}}});
 i.add('texture','textures/a','/RP/a.png');i.add('texture','textures/a','/RP/duplicate.png');
 const models=preview.candidates(i,'/RP/a.png');assert.equal(models.length,2);assert.equal(models[0].textures.length,3);assert.equal(models[0].textures[2].file,undefined);
 assert.equal(preview.candidates(i,'/RP/no.png').length,0);
});
test('unbound geometry remains viewable and block atlas variations are explicit choices',()=>{
 const i=fixture();assert.match(preview.candidates(i,'/RP/a.geo.json')[0].warning,/No owning/);
 i.add('terrain_texture','stone','/RP/textures/terrain_texture.json');i.documents.set('/RP/textures/terrain_texture.json',{data:{texture_data:{stone:{textures:['textures/one','textures/two']}}}});
 i.documents.set('/BP/b.json',{file:'/BP/b.json',data:{'minecraft:block':{description:{identifier:'test:b'},components:{'minecraft:geometry':{identifier:'geometry.a'},'minecraft:material_instances':{'*':{texture:'stone'}}}}}});
 const [b]=preview.candidates(i,'/BP/b.json');assert.equal(b.textures.length,2);assert.match(b.warning,/one selected material/);
});
test('asset reads reject escapes',async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'preview-'));try{await fs.mkdir(path.join(root,'RP'));await fs.writeFile(path.join(root,'secret'),'private');await assert.rejects(preview.safeRead({packs:{resource:path.join(root,'RP')}},path.join(root,'secret')),/outside/);}finally{await fs.rm(root,{recursive:true,force:true});}});
test('shipped browser geometry conversion matches tested source',async()=>{assert.equal(await fs.readFile(path.join(__dirname,'../media/model-preview.js'),'utf8'),await fs.readFile(path.join(__dirname,'../src/preview-geometry.cjs'),'utf8')+'\n'+await fs.readFile(path.join(__dirname,'../media/preview-renderer.js'),'utf8'));});
test('native panel adapter enforces trust, confines webview resources, and refreshes saved bindings',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'preview-host-')),commands=new Map(),messages=[];let receive,changed,disposed;
 const project={root,packs:{behavior:path.join(root,'BP'),resource:path.join(root,'RP')}};
 for(const dir of Object.values(project.packs))await fs.mkdir(dir);
 const file=path.join(project.packs.resource,'model.json');await fs.writeFile(file,JSON.stringify({'minecraft:geometry':[model({size:[1,1,1],uv:[0,0]})]}).replace('"description":{"texture_width":64','"description":{"identifier":"geometry.a","texture_width":64'));
 const context={extensionUri:{fsPath:__dirname},subscriptions:[]},vscode={workspace:{isTrusted:false,createFileSystemWatcher:()=>({onDidChange(fn){changed=fn;return {};},onDidCreate(){return {};},onDidDelete(){return {};}})},commands:{registerCommand(id,fn){commands.set(id,fn);return {};}},Uri:{joinPath:(root,...p)=>({fsPath:path.join(root.fsPath,...p)})},ViewColumn:{Active:1,Beside:2},window:{showErrorMessage:()=>{},createWebviewPanel(type,title,column,options){assert.equal(column,2);assert.equal(options.localResourceRoots.length,1);assert.match(options.localResourceRoots[0].fsPath,/media$/);return {webview:{asWebviewUri:()=>'',postMessage:async m=>messages.push(m),onDidReceiveMessage(fn){receive=fn;}},onDidDispose(fn){disposed=fn;},dispose(){disposed();}};}}};
 try{
 preview.attach(vscode,context,()=>project,{warn(){}});const open=commands.get('bedrock.openModelPreviewBeside');assert.equal(await open({scheme:'file',fsPath:file}),undefined);
 vscode.workspace.isTrusted=true;assert.ok(await open({scheme:'file',fsPath:file}));await receive({type:'ready'});assert.equal(messages.find(m=>m.type==='model').geometry.description.identifier,'geometry.a');
 await fs.writeFile(file,'{');changed({fsPath:file});for(let n=0;n<60&&!messages.some(m=>m.type==='error');n++)await new Promise(r=>setTimeout(r,50));assert.match(messages.at(-1).message,/No project geometry/);
 }finally{for(const s of context.subscriptions)s.dispose?.();await fs.rm(root,{recursive:true,force:true});}
});
