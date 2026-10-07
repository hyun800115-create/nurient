// A tower (or several towers) of item sprites — carried at a character's carryPoint or
// standing on a pad. Sprites come from the Effects pool and are handed over (not recreated)
// when items fly between stacks.

import { Assets } from '../core/Assets.js';

const STEP_CACHE = {};
export function stackStep(type) {
  let s = STEP_CACHE[type];
  if (s === undefined) { const d = Assets.def(type); s = STEP_CACHE[type] = d.stackStep || 10; }
  return s;
}

export class ItemStack {
  /**
   * opts: scale, cols ([[dx,dy],...] tower offsets), perCol (items per tower), sway (bool), max
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.items = [];
    this.scale = opts.scale || 1;
    this.cols = opts.cols || [[0, 0]];
    this.perCol = opts.perCol || 1000;
    this.sway = !!opts.sway;
    this.max = opts.max || 9999;
    this.lean = 0; this.leanV = 0;
    this.bx = 0; this.by = 0; this.depth = 0;
    this.typeCols = opts.typeCols || null; // map type -> column index (shelf with one tower per type)
    this._top = { x: 0, y: 0 };
    this.visible = true;
  }

  get count() { return this.items.length; }
  get full() { return this.items.length >= this.max; }

  countOf(type) {
    let n = 0;
    for (let i = 0; i < this.items.length; i++) if (this.items[i].type === type) n++;
    return n;
  }

  hasAny(types) {
    for (let i = 0; i < this.items.length; i++) if (types.indexOf(this.items[i].type) >= 0) return true;
    return false;
  }

  /** add an item (optionally reusing a sprite that just flew in) */
  push(type, spr, fx) {
    if (!spr) spr = fx.takeItem(type);
    spr.setScale(this.scale).setVisible(this.visible).setAngle(0);
    this.items.push({ type, spr, hop: 0 });
    return spr;
  }

  /** remove the topmost item (of `type` or any type in array `types`); returns { type, spr } or null */
  pop(types) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (!types || (Array.isArray(types) ? types.indexOf(it.type) >= 0 : it.type === types)) {
        this.items.splice(i, 1);
        return it;
      }
    }
    return null;
  }

  clear(fx) {
    for (const it of this.items) fx.releaseItem(it.spr);
    this.items.length = 0;
  }

  /** world position where the next item would land (for flights) */
  nextPos(type) {
    const n = this.items.length;
    let col = 0, h = 0;
    if (this.typeCols && type) {
      col = this.typeCols[type] || 0;
      for (const it of this.items) if (this.typeCols[it.type] === col) h += stackStep(it.type) * this.scale;
    } else {
      col = Math.min(this.cols.length - 1, Math.floor(n / this.perCol));
      const start = col * this.perCol;
      for (let i = start; i < n; i++) h += stackStep(this.items[i].type) * this.scale;
    }
    const c = this.cols[col] || this.cols[0];
    this._top.x = this.bx + c[0] + this.lean * Math.min(1, n / 10);
    this._top.y = this.by + c[1] - h;
    return this._top;
  }

  /** world position of the top item (for flights out of the stack) */
  topPos() {
    const it = this.items[this.items.length - 1];
    if (!it) { this._top.x = this.bx; this._top.y = this.by; return this._top; }
    this._top.x = it.spr.x; this._top.y = it.spr.y;
    return this._top;
  }

  /**
   * Position all sprites. (bx, by) = bottom of the stack; depth = base draw depth.
   * vx = carrier velocity (for sway), dt = frame time.
   */
  layout(bx, by, depth, vx = 0, dt = 0.016, bob = 0) {
    this.bx = bx; this.by = by; this.depth = depth;
    if (this.sway) {
      // spring lean opposite to motion
      const target = -vx * 0.045;
      this.leanV += ((target - this.lean) * 60 - this.leanV * 9) * dt;
      this.lean += this.leanV * dt;
    }
    const items = this.items;
    const n = items.length;
    if (this.typeCols) {
      const hs = [0, 0, 0, 0, 0, 0];
      for (let i = 0; i < n; i++) {
        const it = items[i];
        const col = this.typeCols[it.type] || 0;
        const c = this.cols[col] || this.cols[0];
        const st = stackStep(it.type) * this.scale;
        it.spr.setPosition(bx + c[0], by + c[1] - hs[col]);
        it.spr.setDepth(depth + c[1] * 0.01 + hs[col] * 0.0001 + 0.001);
        hs[col] += st;
      }
      return;
    }
    let h = 0, col = 0, inCol = 0;
    const per = this.perCol;
    const lean = this.lean;
    for (let i = 0; i < n; i++) {
      if (inCol >= per && col < this.cols.length - 1) { col++; inCol = 0; h = 0; }
      const it = items[i];
      const c = this.cols[col];
      const st = stackStep(it.type) * this.scale;
      const k = this.sway ? (inCol / 10) * (inCol / 10) : 0;
      const wob = this.sway && inCol > 0 ? Math.sin(bob * 2 + inCol * 0.5) * 0.6 * inCol / 10 : 0;
      it.spr.setPosition(bx + c[0] + lean * k + wob, by + c[1] - h);
      it.spr.setDepth(depth + c[1] * 0.01 + i * 0.0005 + 0.001);
      h += st; inCol++;
    }
  }

  setVisible(v) {
    this.visible = v;
    for (const it of this.items) it.spr.setVisible(v);
  }
}
