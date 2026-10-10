// logistics_runtime Node tests (docs/v5_v8_plan.md §5 / §6.6 / §8):
//   nice -n 15 node --test tools/test/logistics_lab/logistics.test.mjs
// determinism (same seed -> same events, view events and save slice); custody (items in = racks + in transit + on
// orders + out, every second of a 10-day soak); settlement = wholesale x 0.7 x 1.15 (homes: the price on delivery);
// the racks never draw more than their slots hold and the stock never passes its caps; no dead ends (every order
// ends delivered or cancelled, no vehicle / owner / walker stuck, the dock lane one vehicle at a time, the queue
// within its 7 spots); the chains convert exactly 3 -> 1; a house reaches level 3 only after its 살림살이 was
// delivered; save round trip mid-day (nothing lost, orders resume) + fuzz (never throws, always <= 2 KB); the host
// (call, site, opening, events, the till into the coin counter, toasts); perf per tick.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, makeHost, MAN, GEO, price, SHOPS } from './fake_env.mjs';
import { LgxModel } from '../../../src/city/logistics/model/LgxModel.js';
import { Producer } from '../../../src/city/logistics/model/chains.js';
import { Stock, rackFill, rackUnits } from '../../../src/city/logistics/model/stock.js';
import { orderValue, sum } from '../../../src/city/logistics/model/orders.js';
import { CATS, catOf, FURNITURE, APPLIANCES, isItem } from '../../../src/city/logistics/model/catalog.js';
import { stream } from '../../../src/city/logistics/model/rng.js';
import { LGX_TUNING, lgxTuning } from '../../../src/city/logistics/tuning.js';
import { sanitizeLogistics, LOGISTICS_SLICE } from '../../../src/city/logistics/save.js';
import { LOGISTICS_MODULE } from '../../../src/city/logistics/index.js';
import { lt, LSTR } from '../../../src/city/logistics/strings.js';
import * as layout from '../../../src/city/logistics/layout.js';

const DAY = 600;
const T = LGX_TUNING;

/** a soak with every check of the floor, second by second; returns what it saw */
function soak(o = {}) {
  const E = makeEnv(Object.assign({ seed: 11, producers: true }, o));
  const m = E.model;
  const days = o.days || 10;
  const born = new Map(), ended = new Map(), vehT = new Map(), agentT = new Map();
  const bad = [];
  let maxDock = 0, maxStage = 0, maxAgent = 0, maxOver = 0, ticks = 0, shopN = 0, shopDeliveries = 0;
  const settles = [];
  const emit = m.emit.bind(m);
  m.emit = (ev) => {
    if (ev.t === 'lgx:settle') { const q = m.orderById(ev.id); settles.push({ ev, kind: q.kind, got: Object.assign({}, q.got) }); }
    emit(ev);
  };
  for (let s = 0; s < days * DAY; s++) {
    E.run(1);
    ticks++;
    for (const e of E.events.splice(0)) {
      if (e.t === 'lgx:order') born.set(e.id, E.T);
      if (e.t === 'lgx:delivered' || e.t === 'lgx:cancel') ended.set(e.id, E.T);
      if (e.t === 'lgx:delivered' && e.kind === 'shop') { shopN += e.n; shopDeliveries++; }
    }
    if (m.custody() !== m.acc.in - m.acc.out) bad.push(['custody', s, m.custody(), m.acc.in - m.acc.out]);
    if (m.docks.inZone() > 1) bad.push(['zone', s, m.docks.inZone()]);
    if (m.queue.slots.length > 7) bad.push(['queue', s, m.queue.slots.length]);
    for (const c of CATS) maxOver = Math.max(maxOver, m.stock.total(c) - T.cap[c]);
    for (const v of m.docks.list) {
      if (v.st === 'docked') maxDock = Math.max(maxDock, v.dockT);
      if (v.st !== 'road') { vehT.set(v.id, (vehT.get(v.id) || 0) + 1); maxStage = Math.max(maxStage, vehT.get(v.id)); }
    }
    for (const a of m.queue.agents) if (a.st !== 'road') { agentT.set(a.id, (agentT.get(a.id) || 0) + 1); maxAgent = Math.max(maxAgent, agentT.get(a.id)); }
    if (bad.length > 20) break;
  }
  return { E, m, bad, born, ended, maxDock, maxStage, maxAgent, maxOver, settles, ticks, shopN, shopDeliveries };
}

