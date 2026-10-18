// 금방 module Node tests (docs/geumbang_plan.md §13: gb_model, gb_routes, gb_save, gb_parity in one file):
//   nice -n 15 node --test tools/test/geumbang_lab/geumbang.test.mjs
// determinism (same seed -> same events and slice); conservation of items (racks + open orders + delivered =
// start + inflow, restocks included) and coins (Σ pay == Σ delivered value, nothing paid twice) every second of a
// multi-day soak; caps (≤ 24 open, ≤ 2 per address); never an order to a 'none' address; never an unfillable order
// and the racks keep their floor; the shops-first guard (paused items are never ordered; 훈제 고기 waits for a full
// shelf); every van back in its bay each night, the spur one van at a time, the watchdog quiet in normal runs;
// throughput per van; the failure cases (address gone, blocked by walkers, route lost, save mid-tour, racks full on
// restock); routes (every van address reachable with a curb walk ≤ walkMaxM, headings in the 8 drawn, no rail
// crossing, the spur on painted cells, bay 1 inside the raised apron); the save slice (300 fuzzed, round trip, mid
// tour, v8 rows); the v8 Order shape; perf per tick; the host headless (toasts, api, events).

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, makeDepot, ROADS, doorPointOf, hourOf, GB_TUNING, GB_LAYOUT } from './fake_env.mjs';
import { makeEntries, villageGraph, VILLAGE } from './lab_world.js';
import { GbModel, parseGot, slot } from '../../../src/geumbang/model/GbModel.js';
import { Order as V8Order } from '../../../src/city/logistics/model/orders.js';
import { Order, sizeOf, catOf } from '../../../src/geumbang/model/orders.js';
import { sanitizeGeumbang, fitGeumbang, GEUMBANG_SLICE, toV8Rows, sliceBytes } from '../../../src/geumbang/save.js';
import { dir8, axisDir } from '../../../src/geumbang/model/path.js';
import { courierBeats } from '../../../src/geumbang/model/dispatch.js';
import { gt, GB_STRINGS, itemsLine, josa } from '../../../src/geumbang/strings.js';
import { gbTuning, hourMult } from '../../../src/geumbang/tuning.js';
import { GeumbangHost } from '../../../src/geumbang/host.js';
import { GEUMBANG_MODULE } from '../../../src/geumbang/index.js';
import { WORLD, L4, px2L4 } from '../../../src/data/world.js';
import { CELL } from '../../../src/systems/RoadNet.js';

const DAY = 600;
const sumO = (o) => { let n = 0; for (const k in o) n += o[k]; return n; };

/** a soak with the invariants checked every second; returns what it saw */
function soak(o = {}) {
  const E = makeEnv(Object.assign({ seed: 11 }, o));
  const m = E.model;
  m.open({ ceremonyS: 1 });
  const bad = [];
  let maxOpen = 0, maxPerAddr = 0, spurBoth = 0, ticks = 0;
  const vanStates = new Set();
  const watch = [];
  E.run((o.days || 2) * DAY, 1 / 30, (E, i) => {
    ticks++;
    if (i % 30 !== 0) return;
    // items: what entered = what is somewhere now (racks, 금방's share, orders, delivered, the dock …)
    const b = E.balance();
    if (!b.ok && bad.length < 5) bad.push('items ' + JSON.stringify(b) + ' T ' + E.T.toFixed(1));
    // coins: paid == delivered value
    if (E.out.coins !== m.settle.tot[2] && bad.length < 5) bad.push('coins ' + E.out.coins + ' vs ' + m.settle.tot[2]);
    maxOpen = Math.max(maxOpen, m.orders.waiting());
    const per = {};
    for (const q of m.orders.list) { per[q.aid] = (per[q.aid] || 0) + 1; const a = m.book.get(q.aid); if (!a || a.zone === 'none') bad.push('order to ' + q.aid); if (!(q.n > 0)) bad.push('empty order ' + q.id); }
    for (const k in per) maxPerAddr = Math.max(maxPerAddr, per[k]);
    // the spur: one van at a time on it (spurA / spurB / pivot / reverse or out before the join)
    const onSpur = m.disp.vans.filter((v) => ['spurA', 'spurB', 'pivot', 'reverse'].includes(v.st) || (v.st === 'out' && v.s < v.spurEnd)).length;
    if (onSpur > 1) spurBoth++;
    for (const v of m.disp.vans) vanStates.add(v.st);
    // the racks never below 0 and no item below the floor because of an order (inflow aside)
    for (const k of Object.keys(GB_TUNING.catalog)) if (E.depot.count(k) < 0) bad.push('negative ' + k);
  });
  for (const e of E.events) if (e.t === 'gb:watchdog') watch.push(e);
  return { E, m, bad, maxOpen, maxPerAddr, spurBoth, ticks, vanStates, watch };
}

test('determinism: the same seed replays the same events and the same slice', () => {
  const run = () => { const E = makeEnv({ seed: 5 }); E.model.open({ ceremonyS: 1 }); E.run(DAY * 1.2); return { ev: E.events.map((e) => e.t + ':' + (e.id || '') + ':' + (e.k || '') + ':' + Math.round(e.T * 30)).join('|'), slice: JSON.stringify(E.model.serialize()) }; };
  const a = run(), b = run();
  assert.equal(a.ev.length > 1000, true, 'a busy day');
  assert.equal(a.ev, b.ev);
  assert.equal(a.slice, b.slice);
  // a different seed gives a different day
  const E = makeEnv({ seed: 6 }); E.model.open({ ceremonyS: 1 }); E.run(DAY * 1.2);
  assert.notEqual(E.events.map((e) => e.t + ':' + (e.id || '')).join('|'), a.ev);
});

