// Engine extensions E1–E9 of the story engine copy (src/story/engine; docs/v5_v8_plan.md §6.1 "Tests").
//   nice -n 15 node --test tools/test/story_lab/engine_ext.test.mjs
// The 30 original engine tests run against the copy in tools/test/story_lab/engine/.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStory } from '../../../src/story/engine/index.js';
import { pairKey } from '../../../src/story/engine/src/relations.js';
import { ageOf, groupOf, G_ADULT, G_ELDER } from '../../../src/story/engine/src/people.js';
import { pack15, unpack15, isPacked } from '../../../src/story/engine/src/save.js';

const L = 600;
const WORLD = () => ({
  places: [
    { id: 'plaza', kind: 'plaza', x: 10, y: 10 }, { id: 'park', kind: 'park', x: 14, y: 12 }, { id: 'cafe', kind: 'cafe', x: 12, y: 8 },
    { id: 'school', kind: 'school', x: 20, y: 8 }, { id: 'clinic', kind: 'clinic', x: 24, y: 10 }, { id: 'hall_town', kind: 'town_hall', x: 30, y: 10 },
    { id: 'hall_ours', kind: 'town_hall', x: 4, y: 10, tag: 'ours' }, { id: 'garden', kind: 'memorial', x: 22, y: 16 },
    ...Array.from({ length: 60 }, (_, i) => ({ id: 'home_' + i, kind: 'home', x: 2 + (i % 10) * 3, y: 20 + Math.floor(i / 10) * 3, cap: 4 })),
  ], plots: [],
});

/** a game-mode town: n residents added through addResident (external plans), households of 1–4 */
function gameTown(n = 120, cfg = {}) {
  const e = createStory({ seed: 77, world: WORLD(), residents: [], population: 0, textMode: 'none', config: Object.assign({ externalPlans: true, incidents: false, moveInRate: 0, moveOutRate: 0 }, cfg) });
  let h = 0;
  const sids = [];
  for (let i = 0; i < n; i++) {
    const age = i % 9 === 0 ? 6 + (i % 7) : i % 5 === 0 ? 68 + (i % 18) : 22 + (i % 30);
    const sid = e.addResident({ gid: 't:' + i, given: undefined, age, male: i % 2 === 0, hh: 'h' + Math.floor(i / 3), home: 'home_' + (Math.floor(i / 3) % 60), role: 'adult' });
    sids.push(sid);
    h++;
  }
  e.settleTown();
  return { e, sids };
}

/** move every external resident between places by a fixed plan (the game's TownSim stand-in) */
function moveAll(e, sids, step) {
  const places = ['plaza', 'park', 'cafe', 'school', 'clinic'];
  const at = [];
  for (const sid of sids) {
    const r = e.people[sid];
    if (!r || !r.alive) continue;
    const p = e.world.get(places[(sid + Math.floor(step / 37)) % places.length]);
    at.push(sid, p.idx, 4);
  }
  e.atMany(at);
}

function checkTown(s) {
  const alive = new Set(s.alive.map((r) => r.id));
  for (const r of s.alive) {
    assert.ok(r.wallet >= 0 && r.savings >= 0, 'money');
    for (const rel of r.adj) assert.equal(s.pairs.get(pairKey(rel.a, rel.b)), rel, 'adjacency in pair map');
    if (r.spouse >= 0) assert.equal(s.people[r.spouse].spouse, r.id, 'spouses mutual');
    const hh = s.households.get(r.hh);
    assert.ok(hh && hh.members.includes(r.id), 'resident in its household');
  }
  for (const rel of s.pairs.values()) assert.ok(alive.has(rel.a) && alive.has(rel.b), 'no orphan relationship');
  for (const hh of s.households.values()) for (const id of hh.members) assert.ok(alive.has(id), 'household members alive');
  for (const p of s.world.places) for (const id of p.here) assert.equal(s.people[id].loc, p.idx, 'presence agrees');
}

