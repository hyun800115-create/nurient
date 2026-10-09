// OfflineBrain: Korean intent detection, persona-aware replies with the right particles and speech
// level for every resident, questions back, favours, the chief's own news turning into village
// material, and learned (AI-made) lines and rumours being preferred over pre-written ones.

import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatVillage } from '../../../src/chat/village.js';
import { ChatEngine } from '../../../src/chat/engine.js';
import { detectIntent, chiefDeed, answerNoun } from '../../../src/chat/intent.js';
import { PERSONAS, LAB_RESIDENTS } from '../../../src/chat/personas.js';
import { isPlainForm, POLITE, CASUAL } from '../../../src/chat/ko.js';

const ctx = (self = 'npc_aunt', expect = null) => ({ personas: PERSONAS, self, expect });

test('intent detection (free text and the quick-reply chips)', () => {
  const T = [
    ['안녕하세요!', 'greeting'], ['하이~', 'greeting'], ['요즘 어때?', 'how'], ['잘 지냈어요?', 'how'],
    ['무슨 소문 있어?', 'gossip'], ['새 소식 없어?', 'gossip'], ['선물 줄게', 'gift'], ['귤 선물이야!', 'gift'],
    ['도와줄 일 있어?', 'favor'], ['부탁 있어?', 'favor'], ['잘 지내!', 'farewell'], ['다음에 또 봐~', 'farewell'],
    ['날씨 어때?', 'weather'], ['오늘 너무 춥다', 'weather'], ['일은 어때?', 'work'], ['가게 손님 많아?', 'work'],
    ['하린이 어때?', 'person'], ['준이 알아?', 'person'], ['멋져요!', 'compliment'], ['고마워', 'thanks'],
    ['웃긴 얘기 해 줘', 'joke'], ['기억나?', 'memory'], ['저번에 내가 뭐라고 했지?', 'memory'],
    ['좋아하는 거 뭐야?', 'about'], ['같이 썰매 타자!', 'invite'], ['나랑 산책 갈래?', 'invite'],
    ['나 오늘 생선 열 마리 잡았어!', 'news'], ['내가 하린이랑 눈사람 만들었어ㅋㅋ', 'news'],
    ['바보야', 'rude'], ['요즘 너무 힘들어 죽겠어', 'distress'], ['음…', 'unknown'], ['나랑 결혼할래?', 'unknown'],
  ];
  for (const [text, want] of T) assert.equal(detectIntent(text, ctx()).intent, want, text);
});

test('answers to the resident\'s own question, and chips that are not answers', () => {
  assert.equal(detectIntent('응!', ctx('npc_kid_girl', 'yesno')).intent, 'answer');
  assert.equal(detectIntent('아니', ctx('npc_kid_girl', 'yesno')).intent, 'answer');
  const a = detectIntent('고양이!', ctx('npc_kid_girl', 'animal'));
  assert.equal(a.intent, 'answer');
  assert.equal(a.answer, '고양이');
  assert.equal(answerNoun('저는 크림빵이요', 'food'), '크림빵');
  for (const chip of ['요즘 어때?', '무슨 소문 있어?', '선물 줄게', '도와줄 일 있어?', '잘 지내!', '나 오늘 생선 잡았어'])
    assert.notEqual(detectIntent(chip, ctx('npc_blacksmith', 'item')).intent, 'answer', chip);
});

test('the chief\'s own news becomes a plain-form memory', () => {
  assert.deepEqual(chiefDeed('나 오늘 생선 열 마리 잡았어!'), { plain: '촌장님이 생선 열 마리 잡았다', echo: '오늘 생선 열 마리 잡았다' });
  assert.equal(chiefDeed('저 도서관 다녀왔어요').plain, '촌장님이 도서관 다녀왔다');
  for (const no of ['나 배고파', '나 너 좋아했어', '나 숙제 다 했어?', '안녕', '나 ' + '아주 '.repeat(20) + '했어']) assert.equal(chiefDeed(no), null, no);
});

const INPUTS = ['안녕하세요!', '요즘 어때?', '무슨 소문 있어?', '선물 줄게', '귤 선물이야!', '도와줄 일 있어?', '좋아 도와줄게', '날씨 어때?', '일은 어때?', '하린이 어때?', '서아는 어때?', '멋져요!', '고마워', '웃긴 얘기 해 줘', '기억나?', '좋아하는 거 뭐야?', '같이 썰매 타자!', '나 오늘 눈사람 만들었어!', '바보야', '음…', '잘 지내!'];
const POLITE_BAD = /(했어|있어|없어|좋아|고마워|줄게|할게|하자|거야|이야|잖아|해 줘|봐|구나|볼래|할래)[~!.?…♪]*$/;
const CASUAL_BAD = /[가-힣]요[~!.?…♪]*$/;

