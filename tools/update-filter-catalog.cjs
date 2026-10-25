// Rebuild the bundled fallback from Mojang metadata facts; no upstream schema code.
const fs=require('node:fs'),{unzipSync}=require('fflate'),filters=require('../src/filters.cjs'),json=require('jsonc-parser');
const archive=process.argv[2],tag=process.argv[3]||'v1.26.50.4';if(!archive)throw Error('Usage: node tools/update-filter-catalog.cjs <samples.zip> [release-tag]');
const files=unzipSync(fs.readFileSync(archive),{filter:e=>e.name==='metadata/doc_modules/entities.json'||/^behavior_pack\/entities\/.*\.json$/.test(e.name)}),tests=filters.extract(JSON.parse(Buffer.from(files['metadata/doc_modules/entities.json']))),families=new Set();
for(const [file,bytes]of Object.entries(files))if(file.startsWith('behavior_pack/'))for(const family of filters.families(json.parse(Buffer.from(bytes).toString())))families.add(family);
if(!Object.keys(tests).length)throw Error('Archive has no filter documentation');
fs.writeFileSync(require('node:path').join(__dirname,'../src/filter-catalog.json'),JSON.stringify({source:'https://github.com/Mojang/bedrock-samples/tree/'+tag,engine:tag.replace(/^v/,'').split('.').slice(0,3).join('.'),tests,families:[...families].sort()},null,2)+'\n');
console.log(Object.keys(tests).length+' filter tests, '+families.size+' entity families');