test('E1 external plans: no routine walks; talks only between people the game put together', () => {
  const { e, sids } = gameTown(90);
  let routine = 0, talks = 0, apart = 0;
  e.on('goTo', (g) => { if (!g.reason) routine++; });
  e.on('talk', (t) => { talks++; if (t.b >= 0 && e.people[t.a].loc !== e.people[t.b].loc) apart++; });
  for (let s = 0; s < L * 2; s++) { if (s % 4 === 0) moveAll(e, sids, s); e.tick(1); }
  assert.equal(routine, 0, 'no routine goTo for externally planned residents');
  assert.ok(talks > 200, 'people still meet and talk: ' + talks);
  assert.equal(apart, 0, 'every talk is between co-present residents');
  checkTown(e);
});

test('E2 add / remove keep households and relations valid', () => {
  const { e, sids } = gameTown(60);
  for (let k = 0; k < 20; k++) e.addResident({ gid: 'n:' + k, age: 30 + k, male: k % 2 === 0, hh: 'new' + (k >> 1), home: 'home_' + (50 + (k % 10)) });
  for (let k = 0; k < 15; k++) assert.ok(e.removeResident(sids[k * 3], 'left'));
  assert.equal(e.removeResident(sids[0]), false, 'removing twice is harmless');
  for (let s = 0; s < L; s++) { if (s % 4 === 0) moveAll(e, e.alive.map((r) => r.id), s); e.tick(1); }
  checkTown(e);
  // a family whose only grown-up leaves keeps no child alone
  for (const hh of e.households.values()) assert.ok(hh.members.some((id) => groupOf(e, e.people[id]) >= G_ADULT), 'no child-only household');
});

test('E3 a leased body is never cast into a story beat or a talk', () => {
  const { e, sids } = gameTown(80);
  const leased = new Set(sids.slice(0, 30));
  for (const sid of leased) e.lease(sid, true);
  let bad = 0;
  e.on('talk', (t) => { if (leased.has(t.a) || leased.has(t.b)) bad++; });
  e.on('goTo', (g) => { if (leased.has(g.who)) bad++; });
  e.on('life', (l) => { if (l.op === 'wedding') for (const g of l.guests) if (leased.has(g)) { /* guests learn, never walk */ } });
  for (let s = 0; s < L * 2; s++) { if (s % 4 === 0) moveAll(e, sids.filter((x) => !leased.has(x)), s); e.tick(1); }
  assert.equal(bad, 0);
  for (const sid of leased) assert.ok(e.leased(sid));
  e.lease(sids[0], false);
  assert.ok(!e.leased(sids[0]));
});

test('E4 a town without a bank, logistics, police, fire station or clinic runs (missing kinds tolerated); locked shops keep their owner', () => {
  const e = createStory({ seed: 5, world: { places: [{ id: 'plaza', kind: 'plaza' }, { id: 'cafe', kind: 'cafe', locked: true }, ...Array.from({ length: 30 }, (_, i) => ({ id: 'h' + i, kind: 'home', cap: 4 }))] },
    population: 80, textMode: 'none', config: { fireRate: 0.5 } });
  for (let d = 0; d < 8; d++) e.runDays(1);
  assert.ok(e.alive.length > 40);
  e.setRates({ fireRate: 0, incidentRate: 0 });
  assert.equal(e.cfg.fireRate, 0);
  const cafe = e.world.get('cafe');
  const owner = e.alive.find((r) => groupOf(e, r) === G_ADULT && !(r.flags & 16));
  e.setOwner('cafe', owner.id);
  assert.equal(cafe.owner, owner.id);
  e.removeResident(owner.id);
  e.econ.adoptShops();
  assert.ok(cafe.owner === -1 || e.people[cafe.owner].parents.includes(owner.id), 'nobody takes over a locked shop (an heir may)');
});

test('E5 compact keeps the packed save under the cap after 120 game days', () => {
  const { e, sids } = gameTown(170, { babyRate: 0.01 });
  for (let s = 0; s < L * 120; s++) { if (s % 8 === 0) moveAll(e, e.alive.map((r) => r.id), s); e.tick(1); }
  const before = e.serialize({ packed: true }).length;
  const r1 = e.compact(1);
  const after1 = e.serialize({ packed: true }).length;
  const r2 = e.compact(2);
  const after2 = e.serialize({ packed: true }).length;
  console.log(`  E5: ${e.alive.length} residents, packed ${before} -> ${after1} -> ${after2} chars (mem -${r1.mem + r2.mem}, rels -${r1.rels + r2.rels}, facts -${r1.facts + r2.facts})`);
  assert.ok(after2 <= before && after2 < 450000, 'under the 450 K cap');
  checkTown(e);
  // the compacted town lives on
  for (let s = 0; s < L; s++) e.tick(1);
  checkTown(e);
});

