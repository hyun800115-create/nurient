// (v4.3 마을 깃발, scratchpad v43/flag/spec.md) the village's own flag on every village pole, waving in the wind.
//
//   - ONE shared canvas texture `fv_flag` (124 x 136): the flag drawn at ~1.7x its world size (70 x 44 px) with the world's
//     iso lean baked in; its frames are vertical strips (`w12_i`, `w8_i`) and `full`. Changing the flag redraws it once:
//     every pole changes at once.
//   - every WORLD.decor 'flag_pole' (Game.buildDecor hands them over) becomes a bare pole — its picture re-framed to the
//     part under the old baked banner (fv_fp_base) + the plain pole stretched over the rest (fv_fp_mast) + the finial
//     (fv_fp_top), all frames of the props page that is already there — and the flag hangs behind it as N strips.
//   - the 마을회관's right flagpole (fxPoint flagR) gets it too; the small red banner baked into the hall picture is painted
//     out once by a tiny patch made from the hall's own pixels.
//   - waving: each strip moves up / down on a travelling wave and is tinted light / shade per vertex (no Rope / Mesh: the
//     strips batch with the world, work in the Canvas renderer too, and the Culler treats them like any picture). Updated
//     at <= 30 Hz (15 Hz and gentler on 저사양), only for poles near the view.
//   - the new-game maker (FlagMaker 'new', right when the UI scene is made), the one-time card for an old village (after
//     the tutorial has handed over), the settings row (FlagMaker.flagRow) — FlagMaker.js.
import { Assets } from '../core/Assets.js';
import { Input } from '../core/Input.js';
import { CLASSIC, sanitizeFlag, randomFlag, drawFlag, plain, sameFlag, describe, flagKey, flagRng } from './design.js';
import { FlagMaker } from './FlagMaker.js';

export const TEX = 'fv_flag';
const SC = 2;                       // texture px per world px (at k = 0.5)
const FW = 120, FH = 76;            // the flag box in texture px (70 x 44 world px on a village pole: K below)
const K = 0.58;                     // world px per texture px on a village pole (a 4 m pole: a 1.1 x 0.7 m flag)
const SKEW = 0.46;                  // px down per px along (the baked banners lean the same way)
const PAD = 2;
export const TEX_W = FW + PAD * 2, TEX_H = Math.ceil(FH + SKEW * FW) + PAD * 2;
// the props `flag_pole` picture, trimmed px (221 x 336): the finial rows 0-15, the plain pole x 26-33, the old banner
// touches the pole on rows 16-80; rows >= 82 are the lower pole, the base block and the shadow
const FP = { w: 221, h: 336, base: 82, mastX: 26, mastW: 8, mastY0: 90, mastH: 10, topX: 18, topW: 24, topH: 16, flagTop: 17, poleR: 30 };
const HALL = { dx: 1, dy: -9, w: 40, patch: [-4, -14, 38, 50] };     // from the hall's flagR fxPoint (world px)

const webdriver = () => { try { return !!(typeof navigator !== 'undefined' && navigator.webdriver); } catch (e) { return false; } };
const W = () => (typeof window !== 'undefined' ? window : {});
/** may the flag maker / card show? Players: always. Automated browsers (test suites, bots): only when asked —
 *  window.__FV_FLAGMAKER = true or ?flagmaker=1 (and, for the new-game maker only, the onboarding opt-in __FV_ONBOARD) */
export function flagUiAllowed(card) {
  const w = W();
  if (w.__FV_FLAGMAKER === true) return true;
  if (w.__FV_FLAGMAKER === false) return false;
  try { const q = w.location ? /[?&]flagmaker=([01])/.exec(w.location.search || '') : null; if (q) return q[1] === '1'; } catch (e) { /* */ }
  if (!webdriver()) return true;
  return !card && w.__FV_ONBOARD === true;
}
const reducedMotion = () => { try { return !!(W().matchMedia && W().matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } };
const hash = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); };
const grey = (b) => { const v = Math.max(0, Math.min(255, Math.round(b * 255))); return (v << 16) | (v << 8) | v; };

