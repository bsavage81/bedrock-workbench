const core = require('./core.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
const jsonc = require('jsonc-parser');
const { compareVersions } = require('./releases.cjs');
const MODULE = /^@minecraft\/[a-z][a-z0-9-]*$/;
const API_VERSION = /^(\d+\.\d+\.\d+)(?:-(beta))?$/;
function variant(version) {
  const plain = /^(\d+\.\d+\.\d+)$/.exec(version);
  if (plain) return { version, runtime: version, beta: false };
  const match = /^(\d+\.\d+\.\d+)-(beta|rc)\.(\d+\.\d+\.\d+)-(stable|preview)(?:\.(\d+))?$/.exec(version);
  if (!match) return;
  return { version, runtime: match[1] + (match[2] === 'beta' ? '-beta' : ''), beta: match[2] === 'beta', engine: match[3], channel: match[4] === 'stable' ? 'release' : 'preview', build: Number(match[5] || 0) };
}
function selectVersion(metadata, config, current, exact = false) {
  const variants = Object.keys(metadata.versions || {}).map(variant).filter(Boolean);
  const beta = !!config.experimentalGameplay?.betaApis;
  const candidates = variants.filter(v => {
    if (v.beta !== beta && (v.beta || variants.some(candidate => candidate.beta && candidate.channel === config.target))) return false;
    if (v.engine && (v.channel !== config.target || compareVersions(v.engine, config.targetVersion) > 0)) return false;
    if (!v.engine) {
      // Published stable versions sometimes have no engine mapping. Where RC
      // metadata supplies one, never recommend APIs ahead of the project.
      const mappings = variants.filter(candidate => !candidate.beta && candidate.runtime === v.runtime && candidate.engine);
      if (mappings.length && !mappings.some(candidate => compareVersions(candidate.engine, config.targetVersion) <= 0)) return false;
      if (beta && variants.some(candidate => candidate.beta && candidate.channel === config.target && compareVersions(candidate.engine, config.targetVersion) <= 0)) return false;
    }
    return !exact || v.runtime === current;
  });
  candidates.sort((a, b) => compareVersions(b.runtime.replace('-beta', ''), a.runtime.replace('-beta', '')) || (a.engine && b.engine ? compareVersions(b.engine, a.engine) : Number(!!a.engine) - Number(!!b.engine)) || (b.build || 0) - (a.build || 0));
  return candidates[0];
}
async function readDependencies(project) {
  const entries = [];
  for (const kind of ['behavior', 'resource']) {
    const file = await core.local(project.root, path.relative(project.root, path.join(project.packs[kind], 'manifest.json')));
    const manifest = await core.readJson(file);
    for (const [index, dependency] of (manifest.dependencies || []).entries()) if (MODULE.test(dependency.module_name || '')) entries.push({ kind, index, name: dependency.module_name, current: dependency.version, file });
  }
  return entries;
}
async function inspect(project, { fetchImpl = globalThis.fetch, exact = false, add } = {}) {
  const entries = await readDependencies(project), metadata = new Map();
  const packageFile = await core.local(project.root, 'package.json');
  const packageJson = await core.exists(packageFile) ? await core.readJson(packageFile) : {};
  if (add) {
    if (!MODULE.test(add)) throw new Error('Choose an official Minecraft Script API module');
    if (!entries.some(e => e.name === add)) entries.push({ kind: 'behavior', index: -1, name: add, file: path.join(project.packs.behavior, 'manifest.json') });
  }
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
  try {
    await Promise.all([...new Set(entries.map(e => e.name))].map(async name => {
      const response = await fetchImpl(`https://registry.npmjs.org/${encodeURIComponent(name)}`, { signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`${name}: registry HTTP ${response.status}`);
      const data = await response.json(); if (data.name && data.name !== name) throw new Error('Unexpected Script API package metadata');
      metadata.set(name, data);
    }));
    return entries.map(entry => {
      const data = metadata.get(entry.name), selected = selectVersion(data, project.config, entry.current, exact);
      if (selected) selected.peers = data.versions[selected.version]?.peerDependencies || {};
      return { ...entry, typingCurrent: packageJson.devDependencies?.[entry.name] || packageJson.dependencies?.[entry.name], selected };
    });
  } finally { clearTimeout(timer); }
}
async function apply(project, plan) {
  const latest = await core.loadProject(project.root);
  if (JSON.stringify([latest.config.target, latest.config.targetVersion, latest.config.experimentalGameplay?.betaApis]) !== JSON.stringify([project.config.target, project.config.targetVersion, project.config.experimentalGameplay?.betaApis])) throw new Error('Script settings changed. Check dependencies again.');
  const entries = [];
  for (const file of [...new Set(plan.map(e => e.file))]) {
    const original = await fs.readFile(file, 'utf8'), bom = original.startsWith('\uFEFF') ? '\uFEFF' : '';
    let updated = original.slice(bom.length), parsed = await core.readJson(file);
    for (const entry of plan.filter(e => e.file === file && e.selected)) {
      const dependency = parsed.dependencies?.[entry.index];
      if (entry.index !== -1 && (dependency?.module_name !== entry.name || dependency.version !== entry.current)) throw new Error('Script dependencies changed. Check again before updating.');
      if (!API_VERSION.test(entry.selected.runtime)) throw new Error('Invalid Script API version');
      const location = entry.index === -1 ? ['dependencies', parsed.dependencies?.length || 0] : ['dependencies', entry.index, 'version'];
      const value = entry.index === -1 ? { module_name: entry.name, version: entry.selected.runtime } : entry.selected.runtime;
      updated = jsonc.applyEdits(updated, jsonc.modify(updated, location, value, { formattingOptions: { insertSpaces: true, tabSize: 2 } }));
    }
    entries.push({ file, original, updated: bom + updated });
  }
  await core.commitTextChanges(project.root, entries);
}
module.exports = { variant, selectVersion, inspect, apply, readDependencies };
async function installTypings(project, plan, { execFileImpl = require('node:util').promisify(require('node:child_process').execFile), fetchImpl = globalThis.fetch } = {}) {
  const packages = new Map();
  for (const entry of plan) {
    if (!entry.selected || entry.selected.runtime !== entry.current) throw new Error(`Update ${entry.name} for the selected script settings before installing typings.`);
    if (!MODULE.test(entry.name) || !variant(entry.selected.version)) throw new Error('Invalid Script API package selection');
    if (packages.has(entry.name) && packages.get(entry.name) !== entry.selected.version) throw new Error(`Both packs must agree on ${entry.name} before installing shared typings.`);
    packages.set(entry.name, entry.selected.version);
  }
  if (!packages.size) throw new Error('Add a Script API dependency first.');
  // Preview package peer ranges often describe the regular API version and
  // reject its RC/beta npm suffix. Install our exact selections and explicitly
  // provide their shared type-only peers, without letting npm substitute APIs.
  const peers = new Set(plan.flatMap(entry => Object.keys(entry.selected?.peers || {})));
  for (const name of ['@minecraft/common', '@minecraft/vanilla-data']) if (peers.has(name) && !packages.has(name)) {
    const response = await fetchImpl(`https://registry.npmjs.org/${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`${name}: registry HTTP ${response.status}`);
    const metadata = await response.json();
    let version;
    if (name === '@minecraft/common') version = selectVersion(metadata, { ...project.config, experimentalGameplay: { betaApis: false } })?.version;
    else version = Object.keys(metadata.versions || {}).filter(v => {
      const match = /^(\d+\.\d+\.\d+)(?:-preview\.(\d+))?$/.exec(v);
      return match && compareVersions(match[1], project.config.targetVersion) <= 0 && (!match[2] || project.config.target === 'preview');
    }).sort((a, b) => compareVersions(b.split('-')[0], a.split('-')[0]) || Number(b.split('.').at(-1)) - Number(a.split('.').at(-1)))[0];
    if (!version) throw new Error(`No compatible typings found for ${name}`);
    packages.set(name, version);
  }
  for (const file of ['package.json', 'package-lock.json', 'node_modules']) await core.local(project.root, file);
  const directories = (process.env.PATH || '').split(path.delimiter);
  let cli;
  for (const directory of directories) {
    const candidate = path.join(directory.replace(/^"|"$/g, ''), 'node_modules/npm/bin/npm-cli.js');
    if (await core.exists(candidate)) { cli = candidate; break; }
  }
  if (!cli) throw new Error('Install Node.js with npm, then reopen VS Code to install Script API typings.');
  const args = [cli, 'install', '--prefix', project.root, '--workspaces=false', '--legacy-peer-deps', '--save-dev', '--save-exact', '--ignore-scripts', '--no-audit', '--no-fund', '--', ...[...packages].map(([name, version]) => `${name}@${version}`)];
  try {
    return await execFileImpl('node', args, { cwd: project.root, windowsHide: true, timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
  } catch (error) { throw new Error(`Typings installation failed. Check package.json/package-lock.json before retrying. ${error.stderr || error.message}`, { cause: error }); }
}
module.exports.installTypings = installTypings;
