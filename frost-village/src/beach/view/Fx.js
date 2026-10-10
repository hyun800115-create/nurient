// Little effects for the beach view: one-shot spritesheets (fx_splash_small / big, fx_sparkle_water) from a pool,
// sand puffs (fx_particles fx_dust), the emote bubbles (ui_emote_bubble + emote_*), a "+12" coin pop, the photo
// flash, and the fireworks (no sheet exists: fx_spark / fx_star / fx_glow particles in ADD, plan Appendix B).

import { art } from './art.js';
import { DEPTH } from '../../systems/DepthSort.js';
import { FONT } from '../../data/strings.js';

export class Fx {
  constructor(view) {
    this.v = view;
    this.scene = view.scene;
    this.free = new Map();            // sheet key -> [sprites]
    this.live = [];                   // { o, until, kind }
    this.parts = [];                  // firework particles { img, x, y, vx, vy, t0, life, col, g }
    this.emotes = [];
    art.glowTex(this.scene);
  }

  sheet(key, x, y, depth, scale = 1, alpha = 1) {
    const S = this.scene;
    if (!S.textures.exists(key)) return null;
    const pool = this.free.get(key) || [];
    let s = pool.pop();
    if (!s) {
      s = S.add.sprite(x, y, key);
      const sd = art.sheetDef(key);
      if (sd && sd.anchor) s.setOrigin(sd.anchor[0], sd.anchor[1]);
      s.on('animationcomplete', () => { s.setVisible(false); (this.free.get(key) || this.free.set(key, []).get(key)).push(s); });
    }
    const k = art.sheet(S, key);
    s.setVisible(true).setPosition(x, y).setDepth(depth).setScale(scale).setAlpha(alpha);
    if (k) s.play(k); else s.setVisible(false);
    return s;
  }

  /** a little sand puff (a castle grows, a kid lands) */
  puff(x, y) {
    if (!this.scene.textures.exists('fx_particles')) return;
    for (let k = 0; k < 4; k++) {
      const img = this.scene.add.image(x + (k - 1.5) * 10, y - 4, 'fx_particles', 'fx_dust').setDepth(y + 2).setTint(0xe9d2a2).setAlpha(0.8).setScale(0.5);
      this.scene.tweens.add({ targets: img, x: img.x + (k - 1.5) * 12, y: img.y - 14 - k * 3, alpha: 0, scale: 0.9, duration: 650, onComplete: () => img.destroy() });
    }
  }

  /** an emote bubble over (x, y) for `secs` */
  emote(key, x, y, secs = 1.8, lift = 104) {
    const S = this.scene;
    if (!art.has('ui_emote_bubble') || !art.has(key)) return null;
    const b = art.image(S, 'ui_emote_bubble', x, y - lift).setDepth(DEPTH.BUBBLE).setScale(0.62);
    const i = art.image(S, key, x, y - lift - 4).setDepth(DEPTH.BUBBLE + 1).setScale(0.5);
    for (const o of [b, i]) { const s = o.scale; o.setScale(s * 0.3); S.tweens.add({ targets: o, scale: s, duration: 260, ease: 'Back.easeOut' }); }
    const e = { b, i, until: this.v.T + secs, x, y };
    this.emotes.push(e);
    return e;
  }

  /** coins popping from a spot */
  coins(x, y, n) {
    if (!n) return;
    const t = this.scene.add.text(x, y - 70, '+' + n, { fontFamily: FONT, fontSize: '15px', fontStyle: '900', color: '#ffd84a', stroke: '#7a4b12', strokeThickness: 4 }).setOrigin(0.5).setDepth(DEPTH.BUBBLE);
    this.scene.tweens.add({ targets: t, y: y - 104, alpha: 0, duration: 1100, ease: 'Sine.easeOut', onComplete: () => t.destroy() });
  }

