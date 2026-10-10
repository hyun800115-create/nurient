// The module's own vehicle set piece (fire truck, police car, moving truck, excavator, dump truck) — used where the
// vehicles module's dispatch (ports.vehicles.dispatch, v8 fleet) does not drive it: the lab, previews, demolition
// on the plot and the moving truck's unload. Same draw rules as assets/vehicles (vehicles.md §"How the game uses
// them"): shadow ellipse, the frame `{anim}_{dir}_{i}` (SE / NE rendered, SW / NW mirrored about the anchor), a driver
// doll at the seat, then the `over_*` frame; beacons with fx_city siren glows at `sirenPoint`; the dump truck's cargo
// overlay (civic `cargoOverlay`).

import { cdef, tex, shadowTex, axisHeading, MIRROR } from './art.js';

export const SPEED = { fire_truck: 230, police_car: 250, moving_truck: 170, excavator: 90, dump_truck: 160 };

export class Vehicle {
  constructor(view, key, x, y, heading = 'SE', opts = {}) {
    this.view = view;
    this.scene = view.scene;
    this.key = key;
    this.def = cdef(key);
    this.x = x; this.y = y;
    this.heading = heading;
    this.anim = 'idle';
    this.frame = 0; this.t = 0; this.once = false;
    this.path = null; this.then = null;
    this.speed = opts.speed || SPEED[key] || 160;
    this.siren = 0;               // 0 off, 1 red (fire), 2 red + blue (police)
    this.cargo = false;
    this.alive = !!this.def;
    this.visible = true;
    if (!this.def) return;
    const S = this.scene;
    this.shadow = S.add.image(x, y, shadowTex(S)).setOrigin(0.5, 0.5);
    this.body = S.add.image(x, y, '__DEFAULT');
    this.over = this.def.overlay ? S.add.image(x, y, '__DEFAULT').setVisible(false) : null;
    this.cargoImg = this.def.cargoOverlay ? S.add.image(x, y, '__DEFAULT').setVisible(false) : null;
    if (opts.driver) this.driver = view.cast.add(opts.driver, x, y, 'SE', { role: 'driver' });
    this.glows = [];
    this.refresh(true);
  }

  get dir() { return MIRROR[this.heading] ? MIRROR[this.heading] : this.heading; }
  get flip() { return !!MIRROR[this.heading]; }

  /** a manifest point of this vehicle in world px (mirrored for SW / NW); name e.g. 'hosePoint', 'sirenPoint' */
  point(name, i) {
    const d = this.def && this.def[name];
    if (!d) return { x: this.x, y: this.y };
    let p = d[this.dir];
    if (p === undefined && d[this.anim]) { const q = d[this.anim][this.dir]; p = q ? q[Math.min(this.frame, q.length - 1)] : null; }
    else if (p && Array.isArray(p[0])) p = p[i || 0];
    if (!p) return { x: this.x, y: this.y };
    return { x: this.x + (this.flip ? -p[0] : p[0]), y: this.y + p[1] };
  }

  setAnim(anim, once = false) {
    if (!this.def || !this.def.anims[anim]) anim = 'idle';
    if (anim === this.anim && !once) return this;
    this.anim = anim; this.frame = 0; this.t = 0; this.once = once; this.doneAnim = false;
    this.refresh(true);
    return this;
  }
  setHeading(h) { if (h !== this.heading) { this.heading = h; this.refresh(true); } return this; }
  setSiren(n) { this.siren = n; this.syncGlows(); return this; }
  setCargo(on) { this.cargo = !!on; this.refresh(true); return this; }

  /** drive along points (world px); then() when parked */
  drive(pts, then) {
    this.path = pts.map((p) => ({ x: p.x, y: p.y }));
    this.then = then || null;
    this.setAnim('move');
    return this;
  }

