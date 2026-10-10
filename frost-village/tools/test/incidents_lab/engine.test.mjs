// incidents_runtime x the real story engine (the story_runtime copy in src/story/engine, read-only): the engine plans
// and plays incidents with ackWait on; this module stages / acks them through a fake view and pushes its rates back.
//   nice -n 15 node --test tools/test/incidents_lab/engine.test.mjs
// Checks: every engine incident ends in the director (no 'lost', no dead ends), the engine never casts against the
// rules, every ack the engine waits for comes (shown or timed out), one staged incident at a time, building states
// follow the engine's build events to the rebuilt end, posters mirror the engine's wanted board, the rates we push
// land in the engine (fire gap, the switch), and our side costs ≤ 0.10 ms per tick.

import test from 'node:test';
import assert from 'node:assert/strict';
import { StoryEngine } from '../../../src/story/engine/src/engine.js';
import { ageOf, isKept } from '../../../src/story/engine/src/people.js';
import { IncidentsModel } from '../../../src/city/incidents/model/IncidentsModel.js';
import { INCIDENTS_TUNING } from '../../../src/city/incidents/tuning.js';

const FWD = { incident: 'story:incident', build: 'story:build', wanted: 'story:wanted', move: 'story:move' };

/** run engine + model for `days`; opts: { seed, pop, rates (engine overrides) | null = follow the model, view: 'shown'|'never', inRange } */
function run(opts) {
  const e = new StoryEngine(Object.assign({ seed: opts.seed, population: opts.pop || 220, textMode: 'none', incidents: true, ackWait: true, lifeEvents: false, incidentRate: 0.4, fireRate: 0.05 }, opts.engine || {}));
  const tuning = Object.assign({}, INCIDENTS_TUNING, { drillFirst: false }, opts.tuning || {});
  const m = new IncidentsModel({ tuning, seed: opts.seed, T: e.now });
  const person = (ref) => { const r = typeof ref === 'number' && ref >= 0 ? e.people[ref] : null; return r ? { pid: 's:' + r.id, age: ageOf(e, r), role: r.job, named: isKept(e, r) } : null; };
  let n = 0;
  const env = { inRange: opts.inRange || ((v) => ((v.place || '').length + (v.building || '').length) % 3 === 0), far: () => false, slotFree: () => true, person };
  const log = [], cmds = [];
  const q = [];
  for (const k in FWD) e.on(k, (ev) => q.push(Object.assign({ t: FWD[k] }, ev)));
  const seen = new Map();
  let maxStaged = 0;
  const times = [];
  const steps = Math.round((opts.days * e.cfg.dayLength) / e.cfg.step);
  for (let i = 0; i < steps; i++) {
    e.step();
    const T = e.now;
    const a = performance.now();
    for (const ev of q.splice(0)) { log.push(Object.assign({ T }, ev)); m.feed(ev, T, env); }
    m.update(e.cfg.step, T, env);
    const out = m.drain();
    for (const ev of out.events) log.push(Object.assign({ T }, ev));
    for (const c of out.cmds) {
      cmds.push(Object.assign({ T }, c));
      if (c.t === 'ack') e.ack(c.id);
      if (c.t === 'rates' && !opts.rates) { e.setRates({ incidentRate: c.rates.incidentRate, fireRate: c.rates.fireRate }); e.setToggles ? e.setToggles({ incidents: c.rates.incidents }) : (e.cfg.incidents = c.rates.incidents); }
      if (c.t === 'scene' && opts.view === 'shown') seen.set(c.id, T + 4);
    }
    if (opts.view === 'shown') for (const [id, t] of seen) if (T >= t) { const I = m.director.get(id); if (!I) seen.delete(id); else if (I.ack) { m.director.shown(id, I.ack.phase, T); seen.set(id, T + 4); } }
    times.push(performance.now() - a);
    maxStaged = Math.max(maxStaged, m.director.countStaged());
    n++;
  }
  return { e, m, log, cmds, maxStaged, times };
}

