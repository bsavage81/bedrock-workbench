const vscode=require('vscode'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
async function run(){
 await vscode.extensions.getExtension('bsavage81.bedrock-workbench').activate();
 const root=vscode.workspace.workspaceFolders[0].uri.fsPath,results=[];
 for(const [name,id,alias]of [['cod','geometry.savage_fish_egg','egg'],['cod','geometry.savage_fry','fry'],['salmon','geometry.savage_fish_egg','egg'],['salmon','geometry.savage_fry','fry'],['salmon','geometry.salmon','ocean'],['cow','geometry.cow.warm','warm'],['cow','geometry.cow.cold','cold']]){
  const panel=await vscode.commands.executeCommand('bedrock.openModelPreviewBeside',vscode.Uri.file(path.join(root,'RP/entity/'+name+'.json')),id);assert.ok(panel);
  const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(name+': '+id+' timed out')),45000);panel.webview.onDidReceiveMessage(m=>{if(m.type==='renderError'){clearTimeout(timer);reject(Error(m.message));}if(m.type==='rendered'){clearTimeout(timer);resolve(m);}});});
  assert.equal(result.geometryId,id);assert.equal(result.textureAlias,alias);assert.equal(result.textured,true);assert.ok(result.faces>0);assert.match(result.warning,/Render controller matches/);if(id==='geometry.salmon')assert.match(result.warning,/Runtime variant/);results.push({name,...result});panel.dispose();
 }
 await fs.writeFile(path.join(__dirname,'../.test-temp/controller-preview-host.json'),JSON.stringify({vscode:vscode.version,verifiedAt:new Date().toISOString(),results},null,2));
}
module.exports={run};
