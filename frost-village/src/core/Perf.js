// (v4.3 perf) 그래픽 사양: 고사양 / 중사양 / 저사양 (+ 자동). One table of every knob a preset turns, the automatic pick
// (first run: the phone's memory, cores, GPU, Android version; the Android app adds SDK / total RAM / low-RAM flag),
// a short frame-rate check in the village that can step DOWN one level once per session (never up by itself), the
// 성능 정보 overlay for testers, and the low preset's half-resolution pictures.
//
// Everything else only reads Perf.p (the active preset's knobs); the scenes call Perf.applyGame(gs) when the village
// starts or the setting changes. A knob that needs a fresh page (antialias, the half-resolution pictures, the plain
// sea) applies on the next start: the settings row says so.
//
// Measured on the busy 46-min village (docs: scratchpad v43/perf/audit/measure.md): render scale is the biggest GPU
// lever (k 1.5 -> 1.0 = -55 % fill), then the water shader (20-24 %), MSAA (~15 %), the night overlay and glows
// (11 % at night); on the CPU the off-screen culling pass, particles and the doll rigs; texture memory needs the low
// preset's half-resolution atlas pages (a 2 GB phone cannot hold the full set).

import { Settings } from './Save.js';
import { View, MAX_RENDER_SCALE } from './View.js';
import { t } from '../data/strings.js';
import { Residency } from './Residency.js';
import { suggestWaterQuality } from '../systems/Water.js';

/**
 * every knob of a preset
 *   maxK        render scale cap (canvas px per logical px; View.k)
 *   fps         frame cap (0 = none; 120/144 Hz screens still get main.js's 80 cap)
 *   aa          MSAA on the WebGL context (render.antialiasGL) — boot only (reload)
 *   water       'auto' (물결 품질 setting / GPU guess / watchdog) | 'low' (simple shader) | 'static' (the old
 *               scrolling sea, shore baked into the ground) — 'static' boot only (reload)
 *   snow        ambient snowfall rate (x)          fx      particle burst size (x, at least 1 particle)
 *   glows       night lamp glows drawn at most     rigs / lite   townsfolk doll caps (full rigs / one-picture dolls)
 *   cullEvery   the view-culling pass runs every Nth drawn frame (+ whenever the camera moves)
 *   bake        ground tiles baked per check (0.12 s)         groundLow   half-resolution ground tiles, smaller pool
 *   texScale    atlas pages / big pictures uploaded at this scale (display size unchanged; 중 0.75, 저 0.5) — boot only (reload)
 *   tex         texture budget overrides (BALANCE.v4.tex: socialPages, socialTtl, targetMiB)
 *   near / far  px between the view and an area for its building pages to load / leave (Residency regions)
 */
export const PRESETS = {
  high: { maxK: MAX_RENDER_SCALE, fps: 0, aa: true, water: 'auto', snow: 1, fx: 1, glows: 40, rigs: 32, lite: 40,
    cullEvery: 1, bake: 2, groundLow: false, texScale: 1, tex: null, near: 800, far: 1200 },
  // (중사양 = a 3 GB phone: the big pages at 0.75 (56 % of the bytes): full v4 ~270 MiB of textures instead of ~410,
  //  so the render targets of k 1.5 (~70 MiB) still fit; measured with tools/test/texbudget.mjs --gfx mid)
  mid: { maxK: 1.5, fps: 60, aa: true, water: 'low', snow: 0.6, fx: 0.7, glows: 20, rigs: 20, lite: 30,
    cullEvery: 2, bake: 1, groundLow: false, texScale: 0.75, tex: { socialPages: 3, socialTtl: 18, targetMiB: 280 }, near: 700, far: 1050 },
  low: { maxK: 1, fps: 30, aa: false, water: 'static', snow: 0.3, fx: 0.5, glows: 8, rigs: 10, lite: 20,
    cullEvery: 3, bake: 1, groundLow: true, texScale: 0.5, tex: { socialPages: 2, socialTtl: 12, targetMiB: 200, lowMiB: 150 }, near: 600, far: 900 },
};
export const ORDER = ['high', 'mid', 'low'];
const SETTINGS = ['auto', 'high', 'mid', 'low'];

