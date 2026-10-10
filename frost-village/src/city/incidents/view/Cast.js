// The people of a staged incident: actors on paper-doll rigs (ports.dolls; cityfolk anims after patch P5), walking /
// running / fleeing along routes (ports.roads.route, straight lines for short hops), playing anims with the cityfolk
// fallbacks, facing each other, speaking through the game's Bubbles (ports.say / ports.emote: VillageVoice speaks them).
//
// Rig contract (ports.dolls.make(look) -> rig): play(anim, dir) · setFace(expr|null) · place(x, y, depth, alpha) ·
//   visible(on) · update(ms) · anim (what really plays) · frame · groundSpeed(anim, dir) -> px/s | null ·
//   nozzle(dir, frame) -> [x, y, ux, uy] | null · headTop (px, negative) · release()
// An actor has the shape the game's Bubbles follows: { alive, x, y, headTop, sprite: { visible, scaleY } }.

import { dirOf } from './art.js';

const SPEED = { walk: 62, run: 128, flee: 128, arrested_walk: 34, carry_box: 40 };
const MOVING = { walk: 1, run: 1, flee: 1, arrested_walk: 1, carry_box: 1 };

export class Actor {
  constructor(cast, look, x, y, dir = 'S', opts = {}) {
    this.cast = cast;
    this.look = look;
    this.rig = cast.ports.dolls ? cast.ports.dolls.make(look) : null;
    this.alive = true;
    this.x = x; this.y = y;
    this.dir = dir;
    this.anim = 'idle';
    this.face = null;
    this.path = null;
    this.speed = 0;
    this.alpha = 1;
    this.sprite = { visible: true, scaleY: 1 };
    this.headTop = (this.rig && this.rig.headTop) || (opts.kid ? -92 : -128);
    this.role = opts.role || '';
    this.dz = opts.dz || 0;
    this.depth = null;           // a fixed depth (a driver in a cab, an inmate in the cell)
    this.play('idle', dir);
  }

  get busy() { return !!this.path; }
  set(x, y) { this.x = x; this.y = y; this.place(); return this; }
  place() { if (this.rig) this.rig.place(Math.round(this.x), Math.round(this.y), this.depth !== null ? this.depth : this.y + this.dz, this.alpha); }

  play(anim, dir, face) {
    if (dir) this.dir = dir;
    this.anim = anim;
    if (this.rig) { this.rig.play(anim, this.dir); if (face !== undefined) this.setFace(face); }
    this.place();
    return this;
  }
  setFace(face) { this.face = face || null; if (this.rig && this.rig.setFace) this.rig.setFace(this.face); return this; }
  turn(dir) { this.dir = dir; if (this.rig) this.rig.play(this.anim, dir); return this; }
  faceTo(x, y) { return this.turn(dirOf(x - this.x, y - this.y)); }

  /** walk / run along points (or to one point); opts: { anim, speed, then(actor), route: bool } */
  go(to, opts = {}) {
    const anim = opts.anim || 'walk';
    let pts = Array.isArray(to) ? to.slice() : [to];
    if (!Array.isArray(to) && opts.route !== false) pts = this.cast.route(this, to) || pts;
    this.path = pts.map((p) => ({ x: p.x, y: p.y }));
    this.moveAnim = anim;
    this.speed = opts.speed || 0;
    this.then = opts.then || null;
    this.play(anim, this.dir, opts.face);
    return this;
  }
  stop(anim = 'idle', dir) { this.path = null; this.then = null; return this.play(anim, dir || this.dir); }

  say(key, vars, pick, emote, dur) { this.cast.say(this, key, vars, pick, emote, dur); return this; }
  emote(key, dur) { this.cast.emote(this, key, dur); return this; }

  update(dt) {
    if (!this.alive) return;
    if (this.path && this.path.length) {
      const p = this.path[0];
      const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy);
      const gs = this.rig && this.rig.groundSpeed ? this.rig.groundSpeed(this.moveAnim, this.dir) : null;
      const v = (this.speed || gs || SPEED[this.moveAnim] || 60) * (this.cast.pace || 1);
      if (d <= v * dt + 0.5) {
        this.x = p.x; this.y = p.y;
        this.path.shift();
        if (!this.path.length) {
          this.path = null;
          const cb = this.then; this.then = null;
          if (MOVING[this.anim]) this.play('idle', this.dir);
          if (cb) cb(this);
        }
      } else {
        this.x += (dx / d) * v * dt; this.y += (dy / d) * v * dt;
        const nd = dirOf(dx, dy);
        if (nd !== this.dir) this.turn(nd);
      }
    }
    if (this.rig) { this.rig.update(dt * 1000); this.place(); }
  }

  fade(a) { this.alpha = a; this.place(); }
  show(on) { this.sprite.visible = !!on; if (this.rig) this.rig.visible(!!on); }
  destroy() { this.alive = false; this.path = null; if (this.rig) this.rig.release(); this.rig = null; }
}

export class Cast {
  constructor(view, ports) {
    this.view = view;
    this.ports = ports;
    this.actors = new Set();
    this.pace = 1;
  }

  add(look, x, y, dir, opts) { const a = new Actor(this, look, x, y, dir, opts); this.actors.add(a); return a; }
  remove(a) { if (!a) return; this.actors.delete(a); this.ports.say && this.clearBubbles(a); a.destroy(); }
  clearBubbles(a) { const P = this.ports; if (P.clearSay) P.clearSay(a); }

  /** a walking route between two points: the game's walk graph for long hops, a straight line for short ones */
  route(from, to) {
    const d = Math.hypot(to.x - from.x, (to.y - from.y) * 2);
    if (d < 260 || !this.ports.roads || !this.ports.roads.route) return null;
    const r = this.ports.roads.route({ x: from.x, y: from.y }, { x: to.x, y: to.y }, 'walk');
    if (!r || !r.length) return null;
    const pts = r.slice();
    pts.push({ x: to.x, y: to.y });
    return pts;
  }

  say(a, key, vars, pick, emote, dur) {
    const P = this.ports, V = this.view;
    const text = V.text(key, vars, pick);
    if (P.say) P.say(a, text, emote || null, dur || 2.6);
  }
  emote(a, key, dur) { const P = this.ports; if (P.emote) P.emote(a, key, dur || 1.8); }

  update(dt) { for (const a of this.actors) a.update(dt); }
  clear() { for (const a of Array.from(this.actors)) this.remove(a); }
  get count() { return this.actors.size; }
}
