// ChatVillage: the saved state of resident chat — each resident's memory of the chief, the shared
// VillageCorpus of learned gossip / lines, resident-to-resident relationships, the game day and
// the world context (time of day, weather, news, what the chief did lately).
//
// Save format is versioned ({ v: SAVE_VERSION, … }); MIGRATIONS upgrades older saves step by step.

import { PERSONAS, RELATIONS, relationTable, levelToChief, stageOf } from './personas.js';
import { ResidentMemory } from './memory.js';
import { VillageCorpus } from './corpus.js';
import { POLITE } from './ko.js';
import { gossipOk, sensitiveWhy, ORDER } from './safety.js';

export const SAVE_VERSION = 2;

export const WEATHERS = [
  { id: 'snow', ko: '눈' }, { id: 'heavy', ko: '함박눈' }, { id: 'clear', ko: '맑은 하늘' },
  { id: 'blizzard', ko: '눈보라' }, { id: 'fog', ko: '안개' }, { id: 'snow', ko: '눈' }, { id: 'clear', ko: '맑은 하늘' },
];
export const PARTS = ['아침', '낮', '저녁', '밤'];

// tiny village news for days when nothing else happened (the game feeds real news via setWorld)
const NEWS = [
  '광장 분수가 꽁꽁 얼어서 아이들이 썰매장으로 쓰고 있어요', '빵집에서 눈꽃 쿠키를 새로 팔기 시작했어요', '대장간 굴뚝 연기가 하트 모양으로 피어올랐어요',
  '밤하늘에 오로라가 떴다는 목격담이 있어요', '우체국에 편지가 산더미처럼 쌓였어요', '연못 얼음이 두꺼워져서 스케이트를 탈 수 있어요',
  '잡화점에 벙어리장갑이 새로 들어왔어요', '시바견 콩이가 광장에서 썰매를 끌었어요', '동쪽 숲에서 사슴 발자국이 발견됐어요',
];

/** a small seeded random (mulberry32); state is one number, so it saves */
export function makeRng(seed) {
  let s = seed >>> 0;
  const f = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.state = () => s;
  return f;
}

export const MIGRATIONS = {
  // 0 -> 1: the first public format. A save without `v` (an early lab build) is shaped the same.
  0: (o) => Object.assign({}, o, { v: 1 }),
  // 1 -> 2: the safety pass. Saves from before it may hold rumours and memories the village should
  // not keep (unkind, sad, real-life, romance, orders, rewards); they are removed, and old
  // distress / rude episodes become private ones.
  1: (o) => {
    const keys = Array.isArray(o.k) ? o.k : [];
    const c = o.c && Array.isArray(o.c.e) ? Object.assign({}, o.c, { e: o.c.e.filter((x) => x && typeof x.t === 'string' && (x.k === 'g' ? gossipOk(x.t, { origin: keys[x.o] || null }) : !sensitiveWhy(x.t))) }) : o.c;
    const m = {};
    for (const k in o.m || {}) {
      const r = Object.assign({}, o.m[k]);
      const bad = (t) => !!sensitiveWhy(t, { aboutChief: true }) || ORDER.test(t);
      if (Array.isArray(r.e)) r.e = r.e.filter((e) => e && typeof e.s === 'string').map((e) => (/힘들어 보였|서운한 말/.test(e.s) ? Object.assign({}, e, { pv: 1, f: Math.min(-1, e.f | 0), k: /힘들어/.test(e.s) ? 'care' : e.k, ck: 1 }) : e)).filter((e) => e.pv || !bad(e.s));
      if (Array.isArray(r.su)) r.su = r.su.filter((x) => x && typeof x.s === 'string' && !bad(x.s));
      if (Array.isArray(r.fa)) r.fa = r.fa.filter((x) => x && typeof x.s === 'string' && !bad(x.s));
      m[k] = r;
    }
    const w = Object.assign({}, o.w || {});
    if (Array.isArray(w.news)) w.news = w.news.filter((n) => !/^소문:/.test(String(n)));
    return Object.assign({}, o, { v: 2, c, m, w });
  },
};

export function migrate(o) {
  if (!o || typeof o !== 'object') return null;
  let v = o.v | 0;
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) return null;
    o = step(o);
    v = o.v | 0;
  }
  return v === SAVE_VERSION ? o : null;
}

