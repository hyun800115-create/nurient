// (v4.2, docs/v42_plan.md §7.2) 관망 모드: the activities, their scores and the day's agenda (pure, Node-testable).
//   score(act, ctx)   the base score of an activity in the context snapshot ctx (null = not possible now)
//   agendaK(act, h)   the hour weight (BALANCE.v42.pilot.agenda: [from, to, act, mult])
//   choose(ctx, seed, index, cur)   the next activity: highest score × agenda × (1 ± jitter) from a seeded RNG,
//                    the current one keeps a hysteresis bonus and is locked for its minimum time
// ctx = { hour, urgent, lunchOpen, bagRoom, bagCount, work, noCourier, cashMax, trainSoon, trainNear, chatMate,
//         chatIdle, office, paperNew, unread, dog, evening, locked: { act: until },
//         (v4.2 fix) trainToday (a train watched today), dogIdle (s since he last played with 누리) }
// ((v4.2 fix, CODE-2 review) the night is his: from 21:00 to 06:00 the evening (office lamp, the stove, the campfire)
//  beats the chores; one train watch a day and a game with 누리 every ~10 minutes find their place; the leisure acts
//  wait until his bag is delivered (no lunch with a tower of smoked meat on his head))

import { BALANCE } from '../../data/balance.js';

export const ACTS = ['urgent', 'lunch', 'work', 'evening', 'collect', 'train', 'chat', 'office', 'rest', 'dog'];
/** minimum / maximum time an activity is kept (s) */
export const DUR = { urgent: [4, 25], lunch: [40, 40], work: [20, 60], evening: [30, 120], collect: [6, 30], train: [15, 40], chat: [20, 30], office: [30, 60], rest: [20, 40], dog: [15, 15] };
/** after an activity ends it is not chosen again for this long (s): the day keeps changing; chores have no wait but
 *  pause for pilot.breakFor s after pilot.breakAfter s of them (ChiefPilot) */
export const AGAIN = { urgent: 0, lunch: 0, work: 0, evening: 0, collect: 10, train: 45, chat: 45, office: 120, rest: 60, dog: 90 };
// (수금 counts as a chore for the breaks: with no 딸랑이 the tills fill all day and 수금 45 would crowd out every
//  chat, rest and dog walk — the measured 10-minute mix was urgent / collect / work only)
export const CHORES = ['urgent', 'work', 'collect'];

const PB = () => (BALANCE.v42 && BALANCE.v42.pilot) || {};

/** the acts that wait for an empty bag (while his load has somewhere to go) */
export const HANDS_FREE = new Set(['lunch', 'evening', 'train', 'chat', 'office', 'rest', 'dog']);

export function score(act, c) {
  // ((v4.2 fix, visual M1) carrying a load that has a place to go: deliver it first (업무), then the leisure act
  if (HANDS_FREE.has(act) && c.bagCount > 0 && c.work) return null;
  switch (act) {
    case 'urgent': return c.urgent ? 100 : null;
    case 'lunch': return c.hour >= 12 && c.hour < 13 && c.lunchOpen ? 50 : null;
    case 'work': return c.work ? 40 : null;
    // (CODE-1 tuned: the evening yields to the day's work (30 < 업무 40) and coins waiting on a pad are fetched before
    //  more hand-work (45): with 40 / 35 the evening third of every day earned nothing — 57 % of the arrow bot's income)
    // ((v4.2 fix, gameplay M4) …but from 21:00 to 06:00 it is night: the evening (60) beats every chore but an urgent
    //  one — he hauled ingots at 03:00 in 100 % of the samples)
    case 'evening': return c.hour >= 21 || c.hour < 6 ? 60 : c.hour >= 20 ? 30 : null;
    case 'collect': return c.noCourier && c.cashMax >= 200 ? 45 : null;
    // (one train watch a day comes before the afternoon's chores)
    case 'train': return c.trainSoon && c.trainNear ? 30 + (c.trainToday ? 0 : 25) : null;
    case 'chat': return c.chatMate ? 25 + (c.chatIdle >= 180 ? 15 : 0) : null;
    case 'office': return c.office && c.bagCount === 0 ? 20 + (c.hour >= 8 && c.hour < 10 && c.paperNew ? 30 : 0) + (c.unread >= 2 ? 30 : 0) : null;
    case 'rest': return 20;
    // (누리: after 10 minutes without a game the dog comes before a rest or a chat)
    case 'dog': return c.dog ? 15 + ((c.dogIdle || 0) >= 600 ? 20 : 0) : null;
    default: return null;
  }
}

export function agendaK(act, hour) {
  let k = 1;
  for (const row of PB().agenda || []) {
    const [a, b, what, m] = row;
    if (what !== act && !(what === 'work' && act === 'urgent')) continue;
    const inside = a <= b ? hour >= a && hour < b : hour >= a || hour < b;
    if (inside) k *= Number(m) || 1;
  }
  return k;
}

/** mulberry32 */
export function rng32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function hash3(a, b, c) { let h = 2166136261 >>> 0; for (const v of [a, b, c]) { h ^= (v >>> 0); h = Math.imul(h, 16777619) >>> 0; h ^= h >>> 13; } return h >>> 0; }

/**
 * the next activity: { act, score } — a pure function of (ctx, seed, day, index, cur)
 *   cur = { act, since, min } the running activity (kept while t < min, then with a hysteresis bonus)
 */
export function choose(ctx, seed, day, index, cur) {
  const P = PB(), jit = Number(P.jitter) || 0.1, hyst = Number(P.hysteresis) || 0.2;
  const r = rng32(hash3(seed, day, index));
  const lockedNow = (a) => !!(ctx.locked && ctx.locked[a] && ctx.locked[a] > (ctx.now || 0));
  // (the minimum time keeps the running act — except 업무 between two loads (bag empty): lunch, the night, the day's
  //  train may take over there, with the usual hysteresis)
  const between = cur && cur.act === 'work' && ctx.bagCount === 0;
  if (cur && cur.act && cur.t < cur.min && !between && score(cur.act, ctx) !== null && !lockedNow(cur.act)) return { act: cur.act, score: Infinity, kept: true };
  let best = null;
  for (const a of ACTS) {
    const s0 = score(a, ctx);
    const j = 1 + (r() * 2 - 1) * jit;
    if (s0 === null) continue;
    if (lockedNow(a)) continue;
    let s = s0 * agendaK(a, ctx.hour) * j;
    if (cur && cur.act === a) s *= 1 + hyst;
    if (!best || s > best.score) best = { act: a, score: s };
  }
  return best || { act: 'rest', score: 0 };
}
