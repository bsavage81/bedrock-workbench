const path = require('node:path');
const json = require('jsonc-parser');
const content = require('./content.cjs');
const reference = require('./reference.cjs');
const commands = require('./commands.cjs');
const parameters = require('./component-parameters.cjs');
const {keyEdit,valueEdit} = require('./completion-key.cjs');
const documentation = require('./documentation.cjs');
function attach(vscode, context, getProject, output) {
  if (!vscode.languages.registerCompletionItemProvider) return;
  const diagnostics = vscode.languages.createDiagnosticCollection('bedrock-content');
  let cached, dirty = true, running, key, timer, disposed = false;
  const pendingFiles = new Set();
  let vanilla, vanillaKey, vanillaPending;
  async function referenceData() {
    const project = getProject(); if (!project) return;
    const next = JSON.stringify([project.root, project.config.targetVersion]);
    if (next !== vanillaKey) {
      vanillaKey = next; vanilla = undefined;
      vanillaPending = reference.loadReference(project.root, project.config.targetVersion).then(value => { if (vanillaKey === next) vanilla = value; return value; }).catch(error => { output.warn(`Command reference: ${error.message}`); });
    }
    return vanilla || vanillaPending;
  }
  async function ensure() {
    const project = getProject(); if (!project || disposed) return;
    const next = JSON.stringify([project.root, project.packs,project.vanillaSource,project.config.target,project.config.targetVersion,project.config.validation]);
    if (next !== key) { key = next; dirty = true; cached = undefined; pendingFiles.clear(); }
    if (running) { await running; return ensure(); }
    if (!dirty && cached) return cached;
    dirty = false; const requestedKey = key;
    const files = [...pendingFiles]; pendingFiles.clear();
    running = (async () => {
      if (cached && files.length) {
        for (const file of files) if (!await content.update(cached, file)) return content.scan(project);
        return cached;
      }
      return content.scan(project);
    })().then(index => { if (requestedKey === key && !disposed) cached = index; return index; }).catch(error => { dirty = true; cached = undefined; output.warn(`Content indexing: ${error.message}`); }).finally(() => { running = undefined; });
    return running;
  }
  function documentData(document) {
    const project = getProject(); if (!project || document.uri.scheme !== 'file') return;
    const kind = content.fileKind(project, document.uri.fsPath); if (!kind || !document.uri.fsPath.endsWith('.json')) return;
    const text = document.getText(); return { ...kind, file: document.uri.fsPath, text, tree: json.parseTree(text.replace(/^\uFEFF/, ' ')) };
  }
  function at(document, position) {
    const data = documentData(document); if (!data?.tree) return;
    const offset = document.offsetAt(position), location = json.getLocation(data.text, offset), node = json.findNodeAtOffset(data.tree, offset, true);
    const keys=location.path,renderKey=data.side==='resource'&&['minecraft:client_entity','minecraft:attachable'].includes(keys[0])&&keys[1]==='description'&&keys[2]==='render_controllers'&&typeof keys[3]==='number'&&keys.length===5&&location.isAtPropertyKey;
    if (!node || node.type !== 'string'&&!renderKey || node.parent?.type === 'property' && node.parent.children[0] === node&&!renderKey) return;
    return { data, node, location, offset,renderKey };
  }
  function diagnostic(document, issue) {
    const result = new vscode.Diagnostic(new vscode.Range(document.positionAt(issue.offset), document.positionAt(issue.offset + issue.length)), issue.message, issue.severity === 'warning' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Information);
    result.source = 'Bedrock Workbench';if(issue.code)result.code=issue.code; return result;
  }
  function validate(document) {
    if (disposed) return;
    const data = documentData(document);
    if (!data) { diagnostics.delete(document.uri); return; }
    const compatibility=require('./component-compatibility.cjs').issues(data,getProject()).filter(issue=>!issue.native||!require('./diagnostic-policy.cjs').nativeOwnsSyntax(vscode,document.uri.fsPath));
    const issues = [...(cached?require('./linked-entities.cjs').issues(cached,data):[]),...require('./entity-authoring.cjs').issues(data),...compatibility,...require('./format-versions.cjs').issues(data,getProject()), ...content.molangIssues(data), ...(cached ? [...content.referenceIssues(cached, data), ...content.customComponentIssues(cached, data)] : [])];
    diagnostics.set(document.uri, issues.map(issue => diagnostic(document, issue)));
  }
  const selector = [{ language: 'json', scheme: 'file' }, { language: 'jsonc', scheme: 'file' }];
  if(vscode.languages.registerCodeActionsProvider)context.subscriptions.push(vscode.languages.registerCodeActionsProvider(selector,{
    async provideCodeActions(document,range) {
      const data=documentData(document);if(!data)return;
      const compatibility=await require('./compatibility-actions.cjs').codeActions(vscode,document,range,data,getProject());
      const index=await ensure();if(!index)return compatibility;
      return compatibility.concat(content.referenceIssues(index,data).filter(issue=>range.intersection(new vscode.Range(document.positionAt(issue.offset),document.positionAt(issue.offset+issue.length)))).flatMap(issue=>['file','project'].map(scope=>{
        const action=new vscode.CodeAction(`Mark '${issue.reference.value}' as intended ${scope==='file'?'in this file':'throughout project'}`,vscode.CodeActionKind.QuickFix);
        action.command={command:'bedrock.ignoreReference',title:action.title,arguments:[{...issue.reference,file:document.uri.fsPath,scope}]};return action;
      })));
    }
  },{providedCodeActionKinds:[vscode.CodeActionKind.QuickFix]}));
  function completeKey(item, document, state, key, valueSnippet, position) {
    const edit = keyEdit(state.data.text, state.node, key, valueSnippet,document.offsetAt(position));
    if (edit.start !== undefined) item.range = new vscode.Range(document.positionAt(edit.start), document.positionAt(edit.end));
    item.insertText = edit.snippet ? new vscode.SnippetString(edit.text) : edit.text;
    if (edit.snippet) item.command = { command: 'editor.action.triggerSuggest', title: 'Suggest parameter values' };
  }
  function completeValue(item,document,state,position,value) {
    const edit=valueEdit(state.data.text,state.node,document.offsetAt(position),value);
    item.range=new vscode.Range(document.positionAt(edit.start),document.positionAt(edit.end)); item.insertText=edit.text; item.filterText=JSON.stringify(value);
  }
  function parameterAt(document, position) {
    const data = documentData(document); if (!data) return;
    const format=json.findNodeAtLocation(data.tree,['format_version'])?.value;if(!require('./format-versions.cjs').directCustom(format))return;
    const state = parameters.context(data, document.offsetAt(position)); if (state) return { ...state, data };
  }
  function parameterMarkdown(id, value, index) {
    const md = new vscode.MarkdownString();
    md.appendText(`${id}${value.path.length ? ' · ' + value.path.join('.') : ''}\n\n`);
    if (value.description) md.appendText(value.description + '\n\n');
    md.appendText(`Parameter hint: ${value.types.join(' | ') || 'unknown type'}. Inferred from script usage and existing project definitions; not a validation requirement.`);
    if (value.samples.length) md.appendText('\nExamples: ' + value.samples.map(sample => JSON.stringify(sample)).join(', '));
    for (const source of value.sources) md.appendText(`\n${source.origin === 'script' ? 'Script' : 'Example'}: ${path.relative(index.project.root, source.file)}:${source.line + 1}`);
    md.appendMarkdown('\n\n'+documentation.componentLink('block',id));
    return md;
  }
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(selector, {
      async provideCompletionItems(document, position) {
        const state = parameterAt(document, position); if (!state) return;
        const index = await ensure(); if (!index) return;
        const values = parameters.hints(index, state.kind, state.id), same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
        if (state.mode === 'key') {
          const parent = json.findNodeAtLocation(state.data.tree, state.location.path.slice(0, -1));
          const existing = new Set(parent?.children?.filter(n => n.type === 'property').map(n => n.children[0].value));
          return values.filter(value => value.path.length === state.path.length + 1 && same(value.path.slice(0, -1), state.path) && value.path.at(-1) !== '*' && (!existing.has(value.path.at(-1)) || value.path.at(-1) === state.field)).map(value => {
            const key = value.path.at(-1), item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Property);
            item.detail = `Custom parameter · ${value.types.join(' | ') || 'inferred'}`; item.documentation = parameterMarkdown(state.id, value, index);
            const example = value.samples.length ? JSON.stringify(value.samples[0]) : value.types.includes('boolean') ? 'false' : value.types.some(type => ['number', 'integer'].includes(type)) ? '0' : value.types.includes('array') ? '[]' : value.types.includes('object') ? '{}' : '""';
            const quoted = example.startsWith('"'), placeholder = (quoted ? example.slice(1,-1) : example).replace(/[\\$}]/g, '\\$&');
            completeKey(item, document, state, key, (quoted ? '"' : '') + '${1:' + placeholder + '}' + (quoted ? '"' : ''), position);
            return item;
          });
        }
        const value = values.find(value => same(value.path, state.path)); if (!value) return;
        const samples = new Set(value.samples); if (value.types.includes('boolean')) { samples.add(true); samples.add(false); }
        return [...samples].map(sample => {
          const item = new vscode.CompletionItem(JSON.stringify(sample), vscode.CompletionItemKind.Value); item.documentation = parameterMarkdown(state.id, value, index); item.detail = 'Custom parameter example';
          completeValue(item,document,state,position,sample); return item;
        });
      }
    }, '"', ':'),
    vscode.languages.registerHoverProvider(selector, {
      async provideHover(document, position) {
        const state = parameterAt(document, position); if (!state) return;
        const index = await ensure(); if (!index) return;
        const path = state.mode === 'key' ? [...state.path, state.field] : state.path;
        const value = parameters.hints(index, state.kind, state.id).find(value => JSON.stringify(value.path) === JSON.stringify(path));
        if (value) return new vscode.Hover(parameterMarkdown(state.id, value, index));
      }
    }),
    vscode.languages.registerDefinitionProvider(selector, {
      async provideDefinition(document, position) {
        const state = parameterAt(document, position); if (!state) return;
        const index = await ensure(); if (!index) return;
        const path = state.mode === 'key' ? [...state.path, state.field] : state.path;
        const value = parameters.hints(index, state.kind, state.id).find(value => JSON.stringify(value.path) === JSON.stringify(path));
        return value?.sources.map(source => new vscode.Location(vscode.Uri.file(source.file), new vscode.Position(source.line, source.column)));
      }
    })
  );
  function customAt(document, position) {
    const data = documentData(document); if (!data) return;
    const state = content.componentContext(data, document.offsetAt(position));
    if (state) return { ...state, data };
  }
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(selector, {
      async provideCompletionItems(document, position) {
        const state = customAt(document, position); if (!state) return;
        const index = await ensure(); if (!index) return;
        const parent = json.findNodeAtLocation(state.data.tree, state.location.path.slice(0, -1));
        const existing = new Set(parent?.children?.filter(n => n.type === 'property').map(n => n.children[0].value));
        const format=json.findNodeAtLocation(state.data.tree,['format_version'])?.value;
        if(state.mode==='key'&&!require('./format-versions.cjs').directCustom(format))return [];
        return [...index.values(state.kind + '_component')].filter(([id]) => !existing.has(id) || state.id === id).map(([id, files]) => {
          const item = new vscode.CompletionItem(id, state.mode === 'key' ? vscode.CompletionItemKind.Property : vscode.CompletionItemKind.Reference);
          item.detail = `Project ${state.kind} custom component`;
          item.documentation = files.map(file => path.relative(index.project.root, file)).join('\n');
          if (state.mode === 'key') {
            completeKey(item, document, state, id, '{\n\t$0\n}',position);
          } else completeValue(item,document,state,position,id);
          return item;
        });
      }
    }, '"', ':'),
    vscode.languages.registerHoverProvider(selector, {
      async provideHover(document, position) {
        const state = customAt(document, position); if (!state?.id || state.id.startsWith('minecraft:')) return;
        const index = await ensure(), registrations = index?.customComponents.filter(value => value.kind === state.kind && value.id === state.id);
        if (!registrations?.length) return;
        const md = new vscode.MarkdownString(); md.appendText(`Custom ${state.kind} component: ${state.id}\n\n`);
        for (const value of registrations) md.appendText(`${path.relative(index.project.root, value.file)}:${value.line + 1}${value.callbacks.length ? '\nCallbacks: ' + value.callbacks.join(', ') : ''}\n`);
        md.appendMarkdown('\n\n'+documentation.componentLink(state.kind,state.id));
        return new vscode.Hover(md);
      }
    }),
    vscode.languages.registerDefinitionProvider(selector, {
      async provideDefinition(document, position) {
        const state = customAt(document, position); if (!state?.id) return;
        const index = await ensure();
        return index?.customComponents.filter(value => value.kind === state.kind && value.id === state.id).map(value => new vscode.Location(vscode.Uri.file(value.file), new vscode.Position(value.line, value.column)));
      }
    })
  );
  context.subscriptions.push(diagnostics,
    vscode.languages.registerCompletionItemProvider(selector, {
      async provideCompletionItems(document, position) {
        const state = at(document, position); if (!state) return;
        const { data, node, offset, location } = state;
        const before = data.text.slice(node.offset + 1, offset), molang = content.molangNodes(data).includes(node);
        const prefix = /(?:query|q|math)\.[a-z_]*$/i.exec(before)?.[0];
        const range = new vscode.Range(document.positionAt(node.offset + 1), document.positionAt(node.offset + node.length - 1));
        if (molang && prefix) return [...content.MOLANG_QUERIES, ...content.MOLANG_MATH].filter(value => (prefix.startsWith('q.') ? value.name.replace(/^query\./, 'q.') : value.name).startsWith(prefix)).map(value => {
          const name = prefix.startsWith('q.') ? value.name.replace(/^query\./, 'q.') : value.name;
          const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Function); item.detail = 'Mojang Molang reference'; item.documentation = value.description;
          item.range = new vscode.Range(document.positionAt(offset - prefix.length), position); item.insertText = name; return item;
        });
        if(location.path.length===1&&location.path[0]==='format_version'&&data.relative!=='manifest.json'){
          const index=await ensure();if(!index)return;
          return require('./format-versions.cjs').choices(index,data,getProject()).map(value=>{const item=new vscode.CompletionItem(value,vscode.CompletionItemKind.Value);completeValue(item,document,state,position,value);item.detail='Document format version';item.documentation='Selects this file’s syntax and component availability. Older formats are preserved; changing the format can change behavior.';return item;});
        }
        const kind = state.renderKey?'render_controller':content.referenceKind(location.path, node.value, data); if (!kind) return;
        const index = await ensure(); if (!index) return;
        const refs = /^(item|block|entity|terrain_texture|item_texture|sound|geometry|texture|material|animation|animation_controller|render_controller|particle)$/.test(kind) ? await referenceData() : index.reference;
        if (refs) index.reference = require('./vanilla.cjs').merge(refs,index.localReference);
        const values = content.referenceValues(index, kind, data, index.reference);
        return [...values].map(([id, files]) => {
          const item = new vscode.CompletionItem(id, vscode.CompletionItemKind.Reference);if(state.renderKey)completeKey(item,document,{...state,node:node.type==='string'?node:undefined},id,'"${1:1.0}"',position);else completeValue(item,document,state,position,id);
          const local=index.localReference?.vanilla?.[kind]?.includes(id),builtin=kind==='geometry' && content.builtinGeometries(data,index.project).includes(id);
          if(kind==='creative_group'&&!files.length) {item.detail='Vanilla creative group';item.documentation=require('./creative-groups.cjs').source;return item;}
          item.detail = files.length ? `Project ${kind.replaceAll('_', ' ')}` : local ? `Installed vanilla ${index.localReference.source.version}` : builtin ? 'Vanilla block geometry' : `Minecraft ${index.reference?.tag || 'reference'}`;
          item.documentation = files.length ? files.map(file => path.relative(index.project.root, file)).join('\n') : local ? index.localReference.source.folder : builtin ? 'Built-in block geometry. Availability depends on the block format and target engine.' : index.reference?.source; return item;
        });
      }
    }, '"', '.', ':'),
    vscode.languages.registerHoverProvider(selector, {
      async provideHover(document, position) {
        const state = at(document, position); if (!state) return;
        const { data, node, location, offset } = state;
        if (content.molangNodes(data).includes(node)) {
          const offsets = content.rawOffsets(data.text, node), decoded = Math.max(0, offsets.findIndex(value => value >= offset));
          const token = content.molangParser.getCursorContext(node.value, decoded).tokenAtCursor;
          const id = token?.fullIdentifier?.replace(/^q\./, 'query.');
          const reference = [...content.MOLANG_QUERIES, ...content.MOLANG_MATH].find(entry => entry.name === id);
          if (reference) return new vscode.Hover(`${reference.name}: ${reference.description}${reference.syntax ? '\n\n' + reference.syntax : ''}`);
        }
        const kind = content.referenceKind(location.path, node.value, data); if (!kind) return;
        const index = await ensure(), files = index?.values(kind).get(kind==='texture'?node.value.replace(/\.(png|tga|jpe?g)$/i,''):node.value);
        if(kind==='creative_group')return new vscode.Hover(`${node.value}\n\n${files?.length?files.map(file=>path.relative(getProject().root,file)).join('\n'):'Vanilla creative group'}\n\n[Microsoft Learn](${require('./creative-groups.cjs').source})`);
        if (files?.length) return new vscode.Hover(`Project ${kind.replaceAll('_', ' ')}: ${node.value}\n\n${files.map(file => path.relative(getProject().root, file)).join('\n')}`);
      }
    }),
    vscode.languages.registerDefinitionProvider(selector, {
      async provideDefinition(document, position) {
        const state = at(document, position); if (!state) return;
        const kind = content.referenceKind(state.location.path, state.node.value, state.data); if (!kind) return;
        const index = await ensure(); return index && content.referenceDefinitions(index, kind, state.node.value,state.data).map(value => new vscode.Location(vscode.Uri.file(value.file), new vscode.Position(value.line, value.column)));
      }
    }),
    vscode.workspace.onDidOpenTextDocument(document => { validate(document); void ensure().then(() => validate(document)); }),
    vscode.workspace.onDidChangeTextDocument(event => validate(event.document)),
    vscode.workspace.onDidCloseTextDocument(document => diagnostics.delete(document.uri))
  );
  const functionSelector = [{ language: 'mcfunction', scheme: 'file' }];
  async function commandState(document, position) {
    const project = getProject();
    if (!project || !content.fileKind(project, document.uri.fsPath) || !document.uri.fsPath.endsWith('.mcfunction')) return;
    const index = await ensure(), refs = await referenceData();
    return commands.context(document.lineAt(position.line).text.slice(0, position.character), refs, index);
  }
  context.subscriptions.push(vscode.languages.registerCompletionItemProvider(functionSelector, {
    async provideCompletionItems(document, position) {
      const state = await commandState(document, position); if (!state) return;
      // Include the suffix of the current token when completing in its middle.
      const suffix = /^[\w:./-]*/.exec(document.lineAt(position.line).text.slice(position.character))[0];
      return state.values.map(value => {
        const item = new vscode.CompletionItem(value, vscode.CompletionItemKind.Value);
        item.insertText = value; item.range = new vscode.Range(position.line, state.start, position.line, state.end + suffix.length);
        item.detail = 'Bedrock command / project reference'; return item;
      });
    }
  }, ' ', ':', '=', '[', ','));
  if (vscode.languages.registerSignatureHelpProvider) context.subscriptions.push(vscode.languages.registerSignatureHelpProvider(functionSelector, {
    async provideSignatureHelp(document, position) {
      const state = await commandState(document, position); if (!state?.signatures.length) return;
      const result = new vscode.SignatureHelp();
      result.signatures = state.signatures.slice(0, 30).map(({ command, overload, parameter }) => {
        const signature = new vscode.SignatureInformation(command.name + ' ' + overload.params.map(p => `${p.is_optional ? '[' : '<'}${p.name}: ${p.type.name}${p.is_optional ? ']' : '>'}`).join(' '), command.description);
        signature.parameters = overload.params.map(p => new vscode.ParameterInformation(`${p.name}: ${p.type.name}`));
        signature.activeParameter = parameter; return signature;
      });
      result.activeSignature = 0; result.activeParameter = state.signatures[0].parameter; return result;
    }
  }, ' '));
  require('./entity-editor.cjs').attach(vscode,context,getProject,ensure);
  require('./filter-editor.cjs').attach(vscode,context,getProject,ensure);
  const watcher = vscode.workspace.createFileSystemWatcher('**/*');
  function change(uri) {
    // Config rediscovery briefly clears the active project. Keep using the
    // indexed project during that gap so saved-file events are not dropped.
    const project = getProject() || cached?.project;
    if(project && path.resolve(uri.fsPath).toLowerCase()===path.join(project.root,'bedrock-project.json').toLowerCase()) {
      dirty=true;clearTimeout(timer);timer=setTimeout(()=>{void ensure().then(()=>{for(const document of vscode.workspace.textDocuments)validate(document);});},500);return;
    }
    if (project && path.resolve(uri.fsPath).toLowerCase() === path.join(project.root, '.bedrock/reference/components.json').toLowerCase()) { vanillaKey = undefined; dirty=true; void ensure().then(()=>{for(const document of vscode.workspace.textDocuments)validate(document);}); return; }
    if (!project || !content.fileKind(project, uri.fsPath)) return;
    dirty = true; pendingFiles.add(uri.fsPath); clearTimeout(timer);
    timer = setTimeout(() => { void ensure().then(() => { for (const document of vscode.workspace.textDocuments) validate(document); }); }, 500);
  }
  context.subscriptions.push(watcher, watcher.onDidCreate(change), watcher.onDidChange(change), watcher.onDidDelete(change), { dispose() { disposed = true; clearTimeout(timer); } });
}
module.exports = { attach };
