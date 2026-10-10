// The chief's missions (pure, seeded, no Phaser): the board (3 cards, active at once), request bubbles over
// residents (≤ 4 in the world, ≤ 2 on screen, ≤ 3 accepted), event missions from the story / districts, the bag of
// mission items (bouquets, cakes, gift boxes, letters), daily / weekly / streaks (Calendar), fame and titles (Fame),
// rewards (coins = minutes of current income, never below the floor), the focus rule and park / resume.
//
// The game is reached only through `env` (docs/build_reports/missions_bank.md "env"):
//   T() game seconds · hour() · day() · rank() · has(fact) · count(key) · income() coins/min · wall() ms · uptime() ms
//   localDate() { y, m, d, h } · people: { pick(role, ctx) → pid | null, has(pid), onScreen(pid) }
// Output: events queued in `this.out` (drain()), applied by the host (coins, toasts, views, sounds).

import { CATALOG, tpl as tplOf } from '../data/catalog.js';
import { requirements, BAG_ITEMS } from '../data/caps.js';
import { Rng, hashStr } from '../lib/rng.js';
import { Fame } from './fame.js';
import { Calendar } from './calendar.js';
import { signalsOf } from './signals.js';
import { unitsOf, zeroes, fraction, isDone, inHours, isNight } from './units.js';
import { sanitizeMissions } from '../save.js';

const REQ = new Map(CATALOG.map((t) => [t.code, Array.from(requirements(t))]));
const POOL = { board: [], bubble: [], daily: [], weekly: [] };
for (const t of CATALOG) {
  if (t.src === 'board') POOL.board.push(t);
  else if (t.src === 'bubble' && !t.trigger) POOL.bubble.push(t);
  else if (t.src === 'daily') POOL.daily.push(t);
  else if (t.src === 'weekly') POOL.weekly.push(t);
}
const HOUR = 25;                 // game seconds per clock hour (600 s day)
const DAY = 600;
const round10 = (x) => Math.round(x / 10) * 10;

/**
 * story_runtime events name people by engine id (a, b, who, baby: integers) and add the game's ids next to them
 * (aPid, bPid, whoPid, babyPid). Missions only ever use game ids: `who` = the person, `family` = the other parent /
 * the family member to visit. A person the game cannot show (no pid) gives no mission (the template's giver is null).
 */
function storyIds(ev) {
  const pid = (v, p) => (typeof p === 'string' && p ? p : typeof v === 'string' && v ? v : null);
  const a = pid(ev.a, ev.aPid), b = pid(ev.b, ev.bPid), who = pid(ev.who, ev.whoPid) || a;
  const key = ev.key || ev.id || (Number.isInteger(ev.a) ? 'c' + ev.a + '_' + (ev.b | 0) : Number.isInteger(ev.who) ? 's' + ev.who : who);
  return Object.assign({}, ev, { who, family: ev.family || b || a || who, key });
}

export class MissionModel {
  /**
   * @param cfg   missions tuning (tuning.js / BALANCE.v5.missions)
   * @param env   the game facade (see the header)
   * @param saved the `missions` save slice (sanitized here again; null = a fresh start)
   * @param opts  { seed } for a fresh start
   */
  constructor(cfg, env, saved, opts = {}) {
    this.cfg = cfg;
    this.env = env;
    const s = sanitizeMissions(saved) || {};
    this.seed = Number.isFinite(s.sd) ? s.sd >>> 0 : (Number.isFinite(opts.seed) ? opts.seed >>> 0 : hashStr('missions:' + Math.floor(env.T())));
    this.rng = new Rng(Number.isFinite(s.rs) ? s.rs : this.seed);
    this.nextId = s.n || 1;
    this.list = [];
    for (const k of ['b', 'a', 'p', 'o']) for (const o of s[k] || []) { const i = this.load(o, k); if (i) this.list.push(i); }
    this.cool = Object.assign({}, s.c || {});
    this.bag = Object.assign({ item_bouquet: 0, item_cake: 0, item_gift_box: 0, item_letter: 0 }, s.bag || {});
    this.fame = new Fame(cfg.fame, s.fm);
    this.cal = new Calendar(cfg, s, this.seed);
    this.cb = s.cb ? { a: (s.cb.a || []).slice(-5), on: !!s.cb.on, last: s.cb.last || 0 } : { a: [], on: false, last: 0 };
    this.ds = s.ds | 0;
    const T = env.T();
    this.t5 = Number.isFinite(s.t5) ? s.t5 : T;       // when missions began (C7a: 읍 + 40 min)
    this.bt = Number.isFinite(s.bt) ? s.bt : T;       // next board fill
    this.rq = Number.isFinite(s.rq) ? s.rq : T + 20;  // next request bubble (the first one soon)
    this.fl = Object.assign({}, s.fl || {});          // one-shot flags: paper, age80, bday (game day of the last birthday)
    this.sett = s.st2 ? { d: s.st2.d | 0, n: s.st2.n | 0 } : { d: -1, n: 0 };
    this.out = [];
    this.lastSec = null;
  }