// the GPUs where the high water shader / the sharper scale take a large part of the frame (same list as
// Water.suggestWaterQuality: Mali-G5x/G6x with <= 3 cores, Mali-4xx / T6xx-T8xx, Adreno 3xx-5xx / 60x-61x,
// PowerVR GE8xxx / Rogue, software GL)
function weakGpu(r) {
  r = String(r || '');
  const m = r.match(/Mali-G(\d+)\s*M[PC](\d+)/i);
  if (m && +m[1] < 70 && +m[2] <= 3) return true;
  return /Mali-(4\d\d|T[678]\d\d)|Adreno.*\b([345]\d\d|6[01]\d)\b|PowerVR.*(GE8\d{3}|Rogue)|SwiftShader|llvmpipe|Software/i.test(r);
}

const webdriver = () => { try { return !!(typeof navigator !== 'undefined' && navigator.webdriver); } catch (e) { return false; } };
/** under a test driver the automatic step down only runs when the test asks for it (the suites measure one game) */
const autoAllowed = () => !webdriver() || !!(typeof window !== 'undefined' && window.__FV_PERF_WATCH);

/** a tiny throwaway WebGL context: max texture size + renderer string (only for the automatic pick) */
function probeGL() {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl) return { webgl: false, maxTex: 0, renderer: '' };
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0;
    let renderer = '';
    try { const ext = gl.getExtension('WEBGL_debug_renderer_info'); renderer = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || ''); } catch (e) { /* */ }
    try { const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); } catch (e) { /* */ }
    return { webgl: true, maxTex, renderer };
  } catch (e) { return { webgl: false, maxTex: 0, renderer: '' }; }
}

/** what the Android app tells about the phone (WebBridge.device(); null in a browser) */
function shellDevice() {
  try {
    const B = typeof window !== 'undefined' && window.SnowbloomAndroid;
    if (!B || typeof B.device !== 'function') return null;
    const o = JSON.parse(B.device());
    return o && typeof o === 'object' ? o : null;
  } catch (e) { return null; }
}

function uaAndroid() {
  try { const m = /Android (\d+)/.exec(navigator.userAgent || ''); return m ? +m[1] : 0; } catch (e) { return 0; }
}
function uaChrome() {
  try { const m = /Chrome\/(\d+)/.exec(navigator.userAgent || ''); return m ? +m[1] : 0; } catch (e) { return 0; }
}

/**
 * the automatic pick (docs: v43/perf/audit/compat.md §3.5)
 *   low  : low-RAM flag, RAM < 2600 MB, Android 7 (SDK <= 25), no WebGL / max texture < 4096, weak GPU with RAM < 3300 MB
 *          (a "3 GB" phone reports ~2.7-2.9 GB total, a "4 GB" one ~3.5-3.8 GB);
 *          in a browser deviceMemory <= 2 (it rounds 3 GB down to 2: conservative)
 *   mid  : RAM < 4500 MB (browser: deviceMemory <= 4), a weak GPU, <= 4 cores, Android 8-9
 *   high : otherwise
 */
export function pickPreset(d) {
  const ram = d.ram > 0 ? d.ram : 0, dm = d.dm > 0 ? d.dm : 0, cores = d.cores > 0 ? d.cores : 0;
  const sdk = d.sdk > 0 ? d.sdk : 0, andr = d.android > 0 ? d.android : 0;
  const weak = d.weak !== undefined ? !!d.weak : weakGpu(d.renderer);
  if (d.lowRam || (ram && ram < 2600) || (sdk && sdk <= 25) || (!sdk && andr && andr <= 7)) return 'low';
  if (d.webgl === false || (d.maxTex && d.maxTex < 4096)) return 'low';
  if (weak && ram && ram < 3300) return 'low';
  if (!ram && dm && dm <= 2) return 'low';
  if ((ram && ram < 4500) || (!ram && dm && dm <= 4) || weak || (cores && cores <= 4) || (sdk && sdk <= 28) || (!sdk && andr && andr <= 9)) return 'mid';
  return 'high';
}

