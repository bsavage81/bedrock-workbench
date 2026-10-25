const fs=require('node:fs'),path=require('node:path');
function plain(text){return text.replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/<[^>]+>/g,'').replace(/[`*]/g,'').replace(/\s+/g,' ').trim();}
function introduction(markdown){const body=markdown.replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n/,'').replace(/\r/g,'');const heading=/^# [^\n]+\n/m.exec(body);if(!heading)return '';const start=body.slice(heading.index+heading[0].length).split(/^## (?!Contents\b)/m)[0];
 for(const paragraph of start.split(/\n\s*\n/)){const text=paragraph.trim();if(!text||/^(?:>|#|\||!\[|\[!|<!--|```|:::|[-+]\s)/.test(text))continue;const value=plain(text);if(value.split(/\s+/).length>150)continue;if(value.length>=15&&!/^(?:In this article|Feedback|Summarize)/i.test(value))return value;}
 return '';
}
function extract(input){const components={block:{},item:{},entity:{}},empty=[];for(const [key,page]of Object.entries(input.pages)){const [kind,id]=key.split('|');const description=introduction(page.text);if(!description){empty.push(key);continue;}components[kind][id]={description,source:'https://learn.microsoft.com/en-us/minecraft/creator/'+page.path.replace(/^creator\//,'').replace(/\.md$/,'').toLowerCase()+'?view=minecraft-bedrock-stable',blob:page.sha};}
 // This page's opening describes delivery, while its documented fields describe staying nearby.
 components.entity['minecraft:behavior.stay_near_noteblock'].review='retain-author-description';
 components.item['minecraft:storage_weight_modifier'].review='retain-author-description';
 components.block['minecraft:precipitation_interactions'].review='retain-author-description';
 return {source:input.source,revision:input.revision,license:'CC-BY-4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',components,unavailable:empty};}
if(require.main===module){const input=process.argv[2];if(!input)throw Error('Usage: node tools/update-component-descriptions.cjs <verified-pages.json>');const result=extract(JSON.parse(fs.readFileSync(input,'utf8')));fs.writeFileSync(path.join(__dirname,'../src/component-descriptions.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({descriptions:Object.fromEntries(Object.entries(result.components).map(([kind,value])=>[kind,Object.keys(value).length])),unavailable:result.unavailable}));}
module.exports={plain,introduction,extract};
