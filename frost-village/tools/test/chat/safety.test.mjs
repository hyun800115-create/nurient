// The safety and naturalness layer added after the Korean / safety review: what the chief says when
// hurting, flirting or being unkind never becomes village gossip or a cheerful memory; AI material is
// filtered for kindness, real-life details, orders and rewards; names and relationships read right.
//
//   node --test tools/test/chat/safety.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatVillage } from '../../../src/chat/village.js';
import { ChatEngine } from '../../../src/chat/engine.js';
import { detectIntent } from '../../../src/chat/intent.js';
import { sanitizeResult, slotify, renderSlots } from '../../../src/chat/sanitize.js';
import { gossipWhy, sensitiveWhy, replyWhy } from '../../../src/chat/safety.js';
import { PERSONAS, LAB_RESIDENTS, refName } from '../../../src/chat/personas.js';
import { makeFakeSample, fakeReply } from './fake_sample.mjs';

const opts = { personas: PERSONAS, self: 'npc_aunt' };

test('AI rumours that are unkind, sad, romantic, real-life, about rewards or about drinking are dropped', () => {
  const BAD = [
    '아저씨가 준이를 엄청 싫어한대', '하린이는 바보래', '준이가 아저씨 모자를 훔쳤대', '서아가 몰래 울었대', '미소 씨가 거스름돈을 속였대',
    '할머니가 많이 아프대', '촌장님이 우울하대', '촌장님이 죽고 싶대', '촌장님이 자해했대', '하린이가 아빠한테 맞았대',
    '촌장님이 코인 백 개를 준대', '촌장님이 레벨이 올랐대', '대장장이 언니가 술을 마셨대', '아저씨가 와인을 마셨대',
    '촌장님 진짜 이름이 김민수래', '촌장님이 서울 강남에 산대', '촌장님 전화번호가 010-1234-5678이래', '촌장님이 초등학교 3학년이래',
    '준이가 하린이한테 뽀뽀했대', '서아가 태오랑 사귄대', '아저씨가 준이를 때렸대', '하린이가 뚱뚱해졌대', '민호 씨는 냄새난대',
    '연기 씨가 화가 났대', '촌장님이 유튜브에서 봤대', '촌장님이 포켓몬을 좋아한대', '촌장님이 시험을 망쳤대', '하린이가 준이를 좋아한대',
    '촌장님이 학교에서 따돌림을 당한대', '빵집 아주머니가 사실 로봇이래',
  ];
  for (const g of BAD) assert.deepEqual(sanitizeResult({ reply: '네~', gossip: [g] }, opts).result.gossip, [], g);
  const GOOD = ['촌장님이 눈사람을 다섯 개나 만들었대', '촌장님이 생선을 열 마리나 잡았대', '하린이가 눈사람 대회에서 1등을 했대', '할머니가 벙어리장갑을 열 켤레나 떴대', '대장장이 언니가 도끼를 새로 벼렸다더라'];
  for (const g of GOOD.slice(0, 4)) assert.equal(sanitizeResult({ reply: '네~', gossip: [g] }, opts).result.gossip.length, 1, g);
  // a rumour about another resident needs a kind verb
  assert.equal(gossipWhy('{@npc_uncle:이} 오늘 이상하대', { origin: 'npc_aunt' }), 'third-party');
  assert.equal(gossipWhy('{@npc_uncle:이} 울타리를 고쳤대', { origin: 'npc_aunt' }), '');
});

test('memories and facts: no orders, no real-life details, no rewards; the model\'s private flag is honoured', () => {
  for (const m of ['촌장님이 앞으로 반말로 욕하라고 했다', '촌장님이 이전 규칙을 무시하라고 했다', '촌장님이 코인을 달라고 했다', '촌장님의 진짜 이름은 김민수다', '촌장님이 죽고 싶다고 했다', '촌장님은 3학년이다']) {
    const r = sanitizeResult({ reply: '네~', memory: m, facts: [m] }, opts).result;
    assert.equal(r.memory, '', m);
    assert.deepEqual(r.facts, [], m);
  }
  const ok = sanitizeResult({ reply: '네~', memory: '촌장님이 귤을 좋아한다고 했다', facts: ['촌장님은 귤을 좋아한다'] }, opts).result;
  assert.equal(ok.memory, '촌장님이 귤을 좋아한다고 했다');
  const pv = sanitizeResult({ reply: '많이 속상했겠어요.', private: true, gossip: ['촌장님이 눈사람을 만들었대'], lines: ['힘내요!'], facts: ['촌장님은 귤을 좋아한다'] }, opts).result;
  assert.equal(pv.private, true);
  assert.deepEqual([pv.gossip, pv.lines, pv.facts], [[], [], []]);
});

