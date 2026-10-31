// Audio: music / sfx / ambience with persisted mute toggles. Every call is a safe no-op
// when the audio file is missing, failed to decode or the context is still locked.
//
// (v4.2.0.1) Silent while the game is not on screen. Every reason to be silent is a "hold": the page is hidden
// (visibilitychange; Android's WebView sends only this, never a window blur), pagehide, a frozen page, a window blur
// (browsers, the claude.ai frame: Phaser's own pause-on-blur) and the Android app (tools/apk MainActivity: in the
// background, under its exit dialog, on the lock screen, audio focus lost: window.__fvApp.pause / resume). While any
// hold is on, the one AudioContext every game sound plays through (music, ambience loops, sfx, the 눈꽃말 voices) is
// suspended and nothing resumes it: not Phaser's per-frame resume, not a tap (Audio.resume), not Phaser's unlock. When
// the last hold goes it resumes exactly where it stopped (a music or sound switched off in the settings stays off).
// (v4.2.0.1) Where the context may run without a tap (the Android app: WebView's autoplay setting) the sound is on from
// boot, so the title's intro plays its music and sounds untouched; a browser that wants a tap keeps the tap-to-start.

import { Assets } from './Assets.js';
import { Settings } from './Save.js';

export const Audio = {
  game: null,
  started: false,         // set after the first user tap (v4.2.0.1: or at boot where no tap is needed, autoStart)
  musicKey: null,
  music: null,
  amb: {},                // key -> sound
  ambTarget: {},          // key -> target volume (0..1)
  lastPlay: new Map(),    // key -> time (throttle)
  lastVariant: {},
  ambSeek: {},            // (v4-C2) key -> fn() seconds: where a loop starts (amb_sea_waves: in step with the water's crests)
  onImportant: null,      // (v4-C2) fn(): a milestone sound plays (the village voices duck under it)
  holds: new Set(),       // (v4.2.0.1) reasons to be silent now ('hidden', 'blur', 'app:android', ...)
  htmlHeld: false,        // (v4.2.0.1) HTML5-audio fallback: the playing sounds were paused for the holds

  init(game) { this.game = game; this.autoStart(false); this.installHolds(); },

  exists(key) {
    const g = this.game;
    return !!(g && g.cache && g.cache.audio && g.cache.audio.exists(key));
  },

  get sm() { return this.game && this.game.sound; },

  /** called from the title tap (a user gesture) */
  start() {
    this.started = true;
    this.resume();
  },

  /** resume a suspended / interrupted context (iOS after a call or app switch); call from any user tap */
  resume() {
    if (this.holds.size) return;    // (v4.2.0.1) not while the game is held silent (a tap under the exit dialog, a late chat close)
    try { const c = this.sm && this.sm.context; if (c && c.state !== 'running' && c.state !== 'closed') quiet(c.resume()); } catch (e) { /* ignore */ }
  },

  /** false while WebAudio is suspended (window blurred, iOS interruption) or held silent: sounds started then would pile up */
  get live() {
    const sm = this.sm;
    if (!sm || this.holds.size) return false;
    const c = sm.context;
    if (c && c.state !== 'running') return false;
    return !sm.locked;
  },

  baseVolume(key) { const d = Assets.audioDef(key); return d && d.volume !== undefined ? d.volume : 0.7; },

  /** play a one-shot sfx (or a random variant of an audioGroup) */
  play(key, opts) {
    if (!this.started || !Settings.data.sound || !this.live) return;
    if (opts && opts.volume !== undefined && opts.volume <= 0.001) return;
    let k = key;
    const grp = Assets.audioGroup(key);
    if (grp && grp.length) {
      let i = Math.floor(Math.random() * grp.length);
      if (grp.length > 1 && i === this.lastVariant[key]) i = (i + 1) % grp.length;
      this.lastVariant[key] = i;
      k = grp[i];
    }
    if (!this.exists(k)) return;
    const now = this.game.loop.time;
    const throttle = (opts && opts.throttle) || 35;
    const last = this.lastPlay.get(k) || -1e9;
    if (now - last < throttle) return;
    this.lastPlay.set(k, now);
    try {
      const vol = this.baseVolume(k) * ((opts && opts.volume) !== undefined ? opts.volume : 1);
      const cfg = { volume: vol };
      if (opts && opts.rate) cfg.rate = opts.rate;
      if (opts && opts.detune) cfg.detune = opts.detune;
      this.sm.play(k, cfg);
      // (v4-C2, voice.md §7.6) the village voices duck under milestone sounds only (not under every sale)
      if (this.onImportant && /^sfx_(levelup|complete|unlock|build_done|hire|mission_done|fame_up)$/.test(k)) this.onImportant();
    } catch (e) { /* ignore */ }
  },

  playMusic(key) {
    if (this.musicKey === key && this.music) { this.applyMusic(); return; }
    this.stopMusic(900);
    this.musicKey = key;
    this.applyMusic();
  },

  applyMusic() {
    if (!this.started) return;
    const on = Settings.data.music;
    const key = this.musicKey;
    if (!key) return;
    if (!on) { if (this.music) { try { this.music.pause(); } catch (e) { /* */ } } return; }
    if (!this.exists(key)) return;
    if (this.htmlHeld) return;      // (v4.2.0.1) HTML5 audio plays even while held: it starts when the holds go
    try {
      if (!this.music) {
        this.music = this.sm.add(key, { loop: true, volume: 0 });
        this.music.play();
        this.fade(this.music, this.baseVolume(key), 1200);
      } else if (this.music.isPaused) this.music.resume();
      else if (!this.music.isPlaying) this.music.play();
    } catch (e) { /* ignore */ }
  },

  stopMusic(fadeMs = 0) {
    const m = this.music;
    this.music = null; this.musicKey = null;
    if (!m) return;
    if (fadeMs > 0) {
      try {
        const scene = this.game.scene.getScenes(true)[0];
        if (scene && scene.tweens) { scene.tweens.add({ targets: m, volume: 0, duration: fadeMs, onComplete: () => { try { m.stop(); m.destroy(); } catch (e) { /* */ } } }); return; }
      } catch (e) { /* fall through */ }
    }
    try { m.stop(); m.destroy(); } catch (e) { /* */ }
  },

  fade(snd, to, ms) {
    try {
      const scene = this.game.scene.getScenes(true)[0];
      if (scene && scene.tweens) scene.tweens.add({ targets: snd, volume: to, duration: ms });
      else snd.setVolume(to);
    } catch (e) { /* */ }
  },

  /** ambience loops; volume 0..1 relative to manifest volume. Follows the sound toggle. */
  setAmbience(key, vol) { this.ambTarget[key] = vol; },

  updateAmbience(dt) {
    if (!this.started) return;
    const on = Settings.data.sound;
    for (const key in this.ambTarget) {
      let s = this.amb[key];
      const target = on ? this.ambTarget[key] * this.baseVolume(key) : 0;
      if (!s) {
        if (target <= 0.001 || !this.exists(key) || !this.live) continue;
        try {
          s = this.sm.add(key, { loop: true, volume: 0 });
          let seek = 0;
          try { seek = this.ambSeek[key] ? Math.max(0, Number(this.ambSeek[key]()) || 0) : 0; } catch (e) { seek = 0; }
          if (seek > 0) s.play({ seek }); else s.play();
          this.amb[key] = s;
        } catch (e) { continue; }
      }
      const v = s.volume + (target - s.volume) * Math.min(1, dt * 2.5);
      try { s.setVolume(v); } catch (e) { /* */ }
    }
  },

  setSoundEnabled(on) {
    Settings.data.sound = !!on; Settings.save();
    // silence the ambience loops right away (their fade only runs while the village is not paused)
    if (!on) for (const k in this.amb) { try { this.amb[k].setVolume(0); } catch (e) { /* */ } }
  },
  setMusicEnabled(on) {
    Settings.data.music = !!on; Settings.save();
    this.applyMusic();
    this.tellApp();
  },

  /** (v4.2.0.1) the Android app holds audio focus only while the game's music is on (else the player's own music plays on) */
  tellApp() {
    try { const b = typeof window !== 'undefined' && window.SnowbloomAndroid; if (b && typeof b.gameMusic === 'function') b.gameMusic(!!Settings.data.music); } catch (e) { /* */ }
  },

  /**
   * Seamless loops: decoders that ignore the mp3 gapless header (some Safari versions) return the
   * encoder delay as silence at the start, which clicks at every loop. Cut decoded loops that are
   * longer than the manifest duration back to exactly [mp3StartPad, + duration).
   */
  trimLoops() {
    const g = this.game;
    try {
      const ctx = g && g.sound && g.sound.context;
      if (!ctx || !ctx.createBuffer) return;
      for (const key in Assets.m.audio) {
        const a = Assets.m.audio[key];
        if (!a || !a.loop || !a.duration || !g.cache.audio.exists(key)) continue;
        const buf = g.cache.audio.get(key);
        if (!buf || !buf.getChannelData || buf.__fvChecked) continue;
        const rate = buf.sampleRate, want = Math.round(a.duration * rate);
        if (buf.length > want + rate * 0.01) {
          const off = Math.min(buf.length - want, Math.round(((a.mp3StartPad || 0) * rate) / 44100));
          const out = ctx.createBuffer(buf.numberOfChannels, want, rate);
          for (let c = 0; c < buf.numberOfChannels; c++) out.getChannelData(c).set(buf.getChannelData(c).subarray(off, off + want));
          out.__fvChecked = true;
          g.cache.audio.add(key, out);
        } else buf.__fvChecked = true;
      }
    } catch (e) { /* keep the untrimmed buffers */ }
  },

  vibrate(ms) {
    try { if (Settings.data.sound && navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* */ }
  },

  /**
   * (v4.2.0.1) Sound from boot where the context may run without a tap (the Android app's WebView lets it): Phaser made
   * it running (not locked), or (late) it began to run with no tap ever made on the page (a context that starts running
   * a moment after it is made; a hold released). Otherwise the first tap starts the sound (Title, audioUnlock).
   */
  autoStart(late) {
    const sm = this.sm, c = sm && sm.context;
    if (this.started || !c || c.state !== 'running') return;
    if (late || sm.locked) {
      const ua = typeof navigator !== 'undefined' && navigator.userActivation;
      if (!ua || ua.hasBeenActive) return;                 // a tap did it: that tap's own code starts the sound
      if (sm.locked) sm.unlocked = true;                    // Phaser's next update(): locked = false + 'unlocked'
    }
    this.started = true;
    this.applyMusic();
  },

  // ------------------------------------------------------------------ (v4.2.0.1) silent while not on screen
  /** true while any hold keeps the game silent */
  get held() { return this.holds.size > 0; },

  /** one reason to be silent on / off (idempotent; any number of reasons may be on at once) */
  hold(reason, on) {
    if (on) this.holds.add(reason); else this.holds.delete(reason);
    this.applyHolds();
  },

  /** held: the context suspended and Phaser's per-frame resume off; free: resumed where it stopped */
  applyHolds() {
    const sm = this.sm;
    if (!sm) return;
    const c = sm.context;
    try {
      if (this.holds.size) {
        sm.gameLostFocus = true;                           // Phaser's update() resumes a suspended context every frame unless this is set
        if (c) { if (c.state !== 'closed') quiet(c.suspend()); }   // (also over a resume still on its way)
        else if (!this.htmlHeld) { this.htmlHeld = true; sm.onBlur(); }    // HTML5 audio: pauses what plays
      } else {
        sm.gameLostFocus = false;
        if (c) { if (!sm.locked && c.state !== 'running' && c.state !== 'closed') quiet(c.resume()); }   // (still locked: the first tap unlocks it)
        else if (this.htmlHeld) { this.htmlHeld = false; sm.onFocus(); this.applyMusic(); }
      }
    } catch (e) { /* */ }
  },

  /** Boot: the holds replace Phaser's own pause-on-blur; the page lifecycle and the Android app drive them */
  installHolds() {
    const g = this.game, sm = this.sm;
    if (!g || !sm || this.holdsOn || typeof document === 'undefined') return;
    this.holdsOn = true;
    const ev = g.events, c = sm.context;
    // window blur / focus (Phaser.Core.Events.BLUR / FOCUS): what Phaser did with pauseOnBlur, as a hold
    ev.off('blur', sm.onGameBlur, sm); ev.off('focus', sm.onGameFocus, sm);
    ev.on('blur', () => { if (sm.pauseOnBlur) this.hold('blur', true); });
    ev.on('focus', () => this.hold('blur', false));
    // Phaser's iOS nudge 100 ms after the page shows again (VISIBLE: suspend + resume) would wake a held context: kept
    // only while nothing holds the sound, and not on Android (no such bug there; it was a small gap in the music on
    // every return to the app)
    if (c && sm.onGameVisible) {
      ev.off('visible', sm.onGameVisible, sm);
      ev.on('visible', () => {
        const os = g.device && g.device.os;
        if (os && os.android) return;
        setTimeout(() => { if (!this.holds.size && c.state !== 'closed') { quiet(c.suspend()); quiet(c.resume()); } }, 100);
      });
    }
    // anything else that resumes the context while held (Phaser's unlock on the first tap, a late resume)
    if (sm.on) sm.on('unlocked', () => this.applyHolds());
    if (c && c.addEventListener) c.addEventListener('statechange', () => { if (this.holds.size && c.state === 'running') this.applyHolds(); else this.autoStart(true); });
    // the page lifecycle
    const doc = document;
    const vis = () => {
      const hidden = doc.visibilityState === 'hidden';
      if (!hidden) this.holds.delete('pagehide');          // (a page that shows again was not left for good)
      this.hold('hidden', hidden);
    };
    doc.addEventListener('visibilitychange', vis);
    window.addEventListener('pagehide', () => this.hold('pagehide', true));
    window.addEventListener('pageshow', () => { this.holds.delete('pagehide'); vis(); });
    doc.addEventListener('freeze', () => this.hold('frozen', true));
    doc.addEventListener('resume', () => { this.holds.delete('frozen'); vis(); });
    // the Android app: window.__fvApp.pause('android') / resume('android') (MainActivity, evaluateJavascript), and its
    // state when this page starts (a reload, or a new renderer while the app is in the background)
    const app = (window.__fvApp = window.__fvApp || {});
    app.pause = (why) => this.hold('app:' + (why || 'app'), true);
    app.resume = (why) => this.hold('app:' + (why || 'app'), false);
    app.state = () => ({ holds: Array.from(this.holds), ctx: c ? c.state : null, live: this.live });   // (tests, chrome://inspect)
    try {
      const b = window.SnowbloomAndroid;
      if (b && typeof b.audioAllowed === 'function' && b.audioAllowed() === false) this.holds.add('app:android');
    } catch (e) { /* no bridge */ }
    this.tellApp();
    vis();                                                  // (also applies the app's hold)
  },
};

/** a promise from suspend() / resume() must never surface as an unhandled rejection */
function quiet(p) { if (p && p.catch) p.catch(() => {}); }
