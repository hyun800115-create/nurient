// The logo: drops in with a bounce, a shine sweeps across it, sparkles twinkle around it.
// Uses the title_art 3D logo (assets/title) when it is loaded; until then a built-in text logo drawn once
// with canvas 2D from TITLE_NAME (config.js) — so renaming the game needs no new art to look right.
import { FONT } from '../data/strings.js';
import { Assets } from '../core/Assets.js';
import { TitleAssets } from './TitleAssets.js';
import { TITLE_NAME } from './config.js';
import { TitleFx } from './TitleFx.js';

// title_art keys (assets/title): the full logo (@2x, or its _1x twin on k = 1 phones), its shine mask,
// and the per-letter parts (meta.logo.main.parts) for the drop-in
export const LOGO_KEYS = {
  ko: ['ttl_logo_main', 'ttl_logo_main_1x'],
  en: ['ttl_logo_en', 'ttl_logo_en_1x'],
  shine: { ko: 'ttl_logo_main_shine', en: 'ttl_logo_en_shine' },
  band: 'ttl_shine_band',
  parts: 'ttl_logo_parts',
};

const easeBounce = (p) => {
  const n = 7.5625, d = 2.75;
  if (p < 1 / d) return n * p * p;
  if (p < 2 / d) { p -= 1.5 / d; return n * p * p + 0.75; }
  if (p < 2.5 / d) { p -= 2.25 / d; return n * p * p + 0.9375; }
  p -= 2.625 / d; return n * p * p + 0.984375;
};

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

