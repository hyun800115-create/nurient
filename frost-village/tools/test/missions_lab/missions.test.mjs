// Missions model tests (Node, no browser):  nice -n 15 node --test tools/test/missions_lab/missions.test.mjs
// Catalog (98 templates, ko + en, icons exist), anti-softlock (static closure + a 30-game-day simulation with an
// oracle), every objective type progresses from synthetic events, calendar rollovers (05:00, midnight, DST, clock
// moved backward, one rollover per launch), the snowman shield, park / resume keeps progress, the reward formula,
// fame is monotonic, request caps, the focus rule, event missions, gentle expiry, determinism + reload equivalence,
// 200 fuzzed save slices, the slice cap and the per-tick cost.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOG, tpl } from '../../../src/missions/data/catalog.js';
import { requirements, closureOf, isDynamic } from '../../../src/missions/data/caps.js';
import { MissionModel } from '../../../src/missions/model/missions.js';
import { unitsOf } from '../../../src/missions/model/units.js';
import { MISSIONS_TUNING, missionsTuning } from '../../../src/missions/tuning.js';
import { sanitizeMissions, fitCap, MISSIONS_SLICE } from '../../../src/missions/save.js';
import { dayKey, weekKey } from '../../../src/missions/lib/calendarKeys.js';
import { Rng } from '../../../src/missions/lib/rng.js';
import { FakeWorld, feedFor, feedGives } from './fake_world.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const cfg = () => missionsTuning();
const mk = (world, saved, seed = 7) => new MissionModel(cfg(), world.env, saved, { seed });

/** force an instance of any template into the model (as the board / an event would) */
function force(m, code, st = 'a', ev = {}) {
  const t = tpl(code);
  const inst = m.make(t, st, Object.assign({ who: 't:31', family: 't:31', key: code + 'k' }, ev));
  assert.ok(inst, 'could not make ' + code);
  m.add(inst);
  return inst;
}

/** drive an instance to completion with synthetic events; returns the done event */
function finish(m, world, inst) {
  const t = tpl(inst.c), U = unitsOf(t);
  for (let j = 0; j < U.length; j++) {
    const u = U[j];
    let guard = 0;
    while (m.get(inst.id) && inst.g[j] < u.need && guard++ < 400) {
      if (u.hours && !(world.hour() >= u.hours[0] && world.hour() < u.hours[1])) { world.advance(5); m.tick(); continue; }
      if (u.night && !(world.hour() >= 19 || world.hour() < 6)) { world.advance(5); m.tick(); continue; }
      if (u.t === 'deliver') {
        const item = u.item || u.any[0];
        if (item.startsWith('item_bouquet') || item === 'item_cake' || item === 'item_gift_box' || item === 'item_letter') m.craft(item, u.need - inst.g[j]);
        m.delivered(inst.id, item, u.need - inst.g[j]);
      } else if (u.t === 'count') {
        const k = Math.min(10, u.need - inst.g[j]);
        const ev = feedFor(u.sig, k);
        assert.ok(ev, 'no feed event for ' + u.sig);
        m.onFeed(ev);
      } else if (u.t === 'step') m.step(inst.id, u.how, 1, { stars: 3 });
      else if (u.t === 'build') m.onFeed({ t: 'built', key: u.key });
    }
  }
  const ev = m.drain();
  return ev.find((e) => (e.t === 'mission:done') && e.id === inst.id) || null;
}

// ---------------------------------------------------------------------------------------------------- catalog
test('catalog: 98 templates, unique, ko + en, valid fields', () => {
  assert.equal(CATALOG.length, 98);
  const per = {};
  for (const t of CATALOG) per[t.code[0]] = (per[t.code[0]] || 0) + 1;
  assert.deepEqual(per, { A: 22, B: 12, C: 16, D: 14, E: 13, F: 12, G: 6, H: 3 });
  assert.equal(new Set(CATALOG.map((t) => t.code)).size, 98);
  assert.equal(new Set(CATALOG.map((t) => t.id)).size, 98);
  for (const t of CATALOG) {
    assert.ok(t.title && t.title.ko && t.title.en, t.code + ' title');
    assert.ok(Array.isArray(t.unlock) && t.unlock.length, t.code + ' unlock');
    if (t.src === 'rule') { assert.ok(t.rule && t.rule.ko && t.rule.en); continue; }
    if (t.src === 'weekly') { assert.equal(t.stages.length, 3); continue; }
    assert.ok(Array.isArray(t.obj) && t.obj.length, t.code + ' obj');
    if (t.src === 'daily') continue;
    assert.ok(t.repeat === 'once' || t.repeat === 'day' || t.repeat === 'event' || (typeof t.repeat === 'number' && t.repeat > 0), t.code + ' repeat');
    assert.ok(t.pay >= 0, t.code + ' pay');
    if (t.kind === 'drive') assert.ok(Array.isArray(t.fame) && t.fame.length === 3, t.code + ' drive fame');
    else assert.ok(typeof t.fame === 'number' && t.fame >= 0, t.code + ' fame');
    if (t.kind === 'request') assert.ok(t.say && t.say.offer.ko && t.say.offer.en && t.say.thanks.ko && t.say.thanks.en, t.code + ' lines');
    for (const o of t.obj) assert.ok(['deliver', 'count', 'step', 'build'].indexOf(o.t) >= 0, t.code + ' obj type');
    // materials are never a reward
    assert.ok(!t.reward, t.code + ' has no item reward');
  }
});

test('catalog: every icon key exists in the finished art manifests', () => {
  const keys = new Set();
  for (const f of fs.readdirSync(path.join(ROOT, 'assets'))) {
    const mf = path.join(ROOT, 'assets', f, 'manifest.json');
    if (!fs.existsSync(mf)) continue;
    const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
    for (const k in m.sprites || {}) keys.add(k);
  }
  for (const t of CATALOG) assert.ok(keys.has(t.icon), t.code + ' icon ' + t.icon);
});

