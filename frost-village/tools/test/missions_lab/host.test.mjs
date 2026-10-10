// Host-level tests (Node): the real MissionsHost / BankHost (views off) in a headless village, played by an honest
// bot that only does what a player can (walk to the hint, stand, carry, tap 받기 / 출발 / 후원, talk to people).
// This is the anti-softlock oracle the model test could not be (critique C-2 f): a step that no code path of the
// host or a wired module performs never completes here.
//   nice -n 15 node --test tools/test/missions_lab/host.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeHeadless, village, play } from './headless.mjs';
import { Rng } from '../../../src/missions/lib/rng.js';
import { tpl } from '../../../src/missions/data/catalog.js';
import { fitCap, MISSIONS_SLICE } from '../../../src/missions/save.js';

const FACTS = ['life', 'paper', 'b:yard', 'veh:sled', 'b:depot', 'b:town_hall', 'b:big_restaurant', 'b:boat_fishing', 'b:deco_flowers', 'pet:pet_penguin', 'b:store'];

function playFor(H, secs, seed = 5) {
  const rng = new Rng(seed);
  for (let s = 0; s < secs; s++) { village(H, rng, s); play(H, rng); H.run(1); }
}
const summary = (H) => {
  const done = {}, ends = {}, offers = {};
  for (const e of H.emitted) {
    if (e.t === 'mission:offer') offers[e.code] = (offers[e.code] || 0) + 1;
    if (e.t === 'mission:done' && !e.stage) done[e.code] = (done[e.code] || 0) + 1;
    if (e.t === 'mission:expire') ends[e.why] = (ends[e.why] || 0) + 1;
  }
  return { done, ends, offers };
};

test('oracle: an honest bot finishes every kind of board card through the world; no card goes stale, none sits idle', () => {
  const H = makeHeadless({ world: { rank: 2, facts: FACTS } });
  const rng = new Rng(5);
  let worstIdle = 0;
  for (let s = 0; s < 7200; s++) {
    village(H, rng, s); play(H, rng); H.run(1);
    for (const i of H.m.model.board()) worstIdle = Math.max(worstIdle, H.fw.T - i.tp);
  }
  const r = summary(H);
  assert.equal(r.ends.stale || 0, 0, 'stale cards: ' + JSON.stringify(r.ends));
  for (const c of ['B1', 'B2', 'E1', 'E3', 'E13', 'A1', 'A9']) assert.ok(r.done[c] > 0, c + ' completed through the world (' + JSON.stringify(r.done) + ')');
  assert.ok(worstIdle < 1500, 'a board card waited ' + worstIdle + ' s without progress');
  console.log('# oracle ' + JSON.stringify({ done: Object.values(r.done).reduce((a, b) => a + b, 0), kinds: Object.keys(r.done).length, worstIdle: Math.round(worstIdle), ends: r.ends }));
});

test('C-2: drives start from the yard through the vehicles API; without a vehicles module no drive card is offered', () => {
  const H = makeHeadless({ world: { rank: 2, facts: FACTS } });
  const m = H.m.model;
  H.run(2);
  for (const i of m.list.slice()) m.remove(i);
  const b1 = m.make(tpl('B1'), 'b', null); m.add(b1);
  const t = H.m.targetOf(b1);
  assert.deepEqual([t.x, t.y], H.places['p:yard'], 'the hint points at the yard');
  H.teleport(t.x, t.y);
  assert.ok(H.m.startDrive(b1.id));
  assert.equal(H.m.startDrive(b1.id), false, 'one drive at a time');
  H.run(30);
  assert.ok(H.emitted.some((e) => e.t === 'mission:done' && e.code === 'B1' && e.stars === 3));
  assert.equal(H.m.driving, 0);
  // no vehicles module: B1 / B2 never reach the board
  const N = makeHeadless({ world: { rank: 2, facts: FACTS }, vehicles: false });
  playFor(N, 3600);
  const r = summary(N);
  assert.ok(!r.offers.B1 && !r.offers.B2, JSON.stringify(r.offers));
});

test('E1 / E3: the found animal is led home (to the board / the farm) — no giver needed', () => {
  for (const code of ['E1', 'E3']) {
    const H = makeHeadless({ world: { rank: 2, facts: FACTS } });
    const m = H.m.model;
    H.run(2);
    for (const i of m.list.slice()) m.remove(i);
    const inst = m.make(tpl(code), 'b', null); m.add(inst);
    H.run(0.5);
    const f = H.m.targetOf(inst);
    H.teleport(f.x, f.y); H.run(0.5);
    assert.equal(inst.g[0], 1, code + ' found');
    const home = H.m.targetOf(inst);
    assert.deepEqual([home.x, home.y], H.places[code === 'E1' ? 'p:board' : 'p:farm']);
    H.walkTo(home.x, home.y); H.run(12);
    assert.ok(!m.get(inst.id), code + ' done');
    if (code === 'E3') assert.equal(H.following.size, 0, 'Ppoppi let go at home');
  }
});