  flash(x, y) {
    const g = this.scene.add.image(x, y, 'bch_glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.FX).setScale(0.2).setAlpha(0.95);
    this.scene.tweens.add({ targets: g, scale: 1.4, alpha: 0, duration: 380, onComplete: () => g.destroy() });
  }

  // ------------------------------------------------------------------------------------------ fireworks
  /** a rocket rising from the sea, then a burst of coloured stars (ADD, over the night overlay) */
  firework(b, T, sea) {
    const S = this.scene;
    if (!S.textures.exists('fx_particles')) return;
    const x = b.x, y0 = b.y, y1 = b.y - b.h;
    const rocket = S.add.image(x, y0, 'fx_particles', 'fx_spark').setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.FX - 28).setTint(b.col).setScale(0.6);
    this.live.push({ o: rocket, kind: 'rocket', t0: T, t1: T + 0.8, x, y0, y1, b });
    if (sea && sea.ripple) sea.ripple(x, y0, 0.5);
  }
  burst(b, x, y, T) {
    const S = this.scene, n = b.big ? 36 : 26, sp = b.big ? 190 : 140;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + (b.kind === 'ring' ? 0 : Math.sin(k * 7.3) * 0.2);
      const v = sp * (b.kind === 'ring' ? 1 : 0.55 + ((k * 37) % 10) / 22);
      const img = S.add.image(x, y, 'fx_particles', b.kind === 'star' && k % 2 ? 'fx_star' : 'fx_spark').setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.FX - 28).setTint(b.col).setScale(b.big ? 0.85 : 0.66);
      this.parts.push({ img, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.62, t0: T, life: 1.5 + (k % 3) * 0.25 });
    }
    const g = S.add.image(x, y, 'bch_glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.FX - 29).setTint(b.col).setScale(b.big ? 3.2 : 2.4).setAlpha(0.32);
    S.tweens.add({ targets: g, alpha: 0, scale: g.scale * 1.3, duration: 900, onComplete: () => g.destroy() });
    // the burst lights the sea below it
    const r = S.add.image(x, b.y, 'bch_glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.FX - 29).setTint(b.col).setScale(3.4, 1.2).setAlpha(0.3);
    S.tweens.add({ targets: r, alpha: 0, duration: 1200, onComplete: () => r.destroy() });
  }

  update(dt, T) {
    for (let k = this.live.length - 1; k >= 0; k--) {
      const l = this.live[k];
      if (l.kind === 'rocket') {
        const f = Math.min(1, (T - l.t0) / (l.t1 - l.t0));
        l.o.setPosition(l.x + Math.sin(f * 9) * 2, l.y0 + (l.y1 - l.y0) * (1 - (1 - f) * (1 - f))).setAlpha(0.6 + 0.4 * Math.sin(T * 40));
        if (f >= 1) { this.burst(l.b, l.x, l.y1, T); l.o.destroy(); this.live.splice(k, 1); }
      }
    }
    for (let k = this.parts.length - 1; k >= 0; k--) {
      const p = this.parts[k], t = T - p.t0;
      if (t > p.life) { p.img.destroy(); this.parts.splice(k, 1); continue; }
      const drag = Math.exp(-t * 1.6);
      p.img.setPosition(p.x + p.vx * (1 - drag) / 1.6, p.y + p.vy * (1 - drag) / 1.6 + 26 * t * t).setAlpha(Math.max(0, 1 - t / p.life) * (0.75 + 0.25 * Math.sin(t * 30 + k)));
    }
    for (let k = this.emotes.length - 1; k >= 0; k--) {
      const e = this.emotes[k];
      if (T >= e.until) { e.b.destroy(); e.i.destroy(); this.emotes.splice(k, 1); }
    }
  }

  count() { let n = this.live.length + this.parts.length + this.emotes.length * 2; for (const p of this.free.values()) n += p.length; return n; }
  destroy() {
    for (const l of this.live) l.o.destroy();
    for (const p of this.parts) p.img.destroy();
    for (const e of this.emotes) { e.b.destroy(); e.i.destroy(); }
    for (const p of this.free.values()) for (const s of p) s.destroy();
    this.live = []; this.parts = []; this.emotes = []; this.free.clear();
  }
}
