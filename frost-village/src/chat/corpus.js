// VillageCorpus: the village's growing library of NEW dialogue, learned from the chief's own chats.
//
// Every chat can leave "village material" behind:
//   gossip (k 'g') — a hearsay line other residents can pass on ("{@chief:이} 고양이를 좋아한대"),
//                    with who started it (origin), who knows it now (knowers, with the hop count and
//                    who told them) and how much it has been exaggerated on the way;
//   lines  (k 'l') — a line in the origin resident's own voice for later small talk on the topic.
// Text is stored as slot templates ({@key:particle}) so any resident can say it with the right name
// and particle. The store is indexed by topic / speaker / subject / freshness, de-duplicated by a
// normalised key, and capped (old, stale, little-known entries go first).

import { normKey, similarity, josa, levelize, tidy } from './ko.js';
import { renderSlots, slotKeys } from './sanitize.js';
import { refName } from './personas.js';

export const G_CAP = 240;        // gossip entries kept
export const L_CAP = 160;        // learned lines kept
export const L_PER = 10;         // learned lines per resident
export const FRESH_DAYS = 10;    // a story is "news" for this many game days
export const MAX_HOP = 4;

const NUM_UP = { 한: '두', 두: '세', 세: '다섯', 네: '다섯', 다섯: '열', 여섯: '열', 일곱: '열', 여덟: '열', 아홉: '열', 열: '스무', 스무: '서른' };
const COUNTER = '(개|마리|명|번|그릇|자루|켤레|송이|잔|권|장|대|판|접시|바퀴|조각|봉지)';

/** a rumour grows a little as it travels: bigger numbers, '엄청' */
export function exaggerate(text, x) {
  if (!x) return text;
  let s = text, changed = false;
  s = s.replace(new RegExp('(^|\\s)(한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|스무)(\\s?)' + COUNTER, 'g'), (a, pre, n, sp, c) => { changed = true; return pre + (NUM_UP[n] || n) + sp + c; });
  s = s.replace(new RegExp('(\\d+)(\\s?)' + COUNTER, 'g'), (a, n, sp, c) => { changed = true; return String(Number(n) * 2) + sp + c; });
  if ((!changed || x >= 2) && !/엄청|완전|진짜|정말|너무/.test(s)) {
    s = s.replace(/(\s)([가-힣]+(?:대|래))([.!~…]*)$/, (a, sp, w, p) => (/^(그랬대|했대|이래|래)$/.test(w) ? a : sp + '엄청 ' + w + p));
  }
  return s;
}

export class VillageCorpus {
  constructor() {
    this.e = [];          // entries, oldest first
    this.seq = 1;
  }

  get size() { return this.e.length; }
  byId(id) { return this.e.find((x) => x.i === id) || null; }

  /**
   * add material. kind 'g' | 'l'. meta: { o origin, tp topics, md mood, d day, src 'a'|'o', by }
   * returns { entry, dup } or null when rejected.
   */
  add(kind, tpl, meta = {}) {
    const t = tidy(String(tpl || ''));
    if (!t || t.length < 4) return null;
    const key = normKey(t);
    const recent = this.e.slice(-120);
    for (const x of recent) {
      if (x.k !== kind) continue;
      if (normKey(x.t) === key || (similarity(x.t, t) >= 0.86 && (x.o === meta.o || kind === 'g'))) {
        x.d = Math.max(x.d, meta.d | 0);         // heard again: fresh again
        x.r = (x.r || 0) + 1;
        if (meta.tp) for (const tp of meta.tp) if (!x.tp.includes(tp) && x.tp.length < 3) x.tp.push(tp);
        return { entry: x, dup: true };
      }
    }
    const x = { i: this.seq++, k: kind, t, o: meta.o || null, tp: (meta.tp || []).slice(0, 3), md: meta.md || '', d: meta.d | 0, src: meta.src || 'a', u: 0 };
    const subj = slotKeys(t).filter((k) => k !== meta.o);
    if (subj.length) x.sb = subj.slice(0, 3);
    if (kind === 'g') { x.kn = []; if (meta.o) this.learnEntry(x, meta.o, null, 0, meta.d | 0, 0); }
    this.e.push(x);
    this.prune(meta.d | 0);
    return { entry: x, dup: false };
  }

  // ---------------------------------------------------------------- who knows what
  /** knower record of `key` for entry x: [key, hop, from, day, x] or null */
  knower(x, key) { if (!x.kn) return null; for (const k of x.kn) if (k[0] === key) return k; return null; }

  learnEntry(x, key, from, hop, day, ex) {
    if (!x.kn) x.kn = [];
    if (this.knower(x, key)) return false;
    x.kn.push([key, hop, from, day, ex || 0]);
    return true;
  }

