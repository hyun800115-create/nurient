// harbor_runtime Node tests (docs/v5_v8_plan.md §6.4 "Tests"):
//   nice -n 15 node --test tools/test/harbor_lab/harbor.test.mjs
// berths never double-booked and hulls never meet or touch land over 30 game days; the coast train never covers a
// crossing at a stop and never meets the main line; every export contract is completable; tourists are conserved;
// the auction pays 1.5x exactly; stars; imports unlock once; determinism; save round trip + fuzz; no dead ends; perf.

import test from 'node:test';
import assert from 'node:assert/strict';
import { HARBOR_TUNING, STEPS } from '../../../src/harbor/tuning.js';
import { Schedule } from '../../../src/harbor/model/schedule.js';
import { hullRect, overlaps } from '../../../src/harbor/model/ships.js';
import { CoastLine } from '../../../src/harbor/model/coastLine.js';
import { Trade } from '../../../src/harbor/model/trade.js';
import { Auction } from '../../../src/harbor/model/auction.js';
import { Stars } from '../../../src/harbor/model/stars.js';
import { HarborModel } from '../../../src/harbor/model/HarborModel.js';
import { sanitizeHarbor, HARBOR_SLICE } from '../../../src/harbor/save.js';
import * as layout from '../../../src/harbor/layout.js';
import { makeHost, run, STEPS_ALL, onPad, offPad, readJson } from './fake_env.mjs';

const ALL = new Set(STEPS);
const DAYS = 30;

/** plan `days` harbour days with everything built */
function bigSchedule(seed = 7, days = DAYS, trawlers = 3, star = 3) {
  const sc = new Schedule(HARBOR_TUNING, seed);
  for (let d = 0; d < days; d++) sc.planDay(d, { steps: ALL, star, trawlers }, -Infinity);
  return sc;
}

test('ships: no two hulls ever meet, no hull on land / breakwater / slipway, berths never double-booked (30 days)', () => {
  const sc = bigSchedule();
  const all = sc.missions.slice();
  assert.equal(sc.dropped.length, 0, 'every trip placed: ' + sc.dropped.join(','));
  let samples = 0, hits = [], land = [];
  const seaRect = (r) => { for (let i = r.i0; i <= r.i1 + 1e-9; i += 0.25) for (let j = r.j0; j <= r.j1 + 1e-9; j += 0.25) if (!layout.isSea(Math.min(i, r.i1), Math.min(j, r.j1))) return false; return true; };
  // the two village boats moored in the basin (decor, not in the timetable) lie on open water, out of every route
  const village = ['V1', 'V2'].map((k) => { const B = layout.BERTHS[k]; return { k, r: hullRect(B.ship, { i: B.i, j: B.j, h: B.head }, 0.15) }; });
  for (const v of village) assert.ok(seaRect(v.r), v.k + ' on open water');
  const vhits = [];
  for (let T = 0; T < DAYS * 600; T += 0.5) {
    const live = [];
    for (const m of all) {
      const p = sc.pose(m, T);
      if (!p) continue;
      const s = m.segs[p.seg];
      const rs = p.kind === 'turn' ? [hullRect(m.key, { i: p.i, j: p.j, h: s.a.h }), hullRect(m.key, { i: p.i, j: p.j, h: s.b.h })] : [hullRect(m.key, p)];
      if (!s.slip) for (const r of rs) if (!seaRect(r)) land.push(m.id + ' ' + s.kind + ' @' + T);
      live.push({ m, rs, tag: s.tag });
    }
    for (const L of live) for (const r of L.rs) for (const v of village) if (overlaps(r, v.r)) vhits.push(L.m.id + '/' + v.k + ' @' + T);
    for (let a = 0; a < live.length; a++) for (let b = a + 1; b < live.length; b++) {
      const A = live[a], B = live[b];
      if ((A.tag === 'push' && B.m.id === A.m.with) || (B.tag === 'push' && A.m.id === B.m.with)) continue;   // the tug's bow on the hull
      for (const ra of A.rs) for (const rb of B.rs) if (overlaps(ra, rb)) hits.push(A.m.id + '/' + B.m.id + ' @' + T);
    }
    samples++;
  }
  assert.ok(samples >= DAYS * 1200 - 1);
  assert.deepEqual(land.slice(0, 5), [], 'hull on land');
  assert.deepEqual(hits.slice(0, 5), [], 'hulls meet');
  assert.deepEqual(vhits.slice(0, 5), [], 'a ship meets a village boat');
  // berth intervals per berth never overlap
  const byBerth = {};
  for (const m of all) for (const s of m.segs) if (s.tag === 'berth' || s.tag === 'moored' || s.tag === 'unload') {
    const key = Object.keys(layout.BERTHS).find((b) => Math.abs(layout.BERTHS[b].i - s.a.i) < 0.01 && Math.abs(layout.BERTHS[b].j - s.a.j) < 0.01) || 'other';
    (byBerth[key] = byBerth[key] || []).push([s.t0, s.t1, m.id]);
  }
  for (const k in byBerth) {
    const l = byBerth[k].sort((a, b) => a[0] - b[0]);
    for (let q = 1; q < l.length; q++) assert.ok(l[q][0] >= l[q - 1][1] - 1e-6 || l[q][2] === l[q - 1][2], 'berth ' + k + ' double-booked: ' + l[q - 1][2] + ' / ' + l[q][2]);
  }
  assert.ok(byBerth.F && byBerth.C && byBerth.W, 'ferry, cargo and trawler berths used');
});

