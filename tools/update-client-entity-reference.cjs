const fs=require('node:fs'),crypto=require('node:crypto');
function fields(text){const result=new Set();let prefix=[];for(const line of text.split(/\r?\n/)){
 const path=/^\*\*JSON path:\*\* `([^`]+)`/.exec(line);if(path){prefix=path[1].split(/\s*>\s*/);if(prefix[0]==='minecraft:attachable')prefix[0]='minecraft:client_entity';continue;}
 if(/^#{1,3} /.test(line))prefix=[];
 const row=/^\|\s*([^|]+?)\s*\|/.exec(line);if(!row||!prefix.length||row[1]==='Name'||row[1].startsWith(':'))continue;
 let name=row[1].replace(/ \([^)]*\)$/,'').trim();if(name.startsWith('variable.'))continue;
 const axis=/^scale\[([xyz])([XYZ])\]$/.exec(name);for(const key of axis?['scale'+axis[1],'scale'+axis[2]]:[name])result.add([...prefix,key].join('/'));
 }return [...result].sort();}
function build(input){const paths=new Set(['format_version','minecraft:client_entity','minecraft:client_entity/description']);for(const page of input.pages){const hash=crypto.createHash('sha1').update(Buffer.from('blob '+Buffer.byteLength(page.text)+'\0')).update(page.text).digest('hex');if(hash!==page.sha)throw Error('Documentation blob mismatch: '+page.path);for(const field of fields(page.text))paths.add(field);}
 return {revision:input.revision,sources:input.pages.map(({path,sha})=>({path,sha,url:'https://learn.microsoft.com/en-us/minecraft/creator/'+path.replace(/^creator\//,'').replace(/\.md$/,'').toLowerCase()+'?view=minecraft-bedrock-stable'})),fields:[...paths].sort()};}
if(require.main===module){const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));fs.writeFileSync('src/client-entity-reference.json',JSON.stringify(build(input),null,2)+'\n');}
module.exports={fields,build};
