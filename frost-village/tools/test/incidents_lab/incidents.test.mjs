// incidents_runtime Node tests (docs/v5_v8_plan.md §6.7 "Tests"):
//   nice -n 15 node --test tools/test/incidents_lab/incidents.test.mjs
// one staged incident at a time; every staged phase acked or timed out; ruin -> rebuilt +1 level with insurance; the
// switch off cancels and the 안심 bar reads 100 %; culprit rules; fire gap, hydrant cut, levels and the drill;
// moving in/out keeps households valid; determinism; save round trip + cap + fuzz; no dead ends; perf per tick.

import test from 'node:test';
import assert from 'node:assert/strict';
import { IncidentsModel } from '../../../src/city/incidents/model/IncidentsModel.js';
import { ScriptedSource } from '../../../src/city/incidents/model/source.js';
import { Director } from '../../../src/city/incidents/model/director.js';
import { canCulprit, canScuffle, bandOf, BAND } from '../../../src/city/incidents/model/rules.js';
import { INCIDENTS_TUNING, incidentsTuning } from '../../../src/city/incidents/tuning.js';
import { sanitizeIncidents, fitIncidents, INCIDENTS_SLICE } from '../../../src/city/incidents/save.js';
import { IncidentsHost } from '../../../src/city/incidents/host.js';
import { it as tr } from '../../../src/city/incidents/strings.js';
import { Rng } from '../../../src/city/incidents/model/rng.js';
import { drive, makeRoster, makeEnv, PLACES, fakePorts } from './fake_env.mjs';

const T0 = 600 * 10 + 25 * 9;         // day 10, 09:00
const KINDS = ['theft', 'queue', 'window', 'scuffle', 'fire'];

/** start one of every kind spread over a day (staggered) */
function everyKind(at = T0, gap = 20) {
  return (T, src) => { const k = Math.round((T - at) / 0.25); if (k >= 0 && k % (gap * 4) === 0 && k / (gap * 4) < KINDS.length) src.start(KINDS[k / (gap * 4)], { T }); };
}

test('one staged incident at a time; the rest play off stage (busy town, 3 game days)', () => {
  let maxStaged = 0, starts = 0;
  const r = drive({
    seed: 3, T0, secs: 1800, dt: 0.25, view: 'shown',
    hook: (T, src, m) => { if (Math.floor(T * 4) % 160 === 0) { const k = KINDS[Math.floor(T) % KINDS.length]; if (src.start(k, { T })) starts++; } maxStaged = Math.max(maxStaged, m.director.countStaged()); },
  });
  const st = r.model.director.stats;
  assert.ok(starts >= 40, 'many incidents started: ' + starts);
  assert.ok(maxStaged <= 1 && st.maxStaged <= 1, 'never two on stage: ' + maxStaged);
  assert.ok(st.staged >= 5, 'some were staged: ' + st.staged);
  const opens = r.log.filter((e) => e.t === 'stage:open').length, closes = r.log.filter((e) => e.t === 'stage:close').length;
  assert.ok(opens - closes <= 1 && opens >= closes, 'stage open/close balanced: ' + opens + '/' + closes);
});

test('every staged ack phase is acked (shown or timed out); off-stage ones at their natural length', () => {
  for (const view of ['shown', 'never']) {
    const r = drive({ seed: 5, T0, secs: 900, view, hook: everyKind(T0 + 1, 40) });
    const asks = r.log.filter((e) => e.t === 'story:incident' && e.ack);
    const acks = r.cmds.filter((c) => c.t === 'ack');
    for (const a of asks) {
      const got = acks.find((c) => c.id === a.id && c.phase === a.phase && c.T >= a.T);
      const evNext = r.log.find((e) => e.t === 'story:incident' && e.id === a.id && e.T > a.T);
      assert.ok(got || evNext, view + ': ' + a.kind + ':' + a.phase + ' #' + a.id + ' acked or moved on');
      if (got) {
        const lim = (INCIDENTS_TUNING.ackTimeout[a.kind + ':' + a.phase] || 40) + 0.5;
        assert.ok(got.T - a.T <= lim, view + ': ack within the timeout (' + (got.T - a.T) + ' s)');
        if (view === 'shown' && got.why === 'shown') assert.ok(got.T - a.T >= (INCIDENTS_TUNING.minShow[a.kind + ':' + a.phase] || 0) - 0.3, 'shown for at least minShow');
      }
    }
    if (view === 'never') assert.ok(r.model.director.stats.ackTimeouts > 0, 'timeouts used when the view never reports');
    assert.equal(r.source.active.filter((I) => I.kind !== 'fire' && I.kind !== 'window' && I.kind !== 'theft').length, 0, view + ': quick incidents all ended');
  }
  // off stage: nothing in range -> acks after offAck
  const r = drive({ seed: 6, T0, secs: 300, envOpts: { inRange: () => false }, hook: (T, src) => { if (T === T0 + 1) src.start('fire', { T, outcome: 'minor', building: 't_flower' }); } });
  const ack = r.cmds.find((c) => c.t === 'ack' && c.phase === 'dispatch');
  assert.ok(ack && ack.why === 'off', 'off-stage dispatch acked by the clock');
  assert.equal(r.model.director.stats.staged, 0);
});

