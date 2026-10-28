// Structural resource matching only. Runtime Molang is never executed.
const molang=require('./molang.cjs');
const bindings=require('./molang-bindings.cjs');
const properties=require('./preview-properties.cjs');
const canonical=t=>t.type==='string'?t.value:molang.canonical(t.value);
function strip(t){while(t[0]?.value==='('&&t.at(-1)?.value===')'){let n=0,whole=true;for(let i=0;i<t.length-1;i++){if(t[i].value==='(')n++;if(t[i].value===')')n--;if(!n){whole=false;break;}}if(!whole)break;t=t.slice(1,-1);}return t;}
function ternary(t){let depth=0,q=-1,nested=0;for(let i=0;i<t.length;i++){const v=t[i].value;if(['(','[','{'].includes(v))depth++;if([')',']','}'].includes(v))depth--;if(depth)continue;if(v==='?'){if(q<0)q=i;else nested++;}if(v===':'&&q>=0){if(nested)nested--;else return [t.slice(0,q),t.slice(q+1,i),t.slice(i+1)];}}}
function stable(t){return t.length&&!t.some((x,i)=>['=','->',';','{','}'].includes(x.value)||t[i+1]?.value==='('&&!/^(query\.(?:property|has_property|block_state|has_block_state)|math\.(?:floor|ceil|round|trunc|abs|min|max|clamp|mod))$/.test(canonical(x)));}
function signature(t){return JSON.stringify(strip(t).map(canonical));}
function compatible(a,b){return !a.some(x=>b.some(y=>x.key===y.key&&x.value!==y.value));}
function resolver(controller,desc,values={}){
 let complete=true,budget=4096;
 const aliases={geometry:Object.keys(desc.geometry||{}),texture:Object.keys(desc.textures||{}),material:Object.keys(desc.materials||{})};
 function array(name,kind,seen=[]){
  const entries=Object.entries(controller.arrays?.[{geometry:'geometries',texture:'textures',material:'materials'}[kind]]||{}).filter(([k])=>k.toLowerCase()===name.toLowerCase());
  if(entries.length!==1||seen.includes(name.toLowerCase())||seen.length>20||!Array.isArray(entries[0][1])){complete=false;return [];}
  const out=[];for(const item of entries[0][1]){if(--budget<0){complete=false;break;}if(typeof item==='string'&&/^array\.[\w.]+$/i.test(item))out.push(...array(item,kind,[...seen,name.toLowerCase()]));else out.push(item);}return out;
 }
 function expression(value,kind,guards=[],depth=0){
  if(--budget<0||depth>30||typeof value!=='string'||value.length>8192||molang.errors(value).length){complete=false;return [];}
  return tokens(strip(molang.lex(value)),kind,guards,depth);
 }
 function tokens(t,kind,guards,depth){
  t=strip(t);if(--budget<0||depth>30||!t.length){complete=false;return [];}
  const split=ternary(t);if(split){const [condition,yes,no]=split,key=stable(condition)?'condition:'+signature(condition):undefined;
   const literal=properties.predicate(condition,values);if(literal!==undefined)return tokens(literal?yes:no,kind,guards,depth+1);
   return [yes,no].flatMap((branch,i)=>tokens(branch,kind,key?[...guards,{key,value:i===0}]:guards,depth+1));}
  if(kind==='number'){const n=number(t);if(n!==undefined)return [{value:n,guards}];return [{dynamic:t,guards}];}
  if(t.length===1){const name=canonical(t[0]);if(name.startsWith(kind+'.')){const matches=aliases[kind].filter(a=>a.toLowerCase()===name.slice(kind.length+1));if(matches.length===1)return [{alias:matches[0],guards}];}}
  if(t[0]?.type==='id'&&/^array\./i.test(t[0].value)&&t[1]?.value==='['&&t.at(-1)?.value===']'){
   const items=array(t[0].value,kind);if(!items.length){complete=false;return [];}
   return tokens(t.slice(2,-1),'number',guards,depth+1).flatMap(index=>{
    const choices=index.dynamic?items.map((_,i)=>i):[Math.max(0,Math.trunc(index.value))%items.length];
    const key=index.dynamic&&stable(index.dynamic)?`index:${items.length}:`+signature(index.dynamic):undefined;
    return choices.flatMap(i=>expression(items[i],kind,key?[...index.guards,{key,value:i}]:index.guards,depth+1));
   });
  }
  complete=false;return [];
 }
 function number(t){const n=properties.literal(t,values);return typeof n==='number'?n:typeof n==='boolean'?Number(n):undefined;}
 return {expression,get complete(){return complete;}};
}
function infer(index,binding,values={}){
 const doc=index.documents.get(binding.ownerFile),desc=(doc?.data?.['minecraft:client_entity']||doc?.data?.['minecraft:attachable'])?.description;
 if(!desc)return;
 const refs=typeof desc.render_controllers==='string'?[desc.render_controllers]:desc.render_controllers;
 if(!Array.isArray(refs)||!refs.length)return {aliases:[],complete:false,message:'No render controller binding; using declared texture preference.'};
 const normalized={...desc,geometry:typeof desc.geometry==='string'?{default:desc.geometry}:desc.geometry,textures:typeof desc.textures==='string'?{default:desc.textures}:desc.textures};
 const documents=[...bindings.view(index,doc).documents.values()].filter(d=>d.side!=='behavior');
 const aliases=new Set(),used=[],controllers=[],passes=[],records=[],issues=[],references=new Set();let complete=true,layers=false,conditional=false,order=0;
 for(const ref of refs)for(const [id,activation]of typeof ref==='string'?[[ref,1]]:Object.entries(ref||{})){
  const activationExpression=typeof activation==='string'?properties.expand(activation,desc.scripts?.pre_animation):String(activation);
  const recordController={controller:id,order:order++,activation:{expression:activationExpression,...properties.evaluate(activationExpression,values)},status:'unknown',sources:[],expressions:[]};records.push(recordController);
  if(typeof activation==='string')for(const name of properties.referenced(properties.expand(activation,desc.scripts?.pre_animation),values))references.add(name);
  const enabled=typeof activation==='string'?properties.predicate(molang.lex(properties.expand(activation,desc.scripts?.pre_animation)),values):!!activation;
  if(enabled===false){recordController.status='inactive';continue;}if(enabled===undefined)conditional=true;
  const matches=documents.flatMap(d=>Object.entries(d.data?.render_controllers||{}).filter(([key])=>key.toLowerCase()===id.toLowerCase()).map(([,value])=>({value,file:d.file,label:d.previewLabel||d.relative})));recordController.sources=matches.map(({file,label})=>({file,label}));
  if(matches.length!==1){complete=false;recordController.status=matches.length?'ambiguous':'unknown';recordController.reason=matches.length?'Multiple controller definitions.':'Controller definition missing.';issues.push(`${id}: ${matches.length?'multiple definitions':'definition missing'}.`);continue;}
  const c=matches[0].value;if(!c||typeof c!=='object'){complete=false;continue;}
  const expand=value=>typeof value==='string'?properties.expand(value,desc.scripts?.pre_animation):value;
  const record=value=>{if(typeof value==='string')for(const name of properties.referenced(expand(value),values))references.add(name);};record(c.geometry);record(typeof activation==='string'?activation:'');
  const r=resolver(c,normalized,values),geometryChoices=r.expression(expand(c.geometry),'geometry'),geometry=geometryChoices.filter(g=>g.alias.toLowerCase()===binding.alias.toLowerCase());
  recordController.expressions.push({kind:'geometry',expression:expand(c.geometry),dependencies:properties.referenced(expand(c.geometry),values),status:!r.complete?'unknown':new Set(geometryChoices.map(g=>g.alias)).size===1?'resolved':'ambiguous',aliases:[...new Set(geometryChoices.map(g=>g.alias))]});
  if(!r.complete)complete=false;if(!geometry.length)continue;used.push(id);controllers.push(c);
  const textures=typeof c.textures==='string'?[c.textures]:c.textures;
  if(!Array.isArray(textures)||!textures.length){complete=false;continue;}
  if(textures.length>1)layers=true;
  const selections=[];
  for(const value of textures){record(value);const choices=[...new Set(r.expression(expand(value),'texture').filter(t=>geometry.some(g=>compatible(g.guards,t.guards))).map(t=>t.alias))];recordController.expressions.push({kind:'texture',expression:expand(value),status:!r.complete?'unknown':choices.length===1?'resolved':choices.length?'ambiguous':'unknown',aliases:choices,dependencies:properties.referenced(expand(value),values)});selections.push(choices);for(const alias of choices)aliases.add(alias);}
  const materialInputs=new Set();
  const materials=(c.materials||[]).map(rule=>Object.fromEntries(Object.entries(rule).map(([key,value])=>{record(value);const matches=r.expression(expand(value),'material').filter(t=>geometry.some(g=>compatible(g.guards,t.guards)));const selected=[...new Set(matches.map(t=>t.alias))];for(const alias of selected){const profile=require('./preview-materials.cjs').profile(desc.materials?.[alias]);for(const name of [...(profile.colorMask?['query.color']:[]),...(profile.multiplicative?['query.color2']:[])]){references.add(name);materialInputs.add(name);}}return [key,selected.length===1?'Material.'+selected[0]:expand(value)];})));
  for(const rule of c.part_visibility||[])for(const value of Object.values(rule))record(value);
  for(const [kind,rules]of [['material',c.materials],['visibility',c.part_visibility]])for(const rule of rules||[])for(const [pattern,value]of Object.entries(rule)){const expression=expand(value);recordController.expressions.push({kind,pattern,expression,...(kind==='visibility'?properties.evaluate(typeof expression==='string'?expression:String(expression),values):(()=>{const matches=r.expression(expression,'material').filter(t=>geometry.some(g=>compatible(g.guards,t.guards))),aliases=[...new Set(matches.map(t=>t.alias))];return {status:!r.complete?'unknown':aliases.length===1?'resolved':aliases.length?'ambiguous':'unknown',aliases,dependencies:[...(typeof expression==='string'?properties.referenced(expression,values):[]),...materialInputs]};})())});}
  passes.push({controller:id,order:refs.flatMap(ref=>typeof ref==='string'?[ref]:Object.keys(ref||{})).indexOf(id),selections,materials,materialAliases:desc.materials,complete:r.complete,conditional:enabled===undefined,rules:(c.part_visibility||[]).map(rule=>Object.fromEntries(Object.entries(rule).map(([key,v])=>[key,expand(v)])))});
  if(!r.complete)complete=false;
 }
 const choices=[...aliases],message=[used.length?'Render controller matches: '+used.join(', ')+'.':'No matching render controller geometry found.',...issues,choices.length?'Compatible textures: '+choices.slice(0,6).join(', ')+(choices.length>6?` (+${choices.length-6} more)`:'')+'.':'No texture could be inferred.',!complete?'Some bindings are missing, ambiguous or unsupported; using declared texture preference.':passes.some(p=>p.selections.some(s=>s.length>1))?'Runtime variant is unresolved; choose a compatible texture.':'',layers?'Multiple texture layers require material-specific routing; unsupported combinations are explained.':'',conditional?'Controller activation depends on runtime state.':'','Bounded preview property/resource/material matching; unsupported runtime expressions remain unresolved.'].filter(Boolean).join('\n');
 const rules=complete&&controllers.length===1?(controllers[0].part_visibility||[]).map(rule=>Object.fromEntries(Object.entries(rule).map(([key,v])=>[key,typeof v==='string'?properties.expand(v,desc.scripts?.pre_animation):v]))):[];
 return {aliases:choices,complete:complete&&choices.length>0&&!layers,message,active:used.length?true:complete&&!conditional?false:undefined,rules,passes,records,references:[...references]};
}
module.exports={infer,resolver};
