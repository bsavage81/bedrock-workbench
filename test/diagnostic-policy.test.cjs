const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {visible}=require('../src/diagnostic-policy.cjs');
test('native JSON owns open-file syntax only; reports, closed files and other diagnostics stay available',()=>{
  const file=path.resolve('fixture/test.json'),document={uri:{scheme:'file',fsPath:file},languageId:'json'};
  let enabled=true,extension=true;
  const vscode={workspace:{textDocuments:[document],getConfiguration:()=>({get:()=>enabled})},extensions:{getExtension:()=>extension?{}:undefined}};
  const syntax={code:'bedrock.jsonSyntax'};
  assert.equal(visible(vscode,file,syntax),false);
  assert.equal(visible(vscode,file,{code:'bedrock.missingReference'}),true);
  assert.equal(visible(vscode,file,{message:'TypeScript error'}),true);
  enabled=false;assert.equal(visible(vscode,file,syntax),true);
  enabled=true;extension=false;assert.equal(visible(vscode,file,syntax),true);
  extension=true;document.languageId='plaintext';assert.equal(visible(vscode,file,syntax),true);
  vscode.workspace.textDocuments=[];assert.equal(visible(vscode,file,syntax),true);
});
