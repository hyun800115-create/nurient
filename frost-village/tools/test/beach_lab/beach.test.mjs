// beach_runtime Node tests (docs/v5_v8_plan.md §6.5 Tests):
//   nice -n 15 node --test tools/test/beach_lab/beach.test.mjs
// layout on the lattice (no overlaps, on land, in the regions, off the street), slot capacity never exceeded,
// every activity's dirs have frames (read from the manifests), the beachfolk rules (canPlay / pickAnim: nobody in the
// water with a land anim), hotel occupancy and stays bounded, crowd conserved, founding board order, events never
// overlap a ceremony slot, happenings on the happening slot, no dead ends from a fresh save to ★3, determinism, save
// round trip + 200 fuzzed slices, perf per tick.

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeHost, run, openAll, manifests, looks } from './env.mjs';
import { BUILDINGS, PROPS, GATE, STREETS, L, px2L, waterJ, seaAt, buoyTiles, boardwalkTiles, BOATS, REGION, CLEANUP, PLACES, placePos, polarSpot, SWIM, landPoly } from '../../../src/beach/layout.js';
import { ACTS, WATER_ANIMS, SIT_DIRS } from '../../../src/beach/model/activities.js';
import { sanitizeBeach, fitBeach, BEACH_SLICE } from '../../../src/beach/save.js';
import { BEACH_TUNING, STEPS } from '../../../src/beach/tuning.js';
import { LocalStage } from '../../../src/beach/model/stage.js';
import { BEACH_HAPPENINGS } from '../../../src/beach/model/events.js';
import { Rng } from '../../../src/beach/model/rng.js';
import { hourOf } from '../../../src/beach/model/time.js';
import { shoreY } from '../../../src/data/world.js';

const MIRROR = { SW: 'SE', W: 'E', NW: 'NE' };
const S2 = Math.SQRT2;

// ---------------------------------------------------------------------------------------------- layout
function rectOf(o, defs, m = 0) {
  const d = defs[o.key];
  const f = d && d.footprintM;
  let X = 0.6, Y = 0.6;
  if (Array.isArray(f)) { X = f[0]; Y = f[1]; } else if (f && f.radius) { X = Y = f.radius * 2; }
  const hx = X / 2 / S2 + m, hy = Y / 2 / S2 + m;
  return [o.i - hx, o.i + hx, o.j - hy, o.j + hy];
}
const overlap = (A, B) => A[0] < B[1] && B[0] < A[1] && A[2] < B[3] && B[2] < A[3];

test('layout: buildings and props do not overlap, stand on land, inside the regions, off the street', () => {
  const { defs } = manifests();
  const solid = BUILDINGS.concat([GATE]).concat(PROPS.filter((p) => p.layer === 'sprite' && !/^(grass|star)_/.test(p.id) && p.key !== 'beach_lamp'));
  const probs = [];
  for (let a = 0; a < solid.length; a++) {
    for (let b = a + 1; b < solid.length; b++) {
      const A = solid[a], B = solid[b];
      if ((A.id === 'net' && B.id === 'court') || (A.court && B.court) || (A.chain && A.chain === B.chain)) continue;
      if (overlap(rectOf(A, defs, 0.05), rectOf(B, defs, 0.05))) probs.push(A.id + ' overlaps ' + B.id);
    }
    const R = rectOf(solid[a], defs);
    for (const [i, j] of [[R[0], R[2]], [R[1], R[2]], [R[0], R[3]], [R[1], R[3]]]) {
      if (seaAt(i, j)) probs.push(solid[a].id + ' in the sea at ' + i.toFixed(2) + ',' + j.toFixed(2));
      const [x, y] = L(i, j);
      const inAny = (px, py) => Object.values(REGION).some((r) => px >= r[0] && px <= r[2] && py >= r[1] && py <= r[3]);
      const inReg = [[0, 0], [46, 0], [-46, 0], [0, 46], [0, -46]].every(([dx, dy]) => inAny(x + dx, y + dy));    // the plan's checker: union, 46 px inset
      if (!inReg) probs.push(solid[a].id + ' outside the regions at ' + Math.round(x) + ',' + Math.round(y));
    }
    for (const s of STREETS) if (overlap(R, [s.i[0], s.i[1], s.j[0], s.j[1]])) probs.push(solid[a].id + ' on ' + s.id);
    if (R[2] < 0.75 && R[3] > -0.75) probs.push(solid[a].id + ' on the rail ballast');
  }
  // the north (village) sea stays far away
  for (const o of solid) { const [x, y] = L(o.i, o.j); assert.ok(y > shoreY(x) + 60, o.id + ' near the north sea'); }
  assert.deepEqual(probs, []);
});