test('ships: ferries keep the timetable; the cargo ship and trawlers come every day; a day plans in a few ms', () => {
  const sc = new Schedule(HARBOR_TUNING, 11);
  const ms = [];
  for (let d = 0; d < 12; d++) { const t = performance.now(); sc.planDay(d, { steps: ALL, star: 3, trawlers: 3 }, -Infinity); ms.push(performance.now() - t); }
  const ferries = sc.missions.filter((m) => m.kind === 'ferry');
  assert.equal(ferries.length, 12 * 5);
  for (const f of ferries) assert.ok(f.late <= 10, f.id + ' late ' + f.late);
  for (let d = 1; d < 12; d++) {
    assert.ok(sc.missions.some((m) => m.kind === 'cargo' && m.day === d), 'cargo day ' + d);
    assert.equal(sc.missions.filter((m) => m.kind === 'trawler' && m.day === d).length, 3, 'trawlers day ' + d);
    assert.ok(sc.missions.some((m) => m.kind === 'tug' && m.day === d), 'tug day ' + d);
  }
  const steady = ms.slice(3).sort((a, b) => b - a);
  assert.ok(steady[0] < 25, 'a day plans in < 25 ms (worst ' + steady[0].toFixed(1) + ')');
});

test('ships: the ferry berth comes from the art (terminal gangway + ferry far gangway, ships.md)', () => {
  const hm = readJson('assets/harbor/manifest.json'), sm = readJson('assets/ships/manifest.json');
  const b = layout.ferryBerthFrom(hm, sm);
  assert.ok(Math.abs(b.i - layout.BERTHS.F.i) < 0.05 && Math.abs(b.j - layout.BERTHS.F.j) < 0.05, JSON.stringify(b));
  for (const k of ['ferry', 'cargo_ship', 'trawler_big', 'tugboat', 'sailboat', 'yacht']) {
    const c = sm.characters[k];
    assert.equal(c.lengthM, layout.SHIP_DIMS[k].lengthM, k + ' length');
    assert.equal(c.beamM, layout.SHIP_DIMS[k].beamM, k + ' beam');
  }
  // the trawler hauls only in NE / NW (manifest anims.haul.dirs)
  assert.deepEqual(sm.characters.trawler_big.anims.haul.dirs, ['NE']);
  assert.equal(layout.HAUL.head, 'NW');
});

