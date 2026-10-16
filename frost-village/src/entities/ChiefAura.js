// (v4.2, docs/v42_plan.md §3.1–3.2) 촌장 후광 · 광채 — the chief stands out from the villagers:
//   ring   an aurora ring on the ground under his feet (DEPTH.PAD + 2: over pads and decals, under shadows and every
//          character), the same size on screen at every zoom (≈ 45 CSS px on a 390 px phone); gold and pulsing while
//          he works a station's work spot (his labour.chiefSpeed ×1.25 made visible: '×1.25' the first 3 times)
//   glow   a soft back glow (광채) behind him, brighter at night
//   motes  ≤ 6 sparkles riding the ring
//   pin    a star badge over his head (or his carried tower) when zoomed out, in a crowd, or in 관망
//   band   a thin gold outer band from 읍 on
// 촌장 응원: once the village is complete, standing still ≥ cheer.still s near working gatherers / operators makes
// them work ×cheer.mult (♪ notes rise from the ring).
// CODE-1 uses the generated fv_halo* textures; CODE-2's chief_fx art replaces them by key (fxTex.art()).
// Cost: ≤ 10 display objects, NORMAL blend only (same batch), ≤ 0.01 ms a frame.

import { BALANCE } from '../data/balance.js';
import { Settings } from '../core/Save.js';
import { DEPTH } from '../systems/DepthSort.js';
import { t } from '../data/strings.js';
import { gdist } from '../core/Iso.js';
import { art } from '../systems/v42/fxTex.js';
import { stackStep } from './ItemStack.js';

const A = () => (BALANCE.v42 && BALANCE.v42.aura) || {};
const C = () => (BALANCE.v42 && BALANCE.v42.cheer) || { mult: 1.1, still: 2, radius: 200 };
const MOTES = 6;

export class ChiefAura {
  constructor(gs, v42) {
    this.gs = gs;
    this.v42 = v42;
    this.t = 0;
    this.gold = 0;            // 0..1 (working a station)
    this.pulseK = 0;
    this.notch = null;        // the navigator's route direction (screen angle) while carrying
    this.observing = false;   // 관망
    this.stillT = 0;
    this.cheering = false;
    this.cheered = new Set(); // stations / workers sped up now
    this.noteT = 0;
    this.crowdT = 0;
    this.crowd = false;
    this.pinA = 0;
    this.make();
  }

  make() {
    const gs = this.gs;
    const R = art(gs, 'chief_halo', 'fv_halo'), G = art(gs, 'chief_halo_gold', 'fv_halo_gold'), B = art(gs, 'chief_halo_rank2', 'fv_halo_rank2');
    const GL = art(gs, 'chief_glow_back', 'fv_halo_glow'), M = art(gs, 'chief_sparkle', 'fv_halo_mote'), P = art(gs, 'chief_marker', 'fv_halo_pin');
    this.keys = { ring: R.key, gold: G.key };
    this.band = gs.add.image(0, 0, B.key).setOrigin(0.5, 0.5).setDepth(DEPTH.PAD + 1.99).setVisible(false);
    this.ring = gs.add.image(0, 0, R.key).setOrigin(0.5, 0.5).setDepth(DEPTH.PAD + 2);
    this.goldRing = gs.add.image(0, 0, G.key).setOrigin(0.5, 0.5).setDepth(DEPTH.PAD + 2.01).setAlpha(0);
    this.glow = gs.add.image(0, 0, GL.key).setOrigin(0.5, 0.82).setAlpha(0);
    this.motes = [];
    for (let i = 0; i < MOTES; i++) this.motes.push(gs.add.image(0, 0, M.key).setOrigin(0.5).setScale(0.8).setAlpha(0));
    this.pin = gs.add.image(0, 0, P.key).setOrigin(0.5, 1).setDepth(DEPTH.LABEL - 30).setAlpha(0);
    this.notchImg = gs.add.image(0, 0, 'fv_nav_chevron', 'c0').setOrigin(0.5).setDepth(DEPTH.PAD + 2.02).setAlpha(0);
    this.all = [this.band, this.ring, this.goldRing, this.glow, this.pin, this.notchImg].concat(this.motes);
    for (const o of this.all) o.noCull = true;
  }

  /** the halo setting / an observer or a test toggles it */
  get on() { return Settings.data.halo !== false; }

  /** the chief's work stroke hit (OperatorSpot.chiefImpact): the gold ring pulses; '×1.25' the first 3 times */
  pulse() {
    this.pulseK = 1;
    const v = this.v42, p = this.gs.player;
    if (!v || !this.on) return;
    v.seen.boost = (v.seen.boost || 0);
    if (v.seen.boost < 3 && p) {
      v.seen.boost++;
      this.gs.effects.floatText(p.x + 30, p.y + p.headTop - 20, t('chiefBoost'), '#ffd36a', 30);
    }
  }

