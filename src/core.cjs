const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { parse, printParseErrorCode, modify, applyEdits } = require('jsonc-parser');
const { PNG } = require('pngjs');
const { zipSync } = require('fflate');
const esbuild = require('esbuild');
const { init: lexerReady, parse: parseImports } = require('es-module-lexer');
const Ajv = require('ajv');
const validateConfig = new Ajv({ allErrors: true, strict: false }).compile(require('../schemas/project.schema.json'));
const validateManifest = new Ajv({ allErrors: true, strict: false }).compile(require('../schemas/manifest.schema.json'));
const kinds = ['behavior', 'resource'];
const exists = async p => fs.access(p).then(() => true, () => false);
const inside = (base, target) => { const r = path.relative(base, target); return r !== '' && !r.startsWith('..' + path.sep) && r !== '..' && !path.isAbsolute(r); };
async function noLinks(p) {
  p = path.resolve(p);
  for (let current = p; ; current = path.dirname(current)) {
    try { if ((await fs.lstat(current)).isSymbolicLink()) throw new Error(`Links are not supported: ${current}`); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (path.dirname(current) === current) break;
  }
  return p;
}
async function local(root, relative) {
  const p = path.resolve(root, relative);
  if (!inside(root, p)) throw new Error(`Path must stay inside the project: ${relative}`);
  return noLinks(p);
}
async function readJson(file) {
  const errors = [];
  const text = (await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, '');
  const data = parse(text, errors, { allowTrailingComma: true });
  if (errors.length) {
    const message = printParseErrorCode(errors[0].error), offset = errors[0].offset;
    const lines = text.slice(0, offset).split('\n');
    const error = new Error(`${file}: ${message} at offset ${offset}`);
    error.errors = [{ code:'bedrock.jsonSyntax',text: message, location: { file, line: lines.length, column: lines.at(-1).length, length: 1 } }];
    throw error;
  }
  return data;
}
async function writeJson(file, data) {
  const temp = file + '.' + randomUUID() + '.tmp';
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(temp, JSON.stringify(data, null, 2) + '\n');
  await retryFile(() => fs.rename(temp, file));
}
function parseVersion(value) {
  const parts = typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value.trim()) ? value.trim().split('.').map(Number) : value;
  if (!Array.isArray(parts) || parts.length !== 3 || !parts.every(n => Number.isInteger(n) && n >= 0 && n <= 65535)) throw new Error('Enter a version such as 1.0.0: three whole numbers from 0 to 65535.');
  return [...parts];
}
async function atomicText(file, text) {
  const temporary = file + '.' + randomUUID() + '.tmp';
  try {
    await fs.writeFile(temporary, text, { flag: 'wx' });
    await retryFile(() => fs.rename(temporary, file));
  } finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
}
async function setProjectVersion(root, version) {
  return updateProjectVersions(root, version, false);
}
async function setProjectTargetVersion(root, version) {
  return updateProjectVersions(root, version, true);
}
async function updateProjectVersions(root, version, targetOnly) {
  const project = await loadProject(root);
  version = parseVersion(version);
  const entries = [{ file: await local(project.root, 'bedrock-project.json'), paths: [[targetOnly ? 'targetVersion' : 'version']], value: targetOnly ? version.join('.') : version }];
  const manifests = {};
  for (const kind of kinds) {
    const file = await noLinks(path.join(project.packs[kind], 'manifest.json'));
    const manifest = manifests[kind] = await readJson(file); checkManifest(manifest, file);
    entries.push({ file, paths: targetOnly ? [['header', 'min_engine_version']] : [['header', 'version'], ...manifest.modules.map((_, index) => ['modules', index, 'version'])], value: version });
  }
  const linked = new Set(Object.values(manifests).map(manifest => manifest.header.uuid.toLowerCase()));
  if (!targetOnly) for (const [index, kind] of kinds.entries()) for (const [dependencyIndex, dependency] of (manifests[kind].dependencies || []).entries()) {
    if (dependency.uuid && linked.has(dependency.uuid.toLowerCase())) entries[index + 1].paths.push(['dependencies', dependencyIndex, 'version']);
  }
  for (const entry of entries) {
    entry.original = await fs.readFile(entry.file, 'utf8');
    const bom = entry.original.startsWith('\uFEFF') ? '\uFEFF' : '';
    let text = entry.original.slice(bom.length);
    for (const jsonPath of entry.paths) text = applyEdits(text, modify(text, jsonPath, entry.value, { formattingOptions: { insertSpaces: true, tabSize: 2, eol: text.includes('\r\n') ? '\r\n' : '\n' } }));
    entry.updated = bom + text;
  }
  await commitTextChanges(project.root, entries);
  return (await loadProject(project.root)).config;
}
async function commitTextChanges(root, entries) {
  for (const entry of entries) await local(root, path.relative(root, entry.file));
  const changes = entries.filter(entry => entry.original !== entry.updated);
  if (!changes.length) return;
  const transactions = await local(root, '.bedrock/version-transactions');
  await fs.mkdir(transactions, { recursive: true });
  const snapshot = await fs.mkdtemp(path.join(transactions, 'version-'));
  const written = [];
  try {
    for (const [index, entry] of changes.entries()) await fs.writeFile(path.join(snapshot, `${index}.json`), entry.original);
    await writeJson(path.join(snapshot, 'journal.json'), changes.map((entry, index) => ({ file: entry.file, backup: `${index}.json` })));
    for (const entry of changes) {
      if (await fs.readFile(entry.file, 'utf8') !== entry.original) throw new Error(`File changed during version update: ${entry.file}`);
      await atomicText(entry.file, entry.updated); written.push(entry);
    }
  } catch (error) {
    const recovery = [];
    for (const entry of written.reverse()) {
      try { await atomicText(entry.file, entry.original); } catch (restoreError) { recovery.push(restoreError.message); }
    }
    if (recovery.length) throw new Error(`${error.message}\nVersion recovery was incomplete. Original files are preserved at ${snapshot}\n${recovery.join('\n')}`, { cause: error });
    await fs.rm(snapshot, { recursive: true, force: true }); throw error;
  }
  await fs.rm(snapshot, { recursive: true, force: true });
}
async function loadProject(root) {
  root = await noLinks(path.resolve(root));
  const config = await readJson(await local(root, 'bedrock-project.json'));
  // Older projects stored per-profile icon overrides. Migration copies the
  // stable selection into each source pack and removes these obsolete fields.
  for (const profile of ['beta', 'stable']) if (config.profiles?.[profile]) delete config.profiles[profile].icons;
  if (!validateConfig(config)) throw new Error('Project settings: ' + validateConfig.errors.map(e => `${e.instancePath} ${e.message}`).join('; '));
  if (config.experimentalGameplay) config.experimentalGameplay = require('./experiments.cjs').normalize(config.experimentalGameplay);
  const ids = [];
  for (const profile of ['beta', 'stable']) for (const kind of kinds) {
    const identity = config.profiles[profile].identities[kind];
    ids.push(identity.header, ...identity.modules);
  }
  if (new Set(ids.map(id => id.toLowerCase())).size !== ids.length) throw new Error('All beta and stable UUIDs must be unique');
  const packs = {};
  for (const kind of kinds) packs[kind] = await local(root, config.packs[kind]);
  if (packs.behavior === packs.resource || inside(packs.behavior, packs.resource) || inside(packs.resource, packs.behavior)) throw new Error('Pack directories must be separate');
  for (const value of [config.build.output, config.build.exports]) {
    const output = await local(root, value);
    if (!inside(path.join(root, '.bedrock'), output)) throw new Error('Build and export paths must be below .bedrock/');
    for (const source of Object.values(packs)) if (output === source || inside(output, source) || inside(source, output)) throw new Error('Output overlaps source packs');
  }
  return { root, config, packs };
}
async function* files(root, prefix = '', includeIgnored = false) {
  for (const entry of await fs.readdir(path.join(root, prefix), { withFileTypes: true })) {
    const rel = path.join(prefix, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Links are not supported: ${rel}`);
    if (entry.isDirectory()) {
      if (includeIgnored || !['node_modules', '.git', '.bridge', '.bedrock'].includes(entry.name)) yield* files(root, rel, includeIgnored);
    } else if (entry.isFile()) yield rel;
  }
}
function checkManifest(manifest, file) {
  if (!validateManifest(manifest)) throw new Error(`${file}: invalid format-2 manifest: ` + validateManifest.errors.map(e => `${e.instancePath} ${e.message}`).join('; '));
}
function packFolderName(config, profile, kind) {
  const stem = config.name.replace(/[^a-z0-9]/gi, '').slice(0, 6) || 'Pack';
  const name = `${stem}${profile === 'beta' ? 'Beta' : ''}`;
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name) ? `_${name}` : name;
}
function buildName(config, profile, kind) {
  let title = config.profiles[profile].title.trim();
  if (profile === 'beta') title = title.replace(/\s*\bbeta$/i, '').trim() || config.name;
  const label = `${title}${profile === 'beta' ? ' Beta' : ''}${kind ? kind === 'behavior' ? ' BP' : ' RP' : ''}`;
  const safe = label.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '');
  if (safe.length > 160) throw new Error('Build name is too long. Shorten the profile title in project settings.');
  return safe;
}
async function compile(root, profile = 'beta', options = {}) {
  if (!['beta', 'stable'].includes(profile)) throw new Error('Unknown build profile');
  await migratePackIcons(root);
  const project = await loadProject(root);
  if (options.version !== undefined) project.config.version = parseVersion(options.version);
  const { config, packs } = project;
  root = project.root;
  const manifests = {};
  for (const kind of kinds) {
    manifests[kind] = await readJson(path.join(packs[kind], 'manifest.json'));
    checkManifest(manifests[kind], kind);
    if (config.profiles[profile].identities[kind].modules.length !== manifests[kind].modules.length) throw new Error(`${kind}: module count changed; update persistent profile module UUIDs in project settings`);
  }
  const sourceIds = Object.values(manifests).flatMap(m => [m.header.uuid, ...m.modules.map(module => module.uuid)]).map(id => id.toLowerCase());
  if (new Set(sourceIds).size !== sourceIds.length) throw new Error('Source manifest UUIDs must be unique across both packs');
  const outputBase = await local(root, config.build.output);
  await fs.mkdir(outputBase, { recursive: true });
  const stage = await fs.mkdtemp(path.join(outputBase, `${profile}-`));
  const warnings = [];
  try {
    const uuidMap = new Map(kinds.map(kind => [manifests[kind].header.uuid, config.profiles[profile].identities[kind].header]));
    for (const kind of kinds) {
      const source = packs[kind], target = path.join(stage, kind);
      await fs.mkdir(target);
      const outputs = new Set(), entryPoints = [];
      for await (const relative of files(source)) {
        const normalized = relative.replaceAll(path.sep, '/');
        if (normalized === 'manifest.json' || /(^|\/)(\..*|README[^/]*|tsconfig\.json)$/.test(normalized) || /\.(md|map|bbmodel|bak|tmp)$/i.test(normalized) || /\.d\.ts$/i.test(normalized)) continue;
        const script = /\.[cm]?[jt]s$/i.test(relative);
        if (/\.[cm][jt]s$/i.test(relative)) throw new Error(`Use .js or .ts script files: ${relative}`);
        const emitted = relative.replace(/\.ts$/i, '.js').toLowerCase();
        if (outputs.has(emitted)) throw new Error(`Output collision: ${relative}`);
        outputs.add(emitted);
        if (script) { entryPoints.push(path.join(source, relative)); continue; }
        const dest = path.join(target, relative);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        if (/\.json$/i.test(relative)) {
          const data = await readJson(path.join(source, relative));
          // Reject known legacy compiler declarations rather than silently shipping them.
          if (data && typeof data === 'object' && ['$extends', '$include', '$template'].some(k => k in data)) throw new Error(`Unsupported bridge compiler directive: ${relative}`);
          await fs.writeFile(dest, JSON.stringify(data, null, 2) + '\n');
        } else await fs.copyFile(path.join(source, relative), dest);
      }
      if (entryPoints.length) {
        const result = await esbuild.build({ entryPoints, outbase: source, outdir: target, bundle: false, format: 'esm', platform: 'neutral', target: 'es2020', sourcemap: false, logLevel: 'silent', tsconfigRaw: { compilerOptions: { experimentalDecorators: false } }, plugins: [] });
        warnings.push(...result.warnings.map(w => w.text));
        // Bedrock requires concrete .js extensions on relative imports.
        for await (const relative of files(target)) if (relative.endsWith('.js')) {
          const file = path.join(target, relative);
          let text = await fs.readFile(file, 'utf8');
          await lexerReady;
          const [imports] = parseImports(text);
          const replacements = [];
          for (const imported of imports) {
            if (!imported.n) {
              if (imported.d >= 0) warnings.push(`${relative}: computed dynamic import could not be checked`);
              continue;
            }
            if (!imported.n.startsWith('.')) {
              if (!imported.n.startsWith('@minecraft/')) throw new Error(`${relative}: unsupported package import ${imported.n}; use relative scripts or Minecraft Script API modules`);
              continue;
            }
            let spec = imported.n.replace(/\.ts$/, '.js');
            if (!path.posix.extname(spec)) spec += '.js';
            const resolved = path.resolve(path.dirname(file), spec);
            if (!inside(target, resolved) || !(await exists(resolved))) throw new Error(`${relative}: missing or escaping script import ${spec}`);
            replacements.push({ start: imported.s, end: imported.e, text: imported.d >= 0 ? JSON.stringify(spec) : spec });
          }
          for (const replacement of replacements.reverse()) text = text.slice(0, replacement.start) + replacement.text + text.slice(replacement.end);
          await fs.writeFile(file, text);
        }
      }
      const manifest = structuredClone(manifests[kind]);
      const identity = config.profiles[profile].identities[kind];
      manifest.header.uuid = identity.header;
      manifest.header.name = buildName(config, profile, kind);
      manifest.header.version = config.version;
      manifest.header.min_engine_version = config.targetVersion.split('.').map(Number);
      manifest.modules.forEach((module, i) => { module.uuid = identity.modules[i]; module.version = config.version; });
      for (const dependency of manifest.dependencies || []) if (uuidMap.has(dependency.uuid)) { dependency.uuid = uuidMap.get(dependency.uuid); dependency.version = config.version; }
      for (const module of manifest.modules) if (module.type === 'script') {
        if (!module.entry || !inside(target, path.resolve(target, module.entry)) || !(await exists(path.resolve(target, module.entry)))) throw new Error(`Missing script module entry: ${module.entry}`);
      }
      await writeJson(path.join(target, 'manifest.json'), manifest);
      const icon = path.join(target, 'pack_icon.png');
      if (profile === 'beta' && await exists(icon)) {
        const png = PNG.sync.read(await fs.readFile(icon));
        for (let i = 0; i < png.data.length; i += 4) { const gray = Math.round(.2126 * png.data[i] + .7152 * png.data[i + 1] + .0722 * png.data[i + 2]); png.data[i] = png.data[i + 1] = png.data[i + 2] = gray; }
        await fs.writeFile(icon, PNG.sync.write(png));
      }
    }
    return { ...project, profile, directory: stage, warnings };
  } catch (error) { await fs.rm(stage, { recursive: true, force: true }); throw error; }
}
function ownerId(config, profile = 'beta') { return config.profiles[profile].identities.behavior.header; }
async function copyPackIcon(root, kind, selectedFile) {
  if (!kinds.includes(kind)) throw new Error('Select a behavior or resource pack icon');
  const project = await loadProject(root);
  const source = await noLinks(path.resolve(selectedFile));
  const data = await fs.readFile(source);
  return storePackIcon(project, kind, data);
}
async function storePackIcon(project, kind, data) {
  try { PNG.sync.read(data); }
  catch (error) { throw new Error(`Select a valid PNG image for the ${kind} pack icon: ${error.message}`); }
  const target = await noLinks(path.join(project.packs[kind], 'pack_icon.png'));
  if (!(await fs.stat(project.packs[kind])).isDirectory()) throw new Error(`Pack folder does not exist: ${project.packs[kind]}`);
  const previous = await fs.readFile(target).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (!previous?.equals(data)) await atomicText(target, data);
  return target;
}
async function migratePackIcons(root) {
  const project = await loadProject(root), file = await local(project.root, 'bedrock-project.json');
  const original = await fs.readFile(file, 'utf8');
  const raw = await readJson(file);
  if (!['beta', 'stable'].some(profile => Object.hasOwn(raw.profiles[profile], 'icons'))) return;
  const sources = [];
  // Validate every legacy stable selection before copying either icon.
  for (const kind of kinds) {
    const relative = raw.profiles.stable.icons?.[kind];
    if (!relative) continue;
    if (typeof relative !== 'string') throw new Error(`Invalid legacy ${kind} icon path`);
    const source = await local(project.root, relative);
    const data = await fs.readFile(source);
    try { PNG.sync.read(data); }
    catch (error) { throw new Error(`Cannot migrate the legacy ${kind} icon: ${error.message}`); }
    sources.push({ kind, data });
  }
  for (const { kind, data } of sources) await storePackIcon(project, kind, data);
  const bom = original.startsWith('\uFEFF') ? '\uFEFF' : '';
  let updated = original.slice(bom.length);
  for (const profile of ['beta', 'stable']) updated = applyEdits(updated, modify(updated, ['profiles', profile, 'icons'], undefined, { formattingOptions: { insertSpaces: true, tabSize: 2, eol: updated.includes('\r\n') ? '\r\n' : '\n' } }));
  if (await fs.readFile(file, 'utf8') !== original) throw new Error('Project settings changed during icon migration; retry the operation.');
  await atomicText(file, bom + updated);
}
function owns(marker, config, kind, profile) { return marker?.project === ownerId(config, profile) && marker.kind === kind && (marker.profile || 'beta') === profile; }
async function retryFile(action) {
  for (let attempt = 0; ; attempt++) {
    try { return await action(); }
    catch (error) {
      if (attempt >= 3 || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) throw error;
      await new Promise(resolve => setTimeout(resolve, 75 * (attempt + 1)));
    }
  }
}
async function sameFile(a, b) {
  try { return (await fs.readFile(a)).equals(await fs.readFile(b)); }
  catch (error) { if (['ENOENT', 'EISDIR'].includes(error.code)) return false; throw error; }
}
async function pruneEmptyDirectories(root) {
  for (const entry of await fs.readdir(root, { withFileTypes: true })) if (entry.isDirectory()) {
    const directory = await noLinks(path.join(root, entry.name));
    await pruneEmptyDirectories(directory);
    try { await fs.rmdir(directory); }
    catch (error) { if (!['ENOTEMPTY', 'EEXIST', 'EPERM', 'EACCES', 'EBUSY'].includes(error.code)) throw error; }
  }
}
async function deploy(build, destination) {
  if (!['beta', 'stable'].includes(build.profile)) throw new Error('Unknown deployment profile');
  destination = await noLinks(path.resolve(destination));
  if (path.basename(destination).toLowerCase() !== 'com.mojang') throw new Error('Select the com.mojang folder');
  if (!(await exists(destination))) throw new Error('Minecraft folder does not exist');
  const plans = [];
  const touched = [];
  let started = false;
  try {
    // Snapshot both packs before changing either. Keep pack roots in place:
    // Minecraft can hold a directory handle that prevents renaming the root.
    for (const kind of kinds) {
      const parent = await noLinks(path.join(destination, `${build.profile === 'beta' ? 'development_' : ''}${kind}_packs`));
      const target = await noLinks(path.join(parent, packFolderName(build.config, build.profile, kind)));
      await fs.mkdir(parent, { recursive: true });
      if (await exists(target)) {
        const marker = await readJson(path.join(target, '.bedrock-owner.json')).catch(() => null);
        if (!owns(marker, build.config, kind, build.profile)) throw new Error(`Refusing to overwrite an unowned folder: ${target}`);
        for await (const _ of files(target, '', true)) { /* reject all nested links */ }
      }
      const temporary = await fs.mkdtemp(path.join(parent, '.bedrock-stage-'));
      const plan = { target, temporary, existed: await exists(target), operations: [], retired: [] };
      plans.push(plan);
      plan.kind = kind;
      const next = path.join(temporary, 'next');
      await fs.cp(path.join(build.directory, kind), next, { recursive: true });
      const desired = new Set();
      for await (const relative of files(next, '', true)) {
        if (relative === '.bedrock-owner.json') throw new Error('Build contains a reserved ownership file');
        desired.add(relative);
      }
      const previous = new Set();
      if (plan.existed) for await (const relative of files(target, '', true)) if (relative !== '.bedrock-owner.json') previous.add(relative);
      for (const relative of new Set([...previous, ...desired])) {
        const file = await noLinks(path.join(target, relative));
        const source = desired.has(relative) ? path.join(next, relative) : undefined;
        if (source && previous.has(relative) && await sameFile(source, file)) continue;
        const backup = previous.has(relative) ? path.join(temporary, 'previous', relative) : undefined;
        if (backup) { await fs.mkdir(path.dirname(backup), { recursive: true }); await fs.copyFile(file, backup); }
        plan.operations.push({ file, source, backup });
      }
      // Retire this project's older names/versions in the same recovery journal.
      // Copy/delete files instead of renaming a root Minecraft may hold open.
      for (const entry of await fs.readdir(parent, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name.toLowerCase() === path.basename(target).toLowerCase()) continue;
        const retired = await noLinks(path.join(parent, entry.name));
        const markerFile = await noLinks(path.join(retired, '.bedrock-owner.json'));
        const marker = await readJson(markerFile).catch(() => null);
        if (!owns(marker, build.config, kind, build.profile)) {
          if (build.profile === 'stable') {
            const manifest = await readJson(await noLinks(path.join(retired, 'manifest.json'))).catch(() => null);
            if (manifest?.header?.uuid?.toLowerCase() === build.config.profiles.stable.identities[kind].header.toLowerCase()) throw new Error(`An imported stable pack with this UUID exists in an unowned folder: ${retired}. Move or remove that installed pack before deploying stable.`);
          }
          continue;
        }
        plan.retired.push(retired);
        for await (const relative of files(retired, '', true)) {
          if (relative === '.bedrock-owner.json') continue;
          const file = await noLinks(path.join(retired, relative));
          const backup = path.join(temporary, 'retired', entry.name, relative);
          await fs.mkdir(path.dirname(backup), { recursive: true });
          await fs.copyFile(file, backup);
          plan.operations.push({ file, backup });
        }
      }
      // Retained with snapshots if recovery fails, so the previous files remain available.
      await writeJson(path.join(temporary, 'journal.json'), { target, kind, operations: plan.operations });
    }
    started = true;
    for (const plan of plans) {
      if (!plan.existed) {
        await fs.mkdir(plan.target);
        // Leave an empty owned root on a failed first deployment so retrying is safe.
        await fs.writeFile(path.join(plan.target, '.bedrock-owner.json'), JSON.stringify({ project: ownerId(build.config, build.profile), kind: plan.kind, profile: build.profile }), { flag: 'wx' });
      }
    }
    // Delete stale files before writing so file/directory shape changes can succeed.
    for (const plan of plans) for (const operation of plan.operations) if (!operation.source) {
      touched.push(operation);
      await retryFile(() => fs.rm(operation.file, { force: true }));
    }
    for (const plan of plans) await pruneEmptyDirectories(plan.target);
    // Write manifests last, after both packs' content has been synchronized.
    const updates = plans.flatMap(plan => plan.operations).filter(op => op.source).sort((a, b) => Number(path.basename(a.file) === 'manifest.json') - Number(path.basename(b.file) === 'manifest.json'));
    for (const operation of updates) {
      touched.push(operation);
      await fs.mkdir(path.dirname(operation.file), { recursive: true });
      await retryFile(() => fs.copyFile(operation.source, operation.file));
    }
  } catch (error) {
    const recoveryErrors = [];
    // Remove newly introduced files first, then restore the previous layout.
    for (const operation of [...touched].reverse()) if (!operation.backup) {
      try { await retryFile(() => fs.rm(operation.file, { force: true })); }
      catch (restoreError) { recoveryErrors.push(restoreError); }
    }
    for (const plan of plans) if (started && await exists(plan.target)) {
      try { await pruneEmptyDirectories(plan.target); }
      catch (restoreError) { recoveryErrors.push(restoreError); }
    }
    for (const operation of [...touched].reverse()) if (operation.backup) {
      try {
        if (await sameFile(operation.file, operation.backup)) continue;
        await fs.mkdir(path.dirname(operation.file), { recursive: true });
        await retryFile(() => fs.copyFile(operation.backup, operation.file));
      } catch (restoreError) { recoveryErrors.push(restoreError); }
    }
    if (recoveryErrors.length) throw new Error(`${error.message}\nRecovery could not restore every file. Previous files and journals are preserved at: ${plans.map(plan => plan.temporary).join(', ')}\n${recoveryErrors.map(e => e.message).join('\n')}`, { cause: error });
    for (const plan of plans) await fs.rm(plan.temporary, { recursive: true, force: true });
    if (['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) error.message += '\nA deployed file is locked or not writable. Close the world or the process holding that file and retry deployment.';
    throw error;
  }
  for (const plan of plans) {
    for (const retired of plan.retired) {
      // Contents are already journaled and removed; only empty directories and
      // the ownership marker remain. Retain a marker if Windows holds the root.
      try {
        await noLinks(retired);
        await pruneEmptyDirectories(retired);
        await fs.rm(path.join(retired, '.bedrock-owner.json'));
        await retryFile(() => fs.rmdir(retired));
      } catch (error) {
        if (await exists(retired)) {
          try { await fs.writeFile(path.join(retired, '.bedrock-owner.json'), JSON.stringify({ project: ownerId(build.config, build.profile), kind: plan.kind, profile: build.profile }), { flag: 'wx' }); }
          catch (markerError) { if (markerError.code !== 'EEXIST') build.warnings.push(markerError.message); }
        }
        build.warnings.push(`Old pack content was removed, but its empty folder could not be removed: ${retired}. Close Minecraft to allow cleanup on the next deployment. ${error.message}`);
      }
    }
    await fs.rm(plan.temporary, { recursive: true, force: true });
  }
  return plans.map(p => p.target);
}
async function exportAddon(build) {
  if (build.profile !== 'stable') throw new Error('Stable profile required for export');
  const output = await local(build.root, build.config.build.exports);
  await fs.mkdir(output, { recursive: true });
  const destination = path.join(output, `${buildName(build.config, 'stable')} ${build.config.version.join('.')}.mcaddon`);
  const archive = {};
  for (const kind of kinds) for await (const file of files(path.join(build.directory, kind))) archive[`${packFolderName(build.config, 'stable', kind)}${kind === 'behavior' ? 'BP' : 'RP'}/${file.replaceAll(path.sep, '/')}`] = new Uint8Array(await fs.readFile(path.join(build.directory, kind, file)));
  // Exclusive creation prevents accidentally replacing a released version.
  await fs.writeFile(destination, zipSync(archive, { level: 6 }), { flag: 'wx' });
  return destination;
}
async function initialize(root) {
  root = await noLinks(path.resolve(root));
  if (await exists(path.join(root, 'bedrock-project.json'))) throw new Error('Project is already initialized');
  const manifests = {};
  for (const kind of kinds) { const p = kind === 'behavior' ? 'BP' : 'RP'; manifests[kind] = await readJson(path.join(root, p, 'manifest.json')); checkManifest(manifests[kind], p); }
  const profiles = {};
  const name = path.basename(root);
  for (const profile of ['beta', 'stable']) profiles[profile] = { title: name + (profile === 'beta' ? ' Beta' : ''), identities: Object.fromEntries(kinds.map(kind => [kind, { header: profile === 'stable' ? manifests[kind].header.uuid : randomUUID(), modules: manifests[kind].modules.map(m => profile === 'stable' ? m.uuid : randomUUID()) }])) };
  const config = { formatVersion: 1, name, version: manifests.behavior.header.version, target: 'release', targetVersion: (manifests.behavior.header.min_engine_version || [1, 21, 0]).join('.'), packs: { behavior: 'BP', resource: 'RP' }, build: { autoDeploy: false, output: '.bedrock/build', exports: '.bedrock/exports' }, profiles };
  await fs.writeFile(path.join(root, 'bedrock-project.json'), JSON.stringify(config, null, 2) + '\n', { flag: 'wx' });
  return config;
}
function defaultDestinations(target, env = process.env) {
  const current = path.join(env.APPDATA || '', target === 'preview' ? 'Minecraft Bedrock Preview' : 'Minecraft Bedrock', 'users/shared/games/com.mojang');
  const legacy = path.join(env.LOCALAPPDATA || '', 'Packages', target === 'preview' ? 'Microsoft.MinecraftWindowsBeta_8wekyb3d8bbwe' : 'Microsoft.MinecraftUWP_8wekyb3d8bbwe', 'LocalState/games/com.mojang');
  return [current, legacy];
}
module.exports = { loadProject, compile, deploy, exportAddon, initialize, defaultDestinations, readJson, writeJson, files, exists, local, inside, buildName, packFolderName, parseVersion, setProjectVersion, setProjectTargetVersion, commitTextChanges, copyPackIcon, migratePackIcons };
