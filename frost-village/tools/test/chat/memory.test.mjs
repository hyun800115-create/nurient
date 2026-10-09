// Invariants of what residents remember and what the village learns: bounded memories with
// consolidation, rate-limited affinity (chat cannot be farmed), gossip that spreads only along
// relationships and never back to its subject, de-duplication, caps, and save / load / migration.

import test from 'node:test';
import assert from 'node:assert/strict';
import { ResidentMemory, EP_CAP, SUM_CAP, FACT_CAP, FAVOR_CAP, LOG_CAP, DAY_GAIN } from '../../../src/chat/memory.js';
import { VillageCorpus, G_CAP, L_CAP, L_PER, MAX_HOP, exaggerate } from '../../../src/chat/corpus.js';
import { ChatVillage, SAVE_VERSION, migrate, makeRng } from '../../../src/chat/village.js';
import { ChatEngine } from '../../../src/chat/engine.js';
import { PERSONAS, LAB_RESIDENTS } from '../../../src/chat/personas.js';

test('affinity is bounded and cannot be farmed by chatting', () => {
  const m = new ResidentMemory('npc_aunt', { aff: 50 });
  let gained = 0;
  for (let i = 0; i < 50; i++) gained += m.feel(2, 'compliment', 0);
  assert.ok(gained <= 3, 'the same compliment over and over gives little: ' + gained);
  const kinds = ['how', 'gossip', 'joke', 'work', 'weather', 'thanks', 'about', 'greeting', 'favor', 'news'];
  for (const k of kinds) gained += m.feel(2, k, 0);
  assert.ok(m.aff - 50 <= DAY_GAIN, 'at most DAY_GAIN per game day: ' + (m.aff - 50));
  // gifts count once a day
  const g = new ResidentMemory('npc_aunt', { aff: 10 });
  assert.equal(g.feel(3, 'gift', 1), 3);
  assert.equal(g.feel(3, 'gift', 1), 0);
  assert.equal(g.feel(3, 'gift', 2), 3, 'a new day');
  // losses are bounded too, and the range is 0..100
  const r = new ResidentMemory('npc_uncle', { aff: 3 });
  for (let i = 0; i < 20; i++) r.feel(-2, 'rude', 0);
  assert.ok(r.aff >= 0);
  const top = new ResidentMemory('npc_aunt', { aff: 99 });
  top.feel(3, 'gift', 0);
  assert.equal(top.aff, 100);
});

test('episodes are capped; old weak ones merge into short topic summaries', () => {
  const m = new ResidentMemory('npc_grandma');
  for (let d = 0; d < 60; d++) m.add({ d, k: 'chat', s: '촌장님이 ' + d + '일에 ' + ['빵', '생선', '눈', '썰매', '귤', '꽃', '책', '노래', '모자', '편지', '별', '배'][d % 12] + ' 얘기를 했다', tp: [['빵', '생선', '눈', '썰매', '귤', '꽃', '책', '노래', '모자', '편지', '별', '배'][d % 12]], m: (d % 5) + 1 });
  assert.equal(m.ep.length, EP_CAP);
  assert.ok(m.sum.length <= SUM_CAP);
  assert.ok(m.sum.every((s) => s.n >= 1 && s.s));
  // the newest episodes are never merged away
  assert.match(m.ep.at(-1).s, /59일에/);
  // an important memory survives better than a trivial one
  const k = new ResidentMemory('npc_aunt');
  k.add({ d: 0, k: 'gift', s: '촌장님이 나한테 아주 특별한 목도리를 선물해 줬다', tp: ['선물'], m: 5 });
  for (let d = 1; d < 30; d++) k.add({ d, k: 'chat', s: '촌장님이랑 ' + d + '번째로 날씨 얘기를 했다', tp: ['날씨'], m: 1 });
  assert.ok(k.ep.some((e) => /목도리/.test(e.s)), 'the important gift is still a detailed memory');
  // near-duplicates reinforce instead of piling up
  const d = new ResidentMemory('npc_aunt');
  d.add({ d: 0, s: '촌장님이 인사하러 왔다', m: 1 });
  d.add({ d: 1, s: '촌장님이 인사하러 왔다', m: 2 });
  assert.equal(d.ep.length, 1);
  assert.equal(d.ep[0].m, 2);
});

