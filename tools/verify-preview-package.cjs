const fs=require('node:fs/promises'),assert=require('node:assert/strict'),{unzipSync}=require('fflate');
(async()=>{
 const version=require('../package.json').version,file=`bedrock-workbench-win32-x64-${version}.vsix`,archive=unzipSync(await fs.readFile(file));
 const manifest=JSON.parse(Buffer.from(archive['extension/package.json']).toString());assert.equal(manifest.version,version);
 for(const file of ['src/model-preview.cjs','src/preview-render-bindings.cjs','src/preview-properties.cjs','src/preview-images.cjs','src/preview-plan.cjs','src/preview-actions.cjs','src/preview-geometry.cjs','src/preview-vanilla.cjs','src/reference.cjs','media/model-preview.js','media/preview-renderer.js','PREVIEW_VERIFICATION.md'])assert.deepEqual(Buffer.from(archive['extension/'+file]||[]),await fs.readFile(file),`Packaged ${file} must match verified source`);
 for(const command of ['bedrock.openModelPreview','bedrock.openModelPreviewBeside'])assert.ok(manifest.contributes.commands.some(c=>c.command===command));
 assert.match(Buffer.from(archive['extension/src/extension.cjs']).toString(),/model-preview\.cjs/);
 assert.ok(!Object.keys(archive).some(f=>/^extension\/(?:projects|test|tools|\.test-temp)\//.test(f)));
 console.log(`Preview commands and exact runtime/browser/documentation bytes verified in ${file}.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
