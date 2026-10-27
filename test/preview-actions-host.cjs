const vscode=require('vscode'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
async function run(){
 await vscode.extensions.getExtension('bsavage81.bedrock-workbench').activate();
 const root=vscode.workspace.workspaceFolders[0].uri.fsPath,file=path.join(root,'RP/models/side-view.geo.json');await fs.mkdir(path.dirname(file),{recursive:true});
 await fs.writeFile(file,JSON.stringify({'minecraft:geometry':['geometry.first','geometry.second'].map((identifier,i)=>({description:{identifier,texture_width:32,texture_height:32},bones:[{name:'body',cubes:[{origin:[0,0,0],size:[i+1,2,3],uv:[0,0]}]}]}))},null,2));
 const document=await vscode.workspace.openTextDocument(file);await vscode.window.showTextDocument(document,vscode.ViewColumn.One);
 let lenses=[];for(let n=0;n<100;n++){lenses=await vscode.commands.executeCommand('vscode.executeCodeLensProvider',document.uri)||[];if(lenses.some(l=>l.command?.arguments?.[1]==='geometry.second'))break;await new Promise(r=>setTimeout(r,100));}
 const lens=lenses.find(l=>l.command?.arguments?.[1]==='geometry.second');assert.ok(lens,'Exact geometry needs a source action');
 const panel=await vscode.commands.executeCommand(lens.command.command,...lens.command.arguments);assert.ok(panel);
 const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Side-view render timed out')),20000);panel.webview.onDidReceiveMessage(m=>{if(m.type==='choices'){assert.equal(m.models.length,1);assert.match(m.models[0].label,/geometry.second/);}if(m.type==='rendered'){clearTimeout(timer);resolve(m);}});});assert.equal(result.faces,6);assert.equal(result.geometryId,'geometry.second');for(let n=0;n<100&&panel.viewColumn===undefined;n++)await new Promise(r=>setTimeout(r,50));assert.equal(panel.viewColumn,vscode.ViewColumn.Two);
 assert.ok(vscode.window.visibleTextEditors.some(editor=>editor.document===document&&editor.viewColumn===vscode.ViewColumn.One),'Source JSON remains beside viewer');
 const reused=await vscode.commands.executeCommand(lens.command.command,...lens.command.arguments);assert.equal(reused,panel);assert.equal(reused.viewColumn,vscode.ViewColumn.Two);
 const owner=await vscode.workspace.openTextDocument(path.join(root,'RP/entity/cod.json'));const ownerLenses=await vscode.commands.executeCommand('vscode.executeCodeLensProvider',owner.uri);assert.ok(ownerLenses.some(l=>l.command?.arguments?.[1]==='geometry.cod'),'Vanilla geometry reference needs the same source action');
 await fs.writeFile(path.join(__dirname,'../.test-temp/preview-actions-host.json'),JSON.stringify({vscode:vscode.version,verifiedAt:new Date().toISOString(),exactGeometry:'geometry.second',viewColumn:panel.viewColumn,sourceRemainsVisible:true,reusedPanel:true,vanillaReferenceAction:true,render:result},null,2));panel.dispose();
}
module.exports={run};
