// Native saved-file refresh/render acknowledgements; no UI interaction or visual-parity claim.
const vscode=require('vscode'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
async function run(){
 await vscode.extensions.getExtension('bsavage81.bedrock-workbench').activate();
 const root=vscode.workspace.workspaceFolders[0].uri.fsPath,write=async(file,data)=>{const target=path.join(root,file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,JSON.stringify(data));};
 const behavior=value=>({'minecraft:entity':{description:{identifier:'test:uv',properties:{alternate:{type:'bool',client_sync:true,default:value}}}}});
 await write('BP/entities/uv.json',behavior(false));
 await write('RP/entity/uv.json',{'minecraft:client_entity':{description:{identifier:'test:uv',geometry:{default:'geometry.uv'},materials:{default:'entity_alphatest'},textures:{base:'textures/uv',alternate:'textures/alternate'},render_controllers:['controller.render.appearance_test']}}});
 await write('RP/render_controllers/appearance.json',{render_controllers:{'controller.render.appearance_test':{geometry:'Geometry.default',materials:[{'*':'Material.default'}],textures:["q.property('alternate') ? Texture.alternate : Texture.base"]}}});
 const {PNG}=require('pngjs'),png=new PNG({width:48,height:8});for(let i=0;i<png.data.length;i+=4)png.data.set([30,200,70,255],i);await fs.writeFile(path.join(root,'RP/textures/alternate.png'),PNG.sync.write(png));
 const panel=await vscode.commands.executeCommand('bedrock.openModelPreviewBeside',vscode.Uri.file(path.join(root,'RP/entity/uv.json'))),results=[];
 try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Appearance saved-refresh render timed out')),45000);let changed=false;const sub=panel.webview.onDidReceiveMessage(async m=>{try{if(m.type==='renderError')throw Error(m.message);if(m.type!=='rendered')return;assert.ok(m.faces>0);assert.equal(m.textured,true);results.push(m);if(!changed){assert.equal(m.textureAlias,'base');changed=true;await write('BP/entities/uv.json',behavior(true));}else if(m.textureAlias==='alternate'){assert.equal(m.properties.alternate,true);clearTimeout(timer);sub.dispose();resolve();}}catch(e){clearTimeout(timer);sub.dispose();reject(e);}});});
 await fs.writeFile(path.join(__dirname,'../.test-temp/appearance-resolution-host.json'),JSON.stringify({vscode:vscode.version,verifiedAt:new Date().toISOString(),scope:'saved-file refresh and render acknowledgement; no visual or interactive-control verification',results},null,2));}finally{panel.dispose();}
}
module.exports={run};
