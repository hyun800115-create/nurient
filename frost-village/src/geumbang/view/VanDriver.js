// VanDriver (view, plan §5.5): one model van -> the Van art + its driver + the Courier doorstep scene. Headings are
// held ≥ 0.12 s (no flicker at lane joints); a 90° corner between two drawn diagonals shows the gb_van_turn frame of
// the 45° heading in between for 0.28 s (S, E, N, or W = mirrored E). Loading at bay 1 opens the rear doors (unload
// patch), the curb plays the courier's timeline (door / unload patches from the beats), hazards blink at the curb.
// Vans more than 360 px outside the view are not drawn (the model drives them all the same).

import { Van } from './Van.js';
import { Courier } from './Courier.js';
import { gt } from '../strings.js';
import { hashStr } from '../model/rng.js';

const BETWEEN = { 'SE>NE': 'E', 'NE>SE': 'E', 'SW>NW': 'W', 'NW>SW': 'W', 'SE>SW': 'S', 'SW>SE': 'S', 'NE>NW': 'N', 'NW>NE': 'N' };
const THANKS = ['gb_thanks_1', 'gb_thanks_1', 'gb_thanks_snow'];

export class VanDriver {
  constructor(view, id) {
    this.view = view; this.id = id;
    this.art = new Van(view);
    this.looks = { day: { preset: 'gb_driver', seed: 700 + id * 13, name: 'gb_crew_d' + id }, night: { preset: 'gb_night', seed: 900 + id * 17, name: id === 1 ? 'gb_crew_n1' : 'gb_crew_n2' } };
    this.driver = null; this.courier = null; this.shift = null;
    this.dk = 'SE'; this.cand = null; this.candT = 0; this.turn = null; this.turnT = 0;
    this.patchT = 0; this.hidden = true; this.wasCurb = false;
    this.tl = null; this.hids = new Map(); this.firsts = new Set();
  }

  rigs(night) {
    const shift = night ? 'night' : 'day';
    if (this.shift === shift && this.driver) return;
    if (this.driver) this.driver.destroy();
    if (this.courier) this.courier.destroy();
    const look = this.looks[shift];
    this.driver = this.view.dolls.make(look);
    this.courier = new Courier(this.view, 'van:' + this.id, look);
    this.shift = shift;
  }

  /** the driver waves off ("다녀오겠습니다!") on the first run of a day / the first order */
  dispatched(e) {
    if (!this.courier || this.hidden) return;
    const v = this.lastV;
    if (!v) return;
    if (e.first || this.view.t - (this.saidT || -99) > 90) { this.saidT = this.view.t; this.courier.say(null, gt(e.first ? 'gb_driver_safe' : 'gb_shift_go', null, this.view.lang()), v.x, v.y - 60, 1.8, 'go' + this.view.t); }
  }

  /** v: the model's Van (live object) */
  sync(v, dt) {
    const view = this.view, m = view.m;
    this.lastV = v;
    if (!view.near(v.x, v.y, 360)) { if (!this.hidden) this.hide(); return; }
    this.hidden = false;
    this.rigs(!!v.night);
    // the heading: held ≥ 0.12 s; a quarter turn between two diagonals shows the 45° corner frame
    const want = v.dk;
    if (want !== this.dk) {
      if (this.cand !== want) { this.cand = want; this.candT = 0; }
      this.candT += dt;
      if (this.candT >= 0.12 || v.v < 0.05) {
        const b = BETWEEN[this.dk + '>' + want];
        if (b && v.v > 0.25 && v.st !== 'reverse') { this.turn = b; this.turnT = 0.28; }
        this.dk = want; this.cand = null;
      }
    } else this.cand = null;
    let dk = this.dk;
    if (this.turnT > 0) { this.turnT -= dt; dk = this.turn; }
    const vv = { x: v.x, y: v.y, dk, v: v.v, rev: v.rev };
    let patch = null, driverIn = true;
    const curb = v.st === 'curb' && v.tl;
    if (curb) {
      if (v.tl !== this.tl) this.newTimeline(v);
      const r = this.courier.draw(this.ctx(v, vv, dt));
      patch = r.patch; driverIn = r.driverIn;
      this.wasCurb = true;
      this.patchT = 0;
    } else {
      if (this.wasCurb) { this.courier.hideAll(); this.courier.reset(); this.wasCurb = false; }
      else this.courier.hideAll();
      this.courier.tickBubble(dt);
      if (v.st === 'load') { this.patchT = Math.min(1, this.patchT + dt * 2.5); patch = { anim: 'unload', f: Math.min(3, Math.floor(this.patchT * 4)) }; }
      else if (this.patchT > 0) { this.patchT = Math.max(0, this.patchT - dt * 3); patch = this.patchT > 0.05 ? { anim: 'unload', f: Math.min(3, Math.floor(this.patchT * 4)) } : null; }
      if (v.st === 'break') driverIn = false;
    }
    this.art.sync(vv, { night: view.night(), lang: view.lang(), driver: this.driver, driverIn, patch, dt, moving: v.v > 0.12, hazard: !!curb, t: view.t });
  }

