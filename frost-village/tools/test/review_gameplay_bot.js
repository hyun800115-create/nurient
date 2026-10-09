// Gameplay-review bot (injected into the page). Plays ONLY through __FV.setInput (virtual joystick).
// It reads game state to decide (like a player looking at the screen) but never teleports / gives coins.
// Driven by window.__sim (fixed 60 fps headlessStep with a simulated Date.now so tweens stay in sync).
(function () {
  const FV = window.__FV;
  const gs = FV.scene;
  const FOODS = ['item_fish_cooked', 'item_bread', 'item_meat_cooked'];
  const GOODS = ['item_plank', 'item_ingot'];
  const RAW_ST = { item_fish_raw: 'grill', item_log: 'sawmill', item_wheat: 'bakery', item_ore: 'smelter', item_meat_raw: 'smokehouse' };
  // (v3) the cannery takes boat fish too
  const ST_RAW = { grill: 'item_fish_raw', sawmill: 'item_log', bakery: 'item_wheat', smelter: 'item_ore', smokehouse: 'item_meat_raw' };
  const ST_SELL = { grill: 'market', sawmill: 'trade', bakery: 'market', smelter: 'trade', smokehouse: 'market' };
  const ST_ZONE = { grill: 'plaza', sawmill: 'forest', bakery: 'farm', smelter: 'mine', smokehouse: 'hunt' };
  const gd = (ax, ay, bx, by) => Math.hypot(ax - bx, (ay - by) * 2);
  // (v3.5) division of labour: a station without an operator only works while the chief stands on its work spot
  const needsChief = (st) => !!(st && st.op && !st.op.operator && st.op.enabled && st.enabled);
  const PILE_ST = { item_fish_raw: 'fish', item_log: 'log', item_wheat: 'wheat', item_ore: 'ore', item_meat_raw: 'meat' };

  // ------------------------------------------------------------------ path finding (A*, ground space)
  const CX = 20, CY = 10;
  const COLS = Math.ceil(gs.W / CX), ROWS = Math.ceil(gs.H / CY);
  let grid = new Uint8Array(COLS * ROWS), gridKey = '';
  function gridKeyNow() {
    // (v3) foundations, finished buildings and newly cleared land change what is walkable too
    let k = Object.keys(gs.progress.done).length + ':' + gs.progress.benchOpen;
    if (gs.sites) for (const id in gs.sites) k += gs.sites[id].state ? gs.sites[id].state[0] : '-';
    if (gs.territory) for (const id in gs.territory.regions) k += gs.territory.regions[id].open ? 'o' : 'c';
    // (v4) the neighbours' shops, houses, station and props add obstacles too
    k += ':' + gs.collision.all.length;
    return k;
  }
  function cellBlocked(c, r) {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return true;
    const k = gridKeyNow();
    if (k !== gridKey) { grid.fill(0); gridKey = k; }
    const i = r * COLS + c;
    if (!grid[i]) grid[i] = gs.collision.blocked(c * CX + CX / 2, r * CY + CY / 2, 15) ? 2 : 1;
    return grid[i] === 2;
  }
  function los(ax, ay, bx, by) {
    const d = gd(ax, ay, bx, by), n = Math.ceil(d / 8);
    for (let i = 1; i <= n; i++) {
      const x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n;
      if (gs.collision.blocked(x, y, 15)) return false;
    }
    return true;
  }
  function astar(sx, sy, tx, ty) {
    const sc = Math.floor(sx / CX), sr = Math.floor(sy / CY);
    let tc = Math.floor(tx / CX), tr = Math.floor(ty / CY);
    if (cellBlocked(tc, tr)) { // nearest free cell to the target
      let best = null, bd = 1e9;
      for (let dr = -8; dr <= 8; dr++) for (let dc = -8; dc <= 8; dc++) {
        if (!cellBlocked(tc + dc, tr + dr)) { const d = Math.hypot(dc, dr); if (d < bd) { bd = d; best = [tc + dc, tr + dr]; } }
      }
      if (best) { tc = best[0]; tr = best[1]; }
    }
    const N = COLS * ROWS;
    const g = new Float32Array(N).fill(1e9), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const heap = [];
    const push = (i, f) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    const h = (c, r) => Math.hypot((c - tc) * CX, (r - tr) * CY * 2);
    const s = sr * COLS + sc, t = tr * COLS + tc;
    if (s < 0 || s >= N) return null;
    g[s] = 0; push(s, h(sc, sr));
    let iter = 0;
    while (heap.length && iter++ < 60000) {
      const [, i] = pop();
      if (closed[i]) continue;
      closed[i] = 1;
      if (i === t) break;
      const c = i % COLS, r = (i / COLS) | 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nc = c + dc, nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
        const j = nr * COLS + nc;
        if (closed[j] || (cellBlocked(nc, nr) && j !== s)) continue;
        const cost = Math.hypot(dc * CX, dr * CY * 2);
        if (g[i] + cost < g[j]) { g[j] = g[i] + cost; from[j] = i; push(j, g[j] + h(nc, nr)); }
      }
    }
    if (from[t] < 0 && t !== s) return null;
    const pts = [];
    for (let i = t; i !== s && i >= 0; i = from[i]) pts.push({ x: (i % COLS) * CX + CX / 2, y: ((i / COLS) | 0) * CY + CY / 2 });
    pts.reverse();
    pts.push({ x: tx, y: ty });
    // string pulling
    const out = [];
    let ax = sx, ay = sy, k = 0;
    while (k < pts.length) {
      let far = k;
      for (let m = pts.length - 1; m > k; m--) if (los(ax, ay, pts[m].x, pts[m].y)) { far = m; break; }
      out.push(pts[far]); ax = pts[far].x; ay = pts[far].y; k = far + 1;
    }
    return out;
  }

  // ------------------------------------------------------------------ bot
  const bot = window.__bot = {
    opts: { policy: 'smart', upg: 'greedy', minBatch: 3 },
    task: null, path: null, pathT: 0, tgt: null,
    t: 0, decideT: 0, events: [], samples: [], taskTime: {}, log: [], noGuide: 0, noGuideRuns: [], curNoGuide: 0,
    lastPos: { x: 0, y: 0 }, stuckT: 0, stuckEvents: 0, blockedT: 0, idleT: 0, waitRuns: [], curWait: 0,
    seenDone: {}, seenUp: { capacity: 0, speed: 0 }, firstCoinT: -1, earned0: 0,
    huntChase: 0, huntCatches: 0, huntChaseTime: 0, warnings: [], stallT: 0, soldItems: 0,
    seenBuilt: {}, seenRegion: {}, hungryT: 0, lastWait: 0,
  };
  // (v4) order cards done and the carpenter's houses are "something new" too (beats)
  gs.events.on('v4:cardDone', (c) => { bot.events.push({ t: bot.t, ev: 'card:' + (c && c.shop ? c.shop : 'standing'), coins: gs.economy.coins }); });
  gs.events.on('v4:houseDone', (h) => { bot.events.push({ t: bot.t, ev: 'house:' + (h && h.id ? h.id : '?'), coins: gs.economy.coins }); });
  const eco = () => gs.economy;
  const P = () => gs.player;
  const bag = () => { const o = {}; for (const it of P().stack.items) o[it.type] = (o[it.type] || 0) + 1; return o; };
  const stations = () => gs.stationList.filter((s) => s.enabled);
  const L = (m) => { bot.log.push(bot.t.toFixed(1) + ' ' + m); if (bot.log.length > 4000) bot.log.shift(); };

  function desiredPad() {
    const prog = gs.progress, coins = eco().coins;
    const main = prog.nextPad();
    const cands = [];
    if (main && !(bot.unreach && bot.unreach[main.id] && bot.t - bot.unreach[main.id] < 120)) cands.push(main);
    // after completion, all hire2 pads are visible: take the cheapest
    for (const id in prog.pads) { const p = prog.pads[id]; if (p !== main && p.active && !p.done) cands.push(p); }
    if (bot.opts.upg !== 'none') {
      for (const k in prog.upPads) {
        if (bot.opts.upg === 'cap' && k !== 'capacity') continue;
        const u = prog.upPads[k];
        if (!u.maxed && !u.done && u.active) cands.push(u);
      }
    }
    const un = bot.unreach || {};
    for (let i = cands.length - 1; i >= 0; i--) if (un[cands[i].id] && bot.t - un[cands[i].id] < 120) cands.splice(i, 1);
    const aff = cands.filter((p) => p.remaining <= coins).sort((a, b) => a.remaining - b.remaining);
    if (aff.length) return aff[0];
    return main || cands.sort((a, b) => a.remaining - b.remaining)[0] || null;
  }
  function cashTotal() { let v = gs.market.cash.value; if (gs.trade.enabled) v += gs.trade.cash.value; if (gs.store) v += gs.store.cash.value; const G = gs.v4 && gs.v4.growth; if (G && G.till) v += G.till.value; return v; }
  const STORE = ['item_can', 'item_axe', 'item_pickaxe', 'item_rod', 'item_sickle', 'item_bow'];
  function shelfFor(type) { return FOODS.includes(type) ? gs.market : GOODS.includes(type) && gs.trade.enabled ? gs.trade : STORE.includes(type) && gs.store && gs.store.enabled ? gs.store : null; }
  function canSell(type) { const s = shelfFor(type); return s && s.stock.countOf(type) + 0 < s.maxPerType; }

  // ------------------------------------------------------------------ (v3) helpers
  const B3 = () => window.__BAL.buildings;
  // ((v4) the station's repair is priced in BALANCE.v4.station)
  const costOf = (k) => (k === 'station' && window.__BAL.v4 && window.__BAL.v4.station ? window.__BAL.v4.station.coins : (B3()[k] || {}).coins) || 0;
  function plotFor(bkey) {
    const p = P();
    let best = null, bd = 1e12;
    // a building with its own reserved site (v4 station: r_station) only goes there
    const own = Object.values(gs.sites).some((q) => q.kind === 'plot' && q.only === bkey);
    for (const id in gs.sites) {
      const st = gs.sites[id];
      if (st.kind !== 'plot' || st.state !== 'plot' || !st.shown) continue;
      if (own && st.only !== bkey) continue;
      if (st.only ? st.only !== bkey : (bkey === 'boathouse' || (st.size === 'S' && !/^house_/.test(bkey)))) continue;
      if (/^house_/.test(bkey) && st.size !== 'S' && Object.values(gs.sites).some((q) => q.kind === 'plot' && q.state === 'plot' && q.shown && q.size === 'S')) continue;
      const d = gd(p.x, p.y, st.dropX, st.dropY);
      if (d < bd) { bd = d; best = st; }
    }
    return best;
  }
  /** a building the bot wants to start now: the next main goal, or a house when people wait */
  function wantBuild(coins) {
    const g = gs.progress.nextGoal();
    if (g && g.kind === 'build' && !gs.isBuilt(g.id) && !gs.isBuilding(g.id)) {
      const ch = gs.buildChoices(plotFor(g.id) || { size: 'M', only: g.id === 'boathouse' ? 'boathouse' : null });
      const c = ch.find((q) => q.key === g.id);
      if (c && !c.locked && coins >= costOf(g.id)) { const pl = plotFor(g.id); if (pl) return { site: pl, bkey: g.id }; }
    }
    if (bot.opts.houses !== false && gs.life && gs.life.waiting.length && !Object.values(gs.sites).some((q) => q.state !== 'plot' && q.state !== 'done' && /^house_/.test(q.building))) {
      for (const k of ['house_a', 'house_c', 'house_b']) {
        const pl = plotFor(k);
        if (!pl) continue;
        const c = gs.buildChoices(pl).find((q) => q.key === k);
        if (c && !c.locked && coins >= costOf(k) + 100) return { site: pl, bkey: k };
      }
    }
    return null;
  }
  const porterFor = (type) => gs.porters.some((w) => w.station && (w.station.output === type || (w.station.kind === 'toolsmith' && type.startsWith('item_') && STORE.includes(type) && type !== 'item_can')));
  /** what the chief should carry himself (nobody else will): { kind, type, src, dst } */
  function chores() {
    const out = [];
    // materials for building sites
    for (const id in gs.sites) {
      const st = gs.sites[id];
      if (st.state !== 'foundation' || !st.shown) continue;
      for (const m of ['item_plank', 'item_ingot']) {
        if (st.missing(m) <= 0) continue;
        if (porterFor(m) || (gs.warehouse && gs.warehouse.count(m) > 0)) continue;
        out.push({ kind: 'site', type: m, dst: st, pad: st.dropPad });
      }
    }
    // tools for hire pads
    for (const id in gs.progress.pads) {
      const pd = gs.progress.pads[id];
      if (!pd.items || pd.done || !pd.active) continue;
      for (const k in pd.items) if ((pd.got[k] || 0) < pd.items[k] && !gs.porters.some((w) => w.station && w.station.kind === 'toolsmith')) out.push({ kind: 'tool', type: k, dst: pd, pad: pd.pad });
    }
    // food for the miners
    const fb = gs.foodBox;
    if (fb && fb.active && fb.count < 5 && !porterFor('item_bread') && !porterFor('item_meat_cooked')) out.push({ kind: 'food', type: 'item_bread', dst: fb, pad: fb.pad });
    return out;
  }
  function srcOf(type) {
    let best = null, bn = 0;
    for (const s of gs.sources()) { if (!s.enabled) continue; const n = s.outStack.countOf(type); if (n > bn) { bn = n; best = s; } }
    return best;
  }

  function setTask(kind, target, extra) {
    bot.task = Object.assign({ kind, target, t0: bot.t, tol: 10 }, extra || {});
    bot.path = null;
    L('task ' + kind + (extra && extra.label ? ' ' + extra.label : '') + ' @' + Math.round(target.x) + ',' + Math.round(target.y));
  }

  function nearestReady(list, raw, fromX, fromY) {
    let best = null, bd = 1e12;
    for (const n of list) {
      if (!n.ready()) continue;
      if (n.reservedBy && n.reservedBy !== P()) continue;
      const d = gd(fromX, fromY, n.x, n.y);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  function decide() {
    const p = P(), coins = eco().coins, b = bag();
    const room = p.room;
    // policy 'arrow': follow the tutorial arrow if there is one
    if (bot.opts.policy === 'arrow') {
      const tg = gs.tutorial.target;
      if (tg) { setTask('arrow', { x: tg.x, y: tg.y }, { label: gs.tutorial.textKey || '(no text)', tol: 8, maxT: 3 }); return; }
    }
    // 0. (v2) customers / the merchant wait at an empty register: stand there until they have paid
    {
      const m = gs.market, tr = gs.trade;
      const sellFood = Object.keys(b).some((t) => FOODS.includes(t) && canSell(t));
      if (m.waitingPay && !m.register.clerk && !sellFood) { setTask('register', m.register, { seller: m, label: 'market', tol: 5 }); return; }
      if (tr.enabled && tr.stock.count > 0 && !tr.register.clerk && !Object.keys(b).some((t) => GOODS.includes(t))) { setTask('register', tr.register, { seller: tr, label: 'trade', tol: 5 }); return; }
    }
    // 0b. (v3) the general store's line waits at its register
    {
      const so = gs.store;
      if (so && so.enabled && so.waitingPay && !so.register.clerk && !Object.keys(b).some((t) => STORE.includes(t))) { setTask('register', so.register, { seller: so, label: 'store', tol: 5 }); return; }
    }
    // 1. pay
    const want = desiredPad();
    if (want && want.remaining <= coins && want.remaining > 0) { setTask('pay', { x: want.x, y: want.y }, { pad: want, label: want.id, tol: 6 }); return; }
    // 1b. (v3) start a building (walk onto a plot; the build menu opens and the bot picks it)
    {
      const wb = wantBuild(coins);
      if (wb) { setTask('build', { x: wb.site.dropX, y: wb.site.dropY }, { site: wb.site, bkey: wb.bkey, label: wb.bkey, tol: 6, maxT: 40 }); return; }
    }
    // 1c. (v3) things only the chief will carry: materials to a site, a tool to a hire pad, food to the miners
    {
      for (const c of chores()) {
        if (b[c.type] > 0) { setTask('deliver', { x: c.pad.x, y: c.pad.y }, { chore: c, label: c.kind + ':' + c.type, tol: 6, maxT: 40 }); return; }
      }
      if (room > 0) {
        for (const c of chores()) {
          const src = srcOf(c.type);
          if (src) { setTask('fetch', src.outPad, { st: src, type: c.type, chore: c, label: 'fetch ' + c.type, tol: 6, maxT: 30 }); return; }
        }
      }
    }
    // 1c'. (v4) saving for the 승격식: the coins lying on the cash pads first (a player watching the rank chip
    //      would; the standing orders kept the bot busy for 20 min with 1000 coins in hand)
    {
      const rp = gs.progress.pads && gs.progress.pads.rank_eup;
      if (rp && rp.active && !rp.done && rp.remaining > coins && cashTotal() >= 150) { cashTask(); if (bot.task) return; }
    }
    // 1d. (v4) the neighbours: cut a ribbon, visit the town when invited, carry for the order cards, feed the
    //     carpenter's house sites (bot.opts.v4 === false turns it off)
    if (bot.opts.v4 !== false && gs.v4 && gs.v4.growth && gs.v4.growth.active) {
      const G = gs.v4.growth, fl = gs.progress.flags;
      for (const id in G.shops) { const sh = G.shops[id]; if (sh.st === 'ribbon' && sh.ribbonPad) { setTask('ribbon', { x: sh.ribbonPad.x, y: sh.ribbonPad.y }, { shop: sh, label: 'ribbon ' + sh.shop, tol: 5, maxT: 25 }); return; } }
      if (fl.townInvite && !fl.townVisit && gs.territory.isOpen('town')) {
        const f = gs.v4.buildings && gs.v4.buildings.find((q) => q.id === 't_fountain');
        if (f) { setTask('visit', { x: f.x - 120, y: f.y + 200 }, { label: 'town', tol: 40, maxT: 90 }); return; }
      }
      // items the cards need -> the cargo pad
      for (const t in b) if (G.needOf(t) > 0) { setTask('dock', { x: G.dock.x, y: G.dock.y }, { type: t, label: 'dock ' + t, tol: 6, maxT: 40 }); return; }
      // planks -> a house site
      const hs = Object.values(G.houses).find((h) => h.st === 'site' && h.pad && h.room('item_plank') > 0);
      if (hs && b.item_plank) { setTask('house', { x: hs.pad.x, y: hs.pad.y }, { site: hs, label: 'house', tol: 6, maxT: 40 }); return; }
      // fetch for the focus card / the house site from a station or workshop output (when worth the walk)
      if (room > 0) {
        const want = [];
        const fc = G.focusCard();
        if (fc) for (const k in fc.need) if (fc.got[k] < fc.need[k]) want.push(k);
        if (hs) want.push('item_plank');
        for (const ty of want) {
          const src = srcOf(ty);
          if (src && src.outStack.countOf(ty) >= Math.min(4, G.needOf(ty) || 4)) { setTask('fetch4', src.outPad, { st: src, type: ty, label: 'fetch4 ' + ty, tol: 6, maxT: 30 }); return; }
        }
      }
    }
    // 2. raw in bag -> deposit (v3.5: on the work spot when nobody works the station: it feeds and cooks there)
    for (const t in b) {
      if (!RAW_ST[t]) continue;
      const st = gs.stations[RAW_ST[t]];
      if (st.inStack.room > 0 || needsChief(st)) {
        if (needsChief(st)) { setTask('operate', st.op, { st, raw: t, label: st.id, tol: 6, maxT: 45 }); return; }
        setTask('deposit', st.inPad, { st, raw: t, label: st.id, tol: 6 }); return;
      }
    }
    const hasRaw = Object.keys(b).some((t) => RAW_ST[t]);
    // 2b. a player sees the coin pile: pick it up when it pays for the next pad (or when it is big)
    {
      const ct0 = cashTotal();
      // (v2) like a person: a coin pile you walk past, or one that has grown big, gets picked up
      const nearPile = [gs.market.cash].concat(gs.trade.enabled ? [gs.trade.cash] : []).some((c) => c.value > 0 && gd(p.x, p.y, c.x, c.y) < 260);
      if (ct0 > 0 && ((want && coins < want.remaining && coins + ct0 >= want.remaining) || ct0 >= (bot.opts.pileMax || 80) || nearPile)) return cashTask();
    }
    // 3. bag full -> sell
    const sellables = Object.keys(b).filter((t) => (FOODS.includes(t) || GOODS.includes(t)) && canSell(t));
    if (room <= 0 && sellables.length) { return sellTask(sellables); }
    if (room <= 0 && hasRaw) {
      // stuck with raw items that no station can take
      const t = Object.keys(b).find((x) => RAW_ST[x]);
      const st = gs.stations[RAW_ST[t]];
      setTask('blocked', st.inPad, { st, label: 'raw ' + t + ' but ' + st.id + ' in=' + st.inStack.count + ' out=' + st.outStack.count, tol: 6, maxT: 2 });
      return;
    }
    // 3b. (v3.5) a station / workshop with work waiting and nobody working it: stand on its work spot
    {
      let best = null, bs = 0;
      for (const st of gs.stationList.concat(gs.workshops)) {
        if (!needsChief(st) || !st.hasWork()) continue;
        const n = st.inStack.count;
        if (st.isWorkshop ? false : n < Math.min(3, bot.opts.minBatch) && st.outStack.count > 0) continue;
        const sc = (st.isWorkshop ? 30 : n) / (gd(p.x, p.y, st.op.x, st.op.y) + 300);
        if (sc > bs) { bs = sc; best = st; }
      }
      if (best) { setTask('operate', best.op, { st: best, label: best.id, tol: 6, maxT: 45 }); return; }
    }
    // 4. collect from station outputs
    if (room > 0) {
      let best = null, bs = 0;
      for (const st of stations()) {
        const n = st.outStack.count;
        if (n <= 0 || !canSell(st.output)) continue;
        const take = Math.min(n, room);
        if (take < Math.min(bot.opts.minBatch, room) && !(st.inStack.count === 0 && n > 0 && take === n && n >= 1 && sellables.length === 0)) continue;
        const sc = take * (gs.constructor && 1) * (window.__BAL.prices[st.output] || 1) / (gd(p.x, p.y, st.outPad.x, st.outPad.y) + 250);
        if (sc > bs) { bs = sc; best = st; }
      }
      if (best) { setTask('collect', best.outPad, { st: best, label: best.id, tol: 6 }); return; }
    }
    // 5. sell what we carry
    if (sellables.length) return sellTask(sellables);
    // 6. cash needed for the next pad (or (v4) the next building, e.g. the station's repair)
    const ct = cashTotal();
    if (want && coins + ct >= want.remaining && ct > 0) return cashTask();
    { const g = gs.progress.nextGoal(); if (g && g.kind === 'build' && ct > 0 && coins < costOf(g.id) && coins + ct >= costOf(g.id)) return cashTask(); }
    // 7. gather by hand
    if (room > 0) {
      const opts = [];
      const add = (kind, list, raw) => {
        const st = gs.stations[RAW_ST[raw]];
        if (!st.enabled || st.inStack.room < 3 || st.outStack.room < 2) return;
        const n = list === 'net' ? (gs.net.ready() ? gs.net : null) : nearestReady(list, raw, p.x, p.y);
        if (!n) return;
        const d = gd(p.x, p.y, n.x, n.y) + gd(n.x, n.y, st.inPad.x, st.inPad.y);
        const val = window.__BAL.prices[st.output];
        opts.push({ kind, n, raw, st, score: val / (d + 600) });
      };
      // (v3.5) a collection pile the gatherers filled (nobody carries it yet): free raw items
      for (const id in gs.piles) {
        const pl = gs.piles[id];
        if (!pl.shown || !pl.enabled || pl.count < 3 || gs.rawPorters.some((r) => r.pile === pl)) continue;
        const st = gs.stations[pl.station];
        if (!st.enabled || (st.inStack.room < 3 && !needsChief(st)) || st.outStack.room < 2) continue;
        const d = gd(p.x, p.y, pl.x, pl.y) + gd(pl.x, pl.y, st.inPad.x, st.inPad.y);
        opts.push({ kind: 'pile', n: pl, raw: pl.item, st, score: (window.__BAL.prices[st.output] * Math.min(pl.count, room) * 0.6) / (d + 300) });
      }
      add('net', 'net', 'item_fish_raw');
      if (gs.progress.isDone('zone_forest')) add('tree', gs.trees, 'item_log');
      if (gs.progress.isDone('zone_farm')) add('wheat', gs.wheat, 'item_wheat');
      if (gs.progress.isDone('zone_mine')) add('rock', gs.rocks, 'item_ore');
      if (gs.progress.isDone('zone_hunt')) add('animal', gs.animals, 'item_meat_raw');
      opts.sort((a, c) => c.score - a.score);
      if (opts.length) {
        const o = opts[0];
        if (o.kind === 'pile') { setTask('pile', o.n, { pile: o.n, label: 'pile ' + o.n.id, tol: 6, maxT: 12 }); return; }
        const sp = o.kind === 'net' ? { x: gs.net.gather.x, y: gs.net.gather.y } : o.kind === 'animal' ? { x: o.n.x, y: o.n.y } : o.n.standPoint(p.x, p.y, {});
        setTask('gather', sp, { node: o.n, nodeKind: o.kind, raw: o.raw, label: o.kind, tol: o.kind === 'animal' ? 40 : 5, maxT: o.kind === 'animal' ? 25 : 15 });
        return;
      }
    }
    if (ct > 0) return cashTask();
    // 8. nothing to do: wait next to the market
    setTask('idle', { x: gs.market.cash.x - 60, y: gs.market.cash.y + 40 }, { tol: 20, maxT: 1 });
  }
  function sellTask(types) {
    const p = P();
    const shelves = [];
    if (types.some((t) => FOODS.includes(t))) shelves.push(gs.market);
    if (types.some((t) => GOODS.includes(t))) shelves.push(gs.trade);
    if (gs.store && types.some((t) => STORE.includes(t))) shelves.push(gs.store);
    // go where most of the bag can be sold (a lone bread must not keep 25 ingots in the bag forever)
    const b = bag(), n = (sh) => types.filter((t) => (sh === gs.market ? FOODS : sh === gs.store ? STORE : GOODS).includes(t)).reduce((k, t) => k + (b[t] || 0), 0);
    shelves.sort((a, c) => (n(c) - n(a)) || (gd(p.x, p.y, a.shelf.x, a.shelf.y) - gd(p.x, p.y, c.shelf.x, c.shelf.y)));
    const s = shelves[0];
    setTask('sell', s.shelf, { seller: s, label: s === gs.market ? 'market' : s === gs.store ? 'store' : 'trade', tol: 6 });
  }
  function cashTask() {
    const p = P();
    const cs = [gs.market.cash];
    if (gs.trade.enabled) cs.push(gs.trade.cash);
    // (v4) 역 금고: the wholesale and the rent pile up there
    const G = gs.v4 && gs.v4.growth;
    if (G && G.till && G.till.value >= 40) cs.push(G.till);
    const c = cs.filter((c) => c.value > 0).sort((a, b) => gd(p.x, p.y, a.x, a.y) - gd(p.x, p.y, b.x, b.y))[0];
    if (!c) return;
    setTask('cash', c, { cash: c, label: c === gs.market.cash ? 'market' : 'trade', tol: 6 });
  }

  // is the current task finished?
  function taskDone(tk) {
    const p = P(), b = bag();
    const el = bot.t - tk.t0;
    if (tk.maxT && el > tk.maxT && tk.kind !== 'gather') return true;
    switch (tk.kind) {
      case 'pay': return tk.pad.done || !tk.pad.active || tk.pad.remaining <= 0 || (eco().coins <= 0 && tk.pad.pad.contains(p.x, p.y));
      case 'deposit': {
        if (!b[tk.raw]) return true;
        if (tk.st.inPad.contains(p.x, p.y) && tk.st.inStack.room <= 0) { tk.fullT = (tk.fullT || 0) + bot.dt; if (tk.fullT > 1.5) return true; }
        return false;
      }
      case 'sell': {
        const types = Object.keys(b).filter((t) => (tk.seller === gs.market ? FOODS : tk.seller === gs.store ? STORE : GOODS).includes(t));
        if (!types.length) return true;
        if (!types.some((t) => tk.seller.stock.countOf(t) < tk.seller.maxPerType)) { tk.fullT = (tk.fullT || 0) + bot.dt; if (tk.fullT > 1) return true; }
        return false;
      }
      case 'collect': {
        if (p.room <= 0) return true;
        if (tk.st.outStack.count === 0 && tk.st.outPad.contains(p.x, p.y)) {
          // wait a moment if more is cooking and the bag is not worth carrying yet
          tk.emptyT = (tk.emptyT || 0) + bot.dt;
          return tk.emptyT > (tk.st.inStack.count > 0 && p.stack.count < p.capacity * 0.5 ? 1.6 : 0.2);
        }
        if (tk.st.outStack.count === 0 && !tk.st.outPad.contains(p.x, p.y)) return true;
        return false;
      }
      case 'cash': return tk.cash.value <= 0;
      case 'register': {
        if (tk.seller === gs.market || (gs.store && tk.seller === gs.store)) {
          // stay while customers still have food (cans, tools) coming / are paying
          const S = tk.seller, f = S.queue[0], goods = S === gs.market ? FOODS : STORE;
          const busy = S.waitingPay || (f && f.need > 0 && goods.some((x) => S.stock.countOf(x) > 0));
          if (!busy) { tk.idleT = (tk.idleT || 0) + bot.dt; return tk.idleT > 0.5; }
          tk.idleT = 0;
          return el > 40;
        }
        return gs.trade.stock.count === 0 || el > 40;
      }
      case 'gather': {
        if (p.room <= 0) return true;
        if (el > tk.maxT) { L('gather timeout ' + tk.nodeKind); return true; }
        if (!tk.node.ready()) {
          if (tk.nodeKind === 'animal' && tk.node.dead) { bot.huntCatches++; }
          // continue with the next node of the same kind if any
          return true;
        }
        if (tk.nodeKind === 'net') return false;
        return false;
      }
      case 'build': return tk.site.state !== 'plot' || !tk.site.shown || el > (tk.maxT || 40);
      case 'deliver': {
        if (!b[tk.chore.type]) return true;
        const d = tk.chore.dst;
        if (d.missing ? d.missing(tk.chore.type) <= 0 : d.room ? d.room(tk.chore.type) <= 0 : false) return true;
        return el > (tk.maxT || 40);
      }
      case 'fetch': {
        const need = tk.chore.dst.missing ? tk.chore.dst.missing(tk.type) : (tk.chore.dst.room ? tk.chore.dst.room(tk.type) : 1);
        if ((b[tk.type] || 0) >= Math.max(1, need) || p.room <= 0) return true;
        if (tk.st.outStack.countOf(tk.type) === 0) { tk.emptyT = (tk.emptyT || 0) + bot.dt; return tk.emptyT > 1.5 || (b[tk.type] > 0); }
        return el > (tk.maxT || 30);
      }
      case 'operate': {
        // stay on the work spot until the station has used up its input (or cannot make more)
        const st = tk.st;
        if (!needsChief(st)) return true;
        const raw = st.input && b[st.input] > 0;
        if (st.op.pad.contains(p.x, p.y)) {
          if (raw && st.inStack.room > 0) return false;
          if (!st.hasWork()) { tk.idleT = (tk.idleT || 0) + bot.dt; return tk.idleT > 0.4; }
          return el > (tk.maxT || 45);
        }
        return el > (tk.maxT || 45) || (!raw && !st.hasWork());
      }
      case 'pile': {
        if (p.room <= 0 || tk.pile.count === 0) return true;
        return el > (tk.maxT || 12) && !tk.pile.pad.contains(p.x, p.y);
      }
      case 'blocked': return true;
      // (v4)
      case 'ribbon': return tk.shop.st !== 'ribbon' || el > (tk.maxT || 25);
      case 'visit': return !!gs.progress.flags.townVisit || el > (tk.maxT || 90);
      case 'dock': return !b[tk.type] || gs.v4.growth.needOf(tk.type) <= 0 || el > (tk.maxT || 40);
      case 'house': return !b.item_plank || tk.site.st !== 'site' || tk.site.room('item_plank') <= 0 || el > (tk.maxT || 40);
      case 'fetch4': return p.room <= 0 || tk.st.outStack.countOf(tk.type) === 0 || (b[tk.type] || 0) >= Math.max(1, gs.v4.growth.needOf(tk.type)) || el > (tk.maxT || 30);
      case 'idle': return el > 0.5;
      case 'arrow': return el > 0.4;
    }
    return true;
  }

  function steerTo(x, y, tol) {
    const p = P();
    const d = gd(p.x, p.y, x, y);
    if (d <= tol) { FV.setInput(0, 0); return true; }
    // path
    bot.pathT -= bot.dt;
    if (!bot.path || bot.pathT <= 0 || !bot.tgt || bot.tgt.x !== x || bot.tgt.y !== y) {
      bot.tgt = { x, y };
      bot.pathT = 1.0;
      bot.path = los(p.x, p.y, x, y) ? [{ x, y }] : (astar(p.x, p.y, x, y) || [{ x, y }]);
    }
    while (bot.path.length > 1 && gd(p.x, p.y, bot.path[0].x, bot.path[0].y) < 14) bot.path.shift();
    const w = bot.path[0];
    let dx = w.x - p.x, dy = (w.y - p.y) / 0.74;   // compensate for the slower vertical speed
    const m = Math.hypot(dx, dy) || 1;
    const k = bot.path.length === 1 ? Math.min(1, Math.max(0.25, d / 70)) : 1;
    const mg = bot.opts.mag || 1;
    FV.setInput((dx / m) * k * mg, (dy / m) * k * mg);
    return false;
  }

  bot.tick = function (dt) {
    bot.dt = dt;
    bot.t += dt;
    const p = P();
    if (bot.firstCoinT < 0 && eco().coins > 0) { bot.firstCoinT = bot.t; bot.events.push({ t: bot.t, ev: 'first_coin' }); }
    // record progression events
    for (const id in gs.progress.done) if (!bot.seenDone[id]) { bot.seenDone[id] = true; bot.events.push({ t: bot.t, ev: id, coins: eco().coins }); L('EVENT ' + id); }
    for (const k of ['capacity', 'speed']) if (gs.progress.up[k] !== bot.seenUp[k]) { bot.seenUp[k] = gs.progress.up[k]; bot.events.push({ t: bot.t, ev: 'up_' + k + '_' + gs.progress.up[k] }); L('EVENT up ' + k); }
    // guidance tracking (is there an arrow or an objective text?)
    const hasArrow = !!gs.tutorial.target, hasText = !!gs.tutorial.textKey;
    if (!hasArrow) { bot.curNoGuide += dt; } else if (bot.curNoGuide > 0) { if (bot.curNoGuide > 5) bot.noGuideRuns.push({ t: +(bot.t - bot.curNoGuide).toFixed(1), len: +bot.curNoGuide.toFixed(1), text: hasText ? gs.tutorial.textKey : null }); bot.curNoGuide = 0; }
    // accidental payments: coins drained into a pad the bot was not trying to pay
    { const all = Object.values(gs.progress.pads).concat(Object.values(gs.progress.upPads));
      bot.paidSeen = bot.paidSeen || new Map();
      for (const pd of all) { const prev = bot.paidSeen.get(pd); const cur = pd.paid; if (prev !== undefined && cur > prev && !(bot.task && bot.task.kind === 'pay' && bot.task.pad === pd)) { bot.accidental = (bot.accidental || 0) + (cur - prev); bot.accList = bot.accList || []; bot.accList.push({ t: +bot.t.toFixed(1), pad: pd.id, amt: cur - prev, task: bot.task ? bot.task.kind + ':' + (bot.task.label || '') : null }); } bot.paidSeen.set(pd, cur); } }
    // market stall: shelf has food the front customer could take but nobody is being served
    { const m = gs.market, f = m.queue[0]; const any = FOODS.some((x) => m.stock.countOf(x) > 0);
      if (f && any && !(f.state === 'wait' && f.arrived)) bot.stallT += dt; }
    // give up on unreachable pads
    if (bot.task && bot.task.kind === 'pay' && bot.t - bot.task.t0 > 20 && !bot.task.pad.pad.contains(p.x, p.y)) { bot.warnings.push({ t: bot.t, w: 'cannot reach pad ' + bot.task.pad.id }); L('UNREACHABLE ' + bot.task.pad.id); bot.unreach = bot.unreach || {}; bot.unreach[bot.task.pad.id] = bot.t; bot.task = null; }
    // (v3) the build menu opened (the chief stopped on a plot): pick the building like a tap, or close it
    if (window.__FV.buildMenuOpen) {
      const ui = FV.game.scene.getScene('UI');
      const tk0 = bot.task;
      if (tk0 && tk0.kind === 'build' && ui.buildSite === tk0.site) { ui.selectCard(tk0.bkey); if (ui.buildBtn && ui.buildBtn.ok) { ui.confirmBuild(); bot.events.push({ t: bot.t, ev: 'build:' + tk0.bkey, coins: eco().coins }); L('BUILD ' + tk0.bkey + ' on ' + tk0.site.id); } else ui.closeBuildMenu(true); }
      else ui.closeBuildMenu(true);
    }
    for (const k in gs.built) if (!bot.seenBuilt[k] || bot.seenBuilt[k] < gs.built[k]) { bot.seenBuilt[k] = gs.built[k]; bot.events.push({ t: bot.t, ev: 'built:' + k, coins: eco().coins }); }
    for (const r in gs.territory.regions) if (gs.territory.regions[r].open && !bot.seenRegion[r]) { bot.seenRegion[r] = true; if (r !== 'start') bot.events.push({ t: bot.t, ev: 'region:' + r, coins: eco().coins }); }
    if (gs.progress.celebrated3 && !bot.seen3) { bot.seen3 = true; bot.events.push({ t: bot.t, ev: 'v3_complete', coins: eco().coins }); }
    // (v4) flags (firstTrain, townInvite, townVisit, shops3, rankReady, rankEup) and the shops as they open
    bot.seenFlag = bot.seenFlag || {};
    for (const f of ['firstTrain', 'townInvite', 'townVisit', 'shops3', 'rankReady', 'rankEup']) if (gs.progress.flags[f] && !bot.seenFlag[f]) { bot.seenFlag[f] = true; bot.events.push({ t: bot.t, ev: 'flag:' + f, coins: eco().coins }); }
    if (gs.v4 && gs.v4.growth) { const G = gs.v4.growth; bot.seenShop = bot.seenShop || {}; for (const id in G.shops) { const sh = G.shops[id]; if (sh.st === 'open' && !bot.seenShop[sh.shop]) { bot.seenShop[sh.shop] = true; bot.events.push({ t: bot.t, ev: 'shop_open:' + sh.shop, coins: eco().coins }); } } }
    if (gs.life && gs.life.waiting.length !== bot.lastWait) { bot.lastWait = gs.life.waiting.length; }
    if (gs.workers.some((w) => w.hungry)) bot.hungryT += dt;
    // decide
    if (bot.task && taskDone(bot.task)) { bot.task = null; bot.thinkT = bot.opts.think ? bot.opts.think * (0.5 + Math.random()) : 0; }
    if (bot.thinkT > 0) { bot.thinkT -= dt; FV.setInput(0, 0); bot.taskTime.think = (bot.taskTime.think || 0) + dt; return; }
    if (!bot.task) decide();
    const tk = bot.task;
    if (!tk) { FV.setInput(0, 0); return; }
    bot.taskTime[tk.kind] = (bot.taskTime[tk.kind] || 0) + dt;
    // move / stand
    let arrived;
    if (tk.kind === 'gather' && tk.nodeKind === 'animal') {
      const a = tk.node;
      const d = gd(p.x, p.y, a.x, a.y);
      bot.huntChaseTime += dt;
      if (d < 55) { FV.setInput(0, 0); arrived = true; }
      else arrived = steerTo(a.x, a.y, 50);
    } else {
      // a pad that popped up under the chief only takes coins after he steps off once (like a player would)
      // (the same for a plot whose build menu was closed: it opens again after one step off)
      const leave = !tk.off && ((tk.kind === 'pay' && tk.pad.needsLeave && tk.pad.pad.contains(p.x, p.y))
        || (tk.kind === 'build' && tk.site.leaveNeeded && tk.site.pad && tk.site.pad.contains(p.x, p.y) && !window.__FV.buildMenuOpen));
      if (leave) {
        const c = tk.kind === 'pay' ? tk.pad : { x: tk.site.dropX, y: tk.site.dropY };
        const offs = [[0, 110], [170, 0], [-170, 0], [0, -110], [130, 80], [-130, 80]].map(([dx, dy]) => ({ x: c.x + dx, y: c.y + dy }));
        tk.off = offs.find((q) => los(p.x, p.y, q.x, q.y)) || offs[0];
      }
      if (tk.off && gd(p.x, p.y, tk.off.x, tk.off.y) < 24) tk.off = null;
      arrived = tk.off ? (steerTo(tk.off.x, tk.off.y, 16), false) : steerTo(tk.target.x, tk.target.y, tk.tol);
    }
    // stuck detection
    const mv = Math.hypot(p.x - bot.lastPos.x, p.y - bot.lastPos.y);
    bot.lastPos.x = p.x; bot.lastPos.y = p.y;
    if (!arrived && mv < 0.3) { bot.stuckT += dt; if (bot.stuckT > 3) { bot.stuckEvents++; (bot.stuckList = bot.stuckList || []).push({ t: +bot.t.toFixed(1), x: Math.round(p.x), y: Math.round(p.y), task: tk.kind + ':' + (tk.label || ''), tx: Math.round(tk.target.x), ty: Math.round(tk.target.y) }); L('STUCK at ' + Math.round(p.x) + ',' + Math.round(p.y) + ' task ' + tk.kind); bot.task = null; bot.stuckT = 0; } }
    else bot.stuckT = 0;
    if (tk.kind === 'blocked') bot.blockedT += dt;
    if (tk.kind === 'idle') bot.idleT += dt;
  };

  bot.sample = function () {
    const s = FV.state();
    const p = P();
    return {
      t: +bot.t.toFixed(1), coins: s.coins, earned: eco().earned, cap: p.capacity, bag: p.stack.count, task: bot.task ? bot.task.kind + ':' + (bot.task.label || '') : null,
      st: Object.fromEntries(gs.stationList.filter((x) => x.enabled).map((x) => [x.id, x.inStack.count + '/' + x.outStack.count])),
      mk: s.market, tr: s.trade, w: s.workers.map((w) => w.type[0] + ':' + w.state + ':' + w.carry).join(' '),
      obj: s.objective, arrow: !!gs.tutorial.target,
      shelf: Object.fromEntries(FOODS.map((f) => [f.slice(5, 9), gs.market.stock.countOf(f)])),
      front: (() => { const f = gs.market.queue[0]; if (!f) return null; const sp = gs.market.slotPos(0); return { st: f.state, arr: f.arrived, want: f.want.type.slice(5, 9) + 'x' + f.want.count, need: f.need, got: f.got, dSlot: Math.round(Math.hypot(f.x - sp.x, f.y - sp.y)), path: f.path.length }; })(),
      leaving: gs.market.leaving.length, agents: gs.agents.length, stall: +bot.stallT.toFixed(1),
      goal: gs.progress.nextGoal() ? gs.progress.nextGoal().id : null, built: Object.keys(gs.built).length, pop: gs.life ? gs.life.people() + '/' + gs.popCap() + '+' + gs.life.waiting.length : '', hungry: +bot.hungryT.toFixed(1),
      paused: gs.scene.isPaused() ? (FV.buildMenuOpen ? 'menu' : 'yes') : undefined,
      piles: Object.fromEntries(Object.keys(gs.piles || {}).filter((k) => gs.piles[k].shown).map((k) => [k, gs.piles[k].count])),
      ops: gs.stationList.concat(gs.workshops).filter((x) => x.op && x.enabled).map((x) => x.id[0] + (x.op.operator ? 'O' : x.op.chief ? 'C' : '-')).join(''),
    };
  };
})();