test('soak: items and coins conserved, caps hold, no dead ends (3 game days, 1 van)', () => {
  const S = soak({ days: 3 });
  assert.deepEqual(S.bad, []);
  assert.ok(S.maxOpen <= GB_TUNING.orders.maxOpen, 'open ' + S.maxOpen);
  assert.ok(S.maxPerAddr <= GB_TUNING.orders.perAddressOpen, 'per address ' + S.maxPerAddr);
  assert.equal(S.spurBoth, 0, 'two vans on the spur');
  assert.deepEqual(S.watch, [], 'watchdog fired');
  const st = S.m.state();
  assert.ok(st.tot[1] >= 40, 'delivered ' + st.tot[1]);
  // every order placed ends delivered, restocked or still open
  const placed = S.E.events.filter((e) => e.t === 'gb:order').length;
  const ended = S.E.events.filter((e) => e.t === 'gb:delivered' || (e.t === 'gb:restock' && e.id)).length;
  assert.equal(placed, ended + S.m.orders.list.length);
  // the review stars are 4 or 5
  for (const r of S.m.settle.rev) assert.ok(r[2] === 4 || r[2] === 5);
});

test('soak with all upgrades: 3 vans, packing 2, dawn, lockers, backhaul — still conserved, vans home every night', () => {
  const E = makeEnv({ seed: 21, inflowPerMin: 45, dock: 400 });
  const m = E.model;
  m.open({ ceremonyS: 1 });
  for (const k of ['pack', 'van2', 'van3', 'sled2', 'lockA', 'lockP', 'dawn', 'back']) assert.ok(m.upgrade(k), 'buy ' + k);
  assert.equal(m.disp.vans.length, 3);
  assert.equal(m.hub.pickers.length, 3);
  assert.equal(m.hub.packers.length, 2);
  const bad = [];
  let spurBoth = 0;
  E.run(DAY * 3, 1 / 30, (E, i) => {
    if (i % 30) return;
    const b = E.balance();         // (backhaul crates and the share counted in)
    if (!b.ok && bad.length < 3) bad.push(JSON.stringify(b));
    if (E.out.coins !== m.settle.tot[2]) bad.push('coins');
    const onSpur = m.disp.vans.filter((v) => ['spurA', 'spurB', 'pivot', 'reverse'].includes(v.st) || (v.st === 'out' && v.s < v.spurEnd)).length;
    if (onSpur > 1) spurBoth++;
  });
  assert.deepEqual(bad, []);
  assert.equal(spurBoth, 0);
  assert.equal(E.events.filter((e) => e.t === 'gb:watchdog').length, 0);
  assert.ok(E.events.some((e) => e.t === 'gb:delivered' && e.how === 'locker'), 'the apartment locker was used');
  assert.ok(E.events.some((e) => e.t === 'gb:backhaul'), 'a van brought crates back');
  // (광장 보관함 bought: the village parcels go into the plaza locker, the sleds are free for 금방 집하)
  assert.ok(E.events.some((e) => e.t === 'gb:locker' && e.kind === 'P'), 'the plaza locker took village parcels');
  assert.ok(E.events.some((e) => e.t === 'gb:lockerPickup'), 'residents emptied a locker');
  assert.ok(m.orders.list.length <= GB_TUNING.orders.maxOpen + 3 * GB_TUNING.van.cap);
  // dawn delivery: deliveries at night are doorstep-only (no bell)
  const night = E.events.filter((e) => e.t === 'gb:beat' && e.k === 'ring' && (hourOf(e.T) >= 21 || hourOf(e.T) < 8));
  assert.equal(night.length, 0, 'a bell rang at night');
  assert.ok(E.events.some((e) => e.t === 'gb:delivered' && (hourOf(e.T) >= 22 || hourOf(e.T) < 6)), 'dawn deliveries happen');
  // with every upgrade the crew keeps up with the town's demand (≈ 50 orders a day at the plan's everyDays 1.2):
  // nearly everything ordered by day is delivered the same day, the pile stays small
  const perDay = m.settle.days.slice(0, 2);
  for (const d of perDay) assert.ok(d[1] >= 0.85 * d[0] && d[1] >= 40, 'orders / deliveries a day ' + JSON.stringify(perDay));
});

test('without dawn delivery every van is in bay 1 at 03:00 and nothing rings 21–08', () => {
  const E = makeEnv({ seed: 3 });
  E.model.open({ ceremonyS: 1 });
  E.model.upgrade('van2');
  const at3 = [];
  E.run(DAY * 2, 1 / 30, (E) => { const h = hourOf(E.T); if (h >= 3 && h < 3.05) at3.push(E.model.disp.vans.map((v) => v.st).join(',')); });
  assert.ok(at3.length > 0);
  for (const s of at3) assert.match(s, /^(bay|break)(,(bay|break))*$/);
  assert.equal(E.events.filter((e) => e.t === 'gb:beat' && e.k === 'ring' && (hourOf(e.T) >= 21 || hourOf(e.T) < 8)).length, 0);
});

test('first order: 정 할머니 at 아파트 2동, 장작 4 · 빵 2, picked first, delivered within ~70 s', () => {
  const E = makeEnv({ seed: 9 });
  const m = E.model;
  m.open({ ceremonyS: 1 });
  E.run(1.2 + GB_TUNING.open.firstDelayS);
  const o = E.events.find((e) => e.t === 'gb:order');
  assert.ok(o && o.first);
  assert.equal(o.aid, 't_apt2');
  assert.equal(o.hid, 't_apt2:jeong');
  assert.deepEqual(o.items, { item_log: 4, item_bread: 2 });
  assert.equal(m.follow, o.id);
  E.run(90);
  const d = E.events.find((e) => e.t === 'gb:delivered' && e.id === o.id);
  assert.ok(d, 'delivered');
  assert.ok(d.T - o.T < 75, 'order -> door ' + (d.T - o.T).toFixed(1) + ' s');
  assert.equal(d.how, 'hand', 'grandma comes down to the entrance');
  assert.ok(E.events.some((e) => e.t === 'gb:firstDone'));
});

