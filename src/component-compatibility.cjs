const json=require('jsonc-parser');
const docs=require('./documentation.cjs');
const versions=()=>require('./format-versions.cjs');
const compare=(a,b)=>require('./releases.cjs').compareVersions(a.split('.').length===2?a+'.0':a,b);
const modern=(format,min)=>versions().version(format)&&compare(format,min)>=0;
function nodes(node,keys){if(!node)return [];if(!keys.length)return [node];const [key,...rest]=keys;if(key==='*')return (node.children||[]).flatMap(n=>nodes(node.type==='array'?n:n.children?.[1],rest));return nodes(json.findNodeAtLocation(node,[key]),rest);}
function edits(text,changes){let next=text;for(const change of changes)next=json.applyEdits(next,json.modify(next,change.path,change.value,{formattingOptions:{insertSpaces:true,tabSize:2,eol:text.includes('\r\n')?'\r\n':'\n'}}));let start=0,end=text.length,nextEnd=next.length;while(start<end&&start<nextEnd&&text[start]===next[start])start++;while(end>start&&nextEnd>start&&text[end-1]===next[nextEnd-1]){end--;nextEnd--;}return [{offset:start,length:end-start,text:next.slice(start,nextEnd)}];}
function issues(document,project){const result=[],format=json.findNodeAtLocation(document.tree,['format_version'])?.value;if(!versions().version(format))return result;
 const add=(node,message,kind,id,options={})=>{result.push({file:document.file,offset:node?.offset||0,length:Math.max(1,node?.length||1),severity:'warning',code:'bedrock.componentCompatibility',message,source:docs.componentUrl(kind,id),...options});};
 function rename(object,oldName,newName,kind,id){const node=json.findNodeAtLocation(object,[oldName]);if(!node)return;const conflict=json.findNodeAtLocation(object,[newName]);add(node.parent.children[0],`${oldName} was renamed to ${newName} for this format.${conflict?' Both fields exist; resolve their values manually.':''}`,kind,id,{fixes:conflict?[]:[{title:`Rename ${oldName} to ${newName}`,edits:edits(document.text,[{path:[...json.getNodePath(object),newName],value:json.getNodeValue(node)},{path:[...json.getNodePath(object),oldName],value:undefined}])}]});}
 function experiment(node,id,label,kind,component){if(project.config?.experimentalGameplay?.[id]===true)return;add(node,`${component} requires ${label} for this format. Enable it in project requirements and in the Minecraft world.`,kind,component,{experiment:{id,label}});}
 const rootComponents=json.findNodeAtLocation(document.tree,['minecraft:block','components']);
 for(const {kind,node:container,permutation}of versions().containers(document.tree)){
  const entries=new Map((container.children||[]).map(p=>[p.children[0].value,p.children[1]]));
  const effective=id=>entries.has(id)||(permutation&&!!json.findNodeAtLocation(rootComponents,[id]));
  if(kind==='block'&&modern(format,'1.21.80'))for(const [id,partner]of [['minecraft:geometry','minecraft:material_instances'],['minecraft:material_instances','minecraft:geometry']])if(entries.has(id)&&!effective(partner))add(entries.get(id).parent.children[0],`${id} requires ${partner} from format 1.21.80. A permutation can inherit it from root components.`,kind,id);
  for(const [id,node]of entries){
   if(kind==='entity'&&id==='minecraft:pushable'&&modern(format,'1.26.10'))add(node.parent.children[0],'minecraft:pushable is no longer parsed from format 1.26.10. Use minecraft:pushable_by_entity for entity pushes and minecraft:pushable_by_block for piston and Shulker Box pushes. Add a replacement as {} when its legacy setting is true; omit it when false.',kind,id);
   if(kind==='block'){
    const materialContainers=id==='minecraft:material_instances'?[node]:['minecraft:item_visual','minecraft:embedded_visual'].includes(id)?nodes(node,['material_instances']):[];
    if(modern(format,'1.26.20'))for(const materials of materialContainers)for(const value of nodes(materials,['*','ambient_occlusion']))if(typeof value.value!=='number'||value.value<0||value.value>10)add(value,'ambient_occlusion must be a number from 0 to 10 in format 1.26.20 and newer.',kind,'minecraft:material_instances',{native:true,fixes:typeof value.value==='boolean'?[{title:`Convert ambient_occlusion to ${value.value?1:0}`,edits:[{offset:value.offset,length:value.length,text:value.value?'1':'0'}]}]:[]});
    if(id==='minecraft:redstone_consumer'){
     rename(node,modern(format,'1.26.0')?'propogates_power':'propagates_power',modern(format,'1.26.0')?'propagates_power':'propogates_power',kind,id);
     if(permutation)add(node.parent.children[0],'minecraft:redstone_consumer is not supported in permutations.',kind,id);
     if(!modern(format,'1.26.0'))experiment(node.parent.children[0],'upcomingCreatorFeatures','Upcoming Creator Features',kind,id);
    }
    if(id==='minecraft:precipitation_interactions'){
     const behavior=json.findNodeAtLocation(node,['precipitation_behavior']);
     if(behavior?.value==='snow_log_no_collision'&&modern(format,'1.26.30'))add(behavior,'snow_log_no_collision is deprecated from format 1.26.30; use snowlogging.',kind,id,{fixes:[{title:'Replace with snowlogging',edits:[{offset:behavior.offset,length:behavior.length,text:'"snowlogging"'}]}]});
     if(behavior?.value==='snowlogging'&&!modern(format,'1.26.30'))add(behavior,'snowlogging is named snow_log_no_collision before format 1.26.30.',kind,id,{fixes:[{title:'Use the legacy snow_log_no_collision value',edits:[{offset:behavior.offset,length:behavior.length,text:'"snow_log_no_collision"'}]}]});
     if(['snowlogging','snow_log_no_collision'].includes(behavior?.value)&&!modern(format,'1.26.30'))experiment(behavior,'upcomingCreatorFeatures','Upcoming Creator Features',kind,id);
    }
    if(id==='minecraft:geometry'){
     const layer=json.findNodeAtLocation(node,['culling_layer']);if(layer)experiment(layer,'upcomingCreatorFeatures','Upcoming Creator Features',kind,id);
     const shape=json.findNodeAtLocation(node,['culling_shape']),identifier=json.findNodeAtLocation(node,['identifier'])?.value;
     if(shape&&typeof shape.value==='string'&&!['minecraft:empty','minecraft:unit_cube'].includes(shape.value)&&json.findNodeAtLocation(document.tree,['minecraft:block','description','identifier'])?.value?.startsWith('minecraft:'))experiment(shape,'voxelShapes','Experimental Voxel Shape Features',kind,id);
     if(shape&&shape.value!=='minecraft:empty'&&!json.findNodeAtLocation(node,['culling'])&&identifier!=='minecraft:geometry.full_block')add(shape,'A non-empty culling_shape needs a culling rule to affect adjacent faces.',kind,id);
    }
   }
   if(kind==='entity'&&id==='minecraft:ageable')for(const item of nodes(node,['feed_items','*']))if(item.type==='object')rename(item,modern(format,'1.21.130')?'transform_to_item':'result_item',modern(format,'1.21.130')?'result_item':'transform_to_item',kind,id);
   if(kind==='item'){
    if(id==='minecraft:food'&&modern(format,'1.20.50')&&!entries.has('minecraft:use_modifiers'))add(node.parent.children[0],'minecraft:food requires minecraft:use_modifiers to control its use duration.',kind,id);
    if(id==='minecraft:food'&&modern(format,'1.20.0')){const removed=json.findNodeAtLocation(node,['remove_effects']);if(removed)add(removed.parent.children[0],'minecraft:food.remove_effects is no longer supported from format 1.20.0. Use script behavior for effect removal.',kind,id,{fixes:[{title:'Remove unsupported remove_effects (changes behavior)',edits:edits(document.text,[{path:json.getNodePath(removed),value:undefined}])}]});}
    if(id==='minecraft:chargeable'&&modern(format,'1.20.50')){if(node.type==='object'&&(node.children||[]).every(p=>['movement_modifier','use_duration'].includes(p.children[0].value)))rename(container,'minecraft:chargeable','minecraft:use_modifiers',kind,'minecraft:use_modifiers');else add(node.parent.children[0],'minecraft:chargeable was replaced by minecraft:use_modifiers from format 1.20.50. Legacy events need a manual script migration.',kind,'minecraft:use_modifiers');}
   }
  }
 }
 return result;
}
function apply(schema,kind,target,pattern){
 schema=structuredClone(schema);const present=new Set();let ageableFeed=false;function collect(node){if(!node||typeof node!=='object')return;for(const key of Object.keys(node.properties||{}))if(key.startsWith('minecraft:')){present.add(key);if(key==='minecraft:ageable'&&node.properties[key].properties?.feed_items)ageableFeed=true;}for(const value of Object.values(node))if(Array.isArray(value))value.forEach(collect);else if(value&&typeof value==='object')collect(value);}collect(schema);
 const body=original=>{const properties=Object.fromEntries(Object.entries(original).map(([id,value])=>[id,{...value,doNotSuggest:true}]));return ({properties:{['minecraft:'+kind]:{properties:{components:{properties},...(kind==='block'?{permutations:{items:{properties:{components:{properties}}}}}:{}),...(kind==='entity'?{component_groups:{additionalProperties:{properties}}}:{})}}}});};
 const gate=(min,current,legacy)=>{(schema.allOf||=[]).push({if:{required:['format_version'],properties:{format_version:{type:'string',pattern:pattern(min)}}},then:body(current),else:body(legacy)});};
 const link=(description,id)=>({description,markdownDescription:description+'\n\n'+docs.componentLink(kind,id)});
 function strip(node){if(!node||typeof node!=='object')return;
  for(const [id,value]of Object.entries(node.properties||{})){
   if(kind==='block'&&id==='minecraft:redstone_consumer'){if(value.properties)delete value.properties.propagates_power;if(value.patternProperties)delete value.patternProperties['^propogates_power'+'$'];}
   if(kind==='block'&&id==='minecraft:precipitation_interactions'&&value.properties)delete value.properties.precipitation_behavior;
   if(kind==='entity'&&id==='minecraft:ageable'&&value.properties?.feed_items){const prune=node=>{if(!node||typeof node!=='object')return;if(node.properties){delete node.properties.transform_to_item;delete node.properties.result_item;}for(const child of Object.values(node))if(Array.isArray(child))child.forEach(prune);else if(child&&typeof child==='object')prune(child);};prune(value.properties.feed_items);}
   if(kind==='item'&&id==='minecraft:chargeable')value.doNotSuggest=true;
  }
  for(const value of Object.values(node))if(Array.isArray(value))value.forEach(strip);else if(value&&typeof value==='object')strip(value);
 }
 strip(schema);
 if(kind==='block'){
  if(schema.definitions?.material?.properties)delete schema.definitions.material.properties.ambient_occlusion;
  // Inline copies created by minimum-version rules also need the old union removed.
  function stripAmbient(node){if(!node||typeof node!=='object')return;if(node.properties&&Object.hasOwn(node.properties,'ambient_occlusion'))delete node.properties.ambient_occlusion;for(const value of Object.values(node))if(Array.isArray(value))value.forEach(stripAmbient);else if(value&&typeof value==='object')stripAmbient(value);}stripAmbient(schema);
  const materialFields=field=>({'minecraft:material_instances':{patternProperties:{['^.*'+'$']:{properties:{ambient_occlusion:field}}}},...Object.fromEntries(['minecraft:item_visual','minecraft:embedded_visual'].map(id=>[id,{properties:{material_instances:{patternProperties:{['^.*'+'$']:{properties:{ambient_occlusion:field}}}}}}]))});
  const materials=field=>Object.fromEntries(Object.entries(materialFields(field)).filter(([id])=>present.has(id)));
  if(present.has('minecraft:material_instances')||present.has('minecraft:item_visual')||present.has('minecraft:embedded_visual'))gate('1.26.20',materials({type:'number',minimum:0,maximum:10,...link('Ambient occlusion exponent, from 0 to 10. Boolean forms were removed in format 1.26.20.','minecraft:material_instances')}),materials({type:['boolean','number'],...link('Legacy ambient occlusion, accepting boolean or numeric values before format 1.26.20.','minecraft:material_instances')}));
  const renamed=(current,old)=>({'minecraft:redstone_consumer':{properties:{[current]:{type:'boolean',...link('Whether the redstone signal can pass through this block.','minecraft:redstone_consumer')},[old]:{doNotSuggest:true}}}});
  if(present.has('minecraft:redstone_consumer'))gate('1.26.0',renamed('propagates_power','propogates_power'),renamed('propogates_power','propagates_power'));
  const rain=name=>({'minecraft:precipitation_interactions':{properties:{precipitation_behavior:{anyOf:[{type:'string',enum:['none','obstruct_rain','obstruct_rain_accumulate_snow',name]},{type:'string'}],...link('Rain and snow interaction. The snowlogging spelling begins in format 1.26.30.','minecraft:precipitation_interactions')}}}});
  if(present.has('minecraft:precipitation_interactions'))gate('1.26.30',rain('snowlogging'),rain('snow_log_no_collision'));
 }
 if(kind==='entity'&&present.has('minecraft:ageable')&&ageableFeed){
  const feed=(current,old)=>({'minecraft:ageable':{properties:{feed_items:{items:{properties:{[current]:{type:'string',...link('Item created after feeding this ingredient. Renamed to result_item in format 1.21.130.','minecraft:ageable')},[old]:{doNotSuggest:true}}}}}}});
  gate('1.21.130',feed('result_item','transform_to_item'),feed('transform_to_item','result_item'));
 }
 return schema;
}
module.exports={issues,nodes,edits,apply};
