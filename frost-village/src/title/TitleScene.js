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
import { armAudioUnlock } from './audioUnlock.js';

export class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }

  init(data) {
    this.fromResize = !!(data && data.fromResize);
    this.opts = (data && data.title) || {};
  }

  hooks() {
    const hooks = Object.assign({
      version: VERSION,
      onStart: () => this.scene.start('Game'),
    }, this.opts);
    if (this.fromResize) hooks.intro = false;
    if (window.__FV_TITLE_HOOKS) Object.assign(hooks, window.__FV_TITLE_HOOKS);    // e.g. { onSettings }
    return hooks;
  }

  preload() {
    // what this player's first frame needs: the stage they see (or the camp, for the intro), the backdrop
    // and the logo. Nothing to wait for when the game's Preload already fetched it (integration doc §2);
    // the rest streams in while the title plays. A tap while this loads already turns the sound on.
    armAudioUnlock();
    TitleAssets.queueFirstPaint(this.load, this.hooks());
  }

  create() {
    this.screen = mountTitle(this, this.hooks());

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