test('no dead ends: 30 game days of the fallback schedule end every incident and settle every building', () => {
  const r = drive({ seed: 9, T0: 0, secs: 600 * 30, dt: 0.5, plan: true, view: 'shown', tuning: { drillFirst: false, fireGapDays: 2, incidentRate: 4, fireRate: 1.5 }, envOpts: { inRange: (v) => (v.place || '').length % 2 === 0 } });
  const st = r.model.director.stats;
  assert.ok(st.started >= 15, 'incidents happened: ' + st.started);
  // let the last ones finish
  const r2 = drive({ model: r.model, source: r.source, roster: r.roster, T0: r.T, secs: 600 * 4, dt: 0.5, view: 'shown' });
  assert.equal(r2.source.active.length, 0, 'the source finished: ' + r2.source.active.map((I) => I.kind + ':' + I.phase).join(','));
  assert.equal(r2.model.director.active().length, 0, 'the director finished');
  assert.equal(r2.model.director.stats.lost, 0, 'nothing lost');
  for (const b of r2.model.buildings.list()) assert.equal(b.st === 0 || b.st === 7, true, 'building ' + b.id + ' settled (' + b.st + ')');
  assert.equal(r2.model.director.scene, null, 'stage empty');
});

test('the story going quiet never leaves a dead end (stale incidents end as lost)', () => {
  const D = new Director(INCIDENTS_TUNING);
  const env = makeEnv(makeRoster());
  D.onIncident({ id: 7, kind: 'scuffle', phase: 'fight', place: 't_fountain', culprit: 3, victim: 8, ack: true }, 100, env);
  assert.equal(D.staged, 7);
  for (let T = 100; T < 100 + 3 * 600; T += 1) D.update(T, env);
  assert.equal(D.active().length, 0);
  assert.equal(D.stats.lost, 1);
  assert.equal(D.scene, null, 'the scene closed after its tail');
});

test('ruin -> demolition -> site -> rebuilt one level better with insurance; same level without', () => {
  for (const insured of [true, false]) {
    const r = drive({
      seed: 13, T0, secs: 600 * 4, view: 'shown',
      hook: (T, src, m) => {
        if (T === T0 + 1) src.start('fire', { T, building: 't_flower', outcome: 'ruin', better: false, ruinWait: 30, demolish: 60, construct: 90 });
        if (insured && m.buildings.state('t_flower') === 'ruin' && !m.claimed) { m.claimed = true; m.feed({ t: 'bank:claim', id: 't_flower', n: 12000 }, T, null); }
      },
    });
    const seq = r.log.filter((e) => e.t === 'inc:fire' && e.building === 't_flower').map((e) => e.state);
    for (const s of ['smoking', 'burning', 'ruin', 'demolition', 'site', 'rebuilt', 'ok']) assert.ok(seq.includes(s), (insured ? 'insured' : 'plain') + ' passes ' + s + ': ' + seq.join('>'));
    assert.ok(seq.indexOf('ruin') < seq.indexOf('demolition') && seq.indexOf('demolition') < seq.indexOf('site') && seq.indexOf('site') < seq.indexOf('rebuilt'), 'in order');
    assert.equal(r.model.buildings.level('t_flower'), insured ? 1 : 0, 'level after the rebuild');
    const end = r.log.find((e) => e.t === 'inc:end' && e.kind === 'fire');
    assert.ok(end && !end.ok, 'a ruined fire does not count as safe');
    // the bank hears about the ruin with the building id (it pays the claim)
    assert.ok(r.log.some((e) => e.t === 'inc:fire' && e.op === 'ruin' && e.building === 't_flower' && e.id > 0), 'inc:fire ruin carries the incident and building');
  }
});