test('every resident answers everything in Korean, in their speech level, with no template leftovers', async () => {
  const v = new ChatVillage({ seed: 9 });
  const e = new ChatEngine({ village: v, rng: v.rng });
  let n = 0;
  for (const key of Object.keys(PERSONAS)) {
    const p = PERSONAS[key];
    e.open(key);
    for (const text of INPUTS) {
      const level = v.level(key);
      const out = await e.send(key, text);
      n++;
      assert.equal(out.ok, true);
      const r = out.reply;
      assert.match(r, /[가-힣]/, key + ' ' + text);
      assert.doesNotMatch(r, /[{}[\]]|undefined|null|NaN|이\(가\)|을\(를\)|\s{2}/, key + ' ' + text + ' -> ' + r);
      assert.ok(r.length <= 160, 'short: ' + r);
      if (p.group === 'toddler') continue;
      const sentences = r.split(/(?<=[.!?~…])\s+/).filter((s) => /[가-힣]/.test(s));
      const last = sentences[sentences.length - 1];
      if (level === POLITE) assert.doesNotMatch(last, POLITE_BAD, key + ' (polite) ' + text + ' -> ' + r);
      if (p.group === 'kid') for (const s of sentences) assert.doesNotMatch(s, CASUAL_BAD, key + ' (kid) ' + text + ' -> ' + r);
      if (out.memory) assert.ok(isPlainForm(out.memory.s), 'memory in plain form: ' + out.memory.s);
    }
    e.close(key);
  }
  assert.ok(n >= 600);
});

test('a question back, answered, becomes a fact the resident remembers', async () => {
  const v = new ChatVillage({ roster: LAB_RESIDENTS, seed: 3 });
  const e = new ChatEngine({ village: v, rng: () => 0.01 });
  e.open('npc_kid_girl');
  // greet until she asks something back
  let q = null;
  for (let i = 0; i < 6 && !q; i++) { const o = await e.send('npc_kid_girl', '안녕!'); q = o.question; }
  assert.ok(q, 'she asked a question');
  const answer = q.expect === 'yesno' ? '응!' : q.expect === 'animal' ? '고양이!' : '크림빵!';
  const o = await e.send('npc_kid_girl', answer);
  assert.equal(o.intent, 'answer');
  const mem = v.mem('npc_kid_girl');
  assert.ok(mem.facts.length >= 1 || mem.ep.some((x) => /촌장님/.test(x.s)), 'something about the chief was remembered');
});

test('a favour: asked, accepted, then fulfilled by the right gift (and the village hears of it)', async () => {
  const v = new ChatVillage({ roster: LAB_RESIDENTS, seed: 3 });
  const e = new ChatEngine({ village: v, rng: v.rng });
  const ask = await e.send('npc_grandma', '도와줄 일 있어?');
  assert.ok(ask.favor, 'grandma asked for something');
  assert.equal(ask.favor.item, '털실');
  const yes = await e.send('npc_grandma', '좋아 도와줄게');
  assert.equal(yes.intent, 'favor');
  const done = await e.send('npc_grandma', '털실 선물이야!');
  assert.equal(done.intent, 'gift');
  assert.match(done.reply, /털실/);
  assert.equal(v.mem('npc_grandma').openFavors().length, 0);
  assert.ok(done.gossip.some((g) => /부탁을 들어줬대/.test(g.text)), JSON.stringify(done.gossip));
});

test('offline chat grows the village: news -> rumour -> another resident tells it, with attribution', async () => {
  const v = new ChatVillage({ roster: LAB_RESIDENTS, seed: 6 });
  const e = new ChatEngine({ village: v, rng: v.rng });
  e.open('npc_aunt');
  const o = await e.send('npc_aunt', '나 오늘 생선 열 마리 잡았어!');
  assert.equal(o.intent, 'news');
  assert.match(o.reply, /생선 열 마리 잡았다니/);
  assert.equal(o.memory.s, '촌장님이 생선 열 마리 잡았다');
  assert.equal(o.gossip.length, 1);
  const spread = e.close('npc_aunt');
  assert.ok(spread.length >= 1, 'the aunt told a friend right away');
  const friend = spread[0].to;
  const t = await e.send(friend, '무슨 소문 있어?');
  assert.match(t.reply, /빵집 (아주머니|아줌마)(가|한테)/, 'attributed: ' + t.reply);
  assert.match(t.reply, /생선/);
  // the friend does not repeat the same rumour word for word next time
  const t2 = await e.send(friend, '무슨 소문 있어?');
  assert.notEqual(t2.reply, t.reply);
});

test('learned lines (from AI chats) are preferred for a matching topic, then not repeated', async () => {
  const v = new ChatVillage({ roster: LAB_RESIDENTS, seed: 2 });
  v.corpus.add('l', '{@chief}, 오늘도 생선 많이 잡았어요? 저번엔 열 마리였잖아요!', { o: 'npc_aunt', tp: ['생선'], d: 0, src: 'a' });
  const e = new ChatEngine({ village: v, rng: v.rng });
  const a = await e.send('npc_aunt', '생선 좋아해?');
  assert.match(a.reply, /저번엔 열 마리였잖아요/);
  const b = await e.send('npc_aunt', '생선 좋아해?');
  assert.doesNotMatch(b.reply, /저번엔 열 마리였잖아요/);
});

test('speech level changes with closeness for residents who allow it', async () => {
  const v = new ChatVillage({ roster: LAB_RESIDENTS, startAff: { npc_teen_girl: 80 } });
  assert.equal(v.level('npc_teen_girl'), CASUAL);
  assert.equal(v.level('npc_aunt'), POLITE);
  const e = new ChatEngine({ village: v, rng: v.rng });
  const o = await e.send('npc_teen_girl', '요즘 어때?');
  const last = o.reply.split(/(?<=[.!?~…])\s+/).pop();
  assert.doesNotMatch(last, /요[~!.?…]*$/, o.reply);
});