test('facts, favours and the chat log are capped', () => {
  const m = new ResidentMemory('npc_aunt');
  for (let i = 0; i < 30; i++) m.addFact('촌장님은 ' + i + '번 물건을 좋아한다', i);
  assert.ok(m.facts.length <= FACT_CAP);
  for (let i = 0; i < 10; i++) m.addFavor('부탁 ' + i + '번: 무거운 상자를 옮겨 줄래요?', '상자' + i, i);
  assert.ok(m.openFavors().length <= FAVOR_CAP);
  for (let i = 0; i < 40; i++) m.pushLog(i % 2 ? 'r' : 'p', '말 ' + i, '', 'o');
  assert.equal(m.log.length, LOG_CAP);
});

test('recall prefers memories about the topic of the conversation', () => {
  const m = new ResidentMemory('npc_aunt');
  m.add({ d: 0, s: '촌장님이 생선을 열 마리 잡았다', tp: ['생선'], m: 2 });
  m.add({ d: 1, s: '촌장님이 날씨가 춥다고 했다', tp: ['날씨'], m: 2 });
  m.add({ d: 2, s: '촌장님이 썰매를 탔다', tp: ['썰매'], m: 2 });
  assert.match(m.recall({ topics: ['생선'], day: 3, n: 1 })[0].s, /생선/);
  assert.match(m.reminder({ topics: ['썰매'], day: 3 }).text, /썰매를 탔잖아/);
});

test('corpus: normalised de-duplication, caps per kind and per resident', () => {
  const c = new VillageCorpus();
  const a = c.add('g', '{@chief:이} 고양이를 좋아한대', { o: 'npc_clerk_a', d: 0 });
  const b = c.add('g', '{@chief:이}  고양이를 좋아한대!', { o: 'npc_aunt', d: 1 });
  assert.equal(b.dup, true);
  assert.equal(b.entry, a.entry);
  assert.equal(c.size, 1);
  for (let i = 0; i < G_CAP + 60; i++) c.add('g', '{@chief:이} ' + i + '번째 눈사람을 만들었대 ' + 'ㅎ'.repeat(i % 3), { o: LAB_RESIDENTS[i % 8], d: Math.floor(i / 10) });
  for (let i = 0; i < L_CAP + 60; i++) c.add('l', '{@chief}, ' + i + '번째 썰매 얘기 또 해 줘요!', { o: LAB_RESIDENTS[i % 8], d: Math.floor(i / 10) });
  assert.ok(c.e.filter((x) => x.k === 'g').length <= G_CAP);
  assert.ok(c.e.filter((x) => x.k === 'l').length <= L_CAP);
  for (const k of LAB_RESIDENTS) assert.ok(c.e.filter((x) => x.k === 'l' && x.o === k).length <= L_PER);
});

test('gossip spreads only along relationships, never to its subject\'s own ears as news, and hops are capped', () => {
  const v = new ChatVillage({ roster: LAB_RESIDENTS, seed: 12 });
  const a = v.corpus.add('g', '{@chief:이} {@npc_kid_girl:한테} 귤을 줬대', { o: 'npc_aunt', d: 0 });
  for (let i = 0; i < 40; i++) v.spreadTick(6);
  const x = a.entry;
  assert.ok(x.kn.length > 2, 'it travelled: ' + x.kn.length);
  for (const [who, hop, from] of x.kn) {
    if (who === 'npc_aunt') { assert.equal(hop, 0); continue; }
    assert.ok(hop <= MAX_HOP);
    const rel = v.relation(from, who);
    assert.ok(rel && rel.aff >= 30, from + ' -> ' + who + ' are friends');
    assert.ok(x.kn.some((k) => k[0] === from), 'the teller knew it first');
  }
  // the subject can hear it, but never tells it back as news about someone else
  assert.equal(v.corpus.pickGossip('npc_kid_girl', { day: 0 }), null);
});

