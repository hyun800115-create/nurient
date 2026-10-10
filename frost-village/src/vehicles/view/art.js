// Small drawing helpers of the vehicles view: the soft ground shadow and the lamp glow (made once as canvas
// textures), art headings with their mirrors, safe frame lookups through Assets (packed pages or raw atlases).

import { Assets } from '../../core/Assets.js';

export const MIRROR = { SW: 'SE', NW: 'NE' };
/** the rendered heading of an art heading, and whether it is drawn mirrored */
export function baseDir(dk) { const m = MIRROR[dk]; return m ? { base: m, flip: true } : { base: dk, flip: false }; }

/** soft ellipse shadow (the vehicles manifest: NO baked shadow; draw shadow[dir] = [w, h, angleDeg] rotated) */
export function shadowTex(scene) {
  const key = 'veh_shadow';
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

/** a warm round lamp glow (ADD blend), and a narrow forward beam for headlights */
export function glowTex(scene) {
  const key = 'veh_glow';
  if (!scene.textures.exists(key)) {
    const c = scene.textures.createCanvas(key, 64, 64), ctx = c.getContext();
    const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,246,214,0.8)'); g.addColorStop(0.6, 'rgba(255,214,140,0.25)'); g.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64); c.refresh();
  }
  const beam = 'veh_beam';
  if (!scene.textures.exists(beam)) {
    const c = scene.textures.createCanvas(beam, 128, 48), ctx = c.getContext();
    const g = ctx.createLinearGradient(0, 24, 128, 24);
    g.addColorStop(0, 'rgba(255,244,205,0.55)'); g.addColorStop(1, 'rgba(255,244,205,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 20); ctx.lineTo(128, 0); ctx.lineTo(128, 48); ctx.lineTo(0, 28); ctx.closePath(); ctx.fill(); c.refresh();
  }
  return key;
}

/** texture key + frame of an atlas frame (packed page or raw atlas), or null */
export function frameOf(atlas, frame) {
  const tk = Assets.texOf ? Assets.texOf(atlas, frame) : null;
  if (tk) return { tex: tk, frame };
  const tex = Assets.game && Assets.game.textures;
  if (tex && tex.exists(atlas) && tex.get(atlas).has(frame)) return { tex: atlas, frame };
  return null;
}

/** an Image of a sprite key (the manifest anchor), or null while its art is not there */
export function spriteImage(scene, key, x, y) {
  if (!Assets.has(key)) return null;
  return Assets.image(scene, x, y, key);
}
