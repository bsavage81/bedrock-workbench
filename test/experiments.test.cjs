const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const updates = require('../src/experiment-updates.cjs');
const WIKI = `== ''Java Edition'' ==
* [[Java Only]]
== ''Bedrock Edition'' ==
=== Gameplay ===
* "[[Villager Trade Rebalancing]]"
** World trades.
* "Nether Spawning Rebalancing"{{upcoming|BE 26.70}}
** Upcoming Nether balance.
=== Add-on creators ===
* "Upcoming Creator Features"
** Creator capabilities.
* "Beta APIs"
** Scripting.
* "Creator World Clocks Features"{{until|BE 26.60}}
** Clocks.
* "Render Dragon Features for Creators" (''[[Minecraft Preview|Preview]]'' only)
** Rendering.
* "New Test Experiment"
** New capability.
=== Removed ===
* Experimental Custom Projectile Features
== History ==
=== ''Java Edition'' ===
{{HistoryLine||1.21|dev=24w18a|Added the "Java Only" experimental toggle.}}
=== ''Bedrock Edition'' ===
{{HistoryLine||26.20|dev=Preview 26.20.23|Added the "Experimental Custom Projectile Features" experimental toggle.}}
{{HistoryLine||26.30|dev=Preview 26.30.29|Removed the "Custom Projectile Features" experimental toggle.}}
{{HistoryLine||26.50|dev=Preview 26.50.20|Added the "Creator World Clocks Features" experimental toggle.|Added a component behind the "Upcoming Creator Features" experiment.}}
{{HistoryLine|bedrock upcoming}}
{{HistoryLine||26.60|dev=Preview 26.60.29|Removed the "Creator World Clocks Features" experimental toggle.}}
{{HistoryLine||26.70|dev=Preview 26.70.20|Added the "Nether Spawning Rebalancing" experimental toggle.}}
==== Timeline ====
`;
const config = (target = 'release', targetVersion = '1.26.52', settings = {}) => ({ target, targetVersion, experimentalGameplay: settings });
test('wiki parser isolates Bedrock, handles links/version annotations and preserves revision provenance', () => {
  const snapshot = updates.parseWiki(WIKI, { revid: 12, timestamp: '2026-10-23T09:00:00Z' });
  assert.equal(snapshot.revision, 12); assert.equal(snapshot.latestRelease, '1.26.50');
  assert.ok(!snapshot.definitions.some(e => e.label === 'Java Only'));
  assert.ok(!snapshot.events.some(e => e.label === 'Java Only'));
  const regular = updates.resolve(snapshot, config());
  assert.ok(regular.some(e => e.id === 'worldClocks' && e.status === 'active'));
  assert.ok(!regular.some(e => e.id === 'renderDragon' || e.id === 'netherSpawning' || e.id === 'customProjectiles'));
  const preview = updates.resolve(snapshot, config('preview', '1.26.70', { worldClocks: true }));
  assert.ok(preview.some(e => e.id === 'worldClocks' && e.status === 'removed'));
  assert.ok(preview.some(e => e.id === 'netherSpawning' && e.status === 'active'));
});
test('historical targets retain switches that were only removed later', () => {
  const snapshot = updates.parseWiki(WIKI);
  assert.ok(updates.resolve(snapshot, config('release', '1.26.20')).some(e => e.id === 'customProjectiles' && e.status === 'active'));
  assert.ok(!updates.resolve(snapshot, config('release', '1.26.30')).some(e => e.id === 'customProjectiles'));
  assert.ok(updates.resolve(snapshot, config('release', '1.26.52', { customProjectiles: true })).some(e => e.id === 'customProjectiles' && e.status === 'removed'));
});
test('unknown page shapes fail without inventing retirements; feature promotions are not experiment retirements', () => {
  assert.throws(() => updates.parseWiki('Missing sections'), /Bedrock/);
  const snapshot = updates.parseWiki(WIKI);
  assert.ok(!snapshot.events.some(e => e.id === 'upcomingCreatorFeatures'));
});
async function fixture(t) {
  const base = path.resolve('.test-temp'); await fs.mkdir(base, { recursive: true });
  const root = await fs.mkdtemp(path.join(base, 'experiment-test-')); t.after(() => fs.rm(root, { recursive: true, force: true })); return root;
}
const response = text => ({ ok: true, body: [Buffer.from(JSON.stringify({ query: { pages: [{ revisions: [{ revid: 12, timestamp: '2026-10-23T09:00:00Z', slots: { main: { content: text } } }] }] } }))] });
test('reference updates cache by revision, respect TTL, and retain a good snapshot offline or after a parser failure', async t => {
  const root = await fixture(t); let calls = 0;
  const fetchImpl = async url => { calls++; assert.equal(url, updates.API); return response(WIKI); };
  const initial = await updates.load(config(), root, { fetchImpl }); assert.equal(initial.revision, 12);
  await updates.load(config(), root, { fetchImpl }); assert.equal(calls, 1);
  const offline = await updates.load(config(), root, { force: true, fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(offline.offline, true); assert.equal(offline.revision, 12);
  const malformed = await updates.load(config(), root, { force: true, fetchImpl: async () => response('Changed page format') });
  assert.equal(malformed.offline, true); assert.equal(malformed.revision, 12);
});
test('review decisions and snooze state persist independently of project settings', async t => {
  const root = await fixture(t); assert.deepEqual((await updates.readState(root)).reviewed, []);
  await updates.saveState(root, { reviewed: ['newExperiment'], retirementNotices: [], snoozedUntil: 123 });
  assert.deepEqual((await updates.readState(root)).reviewed, ['newExperiment']);
});
module.exports.WIKI = WIKI;
