// Integration test: runs the real workflow through the n8n CLI against the live feeds and asserts
// the fetch → score → digest path. The optional AI/Gmail nodes need credentials, so the test imports
// a variant with those two disabled under its own id, executes it, and leaves the main workflow alone.
//   npm run test:integration        (needs n8n installed; the n8n server may be running or not)
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');

const OPTIONAL = new Set(['Summarise top matches', 'Anthropic Chat Model', 'Gmail draft']);
const TEST_ID = 'jobradartest1';
const env = { ...process.env, N8N_RUNNERS_ENABLED: 'false', N8N_RUNNERS_BROKER_PORT: '5699' };
const n8n = (args) => spawnSync('n8n', args, { env, encoding: 'utf8', maxBuffer: 64 << 20 });

const wf = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'job-radar.workflow.json'), 'utf8'));
wf.id = TEST_ID; wf.name = 'job-radar (integration test)'; wf.active = false;
for (const n of wf.nodes) if (OPTIONAL.has(n.name)) n.disabled = true;
for (const n of wf.nodes) if (n.webhookId) n.webhookId = '00000000-0000-4000-8000-00000000test';
const tmp = path.join(os.tmpdir(), 'job-radar.integration.json');
fs.writeFileSync(tmp, JSON.stringify(wf));

const imp = n8n(['import:workflow', `--input=${tmp}`]);
assert.equal(imp.status, 0, 'import failed: ' + (imp.stdout + imp.stderr).slice(-400));

const ex = n8n(['execute', '--id', TEST_ID]);
const out = ex.stdout;
// The CLI pretty-prints the run data after a banner line; on failure it prints only the error.
const start = out.indexOf('\n{', out.indexOf('Execution was successful'));
assert.ok(out.includes('Execution was successful') && start > 0, 'workflow did not succeed:\n' + out.slice(-800));
const json = JSON.parse(out.slice(start));
assert.ok(!json.data.resultData.error, 'workflow failed at ' + json.data.resultData.lastNodeExecuted + ': ' + (json.data.resultData.error || {}).message);
const run = json.data.resultData.runData;

for (const feed of ['Remotive', 'RemoteOK', 'Jobicy']) assert.ok(run[feed], `${feed} node did not run`);
const scored = run['Normalise + score'].at(-1).data.main[0].map((i) => i.json);
assert.ok(scored.length > 0, 'scorer produced no rows');
for (const j of scored) {
  assert.ok(j.title && j.url && typeof j.score === 'number' && j.why, 'row missing fields: ' + JSON.stringify(j));
  assert.ok(j.score >= 30);
  assert.ok(!('text' in j), 'raw text leaked into output');
}
for (let i = 1; i < scored.length; i++) assert.ok(scored[i - 1].score >= scored[i].score, 'not sorted');
const digest = run['Build digest'].at(-1).data.main[0][0].json;
assert.equal(digest.count, scored.length);
console.log(`integration OK — ${scored.length} scored rows, top: [${scored[0].score}] ${scored[0].title} — ${scored[0].company}`);
