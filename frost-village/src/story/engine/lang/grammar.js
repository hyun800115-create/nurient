// Data-driven template grammar (Tracery-like, compiled once).
//
// A grammar is { ruleName: [alternative, …] }. An alternative is a string written in a small markup:
//   #rule#           expand another rule
//   {X}              a slot value (people, places, items, numbers … filled by the realizer)
//   {X:이}           slot + Korean particle chosen by 받침 (이/가, 은/는, 을/를, 과/와, 아/야, 으로/로,
//                    이랑/랑, 이야/야, 이에요/예요, 이었/였 …; always write the after-consonant form)
//   {:을}            particle for whatever text comes right before (e.g. '#food#{:을} 샀어')
//   {X^}             slot with the first letter capitalised (English)
//   {X:a}            English: slot with its article ('a baker', 'an ice rink')
//   [반말|해요|존댓]  pick by speech level (two options: the second is used for 존댓 too)
//   <a|b|c>          pick one at random
// An alternative may start with '?cond cond !cond *3?' — required / forbidden condition flags
// (lang/conds.js) and an optional weight. Alternatives that need a slot the context does not have are
// never chosen (computed transitively through rule references).
// Conversation tags in the same header: '=tag' marks what this alternative says (a question about
// meals, a compliment …), '^tag' / '!^tag' require / forbid that the previous line carried the tag (so a
// reply answers what was really said), '@tag' / '!@tag' test tags set earlier in the same line.

import { COND, TAG } from './conds.js';
import { particle, finalKind, article } from './josa.js';

const T_TEXT = 0, T_RULE = 1, T_SLOT = 2, T_JOSA = 3, T_LEVEL = 4, T_CHOICE = 5;

// Q = the other version of a story (place or item: '{Q} 말고 {P}'), F = how the listener calls the speaker ('준영 삼촌'),
// DO = what the person's job is about ('빵을 구워')
export const SLOTS = ['X', 'Y', 'Z', 'P', 'Q', 'I', 'N', 'B', 'J', 'T', 'W', 'S', 'L', 'V', 'K', 'M', 'R', 'D', 'H', 'A', 'C', 'G', 'U', 'E', 'F', 'O', 'DO'];
const SLOT_BIT = Object.create(null);
SLOTS.forEach((s, i) => { SLOT_BIT[s] = 1 << i; });
// S (speaker self) / L (listener) / V (vocative) / W (weather) / T (when) / K (chief) / R (bank rate) are always there
export const ALWAYS_SLOTS = SLOT_BIT.S | SLOT_BIT.L | SLOT_BIT.V | SLOT_BIT.W | SLOT_BIT.K | SLOT_BIT.T | SLOT_BIT.R;
export function slotBit(s) { return SLOT_BIT[s] || 0; }

let scratchW = new Float64Array(256);
const NO = -Infinity;      // weight mark: alternative not eligible (recently used ones are stored negative)
// 나/저/너 + 이/가 -> 내가/제가/네가
const PRON = { 나: '내가', 저: '제가', 너: '네가' };

export class Grammar {
  /** @param {object} rules  merged rule table   @param {string} lang 'ko' | 'en' */
  constructor(rules, lang) {
    this.lang = lang;
    this.rules = Object.create(null);
    this.altCount = 0;
    this.allAlts = [];
    const names = Object.keys(rules);
    for (const name of names) this.rules[name] = { name, alts: [], need: 0, top: false };
    for (const name of names) {
      const list = rules[name];
      if (!Array.isArray(list)) throw new Error(`grammar ${lang}: rule ${name} is not an array`);
      const R = this.rules[name];
      for (const src of list) R.alts.push(this.compileAlt(src, name));
      if (R.alts.length > scratchW.length) scratchW = new Float64Array(R.alts.length * 2);
    }
    // resolve rule references and the slots each alternative needs (fixpoint through references)
    for (const name of names) for (const a of this.rules[name].alts) this.resolve(a.parts, name);
    // top-level references of each alternative (an alternative whose referenced rule has nothing to say
    // in the current context is skipped) and rules that can always say something
    for (const name of names) for (const a of this.rules[name].alts) {
      a.refs = [];
      for (const p of a.parts) if (p.t === T_RULE && a.refs.indexOf(p.r) < 0) a.refs.push(p.r);
      a.free = !a.refs.length && !(a.m0 | a.m1 | a.m2 | a.m3 | a.m4 | a.pm0 | a.pm1 | a.pm2 | a.pm3 | a.cm0 | a.cm1 | a.cm2 | a.cm3 | a.n0 | a.n1 | a.n2 | a.n3 | a.n4 | a.pn0 | a.pn1 | a.pn2 | a.pn3 | a.cn0 | a.cn1 | a.cn2 | a.cn3 | a.directNeed) && !a.lv;
    }
    for (const name of names) { const R = this.rules[name]; R.always = R.alts.some((a) => a.free); }
    for (let pass = 0; pass < 6; pass++) {
      let changed = false;
      for (const name of names) {
        const R = this.rules[name];
        let common = ~0;
        for (const a of R.alts) {
          const need = a.directNeed | this.refNeed(a.parts);
          if (need !== a.need) { a.need = need; changed = true; }
          common &= a.need;
        }
        if (!R.alts.length) common = 0;
        if (common !== R.need) { R.need = common; changed = true; }
      }
      if (!changed) break;
    }
    this.used = new Uint8Array(this.altCount);
  }

