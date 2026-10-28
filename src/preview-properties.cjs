// Preview inputs and bounded property predicates, not a runtime Molang evaluator.
const m=require('./molang.cjs');
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
function properties(index,owner){
 if(typeof owner!=='string')return {fields:[],warning:''};
 const matches=[...index.documents.values()].filter(d=>d.side==='behavior'&&d.data?.['minecraft:entity']?.description?.identifier===owner);
 if(matches.length!==1)return {fields:[],warning:matches.length?'Multiple behavior entities define this owner; client-synced properties are unresolved.':''};
 const fields=[];
 for(const [name,p]of Object.entries(matches[0].data['minecraft:entity'].description.properties||{})){
  if(p?.client_sync!==true)continue;
  const field={name,type:p.type};
  if(p.type==='enum'&&Array.isArray(p.values)&&p.values.length&&p.values.length<=256&&p.values.every(v=>typeof v==='string'))field.values=p.values;
  else if(p.type==='bool')field.values=[false,true];
  else if(['int','float'].includes(p.type)&&Array.isArray(p.range)&&p.range.length===2&&p.range.every(Number.isFinite)&&p.range[0]<=p.range[1])field.range=p.range;
  else continue;
  if(valid(field,p.default))field.default=p.default;
  fields.push(field);
 }
 const entity=matches[0].data['minecraft:entity'];
 for(const name of ['color','color2','variant','mark_variant','skin_id']){const id='minecraft:'+name,base=entity.components?.[id]?.value;const values=[...new Set([base,...Object.values(entity.component_groups||{}).map(g=>g[id]?.value)].filter(Number.isInteger))];if(!values.length)continue;fields.push({name:'query.'+name,type:'int',group:'Preview queries',source:'Values from the matching behavior entity components; preview inputs do not guarantee runtime reachability.',values:values.sort((a,b)=>a-b),...(Number.isInteger(base)?{default:base}:{})});}
 return {fields,warning:''};
}
function valid(f,v){return f.values?f.values.includes(v):typeof v==='number'&&Number.isFinite(v)&&v>=f.range[0]&&v<=f.range[1]&&(f.type!=='int'||Number.isInteger(v));}
function inputs(fields,requested={}){const values=Object.create(null);for(const f of fields){if(own(requested,f.name)&&valid(f,requested[f.name]))values[f.name]=requested[f.name];else if(own(f,'default'))values[f.name]=f.default;}return values;}
function unwrap(t){while(t[0]?.value==='('&&t.at(-1)?.value===')'){let depth=0,whole=true;for(let i=0;i<t.length-1;i++){if(t[i].value==='(')depth++;if(t[i].value===')')depth--;if(!depth){whole=false;break;}}if(!whole)break;t=t.slice(1,-1);}return t;}
function split(t){let depth=0,q=-1,nested=0;for(let i=0;i<t.length;i++){const v=t[i].value;if(['(','['].includes(v))depth++;if([')',']'].includes(v))depth--;if(depth)continue;if(v==='?'){if(q<0)q=i;else nested++;}if(v===':'&&q>=0){if(nested)nested--;else return [t.slice(0,q),t.slice(q+1,i),t.slice(i+1)];}}}
function literal(t,values,depth=0){
 if(depth>40||t.length>2048)return;
 t=unwrap(t);
 if(t[0]?.value==='!'&&(t.length===2||t[1]?.value==='('&&unwrap(t.slice(1)).length<t.length-1)){const value=predicate(t.slice(1),values,depth+1);return value===undefined?undefined:!value;}
 if(t.length===1&&t[0].type==='id'){const key=m.canonical(t[0].value);if(/^(?:query\.(?:color2?|variant|mark_variant|skin_id|is_baby|trade_tier)|(?:variable|temp)\.[\w.]+)$/.test(key)&&own(values,key))return values[key];}
 const branches=split(t);if(branches){const condition=predicate(branches[0],values,depth+1);if(condition!==undefined)return literal(branches[condition?1:2],values,depth+1);return;}
 if(t.length===1){if(t[0].type==='string')return t[0].value.slice(1,-1);if(/^(true|false)$/i.test(t[0].value))return t[0].value.toLowerCase()==='true';}
 const number=t.map(x=>x.value).join('');if(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?f?$/i.test(number)){const v=Number(number.replace(/f$/i,''));if(Number.isFinite(v))return v;}
 if(t.length===4&&m.canonical(t[0].value)==='query.property'&&t[1].value==='('&&t[2].type==='string'&&t[3].value===')'){const id=t[2].value.slice(1,-1);if(own(values,id))return values[id];}
 // Constant-fold numeric property-derived indices only; unknown runtime tokens
 // never become values and no function calls or statements are executed.
 for(const ops of [['+','-'],['*','/','%']]){let nesting=0;for(let i=t.length-1;i>0;i--){const op=t[i].value;if(op===')')nesting++;if(op==='(')nesting--;if(nesting||!ops.includes(op)||['+','-','*','/','%','('].includes(t[i-1].value))continue;const a=literal(t.slice(0,i),values,depth+1),b=literal(t.slice(i+1),values,depth+1);if(typeof a!=='number'||typeof b!=='number')return;const result=({'+':()=>a+b,'-':()=>a-b,'*':()=>a*b,'/':()=>a/b,'%':()=>a%b})[op]();return Number.isFinite(result)?result:undefined;}}
}
function predicate(tokens,values,depth=0){
 if(depth>40||tokens.length>2048)return;
 const t=unwrap(tokens);
 const branches=split(t);if(branches){const condition=predicate(branches[0],values,depth+1);return condition===undefined?undefined:predicate(branches[condition?1:2],values,depth+1);}
 // Split lowest-precedence operators first. Unknown operands remain unknown
 // unless the other operand conclusively determines the boolean result.
 for(const op of ['||','&&']){let nesting=0;for(let i=t.length-1;i>=0;i--){if([')',']'].includes(t[i].value))nesting++;if(['(','['].includes(t[i].value))nesting--;if(nesting||t[i].value!==op)continue;
  const a=predicate(t.slice(0,i),values,depth+1),b=predicate(t.slice(i+1),values,depth+1);
  if(op==='&&')return a===false||b===false?false:a===true&&b===true?true:undefined;
  return a===true||b===true?true:a===false&&b===false?false:undefined;
 }}
 const atom=literal(t,values,depth+1);if(atom!==undefined)return typeof atom==='string'?undefined:!!atom;
 let nesting=0;for(let i=0;i<t.length;i++){
  if(t[i].value==='(')nesting++;if(t[i].value===')')nesting--;if(nesting)continue;
  if(['==','!=','<','<=','>','>='].includes(t[i].value)){
   const a=literal(t.slice(0,i),values,depth+1),b=literal(t.slice(i+1),values,depth+1);if(a===undefined||b===undefined)return;
   const x=typeof a==='boolean'?Number(a):a,y=typeof b==='boolean'?Number(b):b;
   if(typeof x!==typeof y)return;
   return ({'==':()=>x===y,'!=':()=>x!==y,'<':()=>x<y,'<=':()=>x<=y,'>':()=>x>y,'>=':()=>x>=y})[t[i].value]();
  }
 }
 if(t[0]?.value==='!'){const v=predicate(t.slice(1),values,depth+1);return v===undefined?undefined:!v;}
}
function evaluate(text,values={}){
 if(typeof text!=='string'||text.length>8192||m.errors(text).length)return {status:'unknown',reason:'Invalid or excessive expression.',dependencies:[]};
 const tokens=m.lex(text),dependencies=referenced(text,values);
 const scalar=literal(tokens,values),value=scalar===undefined?predicate(tokens,values):scalar;
 return value===undefined?{status:'unknown',reason:'Required runtime state or unsupported expression.',dependencies}:{status:'resolved',value,dependencies};
}
function referenced(text,values){
 const found=new Set();let budget=4096;
 function visit(t,depth=0){if(depth>40||--budget<0)return;t=unwrap(t);const branches=split(t);if(branches){visit(branches[0],depth+1);const truth=predicate(branches[0],values);for(const b of truth===undefined?[branches[1],branches[2]]:[branches[truth?1:2]])visit(b,depth+1);return;}
  // Array selectors and parenthesized scalar bindings contain nested branches.
  for(let i=0;i<t.length;i++){if(/^(?:query\.(?:color2?|variant|mark_variant|skin_id|is_baby|trade_tier)|(?:variable|temp)\.[\w.]+)$/.test(m.canonical(t[i].value)))found.add(m.canonical(t[i].value));if(m.canonical(t[i].value)==='query.property'&&t[i+2]?.type==='string')found.add(t[i+2].value.slice(1,-1));if(['(','['].includes(t[i].value)){let n=1,j=i+1;for(;j<t.length&&n;j++){if(['(','['].includes(t[j].value))n++;if([')',']'].includes(t[j].value))n--;}if(!n){visit(t.slice(i+1,j-1),depth+1);i=j-1;}}}
 }
 visit(m.lex(text));return [...found];
}
// Inline only unique straight-line literal assignments from pre_animation.
// This preserves existing resource matching; no statements are executed.
function expand(text,scripts){
 const definitions=new Map(),invalid=new Set();
 for(const [position,line]of (Array.isArray(scripts)?scripts:[]).entries()){if(typeof line!=='string')continue;const t=m.lex(line);if(t[0]?.type==='id'&&/^(variable|temp)\./.test(m.canonical(t[0].value))&&t[1]?.value==='='&&t.at(-1)?.value===';'&&!t.slice(2,-1).some(x=>['=',';','{','}','->'].includes(x.value))){const key=m.canonical(t[0].value);if(definitions.has(key))invalid.add(key);definitions.set(key,{tokens:t.slice(2,-1),position});}else for(let i=0;i<t.length;i++)if(t[i+1]?.value==='=')invalid.add(m.canonical(t[i].value));}
 let budget=2048;
 function visit(t,seen=[],before=Infinity){const out=[];for(const token of t){if(--budget<0)throw Error('Property substitution limit');const key=m.canonical(token.value),definition=definitions.get(key);if(token.type==='id'&&definition&&definition.position<before&&!invalid.has(key)&&!seen.includes(key)&&seen.length<16)out.push('(',...visit(definition.tokens,[...seen,key],definition.position),')');else out.push(token.value);}return out;}
 try{return visit(m.lex(text)).join(' ');}catch{return text;}
}
function visible(model,rules,values){
 const visibility=Object.create(null),unresolved=new Set();
 for(const bone of model.bones||[]){let show=true;for(const rule of rules)for(const [pattern,value]of Object.entries(rule||{})){
  const escaped=pattern.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*');if(!new RegExp('^'+escaped+'$','i').test(bone.name))continue;
  const known=typeof value==='boolean'?value:typeof value==='number'?!!value:typeof value==='string'&&value.length<=8192&&!m.errors(value).length?predicate(m.lex(value),values):undefined;
  if(known===undefined){unresolved.add(pattern);show=true;}else show=known;
 }visibility[bone.name]=show;}
 return {visibility,warning:unresolved.size?'Unresolved visibility conditions (shown): '+[...unresolved].join(', ')+'.':''};
}
module.exports={properties,inputs,valid,literal,predicate,expand,visible,referenced,evaluate};
// Add only supported scalar names actually referenced by this owner's controllers.
// Limits are preview input bounds, not inferred Minecraft runtime domains.
function appearanceInputs(info,inference,scripts=[]){
 const fields=[...info.fields],assigned=new Set();
 for(const line of scripts){if(typeof line!=='string')continue;const tokens=m.lex(line);for(let i=0;i<tokens.length-1;i++)if(tokens[i+1].value==='=')assigned.add(m.canonical(tokens[i].value));}
 for(const name of inference?.references||[]){if(fields.some(f=>f.name===name)||assigned.has(name))continue;
  const source='Explicit preview value; no runtime default. Referenced by the selected entity render controllers. Numeric bounds limit preview input, not game states.';
  if(name==='query.is_baby')fields.push({name,label:'Baby state (query.is_baby)',type:'bool',values:[false,true],group:'Preview queries',source});
  else if(/^query\.(color2?|variant|mark_variant|skin_id|trade_tier)$/.test(name))fields.push({name,type:'int',range:[0,65535],group:'Preview queries',source});
  else if(/^(variable|temp)\.[\w.]+$/.test(name))fields.push({name,type:'float',range:[-1000000,1000000],group:'Preview variables',source});
 }
 return {...info,fields:fields.slice(0,256)};
}
module.exports.appearanceInputs=appearanceInputs;
