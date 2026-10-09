// TitleScreen — puts the living title together on a Phaser scene and runs it.
//
//   const screen = mountTitle(scene, { onStart, onSettings, stage, intro, version });
//   scene.update(time, delta) -> screen.update(delta / 1000)
//
// Three cameras: sky (sky, mountains, sea; screen space), world (the diorama; zooms / pans), ui (snow,
// logo, buttons; screen space). Two modes:
//   intro  first run: ~11 s cinematic of the whole growth (camp -> village -> town -> city), morning ->
//          dusk -> night, camera dolly out, logo drop, "터치하여 시작". A tap skips to the end.
//   idle   afterwards: the stage of the player's save (src/title/progress.js), its life loops; if the save
//          moved on since the title last showed it, the new buildings pop in once ("마을이 자랐어요!").
// prefers-reduced-motion: no intro, no camera motion, no pops / snowfall / moving life; fades only.
import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { View } from '../core/View.js';
import { getLang } from '../data/strings.js';
import * as L from './layout.js';
import { TITLE_CFG, TITLE_LAYOUT } from './config.js';
import { TitleAssets } from './TitleAssets.js';
import { TitlePrefs, prefersReducedMotion, lowMemoryDevice } from './prefs.js';
import { readProgress } from './progress.js';
import { TitleFx } from './TitleFx.js';
import { TitleSky } from './TitleSky.js';
import { TitleDiorama } from './TitleDiorama.js';
import { TitleLogo } from './TitleLogo.js';
import { TitleUI } from './TitleUI.js';
import { TitleSettings } from './TitleSettings.js';

const SPAN_PX = 2 * L.AX;     // screen px per metre of "span"

/** zoom (logical px per world px) that shows `span` metres across the 720 logical width */
function zoomOf(span, W) { return W / (span * SPAN_PX); }

// intro camera keys: time, focus (metres), span (metres); Catmull-Rom through them (continuous speed)
function introKeys() {
  const c = L.CAMERA;
  return [
    { t: -1.0, mx: c[1].mx + 0.4, my: c[1].my + 0.3, span: c[1].span * 0.72 },
    { t: 0.0, mx: c[1].mx + 0.3, my: c[1].my + 0.2, span: c[1].span * 0.74 },
    { t: 2.3, mx: c[1].mx, my: c[1].my, span: c[1].span },
    { t: 4.6, mx: c[2].mx, my: c[2].my, span: c[2].span },
    { t: 7.1, mx: c[3].mx, my: c[3].my, span: c[3].span },
    { t: 9.6, mx: c[4].mx, my: c[4].my, span: c[4].span },
    { t: 12.0, mx: c[4].mx, my: c[4].my, span: c[4].span },
    { t: 14.0, mx: c[4].mx, my: c[4].my, span: c[4].span },
  ];
}
// time of day keys of the intro (0 day, 1 dusk, 2 night)
const TOD_KEYS = [[0, 0.12], [2.6, 0.3], [5.0, 0.9], [7.5, 1.45], [9.5, 2.0]];

function cr(p0, p1, p2, p3, u) {
  const u2 = u * u, u3 = u2 * u;
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
}

function idleTod(stage) {
  const m = TITLE_CFG.idleTime;
  if (m === 'day') return 0.15;
  if (m === 'dusk') return 1.0;
  if (m === 'auto') return stage <= 2 ? 1.15 : 2;
  return 2;
}

export function mountTitle(scene, hooks = {}) { return new TitleScreen(scene, hooks); }

