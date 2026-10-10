// A stand-in village for the missions + bank Node tests and the lab page: the `env` facade the models read
// (clock, facts, people, income, local date), with knobs a test can turn (rank, buildings, districts, who lives here,
// what is on screen). Deterministic; nothing here touches Phaser or the real game.

import { closureOf } from '../../../src/missions/data/caps.js';

const HOUR = 25, DAY = 600;

/** the named villagers and pets of v4, a few townsfolk and settlers (pids as in docs/v5_v8_plan.md §5.6) */
export const ROSTER = {
  'v:npc_aunt': { role: ['adult'], name: { ko: '빵집 아주머니', en: 'the baker' } },
  'v:npc_uncle': { role: ['adult'], name: { ko: '삼촌', en: 'Uncle' } },
  'v:npc_grandma': { role: ['elder'], name: { ko: '할머니', en: 'Grandma' } },
  'v:npc_grandpa': { role: ['elder'], name: { ko: '할아버지', en: 'Grandpa' } },
  'v:npc_kid_boy': { role: ['kid'], name: { ko: '도윤', en: 'Doyun' } },
  'v:npc_kid_girl': { role: ['kid'], name: { ko: '하린', en: 'Harin' } },
  'v:npc_teen_girl': { role: ['adult'], name: { ko: '소라', en: 'Sora' } },
  'v:npc_young_man': { role: ['adult'], name: { ko: '준호', en: 'Junho' } },
  'pet:pet_cat': { role: ['pet'], name: { ko: '고양이 나비', en: 'Nabi' } },
  'pet:pet_penguin': { role: ['pet'], name: { ko: '뽀삐', en: 'Ppoppi' } },
  't:12': { role: ['adult', 'owner:carpenter_workshop'], name: { ko: '목수 김씨', en: 'Mr Kim the carpenter' } },
  't:31': { role: ['adult'], name: { ko: '민지', en: 'Minji' } },
  't:47': { role: ['elder'], name: { ko: '순자 할머니', en: 'Grandma Sunja' } },
  't:58': { role: ['kid'], name: { ko: '지호', en: 'Jiho' } },
  's:1': { role: ['settler', 'adult'], name: { ko: '새 이웃 은비', en: 'Eunbi' } },
  's:2': { role: ['settler', 'adult'], name: { ko: '새 이웃 태오', en: 'Taeo' } },
};

export class FakeWorld {
  /**
   * opts: { rank, facts: [], counts: {}, income, wall0 (ms, read as LOCAL time fields), onScreen: [pids], roster }
   */
  constructor(opts = {}) {
    this.T = opts.T || 0;
    this.rankN = opts.rank || 2;
    this.extra = new Set(opts.facts || []);
    this.counts = Object.assign({ shops: 5, towers: 3 }, opts.counts || {});
    this.I = opts.income === undefined ? 1800 : opts.income;
    this.wall0 = opts.wall0 || Date.UTC(2026, 9, 9, 10, 0, 0);     // 2026-10-09 10:00 "local"
    this.wallMs = 0;
    this.up = 0;
    this.roster = JSON.parse(JSON.stringify(opts.roster || ROSTER));
    this.screen = new Set(opts.onScreen || []);
    this.unwired = !!opts.unwired;
    this.refresh();
    const self = this;
    this.env = {
      T: () => self.T,
      hour: () => self.hour(),
      day: () => self.day(),
      rank: () => self.rankN,
      has: (c) => self.facts.has(c),
      count: (k) => self.counts[k] || 0,
      income: () => self.I,
      wall: () => self.wall0 + self.wallMs,
      uptime: () => self.up,
      localDate: () => { const d = new Date(self.wall0 + self.wallMs); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours() + d.getUTCMinutes() / 60 }; },
      people: {
        pick: (role, ctx = {}) => self.pick(role, ctx),
        has: (pid) => !!self.roster[pid],
        onScreen: (pid) => self.screen.has(pid),
        name: (pid, lang) => (self.roster[pid] ? self.roster[pid].name[lang] || self.roster[pid].name.ko : pid),
      },
    };
  }

  refresh() {
    const base = ['rank:' + Math.min(this.rankN, 3)];
    if (this.rankN >= 3) base.push('rank:2');
    this.facts = closureOf(base.concat(Array.from(this.extra)));
    for (const k of this.extra) this.facts.add(k);
    // the modules that perform drive / contract / choose / tap steps run (a host answers these in the game)
    if (!this.unwired) for (const k of ['step:drive', 'step:contract', 'step:choose', 'step:tap']) this.facts.add(k);
  }
  set(fact, on = true) { if (on) this.extra.add(fact); else this.extra.delete(fact); this.refresh(); }
  rank(n) { this.rankN = n; this.refresh(); }

  hour() { return ((this.T / HOUR) + 8) % 24; }
  day() { return Math.floor((this.T + 8 * HOUR) / DAY); }
  /** advance game time and wall time together (1 game s = 1 real s) */
  advance(dt) { this.T += dt; this.wallMs += dt * 1000; this.up += dt * 1000; }
  /** move the phone's clock (not game time) */
  setWall(ms) { this.wallMs = ms - this.wall0; }

  pick(role, ctx) {
    const ex = ctx.exclude || new Set();
    if (role.startsWith('v:') || role.startsWith('pet:')) return this.roster[role] && !ex.has(role) ? role : null;
    let want = role.startsWith('role:') ? role.slice(5) : role;
    if (role === 'friend' || role === 'crush') want = 'adult';
    const list = Object.keys(this.roster).filter((p) => this.roster[p].role.indexOf(want) >= 0 && !ex.has(p) && p !== ctx.of);
    let l2 = list;
    if (ctx.offScreen) l2 = list.filter((p) => !this.screen.has(p));
    if (!l2.length) return null;
    const r = ctx.rng ? ctx.rng.int(l2.length) : 0;
    return l2[r];
  }
}