test('the switch: off cancels, the director idles, the 안심 bar reads 100 %, moving still runs', () => {
  const roster = makeRoster();
  const m = new IncidentsModel({ tuning: INCIDENTS_TUNING, seed: 1, T: T0 });
  const env = makeEnv(roster);
  const src = new ScriptedSource({ seed: 2, roster, places: PLACES });
  // a bad day first: two escapes and a ruin
  m.safety.record(T0, false); m.safety.record(T0, false); m.safety.record(T0, true);
  assert.equal(m.safety.percent(T0), 33);
  src.start('scuffle', { T: T0 });
  for (const ev of src.drain()) m.feed(ev, T0, env);
  assert.ok(m.director.scene, 'a scuffle on stage');
  m.drain();
  assert.equal(m.toggle(false, T0 + 1), true);
  const { events, cmds } = m.drain();
  assert.equal(m.director.scene, null, 'stage cleared');
  const rates = cmds.filter((c) => c.t === 'rates').pop();
  assert.deepEqual(rates.rates, { incidents: false, incidentRate: 0, fireRate: 0 }, 'engine told: no incidents');
  assert.ok(events.some((e) => e.t === 'inc:toggle' && e.on === false));
  assert.equal(m.safety.percent(T0 + 2), 100, '안심 100 % when off');
  // a new incident from the story is not staged nor tracked
  m.feed({ t: 'story:incident', id: 999, kind: 'theft', phase: 'act', place: 't_flower', culprit: 3 }, T0 + 3, env);
  assert.equal(m.director.get(999), null);
  // moving still works
  m.feed({ t: 'story:move', op: 'in', home: 'lotH1#1', members: [501, 502], membersPid: ['n:1', 'n:2'] }, T0 + 4, env);
  assert.ok(m.drain().events.some((e) => e.t === 'inc:move' && e.op === 'in'));
  // back on
  m.toggle(true, T0 + 5);
  assert.ok(m.drain().cmds.find((c) => c.t === 'rates').rates.incidents);
});

test('culprits: never elders, helpers or named villagers; window = kids; scuffles in one age band', () => {
  const roster = makeRoster();
  const src = new ScriptedSource({ seed: 4, roster, places: PLACES });
  let n = 0;
  for (let k = 0; k < 400; k++) {
    const kind = KINDS[k % 4];
    const id = src.start(kind, { T: k });
    if (!id) continue;
    n++;
    const I = src.active.find((x) => x.id === id);
    const c = roster.find((p) => p.sid === I.culprit), v = roster.find((p) => p.sid === I.victim);
    assert.ok(c, 'culprit from the roster');
    assert.ok(canCulprit(c, kind), kind + ' culprit ok (age ' + c.age + ', ' + (c.role || c.pid) + ')');
    assert.notEqual(bandOf(c.age), BAND.elder);
    assert.ok(!c.role && !c.named);
    if (kind === 'window') assert.equal(bandOf(c.age), BAND.kid);
    if (kind === 'scuffle') assert.ok(canScuffle(c, v), 'same band');
    src.active.length = 0;
  }
  assert.ok(n > 300, 'cast found: ' + n);
  // the director counts a story event that breaks the rules
  const D = new Director(INCIDENTS_TUNING);
  const env = makeEnv(roster);
  const elder = roster.find((p) => p.age >= 65), cop = roster.find((p) => p.role === 'police');
  D.onIncident({ id: 1, kind: 'theft', phase: 'act', place: 't_flower', culprit: elder.sid }, 1, env);
  D.onIncident({ id: 2, kind: 'theft', phase: 'act', place: 't_toy', culprit: cop.sid }, 1, env);
  D.onIncident({ id: 3, kind: 'theft', phase: 'act', place: 't_toy', culprit: 'v:npc_aunt', culpritPid: 'v:npc_aunt' }, 1, env);
  assert.equal(D.stats.ruleBreaks, 3);
});

