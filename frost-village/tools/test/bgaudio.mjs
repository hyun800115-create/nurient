// (v4.2.0.1) Silent while the game is not on screen — src/core/Audio.js holds (hidden page, pagehide, frozen page,
// window blur, the Android app's window.__fvApp.pause / resume).
//   node tools/test/bgaudio.mjs [--only webaudio,autoplay,html5] [--out <file.json>]
//
// The designer's phone: Home / another app / the back dialog left the music playing. Android's WebView hides the page
// (visibilitychange) but never blurs it, and Phaser only went quiet on blur. Here a page whose document.hidden is
// driven by the test (an init script) stands in for the WebView: hidden WITHOUT any blur. A zero-output AudioWorklet
// meter is tapped on Phaser's master volume node (every game sound goes through it: music, ambience, sfx, voices), so
// "is anything audible" is measured, not guessed. The game loop keeps running in headless Chromium while "hidden"
// (on a phone it stops), which is the hard case: Phaser's per-frame resume, taps and frames all try to wake the sound.
//
//   webaudio  boot with an Android bridge stand-in whose audioAllowed() is false (the app is in the background):
//     T  title: the first tap starts bgm_title but nothing is audible; the app allows -> audible; hidden -> silent;
//        visible -> audible
//     V  village (music + ambience loops): hidden -> suspended, 0 audible frames for 2 s, the audio clock stands still;
//        a window focus event, a tap on the village, the chat closing (ResidentChat.pauseGame), Audio.resume /
//        Audio.start, a stray context.resume() and running frames all leave it silent; visible -> the SAME music
//        object plays on (not restarted), audible again
//     V4 Phaser's iOS nudge after a return (VISIBLE: suspend + resume 100 ms later): kept on desktop / iOS (one suspend),
//        skipped on Android (game.device.os.android: no gap in the music on every return to the app)
//     A0 the app's JS_QUIET question (tools/apk MainActivity, asked before pauseTimers): false while the sound runs,
//        true once __fvApp.pause has stopped it
//     A  __fvApp.pause('android') with the page visible and the loop running (the exit dialog): silent, voices off,
//        Audio.play refused; idempotent (pause twice, resume once); hidden + visible while the app still holds (Home
//        under the dialog, back again: Phaser's 100 ms iOS nudge on VISIBLE must not wake it) -> still silent;
//        resume -> audible
//     P  pagehide -> silent (the app's 끝내기 fires it); pageshow -> audible; freeze -> silent; resume -> audible
//     B  the browser path: blur -> silent, focus -> audible; blur + hidden, then focus while still hidden -> silent;
//        visible -> audible
//     S  settings: music off -> hidden -> visible: the music stays paused (and the app's bridge hears gameMusic(false):
//        no audio focus then); sound off too -> after the return nothing is audible at all; both on again -> audible
//   autoplay  (the Android app: WebView's setMediaPlaybackRequiresUserGesture(false) lets a context run without a tap;
//        Chromium --autoplay-policy=no-user-gesture-required stands in) a first run with NO tap, key or test evaluate
//        before the title has been up 3 s (an evaluate counts as a user gesture; a page-side watcher reports instead):
//     AP1 the intro plays bgm_title from its first frame, audible, and its sound cues; AP2 hidden -> silent, visible ->
//        audible (the holds still win); AP3 booted while the app holds (in the background) -> silent, no tap needed when
//        the app allows; AP4 music switched off -> no bgm_title (the setting wins), the app told; AP5 a context that
//        starts 'suspended' and runs a moment later by itself (Phaser locks it) -> still sound from the start, unlocked
//     (the webaudio part runs Chromium's default policy, a tap first: T0c checks the tap-to-start is kept there)
//   html5  (Node, no browser) no Web Audio: Audio.js against a stand-in for Phaser 3.90's HTML5-audio manager (headless
//        Chromium never unlocks the real one): a hold before boot; hidden -> every playing sound paused (onBlur),
//        nothing new starts; visible while the app holds -> still paused; released -> the same music plays on; a music
//        switched off stays off
// Exit code 1 on any failure; JSON report to --out (default: no file).
import fs from 'node:fs';
import { start } from './serve.mjs';
import { launch, loadPlaywright, openPage, tapStart, sleep, waitFor } from './pw.mjs';