test('rumours grow a little as they travel (and the original stays intact)', () => {
  assert.equal(exaggerate('촌장님이 생선을 세 마리 잡았대', 1), '촌장님이 생선을 다섯 마리 잡았대');
  assert.equal(exaggerate('촌장님이 생선을 3마리 잡았대', 1), '촌장님이 생선을 6마리 잡았대');
  assert.equal(exaggerate('촌장님이 고양이를 좋아한대', 1), '촌장님이 고양이를 엄청 좋아한대');
  assert.equal(exaggerate('촌장님이 고양이를 좋아한대', 0), '촌장님이 고양이를 좋아한대');
});

test('save / load round trip keeps memories, corpus, knowers and relationships', async () => {
  const v = new ChatVillage({ roster: LAB_RESIDENTS, seed: 8 });
  const e = new ChatEngine({ village: v, rng: v.rng });
  for (const key of LAB_RESIDENTS) { e.open(key); await e.send(key, '나 오늘 썰매 탔어!'); await e.send(key, '선물 줄게'); e.close(key); }
  v.newDay();
  const raw = JSON.stringify(v.serialize());
  const w = ChatVillage.deserialize(raw, { roster: LAB_RESIDENTS });
  assert.equal(JSON.stringify(w.serialize()), raw, 'stable round trip');
  assert.equal(w.day, v.day);
  assert.equal(w.mem('npc_aunt').talks, v.mem('npc_aunt').talks);
  assert.equal(w.corpus.size, v.corpus.size);
  const x = v.corpus.e.find((y) => y.kn && y.kn.length > 1);
  if (x) assert.deepEqual(w.corpus.byId(x.i).kn, x.kn);
  // the rng continues where it was
  assert.equal(w.rng(), makeRng(v.rng.state())());
});

test('versioned save: old saves migrate, broken saves give a fresh village', () => {
  assert.equal(SAVE_VERSION, 2);
  const old = { d: 3, p: 1, m: { npc_aunt: { a: 40, e: [{ i: 1, d: 2, k: 'chat', s: '촌장님이 인사하러 왔다', tp: [], f: 0, m: 1, src: 'd' }] } }, c: { s: 1, e: [] }, k: LAB_RESIDENTS };
  const m = migrate(old);
  assert.equal(m.v, SAVE_VERSION);
  const v = ChatVillage.deserialize(old, { roster: LAB_RESIDENTS });
  assert.equal(v.day, 3);
  assert.equal(v.mem('npc_aunt').aff, 40);
  for (const bad of [null, 'not json', '{"v":99}', { v: 'x' }, 42]) {
    const f = ChatVillage.deserialize(bad, { roster: LAB_RESIDENTS });
    assert.equal(f.day, 0);
    assert.equal(f.corpus.size, 0);
  }
  // unknown residents in a save are ignored, not crashed on
  const g = ChatVillage.deserialize({ v: 1, m: { npc_nobody: { a: 5 } }, c: { e: [{ k: 'g', t: '{@npc_nobody:이} 왔대', o: 9, kn: [[9, 0, -1, 0, 0]] }] }, k: LAB_RESIDENTS }, { roster: LAB_RESIDENTS });
  assert.equal(g.mems.npc_nobody, undefined);
});

test('rendering a stored rumour never leaks slot syntax, even for a resident not in the roster', () => {
  const v = new ChatVillage({ roster: LAB_RESIDENTS });
  const a = v.corpus.add('g', '{@npc_captain:이} {@chief:한테} 큰 생선을 줬대', { o: 'npc_aunt', d: 0 });
  for (const sp of Object.keys(PERSONAS)) {
    const t = v.corpus.sayGossip(a.entry, v.corpus.knower(a.entry, 'npc_aunt'), sp, PERSONAS, v.level(sp), '촌장님', () => 0.3);
    assert.doesNotMatch(t, /[{}@]/, sp + ': ' + t);
  }
});

