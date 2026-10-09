// Frost Village v3 checks (생산 사슬과 땅 넓히기; v3.5: operators/porters hired by unlockV3) — the parts the smoke test does not walk through.
//   node tools/test/v3.mjs            (screenshots -> docs/previews/screens_v3/test_*.jpg)
// Runs on the fixed-step clock (fv_step.mjs): every wait is GAME time.
//   lazy buildings fragment, fog wall + walk/camera limits, porters carry on the back, clerks ring at the
//   hand-over frame, store clerk between shop and counter, trade clerk / merchant apart, houses + move-in,
//   warehouse overflow + restock, store clerk hire, fishing boat (coins + rod), all three towers, v3 finale.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep as realSleep, waitFor as realWaitFor } from './pw.mjs';
import { installStepper, advance, render, walkStep, until } from './fv_step.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'docs', 'previews', 'screens_v3');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const step = (name, ok, info = '') => { results.push({ name, ok, info }); console.log((ok ? '  ok  ' : ' FAIL ') + name + (info ? '  — ' + info : '')); };

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 390, height: 844 } });
const ev = (fn, arg) => page.evaluate(fn, arg);
const adv = (s) => advance(page, s);
const wait = async (fn, sec, arg) => { for (let t = 0; t < sec; t += 0.5) { if (await ev(fn, arg)) return true; await adv(0.5); } return !!(await ev(fn, arg)); };
const st = () => ev(() => window.__FV.state());
const shot = async (n) => { await render(page, 3); await page.screenshot({ path: path.join(OUT, 'test_' + n + '.jpg'), type: 'jpeg', quality: 80 }); };
const walk = (t, tol) => walkStep(page, t, { tol: tol || 14 });
const where = (n) => ev((k) => window.__FV.where(k), n);
void until;