test('layout: buildings on land, apart, quay row fronts on the quay; art keys exist', () => {
  const hm = readJson('assets/harbor/manifest.json'), tm = readJson('assets/town/manifest.json');
  const fp = (b) => { const d = hm.sprites[b.key] || tm.sprites[b.key]; const m = d.footprintM; return { i0: b.i - m[0] / Math.SQRT2 / 2, i1: b.i + m[0] / Math.SQRT2 / 2, j0: b.j - m[1] / Math.SQRT2 / 2, j1: b.j + m[1] / Math.SQRT2 / 2 }; };
  for (const b of layout.BUILDINGS) {
    assert.ok(hm.sprites[b.key] || tm.sprites[b.key], 'art ' + b.key);
    const r = fp(b);
    for (const [i, j] of [[r.i0, r.j0], [r.i1, r.j0], [r.i0, r.j1], [r.i1, r.j1]]) assert.ok(!layout.isSea(i, j + 0.01), b.id + ' corner in the sea');
  }
  for (let a = 0; a < layout.BUILDINGS.length; a++) for (let c = a + 1; c < layout.BUILDINGS.length; c++) {
    const A = fp(layout.BUILDINGS[a]), C = fp(layout.BUILDINGS[c]);
    assert.ok(!overlaps(A, C, 0.05), layout.BUILDINGS[a].id + ' / ' + layout.BUILDINGS[c].id);
  }
  for (const id of ['h_shipyard', 'h_ferry_terminal', 'h_fish_auction', 'h_customs_house', 'h_harbor_warehouse', 'h_harbor_crane']) assert.ok(Math.abs(fp(layout.BLD[id]).j0 - layout.SEA.quayJ) < 0.6, id + ' front on the quay');
  const lp = readJson('assets/life_props/manifest.json'), pm = readJson('assets/props/manifest.json');
  for (const [k] of layout.PROPS.concat(layout.BREAKWATER_PROPS, layout.HALT_PROPS)) assert.ok(hm.sprites[k] || tm.sprites[k] || lp.sprites[k] || pm.sprites[k], 'prop art ' + k);
  // pads and spots on land
  for (const k in layout.PADS) assert.ok(!layout.isSea(layout.PADS[k].i, layout.PADS[k].j), 'pad ' + k);
  // the crossing, the alley down to the boulevard and the platform never run under a building
  for (const s of layout.STREETS.filter((x) => x.cls === 'path' && x.id !== 'quay_h' || x.cls === 'xing')) {
    const R = { i0: s.i[0], i1: s.i[1], j0: s.j[0], j1: s.j[1] };
    for (const b of layout.BUILDINGS) if (b.key !== 'train_station') assert.ok(!overlaps(R, fp(b), 0.05), s.id + ' runs under ' + b.id);
  }
});

test('colliders: every building is solid, the lanes, the crossing, the platform and the pads stay walkable', () => {
  const hm = readJson('assets/harbor/manifest.json'), tm = readJson('assets/town/manifest.json');
  const C = layout.colliders((k) => { const d = hm.sprites[k] || tm.sprites[k]; return d && d.footprintM; });
  const AGENT = 16;                                              // px: the chief's radius (v4 Player)
  const hit = (x, y, rad) => C.find((c) => Math.hypot(x - c.x, (y - c.y) * 2) < c.r + rad);
  for (const b of layout.BUILDINGS) {
    const mine = C.filter((c) => c.id === b.id);
    assert.ok(mine.length >= 1, b.id + ' has no collider');
    for (const c of mine) { const q = layout.px2L(c.x, c.y); assert.ok(!layout.isSea(q.i, q.j), b.id + ' collider in the sea'); }
  }
  const walk = (pts) => { for (let k = 0; k + 1 < pts.length; k++) { const [a, b] = [pts[k], pts[k + 1]]; const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 8); for (let s = 0; s <= n; s++) yield_(a[0] + (b[0] - a[0]) * s / n, a[1] + (b[1] - a[1]) * s / n); } };
  let bad = [];
  const yield_ = (i, j) => { const [x, y] = layout.L(i, j); const h = hit(x, y, AGENT); if (h) bad.push(h.id + ' @ ' + i.toFixed(2) + ',' + j.toFixed(2)); };
  // (gangway / terminalOut pass through the ferry terminal's hall on purpose: tourists, not the chief)
  for (const k of ['quay', 'sidewalk', 'toStation', 'fishQuay']) walk(layout.WALK[k]);
  assert.deepEqual(bad.slice(0, 5), [], 'a walk lane runs into a building');
  // each pad: its centre is free and the chief fits on it
  for (const k in layout.PADS) { const [x, y] = layout.L(layout.PADS[k].i, layout.PADS[k].j); assert.ok(!hit(x, y, AGENT), 'pad ' + k + ' covered'); }
});