export class ChatVillage {
  /**
   * opts: { personas, roster (resident keys living here), relations, chiefName, seed, startAff }
   */
  constructor(opts = {}) {
    this.personas = opts.personas || PERSONAS;
    this.roster = (opts.roster || Object.keys(this.personas)).filter((k) => this.personas[k]);
    this.chiefName = opts.chiefName || '촌장님';
    this.relBase = relationTable(opts.relations || RELATIONS);
    this.relDelta = Object.create(null);     // 'a|b' -> change since the start (talking makes friends)
    this.mems = Object.create(null);
    this.corpus = new VillageCorpus();
    this.day = 0;
    this.part = 0;
    this.seed = opts.seed != null ? opts.seed : 7;
    this.rng = makeRng(this.seed);
    this.world = { weather: 'snow', weatherKo: '눈', partKo: PARTS[0], news: [NEWS[0]], deeds: [] };
    this.stats = { ai: 0, off: 0, learned: 0, spread: 0 };
    this.startAff = opts.startAff || {};
  }

  persona(key) { return this.personas[key] || null; }

  mem(key) {
    let m = this.mems[key];
    if (!m) {
      const p = this.personas[key];
      m = this.mems[key] = new ResidentMemory(key, { aff: this.startAff[key] != null ? this.startAff[key] : p && p.group === 'elder' ? 18 : 12, mood: p ? p.mood : 'happy' });
    }
    return m;
  }

  level(key) { return levelToChief(this.personas[key], this.mem(key).aff); }
  stage(key) { return stageOf(this.mem(key).aff); }
  isPolite(key) { return this.level(key) === POLITE; }

  relation(a, b) {
    const base = (this.relBase[a] && this.relBase[a][b]) || null;
    const d = this.relDelta[a < b ? a + '|' + b : b + '|' + a] || 0;
    if (!base && !d) return null;
    return { aff: Math.max(0, Math.min(100, (base ? base.aff : 20) + d)), label: base ? base.label : '' };
  }

  /** friends of `key` among the residents living here: [[b, aff, label]] strongest first */
  friendsOf(key, min = 0) {
    const out = [];
    for (const b of this.roster) {
      if (b === key) continue;
      const r = this.relation(key, b);
      if (r && r.aff >= min) out.push([b, r.aff, r.label]);
    }
    out.sort((x, y) => y[1] - x[1]);
    return out;
  }

  bond(a, b, d) {
    const k = a < b ? a + '|' + b : b + '|' + a;
    this.relDelta[k] = Math.max(-30, Math.min(30, (this.relDelta[k] || 0) + d));
  }

  chatty(key) { const p = this.personas[key]; return p ? p.chatty : 0.5; }

  // ---------------------------------------------------------------- world
  /** the game (or the lab) tells chat what is going on: { day, part, weather, weatherKo, news, deeds } */
  setWorld(w = {}) {
    if (Number.isFinite(w.day)) this.day = w.day | 0;
    if (Number.isFinite(w.part)) { this.part = w.part & 3; this.world.partKo = PARTS[this.part]; }
    if (w.partKo) this.world.partKo = w.partKo;
    if (w.weather) this.world.weather = w.weather;
    if (w.weatherKo) this.world.weatherKo = w.weatherKo;
    if (Array.isArray(w.news)) this.world.news = w.news.slice(0, 4).map(String);
    if (Array.isArray(w.deeds)) this.world.deeds = w.deeds.slice(-4).map(String);
  }

  /** something the chief did that residents may bring up ('빵집을 새로 지었다') */
  addDeed(text) { this.world.deeds.push(String(text).slice(0, 60)); if (this.world.deeds.length > 4) this.world.deeds.shift(); }

  /** time moves on (lab: one step per tap). Returns { newDay, spread } */
  advance() {
    this.part++;
    if (this.part > 3) return Object.assign({ newDay: true }, this.newDay());
    this.world.partKo = PARTS[this.part];
    return { newDay: false, spread: this.spreadTick(2) };
  }