let fatal = null;
try {
  await ev(() => { try { localStorage.clear(); } catch (e) { /* */ } });
  await page.reload({ waitUntil: 'load' });
  await realWaitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 120000);
  // 1. the buildings fragment is not needed for the title screen (it loads after Start)
  const atTitle = await ev(() => window.__FV.game.textures.exists('bld_buildings'));
  await realSleep(400);
  await tapStart(page);
  await realWaitFor(page, () => window.__FV.state && window.__FV.game.scene.isActive('UI'), 180000);
  // (v3.5 review) a new village does not need the v3 buildings (nor the 2nd / 3rd workers' looks) yet:
  // they wait until the village gets there (less memory on the phone early on)
  await realWaitFor(page, () => window.__FV.hasTex('vil_npc_chef'), 90000).catch(() => {});
  await realSleep(1500);
  const early = await ev(() => ({ b: window.__FV.game.textures.exists('bld_buildings'), w: window.__FV.game.textures.exists('wkr_fisherman_b') }));
  await installStepper(page);
  await adv(1);

  // 2. fog wall: closed land cannot be walked into and the camera does not show it
  await ev(() => { window.__FV.unlockAll(); window.__FV.give(100000); });
  await adv(2.5);
  // (the game loop sleeps under the fixed-step clock, and Phaser's loader only starts queued files beyond
  //  its parallel limit on a scene update: give it that nudge while waiting, without advancing game time —
  //  on a busy machine the residents' files are still loading here and the gated ones would wait forever)
  await realWaitFor(page, () => { const L = window.__FV.scene.load; if (L && L.isLoading()) L.update(); return window.__FV.game.textures.exists('bld_buildings') && window.__FV.game.textures.exists('bld_sites') && window.__FV.game.textures.exists('wkr_fisherman_b'); }, 90000).catch(() => {});
  const afterStart = await ev(() => window.__FV.game.textures.exists('bld_buildings') && window.__FV.game.textures.exists('wkr_fisherman_b'));
  step('buildings / worker-variant art loads lazily: not at the title, not in a new village, then when needed', !atTitle && !early.b && !early.w && afterStart, `title=${atTitle} newVillage=${JSON.stringify(early)} later=${afterStart}`);
  let s = await st();
  const fog = await ev(() => { const gs = window.__FV.scene, T = gs.territory; return { east: !!T.regions.east.fog, south: !!T.regions.south.fog, walk: gs.collision.inWalk(2300, 1000), walkStart: gs.collision.inWalk(990, 1200), cam: T.camRect }; });
  step('fog walls stand before every closed land', fog.east && fog.south && !s.territory.east && !s.territory.south, JSON.stringify(fog));
  step('closed land is not walkable', !fog.walk && fog.walkStart);
  step('camera bounds stop at the fog (with a peek)', fog.cam && fog.cam.w < 2300 && fog.cam.h < 3100, JSON.stringify(fog.cam));
  await ev(() => window.__FV.camera(1650, 900, 0.7));
  await adv(1);
  await shot('01_fog_wall');
  await ev(() => window.__FV.camera());

  // 3. porters carry on their back, the chief on his head
  await ev(() => { const gs = window.__FV.scene; for (let i = 0; i < 6; i++) gs.stations.sawmill.outStack.push('item_plank', null, gs.effects); });
  await wait(() => window.__FV.scene.porters.some((p) => p.station && p.station.id === 'sawmill' && p.stack.count > 0), 40);
  const carry = await ev(() => { const gs = window.__FV.scene; return { porters: gs.porters.map((p) => p.key + ':' + p.carryMode + ':' + (p.def.carryStyle || '-')), chief: gs.player.carryMode || 'head' }; });
  step('porters carry on the back (carryPoint), the chief on his head', carry.porters.every((x) => !/:back$/.test(x) || /:back:back$/.test(x)) && carry.porters.some((x) => /:back:back$/.test(x)) && carry.chief === 'head', JSON.stringify(carry));
  {
    const p = await ev(() => { const w = window.__FV.scene.porters.find((q) => q.station && q.station.id === 'sawmill'); return { x: w.x, y: w.y }; });
    await ev(([x, y]) => window.__FV.camera(x, y, 1.2), [p.x, p.y]);
    await adv(0.3);
    await shot('02_porter_back_carry');
    await ev(() => window.__FV.camera());
  }

  // 4. clerks ring the register at the serve anim's hand-over frame; the trade clerk and merchant stand apart
  {
    await ev(() => {
      const gs = window.__FV.scene; window.__rings = [];
      for (const reg of [gs.market.register, gs.trade.register]) {
        const c = reg.clerk; if (!c || c.__spy) continue;
        c.__spy = true;
        const orig = c.ring.bind(c);
        c.ring = () => { const ad = c.def.anims[c.animRes] || {}; window.__rings.push({ anim: c.animRes, frame: c.sprite.anims.currentFrame ? c.sprite.anims.currentFrame.index - 1 : -1, impact: ad.impactFrame, key: c.key }); orig(); };
      }
      for (let i = 0; i < 10; i++) gs.market.stock.push('item_fish_cooked', null, gs.effects);
      window.__FV.teleport(990, 1500);
    });
    await wait(() => window.__rings.length >= 2, 60);
    const rings = await ev(() => window.__rings);
    const okR = rings.length > 0 && rings.every((r) => r.anim !== 'serve' || r.impact === undefined || r.frame === r.impact);
    step('clerk rings at the serve hand-over frame (sfx_register)', okR, JSON.stringify(rings.slice(0, 3)));
    const tr = await ev(() => { const gs = window.__FV.scene, T = gs.trade, c = T.register.clerk, m = T.merchant; return c ? { d: Math.round(Math.hypot(c.x - m.x, (c.y - m.y) * 2)), clerk: [Math.round(c.x), Math.round(c.y)], merchant: [Math.round(m.x), Math.round(m.y)], state: c.state } : null; });
    step('trade post: clerk behind the stall, merchant in front (apart)', tr && tr.d > 40 && tr.state === 'post', JSON.stringify(tr));
    const tp = await where('tradeRegister');
    await ev(([x, y]) => window.__FV.camera(x, y + 20, 1.3), [tp.x, tp.y]);
    await adv(0.5);
    await shot('03_trade_clerk');
    await ev(() => window.__FV.camera());
  }

  // 6. houses: past the population limit people wait for a house, then walk in to it
  {
    const pop = (await st()).population;
    const plot = 'v_house1';
    const built = await ev((id) => window.__FV.build(id, 'house_c'), plot);
    await ev((id) => window.__FV.supply(id), plot);
    const h = await where('site:' + plot);
    await ev(([x, y]) => window.__FV.camera(x - 60, y, 0.9), [h.x, h.y]);
    await wait((id) => window.__FV.state().sites[id] && window.__FV.state().sites[id].state === 'done', 40, plot);
    await adv(2.5);
    await shot('05_house_move_in');
    await adv(6);
    const pop2 = (await st()).population;
    step('people wait for houses past the limit', pop.waiting > 0 && pop.people === pop.cap, JSON.stringify(pop));
    step('a new house: the limit rises, waiting people move in', built && pop2.cap > pop.cap && pop2.people > pop.people && pop2.waiting < pop.waiting, `${JSON.stringify(pop)} -> ${JSON.stringify(pop2)}`);
    await ev(() => window.__FV.camera());
  }

  // 5. every v3 building, then the store: clerk between the shop and its counter overlay
  await ev(() => window.__FV.unlockV3());
  await adv(3);
  s = await st();
  step('unlockV3: three lands open, all buildings stand', s.territory.east && s.territory.south && s.territory.se && ['toolsmith', 'boathouse', 'warehouse', 'cannery', 'store'].every((k) => s.built[k]) && (s.built.house_a || 0) + (s.built.house_b || 0) + (s.built.house_c || 0) >= 2, JSON.stringify(s.built));
  {
    await ev(() => { const gs = window.__FV.scene; for (let i = 0; i < 6; i++) gs.store.stock.push('item_can', null, gs.effects); });
    await wait(() => (window.__FV.scene.progress.flags.firstStoreSale || window.__FV.state().store.waitingPay), 60);
    await walk(await where('storeRegister'));
    await wait(() => window.__FV.scene.progress.flags.firstStoreSale, 40);
    await wait(() => window.__FV.state().pads.includes('hire_clerk_store'), 10);
    s = await st();
    step('store: first sale at the register opens the clerk pad', s.pads.includes('hire_clerk_store'), s.pads.join(','));
    await walk(await where('hire_clerk_store'));
    await wait(() => window.__FV.state().store.clerk, 10);
    await wait(() => { const c = window.__FV.scene.store.register.clerk; return c && c.state === 'post'; }, 40);
    const dep = await ev(() => { const S = window.__FV.scene.store, r = S.register, c = r.clerk; return { shop: S.img.depth, clerk: c ? c.sprite.depth : null, overlay: r.overlay ? r.overlay.depth : null, state: c && c.state }; });
    step('store clerk drawn between shop (d) and counter overlay (d+1)', dep.clerk !== null && dep.overlay !== null && dep.shop < dep.clerk && dep.clerk < dep.overlay && Math.abs(dep.clerk - dep.shop - 0.5) < 0.01, JSON.stringify(dep));
    const sr = await where('storeRegister');
    await ev(([x, y]) => window.__FV.camera(x - 20, y - 40, 1.3), [sr.x, sr.y]);
    await adv(0.5);
    await shot('04_store_clerk');
    await ev(() => window.__FV.camera());
  }

  // 7. warehouse: overflow from a full output pad goes in, an empty shelf is restocked from it
  {
    // (everything else that takes ingots is full, so the overflow has nowhere to go but the warehouse)
    await ev(() => {
      const gs = window.__FV.scene; const S = gs.stations.smelter;
      for (let i = 0; i < S.outStack.max; i++) S.outStack.push('item_ingot', null, gs.effects);
      for (const w of gs.workshops) while (w.roomFor('item_ingot') > 0) w.inStack.push('item_ingot', null, gs.effects);
      while (gs.trade.stock.countOf('item_ingot') < gs.trade.maxPerType) gs.trade.stock.push('item_ingot', null, gs.effects);
    });
    const w0 = (await st()).warehouse.total;
    await wait((n) => window.__FV.state().warehouse.total > n, 150, w0);
    const w1 = (await st()).warehouse;
    // (when it fails: what the warehouse porters were doing, and how full the outputs were)
    const why = w1.total > w0 ? '' : ' ' + JSON.stringify(await ev(() => { const gs = window.__FV.scene; return { porters: gs.porters.filter((p) => p.wh).map((p) => [p.state, p.job && p.job.kind, p.job && p.job.src && p.job.src.id, Math.round(p.x), Math.round(p.y)]), room: gs.warehouse && gs.warehouse.room, full: gs.sources().filter((q) => q.outStack && q.outStack.max > 0 && q.outStack.count / q.outStack.max >= 0.6).map((q) => q.id) }; }));
    step('warehouse takes overflow from a full output pad', w1.total > w0, `${w0} -> ${JSON.stringify(w1)}${why}`);
    // the smelter's own pad is emptied so only the warehouse can bring ingots back to the empty shelf
    await ev(() => { const gs = window.__FV.scene; gs.trade.stock.clear(gs.effects); gs.stations.smelter.outStack.clear(gs.effects); gs.stations.smelter.inStack.clear(gs.effects); window.__whOut = 0; for (const p of gs.warehouse.porters) { const o = p.think.bind(p); p.think = () => { const j = o(); if (j && j.kind === 'out') window.__whOut++; return j; }; } });
    const t0 = (await st()).trade.stock;
    await wait((n) => window.__FV.state().trade.stock > n && window.__whOut > 0, 120, t0);
    s = await st();
    { const outs = await ev(() => window.__whOut); step('warehouse restocks an empty shelf', s.trade.stock > t0 && outs > 0, `trade stock ${t0} -> ${s.trade.stock}, warehouse 'out' jobs ${outs}, stored ${w1.total} -> ${s.warehouse.total}`); }
    const wp = await where('warehouseOut');
    await ev(([x, y]) => window.__FV.camera(x - 80, y - 60, 0.9), [wp.x, wp.y]);
    await adv(0.5);
    await shot('06_warehouse');
    await ev(() => window.__FV.camera());
  }

  // 8. boats: the rowboat (coins), then the fishing boat (coins + a rod from the toolsmith) brings tuna
  {
    await walk(await where('boat_rowboat'));
    await wait(() => window.__FV.state().done.includes('boat_rowboat'), 10);
    await wait(() => window.__FV.state().pads.includes('boat_fishing'), 10);
    await ev(() => { window.__FV.clearStack(); const gs = window.__FV.scene; gs.player.stack.push('item_rod', null, gs.effects); });
    // (v3.5) a pad that appears under the chief waits until he steps off it once (no accidental payments)
    const bf = await where('boat_fishing');
    await walk({ x: bf.x - 130, y: bf.y + 40 });
    await adv(0.3);
    await walk(bf);
    await wait(() => window.__FV.state().done.includes('boat_fishing'), 15);
    s = await st();
    step('fishing boat bought with coins + a rod', s.done.includes('boat_fishing') && s.boat && s.boat.level === 2, JSON.stringify(s.boat));
    await ev(() => window.__FV.clearStack());
    await wait(() => { const b = window.__FV.state().boat; return b && (b.state === 'out' || b.state === 'fish'); }, 40);
    const b = await where('boat');
    if (b) { await ev(([x, y]) => window.__FV.camera(x, y, 1.0), [b.x, b.y]); await adv(0.4); await shot('07_fishing_boat_wake'); await ev(() => window.__FV.camera()); }
    await wait(() => { const gs = window.__FV.scene; return gs.boathouse.outStack.countOf('item_fish_big') > 0 || gs.porters.some((p) => p.stack.items.some((i) => i.type === 'item_fish_big')) || (gs.workshops.find((w) => w.kind === 'cannery') || { inStack: { countOf: () => 0 } }).inStack.countOf('item_fish_big') > 0; }, 150);
    const big = await ev(() => { const gs = window.__FV.scene; return gs.boathouse.outStack.countOf('item_fish_big') + gs.porters.reduce((a, p) => a + p.stack.items.filter((i) => i.type === 'item_fish_big').length, 0) + gs.workshops.reduce((a, w) => a + w.inStack.countOf('item_fish_big'), 0); });
    step('the fishing boat lands big fish (tuna)', big > 0, 'big=' + big);
  }

  // 9. the finale: every v3 goal reached -> celebration once
  {
    await ev(() => { const pr = window.__FV.scene.progress; pr.flags.fedMiners = true; for (const id of ['hire2_lumberjack']) if (pr.pads[id]) window.__FV.completeStep(id); });
    await wait(() => window.__FV.state().celebrated3, 30);
    s = await st();
    step('v3 complete: all goals -> celebration', s.v3Complete && s.celebrated3, `v3Complete=${s.v3Complete} celebrated3=${s.celebrated3} goal=${s.goal}`);
    await adv(1.5);
    await shot('08_v3_complete');
  }
  step('no placeholder art', (await ev(() => window.__FV.warnings())).length === 0, (await ev(() => window.__FV.warnings())).join(','));
} catch (e) {
  fatal = e;
  console.log('FATAL', e && e.stack || e);
}
await browser.close();
await srv.close();
console.log('page/console errors:', log.errors.length);
for (const e of log.errors.slice(0, 6)) console.log('  ' + e.slice(0, 400));
const failed = results.filter((r) => !r.ok);
const ok = !fatal && log.errors.length === 0 && failed.length === 0;
console.log(`\n${ok ? 'PASS' : 'FAIL'}: ${results.length - failed.length}/${results.length} checks, ${log.errors.length} errors`);
process.exit(ok ? 0 : 1);
