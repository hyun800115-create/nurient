// Simulated long play for resident chat: N conversations through the real ChatEngine with a fake
// sample capability that writes varied, valid AI replies (new gossip, lines, facts every time).
// Used by size.test.mjs and tools/test/chat_size.mjs to measure how the save grows.

import { ChatVillage } from '../../../src/chat/village.js';
import { ChatEngine } from '../../../src/chat/engine.js';
import { LAB_RESIDENTS, PERSONAS } from '../../../src/chat/personas.js';
import { makeFakeSample } from './fake_sample.mjs';
import { makeRng } from '../../../src/chat/village.js';

const TOPICS = ['생선', '빵', '눈사람', '썰매', '고양이', '음악', '기차', '날씨', '뜨개질', '광산', '학교', '바다', '코코아', '스케이트', '도서관', '꽃', '축제', '등대'];
const THINGS = ['생선', '크림빵', '눈사람', '썰매', '목도리', '코코아', '귤', '꽃다발', '연', '눈썰매장', '모닥불', '편지', '그림', '케이크', '스웨터', '도토리', '별사탕', '등불'];
const VERBS = ['만들었대', '좋아한대', '선물했대', '찾았대', '구경했대', '자랑했대', '고쳤대', '배웠대'];
const NUMS = ['세', '네', '다섯', '열', '스무'];
const COUNT = ['개', '마리', '번', '송이'];

export function randomReply(rng, key) {
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const t = pick(TOPICS), th = pick(THINGS), v = pick(VERBS);
  const other = pick(LAB_RESIDENTS.filter((k) => k !== key));
  const n = pick(NUMS) + ' ' + pick(COUNT);
  const name = PERSONAS[other].name;
  return {
    reply: '촌장님, ' + th + ' 얘기 재밌어요! ' + t + ' 생각만 해도 신나요~',
    emote: pick(['heart', 'laugh', 'sparkle', 'exclaim']), mood: pick(['happy', 'excited', 'calm']), affinity: pick([0, 1, 1, 2, -1]),
    memory: '촌장님이 ' + th + ' 얘기를 ' + n + ' 했다',
    facts: rng() < 0.4 ? ['촌장님은 ' + th + '을 좋아한다'] : [],
    importance: 1 + Math.floor(rng() * 5), topics: [t, pick(TOPICS)],
    gossip: ['촌장님이 ' + name + '한테 ' + th + ' ' + n + '를 ' + v, '촌장님이 ' + t + ' 축제에서 ' + th + '을 ' + v].slice(0, 1 + Math.floor(rng() * 2)),
    lines: rng() < 0.7 ? ['촌장님, 오늘도 ' + th + ' 얘기 해 주세요! ' + t + ' 얘기도요~'] : [],
    favor: rng() < 0.08 ? { ask: th + ' 하나만 구해 줄 수 있어요?', item: th } : null,
  };
}

/**
 * run `total` conversations (open, `perConv` AI messages, close); a new game day every `perDay`.
 * returns { village, engine, curve: [{ convs, bytes, gossip, lines, episodes }], calls }
 */
export async function simulate({ total = 1000, perConv = 3, perDay = 8, seed = 5, marks = [10, 50, 100, 250, 500, 750, 1000] } = {}) {
  const rng = makeRng(seed);
  const village = new ChatVillage({ roster: LAB_RESIDENTS, seed });
  const sample = makeFakeSample({ script: (input) => ({ reply: randomReply(rng, currentKey), chunks: 1 }) });
  const engine = new ChatEngine({ village, sample, opts: { cooldownMs: 0, sessionBudget: 1e9, streakBudget: 1e9 } });
  let currentKey = LAB_RESIDENTS[0];
  const lines = ['요즘 어때?', '무슨 소문 있어?', '나 오늘 생선 잡았어!', '선물 줄게', '고양이 좋아해?', '도와줄 일 있어?', '눈사람 만들자', '잘 지내!'];
  const curve = [];
  for (let c = 1; c <= total; c++) {
    currentKey = LAB_RESIDENTS[Math.floor(rng() * LAB_RESIDENTS.length)];
    engine.open(currentKey);
    for (let m = 0; m < perConv; m++) await engine.send(currentKey, lines[Math.floor(rng() * lines.length)]);
    engine.close(currentKey);
    if (c % perDay === 0) village.newDay();
    if (marks.includes(c)) {
      const s = village.corpus.stats(village.day);
      curve.push({ convs: c, bytes: village.sizeBytes(), gossip: s.gossip, lines: s.lines, episodes: Object.values(village.mems).reduce((a, m) => a + m.ep.length + m.sum.length, 0), day: village.day });
    }
  }
  return { village, engine, curve, calls: sample.calls.length };
}