  compileAlt(src, ruleName) {
    let w = 1;
    const m = [0, 0, 0, 0, 0], n = [0, 0, 0, 0, 0];
    const ts = [0, 0, 0, 0], pm = [0, 0, 0, 0], pn = [0, 0, 0, 0], cm = [0, 0, 0, 0], cn = [0, 0, 0, 0];
    let s = src;
    if (typeof s !== 'string') throw new Error(`grammar ${this.lang}: ${ruleName}: alternative is not a string`);
    if (s.charAt(0) === '?') {
      const j = s.indexOf('?', 1);
      if (j < 0) throw new Error(`grammar ${this.lang}: ${ruleName}: unterminated condition in "${src}"`);
      for (const tok of s.slice(1, j).trim().split(/\s+/)) {
        if (!tok) continue;
        if (tok.charAt(0) === '*') { w = +tok.slice(1) || 1; continue; }
        const neg = tok.charAt(0) === '!';
        let nm = neg ? tok.slice(1) : tok;
        const c0 = nm.charAt(0);
        if (c0 === '=' || c0 === '^' || c0 === '@') {
          nm = nm.slice(1);
          const t = TAG[nm];
          if (t === undefined) throw new Error(`grammar ${this.lang}: ${ruleName}: unknown tag "${nm}" in "${src}"`);
          const arr = c0 === '=' ? ts : c0 === '^' ? (neg ? pn : pm) : (neg ? cn : cm);
          arr[t >> 5] |= 1 << (t & 31);
          continue;
        }
        const i = COND[nm];
        if (i === undefined) throw new Error(`grammar ${this.lang}: ${ruleName}: unknown condition "${nm}" in "${src}"`);
        (neg ? n : m)[i >> 5] |= 1 << (i & 31);
      }
      s = s.slice(j + 1).replace(/^ /, '');
    }
    // a bare '*3 ' weight prefix
    const wm = /^\*(\d+(?:\.\d+)?) /.exec(s);
    if (wm) { w = +wm[1]; s = s.slice(wm[0].length); }
    const ctx = { need: 0, lv: null };
    const [parts] = parse(s, 0, '', ctx, this.lang, ruleName);
    // slots only one speech level's wording needs ('[… {P} 쪽에 있어.|… {P} 쪽에 있어요.|반갑습니다.]')
    const lv = ctx.lv && (ctx.lv[0] | ctx.lv[1] | ctx.lv[2] | ctx.lv[3]) ? ctx.lv : null;
    const alt = { parts, m0: m[0], m1: m[1], m2: m[2], m3: m[3], m4: m[4], n0: n[0], n1: n[1], n2: n[2], n3: n[3], n4: n[4],
      ts0: ts[0], ts1: ts[1], ts2: ts[2], ts3: ts[3], pm0: pm[0], pm1: pm[1], pm2: pm[2], pm3: pm[3], pn0: pn[0], pn1: pn[1], pn2: pn[2], pn3: pn[3],
      cm0: cm[0], cm1: cm[1], cm2: cm[2], cm3: cm[3], cn0: cn[0], cn1: cn[1], cn2: cn[2], cn3: cn[3],
      w, gid: this.altCount++, directNeed: ctx.need, need: ctx.need, lv, rule: ruleName, src };
    this.allAlts.push(alt);
    return alt;
  }

  resolve(parts, from) {
    for (const p of parts) {
      if (p.t === T_RULE) {
        const r = this.rules[p.name];
        if (!r) throw new Error(`grammar ${this.lang}: rule "${from}" references unknown rule "#${p.name}#"`);
        p.r = r;
      } else if (p.t === T_LEVEL || p.t === T_CHOICE) for (const o of p.opts) this.resolve(o, from);
    }
  }

