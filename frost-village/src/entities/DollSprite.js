// DollSprite + DollPool (v4, docs/v4_plan.md §5.1, §5.3).
// A DollSprite is a duck-typed stand-in for Phaser.GameObjects.Sprite: Character (and so Customer, Visitor,
// Bubbles, tweens, moveAgent) drives it exactly like a sprite (x, y, depth, alpha, visible, flipX, scale,
// anims.play / currentFrame / currentAnim, ANIMATION_UPDATE). It is a proxy: the layered picture (one Image per
// paper-doll layer) is a "rig" it borrows from the DollPool only while it is materialised — near the view,
// nearest first, up to the caps (full rigs, then lite rigs, then dots when zoomed far out). A rig is reused,
// never destroyed while the game runs; a refresh happens only when the frame / direction / look changes.

import { TF, MIRROR } from '../core/Townfolk.js';
import { BALANCE } from '../data/balance.js';
import { DIR_BASE } from '../core/Iso.js';

const INV_MIRROR = { SE: 'SW', E: 'W', NE: 'NW' };
const LITE_FAMILY = new Set(['top', 'bottom', 'hair', 'hat']);
const HYST = 60;            // px: a doll that has a rig keeps it this much further out
const FADE_IN = 0.25;       // s

class DollAnims {
  constructor(d) {
    this.d = d;
    this.currentAnim = null;
    this.currentFrame = { index: 1 };
    this.isPlaying = false;
    this.timeScale = 1;
  }
  play(cfg) {
    const key = typeof cfg === 'string' ? cfg : cfg && cfg.key;
    if (!key) return this;
    const start = cfg && typeof cfg === 'object' && cfg.startFrame ? cfg.startFrame : 0;
    // 'tf:<base>:<anim>:<dir>'
    const p = key.split(':');
    const anim = p[2] || 'idle', dir = p[3] || 'S';
    this.d.setAnim(anim, dir, start);
    if (!this.currentAnim || this.currentAnim.key !== key) this.currentAnim = { key };
    this.isPlaying = true;
    return this;
  }
  stop() { this.isPlaying = false; return this; }
  setProgress(p) { const d = this.d, n = d.frames(); d.frame = Math.max(0, Math.min(n - 1, Math.floor(p * n))); d.t = 0; d.dirty = true; return this; }
  getProgress() { const n = this.d.frames(); return n ? this.d.frame / n : 0; }
}

export class DollSprite {
  constructor(gs, key, person, x, y) {
    this.isDoll = true;
    this.gs = gs;
    this.key = key;
    this.person = person;
    this.x = x; this.y = y;
    this._depth = y;
    this._alpha = 1;
    this._visible = true;
    this.flipX = false;
    this.scaleX = 1; this.scaleY = 1;
    this.lift = 0;             // px drawn higher (raised platform)
    this.anim = 'idle'; this.baseDir = 'S'; this.frame = 0; this.t = 0;
    this.rig = null;
    this.tier = -1;            // 0 full, 1 lite, 2 dot, -1 none
    this.fade = 1;
    this.noFade = false;
    this.dirty = true;
    this.active = true;
    this.shadow = null;        // the Character's shadow (shown with the rig)
    this.anims = new DollAnims(this);
    this._listener = null;
    this._evAnim = { key: '' };
    this._evFrame = { index: 1 };
    this.pool = DollPool.of(gs);
    this.pool.add(this);
  }

