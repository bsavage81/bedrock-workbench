// Real VS Code provider and editor insertion checks. Called by host.cjs.
const assert=require('node:assert/strict'),path=require('node:path'),vscode=require('vscode'),core=require('../src/core.cjs');
module.exports=async function(root){
 const uri=vscode.Uri.file(path.join(root,'RP/animations/molang-authoring.json'));
 await core.writeJson(uri.fsPath,{format_version:'1.8.0',animations:{'animation.workbench.molang':{bones:{body:{rotation:['2 + math.clam + 1',"math.clamp(q.property('a,b'), math.max(1,2), ",'q.']}}}}});
 const doc=await vscode.workspace.openTextDocument(uri),editor=await vscode.window.showTextDocument(doc,{preview:false});
 const offset=doc.getText().indexOf('math.clam')+'math.cl'.length;
 const choices=await vscode.commands.executeCommand('vscode.executeCompletionItemProvider',uri,doc.positionAt(offset));
 const clamp=choices.items.find(i=>(i.label.label||i.label)==='math.clamp'&&i.detail==='Molang');assert.ok(clamp,'Molang clamp completion missing');
 assert.equal(doc.getText(clamp.range),'math.clam','Middle-token completion must replace its suffix');
 assert.equal(clamp.insertText.value,'math.clamp(${1:value}, ${2:min}, ${3:max})');
 editor.selection=new vscode.Selection(clamp.range.start,clamp.range.end);
 await vscode.commands.executeCommand('editor.action.insertSnippet',{snippet:clamp.insertText.value});
 assert.ok(doc.getText().includes('2 + math.clamp(value, min, max) + 1'));
 assert.equal(doc.getText(editor.selection),'value','Cursor must select the first argument placeholder');
 await vscode.commands.executeCommand('leaveSnippet');
 await doc.save();
 const parameterPosition=doc.positionAt(doc.getText().indexOf('",\n',doc.getText().indexOf("q.property('a,b')")));
 const signature=await vscode.commands.executeCommand('vscode.executeSignatureHelpProvider',uri,parameterPosition,'(',true);
 assert.ok(signature?.signatures.some(s=>s.label==='math.clamp(value, min, max)'),'Molang signature missing');assert.equal(signature.activeParameter,2);
 const hovers=await vscode.commands.executeCommand('vscode.executeHoverProvider',uri,doc.positionAt(doc.getText().indexOf('math.clamp')+6));
 const molangHovers=hovers.filter(h=>h.contents.some(c=>String(c.value||c).includes('Returns: number')));assert.equal(molangHovers.length,1,'Molang hover must have one owner');assert.ok(molangHovers[0].contents.some(c=>String(c.value||c).includes('learn.microsoft.com')));
 const query=await vscode.commands.executeCommand('vscode.executeCompletionItemProvider',uri,doc.positionAt(doc.getText().lastIndexOf('q.')+2));assert.ok(query.items.some(i=>i.label==='q.anim_time'));assert.ok(!query.items.some(i=>i.label==='q.state_time'));
 const escapedUri=vscode.Uri.file(path.join(root,'BP/blocks/molang-escaped.json'));
 await require('node:fs/promises').writeFile(escapedUri.fsPath,'{"format_version":"1.21.0","minecraft:block":{"description":{"identifier":"test:molang"},"permutations":[{"condition":"\\u0071.block_state(\\n)","components":{}}]}}');
 const escaped=await vscode.workspace.openTextDocument(escapedUri);await vscode.window.showTextDocument(escaped,{preview:false});
 const emptyUri=vscode.Uri.file(path.join(root,'BP/blocks/molang-empty.json'));await core.writeJson(emptyUri.fsPath,{format_version:'1.21.0','minecraft:block':{description:{identifier:'test:molang_empty'},permutations:[{condition:'',components:{}}]}});
 const empty=await vscode.workspace.openTextDocument(emptyUri),emptyChoices=await vscode.commands.executeCommand('vscode.executeCompletionItemProvider',emptyUri,empty.positionAt(empty.getText().indexOf('""')+1));assert.ok(emptyChoices.items.some(i=>i.label==='math.clamp'),'Empty BP Molang field missing assistance');
 const referenceUri=vscode.Uri.file(path.join(root,'BP/blocks/molang-reference.json'));await core.writeJson(referenceUri.fsPath,{format_version:'1.21.0','minecraft:block':{description:{identifier:'test:molang_reference',states:{'test:active':[true,false]}},permutations:[{condition:"q.block_state('test:a') == true",components:{}}]}});
 const reference=await vscode.workspace.openTextDocument(referenceUri),statePosition=reference.positionAt(reference.getText().indexOf("test:a')")+6),stateChoices=await vscode.commands.executeCommand('vscode.executeCompletionItemProvider',referenceUri,statePosition),stateChoice=stateChoices.items.find(i=>i.label==='test:active'&&i.detail==='Molang');assert.ok(stateChoice,'Molang state argument reference missing');assert.equal(reference.getText(stateChoice.range),'test:a');
 // Leave a single definite error and verify its JSON source range and ownership.
 const edit=new vscode.WorkspaceEdit();edit.replace(escapedUri,new vscode.Range(escaped.positionAt(0),escaped.positionAt(escaped.getText().length)),'{"format_version":"1.21.0","minecraft:block":{"description":{"identifier":"test:molang"},"permutations":[{"condition":"\\u0071.block_state(\\n", "components":{}}]}}');assert.ok(await vscode.workspace.applyEdit(edit));
 const deadline=Date.now()+10000;let found;while(Date.now()<deadline){found=vscode.languages.getDiagnostics(escapedUri).filter(d=>d.code==='bedrock.molangSyntax');if(found.length)break;await new Promise(r=>setTimeout(r,100));}
 assert.equal(found.length,1);assert.equal(escaped.getText(found[0].range),'(','Diagnostic must select the raw JSON opening parenthesis');
 await escaped.save();await vscode.commands.executeCommand('bedrock.validate');
 assert.equal(vscode.languages.getDiagnostics(escapedUri).filter(d=>d.code==='bedrock.molangSyntax').length,1,'Project validation duplicated live Molang diagnostics');
 const report=await core.readJson(path.join(root,'.bedrock/validation-report.json'));assert.ok(report.issues.some(i=>i.file.toLowerCase()===escapedUri.fsPath.toLowerCase()&&i.code==='bedrock.molangSyntax'),'Saved report must retain Molang findings');
 await vscode.commands.executeCommand('workbench.action.closeAllEditors');
 return {completion:true,middleTokenInsertion:true,cursorPlacement:true,signatureHelp:true,learnHover:true,contextFiltering:true,emptyBehaviorField:true,stateArgumentReference:true,escapedDiagnostic:true,diagnosticOwnership:true};
};
