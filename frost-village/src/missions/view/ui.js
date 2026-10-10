// Small UI helpers shared by the missions and bank views (house style of src/scenes/UI.js / UIv4.js: 9-slice
// panels, rounded buttons, toy icons, Pretendard text with a soft outline). All sizes are in the UI scene's logical
// 720-wide space. Views only use v4 libraries (Assets, Panel, FONT) and the ports they are given.

import { Assets } from '../../core/Assets.js';
import { panel } from '../../core/Panel.js';
import { FONT } from '../../data/strings.js';

export { panel, Assets };

/** a text style (size px, fill, stroke, stroke width, weight) */
export const TXT = (size, color = '#2b2f3a', stroke = '#ffffff', st = 0, weight = '900') => ({
  fontFamily: FONT, fontSize: size + 'px', fontStyle: weight, color, stroke, strokeThickness: st, resolution: 2,
});

export const COL = {
  ink: '#2b2f3a', soft: '#6b7686', brown: '#5d4632', gold: '#b07a10', green: '#2f8f4e', pink: '#d4426f', white: '#ffffff', blue: '#2a64a8',
  bar: 0xe8a33d, barDone: 0x5cc86a, fame: 0xffc83d, pinkHex: 0xe35d8c,
};

export const has = (k) => { try { return !!k && Assets.has(k); } catch (e) { return false; } };

/** an icon image fitted into `size` px (first key with art; the last key is the fallback) */
export function icon(scene, x, y, keys, size) {
  const list = Array.isArray(keys) ? keys : [keys];
  const k = Assets.pick(...list.filter(Boolean), 'ui_icon_mission');
  const im = Assets.image(scene, x, y, k).setOrigin(0.5);
  im.setScale(size / Math.max(1, im.frame.realWidth, im.frame.realHeight));
  im.__size = size;
  return im;
}

/** re-skin an icon made by icon() */
export function reicon(im, keys) {
  const list = Array.isArray(keys) ? keys : [keys];
  const k = Assets.pick(...list.filter(Boolean), 'ui_icon_mission');
  if (im.__k === k) return im;
  im.__k = k;
  Assets.apply(im, k);
  im.setOrigin(0.5).setScale((im.__size || 40) / Math.max(1, im.frame.realWidth, im.frame.realHeight));
  return im;
}

/** shrink a text object to fit maxW (never grows) */
export function fit(t, maxW, maxH) {
  t.setScale(1);
  let s = Math.min(1, maxW / Math.max(1, t.width));
  if (maxH) s = Math.min(s, maxH / Math.max(1, t.height));
  t.setScale(s);
  return t;
}

/** a button face (ui_button_*): its rim slices need 68 px (32 + 36), so a shorter button draws the face 68 px
 *  tall and scales it down whole (the rim keeps its shape instead of squashing); other panels as they are */
export function face(scene, x, y, key, w, h) {
  if (!/^ui_button_/.test(key) || h >= 68) return panel(scene, x, y, key, w, h);
  const s = h / 68;
  return panel(scene, x, y, key, Math.max(68, w / s), 68).setScale(s);
}

/** a rounded button (style blue / green / gray) with a label; onClick on press */
export function button(scene, x, y, w, h, style, label, onClick, size = 26, sound) {
  const c = scene.add.container(x, y);
  const bg = face(scene, 0, 0, 'ui_button_' + style, w, h).setOrigin(0.5);
  const tx = scene.add.text(0, -3, label, style === 'gray' ? TXT(size, '#ffffff', '#4a5361', 6, '900') : TXT(size, '#ffffff', 'rgba(0,0,0,0.25)', 4, '900')).setOrigin(0.5);
  fit(tx, w - 24);
  c.add([bg, tx]);
  c.bg = bg; c.text = tx;
  c.setSize(w, h);
  c.setInteractive({ useHandCursor: true });
  c.on('pointerdown', (p, lx, ly, ev) => {
    if (ev && ev.stopPropagation) ev.stopPropagation();
    scene.tweens.add({ targets: c, scale: 0.94, duration: 70, yoyo: true });
    if (sound) sound('sfx_click', { volume: 0.5 });
    onClick();
  });
  return c;
}

