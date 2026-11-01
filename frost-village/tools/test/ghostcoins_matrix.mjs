// (v4.2.1) ghost-coin reproduction matrix, 390x844 @ DPR 3 on real saves: every kind of till is collected every way
// (the chief standing on it, the chief running straight across, 딸랑이's rounds = CashPad.takeAll, takeAll while a
// customer's coins are still in the air, after a reload, behind a building with the x-ray on, zoom 0.6 / 0.8 / 1.0,
// day and night); after each collection every display object near the pad that shows a coin is listed (coinscan.mjs)
// with a screenshot crop.
//   node tools/test/ghostcoins_matrix.mjs --scen fresh|m25|m35|m46|late [--tag before|after] [--out DIR] [--dpr 3]
//   fresh = new game · m25/m35/m46 = fixtures/v41_save_smart_{25,35,46}min.json · late = fixtures/v42_save_office_ttal.json
//   (the 46-min save + the office and bank built, all four staff hired, the depot built, two minutes played)
// Writes DIR/<tag>_<scen>.json (one row per collection) and DIR/<tag>_<scen>_*.png.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, advance } from './fv_step.mjs';
import { installCoinScan } from './coinscan.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const SCEN = arg('scen', 'm46'), TAG = arg('tag', 'run'), DPR = +arg('dpr', 3);
const OUT = path.resolve(arg('out', path.join(HERE, '..', '..', 'docs', 'previews', 'ghostcoins')));
fs.mkdirSync(OUT, { recursive: true });
const FIX = { m25: 'v41_save_smart_25min.json', m35: 'v41_save_smart_35min.json', m46: 'v41_save_smart_46min.json', late: 'v42_save_office_ttal.json' };
const rows = [];
const t0 = Date.now();
const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const frames = (page, n) => page.evaluate((k) => { for (let i = 0; i < k; i++) window.__step.frame(); }, n);
async function shot(page, x, y, name) {
  const c = await page.evaluate(([a, b]) => window.__coins.screen(a, b), [x, y]);
  const w = 150, h = 150;
  const clip = { x: Math.max(0, c.x - w / 2), y: Math.max(0, c.y - h * 0.7), width: w, height: h };
  const f = path.join(OUT, `${TAG}_${SCEN}_${name}.png`);
  await page.screenshot({ path: f, clip });
  return path.basename(f);
}
async function boot(page, save) {
  await page.evaluate((sv) => { localStorage.clear(); if (sv) localStorage.setItem('frostVillage.save.v1', sv); }, save);
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 180000);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player, 180000);
  await sleep(2500);
  await installStepper(page);
  await installCoinScan(page);
  await page.evaluate(() => { if (window.__FV.v42) window.__FV.v42.v.seen.whatsNew = 1; });
  await advance(page, 0.5);
}
function log(r) { rows.push(r); const s = r.after || {}; console.log(`${r.case.padEnd(34)} ${r.till.padEnd(8)} v=${s.value} n=${s.count} inc=${s.incoming} ink=${s.pileInk ? s.pileInk.px : '-'} ghost=${s.ghost} zeroValCoins=${s.zeroValueCoins} objs=${(s.objs || []).filter((o) => o.visible).map((o) => o.owner + (o.ink ? '[' + o.ink.px + 'px]' : '') + '@a' + o.alpha).join(',')}`); }
const setClock = (page, h) => page.evaluate((hh) => { const H = window.__FV.v4; try { if (H && H.clock) H.clock(hh); } catch (e) { /* */ } }, h);
// (a live village keeps paying into the tills: during a measurement the till takes no new payment, so what is left
//  after a collection is only what the collection left)
const freeze = (page, n) => page.evaluate((nn) => { const t = window.__coins.till(nn); if (t && !t.__add0) { t.__add0 = t.add; t.add = function () {}; } }, n);
const thaw = (page, n) => page.evaluate((nn) => { const t = window.__coins.till(nn); if (t && t.__add0) { t.add = t.__add0; delete t.__add0; } }, n);
async function chiefCollect(page, name, cs, opts = {}) {
  const p = await page.evaluate((n) => { const t = window.__coins.till(n); return t ? { x: t.x, y: t.y } : null; }, name);
  if (!p) return;
  await page.evaluate(([x, y, z]) => { window.__FV.teleport(x + 170, y + 110); window.__FV.camera(x, y - 40, z); }, [p.x, p.y, opts.zoom || 0.8]);
  // coins in: as a customer pays (if the till is empty)
  await page.evaluate(([n]) => { const t = window.__coins.till(n); if (t.value < 30) t.add(30, t.x + 90, t.y - 70); }, [name]);
  await advance(page, 1);
  await frames(page, 6);
  const before = await page.evaluate((n) => window.__coins.scan(n), name);
  const b = await shot(page, p.x, p.y, cs + '_' + name + '_1full');
  // the chief walks onto the pad and stays until it is empty, then walks off
  await freeze(page, name);
  await page.evaluate(([x, y]) => window.__FV.teleport(x, y), [p.x, p.y]);
  for (let k = 0; k < 12; k++) {
    await page.evaluate(() => window.__step.run(0.25));
    const e = await page.evaluate((n) => { const t = window.__coins.till(n); return t.value === 0 && t.pile.count === 0 && t.pile.incoming === 0; }, name);
    if (e) break;
  }
  await page.evaluate(([x, y]) => window.__FV.teleport(x + 170, y + 110), [p.x, p.y]);
  await advance(page, 1);
  await frames(page, 8);
  const after = await page.evaluate((n) => window.__coins.scan(n), name);
  const a = await shot(page, p.x, p.y, cs + '_' + name + '_2collected');
  await thaw(page, name);
  log({ case: cs + ' chief', till: name, before, after, shots: [b, a] });
}
async function walkOver(page, name, cs, opts = {}) {
  // the chief runs straight across the pad with the joystick (no stop), as players do
  const p = await page.evaluate((n) => { const t = window.__coins.till(n); return t ? { x: t.x, y: t.y } : null; }, name);
  if (!p) return;
  await page.evaluate(([x, y, z]) => { window.__FV.teleport(x - 260, y); window.__FV.camera(x, y - 40, z); }, [p.x, p.y, opts.zoom || 0.8]);
  await page.evaluate(([n]) => { const t = window.__coins.till(n); if (t.value < 90) t.add(90, t.x + 90, t.y - 70); }, [name]);
  await advance(page, 1.5);
  await frames(page, 6);
  const before = await page.evaluate((n) => window.__coins.scan(n), name);
  await freeze(page, name);
  const tr = await page.evaluate(([n]) => { const t = window.__coins.till(n), out = []; window.__FV.setInput(1, 0); for (let i = 0; i < 40; i++) { window.__step.run(1 / 30); const pl = window.__FV.scene.player; out.push([Math.round(pl.x - t.x), t.pad.contains(pl.x, pl.y) ? 1 : 0, t.value, t.pile.count]); } window.__FV.setInput(0, 0); return out; }, [name]);
  const onPad = tr.filter((q) => q[1]).length / 30;
  await advance(page, 1.5);
  await frames(page, 8);
  const after = await page.evaluate((n) => window.__coins.scan(n), name);
  const a = await shot(page, p.x, p.y, cs + '_' + name + '_walkover');
  await thaw(page, name);
  log({ case: cs + ' walk-over (' + onPad.toFixed(2) + ' s on pad)', till: name, before, after, shots: [a] });
}
try {
  const { page, log: plog } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 390, height: 844 }, dpr: DPR });
  const save = FIX[SCEN] ? fs.readFileSync(path.join(HERE, 'fixtures', FIX[SCEN]), 'utf8') : null;
  await boot(page, save);
  const tills = await page.evaluate(() => window.__coins.tills());
  console.log(SCEN, 'tills', JSON.stringify(tills));
  const names = tills.filter((t) => t.enabled).map((t) => t.name);
  if (SCEN === 'fresh') {
    await chiefCollect(page, 'market', 'fresh_z1.0_day', { zoom: 1.0 });
  } else if (SCEN === 'm25') {
    await setClock(page, 12);
    for (const n of names) await chiefCollect(page, n, 'm25_z1.0_day', { zoom: 1.0 });
    await walkOver(page, 'market', 'm25_z1.0_day', { zoom: 1.0 });
  } else if (SCEN === 'm35') {
    await setClock(page, 22);
    for (const n of names) await chiefCollect(page, n, 'm35_z0.8_night', { zoom: 0.8 });
  } else if (SCEN === 'm46') {
    await setClock(page, 12);
    for (const n of names) await chiefCollect(page, n, 'm46_z0.6_day', { zoom: 0.6 });
    await walkOver(page, 'market', 'm46_z0.6_day', { zoom: 0.6 });
    await walkOver(page, 'rest', 'm46_z0.6_day', { zoom: 0.6 });
    // x-ray: is any till behind an occluder? stand the chief behind it, the pad's own pile is collected meanwhile
    const xr = await page.evaluate(() => {
      const gs = window.__FV.scene, out = [];
      for (const q of window.__coins.tills()) for (const o of gs.occluders || []) if (o.img && o.img.visible && q.y < o.y - 4 && q.y > o.y - o.top && Math.abs(q.x - o.x) < o.hw) out.push({ till: q.name, occ: o.img.texture.key + ':' + (o.img.frame && o.img.frame.name) });
      return out;
    });
    console.log('tills behind occluders:', JSON.stringify(xr));
    for (const q of xr.slice(0, 2)) await chiefCollect(page, q.till, 'm46_xray_z0.8', { zoom: 0.8 });
    // 딸랑이-style empty (CashPad.takeAll) with coins still flying in
    for (const n of ['market', 'store']) {
      if (!names.includes(n)) continue;
      const p = await page.evaluate((nn) => { const t = window.__coins.till(nn); return { x: t.x, y: t.y }; }, n);
      await page.evaluate(([x, y]) => window.__FV.camera(x, y - 40, 0.8), [p.x, p.y]);
      await page.evaluate((nn) => { const t = window.__coins.till(nn); t.add(30, t.x + 90, t.y - 70); t.__add0 = t.add; t.add = function () {}; window.__step.run(0.15); t.takeAll({ x: t.x + 200, y: t.y + 100 }); }, n);
      await advance(page, 2); await frames(page, 8);
      const after = await page.evaluate((nn) => window.__coins.scan(nn), n);
      const a = await shot(page, p.x, p.y, 'm46_takeAll_midflight_' + n);
      await thaw(page, n);
      log({ case: 'm46 takeAll while coins fly in', till: n, after, shots: [a] });
    }
  } else if (SCEN === 'late') {
    await setClock(page, 9);
    // 딸랑이's rounds: fill the tills, let him walk; after each till he empties, look at it
    const O0 = await page.evaluate(() => { const O = window.__FV.scene.v42.office; window.__emptied = []; const tk = O.takeTill.bind(O); O.takeTill = (q, c) => { const n = tk(q, c); window.__emptied.push([q.name, n, window.__step.t]); if (!q.till.__add0) { q.till.__add0 = q.till.add; q.till.add = function () {}; } return n; }; return O.state().rounds; });
    for (const n of names) await page.evaluate((nn) => { const t = window.__coins.till(nn); if (t.value < 60) t.add(60, t.x + 90, t.y - 70); }, n);
    let seen = 0;
    for (let k = 0; k < 60; k++) {
      await advance(page, 5);
      const em = await page.evaluate(() => window.__emptied.slice());
      for (; seen < em.length; seen++) {
        const [nm] = em[seen];
        const p = await page.evaluate((nn) => { const t = window.__coins.till(nn); return { x: t.x, y: t.y }; }, nm);
        await page.evaluate(([x, y]) => window.__FV.camera(x, y - 40, 0.8), [p.x, p.y]);
        await frames(page, 8);
        const after = await page.evaluate((nn) => window.__coins.scan(nn), nm);
        const a = await shot(page, p.x, p.y, 'late_ttal_' + nm + '_' + seen);
        await thaw(page, nm);
        log({ case: 'late 딸랑이 round (takeAll)', till: nm, taken: em[seen][1], after, shots: [a] });
      }
      if (seen >= names.length) break;
    }
    console.log('emptied', JSON.stringify(await page.evaluate(() => window.__emptied)));
    // after a reload: the tills restore their piles; the chief collects them
    await page.evaluate(() => { for (const q of window.__FV.scene.v42.tillList()) if (q.till.value < 30) q.till.value += 45; window.__FV.save(); });
    const sv = await page.evaluate(() => localStorage.getItem('frostVillage.save.v1'));
    await boot(page, sv);
    await setClock(page, 22);
    for (const n of ['market', 'rest', 'tax', 'station', 'depot']) if (names.includes(n)) await chiefCollect(page, n, 'late_reload_z1.0_night', { zoom: 1.0 });
  }
  console.log('page errors', plog.errors.slice(0, 3));
} finally {
  fs.writeFileSync(path.join(OUT, `${TAG}_${SCEN}.json`), JSON.stringify(rows, null, 1));
  console.log('time', Math.round((Date.now() - t0) / 1000), 's');
  await browser.close(); await srv.close();
}