  // slots needed by every path through referenced rules (only top-level refs count as hard needs)
  refNeed(parts) {
    let need = 0;
    for (const p of parts) if (p.t === T_RULE) need |= p.r.need;
    return need;
  }

  has(name) { return !!this.rules[name]; }

  /**
   * expand rule `name` for context `ctx` and return the text ('' if nothing fits)
   * ctx: { f0 … f4 (condition masks), p0 … p2 (tags of the previous line), t0 … t2 (tags set so far in
   *        this line, updated), slots (bitmask of present slots), level (0..3), rng (has next()),
   *        get(slot) -> string, recent (Int32Array ring) / rpos, track (bool) }
   */
  expand(name, ctx) {
    const r = this.rules[name];
    if (!r) return '';
    const out = { s: '' };
    ctx.t0 = 0; ctx.t1 = 0; ctx.t2 = 0; ctx.t3 = 0;
    this.expandRule(r, ctx, out, 0);
    return out.s;
  }

  expandRule(r, ctx, out, depth) {
    if (depth > 12) return false;
    const alt = this.choose(r, ctx);
    if (!alt) return false;
    this.emit(alt.parts, ctx, out, depth);
    return true;
  }

  choose(r, ctx) {
    const alts = r.alts, n = alts.length;
    if (!n) return null;
    const f0 = ctx.f0, f1 = ctx.f1, f2 = ctx.f2, f3 = ctx.f3, f4 = ctx.f4 | 0, have = ctx.slots;
    const p0 = ctx.p0 | 0, p1 = ctx.p1 | 0, p2 = ctx.p2 | 0, p3 = ctx.p3 | 0, t0 = ctx.t0 | 0, t1 = ctx.t1 | 0, t2 = ctx.t2 | 0, t3 = ctx.t3 | 0;
    const rec = ctx.recent, useRecent = rec && n >= 3, noQ = ctx.noQ, lvl = ctx.level > 3 ? 3 : ctx.level | 0;
    let sum = 0, sumAll = 0;
    const W = scratchW;
    for (let i = 0; i < n; i++) {
      const a = alts[i];
      if ((a.need & have) !== a.need || (a.m0 & f0) !== a.m0 || (a.m1 & f1) !== a.m1 || (a.m2 & f2) !== a.m2 || (a.m3 & f3) !== a.m3 || (a.m4 & f4) !== a.m4 ||
          (a.n0 & f0) || (a.n1 & f1) || (a.n2 & f2) || (a.n3 & f3) || (a.n4 & f4) ||
          (a.pm0 & p0) !== a.pm0 || (a.pm1 & p1) !== a.pm1 || (a.pm2 & p2) !== a.pm2 || (a.pm3 & p3) !== a.pm3 || (a.pn0 & p0) || (a.pn1 & p1) || (a.pn2 & p2) || (a.pn3 & p3) ||
          (a.cm0 & t0) !== a.cm0 || (a.cm1 & t1) !== a.cm1 || (a.cm2 & t2) !== a.cm2 || (a.cm3 & t3) !== a.cm3 || (a.cn0 & t0) || (a.cn1 & t1) || (a.cn2 & t2) || (a.cn3 & t3) ||
          (a.lv !== null && (a.lv[lvl] & have) !== a.lv[lvl])) { W[i] = NO; continue; }
      if (noQ && (a.ts0 & 1)) { W[i] = NO; continue; }          // this line must not ask a question
      // recently used by this speaker: still possible, but much less likely (a fitting answer said
      // twice beats an unfitting generic one)
      const w = useRecent && recentHas(rec, a.gid) ? a.w * 0.06 : a.w;
      sumAll += w;
      W[i] = w; sum += w;
    }
    // drop alternatives that reference a rule with nothing to say here
    for (let i = 0; i < n; i++) {
      const a = alts[i];
      if (W[i] === NO || !a.refs.length) continue;
      let ok = true;
      for (let k = 0; k < a.refs.length; k++) if (!this.canExpand(a.refs[k], ctx, 0)) { ok = false; break; }
      if (!ok) { sum -= W[i]; sumAll -= W[i]; W[i] = NO; }
    }
    let pick = -1;
    if (sum > 0) {
      let x = ctx.rng.next() * sum;
      for (let i = 0; i < n; i++) { const w = W[i]; if (w <= 0) continue; if (x < w) { pick = i; break; } x -= w; }
      if (pick < 0) for (let i = n - 1; i >= 0; i--) if (W[i] > 0) { pick = i; break; }
    } else if (sumAll > 0) {
      let x = ctx.rng.next() * sumAll;
      for (let i = 0; i < n; i++) { const w = W[i] === NO ? 0 : -W[i]; if (w <= 0) continue; if (x < w) { pick = i; break; } x -= w; }
      if (pick < 0) for (let i = n - 1; i >= 0; i--) if (W[i] !== NO) { pick = i; break; }
    }
    if (pick < 0) return null;
    const a = alts[pick];
    ctx.t0 = t0 | a.ts0; ctx.t1 = t1 | a.ts1; ctx.t2 = t2 | a.ts2; ctx.t3 = t3 | a.ts3;
    if (useRecent) { rec[ctx.rpos.v] = a.gid + 1; ctx.rpos.v = (ctx.rpos.v + 1) % rec.length; }
    if (ctx.track) this.used[a.gid] = 1;
    return a;
  }

