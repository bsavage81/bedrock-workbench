const {test}=require('node:test'),assert=require('node:assert/strict'),json=require('jsonc-parser'),path=require('node:path');const filters=require('../src/filters.cjs'),content=require('../src/content.cjs');
function fixture(filter){
 const data={
  'minecraft:entity':{
   description:{identifier:'test:fish',properties:{'test:mood':{type:'enum',values:['calm','angry'],default:'calm'}}},
   components:{'minecraft:interact':{interactions:[{on_interact:{filters:filter}}]},'minecraft:type_family':{family:['custom_family']}}
  }
 };
 const text=JSON.stringify(data);return {data,text,tree:json.parseTree(text),file:'test.json',side:'behavior',relative:'entities/test.json'};
}
function index(document){const i=new content.ContentIndex({root:path.resolve('.test-temp/filter-test'),packs:{behavior:path.resolve('.test-temp/filter-test/BP'),resource:path.resolve('.test-temp/filter-test/RP')},config:{targetVersion:'1.26.50'}});i.documents.set(document.file,document);i.reference={vanilla:{block:['minecraft:stone'],item:['minecraft:diamond']},components:{entity:{'minecraft:health':{}}}};return i;}
function choices(document,field,value=''){const offset=document.text.indexOf(JSON.stringify(field)+':'+JSON.stringify(value))+JSON.stringify(field).length+2,state=filters.context(document,offset);assert.ok(state,field);return filters.values(index(document),document,state);}
test('nested filters offer tests and subjects, with families from vanilla and project sources',()=>{
 const d=fixture({any_of:[{test:'is_family',subject:'other',value:''}]});const names=choices(d,'value').map(o=>o.value);for(const name of ['player','axolotl','custom_family'])assert.ok(names.includes(name),name);assert.ok(!names.includes('minecraft:diamond'));
 assert.ok(choices(d,'test','is_family').some(o=>o.value==='has_equipment'));assert.ok(choices(d,'subject','other').some(o=>o.value==='self'));
 const object=d.text.indexOf('{"test"')+1,state=filters.context(d,object);assert.equal(state.mode,'key');const keys=filters.values(index(d),d,state).map(o=>o.value);assert.ok(keys.includes('operator'));assert.ok(!keys.includes('domain'),'is_family has no domain');
});
test('filter values follow the chosen test rather than mixing unrelated choices',()=>{
 let d=fixture({test:'in_water',value:''});assert.deepEqual(choices(d,'value').map(o=>o.value),[true,false]);
 d=fixture({test:'has_equipment',domain:'',value:''});assert.ok(choices(d,'domain').some(o=>o.value==='hand'));assert.deepEqual(choices(d,'value').map(o=>o.value),['minecraft:diamond']);
 d=fixture({test:'is_block',value:''});assert.deepEqual(choices(d,'value').map(o=>o.value),['minecraft:stone']);
 d=fixture({test:'enum_property',domain:'test:mood',value:''});assert.deepEqual(choices(d,'value').map(o=>o.value),['calm','angry']);
 d=fixture({test:'distance_to_nearest_player',value:''});assert.deepEqual(choices(d,'value'),[]);
 d=fixture({test:'unknown_future_test',value:''});assert.deepEqual(choices(d,'value'),[]);
});
test('empty nested predicates offer filter fields and unrelated objects remain untouched',()=>{
 const d=fixture({all_of:[{}]}),offset=d.text.indexOf('{}')+1,state=filters.context(d,offset);assert.ok(state);for(const key of ['test','subject','operator','value','any_of'])assert.ok(filters.values(index(d),d,state).some(o=>o.value===key));
 const text='{"minecraft:entity":{"components":{"custom:component":{"value":""}}}}';assert.equal(filters.context({text,tree:json.parseTree(text)},text.lastIndexOf('""')+1),undefined);
});
test('catalog extracts documented test-specific choices and family facts without numeric placeholders',()=>{
 const catalog=filters.extract({name:'Filters',nodes:[{name:'is_family',description:['Member of a family.'],nodes:[{name:'subject',type:'String',default:'self',nodes:[{name:'self'},{name:'other'}]},{name:'value',type:'String',description:['Family name.']}]}]});assert.deepEqual(catalog.is_family.fields.subject.options,['self','other']);assert.match(filters.url('is_family'),/learn.microsoft.com/);assert.deepEqual(filters.families({components:{'minecraft:type_family':{family:['player','custom']}}}),['player','custom']);
});
