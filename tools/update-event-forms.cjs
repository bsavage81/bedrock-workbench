// Extract explicitly documented event string/object alternatives, never infer them from names.
const fs=require('node:fs'),crypto=require('node:crypto');
function extract(input){
 const components={};let pages=0;
 for(const [key,page]of Object.entries(input.pages)){
  const digest=crypto.createHash('sha1').update('blob '+Buffer.byteLength(page.text)+'\0').update(page.text).digest('hex');
  if(digest!==page.sha)throw Error('Unverified documentation blob: '+key);
  pages++;
  if(!key.startsWith('entity|'))continue;
  const rows=page.text.split('\n').filter(line=>line.startsWith('|')).map(line=>line.split('|').slice(1,-1).map(cell=>cell.replace(/[`*]/g,'').trim()));
  const fields={};
  for(const row of rows){
   const name=row[0]?.replace(/\s*\(.*$/,'');if(!name||!/^[a-z_]+$/.test(name))continue;
   const explicit=/simple event (?:name )?string/i.test(row[3]||'');
   const paired=/^Object$/i.test(row[2]||'')&&/event/i.test(row[3]||'')&&rows.some(other=>other[0]===name+' (as String)');
   if(explicit||paired)fields[name]={description:row[3],source:page.path,blob:page.sha};
  }
  if(Object.keys(fields).length)components[key.slice(7)]=fields;
 }
 return {source:input.source,revision:input.revision,license:'CC-BY-4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',pagesReviewed:pages,components};
}
if(require.main===module){const result=extract(JSON.parse(fs.readFileSync(process.argv[2],'utf8')));fs.writeFileSync(require('node:path').join(__dirname,'../src/event-forms.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({pagesReviewed:result.pagesReviewed,components:Object.keys(result.components).length,fields:Object.values(result.components).reduce((n,v)=>n+Object.keys(v).length,0)}));}
module.exports={extract};
