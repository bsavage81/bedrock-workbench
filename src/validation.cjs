const path = require('node:path');
const fs = require('node:fs/promises');
const json = require('jsonc-parser');
const Ajv = require('ajv');
const core = require('./core.cjs');
const content = require('./content.cjs');
const schemas = require('./official-schemas.cjs');
const manifestValidator = new Ajv({ strict: false, allErrors: true }).compile(require('../schemas/manifest.schema.json'));
function at(document, keys, message, severity = 'error') {
  const node = json.findNodeAtLocation(document.tree, keys);
  return { file: document.file, offset: node?.offset || 0, length: Math.max(1, node?.length || 1), message, severity };
}
function pointerKeys(pointer) { return pointer.split('/').slice(1).map(k => k.replaceAll('~1', '/').replaceAll('~0', '~')); }
async function validateProject(root) {
  const project = await core.loadProject(root), index = await content.scan(project);
  const issues = [...index.issues];
  const prepared = await schemas.prepare(project), validateSchema = prepared.directory ? await schemas.validator(prepared) : undefined;
  const unavailable = new Set(); const uuids = new Map();
  const headers = new Map([...index.documents.values()].filter(d => d.relative === 'manifest.json').map(d => [d.data?.header?.uuid, d]));
  for (const document of index.documents.values()) {
    if (document.relative === 'manifest.json') {
      const modules = Array.isArray(document.data?.modules) ? document.data.modules : [];
      const dependencies = Array.isArray(document.data?.dependencies) ? document.data.dependencies : [];
      if (!manifestValidator(document.data)) for (const error of manifestValidator.errors || []) issues.push(at(document, pointerKeys(error.instancePath), `Manifest: ${error.message}`));
      for (const [keys, id] of [[['header', 'uuid'], document.data?.header?.uuid], ...modules.map((m, i) => [['modules', i, 'uuid'], m?.uuid])]) {
        if (typeof id !== 'string') continue;
        if (uuids.has(id.toLowerCase())) issues.push(at(document, keys, `Duplicate manifest UUID; also used in ${path.relative(root, uuids.get(id.toLowerCase()))}.`));
        else uuids.set(id.toLowerCase(), document.file);
      }
      for (const [i, module] of modules.entries()) if (module?.type === 'script' && typeof module.entry === 'string') {
        try {
          const entry = await core.local(root, path.relative(root, path.join(project.packs[document.side], module.entry)));
          if (!core.inside(project.packs[document.side], entry)) throw new Error('entry leaves its pack');
          if (!await core.exists(entry) && !await core.exists(entry.replace(/\.js$/, '.ts'))) issues.push(at(document, ['modules', i, 'entry'], `Script entry '${module.entry}' does not exist as JavaScript or TypeScript.`));
        } catch { issues.push(at(document, ['modules', i, 'entry'], 'Script entry must remain inside its source pack.')); }
      }
      for (const [i, dependency] of dependencies.entries()) if (dependency?.uuid && headers.has(dependency.uuid)) {
        if (JSON.stringify(dependency.version) !== JSON.stringify(headers.get(dependency.uuid).data.header.version)) issues.push(at(document, ['dependencies', i, 'version'], 'Linked pack dependency version does not match the other source manifest.', 'warning'));
      }
    } else if (validateSchema) {
      try {
        for (const error of await validateSchema(document.side, document.relative, document.data)) issues.push(at(document, pointerKeys(error.path), error.message, 'warning'));
      } catch (error) {
        const folder = document.side + ':' + document.relative.split('/')[0];
        if (!unavailable.has(folder)) { unavailable.add(folder); issues.push(at(document, [], `Official schema check unavailable for ${folder}: ${error.message}`, 'information')); }
      }
    }
    issues.push(...content.referenceIssues(index, document), ...content.customComponentIssues(index, document), ...content.molangIssues(document));
  }
  for (const type of ['entity', 'item', 'block', 'client_entity', 'geometry', 'animation', 'animation_controller', 'render_controller']) for (const [id, files] of index.values(type)) {
    const groups = new Map();
    for (const file of files) {
      const kind = content.fileKind(project, file);
      if (kind.relative.startsWith('subpacks/')) continue;
      if (!groups.has(kind.side)) groups.set(kind.side, []); groups.get(kind.side).push(file);
    }
    for (const duplicates of groups.values()) if (duplicates.length > 1) for (const file of duplicates) issues.push({ file, offset: 0, length: 1, severity: 'warning', message: `Duplicate ${type.replaceAll('_', ' ')} identifier '${id}' in this pack.` });
  }
  return { files: index.documents.size, schemaVersion: prepared.directory ? schemas.VERSION : null, issues };
}
module.exports = { validateProject };