test('anti-softlock (static): every implied requirement is covered by the declared unlock / need', () => {
  for (const t of CATALOG) {
    const cl = closureOf([...(t.unlock || []), ...(t.need || [])]);
    const miss = [...requirements(t)].filter((c) => !cl.has(c) && !isDynamic(c));
    assert.deepEqual(miss, [], t.code + ' needs ' + miss.join(', '));
  }
});

// ---------------------------------------------------------------------------------------------------- objectives
test('every objective type of every mission template progresses from synthetic events to done', () => {
  const world = new FakeWorld({ rank: 3, facts: ['life', 'paper', 'toggle:farewell', 'toggle:incidents', 'v8', 'v6:star2', 'v7:star2', 'import:sugar',
    'b:deco_rink', 'b:depot', 'b:school', 'b:clinic', 'b:big_restaurant', 'b:boat_fishing', 'b:town_hall', 'b:deco_flowers', 'b:store', 'b:yard',
    'b:memorial', 'b:mini_aquarium', 'b:swimwear_shop', 'veh:sled', 'veh:truck', 'pet:pet_penguin'], income: 2000 });
  const m = mk(world, null);
  m.fame.pts = 500;
  world.advance(30);
  let n = 0;
  for (const t of CATALOG) {
    if (t.src === 'daily' || t.src === 'weekly' || t.src === 'rule') continue;
    const inst = force(m, t.code, t.src === 'board' ? 'b' : 'a');
    const done = finish(m, world, inst);
    assert.ok(done, t.code + ' completes');
    if (t.pay > 0 && !t.stages) assert.ok(done.coins >= 100, t.code + ' pays');
    n++;
  }
  assert.equal(n, 98 - 12 - 6 - 3);
});

test('dailies and weeklies progress from their counters (every F and G template)', () => {
  const world = new FakeWorld({ rank: 3, facts: ['life', 'paper', 'v8', 'b:depot', 'b:town_hall', 'b:deco_flowers'] });
  const m = mk(world, null);
  world.advance(2); m.tick(); m.drain();
  for (const t of CATALOG.filter((x) => x.src === 'daily')) {
    m.cal.dy = { d: m.cal.dy.d, ids: [t.code], g: [[]], k: [0], a: 0 };
    for (const u of unitsOf(t)) for (let g = 0; g < u.need;) { m.onFeed(feedFor(u.sig, 5)); g += feedGives(u.sig, 5); }
    const ev = m.drain();
    assert.ok(ev.some((e) => e.t === 'daily:done' && e.code === t.code), t.code + ' daily done');
  }
  for (const t of CATALOG.filter((x) => x.src === 'weekly')) {
    m.cal.wk = { w: m.cal.wk.w, c: t.code, g: 0, s: 0 };
    const total = t.stages[2];
    for (let g = 0; g < total;) {
      if (t.sig === 'req_done' || t.sig === 'celebrate') { m.signal(t.sig, 5); g += 5; continue; }
      m.onFeed(feedFor(t.sig, 50)); g += feedGives(t.sig, 50);
    }
    const ev = m.drain();
    assert.equal(ev.filter((e) => e.t === 'weekly:stage' && e.c === t.code).length, 3, t.code + ' 3 stages');
    assert.ok(ev.some((e) => e.t === 'reward' && e.kind === 'decor' && e.why === 'week'), t.code + ' weekly decor');
  }
});

// ---------------------------------------------------------------------------------------------------- 30-day sim
/** world progression over the 30 game days of the simulation */
function stage(world, day) {
  if (day >= 1) for (const f of ['b:deco_flowers', 'b:store', 'b:town_hall', 'life', 'b:depot', 'veh:sled', 'b:yard', 'b:deco_rink']) world.set(f);
  if (day >= 4) world.set('pet:pet_penguin');
  if (day >= 5) { if (world.rankN < 3) world.rank(3); for (const f of ['veh:truck', 'b:school', 'b:clinic', 'b:big_restaurant', 'b:boat_fishing', 'toggle:farewell', 'b:memorial']) world.set(f); }
  if (day >= 8) world.set('paper');
  if (day >= 10) for (const f of ['v6', 'import:sugar']) world.set(f);
  if (day >= 15) for (const f of ['v6:star2', 'v7', 'b:mini_aquarium', 'b:swimwear_shop']) world.set(f);
  if (day >= 18) world.set('v7:star2');
  if (day >= 20) for (const f of ['v8', 'toggle:incidents']) world.set(f);
}

