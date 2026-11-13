// (v4.3 step B, WP-G — postdepot_addendum.md §6.3 Node acceptance) 물류창고 다음 목표 (GOALS43, src/systems/goals/Goals43.js),
// Node only, on a mock village (like goals.test.mjs):   node tools/test/goals43.test.mjs
//   rows by data (8 here: no mkt_s4 step, EupTaste off; 9 / 10 with them); the words (ko / en, same {slots}); closed
//   before the depot, with the depot but no bank, below 읍; the opening (baselines, pre-done rows with 0 coins, one open
//   banner after the screen is free); rewards once on a live transition (a banner when it was current, a toast out of
//   order), a rule true at the first look after a load marked with 0 coins; the counters (standing cards only, departures
//   with cargo only, capped) and the baselines (decor / 2단 count from the opening, 2단 ✓ when all five lines are 2단, a
//   trimmed x.g43 re-taken for the unmarked rows only); passive trains never current and never holding row 10; every soft
//   case (decor no plot, 2단 no gate / hidden behind MAX_OFFERS, first house lockVacant, shop before meat) waits without
//   blocking and comes back when its path does; a missing first-house site counts, a foundation one leads to its drop
//   pad; row 9 (a stand-in mkt_s4 step) sets g43s4 once, s4Early at 읍, a held-back pad is not "settled"; row 10's gate
//   and its sticky pad; a marked row stays done; g43all compaction; x.g43 removed once rows 3, 4, 6, 7 are marked; the
//   GoalBook seams (no row twice, the third staff pad a side row, sub lines) and Tutorial.v42Goal's order; row 6's place;
//   the pause while a GOALS row regressed; listeners gone after a scene shutdown (BP-56); the save rules keep the keys
import path from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.Phaser = { GameObjects: { Graphics: class {}, Container: class {}, Sprite: class {}, Image: class {} }, BlendModes: {}, Math: {}, Geom: {}, Scene: class {} };
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const imp = (p) => import(path.join(ROOT, p));

const { Goals43, GOALS43 } = await imp('src/systems/goals/Goals43.js');
const { G43, SEEN43, FLAG43 } = await imp('src/data/ids43.js');
const { EupTaste } = await imp('src/systems/v43/EupTaste.js');
const { recent } = await imp('src/systems/v43/hooks.js');
const { STEPS } = await imp('src/systems/Progression.js');
const { GoalBook } = await imp('src/systems/goals/GoalBook.js');
const { Tutorial } = await imp('src/systems/Tutorial.js');
const { GOAL_STR, gt } = await imp('src/systems/goals/strings.js');
const { STRINGS, setLang } = await imp('src/data/strings.js');
const { BALANCE } = await imp('src/data/balance.js');
const SaveM = await imp('src/core/Save.js');

let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? '  — ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const R = BALANCE.goals43.reward, N = BALANCE.goals43.need;
const enabled0 = EupTaste.enabled;
// (this suite reads G alone: row 10 only where a section turns it on; T's own suite covers the taste. Put back at the end)
EupTaste.enabled = false;
setLang('ko');

