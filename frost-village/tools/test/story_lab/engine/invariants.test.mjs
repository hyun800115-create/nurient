// Invariants after weeks of town life: nobody's money is negative, relationships have no orphans and
// match the adjacency lists, households and homes agree, incidents resolve, loans are sane, every
// memory points to a known fact, and the toggles really switch things off.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStory } from '../../../../src/story/engine/index.js';
import { pairKey } from '../../../../src/story/engine/src/relations.js';

function checkTown(s) {
  const alive = new Set(s.alive.map((r) => r.id));
  for (const r of s.alive) {
    assert.ok(r.alive, 'alive list holds the living');
    assert.ok(r.wallet >= 0 && r.savings >= 0, `money of ${r.id}: ${r.wallet} / ${r.savings}`);
    assert.ok(Number.isFinite(r.mood) && r.mood >= -100 && r.mood <= 100, 'mood range');
    for (const rel of r.adj) {
      assert.ok(rel.a === r.id || rel.b === r.id, 'adjacency belongs to the resident');
      assert.equal(s.pairs.get(pairKey(rel.a, rel.b)), rel, 'adjacency is in the pair map');
    }
    for (const m of r.mem) assert.ok(s.facts.has(m.f.id), 'memory points to a known fact');
    if (r.spouse >= 0) assert.equal(s.people[r.spouse].spouse, r.id, 'spouses are mutual');
    const hh = s.households.get(r.hh);
    assert.ok(hh && hh.members.includes(r.id), 'resident is in its household');
  }
  for (const rel of s.pairs.values()) {
    assert.ok(alive.has(rel.a) && alive.has(rel.b), `no orphan relationship ${rel.a}-${rel.b}`);
    assert.ok(rel.stage >= 0 && rel.stage <= 6);
    assert.ok(rel.fam >= 0 && rel.fam <= 1000 && rel.aff >= -1000 && rel.aff <= 1000 && rel.rom >= 0 && rel.rom <= 1000);
  }
  for (const hh of s.households.values()) for (const id of hh.members) assert.ok(alive.has(id), 'household members are alive');
  for (const L of s.bank.loans) if (!L.done) { assert.ok(L.bal >= 0, 'loan balance'); assert.ok(alive.has(L.who), 'loan holder lives here'); }
  for (const p of s.world.places) for (const id of p.here) assert.equal(s.people[id].loc, p.idx, 'presence lists agree');
}

test('four weeks of life keep every invariant', () => {
  const s = createStory({ seed: 11, population: 160, textMode: 'none' });
  for (let d = 0; d < 28; d++) { s.runDays(1); checkTown(s); }
  const st = s.stats();
  assert.ok(st.incidents.theft > 0 && st.incidents.fire > 0, 'incidents happened');
  // every incident older than two days has resolved
  for (const I of s.incidents.active) assert.ok(s.now - I.t < s.cfg.dayLength * 2.5, `incident ${I.id} (${I.kind}, ${I.phase}) still open`);
  assert.ok(st.incidents.resolved >= st.incidents.theft, 'thefts resolve');
  assert.ok(st.social.talks > 10000);
});

test("'incidents off' switches off crime, scuffles and fires; life events toggle too", () => {
  const s = createStory({ seed: 4, population: 150, textMode: 'none', incidents: false, lifeEvents: false });
  let inc = 0, life = 0;
  s.on('incident', () => inc++);
  s.on('life', (e) => { if (e.op === 'sweetheart' || e.op === 'engaged' || e.op === 'wedding' || e.op === 'baby' || e.op === 'farewell') life++; });
  s.runDays(10);
  assert.equal(inc, 0);
  assert.equal(life, 0);
  checkTown(s);
});

test('setToggles turns incidents off mid-game', () => {
  const s = createStory({ seed: 8, population: 150, textMode: 'none' });
  s.runDays(3);
  s.setToggles({ incidents: false });
  const open = s.incidents.active.length;
  let started = 0;
  s.on('incident', (e) => { if (e.phase === 'start') started++; });
  s.runDays(4);
  assert.equal(started, 0);
  assert.ok(s.incidents.active.length <= open);
});
