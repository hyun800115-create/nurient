// 서리역, our station (v4, docs/v4_plan.md §3.5): a snowed-in ruin on the XL plot r_station (the v3 Site
// handles the build menu, materials, porters and the scaffold), then — repaired — the station building with
// its platform: board / wait points for the train's passengers, collision on the building only (the
// platform stays walkable), the bell, the name sign.

import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { FONT, t } from '../data/strings.js';
import { DEPTH } from '../systems/DepthSort.js';
import { L4 } from '../data/world.js';

const RUIN_TINT = 0x9aa6b4;
const DRIFTS = [[1.2, 1.2, 'decal_snow_drift_a', 0.8], [2.9, 1.0, 'decal_snow_drift_b', 0.9], [4.2, 1.3, 'decal_snow_drift_a', 0.7]];

export class RailStation {
  constructor(gs, cfg, opts = {}) {
    this.gs = gs;
    this.cfg = cfg;
    this.x = cfg.x; this.y = cfg.y;
    this.key = cfg.key || 'train_station';
    this.open = !!opts.open;
    this.def = Assets.def(this.key);
    this.img = Assets.image(gs, this.x, this.y, this.key).setDepth(this.y);
    gs.lazyImage(this.img, this.key, () => { this.def = Assets.def(this.key); this.points(); this.applyLook(); });
    gs.addOccluder(this.img);
    this.obstacles = [];
    this.drifts = [];
    this.points();
    this.applyLook(true);
    this.addCollision();
    this.makeSign();
  }

  /** platform points (world px) */
  points() {
    const d = this.def;
    const P = (p) => ({ x: this.x + p[0], y: this.y + p[1] });
    this.board = (d.boardPoints || [[-184, -27], [-82, 23], [24, 77]]).map(P);
    this.wait = (d.waitPoints || [[-156, -30], [-68, 9], [-29, 33], [32, 59]]).map(P);
    this.staff = (d.staffPoints || [[-86, 12]]).map(P);
    this.door = d.doorPoint ? P(d.doorPoint) : P([-113, -20]);
    this.clock = P((d.fxPoints && d.fxPoints.clock) || [-71, -135]);
    this.bell = P((d.fxPoints && d.fxPoints.bell) || [-10, -74]);
    this.lift = d.platformLiftPx || 18;
    this.platform = (d.platformPoly || [[-262, -49], [63, 114], [131, 80], [-195, -83]]).map(P);
  }

  /** is (x, y) on the raised platform? (walkers there are drawn `lift` px higher) */
  onPlatform(x, y) {
    const p = this.platform;
    let inside = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      if ((p[i].y > y) !== (p[j].y > y) && x < ((p[j].x - p[i].x) * (y - p[i].y)) / (p[j].y - p[i].y) + p[i].x) inside = !inside;
    }
    return inside;
  }

  /** the ruin look (tinted, half-buried in drifts) or the open station */
  applyLook(first) {
    if (this.open) { this.img.clearTint(); this.img.setAlpha(1); for (const d of this.drifts) d.destroy(); this.drifts = []; return; }
    this.img.setTint(RUIN_TINT).setAlpha(0.85);
    if (first || !this.drifts.length) {
      for (const d of this.drifts) d.destroy();
      this.drifts = [];
      for (const [i, j, k, sc] of DRIFTS) {
        if (!Assets.has(k)) continue;
        const [x, y] = L4(this.cfg.i - 2.5 + i, j);
        this.drifts.push(Assets.image(this.gs, x, y - 6, k).setScale(sc).setDepth(this.y + 4).setAlpha(0.95));
      }
    }
  }

  /** collision circles on the building (the platform in front stays walkable) */
  addCollision() {
    const gs = this.gs;
    for (const [i, j, r] of [[0.4, 2.9, 62], [1.9, 2.9, 62], [3.4, 2.9, 62], [4.6, 2.7, 50]]) {
      const [x, y] = L4(this.cfg.i - 2.5 + i, j);
      this.obstacles.push(gs.collision.add(x, y, r, 'station'));
    }
    for (const o of this.obstacles) o.active = this.open;
  }

  makeSign() {
    this.sign = stationSign(this.gs, this.x, this.y, t(this.cfg.name || 'stn_ours'));
    this.sign.setAlpha(this.open ? 1 : 0.35);
    // the platform lamp lights up at night
    this.lamp = { x: this.x + 74, y: this.y - 46 };
  }

  /** repaired: the tint clears, the drifts pop, one strike of the bell, the sign lights */
  repair(instant) {
    const gs = this.gs;
    this.open = true;
    for (const o of this.obstacles) o.active = true;
    if (instant) { this.applyLook(); this.sign.setAlpha(1); return; }
    const k = { v: 0 };
    gs.tweens.add({
      targets: k, v: 1, duration: 600,
      onUpdate: () => {
        const c = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ValueToColor(RUIN_TINT), Phaser.Display.Color.ValueToColor(0xffffff), 100, k.v * 100);
        this.img.setTint(Phaser.Display.Color.GetColor(c.r, c.g, c.b));
        this.img.setAlpha(0.85 + 0.15 * k.v);
      },
      onComplete: () => this.applyLook(),
    });
    for (const d of this.drifts) {
      gs.tweens.add({ targets: d, scale: 0.01, alpha: 0, duration: 380, delay: 200 + Math.random() * 400, ease: 'Back.easeIn' });
      gs.time.delayedCall(450, () => gs.effects.sheet('fx_poof', d.x, d.y - 10, { size: 120 }));
    }
    gs.tweens.add({ targets: this.sign, alpha: 1, duration: 500, delay: 500 });
    gs.time.delayedCall(300, () => { Audio.play(Audio.exists('sfx_bell_hall') ? 'sfx_bell_hall' : 'sfx_unlock', { volume: 0.8 }); gs.effects.burst('star', this.bell.x, this.bell.y, 10); });
  }

  setEnabled(v) {
    this.img.setVisible(v);
    this.sign.setVisible(v);
    for (const d of this.drifts) d.setVisible(v);
    for (const o of this.obstacles) o.active = v && this.open;
  }
  revealObjects() { return [this.img, this.sign].concat(this.drifts); }
}

/** the station's name on the white board at the platform's west end */
export function stationSign(gs, x, y, text) {
  const tx = gs.add.text(x - 214, y - 141, text, { fontFamily: FONT, fontSize: '17px', fontStyle: '900', color: '#3a4a66', resolution: 2 }).setOrigin(0.5, 0.5).setDepth(y + 1);
  tx.setScale(Math.min(1, 54 / Math.max(1, tx.width)));
  return tx;
}

export { DEPTH };
