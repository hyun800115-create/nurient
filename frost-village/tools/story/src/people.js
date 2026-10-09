// Residents: identity (name, sex, birth day), personality, likes, job, home & household, money,
// needs & mood, where they are, their day plan, memory, open questions and relationships.

import { SURNAMES, GIVEN, poolFor } from '../lang/names.js';
import { AXES, LIKES } from '../data/traits.js';
import { JOBS } from '../data/places.js';

export const G_TODDLER = 0, G_KID = 1, G_TEEN = 2, G_ADULT = 3, G_ELDER = 4;
export const GROUP_NAMES = ['toddler', 'kid', 'teen', 'adult', 'elder'];

// resident states
export const S_IDLE = 0, S_TRAVEL = 1, S_TALK = 2, S_SLEEP = 3, S_EVENT = 4, S_JAIL = 5, S_AWAY = 6;

// flags
export const F_EXTERNAL = 1;    // provided by the game (named villager)
export const F_GONE = 2;        // moved away
export const F_DEAD = 4;        // gentle farewell
export const F_NEWCOMER = 8;
export const F_OWNER = 16;      // owns a shop
export const F_WANTED = 32;
export const F_JAILED = 64;
export const F_RICH = 128;
export const F_HOMELESS = 256;  // staying with someone after a fire

const SUR_W = SURNAMES.map((s) => s[1]);

export function ageGroupOf(age) { return age < 4 ? G_TODDLER : age < 13 ? G_KID : age < 19 ? G_TEEN : age < 65 ? G_ADULT : G_ELDER; }

export class Resident {
  constructor(id) {
    this.id = id;
    this.alive = true;
    this.flags = 0;
    this.key = null;            // game character key (e.g. 'npc_aunt' or a townsfolk preset seed)
    this.persona = 'plain';
    this.given = ''; this.sur = ''; this.title = null; this.titleEn = null;
    this.male = false;
    this.birth = 0;             // day number (negative: born before the story began)
    this.tr = new Uint8Array(AXES.length);
    this.likes = [0, 1, 2];
    this.dislike = 3;
    this.job = 'none'; this.work = -1;
    this.home = -1; this.hh = -1;
    this.wallet = 0; this.savings = 0; this.intAcc = 0;
    this.mood = 20; this.hunger = 20; this.energy = 80; this.socialNeed = 50; this.fun = 50;
    this.moodHist = 0;          // slow average (x10)
    this.unhappy = 0; this.jobless = 0;
    this.loc = -1; this.hereI = -1; this.dest = -1; this.destAct = 0; this.arriveAt = 0;
    this.state = S_IDLE; this.busyUntil = 0;
    this.plan = new Int32Array(48); this.planN = 0; this.planI = 0; this.planDay = -1;
    this.mem = [];
    this.qs = [];
    this.adj = [];
    this.recent = new Int32Array(24); this.rpos = { v: 0 };
    this.log = [];              // life log: [day, kind, other, factId, extra] (ring, 40)
    this.spouse = -1; this.parents = []; this.kids = [];
    this.dream = null; this.crushOn = -1;
    this.agenda = [];           // promised outings: [day, minute, placeIdx, withId]
    this.readDay = -1;
    this.lastTalk = 0;
    this.wanted = 0;            // incident id if wanted
    this.jailUntil = 0;
    this.stayWith = -1;         // home place idx while homeless after a fire
    this.leaveDay = -1;         // moving away on this day
    this.goneDay = -1;
    this.talks = 0;             // conversations had (metrics)
    this.workedDay = -1; this.bigBuy = null; this.loanWant = null; this.dreamShop = -1; this.lastBuy = -1;
    this.lastGroup = -1; this.arrived = 0; this.widowed = -1; this.lastBaby = 0; this.en = null;
  }
}

export function ageOf(e, r) {
  // the game's named villagers keep the age their sprite shows (keepNamed)
  if ((r.flags & F_EXTERNAL) && e.cfg.keepNamed) return Math.floor((r.arrived - r.birth) / e.cfg.yearDays);
  return Math.floor((e.clock.day - r.birth) / e.cfg.yearDays);
}
/** a game-named villager the story must not take away or turn into a culprit (keepNamed) */
export function isKept(e, r) { return (r.flags & F_EXTERNAL) !== 0 && !!e.cfg.keepNamed; }
export function groupOf(e, r) { return ageGroupOf(ageOf(e, r)); }

/** random personality (optionally nudged by a persona key) */
export function rollTraits(rng, tr, persona, group) {
  for (let i = 0; i < tr.length; i++) {
    // sum of two dice: most people are moderate, a few extreme
    tr[i] = Math.max(0, Math.min(100, Math.round((rng.next() + rng.next()) * 50 + (rng.next() - 0.5) * 30)));
  }
  const set = (ax, v) => { tr[AXES.indexOf(ax)] = Math.max(0, Math.min(100, v)); };
  const bump = (ax, d) => { const i = AXES.indexOf(ax); tr[i] = Math.max(0, Math.min(100, tr[i] + d)); };
  if (group === G_KID || group === G_TODDLER) { bump('mis', 18); bump('cur', 15); bump('rom', -40); bump('thr', -20); }
  if (group === G_TEEN) { bump('rom', 10); bump('soc', 8); }
  if (group === G_ELDER) { bump('kind', 10); bump('mis', -12); bump('thr', 12); }
  switch (persona) {
    case 'kid': bump('soc', 15); break;
    case 'prankster': set('mis', 92); bump('hum', 20); break;
    case 'teen': set('soc', 85); bump('rom', 15); break;
    case 'showoff': set('vain', 85); bump('brave', 20); break;
    case 'kind': set('kind', 90); bump('soc', 20); break;
    case 'grumpy': set('kind', 18); bump('hum', 10); break;
    case 'gentle': set('kind', 88); break;
    case 'easy': set('dil', 20); bump('hum', 15); break;
    case 'sly': set('hon', 25); set('soc', 80); break;
    case 'shy': set('soc', 15); break;
    case 'bard': set('rom', 88); bump('soc', 15); break;
    case 'hearty': set('hum', 80); set('brave', 85); break;
    case 'vain': set('vain', 92); break;
    case 'chef': bump('dil', 20); break;
    case 'guard': set('brave', 90); set('hon', 85); break;
  }
}

