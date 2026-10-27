// (v4.2.1 고기 통조림, docs/build_reports/v421_l0.md §10) browser suite, fixed-step clock.
//   node tools/test/meatcan.mjs [--minutes 8]
// 1 (the 25-min save, at village complete) nothing of it yet: no pad, the 잡화점 does not list meat cans and its guests
//   come at the old pace, no '고기 통조림' standing card, a cannery (if built) refuses raw meat
// 2 (the 46-min save) before buying: the cannery refuses raw meat, carriers never bring any; the pad comes only after
//   the meat rack stood ≥ meatcan.offerFullAt full for meatcan.offerFullS s (not at 60 s); it stands on open ground
//   beside the cannery's input, apart from every other pad; its banner once (v42.seen.up.mcan)
// 3 paying the pad: flags.meatCan, the cannery takes raw meat and works meatcan.timeMult faster, the two porters
//   come (고기 짐꾼 by the meat rack, 고기 통조림 짐꾼 by the cannery door), the 잡화점 lists meat cans and its guests come
//   meatcan.storeGuestK × as often, the standing cards include '고기 통조림 meatcan.standing'
// 4 within --minutes game minutes: raw meat reaches the cannery's 3rd tower, the cannery makes both cans (it never
//   waits on one input while the other has a batch), meat cans reach the 잡화점 and a customer buys one
// 5 guards (every take from the rack, the whole run): the 고기 짐꾼 starts a load only with the rack ≥ pileFrom and
//   the 훈제장 input ≥ smokeHas of its max, and never takes the rack below pileKeep; the 훈제장 input never runs empty
//   because of him; the cannery's own porters leave meat cans to him below meatcan.shareAt; with the output ≥ farAt
//   full and the 잡화점 farther than farPx his load goes to the 짐 싣는 곳
// 6 save mid-trip + reload: v7, nothing lost (saveLost 0), the flag, both porters back, the cannery's raw meat and
//   meat cans kept, the bag's raw meat back on the rack; no new top-level save field; 0 page errors
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, advance } from './fv_step.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const MINUTES = Number(opt('--minutes', '8'));
const fixture = (n) => fs.readFileSync(path.join(ROOT, 'tools/test/fixtures', n), 'utf8');
const results = [];
const step = (name, ok, info = '') => { results.push({ name, ok: !!ok }); console.log((ok ? '  ok  ' : ' FAIL ') + name + (info !== '' ? '  — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); };

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 390, height: 844 }, dpr: 1 });
const ev = (fn, arg) => page.evaluate(fn, arg);
const adv = (s) => advance(page, s);
const until = async (fn, max, chunk = 0.5, arg) => { for (let t = 0; t <= max; t += chunk) { if (await ev(fn, arg)) return t; await adv(chunk); } return -1; };
const boot = async (sv) => {
  await ev((s) => { const gs = window.__FV && window.__FV.scene; if (gs) gs.save = () => {}; localStorage.clear(); if (s) localStorage.setItem('frostVillage.save.v1', s); }, sv);
  await page.reload({ waitUntil: 'load', timeout: 180000 });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 120000);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player && window.__FV.scene.v42, 180000);
  await sleep(1000);
  await installStepper(page);
  await ev(async () => {
    try { window.__FV.v42.v.seen.whatsNew = 1; } catch (e) { /* */ }
    window.__FV.setInput(0, 0);
    const m = await import(new URL('src/data/balance.js', location.href).href);
    window.__BAL = m.BALANCE;
    // (banners and toasts, with the game time they came at)
    const gs = window.__FV.scene, ui = gs.ui, L = window.__msgs = [];
    const ob = ui.banner.bind(ui), ot = ui.toast.bind(ui);
    ui.banner = (msg, sub) => { L.push({ k: 'banner', m: msg, t: gs.time.now / 1000 }); return ob(msg, sub); };
    ui.toast = (msg, h) => { L.push({ k: 'toast', m: msg, t: gs.time.now / 1000 }); return ot(msg, h); };
  });
};
const park = () => ev(() => { window.__FV.teleport(-200, 700); window.__FV.setInput(0, 0); });
// keep the meat rack full (step 2: the offer clock), or stop doing so
const holdRack = (on) => ev((v) => {
  const gs = window.__FV.scene, p = gs.piles.meat;
  if (window.__hold) { gs.events.off('postupdate', window.__hold); window.__hold = null; }
  if (v) { window.__hold = () => { while (p.stack.count < p.stack.max) p.stack.push(p.item, null, gs.effects); }; gs.events.on('postupdate', window.__hold); }
}, on);