test('shops first: a short shelf pauses its item (resumes after 60 s); smoked meat needs a full shelf', () => {
  const shelf = { item_bread: 0.1, item_meat_cooked: 0.6, item_can: 0.9 };
  const E = makeEnv({ seed: 12, shelf });
  const m = E.model;
  m.open({ ceremonyS: 1 });
  E.run(DAY * 0.6);
  const orders = E.events.filter((e) => e.t === 'gb:order' && !e.first);
  assert.ok(orders.length > 15);
  assert.equal(orders.filter((e) => e.items.item_bread).length, 0, 'bread ordered while its shelf was short');
  assert.equal(orders.filter((e) => e.items.item_meat_cooked).length, 0, 'smoked meat ordered under 75 %');
  assert.ok(m.guard.paused('item_bread') && m.guard.paused('item_meat_cooked') && !m.guard.paused('item_can'));
  // the shelves recover: bread after resumeS, meat after meatForS at ≥ 75 %
  shelf.item_bread = 0.8; shelf.item_meat_cooked = 0.9;
  E.run(30);
  assert.ok(m.guard.paused('item_bread'), 'resumed too soon');
  E.run(40);
  assert.ok(!m.guard.paused('item_bread') && !m.guard.paused('item_meat_cooked'));
  // items no shop sells (raw) are never paused; the floor of 4 stays on the racks
  for (const k of ['item_log', 'item_wheat', 'item_fish_raw', 'item_meat_raw']) assert.ok(!m.guard.paused(k));
});

test('racks floor and unfillable orders: low stock never orders below keepFloor; an empty depot orders nothing', () => {
  // (the floor rule on its own: 금방's share off — with it, the share is drawn on the racks and sells to the last)
  const E = makeEnv({ seed: 4, fill: 0.04, inflowPerMin: 0, tune: Object.assign({}, GB_TUNING, { share: { per: 0, max: 0 } }) });
  const m = E.model;
  m.open({ ceremonyS: 1 });
  const floor = GB_TUNING.orders.keepFloor;
  const start = {};
  for (const k of Object.keys(GB_TUNING.catalog)) start[k] = E.depot.count(k);
  E.run(DAY * 0.5, 1 / 30, () => {
    for (const k of Object.keys(GB_TUNING.catalog)) if (start[k] >= floor && E.depot.count(k) < floor) throw new Error(k + ' below the floor');
  });
  for (const e of E.events.filter((q) => q.t === 'gb:order')) assert.ok(sumO(e.items) >= 1);
  const E2 = makeEnv({ seed: 4, fill: 0, inflowPerMin: 0 });
  E2.model.open({ ceremonyS: 1 });
  E2.run(DAY * 0.3);
  assert.equal(E2.events.filter((e) => e.t === 'gb:order').length, 0);
});

test('the 특가 button doubles an item for a game day; 쉬기 stops it', () => {
  const E = makeEnv({ seed: 15, fill: 0.7 });
  const m = E.model;
  m.open({ ceremonyS: 1 });
  const hh = m.book.households()[3];
  const w0 = m.orders.weight('item_fish_raw', hh, m.T, m.ctx());
  m.deal('item_fish_raw');
  assert.ok(Math.abs(m.orders.weight('item_fish_raw', hh, m.T, m.ctx()) - w0 * GB_TUNING.orders.dealMult) < 1e-9);
  E.run(DAY + 1);
  const share = (EE) => { const os = EE.events.filter((e) => e.t === 'gb:order' && !e.first); return os.filter((e) => e.items.item_fish_raw).length / os.length; };
  assert.ok(!m.orders.dealOn('item_fish_raw', m.T), 'the deal lasts one game day');
  const E2 = makeEnv({ seed: 15, fill: 0.7 });
  E2.model.open({ ceremonyS: 1 });
  E2.run(DAY + 1);
  assert.ok(share(E) > share(E2), 'deal ' + share(E).toFixed(2) + ' vs ' + share(E2).toFixed(2));
  m.sell('item_log', false);
  const n0 = E.events.length;
  E.run(DAY * 0.3);
  assert.equal(E.events.slice(n0).filter((e) => e.t === 'gb:order' && e.items.item_log).length, 0);
});

test('failure: an address that disappears sends its orders back to the racks (no coins)', () => {
  const E = makeEnv({ seed: 8 });
  const m = E.model;
  m.open({ ceremonyS: 1 });
  E.run(DAY * 0.25);
  const target = m.orders.list.find((o) => o.st !== 'gone' && !o.van && o.aid !== 't_apt2');
  assert.ok(target, 'an open order');
  const coins0 = E.out.coins, racks0 = E.depot.stock.all();
  // every open order of that address that is not on a van goes back (an address can have two)
  const back = m.orders.list.filter((o) => o.aid === target.aid && !o.van && o.st !== 'gone').reduce((n, o) => n + o.n, 0);
  const entries = E.entries.filter((e) => e.aid !== target.aid);
  const goneT = E.T;
  m.setWorld(entries, villageGraph());
  assert.equal(target.st, 'back');
  E.inflow = 0;
  E.run(1 / 30);
  assert.ok(E.events.some((e) => e.t === 'gb:restock' && e.id === target.id));
  assert.equal(E.depot.stock.all(), racks0 + back);
  assert.equal(E.out.coins, coins0);
  E.run(DAY * 0.3);
  assert.ok(!E.events.some((e) => e.t === 'gb:order' && e.aid === target.aid && e.T > goneT), 'ordered from a gone address');
});

