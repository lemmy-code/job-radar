const test = require('node:test');
const assert = require('node:assert/strict');
const { score, normalise, rank, PROFILE } = require('../src/scorer');

const good = 'Backend Engineer at Acme. Node.js and TypeScript services on AWS with PostgreSQL. Remote from anywhere in Europe.';

test('a matching backend role scores high and explains why', () => {
  const r = score('Backend Engineer', good);
  assert.ok(r.s >= 60, `expected >= 60, got ${r.s}`);
  assert.match(r.why, /node/);
  assert.match(r.why, /geo:/);
});

test('a 5+ years experience bar is a hard block', () => {
  const r = score('Backend Engineer', good + ' Requirements: 5+ years of experience with Node.');
  assert.equal(r.s, 0);
  assert.match(r.why, /^blocked/);
});

test('"US only" and "EU-based candidates" are hard blocks', () => {
  assert.equal(score('Backend Engineer', good + ' This role is US only.').s, 0);
  assert.equal(score('Backend Engineer', good + ' Open to EU-based candidates only.').s, 0);
});

test('management and other-stack titles are blocked at the title level', () => {
  assert.equal(score('Engineering Manager', good).s, 0);
  assert.equal(score('Senior Java Engineer', good).s, 0);
  assert.equal(score('Python Developer', good).s, 0);
});

test('"JavaScript Developer" is not blocked by the Java rule', () => {
  assert.ok(score('JavaScript Developer', good).s > 0);
});

test('non-engineering titles never score, even with matching text', () => {
  assert.equal(score('Sales Development Representative', good).s, 0);
});

test('senior titles are ranked lower, not excluded', () => {
  const senior = score('Senior Backend Engineer', good).s;
  const mid = score('Backend Engineer', good).s;
  assert.equal(mid - senior, 10);
});

test('normalise recognises all three feeds by shape', () => {
  const remotive = normalise({ jobs: [{ title: 'Backend Engineer', company_name: 'A', url: 'u1', candidate_required_location: 'Europe', description: '<p>Node.js</p>' }] });
  const jobicy = normalise({ jobs: [{ jobTitle: 'Backend Engineer', companyName: 'B', url: 'u2', jobGeo: 'Anywhere', jobDescription: 'Node' }] });
  const remoteok = normalise({ position: 'Backend Engineer', company: 'C', url: 'u3', location: 'Worldwide', tags: ['node'], description: '' });
  const legal = normalise({ legal: 'notice only' });
  assert.equal(remotive[0].source, 'remotive');
  assert.equal(jobicy[0].source, 'jobicy');
  assert.equal(remoteok[0].source, 'remoteok');
  assert.equal(legal.length, 0);
  assert.equal(remotive[0].text.includes('<p>'), false, 'HTML is stripped');
});

test('rank dedupes by URL, drops below-threshold rows, sorts descending, caps at topN', () => {
  const mk = (i, title, text) => ({ title, url: 'u' + i, company: 'c', text });
  const jobs = [mk(1, 'Backend Engineer', good), mk(1, 'Backend Engineer', good), mk(2, 'Office Assistant', good),
    ...Array.from({ length: 30 }, (_, i) => mk(100 + i, 'Node Developer', good))];
  const out = rank(jobs);
  assert.equal(out.length, PROFILE.topN);
  assert.ok(out.every((j) => j.score >= PROFILE.minScore));
  for (let i = 1; i < out.length; i++) assert.ok(out[i - 1].score >= out[i].score);
  assert.equal(out.some((j) => j.title === 'Office Assistant'), false);
  assert.equal(out.some((j) => 'text' in j), false, 'raw text is not carried into the output');
});