test('layout: water-plane things are in the sea, the boardwalk and the beach on land', () => {
  for (const t of buoyTiles()) assert.ok(seaAt(t.i, t.j), 'buoy ' + t.i);
  for (const t of boardwalkTiles()) assert.ok(!seaAt(t.i, t.j), 'boardwalk ' + t.i);
  for (const k in BOATS) for (const [i, j] of BOATS[k].loop) assert.ok(seaAt(i, j) && j < -21.4, 'boat loop ' + k + ' ' + i + ',' + j);
  for (const p of PROPS) if (p.layer === 'water') assert.ok(seaAt(p.i, p.j), p.id + ' must float'); else assert.ok(!seaAt(p.i, p.j), p.id + ' must be on land');
  for (const [i, j] of CLEANUP) assert.ok(!seaAt(i, j) && j < -13.6, 'clean-up bit on the sand');
  for (const k in PLACES) assert.ok(!seaAt(PLACES[k].i, PLACES[k].j), 'place ' + k);
  const p = polarSpot();
  assert.ok(p.y > shoreY(p.x) + 40, 'the polar-bear crowd stands on our snow');
  assert.ok(landPoly().length > 100);
  // the world bottom (v7 height 5888) leaves sea in front of every boat
  for (const k in BOATS) for (const [i, j] of BOATS[k].loop) assert.ok(L(i, j)[1] < 5888 - 60, 'boat loop ' + k + ' too far south');
});

// ---------------------------------------------------------------------------------------------- slots and dirs
test('slots: every activity dir has frames in the anim played there (manifests)', () => {
  const env = makeHost();
  const { merged } = manifests();
  const T = merged.townfolk;
  const has = (anim, dir) => { const a = T.anims[anim]; return !!a && (a.dirs.includes(dir) || a.dirs.includes(MIRROR[dir])); };
  const animOf = { lie: 'sunbathe', poolLie: 'sunbathe', sit: 'sit', dig: 'dig', swim: 'swim', pool: 'swim', splash: 'splash_play', surf: 'surf', 'queue:cart': 'idle', 'queue:shop': 'idle',
    shower: 'idle', view: 'idle', kite: 'idle', photo: 'wave', balcony: 'idle', raft: 'idle' };
  const bad = [];
  for (const s of env.host.model.slots.list) {
    const anim = animOf[s.kind];
    if (s.kind === 'ball') { for (const a of ['ball_throw', 'ball_catch']) if (!has(a, s.dir)) bad.push(s.id + ' ' + a + ' ' + s.dir); continue; }
    if (!anim) { bad.push('no anim for ' + s.kind); continue; }
    if (!has(anim, s.dir)) bad.push(s.id + ' ' + anim + ' ' + s.dir);
    if (s.kind === 'swim' || s.kind === 'pool') for (const d of ['SW', 'S', 'SE', 'E', 'NE']) if (!has('swim', d) || !has('float', d === 'NE' ? 'E' : d)) bad.push('swim dir ' + d);
  }
  for (const d of SIT_DIRS) assert.ok(has('sit', d), 'sit ' + d);
  assert.deepEqual(bad, []);
  // lying spots use the FEET direction (the beachfolk rule): towels / loungers SW or SE
  for (const s of env.host.model.slots.of('lie')) assert.ok(['SW', 'SE'].includes(s.dir), s.id + ' feet ' + s.dir);
});

