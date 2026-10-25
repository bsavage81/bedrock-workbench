// Offline compatibility audit: a released Mojang samples ZIP and optional local items directory.
const fs=require('node:fs');
const path=require('node:path');
const json=require('jsonc-parser');
const {unzipSync}=require('fflate');
const validate=new(require('ajv'))({strict:false,allErrors:true}).compile(require('../schemas/item.schema.json'));
const [archive,directory]=process.argv.slice(2);
if(!archive)throw Error('Provide a Mojang samples ZIP and optionally a local items directory');
let count=0;const failures=[];
const bytes=fs.readFileSync(archive),reference=require('../src/reference.cjs').buildIndex(bytes,'v1.26.50.4'),content=require('../src/content.cjs');
const index=new content.ContentIndex({root:process.cwd(),config:{targetVersion:'1.26.50'}});index.reference=reference;
function check(file,text) {
  const errors=[],data=json.parse(text.replace(/^\uFEFF/,''),errors,{allowTrailingComma:true});
  if(!data?.['minecraft:item'])return;count++;
  if(errors.length||!validate(data))failures.push({file,errors:errors.length?errors:validate.errors});
}
for(const [file,data]of Object.entries(unzipSync(bytes,{filter:e=>/^behavior_pack\/items\/.*\.json$/.test(e.name)}))) {
  const text=Buffer.from(data).toString();check(file,text);
  const findings=content.referenceIssues(index,{side:'behavior',relative:file.slice('behavior_pack/'.length),file,text,tree:json.parseTree(text)});
  if(findings.length)failures.push({file,references:findings.map(i=>i.message)});
}
function walk(folder){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){const file=path.join(folder,entry.name);if(entry.isDirectory())walk(file);else if(entry.isFile()&&file.endsWith('.json'))check(file,fs.readFileSync(file,'utf8'));}}
if(directory)walk(directory);
console.log(JSON.stringify({files:count,failures},null,2));if(failures.length)process.exitCode=1;
