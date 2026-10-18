// analyse probe.mjs output: per-minute flows by item, carriers, sinks; state shares; trips
const fs = require('fs');
const d = JSON.parse(fs.readFileSync(process.argv[2]));
const r = d.res;
const mins = (r.end.t - r.s0.t) / 60;
const pm = (n) => +(n / mins).toFixed(1);
console.log('minutes', mins.toFixed(2), 'samples', r.samples, 'hour', r.s0.hour && r.s0.hour.toFixed(1), '->', r.end.hour && r.end.hour.toFixed(1), 'errors', d.errors.length);
console.log('income/min', pm(r.end.earned - r.s0.earned), 'exported/min', pm(r.end.exported - r.s0.exported), 'exportCoins/min', pm(r.end.exCoins - r.s0.exCoins), 'rest served/min', pm(r.end.served - r.s0.served), 'rest coins/min', pm(r.end.restEarned - r.s0.restEarned), 'depot sales/min', pm(r.end.depSales - r.s0.depSales), 'depot coins/min', pm(r.end.depCoins - r.s0.depCoins));
// flows by item
const byItem = {};
for (const k in r.flow) { const [a, b] = k.split('>'); for (const ty in r.flow[k]) { const it = ty.replace('item_', ''); (byItem[it] = byItem[it] || []).push([a, b, r.flow[k][ty]]); } }
for (const it of Object.keys(byItem).sort()) {
  const rows = byItem[it].filter((x) => !(x[0] === 'other' || x[1] === 'other')).sort((p, q) => q[2] - p[2]);
  console.log('\n## ' + it);
  for (const [a, b, n] of rows) console.log('  ' + (a + ' > ' + b).padEnd(48) + pm(n));
}
console.log('\n## states (share of samples, %)');
for (const g of Object.keys(r.st).sort()) {
  const o = r.st[g], tot = Object.values(o).reduce((s, x) => s + x, 0);
  console.log('  ' + g.padEnd(18) + Object.entries(o).sort((p, q) => q[1] - p[1]).map(([k, v]) => k + ' ' + Math.round(100 * v / tot)).join(' · ') + '  (n=' + tot + ')');
}
console.log('\n## trips');
for (const k of Object.keys(r.trips).sort()) {
  const q = r.trips[k];
  console.log('  ' + k.padEnd(16) + 'trips/min ' + pm(q.trips) + ' items/min ' + pm(q.items) + ' load ' + (q.items / q.trips).toFixed(1) + ' px/trip ' + Math.round(q.px / q.trips) + ' to ' + JSON.stringify(q.to));
}
console.log('\n## stations (avg in/out)');
for (const k in r.stn) { const o = r.stn[k]; console.log('  ' + k.padEnd(12) + 'in ' + (o.inSum / o.n).toFixed(1) + '/' + o.inMax + ' out ' + (o.outSum / o.n).toFixed(1) + '/' + o.outMax); }
console.log('\n## piles');
for (const k in r.piles) { const o = r.piles[k]; console.log('  ' + k.padEnd(8) + 'avg ' + (o.sum / o.n).toFixed(1) + ' full90 ' + Math.round(100 * o.full / o.n) + '%'); }
const M = r.misc, n = r.samples;
console.log('\n## misc  wh avg', Math.round(M.whSum / n), 'dock avg', Math.round((M.dockSum || 0) / n), 'depot avg', Math.round((M.depSum || 0) / n), '/', M.depCap, 'foodbox avg', ((M.foodSum || 0) / n).toFixed(1));
if (M.whBy) console.log('  wh by type', JSON.stringify(Object.fromEntries(Object.entries(M.whBy).map(([k, v]) => [k.replace('item_', ''), Math.round(v / n)]))));
if (M.mk) console.log('  market', JSON.stringify(Object.fromEntries(Object.entries(M.mk).map(([k, v]) => [k.replace('item_', ''), k.endsWith('_empty') ? Math.round(100 * v / n) + '%' : +(v / n).toFixed(1)]))));
if (M.pantry) console.log('  pantry', JSON.stringify(Object.fromEntries(Object.entries(M.pantry).map(([k, v]) => [k.replace('item_', ''), k.endsWith('_empty') ? Math.round(100 * v / n) + '%' : +(v / n).toFixed(1)]))));
console.log('\n## agents', JSON.stringify(r.agents));
if (r.ledger) console.log('\n## ledger', JSON.stringify(r.ledger));
