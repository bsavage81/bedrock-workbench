// Only these declarative families may cross the public data boundary.
const fs = require('node:fs');
const path = require('node:path');
const catalogs = ['documentation-links', 'component-descriptions', 'format-requirements', 'filter-catalog', 'molang-catalog', 'molang-guidance', 'event-forms'];
const schemas = ['block', 'entity', 'item', 'client-entity', 'creative-catalog', 'loot-table', 'recipe', 'texture-atlas', 'sound-definitions'];
const FILES = [...catalogs.map(name => `src/${name}.json`), ...schemas.map(name => `schemas/${name}.schema.json`)];
const bundled = Object.fromEntries(FILES.map(file => [file, JSON.parse(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'))]));
const active = structuredClone(bundled), listeners = new Set();
let revision = 'bundled', reference;
// Preserve identities held by existing providers, including component maps.
function replace(target, value) {
  for (const key of Object.keys(target)) if (!Object.hasOwn(value, key)) delete target[key];
  if (Array.isArray(target)) target.length = value.length;
  for (const [key, child] of Object.entries(value)) {
    if (child && typeof child === 'object' && target[key] && typeof target[key] === 'object' && Array.isArray(child) === Array.isArray(target[key])) replace(target[key], child);
    else target[key] = structuredClone(child);
  }
}
function apply(snapshot, id = 'bundled') {
  // Callers validate before reaching this synchronous commit point.
  for (const file of FILES) replace(active[file], snapshot?.files[file] || bundled[file]);
  reference = snapshot?.reference; revision = id;
  for (const listener of listeners) listener();
}
module.exports = { FILES, bundled, get: file => active[file], apply, get revision() { return revision; }, get reference() { return reference; }, subscribe(listener) { listeners.add(listener); return { dispose: () => listeners.delete(listener) }; } };