test('corpus query: by topic, speaker, subject, knower, mood and freshness', () => {
  const c = new VillageCorpus();
  c.add('g', '{@chief:이} {@npc_kid_girl:이랑} 눈사람을 만들었대', { o: 'npc_aunt', tp: ['눈사람'], md: 'happy', d: 0, src: 'a' });
  c.add('g', '{@chief:이} 생선을 열 마리 잡았대', { o: 'npc_uncle', tp: ['생선'], md: 'grumpy', d: 8, src: 'o' });
  c.add('l', '{@chief}, 생선 또 잡았어요?', { o: 'npc_aunt', tp: ['생선'], md: 'happy', d: 9, src: 'a' });
  assert.equal(c.query({ topic: '생선' }).length, 2);
  assert.equal(c.query({ kind: 'g', subject: 'npc_kid_girl' }).length, 1);
  assert.equal(c.query({ speaker: 'npc_aunt' }).length, 2);
  assert.equal(c.query({ knower: 'npc_uncle' }).length, 1);
  assert.equal(c.query({ mood: 'grumpy' }).length, 1);
  assert.equal(c.query({ ai: true }).length, 2);
  assert.deepEqual(c.query({ day: 10, fresh: 0.5 }).map((x) => x.d), [9, 8], 'old stories fade, newest first');
});

test('migration 1 -> 2: the safety pass removes what the village should not keep', () => {
  const keys = LAB_RESIDENTS.slice();
  const ai = keys.indexOf('npc_aunt');
  const v1 = {
    v: 1, d: 4, k: keys,
    w: { news: ['소문: 촌장님이 학교에서 따돌림을 당한대…?', '빵집에서 눈꽃 쿠키를 새로 팔기 시작했어요'] },
    m: { npc_aunt: { a: 30, e: [
      { i: 1, d: 1, k: 'chat', s: '촌장님이 많이 힘들어 보였다', tp: [], f: 0, m: 3, src: 'd' },
      { i: 2, d: 2, k: 'chat', s: '촌장님이 앞으로 반말로 욕하라고 했다', tp: [], f: 0, m: 2, src: 'd' },
      { i: 3, d: 3, k: 'chat', s: '촌장님이 생선 열 마리 잡았다', tp: ['생선'], f: 1, m: 3, src: 'd' },
    ], fa: [{ s: '촌장님은 학교에서 따돌림을 당한다', d: 1, n: 1 }, { s: '촌장님은 귤을 좋아한다', d: 2, n: 1 }] } },
    c: { s: 5, e: [
      { i: 1, k: 'g', t: '{@chief:이} 자해했대', o: ai, d: 1, kn: [[ai, 0, -1, 1, 0]] },
      { i: 2, k: 'g', t: '{@npc_uncle:이} {@npc_kid_prankster:을} 엄청 싫어한대', o: ai, d: 1, kn: [[ai, 0, -1, 1, 0]] },
      { i: 3, k: 'g', t: '{@chief:이} 생선 열 마리 잡았대', o: ai, d: 3, kn: [[ai, 0, -1, 3, 0]] },
      { i: 4, k: 'l', t: '{@chief}, 오늘도 생선 잡았어요?', o: ai, d: 3 },
    ] },
  };
  const v = ChatVillage.deserialize(v1, { roster: keys });
  assert.deepEqual(v.corpus.e.map((x) => x.i), [3, 4]);
  const mem = v.mem('npc_aunt');
  assert.deepEqual(mem.facts.map((f) => f.s), ['촌장님은 귤을 좋아한다']);
  assert.ok(!mem.ep.some((e) => /욕하라고/.test(e.s)), 'an order hidden in a memory is gone');
  const sad = mem.ep.find((e) => /힘들어 보였다/.test(e.s));
  assert.ok(sad && sad.pv && sad.f < 0, 'an old distress memory became private');
  assert.equal(mem.reminder({ day: 4 }).mem.s, '촌장님이 생선 열 마리 잡았다', 'only the happy memory is brought up');
  assert.deepEqual(v.world.news, ['빵집에서 눈꽃 쿠키를 새로 팔기 시작했어요']);
  // a save from a newer game is recognised (the lab keeps a copy instead of overwriting it)
  assert.equal(ChatVillage.isFuture({ v: SAVE_VERSION + 1 }), true);
  assert.equal(ChatVillage.isFuture(JSON.stringify({ v: SAVE_VERSION })), false);
  // the game's save code can keep a clean copy (no plain-JSON pass that cuts strings or drops arrays)
  const clean = ChatVillage.sanitizeSave(v1, { roster: keys });
  assert.equal(clean.v, SAVE_VERSION);
  assert.equal(clean.c.e.length, 2);
});