export class TitleScreen {
  constructor(scene, hooks) {
    this.scene = scene;
    this.hooks = hooks;
    this.W = View.W; this.H = View.H;
    this.lang = hooks.lang || getLang() || 'ko';
    this.reduced = hooks.reduced !== undefined ? !!hooks.reduced : prefersReducedMotion();
    this.touch = hooks.touch !== undefined ? !!hooks.touch : !!scene.sys.game.device.input.touch;
    TitlePrefs.load();
    const prog = readProgress();
    this.saveStage = Math.max(1, Math.min(4, hooks.stage || prog.stage));
    this.cap = lowMemoryDevice() ? TITLE_CFG.lowMemStageCap : 4;
    this.mode = (hooks.intro !== undefined ? hooks.intro : TitlePrefs.wantIntro()) && !this.reduced ? 'intro' : 'idle';
    this.t = 0;
    this.started = false;
    this.cam = { fx: 0, fy: 0, z: 0.3 };
    this.setupCameras();
    TitleFx.make(scene);
    this.sky = new TitleSky(scene, this.putSky, this.W, this.H, TITLE_LAYOUT);
    this.dio = new TitleDiorama(scene, this.putWorld, { reduced: this.reduced, cue: (n, v) => this.cue(n, v) });
    // the gear opens the lead's settings (hooks.onSettings) or the title's own small card (hooks.settings !== false)
    this.settings = hooks.onSettings || hooks.settings === false ? null : new TitleSettings(this, this.putUI);
    const onSettings = hooks.onSettings || (this.settings ? () => this.settings.show() : null);
    this.ui = new TitleUI(scene, this.putUI, this.W, this.H, TITLE_LAYOUT, {
      lang: this.lang, touch: this.touch, version: hooks.version, safeTop: View.safeTop, safeBottom: View.safeBottom,
      onSettings, reduced: this.reduced,
    });
    this.makeSnow();
    this.logo = null;
    this.loadRest();
    // title art still on its way (the game's Preload did not fetch it): swap it in when it lands
    this.builtWithoutArt = !TitleAssets.artSettled(scene.textures);
    if (this.mode === 'intro') this.startIntro(); else this.startIdle();
    this.bindInput();
    if (typeof window !== 'undefined') window.__TITLE = this;
  }

  // ------------------------------------------------------------------ cameras
  setupCameras() {
    const s = this.scene, cams = s.cameras;
    const gw = s.scale.gameSize.width, gh = s.scale.gameSize.height;
    this.camSky = cams.main;
    View.applyUI(this.camSky);
    this.camSky.setBackgroundColor('#0a1230');
    this.camWorld = cams.add(0, 0, gw, gh, false, 'ttl_world');
    this.camUI = cams.add(0, 0, gw, gh, false, 'ttl_ui');
    View.applyUI(this.camUI);
    const all = this.camSky.id | this.camWorld.id | this.camUI.id;
    const mk = (cam) => (o) => { o.cameraFilter = all & ~cam.id; return o; };
    this.putSky = mk(this.camSky);
    this.putWorld = mk(this.camWorld);
    this.putUI = mk(this.camUI);
  }

  /** place the world camera: world point (fx, fy) at screen (W/2, focusY*H), zoom z */
  applyCamera(fx, fy, z) {
    this.cam.fx = fx; this.cam.fy = fy; this.cam.z = z;
    const cw = this.camWorld;
    cw.setZoom(View.k * z);
    cw.centerOn(fx, fy + ((0.5 - TITLE_LAYOUT.focusY) * this.H) / z);
  }

  cameraAtStage(stage, drift) {
    const c = L.CAMERA[stage];
    let fx = L.wx(c.mx, c.my), fy = L.wy(c.mx, c.my), z = zoomOf(c.span, this.W);
    if (drift && !this.reduced) {
      // a slow breathing drift that starts from rest (no jump when the intro hands over)
      const t = this.idleT || 0, k = Math.min(1, t / 4);
      fx += Math.sin(t * 0.11) * 26 * k; fy += Math.sin(t * 0.083) * 10 * k; z *= 1 + 0.012 * Math.sin(t * 0.17) * k;
    }
    this.applyCamera(fx, fy, z);
  }

  cameraIntro(t) {
    const K = this.keys || (this.keys = introKeys());
    let i = 1;
    while (i < K.length - 2 && t > K[i + 1].t) i++;
    const a = K[i - 1], b = K[i], c = K[i + 1], d = K[i + 2];
    const u = Math.max(0, Math.min(1, (t - b.t) / (c.t - b.t)));
    const mx = cr(a.mx, b.mx, c.mx, d.mx, u), my = cr(a.my, b.my, c.my, d.my, u);
    const ls = cr(Math.log(a.span), Math.log(b.span), Math.log(c.span), Math.log(d.span), u);
    this.applyCamera(L.wx(mx, my), L.wy(mx, my), zoomOf(Math.exp(ls), this.W));
  }

