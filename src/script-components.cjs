const path = require('node:path');
const { parse } = require('@babel/parser');
const BLOCK = Symbol('block registry'), ITEM = Symbol('item registry'), MODULE = Symbol('module');
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
  const root = { bindings: new Map() }, scopes = new WeakMap(), calls = [], writes = [], exports = new Map(), stars = [];
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
    if (node.type === 'FunctionDeclaration' && node.id) current.bindings.set(node.id.name, {});
    if (node.type === 'ClassDeclaration' && node.id) current.bindings.set(node.id.name, { classNode: node });
    if (/Function|Method/.test(node.type) && Array.isArray(node.params)) {
      current = scope(current); if (node.id) current.bindings.set(node.id.name, {});
      for (const param of node.params) bind(param, current, {});
    } else if (['BlockStatement', 'CatchClause', 'ForStatement', 'ForOfStatement', 'ForInStatement'].includes(node.type)) {
      current = scope(current); if (node.param) bind(node.param, current, {});
    }
    scopes.set(node, current);
    if (node.type === 'VariableDeclaration') for (const declaration of node.declarations) bind(declaration.id, current, node.kind === 'const' ? { init: declaration.init, scope: current } : {});
    if (node.type === 'ImportDeclaration') for (const spec of node.specifiers) current.bindings.set(spec.local.name, { from: node.source.value, imported: spec.type === 'ImportDefaultSpecifier' ? 'default' : spec.type === 'ImportNamespaceSpecifier' ? '*' : spec.imported.name || spec.imported.value, scope: current });
    if (node.type === 'ExportNamedDeclaration') {
      if (node.declaration?.type === 'VariableDeclaration') for (const d of node.declaration.declarations) if (d.id.type === 'Identifier') exports.set(d.id.name, { local: d.id.name });
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
  return { file, text, root, scopes, calls, exports, stars, lookup };
}
function analyze(sources) {
  const normalize = file => process.platform === 'win32' ? path.resolve(file).toLowerCase() : path.resolve(file);
  const modules = new Map();
  for (const [file, text] of sources) { const record = moduleRecord(file, text); if (record) modules.set(normalize(file), record); }
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
      if (binding.value) return binding.value;
      if (binding.from) { const next = imported(record, binding.from); if (next) return binding.imported === '*' ? { [MODULE]: next } : exported(next, binding.imported, seen, depth + 1); }
      if (binding.selector) { const base = bindingValue(record, binding.base, seen, depth + 1); return base && typeof base === 'object' ? base[binding.selector] : undefined; }
      if (binding.classNode) return Object.fromEntries(binding.classNode.body.body.filter(n => !n.static).map(n => [n.key?.name || n.key?.value, undefined]));
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
    if (node.type === 'ObjectExpression') {
      const result = Object.create(null);
      for (const p of node.properties) if (['ObjectProperty', 'ObjectMethod'].includes(p.type)) {
        const key = p.computed ? next(p.key) : p.key.name || p.key.value;
        if (typeof key === 'string') result[key] = p.type === 'ObjectMethod' ? undefined : next(p.value);
      }
      return result;
    }
    if (node.type === 'NewExpression') return next(node.callee); // inspect method names; never instantiate.
    if (['MemberExpression', 'OptionalMemberExpression'].includes(node.type)) {
      const key = property(node), base = next(node.object);
      if (base?.[MODULE]) return exported(base[MODULE], key, seen, depth + 1);
      if (base && typeof base === 'object' && Object.hasOwn(base, key)) return base[key];
      return registry(key);
    }
  }
  const result = [];
  for (const record of modules.values()) for (const call of record.calls) {
    const callee = unwrap(call.callee);
    if (!['MemberExpression', 'OptionalMemberExpression'].includes(callee?.type) || property(callee) !== 'registerCustomComponent') continue;
    const target = evaluate(record, callee.object, record.scopes.get(call));
    if (target !== BLOCK && target !== ITEM) continue;
    const id = evaluate(record, call.arguments[0], record.scopes.get(call));
    if (typeof id !== 'string' || !/^(?!minecraft:)[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(id)) continue;
    const handler = evaluate(record, call.arguments[1], record.scopes.get(call));
    result.push({ id, kind: target === BLOCK ? 'block' : 'item', file: record.file, offset: call.arguments[0].start, line: call.arguments[0].loc.start.line - 1, column: call.arguments[0].loc.start.column, callbacks: handler && typeof handler === 'object' ? Object.keys(handler).filter(key => /^on[A-Z]/.test(key)) : [] });
  }
  return result;
}
module.exports = { analyze, scriptFile };