/** run the sim; returns { model, events, offers, problems, completions } */
function simulate(seed, days, opts = {}) {
  const world = new FakeWorld({ rank: 2, income: 1800 });
  let m = mk(world, null, seed);
  const rng = new Rng(seed * 31 + 5);
  const events = [], offers = [], problems = [];
  let completions = 0, maxBubbles = 0, maxAccepted = 0, lastFame = 0;
  const work = new Map();     // id → next action time
  for (let s = 0; s < days * 600; s++) {
    const day = world.day();
    stage(world, day);
    world.I = 1800 + day * 300;
    world.advance(1);
    if (opts.reloadAt && s === opts.reloadAt) m = new MissionModel(cfg(), world.env, JSON.parse(JSON.stringify(m.serialize())), { seed });
    m.tick();
    // ambient village life
    if (rng.chance(0.12)) m.onFeed({ t: 'sold', item: rng.pick(['item_bread', 'item_fish_cooked', 'item_meat_cooked']), n: 1, value: 7 });
    if (rng.chance(0.08)) m.onFeed({ t: 'produced', item: rng.pick(['item_plank', 'item_ingot', 'item_meat_cooked', 'item_bread']), n: 1 });
    if (rng.chance(0.03)) m.onFeed({ t: 'crafted', item: 'item_can', n: 3 });
    if (rng.chance(0.04)) m.onFeed({ t: 'traded', item: 'item_plank', n: 1 });
    if (rng.chance(0.02)) m.onFeed({ t: 'visitorDone' });
    if (s % 70 === 0) m.onFeed({ t: 'train', ev: 'arrive', n: 6 });
    if (world.facts.has('b:depot') && s % 50 === 0) m.onFeed({ t: 'veh:arrive', line: 1, riders: 5 });
    if (s % 600 === 0 && s) m.onFeed({ t: 'day', day: world.day() });
    if (world.facts.has('life') && s % 1800 === 900) m.onFeed({ t: 'story:life', op: 'engaged', who: 't:31', id: 'w' + s, at: world.T + 900 });
    if (world.facts.has('life') && s % 1800 === 1700) m.onFeed({ t: 'story:life', op: 'wedding', who: 't:31', id: 'w' + (s - 800) });
    if (world.facts.has('life') && s % 2400 === 1200) m.onFeed({ t: 'story:life', op: 'baby', who: 't:31', family: 't:31', id: 'b' + s });
    if (world.facts.has('life') && s % 1300 === 400) m.onFeed({ t: 'story:life', op: 'birthday', who: 't:58', family: 't:12' });
    if (s % 1000 === 500) m.onFeed({ t: 'settlers', n: 3 });
    if (world.facts.has('paper') && s % 600 === 30) m.onFeed({ t: 'story:news', day: world.day() });
    if (world.facts.has('v6') && s % 900 === 450) m.onFeed({ t: 'harbor:ship', kind: 'cargo', op: 'arrive', id: 'c' + s, leaves: world.T + 240 });
    // the bot: accept bubbles, then work on what it holds (an action every 6–20 s per mission)
    for (const i of m.bubbles()) if (m.acceptedRequests() < 3 && rng.chance(0.05)) m.accept(i.id);
    for (const i of m.list.slice()) {
      if (i.s !== 'a' && i.s !== 'b') continue;
      if (!work.has(i.id)) work.set(i.id, world.T + rng.between(6, 20));
      if (world.T < work.get(i.id)) continue;
      work.set(i.id, world.T + rng.between(6, 20));
      const t = tpl(i.c), U = unitsOf(t);
      const j = U.findIndex((u, k) => i.g[k] < u.need);
      if (j < 0) continue;
      const u = U[j];
      if (u.t === 'deliver') { const it = u.item || u.any[0]; if (['item_bouquet', 'item_cake', 'item_gift_box', 'item_letter'].indexOf(it) >= 0) m.craft(it, 2); m.delivered(i.id, it, Math.ceil(u.need / 3)); }
      else if (u.t === 'count') { const ev = feedFor(u.sig, Math.ceil(u.need / 4)); if (ev) m.onFeed(ev); else if (u.sig === 'req_done' || u.sig === 'celebrate') m.signal(u.sig, 1); }
      else if (u.t === 'step') m.step(i.id, u.how, 1, { stars: 1 + rng.int(3) });
      else if (u.t === 'build') m.onFeed({ t: 'built', key: u.key });
    }
    for (const e of m.drain()) {
      e.T = world.T;
      events.push(e);
      if (e.t === 'mission:offer') {
        offers.push({ code: e.code, T: world.T, day: world.day() });
        // the oracle: everything the template needs is really there right now
        const t = tpl(e.code);
        for (const c of requirements(t)) {
          const ok = c.startsWith('fame:') ? m.fame.pts >= Number(c.slice(5)) : /^(shops|towers):/.test(c) ? world.counts[c.split(':')[0]] >= Number(c.split(':')[1]) : world.facts.has(c);
          if (!ok) problems.push(e.code + ' offered without ' + c + ' at T ' + world.T);
        }
        if (e.gv && !world.roster[e.gv]) problems.push(e.code + ' giver missing');
        if (e.w && !e.w.startsWith('p:') && !world.roster[e.w]) problems.push(e.code + ' recipient missing');
      }
      if (e.t === 'mission:done') completions++;
      if (e.t === 'fame:pts') { if (e.total < lastFame) problems.push('fame went down'); lastFame = e.total; }
    }
    maxBubbles = Math.max(maxBubbles, m.bubbles().length);
    maxAccepted = Math.max(maxAccepted, m.acceptedRequests());
  }
  return { m, world, events, offers, problems, completions, maxBubbles, maxAccepted };
}

