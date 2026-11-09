// (v4.3 a2.2, designer: "물류창고 직원 채용과 지게차 등등도 없는데") the 서리 물류창고's forklift (assets/logistics `lgx_forklift`,
// manifest characters.forklift): it drives the building's forkliftPath (logistics_center: food rack -> dock 2 -> dock 1 ->
// tools rack -> back), lifts at every pick / drop point (anim lift), carries a crate on the forks from a pick to the
// next drop, and backs out of the docks (`reverse`). A depot hand sits in its seat (officefolk sit_idle; a standing
// stand-in while that page is away). It works while the depot has stock or a sleigh is on its way / unloading, else it
// rests at the food rack. Drawn only while the depot is open (revealed), like the depot's workers; the atlas (one page,
// ~3.8 MiB) is asked for only once a forklift has been bought.

import { Assets } from '../core/Assets.js';
import { Staff } from './staff/Staff.js';
import { DIRS8 } from '../core/Iso.js';
import { Residency } from '../core/Residency.js';

const KEY = 'lgx_forklift';
const SPEED = 72;                  // px / s along the lanes
const BASE = { SE: 'SE', NE: 'NE', SW: 'SE', NW: 'NE' };     // the drawn dirs (SW / NW: mirrored)
const ANIM = { idle: { n: 2, fps: 6, loop: true }, move: { n: 4, fps: 10, loop: true }, lift: { n: 6, fps: 8, loop: false } };

export class DepotForklift {
  constructor(gs, building) {
    this.gs = gs;
    this.b = building;
    this.path = ((building.def && building.def.forkliftPath) || []).filter((n) => n && Array.isArray(n.point));
    this.i = 0;
    const p0 = this.path[0] ? this.path[0].point : [0, 0];
    this.x = building.x + p0[0]; this.y = building.y + p0[1];
    this.face = (this.path[0] && this.path[0].dir) || 'NE';
    this.band = 'mid';
    this.state = 'wait'; this.t = 2;
    this.anim = 'idle'; this.fi = 0; this.ft = 0;
    this.loaded = false;
    this.ready = false;
    this.retryT = 0;
    // the atlas page arrives later than loadFragment's callback: make the forklift when it does
    this.onArrive = () => { if (!this.ready && !this.dead) this.make(); };
    Assets.arrivals.push(this.onArrive);
    this.load();
  }

  get C() { return (Assets.m.characters && Assets.m.characters.forklift) || {}; }

  // ((the page is an on-demand one (Residency.want): asked for while the depot is open, it goes when nobody wants it)
  load() { Assets.loadFragment(this.gs, 'logistics', { only: [KEY] }, () => { if (Residency.gs) Residency.want(KEY); this.make(); }); }

  make() {
    if (this.ready || this.dead) return;
    const gs = this.gs;
    if (!gs.sys || !gs.textures.exists(KEY)) return;
    this.ready = true;
    const C = this.C, an = C.anchor || [0.52439, 0.80102];
    this.body = gs.add.image(this.x, this.y, KEY, 'idle_NE_0').setOrigin(an[0], an[1]).setVisible(false);
    this.over = gs.add.image(this.x, this.y, KEY, 'over_idle_NE_0').setOrigin(an[0], an[1]).setVisible(false);
    const ck = Assets.pick('cardboard_box_m', 'cardboard_box_s', 'crate_small', 'item_can');
    this.cargo = ck ? Assets.image(gs, this.x, this.y, ck).setOrigin(0.5, 0.85).setVisible(false) : null;
    if (this.cargo) this.cargo.setScale(0.8);
    // the driver: a depot hand seated on the forklift (positioned here every frame; no desk routine)
    const d = new Staff(gs, this.b.sys, 'depot', 4711, this.x, this.y, { x: this.x, y: this.y });
    const ai = gs.agents ? gs.agents.indexOf(d) : -1;
    if (ai >= 0) gs.agents.splice(ai, 1);
    d.noSeparate = true;
    d.inside = true;
    this.seat = { x: this.x, y: this.y, dir: 'NE', band: 'front', shadowDy: 0 };
    d.sitDown(this.seat, 'sit_idle');
    d.sprite.setVisible(false);
    if (d.shadow) d.shadow.setVisible(false);
    this.driver = d;
  }

  /** something to move: stock on the racks, or a sleigh on its way / unloading */
  busy() {
    const S = this.b.sys;
    if (S.model && S.model.total() > 0) return true;
    return (S.sleighs || []).some((s) => s.state === 'go' || s.state === 'unload');
  }

  startLeg() {
    const P = this.path, n = P[this.i], nx = P[(this.i + 1) % P.length];
    if (this.i === 0 && !this.busy()) { this.state = 'wait'; this.t = 3; this.setAnim('idle'); return; }
    // (back to work at the food rack: pick a pallet there first)
    if (this.i === 0 && this.state === 'wait' && n.action === 'pick') { this.state = 'act'; this.act = 'pick'; this.face = n.dir || this.face; this.t = 1.15; this.setAnim('lift'); return; }
    this.to = { x: this.b.x + nx.point[0], y: this.b.y + nx.point[1] };
    this.face = n.reverse ? n.dir : (n.legDir || n.dir);
    this.band = n.legBand || 'mid';
    this.state = 'drive';
    this.setAnim('move');
  }

