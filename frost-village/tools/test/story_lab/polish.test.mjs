// story_runtime polish regressions (docs/build_reports/story_runtime_critique.md H1–H11, M1–M15, L1–L11): reloads that
// replay nothing the player saw, t0 and pids in the slice, departed elders who leave, the missions_bank contract, a
// busy stage, story children's bodies, per-age townfolk2 pages, villagers who talk in our village, promised beats after
// a reload, the life switch, the retried first proposal, the paper's bank line, the garden's stone slots.
//   nice -n 15 node --test tools/test/story_lab/polish.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { StoryHost } from '../../../src/story/host.js';
import { sanitizeSlice, makeSlice, SLICE_CAP, SLICE_VERSION, MIGRATE_SLICE } from '../../../src/story/save.js';
import { LifeDirector } from '../../../src/story/model/lifeRules.js';
import { MODULE, beatPlan, FRAGMENTS } from '../../../src/story/index.js';
import { makeFakePorts, run, MemStorage, DAY, HOUR } from './fakePorts.mjs';
import { NodeWorkerTransport } from './nodeTransport.mjs';
import { createChatBridge } from '../../../src/story/chatBridge.js';
import { StoryBridge } from '../../../src/chat/storyBridge.js';
// the real missions_bank model (read-only import: the cross-module contract, critique H5)
import { MissionModel } from '../../../src/missions/model/missions.js';
import { missionsTuning } from '../../../src/missions/tuning.js';
import { FakeWorld } from '../missions_lab/fake_world.mjs';

const SIDE_KEY = 'frostVillage.save.v1.story';

async function boot(opts = {}) {
  const F = makeFakePorts(opts);
  if (opts.mutate) opts.mutate(F);
  const host = new StoryHost(F.ports, opts.saved, Object.assign({ transport: opts.transport || 'inline' }, opts.hostOpts || {}));
  const r = await host.start();
  return Object.assign(F, { host, start: r });
}
const lifeOps = (rec, op) => rec.events.filter((e) => e[0] === 'story:life' && (!op || e[1].op === op));
/** run until cond() or `max` game seconds (steps of `chunk` s) */
async function until(B, cond, max, chunk = 5) { for (let t = 0; t < max && !cond(); t += chunk) await run(B.host, B.clock, chunk); return !!cond(); }

test('H1: the tab dies after the wedding (side record a day old): the reload replays nothing the player saw', async () => {
  const storage = new MemStorage();
  const A = await boot({ rank: 2, storage, T0: 2 * DAY + 9 * HOUR });
  // the game's 5 s autosave: the slice every time, the side record at most once a game day (unforced)
  let daily = null;
  while (A.clock.T < 3 * DAY + 14 * HOUR) {
    await run(A.host, A.clock, 5);
    await A.host.saveSide(false);
    if (!daily && A.clock.T >= 3 * DAY) daily = storage.getItem(SIDE_KEY);      // the record of d3 00:00
  }
  assert.equal(lifeOps(A.rec, 'wedding').length, 1, 'the first wedding happened');
  const wc = A.rec.cards.find((c) => c.kind === 'weddingday');
  assert.ok(wc && wc.watch, 'the first wedding\'s morning card offers 보러 가기 (M9)');
  const slice = JSON.parse(JSON.stringify(A.host.serialize()));
  const T = A.clock.T;
  // the tab died after the wedding: the forced saves after it never reached storage, the d3 00:00 record is on disk
  assert.ok(JSON.parse(daily).T < 3 * DAY + 10 * HOUR, 'the daily record is from before the wedding');
  storage.setItem(SIDE_KEY, daily);
  A.host.destroy();
  const B = await boot({ rank: 2, storage, saved: slice, T0: T });
  assert.equal(B.start.restored, true);
  const beats = [];
  B.host.on('beatEnd', (b) => beats.push(b.kind));
  B.host.on('ui:banner', (b) => beats.push('banner:' + b.ko));
  await run(B.host, B.clock, 120);
  assert.equal(lifeOps(B.rec, 'wedding').length, 0, 'no second wedding event for missions (C2, fame)');
  assert.ok(!beats.some((k) => /wedding|proposal|결혼/.test(k)), 'no replayed wedding beat or banner: ' + beats.join(','));
  assert.ok(B.host.quietUntil === null, 'the quiet catch-up ended');
  assert.ok(B.host.stats.quiet > 0, 'the replayed events were handled quietly');
  B.host.destroy();
});

