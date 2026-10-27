const test=require('node:test'),assert=require('node:assert/strict'),props=require('../src/preview-properties.cjs'),m=require('../src/molang.cjs'),{plan}=require('../src/preview-plan.cjs');
test('property-derived pattern indices constant fold while runtime queries remain unresolved',()=>{
 const scripts=["v.base=q.property('base') == 'wild' ? 0 : 1;","v.offset=q.property('color') == 'red' ? 0 : 20;","v.pattern=v.base == 0 ? 0 : q.property('pattern') == 0 ? 0 : v.offset + q.property('pattern');"];
 const expression=props.expand('v.pattern',scripts),values={base:'white',color:'black',pattern:3};assert.equal(props.literal(m.lex(expression),values),23);assert.deepEqual(new Set(props.referenced(expression,values)),new Set(['base','pattern','color']));values.base='wild';assert.equal(props.literal(m.lex(expression),values),0);assert.deepEqual(props.referenced(expression,values),['base']);assert.equal(props.literal(m.lex('q.variant + 1'),{}),undefined);assert.equal(props.literal(m.lex('1 / 0'),{}),undefined);
});
test('controller passes retain declaration order and unresolved or duplicate assets never win by ordering',()=>{
 const model={alias:'default',textures:[{alias:'base',file:'/base.png'},{alias:'pattern',file:'/pattern.tga'}],inference:{active:true,references:['skin'],passes:[{controller:'base',order:1,selections:[['base']],rules:[]},{controller:'overlay',order:0,selections:[['pattern']],rules:[]}]}};
 let result=plan([model]);assert.deepEqual(result.passes.map(p=>p.controller),['overlay','base']);assert.deepEqual([...result.references],['skin']);
 result=plan([model,{...model,geometryFile:'/duplicate.json'}]);assert.equal(result.passes.length,0);assert.match(result.warnings.join(),/ambiguous/);
 model.inference.passes[0].selections=[['base','pattern']];result=plan([model]);assert.equal(result.passes.length,1);assert.match(result.warnings.join(),/unresolved/);
 assert.equal(result.variants.length,1);const choice=result.variants[0].options.find(o=>o.label.includes('base'));assert.equal(plan([model],{choices:{base:choice.key}}).passes.length,2);
 const adult={...model,alias:'adult',inference:{active:true,passes:[{controller:'actor',order:0,selections:[['base']],rules:[]}]}},baby={...adult,alias:'baby'};result=plan([adult,baby]);assert.equal(result.passes.length,0,'Unknown geometry branches must not overlap');assert.equal(result.variants[0].options.length,2);
 result=plan([adult,baby],{choices:{actor:JSON.stringify(['baby','base'])}});assert.equal(result.passes.length,1);assert.equal(result.passes[0].model.alias,'baby');assert.equal(plan([adult,baby],{choices:{actor:'unknown'}}).passes.length,0);
 adult.inference.passes[0].conditional=true;result=plan([adult]);assert.equal(result.passes.length,0);assert.equal(result.variants[0].options[0].key,'@inactive');assert.equal(plan([adult],{choices:{actor:'@inactive'}}).warnings.length,0);
 adult.inference.passes[0].complete=false;assert.equal(plan([adult]).passes.length,0);assert.match(plan([adult]).warnings.join(),/unsupported/);
});
