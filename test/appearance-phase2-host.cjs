// Real controls are operated in the native webview. This host only observes
// render acknowledgements; it never injects values or browser automation code.
const vscode=require('vscode'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
async function run(){
 await vscode.extensions.getExtension('bsavage81.bedrock-workbench').activate();
 const root=vscode.workspace.workspaceFolders[0].uri.fsPath,owner=vscode.Uri.file(path.join(root,'RP/entity/villager_v2.entity.json'));
 const document=await vscode.workspace.openTextDocument(owner);await vscode.window.showTextDocument(document,vscode.ViewColumn.One);
 const panel=await vscode.commands.executeCommand('bedrock.openModelPreviewBeside',owner),results=[];
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Native Phase 2 interaction checks timed out')),900000);const sub=panel.webview.onDidReceiveMessage(async m=>{try{
  if(m.type==='renderError')throw Error(m.message);if(m.type!=='rendered')return;results.push(m);
  const state=m.properties||{},p=m.passes||[],adult=m=>m.properties?.['query.is_baby']===false;
  const checks={adultPlainsFarmer:results.some(m=>adult(m)&&m.passes?.length===3&&m.passes.some(p=>p.textureAlias==='plains'&&p.secondaryTextureAlias==='farmer')),adultDesertLibrarian:results.some(m=>adult(m)&&m.passes?.length===3&&m.passes.some(p=>p.textureAlias==='desert'&&p.secondaryTextureAlias==='librarian')&&m.passes.some(p=>p.textureAlias==='level_gold')),baby:results.some(m=>m.properties?.['query.is_baby']===true&&m.passes?.some(p=>p.geometryId==='geometry.villager.baby'&&p.textureAlias==='baby_base')&&!m.passes.some(p=>/level$/.test(p.controller||''))),layerIsolation:results.some(m=>m.viewMode==='layers'&&m.passes?.length===1),restoreLayers:results.some(m=>m.viewMode==='layers'&&m.passes?.length===3),manualInspection:results.some(m=>m.viewMode==='inspect'&&m.passes?.some(p=>!p.controller)),automaticRestored:results.some((m,i)=>m.viewMode==='appearance'&&m.passes?.length===3&&results.slice(0,i).some(r=>r.viewMode==='inspect'&&r.passes?.some(p=>!p.controller)))};
  await fs.writeFile(path.join(__dirname,'../.test-temp/appearance-phase2-host.json'),JSON.stringify({vscode:vscode.version,verifiedAt:new Date().toISOString(),source:require('./fixtures/appearance/provenance.json').release,checks,results},null,2));
  if(Object.values(checks).every(Boolean)){assert.ok(results.every(m=>m.canvasHeight>100));clearTimeout(timer);sub.dispose();resolve();}
 }catch(e){clearTimeout(timer);sub.dispose();reject(e);}});});
 panel.dispose();
}
module.exports={run};
