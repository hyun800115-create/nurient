// A building / park / street prop of the neighbour town (v4, docs/v4_plan.md §3.3): its picture (town atlases
// arrive late: a stand-in until then), collision circles along its footprint, x-ray when someone walks
// behind it, its loop animation (school bell, fountain, barber pole) and its interaction points in world px
// (doorPoint, staffPoints, customerPoints, gatherPoints, playPoints, seatPoints, waitPoints, boardPoints).

import { Assets } from '../core/Assets.js';
import { FONT, t } from '../data/strings.js';

const POINTS = ['staffPoints', 'customerPoints', 'gatherPoints', 'playPoints', 'seatPoints', 'waitPoints', 'boardPoints'];

export class TownBuilding {
  constructor(gs, cfg, opts = {}) {
    this.gs = gs;
    this.cfg = cfg;
    this.id = cfg.id;
    this.key = cfg.key;
    this.role = cfg.role || 'decor';
    this.x = cfg.x; this.y = cfg.y;
    this.enabled = true;
    this.def = Assets.def(this.key);
    this.img = Assets.image(gs, this.x, this.y, this.key).setDepth(this.y + (opts.depthOff || 0));
    if (gs.lazyImage) gs.lazyImage(this.img, this.key, () => { this.def = Assets.def(this.key); this.points(); this.startLoop(); });
    this.obstacles = [];
    this.addCollision(opts.collision);
    if (opts.occluder !== false && this.def.kind !== 'decal') gs.addOccluder(this.img);
    this.points();
    this.startLoop();
    if (cfg.board) this.makeBoard(t(cfg.board));
  }

  /** 2–4 circles along the footprint's long axis (front -Y buildings: along world X); `opts.backOnly` (stations) */
  addCollision(o) {
    const gs = this.gs, d = this.def;
    const fm = d.footprintM;
    if (o === false) return;
    if (!Array.isArray(fm)) { const r = (fm && fm.radius ? fm.radius : 0.25) * 64; this.obstacles.push(gs.collision.add(this.x, this.y, Math.max(10, r), this.key)); return; }
    const [X, Y] = fm;
    const along = X >= Y ? 'x' : 'y';
    const long = Math.max(X, Y), short = Math.min(X, Y);
    const n = Math.max(2, Math.min(4, Math.round(long / short + 0.6)));
    const r = short * 0.5 * 45.25 * 1.1;
    // a station keeps its platform (the front half, toward -Y) walkable
    const back = o && o.backOnly ? short * 0.22 : 0;
    for (let k = 0; k < n; k++) {
      const s = (k / (n - 1) - 0.5) * (long - short);
      const mx = along === 'x' ? s : 0, my = along === 'x' ? back : s;
      const x = this.x + 45.25 * (mx + my), y = this.y + 22.63 * (mx - my);
      this.obstacles.push(gs.collision.add(x, y, back ? r * 0.75 : r, this.key));
    }
  }

  /** interaction points in world px (from the manifest) */
  points() {
    const d = this.def;
    const pt = (p) => ({ x: this.x + p[0], y: this.y + p[1] });
    this.door = d.doorPoint ? pt(d.doorPoint) : null;
    this.doorDir = d.doorDir || 'NE';
    for (const k of POINTS) {
      const list = Array.isArray(d[k]) ? d[k] : [];
      const dirs = d[k.replace('Points', 'Dirs')] || [];
      this[k.replace('Points', '')] = list.map((p, i) => Object.assign(pt(p), { dir: dirs[i] || 'S' }));
    }
    this.inPt = d.inPoint ? pt(d.inPoint) : null;
    this.stopPt = d.stopPoint ? pt(d.stopPoint) : null;
    this.fx = {};
    for (const k in d.fxPoints || {}) this.fx[k] = pt(d.fxPoints[k]);
    this.topPx = d.topPx || 200;
  }

  /** the loop animation (work / ring / water / spin) */
  startLoop() {
    if (Assets.pending(this.key)) return;     // (the lazy callback starts it when the atlas arrives)
    const k = Assets.spriteAnim(this.key, 'work');
    this.loopKey = k;
    if (!k || this.key === 'school') return;     // the school bell rings only at its hours
    if (this.img.anims === undefined) {
      // an Image cannot play: swap for a sprite once
      const s = this.gs.add.sprite(this.x, this.y, this.img.texture.key, this.img.frame.name).setOrigin(this.img.originX, this.img.originY).setDepth(this.img.depth).setVisible(this.img.visible);
      this.swapImage(s);
    }
    this.img.anims.play(k);
  }

  swapImage(s) {
    const old = this.img;
    for (const o of this.gs.occluders || []) if (o.img === old) o.img = s;
    this.img = s;
    old.destroy();
  }

  /** ring the school bell (plays the work loop a few times) */
  ring(times = 3) {
    if (Assets.pending(this.key)) return;
    const k = Assets.spriteAnim(this.key, 'ring') || this.loopKey;
    if (!k) return;
    if (this.img.anims === undefined) this.swapImage(this.gs.add.sprite(this.x, this.y, this.img.texture.key, this.img.frame.name).setOrigin(this.img.originX, this.img.originY).setDepth(this.img.depth).setVisible(this.img.visible));
    this.img.anims.play({ key: k, repeat: times * 2 });
  }

  makeBoard(text) {
    const gs = this.gs;
    const bc = (this.def.fxPoints && this.def.fxPoints.boardCentre) || [0, -146];
    this.board = gs.add.text(this.x + bc[0], this.y + bc[1], text, { fontFamily: FONT, fontSize: '22px', fontStyle: '900', color: '#5a3a26', resolution: 2 }).setOrigin(0.5, 0.5).setDepth(this.y + 0.5);
    this.board.setScale(Math.min(1, 150 / Math.max(1, this.board.width)));
  }

  setEnabled(v) {
    this.enabled = v;
    this.img.setVisible(v);
    if (this.board) this.board.setVisible(v);
    for (const o of this.obstacles) o.active = v;
  }
  revealObjects() { return this.board ? [this.img, this.board] : [this.img]; }
}
