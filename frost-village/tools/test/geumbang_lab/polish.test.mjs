// 금방 polish regression tests — one per finding of docs/build_reports/geumbang_module_critique.md that reproduced:
//   nice -n 15 node --test tools/test/geumbang_lab/polish.test.mjs
// C1 (금방's own share by day with the real Depot.js buyers; 금방 집하 drains the real village piles), H1 (who is home:
// TownSim's placeObj), H2 (정 할머니's first order from empty racks), H3 (the AddressBook follows the town), H4 (the pad's
// partial payment is saved), H5 (개썰매 2, 광장 보관함, 아파트 보관함 that empties), H6 (the follow caption ends), M1 (road
// change mid-tour), M2 (crates on their way to the dock are saved), M4 (vans brake for the sleigh; curbs off its lane),
// M5 (no village orders without a stand), M7 (the kids' joke in two bubbles), L3 / L4 (save details).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeEnv, hourOf, ROADS, GB_TUNING } from './fake_env.mjs';
import { villageGraph } from './lab_world.js';
import { Depot } from '../../../src/systems/depot/Depot.js';
import { WORLD, L4 } from '../../../src/data/world.js';
import { sanitizeGeumbang, sliceBytes } from '../../../src/geumbang/save.js';
import { parseGot } from '../../../src/geumbang/model/GbModel.js';
import { homeSets, insideOf, townSignature, villageGraphOf, keepRight } from '../../../src/geumbang/townRead.js';
import { GeumbangHost } from '../../../src/geumbang/host.js';
import { Follow } from '../../../src/geumbang/view/Follow.js';
import { VanDriver } from '../../../src/geumbang/view/VanDriver.js';
import { L } from '../../../src/geumbang/layout.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DAY = 600;
const sumO = (o) => { let n = 0; for (const k in o || {}) n += o[k]; return n; };
const T7 = 600 * 3 + 25 * 7;

/** the real v4.2 depot (racks, raw share, the walk-in buyers) behind the fake env's depot port */
function realDepot() {
  const M = new Depot(null);
  const D = {
    model: M, stock: M.stock, picked: 0, restocked: 0, refused: 0, inflow: 0, initial: 0, sold: 0,
    count: (k) => M.stock.count(k), level: (c) => M.stock.level(c),
    pick(items) { const got = {}; for (const k in items) { const q = M.stock.take(k, items[k]); if (q > 0) { got[k] = q; D.picked += q; } } return got; },
    restock(items) { const ref = {}; for (const k in items) { const q = Math.min(M.room(k), items[k]); if (q > 0) M.stock.add(k, q); D.restocked += q; if (items[k] - q > 0) { ref[k] = items[k] - q; D.refused += items[k] - q; } } return ref; },
    bring() {}, fill: () => M.total() / M.capTotal(),
  };
  return D;
}
const MIX = [['item_fish_raw', 12], ['item_meat_raw', 10], ['item_ore', 8], ['item_bread', 8], ['item_can', 5], ['item_log', 6], ['item_fish_cooked', 6], ['item_plank', 5]];
function sleighLoad(D) { const load = MIX.map(([ty, n]) => ({ ty, n })); const got = D.model.take(load); D.inflow += got.reduce((a, q) => a + q.n, 0); }

// ------------------------------------------------------------------------------------------------ C1
test('C1: with the real walk-in buyers emptying the racks, 금방 keeps its own share and takes orders by day', () => {
  const D = realDepot();
  const E = makeEnv({ seed: 31, depot: D, inflowPerMin: 0, T: T7, buyers: true });
  const m = E.model;
  m.open({ ceremonyS: 1 });
  let t = 0, emptySamples = 0, samples = 0;
  E.run(DAY, 1 / 20, (E) => { t += 1 / 20; if (t >= 75) { t = 0; sleighLoad(D); } const h = hourOf(E.T); if (h >= 9 && h < 19) { samples++; if (D.model.total() < 5) emptySamples++; } });
  const byDay = E.events.filter((e) => e.t === 'gb:order' && !e.first && hourOf(e.T) >= 7 && hourOf(e.T) < 20);
  assert.ok(D.sold > 100, 'the buyers sold ' + D.sold);
  assert.ok(emptySamples / samples > 0.5, 'the racks are mostly empty by day (as in the real game): ' + (emptySamples / samples).toFixed(2));
  assert.ok(byDay.length >= 8, 'orders by day ' + byDay.length);
  assert.ok(E.events.some((e) => e.t === 'gb:delivered' && !e.first), 'delivered');
  // the share is drawn on the racks (shown) and never above share.max
  assert.ok(sumO(m.res) <= GB_TUNING.share.max);
  const b = E.balance();
  assert.equal(b.in, b.now, JSON.stringify(b));
});