let SOAK = null;
const big = () => (SOAK = SOAK || soak());

// ================================================================================================== determinism
test('determinism: the same seed gives the same events, view events and save slice; another seed differs', () => {
  const runIt = (seed) => { const E = makeEnv({ seed, producers: true }); E.run(900); return { ev: JSON.stringify(E.events), view: JSON.stringify(E.view), slice: JSON.stringify(E.model.serialize()) }; };
  const a = runIt(5), b = runIt(5), c = runIt(6);
  assert.equal(a.ev, b.ev);
  assert.equal(a.view, b.view);
  assert.equal(a.slice, b.slice);
  assert.notEqual(a.ev, c.ev);
  // seeded streams are independent of each other and of the order they are drawn in
  const s1 = stream(9, 'road'), s2 = stream(9, 'road');
  stream(9, 'orders').next();
  assert.equal(s1.next(), s2.next());
});

// ================================================================================================== the 10-day soak
test('soak (10 days): custody conserved every second, dock lane one at a time, queue <= 7, nothing stuck', () => {
  const S = big();
  assert.deepEqual(S.bad.slice(0, 5), []);
  assert.ok(S.maxDock < 90, 'a vehicle stood docked ' + S.maxDock.toFixed(0) + ' s');
  assert.ok(S.maxStage < 300, 'a vehicle stayed on the stage ' + S.maxStage + ' s');
  assert.ok(S.maxAgent < 300, 'an owner stayed ' + S.maxAgent + ' s');
  // every order older than the give-up time + a round trip ended (delivered or cancelled)
  const endT = S.E.T, late = [];
  for (const [id, t0] of S.born) if (!S.ended.has(id) && endT - t0 > T.orders.giveUpS + 120) late.push(id + ' @' + (endT - t0).toFixed(0));
  assert.deepEqual(late, [], 'orders never finished');
  let maxLife = 0;
  for (const [id, t1] of S.ended) maxLife = Math.max(maxLife, t1 - S.born.get(id));
  assert.ok(maxLife < T.orders.giveUpS + 120, 'an order took ' + maxLife.toFixed(0) + ' s');
  // the centre really works: deliveries every day, every category moved
  const s = S.m.state();
  for (let d = 1; d < 9; d++) assert.ok(s.days[d] > 100, 'day -' + d + ' had ' + s.days[d] + ' deliveries');
  assert.ok(S.m.forklift.pallets.out > 100 && S.m.forklift.pallets.in > 100);
  assert.ok(S.m.made.furniture > 20 && S.m.made.appliance > 10, JSON.stringify(S.m.made));
});

test('soak: the racks never pass their caps (producer piles wait on the pad when there is no room)', () => {
  const S = big();
  assert.ok(S.maxOver <= 0, 'over a cap by ' + S.maxOver);
});

test('settlement: shop / story orders pay wholesale x 0.7 x 1.15, homes the price, all into the till', () => {
  const S = big();
  assert.ok(S.settles.length > 120, 'settlements ' + S.settles.length);
  let coins = 0;
  for (const { ev, kind, got } of S.settles) {
    let v = 0;
    for (const k in got) v += price(k) * got[k];
    const want = Math.round(v * (kind === 'home' ? T.homeRate : T.wholesaleRate * (1 + T.settleBonus)));
    assert.equal(ev.coins, want, ev.id + ' ' + kind);
    assert.equal(ev.coins, orderValue(kind, got, price, T));
    coins += ev.coins;
  }
  assert.equal(coins, S.m.tot.coins);
  assert.ok(Math.abs(T.wholesaleRate * (1 + T.settleBonus) - 0.805) < 1e-9);
});

