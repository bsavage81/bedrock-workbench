const vscode=require('vscode'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
async function run(){
 await vscode.extensions.getExtension('bsavage81.bedrock-workbench').activate();const root=vscode.workspace.workspaceFolders[0].uri.fsPath,results=[];
 for(const [file,expected]of [['RP/entity/savage_stone_pellet_projectile.entity.json','geometry.savage.slingshot_pellet'],['RP/models/entity/savage_bull.geo.json','geometry.bull']]){
  const panel=await vscode.commands.executeCommand('bedrock.openModelPreviewBeside',vscode.Uri.file(path.join(root,file)));const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Native preview timed out')),45000);panel.webview.onDidReceiveMessage(m=>{if(m.type==='renderError'){clearTimeout(timer);reject(Error(m.message));}if(m.type==='rendered'){clearTimeout(timer);resolve(m);}});});assert.equal(result.geometryId,expected);assert.equal(result.textured,true);assert.ok(result.canvasHeight>150);results.push({file,...result});panel.dispose();
 }
 const panel=await vscode.commands.executeCommand('bedrock.openModelPreviewBeside',vscode.Uri.file(path.join(root,'RP/models/entity/savage_koi.geo.json')));
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Koi interaction test timed out')),600000);panel.webview.onDidReceiveMessage(async m=>{
  if(m.type==='renderError'){clearTimeout(timer);reject(Error(m.message));}if(m.type!=='rendered')return;
  assert.equal(m.textured,true);assert.ok(m.canvasHeight>150);if(m.properties['savage:life_stage']==='adult'){assert.ok(m.passes.some(p=>p.textureAlias.startsWith('base_')));assert.ok(m.passes.every(p=>p.geometryId==='geometry.koi'));}
  results.push({file:'koi',...m});await fs.writeFile(path.join(__dirname,'../.test-temp/appearance-preview-host.json'),JSON.stringify({vscode:vscode.version,verifiedAt:new Date().toISOString(),results},null,2));
  if(results.some(r=>r.properties?.['savage:base_color']==='wild')&&results.some(r=>r.properties?.['savage:life_stage']==='egg')&&results.some(r=>r.properties?.['savage:fins']==='long')&&results.some(r=>r.properties?.['savage:pattern1']===0)){clearTimeout(timer);resolve();}
 });});panel.dispose();
}
module.exports={run};