  // ------------------------------------------------------------------ sprite API used by the game
  get depth() { return this._depth; }
  set depth(v) { this.setDepth(v); }
  get alpha() { return this._alpha; }
  set alpha(v) { this._alpha = v; }
  get visible() { return this._visible; }
  set visible(v) { this.setVisible(v); }
  get scale() { return this.scaleX; }
  set scale(v) { this.scaleX = this.scaleY = v; }
  get displayHeight() { return 104 * this.scaleY; }
  get displayWidth() { return 60 * this.scaleX; }
  setPosition(x, y) { this.x = x; this.y = y; return this; }
  setDepth(v) { this._depth = v; return this; }
  setAlpha(a) { this._alpha = a === undefined ? 1 : a; return this; }
  setVisible(v) { this._visible = !!v; return this; }
  setFlipX(f) { f = !!f; if (f !== this.flipX) { this.flipX = f; this.dirty = true; } return this; }
  setScale(sx, sy) { this.scaleX = sx; this.scaleY = sy === undefined ? sx : sy; return this; }
  setOrigin() { return this; }
  setTint() { return this; }
  clearTint() { return this; }
  on(ev, fn, ctx) { this._listener = fn ? { fn, ctx } : null; return this; }
  off() { this._listener = null; return this; }
  getBounds(out) {
    const r = out || {};
    const h = 104 * this.scaleY, w = 56 * this.scaleX;
    r.x = this.x - w / 2; r.y = this.y - h - this.lift; r.width = w; r.height = h;
    return r;
  }
  destroy() {
    if (!this.active) return;
    this.active = false;
    this.pool.remove(this);
  }

  /** a new look (the same rig) */
  setPerson(person, key) {
    this.person = person;
    if (key) this.key = key;
    this.dirty = true;
  }

  // ------------------------------------------------------------------ animation
  frames() { const a = TF.T && TF.T.anims[this.anim]; return a ? a.frames : 1; }
  frameCount(key) { const p = key.split(':'); const a = TF.T && TF.T.anims[p[2]]; return a ? a.frames : 1; }

  setAnim(anim, baseDir, start) {
    const A = TF.T && TF.T.anims[anim];
    if (!A) anim = 'idle';
    if (anim !== this.anim) { this.anim = anim; this.t = 0; this.frame = Math.max(0, Math.min(this.frames() - 1, start || 0)); this.dirty = true; }
    else if (start) { this.frame = Math.max(0, Math.min(this.frames() - 1, start)); this.dirty = true; }
    if (baseDir !== this.baseDir) { this.baseDir = baseDir; this.dirty = true; }
  }

  /** advance the animation clock */
  tick(dt) {
    const a = TF.T && TF.T.anims[this.anim];
    if (!a || !this.anims.isPlaying) return;
    this.t += dt * 1000 * (this.anims.timeScale || 1);
    const step = 1000 / Math.max(1, a.fps);
    if (this.t < step) return;
    while (this.t >= step) { this.t -= step; this.frame = (this.frame + 1) % a.frames; }
    this.dirty = true;
    const l = this._listener;
    if (l) { this._evAnim.key = this.key + ':' + this.anim + ':' + this.baseDir; this._evFrame.index = this.frame + 1; try { l.fn.call(l.ctx, this._evAnim, this._evFrame); } catch (e) { /* */ } }
    this.anims.currentFrame.index = this.frame + 1;
  }

  /** the dir name the layer rules want (mirrored dirs flip) */
  dirName() { return this.flipX ? (INV_MIRROR[this.baseDir] || this.baseDir) : this.baseDir; }

  // ------------------------------------------------------------------ rig
  /** point the rig's images at this frame's layers */
  refresh() {
    const rig = this.rig;
    this.dirty = false;
    if (!rig || !TF.ok || !this.person) return;
    if (rig.tier === 2) { rig.dot.setTint(this.person._dotTint || (this.person._dotTint = dotTint(this.person))); return; }
    const buf = rig.buf;
    const T = TF.T;
    const n = TF.layersInto(this.person, this.anim, this.dirName(), this.frame, buf);
    const lite = rig.tier === 1;
    let k = 0;
    for (let i = 0; i < n; i++) {
      const l = buf[i];
      if (lite && !liteLayer(T, l.layer)) continue;
      const fr = TF.frame(l.atlas, l.frame);
      if (!fr) continue;
      let img = rig.imgs[k];
      if (!img) { img = this.pool.newImage(); rig.imgs.push(img); }
      if (img.frame !== fr) img.setFrame(fr);
      if (l.head) img.setOrigin(T.headAnchor[0], T.headAnchor[1]); else img.setOrigin(T.anchor[0], T.anchor[1]);
      if (l.tint == null) { if (img.isTinted) img.clearTint(); } else img.setTint(l.tint);
      img.flipX = l.flip;
      img.__dx = l.dx; img.__dy = l.dy; img.__z = l.z; img.__sx = l.sx;
      if (!img.visible) img.setVisible(true);
      k++;
    }
    for (let j = k; j < rig.imgs.length; j++) if (rig.imgs[j].visible) rig.imgs[j].setVisible(false);
    rig.n = k;
  }