  /** true when rule r has at least one alternative that fits ctx (looking a few references deep) */
  canExpand(r, ctx, depth) {
    if (r.always) return true;
    if (depth > 3) return true;
    const f0 = ctx.f0, f1 = ctx.f1, f2 = ctx.f2, f3 = ctx.f3, f4 = ctx.f4 | 0, have = ctx.slots;
    const p0 = ctx.p0 | 0, p1 = ctx.p1 | 0, p2 = ctx.p2 | 0, p3 = ctx.p3 | 0, t0 = ctx.t0 | 0, t1 = ctx.t1 | 0, t2 = ctx.t2 | 0, t3 = ctx.t3 | 0;
    const lvl = ctx.level > 3 ? 3 : ctx.level | 0;
    const alts = r.alts;
    for (let i = 0; i < alts.length; i++) {
      const a = alts[i];
      if ((a.need & have) !== a.need || (a.m0 & f0) !== a.m0 || (a.m1 & f1) !== a.m1 || (a.m2 & f2) !== a.m2 || (a.m3 & f3) !== a.m3 || (a.m4 & f4) !== a.m4 ||
          (a.n0 & f0) || (a.n1 & f1) || (a.n2 & f2) || (a.n3 & f3) || (a.n4 & f4) ||
          (a.pm0 & p0) !== a.pm0 || (a.pm1 & p1) !== a.pm1 || (a.pm2 & p2) !== a.pm2 || (a.pm3 & p3) !== a.pm3 || (a.pn0 & p0) || (a.pn1 & p1) || (a.pn2 & p2) || (a.pn3 & p3) ||
          (a.cm0 & t0) !== a.cm0 || (a.cm1 & t1) !== a.cm1 || (a.cm2 & t2) !== a.cm2 || (a.cm3 & t3) !== a.cm3 || (a.cn0 & t0) || (a.cn1 & t1) || (a.cn2 & t2) || (a.cn3 & t3) ||
          (a.lv !== null && (a.lv[lvl] & have) !== a.lv[lvl])) continue;
      let ok = true;
      for (let k = 0; k < a.refs.length; k++) if (!this.canExpand(a.refs[k], ctx, depth + 1)) { ok = false; break; }
      if (ok) return true;
    }
    return false;
  }

  emit(parts, ctx, out, depth) {
    for (let k = 0; k < parts.length; k++) {
      const p = parts[k];
      switch (p.t) {
        case T_TEXT: out.s += p.s; break;
        case T_RULE: this.expandRule(p.r, ctx, out, depth + 1); break;
        case T_SLOT: {
          let v = ctx.get(p.slot);
          if (v == null) v = '';
          if (p.cap && v) v = v.charAt(0).toUpperCase() + v.slice(1);
          if (p.form === '이' && PRON[v]) { out.s += PRON[v]; break; }
          if (p.form === 'a' && this.lang === 'en') { if (v) out.s += article(v) + ' ' + v; break; }   // English article: {J:a} -> 'a baker' / 'an owner'
          out.s += v;
          if (p.form) out.s += particle(v, p.form);
          break;
        }
        case T_JOSA: out.s += particle(out.s, p.form); break;
        case T_LEVEL: { const o = p.opts; this.emit(o[ctx.level < o.length ? ctx.level : o.length - 1], ctx, out, depth); break; }
        case T_CHOICE: { const o = p.opts; this.emit(o[Math.floor(ctx.rng.next() * o.length)], ctx, out, depth); break; }
      }
    }
  }

  coverage() {
    let u = 0;
    for (let i = 0; i < this.used.length; i++) u += this.used[i];
    return { used: u, total: this.altCount };
  }

