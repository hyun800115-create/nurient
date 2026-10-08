// Korean particles (조사) chosen by 받침, native counting words, the 나/저/너 + 이/가 forms and the
// '너' replacement used in 반말 to parents / older friends / spouses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { josa, particle, finalKind, hasBatchim, casualName, counted, nativeCount, romanize } from '../lang/josa.js';
import { GIVEN, SURNAMES } from '../lang/names.js';
import { Grammar } from '../lang/grammar.js';
import { replaceYou } from '../src/dialogue.js';
import { ITEMS } from '../data/items.js';
import { PLACE_KINDS } from '../data/places.js';

test('particles after names and nouns (golden list)', () => {
  const cases = [
    ['지훈', '이', '지훈이'], ['민지', '이', '민지가'], ['도윤', '은', '도윤은'], ['서아', '은', '서아는'], ['빵', '을', '빵을'], ['사과', '을', '사과를'],
    ['곰 인형', '과', '곰 인형과'], ['코코아', '과', '코코아와'], ['집', '으로', '집으로'], ['학교', '으로', '학교로'], ['서울', '으로', '서울로'],
    ['광장', '으로', '광장으로'], ['연필', '으로', '연필로'], ['빵', '이에요', '빵이에요'], ['사과', '이에요', '사과예요'], ['발', '이에요', '발이에요'],
    ['지훈', '이랑', '지훈이랑'], ['민지', '이랑', '민지랑'], ['지훈', '아', '지훈아'], ['민지', '아', '민지야'], ['율', '아', '율아'],
    ['경찰', '이었', '경찰이었'], ['의사', '이었', '의사였'], ['붕어빵', '이래', '붕어빵이래'], ['커피', '이래', '커피래'], ['3코인', '이야', '3코인이야'],
    ['TV', '을', 'TV를'], ['M', '이', 'M이'], ['L', '으로', 'L로'], ['1', '이', '1이'], ['2', '이', '2가'], ['3', '이', '3이'], ['10', '이', '10이'],
    ['100', '은', '100은'], ['1,000', '을', '1,000을'], ['5', '이에요', '5예요'], ['솔방울 신문사', '에서', '솔방울 신문사에서'],
    ['할머니', '과', '할머니와'], ['할아버지', '은', '할아버지는'], ['촌장님', '이', '촌장님이'], ['우리 남편', '이', '우리 남편이'],
  ];
  for (const [w, f, want] of cases) assert.equal(josa(w, f), want, `${w} + ${f}`);
});

test('every name in the name pools takes the particle its last syllable needs', () => {
  const names = [];
  for (const age of Object.keys(GIVEN)) for (const sex of ['m', 'f']) names.push(...GIVEN[age][sex]);
  for (const [s] of SURNAMES) names.push(s);
  assert.ok(names.length > 250);
  for (const n of names) {
    const c = n.charCodeAt(n.length - 1) - 0xac00;
    const jong = c % 28;
    const cons = jong !== 0;
    assert.equal(hasBatchim(n), cons, n);
    assert.equal(particle(n, '이'), cons ? '이' : '가', n + '이/가');
    assert.equal(particle(n, '은'), cons ? '은' : '는', n + '은/는');
    assert.equal(particle(n, '을'), cons ? '을' : '를', n + '을/를');
    assert.equal(particle(n, '과'), cons ? '과' : '와', n + '과/와');
    assert.equal(particle(n, '아'), cons ? '아' : '야', n + '아/야');
    assert.equal(particle(n, '이랑'), cons ? '이랑' : '랑', n + '이랑/랑');
    assert.equal(particle(n, '이에요'), cons ? '이에요' : '예요', n + '이에요/예요');
    assert.equal(particle(n, '으로'), !cons || jong === 8 ? '로' : '으로', n + '(으)로');
    assert.equal(casualName(n), cons ? n + '이' : n, 'casual ' + n);
    assert.ok(/^[A-Z][a-z]*$/.test(romanize(n, false)), 'romanize ' + n);
  }
});

test('particles after every item and place word', () => {
  for (const it of ITEMS) {
    const k = finalKind(it.ko);
    assert.equal(josa(it.ko, '을').slice(it.ko.length), k ? '을' : '를', it.ko);
  }
  for (const id in PLACE_KINDS) {
    const w = PLACE_KINDS[id].ko, k = finalKind(w);
    assert.equal(josa(w, '으로').slice(w.length), k === 1 ? '으로' : '로', w);
  }
});

test('native counting words before counters', () => {
  assert.equal(nativeCount(1), '한'); assert.equal(nativeCount(2), '두'); assert.equal(nativeCount(3), '세'); assert.equal(nativeCount(4), '네');
  assert.equal(nativeCount(20), '스무'); assert.equal(nativeCount(21), '스물한'); assert.equal(nativeCount(35), '서른다섯');
  assert.equal(counted(3, '개'), '세 개'); assert.equal(counted(5, '마리'), '다섯 마리'); assert.equal(counted(120, '개'), '120개');
});

test('grammar: {X:이} slots, 나/저/너 + 이/가, inline particles and speech levels', () => {
  const g = new Grammar({ a: ['{X:이} 왔어.'], b: ['[{X:아}, 안녕!|{X} 씨, 안녕하세요!|{X} 님, 안녕하십니까?]'], c: ['#n#{:을} 샀어.'], n: ['사과'] }, 'ko');
  const ctx = (x, level) => ({ f0: 0, f1: 0, f2: 0, f3: 0, f4: 0, slots: ~0, level, rng: { next: () => 0.1 }, get: () => x });
  assert.equal(g.expand('a', ctx('지훈', 0)), '지훈이 왔어.');
  assert.equal(g.expand('a', ctx('민지', 0)), '민지가 왔어.');
  assert.equal(g.expand('a', ctx('나', 0)), '내가 왔어.');
  assert.equal(g.expand('a', ctx('저', 0)), '제가 왔어.');
  assert.equal(g.expand('b', ctx('지훈', 0)), '지훈아, 안녕!');
  assert.equal(g.expand('b', ctx('민지', 1)), '민지 씨, 안녕하세요!');
  assert.equal(g.expand('b', ctx('민지', 2)), '민지 님, 안녕하십니까?');
  assert.equal(g.expand('c', ctx('', 0)), '사과를 샀어.');
});

test("반말 '너' becomes the right address for parents, older friends and spouses", () => {
  assert.equal(replaceYou('너는?', '엄마'), '엄마는?');
  assert.equal(replaceYou('나도 너랑 갈래!', '형'), '나도 형이랑 갈래!');
  assert.equal(replaceYou('네가 최고야!', '누나'), '누나가 최고야!');
  assert.equal(replaceYou('역시 너야!', '엄마'), '역시 엄마야!');
  assert.equal(replaceYou('너무 좋아. 저 언덕 너머 너구리!', '형'), '너무 좋아. 저 언덕 너머 너구리!');
});
