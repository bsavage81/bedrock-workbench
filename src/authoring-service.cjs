const path = require('node:path');
const { Updater } = require('./authoring-updates.cjs');
function attach(vscode, context, getProject, output, refreshEditors, changed) {
  const updater = new Updater(path.join(context.globalStorageUri.fsPath, 'authoring-data'), {
    onApply: refreshEditors,
    onStatus(state) { if (state.error) output.warn(`Authoring data: ${state.error}`); changed(); }
  });
  let key, disposed = false;
  const enabled = () => vscode.workspace.getConfiguration('bedrock').get('authoringData.autoUpdate', true);
  async function open() {
    const project = getProject(); if (!project || !vscode.workspace.isTrusted) return;
    const next = JSON.stringify([project.root, project.config.target, project.config.targetVersion]);
    if (key !== next) {
      key = next; updater.cancel(); if (updater.pending) await updater.pending;
      await updater.activate(project.config);
    }
    if (enabled() && !disposed) void updater.check(project.config);
  }
  const commands = [
    vscode.commands.registerCommand('bedrock.refreshAuthoringData', async () => { const project = getProject(); if (project && vscode.workspace.isTrusted) await updater.check(project.config, { force: true }); }),
    vscode.commands.registerCommand('bedrock.rollbackAuthoringData', async () => { const project = getProject(); if (project && vscode.workspace.isTrusted) await updater.rollback(project.config); }),
    vscode.commands.registerCommand('bedrock.authoringData', async () => {
      const state = updater.state;
      const action = await vscode.window.showQuickPick([
        { label: `Active: ${state.version} · ${state.channel}`, description: state.source },
        ...(state.error ? [{ label: 'Update unavailable', description: state.error }] : []),
        { label: 'Refresh authoring data', command: 'bedrock.refreshAuthoringData' },
        { label: 'Roll back authoring data', command: 'bedrock.rollbackAuthoringData' }
      ], { title: 'Bedrock authoring data' });
      if (action?.command) await vscode.commands.executeCommand(action.command);
      return { ...updater.state };
    })
  ];
  const timer = setInterval(() => { if (!disposed) void open().catch(error => output.warn(`Authoring data: ${error.message}`)); }, 30 * 60000); timer.unref?.();
  context.subscriptions.push(...commands, { dispose() { disposed = true; clearInterval(timer); updater.dispose(); } });
  return { open, updater, description: () => `${updater.state.version} · ${updater.state.channel} · ${updater.state.source}${updater.state.channel === 'bundled' && updater.state.requestedChannel ? ` (${updater.state.requestedChannel} requested)` : ''}${updater.state.error ? ' · update unavailable' : ''}` };
}
module.exports = { attach };
