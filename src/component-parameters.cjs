const json = require('jsonc-parser');
function context(document, offset) {
  if (document.side !== 'behavior') return;
  const location = json.getLocation(document.text, offset), keys = location.path;
  const kind = keys[0] === 'minecraft:block' ? 'block' : keys[0] === 'minecraft:item' ? 'item' : undefined;
  const depth = keys[1] === 'components' ? 2 : keys[1] === 'permutations' && typeof keys[2] === 'number' && keys[3] === 'components' ? 4 : 0;
  const id = keys[depth];
  if (!kind || !depth || typeof id !== 'string' || id.startsWith('minecraft:') || !id.includes(':')) return;
  if (keys.length === depth + 1 && location.isAtPropertyKey) return;
  const relative = keys.slice(depth + 1).map(key => typeof key === 'number' ? '*' : key);
  return { kind, id, path: location.isAtPropertyKey ? relative.slice(0, -1) : relative, field: location.isAtPropertyKey ? relative.at(-1) : undefined, mode: location.isAtPropertyKey ? 'key' : 'value', location, node: json.findNodeAtOffset(document.tree, offset, true) };
}
function hints(index, kind, id) {
  const values = new Map();
  function add(path, types = [], samples = [], sources = [], description) {
    const key = JSON.stringify(path);
    if (!values.has(key)) values.set(key, { path, types: new Set(), samples: new Set(), sources: [], description });
    const value = values.get(key); types.forEach(type => value.types.add(type)); samples.forEach(sample => value.samples.add(sample));
    if (description && !value.description) value.description = description;
    for (const source of sources) if (!value.sources.some(s => s.file === source.file && s.line === source.line && s.column === source.column)) value.sources.push(source);
  }
  for (const registration of index.customComponents || []) if (registration.kind === kind && registration.id === id) for (const value of registration.parameters || []) add(value.path, value.types, value.samples, value.sources.map(source => ({ ...source, origin: 'script' })), value.description);
  for (const document of index.documents.values()) {
    const root = document.data?.['minecraft:' + kind]; if (!root || document.side !== 'behavior') continue;
    const containers = [[['minecraft:' + kind, 'components'], root.components], ...(Array.isArray(root.permutations) ? root.permutations : []).map((p, i) => [['minecraft:' + kind, 'permutations', i, 'components'], p?.components])];
    for (const [prefix, components] of containers) if (components && Object.hasOwn(components, id)) {
      function observe(value, path, jsonPath, depth = 0) {
        if (depth > 12) return;
        const type = value === null ? 'null' : Array.isArray(value) ? 'array' : Number.isInteger(value) ? 'integer' : typeof value;
        const node = json.findNodeAtLocation(document.tree, jsonPath), before = document.text.slice(0, node?.offset || 0).split('\n');
        add(path, [type], ['string', 'number', 'boolean'].includes(typeof value) && String(value).length <= 256 ? [value] : [], [{ file: document.file, line: before.length - 1, column: before.at(-1).length, origin: 'example' }]);
        if (Array.isArray(value)) value.slice(0, 5).forEach((child, i) => observe(child, [...path, '*'], [...jsonPath, i], depth + 1));
        else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value).slice(0, 128)) observe(child, [...path, key], [...jsonPath, key], depth + 1);
      }
      observe(components[id], [], [...prefix, id]);
    }
  }
  // Nested reads imply container fields, but never strengthen observed/inferred
  // values into validation rules or mandatory fields.
  for (const value of [...values.values()]) for (let i = 0; i < value.path.length; i++) {
    const path = value.path.slice(0, i), existing = values.get(JSON.stringify(path));
    if (!existing?.types.size) add(path, [value.path[i] === '*' ? 'array' : 'object'], [], value.sources);
  }
  return [...values.values()].map(value => { if (value.types.has('number')) value.types.delete('integer'); return { ...value, types: [...value.types], samples: [...value.samples].slice(0, 12), sources: value.sources.slice(0, 4) }; });
}
module.exports = { context, hints };
