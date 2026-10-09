// What one resident remembers about the chief: conversation episodes (with a source: did / saw /
// was told by X), facts the chief revealed, open favours, the affinity (호감) with the chief, mood,
// and a short chat log for the bubbles. Bounded: old low-importance episodes are merged into one
// short summary per topic, so the memory never grows past a fixed size.
//
// Affinity cannot be farmed: each game day a resident can gain at most DAY_GAIN from chatting, the
// same kind of remark gives less each time it is repeated that day, and a gift counts once a day.
//
// Private episodes (pv: the chief was sad, hurt, flirting or rude) are kept with a gentle generic
// line, never brought up first ("저번에 …잖아요~" skips them), never merged into a topic summary
// and never shared. A sad or worrying one ('care') earns one quiet check-in the next day.

import { toReminder, normKey, similarity } from './ko.js';

export const EP_CAP = 14;          // detailed episodes kept
export const KEEP_NEWEST = 5;      // never merged
export const SUM_CAP = 10;         // consolidated topic summaries
export const FACT_CAP = 8;
export const FAVOR_CAP = 3;
export const LOG_CAP = 12;         // chat bubbles kept for the panel (and AI context)
export const SAID_CAP = 16;        // ids of learned lines this resident said recently (no repeats)
export const DAY_GAIN = 8;         // affinity a resident can gain from chat per game day
export const DAY_LOSS = 6;

export const SRC = { did: 'd', saw: 's', told: 't' };   // stored codes
export const SRC_KO = { d: '직접 함', s: '직접 봄', t: '들음' };

let epSeq = 1;

export class ResidentMemory {
  constructor(key, init = {}) {
    this.key = key;
    this.aff = init.aff != null ? init.aff : 12;
    this.mood = init.mood || 'happy';
    this.ep = [];        // { i, d, k, s, tp, f, m, src, by }
    this.sum = [];       // { tp, n, d, s, f }
    this.facts = [];     // { s, d, n }
    this.favors = [];    // { s, d, item, done }
    this.log = [];       // [who 'p'|'r'|'n', text, emote, src 'a'|'o']
    this.said = [];      // corpus ids this resident used recently
    this.day = { d: -1, gain: 0, loss: 0, k: {}, gift: 0 };
    this.talks = 0;
    this.ai = 0;
    this.met = -1;
    this.last = -1;
    this.asked = [];     // indexes of persona questions already asked
  }

  // ---------------------------------------------------------------- episodes
  /**
   * remember something. ep: { d, k ('chat'|'gift'|'favor'|'heard'|'saw'|'care'), s (plain-form
   * summary), tp [topics], f (-2..2 feeling), m (1..5 importance), src ('d'|'s'|'t'), by (who told),
   * pv (private: never brought up first, never shared) }
   */
  add(ep) {
    if (!ep || !ep.s) return null;
    // a near-duplicate of a recent episode reinforces it instead
    for (let i = this.ep.length - 1; i >= Math.max(0, this.ep.length - 6); i--) {
      const e = this.ep[i];
      if (similarity(e.s, ep.s) >= 0.82 && !!e.pv === !!ep.pv) { e.m = Math.min(5, Math.max(e.m, ep.m || 2)); e.d = ep.d; if (ep.k === 'care') delete e.ck; return e; }
    }
    const e = { i: epSeq++, d: ep.d | 0, k: ep.k || 'chat', s: String(ep.s).slice(0, 80), tp: (ep.tp || []).slice(0, 3), f: Math.max(-2, Math.min(2, ep.f | 0)), m: Math.max(1, Math.min(5, ep.m || 2)), src: ep.src || 'd' };
    if (ep.by) e.by = ep.by;
    if (ep.ai) e.ai = 1;
    if (ep.pv) e.pv = 1;
    this.ep.push(e);
    if (this.ep.length > EP_CAP) this.consolidate(ep.d | 0);
    return e;
  }