  /** world-px ring width at the current zoom (≈ 45 CSS px on a 390 px phone at any zoom below fullZoom) */
  ringWidth() {
    const a = A(), z = Math.max(0.05, this.gs.zoomCur || 1);
    const k = z < (a.fullZoom || 1.2) ? Math.min(a.maxScale || 2, (a.fullZoom || 1.2) / z) : 1;
    return (a.ringPx || 70) * k;
  }

  /** the darkness of the night (0 day .. 1 darkest), for the back glow */
  night() {
    const ck = this.gs.v4 && this.gs.v4.clock;
    if (!ck || !ck.on || !ck.cur || Settings.data.daynight === false) return 0;
    const D = (BALANCE.v4 && BALANCE.v4.day && BALANCE.v4.day.darkness) || 0.45;
    return Math.max(0, Math.min(1, ck.cur.a / Math.max(0.01, D)));
  }

  update(dt) {
    const gs = this.gs, p = gs.player;
    this.t += dt;
    if (!p) return;
    const on = this.on && p.sprite.visible !== false;
    if (!on) { for (const o of this.all) if (o.visible) o.setVisible(false); this.updateCheer(dt, false); return; }
    for (const o of this.all) if (!o.visible && o !== this.band) o.setVisible(true);
    const a = A();
    const w = this.ringWidth(), sc = w / 192;
    const x = p.x, y = p.y + 2;
    // working a station's spot: gold, pulsing on each stroke
    const working = !!(p.opSpot && p.opSpot.station && p.opSpot.station.working);
    this.gold += ((working ? 1 : 0) - this.gold) * Math.min(1, dt * 6);
    this.pulseK = Math.max(0, this.pulseK - dt * 3);
    const breath = 0.85 + Math.sin(this.t * (Math.PI * 2 / 2.4)) * 0.1;
    const obsA = this.observing ? 0.6 / 0.85 : 1;
    this.ring.setPosition(x, y).setScale(sc).setAlpha(breath * obsA * (1 - this.gold));
    this.goldRing.setPosition(x, y).setScale(sc * (1 + this.pulseK * 0.12)).setAlpha(this.gold * (0.8 + this.pulseK * 0.2));
    // 읍: the gold outer band
    const rank2 = !!(gs.v4 && gs.v4.rank && gs.v4.rank.level >= 2);
    if (this.band.visible !== rank2) this.band.setVisible(rank2);
    if (rank2) this.band.setPosition(x, y).setScale(sc * 1.12 * 192 / 216);
    // 광채
    const ga = (a.glowDay || 0.35) + ((a.glowNight || 0.6) - (a.glowDay || 0.35)) * this.night();
    this.glow.setPosition(x, p.y + 4).setScale(1.15).setDepth(p.y - 0.5).setAlpha(ga * (0.85 + Math.sin(this.t * 1.7) * 0.15));
    // motes riding the ring (one turn every 6 s; slower in 관망)
    const spin = (this.t / (this.observing ? 9 : 6)) * Math.PI * 2;
    const rx = w * 0.46, ry = w * 0.23;
    for (let i = 0; i < MOTES; i++) {
      const m = this.motes[i], ang = spin + (i / MOTES) * Math.PI * 2;
      const tw = 0.5 + 0.5 * Math.sin(this.t * 3.1 + i * 1.7);
      const mx = x + Math.cos(ang) * rx, my = y + Math.sin(ang) * ry - 2;
      m.setPosition(mx, my - tw * 4).setDepth(Math.sin(ang) > 0 ? p.y + 1 : p.y - 1).setAlpha(0.35 + tw * 0.55).setScale(sc * (0.55 + tw * 0.4));
    }
    // the navigator's notch: a small chevron on the ring pointing along the route
    if (this.notch !== null && this.notch !== undefined) {
      const k = Math.round(((this.notch % (Math.PI * 2)) + Math.PI * 2) / (Math.PI * 2 / 16)) % 16;
      this.notchImg.setFrame('c' + k).setPosition(x + Math.cos(this.notch) * rx * 1.05, y + Math.sin(this.notch) * ry * 1.05).setScale(sc * 1.6).setAlpha(0.9);
    } else if (this.notchImg.alpha) this.notchImg.setAlpha(0);
    // the star pin: zoomed out, in a crowd, or in 관망
    this.crowdT -= dt;
    if (this.crowdT <= 0) { this.crowdT = 0.5; this.crowd = this.countNear(p, a.crowdR || 160) >= (a.crowdN || 4); }
    const wantPin = (gs.zoomCur || 1) < (a.pinZoom || 0.8) || this.crowd || this.observing;
    this.pinA += ((wantPin ? 1 : 0) - this.pinA) * Math.min(1, dt / 0.2);
    if (this.pinA > 0.01) {
      let top = p.y + p.headTop - 14;
      if (p.stack.count) { let h = 0; for (const it of p.stack.items) h += stackStep(it.type) * p.stack.scale; top -= h + 26; }
      const pz = Math.max(0.05, gs.zoomCur || 1);
      // 22 CSS px on a 390 px phone: world px = 22 / (zoom x 390/720)
      const ps = (22 / (pz * 390 / 720)) / 72;
      this.pin.setPosition(x, top + Math.sin(this.t * 3) * 2).setScale(ps).setAlpha(this.pinA);
    } else if (this.pin.alpha) this.pin.setAlpha(0);
    this.updateCheer(dt, true);
  }

