// (v4.2.1 물류 손질 / L0, docs/logistics_plan.md §B1 · §15.2) browser suite, fixed-step clock.
//   node tools/test/lgx_l0.mjs [--fresh N] [--minutes 10]
// 1 the 창고 card: locked before village complete (its reason no longer names the south watchtower), open at village
//   complete; on the 25-min saves an M plot is free when it shows and the 창고 is the next goal right after the 대장간;
//   with no free plot the goal waits (the next goal shows) and its line says '빈 땅이 생기면 …'; it can be built and
//   then 짐꾼 2 can be offered (they need the 창고);
// 2 (46-min save, --minutes game minutes, default 10) raw porters never reach the dock or the 창고; every local job
//   starts with the station's input holding ≥ logistics.raw.workS s of work and goes ≤ raw.localPx to a place that
//   uses the raw;
// 3 a local job: with the cannery in reach, the 생선 짐꾼 carries fish to the cannery while the grill is full and
//   busy (and never with raw.workS out of reach);
// 4 the crew's first job with a full output and a long-full pile is the overflow / direct run, not a raw run;
// 5 the crew carries fish from the pile to the cannery (the link) when the cannery runs low;
// 6 the crew does not grow while it is not busy on real-use jobs (use-busy < crew.busyAt) even with the seats there;
//   the gate opens with use-busy ≥ busyAt and a use job waiting ≥ backlogS;
// 7 standing cards pick the surplus item (and the plain rotation with logistics.cards.surplusFirst false);
// 8 after 읍 the founded shops' town buyers come every inlandEveryRank2 s (20) instead of inlandEvery (40);
// 9 save + reload: v7, the crew kept, nothing new in the save; 0 page errors.
// --fresh N: N seeded fresh games (smart bot) to village complete + 3 min: the 창고 card never shows before village
//   complete, and an M plot is free when it first shows (docs/logistics_plan.md §5.2: 5 seeds).
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
const FRESH = Number(opt('--fresh', '0'));
const MINUTES = Number(opt('--minutes', '10'));
const fixture = (n) => fs.readFileSync(path.join(ROOT, 'tools/test/fixtures', n), 'utf8');
const results = [];
const step = (name, ok, info = '') => { results.push({ name, ok: !!ok }); console.log((ok ? '  ok  ' : ' FAIL ') + name + (info !== '' ? '  — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); };
const seedJs = (s) => `(() => { let a = ${s >>> 0}; Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();`;

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
let errors = [];
let page, log, ctx;
const open = async (init) => {
  if (ctx) { errors = errors.concat(log.errors); await ctx.close(); }
  ({ page, log, ctx } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 390, height: 844 }, dpr: 1, init }));
};
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
  });
};
const park = () => ev(() => { window.__FV.teleport(-200, 700); window.__FV.setInput(0, 0); });

