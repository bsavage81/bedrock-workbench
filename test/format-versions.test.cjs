const {test}=require('node:test');const assert=require('node:assert/strict');const json=require('jsonc-parser');const versions=require('../src/format-versions.cjs');const {compareVersions}=require('../src/releases.cjs');
const doc=(data,relative='blocks/test.json')=>({side:'behavior',relative,file:relative,data,text:JSON.stringify(data),tree:json.parseTree(JSON.stringify(data))});
const project={config:{targetVersion:'1.26.50'}};
test('schema version patterns compare numeric versions including three-digit patches and future major/minor versions',()=>{
 for(const min of ['1.19.40','1.20.0','1.21.90','1.21.100','1.26.0','1.26.30'])for(const value of ['1.8.0','1.19.39','1.19.40','1.20','1.20.0','1.21.9','1.21.90','1.21.99','1.21.100','1.21.130','1.26','1.26.0','1.26.30','1.27.0','2.0.0','10.0.0'])assert.equal(new RegExp(versions.atLeastPattern(min)).test(value),compareVersions(value.split('.').length===2?value+'.0':value,min)>=0,min+' '+value);
});
test('format diagnostics inspect components, permutations and entity component groups, without flagging unknown custom payload fields',()=>{
 const old=doc({format_version:'1.21.90','minecraft:block':{components:{'minecraft:random_offset':{}},permutations:[{components:{'minecraft:flower_pottable':{}}}]}});assert.equal(versions.issues(old,project).length,2);
 const entity=doc({format_version:'1.21.90','minecraft:entity':{component_groups:{'test:group':{'minecraft:pushable_by_entity':{},'minecraft:ageable':{duration:100,pause_growth_items:['golden_dandelion']}}}}},'entities/test.json');const findings=versions.issues(entity,project);assert.equal(findings.length,2);assert.ok(findings.some(x=>x.message.includes('pause_growth_items')));
 assert.deepEqual(versions.issues(doc({format_version:'1.21.90','minecraft:block':{components:{'minecraft:flammable':{catch_chance_modifier:3},'test:unknown':{unsupported_name:true}}}}),project),[]);
 assert.equal(versions.issues(doc({format_version:'1.21.90','minecraft:block':{components:{'minecraft:flammable':{lava_flammable:true}}}}),project).length,1);
});
test('shared format validation respects target, custom component versions, manifests and root-only rules',()=>{
 assert.match(versions.issues(doc({format_version:'1.27.0',particle_effect:{}}),project)[0].message,/newer than target/);
 assert.equal(versions.issues(doc({format_version:2},'manifest.json'),project).length,0);
 assert.equal(versions.issues(doc({format_version:'broken'}),project).length,1);
 assert.equal(versions.issues(doc({format_version:'1.21.80','minecraft:item':{components:{'test:custom':{}}}}),project).length,1);
 assert.equal(versions.issues(doc({format_version:'1.26.50','minecraft:block':{permutations:[{components:{'minecraft:flower_pottable':{}}}]}}),project).length,1);
 assert.ok(!versions.supported('block','minecraft:random_offset','1.21.90','1.26.50'));
 assert.ok(!versions.supported('entity','minecraft:ageable','1.21.90','1.26.50','pause_growth'));
});
test('version-conditioned native schema retains correct modern shapes and relaxes incompatible modern rules on legacy files',()=>{
 const schema=versions.apply(require('../schemas/block.schema.json'),'block','1.26.50');const validate=new(require('ajv'))({strict:false}).compile(schema);
 const data=format=>({format_version:format,'minecraft:block':{description:{identifier:'test:block'},components:{'minecraft:random_offset':{x:{steps:'bad'}}}}});
 assert.equal(validate(data('1.26.50')),false);assert.equal(validate(data('1.21.90')),true);
 const entity=versions.apply({properties:{'minecraft:entity':{properties:{components:{properties:{'minecraft:ageable':{properties:{duration:{type:'number'},pause_growth:{type:'object'}}}}}}}}},'entity','1.26.50');assert.ok(entity.allOf.length>=2);
 const fieldsOnly=versions.apply({properties:{'minecraft:block':{properties:{components:{properties:{'minecraft:flammable':{properties:{catch_chance_modifier:{type:'number'},lava_flammable:{type:'boolean'}}}}}}}}},'block','1.26.50');assert.ok(!JSON.stringify(fieldsOnly).includes('undefined'));
});
test('format suggestions stay within file family and engine target instead of upgrading unrelated formats',()=>{
 const documents=new Map([['g',doc({format_version:'1.12.0'},'models/g.json')],['i',doc({format_version:'1.21.90','minecraft:item':{}},'items/i.json')]]);const index={documents};
 assert.deepEqual(versions.choices(index,doc({format_version:'1.12.0'},'models/other.json'),project),['1.12.0']);
 const values=versions.choices(index,doc({'minecraft:item':{}},'items/other.json'),{config:{targetVersion:'1.21.90'}});assert.ok(values.includes('1.21.90'));assert.ok(!values.includes('1.21.130'));
});
test('official documentation facts distinguish component minima from direct field minima',()=>{
 assert.equal(versions.rule('block','minecraft:random_offset').min,'1.21.100');assert.equal(versions.rule('block','minecraft:flammable').min,undefined);assert.equal(versions.rule('block','minecraft:flammable').fields.lava_flammable.min,'1.26.30');assert.equal(versions.rule('entity','minecraft:ageable').min,undefined);assert.equal(versions.rule('entity','minecraft:ageable').fields.pause_growth_items.min,'1.26.10');
});

test('documentation extraction keeps field requirements separate from component requirements',()=>{
 const {zipSync,strToU8}=require('fflate'),links=require('../src/documentation-links.json').components,files={};
 for(const [kind,components]of Object.entries(links))for(const relative of Object.values(components))files['docs/creator/'+relative+'.md']=strToU8('# Component\n\nA component description.\n\n## Properties\n');
 files['docs/creator/'+links.block['minecraft:flammable']+'.md']=strToU8('# Flammable\n\nOld component description.\n\n## Properties\n\n|Name |Type |Description |\n|:----|:----|:-----------|\n| lava_flammable |Boolean | This item requires a format version of at least 1.26.30. |\n');
 const result=require('../tools/extract-format-requirements.cjs').extract(zipSync(files));assert.equal(result.components.block['minecraft:flammable'].min,undefined);assert.equal(result.components.block['minecraft:flammable'].fields.lava_flammable.min,'1.26.30');
});

test('nested material field minima use atlas instance paths without affecting old scalar aliases',()=>{
 const old=doc({format_version:'1.21.70','minecraft:block':{components:{'minecraft:material_instances':{'*':{texture:'grass',isotropic:true},north:'*'}}}});
 assert.equal(versions.issues(old,project).filter(i=>i.message.includes('isotropic')).length,1);
 const schema=versions.apply(require('../schemas/block.schema.json'),'block','1.26.50');const text=JSON.stringify(schema);assert.ok(text.includes('Minimum format version: 1.21.80.'));
});