  setAnim(a) { if (this.anim !== a) { this.anim = a; this.fi = 0; this.ft = 0; } }

  update(dt, vis) {
    if (this.dead) return;
    if (vis && (this.wantT = (this.wantT || 0) - dt) <= 0) { this.wantT = 2; if (Residency.gs) Residency.want(KEY); }
    if (!this.ready) { if (vis && (this.retryT -= dt) <= 0) { this.retryT = 3; this.load(); } return; }
    const P = this.path;
    if (P.length >= 2) {
      if (this.state === 'wait') { this.t -= dt; if (this.t <= 0) this.startLeg(); }
      else if (this.state === 'drive') {
        const dx = this.to.x - this.x, dy = this.to.y - this.y, L = Math.hypot(dx, dy), st = SPEED * dt;
        if (L <= st) {
          this.x = this.to.x; this.y = this.to.y;
          this.i = (this.i + 1) % P.length;
          const n = P[this.i];
          if (n.action === 'pick' || n.action === 'drop') { this.state = 'act'; this.act = n.action; this.face = n.dir || this.face; this.t = 1.15; this.setAnim('lift'); }
          else this.startLeg();
        } else { this.x += (dx / L) * st; this.y += (dy / L) * st; }
      } else if (this.state === 'act') {
        this.t -= dt;
        if (this.t <= 0) { this.loaded = this.act === 'pick'; this.startLeg(); }
      }
    }
    // frames
    const A = ANIM[this.anim] || ANIM.idle;
    this.ft += dt;
    const fdt = 1 / A.fps;
    while (this.ft >= fdt) { this.ft -= fdt; this.fi = A.loop ? (this.fi + 1) % A.n : Math.min(A.n - 1, this.fi + 1); }
    this.draw(vis, dt);
  }

  draw(vis, dt) {
    const gs = this.gs, tex = gs.textures.exists(KEY) ? gs.textures.get(KEY) : null;
    const show = vis && !!tex;
    for (const o of [this.body, this.over]) if (o && o.visible !== show) o.setVisible(show);
    const d = this.driver;
    if (d && d.sprite.visible !== show) { d.sprite.setVisible(show); if (d.shadow) d.shadow.setVisible(false); }
    if (this.cargo) this.cargo.setVisible(show && this.loaded);
    if (!show) {
      // the page went (evicted): ask for it again in a while
      if (!tex) { this.ready = false; for (const o of [this.body, this.over, this.cargo]) if (o) o.destroy(); if (this.driver) this.driver.destroy(); this.body = this.over = this.cargo = this.driver = null; this.retryT = 3; }
      return;
    }
    const base = BASE[this.face] || 'NE', flip = this.face === 'SW' || this.face === 'NW';
    const fr = this.anim + '_' + base + '_' + this.fi, of = 'over_' + fr;
    if (tex.has(fr)) this.body.setFrame(fr);
    if (tex.has(of)) { this.over.setFrame(of); this.over.setVisible(true); } else this.over.setVisible(false);
    this.body.setFlipX(flip); this.over.setFlipX(flip);
    // the depth of the band it drives in (the building's actor bands), the driver between the body and the cage
    const q = this.b.occupy({ x: this.x, y: this.y, inside: this.band === 'mid' });
    const dep = q ? q.depth : this.y;
    this.body.setPosition(this.x, this.y).setDepth(dep);
    this.over.setPosition(this.x, this.y).setDepth(dep + 2e-5);
    const C = this.C, sx = flip ? -1 : 1;
    const seat = (C.seats && C.seats[base] && C.seats[base][0]) || [-16, -50];
    if (d) {
      d.x = this.x + seat[0] * sx; d.y = this.y + seat[1];
      const di = DIRS8.indexOf(this.face);
      if (di >= 0) d.dir = di;
      this.seat.x = d.x; this.seat.y = d.y;
      d.refreshAct(dt || 0);
      d.sync(dt || 0);
      d.sprite.setDepth(dep + 1e-5);
    }
    if (this.cargo && this.loaded) {
      const cp = (C.cargoPoint && C.cargoPoint[base]) || [42, 14, false];
      this.cargo.setPosition(this.x + cp[0] * sx, this.y + cp[1]).setDepth(cp[2] ? dep - 1e-5 : dep + 3e-5);
    }
  }

  destroy() {
    this.dead = true;
    const ai = Assets.arrivals.indexOf(this.onArrive);
    if (ai >= 0) Assets.arrivals.splice(ai, 1);
    for (const o of [this.body, this.over, this.cargo]) if (o) o.destroy();
    if (this.driver) this.driver.destroy();
  }
}
