// A tower (or several towers) of item sprites — carried at a character's carryPoint or
// standing on a pad. Sprites come from the Effects pool and are handed over (not recreated)
// when items fly between stacks.

import { Assets } from '../core/Assets.js';
import { StackBaker } from '../systems/StackBaker.js';

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
    this.alternate = !!opts.alternate;     // fill the towers side by side (twin towers) instead of one after another
    this.hopOnPush = opts.hop !== false;
    this.drawMax = opts.drawMax || 0;      // (v3.5 review) items beyond this stay on top of their tower (a big pile never becomes a skyscraper)
    this._top = { x: 0, y: 0 };
    this.visible = true;
    this.incoming = 0;      // items currently flying toward this stack (reserved capacity)
    this.inTypes = [];      // their types (saved with the stack, so a reload mid-flight loses nothing)
    // (v4.2 P0) baked: the items are drawn as one picture (systems/StackBaker.js); an item has a sprite only while it
    // flies. The slot is reserved on the first bake (a stack that is replaced right away never takes one)
    this.bakeOn = !!opts.bake && !(typeof window !== 'undefined' && window.__FV_NO_BAKE);
    this.bakeImg = null; this.slot = null; this.bakeDirty = true; this.bakeFail = false;
    this.bakeTypes = opts.bakeTypes || null;      // the item types it will hold (slot height)
    // 'eager': the slot is reserved now (the busiest stacks — piles, outputs, the plaza shelves — come first)
    if (this.bakeOn && opts.bake === 'eager') this.ensureBake();
  }

  /** (v4.2 P0) the baked picture: a slot of the shared texture, sized for this stack at its fullest */
  ensureBake() {
    if (this.slot || this.bakeFail) return !!this.slot;
    const B = StackBaker.of(this.scene);
    if (!B) { this.bakeFail = true; return false; }
    // extents: the towers' spread, the tallest tower at its fullest (16 px a layer), the item picture above / below
    let x0 = 0, x1 = 0, y0 = 0, y1 = 0;
    for (const c of this.cols) { x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); y0 = Math.min(y0, c[1]); y1 = Math.max(y1, c[1]); }
    const nc = Math.max(1, this.cols.length);
    let tall = this.typeCols ? Math.ceil(this.max / Math.max(1, Object.keys(this.typeCols).length)) : this.alternate ? Math.ceil(this.max / nc) : Math.min(this.max, this.perCol);
    if (this.drawMax) tall = Math.min(tall, this.alternate ? Math.ceil(this.drawMax / nc) : this.drawMax);
    tall = Math.min(tall, 60);
    // the step of the tallest item this stack holds (its towers' layer height)
    let st = 0;
    for (const it of this.items) st = Math.max(st, stackStep(it.type));
    if (this.typeCols) for (const k in this.typeCols) st = Math.max(st, stackStep(k));
    if (this.bakeTypes) for (const k of this.bakeTypes) st = Math.max(st, stackStep(k));
    const sc = this.scale, step = Math.min(16, Math.max(8, st || 14) + 1) * sc, half = 46 * sc;
    const w = x1 - x0 + half * 2, h = (y1 - y0) + tall * step + 76 * sc + 26 * sc;
    const ox = -x0 + half, oy = -y0 + tall * step + 76 * sc;
    this.slot = B.slotFor(this, w, h, ox, oy);
    if (!this.slot) { this.bakeFail = true; this.materialize(); return false; }
    const img = this.scene.add.image(0, 0, B.key, this.slot.name).setOrigin(ox / this.slot.w, oy / this.slot.h);
    img.setVisible(this.visible);
    img.__baked = true;
    this.bakeImg = img;
    this.baker = B;
    return true;
  }

  /** (v4.2 P0) baking failed / was turned off: every item gets its sprite back */
  materialize() {
    const fx = this.scene.effects;
    for (const it of this.items) if (!it.spr && fx) { it.spr = fx.takeItem(it.type); it.spr.setScale(this.scale).setVisible(this.visible); }
    this.bakeOn = false;
    if (this.bakeImg) { this.bakeImg.destroy(); this.bakeImg = null; }
  }

  /** an item of `type` starts flying toward this stack */
  reserve(type) { this.incoming++; this.inTypes.push(type); }
  /** ...and has arrived (or was dropped) */
  arrive(type) { this.incoming = Math.max(0, this.incoming - 1); const i = this.inTypes.indexOf(type); if (i >= 0) this.inTypes.splice(i, 1); }
  /** stored + in-flight count of `type` */
  countWithIncoming(type) { let n = this.countOf(type); for (const t of this.inTypes) if (t === type) n++; return n; }

  /** free slots, counting items already in flight */
  get room() { return this.max - this.items.length - this.incoming; }

  get count() { return this.items.length; }
  get full() { return this.items.length + this.incoming >= this.max; }

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
    if (this.bakeOn) {
      // (v4.2) baked: the item is data; a sprite that flew in stays on its place until the next bake draws it
      // (StackBaker.flush releases it then: no gap between landing and being drawn)
      if (spr) { spr.setScale(this.scale).setVisible(this.visible).setAngle(0); }
      this.items.push({ type, spr: spr || null, pend: !!spr, hop: 0, x: this.bx, y: this.by });
      this.bakeDirty = true;
      return spr || null;
    }
    if (!spr) spr = fx.takeItem(type);
    spr.setScale(this.scale).setVisible(this.visible).setAngle(0);
    this.items.push({ type, spr, hop: this.hopOnPush ? 1 : 0 });
    return spr;
  }

  /** remove the topmost item (of `type` or any type in array `types`); returns { type, spr } or null */
  pop(types) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (!types || (Array.isArray(types) ? types.indexOf(it.type) >= 0 : it.type === types)) {
        this.items.splice(i, 1);
        if (!it.spr) {
          // (v4.2) a baked item: its sprite appears where it was drawn, to fly away
          const fx = this.scene.effects;
          it.spr = fx ? fx.takeItem(it.type) : null;
          if (it.spr) it.spr.setScale(it.sx || this.scale, it.sy || this.scale).setPosition(it.x, it.y).setDepth(this.depth + 0.01).setVisible(this.visible);
          this.bakeDirty = true;
        }
        return it;
      }
    }
    return null;
  }

  clear(fx) {
    for (const it of this.items) if (it.spr) fx.releaseItem(it.spr);
    this.items.length = 0;
    this.bakeDirty = true;
    if (this.bakeImg && this.slot && this.baker) this.baker.queue(this, true);
  }

  /** world position where the next item would land (for flights) */
  nextPos(type) {
    const n = this.items.length;
    let col = 0, h = 0;
    if (this.typeCols && type) {
      col = this.typeCols[type] || 0;
      let k = 0;
      const lim = this.drawMax || Infinity;
      for (const it of this.items) if (this.typeCols[it.type] === col && ++k < lim) h += stackStep(it.type) * this.scale;
    } else if (this.alternate) {
      const nc = this.cols.length;
      col = n % nc;
      const lim = this.drawMax || Infinity;
      for (let i = col; i < n; i += nc) if (i + nc < lim) h += stackStep(this.items[i].type) * this.scale;
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
    this._top.x = it.spr ? it.spr.x : it.x; this._top.y = it.spr ? it.spr.y : it.y;
    return this._top;
  }

  /**
   * Position all sprites. (bx, by) = bottom of the stack; depth = base draw depth.
   * vx = carrier velocity (for sway), dt = frame time.
   */
  layout(bx, by, depth, vx = 0, dt = 0.016, bob = 0) {
    if (this.bakeOn) { this.layoutBaked(bx, by, depth); return; }
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
      // ((v4.2.1) one height per tower: the 잡화점 has 7 since meat cans (a fixed 6 left the 7th tower at NaN, unseen)
      const hs = this._hsT || (this._hsT = []), cs = this._csT || (this._csT = []);
      for (let k = 0, nk = Math.max(8, this.cols.length); k < nk; k++) { hs[k] = 0; cs[k] = 0; }
      // ((v4-C) drawMax: a tower shows at most this many layers, the rest stay on its top)
      const lim = this.drawMax || Infinity;
      for (let i = 0; i < n; i++) {
        const it = items[i];
        const col = this.typeCols[it.type] || 0;
        const c = this.cols[col] || this.cols[0];
        const st = stackStep(it.type) * this.scale;
        let hop = 0;
        if (it.hop > 0) { it.hop = Math.max(0, it.hop - dt * 5); hop = Math.sin(it.hop * Math.PI) * 9; it.spr.setScale(this.scale * (1 + it.hop * 0.25), this.scale * (1 - it.hop * 0.15)); if (it.hop === 0) it.spr.setScale(this.scale); }
        it.spr.setPosition(bx + c[0], by + c[1] - hs[col] - hop);
        const d = depth + c[1] * 0.01 + hs[col] * 0.0001 + 0.001;
        if (it.spr.depth !== d) it.spr.setDepth(d);
        if (++cs[col] < lim) hs[col] += st;
      }
      return;
    }
    if (this.alternate) {
      const nc = this.cols.length, hs = this._hs || (this._hs = []);
      for (let k = 0; k < nc; k++) hs[k] = 0;
      const lim = this.drawMax || Infinity;
      for (let i = 0; i < n; i++) {
        const it = items[i], col = i % nc, c = this.cols[col];
        let hop = 0;
        if (it.hop > 0) { it.hop = Math.max(0, it.hop - dt * 5); hop = Math.sin(it.hop * Math.PI) * 8; it.spr.setScale(this.scale * (1 + it.hop * 0.25), this.scale * (1 - it.hop * 0.15)); if (it.hop === 0) it.spr.setScale(this.scale); }
        it.spr.setPosition(bx + c[0], by + c[1] - hs[col] - hop);
        const d = depth + c[1] * 0.01 + i * 0.0005 + 0.001;
        if (it.spr.depth !== d) it.spr.setDepth(d);
        if (i + nc < lim) hs[col] += stackStep(it.type) * this.scale;
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
      let hop = 0;
      if (it.hop > 0) { it.hop = Math.max(0, it.hop - dt * 5); hop = Math.sin(it.hop * Math.PI) * 8; it.spr.setScale(this.scale * (1 + it.hop * 0.25), this.scale * (1 - it.hop * 0.15)); if (it.hop === 0) it.spr.setScale(this.scale); }
      it.spr.setPosition(bx + c[0] + lean * k + wob, by + c[1] - h - hop);
      // setDepth queues a full display-list sort: only when the value really changes
      const d = depth + c[1] * 0.01 + i * 0.0005 + 0.001;
      if (it.spr.depth !== d) it.spr.setDepth(d);
      h += st; inCol++;
    }
  }

  /**
   * (v4.2 P0) the baked layout: the same towers as layout() (typeCols / alternate / perCol, drawMax), written into
   * the items' x / y; the picture is re-baked when something changed (or the stack moved) and it is near the view
   */
  layoutBaked(bx, by, depth) {
    const moved = bx !== this.bx || by !== this.by;
    this.bx = bx; this.by = by; this.depth = depth;
    const items = this.items, n = items.length;
    if (this.bakeDirty || moved) {
      if (this.typeCols) {
        const hs = this._hs || (this._hs = []), cs = this._cs || (this._cs = []);
        for (let k = 0, nk = Math.max(8, this.cols.length); k < nk; k++) { hs[k] = 0; cs[k] = 0; }
        const lim = this.drawMax || Infinity;
        for (let i = 0; i < n; i++) {
          const it = items[i], col = this.typeCols[it.type] || 0, c = this.cols[col] || this.cols[0];
          it.x = bx + c[0]; it.y = by + c[1] - hs[col];
          if (++cs[col] < lim) hs[col] += stackStep(it.type) * this.scale;
        }
      } else if (this.alternate) {
        const nc = this.cols.length, hs = this._hs || (this._hs = []);
        for (let k = 0; k < nc; k++) hs[k] = 0;
        const lim = this.drawMax || Infinity;
        for (let i = 0; i < n; i++) {
          const it = items[i], col = i % nc, c = this.cols[col];
          it.x = bx + c[0]; it.y = by + c[1] - hs[col];
          if (i + nc < lim) hs[col] += stackStep(it.type) * this.scale;
        }
      } else {
        let h = 0, col = 0, inCol = 0;
        for (let i = 0; i < n; i++) {
          if (inCol >= this.perCol && col < this.cols.length - 1) { col++; inCol = 0; h = 0; }
          const it = items[i], c = this.cols[col];
          it.x = bx + c[0]; it.y = by + c[1] - h;
          h += stackStep(it.type) * this.scale; inCol++;
        }
      }
    }
    // live sprites (items that landed since the last bake) keep their place
    for (let i = 0; i < n; i++) { const it = items[i]; if (it.spr) { it.spr.setPosition(it.x, it.y); if (it.spr.depth !== depth + 0.001) it.spr.setDepth(depth + 0.001); } }
    if (!this.bakeImg && (!n || !this.ensureBake())) return;
    const img = this.bakeImg;
    if (img.x !== bx || img.y !== by) img.setPosition(bx, by);
    if (img.depth !== depth + 0.001) img.setDepth(depth + 0.001);
    if (this.bakeDirty) {
      const gs = this.scene;
      // (off screen it waits: a stack far away is baked when it comes near; the baker draws every queued stack in
      //  one pass right before the frame is drawn, a few times a second)
      if (!gs.isOnScreen || gs.isOnScreen(bx, by, 700) || !this.bakedOnce) this.baker.queue(this);
    }
  }

  setVisible(v) {
    this.visible = v;
    for (const it of this.items) if (it.spr) it.spr.setVisible(v);
    if (this.bakeImg) this.bakeImg.setVisible(v);
  }
}