test('story chain with the real payloads: wedding prep on the wedding day, speech, baby named, first school day, three wishes', () => {
  const H = makeHeadless({ world: { rank: 2, facts: FACTS } });
  const m = H.m.model;
  H.run(2);
  for (const i of m.list.slice()) m.remove(i);
  const day = H.fw.day();
  H.feed({ t: 'story:life', op: 'engaged', a: 12, b: 14, aPid: 't:31', bPid: 't:47', day: day + 1, hour: 11, venue: 'hall' });
  const c1 = m.list.find((i) => i.c === 'C1');
  assert.ok(c1 && c1.d === m.tAt(day + 1, 10.5));
  // the bot prepares the feast in time (bread, fish, meat, bouquets, a cake)
  const rng = new Rng(3);
  for (let s = 0; s < 900 && m.get(c1.id); s++) { play(H, rng); H.run(1); }
  assert.ok(H.emitted.some((e) => e.t === 'mission:done' && e.code === 'C1'), 'C1 done before the wedding');
  // the wedding: the chief's speech at the officiant point (the story's arch point)
  H.feed({ t: 'story:life', op: 'wedding', a: 12, b: 14, aPid: 't:31', bPid: 't:47' });
  const c2 = m.list.find((i) => i.c === 'C2');
  const o = H.places['p:officiant'];
  H.teleport(o[0], o[1]); H.run(3);
  assert.ok(!m.get(c2.id), 'C2 done');
  // a 7th birthday: tomorrow is the first school day → walk the child to the gate
  H.feed({ t: 'story:life', op: 'birthday', who: 58, whoPid: 't:58', age: 7 });
  const c4 = m.list.find((i) => i.c === 'C4');
  assert.ok(c4, 'C4 from the 7th birthday');
  const kid = H.pos['t:58'];
  H.teleport(kid.x, kid.y); H.run(0.5);
  assert.ok(H.following.has('t:58'), 'the child walks with the chief');
  const gate = H.places['p:school_gate'];
  H.teleport(gate[0], gate[1]); H.run(0.5);
  assert.ok(!m.get(c4.id), 'C4 done'); assert.ok(!H.following.has('t:58'));
  // an elder's wishes: each one closes the story's wish card (mission:done { wish, who: engine id })
  for (const [k, w] of ['sea_dock', 'park_bench', 'cafe_cake'].entries()) {
    H.feed({ t: 'story:wish', who: 47, whoPid: 't:47', wish: w, place: 'v_dock' });
    const c7 = m.list.find((i) => i.c === 'C7');
    assert.ok(c7, 'C7 for wish ' + (k + 1));
    const e = H.pos['t:47'];
    H.teleport(e.x, e.y); H.run(0.5);
    H.run(13);                                  // (no map spot for v_dock here: walking together counts)
    assert.ok(H.emitted.some((x) => x.t === 'mission:done' && x.wish === w && x.who === 47), 'wish ' + w + ' reported to the story');
    if (k < 2) { const g0 = c7.g[0]; H.run(20); assert.equal(c7.g[0], g0, 'no progress until the story brings the next wish'); }
  }
  assert.ok(!m.list.some((i) => i.c === 'C7'), 'three wishes: C7 done');
  // the baby: gift box, then the naming sheet
  H.feed({ t: 'story:life', op: 'baby', a: 12, b: 14, baby: 40, aPid: 't:31', bPid: 't:47' });
  const c3 = m.list.find((i) => i.c === 'C3');
  m.craft('item_gift_box', 1);
  const fam = H.pos[c3.w];
  H.teleport(fam.x, fam.y); H.run(1);
  H.feed({ t: 'story:life', op: 'named', who: 40, ko: '보람', en: 'Boram' });
  H.run(0.2);
  assert.ok(!m.get(c3.id), 'C3 done');
});