function flake(ctx, x, y, r, fill, stroke, lw) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineCap = 'round';
  for (const pass of [0, 1]) {
    ctx.strokeStyle = pass ? fill : stroke;
    ctx.lineWidth = pass ? lw : lw + 10;
    for (let k = 0; k < 6; k++) {
      ctx.save();
      ctx.rotate((k * Math.PI) / 3);
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(0, -r);
      ctx.moveTo(0, -r * 0.55); ctx.lineTo(-r * 0.24, -r * 0.78);
      ctx.moveTo(0, -r * 0.55); ctx.lineTo(r * 0.24, -r * 0.78);
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.fillStyle = '#ffd25a';
  ctx.strokeStyle = stroke; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
}

/** the built-in logo as a canvas texture (2x resolution); returns its key */
export function makeTextLogo(scene, lang) {
  const key = 'ttl_logo_fb';
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const parts = TITLE_NAME.logo[lang] || TITLE_NAME.logo.ko;
  const W = 1320, H = 700;
  const ct = scene.textures.createCanvas(key, W, H);
  const ctx = ct.getContext();
  const cx = W / 2;
  // --- main word: candy letters
  let size = 236;
  ctx.font = `900 ${size}px ${FONT}`;
  const mw = ctx.measureText(parts.main).width;
  if (mw > W - 120) { size = Math.floor(size * (W - 120) / mw); ctx.font = `900 ${size}px ${FONT}`; }
  const mainY = parts.top ? 330 : 270;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  // soft drop shadow
  ctx.save();
  ctx.shadowColor = 'rgba(16,36,82,0.55)'; ctx.shadowBlur = 22; ctx.shadowOffsetY = 16;
  ctx.strokeStyle = '#173d7a'; ctx.lineWidth = 46; ctx.strokeText(parts.main, cx, mainY);
  ctx.restore();
  ctx.strokeStyle = '#173d7a'; ctx.lineWidth = 46; ctx.strokeText(parts.main, cx, mainY);
  ctx.strokeStyle = '#3f86d6'; ctx.lineWidth = 26; ctx.strokeText(parts.main, cx, mainY);
  // body: ice-white -> sky blue; then snow caps (white wavy band on the upper part of every letter)
  const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H;
  const tc = tmp.getContext('2d');
  tc.font = ctx.font; tc.textAlign = 'center'; tc.textBaseline = 'alphabetic';
  const g = tc.createLinearGradient(0, mainY - size * 0.85, 0, mainY + size * 0.1);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#e4f3ff'); g.addColorStop(1, '#93cdfa');
  tc.fillStyle = g; tc.fillText(parts.main, cx, mainY);
  tc.globalCompositeOperation = 'source-atop';
  tc.fillStyle = '#ffffff';
  tc.beginPath();
  const capY = mainY - size * 0.56;
  tc.moveTo(0, 0); tc.lineTo(0, capY);
  for (let x = 0; x <= W; x += 6) tc.lineTo(x, capY + Math.sin(x * 0.045) * 9 + Math.sin(x * 0.13 + 1) * 5 + (Math.sin(x * 0.021) > 0.6 ? 12 : 0));
  tc.lineTo(W, 0); tc.closePath(); tc.fill();
  // cap shading line + glossy highlight
  tc.strokeStyle = 'rgba(120,170,225,0.55)'; tc.lineWidth = 5;
  tc.beginPath();
  for (let x = 0; x <= W; x += 6) { const y = capY + Math.sin(x * 0.045) * 9 + Math.sin(x * 0.13 + 1) * 5 + (Math.sin(x * 0.021) > 0.6 ? 12 : 0) + 3; if (x) tc.lineTo(x, y); else tc.moveTo(x, y); }
  tc.stroke();
  const hl = tc.createLinearGradient(0, mainY - size * 0.3, 0, mainY);
  hl.addColorStop(0, 'rgba(255,255,255,0)'); hl.addColorStop(0.6, 'rgba(255,255,255,0.0)'); hl.addColorStop(1, 'rgba(70,140,215,0.35)');
  tc.fillStyle = hl; tc.fillRect(0, mainY - size * 0.3, W, size * 0.4);
  ctx.drawImage(tmp, 0, 0);
  // snowflake-flower emblem on the second letter
  if (parts.main.length >= 2) {
    ctx.font = `900 ${size}px ${FONT}`;
    const w0 = ctx.measureText(parts.main).width;
    const w1 = ctx.measureText(parts.main.slice(0, 1)).width, w2 = ctx.measureText(parts.main.slice(0, 2)).width;
    const fx = cx - w0 / 2 + (w1 + w2) / 2 + size * 0.28, fy = mainY - size * 0.86;
    flake(ctx, fx, fy, size * 0.2, '#ffffff', '#173d7a', 12);
  }
  // --- top line: gold with sparkles
  if (parts.top) {
    ctx.font = `900 92px ${FONT}`;
    const ty = 118;
    ctx.strokeStyle = '#6b3a12'; ctx.lineWidth = 22; ctx.strokeText(parts.top, cx, ty);
    const gg = ctx.createLinearGradient(0, ty - 80, 0, ty);
    gg.addColorStop(0, '#fff3b0'); gg.addColorStop(0.55, '#ffd040'); gg.addColorStop(1, '#f39a1e');
    ctx.fillStyle = gg; ctx.fillText(parts.top, cx, ty);
    const tw = ctx.measureText(parts.top).width;
    for (const [sx, sy, sr] of [[cx - tw / 2 - 52, ty - 46, 20], [cx + tw / 2 + 50, ty - 58, 24], [cx + tw / 2 + 84, ty - 18, 12]]) {
      ctx.fillStyle = '#fff6c2'; ctx.strokeStyle = '#6b3a12'; ctx.lineWidth = 6;
      ctx.beginPath();
      for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; const rr = k % 2 ? sr * 0.38 : sr; ctx.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr); }
      ctx.closePath(); ctx.stroke(); ctx.fill();
    }
  }
  // --- the wooden sign
  if (parts.sign) {
    ctx.font = `900 96px ${FONT}`;
    const sw = Math.max(300, ctx.measureText(parts.sign).width + 120), sh = 132;
    const sx = cx - sw / 2, sy = mainY + 58;
    ctx.save();
    ctx.shadowColor = 'rgba(30,20,10,0.45)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 10;
    ctx.fillStyle = '#5a3418'; rrect(ctx, sx - 8, sy - 8, sw + 16, sh + 16, 30); ctx.fill();
    ctx.restore();
    const wg = ctx.createLinearGradient(0, sy, 0, sy + sh);
    wg.addColorStop(0, '#c98a4b'); wg.addColorStop(1, '#9a5d2a');
    ctx.fillStyle = wg; rrect(ctx, sx, sy, sw, sh, 24); ctx.fill();
    ctx.strokeStyle = 'rgba(90,52,24,0.45)'; ctx.lineWidth = 4;
    for (const yy of [sy + sh * 0.36, sy + sh * 0.68]) { ctx.beginPath(); ctx.moveTo(sx + 16, yy); ctx.lineTo(sx + sw - 16, yy); ctx.stroke(); }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(sx + 10, sy + 14);
    for (let x = 0; x <= sw - 20; x += 10) ctx.lineTo(sx + 10 + x, sy - 6 + Math.sin(x * 0.07) * 5 + (x % 60 < 12 ? 10 : 0));
    ctx.lineTo(sx + sw - 10, sy + 14); ctx.closePath(); ctx.fill();
    for (const nx of [sx + 26, sx + sw - 26]) { ctx.fillStyle = '#4a2a10'; ctx.beginPath(); ctx.arc(nx, sy + sh / 2, 7, 0, Math.PI * 2); ctx.fill(); }
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#4a2a10'; ctx.lineWidth = 18; ctx.strokeText(parts.sign, cx, sy + sh / 2 + 34);
    ctx.fillStyle = '#fff8e8'; ctx.fillText(parts.sign, cx, sy + sh / 2 + 34);
  }
  ct.refresh();
  TitleAssets.keys.add(key);
  return key;
}

