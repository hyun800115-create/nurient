// (v4.2, docs/v42_plan.md §6.3; CODE-2: CONTRACT_V42 AI) 촌장 사무실 — the `chief_office` cutaway (assets/office) at
// WORLD.v42.office: cream plaster, a teal roof, a pinecone finial, a red mailbox. Closed it is the shell + props (+ the
// warm window glow at night); revealed (the chief within office.revealPx of the door, an office panel open, the 관망
// camera on it, or a tap on it) the shell fades to 12 % and the inside shows: four desks, the chalkboard 재고판 with the
// five line bars, the map, the pigeonholes, the stove, the safe in the courier's corner. Staff sit at their desks
// (officefolk anims, Office / staff/Staff.js); the chief can walk in (wall circles with a gap at the door, a raised
// floor) and stand on the 책상 pad in front of his desk (0.4 s: the office panel).
// Pages: the closed look (office_bld@closed) loads with the building; the inside (office_bld@inside) and the staff's
// desk / work / errand pages are asked for while the chief is near or it is revealed (Residency, on demand) and go
// 30 s after: the plaza keeps only the closed look.
// The same API as the CODE-1 stand-in (Office, staff, 관망 use it):
//   b.spots   { desk: [sem, bok, chong, ttal] seat points, board, mailbox, deskPad, hire, door, entry, safe, chiefSeat,
//               stove, bench } — inside points are lifted (floorLiftPx: staff sit there); `ground` gives the chief's
//               ground point of one (point + lift)
//   b.setMail(n)  the mailbox flag (unread letters)        b.drawBoard(rows)  the 5 bars (1 Hz while revealed)
//   b.revealObjects()                                     b.cw  the Cutaway (after the art arrived)

import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { Residency } from '../core/Residency.js';
import { Pad } from './Pad.js';
import { Cutaway } from './Cutaway.js';
import { DEPTH } from '../systems/DepthSort.js';
import { WORLD } from '../data/world.js';
import { BALANCE } from '../data/balance.js';
import { t } from '../data/strings.js';
import { gdist } from '../core/Iso.js';

const STATUS_COL = { short: 0xd9534f, jam: 0xf0a030, surplus: 0x5b8fd9, ok: 0x5cb85c };
// the manifest's points (px from the anchor; inside ones include floorLiftPx 17) — used until the manifest is merged,
// so the staff's spots never move when the art arrives (assets/office/manifest.json chief_office)
const PTS = {
  floorLiftPx: 17,
  doorPoint: [-214, 34], entryPoint: [-148, -15], chiefDeskPoint: [80, -66], chiefDeskPad: [12, -20],
  deskPoints: [[-79, -97], [-145, -64], [-48, -18], [97, -12]], deskDirs: ['SE', 'SE', 'SW', 'SE'], deskBands: ['behind', 'behind', 'front', 'front'],
  boardPoint: [140, -21], cabinetPoint: [-93, -58], mailShelfPoint: [-45, -91], safePoint: [143, 3], stovePoint: [11, -81],
  seatPoints: [[11, 24], [43, 40]], mailboxPoint: [-181, 69], outdoorProps: [{ sprite: 'office_mailbox', point: [-143, 56] }],
  boardRect: { point: [125, -123], widthPx: 85, heightPx: 43, shearY: 0.5 },
  signRect: { point: [-177, -140], widthPx: 104, heightPx: 28, shearY: 0.5, color: '#2E6F6B', hideBelowShellAlpha: 0.5 },
  wallCircles: [[-122, -84, 61], [-213, -34, 61], [0, -104, 54], [86, -61, 48], [-109, 45, 61], [122, -57, 61], [167, -29, 29], [-32, 97, 61], [213, 2, 54], [72, 100, 35], [163, 63, 61]],
};
const OB = () => (BALANCE.v42 && BALANCE.v42.office) || {};
const DIR_OF = { S: 2, SE: 1, E: 0, NE: 7, N: 6, NW: 5, W: 4, SW: 3 };