  // ------------------------------------------------------------------ loading
  loadRest() {
    const s = this.scene, load = s.load;
    TitleAssets.listeners.push((g) => this.onGroup(g));
    TitleAssets.queueEarly(load);
    for (let g = 1; g <= this.cap; g++) TitleAssets.queueGroup(load, g);
    TitleAssets.queueArt(load, { lang: this.lang, k: View.k });
    TitleAssets.queueLateCues(load);
    if (load.list.size > 0 && !load.isLoading()) load.start();
    // title art arriving after the title opened: swap the stand-ins (sky strips, snow) once all of it is in
    const check = () => { if (!this.started && this.builtWithoutArt && !this.artSwapped && TitleAssets.artSettled(this.scene.textures)) this.later(0, () => this.swapArt()); };
    load.on('filecomplete', (key) => { if (TitleAssets.artKeys.has(key)) check(); });
    load.on('complete', check);
  }

  onGroup() {
    this.dio.onGroup();
  }

  // ------------------------------------------------------------------ modes
  startIntro() {
    this.mode = 'intro';
    this.t = 0;
    this.nextStage = 1;
    this.hold = 0;
    this.dio.setStageInstant(0);
    this.dio.setLight(0.12);
    this.sky.setTime(0.12);
    this.cameraIntro(0);
    this.ui.setChip(0);
    this.camUI.fadeIn(900, 236, 244, 252);
  }

  startIdle(fromIntro) {
    const was = this.mode;
    this.mode = 'idle';
    this.idleT = 0;
    if (!fromIntro) {
      this.t = 0;
      const want = Math.min(this.cap, this.saveStage);
      const shown = TitlePrefs.data.shown;
      this.idleStage = want;
      const growFrom = shown >= 1 && shown < want && !this.reduced ? shown : 0;
      this.dio.setStageInstant(growFrom || want);
      if (growFrom) this.growAt = 1.0;
      const tod = idleTod(want);
      this.dio.setLight(tod); this.sky.setTime(tod);
      this.cameraAtStage(want, false);
      this.logoAt = this.reduced ? 0 : 0.25;
      this.camUI.fadeIn(this.reduced ? 500 : 700, 236, 244, 252);
    } else {
      this.idleStage = 4;
      this.logoAt = -1;
    }
    TitlePrefs.data.shown = Math.max(TitlePrefs.data.shown, Math.min(this.cap, this.saveStage));
    if (was === 'intro') TitlePrefs.data.introSeen = true;
    TitlePrefs.save();
  }

  /** tap during the intro: jump to the end (city at night, logo, start pill) */
  skipIntro() {
    if (this.mode !== 'intro') return;
    this.camUI.flash(260, 240, 246, 252);
    this.dio.setStageInstant(4);
    this.dio.setLight(2); this.sky.setTime(2);
    this.t = TITLE_CFG.intro.end;
    this.ui.hideChips(); this.ui.showSkip(false);
    this.cameraIntro(12);
    if (!this.logo) this.dropLogo(0.6);
    this.ui.showTap();
    this.startIdle(true);
  }