  /** number of distinct leaf strings (alternatives + inline choices) — a size measure */
  stats() {
    let leaves = 0;
    const count = (parts) => { let c = 1; for (const p of parts) if (p.t === T_LEVEL || p.t === T_CHOICE) { let s = 0; for (const o of p.opts) s += count(o); c *= Math.max(1, p.t === T_CHOICE ? s : 1); } return c; };
    for (const a of this.allAlts) leaves += count(a.parts);
    return { rules: Object.keys(this.rules).length, alternatives: this.altCount, variants: leaves };
  }
}

function recentHas(rec, gid) {
  const g = gid + 1;
  for (let i = 0; i < rec.length; i++) if (rec[i] === g) return true;
  return false;
}

// ---------------------------------------------------------------- parser
function parse(s, i, stop, ctx, lang, ruleName) {
  const parts = [];
  let text = '';
  const flush = () => { if (text) { parts.push({ t: T_TEXT, s: text }); text = ''; } };
  while (i < s.length) {
    const c = s.charAt(i);
    if (stop && stop.indexOf(c) >= 0) break;
    if (c === '\\') { text += s.charAt(i + 1); i += 2; continue; }
    if (c === '#') {
      const j = s.indexOf('#', i + 1);
      if (j < 0) throw new Error(`grammar ${lang}: ${ruleName}: unterminated #rule# in "${s}"`);
      flush();
      parts.push({ t: T_RULE, name: s.slice(i + 1, j), r: null });
      i = j + 1; continue;
    }
    if (c === '{') {
      const j = s.indexOf('}', i + 1);
      if (j < 0) throw new Error(`grammar ${lang}: ${ruleName}: unterminated {slot} in "${s}"`);
      flush();
      const body = s.slice(i + 1, j);
      const k = body.indexOf(':');
      let slot = k < 0 ? body : body.slice(0, k);
      const form = k < 0 ? null : body.slice(k + 1);
      let cap = false;
      if (slot.endsWith('^')) { cap = true; slot = slot.slice(0, -1); }
      if (!slot) parts.push({ t: T_JOSA, form });
      else {
        if (!(slot in SLOT_BIT)) throw new Error(`grammar ${lang}: ${ruleName}: unknown slot {${slot}} in "${s}"`);
        ctx.need |= SLOT_BIT[slot] & ~ALWAYS_SLOTS;
        parts.push({ t: T_SLOT, slot, form, cap });
      }
      i = j + 1; continue;
    }
    if (c === '[' || c === '<') {
      flush();
      const close = c === '[' ? ']' : '>';
      const opts = [];
      i++;
      const inner = { need: 0, lv: null };
      let needAll = ~0, needAny = 0;
      const optNeed = [];
      for (;;) {
        inner.need = 0; inner.lv = null;
        const [p, ni] = parse(s, i, '|' + close, inner, lang, ruleName);
        opts.push(p);
        let on = inner.need;
        if (inner.lv) on |= inner.lv[0] | inner.lv[1] | inner.lv[2] | inner.lv[3];   // nested levels: be safe
        optNeed.push(on);
        needAll &= on; needAny |= on;
        i = ni;
        if (s.charAt(i) === '|') { i++; continue; }
        if (s.charAt(i) === close) { i++; break; }
        throw new Error(`grammar ${lang}: ${ruleName}: unterminated ${c}…${close} in "${s}"`);
      }
      if (c === '<') ctx.need |= needAny;          // a random pick may land on any option
      else {
        // a level choice needs what every option needs, plus what the option of the speaker's level needs
        const common = needAll === ~0 ? 0 : needAll;
        ctx.need |= common;
        if (needAny & ~common) {
          if (!ctx.lv) ctx.lv = [0, 0, 0, 0];
          for (let L = 0; L < 4; L++) ctx.lv[L] |= optNeed[L < optNeed.length ? L : optNeed.length - 1] & ~common;
        }
      }
      parts.push({ t: c === '[' ? T_LEVEL : T_CHOICE, opts });
      continue;
    }
    text += c; i++;
  }
  flush();
  return [parts, i];
}

/** final tidy-up of a generated line */
export function tidy(s, lang) {
  s = s.replace(/\s{2,}/g, ' ').replace(/\s+([,.!?~…])/g, '$1').replace(/^[\s,]+/, '').trim();
  if (lang === 'en' && s) {
    s = s.charAt(0).toUpperCase() + s.slice(1);
    s = s.replace(/([.!?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase());   // a new sentence starts with a capital
  }
  return s;
}

export { finalKind };