export class OfficeBuilding {
  constructor(gs, site, office) {
    this.gs = gs; this.site = site; this.office = office;
    const O = WORLD.v42.office;
    this.x = O.x; this.y = O.y;
    const def = Assets.def('chief_office');
    this.P = Object.assign({}, PTS, def && def.deskPoints ? def : {});
    this.lift = Number(this.P.floorLiftPx) || 17;
    const P = this.P, x = this.x, y = this.y, L = this.lift;
    const at = (p) => ({ x: x + p[0], y: y + p[1] });
    const ground = (p) => ({ x: x + p[0], y: y + p[1] + L });
    this.ground = (p) => ({ x: p.x, y: p.y + L });
    this.spots = {
      door: at(P.doorPoint),
      entry: ground(P.entryPoint),
      deskPad: ground(P.chiefDeskPad),
      chiefSeat: at(P.chiefDeskPoint),
      hire: { x: O.hire[0], y: O.hire[1] },
      desk: P.deskPoints.map(at),
      deskDirs: P.deskDirs.slice(), deskBands: (P.deskBands || PTS.deskBands).slice(),
      board: at(P.boardPoint),
      cabinet: at(P.cabinetPoint),
      shelf: at(P.mailShelfPoint),
      mailbox: at(P.mailboxPoint),
      safe: at(P.safePoint),
      stove: at(P.stovePoint),
      bench: (P.seatPoints || []).map(at),
    };
    this.revealHold = 0;
    this.tapOpen = false;
    this.mailN = -1;
    this.boardRows = null;
    this.obstacles = [];
    this.ready = false;
    // walls: the manifest's circles with a gap at the door (the chief walks in onto the raised floor)
    for (const [dx, dy, r] of P.wallCircles) this.obstacles.push(gs.collision.add(x + dx, y + dy, r, 'office'));
    // ((v4.2 fix, gameplay M2) + a thin wall along every footprint edge with the door's opening: between two circles
    //  he squeezed through the back and the east walls straight onto the 책상 pad)
    const fp = (def && def.footprintPoly) || [[-226, -14], [27, 113], [226, 14], [-27, -113]];
    const door = this.spots.door;
    if (gs.collision.addWalls) for (const o of gs.collision.addWalls(fp.map((q) => ({ x: x + q[0], y: y + q[1] })), 8, 'office', [{ x: door.x, y: door.y, w: 84 }], true)) this.obstacles.push(o);
    // the 책상 pad in front of his desk (stand 0.4 s: the office panel); drawn on the raised floor
    const dp = this.spots.deskPad;
    this.deskPad = new Pad(gs, dp.x, dp.y, 'cash', 1.0, { icon: Assets.pick('ui_icon_office', 'ui_icon_newspaper', 'ui_icon_story', 'ui_icon_lock'), iconSize: 34 });
    // ((v4.2 fix, visual L6) the label under the pad (on the floor in front of the desk), not floating mid-office over a
    //  seated clerk's head)
    this.deskLabel = gs.add.text(dp.x, dp.y - L + 34, t('officeChip'), { fontFamily: gs.font, fontSize: '16px', fontStyle: '900', color: '#2b2f3a', backgroundColor: '#fff8ecee', padding: { x: 8, y: 3 }, resolution: 2 }).setOrigin(0.5).setDepth(DEPTH.LABEL - 50).setAlpha(0);
    // the art arrives with the office fragment (its closed page): the building is made then
    Assets.loadFragment(gs, 'office', { only: ['office_bld', 'office_items'] }, () => this.build());
  }

