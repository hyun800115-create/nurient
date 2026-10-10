// Drawing helpers of the logistics view: manifest lookups through the game's Assets (packed pages or raw atlases),
// the vehicles convention (2 rendered headings + flipX mirrors, an ellipse shadow drawn by the game), a soft glow,
// and the depth rules of the centre (assets/logistics conventions.cutaway / outsideActors).

import { Assets } from '../../../core/Assets.js';

export const MIRROR = { SW: 'SE', NW: 'NE', W: 'E' };
/** the rendered heading of a heading, and whether it is drawn mirrored */
export function baseDir(dk) { const m = MIRROR[dk]; return m ? { base: m, flip: true } : { base: dk || 'SE', flip: false }; }

/** texture key + frame of an atlas frame (packed page or raw atlas), or null */
export function frameOf(atlas, frame) {
  const tk = Assets.texOf ? Assets.texOf(atlas, frame) : null;
  if (tk) return { tex: tk, frame };
  const tex = Assets.game && Assets.game.textures;
  if (tex && tex.exists(atlas) && tex.get(atlas).has(frame)) return { tex: atlas, frame };
  return null;
}
/** a manifest sprite key's frame (its atlas frame), or null while its page is not there */
export function spriteFrame(key, frame) {
  const d = Assets.m && Assets.m.sprites[key];
  if (!d || !d.atlas) return null;
  return frameOf(d.atlas, frame || d.frame);
}
export const def = (key) => (Assets.m && Assets.m.sprites[key]) || null;

/** an Image of a sprite key at its manifest anchor (null while its art is not there) */
export function spriteImage(scene, key, x, y) {
  const d = def(key); const f = spriteFrame(key);
  if (!d || !f) return null;
  return scene.add.image(x, y, f.tex, f.frame).setOrigin(d.anchor[0], d.anchor[1]);
}

/** soft ellipse shadow (vehicles: no baked shadow; draw shadow[dir] = [w, h, angleDeg] rotated) */
export function shadowTex(scene) {
  const key = 'lgx_shadow';
  if (scene.textures.exists(key)) return key;
  const c = scene.textures.createCanvas(key, 256, 128);
  const ctx = c.getContext();
  const g = ctx.createRadialGradient(128, 64, 6, 128, 64, 128);
  g.addColorStop(0, 'rgba(36,50,84,0.46)'); g.addColorStop(0.55, 'rgba(36,50,84,0.30)'); g.addColorStop(0.8, 'rgba(36,50,84,0.12)'); g.addColorStop(1, 'rgba(36,50,84,0)');
  ctx.save(); ctx.translate(128, 64); ctx.scale(1, 0.5); ctx.translate(-128, -64);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(128, 64, 128, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  c.refresh();
  return key;
}
/** a warm round glow (ADD) */
export function glowTex(scene) {
  const key = 'lgx_glow';
  if (scene.textures.exists(key)) return key;
  const c = scene.textures.createCanvas(key, 64, 64), ctx = c.getContext();
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,246,214,0.8)'); g.addColorStop(0.6, 'rgba(255,214,140,0.25)'); g.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64); c.refresh();
  return key;
}

/**
 * depth of something standing at (x, y) (world) around a big building at anchor (bx, by) with depth D
 * (conventions.outsideActors): in front of either extended front edge -> at least D + 0.02, else plain y-sort
 * (behind the building: kept just below D so it never pokes through the shell).
 */
export function outsideDepth(x, y, bx, by, D, ft) {
  const rx = x - bx, ry = y - by;
  if (ry - rx / 2 > ft.a || ry + rx / 2 > ft.b) return Math.max(y, D + 0.02) + (ry + 600) * 1e-6;
  return Math.min(y, D - 0.5);
}
/** is (rx, ry) (relative to the anchor) inside a polygon [[x, y] ...] */
export function inPoly(rx, ry, poly) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > ry) !== (yj > ry) && rx < ((xj - xi) * (ry - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}

/** 8-way doll dir from a screen move */
export function dirOf(dx, dy) {
  const a = Math.atan2(dy * 2, dx) * 180 / Math.PI;
  const D = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
  return D[((Math.round(a / 45) % 8) + 8) % 8];
}