  newDay() {
    this.day++;
    this.part = 0;
    this.world.partKo = PARTS[0];
    const w = WEATHERS[Math.floor(this.rng() * WEATHERS.length)];
    this.world.weather = w.id; this.world.weatherKo = w.ko;
    const news = [NEWS[(this.day * 7 + 3) % NEWS.length]];
    // the hottest learned rumour makes the morning paper: only happy news about the chief that at
    // least two residents already know
    const hot = this.corpus.e.filter((x) => x.k === 'g' && x.src === 'a' && x.d >= this.day - 2 && x.sb && x.sb.includes('chief') && (x.kn ? x.kn.length : 0) >= 2 && gossipOk(x.t, { origin: x.o }))
      .sort((a, b) => (b.kn ? b.kn.length : 0) - (a.kn ? a.kn.length : 0))[0];
    if (hot) news.unshift('소문: ' + this.corpus.plain(hot, this.personas, this.chiefName) + '…?');
    this.world.news = news;
    for (const k of this.roster) { const m = this.mems[k]; if (m) m.mood = (this.personas[k] && this.personas[k].mood) || 'happy'; }
    return { spread: this.spreadTick(6) };
  }

  spreadTick(max) {
    const ev = this.corpus.spread({ day: this.day, rel: (a) => this.friendsOf(a, 30).map(([b, aff]) => [b, aff]), chatty: (a) => this.chatty(a), rng: this.rng, max, present: this.roster });
    for (const e of ev) { this.bond(e.from, e.to, 1); this.mem(e.to); }
    this.stats.spread += ev.length;
    return ev;
  }

  /**
   * right after a chat: the resident tells one or two close friends the newest rumour they started
   * (the "소문이 퍼졌어요" moment). Returns events [{ id, from, to, hop }].
   */
  spreadFrom(key, ids, max = 2) {
    const ev = [];
    const friends = this.friendsOf(key, 30);
    for (const id of ids || []) {
      const x = this.corpus.byId(id);
      if (!x) continue;
      for (const [b] of friends) {
        if (ev.length >= max) break;
        if (this.corpus.knower(x, b)) continue;
        if (x.sb && x.sb.includes(b)) continue;
        this.corpus.learnEntry(x, b, key, 1, this.day, 0);
        ev.push({ id, from: key, to: b, hop: 1 });
        this.bond(key, b, 1);
        break;
      }
    }
    this.stats.spread += ev.length;
    return ev;
  }

  // ---------------------------------------------------------------- save
  serialize() {
    const keys = this.roster.slice();
    const m = {};
    for (const k in this.mems) m[k] = this.mems[k].serialize();
    const o = { v: SAVE_VERSION, d: this.day, p: this.part, r: this.rng.state(), w: this.world, st: this.stats, m, c: null, rd: this.relDelta };
    o.c = this.corpus.serialize(keys);
    o.k = keys;
    return o;
  }

  toJSON() { return this.serialize(); }

  /** restore from a save (any older version is migrated); bad data gives a fresh village */
  static deserialize(raw, opts = {}) {
    const v = new ChatVillage(opts);
    const o = migrate(typeof raw === 'string' ? safeParse(raw) : raw);
    if (!o) return v;
    v.day = o.d | 0;
    v.part = (o.p | 0) & 3;
    v.rng = makeRng(o.r >>> 0 || v.seed);
    if (o.w && typeof o.w === 'object') v.world = Object.assign(v.world, o.w);
    if (o.st) v.stats = Object.assign(v.stats, o.st);
    if (o.rd && typeof o.rd === 'object') for (const k in o.rd) v.relDelta[k] = Math.max(-30, Math.min(30, o.rd[k] | 0));
    if (o.m) for (const k in o.m) if (v.personas[k]) v.mems[k] = ResidentMemory.deserialize(k, o.m[k]);
    const keys = Array.isArray(o.k) ? o.k : v.roster.slice();
    v.corpus = VillageCorpus.deserialize(o.c, keys);
    return v;
  }

  sizeBytes() { return byteLength(JSON.stringify(this.serialize())); }

  /**
   * for the game's save code: a clean copy of a chat save (any version; bad data -> a fresh one).
   * Save.js should store `chat` with this instead of its generic plain-JSON pass, which cuts long
   * strings and drops the nested arrays (who knows each rumour).
   */
  static sanitizeSave(raw, opts = {}) { return ChatVillage.deserialize(raw, opts).serialize(); }

  /** is a stored save from a newer version of the game? (then do not overwrite it blindly) */
  static isFuture(raw) { const o = typeof raw === 'string' ? safeParse(raw) : raw; return !!(o && typeof o === 'object' && (o.v | 0) > SAVE_VERSION); }
}

function safeParse(s) { try { return JSON.parse(s); } catch (e) { return null; } }
export function byteLength(s) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s).length;
  return unescape(encodeURIComponent(s)).length;
}
