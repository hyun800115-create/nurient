// The shared bits of a staged incident scene: where things are on the street in front of a building, onlookers who
// walk in and watch, game-time timers, cast looks by role, the end (everyone walks away and fades; vehicles leave).
//
// Iso street geometry (buildings face −Y = screen down-left): FRONT = (−0.894, 0.447) points from a building towards
// its street, AXIS = (0.894, 0.447) runs along the street (world +X, screen down-right).

import { faceTo, rng, sdef } from './art.js';

export const FRONT = { x: -0.894, y: 0.447 };
export const AXIS = { x: 0.894, y: 0.447 };
const CROWD = ['shocked', 'point', 'phone', 'shocked', 'think', 'point'];
const UNIFORM = { officer: 'police_officer', crew: 'firefighter', demolisher: 'demolition_worker', builder: 'construction_worker', mover: 'mover' };

export class Scene {
  constructor(view, cmd) {
    this.view = view;
    this.cmd = cmd;
    this.id = cmd.id;
    this.kind = cmd.kind;
    this.inc = cmd.inc || {};
    this.t = 0;
    this.timers = [];
    this.actors = [];
    this.crowd = [];
    this.vehicles = [];
    this.sheets = [];
    this.loops = [];
    this.ended = false;
    this.R = rng(1000 + (this.id | 0) * 7919);
    this.phaseName = '';
  }

  // ------------------------------------------------------------------------------------------ geometry
  /** a building's anchor + its def (footprint, doorPoint) */
  building(id) { const b = this.view.pos(id); if (!b) return null; const d = sdef(b.key) || {}; return Object.assign({ fp: d.footprint || [240, 120], dp: d.doorPoint || [-60, 40], top: d.topPx || 200 }, b); }
  door(b) { return { x: b.x + b.dp[0], y: b.y + b.dp[1] + 6 }; }
  /** in front of building b, d px out on the street, s px along it */
  front(b, d, s = 0) { const r = (b.fp ? b.fp[0] * 0.42 : 100) + d; return { x: b.x + FRONT.x * r + AXIS.x * s, y: b.y + FRONT.y * r + AXIS.y * s }; }
  at(p, d, s = 0) { return { x: p.x + FRONT.x * d + AXIS.x * s, y: p.y + FRONT.y * d + AXIS.y * s }; }

