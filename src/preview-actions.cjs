const json=require('jsonc-parser'),content=require('./content.cjs');
// CodeLens uses the live editor text, but the viewer deliberately renders saved
// resources. Keep declaration/reference ranges independent of the disk index.
function geometryLinks(text,kind){
 const tree=json.parseTree(text.replace(/^\uFEFF/,' ')),result=[];if(!tree)return result;
 function visit(node){
  if(node.type==='string'){
   const keys=json.getNodePath(node),isKey=node.parent?.type==='property'&&node.parent.children[0]===node;
   const modern=!isKey&&keys.length===4&&keys[0]==='minecraft:geometry'&&typeof keys[1]==='number'&&keys[2]==='description'&&keys[3]==='identifier';
   const legacy=isKey&&keys.length===1&&node.value.startsWith('geometry.');
   const reference=!isKey&&content.referenceKind(keys,node.value,kind)==='geometry';
   if((modern||legacy||reference)&&/^(?:minecraft:)?geometry\.[\w.:-]+$/.test(node.value))result.push({id:node.value,offset:node.offset,length:node.length});
  }
  for(const child of node.children||[])visit(child);
 }visit(tree);return result;
}
function attach(vscode,context,getProject){
 if(!vscode.languages?.registerCodeLensProvider)return;
 context.subscriptions.push(vscode.languages.registerCodeLensProvider([{language:'json',scheme:'file'},{language:'jsonc',scheme:'file'}],{
  provideCodeLenses(document){
   const project=getProject();if(!vscode.workspace.isTrusted||!project||document.uri.scheme!=='file')return [];
   const kind=content.fileKind(project,document.uri.fsPath);if(!kind)return [];
   return geometryLinks(document.getText(),kind).map(link=>new vscode.CodeLens(new vscode.Range(document.positionAt(link.offset),document.positionAt(link.offset+link.length)),{title:`Open Geometry Viewer to Side · ${link.id}`,tooltip:'Preview this saved geometry beside the JSON editor. Choose an owner or texture when several are available.',command:'bedrock.openModelPreviewBeside',arguments:[document.uri,link.id]}));
  }
 }));
}
module.exports={geometryLinks,attach};
