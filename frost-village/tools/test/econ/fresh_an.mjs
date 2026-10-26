// fresh40 / fresh25 measures (docs/logistics_plan.md §2.2 G4, G7) from census runs of fresh games
// (review_gameplay_census.mjs --minutes 40 --seed N [--botopts '{"p2Early":true}']), median over the runs.
//   node tools/test/econ/fresh_an.mjs run1.census.json run2.census.json ...
// Per run: village complete (min), income in the first 20 min, the 창고 built (min), 짐꾼 2 lines bought by 35 / 40 min,
// 판매대 smoked meat empty at 25–35 min, fish / wheat pile ≥ 90 % at 25–40 min, grill / bakery output full at 25–40 min.
import fs from 'node:fs';
import path from 'node:path';

const med = (a) => { const b = a.filter((x) => x !== null && x !== undefined && Number.isFinite(x)).sort((x, y) => x - y); if (!b.length) return null; const m = b.length >> 1; return b.length % 2 ? b[m] : +((b[m - 1] + b[m]) / 2).toFixed(2); };
const share = (rs, f) => (rs.length ? Math.round((100 * rs.filter(f).length) / rs.length) : null);
const out = [];
for (const f of process.argv.slice(2)) {
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  const R = d.rows || [];
  const at = (m) => R.find((r) => r.t >= m * 60);
  const win = (a, b) => R.filter((r) => r.t >= a * 60 && r.t < b * 60);
  const vc = R.find((r) => r.celebrated);
  const r20 = at(20), wh = R.find((r) => r.wh);
  const w2535 = win(25, 35), w2540 = win(25, 40);
  const full = (r, k) => r.piles && r.piles[k] !== undefined && r.piles[k] >= (r.pileMax || 40) * 0.9;
  const blk = (r, st) => r.st && r.st[st] && r.st[st][1] >= r.st[st][3];
  const p2 = (r) => (r && r.v42 && r.v42.lines && r.v42.lines.p2 ? r.v42.lines.p2.length : 0);
  out.push({
    run: path.basename(f).replace('.census.json', ''), minutes: R.length ? Math.round(R[R.length - 1].t / 60) : 0, errors: (d.errors || []).length,
    villageComplete: vc ? +(vc.t / 60).toFixed(2) : null,
    income20: r20 ? Math.round(r20.earned / 20) : null,
    warehouseAt: wh ? +(wh.t / 60).toFixed(2) : null,
    p2At35: p2(at(35)), p2At40: p2(R[R.length - 1]),
    meatEmpty2535: share(w2535, (r) => !(r.market && r.market.meat_cooked > 0)),
    fish90_2540: share(w2540, (r) => full(r, 'fish')), wheat90_2540: share(w2540, (r) => full(r, 'wheat')),
    grillBlocked2540: share(w2540, (r) => blk(r, 'grill')), bakeryBlocked2540: share(w2540, (r) => blk(r, 'bakery')),
    income2540: (() => { const a = at(25), b = at(40) || R[R.length - 1]; return a && b && b.t > a.t ? Math.round((b.earned - a.earned) / ((b.t - a.t) / 60)) : null; })(),
  });
}
for (const o of out) console.log(JSON.stringify(o));
const keys = Object.keys(out[0] || {}).filter((k) => typeof out[0][k] === 'number');
console.log('MEDIAN ' + JSON.stringify(Object.fromEntries(keys.map((k) => [k, med(out.map((o) => o[k]))]))));