  build() {
    if (this.ready || this.dead || !this.gs.sys) return;
    // ((v4.2 fix, robust L1) the fragment may already be merged while the scene is still being created (an in-session
    //  restart with the building saved): build on the first update instead of never)
    if (!this.gs.sys.isActive()) { if (!this.deferred) { this.deferred = true; this.gs.time.delayedCall(0, () => { this.deferred = false; this.build(); }); } return; }
    this.ready = true;
    const gs = this.gs, x = this.x, y = this.y, L = this.lift;
    this.cw = new Cutaway(gs, 'chief_office', x, y, {});
    const order = this.cw.order;
    const idx = (n) => Math.max(0, order.indexOf(n));
    // the pad and its icon lie on the raised floor, under every person
    const padD = this.cw.base + 0.01 * idx('chief_office_floor') + 0.005;
    this.deskPad.img.setY(this.deskPad.img.y - L).setDepth(padD);
    if (this.deskPad.icon) this.deskPad.icon.setY(this.deskPad.icon.y - L).setDepth(padD + 1e-4);
    // the night glow over the closed shell (NORMAL art; only while closed)
    this.glow = Assets.image(gs, x, y, 'chief_office_glow').setDepth(this.cw.base + 0.01 * idx('chief_office_shell') + 0.005).setVisible(false);
    if (gs.lazyImage) gs.lazyImage(this.glow, 'chief_office_glow');
    // the sign board over the door: the name, sheared onto it (nothing is baked into the art)
    this.sign = this.makeSign();
    // the mailbox (an outdoor prop: y-sorted like everything in front of the building)
    const mp = (this.P.outdoorProps || PTS.outdoorProps).find((q) => q.sprite === 'office_mailbox') || PTS.outdoorProps[0];
    const mx = x + mp.point[0], my = y + mp.point[1];
    const r = Assets.sprite('office_mailbox');
    this.mail = gs.add.sprite(mx, my, r.tex, r.frame).setOrigin(r.anchor[0], r.anchor[1]).setDepth(my);
    if (gs.lazyImage) gs.lazyImage(this.mail, 'office_mailbox');
    this.obstacles.push(gs.collision.add(mx, my, 14, 'mailbox'));
    // the 재고판 bars (back wall, while revealed)
    this.board = gs.add.graphics().setDepth(this.cw.base + 0.01 * idx('chief_office_back') + 0.004).setVisible(false);
    this.drawBoard(this.boardRows);
    this.setMail(Math.max(0, this.mailN), true);
    this.cw.loop('chief_office_stove', 'fire');
  }

  /** the office's name on the blank sign board (a sheared canvas text, alpha with the shell) */
  makeSign() {
    const gs = this.gs, S = this.P.signRect || PTS.signRect;
    const key = 'fv_office_sign_' + (t('officeTitle') || '').length;
    const W = Math.round(S.widthPx * 2), H = Math.round((S.heightPx + S.widthPx * S.shearY) * 2);
    if (!gs.textures.exists(key)) {
      const c = gs.textures.createCanvas(key, W, H);
      if (c) {
        const ctx = c.context;
        ctx.setTransform(2, 2 * S.shearY, 0, 2, 0, 0);
        ctx.font = '900 ' + Math.round(S.heightPx * 0.72) + 'px ' + (gs.font || 'sans-serif');
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        let fs = Math.round(S.heightPx * 0.72);
        while (fs > 8 && ctx.measureText(t('officeTitle')).width > S.widthPx - 10) { fs--; ctx.font = '900 ' + fs + 'px ' + (gs.font || 'sans-serif'); }
        ctx.fillStyle = S.color || '#2E6F6B';
        ctx.fillText(t('officeTitle'), S.widthPx / 2, S.heightPx / 2 + 1);
        c.refresh();
      }
    }
    const p = S.point;
    return gs.add.image(this.x + p[0] - S.widthPx / 2, this.y + p[1] - S.heightPx / 2 - (S.widthPx / 2) * S.shearY, key).setOrigin(0, 0).setScale(0.5).setDepth(this.y + 0.2);
  }

  /** the mailbox flag: up (it springs up with a little pop) while letters wait, down when they are read */
  setMail(n, quiet) {
    if (n === this.mailN && !quiet) return;
    const was = this.mailN;
    this.mailN = n;
    if (!this.mail || !Assets.has('office_mailbox')) return;
    if (n > 0 && (was <= 0 || quiet)) {
      const ak = !quiet && Assets.spriteAnim('office_mailbox', 'pop');
      if (ak) this.mail.play(ak);
      else { const d = Assets.def('office_mailbox'), fr = (d.states && d.states.up) || 'office_mailbox_flag_1'; const tk = Assets.texOf(d.atlas, fr); if (tk) this.mail.setTexture(tk, fr); }
      if (!quiet && this.gs.isOnScreen(this.mail.x, this.mail.y, 200)) Audio.play(Audio.exists('sfx_mailbox_flag') ? 'sfx_mailbox_flag' : 'sfx_click', { volume: 0.6 });
    } else if (n <= 0) { if (this.mail.anims) this.mail.anims.stop(); Assets.apply(this.mail, 'office_mailbox'); }
  }

