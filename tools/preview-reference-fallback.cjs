// Preserve documented Stable components only when real Preview vanilla files
// still use them. Every inherited description keeps its actual source tag.
const jsonc = require('jsonc-parser');
function mergePreviewReference(preview, stable, vanillaFiles) {
  const counts = {};
  for (const [file, raw] of Object.entries(vanillaFiles)) {
    if (!/^behavior_pack\/entities\/.*\.json$/.test(file)) continue;
    const doc = jsonc.parse(Buffer.from(raw).toString()), entity = doc?.['minecraft:entity'];
    for (const components of [entity?.components, ...Object.values(entity?.component_groups || {})]) {
      if (!components || typeof components !== 'object' || Array.isArray(components)) continue;
      for (const name of Object.keys(components)) counts[name] = (counts[name] || 0) + 1;
    }
  }
  const inherited = [], unresolved = [];
  for (const [name, component] of Object.entries(stable.components.entity)) {
    if (Object.hasOwn(preview.components.entity, name)) continue;
    if (counts[name]) { preview.components.entity[name] = { ...component, sourceTag: stable.tag }; inherited.push({ name, sourceTag: stable.tag, previewExamples: counts[name] }); }
    else unresolved.push(name);
  }
  return { inherited, unresolved };
}
module.exports = { mergePreviewReference };