  // ------------------------------------------------------------------------------------------ people
  /** the look of an incident part: the game's person when it has one, else a cityfolk preset by role */
  look(ref, role, k = 0) {
    const P = this.view.ports.people;
    const pid = ref && (ref.pid || (typeof ref === 'string' ? ref : null));
    const seed0 = 977 * ((ref && ref.sid) || 0) + 31 * k + (this.id | 0);
    // a petty thief wears the cityfolk burglar outfit (stripes, a domino mask, the loot sack: comic, not scary)
    if (role === 'culprit' && this.view.culpritPreset) return { preset: this.view.culpritPreset, seed: (pid ? [...pid].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) : seed0) >>> 0, pid };
    // on duty everybody wears the uniform (the person's own look is for off duty): the preset wins over P.look
    const preset = UNIFORM[role];
    if (preset) return { preset, seed: (pid ? [...pid].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 11) : seed0) >>> 0, pid };
    const l = pid && P && P.look ? P.look(pid) : null;
    if (l) return l;
    return { seed: seed0 >>> 0, pid, age: ref && ref.age };
  }

  actor(look, x, y, dir, opts) { const a = this.view.cast.add(look, x, y, dir, opts); this.actors.push(a); return a; }

  /** n onlookers walk in from along the street and watch `target` (shocked / point / phone), standing around `c` */
  gather(n, c, target, opts = {}) {
    const out = [];
    for (let k = 0; k < n; k++) {
      const side = k % 2 ? 1 : -1;
      const s = side * (60 + 46 * Math.floor(k / 2)) + (this.R() - 0.5) * 20;
      const d = (k % 3) * 22 + (this.R() - 0.5) * 14;
      const spot = this.at(c, d, s);
      const from = this.at(spot, 40 + this.R() * 60, side * (360 + this.R() * 160));
      const a = this.actor({ seed: (this.id * 131 + k * 17) >>> 0, age: k % 4 === 3 ? 9 : 30 }, from.x, from.y, 'S');
      a.fade(0);
      const anim = (opts.anims || CROWD)[k % (opts.anims || CROWD).length];
      a.go(spot, { anim: k % 3 === 0 ? 'run' : 'walk', route: false, then: (x) => { x.play(anim, faceTo(x.x, x.y, target.x, target.y)); } });
      a.fadeIn = 0;
      out.push(a);
      this.crowd.push(a);
    }
    return out;
  }

  /** everybody in `list` plays anim facing `target` (cityfolk falls back when the outfit cannot) */
  all(list, anim, target, face) { for (const a of list) if (!a.busy) a.play(anim, target ? faceTo(a.x, a.y, target.x, target.y) : a.dir, face); }

  later(s, fn) { this.timers.push({ t: this.t + s, fn }); }
  /** a little game-time tween (Phaser tweens run on wall-clock time; scenes follow the game clock): step(0..1) */
  tween(dur, step, done) { (this.tws || (this.tws = [])).push({ t: 0, dur: Math.max(0.01, dur), step, done }); }

  // ------------------------------------------------------------------------------------------ lifecycle
  start() {}
  phase(name, inc) { this.phaseName = name; if (inc) this.inc = inc; }

  update(dt) {
    this.t += dt;
    if (this.timers.length) {
      const due = this.timers.filter((x) => x.t <= this.t);
      if (due.length) { this.timers = this.timers.filter((x) => x.t > this.t); for (const d of due) d.fn(); }
    }
    if (this.tws && this.tws.length) {
      for (const w of this.tws.slice()) {
        w.t += dt;
        const k = Math.min(1, w.t / w.dur);
        w.step(k);
        if (k >= 1) { this.tws.splice(this.tws.indexOf(w), 1); if (w.done) w.done(); }
      }
    }
    for (const a of this.actors) if (a.fadeIn !== undefined && a.fadeIn < 1) { a.fadeIn = Math.min(1, a.fadeIn + dt * 2.5); a.fade(a.fadeIn); }
    for (const v of this.vehicles) v.update(dt);
    if (this.leaving) this.leaveTick(dt);
  }

  /** the end: people wander off and fade, vehicles drive away; destroy() when all are gone (or after 8 s) */
  end() {
    if (this.leaving) return;
    this.leaving = 0.001;
    for (const a of this.actors) {
      if (a.keep) continue;
      const side = a.x < (this.anchor ? this.anchor.x : a.x) ? -1 : 1;
      const to = this.at({ x: a.x, y: a.y }, 30, side * (300 + this.R() * 160));
      a.go(to, { anim: 'walk', route: false });
    }
    for (const v of this.vehicles) if (!v.parkedForGood) { v.setSiren(0); v.drive([{ x: v.x + AXIS.x * 700, y: v.y + AXIS.y * 700 }]); }
    for (const l of this.loops) l.stop();
    this.loops = [];
  }

  leaveTick(dt) {
    this.leaving += dt;
    const k = Math.max(0, 1 - Math.max(0, this.leaving - 2.5) / 2);
    for (const a of this.actors) if (!a.keep) a.fade(k);
    for (const v of this.vehicles) if (this.leaving > 4) v.show(false);
    if (this.leaving > 5) this.done = true;
  }

  destroy() {
    for (const a of this.actors) this.view.cast.remove(a);
    for (const v of this.vehicles) v.destroy();
    for (const s of this.sheets) this.view.sheets.release(s);
    for (const l of this.loops) l.stop();
    for (const o of this.objs || []) o.destroy();
    this.objs = []; this.tws = [];
    this.actors = []; this.vehicles = []; this.sheets = []; this.loops = []; this.crowd = [];
  }

  /** a one-shot / looped sheet that this scene owns */
  sheet(key, x, y, opts) { const s = this.view.sheets.play(key, x, y, opts); if (s && !(opts && opts.once)) this.sheets.push(s); return s; }
  unsheet(s) { if (!s) return; const i = this.sheets.indexOf(s); if (i >= 0) this.sheets.splice(i, 1); this.view.sheets.release(s); }
}