  /** the wall board: one bar per goods line, coloured by its 재고 status, drawn on the slate (sheared like the wall) */
  drawBoard(rows) {
    this.boardRows = rows;
    const g = this.board;
    if (!g) return;
    g.clear();
    const B = this.P.boardRect || PTS.boardRect, sh = B.shearY || 0.5;
    const ox = this.x + B.point[0] - B.widthPx / 2, oy = this.y + B.point[1] - B.heightPx / 2;
    const R = rows || [];
    const quad = (x0, y0, w, h, col, a) => {
      g.fillStyle(col, a);
      g.beginPath();
      // ((v4.2 fix, visual M2) the manifest shears about the board's centre (y += shearY · x, x from the point): from
      //  the left edge the bars sat 21 px low, half off the slate)
      const c0 = x0 - B.widthPx / 2, c1 = x0 + w - B.widthPx / 2;
      g.moveTo(ox + x0, oy + y0 + c0 * sh); g.lineTo(ox + x0 + w, oy + y0 + c1 * sh);
      g.lineTo(ox + x0 + w, oy + y0 + h + c1 * sh); g.lineTo(ox + x0, oy + y0 + h + c0 * sh);
      g.closePath(); g.fillPath();
    };
    const rowH = (B.heightPx - 8) / 5;
    for (let i = 0; i < 5; i++) {
      const r = R[i];
      const col = r ? STATUS_COL[r.status] || STATUS_COL.ok : 0x50605a;
      const fill = r ? Math.max(0.12, Math.min(1, (r.shelf || 0) / Math.max(1, r.shelfCap || 40))) : 0.3;
      quad(6, 4 + i * rowH, (B.widthPx - 12), rowH * 0.62, 0xffffff, 0.12);
      quad(6, 4 + i * rowH, (B.widthPx - 12) * fill, rowH * 0.62, col, 0.95);
    }
  }

  /** should the inside show? (the chief at the door / inside, a tap, the panel, the 관망 camera, a held reveal) */
  wantReveal() {
    const gs = this.gs, p = gs.player, V = OB();
    const r = Number(V.revealPx) || 260, h = Number(V.revealHyst) || 60;
    const d = gdist(p.x, p.y, this.spots.door.x, this.spots.door.y);
    let want = this.cw.revealed ? d < r + h : d < r;
    if (this.cw.inPoly(p.x, p.y) || this.cw.onFloor(p.x, p.y)) want = true;
    if (this.tapOpen || this.revealHold > 0) want = true;
    const tab = this.office.panelTab && this.office.panelTab();
    if ((tab && tab !== 'bank') || this.office.camReveal === 'office') want = true;
    return want;
  }

  /** the chief is near enough that the inside pages should be in memory (before the reveal fades the shell) */
  wantsInside() {
    const p = this.gs.player;
    return (this.cw && (this.cw.revealed || this.cw.alpha > 0)) || gdist(p.x, p.y, this.spots.door.x, this.spots.door.y) < (Number(OB().revealPx) || 260) + 420;
  }

