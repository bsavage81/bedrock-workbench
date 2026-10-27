const path=require('node:path');
function nativeOwnsSyntax(vscode,file) {
  const normalize=value=>process.platform==='win32'?path.resolve(value).toLowerCase():path.resolve(value);
  const document=vscode.workspace.textDocuments.find(d=>d.uri.scheme==='file'&&normalize(d.uri.fsPath)===normalize(file)&&['json','jsonc'].includes(d.languageId));
  if(!document)return false;
  if(vscode.extensions?.getExtension && !vscode.extensions.getExtension('vscode.json-language-features'))return false;
  return vscode.workspace.getConfiguration?.('json',document.uri).get('validate.enable',true)!==false;
}
function liveOwnsMolang(vscode,file){const key=value=>process.platform==='win32'?path.resolve(value).toLowerCase():path.resolve(value);return /\.json$/i.test(file)&&vscode.workspace.textDocuments.some(d=>d.uri.scheme==='file'&&key(d.uri.fsPath)===key(file)&&['json','jsonc'].includes(d.languageId));}
function visible(vscode,file,issue) {if(String(issue.code).startsWith('bedrock.molang')&&liveOwnsMolang(vscode,file))return false;return issue.code!=='bedrock.jsonSyntax'||!nativeOwnsSyntax(vscode,file);}
module.exports={nativeOwnsSyntax,visible};