const argv = process.argv.slice(2);
const ONLY = argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',') : null;
const OUTF = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : null;
const run = (k) => !ONLY || ONLY.includes(k);
const fail = [];
const report = {};
const check = (name, ok, info = '') => {
  console.log((ok ? '  ok  ' : ' FAIL ') + name + (info !== '' && info != null ? '  — ' + (typeof info === 'string' ? info : JSON.stringify(info)).slice(0, 500) : ''));
  if (!ok) fail.push(name);
  (report.checks = report.checks || []).push({ name, ok: !!ok, info });
};

/** before the page's own scripts: a document.hidden the test drives, an Android bridge stand-in, no Web Audio */
function initScript(opts) {
  return `(() => {
    window.__vis = { hidden: false };
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__vis.hidden });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (window.__vis.hidden ? 'hidden' : 'visible') });
    window.__setHidden = (h) => { window.__vis.hidden = !!h; document.dispatchEvent(new Event('visibilitychange')); };
    ${opts.bridge ? `window.__appAllowed = ${opts.allowed ? 'true' : 'false'}; window.__music = []; window.SnowbloomAndroid = { audioAllowed: () => window.__appAllowed, gameMusic: (on) => window.__music.push(on) };` : ''}
    ${opts.noWebAudio ? `try { delete window.AudioContext; delete window.webkitAudioContext; } catch (e) {}` : ''}
    ${opts.countSuspend ? `window.__susp = []; { const P = window.AudioContext && window.AudioContext.prototype, s0 = P && P.suspend;
      if (s0) P.suspend = function () { window.__susp.push(performance.now()); return s0.apply(this, arguments); }; }` : ''}
    ${opts.musicOff ? `try { localStorage.setItem('frostVillage.settings.v1', JSON.stringify({ music: false })); } catch (e) {}` : ''}
    ${opts.late ? `{ const C = window.AudioContext;           // a context made 'suspended' that runs by itself 400 ms later (no gesture)
      window.AudioContext = class extends C { constructor(o) { super(o); if (window.__late) return; this.suspend();
        window.__late = { stateAtCreate: this.state };
        setTimeout(() => { window.__late.ua = navigator.userActivation.hasBeenActive; this.resume(); }, 400); } }; }` : ''}
    ${opts.watch ? `window.__ap = { keys: [] };                  // page-side: no test evaluate (a user gesture) before the report
      const iv = setInterval(() => {
        const g = window.__FV && window.__FV.game, sm = g && g.sound;
        if (!sm) return;
        if (!window.__ap.hooked) { window.__ap.hooked = true; const add = sm.add; sm.add = function (k, c) { window.__ap.keys.push(k); return add.call(this, k, c); }; }
        if (!window.__ap.titleAt) { if (g.scene.isActive('Title')) window.__ap.titleAt = performance.now(); return; }
        if (performance.now() - window.__ap.titleAt < 3000) return;
        clearInterval(iv);
        const T = window.__TITLE;
        console.log('__AP__' + JSON.stringify({ ua: navigator.userActivation ? navigator.userActivation.hasBeenActive : null, locked: sm.locked,
          ctx: sm.context ? sm.context.state : null, keys: window.__ap.keys.slice(), playing: sm.sounds.filter((x) => x.isPlaying).map((x) => x.key),
          mode: T ? T.mode : null, hint: T ? T.hintMode : null, late: window.__late || null, music: window.__music ? window.__music.slice() : null }));
      }, 50);` : ''}
  })();`;
}

/** the page-side watcher's report (console '__AP__{...}'), read from the console log: no evaluate */
async function waitMark(log, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const l = log.all.find((x) => x.includes('__AP__'));
    if (l) return JSON.parse(l.slice(l.indexOf('__AP__') + 6));
    await sleep(250);
  }
  return null;
}

