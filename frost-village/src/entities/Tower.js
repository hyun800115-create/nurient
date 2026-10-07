// Watchtower (v3, 망루): built on the border; when it is finished its beacon is lit (anims.work +
// fx_fire_big + sfx_tower_fire) and a moment later the snow fog over the next region clears.

import { Assets } from '../core/Assets.js';
import { DEPTH } from '../systems/DepthSort.js';

export class Tower {
  constructor(gs, site, region) {
    this.gs = gs; this.site = site; this.region = region;
    this.x = site.x; this.y = site.y;
    this.enabled = true;
    this.lit = false;
    const r = Assets.sprite('watchtower');
    this.img = gs.add.sprite(this.x, this.y, r.tex, r.frame).setOrigin(r.anchor[0], r.anchor[1]).setDepth(this.y);
    gs.lazyImage(this.img, 'watchtower');
    gs.addOccluder(this.img);
    const d = Assets.def('watchtower');
    this.fx = d.fxPoints || { fire: [0, -248], smoke: [4, -335] };
    const fp = d.footprint || [181, 91];
    this.obstacle = gs.collision.add(this.x, this.y, fp[0] * 0.34, 'tower');
    this.fire = null;
    this.smokeT = 0;
  }

  /** light the beacon (instant = restoring a save); the fog clears a moment later */
  light(instant) {
    if (this.lit) return;
    this.lit = true;
    const gs = this.gs;
    const anim = Assets.spriteAnim('watchtower', 'work');
    if (anim) this.img.play(anim);
    this.fire = gs.effects.loop('fx_fire_big', this.x + this.fx.fire[0], this.y + this.fx.fire[1] + 8, 92, this.y + 1);
    if (this.fire) this.fire.setVisible(this.enabled);
    if (instant) return;
    gs.focusCamera(this.x, this.y - 160, 2200);
    gs.sfxAt(Assets.audioDef('sfx_tower_fire') ? 'sfx_tower_fire' : 'sfx_unlock', this.x, this.y, { volume: 1 }, true);
    gs.effects.burst('flame', this.x + this.fx.fire[0], this.y + this.fx.fire[1], 10);
    gs.effects.burst('spark', this.x + this.fx.fire[0], this.y + this.fx.fire[1], 16);
    gs.effects.burst('glow', this.x + this.fx.fire[0], this.y + this.fx.fire[1], 1);
    if (this.fire) { this.fire.setScale(0.01); gs.tweens.add({ targets: this.fire, scale: 92 / 128, duration: 500, ease: 'Back.easeOut' }); }
    gs.time.delayedCall(1500, () => gs.territory.reveal(this.region, false));
  }

  /** the asset arrived after the title / the beacon should burn */
  refreshFire() {
    if (!this.lit || this.fire) return;
    this.fire = this.gs.effects.loop('fx_fire_big', this.x + this.fx.fire[0], this.y + this.fx.fire[1] + 8, 92, this.y + 1);
    const anim = Assets.spriteAnim('watchtower', 'work');
    if (anim && !this.img.anims.isPlaying) this.img.play(anim);
  }

  update(dt) {
    if (!this.lit || !this.enabled) return;
    if (!this.fire) { this.fireT = (this.fireT || 0) - dt; if (this.fireT <= 0) { this.fireT = 1; this.refreshFire(); } }
    this.smokeT -= dt;
    if (this.smokeT <= 0) {
      this.smokeT = 0.7 + Math.random() * 0.5;
      if (this.gs.isOnScreen(this.x, this.y - 300, 200)) this.gs.effects.sheet('fx_smoke_puff', this.x + this.fx.smoke[0], this.y + this.fx.smoke[1], { size: 110, depth: DEPTH.FX - 20 });
    }
  }

  setEnabled(v) { this.enabled = v; this.img.setVisible(v); this.obstacle.active = v; if (this.fire) this.fire.setVisible(v); }
  revealObjects() { return [this.img]; }
}
