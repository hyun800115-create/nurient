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
// CODE-1 uses the generated fv_halo* textures; (CODE-2) the chief_fx art (CONTRACT_V42 AG, on the v42_core page)
// replaces them in place the moment the page arrives (reskin(); sprite keys resolved through Assets.sprite, anims
// through Assets.spriteAnim: the ring 'calm', the gold ring / glow / pin 'play', the motes one-shot sparkles, the
// notch chief_halo_notch_00..15). At night the chief is also a moving DayClock light (lightPoints): NORMAL art under the
// night overlay can only get darker, the light makes him read like a lantern.
// Cost: ≤ 10 display objects, NORMAL blend only (same batch: one page), ≤ 0.01 ms a frame.

import { BALANCE } from '../data/balance.js';
import { Settings } from '../core/Save.js';
import { DEPTH } from '../systems/DepthSort.js';
import { t } from '../data/strings.js';
import { gdist } from '../core/Iso.js';
import { makeAll } from '../systems/v42/fxTex.js';
import { stackStep } from './ItemStack.js';
import { Assets } from '../core/Assets.js';

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
    // (made with the generated stand-ins; reskin() puts the art on them: a sprite key is not a texture key)
    makeAll(gs);
    const R = { key: 'fv_halo' }, G = { key: 'fv_halo_gold' }, B = { key: 'fv_halo_rank2' };
    const GL = { key: 'fv_halo_glow' }, M = { key: 'fv_halo_mote' }, P = { key: 'fv_halo_pin' };
    this.keys = { ring: R.key, gold: G.key };
    // (sprites, so the art's loops can play; until the art is here they show the generated stand-ins)
    this.band = gs.add.sprite(0, 0, B.key).setOrigin(0.5, 0.5).setDepth(DEPTH.PAD + 1.99).setVisible(false);
    this.ring = gs.add.sprite(0, 0, R.key).setOrigin(0.5, 0.5).setDepth(DEPTH.PAD + 2);
    this.goldRing = gs.add.sprite(0, 0, G.key).setOrigin(0.5, 0.5).setDepth(DEPTH.PAD + 2.01).setAlpha(0);
    this.glow = gs.add.sprite(0, 0, GL.key).setOrigin(0.5, 0.82).setAlpha(0);
    this.motes = [];
    for (let i = 0; i < MOTES; i++) this.motes.push(gs.add.sprite(0, 0, M.key).setOrigin(0.5).setScale(0.8).setAlpha(0));
    this.pin = gs.add.sprite(0, 0, P.key).setOrigin(0.5, 1).setDepth(DEPTH.LABEL - 30).setAlpha(0);
    this.notchImg = gs.add.image(0, 0, 'fv_nav_chevron', 'c0').setOrigin(0.5).setDepth(DEPTH.PAD + 2.02).setAlpha(0);
    this.all = [this.band, this.ring, this.goldRing, this.glow, this.pin, this.notchImg].concat(this.motes);
    for (const o of this.all) o.noCull = true;
    // ((v4.2 fix, gameplay M1) a train car standing in front of him: a soft silhouette of the chief drawn over the car
    //  (+ the star pin), so the camera's centre is never an empty box car)
    this.ghost = gs.add.sprite(0, 0, '__WHITE').setVisible(false).setAlpha(0.5);
    this.ghost.noCull = true;
    this.coverT = 0;
    this.cover = null;          // the car sprite covering him, or null
    this.artOn = false;
    if (Assets.has('chief_halo')) this.reskin();
    // the v42_core page arrives after the first sale: the art takes over in place
    this.onArrive = (k) => { if (!this.artOn && Assets.has('chief_halo')) this.reskin(); void k; };
    Assets.arrivals.push(this.onArrive);
  }

  /** (CODE-2) the chief_fx art: every piece gets its frame and its loop */
  reskin() {
    if (this.artOn || !Assets.has('chief_halo')) return false;
    const set = (o, key, anim, ts) => {
      Assets.apply(o, key);
      const ak = anim && Assets.spriteAnim(key, anim);
      if (ak && o.play) { o.play(ak); if (ts) o.anims.timeScale = ts; }
    };
    set(this.ring, 'chief_halo', 'calm');
    set(this.goldRing, 'chief_halo_gold', 'play');
    set(this.band, 'chief_halo_rank2');
    set(this.glow, 'chief_glow_back', 'play');
    set(this.pin, 'chief_marker', 'play');
    const sp = Assets.spriteAnim('chief_sparkle', 'play');
    this.motes.forEach((m, i) => {
      Assets.apply(m, 'chief_sparkle');
      // one-shot twinkles, restarted at their own pace (a mote never twinkles in step with its neighbours)
      if (sp) {
        m.on('animationcomplete', () => { if (m.active) this.gs.time.delayedCall(150 + ((i * 397) % 600), () => { if (m.active && this.artOn) m.play(sp); }); });
        this.gs.time.delayedCall(i * 230, () => { if (m.active) m.play(sp); });
      }
    });
    const nr = Assets.sprite('chief_halo_notch');
    if (nr && !nr.ph && !nr.pending) { this.notchImg.setTexture(nr.tex, 'chief_halo_notch_00'); this.notchArt = nr.tex; }
    this.artOn = true;
    this.keys = { ring: 'chief_halo', gold: 'chief_halo_gold' };
    return true;
  }

  /** (CODE-2) the chief as a moving night light (DayClock.drawGlows): a warm pool of light on the ground at his feet.
   *  ((v4.2 fix, visual H1) the ADD lights are drawn above the whole world: centred on his chest (y − 40) it bleached
   *  his face and coat white at night, indoors too; a flat pool around his boots lights the snow, not him) */
  lightPoints(pts) {
    const p = this.gs.player;
    if (!p || !this.on || p.sprite.visible === false) return;
    pts.push({ x: p.x, y: p.y + 8 - (p.liftY || 0), k: 0.95, sy: 0.42, a: 0.6 });
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
    if (!on) { for (const o of this.all) if (o.visible) o.setVisible(false); if (this.ghost.visible) this.ghost.setVisible(false); this.cover = null; this.updateCheer(dt, false); return; }
    for (const o of this.all) if (!o.visible && o !== this.band) o.setVisible(true);
    const a = A();
    const w = this.ringWidth(), sc = w / 192;
    // ((robust review H2) inside a cutaway the ring lies on its raised floor, just under him (else the floor layer
    //  would cover it))
    const ly = p.liftY || 0, inside = p.inDepth !== undefined && p.inDepth !== p.y;
    const x = p.x, y = p.y + 2 - ly;
    if (inside !== this.wasInside) {
      this.wasInside = inside;
      if (!inside) { this.ring.setDepth(DEPTH.PAD + 2); this.goldRing.setDepth(DEPTH.PAD + 2.01); this.band.setDepth(DEPTH.PAD + 1.99); this.notchImg.setDepth(DEPTH.PAD + 2.02); }
    }
    if (inside) { const d0 = p.inDepth - 8e-6; this.ring.setDepth(d0); this.goldRing.setDepth(d0); this.band.setDepth(d0 - 1e-6); this.notchImg.setDepth(d0 + 5e-7); }
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
    this.glow.setPosition(x, p.y + 4 - ly).setScale(1.15).setDepth(inside ? p.inDepth - 9e-6 : p.y - 0.5).setAlpha(ga * (0.85 + Math.sin(this.t * 1.7) * 0.15));
    // motes riding the ring (one turn every 6 s; slower in 관망)
    const spin = (this.t / (this.observing ? 9 : 6)) * Math.PI * 2;
    const rx = w * 0.46, ry = w * 0.23;
    // (the art's sparkles are 32 px one-shot twinkles: half the stand-in's scale, their own fade)
    const mk = this.artOn ? 0.5 : 1;
    for (let i = 0; i < MOTES; i++) {
      const m = this.motes[i], ang = spin + (i / MOTES) * Math.PI * 2;
      const tw = 0.5 + 0.5 * Math.sin(this.t * 3.1 + i * 1.7);
      const mx = x + Math.cos(ang) * rx, my = y + Math.sin(ang) * ry - 2;
      m.setPosition(mx, my - tw * 4).setDepth(inside ? p.inDepth + (Math.sin(ang) > 0 ? 1e-6 : -7e-6) : Math.sin(ang) > 0 ? p.y + 1 : p.y - 1).setAlpha(this.artOn ? 0.95 : 0.35 + tw * 0.55).setScale(sc * mk * (this.artOn ? 1.1 : 0.55 + tw * 0.4));
    }
    // the navigator's notch: a small gem on the ring where the route leaves it (art: chief_halo_notch, the same
    // 16 headings as the chevron, at 1.3 x the ring scale; the stand-in: a small chevron)
    if (this.notch !== null && this.notch !== undefined) {
      const k = Math.round(((this.notch % (Math.PI * 2)) + Math.PI * 2) / (Math.PI * 2 / 16)) % 16;
      if (this.notchArt) this.notchImg.setFrame('chief_halo_notch_' + (k < 10 ? '0' : '') + k).setPosition(x + Math.cos(this.notch) * w * 0.46, y + Math.sin(this.notch) * w * 0.23).setScale(sc * 1.3).setAlpha(0.95);
      else this.notchImg.setFrame('c' + k).setPosition(x + Math.cos(this.notch) * rx * 1.05, y + Math.sin(this.notch) * ry * 1.05).setScale(sc * 1.6).setAlpha(0.9);
    } else if (this.notchImg.alpha) this.notchImg.setAlpha(0);
    // the star pin: zoomed out, in a crowd, or in 관망
    this.crowdT -= dt;
    if (this.crowdT <= 0) { this.crowdT = 0.5; this.crowd = this.countNear(p, a.crowdR || 160) >= (a.crowdN || 4); }
    this.coverT -= dt;
    if (this.coverT <= 0) { this.coverT = 0.1; this.cover = this.coveredBy(p); }
    this.drawGhost(p);
    const wantPin = (gs.zoomCur || 1) < (a.pinZoom || 0.8) || this.crowd || this.observing || !!this.cover;
    this.pinA += ((wantPin ? 1 : 0) - this.pinA) * Math.min(1, dt / 0.2);
    if (this.pinA > 0.01) {
      let top = p.y - ly + p.headTop - 14;
      if (p.stack.count) { let h = 0; for (const it of p.stack.items) h += stackStep(it.type) * p.stack.scale; top -= h + 26; }
      const pz = Math.max(0.05, gs.zoomCur || 1);
      // 22 CSS px on a 390 px phone: world px = 22 / (zoom x 390/720)
      const ps = (22 / (pz * 390 / 720)) / 72;
      // (the art sweeps its own light: no code bob then)
      this.pin.setPosition(x, top + (this.artOn ? 0 : Math.sin(this.t * 3) * 2)).setScale(ps).setAlpha(this.pinA);
    } else if (this.pin.alpha) this.pin.setAlpha(0);
    this.updateCheer(dt, true);
  }

  /** ((v4.2 fix, gameplay M1) the train car drawn over the chief (it stands at 서리역 between him and the camera): its
   *  sprite, else null. The car's own pixels decide (Occlusion's alpha mask), not just its box */
  coveredBy(p) {
    const tr = this.gs.v4 && this.gs.v4.train, occ = this.gs.occlusion;
    if (!tr || !tr.cars || !p.sprite.visible) return null;
    const d = p.inDepth !== undefined ? p.inDepth : p.y, ly = p.liftY || 0;
    const h = p.headTop || -80;
    for (const c of tr.cars) {
      const s = c.spr;
      if (!s || !s.visible || s.depth <= d || s.alpha < 0.5) continue;
      if (Math.abs(s.x - p.x) > s.displayWidth || p.y > s.y + 4 || p.y < s.y - s.displayHeight) continue;
      const pts = [[p.x, p.y - ly - 20], [p.x, p.y - ly + h * 0.55], [p.x, p.y - ly + h + 14]];
      let n = 0;
      for (const [x, y] of pts) if (occ ? occ.solid(s, x, y) : true) n++;
      if (n >= 2) return s;
    }
    return null;
  }

  /** the silhouette over the covering car: his current frame, filled with a soft cream, at half alpha */
  drawGhost(p) {
    const g = this.ghost, c = this.cover;
    if (!c || !c.active) { if (g.visible) g.setVisible(false); return; }
    const s = p.sprite;
    if (!s.frame || !s.texture || s.texture.key === '__MISSING') { g.setVisible(false); return; }
    if (g.texture !== s.texture || g.frame.name !== s.frame.name) g.setTexture(s.texture.key, s.frame.name);
    g.setOrigin(s.originX, s.originY).setFlipX(s.flipX).setPosition(s.x, s.y).setScale(s.scaleX, s.scaleY).setDepth(c.depth + 0.5).setVisible(true);
    if (!g.__tf) { g.__tf = 1; g.setTintFill(0xfff4d6); }
    g.setAlpha(0.52 + Math.sin(this.t * 3) * 0.06);
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
    // (v4.2 CODE-2) the 응원 pose (chief2 cheer: the little 서리마을 pennant up, a hop) while his hands are free
    if (this.cheering && on && p.stack.count === 0 && !p.seat && !p.node && !p.opSpot && (!p.action || p.action.anim === 'cheer') && !(this.v42.pilot && this.v42.pilot.on)) {
      if (!p.action) p.doAction('cheer', 3.6);
    } else if (!this.cheering && p.action && p.action.anim === 'cheer') p.action.until = 0;
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
      depth: this.ring.depth, key: this.ring.texture.key, frame: this.ring.frame ? this.ring.frame.name : null, art: this.artOn, objects: this.all.length + 1,
      covered: !!this.cover, ghost: this.ghost.visible };
  }

  destroy() {
    const i = Assets.arrivals.indexOf(this.onArrive);
    if (i >= 0) Assets.arrivals.splice(i, 1);
    for (const o of this.all) if (o && o.scene) o.destroy();
    if (this.ghost && this.ghost.scene) this.ghost.destroy();
  }
}
