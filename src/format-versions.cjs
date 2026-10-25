const json=require('jsonc-parser');
const engineCompare=require('./releases.cjs').compareVersions;
const compareVersions=(a,b)=>engineCompare(typeof a==='string'&&a.split('.').length===2?a+'.0':a,typeof b==='string'&&b.split('.').length===2?b+'.0':b);
const catalog=require('./format-requirements.json');
const version=value=>typeof value==='string'&&/^\d+\.\d+(?:\.\d+)?$/.test(value)?value:undefined;
function directCustom(format){return !version(format)||compareVersions(format,'1.21.90')>=0;}
function rule(kind,id){return catalog.components[kind]?.[id];}
function supported(kind,id,format,target,field){const min=(field?rule(kind,id)?.fields?.[field]:rule(kind,id))?.min;return !min||(!version(format)||compareVersions(format,min)>=0)&&(!version(target)||compareVersions(target,min)>=0);}
function containers(tree){const result=[];for(const kind of ['block','item','entity']){const root=json.findNodeAtLocation(tree,['minecraft:'+kind]);if(!root)continue;const add=(node,permutation=false)=>{if(node?.type==='object')result.push({kind,node,permutation});};add(json.findNodeAtLocation(root,['components']));for(const permutation of json.findNodeAtLocation(root,['permutations'])?.children||[])add(json.findNodeAtLocation(permutation,['components']),true);for(const group of json.findNodeAtLocation(root,['component_groups'])?.children||[])add(group.children?.[1]);}return result;}
function fieldNodes(node,keys){if(!node)return [];if(!keys.length)return [node];const [key,...rest]=keys;return key==='*'?(node.children||[]).flatMap(property=>fieldNodes(property.children?.[1],rest)):fieldNodes(json.findNodeAtLocation(node,[key]),rest);}
function issues(document,project){const tree=document.tree,formatNode=json.findNodeAtLocation(tree,['format_version']),format=version(formatNode?.value),target=project?.config?.targetVersion,result=[];
 const add=(node,message)=>result.push({file:document.file,offset:node?.offset||0,length:Math.max(1,node?.length||1),severity:'warning',code:'bedrock.formatVersion',message});
 if(document.relative!=='manifest.json'&&formatNode){if(formatNode.type==='string'&&!format)add(formatNode,'format_version must be a numeric version such as "1.21.90"; it selects this file’s syntax, independently of the project version.');else if(format&&version(target)&&compareVersions(format,target)>0)add(formatNode,`File format ${format} is newer than target engine ${target}.`);}
 for(const {kind,node,permutation}of containers(tree))for(const property of node.children||[]){const key=property.children[0],id=key.value,min=rule(kind,id)?.min;
 if(min&&format&&compareVersions(format,min)<0)add(key,`${id} requires format_version ${min} or later; this file uses ${format}.`);
 else if(min&&version(target)&&compareVersions(target,min)<0)add(key,`${id} requires engine support for format ${min}; the project targets ${target}.`);
 for(const [field,requirement]of Object.entries(rule(kind,id)?.fields||{})){for(const fieldNode of fieldNodes(property.children[1],requirement.path||[field])){if(fieldNode&&format&&compareVersions(format,requirement.min)<0)add(fieldNode.parent.children[0],id+'.'+field+' requires format_version '+requirement.min+' or later.');else if(fieldNode&&version(target)&&compareVersions(target,requirement.min)<0)add(fieldNode.parent.children[0],id+'.'+field+' requires engine support for format '+requirement.min+'; the project targets '+target+'.');}}
 if(['block','item'].includes(kind)&&typeof id==='string'&&!id.startsWith('minecraft:')&&format&&compareVersions(format,'1.21.90')<0)add(key,`Direct custom ${kind} components require format_version 1.21.90 or later. Older formats use minecraft:custom_components.`);
 if(id==='minecraft:custom_components'&&format&&compareVersions(format,'1.21.90')>=0)add(key,'minecraft:custom_components is deprecated from format 1.21.90; register custom components directly in components.');
 if(kind==='block'&&id==='minecraft:flower_pottable'&&permutation&&format&&compareVersions(format,'1.26.20')>=0)add(key,'minecraft:flower_pottable belongs in root components, not permutations, from format 1.26.20.');
 }
 return result;
}
// Decimal comparison encoded for JSON Schema conditionals (no fixed list of future versions).
function atLeastInteger(n){const s=String(n),parts=[s];for(let i=0;i<s.length;i++){const digit=Number(s[i]);if(digit<9)parts.push(s.slice(0,i)+'['+(digit+1)+'-9]'+'[0-9]'.repeat(s.length-i-1));}parts.push('[1-9][0-9]{'+s.length+',}');return '(?:'+parts.join('|')+')';}
function atLeastPattern(min){const [a,b,c]=min.split('.').map(Number);return '^(?:'+atLeastInteger(a+1)+'\\.[0-9]+(?:\\.[0-9]+)?|'+a+'\\.'+atLeastInteger(b+1)+'(?:\\.[0-9]+)?|'+a+'\\.'+b+'\\.'+atLeastInteger(c)+(c===0?'|'+a+'\\.'+b:'')+')$';}
function apply(schema,kind,target){
 const rules=catalog.components[kind];if(!rules||!schema.properties?.['minecraft:'+kind])return schema;schema=structuredClone(schema);const found=new Map();
 function visit(node){if(!node||typeof node!=='object')return;if(node.properties)for(const [id,value]of Object.entries(node.properties)){if(rules[id]||id==='minecraft:custom_components'){if(!found.has(id))found.set(id,value);delete node.properties[id];}}for(const child of Object.values(node))if(Array.isArray(child))child.forEach(visit);else if(child&&typeof child==='object')visit(child);}visit(schema);
 const body=properties=>({properties:{['minecraft:'+kind]:{properties:{components:{properties},permutations:{items:{properties:{components:{properties}}}},component_groups:{additionalProperties:{properties}}}}}});
 const gate=(min,yes,no)=>{if(version(target)&&compareVersions(target,min)<0){(schema.allOf||=[]).push(no);return;}(schema.allOf||=[]).push({if:{required:['format_version'],properties:{format_version:{type:'string',pattern:atLeastPattern(min)}}},then:yes,else:no});};
 function takeField(node,field){if(node.properties&&Object.hasOwn(node.properties,field)){const value=node.properties[field];delete node.properties[field];return value;}for(const key of ['anyOf','oneOf','allOf'])for(const child of node[key]||[]){const value=takeField(child,field);if(value)return value;}}
 function takePath(node,keys){if(node.$ref?.startsWith('#/definitions/')){const original=schema.definitions?.[node.$ref.slice(14)];if(original){delete node.$ref;Object.assign(node,structuredClone(original));}}const [key,...rest]=keys;if(!rest.length)return takeField(node,key);const next=key==='*'?node.additionalProperties:node.properties?.[key];if(next){const value=takePath(next,rest);if(value)return value;}for(const keyword of ['anyOf','oneOf','allOf'])for(const child of node[keyword]||[]){const value=takePath(child,keys);if(value)return value;}}
 const fieldShape=(keys,value)=>keys.reduceRight((child,key)=>key==='*'?{additionalProperties:child}:{properties:{[key]:child}},value);
 for(const [id,value]of found){if(id==='minecraft:custom_components'){delete value.doNotSuggest;gate('1.21.90',body({[id]:{...value,doNotSuggest:true}}),body({[id]:value}));continue;}const requirement=rules[id];
  for(const [field,r]of Object.entries(requirement.fields||{})){const fieldPath=r.path||[field],fieldSchema=takePath(value,fieldPath);if(!fieldSchema)continue;fieldSchema.markdownDescription=(fieldSchema.markdownDescription||fieldSchema.description||'')+'\n\nMinimum format version: '+r.min+'.';gate(r.min,body({[id]:fieldShape(fieldPath,fieldSchema)}),body({[id]:fieldShape(fieldPath,{doNotSuggest:true})}));}
  if(requirement.min){value.markdownDescription=(value.markdownDescription||value.description||'')+'\n\nMinimum format version: '+requirement.min+'.';gate(requirement.min,body({[id]:value}),body({[id]:{doNotSuggest:true,description:id+' requires format_version '+requirement.min+' or later.'}}));}
  else (schema.allOf||=[]).push(body({[id]:value}));
 }
 return require('./component-compatibility.cjs').apply(schema,kind,target,atLeastPattern);
}
function choices(index,document,project){
 const current=document.data||(document.tree&&json.getNodeValue(document.tree)),kind=['block','item','entity'].find(k=>current?.['minecraft:'+k]);
 const family=d=>d.side+':'+String(d.relative).split('/')[0];const values=new Set(index.reference?.formatVersions?.[family(document)]||[]);
 for(const other of index.documents.values())if(family(other)===family(document)&&other.relative!=='manifest.json'&&version(other.data?.format_version))values.add(other.data.format_version);
 if(kind){for(const rule of Object.values(catalog.components[kind])){if(rule.min)values.add(rule.min);for(const field of Object.values(rule.fields||{}))values.add(field.min);}if(version(project.config?.targetVersion))values.add(project.config.targetVersion);}
 if(version(current?.format_version))values.add(current.format_version);
 return [...values].filter(v=>!version(project.config?.targetVersion)||compareVersions(v,project.config.targetVersion)<=0).sort((a,b)=>compareVersions(b,a));
}
module.exports={version,directCustom,rule,supported,containers,issues,apply,atLeastPattern,choices};