test('failure: walkers blocking the lane stop the van; after 20 s it skips, then restocks; a horn once per 6 s', () => {
  // a wall of walkers on 중앙로 north of the apartments' curb, always "on screen"
  const block = [];
  for (let j = -15; j <= -4; j += 0.5) for (const i of [31, 33]) { const [x, y] = L4(i, j); block.push({ x, y }); }
  const E = makeEnv({ seed: 13, live: true, walkers: (x, y) => block.filter((w) => Math.abs(w.x - x) < 600 && Math.abs(w.y - y) < 400) });
  E.out.live = true;
  const m = E.model;
  m.open({ ceremonyS: 1 });
  E.run(DAY * 0.8);
  const skips = E.events.filter((e) => e.t === 'gb:skip');
  const horns = E.events.filter((e) => e.t === 'gb:horn');
  assert.ok(skips.length >= 1, 'a stop was skipped');
  assert.ok(horns.length >= 1, 'a horn');
  for (let k = 1; k < horns.length; k++) assert.ok(horns[k].T - horns[k - 1].T >= GB_TUNING.van.honkAfterS - 1e-6, 'horns too close');
  assert.ok(E.events.some((e) => e.t === 'gb:restock' && e.why === 'blocked') || skips.some((e) => e.n === 1), 'restocked after the second skip');
  // conservation still holds
  const b = E.balance();
  assert.equal(b.in, b.now, JSON.stringify(b));
});

test('failure: the sleigh on the shared spur holds vans at the bay and before the jog; the watchdog brings a stuck van home', () => {
  let busy = true;
  const E = makeEnv({ seed: 14, sleighBusy: () => busy });
  const m = E.model;
  m.open({ ceremonyS: 1 });
  E.run(40);
  assert.equal(m.disp.vans[0].st, 'load', 'the van waits while the sleigh is on the apron');
  busy = false;
  E.run(5);
  assert.equal(m.disp.vans[0].st, 'out');
  // a van that cannot move (a lane with a walker that never leaves, off the skip rule: on the way home)
  busy = true;
  E.run(DAY * 0.4);
  // (the sleigh shares ave_s · bank_st · the apron: the van waits before the jog, or at the corner if it came later)
  const waits = E.events.filter((e) => e.t === 'gb:van' && e.st === 'wait' && (e.gate === 'apron' || e.gate === 'sleigh'));
  assert.ok(waits.length >= 1, 'waited for the sleigh');
  busy = false;
  E.run(60);
  // the watchdog: freeze a van mid-tour by teleporting its path end far away and blocking it
  const v = m.disp.vans[0];
  E.run(5);
  v.st = 'out'; v.path = m.kit.out(null); v.s = 1; v.v = 0;
  const walkers = [{ x: v.x + 70, y: v.y + 35 }];
  E.model.env.walkers = () => walkers.map((w) => ({ x: v.x + 70, y: v.y + 35 }));
  E.model._dctx = null; E.out.live = true;
  E.run(GB_TUNING.van.watchdogS * 3.2);
  assert.ok(E.events.some((e) => e.t === 'gb:watchdog' || e.t === 'gb:skip'), 'stuck van handled');
  E.model.env.walkers = null; E.model._dctx = null;
  E.run(DAY * 0.5);
  const b = E.balance();
  assert.equal(b.in, b.now, JSON.stringify(b));
});

test('failure: racks over their cap after a restock keep what fits; the rest goes to the dock surplus', () => {
  const E = makeEnv({ seed: 16, fill: 0.6 });
  const m = E.model;
  m.open({ ceremonyS: 1 });
  E.run(DAY * 0.2);
  const o = m.orders.list.find((q) => q.st !== 'gone');
  assert.ok(o);
  // fill the racks to the brim, then restock
  for (const k of Object.keys(o.got)) E.depot.stock.add(k, E.depot.stock.room(k));
  m.restock(o, 'test');
  assert.equal(E.out.surplus, o.n, 'everything refused went to the dock');
  const c = E.count();
  assert.ok(c.refused >= o.n);
});

test('save mid-tour: no item lost or doubled, gone parcels come back as ready, vans restart from bay 1', () => {
  const E = makeEnv({ seed: 17 });
  const m = E.model;
  m.open({ ceremonyS: 1 });
  // run until a van is out with parcels
  let guard = 0;
  while (!(m.disp.vans[0].st === 'leg' || m.disp.vans[0].st === 'curb') && guard++ < 6000) E.run(0.1);
  assert.ok(m.disp.vans[0].load.length > 0, 'a van out with parcels');
  const s = JSON.parse(JSON.stringify(m.serialize()));
  assert.ok(sliceBytes(s) <= GEUMBANG_SLICE.cap);
  const racks = E.depot.stock.all();
  const open = m.orders.list.reduce((n, o) => n + o.n, 0);
  // reload on the same depot
  const E2 = makeEnv({ seed: 17, saved: sanitizeGeumbang(s), depot: E.depot, T: E.T });
  const m2 = E2.model;
  const open2 = m2.orders.list.reduce((n, o) => n + o.n, 0) + (s.back ? sumO(parseGot(s.back)) : 0);
  assert.equal(open2, open, 'orders items');
  assert.equal(E.depot.stock.all(), racks + (s.back ? sumO(parseGot(s.back)) : 0));
  for (const o of m2.orders.list) assert.ok(['pick', 'pack', 'ready'].includes(o.st));
  for (const v of m2.disp.vans) assert.equal(v.st, 'bay');
  assert.equal(m2.st, 2);
  // the reloaded day runs on and delivers them
  E2.run(DAY * 0.5);
  const ids = new Set(m.orders.list.map((o) => o.id));
  const del = E2.events.filter((e) => e.t === 'gb:delivered' && ids.has(e.id));
  assert.ok(del.length >= 1);
  assert.equal(new Set(del.map((e) => e.id)).size, del.length, 'delivered twice');
});