/** a round white icon button (close, info …) */
export function roundButton(scene, x, y, iconKey, size, onClick, sound) {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  g.fillStyle(0x1f3354, 0.25); g.fillCircle(0, 5, size / 2);
  g.fillStyle(0xffffff, 0.97); g.fillCircle(0, 0, size / 2);
  g.lineStyle(4, 0xd7e3f2, 1); g.strokeCircle(0, 0, size / 2 - 2);
  const ic = icon(scene, 0, 0, [iconKey], size * 0.6);
  c.add([g, ic]);
  c.setSize(size, size);
  c.setInteractive({ useHandCursor: true });
  c.on('pointerdown', (p, lx, ly, ev) => {
    if (ev && ev.stopPropagation) ev.stopPropagation();
    scene.tweens.add({ targets: c, scale: 0.88, duration: 70, yoyo: true });
    if (sound) sound('sfx_click', { volume: 0.5 });
    onClick();
  });
  return c;
}

/**
 * a progress bar from the ui3 trough + fill (tinted). Returns a container with set(f) to update it.
 * (x, y) = left middle.
 */
export function progressBar(scene, x, y, w, h, tint = COL.bar) {
  const c = scene.add.container(x, y);
  const bg = panel(scene, 0, 0, has('ui_progress_bg') ? 'ui_progress_bg' : 'ui_panel', w, h).setOrigin(0, 0.5);
  const fill = panel(scene, 0, 0, has('ui_progress_fill') ? 'ui_progress_fill' : 'ui_panel', h, h).setOrigin(0, 0.5).setTint(tint);
  c.add([bg, fill]);
  c.f = -1;
  c.set = (f, tnt) => {
    f = Math.max(0, Math.min(1, f));
    if (tnt !== undefined) fill.setTint(tnt);
    if (Math.abs(f - c.f) < 0.002) return c;
    c.f = f;
    fill.setVisible(f > 0.001);
    fill.setSize(Math.max(h, h + (w - h) * f), h);
    return c;
  };
  return c;
}

/** a soft drop-shadowed pill (graphics) for small labels in the world or on cards */
export function pill(scene, w, h, fill = 0xfff8ec, line = 0xe2d3b5, alpha = 0.97) {
  const g = scene.add.graphics();
  g.fillStyle(0x1f3354, 0.18); g.fillRoundedRect(-w / 2, -h / 2 + 3, w, h, h / 2);
  g.fillStyle(fill, alpha); g.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  g.lineStyle(3, line, 1); g.strokeRoundedRect(-w / 2 + 1.5, -h / 2 + 1.5, w - 3, h - 3, h / 2 - 1.5);
  return g;
}

/** the icon for a mission kind */
export const KIND_ICON = {
  request: 'ui_icon_request', drive: 'ui_icon_steer', event: 'ui_icon_event', goal: 'ui_icon_goal', explore: 'ui_icon_explore',
  daily: 'ui_icon_calendar', weekly: 'ui_icon_calendar', streak: 'ui_icon_calendar',
};

/** a five-point star into graphics g (centre, outer radius, rotation 0 = point up) */
function starPath(g, x, y, r) {
  const pts = [];
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.48 : r;
    pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr });
  }
  return pts;
}

/**
 * the chief-title badge: the crown (ui_icon_title) over 1–5 small gold stars in a gentle smile (unearned ones grey).
 * The village rank keeps ui_badge_rank_* (docs/v5_v8_plan.md: "fame titles use ui_icon_title + 1–5 small stars").
 * Returns a container; `dim` greys the whole badge (a title not reached yet).
 */
export function titleBadge(scene, x, y, level, size, dim = false) {
  const c = scene.add.container(x, y);
  const crown = icon(scene, 0, -size * 0.14, ['ui_icon_title', 'ui_icon_fame'], size * 0.78);
  const g = scene.add.graphics();
  const r = Math.max(4, size * 0.085);
  for (let k = 0; k < 5; k++) {
    const sx = (k - 2) * r * 2.25, sy = size * 0.39 - Math.abs(k - 2) * Math.abs(k - 2) * r * 0.22;
    const on = k < level && !dim;
    // a soft shadow, the star, its rim and a tiny highlight
    g.fillStyle(0x1f3354, 0.18); g.fillPoints(starPath(g, sx, sy + r * 0.18, r), true);
    g.fillStyle(on ? 0xffc83d : 0xdde2ea, 1); g.fillPoints(starPath(g, sx, sy, r), true);
    g.lineStyle(Math.max(1.5, r * 0.22), on ? 0xb5770f : 0xa7b0bf, 1); g.strokePoints(starPath(g, sx, sy, r), true);
    if (on) { g.fillStyle(0xfff4c2, 0.9); g.fillCircle(sx - r * 0.22, sy - r * 0.2, r * 0.22); }
  }
  c.add([crown, g]);
  if (dim) crown.setTint(0xb8bec8).setAlpha(0.75);
  c.crown = crown;
  return c;
}
