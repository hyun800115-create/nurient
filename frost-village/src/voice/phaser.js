// 눈꽃말 voices — Phaser glue (not imported by the game yet; see docs/build_reports/voice.md §7).
//
//   import { attachVillageVoice } from '../voice/phaser.js';
//   gs.voice = attachVillageVoice(gs, { volume: Settings.data.voice ?? 1 });     // Game.create(), after the title
//   ... gs.voice.speakBubble(text, who, emote)   in Bubbles.chat()
//   ... gs.voice.update(dt)                      in Game.update()
//   ... if (!(gs.voice && gs.voice.ready(r))) <old sfx_chatter>     in VillageLife.chatter() (fallback gate)
// It fetches the voice fragment's manifest late (Assets.loadFragment, like audio3), builds a WebAudio backend
// on Phaser's sound manager (so the sound toggle / mute / master volume apply) and returns a VillageVoice.
// Sprites load lazily: a voice type's sprite (~0.3 MB file, ~2.2 MB decoded at half rate) is fetched the first time one of
// its residents speaks (that first line keeps the old chatter through ready()), or up front for opts.types.
// While the manifest is missing (not packaged, offline) ready() stays false and the game keeps its old
// chatter. HTML5-audio fallback (no Web Audio): returns null — keep the old sfx_chatter in that case.
// The Game scene's pause / resume events pause the voices (menus pause the scene; the audio clock runs on).

import { Assets } from '../core/Assets.js';
import { VillageVoice } from './VillageVoice.js';
import { WebAudioVoiceBackend } from './webaudio.js';

/** on-screen = 1, just outside = 0.5, far = 0 (same rule as Game.sfxAt) */
export function screenDistance(gs) {
  return (x, y) => (gs.isOnScreen(x, y, 0) ? 1 : gs.isOnScreen(x, y, 220) ? 0.5 : 0);
}

/**
 * opts: volume (0..1, Settings.data.voice), types (voice types to fetch right away, e.g. the residents
 * already living in the village; default none: each type loads on its first line)
 */
export function attachVillageVoice(gs, opts = {}) {
  const game = gs.game || gs.sys && gs.sys.game;
  const sm = game && game.sound;
  if (!sm || !sm.context || !sm.destination) return null;          // no Web Audio
  const vv = new VillageVoice({ maxVoices: 2, baseGain: 0.4, volume: opts.volume === undefined ? 1 : opts.volume, distance: screenDistance(gs) });
  const getBuffer = (key) => (game.cache.audio.exists(key) ? game.cache.audio.get(key) : null);
  vv.loader = (key) => {
    Assets.loadFragment(gs, 'voice', { audio: [key] });                // queues it on the Game's late loader
    if (gs.queueLateFiles) gs.queueLateFiles();
  };
  const ready = () => {
    const man = (Assets.lateManifest && Assets.lateManifest.voice) || null;
    if (!man) return;                                                   // not packaged: old chatter stays
    vv.setManifest(man);
    // sprites are kept at half rate by the backend; the full-rate decode Phaser cached is dropped
    vv.backend = new WebAudioVoiceBackend(sm.context, sm.destination, getBuffer, man,
      { release: (key) => { if (game.cache.audio.exists(key)) game.cache.audio.remove(key); } });
    vv._applyBus(vv.backend.now(), true);
    for (const t of opts.types || []) vv.need(t);
  };
  Assets.loadFragment(gs, 'voice', {}, ready);
  if (gs.events && gs.events.on) {
    gs.events.on('pause', () => vv.pause());
    gs.events.on('resume', () => vv.resume());
    gs.events.once && gs.events.once('shutdown', () => { vv.stopAll(); if (vv.backend && vv.backend.dispose) vv.backend.dispose(); });
  }
  return vv;
}
