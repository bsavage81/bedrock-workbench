const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const core = require('../src/core.cjs');
(async () => {
  await fs.rm(path.resolve('HOST_VERIFICATION.json'), { force: true });
  const base = path.resolve('.test-temp'); await fs.mkdir(base, { recursive: true });
  const root = await fs.mkdtemp(path.join(base, 'host-project-'));
  for (const [folder, type] of [['BP', 'data'], ['RP', 'resources']]) {
    await fs.mkdir(path.join(root, folder));
    await core.writeJson(path.join(root, folder, 'manifest.json'), { format_version: 2, header: { name: 'Host test', description: 'Test', uuid: randomUUID(), version: [1, 0, 0], min_engine_version: [1, 21, 0] }, modules: [{ uuid: randomUUID(), type, version: [1, 0, 0] }] });
  }
  const config = await core.initialize(root);
  config.targetVersion = '1.26.50';
  const destination = path.join(root, 'fake-minecraft/com.mojang'); await fs.mkdir(destination, { recursive: true });
  config.build.destinations = { release: destination, preview: destination };
  await core.writeJson(path.join(root, 'bedrock-project.json'), config);
  // Prepare bundled data before starting VS Code: thousands of cache-file
  // events must not race the separate pack-file watcher regression checks.
  await require('../src/official-schemas.cjs').prepare(await core.loadProject(root));
  await core.writeJson(path.join(root, '.bedrock/reference/components.json'), { intelligenceVersion: 2, vanilla: { item: ['minecraft:diamond'] }, commands: { command_enums: [], commands: [{ name: 'give', description: 'Give an item', overloads: [{ params: [{ name: 'player', type: { name: 'SELECTION' } }, { name: 'item', type: { name: 'ITEM' } }] }] }] }, tag: 'v1.26.50.4', engine: '1.26.50', target: config.targetVersion, updated: Date.now(), components: {
    block: { 'minecraft:friction': { type: 'number', description: 'Controls block friction.', fields: {} } }, entity: {}, item: {}
  } });
  await core.writeJson(path.join(root, '.bedrock/experiments/catalog.json'), { formatVersion: 1, revision: 1, updated: Date.now(), latestRelease: '1.21.0', definitions: [{ id: 'betaApis', label: 'Beta APIs' }, { id: 'upcomingCreatorFeatures', label: 'Upcoming Creator Features' }], removed: [], events: [] });
  await core.writeJson(path.join(root, '.bedrock/experiments/state.json'), { reviewed: ['betaApis', 'upcomingCreatorFeatures'], retirementNotices: [] });
  await fs.writeFile(path.join(base, 'host-project-path.txt'), root);
  console.log(root);
})().catch(e => { console.error(e); process.exitCode = 1; });