test('E6 packed saves round-trip exactly and continue identically', () => {
  const { e, sids } = gameTown(70);
  for (let s = 0; s < L * 3 + 123; s++) { if (s % 4 === 0) moveAll(e, sids, s); e.tick(1); }
  const p = e.serialize({ packed: true }), b = e.serialize();
  assert.ok(isPacked(p) && !isPacked(b));
  assert.ok(p.length < b.length * 0.45, `pack15 ${p.length} vs base64 ${b.length}`);
  const bytes = Uint8Array.from(Buffer.from(b, 'base64'));
  assert.deepEqual(Array.from(unpack15(pack15(bytes))), Array.from(bytes));
  for (let i = 0; i < p.length; i++) { const c = p.charCodeAt(i); assert.ok(c < 0xd800 || c > 0xdfff, 'no surrogates'); }
  const f = createStory({ save: p });
  assert.equal(f.serialize({ packed: true }), p, 'loaded copy saves back identically');
  const evA = [], evB = [];
  e.on('talk', (t) => evA.push(t.id + ':' + t.a + ':' + t.b)); f.on('talk', (t) => evB.push(t.id + ':' + t.a + ':' + t.b));
  for (let s = 0; s < L; s++) { if (s % 4 === 0) { moveAll(e, sids, s); moveAll(f, sids, s); } e.tick(1); f.tick(1); }
  assert.deepEqual(evA, evB);
  assert.equal(e.serialize({ packed: true }), f.serialize({ packed: true }));
});

test('E7 two-speed aging: a baby walks at 4 after 6 days, starts school at 7 after 10.5; grown-ups age every 4 days; farewell off freezes the elders at 85', () => {
  // (farewellFromDay far away: this test is about ages, not farewells)
  const e = createStory({ seed: 3, world: WORLD(), residents: [], population: 0, textMode: 'none', config: { externalPlans: true, yearDaysKid: 1.5, yearDaysAdult: 4, freezeAgeWhenOff: 85, farewellFromDay: 1000 } });
  const baby = e.addResident({ age: 0, hh: 'b', home: 'home_1' });
  const adult = e.addResident({ age: 30, hh: 'a', home: 'home_2' });
  const elder = e.addResident({ age: 84, hh: 'o', home: 'home_3', male: false });
  e.people[baby].birth = e.clock.day;
  e.people[adult].birth = e.clock.day - Math.round(19 * 1.5 + 11 * 4);
  const bdays = [];
  e.on('life', (l) => { if (l.op === 'birthday' && l.who === baby) bdays.push([l.age, e.clock.day]); });
  e.runDays(11);
  const four = bdays.find((b) => b[0] === 4), seven = bdays.find((b) => b[0] === 7);
  assert.ok(four && four[1] === 6, 'age 4 on day 6: ' + JSON.stringify(bdays));
  assert.ok(seven && (seven[1] === 10 || seven[1] === 11), 'age 7 on day 10–11');
  assert.equal(ageOf(e, e.people[adult]), 30 + Math.floor(11 / 4));
  e.setToggles({ farewell: false });
  e.runDays(16);
  assert.equal(ageOf(e, e.people[elder]), 85, 'frozen at 85');
  e.setToggles({ farewell: true });
  assert.equal(ageOf(e, e.people[elder]), 85, 'no jump when switched back on');
  e.runDays(4);
  assert.equal(ageOf(e, e.people[elder]), 86, 'ages again');
});

test('E7 old engine saves (one speed, version 2) keep their ages', async () => {
  const { createStory: orig } = await import('../../../tools/story/index.js');
  const o = orig({ seed: 9, population: 60, textMode: 'none' });
  o.runDays(2);
  const ages = o.alive.map((r) => ageOf(o, r));
  const c = createStory({ save: o.serialize() });
  assert.deepEqual(c.alive.map((r) => ageOf(c, r)), ages);
});

