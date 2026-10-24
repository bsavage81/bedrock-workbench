// Refresh URL metadata from the navigation published by Microsoft Learn.
// No documentation text, schemas, or implementation code is copied.
const fs = require('node:fs/promises');
const path = require('node:path');
const source = 'https://raw.githubusercontent.com/MicrosoftDocs/minecraft-creator/main/creator/Reference/Content/';
const tables = [
  ['block','BlockReference/Examples/BlockComponents'],
  ['item','ItemReference/Examples/ItemComponents'],
  ['entity','EntityReference/Examples/EntityComponents'],
  ['entity','EntityReference/Examples/EntityGoals'],
  ['entity','EntityReference/Examples/EntityTriggers']
];
(async () => {
  const components = {block:{},item:{},entity:{}};
  for(const [kind,directory] of tables) {
    const response = await fetch(source+directory+'/TOC.yml', {signal:AbortSignal.timeout(30000)});
    if(!response.ok) throw Error('Documentation index returned '+response.status);
    const text = await response.text();
    for(const match of text.matchAll(/- name:\s*([^\r\n]+)\r?\n\s+href:\s*([^\r\n]+\.md)/g)) {
      const name = match[1].trim(), file = match[2].trim();
      if(!/^minecraft(?:Block|Component|Behavior|Trigger|_)\w*[_.]/i.test(file)) continue;
      const prefix = /EntityGoals$/.test(directory) ? 'behavior.' : '';
      const id = name.startsWith('minecraft:') ? name : 'minecraft:'+prefix+file.replace(/^minecraft(?:Block|Component|Behavior|Trigger)?_/i,'').replace(/\.md$/i,'');
      const relative = path.posix.normalize('reference/content/'+directory+'/'+file).replace(/\.md$/i,'').toLowerCase();
      if(!relative.startsWith('reference/content/')) throw Error('Unexpected documentation path');
      components[kind][id] = relative;
    }
  }
  // Legacy pages may still be published even after leaving current navigation.
  const treeResponse=await fetch('https://api.github.com/repos/MicrosoftDocs/minecraft-creator/git/trees/main?recursive=1',{headers:{'User-Agent':'Bedrock-Workbench'},signal:AbortSignal.timeout(30000)});
  if(!treeResponse.ok) throw Error('Documentation tree returned '+treeResponse.status);
  const tree=await treeResponse.json(); if(tree.truncated) throw Error('Incomplete documentation tree');
  for(const [kind,directory] of tables) for(const entry of tree.tree||[]) {
    if(!entry.path.startsWith('creator/Reference/Content/'+directory+'/') || !entry.path.endsWith('.md')) continue;
    const file=path.posix.basename(entry.path);
    if(!/^minecraft(?:Block|Component|Behavior|Trigger|_)\w*[_.]/i.test(file)) continue;
    const id='minecraft:'+(/EntityGoals$/.test(directory)?'behavior.':'')+file.replace(/^minecraft(?:Block|Component|Behavior|Trigger)?_/i,'').replace(/\.md$/i,'');
    if(!components[kind][id]) components[kind][id]=entry.path.replace(/^creator\//,'').replace(/\.md$/i,'').toLowerCase();
  }
  if(Object.keys(components.block).length<35 || Object.keys(components.item).length<35 || Object.keys(components.entity).length<200) throw Error('Incomplete documentation navigation');
  const result={source:'https://github.com/MicrosoftDocs/minecraft-creator',updated:new Date().toISOString().slice(0,10),components};
  await fs.writeFile(path.resolve(__dirname,'../src/documentation-links.json'),JSON.stringify(result,null,2)+'\n');
  console.log(Object.fromEntries(Object.entries(components).map(([kind,values])=>[kind,Object.keys(values).length])));
})().catch(error=>{console.error(error);process.exitCode=1;});
