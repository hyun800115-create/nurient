// Korean grammar for resident chat: particles on many names and nouns (and parity with the story
// engine's josa module), speech levels, the template language and the plain-form converters.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as ko from '../../../src/chat/ko.js';
import { PERSONAS, refName } from '../../../src/chat/personas.js';
import { renderSlots, slotify } from '../../../src/chat/sanitize.js';

const { josa, particle, render, levelize, toHearsay, toReminder, levelPronouns, pronoun, CASUAL, POLITE, counted, casualName } = ko;
const here = path.dirname(fileURLToPath(import.meta.url));

// [word, 이, 은, 을, 과, 으로, 아, 이에요]
const CASES = [
  ['하린', '하린이', '하린은', '하린을', '하린과', '하린으로', '하린아', '하린이에요'],
  ['서아', '서아가', '서아는', '서아를', '서아와', '서아로', '서아야', '서아예요'],
  ['준', '준이', '준은', '준을', '준과', '준으로', '준아', '준이에요'],
  ['미소', '미소가', '미소는', '미소를', '미소와', '미소로', '미소야', '미소예요'],
  ['콩이', '콩이가', '콩이는', '콩이를', '콩이와', '콩이로', '콩이야', '콩이예요'],
  ['촌장님', '촌장님이', '촌장님은', '촌장님을', '촌장님과', '촌장님으로', '촌장님아', '촌장님이에요'],
  ['할머니', '할머니가', '할머니는', '할머니를', '할머니와', '할머니로', '할머니야', '할머니예요'],
  ['빵', '빵이', '빵은', '빵을', '빵과', '빵으로', '빵아', '빵이에요'],
  ['물', '물이', '물은', '물을', '물과', '물로', '물아', '물이에요'],
  ['코코아', '코코아가', '코코아는', '코코아를', '코코아와', '코코아로', '코코아야', '코코아예요'],
  ['생선', '생선이', '생선은', '생선을', '생선과', '생선으로', '생선아', '생선이에요'],
  ['귤', '귤이', '귤은', '귤을', '귤과', '귤로', '귤아', '귤이에요'],
  ['썰매', '썰매가', '썰매는', '썰매를', '썰매와', '썰매로', '썰매야', '썰매예요'],
  ['털실', '털실이', '털실은', '털실을', '털실과', '털실로', '털실아', '털실이에요'],
  ['대장장이 언니', '대장장이 언니가', '대장장이 언니는', '대장장이 언니를', '대장장이 언니와', '대장장이 언니로', '대장장이 언니야', '대장장이 언니예요'],
  ['빵집 아주머니', '빵집 아주머니가', '빵집 아주머니는', '빵집 아주머니를', '빵집 아주머니와', '빵집 아주머니로', '빵집 아주머니야', '빵집 아주머니예요'],
  ['곰', '곰이', '곰은', '곰을', '곰과', '곰으로', '곰아', '곰이에요'],
  ['3', '3이', '3은', '3을', '3과', '3으로', '3아', '3이에요'],
  ['2', '2가', '2는', '2를', '2와', '2로', '2야', '2예요'],
  ['10', '10이', '10은', '10을', '10과', '10으로', '10아', '10이에요'],
  ['TV', 'TV가', 'TV는', 'TV를', 'TV와', 'TV로', 'TV야', 'TV예요'],
  ['하린~', '하린~이', '하린~은', '하린~을', '하린~과', '하린~으로', '하린~아', '하린~이에요'],
];
const FORMS = ['이', '은', '을', '과', '으로', '아', '이에요'];

test('particles after many names and nouns (받침, ㄹ, vowels, digits, letters)', () => {
  for (const [w, ...want] of CASES) FORMS.forEach((f, i) => assert.equal(josa(w, f), want[i], w + ' + ' + f));
  assert.equal(josa('하린', '이랑'), '하린이랑');
  assert.equal(josa('서아', '이랑'), '서아랑');
  assert.equal(josa('하린', '이야'), '하린이야');
  assert.equal(josa('서아', '이야'), '서아야');
  assert.equal(josa('빵', '이었'), '빵이었');
  assert.equal(josa('사과', '이었'), '사과였');
  assert.equal(josa('하린', '한테'), '하린한테');
  assert.equal(particle('집', '으로'), '으로');
  assert.equal(particle('학교', '으로'), '로');
  assert.equal(casualName('하린'), '하린이');
  assert.equal(casualName('서아'), '서아');
  assert.equal(counted(3, '마리'), '세 마리');
  assert.equal(counted(20, '개'), '스무 개');
  assert.equal(counted(120, '개'), '120개');
});

test('parity with the story engine josa (tools/story/lang/josa.js) when it is present', async (t) => {
  const p = path.resolve(here, '../../story/lang/josa.js');
  if (!fs.existsSync(p)) { t.skip('story engine not present'); return; }
  const story = await import(pathToFileURL(p).href);
  const words = CASES.map((c) => c[0]).concat(['아이', '눈사람', '오리', '곡괭이', '주괴', '장갑', '편지', '연못', '시바견 콩이', '분수', '100', '1000', 'L', 'M']);
  const forms = FORMS.concat(['이랑', '이야', '이라고', '이었']);
  for (const w of words) for (const f of forms) assert.equal(josa(w, f), story.josa(w, f), w + ' + ' + f);
});

