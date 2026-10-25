const fs=require('node:fs/promises'),path=require('node:path'),{unzipSync}=require('fflate'),json=require('jsonc-parser');
(async()=>{const validate=new(require('ajv'))({strict:false,allErrors:true}).compile(require('../schemas/entity.schema.json')),files=unzipSync(new Uint8Array(await fs.readFile(process.argv[2]||'.test-temp/mojang-reference.zip')),{filter:e=>/^behavior_pack\/entities\/.*\.json$/.test(e.name)});let total=0,failed=0;function check(file,data){total++;if(!validate(data)){failed++;console.error(file,JSON.stringify(validate.errors.slice(0,3)));}}
 for(const [file,bytes]of Object.entries(files))check(file,json.parse(Buffer.from(bytes).toString('utf8')));
 if(process.argv[3])for await(const file of require('../src/core.cjs').files(process.argv[3]))if(file.endsWith('.json'))check(file,json.parse(await fs.readFile(path.join(process.argv[3],file),'utf8')));
 console.log(JSON.stringify({entities:total,failed}));if(failed)process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
