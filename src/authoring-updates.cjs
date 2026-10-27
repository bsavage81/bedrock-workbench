const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const Ajv = require('ajv');
const data = require('./authoring-data.cjs');
const { compareVersions } = require('./releases.cjs');
const REPOSITORY = 'bsavage81/bedrock-workbench-data';
const manifestValidator = new Ajv({ strict: false, validateFormats: false }).compile(require('../schemas/authoring-update-manifest.schema.json'));
const LIMIT = 24 * 1024 * 1024, MANIFEST_LIMIT = 1024 * 1024;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const version = value => typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value);
const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/.test(value);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function assert(ok, message) { if (!ok) throw new Error(message); }
function safeJson(bytes) {
  assert(bytes.length <= LIMIT, 'Authoring data exceeds size limit');
  const value = JSON.parse(bytes.toString('utf8'), (key, child) => {
    assert(!['__proto__', 'prototype', 'constructor'].includes(key), 'Unsafe JSON key'); return child;
  });
  let count = 0;
  function walk(node, depth = 0) {
    assert(depth <= 96 && ++count <= 1000000, 'Authoring data complexity limit');
    if (node && typeof node === 'object') for (const child of Object.values(node)) walk(child, depth + 1);
  }
  walk(value); return value;
}
function artifactUrl(entry) {
  return `https://github.com/${REPOSITORY}/releases/download/data-${entry.id}/snapshot.json`;
}
function reviewFingerprint(snapshot, entry) {
  const digest = value => sha256(Buffer.from(JSON.stringify(value ?? null)));
  return digest({ dataFormatVersion: entry.dataFormatVersion, channel: entry.channel, extension: entry.extension, minecraft: entry.minecraft, sources: entry.sources, files: Object.fromEntries(data.FILES.map(file => [file, digest(snapshot.files[file])])), reference: digest(snapshot.reference), notices: digest(snapshot.notices) });
}
function validateManifest(value, channel) {
  assert(manifestValidator(value), 'Invalid authoring manifest schema');
  assert(object(value) && value.dataFormatVersion === 1 && value.channel === channel && Array.isArray(value.snapshots) && value.snapshots.length <= 300, 'Unsupported authoring manifest');
  assert(Number.isFinite(Date.parse(value.generatedAt)), 'Missing manifest generation timestamp');
  const ids = new Set();
  for (const entry of value.snapshots) {
    assert(identifier(entry.id) && !ids.has(entry.id), 'Invalid or duplicate snapshot ID'); ids.add(entry.id);
    assert(entry.dataFormatVersion === 1 && entry.channel === channel, 'Snapshot channel or format mismatch');
    assert(version(entry.extension?.min) && version(entry.extension?.max) && compareVersions(entry.extension.min, entry.extension.max) <= 0, 'Invalid extension coverage');
    assert(version(entry.minecraft?.min) && version(entry.minecraft?.max) && compareVersions(entry.minecraft.min, entry.minecraft.max) <= 0, 'Invalid Minecraft coverage');
    assert(Number.isFinite(Date.parse(entry.generatedAt)), 'Missing snapshot timestamp');
    assert(Array.isArray(entry.sources) && entry.sources.length > 0 && entry.sources.every(s => object(s) && ['https://github.com/Mojang/bedrock-samples','https://github.com/MicrosoftDocs/minecraft-creator','https://github.com/Mojang/minecraft-creator-tools'].includes(s.url) && /^[a-f0-9]{40,64}$/.test(s.revision) && typeof s.license === 'string' && typeof s.attribution === 'string'), 'Missing source provenance');
    assert(entry.url === artifactUrl(entry) && /^[a-f0-9]{64}$/.test(entry.sha256) && Number.isInteger(entry.bytes) && entry.bytes > 0 && entry.bytes <= LIMIT, 'Untrusted snapshot artifact');
    if (channel === 'preview') assert(entry.sources.some(s => s.channel === 'preview' && s.available === true), 'Preview source availability is unverified');
  }
  return value;
}
function compatible(entry, config, extensionVersion) {
  return version(config.targetVersion) && compareVersions(extensionVersion, entry.extension.min) >= 0 && compareVersions(extensionVersion, entry.extension.max) <= 0 && compareVersions(config.targetVersion, entry.minecraft.min) >= 0 && compareVersions(config.targetVersion, entry.minecraft.max) <= 0;
}
function select(manifest, config, extensionVersion) {
  return manifest.snapshots.filter(entry => compatible(entry, config, extensionVersion)).sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt) || b.id.localeCompare(a.id))[0];
}
function validateSnapshot(value, entry) {
  assert(object(value) && value.dataFormatVersion === 1 && value.id === entry.id && value.channel === entry.channel && object(value.files), 'Snapshot identity mismatch');
  assert(JSON.stringify(value.sources) === JSON.stringify(entry.sources), 'Snapshot provenance mismatch');
  assert(Object.keys(value.files).length === data.FILES.length && data.FILES.every(file => Object.hasOwn(value.files, file)), 'Unknown or incomplete authoring families');
  const ajv = new Ajv({ strict: false, validateFormats: false });
  for (const [file, content] of Object.entries(value.files)) {
    assert(data.FILES.includes(file) && object(content), 'Unapproved authoring file');
    if (file.startsWith('schemas/')) {
      assert(ajv.validateSchema(content), `Invalid JSON schema: ${file}`);
      function refs(node) {
        if (!node || typeof node !== 'object') return;
        if (node.$ref) assert(typeof node.$ref === 'string' && node.$ref.startsWith('#/'), 'Downloaded schema references must be local fragments');
        for (const child of Object.values(node)) refs(child);
      }
      refs(content);
      // Compile now: reject broken references/regular expressions before activation.
      ajv.compile(content);
    }
  }
  const files = value.files;
  for (const kind of ['block', 'entity', 'item']) assert(object(files[`schemas/${kind}.schema.json`].definitions?.components?.properties), 'Incompatible owned schema boundary');
  function shape(node, model, label) {
    if (model === null || model === undefined) return;
    assert(typeof node === typeof model && Array.isArray(node) === Array.isArray(model), `Invalid data shape: ${label}`);
    if (Array.isArray(model)) { if (model.length) for (const child of node) shape(child, model[0], label); }
    else if (object(model)) for (const [key, child] of Object.entries(node)) if (Object.hasOwn(model, key)) shape(child, model[key], `${label}/${key}`);
  }
  for (const file of data.FILES.filter(file => file.startsWith('src/'))) shape(files[file], data.bundled[file], file);
  for (const name of ['format-requirements', 'component-descriptions', 'documentation-links']) assert(object(files[`src/${name}.json`].components), `Invalid ${name}`);
  for (const kind of ['entity', 'block', 'item']) assert(object(files['src/format-requirements.json'].components[kind]) && object(files['src/documentation-links.json'].components[kind]), 'Missing component families');
  for (const links of Object.values(files['src/documentation-links.json'].components)) assert(object(links) && Object.values(links).every(link => typeof link === 'string' && /^[a-zA-Z0-9_./-]+$/.test(link) && !link.includes('..')), 'Invalid Learn documentation path');
  function rules(node) {
    assert(object(node), 'Invalid format compatibility rule');
    if (node.min !== undefined) assert(version(node.min), 'Invalid minimum format version');
    if (node.fields !== undefined) { assert(object(node.fields), 'Invalid format fields'); for (const child of Object.values(node.fields)) rules(child); }
    if (node.path !== undefined) assert(Array.isArray(node.path) && node.path.every(key => typeof key === 'string'), 'Invalid compatibility field path');
  }
  for (const family of Object.values(files['src/format-requirements.json'].components)) for (const rule of Object.values(family)) rules(rule);
  assert(Array.isArray(files['src/molang-catalog.json'].entries) && files['src/molang-catalog.json'].entries.every(e => object(e) && typeof e.name === 'string' && typeof e.description === 'string' && ['minArgs','maxArgs'].every(k => e[k] === undefined || Number.isInteger(e[k]) && e[k] >= -1 && e[k] <= 256)), 'Invalid Molang catalog');
  assert(object(files['src/molang-guidance.json'].entries) && object(files['src/filter-catalog.json'].tests) && object(files['src/event-forms.json'].components), 'Invalid authoring catalogs');
  for (const entry of Object.values(files['src/molang-guidance.json'].entries)) {
    assert(object(entry), 'Invalid Molang guidance entry');
    if (entry.parameters !== undefined) assert(Array.isArray(entry.parameters) && entry.parameters.every(p => typeof p === 'string'), 'Invalid Molang parameters');
    if (entry.overloads !== undefined) assert(Array.isArray(entry.overloads) && entry.overloads.every(o => Array.isArray(o) && o.every(p => typeof p === 'string')), 'Invalid Molang overloads');
  }
  if (value.reference) assert(object(value.reference.components) && ['block','entity','item'].every(k => object(value.reference.components[k])) && value.reference.engine && compareVersions(value.reference.engine, entry.minecraft.min) <= 0 && value.reference.intelligenceVersion === 12, 'Invalid reference snapshot');
  if (value.reference) for (const components of Object.values(value.reference.components)) for (const component of Object.values(components)) if (component.sourceTag !== undefined) assert(entry.channel === 'preview' && entry.sources.some(source => source.tag === component.sourceTag && source.channel === 'stable'), 'Unattributed reference fallback');
  return value;
}
// Anonymous GETs only. Validate each redirect before following it.
async function download(url, limit, signal, fetchImpl = globalThis.fetch) {
  assert(url === `https://raw.githubusercontent.com/${REPOSITORY}/main/feeds/stable.json` || url === `https://raw.githubusercontent.com/${REPOSITORY}/main/feeds/preview.json` || new RegExp(`^https://github\\.com/${REPOSITORY}/releases/download/data-[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}/snapshot\\.json$`).test(url), 'Untrusted download URL');
  let current = url;
  for (let redirects = 0; redirects < 5; redirects++) {
    const parsed = new URL(current);
    assert(parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.port, 'Untrusted download location');
    assert(current === url || ['release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(parsed.hostname), 'Untrusted redirect');
    const response = await fetchImpl(current, { signal, redirect: 'manual', headers: { 'User-Agent': 'Bedrock-Workbench', Accept: 'application/json' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) { current = new URL(response.headers.get('location'), current).href; continue; }
    assert(response.ok, `Authoring data HTTP ${response.status}`);
    assert(Number(response.headers.get('content-length') || 0) <= limit, 'Authoring download exceeds size limit');
    const chunks = []; let size = 0;
    for await (const chunk of response.body) { signal?.throwIfAborted(); size += chunk.length; assert(size <= limit, 'Authoring download exceeds size limit'); chunks.push(chunk); }
    return Buffer.concat(chunks);
  }
  throw new Error('Too many authoring download redirects');
}
async function atomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try { await fs.writeFile(temp, Buffer.isBuffer(value) ? value : JSON.stringify(value)); await fs.rename(temp, file); }
  finally { await fs.unlink(temp).catch(() => {}); }
}
async function acquireLock(directory, retry = true) {
  await fs.mkdir(directory, { recursive: true });
  const file = path.join(directory, 'update.lock'), token = randomUUID();
  try {
    const handle = await fs.open(file, 'wx');
    try { await handle.writeFile(JSON.stringify({ token, pid: process.pid, createdAt: Date.now() })); } finally { await handle.close(); }
    return async () => { const owner = await fs.readFile(file).then(safeJson).catch(() => null); if (owner?.token === token) await fs.unlink(file).catch(() => {}); };
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const owner = await fs.readFile(file).then(safeJson).catch(() => null);
    // Recover only a sufficiently old lease whose process is definitely gone.
    // EPERM means liveness is unknown, so leave that lease intact.
    let dead = false;
    if (Number.isInteger(owner?.pid) && owner.pid > 0) try { process.kill(owner.pid, 0); } catch (e) { dead = e.code === 'ESRCH'; }
    const stat = await fs.stat(file).catch(() => null);
    const abandonedWrite = !owner && stat && Date.now() - stat.mtimeMs > 120000;
    if (retry && (dead && Date.now() - owner.createdAt > 60000 || abandonedWrite)) {
      const current = await fs.readFile(file).then(safeJson).catch(() => null);
      if (current?.token === owner?.token) await fs.unlink(file).catch(() => {});
      return acquireLock(directory, false);
    }
    return undefined;
  }
}
class Updater {
  constructor(directory, { extensionVersion = require('../package.json').version, fetchImpl, onApply = async () => {}, onStatus = () => {}, now = Date.now } = {}) {
    Object.assign(this, { directory, extensionVersion, fetchImpl, onApply, onStatus, now }); this.state = { source: 'bundled', channel: 'bundled', version: 'bundled' }; this.last = new Map();
  }
  status(patch) { Object.assign(this.state, patch); this.onStatus({ ...this.state }); }
  cancel() { this.generation = (this.generation || 0) + 1; this.controller?.abort(); }
  dispose() { this.cancel(); }
  async read(config) {
    const state = await fs.readFile(path.join(this.directory, 'state.json')).then(safeJson).catch(() => ({}));
    let recovery;
    for (const record of [state.active, state.previous]) {
      try {
        if (!record || record.entry.channel !== (config.target === 'preview' ? 'preview' : 'stable')) continue;
        validateManifest({ dataFormatVersion: 1, channel: record.entry.channel, generatedAt: record.entry.generatedAt, snapshots: [record.entry] }, record.entry.channel);
        if (!compatible(record.entry, config, this.extensionVersion)) continue;
        const bytes = await fs.readFile(path.join(this.directory, `${record.entry.sha256}.json`));
        assert(bytes.length === record.entry.bytes && sha256(bytes) === record.entry.sha256, 'Cached snapshot checksum failed');
        return { entry: record.entry, snapshot: validateSnapshot(safeJson(bytes), record.entry), state, recovery };
      } catch { recovery = 'Cached snapshot failed verification; using fallback data'; }
    }
    return { state, recovery };
  }
  async activate(config) {
    const cached = await this.read(config);
    data.apply(cached.snapshot, cached.entry?.id);
    this.status({ source: cached.entry ? 'cached GitHub release' : 'bundled fallback', version: cached.entry?.id || 'bundled', channel: cached.entry?.channel || 'bundled', requestedChannel: config.target === 'preview' ? 'preview' : 'stable', error: cached.recovery });
    return cached;
  }
  async rollback(config) {
    this.cancel(); if (this.pending) await this.pending;
    const unlock = await acquireLock(this.directory);
    if (!unlock) { this.status({ error: 'Another VS Code window is updating authoring data' }); return this.state; }
    try {
    const cached = await this.read(config), state = cached.state;
    const previousStatus = { ...this.state };
    const next = { active: state.previous, previous: undefined, held: state.active?.entry.id };
    await atomic(path.join(this.directory, 'state.json'), next);
    try { await this.activate(config); await this.onApply(); }
    catch (error) {
      await atomic(path.join(this.directory, 'state.json'), state);
      data.apply(cached.snapshot, cached.entry?.id); await this.onApply().catch(() => {});
      this.status({ ...previousStatus, error: `Rollback refresh failed: ${error.message}` });
    }
    return this.state;
    } finally { await unlock(); }
  }
  check(config, { force = false } = {}) {
    const key = JSON.stringify([config.target, config.targetVersion]);
    if (this.pending && this.key === key) return this.pending;
    if (this.pending) { this.cancel(); return this.pending.then(() => this.check(config, { force })); }
    if (!force && this.now() - (this.last.get(key) || 0) < 6 * 3600000) return Promise.resolve(this.state);
    this.last.set(key, this.now()); this.key = key;
    const controller = this.controller = new AbortController(), ticket = this.generation = (this.generation || 0) + 1;
    const timer = setTimeout(() => controller.abort(), 45000);
    this.pending = (async () => {
      let unlock;
      try {
        unlock = await acquireLock(this.directory);
        if (!unlock) { this.last.delete(key); this.status({ error: 'Another VS Code window is updating authoring data' }); return this.state; }
        const checksFile = path.join(this.directory, 'checks.json');
        const checks = await fs.readFile(checksFile).then(safeJson).catch(() => ({}));
        if (!force && this.now() - (checks[key] || 0) < 6 * 3600000) return this.state;
        checks[key] = this.now(); await atomic(checksFile, checks);
        const channel = config.target === 'preview' ? 'preview' : 'stable';
        const url = `https://raw.githubusercontent.com/${REPOSITORY}/main/feeds/${channel}.json`;
        const manifest = validateManifest(safeJson(await download(url, MANIFEST_LIMIT, controller.signal, this.fetchImpl)), channel);
        const entry = select(manifest, config, this.extensionVersion);
        assert(entry, `No compatible ${channel} authoring snapshot for ${config.targetVersion}`);
        const old = await this.read(config);
        assert(!old.entry || old.entry.id !== entry.id || old.entry.sha256 === entry.sha256, 'Immutable snapshot ID changed checksum');
        if (old.state.held === entry.id) { this.status({ error: 'This snapshot is held after rollback' }); return this.state; }
        if (old.entry?.sha256 === entry.sha256 && data.revision === entry.id) { this.status({ error: undefined, checkedAt: this.now() }); return this.state; }
        const bytes = await download(entry.url, entry.bytes, controller.signal, this.fetchImpl);
        assert(bytes.length === entry.bytes && sha256(bytes) === entry.sha256, 'Authoring snapshot checksum mismatch');
        const snapshot = validateSnapshot(safeJson(bytes), entry);
        controller.signal.throwIfAborted(); if (ticket !== this.generation) return this.state;
        await fs.mkdir(this.directory, { recursive: true });
        await atomic(path.join(this.directory, `${entry.sha256}.json`), bytes);
        controller.signal.throwIfAborted();
        const nextState = { active: { entry }, previous: old.entry ? { entry: old.entry } : old.state.previous, held: old.state.held };
        await atomic(path.join(this.directory, 'state.json'), nextState);
        try { controller.signal.throwIfAborted(); if (ticket !== this.generation) throw Error('Authoring update cancelled'); data.apply(snapshot, entry.id); await this.onApply(); }
        catch (error) { await atomic(path.join(this.directory, 'state.json'), old.state); data.apply(old.snapshot, old.entry?.id); await this.onApply().catch(() => {}); throw error; }
        this.status({ source: 'GitHub release', version: entry.id, channel, error: undefined, checkedAt: this.now() });
      } catch (error) { if (ticket === this.generation) this.status({ error: error.message, checkedAt: this.now() }); }
      finally { clearTimeout(timer); await unlock?.(); this.pending = undefined; }
      return this.state;
    })(); return this.pending;
  }
}
module.exports = { REPOSITORY, LIMIT, sha256, safeJson, artifactUrl, reviewFingerprint, validateManifest, validateSnapshot, compatible, select, download, atomic, Updater };