test('H1: in worker mode a forced side save lands without frames (a hidden page)', async () => {
  const storage = new MemStorage();
  const F = makeFakePorts({ rank: 1, storage });
  const host = new StoryHost(F.ports, undefined, { transport: new NodeWorkerTransport() });
  await host.start();
  await run(host, F.clock, 30, { yieldEvery: 1 });
  const before = storage.getItem(SIDE_KEY);
  let resolved = false;
  host.saveSide(true).then(() => { resolved = true; });
  for (let i = 0; i < 100 && !resolved; i++) await new Promise((r) => setTimeout(r, 20));      // no host.update(): no frames
  assert.ok(resolved, 'the save promise resolved without a frame');
  assert.notEqual(storage.getItem(SIDE_KEY), before, 'the side record was written while hidden');
  await host.transport.close();
});

test('H2: t0 (when v5 began) survives the slice and every reload; the first good news and farewells keep their time', async () => {
  const raw = makeSlice({ day: 2, T: 1500, t0: 1425, ok: true, chars: 10, life: {}, happen: { last: -1 } });
  assert.equal(sanitizeSlice(JSON.parse(JSON.stringify(raw))).t0, 1425);
  assert.equal(MODULE.sanitize(raw).T, 1500);
  const storage = new MemStorage();
  let A = await boot({ rank: 2, storage, T0: 2 * DAY + 9 * HOUR });
  const t0 = A.host.t0, from = A.host.farewellFromDay();
  let slice = A.host.serialize();
  for (let s = 0; s < 4; s++) {               // four short sessions, an hour of play apart
    await run(A.host, A.clock, 60);
    await A.host.saveSide(true);
    slice = JSON.parse(JSON.stringify(A.host.serialize()));
    const T = A.clock.T + 3600;
    A.host.destroy();
    A = await boot({ rank: 2, storage, saved: slice, T0: T });
    assert.equal(A.host.t0, t0, 'session ' + s + ': t0 kept');
    assert.equal(A.host.farewellFromDay(), from, 'session ' + s + ': farewells still from day ' + from);
  }
  A.host.destroy();
});

test('H3: the slice speaks pids; a lost side record and a re-dealt town never make strangers expect a baby', async () => {
  const A = await boot({ rank: 2, storage: new MemStorage(), T0: 2 * DAY + 9 * HOUR });
  while (A.clock.T < 3 * DAY + 14 * HOUR) await run(A.host, A.clock, 5);
  const slice = JSON.parse(JSON.stringify(A.host.serialize()));
  assert.equal(slice.life.firstCouple.length, 2);
  for (const p of slice.life.firstCouple) assert.ok(/^[tvk]:/.test(p), 'a pid: ' + p);
  const T = A.clock.T;
  A.host.destroy();
  // the side record is lost and three new people sort before everybody else: every sid is dealt again
  const B = await boot({ rank: 2, storage: new MemStorage(), saved: slice, T0: T, mutate: (F) => {
    F.town.roster.unshift(
      { pid: 't:900', kind: 'citizen', townKind: 'adult', name: '도윤', nameEn: 'Doyun', age: 34, home: 'lot_a1', sex: 'm' },
      { pid: 't:901', kind: 'citizen', townKind: 'adult', name: '서아', nameEn: 'Seoa', age: 33, home: 'lot_a1', sex: 'f' },
      { pid: 't:902', kind: 'citizen', townKind: 'student', name: '하준', nameEn: 'Hajun', age: 6, home: 'lot_a1', sex: 'm' });
  } });
  assert.equal(B.start.restored, false);
  while (B.clock.T < 6 * DAY + 4 * HOUR) await run(B.host, B.clock, 5);
  for (const [, d] of lifeOps(B.rec).filter((e) => e[1].op === 'goodnews' || e[1].op === 'baby')) {
    const fam = await B.host.query('family', { sid: d.a });
    assert.equal(fam.spouse, d.b, `good news only for a married couple (${d.aPid} + ${d.bPid})`);
  }
  // the engine itself refuses 'expect' for two people who are not a married couple of grown-ups
  const rows = await B.host.query('people');
  const elders = rows.filter((r) => r[2] >= 70).slice(0, 2);
  assert.equal(await B.host.arrange('expect', { a: elders[0][0], b: elders[1][0], inDays: 1 }), null);
  B.host.destroy();
  // a v1 slice (sids) migrates: the milestones stay, the sids go
  const v1 = { v: 1, day: 3, ok: 1, chars: 0, life: { seen: { wedding: true }, firstCouple: [94, 135], wishes: { 55: 1 }, wishActive: 55, names: [['t:3', '서아', 'Seoa']] }, happen: { last: 5 } };
  const m = sanitizeSlice(v1);
  assert.equal(m.v, SLICE_VERSION);
  assert.ok(m.life.seen.wedding);
  assert.deepEqual(m.life.firstCouple, []);
  assert.equal(m.life.wishActive, null);
  assert.equal(m.life.names.length, 1);
  assert.equal(typeof MIGRATE_SLICE[1], 'function');
});