test('C1: 금방 집하 — the dog sled loads the full village piles (real roads) and drops the crates at the dock', () => {
  const piles = ['fish', 'ore', 'meat', 'log', 'wheat'].map((id) => { const q = WORLD.labour.piles[id]; return { id, item: q.item, x: q.x, y: q.y, n: id === 'log' || id === 'wheat' ? 20 : 38, max: 40 }; });
  const E = makeEnv({ seed: 32, inflowPerMin: 20, T: T7, piles, village: 'real' });
  const m = E.model;
  m.open({ ceremonyS: 1 });
  const before = Object.fromEntries(E.out.piles.map((p) => [p.id, p.n]));
  E.run(DAY * 0.35);
  const loads = E.events.filter((e) => e.t === 'gb:collect' && e.op === 'load' && e.n > 0);
  const drops = E.events.filter((e) => e.t === 'gb:collect' && e.op === 'drop' && e.n > 0);
  assert.ok(loads.length >= 2 && drops.length >= 1, 'loads ' + loads.length + ' drops ' + drops.length);
  assert.ok(E.out.dropped >= 20, 'crates at the dock ' + E.out.dropped);
  // only full piles (≥ pileAt), never below keep
  for (const e of loads) assert.ok(['fish', 'ore', 'meat'].includes(e.pile), 'loaded a pile that was not full: ' + e.pile);
  for (const p of E.out.piles) assert.ok(p.n >= Math.ceil(p.max * GB_TUNING.collect.keep) - 1e-9 || p.n === before[p.id], p.id + ' below keep: ' + p.n);
  assert.equal(m.settle.tot[0] >= 1, true);
  assert.ok(m.settle.col >= E.out.dropped - 1e-9 && m.settle.today.col > 0);
  const b = E.balance();
  assert.equal(b.in, b.now, JSON.stringify(b));
  // never at night: the sled stays at the stand 21–07
  const night = E.events.filter((e) => e.t === 'gb:collect' && e.op === 'go' && (hourOf(e.T) >= 21 || hourOf(e.T) < 7));
  assert.equal(night.length, 0);
});

// ------------------------------------------------------------------------------------------------ H1
test('H1: who is home reads TownSim placeObj (state in, "<home>:in"), and TownSim still sets those fields', () => {
  const entries = [
    { aid: 't_apt2', kind: 'apt', households: [{ hid: 't_apt2:jeong', people: [{ pid: 'jeong' }] }, { hid: 't_apt2:4', people: [{ cid: 4 }, { cid: 5 }] }, { hid: 't_apt2:9', people: [{ cid: 9 }] }] },
    { aid: 'lotH3', kind: 'house', households: [{ hid: 'lotH3:12', people: [{ cid: 12 }] }] },
    { aid: 'v1', kind: 'village', households: [{ hid: 'v1:0', people: [{ pid: 'v0' }] }] },
  ];
  // citizens exactly as TownSim makes them: place stays null, placeObj is the place they are at
  const C = {
    4: { id: 4, home: 't_apt2', state: 'out', place: null, placeObj: { id: 'c_cafe:gather' } },
    5: { id: 5, home: 't_apt2', state: 'in', place: null, placeObj: { id: 't_apt2:in' } },
    9: { id: 9, home: 't_apt2', state: 'walk', place: null, placeObj: { id: 't_apt2:in' } },
    12: { id: 12, home: 'lotH3', state: 'in', place: null, placeObj: { id: 't_cafe:in' } },
  };
  const sets = homeSets(entries, (cid) => C[cid] || null);
  assert.deepEqual(Array.from(sets.get('t_apt2')), ['t_apt2:4']);
  assert.equal(sets.get('lotH3').size, 0, 'at the café, not at home');
  assert.equal(sets.has('v1'), false);
  assert.equal(insideOf({ state: 'in', placeObj: { id: 'lotH3:in' } }, 'lotH3'), true);
  // the guard: the fields the adapter reads still exist in TownSim
  const src = fs.readFileSync(path.join(ROOT, 'src', 'systems', 'TownSim.js'), 'utf8');
  assert.match(src, /c\.placeObj = pl;/);
  assert.match(src, /c\.state = sg\.mode === 'in' \? 'in' : 'out';/);
  assert.match(src, /id \+ ':in'/);
});