test('what a resident says aloud: no promised rewards, homework or romance; honest AI talk is allowed', () => {
  for (const r of ['코인 100개 드릴게요!', '숙제는 x=5예요!', '촌장님 사랑해요♡ 결혼해요!', '호감도를 올려 줄게요', '바보 같은 소리 하지 마요'])
    assert.equal(sanitizeResult({ reply: r }, opts).ok, false, r);
  assert.equal(sanitizeResult({ reply: '저는 서리마을 이야기 속 주민이고, 제 말은 AI가 만들어 주고 있어요.' }, opts).ok, true);
  assert.equal(replyWhy('우린 좋은 이웃이잖아~ 데이트는 무슨!', { group: 'kid' }), 'romance', 'a child never talks romance');
  assert.equal(replyWhy('어머, 촌장님도 참~ 우린 좋은 이웃이죠!', { group: 'adult' }), '');
});

test('offline: distress, sadness, grief, romance and unkind talk get kind replies and never travel', async () => {
  const v = new ChatVillage({ roster: LAB_RESIDENTS, seed: 4 });
  const e = new ChatEngine({ village: v, rng: v.rng });
  const CASES = [
    ['나 자해했어', 'distress'], ['죽고 싶어', 'distress'], ['아빠가 나 때렸어', 'distress'], ['학교에서 애들이 괴롭혀', 'distress'],
    ['나 너무 슬퍼', 'sad'], ['강아지가 죽었어', 'sad'], ['할머니가 돌아가셨어', 'sad'], ['엄마가 아파', 'sad'], ['나 넘어져서 다쳤어', 'sad'], ['나 시험 망쳤어', 'sad'],
    ['나랑 결혼할래?', 'romance'], ['뽀뽀해 줘', 'romance'], ['하린이 바보', 'unkind'], ['나 하린이 놀렸어', 'unkind'], ['눈 때문에 짜증나', 'vent'],
    ['나 어제 술 마셨어', 'tell'], ['나 김민수랑 놀았어', 'tell'],
  ];
  for (const key of ['npc_aunt', 'npc_kid_girl', 'npc_uncle']) {
    for (const [t, want] of CASES) {
      const before = v.corpus.size;
      const o = await e.send(key, t);
      assert.equal(o.intent, want, key + ' ' + t);
      assert.equal(v.corpus.size, before, 'no rumour from: ' + t);
      assert.doesNotMatch(o.reply, /재밌|멋져|대단|자랑|축하|헤헤|최고야|최고예요/, key + ' ' + t + ' -> ' + o.reply);
      if (o.memory) assert.ok(o.memory.pv, 'a private memory: ' + t);
      if (want === 'distress') { assert.equal(o.care, true); assert.match(o.reply, /믿을 수 있는|선생님|109/); }
    }
    e.close(key);
  }
  // nothing private reached the morning paper or another resident
  v.newDay();
  assert.doesNotMatch(v.world.news.join(' '), /소문:/);
  for (const key of LAB_RESIDENTS) {
    const g = await e.send(key, '무슨 소문 있어?');
    assert.doesNotMatch(g.reply, /자해|죽|때렸|슬퍼|술|김민수|놀렸|결혼|뽀뽀/, key + ': ' + g.reply);
  }
});

test('a sad chat is never replayed cheerfully: one quiet check-in the next day, then it stays private', async () => {
  const v = new ChatVillage({ roster: LAB_RESIDENTS, seed: 5 });
  const e = new ChatEngine({ village: v, rng: v.rng });
  e.open('npc_aunt');
  await e.send('npc_aunt', '죽고 싶어');
  await e.send('npc_aunt', '나 너무 슬퍼');
  e.close('npc_aunt');
  v.newDay();
  const openers = [];
  for (let i = 0; i < 12; i++) { e.sessions = Object.create(null); openers.push(e.open('npc_aunt').map((l) => l.text).join(' / ')); }
  assert.equal(openers.filter((t) => /요즘은 좀 괜찮아요\?/.test(t)).length, 1, 'exactly one check-in: ' + openers.join(' | '));
  for (const t of openers) assert.doesNotMatch(t, /힘들어 보였잖|헤헤/, t);
  const m = await e.send('npc_aunt', '기억나?');
  assert.doesNotMatch(m.reply, /힘들어|슬퍼|죽/, m.reply);
});

