// Episodic memory. Facts (things that happened) live once in engine.facts; each resident keeps up to
// cfg.memCap memories pointing at facts, each with its own source (seen / did / told-by / newspaper /
// asked), strength (0..1000, decays nightly unless consolidated into long-term), exaggeration (0..3)
// and distortion (wrong place / wrong item / forgot who / bigger number) — so a rumour can change as
// it travels from mouth to mouth.

import { FACT_KINDS, KIND_IDX } from '../data/facts.js';

export const SRC_SEEN = 0, SRC_DID = 1, SRC_TOLD = 2, SRC_NEWS = 3, SRC_ASKED = 4;
export const D_NONE = 0, D_PLACE = 1, D_ITEM = 2, D_ANON = 3, D_COUNT = 4;

export class Fact {
  constructor(id, k) {
    this.id = id; this.k = k; this.ki = KIND_IDX[k];
    this.day = 0; this.sec = 0;
    this.a = -1; this.b = -1; this.c = -1;
    this.p = -1; this.i = -1; this.n = 0;
    this.s = '';               // free text (the chief's deed, a pet name …)
    this.v = FACT_KINDS[k].v; this.imp = FACT_KINDS[k].imp;
    this.ref = 0;              // a fact this one follows up (arrest -> theft)
    this.st = 0;               // status (theft: 1 caught, 2 escaped; fire: 1 out, 2 ruin, 3 rebuilt …)
    this.knowers = 0;          // residents remembering it now
    this.reach = 0;            // residents who ever learnt it
    this.firstAt = 0;          // sec
    this.maxHop = 0;
    this.pinned = 0;           // kept from garbage collection (active incident, paper …)
  }
}

export class Mem {
  constructor() { this.reset(); }
  reset() {
    this.f = null; this.src = 0; this.from = -1; this.s = 0; this.x = 0; this.d = 0; this.alt = -1;
    this.t = 0; this.told = 0; this.heard = 0; this.lt = 0; this.h = 0; this.tt = [];
    return this;
  }
}

const pool = [];
function newMem() { return pool.length ? pool.pop().reset() : new Mem(); }

export function findMem(r, fact) {
  const m = r.mem;
  for (let i = 0; i < m.length; i++) if (m[i].f === fact) return m[i];
  return null;
}

export function keepScore(m) { return m.s * (0.35 + m.f.imp / 100) * (m.lt ? 1.6 : 1) * (m.src === SRC_DID ? 1.3 : 1); }

/**
 * resident r learns fact (src, from). Returns the memory (new or reinforced) or null (not kept).
 * opts: { x, d, alt, s, h }
 */
export function remember(e, r, fact, src, from = -1, opts) {
  if (!r.alive) return null;
  let m = findMem(r, fact);
  const now = e.now;
  if (m) {
    m.heard++;
    const gain = src === SRC_SEEN || src === SRC_DID ? 400 : 160;
    m.s = Math.min(1000, m.s + gain);
    // a first-hand look corrects a rumour
    if (src === SRC_SEEN || src === SRC_DID) { m.x = 0; m.d = 0; m.alt = -1; if (m.src >= SRC_TOLD) { m.src = src; m.from = -1; m.h = 0; } }
    else if (opts && opts.x > m.x && r.tr[7] < 45) m.x = opts.x;   // the juicier version sticks (not with honest folk)
    if (m.heard >= 2 || fact.imp >= 70) m.lt = 1;
    return m;
  }
  let s;
  if (opts && opts.s !== undefined) s = opts.s;
  else if (src === SRC_DID) s = 1000;
  else if (src === SRC_SEEN) s = Math.min(1000, 600 + fact.imp * 4);
  else if (src === SRC_NEWS) s = 520 + fact.imp * 2;
  else s = 450;
  const cap = e.cfg.memCap;
  if (r.mem.length >= cap) {
    // evict the weakest — unless the new one is weaker still
    let wi = -1, ws = 1e18;
    for (let i = 0; i < r.mem.length; i++) { const k = keepScore(r.mem[i]); if (k < ws) { ws = k; wi = i; } }
    const newScore = s * (0.35 + fact.imp / 100) * (src === SRC_DID ? 1.3 : 1);
    if (newScore <= ws) return null;
    dropAt(e, r, wi);
  }
  m = newMem();
  m.f = fact; m.src = src; m.from = from; m.s = s; m.t = now;
  if (opts) { if (opts.x) m.x = opts.x; if (opts.d) { m.d = opts.d; m.alt = opts.alt !== undefined ? opts.alt : -1; } if (opts.h) m.h = opts.h; }
  if (fact.imp >= 80 && src <= SRC_DID) m.lt = 1;
  r.mem.push(m);
  fact.knowers++;
  if (fact.reach === 0) fact.firstAt = now;
  fact.reach++;
  if (m.h > fact.maxHop) fact.maxHop = m.h;
  e.metrics && e.metrics.onLearn(fact, r, m);
  return m;
}

export function dropAt(e, r, i) {
  const m = r.mem[i];
  const last = r.mem.length - 1;
  if (i !== last) r.mem[i] = r.mem[last];
  r.mem.pop();
  if (m.f) { m.f.knowers--; if (m.f.knowers <= 0) e.factMaybeDead(m.f); }
  pool.push(m);
}

export function forgetAll(e, r) { while (r.mem.length) dropAt(e, r, r.mem.length - 1); }

/** nightly: fade, consolidate, forget */
export function nightly(e, r) {
  const mem = r.mem;
  for (let i = mem.length - 1; i >= 0; i--) {
    const m = mem[i];
    const imp = m.f.imp;
    if (!m.lt && (m.heard >= 2 || m.told >= 3 || imp >= 75 || (m.src === SRC_DID && imp >= 45))) m.lt = 1;
    const rate = (130 - imp) * (m.lt ? 0.25 : 1);     // per mille per night: 130-imp => ~5-12 % a night
    m.s -= Math.floor((m.s * rate) / 1000) + 2;
    // memories about people who left still matter, gently
    if (m.s < 70) dropAt(e, r, i);
  }
}

/** novelty of a fact: 1 fresh … 0 stale (days) */
export function novelty(e, f) {
  const age = (e.now - f.sec) / e.cfg.dayLength;
  return age < 0.5 ? 1 : age > 7 ? 0 : 1 - (age - 0.5) / 6.5;
}
