const path=require('node:path');
function nativeOwnsSyntax(vscode,file) {
  const normalize=value=>process.platform==='win32'?path.resolve(value).toLowerCase():path.resolve(value);
  const document=vscode.workspace.textDocuments.find(d=>d.uri.scheme==='file'&&normalize(d.uri.fsPath)===normalize(file)&&['json','jsonc'].includes(d.languageId));
  if(!document)return false;
  if(vscode.extensions?.getExtension && !vscode.extensions.getExtension('vscode.json-language-features'))return false;
  return vscode.workspace.getConfiguration?.('json',document.uri).get('validate.enable',true)!==false;
}
function visible(vscode,file,issue) {return issue.code!=='bedrock.jsonSyntax'||!nativeOwnsSyntax(vscode,file);}
module.exports={nativeOwnsSyntax,visible};
