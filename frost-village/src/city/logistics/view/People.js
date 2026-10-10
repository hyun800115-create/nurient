// People — the staff and the shop owners as paper dolls (ports.dolls; cityfolk presets: warehouse_worker for the
// pickers, packers and the dock hand, bank_teller for the settlement clerk with her visor, forklift_driver in the
// forklift, delivery_driver in the vans; owners wear their own clothes). Inside the walls they stand in the manifest's
// bands (staff `mid` behind the counter / conveyor, customers `front`), outside by the frontTest rule.

import { inPoly } from './art.js';

const LOOK = { clerk: { preset: 'bank_teller', seed: 7 }, packer: { preset: 'warehouse_worker', seed: 21 }, picker: { preset: 'warehouse_worker', seed: 31 }, dockhand: { preset: 'warehouse_worker', seed: 51 } };

export class People {
  constructor(view) {
    this.v = view;
    this.staff = new Map();        // staff k -> rig
    this.owners = new Map();       // agent id -> rig
    this.shown = true;
  }
  staffRig(s) {
    let r = this.staff.get(s.k);
    if (!r) { const L = LOOK[s.role] || LOOK.picker; r = this.v.rig({ preset: L.preset, seed: L.seed + s.k * 3 }, 'staff:' + s.k); if (r) this.staff.set(s.k, r); }
    return r;
  }
  update(dt, info, inside) {
    const v = this.v, C = v.C;
    // staff: on duty during the working hours
    for (const s of info.staff) {
      const r = this.staffRig(s);
      if (!r) continue;
      const out = s.band === 'outside';
      const on = this.shown && info.working && (out || inside);
      r.visible(on);
      if (!on) continue;
      const x = v.bx + s.x, y = v.by + s.y;
      const depth = out ? v.outside(x, y) : v.D + C.bandDepth[s.band === 'front' ? 'front' : 'mid'] + (s.y + 400) * 1e-6;
      r.play(s.anim, s.dir);
      r.update(dt);
      r.place(x, y, depth, 1);
    }
    // owners
    const seen = new Set();
    for (const a of info.owners) {
      seen.add(a.id);
      let r = this.owners.get(a.id);
      if (!r) { r = v.rig(a.look || { seed: 1 }, 'own:' + a.id); if (!r) continue; this.owners.set(a.id, r); }
      const ins = inPoly(a.x, a.y, C.footprintPoly);
      const on = this.shown && (!ins || inside);
      r.visible(on);
      if (!on) continue;
      const x = v.bx + a.x, y = v.by + a.y;
      const depth = ins ? v.D + C.bandDepth.front + (a.y + 400) * 1e-6 : v.outside(x, y);
      const anim = a.moving ? (a.carry ? 'carry_box' : 'walk') : a.st === 'settle' ? 'talk' : a.waiting ? 'think' : a.carry ? 'carry_box' : 'idle';
      r.play(anim, a.dir);
      if (a.moving || anim !== 'carry_box') r.update(dt);
      r.place(x, y, depth, 1);
      r.lastX = x; r.lastY = y;
    }
    for (const [id, r] of this.owners) if (!seen.has(id)) { v.drop(r); this.owners.delete(id); }
  }
  ownerAt(id) { const r = this.owners.get(id); return r ? [r.lastX, r.lastY] : null; }
  count() { return this.staff.size + this.owners.size; }
  setVisible(on) { this.shown = on; if (!on) { for (const r of this.staff.values()) r.visible(false); for (const r of this.owners.values()) r.visible(false); } }
  destroy() { for (const r of this.staff.values()) this.v.drop(r); for (const r of this.owners.values()) this.v.drop(r); this.staff.clear(); this.owners.clear(); }
}
