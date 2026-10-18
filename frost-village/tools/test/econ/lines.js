// per-line summary tables (markdown) from one or more probe outputs
const fs = require('fs');
const files = process.argv.slice(2);
const LINES = [
  { id: 'grill', pile: 'fish', raw: 'fish_raw', prod: 'fish_cooked', g: 'fisherman' },
  { id: 'sawmill', pile: 'log', raw: 'log', prod: 'plank', g: 'lumberjack' },
  { id: 'bakery', pile: 'wheat', raw: 'wheat', prod: 'bread', g: 'farmer' },
  { id: 'smelter', pile: 'ore', raw: 'ore', prod: 'ingot', g: 'miner' },
  { id: 'smokehouse', pile: 'meat', raw: 'meat_raw', prod: 'meat_cooked', g: 'hunter' },
];
const pct = (o, k) => { if (!o) return '-'; const t = Object.values(o).reduce((s, x) => s + x, 0); return t ? Math.round(100 * (o[k] || 0) / t) : 0; };
for (const f of files) {
  const d = JSON.parse(fs.readFileSync(f)); const r = d.res; if (!r) { console.log(f, 'no result'); continue; }
  const mins = (r.end.t - r.s0.t) / 60;
  const F = (a, b, ty) => { let n = 0; for (const k in r.flow) { const [x, y] = k.split('>'); if ((a === null || x === a || (a instanceof RegExp && a.test(x))) && (b === null || y === b || (b instanceof RegExp && b.test(y)))) n += r.flow[k]['item_' + ty] || 0; } return n / mins; };
  const nG = (t) => r.agents.gatherers.filter((x) => x === t).length;
  console.log(`\n### ${f}  (${mins.toFixed(1)} min, hour ${r.s0.hour.toFixed(1)}→${r.end.hour.toFixed(1)})`);
  console.log('| line | gatherers | caught/min | into pile | pile avg · ≥90 % | taken from pile: raw porter / wh / stn / chief | into station | processed | station busy / starved / blocked % | made |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (const L of LINES) {
    const caught = F('make', 'ch:g:' + L.g, L.raw), toPile = F('ch:g:' + L.g, 'pile:' + L.pile, L.raw);
    const p = r.piles[L.pile] || { sum: 0, n: 1, full: 0 };
    const tr = F('pile:' + L.pile, 'ch:raw:' + L.id, L.raw), tw = F('pile:' + L.pile, 'ch:wh', L.raw), ts = F('pile:' + L.pile, 'ch:stn', L.raw), tc = F('pile:' + L.pile, 'ch:chief', L.raw);
    const into = F(null, 'in:' + L.id, L.raw), used = F('in:' + L.id, 'use', L.raw), made = F('make', 'out:' + L.id, L.prod);
    const s = r.st['stn:' + L.id];
    console.log(`| ${L.id} | ${nG(L.g)} | ${caught.toFixed(1)} | ${toPile.toFixed(1)} | ${(p.sum / p.n).toFixed(0)} · ${Math.round(100 * p.full / p.n)} % | ${tr.toFixed(1)} / ${tw.toFixed(1)} / ${ts.toFixed(1)} / ${tc.toFixed(1)} | ${into.toFixed(1)} | ${used.toFixed(1)} | ${pct(s, 'busy')} / ${pct(s, 'starved')} / ${pct(s, 'blocked')} | ${made.toFixed(1)} |`);
  }
  // where the products go
  console.log('\n| product | made/min | out of station by: p1 / p2 / wh / stn | delivered to (per min) |');
  console.log('|---|---|---|---|');
  const prods = LINES.map((L) => [L.id, L.prod]).concat([['cannery', 'can'], ['toolsmith', null]]);
  for (const [id, prod] of prods) {
    const types = prod ? [prod] : ['axe', 'pickaxe', 'rod', 'sickle', 'bow'];
    let made = 0, o1 = 0, o2 = 0, ow = 0, os = 0; const dest = {};
    for (const ty of types) {
      made += F('make', 'out:' + id, ty); o1 += F('out:' + id, /^ch:p1:/, ty); o2 += F('out:' + id, /^ch:p2:/, ty); ow += F('out:' + id, 'ch:wh', ty); os += F('out:' + id, 'ch:stn', ty);
      for (const k in r.flow) { const [x, y] = k.split('>'); if (!/^ch:/.test(x) || /^ch:/.test(y) || y === 'other') continue; const n = (r.flow[k]['item_' + ty] || 0) / mins; if (n > 0) dest[y] = (dest[y] || 0) + n; }
      const wo = F('wh', null, ty); if (wo) dest['(wh out → carriers)'] = (dest['(wh out → carriers)'] || 0) + 0;
    }
    console.log(`| ${prod || 'tools'} (${id}) | ${made.toFixed(1)} | ${o1.toFixed(1)} / ${o2.toFixed(1)} / ${ow.toFixed(1)} / ${os.toFixed(1)} | ${Object.entries(dest).filter(([, v]) => v >= 0.05).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v.toFixed(1)).join(' · ')} |`);
  }
  // sinks: consumption
  const use = {};
  for (const k in r.flow) { const [x, y] = k.split('>'); if (y !== 'use' && y !== 'sold' && y !== 'paid' && y !== 'depot' && y !== 'train' && y !== 'sleigh') continue; for (const ty in r.flow[k]) { const kk = x + '>' + y; use[kk] = use[kk] || {}; use[kk][ty.replace('item_', '')] = +(r.flow[k][ty] / mins).toFixed(1); } }
  console.log('\nconsumption / exits:', JSON.stringify(use));
}