// ── a mock village after 읍 with the office, the bank and the depot (o: what differs) ─────────────────────────────────
function emitter() {
  const m = new Map();
  const E = {
    on(n, f) { const a = m.get(n) || []; a.push(f); m.set(n, a); return E; },
    off(n, f) { const a = m.get(n); if (a) { const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); } return E; },
    once(n, f) { const w = (...x) => { E.off(n, w); f(...x); }; return E.on(n, w); },
    emit(n, ...x) { for (const f of (m.get(n) || []).slice()) f(...x); return true; },
    count(n) { return (m.get(n) || []).length; },
  };
  return E;
}
const mkPad = (id, x, y, remaining, extra) => Object.assign({ id, x, y, remaining, cost: remaining, paid: 0, active: true, done: false, maxed: false, items: null, got: {}, needsLeave: false, pad: { contains: () => false }, labelText: { text: id } }, extra || {});
function village(o = {}) {
  const ev = emitter();
  const toasts = [], banners = [], flagsSet = [];
  const flags = Object.assign({ firstMeatSale: true }, o.flags || {});
  const done = Object.assign({ mkt_s3: true, hire_clerk_s3: true }, o.done || {});
  const pr = {
    complete: true, flags, done, pads: {},
    isDone: (id) => (id in done ? !!done[id] : true),
    goalDone: () => !vg.regress,
    met: () => true,
    nextGoal: () => null, goalNeed: () => 1, goalValue: () => 1, freePlotFor: () => null,
    setFlag(f) { flagsSet.push(f); flags[f] = true; },
  };
  const depot = { hires: o.hires || 0, fork: o.fork ? 1 : 0, pads: {} };
  depot.sync = () => { depot.pads = {}; if (depot.hires < 3) depot.pads.staff = mkPad('depot_staff', 2000, 900, [1200, 2000, 3000][depot.hires]); if (!depot.fork) depot.pads.fork = mkPad('depot_fork', 2100, 950, 3500); };
  depot.sync();
  const lines = {
    up: Object.assign({}, o.up || {}), pads: {},
    g3: o.g3 || { grill: true, sawmill: true, bakery: true, smelter: true, smokehouse: true },
    gatherers3(l) { return !!this.g3[l]; },
    dueHidden: [],
    offers() { const out = []; for (const l of ['grill', 'sawmill', 'bakery', 'smelter', 'smokehouse']) if (!this.up[l] && this.g3[l]) out.push({ id: 'st2_' + l, kind: 'st2', line: l }); return out; },
  };
  if (o.st2Pads !== false) for (const l of ['grill', 'sawmill']) if (!lines.up[l] && lines.g3[l]) lines.pads['st2_' + l] = mkPad('st2_' + l, l === 'grill' ? 500 : 700, 600, l === 'grill' ? 900 : 1100);
  const freight = { cardAboard: 0 };
  const dockPad = { x: 3000, y: 1200, contains: () => false };
  const cards = o.cards || [{ id: 1, shop: null, need: { item_bread: 40 }, got: { item_bread: 10 } }, { id: 2, shop: null, need: { item_can: 30 }, got: { item_can: 0 } }];
  const growth = { active: true, cards, dockPad, cardDone: (c) => Object.keys(c.need).every((k) => c.got[k] >= c.need[k]) };
  const ui = { ready: true, toast: (m, h) => toasts.push([m, h]) };
  const built = Object.assign({ chief_office: 1, bank42: 1, depot42: 1 }, o.built || {});
  const sites = {};
  for (const id of ['h43_1', 'h43_2']) sites[id] = { id, cfg: { side43: true }, kind: 'plot', state: (o.houses || {})[id] || 'plot', shown: true, only: id === 'h43_1' ? 'house_c' : 'house_a', building: null, dropX: id === 'h43_1' ? 600 : 1110, dropY: id === 'h43_1' ? 1040 : 1600, pad: { contains: () => false }, dropPad: { contains: () => false }, leaveNeeded: false, need: { item_plank: 4 }, stock: { countOf: () => 1 } };
  for (const id of o.noSite || []) delete sites[id];
  const freePlots = o.freePlots !== undefined ? o.freePlots : [{ id: 'w_s9', kind: 'plot', state: 'plot', shown: true, size: 'S', dropX: 800, dropY: 700, pad: { contains: () => false }, leaveNeeded: false }];
  const outPads = { item_bread: { x: 1500, y: 500, contains: () => false }, item_can: { x: 1700, y: 520, contains: () => false } };
  const gs = {
    events: ev, time: { now: 1000 },
    progress: pr,
    v42: { depot, lines, freight, fromOld: false, seen: { whatsNew: 1 }, queueBanner(key, msg, sub, opts) { if (banners.some((b) => b.key === key)) return false; banners.push({ key, msg, sub }); if (opts && opts.onShow) opts.onShow(); return true; } },
    v4: { growth, rank: { level: 2, ceremonyOn: false } },
    sites, built,
    isBuilt: (k) => (built[k] || 0) > 0, isBuilding: () => false,
    buildChoices: (st) => [{ key: st.only, locked: !!vg.lockVacant, reason: vg.lockVacant ? 'lockVacant' : null, cost: { coins: st.only === 'house_c' ? 80 : 160, item_plank: st.only === 'house_c' ? 4 : 6 } }],
    economy: { coins: 5000, add(n) { this.coins += Math.floor(n); } },
    player: { x: 100, y: 100, stack: { items: [], count: 0 } },
    tutorial: { plotFor: () => (vg.freePlots.length ? vg.freePlots[0] : null), sourceOf: (ty) => (outPads[ty] ? { outPad: outPads[ty] } : null) },
    scene: { get: (k) => (k === 'UI' ? ui : null) },
    ui: { toast: () => {}, banner: () => {} },
    v43: { lay: 0 },
    x43: new SaveM.X43(o.x),
    saves: 0,
    save() { this.saves++; },
    paidPads: () => [],
  };
  if (o.seen) gs.v43.seen = Object.assign({}, o.seen);
  const vg = { gs, ev, toasts, banners, flagsSet, depot, lines, freight, growth, dockPad, outPads, freePlots, regress: false, lockVacant: !!o.lockVacant, pr };
  vg.G = Goals43.attach(gs, { fresh: false, remapped: false });
  return vg;
}
/** n ticks of the chain (1 s each: two half-second frames) */
const tick = (vg, n = 1) => { for (let i = 0; i < n; i++) for (let k = 0; k < 2; k++) { vg.gs.time.now += 500; vg.ev.emit('update', vg.gs.time.now, 500); } };
const rowsOf = (vg) => vg.G.rows(true, null);
const rowById = (vg, id) => rowsOf(vg).find((r) => r.id === id);
const seen = (vg) => (vg.gs.v43.seen || {});
const X = (vg) => vg.gs.x43.get('g43');
/** a reload: the same save bits (v43, x) in a new chain reader, the old one's listeners gone */
const reload = (vg) => { vg.ev.emit('shutdown'); vg.gs.x43 = new SaveM.X43(JSON.parse(JSON.stringify(vg.gs.x43.serialize() || null)) || undefined); vg.gs.v43 = JSON.parse(JSON.stringify(vg.gs.v43)); vg.G = Goals43.attach(vg.gs, {}); return vg; };

