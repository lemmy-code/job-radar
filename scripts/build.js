// Injects src/scorer.js into the "Normalise + score" Code node so the workflow JSON never drifts
// from the tested module. Run after editing the scorer: node scripts/build.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const wf = JSON.parse(fs.readFileSync(path.join(root, 'job-radar.workflow.json'), 'utf8'));
const scorer = fs.readFileSync(path.join(root, 'src/scorer.js'), 'utf8')
  .replace(/module\.exports[^\n]*\n?/, '');            // n8n Code node has no module scope
const body = `${scorer}
// ---- n8n Code node body ----
const jobs = [];
for (const item of $input.all()) jobs.push(...normalise(item.json));
return rank(jobs).map((j) => ({ json: j }));
`;
const node = wf.nodes.find((n) => n.name === 'Normalise + score');
node.parameters.jsCode = body;
fs.writeFileSync(path.join(root, 'job-radar.workflow.json'), JSON.stringify(wf, null, 2) + '\n');
console.log('injected scorer into workflow JSON (' + body.length + ' chars)');