test('house level 3 only after its 살림살이 (3 furniture + 1 appliance per home) was delivered', () => {
  const E = makeEnv({ seed: 3, producers: true });
  const m = E.model;
  // furniture and appliances on the racks from the start (as if the chains had run a while)
  for (const k of FURNITURE) m.stock.add(k, 6);
  for (const k of APPLIANCES) m.stock.add(k, 4);
  m.acc.in += FURNITURE.length * 6 + APPLIANCES.length * 4;
  const delivered = new Map(), houses = [];
  for (let s = 0; s < 2 * DAY; s++) {
    E.run(1);
    for (const e of E.events.splice(0)) {
      if (e.t === 'lgx:delivered' && e.tag === 'lv3') for (const h of e.to.slice(5).split('+')) delivered.set(h, { T: E.T, items: e.items, homes: e.to.slice(5).split('+').length });
      if (e.t === 'lgx:house') houses.push({ id: e.id, T: E.T });
    }
  }
  assert.ok(houses.length >= 6, 'houses ' + houses.length);
  for (const h of houses) {
    const d = delivered.get(h.id);
    assert.ok(d && d.T <= h.T, h.id + ' level 3 before its delivery');
    const f = FURNITURE.reduce((n, k) => n + (d.items[k] || 0), 0), a = APPLIANCES.reduce((n, k) => n + (d.items[k] || 0), 0);
    assert.ok(f >= T.houseLv3.furniture * d.homes && a >= T.houseLv3.appliance * d.homes, h.id + ' got ' + JSON.stringify(d.items));
  }
  assert.equal(new Set(houses.map((h) => h.id)).size, houses.length, 'a house reached level 3 twice');
  assert.equal(m.happyBonus(), Math.min(T.houseLv3.happyCap, houses.length * T.houseLv3.happy));
});

test('stress: a yard truck every 5 s, shops selling 5x faster, refusing deliveries, the plan placement: bounded, conserved, unstuck', () => {
  for (const o of [{ yardEvery: 5, sellEvery: 0.3 }, { refuse: true, fullShelves: false }, { place: 'plan' }]) {
    const S = soak(Object.assign({ seed: 21, days: 2 }, o));
    assert.deepEqual(S.bad.slice(0, 5), [], JSON.stringify(o));
    assert.ok(S.maxDock < 90 && S.maxStage < 300 && S.maxAgent < 300, JSON.stringify(o) + ' dock ' + S.maxDock + ' stage ' + S.maxStage + ' owner ' + S.maxAgent);
    assert.ok(S.m.docks.list.length <= 12, 'vehicles piled up: ' + S.m.docks.list.length);
    assert.ok(S.m.inboundWaiting() <= T.inbound.maxWaiting);
    assert.ok(S.m.orders.length <= T.orders.max + 4, 'orders piled up: ' + S.m.orders.length);
    if (o.refuse) {
      // refused goods came back to the racks: shop deliveries hand nothing out (custody holds every second above)
      assert.ok(S.shopDeliveries > 5, 'shop deliveries ' + S.shopDeliveries);
      assert.equal(S.shopN, 0);
      assert.ok(S.m.tot.coins > 0, 'owners still settle at the counter');
    }
  }
});

// ================================================================================================== chains
test('chains: 3 planks -> 1 furniture, 3 ingots -> 1 appliance, exactly; a full pile stops the machine', () => {
  for (const kind of ['furniture', 'appliance']) {
    const cfg = Object.assign({ inMax: 30 }, T[kind]);
    const p = new Producer({ id: 'p', kind }, cfg);
    assert.equal(p.feed(100), 30, 'the input pad holds 30');
    let made = 0;
    for (let t = 0; t < 400; t += 0.1) if (p.update(0.1, (list) => list[0])) made++;
    assert.equal(made, cfg.outMax, 'stops at a full pile');
    assert.equal(p.inQ, 30 - 3 * cfg.outMax);
    const pile = p.takeAll();
    assert.equal(sum(pile), cfg.outMax);
    for (let t = 0; t < 400; t += 0.1) if (p.update(0.1, (list) => list[0])) made++;
    assert.equal(made, 10, '30 in -> 10 out');
    assert.equal(p.inQ, 0);
    // a piece in the making is refunded in the save (3 back on the pad)
    p.takeAll(); p.feed(4);
    p.update(0.1, (l) => l[0]);
    assert.ok(p.making);
    assert.equal(p.serialize().inQ, 4);
  }
});

test('chains: a workshop built before the centre opens works; its pile waits for the van (no vehicle, no stock)', () => {
  const E = makeEnv({ seed: 5, open: false, yard: false });
  const m = E.model;
  m.addProducer('furniture', 'early');
  E.run(60);
  const p = m.producers.get('early');
  assert.ok(p.made >= T.furniture.outMax && p.outQ.length === T.furniture.outMax, 'made ' + p.made + ' pile ' + p.outQ.length);
  assert.equal(m.docks.list.length, 0);
  assert.equal(m.stock.all(), 0);
  assert.ok(E.events.some((e) => e.t === 'lgx:produced'));
  m.build(true);
  E.run(120);
  assert.ok(E.events.some((e) => e.t === 'lgx:inbound' || e.t === 'lgx:stock'), 'the pile is fetched once the centre is open');
  assert.ok(FURNITURE.some((k) => m.stock.count(k) > 0) || m.ships.length > 0);
});