  learn(id, key, from, day) {
    const x = this.byId(id);
    if (!x || x.k !== 'g') return false;
    const f = from ? this.knower(x, from) : null;
    return this.learnEntry(x, key, from, f ? Math.min(MAX_HOP, f[1] + 1) : 1, day, f ? f[4] : 0);
  }

  knownBy(key, kind = 'g') { return this.e.filter((x) => x.k === kind && (kind === 'l' ? x.o === key : !!this.knower(x, key))); }

  fresh(x, day) { return Math.max(0, 1 - Math.max(0, day - x.d) / FRESH_DAYS); }

  // ---------------------------------------------------------------- picking material to say
  /**
   * the best rumour `speaker` could tell the chief now (not one they started, not about themselves,
   * not one they said recently). opts: { day, topics, names, said (ids), rng }
   */
  pickGossip(speaker, { day = 0, topics = [], names = [], said = [], rng = Math.random, minFresh = 0 } = {}) {
    let best = null, bs = -1e9;
    for (const x of this.e) {
      if (x.k !== 'g' || x.o === speaker) continue;
      const kn = this.knower(x, speaker);
      if (!kn) continue;
      if (x.sb && x.sb.includes(speaker)) continue;
      if (said.includes(x.i)) continue;
      const fr = this.fresh(x, day);
      if (fr < minFresh) continue;
      let sc = fr * 4 + (x.src === 'a' ? 1.2 : 0) - x.u * 0.4 - kn[1] * 0.2 + rng() * 0.8;
      for (const tp of topics) if (x.tp.includes(tp)) sc += 3;
      for (const n of names) if (x.sb && x.sb.includes(n)) sc += 3;
      if (sc > bs) { bs = sc; best = { entry: x, kn }; }
    }
    return best;
  }

  /** one of the speaker's own learned lines for a topic (or any fresh one) */
  pickLine(speaker, { day = 0, topics = [], said = [], rng = Math.random, needTopic = false } = {}) {
    let best = null, bs = -1e9;
    for (const x of this.e) {
      if (x.k !== 'l' || x.o !== speaker || said.includes(x.i)) continue;
      let sc = this.fresh(x, day) * 2 - x.u * 0.7 + rng() * 0.6;
      let hit = false;
      for (const tp of topics) if (x.tp.includes(tp)) { sc += 4; hit = true; }
      if (needTopic && !hit) continue;
      if (sc > bs) { bs = sc; best = x; }
    }
    return best;
  }

  /**
   * say a rumour as `speaker` (to the chief) at `level`, with attribution ("서아가 그러던데, …").
   * kn = the speaker's knower record. Returns the text.
   */
  sayGossip(x, kn, speaker, personas, level, chiefName = '촌장님', rng = Math.random) {
    const body = renderSlots(exaggerate(x.t, kn ? kn[4] : 0), speaker, personas, level, chiefName);
    const from = kn && kn[2];
    let pre = '';
    if (from && personas[from]) {
      const nm = refName(personas, speaker, from, chiefName);
      const kid = personas[speaker] && (personas[speaker].group === 'kid' || personas[speaker].group === 'toddler');
      const forms = kn[1] >= 2 ? [josa(nm, '한테') + ' 들었는데, ', '소문으로 들었는데, '] : [josa(nm, '이') + ' 그러던데, ', josa(nm, '한테') + ' 들었는데, '];
      pre = (kid ? '있잖아, ' : '') + forms[Math.floor(rng() * forms.length)];
    }
    return levelize(tidy(pre + body), level).replace(/([^.!?~…])$/, '$1!');
  }

  /** a learned line in the origin's voice */
  sayLine(x, speaker, personas, level, chiefName = '촌장님') {
    return renderSlots(x.t, speaker, personas, level, chiefName);
  }

  /** neutral text for the story log (third person, casual) */
  plain(x, personas, chiefName = '촌장님') {
    return renderSlots(x.t, '__narrator__', personas, 'casual', chiefName);
  }

  use(x) { x.u = (x.u || 0) + 1; }