test('H4 + H11: a departed elder leaves the town for good; a reload keeps the 09:00 card and the 10:00 garden farewell', async () => {
  const storage = new MemStorage();
  const tuning = { life: { farewellFirstAfterMin: 0 } };
  const A = await boot({ rank: 1, storage, hostOpts: { tuning } });
  let fw = null;
  A.host.on('story:life', (d) => { if (d.op === 'farewell' && !fw) fw = d; });
  await until(A, () => !!fw, 40 * DAY, 30);
  assert.ok(fw && fw.whoPid, 'a gentle farewell');
  const pid = fw.whoPid;
  assert.ok(A.rec.left.some((l) => l[0] === pid && l[1] === 'farewell'), 'ports.town.leave(pid, farewell)');
  assert.equal(A.host.registry.has(pid), false, 'unbound: no talk, scene or card can use the departed');
  assert.ok(!A.town.roster.some((r) => r.pid === pid), 'the town retired the body');
  const day = Math.floor(A.clock.T / DAY);
  while (A.clock.T < day * DAY + 6 * HOUR) await run(A.host, A.clock, 5);
  await A.host.saveSide(true);
  const slice = JSON.parse(JSON.stringify(A.host.serialize()));
  assert.ok(slice.life.booked.some((b) => b[0] === 'f' && b[1] === day), 'the farewell is a promised beat in the slice');
  const T = A.clock.T, town = A.town;
  A.host.destroy();
  const B = await boot({ rank: 1, storage, saved: slice, T0: T, town, hostOpts: { tuning } });
  assert.equal(B.start.restored, true);
  assert.equal(B.host.registry.has(pid), false, 'the departed is not adopted again');
  const got = [];
  B.host.on('ui:card', (c) => { if (c.kind === 'farewell') got.push(['card', (B.clock.T % DAY) / HOUR]); });
  B.host.on('beatEnd', (b) => { if (b.kind === 'farewell') got.push(['beat', (B.clock.T % DAY) / HOUR]); });
  while (B.clock.T < day * DAY + 12 * HOUR) await run(B.host, B.clock, 5);
  assert.ok(got.some((g) => g[0] === 'card' && Math.abs(g[1] - 9) < 0.3), 'the 09:00 card after the reload: ' + JSON.stringify(got));
  assert.ok(got.some((g) => g[0] === 'beat' && g[1] >= 10 && g[1] <= 11.3), 'the garden farewell after the reload: ' + JSON.stringify(got));
  assert.ok(!B.host.director.s.booked.some((b) => b[0] === 'f'), 'crossed off once played');
  B.host.destroy();
});