test('save: 300 fuzzed slices never throw and stay ≤ 1,400 B; round trip; old v4.2 saves (no slice) start clean', () => {
  let s = 1;
  const r = () => { s = (s * 1103515245 + 12345) >>> 0; return s / 4294967296; };
  const junk = () => { const k = r(); return k < 0.1 ? null : k < 0.2 ? 'x'.repeat(Math.floor(r() * 40)) : k < 0.3 ? -1e9 : k < 0.4 ? [r(), 'a'] : k < 0.5 ? { a: 1 } : k < 0.6 ? 1e12 : k < 0.7 ? NaN : Math.floor(r() * 30); };
  const items = ['bread', 'can', 'log', 'meat_cooked', 'fish_cooked', 'zzz', 'ore', 'pickaxe'];
  for (let n = 0; n < 300; n++) {
    const raw = { v: junk(), st: junk(), lv: r() < 0.5 ? { van: junk(), pack: junk(), sled: junk() } : junk(), seq: junk(), seed: junk(), day: junk(), ord: [], door: [], staff: [], days: [], tot: junk(), rev: [], seen: junk(), back: r() < 0.3 ? 'bread5,zzz3,log9999' : junk(),
      res: r() < 0.3 ? 'bread9,can99,fish_raw7,ore3' : junk(), dock: r() < 0.3 ? 'ore999,ingot40,fish_big3,zzz9' : junk(), lk: r() < 0.3 ? [junk(), junk()] : junk(), pp: junk(), pi: r() < 0.3 ? 'plank19,ingot9' : junk(), nx: junk(), cl: r() < 0.3 ? [junk(), junk()] : junk() };
    for (let k = 0; k < 40 * r(); k++) raw.ord.push(r() < 0.8 ? ['g' + Math.floor(r() * 1e6), r() < 0.8 ? 'a:t_apt' + Math.floor(r() * 5) : junk(), ['rc', 'pc', 'kc', 'rs', 'rcf', 'zz'][Math.floor(r() * 6)], items.slice(0, 1 + Math.floor(r() * 4)).map((i) => i + Math.floor(r() * 9)).join(','), Math.floor(r() * 9999)] : junk());
    for (let k = 0; k < 30 * r(); k++) raw.door.push(r() < 0.8 ? ['l:lotH' + Math.floor(r() * 6), ['s', 'm', 'l', 'x'][Math.floor(r() * 4)], r() * 30] : junk());
    for (let k = 0; k < 20 * r(); k++) { raw.days.push([junk(), junk(), junk()]); raw.rev.push([junk(), 't_apt2', junk()]); raw.staff.push(junk()); }
    let out;
    assert.doesNotThrow(() => { out = sanitizeGeumbang(raw); });
    if (!out) continue;
    assert.ok(sliceBytes(out) <= GEUMBANG_SLICE.cap, 'bytes ' + sliceBytes(out));
    assert.ok(out.ord.length <= 24 && out.door.length <= 16 && out.staff.length <= 12 && out.days.length <= 7 && out.rev.length <= 12);
    assert.deepEqual(sanitizeGeumbang(out), out, 'idempotent');
  }
  for (const bad of [null, undefined, 3, 'x', [], { ord: 'x' }]) assert.doesNotThrow(() => sanitizeGeumbang(bad));
  // a full slice at the cap folds the youngest orders' items into `back` (nothing lost)
  const big = { v: 1, st: 2, lv: { van: 3 }, ord: [], days: [], rev: [], door: [], staff: [] };
  for (let k = 0; k < 24; k++) big.ord.push(['g' + (100000 + k), 'a:t_apt' + (1 + (k % 4)), 'rc', 'meat_cooked2,fish_cooked2,pickaxe1', 123]);
  const fit = sanitizeGeumbang(big);
  assert.ok(sliceBytes(fit) <= 1400);
  const kept = fit.ord.reduce((n, r) => n + sumO(parseGot(r[3])), 0) + sumO(parseGot(fit.back || ''));
  assert.equal(kept, 24 * 5);
  // round trip through a real model
  const E = makeEnv({ seed: 19 });
  E.model.open({ ceremonyS: 1 });
  E.run(DAY * 0.7);
  const a = E.model.serialize();
  const E2 = makeEnv({ seed: 19, saved: sanitizeGeumbang(JSON.parse(JSON.stringify(a))), depot: makeDepot(0.6, 7), T: E.T });
  const b = E2.model.serialize();
  // (`back` — rows beyond the slice's 24 — is a one-shot fold: its items are on the racks after the load)
  // (a slice at its cap drops days / reviews first: compare the state that must survive — orders, 금방's share, totals)
  const strip = (x) => { const y = { ...x, ord: x.ord.map((r) => r.slice(0, 4)) }; delete y.back; delete y.days; delete y.rev; delete y.door; delete y.staff; return y; };
  assert.deepEqual(strip(b), strip(a));
  assert.equal(b.back, undefined);
  // a v4.2 save has no slice: the module starts at the letter gate
  const E3 = makeEnv({ seed: 19, saved: null });
  assert.equal(E3.model.st, 0);
});

test('save slice -> v8 logistics home rows (G3)', () => {
  const rows = toV8Rows({ ord: [['g12', 'a:t_apt2', 'rc', 'bread3,log2', 4], ['g13', 'l:lotH3', 'kc', 'can1', 9]] });
  assert.deepEqual(rows[0], ['g12', 'home:t_apt2', 'hcr', { bread: 3, log: 2 }, {}]);
  assert.match(rows[1][2], /^[syh][vwc][pkrg]$/);
});