  // ---------------------------------------------------------------- spreading over game time
  /**
   * residents pass fresh rumours to the people they like. rel(a) -> [[b, aff]]; chatty(a) -> 0..1.
   * Returns events [{ id, from, to, hop }] (at most `max`).
   */
  spread({ day, rel, chatty, rng = Math.random, max = 6, only = null, present = null } = {}) {
    const ev = [];
    const cands = this.e.filter((x) => x.k === 'g' && this.fresh(x, day) > 0.15 && (!only || x.i === only));
    cands.sort((a, b) => b.d - a.d || b.i - a.i);
    for (const x of cands) {
      for (const k of x.kn.slice()) {
        if (ev.length >= max) return ev;
        const [a, hop] = k;
        if (hop >= MAX_HOP) continue;
        for (const [b, aff] of rel(a)) {
          if (ev.length >= max) break;
          if (present && !present.includes(b)) continue;
          if (this.knower(x, b) || (x.sb && x.sb.includes(b) && rng() < 0.5)) continue;
          const p = 0.55 * (aff / 100) * (0.4 + chatty(a)) * this.fresh(x, day);
          if (rng() < p) {
            const ex = Math.min(2, k[4] + (hop >= 1 && rng() < 0.3 ? 1 : 0));
            this.learnEntry(x, b, a, hop + 1, day, ex);
            ev.push({ id: x.i, from: a, to: b, hop: hop + 1 });
          }
        }
      }
    }
    return ev;
  }

  // ---------------------------------------------------------------- bounds
  prune(day) {
    const over = (kind, cap) => this.e.filter((x) => x.k === kind).length > cap;
    const score = (x) => this.fresh(x, day) * 4 + (x.kn ? x.kn.length * 0.25 : 0) + (x.src === 'a' ? 1 : 0) + (x.r || 0) * 0.3 - x.u * 0.15;
    for (const [kind, cap] of [['g', G_CAP], ['l', L_CAP]]) {
      while (over(kind, cap)) {
        let wi = -1, ws = 1e9;
        for (let i = 0; i < this.e.length; i++) { const x = this.e[i]; if (x.k !== kind || x.d >= day) continue; const s = score(x); if (s < ws) { ws = s; wi = i; } }
        if (wi < 0) wi = this.e.findIndex((x) => x.k === kind);
        this.e.splice(wi, 1);
      }
    }
    // lines: at most L_PER per resident
    const per = {};
    for (let i = this.e.length - 1; i >= 0; i--) {
      const x = this.e[i];
      if (x.k !== 'l') continue;
      per[x.o] = (per[x.o] || 0) + 1;
      if (per[x.o] > L_PER) this.e.splice(i, 1);
    }
  }

  stats(day = 0) {
    const g = this.e.filter((x) => x.k === 'g'), l = this.e.filter((x) => x.k === 'l');
    return { gossip: g.length, lines: l.length, fresh: g.filter((x) => this.fresh(x, day) > 0).length, ai: this.e.filter((x) => x.src === 'a').length, reach: g.reduce((a, x) => a + (x.kn ? x.kn.length : 0), 0) };
  }

  // ---------------------------------------------------------------- save (resident keys -> indexes)
  serialize(keys) {
    const ix = (k) => { if (k == null) return -1; let i = keys.indexOf(k); if (i < 0) { keys.push(k); i = keys.length - 1; } return i; };
    return {
      s: this.seq,
      e: this.e.map((x) => {
        const o = { i: x.i, k: x.k, t: x.t, o: ix(x.o), d: x.d };
        if (x.tp.length) o.tp = x.tp;
        if (x.md) o.md = x.md;
        if (x.src !== 'a') o.src = x.src;
        if (x.u) o.u = x.u;
        if (x.r) o.r = x.r;
        if (x.sb) o.sb = x.sb.map(ix);
        if (x.kn) o.kn = x.kn.map(([k, h, f, d, e]) => [ix(k), h, ix(f), d, e]);
        return o;
      }),
    };
  }

  static deserialize(o, keys) {
    const c = new VillageCorpus();
    if (!o || !Array.isArray(o.e)) return c;
    const key = (i) => (i >= 0 && i < keys.length ? keys[i] : null);
    for (const r of o.e) {
      if (!r || typeof r.t !== 'string' || (r.k !== 'g' && r.k !== 'l')) continue;
      const x = { i: r.i | 0, k: r.k, t: r.t, o: key(r.o), tp: Array.isArray(r.tp) ? r.tp.slice(0, 3) : [], md: r.md || '', d: r.d | 0, src: r.src || 'a', u: r.u | 0 };
      if (r.r) x.r = r.r | 0;
      if (Array.isArray(r.sb)) x.sb = r.sb.map(key).filter(Boolean);
      if (r.k === 'g') x.kn = Array.isArray(r.kn) ? r.kn.map(([k, h, f, d, e]) => [key(k), h | 0, key(f), d | 0, e | 0]).filter((k) => k[0]) : [];
      c.e.push(x);
    }
    c.seq = Math.max(o.s | 0, ...c.e.map((x) => x.i + 1), 1);
    return c;
  }
}