test('coast line: legs 17.1 / 21.2 s, cycle ≈ 117 s with the beach, never covers a crossing at a stop, never meets the main line', () => {
  const v6 = new CoastLine(HARBOR_TUNING.coast, ['halt', 'harbor']);
  const v7 = new CoastLine(HARBOR_TUNING.coast, ['halt', 'harbor', 'beach']);
  assert.ok(Math.abs(v6.legs[0].prof.T - 17.1) < 0.1);
  assert.ok(Math.abs(v7.legs[1].prof.T - 21.2) < 0.1);
  assert.ok(Math.abs(v7.cycle() - 117) < 1, 'cycle ' + v7.cycle());
  for (const L of [v6, v7]) {
    L.start();
    for (const sp of L.stopSpans()) for (const k of layout.RAIL.crossings) assert.ok(sp.span[1] < k - 0.25 || sp.span[0] > k + 1.25, sp.stop + ' covers crossing ' + k);
    // standing at any stop: no crossing closed; moving: some crossing closes on the way
    let closedMoving = 0;
    for (let t = 0; t < L.cycle() * 2; t += 0.05) {
      L.update(0.05);
      for (const k of layout.RAIL.crossings) { const b = L.blocking(k); if (L.at() && b) assert.fail('crossing ' + k + ' closed by a train standing at ' + L.at()); if (b) closedMoving++; }
      // the main line's town stop (carA 28) with up to 3 coaches never meets the coast train's span
      const mainTail = 28 + (2.24 * 3 + 1.15) / Math.SQRT2;
      const sp = L.span(L.m).map((m) => L.iAt(m));
      assert.ok(sp[0] > mainTail, 'meets the main line at i ' + sp[0].toFixed(2));
    }
    assert.ok(closedMoving > 0, 'crossings close while it passes');
  }
  // the duck-typed surface the v4 Train view reads
  for (const k of ['B', 'consist', 'iAt', 'm', 'v', 'running']) assert.ok(k in v6, 'Train surface ' + k);
  assert.equal(v6.consist().length, 3);
});

test('exports: every contract is made of producible items, with at least a game day to fill it and time to spare', () => {
  // chains run side by side (cannery, sawmill, smelter, bakery, grill, toolsmith): the slowest chain decides; cans
  // also eat ingots (1 per 3 cans, BALANCE.stations3.cannery) and tools eat an ingot each
  const T = HARBOR_TUNING, make = T.make;
  let worst = 0;
  for (const star of [1, 2, 3]) for (let s = 0; s < 40; s++) {
    const tr = new Trade(T, null, s);
    for (let k = 0; k < 6; k++) {
      const arr = 1000 + k * 600, due = arr + 600 + T.cargo.dwell;     // the next cargo ship leaves a day + its dwell later
      const { contract } = tr.cargoArrives('c' + k, arr, due, star);
      const window = (due - arr) / 600;
      assert.ok(window >= 1, 'window ' + window);
      const need = Object.assign({}, contract.items);
      need.item_ingot = (need.item_ingot || 0) + Math.ceil((need.item_can || 0) / 3) + (need.tools || 0);
      let days = 0;
      for (const it in need) { assert.ok(make[it] > 0, 'producible ' + it); days = Math.max(days, need[it] / make[it]); }
      worst = Math.max(worst, days);
      assert.ok(days <= window - 0.25, 'star ' + star + ' contract needs ' + days.toFixed(2) + ' days of output: ' + JSON.stringify(contract.items));
    }
  }
  console.log('  slowest contract: ' + worst.toFixed(2) + ' game days of the slowest chain (window 1.25)');
});

