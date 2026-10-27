// Controller passes retain declaration order. Duplicate bindings stay unresolved.
const props=require('./preview-properties.cjs');
function plan(models,{choices={}}={}){
 const passes=[],warnings=[],references=new Set(),groups=new Map(),variants=[];
 for(const model of models){for(const name of model.inference?.references||[])references.add(name);if(model.inference?.active!==true)continue;
  for(const p of model.inference.passes||[]){
   if(p.complete===false){warnings.push(`${p.controller}: unsupported branches prevent a conclusive pass.`);continue;}
   if(p.selections.length!==1){warnings.push(`${p.controller}: multi-texture material routing is unsupported.`);continue;}
   if(!p.selections[0].length){warnings.push(`${p.controller}: texture alias is unresolved.`);continue;}
   for(const alias of p.selections[0]){const textures=model.textures.filter(t=>t.alias===alias);if(textures.length!==1){warnings.push(`${p.controller}: texture asset is ambiguous.`);continue;}
    const options=groups.get(p.controller)||[];if(options.length<256)options.push({model,...p,texture:textures[0],key:JSON.stringify([model.alias,alias])});else warnings.push(`${p.controller}: candidate limit exceeded.`);groups.set(p.controller,options);
   }
  }
 }
 for(const [controller,options]of groups){const unique=options.filter(p=>options.filter(q=>q.key===p.key).length===1);if(unique.length!==options.length)warnings.push(`${controller}: geometry asset is ambiguous.`);
  const conditional=unique.some(p=>p.conditional);
  if(unique.length===1&&!conditional)passes.push(unique[0]);else if(unique.length){variants.push({controller,selected:choices[controller],options:[...(conditional?[{key:'@inactive',label:'Inactive (runtime condition false)'}]:[]),...unique.map(p=>({key:p.key,label:`${p.model.alias} · ${p.texture.alias}`}))]});const selected=unique.find(p=>p.key===choices[controller]);if(selected)passes.push(selected);else if(!(conditional&&choices[controller]==='@inactive'))warnings.push(`${controller}: resource selection is unresolved; choose a reachable controller variant.`);}
 }
 const unique=passes;
 unique.sort((a,b)=>a.order-b.order);return {passes:unique.slice(0,32),variants,warnings:[...new Set(warnings),...(unique.length>32?['Controller pass limit exceeded.']:[])],references};
}
function visibilityReferences(geometry,rules,values){const found=new Set();for(const rule of rules)for(const [pattern,value]of Object.entries(rule)){const regex=new RegExp('^'+pattern.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*')+'$','i');if(typeof value==='string'&&(geometry.bones||[]).some(b=>regex.test(b.name)))for(const name of props.referenced(value,values))found.add(name);}return found;}
module.exports={plan,visibilityReferences};