/** in the page: the meter on Phaser's master bus + window.__snap() (no-op meter without Web Audio) */
async function installMeter(page) {
  await page.evaluate(async () => {
    const g = window.__FV.game, sm = g.sound, ctx = sm.context;
    const base = location.href.replace(/[^/]*([?#].*)?$/, '');
    window.__A = (await import(base + 'src/core/Audio.js')).Audio;      // the game's own module instance
    window.__m = { f: 0, loud: 0 };
    if (ctx) {
      const code = `class M extends AudioWorkletProcessor { constructor(){ super(); this.f=0; this.loud=0; this.n=0; }
        process(ins){ const ch = ins[0] && ins[0][0]; if (ch) { let p = 0; for (let i = 0; i < ch.length; i++) { const v = ch[i] < 0 ? -ch[i] : ch[i]; if (v > p) p = v; }
          this.f += ch.length; if (p > 1e-4) this.loud += ch.length; }
          if (++this.n % 4 === 0) this.port.postMessage({ f: this.f, loud: this.loud }); return true; } }
        registerProcessor('fv-meter', M);`;
      await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([code], { type: 'application/javascript' })));
      const node = new AudioWorkletNode(ctx, 'fv-meter', { numberOfInputs: 1, numberOfOutputs: 0 });
      node.port.onmessage = (e) => { window.__m.f = e.data.f; window.__m.loud = e.data.loud; };
      sm.masterVolumeNode.connect(node);
      window.__meterNode = node;
    }
    window.__snap = () => {
      const A = window.__A, gs = window.__FV.scene;
      return {
        ctx: ctx ? ctx.state : null, t: ctx ? ctx.currentTime : 0, rate: ctx ? ctx.sampleRate : 0, f: window.__m.f, loud: window.__m.loud,
        frame: g.loop.frame, holds: Array.from(A.holds), live: A.live, started: A.started,
        playing: sm.sounds.filter((s) => s.isPlaying).map((s) => s.key),
        paused: sm.sounds.filter((s) => s.isPaused).map((s) => s.key),
        voice: gs && gs.voice ? { enabled: gs.voice.enabled, active: gs.voice.activeCount } : null,
      };
    };
  });
}

const snap = (page) => page.evaluate(() => window.__snap());
/** run fn, then measure ms of wall time: audible / rendered ms (meter), audio-clock seconds, game frames */
async function measure(page, fn, ms) {
  if (fn) await fn();
  await sleep(120);                                          // (the context changes state asynchronously)
  const a = await snap(page);
  await sleep(ms);
  const b = await snap(page);
  const rate = b.rate || 48000;
  return { ctx: b.ctx, holds: b.holds, live: b.live, audibleMs: Math.round(((b.loud - a.loud) / rate) * 1000), renderedMs: Math.round(((b.f - a.f) / rate) * 1000),
    clockS: +(b.t - a.t).toFixed(3), frames: b.frame - a.frame, playing: b.playing, paused: b.paused, voice: b.voice };
}
/** MainActivity.JS_QUIET (tools/apk), word for word: the app pauses the page's timers only once this answers true */
const JS_QUIET = "(function(){try{var a=window.__fvApp;return !(a&&a.state&&a.state().ctx==='running')}catch(e){return true}})()";
const silent = (r) => r.ctx !== 'running' && r.audibleMs === 0 && r.clockS < 0.05;
const audible = (r, minMs = 150) => r.ctx === 'running' && r.audibleMs >= minMs;

async function tapCanvas(page, fy = 0.55) {
  const c = await page.$('canvas');
  const b = await c.boundingBox();
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height * fy);
}

