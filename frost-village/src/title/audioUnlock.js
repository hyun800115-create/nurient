// Sound for the very first intro. Browsers keep audio locked until the player touches the page, and the
// old title used its own first tap for that, so a first-run opening could only ever be silent (a tap there
// also skipped it). This listens for ANY tap or key from the moment it is armed - on the loading screen
// (the game's Preload, see docs/build_reports/title_code.md §2) or while the title loads its first picture -
// and turns the game's sound on with it. Phaser's sound manager unlocks its context on the same gesture.
import { Audio } from '../core/Audio.js';

const EVENTS = ['pointerdown', 'touchend', 'mousedown', 'keydown'];
let armed = false;

function onGesture() {
  try { Audio.start(); } catch (e) { /* no audio: nothing to do */ }
  disarmAudioUnlock();
}

/** listen (once) for the first tap / key on the page and start the game's audio with it */
export function armAudioUnlock() {
  if (armed || Audio.started || typeof document === 'undefined') return;
  armed = true;
  for (const e of EVENTS) document.addEventListener(e, onGesture, { capture: true, passive: true });
}

export function disarmAudioUnlock() {
  if (!armed) return;
  armed = false;
  for (const e of EVENTS) document.removeEventListener(e, onGesture, { capture: true });
}