test('fires: drill first, 4-day gap, hydrants −5 % each (≤ 40 %), levels −10 %, a happy village has fewer', () => {
  const m = new IncidentsModel({ tuning: INCIDENTS_TUNING, seed: 1, T: T0 });
  assert.equal(m.safety.rates(T0).fireRate, 0, 'no fire before the drill');
  m.feed({ t: 'mission:done', code: 'C14' }, T0, null);
  const base = m.safety.rates(T0);
  assert.ok(Math.abs(base.fireRate - 0.05) < 1e-6 && Math.abs(base.incidentRate - 0.4) < 1e-6, 'base rates at 50 % happiness: ' + JSON.stringify(base));
  // a fire: no other for 4 game days
  m.feed({ t: 'story:incident', id: 5, kind: 'fire', phase: 'smoke', building: 't_toy', place: 't_toy' }, T0 + 10, null);
  assert.equal(m.safety.rates(T0 + 11).fireRate, 0);
  assert.equal(m.safety.rates(T0 + 10 + 4 * 600 - 1).fireRate, 0);
  assert.ok(m.safety.rates(T0 + 10 + 4 * 600).fireRate > 0, 'allowed again after 4 days');
  const T = T0 + 10 + 5 * 600;
  // hydrants
  for (let k = 0; k < 10; k++) m.feed({ t: 'built', siteId: 'inc_hydrant_' + k, x: 100 * k, y: 50 }, T, null);
  assert.equal(m.safety.hydrants.length, 10);
  assert.ok(Math.abs(m.safety.rates(T).fireRate - 0.05 * 0.6) < 1e-6, '40 % cap: ' + m.safety.rates(T).fireRate);
  m.feed({ t: 'built', siteId: 'inc_fire2' }, T, null);
  m.feed({ t: 'built', siteId: 'inc_fire3' }, T, null);
  assert.equal(m.safety.fireLevel, 3);
  assert.ok(Math.abs(m.safety.rates(T).fireRate - 0.05 * 0.6 * 0.8) < 1e-6, 'levels: ' + m.safety.rates(T).fireRate);
  m.feed({ t: 'happy', h: 100 }, T, null);
  const happy = m.safety.rates(T);
  assert.ok(Math.abs(happy.incidentRate - 0.4 * 0.75) < 1e-6 && Math.abs(happy.fireRate - 0.05 * 0.6 * 0.8 * 0.75) < 1e-6, 'happy: ' + JSON.stringify(happy));
  m.feed({ t: 'happy', h: 0 }, T, null);
  assert.ok(m.safety.rates(T).incidentRate > happy.incidentRate, 'an unhappy village has more');
  // the engine hears every change
  assert.ok(m.drain().cmds.filter((c) => c.t === 'rates').length >= 5);
});

test('the fallback schedule follows the rates: ≈ 0.95 incidents a day for 220 people, fires ≈ 1 in 20 days', () => {
  const roster = [];
  for (let k = 0; k < 220; k++) roster.push({ pid: 'p' + k, sid: k + 1, age: [8, 15, 33, 40, 70][k % 5], hh: 'h' + (k >> 2), home: 'home' + (k >> 2) });
  const src = new ScriptedSource({ seed: 21, roster, places: PLACES });
  const m = new IncidentsModel({ tuning: Object.assign({}, INCIDENTS_TUNING, { drillFirst: false }), seed: 1, T: 0 });
  let petty = 0, fires = 0;
  const days = 400;
  for (let d = 0; d < days; d++) {
    m.safety.lastFire = -1e9;
    const n0 = src.sched.length;
    src.planDay(d, m.safety.rates(d * 600), 0.5);
    for (const s of src.sched.slice(n0)) { if (s[1] === 'fire') fires++; else petty++; }
    src.sched.length = 0;
  }
  const perDay = (petty + fires) / days, firesPer20 = (fires / days) * 20;
  assert.ok(perDay > 0.6 && perDay < 1.3, 'incidents per day ' + perDay.toFixed(2));
  assert.ok(firesPer20 > 0.5 && firesPer20 < 1.6, 'fires per 20 days ' + firesPer20.toFixed(2));
});

