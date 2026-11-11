// (v4.3) 마을 주민 창 — who the settlers are. The game counts settlers as a plain number (Civic.settlers): no name, age,
// house or body. Each one gets a fixed identity here from the save's own id (gs.cid) and their arrival number: the same
// person every time the window opens and after every reload, never saved, never re-rolled (spec §1.4).
//   household  settlers 2k-1 and 2k are a couple (same house) when both have arrived; an odd last one lives alone.
//              The odd one never depends on the even one, so nobody changes when the next settler arrives
//   names      the story engine's name pools (lang/names.js); a full name already used (by an earlier settler) or a
//              named villager's given name moves on to the next name in the pool (stable: only earlier ones count)
//   look       women villager_a, men villager_b (the characters fragment, always loaded; the voice cast agrees)
// Pure: no game objects (tools/test/residents.test.mjs runs it in Node).

import { SURNAMES, GIVEN } from '../../story/engine/lang/names.js';
import { romanize } from '../../story/engine/lang/josa.js';
import { TRAIT_LABEL, LIKES } from '../../story/engine/data/traits.js';
import { SETTLER_JOBS } from './data.js';

/** FNV-1a (the story engine's hash: adopt.js) */
export function fnv(s, h = 0x811c9dc5) {
  s = String(s);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
/** mulberry32 (src/core/Townfolk.js) */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const SUR_TOTAL = SURNAMES.reduce((a, s) => a + s[1], 0);
function surnameIdx(r) { let x = Math.floor(r() * SUR_TOTAL); for (let i = 0; i < SURNAMES.length; i++) { x -= SURNAMES[i][1]; if (x < 0) return i; } return 0; }
const TRAITS = Object.keys(TRAIT_LABEL).filter((k) => k !== 'foodie');
const CLASH = { chatty: 'shy', shy: 'chatty', kind: 'grumpy', grumpy: 'kind', honest: 'gossip', gossip: 'honest', diligent: 'sleepy', sleepy: 'diligent' };
// the named villagers' given names: no settler shares one
const TAKEN = new Set(['하린', '준', '도윤', '태오', '서아', '콩콩', '바다', '쿡']);

const cache = new Map();       // cid -> [identity of settler 1, 2, ...] (filled in order: names depend on the earlier ones)

function make(cid, i, partner, used) {
  const r = mulberry32(fnv(cid + '|s|' + i));
  const sex = partner ? (partner.sex === 'f' ? 'm' : 'f') : (r() < 0.5 ? 'f' : 'm');
  const age = partner ? Math.max(23, Math.min(61, partner.age + Math.floor(r() * 13) - 6)) : 24 + Math.floor(r() * 36);
  const pool = GIVEN.adult[sex];
  let gi = Math.floor(r() * pool.length);
  let si = surnameIdx(r);
  // a full name already taken (or a named villager's given name): the next given name, then the next surname (stable)
  for (let n = 0; n < pool.length * SURNAMES.length; n++) {
    const g = pool[gi], s = SURNAMES[si][0];
    if (!TAKEN.has(g) && !used.has(s + g)) break;
    gi = (gi + 1) % pool.length;
    if (gi === 0) si = (si + 1) % SURNAMES.length;
  }
  const given = pool[gi], sur = SURNAMES[si][0];
  used.add(sur + given);
  const t1 = TRAITS[Math.floor(r() * TRAITS.length)];
  let t2 = TRAITS[Math.floor(r() * TRAITS.length)];
  for (let n = 0; n < TRAITS.length && (t2 === t1 || CLASH[t1] === t2); n++) t2 = TRAITS[(TRAITS.indexOf(t2) + 3) % TRAITS.length];
  const l1 = LIKES[Math.floor(r() * LIKES.length)];
  let l2 = LIKES[Math.floor(r() * LIKES.length)];
  if (l2 === l1) l2 = LIKES[(l1.idx + 7) % LIKES.length];
  const jobRow = SETTLER_JOBS[fnv(cid + '|job|' + i) % SETTLER_JOBS.length];
  return {
    pid: 's:' + i, i, sex, age, given, sur, name: sur + given, nameEn: romanize(given) + ' ' + romanize(sur, true),
    look: sex === 'f' ? 'villager_a' : 'villager_b', traits: [t1, t2], likes: [l1.id, l2.id],
    job: jobRow[0], gate: jobRow[1], partner: partner ? partner.i : 0,
  };
}

/**
 * settler i (1-based) of the village with save id `cid`. The couple link (`partner`) is one-sided by construction: the
 * even settler of a pair knows its partner; Roster shows the pair only when both have arrived.
 */
export function settlerIdentity(cid, i) {
  cid = String(cid || 'village');
  i = Math.max(1, Math.floor(i));
  let L = cache.get(cid);
  if (!L) { L = { list: [], used: new Set() }; cache.set(cid, L); if (cache.size > 4) cache.delete(cache.keys().next().value); }
  while (L.list.length < i) {
    const n = L.list.length + 1;
    const partner = n % 2 === 0 ? L.list[n - 2] : null;
    L.list.push(make(cid, n, partner, L.used));
  }
  return L.list[i - 1];
}

/** the settler who shares a household with settler i (0 = none yet / lives alone) */
export function partnerOf(i, settlers) {
  if (i % 2 === 1) return i + 1 <= settlers ? i + 1 : 0;
  return i - 1;
}

/** the label of a story trait id / like id in a language */
export function traitLabel(id, lang) { const L = TRAIT_LABEL[id]; return L ? (lang === 'en' ? L[1] : L[0]) : id; }
export function likeLabel(id, lang) { const L = LIKES.find((q) => q.id === id); return L ? (lang === 'en' ? L.en : L.ko) : id; }
