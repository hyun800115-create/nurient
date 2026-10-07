// Title screen: key art, logo, "탭하여 시작". The first tap unlocks audio (CONTRACT §9).
import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { FONT, t } from '../data/strings.js';
import { DIR_BASE } from '../core/Iso.js';

export class Title extends Phaser.Scene {
  constructor() { super('Title'); }

  create() {
    const { width: W, height: H } = this.scale.gameSize;
    this.cameras.main.setBackgroundColor('#cfe0f1');
    // backdrop (cover)
    const bg = Assets.image(this, W / 2, H / 2, 'ui_title_bg').setOrigin(0.5, 0.5);
    const bf = bg.frame;
    bg.setScale(Math.max(W / bf.realWidth, H / bf.realHeight));

    // soft glow behind the chief
    const glow = this.add.graphics();
    glow.fillStyle(0xffffff, 0.35); glow.fillCircle(W / 2, H * 0.47, 250);
    glow.fillStyle(0xffffff, 0.25); glow.fillCircle(W / 2, H * 0.47, 300);

    // key art (with a soft shadow on the snow; the chief hops gently)
    const artY = H * 0.5;
    const shadow = this.add.image(W / 2 + 8, artY + 160, 'fv_shadow').setDisplaySize(230, 54).setAlpha(0.9);
    const art = Assets.image(this, W / 2, artY, 'portrait_player_512').setOrigin(0.5, 0.5);
    art.setScale(470 / Math.max(art.frame.realWidth, 1));
    this.tweens.add({ targets: art, y: artY - 14, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: shadow, scaleX: shadow.scaleX * 0.9, scaleY: shadow.scaleY * 0.9, alpha: 0.7, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // workers lined up at the bottom
    const crew = ['fisherman', 'lumberjack', 'farmer', 'miner', 'hunter'];
    const y = H * 0.83;
    crew.forEach((k, i) => {
      const x = W / 2 + (i - 2) * 112;
      const sh = this.add.image(x, y + 2, 'fv_shadow').setDisplaySize(70, 24);
      const s = this.add.sprite(x, y, '__WHITE');
      const def = Assets.charDef(k);
      s.setOrigin(def.anchor[0], def.anchor[1]).setScale(1.25);
      s.play({ key: Assets.charAnim(k, 'idle', DIR_BASE[2]), startFrame: i % 4 });
      void sh;
    });

    // logo
    const title = this.add.text(W / 2, H * 0.14, t('title'), {
      fontFamily: FONT, fontSize: '76px', fontStyle: '900', color: '#ffffff', stroke: '#2a64a8', strokeThickness: 14,
      shadow: { offsetX: 0, offsetY: 7, color: 'rgba(20,40,80,0.35)', blur: 6, fill: true, stroke: true }, resolution: 2,
    }).setOrigin(0.5);
    const sub = this.add.text(W / 2, H * 0.14 + 70, t('subtitle'), {
      fontFamily: FONT, fontSize: '30px', fontStyle: '800', color: '#2a64a8', stroke: '#ffffff', strokeThickness: 8, resolution: 2,
    }).setOrigin(0.5);
    title.setScale(0.6); sub.setAlpha(0);
    this.tweens.add({ targets: title, scale: 1, duration: 700, ease: 'Back.easeOut' });
    this.tweens.add({ targets: sub, alpha: 1, duration: 600, delay: 300 });

    // tap to start
    const tap = this.add.text(W / 2, H * 0.93, t('tapToStart'), {
      fontFamily: FONT, fontSize: '40px', fontStyle: '900', color: '#ffffff', stroke: '#2b2f3a', strokeThickness: 9, resolution: 2,
    }).setOrigin(0.5);
    this.tweens.add({ targets: tap, scale: 1.08, alpha: 0.75, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // snowfall
    const sf = Assets.sprite('fx_snowflake');
    const fr = this.textures.get(sf.tex).get(sf.frame);
    const base = 12 / Math.max(8, fr.width);
    const cfg = {
      x: { min: -20, max: W + 20 }, y: -20, lifespan: 9000, speedY: { min: 40, max: 110 }, speedX: { min: -25, max: 25 },
      scale: { min: base * 0.6, max: base * 1.4 }, alpha: { min: 0.6, max: 1 }, rotate: { min: 0, max: 360 }, frequency: 90, quantity: 1,
    };
    if (sf.frame !== undefined) cfg.frame = sf.frame;
    this.add.particles(0, 0, sf.tex, cfg);

    let started = false;
    this.input.once('pointerdown', () => {
      if (started) return;
      started = true;
      Audio.start();
      Audio.play('sfx_click');
      Audio.playMusic('bgm_title');
      this.tweens.add({ targets: tap, scale: 1.4, alpha: 0, duration: 250 });
      this.time.delayedCall(180, () => Audio.play('sfx_whoosh', { volume: 0.6 }));
      this.cameras.main.fadeOut(450, 230, 240, 250);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Game'));
    });
    if (window.__FV) window.__FV.title = this;
  }
}
