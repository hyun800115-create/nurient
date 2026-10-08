// Relationship graph. One record per unordered pair (a < b) in a Map (key a * 2^20 + b) plus an
// adjacency list on each resident, so removing a resident removes every pair (no orphans).
// familiarity 0..1000, affinity -1000..1000, romance 0..1000; stages:
//   0 never talked · 1 acquaintance · 2 friend · 3 best friend · 4 sweetheart · 5 engaged · 6 spouse
// flags: rival, one-sided crushes, family (parent / sibling), coworkers, neighbours, classmates, exes.

export const ST_NONE = 0, ST_ACQ = 1, ST_FRIEND = 2, ST_BEST = 3, ST_SWEET = 4, ST_ENGAGED = 5, ST_SPOUSE = 6;
export const STAGE_NAMES = ['stranger', 'acquaintance', 'friend', 'best friend', 'sweetheart', 'engaged', 'spouse'];
export const STAGE_KO = ['모르는 사이', '아는 사이', '친구', '단짝', '연인', '약혼', '부부'];

export const RF_RIVAL = 1, RF_CRUSH_A = 2, RF_CRUSH_B = 4, RF_FAMILY = 8, RF_SIBLING = 16, RF_PARENT_A = 32, RF_PARENT_B = 64,
  RF_COWORK = 128, RF_NEIGHBOR = 256, RF_EX = 512, RF_CLASS = 1024, RF_GRAND_A = 2048, RF_GRAND_B = 4096;

const SHIFT = 1048576;
export function pairKey(a, b) { return a < b ? a * SHIFT + b : b * SHIFT + a; }

export class Rel {
  constructor(a, b) {
    this.a = a; this.b = b;
    this.fam = 0; this.aff = 0; this.rom = 0; this.stage = ST_NONE; this.flags = 0;
    this.met = -1; this.last = 0; this.n = 0; this.fights = 0;
    this.ring = new Uint32Array(24); this.rp = 0;  // recent line hashes (repetition guard, not saved)
    this.topic = 0;                                  // last topic hash
  }
  other(id) { return id === this.a ? this.b : this.a; }
  has(f) { return (this.flags & f) !== 0; }
  crushOf(id) { return (this.flags & (id === this.a ? RF_CRUSH_A : RF_CRUSH_B)) !== 0; }
  isParentOf(id) { return (this.flags & (id === this.a ? RF_PARENT_A : RF_PARENT_B)) !== 0; }
  isGrandOf(id) { return (this.flags & (id === this.a ? RF_GRAND_A : RF_GRAND_B)) !== 0; }
}

export function getRel(e, a, b) { return a === b ? null : e.pairs.get(pairKey(a, b)) || null; }

export function ensureRel(e, ra, rb) {
  const k = pairKey(ra.id, rb.id);
  let r = e.pairs.get(k);
  if (r) return r;
  r = ra.id < rb.id ? new Rel(ra.id, rb.id) : new Rel(rb.id, ra.id);
  e.pairs.set(k, r);
  ra.adj.push(r); rb.adj.push(r);
  return r;
}

export function removeRel(e, rel) {
  e.pairs.delete(pairKey(rel.a, rel.b));
  for (const id of [rel.a, rel.b]) {
    const p = e.people[id];
    if (!p) continue;
    const i = p.adj.indexOf(rel);
    if (i >= 0) { p.adj[i] = p.adj[p.adj.length - 1]; p.adj.pop(); }
  }
}

export function removeAllRels(e, r) {
  while (r.adj.length) removeRel(e, r.adj[r.adj.length - 1]);
}

export function setFlag(rel, f, on) { if (on) rel.flags |= f; else rel.flags &= ~f; }

/** familiarity, affinity and romance thresholds -> stage (never demotes sweetheart+/spouse here) */
export function stageFor(rel) {
  if (rel.stage >= ST_SWEET) return rel.stage;
  if (rel.n === 0 && rel.fam < 40) return rel.stage;
  if (rel.fam >= 650 && rel.aff >= 560) return ST_BEST;
  if (rel.fam >= 260 && rel.aff >= 220) return ST_FRIEND;
  return ST_ACQ;
}

export function clampRel(rel) {
  if (rel.fam > 1000) rel.fam = 1000; else if (rel.fam < 0) rel.fam = 0;
  if (rel.aff > 1000) rel.aff = 1000; else if (rel.aff < -1000) rel.aff = -1000;
  if (rel.rom > 1000) rel.rom = 1000; else if (rel.rom < 0) rel.rom = 0;
}

/** list of friends (stage >= friend) of a resident */
export function friendsOf(e, r, minStage = ST_FRIEND) {
  const out = [];
  for (const rel of r.adj) if (rel.stage >= minStage && !(rel.flags & RF_RIVAL)) out.push(rel.other(r.id));
  return out;
}
