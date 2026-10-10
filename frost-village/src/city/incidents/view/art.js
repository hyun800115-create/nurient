// incidents_runtime view helpers: the game's Assets as a library (pictures by manifest key, character defs, sheet
// anims), the late manifests this module reads (civic ruinFor / fenceRings / demolitionLayout, fx_city fireMount /
// hoseAim), 8-way facings, a pooled sheet player, the hose arc (fx_city hoseAim formula), a soft shadow texture and a
// seeded RNG for the view's small choices (so lab captures repeat).

import { Assets } from '../../../core/Assets.js';
import { DEPTH } from '../../../systems/DepthSort.js';
import { dirFromVec, DIRS8 } from '../../../core/Iso.js';

export const MIRROR = { SW: 'SE', W: 'E', NW: 'NE' };
export { Assets, DEPTH };

export function has(key) { try { return !!(Assets.game && Assets.has(key)); } catch (e) { return false; } }
export function sdef(key) { return (Assets.m.sprites && Assets.m.sprites[key]) || null; }
export function cdef(key) { return (Assets.m.characters && Assets.m.characters[key]) || null; }
export function sheetDef(key) { return (Assets.m.spritesheets && Assets.m.spritesheets[key]) || null; }
export function tex(atlas, frame) { try { return Assets.texOf(atlas, frame) || null; } catch (e) { return null; } }
/** a late fragment's raw manifest (civic, fx_city …) */
export function lateMan(f) { return (Assets.lateManifest && Assets.lateManifest[f]) || null; }

/** a static picture by manifest key at its anchor (null when the art is missing: nothing drawn, no placeholder) */
export function put(scene, key, x, y, depth) {
  if (!has(key)) return null;
  const im = Assets.image(scene, Math.round(x), Math.round(y), key);
  im.setDepth(depth === undefined ? y : depth);
  return im;
}

/** facing of a screen step in the 8 iso dirs (the game's own rule: atan2(vy * 2, vx)) */
export function dirOf(dx, dy) { return DIRS8[dirFromVec(dx, dy)]; }
/** the vehicle heading of a step along the iso axes (vehicles render SE / NE, mirror SW / NW) */
export function axisHeading(dx, dy) { return dx >= 0 ? (dy >= 0 ? 'SE' : 'NE') : (dy >= 0 ? 'SW' : 'NW'); }
/** the dir that faces from a toward b */
export function faceTo(ax, ay, bx, by) { return dirOf(bx - ax, by - ay); }

