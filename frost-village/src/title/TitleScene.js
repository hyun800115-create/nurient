// TitleScene — a drop-in replacement for src/scenes/Title.js (same key 'Title', same hand-over to 'Game').
// The lead wires it in main.js (see docs/build_reports/title_code.md §2); until then nothing imports it.
//
// Keeps every behaviour of the old title: the first tap is the audio-unlock gesture, sfx_click + bgm_title +
// sfx_whoosh, a soft fade, then scene.start('Game'); rotation / resize lays the title out again;
// window.__FV.title points at the scene. New: the living diorama, the first-run intro, the version label,
// the settings gear (hook), and every title texture is released when the game starts.
import { VERSION } from '../data/version.js';
import { TitleAssets } from './TitleAssets.js';
import { mountTitle } from './TitleScreen.js';

export class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }

  init(data) {
    this.fromResize = !!(data && data.fromResize);
    this.opts = (data && data.title) || {};
  }

  preload() {
    // tiny when Preload already queued these (TitleAssets.queueEarly / queueGroup(load, 1)); otherwise the
    // title waits for ~200 KB (manifest + ground + stage 1) and streams the rest while it plays
    TitleAssets.queueEarly(this.load);
    TitleAssets.queueGroup(this.load, 1);
  }

  create() {
    const hooks = Object.assign({
      version: VERSION,
      onStart: () => this.scene.start('Game'),
    }, this.opts);
    if (this.fromResize) hooks.intro = false;
    if (window.__FV_TITLE_HOOKS) Object.assign(hooks, window.__FV_TITLE_HOOKS);    // e.g. { onSettings }
    this.screen = mountTitle(this, hooks);

    const onResize = () => { if (!this.screen.started && this.sys.isActive()) this.scene.restart({ fromResize: true, title: this.opts }); };
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => {
      this.scale.off('resize', onResize);
      this.screen.destroy();
      // give the texture memory back to the game (a restart for a resize reloads from the browser cache)
      TitleAssets.release(this.sys.game);
    });
    if (window.__FV) window.__FV.title = this;
  }

  update(time, delta) {
    if (this.screen) this.screen.update(delta / 1000);
  }
}
