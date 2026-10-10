// harbor_runtime view helpers: the game's Assets as a library (pictures by manifest key, character defs, frames of
// an atlas), the few soft textures the harbour draws itself (glow, lighthouse beam, contact shadow, pad), a tiny
// speech bubble for the auctioneer when the game's Bubbles port is not given, and the 8-way facing of a step.

import { Assets } from '../../core/Assets.js';
import { DEPTH } from '../../systems/DepthSort.js';
import { FONT } from '../../data/strings.js';

export const RUIN_TINT = 0x9aa6b4;           // v4 RailStation's ruin tint: the sleepy harbour before it is revived
export const MIRROR = { SW: 'SE', W: 'E', NW: 'NE' };

export function has(key) { try { return !!(Assets.game && Assets.has(key)); } catch (e) { return false; } }
export function sdef(key) { return Assets.m.sprites[key] || null; }
export function cdef(key) { return Assets.charDef(key); }
/** texture key holding `frame` of `atlas` (packed pages aware), or null */
export function tex(atlas, frame) { try { return Assets.texOf(atlas, frame) || null; } catch (e) { return null; } }

/** a static picture by manifest key at its anchor (null when the art is missing: nothing drawn, no placeholder) */
export function put(scene, key, x, y, depth) {
  if (!has(key)) return null;
  const im = Assets.image(scene, x, y, key);
  im.setDepth(depth === undefined ? y : depth);
  return im;
}

/** facing of a step (screen dx, dy) in the 8 iso dirs */
export function dirOf(dx, dy) {
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

function canvasTex(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) return key;
  const c = scene.textures.createCanvas(key, w, h);
  if (!c) return null;
  draw(c.getContext(), w, h);
  c.refresh();
  return key;
}

/** soft round glow (ADD): ship lamps, the lighthouse lens, the harbour lamps */
export function glowTex(scene) {
  if (scene.textures.exists('fv_glow')) return 'fv_glow';      // DayClock's own
  return canvasTex(scene, 'hb_glow', 64, 64, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, 'rgba(255,240,200,1)'); r.addColorStop(0.25, 'rgba(255,214,140,0.55)'); r.addColorStop(1, 'rgba(255,190,110,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, w);
  });
}

/** one lighthouse beam on the ground plane: a long soft wedge from the lens (origin at x 0, centre y) */
export function beamTex(scene) {
  return canvasTex(scene, 'hb_beam', 512, 128, (g, w, h) => {
    const img = g.createImageData(w, h), d = img.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = x / w, half = 4 + u * (h / 2 - 6);          // the wedge widens with the distance
        const v = Math.abs(y - h / 2) / half;
        const edge = v >= 1 ? 0 : Math.pow(1 - v * v, 1.6);
        const along = Math.min(1, u * 9) * Math.pow(1 - u, 1.25);   // fades in from the lens, out toward the end
        const a = edge * along;
        const o = (y * w + x) * 4;
        d[o] = 255; d[o + 1] = 236; d[o + 2] = 180; d[o + 3] = Math.round(255 * a);
      }
    }
    g.putImageData(img, 0, 0);
  });
}

/** soft contact shadow (an ellipse 2:1) */
export function shadowTex(scene) {
  return canvasTex(scene, 'hb_shadow', 64, 32, (g, w, h) => {
    const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    r.addColorStop(0, 'rgba(40,60,90,0.42)'); r.addColorStop(0.6, 'rgba(40,60,90,0.2)'); r.addColorStop(1, 'rgba(40,60,90,0)');
    g.save(); g.scale(1, 0.5); g.fillStyle = r; g.fillRect(0, 0, w, w); g.restore();
  });
}

