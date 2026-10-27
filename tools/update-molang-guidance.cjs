// Reviewed parameter names/overloads authored from current individual Learn pages.
// No query arity error rules are inferred from conflicting Mojang metadata.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const folder=process.argv[2];if(!folder)throw Error('Usage: node tools/update-molang-guidance.cjs <saved-Learn-directory>');
const reviewed={
 is_item_equipped:{parameters:[],overloads:[[],['hand']]},
 get_equipped_item_name:{parameters:[],overloads:[[],['hand'],['hand','rendered_item']]},
 is_item_name_any:{parameters:['slot','item_name','...item_names'],overloads:[['slot','item_name','...item_names'],['slot','slot_index','item_name','...item_names']]},
 cooldown_time:{parameters:['slot'],overloads:[['slot'],['slot','slot_index']]},
 cooldown_time_remaining:{parameters:[],overloads:[[],['cooldown_type'],['slot','slot_index']]},
 camera_rotation:{parameters:['axis']},position:{parameters:['axis']},
 bone_orientation_matrix:{parameters:['bone_name']},bone_orientation_trs:{parameters:['bone_name']},bone_aabb:{parameters:['bone_name']},
 noise:{parameters:['x','z']},in_range:{parameters:['value','minimum','maximum']},
 all:{parameters:['value','candidate','candidate','...candidates']},any:{parameters:['value','candidate','candidate','...candidates']},
 graphics_mode_is_any:{parameters:['graphics_mode','...graphics_modes']},
 is_pack_setting_enabled:{parameters:['setting_name']},is_pack_setting_selected:{parameters:['setting_name','selection']},
 combine_entities:{parameters:['entity_reference','...entity_references']},
 item_slot_to_bone_name:{parameters:['equipment_slot']},had_component_group:{parameters:['component_group']},state_time:{}
};
function body(text){const content=text.split('<main')[1]?.split('</main>')[0]||'';const plain=content.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();const begin=plain.indexOf('In this article');return begin<0?'':plain.slice(begin+15).split('Feedback')[0].trim();}
const entries={},pages=[];
for(const [name,facts]of Object.entries(reviewed)){
 const variants={},descriptions=[];for(const channel of ['stable','experimental']){const file=path.join(folder,'query_'+name+'-'+channel+'.html'),text=fs.readFileSync(file,'utf8'),description=body(text);if(!description)throw Error('No content for '+file);descriptions.push(description);
  const formatMinimum=/requires a format version of at least ([\d.]*\d)/i.exec(description)?.[1],withoutExperimentSince=/without an experimental toggle starting in ([\d.]*\d)/i.exec(description)?.[1];
  variants[channel]={...facts,...(formatMinimum?{formatMinimum}:{}),...(withoutExperimentSince?{withoutExperimentSince}:{}),source:'https://learn.microsoft.com/en-us/minecraft/creator/reference/content/molangreference/examples/molangconcepts/queryfunctions/query_'+name+'?view=minecraft-bedrock-'+channel};
  pages.push({name:'query.'+name,channel,sha256:crypto.createHash('sha256').update(description).digest('hex')});
 }
 if(descriptions[0]!==descriptions[1])throw Error('Individual channel text differs for query.'+name+'; review and author the differences before regenerating guidance.');
 const equal=JSON.stringify({...variants.stable,source:''})===JSON.stringify({...variants.experimental,source:''});
 entries['query.'+name]={...variants.stable,...(!equal?{preview:variants.experimental}:{}),versionPolicy:'Documented format/experiment guidance; not an inferred first engine introduction or a hard diagnostic.'};
}
fs.writeFileSync(path.join(__dirname,'../src/molang-guidance.json'),JSON.stringify({reviewed:'2026-10-26',channelAudit:{contractsCompared:Object.keys(entries).length,textDifferences:[]},entries,pages},null,2)+'\n');
console.log(Object.keys(entries).length+' reviewed query contracts, '+pages.length+' channel pages');