// ================================================================ HTML5 audio (no Web Audio): Node, a stand-in manager
// (headless Chromium without Web Audio never unlocks Phaser's HTML5-audio manager, so nothing would play there at all;
// this drives Audio.js's holds against a manager with Phaser 3.90's HTML5AudioSoundManager onBlur / onFocus rules)
if (run('html5')) {
  const doc = new EventTarget(), win = new EventTarget();
  let hidden = false;
  Object.defineProperty(doc, 'visibilityState', { get: () => (hidden ? 'hidden' : 'visible') });
  globalThis.document = doc; globalThis.window = win;
  win.SnowbloomAndroid = { audioAllowed: () => true };
  const { Audio } = await import('../../src/core/Audio.js');
  const { Settings } = await import('../../src/core/Save.js');
  Settings.save = () => {};
  const mkSound = (key) => ({ key, isPlaying: false, isPaused: false, volume: 0, play() { this.isPlaying = true; this.isPaused = false; }, pause() { this.isPlaying = false; this.isPaused = true; },
    resume() { this.isPlaying = true; this.isPaused = false; }, setVolume(v) { this.volume = v; }, stop() { this.isPlaying = false; }, destroy() {}, onBlur() { this.isPlaying = false; this.isPaused = true; }, onFocus() { this.isPlaying = true; this.isPaused = false; } });
  const sm = { locked: false, gameLostFocus: false, pauseOnBlur: true, sounds: [], onBlurPausedSounds: [],
    add(key) { const x = mkSound(key); this.sounds.push(x); return x; }, play(key) { const x = this.add(key); x.play(); return x; },
    onBlur() { for (const x of this.sounds) if (x.isPlaying) { this.onBlurPausedSounds.push(x); x.onBlur(); } },        // (Phaser 3.90 HTML5AudioSoundManager)
    onFocus() { for (const x of this.onBlurPausedSounds) x.onFocus(); this.onBlurPausedSounds.length = 0; },
    onGameBlur() {}, onGameFocus() {}, on() {} };
  const handlers = {};
  const game = { sound: sm, cache: { audio: { exists: () => true } }, loop: { time: 0 }, scene: { getScenes: () => [] },
    events: { on(n, f) { (handlers[n] = handlers[n] || []).push(f); }, off() {} } };
  Audio.hold('app:android', true);                         // (a hold that arrives before the game booted is kept)
  Audio.init(game);
  Audio.started = true;
  Audio.musicKey = 'bgm_village';
  Audio.applyMusic();
  check('H0 a hold before boot is applied at boot (HTML5: the music is not started while held)', Audio.held && !Audio.live && !Audio.music, Array.from(Audio.holds));
  window.__fvApp.resume('android');
  const m = Audio.music;
  check('H1 released -> the music starts', !!m && m.isPlaying && Audio.live, { holds: Array.from(Audio.holds) });
  const amb = sm.add('amb_wind'); amb.play();
  hidden = true; doc.dispatchEvent(new Event('visibilitychange'));
  const n = sm.sounds.length;
  Audio.play('sfx_coin');
  Audio.applyMusic();
  check('H2 hidden -> every playing sound paused (onBlur), Audio.live false, no new sound starts', !m.isPlaying && m.isPaused && !amb.isPlaying && !Audio.live && sm.sounds.length === n && sm.gameLostFocus, { music: m.isPlaying, amb: amb.isPlaying, sounds: sm.sounds.length - n });
  (handlers.focus || []).forEach((f) => f());              // a window focus while hidden
  win.__fvApp.pause('android'); win.__fvApp.pause('android');
  hidden = false; doc.dispatchEvent(new Event('visibilitychange'));
  check('H3 visible but the app still holds -> still paused', !m.isPlaying && !amb.isPlaying && Audio.held, Array.from(Audio.holds));
  win.__fvApp.resume('android');
  check('H4 the app releases -> the music and the loop play on (the same objects), live again', m.isPlaying && amb.isPlaying && Audio.music === m && Audio.live && !sm.gameLostFocus, Array.from(Audio.holds));
  Audio.setMusicEnabled(false);
  hidden = true; doc.dispatchEvent(new Event('visibilitychange'));
  hidden = false; doc.dispatchEvent(new Event('visibilitychange'));
  check('H5 music off, hidden, visible -> the music stays paused', !m.isPlaying && m.isPaused && amb.isPlaying, { m: m.isPlaying });
  delete globalThis.document; delete globalThis.window;
}

