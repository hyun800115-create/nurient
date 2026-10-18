// station / pile states from census rows (10 s samples): st[id] = [in, out, inMax, outMax]
const fs = require('fs');
const f = process.argv[2], from = Number(process.argv[3] || 0) * 60, to = Number(process.argv[4] || 1e9) * 60;
const d = JSON.parse(fs.readFileSync(f));
const R = d.rows.filter((r) => r.t >= from && r.t <= to);
const out = { file: f.split('/').pop(), window: [from / 60, Math.min(to, R[R.length - 1].t) / 60], n: R.length };
const S = {};
for (const r of R) for (const id in r.st) {
  const [i, o, im, om] = r.st[id]; const s = S[id] || (S[id] = { starved: 0, blocked: 0, busy: 0, inAvg: 0, outAvg: 0, n: 0 });
  s.n++; s.inAvg += i; s.outAvg += o;
  if (o >= om) s.blocked++; else if (i === 0) s.starved++; else s.busy++;
}
out.stations = Object.fromEntries(Object.entries(S).map(([k, s]) => [k, { busy: Math.round(100 * s.busy / s.n), starved: Math.round(100 * s.starved / s.n), blocked: Math.round(100 * s.blocked / s.n), in: +(s.inAvg / s.n).toFixed(1), out: +(s.outAvg / s.n).toFixed(1) }]));
const P = {};
for (const r of R) for (const k in r.piles || {}) { const p = P[k] || (P[k] = { sum: 0, full: 0, empty: 0, n: 0 }); p.n++; p.sum += r.piles[k]; if (r.piles[k] >= 36) p.full++; if (r.piles[k] <= 2) p.empty++; }
out.piles = Object.fromEntries(Object.entries(P).map(([k, p]) => [k, { avg: +(p.sum / p.n).toFixed(1), full90: Math.round(100 * p.full / p.n), empty: Math.round(100 * p.empty / p.n) }]));
const mk = {}; for (const r of R) for (const k of ['fish_cooked', 'bread', 'meat_cooked']) { mk[k] = mk[k] || { sum: 0, empty: 0 }; const v = (r.market || {})[k] || 0; mk[k].sum += v; if (!v) mk[k].empty++; }
out.market = Object.fromEntries(Object.entries(mk).map(([k, v]) => [k, { avg: +(v.sum / R.length).toFixed(1), empty: Math.round(100 * v.empty / R.length) }]));
const tr = {}; for (const r of R) for (const k of ['plank', 'ingot']) { tr[k] = tr[k] || { sum: 0 }; tr[k].sum += (r.trade || {})[k] || 0; }
out.trade = Object.fromEntries(Object.entries(tr).map(([k, v]) => [k, +(v.sum / R.length).toFixed(1)]));
out.whAvg = Math.round(R.reduce((a, r) => a + (r.wh ? r.wh[0] : 0), 0) / R.length);
out.dockAvg = Math.round(R.reduce((a, r) => a + ((r.v42 && r.v42.dock) || 0), 0) / R.length);
out.cargoAvg = Math.round(R.reduce((a, r) => a + ((r.v4 && r.v4.cargo) || 0), 0) / R.length);
const a = R[0], b = R[R.length - 1], mins = (b.t - a.t) / 60;
out.incomePerMin = Math.round((b.earned - a.earned) / mins);
out.exportedPerMin = +(((b.v42.exported || 0) - (a.v42.exported || 0)) / mins).toFixed(1);
out.exportCoinsPerMin = +(((b.v42.exportCoins || 0) - (a.v42.exportCoins || 0)) / mins).toFixed(1);
if (b.v42.dep) out.depEnd = b.v42.dep;
out.porters = [a.nPorters, b.nPorters];
console.log(JSON.stringify(out, null, 1));