/** the shared flag texture (made once per game; redrawn when the flag changes) */
export function flagTexture(textures, flag) {
  let tex = textures.exists(TEX) ? textures.get(TEX) : null;
  if (!tex) {
    tex = textures.createCanvas(TEX, TEX_W, TEX_H);
    if (!tex) return null;
    tex.add('full', 0, 0, 0, TEX_W, TEX_H);
    for (const n of [12, 8]) for (let i = 0; i < n; i++) tex.add('w' + n + '_' + i, 0, PAD + (i * FW) / n, 0, FW / n, TEX_H);
  }
  const key = flagKey(flag);
  if (tex.__fvFlag !== key) {
    const ctx = tex.context;
    ctx.clearRect(0, 0, TEX_W, TEX_H);
    drawFlag(ctx, flag, PAD, PAD, FW, FH, { skew: SKEW });
    tex.refresh();
    tex.__fvFlag = key;
  }
  return tex;
}

/** N strip pictures of the shared texture: the flag's hoist top at (ax, ay), k world px per texture px */
export function makeStrips(scene, n, ax, ay, k, depth) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(scene.add.image(ax + ((i * FW) / n) * k, ay - PAD * k, TEX, 'w' + n + '_' + i).setOrigin(0, 0).setScale(k).setDepth(depth));
  return out;
}

/**
 * one wave step for a set of strips: wind w (~1), time T (s), phase ph, amplitude A (world px at the fly), rest y0 (the
 * strips' y without the wave), shade (false: no tint — Canvas / still)
 */
export function waveStrips(strips, T, ph, A, w, y0, shade) {
  const n = strips.length, om = 2 * Math.PI * 0.85 * w, om2 = om * 1.7;
  for (let i = 0; i < n; i++) {
    const um = (i + 0.5) / n;
    const dy = A * Math.pow(um, 0.85) * (Math.sin(6.9 * um - om * T + ph) + 0.22 * Math.sin(14.5 * um - om2 * T + ph * 1.7));
    const s = strips[i];
    s.y = y0 + dy;
    if (shade) {
      const u0 = i / n, u1 = (i + 1) / n;
      const b0 = 1 - 0.1 * (0.3 + 0.7 * u0) * (1 + Math.cos(6.9 * u0 - om * T + ph));
      const b1 = 1 - 0.1 * (0.3 + 0.7 * u1) * (1 + Math.cos(6.9 * u1 - om * T + ph));
      const c0 = grey(b0), c1 = grey(b1);
      s.setTint(c0, c1, c0, c1);
    }
  }
}

export class VillageFlags {
  /**
   * sv: the saved game (or {}); isNew: a brand-new village (no save, not a quarantine restart — Onboarding's rule)
   */
  constructor(gs, sv, isNew) {
    this.gs = gs;
    const saved = sanitizeFlag(sv && sv.flag);
    this.has = !!saved;                       // the village has its own flag (or was offered the card): written to the save
    this.spec = saved ? plain(saved) : plain(CLASSIC);
    this.mk = false;                          // the new-game maker is (still) to be shown
    this.isNew = !!isNew;
    if (saved && saved.mk && flagUiAllowed(false)) this.mk = true;
    else if (!saved && isNew && flagUiAllowed(false)) { this.spec = randomFlag(); this.has = true; this.mk = true; }
    this.cardShown = false;
    this.cardT = 0;
    this.T = flagRng() * 100;
    this.acc = 0;
    this.pollT = 0;
    this.poles = [];
    this.hall = null;
    this.stats = { ticks: 0, ms: 0, waved: 0, last: 0 };
    this.canvasR = !!(gs.sys.game.renderer && gs.sys.game.renderer.type === Phaser.CANVAS);
    this.reduced = reducedMotion();
    flagTexture(gs.textures, this.spec);
    for (const d of gs.flagPoleImgs || []) { try { this.addDecorPole(d); } catch (e) { console.warn('[FrostVillage] flag pole:', e && e.message); } }
    if (this.mk) this.armMaker();
    gs.events.once('shutdown', () => this.destroy());
    this.installHooks();
  }

