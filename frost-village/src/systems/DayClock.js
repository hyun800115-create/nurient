// Day and night (v4, docs/v4_plan.md §6): a 600 s day that starts at 08:00 with the first train.
// One camera-sized MULTIPLY rectangle above the world (below bubbles, labels and arrows; the HUD scene is not
// touched) tints dawn / dusk / night; pooled ADD glows light the street lamps, the village lamp posts and
// campfires, the station clocks, the train's lamp and coach windows. Lights go on at 19:00 one by one from
// the station outward. The economy does not care: only the townsfolk's demand follows the hour.

import { BALANCE } from '../data/balance.js';
import { Audio } from '../core/Audio.js';
import { Settings } from '../core/Save.js';
import { DEPTH } from './DepthSort.js';

const HOUR = 25;

function lerpColor(a, b, f) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255, br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return ((Math.round(ar + (br - ar) * f) << 16) | (Math.round(ag + (bg - ag) * f) << 8) | Math.round(ab + (bb - ab) * f));
}

export class DayClock {
  constructor(gs, saved) {
    this.gs = gs;
    this.D = BALANCE.v4.day;
    const s = saved || {};
    this.on = s.on === true;
    this.T = Number.isFinite(s.T) ? s.T : (Number.isFinite(s.t) && Number.isFinite(s.day) ? s.day * this.dayLen() + s.t : this.D.startHour * HOUR);
    this.cur = { r: 255, g: 255, b: 255, a: 0 };     // smoothed tint (float channels: no rounding stalls)
    this.overlay = null;
    this.glows = [];
    this.lights = [];         // { x, y, k, on, onAt } lamps the night lights up
    this.lightsOn = false;
    this.ligT = 0;
  }

  dayLen() { return Math.max(60, this.D.length || 600); }
  /** game seconds per clock hour */
  get hourLen() { return this.dayLen() / 24; }

  start(T) { if (this.on) return; this.on = true; if (Number.isFinite(T)) this.T = T; }
  hour() { return ((this.T / this.hourLen) % 24 + 24) % 24; }
  day() { return Math.floor(this.T / this.dayLen()); }
  phase(h) {
    h = h === undefined ? this.hour() : h;
    const D = this.D;
    if (h >= D.dawn && h < D.dayStart) return 'dawn';
    if (h >= D.dayStart && h < D.dusk) return 'day';
    if (h >= D.dusk && h < D.night) return 'dusk';
    return 'night';
  }
  /** clock time in TownSim seconds (25 s an hour) */
  simT() { return this.T * (HOUR / this.hourLen); }
  set(h) { this.T = this.day() * this.dayLen() + ((h % 24) + 24) % 24 * this.hourLen; }

  /** the colour the night tint wants at hour h: { color, a } */
  target(h) {
    const D = this.D, dk = D.darkness;
    const NIGHT = 0x5a6aa8, DUSK0 = 0xffb070, DUSK1 = 0x7d88c8, DAWN = 0xffd6b0;
    if (!(Settings.data.daynight !== false && D.on)) return { color: 0xffffff, a: 0 };
    if (h >= D.dayStart && h < D.dusk) return { color: 0xffffff, a: 0 };
    if (h >= D.dusk && h < D.night) {
      const f = (h - D.dusk) / Math.max(0.01, D.night - D.dusk);
      return { color: lerpColor(DUSK0, DUSK1, f), a: 0.12 + (dk * 0.72 - 0.12) * f };
    }
    if (h >= D.dawn && h < D.dayStart) {
      const f = (h - D.dawn) / Math.max(0.01, D.dayStart - D.dawn);
      return { color: lerpColor(NIGHT, DAWN, Math.min(1, f * 2)), a: dk * (1 - f) + 0.15 * f * (1 - f) * 2 };
    }
    return { color: NIGHT, a: dk };
  }

  /** register a lamp the night lights up (x, y = the glowing point; k = size) */
  addLight(x, y, k = 1, order = 0) { this.lights.push({ x, y, k, order, on: false }); }

