const vscode=require('vscode'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
async function run(){
 await vscode.extensions.getExtension('bsavage81.bedrock-workbench').activate();const root=vscode.workspace.workspaceFolders[0].uri.fsPath,results=[];
 const panel=await vscode.commands.executeCommand('bedrock.openModelPreviewBeside',vscode.Uri.file(path.join(root,'RP/models/entity/savage_bull.geo.json')),'geometry.bull');assert.ok(panel);
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Native property interaction verification timed out')),600000);panel.webview.onDidReceiveMessage(async m=>{if(m.type==='renderError'){clearTimeout(timer);reject(Error(m.message));}if(m.type!=='rendered')return;
  assert.equal(m.textured,true);const horn=m.properties['savage:horns'];assert.ok(['basic','curve','long'].includes(horn));assert.ok(m.hiddenBones.some(n=>/Horn$/.test(n)));assert.ok(!m.hiddenBones.some(n=>n.toLowerCase().endsWith(horn+'horn')));results.push(m);await fs.writeFile(path.join(__dirname,'../.test-temp/bull-properties-host.json'),JSON.stringify({vscode:vscode.version,verifiedAt:new Date().toISOString(),results},null,2));
  if(new Set(results.map(r=>r.properties['savage:horns'])).size===3&&results.some(r=>r.geometryId==='geometry.bull.warm')&&results.some(r=>r.geometryId==='geometry.bull.cold')){clearTimeout(timer);resolve();}
 });});panel.dispose();
}
module.exports={run};