// ------------------------------------------------------------------------------------------------ H2
test('H2: 정 할머니 orders even when the racks are empty at the opening (dock surplus / the log pile), never skipped', () => {
  const D = realDepot();
  const piles = [{ id: 'log', item: 'item_log', x: 330, y: 1250, n: 30, max: 40 }];
  const E = makeEnv({ seed: 33, depot: D, inflowPerMin: 0, T: T7 + 25 * 3, piles, dockItems: { item_bread: 3 } });
  const m = E.model;
  m.open({ ceremonyS: 1 });
  E.run(1.2 + GB_TUNING.open.firstDelayS + 1);
  const o = E.events.find((e) => e.t === 'gb:order');
  assert.ok(o && o.first, 'the first order was placed');
  assert.equal(o.hid, 't_apt2:jeong');
  assert.deepEqual(o.items, { item_log: 4, item_bread: 2 });
  assert.equal(E.out.dockItems.item_bread, 1, 'two breads came off the station dock');
  // nothing anywhere: she waits (retried each second), ordinary orders wait firstWaitS, then she orders when stock comes
  const D2 = realDepot();
  const E2 = makeEnv({ seed: 34, depot: D2, inflowPerMin: 0, T: T7 });
  E2.model.open({ ceremonyS: 1 });
  E2.run(20);
  assert.equal(E2.events.filter((e) => e.t === 'gb:order').length, 0);
  assert.ok(E2.model.firstAt !== undefined, 'still pending');
  D2.model.take([{ ty: 'item_log', n: 10 }, { ty: 'item_bread', n: 6 }]);
  E2.run(3);
  const f = E2.events.find((e) => e.t === 'gb:order' && e.first);
  assert.ok(f, 'ordered once the stock came');
  E2.run(90);
  assert.ok(E2.events.some((e) => e.t === 'gb:firstDone'), 'the 첫 배달 완료 tip follows');
});

// ------------------------------------------------------------------------------------------------ H3
test('H3: the AddressBook follows the town (a home founded after the opening orders within 2 s of the touch)', () => {
  const E = makeEnv({ seed: 35 });
  let entries = E.entries.slice(0, 6);
  let T = T7;
  const D = E.depot;
  const ports = {
    clock: { T: () => T, hour: () => hourOf(T) }, lang: () => 'ko',
    roads: { net: () => ROADS.rn, village: () => villageGraph() },
    town: { homes: () => entries, home: () => true },
    depot: { count: D.count, pick: (i) => D.pick(i), restock: (i) => D.restock(i), level: D.level, fill: D.fill },
    coins: { till: () => {}, spend: () => true }, ui: { toast: () => {}, banner: () => {} },
  };
  const host = new GeumbangHost(ports, null, { seed: 35 });
  host.api.open({ ceremonyS: 1 });
  for (let k = 0; k < 90; k++) { T += 1 / 30; host.update(1 / 30); }
  const n0 = host.model.book.list().length;
  entries = E.entries.slice();                      // new homes in the town
  host.touch();                                     // (GeumbangSystem calls this when townSig() changes / on 'built')
  for (let k = 0; k < 75; k++) { T += 1 / 30; host.update(1 / 30); }
  assert.ok(host.model.book.list().length > n0, n0 + ' -> ' + host.model.book.list().length);
  // the signature the adapter compares every 2 s changes when a citizen moves in
  const cits = [{ id: 1, home: 't_apt1' }, { id: 2, home: 't_apt2' }];
  const a = townSignature(cits, '3:2'), b = townSignature(cits.concat([{ id: 3, home: 'lotH3' }]), '3:2');
  assert.notEqual(a, b);
  assert.equal(townSignature(cits, '3:2'), a);
});

