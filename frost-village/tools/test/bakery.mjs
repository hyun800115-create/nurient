// (v4.3 밀밭 · 빵집) the wheat field and the bakery as two places, fixed-step clock:
//   node tools/test/bakery.mjs [--only layout,fresh,shop,save,old] [--quick] [--shots <dir>]
// 1. layout (read from the running game): the cottage / stall / pads / line / LINE / P2 where world.js puts them (spec §3.3,
//    ±0.4 m), every pad ≥ 1.4 m from the next and on open ground, nothing within 75 px of the main road (x 990), no pad and no
//    wheat plot's tip under the cottage's or the 농막's opaque pixels, the shop's cash pad / food rack / clerk pad uncovered,
//    the field fence with its two tl gaps, the farm_link road gone
// 2. fresh flow (a new game up to the lumberjack): the field pad opens the field (농막, scarecrow, sled, sacks; no bakery yet);
//    빵집 짓기 at R asks 150 + 4 planks and pops the cottage + stall; the chief carries wheat to the oven door through the gate,
//    bakes standing in the doorway (batches of 3 land on the stall's case: none / bread_1 / bread_2), a line forms, he
//    sells at R (the bakery till, firstBreadSale + hints.farm); the 판매원 (80) walks to her post and sells; the 제빵사 (260)
//    goes in by the doorway and loops knead → oven_in → oven_out; 1 loaf / 1.1 s; a full case sends loaves to the rack; the
//    빵 짐꾼 takes rack bread to a low food box (never to its own stall or the shop); the 밀 짐꾼 keeps the oven fed
// 3. the central shop: no bread on its rack (feed refused), no central customer wants bread; stage 3 = mat · fish · meat; the
//    눈꽃 시장 pad only after village complete + the first meat sale
// 4. save mid-flow → reload: bread conserved (case + rack + oven + flying), the till kept, 0 page errors
// 5. old saves (spec §7.9): 0 page errors, bld_bakery / hire_clerk_bakery done iff zone_farm, bread conserved
//    (old market bread + old oven o == stall + rack + 창고 delta + till / 7), coins never lower, no bread on the shop's rack,
//    stage-3 villages show the meat plate
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, advance, until, render } from './fv_step.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, 'fixtures');
const ARG = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
const ONLY = (ARG('--only') || 'layout,fresh,shop,save,old').split(',');
const QUICK = process.argv.includes('--quick');
const SHOTS = ARG('--shots');
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg + (extra !== undefined ? '  — ' + JSON.stringify(extra).slice(0, 300) : '')); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 900) : '')); } };
const t0 = Date.now();

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const pageErrors = [];

async function boot(save, opts = {}) {
  const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: opts.viewport || { width: 390, height: 844 }, dpr: 1 });
  await page.evaluate((sv) => { try { localStorage.clear(); if (sv) localStorage.setItem('frostVillage.save.v1', sv); } catch (e) { /* */ } }, save);
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 180000);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player, 180000);
  await sleep(1500);
  await installStepper(page);
  await page.evaluate(async () => { try { if (window.__FV.scene.v42) window.__FV.scene.v42.seen.whatsNew = 1; } catch (e) { /* */ } window.__BAL = (await import(new URL('src/data/balance.js', location.href).href)).BALANCE; window.__W = (await import(new URL('src/data/world.js', location.href).href)).WORLD; });
  await advance(page, 1);
  return { page, log };
}
const ev = (page, fn, a) => page.evaluate(fn, a);
/** fetch the after-title pages the bakery needs (bakery43, the aunt) */
async function pagesIn(page, keys, maxSec = 40) {
  for (let i = 0; i < maxSec * 2; i++) {
    const r = await ev(page, (ks) => { const g = window.__FV.scene, A = window.__FV.assets(), L = g.load; if (L && L.isLoading()) L.update(); return ks.every((k) => !A.pending(k)); }, keys);
    if (r) return true;
    await advance(page, 0.5); await sleep(200);
  }
  return false;
}
async function shot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await render(page, 3);
  await page.screenshot({ path: path.join(SHOTS, name + '.png') });
}
/** the chief steps to (x, y) in the game (teleport + a moment; the pads see him there) */
async function stand(page, x, y, sec = 0.3) { await ev(page, ([a, b]) => window.__FV.teleport(a, b), [x, y]); await advance(page, sec); }
const MPX = (dx, dy) => Math.hypot(dx / 45.25, dy / 22.63) / Math.SQRT2;          // px offset → metres on the ground (iso)
const gd = (a, b) => Math.hypot((a.x - b.x) / 45.25, (a.y - b.y) / 22.63) / Math.SQRT2;

