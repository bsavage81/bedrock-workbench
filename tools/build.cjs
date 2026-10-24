const core = require('../src/core.cjs');
const fs = require('node:fs/promises');
(async () => {
  const root = process.argv[2], profile = process.argv[3] || 'beta';
  if (!root) throw new Error('Usage: node tools/build.cjs PROJECT [beta|stable]');
  const build = await core.compile(root, profile);
  try { console.log(profile === 'stable' ? await core.exportAddon(build) : build.directory); }
  finally { if (profile === 'stable') await fs.rm(build.directory, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
