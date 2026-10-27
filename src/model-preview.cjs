// Static preview discovery uses the same saved resource inventory as navigation.
const path = require('node:path');
const fs = require('node:fs/promises');
const core = require('./core.cjs');
const content = require('./content.cjs');
const previewProperties=require('./preview-properties.cjs');
function geometries(data) {
  return Array.isArray(data?.['minecraft:geometry']) ? data['minecraft:geometry'] : Object.entries(data || {}).filter(([id]) => id.startsWith('geometry.')).map(([id,g]) => ({...g,description:{identifier:id,texture_width:g.texturewidth,texture_height:g.textureheight}}));
}
function bindings(index) {
  const result=[];
  for(const doc of index.documents.values()) {
    for(const root of ['minecraft:client_entity','minecraft:attachable']) {
      const d=doc.data?.[root]?.description;if(!d)continue;
      const gs=typeof d.geometry==='string'?{default:d.geometry}:d.geometry||{},ts=typeof d.textures==='string'?{default:d.textures}:d.textures||{};
      for(const [alias,id]of Object.entries(gs))result.push({owner:d.identifier||doc.relative,ownerFile:doc.file,alias,id,textures:Object.entries(ts).map(([alias,id])=>({alias,id})),warning:'Static alias selection; render controllers, visibility and Molang are not evaluated.'+(doc.previewLabel?'\nOwner source: '+doc.previewLabel:'')});
    }
    const block=doc.data?.['minecraft:block'];if(!block)continue;
    for(const [i,c]of [block.components,...(block.permutations||[]).map(p=>({...block.components,...p.components}))].entries()) {
      const g=c?.['minecraft:geometry'],id=typeof g==='string'?g:g?.identifier;if(!id)continue;
      const textures=[];
      for(const [alias,m]of Object.entries(c['minecraft:material_instances']||{}))for(const atlasFile of index.values('terrain_texture').get(m.texture)||[]) {
        const entry=index.documents.get(atlasFile)?.data?.texture_data?.[m.texture]?.textures;
        for(const t of Array.isArray(entry)?entry:[entry])if(typeof(t?.path||t)==='string')textures.push({alias,id:t.path||t});
      }
      result.push({owner:`${block.description?.identifier} (${i?'permutation '+i:'base'})`,ownerFile:doc.file,alias:'block',id,textures,warning:'Block preview uses one selected material texture across all faces. Permutation conditions, material instances and block transformations are not evaluated.'});
    }
  }return result;
}
function candidates(index,file,{propertyValues}={}) {
  const all=bindings(index), models=[];
  for(const [id,files]of index.values('geometry'))for(const geometryFile of files) {
    const owners=all.filter(b=>b.id===id);
    for(const b of owners.length?owners:[{owner:'Unbound geometry',id,textures:[],warning:'No owning client entity, attachable or block binding found.'}]) {
      const textures=b.textures.flatMap(t=>{
        const files=typeof t.id==='string'?content.referenceDefinitions(index,'texture',t.id).map(d=>d.file):[];
        return (files.length?files:[undefined]).map(textureFile=>({...t,file:textureFile}));
      });
      if(geometryFile===file||b.ownerFile===file||textures.some(t=>t.file===file)){
        const properties=previewProperties.properties(index,b.owner),values=previewProperties.inputs(properties.fields,propertyValues?.get(b.ownerFile));
        const inference=require('./preview-render-bindings.cjs').infer(index,b,values);
        const ownerLabel=index.documents.get(b.ownerFile)?.previewLabel;
        models.push({...b,geometryFile,textures,inference,properties,values,warning:(inference?inference.message+(ownerLabel?'\nOwner source: '+ownerLabel:''):b.warning)+(properties.warning?'\n'+properties.warning:'')});
      }
    }
  }return models;
}
async function safeRead(project,file) {
  const resolved=await fs.realpath(file);
  const roots=await Promise.all(Object.values(project.packs).map(root=>fs.realpath(root).catch(()=>undefined)));
  if(!roots.some(root=>root&&core.inside(root,resolved)))throw Error('Preview asset is outside the configured source packs.');
  if((await fs.stat(resolved)).size>16*1024*1024)throw Error('Preview asset exceeds the 16 MiB limit.');
  return fs.readFile(resolved);
}
function defaultTexture(model,file){
  const textures=model?.textures||[],direct=file?textures.findIndex(t=>t.file===file):-1;if(direct>=0)return direct;
  const allowed=model?.inference?.complete?model.inference.aliases:undefined;
  const pool=allowed?textures.filter(t=>allowed.includes(t.alias)):textures;
  const alias=pool.some(t=>t.alias==='default')?'default':pool[0]?.alias;
  const preferred=textures.map((t,i)=>t.alias===alias?i:-1).filter(i=>i>=0);
  // Multiple files for one alias remain an explicit choice, not an ordering rule.
  return preferred.length===1?preferred[0]:-1;
}
function attach(vscode,context,getProject,output) {
  const panels=new Set();let timer;
  require('./preview-actions.cjs').attach(vscode,context,getProject);
  async function open(uri,beside=false,geometryId) {
    try {
      if(!vscode.workspace.isTrusted)throw Error('Model previews require a trusted workspace.');
      const project=getProject();if(!project)throw Error('Open a Bedrock Workbench project first.');
      uri=uri||vscode.window.activeTextEditor?.document.uri||vscode.window.tabGroups?.activeTabGroup.activeTab?.input?.uri;
      if(uri?.scheme!=='file')throw Error('Select a local geometry, texture or owner file.');
      if(typeof geometryId!=='string')geometryId=undefined;
      const existing=beside&&[...panels].find(s=>s.file===uri.fsPath&&s.geometryId===geometryId);
      if(existing){existing.panel.reveal(existing.panel.viewColumn||vscode.ViewColumn.Beside);await refresh(existing);return existing.panel;}
      const state={project,file:uri.fsPath,geometryId,manualOverride:/\.(png|tga|jpe?g)$/i.test(uri.fsPath)};
      const panel=vscode.window.createWebviewPanel('bedrock.modelPreview','Bedrock Model Preview',beside?vscode.ViewColumn.Beside:vscode.ViewColumn.Active,{enableScripts:true,localResourceRoots:[vscode.Uri.joinPath(context.extensionUri,'media')]});
      state.panel=panel;panels.add(state);panel.onDidDispose(()=>panels.delete(state));
      const nonce=require('node:crypto').randomBytes(16).toString('hex');
      const src=panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri,'media','model-preview.js'));
      panel.webview.html=`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; img-src data:; style-src 'nonce-${nonce}';"><style nonce="${nonce}">body{margin:0;color:var(--vscode-foreground);background:var(--vscode-editor-background);font:13px var(--vscode-font-family)}header{padding:10px;max-height:50vh;overflow:auto;box-sizing:border-box}select,button,input{margin:4px;color:var(--vscode-input-foreground);background:var(--vscode-input-background);max-width:95%}canvas{display:block}#status{white-space:pre-wrap}</style></head><body><header><label>Model / owner <select id="models"></select></label><label>Texture <select id="textures"></select></label><button id="reset">Reset camera</button><div>Drag: rotate · Right drag: pan · Wheel: zoom</div><div id="status" role="status">Resolving project and vanilla resources…</div></header><script nonce="${nonce}" src="${src}"></script></body></html>`;
      panel.webview.onDidReceiveMessage(async message=>{
        if(message?.type==='ready')await refresh(state);
        if(message?.type==='select'&&Number.isInteger(message.model)&&Number.isInteger(message.texture)) {state.manualTexture=message.manual!==false;if(state.manualTexture)state.manualOverride=true;state.selection=message;await send(state);}
        if(message?.type==='mode'&&typeof message.manual==='boolean'){state.manualOverride=message.manual;state.manualTexture=false;await refresh(state);}
        if(message?.type==='controllerChoice'&&typeof message.controller==='string'&&typeof message.choice==='string'&&vscode.workspace.isTrusted){const m=state.models?.[state.selection?.model];if(!m)return;state.controllerChoices||=new Map();const choices=state.controllerChoices.get(m.ownerFile)||Object.create(null);choices[message.controller]=message.choice;state.controllerChoices.set(m.ownerFile,choices);await send(state);}
        if(message?.type==='properties'&&vscode.workspace.isTrusted&&message.values&&typeof message.values==='object'&&!Array.isArray(message.values)){
          const m=state.models?.[state.selection?.model];if(!m||!m.properties.fields.length&&!message.reset)return;
          if(message.reset)state.controllerChoices?.delete(m.ownerFile);
          state.propertyValues||=new Map();const previous=message.reset?{}:state.propertyValues.get(m.ownerFile)||{};state.propertyValues.set(m.ownerFile,previewProperties.inputs(m.properties.fields,{...previous,...message.values}));state.followOwner=m.ownerFile;await refresh(state,true);
        }
      });
      return panel;
    }catch(e){output.warn(`Model preview: ${e.message}`);vscode.window.showErrorMessage(`Model preview: ${e.message}`);}
  }
  async function refresh(state,propertyChange=false) {
    try {
      if(!vscode.workspace.isTrusted)return;
      const revision=state.revision=(state.revision||0)+1;
      state.sendVersion=(state.sendVersion||0)+1;
      const previous=state.models?.[state.selection?.model],previousTexture=previous?.textures[state.selection?.texture];
      const index=await content.scan(state.project);await require('./preview-vanilla.cjs').supplement(index,{file:state.file});if(state.revision!==revision||!panels.has(state))return;
      state.index=index;state.models=candidates(state.index,state.followOwner||state.file,{propertyValues:state.propertyValues}).filter(m=>state.followOwner||!state.geometryId||m.id===state.geometryId);
      const selected=state.models.findIndex(m=>previous&&m.geometryFile===previous.geometryFile&&m.id===previous.id&&m.ownerFile===previous.ownerFile&&m.alias===previous.alias&&m.owner===previous.owner);
      let model=selected>=0?selected:state.models.length===1||!state.manualOverride&&state.models.length&&state.models[0].ownerFile&&state.models.every(m=>m.ownerFile===state.models[0].ownerFile)?0:-1;
      if(propertyChange||state.followOwner&&state.models[model]?.inference?.active===false){const matches=state.models.map((m,i)=>m.inference?.active===true?i:-1).filter(i=>i>=0);if(matches.length===1)model=matches[0];}
      const m=state.models[model];
      const texture=m?.textures.findIndex(t=>previousTexture&&t.alias===previousTexture.alias&&t.id===previousTexture.id&&t.file===previousTexture.file)??-1;
      const keepNeutral=state.manualTexture&&selected>=0&&state.selection?.texture===-1;
      state.selection={model,texture:state.manualTexture&&texture>=0?texture:keepNeutral?-1:defaultTexture(m,state.file)};
      const sourceLabel=file=>state.index.previewAssets?.get(file)?.label||path.relative(state.project.root,file);
      await state.panel.webview.postMessage({type:'choices',manual:!!state.manualOverride,selection:state.selection,models:state.models.map(m=>({owner:m.owner,ownerKey:m.ownerFile||m.geometryFile,label:`${m.id} — ${m.owner} — ${sourceLabel(m.geometryFile)}`,defaultTexture:defaultTexture(m,state.file),textures:m.textures.map(t=>`${t.alias}: ${t.id}${m.inference?.aliases.includes(t.alias)?' (controller match)':''}${t.file?' — '+sourceLabel(t.file):' (missing)'}`)}))});
      if(!state.models.length)await state.panel.webview.postMessage({type:'error',message:['No project geometry bindings found for this file. Unresolved vanilla geometry requires compatible Mojang samples or a selected vanilla pack.',state.geometryId?`Requested saved geometry: ${state.geometryId}. Save changed bindings or geometry before previewing.`:'',...state.index.previewWarnings].filter(Boolean).join('\n')});
      else if(state.selection.model>=0)await send(state);
    }catch(e){await state.panel.webview.postMessage({type:'error',message:e.message});}
  }
  async function send(state) {
    const sendVersion=state.sendVersion=(state.sendVersion||0)+1,index=state.index,selection={...state.selection};
    try {
      if(!vscode.workspace.isTrusted)return;
      const m=state.models?.[selection.model];if(!m)return;
      if(!state.manualOverride&&m.ownerFile&&Array.isArray(m.inference?.passes)){await sendAutomatic(state,m,sendVersion);return;}
      await state.panel.webview.postMessage({type:'propertyControls',fields:m.properties.fields,values:m.values});
      const vanilla=require('./preview-vanilla.cjs');
      const read=file=>index.previewAssets?.has(file)?vanilla.read(index,file):safeRead(state.project,file);
      await read(m.geometryFile);
      let geometry=geometries(index.documents.get(m.geometryFile)?.data).find(g=>g.description?.identifier===m.id);
      const visibility=previewProperties.visible(geometry,m.inference?.rules||[],m.values);
      const hiddenBones=Object.keys(visibility.visibility).filter(name=>visibility.visibility[name]===false);
      if(m.inference?.active===false)geometry={...geometry,bones:[]};
      const t=m.textures[selection.texture];let texture,warning=[m.warning,...index.previewWarnings||[]].filter(Boolean).join('\n');
      if(state.manualOverride)warning='Manual geometry/texture inspection: assets are independent of the controller render plan.\n'+warning;
      if(m.properties.fields.length)warning+='\nClient-synced property values are preview inputs, not live entity state.';
      if(m.inference?.rules?.length)warning+='\nProperty-based part visibility applied.';
      if(visibility.warning)warning+='\n'+visibility.warning;
      if(m.inference?.active===false)warning+='\nSelected properties do not select this geometry. Choose a matching model/owner.';
      const provenance=index.previewAssets?.get(m.geometryFile)?.label;if(provenance)warning+='\nGeometry source: '+provenance;
      if(t?.file){try{const bytes=await read(t.file);texture=require('./preview-images.cjs').image(bytes,t.file).uri;const source=index.previewAssets?.get(t.file)?.label;if(source)warning+='\nTexture source: '+source;}catch(e){warning+='\nSelected texture unavailable: '+e.message;}}
      else warning+=t?' Selected texture is missing.':' Choose a texture; neutral geometry is shown until then.';
      if(state.sendVersion!==sendVersion||!vscode.workspace.isTrusted)return;
      await state.panel.webview.postMessage({type:'model',geometry,geometryId:m.id,texture,textureAlias:t?.alias,textureId:t?.id,visibility:visibility.visibility,hiddenBones,properties:m.values,warning});
    }catch(e){if(state.sendVersion===sendVersion)await state.panel.webview.postMessage({type:'error',message:e.message});}
  }
  async function sendAutomatic(state,anchor,sendVersion){
    const index=state.index,{plan,visibilityReferences}=require('./preview-plan.cjs');
    const models=candidates(index,anchor.ownerFile,{propertyValues:state.propertyValues}),resolved=plan(models,{choices:state.controllerChoices?.get(anchor.ownerFile)}),passes=[],warnings=[...resolved.warnings],references=resolved.references;
    for(const model of models)if(model.inference?.complete===false&&model.inference.active!==false)warnings.push(model.inference.message);
    const read=file=>index.previewAssets?.has(file)?require('./preview-vanilla.cjs').read(index,file):safeRead(state.project,file);
    for(const pass of resolved.passes){
      const m=pass.model;let texture;
      try{if(!pass.texture.file)throw Error('Texture asset is missing.');texture=require('./preview-images.cjs').image(await read(pass.texture.file),pass.texture.file);if(texture.transparent)continue;}catch(e){warnings.push(`${pass.controller}: ${e.message}`);if(resolved.passes.length>1)continue;}
      await read(m.geometryFile);const geometry=geometries(index.documents.get(m.geometryFile)?.data).find(g=>g.description?.identifier===m.id);
      const visibility=previewProperties.visible(geometry,pass.rules,m.values);if(visibility.warning)warnings.push(visibility.warning);
      for(const name of visibilityReferences(geometry,pass.rules,m.values))references.add(name);
      passes.push({geometry,geometryId:m.id,texture:texture?.uri,textureAlias:pass.texture.alias,textureId:pass.texture.id,visibility:visibility.visibility,hiddenBones:Object.keys(visibility.visibility).filter(n=>visibility.visibility[n]===false),controller:pass.controller});
    }
    if(state.sendVersion!==sendVersion||!vscode.workspace.isTrusted)return;
    const fields=anchor.properties.fields.filter(f=>references.has(f.name));
    await state.panel.webview.postMessage({type:'propertyControls',fields,values:anchor.values,variants:resolved.variants});
    const warning=[`Controller-driven preview: ${anchor.owner}.`,...passes.map(p=>`${p.controller}: ${p.geometryId} · ${p.textureAlias}`),...new Set(warnings),...index.previewWarnings||[],'Only inputs used by reachable controller branches are shown. Static preview inputs; no live game state or general runtime scripts.',passes.length?'':'No controller pass is resolved. Choose appearance inputs or enable manual inspection.'].filter(Boolean).join('\n');
    await state.panel.webview.postMessage({type:'model',...passes[0],geometry:passes[0]?.geometry||{bones:[]},passes,properties:anchor.values,warning});
  }
  context.subscriptions.push(vscode.commands.registerCommand('bedrock.openModelPreview',uri=>open(uri)),vscode.commands.registerCommand('bedrock.openModelPreviewBeside',(uri,geometryId)=>open(uri,true,geometryId)));
  const watcher=vscode.workspace.createFileSystemWatcher('**/*');
  const changed=uri=>{if(!panels.size||!getProject()||!content.fileKind(getProject(),uri.fsPath))return;clearTimeout(timer);timer=setTimeout(()=>{for(const s of panels)refresh(s);},250);};
  context.subscriptions.push(watcher,watcher.onDidChange(changed),watcher.onDidCreate(changed),watcher.onDidDelete(changed),{dispose(){clearTimeout(timer);for(const s of panels)s.panel.dispose();}});
}
module.exports={geometries,bindings,candidates,safeRead,defaultTexture,attach};