  refresh(force) {
    if (!this.def || !this.alive) return;
    const D = this.def, A = D.anims[this.anim] || D.anims.idle;
    const fn = (D.frameName || '{anim}_{dir}_{i}').replace('{anim}', this.anim).replace('{dir}', this.dir).replace('{i}', this.frame);
    const tk = tex(D.atlas, fn);
    const ax = D.anchor[0], ay = D.anchor[1];
    const ox = this.flip ? 1 - ax : ax;
    const bob = (A.bobPx && A.bobPx[this.frame]) || 0;
    const x = Math.round(this.x), y = Math.round(this.y);
    const vis = this.visible && !!tk;
    if (tk) this.body.setTexture(tk, fn);
    this.body.setOrigin(ox, ay).setFlipX(this.flip).setPosition(x, y + bob).setDepth(this.y).setVisible(vis);
    // shadow ellipse (manifest shadow[dir] = [w, h, angle deg])
    const sh = D.shadow && D.shadow[this.dir];
    if (sh) this.shadow.setPosition(x, y).setDisplaySize(sh[0], sh[1]).setAngle(this.flip ? -sh[2] : sh[2]).setDepth(this.y - 40).setVisible(this.visible);
    // the driver in the cab (back views: standing frame at seatsStand) and the overlay frame over the legs
    if (this.driver) {
      const seat = (D.seatsStand && D.seatsStand[this.dir]) || (D.seats && D.seats[this.dir]);
      const s = seat ? seat[D.driverSeat || 0] : [0, 0];
      this.driver.x = x + (this.flip ? -s[0] : s[0]); this.driver.y = y + s[1] + bob;
      this.driver.depth = this.y + 0.5;
      this.driver.dir = this.heading; this.driver.play('idle', this.heading);
      this.driver.show(this.visible);
    }
    if (this.over) {
      const ofn = D.overlay.frameName.replace('{anim}', this.anim).replace('{dir}', this.dir).replace('{i}', this.frame);
      const otk = tex(D.overlay.atlas || D.atlas, ofn);
      if (otk && this.driver) this.over.setTexture(otk, ofn).setOrigin(ox, ay).setFlipX(this.flip).setPosition(x, y + bob).setDepth(this.y + 1).setVisible(this.visible);
      else this.over.setVisible(false);
    }
    if (this.cargoImg) {
      const C = D.cargoOverlay;
      const ok = this.cargo && C.anims.indexOf(this.anim) >= 0;
      const cfn = ok ? C.frameName.replace('{anim}', this.anim).replace('{dir}', this.dir).replace('{i}', this.frame % (C.frames[this.anim] || 1)) : null;
      const ctk = cfn ? tex(D.atlas, cfn) : null;
      if (ctk) this.cargoImg.setTexture(ctk, cfn).setOrigin(ox, ay).setFlipX(this.flip).setPosition(x, y + bob).setDepth(this.y + 0.6).setVisible(this.visible);
      else this.cargoImg.setVisible(false);
    }
    this.syncGlows();
  }

  syncGlows() {
    const want = this.visible && this.siren ? this.siren : 0;
    const pool = this.view.sheets;
    while (this.glows.length > want) pool.release(this.glows.pop());
    const p = this.point('sirenPoint');
    for (let k = 0; k < want; k++) {
      let g = this.glows[k];
      if (!g) { g = pool.play(k === 0 ? 'fx_siren_glow_red' : 'fx_siren_glow_blue', p.x, p.y, { frame: k ? 4 : 0, depth: this.y + 2, add: true }); if (!g) break; this.glows.push(g); }
      g.setPosition(Math.round(p.x + (k ? 10 : -10) * (this.flip ? -1 : 1)), Math.round(p.y)).setDepth(this.y + 2);
    }
  }

  update(dt) {
    if (!this.def || !this.alive) return;
    let moved = false;
    if (this.path && this.path.length) {
      const p = this.path[0];
      const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy);
      const v = this.speed * (this.view.pace || 1);
      if (d <= v * dt + 0.5) { this.x = p.x; this.y = p.y; this.path.shift(); }
      else { this.x += (dx / d) * v * dt; this.y += (dy / d) * v * dt; if (d > 4) this.setHeading(axisHeading(dx, dy)); }
      moved = true;
      if (!this.path.length) { this.path = null; this.setAnim(this.siren ? (this.def.anims.siren ? 'siren' : 'idle') : 'idle'); const cb = this.then; this.then = null; if (cb) cb(this); }
    }
    const A = this.def.anims[this.anim];
    this.t += dt;
    const step = 1 / ((A && A.fps) || 6);
    let changed = moved;
    while (this.t >= step) {
      this.t -= step;
      if (this.once && this.frame >= A.frames - 1) { this.doneAnim = true; this.t = 0; break; }
      this.frame = (this.frame + 1) % Math.max(1, A.frames);
      changed = true;
    }
    if (changed) this.refresh();
  }

  show(on) { this.visible = !!on; this.refresh(true); }
  destroy() {
    this.alive = false;
    for (const g of this.glows) this.view.sheets.release(g);
    this.glows = [];
    for (const o of [this.shadow, this.body, this.over, this.cargoImg]) if (o) o.destroy();
    if (this.driver) this.view.cast.remove(this.driver);
    this.driver = null;
  }
}
