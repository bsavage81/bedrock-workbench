const catalog = require('./documentation-links.json');
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
function componentLink(kind,id) { return '[Microsoft Learn documentation]('+componentUrl(kind,id)+')'; }
module.exports = {componentUrl,componentLink};