// ------------------------------------------------------------------------------------------------ H4
test('H4: coins and items paid into the 금방 개업 pad are kept in the slice (st 0 only)', () => {
  const E = makeEnv({ seed: 36 });
  const m = E.model;
  assert.equal(m.st, 0);
  m.seen |= 1;                                      // the letter came
  m.pad = { paid: 2000, got: { item_plank: 12, item_ingot: 3 } };
  const s = sanitizeGeumbang(JSON.parse(JSON.stringify(m.serialize())));
  assert.equal(s.pp, 2000);
  assert.equal(s.pi, 'ingot3,plank12');
  const E2 = makeEnv({ seed: 36, saved: s });
  assert.deepEqual(E2.model.pad, { paid: 2000, got: { item_ingot: 3, item_plank: 12 } });
  // opened: the pad state is gone from the slice
  E2.model.open({ ceremonyS: 1 });
  E2.run(3);
  const s2 = E2.model.serialize();
  assert.equal(s2.pp, undefined); assert.equal(s2.pi, undefined);
});

// ------------------------------------------------------------------------------------------------ H5
test('H5: 개썰매 2 adds a second team, 광장 보관함 takes village parcels, 아파트 보관함 empties as residents fetch', () => {
  const E = makeEnv({ seed: 37, fill: 0.85, inflowPerMin: 40 });
  const m = E.model;
  m.open({ ceremonyS: 1 });
  assert.equal(m.sleds.length, 1);
  assert.ok(m.upgrade('sled2'));
  assert.equal(m.sleds.length, 2, 'two sleds');
  assert.ok(m.upgrade('van2') && m.upgrade('lockA'));
  E.run(DAY * 1.5);
  const inA = E.events.filter((e) => e.t === 'gb:delivered' && e.how === 'locker' && e.aid && /^t_apt/.test(e.aid)).length;
  const outA = E.events.filter((e) => e.t === 'gb:lockerPickup' && e.kind === 'A').length;
  assert.ok(inA > 12, 'more apartment parcels than the locker holds went in: ' + inA);
  assert.ok(outA > 0 && m.settle.lockers.A.length <= GB_TUNING.locker.cap);
  // the plaza locker: village parcels are delivered into it at the stand
  assert.ok(m.upgrade('lockP'));
  E.run(DAY);
  assert.ok(E.events.some((e) => e.t === 'gb:locker' && e.kind === 'P'), 'the plaza locker took a village parcel');
  // the lockers' contents are saved as counts and come back
  const s = sanitizeGeumbang(JSON.parse(JSON.stringify(m.serialize())));
  const n = m.settle.lockers.P.length + m.settle.lockers.A.length;
  if (n) { assert.ok(Array.isArray(s.lk)); const E2 = makeEnv({ seed: 37, saved: s, T: E.T }); assert.equal(E2.model.settle.lockers.P.length + E2.model.settle.lockers.A.length, n); }
});

// ------------------------------------------------------------------------------------------------ H6
test('H6: the 따라가기 caption is hidden after the hold and stays hidden (the banner check never shows it again)', () => {
  const vis = { v: true };
  const caption = { visible: true, setVisible(v) { this.visible = v; return this; }, setScale() { return this; } };
  const view = {
    m: { orders: { get: () => null } }, P: { view: { lookAt() {}, release() {} }, ui: { bannerOn: () => false }, settings: { scenes: () => 'on' } },
    hub: { reveal() {}, bld: () => null, crew: [] }, scene: null, uiScene: null, addTicker() {}, lang: () => 'ko', sound() {},
  };
  const f = new Follow(view);
  f.active = true; f.id = 'g1'; f.t = 0; f.doneT = 0; f.door = { x: 0, y: 0 }; f.cap = 6; f.c = caption; f.capT = 1; f.tapOff = null;
  for (let k = 0; k < 4 / (1 / 30); k++) f.update(1 / 30);
  assert.equal(f.active, false);
  assert.equal(caption.visible, false, 'hidden at the end');
  for (let k = 0; k < 60; k++) f.update(1 / 30);
  assert.equal(caption.visible, false, 'stays hidden');
  void vis;
});

