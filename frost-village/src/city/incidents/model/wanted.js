// The wanted board (현상수배 게시판): 3 poster slots mirrored from the story's 'wanted' events. Pure.
//
//   story:wanted { op: 'post', incident, who, whoPid?, slot, reward, item, anonymous }  -> a poster (silhouette when
//                anonymous: nobody saw the face; the chief's E12 mission or a tip shows the face)
//   story:wanted { op: 'remove', incident, slot }                                       -> the poster comes down
//   tip(inc)     the face is known now (the poster flips to the portrait just before the arrest)

import { dayOf } from './time.js';

export class WantedBoard {
  constructor(saved) {
    this.slots = [null, null, null];
    for (const r of (Array.isArray(saved) ? saved : [])) {
      if (!Array.isArray(r)) continue;
      const slot = r[0] | 0;
      if (slot < 0 || slot > 2 || this.slots[slot]) continue;
      this.slots[slot] = { slot, inc: r[1] | 0, pid: typeof r[2] === 'string' ? r[2] : null, reward: Math.max(0, r[3] | 0), item: typeof r[4] === 'string' ? r[4] : null, day: r[5] | 0, anon: !!r[6] };
    }
  }

  /** returns the poster record (or null when no slot / already up) */
  post(ev, T, pid) {
    const inc = ev.incident | 0;
    if (this.find(inc)) return null;
    let slot = Number.isInteger(ev.slot) && ev.slot >= 0 && ev.slot < 3 && !this.slots[ev.slot] ? ev.slot : this.slots.indexOf(null);
    if (slot < 0) return null;
    const rec = { slot, inc, pid: pid || null, sid: Number.isInteger(ev.who) ? ev.who : -1, reward: Math.max(0, ev.reward | 0), item: typeof ev.item === 'string' ? ev.item : null, day: dayOf(T), anon: ev.anonymous !== false };
    this.slots[slot] = rec;
    return rec;
  }

  remove(ev) {
    const inc = ev.incident | 0;
    for (let i = 0; i < 3; i++) if (this.slots[i] && this.slots[i].inc === inc) { const r = this.slots[i]; this.slots[i] = null; return r; }
    return null;
  }

  /** the culprit's face becomes known (a tip / the chief identified them) */
  tip(inc) { const r = this.find(inc); if (r && r.anon) { r.anon = false; return r; } return null; }

  find(inc) { return this.slots.find((r) => r && r.inc === inc) || null; }
  list() { return this.slots.filter(Boolean).map((r) => Object.assign({}, r)); }
  serialize() { return this.slots.filter(Boolean).map((r) => [r.slot, r.inc, r.pid || 0, r.reward, r.item || 0, r.day, r.anon ? 1 : 0]); }
}