test('H11: a reload keeps the first school day (07:00) and an elder\'s last day (15:00)', async () => {
  const storage = new MemStorage();
  const A = await boot({ rank: 2, storage, T0: 4 * DAY + 1 * HOUR });
  const rows = await A.host.query('people');
  const kid = rows.find((r) => r[2] >= 5 && r[2] <= 12 && A.host.registry.pidOf(r[0]));
  const elder = rows.find((r) => r[2] >= 80 && A.host.registry.pidOf(r[0]) && /^t:/.test(A.host.registry.pidOf(r[0])));
  // the engine's events, as they come at 00:03: a 7th birthday (school tomorrow), an elder's last day (today 15:00)
  A.host.dispatch({ e: 'life', op: 'birthday', who: kid[0], age: 7, T: A.clock.T });
  A.host.dispatch({ e: 'life', op: 'lastday', who: elder[0], day: 5, T: A.clock.T });
  const school = lifeOps(A.rec, 'school')[0];
  assert.ok(school && school[1].whoPid === A.host.registry.pidOf(kid[0]), 'story:life op school names the child (missions C4)');
  await A.host.saveSide(true);
  const slice = JSON.parse(JSON.stringify(A.host.serialize()));
  assert.deepEqual(slice.life.booked.map((b) => b[0]).sort(), ['l', 's']);
  const T = A.clock.T;
  A.host.destroy();
  const B = await boot({ rank: 2, storage, saved: slice, T0: T + 60 });
  const ends = [];
  B.host.on('beatEnd', (b) => ends.push([b.kind, +((B.clock.T % DAY) / HOUR).toFixed(1), Math.floor(B.clock.T / DAY)]));
  while (B.clock.T < 5 * DAY + 8 * HOUR) await run(B.host, B.clock, 5);
  assert.ok(ends.some((e) => e[0] === 'lastday' && e[2] === 4 && e[1] >= 15 && e[1] < 15.5), 'the last day at 15:00: ' + JSON.stringify(ends));
  assert.ok(ends.some((e) => e[0] === 'school' && e[2] === 5 && e[1] >= 7 && e[1] < 7.5), 'the school day at 07:00: ' + JSON.stringify(ends));
  assert.equal(B.host.director.s.booked.filter((b) => b[0] === 's' || b[0] === 'l').length, 0, 'both crossed off');
  B.host.destroy();
});

test('H5: the missions_bank contract — wishes reach C7 (one elder, one wish at a time), a granted or expired wish frees the slot, school reaches C4', async () => {
  const A = await boot({ rank: 2, T0: 2 * DAY + 9 * HOUR });
  const world = new FakeWorld({ rank: 2, facts: ['life', 'b:store'] });
  const m = new MissionModel(missionsTuning(), world.env, null, { seed: 7 });
  world.advance(1); m.tick(); m.drain();
  let fed = 0;
  const feedMissions = () => {
    for (; fed < A.rec.events.length; fed++) {
      const [name, d] = A.rec.events[fed];
      if (!/^story:/.test(name)) continue;
      for (const k of ['whoPid', 'aPid', 'bPid']) if (typeof d[k] === 'string' && !world.roster[d[k]]) world.roster[d[k]] = { role: ['elder', 'adult'], name: { ko: d[k], en: d[k] } };
      m.onFeed(Object.assign({ t: name }, d));
    }
  };
  const wishCards = () => A.rec.events.filter((e) => e[0] === 'story:life' && e[1].op === 'wish').map((e) => e[1]);
  await until(A, () => wishCards().length >= 1, 3 * DAY);
  const w1 = wishCards()[0];
  assert.ok(w1 && Number.isInteger(w1.who) && w1.whoPid && w1.wish && w1.place, 'story:life op wish { who, whoPid, wish, place }');
  feedMissions();
  const c7 = m.list.find((i) => i.c === 'C7');
  assert.ok(c7 && c7.k === 's' + w1.who && c7.wi === w1.wish, 'missions spawned C7 for that elder');
  assert.equal(A.host.director.s.wishActive, w1.whoPid);
  // the chief escorts the elder: missions_bank's stage → its host sends mission:done { wish, who: engine id, key }
  m.step(c7.id, 'escort', 1);
  const st = m.drain().find((e) => e.t === 'mission:stage');
  assert.ok(st && st.wi === w1.wish);
  A.host.onFeed({ t: 'mission:done', id: st.id, code: st.code, stage: st.stage, wish: st.wi, who: /^s\d+$/.test(st.key) ? +st.key.slice(1) : null, key: st.key });
  const L = A.host.director.s;
  assert.equal(L.wishActive, null, 'the wish slot is free again');
  assert.equal(L.wishes[w1.whoPid], 1);
  assert.ok(L.wishDone[w1.whoPid].includes(w1.wish));
  // the next wish comes (the system never locks after one wish) and is never the same elder + wish again
  await until(A, () => wishCards().length >= 2, 2 * DAY);
  const w2 = wishCards()[1];
  assert.ok(w2, 'a second wish');
  assert.ok(!(w2.whoPid === w1.whoPid && w2.wish === w1.wish), 'not the granted wish again');
  feedMissions();
  if (w2.whoPid === w1.whoPid) assert.equal(m.list.filter((i) => i.c === 'C7').length, 1, 'the same elder: the next stage of the same C7');
  // nobody grants it: after wishTimeoutDays it ends (wishEnd) and the next wish is not that elder's same wish
  const n2 = wishCards().length;
  await until(A, () => wishCards().length > n2, 5 * DAY);
  const ends = lifeOps(A.rec, 'wishEnd');
  assert.ok(ends.length >= 1 && ends[ends.length - 1][1].whoPid === w2.whoPid, 'story:life op wishEnd for the late wish');
  const w3 = wishCards()[n2];
  assert.ok(w3 && !(w3.whoPid === w2.whoPid && w3.wish === w2.wish), 'the expired wish is not offered again to the same elder');
  // missions expired the C7 (or the elder's C7 finished): the slot is freed by key
  A.host.onFeed({ t: 'mission:expire', code: 'C7', why: 'late', key: 's' + w3.who });
  assert.equal(A.host.director.s.wishActive, null, 'mission:expire frees the slot');
  // the first school day: story:life op school → C4 keyed by the child (one C4, not two with the birthday)
  const rows = await A.host.query('people');
  const kid = rows.find((r) => r[2] >= 5 && r[2] <= 12 && A.host.registry.pidOf(r[0]));
  A.host.dispatch({ e: 'life', op: 'birthday', who: kid[0], age: 7, T: A.clock.T });
  feedMissions();
  const c4 = m.list.filter((i) => i.c === 'C4');
  assert.equal(c4.length, 1, 'one C4');
  assert.equal(c4[0].k, 'k' + kid[0]);
  A.host.destroy();
});

