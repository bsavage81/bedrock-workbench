// One-time migration of the verified workspace copy. Never edits the original.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '../projects/SavageCraft v2');
const workspace = path.resolve(__dirname, '..');
if (!root.startsWith(workspace + path.sep)) throw new Error('Copy must be inside workspace');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const write = (file, value) => fs.writeFileSync(path.join(root, file), JSON.stringify(value, null, 2) + '\n');
if (fs.existsSync(path.join(root, 'bedrock-project.json'))) throw new Error('Already migrated');
const originalConfig = read('config.json');
const manifests = { behavior: read('BP/manifest.json'), resource: read('RP/manifest.json') };
const profiles = {};
for (const profile of ['beta', 'stable']) {
  profiles[profile] = {
    title: originalConfig.name + (profile === 'beta' ? ' Beta' : ''),
    identities: Object.fromEntries(Object.entries(manifests).map(([key, manifest]) => [key, {
      header: profile === 'stable' ? manifest.header.uuid : randomUUID(),
      modules: manifest.modules.map(module => profile === 'stable' ? module.uuid : randomUUID())
    }]))
  };
}
write('bedrock-project.json', {
  formatVersion: 1,
  name: originalConfig.name,
  namespace: originalConfig.namespace,
  description: originalConfig.description,
  authors: originalConfig.authors,
  version: manifests.behavior.header.version,
  target: 'release',
  targetVersion: originalConfig.targetVersion,
  experimentalGameplay: originalConfig.experimentalGameplay,
  packs: { behavior: 'BP', resource: 'RP' },
  build: { autoDeploy: false, output: '.bedrock/build', exports: '.bedrock/exports' },
  profiles
});
for (const [key, file] of [['behavior', 'BP/manifest.json'], ['resource', 'RP/manifest.json']]) {
  const manifest = manifests[key];
  if (manifest.metadata?.generated_with) {
    delete manifest.metadata.generated_with.bridge;
    delete manifest.metadata.generated_with.dash;
    if (!Object.keys(manifest.metadata.generated_with).length) delete manifest.metadata.generated_with;
  }
  write(file, manifest);
}
const removals = ['.bridge', '.tmp/brarchive', 'deno.json', 'config.json'];
for (const relative of removals) {
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep)) throw new Error('Unsafe deletion target');
  // Check the final resolved target stays within the named copy, including links.
  if (fs.existsSync(target)) {
    const resolved = fs.realpathSync(target);
    if (!resolved.startsWith(fs.realpathSync(root) + path.sep)) throw new Error('Target escapes copy');
    fs.rmSync(target, { recursive: true, force: true });
  }
}
fs.writeFileSync(path.join(root, '.gitignore'), 'Desktop.ini\n.DS_Store\n.bedrock/\nnode_modules/\n');
write('MIGRATION_REPORT.json', {
  date: '2026-10-23',
  source: 'C:\\Users\\beauj\\AppData\\Local\\com.bridge.dev\\bridge\\projects\\SavageCraft v2',
  sourceUnmodified: true,
  removed: removals,
  edited: ['BP/manifest.json', 'RP/manifest.json', '.gitignore'],
  created: ['bedrock-project.json'],
  notes: [
    'Source and copy verified by SHA-256 before migration.',
    'Manifest edits remove bridge/Dash generator metadata only; all UUIDs and dependencies are preserved.',
    'Stable profile retains existing identities; beta identities generated once and persisted.',
    'Project configuration is a draft contract for the new extension; no compiler exists yet.',
    'Automatic deployment disabled until the compiler and deployment ownership checks are implemented.',
    'Artwork, backups, reviews, reference material and project tools preserved.',
    'Historical documents and utility scripts may retain original source paths. Audit before executing.',
    'Existing VS Code settings are unrelated to bridge and were preserved.'
  ]
});
console.log('Migrated workspace copy; original unchanged.');
