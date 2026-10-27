// Native webview assertions, including actual image decode and WebGL draw.
const vscode=require('vscode'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
async function run(){
 const extension=vscode.extensions.getExtension('bsavage81.bedrock-workbench');await extension.activate();
 const root=vscode.workspace.workspaceFolders[0].uri.fsPath,results=[];
 for(const name of ['cod','salmon','salmon-default','salmon-ocean','salmon-river']){
  const panel=await vscode.commands.executeCommand('bedrock.openModelPreviewBeside',vscode.Uri.file(path.join(root,'RP/entity/'+name+'.json')));assert.ok(panel,'Preview command must return its native panel');
  const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(name+' native textured render timed out')),45000);panel.webview.onDidReceiveMessage(message=>{if(message.type==='renderError'){clearTimeout(timer);reject(Error(message.message));}if(message.type==='rendered'&&message.textured){clearTimeout(timer);resolve(message);}});});
  assert.ok(result.faces>0);assert.equal(result.uvWidth,32);assert.equal(result.uvHeight,32);assert.match(result.warning,/Geometry source: Mojang samples/);assert.equal(result.textureAlias,name==='salmon'?'ocean':'default');assert.equal(result.textureId,name==='cod'?'textures/entity/fish/cod':'textures/entity/fish/savage_salmon-'+(name==='salmon-river'?'river':'ocean'));results.push({name,...result});panel.dispose();
 }
 await fs.writeFile(path.join(__dirname,'../.test-temp/vanilla-preview-host.json'),JSON.stringify({vscode:vscode.version,verifiedAt:new Date().toISOString(),results},null,2));
}
module.exports={run};