test('slots: capacity never exceeded, exclusive props, nobody in the water with a land anim (busy day)', () => {
  const env = makeHost({ seed: 11 });
  openAll(env, { shops: 7 });
  const m = env.host.model;
  env.P.T = 600 * 3 + 25 * 9;
  let maxSwim = 0, maxLie = 0, maxP = 0, err = null;
  run(env, 600, 1 / 20, () => {
    const c = m.crowd;
    maxP = Math.max(maxP, c.present()); maxSwim = Math.max(maxSwim, c.inWater()); maxLie = Math.max(maxLie, c.lying());
    if (!err) err = c.check();
    if (!err) for (const v of c.list) if (v.mode === 'act' && v.act && ACTS[v.act.kind] && ACTS[v.act.kind].water && !WATER_ANIMS.has(v.anim)) err = 'land anim in water ' + v.anim;
    if (!err) for (const v of c.list) if (v.mode === 'act' && v.act && v.act.kind !== 'stroll' && v.act.kind !== 'gaze' && v.act.kind !== 'volley' && v.act.kind !== 'icecream' && !v.slot) err = 'act without slot ' + v.act.kind;
  });
  assert.equal(err, null);
  const L0 = BEACH_TUNING.live;
  assert.ok(maxP <= L0.present && maxP >= 30, 'present ' + maxP);
  assert.ok(maxSwim <= L0.swimmers + 2, 'swimmers ' + maxSwim);        // +2: a pair entering together after the check
  assert.ok(maxLie <= L0.sunbathers, 'sunbathers ' + maxLie);
});

test('beachfolk rules: ring wearers float instead of swimming, never dig / sunbathe; picked water anims stay water anims', () => {
  const lk = looks(), R = new Rng(5);
  let rings = 0;
  for (let k = 0; k < 400; k++) {
    const p = lk.make('swimmer', R);
    const sw = lk.pickAnim(p, 'swim');
    assert.ok(WATER_ANIMS.has(sw), 'swim -> ' + sw);
    if (p.parts.includes('swim_ring_worn')) { rings++; assert.equal(sw, 'float'); assert.equal(lk.canPlay(p, 'dig'), false); assert.equal(lk.canPlay(p, 'sunbathe'), false); }
  }
  assert.ok(rings > 10, 'ring wearers seen ' + rings);
  // the crowd model skips acts the person cannot play
  const env = makeHost({ seed: 3 });
  openAll(env, { shops: 7 });
  const m = env.host.model;
  env.P.T = 600 * 3 + 25 * 10;
  let bad = null;
  run(env, 300, 1 / 10, () => { for (const v of m.crowd.list) if (v.mode === 'act' && v.act && (v.act.kind === 'dig' || v.act.kind === 'sunbathe') && !lk.canPlay(v.person, v.anim)) bad = v.act.kind + ' ' + v.anim; });
  assert.equal(bad, null);
});

// ---------------------------------------------------------------------------------------------- resort
test('hotel: occupancy bounded by rooms, stays 2 game days, spends only for booked rooms', () => {
  const env = makeHost({ seed: 21 });
  openAll(env, { shops: 7, until: 'hotel' });
  const m = env.host.model;
  assert.equal(m.hotel().rooms, 12);
  for (let k = 0; k < 30; k++) { m.onFerry(30, env.P.T); assert.ok(m.resort.roomsBooked() <= m.resort.rooms()); }
  assert.equal(m.resort.roomsBooked(), 12);
  const day0 = Math.floor(env.P.T / 600);
  const guests = m.resort.hotel.guests.map((g) => g.slice());
  assert.ok(guests.every((g) => g[1] === day0 + 2));
  const coins0 = env.P.rec.coinsBy['beach:hotel'] || 0;
  env.P.T = (day0 + 1) * 600 + 25 * 9.2; env.host.update(0.3);
  const spent = (env.P.rec.coinsBy['beach:hotel'] || 0) - coins0;
  const [a, b] = BEACH_TUNING.hotel.spendPerDay;
  assert.ok(spent >= 12 * a && spent <= 12 * b, 'spent ' + spent);
  env.P.T = (day0 + 2) * 600 + 25 * 10.5; env.host.update(0.3);
  assert.equal(m.resort.roomsBooked(), 0, 'checked out on day +2');
  // upgrades: 12 -> 20 -> 32
  openAll(env, { shops: 7 });
  assert.equal(m.hotel().rooms, 32);
});

