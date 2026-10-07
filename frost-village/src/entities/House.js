// House (v3): a cosy cottage built on a plot. Each house lets more residents live in the village
// (balance.js buildings.<house>.people). Chimney smoke drifts from fxPoints.smoke.

import { Assets } from '../core/Assets.js';
import { BALANCE } from '../data/balance.js';

export class House {
  constructor(gs, key, site) {
    this.gs = gs; this.key = key; this.site = site;
    this.x = site.x; this.y = site.y;
    this.enabled = true;
    const r = Assets.sprite(key);
    this.img = gs.add.image(this.x, this.y, r.tex, r.frame).setOrigin(r.anchor[0], r.anchor[1]).setDepth(this.y);
    gs.addOccluder(this.img);
    const d = Assets.def(key);
    const fp = d.footprint || [190, 95];
    this.obstacle = gs.collision.add(this.x, this.y, fp[0] * 0.4, 'house');
    this.smoke = d.fxPoints && d.fxPoints.smoke;
    const dp = d.doorPoint || [-60, 30];
    this.door = { x: this.x + dp[0], y: this.y + dp[1] + 8 };
    this.people = Math.max(0, Math.floor(Number((BALANCE.buildings[key] || {}).people) || 0));
    this.smokeT = Math.random() * 2;
  }

  update(dt) {
    if (!this.enabled || !this.smoke) return;
    this.smokeT -= dt;
    if (this.smokeT > 0) return;
    this.smokeT = 1.1 + Math.random() * 0.8;
    if (this.gs.isOnScreen(this.x, this.y - 150, 150)) this.gs.effects.burst('smoke', this.x + this.smoke[0], this.y + this.smoke[1], 1);
  }

  setEnabled(v) { this.enabled = v; this.img.setVisible(v); this.obstacle.active = v; }
  revealObjects() { return [this.img]; }
}