const backOut = (p, k = 1.9) => { const q = p - 1; return q * q * ((k + 1) * q + k) + 1; };

export class TitleLogo {
  constructor(scene, put, W, H, layout, opts = {}) {
    this.scene = scene; this.put = put; this.W = W; this.H = H;
    this.lang = opts.lang === 'en' ? 'en' : 'ko';
    this.y0 = opts.y || H * layout.logoY;
    this.reduced = !!opts.reduced;
    this.useParts = opts.parts !== false;      // the per-letter drop (intro); the idle title drops it in one piece
    this.state = 'hidden';
    this.t = 0;
    this.alphaK = 1; this.alphaTo = 1; this.alphaV = 0; this.onFaded = null;
    this.build();
  }

  build() {
    const s = this.scene, W = this.W, H = this.H;
    const art = TitleAssets.artPick(s, LOGO_KEYS[this.lang]);
    const meta = TitleAssets.art && TitleAssets.art.meta;
    let tex, frame, ax = 0.5, ay = 0.5;
    if (art) { tex = art.tex; frame = art.frame; ax = art.anchor[0]; ay = art.anchor[1]; this.fromArt = true; } else { tex = makeTextLogo(s, this.lang); this.fromArt = false; }
    this.img = s.add.image(W / 2, this.y0, tex, frame).setOrigin(ax, ay).setDepth(50);
    this.put(this.img);
    const fw = this.img.frame.realWidth, fh = this.img.frame.realHeight;
    // logical width: the art's suggestion (430..520) on a 720-wide layout, a little less on short screens
    const lay = meta && meta.layout && meta.layout[this.lang === 'en' ? 'logoEn' : 'logoMain'];
    const wr = (lay && lay.widthLogical) || [430, 520];
    const tw = Math.min(wr[1], Math.max(wr[0], W * 0.7)) * (H < 1400 ? 0.93 : 1);
    this.scale = this.fromArt ? tw / fw : Math.min((W * 0.86) / fw, (H * 0.2) / fh);
    this.dispW = fw * this.scale; this.dispH = fh * this.scale;
    this.img.setScale(this.scale).setVisible(false);
    // per-letter parts (main logo, @2x atlas): positions are @2x px from the logo centre
    this.parts = [];
    const pm = meta && meta.logo && meta.logo[this.lang === 'en' ? 'en' : 'main'];
    if (this.fromArt && this.useParts && pm && pm.parts && s.textures.exists(LOGO_KEYS.parts) && !this.reduced) {
      const s2 = this.dispW / pm.size2x[0];
      for (const p of pm.parts) {
        if (!s.textures.get(LOGO_KEYS.parts).has(p.frame)) continue;
        const pv = p.pivot || [0.5, 0.5];
        const x = W / 2 + p.dx * s2 + (pv[0] - 0.5) * p.w * s2, y = this.y0 + p.dy * s2 + (pv[1] - 0.5) * p.h * s2;
        const im = s.add.image(x, y, LOGO_KEYS.parts, p.frame).setOrigin(pv[0], pv[1]).setScale(s2).setDepth(50 + p.z * 0.01).setVisible(false);
        this.put(im);
        const kind = /emblem/.test(p.frame) ? 'pop' : /top/.test(p.frame) ? 'slide' : /sign/.test(p.frame) ? 'swing' : 'drop';
        this.parts.push({ im, x, y, s2, at: (p.drop || 0) * 0.1, kind, landed: false });
      }
      this.partsEnd = Math.max(...this.parts.map((q) => q.at)) + 0.62;
    }
    // shine: a band that only shows on the logo (bitmap mask, WebGL)
    this.shine = null;
    if (s.sys.game.renderer.type === Phaser.WEBGL && !this.reduced) {
      const sm = this.fromArt ? TitleAssets.artSprite(s, LOGO_KEYS.shine[this.lang]) : null;
      let maskSrc = this.img;
      if (sm) {
        this.shineMaskImg = s.add.image(W / 2, this.y0, sm.tex, sm.frame).setOrigin(ax, ay).setVisible(false);
        this.shineMaskImg.setScale(this.dispW / this.shineMaskImg.frame.realWidth);
        this.put(this.shineMaskImg);
        maskSrc = this.shineMaskImg;
      }
      const band = TitleAssets.artSprite(s, LOGO_KEYS.band);
      this.shine = band ? s.add.image(0, this.y0, band.tex, band.frame) : s.add.image(0, this.y0, TitleFx.ensure(s, 'ttl_fx_shine'));
      this.shine.setDepth(51).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      const bf = this.shine.frame;
      this.shine.setScale((this.dispH * 1.5) / bf.realHeight);
      if (!band) this.shine.setDisplaySize(W * 0.2, this.dispH * 1.5);
      this.shine.setAngle(band ? 0 : 18);
      this.shine.setMask(new Phaser.Display.Masks.BitmapMask(s, maskSrc));
      this.put(this.shine);
    }
    // sparkles (title art twinkle, else the game's star)
    this.sparks = [];
    const tw2 = TitleAssets.artSprite(s, 'ttl_fx_twinkle') || Assets.sprite('fx_star');
    const bw = this.dispW, bh = this.dispH;
    const spots = [[-0.47, -0.3], [0.48, -0.18], [0.38, 0.4], [-0.42, 0.34], [0.08, -0.47], [-0.2, 0.06], [0.24, -0.04]];
    spots.forEach(([px, py], i) => {
      const sp = s.add.image(W / 2 + px * bw, this.y0 + py * bh, tw2.tex, tw2.frame).setBlendMode(Phaser.BlendModes.ADD)
        .setTint(i % 2 ? 0xfff2b0 : 0xffffff).setDepth(52).setScale(0).setVisible(false);
      this.put(sp);
      const fs = 34 / Math.max(16, sp.frame.realWidth);
      this.sparks.push({ sp, ph: i * 0.83, per: 1.6 + (i % 3) * 0.55, base: fs * (1 + (i % 2) * 0.35) });
    });
  }