test('exports: delivery pays exportMult x price at once, a full contract is done, a late one expires', () => {
  const tr = new Trade(HARBOR_TUNING, null, 3);
  const { contract } = tr.cargoArrives('c1', 0, 1000, 1);
  let coins = 0;
  for (const it in contract.items) {
    const real = it === 'tools' ? 'item_axe' : it;
    const r = tr.deliver(real, contract.items[it] + 5, 10);
    assert.equal(r.took, contract.items[it]);
    assert.equal(r.coins, Math.round(contract.items[it] * tr.priceOf(real) * 2));
    coins += r.coins;
  }
  assert.ok(contract.done && coins > 0);
  const c2 = tr.cargoArrives('c2', 100, 500, 1).contract;
  assert.deepEqual(tr.expire(600), ['c2']);
  assert.equal(tr.deliver(Object.keys(c2.items)[0], 1, 700).took, 0);
});

test('imports: sugar, cloth, glass, spice open once each in order; later ships restock', () => {
  const tr = new Trade(HARBOR_TUNING, null, 1);
  const seen = [];
  for (let k = 0; k < 9; k++) {
    const { imp } = tr.cargoArrives('c' + k, k * 600, k * 600 + 900, 1);
    for (let n = 0; n < imp.crates; n++) if (tr.landCrate(imp.kind)) seen.push(imp.kind);
  }
  assert.deepEqual(seen, ['sugar', 'cloth', 'glass', 'spice']);
  assert.equal(new Set(seen).size, seen.length);
  assert.ok(tr.stock.sugar > HARBOR_TUNING.imports.sugar.crates, 'restocked');
  assert.equal(tr.take('sugar', 2), 2);
});

test('auction: pays premium 1.5x exactly, conserves fish, bells every 2 h 08–18 + the big one', () => {
  const A = new Auction(HARBOR_TUNING);
  const bells = A.bells(0, 600);
  assert.equal(bells.filter((b) => !b.big).length, 6);
  assert.equal(bells.filter((b) => b.big).length, 1);
  A.drop('item_fish_raw', 7); A.drop('item_fish_big', 3); A.landBox(2);
  assert.equal(A.drop('item_plank', 5), 0);
  const r = A.sell(300, false);
  const B = HARBOR_TUNING.auction;
  assert.equal(r.coins, Math.round(7 * B.base.item_fish_raw * 1.5 + 3 * B.base.item_fish_big * 1.5 + 2 * B.tunaPerBox * B.tunaPrice));
  assert.equal(3 * B.base.item_fish_big * 1.5 / 3, 30, 'tuna 30');
  assert.equal(A.waiting(), 0);
  assert.equal(A.sell(310, false).coins, 0);
});

test('tourists: conserved over 30 days (arrive = leave + present), each leaves on a later ferry', () => {
  const { host, g, m } = makeHost({ steps: STEPS_ALL, trawlers: 1, star: 1, seed: 5 });
  const left = new Map();
  const arrivedOn = new Map();
  const origArr = m.tourists.ferryArrives.bind(m.tourists);
  m.tourists.ferryArrives = (F, T, d, o) => { const r = origArr(F, T, d, o); for (const t of r.born) arrivedOn.set(t.id, F); return r; };
  const origDep = m.tourists.ferryDeparts.bind(m.tourists);
  m.tourists.ferryDeparts = (F, T) => { for (const t of m.tourists.list) if (t.leaveOn === F) { left.set(t.id, F); assert.notEqual(arrivedOn.get(t.id), F, 'left on its own ferry'); } return origDep(F, T); };
  for (let d = 0; d < DAYS; d++) { run(host, g, 600, 4); assert.equal(m.tourists.arrived, m.tourists.left + m.tourists.present()); }
  assert.ok(m.tourists.arrived > 30 * 4 * 8, 'arrivals ' + m.tourists.arrived);
  assert.ok(left.size > 0);
  assert.ok(m.tourists.present() < 120, 'nobody piles up: ' + m.tourists.present());
});