/** seeded RNG (mulberry32) for the view's small choices */
export function rng(seed) {
  let s = seed >>> 0;
  return () => { let t = (s = (s + 0x6D2B79F5) >>> 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function canvasTex(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) return key;
  const c = scene.textures.createCanvas(key, w, h);
  if (!c) return null;
  draw(c.getContext(), w, h);
  c.refresh();
  return key;
}

/** soft contact shadow (an ellipse 2:1) */
export function shadowTex(scene) {
  return canvasTex(scene, 'inc_shadow', 64, 32, (g, w, h) => {
    const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    r.addColorStop(0, 'rgba(40,60,90,0.40)'); r.addColorStop(0.6, 'rgba(40,60,90,0.18)'); r.addColorStop(1, 'rgba(40,60,90,0)');
    g.save(); g.scale(1, 0.5); g.fillStyle = r; g.fillRect(0, 0, w, w); g.restore();
  });
}

/** soft warm glow (ADD) for a night fire / the lit cell window */
export function glowTex(scene) {
  if (scene.textures.exists('fv_glow')) return 'fv_glow';
  return canvasTex(scene, 'inc_glow', 64, 64, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, 'rgba(255,230,190,1)'); r.addColorStop(0.3, 'rgba(255,190,120,0.5)'); r.addColorStop(1, 'rgba(255,160,90,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, w);
  });
}

/**
 * Pooled sprites playing fx sheets (the anim key = the sheet key, Assets.sheetAnims). Loops stay until released;
 * one-shots go back to the pool when they end. Missing art = nothing drawn.
 */
export class SheetPool {
  constructor(scene) { this.scene = scene; this.free = []; this.live = new Set(); }
  play(key, x, y, opts = {}) {
    const S = this.scene;
    const d = sheetDef(key);
    if (!d || !S.textures.exists(key)) return null;
    if (!S.anims.exists(key)) Assets.sheetAnims(S.game, key);
    let s = this.free.pop();
    if (!s) s = S.add.sprite(0, 0, key, 0);
    s.setTexture(key, 0).setVisible(true).setActive(true).setAlpha(opts.alpha === undefined ? 1 : opts.alpha).setScale(opts.scale || 1).setRotation(opts.rot || 0).setFlip(!!opts.flipX, !!opts.flipY);
    const a = d.anchor || [0.5, 0.5];
    s.setOrigin(opts.origin ? opts.origin[0] : a[0], opts.origin ? opts.origin[1] : a[1]);
    s.setPosition(Math.round(x), Math.round(y)).setDepth(opts.depth === undefined ? y : opts.depth);
    s.setBlendMode(opts.add ? 1 : 0);
    if (opts.tint) s.setTint(opts.tint); else s.clearTint();
    s.off('animationcomplete');
    const once = d.repeat === 0 || opts.once;
    if (S.anims.exists(key)) {
      s.play({ key, repeat: once ? 0 : -1, startFrame: opts.frame ? opts.frame % Math.max(1, d.frameCount || 1) : 0, frameRate: opts.fps || d.fps || 12 });
      if (once) s.once('animationcomplete', () => this.release(s));
    }
    this.live.add(s);
    return s;
  }
  release(s) { if (!s || !this.live.has(s)) return; this.live.delete(s); s.stop(); s.off('animationcomplete'); s.setTexture('__DEFAULT').setVisible(false).setActive(false); if (this.free.length < 40) this.free.push(s); else s.destroy(); }
  clear() { for (const s of Array.from(this.live)) this.release(s); }
  destroy() { this.clear(); for (const s of this.free) s.destroy(); this.free = []; }
  get count() { return this.live.size; }
}

/**
 * the hose arc (fx_city manifest hoseAim.arc): points from the nozzle N to the target T, sampled every ~12 px,
 * relative to N; `t` = time in seconds (the sway)
 */
export function hoseArc(N, T, t, step = 12) {
  const dx = T.x - N.x, dy = T.y - N.y, L = Math.hypot(dx, dy) || 1;
  let h = Math.max(8, Math.min(120, 0.3 * Math.abs(dx)));
  h = Math.min(h, Math.max(8, (1.2 * Math.abs(dx) - dy) / 4));
  const b = 0.06 * L * Math.max(0, 1 - Math.abs(dx) / (0.5 * Math.abs(dy) + 1)) + 0.025 * L * Math.sin(1.7 * t);
  let nx = -dy / L, ny = dx / L;
  if (nx < 0) { nx = -nx; ny = -ny; }
  const n = Math.max(4, Math.ceil(L / step));
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const s = k / n, w = 4 * s * (1 - s);
    pts.push({ x: dx * s + nx * b * w, y: dy * s - h * w + ny * b * w });
  }
  return { pts, L };
}

/** the fire table entry of a building sprite key (fx_city fireMount.buildings), or a rule-made one */
export function fireMountOf(key) {
  const fm = lateMan('fx_city') && lateMan('fx_city').fireMount;
  const e = fm && fm.buildings && fm.buildings[key];
  if (e) return e;
  const d = sdef(key) || {};
  const fw = (d.footprint && d.footprint[0]) || 240, top = d.topPx || 200;
  const sheet = fw <= 240 ? 'fx_fire_bld_s' : fw <= 330 ? 'fx_fire_bld_m' : 'fx_fire_bld_l';
  const y = -Math.round(0.8 * top) + Math.round(0.22 * fw);
  return { fires: [[0, y, sheet, 1, 1]], smoke: [8, y - 90, 1], embers: [0, y - 40], glow: [0, y + 4, 1.2], windows: [[-Math.round(0.27 * fw), -Math.round(0.33 * top), false, 0.8]], alarm: [0, -top - 20] };
}

/** civic ruinFor[building key] -> { ruin, scorch, rubble, ring } (the '*' fallback) */
export function ruinOf(key) {
  const c = lateMan('civic');
  const R = (c && c.ruinFor) || {};
  return R[key] || R['*'] || { ruin: 'ruin_m', scorch: 'scorch_decal_m', rubble: 'rubble_pile_m', ring: 'M' };
}
export function fenceRing(ring) { const c = lateMan('civic'); return (c && c.fenceRings && c.fenceRings[ring]) || null; }
export function demolitionOf(ring, side) {
  const c = lateMan('civic');
  const D = c && c.demolitionLayout && c.demolitionLayout[ring];
  if (!D) return null;
  return (D.sides && (D.sides[side] || D.sides[D.default || 'Y-'])) || D;
}
