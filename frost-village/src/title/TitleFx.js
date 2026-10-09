// Small procedural textures of the title (made once with canvas 2D, a few hundred KB of texture memory in
// all, removed by TitleAssets.release): sky gradients, stars, aurora curtains, far mountains, horizon haze,
// the lighthouse beam, the logo shine band, a moon. The title_art pictures (assets/title) replace the
// sky / mountains / aurora / stars when they exist (see TitleSky.js).

import { TitleAssets } from './TitleAssets.js';

const SKY = {
  // top, upper, lower, horizon
  day: ['#5aa6e6', '#8cc6f1', '#c8e5f8', '#eef7fd'],
  dusk: ['#2c3a7c', '#7c6aa8', '#e48f94', '#ffcf94'],
  night: ['#060c26', '#0f1d4a', '#1d3570', '#3c5c9a'],
};

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function canvasTex(scene, key, w, h, draw) {
  const tm = scene.textures;
  if (tm.exists(key)) return key;
  const ct = tm.createCanvas(key, w, h);
  if (!ct) return null;
  const ctx = ct.getContext();
  draw(ctx, w, h);
  ct.refresh();
  TitleAssets.keys.add(key);        // removed with the rest of the title's textures (TitleAssets.release)
  return key;
}

const MAKERS = {};