export const Perf = {
  setting: 'auto',      // what the player chose: 'auto' | 'high' | 'mid' | 'low'
  name: 'high',         // the preset in use
  p: PRESETS.high,
  boot: null,           // { name, aa, texScale, water } the page started with (knobs that need a reload)
  dev: null,            // device facts of the automatic pick
  stepped: false,       // the automatic step down happened this session
  reason: '',           // why the automatic pick is what it is ('device', 'fps', 'oom', 'trim', 'test')
  onResize: null,       // main.js: re-fit the canvas after a render scale change
  game: null,
  pick: (d) => pickPreset(d),       // (tests)
  presets: PRESETS,
  texScaled: () => TexScale,
  baked: () => BAKED,

  /** device facts (a test may stand in a phone: window.__FV_PERF_DEVICE, only under navigator.webdriver) */
  device() {
    if (this.dev) return this.dev;
    const fake = webdriver() && typeof window !== 'undefined' && window.__FV_PERF_DEVICE;
    if (fake && typeof fake === 'object') {
      this.dev = Object.assign({ test: true }, fake);
      if (this.dev.weak === undefined) this.dev.weak = weakGpu(this.dev.renderer);
      return this.dev;
    }
    const sh = shellDevice() || {};
    const gl = probeGL();
    const n = typeof navigator !== 'undefined' ? navigator : {};
    this.dev = {
      dm: Number(n.deviceMemory) || 0, cores: Number(n.hardwareConcurrency) || 0,
      webgl: gl.webgl, maxTex: gl.maxTex, renderer: gl.renderer.slice(0, 80), weak: weakGpu(gl.renderer),
      android: uaAndroid(), chrome: uaChrome(),
      sdk: Number(sh.sdk) || 0, ram: Number(sh.ram) || 0, lowRam: !!sh.lowRam, lastExit: String(sh.lastExit || ''), shell: !!sh.sdk,
    };
    return this.dev;
  },
  /** a short signature of the facts the pick used: a village moved from another phone (마을 옮기기 carries the
   *  settings) is picked again for this one */
  sig(d) { return [d.dm, d.cores, d.maxTex, d.weak ? 1 : 0, d.sdk, Math.round((d.ram || 0) / 512), d.lowRam ? 1 : 0, d.webgl === false ? 0 : 1].join('|'); },

  /** main.js, before the Phaser game is made: settle the preset (render scale, antialias, frame cap come from it) */
  start() {
    try { Settings.load(); } catch (e) { /* defaults */ }
    const S = Settings.data;
    this.setting = SETTINGS.indexOf(S.gfx) >= 0 ? S.gfx : 'auto';
    this.name = this.resolve();
    // the Android app saw the last page die for memory: one level down (the automatic pick only)
    const d = this.setting === 'auto' ? this.device() : null;
    if (d && d.lastExit === 'oom' && autoAllowed()) this.lower('oom', true);
    this.p = PRESETS[this.name];
    this.boot = { name: this.name, aa: this.p.aa, texScale: this.p.texScale, water: this.p.water };
    View.maxK = this.p.maxK;
    if (this.p.texScale < 1) installTexScale();
    if (S.perfInfo) this.overlay(true);
    if (typeof window !== 'undefined') {
      const app = (window.__fvApp = window.__fvApp || {});
      app.trim = (level) => this.trim(level);
      window.__FV_PERF = this;          // (tests: tools/test/perf_presets.mjs; the 성능 정보 numbers)
    }
    return this.name;
  },

  /** the preset for the current setting (the automatic pick is remembered per phone; under a test driver it is 고사양
   *  unless the test stands in a phone, so the regression suites keep measuring the same game) */
  resolve() {
    if (this.setting !== 'auto') { this.reason = 'manual'; return this.setting; }
    const S = Settings.data;
    if (webdriver() && !(typeof window !== 'undefined' && window.__FV_PERF_DEVICE)) { this.reason = 'test'; return 'high'; }
    const d = this.device(), sig = this.sig(d);
    if (ORDER.indexOf(S.gfxAuto) >= 0 && S.gfxDev === sig) { this.reason = S.gfxWhy || 'device'; return S.gfxAuto; }
    const p = pickPreset(d);
    S.gfxAuto = p; S.gfxDev = sig; S.gfxWhy = 'device';
    this.reason = 'device';
    try { Settings.save(); } catch (e) { /* */ }
    return p;
  },

  /** the automatic preset one level down (remembered for this phone); `quiet`: at boot, before the game runs */
  lower(why, quiet) {
    if (this.setting !== 'auto' || this.name === 'low') return false;
    const nx = ORDER[ORDER.indexOf(this.name) + 1];
    const S = Settings.data;
    S.gfxAuto = nx; S.gfxWhy = why; if (!S.gfxDev) S.gfxDev = this.sig(this.device());
    try { Settings.save(); } catch (e) { /* */ }
    this.name = nx; this.p = PRESETS[nx]; this.reason = why;
    if (!quiet) this.applyLive();
    return true;
  },

  /** the frame-rate check / a memory warning asks for less: one step down per session, automatic setting only */
  stepDown(why) {
    if (this.stepped || this.setting !== 'auto' || this.name === 'low' || !autoAllowed()) return false;
    this.stepped = true;
    const ok = this.lower(why || 'fps');
    if (ok) this.say(t('gfx_stepped', { p: t('gfx_' + this.name) }));
    return ok;
  },

  /** the player picked a setting in 설정 → 그래픽 */
  set(setting) {
    if (SETTINGS.indexOf(setting) < 0) setting = 'auto';
    Settings.data.gfx = setting;
    try { Settings.save(); } catch (e) { /* */ }
    this.setting = setting;
    this.name = this.resolve();
    this.p = PRESETS[this.name];
    this.applyLive();
    return this.needsReload();
  },
  /** cycle 자동 → 고사양 → 중사양 → 저사양 → 자동 */
  next() { return SETTINGS[(SETTINGS.indexOf(this.setting) + 1) % SETTINGS.length]; },

  /** some knobs of the preset in use differ from what the page started with: they wait for a fresh start */
  needsReload() {
    const b = this.boot, p = this.p;
    return !!b && (b.aa !== p.aa || b.texScale !== p.texScale || (b.water === 'static') !== (p.water === 'static'));
  },

  /** everything that can change on a running game: render scale, frame cap, the village's knobs */
  applyLive() {
    View.maxK = this.p.maxK;
    if (this.onResize) { try { this.onResize(); } catch (e) { /* */ } }
    this.applyFps();
    const g = this.game, gs = g && g.scene && g.scene.isActive('Game') ? g.scene.getScene('Game') : null;
    if (gs && gs.applyGfx) gs.applyGfx();
  },

  /** the frame cap of the preset (main.js caps 120/144 Hz screens at 80 on its own when there is none) */
  applyFps() {
    const loop = this.game && this.game.loop;
    if (!loop) return;
    const f = this.p.fps;
    if (f === 30) setLimit(loop, 30);
    else if (loop.fpsLimit === 30) setLimit(loop, this.hiRefresh ? (f || 80) : 0);
    else if (this.hiRefresh) setLimit(loop, f || 80);
  },
  /** main.js: a 120/144 Hz screen was seen (its own 80 fps cap): the preset's cap instead */
  hiRefreshCap() { this.hiRefresh = true; return this.p.fps || 80; },

  /** Game.applyGfx: the village's knobs (ground, dolls, culling, water); returns the 'low ground' flag */
  applyGame(gs) {
    const p = this.p;
    gs.gfxLow = !!p.groundLow;
    if (gs.ground) {
      if (gs.ground.setLow) gs.ground.setLow(!!p.groundLow);
      gs.ground.bakeMax = p.bake;
      const gd = gs.ground;
      if (gd.water && gd.setWaterQuality) {
        // 중 / 저사양: simple (unless the player chose in 물결 품질); 고사양: the player's choice or the GPU's guess
        let q = Settings.data.water;
        if (!q) { try { q = p.water === 'auto' ? suggestWaterQuality(gs.sys.renderer.gl) : 'low'; } catch (e) { q = 'low'; } }
        if (gd.water.quality !== q) gd.setWaterQuality(q);
        if (p.water !== 'auto') gs.waterBudget = null;
      }
    }
    if (gs.dollPool) { gs.dollPool.low = !!p.groundLow; gs.dollPool.rigs = p.rigs; gs.dollPool.lite = p.lite; }
    if (gs.culler) gs.culler.every = p.cullEvery;
    return gs.gfxLow;
  },

  /** Residency.cfg(): the budget numbers with the preset's overrides (one object per base + preset) */
  texCfg(base) {
    const o = this.p.tex;
    if (!o) return base;
    if (this._tcB === base && this._tcP === this.p) return this._tc;
    this._tcB = base; this._tcP = this.p;
    this._tc = Object.assign({}, base, o);
    return this._tc;
  },

  /** the Android app: onTrimMemory(level) — 5/10 running low: far pictures go now; 15 critical: one step down too;
   *  20+ in the background: everything not on screen goes */
  trim(level) {
    level = Number(level) || 0;
    this.trims = (this.trims || 0) + 1;
    this.lastTrim = level;
    const g = this.game, gs = g && g.scene && g.scene.isActive('Game') ? g.scene.getScene('Game') : null;
    if (gs) {
      try { if (gs.ground && gs.ground.trim && gs.viewRect) gs.ground.trim(gs.viewRect()); } catch (e) { /* */ }
      // far areas' building pages + every on-demand page not on screen and unused for a second (Residency.makeRoom)
      try { if (Residency.gs === gs) { Residency.makeRoom(1e6); Residency.measure(); } } catch (e) { /* */ }
    }
    if (level === 15) this.stepDown('trim');
    return true;
  },

  // ---------------------------------------------------------------- the frame-rate check (automatic setting)
  /** main.js: is the automatic check in charge? (else main.js's own weak-GPU drop of the render scale runs) */
  watching() { return this.setting === 'auto' && !this.stepped && this.name !== 'low' && autoAllowed(); },

  /** watch the village's frame rate for its first minute; one step down when the median of 6 s stays under the
   *  preset's floor (고사양 38 fps, 중사양 28 fps). Paused tabs, the settings panel, 관리자 ×2/×4 and the water's own
   *  watchdog (it decides first) are skipped. */
  watch(game) {
    this.game = game;
    if (this._watchT) clearInterval(this._watchT);
    const buf = [];
    let t = 0, warm = 0;
    this._watchT = setInterval(() => {
      try {
        if (!this.watching()) { clearInterval(this._watchT); this._watchT = 0; return; }
        const loop = game.loop;
        if (!loop || !loop.running || document.visibilityState !== 'visible' || !game.scene.isActive('Game')) { buf.length = 0; return; }
        const gs = game.scene.getScene('Game'), ui = game.scene.getScene('UI');
        if ((ui && ui.panelOpen) || gs.simSpeed > 1 || (gs.waterBudget && gs.waterBudget.t > 0) || (gs.load && gs.load.isLoading && gs.load.isLoading())) { buf.length = 0; return; }
        if (++warm < 8) return;                       // the first seconds: decoding, after-title files
        buf.push(loop.actualFps);
        if (buf.length > 6) buf.shift();
        if (++t > 60) { clearInterval(this._watchT); this._watchT = 0; return; }
        if (buf.length < 6) return;
        const med = buf.slice().sort((a, b) => a - b)[3];
        const floor = this.name === 'high' ? 38 : 28;
        this.lastMedian = med;
        if (med < floor) { this.stepDown('fps'); clearInterval(this._watchT); this._watchT = 0; }
      } catch (e) { clearInterval(this._watchT); this._watchT = 0; }
    }, window.__FV_PERF_WATCH_MS || 1000);
  },

  // ---------------------------------------------------------------- toast + 성능 정보
  say(msg) {
    try { const g = this.game, ui = g && g.scene.getScene('UI'); if (ui && ui.toast && g.scene.isActive('UI')) ui.toast(msg, 3.5); } catch (e) { /* */ }
    this.lastToast = msg;
  },

  /** a tiny corner box (DOM: no texture uploads) with fps, the preset, render scale, texture MiB, JS heap */
  overlay(on) {
    if (typeof document === 'undefined') return;
    if (!on) { if (this._ov) { this._ov.remove(); this._ov = null; } if (this._ovT) { clearInterval(this._ovT); this._ovT = 0; } return; }
    if (this._ov) return;
    const d = document.createElement('div');
    d.id = 'fv-perf';
    d.setAttribute('aria-hidden', 'true');
    // (one thin line on the top edge, above the coin pill and the settings button: nothing of the HUD is covered)
    d.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:0;top:env(safe-area-inset-top,0px);z-index:9999;pointer-events:none;'
      + 'font:600 9px/12px monospace;color:#e8f4ff;background:rgba(10,20,40,0.6);padding:0 5px;border-radius:0 0 4px 4px;white-space:pre;';
    document.body.appendChild(d);
    this._ov = d;
    const tick = () => { try { d.textContent = this.info().line; } catch (e) { /* */ } };
    tick();
    this._ovT = setInterval(tick, 500);
  },

  /** the numbers the overlay shows (also for tests) */
  info() {
    const g = this.game;
    const fps = g && g.loop ? Math.round(g.loop.actualFps) : 0;
    let tex = 0;
    if (g && g.textures) {
      for (const k in g.textures.list) {
        const T = g.textures.list[k];
        for (const s of T.source) { const w = s.glTexture && s.glTexture.width ? s.glTexture.width : s.width, h = s.glTexture && s.glTexture.height ? s.glTexture.height : s.height; tex += (w || 0) * (h || 0) * 4; }
      }
    }
    const pm = typeof performance !== 'undefined' && performance.memory;
    const heap = pm && pm.usedJSHeapSize ? pm.usedJSHeapSize / 1048576 : 0;
    const texMiB = tex / 1048576;
    const tag = t('gfx_' + this.name) + (this.setting === 'auto' ? ' (' + t('gfx_auto') + ')' : '');
    const line = fps + 'fps · ' + tag + ' · k' + View.k + ' · tex ' + texMiB.toFixed(0) + 'MiB' + (heap ? ' · JS ' + heap.toFixed(0) + 'MiB' : '');
    return { fps, preset: this.name, setting: this.setting, k: View.k, texMiB: +texMiB.toFixed(1), heapMiB: +heap.toFixed(1), line };
  },
};