export function rollLikes(rng, r, group) {
  const n = LIKES.length;
  const pick = new Set();
  // kids like snow play more, elders like baduk / walks / saunas more
  const pref = group <= G_KID ? ['snowman', 'snowball', 'sledding', 'skating', 'dogs', 'penguins', 'bungeoppang', 'cocoa']
    : group === G_ELDER ? ['baduk', 'yut', 'walks', 'saunas', 'gardening', 'naps', 'sweetpotato', 'knitting', 'sea'] : null;
  while (pick.size < 3) {
    if (pref && rng.chance(0.6)) { const id = pref[rng.int(pref.length)]; pick.add(LIKES.find((l) => l.id === id).idx); }
    else pick.add(rng.int(n));
  }
  r.likes = Array.from(pick);
  let d = rng.int(n);
  while (pick.has(d)) d = (d + 1) % n;
  r.dislike = d;
}

export function rollName(rng, e, age, male) {
  const pool = GIVEN[poolFor(age)][male ? 'm' : 'f'];
  // avoid given names already used by living residents (clearer conversations)
  let g = pool[rng.int(pool.length)];
  for (let tries = 0; tries < 12 && e.usedNames.has(g); tries++) g = pool[rng.int(pool.length)];
  const sur = SURNAMES[rng.weighted(SUR_W)][0];
  return [sur, g];
}

/** create a resident in engine e from a spec (all fields optional) */
export function makeResident(e, spec = {}) {
  const rng = e.rng;
  const r = new Resident(e.nextPersonId++);
  const age = spec.age !== undefined ? spec.age : 30;
  r.male = spec.male !== undefined ? !!spec.male : rng.chance(0.5);
  r.birth = e.clock.day - age * e.cfg.yearDays - rng.int(e.cfg.yearDays);
  const group = ageGroupOf(age);
  if (spec.given) { r.given = spec.given; r.sur = spec.sur || ''; }
  else { const [s, g] = rollName(rng, e, age, r.male); r.sur = spec.sur || s; r.given = g; }
  r.title = spec.title || null;
  r.titleEn = spec.titleEn || null;
  r.key = spec.key || null;
  r.persona = spec.persona || 'plain';
  if (spec.external) { r.flags |= F_EXTERNAL; r.arrived = e.clock.day; }
  rollTraits(rng, r.tr, r.persona, group);
  if (spec.traits) for (const k in spec.traits) { const i = AXES.indexOf(k); if (i >= 0) r.tr[i] = spec.traits[k]; }
  rollLikes(rng, r, group);
  r.job = spec.job || (group === G_ELDER ? 'retired' : group <= G_TEEN ? (group >= G_KID ? 'student' : 'none') : 'none');
  r.wallet = spec.wallet !== undefined ? spec.wallet : group <= G_TEEN ? rng.range(2, 15) : rng.range(30, 140);
  r.savings = spec.savings !== undefined ? spec.savings : group <= G_TEEN ? rng.range(0, 30) : group === G_ELDER ? rng.range(200, 1500) : rng.range(50, 900);
  r.mood = rng.range(0, 50);
  r.socialNeed = rng.range(30, 70);
  e.people[r.id] = r;
  e.alive.push(r);
  e.usedNames.add(r.given);
  return r;
}

export function jobDef(r) { return JOBS[r.job] || JOBS.none; }

// ---------------------------------------------------------------- households
export class Household {
  constructor(id) { this.id = id; this.members = []; this.home = -1; this.since = 0; this.unhappy = 0; this.planOut = -1; this.why = undefined; }
}

export function addToHousehold(e, hh, r) {
  if (r.hh >= 0 && r.hh !== hh.id) removeFromHousehold(e, r);
  if (hh.members.indexOf(r.id) < 0) hh.members.push(r.id);
  r.hh = hh.id;
  r.home = hh.home;
  if (hh.home >= 0) { const p = e.world.places[hh.home]; if (p.residents.indexOf(r.id) < 0) p.residents.push(r.id); }
}

export function removeFromHousehold(e, r) {
  const hh = e.households.get(r.hh);
  if (hh) {
    const i = hh.members.indexOf(r.id);
    if (i >= 0) hh.members.splice(i, 1);
    if (hh.home >= 0) {
      const p = e.world.places[hh.home];
      const j = p.residents.indexOf(r.id);
      if (j >= 0) p.residents.splice(j, 1);
    }
    if (!hh.members.length) {
      if (hh.home >= 0) { const p = e.world.places[hh.home]; if (p.hh === hh.id) p.hh = -1; }
      e.households.delete(hh.id);
    }
  }
  r.hh = -1; r.home = -1;
}

export function setHome(e, hh, homeIdx) {
  if (hh.home >= 0) {
    const old = e.world.places[hh.home];
    if (old.hh === hh.id) old.hh = -1;
    old.residents.length = 0;
  }
  hh.home = homeIdx;
  if (homeIdx >= 0) {
    const p = e.world.places[homeIdx];
    p.hh = hh.id;
    p.residents.length = 0;
    for (const id of hh.members) { p.residents.push(id); e.people[id].home = homeIdx; }
  } else for (const id of hh.members) e.people[id].home = -1;
}