  // ------------------------------------------------------------------------------------------------ helpers
  get T() { return this.env.T(); }
  emit(e) { this.out.push(e); if (this.out.length > 400) this.out.splice(0, this.out.length - 400); }
  /** events since the last call (the host applies them) */
  drain() { const o = this.out; this.out = []; return o; }

  era() { return Math.max(1, (this.env.rank() | 0) - 1); }
  /** coins for `p` minutes of current income (never below the floor; 0 when p is 0) */
  pay(p) {
    if (!(p > 0)) return 0;
    const I = Math.max(0, Number(this.env.income()) || 0);
    return Math.max(this.cfg.payFloor * this.era(), round10(p * I));
  }

  /** a fact (fame:N is the model's own) */
  has(cap) {
    if (cap.startsWith('fame:')) return this.fame.pts >= Number(cap.slice(5));
    const m = /^(shops|towers):(\d+)$/.exec(cap);
    if (m) return (Number(this.env.count(m[1])) || 0) >= Number(m[2]);
    return !!this.env.has(cap);
  }
  reqOk(t) { for (const c of REQ.get(t.code) || []) if (!this.has(c)) return false; return true; }
  present(code) { for (const i of this.list) if (i.c === code) return true; return false; }
  onCooldown(code) { const c = this.cool[code]; return c === -1 || (Number.isFinite(c) && c > this.T); }
  setCooldown(t) {
    const r = t.repeat;
    if (r === 'once') this.cool[t.code] = -1;
    else if (r === 'day') this.cool[t.code] = Math.round(this.T + DAY);
    else if (typeof r === 'number') this.cool[t.code] = Math.round(this.T + r * 60);
  }

  /** could template t be offered now (board / bubble / calendar)? */
  eligible(t) {
    if (!t || this.onCooldown(t.code) || this.present(t.code)) return false;
    if (t.offerHours && !inHours(this.env.hour(), t.offerHours)) return false;
    if (unitsOf(t).some((u) => u.win === 'day') && this.env.hour() >= this.cfg.goalLastHour) return false;
    return this.reqOk(t);
  }

  // ------------------------------------------------------------------------------------------------ instances
  /** a saved instance → a live one (null when its template is gone) */
  load(o, st) {
    const t = tplOf(o.c);
    if (!t) return null;
    const g = zeroes(t);
    if (Array.isArray(o.g)) for (let k = 0; k < g.length && k < o.g.length; k++) g[k] = Math.max(0, Math.min(unitsOf(t)[k].need, Number(o.g[k]) | 0));
    return { id: o.i, c: o.c, s: st, g, t0: o.t0 || 0, tp: Number.isFinite(o.tp) ? o.tp : (o.t0 || 0), d: o.d || 0, gv: o.gv || null, w: o.w || null, nm: o.nm || null, k: o.k || null, x: o.x || null, stg: o.sg | 0 };
  }

  /** a new instance of template t (null when its people cannot be found) */
  make(t, st, ev) {
    const env = this.env, ppl = env.people;
    // an escort (school day, three wishes) needs the very person to walk with
    if ((t.obj || []).some((o) => o.how === 'escort') && !(ev && typeof ev.who === 'string' && ev.who)) return null;
    let gv = null;
    if (t.giver) {
      if (t.giver === 'ev:who') gv = ev && ev.who ? ev.who : null;
      else if (t.giver === 'ev:family') gv = ev ? (ev.family || ev.who || null) : null;
      else {
        const exclude = new Set(this.list.map((i) => i.gv).filter(Boolean));
        const onScr = this.list.filter((i) => i.s === 'o' && i.gv && ppl.onScreen && ppl.onScreen(i.gv)).length;
        gv = ppl.pick(t.giver, { exclude, offScreen: st === 'o' && onScr >= this.cfg.bubblesOnScreen, rng: this.rng });
      }
      if (!gv) return null;
    }
    // the recipient (or place) of the first objective that names one
    let w = null;
    for (const o of t.obj || []) {
      const to = o.to || o.at;
      if (!to) continue;
      if (to === 'giver') w = gv;
      else if (to.startsWith('p:')) w = to;
      else if (to === 'ev:family') w = ev ? (ev.family || ev.who || null) : null;
      else if (to === 'friend' || to === 'crush') w = ppl.pick(to, { of: gv, rng: this.rng, exclude: new Set([gv]) });
      else if (to.startsWith('v:') || to.startsWith('pet:')) w = ppl.has(to) ? to : null;
      else w = ppl.pick(to, { rng: this.rng });
      if (!w) return null;
      break;
    }
    const T = this.T;
    const inst = { id: this.nextId++, c: t.code, s: st, g: zeroes(t), t0: Math.round(T), tp: Math.round(T), d: this.dueOf(t, ev), gv, w, nm: ev && ev.who ? ev.who : null, k: ev && ev.key ? String(ev.key).slice(0, 24) : null, x: ev && ev.x ? ev.x : null, stg: 0 };
    return inst;
  }