function setLimit(loop, f) {
  try {
    loop.sleep();
    loop.fpsLimit = f; loop.hasFpsLimit = f > 0; loop._limitRate = f > 0 ? 1000 / f : 0;
    loop.wake();
  } catch (e) { /* keep running as before */ }
}

// ---------------------------------------------------------------- 중사양 / 저사양: smaller pictures (0.75 / 0.5)
// The big atlas pages (characters, buildings, props, the town) are uploaded at Perf.p.texScale: a canvas at that size
// replaces the decoded picture, and the texture source keeps the FULL size, so every frame (cut in full-size pixels,
// UVs normalised by the source size), display size, origin, hit area and anchor stay exactly as they were — only the
// GPU copy (and its memory: a quarter at 0.5) is smaller. Canvas-2D code that cuts frames out of a source picture
// (ground decals, road paint, x-ray masks, chat portraits) goes through the drawImage wrapper below, which maps the
// cut to the smaller canvas. Kept at full size: the HUD / title / emote pictures (text-like, read up close), the ground,
// roads and water (patterns and data textures), and anything under 512² (small: little to gain).
const KEEP = /^(ui|title|ttl_|emote|font|water|ground|road|sidewalk|fv_|__|beach_sand|sand|portrait|icon|logo|fx_|chief_fx)/i;
const MIN_PX = 512 * 512;

