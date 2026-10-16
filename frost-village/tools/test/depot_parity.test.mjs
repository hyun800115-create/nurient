// (v4.2, docs/v42_plan.md §4.4 + §15) the depot's rack mapping is a parity copy of v8's model, Node only:
//   node tools/test/depot_parity.test.mjs
// src/systems/depot/rack.js (copy) vs src/city/logistics/model/{catalog,stock}.js (module): catOf / rackKeyOf on
// every known item + 50 unknown ids, and rackFill on 300 random stocks against the real rack slots of
// assets/logistics/manifest.json (logistics_center rackSlots + items), plus rackUnits per category.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const copy = await import(path.join(ROOT, 'src/systems/depot/rack.js'));
const modPath = path.join(ROOT, 'src/city/logistics/model/stock.js');
if (!fs.existsSync(modPath)) { console.log('  (src/city/logistics not present: parity skipped)'); process.exit(0); }
const mod = await import(modPath);
const modCat = await import(path.join(ROOT, 'src/city/logistics/model/catalog.js'));
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 300) : '')); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/logistics/manifest.json'), 'utf8'));
const lc = man.sprites.logistics_center || {};
const geo = { slots: lc.rackSlots || man.rackSlots || [], items: man.sprites };
ok(geo.slots.length > 0, 'the logistics centre has rack slots (' + geo.slots.length + ')');

let catBad = 0;
const ids = copy.KNOWN.concat(Array.from({ length: 50 }, (_, i) => 'item_unknown_' + i));
for (const k of ids) if (copy.catOf(k) !== modCat.catOf(k) || copy.rackKeyOf(k) !== modCat.rackKeyOf(k)) catBad++;
ok(catBad === 0 && same(copy.KNOWN, modCat.KNOWN) && same(copy.CATS, modCat.CATS), 'catalog: same categories and rack art for ' + ids.length + ' ids');

let seed = 99;
const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
const caps = { materials: 160, food: 160, goods: 120, tools: 60, furniture: 40, appliances: 40 };
let diff = 0, ex = null, over = 0;
for (let k = 0; k < 300; k++) {
  const a = new copy.Stock(caps), b = new mod.Stock(caps);
  const n = Math.floor(rnd() * 12);
  for (let q = 0; q < n; q++) { const id = copy.KNOWN[Math.floor(rnd() * copy.KNOWN.length)], c = 1 + Math.floor(rnd() * 80); a.add(id, c); b.add(id, c); }
  const fa = copy.rackFill(geo, a), fb = mod.rackFill(geo, b);
  if (!same(fa, fb)) { diff++; if (!ex) ex = { stock: a.snapshot() }; }
  for (const cat of copy.CATS) { const drawn = fa.filter((s, i) => geo.slots[i].category === cat).reduce((s, o) => s + o.stacks.reduce((x, y) => x + y.n, 0), 0); if (drawn > copy.rackUnits(geo, cat)) over++; }
}
ok(diff === 0, 'rackFill: copy == module on 300 random stocks', ex || { diff });
ok(over === 0, 'rackFill never draws more than the racks hold');
for (const cat of copy.CATS) ok(copy.rackUnits(geo, cat) === mod.rackUnits(geo, cat), 'rackUnits(' + cat + ') = ' + copy.rackUnits(geo, cat));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
