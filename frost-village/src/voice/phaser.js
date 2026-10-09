// 눈꽃말 voices — Phaser glue (not imported by the game yet; see docs/build_reports/voice.md §Integration).
//
//   import { attachVillageVoice } from '../voice/phaser.js';
//   gs.voice = attachVillageVoice(gs, { types: ['kid_boy', 'adult_f', ...] });   // Game.create(), after the title
//   ... gs.voice.speak(text, resident)  in Resident.say() / TownSim chatter
//   ... gs.voice.update(dt)            in Game.update()
// It fetches the voice fragment late (Assets.loadFragment, like audio3), builds a WebAudio backend on
// Phaser's sound manager (so the sound toggle / mute / master volume apply) and returns a VillageVoice
// that stays silent until the sprites are decoded. HTML5-audio fallback (no Web Audio): returns null —
// keep the old sfx_chatter in that case.

import { Assets } from '../core/Assets.js';
import { VillageVoice, VOICE_TYPES } from './VillageVoice.js';
import { WebAudioVoiceBackend } from './webaudio.js';

/** on-screen = 1, just outside = 0.5, far = 0 (same rule as Game.sfxAt) */
export function screenDistance(gs) {
  return (x, y) => (gs.isOnScreen(x, y, 0) ? 1 : gs.isOnScreen(x, y, 220) ? 0.5 : 0);
}

export function attachVillageVoice(gs, opts = {}) {
  const game = gs.game || gs.sys && gs.sys.game;
  const sm = game && game.sound;
  if (!sm || !sm.context || !sm.destination) return null;          // no Web Audio
  const types = opts.types || VOICE_TYPES;
  const vv = new VillageVoice({ maxVoices: 2, baseGain: 0.4, volume: opts.volume === undefined ? 1 : opts.volume, distance: screenDistance(gs) });
  const getBuffer = (key) => (game.cache.audio.exists(key) ? game.cache.audio.get(key) : null);
  const ready = () => {
    const man = (Assets.lateManifest && Assets.lateManifest.voice) || null;
    if (!man) return;
    vv.setManifest(man);
    vv.backend = new WebAudioVoiceBackend(sm.context, sm.destination, getBuffer, man);
    vv._applyBus(vv.backend.now(), true);
    const keys = vv.keysFor(types);
    // ask for the sprites (Assets queues them on the Game's late loader)
    Assets.loadFragment(gs, 'voice', { audio: keys });
    if (gs.queueLateFiles) gs.queueLateFiles();
  };
  Assets.loadFragment(gs, 'voice', {}, ready);
  return vv;
}
