const path=require('node:path');
function relative(root,file) { return path.relative(root,file).replaceAll(path.sep,'/'); }
function match(project,issue) {
  if(!['bedrock.missingReference','bedrock.entityReference'].includes(issue.code)||!issue.reference)return;
  const rules=project.config?.validation?.ignoredReferences;
  if(!rules?.length)return;
  const file=relative(project.root,issue.file),fold=value=>process.platform==='win32'?value.toLowerCase():value;
  return rules.find(rule=>rule.type===issue.reference.type&&rule.value===issue.reference.value&&(!rule.file||fold(rule.file)===fold(file)));
}
function partition(project,issues) {
  const active=[],suppressed=[];
  for(const issue of issues) { const rule=match(project,issue);if(rule)suppressed.push({...issue,ignoreRule:rule});else active.push(issue); }
  return {active,suppressed};
}
module.exports={relative,match,partition};
