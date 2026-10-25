const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');const json=require('jsonc-parser');const content=require('../src/content.cjs');
test('creative groups work for items and blocks, catalog references are precisely scoped',()=>{
 const doc={side:'behavior'};
 for(const root of ['minecraft:item','minecraft:block'])assert.equal(content.referenceKind([root,'description','menu_category','group'],'',doc),'creative_group');
 assert.equal(content.referenceKind(['minecraft:item','components','test:component','group'],'',doc),undefined);
 const p=['minecraft:crafting_items_catalog','categories',0,'groups',0];
 assert.equal(content.referenceKind([...p,'group_identifier','name'],'',doc),'creative_group');assert.equal(content.referenceKind([...p,'group_identifier','icon'],'',doc),'item');assert.equal(content.referenceKind([...p,'items',0],'',doc),'item');
 const index=new content.ContentIndex({config:{}});const current=content.referenceValues(index,'creative_group',{data:{format_version:'1.26.50'}});assert.ok(current.has('minecraft:itemGroup.name.sword'));assert.ok(!current.has('itemGroup.name.sword'));
 const old=content.referenceValues(index,'creative_group',{data:{format_version:'1.20.80'}});assert.ok(old.has('itemGroup.name.sword'));assert.ok(!old.has('minecraft:itemGroup.name.sword'));
});
test('custom catalog groups refresh, navigate and allow new names without unresolved diagnostics',async t=>{
 await fs.mkdir('.test-temp',{recursive:true});const root=await fs.mkdtemp(path.resolve('.test-temp/creative-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const packs={behavior:path.join(root,'BP'),resource:path.join(root,'RP')};await fs.mkdir(path.join(packs.behavior,'item_catalog'),{recursive:true});await fs.mkdir(packs.resource);
 const file=path.join(packs.behavior,'item_catalog/crafting_item_catalog.json');const catalog=name=>({format_version:'1.21.60','minecraft:crafting_items_catalog':{categories:[{category_name:'equipment',groups:[{group_identifier:{name,icon:'minecraft:iron_sword'},items:['minecraft:iron_sword']}]}]}});
 await fs.writeFile(file,JSON.stringify(catalog('test:tools')));const index=await content.scan({root,packs,config:{}});assert.ok(content.referenceValues(index,'creative_group',{}).has('test:tools'));assert.equal(content.referenceDefinitions(index,'creative_group','test:tools')[0].column,(await fs.readFile(file,'utf8')).indexOf('"test:tools"'));
 const text=JSON.stringify({'minecraft:item':{description:{menu_category:{group:'test:new_group'}}}});assert.deepEqual(content.referenceIssues(index,{side:'behavior',text,tree:json.parseTree(text)}),[]);
 await fs.writeFile(file,JSON.stringify(catalog('test:updated')));await content.update(index,file);assert.ok(index.values('creative_group').has('test:updated'));assert.ok(!index.values('creative_group').has('test:tools'));await fs.unlink(file);await content.update(index,file);assert.equal(index.values('creative_group').size,0);
 const validate=new(require('ajv'))({strict:false}).compile(require('../schemas/creative-catalog.schema.json'));assert.ok(validate(catalog('test:tools')));const bad=catalog('test:tools');bad['minecraft:crafting_items_catalog'].categories[0].groups[0].items=[4];assert.equal(validate(bad),false);
});