  destroy() {
    for (const o of [this.img, this.shine, this.shineMaskImg]) if (o) { if (o.mask) o.clearMask(true); o.destroy(); }
    this.img = null; this.shine = null; this.shineMaskImg = null;
    for (const s of this.sparks) s.sp.destroy();
    for (const p of this.parts) p.im.destroy();
    this.sparks.length = 0; this.parts.length = 0;
  }

  /** drop in (dur seconds for the one-piece logo); onLand() when the first piece lands */
  drop(dur = 0.85, onLand) {
    this.state = 'drop'; this.t = 0; this.dur = dur; this.onLand = onLand; this.landed = false;
    if (this.parts.length) { for (const p of this.parts) p.im.setVisible(false); this.img.setVisible(false); this.dur = this.partsEnd; }
    else this.img.setVisible(true);
  }

  showNow() { this.state = 'idle'; this.t = 0; for (const p of this.parts) p.im.setVisible(false); this.img.setVisible(true).setAlpha(this.alphaK).setScale(this.scale); this.img.y = this.y0; this.shineAt = 0.4; this.landed = true; }

  /** appear in place with a soft fade (a late 3D logo taking over from the text logo) */
  fadeIn(dur = 0.6) { this.alphaK = 0; this.fadeTo(1, dur); this.showNow(); this.shineAt = dur + 0.2; }

  /** fade to alpha `to` over `dur` seconds; onDone() when there */
  fadeTo(to, dur, onDone) { this.alphaTo = to; this.alphaV = Math.abs(to - this.alphaK) / Math.max(0.01, dur); this.onFaded = onDone || null; }