  /** deadline (game T) of a template's instance created now (0 = none) */
  dueOf(t, ev) {
    const D = t.due;
    if (!D) return 0;
    const T = this.T, h = this.env.hour();
    const at = (hour, dayOff) => Math.round(T + ((dayOff * 24 + hour - h) * HOUR));
    if (D.after) return Math.round(T + D.after);
    if (D.at === 'event') {
      if (ev && Number.isFinite(ev.at)) return Math.round(ev.at);
      if (ev && Number.isFinite(ev.due)) return Math.round(ev.due);
      if (D.hour !== undefined) return at(D.hour, h < D.hour ? 0 : 1);
      return Math.round(T + 300);
    }
    if (D.at === 'next') return at(D.hour, 1);
    if (D.hour !== undefined) return at(D.hour, h < D.hour ? 0 : 1);
    return 0;
  }

  add(inst) {
    this.list.push(inst);
    this.emit({ t: 'mission:offer', id: inst.id, code: inst.c, s: inst.s, gv: inst.gv, w: inst.w });
    return inst;
  }

  get(id) { for (const i of this.list) if (i.id === id) return i; return null; }
  remove(inst) { const k = this.list.indexOf(inst); if (k >= 0) this.list.splice(k, 1); }

  // ------------------------------------------------------------------------------------------------ the clock
  /** every frame (cheap): the 1 Hz work runs once per whole second of game time (T-based, so a reload resumes it
   *  on exactly the same schedule) */
  tick() {
    const s = Math.floor(this.T);
    if (s === this.lastSec) return;
    this.lastSec = s;
    this.second(s);
  }

  second(sec) {
    const T = this.T, cfg = this.cfg;
    // the calendar (daily / weekly)
    for (const e of this.cal.check(this.env, POOL, (t) => this.reqOk(t))) this.emit(e);
    // deadlines and untouched bubbles
    for (let k = this.list.length - 1; k >= 0; k--) {
      const i = this.list[k];
      if (i.d && T > i.d) this.expire(i, 'late');
      else if (i.s === 'o' && T - i.t0 > cfg.bubbleLife) this.expire(i, 'pop');
      // an event without a deadline that nothing moved for days (its owner module never reported the step): ends gently
      else if (!i.d && i.s === 'a' && cfg.eventStale > 0 && T - i.tp > cfg.eventStale && tplOf(i.c).src === 'event') this.expire(i, 'late');
    }
    // the board: one new card a second while a slot is free and the refresh delay has passed
    if (this.count('b') < cfg.board && T >= this.bt) this.fillBoard();
    // requests
    if (T >= this.rq) {
      this.spawnRequest();
      this.rq = Math.round(T + this.rng.between(cfg.requestEvery[0], cfg.requestEvery[1]));
    }
    // C7a (an elder turned 80, or 읍 + 40 min) and C5 (≥ 6 settlers today)
    if ((this.fl.age80 || T - this.t5 >= 2400) && !this.onCooldown('C7a')) this.spawnEvent('C7a', { key: 'garden' });
    if (this.sett.n >= 6 && this.sett.d === this.env.day()) this.spawnEvent('C5', { key: 'party' + this.sett.d });
    // still possible? (the recipient moved away, a toggle was switched off …)
    if (sec % cfg.revalidate === 0) this.revalidate();
  }

  count(st) { let n = 0; for (const i of this.list) if (i.s === st) n++; return n; }
  acceptedRequests() { let n = 0; for (const i of this.list) if (i.s === 'a' && tplOf(i.c).src === 'bubble') n++; return n; }

