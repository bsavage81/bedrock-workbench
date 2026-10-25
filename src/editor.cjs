const path = require('node:path');
const json = require('jsonc-parser');
const reference = require('./reference.cjs');
const core = require('./core.cjs');
const officialSchemas = require('./official-schemas.cjs');
const ownedBlocks = require('../schemas/block.schema.json').definitions.components.properties;
const ownedByKind = {entity:require('../schemas/entity.schema.json').definitions.components.properties,block:ownedBlocks,item:require('../schemas/item.schema.json').definitions.components.properties};
const documentation = require('./documentation.cjs');
function attach(vscode, context, getProject, output) {
  if (!vscode.languages.registerCompletionItemProvider) return { refresh() {} };
  let index, activeKey, generation = 0;
  const pending = new Map();
  const problems = vscode.languages.createDiagnosticCollection('bedrock-spelling');
  function info(document, position) {
    const project = getProject();
    if (!index || !project || document.uri.scheme !== 'file') return;
    const rel = path.relative(project.packs.behavior, document.uri.fsPath).replaceAll(path.sep, '/');
    if (rel.startsWith('../') || path.isAbsolute(rel)) return;
    const kind = { blocks: 'block', items: 'item', entities: 'entity' }[rel.split('/')[0]];
    if (!kind) return;
    const text = document.getText(), location = json.getLocation(text, document.offsetAt(position));
    const keys = location.path, c = kind==='entity'&&keys[1]==='component_groups'?2:keys.lastIndexOf('components');
    if (c < 0 || keys[0] !== `minecraft:${kind}`) return;
    if (c !== 1 && !(kind==='entity'&&c===2&&keys[1]==='component_groups') && !(c === 3 && ((kind==='block' && keys[1] === 'permutations' && typeof keys[2] === 'number') || (kind === 'entity' && keys[1] === 'component_groups')))) return;
    const components = index.components[kind];
    return { text, location, keys, c, kind, components };
  }
  function markdown(value, kind, component, field) {
    const md = new vscode.MarkdownString();
    md.appendMarkdown((field?reference.descriptionText(value.description):documentation.componentDescription(kind,component,reference.descriptionText(value.description))) || 'Mojang component documentation.');
    const requirement=require('./format-versions.cjs').rule(kind,component),minimum=(field?requirement?.fields?.[field]:requirement)?.min;if(minimum)md.appendText('\n\nMinimum format version: '+minimum+'.');
    if (value.type) md.appendText(`\n\nType: ${value.type}`);
    if (value.default !== undefined) md.appendText(`\nDefault: ${JSON.stringify(value.default)}`);
    md.appendText(`\n\nReference data: Mojang ${index.tag}.`);
    md.appendMarkdown('\n\n'+documentation.componentLink(kind, component));
    md.isTrusted = false; return md;
  }
  function keyNode(document, data) {
    const node = json.findNodeAtLocation(json.parseTree(data.text), data.keys);
    return node?.parent?.type === 'property' ? node.parent.children[0] : undefined;
  }
  const selector = [{ language: 'json', scheme: 'file' }, { language: 'jsonc', scheme: 'file' }];
  context.subscriptions.push(problems,
    vscode.languages.registerCompletionItemProvider(selector, {
      provideCompletionItems(document, position) {
        const data = info(document, position);
        if (!data?.location.isAtPropertyKey) return;
        const level = data.keys.length - data.c - 1;
        const owned=ownedByKind[data.kind]||{};
        if (level === 2 && Object.hasOwn(owned, data.keys[data.c + 1])) return;
        const values = level === 1 ? Object.fromEntries(Object.entries(data.components).filter(([name]) => !Object.hasOwn(owned,name))) : level === 2 ? data.components[data.keys[data.c + 1]]?.fields : undefined;
        if (!values) return;
        const parent = json.findNodeAtLocation(json.parseTree(data.text), data.keys.slice(0, -1));
        const existing = new Set(parent?.children?.map(n => n.children?.[0]?.value));
        const previous = data.location.previousNode;
        const format=json.findNodeAtLocation(json.parseTree(data.text),['format_version'])?.value;
        return Object.entries(values).filter(([name])=>require('./format-versions.cjs').supported(data.kind,level===1?name:data.keys[data.c+1],format,getProject()?.config.targetVersion,level===2?name:undefined)).filter(([name]) => !existing.has(name) || name === data.keys.at(-1)).map(([name, value]) => {
          const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Property);
          item.documentation = markdown(value, data.kind, level === 1 ? name : data.keys[data.c + 1],level===2?name:undefined); item.detail = `Mojang ${index.tag}`;
          // Replace only the content inside existing quotes; JSON service handles values.
          if (previous?.type === 'property' && previous.offset <= document.offsetAt(position)) {
            item.range = new vscode.Range(document.positionAt(previous.offset + 1), document.positionAt(previous.offset + previous.length - 1)); item.insertText = name;
          } else item.insertText = JSON.stringify(name) + ': ';
          return item;
        });
      }
    }, '"', ':'),
    vscode.languages.registerCodeActionsProvider(selector, {
      provideCodeActions(document, range) {
        const data = info(document, range.start);
        if (!data?.location.isAtPropertyKey || data.keys.length !== data.c + 2) return [];
        const name = data.keys.at(-1), node = keyNode(document, data);
        if (!node || typeof name !== 'string' || !name.startsWith('minecraft:') || data.components[name] || Object.hasOwn(ownedByKind[data.kind]||{},name)) return [];
        return reference.closest(name, [...new Set([...Object.keys(data.components), ...Object.keys(ownedByKind[data.kind]||{})])]).map(replacement => {
          const action = new vscode.CodeAction(`Change to ${replacement}`, vscode.CodeActionKind.QuickFix);
          action.edit = new vscode.WorkspaceEdit();
          action.edit.replace(document.uri, new vscode.Range(document.positionAt(node.offset), document.positionAt(node.offset + node.length)), JSON.stringify(replacement));
          return action;
        });
      }
    }, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] })
  );
  function validate(document) {
    const items = [], tree = json.parseTree(document.getText());
    function walk(node) {
      if (node?.type === 'property') {
        const key = node.children[0];
        if (typeof key.value === 'string' && key.value.startsWith('minecraft:')) {
          const data = info(document, document.positionAt(key.offset + 1));
          if (data && data.keys.length === data.c + 2 && !data.components[key.value] && !Object.hasOwn(ownedByKind[data.kind]||{},key.value)) {
            const suggestions = reference.closest(key.value, [...new Set([...Object.keys(data.components), ...Object.keys(ownedByKind[data.kind]||{})])]);
            if (suggestions.length) items.push(new vscode.Diagnostic(new vscode.Range(document.positionAt(key.offset), document.positionAt(key.offset + key.length)), `Possible component spelling: ${suggestions.join(', ')} (Mojang ${index.tag}).`, vscode.DiagnosticSeverity.Information));
          }
        }
      }
      for (const child of node?.children || []) walk(child);
    }
    if (index) walk(tree);
    problems.set(document.uri, items);
  }
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(validate), vscode.workspace.onDidChangeTextDocument(e => validate(e.document)), vscode.workspace.onDidCloseTextDocument(d => problems.delete(d.uri)), { dispose() { generation++; } });
  async function refresh(force = false) {
    const project = getProject(); if (!project || !vscode.workspace.isTrusted) return;
    const key = JSON.stringify([project.root, project.config.targetVersion, project.packs]);
    if (!force && activeKey === key) return;
    activeKey = key; index = undefined; problems.clear(); const ticket = ++generation;
    let official;
    async function associate(associations) {
      if (ticket !== generation) return;
      // VS Code's word provider otherwise fills schema-free/custom parameter
      // objects with unrelated identifiers from every open JSON document.
      // Scope this to JSON in the Bedrock workspace, never user-wide settings.
      const workspaceSettings = vscode.workspace.getConfiguration(undefined, vscode.Uri.file(project.root));
      for (const language of ['[json]', '[jsonc]']) {
        const local = workspaceSettings.inspect(language)?.workspaceFolderValue || workspaceSettings.inspect(language)?.workspaceValue || {};
        if (local['editor.wordBasedSuggestions'] !== 'off') await workspaceSettings.update(language, { ...local, 'editor.wordBasedSuggestions': 'off' }, vscode.ConfigurationTarget.WorkspaceFolder);
      }
      const settings = vscode.workspace.getConfiguration('json', vscode.Uri.file(project.root));
      const existing = settings.inspect('schemas')?.workspaceFolderValue || settings.inspect('schemas')?.workspaceValue || settings.inspect('schemas')?.globalValue || [];
      const next = [...existing.filter(entry => !entry.url?.includes('/.bedrock/reference/')), ...associations];
      if (JSON.stringify(existing) !== JSON.stringify(next)) await settings.update('schemas', next, vscode.ConfigurationTarget.WorkspaceFolder);
    }
    try { official = await officialSchemas.prepare(project); await associate(official.associations); if (official.directory) output.info(`Official Bedrock schemas ${official.version} ready.`); }
    catch (error) { output.warn(`Official schemas unavailable: ${error.message}`); }
    if (ticket !== generation) return;
    const task = reference.loadReference(project.root, project.config.targetVersion, { force }); pending.set(key, task);
    try {
      const loaded = await task; if (ticket !== generation) return;
      index = loaded; output.info(`Mojang reference loaded: ${index.tag}`);
      // The JSON service uses the first matching documented schema for hover.
      // Prefer our versioned component reference over the broader fallback.
      const associations = [];
      for (const [folder, kind] of Object.entries({ blocks: 'block', items: 'item', entities: 'entity' })) {
        const file = await core.local(project.root, `.bedrock/reference/${kind}.schema.json`);
        await core.writeJson(file, reference.componentSchema(index, kind, { omit: Object.keys(ownedByKind[kind]||{}),supplement:kind==='entity'?require('../schemas/entity.schema.json'):undefined }));
        associations.push({ fileMatch: [path.join(project.packs.behavior, folder, '**/*.json').replaceAll(path.sep, '/')], url: vscode.Uri.file(file).toString() });
      }
      associations.push(...(official?.associations || []));
      if (ticket !== generation) return;
      await associate(associations);
      for (const document of vscode.workspace.textDocuments) validate(document);
    } catch (error) { if (ticket === generation) {
      activeKey = undefined; index = undefined; problems.clear();
      // Do not leave schemas from a previously higher target active after a
      // target change fails to obtain compatible reference data.
      try {
        await associate(official?.associations || []);
      } catch (settingsError) { output.warn(`Could not remove stale reference schemas: ${settingsError.message}`); }
      output.warn(`Mojang reference unavailable: ${error.message}`); if (force) await vscode.window.showWarningMessage(`Mojang reference: ${error.message}`);
    } }
    finally { if (pending.get(key) === task) pending.delete(key); }
  }
  return { refresh };
}
module.exports = { attach };
