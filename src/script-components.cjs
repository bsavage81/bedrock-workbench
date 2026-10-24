const path = require('node:path');
const { parse } = require('@babel/parser');
const BLOCK = Symbol('block registry'), ITEM = Symbol('item registry'), MODULE = Symbol('module');
const PARAM = Symbol('parameters'), INSTANCE = Symbol('component instance');
const registry = key => key === 'blockComponentRegistry' ? BLOCK : key === 'itemComponentRegistry' ? ITEM : undefined;
const scriptFile = file => /\.(?:[cm]?js|[cm]?ts)$/i.test(file) && !/\.d\.[cm]?ts$/i.test(file);
const unwrap = node => ['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression', 'TypeCastExpression', 'ParenthesizedExpression'].includes(node?.type) ? unwrap(node.expression) : node;
const property = node => node && (!node.computed && node.property?.type === 'Identifier' ? node.property.name : node.property?.value);
function children(node) {
  return Object.entries(node).filter(([key]) => !['loc', 'start', 'end', 'extra', 'errors', 'comments', 'tokens'].includes(key)).flatMap(([, value]) => Array.isArray(value) ? value.filter(v => v?.type) : value?.type ? [value] : []);
}
function moduleRecord(file, text) {
  let program;
  try { program = parse(text, { sourceType: 'unambiguous', plugins: ['typescript'], errorRecovery: true }).program; } catch { return; }
  const root = { bindings: new Map() }, scopes = new WeakMap(), calls = [], writes = [], exports = new Map(), stars = [], nodes = [], types = new Map();
  const scope = parent => ({ parent, bindings: new Map() });
  const bind = (pattern, current, binding) => {
    if (!pattern) return;
    if (pattern.type === 'Identifier') current.bindings.set(pattern.name, binding);
    else if (pattern.type === 'AssignmentPattern') bind(pattern.left, current, binding);
    else if (pattern.type === 'ObjectPattern') for (const p of pattern.properties) {
      if (p.type === 'ObjectProperty') {
        const key = p.key.name || p.key.value;
        bind(p.value, current, { value: registry(key), selector: key, base: binding, scope: current });
      } else bind(p.argument, current, {});
    }
    else if (pattern.type === 'ArrayPattern') for (const p of pattern.elements) bind(p, current, {});
    else if (pattern.type === 'RestElement') bind(pattern.argument, current, {});
  };
  function visit(node, current) {
    if (node.type === 'FunctionDeclaration' && node.id) current.bindings.set(node.id.name, { functionNode: node });
    if (node.type === 'ClassDeclaration' && node.id) current.bindings.set(node.id.name, { classNode: node });
    if (/Function|Method/.test(node.type) && Array.isArray(node.params)) {
      current = scope(current); if (node.id) current.bindings.set(node.id.name, {});
      for (const param of node.params) bind(param, current, {});
    } else if (['BlockStatement', 'CatchClause', 'ForStatement', 'ForOfStatement', 'ForInStatement'].includes(node.type)) {
      current = scope(current); if (node.param) bind(node.param, current, {});
    }
    scopes.set(node, current);
    nodes.push(node);
    if (['TSTypeAliasDeclaration', 'TSInterfaceDeclaration'].includes(node.type)) types.set(node.id.name, node);
    if (node.type === 'VariableDeclaration') for (const declaration of node.declarations) bind(declaration.id, current, node.kind === 'const' ? { init: declaration.init, scope: current } : {});
    if (node.type === 'ImportDeclaration') for (const spec of node.specifiers) current.bindings.set(spec.local.name, { from: node.source.value, imported: spec.type === 'ImportDefaultSpecifier' ? 'default' : spec.type === 'ImportNamespaceSpecifier' ? '*' : spec.imported.name || spec.imported.value, scope: current });
    if (node.type === 'ExportNamedDeclaration') {
      if (node.declaration?.type === 'VariableDeclaration') for (const d of node.declaration.declarations) if (d.id.type === 'Identifier') exports.set(d.id.name, { local: d.id.name });
      if (node.declaration?.id) exports.set(node.declaration.id.name, { local: node.declaration.id.name });
      for (const spec of node.specifiers || []) exports.set(spec.exported.name || spec.exported.value, node.source ? { from: node.source.value, imported: spec.local.name || spec.local.value } : { local: spec.local.name || spec.local.value });
    }
    if (node.type === 'ExportDefaultDeclaration') exports.set('default', { expression: node.declaration });
    if (node.type === 'ExportAllDeclaration') stars.push(node.source.value);
    if (['CallExpression', 'OptionalCallExpression'].includes(node.type)) calls.push(node);
    if (['AssignmentExpression', 'UpdateExpression'].includes(node.type)) writes.push(node.left || node.argument);
    for (const child of children(node)) visit(child, current);
  }
  visit(program, root);
  const lookup = (name, current) => { for (; current; current = current.parent) if (current.bindings.has(name)) return current.bindings.get(name); };
  for (const target of writes) {
    let node = target; while (['MemberExpression', 'OptionalMemberExpression'].includes(node?.type)) node = node.object;
    if (node?.type === 'Identifier') { const binding = lookup(node.name, scopes.get(target)); if (binding) binding.mutated = true; }
  }
  return { file, text, root, scopes, calls, exports, stars, lookup, nodes, types };
}
function analyze(sources) {
  const normalize = file => process.platform === 'win32' ? path.resolve(file).toLowerCase() : path.resolve(file);
  const modules = new Map();
  for (const [file, text] of sources) { const record = moduleRecord(file, text); if (record) modules.set(normalize(file), record); }
  const owners = new WeakMap(), registered = new Map(), hints = new Map();
  for (const record of modules.values()) for (const node of record.nodes) owners.set(node, record);
  let activeComponent;
  const parameter = (value, key) => value?.[PARAM] && (value[PARAM].path !== null || key === 'params') ? { [PARAM]: { ...value[PARAM], path: value[PARAM].path === null ? [] : [...value[PARAM].path, key] } } : undefined;
  function imported(record, spec) {
    if (!spec?.startsWith('.')) return;
    const base = path.resolve(path.dirname(record.file), spec);
    return [base, base.replace(/\.[cm]?js$/i, '.ts'), base + '.ts', base + '.js', path.join(base, 'index.ts'), path.join(base, 'index.js')].map(f => modules.get(normalize(f))).find(Boolean);
  }
  function exported(record, name, seen, depth) {
    const key = record.file + ':' + name;
    if (depth > 24 || seen.has(key)) return;
    seen.add(key);
    try {
      const value = record.exports.get(name);
      if (value?.local) return bindingValue(record, record.lookup(value.local, record.root), seen, depth + 1);
      if (value?.expression) return evaluate(record, value.expression, record.root, seen, depth + 1);
      if (value?.from) { const next = imported(record, value.from); if (next) return exported(next, value.imported, seen, depth + 1); }
      for (const spec of record.stars) { const next = imported(record, spec); if (next) { const result = exported(next, name, seen, depth + 1); if (result !== undefined) return result; } }
    } finally { seen.delete(key); }
  }
  function bindingValue(record, binding, seen, depth) {
    if (!binding || binding.mutated || depth > 24 || seen.has(binding)) return;
    seen.add(binding);
    try {
      if (binding.parameters) {
        const ref = activeComponent ? binding.parameters.get(activeComponent) : binding.parameters.size === 1 ? [...binding.parameters.values()][0] : undefined;
        return ref && { [PARAM]: ref };
      }
      if (binding.value) return binding.value;
      if (binding.from) { const next = imported(record, binding.from); if (next) return binding.imported === '*' ? { [MODULE]: next } : exported(next, binding.imported, seen, depth + 1); }
      if (binding.selector) { const base = bindingValue(record, binding.base, seen, depth + 1); return base?.[PARAM] ? parameter(base, binding.selector) : base && typeof base === 'object' ? base[binding.selector] : undefined; }
      if (binding.functionNode) return binding.functionNode;
      if (binding.classNode) return Object.fromEntries(binding.classNode.body.body.filter(n => !n.static).map(n => [n.key?.name || n.key?.value, n]));
      return evaluate(record, binding.init, binding.scope, seen, depth + 1);
    } finally { seen.delete(binding); }
  }
  function evaluate(record, raw, current, seen = new Set(), depth = 0) {
    const node = unwrap(raw); if (!node || depth > 24) return;
    current = record.scopes.get(node) || current;
    const next = child => evaluate(record, child, current, seen, depth + 1);
    if (['StringLiteral', 'NumericLiteral', 'BooleanLiteral'].includes(node.type)) return node.value;
    if (node.type === 'Identifier') return bindingValue(record, record.lookup(node.name, current), seen, depth + 1);
    if (node.type === 'TemplateLiteral') {
      let result = node.quasis[0].value.cooked;
      for (let i = 0; i < node.expressions.length; i++) { const value = next(node.expressions[i]); if (!['string', 'number'].includes(typeof value)) return; result += value + node.quasis[i + 1].value.cooked; if (result.length > 256) return; }
      return result;
    }
    if (node.type === 'BinaryExpression' && node.operator === '+') { const a = next(node.left), b = next(node.right); if (typeof a === 'string' && ['string', 'number'].includes(typeof b) && a.length + String(b).length <= 256) return a + b; }
    if (['FunctionExpression', 'ArrowFunctionExpression'].includes(node.type)) return node;
    if (node.type === 'LogicalExpression') {
      const value = next(node.left); return value?.[PARAM] ? value : undefined;
    }
    if (node.type === 'ObjectExpression') {
      const result = Object.create(null);
      for (const p of node.properties) if (['ObjectProperty', 'ObjectMethod'].includes(p.type)) {
        const key = p.computed ? next(p.key) : p.key.name || p.key.value;
        if (typeof key === 'string') result[key] = p.type === 'ObjectMethod' ? p : next(p.value);
      }
      return result;
    }
    if (node.type === 'NewExpression') return next(node.callee); // inspect method names; never instantiate.
    if (['CallExpression', 'OptionalCallExpression'].includes(node.type) && property(node.callee) === 'getComponent') {
      const id = next(node.arguments[0]), kinds = registered.get(id);
      if (kinds?.size === 1) return { [INSTANCE]: { id, kind: [...kinds][0] } };
    }
    if (['MemberExpression', 'OptionalMemberExpression'].includes(node.type)) {
      const key = property(node), base = next(node.object);
      if (base?.[PARAM] && typeof key === 'string') return parameter(base, key);
      if (base?.[INSTANCE] && key === 'customComponentParameters') return { [PARAM]: { ...base[INSTANCE], path: null } };
      if (base?.[MODULE]) return exported(base[MODULE], key, seen, depth + 1);
      if (base && typeof base === 'object' && Object.hasOwn(base, key)) return base[key];
      return registry(key);
    }
  }
  const result = [];
  const handlers = [];
  for (const record of modules.values()) for (const call of record.calls) {
    const callee = unwrap(call.callee);
    if (!['MemberExpression', 'OptionalMemberExpression'].includes(callee?.type) || property(callee) !== 'registerCustomComponent') continue;
    const target = evaluate(record, callee.object, record.scopes.get(call));
    if (target !== BLOCK && target !== ITEM) continue;
    const id = evaluate(record, call.arguments[0], record.scopes.get(call));
    if (typeof id !== 'string' || !/^(?!minecraft:)[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(id)) continue;
    const handler = evaluate(record, call.arguments[1], record.scopes.get(call));
    const kind = target === BLOCK ? 'block' : 'item';
    result.push({ id, kind, file: record.file, offset: call.arguments[0].start, line: call.arguments[0].loc.start.line - 1, column: call.arguments[0].loc.start.column, callbacks: handler && typeof handler === 'object' ? Object.keys(handler).filter(key => /^on[A-Z]/.test(key)) : [] });
    if (!registered.has(id)) registered.set(id, new Set()); registered.get(id).add(kind);
    if (handler && typeof handler === 'object') for (const [name, method] of Object.entries(handler)) if (/^on[A-Z]/.test(name) && method?.params) handlers.push({ id, kind, method });
  }
  function hint(ref, record, node, type, sample) {
    if (!ref || ref.path === null || ref.path.length > 12 || ref.path.some(key => typeof key !== 'string')) return;
    const component = ref.kind + ':' + ref.id; if (!hints.has(component)) hints.set(component, new Map());
    const key = JSON.stringify(ref.path), values = hints.get(component);
    if (!values.has(key)) values.set(key, { path: ref.path, types: new Set(), samples: new Set(), sources: [] });
    const value = values.get(key); if (type) value.types.add(type);
    if (['string', 'number', 'boolean'].includes(typeof sample) && String(sample).length <= 256) value.samples.add(sample);
    if (node?.loc && !value.sources.some(s => s.file === record.file && s.line === node.loc.start.line - 1)) value.sources.push({ file: record.file, line: node.loc.start.line - 1, column: node.loc.start.column });
    const description = node?.leadingComments?.map(c => c.value.replace(/^\s*\* ?/gm, '').trim()).join('\n');
    if (description && !value.description) value.description = description.slice(0, 500);
  }
  function seed(record, pattern, ref, current) {
    if (!pattern) return;
    if (pattern.type === 'Identifier') { const binding = record.lookup(pattern.name, current); if (binding) { binding.parameters ||= new Map(); binding.parameters.set(ref.kind + ':' + ref.id, ref); } hint(ref, record, pattern); }
    else if (pattern.type === 'AssignmentPattern') { seed(record, pattern.left, ref, current); const value = evaluate(record, pattern.right, current); hint(ref, record, pattern, ['string', 'number', 'boolean'].includes(typeof value) ? typeof value : undefined, value); }
    else if (pattern.type === 'ObjectPattern') for (const p of pattern.properties) if (p.type === 'ObjectProperty') {
      const key = p.key.name || p.key.value;
      if (ref.path === null && key !== 'params') continue;
      seed(record, p.value, { ...ref, path: ref.path === null ? [] : [...ref.path, key] }, current);
    }
  }
  function readType(record, type, ref, depth = 0) {
    if (!type || !ref || depth > 12) return;
    if (type.type === 'TSTypeReference' && type.typeName.type === 'Identifier') {
      const name = type.typeName.name, local = record.types.get(name);
      if (local) return readType(record, local.typeAnnotation || local.body, ref, depth + 1);
      const binding = record.lookup(name, record.root), next = binding?.from && imported(record, binding.from);
      const declaration = next?.types.get(next.exports.get(binding.imported)?.local || binding.imported);
      if (declaration) return readType(next, declaration.typeAnnotation || declaration.body, ref, depth + 1);
    }
    const primitive = { TSStringKeyword: 'string', TSNumberKeyword: 'number', TSBooleanKeyword: 'boolean', TSArrayType: 'array', TSTupleType: 'array' }[type.type];
    if (primitive) hint(ref, record, type, primitive);
    if (type.type === 'TSLiteralType') hint(ref, record, type, typeof type.literal.value, type.literal.value);
    if (type.type === 'TSUnionType') for (const child of type.types) readType(record, child, ref, depth + 1);
    if (['TSTypeLiteral', 'TSInterfaceBody'].includes(type.type)) {
      hint(ref, record, type, 'object');
      for (const member of type.members || type.body || []) if (member.type === 'TSPropertySignature') {
        const key = member.key.name || member.key.value; if (ref.path === null && key !== 'params') continue;
        const child = { ...ref, path: ref.path === null ? [] : [...ref.path, key] };
        hint(child, record, member); readType(record, member.typeAnnotation?.typeAnnotation, child, depth + 1);
      }
    }
  }
  for (const { id, kind, method } of handlers) {
    const record = owners.get(method); if (!record) continue;
    const ref = { id, kind, path: null };
    seed(record, method.params[1], ref, record.scopes.get(method));
    readType(record, method.params[1]?.typeAnnotation?.typeAnnotation, ref);
  }
  function analyzeNode(record, node) {
    const current = record.scopes.get(node), value = child => evaluate(record, child, current);
    if (['MemberExpression', 'OptionalMemberExpression'].includes(node.type)) hint(value(node)?.[PARAM], record, node.property);
    if (['CallExpression', 'OptionalCallExpression'].includes(node.type)) {
      const owner = node.callee?.object?.name, method = property(node.callee);
      if (!record.lookup(owner, current) && ((owner === 'Array' && method === 'isArray') || (owner === 'Number' && method === 'isInteger'))) hint(value(node.arguments[0])?.[PARAM], record, node, owner === 'Array' ? 'array' : 'integer');
    }
    if (node.type === 'BinaryExpression') for (const [a, b] of [[node.left, node.right], [node.right, node.left]]) {
      if (a.type === 'UnaryExpression' && a.operator === 'typeof' && ['string', 'number', 'boolean', 'object'].includes(b.value)) hint(value(a.argument)?.[PARAM], record, a.argument, b.value);
      else if (['===', '!=='].includes(node.operator) && ['StringLiteral', 'NumericLiteral', 'BooleanLiteral'].includes(b.type)) hint(value(a)?.[PARAM], record, a, typeof b.value, b.value);
    }
    if (node.type === 'LogicalExpression') {
      const sample = value(node.right); if (['string', 'number', 'boolean'].includes(typeof sample)) hint(value(node.left)?.[PARAM], record, node.left, typeof sample, sample);
    }
    if (['TSAsExpression', 'TSSatisfiesExpression'].includes(node.type)) readType(record, node.typeAnnotation, value(node.expression)?.[PARAM]);
  }
  for (const record of modules.values()) for (const node of record.nodes) analyzeNode(record, node);
  for (const { id, kind, method } of handlers) {
    activeComponent = kind + ':' + id;
    const record = owners.get(method); if (!record) continue;
    const walk = node => { analyzeNode(record, node); for (const child of children(node)) walk(child); };
    walk(method);
  }
  activeComponent = undefined;
  for (const registration of result) {
    const values = hints.get(registration.kind + ':' + registration.id) || new Map();
    registration.parameters = [...values.values()].filter(value => !value.path.slice(0, -1).some((_, i) => [...(values.get(JSON.stringify(value.path.slice(0, i + 1)))?.types || [])].some(type => ['array', 'string', 'number', 'integer', 'boolean'].includes(type)))).map(value => ({ ...value, types: [...value.types], samples: [...value.samples], sources: value.sources.slice(0, 3) }));
  }
  return result;
}
module.exports = { analyze, scriptFile };