// ------------------------------------------------------------------------------------------------ M1
test('M1: a road change mid-tour puts the van parcels back on the pile; they are delivered later, none stays gone', () => {
  const E = makeEnv({ seed: 38 });
  const m = E.model;
  m.open({ ceremonyS: 1 });
  let guard = 0;
  while (!(m.disp.vans[0].st === 'out' || m.disp.vans[0].st === 'leg') && guard++ < 6000) E.run(0.1);
  const ids = m.disp.vans[0].load.map((o) => o.id);
  assert.ok(ids.length > 0);
  m.setRoads(ROADS.rn, ROADS.lg);                  // what RoadNet.onChange triggers (host.roads)
  for (const id of ids) { const o = m.orders.get(id); assert.ok(o && o.st === 'ready' && o.van === null, id + ' back on the pile'); }
  E.run(DAY * 0.6);
  const done = new Set(E.events.filter((e) => e.t === 'gb:delivered' || (e.t === 'gb:restock' && e.id)).map((e) => e.id));
  for (const id of ids) assert.ok(done.has(id), id + ' delivered after the change');
  for (const o of m.orders.list) if (o.st === 'gone') assert.ok(typeof o.van === 'number' ? m.disp.vans.some((v) => v.load.includes(o)) : o.van === 'sled');
  const b = E.balance();
  assert.equal(b.in, b.now, JSON.stringify(b));
});

// ------------------------------------------------------------------------------------------------ M2
test('M2: crates on their way to the dock (backhaul on a van, 집하 on a sled) are saved and go to the dock at load', () => {
  const E = makeEnv({ seed: 39 });
  const m = E.model;
  m.open({ ceremonyS: 1 });
  E.run(5);
  m.disp.vans[0].backload = { item_log: 8, item_fish_raw: 8 };
  m.sleds[0].cload = { item_ore: 12 };
  const s = sanitizeGeumbang(JSON.parse(JSON.stringify(m.serialize())));
  assert.equal(s.dock, 'fish_raw8,log8,ore12');
  const E2 = makeEnv({ seed: 39, saved: s, T: E.T });
  assert.equal(E2.out.surplus, 28, 'all 28 crates reached the dock surplus');
});

// ------------------------------------------------------------------------------------------------ M4
test('M4: a van brakes for the cargo sleigh ahead in its lane; curbs keep off the sleigh route', () => {
  let sleigh = null;
  const E = makeEnv({ seed: 40, live: true, walkers: () => (sleigh ? [sleigh] : null) });
  E.out.live = true;
  const m = E.model;
  m.open({ ceremonyS: 1 });
  let guard = 0;
  const driving = (v) => (v.st === 'out' || v.st === 'leg') && v.s > (v.st === 'out' ? v.spurEnd + 2 : 1) && v.path.len - v.s > 8 && v.v > 1;
  while (!driving(m.disp.vans[0]) && guard++ < 20000) E.run(0.05);
  const v = m.disp.vans[0];
  assert.ok(driving(v), v.st);
  // the sleigh 2.2 m ahead of the van in its lane
  sleigh = { x: v.x + v.hx * 64 * 2.2 / Math.hypot(v.hx, v.hy * 2), y: v.y + v.hy * 64 * 2.2 / Math.hypot(v.hx, v.hy * 2), sleigh: true };
  const s0 = v.s;
  E.run(3);
  assert.ok(v.s - s0 < 1.0, 'the van waited behind the sleigh (moved ' + (v.s - s0).toFixed(2) + ' m)');
  sleigh = null;
  E.run(3);
  assert.ok(v.s - s0 > 2 || (v.st !== 'out' && v.st !== 'leg'), 'and went on');
  // curbs: no van address parks within 1 m of the sleigh route when another curb is near (the route penalty)
  const route = WORLD.v42.sleighRoute.map(([i, j]) => L(i, j));
  const on = m.book.list().filter((a) => a.zone === 'van' && a.curb && m.book.nearAvoid(a.curb.x, a.curb.y) < 1.0);
  const E2 = makeEnv({ seed: 40, avoid: false });
  const on2 = E2.model.book.list().filter((a) => a.zone === 'van' && a.curb && E.model.book.nearAvoid.call({ avoid: route }, a.curb.x, a.curb.y) < 1.0);
  assert.ok(on.length <= on2.length, 'curbs on the sleigh lane ' + on.length + ' (without the rule ' + on2.length + ')');
});