test('chains in the model: every plank / ingot fed is made, in progress or waiting (3 : 1), and reaches the racks', () => {
  const E = makeEnv({ seed: 4, producers: true, yard: false });
  const m = E.model;
  let fedP = 0, fedI = 0;
  const pf = m.producers.get('pf'), pa = m.producers.get('pa');
  const ff = pf.feed.bind(pf), fa = pa.feed.bind(pa);
  pf.feed = (n) => { const q = ff(n); fedP += q; return q; };
  pa.feed = (n) => { const q = fa(n); fedI += q; return q; };
  E.run(DAY);
  assert.equal(fedP, pf.made * 3 + pf.inQ + (pf.making ? 3 : 0));
  assert.equal(fedI, pa.made * 3 + pa.inQ + (pa.making ? 3 : 0));
  const furn = FURNITURE.reduce((n, k) => n + m.stock.count(k), 0) + pf.outQ.length + m.ships.reduce((n, s) => n + FURNITURE.reduce((q, k) => q + (s.items[k] || 0), 0), 0);
  const shipped = E.events.filter((e) => e.t === 'lgx:delivered').reduce((n, e) => n + FURNITURE.reduce((q, k) => q + (e.items[k] || 0), 0), 0);
  const onOrders = m.orders.reduce((n, q) => n + FURNITURE.reduce((s, k) => s + (q.got[k] || 0), 0), 0);
  assert.equal(furn + shipped + onOrders, pf.made, 'every piece of furniture accounted for');
  const produced = E.events.filter((e) => e.t === 'lgx:produced');
  assert.equal(produced.filter((e) => e.kind === 'furniture').length, pf.made);
  assert.ok(produced.every((e) => e.n === 1 && (e.kind === 'furniture' || e.kind === 'appliance')));
});

// ================================================================================================== racks
test('racks: rackFill never draws more than the slots hold, follows the level and fills bottom / front first', () => {
  const rng = stream(1, 'racks');
  const catalog = {};
  for (const k of Object.keys(MAN.sprites)) if (MAN.sprites[k].kind === 'item' && isItem(k)) (catalog[catOf(k)] = catalog[catOf(k)] || []).push(k);
  for (let trial = 0; trial < 300; trial++) {
    const st = new Stock(T.cap);
    for (const c of CATS) {
      const list = catalog[c] || [];
      if (!list.length) continue;
      const n = rng.int(T.cap[c] + 1);
      for (let q = 0; q < n; q++) st.add(list[rng.int(list.length)], 1);
    }
    const fill = rackFill(GEO, st);
    for (const c of CATS) {
      const slots = fill.filter((f) => GEO.slots[f.slot].category === c);
      let drawn = 0;
      for (const f of slots) {
        const S = GEO.slots[f.slot];
        for (const s of f.stacks) {
          drawn += s.n;
          assert.ok(f.key && S.itemFit[f.key] >= s.n, 'slot ' + f.slot + ' ' + f.key + ' x' + s.n + ' > fit ' + (S.itemFit || {})[f.key]);
        }
      }
      const units = rackUnits(GEO, c);
      assert.ok(drawn <= units, c + ' draws ' + drawn + ' > ' + units);
      if (st.total(c) === 0) assert.equal(drawn, 0, c + ' empty but drawn');
      else assert.ok(drawn >= 1, c + ' has stock but nothing drawn');
    }
  }
  // fuller racks draw at least as much (monotonic)
  const st = new Stock(T.cap);
  let last = -1;
  for (let n = 0; n <= T.cap.food; n += 8) {
    while (st.total('food') < n) st.add('item_bread', 1);
    const d = rackFill(GEO, st).filter((f) => GEO.slots[f.slot].category === 'food').reduce((s, f) => s + f.stacks.reduce((q, x) => q + x.n, 0), 0);
    assert.ok(d >= last, 'food ' + n + ': ' + d + ' < ' + last);
    last = d;
  }
});