  update(dt) {
    if (!this.on) return;
    this.T += dt;
    const h = this.hour();
    const gs = this.gs;
    // the tint follows the hour, smoothed over `fade` seconds
    const tg = this.target(h);
    const k = Math.min(1, dt / Math.max(0.2, this.D.fade || 8) * 3);
    const C = this.cur;
    C.a += (tg.a - C.a) * k;
    C.r += (((tg.color >> 16) & 255) - C.r) * k; C.g += (((tg.color >> 8) & 255) - C.g) * k; C.b += ((tg.color & 255) - C.b) * k;
    this.drawOverlay();
    // lights on at 19:00 one by one (from the station outward), off at 06:30
    const D = this.D;
    const want = (Settings.data.daynight !== false && D.on) && (h >= D.lightsOn || h < D.lightsOff);
    if (want !== this.lightsOn) { this.lightsOn = want; this.ligT = 0; if (want) this.lights.sort((a, b) => a.order - b.order); }
    this.ligT += dt;
    for (let i = 0; i < this.lights.length; i++) { const L = this.lights[i]; L.on = this.lightsOn && this.ligT > i * 0.15; }
    this.drawGlows();
    // night ambience
    const night = this.phase(h) === 'night';
    Audio.setAmbience('amb_night', night && gs.v4 && gs.v4.nearTown() ? 0.35 : night ? 0.18 : 0);
  }

  drawOverlay() {
    const gs = this.gs, a = this.cur.a;
    if (a < 0.004) { if (this.overlay) this.overlay.setVisible(false); return; }
    if (!this.overlay) {
      this.overlay = gs.add.rectangle(0, 0, 10, 10, 0xffffff, 1).setOrigin(0, 0).setDepth(DEPTH.FX - 30);
      this.overlay.setBlendMode(Phaser.BlendModes.MULTIPLY);
    }
    const v = gs.cameras.main.worldView, m = 80;
    const o = this.overlay;
    o.setVisible(true);
    o.setPosition(v.x - m, v.y - m);
    o.setSize(v.width + m * 2, v.height + m * 2);
    // multiply by (1 - a) + a * colour: never darker than the readability floor
    const C = this.cur;
    const mix = (ch) => Math.round(255 * (1 - a) + ch * a);
    o.fillColor = (mix(C.r) << 16) | (mix(C.g) << 8) | mix(C.b);
    o.fillAlpha = 1;
  }

  drawGlows() {
    const gs = this.gs;
    const maxG = (BALANCE.v4.perf && BALANCE.v4.perf.maxGlows) || 40;
    const night = this.cur.a > 0.05 && this.lightsOn;
    if (!night) { for (const g of this.glows) if (g.visible) g.setVisible(false); return; }
    const v = gs.cameras.main.worldView, cx = v.centerX, cy = v.centerY;
    const pts = this._pts || (this._pts = []);
    pts.length = 0;
    for (const L of this.lights) if (L.on && L.x > v.x - 120 && L.x < v.right + 120 && L.y > v.y - 120 && L.y < v.bottom + 160) pts.push(L);
    // moving lights: the train's lamp + coach windows
    const nb = gs.v4;
    if (nb && nb.train) { const lp = nb.train.lampPoint(); if (lp) pts.push({ x: lp.x, y: lp.y, k: 1.2 }); nb.train.coachPoints(pts); }
    pts.sort((a, b) => (Math.abs(a.x - cx) + Math.abs(a.y - cy)) - (Math.abs(b.x - cx) + Math.abs(b.y - cy)));
    const n = Math.min(maxG, pts.length);
    if (!gs.textures.exists('fv_glow')) makeGlow(gs);
    const alpha = Math.min(0.75, this.cur.a * 2.2);
    for (let i = 0; i < n; i++) {
      let g = this.glows[i];
      if (!g) { g = gs.add.image(0, 0, 'fv_glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.FX - 29); this.glows.push(g); }
      const p = pts[i];
      g.setVisible(true).setPosition(p.x, p.y).setScale(1.25 * (p.k || 1)).setAlpha(alpha * (0.85 + Math.sin(this.T * 3 + p.x) * 0.05));
    }
    for (let i = n; i < this.glows.length; i++) if (this.glows[i].visible) this.glows[i].setVisible(false);
  }

  serialize() { return { t: Math.round((this.T % this.dayLen()) * 10) / 10, day: this.day(), on: this.on }; }
  state() { const h = this.hour(); return { hour: Math.round(h * 100) / 100, phase: this.phase(h), day: this.day(), on: this.on, tint: Math.round(this.cur.a * 100) / 100, lights: this.lightsOn }; }

  destroy() { if (this.overlay) this.overlay.destroy(); for (const g of this.glows) g.destroy(); this.glows = []; }
}

/** a 96 px soft radial glow (made once, like fv_shadow) */
export function makeGlow(gs) {
  const s = 96, c = gs.textures.createCanvas('fv_glow', s, s);
  const g = c.context;
  const gr = g.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(255,236,180,0.95)');
  gr.addColorStop(0.25, 'rgba(255,214,140,0.55)');
  gr.addColorStop(0.6, 'rgba(255,190,110,0.16)');
  gr.addColorStop(1, 'rgba(255,180,100,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, s, s);
  c.refresh();
}
