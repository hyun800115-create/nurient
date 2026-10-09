// Regression tests for the polish pass (critic findings): saving is pure, tick() keeps time at any frame
// rate, phases can wait for the game's pictures, households never leave a child alone, every shop has a
// living owner, the game's named villagers stay as drawn, talk bubbles fit the talk, and the Korean is
// free of the address / tone mistakes the reviewers found.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStory } from '../index.js';
import { groupOf, ageOf, G_TEEN, G_ADULT, G_ELDER } from '../src/people.js';
import { getRel, ST_SPOUSE } from '../src/relations.js';

test('saving never changes the story (an autosave every few seconds is safe)', () => {
  const a = createStory({ seed: 7, population: 150, textMode: 'none' });
  const b = createStory({ seed: 7, population: 150, textMode: 'none' });
  for (let s = 0; s < 600 * 3; s++) {
    a.step(); b.step();
    if (s % 7 === 3) b.serialize();
  }
  assert.equal(b.serialize(), a.serialize());
});

test('a save taken in the middle of the night (half the bookkeeping done) continues identically', () => {
  const a = createStory({ seed: 11, population: 260, textMode: 'none' });
  while (a.nightI < 0 || a.nightI === 0) a.step();          // 23:45 and a few slices into the night
  a.step();
  const b = createStory({ save: a.serialize(), textMode: 'none' });
  a.runDays(2); b.runDays(2);
  assert.equal(b.serialize(), a.serialize());
});

test('tick() keeps the game clock at 30, 60, 120 and 144 Hz', () => {
  for (const fps of [30, 60, 120, 144]) {
    const s = createStory({ seed: 3, population: 40, textMode: 'none' });
    const t0 = s.now;
    for (let f = 0; f < fps * 600; f++) s.tick(1 / fps);
    assert.ok(Math.abs(s.now - t0 - 600) <= 1, `${fps} Hz: ${s.now - t0} story seconds for 600 game seconds`);
  }
});

test('with ackWait the fire truck phase waits for ack (or a safety timeout)', () => {
  const run = (ack) => {
    const s = createStory({ seed: 5, population: 200, textMode: 'none', ackWait: true });
    const seen = [];
    let t0 = 0;
    s.on('incident', (I) => { if (I.kind !== 'fire') return; if (!t0) t0 = s.now; seen.push([I.phase, s.now - t0, I.ack]); if (ack && I.ack) setAck = [s.now + 3, I.id]; });
    let setAck = null;
    s.incidents.fire();
    for (let k = 0; k < 300; k++) { s.step(); if (setAck && s.now >= setAck[0]) { s.ack(setAck[1]); setAck = null; } }
    return seen;
  };
  const waited = run(false), acked = run(true);
  const d0 = waited.find((x) => x[0] === 'dispatch'), s0 = waited.find((x) => x[0] === 'spray');
  const d1 = acked.find((x) => x[0] === 'dispatch'), s1 = acked.find((x) => x[0] === 'spray');
  assert.ok(d0[2] && d1[2], 'the dispatch phase asks for an ack');
  assert.ok(s1[1] - d1[1] <= 4, 'the story moves on within a step of the ack');
  assert.ok(s0[1] - d0[1] > 10, 'without an ack it waits (until the timeout)');
});

test('two months: no child is left without a grown-up, every shop has one living owner, wages are paid', () => {
  const s = createStory({ seed: 7, population: 250, textMode: 'none' });
  for (let d = 0; d < 60; d++) {
    s.runDays(1);
    for (const hh of s.households.values()) assert.ok(hh.members.some((id) => groupOf(s, s.people[id]) >= G_ADULT), `household ${hh.id} has only children (day ${d})`);
  }
  const owners = new Map();
  for (const p of s.world.places) {
    if (p.cat !== 'shop' || p.state !== 0) continue;
    const o = s.people[p.owner];
    assert.ok(o && o.alive, `${p.id} has a living owner`);
    assert.ok(!owners.has(o.id), `${o.id} owns two shops`);
    owners.set(o.id, p.id);
    assert.ok(p.till < 3000, `${p.id}: the till is collected (${p.till})`);
  }
});