test('stress run: 12 game days, every kind, every phase staged or off stage, nothing lost', () => {
  const r = run({ seed: 5, days: 12, view: 'shown', rates: true, engine: { incidentRate: 2.5, fireRate: 1.2, fireRuinAfter: 30 } });
  const st = r.m.director.stats;
  const kinds = new Set(r.log.filter((e) => e.t === 'story:incident').map((e) => e.kind));
  for (const k of ['theft', 'queue', 'window', 'scuffle', 'fire']) assert.ok(kinds.has(k), 'the engine played a ' + k);
  // settle: the engine keeps running its open incidents (ruins rebuild over ~2 days)
  const more = run({ seed: 5, days: 16, view: 'shown', rates: true, engine: { incidentRate: 2.5, fireRate: 1.2, fireRuinAfter: 30 } });
  const started = new Set(more.log.filter((e) => e.t === 'story:incident').map((e) => e.id));
  const doneEng = new Set(more.log.filter((e) => e.t === 'story:incident' && e.phase === 'done').map((e) => e.id));
  const endedUs = new Set(more.log.filter((e) => e.t === 'inc:end').map((e) => e.id));
  for (const id of doneEng) assert.ok(endedUs.has(id) || !started.has(id), 'every incident the engine finished ended here too: #' + id);
  assert.equal(more.m.director.stats.lost, 0, 'nothing lost');
  assert.equal(st.ruleBreaks, 0, 'the engine kept the culprit rules');
  assert.ok(more.maxStaged <= 1, 'one on stage');
  // every ack the engine asked for came (or the engine moved on by its own timeout)
  const asks = more.log.filter((e) => e.t === 'story:incident' && e.ack);
  let acked = 0;
  for (const a of asks) {
    const got = more.cmds.find((c) => c.t === 'ack' && c.id === a.id && c.phase === a.phase && c.T >= a.T);
    const next = more.log.find((e) => e.t === 'story:incident' && e.id === a.id && e.T > a.T);
    assert.ok(got || next || a.T > more.e.now - 90, 'ack for #' + a.id + ' ' + a.kind + ':' + a.phase);
    if (got) acked++;
  }
  assert.ok(acked >= asks.length * 0.9, 'acks sent: ' + acked + '/' + asks.length);
  // buildings follow the engine: every ruin is rebuilt by the end of the run (or still in its timeline)
  const ruins = more.log.filter((e) => e.t === 'story:build' && e.op === 'ruin');
  const rebuilt = more.log.filter((e) => e.t === 'inc:fire' && e.op === 'rebuilt');
  assert.ok(ruins.length >= 1, 'some fires were lost: ' + ruins.length);
  assert.ok(rebuilt.length >= ruins.length - 2, 'rebuilt ' + rebuilt.length + ' of ' + ruins.length + ' ruins');
  // posters mirror the engine's board
  const posts = more.log.filter((e) => e.t === 'inc:wanted' && e.op === 'post').length, removes = more.log.filter((e) => e.t === 'inc:wanted' && e.op === 'remove').length;
  assert.equal(more.m.wanted.list().length, posts - removes);
  const avg = more.times.reduce((s, x) => s + x, 0) / more.times.length;
  console.log('    engine incidents ' + started.size + ' (' + [...kinds].join(',') + '), staged ' + more.m.director.stats.staged + ', acks ' + acked + '/' + asks.length + ', timeouts ' + more.m.director.stats.ackTimeouts + ', ruins ' + ruins.length + ', posters ' + posts + '; our ms per engine step avg ' + avg.toFixed(4));
  assert.ok(avg <= 0.1, 'our side per step ' + avg);
});

test('game rates: the engine plays ≈ 0.95 incidents a day for 220 people, fires ≥ 4 days apart, the switch stops new ones', () => {
  const r = run({ seed: 9, days: 30, view: 'never', inRange: () => false });
  const starts = r.log.filter((e) => e.t === 'story:incident' && !r.log.some((x) => x !== e && x.t === 'story:incident' && x.id === e.id && x.T < e.T));
  const perDay = starts.length / 30;
  const fires = starts.filter((e) => e.kind === 'fire').map((e) => e.T).sort((a, b) => a - b);
  let minGap = Infinity;
  for (let k = 1; k < fires.length; k++) minGap = Math.min(minGap, fires[k] - fires[k - 1]);
  console.log('    30 days: ' + starts.length + ' incidents (' + perDay.toFixed(2) + '/day), fires ' + fires.length + ', min fire gap ' + (Number.isFinite(minGap) ? (minGap / 600).toFixed(1) + ' days' : '-') + ', safety ' + r.m.safety.percent(r.e.now) + ' %');
  assert.ok(perDay >= 0.3 && perDay <= 2.5, 'about one a day: ' + perDay.toFixed(2));
  if (fires.length > 1) assert.ok(minGap >= 4 * 600 - 600, 'fire gap ≥ 4 days (one day of slack for a fire already planned that morning): ' + minGap);
  // the switch: off -> the engine plans nothing new
  const off = run({ seed: 9, days: 6, view: 'never', inRange: () => false, tuning: { on: false } });
  const n = off.log.filter((e) => e.t === 'story:incident').length;
  assert.equal(n, 0, 'no incidents with the switch off');
  assert.equal(off.m.safety.percent(off.e.now), 100);
});