let fatal = null;
try {
  await open();
  // ======================================================================= 1. the 창고 card (25-min saves)
  for (const fx of ['v41_save_smart_25min.json', 'v41_save_pure_25min.json']) {
    await boot(fixture(fx));
    await park();
    const c = await ev(() => {
      const gs = window.__FV.scene, pr = gs.progress, out = {};
      const card = () => { const ch = gs.buildChoices({ size: 'M' }).find((q) => q.key === 'warehouse'); return ch ? { locked: ch.locked, reason: ch.reason, text: ch.text } : null; };
      out.complete = pr.complete;
      out.open = card();
      // before village complete (hire_hunter not done): locked, with a reason that no longer names the south tower
      pr.done.hire_hunter = false; out.before = card(); out.goalBefore = pr.nextGoal() ? pr.nextGoal().id : null; pr.done.hire_hunter = true;
      out.goal = pr.nextGoal() ? pr.nextGoal().id : null;
      out.toolsmith = gs.isBuilt('toolsmith');
      out.freeM = Object.keys(gs.sites).filter((k) => { const st = gs.sites[k]; return st.kind === 'plot' && st.state === 'plot' && st.shown && (st.size === 'M' || st.size === 'L') && !st.only; });
      out.line = gs.tutorial.goalText ? gs.tutorial.goalText() : null;
      // no free plot: the goal waits (passive) and the line says so
      const hid = out.freeM.map((k) => gs.sites[k]); for (const st of hid) st.shown = false;
      out.goalNoPlot = pr.nextGoal() ? pr.nextGoal().id : null;
      const keep = pr.nextGoal; pr.nextGoal = () => ({ id: 'warehouse', kind: 'build', waitPlot: true });
      out.lineNoPlot = gs.tutorial.goalText(); pr.nextGoal = keep;
      for (const st of hid) st.shown = true;
      out.goalBack = pr.nextGoal() ? pr.nextGoal().id : null;
      return out;
    });
    step('1 [' + fx + '] the 창고 card is locked before village complete ("마을이 다 갖춰지면")', c.before && c.before.locked && c.before.reason === 'lock_warehouse' && /갖춰지면/.test(c.before.text || '') && !/망루/.test(c.before.text || ''), c.before);
    step('1 [' + fx + '] the 창고 card opens at village complete', c.complete && c.open && !c.open.locked, c.open);
    step('1 [' + fx + '] an M plot is free when it shows; the 창고 is the next goal after the 대장간', c.toolsmith && c.freeM.length > 0 && c.goal === 'warehouse', { goal: c.goal, freeM: c.freeM });
    step('1 [' + fx + '] no free plot: the goal waits (another goal shows) and its line says 빈 땅이 생기면', c.goalNoPlot !== 'warehouse' && c.lineNoPlot && /빈 땅이 생기면/.test(c.lineNoPlot.text || '') && c.goalBack === 'warehouse', { goalNoPlot: c.goalNoPlot, line: c.lineNoPlot && c.lineNoPlot.text });
    if (fx === 'v41_save_smart_25min.json') {
      // build it on the first free M plot: the 창고 stands, its 2 porters come, and 짐꾼 2 can be offered
      const b = await ev((plots) => {
        const gs = window.__FV.scene, F = window.__FV; gs.economy.coins = Math.max(gs.economy.coins, 5000);
        const id = plots[0], ok = F.build(id, 'warehouse');
        F.supply(id); F.finishSite(id);
        return { id, ok, built: gs.isBuilt('warehouse'), porters: gs.warehouse ? gs.warehouse.porters.length : 0 };
      }, c.freeM);
      await adv(2);
      const p2 = await ev(() => { const gs = window.__FV.scene, L = gs.v42.lines; L.fullT.smokehouse = 60; L.waitT.smokehouse = 0; return { due: L.f4Due('smokehouse'), offer: L.offers().some((o) => o.id === 'p2_smokehouse') }; });
      step('1 the 창고 can be built at 25 min; its 2 porters come; 짐꾼 2 can be offered (needs the 창고)', b.ok && b.built && b.porters === 2 && p2.due && p2.offer, { ...b, ...p2 });
    }
  }

  // ======================================================================= 2–9 on the 46-min save
  await boot(fixture('v41_save_smart_46min.json'));
  await park();
  // instruments: every raw porter's haul (where to, the station's work then, how far), the cannery's feeds
  await ev(async () => {
    const gs = window.__FV.scene;
    const { Hauler } = await import(new URL('src/entities/Worker.js', location.href).href);
    const R = window.__raw = { hauls: [], bad: [] };
    const o = Hauler.prototype.startHaul;
    Hauler.prototype.startHaul = function (sink) {
      if (this.role === 'raw' && sink && sink !== this.target.inSink) {
        const rec = { line: this.target.id, sink: sink.id || sink.kind || '?', wh: !!sink.isWarehouse, dock: !!(sink.remote || sink.surplus), prio: sink.prio ? sink.prio(this.pile.item) : null, work: +this.workSeconds().toFixed(1), d: Math.round(Math.hypot(sink.x - this.pile.x, sink.y - this.pile.y)), t: +(window.__step.t).toFixed(1) };
        R.hauls.push(rec);
        if (rec.wh || rec.dock) R.bad.push(rec);
      }
      return o.call(this, sink);
    };
    const C = gs.workshops.find((w) => w.kind === 'cannery');
    window.__can = { byCrew: 0, byRaw: 0, other: 0 };
    if (C) { const f = C.sink.feed; C.sink.feed = function (ch) { const ty = ch.stack.items.length ? ch.stack.items[ch.stack.items.length - 1].type : null; const r = f.call(this, ch); if (r && (ty === 'item_fish_raw' || ty === 'item_fish_big')) { if (ch.wh) window.__can.byCrew++; else if (ch.role === 'raw') window.__can.byRaw++; else window.__can.other++; } return r; }; }
  });
  const st0 = await ev(() => { const gs = window.__FV.scene; return { complete: gs.progress.complete, frules: !!gs.v42.frules, raw: gs.rawPorters.length, crew: gs.warehouse.porters.length, cannery: !!gs.workshops.find((w) => w.kind === 'cannery') }; });
  step('2 the 46-min save: village complete, the v4.2 rules on, raw porters on every line', st0.complete && st0.frules && st0.raw >= 5 && st0.cannery, st0);
  // ---- 2. raw porters stay on their line (MINUTES game minutes, the chief parked)
  for (let m = 0; m < MINUTES; m++) await adv(60);
  const R2 = await ev(() => { const gs = window.__FV.scene, LR = window.__BAL.logistics.raw; return { hauls: window.__raw.hauls.length, bad: window.__raw.bad.slice(0, 5), local: window.__raw.hauls.filter((h) => !h.wh && !h.dock), workS: LR.workS, localPx: LR.localPx, piles: Object.fromEntries(Object.keys(gs.piles).map((k) => [k, gs.piles[k].count])) }; });
  step('2 raw porters never carry to the 창고 or the dock in ' + MINUTES + ' game minutes', R2.bad.length === 0, { bad: R2.bad, piles: R2.piles });
  step('2 every local job: the input held ≥ workS s of work, ≤ localPx straight, to a place that uses the raw', R2.local.every((h) => h.work >= R2.workS && h.d <= R2.localPx && h.prio >= 40), { local: R2.local.slice(0, 5), n: R2.local.length });

  // ---- 3. a local job (the cannery brought into reach): the fish porter feeds it while the grill is full and busy
  const L3 = await ev(() => {
    const gs = window.__FV.scene, B = window.__BAL, fx = gs.effects, grill = gs.stations.grill, pile = gs.piles.fish, C = gs.workshops.find((w) => w.kind === 'cannery');
    window.__keepLR = Object.assign({}, B.logistics.raw);
    B.logistics.raw.localPx = 1e5;
    // the cannery's fish gone, the grill's input full, the fish pile full; the crew kept away from the fish
    while (C.inStack.countOf('item_fish_raw') > 0) { const it = C.inStack.pop('item_fish_raw'); if (it && it.spr) fx.releaseItem(it.spr); }
    while (grill.inStack.count < grill.inStack.max) grill.inStack.push('item_fish_raw', null, fx);
    while (pile.stack.count < pile.stack.max) pile.stack.push('item_fish_raw', null, fx);
    window.__keepLink = B.logistics.link.fishToCannery; B.logistics.link.fishToCannery = false;
    window.__raw.hauls.length = 0;
    const rp = gs.rawPorters.find((r) => r.target === grill);
    return { work: rp ? +rp.workSeconds().toFixed(1) : null, d: Math.round(Math.hypot(C.sink.x - pile.x, C.sink.y - pile.y)) };
  });
  const t3 = await until(() => window.__raw.hauls.some((h) => h.line === 'grill' && /cannery/.test(h.sink)), 30, 0.5);
  const h3 = await ev(() => window.__raw.hauls.filter((h) => h.line === 'grill'));
  await adv(25);
  const fed3 = await ev(() => window.__can.byRaw);
  step('3 with the cannery in reach the 생선 짐꾼 takes a local job to it (the grill full, ≥ workS s of work)', t3 >= 0 && h3.length && h3[0].work >= 15 && fed3 > 0, { t: t3, first: h3[0], fedByRaw: fed3, ...L3 });
  // no local job when the station's input would run out first (raw.workS out of reach)
  const L3b = await ev(() => {
    const gs = window.__FV.scene, B = window.__BAL, fx = gs.effects, grill = gs.stations.grill, pile = gs.piles.fish, C = gs.workshops.find((w) => w.kind === 'cannery');
    B.logistics.raw.workS = 1e6;
    while (C.inStack.countOf('item_fish_raw') > 0) { const it = C.inStack.pop('item_fish_raw'); if (it && it.spr) fx.releaseItem(it.spr); }
    while (grill.inStack.count < grill.inStack.max) grill.inStack.push('item_fish_raw', null, fx);
    while (pile.stack.count < pile.stack.max) pile.stack.push('item_fish_raw', null, fx);
    window.__raw.hauls.length = 0;
    return true;
  });
  await adv(30);
  const h3b = await ev(() => { const B = window.__BAL; Object.assign(B.logistics.raw, window.__keepLR); B.logistics.link.fishToCannery = window.__keepLink; return window.__raw.hauls.filter((h) => h.line === 'grill'); });
  step('3 no local job while the input holds less than workS s of work', L3b && h3b.length === 0, { hauls: h3b.slice(0, 3) });

  // ---- 4. the crew's job order: overflow / direct before a raw run
  const J4 = await ev(() => {
    const gs = window.__FV.scene, fx = gs.effects, W = gs.warehouse, S = gs.v42.surplus;
    const wp = W.porters.find((p) => p.state === 'idle' && !p.job) || W.porters[0];
    const bak = gs.stations.bakery, ore = gs.piles.ore;
    while (bak.outStack.count < bak.outStack.max) bak.outStack.push('item_bread', null, fx);
    while (ore.stack.count < ore.stack.max) ore.stack.push('item_ore', null, fx);
    S.overT.set(ore, 999);
    // (the ore pile's surplus may leave: its line's 가공소 2단 had its chance; nobody else on its raw run)
    const f5 = S.f5Chance; S.f5Chance = () => true;
    const busy = gs.porters.filter((p) => p !== wp && p.job && (p.job.kind === 'raw' || p.job.kind === 'in'));
    const keep = busy.map((p) => [p, p.job]); for (const p of busy) p.job = null;
    // (the fish link off for this check: an urgent link comes before both — section 5 checks it)
    const LK = window.__BAL.logistics.link, lk = LK.fishToCannery; LK.fishToCannery = false;
    const raw = wp.rawJob(), j = wp.think();
    LK.fishToCannery = lk;
    for (const [p, jj] of keep) p.job = jj;
    S.f5Chance = f5;
    return { raw: raw ? { kind: raw.kind, long: raw.long, n: raw.n } : null, job: j ? { kind: j.kind, src: j.src && (j.src.id || (j.src.pile && j.src.pile.id)) } : null };
  });
  step('4 a full output and a long-full pile: the crew takes the overflow / direct run first, not the raw run', J4.raw && J4.raw.long && J4.job && J4.job.kind === 'in', J4);

  // ---- 5. the fish link: the crew carries fish from the pile to the cannery when it runs low
  const L5 = await ev(() => {
    const gs = window.__FV.scene, fx = gs.effects, C = gs.workshops.find((w) => w.kind === 'cannery'), pile = gs.piles.fish, W = gs.warehouse;
    // every output below the overflow line (so nothing comes before the link), the cannery's fish gone, the pile full
    for (const s of gs.sources()) { if (!s.outStack || s === C) continue; while (s.outStack.count > s.outStack.max * 0.3) { const it = s.outStack.pop(); if (it && it.spr) fx.releaseItem(it.spr); else if (!it) break; } }
    while (C.inStack.countOf('item_fish_raw') > 0) { const it = C.inStack.pop('item_fish_raw'); if (it && it.spr) fx.releaseItem(it.spr); }
    while (pile.stack.count < pile.stack.max) pile.stack.push('item_fish_raw', null, fx);
    for (const k in gs.piles) if (k !== 'fish') { const p = gs.piles[k]; while (p.stack.count > p.stack.max * 0.5) { const it = p.stack.pop(); if (it && it.spr) fx.releaseItem(it.spr); else if (!it) break; } }
    window.__can.byCrew = 0; window.__linked = 0;
    const wp = W.porters.find((p) => !(p.job && p.job.kind === 'link')) || W.porters[0];
    const j = wp.linkJob();
    return { link: j ? { kind: j.kind, n: j.n } : null };
  });
  const t5 = await until(() => { if (window.__FV.scene.warehouse.porters.some((p) => p.job && p.job.kind === 'link')) window.__linked = 1; return window.__linked && window.__can.byCrew > 0; }, 150, 1);
  const s5 = await ev(() => ({ byCrew: window.__can.byCrew, jobs: window.__FV.scene.warehouse.porters.map((p) => (p.job ? p.job.kind : p.state)) }));
  step('5 the crew carries fish from the pile to the cannery (the link) when the cannery runs low', L5.link && L5.link.kind === 'link' && t5 >= 0, { ...L5, t: t5, ...s5 });

  // ---- 6. the crew's need gate
  const C6 = await ev(() => { const gs = window.__FV.scene, K = gs.v42.crew; window.__FV.v42.crew({ rate: 1e6, need: false, useBusy: 0, backlog: 0 }); K.sinceT = 1e6; return { crew: K.crew(), target: K.target() }; });
  for (let i = 0; i < 12; i++) { await ev(() => { window.__FV.scene.v42.crew.useBusy = Math.min(window.__FV.scene.v42.crew.useBusy, 0.5); }); await adv(5); }
  const C6b = await ev(() => { const K = window.__FV.scene.v42.crew; return { crew: K.crew(), state: window.__FV.v42.crew() }; });
  step('6 the crew does not grow while use-busy < busyAt, even with seats free (target > crew)', C6.target > C6.crew && C6b.crew === C6.crew, { before: C6, after: C6b.crew, useBusy: C6b.state.useBusy });
  const C6c = await ev(() => {
    const K = window.__FV.scene.v42.crew, B = window.__BAL.warehouse.crew;
    K.useBusy = B.busyAt + 0.05; K.backlogT = B.backlogS + 1; const on = K.needMet();
    K.useBusy = B.busyAt - 0.05; const offBusy = K.needMet();
    K.useBusy = B.busyAt + 0.05; K.backlogT = B.backlogS - 1; const offWait = K.needMet();
    K.useBusy = 0; K.backlogT = 0;
    return { on, offBusy, offWait };
  });
  step('6 the gate opens with use-busy ≥ busyAt and a use job waiting ≥ backlogS (and not with either short)', C6c.on && !C6c.offBusy && !C6c.offWait, C6c);
  await ev(() => window.__FV.v42.crew({ rate: 0 }));

  // ---- 7. standing cards: the surplus item first
  const D2 = await ev(() => {
    const gs = window.__FV.scene, G = gs.v4.growth, B = window.__BAL, order = B.v4.founding.order;
    const keep = { done: G.done.slice(), cards: G.cards.slice(), standing: G.standing, outFullT: G.outFullT };
    G.done = order.slice();
    G.cards = []; G.standing = 0;
    G.outFullT = { item_meat_cooked: 300, item_bread: 20 };
    G.refill(true);
    const surplus = G.cards.map((c) => Object.keys(c.need)[0]);
    G.cards = []; G.standing = 0; G.outFullT = { item_plank: 300 };
    G.refill(true);
    const onlyPlank = G.cards.map((c) => Object.keys(c.need)[0]);
    B.logistics.cards.surplusFirst = false;
    G.cards = []; G.standing = 0; G.outFullT = { item_meat_cooked: 300 };
    G.refill(true);
    const plain = G.cards.map((c) => Object.keys(c.need)[0]);
    B.logistics.cards.surplusFirst = true;
    Object.assign(G, keep);
    return { surplus, onlyPlank, plain, first: Object.keys(B.v4.orders.standing[0])[0] };
  });
  step('7 the first standing card is the surplus item (smoked meat), planks only when nothing else is, the rotation when off', D2.surplus[0] === 'item_meat_cooked' && D2.onlyPlank[0] === 'item_plank' && D2.plain[0] === D2.first, D2);

  // ---- 8. after 읍 the founded shops' town buyers come twice as often
  const S8 = await ev(() => {
    const gs = window.__FV.scene, G = gs.v4.growth;
    const shop = Object.values(G.shops).find((s) => s.st === 'open' && s.sells && s.sells.length);
    if (!shop) return null;
    window.__sold = [];
    const o = shop.takeOut.bind(shop);
    // (only the town buyers' takes: Shop.update resets inlandT to 0 right before one; the keeper serving the queue
    //  in the frame after would also see 0, hence the 0.5 s guard)
    shop.takeOut = (ty) => { const t = +(window.__step.t).toFixed(1), a = window.__sold; if (shop.inlandT === 0 && !(a.length && t - a[a.length - 1] < 0.5)) a.push(t); return o(ty); };
    window.__fill = () => { for (const ty of shop.sells) shop.stock[ty] = Math.max(shop.stock[ty] || 0, 10); };
    window.__fill();
    return { id: shop.shop || shop.id, rank: gs.v4.rank.level };
  });
  let r8 = null;
  if (S8) {
    for (let i = 0; i < 24; i++) { await ev(() => window.__fill()); await adv(5); }
    const before = await ev(() => { const s = window.__sold.slice(); window.__sold.length = 0; return s; });
    await ev(() => { const gs = window.__FV.scene, pr = gs.progress; if (gs.v4.rank.level < 2) { pr.flags.rankEup = true; pr.done.rank_eup = true; const pad = pr.pads.rank_eup; if (pad) { pad.destroy(); delete pr.pads.rank_eup; } gs.v4.rank.ceremony(true); } });
    await adv(2);
    await ev(() => { window.__sold.length = 0; });
    for (let i = 0; i < 24; i++) { await ev(() => window.__fill()); await adv(5); }
    const after = await ev(() => window.__sold.slice());
    const gap = (a) => (a.length > 1 ? +((a[a.length - 1] - a[0]) / (a.length - 1)).toFixed(1) : null);
    r8 = { shop: S8.id, before: a => a, nBefore: before.length, gapBefore: gap(before), nAfter: after.length, gapAfter: gap(after) };
  }
  step('8 after 읍 a founded shop\'s town buyers come every ≈ 20 s (before: ≈ 40 s)', r8 && r8.gapBefore >= 36 && r8.gapBefore <= 44 && r8.gapAfter >= 18 && r8.gapAfter <= 22, r8 || 'no open shop');

  // ---- 9. save + reload
  const sv = await ev(() => { const gs = window.__FV.scene; gs.save(true); return { save: localStorage.getItem('frostVillage.save.v1'), crew: gs.warehouse.porters.length }; });
  const blob = JSON.parse(sv.save);
  const keys0 = Object.keys(JSON.parse(fixture('v41_save_smart_46min.json')));
  await boot(sv.save);
  const re = await ev(() => { const gs = window.__FV.scene; return { crew: gs.warehouse.porters.length, v42crew: window.__FV.v42.crew() }; });
  step('9 save + reload: v7, the crew kept (' + sv.crew + '), no new save field for v4.2.1', blob.v === 7 && re.crew === sv.crew && !('logistics' in blob) && !(blob.v42 && blob.v42.crew && ('useBusy' in blob.v42.crew || 'backlog' in blob.v42.crew)), { v: blob.v, crew: re.crew, newTop: Object.keys(blob).filter((k) => keys0.indexOf(k) < 0), v42crew: blob.v42 && blob.v42.crew });

  // ======================================================================= --fresh N: the card in fresh games
  for (let s = 1; s <= FRESH; s++) {
    await open(seedJs(s));
    await boot('');
    await page.addScriptTag({ path: path.join(HERE, 'review_gameplay_bot.js') });
    await ev(() => Object.assign(window.__bot.opts, { policy: 'smart', upg: 'greedy', minBatch: 3, think: 0, mag: 1 }));
    const F = await ev(async () => {
      const gs = window.__FV.scene, pr = gs.progress;
      const card = () => { const c = gs.buildChoices({ size: 'M' }).find((q) => q.key === 'warehouse'); return !!(c && !c.locked); };
      const out = { earlyCard: false, completeAt: null, cardAt: null, freeM: null, goalAt: null };
      for (let t = 0; t < 40 * 60; t += 10) {
        window.__step.run(10, window.__bot.tick);
        const tt = window.__step.t;
        if (card() && !pr.complete) out.earlyCard = true;
        if (pr.complete && out.completeAt === null) out.completeAt = +(tt / 60).toFixed(2);
        if (card() && out.cardAt === null) { out.cardAt = +(tt / 60).toFixed(2); out.freeM = pr.freePlotFor('warehouse'); }
        if (pr.nextGoal() && pr.nextGoal().id === 'warehouse' && out.goalAt === null) out.goalAt = +(tt / 60).toFixed(2);
        if (out.completeAt !== null && tt / 60 >= out.completeAt + 3) break;
        await new Promise((r) => setTimeout(r, 0));
      }
      return out;
    });
    step('fresh seed ' + s + ': the 창고 card never before village complete; an M plot free when it shows', !F.earlyCard && F.cardAt !== null && F.freeM === true, F);
  }
} catch (e) { fatal = e; console.log('FATAL', e && e.stack || e); }
errors = errors.concat(log ? log.errors : []);
step('0 page errors', errors.length === 0 && !fatal, errors.slice(0, 5));
const pass = results.filter((r) => r.ok).length;
console.log(`\nlgx_l0: ${pass}/${results.length} passed`);
await browser.close();
await srv.close();
process.exit(pass === results.length ? 0 : 1);
