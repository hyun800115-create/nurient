// coins created per minute by place (prices from balance.js), from probe flows
const fs = require('fs');
const P = { fish_cooked: 4, bread: 7, meat_cooked: 12, plank: 5, ingot: 10, can: 12, axe: 40, pickaxe: 40, rod: 40, sickle: 40, bow: 40, fish_raw: 1, log: 1, wheat: 1, ore: 2, meat_raw: 3, fish_big: 1 };
for (const f of process.argv.slice(2)) {
  const r = JSON.parse(fs.readFileSync(f)).res, m = (r.end.t - r.s0.t) / 60, out = {};
  const add = (k, v) => { out[k] = (out[k] || 0) + v; };
  for (const k in r.flow) {
    const [a, b] = k.split('>');
    for (const ty in r.flow[k]) {
      const it = ty.replace('item_', ''), n = r.flow[k][ty] / m, p = P[it] || 0;
      if (b === 'use' && a === 'shelf:market') add('판매대', n * p);
      else if (b === 'use' && a === 'shelf:trade') add('교역소', n * p);
      else if (b === 'use' && a === 'shelf:store') add('잡화점', n * p);
      else if (a === 'wholesale' && b === 'paid') add('도매 (cards · shops)', n * p * 0.7);
    }
  }
  add('큰 식당', (r.end.restEarned - r.s0.restEarned) / m);
  add('수출 (train)', (r.end.exCoins - r.s0.exCoins) / m);
  add('물류창고 buyers', (r.end.depCoins - r.s0.depCoins) / m);
  const tot = Object.values(out).reduce((s, x) => s + x, 0);
  console.log(f, Math.round(tot), JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Math.round(v)]))));
}