test('moving in / out keeps households valid; one job per home; every job ends; signs', () => {
  const roster = makeRoster();
  const src = new ScriptedSource({ seed: 8, roster, places: { ...PLACES, homes: PLACES.homes.concat(['newA#1', 'newB#1', 'newC#1']) } });
  const m = new IncidentsModel({ tuning: INCIDENTS_TUNING, seed: 1, T: T0 });
  const env = makeEnv(roster);
  let T = T0;
  const valid = () => {
    const seen = new Set();
    for (const p of src.roster) { assert.ok(!seen.has(p.sid), 'one record per person'); seen.add(p.sid); }
    const hhHome = new Map();
    for (const p of src.roster) { if (!p.hh || p.pseudo) continue; if (hhHome.has(p.hh)) assert.equal(hhHome.get(p.hh), p.home, 'a household lives in one home'); else hhHome.set(p.hh, p.home); }
    const homeHh = new Map();
    for (const p of src.roster) { if (!p.home || p.pseudo || /^c_|^t_fire|^v5/.test(p.home)) continue; if (homeHh.has(p.home)) assert.equal(homeHh.get(p.home), p.hh, 'a home holds one household: ' + p.home); else homeHh.set(p.home, p.hh); }
  };
  for (let k = 0; k < 24; k++) {
    const op = ['plan', 'out', 'in'][k % 3];
    src.move(op, { T });
    for (const ev of src.drain()) m.feed(ev, T, env);
    for (let s = 0; s < 20; s++) { T += 1; m.update(1, T, env); }
    valid();
  }
  for (let s = 0; s < 200; s++) { T += 1; m.update(1, T, env); }
  const evs = m.drain().events.filter((e) => e.t === 'inc:move');
  const started = evs.filter((e) => e.op === 'in' || e.op === 'out'), ended = evs.filter((e) => e.op === 'done');
  assert.ok(started.length >= 12, 'moves started: ' + started.length);
  assert.equal(ended.length, started.length, 'every move job ended');
  for (const e of started) { assert.ok(e.members.length >= 1, 'members'); if (e.op === 'in') assert.ok(e.home, 'a move-in has a home'); }
  assert.equal(m.moves.jobs.length + m.moves.queue.length, 0);
  // two moves into the same home: the second waits
  m.feed({ t: 'story:move', op: 'in', home: 'x#1', members: [1] }, T, env);
  m.feed({ t: 'story:move', op: 'in', home: 'x#1', members: [2] }, T, env);
  assert.equal(m.moves.jobs.filter((j) => j.home === 'x#1').length, 1);
  assert.equal(m.moves.queue.length, 1);
  for (let s = 0; s < 120; s++) { T += 1; m.update(1, T, env); }
  assert.equal(m.moves.queue.length + m.moves.jobs.length, 0, 'the queued move ran too');
  // unusable events are refused
  assert.equal(m.moves.add({ op: 'in', members: [3] }, T), null, 'move-in without a home');
  assert.equal(m.moves.add({ op: 'out', members: [] }, T), null, 'move without people');
  // signs: plan -> for sale, out -> sold
  m.feed({ t: 'story:move', op: 'plan', home: 'y#1', household: 'hy' }, T, env);
  assert.equal(m.moves.sign('y#1'), 'for_sale_sign');
  m.feed({ t: 'story:move', op: 'out', home: 'y#1', household: 'hy', members: [9] }, T, env);
  for (let s = 0; s < 40; s++) { T += 1; m.update(1, T, env); }
  assert.equal(m.moves.sign('y#1'), 'sold_sign');
});