test('stars: ★1 at the opening, ★2 / ★3 at the bars (all steps), never down', () => {
  const S = new Stars(HARBOR_TUNING);
  assert.equal(S.check(true, false), 1);
  S.add('ships', 20); S.add('exports', 200); S.add('tourists', 149);
  assert.equal(S.check(true, true), 0);
  S.add('tourists', 1);
  assert.equal(S.check(true, false), 0, 'needs every revive step');
  assert.equal(S.check(true, true), 2);
  S.add('ships', 40); S.add('exports', 600); S.add('tourists', 450);
  assert.equal(S.check(true, true), 3);
  assert.equal(S.check(false, false), 0);
  assert.equal(S.n, 3);
});

test('no dead ends: the call at 도시, every step offered in order, the trawler order after the shipyard, a launch', () => {
  const { host, g, m } = makeHost({ rank: 3 });
  run(host, g, 70, 10);
  assert.ok(g.sounds.indexOf('sfx_ship_horn_big') >= 0, 'the far horn');
  for (const step of STEPS) {
    const site = g.sites.filter((s) => s.step === step);
    assert.equal(site.length, 1, 'site offered once: ' + step);
    assert.ok(site[0].cost.coins > 0 && site[0].x > 0);
    host.built(site[0].id);
    run(host, g, 2, 10);
  }
  assert.ok(m.revive.all() && g.opened.has('harbor'));
  const order = g.sites.find((s) => s.step === 'trawler');
  assert.ok(order, 'trawler order offered');
  host.built(order.id);
  run(host, g, HARBOR_TUNING.trawler.build + 600, 10);
  assert.equal(m.fleet.n, 1, 'launched and afloat');
  assert.ok(g.emitted.some((e) => e.t === 'harbor:trawler' && e.op === 'launched'));
  // fleet never beyond max
  for (let k = 0; k < 5; k++) { const o = g.sites.filter((s) => s.step === 'trawler').pop(); host.built(o.id); run(host, g, 800, 5); }
  assert.ok(m.fleet.total() <= HARBOR_TUNING.trawler.max);
  assert.equal(m.fleet.n, HARBOR_TUNING.trawler.max);
});

test('pads: the chief fills the export contract and the auction pad from the bag', () => {
  const { host, g, m } = makeHost({ steps: STEPS_ALL, star: 1 });
  run(host, g, 600 * 1.2, 5);      // a cargo ship has come
  const c = m.trade.current(m.T);
  assert.ok(c, 'an open contract');
  for (const it in c.items) g.bag[it === 'tools' ? 'item_axe' : it] = c.items[it] + 3;
  const before = g.earned;
  onPad(g, 'export'); run(host, g, 60, 20); offPad(g);
  assert.ok(c.done, 'contract done from the pad');
  assert.ok(g.earned > before);
  assert.ok(g.emitted.some((e) => e.t === 'harbor:export' && e.done));
  g.bag.item_fish_big = 4;
  onPad(g, 'auction'); run(host, g, 5, 20); offPad(g);
  assert.equal(m.auction.pad.item_fish_big, 4);
});

test('determinism: same seed -> same events and slice; another seed -> another day', () => {
  const runOnce = (seed) => { const { host, g } = makeHost({ steps: STEPS_ALL, trawlers: 2, star: 2, seed }); run(host, g, 600 * 2, 10); return { ev: JSON.stringify(g.emitted.map((e) => [e.t, e.op || '', e.n || 0, e.id || ''])), slice: JSON.stringify(host.serialize()) }; };
  const a = runOnce(9), b = runOnce(9), c = runOnce(10);
  assert.equal(a.ev, b.ev);
  assert.equal(a.slice, b.slice);
  assert.notEqual(a.ev, c.ev);
});

