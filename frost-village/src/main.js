// Frost Village (서리마을 개척기) — entry point.
import { Boot } from './scenes/Boot.js';
import { Preload } from './scenes/Preload.js';
import { Title } from './scenes/Title.js';
import { Game } from './scenes/Game.js';
import { UI } from './scenes/UI.js';

const W = 720;
const MIN_H = 1280, MAX_H = 1600;

// Logical width is always 720. The logical height follows the device's aspect ratio
// (1280 .. 1600) so tall phones are filled instead of letter-boxed; Scale.FIT then fits it.
function logicalHeight() {
  const iw = window.innerWidth || W, ih = window.innerHeight || MIN_H;
  const h = Math.round((W * ih) / Math.max(1, iw));
  return Math.max(MIN_H, Math.min(MAX_H, h));
}

const params = new URLSearchParams(window.location.search);
window.__FV_DEBUG = params.get('debug') === '1';

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: logicalHeight(),
  backgroundColor: '#dbe6f2',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, pixelArt: false, roundPixels: false, powerPreference: 'high-performance', maxLights: 0 },
  input: { activePointers: 3, keyboard: true, windowEvents: true },
  audio: { disableWebAudio: false },
  fps: { target: 60, smoothStep: true },
  disableContextMenu: true,
  banner: false,
  scene: [Boot, Preload, Title, Game, UI],
};

const game = new Phaser.Game(config);
window.__FV_BOOTED = true;

let resizeTimer = 0;
function onResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const h = logicalHeight();
    if (Math.abs(game.scale.gameSize.height - h) > 2) game.scale.setGameSize(W, h);
    game.scale.refresh();
  }, 120);
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);

// minimal test hooks until the Game scene installs the full set
window.__FV = window.__FV || { game };
window.__FV.game = game;