/** should picture `src` of texture `key` be uploaded smaller? */
export function scaleFor(key, src) {
  const s = Perf.p.texScale;
  if (!(s > 0 && s < 1) || !src || typeof key !== 'string' || KEEP.test(key)) return 1;
  const isImg = (typeof HTMLImageElement !== 'undefined' && src instanceof HTMLImageElement) || (typeof ImageBitmap !== 'undefined' && src instanceof ImageBitmap);
  if (!isImg || src.__fvDs) return 1;
  const w = src.naturalWidth || src.width || 0, h = src.naturalHeight || src.height || 0;
  if (w * h < MIN_PX || w < 64 || h < 64) return 1;
  return s;
}

/** the picture drawn into a canvas `s` times its size (smoothing high); the canvas remembers the full size */
function shrink(src, s) {
  const w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
  const cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h * s));
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  let ctx = null;
  try { ctx = c.getContext('2d', { willReadFrequently: true }); } catch (e) { ctx = null; }
  if (!ctx) ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  try { ctx.imageSmoothingQuality = 'high'; } catch (e) { /* */ }
  DRAW.call(ctx, src, 0, 0, w, h, 0, 0, cw, ch);
  c.__fvDs = cw / w; c.__fvDsY = ch / h; c.__fvW = w; c.__fvH = h;
  return c;
}