  /** move the rig's images to where the doll stands */
  place() {
    const rig = this.rig;
    if (!rig) return;
    const a = this._alpha * this.fade;
    const vis = this._visible && a > 0.003;
    const sx = this.scaleX, sy = this.scaleY;
    const y0 = this.y - this.lift;
    if (rig.tier === 2) {
      const d = rig.dot;
      d.setVisible(vis);
      if (vis) d.setPosition(this.x, y0).setDepth(this._depth).setAlpha(a).setScale(sx, sy);
      return;
    }
    for (let i = 0; i < rig.n; i++) {
      const img = rig.imgs[i];
      if (!vis) { if (img.visible) img.setVisible(false); continue; }
      if (!img.visible) img.setVisible(true);
      img.x = this.x + img.__dx * sx; img.y = y0 + img.__dy * sy;
      img.scaleX = img.__sx * sx; img.scaleY = sy;
      img.alpha = a;
      const dd = this._depth + img.__z * 1e-4;
      if (img.depth !== dd) img.setDepth(dd);
    }
  }
}

function liteLayer(T, layer) {
  if (layer.charCodeAt(0) === 97 && layer.startsWith('arm_')) return true;       // sleeves
  if (layer.startsWith('head.') || layer.startsWith('face.')) return true;
  if (layer.endsWith('.sheen')) return false;
  const dot = layer.indexOf('.');
  const pn = dot > 0 ? layer.slice(0, dot) : layer;
  const P = T.parts[pn];
  return !!(P && LITE_FAMILY.has(P.family) && /\.(main|back)(~hat)?$/.test(layer));
}

function dotTint(person) {
  const c = (person.colors && (person.colors.top || person.colors.hair)) || '#7a8aa8';
  return parseInt(c.slice(1), 16) || 0x7a8aa8;
}

// ------------------------------------------------------------------ pool
export class DollPool {
  /** the pool of a scene (made on first use) */
  static of(gs) { return gs.dollPool || (gs.dollPool = new DollPool(gs)); }

  constructor(gs) {
    this.gs = gs;
    this.dolls = [];
    this.free = [];          // free rigs (full / lite share the image lists)
    this.freeDots = [];
    this.t = 0;
    this.stats = { dolls: 0, full: 0, lite: 0, dot: 0, images: 0 };
    this.low = false;        // low graphics tier (BUILD-B sets it)
    this._list = [];
    gs.events.once('shutdown', () => { this.dolls.length = 0; });
  }

  add(d) { this.dolls.push(d); this.t = 0; }
  remove(d) {
    const i = this.dolls.indexOf(d);
    if (i >= 0) this.dolls.splice(i, 1);
    this.release(d);
  }

  newImage() {
    const img = this.gs.add.image(-9999, -9999, '__WHITE').setVisible(false);
    this.stats.images++;
    return img;
  }

  release(d) {
    const r = d.rig;
    if (!r) return;
    d.rig = null; d.tier = -1;
    if (r.tier === 2) { r.dot.setVisible(false); this.freeDots.push(r); }
    else { for (const img of r.imgs) if (img.visible) img.setVisible(false); r.n = 0; this.free.push(r); }
    if (d.shadow && d.shadow.visible) d.shadow.setVisible(false);
  }