const srv = run('webaudio') ? await start(0, { prefix: '/fv/' }) : null;
const browser = run('webaudio') ? await launch() : null;
try {
  // ================================================================ Web Audio (what the Android WebView runs)
  if (run('webaudio')) {
    const { page, ctx: bctx, log } = await openPage(browser, srv.url + 'index.html', { dpr: 1, init: initScript({ bridge: true, countSuspend: true }) });
    try {
      await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* */ } });
      await page.reload({ waitUntil: 'load' });
      await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 180000);
      await sleep(600);
      await installMeter(page);

      // ---- T: title, booted while the app says "no sound" (the app was in the background)
      const r = {};
      r.boot = await snap(page);
      check('T0 boot: the app bridge said no sound -> held from the start', r.boot.holds.includes('app:android') && !r.boot.live, r.boot);
      r.musicBoot = await page.evaluate(() => window.__music.slice());
      check('T0b boot: the game tells the app its music setting (on: the app takes audio focus)', r.musicBoot.length === 1 && r.musicBoot[0] === true, r.musicBoot);
      check('T0c a browser that wants a tap (Chromium\'s default policy): no sound started before the first tap', r.boot.started === false && r.boot.ctx === 'suspended', { started: r.boot.started, ctx: r.boot.ctx });
      await tapCanvas(page, 0.6);                             // first title tap = sound on (Audio.start + bgm_title)
      await waitFor(page, () => window.__FV.game.sound.sounds.some((s) => s.key === 'bgm_title'), 20000).catch(() => {});
      await tapCanvas(page, 0.2);                             // (more taps: Audio.resume / Phaser's unlock must not wake it)
      await page.evaluate(() => { window.__A.resume(); window.__A.start(); });
      r.titleHeld = await measure(page, null, 1500);
      check('T1 title: taps + Audio.resume/start while the app holds -> bgm_title exists but nothing is audible', silent(r.titleHeld) && r.titleHeld.playing.includes('bgm_title'), r.titleHeld);
      r.titleAllowed = await measure(page, () => page.evaluate(() => { window.__appAllowed = true; window.__fvApp.resume('android'); }), 1500);
      check('T2 the app allows (__fvApp.resume) -> bgm_title audible', audible(r.titleAllowed) && r.titleAllowed.playing.includes('bgm_title'), r.titleAllowed);
      r.titleHidden = await measure(page, () => page.evaluate(() => window.__setHidden(true)), 1500);
      check('T3 title hidden (no blur) -> silent', silent(r.titleHidden), r.titleHidden);
      r.titleBack = await measure(page, () => page.evaluate(() => window.__setHidden(false)), 1500);
      check('T4 title visible -> audible again', audible(r.titleBack), r.titleBack);

      // ---- V: the village
      await tapStart(page);
      await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player, 180000);
      await waitFor(page, () => { const s = window.__FV.game.sound.sounds; return s.some((x) => x.key === 'bgm_village' && x.isPlaying) && s.some((x) => /^amb_/.test(x.key) && x.isPlaying); }, 60000).catch(() => {});
      await sleep(2500);
      r.v0 = await measure(page, null, 1500);
      check('V0 village: music + ambience audible', audible(r.v0, 600) && r.v0.playing.includes('bgm_village') && r.v0.playing.some((k) => /^amb_/.test(k)), r.v0);
      await page.evaluate(() => { const m = window.__FV.game.sound.sounds.find((s) => s.key === 'bgm_village' && s.isPlaying); window.__music0 = m; window.__seek0 = m.seek; });
      r.v1 = await measure(page, () => page.evaluate(() => window.__setHidden(true)), 2000);
      check('V1 hidden without blur (the WebView) -> suspended, 0 audible frames in 2 s, the audio clock stands still', silent(r.v1) && r.v1.holds.includes('hidden'), r.v1);
      check('V1b ... while the game loop still runs (Phaser\'s per-frame resume is off)', r.v1.frames > 0, r.v1.frames);
      r.v2 = await measure(page, async () => {
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        await tapCanvas(page, 0.5);
        await page.evaluate(() => {
          const rc = window.__FV.scene.residentChat;
          if (rc) { rc.pauseGame(true); rc.pauseGame(false); }   // the chat closing (Audio.resume inside)
          window.__A.resume(); window.__A.start(); window.__A.play('sfx_coin');
          window.__FV.game.sound.context.resume();               // a stray resume: put back by the statechange guard
        });
      }, 2000);
      check('V2 while hidden: window focus, a tap, the chat closing, Audio.resume/start/play, a stray context.resume() -> still silent', silent(r.v2), r.v2);
      r.v3 = await measure(page, () => page.evaluate(() => window.__setHidden(false)), 1500);
      const same = await page.evaluate(() => {
        const m = window.__FV.game.sound.sounds.filter((s) => s.key === 'bgm_village');
        return { count: m.length, same: m.length === 1 && m[0] === window.__music0, playing: !!(window.__music0 && window.__music0.isPlaying), seek0: +window.__seek0.toFixed(2), seek1: +window.__music0.seek.toFixed(2), dur: +window.__music0.duration.toFixed(1) };
      });
      check('V3 visible again -> audible', audible(r.v3, 600), r.v3);
      check('V3b the same bgm_village plays on from where it stopped (not restarted)', same.same && same.playing && (same.seek1 > same.seek0 ? same.seek1 - same.seek0 < 3.2 : same.seek1 + same.dur - same.seek0 < 3.2), same);
      // V4: Phaser's iOS nudge on VISIBLE (suspend + resume 100 ms later), counted from the moment the page shows again
      r.nudge = await page.evaluate(async () => {
        const wait = (ms) => new Promise((res) => setTimeout(res, ms));
        const os = window.__FV.game.device.os, was = os.android;
        const back = async (android) => {
          os.android = android;
          window.__setHidden(true);
          await wait(300);
          const n0 = window.__susp.length;
          window.__setHidden(false);
          await wait(450);
          return window.__susp.length - n0;
        };
        const desktop = await back(false), android = await back(true);
        os.android = was;
        return { desktop, android, ctx: window.__FV.game.sound.context.state, holds: Array.from(window.__A.holds) };
      });
      check('V4 Phaser\'s iOS nudge after a return: kept on desktop / iOS (one suspend + resume), skipped on Android (no gap)', r.nudge.desktop === 1 && r.nudge.android === 0 && r.nudge.ctx === 'running' && r.nudge.holds.length === 0, r.nudge);

      // ---- A: the Android app's hold with the page visible and the loop running (the exit dialog)
      r.quietRunning = await page.evaluate(JS_QUIET);
      r.a1 = await measure(page, () => page.evaluate(() => { window.__fvApp.pause('android'); window.__fvApp.pause('android'); }), 1500);
      r.quietHeld = await page.evaluate(JS_QUIET);
      check('A0 the app\'s question before pauseTimers (MainActivity.JS_QUIET): false while the sound runs, true once it has stopped', r.quietRunning === false && r.quietHeld === true, { running: r.quietRunning, held: r.quietHeld });
      const playRefused = await page.evaluate(() => { const n = window.__FV.game.sound.sounds.length; window.__A.play('sfx_coin', { throttle: 0 }); return window.__FV.game.sound.sounds.length === n; });
      check('A1 __fvApp.pause (twice) with the page visible -> silent, voices off, Audio.play refused', silent(r.a1) && r.a1.frames > 0 && (!r.a1.voice || r.a1.voice.enabled === false) && playRefused, { r: r.a1, playRefused });
      await page.evaluate(() => window.__setHidden(true));
      await sleep(400);
      r.a2 = await measure(page, () => page.evaluate(() => window.__setHidden(false)), 1200);
      check('A2 Home under the dialog, then back while it is still up -> silent (no 100 ms VISIBLE nudge)', silent(r.a2) && r.a2.holds.join() === 'app:android', r.a2);
      r.a3 = await measure(page, () => page.evaluate(() => window.__fvApp.resume('android')), 1500);
      check('A3 __fvApp.resume once (계속하기) -> audible, voices back on', audible(r.a3, 600) && r.a3.holds.length === 0 && (!r.a3.voice || r.a3.voice.enabled === true), r.a3);

      // ---- P: pagehide / pageshow, freeze / resume
      r.p1 = await measure(page, () => page.evaluate(() => window.dispatchEvent(new Event('pagehide'))), 1200);
      check('P1 pagehide (the app\'s 끝내기 fires it) -> silent', silent(r.p1), r.p1);
      r.p2 = await measure(page, () => page.evaluate(() => window.dispatchEvent(new Event('pageshow'))), 1200);
      check('P2 pageshow -> audible', audible(r.p2), r.p2);
      r.p3 = await measure(page, () => page.evaluate(() => { window.__vis.hidden = true; document.dispatchEvent(new Event('visibilitychange')); document.dispatchEvent(new Event('freeze')); }), 1200);
      r.p4 = await measure(page, () => page.evaluate(() => { window.__vis.hidden = false; document.dispatchEvent(new Event('resume')); document.dispatchEvent(new Event('visibilitychange')); }), 1200);
      check('P3 freeze -> silent; resume + visible -> audible', silent(r.p3) && r.p3.holds.includes('frozen') && audible(r.p4) && r.p4.holds.length === 0, { p3: r.p3, p4: r.p4 });

      // ---- B: the browser path (window blur / focus), and focus alone while hidden
      r.b1 = await measure(page, () => page.evaluate(() => window.dispatchEvent(new Event('blur'))), 1200);
      r.b2 = await measure(page, () => page.evaluate(() => window.dispatchEvent(new Event('focus'))), 1200);
      check('B1 blur -> silent; focus -> audible (Phaser\'s pause-on-blur kept)', silent(r.b1) && audible(r.b2), { b1: r.b1, b2: r.b2 });
      r.b3 = await measure(page, () => page.evaluate(() => { window.dispatchEvent(new Event('blur')); window.__setHidden(true); window.dispatchEvent(new Event('focus')); }), 1200);
      r.b4 = await measure(page, () => page.evaluate(() => window.__setHidden(false)), 1200);
      check('B2 blur + hidden, then focus while still hidden -> silent; visible -> audible', silent(r.b3) && audible(r.b4), { b3: r.b3, b4: r.b4 });

      // ---- S: the in-game settings are kept across a hide / show
      await page.evaluate(() => window.__A.setMusicEnabled(false));
      await page.evaluate(() => window.__setHidden(true));
      await sleep(500);
      r.s1 = await measure(page, () => page.evaluate(() => window.__setHidden(false)), 1200);
      const mus = await page.evaluate(() => ({ paused: !!(window.__music0 && window.__music0.isPaused), playing: !!(window.__music0 && window.__music0.isPlaying) }));
      check('S1 music off, hidden, visible -> the music stays paused', mus.paused && !mus.playing && !r.s1.playing.includes('bgm_village'), { mus, s1: r.s1 });
      r.musicOff = await page.evaluate(() => window.__music.slice(-1)[0]);
      check('S1b music off -> the app is told (it gives the audio focus back to the player\'s own music)', r.musicOff === false, r.musicOff);
      await page.evaluate(() => window.__A.setSoundEnabled(false));
      await sleep(800);
      await page.evaluate(() => window.__setHidden(true));
      await sleep(500);
      await page.evaluate(() => window.__setHidden(false));
      await sleep(700);
      r.s2 = await measure(page, null, 1500);
      check('S2 sound off too, hidden, visible -> running but nothing audible', r.s2.ctx === 'running' && r.s2.audibleMs === 0 && r.s2.renderedMs > 0, r.s2);
      await page.evaluate(() => { window.__A.setSoundEnabled(true); window.__A.setMusicEnabled(true); });
      r.s3 = await measure(page, null, 1500);
      check('S3 both on again -> the music plays, audible', audible(r.s3, 600) && r.s3.playing.includes('bgm_village'), r.s3);

      r.errors = log.errors.slice(0, 8);
      check('webaudio: no page errors / console errors', log.errors.length === 0, log.errors.slice(0, 4));
      report.webaudio = r;
    } finally {
      await bctx.close();
    }
  }

} finally {
  if (browser) await browser.close();
}

