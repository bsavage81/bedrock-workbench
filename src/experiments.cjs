const { compareVersions } = require('./releases.cjs');
const catalog = [
  { id: 'betaApis', label: 'Beta APIs', description: 'Select beta Script API dependencies and typings. Enable Beta APIs in the Minecraft world too.' },
  { id: 'upcomingCreatorFeatures', label: 'Upcoming Creator Features', description: 'Upcoming add-on features and component capabilities.' },
  { id: 'creatorCameras', label: 'Experimental Creator Camera Features', description: 'Experimental custom camera features.' },
  { id: 'villagerTradeRebalancing', label: 'Villager Trade Rebalancing', description: 'Experimental villager trades.' },
  { id: 'voxelShapes', label: 'Experimental Voxel Shape Features', since: '1.26.10', description: 'Experimental voxel shapes for vanilla and custom blocks.' },
  { id: 'worldClocks', label: 'Creator World Clocks Features', since: '1.26.50', until: '1.26.60', description: 'Experimental creator world clocks.' },
  { id: 'pointsOfInterest', label: 'Points of Interest (POI)', since: '1.26.50', description: 'Custom points of interest for locate and scripting.' },
  { id: 'renderDragon', label: 'Render Dragon Features for Creators', preview: true, description: 'Experimental rendering features; compatible hardware and resource packs required.' },
  { id: 'netherSpawning', label: 'Nether Spawning Rebalancing', preview: true, since: '1.26.70', description: 'Experimental Nether mob spawning balance.' },
  { id: 'drop4of2026', label: 'Drop 4 of 2026', preview: true, since: '1.26.60', until: '1.26.70', description: 'Upcoming gameplay features for the fourth 2026 drop.' },
  { id: 'customBiomes', label: 'Custom Biomes', until: '1.21.111', description: 'Legacy custom biome experiment.' },
  { id: 'customProjectiles', label: 'Experimental Custom Projectile Features', since: '1.26.20', until: '1.26.30', description: 'Retired custom projectile experiment; modern targets do not require this switch.' },
  { id: 'jigsawStructures', label: 'Data-Driven Jigsaw Structures', since: '1.21.80', until: '1.21.120', description: 'Legacy data-driven jigsaw structure experiment.' },
  { id: 'customComponentsV2', label: 'Custom Components V2', since: '1.21.80', until: '1.21.90', description: 'Legacy custom component experiment; no longer needed by modern targets.' }
];
function available(config) {
  const supported = catalog.filter(e => (!e.preview || config.target === 'preview') && (!e.since || compareVersions(config.targetVersion, e.since) >= 0) && (!e.until || compareVersions(config.targetVersion, e.until) < 0));
  const known = new Set(supported.map(e => e.id));
  for (const id of Object.keys(config.experimentalGameplay || {})) if (!known.has(id)) supported.push({ id, label: catalog.find(e => e.id === id)?.label || id, description: 'Saved project requirement; availability may differ for this target.', legacy: true });
  return supported;
}
function normalize(settings = {}) {
  const result = { ...settings };
  for (const [old, key] of Object.entries({ creationOfCustomBiomes: 'customBiomes', experimentalCreatorCameraFeatures: 'creatorCameras', enableGameTestFramework: 'betaApis', dataDrivenJigsawStructures: 'jigsawStructures', renderDragonFeatures: 'renderDragon' })) {
    if (result[key] === undefined && result[old] !== undefined) result[key] = result[old];
    delete result[old];
  }
  return result;
}
module.exports = { catalog, available, normalize };
