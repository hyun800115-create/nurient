// Story saves (docs/v5_v8_plan.md §6.1 "Save slice", §8). Two records:
//  1. the main-save slice `story` (v2, cap 1 KB): what must survive even when the side record is lost or stale — the
//     game time it was written at (T), when v5 began (t0), the life milestones seen, the beats the player was promised
//     (booked: a wedding day, a school day, a last day, a farewell), the first couple, names the chief chose, the garden
//     stones, wishes, the last happening. People are stored by game pid ('t:12', 'v:npc_aunt', 'k:203'), never by engine
//     sid: sids are re-dealt when the town is adopted again (critique H3);
//  2. the side record SAVE_KEY + '.story' (v1, ≤ 450 K chars, hard 600 K): { v, cid, T, day, reg, eng, life } with the
//     packed engine (pack15), the registry and a copy of the life state. Written once a game day, after every staged
//     ceremony / booking, on pagehide and visibilitychange: hidden — never on the 5 s autosave. Pure: storage is passed
//     in (localStorage in the game, a Map in the tests).

import { sanitizeLifeState } from './model/lifeRules.js';

export const SLICE_KEY = 'story';
export const SLICE_VERSION = 2;
export const SLICE_CAP = 1024;
export const SIDE_SUFFIX = '.story';
export const SIDE_VERSION = 1;

const num = (v, d = 0) => (Number.isFinite(v) ? v : d);

/** older slices -> the current version (a v6 bump adds MIGRATE_SLICE[2]); returns null when nothing can be kept */
export const MIGRATE_SLICE = {
  // v1 stored engine sids (firstCouple, wishes, wishActive): they cannot be trusted after a re-adoption, so they go;
  // the milestones, names, garden and the paper start day stay
  1: (o) => {
    const life = Object.assign({}, o.life || {});
    life.firstCouple = []; life.wishes = {}; life.wishDone = {}; life.wishActive = null;
    return Object.assign({}, o, { v: 2, life });
  },
};

/** the main-save slice from the host's state (capped to SLICE_CAP JSON chars) */
export function makeSlice(st) {
  const life = sanitizeLifeState(st.life);
  const o = {
    v: SLICE_VERSION, day: st.day | 0, T: Math.max(0, Math.round(num(st.T))), t0: Math.max(0, Math.round(num(st.t0))), ok: st.ok ? 1 : 0, chars: st.chars | 0,
    life, happen: { last: st.happen && Number.isFinite(st.happen.last) ? Math.round(st.happen.last) : -1 },
  };
  return capSlice(o);
}

/** keep the slice under the cap: the oldest chosen names, then old garden names, then done wishes go first
 *  (promised beats, the first couple and the milestones always stay) */
export function capSlice(o, cap = SLICE_CAP) {
  let s = JSON.stringify(o);
  const L = o.life;
  while (s.length > cap && L.names.length) { L.names.shift(); s = JSON.stringify(o); }
  while (s.length > cap && L.gardenOld.length) { L.gardenOld.shift(); s = JSON.stringify(o); }
  while (s.length > cap && Object.keys(L.wishDone).length) { delete L.wishDone[Object.keys(L.wishDone)[0]]; s = JSON.stringify(o); }
  while (s.length > cap && Object.keys(L.wishes).length) { delete L.wishes[Object.keys(L.wishes)[0]]; s = JSON.stringify(o); }
  while (s.length > cap && L.garden.length > 1) { L.garden.shift(); s = JSON.stringify(o); }
  return o;
}

/** Save.js sanitizer for the slice (pure; null = drop it). Accepts its own output, migrates older versions. */
export function sanitizeSlice(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  let r = raw;
  for (let k = 0; k < 4 && Number.isInteger(r.v) && r.v < SLICE_VERSION && MIGRATE_SLICE[r.v]; k++) {
    try { r = MIGRATE_SLICE[r.v](r); } catch (e) { return null; }
    if (!r || typeof r !== 'object') return null;
  }
  if (r.v !== SLICE_VERSION) return null;
  const o = {
    v: SLICE_VERSION, day: Number.isFinite(r.day) ? Math.max(0, Math.floor(r.day)) : 0,
    T: Number.isFinite(r.T) ? Math.max(0, Math.round(r.T)) : 0, t0: Number.isFinite(r.t0) ? Math.max(0, Math.round(r.t0)) : 0,
    ok: r.ok ? 1 : 0, chars: Number.isFinite(r.chars) ? Math.max(0, r.chars | 0) : 0,
    life: sanitizeLifeState(r.life),
    happen: { last: r.happen && Number.isFinite(r.happen.last) ? Math.round(r.happen.last) : -1 },
  };
  return capSlice(o);
}

/** the side record store; storage = { getItem, setItem, removeItem } (localStorage-like) */
export class StorySideStore {
  constructor(storage, key, opts = {}) {
    this.st = storage;
    this.key = key;
    this.hard = opts.hardChars || 600000;
    this.blocked = false;
    this.lastError = null;
  }
  load(cid) {
    let raw = null;
    try { raw = this.st && this.st.getItem(this.key); } catch (e) { raw = null; }
    if (!raw || raw.length > this.hard + 4096) return null;
    let o = null;
    try { o = JSON.parse(raw); } catch (e) { return null; }
    if (!o || typeof o !== 'object') return null;
    if (o.v > SIDE_VERSION) { this.blocked = true; return null; }
    if (o.v !== SIDE_VERSION || o.cid !== cid || typeof o.eng !== 'string' || !Array.isArray(o.reg)) return null;
    return { T: +o.T || 0, day: +o.day || 0, reg: o.reg, eng: o.eng, life: o.life && typeof o.life === 'object' ? o.life : null };
  }
  /** returns 'ok' | 'big' (over the hard cap: the previous record stays) | 'fail' | 'blocked' */
  write(cid, rec) {
    if (this.blocked) return 'blocked';
    const s = JSON.stringify({ v: SIDE_VERSION, cid, T: Math.round(rec.T || 0), day: rec.day | 0, reg: rec.reg || [], eng: rec.eng || '', life: rec.life || null });
    if (s.length > this.hard) return 'big';
    try { this.st.setItem(this.key, s); return 'ok'; } catch (e) { this.lastError = String(e); return 'fail'; }
  }
  clear() { try { this.st && this.st.removeItem(this.key); } catch (e) { /* ignore */ } this.blocked = false; }
  chars() { try { const r = this.st && this.st.getItem(this.key); return r ? r.length : 0; } catch (e) { return 0; } }
}