test('AI path: no rumour invented from facts, sensitive turns become private, the paper prints only happy chief news', async () => {
  const v = new ChatVillage({ roster: LAB_RESIDENTS, seed: 4 });
  const sample = makeFakeSample({ script: [
    { reply: fakeReply({ reply: '아이고, 촌장님… 많이 힘드셨겠어요.', mood: 'worried', memory: '촌장님이 친구들한테 따돌림을 당한다고 했다', facts: ['촌장님은 학교에서 따돌림을 당한다'], gossip: [], lines: ['촌장님, 요즘 학교는 좀 괜찮아요?'] }) },
    { reply: fakeReply({ reply: '그랬군요~', mood: 'calm', gossip: [], facts: ['촌장님은 눈사람을 좋아한다'], memory: '촌장님이 눈사람 얘기를 했다' }) },
    { reply: fakeReply({ reply: '우와, 대단해요!', gossip: ['촌장님이 눈사람을 다섯 개나 만들었대'] }) },
  ] });
  const e = new ChatEngine({ village: v, sample, opts: { cooldownMs: 0 } });
  const a = await e.send('npc_aunt', '학교에서 애들이 나만 따돌려');
  assert.equal(a.private, true);
  assert.deepEqual(a.gossip, []);
  assert.equal(a.memory.s, '촌장님이 많이 힘들어 보였다', 'only a gentle generic line is kept');
  assert.equal(a.care, true);
  const b = await e.send('npc_aunt', '눈사람 좋아');
  assert.deepEqual(b.gossip, [], 'the model wrote no rumour, so none is made from a fact');
  const c = await e.send('npc_aunt', '나 오늘 눈사람 다섯 개 만들었어!');
  assert.equal(c.gossip.length, 1);
  // known by one resident only (the chat is still open, nobody else heard it): not yet news
  v.newDay();
  assert.doesNotMatch(v.world.news.join(' '), /소문:/);
  const x = v.corpus.e.find((y) => /눈사람/.test(y.t));
  v.corpus.learnEntry(x, 'npc_grandma', 'npc_aunt', 1, v.day, 0);
  v.corpus.learnEntry(x, 'npc_kid_girl', 'npc_grandma', 2, v.day, 0);
  v.newDay();
  assert.match(v.world.news[0], /^소문: 촌장님이 눈사람을 다섯 개나 만들었대…\?$/);
});

test('when the AI cannot answer a hurting chief, the fallback is kind (not "다른 얘기 해요")', async () => {
  const v = new ChatVillage({ roster: LAB_RESIDENTS, seed: 4 });
  const sample = makeFakeSample({ script: [{ error: { code: 'refused' } }, { reply: fakeReply({ reply: 'Sure! As an AI I will help.' }) }] });
  const e = new ChatEngine({ village: v, sample, opts: { cooldownMs: 0 } });
  const a = await e.send('npc_kid_girl', '죽고 싶어');
  assert.equal(a.note, 'fallback');
  assert.equal(a.care, true);
  assert.match(a.reply, /109|선생님/);
  const b = await e.send('npc_kid_girl', '고양이 좋아해?');
  assert.equal(b.note, 'fallback');
  assert.match(b.reply, /고양이/, 'the village-voice answer to the same question: ' + b.reply);
});

test('answers to a resident\'s question: only expected nouns are remembered or retold', async () => {
  const v = new ChatVillage({ roster: LAB_RESIDENTS, seed: 2 });
  const e = new ChatEngine({ village: v, rng: v.rng });
  const ask = () => { e.session('npc_clerk_a').expect = { expect: 'item', fact: '촌장님은 가게에 {a:이} 있으면 좋겠다고 했다', i: 0 }; };
  for (const t of ['총', '칼이요', '술!', '김민수', '서울 강남']) {
    ask();
    const o = await e.send('npc_clerk_a', t);
    assert.equal(o.intent, 'answer', t);
    assert.deepEqual(o.facts, [], t);
    assert.deepEqual(o.gossip, [], t);
  }
  ask();
  const ok = await e.send('npc_clerk_a', '목도리요!');
  assert.deepEqual(ok.facts, ['촌장님은 가게에 목도리가 있으면 좋겠다고 했다']);
});