  /** a new stop: who lives at each door of it (the orders leave the van as they are handed over) */
  newTimeline(v) {
    this.tl = v.tl;
    this.hids.clear(); this.firsts.clear();
    for (const o of v.load) { if (!this.hids.has(o.aid)) this.hids.set(o.aid, o.hid); if (o.first) this.firsts.add(o.aid); }
    this.courier.reset();
  }

  ctx(v, vv, dt) {
    const view = this.view, m = view.m, L = view.lang();
    if (!this._ctx) {
      this._ctx = {
        addr: (aid) => m.book.get(aid),
        hidOf: (aid) => this.hids.get(aid) || null,
        line: (aid, hid, b) => this.line(aid, hid, b),
        joy: (x, y, b) => this.joy(x, y, b),
      };
    }
    const c = this._ctx;
    c.tl = v.tl; c.t = v.tlT; c.van = vv; c.vanArt = this.art; c.dt = dt; c.night = view.night(); c.lang = L; c.sled = false;
    c.quiet = !!(m.quiet && m.quiet());
    return c;
  }

  /**
   * the resident's line at the door (plan §7.1, critique M7): the first order; a late parcel at a house with children
   * ("오늘은 금방이 아니라 조금방이네~" — the driver answers); the designer's joke at houses with children, two bubbles:
   * "엄마, 금방 뭐가 왔어?" → "금방이 왔지~!"; grandmas; the chief standing by; snow. A [line, answer] pair is two bubbles.
   */
  line(aid, hid, b) {
    const L = this.view.lang(), m = this.view.m;
    if (this.firsts.has(aid)) return gt('gb_first_thanks', null, L);
    const a = m.book.get(aid), hh = a && a.hh ? a.hh.find((h) => h.hid === hid) || a.hh[0] : null;
    const people = (hh && hh.people) || [];
    const kid = people.some((p) => p.kind === 'child'), elder = people.some((p) => p.kind === 'elder');
    const ids = this.handIds(b) || [];
    const late = ids.some((id) => this.view.late && this.view.late.get(id));
    const snow = this.view.P.weather && this.view.P.weather.snow && this.view.P.weather.snow();
    const h = hashStr(String(aid) + (b && b.t0) + (ids[0] || ''));
    if (late && kid) return [gt('gb_late_kid', null, L), gt('gb_late_driver', null, L), 'driver'];
    if (kid && h % 3 !== 2) return [gt('gb_kid_q', null, L), gt('gb_kid_a', null, L)];
    if (elder) return gt('gb_thanks_elder', null, L);
    const ch = this.view.P.view && this.view.P.view.chief ? this.view.P.view.chief() : null, d = a ? a.door : null;
    if (ch && d && Math.hypot(ch.x - d.x, (ch.y - d.y) * 2) < 520) return gt('gb_thanks_chief', null, L);
    if (late) return gt('gb_late_driver', null, L);
    return gt(snow ? 'gb_thanks_snow' : THANKS[h % 2], null, L);
  }

  /** the parcel ids handed over just before a joy beat */
  handIds(b) {
    const tl = this.tl;
    if (!tl || !b) return null;
    for (let k = tl.beats.indexOf(b) - 1; k >= 0; k--) if (tl.beats[k].k === 'hand') return tl.beats[k].ids;
    return null;
  }

  /** the coins of the parcels just handed over pop at the door (+ the resident's hearts are the Courier's) */
  joy(x, y, b) {
    const tl = this.tl;
    if (!tl) return;
    let ids = null;
    for (let k = tl.beats.indexOf(b) - 1; k >= 0; k--) if (tl.beats[k].k === 'hand') { ids = tl.beats[k].ids; break; }
    let n = 0;
    for (const id of ids || []) n += this.view.coins.get(id) || 0;
    this.view.coinPop(x + 46, y - 58, n);
  }

  hide() {
    this.hidden = true;
    this.art.hide();
    if (this.driver) this.driver.visible(false);
    if (this.courier) this.courier.hideAll();
  }

  objects() { return this.art.objects() + (this.courier ? this.courier.objects() : 0); }
  destroy() { this.art.destroy(); if (this.driver) this.driver.destroy(); if (this.courier) this.courier.destroy(); }
}
