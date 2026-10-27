const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),vscode=require('vscode'),core=require('../src/core.cjs');
async function until(check,message){const deadline=Date.now()+20000;while(Date.now()<deadline){if(await check())return;await new Promise(r=>setTimeout(r,150));}throw Error(message);}
async function run(){
 const root=vscode.workspace.workspaceFolders[0].uri.fsPath;await vscode.extensions.getExtension('bsavage81.bedrock-workbench').activate();
 const uri=vscode.Uri.file(path.join(root,'BP/entities/event-forms.json'));
 await core.writeJson(uri.fsPath,{format_version:'1.26.50','minecraft:entity':{description:{identifier:'test:event_forms'},components:{'minecraft:trusting':{trust_event:{event:'test:done',target:'self'}},'minecraft:leashable':{on_leash:'test:done',on_unleash:{event:'test:done',target:'self'}}},events:{'test:done':{remove:{component_groups:['minecraft:ocelot_leashed']}}}}});
 const doc=await vscode.workspace.openTextDocument(uri);await vscode.window.showTextDocument(doc);
 const position=doc.positionAt(doc.getText().indexOf('minecraft:ocelot_leashed')+3);
 await until(()=>vscode.languages.getDiagnostics(uri).some(d=>d.code==='bedrock.entityReference'),'Entity reference diagnostic missing');
 let action;await until(async()=>{try{const actions=await vscode.commands.executeCommand('vscode.executeCodeActionProvider',uri,new vscode.Range(position,position));action=actions.find(a=>a.command?.command==='bedrock.ignoreReference'&&a.command.arguments[0].scope==='file');return !!action;}catch(error){if(error.name!=='Canceled'&&error.message!=='Canceled')throw error;}},'Entity mark-as-intended action missing');
 await vscode.commands.executeCommand(action.command.command,...action.command.arguments);
 await until(()=>!vscode.languages.getDiagnostics(uri).some(d=>d.code==='bedrock.entityReference'),'Intended entity reference did not clear');
 const config=await core.readJson(path.join(root,'bedrock-project.json'));assert.ok(config.validation.ignoredReferences.some(r=>r.type==='entity_group'&&r.value==='minecraft:ocelot_leashed'));
 const report=await core.readJson(path.join(root,'.bedrock/validation-report.json'));assert.ok(report.suppressedIssues.some(i=>i.reference?.value==='minecraft:ocelot_leashed'));
 const errors=vscode.languages.getDiagnostics(uri).filter(d=>d.severity===vscode.DiagnosticSeverity.Error);assert.deepEqual(errors.map(d=>d.message),[]);
 for(const field of ['trust_event','on_leash','on_unleash']){
  const at=doc.positionAt(doc.getText().indexOf('"'+field+'"')+2);
  await until(async()=>{try{const hovers=await vscode.commands.executeCommand('vscode.executeHoverProvider',uri,at);return hovers.some(h=>h.contents.some(c=>String(c.value||c).includes('Microsoft Learn')));}catch(error){if(error.name!=='Canceled'&&error.message!=='Canceled')throw error;}},'Event hover missing: '+field);
 }
 await fs.writeFile(path.resolve(__dirname,'../HOST_VERIFICATION.json'),JSON.stringify({eventForms:true,intendedEntityReference:true,deploymentPerformed:false},null,2)+'\n');
 console.log('EVENT FORMS HOST PASSED');
}
module.exports={run};