  updateParts() {
    const H = this.H;
    for (const p of this.parts) {
      const u = (this.t - p.at) / 0.55;
      if (u < 0) continue;
      const im = p.im;
      im.setVisible(true);
      const q = Math.min(1, u);
      if (p.kind === 'drop') {
        const e = easeBounce(q);
        im.y = p.y - (1 - e) * H * 0.22;
        const imp = Math.max(0, 1 - Math.abs(q - 0.37) / 0.12) * 0.16;
        im.setScale(p.s2 * (1 + imp), p.s2 * (1 - imp));
        im.setAlpha(Math.min(1, q * 5));
      } else if (p.kind === 'pop') {
        const k = backOut(q, 3.2);
        im.setScale(p.s2 * k).setRotation((1 - q) * -1.6).setAlpha(Math.min(1, q * 4));
      } else if (p.kind === 'slide') {
        im.y = p.y - (1 - backOut(q, 1.6)) * 90;
        im.setAlpha(Math.min(1, q * 3));
      } else {
        // the sign swings in from the side on its strings
        im.y = p.y - (1 - backOut(q, 1.4)) * 60;
        im.setRotation(Math.sin(q * Math.PI * 2.5) * (1 - q) * 0.35);
        im.setAlpha(Math.min(1, q * 4));
      }
      if (!p.landed && q >= 0.37) { p.landed = true; if (!this.landed) { this.landed = true; if (this.onLand) this.onLand(); } }
    }
  }

  update(dt) {
    if (this.state === 'hidden') return;
    this.t += dt;
    const img = this.img;
    if (this.alphaV > 0) {
      const d = this.alphaTo - this.alphaK, step = this.alphaV * dt;
      if (Math.abs(d) <= step) { this.alphaK = this.alphaTo; this.alphaV = 0; if (this.onFaded) { const f = this.onFaded; this.onFaded = null; f(); if (!this.img) return; } } else this.alphaK += Math.sign(d) * step;
      if (this.state === 'idle') img.setAlpha(this.alphaK);
    }
    if (this.state === 'drop') {
      const p = Math.min(1, this.t / this.dur);
      if (this.parts.length) {
        this.updateParts();
      } else if (this.reduced) {
        img.setAlpha(p); img.y = this.y0;
      } else {
        const e = easeBounce(p);
        img.y = this.y0 - (1 - e) * this.H * 0.3;
        const imp = p > 0.36 ? Math.max(0, 1 - Math.abs(p - 0.4) / 0.09) * 0.14 + Math.max(0, 1 - Math.abs(p - 0.74) / 0.06) * 0.05 : 0;
        img.setScale(this.scale * (1 + imp), this.scale * (1 - imp));
        img.setAlpha(Math.min(1, p * 4));
      }
      if (!this.landed && p >= 0.36 && !this.parts.length) { this.landed = true; if (this.onLand) this.onLand(); }
      if (p >= 1) {
        // all pieces down: the one-piece logo takes over (same pixels), then the shine
        for (const q of this.parts) q.im.setVisible(false);
        this.state = 'idle'; this.t = 0; this.shineAt = 0.1; img.setVisible(true).setAlpha(1).setScale(this.scale); img.y = this.y0;
      }
      return;
    }
    // idle: a gentle float, a shine every few seconds, sparkles
    if (!this.reduced) {
      img.y = this.y0 + Math.sin(this.t * 1.6) * 3;
      if (this.shineMaskImg) this.shineMaskImg.y = img.y;
      const sh = this.shine;
      if (sh) {
        const period = 4.2;
        const k = ((this.t - this.shineAt) % period + period) % period;
        const w = this.dispW;
        if (this.t >= this.shineAt && k < 0.9) {
          sh.setVisible(true);
          sh.x = this.W / 2 - w * 0.62 + (k / 0.9) * w * 1.24;
          sh.y = img.y;
          sh.setAlpha(0.9 * this.alphaK);
        } else sh.setVisible(false);
      }
      for (const s of this.sparks) {
        const q = ((this.t + s.ph) % s.per) / s.per;
        const v = q < 0.35 ? Math.sin((q / 0.35) * Math.PI) : 0;
        s.sp.setVisible(v > 0.01 && this.alphaK > 0.05).setScale(s.base * v).setAlpha(this.alphaK).setRotation(this.t * 1.5 + s.ph);
      }
    }
  }
}