  fillBoard() {
    const T = this.T, cfg = this.cfg;
    // a parked card waiting long enough comes back half of the time (or when nothing new fits)
    const parked = this.list.filter((i) => i.s === 'p' && T - i.tp >= cfg.swapAfter && this.reqOk(tplOf(i.c))).sort((a, b) => a.tp - b.tp);
    const fresh = POOL.board.filter((t) => this.eligible(t));
    if (parked.length && (!fresh.length || this.rng.chance(0.5))) {
      const i = parked[0];
      i.s = 'b'; i.tp = Math.round(T);
      this.emit({ t: 'mission:resume', id: i.id, code: i.c });
      return i;
    }
    if (!fresh.length) { this.bt = Math.round(T + 5); return null; }
    for (let tries = 0; tries < 4 && fresh.length; tries++) {
      const k = this.rng.weighted(fresh.map((t) => t.weight || 1));
      const t = fresh.splice(k, 1)[0];
      const inst = this.make(t, 'b', null);
      if (inst) return this.add(inst);
    }
    this.bt = Math.round(T + 5);
    return null;
  }

  spawnRequest() {
    const cfg = this.cfg;
    if (this.count('o') >= cfg.bubblesWorld) return null;
    const pool = POOL.bubble.filter((t) => this.eligible(t));
    for (let tries = 0; tries < 6 && pool.length; tries++) {
      const k = this.rng.weighted(pool.map((t) => t.weight || 1));
      const t = pool.splice(k, 1)[0];
      const inst = this.make(t, 'o', null);
      if (inst) return this.add(inst);
    }
    return null;
  }

  /** an event mission (story beat, district event, other modules' api.offer) */
  spawnEvent(code, ev = {}) {
    const t = tplOf(code);
    if (!t) return null;
    if (t.repeat === 'once' && this.cool[code] === -1) return null;
    if (t.repeat !== 'event' && t.repeat !== 'once' && this.onCooldown(code)) return null;
    if (ev.key && this.list.some((i) => i.c === code && i.k === String(ev.key).slice(0, 24))) return null;
    if (t.repeat !== 'event' && this.present(code)) return null;
    if (!this.reqOk(t)) return null;
    if (t.offerHours && !inHours(this.env.hour(), t.offerHours)) return null;
    const inst = this.make(t, t.src === 'bubble' ? 'o' : 'a', ev);
    if (!inst) return null;
    if (t.repeat === 'once') this.cool[code] = -1;                       // (offered once, ever)
    if (t.repeat === 'day') this.cool[code] = Math.round(this.T + DAY);
    return this.add(inst);
  }

  revalidate() {
    const ppl = this.env.people;
    for (let k = this.list.length - 1; k >= 0; k--) {
      const i = this.list[k], t = tplOf(i.c);
      const gone = (i.gv && !ppl.has(i.gv)) || (i.w && !i.w.startsWith('p:') && !ppl.has(i.w));
      if (gone || !this.reqOk(t)) this.expire(i, gone ? 'gone' : 'cannot');
    }
  }

