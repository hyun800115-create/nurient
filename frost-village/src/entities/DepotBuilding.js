// (v4.2, docs/v42_plan.md §4.4) 서리 물류창고 — the finished 솔방울 물류센터 cutaway (assets/logistics `logistics_center`)
// at WORLD.v42.depot: the manifest's layerOrder (apron … shell, nameplate, dock doors, props), `alwaysDrawn` layers
// always, the inside layers + the rack stock + the workers only while revealed (fill rate). Reveal: the chief inside
// revealPoly / within office.revealPx of the door, a tap inside (toggle), the 관망 camera; shell -> 0 and shadow_open
// -> 1 over reveal.fadeMs. Racks redraw only when stock.ver changed (≤ 2 Hz): rackFill (rack.js) -> item pictures at
// point + spanPx·t + depthPx·u, copies stacked by stackStep, drawn between `interior` and `interior_racks`.
// The 물류 금고 (CashPad) on the forecourt; the door pad (0.4 s) opens the depot view of the office panel.

import { Assets } from '../core/Assets.js';
import { Pad } from './Pad.js';
import { CashPad } from './Seller.js';
import { Staff } from './staff/Staff.js';
import { WORLD, L4 } from '../data/world.js';
import { BALANCE } from '../data/balance.js';
import { gdist } from '../core/Iso.js';
import { rackFill } from '../systems/depot/rack.js';

const KEY = 'logistics_center';

export class DepotBuilding {
  constructor(gs, site, sys) {
    this.gs = gs; this.site = site; this.sys = sys;
    const D = WORLD.v42.depot;
    const [x, y] = L4(D.i, D.j);
    this.x = x; this.y = y;
    this.door = { x: x - 278, y: y + 67 };
    this.workers = []; this.obstacles = []; this.rackImgs = []; this.imgs = {};
    this.ready = false;
    const [tx, ty] = L4(D.till[0], D.till[1]);
    this.till = new CashPad(gs, tx, ty);
    // the logistics manifest + atlases arrive late: the building is made when the manifest is merged
    Assets.loadFragment(gs, 'logistics', { only: ['lgx_center_a', 'lgx_center_b', 'lgx_center_c', 'lgx_center_d', 'lgx_items'] }, () => this.build());
  }

  build() {
    if (this.ready || !this.gs.sys || !this.gs.sys.isActive()) return;
    this.ready = true;
    const gs = this.gs, x = this.x, y = this.y, sys = this.sys;
    this.def = Assets.def(KEY) || {};
    const def = this.def, L = def.layers || {}, P = def.patches || {};
    this.layerKey = (name) => (name === 'nameplate_<lang>' ? (def.nameplates && def.nameplates.ko) || L.nameplate_ko : L[name] || P[name] || null);
    this.order = (def.layerOrder || []).slice();
    this.imgs = {};
    this.stockIndex = this.order.indexOf('<stock>');
    this.order.forEach((name, i) => {
      if (name[0] === '<') return;
      const k = this.layerKey(name);
      if (!k) return;
      const img = Assets.image(gs, x, y, k).setDepth(y + 0.01 * i);
      if (gs.lazyImage) gs.lazyImage(img, k);
      img.noCull = true;
      this.imgs[name] = img;
    });
    for (const pr of def.outdoorProps || []) { const im = Assets.image(gs, x + pr.point[0], y + pr.point[1], pr.sprite).setDepth(y + pr.point[1]); if (gs.lazyImage) gs.lazyImage(im, pr.sprite); (this.props || (this.props = [])).push(im); }
    this.always = new Set((def.alwaysDrawn || []).concat(['shell', 'apron']));
    this.poly = (def.revealPoly || []).map((p) => ({ x: x + p[0], y: y + p[1] }));
    this.alpha = 0;
    this.revealed = false;
    // walls: circles along the footprint edges, the door gap
    const fp = (def.footprintPoly || [[-430, -34], [68, 215], [430, 34], [-68, -215]]).map((p) => ({ x: x + p[0], y: y + p[1] }));
    const door = { x: x + (def.doorPoint || [-278, 67])[0], y: y + (def.doorPoint || [-278, 67])[1] };
    this.door = door;
    for (let a = 0; a < fp.length; a++) {
      const p = fp[a], q = fp[(a + 1) % fp.length];
      const n = Math.max(2, Math.round(Math.hypot(q.x - p.x, q.y - p.y) / 40));
      for (let k = 0; k <= n; k++) { const cx = p.x + ((q.x - p.x) * k) / n, cy = p.y + ((q.y - p.y) * k) / n; if (gdist(cx, cy, door.x, door.y) < 70) continue; this.obstacles.push(gs.collision.add(cx, cy, 18, 'depot')); }
    }
    // the door pad
    this.doorPad = new Pad(gs, door.x - 30, door.y + 40, 'cash', 1.2, { icon: Assets.pick('ui_icon_stock', 'ui_icon_box', 'ui_icon_delivery', 'ui_icon_lock'), iconSize: 36 });
    // the rack stock pictures (pooled, only while revealed) and the workers
    this.rackVer = -1;
    this.rackT = 0;
    const sp = def.staffPoints || [];
    for (let i = 0; i < 3 && i < sp.length; i++) {
      const p = sp[[0, 3, 6][i] % sp.length];
      const ch = new Staff(gs, sys, 'depot', 4100 + i * 37, x + p[0], y + p[1], { x: x + p[0], y: y + p[1] });
      ch.inside = true;
      this.workers.push(ch);
    }
  }

