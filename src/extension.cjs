const vscode = require('vscode');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const core = require('./core.cjs');
const releases = require('./releases.cjs');
const scripts = require('./scripts.cjs');
const experiments = require('./experiments.cjs');
const experimentUpdates = require('./experiment-updates.cjs');

function activate(context) {
  const output = vscode.window.createOutputChannel('Bedrock Workbench', { log: true });
  const diagnostics = vscode.languages.createDiagnosticCollection('bedrock');
  const validationDiagnostics = vscode.languages.createDiagnosticCollection('bedrock-validation');
  const changed = new vscode.EventEmitter();
  let root, project, timer, queue = Promise.resolve(), disposed = false, status = 'Ready', autoQueued = false, autoAgain = false;
  let openedRoot, releaseCheck;
  let scriptOpenedKey, scriptCheck;
  let experimentCatalog, experimentKey, experimentTask, experimentTimer;
  function experimentItems(config) {
    const items = experimentCatalog ? experimentUpdates.resolve(experimentCatalog, config) : experiments.available(config).map(e => {
      const known = experiments.catalog.find(entry => entry.id === e.id);
      const retired = known?.until && releases.compareVersions(config.targetVersion, known.until) >= 0;
      return { ...e, status: retired ? 'removed' : e.legacy ? 'unknown' : 'active' };
    });
    const known = new Set(items.map(e => e.id));
    for (const id of Object.keys(config.experimentalGameplay || {})) if (!known.has(id)) items.push({ id, label: experiments.catalog.find(e => e.id === id)?.label || id, status: 'unknown', description: 'Saved requirement not verified for this target. It has been preserved.' });
    return items;
  }
  const editor = require('./editor.cjs').attach(vscode, context, () => project && ({ ...project, root }), output);
  require('./content-editor.cjs').attach(vscode, context, () => project && ({ ...project, root }), output);
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 30);
  statusBar.command = 'bedrock.build';
  const refresh = () => { statusBar.text = `$(package) Bedrock: ${status}`; statusBar.show(); changed.fire(); };
  const item = (label, command, icon, description) => { const node = new vscode.TreeItem(label); node.description = description; if (command) { node.command = { command, title: label }; node.id = command; } if (icon) node.iconPath = new vscode.ThemeIcon(icon); return node; };
  function section(key, label, icon, description, expanded = false) {
    const node = item(label, undefined, icon, description);
    node.id = `bedrock.section.${key}`;
    node.section = key;
    // Stable IDs let VS Code retain the user's expanded/collapsed state when
    // build status, project settings or icon thumbnails refresh the tree.
    node.collapsibleState = expanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed;
    return node;
  }
  async function packIconItem(kind) {
    const bp = kind === 'behavior', file = path.join(project.packs[kind], 'pack_icon.png');
    const bytes = await fs.readFile(file).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    const node = item(`${bp ? 'BP' : 'RP'} pack icon`, bp ? 'bedrock.iconBP' : 'bedrock.iconRP', 'file-media', bytes ? 'pack_icon.png' : 'Not selected');
    // A changed URI bypasses VS Code's image cache even when path, size and
    // timestamp stay the same after replacing pack_icon.png.
    if (bytes) node.iconPath = vscode.Uri.file(file).with({ query: `icon=${createHash('sha256').update(bytes).digest('hex')}` });
    node.tooltip = `Choose a PNG to copy to ${file}. Beta builds grayscale it during compilation.`;
    return node;
  }
  const tree = {
    onDidChangeTreeData: changed.event,
    getTreeItem: node => node,
    getChildren: async node => {
      if (!project) return [];
      const { config } = project;
      if (node) {
        switch (node.section) {
          case 'settings': {
            const folder = item('Minecraft folder', 'bedrock.destination', 'folder-opened', config.build.destinations?.[config.target] ? 'Custom' : 'Automatic');
            folder.tooltip = config.build.destinations?.[config.target] || 'Automatically detect the selected Minecraft installation.';
            return [item('Minecraft installation', 'bedrock.target', 'versions', config.target === 'release' ? 'Release' : 'Preview'), folder, item('Target engine version', 'bedrock.checkTargetVersion', 'check', config.targetVersion), item('Beta Script APIs', 'bedrock.betaScripts', 'beaker', config.experimentalGameplay?.betaApis ? 'On' : 'Off'), item('Refresh Mojang reference', 'bedrock.refreshReference', 'book')];
          }
          case 'scripts': {
            const dependencies = await scripts.readDependencies({ ...project, root });
            return [...dependencies.map(entry => item(entry.name, 'bedrock.checkScriptVersions', 'library', `${entry.current} (${entry.kind === 'behavior' ? 'BP' : 'RP'})`)), item('Check script versions', 'bedrock.checkScriptVersions', 'check'), item('Add script dependency', 'bedrock.addScriptDependency', 'add'), item('Install matching typings', 'bedrock.installScriptTypings', 'cloud-download')];
          }
          case 'experiments': return [...experimentItems(config).map(experiment => {
            const retired = experiment.status === 'removed';
            const node = item(experiment.label, retired ? undefined : 'bedrock.experiment', 'beaker', retired ? 'Removed (saved requirement)' : `${config.experimentalGameplay?.[experiment.id] ? 'On' : 'Off'}${experiment.status === 'deprecated' ? ' (deprecated)' : experiment.status === 'unknown' ? ' (unverified)' : ''}`);
            node.id = `bedrock.experiment.${experiment.id}`; node.experimentId = experiment.id;
            if (!retired) {
              node.command.arguments = [experiment.id];
              if (vscode.TreeItemCheckboxState) node.checkboxState = config.experimentalGameplay?.[experiment.id] ? vscode.TreeItemCheckboxState.Checked : vscode.TreeItemCheckboxState.Unchecked;
            }
            node.tooltip = `${experiment.description}\nTracks project requirements. Enable the corresponding experiment in Minecraft world settings.\n${experiment.source || 'Bundled reference; awaiting online verification.'}`;
            return node;
          }), item('Check experiments', 'bedrock.checkExperiments', 'refresh'), item('Experiment reference', 'bedrock.experimentReference', 'link-external')];
          case 'icons': return [await packIconItem('behavior'), await packIconItem('resource')];
          case 'beta': return [item('Auto deploy', 'bedrock.autoDeploy', 'sync', config.build.autoDeploy ? 'On' : 'Off'), item('Build beta', 'bedrock.build', 'tools'), item('Deploy beta', 'bedrock.deploy', 'debug-start')];
          case 'stable': return [item('Deploy stable', 'bedrock.deployStable', 'cloud-upload'), item('Export .mcaddon', 'bedrock.export', 'export')];
          case 'tools': return [item('Validate project', 'bedrock.validate', 'checklist'), item('Bump version', 'bedrock.version', 'arrow-up'), item('Extension tracker', 'bedrock.tracker', 'checklist')];
          default: return [];
        }
      }
      const bpIcon = await packIconItem('behavior'), rpIcon = await packIconItem('resource');
      const projectItem = item(config.name, 'bedrock.settings', 'package', config.version.join('.'));
      if (bpIcon.iconPath?.scheme === 'file') projectItem.iconPath = bpIcon.iconPath;
      else if (rpIcon.iconPath?.scheme === 'file') projectItem.iconPath = rpIcon.iconPath;
      projectItem.tooltip = 'Open project settings. Project icon uses BP pack_icon.png, falling back to RP.';
      const buildStatus = item(status, undefined, 'info'); buildStatus.id = 'bedrock.status';
      return [projectItem, buildStatus,
        section('settings', 'Settings', 'settings-gear', config.target === 'release' ? 'Release' : 'Preview'),
        section('icons', 'Pack icons', 'file-media', 'BP / RP'),
        section('scripts', 'Script dependencies', 'code'),
        section('experiments', 'World experiments', 'beaker', 'Project requirements'),
        section('beta', 'Beta development', 'beaker', `Auto deploy ${config.build.autoDeploy ? 'On' : 'Off'}`, true),
        section('stable', 'Stable releases', 'package', undefined, true),
        section('tools', 'Project tools', 'tools')];
    }
  };
  async function discover() {
    project = undefined;
    const folders = vscode.workspace.workspaceFolders || [];
    const candidates = [];
    for (const folder of folders) if (folder.uri.scheme === 'file' && await core.exists(path.join(folder.uri.fsPath, 'bedrock-project.json'))) candidates.push(folder.uri.fsPath);
    if (candidates.length > 1) throw new Error('Open one Bedrock project per VS Code window in this version');
    root = candidates[0];
    if (root) { await core.migratePackIcons(root); project = await core.loadProject(root); }
    status = project ? 'Ready' : 'Open a Bedrock project'; refresh();
    if (project) void editor.refresh();
    const engineKey = project && `${root}:${project.config.target}`;
    if (engineKey !== openedRoot) { openedRoot = engineKey; if (project) void checkTargetVersion(false); }
    if (project) {
      const key = JSON.stringify([root, project.config.target, project.config.targetVersion, !!project.config.experimentalGameplay?.betaApis]);
      if (key !== scriptOpenedKey) { scriptOpenedKey = key; void checkScriptVersions(false); }
      const keyExperiments = JSON.stringify([root, project.config.target, project.config.targetVersion]);
      if (keyExperiments !== experimentKey) { experimentKey = keyExperiments; experimentCatalog = undefined; void checkExperiments(false); }
    }
  }
  async function checkExperiments(manual = false) {
    if (disposed || !project || !vscode.workspace.isTrusted) return;
    const requestedRoot = root, key = JSON.stringify([root, project.config.target, project.config.targetVersion]);
    if (experimentTask?.key === key) return experimentTask.promise;
    const task = { key };
    task.promise = (async () => {
      try {
        const config = (await core.loadProject(requestedRoot)).config;
        const snapshot = await experimentUpdates.load(config, requestedRoot, { force: manual });
        if (!snapshot || disposed || requestedRoot !== root || key !== JSON.stringify([root, project.config.target, project.config.targetVersion])) return;
        experimentCatalog = snapshot; refresh();
        if (snapshot.offline) output.warn(`Experiment reference is cached: ${snapshot.error}`);
        const state = await experimentUpdates.readState(root);
        const items = experimentItems(config);
        const additions = items.filter(e => e.status === 'active' && !Object.hasOwn(config.experimentalGameplay || {}, e.id) && !(state.reviewed || []).includes(e.id));
        const retired = items.filter(e => e.status === 'removed' && Object.hasOwn(config.experimentalGameplay || {}, e.id));
        const retirementKey = retired.map(e => e.id).sort().join(',');
        if (retired.length && !(state.retirementNotices || []).includes(retirementKey)) {
          const action = await vscode.window.showInformationMessage(`These experiment switches were removed for this target: ${retired.map(e => e.label).join(', ')}. Remove their saved project requirements? Minecraft worlds will not be changed.`, 'Remove retired requirements', 'Keep saved requirements');
          if (disposed || root !== requestedRoot || experimentKey !== key) return;
          let removed = action !== 'Remove retired requirements';
          if (action === 'Remove retired requirements') await enqueue(async () => {
            if (root !== requestedRoot || experimentKey !== key) return;
            const current = (await core.loadProject(root)).config;
            for (const entry of retired) if (current.experimentalGameplay) delete current.experimentalGameplay[entry.id];
            await saveConfig(current);
            removed = true;
          });
          if (!removed) return;
          if (action) { state.retirementNotices ||= []; state.retirementNotices.push(retirementKey); await experimentUpdates.saveState(requestedRoot, state); }
        }
        if (additions.length && (manual || Date.now() >= (state.snoozedUntil || 0))) {
          const choice = await vscode.window.showInformationMessage(`New experiments are available for this project: ${additions.map(e => e.label).join(', ')}. Choose any to enable as project requirements? Enable their switches in Minecraft world settings too.`, 'Choose experiments', 'Keep disabled', 'Later');
          if (disposed || root !== requestedRoot || experimentKey !== key) return;
          let selected;
          if (choice === 'Choose experiments') selected = await vscode.window.showQuickPick(additions.map(e => ({ label: e.label, description: e.description, experimentId: e.id, picked: false })), { title: 'Enable experiment requirements', canPickMany: true });
          if (disposed || root !== requestedRoot || experimentKey !== key) return;
          let applied = !Array.isArray(selected) || !selected.length;
          if (Array.isArray(selected) && selected.length) await enqueue(async () => {
            if (root !== requestedRoot || experimentKey !== key) return;
            const current = (await core.loadProject(root)).config; current.experimentalGameplay ||= {};
            for (const entry of selected) if (additions.some(e => e.id === entry.experimentId) && !Object.hasOwn(current.experimentalGameplay, entry.experimentId)) current.experimentalGameplay[entry.experimentId] = true;
            await saveConfig(current);
            applied = true;
            if (current.experimentalGameplay.betaApis !== config.experimentalGameplay?.betaApis) void checkScriptVersions(true);
          });
          if (!applied) return;
          if (choice === 'Keep disabled' || Array.isArray(selected)) state.reviewed = [...new Set([...(state.reviewed || []), ...additions.map(e => e.id)])];
          else state.snoozedUntil = Date.now() + 86400000;
          await experimentUpdates.saveState(requestedRoot, state);
        } else if (manual) await vscode.window.showInformationMessage(snapshot.offline ? 'Using the cached experiment reference. The online check was unavailable.' : 'Experiment list is up to date for this target.');
      } catch (error) {
        output.warn(`Experiment check: ${error.message}`);
        if (manual) await vscode.window.showInformationMessage(`Could not check experiments: ${error.message}. Existing requirements are unchanged.`);
      }
    })().finally(() => { if (experimentTask === task) experimentTask = undefined; });
    experimentTask = task; return task.promise;
  }
  async function checkScriptVersions(manual = false, add) {
    if (disposed || !vscode.workspace.isTrusted || !project) return;
    const requested = await core.loadProject(root);
    const key = JSON.stringify([root, requested.config.target, requested.config.targetVersion, !!requested.config.experimentalGameplay?.betaApis]);
    const taskKey = key + (add || '');
    if (scriptCheck?.key === taskKey) return scriptCheck.promise;
    const task = { key: taskKey };
    task.promise = (async () => {
      try {
        const plan = await scripts.inspect(requested, { add });
        if (disposed || root !== requested.root) return;
        const latest = await core.loadProject(root);
        if (JSON.stringify([root, latest.config.target, latest.config.targetVersion, !!latest.config.experimentalGameplay?.betaApis]) !== key) return;
        const missing = plan.filter(entry => !entry.selected);
        for (const entry of missing) output.warn(`No compatible Script API version found for ${entry.name} at ${requested.config.target} ${requested.config.targetVersion}.`);
        const changes = plan.filter(entry => entry.selected && (entry.current !== entry.selected.runtime || (entry.typingCurrent !== undefined && entry.typingCurrent !== entry.selected.version)));
        if (!changes.length) {
          if (manual) await vscode.window.showInformationMessage(missing.length ? 'Some script dependencies have no compatible version for these settings. See Bedrock Workbench output.' : plan.length ? 'Script dependencies match the selected target and API track.' : 'No script dependencies yet. Use Add script dependency.');
          return;
        }
        const summary = changes.map(entry => `${entry.name}: ${entry.current || 'not added'} → ${entry.selected.runtime} (typings ${entry.selected.version})`).join('; ');
        const choice = await vscode.window.showInformationMessage(`Update script dependencies and install matching npm typings for ${requested.config.target} ${requested.config.targetVersion}? ${summary}. API changes can require script changes.${requested.config.experimentalGameplay?.betaApis ? ' Enable Beta APIs in the Minecraft world.' : ''}`, 'Update dependencies', 'Not now');
        if (choice !== 'Update dependencies' || disposed || root !== requested.root) return;
        await enqueue(async () => {
          if (disposed || root !== requested.root) return;
          requireSavedScriptFiles(); await scripts.apply(requested, changes); project = await core.loadProject(root); refresh();
          output.info(`Script dependencies updated: ${summary}`);
          try {
            const installation = await scripts.installTypings(project, plan.filter(entry => entry.selected).map(entry => ({ ...entry, current: entry.selected.runtime })));
            output.info(installation.stdout || 'Installed matching typings.');
          } catch (error) { throw new Error(`Script manifests were updated, but typings installation failed: ${error.message}`, { cause: error }); }
          if (project.config.build.autoDeploy) await run('deploy');
          void vscode.window.showInformationMessage('Script manifests and matching typings updated.');
        });
      } catch (error) {
        output.warn(`Script dependency check: ${error.message}`);
        if (manual) await vscode.window.showInformationMessage(`Could not check script dependencies: ${error.message}`);
      }
    })().finally(() => { if (scriptCheck === task) scriptCheck = undefined; });
    scriptCheck = task; return task.promise;
  }
  async function checkTargetVersion(manual = false) {
    if (disposed || !vscode.workspace.isTrusted) return;
    if (!project) {
      if (manual) await vscode.window.showInformationMessage('Open a Bedrock project before checking the target version.');
      return;
    }
    const requestedRoot = root;
    const requestedChannel = project.config.target;
    if (releaseCheck?.root === requestedRoot && releaseCheck.target === requestedChannel) return releaseCheck.promise;
    const task = { root: requestedRoot, target: requestedChannel };
    task.promise = (async () => {
      try {
        const release = await releases.getCurrentRelease({ target: requestedChannel });
        if (disposed || root !== requestedRoot) return;
        const current = (await core.loadProject(requestedRoot)).config;
        if (current.target !== requestedChannel) return;
        if (releases.compareVersions(release.version, current.targetVersion) <= 0) {
          if (manual) await vscode.window.showInformationMessage(`Target ${current.targetVersion} is current or newer than the released Minecraft engine ${release.version}.`);
          return;
        }
        const choice = await vscode.window.showInformationMessage(`${current.name} targets Minecraft ${current.targetVersion}. The current ${requestedChannel === 'preview' ? 'Preview' : 'released'} engine is ${release.version}. Increase the project target and both packs' minimum engine versions?`, 'Update target', 'Not now');
        if (choice !== 'Update target' || disposed || root !== requestedRoot) return;
        await enqueue(async () => {
          if (disposed || root !== requestedRoot) return;
          project = await core.loadProject(root);
          if (project.config.target !== requestedChannel) return;
          if (releases.compareVersions(release.version, project.config.targetVersion) <= 0) return;
          requireSavedVersionFiles();
          await core.setProjectTargetVersion(root, release.version);
          project = await core.loadProject(root); refresh(); void editor.refresh();
          output.info(`Updated target engine and source manifests to ${release.version}; source: ${release.source}`);
          if (project.config.build.autoDeploy) await run('deploy');
        });
      } catch (error) {
        output.warn(`Minecraft release check skipped: ${error.message}`);
        if (manual && !disposed && root === requestedRoot) await vscode.window.showInformationMessage('Could not check the current Minecraft release. Your target is unchanged; see Bedrock Workbench output for details.');
      }
    })().finally(() => { if (releaseCheck === task) releaseCheck = undefined; });
    releaseCheck = task;
    return task.promise;
  }
  async function requireProject() { if (!vscode.workspace.isTrusted) throw new Error('Trust this workspace before building'); if (!project) await discover(); if (!project) throw new Error('Open the project folder containing bedrock-project.json'); return project; }
  async function saveConfig(config) {
    const document = vscode.workspace.textDocuments.find(d => d.uri.fsPath === path.join(root, 'bedrock-project.json'));
    if (document?.isDirty) throw new Error('Save project settings before changing them with commands');
    await core.writeJson(path.join(root, 'bedrock-project.json'), config);
    project = await core.loadProject(root); refresh();
  }
  function report(error, interactive) {
    status = 'Build failed'; refresh(); output.error(error.stack || String(error));
    if (error.errors) for (const e of error.errors) if (e.location?.file) {
      const loc = e.location, uri = vscode.Uri.file(path.isAbsolute(loc.file) ? loc.file : path.resolve(root, loc.file));
      const diagnostic = new vscode.Diagnostic(new vscode.Range(Math.max(0, loc.line - 1), loc.column, Math.max(0, loc.line - 1), loc.column + Math.max(loc.length, 1)), e.text, vscode.DiagnosticSeverity.Error);
      diagnostics.set(uri, [...(diagnostics.get(uri) || []), diagnostic]);
    }
    if (interactive) vscode.window.showErrorMessage(`Bedrock: ${error.message}`);
    else statusBar.tooltip = error.message + '\nSee Bedrock Workbench output for details.';
  }
  function enqueue(task, interactive = true) {
    queue = queue.then(async () => { if (disposed) return; try { await task(); } catch (error) { report(error, interactive); } });
    return queue;
  }
  async function destination(config) {
    if (process.platform !== 'win32') throw new Error('Minecraft deployment currently supports Windows');
    const explicit = config.build.destinations?.[config.target];
    if (explicit) return explicit;
    for (const candidate of core.defaultDestinations(config.target)) if (await core.exists(candidate)) return candidate;
    throw new Error('Minecraft folder not found. Run Bedrock: Select Minecraft Folder');
  }
  function requireSavedVersionFiles() {
    const normalize = file => process.platform === 'win32' ? path.resolve(file).toLowerCase() : path.resolve(file);
    const files = new Set([path.join(root, 'bedrock-project.json'), ...Object.values(project.packs).map(pack => path.join(pack, 'manifest.json'))].map(normalize));
    if (vscode.workspace.textDocuments.some(doc => doc.isDirty && files.has(normalize(doc.uri.fsPath)))) throw new Error('Save project settings and both pack manifests before changing the version.');
  }
  function requireSavedScriptFiles() {
    requireSavedVersionFiles();
    const files = new Set(['package.json', 'package-lock.json'].map(name => path.join(root, name).toLowerCase()));
    if (vscode.workspace.textDocuments.some(doc => doc.isDirty && files.has(doc.uri.fsPath.toLowerCase()))) throw new Error('Save package.json and package-lock.json before updating script dependencies.');
  }
  async function manualRun(mode) {
    await requireProject(); project = await core.loadProject(root); requireSavedVersionFiles();
    const value = await vscode.window.showInputBox({
      title: mode === 'export' ? 'Export stable — version' : mode === 'deployStable' ? 'Deploy stable — version' : 'Deploy beta — version',
      value: project.config.version.join('.'),
      prompt: 'Choose the project and pack manifest version (major.minor.patch). It is saved after this action succeeds.',
      validateInput: input => { try { core.parseVersion(input); return undefined; } catch (error) { return error.message; } }
    });
    if (value === undefined) return;
    await run(mode, core.parseVersion(value));
  }
  async function run(mode, selectedVersion) {
    await requireProject(); project = await core.loadProject(root);
    const stable = mode === 'export' || mode === 'deployStable';
    if (selectedVersion) requireSavedVersionFiles();
    const deployTarget = mode === 'deploy' || mode === 'deployStable' ? await destination(project.config) : undefined;
    status = mode === 'export' ? 'Exporting stable…' : stable ? 'Deploying stable…' : 'Building beta…'; refresh(); diagnostics.clear();
    let build;
    try {
      build = await core.compile(root, stable ? 'stable' : 'beta', { version: selectedVersion });
      let result = build.directory;
      if (mode === 'export') result = await core.exportAddon(build);
      if (mode === 'deploy' || mode === 'deployStable') result = (await core.deploy(build, deployTarget)).join('\n');
      for (const warning of build.warnings) output.warn(warning);
      if (selectedVersion) {
        try { requireSavedVersionFiles(); await core.setProjectVersion(root, selectedVersion); project = await core.loadProject(root); }
        catch (error) { throw new Error(`${mode} output was written to ${result}, but project/manifest version synchronization failed: ${error.message}`, { cause: error }); }
      }
      const stateFile = await core.local(root, '.bedrock/state.json');
      const state = await core.readJson(stateFile).catch(() => ({ betaBuild: 0 }));
      if (!stable) state.betaBuild = (state.betaBuild || 0) + 1;
      state.lastBuild = { profile: build.profile, version: build.config.version, date: new Date().toISOString(), result };
      if (stable) state.lastRelease = { ...state.lastBuild, mode };
      if (mode === 'build') {
        // Keep only the last successful manual beta build from this extension.
        const previous = state.betaDirectory;
        state.betaDirectory = build.directory;
        if (previous && previous !== build.directory && core.inside(path.resolve(root, build.config.build.output), previous) && /^beta-[A-Za-z0-9]+$/.test(path.basename(previous))) {
          await core.local(root, path.relative(root, previous));
          await fs.rm(previous, { recursive: true, force: true });
        }
      }
      await core.writeJson(stateFile, state);
      output.info(`${mode} succeeded: ${result}`);
      const completion = stable ? `Stable ${build.config.version.join('.')} ${mode === 'export' ? 'exported' : 'deployed'}` : `Beta build ${state.betaBuild}${mode === 'deploy' ? ' deployed' : ' ready'}`;
      status = completion; refresh();
      if (stable) {
        try { await run(project.config.build.autoDeploy ? 'deploy' : 'build'); }
        catch (error) { throw new Error(`${completion}, and the project/manifests were synchronized, but refreshing beta failed: ${error.message}`, { cause: error }); }
        status = `${completion}; beta synchronized`; refresh();
      }
      if (mode === 'export') {
        void vscode.window.showInformationMessage(`Stable export: ${path.basename(result)}`, 'Show file').then(action => { if (action) return vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(result)); });
      }
    } finally { if (build && mode !== 'build') await fs.rm(build.directory, { recursive: true, force: true }); }
  }
  const register = (name, fn) => context.subscriptions.push(vscode.commands.registerCommand(`bedrock.${name}`, () => enqueue(fn)));
  // Network checks and the user prompt run outside the build queue. Only an
  // approved update is queued, so an unanswered prompt never blocks builds.
  context.subscriptions.push(vscode.commands.registerCommand('bedrock.checkTargetVersion', () => checkTargetVersion(true)));
  context.subscriptions.push(vscode.commands.registerCommand('bedrock.refreshReference', () => editor.refresh(true)));
  context.subscriptions.push(vscode.commands.registerCommand('bedrock.checkScriptVersions', () => checkScriptVersions(true)));
  context.subscriptions.push(vscode.commands.registerCommand('bedrock.addScriptDependency', async () => {
    await requireProject();
    const name = await vscode.window.showQuickPick(['@minecraft/server', '@minecraft/server-ui', '@minecraft/common', '@minecraft/server-admin', '@minecraft/server-net', '@minecraft/server-gametest', '@minecraft/debug-utilities'], { title: 'Add a Script API dependency' });
    if (name) await checkScriptVersions(true, name);
  }));
  async function toggleExperiment(id, enabled) {
    await requireProject(); const { config } = await core.loadProject(root);
    if (!experimentItems(config).some(e => e.id === id && e.status !== 'removed')) throw new Error('Unknown or retired experiment');
    config.experimentalGameplay ||= {}; config.experimentalGameplay[id] = enabled === undefined ? !config.experimentalGameplay[id] : enabled;
    await saveConfig(config);
    if (id === 'betaApis') void checkScriptVersions(true);
  }
  context.subscriptions.push(vscode.commands.registerCommand('bedrock.experiment', id => enqueue(() => toggleExperiment(id))));
  context.subscriptions.push(vscode.commands.registerCommand('bedrock.checkExperiments', () => checkExperiments(true)));
  register('experimentReference', () => vscode.env.openExternal(vscode.Uri.parse(experimentUpdates.SOURCE)));
  register('betaScripts', () => toggleExperiment('betaApis'));
  register('installScriptTypings', async () => {
    await requireProject(); project = await core.loadProject(root); requireSavedScriptFiles();
    const plan = await scripts.inspect(project, { exact: true });
    const result = await scripts.installTypings(project, plan);
    output.info(result.stdout || 'Installed Script API typings.');
    await vscode.window.showInformationMessage('Installed matching Script API typings.');
  });
  register('initialize', async () => {
    const folders = vscode.workspace.workspaceFolders || [];
    if (folders.length !== 1 || folders[0].uri.scheme !== 'file') throw new Error('Open one local folder containing BP and RP');
    if (!vscode.workspace.isTrusted) throw new Error('Trust this workspace first');
    await core.initialize(folders[0].uri.fsPath); await discover();
    await vscode.window.showTextDocument(vscode.Uri.file(path.join(root, 'bedrock-project.json')));
  });
  register('build', () => run('build'));
  register('validate', async () => {
    await requireProject(); validationDiagnostics.clear(); status = 'Validating saved files…'; refresh();
    const result = await require('./validation.cjs').validateProject(root);
    const grouped = new Map(), texts = new Map();
    for (const issue of result.issues) {
      if (!texts.has(issue.file)) texts.set(issue.file, await fs.readFile(issue.file, 'utf8'));
      const text = texts.get(issue.file);
      const position = offset => { const lines = text.slice(0, offset).split('\n'); return new vscode.Position(lines.length - 1, lines.at(-1).length); };
      const diagnostic = new vscode.Diagnostic(new vscode.Range(position(issue.offset), position(issue.offset + issue.length)), issue.message, issue.severity === 'error' ? vscode.DiagnosticSeverity.Error : issue.severity === 'warning' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Information);
      diagnostic.source = 'Bedrock project validation';
      if (!grouped.has(issue.file)) grouped.set(issue.file, []); grouped.get(issue.file).push(diagnostic);
    }
    for (const [file, items] of grouped) validationDiagnostics.set(vscode.Uri.file(file), items);
    status = `Validated ${result.files} files: ${result.issues.filter(issue => issue.severity === 'error').length} errors, ${result.issues.filter(issue => issue.severity === 'warning').length} warnings`; refresh();
    output.info(`${status}; ${result.issues.filter(issue => issue.severity === 'information').length} informational findings. Schemas: ${result.schemaVersion || 'older target; foundational checks'}.`);
    await core.writeJson(await core.local(root, '.bedrock/validation-report.json'), { date: new Date().toISOString(), ...result });
    await vscode.commands.executeCommand('workbench.actions.view.problems');
  });
  register('deploy', () => manualRun('deploy'));
  register('deployStable', () => manualRun('deployStable'));
  register('export', () => manualRun('export'));
  async function selectPackIcon(kind) {
    await requireProject(); project = await core.loadProject(root);
    const bp = kind === 'behavior';
    const selected = await vscode.window.showOpenDialog({ title: `Select ${bp ? 'BP' : 'RP'} pack icon`, openLabel: `Use as ${bp ? 'BP' : 'RP'} icon`, canSelectFiles: true, canSelectFolders: false, canSelectMany: false, filters: { 'PNG images': ['png'] }, defaultUri: vscode.Uri.file(path.join(project.packs[kind], 'pack_icon.png')) });
    if (!selected?.length) return;
    if (selected[0].scheme !== 'file') throw new Error('Choose a PNG image from a local folder.');
    const file = await core.copyPackIcon(root, kind, selected[0].fsPath);
    output.info(`Copied ${kind} pack icon to ${file}`); refresh();
  }
  register('iconBP', () => selectPackIcon('behavior'));
  register('iconRP', () => selectPackIcon('resource'));
  register('refresh', discover);
  register('settings', async () => { await requireProject(); await vscode.window.showTextDocument(vscode.Uri.file(path.join(root, 'bedrock-project.json'))); });
  register('tracker', () => vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.joinPath(context.extensionUri, 'PROJECT_TRACKER.md')));
  register('autoDeploy', async () => { await requireProject(); const { config } = await core.loadProject(root); config.build.autoDeploy = !config.build.autoDeploy; if (config.build.autoDeploy) await destination(config); await saveConfig(config); if (config.build.autoDeploy) await run('deploy'); });
  register('target', async () => { await requireProject(); const choice = await vscode.window.showQuickPick(['release', 'preview'], { title: 'Minecraft installation for this project' }); if (choice) { const { config } = await core.loadProject(root); config.target = choice; await saveConfig(config); } });
  register('destination', async () => { await requireProject(); const selected = await vscode.window.showOpenDialog({ title: `Select ${project.config.target} com.mojang folder`, canSelectFiles: false, canSelectFolders: true, canSelectMany: false }); if (selected) { if (path.basename(selected[0].fsPath).toLowerCase() !== 'com.mojang') throw new Error('Select the com.mojang folder'); const { config } = await core.loadProject(root); config.build.destinations ||= {}; config.build.destinations[config.target] = selected[0].fsPath; await saveConfig(config); } });
  register('version', async () => { await requireProject(); project = await core.loadProject(root); requireSavedVersionFiles(); const choice = await vscode.window.showQuickPick(['patch', 'minor', 'major'], { title: 'Deliberately increment the pack version' }); if (choice) { const { config } = await core.loadProject(root); const index = { major: 0, minor: 1, patch: 2 }[choice]; if (config.version[index] >= 65535) throw new Error('Version component limit reached'); config.version[index]++; for (let i = index + 1; i < 3; i++) config.version[i] = 0; requireSavedVersionFiles(); await core.setProjectVersion(root, config.version); project = await core.loadProject(root); refresh(); } });
  const watcher = vscode.workspace.createFileSystemWatcher('**/*');
  function queueAutoBuild() {
    if (disposed) return;
    if (autoQueued) { autoAgain = true; return; }
    autoQueued = true;
    enqueue(async () => {
      try { await requireProject(); project = await core.loadProject(root); if (project.config.build.autoDeploy) await run('deploy'); }
      finally {
        autoQueued = false;
        if (autoAgain && !disposed) { autoAgain = false; clearTimeout(timer); timer = setTimeout(queueAutoBuild, 500); }
      }
    }, false);
  }
  function onChange(uri) {
    validationDiagnostics.delete(uri);
    if (!root || uri.scheme !== 'file') return;
    const rel = path.relative(root, uri.fsPath).replaceAll(path.sep, '/');
    if (rel === 'bedrock-project.json') { enqueue(discover, false); return; }
    if (!project || !core.inside(root, uri.fsPath)) return;
    const relevant = Object.values(project.packs).some(p => uri.fsPath === p || core.inside(p, uri.fsPath));
    if (!relevant || rel.split('/').some(part => ['.bedrock', '.git', 'node_modules'].includes(part))) return;
    changed.fire();
    if (!project.config.build.autoDeploy) return;
    clearTimeout(timer);
    timer = setTimeout(queueAutoBuild, 500);
  }
  if (vscode.window.createTreeView) {
    const view = vscode.window.createTreeView('bedrock.project', { treeDataProvider: tree, manageCheckboxStateManually: true });
    context.subscriptions.push(view, view.onDidChangeCheckboxState(event => enqueue(async () => {
      for (const [node, checkboxState] of event.items) if (node.experimentId) await toggleExperiment(node.experimentId, checkboxState === vscode.TreeItemCheckboxState.Checked);
    })));
  } else context.subscriptions.push(vscode.window.registerTreeDataProvider('bedrock.project', tree));
  function scheduleExperimentCheck() {
    experimentTimer = setTimeout(() => { void checkExperiments(false); scheduleExperimentCheck(); }, 6 * 60 * 60 * 1000);
    experimentTimer.unref?.();
  }
  scheduleExperimentCheck();
  context.subscriptions.push(output, diagnostics, validationDiagnostics, changed, statusBar, watcher, watcher.onDidCreate(onChange), watcher.onDidChange(onChange), watcher.onDidDelete(onChange), vscode.workspace.onDidChangeWorkspaceFolders(() => enqueue(discover)), { dispose: () => { disposed = true; clearTimeout(timer); clearTimeout(experimentTimer); } });
  enqueue(async () => { await discover(); if (project?.config.build.autoDeploy) await run('deploy'); }, false);
}
module.exports = { activate };