test('founding board: one card at a time, in the tuning order; deliveries fill it; the shop opens after buildTime', () => {
  const env = makeHost({ seed: 4 });
  openAll(env, { until: 'lifeguard' });
  const m = env.host.model, api = env.host.api;
  run(env, 11);
  assert.ok(m.stepDone('board'));
  const order = [];
  for (let k = 0; k < 7; k++) {
    const c = api.card();
    assert.ok(c.shop, 'a card is up');
    order.push(c.shop);
    const need = c.need;
    const half = {}; for (const it in need) half[it] = Math.ceil(need[it] / 2);
    api.deliverCard(half);
    assert.equal(api.card().shop, c.shop, 'half a card stays up');
    const took = api.deliverCard(Object.assign({}, need, { item_bogus: 5 }));
    assert.ok(!took.item_bogus, 'only what the card asks for');
    assert.equal(api.card().shop, null, 'no new card while building');
    run(env, BEACH_TUNING.founding.buildTime + 1);
    assert.ok(m.resort.isOpen(c.shop), c.shop + ' opened');
  }
  assert.deepEqual(order, BEACH_TUNING.founding.order);
  assert.equal(api.card().shop, null);
});

test('shops: sales empty the shelves, a restock asks for village goods and pays wholesale × (1 + bonus)', () => {
  const env = makeHost({ seed: 8 });
  openAll(env, { shops: 7 });
  const m = env.host.model;
  const st = m.resort.stock.seafood_bbq;
  for (let k = 0; k < 30; k++) m.resort.sell('seafood_bbq', { id: 9000 + k }, env.P.T + k);
  env.host.drain();
  assert.ok(st.item_fish_cooked + st.item_meat_cooked < 40 - 25);
  assert.ok(env.host.restocks.some((r) => r.id === 'seafood_bbq'), 'restock asked');
  const before = env.P.rec.coinsBy['beach:wholesale'] || 0;
  run(env, 20);
  const got = (env.P.rec.coinsBy['beach:wholesale'] || 0) - before;
  assert.ok(got > 0, 'wholesale paid');
  assert.ok(st.item_fish_cooked + st.item_meat_cooked >= 30, 'shelves refilled ' + JSON.stringify(st));
  // 70 % of the price × 1.3
  const r = m.resort, coins = r.deliver('seafood_bbq', { item_fish_cooked: 0 }, env.P.T);
  assert.equal(coins, 0);
});

test('stars: ★1 at the lifeguard, ★2 with 5 shops + hotel, ★3 with 7 shops + pool + aquarium (then the festival week)', () => {
  const env = makeHost({ seed: 2 });
  const m = env.host.model;
  openAll(env, { until: 'lifeguard' });
  assert.equal(m.stars, 1);
  run(env, 11);
  for (const id of BEACH_TUNING.founding.order.slice(0, 5)) m.shopOpened(id, env.P.T);
  assert.equal(m.stars, 1);
  env.host.built('b_step_hotel');
  assert.equal(m.stars, 2);
  env.host.built('b_step_pool'); env.host.built('b_step_aquarium');
  assert.equal(m.stars, 2);
  for (const id of BEACH_TUNING.founding.order) m.shopOpened(id, env.P.T);
  run(env, 1);
  assert.equal(m.stars, 3);
  assert.ok(m.events.week, 'festival week started');
  assert.ok(env.P.rec.events.some((e) => e.t === 'beach:star' && e.n === 3));
});

