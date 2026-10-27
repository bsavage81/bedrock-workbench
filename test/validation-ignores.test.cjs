const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const json=require('jsonc-parser');
const content=require('../src/content.cjs');
const ignores=require('../src/validation-ignores.cjs');

test('unresolved local entity groups can be marked intended without hiding property validation',()=>{
  const root=path.resolve('fixtures'),file=path.join(root,'BP/entities/ocelot.json');
  const text=JSON.stringify({'minecraft:entity':{events:{unleash:{remove:{component_groups:['minecraft:ocelot_leashed']}}}}});
  const document={file,text,tree:json.parseTree(text)};
  const issues=require('../src/entity-authoring.cjs').issues(document);
  assert.equal(issues.length,1);
  assert.deepEqual(issues[0].reference,{type:'entity_group',value:'minecraft:ocelot_leashed'});
  const rule={...issues[0].reference,file:'BP/entities/ocelot.json'};
  const project={root,config:{validation:{ignoredReferences:[rule]}}};
  assert.equal(ignores.partition(project,issues).active.length,0);
  assert.equal(ignores.match(project,{...issues[0],file:path.join(root,'BP/entities/other.json')}),undefined);
  assert.equal(ignores.match(project,{...issues[0],code:'bedrock.entityProperty'}),undefined);
  delete rule.file;
  assert.equal(ignores.match(project,{...issues[0],file:path.join(root,'BP/entities/other.json')}),rule);
});
test('intended references are exact, kind-aware, file scoped or project-wide, and never suppress syntax issues',()=>{
  const root=path.resolve('fixtures'),file=path.join(root,'RP/entity/a.json');
  const rule={type:'texture',value:'textures/intended',file:'RP/entity/a.json',reason:'Supplied by another pack'};
  const project={root,config:{validation:{ignoredReferences:[rule]}}};
  const issue={code:'bedrock.missingReference',reference:{type:'texture',value:'textures/intended'},file};
  assert.equal(ignores.match(project,issue),rule);
  assert.equal(ignores.match(project,{...issue,file:path.join(root,'RP/entity/b.json')}),undefined);
  assert.equal(ignores.match(project,{...issue,reference:{type:'item',value:'textures/intended'}}),undefined);
  assert.equal(ignores.match(project,{...issue,reference:{type:'texture',value:'textures/intended_typo'}}),undefined);
  assert.equal(ignores.match(project,{...issue,code:'syntax'}),undefined);
  const result=ignores.partition(project,[issue,{file,message:'JSON syntax error'}]);
  assert.equal(result.active.length,1);assert.equal(result.suppressed[0].ignoreRule.reason,rule.reason);
  delete rule.file;assert.equal(ignores.match(project,{...issue,file:path.join(root,'RP/entity/b.json')}),rule);
});
test('live reference checks honor project rules and restore findings when a rule is removed',()=>{
  const root=path.resolve('fixtures'),file=path.join(root,'RP/entity/test.json');
  const project={root,config:{validation:{ignoredReferences:[{type:'texture',value:'textures/intended',file:'RP/entity/test.json'}]}}};
  const index=new content.ContentIndex(project);
  const text=JSON.stringify({'minecraft:client_entity':{description:{textures:{default:'textures/intended',other:'textures/still_missing'}}}});
  const document={file,side:'resource',relative:'entity/test.json',text,tree:json.parseTree(text)};
  assert.equal(content.referenceIssues(index,document).length,1);
  assert.equal(content.referenceIssues(index,document,{includeIgnored:true}).length,2);
  project.config.validation.ignoredReferences=[];assert.equal(content.referenceIssues(index,document).length,2);
});