test('H6: a busy ceremony slot keeps a timed wedding waiting by game time; a birthday party gives way', async () => {
  const { ports, clock, host } = await boot({ rank: 1, T0: 3 * DAY + 10 * HOUR });
  ports.view.rect = () => ({ x: 900, y: 500, w: 800, h: 1600 });
  const played = [];
  let endBirthday = null, cancelled = null;
  host.attachView({ play: (b, d, onEnd) => { played.push(b.kind); if (b.kind === 'birthday') endBirthday = onEnd; else if (onEnd) onEnd(); },
    cancel: (k) => { cancelled = k; }, update() {}, talk() {}, card() {}, paper() {}, arrive() {}, route() {} });
  host.playBeat({ a: 'beat', kind: 'birthday', sids: [5], venue: 'v_hall', data: { age: 30 } });
  host.playBeat({ a: 'beat', kind: 'wedding', sids: [10, 11], venue: 'v_hall', at: clock.T, until: 3 * DAY + 12 * HOUR, data: { hour: 11 } });
  assert.equal(cancelled, 'birthday', 'the wedding asks the birthday party to wrap up');
  await run(host, clock, 2, { step: 1 / 60 });        // 120 frames: still waiting (not dropped after 40 tries)
  assert.equal(host.pending.length, 1);
  endBirthday();
  await run(host, clock, 1, { step: 1 / 60 });
  assert.ok(played.includes('wedding'), 'the wedding played once the slot was free');
  assert.equal(host.pending.length, 0);
  // a beat whose window passed is skipped (the engine's own events still ran), never played late
  host.stage.request({ kind: 'school' }, null);
  host.playBeat({ a: 'beat', kind: 'farewell', sids: [-1], venue: 'v_garden', at: clock.T, until: clock.T + 10, data: {} });
  await run(host, clock, 12);
  assert.ok(!played.includes('farewell') && host.stats.skipped >= 1);
  host.destroy();
});

