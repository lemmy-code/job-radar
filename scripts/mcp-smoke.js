// MCP smoke test against the running server: initialize → tools/list → tools/call.
//   n8n start (workflow active) && npm run test:mcp
const assert = require('node:assert/strict');
const URL_ = process.env.JOB_RADAR_MCP_URL || 'http://localhost:5678/mcp/job-radar';
let session;
async function rpc(body) {
  const res = await fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(session ? { 'mcp-session-id': session } : {}) }, body: JSON.stringify(body) });
  session = res.headers.get('mcp-session-id') || session;
  const text = await res.text();
  const line = text.split('\n').find((l) => l.startsWith('data: ')) || text;
  return { status: res.status, json: line.startsWith('data: ') ? JSON.parse(line.slice(6)) : (text ? JSON.parse(text) : null) };
}
(async () => {
  const init = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'smoke', version: '1' } } });
  assert.equal(init.status, 200); assert.ok(init.json.result.capabilities.tools, 'server does not advertise tools'); assert.ok(session, 'no session id');
  await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' });
  const list = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const names = list.json.result.tools.map((t) => t.name);
  for (const n of ['search_remote_jobs', 'latest_remoteok_jobs', 'top_jobs', 'score_job']) assert.ok(names.includes(n), `missing tool ${n}`);
  const call = await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'search_remote_jobs', arguments: { input: JSON.stringify({ search: 'node.js' }) } } });
  const text = call.json.result.content[0].text;
  assert.ok(!/ZodError|error/i.test(text.slice(0, 40)), 'tool returned an error: ' + text.slice(0, 120));
  const rows = JSON.parse(text);
  assert.ok((Array.isArray(rows) ? rows : rows.jobs).length > 0, 'tool returned no jobs');
  // score_job: a matching posting scores, a blocked one returns 0 with the blocking rule.
  const good = await rpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'score_job', arguments: { title: 'Backend Engineer', description: 'Node.js, TypeScript, PostgreSQL on AWS. Remote from anywhere in Europe.' } } });
  const g = JSON.parse(good.json.result.content[0].text)[0];
  assert.ok(g.score >= 60 && g.verdict === 'worth a look', 'score_job good case: ' + JSON.stringify(g));
  const bad = await rpc({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'score_job', arguments: { title: 'Senior Java Engineer', description: '8+ years of experience. US only.' } } });
  const b = JSON.parse(bad.json.result.content[0].text)[0];
  assert.ok(b.score === 0 && /blocked/.test(b.why), 'score_job blocked case: ' + JSON.stringify(b));
  // top_jobs: live ranked list, every row above the threshold, sorted.
  const top = await rpc({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'top_jobs', arguments: { min_score: 60 } } });
  const ranked = JSON.parse(top.json.result.content[0].text)[0].data;
  assert.ok(ranked.length > 0, "top_jobs returned nothing");
  for (let i = 0; i < ranked.length; i++) { assert.ok(ranked[i].score >= 60); if (i) assert.ok(ranked[i - 1].score >= ranked[i].score); }
  console.log(`mcp OK — tools: ${names.join(', ')}; score_job good=${g.score} blocked=${b.score}; top_jobs(60) → ${ranked.length} rows, top [${ranked[0].score}] ${ranked[0].title}`);
})().catch((e) => { console.error('mcp FAILED:', e.message); process.exit(1); });
