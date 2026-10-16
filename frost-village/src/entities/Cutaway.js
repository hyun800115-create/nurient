// (v4.2, docs/v42_plan.md §6.3 / §6.6 / §4.4) a cutaway building drawn from the civic / logistics layer contract:
// every layer (`floor`, `back`, `interior`, overlays, `front`, `shell_cut`, `shell` …) at the SAME position + origin as
// the building, in the manifest's `drawOrder`, with two character slots `@behind` (staff behind the counter) and
// `@front` (customers). Closed: the shell (+ the always-drawn layers); revealed: the shell fades to `openAlpha`, the
// `shell_cut` wall stubs and the inside layers show (inside layers exist only while revealed: fill rate).
//   const cw = new Cutaway(gs, 'bank', x, y, { region })
//   cw.reveal(on)             fade the shell (fade.ms), the inside appears / goes
//   cw.slotDepth('@behind', y)  the depth of a character standing inside (sorted among the others by its own y)
//   cw.inPoly(x, y)           a point inside the building's revealPoly (tap / walk-in tests)
//   cw.overlay(name, anim)    play an overlay's frames (e.g. the bank vault: 'bank_vault' 8 frames)
// Pictures may still be on their way (late fragments): every layer is (re)applied when its frame arrives.

import { Assets } from '../core/Assets.js';

export class Cutaway {
  constructor(gs, key, x, y, opts = {}) {
    this.gs = gs; this.key = key; this.x = x; this.y = y;
    this.def = Assets.def(key) || {};
    const cw = this.def.cutaway || {};
    this.cw = cw;
    this.order = (cw.drawOrder || []).slice();
    this.fade = Object.assign({ layer: key + '_shell', closedAlpha: 1, openAlpha: 0.12, ms: 260 }, cw.fade || {});
    this.cut = (cw.cut && cw.cut.layer) || key + '_shell_cut';
    this.poly = (cw.revealPoly || this.def.revealPoly || []).map((p) => ({ x: x + p[0], y: y + p[1] }));
    this.lift = Number(cw.floorLiftPx) || 0;
    this.revealed = false;
    this.alpha = 0;           // 0 closed .. 1 open
    this.layers = {};
    this.base = y;
    // the always-drawn layers (closed look): the shell, its floor (the ground shadow) and the overlays outside
    this.inside = new Set(['interior', 'back', 'front'].map((n) => cw.layers && cw.layers[n]).filter(Boolean));
    this.order.forEach((name, i) => {
      if (name[0] === '@') return;
      const img = Assets.image(gs, x, y, name).setDepth(this.base + 0.01 * i);
      img.__layerIndex = i;
      img.noCull = true;
      if (opts.region && gs.territory) gs.territory.add(opts.region, img);
      if (gs.lazyImage) gs.lazyImage(img, name);
      this.layers[name] = img;
    });
    this.apply();
  }

  /** depth of slot '@behind' / '@front' for a character at world y (sorted among themselves by y) */
  slotDepth(slot, y) {
    const i = this.order.indexOf(slot);
    return this.base + 0.01 * (i < 0 ? this.order.length : i) + (y - this.base) * 1e-4;
  }

  inPoly(x, y) {
    const P = this.poly;
    if (P.length < 3) return false;
    let c = false;
    for (let a = 0, b = P.length - 1; a < P.length; b = a++) if ((P[a].y > y) !== (P[b].y > y) && x < ((P[b].x - P[a].x) * (y - P[a].y)) / (P[b].y - P[a].y) + P[a].x) c = !c;
    return c;
  }

  reveal(on) { this.revealed = !!on; }

  /** a point of the manifest (doorPoint, counterPoints[0], …) in world px */
  point(name, k) {
    const v = this.def[name];
    if (!v) return null;
    const p = Array.isArray(v[0]) ? v[k || 0] : v;
    return p ? { x: this.x + p[0], y: this.y + p[1] } : null;
  }

  /** play the frames of an overlay layer (name_0 … name_{n-1}) once (then hold the last) */
  overlay(name, frames, fps, reverse) {
    const img = this.layers[name];
    if (!img) return;
    const n = Math.max(1, frames || 8), dt = 1000 / Math.max(1, fps || 12);
    for (let i = 0; i < n; i++) {
      const f = reverse ? n - 1 - i : i;
      this.gs.time.delayedCall(i * dt, () => {
        if (!img.active) return;
        const d = Assets.def(name), fr = name + '_' + f, tk = d && d.atlas ? Assets.texOf(d.atlas, fr) : null;
        if (tk) img.setTexture(tk, fr);
      });
    }
  }

  apply() {
    const a = this.alpha, F = this.fade;
    for (const name in this.layers) {
      const img = this.layers[name];
      if (name === F.layer) img.setAlpha(F.closedAlpha + (F.openAlpha - F.closedAlpha) * a);
      else if (name === this.cut) img.setVisible(a > 0.02).setAlpha(a);
      else if (this.inside.has(name)) img.setVisible(a > 0.02);
    }
  }

  update(dt) {
    const want = this.revealed ? 1 : 0;
    if (this.alpha === want) return;
    const step = dt * 1000 / Math.max(60, this.fade.ms || 260);
    this.alpha = want > this.alpha ? Math.min(1, this.alpha + step) : Math.max(0, this.alpha - step);
    this.apply();
  }

  objects() { return Object.values(this.layers); }

  destroy() { for (const k in this.layers) this.layers[k].destroy(); this.layers = {}; }
}