  update(dt) {
    if (!this.ready) return;
    const gs = this.gs, cw = this.cw;
    this.revealHold = Math.max(0, this.revealHold - dt);
    let want = this.wantReveal();
    // ((v4.2 fix, visual M4) the shell fades only once the inside has its pictures (the inside page and the staff's
    //  desk / head pages, asked for from 680 px out): no empty ghost house with a floating 업무 pad. 6 s at most)
    if (want && !cw.revealed) {
      this.waitIn = (this.waitIn || 0) + dt;
      if (this.waitIn < 6 && !this.insideReady()) { want = false; this.pageT = Math.min(this.pageT || 0, 0); }
    } else if (!want) this.waitIn = 0;
    if (want !== cw.revealed) cw.reveal(want);
    cw.update(dt);
    // the inside pages: asked for while he is near (they arrive before the shell has faded), released 30 s after
    this.pageT = (this.pageT || 0) - dt;
    if (this.pageT <= 0) {
      this.pageT = 0.5;
      this.inside = this.wantsInside();
      // ((v4.2 fix, visual L5) + the office panel's page, so the 책상 pad opens it with its plates at once)
      if (this.inside) { Residency.want('office_bld@inside'); this.office.wantStaffPages && this.office.wantStaffPages(); Residency.want('ui5_icons@panels'); }
    }
    const a = cw.alpha;
    // the sign fades with the shell (hidden over the open inside)
    const S = this.P.signRect || PTS.signRect, shellA = 1 + (cw.fade.openAlpha - 1) * a;
    if (this.sign) { const v = shellA >= (S.hideBelowShellAlpha || 0.5); this.sign.setVisible(v).setAlpha(shellA); }
    // the desk pad + its label only while open; the board while open
    const open = a > 0.3;
    if (this.deskPad.img.visible !== open) { this.deskPad.img.setVisible(open); if (this.deskPad.icon) this.deskPad.icon.setVisible(open); }
    this.deskLabel.setAlpha(open && gdist(gs.player.x, gs.player.y, this.spots.deskPad.x, this.spots.deskPad.y) < 260 ? 1 : 0);
    if (this.board.visible !== open) this.board.setVisible(open);
    // night: the warm windows over the closed shell
    const ck = gs.v4 && gs.v4.clock;
    const night = !!(ck && ck.lightsOn && ck.cur && ck.cur.a > 0.05);
    const gv = night && a < 0.02;
    if (this.glow.visible !== gv) this.glow.setVisible(gv);
    // the office bed: soft typing, the clock, the kettle — inside / at the door, faint nearby
    const p = gs.player, d = gdist(p.x, p.y, this.spots.door.x, this.spots.door.y);
    const amb = a > 0.3 ? 1 : d < 700 ? 0.35 * (1 - d / 700) : 0;
    if (Math.abs(amb - (this.ambV || 0)) > 0.04) { this.ambV = amb; Audio.setAmbience('amb_office', amb); }
  }

  /** the inside layers have their frames, and the seated staff their desk and head pages */
  insideReady() {
    if (!this.cw.insideReady()) return false;
    const O = this.office, tex = this.gs.textures;
    if (!O || !O.staff || !Object.keys(O.staff).length) return true;
    const TFo = O.staffPagesNeeded ? O.staffPagesNeeded() : [];
    return TFo.every((k) => tex.exists(k));
  }

  /** the panel or a big moment holds the inside open for `s` seconds */
  holdOpen(s) { this.revealHold = Math.max(this.revealHold, s); }

  /** night lights (DayClock): the windows while closed, the desk lamps, stove and door lantern while open */
  lightPoints(pts) {
    if (!this.ready) return;
    const N = this.P.night || Assets.def('chief_office').night;
    if (!N) return;
    const L = this.cw && this.cw.alpha > 0.3 ? N.lightPointsOpen : N.lightPoints;
    for (const q of L || []) pts.push({ x: this.x + q[0], y: this.y + q[1], k: 0.6 });
  }

  tap(x, y) { if (!this.cw || !this.cw.inPoly(x, y)) return false; this.tapOpen = !this.tapOpen; return true; }

  revealObjects() { return this.cw ? this.cw.objects() : []; }

  destroy() {
    this.dead = true;
    Audio.setAmbience('amb_office', 0);
    for (const o of [this.sign, this.mail, this.board, this.deskLabel, this.glow]) if (o && o.destroy) o.destroy();
    if (this.cw) this.cw.destroy();
    this.deskPad.img.destroy(); if (this.deskPad.icon) this.deskPad.icon.destroy();
    for (const ob of this.obstacles) ob.active = false;
  }
}

export { DIR_OF };