test('gate: the letter after one game day, or racks ≥ 60 % for 120 s; never twice', () => {
  const E = makeEnv({ seed: 2, fill: 0.3, inflowPerMin: 0 });
  E.run(DAY - 1);
  assert.ok(!E.events.some((e) => e.t === 'gb:letter'));
  E.run(2);
  assert.equal(E.events.filter((e) => e.t === 'gb:letter').length, 1);
  E.run(DAY);
  assert.equal(E.events.filter((e) => e.t === 'gb:letter').length, 1);
  const F = makeEnv({ seed: 2, fill: 0.7, inflowPerMin: 0 });
  F.run(119);
  assert.ok(!F.events.some((e) => e.t === 'gb:letter'));
  F.run(2);
  assert.ok(F.events.some((e) => e.t === 'gb:letter'));
  // nothing is ordered before the opening
  assert.ok(!F.events.some((e) => e.t === 'gb:order'));
  // the gate progress survives a save
  const G = makeEnv({ seed: 2, fill: 0.3, inflowPerMin: 0 });
  G.run(300);
  const g = G.model.serialize();
  assert.ok(g.g >= 299);
  const H = makeEnv({ seed: 2, fill: 0.3, inflowPerMin: 0, saved: sanitizeGeumbang(g) });
  H.run(302);
  assert.ok(H.events.some((e) => e.t === 'gb:letter'));
});

test('upgrades are offered one at a time by measured need, never spend on their own', () => {
  const E = makeEnv({ seed: 22, inflowPerMin: 40, spend: true });
  const m = E.model;
  m.open({ ceremonyS: 1 });
  E.run(DAY * 2.5);
  const offers = E.events.filter((e) => e.t === 'gb:offer');
  assert.ok(offers.length >= 1, 'an offer');
  assert.equal(E.out.spent, 0, 'spent without the player');
  assert.equal(m.up.lv.van, 1);
  // offers come one at a time: the second only after the first is bought
  const first = offers[0].kind;
  assert.ok(['pack', 'van2'].includes(first), first);
  assert.ok(m.upgrade(first));
  assert.ok(E.out.spent > 0);
  assert.ok(!m.upgrade(first), 'bought twice');
  assert.equal(m.upgrade('van3') && m.up.lv.van < 2, false);
  // a refused purchase changes nothing
  const F = makeEnv({ seed: 22, spend: false });
  F.model.open({ ceremonyS: 1 });
  assert.equal(F.model.upgrade('van2'), false);
  assert.equal(F.model.up.lv.van, 1);
});

test('throughput: a van moves ≥ 13 items per working minute with a full pile (fake inflow)', () => {
  const E = makeEnv({ seed: 31, fill: 0.8, inflowPerMin: 60 });
  const m = E.model;
  m.open({ ceremonyS: 1 });
  m.upgrade('pack');
  let active = 0, units0 = null;
  E.run(DAY * 2, 1 / 30, (E) => {
    const v = m.disp.vans[0];
    const h = hourOf(E.T);
    if (h >= 8 && h < 20 && v.st !== 'bay' && v.st !== 'break') active += 1 / 30;
  });
  const units = m.settle.tot[3];
  const perMin = units / (active / 60);
  assert.ok(perMin >= 13, 'items per active van minute ' + perMin.toFixed(1));
  void units0;
});

test('routes: every van address reachable with a short walk; headings in the 8 drawn; no rail crossing; spur on paint', () => {
  const E = makeEnv({ seed: 1 });
  const m = E.model;
  const kit = m.kit;
  assert.ok(kit.ok);
  const van = m.book.list().filter((a) => a.zone === 'van');
  assert.ok(van.length >= 25, 'van addresses ' + van.length);
  for (const a of van) {
    assert.ok(a.walk.len <= GB_TUNING.van.walkMaxM, a.aid + ' walk ' + a.walk.len);
    const out = kit.out({ lane: a.curb.lane, s: a.curb.s });
    assert.ok(out && out.len > 0, a.aid + ' out');
    const home = kit.leg({ lane: a.curb.lane, s: a.curb.s }, kit.backPos());
    assert.ok(home, a.aid + ' home');
    // all addresses are on the town side of the rail (j < 0)
    assert.ok(px2L4(a.door.x, a.door.y).j < 0, a.aid + ' across the rail');
    for (const p of out.pts.concat(home.pts)) assert.ok(px2L4(p.x, p.y).j < -0.8, a.aid + ' route crosses the rail');
  }
  // t_station is excluded
  assert.equal(m.book.get('t_station'), null);
  // headings along every path are one of the 8 drawn
  const H = new Set(['SE', 'NE', 'SW', 'NW', 'E', 'S', 'W', 'N']);
  for (const a of van) { const p = kit.out({ lane: a.curb.lane, s: a.curb.s }); for (let s = 0; s < p.len; s += 0.5) { const q = p.at(s, {}); assert.ok(H.has(dir8(q.hx, q.hy))); } }
  // the spur runs on painted cells: v4.2 street rects (+ the bay-1 apron extension j −29.6 and the jog cells, G-P9)
  const S = WORLD.v42.streets;
  const onPaint = (i, j) => {
    for (const s of S) {
      if (s.axis === 'path') continue;
      const I = s.paintI || (s.axis === 'y' && s.paint ? s.paint : s.i), J = s.axis === 'x' && s.paint ? s.paint : s.j;
      if (i >= I[0] - 0.6 && i <= I[1] + 0.6 && j >= J[0] - 0.6 && j <= J[1] + 0.6) return true;
      if (s.apron && i >= s.apron[0] - 0.6 && i <= s.apron[1] + 0.6 && j >= Math.min(s.apron[2], GB_LAYOUT.lgxDockTo) - 0.6 && j <= s.apron[3] + 0.6) return true;
    }
    return (i >= 30 - 0.6 && i <= 34 + 0.6 && j >= -19.6 && j <= -16.5);     // the jog onto 중앙로 (painted by G-P9)
  };
  const sp = kit.out(null);
  for (let s = 0; s <= sp.len; s += 0.4) { const q = sp.at(s, {}); const l = px2L4(q.x, q.y); assert.ok(onPaint(l.i, l.j), 'spur off paint at ' + l.i.toFixed(2) + ',' + l.j.toFixed(2)); }
  // bay 1: the van's front reaches y ≈ 3402 (apron gate raised to ≤ 3420 for bay 1)
  const [bx, by] = L4(GB_LAYOUT.bayPt[0], GB_LAYOUT.bayPt[1]);
  assert.ok(by + 71 <= 3420, 'bay 1 footprint ' + (by + 71));
  void bx;
});