test('30 simulated game days: ≥ 3 offers a day, cooldowns kept, every offer doable (oracle), caps kept, fame monotonic', () => {
  const r = simulate(11, 30);
  assert.deepEqual(r.problems, []);
  const perDay = new Map();
  for (const o of r.offers) perDay.set(o.day, (perDay.get(o.day) || 0) + 1);
  for (let d = 0; d < 30; d++) assert.ok((perDay.get(d) || 0) >= 3, 'day ' + d + ' offers ' + (perDay.get(d) || 0));
  // cooldowns: the same template never comes back within its repeat time; 'once' at most once
  const last = new Map();
  for (const o of r.offers) {
    const t = tpl(o.code);
    if (t.repeat === 'once') assert.ok(!last.has(o.code), o.code + ' offered twice');
    else if (typeof t.repeat === 'number' && last.has(o.code)) assert.ok(o.T - last.get(o.code) >= t.repeat * 60, o.code + ' within cooldown');
    else if (t.repeat === 'day' && last.has(o.code)) assert.ok(o.T - last.get(o.code) >= 600, o.code + ' twice a day');
    last.set(o.code, o.T);
  }
  assert.ok(r.maxBubbles <= 4, 'bubbles ' + r.maxBubbles);
  assert.ok(r.maxAccepted <= 3, 'accepted ' + r.maxAccepted);
  assert.ok(r.completions >= 30 * 4, 'completions ' + r.completions);
  // every kind of mission was seen, from every version's district
  const codes = new Set(r.offers.map((o) => o.code));
  for (const c of ['A1', 'B1', 'B4', 'C1', 'C2', 'C3', 'C9', 'D2', 'E1', 'A17', 'C10', 'A19', 'B11']) assert.ok(codes.has(c), c + ' offered');
  // titles were reached in order, each once
  const titles = r.events.filter((e) => e.t === 'fame:title').map((e) => e.level);
  assert.deepEqual(titles, titles.slice().sort((a, b) => a - b));
  assert.equal(new Set(titles).size, titles.length);
  assert.ok(titles.length >= 2, 'titles reached: ' + titles.join(','));
  // nothing stuck: no board / accepted mission older than 3 game days at the end (parked cards may wait)
  for (const i of r.m.list) if (i.s === 'a' || i.s === 'b') assert.ok(r.world.T - i.t0 < 1800 || i.d, i.c + ' stuck since ' + i.t0);
  // the numbers for the build report (one line, TAP comment)
  const done = r.events.filter((e) => e.t === 'mission:done');
  const byKind = {};
  for (const e of done) { const k = tpl(e.code).kind; byKind[k] = (byKind[k] || 0) + 1; }
  const days = Array.from({ length: 30 }, (_, d) => perDay.get(d) || 0);
  const titleDay = {};
  for (const e of r.events) if (e.t === 'fame:title' && !(e.level in titleDay)) titleDay[e.level] = e.day !== undefined ? e.day : null;
  console.log('# stats ' + JSON.stringify({ offersPerDay: { min: Math.min(...days), avg: +(days.reduce((a, b) => a + b, 0) / 30).toFixed(1), max: Math.max(...days) },
    completions: r.completions, perDay: +(r.completions / 30).toFixed(1), byKind, coins: done.reduce((a, e) => a + (e.coins || 0), 0),
    fame: r.m.fameInfo().pts, title: r.m.fameInfo().title, titles, distinctCodes: codes.size, maxBubbles: r.maxBubbles, maxAccepted: r.maxAccepted, sliceBytes: JSON.stringify(r.m.serialize()).length }));
});

test('determinism: same seed → same events; a save / reload mid-run → the same run', () => {
  const a = simulate(5, 6), b = simulate(5, 6), c = simulate(5, 6, { reloadAt: 1777 });
  const ser = (r) => JSON.stringify(r.events.filter((e) => e.t !== 'daily:new' && e.t !== 'weekly:new'));
  assert.equal(ser(a), ser(b));
  assert.equal(JSON.stringify(a.m.serialize()), JSON.stringify(b.m.serialize()));
  assert.equal(ser(a), ser(c));
  assert.equal(JSON.stringify(a.m.serialize()), JSON.stringify(c.m.serialize()));
});

// ---------------------------------------------------------------------------------------------------- calendar
test('calendar keys: 05:00 reset, midnight, DST and week keys', () => {
  assert.equal(dayKey({ y: 2026, m: 10, d: 9, h: 4.98 }), dayKey({ y: 2026, m: 10, d: 8, h: 23 }));
  assert.equal(dayKey({ y: 2026, m: 10, d: 9, h: 5 }), dayKey({ y: 2026, m: 10, d: 8, h: 5 }) + 1);
  assert.equal(dayKey({ y: 2026, m: 10, d: 10, h: 0.5 }), dayKey({ y: 2026, m: 10, d: 9, h: 23.9 }));
  // DST: local fields skip 02:00 → 03:00 (or repeat 01:00); the key depends only on the date and the 05:00 line
  assert.equal(dayKey({ y: 2026, m: 3, d: 29, h: 3 }), dayKey({ y: 2026, m: 3, d: 29, h: 1.9 }));
  assert.equal(dayKey({ y: 2026, m: 3, d: 29, h: 5.01 }), dayKey({ y: 2026, m: 3, d: 29, h: 4.9 }) + 1);
  // Monday 05:00: Sunday 23:00 and Monday 04:00 are the old week, Monday 05:00 the new one (2026-10-12 is a Monday)
  const sun = dayKey({ y: 2026, m: 10, d: 11, h: 23 }), mon4 = dayKey({ y: 2026, m: 10, d: 12, h: 4 }), mon5 = dayKey({ y: 2026, m: 10, d: 12, h: 5 });
  assert.equal(weekKey(sun), weekKey(mon4));
  assert.equal(weekKey(mon5), weekKey(sun) + 7);
});

