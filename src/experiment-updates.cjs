const core = require('./core.cjs');
const experiments = require('./experiments.cjs');
const { compareVersions } = require('./releases.cjs');
const SOURCE = 'https://minecraft.wiki/w/Experiments#Bedrock_Edition_2';
const API = 'https://minecraft.wiki/api.php?action=query&prop=revisions&rvprop=ids%7Ctimestamp%7Ccontent&rvslots=main&titles=Experiments&format=json&formatversion=2';
function plain(text) {
  return text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, title, label) => label || title).replace(/\{\{[^{}]*\}\}/g, '').replace(/<[^>]+>/g, '').replace(/''+/g, '').replace(/^["“]|["”]$/g, '').trim();
}
function version(value, preview = false) {
  const match = /(\d+\.\d+(?:\.\d+){0,2})/.exec(value || ''); if (!match) return;
  const numbers = match[1].split('.').map(Number); if (numbers[0] !== 1) numbers.unshift(1);
  if (numbers.length < 3) return;
  const engine = numbers.slice(0, 3).join('.'); compareVersions(engine, engine);
  return { engine, build: preview ? numbers[3] || 0 : 0 };
}
const identity = text => text.toLowerCase().replace(/\bof\b/g, '').replace(/\bfeatures?\b$/g, '').replace(/[^a-z0-9]/g, '');
function named(label) {
  label = plain(label).replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
  if (!label || label.length > 100 || /[<>\n{}]/.test(label)) throw new Error('Unrecognized experiment name');
  const aliases = { customprojectiles: 'customProjectiles', customprojectile: 'customProjectiles', experimentalcustomprojectile: 'customProjectiles', voxelshapes: 'voxelShapes' };
  const key = identity(label);
  const id = experiments.catalog.find(e => identity(e.label) === key)?.id || (Object.hasOwn(aliases, key) ? aliases[key] : undefined) || 'discovered_' + label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_$/g, '');
  return { id, label: experiments.catalog.find(e => e.id === id)?.label || label };
}
function splitTemplate(body) {
  const fields = []; let depth = 0, links = 0, start = 0;
  for (let i = 0; i < body.length; i++) {
    const pair = body.slice(i, i + 2);
    if (pair === '{{') { depth++; i++; } else if (pair === '}}') { depth--; i++; }
    else if (pair === '[[') { links++; i++; } else if (pair === ']]') { links--; i++; }
    else if (body[i] === '|' && depth === 0 && links === 0) { fields.push(body.slice(start, i)); start = i + 1; }
  }
  fields.push(body.slice(start)); return fields;
}
function templates(text, name) {
  const result = []; let cursor = 0;
  while ((cursor = text.indexOf('{{' + name, cursor)) >= 0) {
    const start = cursor + 2; let depth = 1; cursor += 2;
    while (cursor < text.length && depth) {
      const pair = text.slice(cursor, cursor + 2);
      if (pair === '{{') { depth++; cursor += 2; } else if (pair === '}}') { depth--; cursor += 2; } else cursor++;
    }
    if (depth) throw new Error('Incomplete experiment history template');
    result.push(splitTemplate(text.slice(start, cursor - 2)));
  }
  return result;
}
function parseWiki(text, revision = {}) {
  if (typeof text !== 'string' || text.length > 2 * 1024 * 1024) throw new Error('Unrecognized experiment reference');
  const headings = [...text.matchAll(/^(={2,3})\s*(''*Bedrock Edition''*)\s*\1\s*$/gm)];
  const start = headings[0]?.index;
  if (start === undefined) throw new Error('Minecraft Wiki Bedrock experiment section is missing');
  const historyStart = text.indexOf('\n== History ==', start);
  if (historyStart < 0) throw new Error('Minecraft Wiki experiment history is missing');
  const features = text.slice(start, historyStart), removedAt = features.search(/^===+\s*Removed\s*===+/m);
  if (removedAt < 0) throw new Error('Minecraft Wiki removed experiment list is missing');
  const definitions = []; let current;
  for (const line of features.slice(0, removedAt).split('\n')) {
    if (/^\* (?!\*)/.test(line)) {
      const title = /^\*\s+"([^"]+)"/.exec(line)?.[1]; if (!title) continue;
      const experiment = named(title), until = /\{\{until\|BE\s+([^}]+)\}\}/i.exec(line)?.[1], since = /\{\{upcoming\|BE\s+([^}]+)\}\}/i.exec(line)?.[1];
      current = { ...experiment, description: '', previewOnly: /Preview.*only/i.test(line), until: version(until)?.engine, since: version(since)?.engine, deprecated: /\{\{deprecat/i.test(line), source: SOURCE };
      definitions.push(current);
    } else if (/^\*\* /.test(line) && current) current.description += (current.description ? ' ' : '') + plain(line.slice(3));
  }
  const removed = features.slice(removedAt).split('\n').filter(line => /^\* (?!\*)/.test(line)).map(line => ({ ...named(line.slice(2)), status: 'removed', source: SOURCE }));
  if (definitions.length < 3 || !definitions.some(e => e.id === 'betaApis') || !definitions.some(e => e.id === 'upcomingCreatorFeatures')) throw new Error('Minecraft Wiki experiment list failed consistency checks');
  const historySection = text.slice(historyStart);
  const historyHeading = [...historySection.matchAll(/^===\s*''Bedrock Edition''\s*===\s*$/gm)][0];
  if (!historyHeading) throw new Error('Bedrock experiment version history is missing');
  const history = historySection.slice(historyHeading.index).split(/^==== Timeline ====/m)[0];
  let release, upcoming = false, latestRelease;
  const events = [];
  for (const fields of templates(history, 'HistoryLine')) {
    if (fields[1]?.includes('upcoming')) { upcoming = true; continue; }
    if (fields[2]) release = version(fields[2]);
    if (!release) continue;
    if (!upcoming) latestRelease = release.engine;
    const preview = version(fields.find(f => f.startsWith('dev=')), true);
    for (const field of fields.slice(3)) {
      const statement = plain(field);
      const match = /^(Added|Re-added|Removed|Deprecated)\s+(?:the\s+)?((?:"[^"]+"(?:\s*,?\s*(?:and\s+)?|$))+)(?:experimental\s+)?(?:toggles?|experiments?)\b/i.exec(statement);
      if (!match) continue;
      const status = /removed/i.test(match[1]) ? 'removed' : /deprecated/i.test(match[1]) ? 'deprecated' : 'active';
      for (const quoted of match[2].matchAll(/"([^"]+)"/g)) {
        const experiment = named(quoted[1]);
        if (preview) events.push({ ...experiment, status, channel: 'preview', ...preview, source: SOURCE });
        if (!upcoming) events.push({ ...experiment, status, channel: 'release', ...release, source: SOURCE });
      }
    }
  }
  if (!latestRelease || !events.length) throw new Error('Minecraft Wiki history could not be interpreted safely');
  return { formatVersion: 1, revision: revision.revid, sourceDate: revision.timestamp, source: SOURCE, latestRelease, definitions, removed, events, updated: Date.now() };
}
function resolve(snapshot, config) {
  const definitions = new Map(snapshot.definitions.map(e => [e.id, e]));
  const lifecycle = new Map();
  const events = snapshot.events.filter(e => e.channel === config.target && compareVersions(e.engine, config.targetVersion) <= 0)
    .sort((a, b) => compareVersions(a.engine, b.engine) || a.build - b.build);
  for (const event of events) lifecycle.set(event.id, event);
  const items = new Map();
  for (const definition of snapshot.definitions) {
    const event = lifecycle.get(definition.id);
    const base = experiments.catalog.find(e => e.id === definition.id);
    const since = definition.since || base?.since || (!event && !base ? snapshot.latestRelease : undefined);
    if ((definition.previewOnly && config.target !== 'preview') || (since && compareVersions(config.targetVersion, since) < 0)) continue;
    const retired = event?.status === 'removed' || (definition.until && compareVersions(config.targetVersion, definition.until) >= 0);
    items.set(definition.id, { ...definition, status: retired ? 'removed' : event?.status === 'deprecated' || definition.deprecated ? 'deprecated' : 'active' });
  }
  for (const definition of snapshot.removed) {
    const event = lifecycle.get(definition.id);
    // Historical targets may still require a switch removed from current builds.
    if (event?.status === 'active') items.set(definition.id, { ...definition, status: 'active', description: 'Available for this historical target according to the version history.' });
    else if (event?.status === 'removed' || compareVersions(config.targetVersion, snapshot.latestRelease) >= 0) items.set(definition.id, { ...definition, status: 'removed', description: 'Removed experiment; its features no longer need this switch.' });
  }
  return [...items.values()].filter(e => e.status !== 'removed' || Object.hasOwn(config.experimentalGameplay || {}, e.id));
}
async function readState(root) {
  const file = await core.local(root, '.bedrock/experiments/state.json');
  try { return await core.readJson(file); } catch (error) { if (error.code === 'ENOENT') return { reviewed: [], retirementNotices: [] }; throw error; }
}
async function saveState(root, state) { await core.writeJson(await core.local(root, '.bedrock/experiments/state.json'), state); }
async function load(config, root, { force = false, fetchImpl = globalThis.fetch } = {}) {
  const file = await core.local(root, '.bedrock/experiments/catalog.json');
  let cached;
  try { cached = await core.readJson(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!force && cached?.formatVersion === 1 && Date.now() - cached.updated < 86400000) return { ...cached, offline: false };
  try {
    const snapshot = await fetchSnapshot({ fetchImpl });
    await core.writeJson(file, snapshot); return { ...snapshot, offline: false };
  } catch (error) {
    if (cached?.formatVersion === 1) return { ...cached, offline: true, error: error.message };
    throw error;
  }
}
// The project wizard needs current choices without creating project files.
async function fetchSnapshot({ fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(API, { signal: controller.signal, headers: { Accept: 'application/json', 'User-Agent': 'Bedrock-Workbench/0.6 (VS Code experiment catalog)' } });
    if (!response.ok) throw new Error(`Experiment reference returned HTTP ${response.status}`);
    const buffers = []; let length = 0;
    for await (const chunk of response.body) { length += chunk.length; if (length > 2 * 1024 * 1024) { controller.abort(); throw new Error('Experiment reference exceeds size limit'); } buffers.push(chunk); }
    const data = JSON.parse(Buffer.concat(buffers).toString('utf8'));
    const revision = data.query?.pages?.[0]?.revisions?.[0];
    if (!Number.isInteger(revision?.revid) || revision.revid < 1 || !Number.isFinite(Date.parse(revision.timestamp))) throw new Error('Experiment reference revision is missing');
    return parseWiki(revision?.slots?.main?.content, revision);
  } finally { clearTimeout(timer); }
}
module.exports = { SOURCE, API, parseWiki, resolve, load, readState, saveState, fetchSnapshot };