/** a wallet with a ledger (bank tests and the lab) */
export class Wallet {
  constructor(v = 0) { this.value = v; this.inAdd = 0; this.inSpend = 0; }
  add(n) { n = Math.floor(n); if (n > 0) { this.value += n; this.inAdd += n; } }
  spend(n) { n = Math.min(this.value, Math.floor(n)); if (n > 0) { this.value -= n; this.inSpend += n; } return n; }
}

/** a feed event that produces counter signal `sig` (n of it) — every signal the catalog uses has one */
export function feedFor(sig, n = 1) {
  const [a, b] = sig.split(':');
  if (a === 'sold') return { t: 'sold', item: b, n, value: n };
  if (a === 'traded') return { t: 'traded', item: b, n };
  if (a === 'made' && (b === 'furniture' || b === 'appliance')) return { t: 'lgx:produced', kind: b, n };
  if (a === 'made') return { t: 'produced', item: b, n };
  if (a === 'catch') return { t: 'boatHome', catch: { [b]: n } };
  if (a === 'dog') return { t: 'dogAct', kind: b };
  if (a === 'ride') return { t: 'train', ev: 'ride', chief: true, line: b };
  return ({
    cust: { t: 'sold' }, combo: { t: 'restMeal', combo: true }, wholesale: { t: 'wholesale', n }, visitor: { t: 'visitorDone' },
    riders: { t: 'train', ev: 'arrive', n }, bus_riders: { t: 'veh:arrive', riders: n, line: 1 }, chief_ride: { t: 'veh:ride', chief: true, line: 1 },
    chat: { t: 'chat' }, tax: { t: 'collect', pad: 'tax' }, flower: { t: 'flower' }, paper_read: { t: 'paperRead' },
    auction: { t: 'harbor:auction' }, export: { t: 'harbor:export', n }, beach_guest: { t: 'beach:arrive', n }, hotel_guest: { t: 'beach:checkin', n },
    settle: { t: 'lgx:settle' }, deposit: { t: 'bank:deposit', saved: n, repaid: 0 },
  })[sig] || null;
}

/** how many units of `sig` one feedFor(sig, n) event gives (single-count events give 1) */
export function feedGives(sig, n) {
  const one = ['cust', 'combo', 'visitor', 'chief_ride', 'chat', 'tax', 'flower', 'paper_read', 'auction', 'settle'];
  if (one.indexOf(sig) >= 0 || sig.startsWith('dog:') || sig.startsWith('ride:')) return 1;
  return n;
}