test('rollover: across 05:00, clock moved backward (no re-roll, no double count), one rollover per launch', () => {
  const world = new FakeWorld({ rank: 2, wall0: Date.UTC(2026, 9, 9, 4, 30) });
  let m = mk(world, null);
  world.advance(1); m.tick();
  let ev = m.drain();
  const d0 = m.today().d;
  assert.ok(ev.some((e) => e.t === 'daily:new'));
  // 04:30 → 05:10: a new day
  world.advance(40 * 60); m.tick();
  ev = m.drain();
  assert.equal(m.today().d, d0 + 1);
  assert.ok(ev.some((e) => e.t === 'daily:new'));
  const ids = m.today().list.map((x) => x.code);
  // finish one daily, move the clock back a day: the same dailies stay, nothing re-opens or pays twice
  const code = ids[0];
  for (const u of unitsOf(tpl(code))) for (let g = 0; g < u.need;) { m.onFeed(feedFor(u.sig, 5)); g += feedGives(u.sig, 5); }
  ev = m.drain();
  assert.equal(ev.filter((e) => e.t === 'daily:done').length, 1);
  world.setWall(Date.UTC(2026, 9, 9, 10)); world.advance(1); m.tick();
  ev = m.drain();
  assert.ok(!ev.some((e) => e.t === 'daily:new'), 'no reroll on a clock moved back');
  assert.deepEqual(m.today().list.map((x) => x.code), ids);
  for (const u of unitsOf(tpl(code))) m.onFeed(feedFor(u.sig, 99));
  assert.equal(m.drain().filter((e) => e.t === 'daily:done').length, 0, 'no double count');
  // the 05:00 roll above was this launch's rollover: a phone clock pushed forward now changes nothing …
  world.setWall(Date.UTC(2026, 9, 11, 10)); world.advance(1); m.tick();
  assert.ok(!m.drain().some((e) => e.t === 'daily:new'), 'second rollover in one launch');
  // … until the next launch; then forward twice in that launch: only the first rolls
  m = new MissionModel(cfg(), world.env, m.serialize());
  world.setWall(Date.UTC(2026, 9, 12, 10)); world.advance(1); m.tick();
  assert.ok(m.drain().some((e) => e.t === 'daily:new'));
  const d2 = m.today().d;
  world.setWall(Date.UTC(2026, 9, 14, 10)); world.advance(1); m.tick();
  assert.ok(!m.drain().some((e) => e.t === 'daily:new'));
  assert.equal(m.today().d, d2);
  // the next launch (a reload) rolls
  m = new MissionModel(cfg(), world.env, m.serialize());
  world.advance(1); m.tick();
  assert.ok(m.drain().some((e) => e.t === 'daily:new'));
  assert.equal(m.today().d, d2 + 2);
});

test('streak + 눈사람 방패: one missed day a week is forgiven, a second one is not', () => {
  const world = new FakeWorld({ rank: 2, wall0: Date.UTC(2026, 9, 12, 9) });     // Monday
  const m = mk(world, null);
  const doAll = () => { for (const it of m.today().list) for (const u of unitsOf(tpl(it.code))) for (let g = 0; g < u.need;) { m.onFeed(feedFor(u.sig, 9)); g += feedGives(u.sig, 9); } };
  const nextDay = (k = 1) => { world.setWall(world.env.wall() + k * 86400000); m.cal.rolled = false; world.advance(1); m.tick(); m.drain(); };
  world.advance(1); m.tick(); m.drain();
  doAll(); assert.equal(m.streak().n, 1);                 // Mon
  nextDay(); doAll(); assert.equal(m.streak().n, 2);      // Tue (+10 fame)
  nextDay(2); doAll(); assert.equal(m.streak().n, 3);     // Thu: Wed missed, the shield forgives it
  assert.equal(m.streak().shield, false);
  nextDay(2); doAll(); assert.equal(m.streak().n, 1);     // Sat: Fri missed, no shield left this week
  nextDay(3); doAll(); assert.equal(m.streak().n, 1);     // next Tue (Sun, Mon missed — 2 days): a fresh start
  nextDay(2); doAll(); assert.equal(m.streak().n, 2);     // Thu: a new week's shield
});

