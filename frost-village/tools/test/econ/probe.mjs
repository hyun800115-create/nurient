// Economy flow-map probe (logistics_flow_map.md): load a save, set the late-village configuration, run fixed-step and
// record EVERY item transfer (stack -> stack via gs.moveItem, sink feeds, warehouse, dock, sleigh, depot, train) plus a
// 1 Hz state sample of every gatherer, operator, raw / goods / 2nd goods / warehouse / station porter.
//   node probe.mjs --repo DIR --load save.json --warm 120 --minutes 10 --mode auto|bot --out out.json [--setup final|none]
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const REPO = path.resolve(opt('--repo', '/home/user/nurient/frost-village'));
const LOAD = path.resolve(opt('--load', path.join(REPO, 'tools/test/fixtures/v41_save_smart_46min.json')));
const WARM = Number(opt('--warm', '120'));
const MIN = Number(opt('--minutes', '10'));
const MODE = opt('--mode', 'auto');
const SETUP = opt('--setup', 'final');
const OUT = path.resolve(opt('--out', 'probe.json'));
process.chdir(REPO);
const { start } = await import(path.join(REPO, 'tools/test/serve.mjs'));
const { launch, openPage, tapStart, sleep, waitFor } = await import(path.join(REPO, 'tools/test/pw.mjs'));
const srv = await start(0, { prefix: '/fv/', root: REPO });
const browser = await launch();
const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 390, height: 844 }, dpr: 1 });
const t0 = Date.now();
let res = null;
try {
  const saveTxt = fs.readFileSync(LOAD, 'utf8');
  await page.evaluate((sv) => { localStorage.clear(); localStorage.setItem('frostVillage.save.v1', sv); }, saveTxt);
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 180000);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player, 180000);
  await sleep(2000);
  // ---------------------------------------------------------------- fixed-step clock
  await page.evaluate(() => {
    const game = window.__FV.game;
    game.loop.sleep();
    let D = Date.now(); let T = game.loop.time || performance.now();
    Date.now = () => D;
    const DT = 1000 / 60;
    try { if (window.__FV.v42) window.__FV.v42.v.seen.whatsNew = 1; } catch (e) { /* */ }
    window.__sim = { simT: 0, run(sec, botTick, each) { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { if (botTick) botTick(DT / 1000); T += DT; D += DT; this.simT += DT / 1000; game.headlessStep(T, DT); if (each) each(DT / 1000); } } };
  });
  if (MODE === 'bot') {
    await page.addScriptTag({ path: path.join(REPO, 'tools/test/review_gameplay_bot.js') });
    await page.evaluate(() => Object.assign(window.__bot.opts, { policy: 'smart', upg: 'greedy', minBatch: 3, think: 0, mag: 1 }));
  }
  // ---------------------------------------------------------------- late-village configuration (g60 from minute 13)
  const setupInfo = await page.evaluate((SETUP) => {
    const gs = window.__FV.scene, H = window.__FV.v42, out = {};
    if (SETUP !== 'final') return out;
    try {
      const pr = gs.progress;
      if (gs.v4 && gs.v4.rank && gs.v4.rank.level < 2) { pr.flags.rankEup = true; pr.done.rank_eup = true; const pad = pr.pads.rank_eup; if (pad) { pad.destroy(); delete pr.pads.rank_eup; } gs.v4.rank.ceremony(true); }
      out.rank = gs.v4 && gs.v4.rank ? gs.v4.rank.level : null;
    } catch (e) { out.rankErr = String(e); }
    try { const L = ['grill', 'sawmill', 'bakery', 'smelter', 'smokehouse']; H.lines({ up: Object.fromEntries(L.map((k) => [k, 1])), p2: L }); out.lines = 'ok'; } catch (e) { out.linesErr = String(e); }
    try { H.depot({ build: true }); out.depot = !!(gs.v42.depot && gs.v42.depot.built); } catch (e) { out.depotErr = String(e); }
    try { const G = gs.v4.growth; while (G.porters.length < 4) G.hireStationPorter(true); G.porterN = Math.max(G.porterN || 0, G.porters.length); out.stn = G.porters.length; } catch (e) { out.stnErr = String(e); }
    return out;
  }, SETUP);
  console.log('setup', JSON.stringify(setupInfo));
  // ---------------------------------------------------------------- instruments
  await page.evaluate(async () => {
    const gs = window.__FV.scene;
    const mod = async (f) => import(new URL('src/' + f, location.href).href);
    const { ItemStack } = await mod('entities/ItemStack.js');
    const { Hauler } = await mod('entities/Worker.js');
    const { Warehouse } = await mod('entities/Warehouse.js');
    const { Depot } = await mod('systems/depot/Depot.js');
    const M = window.__M = { on: false, flow: {}, trips: {}, st: {}, stn: {}, piles: {}, samples: 0, misc: {} };
    const lab = new WeakMap();
    const roleOf = (p) => (p.role === 'stationPorter' ? 'stn' : p.wh ? 'wh' : p.role === 'raw' ? 'raw:' + (p.target ? p.target.id : '?') : p.station ? (p.p2 ? 'p2:' : 'p1:') + (p.station === gs.boathouse ? 'dock' : p.station.id) : '?');
    const relabel = () => {
      for (const k in gs.piles) lab.set(gs.piles[k].stack, 'pile:' + k);
      for (const s of gs.sources()) { if (s.inStack) lab.set(s.inStack, 'in:' + (s === gs.boathouse ? 'boat' : s.id)); if (s.outStack) lab.set(s.outStack, 'out:' + (s === gs.boathouse ? 'boat' : s.id)); }
      if (gs.boathouse && gs.boathouse.boat && gs.boathouse.boat.cargo) lab.set(gs.boathouse.boat.cargo, 'boatcargo');
      for (const [sl, n] of [[gs.market, 'market'], [gs.trade, 'trade'], [gs.store, 'store']]) if (sl && sl.stock) lab.set(sl.stock, 'shelf:' + n);
      const R = gs.civic && gs.civic.restaurant; if (R) { if (R.pantry) lab.set(R.pantry, 'pantry'); if (R.pass) lab.set(R.pass, 'pass'); }
      const G = gs.v4 && gs.v4.growth; if (G) for (const id in G.shops || {}) if (G.shops[id] && G.shops[id].shelf) lab.set(G.shops[id].shelf, 'shop:' + id);
      if (gs.foodBox && gs.foodBox.stock) lab.set(gs.foodBox.stock, 'foodbox');
      lab.set(gs.player.stack, 'ch:chief');
      for (const w of gs.workers) lab.set(w.stack, 'ch:g:' + w.type);
      for (const r of gs.rawPorters) lab.set(r.stack, 'ch:' + roleOf(r));
      for (const p of gs.porters) lab.set(p.stack, 'ch:' + roleOf(p));
    };
    relabel();
    M.relabel = relabel;
    const L = (st) => (st && lab.get(st)) || 'other';
    const rec = (a, b, ty, n = 1) => { if (!M.on) return; const k = a + '>' + b; const o = M.flow[k] || (M.flow[k] = {}); o[ty] = (o[ty] || 0) + n; };
    let inMove = 0, lastPop = null, ctx = null;
    const P = ItemStack.prototype, oPop = P.pop, oPush = P.push;
    P.pop = function (types) { const it = oPop.call(this, types); if (it) { lastPop = it.type; if (!inMove) rec(L(this), ctx || 'use', it.type); } return it; };
    P.push = function (type, spr, fx) { if (this.__pend > 0) this.__pend--; else rec(ctx || 'make', L(this), type); return oPush.call(this, type, spr, fx); };
    const oMove = gs.moveItem;
    gs.moveItem = function (from, to, types, opts) {
      inMove++; lastPop = null; let r;
      try { r = oMove.call(this, from, to, types, opts); } finally { inMove--; }
      if (r && lastPop) { rec(L(from), L(to), lastPop); to.__pend = (to.__pend || 0) + 1; }
      return r;
    };
    const oGive = Warehouse.prototype.giveTo;
    Warehouse.prototype.giveTo = function (ch, type) { const r = oGive.call(this, ch, type); if (r) { rec('wh', L(ch.stack), type); ch.stack.__pend = (ch.stack.__pend || 0) + 1; } return r; };
    const wrapSinks = () => {
      for (const s of gs.logistics.sinks) {
        if (s.__w) continue; s.__w = 1;
        const f = s.feed, id = 'sink:' + (s.id || s.kind || '?');
        s.feed = function (ch) { const p = ctx; ctx = id; try { return f.call(this, ch); } finally { ctx = p; } };
      }
    };
    wrapSinks();
    M.wrapSinks = wrapSinks;
    // trips
    const oStart = Hauler.prototype.startHaul;
    Hauler.prototype.startHaul = function (sink) {
      const r = oStart.call(this, sink);
      if (M.on) {
        const role = roleOf(this), q = M.trips[role] || (M.trips[role] = { trips: 0, items: 0, px: 0, to: {} });
        q.trips++; q.items += this.stack.count + this.stack.incoming;
        let px = 0, x = this.x, y = this.y; for (let i = this.ri || 0; i < (this.route || []).length; i++) { const w = this.route[i]; px += Math.hypot(w.x - x, w.y - y); x = w.x; y = w.y; }
        q.px += px; const d = (sink && (sink.id || sink.kind)) || '?'; q.to[d] = (q.to[d] || 0) + 1;
      }
      return r;
    };
    // dock -> train / sleigh, sleigh -> depot, depot sales
    const F = gs.v42 && gs.v42.freight;
    if (F) {
      const oTake = F.takeSurplus.bind(F);
      F.takeSurplus = (n, roomOf) => { const out = oTake(n, roomOf); for (const q of out) rec('dock', roomOf ? 'sleigh' : 'train', q.ty, q.n); return out; };
    }
    const oDT = Depot.prototype.take;
    Depot.prototype.take = function (load) { const got = oDT.call(this, load); for (const q of got || []) rec('sleigh', 'depot', q.ty, q.n); return got; };
    const oDS = Depot.prototype.sell;
    Depot.prototype.sell = function (dt, hour) { const s = oDS.call(this, dt, hour); for (const q of s || []) rec('depot', 'sold', q.ty, q.n); return s; };
    const G = gs.v4 && gs.v4.growth;
    if (G && G.payWholesale) { const oPW = G.payWholesale.bind(G); G.payWholesale = (ty, n, fx, fy) => { rec('wholesale', 'paid', ty, n); return oPW(ty, n, fx, fy); }; }
    // ---------------------------------------------------------------- 1 Hz state sample
    const inc = (grp, k) => { const o = M.st[grp] || (M.st[grp] = {}); o[k] = (o[k] || 0) + 1; };
    const want = (s, ty) => (s && ty ? gs.logistics.want(s, ty) : 0);
    const stState = (s) => {
      if (!s.enabled) return 'off';
      if (!s.operated()) return 'no_operator';
      if (s.canWork()) return 'busy';
      if (s.isWorkshop) { if (!s.hasBatch()) return 'starved'; if (s.outStack.count + s.outStack.incoming + s.recipe.outN > s.outStack.max) return 'blocked'; return 'no_order'; }
      if (s.inStack.count === 0) return 'starved';
      if (s.outStack.count + s.outStack.incoming >= s.outStack.max) return 'blocked';
      return 'other';
    };
    M.sample = () => {
      if (!M.on) return;
      M.samples++;
      relabel(); wrapSinks();
      for (const w of gs.workers) {
        let k;
        if (w.state === 'hungry') k = 'hungry';
        else if (w.state === 'drop') k = (w.fullT || 0) > 0 ? 'blocked_pile_full' : 'drop';
        else if (w.state === 'work') k = 'work';
        else if (w.state === 'goto') k = 'walk_to_node';
        else if (w.state === 'deliver') k = 'walk_to_pile';
        else if (w.state === 'seek') k = w.stack.count > 0 ? 'walk_to_pile' : 'idle_no_node';
        else k = w.state;
        inc('g:' + w.type, k); inc('g:all', k);
      }
      for (const s of gs.stationList.concat(gs.workshops)) {
        const k = stState(s); inc('stn:' + s.id, k);
        if (s.op && s.op.operator) inc('op:all', k);
        const o = M.stn[s.id] || (M.stn[s.id] = { inSum: 0, outSum: 0, inMax: s.inStack.max, outMax: s.outStack.max, n: 0 });
        o.inSum += s.inStack.count; o.outSum += s.outStack.count; o.n++;
      }
      for (const k in gs.piles) { const p = gs.piles[k]; if (!p.shown) continue; const o = M.piles[k] || (M.piles[k] = { sum: 0, full: 0, n: 0 }); o.sum += p.count; o.n++; if (p.count >= p.stack.max * 0.9) o.full++; }
      for (const r of gs.rawPorters) {
        const have = r.stack.count + r.stack.incoming; let k;
        if (r.state === 'load') {
          if (have > 0 || r.toWh) k = 'loading';
          else { const w = want(r.sink, r.pile.item); k = w <= 0 ? 'idle_station_full' : r.pile.count <= 0 ? 'idle_pile_empty' : 'loading'; }
        } else if (r.state === 'haul') k = r.dest && r.dest.station ? 'carry_to_station' : 'carry_elsewhere';
        else if (r.state === 'unload') k = (r.waitT || 0) > 0 ? 'wait_dest_full' : 'unload';
        else if (r.state === 'seek') k = 'walk_back';
        else k = r.state;
        inc('raw:' + r.target.id, k); inc('raw:all', k);
      }
      for (const p of gs.porters) {
        const role = roleOf(p); let k;
        if (p.role === 'porter' && p.station) {
          const out = p.station.outStack, have = p.stack.count + p.stack.incoming;
          if (p.state === 'load') k = have > 0 ? 'loading' : out.count <= 0 ? 'idle_no_stock' : !p.plan ? 'idle_no_dest' : 'loading';
          else if (p.state === 'haul') k = 'carry';
          else if (p.state === 'unload') k = (p.waitT || 0) > 0 ? 'wait_dest_full' : 'unload';
          else if (p.state === 'seek') k = 'walk_back';
          else k = p.state;
          inc((p.p2 ? 'p2' : 'p1') + ':all', k);
        } else {
          if (p.state === 'idle') k = p.stack.count > 0 ? 'stranded_load' : 'idle';
          else if (p.state === 'toSrc' || p.state === 'toWh') k = 'walk_to_src';
          else if (p.state === 'grab' || p.state === 'take') k = 'loading';
          else if (p.state === 'haul') k = 'carry';
          else if (p.state === 'unload') k = (p.waitT || 0) > 0 ? 'wait_dest_full' : 'unload';
          else k = p.state;
          if (p.job && k !== 'idle') inc(role + ':job', p.job.kind || (p.job.sink && (p.job.sink.id || p.job.sink.kind)) || '?');
        }
        inc(role, k);
      }
      // stocks
      const W = gs.warehouse; if (W) { M.misc.whSum = (M.misc.whSum || 0) + W.total; const c = M.misc.whBy || (M.misc.whBy = {}); for (const t in W.counts) c[t] = (c[t] || 0) + W.counts[t]; }
      if (F) { M.misc.dockSum = (M.misc.dockSum || 0) + F.dockCount(); }
      const dep = gs.v42.depot; if (dep && dep.built) { M.misc.depSum = (M.misc.depSum || 0) + dep.total(); M.misc.depCap = dep.capTotal(); }
      const mk = gs.market && gs.market.stock; if (mk) { const c = M.misc.mk || (M.misc.mk = {}); for (const t of ['item_fish_cooked', 'item_bread', 'item_meat_cooked']) { c[t] = (c[t] || 0) + mk.countOf(t); if (mk.countOf(t) === 0) c[t + '_empty'] = (c[t + '_empty'] || 0) + 1; } }
      const R = gs.civic && gs.civic.restaurant; if (R && R.pantry) { const c = M.misc.pantry || (M.misc.pantry = {}); for (const t of ['item_fish_cooked', 'item_bread', 'item_meat_cooked']) { c[t] = (c[t] || 0) + R.pantry.countOf(t); if (R.pantry.countOf(t) === 0) c[t + '_empty'] = (c[t + '_empty'] || 0) + 1; } }
      const fb = gs.foodBox; if (fb) M.misc.foodSum = (M.misc.foodSum || 0) + (fb.count || 0);
    };
    // the chief stays away from every pad (auto mode)
    let cT = 0;
    M.park = (dt) => { cT -= dt; if (cT > 0) return; cT = 0.5; const p = gs.player; const to = window.__park || (window.__park = { x: p.x, y: p.y }); if (Math.hypot(p.x - to.x, p.y - to.y) > 4) window.__FV.teleport(to.x, to.y); window.__FV.setInput(0, 0); };
  });
  // a parking spot far from pads: the west strip edge (checked: not on a pad)
  if (MODE === 'auto') console.log('park', JSON.stringify(await page.evaluate(() => {
    const gs = window.__FV.scene, hot = [];
    for (const s of gs.logistics.sinks) hot.push([s.x, s.y]);
    for (const s of gs.sources()) hot.push([s.x, s.y]);
    for (const k in gs.piles) hot.push([gs.piles[k].x, gs.piles[k].y]);
    for (const k in gs.progress.pads) { const p = gs.progress.pads[k]; if (p && p.x !== undefined) hot.push([p.x, p.y]); }
    for (const p of gs.padSpots || []) hot.push([p.x, p.y]);
    for (const w of gs.workers) hot.push([w.x, w.y]);
    const c = gs.market; let best = null, bd = -1;
    for (let dx = -1500; dx <= 1500; dx += 100) for (let dy = -1200; dy <= 1200; dy += 100) {
      const x = c.x + dx, y = c.y + dy;
      if (gs.collision.blocked(x, y, 16)) continue;
      let m = 1e9; for (const [hx, hy] of hot) m = Math.min(m, Math.hypot(hx - x, hy - y));
      if (m > bd) { bd = m; best = { x, y }; }
    }
    window.__park = best;
    return { park: best, minDistToHot: Math.round(bd) };
  })));
  const tick = MODE === 'bot' ? 'window.__bot.tick' : 'window.__M.park';
  // warm-up
  for (let s = 0; s < WARM; s += 10) await page.evaluate((tk) => window.__sim.run(10, eval(tk)), tick);
  const snap0 = await page.evaluate(() => {
    const gs = window.__FV.scene, F = gs.v42.freight, R = gs.civic && gs.civic.restaurant, dep = gs.v42.depot;
    window.__M.on = true;
    return { t: window.__sim.simT, earned: gs.economy.earned, exported: F ? F.stats.exported : 0, exCoins: F ? F.stats.coins : 0, served: R ? R.served : 0, restEarned: R ? R.earned : 0, depSales: dep && dep.model ? dep.model.tot[2] : 0, depCoins: dep && dep.model ? dep.model.tot[1] : 0, hour: gs.v4 && gs.v4.clock ? gs.v4.clock.hour() : null };
  });
  let sec = 0;
  const N = MIN * 60;
  while (sec < N) {
    await page.evaluate((tk) => { let acc = 0; window.__sim.run(10, eval(tk), (dt) => { acc += dt; if (acc >= 1) { acc -= 1; window.__M.sample(); } }); }, tick);
    sec += 10;
    if (sec % 120 === 0) console.log('t', sec, Math.round((Date.now() - t0) / 1000) + 's');
  }
  res = await page.evaluate((s0) => {
    const gs = window.__FV.scene, M = window.__M, F = gs.v42.freight, R = gs.civic && gs.civic.restaurant, dep = gs.v42.depot;
    const end = { t: window.__sim.simT, earned: gs.economy.earned, exported: F ? F.stats.exported : 0, exCoins: F ? F.stats.coins : 0, served: R ? R.served : 0, restEarned: R ? R.earned : 0, depSales: dep && dep.model ? dep.model.tot[2] : 0, depCoins: dep && dep.model ? dep.model.tot[1] : 0, hour: gs.v4 && gs.v4.clock ? gs.v4.clock.hour() : null };
    const agents = {
      gatherers: gs.workers.map((w) => w.type), raw: gs.rawPorters.map((r) => r.target.id),
      porters: gs.porters.map((p) => (p.role === 'stationPorter' ? 'stn' : p.wh ? 'wh' : (p.p2 ? 'p2:' : 'p1:') + (p.station === gs.boathouse ? 'dock' : p.station && p.station.id))),
      operators: gs.stationList.concat(gs.workshops).filter((s) => s.op && s.op.operator).map((s) => s.id),
      clerks: [['market', gs.market], ['trade', gs.trade], ['store', gs.store]].filter(([, s]) => s && s.register && s.register.clerk).map(([n]) => n),
      rest: R ? { cashier: !!(R.register && R.register.clerk), cook: !!R.cook, server: !!R.server } : null,
      shops: gs.v4 && gs.v4.growth ? Object.keys(gs.v4.growth.shops || {}) : [], houses: gs.v4 && gs.v4.growth ? gs.v4.growth.houseCount() : 0,
      cards: gs.v4 && gs.v4.growth ? gs.v4.growth.cards.map((c) => ({ shop: c.shop || null, need: c.need, got: c.got })) : [],
      boat: gs.boathouse && gs.boathouse.boat ? gs.boathouse.level : 0, lines: gs.v42.lines ? gs.v42.lines.state() : null, sleighs: dep ? dep.sleighN : 0,
      sites: Object.keys(gs.sites || {}).filter((k) => gs.sites[k].state && gs.sites[k].state !== 'plot' && gs.sites[k].state !== 'done'),
    };
    return { s0, end, flow: M.flow, trips: M.trips, st: M.st, stn: M.stn, piles: M.piles, misc: M.misc, samples: M.samples, agents, ledger: gs.v42.ledger ? gs.v42.ledger.stocks() : null };
  }, snap0);
} catch (e) { console.log('FATAL', e && e.stack || e); }
const out = { args, res, errors: log.errors.slice(0, 20), wall: Math.round((Date.now() - t0) / 1000) };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log('DONE', OUT, 'errors', log.errors.length, 'wall', out.wall);
await browser.close(); await srv.close(); process.exit(0);