  // ------------------------------------------------------------------------------------------------ the feed
  onFeed(ev) {
    if (!ev || typeof ev.t !== 'string') return;
    for (const [sig, n] of signalsOf(ev)) this.signal(sig, n);
    if (ev.t.startsWith('story:')) ev = storyIds(ev);
    const op = ev.op;
    switch (ev.t) {
      case 'story:life':
        if (op === 'engaged') { this.spawnEvent('C1', { ...ev, key: ev.key || ev.id || ev.who }); this.spawnEvent('B6', { ...ev, key: ev.key || ev.id || ev.who }); }
        else if (op === 'wedding') { this.spawnEvent('C2', { ...ev, key: ev.key || ev.id || ev.who }); if (ev.ours !== false) this.fameAdd(this.cfg.fame.lifeBeat, 'wedding'); }
        else if (op === 'baby') { this.spawnEvent('C3', { ...ev, key: ev.key || ev.id || ev.who }); if (ev.ours !== false) this.fameAdd(this.cfg.fame.lifeBeat, 'baby'); }
        else if (op === 'school') this.spawnEvent('C4', { ...ev, key: ev.key || ev.who });
        else if (op === 'wish') this.spawnEvent('C7', { ...ev, key: ev.key || ev.who });
        else if (op === 'farewell') this.spawnEvent('C8', { ...ev, key: ev.key || ev.who });
        else if (op === 'birthday') {
          const d = this.env.day();
          if (this.fl.bday !== d) { this.fl.bday = d; this.spawnEvent('C9', { ...ev, key: 'b' + (ev.who || '') + d }); this.spawnEvent('A12', { ...ev, key: 'm' + (ev.who || '') + d }); }
        } else if (op === 'age80') this.fl.age80 = 1;
        break;
      case 'story:move':
        if (op === 'in') { this.spawnEvent('A8', { ...ev, key: ev.key || ev.home || ev.who }); this.spawnEvent('A21', { ...ev, key: ev.key || ev.home || ev.who }); this.spawnEvent('B12', { ...ev, key: ev.key || ev.home || ev.who }); }
        break;
      case 'houseDone': this.spawnEvent('A8', { ...ev, key: ev.key || ev.house || ev.id }); this.fameAdd(this.cfg.fame.newThing, 'house'); break;
      case 'shopOpen': this.fameAdd(this.cfg.fame.newThing, 'shop'); break;
      case 'harbor:star': case 'beach:star': this.fameAdd(this.cfg.fame.newThing, 'star'); break;
      case 'story:happening': if (ev.watched) this.fameAdd(this.cfg.fame.happening, 'happen'); break;
      case 'settlers': {
        const d = this.env.day();
        if (this.sett.d !== d) this.sett = { d, n: 0 };
        this.sett.n += Math.max(0, Math.min(50, ev.n | 0 || 1));
        break;
      }
      case 'story:news': if (!this.fl.paper) { this.fl.paper = 1; this.spawnEvent('C15', { key: 'paper' }); } break;
      case 'harbor:ship':
        if (ev.kind === 'cargo' && op === 'arrive') { this.spawnEvent('B7', { ...ev, key: ev.id, due: ev.leaves }); this.spawnEvent('D10', { ...ev, key: ev.id, due: ev.leaves }); }
        else if (ev.kind === 'trawler' && op === 'home') this.spawnEvent('B8', { ...ev, key: ev.id });
        else if (ev.kind === 'ferry' && op === 'arrive') this.spawnEvent('B10', { ...ev, key: ev.id });
        break;
      case 'harbor:rare': this.spawnEvent('E10', { ...ev, key: ev.id || ('f' + this.T) }); break;
      case 'inc:wanted': if (op === 'post') this.spawnEvent('E12', { ...ev, key: ev.id }); break;
      case 'inc:move': if (op === 'in') { this.spawnEvent('A21', { ...ev, key: ev.id || ev.home }); this.spawnEvent('B12', { ...ev, key: ev.id || ev.home }); } break;
      case 'built': this.built(ev.key); break;
      case 'day': this.newDay(); break;
      case 'veh:driveDone': if (ev.mid) this.step(ev.mid, 'drive', 1, { stars: ev.stars }); break;
      case 'mstep': if (ev.mid) this.step(ev.mid, ev.how, ev.n || 1, ev); break;
      default: break;
    }
  }

  /** a counter moved: board cards and active missions, today's dailies and the week, passive fame */
  signal(sig, n) {
    if (!(n > 0)) return;
    const T = this.T, h = this.env.hour();
    for (let k = 0; k < this.list.length; k++) {
      const i = this.list[k];
      if (i.s !== 'b' && i.s !== 'a') continue;
      const t = tplOf(i.c), U = unitsOf(t);
      let hit = false;
      for (let j = 0; j < U.length; j++) {
        const u = U[j];
        if (u.sig !== sig || i.g[j] >= u.need || !inHours(h, u.hours)) continue;
        i.g[j] = Math.min(u.need, i.g[j] + n);
        hit = true;
      }
      if (hit) { i.tp = Math.round(T); this.progressed(i); if (k >= this.list.length || this.list[k] !== i) k--; }
    }
    for (const e of this.cal.signal(sig, n, tplOf, (p) => this.pay(p))) this.applyCal(e);
    if (sig === 'riders') for (const e of this.fame.addRiders(n, T)) this.emit(e);
  }

  /** calendar events: pay through the host, add fame here */
  applyCal(e) {
    this.emit(e);
    if (e.fame) this.fameAdd(e.fame, e.why || e.t);
    if (e.t === 'reward' && e.kind === 'flair' && e.key === 'crown') this.fame.crownUntil = (Number(this.env.wall()) || 0) + this.cfg.streak.crownHours * 3600 * 1000;
  }

  fameAdd(n, why) { for (const e of this.fame.add(n, why, this.T)) this.emit(e); }

  newDay() {
    // "today" goals start again (D1 cans today, D9 riders today)
    for (const i of this.list) {
      const U = unitsOf(tplOf(i.c));
      U.forEach((u, j) => { if (u.win === 'day') i.g[j] = 0; });
    }
  }