test('H7: a story child\'s body has its own pid (k:<sid>), the town keeps it over a reload; a family that left stays away', async () => {
  const storage = new MemStorage();
  const A = await boot({ rank: 2, storage, T0: 2 * DAY + 9 * HOUR });
  await until(A, () => lifeOps(A.rec, 'baby').length > 0, 6 * DAY);
  const baby = lifeOps(A.rec, 'baby')[0][1].baby;
  assert.equal(A.host.registry.pidOf(baby), null, 'a baby has no body yet');
  await A.host.makeBody({ sid: baby, age: 4 });                 // its 4th birthday (the director's 'body' action)
  const kpid = A.host.registry.pidOf(baby);
  assert.equal(kpid, 'k:' + baby);
  const call = A.rec.events.find((e) => e[0] === 'addCitizen');
  assert.equal(call[1].townKind, 'toddler');
  // a family moves away: the town retires its bodies for good
  const movers = A.town.roster.filter((r) => r.kind === 'citizen' && /^t:/.test(r.pid)).slice(-2).map((r) => r.pid);
  A.host.leave(movers.map((p) => A.host.registry.sidOf(p)), 'moved');
  await A.host.saveSide(true);
  const slice = JSON.parse(JSON.stringify(A.host.serialize()));
  const T = A.clock.T, town = A.town;
  A.host.destroy();
  const B = await boot({ rank: 2, storage, saved: slice, T0: T, town });
  assert.equal(B.start.restored, true);
  assert.equal(B.host.registry.pidOf(baby), kpid, 'the child keeps its body');
  for (const p of movers) assert.equal(B.host.registry.has(p), false, 'moved away: not adopted again (' + p + ')');
  B.host.destroy();
  // the side record knows the child but the game lost the body: a new body is made (the safety net)
  const town2 = Object.assign({}, town, { roster: town.roster.filter((r) => r.pid !== kpid), extras: [] });
  const C = await boot({ rank: 2, storage, saved: slice, T0: T, town: town2 });
  assert.ok(C.host.registry.pidOf(baby), 'a new body for the child');
  C.host.destroy();
});

test('H8 + M1: set pieces ask only for the townfolk2 pages of their cast\'s ages, within the texture headroom; the stroller and cradle art come with their beats', () => {
  const p = beatPlan('proposal');
  assert.deepEqual(p.ages, ['adult']);
  assert.ok(p.mib < 40, 'proposal ≤ +40 MiB: ' + p.mib);
  const w = beatPlan('wedding');
  assert.ok(w.mib <= 40, 'wedding within the default headroom: ' + w.mib);
  assert.deepEqual(beatPlan('wedding', { budgetMiB: 58 }).ages, ['adult', 'child']);
  assert.deepEqual(beatPlan('wedding', { budgetMiB: 10 }).ages, [], 'no headroom: everyday clothes');
  const tf = (list) => (list.find((x) => x[0] === 'townfolk2') || [null, { only: [] }])[1].only;
  assert.ok(!tf(MODULE.beatAssets('proposal')).some((k) => /elder|child/.test(k)), 'no elder / child pages for a proposal');
  const life2 = (k) => FRAGMENTS[k].filter((x) => x[0] === 'life2').flatMap((x) => x[1].only);
  assert.ok(life2('birth').includes('l2_baby_stroller') && life2('birth').includes('l2_baby_stroller_pink'));
  assert.ok(life2('stroller').includes('l2_baby_stroller'));
  assert.ok(life2('goodnews').includes('life2_decor'), 'the cradle');
  assert.ok(life2('farewell').includes('life2_memorial'));
});

test('H9: in the game the named villagers spend the day in our village — they talk among themselves and the chat bridge remembers it', async () => {
  const { host, clock } = await boot({ rank: 2, villagers: 'village' });
  const vs = host.registry.pids().filter((p) => /^v:/.test(p)).map((p) => host.registry.sidOf(p));
  const talks = async () => { let n = 0; for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) n += (await host.query('relationship', { a: vs[i], b: vs[j] })).talks || 0; return n; };
  const before = await talks();
  await run(host, clock, DAY * 2 + HOUR * 2);
  const after = await talks();
  assert.ok(after - before >= 5, `villagers talked with each other: ${before} -> ${after}`);
  const village = { setWorld: () => {}, mem: () => ({ add: () => true }), personas: {} };
  const bridge = createChatBridge(StoryBridge, host, village, { decorate: false });
  let n = 0;
  for (const key of ['npc_aunt', 'npc_uncle', 'npc_grandma', 'npc_grandpa', 'npc_blacksmith', 'npc_clerk_a', 'npc_teen_girl', 'npc_kid_girl', 'npc_bard', 'npc_chef']) n += bridge.syncMemories(key);
  assert.ok(n >= 1, 'chat memories from yesterday: ' + n);
  host.destroy();
});

