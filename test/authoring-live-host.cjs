// Manual integration check against public releases; no credentials, builds or deployment.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),vscode=require('vscode');
const core=require('../src/core.cjs'),data=require('../src/authoring-data.cjs');
async function until(check,message){const deadline=Date.now()+60000;while(Date.now()<deadline){const value=await check();if(value)return value;await new Promise(r=>setTimeout(r,250));}throw Error(message);}
async function run(){
 const root=vscode.workspace.workspaceFolders[0].uri.fsPath,channel=process.env.BEDROCK_LIVE_CHANNEL==='preview'?'preview':'stable';
 const project=await core.loadProject(root);project.config.target=channel==='preview'?'preview':'release';project.config.targetVersion=channel==='preview'?'1.26.60':'1.26.50';await core.writeJson(path.join(root,'bedrock-project.json'),project.config);
 const extension=vscode.extensions.getExtension('bsavage81.bedrock-workbench'),original=vscode.window.showQuickPick;vscode.window.showQuickPick=async()=>undefined;
 try{
  await extension.activate();await vscode.commands.executeCommand('bedrock.refresh');await vscode.commands.executeCommand('bedrock.refreshAuthoringData');
  const status=await until(async()=>{const s=await vscode.commands.executeCommand('bedrock.authoringData');return s?.channel===channel&&s.version!=='bundled'&&!s.error&&s;},'No compatible public data snapshot activated');
  assert.equal(data.revision,status.version);assert.equal(data.reference.sourceChannel,channel);assert.ok(data.reference.tag);
  const response=await fetch(`https://raw.githubusercontent.com/bsavage81/bedrock-workbench-data/main/feeds/${channel}.json`);assert.ok(response.ok,`Anonymous ${channel} manifest HTTP ${response.status}`);
  const manifest=await response.json(),entry=manifest.snapshots.find(value=>value.id===status.version);assert.ok(entry,'Active snapshot absent from anonymous feed');
  if(channel==='preview')assert.ok(data.reference.sourceFallbacks?.every(value=>value.sourceTag&&value.previewExamples>0),'Preview fallback attribution is missing');
  const result={version:require('../package.json').version,timestamp:new Date().toISOString(),channel,activeVersion:status.version,source:status.source,mojangTag:data.reference.tag,anonymousManifest:true,nativeActivation:true,deploymentPerformed:false};
  await fs.writeFile(path.resolve(__dirname,'../HOST_VERIFICATION.json'),JSON.stringify(result,null,2));await fs.writeFile(path.resolve(__dirname,`../.test-temp/authoring-live-${channel}.json`),JSON.stringify(result,null,2));console.log('PUBLIC AUTHORING DATA HOST PASSED',result);
 }finally{vscode.window.showQuickPick=original;}
}
module.exports={run};