test('E8 a proposal brings a wedding at 11:00 the next day at our own town hall; E9 weddings stay weddingGapDays apart', () => {
  const { e, sids } = gameTown(120, { weddingGapDays: 6, weddingInDays: 2 });
  const singles = e.alive.filter((r) => groupOf(e, r) === G_ADULT && r.spouse < 0 && e.life.partnerOf(r) < 0);
  const a = singles.find((r) => r.male), b = singles.find((r) => !r.male);
  const wed = [];
  e.on('life', (l) => { if (l.op === 'wedding') wed.push({ day: e.clock.day, minute: e.clock.minute, place: l.place, a: l.a, b: l.b }); });
  const res = e.arrange('propose', { a: a.id, b: b.id, inDays: 1, hour: 11 });
  assert.ok(res && res.day === e.clock.day + 1);
  for (let s = 0; s < L * 60; s++) { if (s % 4 === 0) moveAll(e, e.alive.map((r) => r.id), s); e.tick(1); }
  assert.equal(wed[0].a, a.id);
  assert.equal(wed[0].minute, 660, 'at 11:00');
  assert.equal(wed[0].place, 'hall_ours', 'our town hall is preferred');
  for (let i = 2; i < wed.length; i++) assert.ok(wed[i].day - wed[i - 1].day >= 6 || wed[i - 1].a === a.id, 'weddings ≥ 6 days apart: ' + JSON.stringify(wed.map((w) => w.day)));
  // the chief names the baby
  const kid = e.addResident({ age: 0, hh: 'x', home: 'home_59' });
  const pool = e.namePool(kid, 3);
  assert.equal(pool.length, 3);
  const nm = e.arrange('nameBaby', { sid: kid, name: pool[1] });
  assert.equal(e.people[kid].given, pool[1].ko);
  assert.equal(nm.en, pool[1].en);
});

test('farewell gates: never before the garden / the start day, spaced, never a kept villager, none when switched off', () => {
  const mk = (cfg) => {
    const e = createStory({ seed: 21, world: WORLD(), residents: [], population: 0, textMode: 'none',
      config: Object.assign({ externalPlans: true, yearDaysAdult: 4, farewellNeedsGarden: true, farewellGapDays: 15, farewellFromDay: 10, farewellLastDay: true, memorialHour: 10 }, cfg) });
    for (let i = 0; i < 40; i++) e.addResident({ age: 84 + (i % 5), male: i % 2 === 0, hh: 'e' + i, home: 'home_' + i, kept: i < 6 });
    for (let i = 0; i < 40; i++) e.addResident({ age: 30, hh: 'y' + i, home: 'home_' + (40 + (i % 20)) });
    e.settleTown();
    return e;
  };
  const e = mk({});
  const fw = [], last = [];
  e.on('life', (l) => { if (l.op === 'farewell') fw.push({ day: e.clock.day, who: l.who }); if (l.op === 'lastday') last.push(e.clock.day); });
  e.runDays(60);
  assert.ok(fw.length >= 1, 'gentle farewells happen');
  for (const f of fw) { assert.ok(f.day >= 10, 'not before farewellFromDay'); assert.ok(!(e.people[f.who].flags & 1), 'never a kept villager'); }
  for (let i = 1; i < fw.length; i++) assert.ok(fw[i].day - fw[i - 1].day >= 15, 'spaced 15 days');
  assert.equal(last.length, fw.length, 'a last day before every farewell');
  const off = mk({ farewell: false });
  let n = 0;
  off.on('life', (l) => { if (l.op === 'farewell' || l.op === 'lastday') n++; });
  off.runDays(40);
  assert.equal(n, 0, 'switched off: no farewell');
  const nog = createStory({ seed: 21, world: { places: WORLD().places.filter((p) => p.kind !== 'memorial') }, residents: [], population: 0, textMode: 'none',
    config: { externalPlans: true, farewellNeedsGarden: true, yearDaysAdult: 4 } });
  for (let i = 0; i < 30; i++) nog.addResident({ age: 88, hh: 'g' + i, home: 'home_' + i });
  let m = 0;
  nog.on('life', (l) => { if (l.op === 'farewell') m++; });
  nog.runDays(30);
  assert.equal(m, 0, 'no garden: no farewell');
});