test('M7: 인생 이야기 off stops the scripted first good news and baby', async () => {
  const A = await boot({ rank: 2, T0: 2 * DAY + 9 * HOUR });
  while (A.clock.T < 3 * DAY + 12 * HOUR) await run(A.host, A.clock, 5);
  assert.ok(A.host.director.s.seen.wedding);
  A.ports.settingsTable.lifeEvents = false;
  A.host.onFeed({ t: 'settings' });
  const n = lifeOps(A.rec).length;
  while (A.clock.T < 7 * DAY) await run(A.host, A.clock, 5);
  const after = lifeOps(A.rec).slice(n).map((e) => e[1].op);
  for (const op of ['goodnews', 'baby', 'engaged', 'sweetheart']) assert.ok(!after.includes(op), op + ' while off: ' + after.join(','));
  assert.ok(!A.host.director.s.seen.expect);
  A.host.destroy();
});

test('M8: the scripted first proposal is retried until a pair is free (never lost); 단골 counts come from the game', async () => {
  const A = await boot({ rank: 1, T0: 2 * DAY + 9 * HOUR, mutate: (F) => { F.town.roster.find((r) => r.pid === 't:5').visits = 7; } });
  assert.ok(A.host.registry.regular('t:5'), 'v4 visits seed 단골');
  const q = A.host.query.bind(A.host);
  let empty = 3;
  A.host.query = (name, args) => ((name === 'sweethearts' || name === 'singles') && empty-- > 0 ? Promise.resolve([]) : q(name, args));
  A.host.onFeed({ t: 'rank', level: 2 });
  await run(A.host, A.clock, 60);
  assert.ok(empty < 0, 'asked again after empty answers');
  assert.ok(A.host.director.s.seen.proposal && lifeOps(A.rec, 'engaged').length === 1, 'the first proposal came');
  A.host.destroy();
});

test('M15: the paper\'s bank line is the chief\'s own bank (no bank yet: no line)', async () => {
  const sidebar = async (bankRate) => {
    const A = await boot({ rank: 2, T0: 2 * DAY + 9 * HOUR, bankRate });
    await until(A, () => !!A.host.paper, 3 * DAY);
    const s = A.host.paper.ko.sidebar.join(' / ');
    A.host.destroy();
    return s;
  };
  assert.ok(!/은행/.test(await sidebar(undefined)), 'no bank line without a bank');
  const s = await sidebar(0.01);
  assert.ok(/은행/.test(s) && /1%/.test(s) && !/0\.08/.test(s), 'the bank line shows the bank\'s 1 %: ' + s);
});

test('M2 + L2 + L8: the garden keeps a slot per stone (the 7th takes the oldest\'s), wishes done survive the slice, the slice stays ≤ 1 KB', () => {
  const D = new LifeDirector({ stones: 6 }, null, { pidOf: (s) => 't:' + s, farewellOn: () => true, today: () => 10, nameOf: (s, l) => (l === 'en' ? 'Kim Name' + s : '김이름' + s) });
  for (let i = 0; i < 7; i++) D.onEvent({ e: 'life', op: 'farewell', who: i, male: i % 2 === 0, age: 90, T: 0 });
  const g = D.s.garden;
  assert.equal(g.length, 6);
  assert.deepEqual(g.map((x) => x.s).sort(), [0, 1, 2, 3, 4, 5], 'six different slots');
  assert.equal(g[g.length - 1].s, 0, 'the seventh stone took the first stone\'s slot');
  assert.equal(D.s.gardenOld.length, 1, 'the first name joined the flower bed');
  D.s.wishDone['t:3'] = ['park_bench'];
  const sl = makeSlice({ day: 10, T: 6000, t0: 100, ok: true, chars: 1, life: D.s, happen: { last: 1 } });
  assert.ok(JSON.stringify(sl).length <= SLICE_CAP);
  assert.deepEqual(sanitizeSlice(JSON.parse(JSON.stringify(sl))).life.wishDone['t:3'], ['park_bench']);
  assert.deepEqual(sanitizeSlice(JSON.parse(JSON.stringify(sl))).life.garden, sl.life.garden);
});
