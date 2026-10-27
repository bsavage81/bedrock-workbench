// Test preload: run existing project/format regressions with candidate data.
const fs = require('node:fs'), path = require('node:path');
const directory = process.env.BEDROCK_CANDIDATE_DIRECTORY;
if (!directory) throw Error('Missing private candidate directory');
const updates = require('../src/authoring-updates.cjs'), data = require('../src/authoring-data.cjs');
const entry = JSON.parse(fs.readFileSync(path.join(directory, 'entry.json'))), bytes = fs.readFileSync(path.join(directory, 'snapshot.json'));
if (updates.sha256(bytes) !== entry.sha256) throw Error('Candidate checksum changed before regressions');
data.apply(updates.validateSnapshot(updates.safeJson(bytes), entry), entry.id);
