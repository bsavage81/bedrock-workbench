// Native VS Code host smoke checks; deliberately never build or deploy packs.
const vscode=require('vscode'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
async function run(){
 const extension=vscode.extensions.getExtension('bsavage81.bedrock-workbench');await extension.activate();
 const root=vscode.workspace.workspaceFolders[0].uri.fsPath;
 for(let n=0;n<100;n++){try{const p=await vscode.commands.executeCommand('bedrock.openModelPreviewBeside',vscode.Uri.file(path.join(root,process.env.BEDROCK_PREVIEW_FILE||'RP/models/uv.geo.json')));if(p)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const commands=await vscode.commands.getCommands(true);assert.ok(commands.includes('bedrock.openModelPreviewBeside'));
 // Keep the development host alive for native visual inspection.
 await fs.writeFile(path.join(__dirname,'../.test-temp/preview-host-ready.json'),JSON.stringify({nativeHost:vscode.version,commands:true,date:new Date().toISOString()}));
 await new Promise(r=>setTimeout(r,600000));
}
module.exports={run};