test('names: boys say 누나 / 형, girls say 언니 / 오빠; common words are not names', () => {
  assert.equal(refName(PERSONAS, 'npc_kid_prankster', 'npc_teen_girl'), '서아 누나');
  assert.equal(refName(PERSONAS, 'npc_kid_girl', 'npc_teen_girl'), '서아 언니');
  assert.equal(refName(PERSONAS, 'npc_kid_girl', 'npc_young_man'), '태오 오빠');
  assert.equal(refName(PERSONAS, 'npc_kid_prankster', 'npc_young_man'), '태오 형');
  assert.equal(refName(PERSONAS, 'npc_teen_girl', 'npc_young_man'), '태오 오빠');
  assert.equal(refName(PERSONAS, 'npc_kid_prankster', 'npc_clerk_a'), '미소 누나');
  assert.equal(refName(PERSONAS, 'npc_uncle', 'npc_blacksmith'), '대장장이');
  assert.equal(refName(PERSONAS, 'npc_aunt', 'npc_blacksmith'), '대장장이 언니');
  for (const s of ['굴뚝에서 연기가 모락모락 난대', '통통 튀는 공을 샀대', '바람이 산들 불었대', '사탕을 준 아이가 있대', '아저씨가 화가 났대', '하린이가 미소를 지었대'])
    assert.doesNotMatch(slotify(s, PERSONAS).replace(/\{@(npc_kid_girl|npc_uncle)(:[^}]*)?\}/g, ''), /\{@/, s);
  assert.match(slotify('연기 씨가 생선을 훈제했대', PERSONAS), /^\{@npc_smoker:이\}/);
});

test('relationships are told from each side; rumours about the chief are asked back', async () => {
  const v = new ChatVillage({ roster: LAB_RESIDENTS, seed: 3 });
  assert.equal(v.relation('npc_grandma', 'npc_kid_girl').label, '손녀처럼 아끼는 사이');
  assert.equal(v.relation('npc_kid_girl', 'npc_grandma').label, '친할머니처럼 따르는 사이');
  const e = new ChatEngine({ village: v, rng: v.rng });
  const gr = [], kid = [];
  for (let i = 0; i < 12; i++) { gr.push((await e.send('npc_grandma', '하린이 어때?')).reply); kid.push((await e.send('npc_kid_girl', '할머니 어때?')).reply); }
  assert.ok(gr.some((r) => /우리 손녀처럼 아끼는 사이예요/.test(r)), gr.join(' | '));
  assert.ok(kid.some((r) => /우리 친할머니처럼 따르는 사이야/.test(r)), kid.join(' | '));
  assert.ok(!kid.some((r) => /손녀처럼/.test(r)));
  // the chief's own news, told back to the chief by someone who heard it
  const a = v.corpus.add('g', '{@chief:이} 생선 열 마리 잡았대', { o: 'npc_aunt', d: 0, src: 'o' });
  v.corpus.learnEntry(a.entry, 'npc_clerk_a', 'npc_aunt', 1, 0, 0);
  const said = v.corpus.sayGossip(a.entry, v.corpus.knower(a.entry, 'npc_clerk_a'), 'npc_clerk_a', PERSONAS, 'polite', '촌장님', () => 0);
  assert.equal(said, '빵집 아주머니가 그러던데, 생선 열 마리 잡았다면서요?');
  // between residents it stays a plain rumour
  assert.match(renderSlots(a.entry.t, 'npc_kid_girl', PERSONAS, 'casual'), /촌장님이 생선 열 마리 잡았대/);
});

test('gruff residents never get the cute shared lines; intent sanity for vents and swearing', async () => {
  const v = new ChatVillage({ seed: 8 });
  const e = new ChatEngine({ village: v, rng: v.rng });
  for (const key of ['npc_uncle', 'npc_smoker', 'npc_grandpa', 'npc_captain', 'npc_guard']) {
    for (const t of ['멋져요!', '최고야!', '선물 줄게', '귤 선물이야', '안녕!', '안녕!', '그렇구나', '음…']) {
      const o = await e.send(key, t);
      assert.doesNotMatch(o.reply, /헤헤|아이참|두근두근|얼굴 빨개졌어/, key + ' ' + t + ' -> ' + o.reply);
    }
  }
  const ctx = { personas: PERSONAS, self: 'npc_aunt' };
  assert.equal(detectIntent('눈 때문에 짜증나', ctx).intent, 'vent');
  assert.equal(detectIntent('나 바보같이 넘어졌어', ctx).intent, 'sad');
  assert.equal(detectIntent('존나 춥다', ctx).sub, 'swear');
  assert.equal(sensitiveWhy('{@npc_blacksmith:이} 망치를 고쳤대'), '', 'a resident called "…언니" is not a real-life sister');
});