test('template language: slots, particles, copula, 요 and [casual|polite]', () => {
  const tpl = '{chief:이} {item:을} 줬어{요}! [고마워|고마워요]~ {item:이다}';
  assert.equal(render(tpl, { chief: '촌장님', item: '귤' }, CASUAL), '촌장님이 귤을 줬어! 고마워~ 귤이야');
  assert.equal(render(tpl, { chief: '촌장님', item: '코코아' }, POLITE), '촌장님이 코코아를 줬어요! 고마워요~ 코코아예요');
  const out = {};
  assert.equal(render('{who:이} 왔어', {}, CASUAL, out), '왔어');
  assert.equal(out.missing, 1);
});

test('speech levels: re-levelling finished sentences both ways', () => {
  assert.equal(levelize('촌장님이 생선을 잡았대!', POLITE), '촌장님이 생선을 잡았대요!');
  assert.equal(levelize('그건 빵이야. 맛있어~', POLITE), '그건 빵이에요. 맛있어요~');
  assert.equal(levelize('제 거예요.', CASUAL), '제 거야.');
  assert.equal(levelize('맛있죠?', CASUAL), '맛있지?');
  assert.equal(levelize('좋아요!', POLITE), '좋아요!');
  assert.equal(levelPronouns('내가 할게요. 나는 괜찮아요', POLITE), '제가 할게요. 저는 괜찮아요');
  assert.equal(levelPronouns('제가 할게. 저도 갈래', CASUAL), '내가 할게. 나도 갈래');
  assert.equal(pronoun('이', POLITE), '제가');
  assert.equal(pronoun('한테', CASUAL), '나한테');
});

test('plain form -> hearsay ("~대") and reminder ("~잖아")', () => {
  assert.equal(toHearsay('촌장님이 생선을 잡았다'), '촌장님이 생선을 잡았대');
  assert.equal(toHearsay('촌장님은 고양이를 좋아한다'), '촌장님은 고양이를 좋아한대');
  assert.equal(toHearsay('촌장님은 낚시왕이다'), '촌장님은 낚시왕이래');
  assert.equal(toHearsay('촌장님이 웃었대'), '촌장님이 웃었대');
  assert.equal(toHearsay('안녕하세요'), '');
  assert.equal(toReminder('촌장님이 생선을 잡았다'), '촌장님이 생선을 잡았잖아');
  assert.equal(toReminder('촌장님은 고양이를 좋아한다'), '촌장님은 고양이를 좋아하잖아');
  assert.equal(toReminder('촌장님은 빵을 먹는다'), '촌장님은 빵을 먹잖아');
  assert.equal(toReminder('반가워요'), '');
});

test('how each resident names the others (kids say 언니/아줌마, adults say 씨)', () => {
  assert.equal(refName(PERSONAS, 'npc_kid_girl', 'npc_aunt'), '빵집 아줌마');
  assert.equal(refName(PERSONAS, 'npc_grandma', 'npc_aunt'), '빵집 아주머니');
  assert.equal(refName(PERSONAS, 'npc_teen_girl', 'npc_clerk_a'), '미소 언니');
  assert.equal(refName(PERSONAS, 'npc_aunt', 'npc_clerk_a'), '미소 씨');
  assert.equal(refName(PERSONAS, 'npc_aunt', 'chief'), '촌장님');
});

test('slot templates re-apply particles for every speaker', () => {
  const tpl = slotify('점원 미소가 그러는데 촌장님이 하린이한테 귤을 줬대', PERSONAS);
  assert.equal(tpl, '{@npc_clerk_a:이} 그러는데 {@chief:이} {@npc_kid_girl:한테} 귤을 줬대');
  assert.equal(renderSlots(tpl, 'npc_teen_girl', PERSONAS, CASUAL), '미소 언니가 그러는데 촌장님이 하린이한테 귤을 줬대');
  assert.equal(renderSlots(tpl, 'npc_aunt', PERSONAS, POLITE), '미소 씨가 그러는데 촌장님이 하린이한테 귤을 줬대요');
  assert.equal(renderSlots(tpl, 'npc_kid_girl', PERSONAS, CASUAL), '미소 언니가 그러는데 촌장님이 나한테 귤을 줬대');
  assert.equal(renderSlots(tpl, 'npc_clerk_a', PERSONAS, POLITE), '제가 그러는데 촌장님이 하린이한테 귤을 줬대요');
  // a common word that is also a name is left alone
  assert.equal(slotify('하린이가 미소를 지었대', PERSONAS), '{@npc_kid_girl:이} 미소를 지었대');
  // particles change with the name: 준 (받침) vs 서아 (vowel)
  const t2 = '{@npc_kid_prankster:이} {@npc_teen_girl:을} 불렀대';
  assert.equal(renderSlots(t2, 'npc_aunt', PERSONAS, CASUAL), '준이가 서아를 불렀대');
  assert.equal(renderSlots(t2, 'npc_kid_girl', PERSONAS, CASUAL), '준이가 서아 언니를 불렀대');
});
