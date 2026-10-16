// (v4.2, docs/v42_plan.md §3.4 + §15) 길 안내 — Navigator, fixed-step clock:
//   node tools/test/nav.mjs
// From the v4.1 46-min save: for 40 random bags the navigator's place = the place that takes the most bag items among
// Tutorial.destination(type) of every type (ties: the nearer), the route length is within 10 % of the A* walk
// route, ≤ 20 display objects while carrying, the chip names the place; off with the setting, with an empty bag,
// and in a fresh game's first loop; the 관망 pilot (when present) turns it off.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, advance } from './fv_step.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAVE = fs.readFileSync(path.join(HERE, 'fixtures', 'v41_save_smart_46min.json'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 400) : '')); } };

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
async function boot(save) {
  const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 390, height: 844 }, dpr: 1 });
  await page.evaluate((sv) => { try { localStorage.clear(); if (sv) localStorage.setItem('frostVillage.save.v1', sv); } catch (e) { /* */ } }, save);
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 120000);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player, 120000);
  await sleep(2500);
  await installStepper(page);
  await page.evaluate(() => { if (window.__FV.v42) window.__FV.v42.v.seen.whatsNew = 1; });
  await advance(page, 1);
  return { page, log };
}

try {
  const { page, log } = await boot(SAVE);
  const TYPES = ['item_fish_cooked', 'item_bread', 'item_meat_cooked', 'item_plank', 'item_ingot', 'item_fish_raw', 'item_log', 'item_wheat', 'item_ore', 'item_meat_raw', 'item_can'];
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  let agree = 0, routeOk = 0, objOk = 0, chipOk = 0, n = 0;
  const bad = [], badRoute = [];
  const spots = await page.evaluate(() => { const gs = window.__FV.scene; return [[gs.market.x + 120, gs.market.y + 160], [gs.stations.sawmill.x + 100, gs.stations.sawmill.y + 120], [gs.stations.smelter.x + 80, gs.stations.smelter.y + 120], [gs.trade.x + 140, gs.trade.y + 150]]; });
  for (let k = 0; k < 40; k++) {
    const kinds = 1 + Math.floor(rnd() * 3), bagT = [];
    for (let q = 0; q < kinds; q++) bagT.push([TYPES[Math.floor(rnd() * TYPES.length)], 1 + Math.floor(rnd() * 6)]);
    const at = spots[k % spots.length];
    await page.evaluate(({ bag, at }) => { const F = window.__FV; F.clearStack(); F.setInput(0, 0); F.teleport(at[0], at[1]); for (const [ty, c] of bag) F.carry(ty, c); }, { bag: bagT, at });
    await advance(page, 0.6);
    const r = await page.evaluate(() => {
      const gs = window.__FV.scene, V = window.__FV.v42.v, p = gs.player, T = gs.tutorial;
      // (the navigator picks 4 times a second: let it pick now, so both look at the same shelves)
      V.nav.pickT = 0; V.nav.update(0);
      // an independent rule: per type the tutorial's destination; per place the items it takes; most wins, ties nearer
      const counts = {};
      for (const it of p.stack.items) counts[it.type] = (counts[it.type] || 0) + 1;
      const by = new Map();
      for (const ty in counts) { const d = T.destination(ty); if (!d || !d.pad) continue; const e = by.get(d.pad) || { pad: d.pad, n: 0, d: Math.hypot(p.x - d.pad.x, (p.y - d.pad.y) * 2) }; e.n += Math.min(counts[ty], Math.max(1, d.room || counts[ty])); by.set(d.pad, e); }
      const list = Array.from(by.values()).sort((a, b) => b.n - a.n || a.d - b.d);
      const want = list[0] ? { x: Math.round(list[0].pad.x), y: Math.round(list[0].pad.y), n: list[0].n } : null;
      const st = V.nav.state();
      // the A* walk route length to the same place
      let ref = null;
      if (st.dest && st.dest.x !== null) { const R = gs.roads.route(p.x, p.y, st.dest.x, st.dest.y, []); let L = 0, a = { x: p.x, y: p.y }; for (const q of R) { L += Math.hypot(q.x - a.x, q.y - a.y); a = q; } ref = L; }
      // (its hysteresis: the place it walks to stays unless another takes ≥ 2 more items of the same load)
      const gotE = st.dest && list.find((e) => Math.round(e.pad.x) === st.dest.x && Math.round(e.pad.y) === st.dest.y);
      const tie = (list.length > 1 && list[1].n === list[0].n) || !!(gotE && gotE.n + 2 > list[0].n);
      const dg = st.dest && st.dest.x !== null ? Math.hypot(st.dest.x - p.x, (st.dest.y - p.y) * 2) : 0;
      return { want, got: st.dest, routeLen: st.routeLen, ref, dg, objects: st.objects, chip: st.chip, tie, active: st.active, counts };
    });
    n++;
    const same = (!r.want && (!r.got || r.got.none)) || (r.want && r.got && r.got.x === r.want.x && r.got.y === r.want.y);
    if (same || r.tie) agree++; else bad.push({ bag: bagT, want: r.want, got: r.got });
    // (under nav.straightUnder 360 px of ground distance the guide draws a straight line by design)
    if (!r.ref || r.ref < 360 || r.dg < 360 || Math.abs(r.routeLen - r.ref) <= r.ref * 0.1 + 40) routeOk++; else badRoute.push({ len: r.routeLen, ref: Math.round(r.ref), dg: Math.round(r.dg) });
    if (r.objects <= 20) objOk++;
    if (!r.want || (r.chip && r.chip.text)) chipOk++;
  }
  ok(agree === n, 'navigator place = the place that takes the most bag items (' + agree + ' / ' + n + ')', bad.slice(0, 3));
  ok(routeOk === n, 'route length within 10 % of the A* walk route (' + routeOk + ' / ' + n + ')', badRoute.slice(0, 3));
  ok(objOk === n, '≤ 20 display objects while carrying (' + objOk + ' / ' + n + ')');
  ok(chipOk === n, 'the chip names the place while carrying (' + chipOk + ' / ' + n + ')');
  // off: setting, empty bag
  await page.evaluate(() => { const F = window.__FV; F.clearStack(); F.carry('item_bread', 4); F.v42.settings({ nav: false }); });
  await advance(page, 0.5);
  const off1 = await page.evaluate(() => window.__FV.v42.v.nav.state());
  await page.evaluate(() => { window.__FV.v42.settings({ nav: true }); window.__FV.clearStack(); });
  await advance(page, 0.5);
  const off2 = await page.evaluate(() => window.__FV.v42.v.nav.state());
  ok(!off1.active && off1.objects === 0 && !off2.dest, 'off with the setting and with an empty bag', { off1: off1.active, off2: off2.dest });
  // 관망: the pilot turns the guide off
  const pil = await page.evaluate(() => !!(window.__FV.v42.v.pilot));
  if (pil) {
    await page.evaluate(() => { window.__FV.carry('item_bread', 4); window.__FV.v42.v.pilot.start('test'); });
    await advance(page, 0.5);
    const s = await page.evaluate(() => { const st = window.__FV.v42.v.nav.state(); window.__FV.v42.v.pilot.stop('test'); return st; });
    ok(!s.active, 'off while 관망 drives the chief');
  } else console.log('  (no 관망 pilot yet: skipped)');
  // per-frame cost
  const cost = await page.evaluate(() => { const F = window.__FV; F.clearStack(); F.carry('item_plank', 6); const N = window.__FV.v42.v.nav; const a = performance.now(); for (let i = 0; i < 600; i++) N.update(1 / 60); return (performance.now() - a) / 600; });
  ok(cost < 0.1, 'navigator update ' + cost.toFixed(3) + ' ms a frame (budget 0.02 on a quiet machine; noisy here)');
  ok(log.errors.length === 0, 'no errors (46-min save)', log.errors.slice(0, 3));
  await page.context().close();
  // the first loop: no guide
  const { page: p2, log: l2 } = await boot(null);
  await p2.evaluate(() => window.__FV.carry('item_fish_raw', 2));
  await advance(p2, 0.6);
  const f = await p2.evaluate(() => ({ nav: window.__FV.v42.v.nav.state().active, tut: !!window.__FV.scene.tutorial.inTutorial }));
  ok(f.tut && !f.nav, 'fresh game: no guide through the first loop', f);
  ok(l2.errors.length === 0, 'no errors (fresh game)', l2.errors.slice(0, 3));
  await p2.context().close();
} catch (e) { fail++; console.log('FATAL', e && e.stack || e); }
console.log('\n' + pass + ' passed, ' + fail + ' failed');
await browser.close();
await srv.close();
process.exit(fail ? 1 : 0);