test('wanted board: escape posts a silhouette, E12 tips the face, the release takes it down; ≤ 3 posters', () => {
  const r = drive({
    seed: 17, T0, secs: 600 * 3, view: 'shown',
    hook: (T, src, m) => {
      if (T === T0 + 1) for (let k = 0; k < 4; k++) src.start('theft', { T, outcome: 'escaped', tipDays: 2 });
      if (T === T0 + 120) { const w = m.wanted.list()[0]; if (w) m.feed({ t: 'mission:done', code: 'E12', key: w.inc }, T, null); }
    },
  });
  const posts = r.log.filter((e) => e.t === 'inc:wanted' && e.op === 'post');
  assert.equal(posts.length, 3, 'three slots');
  assert.ok(posts.every((p) => p.anon), 'silhouettes first');
  assert.ok(r.log.some((e) => e.t === 'inc:wanted' && e.op === 'tip'), 'the chief found one');
  assert.ok(r.cmds.some((c) => c.t === 'tip'), 'the story is told (arrange tip)');
  const removes = r.log.filter((e) => e.t === 'inc:wanted' && e.op === 'remove');
  assert.equal(removes.length, 3, 'every poster came down after the arrest');
  assert.equal(r.model.wanted.list().length, 0);
});

test('determinism: same seed -> same events, commands and save', () => {
  const run = () => drive({ seed: 31, T0, secs: 600 * 3, dt: 0.5, plan: true, view: 'shown', tuning: { drillFirst: false, incidentRate: 4, fireRate: 2 } });
  const a = run(), b = run();
  const strip = (l) => JSON.stringify(l.map((e) => Object.assign({}, e)));
  assert.equal(strip(a.log), strip(b.log));
  assert.equal(strip(a.cmds), strip(b.cmds));
  assert.equal(JSON.stringify(a.model.serialize()), JSON.stringify(b.model.serialize()));
  assert.ok(a.log.length > 20, 'something happened: ' + a.log.length);
});

test('save: round trip, 2 KB cap at the worst case, 200 fuzzed slices never throw and stay clean', () => {
  const r = drive({ seed: 41, T0: 0, secs: 600 * 12, dt: 0.5, plan: true, view: 'shown', tuning: { drillFirst: false, fireGapDays: 1, fireRate: 2 } });
  const s1 = r.model.serialize();
  const clean = sanitizeIncidents(JSON.parse(JSON.stringify(s1)));
  const m2 = new IncidentsModel({ tuning: INCIDENTS_TUNING, saved: clean, seed: 41, T: r.T });
  assert.deepEqual(m2.serialize(), clean, 'round trip');
  assert.ok(JSON.stringify(fitIncidents(clean)).length <= INCIDENTS_SLICE.cap);
  // worst case: 16 buildings with long ids + levels, 3 posters, 24 hydrants, 10 safety days, 8 sale signs
  const worst = { v: 1, on: 1, buildings: [], wanted: [], hydrants: [], fireLevel: 3, safety: [], drill: 1, lastFire: 123456789, police: 1, sale: [] };
  for (let k = 0; k < 16; k++) worst.buildings.push(['t_apartment_long_' + k + '#12', 1 + (k % 7), 900000 + k, 3]);
  for (let k = 0; k < 3; k++) worst.wanted.push([k, 100000 + k, 'story:12345', 50, 'item_fish_cooked', 120000, 1]);
  for (let k = 0; k < 24; k++) worst.hydrants.push([10000 + k, 20000 + k]);
  for (let k = 0; k < 10; k++) worst.safety.push([100000 + k, 3, 4]);
  for (let k = 0; k < 8; k++) worst.sale.push('house_' + k + '#1');
  const w = sanitizeIncidents(worst);
  const len = JSON.stringify(w).length;
  assert.ok(len <= INCIDENTS_SLICE.cap, 'worst case under 2 KB: ' + len);
  // fuzz
  const R = new Rng(99);
  const junk = () => { const t = R.int(8); return t === 0 ? null : t === 1 ? R.int(1e6) - 5e5 : t === 2 ? 'x' + R.int(99) : t === 3 ? [junk(), junk(), junk(), junk()] : t === 4 ? { a: junk() } : t === 5 ? NaN : t === 6 ? 'item_bread' : 't_flower#' + R.int(9); };
  for (let k = 0; k < 200; k++) {
    const raw = { v: junk(), on: junk(), buildings: [junk(), [junk(), junk(), junk(), junk()], ['t_' + k, R.int(9), R.int(1e6), R.int(5)]], wanted: [junk(), [R.int(4), R.int(99), junk(), junk(), junk(), junk(), junk()]], hydrants: [junk(), [R.int(9e3), R.int(9e3)]], fireLevel: junk(), safety: [junk(), [R.int(99), R.int(5), R.int(5)]], drill: junk(), lastFire: junk(), police: junk(), sale: [junk(), 'h#1'] };
    const c = sanitizeIncidents(k % 17 === 0 ? junk() : raw);
    if (!c) continue;
    assert.deepEqual(sanitizeIncidents(JSON.parse(JSON.stringify(c))), c, 'idempotent');
    assert.ok(JSON.stringify(fitIncidents(c)).length <= INCIDENTS_SLICE.cap);
    const m = new IncidentsModel({ tuning: INCIDENTS_TUNING, saved: c, seed: 1, T: 0 });
    assert.ok(m.serialize().v === 1);
  }
});