  built(key) {
    if (!key) return;
    for (let k = this.list.length - 1; k >= 0; k--) {
      const i = this.list[k];
      if (i.s !== 'a' && i.s !== 'b') continue;
      const U = unitsOf(tplOf(i.c));
      let hit = false;
      U.forEach((u, j) => { if (u.t === 'build' && u.key === key && i.g[j] < 1) { i.g[j] = 1; hit = true; } });
      if (hit) { i.tp = Math.round(this.T); this.progressed(i); }
    }
  }

  progressed(i) {
    const t = tplOf(i.c);
    this.emit({ t: 'mission:progress', id: i.id, code: i.c, f: Math.round(fraction(t, i.g) * 100) / 100 });
    if (isDone(t, i.g)) this.complete(i, i.stars || 0);
  }

  // ------------------------------------------------------------------------------------------------ the chief's actions
  /** accept a request bubble ('받기'); { ok, why } */
  accept(id) {
    const i = this.get(id);
    if (!i || i.s !== 'o') return { ok: false, why: 'gone' };
    if (this.acceptedRequests() >= this.cfg.acceptedMax) return { ok: false, why: 'full' };
    i.s = 'a'; i.tp = Math.round(this.T);
    const t = tplOf(i.c);
    if (t.gives) for (const k in t.gives) this.bag[k] = Math.min(this.cfg.craft.bagMax, (this.bag[k] || 0) + t.gives[k]);
    this.emit({ t: 'mission:accept', id, code: i.c, gv: i.gv, w: i.w });
    return { ok: true };
  }

  /** '다른 미션': park a board card that has not moved for swapAfter s (its progress is kept) */
  canSwap(id) { const i = this.get(id); return !!(i && i.s === 'b' && this.T - i.tp >= this.cfg.swapAfter); }
  swap(id) {
    const i = this.get(id);
    if (!this.canSwap(id)) return false;
    i.s = 'p'; i.tp = Math.round(this.T);
    this.emit({ t: 'mission:park', id, code: i.c });
    const parked = this.list.filter((x) => x.s === 'p').sort((a, b) => a.tp - b.tp);
    while (parked.length > this.cfg.maxParked) { const old = parked.shift(); this.remove(old); this.setCooldown(tplOf(old.c)); }
    this.bt = Math.round(this.T);
    // the fresh card comes at once, and never the one just parked
    const before = this.cool[i.c];
    this.cool[i.c] = Math.round(this.T + this.cfg.swapAfter);
    this.fillBoard();
    if (before === undefined) delete this.cool[i.c]; else this.cool[i.c] = before;
    return true;
  }

  /** what an instance still wants delivered: { item: n } (only units whose hours are now) */
  wants(id) {
    const i = this.get(id);
    if (!i || (i.s !== 'a' && i.s !== 'b')) return {};
    const out = {}, h = this.env.hour();
    unitsOf(tplOf(i.c)).forEach((u, j) => {
      if (u.t !== 'deliver' || i.g[j] >= u.need || !inHours(h, u.hours)) return;
      for (const k of u.item ? [u.item] : u.any) out[k] = (out[k] || 0) + (u.need - i.g[j]);
    });
    return out;
  }

  /**
   * the chief handed `n` of `item` to the mission's recipient: returns how many it took. Mission items (bouquet,
   * cake, gift box, letter) come out of the bag here; v4 items were already taken from the chief by the host.
   */
  delivered(id, item, n) {
    const i = this.get(id);
    if (!i || (i.s !== 'a' && i.s !== 'b') || !(n > 0)) return 0;
    const h = this.env.hour(), U = unitsOf(tplOf(i.c));
    const bagItem = item in BAG_ITEMS;
    let left = Math.floor(n), took = 0;
    if (bagItem) left = Math.min(left, this.bag[item] || 0);
    for (let j = 0; j < U.length && left > 0; j++) {
      const u = U[j];
      if (u.t !== 'deliver' || !inHours(h, u.hours)) continue;
      if (u.item !== item && !(u.any && u.any.indexOf(item) >= 0)) continue;
      const k = Math.min(left, u.need - i.g[j]);
      if (k <= 0) continue;
      i.g[j] += k; left -= k; took += k;
    }
    if (!took) return 0;
    if (bagItem) this.bag[item] -= took;
    i.tp = Math.round(this.T);
    this.emit({ t: 'mission:delivered', id, item, n: took });
    this.progressed(i);
    return took;
  }