// ================================================================================================== save
test('save: round trip mid-day keeps every item and order; reloaded orders finish; the slice stays <= 2 KB', () => {
  const E = makeEnv({ seed: 8, producers: true });
  E.run(DAY * 1.4);
  const m = E.model;
  const slice = m.serialize();
  const json = JSON.stringify(slice);
  assert.ok(json.length <= LOGISTICS_SLICE.cap, 'slice ' + json.length + ' bytes');
  const clean = sanitizeLogistics(JSON.parse(json));
  assert.deepEqual(clean, JSON.parse(json), 'a fresh slice passes sanitize unchanged');
  const m2 = new LgxModel({ tune: T, geo: GEO, seed: 8, price, saved: clean });
  assert.equal(JSON.stringify(m2.serialize()), json, 'serialize(restore(slice)) === slice');
  assert.equal(m2.custody(), m.custody(), 'no goods lost or made by a reload');
  assert.equal(m2.custody(), m2.acc.in - m2.acc.out);
  // run the reloaded model on: every restored order ends
  const ids = new Set(m2.orders.map((q) => q.id));
  assert.ok(ids.size > 0, 'something was on order');
  const E2 = makeEnv({ seed: 8, producers: false, saved: clean, open: false, T: E.T });
  for (let s = 0; s < DAY; s++) { E2.run(1); for (const e of E2.events.splice(0)) if (e.t === 'lgx:delivered' || e.t === 'lgx:cancel') ids.delete(e.id); if (E2.model.custody() !== E2.model.acc.in - E2.model.acc.out) assert.fail('custody after reload @' + s); }
  assert.deepEqual(Array.from(ids), [], 'restored orders that never finished');
  assert.ok(E2.model.producers.size === 2, 'producers come back from the save');
});

test('save: the slice of a busy centre stays under the cap (oldest unsettled orders go back to the racks)', () => {
  const raw = { v: 1, open: 1, gift: 1, tut: 1, day: 40, seq: 999, stock: {}, orders: [], cash: 123456, chains: [], lv3: [], days: [], made: [99, 88], tot: [5000, 900000, 70000] };
  const keys = Object.keys(MAN.sprites).filter((k) => isItem(k)).map((k) => k.slice(5));
  keys.forEach((k, i) => { raw.stock[k] = 50 + i; });
  for (let i = 0; i < 12; i++) {
    const got = {}, miss = {};
    for (let j = 0; j < 12; j++) { got[keys[(i + j) % keys.length]] = 9; miss[keys[(i * 3 + j) % keys.length]] = 7; }
    raw.orders.push(['o' + i.toString(36) + 'xyz', i % 3 === 0 ? 'home:house_' + i + '+house_' + (i + 1) : 'shop:lot_' + i, (i % 3 === 0 ? 'hc' : 'sv') + 'p' + (i % 2 ? 's' : ''), got, miss]);
  }
  for (let i = 0; i < 6; i++) raw.chains.push({ id: 'prod_' + i, k: i % 2 ? 'a' : 'f', in: 29, out: i % 2 ? ['fridge', 'tv_retro', 'radio'] : ['sofa', 'bed', 'chair'], m: 9999, r: 77 });
  for (let i = 0; i < 40; i++) raw.lv3.push('house_' + i + '_long_name');
  for (let i = 0; i < 10; i++) raw.days.push(1000 + i);
  const before = sum(raw.stock) + raw.orders.reduce((n, r) => n + sum(r[3]), 0);
  const s = sanitizeLogistics(raw);
  const len = JSON.stringify(s).length;
  assert.ok(len <= LOGISTICS_SLICE.cap, len + ' bytes');
  assert.equal(sum(s.stock) + s.orders.reduce((n, r) => n + sum(r[3]), 0), before, 'goods of dropped orders went back to the stock');
});