test('perf: model + director ≤ 0.10 ms per 60 fps tick with a busy town (12 incidents + 4 moves live)', () => {
  const roster = makeRoster();
  const m = new IncidentsModel({ tuning: Object.assign({}, INCIDENTS_TUNING, { drillFirst: false }), seed: 1, T: T0 });
  const src = new ScriptedSource({ seed: 3, roster, places: PLACES });
  const env = makeEnv(roster, { inRange: (v) => (v.place || '') === 't_flower' });
  let T = T0;
  const dt = 1 / 60;
  const times = [];
  for (let k = 0; k < 60 * 300; k++) {
    T += dt;
    if (k % 600 === 0) { src.start(KINDS[(k / 600) % 5], { T }); src.move(['in', 'plan', 'out'][(k / 600) % 3], { T }); }
    const a = performance.now();
    src.update(T);
    for (const ev of src.drain()) m.feed(ev, T, env);
    m.update(dt, T, env);
    const { cmds } = m.drain();
    for (const c of cmds) if (c.t === 'ack') src.ack(c.id);
    times.push(performance.now() - a);
  }
  times.sort((x, y) => x - y);
  const avg = times.reduce((s, x) => s + x, 0) / times.length;
  console.log('    model ms/tick avg ' + avg.toFixed(4) + ' p99 ' + times[Math.floor(times.length * 0.99)].toFixed(4) + ' max ' + times[times.length - 1].toFixed(3));
  assert.ok(avg <= 0.1, 'avg ' + avg);
});