// ---------------------------------------------------------------------------------------------- progression
test('no dead ends: from a fresh save the next step is always reachable until the end', () => {
  const env = makeHost({ seed: 31, callAfter: 1 });
  const m = env.host.model, P = env.P;
  run(env, 2);
  assert.ok(P.rec.sites.some((s) => s.id === 'b_step_path'), 'the road is offered after the call');
  let guard = 0;
  while (m.nextStep() !== null || m.resort.shops.size < 7) {
    if (++guard > 200) assert.fail('stuck at ' + m.nextStep() + ' shops ' + m.resort.shops.size);
    const s = m.nextStep();
    if (s === 'reveal') { P.cx = L(89, -9)[0]; P.cy = L(89, -9)[1]; run(env, 0.5); continue; }
    if (s === 'cleanup') { for (const b of m.cleanupBits()) { P.cx = b.x; P.cy = b.y; run(env, 0.3); } continue; }
    if (s === 'board') { run(env, 2); continue; }
    if (s === null || (s === 'hotel' && m.resort.shops.size < 7)) {
      const c = env.host.api.card();
      if (c.shop) { env.host.api.deliverCard(c.need); run(env, 26); continue; }
      if (s === null) { run(env, 2); continue; }
    }
    const offered = P.rec.sites.filter((x) => x.id === 'b_step_' + s);
    assert.ok(offered.length, s + ' was offered');
    assert.ok(env.host.built('b_step_' + s), s + ' builds');
  }
  assert.equal(m.stars, 3);
  assert.deepEqual(Object.keys(m.steps).sort(), STEPS.slice().sort());
  // the beach was revealed by walking and the bits were picked by walking
  assert.ok(P.rec.events.some((e) => e.t === 'beach:step' && e.step === 'reveal'));
  assert.equal(P.rec.events.filter((e) => e.t === 'beach:clean').length, CLEANUP.length);
});

// ---------------------------------------------------------------------------------------------- events and happenings
test('events never overlap a ceremony slot; happenings never run during one', () => {
  const stage = new LocalStage();
  const env = makeHost({ seed: 41, stage });
  openAll(env, { shops: 7 });
  const m = env.host.model, api = env.host.api;
  const R = new Rng(99);
  let overlaps = 0, ran = { contest: 0, fireworks: 0, polar: 0 }, happen = 0, busyHits = 0;
  env.P.T = 600 * 4 + 25 * 9;
  const asked = [];
  run(env, 600 * 2, 1 / 10, (k) => {
    // a wedding elsewhere grabs the ceremony slot now and then
    if (k % 50 === 0 && !stage.busy('ceremony') && R.chance(0.25)) { stage.request({ kind: 'wedding' }); stage.wedUntil = env.P.T + 30; }
    if (stage.wedUntil && env.P.T >= stage.wedUntil) { stage.end('wedding'); stage.wedUntil = 0; }
    if (k % 300 === 0) for (const kind of ['contest', 'polar', 'fireworks']) asked.push(api.event(kind));
    const a = m.events.active;
    if (a && stage.active.ceremony && stage.active.ceremony.kind !== a.kind) overlaps++;
    if (m.events.happening && stage.active.ceremony) busyHits++;
    if (m.events.happening) happen = Math.max(happen, 1);
  });
  for (const e of env.P.rec.events) if (e.t === 'beach:event' && e.op === 'start' && ran[e.kind] !== undefined) ran[e.kind]++;
  assert.equal(overlaps, 0);
  assert.equal(busyHits, 0);
  assert.ok(ran.contest >= 1 && ran.fireworks >= 1 && ran.polar >= 1, JSON.stringify(ran));
  const res = await_all(asked);
  void res;
});
function await_all(ps) { return Promise.allSettled(ps); }

test('contest: six kids dig at the three castles, the castles grow a stage every 20 s, a winner is picked', async () => {
  const env = makeHost({ seed: 51 });
  openAll(env, { shops: 7 });
  const m = env.host.model, api = env.host.api;
  env.P.T = 600 * 2 + 25 * 11;
  const p = api.event('contest');
  run(env, 8);
  const a = m.events.active;
  assert.ok(a && a.kind === 'contest');
  assert.ok(a.data.kids.length >= 4, 'kids ' + a.data.kids.length);
  run(env, Math.max(1, a.data.judgeAt - env.P.T + 2));
  assert.equal(a.phase, 'judge');
  for (const c of a.data.castles) assert.ok(m.castles[c].stage >= 2, c + ' stage ' + m.castles[c].stage);
  api.pick('castle_2');
  run(env, 12);
  const r = await p;
  assert.equal(r.ok, true); assert.equal(r.winner, 'castle_2');
});