  /** merge the weakest old episodes into per-topic summaries */
  consolidate(today) {
    while (this.ep.length > EP_CAP) {
      let wi = -1, ws = 1e9;
      for (let i = 0; i < this.ep.length - KEEP_NEWEST; i++) {
        const e = this.ep[i];
        const sc = e.m * 3 - Math.max(0, today - e.d) * 0.5 + (e.k === 'favor' ? 2 : 0);
        if (sc < ws) { ws = sc; wi = i; }
      }
      if (wi < 0) wi = 0;
      const e = this.ep.splice(wi, 1)[0];
      // a private moment fades into one gentle line, never into a topic summary that could be retold
      const tp = e.pv ? '속마음' : e.tp[0] || (e.k === 'gift' ? '선물' : e.k === 'heard' ? '소문' : '수다');
      if (e.pv) e.s = e.k === 'care' ? '촌장님이 힘든 마음을 털어놓은 적 있다' : '촌장님이랑 조금 어색한 얘기를 한 적 있다';
      let s = this.sum.find((x) => x.tp === tp);
      if (!s) { s = { tp, n: 0, d: e.d, s: e.s, f: 0, m: e.m }; if (e.pv) s.pv = 1; this.sum.push(s); }
      s.n++; s.f = Math.max(-2, Math.min(2, Math.round((s.f * (s.n - 1) + e.f) / s.n)));
      if (e.m >= s.m || e.d >= s.d) { s.s = e.s; s.m = Math.max(s.m, e.m); }
      s.d = Math.max(s.d, e.d);
      if (this.sum.length > SUM_CAP) {
        this.sum.sort((a, b) => (b.n + b.m * 2 + b.d * 0.2) - (a.n + a.m * 2 + a.d * 0.2));
        this.sum.length = SUM_CAP;
      }
    }
  }

  // ---------------------------------------------------------------- facts / favours
  addFact(s, d) {
    s = String(s || '').trim().slice(0, 60);
    if (!s) return null;
    const k = normKey(s);
    let f = this.facts.find((x) => normKey(x.s) === k || similarity(x.s, s) >= 0.85);
    if (f) { f.n++; f.d = d; return f; }
    f = { s, d, n: 1 };
    this.facts.push(f);
    if (this.facts.length > FACT_CAP) { this.facts.sort((a, b) => b.n * 2 + b.d * 0.1 - (a.n * 2 + a.d * 0.1)); this.facts.length = FACT_CAP; }
    return f;
  }

  addFavor(ask, item, d) {
    if (this.favors.filter((f) => !f.done).length >= FAVOR_CAP) return null;
    if (this.favors.some((f) => !f.done && similarity(f.s, ask) > 0.8)) return null;
    const f = { s: String(ask).slice(0, 80), item: item || null, d, done: 0 };
    this.favors.push(f);
    if (this.favors.length > FAVOR_CAP + 2) this.favors = this.favors.filter((x) => !x.done).concat(this.favors.filter((x) => x.done).slice(-2));
    return f;
  }

  openFavors() { return this.favors.filter((f) => !f.done); }

  /** the chief gave an item a favour asked for: close it */
  fulfil(item) {
    const f = this.favors.find((x) => !x.done && x.item && item && (item.includes(x.item) || x.item.includes(item)));
    if (f) f.done = 1;
    return f || null;
  }

  // ---------------------------------------------------------------- affinity (rate limited)
  /**
   * apply a change from one exchange. kind: the intent (repeats of the same kind on one day count
   * less). Returns the change actually applied.
   */
  feel(delta, kind, day) {
    if (this.day.d !== day) this.day = { d: day, gain: 0, loss: 0, k: {}, gift: 0 };
    const n = (this.day.k[kind] = (this.day.k[kind] || 0) + 1);
    let d = Math.max(-2, Math.min(3, Math.round(delta)));
    if (d > 0) {
      if (kind === 'gift') d = this.day.gift++ ? 0 : d;
      else if (n === 2) d = Math.min(d, 1);
      else if (n > 2) d = 0;
      d = Math.min(d, DAY_GAIN - this.day.gain);
      this.day.gain += Math.max(0, d);
    } else if (d < 0) {
      d = Math.max(d, -(DAY_LOSS - this.day.loss));
      this.day.loss -= Math.min(0, d);
    }
    const before = this.aff;
    this.aff = Math.max(0, Math.min(100, this.aff + d));
    return this.aff - before;
  }