let fatal = null;
try {
  // ======================================================================= 1. the 25-min save
  await boot(fixture('v41_save_smart_25min.json'));
  await park();
  await adv(5);
  const c1 = await ev(() => {
    const gs = window.__FV.scene, M = window.__FV.v42.meatcan(), C = gs.workshops.find((w) => w.kind === 'cannery');
    const st = gs.store, G = gs.v4 && gs.v4.growth;
    return {
      complete: gs.v42.complete, M, due: gs.v42.lines.offers().map((o) => o.id),
      storeLists: st ? st.availableFoods().indexOf('item_can_meat') >= 0 : null, spawnK: st && st.cfg.spawnK ? st.cfg.spawnK() : null,
      standing: G ? G.standingList().some((c) => 'item_can_meat' in c) : null,
      cannery: C ? { accepts: C.sink.accepts('item_meat_raw'), room: C.roomFor('item_meat_raw'), timeMult: C.timeMult() } : null,
    };
  });
  step('1 the 25-min save: no meat-can line, no pad, no offer clock', !c1.M.on && !c1.M.offered && c1.due.indexOf('mcan') < 0, c1);
  step('1 the 잡화점 lists no meat cans, its guests come at the old pace, no meat-can standing card', c1.storeLists !== true && (c1.spawnK === null || c1.spawnK === 1) && c1.standing !== true, c1);
  step('1 a cannery (if built) refuses raw meat and keeps its speed', !c1.cannery || (!c1.cannery.accepts && c1.cannery.room === 0 && c1.cannery.timeMult === 1), c1.cannery || 'no cannery yet');

  // ======================================================================= 2–6 the 46-min save
  await boot(fixture('v41_save_smart_46min.json'));
  await park();
  await ev(() => {
    const gs = window.__FV.scene, C = gs.workshops.find((w) => w.kind === 'cannery');
    // raw meat reaching the cannery's input before the line exists (any carrier) is counted
    window.__meatIn = 0;
    const f = C.inStack.push.bind(C.inStack);
    C.inStack.push = (ty, spr, fx) => { if (ty === 'item_meat_raw' && !gs.v42.meatcan.on) window.__meatIn++; return f(ty, spr, fx); };
    window.__crafted = { item_can: 0, item_can_meat: 0 };
    gs.events.on('crafted', (k, ty) => { if (k === 'cannery') window.__crafted[ty] = (window.__crafted[ty] || 0) + 1; });
    window.__storeMeat = 0;
    gs.events.on('storeSold', (v, c) => { if (c && c.bought && c.bought.indexOf('item_can_meat') >= 0) window.__storeMeat++; });
  });
  const c2a = await ev(() => { const gs = window.__FV.scene, C = gs.workshops.find((w) => w.kind === 'cannery'); return { M: window.__FV.v42.meatcan(), accepts: C.sink.accepts('item_meat_raw'), room: C.roomFor('item_meat_raw'), prio: C.inputPrio('item_meat_raw'), ready: window.__FV.v42.meatcan().ready }; });
  step('2 before buying: the cannery refuses raw meat (accepts false, room 0); the line could be offered (ready)', !c2a.accepts && c2a.room === 0 && c2a.ready && !c2a.M.on, c2a);
  await ev(() => window.__FV.v42.meatcan({ fullT: 0 }));
  await holdRack(true);
  await adv(60);
  const c2b = await ev(() => ({ M: window.__FV.v42.meatcan(), pad: !!window.__FV.scene.v42.lines.pads.mcan }));
  step('2 60 s with the rack full: not offered yet', !c2b.M.offered && !c2b.pad, c2b.M);
  const tOffer = await until(() => !!window.__FV.scene.v42.lines.pads.mcan, 45, 1);
  const c2c = await ev(() => {
    const gs = window.__FV.scene, M = window.__FV.v42.meatcan(), pad = gs.v42.lines.pads.mcan, C = gs.workshops.find((w) => w.kind === 'cannery');
    if (!pad) return { M };
    const others = Object.values(gs.v42.lines.pads).filter((q) => q !== pad).map((q) => ({ x: q.x, y: q.y }))
      .concat(Object.values(gs.progress.pads || {}).filter((q) => q && q.x !== undefined && q.active && !q.done).map((q) => ({ x: q.x, y: q.y })))
      .concat([C.inPad, C.outPad, C.op ? C.op : null].filter(Boolean).map((q) => ({ x: q.x, y: q.y })));
    const near = others.map((q) => Math.round(Math.hypot(q.x - pad.x, (q.y - pad.y) * 2))).sort((a, b) => a - b)[0];
    return { M, x: Math.round(pad.x), y: Math.round(pad.y), dIn: Math.round(Math.hypot(pad.x - C.inPad.x, pad.y - C.inPad.y)), open: !gs.collision.blocked(pad.x, pad.y, 16) && gs.collision.inWalk(pad.x, pad.y), near, label: pad.opts.labelFn(), cost: pad.cost, kind: pad.kind };
  });
  step('2 after ≈ offerFullS s the pad appears (' + (60 + tOffer) + ' s), ' + (c2c.label || '?') + ' · ' + c2c.cost, tOffer >= 0 && c2c.M.offered && c2c.label === '고기 통조림 기계' && c2c.cost === 1500, c2c);
  step('2 the pad stands on open ground beside the cannery\'s input, apart from every other pad', c2c.open && c2c.dIn < 320 && c2c.near >= 90, c2c);
  await adv(8);
  const c2d = await ev(() => ({ seen: (window.__FV.scene.v42.seen.up || {}).mcan || 0, msgs: (window.__msgs || []).filter((q) => /남는 고기로 통조림/.test(q.m)).length }));
  step('2 its banner once (v42.seen.up.mcan)', c2d.seen === 1 && c2d.msgs === 1, c2d);
  await holdRack(false);

  // ======================================================================= 3. pay the pad
  await ev(([x, y]) => { const gs = window.__FV.scene; gs.economy.coins = Math.max(gs.economy.coins, 5000); window.__FV.teleport(x, y); window.__FV.setInput(0, 0); }, [c2c.x, c2c.y]);
  const tPaid = await until(() => window.__FV.scene.v42.meatcan.on, 15, 0.5);
  await park();
  await adv(2);
  const c3 = await ev(() => {
    const gs = window.__FV.scene, M = window.__FV.v42.meatcan(), C = gs.workshops.find((w) => w.kind === 'cannery'), p = gs.piles.meat, st = gs.store, G = gs.v4.growth;
    const R = gs.v42.meatcan.rawPorter, P = gs.v42.meatcan.goodsPorter;
    return {
      on: M.on, flag: !!gs.progress.flags.meatCan, pad: !!gs.v42.lines.pads.mcan, paidLeft: gs.v42.lines.paid.mcan || 0,
      accepts: C.sink.accepts('item_meat_raw'), prio: C.inputPrio('item_meat_raw'), smokePrio: gs.stations.smokehouse.inSink.prio('item_meat_raw'), timeMult: C.timeMult(),
      raw: R ? { inRaw: gs.rawPorters.indexOf(R) >= 0, dRack: Math.round(Math.hypot(R.home[0] - p.x, R.home[1] - p.y)), bag: R.stack.max } : null,
      goods: P ? { inPorters: gs.porters.indexOf(P) >= 0, only: P.only, dDoor: Math.round(Math.hypot(P.home[0] - C.outPad.x, P.home[1] - C.outPad.y)) } : null,
      storeLists: st.availableFoods().indexOf('item_can_meat') >= 0, spawnK: st.cfg.spawnK(), standing: G.standingList().find((c) => 'item_can_meat' in c) || null,
    };
  });
  step('3 paying the pad (' + tPaid + ' s): the line is on (flags.meatCan), the pad is gone', c3.on && c3.flag && !c3.pad && !c3.paidLeft, c3);
  step('3 the cannery takes raw meat now, below the 훈제장 (prio ' + c3.prio + ' < ' + c3.smokePrio + '), and works × ' + c3.timeMult, c3.accepts && c3.prio === 41 && c3.smokePrio > c3.prio && Math.abs(c3.timeMult - 0.7) < 1e-9, c3);
  step('3 the 고기 짐꾼 waits by the meat rack (bag 12), the 고기 통조림 짐꾼 by the cannery door', !!c3.raw && c3.raw.inRaw && c3.raw.dRack < 140 && c3.raw.bag === 12 && !!c3.goods && c3.goods.inPorters && c3.goods.only === 'item_can_meat' && c3.goods.dDoor < 240, c3);
  step('3 the 잡화점 lists meat cans, its guests come × 0.75 as often, a standing card 고기 통조림 30', c3.storeLists && c3.spawnK === 0.75 && c3.standing && c3.standing.item_can_meat === 30, c3);

  // ======================================================================= 4–5. the line at work; the guards
  await ev(() => {
    const gs = window.__FV.scene, p = gs.piles.meat, S = gs.stations.smokehouse, MP = gs.v42.meatcan.rawPorter;
    window.__takes = []; window.__smokeEmpty = 0; window.__smokeEmptyAway = 0; window.__never = { fish: 0, meat: 0 }; window.__padMeat = 0;
    const f = p.takeTo.bind(p);
    p.takeTo = (ch, cap) => { if (ch === MP) window.__takes.push({ rack: p.count, smoke: S.inStack.count + S.inStack.incoming, have: ch.stack.count + ch.stack.incoming, t: +window.__step.t.toFixed(1) }); return f(ch, cap); };
    // (1 Hz) the 훈제장 input empty; a batch ready while the cannery stood idle with room (it never waits on one input)
    let acc = 0;
    window.__mon = (dt) => { acc += dt; if (acc < 1) return; acc = 0;
      const C = gs.workshops.find((w) => w.kind === 'cannery');
      if (S.inStack.count === 0) { window.__smokeEmpty++; if (MP.state === 'haul' && MP.stack.count > 0) window.__smokeEmptyAway++; }
      const k = C.canKind();
      window.__padMeat = Math.max(window.__padMeat, C.outStack.countOf('item_can_meat'));
      // (ready at two samples in a row: an input that lands after the cannery's own update in the same frame is not
      //  a stall)
      const ready = k && C.operated() && !C.working && C.outStack.count + C.outStack.incoming + 3 <= C.outStack.max && C.idleT > 1.5 ? k : null;
      if (ready && window.__readyPrev === ready) window.__never[k]++;
      window.__readyPrev = ready;
    };
    gs.events.on('postupdate', () => window.__mon(1 / 60));
  });
  let saw = { meatIn: false, both: false, store: false, sold: false };
  for (let t = 0; t < MINUTES * 60; t += 15) {
    await adv(15);
    const s = await ev(() => { const gs = window.__FV.scene, C = gs.workshops.find((w) => w.kind === 'cannery'); return { meat: C.inStack.countOf('item_meat_raw'), made: Object.assign({}, C.madeKinds), store: gs.store.stock.countWithIncoming('item_can_meat'), sold: window.__storeMeat }; });
    if (s.meat > 0 || s.made.meat > 0) saw.meatIn = true;
    if (s.made.meat > 0 && s.made.fish > 0) saw.both = true;
    if (s.store > 0 || s.sold > 0) saw.store = true;
    if (s.sold > 0) saw.sold = true;
    if (saw.both && saw.sold && t >= 120) break;
  }
  const c4 = await ev(() => { const gs = window.__FV.scene; return { M: window.__FV.v42.meatcan(), crafted: window.__crafted, sold: window.__storeMeat, meatBefore: window.__meatIn, never: window.__never, padMeat: window.__padMeat, padMax: window.__BAL.meatcan.padMax, out: window.__BAL.meatcan.out, t: +window.__step.t.toFixed(0) }; });
  step('4 nobody brought raw meat to the cannery before the line was bought', c4.meatBefore === 0, c4.meatBefore);
  step('4 raw meat reaches the cannery\'s 3rd tower; it makes fish cans and meat cans (' + c4.M.cannery.made.fish + ' · ' + c4.M.cannery.made.meat + ' batches)', saw.meatIn && saw.both && c4.crafted.item_can_meat > 0 && c4.crafted.item_can > 0, { saw, crafted: c4.crafted });
  step('4 meat cans reach the 잡화점 and a customer buys one (' + c4.sold + ')', saw.store && c4.sold > 0, { saw, sold: c4.sold });
  // (the 7th tower is drawn: every meat can on the 잡화점 shelf has a real place, baked or as a sprite — a 6-tower
  //  layout left it at NaN, unseen)
  const c4b = await ev(() => {
    const gs = window.__FV.scene, st = gs.store.stock, fx = gs.effects;
    while (st.countOf('item_can_meat') < 3) st.push('item_can_meat', null, fx);
    const lay = () => { st.layout(st.bx || gs.store.shelf.x, st.by || gs.store.shelf.y, 1000); const bad = []; for (const it of st.items) { if (it.type !== 'item_can_meat') continue; const x = it.spr ? it.spr.x : it.x, y = it.spr ? it.spr.y : it.y; if (!Number.isFinite(x) || !Number.isFinite(y)) bad.push([x, y]); } return bad; };
    const bad = lay();
    // the sprite path too (what a stack falls back to when the shared bake texture has no room; it stays so)
    if (st.materialize) st.materialize(); else st.bakeOn = false;
    const bad2 = lay();
    return { n: st.countOf('item_can_meat'), bad, bad2, col: st.typeCols.item_can_meat, cols: st.cols.length };
  });
  step('4 the 잡화점\'s 7th tower (meat cans) stands at a real place, baked and as sprites', c4b.n > 0 && !c4b.bad.length && !c4b.bad2.length, c4b);
  step('4 the cannery never stood idle with a batch ready (1 Hz, operated, room on the pad)', c4.never.fish === 0 && c4.never.meat === 0, c4.never);
  step('4 meat cans on the pad stay under meatcan.padMax + one batch (' + c4.padMeat + ' ≤ ' + (c4.padMax + c4.out - 1) + '): the rest of the pad is for fish cans', !(c4.padMax > 0) || c4.padMeat <= c4.padMax + c4.out - 1, { padMeat: c4.padMeat, padMax: c4.padMax });
  const g = await ev(() => {
    const B = window.__BAL.meatcan, p = window.__FV.scene.piles.meat, S = window.__FV.scene.stations.smokehouse, T = window.__takes;
    const keep = Math.ceil(p.stack.max * B.pileKeep), from = p.stack.max * B.pileFrom, sm = S.inStack.max * B.smokeHas;
    const starts = T.filter((q) => q.have === 0);
    return { takes: T.length, starts: starts.length, badStart: starts.filter((q) => q.rack < from || q.smoke < sm).slice(0, 3), belowKeep: T.filter((q) => q.rack <= keep).slice(0, 3), smokeLow: T.filter((q) => q.smoke < sm).slice(0, 3), keep, from, sm, smokeEmpty: window.__smokeEmpty, smokeEmptyAway: window.__smokeEmptyAway };
  });
  step('5 the 고기 짐꾼 starts a load only with the rack ≥ ' + g.from + ' and the 훈제장 input ≥ ' + g.sm + ' (' + g.starts + ' loads, ' + g.takes + ' takes)', g.starts > 0 && g.badStart.length === 0 && g.smokeLow.length === 0, g);
  step('5 he never takes the rack down to its keep (' + g.keep + ')', g.belowKeep.length === 0, g.belowKeep);
  step('5 the 훈제장 input never ran empty while he carried meat away', g.smokeEmptyAway === 0, { smokeEmpty: g.smokeEmpty, whileAway: g.smokeEmptyAway });
  // the cannery's own porters leave the meat cans to him below shareAt; with the output ≥ farAt full and the 잡화점 far, his load is exported
  const c5 = await ev(() => {
    const gs = window.__FV.scene, C = gs.workshops.find((w) => w.kind === 'cannery'), B = window.__BAL.meatcan, P = gs.v42.meatcan.goodsPorter;
    const p1 = gs.porters.find((q) => q.station === C && q.role === 'porter' && !q.only);
    const out = C.outStack;
    out.clear(gs.effects);
    // (the 잡화점's meat tower well stocked: not 'running out', so a jam may be exported)
    while (gs.store.stock.countOf('item_can_meat') < 20) gs.store.stock.push('item_can_meat', null, gs.effects);
    for (let i = 0; i < B.shareAt - 1; i++) out.push('item_can_meat', null, gs.effects);
    const below = p1 ? p1.skips('item_can_meat') : null;
    out.push('item_can_meat', null, gs.effects);
    const at = p1 ? p1.skips('item_can_meat') : null;
    while (out.count < out.max * B.farAt + 1) out.push('item_can_meat', null, gs.effects);
    const dStore = Math.round(Math.hypot(gs.store.sink.x - C.outPad.x, gs.store.sink.y - C.outPad.y));
    const keepX = P.x, keepY = P.y; P.x = P.home[0]; P.y = P.home[1];
    const plan = P.pickPlan();
    // (the 잡화점's meat tower nearly empty (a shelf ≥ SHELF_LOW): the same jam goes to the 잡화점 first)
    while (gs.store.stock.countOf('item_can_meat') > 0) { const it = gs.store.stock.pop('item_can_meat'); if (it && it.spr) gs.effects.releaseItem(it.spr); }
    const planLow = P.pickPlan();
    P.x = keepX; P.y = keepY;
    return { p1: !!p1, below, at, fish: p1 ? p1.skips('item_can') : null, dStore, farPx: B.farPx, plan: plan ? { sink: plan.sink.id, type: plan.type, n: plan.n, jam: !!plan.jam } : null, planLow: planLow ? { sink: planLow.sink.id, type: planLow.type, jam: !!planLow.jam } : null, onlySkipsFish: P.skips('item_can') };
  });
  step('5 the cannery\'s porter leaves meat cans below shareAt (12), helps at 12, never skips fish cans', c5.p1 && c5.below === true && c5.at === false && c5.fish === false, c5);
  step('5 the 고기 통조림 짐꾼 carries meat cans only; output ≥ farAt full and the 잡화점 ' + c5.dStore + ' px away (> ' + c5.farPx + '): the load goes to the 짐 싣는 곳', c5.onlySkipsFish && (c5.dStore <= c5.farPx || (c5.plan && c5.plan.sink === 'dock_surplus' && c5.plan.jam && c5.plan.type === 'item_can_meat')), c5);
  step('5 … unless the 잡화점\'s meat tower is nearly empty: then the 잡화점 first', c5.dStore <= c5.farPx || (c5.planLow && c5.planLow.sink === 'store_shelf' && !c5.planLow.jam), c5.planLow);
  await ev(() => { const gs = window.__FV.scene, C = gs.workshops.find((w) => w.kind === 'cannery'); while (C.outStack.count > 6) C.outStack.pop('item_can_meat'); });

  // ======================================================================= 6. save mid-trip + reload
  const tTrip = await until(() => { const R = window.__FV.scene.v42.meatcan.rawPorter; return R.state === 'haul' && R.stack.count > 0 && R.stack.incoming === 0; }, 180, 0.5);
  const s6 = await ev(() => {
    const gs = window.__FV.scene, C = gs.workshops.find((w) => w.kind === 'cannery'), R = gs.v42.meatcan.rawPorter, P = gs.v42.meatcan.goodsPorter, p = gs.piles.meat;
    gs.save(true);
    const blob = JSON.parse(localStorage.getItem('frostVillage.save.v1'));
    return {
      save: localStorage.getItem('frostVillage.save.v1'), lost: gs.saveLost, carry: R.stack.count, goodsCarry: P.stack.count, goodsType: P.carriedType(),
      ws: blob.v3.workshops.cannery, pile: blob.labour.piles.meat, rackNow: p.count, flag: !!blob.progress.flags.meatCan, v: blob.v, top: Object.keys(blob),
    };
  });
  const keys0 = Object.keys(JSON.parse(fixture('v41_save_smart_46min.json')));
  step('6 save mid-trip (the 고기 짐꾼 carrying ' + s6.carry + '): v7, saveLost 0, the flag, his load saved on the rack', tTrip >= 0 && s6.v === 7 && s6.lost === 0 && s6.flag && s6.pile >= Math.min(s6.rackNow + s6.carry, 80), { t: tTrip, lost: s6.lost, carry: s6.carry, pile: s6.pile, rackNow: s6.rackNow, ws: s6.ws });
  step('6 no new top-level save field', s6.top.filter((k) => keys0.indexOf(k) < 0 && ['v42', 'bank', 'logistics'].indexOf(k) < 0).length === 0, s6.top.filter((k) => keys0.indexOf(k) < 0));
  await boot(s6.save);
  await park();
  const r6 = await ev(() => {
    const gs = window.__FV.scene, C = gs.workshops.find((w) => w.kind === 'cannery'), M = window.__FV.v42.meatcan();
    // (the 고기 통조림 짐꾼 is back at the pad and may already have the restored cans in his bag: the store is far, so
    //  in the boot's first second they can only be on the pad or with him)
    const P = gs.v42.meatcan.goodsPorter, inBag = P ? P.stack.countOf('item_can_meat') + P.stack.inTypes.filter((q) => q === 'item_can_meat').length : 0;
    return { on: M.on, raw: !!M.rawPorter, goods: !!M.goodsPorter, rawInList: gs.rawPorters.filter((r) => r.mcan).length, goodsInList: gs.porters.filter((q) => q.only === 'item_can_meat').length, meat: C.inStack.countOf('item_meat_raw'), outs: { can: C.outStack.countOf('item_can'), meat: C.outStack.countOf('item_can_meat'), withPorter: C.outStack.countOf('item_can_meat') + inBag }, rack: gs.piles.meat.count, store: gs.store.stock.countOf('item_can_meat'), timeMult: C.timeMult() };
  });
  const wsIn = (s6.ws && s6.ws.ins && s6.ws.ins.item_meat_raw) || 0, wsOut = (s6.ws && s6.ws.outs && s6.ws.outs.item_can_meat) || 0;
  step('6 reload: the line on, both porters back once each, the cannery\'s raw meat (' + wsIn + ') and meat cans (' + wsOut + ') kept', r6.on && r6.raw && r6.goods && r6.rawInList === 1 && r6.goodsInList === 1 && r6.meat === Math.min(wsIn, 18) && r6.outs.withPorter === Math.min(wsOut, 30) && Math.abs(r6.timeMult - 0.7) < 1e-9, { r6, wsIn, wsOut });
  await adv(30);
  const r6b = await ev(() => { const M = window.__FV.v42.meatcan(); return { raw: M.rawPorter, made: M.cannery.made }; });
  step('6 after the reload the line works on', !!r6b.raw, r6b);
} catch (e) {
  fatal = e;
  console.log('FATAL', e && e.stack || e);
}
const errs = log.errors.filter((m) => !/favicon|net::ERR/.test(m));
step('page errors: none', errs.length === 0, errs.slice(0, 5));
const okN = results.filter((r) => r.ok).length;
console.log(`meatcan: ${okN}/${results.length} passed`);
await browser.close(); await srv.close();
process.exit(fatal || okN !== results.length ? 1 : 0);