test('fireworks start at 21:00; the polar swim needs the swimwear shop; each happening uses the happening slot', async () => {
  const env = makeHost({ seed: 61 });
  openAll(env, { shops: 5 });
  const m = env.host.model, api = env.host.api;
  env.P.T = 600 * 2 + 25 * 15;
  const f = api.event('fireworks');
  run(env, 25 * 6.1, 1 / 5);
  assert.ok(m.events.active && m.events.active.kind === 'fireworks');
  assert.ok(Math.abs(hourOf(m.events.active.t0) - 21) < 0.05, 'at ' + hourOf(m.events.active.t0));
  run(env, 45, 1 / 5);
  assert.equal((await f).ok, true);
  const pol = await api.event('polar');
  assert.equal(pol.ok, false); assert.equal(pol.why, 'swimwear');
  m.shopOpened('swimwear_shop', env.P.T);
  // happenings
  env.P.T = 600 * 4 + 25 * 11;
  run(env, 120, 1 / 10);
  for (const h of BEACH_HAPPENINGS) {
    run(env, 30, 1 / 10);
    if (!m.happeningReady(h.id)) continue;
    const ok = api.happening(h.id);
    assert.ok(ok, h.id + ' started');
    assert.equal(m.events.happening.h.id, h.id);
    assert.equal(m.stage.active.happening.kind, 'happening');
    run(env, h.secs + 1, 1 / 10);
    assert.equal(m.events.happening, null, h.id + ' ended');
  }
});

test('P12: the chief standing in the flying parasol’s path catches it (+2 fame)', () => {
  const env = makeHost({ seed: 71 });
  openAll(env, { shops: 7 });
  const m = env.host.model;
  env.P.T = 600 * 2 + 25 * 12;
  assert.ok(env.host.api.happening('P12'));
  const d = m.events.happening.data;
  const mid = m.parasolAt(d, (d.liftAt + d.landAt) / 2);
  env.P.cx = mid.x; env.P.cy = mid.y + 30;
  run(env, 8, 1 / 20);
  assert.ok(env.P.rec.events.some((e) => e.t === 'beach:happening' && e.op === 'catch' && e.fame === 2));
});

test('lifeguard: whistles at swimmers past the buoys, at most once per whistleGap', () => {
  const env = makeHost({ seed: 81 });
  openAll(env, { shops: 7 });
  env.P.T = 600 * 5 + 25 * 10;
  run(env, 1200, 1 / 10);         // two beach days (swimmers are out ~10:00–17:00 only)
  const ws = env.P.rec.events.filter((e) => e.t === 'beach:whistle').map((e) => e.at);
  assert.ok(ws.length >= 2, 'whistles ' + ws.length);
  for (let k = 1; k < ws.length; k++) assert.ok(ws[k] - ws[k - 1] >= BEACH_TUNING.lifeguard.whistleGap - 1e-6);
});

// ---------------------------------------------------------------------------------------------- determinism, saves, perf
function trace(seed) {
  const env = makeHost({ seed });
  openAll(env, { shops: 7 });
  env.P.T = 600 * 3 + 25 * 9.5;
  const out = [];
  run(env, 300, 1 / 30, (k) => { if (k % 90 === 0) for (const v of env.host.model.crowd.list) { const p = env.host.model.crowd.posAt(v, env.P.T); out.push(v.id, Math.round(p.x), Math.round(p.y), p.anim); } });
  return { out, events: env.P.rec.events.map((e) => e.t + (e.vid || '') + (e.n || '')).join('|') };
}
test('determinism: the same seed replays the same beach day; another seed does not', () => {
  const a = trace(5), b = trace(5), c = trace(6);
  assert.deepEqual(a.out, b.out);
  assert.equal(a.events, b.events);
  assert.notDeepEqual(a.out, c.out);
});