test('save: sanitize never throws on garbage, the result is <= 2 KB and a model runs on it', () => {
  const rng = stream(77, 'fuzz');
  const junk = () => {
    const pick = rng.int(12);
    if (pick === 0) return null;
    if (pick === 1) return rng.next() * 1e9;
    if (pick === 2) return 'x'.repeat(rng.int(300));
    if (pick === 3) return [rng.next(), 'a', null, {}];
    if (pick === 4) return { __proto__: null, a: 1 };
    if (pick === 5) return -1;
    if (pick === 6) return Infinity;
    if (pick === 7) return NaN;
    if (pick === 8) return { bread: rng.int(1e6), 'item_axe': 3, 'bad key!': 4, can: -5 };
    if (pick === 9) return [['o1', 'shop:a', 'svp', { bread: 3 }, {}], ['o1', 'shop:a', 'svp', { bread: 3 }, {}], ['o2', 'home:h', 'svp', { sofa: 1 }, {}], 'x', ['o3', 'home:h1+h2', 'hcrs3', { sofa: 2, fridge: 1 }, { bed: 1 }]];
    if (pick === 10) return [{ id: 'p', k: 'f', in: 1e9, out: ['sofa', 'fridge', 7], m: -3 }, { id: 'p', k: 'a' }, { id: 'q', k: 'z' }];
    return {};
  };
  const fields = ['v', 'open', 'gift', 'tut', 'day', 'seq', 'stock', 'orders', 'cash', 'chains', 'lv3', 'days', 'made', 'tot'];
  for (let n = 0; n < 400; n++) {
    const raw = n % 50 === 0 ? junk() : {};
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) for (const f of fields) if (rng.next() < 0.6) raw[f] = junk();
    let s;
    assert.doesNotThrow(() => { s = sanitizeLogistics(raw); });
    if (!s) continue;
    assert.ok(JSON.stringify(s).length <= LOGISTICS_SLICE.cap);
    assert.equal(JSON.stringify(sanitizeLogistics(s)), JSON.stringify(s), 'sanitize is idempotent');
    if (n % 20 === 0) {
      const m = new LgxModel({ tune: T, geo: GEO, seed: n + 1, price, saved: s });
      for (let k = 0; k < 600; k++) m.update(1 / 10, 1800 + k / 10, { shops: [], homes: [] });
      assert.equal(m.custody(), m.acc.in - m.acc.out);
    }
  }
  assert.equal(sanitizeLogistics(undefined), null);
  assert.equal(sanitizeLogistics('nope'), null);
  assert.equal(sanitizeLogistics([1, 2]), null);
});

// ================================================================================================== host
test('host: the call (letter + site), the opening, module events, the till into the coin counter, toasts', () => {
  const H = makeHost({ seed: 2 });
  assert.equal(H.host.api.open(), false);
  H.run(1);
  assert.equal(H.out.sites.length, 1, 'the site is offered once');
  const site = H.out.sites[0];
  assert.equal(site.id, 'lgx_centre');
  assert.deepEqual(site.cost, { coins: T.centre.coins, item_plank: T.centre.item_plank, item_ingot: T.centre.item_ingot });
  assert.ok(H.out.toasts[0] === lt('ko', 'letter'));
  H.run(5);
  assert.equal(H.out.sites.length, 1);
  H.host.onFeed({ t: 'built', siteId: 'lgx_centre' });
  assert.equal(H.host.api.open(), true);
  assert.ok(H.out.banners[0].startsWith(lt('ko', 'opened')));
  // the opening gift is on the racks
  for (const [k, n] of Object.entries(T.openGift)) assert.equal(H.host.api.stock(k), n, 'gift ' + k);
  H.host.api.addProducer('furniture', 'pf');
  H.host.api.addProducer('appliance', 'pa');
  H.run(DAY);
  const kinds = new Set(H.out.emits.map((e) => e.t));
  for (const k of ['lgx:call', 'lgx:open', 'lgx:producer', 'lgx:inbound', 'lgx:order', 'lgx:stock', 'lgx:settle', 'lgx:dispatch', 'lgx:delivered', 'lgx:produced']) assert.ok(kinds.has(k), 'no ' + k);
  // missions: lgx:settle (count 1) and lgx:produced { kind, n }
  const st = H.out.emits.find((e) => e.t === 'lgx:settle' && e.kind !== 'home');
  assert.ok(st.coins > 0 && st.id && st.shop);
  const pr = H.out.emits.find((e) => e.t === 'lgx:produced');
  assert.ok((pr.kind === 'furniture' || pr.kind === 'appliance') && pr.n === 1);
  // the till: every settled coin reaches the coin counter (or still waits in the till)
  assert.equal(H.out.coins + Math.floor(H.host.model.cash) + (H.host.model.cash % 1), H.host.model.tot.coins);
  assert.ok(H.out.coins > 0);
  const names = SHOPS.map((x) => x.name).concat(['가게']);
  assert.equal(H.out.toasts.filter((m) => names.some((nm) => m === lt('ko', 'firstSettle', { shop: nm }))).length, 1, 'one first-settle toast: ' + H.out.toasts.join(' | '));
  assert.equal(H.host.api.deliveriesToday(), H.host.model.days[0]);
  assert.ok(H.host.api.places().logistics_office.x > 0);
  // the save slice through the host
  const s = H.host.serialize();
  assert.ok(JSON.stringify(s).length <= LOGISTICS_SLICE.cap);
});