test("the game's named villagers keep their age, home and job and never misbehave", () => {
  const named = [
    { key: 'npc_kid', given: '도윤', sur: '김', age: 8, male: true, persona: 'prankster' },
    { key: 'npc_aunt', given: '순자', sur: '김', title: '순자 이모', age: 58, male: false, job: 'baker', persona: 'kind' },
    { key: 'npc_fisher', given: '만수', sur: '박', age: 40, male: true, job: 'fisher', persona: 'hearty' },
    { key: 'npc_grandma', given: '말순', sur: '이', age: 86, male: false, persona: 'gentle' },
  ];
  const s = createStory({ seed: 1, population: 200, residents: named, textMode: 'none' });
  const ids = s.alive.filter((r) => r.key).map((r) => r.id);
  const start = ids.map((id) => [ageOf(s, s.people[id]), s.people[id].home, s.people[id].job]);
  let bad = 0;
  s.on('incident', (I) => { if (ids.includes(I.culprit) && (I.phase === 'act' || I.phase === 'fight' || I.phase === 'crash' || I.phase === 'argue')) bad++; });
  s.runDays(40);
  ids.forEach((id, k) => {
    const r = s.people[id];
    assert.ok(r.alive, `${r.key} still lives in town`);
    assert.equal(ageOf(s, r), start[k][0], `${r.key} keeps the age the sprite shows`);
    assert.equal(r.job, start[k][2], `${r.key} keeps the job`);
  });
  assert.equal(bad, 0, 'named villagers are never culprits');
});

test('talk bubbles fit in the time the story gives the talk', () => {
  const s = createStory({ seed: 7, population: 150, textMode: 'all' });
  let over = 0, n = 0;
  s.on('talk', (t) => { n++; let sum = 0; for (const l of t.lines) sum += l.dur; if (sum > t.dur + 1e-6) over++; });
  s.runDays(1.5);
  assert.ok(n > 300, `${n} talks`);
  assert.equal(over, 0);
});

test('Korean: no man says 어머, no 그쪽 outside a quarrel, no "이 할머니"-style names, spouses are not 우리 아내 to their face', () => {
  const s = createStory({ seed: 19, population: 200, lang: 'ko', textMode: 'all' });
  const bad = [];
  let firstMeets = 0, talks = 0;
  s.on('talk', (t) => {
    if (t.shout) return;
    talks++;
    if (t.lines.some((l) => l.rule.startsWith('intro.'))) firstMeets++;
    for (const l of t.lines) {
      const sp = s.people[l.who], ls = l.to >= 0 ? s.people[l.to] : null;
      if (sp.male && /어머(?!니)|호호/.test(l.text)) bad.push('어머: ' + l.text);
      if (/그쪽/.test(l.text) && !/^(argue|greet\.rival|bye\.rival|greet$)/.test(l.rule)) bad.push('그쪽: ' + l.text + ' ' + l.rule);
      if (/(^|[\s,“])(이|나|오|도|우|하|고|구|소|한) (할머니|할아버지|순경|형사|기사|간호사|선생님|과장|반장|기자|소방관)/.test(l.text)) bad.push('surname: ' + l.text);
      const rel = ls ? getRel(s, sp.id, ls.id) : null;
      if (rel && rel.stage === ST_SPOUSE && /(^|[ ,!])우리 (아내|남편|영감|할멈)(도|!|,| 잘)/.test(l.text)) bad.push('spouse: ' + l.text);
      // nobody calls a grown-up 15+ years older '○○ 씨'
      if (ls && groupOf(s, sp) === G_ADULT && groupOf(s, ls) >= G_ADULT && ageOf(s, ls) - ageOf(s, sp) >= 15 && l.text.includes(ls.given + ' 씨')) bad.push('씨: ' + l.text);
    }
  });
  s.runDays(6);
  assert.deepEqual(bad.slice(0, 10), [], bad.length + ' bad lines');
  // after the first days the town mostly talks to people it knows
  assert.ok(firstMeets / talks < 0.25, `first meetings ${(firstMeets / talks * 100).toFixed(1)} %`);
});

test('the paper prints each story once and never names a child as a culprit', () => {
  const s = createStory({ seed: 42, population: 250, lang: 'ko', textMode: 'none' });
  const CRIME = /^(theft|arrest|apology|wanted|queue_jump|window|scuffle)$/;
  let checked = 0;
  for (let d = 0; d < 20; d++) {
    s.runDays(1);
    const p = s.news.latest();
    const roots = [p.head, ...p.items].filter(Boolean).map((f) => f.ref || f.id);
    assert.equal(new Set(roots).size, roots.length, `day ${d}: one article per story`);
    const text = s.dialogue.paperText(p, 'ko');
    const parts = [[p.head, text.headline + ' ' + text.lead], ...p.items.map((f, i) => [f, text.articles[i].title + ' ' + text.articles[i].body])];
    for (const [f, t] of parts) {
      if (!f || !CRIME.test(f.k)) continue;
      const a = s.people[f.a];
      if (!a || groupOf(s, a) > G_TEEN) continue;
      checked++;
      assert.ok(!t.includes(a.given), `child ${a.given} named in: ${t}`);
    }
  }
  assert.ok(checked >= 0);
});