// ------------------------------------------------------------------------------------------------ M5
test('M5: without a sled stand no village order is taken; the waiting ones go back to the racks', () => {
  const E = makeEnv({ seed: 41 });
  const m = E.model;
  m.open({ ceremonyS: 1 });
  E.run(DAY * 0.4);
  // the stand disappears (a road change / map change): rebuild without it
  m.lay = Object.assign({}, m.lay, { sledStand: [60, 60] });
  m.setWorld(E.entries, villageGraph());
  const hadStand = !!m.book.get('stand');
  E.run(DAY * 0.5);
  if (!hadStand) {
    const after = E.events.filter((e) => e.t === 'gb:order' && e.T > E.T - DAY * 0.5 && m.book.get(e.aid) && m.book.get(e.aid).zone === 'sled');
    assert.equal(after.length, 0, 'village orders without a stand');
    for (const o of m.orders.list) if (o.mode === 'sled') assert.notEqual(o.st, 'ready', 'a village parcel waits forever');
  }
  const b = E.balance();
  assert.equal(b.in, b.now, JSON.stringify(b));
});

// ------------------------------------------------------------------------------------------------ M7
test('M7: the kids ask "엄마, 금방 뭐가 왔어?" and the parent answers "금방이 왔지~!"; late parcels at kid homes say 조금방', () => {
  const kidHh = { hid: 'h1', people: [{ kind: 'adult' }, { kind: 'child' }] };
  const view = { lang: () => 'ko', m: { book: { get: () => ({ door: { x: 0, y: 0 }, hh: [kidHh] }) } }, P: {}, late: new Map() };
  const d = Object.create(VanDriver.prototype);
  d.view = view; d.firsts = new Set(); d.tl = { beats: [{ k: 'hand', ids: ['g1'] }, { k: 'joy', t0: 3 }] };
  let pair = 0, late = null;
  for (let k = 0; k < 12; k++) { d.tl.beats[1].t0 = k; const ln = d.line('a' + k, 'h1', d.tl.beats[1]); if (Array.isArray(ln) && ln[0] === '엄마, 금방 뭐가 왔어?' && ln[1] === '금방이 왔지~!') pair++; }
  assert.ok(pair >= 4, 'the joke pair ' + pair + ' / 12');
  view.late.set('g1', true);
  late = d.line('a1', 'h1', d.tl.beats[1]);
  assert.deepEqual(late.slice(0, 2), ['오늘은 금방이 아니라 조금방이네~', '죄송해요, 눈길이 미끄러워서요!']);
  // households without children never ask
  view.m.book.get = () => ({ door: { x: 0, y: 0 }, hh: [{ hid: 'h2', people: [{ kind: 'adult' }] }] });
  view.late.clear();
  for (let k = 0; k < 12; k++) { d.tl.beats[1].t0 = k; const ln = d.line('b' + k, 'h2', d.tl.beats[1]); assert.ok(!Array.isArray(ln) && ln !== '엄마, 금방 뭐가 왔어?'); }
});

// ------------------------------------------------------------------------------------------------ L3 / L4
test('L3 / L4: the next arrival is saved; orders beyond the slice fold into back (nothing lost)', () => {
  const E = makeEnv({ seed: 42, fill: 0.9, inflowPerMin: 60 });
  const m = E.model;
  m.open({ ceremonyS: 1 });
  m.upgrade('van2'); m.upgrade('van3');
  E.run(DAY * 0.5);
  const s = sanitizeGeumbang(JSON.parse(JSON.stringify(m.serialize())));
  assert.ok(sliceBytes(s) <= 1400);
  assert.ok(Number.isFinite(s.nx) && s.nx >= 0);
  const E2 = makeEnv({ seed: 42, saved: s, depot: E.depot, T: E.T });
  assert.ok(Math.abs(E2.model.orders.nextT - (E.T + s.nx)) < 1e-6);
  // every order's items are in the reloaded book or (folded) back on the racks
  const open = m.orders.list.reduce((n, o) => n + o.n, 0);
  const open2 = E2.model.orders.list.reduce((n, o) => n + o.n, 0) + sumO(parseGot(s.back || ''));
  assert.equal(open2, open);
});