let DRAW = null;
let installed = false;
export const TexScale = { made: 0, savedBytes: 0, keys: [] };

function installTexScale() {
  if (installed || typeof Phaser === 'undefined' || typeof CanvasRenderingContext2D === 'undefined') return;
  installed = true;
  const CP = CanvasRenderingContext2D.prototype;
  DRAW = CP.drawImage;
  // a frame cut out of a shrunken page: the cut rectangle in the smaller canvas, the destination as asked
  CP.drawImage = function (img) {
    const sx = img && img.__fvDs;
    if (!sx) return DRAW.apply(this, arguments);
    const a = arguments, n = a.length, sy = img.__fvDsY || sx;
    if (n === 3) return DRAW.call(this, img, 0, 0, img.width, img.height, a[1], a[2], img.__fvW, img.__fvH);
    if (n === 5) return DRAW.call(this, img, 0, 0, img.width, img.height, a[1], a[2], a[3], a[4]);
    return DRAW.call(this, img, a[1] * sx, a[2] * sy, a[3] * sx, a[4] * sy, a[5], a[6], a[7], a[8]);
  };
  // a pattern of a shrunken page tiles at the full size
  const PAT = CP.createPattern;
  CP.createPattern = function (img, rep) {
    const p = PAT.call(this, img, rep);
    if (p && img && img.__fvDs && typeof p.setTransform === 'function' && typeof DOMMatrix !== 'undefined') {
      try {
        // the pattern's own scale first, then whatever transform its caller sets (a translate to the world grid)
        const base = new DOMMatrix([1 / img.__fvDs, 0, 0, 1 / (img.__fvDsY || img.__fvDs), 0, 0]), st = p.setTransform.bind(p);
        p.setTransform = (m) => st(m ? new DOMMatrix(m).multiply(base) : base);
        st(base);
      } catch (e) { /* */ }
    }
    return p;
  };
  const TM = Phaser.Textures.TextureManager.prototype, create = TM.create;
  TM.create = function (key, source, width, height) {
    let s = 1;
    try { s = Array.isArray(source) ? 1 : scaleFor(key, source); } catch (e) { s = 1; }
    if (s >= 1) return create.call(this, key, source, width, height);
    const c = shrink(source, s);
    if (!c) return create.call(this, key, source, width, height);
    const tex = create.call(this, key, c, width, height);
    if (tex && tex.source && tex.source[0]) {
      const src = tex.source[0];
      // the full size: frames and UVs are in the picture's own pixels
      src.width = c.__fvW; src.height = c.__fvH;
      src.memScale = (c.width * c.height) / (c.__fvW * c.__fvH);
      TexScale.made++;
      TexScale.savedBytes += (c.__fvW * c.__fvH - c.width * c.height) * 4;
      if (TexScale.keys.length < 400) TexScale.keys.push(key);
    }
    return tex;
  };
}