// ================================================================ autoplay: the Android app (no tap needed)
const srv2 = run('autoplay') ? (srv || await start(0, { prefix: '/fv/' })) : null;
if (run('autoplay')) {
  const { chromium } = loadPlaywright();
  const apb = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const r = {};
  const CUES = ['sfx_build_done', 'sfx_build', 'sfx_unlock', 'sfx_click', 'sfx_levelup', 'sfx_steam_whistle', 'sfx_bus_horn', 'sfx_ship_horn_big', 'sfx_seagull_1', 'sfx_whoosh'];
  const errors = [];
  /** a fresh profile (first run: the intro), no input at all until the watcher has reported */
  const boot = async (o) => {
    const p = await openPage(apb, srv2.url + 'index.html', { dpr: 1, init: initScript(Object.assign({ bridge: true, watch: true }, o)) });
    p.mark = await waitMark(p.log, 180000);
    if (p.mark) await installMeter(p.page);
    return p;
  };
  const done = async (p) => { errors.push(...p.log.errors); await p.ctx.close(); };
  try {
    // AP1-2: the app in front (audioAllowed true)
    let p = await boot({ allowed: true });
    try {
      r.ap1mark = p.mark;
      r.ap1 = await measure(p.page, null, 1500);
      const st = await p.page.evaluate(() => ({ started: window.__A.started, holds: Array.from(window.__A.holds) }));
      const m = p.mark || {};
      check('AP1 autoplay allowed (the app), no tap: the intro plays bgm_title from the start, audible', m.ua === false && m.mode === 'intro' && m.hint === 'skip' && m.playing.includes('bgm_title') && st.started && audible(r.ap1, 600), { mark: m, r: r.ap1, st });
      r.ap2h = await measure(p.page, () => p.page.evaluate(() => window.__setHidden(true)), 1500);
      r.ap2v = await measure(p.page, () => p.page.evaluate(() => window.__setHidden(false)), 1500);
      check('AP2 ... hidden -> silent, visible -> audible (autoplay does not get past the holds)', silent(r.ap2h) && audible(r.ap2v), { h: r.ap2h, v: r.ap2v });
      // the intro's own cues (pops, whistle...) when its clock gets there; on a slow machine the director may hold the
      // script for late pictures, then one cue is asked for directly (the same TitleScreen.cue -> Audio.play path)
      let keys = [], how = 'intro';
      for (let i = 0; i < 24 && !keys.some((k) => CUES.includes(k)); i++) { await sleep(500); keys = await p.page.evaluate(() => window.__ap.keys.slice()); }
      if (!keys.some((k) => CUES.includes(k))) { how = 'cue()'; keys = await p.page.evaluate(() => { window.__TITLE.cue('pop', 0.5); return window.__ap.keys.slice(); }); }
      check('AP1b ... and the intro\'s sound cues play (no tap)', keys.some((k) => CUES.includes(k)), { how, keys });
    } finally { await done(p); }

    // AP3: booted while the app holds (it was sent to the background during loading)
    p = await boot({ allowed: false });
    try {
      const m = p.mark || {};
      r.ap3h = await measure(p.page, null, 1200);
      r.ap3a = await measure(p.page, () => p.page.evaluate(() => { window.__appAllowed = true; window.__fvApp.resume('android'); }), 1500);
      check('AP3 booted held by the app: bgm_title waits silent; the app allows -> audible without a tap', m.ua === false && m.playing.includes('bgm_title') && silent(r.ap3h) && r.ap3h.holds.includes('app:android') && audible(r.ap3a, 600) && r.ap3a.playing.includes('bgm_title'), { mark: m, h: r.ap3h, a: r.ap3a });
    } finally { await done(p); }

    // AP4: the music switched off in the settings
    p = await boot({ allowed: true, musicOff: true });
    try {
      const m = p.mark || {};
      const st = await p.page.evaluate(() => ({ started: window.__A.started, sounds: window.__FV.game.sound.sounds.map((x) => x.key) }));
      check('AP4 music off: sound on from the start but no bgm_title; the app hears gameMusic(false)', m.ua === false && st.started && !m.keys.includes('bgm_title') && !st.sounds.includes('bgm_title') && m.music && m.music[0] === false, { mark: m, st });
    } finally { await done(p); }

    // AP5: a context that starts 'suspended' and runs by itself a moment later (Phaser locks it)
    p = await boot({ allowed: true, late: true });
    try {
      const m = p.mark || {};
      r.ap5 = await measure(p.page, null, 1500);
      const st = await p.page.evaluate(() => ({ started: window.__A.started, locked: window.__FV.game.sound.locked }));
      check('AP5 a context that runs a moment after it was made (no gesture): sound from the start, Phaser unlocked', m.late && m.late.stateAtCreate === 'suspended' && m.late.ua === false && m.ua === false && st.started && !st.locked && m.playing.includes('bgm_title') && audible(r.ap5, 600), { mark: m, st, r: r.ap5 });
    } finally { await done(p); }

    check('autoplay: no page errors / console errors', errors.length === 0, errors.slice(0, 4));
    report.autoplay = r;
  } finally {
    await apb.close();
  }
}
if (srv2 && srv2 !== srv) await srv2.close();
if (srv) await srv.close();
if (OUTF) fs.writeFileSync(OUTF, JSON.stringify(report, null, 1));
console.log(fail.length ? `bgaudio: ${fail.length} FAILED: ${fail.join(' | ')}` : 'bgaudio: all ok');
process.exit(fail.length ? 1 : 0);