  dropLogo(dur) {
    if (this.logo) return;
    this.logo = new TitleLogo(this.scene, this.putUI, this.W, this.H, TITLE_LAYOUT, { lang: this.lang, reduced: this.reduced, y: this.H * TITLE_LAYOUT.logoY + View.safeTop * 0.6 });
    this.logo.drop(this.reduced ? 0.6 : dur, () => { this.cue('logo', 0.6); });
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    if (dt > 0.1) dt = 0.1;
    const I = TITLE_CFG.intro;
    if (this.mode === 'intro') {
      // hold the clock at a stage start while that stage's pictures are still on their way
      const ns = this.nextStage;
      if (ns <= 4 && this.t + dt >= I.stageStart[ns - 1] && !this.dio.stageReady(ns) && this.hold < I.maxWaitSec) { this.hold += dt; dt = 0; }
      const t0 = this.t;
      this.t += dt;
      const t = this.t;
      while (this.nextStage <= 4 && t >= I.stageStart[this.nextStage - 1]) {
        const s = this.nextStage++;
        this.hold = 0;
        this.dio.grow(s, s === 1 ? 1.5 : 1.7);
        this.ui.setChip(s);
        if (s === 3) this.dio.trainArrive();
        if (s === 4) { this.later(1.2, () => this.cue('bus', 0.5)); this.cityAt = this.t; }
      }
      if (t0 < 1.0 && t >= 1.0) this.ui.showSkip(true);
      if (t0 < I.logoAt && t >= I.logoAt) { this.dropLogo(0.85); this.ui.hideChips(); this.ui.showSkip(false); }
      if (t0 < I.tapAt && t >= I.tapAt) this.ui.showTap();
      // light + camera follow the script
      let tod = TOD_KEYS[TOD_KEYS.length - 1][1];
      for (let k = 0; k < TOD_KEYS.length - 1; k++) {
        const A = TOD_KEYS[k], B = TOD_KEYS[k + 1];
        if (t < B[0]) { const u = Math.max(0, (t - A[0]) / (B[0] - A[0])); tod = A[1] + (B[1] - A[1]) * u * u * (3 - 2 * u); break; }
      }
      this.dio.setLight(tod); this.sky.setTime(tod);
      this.cameraIntro(t);
      if (t >= I.end) this.startIdle(true);
    } else {
      this.t += dt;
      this.idleT += dt;
      if (this.logoAt >= 0 && this.t >= this.logoAt) {
        // give a late title-art logo a moment (up to 1 s) before falling back to the text logo
        if (TitleAssets.artSettled(this.scene.textures) || this.t >= this.logoAt + 1.0) { this.dropLogo(0.7); this.later(0.45, () => this.ui.showTap()); this.logoAt = -1; }
      }
      if (this.growAt !== undefined && this.t >= this.growAt && this.dio.stageReady(this.idleStage)) {
        this.growAt = undefined;
        this.dio.grow(this.idleStage, TITLE_CFG.growSec);
        this.ui.showRibbon();
        this.cue('stage', 0.8);
      }
      this.cameraAtStage(this.idleStage, true);
    }
    this.runLater(dt);
    const cityK = this.dio.stage >= 4 ? (this.cityAt !== undefined ? Math.min(1, (this.t - this.cityAt) / 2) : 1) : 0;
    if (cityK !== this.sky.cityK) this.sky.setCity(cityK);
    this.sky.update(dt, this.cam.z, this.cam.fx, this.cam.fy, this.reduced);
    this.dio.update(dt);
    if (this.logo) this.logo.update(dt);
    this.ui.update(dt);
  }

  // tiny timer list (no Phaser timers: the title runs on its own clock)
  later(sec, fn) { (this.timers || (this.timers = [])).push([sec, fn]); }
  runLater(dt) {
    const T = this.timers;
    if (!T || !T.length) return;
    for (let i = T.length - 1; i >= 0; i--) { T[i][0] -= dt; if (T[i][0] <= 0) { const fn = T[i][1]; T.splice(i, 1); fn(); } }
  }

  // ------------------------------------------------------------------ input / start
  bindInput() {
    const s = this.scene;
    s.input.on('pointerdown', (p, over) => { if (over && over.length) return; this.tap(); });
    if (s.input.keyboard) {
      s.input.keyboard.on('keydown-ENTER', () => this.tap());
      s.input.keyboard.on('keydown-SPACE', () => this.tap());
    }
  }

  tap() {
    if (this.started || (this.settings && this.settings.open)) return;
    // the first tap is a user gesture: audio may start now
    Audio.start();
    if (this.mode === 'intro' && this.t < TITLE_CFG.intro.tapAt) {
      Audio.playMusic('bgm_title');
      this.cue('whoosh', 0.5);
      this.skipIntro();
      return;
    }
    if (!this.ui.tapOn) { this.ui.showTap(); if (!this.logo) this.dropLogo(0.5); return; }
    this.start();
  }

  start() {
    if (this.started) return;
    this.started = true;
    TitlePrefs.data.introSeen = true;
    TitlePrefs.save();
    Audio.play('sfx_click');
    Audio.playMusic('bgm_title');
    this.scene.time.delayedCall(180, () => Audio.play('sfx_whoosh', { volume: 0.6 }));
    this.camUI.fadeOut(450, 230, 240, 250);
    this.camUI.once('camerafadeoutcomplete', () => { if (this.hooks.onStart) this.hooks.onStart(); });
  }

  /** play an intro sound: the first key of TITLE_CFG.cues[name] that is loaded */
  cue(name, vol = 1) {
    const keys = TITLE_CFG.cues[name];
    if (!keys || !Audio.started) return;
    for (const k of keys) {
      if (!Audio.exists(k)) continue;
      const late = TitleAssets.cueVol[k];
      const v = late !== undefined && !Assets.audioDef(k) ? vol * (late / 0.7) : vol;
      Audio.play(k, { volume: v });
      return;
    }
  }

