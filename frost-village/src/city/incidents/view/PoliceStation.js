// 서리 경찰서 — the civic police station at c_police (cutaway layers, a cosy cell with a "time-out" sign). While
// somebody sits in the cell after a theft (the story's 'station' phase) and the station is near, the shell fades
// (openAlpha 0.12, shell_cut shown) and we see them on the cell rug, sheepish, with the desk officer at work; the
// cell door plays `open` / `close` when they come and go. The police car rests in its bay when it is not out.
// A tap inside revealPoly (patch P11 `tap`) opens / closes the cutaway.

import { put, sdef, cdef, Assets } from './art.js';
import { Vehicle } from './Vehicle.js';
import { POLICE } from '../layout.js';

export class PoliceStation {
  constructor(view) {
    this.view = view;
    this.scene = view.scene;
    this.shown = false;
    this.layers = [];
    this.revealed = false;
    this.k = 0;                 // shell fade 0 closed .. 1 open
    this.cell = [];
  }

  show() {
    const S = this.scene, d = sdef('police_station');
    if (!d) return;
    this.shown = true;
    const x = POLICE.x, y = POLICE.y;
    const cut = d.cutaway || {};
    const order = cut.drawOrder || [];
    this.slot = { behind: y + 0.01 * Math.max(0, order.indexOf('@behind')), front: y + 0.01 * Math.max(0, order.indexOf('@front')) };
    this.closed = put(S, 'police_station', x, y);
    this.layers = [];
    order.forEach((k, i) => {
      if (k[0] === '@') return;
      const isCell = k === 'police_station_cell';
      const o = isCell ? this.cellSprite(x, y, y + 0.01 * i) : put(S, k, x, y, y + 0.01 * i);
      if (!o) return;
      o.setVisible(false);
      o._key = k;
      this.layers.push(o);
    });
    // the car in its bay (its pictures are held while the station is near)
    if (!this.held) { this.held = true; this.view.art('want', 'station'); }
    const bay = d.carBayPoint || [115, 58];
    if (cdef('police_car')) { this.car = new Vehicle(this.view, 'police_car', x + bay[0], y + bay[1], d.carBayDir || 'SW'); }
    // the desk officer
    const sp = (d.staffPoints && d.staffPoints[0]) || [10, -29];
    this.desk = this.view.cast.add({ preset: 'police_officer', seed: 8801 }, x + sp[0], y + sp[1], 'SW');
    this.desk.depth = this.slot.behind + 0.001;
    this.apply();
  }

  cellSprite(x, y, depth) {
    const S = this.scene;
    const o = put(S, 'police_station_cell', x, y, depth);
    if (!o) return null;
    const sp = S.add.sprite(x, y, o.texture.key, o.frame.name).setOrigin(o.originX, o.originY).setDepth(depth);
    o.destroy();
    return sp;
  }

  hide() {
    this.shown = false;
    if (this.closed) this.closed.destroy();
    for (const l of this.layers) l.destroy();
    this.layers = [];
    if (this.car) { this.car.destroy(); this.car = null; }
    if (this.held) { this.held = false; this.view.art('drop', 'station'); }
    if (this.desk) { this.view.cast.remove(this.desk); this.desk = null; }
    for (const c of this.cell) this.view.cast.remove(c.a);
    this.cell = [];
  }

  reveal(on) { this.revealed = !!on; }

  /** an art group arrived: the bay car (drawn blank while its pictures were out) picks them up */
  artReady() { if (this.shown && this.car) this.car.refresh(true); }

  /** the cell from the model: [{ id, phase, culprit }] */
  sync(cell) {
    this.want = cell || [];
    if (!this.shown) return;
    const d = sdef('police_station') || {};
    const pts = d.cellPoints || [[-43, -79], [-66, -70]];
    for (const c of this.cell.slice()) if (!this.want.some((w) => w.id === c.id)) { this.door('open'); this.view.cast.remove(c.a); this.cell.splice(this.cell.indexOf(c), 1); }
    this.want.forEach((w, k) => {
      if (this.cell.some((c) => c.id === w.id) || k >= pts.length) return;
      const p = pts[k];
      const a = this.view.cast.add(this.view.lookOf(w.culprit && (w.culprit.pid || w.culprit.sid), 'culprit', w.id), POLICE.x + p[0], POLICE.y + p[1], 'SE');
      a.depth = this.slot.behind + 0.002 + k * 0.0001;
      a.play('sad', 'SE', 'sheepish');
      this.cell.push({ id: w.id, a });
      this.door('open');
      this.view.later(1.2, () => this.door('close'));
    });
    if (this.want.length) this.revealed = true;
  }

  door(anim) { const cs = this.layers.find((l) => l._key === 'police_station_cell'); const a = Assets.spriteAnim('police_station_cell', anim); if (cs && a && cs.play) cs.play(a); if (anim === 'open') this.view.sound('sfx_vault_door', POLICE.x, POLICE.y, 0.15); }

  /** tap inside the station's revealPoly */
  hit(x, y) {
    const d = sdef('police_station') || {};
    const poly = (d.cutaway && d.cutaway.revealPoly) || d.revealPoly;
    if (!poly) return false;
    const px = x - POLICE.x, py = y - POLICE.y;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1]; if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside; }
    return inside;
  }

  apply() {
    const d = sdef('police_station') || {};
    const F = (d.cutaway && d.cutaway.fade) || { openAlpha: 0.12 };
    const open = this.k > 0.001;
    if (this.closed) this.closed.setVisible(!open);
    for (const l of this.layers) {
      l.setVisible(open);
      if (l._key === 'police_station_shell') l.setAlpha(1 - (1 - F.openAlpha) * this.k);
      if (l._key === 'police_station_shell_cut') l.setAlpha(this.k);
    }
    const inside = open && this.k > 0.3;
    if (this.desk) this.desk.show(inside);
    for (const c of this.cell) c.a.show(inside);
  }

  update(dt) {
    if (!this.shown) return;
    const d = sdef('police_station') || {};
    const ms = ((d.cutaway && d.cutaway.fade && d.cutaway.fade.ms) || 260) / 1000;
    const goal = this.revealed ? 1 : 0;
    if (this.k !== goal) { this.k = goal > this.k ? Math.min(1, this.k + dt / ms) : Math.max(0, this.k - dt / ms); this.apply(); }
    if (this.car) this.car.update(dt);
    // readable at phone zoom: the one in the cell sighs now and then (a tear / dots), the desk officer writes
    if (this.k > 0.9 && this.cell.length) {
      this.emT = (this.emT === undefined ? 1.2 : this.emT) - dt;
      if (this.emT <= 0) {
        this.emT = 5.5;
        this.emN = (this.emN || 0) + 1;
        const c = this.cell[this.emN % this.cell.length];
        if (c && c.a) c.a.emote(this.emN % 3 === 2 ? 'emote_dots' : 'emote_tear', 2.2);
        if (this.desk && this.emN % 3 === 1) this.desk.emote('emote_dots', 1.8);
      }
    }
  }

  destroy() { this.hide(); }
}
