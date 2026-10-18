const fs = require('fs');
const d = JSON.parse(fs.readFileSync(process.argv[2]));
const S = d.samples;
const wins = [[0, 10], [10, 20], [20, 30], [30, 40], [40, 50], [50, 60], [60, 80]];
const fin = d.fin;
console.log('events', JSON.stringify((fin.events || []).slice ? fin.events.slice(0, 80) : fin.events).slice(0, 3000));
for (const [a, b] of wins) {
  const R = S.filter((r) => r.t >= a * 60 && r.t < b * 60);
  if (!R.length) continue;
  const st = {}, pl = {}, ws = {};
  for (const r of R) {
    for (const id in r.st || {}) { const [i, o] = String(r.st[id]).split('/').map(Number); const q = st[id] || (st[id] = { n: 0, starved: 0, blocked: 0, busy: 0 }); q.n++; if (o >= 36) q.blocked++; else if (i === 0) q.starved++; else q.busy++; }
    for (const k in r.piles || {}) { const q = pl[k] || (pl[k] = { n: 0, full: 0, sum: 0 }); q.n++; q.sum += r.piles[k]; if (r.piles[k] >= 36) q.full++; }
    for (const w of String(r.w || '').split(' ').filter(Boolean)) { const [ty, s] = w.split(':'); const k = ty + ':' + s; ws[k] = (ws[k] || 0) + 1; }
  }
  const last = R[R.length - 1];
  console.log(`--- ${a}-${b} min n=${R.length} earned/min=${Math.round((last.earned - R[0].earned) / ((last.t - R[0].t) / 60 || 1))} agents=${last.agents} built=${last.built} pop=${last.pop}`);
  console.log(' stations', Object.entries(st).map(([k, q]) => `${k} busy${Math.round(100 * q.busy / q.n)}/starv${Math.round(100 * q.starved / q.n)}/blk${Math.round(100 * q.blocked / q.n)}`).join('  '));
  console.log(' piles', Object.entries(pl).map(([k, q]) => `${k} avg${(q.sum / q.n).toFixed(0)} full${Math.round(100 * q.full / q.n)}%`).join('  '));
  const tot = {}; for (const k in ws) { const [ty, s] = k.split(':'); tot[ty] = (tot[ty] || 0) + ws[k]; }
  console.log(' gatherer states', Object.entries(ws).sort().map(([k, v]) => `${k}=${Math.round(100 * v / tot[k.split(':')[0]])}%`).join(' '));
}