  /** falling snow: the title art's three layers (far flakes behind the island, mid + big soft ones in
   *  front), or the game's snowflake when the art is not there. Particles are pooled by Phaser. */
  makeSnow() {
    if (this.reduced) return;
    const s = this.scene, W = this.W, H = this.H;
    const has = s.textures.exists('ttl_fx') && s.textures.get('ttl_fx').has('ttl_fx_snow_s');
    const emit = (tex, cfg, put, depth) => { const e = s.add.particles(0, 0, tex, cfg).setDepth(depth); put(e); return e; };
    if (has) {
      this.snow = [
        emit('ttl_fx', { frame: 'ttl_fx_snow_s', x: { min: -10, max: W + 10 }, y: { min: -20, max: H * 0.95 }, lifespan: 9000, speedY: { min: 20, max: 40 }, speedX: { min: -6, max: 8 },
          scale: { min: 0.5, max: 0.9 }, alpha: { start: 0.65, end: 0 }, frequency: 130, advance: 9000 }, this.putSky, 9.5),
        emit('ttl_fx', { frame: ['ttl_fx_snow_m', 'ttl_fx_flake_s'], x: { min: -20, max: W + 20 }, y: { min: -30, max: H * 0.8 }, lifespan: 8000, speedY: { min: 40, max: 70 },
          speedX: { min: -16, max: 18 }, scale: { min: 0.6, max: 1.0 }, alpha: { start: 0.95, end: 0.1 }, rotate: { min: 0, max: 360 }, frequency: 240, advance: 8000 }, this.putUI, 40),
        emit('ttl_fx', { frame: 'ttl_fx_snow_bokeh', x: { min: -40, max: W + 40 }, y: { min: -60, max: H * 0.7 }, lifespan: 9000, speedY: { min: 70, max: 110 }, speedX: { min: -12, max: 14 },
          scale: { min: 0.8, max: 1.6 }, alpha: { start: 0.75, end: 0.25 }, frequency: 1700, advance: 9000 }, this.putUI, 41),
      ];
      return;
    }
    const sf = Assets.sprite('fx_snowflake');
    const fr = s.textures.get(sf.tex).get(sf.frame);
    const base = 12 / Math.max(8, fr.width);
    const cfg = {
      x: { min: -20, max: W + 20 }, y: -20, lifespan: 12000, speedY: { min: 38, max: 96 }, speedX: { min: -22, max: 26 },
      scale: { min: base * 0.55, max: base * 1.5 }, alpha: { min: 0.55, max: 0.95 }, rotate: { min: 0, max: 360 }, frequency: 85, quantity: 1,
      advance: 9000,
    };
    if (sf.frame !== undefined) cfg.frame = sf.frame;
    this.snow = [emit(sf.tex, cfg, this.putUI, 40)];
  }

  /** the title art finished loading after the title opened: rebuild the backdrop and the snow with it */
  swapArt() {
    if (this.artSwapped) return;
    this.artSwapped = true;
    const tod = this.sky.tod;
    const city = this.sky.cityK;
    const oldFx = this.sky.usedFx;
    this.sky.destroy();
    this.sky = new TitleSky(this.scene, this.putSky, this.W, this.H, TITLE_LAYOUT);
    this.sky.setTime(tod < 0 ? 0 : tod); this.sky.setCity(city);
    // stand-ins the art replaced: free their texture memory now
    for (const k of oldFx) if (!this.sky.usedFx.has(k) && this.scene.textures.exists(k)) { this.scene.textures.remove(k); TitleAssets.keys.delete(k); }
    if (this.snow) for (const e of this.snow) e.destroy();
    this.makeSnow();
  }

  /** play the intro again from the start (settings "인트로 다시 보기", tests) */
  replayIntro() {
    if (this.started) return;
    if (this.settings) this.settings.hide();
    this.dio.clearLife();
    this.dio.setStageInstant(0);
    if (this.logo) { this.logo.destroy(); this.logo = null; }
    this.ui.reset();
    this.timers = null;
    this.growAt = undefined;
    this.keys = null;
    this.startIntro();
  }

  /** test / debug state */
  state() {
    return { mode: this.mode, t: +this.t.toFixed(2), stage: this.dio.stage, saveStage: this.saveStage, groups: Object.assign({}, TitleAssets.state),
      logo: !!this.logo, logoArt: !!(this.logo && this.logo.fromArt), tap: this.ui.tapOn, z: +this.cam.z.toFixed(3), reduced: this.reduced };
  }

  destroy() {
    if (typeof window !== 'undefined' && window.__TITLE === this) window.__TITLE = null;
    this.dio.destroy();
    this.timers = null;
  }
}