test('the courier timeline: rounds of ≤ 3 parcels, quiet hours drop at the door without the bell', () => {
  const C = GB_TUNING.courier;
  const walk = (len) => ({ pts: [{ x: 0, y: 0 }, { x: len * 64, y: 0 }], len });
  const o = (id) => ({ id, size: 's', st: 'gone' });
  const visits = [{ aid: 'a', kind: 'house', walk: walk(4), orders: [o('1')], home: true, quiet: false }, { aid: 'b', kind: 'apt', walk: walk(8), orders: [o('2'), o('3')], home: true, quiet: false, meet: false }, { aid: 'c', kind: 'house', walk: walk(6), orders: [o('4')], home: false, quiet: false }];
  const tl = courierBeats(visits, C, false);
  const ks = tl.beats.map((b) => b.k);
  assert.equal(ks.filter((k) => k === 'take').length, 2, 'two rounds');
  assert.ok(ks.includes('hand') && ks.includes('inside') && ks.includes('drop'));
  const q = courierBeats(visits.map((v) => Object.assign({}, v, { quiet: true })), C, true);
  assert.ok(!q.beats.some((b) => b.k === 'ring'));
  assert.ok(q.T > tl.T * 0.7);
});

test('the v8 Order shape (parity with src/city/logistics/model/orders.js)', () => {
  const v8 = new V8Order({ id: 'o1', to: 'home:t_apt2', kind: 'home', mode: 'centre', want: { item_bread: 2 }, got: { item_bread: 2 } });
  const gb = new Order({ id: 'g1', aid: 't_apt2', want: { item_bread: 2 }, got: { item_bread: 2 } });
  for (const k of ['id', 'to', 'kind', 'mode', 'want', 'got', 'st']) assert.ok(k in gb, 'missing ' + k);
  assert.equal(gb.to, v8.to);
  assert.equal(gb.kind, v8.kind);
  assert.equal(gb.mode, v8.mode);
  assert.equal(gb.st, v8.st);
  assert.deepEqual(gb.got, v8.got);
  assert.equal(sizeOf({ item_bread: 2 }), 's');
  assert.equal(sizeOf({ item_bread: 5 }), 'm');
  assert.equal(sizeOf({ item_bread: 1, item_axe: 1 }), 'l');
  assert.equal(catOf('item_log'), 'materials');
  assert.equal(slot('t_apt2'), 'a:t_apt2'); assert.equal(slot('lotH3'), 'l:lotH3'); assert.equal(slot('vh1'), 'h:vh1');
});

test('strings: ko + en for every key, slots filled, no real company or service name', () => {
  const ko = GB_STRINGS.ko, en = GB_STRINGS.en;
  for (const k in ko) assert.ok(k in en, 'en missing ' + k);
  for (const k in en) assert.ok(k in ko, 'ko missing ' + k);
  assert.ok(Object.keys(ko).length >= 70);
  assert.equal(gt('gb_toast_order', { who: '민지네', items: '빵 3' }), '띵동! 새 주문 · 민지네 · 빵 3');
  assert.equal(gt('gb_up_done', { name: '금방 밴 2' }), '금방 밴 2를 들였어요!');
  assert.equal(josa('빵', '을/를'), '빵을');
  assert.equal(itemsLine({ item_bread: 3, item_log: 4, item_can: 1 }), '장작 4 · 빵 3 외 1');
  const all = JSON.stringify(GB_STRINGS);
  for (const bad of ['쿠팡', '배민', '배달의민족', '컬리', '요기요', '쓱', 'SSG', 'G마켓', '11번가', '네이버', '우체국', 'CJ', '한진', '롯데택배', 'Amazon', 'DHL', 'FedEx', 'UPS', '로켓', '샛별배송', '스마일배송', '오늘도착', 'Coupang', 'Kurly']) assert.ok(!all.includes(bad), 'brand word ' + bad);
});

test('tuning: BALANCE.v43.gb merges over the defaults; the hour curve', () => {
  const t = gbTuning({ v43: { gb: { van: { cap: 10 }, pay: { priceRate: 0.7 } } } });
  assert.equal(t.van.cap, 10);
  assert.equal(t.van.maxStops, 6);
  assert.equal(t.pay.priceRate, 0.7);
  assert.equal(t.pay.promiseS, 150);
  assert.equal(hourMult(GB_TUNING, 8), 1.2);
  assert.equal(hourMult(GB_TUNING, 19), 1.6);
  assert.equal(hourMult(GB_TUNING, 23), 0.8);
  assert.equal(hourMult(GB_TUNING, 1), 0.8);
  assert.equal(hourMult(GB_TUNING, 4), 0.2);
  assert.equal(hourMult(GB_TUNING, 15), 0.9);
  assert.equal(dir8(0.8944, 0.4472), 'SE'); assert.equal(dir8(1, 0), 'E'); assert.equal(dir8(0, 1), 'S'); assert.equal(dir8(0, -1), 'N'); assert.equal(dir8(-1, 0), 'W');
  assert.equal(axisDir(-0.8944, 0.4472), 'SW');
});

