const path=require('node:path');const json=require('jsonc-parser');const versions=require('./format-versions.cjs');const compatibility=require('./component-compatibility.cjs');
function fixes(document,project){
 const findings=[...compatibility.issues(document,project),...versions.issues(document,project)],result=[];
 for(const issue of findings){for(const fix of issue.fixes||[])result.push({...fix,offset:issue.offset,length:issue.length});if(issue.experiment&&require('./experiments.cjs').available(project.config).some(e=>e.id===issue.experiment.id&&!e.legacy))result.push({title:`Enable project requirement: ${issue.experiment.label} (also enable in world)`,experiment:issue.experiment,offset:issue.offset,length:issue.length});}
 const required=findings.flatMap(issue=>{const match=/requires? format_version (\d+\.\d+\.\d+)/.exec(issue.message);return match?[{issue,version:match[1]}]:[];});
 if(required.length){const minimum=required.map(r=>r.version).sort(require('./releases.cjs').compareVersions).at(-1),target=project.config.targetVersion;const format=json.findNodeAtLocation(document.tree,['format_version']);if(format&&versions.version(target)&&require('./releases.cjs').compareVersions(minimum,target)<=0)for(const {issue}of required)result.push({title:`Raise this file's format_version to ${minimum} (may change behavior)`,offset:issue.offset,length:issue.length,edits:[{offset:format.offset,length:format.length,text:JSON.stringify(minimum)}]});}
 return result;
}
async function codeActions(vscode,document,range,data,project){const actions=[],seen=new Set();for(const fix of fixes(data,project)){
 if(!range.intersection(new vscode.Range(document.positionAt(fix.offset),document.positionAt(fix.offset+fix.length))))continue;
 if(seen.has(fix.title))continue;seen.add(fix.title);
 const action=new vscode.CodeAction(fix.title,vscode.CodeActionKind.QuickFix);action.edit=new vscode.WorkspaceEdit();
 if(fix.experiment){const uri=vscode.Uri.file(path.join(project.root,'bedrock-project.json')),config=await vscode.workspace.openTextDocument(uri),text=config.getText();for(const edit of json.modify(text,['experimentalGameplay',fix.experiment.id],true,{formattingOptions:{insertSpaces:true,tabSize:2}}))action.edit.replace(uri,new vscode.Range(config.positionAt(edit.offset),config.positionAt(edit.offset+edit.length)),edit.content);}
 else for(const edit of fix.edits||[])action.edit.replace(document.uri,new vscode.Range(document.positionAt(edit.offset),document.positionAt(edit.offset+edit.length)),edit.text);
 actions.push(action);
 }return actions;
}
module.exports={fixes,codeActions};