test('v8: moving boxes (inc:move numeric who) are carried to the new home; the wanted face is found by tapping it', () => {
  const H = makeHeadless({ world: { rank: 3, facts: FACTS.concat(['v6', 'v7', 'v8', 'toggle:incidents']) }, places: { h12: [700, 1500] } });
  const m = H.m.model;
  H.run(2);
  for (const i of m.list.slice()) m.remove(i);
  H.feed({ t: 'inc:move', op: 'in', id: 3, home: 'h12', who: 7, whoPid: 's:1' });
  const a21 = m.list.find((i) => i.c === 'A21');
  assert.ok(a21 && a21.gv === 's:1');
  H.m.accept(a21.id);
  const g = H.pos['s:1'], home = H.places.h12;
  for (let k = 0; k < 3; k++) { H.teleport(g.x, g.y); H.run(1); H.teleport(home[0], home[1]); H.run(1); }
  assert.ok(!m.get(a21.id), 'A21 done');
  H.feed({ t: 'inc:wanted', op: 'post', id: 9, pid: 't:12', anon: true });
  const e12 = m.list.find((i) => i.c === 'E12');
  assert.ok(e12);
  H.feed({ t: 'tap', pid: 't:31', talk: false });
  assert.ok(m.get(e12.id), 'not this face');
  H.feed({ t: 'tap', pid: 't:12', talk: false });
  H.run(0.2);
  assert.ok(H.emitted.some((e) => e.t === 'mission:done' && e.code === 'E12' && e.key === '9'), 'E12 done with the poster key (incidents tips it)');
});

test('C12: 후원 spends the minutes of income once; short of coins it says so and spends nothing', () => {
  const H = makeHeadless({ world: { rank: 3, facts: FACTS.concat(['v6', 'v7', 'v7:star2']) }, coins: 100 });
  const m = H.m.model;
  H.run(2);
  for (const i of m.list.slice()) m.remove(i);
  const c12 = m.make(tpl('C12'), 'b', null); m.add(c12);
  const cost = H.m.fundCost(c12);
  assert.equal(H.m.fund(c12.id), false);
  assert.equal(H.coins, 100);
  H.coins = cost + 50;
  assert.ok(H.m.fund(c12.id));
  assert.equal(H.coins, 50);
  H.run(0.2);
  assert.ok(!m.get(c12.id));
});

test('M-4: a card opens by walking up to a giver — not for a giver walking past, not on a v4 pad, not after 나중에', () => {
  const H = makeHeadless({ world: { rank: 2, facts: FACTS } });
  const shown = [];
  H.m.card = { isOpen: () => false, show: (id, why) => shown.push([id, why]) };
  const m = H.m.model;
  H.run(2);
  for (const i of m.list.slice()) m.remove(i);
  const b = m.make(tpl('A1'), 'o', null); m.add(b);
  const p = H.pos[b.gv];
  // the chief already stands there (working): no card
  H.teleport(p.x + 30, p.y); H.run(3);
  assert.equal(shown.length, 0);
  // walks away and back, then stops: the card
  H.walkTo(p.x + 300, p.y); H.run(2); H.walkTo(p.x + 30, p.y); H.run(3);
  assert.equal(shown.length, 1);
  // 나중에: never again for this bubble
  H.m.declined(b.id);
  H.walkTo(p.x + 300, p.y); H.run(2); H.walkTo(p.x + 30, p.y); H.run(3);
  assert.equal(shown.length, 1);
  // a new bubble while the chief stands on a v4 pad: no card
  const b2 = m.make(tpl('A2'), 'o', null); m.add(b2);
  const q = H.pos[b2.gv];
  H.chief.onPad = true;
  H.walkTo(q.x + 300, q.y); H.run(2); H.walkTo(q.x + 30, q.y); H.run(3);
  assert.equal(shown.length, 1);
});

test('bank: quote() for the pads (null when nothing helps → v4 says "코인이 모자라요"); lazy building art', () => {
  const H = makeHeadless({ world: { rank: 2, facts: FACTS }, bank: true, coins: 0 });
  const api = H.b.api;
  assert.equal(api.quote(2000), null, 'closed bank: nothing to offer');
  api.open();
  const q = api.quote(2000);
  assert.ok(q && q.amount > 0 && q.fee > 0);
  assert.equal(api.quote(40), null, 'a tiny shortfall: just earn it');
  assert.deepEqual(api.artKeys(), ['civ_bank'], 'the bank area art is wanted once the bank is open');
  const fresh = makeHeadless({ world: { rank: 2, facts: FACTS }, bank: true });
  assert.deepEqual(fresh.b.api.artKeys(), [], 'not before the site is offered');
});

test('save through the host: fitted to 3 KB after a long busy run, and a reload keeps the board and the calendar', () => {
  const H = makeHeadless({ world: { rank: 2, facts: FACTS } });
  playFor(H, 3600, 9);
  const s = H.m.serialize();
  assert.ok(JSON.stringify(s).length <= MISSIONS_SLICE.cap);
  assert.deepEqual(fitCap(s), s);
  const R = makeHeadless({ world: { rank: 2, facts: FACTS }, saved: JSON.parse(JSON.stringify(s)) });
  R.fw.T = H.fw.T; R.fw.wallMs = H.fw.wallMs;
  assert.deepEqual(R.m.model.board().map((i) => i.c), H.m.model.board().map((i) => i.c));
  assert.deepEqual(R.m.model.today(), H.m.model.today());
});