  give(d, tier) {
    if (d.rig && d.rig.tier === tier) return;
    if (d.rig && (d.rig.tier === 2) !== (tier === 2)) this.release(d);
    const fresh = !d.rig;
    if (tier === 2) {
      let r = this.freeDots.pop();
      if (!r) {
        const tex = this.gs.textures.exists('fv_dot') ? 'fv_dot' : makeDotTexture(this.gs);
        r = { tier: 2, dot: this.gs.add.image(0, 0, tex).setOrigin(0.5, 1).setVisible(false) };
      }
      d.rig = r;
    } else {
      let r = d.rig;
      if (!r) { r = this.free.pop() || { imgs: [], buf: [], n: 0 }; d.rig = r; }
      r.tier = tier;
    }
    d.tier = tier;
    d.dirty = true;
    if (fresh && !d.noFade) d.fade = 0;
    if (d.shadow && !d.shadow.visible && d._visible) d.shadow.setVisible(true);
  }

  /** re-tier: the nearest dolls in (or near) the view get rigs, up to the caps */
  assign() {
    const gs = this.gs, P = (BALANCE.v4 && BALANCE.v4.perf) || {};
    const cam = gs.cameras.main, v = cam.worldView;
    const zoom = gs.zoomCur || 1;
    const margin = P.margin !== undefined ? P.margin : 120;
    const cx = v.centerX, cy = v.centerY;
    const maxFull = zoom < 0.7 ? 0 : (this.low ? (P.maxRigsLow || 16) : (P.maxRigs || 32));
    const maxLite = (P.maxLite !== undefined ? P.maxLite : 40) + (zoom < 0.7 ? (P.maxRigs || 32) : 0);
    const dots = zoom < 0.4;
    const list = this._list;
    list.length = 0;
    for (const d of this.dolls) {
      if (!d.active || !d._visible) { if (d.rig) this.release(d); continue; }
      const m = margin + (d.rig ? HYST : 0);
      if (d.x < v.x - m || d.x > v.right + m || d.y < v.y - m || d.y - 110 > v.bottom + m) { if (d.rig) this.release(d); continue; }
      d._dist = Math.abs(d.x - cx) + Math.abs(d.y - cy) * 2;
      list.push(d);
    }
    list.sort((a, b) => a._dist - b._dist);
    let nf = 0, nl = 0, nd = 0;
    for (const d of list) {
      if (dots) { this.give(d, 2); nd++; continue; }
      if (nf < maxFull) { this.give(d, 0); nf++; continue; }
      if (nl < maxLite) { this.give(d, 1); nl++; continue; }
      if (d.rig) this.release(d);
    }
    this.stats.dolls = this.dolls.length; this.stats.full = nf; this.stats.lite = nl; this.stats.dot = nd;
  }

  update(dt) {
    if (!this.dolls.length) return;
    for (const d of this.dolls) if (d._visible) d.tick(dt);
    this.t -= dt;
    if (this.t <= 0) { this.t = 0.25; if (TF.ok) this.assign(); }
    for (const d of this.dolls) {
      if (!d.rig) continue;
      if (d.fade < 1) d.fade = Math.min(1, d.fade + dt / FADE_IN);
      if (d.dirty) d.refresh();
      d.place();
      if (d.shadow) { const sv = d._visible && d._alpha > 0.01; if (d.shadow.visible !== sv) d.shadow.setVisible(sv); }
    }
  }
}

function makeDotTexture(gs) {
  const c = gs.textures.createCanvas('fv_dot', 16, 24);
  const g = c.context;
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(8, 6, 5.5, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(2, 22); g.lineTo(2, 14); g.quadraticCurveTo(8, 8, 14, 14); g.lineTo(14, 22); g.closePath(); g.fill();
  c.refresh();
  return 'fv_dot';
}

export { DIR_BASE, MIRROR };