test('perf: ≤ 0.02 ms per 30 Hz tick on average (busy evening, 3 vans); AddressBook rebuild ≤ 25 ms', () => {
  const E = makeEnv({ seed: 41, inflowPerMin: 50 });
  const m = E.model;
  m.open({ ceremonyS: 1 });
  for (const k of ['pack', 'van2', 'van3']) m.upgrade(k);
  E.run(DAY * 1.5);
  E.ms.length = 0;
  E.run(DAY * 0.5);
  const avg = E.ms.reduce((a, b) => a + b, 0) / E.ms.length;
  assert.ok(avg <= 0.02, 'avg ms ' + avg.toFixed(4));
  const a = performance.now();
  for (let k = 0; k < 5; k++) m.setWorld(E.entries, villageGraph());
  const per = (performance.now() - a) / 5;
  assert.ok(per <= 25, 'rebuild ' + per.toFixed(1) + ' ms');
  console.log('# perf avg ms/tick ' + avg.toFixed(4) + ' · rebuild ' + per.toFixed(2) + ' ms');
});

test('host headless: api, toasts by the rules, events out, serialize', () => {
  const E = makeEnv({ seed: 50 });
  const toasts = [], banners = [], emits = [];
  let T = 600 * 3 + 25 * 9;
  const D = E.depot;
  const ports = {
    clock: { T: () => T, hour: () => hourOf(T) },
    lang: () => 'ko',
    roads: { net: () => ROADS.rn, village: () => villageGraph() },
    town: { homes: () => E.entries, home: () => true },
    depot: { count: D.count, pick: (i) => D.pick(i), restock: (i) => D.restock(i), level: D.level, fill: D.fill },
    coins: { till: () => {}, spend: () => true },
    ui: { toast: (m) => toasts.push(m), banner: (a, b) => banners.push(a + ' / ' + b) },
    emit: (e) => emits.push(e.t),
  };
  const host = new GeumbangHost(ports, null, { seed: 50 });
  assert.equal(host.api.isOpen(), false);
  host.api.open({ ceremonyS: 1 });
  for (let k = 0; k < 30 * 200; k++) { T += 1 / 30; host.update(1 / 30); }
  assert.ok(host.api.isOpen());
  assert.ok(banners[0].startsWith('금방 물류센터가 문을 열었어요!'));
  assert.ok(toasts.some((t) => t.startsWith('띵동! 새 주문 · 솔방울 아파트 2동 정 할머니네')), toasts[0]);
  assert.ok(toasts.some((t) => t.startsWith('첫 배달 완료!')));
  assert.ok(emits.includes('gb:open') && emits.includes('gb:delivered'));
  assert.ok(host.api.orders().length >= 0 && host.api.vans().length === 1);
  assert.ok(host.api.address('t_apt2').zone === 'van');
  assert.ok(JSON.stringify(host.serialize()).length <= 1400);
  assert.equal(GEUMBANG_MODULE.saveKey, 'geumbang');
  assert.equal(GEUMBANG_MODULE.gate({ v42: { depot: { built: false } } }), false);
  assert.equal(GEUMBANG_MODULE.gate({ v42: { depot: { built: true } } }), true);
});

// ---- G-P5: the game's LOCAL copy of the keep-rules (src/core/Save.js keepGeumbang) must keep exactly what
// sanitizeGeumbang keeps (the same check save_v42.mjs makes for keepBank / keepLogistics). Skipped until the patch lands.
test('G-P5 parity: Save.js keepGeumbang agrees with sanitizeGeumbang (skipped until the patch)', async (t) => {
  const S = await import('../../../src/core/Save.js');
  if (typeof S.keepGeumbang !== 'function') { t.skip('src/core/Save.js has no keepGeumbang yet (patch G-P5)'); return; }
  let s = 7;
  const r = () => { s = (s * 1103515245 + 12345) >>> 0; return s / 4294967296; };
  const junk = () => { const k = r(); return k < 0.15 ? null : k < 0.3 ? 'x' : k < 0.45 ? -5 : k < 0.6 ? 1e12 : Math.floor(r() * 30); };
  for (let n = 0; n < 200; n++) {
    const raw = { v: 1, st: junk(), lv: { van: junk(), pack: junk(), sled: junk(), dawn: junk() }, seq: junk(), seed: junk(), day: junk(), ord: [], door: [], staff: [], days: [], tot: [junk(), junk(), junk(), junk()], rev: [], seen: junk(), g: junk(), up: r() < 0.3 ? ['pack,van2,zzz', junk(), junk()] : undefined, back: r() < 0.3 ? 'bread5,zzz3' : undefined,
      res: r() < 0.4 ? 'bread' + Math.floor(r() * 9) + ',fish_raw3,ore2' : junk(), dock: r() < 0.4 ? 'ore' + Math.floor(r() * 900) + ',ingot4,zzz1' : junk(), lk: r() < 0.4 ? [junk(), junk()] : undefined,
      pp: r() < 0.4 ? junk() : undefined, pi: r() < 0.4 ? 'plank' + Math.floor(r() * 30) + ',ingot2,bread1' : undefined, nx: r() < 0.4 ? junk() : undefined, cl: r() < 0.4 ? [junk(), junk()] : undefined };
    for (let k = 0; k < 30 * r(); k++) raw.ord.push(['g' + Math.floor(r() * 1e6), 'a:t_apt' + Math.floor(r() * 5), ['rc', 'pc', 'kcf', 'rst'][Math.floor(r() * 4)], 'bread' + Math.floor(r() * 9) + ',log2', Math.floor(r() * 999)]);
    for (let k = 0; k < 20 * r(); k++) raw.door.push(['l:lotH' + Math.floor(r() * 6), ['s', 'm', 'l'][Math.floor(r() * 3)], r() * 30]);
    assert.deepEqual(S.keepGeumbang(JSON.parse(JSON.stringify(raw))), sanitizeGeumbang(JSON.parse(JSON.stringify(raw))));
  }
  for (const bad of [null, 3, 'x', [], {}]) assert.deepEqual(S.keepGeumbang(bad), sanitizeGeumbang(bad));
});