/** a pad on the quay: an iso diamond 2.4 x 2.4 m with a painted rim and corner ticks (export / auction) */
export function padTex(scene, key, rim, fill) {
  return canvasTex(scene, key, 232, 120, (g, w, h) => {
    const cx = w / 2, cy = h / 2, rx = 106, ry = 53;
    const dia = (k) => { g.beginPath(); g.moveTo(cx, cy - ry * k); g.lineTo(cx + rx * k, cy); g.lineTo(cx, cy + ry * k); g.lineTo(cx - rx * k, cy); g.closePath(); };
    dia(1); g.fillStyle = 'rgba(30,40,60,0.18)'; g.fill();
    dia(0.94); g.fillStyle = fill; g.fill();
    g.lineWidth = 6; g.strokeStyle = rim; dia(0.86); g.stroke();
    g.setLineDash([14, 10]); g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,0.85)'; dia(0.68); g.stroke(); g.setLineDash([]);
  });
}

/**
 * a small speech bubble (the auctioneer's call, a guest's line) — only used when the game's Bubbles port
 * (ports.say) is absent. One per speaker, reused.
 */
export class Bubble {
  constructor(scene) {
    this.scene = scene;
    this.g = scene.add.graphics().setDepth(DEPTH.BUBBLE).setVisible(false);
    this.t = scene.add.text(0, 0, '', { fontFamily: FONT, fontSize: '22px', fontStyle: '900', color: '#2b3a55', align: 'center', resolution: 2 }).setOrigin(0.5, 1).setDepth(DEPTH.BUBBLE + 1).setVisible(false);
    this.life = 0;
    this.x = 0; this.y = 0;
  }
  show(x, y, text, dur = 2.6) {
    this.t.setText(text);
    this.x = x; this.y = y; this.life = dur;
    this.draw();
  }
  draw() {
    const w = this.t.width + 28, h = this.t.height + 16, x = Math.round(this.x), y = Math.round(this.y);
    const g = this.g;
    g.clear();
    g.fillStyle(0x24324a, 0.18); g.fillRoundedRect(x - w / 2 + 3, y - h - 14 + 4, w, h, 14);
    g.fillStyle(0xffffff, 1); g.fillRoundedRect(x - w / 2, y - h - 14, w, h, 14);
    g.fillTriangle(x - 9, y - 15, x + 9, y - 15, x, y - 2);
    g.lineStyle(3, 0x2b3a55, 0.9); g.strokeRoundedRect(x - w / 2, y - h - 14, w, h, 14);
    this.t.setPosition(x, y - 14 - 8);
    g.setVisible(true); this.t.setVisible(true);
  }
  update(dt) {
    if (this.life <= 0) return;
    this.life -= dt;
    const a = Math.min(1, this.life * 3);
    this.g.setAlpha(a); this.t.setAlpha(a);
    if (this.life <= 0) { this.g.setVisible(false); this.t.setVisible(false); }
  }
  destroy() { this.g.destroy(); this.t.destroy(); }
}

/** a tiny label on the ground (pads, the import pile): white rounded chip with dark text */
export class Chip {
  constructor(scene, depth) {
    this.g = scene.add.graphics().setDepth(depth);
    this.t = scene.add.text(0, 0, '', { fontFamily: FONT, fontSize: '19px', fontStyle: '900', color: '#2b3a55', align: 'center', resolution: 2 }).setOrigin(0.5, 0.5).setDepth(depth + 0.5);
    this.text = null;
  }
  set(x, y, text, color = 0xffffff) {
    if (text !== this.text) { this.text = text; this.t.setText(text); }
    const w = this.t.width + 22, h = this.t.height + 8;
    const g = this.g;
    g.clear();
    g.fillStyle(0x1e2a40, 0.22); g.fillRoundedRect(x - w / 2 + 2, y - h / 2 + 3, w, h, h / 2);
    g.fillStyle(color, 0.96); g.fillRoundedRect(x - w / 2, y - h / 2, w, h, h / 2);
    this.t.setPosition(x, y);
    return this;
  }
  visible(v) { this.g.setVisible(v); this.t.setVisible(v); return this; }
  destroy() { this.g.destroy(); this.t.destroy(); }
}

export { Assets, DEPTH };
