// (v4.2, docs/v42_plan.md §6.3) 촌장 사무실 — CODE-1 STAND-IN: a village house picture (house_a ×1.75, tinted cream;
// the plan's town `post_office` page is held out of the village by Residency) at WORLD.v42.office, the staff at desk spots in front of it with code props, a code mailbox with a flag,
// a small wall-board of 5 coloured bars (the 재고 statuses), the 책상 pad that opens the office panel. Every system works
// on it; CODE-2 replaces it by the `chief_office` cutaway (CONTRACT_V42 AI) under the same API:
//   b.spots   { desk: [sem, bok, chong, ttal], board, mailbox, deskPad, hire, door }
//   b.setMail(n)   the mailbox flag (unread letters)
//   b.drawBoard(rows)   the 5 bars (1 Hz while near the view)
//   b.revealObjects()
// Never shipped to the designer as is.

import { Assets } from '../core/Assets.js';
import { Pad } from './Pad.js';
import { DEPTH } from '../systems/DepthSort.js';
import { WORLD } from '../data/world.js';
import { t } from '../data/strings.js';

const STATUS_COL = { short: 0xd9534f, jam: 0xf0a030, surplus: 0x5b8fd9, ok: 0x5cb85c };

export class OfficeBuilding {
  constructor(gs, site, office) {
    this.gs = gs; this.site = site; this.office = office;
    const O = WORLD.v42.office;
    this.x = O.x; this.y = O.y;
    const x = this.x, y = this.y;
    // the picture: a village house scaled up and tinted cream (the town post office's page lives with the far town
    // and Residency keeps it out of the village; the stand-in only has to be there until the office art lands)
    const KEY = Assets.m.sprites.house_a ? 'house_a' : 'post_office';
    this.img = Assets.image(gs, x, y + 20, KEY).setDepth(y + 20).setScale(1.75).setTint(0xfff1d6);
    if (gs.lazyImage) gs.lazyImage(this.img, KEY, (im) => im.setScale(1.75).setTint(0xfff1d6));
    if (gs.addOccluder) gs.addOccluder(this.img);
    this.sign = gs.add.text(x + 10, y - 215, t('officeTitle'), { fontFamily: gs.font, fontSize: '24px', fontStyle: '900', color: '#ffffff', stroke: '#2f5e66', strokeThickness: 7, resolution: 2 }).setOrigin(0.5).setDepth(y + 21);
    // walls: circles over the footprint (the stand-in has no inside)
    this.obstacles = [];
    for (const [dx, dy, r] of [[0, 0, 110], [110, -20, 70], [-90, -10, 60], [60, 60, 50]]) this.obstacles.push(gs.collision.add(x + dx, y + dy, r, 'office'));
    // spots in front of the building (the SW / SE faces)
    const P = (dx, dy) => ({ x: x + dx, y: y + dy });
    this.spots = {
      door: P(O.door[0] - x, O.door[1] - y + 40),
      deskPad: P(-140, 66),
      hire: { x: O.hire[0], y: O.hire[1] },
      desk: [P(-40, 120), P(40, 150), P(130, 170), P(-250, 40)],
      board: P(-10, 96),
      mailbox: P(-215, 2),
      safe: P(-200, 70),
    };
    // the 책상 pad (stand 0.4 s: the office panel)
    this.deskPad = new Pad(gs, this.spots.deskPad.x, this.spots.deskPad.y, 'cash', 1.3, { icon: Assets.pick('ui_icon_newspaper', 'ui_icon_story', 'ui_icon_mission', 'ui_icon_lock'), iconSize: 40 });
    this.deskLabel = gs.add.text(this.spots.deskPad.x, this.spots.deskPad.y - 58, t('officeChip'), { fontFamily: gs.font, fontSize: '20px', fontStyle: '900', color: '#2b2f3a', backgroundColor: '#fff8ecee', padding: { x: 10, y: 4 }, resolution: 2 }).setOrigin(0.5).setDepth(DEPTH.LABEL - 50);
    // code props: little desks (crates) at the desk spots, the mailbox, the wall board
    this.props = [];
    for (const d of this.spots.desk.slice(0, 3)) { const c = Assets.image(gs, d.x + 18, d.y - 30, 'crate').setScale(0.42).setDepth(d.y - 31); this.props.push(c); }
    const mb = this.spots.mailbox;
    this.mail = gs.add.graphics().setDepth(mb.y);
    this.board = gs.add.graphics().setDepth(this.spots.board.y - 40);
    this.mailN = 0;
    this.drawMail();
    this.drawBoard(null);
  }

  drawMail() {
    const g = this.mail, mb = this.spots.mailbox, n = this.mailN;
    g.clear();
    g.fillStyle(0x5a3a28, 1); g.fillRect(mb.x - 3, mb.y - 52, 6, 52);
    g.fillStyle(0xc8352e, 1); g.fillRoundedRect(mb.x - 18, mb.y - 80, 36, 30, 8);
    g.fillStyle(0x8a1f1a, 1); g.fillRect(mb.x - 12, mb.y - 70, 24, 4);
    // the flag pops up when mail arrives
    g.fillStyle(0xffd23a, 1);
    if (n > 0) { g.fillRect(mb.x + 18, mb.y - 98, 4, 26); g.fillRect(mb.x + 22, mb.y - 98, 14, 10); }
    else g.fillRect(mb.x + 18, mb.y - 70, 16, 4);
  }
  setMail(n) { if (n === this.mailN) return; this.mailN = n; this.drawMail(); }

  /** the wall board: one bar per goods line, coloured by its 재고 status */
  drawBoard(rows) {
    const g = this.board, b = this.spots.board;
    g.clear();
    g.fillStyle(0x6b4a2e, 1); g.fillRect(b.x - 4, b.y - 60, 8, 60);
    g.fillStyle(0x2f3a33, 1); g.fillRoundedRect(b.x - 46, b.y - 128, 92, 70, 6);
    g.lineStyle(3, 0x8a6a48, 1); g.strokeRoundedRect(b.x - 46, b.y - 128, 92, 70, 6);
    const R = rows || [];
    for (let i = 0; i < 5; i++) {
      const r = R[i];
      const col = r ? STATUS_COL[r.status] || STATUS_COL.ok : 0x50605a;
      const fill = r ? Math.max(0.12, Math.min(1, (r.shelf || 0) / Math.max(1, r.shelfCap || 40))) : 0.3;
      g.fillStyle(col, 1); g.fillRect(b.x - 36, b.y - 120 + i * 12, 72 * fill, 8);
    }
  }

  update(dt) { void dt; }

  revealObjects() { return [this.img, this.sign].concat(this.props); }

  destroy() {
    for (const o of [this.img, this.sign, this.mail, this.board, this.deskLabel].concat(this.props)) if (o && o.destroy) o.destroy();
    this.deskPad.img.destroy(); if (this.deskPad.icon) this.deskPad.icon.destroy();
    for (const ob of this.obstacles) ob.active = false;
  }
}