  // ------------------------------------------------------------------ poles
  /** the props flag_pole picture -> bare pole + waving flag (false when the picture is not the expected one) */
  addDecorPole(d) {
    const gs = this.gs, img = d.img;
    if (!img || !img.frame || !img.texture || img.flipX) return false;
    const r = Assets.sprite('flag_pole');
    if (r.ph || r.pending || img.texture.key !== r.tex) return false;
    const F = img.frame;
    if (F.rotated || Math.abs(F.cutWidth - FP.w) > 2 || Math.abs(F.cutHeight - FP.h) > 2) return false;
    const T = img.texture;
    const add = (name, tx, ty, w, h) => { if (!T.has(name)) T.add(name, F.sourceIndex, F.cutX + tx, F.cutY + ty, w, h); return name; };
    const fBase = add('fv_fp_base', 0, FP.base, F.cutWidth, F.cutHeight - FP.base);
    const fMast = add('fv_fp_mast', FP.mastX, FP.mastY0, FP.mastW, FP.mastH);
    const fTop = add('fv_fp_top', FP.topX, 0, FP.topW, FP.topH);
    const sx = img.scaleX, sy = img.scaleY;
    // trimmed px (tx, ty) -> world (before the re-frame)
    const ox = F.x - img.displayOriginX, oy = F.y - img.displayOriginY;
    const wx = (tx) => img.x + (ox + tx) * sx, wy = (ty) => img.y + (oy + ty) * sy;
    const depth = img.depth;
    // the decor picture itself becomes the base (zone / region / culler / collider logic keep working on it)
    img.setFrame(fBase);
    img.setDisplayOrigin(-(ox), -(oy + FP.base));
    const mast = gs.add.image(wx(FP.mastX), wy(FP.flagTop - 2), T.key, fMast).setOrigin(0, 0).setScale(sx, ((FP.base + 1 - FP.flagTop + 2) / FP.mastH) * sy).setDepth(depth + 0.0004);
    const top = gs.add.image(wx(FP.topX), wy(0), T.key, fTop).setOrigin(0, 0).setScale(sx, sy).setDepth(depth + 0.0006);
    const k = K * sx;
    const ax = wx(FP.poleR), ay = wy(FP.flagTop);
    const n = this.lowNow() ? 8 : 12;
    const strips = makeStrips(gs, n, ax, ay, k, depth - 0.01);
    const P = { kind: 'decor', src: img, parts: [mast, top], strips, n, ax, ay, k, y0: ay - PAD * k, ph: hash(d.x, d.y) * Math.PI * 2, A: 2.4 * sx, x: d.x, y: d.y, shown: true };
    this.follow(P);           // (a pole in land still under the fog: hidden from the first frame, like its picture)
    this.poles.push(P);
    return true;
  }

  /** the town hall's right flagpole (fxPoint flagR): its baked banner painted out, the village flag on it */
  addHallPole(th) {
    const gs = this.gs, img = th.bld.img;
    const def = Assets.def('town_hall');
    const fr = (def.fxPoints && def.fxPoints.flagR) || [57, -66];
    const fx = img.x + fr[0], fy = img.y + fr[1];
    const patch = this.hallPatch(img, fx, fy);
    const k = HALL.w / FW;
    const ax = fx + HALL.dx, ay = fy + HALL.dy;
    const depth = img.depth + 0.002;
    const strips = makeStrips(gs, 12, ax, ay, k, depth);
    const P = { kind: 'hall', src: img, parts: patch ? [patch] : [], strips, n: 12, ax, ay, k, y0: ay - PAD * k, ph: 1.3, A: 1.5, x: fx, y: fy, shown: true, frame: img.frame, th };
    this.follow(P);
    this.poles.push(P);
    this.hall = P;
    return P;
  }