test('host (headless): api, sites, story acks / rates, cards, preview on a throwaway copy, fallback', () => {
  const { ports, S } = fakePorts();
  S.T = T0;
  const host = new IncidentsHost(ports, null, { seed: 5 });
  assert.ok(S.sites.some((s) => s.id === 'inc_police') && S.sites.some((s) => s.id === 'inc_fire2') && S.sites.filter((s) => /^inc_hydrant_/.test(s.id)).length >= 10, 'sites offered');
  assert.ok(S.rates.length && S.toggles.length, 'rates pushed to the story');
  // a story fire, staged (in view), acked when the timeout passes (no view in Node)
  host.onFeed({ t: 'mission:done', code: 'C14' });
  host.onFeed({ t: 'story:incident', id: 4, kind: 'fire', phase: 'smoke', building: 't_flower', place: 't_flower' });
  assert.ok(S.events.some((e) => e.t === 'inc:stage' && e.id === 4), 'staged');
  assert.equal(S.stage.held, true, 'the StageDirector slot is held');
  host.onFeed({ t: 'story:incident', id: 4, kind: 'fire', phase: 'dispatch', building: 't_flower', place: 't_flower', ack: true });
  for (let k = 0; k < 50 * 4; k++) { S.T += 0.25; host.update(0.25); }
  assert.deepEqual(S.acks, [4], 'acked by the timeout');
  host.onFeed({ t: 'story:incident', id: 4, kind: 'fire', phase: 'spray', building: 't_flower', place: 't_flower', ack: true });
  host.onFeed({ t: 'story:build', op: 'scorched', place: 't_flower' });
  host.onFeed({ t: 'story:incident', id: 4, kind: 'fire', phase: 'repair', building: 't_flower', place: 't_flower', outcome: 'minor' });
  for (let k = 0; k < 20 * 4; k++) { S.T += 0.25; host.update(0.25); }
  assert.equal(S.stage.held, false, 'slot released after the tail');
  assert.ok(S.toasts.length >= 1);
  assert.equal(host.api.buildingState('t_flower').state, 'scorched');
  assert.ok(host.api.safety() >= 0 && host.api.safety() <= 100);
  // move-in card
  host.onFeed({ t: 'story:move', op: 'in', home: 'lotH1#1', who: 3, whoPid: 't:3', members: [3, 4], membersPid: ['t:3', 't:4'] });
  assert.ok(S.cards.some((c) => c.kind === 'move' && /이사 왔어요/.test(c.text)), 'move-in card');
  // story_runtime's story:move has no home: the host finds it from the person (t:6 lives in PLACES.homes[1])
  const nMoves = host.model.stats.moves;
  host.onFeed({ t: 'story:move', op: 'out', who: 6, whoPid: 't:6', members: [6] });
  assert.equal(host.model.stats.moves, nMoves + 1, 'a home-less story move still makes a job');
  assert.ok(host.model.moves.jobs.concat(host.model.moves.queue).some((j) => j.op === 'out' && j.home), 'its home comes from the person');
  // preview: plays, never reaches the feed, restores the model
  const before = JSON.stringify(host.serialize());
  const nEv = S.events.length;
  const id = host.api.preview('theft', { outcome: 'caught' });
  assert.ok(id >= 90000);
  for (let k = 0; k < 400 * 4; k++) { S.T += 0.25; host.update(0.25); }
  assert.equal(host.preview, null, 'preview over');
  assert.equal(S.events.length, nEv, 'no preview event reached the game');
  assert.equal(JSON.stringify(host.serialize()), before, 'state restored');
  // toggle through the API
  assert.equal(host.api.toggle(false), true);
  assert.equal(host.api.safety(), 100);
  assert.deepEqual(S.toggles[S.toggles.length - 1], { incidents: false });
  host.destroy();
  // fallback: no story -> the host's own source plans days and acks itself
  const f = fakePorts({ story: undefined });
  f.S.T = 0;
  const h2 = new IncidentsHost(f.ports, { v: 1, drill: 1 }, { seed: 6, fallback: true, places: PLACES, tuning: { incidentRate: 4 } });
  for (let k = 0; k < 600 * 6 * 2; k++) { f.S.T += 0.5; h2.update(0.5); }
  assert.ok(h2.model.director.stats.started > 0, 'fallback incidents: ' + h2.model.director.stats.started);
  assert.ok(f.S.events.some((e) => e.t === 'inc:end'), 'they end');
});

test('strings: ko + en for every key, particles after names', () => {
  assert.equal(tr('ko', 'moveIn', { fam: '새 가족' }), '새 가족이 이사 왔어요!');
  assert.equal(tr('ko', 'released', { name: '민수' }), '민수가 사과하고 집에 돌아갔어요');
  assert.equal(tr('ko', 'rebuilt', { place: '꽃집' }), '꽃집을 더 멋지게 다시 지었어요!');
  assert.ok(/moved in/.test(tr('en', 'moveIn', { fam: 'The Kim family' })));
  assert.ok(incidentsTuning({ v8: { incidents: { fireRate: 0.1, hydrant: { coins: 500 } } } }).hydrant.fireCut === 0.05, 'tuning merges one level deep');
});

test('tuning: the game balance without a v8 block keeps every default; a v8 block overrides by key', () => {
  for (const bal of [{}, { v4: {} }, null, undefined, { v8: {} }]) {
    const c = incidentsTuning(bal);
    for (const k in INCIDENTS_TUNING) {
      assert.notEqual(c[k], null, k + ' is null for ' + JSON.stringify(bal));
      assert.deepEqual(c[k], INCIDENTS_TUNING[k], k);
    }
  }
  const c = incidentsTuning({ v8: { incidents: { fireRate: 0.1, police: { coins: 1 } } } });
  assert.equal(c.fireRate, 0.1);
  assert.equal(c.police.coins, 1);
  assert.equal(c.police.time, INCIDENTS_TUNING.police.time);
  assert.equal(c.stageRange, INCIDENTS_TUNING.stageRange);
});
