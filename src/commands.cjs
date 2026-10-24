// Independently implemented command assistance using Mojang's public metadata.
function tokenize(text) {
  const tokens = []; let start = -1, quote = false, escape = false, depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (start < 0) { if (/\s/.test(c)) continue; start = i; }
    if (escape) { escape = false; continue; }
    if (c === '\\' && quote) { escape = true; continue; }
    if (c === '"') quote = !quote;
    if (!quote) {
      if ('[{'.includes(c)) depth++;
      if (']}'.includes(c)) depth = Math.max(0, depth - 1);
      if (/\s/.test(c) && depth === 0) { tokens.push({ value: text.slice(start, i), start, end: i }); start = -1; }
    }
  }
  if (start >= 0) tokens.push({ value: text.slice(start), start, end: text.length });
  return tokens;
}
function context(text, reference, index) {
  if (text.trimStart().startsWith('#') || text.length > 16384) return;
  const tokens = tokenize(text), editing = tokens.length && tokens.at(-1).end === text.length;
  const current = editing ? tokens.pop() : { value: '', start: text.length, end: text.length };
  const enums = new Map((reference?.commands?.command_enums || []).map(e => [e.name.toUpperCase(), e.values.map(v => v.value)]));
  const commands = reference?.commands?.commands || [];
  const commandNames = () => [...new Set([...commands.flatMap(c => [c.name, ...(c.aliases || [])]), ...(index?.values('command').keys() || [])])];
  const candidates = new Set(), signatures = [];
  const addType = p => {
    const t = p.type.name.toUpperCase();
    const kind = { ITEM: 'item', BLOCK: 'block', ACTOR: 'entity', ENTITYTYPE: 'entity', EFFECT: 'effect', ENCHANTMENT: 'enchantment', DIMENSION: 'dimension', FUNCTION: 'function', FUNCTIONNAME: 'function', PATHCOMMAND: 'function', PARTICLE: 'particle', SOUND: 'sound', SCOREBOARDOBJECTIVES: 'objective' }[t];
    if (kind) { for (const id of reference?.vanilla?.[kind] || []) candidates.add(id); for (const id of index?.values(kind).keys() || []) candidates.add(id); }
    if (/SELECTION/.test(t)) for (const value of ['@s', '@a', '@e', '@p', '@r']) candidates.add(value);
    if (/POSITION/.test(t)) for (const value of ['~', '^']) candidates.add(value);
    if (p.name?.toLowerCase().includes('tag')) for (const id of index?.values('tag').keys() || []) candidates.add(id);
    for (const value of enums.get(t) || []) candidates.add(value);
  };
  let visits = 0;
  function match(name, rest, depth = 0) {
    if (++visits > 2000 || depth > 24) return;
    const command = commands.find(c => c.name === name || c.aliases?.includes(name));
    if (!command) return;
    for (const overload of command.overloads || []) {
      let cursor = 0, failed = false;
      for (let i = 0; i < overload.params.length; i++) {
        const p = overload.params[i], t = p.type.name.toUpperCase();
        if (t.startsWith('EXECUTECHAINEDOPTION')) { match('execute', rest.slice(cursor), depth + 1); failed = true; break; }
        if (t === 'COMMAND' || t === 'COMMANDNAME' || t === 'COMMAND_CODE' || (name === 'execute' && t === 'CODEBUILDERARGS')) {
          if (cursor === rest.length) for (const id of commandNames()) candidates.add(id);
          else match(rest[cursor].value.replace(/^\//, ''), rest.slice(cursor + 1), depth + 1);
          failed = true; break;
        }
        const width = /^(POSITION|POSITION_FLOAT)$/.test(t) ? 3 : 1;
        if (cursor + width > rest.length) {
          if (cursor === rest.length || width === 3) {
            addType(p); signatures.push({ command, overload, parameter: i });
          }
          failed = true; break;
        }
        const allowed = enums.get(t);
        // Dynamic identifiers may extend metadata enums; only discriminate literal subcommands.
        if (allowed?.length && !['ITEM', 'BLOCK', 'ACTOR', 'ENTITYTYPE', 'FUNCTION', 'SCOREBOARDOBJECTIVES'].includes(t) && !allowed.includes(rest[cursor].value)) { failed = true; break; }
        cursor += width;
      }
      if (!failed && cursor === rest.length) signatures.push({ command, overload, parameter: Math.max(0, overload.params.length - 1) });
    }
  }
  if (!tokens.length) for (const id of commandNames()) candidates.add(id);
  else match(tokens[0].value.replace(/^\//, ''), tokens.slice(1));
  // Selector values are completed within the current token, without splitting brackets.
  const selector = /(?:^|[,\[])\s*(type|tag)=(!?)([^,\]]*)$/.exec(current.value);
  let start = current.start, prefix = current.value;
  if (selector) {
    candidates.clear(); const kind = selector[1] === 'type' ? 'entity' : 'tag';
    for (const id of [...(reference?.vanilla?.[kind] || []), ...(index?.values(kind).keys() || [])]) candidates.add(id);
    prefix = selector[3]; start = text.length - prefix.length;
  } else if (!tokens.length && prefix.startsWith('/')) { start++; prefix = prefix.slice(1); }
  return { start, end: text.length, values: [...candidates].filter(id => typeof id === 'string' && id.startsWith(prefix)).slice(0,2000), signatures };
}
module.exports = { tokenize, context };