try {
  console.log('rows by data (BP-53)');
  {
    ok(GOALS43.map((r) => r.id).join() === [G43.staff, G43.fork, G43.st2, G43.deco, G43.house, G43.dlv, G43.train, G43.shop, G43.s4, G43.taste].join(), 'GOALS43 is exactly the 10 ids in the designer\'s order');
    ok(!('stub' in Goals43), 'the B0b stub flag is gone (G is in)');
    const vg = village();
    EupTaste.enabled = false;
    ok(vg.G.defs().length === 8 && rowsOf(vg).length === 8, 'this build: 8 rows (no mkt_s4 step, EupTaste off)', vg.G.defs().map((d) => d.id));
    EupTaste.enabled = true;
    ok(vg.G.defs().length === 9 && vg.G.defs()[8].id === G43.taste, 'EupTaste.enabled: row 10 joins (9 rows without row 9)');
    STEPS.push({ id: 'mkt_s4', type: 'shop', level: 4, after: 'f:rankEup', flag: 'g43s4', also: 'mkt_s3', side: true });
    ok(vg.G.defs().length === 10, 'a mkt_s4 step: row 9 joins (10 rows)');
    STEPS.pop();
    EupTaste.enabled = false;
  }

  console.log('the words (ko / en, same {slots})');
  {
    const slots = (s) => (String(s).match(/\{(\w+)(\|[^}]*)?\}/g) || []).map((m) => m.replace(/\|.*\}/, '}')).sort().join(',');
    const gk = Object.keys(GOAL_STR.ko).filter((k) => /^g43_/.test(k)), ge = Object.keys(GOAL_STR.en).filter((k) => /^g43_/.test(k));
    ok(gk.length >= 20 && gk.length === ge.length && gk.every((k) => k in GOAL_STR.en && slots(GOAL_STR.ko[k]) === slots(GOAL_STR.en[k])), 'goal window: ' + gk.length + ' g43_* keys in ko and en with the same {slots}', gk.filter((k) => !(k in GOAL_STR.en) || slots(GOAL_STR.ko[k]) !== slots(GOAL_STR.en[k])));
    const ok2 = Object.keys(STRINGS.ko).filter((k) => /^obj_g43_/.test(k)), oe = Object.keys(STRINGS.en).filter((k) => /^obj_g43_/.test(k));
    ok(ok2.length >= 12 && ok2.length === oe.length && ok2.every((k) => k in STRINGS.en && slots(STRINGS.ko[k]) === slots(STRINGS.en[k])), 'objective lines: ' + ok2.length + ' obj_g43_* keys in ko and en with the same {slots}');
    const need12 = ['staff', 'fork', 'st2', 'st2gate', 'deco', 'house', 'dlv', 'dlvTake', 'train', 'shop', 's4', 'taste'].map((k) => 'obj_g43_' + k);
    ok(need12.every((k) => k in STRINGS.ko), 'the 12 objective keys of §3.7 are there', need12.filter((k) => !(k in STRINGS.ko)));
    const subs = ['g43_openBanner', 'g43_openSub', 'g43_doneBanner', 'g43_doneSub', 'g43_doneToast', 'g43_half', 'g43_st2Wait', 'g43_st2Slot', 'g43_houseWait', 'g43_shopWait', 'g43_readyBanner', 'g43_readySub'];
    ok(subs.every((k) => k in GOAL_STR.ko), 'the banners and sub lines of §3.7 are there', subs.filter((k) => !(k in GOAL_STR.ko)));
    const vg = village();
    for (const lang of ['ko', 'en']) {
      setLang(lang);
      const names = rowsOf(vg).map((r) => r.name);
      ok(names.every((n) => n && !/g43_|\{/.test(n)), lang + ': every row has its name (no raw key, no slot left)', names);
    }
    setLang('ko');
    ok(gt('g43_st2Gate', { name: '나무꾼 3', coins: '420' }).startsWith('나무꾼 3을') && gt('g43_st2Gate', { name: '광부 2', coins: '1' }).startsWith('광부 2를'), 'the gate line takes the right particle (나무꾼 3을 / 광부 2를)');
  }

  console.log('closed before the bank and the depot (BP-38)');
  {
    const a = village({ built: { depot42: 0 } });
    tick(a, 3);
    ok(!seen(a).g43open && X(a) === undefined && rowsOf(a).every((r) => r.state === 'next' || r.state === 'done'), 'no depot: closed (no g43open, no x.g43, rows next / done)', rowsOf(a).map((r) => r.state));
    ok(a.G.objective({}, 'place') === null && a.G.objective({}, 'text') === null && a.G.current() === null && a.G.refs().size === 0 && a.G.sideRows(null, 1e6).length === 0, 'closed: no objective, no current row, no refs, no side rows');
    const b = village({ built: { bank42: 0 }, hires: 1 });
    tick(b, 3);
    b.depot.hires = 2; b.depot.sync();
    tick(b, 2);
    ok(!seen(b).g43open && !seen(b)[G43.staff] && b.toasts.length === 0 && b.banners.length === 0, 'the depot but no bank: still closed, a hire meanwhile marks nothing');
    b.gs.built.bank42 = 1;
    const c0 = b.gs.economy.coins;
    tick(b, 1);
    ok(seen(b).g43open === 1 && seen(b)[G43.staff] === 1 && b.gs.economy.coins === c0, 'the bank built: opens; the staff hired before is ✓ with 0 coins', seen(b));
    const c = village();
    c.regress = true;
    tick(c, 3);
    ok(!seen(c).g43open, 'a GOALS row not done (below 읍 / 45 people): closed');
    const o = village({ built: { chief_office: 0 } });
    tick(o, 2);
    ok(!seen(o).g43open, 'every V42_BUILDS building is needed (this build: the office too)');
  }

  console.log('the opening: baselines, pre-done rows, one banner');
  {
    const vg = village({ built: { deco_bench: 2, deco_lamp: 1 }, up: { grill: 1 } });
    const c0 = vg.gs.economy.coins, r0 = recent().length;
    tick(vg, 1);
    const ev = recent().slice(r0).filter((e) => e.name === 'goal43');
    ok(seen(vg).g43open === 1 && JSON.stringify(X(vg)) === JSON.stringify({ d: 0, t: 0, k: 3, u: 1 }), 'opened: seen.g43open, x.g43 { d: 0, t: 0, k: 3 decor, u: 1 line at 2단 }', X(vg));
    ok(seen(vg)[G43.shop] === 1 && !seen(vg)[G43.staff] && vg.gs.economy.coins === c0 && vg.G.log.length === 0, 'the shop row (bought before) is ✓ with no coins; the others are not marked', seen(vg));
    ok(ev.some((e) => e.data.state === 'open') && ev.some((e) => e.data.id === G43.shop && e.data.state === 'pre'), 'the bus: goal43 open, then pre for the shop row', ev.map((e) => e.data));
    ok(!vg.banners.length && vg.G.openDue, 'the opening tick itself queues nothing yet (the banner is due)');
    tick(vg, 1);
    ok(vg.banners.filter((b) => b.key === 'g43:open').length === 1 && vg.G.shown.open === 1, 'the next tick: the open banner is queued once (the screen is free)', vg.banners);
    tick(vg, 5);
    ok(vg.banners.filter((b) => b.key === 'g43:open').length === 1, '…and only once');
    const s = vg.G.state();
    ok(s.cur === G43.staff && rowById(vg, G43.staff).state === 'now' && rowById(vg, G43.fork).state === 'next', 'the current row is row 1 (staff), row 2 next', s.rows.map((r) => r.id + ':' + r.state));
    const st = rowById(vg, G43.staff);
    ok(st.place && st.place.ref === vg.depot.pads.staff && st.coins === 1200 && st.have === 0 && st.need === N.staff, 'row 1\'s 가기 is the depot staff pad (1,200 coins, 0 / 2)', { place: st.place && [st.place.x, st.place.y], coins: st.coins });
    const pl = vg.G.objective({}, 'place');
    ok(pl && pl.key === 'obj_g43:g43_staff:0:1200' && pl.pay === true && pl.cost === 1200 && pl.x === 2000 && /물류창고 직원 뽑기 0\/2/.test(pl.text) && vg.G.objective({}, 'text') === null, 'objective: the staff pad, key obj_g43:g43_staff:0:1200, its words', pl);
    // a held screen waits: the letter / the flag card / a panel
    const w = village();
    w.gs.scene.get('UI').panelOpen = true;
    tick(w, 2);
    ok(seen(w).g43open && !w.banners.some((b) => b.key === 'g43:open') && w.G.openDue, 'a panel open: the open banner waits');
    w.gs.scene.get('UI').panelOpen = false;
    w.gs.scene.get('UI').flagMaker = { cardC: {} };
    tick(w, 1);
    ok(!w.banners.some((b) => b.key === 'g43:open'), 'the flag card up: still waits');
    w.gs.scene.get('UI').flagMaker = { cardC: null, c: null };
    w.gs.scene.get('UI').renewal43 = { isOpen: true };
    tick(w, 1);
    ok(!w.banners.some((b) => b.key === 'g43:open'), 'N\'s letter open: still waits');
    w.gs.scene.get('UI').renewal43.isOpen = false;
    tick(w, 1);
    ok(w.banners.some((b) => b.key === 'g43:open'), 'everything closed: it is queued (behind any banner on screen)');
    // a village remapped at this load: after N's letter is read (v43.seen.letter43)
    const rm = village();
    rm.ev.emit('shutdown');
    rm.G = Goals43.attach(rm.gs, { remapped: true });
    tick(rm, 3);
    ok(seen(rm).g43open && !rm.banners.some((b) => b.key === 'g43:open'), 'remapped at this load, the letter not read yet: the open banner waits');
    rm.gs.v43.seen.letter43 = 1;
    tick(rm, 1);
    ok(rm.banners.some((b) => b.key === 'g43:open'), 'the letter read: then it is queued (BP-48)');
    // every row already true at the opening: nothing left, no banner
    const z = village({ hires: 2, fork: true, up: { grill: 1, sawmill: 1, bakery: 1, smelter: 1, smokehouse: 1 }, houses: { h43_1: 'done', h43_2: 'done' } });
    tick(z, 2);
    ok(seen(z)[G43.st2] === 1 && rowById(z, G43.st2).state === 'done', 'all five lines already 2단: row 3 is ✓ at the opening');
    ok(!z.banners.some((b) => b.key === 'g43:open') || rowsOf(z).some((r) => r.state !== 'done'), 'the open banner only when a row is left');
  }

  console.log('rewards: once, on a live transition (BP-39)');
  {
    const vg = village();
    tick(vg, 2);
    const c0 = vg.gs.economy.coins;
    vg.depot.hires = 1; vg.depot.sync(); tick(vg, 1);
    ok(vg.gs.economy.coins === c0 && !seen(vg)[G43.staff], 'one hire (1 / 2): no coins yet');
    ok(rowById(vg, G43.staff).have === 1 && vg.G.objective({}, 'place').key === 'obj_g43:g43_staff:1:2000', 'the row and its objective follow (1 / 2, the next hire 2,000)');
    vg.depot.hires = 2; vg.depot.sync(); tick(vg, 1);
    ok(vg.gs.economy.coins === c0 + R.staff && seen(vg)[G43.staff] === 1 && vg.G.log.length === 1, 'the second hire: marked, +' + R.staff + ' coins', { coins: vg.gs.economy.coins - c0, log: vg.G.log });
    tick(vg, 3);
    vg.G.tick();
    ok(vg.gs.economy.coins === c0 + R.staff && vg.G.log.length === 1, 'evaluated again (ticks, a direct tick): never paid twice');
    const bn = vg.banners.find((b) => b.key === 'g43:' + G43.staff);
    ok(bn && /목표 달성/.test(bn.msg) && bn.sub.indexOf('+' + R.staff) >= 0 && bn.sub.indexOf(gt('g43_fork')) >= 0, 'it was the current row: a banner 「목표 달성: …」 「+300 코인 · 다음: 지게차 …」', bn);
    ok(!vg.toasts.length, 'no toast for it');
    // out of order: row 3 while row 2 (the forklift) is current
    vg.lines.up.sawmill = 1; delete vg.lines.pads.st2_sawmill;
    tick(vg, 1);
    ok(vg.gs.economy.coins === c0 + R.staff + R.st2 && vg.toasts.some((q) => /목표 달성/.test(q[0]) && q[0].indexOf('+' + R.st2) >= 0 && q[1] === 2200) && !vg.banners.some((b) => b.key === 'g43:' + G43.st2), 'row 3 done out of order: +' + R.st2 + ' and a toast (with its hold), no banner', vg.toasts);
    // a marked row stays done when its state regresses
    vg.depot.hires = 0; vg.depot.sync(); tick(vg, 1);
    ok(rowById(vg, G43.staff).state === 'done', 'a marked row stays done after its state regresses');
    // a reload: a rule true at the first look whose marker is gone (a dropped key, a crash before the save) -> 0 coins
    vg.depot.hires = 2; vg.depot.sync();
    vg.depot.fork = 1; vg.depot.sync();
    delete vg.gs.v43.seen[G43.staff];
    reload(vg);
    const c1 = vg.gs.economy.coins;
    tick(vg, 2);
    ok(seen(vg)[G43.staff] === 1 && seen(vg)[G43.fork] === 1 && vg.gs.economy.coins === c1 && vg.G.log.length === 0 && !vg.banners.some((b) => b.key === 'g43:' + G43.fork), 'after a reload: rows already true (a lost marker, the forklift bought while closed) are marked with 0 coins, no banner', { coins: vg.gs.economy.coins - c1, log: vg.G.log });
    ok(!vg.banners.filter((b) => b.key === 'g43:open').length || vg.banners.filter((b) => b.key === 'g43:open').length === 1, 'no second open banner after the reload');
  }

  console.log('the counters and the baselines (§3.3)');
  {
    const vg = village({ built: { deco_bench: 1 } });
    tick(vg, 2);
    vg.ev.emit('v4:cardDone', { shop: 'cafe', need: {}, got: {} });
    ok(X(vg).d === 0, 'a founding card (c.shop) does not count');
    vg.ev.emit('v4:cardDone', { shop: null, need: {}, got: {} });
    vg.ev.emit('v4:cardDone', { shop: null, need: {}, got: {} });
    ok(X(vg).d === 2 && rowById(vg, G43.dlv).have === 2, 'two standing cards: d = 2', X(vg));
    vg.ev.emit('v4:train', 'depart', 'ours');
    ok(X(vg).t === 0, 'a departure with nothing aboard does not count');
    vg.freight.cardAboard = 4;
    vg.ev.emit('v4:train', 'arrive', 'ours'); vg.ev.emit('v4:train', 'depart', 'town');
    ok(X(vg).t === 0, 'an arrival / the town\'s departure do not count');
    vg.ev.emit('v4:train', 'depart', 'ours');
    ok(X(vg).t === 1, 'a departure from our station with cargo: t = 1');
    // reload mid-chain keeps d, t and the baselines
    vg.gs.built.deco_lamp = 1;
    reload(vg);
    tick(vg, 1);
    ok(JSON.stringify(X(vg)) === JSON.stringify({ d: 2, t: 1, k: 1, u: 0 }) && rowById(vg, G43.deco).have === 1, 'a reload keeps d = 2, t = 1 and the baselines (decor built after the opening counts: 1 / 2)', X(vg));
    const c0 = vg.gs.economy.coins;
    for (let i = 0; i < 4; i++) vg.ev.emit('v4:cardDone', { shop: null, need: {}, got: {} });
    ok(X(vg).d === N.dlv, 'd stops at need (' + N.dlv + ')');
    ok(seen(vg)[G43.dlv] === 1 && vg.gs.economy.coins === c0 + R.dlv, 'the card that reaches the need marks the row at once (Growth saves right after it: no reload can find the count without its marker)');
    tick(vg, 1);
    ok(seen(vg)[G43.dlv] === 1 && vg.gs.economy.coins === c0 + R.dlv, 'the deliveries row pays ' + R.dlv + ' once (seen false before the reload too: this session saw it false)', vg.gs.economy.coins - c0);
    vg.ev.emit('v4:cardDone', { shop: null, need: {}, got: {} });
    ok(X(vg).d === N.dlv, 'a marked row counts no more');
    for (let i = 0; i < 5; i++) vg.ev.emit('v4:train', 'depart', 'ours');
    ok(X(vg).t === N.train, 't stops at need (' + N.train + ')');
    tick(vg, 1);
    vg.gs.built.deco_snowman = 1; vg.lines.up.grill = 1;
    tick(vg, 1);
    ok(seen(vg)[G43.train] && seen(vg)[G43.deco] && seen(vg)[G43.st2] && X(vg) === undefined, 'rows 3, 4, 6 and 7 marked: x.g43 is removed', { x: X(vg), seen: seen(vg) });
    // a trimmed x.g43: counters from 0, baselines re-taken now, for the unmarked rows only
    const t2 = village({ built: { deco_bench: 2 } });
    tick(t2, 2);
    t2.ev.emit('v4:cardDone', { shop: null, need: {}, got: {} });
    t2.gs.built.deco_lamp = 1;
    t2.gs.x43.set('g43', undefined);
    reload(t2);
    tick(t2, 1);
    ok(JSON.stringify(X(t2)) === JSON.stringify({ d: 0, t: 0, k: 3, u: 0 }) && rowById(t2, G43.deco).have === 0, 'x.g43 trimmed: counters restart at 0, the baselines are re-taken at today\'s counts (decor 3)', X(t2));
    const t3 = village({ x: { g43: { d: 'x', t: -4, u: 9 } } });
    t3.gs.v43.seen = { g43open: 1 };
    tick(t3, 1);
    ok(JSON.stringify(X(t3)) === JSON.stringify({ d: 0, t: 0, k: 0, u: 5 }), 'a broken x.g43 is read safely (d, t clamped; a missing k re-taken)', X(t3));
    // the count reaches its need in the first second after a load, before the first tick looked: it was below the need
    //  a moment before (this session saw the rule false), so the row pays, once
    const t4 = village();
    tick(t4, 2);
    for (let i = 0; i < N.dlv - 1; i++) t4.ev.emit('v4:cardDone', { shop: null, need: {}, got: {} });
    t4.freight.cardAboard = 2;
    for (let i = 0; i < N.train - 1; i++) t4.ev.emit('v4:train', 'depart', 'ours');
    reload(t4);
    const c4 = t4.gs.economy.coins;
    t4.ev.emit('v4:cardDone', { shop: null, need: {}, got: {} });
    t4.ev.emit('v4:train', 'depart', 'ours');
    tick(t4, 2);
    ok(seen(t4)[G43.dlv] === 1 && seen(t4)[G43.train] === 1 && t4.gs.economy.coins === c4 + R.dlv + R.train && t4.G.log.length === 2, 'a card / a departure that reaches the need before the first tick after a load pays its row once (+' + (R.dlv + R.train) + ')', { coins: t4.gs.economy.coins - c4, log: t4.G.log });
  }

  console.log('passive and soft rows never block (BP-40, BP-43)');
  {
    EupTaste.enabled = true;
    const vg = village({ hires: 2, fork: true, up: {}, st2Pads: false, g3: { grill: false, sawmill: false, bakery: false, smelter: false, smokehouse: false }, freePlots: [], lockVacant: true, done: { mkt_s3: false, hire_clerk_s3: false }, flags: { firstMeatSale: false } });
    tick(vg, 2);
    let rs = rowsOf(vg);
    const st = (id) => rs.find((r) => r.id === id);
    ok(st(G43.st2).state === 'wait' && st(G43.st2).g43.wait === 'g43_st2Wait' && vg.G.sub(st(G43.st2)) === gt('g43_st2Wait'), '2단 with no third worker and no gate pad: waits, 「셋째 일꾼을 뽑으면 2단이 열려요」');
    ok(st(G43.deco).state === 'wait' && st(G43.deco).why === 'noplot', 'decor with no free plot: waits (noplot)');
    ok(st(G43.house).state === 'wait' && st(G43.house).g43.wait === 'g43_houseWait' && vg.G.sub(st(G43.house)) === gt('g43_houseWait'), 'first house locked by lockVacant: waits, 「빈 방이 차면 지을 수 있어요」');
    ok(st(G43.shop).state === 'next' && st(G43.shop).g43.skip && st(G43.shop).g43.wait === 'g43_shopWait' && /고기가 처음 팔리면/.test(st(G43.shop).g43.obj.text), 'the shop before the first meat sale (after the current row: 「다음」): no path, 「고기가 처음 팔리면 열려요」', { st: st(G43.shop).state, g: st(G43.shop).g43 });
    ok(st(G43.dlv).state === 'now' && vg.G.current().id === G43.dlv, 'they do not block: the deliveries row is current');
    ok(st(G43.train).state === 'wait' && st(G43.train).why === 'passive' && vg.G.sub(st(G43.train)).indexOf('0 / 3') >= 0, 'the trains row: passive, counting (기다리면 저절로 · 0 / 3)', vg.G.sub(st(G43.train)));
    ok(st(G43.taste).state === 'next' && !st(G43.taste).place && !vg.G.tasteReady(), 'row 10 waits for the deliveries (not settled)');
    for (let i = 0; i < 3; i++) vg.ev.emit('v4:cardDone', { shop: null, need: {}, got: {} });
    tick(vg, 1);
    rs = rowsOf(vg);
    ok(st(G43.taste).state === 'now' && st(G43.taste).place && vg.G.tasteReady() && seen(vg)[SEEN43.g43ready] === 1, 'only soft waits and the counting trains left: row 10 is current, its pad place, g43ready', { taste: st(G43.taste).state, ready: vg.G.tasteReady() });
    ok(vg.banners.filter((b) => b.key === 'g43:ready').length === 1 && /작은 축하/.test(vg.banners.find((b) => b.key === 'g43:ready').msg), 'the ready banner once (「마을회관 앞에서 작은 축하가 기다려요」)');
    ok(vg.G.objective({}, 'place') && vg.G.objective({}, 'place').key === 'obj_g43:g43_taste:0:0', 'objective: the taste pad (cost 0, the arrow shows)');
    // (a3.3 G+T) T's pad as the place; hold as the v4.2 pads': not while the pad wants him to step off once (leave)
    {
      const tp = { x: 420, y: 380, r: 60, contains: () => false };
      // (the chain is read once per frame: the next frame is a new gs.time.now)
      vg.gs.eupTaste = { pad: tp, leave: true };
      vg.gs.time.now += 16;
      const o1 = vg.G.objective({}, 'place'), r1 = rowsOf(vg).find((r) => r.id === G43.taste);
      vg.gs.eupTaste.leave = false;
      vg.gs.time.now += 16;
      const o2 = vg.G.objective({}, 'place');
      delete vg.gs.eupTaste;
      ok(o1 && o1.x === 420 && o1.y === 380 && o1.pad === tp && r1.place.ref === tp && o1.hold === false && o2 && o2.hold === true, 'row 10 walks to T\'s pad (gs.eupTaste.pad); the objective holds only when T needs no step-off (leave)', { o1, o2 });
    }
    // a soft row gets its path back: it is current again, the taste pad stays (sticky)
    vg.freePlots.push({ id: 'w_s9', kind: 'plot', state: 'plot', shown: true, size: 'S', dropX: 800, dropY: 700, pad: { contains: () => false }, leaveNeeded: false });
    tick(vg, 1);
    rs = rowsOf(vg);
    ok(st(G43.deco).state === 'now' && st(G43.deco).place && st(G43.deco).place.x === 800, 'a plot frees up: decor is the current row again, its 가기 the plot');
    ok(vg.G.tasteReady() && st(G43.taste).state === 'next' && st(G43.taste).place, '…and the taste pad stays (sticky: g43ready)');
    // the 2단 offer due but hidden behind the three offers: its own line
    vg.lines.g3.grill = true;
    tick(vg, 1);
    rs = rowsOf(vg);
    ok(st(G43.st2).g43.wait === 'g43_st2Slot', 'a 2단 offer due with no pad (MAX_OFFERS): 「다른 제안을 먼저 정하면 2단 발판이 나와요」');
    // a gate pad: the third worker's hire pad leads
    vg.lines.g3.grill = false;
    vg.pr.pads.hire3_lumberjack = mkPad('hire3_lumberjack', 300, 300, 420, { items: { item_axe: 1 } });
    vg.pr.pads.hire2_miner = mkPad('hire2_miner', 320, 320, 650);
    rs = rowsOf(vg);
    ok(st(G43.st2).place && st(G43.st2).place.ref === vg.pr.pads.hire3_lumberjack && st(G43.st2).g43.gate === '나무꾼 3' && /나무꾼 3을/.test(vg.G.sub(st(G43.st2))), 'no 2단 pad but a gate pad: the cheapest one (나무꾼 3, 420), 「나무꾼 3을 먼저 뽑아요」', vg.G.sub(st(G43.st2)));
    // the first house: lockVacant lifted -> its plot; foundation -> its drop pad; a missing site counts
    vg.lockVacant = false;
    rs = rowsOf(vg);
    ok(st(G43.house).place && st(G43.house).place.x === 600 && st(G43.house).coins === 80, 'the house card open: the first plot (h43_1, 80 coins)');
    vg.gs.sites.h43_1.state = 'foundation'; vg.gs.sites.h43_1.building = 'house_c';
    rs = rowsOf(vg);
    ok(st(G43.house).place && st(G43.house).building && vg.G.sub(st(G43.house)) === null && new GoalBook(vg.gs).sub(st(G43.house)).indexOf('1/4') >= 0, 'a foundation first house: its drop pad, 짓는 중 · 재료 1/4');
    EupTaste.enabled = false;
    const m = village({ noSite: ['h43_2'], houses: { h43_1: 'done' } });
    tick(m, 2);
    ok(seen(m)[G43.house] === 1, 'a missing first-house site counts as built');
    const sc = village({ houses: { h43_1: 'done', h43_2: 'scaffold' } });
    tick(sc, 2);
    ok(rowById(sc, G43.house).why === 'passive' && rowById(sc, G43.house).state !== 'now', 'a first house building by itself: passive, never current');
  }

  console.log('row 9 (a stand-in mkt_s4 step) and the g43s4 flag (BP-41, BP-43)');
  {
    STEPS.push({ id: 'mkt_s4', type: 'shop', level: 4, after: 'f:rankEup', flag: 'g43s4', also: 'mkt_s3', side: true });
    EupTaste.enabled = true;
    const vg = village({ hires: 2, fork: true, up: { grill: 1 }, houses: { h43_1: 'done', h43_2: 'done' }, done: { mkt_s4: false } });
    tick(vg, 2);
    ok(!vg.pr.flags.g43s4 && rowById(vg, G43.s4).state === 'next', 'rows before it open: row 9 waits in 「다음」, no flag');
    vg.lines.up.sawmill = 1; vg.gs.built.deco_bench = 2;
    for (let i = 0; i < 3; i++) vg.ev.emit('v4:cardDone', { shop: null, need: {}, got: {} });
    tick(vg, 2);
    ok(vg.pr.flags.g43s4 === true && vg.flagsSet.filter((f) => f === 'g43s4').length === 1 && vg.G.current().id === G43.s4, 'rows 1–8 settled (trains counting): row 9 is current, g43s4 set exactly once', vg.flagsSet);
    ok(!vg.G.tasteReady() && rowById(vg, G43.taste).state === 'next', 'a mkt_s4 pad not standing yet (held back by paidPadNear): not settled, no taste pad');
    vg.pr.pads.mkt_s4 = mkPad('mkt_s4', 1300, 900, 2000, { items: { item_plank: 20, item_ingot: 8 } });
    let r9 = rowById(vg, G43.s4);
    ok(r9.place && r9.place.ref === vg.pr.pads.mkt_s4 && r9.state === 'now', 'its pad stands: row 9\'s 가기');
    vg.pr.flags.s4half = true;
    r9 = rowById(vg, G43.s4);
    ok(/반값/.test(vg.G.sub(r9)), 'an s4half village: 「반값」 under row 9', vg.G.sub(r9));
    vg.pr.done.mkt_s4 = true;
    tick(vg, 1);
    ok(vg.G.current().id === G43.taste && vg.G.tasteReady(), 'stage 4 bought: row 10 current, the taste pad may stand');
    // row 9 settled when mkt_s3 itself is out of reach (row 8 waits with no path)
    const u = village({ hires: 2, fork: true, up: { grill: 1 }, built: { deco_bench: 0 }, houses: { h43_1: 'done', h43_2: 'done' }, done: { mkt_s4: false, mkt_s3: false, hire_clerk_s3: false }, flags: { firstMeatSale: false }, freePlots: [] });
    tick(u, 2);
    u.lines.up.sawmill = 1;
    for (let i = 0; i < 3; i++) u.ev.emit('v4:cardDone', { shop: null, need: {}, got: {} });
    tick(u, 2);
    ok(rowById(u, G43.s4).state === 'wait' && u.G.tasteReady(), 'mkt_s3 out of reach (no meat sold): row 9 settled, the taste gate opens');
    // s4Early: the flag at 읍, before the chain opens
    const e = village({ built: { depot42: 0 } });
    BALANCE.goals43.s4Early = true;
    tick(e, 1);
    BALANCE.goals43.s4Early = false;
    ok(e.pr.flags.g43s4 === true && !seen(e).g43open, 's4Early: g43s4 at 읍 (the chain still closed)');
    STEPS.pop();
    EupTaste.enabled = false;
  }

  console.log('g43all compaction and the save rules (BP-54, BP-46, BP-47)');
  {
    const vg = village({ hires: 2, fork: true, houses: { h43_1: 'done', h43_2: 'done' } });
    tick(vg, 2);
    vg.lines.up.grill = 1; vg.gs.built.deco_bench = 2;
    for (let i = 0; i < 3; i++) { vg.ev.emit('v4:cardDone', { shop: null, need: {}, got: {} }); }
    vg.freight.cardAboard = 1;
    for (let i = 0; i < 3; i++) vg.ev.emit('v4:train', 'depart', 'ours');
    tick(vg, 1);
    const keys = Object.keys(seen(vg));
    ok(seen(vg).g43all === 1 && keys.every((k) => !/^g43_/.test(k)) && rowsOf(vg).every((r) => r.state === 'done'), 'rows 1–8 all marked: g43all replaces the eight row keys', keys);
    ok(X(vg) === undefined, 'x.g43 gone with them');
    const sv = SaveM.sanitizeV43({ lay: 0, seen: Object.assign({ letter43: 1, tour43: 1, s4offer: 1, eupTaste: 1 }, ...GOALS43.slice(0, 8).map((d) => ({ [d.id]: 1 })), { g43open: 1, g43all: 1, g43ready: 1, eup_taste: 1 }) });
    ok(Object.keys(sv.seen).length === 15 && !('eupTaste' in sv.seen) && sv.seen.eup_taste === 1 && sv.seen.g43_staff === 1, 'sanitizeV43 keeps every chain key (15 with today\'s three, ≤ 32) and drops eupTaste', Object.keys(sv.seen));
    const big = { d: 10, t: 10, k: 999999, u: 5 };
    const kx = SaveM.keepX({ g43: big });
    ok(kx && JSON.stringify(kx.g43) === JSON.stringify(big) && JSON.stringify(big).length <= 48, 'keepX keeps x.g43 at its largest (' + JSON.stringify(big).length + ' B ≤ 48)');
  }

  console.log('the pause while a GOALS row regressed');
  {
    const vg = village();
    tick(vg, 2);
    vg.regress = true;
    const c0 = vg.gs.economy.coins;
    vg.depot.hires = 2; vg.depot.sync();
    vg.ev.emit('v4:cardDone', { shop: null, need: {}, got: {} });
    tick(vg, 2);
    ok(!seen(vg)[G43.staff] && vg.gs.economy.coins === c0 && X(vg).d === 1 && vg.G.current() === null && vg.G.objective({}, 'text') === null, 'paused: no marker, no coins, no current row; the counters still count', { d: X(vg).d });
    vg.regress = false;
    tick(vg, 1);
    ok(seen(vg)[G43.staff] === 1 && vg.gs.economy.coins === c0 + R.staff, 'back: the staff row (seen false before) pays then');
  }

  console.log('row 6: where the deliveries lead (BP-55)');
  {
    const vg = village({ hires: 2, fork: true, up: { grill: 1 }, built: { deco_bench: 0 }, houses: { h43_1: 'done', h43_2: 'done' } });
    tick(vg, 2);
    vg.lines.up.sawmill = 1; vg.gs.built.deco_bench = 2;
    tick(vg, 1);
    let r6 = rowById(vg, G43.dlv);
    ok(vg.G.current().id === G43.dlv && r6.place && r6.place.ref === vg.outPads.item_bread, 'empty-handed: the focus standing card\'s missing item\'s output pad (bread)', r6.place);
    const o1 = vg.G.objective({}, 'place');
    ok(o1 && /정기 납품: 빵 가지러 가요 10\/40/.test(o1.text) && o1.pay && o1.cost === 0, 'objective: 「정기 납품: 빵 가지러 가요 10/40」 (cost 0, the arrow shows)', o1 && o1.text);
    vg.gs.player.stack.items.push({ type: 'item_can' });
    r6 = rowById(vg, G43.dlv);
    ok(r6.place && r6.place.ref === vg.dockPad && /정기 납품 0\/3 · 통조림/.test(vg.G.objective({}, 'place').text), 'carrying cans a standing card needs: the dock (「정기 납품 0/3 · 통조림 0/30」)', vg.G.objective({}, 'place').text);
    vg.gs.player.stack.items = [{ type: 'item_fish_raw' }];
    r6 = rowById(vg, G43.dlv);
    ok(r6.place && r6.place.ref === vg.outPads.item_bread, 'carrying something no card needs: the source again');
    ok(/3 \/ 3|0 \/ 3/.test(vg.G.sub(r6)) && vg.G.sub(r6).indexOf('10/40') >= 0, 'its line: 0 / 3 · 빵 10/40', vg.G.sub(r6));
  }

  console.log('the GoalBook seams: no row twice, the depot pads, sub; Tutorial.v42Goal order');
  {
    const vg = village({ hires: 0 });
    tick(vg, 2);
    const gs = vg.gs;
    // (GoalBook's own rows on this mock: every first-loop / zone step and v4 goal done, the v4.2 buildings built)
    const fork = vg.depot.pads.fork, staff = vg.depot.pads.staff;
    gs.paidPads = () => [fork, mkPad('rest_x', 10, 10, 300)];
    const B = new GoalBook(gs), b = B.read(6, 20);
    const ids = [b.cur && b.cur.id].concat(b.next.map((r) => r.id), b.side.map((r) => r.id));
    ok(b.cur && b.cur.id === G43.staff && b.cur.kind === 'g43', 'the window\'s 지금 할 일 is row 1 (staff)', b.cur && b.cur.id);
    ok(new Set(ids).size === ids.length && b.side.every((r) => r.id !== 'depot_fork' && r.id !== 'depot_staff'), 'no row twice; the forklift pad (row 2\'s place, in 「다음」) and the staff pad (row 1) are not side rows', b.side.map((r) => r.id));
    ok(b.next[0].id === G43.fork && b.next[0].place && b.next[0].place.ref === fork, 'row 2 in 「다음」 with its 가기 (the forklift pad)');
    vg.depot.hires = 2; vg.depot.sync();
    tick(vg, 1);
    const b2 = B.read(6, 20);
    ok(b2.side.some((r) => r.id === 'depot_staff' && r.coins === 3000) && b2.cur.id === G43.fork, 'row 1 done: the third staff pad is a side row (3,000), row 2 current', b2.side.map((r) => r.id + ':' + r.coins));
    ok(/1,200|3,500/.test(B.sub(b2.cur)) || B.sub(b2.cur) === '3,500 코인', 'sub: the generic cost line for the forklift (' + B.sub(b2.cur) + ')');
    ok(b2.all >= 8 && b2.done >= 2, 'the progress line counts the chain (' + b2.done + ' / ' + b2.all + ')');
    // Tutorial.v42Goal: a G row with a place first, then the line offers, then a G row's text
    const T = { gs };
    gs.v42.office = null;
    gs.sites.v42_office = null;
    const offer = mkPad('p2_grill', 50, 60, 600, { opts: { labelFn: () => '생선 짐꾼 2' } });
    gs.v42.lines.pads = { p2_grill: offer };
    let c = Tutorial.prototype.v42Goal.call(T);
    ok(c && c.key.indexOf('obj_g43:g43_fork') === 0, 'v42Goal: the current G row with a place (the forklift) before the line offers', c && c.key);
    vg.depot.fork = 1; vg.depot.sync(); vg.lines.up.grill = 1; vg.gs.built.deco_bench = 2; gs.sites.h43_1.state = 'done'; gs.sites.h43_2.state = 'done';
    for (let i = 0; i < 3; i++) vg.ev.emit('v4:cardDone', { shop: null, need: {}, got: {} });
    tick(vg, 1);
    c = Tutorial.prototype.v42Goal.call(T);
    ok(c && c.key === 'obj_next:p2_grill:600' && vg.G.current().id === G43.train, 'only the counting trains left: the line offer leads (the waiting row never hides it)', c && c.key);
    gs.v42.lines.pads = {};
    c = Tutorial.prototype.v42Goal.call(T);
    ok(c && c.key.indexOf('obj_g43:g43_train') === 0 && /기차가 짐을 실어 가요 0\/3/.test(c.text), 'no line offer: the trains row\'s text', c);
  }

  console.log('a scene shutdown removes every listener (BP-56)');
  {
    const vg = village();
    tick(vg, 2);
    const n0 = { u: vg.ev.count('update'), t: vg.ev.count('v4:train'), c: vg.ev.count('v4:cardDone') };
    const old = vg.G;
    vg.ev.emit('shutdown');
    ok(vg.ev.count('update') === n0.u - 1 && vg.ev.count('v4:train') === n0.t - 1 && vg.ev.count('v4:cardDone') === n0.c - 1 && vg.gs.goals43 === null && old.dead, 'shutdown: the update / v4:train / v4:cardDone listeners are gone, gs.goals43 cleared');
    vg.freight.cardAboard = 3;
    vg.ev.emit('v4:train', 'depart', 'ours'); vg.ev.emit('v4:cardDone', { shop: null, need: {}, got: {} });
    ok(X(vg).t === 0 && X(vg).d === 0, 'after it, a train and a card change nothing');
    vg.G = Goals43.attach(vg.gs, {});
    vg.ev.emit('v4:train', 'depart', 'ours');
    ok(X(vg).t === 1, 'the next build\'s reader: one departure counts exactly 1 (no doubled listener)', X(vg));
    const again = Goals43.attach(vg.gs, {});
    vg.ev.emit('v4:train', 'depart', 'ours');
    ok(X(vg).t === 2 && vg.G.dead && vg.gs.goals43 === again, 'attach twice on one scene: the old reader is dropped first (still +1)', X(vg));
    ok(Goals43.attach({}, {}) === null && Goals43.attach(null) === null, 'attach on something that is not a scene does nothing');
  }
} catch (e) {
  fail++;
  console.log('  FAIL threw: ' + (e && e.stack ? e.stack : e));
}
EupTaste.enabled = enabled0;
console.log(fail === 0 ? 'goals43.test: ' + pass + ' passed, 0 failed' : 'goals43.test: ' + pass + ' passed, ' + fail + ' FAILED');
process.exit(fail ? 1 : 0);
