// Workbench-owned Molang authoring. Unknown runtime symbols are deliberately valid.
const json=require('jsonc-parser');
const catalog=require('./authoring-data.cjs').get('src/molang-catalog.json');
const guidance=require('./authoring-data.cjs').get('src/molang-guidance.json');
const syntaxUrl='https://learn.microsoft.com/en-us/minecraft/creator/documents/molang/syntax-guide';
const canonical=name=>name.toLowerCase().replace(/^q\./,'query.').replace(/^v\./,'variable.').replace(/^t\./,'temp.').replace(/^c\./,'context.');
const parameterNames={
 'query.block_state':['state_name'],'query.has_block_state':['state_name'],'query.property':['property_name'],'query.has_property':['property_name'],
 'query.is_item_name_any':['slot','item_name','...item_names'],'query.is_item_equipped':['hand'],'query.bone_aabb':['bone_name'],
 'query.bone_origin':['bone_name'],'query.bone_rotation':['bone_name'],'query.get_equipped_item_name':['hand'],
 'query.all':['value','candidate','candidate','...candidates'],'query.any':['value','candidate','candidate','...candidates'],
 'query.in_range':['value','minimum','maximum'],'query.approx_eq':['value','candidate','...candidates'],
 'query.above_top_solid':['x','z'],'query.position':['axis'],'query.camera_rotation':['axis'],
 'query.is_name_any':['name','...names'],'query.is_family':['family','...families'],
 'query.all_tags':['tag','...tags'],'query.any_tag':['tag','...tags'],'query.equipped_item_all_tags':['slot','tag','...tags'],'query.equipped_item_any_tag':['slot','tag','...tags'],
 'query.block_has_all_tags':['x','y','z','tag','...tags'],'query.block_has_any_tag':['x','y','z','tag','...tags'],
 'query.block_neighbor_has_all_tags':['x','y','z','tag','...tags'],'query.block_neighbor_has_any_tag':['x','y','z','tag','...tags'],
};
const entries=[], byName=new Map();
function refreshCatalog(){
const next=catalog.entries.map(e=>({...e,...guidance.entries[e.name],parameters:guidance.entries[e.name]?.parameters||parameterNames[e.name]||e.parameters||(e.minArgs>0?Array.from({length:e.minArgs},(_,i)=>'argument_'+(i+1)):undefined),returns:({float:'number',bool:'boolean (0.0 or 1.0)',actor_single:'entity reference',actor_array:'entity reference array',member_array:'structure'})[e.returns]||e.returns||(e.name.startsWith('math.')?'number':'runtime value')}));
entries.splice(0,entries.length,...next); byName.clear(); for(const entry of entries)byName.set(entry.name,entry);
const removedSince={ 'query.dash_cooldown_progress':'1.20.50','query.is_feeling_happy':'1.20.50','query.is_rising':'1.20.50','query.is_scenting':'1.20.50' };
for(const e of entries)if(removedSince[e.name])e.removedSince=removedSince[e.name];
// Legacy spellings remain available without treating current names as a version error.
for(const [name,replacement]of [['query.block_property','query.block_state'],['query.has_block_property','query.has_block_state']])if(!byName.has(name)){
 const e={...byName.get(replacement),name,description:`Legacy spelling of ${replacement}. Preserve older pack behavior; deprecated since 1.20.40.`,legacy:true,url:syntaxUrl+'#versioned-changes'};entries.push(e);byName.set(name,e);
}
}
refreshCatalog();
require('./authoring-data.cjs').subscribe(refreshCatalog);
const constructs=[
 {name:'return',insert:'return ${1:0};',description:'Return a value and stop the current expression.'},
 {name:'loop',parameters:['count','expression'],insert:'loop(${1:count}, { ${2} });',description:'Repeat an expression. The runtime caps the loop count at 1024.'},
 {name:'for_each',parameters:['variable','array','expression'],insert:'for_each(${1:temp.entity}, ${2:array}, { ${3} });',description:'Iterate over an entity array using a temporary or entity variable.'},
 {name:'break',insert:'break;',description:'Exit the innermost loop or for_each.'},
 {name:'continue',insert:'continue;',description:'Advance to the next iteration of loop or for_each.'},
 {name:'this',description:'The current value of the destination being evaluated; availability depends on the expression field.'},
 {name:'true',description:'Boolean true (1.0).'}, {name:'false',description:'Boolean false (0.0).'},
 ...['query.','math.','variable.','temp.','context.'].map(name=>({name,description:({ 'query.':'Read game data.','math.':'Numeric functions (angles use degrees).','variable.':'Entity-lifetime read/write storage.','temp.':'Read/write storage scoped to this expression.','context.':'Read-only values provided by the current runtime context.'})[name]})),
 ...['+','-','*','/','!','&&','||','==','!=','<','<=','>','>=','??','? :','->'].map(name=>({name,...(name==='? :'?{insert:'? ${1:when_true} : ${2:when_false}'}:{}),description: name==='??'?'Use a fallback for an unavailable variable or entity reference. Resources must still exist.':'Molang operator; see the syntax guide.'}))
].map(e=>({...e,url:syntaxUrl,returns:e.returns||'context dependent'}));
const runtimeValues=[
 ...['emitter','particle'].flatMap(group=>[
  {name:'variable.'+group+'_age',description:'Elapsed age of the '+group+(group==='emitter'?' in its current loop.':'.')},
  {name:'variable.'+group+'_lifetime',description:'Lifetime of the '+group+(group==='emitter'?' loop.':'.')},
  ...[1,2,3,4].map(n=>({name:'variable.'+group+'_random_'+n,description:'Random value from 0 to 1, constant for this '+group+(group==='emitter'?' loop.':' lifetime.')}))
 ]),{name:'variable.entity_scale',description:'Scale of the entity to which the effect is attached.'}
].map(e=>({...e,kind:'particle',returns:'number',url:'https://learn.microsoft.com/en-us/minecraft/creator/reference/content/particlesreference/particlemolangintegration'}));
runtimeValues.push({name:'context.item_slot',kind:'geometry',returns:'slot',description:'Item slot supplied to a geometry bone binding.',url:'https://learn.microsoft.com/en-us/minecraft/creator/documents/attachables'});
function lex(text){
 const tokens=[];let i=0;
 while(i<text.length){if(/\s/.test(text[i])){i++;continue;}const start=i;
  if(text[i]==="'"){i++;while(i<text.length&&text[i]!=="'")i++;if(i<text.length)i++;tokens.push({value:text.slice(start,i),start,end:i,type:'string',closed:text[i-1]==="'"&&i>start+1});continue;}
  const match=/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?[fF]?|^[a-z_][\w]*(?:\.[\w]+)*|^(?:->|==|!=|>=|<=|&&|\|\||\?\?)/i.exec(text.slice(i));
  if(match)i+=match[0].length;else i++;
  const value=text.slice(start,i);tokens.push({value,start,end:i,type:/^[a-z_]/i.test(value)?'id':/^(?:\d|\.\d)/.test(value)?'number':'symbol'});
 }return tokens;
}
function field(document,node){
 const relative=(document.relative||'').replace(/^subpacks\/[^/]+\//,'');
 if(!/^(?:(?:animations|animation_controllers|render_controllers|particles|entity|entities|attachables|blocks|items|features|feature_rules|biomes|spawn_rules|models)\/|sounds\.json$)/.test(relative))return;
 if(node.type!=='string'||node.value.length>65536)return;
 const p=json.getNodePath(node),key=node.parent?.type==='property'&&node.parent.children[0]===node;
 if(key)return;
 const root=p[0],tail=p.at(-1),has=k=>p.includes(k);
 if(has('minecraft:tags'))return; // Declared tags are literal names, unlike descriptor tag predicates.
 if(['minecraft:client_entity','minecraft:attachable','minecraft:entity'].includes(root)&&p[1]==='description'){
  if(['animations','geometry','textures','materials'].includes(p[2]))return;
  if(p[2]==='render_controllers'&&typeof tail==='number')return;
  if(p[2]==='scripts'&&p[3]==='animate'&&p.length===5&&typeof tail==='number')return;
 }
 if(root==='animation_controllers'&&p[2]==='states'&&p[4]==='animations'&&p.length===6&&typeof tail==='number')return;
 if(has('scripts')&&has('variables')&&['minecraft:client_entity','minecraft:attachable','minecraft:entity'].includes(root))return;
 if(root==='minecraft:entity'&&(has('set_property')||p[1]==='description'&&p[2]==='properties'&&tail==='default')){
  const property=has('set_property')?tail:p[3],definition=json.findNodeAtLocation(document.tree,[root,'description','properties',property]),type=definition&&json.getNodeValue(definition)?.type;
  if(type==='enum'&&!/\b(?:q|query|math|v|variable|t|temp|c|context)\.|['();?=+*/]/i.test(node.value))return;
  return 'behavior';
 }
 if(ownedExpression(root,p))return document.side==='resource'?'entity':root==='minecraft:block'?'block':'behavior';
 if(relative==='sounds.json'&&has('variants')&&tail==='key')return 'sound';
 if(root==='minecraft:geometry'&&tail==='binding')return 'geometry';
 if(root==='animations'){
  if(tail==='lerp_mode'||tail==='loop'&&node.value==='hold_on_last_frame')return;
  if(has('bones')||has('animation_length')||has('anim_time_update')||has('blend_weight')||has('start_delay')||has('loop_delay')||has('loop')||has('pre_animation'))return 'animation';
  if(has('timeline')&&!/^\s*(?:@|\/)/.test(node.value))return 'animation';
  if(tail==='pre_effect_script'||tail==='bind_to_actor')return 'animation';
 }
 if(root==='animation_controllers'){
  if(has('transitions')||has('on_entry')||has('on_exit')||has('blend_transition')||has('blend_via_shortest_path')||has('variables')){
   if((has('on_entry')||has('on_exit'))&&/^\s*(?:@|\/)/.test(node.value))return;
   return 'controller';
  }
  if(has('animations')&&typeof tail!=='number')return 'controller';
  if(tail==='pre_effect_script'||tail==='bind_to_actor')return 'controller';
 }
 if(root==='render_controllers'&&!has('arrays'))return 'render';
 if(root==='render_controllers'&&has('arrays'))return 'render';
 if(['minecraft:client_entity','minecraft:attachable','minecraft:entity'].includes(root)&&p[1]==='description'){
  if(has('scripts')&&!has('variables')&&!(has('animate')&&typeof tail==='number'))return root==='minecraft:attachable'?'attachable':'entity';
  if(has('render_controllers')&&typeof tail!=='number')return 'render';
 }
 if(['minecraft:particle_effect','particle_effect'].includes(root)){
  if(p[1]==='curves'&&(['input','horizontal_range','value','left_value','right_value','slope','left_slope','right_slope','expression'].includes(tail)||has('nodes')&&typeof tail==='number'))return 'particle';
  if(p[1]==='events'&&(has('expression')||has('pre_effect_expression'))&&tail!=='version')return 'particle';
  if(p[1]==='components'&&!['material','texture','mode','facing_camera_mode','direction','relative_position'].includes(tail)&&!p.some(k=>/expire_if_(?:not_)?in_blocks/.test(k))&&!/^#[0-9a-f]{6,8}$/i.test(node.value))return 'particle';
 }
 // Known expression-bearing behavior fields, including empty strings.
 if(root==='minecraft:block'&&has('permutations')&&tail==='condition')return 'block';
 if(/^minecraft:(?:block|item|entity)$/.test(root)){
  if(has('set_variable')||has('set_property')||tail==='expression'||tail==='molang'||tail==='pre_effect_script')return 'behavior';
  if(tail==='condition'&&!has('filters'))return 'behavior';
  if(has('minecraft:experience_reward')&&['on_bred','on_death'].includes(tail)||has('minecraft:heartbeat')&&tail==='interval'||has('minecraft:reflect_projectiles')&&['azimuth_angle','reflection_chance'].includes(tail)||has('minecraft:behavior.eat_block')&&tail==='success_chance')return 'behavior';
  if(tail==='tags'||tail==='repair_amount'||has('bone_visibility')||tail==='rotate_rider_by')return 'behavior';
 }
 if(/^(?:feature_rules|features|biomes)\//.test(relative)&&(['iterations','scatter_chance','x','y','z','extent','numerator','denominator','expression','condition'].includes(tail)||typeof tail==='number'&&(has('extent')||has('height_range'))))return 'worldgen';
 // Only expression-capable families use lexical fallback. Ordinary IDs/commands are excluded.
 if(/^(?:animations|animation_controllers|render_controllers|particles|entity|entities|attachables|blocks|items|features|feature_rules|biomes)\//.test(relative)&&!/^\s*(?:@|\/)/.test(node.value)&&/\b(?:query|q|math|variable|v|temp|t|context|c)\.|^\s*(?:return\b|loop\s*\(|for_each\s*\()/i.test(node.value))return document.side==='behavior'?'behavior':'entity';
}
const ownedSchemas=new Map();
function ownedExpression(root,keys){
 const file={'minecraft:entity':'entity','minecraft:block':'block','minecraft:item':'item','minecraft:client_entity':'client-entity'}[root];if(!file)return false;
 if(!ownedSchemas.has(file))ownedSchemas.set(file,require('./authoring-data.cjs').get('schemas/'+file+'.schema.json'));
 const schema=ownedSchemas.get(file),seen=new Set();
 function visit(s,i){if(!s||typeof s!=='object')return false;const identity=i+':'+(s.$ref||'');if(s.$ref){if(seen.has(identity))return false;seen.add(identity);const target=s.$ref.startsWith('#/')?s.$ref.slice(2).split('/').reduce((o,k)=>o?.[k],schema):undefined;const found=visit(target,i);seen.delete(identity);if(found)return true;}
  if(i===keys.length)return /\bMolang\b|Expression to evaluate/i.test(s.description||'');
  for(const kind of ['anyOf','oneOf','allOf'])if(s[kind]?.some(b=>visit(b,i)))return true;
  const key=keys[i];if(typeof key==='number')return visit(s.items,i+1);
  if(s.properties?.[key])return visit(s.properties[key],i+1);
  if(Object.entries(s.patternProperties||{}).some(([pattern,child])=>new RegExp(pattern).test(key)&&visit(child,i+1)))return true;
  if(visit(s.additionalProperties,i+1))return true;
  return /\bMolang\b/i.test(s.description||'')&&s.type==='object'&&!s.properties;
 }return visit(schema,0);
}
function nodes(document){const result=[];function walk(n){if(field(document,n))result.push(n);for(const c of n.children||[])walk(c);}if(document.tree)walk(document.tree);return result;}
function offsets(document,node){
 const result=[],raw=document.text.slice(node.offset+1,node.offset+node.length),closed=raw.endsWith('"'),end=raw.length-(closed?1:0);let i=0;
 while(i<end){result.push(node.offset+1+i);i+=raw[i]==='\\'?(raw[i+1]==='u'?6:2):1;}
 result.push(node.offset+1+end);return result;
}
function decodedOffset(document,node,raw){const map=offsets(document,node);let i=0;while(i+1<map.length&&map[i+1]<=raw)i++;return i;}
function info(name){const id=canonical(name);return byName.get(id)||constructs.find(e=>e.name===id)||byName.get(id.replace(/\.[^.]+$/,''));}
function forChannel(e,index){const preview=index?.project?.config?.target==='preview',value={...e,...(preview?e.previewDocumentation:{}),...(preview?e.preview:{})};value.url=(value.source||value.url)?.replace(/view=minecraft-bedrock-(?:stable|experimental)/g,'view=minecraft-bedrock-'+(preview?'experimental':'stable'));return value;}
function parameterDescription(e,p){const name=p.replace(/^\.\.\./,'');if(/^argument_\d+$/.test(name))return 'Positional argument; the function description documents its meaning.';
 const reviewed={slot_index:'Numeric index required for equipment slots containing multiple entries, such as slot.hotbar.',rendered_item:'0 selects the equipped item; a nonzero value selects the currently rendered item.',cooldown_type:'Quoted cooldown category.',setting_name:'Quoted pack setting name.',selection:'Quoted dropdown or multiselect value.',graphics_mode:'One of simple, fancy, deferred or raytraced.',graphics_modes:'Additional graphics modes to match.',entity_reference:'An entity reference or array to combine; duplicates and invalid references are removed.',entity_references:'Additional entity references or arrays.',equipment_slot:'Quoted equipment-slot name.',component_group:'Quoted component group name from previously saved entity data.'};if(reviewed[name])return reviewed[name];
 if(name==='value'&&/^math\.(sin|cos)$/.test(e.name))return 'Input angle in degrees.';
 return ({value:'Input value.',min:'Inclusive lower bound.',max:'Inclusive upper bound.',minimum:'Lower end of the range.',maximum:'Upper end of the range.',start:'Starting value.',end:'Ending value.','0_to_1':'Interpolation progress from 0 to 1.',low:'Lowest random value.',high:'Highest random value.',num:'Number of random rolls to sum.',denominator:'Divisor used to compute the remainder.',base:'Value raised to a power.',exponent:'Power applied to the base.',state_name:'Quoted block-state identifier.',property_name:'Quoted entity-property identifier.',bone_name:'Quoted bone name from the queryable geometry.',slot:'Quoted equipment slot.',hand:'Hand slot; see the function description for accepted names or indices.',tag:'Quoted tag to test.',tags:'Additional quoted tags.',axis:'Requested axis; see the function description for supported indices.',name:'Quoted entity name.',item_name:'Quoted item identifier.',distance:'Search distance.',entity_type:'Quoted entity type.',count:'Number of loop iterations; at most 1024 execute.',expression:'Expression or brace scope evaluated each iteration.',variable:'Variable receiving the current entity reference.',array:'Array of entity references.',candidate:'Value compared with the first argument.',candidates:'Additional comparison values.'})[name]||'Input '+name+'.';
}
function markdown(e){const params=e.parameters;return '`'+e.name+(params?'('+params.join(', ')+')':'')+'`\n\n'+e.description+'\n\nReturns: '+e.returns+'.'+(e.internal?'\n\nListed by Learn as internal/deprecated. Existing legacy uses are preserved.':'')+(e.removedSince?'\n\nUnavailable with pack min_engine_version >= '+e.removedSince+'.':'')+(e.formatMinimum?'\n\nLearn lists a format-version minimum of '+e.formatMinimum+'. This is guidance, not an inferred first engine introduction or a historical-compatibility error.':'')+(e.withoutExperimentSince?'\n\nDocumented without an experimental toggle starting in '+e.withoutExperimentSince+'.':'')+(e.overloads?'\n\nSignatures: '+e.overloads.map(p=>'`'+e.name+'('+p.join(', ')+')`').join(' / '):'')+(e.restrictions?.length?'\n\nUsage: '+e.restrictions.join(' '):'')+(params?.length?'\n\nParameters:\n\n'+params.map(p=>'- `'+p+'`: '+parameterDescription(e,p)).join('\n'):'')+'\n\n[Microsoft Learn]('+e.url+')';}
function hover(document,node,raw,index){const pos=decodedOffset(document,node,raw),token=lex(node.value).find(t=>t.start<=pos&&t.end>pos)||lex(node.value).find(t=>t.end===pos);if(!token||token.type==='string')return;const e=info(token.value)||runtimeValues.find(e=>e.name===canonical(token.value)&&e.kind===field(document,node));if(e){const version=packVersion(document,index),format=json.findNodeAtLocation(document.tree,['format_version'])?.value,target=index?.project?.config;const description=markdown(forChannel(e,index)).replace(/view=minecraft-bedrock-stable/g,target?.target==='preview'?'view=minecraft-bedrock-experimental':'view=minecraft-bedrock-stable');return {markdown:description+(version?'\n\nPack Molang rules: '+version+'.':'')+(format?' Document format: '+format+'.':'')+(target?' Target: '+target.target+' '+target.targetVersion+'.':''),start:token.start,end:token.end};}
 if(/^(variable|temp|context)\./.test(canonical(token.value))){const external=require('./molang-bindings.cjs').external(node.value,token.start),definitions=require('./molang-bindings.cjs').definitions(index,document,node,raw);return {markdown:'`'+token.value+'`\n\n'+(external?'Runtime actor member. The target identity is not statically established.':({variable:'Entity storage. May be initialized by another expression or the runtime.',temp:'Temporary storage in this expression; nested braces introduce scope.',context:'Read-only value supplied by the current runtime context.'})[canonical(token.value).split('.')[0]])+(definitions.length?'\n\nKnown declarations: '+[...new Set(definitions.map(d=>d.document.relative))].join(', '):'')+'\n\n[Microsoft Learn]('+syntaxUrl+'#variables)',start:token.start,end:token.end};}
 const definitions=require('./molang-bindings.cjs').definitions(index,document,node,raw);if(definitions.length)return {markdown:'`'+token.value+'`\n\nProject binding in '+[...new Set(definitions.map(d=>d.document.relative))].join(', ')+'.\n\n[Microsoft Learn]('+syntaxUrl+'#values)',start:token.start,end:token.end};

 const call=signature(document,node,raw);if(call&&token.type==='number'){const p=call.entry.parameters[call.parameter];return {markdown:'`'+p+'` in `'+call.entry.name+'`\n\n'+parameterDescription(call.entry,p)+'\n\n[Microsoft Learn]('+call.entry.url+')',start:token.start,end:token.end};}
}
function restrictions(document,node){const p=json.getNodePath(node);if(p[0]==='minecraft:block'&&(p.includes('bone_visibility')||p[1]==='permutations'&&p.at(-1)==='condition'))return {queries:['query.block_state','query.block_property'],url:'https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockstatesandpermutations'};
 if(p[0]==='minecraft:entity'&&p[1]==='description'&&p[2]==='properties'&&p.at(-1)==='default')return {queries:['query.had_component_group'],variables:'none',url:'https://learn.microsoft.com/en-us/minecraft/creator/documents/introductiontoentityproperties#default-value-restrictions'};
 if(p[0]==='minecraft:entity'&&p.includes('set_property'))return {queries:['query.property','query.has_property'],variables:'read',url:'https://learn.microsoft.com/en-us/minecraft/creator/documents/introductiontoentityproperties#property-change-restrictions'};
}
function allowed(e,document,node){const kind=field(document,node),description=[e.description,...e.restrictions||[]].join(' '),limits=restrictions(document,node);
 if(limits&&e.name.startsWith('query.')&&!limits.queries.includes(e.name))return false;
 if(limits?.variables==='none'&&/^(?:variable|temp)\./.test(e.name))return false;
 if(/only valid in an animation controller|only.*animation controllers?/i.test(description)&&kind!=='controller')return false;
 if(/(?:server.side only|server only|only available on the server)/i.test(description)&&document.side==='resource')return false;
 if(/(?:client.side only|client only|only available on the client)/i.test(description)&&document.side==='behavior')return false;
 if(e.querySets?.length&&!e.querySets.includes('default')&&e.querySets.every(s=>s==='world_gen')&&kind!=='worldgen')return false;
 if(e.querySets?.includes('tags')&&!e.querySets.includes('default')&&json.getNodePath(node).at(-1)!=='tags')return false;
 if(json.getNodePath(node).at(-1)==='tags'&&e.name.startsWith('query.')&&!e.querySets?.includes('tags'))return false;
 return true;
}
function variables(document,node,index,pos=node.value.length){
 const result=new Map(),path=json.getNodePath(node);
 for(const symbol of require('./molang-bindings.cjs').symbols(index,document,node)){
  if(result.has(symbol.name)&&symbol.kind==='variable observation')continue;
  if(symbol.kind==='resource binding'&&(!['render','geometry'].includes(field(document,node))||symbol.name.startsWith('animation.')))continue;
  result.set(symbol.name,{name:symbol.name,description:symbol.kind+' in '+symbol.document.relative+'. Runtime initialization is not guaranteed.',url:syntaxUrl+'#variables',returns:symbol.kind.startsWith('resource')?'resource':'runtime value'});
 }
 const stack=[],temp=[],unit=units(document).find(u=>u.nodes.includes(node));
 let preceding=0;for(const part of unit?.nodes||[]){if(part===node)break;preceding+=part.value.length+1;}
 for(const token of lex((unit?.text||node.value).slice(0,preceding+pos))){if(token.value==='{')stack.push(token.start);else if(token.value==='}')stack.pop();else if(canonical(token.value).startsWith('temp.'))temp.push({name:canonical(token.value),scope:[...stack]});}
 for(const t of temp)if(t.scope.every((v,i)=>stack[i]===v))result.set(t.name,{name:t.name,description:'Temporary value observed in the current expression scope.',url:syntaxUrl+'#variables',returns:'runtime value'});
 return [...result.values()];
}
function completions(document,node,raw,index){
 const pos=decodedOffset(document,node,raw),text=node.value,before=text.slice(0,pos),tokens=lex(text);
 const string=tokens.find(t=>t.type==='string'&&t.start<pos&&(pos<t.end||!t.closed&&pos===t.end));
 if(string)return argumentCompletions(document,node,raw,index,string,pos);
 const prefix=/[a-z_][\w.]*$/i.exec(before)?.[0]||'',start=pos-prefix.length,end=pos+(/^[\w.]*/.exec(text.slice(pos))?.[0].length||0),alias=/^[qvtc]\./i.exec(prefix)?.[0];
 const localVariables=require('./molang-bindings.cjs').external(text,start)?[]:variables(document,node,index,pos);
 const candidates=[...entries.filter(e=>!e.channels||e.channels.includes(index?.project?.config?.target==='preview'?'preview':'release')).map(e=>forChannel(e,index)).filter(e=>allowed(e,document,node)&&(!e.internal||node.value.toLowerCase().includes(e.name)||packVersion(document,index)&&require('./releases.cjs').compareVersions(packVersion(document,index),'1.20.40')<0)),...constructs,...runtimeValues.filter(e=>e.kind===field(document,node)),...localVariables].filter(e=>allowed(e,document,node));
 if(field(document,node)==='attachable')candidates.push({name:'context.owning_entity',description:'Entity wearing this attachable.',url:syntaxUrl,returns:'entity reference'});
 const unique=new Map();
 for(const e of candidates){const name=alias?e.name.replace(/^(query|variable|temp|context)\./,p=>({ 'query.':'q.','variable.':'v.','temp.':'t.','context.':'c.'})[p]):e.name;if(!name.toLowerCase().startsWith(prefix.toLowerCase()))continue;
  if(name===prefix&&name.endsWith('.'))continue;
  if(['break','continue'].includes(name)&&!activeLoop(tokens.filter(t=>t.start<pos)))continue;
  if(/^[+*/<>=?&|!-]/.test(name)&&!/[\w)'\]]\s*$/.test(before.slice(0,start)))continue;
  let insert=e.insert||name,parameters=e.parameters;
  if(parameters?.length&&!e.insert&&!/^\s*\(/.test(text.slice(end)))insert=name+'('+parameters.filter(p=>!p.startsWith('...')).map((p,i)=>{const placeholder='${'+(i+1)+':'+(p==='slot_index'?'0':p)+'}';return /^(?:state_name|property_name|bone_name|item_name|name|slot|tag|entity_type|equipment_slot|component_group|setting_name|selection|graphics_mode|cooldown_type)$/.test(p)?"'"+placeholder+"'":placeholder;}).join(', ')+')';
  if(/^\s*\(/.test(text.slice(end)))insert=name;
  unique.set(name,{...e,name,insert,start,end});
 }return [...unique.values()];
}
function argumentCompletions(document,node,raw,index,string,pos){const call=signature(document,node,raw,index);if(!call)return [];const name=call.entry.name,prefix=node.value.slice(string.start+1,pos),values=new Set(),data=document.data||json.getNodeValue(document.tree);
 if(!call.external&&['query.property','query.has_property'].includes(name)&&call.parameter===0){
  const owners=data['minecraft:entity']?[document]:index?require('./linked-entities.cjs').propertyOwners(index,document,json.getNodePath(node)):[];
  const groups=owners.map(d=>Object.entries((d.data||json.getNodeValue(d.tree))['minecraft:entity']?.description?.properties||{}).filter(([,p])=>document.side!=='resource'||p.client_sync===true).map(([id])=>id));
  if(groups.length)for(const id of groups[0])if(groups.every(g=>g.includes(id)))values.add(id);
 }
 if(!call.external&&['query.block_state','query.has_block_state','query.block_property','query.has_block_property'].includes(name)&&call.parameter===0){const desc=data['minecraft:block']?.description;for(const id of Object.keys(desc?.states||{}))values.add(id);for(const trait of Object.values(desc?.traits||{}))for(const id of trait.enabled_states||[])values.add(id);}
 if(name==='query.is_item_name_any'&&call.parameter>0){for(const id of index?.values?.('item').keys()||[])values.add(id);for(const id of index?.reference?.vanilla?.item||[])values.add(id);}
 return [...values].filter(id=>id.startsWith(prefix)&&!id.includes("'")).map(id=>({name:id,insert:id,start:string.start+1,end:string.closed?string.end-1:string.end,description:'Project reference valid for this Molang argument.',url:call.entry.url,returns:'identifier'}));
}
function activeLoop(tokens){const stack=[];let previous;for(const t of tokens){if(['(','[','{'].includes(t.value))stack.push(t.value==='('&&['loop','for_each'].includes(previous?.value.toLowerCase())?'loop':t.value);else if([')',']','}'].includes(t.value))stack.pop();previous=t;}return stack.includes('loop');}
function signature(document,node,raw,index){const pos=decodedOffset(document,node,raw),stack=[];let previous;
 for(const token of lex(node.value).filter(t=>t.start<pos)){
  if(token.value==='(')stack.push({entry:previous?.type==='id'?info(previous.value):undefined,parameter:0,arguments:[],argumentStart:token.end,external:previous?.type==='id'&&require('./molang-bindings.cjs').external(node.value,previous.start)});
  else if(token.value==='['||token.value==='{')stack.push({});
  else if([')',']','}'].includes(token.value))stack.pop();
  else if(token.value===','&&stack.length&&stack.at(-1).entry){const call=stack.at(-1);call.arguments.push(node.value.slice(call.argumentStart,token.start));call.argumentStart=token.end;call.parameter++;}
  previous=token;
 }
 const call=[...stack].reverse().find(s=>s.entry&&(s.entry.parameters?.length||s.entry.overloads?.some(p=>p.length)));if(!call)return;
 const base=forChannel(call.entry,index),overloads=base.overloads||[base.parameters],args=[...call.arguments,node.value.slice(call.argumentStart,pos)];
 let active=overloads.findIndex(p=>p.length>call.parameter);if(active<0)active=overloads.length-1;
 if(base.name==='query.is_item_name_any')active=/^\s*[+-]?(?:\d|\.\d)/.test(args[1]||'')||/^\s*'slot.hotbar'/.test(args[0]||'')?1:0;
 if(base.name==='query.cooldown_time_remaining'&&/^\s*'slot\./.test(args[0]||''))active=overloads.length-1;
 const signatures=overloads.map(parameters=>({...base,parameters})),entry=signatures[active];
 return {...call,entry,signatures,activeSignature:active,parameter:Math.max(0,Math.min(call.parameter,entry.parameters.length-1))};
}

function errors(text){
 const tokens=lex(text),result=[],stack=[],pairs={')':'(',']':'[','}':'{'},names={'(':'parenthesis','[':'bracket','{':'brace'};let maxDepth=0;
 const add=(t,message)=>result.push({start:t.start,end:Math.max(t.start+1,t.end),message});
 for(const t of tokens){if(['(','[','{'].includes(t.value)){stack.push(t);maxDepth=Math.max(maxDepth,stack.length);}
  else if(pairs[t.value]){if(stack.at(-1)?.value===pairs[t.value])stack.pop();else add(t,'Unmatched closing '+names[pairs[t.value]]);}
  else if(t.type==='string'&&!t.closed)add(t,'Unterminated single-quoted string');
  else if(t.type==='symbol'&&!['+','-','*','/','%','!','=','==','!=','<','>','<=','>=','&&','||','??','?',':',',',';','.','->'].includes(t.value))add(t,'Unknown character: '+t.value);
 }
 for(const t of stack)add(t,'Missing closing '+names[t.value]);
 if(result.length)return result;
 if(maxDepth>128)return result; // Preserve deep valid input without risking the editor stack.
 // A permissive Pratt parser: grammar is checked, runtime symbols and types are not.
 let cursor=0,depth=0;const precedence={'=':1,'?':2,'??':3,'||':4,'&&':5,'==':6,'!=':6,'<':7,'>':7,'<=':7,'>=':7,'+':8,'-':8,'*':9,'/':9,'%':9,'->':10};
 const peek=()=>tokens[cursor],take=()=>tokens[cursor++];
 function fail(message,t=peek()||tokens.at(-1)){if(t)add(t,message);}
 function expression(min=0){
  if(++depth>128){depth--;return false;}let t=take();
  if(!t){depth--;return false;}
  if(['+','-','!'].includes(t.value)){if(!expression(10))fail('Expected an expression after '+t.value,t);}
  else if(t.value==='('){if(!expression())fail('Expected an expression',t);if(peek()?.value===')')take();else fail('Expected closing parenthesis');}
  else if(t.value==='{'){statements('}');if(peek()?.value==='}')take();}
  else if(t.type==='id'&&t.value.toLowerCase()==='return'){if(!expression())fail('Expected a return value',t);}
  else if(!['id','number','string'].includes(t.type)){fail('Expected an expression',t);depth--;return false;}
  while(peek()){
   const op=peek();
   if(op.value==='('){take();if(peek()?.value!==')')do{if(!expression()){fail('Expected a function argument');break;}if(peek()?.value!==',')break;take();}while(peek());if(peek()?.value===')')take();else fail('Expected closing parenthesis');continue;}
   if(op.value==='['){take();if(!expression())fail('Expected an array index',op);if(peek()?.value===']')take();else fail('Expected closing bracket');continue;}
   if(op.value==='.'){take();if(peek()?.type==='id')take();else fail('Expected a member name',op);continue;}
   const priority=precedence[op.value];if(priority===undefined||priority<min)break;
   take();if(!expression(op.value==='?'?0:op.value==='='?priority:priority+1))fail('Expected an expression after '+op.value,op);
   if(op.value==='?'&&peek()?.value===':'){take();if(!expression(priority))fail('Expected an expression after :',op);}
  }
  depth--;return true;
 }
 function statements(stop){while(peek()&&peek().value!==stop){const before=cursor;if(peek().value===';'){take();continue;}expression();if(peek()?.value===';')take();else if(peek()&&peek().value!==stop){fail('Expected an operator or semicolon');take();}if(cursor===before)take();}}
 statements();
 return result;
}
function units(document){const groups=new Map();for(const node of nodes(document)){
 const p=json.getNodePath(node),array=node.parent?.type==='array'&&p.includes('scripts')&&['initialize','pre_animation'].includes(p.at(-2))?node.parent:node;
 if(!groups.has(array))groups.set(array,[]);groups.get(array).push(node);
 }return [...groups.values()].map(group=>{let text='',map=[];for(const node of group){if(text){text+='\n';map.push(offsets(document,node)[0]);}const local=offsets(document,node);map.push(...local.slice(0,-1));text+=node.value;}map.push(offsets(document,group.at(-1)).at(-1));return {text,map,nodes:group};});}
function packVersion(document,index){const manifest=[...index?.documents.values()||[]].find(d=>d.side===document.side&&d.relative==='manifest.json');return (manifest?.data||manifest?.tree&&json.getNodeValue(manifest.tree))?.header?.min_engine_version?.join('.');}
function semantics(text,version){const tokens=lex(text),result=[],push=(t,message)=>result.push({start:t.start,end:t.end,message});
 for(let i=0;i<tokens.length;i++){
  const t=tokens[i],e=info(t.value),name=canonical(t.value);
  if(name.startsWith('context.')&&tokens[i+1]?.value==='=')push(t,'Context values are read-only.');
  if(e?.removedSince&&version&&require('./releases.cjs').compareVersions(version,e.removedSince)>=0)push(t,e.name+' is unavailable with pack min_engine_version >= '+e.removedSince+'.');
  // Math signatures have exact arity. Query metadata has conflicting bounds, so only
  // independently documented minimums for all/any are enforced here.
  if(tokens[i+1]?.value==='('&&(e?.name.startsWith('math.')||['query.all','query.any'].includes(name))){let depth=0,count=0,hasValue=false,closed=false;
   for(let j=i+2;j<tokens.length;j++){const v=tokens[j].value;if(v===')'&&depth===0){closed=true;break;}if(v===','&&depth===0){count++;continue;}hasValue=true;if(['(','[','{'].includes(v))depth++;if([')',']','}'].includes(v))depth--;}
   count=hasValue?count+1:0;
   const min=e.name.startsWith('math.')?e.parameters?.length??0:3,max=e.name.startsWith('math.')?min:Infinity;
   if(closed&&(count<min||count>max))push(t,e.name+' expects '+(max===Infinity?'at least ':'')+min+' argument'+(min===1?'':'s')+'.');
  }
 }return result;
}
function issues(document,index){return units(document).flatMap(unit=>{const syntax=errors(unit.text),findings=syntax.length?syntax:semantics(unit.text,packVersion(document,index));
 if(!syntax.length){const limits=restrictions(document,unit.nodes[0]),tokens=lex(unit.text);for(let i=0;i<tokens.length;i++){const t=tokens[i],name=canonical(t.value);
  if(limits&&name.startsWith('query.')&&info(name)&&!limits.queries.includes(name))findings.push({start:t.start,end:t.end,message:'This expression allows '+limits.queries.filter(q=>q!=='query.block_property').join(' or ')+' queries. See '+limits.url});
  if(limits?.variables==='none'&&/^(?:variable|temp)\./.test(name)||limits?.variables==='read'&&/^(?:variable|temp)\./.test(name)&&tokens[i+1]?.value==='=')findings.push({start:t.start,end:t.end,message:limits.variables==='none'?'Entity property defaults cannot read or assign Molang variables.':'Entity property changes can read Molang variables but cannot assign them.'});
 }
 const format=json.findNodeAtLocation(document.tree,['format_version'])?.value;
 if(unit.nodes.length>1&&typeof format==='string'&&require('./releases.cjs').compareVersions(format,'1.26.0')<0){const opening=lex(unit.text).find(t=>t.value==='{');if(opening&&unit.nodes.some(n=>errors(n.value).some(e=>/brace/.test(e.message))))findings.push({start:opening.start,end:opening.end,message:'Brace scopes spanning initialize/pre_animation strings require document format_version 1.26.0 or newer. See https://learn.microsoft.com/en-us/minecraft/creator/documents/update1.26.0#multi-line-brace-support'});}
 }
 return findings.map(e=>({file:document.file,code:syntax.length?'bedrock.molangSyntax':'bedrock.molangRestriction',offset:unit.map[e.start]??unit.map[0],length:Math.max(1,(unit.map[e.end]??unit.map.at(-1))-(unit.map[e.start]??unit.map[0])),severity:'warning',message:'Molang: '+e.message}));});}
module.exports={catalog,entries,constructs,canonical,lex,field,nodes,offsets,decodedOffset,completions,signature,hover,issues,errors,markdown,info,units,parameterDescription,forChannel};