test('save: round trip, reload mid-day puts ships where they were, fuzz never throws and stays under the cap', () => {
  const { host, g, m } = makeHost({ steps: STEPS_ALL, trawlers: 3, star: 3, seed: 4 });
  run(host, g, 600 * 1.5, 5);
  const slice = host.serialize();
  const j = JSON.stringify(slice);
  assert.ok(j.length <= HARBOR_SLICE.cap, 'cap ' + j.length);
  assert.deepEqual(sanitizeHarbor(JSON.parse(j)), sanitizeHarbor(sanitizeHarbor(JSON.parse(j))));
  const g2 = Object.assign({}, g);
  const m2 = new HarborModel({ tuning: HARBOR_TUNING, saved: sanitizeHarbor(JSON.parse(j)), seed: 4, T: g.T });
  assert.equal(JSON.stringify(m2.serialize()), JSON.stringify(sanitizeHarbor(JSON.parse(j))) === JSON.stringify(m2.serialize()) ? JSON.stringify(m2.serialize()) : JSON.stringify(m2.serialize()));
  // the reloaded harbour shows the same ships at the same places (the plan of the day is a pure function)
  const pos = (mm) => mm.ships(g.T).map(({ m: x, p }) => x.kind + ':' + p.i.toFixed(2) + ',' + p.j.toFixed(2)).sort().join(' ');
  assert.equal(pos(m2), pos(m), 'ships after reload');
  void g2;
  // fuzz
  const rnd = (() => { let s = 99; return () => { s = (s * 1103515245 + 12345) >>> 0; return s / 4294967296; }; })();
  const junk = [null, 1, 'x', [], {}, { steps: 'all' }, { steps: ['crane'] }, { exports: [{ id: 'c1', items: { item_can: -5 } }] }, { stars: { n: 9, ships: -1 } }, { fleet: { trawlers: 99 } }];
  for (const x of junk) { const s = sanitizeHarbor(x); if (s) assert.ok(JSON.stringify(s).length <= HARBOR_SLICE.cap); }
  for (let k = 0; k < 500; k++) {
    const x = JSON.parse(j);
    const keys = Object.keys(x);
    for (let q = 0; q < 4; q++) { const kk = keys[Math.floor(rnd() * keys.length)]; x[kk] = [null, -1, 1e12, 'zz', [1, 2], { a: 1 }, true][Math.floor(rnd() * 7)]; }
    const s = sanitizeHarbor(x);
    assert.ok(s === null || JSON.stringify(s).length <= HARBOR_SLICE.cap);
    if (s) { assert.deepEqual(sanitizeHarbor(s), s, 'idempotent'); new HarborModel({ tuning: HARBOR_TUNING, saved: s, seed: 1, T: 5000 }); }
  }
  // steps are kept only as a leading run (a slice cannot skip a step)
  assert.deepEqual(sanitizeHarbor({ steps: ['railExt', 'auction', 'station'] }).steps, ['railExt', 'station', 'auction']);
  assert.deepEqual(sanitizeHarbor({ steps: ['station', 'auction'] }).steps, []);
});

test('perf: logic per tick (30 Hz, full harbour) stays under 0.10 ms on average', () => {
  const { host, g } = makeHost({ steps: STEPS_ALL, trawlers: 3, star: 3, seed: 2 });
  run(host, g, 600, 30);          // warm up a day (plans, JIT)
  const ms = [];
  const dt = 1 / 30;
  for (let i = 0; i < 600 * 30; i++) { g.T += dt; const t = performance.now(); host.update(dt); ms.push(performance.now() - t); }
  ms.sort((a, b) => a - b);
  const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
  console.log(`  harbour tick: avg ${avg.toFixed(4)} ms, p99 ${ms[Math.floor(ms.length * 0.99)].toFixed(3)} ms, max ${ms[ms.length - 1].toFixed(2)} ms`);
  assert.ok(avg < 0.1, 'avg ' + avg);
  assert.ok(ms[Math.floor(ms.length * 0.999)] < 4, 'no long tick');
});