// ---------------------------------------------------------------- (every preset) a still drawing drawn once
/**
 * Phaser's WebGL Graphics re-tessellates every path on every frame, however still it is (the meat rack's beam: 482
 * path commands a frame, ~3 ms of a 4x-throttled phone's frame). A drawing that never changes is drawn ONCE into a
 * small texture (`res` x its size, shared by `key`) and shown as an Image with the same position, angle, depth, alpha
 * and visibility; the Graphics goes. `box` = the drawing's local bounds { x, y, w, h }. Without WebGL (or on any
 * error) the Graphics is returned untouched.
 */
export function bakeGraphics(g, key, box, res = 3) {
  try {
    const sc = g && g.scene, R = sc && sc.sys && sc.sys.renderer;
    if (!R || !R.gl || !sc.textures || typeof sc.textures.addDynamicTexture !== 'function') return g;
    const k = '__fvg_' + key;
    if (!sc.textures.exists(k)) {
      const dt = sc.textures.addDynamicTexture(k, Math.ceil(box.w * res), Math.ceil(box.h * res));
      if (!dt) return g;
      const x = g.x, y = g.y, a = g.angle, sx = g.scaleX, sy = g.scaleY, v = g.visible, al = g.alpha;
      g.setPosition(0, 0).setAngle(0).setScale(res).setVisible(true).setAlpha(1);
      dt.draw(g, -box.x * res, -box.y * res);
      g.setPosition(x, y).setAngle(a).setScale(sx, sy).setVisible(v).setAlpha(al);
    }
    const img = sc.add.image(g.x, g.y, k).setOrigin(-box.x / box.w, -box.y / box.h)
      .setScale(g.scaleX / res, g.scaleY / res).setAngle(g.angle).setDepth(g.depth).setAlpha(g.alpha).setVisible(g.visible);
    g.destroy();
    BAKED.n++;
    return img;
  } catch (e) { return g; }
}
export const BAKED = { n: 0 };