test('streak rewards: day 2 fame, day 3 a free 꽃밭, day 5 income, day 7 fame + crown', () => {
  const world = new FakeWorld({ rank: 2, wall0: Date.UTC(2026, 9, 12, 9) });
  const m = mk(world, null);
  const all = [];
  for (let d = 0; d < 7; d++) {
    world.setWall(Date.UTC(2026, 9, 12 + d, 9)); m.cal.rolled = false; world.advance(1); m.tick();
    for (const it of m.today().list) for (const u of unitsOf(tpl(it.code))) for (let g = 0; g < u.need;) { m.onFeed(feedFor(u.sig, 9)); g += feedGives(u.sig, 9); }
    all.push(...m.drain());
  }
  const days = all.filter((e) => e.t === 'streak:day');
  assert.deepEqual(days.map((e) => e.n), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(days[1].fame, 10);
  assert.ok(all.some((e) => e.t === 'reward' && e.kind === 'voucher' && e.key === 'deco_flowers'));
  assert.ok(days[4].coins >= 3 * 1800);
  assert.equal(days[6].fame, 50);
  assert.equal(m.fameInfo().flairs.crown, 'streak');
});

// ---------------------------------------------------------------------------------------------------- board
test('park / resume keeps progress; 다른 미션 only after 120 s without progress', () => {
  const world = new FakeWorld({ rank: 2 });
  const m = mk(world, null);
  for (let s = 0; s < 30; s++) { world.advance(1); m.tick(); }
  const card = m.board().find((i) => unitsOf(tpl(i.c)).some((u) => u.t === 'count'));
  assert.ok(card, 'a counting card on the board');
  const u = unitsOf(tpl(card.c)).find((x) => x.t === 'count');
  m.onFeed(feedFor(u.sig, 3));
  const got = card.g.slice();
  assert.ok(got.some((v) => v > 0));
  assert.equal(m.canSwap(card.id), false);
  for (let s = 0; s < 121; s++) { world.advance(1); m.tick(); }
  assert.equal(m.canSwap(card.id), true);
  assert.ok(m.swap(card.id));
  assert.equal(card.s, 'p');
  assert.equal(m.board().length, 3, 'a fresh card at once');
  assert.ok(!m.board().some((i) => i.c === card.c), 'not the one just parked');
  // later the parked card comes back with its progress
  let back = null;
  for (let s = 0; s < 4000 && !back; s++) {
    world.advance(1); m.tick();
    for (const i of m.board()) if (i.s === 'b' && m.canSwap(i.id) && i.id !== card.id) m.swap(i.id);
    if (card.s === 'b') back = card;
  }
  assert.ok(back, 'the parked card resumed');
  assert.deepEqual(back.g, got);
});

test('reward = max(payFloor × era, pay × I) rounded to 10; stars scale drives; fame fixed', () => {
  const world = new FakeWorld({ rank: 2, facts: ['b:yard', 'veh:sled'], income: 50 });
  const m = mk(world, null);
  world.advance(1);
  let inst = force(m, 'A1', 'a');
  let done = finish(m, world, inst);
  assert.equal(done.coins, 100);                       // 0.3 × 50 = 15 < floor 100
  assert.equal(done.fame, 5);
  world.I = 2000; world.rank(3);
  inst = force(m, 'D3', 'b');
  done = finish(m, world, inst);
  assert.equal(done.coins, 2000);                      // 1.0 × 2000
  world.I = 3333;
  inst = force(m, 'A11', 'a');
  done = finish(m, world, inst);
  assert.equal(done.coins, 2000);                      // 0.6 × 3333 = 1999.8 → 2000
  world.I = 1000;
  const sled = force(m, 'B1', 'b');
  m.step(sled.id, 'drive', 1, { stars: 2 });
  done = m.drain().find((e) => e.t === 'mission:done');
  assert.equal(done.coins, 680);                       // 0.8 × 0.85 × 1000
  assert.equal(done.fame, 12);
  const sled3 = force(m, 'B2', 'b');
  m.step(sled3.id, 'drive', 1, { stars: 3 });
  done = m.drain().find((e) => e.t === 'mission:done');
  assert.equal(done.fame, 18 + 5);                     // ★★★ + bonus
  // at 도시 the floor doubles
  world.I = 10; inst = force(m, 'A2', 'a');
  assert.equal(finish(m, world, inst).coins, 200);
});

test('requests: ≤ 4 bubbles, ≤ 2 on screen, ≤ 3 accepted; untouched bubbles pop after 6 min', () => {
  const world = new FakeWorld({ rank: 2, onScreen: ['v:npc_aunt', 'v:npc_grandma', 'v:npc_kid_boy', 'v:npc_kid_girl', 'v:npc_grandpa', 'pet:pet_cat'] });
  const m = mk(world, null);
  let maxOn = 0, pops = 0;
  for (let s = 0; s < 3000; s++) {
    world.advance(1); m.tick();
    const b = m.bubbles();
    assert.ok(b.length <= 4);
    maxOn = Math.max(maxOn, b.filter((i) => world.screen.has(i.gv)).length);
    for (const e of m.drain()) if (e.t === 'mission:expire' && e.why === 'pop') pops++;
  }
  assert.ok(maxOn <= 2, 'on screen ' + maxOn);
  assert.ok(pops > 0);
  // accepted cap
  const m2 = mk(new FakeWorld({ rank: 2 }), null);
  const w2 = new FakeWorld({ rank: 2 });
  const m3 = mk(w2, null);
  const ids = [];
  for (const c of ['A1', 'A2', 'A6', 'A14']) ids.push(force(m3, c, 'o').id);
  assert.ok(m3.accept(ids[0]).ok && m3.accept(ids[1]).ok && m3.accept(ids[2]).ok);
  assert.deepEqual(m3.accept(ids[3]), { ok: false, why: 'full' });
  assert.ok(m2);
});

test('focus rule: an event due soon → an accepted request → the board card with most progress', () => {
  const world = new FakeWorld({ rank: 2, facts: ['life', 'b:store'] });
  const m = mk(world, null);
  for (let s = 0; s < 20; s++) { world.advance(1); m.tick(); }
  const top = m.board().reduce((a, b) => (m.fraction(b) > m.fraction(a) ? b : a));
  const best = m.board()[1];
  const u = unitsOf(tpl(best.c));
  const j = u.findIndex((x) => x.t === 'count');
  if (j >= 0) { m.onFeed(feedFor(u[j].sig, 2)); assert.equal(m.focus().id, best.id); } else assert.ok(top);
  const req = force(m, 'A1', 'o');
  m.accept(req.id);
  assert.equal(m.focus().id, req.id);
  const ev = force(m, 'C9', 'a');                 // due in 300 s: not yet urgent (75 s)
  assert.equal(m.focus().id, req.id);
  world.advance(240); m.tick();
  assert.equal(m.focus().id, ev.id);
});

test('event missions: wedding prep / speech, birthday once a day, welcome party, the first paper once', () => {
  const world = new FakeWorld({ rank: 2, facts: ['life', 'paper', 'b:store'] });
  const m = mk(world, null);
  world.advance(1); m.tick(); m.drain();
  m.onFeed({ t: 'story:life', op: 'engaged', who: 't:31', id: 'w1', at: world.T + 700 });
  m.onFeed({ t: 'story:life', op: 'engaged', who: 't:31', id: 'w1', at: world.T + 700 });   // (the same event twice)
  let ev = m.drain();
  assert.equal(ev.filter((e) => e.t === 'mission:offer' && e.code === 'C1').length, 1);
  const c1 = m.active().find((i) => i.c === 'C1');
  assert.equal(c1.d, world.T + 700);
  m.onFeed({ t: 'story:life', op: 'birthday', who: 't:58', family: 't:12' });
  m.onFeed({ t: 'story:life', op: 'birthday', who: 't:47', family: 't:12' });
  ev = m.drain();
  assert.equal(ev.filter((e) => e.t === 'mission:offer' && e.code === 'C9').length, 1);
  assert.equal(ev.filter((e) => e.t === 'mission:offer' && e.code === 'A12').length, 1);
  m.onFeed({ t: 'settlers', n: 3 }); m.onFeed({ t: 'settlers', n: 3 });
  world.advance(1); m.tick();
  ev = m.drain();
  assert.equal(ev.filter((e) => e.code === 'C5' && e.t === 'mission:offer').length, 1);
  m.onFeed({ t: 'story:news', day: 1 }); m.onFeed({ t: 'story:news', day: 2 });
  ev = m.drain();
  assert.equal(ev.filter((e) => e.code === 'C15' && e.t === 'mission:offer').length, 1);
  // a deadline passes: the mission ends gently (no coins taken, no fame lost)
  const fame0 = m.fame.pts;
  world.advance(800); m.tick();
  ev = m.drain();
  assert.ok(ev.some((e) => e.t === 'mission:expire' && e.code === 'C1' && e.why === 'late'));
  assert.equal(m.fame.pts, fame0);
});

test('story_runtime payloads (engine ids + *Pid): couples, babies and birthdays reach the right residents', () => {
  const world = new FakeWorld({ rank: 2, facts: ['life', 'paper', 'b:store'] });
  const m = mk(world, null);
  world.advance(1); m.tick(); m.drain();
  // engaged: { a, b } engine ids with aPid / bPid (src/story/host.js out()); the same couple twice → one C1
  m.onFeed({ t: 'story:life', op: 'engaged', a: 12, b: 14, aPid: 't:31', bPid: 't:47', day: 1, hour: 9 });
  m.onFeed({ t: 'story:life', op: 'engaged', a: 12, b: 14, aPid: 't:31', bPid: 't:47', day: 1, hour: 9 });
  let ev = m.drain();
  assert.equal(ev.filter((e) => e.t === 'mission:offer' && e.code === 'C1').length, 1);
  // baby: the gift goes to the family (bPid)
  m.onFeed({ t: 'story:life', op: 'baby', a: 12, b: 14, baby: 40, aPid: 't:31', bPid: 't:47', babyPid: 't:58' });
  ev = m.drain();
  const c3 = m.list.find((i) => i.c === 'C3');
  assert.ok(c3, 'C3 offered');
  assert.equal(c3.w, 't:47');
  // birthday: { who, whoPid } → the cake for the birthday person's family (here: the person)
  m.onFeed({ t: 'story:life', op: 'birthday', who: 7, whoPid: 't:58', age: 9 });
  ev = m.drain();
  const c9 = m.list.find((i) => i.c === 'C9');
  assert.ok(c9, 'C9 offered');
  assert.equal(c9.w, 't:58');
  // someone the game cannot show (no pid): no mission, no crash
  const n0 = m.list.length;
  m.onFeed({ t: 'story:life', op: 'wish', who: 99 });
  m.onFeed({ t: 'story:move', op: 'in', household: 3, members: [99, 100], home: 'h1' });
  assert.equal(m.list.filter((i) => i.c === 'C7' || i.c === 'A8').length, 0);
  assert.ok(m.list.length >= n0);
  // three wishes for a real elder: an escort only story_runtime can report; if it never does, it ends gently
  m.onFeed({ t: 'story:life', op: 'wish', who: 3, whoPid: 't:47' });
  const c7 = m.list.find((i) => i.c === 'C7');
  assert.ok(c7 && c7.nm === 't:47', 'C7 for the elder');
  m.drain();
  world.advance(cfg().eventStale + 2); m.tick();
  ev = m.drain();
  assert.ok(ev.some((e) => e.t === 'mission:expire' && e.code === 'C7' && e.why === 'late'), 'stale event ends');
});

test('gentle expiry: the recipient moves away → the request ends quietly and its letter leaves the bag', () => {
  const world = new FakeWorld({ rank: 2 });
  const m = mk(world, null);
  world.advance(1); m.tick(); m.drain();
  const i = force(m, 'A4', 'o', {});
  assert.ok(m.accept(i.id).ok);
  assert.equal(m.bag.item_letter, 1);
  delete world.roster[i.w];
  for (let s = 0; s < 6; s++) { world.advance(1); m.tick(); }
  const ev = m.drain();
  assert.ok(ev.some((e) => e.t === 'mission:expire' && e.id === i.id && e.why === 'gone'));
  assert.equal(m.bag.item_letter, 0);
});

test('fame: titles at 150 / 400 / 900 / 2000 with their rewards, passive riders fame', () => {
  const world = new FakeWorld({ rank: 2 });
  const m = mk(world, null);
  m.fameAdd(149, 't'); assert.equal(m.fameInfo().title, 1);
  m.fameAdd(1, 't');
  let ev = m.drain();
  assert.ok(ev.some((e) => e.t === 'fame:title' && e.level === 2));
  assert.ok(ev.some((e) => e.t === 'reward' && e.key === 'music_stand'));
  assert.ok(ev.some((e) => e.t === 'reward' && e.key === 'bankSite'));
  m.fameAdd(2000, 't');
  ev = m.drain();
  assert.deepEqual(ev.filter((e) => e.t === 'fame:title').map((e) => e.level), [3, 4, 5]);
  assert.equal(m.fameInfo().flairs.crown, 'gold');
  const p = m.fame.pts;
  m.onFeed({ t: 'train', ev: 'arrive', n: 60 });
  assert.equal(m.fame.pts, p + 2);
  m.onFeed({ t: 'train', ev: 'arrive', n: 15 });
  assert.equal(m.fame.pts, p + 3);
});

test('combo (5 requests within 15 min → +5 fame each after) and the three-star drive streak', () => {
  const world = new FakeWorld({ rank: 2, facts: ['b:yard', 'veh:sled'] });
  const m = mk(world, null);
  world.advance(1);
  const fameOf = () => m.fame.pts;
  for (let k = 0; k < 5; k++) { const i = force(m, ['A1', 'A2', 'A6', 'A14', 'A11'][k], 'a'); finish(m, world, i); world.advance(60); }
  assert.equal(m.cb.on, true);
  const f0 = fameOf();
  const i = force(m, 'A1', 'a'); m.cool = {}; finish(m, world, i);
  assert.equal(fameOf() - f0, 5 + 5);
  for (let k = 0; k < 3; k++) { m.cool = {}; const d = force(m, 'B1', 'b'); m.step(d.id, 'drive', 1, { stars: 3 }); }
  const ev = m.drain();
  assert.ok(ev.some((e) => e.t === 'reward' && e.key === 'driver'));
  assert.equal(m.fameInfo().flairs.driver, true);
});

// ---------------------------------------------------------------------------------------------------- save
test('save slice: round trip, sanitize is idempotent, 200 fuzzed slices never break it, the cap holds', () => {
  const r = simulate(3, 4);
  const s = r.m.serialize();
  assert.deepEqual(sanitizeMissions(s), sanitizeMissions(sanitizeMissions(s)));
  const again = new MissionModel(cfg(), r.world.env, JSON.parse(JSON.stringify(s)));
  assert.equal(JSON.stringify(again.serialize()), JSON.stringify(s));
  assert.ok(JSON.stringify(s).length <= MISSIONS_SLICE.cap, 'size ' + JSON.stringify(s).length);
  const rng = new Rng(99);
  const junk = [null, 0, 'x', [], {}, { v: 2 }, { v: 1, b: 'no' }, { v: 1, b: [{ c: 'ZZ', i: 1 }] }, { v: 1, fm: { p: -5 } }, { v: 1, c: { A1: 'soon' } }];
  const mutate = (o, depth = 0) => {
    if (o && typeof o === 'object') {
      const out = Array.isArray(o) ? o.slice() : Object.assign({}, o);
      for (const k of Object.keys(out)) {
        const x = rng.next();
        if (x < 0.08) delete out[k];
        else if (x < 0.16) out[k] = rng.pick([null, -1, 1e12, 'str', [], {}, NaN, true, 3.7]);
        else if (depth < 4) out[k] = mutate(out[k], depth + 1);
      }
      return out;
    }
    return o;
  };
  for (let k = 0; k < 200; k++) {
    const raw = k < junk.length ? junk[k] : mutate(JSON.parse(JSON.stringify(s)));
    let c;
    assert.doesNotThrow(() => { c = sanitizeMissions(raw); });
    if (!c) continue;
    assert.deepEqual(sanitizeMissions(JSON.parse(JSON.stringify(c))), c, 'idempotent ' + k);
    let mm;
    assert.doesNotThrow(() => { mm = new MissionModel(cfg(), r.world.env, c); for (let t = 0; t < 30; t++) { r.world.advance(1); mm.tick(); } mm.drain(); });
    assert.ok(JSON.stringify(fitCap(mm.serialize())).length <= MISSIONS_SLICE.cap);
  }
  // a fat slice is trimmed to the cap without losing the board, the calendar or fame
  const fat = JSON.parse(JSON.stringify(s));
  fat.p = Array.from({ length: 6 }, (_, k) => ({ i: 900 + k, c: 'D' + (k + 1), t0: 1, g: [5], tp: 3, gv: 'v:npc_grandma_with_a_long_name' }));
  fat.o = Array.from({ length: 4 }, (_, k) => ({ i: 950 + k, c: 'A' + (k + 1), t0: 1, gv: 'v:npc_grandma', w: 'v:npc_grandpa', k: 'kkkkkkkkkkkkkkkkkkkkkkkk' }));
  fat.c = Object.fromEntries(CATALOG.slice(0, 80).map((t) => [t.code, 99999999]));
  const cut = fitCap(sanitizeMissions(fat));
  assert.ok(JSON.stringify(cut).length <= MISSIONS_SLICE.cap);
  assert.deepEqual(cut.b, sanitizeMissions(fat).b);
  assert.deepEqual(cut.fm.p, sanitizeMissions(fat).fm.p);
});

test('BALANCE.v5.missions overrides tuning one level deep', () => {
  const t = missionsTuning({ board: 4, daily: { count: 2 }, bogus: 1 });
  assert.equal(t.board, 4); assert.equal(t.daily.count, 2); assert.equal(t.daily.pay, 0.5); assert.ok(!('bogus' in t));
  assert.equal(MISSIONS_TUNING.board, 3);
});

// ---------------------------------------------------------------------------------------------------- perf
test('perf: ≤ 0.02 ms per tick (60 fps, feed events included)', () => {
  const world = new FakeWorld({ rank: 3, facts: ['life', 'b:depot', 'b:store', 'b:deco_flowers', 'b:town_hall'] });
  const m = mk(world, null);
  for (let s = 0; s < 600; s++) { world.advance(1); m.tick(); }
  m.drain();
  const N = 60 * 600;     // 10 game minutes at 60 fps
  const t0 = performance.now();
  for (let k = 0; k < N; k++) {
    world.advance(1 / 60);
    m.tick();
    if (k % 30 === 0) m.onFeed({ t: 'sold', item: 'item_bread', n: 1, value: 7 });
    if (k % 45 === 0) m.onFeed({ t: 'produced', item: 'item_plank', n: 1 });
    if (k % 600 === 0) m.drain();
  }
  const ms = (performance.now() - t0) / N;
  console.log('    missions: ' + ms.toFixed(4) + ' ms per tick (' + N + ' ticks)');
  assert.ok(ms <= 0.02, ms + ' ms');
});
