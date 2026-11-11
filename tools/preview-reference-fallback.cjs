// Preserve documented Stable components only when real Preview vanilla files
// still use them. Every inherited description keeps its actual source tag.
const jsonc = require('jsonc-parser');
function mergePreviewReference(preview, stable, vanillaFiles, learn = {}) {
  const counts = {}, removals = [];
  for (const [file, raw] of Object.entries(vanillaFiles)) {
    if (!/^behavior_pack\/entities\/.*\.json$/.test(file)) continue;
    const doc = jsonc.parse(Buffer.from(raw).toString()), entity = doc?.['minecraft:entity'];
    for (const components of [entity?.components, ...Object.values(entity?.component_groups || {})]) {
      if (!components || typeof components !== 'object' || Array.isArray(components)) continue;
      for (const name of Object.keys(components)) counts[name] = (counts[name] || 0) + 1;
      const removal = components['minecraft:spell_effects']?.remove_effects;
      if (removal !== undefined) removals.push(removal);
    }
  }
  const inherited = [], unresolved = [], absent = [];
  for (const [name, component] of Object.entries(stable.components.entity)) {
    if (Object.hasOwn(preview.components.entity, name)) continue;
    if (counts[name]) { preview.components.entity[name] = { ...structuredClone(component), sourceTag: stable.tag }; inherited.push({ name, sourceTag: stable.tag, previewExamples: counts[name] }); }
    else absent.push(name);
  }
  const corrections = [];
  const field = inherited.some(v => v.name === 'minecraft:spell_effects') && preview.components.entity['minecraft:spell_effects']?.fields?.remove_effects;
  // This is a documented alternative, not a type inferred from arbitrary samples.
  // Existing consumers deliberately treat alternative type labels as advisory.
  const page = learn.pages?.['entity|minecraft:spell_effects'];
  if (field?.type === 'String' && /^[a-f0-9]{40}$/.test(learn.revision || '')
      && /\|\s*remove_effects\s*\|[^\n]*\|\s*Array of strings\s*\|/i.test(page?.text || '')
      && removals.some(Array.isArray) && removals.every(v => typeof v === 'string' || Array.isArray(v) && v.every(x => typeof x === 'string'))) {
    field.type = 'String or Array of strings';
    field.description += ' Microsoft Learn documents an array of strings; official Preview samples also retain the string form. The inherited string-only constraint is advisory.';
    corrections.push({ component: 'minecraft:spell_effects', field: 'remove_effects', from: 'String', to: field.type,
      learnRevision: learn.revision, learnPath: page.path, sampleValues: removals.length });
  }
  return { inherited, unresolved, absent, corrections };
}
module.exports = { mergePreviewReference };