// ======================================================================================== fresh game up to the bakery
async function toField(page) {
  await ev(page, () => { const F = window.__FV; F.give(20000); for (const id of ['hire_clerk_market', 'op_grill', 'hire_fisherman', 'zone_forest', 'op_sawmill', 'hire_lumberjack']) F.doneStep(id); });
  await advance(page, 2);
}

try {
  // ======================================================================================== 1. layout
  if (ONLY.includes('layout') || ONLY.includes('fresh') || ONLY.includes('shop')) {
    const { page, log } = await boot(null);
    await toField(page);
    // ---------------------------------------------------------------- 2a. the field
    if (ONLY.includes('fresh') || ONLY.includes('layout')) {
      const before = await ev(page, () => { const g = window.__FV.scene, F = window.__FV; return { pad: F.where('zone_farm'), bld: !!g.progress.pads.bld_bakery, built: g.bakery.built, st: g.stations.bakery.enabled }; });
      ok(!!before.pad && !before.bld && !before.built && !before.st, 'the field pad is up; no bakery yet', before);
      const fp = await ev(page, () => { const p = window.__FV.scene.progress.pads.zone_farm; return p ? { cost: p.cost, x: p.x, y: p.y } : null; });
      ok(fp && fp.cost === 150 && fp.x === 1190 && fp.y === 1135, '밀밭 (zone_farm) asks 150 at its old spot', fp);
      await ev(page, () => window.__FV.completeStep('zone_farm'));
      await advance(page, 3);
      await pagesIn(page, ['farm43_hut', 'bakery43_back']);
      const f = await ev(page, () => {
        const g = window.__FV.scene, A = window.__FV.assets();
        const shown = (k) => g.statics.filter((o) => o.visible && o.texture && o.frame && o.frame.name === k).length;
        const pl = g.piles.wheat;
        return { zone: g.zones.farm.unlocked, hut: shown('farm43_hut'), scare: shown('farm43_scarecrow'), sled: shown('farm43_sledcart'), sacks: pl.props.length && pl.props[0].frame ? pl.props[0].frame.name : null,
          bakery: g.bakery.built, stEnabled: g.stations.bakery.enabled, bldPad: g.progress.pads.bld_bakery ? { x: g.progress.pads.bld_bakery.x, y: g.progress.pads.bld_bakery.y, cost: g.progress.pads.bld_bakery.cost, items: g.progress.pads.bld_bakery.items } : null,
          oldHut: g.statics.filter((o) => o.visible && o.frame && o.frame.name === 'worker_hut' && Math.abs(o.x - 1606) < 4).length, art: A.has('farm43_hut') };
      });
      ok(f.zone && f.hut === 1 && f.scare === 1 && f.sled === 1 && f.sacks === 'farm43_sacks', 'the field: 농막, scarecrow, sled cart, grain sacks by the pile', f);
      ok(!f.bakery && !f.stEnabled && f.oldHut === 0, 'no bakery inside the field; the old farmer hut is gone', f);
      ok(f.bldPad && Math.abs(f.bldPad.x - 1244) <= 2 && Math.abs(f.bldPad.y - 1223) <= 2 && f.bldPad.cost === 150 && f.bldPad.items && f.bldPad.items.item_plank === 4, '빵집 짓기 at R (1244, 1223): 150 + 4 planks', f.bldPad);
      await shot(page, 'field_open');
      // ---------------------------------------------------------------- 2b. 빵집 짓기
      await ev(page, () => window.__FV.completeStep('bld_bakery'));
      await advance(page, 3);
      const b = await ev(page, () => {
        const g = window.__FV.scene, F = window.__FV, st = g.stations.bakery, S = g.bakery.stall;
        return { built: g.bakery.built, st: st.enabled, stall: S.enabled, img: st.img.visible, front: !!(st.front && st.front.visible), sign: !!(st.sign && st.sign.visible), walls: st.walls.filter((w) => w.active).length,
          round: st.obstacle.active, reg: F.where('bakeryRegister'), door: F.where('bakeryDoor'), inP: F.where('bakeryIn'), outP: F.where('bakeryOut'), shelf: F.where('bakeryShelf'), cash: F.where('bakeryCash'), stallAt: { x: S.x, y: S.y },
          clerkPad: g.progress.pads.hire_clerk_bakery ? { x: g.progress.pads.hire_clerk_bakery.x, y: g.progress.pads.hire_clerk_bakery.y, cost: g.progress.pads.hire_clerk_bakery.cost } : null, done: !!g.progress.done.bld_bakery };
      });
      ok(b.built && b.st && b.stall && b.img && b.front && b.sign && b.walls === 9 && !b.round, 'the cottage and its stall stand (front layer, sign, 9 wall circles, no round collider)', b);
      ok(b.clerkPad && b.clerkPad.x === 1497 && b.clerkPad.y === 1117 && b.clerkPad.cost === 80, 'the 판매원 pad (80) on the LINE spot (1497, 1117)', b.clerkPad);
      // ---------------------------------------------------------------- 1. layout (the built bakery)
      const L = await ev(page, () => {
        const g = window.__FV.scene, F = window.__FV, W = window.__W, st = g.stations.bakery, S = g.bakery.stall, C = g.collision;
        const pads = { W: F.where('bakeryDoor'), I: F.where('bakeryIn'), O: F.where('bakeryOut'), R: F.where('bakeryRegister'), shelf: F.where('bakeryShelf'), cash: F.where('bakeryCash'), LINE: { x: 1497, y: 1117 }, P2: { x: st.x + W.stationPads.bakery.p2[0], y: st.y + W.stationPads.bakery.p2[1] } };
        const q = []; for (let i = 0; i < 5; i++) q.push(S.slotPos(i));
        const walk = {}; for (const k in pads) walk[k] = C.inWalk(pads[k].x, pads[k].y) && !C.blocked(pads[k].x, pads[k].y, 8);
        const qWalk = q.map((p) => C.inWalk(p.x, p.y) && !C.blocked(p.x, p.y, 10));
        // the opaque pixels of the cottage / 농막 / stall over a point (the real textures)
        const occ = g.occlusion;
        const hut = g.decorById && g.decorById.farm43_hut;
        const under = (p) => { const r = []; for (const [n, im] of [['cottage', st.img], ['front', st.front], ['hut', hut], ['stall', S.img]]) { if (!im || !im.visible) continue; const bb = im.getBounds(); if (p.x < bb.x || p.x > bb.right || p.y < bb.y || p.y > bb.bottom || im.y <= p.y) continue; let s = true; try { s = occ.solid(im, p.x, p.y); } catch (e) { s = true; } if (s) r.push(n); } return r; };
        const cover = {}; for (const k in pads) if (k !== 'W') cover[k] = under(pads[k]);
        const plots = g.wheat.filter((w) => w.x > 1200 && w.x < 1800 && w.y > 1150 && w.y < 1500).map((w) => ({ x: w.x, y: w.y, under: under({ x: w.x, y: w.y + 4 }) }));
        const shop = { cash: under(F.where('cash')), shelf: under(F.where('shelf')), clerk: under({ x: 1525, y: 900 }) };
        const roads = Object.keys(g.roads.nodesByName || {}).length ? null : null;
        const nodes = (W.roads && W.roads.nodes) || {};
        return { pads, q, walk, qWalk, cover, plots, shop, farmLink: !!nodes.farm_link, edges: W.roads.edges.filter((e) => e[0] === 'farm_link' || e[1] === 'farm_link').length, stallAt: { x: S.x, y: S.y }, A: { x: st.x, y: st.y }, fence: W.fences.find((f) => f.zone === 'farm'), roads };
      });
      // (spec §3.3; R and the till moved 0.25 / 0.13 m east within its tolerance: R was 1.19 m from the shelf pad)
      const spec = { W: [1295, 1177], I: [1420, 1182], O: [1352, 1216], R: [1234, 1216], shelf: [1166, 1199], cash: [1185, 1255], LINE: [1497, 1117], P2: [1596, 1112] };
      const off = {}; for (const k in spec) off[k] = +gd(L.pads[k], { x: spec[k][0], y: spec[k][1] }).toFixed(2);
      ok(Object.values(off).every((m) => m <= 0.4) && Math.abs(L.A.x - 1316) <= 2 && Math.abs(L.A.y - 1144) <= 2 && Math.abs(L.stallAt.x - 1176) <= 2 && Math.abs(L.stallAt.y - 1169) <= 2, 'layout: cottage (1316, 1144), stall (1176, 1169) and every pad within 0.4 m of spec §3.3', off);
      const keys = Object.keys(L.pads), close = [];
      for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) { const m = gd(L.pads[keys[i]], L.pads[keys[j]]); if (m < 1.4) close.push(keys[i] + '-' + keys[j] + ':' + m.toFixed(2)); }
      ok(close.length === 0, 'layout: every bakery pad ≥ 1.4 m from the next', close);
      ok(Object.keys(L.walk).every((k) => k === 'W' || L.walk[k]) && L.qWalk.every(Boolean), 'layout: pads and the line on open ground', { walk: L.walk, q: L.qWalk });
      const nearRoad = Object.keys(L.pads).filter((k) => Math.abs(L.pads[k].x - 990) < 75).concat(L.q.filter((p) => Math.abs(p.x - 990) < 75).map(() => 'queue'));
      ok(nearRoad.length === 0 && Math.min(...L.q.map((p) => p.x)) - 990 >= 100, 'layout: nothing within 75 px of the main road (x 990); the line 113 px off it', { nearRoad, q: L.q });
      ok(Object.values(L.cover).every((a) => a.length === 0), 'layout: no pad under the cottage / 농막 / stall pixels', L.cover);
      ok(L.plots.length === 8 && L.plots.every((p) => p.under.length === 0), 'layout: the 8 wheat plots where they were, none under the cottage or the 농막', L.plots);
      ok(L.shop.cash.length === 0 && L.shop.shelf.length === 0 && L.shop.clerk.length === 0, 'layout: the shop\'s cash pad, food rack and clerk pad stay uncovered', L.shop);
      ok(!L.farmLink && L.edges === 0 && L.fence && L.fence.edges.tl && L.fence.edges.tl.length === 2, 'layout: farm_link gone; the field fence has its two tl gaps', L.fence);
      await shot(page, 'bakery_built');
    }
    // ---------------------------------------------------------------- 2c. hands-on: wheat → oven → stall → register
    if (ONLY.includes('fresh')) {
      await pagesIn(page, ['bakery43_back', 'bakery43_stall_back']);
      // the chief carries wheat to I (through the gate) — the walk from the pile
      const walk = await ev(page, () => { const g = window.__FV.scene; const r = g.roads.route(1573, 1302, g.stations.bakery.inPad.x, g.stations.bakery.inPad.y, []); let L = 0, px = 1573, py = 1302; for (const p of r) { L += Math.hypot((p.x - px) / 45.25, (p.y - py) / 22.63) / Math.SQRT2; px = p.x; py = p.y; } return { m: +L.toFixed(2), n: r.length }; });
      ok(walk.m > 0 && walk.m <= 6, 'wheat pile → oven door I: ≤ 6 m through the gate', walk);
      await ev(page, () => { const F = window.__FV, g = F.scene; F.clearStack(); F.carry('item_wheat', 6); });
      const I = await ev(page, () => window.__FV.where('bakeryIn'));
      await stand(page, I.x, I.y, 2);
      const fed = await ev(page, () => ({ wheat: window.__FV.scene.stations.bakery.inStack.count, bag: window.__FV.scene.player.stack.count }));
      ok(fed.wheat === 6 && fed.bag === 0, 'the chief puts 6 wheat at the oven door I', fed);
      // standing on W bakes; batches of 3 land on the case
      const Wp = await ev(page, () => window.__FV.where('bakeryDoor'));
      // (no customers while the batches are counted: they take loaves off the case before they pay)
      await ev(page, () => { const S = window.__FV.scene.bakery.stall; S.spawnT = 1e9; for (const c of S.queue.concat(S.leaving)) { try { c.despawn(); } catch (e) { /* */ } } S.queue.length = 0; S.leaving.length = 0; });
      await stand(page, Wp.x, Wp.y, 0.2);
      const seen = [];
      for (let i = 0; i < 24; i++) { await advance(page, 0.5); const s = await ev(page, () => { const b = window.__FV.bakery(); return { st: b.stall + b.stallIncoming, oven: b.oven, case: b.case, w: b.wheat, anim: window.__FV.scene.player.animName, batches: b.batches }; }); seen.push(s); }
      const stalls = [...new Set(seen.map((s) => s.st))];
      const last = seen[seen.length - 1];
      ok(last.st === 6 && last.w === 0, 'standing in the doorway the chief bakes the 6 wheat: 6 loaves on the case', last);
      ok(stalls.every((n) => n % 3 === 0) && last.batches.join() === '3,3', 'loaves leave the oven in batches of 3', { stalls, batches: last.batches });
      await ev(page, () => { const S = window.__FV.scene.bakery.stall; S.spawnT = 0.5; });
      ok(seen.some((s) => s.anim === 'give'), 'the chief plays give while baking', seen.map((s) => s.anim).slice(0, 4));
      const caseLv = await ev(page, () => window.__FV.bakery().case);
      ok(caseLv === 1, 'the case shows bread_1 for a few loaves', caseLv);
      // a line forms; standing on R takes the payment into the bakery till
      await stand(page, 1000, 1500, 0.2);
      await until(page, () => { const b = window.__FV.bakery(); return b.queue >= 1 && b.waitingPay; }, 60);
      const q = await ev(page, () => window.__FV.bakery());
      ok(q.queue >= 1 && q.queue <= 5 && q.waitingPay && q.till === 0, 'a line forms at the stall (≤ 5); the front customer waits to pay', q);
      const R = await ev(page, () => window.__FV.where('bakeryRegister'));
      await stand(page, R.x, R.y, 0.2);
      await until(page, () => window.__FV.bakery().till > 0, 10);
      const paid = await ev(page, () => { const g = window.__FV.scene; return { till: window.__FV.bakery().till, first: !!g.progress.flags.firstBreadSale, hint: !!g.progress.hints.farm, sold: window.__FV.bakery().sold, shopCash: g.market.cash.value }; });
      ok(paid.till > 0 && paid.till % 7 === 0 && paid.first && paid.hint, 'standing on R takes the payment into the bakery till; firstBreadSale + hints.farm', paid);
      // the 판매원
      await stand(page, 1000, 1500, 0.2);
      await ev(page, () => window.__FV.completeStep('hire_clerk_bakery'));
      await until(page, () => window.__FV.bakery().clerkReady, 20);
      const ck = await ev(page, () => { const S = window.__FV.scene.bakery.stall, c = S.register.clerk; return { ready: c && c.ready, x: Math.round(c.x), y: Math.round(c.y), sx: Math.round(S.register.staff.x), sy: Math.round(S.register.staff.y), key: c.key, padShown: S.register.pad.img.visible }; });
      ok(ck.ready && Math.abs(ck.x - ck.sx) < 3 && Math.abs(ck.y - ck.sy) < 3 && !ck.padShown, 'the 판매원 walks to her post behind the stall; R goes', ck);
      const till0 = await ev(page, () => window.__FV.bakery().till);
      await until(page, () => window.__FV.bakery().stall === 0 && window.__FV.bakery().queue === 0, 60);
      const sold = await ev(page, () => window.__FV.bakery());
      ok(sold.till > till0, 'the 판매원 sells the case empty with nobody at R', { till0, till: sold.till, case: sold.stall });
      // the 제빵사
      await ev(page, () => window.__FV.completeStep('op_bakery'));
      await pagesIn(page, ['bakery43_back'], 10);
      await until(page, () => { const b = window.__FV.bakery().baker; return b && b.ready; }, 30);
      const bk = await ev(page, () => { const g = window.__FV.scene, st = g.stations.bakery, o = st.op.operator; return { ready: o.ready, x: Math.round(o.x), y: Math.round(o.y), px: st.op.post.x, py: st.op.post.y, key: o.key, depth: o.sprite.depth, sty: st.y, padShown: st.op.pad.img.visible }; });
      ok(bk.ready && Math.abs(bk.x - bk.px) < 3 && Math.abs(bk.y - bk.py) < 3 && bk.depth > bk.sty && bk.depth < bk.sty + 1 && !bk.padShown, 'the 제빵사 goes in by the doorway to her post (drawn between the cottage and its sill)', bk);
      // wheat topped up: knead → oven_in → oven_out over 12 s, 1 loaf / 1.1 s over 60+ s
      await ev(page, () => { const g = window.__FV.scene, st = g.stations.bakery; for (let i = 0; i < 30; i++) st.inStack.push('item_wheat', null, g.effects); });
      const anims = new Set(), phases = new Set();
      for (let i = 0; i < 48; i++) { await advance(page, 0.25); const b = await ev(page, () => window.__FV.bakery().baker); anims.add(b.anim); phases.add(b.phase); }
      ok(['knead', 'oven_in', 'oven_out'].every((a) => anims.has(a)), 'the baker loops knead → oven_in → oven_out', [...anims]);
      // 1 loaf / 1.1 s with the wheat topped up and room for the loaves (the case emptied as it fills), over 66 s
      const rate = await ev(page, () => {
        const g = window.__FV.scene, st = g.stations.bakery, S = g.bakery.stall;
        const b0 = st.baked || 0, c0 = st.op.operator.cycles, T = 66;
        for (let i = 0; i < T * 4; i++) {
          window.__step.run(0.25);
          while (st.inStack.count < 20) st.inStack.push('item_wheat', null, g.effects);
          while (S.stock.count > 10) { const it = S.stock.pop('item_bread'); if (it && it.spr) g.effects.releaseItem(it.spr); }
          while (st.outStack.count > 10) { const it = st.outStack.pop('item_bread'); if (it && it.spr) g.effects.releaseItem(it.spr); }
        }
        const n = (st.baked || 0) - b0;
        return { n, perLoaf: +(T / Math.max(1, n)).toFixed(3), cycles: st.op.operator.cycles - c0, batches: st.batches.slice(-8) };
      });
      ok(Math.abs(rate.perLoaf - 1.1) <= 0.11 && rate.cycles > 10, 'the baker makes 1 loaf / 1.1 s (± 10 %), released at oven_out', rate);
      await shot(page, 'bakery_baker');
      // a full case sends the loaves to the rack O
      const full = await ev(page, () => {
        const g = window.__FV.scene, st = g.stations.bakery, S = g.bakery.stall;
        S.spawnT = 1e9; for (const c of S.queue.slice()) { try { c.despawn(); } catch (e) { /* */ } } S.queue.length = 0;
        while (S.stock.count < S.maxPerType) S.stock.push('item_bread', null, g.effects);
        while (st.outStack.count > 0) { const it = st.outStack.pop('item_bread'); if (it && it.spr) g.effects.releaseItem(it.spr); }
        while (st.inStack.count < 20) st.inStack.push('item_wheat', null, g.effects);
        window.__step.run(12);
        return { stall: S.stock.count, max: S.maxPerType, rack: st.outStack.count, case: S.caseShown, fullAt: S.fullAt };
      });
      ok(full.stall === full.max && full.rack >= 6 && full.case === 2, 'a full case (bread_2) sends the loaves to the bread rack O', full);
      // the farmer, then the 밀 짐꾼: the oven stays fed through the wheat gate
      await ev(page, () => { const F = window.__FV; F.completeStep('hire_farmer'); });
      await advance(page, 2);
      await ev(page, () => window.__FV.completeStep('raw_bakery'));
      const feed = await ev(page, () => {
        const g = window.__FV.scene, st = g.stations.bakery, S = g.bakery.stall, pl = g.piles.wheat;
        pl.setShown(true);
        while (st.inStack.count > 0) { const it = st.inStack.pop('item_wheat'); if (it && it.spr) g.effects.releaseItem(it.spr); }
        for (let i = 0; i < 40; i++) pl.stack.push('item_wheat', null, g.effects);
        let gap = 0, worst = 0, fed = 0, seen = new Set();
        const rp = g.rawPorters.find((r) => r.pile === pl);
        for (let i = 0; i < 90 * 4; i++) {
          window.__step.run(0.25);
          while (S.stock.count > 6) { const it = S.stock.pop('item_bread'); if (it && it.spr) g.effects.releaseItem(it.spr); }
          while (st.outStack.count > 6) { const it = st.outStack.pop('item_bread'); if (it && it.spr) g.effects.releaseItem(it.spr); }
          while (pl.stack.count < 30) pl.stack.push('item_wheat', null, g.effects);
          if (i > 60) { if (!st.working && st.inStack.count === 0) { gap += 0.25; worst = Math.max(worst, gap); } else gap = 0; }
          if (rp) seen.add(rp.state);
        }
        return { worst, porter: !!rp, states: [...seen], baked: st.baked };
      });
      ok(feed.porter && feed.worst <= 3.5, 'the 밀 짐꾼 keeps the oven fed through the gate (no stall > 3.5 s)', feed);
      // the 빵 짐꾼: rack bread to a low food box — never to its own stall or the shop
      await ev(page, () => window.__FV.completeStep('porter_bakery'));
      const por = await ev(page, () => {
        const g = window.__FV.scene, st = g.stations.bakery, S = g.bakery.stall, fb = g.foodBox;
        if (fb && !fb.active) fb.activate(true, 0);
        while (S.stock.count > 2) { const it = S.stock.pop('item_bread'); if (it && it.spr) g.effects.releaseItem(it.spr); }
        while (st.outStack.count < 14) st.outStack.push('item_bread', null, g.effects);
        const pr = g.porters.find((w) => w.station === st);
        const dests = new Set(); let carried = 0;
        const fb0 = fb ? fb.count : 0;
        for (let i = 0; i < 60 * 4; i++) { window.__step.run(0.25); if (pr && pr.dest) dests.add(pr.dest.id || (pr.dest === fb ? 'foodbox' : '?')); if (pr && pr.stack.count) carried = Math.max(carried, pr.stack.count); }
        return { porter: !!pr, dests: [...dests], carried, fb: fb ? fb.count - fb0 : null, stallSink: S.sink.id };
      });
      ok(por.porter && por.carried > 0 && por.dests.indexOf(por.stallSink) < 0 && por.dests.indexOf('market_shelf') < 0 && por.fb > 0, 'the 빵 짐꾼 takes rack bread to the miners\' food box (never to its own stall or the shop)', por);
    }
    // ---------------------------------------------------------------- 3. the central shop
    if (ONLY.includes('shop')) {
      const r = await ev(page, () => {
        const g = window.__FV.scene, m = g.market, F = window.__FV;
        F.clearStack(); F.carry('item_bread', 4);
        const fed = m.feedFrom(g.player);
        const wants = []; for (let i = 0; i < 200; i++) wants.push(m.makeWant().type);
        return { fed, accepts: m.sink.accepts('item_bread'), wantsBread: wants.filter((t) => t === 'item_bread').length, foods: m.availableFoods() };
      });
      ok(!r.fed && !r.accepts && r.wantsBread === 0 && r.foods.indexOf('item_bread') < 0, 'the shop: bread is refused on its rack; no central customer wants bread', r);
    }
    ok(log.errors.length === 0, 'fresh: 0 page errors', log.errors.slice(0, 5));
    pageErrors.push(...log.errors);
    await page.context().close();
  }
  // ======================================================================================== 4. save mid-flow → reload
  if (ONLY.includes('save')) {
    const { page, log } = await boot(null);
    await toField(page);
    await ev(page, () => { const F = window.__FV; for (const id of ['zone_farm', 'bld_bakery', 'hire_clerk_bakery', 'op_bakery', 'hire_farmer', 'raw_bakery', 'porter_bakery', 'zone_mine', 'op_smelter', 'hire_miner']) F.doneStep(id); });
    await advance(page, 3);
    const before = await ev(page, () => {
      const g = window.__FV.scene, st = g.stations.bakery, S = g.bakery.stall, fb = g.foodBox;
      if (fb && !fb.active) fb.activate(true, 0);
      const set = (stack, ty, n) => { while (stack.count > n) { const it = stack.pop(ty); if (it && it.spr) g.effects.releaseItem(it.spr); } while (stack.count < n) stack.push(ty, null, g.effects); };
      set(S.stock, 'item_bread', 17); set(st.outStack, 'item_bread', 9); set(st.inStack, 'item_wheat', 5);
      st.oven = 2;
      S.cash.restore(140);
      const pr = g.porters.find((w) => w.station === st);
      if (pr) { for (let i = 0; i < 4; i++) pr.stack.push('item_bread', null, g.effects); const d = pr.planDest(); if (d) pr.startHaul(d); }
      S.caseChanged();
      const fbB = fb ? fb.stock.countOf('item_bread') : 0, whB = g.warehouse ? g.warehouse.count('item_bread') : 0;
      const q = S.queue.reduce((n, c) => n + c.bought.filter((t) => t === 'item_bread').length + (c.flying || []).filter((t) => t === 'item_bread').length, 0);
      const parts = { stall: S.stock.countWithIncoming('item_bread'), rack: st.outStack.count + st.outStack.incoming, oven: st.oven, porter: pr ? pr.stack.count + pr.stack.incoming : 0, fb: fbB, wh: whB, queue: q };
      const sum = Object.values(parts).reduce((a, b) => a + b, 0);
      g.save(true);
      const sv = JSON.parse(localStorage.getItem('frostVillage.save.v1'));
      return { save: localStorage.getItem('frostVillage.save.v1'), sum, parts, saved: { bakery: sv.bakery, oven: sv.stations.bakery, food: sv.v3 && sv.v3.food, wh: sv.v3 && sv.v3.warehouse }, till: S.cash.value, porter: pr ? pr.stack.count : -1, dest: pr && pr.dest ? pr.dest.id || 'foodbox' : null };
    });
    const b2 = await boot(before.save);
    await advance(b2.page, 0.2);
    const after = await ev(b2.page, () => {
      const g = window.__FV.scene, st = g.stations.bakery, S = g.bakery.stall, fb = g.foodBox;
      const fbB = fb ? fb.stock.countWithIncoming('item_bread') : 0, whB = g.warehouse ? g.warehouse.count('item_bread') : 0;
      // ((bakefix) + what is flying from the rack into his bag (popped from the rack, not yet in his stack): the save side counts it too
      const pr = g.porters.filter((w) => w.station === st).reduce((n, w) => n + w.stack.count + w.stack.incoming, 0);
      const parts = { stall: S.stock.countWithIncoming('item_bread'), rack: st.outStack.count + st.outStack.incoming, oven: st.oven, porter: pr, fb: fbB, wh: whB };
      // (loaves baked since the load — the baker works on with the wheat that came back — are new bread: not counted)
      return { sum: Object.values(parts).reduce((a, b) => a + b, 0) - (st.baked || 0), baked: st.baked || 0, parts, till: S.cash.value, built: g.bakery.built, clerk: !!S.register.clerk, baker: !!st.op.operator, stall: S.stock.count, rack: st.outStack.count, wheat: st.inStack.count };
    });
    ok(after.built && after.clerk && after.baker, 'reload: the bakery, its 판매원 and the 제빵사 are back', after);
    ok(after.sum === before.sum, 'reload: every loaf kept (case + rack + oven + carried + food box)', { before: before.sum, after: after.sum, bp: before.parts, ap: after.parts, saved: before.saved, porter: before.porter, dest: before.dest });
    ok(after.till === before.till, 'reload: the bakery till kept', { before: before.till, after: after.till });
    await until(b2.page, () => window.__FV.bakery().queue > 0, 40);
    const q = await ev(b2.page, () => window.__FV.bakery().queue);
    ok(q > 0, 'reload: customers come to the stall again', q);
    ok(log.errors.length === 0 && b2.log.errors.length === 0, 'save: 0 page errors', log.errors.concat(b2.log.errors).slice(0, 4));
    pageErrors.push(...log.errors, ...b2.log.errors);
    await page.context().close(); await b2.page.context().close();
  }

  // ======================================================================================== 5. old saves
  if (ONLY.includes('old')) {
    const FIXT = ['v43a2_bread', 'v35_save_0_5min', 'v35_save_12min', 'v35_save_21min', 'v35_save_38min', 'v41_save_pure_25min', 'v41_save_pure_45min', 'v41_save_smart_25min', 'v41_save_smart_35min', 'v41_save_smart_46min', 'v42_save_office_ttal', 'v42_village_late'];
    for (const f of FIXT) {
      if (QUICK && ['v43a2_bread', 'v41_save_smart_25min', 'v35_save_0_5min'].indexOf(f) < 0) continue;
      const raw0 = JSON.parse(fs.readFileSync(path.join(FIX, f + '.json'), 'utf8'));
      const sv = raw0.keys ? (typeof raw0.keys['frostVillage.save.v1'] === 'string' ? JSON.parse(raw0.keys['frostVillage.save.v1']) : raw0.keys['frostVillage.save.v1']) : raw0;
      const b = await boot(JSON.stringify(sv));
      const r = await ev(b.page, () => {
        const g = window.__FV.scene, L = g.shopLoaded || {}, bk = g.bakery, st = g.stations.bakery;
        const tills = (g.tills || []).reduce((n, c) => n + (c.value || 0), 0);
        return {
          done: Object.keys(g.progress.done).filter((k) => g.progress.done[k]), built: bk.built, clerk: !!bk.stall.register.clerk, bread: L.bread || null,
          shopBread: g.market.stock.countOf('item_bread'), coins: g.economy.coins, tills, stage: g.market.stage,
          plates: (g.market.plates || []).filter((q) => q.on).map((q) => q.key + ':' + (q.icon && q.icon.frame ? q.icon.frame.name : '')),
          lanes: Object.keys(g.market.lanes).filter((k) => g.market.lanes[k].open), meatFlag: !!g.progress.flags.firstMeatSale, mk3: !!g.progress.done.mkt_s3, b3: !!(g.market.seats.B && g.market.seats.B.clerk),
        };
      });
      const pd = sv.progress.done || {}, farm = !!pd.zone_farm;
      const oldBread = Math.max(0, Math.floor(((sv.market || {}).stock || {}).item_bread || 0)), oldO = Math.max(0, Math.floor(((sv.stations || {}).bakery || {}).o || 0));
      const oldTills = ((sv.market || {}).cash || 0) + ((sv.trade || {}).cash || 0);
      ok(b.log.errors.length === 0, f + ': 0 page errors', b.log.errors.slice(0, 3));
      ok(r.built === farm && (r.done.indexOf('bld_bakery') >= 0) === farm && (r.done.indexOf('hire_clerk_bakery') >= 0) === farm && (!farm || r.clerk), f + ': bld_bakery / hire_clerk_bakery done iff the field was open (' + farm + ')', { built: r.built, clerk: r.clerk });
      if (r.bread) {
        const B = r.bread, placed = B.stall + B.rack + B.wh + B.coins / 7;
        ok(placed === oldBread && B.saved === 0 && B.rackAt === Math.min(36, oldO) + B.rack, f + ': the shop\'s ' + oldBread + ' bread moved to the bakery (stall ' + B.stall + ', rack ' + B.rack + ', 창고 ' + B.wh + ', coins ' + B.coins + '), the oven\'s ' + oldO + ' on its rack', B);
      }
      ok(r.shopBread === 0, f + ': no bread on the shop\'s rack', r.shopBread);
      ok(r.coins >= (sv.coins || 0) && r.tills >= oldTills, f + ': coins never lower (wallet ' + r.coins + ' ≥ ' + (sv.coins || 0) + ', tills ' + r.tills + ' ≥ ' + oldTills + ')');
      const lost = Object.keys(pd).filter((k) => pd[k] && r.done.indexOf(k) < 0);
      ok(!lost.length, f + ': every step it had is still done', lost);
      if (r.stage === 3) ok(r.lanes.join() === 'fish,meat' && (r.plates.length === 0 || r.plates.some((q) => /:item_meat_cooked$/.test(q))) && (!pd.hire_clerk_s3 || r.b3), f + ': stage 3 = mat · fish · meat, the meat plate, its clerk kept', { lanes: r.lanes, plates: r.plates, b3: r.b3 });
      pageErrors.push(...b.log.errors);
      await b.page.context().close();
    }
  }
} catch (e) {
  fail++;
  console.log('  FAIL exception: ' + (e && e.stack ? e.stack : e));
}
await browser.close();
srv.close && srv.close();
console.log(`bakery: ${pass} ok, ${fail} failed  (wall ${Math.round((Date.now() - t0) / 1000)}s)`);
process.exit(fail ? 1 : 0);
