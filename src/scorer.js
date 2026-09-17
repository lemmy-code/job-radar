// Pure scoring logic — no n8n dependencies, so it can be unit-tested and reused.
// The n8n Code node body is generated from this file by scripts/build.js.

const PROFILE = {
  // Must read as an engineering seat before anything else counts.
  titleGate: /\b(developer|engineer|programmer|architect)\b/i,
  stack: [/\bnode(\.js)?\b/i, /typescript/i, /backend|back-end/i, /postgres/i, /\baws\b|azure/i,
    /\bllm\b|\bmcp\b|agentic|gen(erative)?\s*ai|ai[- ](engineer|integration|native|agent)/i, /react|next\.js/i, /full[- ]?stack/i],
  geoGood: [/anywhere|worldwide|global/i, /europe|emea|\bcet\b/i, /serbia|belgrade|novi sad/i],
  // Title-level: roles that are not an individual-contributor backend seat.
  titleBlock: [/\b(manager|lead|head|director|principal|staff|vp|cto)\b/i,
    /\b(ios|android|mobile|qa|devops|sre|data engineer|ml engineer)\b/i,
    /\b(java|c#|\.net|golang|go|php|ruby|python)\b(?!script)/i],
  // Body-level hard blockers: years bars the profile cannot meet, residency clauses.
  bodyBlock: [/\b([5-9]|1\d)\+?\s*(years|yrs)\b[^.]{0,40}\b(experience|exp)\b/i,
    /\bus[- ]only\b|united states only|must be (located|based) in the (us|eu)\b/i,
    /eu[- ]based candidates|eligible to work in the eu/i],
  minScore: 30,
  topN: 15,
};

const strip = (h) => (h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

function score(title, text) {
  if (!PROFILE.titleGate.test(title)) return { s: 0, why: 'not an engineering title' };
  for (const b of PROFILE.titleBlock) if (b.test(title)) return { s: 0, why: 'title-blocked: ' + b.source.slice(0, 25) };
  for (const b of PROFILE.bodyBlock) if (b.test(text)) return { s: 0, why: 'blocked: ' + b.source.slice(0, 25) };
  let s = 0; const why = [];
  for (const r of PROFILE.stack) if (r.test(text)) { s += 15; why.push(r.source.replace(/\\b/g, '').slice(0, 14)); }
  for (const g of PROFILE.geoGood) if (g.test(text)) { s += 10; why.push('geo:' + g.source.slice(0, 12)); }
  if (/\b(senior|sr\.?)\b/i.test(title)) s -= 10; // apply anyway, rank lower
  return { s, why: why.join(', ') };
}

// One shape for every feed. Each feed is recognised by its own fields.
function normalise(json) {
  const out = [];
  if (Array.isArray(json.jobs) && json.jobs[0] && json.jobs[0].jobTitle) { // Jobicy
    for (const j of json.jobs) out.push({ source: 'jobicy', title: j.jobTitle, company: j.companyName, url: j.url,
      location: j.jobGeo, posted: j.pubDate, text: `${j.jobTitle} ${j.companyName} ${j.jobGeo} ${strip(j.jobDescription)}` });
  } else if (Array.isArray(json.jobs)) {                                    // Remotive
    for (const j of json.jobs) out.push({ source: 'remotive', title: j.title, company: j.company_name, url: j.url,
      location: j.candidate_required_location, posted: j.publication_date,
      text: `${j.title} ${j.company_name} ${j.candidate_required_location} ${strip(j.description)}` });
  } else if (json.position) {                                               // RemoteOK (row 0 is a legal notice)
    out.push({ source: 'remoteok', title: json.position, company: json.company, url: json.url, location: json.location,
      posted: json.date, text: `${json.position} ${json.company} ${json.location} ${(json.tags || []).join(' ')} ${strip(json.description)}` });
  }
  return out;
}

function rank(jobs) {
  const seen = new Set();
  return jobs
    .filter((j) => j.title && j.url && !seen.has(j.url) && seen.add(j.url))
    .map((j) => { const { s, why } = score(j.title, j.text); const { text, ...rest } = j; return { ...rest, score: s, why }; })
    .filter((j) => j.score >= PROFILE.minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, PROFILE.topN);
}

module.exports = { PROFILE, score, normalise, rank, strip };
