// Audio: music / sfx / ambience with persisted mute toggles. Every call is a safe no-op
// when the audio file is missing, failed to decode or the context is still locked.

import { Assets } from './Assets.js';
import { Settings } from './Save.js';

export const Audio = {
  game: null,
  started: false,         // set after the first user tap
  musicKey: null,
  music: null,
  amb: {},                // key -> sound
  ambTarget: {},          // key -> target volume (0..1)
  lastPlay: new Map(),    // key -> time (throttle)
  lastVariant: {},

  init(game) { this.game = game; },

  exists(key) {
    const g = this.game;
    return !!(g && g.cache && g.cache.audio && g.cache.audio.exists(key));
  },

  get sm() { return this.game && this.game.sound; },

  /** called from the title tap (a user gesture) */
  start() {
    this.started = true;
    try { const sm = this.sm; if (sm && sm.context && sm.context.state === 'suspended') sm.context.resume(); } catch (e) { /* ignore */ }
  },

  baseVolume(key) { const d = Assets.audioDef(key); return d && d.volume !== undefined ? d.volume : 0.7; },

  /** play a one-shot sfx (or a random variant of an audioGroup) */
  play(key, opts) {
    if (!this.started || !Settings.data.sound) return;
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
    } catch (e) { /* ignore */ }
  },

  playMusic(key) {
    if (this.musicKey === key && this.music) { this.applyMusic(); return; }
    this.stopMusic();
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
    try {
      if (!this.music) {
        this.music = this.sm.add(key, { loop: true, volume: 0 });
        this.music.play();
        this.fade(this.music, this.baseVolume(key), 1200);
      } else if (this.music.isPaused) this.music.resume();
      else if (!this.music.isPlaying) this.music.play();
    } catch (e) { /* ignore */ }
  },

  stopMusic() {
    if (this.music) { try { this.music.stop(); this.music.destroy(); } catch (e) { /* */ } }
    this.music = null; this.musicKey = null;
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
        if (target <= 0.001 || !this.exists(key)) continue;
        try { s = this.sm.add(key, { loop: true, volume: 0 }); s.play(); this.amb[key] = s; } catch (e) { continue; }
      }
      const v = s.volume + (target - s.volume) * Math.min(1, dt * 2.5);
      try { s.setVolume(v); } catch (e) { /* */ }
    }
  },

  setSoundEnabled(on) {
    Settings.data.sound = !!on; Settings.save();
  },
  setMusicEnabled(on) {
    Settings.data.music = !!on; Settings.save();
    this.applyMusic();
  },

  vibrate(ms) {
    try { if (Settings.data.sound && navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* */ }
  },
};