  // ---------------------------------------------------------------- recall
  /**
   * the memories most worth bringing up: [{ s, d, src, by, m, kind:'ep'|'sum'|'fact'|'favor' }]
   * ranked by importance, recency and topic / name overlap with the query.
   */
  recall({ topics = [], names = [], day = 0, n = 6 } = {}) {
    const out = [];
    const tpScore = (tp) => (tp || []).reduce((a, t) => a + (topics.includes(t) ? 3 : 0), 0);
    for (const e of this.ep) {
      const nm = names.some((k) => e.by === k || e.s.includes(k)) ? 2 : 0;
      out.push({ kind: 'ep', s: e.s, d: e.d, src: e.src, by: e.by, m: e.m, tp: e.tp, ai: e.ai, f: e.f, pv: e.pv, k: e.k, score: e.m * 1.6 + tpScore(e.tp) + nm - Math.max(0, day - e.d) * 0.35 + (e.f !== 0 ? 0.5 : 0) });
    }
    for (const s of this.sum) out.push({ kind: 'sum', s: s.s, d: s.d, src: 'd', m: s.m, tp: [s.tp], n: s.n, f: s.f, pv: s.pv, score: s.m + Math.min(3, s.n * 0.5) + tpScore([s.tp]) - Math.max(0, day - s.d) * 0.2 });
    for (const f of this.facts) out.push({ kind: 'fact', s: f.s, d: f.d, src: 'd', m: 3, score: 3 + f.n * 0.5 + (topics.some((t) => f.s.includes(t)) ? 3 : 0) });
    for (const f of this.openFavors()) out.push({ kind: 'favor', s: f.s, d: f.d, src: 'd', m: 3, item: f.item, score: 2.5 });
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, n);
  }

  /**
   * a reminder sentence for the offline brain ("저번에 …했잖아") from a memory worth recalling:
   * only happy or neutral ones the resident may bring up (never private ones, never sad or rude ones)
   */
  reminder(opts) {
    for (const m of this.recall(Object.assign({ n: 10 }, opts))) {
      if (m.kind === 'favor' || m.pv || (m.f || 0) < 0) continue;
      const r = toReminder(m.s);
      if (r) return { text: r, mem: m };
    }
    return null;
  }

  /** a private sad moment from an earlier day not checked on yet (one quiet "요즘은 괜찮아요?") */
  careDue(day) {
    for (let i = this.ep.length - 1; i >= 0; i--) {
      const e = this.ep[i];
      if (e.k === 'care' && e.pv && !e.ck && e.d < day && day - e.d <= 3) return e;
    }
    return null;
  }

  /** the check-in happened: every earlier sad moment counts as checked on */
  cared(day) { for (const e of this.ep) if (e.k === 'care' && e.d < day) e.ck = 1; }

  // ---------------------------------------------------------------- chat log
  pushLog(who, text, emote, src) {
    this.log.push([who, String(text).slice(0, 160), emote || '', src || '']);
    if (this.log.length > LOG_CAP) this.log.splice(0, this.log.length - LOG_CAP);
  }

  remember(id) {
    this.said.push(id);
    if (this.said.length > SAID_CAP) this.said.shift();
  }

  // ---------------------------------------------------------------- save
  serialize() {
    const o = { a: this.aff, mo: this.mood, e: this.ep, t: this.talks, ai: this.ai, me: this.met, la: this.last };
    if (this.sum.length) o.su = this.sum;
    if (this.facts.length) o.fa = this.facts;
    if (this.favors.length) o.fv = this.favors;
    if (this.log.length) o.lg = this.log;
    if (this.said.length) o.sd = this.said;
    if (this.asked.length) o.as = this.asked;
    if (this.day.d >= 0) o.dy = this.day;
    return o;
  }

  static deserialize(key, o) {
    const m = new ResidentMemory(key);
    if (!o || typeof o !== 'object') return m;
    m.aff = Number.isFinite(o.a) ? Math.max(0, Math.min(100, o.a)) : m.aff;
    m.mood = typeof o.mo === 'string' ? o.mo : m.mood;
    m.ep = Array.isArray(o.e) ? o.e.filter((e) => e && typeof e.s === 'string').slice(-EP_CAP) : [];
    for (const e of m.ep) if (e.i >= epSeq) epSeq = e.i + 1;
    m.sum = Array.isArray(o.su) ? o.su.slice(0, SUM_CAP) : [];
    m.facts = Array.isArray(o.fa) ? o.fa.slice(0, FACT_CAP) : [];
    m.favors = Array.isArray(o.fv) ? o.fv.slice(-(FAVOR_CAP + 2)) : [];
    m.log = Array.isArray(o.lg) ? o.lg.slice(-LOG_CAP) : [];
    m.said = Array.isArray(o.sd) ? o.sd.slice(-SAID_CAP) : [];
    m.asked = Array.isArray(o.as) ? o.as.slice(0, 8) : [];
    if (o.dy && typeof o.dy === 'object') m.day = Object.assign({ d: -1, gain: 0, loss: 0, k: {}, gift: 0 }, o.dy);
    m.talks = o.t | 0; m.ai = o.ai | 0; m.met = Number.isFinite(o.me) ? o.me : -1; m.last = Number.isFinite(o.la) ? o.la : -1;
    return m;
  }
}
