// Static potential bindings, not a prediction of which actor/animation runs.
const json=require('jsonc-parser');
const path=require('node:path');
const data=d=>d.data||(d.tree&&json.getNodeValue(d.tree))||{};
const key=d=>path.resolve(d.file||d.relative).toLowerCase();
const relative=d=>(d.relative||'').replace(/^subpacks\/[^/]+\//,'');
const subpack=d=>/^subpacks\/([^/]+)\//.exec(d.relative||'')?.[1];
const graphCache=new WeakMap();
function view(index,document){
 const all=[...index?.documents.values()||[]],position=all.findIndex(d=>key(d)===key(document));
 if(position>=0)all[position]=document;else all.push(document);
 const manifest=all.find(d=>d.side==='resource'&&d.relative==='manifest.json');
 const declared=new Set((data(manifest||{}).subpacks||[]).map(s=>s.folder_name));
 const requested=document.side==='resource'&&subpack(document)||index?.project?.config?.authoring?.resourceSubpack;
 // A file's own subpack is useful even in an unfinished manifest. Project-wide
 // selection is honored only for a declared folder; never guess a device tier.
 const selected=document.side==='resource'&&subpack(document)||declared.has(requested)&&requested||undefined;
 const overrides=new Map(all.filter(d=>d.side==='resource'&&subpack(d)===selected&&selected).map(d=>[relative(d).toLowerCase(),d]));
 const documents=all.filter(d=>d.side!=='resource'?!subpack(d):subpack(d)?subpack(d)===selected:!overrides.has(relative(d).toLowerCase()));
 return {documents:new Map(documents.map(d=>[d.file,d])),selected,requested,visible:documents.some(d=>key(d)===key(document))};
}
function graph(index,document){
 const active=view(index,document),snapshot=[...index?.documents.values()||[]],saved=snapshot.find(d=>key(d)===key(document)),dirty=saved?.text!==document.text,keyPart=(active.selected||'')+':'+(dirty?key(document):'*');
 const cache=index&&graphCache.get(index),hit=cache?.get(keyPart);
 if(hit&&hit.snapshot.length===snapshot.length&&snapshot.every((d,i)=>hit.snapshot[i]===d)&&hit.text===(dirty?document.text:undefined))return hit.graph;
 const definitions=[],owners=[];
 for(const d of active.documents.values()){
  const value=data(d);
  for(const family of ['animations','animation_controllers','render_controllers'])for(const id of Object.keys(value[family]||{}))definitions.push({document:d,family,id,node:json.findNodeAtLocation(d.tree,[family,id])});
  for(const root of ['minecraft:entity','minecraft:client_entity','minecraft:attachable'])if(value[root]?.description)owners.push({document:d,root,description:value[root].description});
 }
 const reachable=new Map(),byId=new Map();for(const def of definitions){const id=def.document.side+':'+def.id;if(!byId.has(id))byId.set(id,[]);byId.get(id).push(def);}
 for(const owner of owners){
  const desc=owner.description,aliases=desc.animations||{},targets=new Set(Object.values(aliases).filter(s=>typeof s==='string'));
  for(const item of Array.isArray(desc.animation_controllers)?desc.animation_controllers:[])for(const id of Object.values(item||{}))if(typeof id==='string')targets.add(id);
  for(const item of Array.isArray(desc.render_controllers)?desc.render_controllers:typeof desc.render_controllers==='string'?[desc.render_controllers]:[])for(const id of typeof item==='string'?[item]:Object.keys(item||{}))targets.add(id);
  const found=new Set(),queue=[...targets];
  while(queue.length){const id=queue.shift(),matches=byId.get(owner.document.side+':'+id)||[];if(matches.length!==1||found.has(matches[0]))continue;
   const def=matches[0];found.add(def);
   // Named controller bindings are resolved through this owner's dictionary.
   // Conditional weights affect execution, not the potential ownership edge.
   if(def.family==='animation_controllers')for(const state of Object.values(data(def.document).animation_controllers[id]?.states||{}))for(const item of state.animations||[])for(const alias of typeof item==='string'?[item]:Object.keys(item||{}))if(typeof aliases[alias]==='string')queue.push(aliases[alias]);
  }
  reachable.set(owner,found);
 }
 function forDefinition(d,id){return definitions.find(def=>key(def.document)===key(d)&&def.id===id);}
 function owning(d,id){const def=forDefinition(d,id);return def?owners.filter(o=>reachable.get(o).has(def)):[];}
 const result={...active,definitions,owners,reachable,owning};if(index){const entries=cache||new Map();if(entries.size>16)entries.clear();entries.set(keyPart,{snapshot,text:dirty?document.text:undefined,graph:result});graphCache.set(index,entries);}return result;
}
function owners(index,document,id){return graph(index,document).owning(document,id).map(({document,root})=>({document,root}));}
function scope(index,document,node){
 const g=graph(index,document),p=json.getNodePath(node),local=g.owners.find(o=>key(o.document)===key(document)&&o.root===p[0]);
 const owning=local?[local]:g.owning(document,p[1]),owner=owning.length===1?owning[0]:undefined;
 const sources=[{document,family:['animations','animation_controllers','render_controllers'].includes(p[0])?p[0]:undefined,id:p[1]}];
 if(owner){if(key(owner.document)!==key(document))sources.push({document:owner.document,root:owner.root});for(const def of g.reachable.get(owner))if(!sources.some(s=>key(s.document)===key(def.document)&&s.id===def.id))sources.push(def);}
 return {...g,owner,owning,sources};
}
function symbols(index,document,node){
 const m=require('./molang.cjs'),s=scope(index,document,node),result=[];
 const add=(name,d,n,kind,offset=n?.offset,length=n?.length)=>result.push({name:m.canonical(name),document:d,node:n,kind,offset,length});
 for(const source of s.sources){const d=source.document;
  if(source.family==='animation_controllers'){
   const p=json.getNodePath(node),states=data(d).animation_controllers[source.id]?.states||{};
   for(const [state,value]of Object.entries(states)){if(key(d)===key(document)&&p[1]===source.id&&p[2]==='states'&&p[3]!==state)continue;for(const name of Object.keys(value.variables||{})){const n=json.findNodeAtLocation(d.tree,['animation_controllers',source.id,'states',state,'variables',name]);add(name.startsWith('variable.')?name:'variable.'+name,d,n?.parent?.children[0],'controller state variable');}}
  }
  for(const root of ['particle_effect','minecraft:particle_effect'])for(const name of Object.keys(data(d)[root]?.curves||{})){const n=json.findNodeAtLocation(d.tree,[root,'curves',name]);add(name,d,n?.parent?.children[0],'particle curve variable');}
  for(const expression of m.nodes(d)){const p=json.getNodePath(expression);if(source.family&&(p[0]!==source.family||p[1]!==source.id))continue;if(source.root&&p[0]!==source.root)continue;
   const tokens=m.lex(expression.value),map=m.offsets(d,expression);
   for(let i=0;i<tokens.length;i++){const t=tokens[i];if(!/^variable\./.test(m.canonical(t.value)))continue;
    // A member read through an actor arrow belongs to that runtime actor.
    if(external(expression.value,t.start))continue;
    add(t.value,d,expression,tokens[i+1]?.value==='='?'variable declaration':'variable observation',map[t.start],map[t.end]-map[t.start]);
   }
  }
 }
 if(s.owner){const d=s.owner.document,root=s.owner.root,desc=s.owner.description;
  for(const name of Object.keys(desc.scripts?.variables||{})){const n=json.findNodeAtLocation(d.tree,[root,'description','scripts','variables',name]);add(name,d,n?.parent?.children[0],'public variable');}
  for(const [group,namespace]of [['geometry','geometry'],['textures','texture'],['materials','material'],['animations','animation']])for(const alias of Object.keys(desc[group]||{})){const n=json.findNodeAtLocation(d.tree,[root,'description',group,alias]);add(namespace+'.'+alias,d,n?.parent?.children[0],'resource binding');}
 }
 const p=json.getNodePath(node);if(p[0]==='render_controllers'){const arrays=json.findNodeAtLocation(document.tree,[p[0],p[1],'arrays']);for(const group of arrays?.children||[])for(const property of group.children[1]?.children||[])add(property.children[0].value,document,property.children[0],'resource array');}
 return result.filter(s=>s.offset!==undefined);
}
function definitions(index,document,node,raw){
 const m=require('./molang.cjs'),pos=m.decodedOffset(document,node,raw),tokens=m.lex(node.value),token=tokens.find(t=>t.start<=pos&&pos<t.end)||tokens.find(t=>t.end===pos);
 if(!token||token.type!=='id'||external(node.value,token.start))return [];
 const id=m.canonical(token.value),all=symbols(index,document,node),names=[...new Set(all.filter(s=>s.kind!=='variable observation').map(s=>s.name))].filter(n=>id===n||id.startsWith(n+'.')).sort((a,b)=>b.length-a.length),name=names[0];
 const found=all.filter(s=>s.name===name&&s.kind!=='variable observation');
 if(id.startsWith('temp.')){
  const unit=m.units(document).find(u=>u.nodes.includes(node));if(unit){let before=0;for(const part of unit.nodes){if(part===node)break;before+=part.value.length+1;}const boundary=before+token.start,stack=[],assignments=[];
   const ts=m.lex(unit.text);for(let i=0;i<ts.length&&ts[i].start<boundary;i++){const t=ts[i];if(t.value==='{')stack.push(t.start);else if(t.value==='}')stack.pop();else if(m.canonical(t.value)===id&&ts[i+1]?.value==='=')assignments.push({t,scope:[...stack]});}
   const assignment=assignments.filter(a=>a.scope.every((v,i)=>stack[i]===v)).at(-1);if(assignment)found.push({name:id,document,node,kind:'temporary declaration',offset:unit.map[assignment.t.start],length:unit.map[assignment.t.end]-unit.map[assignment.t.start]});
  }
 }
 return [...new Map(found.map(s=>[key(s.document)+':'+s.offset,s])).values()];
}
// Unknown actor identity is a boundary: never suggest the caller's private vars
// after an arrow, including aliases assigned from runtime context values.
function external(text,start){
 const tokens=require('./molang.cjs').lex(text.slice(0,start));if(tokens.at(-1)?.value==='->')return true;
 const stack=[];for(let i=0;i<tokens.length;i++){const t=tokens[i];if(['(','[','{'].includes(t.value))stack.push(tokens[i-1]?.value==='->'||tokens[i-1]?.type==='id'&&tokens[i-2]?.value==='->'||stack.at(-1)===true);else if([')',']','}'].includes(t.value))stack.pop();}
 return stack.includes(true);
}
module.exports={data,relative,subpack,view,graph,owners,scope,symbols,definitions,external};