  /** a step happened (stand / find / return / lead / drive / choose / escort / speech / pay / tap / ask …) */
  step(id, how, n = 1, info = {}) {
    const i = this.get(id);
    if (!i || (i.s !== 'a' && i.s !== 'b')) return 0;
    const t = tplOf(i.c), U = unitsOf(t), h = this.env.hour();
    for (let j = 0; j < U.length; j++) {
      const u = U[j];
      if (u.t !== 'step') continue;
      if (i.g[j] >= u.need) continue;
      if (u.how !== how) return 0;                 // steps run in order: an earlier step is still open
      if (u.night && !isNight(h)) return 0;
      if (!inHours(h, u.hours)) return 0;
      const k = Math.min(u.need - i.g[j], Math.max(1, Math.floor(n)));
      i.g[j] += k;
      if (how === 'drive') i.stars = Math.max(1, Math.min(3, Number(info.stars) | 0 || 1));
      i.tp = Math.round(this.T);
      if (t.stages) {
        // C7: every wish pays its share at once
        const per = U[j].need;
        i.stg = (i.stg | 0) + k;
        const coins = this.pay((t.pay || 0) / per) * k, fame = Math.round((t.fame || 0) / per) * k;
        this.emit({ t: 'mission:stage', id, code: i.c, stage: i.stg, coins, fame, gv: i.gv, w: i.w, nm: i.nm });
        if (fame) this.fameAdd(fame, i.c);
      }
      this.progressed(i);
      return k;
    }
    return 0;
  }

  /** a mission item was made (꽃밭 picking, the bakery's cake, gift wrap): into the bag */
  craft(item, n = 1) {
    if (!(item in BAG_ITEMS)) return 0;
    const before = this.bag[item] || 0;
    this.bag[item] = Math.min(this.cfg.craft.bagMax, before + Math.max(1, n | 0));
    const k = this.bag[item] - before;
    if (k) this.emit({ t: 'bag', item, n: this.bag[item], add: k });
    if (item === 'item_bouquet' && k) this.signal('flower', k);
    return k;
  }

  /** an event mission the chief does not want right now ('나중에' on a bubble just keeps it) */
  later(id) { const i = this.get(id); if (i) this.emit({ t: 'mission:later', id }); }

  // ------------------------------------------------------------------------------------------------ endings
  complete(i, stars) {
    const t = tplOf(i.c);
    this.remove(i);
    this.setCooldown(t);
    const st = Math.max(0, Math.min(3, stars | 0));
    let coins = 0, fame = 0;
    if (t.stages) fame = 0;                                                // (paid per stage)
    else {
      const mult = t.kind === 'drive' ? this.cfg.drive.payByStars[Math.max(0, (st || 1) - 1)] : 1;
      coins = t.pay > 0 ? Math.max(this.cfg.payFloor * this.era(), round10(t.pay * mult * Math.max(0, Number(this.env.income()) || 0))) : 0;
      fame = Array.isArray(t.fame) ? t.fame[Math.max(0, (st || 1) - 1)] : (t.fame | 0);
      if (t.kind === 'drive' && st === 3) fame += this.cfg.drive.bonusFame3;
    }
    this.emit({ t: 'mission:done', id: i.id, code: i.c, kind: t.kind, coins, fame, stars: st, gv: i.gv, w: i.w, nm: i.nm });
    if (t.flag) this.emit({ t: 'mission:flag', flag: t.flag });
    if (fame) this.fameAdd(fame, i.c);
    // side effects: the week, the combo, the drive streak, celebrations
    if (t.kind === 'request') { this.signal('req_done', 1); this.combo(); }
    if (i.c === 'C2' || i.c === 'C3' || i.c === 'C9') this.signal('celebrate', 1);
    if (t.kind === 'drive') this.driveStreak(st);
    if (i.s === 'b') this.bt = Math.round(this.T + this.cfg.refresh);
    else if (this.count('b') < this.cfg.board) this.bt = Math.min(this.bt, Math.round(this.T + this.cfg.refresh));
  }

  expire(i, why) {
    const t = tplOf(i.c);
    this.remove(i);
    if (t.gives && i.s === 'a') for (const k in t.gives) this.bag[k] = Math.max(0, (this.bag[k] || 0) - t.gives[k]);
    if (t.repeat !== 'once' && t.repeat !== 'event') this.setCooldown(t);
    this.emit({ t: 'mission:expire', id: i.id, code: i.c, why, gv: i.gv });
    if (i.s === 'b') this.bt = Math.round(this.T + this.cfg.refresh);
  }

  combo() {
    const T = this.T, c = this.cb, S = this.cfg.streak;
    if (c.on && T - c.last <= S.comboWindow) { c.last = T; this.emit({ t: 'combo', on: true }); this.fameAdd(S.comboFame, 'combo'); return; }
    c.on = false;
    c.a.push(Math.round(T));
    if (c.a.length > S.comboRequests) c.a.shift();
    if (c.a.length === S.comboRequests && T - c.a[0] <= S.comboWindow) { c.on = true; c.last = T; c.a = []; this.emit({ t: 'combo', start: true }); }
  }