// ------------------------------------------------------------------------------------------------ M4 (G-P2c)
test('M4 / G-P2c: on a street the cargo sleigh keeps to its right-hand lane (RoadNet.laneLattice rule), off it to its route', () => {
  const E = ROADS.rn.driveEdges;
  const main = E.find((e) => e.street === 'main' && e.axis === 'x');
  const ave = E.find((e) => e.street === 'ave' && e.axis === 'y');
  assert.ok(main && ave);
  const pm = { i: (main.t0 + main.t1) / 2, j: -5, di: 1, dj: 0 };
  // going +i: the +i lane (J − off); coming back (−i): the −i lane (J + off)
  assert.ok(Math.abs(pm.j + keepRight(E, pm, false).j - (main.fix - main.off)) < 1e-9);
  assert.ok(Math.abs(pm.j + keepRight(E, pm, true).j - (main.fix + main.off)) < 1e-9);
  // 중앙로: the route runs −j on i 31; back (+j) belongs at I + off
  const pa = { i: 31, j: (ave.t0 + ave.t1) / 2, di: 0, dj: -1 };
  assert.ok(Math.abs(pa.i + keepRight(E, pa, false).i - (ave.fix - ave.off)) < 1e-9);
  assert.ok(Math.abs(pa.i + keepRight(E, pa, true).i - (ave.fix + ave.off)) < 1e-9);
  // the depot apron (no street): no offset
  assert.deepEqual(keepRight(E, { i: 35.8, j: -25, di: 0, dj: -1 }, false), { i: 0, j: 0 });
});

// ------------------------------------------------------------------------------------------------ M6
test('M6: the office row, yesterday in the paper (homes delivered, racks lighter) and the 관망 watch spot', () => {
  const E = makeEnv({ seed: 44, fill: 0.85, inflowPerMin: 30 });
  let T = T7;
  const D = E.depot;
  let fill = 0.8;
  const ports = {
    clock: { T: () => T, hour: () => hourOf(T) }, lang: () => 'ko',
    roads: { net: () => ROADS.rn, village: () => villageGraph() },
    town: { homes: () => E.entries, home: () => true },
    depot: { count: D.count, pick: (i) => D.pick(i), restock: (i) => D.restock(i), level: D.level, fill: () => fill },
    coins: { till: () => {}, spend: () => true }, ui: { toast: () => {}, banner: () => {} },
  };
  const host = new GeumbangHost(ports, null, { seed: 44 });
  assert.deepEqual(host.api.news(), [], 'nothing before the opening');
  host.api.open({ ceremonyS: 1 });
  let spot = null;
  for (let k = 0; k < 6000 && !spot; k++) { T += 0.1; host.update(0.1); if (host.model.disp && host.model.disp.vans.some((v) => v.st === 'curb')) spot = host.api.watchSpot(host.model.disp.vans[0].x, host.model.disp.vans[0].y, 4000); }
  assert.ok(spot && spot.what === 'curb', '관망 finds a van at a curb: ' + JSON.stringify(spot));
  assert.match(host.api.officeRow(), /^금방 마켓 · 오늘 주문 \d+ · 배달 \d+ · 선반 −\d+$/);
  // to the next day: the racks were 80 % at its start, 60 % at the next
  const d1 = (Math.floor(T / DAY) + 1) * DAY;
  while (T < d1 + 1) { T += 0.5; host.update(0.5); }
  fill = 0.6;
  while (T < d1 + DAY + 1) { T += 0.5; host.update(0.5); }
  const lines = host.api.news();
  const yd = host.model.settle.days[0][1];
  assert.ok(yd > 0, 'deliveries yesterday ' + yd);
  assert.deepEqual(lines[0], ['news_gb_day', yd, 0]);
  assert.deepEqual(lines[1], ['news_gb_racks', 25, 0]);
});

// ------------------------------------------------------------------------------------------------ M3
test('M3: the book waits for no more than one round of the crew (1 van + 1 sled: 12), and a lone van leaves after idleWaitS', () => {
  const E = makeEnv({ seed: 45, fill: 0.85, inflowPerMin: 40 });
  const m = E.model;
  m.open({ ceremonyS: 1 });
  let maxWait = 0, lone = null;
  E.run(DAY, 1 / 30, () => {
    maxWait = Math.max(maxWait, m.orders.waiting());
    const v = m.disp.vans[0];
    if (!lone && v.st === 'load' && m.orders.list.filter((o) => o.van === v.id).length < m.tune.van.cap) lone = { n: v.load.length };
  });
  const cap = m.tune.van.cap + (m.sleds.length ? m.sleds.length * m.tune.sled.cap : 0);
  assert.ok(maxWait <= cap, 'waiting ' + maxWait + ' > ' + cap);
  assert.ok(lone && lone.n >= 1 && lone.n < m.tune.van.cap, 'a van left with fewer than a full load: ' + JSON.stringify(lone));
});