  inPoly(px, py) {
    const P = this.poly || [];
    let c = false;
    for (let a = 0, b = P.length - 1; a < P.length; b = a++) if ((P[a].y > py) !== (P[b].y > py) && px < ((P[b].x - P[a].x) * (py - P[a].y)) / (P[b].y - P[a].y) + P[a].x) c = !c;
    return c;
  }

  tap(px, py) { if (!this.inPoly(px, py)) return false; this.tapOpen = !this.tapOpen; return true; }

  /** the dock bay the sleigh uses (bay 2), world px */
  bay() { const D = WORLD.v42.depot; const [bx, by] = L4(D.bayPt[0], D.bayPt[1]); return { x: bx, y: by }; }

  update(dt) {
    this.till.update(dt);
    if (!this.ready) return;
    const gs = this.gs, p = gs.player, V = (BALANCE.v42 && BALANCE.v42.office) || {};
    const r = Number(V.revealPx) || 260, h = Number(V.revealHyst) || 60;
    const d = gdist(p.x, p.y, this.door.x, this.door.y);
    let want = this.revealed ? d < r + h : d < r;
    if (this.inPoly(p.x, p.y) || this.tapOpen || this.sys.camReveal) want = true;
    this.revealed = want;
    const ms = Number(this.def.reveal && this.def.reveal.fadeMs) || 350;
    const target = want ? 1 : 0;
    if (this.alpha !== target) {
      this.alpha = target > this.alpha ? Math.min(1, this.alpha + (dt * 1000) / ms) : Math.max(0, this.alpha - (dt * 1000) / ms);
      this.apply();
    } else if (!this.applied) this.apply();
    // the racks (≤ 2 Hz, only when the stock changed, only while revealed)
    this.rackT -= dt;
    if (this.alpha > 0.05 && this.rackT <= 0) { this.rackT = 0.5; if (this.sys.model.stock.ver !== this.rackVer) this.drawRacks(); }
    for (const im of this.rackImgs) if (im.visible !== this.alpha > 0.05 && im.__on) im.setVisible(this.alpha > 0.05);
    const vis = this.alpha > 0.3;
    for (const ch of this.workers) { if (ch.sprite.visible !== vis) { ch.sprite.setVisible(vis); if (ch.shadow) ch.shadow.setVisible(vis); } ch.update(dt); ch.sprite.setDepth(this.y + 0.01 * (this.stockIndex + 1) + (ch.y - this.y) * 1e-4); }
    // the door pad: the depot view
    if (this.doorPad.contains(p.x, p.y)) { this.padT = (this.padT || 0) + dt; if (this.padT > 0.4 && !this.padOpen) { this.padOpen = true; const O = gs.v42 && gs.v42.office; if (O && O.openPanel) O.openPanel('depot', 'depot'); } }
    else { this.padT = 0; this.padOpen = false; }
  }

  apply() {
    this.applied = true;
    const a = this.alpha, st = (this.def.reveal && this.def.reveal.states) || {};
    for (const name in this.imgs) {
      const img = this.imgs[name];
      if (name === 'shell') img.setAlpha(1 - a);
      else if (name === 'shadow_open') img.setVisible(a > 0.02).setAlpha(a);
      else if (name === 'shell_cut') img.setVisible(false);
      else if (this.always.has(name)) img.setVisible(true);
      else img.setVisible(a > 0.02);
    }
    void st;
  }

  /** the rack stock: rackFill -> pooled item pictures (stock band between interior and interior_racks) */
  drawRacks() {
    const gs = this.gs, def = this.def, M = this.sys.model;
    this.rackVer = M.stock.ver;
    const geo = { slots: def.rackSlots || [], items: Assets.m.sprites };
    const fill = rackFill(geo, M.stock);
    const scale = def.stockScale || {};
    let n = 0;
    const base = this.y + 0.01 * (this.stockIndex >= 0 ? this.stockIndex : 5);
    for (const f of fill) {
      const s = geo.slots[f.slot];
      if (!f.key || !s) continue;
      const it = Assets.def(f.key) || {}, sc = Number(scale[s.category]) || 0.85, step = (Number(it.stackStep) || 20) * sc;
      const stacks = f.stacks.slice().sort((a, b) => a.u - b.u);
      for (const q of stacks) {
        const px = this.x + s.point[0] + s.spanPx[0] * q.t + s.depthPx[0] * q.u, py = this.y + s.point[1] + s.spanPx[1] * q.t + s.depthPx[1] * q.u;
        for (let c = 0; c < q.n && c * step <= (s.maxStackPx || 40); c++) {
          let im = this.rackImgs[n];
          if (!im) { im = Assets.image(gs, 0, 0, f.key); this.rackImgs[n] = im; }
          if (im.__k !== f.key) { Assets.apply(im, f.key); im.__k = f.key; }
          im.setScale(sc).setPosition(px, py - c * step).setDepth(base + (s.drawOrder || 0) * 1e-4 + c * 1e-6).setVisible(this.alpha > 0.05);
          im.__on = true;
          n++;
        }
      }
    }
    for (let k = n; k < this.rackImgs.length; k++) { this.rackImgs[k].setVisible(false); this.rackImgs[k].__on = false; }
  }

  revealObjects() { return Object.values(this.imgs); }

  destroy() {
    for (const k in this.imgs) this.imgs[k].destroy();
    for (const im of this.rackImgs.concat(this.props || [])) im.destroy();
    for (const ob of this.obstacles) ob.active = false;
    for (const w of this.workers) w.destroy();
    if (this.doorPad) this.doorPad.img.destroy();
  }
}