export const TitleFx = {
  SKY,

  /** the texture `key` (made on first use); only what a scene really draws is ever made */
  ensure(scene, key) {
    if (scene.textures.exists(key)) return key;
    if (!MAKERS.ready) this.defineMakers();
    const m = MAKERS[key];
    return m ? m(scene) : null;
  },

  /** textures every title needs (the rest are stand-ins for missing title art, made on demand) */
  make(scene) {
    for (const k of ['ttl_fx_haze', 'ttl_fx_beam']) this.ensure(scene, k);
  },

  defineMakers() {
    MAKERS.ready = true;
    const def = (key, fn) => { MAKERS[key] = (scene) => fn(scene); };
    for (const name in SKY) {
      def('ttl_fx_sky_' + name, (scene) => canvasTex(scene, 'ttl_fx_sky_' + name, 4, 512, (ctx, w, h) => {
        const c = SKY[name];
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, c[0]); g.addColorStop(0.42, c[1]); g.addColorStop(0.8, c[2]); g.addColorStop(1, c[3]);
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      }));
    }
    // stars: a few bright ones with a soft cross, many faint dots
    def('ttl_fx_stars', (scene) => canvasTex(scene, 'ttl_fx_stars', 512, 384, (ctx, w, h) => {
      const r = rng(5);
      for (let i = 0; i < 170; i++) {
        const x = r() * w, y = Math.pow(r(), 1.35) * h, a = 0.25 + r() * 0.6, s = r() < 0.08 ? 1.6 : 0.7 + r() * 0.6;
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill();
      }
      for (let i = 0; i < 9; i++) {
        const x = r() * w, y = r() * h * 0.7;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 9);
        g.addColorStop(0, 'rgba(255,255,240,0.95)'); g.addColorStop(0.25, 'rgba(255,250,220,0.35)'); g.addColorStop(1, 'rgba(255,250,220,0)');
        ctx.fillStyle = g; ctx.fillRect(x - 9, y - 9, 18, 18);
        ctx.fillStyle = 'rgba(255,255,245,0.55)';
        ctx.fillRect(x - 7, y - 0.5, 14, 1); ctx.fillRect(x - 0.5, y - 7, 1, 14);
      }
    }));
    // aurora: soft vertical curtains along a wavy ribbon, green -> teal with a pink fringe on top
    def('ttl_fx_aurora', (scene) => canvasTex(scene, 'ttl_fx_aurora', 512, 256, (ctx, w, h) => {
      const r = rng(23);
      ctx.globalCompositeOperation = 'lighter';
      for (let band = 0; band < 2; band++) {
        const base = h * (0.55 + band * 0.12), amp = h * (0.12 - band * 0.03), ph = r() * 6.28, f = 1.3 + band * 0.7;
        for (let x = -4; x < w + 4; x += 2) {
          const t = x / w;
          const y = base + Math.sin(t * Math.PI * 2 * f + ph) * amp + Math.sin(t * 17 + ph) * amp * 0.18;
          const len = h * (0.34 + 0.22 * (0.5 + 0.5 * Math.sin(t * 9 + ph * 2))) * (1 - band * 0.25);
          const edge = Math.min(1, t * 5, (1 - t) * 5);
          const k = (0.07 + 0.05 * (0.5 + 0.5 * Math.sin(t * 23 + ph))) * edge;
          const g = ctx.createLinearGradient(0, y - len, 0, y + 6);
          g.addColorStop(0, 'rgba(190,90,220,0)');
          g.addColorStop(0.35, `rgba(150,110,230,${k * 0.6})`);
          g.addColorStop(0.75, `rgba(90,240,190,${k * 1.4})`);
          g.addColorStop(0.97, `rgba(160,255,210,${k * 2.2})`);
          g.addColorStop(1, 'rgba(160,255,210,0)');
          ctx.fillStyle = g;
          ctx.fillRect(x, y - len, 3, len + 6);
        }
      }
    }));
    // far mountains (white snow, soft blue shade) and the near forested hills; tinted per time of day
    def('ttl_fx_mtn_far', (scene) => canvasTex(scene, 'ttl_fx_mtn_far', 1024, 220, (ctx, w, h) => {
      const r = rng(41);
      const peaks = [];
      let x = -60;
      while (x < w + 80) { const pw = 110 + r() * 170; peaks.push([x + pw / 2, h * (0.12 + r() * 0.4), pw]); x += pw * (0.55 + r() * 0.25); }
      for (const [px, py, pw] of peaks) {
        // shaded side then lit side
        ctx.fillStyle = '#c3d1e6';
        ctx.beginPath(); ctx.moveTo(px - pw * 0.75, h); ctx.lineTo(px, py); ctx.lineTo(px + pw * 0.75, h); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#eef4fb';
        ctx.beginPath(); ctx.moveTo(px - pw * 0.75, h); ctx.lineTo(px, py); ctx.lineTo(px + pw * 0.08, h); ctx.closePath(); ctx.fill();
        // rocky streaks
        ctx.strokeStyle = 'rgba(140,160,195,0.35)'; ctx.lineWidth = 2;
        for (let k = 0; k < 3; k++) {
          const sx = px + (r() - 0.3) * pw * 0.3, sy = py + (h - py) * (0.25 + r() * 0.3);
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 10 + r() * 14, sy + 20 + r() * 26); ctx.stroke();
        }
      }
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(225,236,248,0.85)');
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }));
    def('ttl_fx_mtn_near', (scene) => canvasTex(scene, 'ttl_fx_mtn_near', 1024, 160, (ctx, w, h) => {
      const r = rng(77);
      // rolling snowy hills
      ctx.fillStyle = '#dce7f3';
      ctx.beginPath(); ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) ctx.lineTo(x, h * 0.55 + Math.sin(x * 0.009 + 1) * h * 0.12 + Math.sin(x * 0.023) * h * 0.06);
      ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
      // little pine silhouettes on the ridge
      for (let i = 0; i < 120; i++) {
        const x = r() * w;
        const ridge = h * 0.55 + Math.sin(x * 0.009 + 1) * h * 0.12 + Math.sin(x * 0.023) * h * 0.06;
        const th = 10 + r() * 16, tw = th * 0.42;
        const y = ridge + 2 + r() * h * 0.25;
        ctx.fillStyle = r() < 0.5 ? '#5f7f8f' : '#6e8f99';
        ctx.beginPath(); ctx.moveTo(x, y - th); ctx.lineTo(x - tw, y); ctx.lineTo(x + tw, y); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath(); ctx.moveTo(x, y - th); ctx.lineTo(x - tw * 0.4, y - th * 0.55); ctx.lineTo(x + tw * 0.4, y - th * 0.55); ctx.closePath(); ctx.fill();
      }
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(235,242,250,0.9)');
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }));
    // horizon haze (white, tinted per time) and a soft vignette
    def('ttl_fx_haze', (scene) => canvasTex(scene, 'ttl_fx_haze', 4, 128, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      for (let i = 0; i <= 16; i++) { const u = i / 16; const a = Math.pow(1 - u, 2.2) * (0.6 + 0.4 * (1 - u)); g.addColorStop(u, `rgba(255,255,255,${a.toFixed(3)})`); }
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }));
    // lighthouse beam: a long soft wedge, origin at the left middle
    def('ttl_fx_beam', (scene) => canvasTex(scene, 'ttl_fx_beam', 512, 128, (ctx, w, h) => {
      for (let x = 0; x < w; x++) {
        const t = x / w;
        const half = 3 + t * (h / 2 - 4);
        const a = Math.pow(1 - t, 1.4) * 0.55;
        const g = ctx.createLinearGradient(0, h / 2 - half, 0, h / 2 + half);
        g.addColorStop(0, 'rgba(255,240,190,0)'); g.addColorStop(0.5, `rgba(255,245,210,${a})`); g.addColorStop(1, 'rgba(255,240,190,0)');
        ctx.fillStyle = g; ctx.fillRect(x, h / 2 - half, 1, half * 2);
      }
    }));
    // the logo shine: a soft diagonal white band
    def('ttl_fx_shine', (scene) => canvasTex(scene, 'ttl_fx_shine', 160, 256, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.42, 'rgba(255,255,255,0.15)'); g.addColorStop(0.5, 'rgba(255,255,255,0.85)');
      g.addColorStop(0.58, 'rgba(255,255,255,0.15)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }));
    // a friendly moon
    def('ttl_fx_moon', (scene) => canvasTex(scene, 'ttl_fx_moon', 96, 96, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,250,225,0.5)'); g.addColorStop(0.42, 'rgba(255,248,220,0.25)'); g.addColorStop(1, 'rgba(255,248,220,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff6d8';
      ctx.beginPath(); ctx.arc(w / 2, h / 2, 17, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(225,212,170,0.55)';
      for (const [x, y, rr] of [[-5, -4, 4], [6, 3, 3], [-2, 8, 2.4], [7, -7, 2]]) { ctx.beginPath(); ctx.arc(w / 2 + x, h / 2 + y, rr, 0, Math.PI * 2); ctx.fill(); }
    }));
  },
};

/** 0xRRGGBB lerp */
export function lerpColor(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return ((ar + (br - ar) * t) << 16) | ((ag + (bg - ag) * t) << 8) | (ab + (bb - ab) * t);
}

/** colour along day (0) -> dusk (1) -> night (2) */
export function tod3(c0, c1, c2, t) {
  if (t <= 1) return lerpColor(c0, c1, Math.max(0, t));
  return lerpColor(c1, c2, Math.min(1, t - 1));
}