  driveStreak(st) {
    const S = this.cfg.streak;
    if (st !== 3) { this.ds = 0; return; }
    this.ds++;
    if (this.ds >= S.driveStars) {
      this.ds = 0;
      this.fame.driverUntil = this.T + S.driverFlair;
      this.emit({ t: 'reward', kind: 'flair', key: 'driver', why: 'drive' });
      this.fameAdd(S.driveFame, 'driver');
    }
  }

  // ------------------------------------------------------------------------------------------------ reading
  instances(st) { return this.list.filter((i) => i.s === st); }
  board() { return this.instances('b'); }
  active() { return this.instances('a'); }
  parked() { return this.instances('p'); }
  bubbles() { return this.instances('o'); }
  template(i) { return tplOf(i.c); }
  fraction(i) { return fraction(tplOf(i.c), i.g); }

  /** the focus rule: an event due within 3 game hours → an accepted request → the board card with most progress */
  focus() {
    const T = this.T, F = this.cfg.focusDeadline;
    let best = null;
    for (const i of this.list) if (i.s === 'a' && i.d && i.d - T <= F && tplOf(i.c).src !== 'bubble' && (!best || i.d < best.d)) best = i;
    if (best) return best;
    for (const i of this.list) if (i.s === 'a' && tplOf(i.c).src === 'bubble' && (!best || i.t0 < best.t0)) best = i;
    if (best) return best;
    let bf = -1;
    for (const i of this.list) {
      if (i.s !== 'b') continue;
      const f = this.fraction(i);
      if (f > bf || (f === bf && i.t0 < best.t0)) { bf = f; best = i; }
    }
    if (best) return best;
    for (const i of this.list) if (i.s === 'a' && (!best || (i.d || 1e12) < (best.d || 1e12))) best = i;
    return best;
  }

  /** daily / weekly / streak state for the 오늘 / 이번 주 tabs */
  today() {
    const dy = this.cal.dy;
    if (!dy) return null;
    return { d: dy.d, list: dy.ids.map((c, k) => ({ code: c, g: dy.g[k] || [], done: !!dy.k[k] })), all: !!dy.a };
  }
  week() { const w = this.cal.wk; return w ? { w: w.w, code: w.c, g: w.g, stage: w.s } : null; }
  streak() { return { n: this.cal.st.n, last: this.cal.st.last, shield: this.cal.shieldFree(this.env), drive: this.ds, combo: this.cb.on }; }
  fameInfo() { return Object.assign(this.fame.info(), { flairs: this.fame.flairs(this.T, Number(this.env.wall()) || 0) }); }

  // ------------------------------------------------------------------------------------------------ save
  serialize() {
    const ser = (i) => {
      const o = { i: i.id, c: i.c, t0: i.t0 };
      if (i.g.some((v) => v)) o.g = i.g.slice();
      if (i.tp !== i.t0) o.tp = i.tp;
      if (i.d) o.d = i.d;
      if (i.gv) o.gv = i.gv;
      if (i.w) o.w = i.w;
      if (i.nm) o.nm = i.nm;
      if (i.k) o.k = i.k;
      if (i.stg) o.sg = i.stg;
      return o;
    };
    const T = this.T;
    const cool = {};
    for (const t of CATALOG) { const v = this.cool[t.code]; if (v === -1 || v > T) cool[t.code] = v; }   // (catalog order: stable)
    const o = { v: 1, sd: this.seed, rs: this.rng.state, n: this.nextId, t5: Math.round(this.t5), bt: Math.round(this.bt), rq: Math.round(this.rq) };
    for (const st of ['b', 'a', 'p', 'o']) { const l = this.instances(st); if (l.length) o[st] = l.map(ser); }
    if (Object.keys(cool).length) o.c = cool;
    const bag = {};
    for (const k in this.bag) if (this.bag[k] > 0) bag[k] = this.bag[k];
    if (Object.keys(bag).length) o.bag = bag;
    Object.assign(o, this.cal.serialize());
    if (this.cb.a.length || this.cb.on) o.cb = { a: this.cb.a.slice(), on: this.cb.on ? 1 : 0, last: Math.round(this.cb.last) };
    if (this.ds) o.ds = this.ds;
    o.fm = this.fame.serialize();
    if (Object.keys(this.fl).length) o.fl = Object.assign({}, this.fl);
    if (this.sett.n) o.st2 = { d: this.sett.d, n: this.sett.n };
    return o;
  }
}

export { POOL, REQ };