  /** a little picture of the hall's own pixels around its baked red banner, the banner painted out (column-wise from the
   *  wall above and below it — the hall's lines there are vertical). null when the pixels cannot be read. */
  hallPatch(img, fx, fy) {
    const gs = this.gs;
    try {
      const F = img.frame, src = img.texture.getSourceImage(F.sourceIndex);
      const [px, py, pw, ph] = HALL.patch;
      // world (fx + px, fy + py) -> frame px
      const tx0 = Math.round((fx + px - img.x) / img.scaleX + img.displayOriginX - F.x), ty0 = Math.round((fy + py - img.y) / img.scaleY + img.displayOriginY - F.y);
      if (tx0 < 0 || ty0 < 0 || tx0 + pw > F.cutWidth || ty0 + ph > F.cutHeight) return null;
      const key = 'fv_flag_hallpatch';
      const tex = gs.textures.exists(key) ? gs.textures.get(key) : gs.textures.createCanvas(key, pw, ph);
      if (!tex) return null;
      const ctx = tex.context;
      ctx.clearRect(0, 0, pw, ph);
      ctx.drawImage(src, F.cutX + tx0, F.cutY + ty0, pw, ph, 0, 0, pw, ph);
      const im = ctx.getImageData(0, 0, pw, ph), d = im.data;
      const flagPx = (i) => { const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3]; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return a > 30 && mx > 0 && (mx - mn) / mx > 0.3 && r > g + 16 && r > b + 28; };
      // the flag pixels below the finial (the gold ball sits above the banner: rows before the first red row are left)
      let mask = new Uint8Array(pw * ph), top = ph;
      for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) if (flagPx((y * pw + x) * 4) && d[(y * pw + x) * 4 + 1] < 140) { top = Math.min(top, y); }
      for (let y = top; y < ph; y++) for (let x = 0; x < pw; x++) if (flagPx((y * pw + x) * 4)) mask[y * pw + x] = 1;
      // grow by one px (its soft edge)
      const m2 = new Uint8Array(mask);
      for (let y = top; y < ph; y++) for (let x = 0; x < pw; x++) {
        if (mask[y * pw + x]) continue;
        for (let q = -1; q <= 1 && !m2[y * pw + x]; q++) for (let p = -1; p <= 1; p++) { const xx = x + p, yy = y + q; if (xx >= 0 && yy >= 0 && xx < pw && yy < ph && mask[yy * pw + xx]) { m2[y * pw + x] = 1; break; } }
      }
      mask = m2;
      let n = 0;
      for (let x = 0; x < pw; x++) {
        for (let y = 0; y < ph; y++) {
          if (!mask[y * pw + x]) continue;
          let y0 = y; while (y0 >= 0 && mask[y0 * pw + x]) y0--;
          let y1 = y; while (y1 < ph && mask[y1 * pw + x]) y1++;
          for (let yy = Math.max(0, y0 + 1); yy < Math.min(ph, y1); yy++) {
            const f = y1 - y0 > 0 ? (yy - y0) / (y1 - y0) : 0.5, i = (yy * pw + x) * 4;
            const ia = y0 >= 0 ? (y0 * pw + x) * 4 : -1, ib = y1 < ph ? (y1 * pw + x) * 4 : -1;
            for (let c = 0; c < 4; c++) {
              const va = ia >= 0 ? d[ia + c] : d[ib + c], vb = ib >= 0 ? d[ib + c] : d[ia + c];
              d[i + c] = Math.round(va + (vb - va) * f);
            }
            mask[yy * pw + x] = 0; n++;
          }
          y = y1;
        }
      }
      ctx.putImageData(im, 0, 0);
      tex.refresh();
      this.patchPx = n;
      const pi = gs.add.image(fx + px, fy + py, key).setOrigin(0, 0).setScale(img.scaleX, img.scaleY).setDepth(img.depth + 0.001);
      return pi;
    } catch (e) { this.patchErr = String(e && e.message); return null; }
  }

  dropHall() {
    const P = this.hall;
    if (!P) return;
    for (const o of P.strips.concat(P.parts)) o.destroy();
    this.poles.splice(this.poles.indexOf(P), 1);
    this.hall = null;
  }

  /** every 0.5 s: the hall's picture arrived / changed / went */
  pollHall() {
    const th = this.gs.townHall, img = th && th.bld && th.bld.img;
    const real = !!(img && img.scene && img.frame && img.frame.name === (Assets.def('town_hall').frame || 'town_hall') && img.texture && img.texture.key !== '__MISSING');
    if (this.hall && (!real || this.hall.src !== img || this.hall.frame !== img.frame)) this.dropHall();
    if (!this.hall && real) this.addHallPole(th);
  }

  lowNow() { return !!this.gs.gfxLow; }

  /** the flag and the pole parts follow their picture: shown / hidden (fog, parked far away), its alpha (fade-in, x-ray) */
  follow(P) {
    const src = P.src;
    const show = !!(src && src.scene && src.visible && src.alpha > 0.01 && (P.kind !== 'decor' || src.displayList));
    if (show !== P.shown) { P.shown = show; for (const o of P.strips) o.setVisible(show); for (const o of P.parts) o.setVisible(show); }
    if (show && P.alpha !== src.alpha) { P.alpha = src.alpha; for (const o of P.strips) o.setAlpha(src.alpha); for (const o of P.parts) o.setAlpha(src.alpha); }
    return show;
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    const gs = this.gs;
    this.T += dt;
    this.pollT -= dt;
    if (this.pollT <= 0) { this.pollT = 0.5; this.pollHall(); this.checkCard(0.5); }
    const low = this.lowNow();
    const hz = low ? 15 : 30;
    this.acc += dt;
    if (this.acc < 1 / hz) return;
    this.acc = 0;
    const t0 = performance.now();
    const v = gs.cameras.main.worldView, M = 160;
    const w = this.wind();
    const still = this.reduced;
    let waved = 0;
    for (const P of this.poles) {
      if (!this.follow(P)) continue;
      if (P.ax + 70 < v.x - M || P.ax - 10 > v.right + M || P.ay + 70 < v.y - M || P.ay - 30 > v.bottom + M) continue;
      waveStrips(P.strips, still ? 0 : this.T, P.ph, still ? 0 : P.A * (low ? 0.55 : 1) * (0.75 + 0.25 * w), low ? w * 0.7 : w, P.y0, !this.canvasR);
      waved++;
    }
    const ms = performance.now() - t0;
    this.stats.ticks++; this.stats.ms += ms; this.stats.waved = waved; this.stats.last = ms;
  }

  /** the wind: slow gusts (and a weather value, if the game ever gets one: heavy snow / blizzard blow harder) */
  wind() {
    const T = this.T;
    let k = 1;
    try {
      const wk = this.gs.weatherKind ? this.gs.weatherKind() : null;
      if (wk === 'blizzard' || wk === 'heavy') k = 1.6; else if (wk === 'snow') k = 1.2; else if (wk === 'clear' || wk === 'sunny' || wk === 'mild') k = 0.85;
    } catch (e) { k = 1; }
    return k * (1 + 0.18 * Math.sin(T * 0.31) + 0.12 * Math.sin(T * 0.83 + 1.7));
  }

  // ------------------------------------------------------------------ the flag
  /** a new flag from the maker: every pole at once, kept in the save */
  setFlag(f) {
    const c = sanitizeFlag(f);
    if (!c) return false;
    this.spec = plain(c);
    this.has = true;
    flagTexture(this.gs.textures, this.spec);
    return true;
  }
  serialize() { return this.has ? Object.assign(plain(this.spec), this.mk ? { mk: 1 } : {}) : undefined; }

  /** the new-game maker: opened as the UI scene is made (the Game is paused under it: the tutorial starts after) */
  armMaker() {
    const gs = this.gs, ui = gs.scene.get('UI');
    if (!ui) return;
    const go = () => { if (this.mk && gs.sys && gs.sys.isActive()) FlagMaker.open(ui, this, 'new'); };
    if (ui.ready && ui.sys.isActive() && ui.gs === gs) { go(); return; }
    ui.sys.events.once('create', go);
    gs.events.once('shutdown', () => ui.sys.events.off('create', go));
  }
  /** the maker's 이대로 시작 / 완료 */
  commit(f, mode) {
    const changed = !sameFlag(f, this.spec);
    this.setFlag(f);
    this.mk = false;
    try { this.gs.save(true); } catch (e) { /* */ }
    return changed || mode === 'new';
  }

  /** busy = something holds the screen (the card and the settings row wait / say so) */
  busy() {
    const gs = this.gs, ui = gs.scene.get('UI');
    if (!ui || !ui.ready) return 'ui';
    if (ui.panelOpen || ui.buildOpen || ui.v4PanelOpen || ui.v42PanelOpen || ui.adminOpen) return 'panel';
    if (gs.v4 && gs.v4.rank && gs.v4.rank.ceremonyOn) return 'ceremony';
    if (gs.overview || Input.override) return 'view';
    if (gs.v42 && gs.v42.pilot && gs.v42.pilot.on) return 'pilot';
    if (ui.bannerBox && ui.bannerBox.visible) return 'banner';
    if (gs.residentChat && gs.residentChat.isOpen) return 'chat';
    return null;
  }
  /** the tutorial still holds the village (the maker / card wait) */
  inTutorial() {
    const gs = this.gs, ob = gs.onboard;
    return !!((gs.tutorial && gs.tutorial.inTutorial) || (ob && (ob.mode === 'act1' || ob.mode === 'act2' || ob.mode === 'tour')));
  }

  /** an old village (no flag of its own): once, after the tutorial has handed over and nothing else is up */
  checkCard(dt) {
    if (this.has || this.cardShown || this.mk || !flagUiAllowed(true)) return;
    if (this.inTutorial() || this.busy()) { this.cardT = 0; return; }
    this.cardT += dt;
    if (this.cardT < 20) return;
    const ui = this.gs.scene.get('UI');
    this.cardShown = true;
    this.has = true;          // offered once: the classic flag is now the village's own (written with the next save)
    FlagMaker.card(ui, this);
  }

  // ------------------------------------------------------------------ test hooks / teardown
  state() {
    const ui = this.gs.scene.get('UI'), mk = ui && ui.flagMaker;
    return {
      spec: plain(this.spec), names: describe(this.spec), has: this.has, mk: this.mk, cardShown: this.cardShown,
      tex: this.gs.textures.exists(TEX) ? this.gs.textures.get(TEX).__fvFlag : null,
      maker: mk ? mk.state() : { open: false, mode: null, tab: null, card: false, hit: null },
      poles: this.poles.map((P) => ({ kind: P.kind, x: Math.round(P.x), y: Math.round(P.y), ax: Math.round(P.ax), ay: Math.round(P.ay), shown: P.shown, n: P.n, tex: P.strips.every((q) => q.texture && q.texture.key === TEX) ? TEX : null, bare: P.kind !== 'decor' || (P.src.frame && P.src.frame.name === 'fv_fp_base'), dy: +(P.strips[P.n - 1].y - P.y0).toFixed(2), tint: P.strips[P.n - 1].tintTopLeft })),
      hall: this.hall ? { x: Math.round(this.hall.x), y: Math.round(this.hall.y), patch: !!this.hall.parts.length, patchPx: this.patchPx || 0 } : null,
      patchErr: this.patchErr || null,
      stats: Object.assign({ avgMs: this.stats.ticks ? +(this.stats.ms / this.stats.ticks).toFixed(4) : 0 }, this.stats),
      low: this.lowNow(), canvas: this.canvasR, reduced: this.reduced,
    };
  }
  installHooks() {
    const F = W().__FV;
    if (!F) return;
    const self = this;
    F.flag = () => self.state();
    F.flagSet = (f) => self.setFlag(f);
    F.flagOpen = (mode) => { const ui = self.gs.scene.get('UI'); return ui ? FlagMaker.open(ui, self, mode || 'edit') : false; };
  }
  destroy() {
    this.poles.length = 0;
    this.hall = null;
  }
}
