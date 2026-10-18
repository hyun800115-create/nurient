// Small drawing helpers of the 금방 view: safe atlas-frame lookups through Assets (packed pages or raw atlases), the
// soft ground shadow and the lamp glow (canvas textures made once), art headings with their mirrors, text styles.
// Every key has a code stand-in (plan §10.3): when the real art is not there the helpers return null and the
// views fall back (cardboard boxes for parcels, the blue logistics van, runtime text on the name board).

import { Assets } from '../../core/Assets.js';

export const FONT = "'Pretendard', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";
export const GOLD = 0xf2b33d, GOLD_DARK = 0xd9962a, CREAM = 0xf4ede0, NAVY = 0x2b4f7e, CHARCOAL = 0x3b3f52;
export const MIRROR = { SW: 'SE', NW: 'NE', W: 'E' };

/** the rendered heading and whether it is drawn mirrored */
export function baseDir(dk) { const m = MIRROR[dk]; return m ? { base: m, flip: true } : { base: dk, flip: false }; }

/** texture key + frame of an atlas frame (packed page or raw atlas), or null */
export function frameOf(atlas, frame) {
  const tk = Assets.texOf ? Assets.texOf(atlas, frame) : null;
  if (tk) return { tex: tk, frame };
  const tex = Assets.game && Assets.game.textures;
  if (tex && tex.exists(atlas) && tex.get(atlas).has(frame)) return { tex: atlas, frame };
  return null;
}

/** the texture of a sprite key ({ tex, frame, anchor }) or null when its art is not loaded */
export function spriteOf(key) {
  if (!Assets.has || !Assets.m.sprites[key] || !Assets.has(key)) return null;
  const d = Assets.def(key);
  const f = frameOf(d.atlas, d.frame);
  return f ? Object.assign(f, { anchor: d.anchor || [0.5, 0.5], def: d }) : null;
}

/** an Image of a sprite key (manifest anchor) or null */
export function img(scene, key, x = 0, y = 0) {
  const s = spriteOf(key);
  if (!s) return null;
  return scene.add.image(x, y, s.tex, s.frame).setOrigin(s.anchor[0], s.anchor[1]);
}

/** set an Image to a sprite key (anchor too); false when the art is missing */
export function setKey(im, key, frame) {
  const d = Assets.def(key);
  const f = frameOf(d.atlas, frame || d.frame);
  if (!f) return false;
  if (im.texture.key !== f.tex || im.frame.name !== f.frame) im.setTexture(f.tex, f.frame);
  if (d.anchor) im.setOrigin(d.anchor[0], d.anchor[1]);
  return true;
}

/** the first key with art (stand-in chain) */
export function pick(...keys) { for (const k of keys) if (k && Assets.m.sprites[k] && Assets.has(k)) return k; return null; }

/** soft ellipse shadow (vehicles have no baked shadow) */
export function shadowTex(scene) {
  const key = 'gb_shadow';
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

/** a warm round glow (NORMAL blend, plan §11: no batch breaks): lamps, the lit roof sign, the name board at night */
export function glowTex(scene) {
  const key = 'gb_glow';
  if (scene.textures.exists(key)) return key;
  const c = scene.textures.createCanvas(key, 64, 64), ctx = c.getContext();
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,246,214,0.8)'); g.addColorStop(0.6, 'rgba(255,214,140,0.25)'); g.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64); c.refresh();
  return key;
}

/** a text style (the game's look: heavy, a dark outline) */
export function textStyle(size, color = '#ffffff', stroke = '#2b2f3a', st = 6, weight = '800') {
  return { fontFamily: FONT, fontSize: size + 'px', fontStyle: weight, color, stroke, strokeThickness: st, resolution: 2 };
}

/** the eight drawn headings -> the dir a paper doll plays (dolls have S SE E NE N + mirrors) */
export function dollDir(dx, dy) {
  const a = Math.atan2(dy, dx) * 180 / Math.PI;
  if (a > -22.5 && a <= 22.5) return 'E';
  if (a > 22.5 && a <= 67.5) return 'SE';
  if (a > 67.5 && a <= 112.5) return 'S';
  if (a > 112.5 && a <= 157.5) return 'SW';
  if (a > 157.5 || a <= -157.5) return 'W';
  if (a > -157.5 && a <= -112.5) return 'NW';
  if (a > -112.5 && a <= -67.5) return 'N';
  return 'NE';
}

/** the parcel sprite of a box size (stand-in: the cardboard boxes) */
export function parcelKey(size) { return pick('gb_parcel_' + (size || 'm'), 'cardboard_box_' + (size || 'm')) || 'cardboard_box_m'; }

/** the Phaser anim key of a sprite's manifest anim ('spr:<key>:<anim>'), created on first use; null without art */
export function sprAnim(scene, key, anim) {
  let k = Assets.spriteAnim ? Assets.spriteAnim(key, anim) : null;
  if (!k && Assets.spriteAnims && Assets.m.sprites[key]) { Assets.spriteAnims(scene.game, key); k = Assets.spriteAnim(key, anim); }
  return k;
}