test('host: story pick-ups and move-ins become orders; api.order / settle; a reload keeps the centre open', () => {
  const H = makeHost({ seed: 9, saved: { v: 1, open: 1, gift: 1, stock: { bread: 40, can: 30, sofa: 6, bed: 4, table: 6, chair: 6, fridge: 4, radio: 3 }, orders: [] } });
  assert.equal(H.host.api.open(), true);
  assert.equal(H.out.sites.length, 0);
  H.run(2);
  assert.equal(H.out.sites.length, 0, 'no site for an open centre');
  H.host.onFeed({ t: 'story:shop', op: 'pickup', shop: 'r12', owner: 12, items: ['item_bread', 'item_can'], qty: 5 });
  H.host.onFeed({ t: 'story:move', op: 'in', home: 'house_77', name: '김씨네' });
  H.run(10);
  const orders = H.host.model.orders.map((q) => q.to);
  assert.ok(orders.includes('story:r12'), JSON.stringify(orders));
  assert.ok(orders.includes('home:house_77'), JSON.stringify(orders));
  assert.equal(H.host.api.serves('lotB5', 'item_bread'), true);
  assert.equal(H.host.api.serves('lotB5', 'item_bow'), false);
  const id = H.host.api.order('lotB5', { item_bread: 4 });
  assert.ok(id);
  assert.equal(H.host.api.settle(id), 0, 'nothing to settle before the goods are picked');
  for (let k = 0; k < 200 && H.host.model.orderById(id).st === 'pick'; k++) H.run(0.5);
  assert.equal(H.host.api.settle(id), Math.round(4 * price('item_bread') * 0.805));
  assert.equal(H.host.api.settle(id), 0, 'settled once');
  H.run(DAY);
  assert.ok(H.out.toasts.includes(lt('ko', 'moveIn')), 'move-in toast');
  // the module's MODULE entry: gate, sanitize, save key
  assert.equal(LOGISTICS_MODULE.saveKey, 'logistics');
  assert.equal(LOGISTICS_MODULE.capBytes, LOGISTICS_SLICE.cap);
  assert.equal(LOGISTICS_MODULE.gate({ later: { beach: { star: () => 1 } } }), false);
  assert.equal(LOGISTICS_MODULE.gate({ later: { beach: { star: () => 2 } } }), true);
  assert.equal(LOGISTICS_MODULE.gate({}), false);
});

test('host: no manifest -> no model, nothing throws; strings exist in Korean and English', () => {
  const ports = { clock: { T: () => 0 } };
  const H = new (makeHost({}).host.constructor)(ports, null, {});
  assert.doesNotThrow(() => { H.update(0.1); H.onFeed({ t: 'built', siteId: 'lgx_centre' }); });
  assert.equal(H.api.open(), false);
  assert.equal(H.api.stock('food'), 0);
  for (const k of Object.keys(LSTR)) {
    assert.ok(LSTR[k].ko && LSTR[k].en, 'both languages for ' + k);
    if (Array.isArray(LSTR[k].ko)) assert.equal(LSTR[k].ko.length, LSTR[k].en.length, k);
  }
  for (const c of CATS) assert.ok(LSTR.cats.ko[c] && LSTR.cats.en[c]);
  assert.equal(lgxTuning({ v8: { logistics: { pallet: 9 } } }).pallet, 9);
  assert.equal(lgxTuning(null).pallet, T.pallet);
});

