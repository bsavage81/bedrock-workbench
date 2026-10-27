const catalog = require('./authoring-data.cjs').get('src/documentation-links.json');
const descriptions = require('./authoring-data.cjs').get('src/component-descriptions.json');
const BASE = 'https://learn.microsoft.com/en-us/minecraft/creator/';
const lists = {
  block:'reference/content/blockreference/examples/blockcomponents/blockcomponentslist',
  item:'reference/content/itemreference/examples/itemcomponentlist',
  entity:'reference/content/entityreference/examples/componentlist'
};
function componentUrl(kind,id) {
  const relative = id && !id.startsWith('minecraft:') && ['block','item'].includes(kind) ? 'documents/scripting/components-tutorial' : catalog.components[kind]?.[id] || lists[kind] || '';
  return BASE+relative+'?view=minecraft-bedrock-stable';
}
function componentDescription(kind,id,fallback='') {
  const authored=typeof fallback==='string'?fallback.trim():'',entry=descriptions.components[kind]?.[id],primary=entry?.description?.trim();
  if(!primary||entry.review==='retain-author-description')return authored||primary||'';
  if(primary===authored)return primary;
  const compatibility=/\b(?:format|version|requires?|legacy|deprecated|removed|experimental|root components|no longer|no parameters)\b/i.test(authored);
  if(compatibility&&!primary.includes(authored))return primary+'\n\n'+authored;
  // Detailed authored guidance can be more useful than a terse published lead.
  if(authored.length>primary.length*1.4)return authored;
  return primary;
}
function componentLink(kind,id) { return '[Microsoft Learn documentation]('+componentUrl(kind,id)+')'; }
module.exports = {componentUrl,componentLink,componentDescription};
