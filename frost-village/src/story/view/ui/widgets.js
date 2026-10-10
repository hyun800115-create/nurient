// Small shared UI helpers for the story panels (view layer). Layout is in the game's 720-wide logical space (the UI
// camera zooms by View.k). Panels come from the finished fx_city ui4 art (ui_newspaper*, ui_story_card*) and the
// base ui set (ui_panel, ui_button_*), through art.nine / art.image.

export const FONT = "Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";
export const INK = '#2b2f3a', SOFT = '#5d6b80', NEWS_INK = '#3a3226';

export function text(scene, x, y, str, o = {}) {
  const t = scene.add.text(x, y, str, {
    fontFamily: o.font || FONT, fontSize: (o.size || 22) + 'px', fontStyle: o.weight || '800', color: o.color || INK,
    align: o.align || 'left', lineSpacing: o.lineSpacing === undefined ? 4 : o.lineSpacing, resolution: 2,
    wordWrap: o.wrap ? { width: o.wrap, useAdvancedWrap: true } : undefined,
  });
  t.setOrigin(o.ox || 0, o.oy || 0);
  return t;
}

/** a rounded button from the base ui set (falls back to a flat rounded rectangle) */
export function button(scene, art, x, y, w, h, label, onTap, o = {}) {
  const c = scene.add.container(x, y);
  const bg = art.nine(scene, 0, 0, o.key || 'ui_button_blue', w, h) || flat(scene, w, h, o.fill || 0x3d8be0);
  if (bg.setOrigin) bg.setOrigin(0.5, 0.5);
  const t = text(scene, 0, -2, label, { size: o.size || 22, color: o.color || '#ffffff', align: 'center', ox: 0.5, oy: 0.5 });
  c.add([bg, t]);
  c.setSize(w, h);
  c.setInteractive({ useHandCursor: true });
  c.on('pointerdown', () => { scene.tweens.add({ targets: c, scale: 0.94, duration: 60, yoyo: true }); if (onTap) onTap(); });
  c.label = t;
  return c;
}

export function flat(scene, w, h, fill, line = 0xe2d3b5, r = 18) {
  const g = scene.add.graphics();
  g.fillStyle(0x1f3354, 0.16).fillRoundedRect(-w / 2, -h / 2 + 4, w, h, r);
  g.fillStyle(fill, 1).fillRoundedRect(-w / 2, -h / 2, w, h, r);
  g.lineStyle(3, line, 1).strokeRoundedRect(-w / 2 + 1.5, -h / 2 + 1.5, w - 3, h - 3, r);
  return g;
}

/** an icon from an atlas (ui4_icons, emotes) fitted to `size` px */
export function icon(scene, art, x, y, key, size) {
  const img = art.image(scene, x, y, key);
  if (!img) return null;
  img.setOrigin(0.5, 0.5);
  const s = size / Math.max(1, Math.max(img.width, img.height));
  img.setScale(s);
  return img;
}

/** pop a container in (scale + alpha) */
export function popIn(scene, c, from = 0.85) {
  c.setScale(from).setAlpha(0);
  scene.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 260, ease: 'Back.Out' });
}