  /** characters near the chief (the crowd rule of the pin) */
  countNear(p, r) {
    const gs = this.gs;
    let n = 0;
    const near = (c) => c && c.alive !== false && c !== p && Math.abs(c.x - p.x) < r && Math.abs(c.y - p.y) < r && gdist(c.x, c.y, p.x, p.y) < r;
    for (const c of gs.agents || []) if (near(c)) n++;
    const nb = gs.v4;
    if (nb) { for (const v of nb.visitors || []) if (near(v)) n++; if (nb.town) for (const b of nb.town.bodies || []) if (near(b)) n++; }
    if (gs.life) for (const r2 of gs.life.residents || []) if (near(r2)) n++;
    return n;
  }

  // ------------------------------------------------------------------ 촌장 응원
  /** the station's work multiplier (Station.update) */
  cheerK(st) { return this.cheering && this.cheered.has(st) ? Math.max(1, Number(C().mult) || 1) : 1; }

  updateCheer(dt, on) {
    const gs = this.gs, p = gs.player, c = C();
    const mult = Math.max(1, Number(c.mult) || 1);
    const still = Math.hypot(p.vx || 0, p.vy || 0) < 20;
    this.stillT = still ? this.stillT + dt : 0;
    const want = on && mult > 1 && !!(this.v42 && this.v42.complete) && this.stillT >= (c.still || 2);
    const R = c.radius || 200;
    const now = new Set();
    if (want) {
      for (const s of (gs.stationList || []).concat(gs.workshops || [])) {
        const post = s.op && s.op.operator ? s.op.post : null;
        if (post && s.working && gdist(post.x, post.y, p.x, p.y) < R) now.add(s);
      }
      for (const w of gs.workers || []) if (w.state === 'work' && gdist(w.x, w.y, p.x, p.y) < R) now.add(w);
    }
    // workers' strokes: their work anim runs ×mult while cheered
    for (const w of this.cheered) if (!now.has(w) && w.sprite && w.state !== undefined && w.sprite.anims) w.sprite.anims.timeScale = 1;
    for (const w of now) if (w.sprite && w.state !== undefined && w.sprite.anims && w.animName === 'work') w.sprite.anims.timeScale = mult;
    const was = this.cheering;
    this.cheered = now;
    this.cheering = now.size > 0;
    if (this.cheering && !was && this.v42 && (this.v42.seen.cheer || 0) < 2) { this.v42.seen.cheer = (this.v42.seen.cheer || 0) + 1; gs.ui.toast(t('cheerOn')); }
    if (this.cheering) {
      this.noteT -= dt;
      if (this.noteT <= 0) {
        this.noteT = 1.2;
        if (gs.isOnScreen(p.x, p.y, 100)) {
          const k = gs.anims.exists('fx_music_notes') || gs.textures.exists('fx_music_notes') ? 'fx_music_notes' : null;
          if (k) gs.effects.sheet(k, p.x + (Math.random() - 0.5) * 40, p.y - 20, { size: 56, depth: p.y + 2 });
          else gs.effects.burst('star', p.x, p.y - 30, 3);
        }
      }
    }
  }

  state() {
    return { on: this.on, ringW: Math.round(this.ringWidth()), gold: +this.gold.toFixed(2), pin: +this.pinA.toFixed(2), crowd: this.crowd, cheering: this.cheering, cheered: this.cheered.size, observing: this.observing,
      depth: this.ring.depth, key: this.ring.texture.key, objects: this.all.length };
  }

  destroy() { for (const o of this.all) if (o && o.scene) o.destroy(); }
}
