// Story saves (docs/v5_v8_plan.md §6.1 "Save slice", §8). Two records:
//  1. the main-save slice `story` (v1, cap 1 KB): what must survive even when the side record is lost — the life
//     milestones seen, the first couple, names the chief chose, the garden stones, wishes, the last happening;
//  2. the side record SAVE_KEY + '.story' (v1, ≤ 450 K chars, hard 600 K): { v, cid, T, day, reg, eng } with the
//     packed engine (pack15). Written at the day change, on pagehide and visibilitychange: hidden — never on the 5 s
//     autosave. Pure: storage is passed in (localStorage in the game, a Map in the tests).

import { sanitizeLifeState } from './model/lifeRules.js';

export const SLICE_KEY = 'story';
export const SLICE_VERSION = 1;
export const SLICE_CAP = 1024;
export const SIDE_SUFFIX = '.story';
export const SIDE_VERSION = 1;

/** the main-save slice from the host's state (capped to SLICE_CAP JSON chars) */
export function makeSlice(st) {
  const life = st.life || {};
  const o = {
    v: SLICE_VERSION, day: st.day | 0, ok: st.ok ? 1 : 0, chars: st.chars | 0,
    life: { seen: life.seen || {}, firstCouple: life.firstCouple || [], names: (life.names || []).slice(-40), garden: (life.garden || []).slice(-6),
      gardenOld: (life.gardenOld || []).slice(-24), wishes: life.wishes || {}, wishActive: life.wishActive === undefined ? -1 : life.wishActive, paperFrom: life.paperFrom | 0 },
    happen: { last: st.happen && Number.isFinite(st.happen.last) ? Math.round(st.happen.last) : -1 },
  };
  return capSlice(o);
}

/** keep the slice under the cap: the oldest chosen names, then old garden names, go first */
export function capSlice(o, cap = SLICE_CAP) {
  let s = JSON.stringify(o);
  while (s.length > cap && o.life.names.length) { o.life.names.shift(); s = JSON.stringify(o); }
  while (s.length > cap && o.life.gardenOld.length) { o.life.gardenOld.shift(); s = JSON.stringify(o); }
  while (s.length > cap && Object.keys(o.life.wishes).length) { delete o.life.wishes[Object.keys(o.life.wishes)[0]]; s = JSON.stringify(o); }
  return o;
}

/** Save.js sanitizer for the slice (pure; null = drop it) */
export function sanitizeSlice(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (raw.v !== SLICE_VERSION) return null;
  const life = sanitizeLifeState(raw.life);
  const o = { v: SLICE_VERSION, day: Number.isFinite(raw.day) ? Math.max(0, Math.floor(raw.day)) : 0, ok: raw.ok ? 1 : 0, chars: Number.isFinite(raw.chars) ? Math.max(0, raw.chars | 0) : 0,
    life: { seen: life.seen, firstCouple: life.firstCouple, names: life.names, garden: life.garden, gardenOld: life.gardenOld, wishes: life.wishes, wishActive: life.wishActive, paperFrom: life.paperFrom },
    happen: { last: raw.happen && Number.isFinite(raw.happen.last) ? Math.round(raw.happen.last) : -1 } };
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
    return { T: +o.T || 0, day: +o.day || 0, reg: o.reg, eng: o.eng };
  }
  /** returns 'ok' | 'big' (over the hard cap: the previous record stays) | 'fail' | 'blocked' */
  write(cid, rec) {
    if (this.blocked) return 'blocked';
    const s = JSON.stringify({ v: SIDE_VERSION, cid, T: Math.round(rec.T || 0), day: rec.day | 0, reg: rec.reg || [], eng: rec.eng || '' });
    if (s.length > this.hard) return 'big';
    try { this.st.setItem(this.key, s); return 'ok'; } catch (e) { this.lastError = String(e); return 'fail'; }
  }
  clear() { try { this.st && this.st.removeItem(this.key); } catch (e) { /* ignore */ } this.blocked = false; }
  chars() { try { const r = this.st && this.st.getItem(this.key); return r ? r.length : 0; } catch (e) { return 0; } }
}