// ================================================================================================== layout
test('layout: the street, lanes, kerb stops and walks lie on the new streets; routes start and end off the stage', () => {
  const st = (id) => layout.STREETS.find((s) => s.id === id);
  const onStreet = (p, pad = 0.05) => layout.STREETS.some((s) => { const [i, j] = layout.px2L(p[0] + layout.ANCHOR[0], p[1] + layout.ANCHOR[1]); return i >= s.i[0] - pad && i <= s.i[1] + pad && j >= s.j[0] - pad && j <= s.j[1] + pad; });
  assert.ok(st('lgx_st') && st('lgx_dock') && st('ave_c'));
  for (const fam of ['delivery_van', 'truck_cargo']) for (const bay of [1, 2]) {
    const R = GEO.routes[fam + ':' + bay];
    assert.ok(R.in.length > 2 && R.out.length > 2);
    assert.ok(onStreet(R.in[0].p), fam + bay + ' starts on a street');
    assert.ok(onStreet(R.out[R.out.length - 1].p), fam + bay + ' leaves on a street');
    for (const L of R.in.concat(R.out).slice(0, -1)) if (L.tag) assert.ok(onStreet(L.p), 'kerb stop ' + L.tag + ' on a street');
  }
  // producers on village M plots are off the stage (no kerb stop); one beside lgx_st on the van's way in gets one,
  // never west of the stage edge (that would be a wrong-way drive) nor past the dock lane
  const H = makeHost({}).host;
  for (const s of Object.values(layout.PRODUCER_SPOTS)) assert.equal(H.stageCurb(s.x, s.y), null);
  const D = layout.layoutFor(), CR = D.CURB_RANGE;
  const near = layout.L((CR.i0 + CR.i1) / 2, D.F - 0.8);
  const c = H.stageCurb(near[0], near[1]);
  assert.ok(c && onStreet(c), 'kerb stop for a producer beside the street');
  for (const i of [CR.i0 - 0.5, CR.i1 + 0.5, D.W - 2, D.E + 8]) { const p = layout.L(i, D.F - 0.8); assert.equal(H.stageCurb(p[0], p[1]), null, 'kerb at i ' + i); }
  assert.deepEqual(layout.worldV8Logistics().anchor, layout.ANCHOR);
  // placement A (default) keeps the dock apron and lane out of the v6 south sea (i > 55, j < -12): the lane's east
  // kerb is 0.47 cells inside the quay wall (a quay road; the 0.72-cell walk margin is for people, not vans); the
  // plan's spot does not (the reason for A)
  const sea = (i, j) => i > 55 && j < -12;
  for (const [key, ok] of [['A', true], ['plan', false]]) {
    const Lk = layout.layoutFor(key);
    const dock = Lk.STREETS.find((q) => q.id === 'lgx_dock'), st = Lk.STREETS.find((q) => q.id === 'lgx_st');
    const apronE = Lk.E + 4.14;     // a docked truck's nose (5.5 m long at E + 2.19)
    const wet = sea(dock.i[1] + 0.3, dock.j[0]) || sea(st.i[1] + 0.3, st.j[0]) || sea(apronE, Lk.F + 1);
    assert.equal(!wet, ok, key + (ok ? ' should be dry' : ' should touch the sea'));
  }
});

// ================================================================================================== perf
test('perf: the model costs < 0.08 ms per 30 Hz tick on average (busy centre, both producers)', () => {
  const E = makeEnv({ seed: 12, producers: true });
  E.run(DAY);                                  // warm: busy floor
  const m = E.model, env = E.env, dt = 1 / 30;
  const times = [];
  let T0 = E.T;
  for (let i = 0; i < 18000; i++) {
    T0 += dt;
    E.sim.tick(dt, { open: () => m.open, inbound: (it, from) => m.inbound(it, from), producers: () => Array.from(m.producers.values()), feedProducer: (id, n) => m.feedProducer(id, n) });
    const a = performance.now();
    m.update(dt, T0, env);
    times.push(performance.now() - a);
    m.drain(); m.drainView();
  }
  times.sort((a, b) => a - b);
  const avg = times.reduce((s, x) => s + x, 0) / times.length;
  const p99 = times[Math.floor(times.length * 0.99)];
  console.log('# logistics model per tick: avg ' + avg.toFixed(4) + ' ms, p99 ' + p99.toFixed(4) + ' ms, max ' + times[times.length - 1].toFixed(3) + ' ms (18000 ticks)');
  assert.ok(avg < 0.08, 'avg ' + avg);
  assert.ok(p99 < 0.5, 'p99 ' + p99);
  const S = big();
  console.log('# soak: deliveries/day ' + S.m.days.slice(1, 9).join(' ') + ' | max docked ' + S.maxDock.toFixed(0) + ' s, max on stage ' + S.maxStage + ' s, max owner ' + S.maxAgent + ' s | slice ' + JSON.stringify(S.m.serialize()).length + ' B');
});

void SHOPS;
