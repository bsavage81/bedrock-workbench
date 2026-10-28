const test=require('node:test'),assert=require('node:assert/strict'),{resolve,profile}=require('../src/preview-materials.cjs');
test('material inheritance applies replacement, additions, removals and rejects cycles',()=>{
 const {inherit}=require('../src/preview-materials.cjs');assert.deepEqual(inherit({entity:{defines:['A'],states:['Cull']},'fish:entity':{'+defines':['B'],'-states':['Cull'],depthFunc:'LessEqual'}},'fish'),{defines:['A','B'],states:[],depthFunc:'LessEqual'});assert.throws(()=>inherit({'a:b':{},'b:a':{}},'a'),/Cyclic/);assert.equal(profile('villager_v2_masked').depth,'LessEqual');
});
test('material aliases follow ordered bone overrides and classify transparency/emission',()=>{
 const result=resolve({bones:[{name:'body'},{name:'eyes'}]},[{'*':'Material.base'},{eyes:'Material.glow'}],{base:'entity_alphablend',glow:'entity_emissive_alpha'});
 assert.equal(result.bones.body.translucent,true);assert.equal(result.bones.eyes.emissive,true);assert.equal(result.bones.eyes.opaque,false);assert.equal(profile('entity_emissive').opaque,true);assert.deepEqual(result.warnings,[]);
});
test('unknown and conditional materials are disclosed instead of silently resolved',()=>{
 const result=resolve({bones:[{name:'body'}]},[{'*':'v.skin ? Material.a : Material.b'}],{});assert.ok(result.warnings.length);assert.equal(result.bones.body.known,false);
});