test('save: round trip keeps the beach; ≤ 2 KB; 200 fuzzed slices never throw and stay sane', () => {
  const env = makeHost({ seed: 91 });
  openAll(env, { shops: 7 });
  env.P.T = 600 * 3 + 25 * 12;
  env.host.model.onFerry(40, env.P.T);
  run(env, 200, 1 / 10);
  const s1 = env.host.serialize();
  assert.ok(JSON.stringify(s1).length <= BEACH_SLICE.cap);
  const env2 = makeHost({ seed: 91, saved: JSON.parse(JSON.stringify(s1)), T: env.P.T });
  const s2 = env2.host.serialize();
  assert.deepEqual(s2.steps, s1.steps); assert.deepEqual(s2.hotel, s1.hotel); assert.deepEqual(s2.shops, s1.shops); assert.deepEqual(s2.stars, s1.stars);
  assert.equal(env2.host.model.stars, 3);
  assert.equal(sanitizeBeach(null), null); assert.equal(sanitizeBeach({ v: 2 }), null); assert.equal(sanitizeBeach('x'), null);
  const R = new Rng(123);
  const junk = () => { const r = R.next(); return r < 0.2 ? null : r < 0.4 ? R.int(1e6) - 5e5 : r < 0.6 ? 'x'.repeat(R.int(50)) : r < 0.8 ? [R.int(9), 'a', { b: 1 }] : { a: R.int(5) }; };
  for (let k = 0; k < 200; k++) {
    const raw = JSON.parse(JSON.stringify(s1));
    for (let q = 0; q < 6; q++) {
      const keys = ['steps', 'hotel', 'shops', 'card', 'fish', 'events', 'stars', 'crowd', 'clean', 'sd', 'open'];
      const key = keys[R.int(keys.length)];
      if (R.chance(0.5)) raw[key] = junk(); else if (raw[key] && typeof raw[key] === 'object') { const ks = Object.keys(raw[key]); if (ks.length) raw[key][ks[R.int(ks.length)]] = junk(); }
    }
    if (R.chance(0.1)) raw.hotel = { level: 3, guests: Array.from({ length: 20 }, (_, q) => [30, q]) };
    const c = sanitizeBeach(raw);
    if (!c) continue;
    assert.ok(JSON.stringify(fitBeach(c)).length <= BEACH_SLICE.cap);
    assert.deepEqual(sanitizeBeach(c), c, 'idempotent');
    const rooms = c.hotel.level ? BEACH_TUNING.hotel.rooms[c.hotel.level - 1] : 0;
    assert.ok(c.hotel.guests.reduce((s, g) => s + g[0], 0) <= rooms);
    const e = makeHost({ seed: 1, saved: c });
    run(e, 2, 1 / 10);
  }
});

test('perf: a busy ★3 beach costs ≤ 0.15 ms per 60 fps tick (model + host, no view)', () => {
  const env = makeHost({ seed: 101 });
  openAll(env, { shops: 7 });
  env.P.T = 600 * 3 + 25 * 10;
  run(env, 60, 1 / 60);        // warm up: the beach fills (10:00 → 12:24)
  const ms = [];
  let pres = 0;
  for (let k = 0; k < 60 * 120; k++) { env.P.T += 1 / 60; const t0 = performance.now(); env.host.update(1 / 60); ms.push(performance.now() - t0); pres += env.host.model.crowd.present(); }
  pres /= ms.length;
  ms.sort((a, b) => a - b);
  const avg = ms.reduce((s, x) => s + x, 0) / ms.length;
  const p99 = ms[Math.floor(ms.length * 0.99)];
  console.log(`    beach perf: avg ${avg.toFixed(4)} ms, p95 ${ms[Math.floor(ms.length * 0.95)].toFixed(4)}, p99 ${p99.toFixed(4)}, max ${ms[ms.length - 1].toFixed(3)} ms; ${pres.toFixed(1)} people present on average (12:24–17:12)`);
  assert.ok(pres > 30, 'a busy beach');
  assert.ok(avg <= 0.15, 'avg ' + avg);
});

test('economy: a ★3 beach day pays rent, wholesale, hotel and tickets (numbers for the report)', () => {
  const env = makeHost({ seed: 111 });
  openAll(env, { shops: 7 });
  env.P.T = 600 * 3;
  run(env, 600, 1 / 10);
  const by = env.P.rec.coinsBy;
  const day = Object.values(by).reduce((s, x) => s + x, 0);
  console.log('    one ★3 game day (10 min):', JSON.stringify(by), 'total', day, '≈', Math.round(day / 10), 'coins/min; guests', env.host.model.crowd.today);
  assert.ok(by['beach:rent'] > 0 && by['beach:hotel'] > 0 && by['beach:wholesale'] > 0 && by['beach:aquarium'] > 0);
});
