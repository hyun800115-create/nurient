// Preload: manifests first, then every atlas / image / sheet / audio file they list.
import { Assets } from '../core/Assets.js';
import { FONT, t } from '../data/strings.js';
import { Audio } from '../core/Audio.js';
import { View } from '../core/View.js';
// ---- (v4-C2) the living title (docs/build_reports/title_code.md §2): its first frame is fetched with the boot files,
// and a tap on the loading screen already turns the sound on for the opening
import { TitleAssets } from '../title/TitleAssets.js';
import { armAudioUnlock } from '../title/audioUnlock.js';
import { TITLE_TEXT } from '../title/config.js';
import { getLang } from '../data/strings.js';
import { WATER_DATA } from '../core/Assets.js';

export class Preload extends Phaser.Scene {
  constructor() { super('Preload'); }

  preload() {
    this.load.on('loaderror', (f) => Assets.onLoadError(f, this.load));
    Assets.queueManifests(this.load);
    TitleAssets.queueManifests(this.load);       // title_bake.json + assets/title/manifest.json (~41 KB)
  }

  create() {
    armAudioUnlock();                            // any tap from here on turns the sound on for the opening
    const el = document.getElementById('fv-loading');
    if (el) { el.classList.add('hide'); setTimeout(() => el.remove(), 400); }
    View.applyUI(this.cameras.main);
    const W = View.W, H = View.H;
    this.cameras.main.setBackgroundColor('#dbe6f2');
    this.add.text(W / 2, H * 0.42, '❄', { resolution: 2, fontFamily: FONT, fontSize: '72px', color: '#3d8be0' }).setOrigin(0.5);
    this.add.text(W / 2, H * 0.5, t('title'), { resolution: 2, fontFamily: FONT, fontSize: '44px', fontStyle: '900', color: '#2b2f3a' }).setOrigin(0.5);
    const barW = 420;
    this.add.rectangle(W / 2, H * 0.58, barW + 8, 26, 0xffffff, 0.8).setStrokeStyle(3, 0x9fb3cc);
    const bar = this.add.rectangle(W / 2 - barW / 2, H * 0.58, 2, 18, 0x3d8be0).setOrigin(0, 0.5);
    const label = this.add.text(W / 2, H * 0.62, t('loading'), { resolution: 2, fontFamily: FONT, fontSize: '22px', fontStyle: '700', color: '#5d6b80' }).setOrigin(0.5, 0);
    const tx = TITLE_TEXT[getLang()] || TITLE_TEXT.ko;     // "탭하면 소리가 켜져요" under the bar
    const touch = !!(this.sys.game.device.input.touch);
    const hint = this.add.text(W / 2, H * 0.66, touch ? tx.sound : tx.soundClick, { resolution: 2, fontFamily: FONT, fontSize: '22px', fontStyle: '700', color: '#7d8aa0' }).setOrigin(0.5, 0);

    Assets.mergeManifests(this.cache.json);
    // in-game music / ambience and the villager atlases are loaded later by the Game scene (faster first screen)
    Assets.queueAssets(this.load, { musicFilter: (k) => !Assets.isDeferredAudio(k) && !Assets.isUnusedAudio(k) });
    TitleAssets.queueFirstPaint(this.load);      // only what this player's title shows first (title_code.md §2)
    this.load.on('progress', (p) => { bar.width = Math.max(2, barW * p); });
    this.load.once('complete', () => {
      Assets.finalize(this.game);
      Audio.trimLoops();
      label.setText(''); hint.setText('');
      // (v4-C2) the living water's data textures (0.6 MB) are not needed for the title's first paint: they come
      // while the title shows (after its island has a head start), so the village opens with the living sea
      const game = this.game;
      setTimeout(() => { try { Assets.prefetch(game, (k) => WATER_DATA.test(k)); } catch (e) { /* the Game fetches them */ } }, 1500);
      this.scene.start('Title');
    });
    this.load.start();
  }
}
