// SledView (view, plan §5.7, G1b): the 금방 개썰매 — the existing dog_sled (assets/vehicles: two huskies, a basket
// sled; SE / NE drawn, SW / NW mirrored), rider 뽀득이 (gb_rider) at seat 0, the gold pennant (gb_pennant at
// sledPennant[dir][anim][frame], explicit tables for all four dirs: never negated), the parcels stacked at
// cargoPoint, the stand's gb_flag, and the rider's doorstep scene through the same Courier (no van patches).

import { Assets } from '../../core/Assets.js';
import { DEPTH } from '../../systems/DepthSort.js';
import { Courier } from './Courier.js';
import { frameOf, shadowTex, baseDir, spriteOf, parcelKey, sprAnim } from './art.js';
import { L } from '../layout.js';

const KEY = 'dog_sled';

export class SledView {
  constructor(view) {
    this.view = view;
    const sc = this.scene = view.scene;
    this.ok = !!Assets.m.characters[KEY];
    if (this.ok && !Assets.built[KEY]) Assets.buildCharacter(sc.game, KEY);
    this.def = this.ok ? Assets.charDef(KEY) : null;
    this.shadow = sc.add.image(0, 0, shadowTex(sc)).setDepth(DEPTH.SHADOW + 2).setVisible(false);
    this.body = sc.add.sprite(0, 0, '__WHITE').setVisible(false);
    this.over = sc.add.image(0, 0, '__WHITE').setVisible(false);
    this.pen = sc.add.image(0, 0, '__WHITE').setVisible(false);
    this.boxes = [];
    this.rider = view.dolls.make({ preset: 'gb_rider', seed: 515, name: 'gb_crew_rider' });
    this.courier = new Courier(view, 'sled', { preset: 'gb_rider', seed: 515 });
    this.anim = ''; this.base = '';
    this.penT = 0;
    // the stand: a gold flag beside the parked sled (역앞 금방 정류장)
    const lay = view.host.lay, st = lay.sledStand ? L(lay.sledStand[0] + 0.9, lay.sledStand[1] - 0.6) : null;
    const f = st ? spriteOf('gb_flag') : null;
    this.flag = f ? sc.add.sprite(st.x, st.y, f.tex, f.frame).setOrigin(f.anchor[0], f.anchor[1]).setDepth(st.y) : null;
    const wave = this.flag ? sprAnim(sc, 'gb_flag', 'wave') : null;
    if (wave) this.flag.play(wave);
    this.wasDoor = false;
  }

  /** a world point of the sled for the Courier: 'doorPoints' (the rider steps off) / 'rearDoorPoint' (the basket) */
  point(v, field, k) {
    if (!this.def) return { x: v.x, y: v.y };
    const { base, flip } = baseDir(v.dk);
    const t = field === 'rearDoorPoint' ? this.def.cargoPoint && this.def.cargoPoint[base] : this.def.doorPoints && this.def.doorPoints[base] && this.def.doorPoints[base][k || 0];
    if (!t) return { x: v.x, y: v.y };
    return { x: v.x + (flip ? -t[0] : t[0]), y: v.y + t[1] + (field === 'rearDoorPoint' ? 30 : 0) };
  }

  sync(s, dt) {
    const view = this.view;
    if (!this.ok || !view.near(s.x, s.y, 300)) { this.hide(); return; }
    const { base, flip } = baseDir(s.dk);
    const anim = s.v > 0.1 ? 'move' : 'idle';
    if (anim !== this.anim || base !== this.base) { this.body.play(Assets.charAnim(KEY, anim, base), true); this.anim = anim; this.base = base; }
    this.body.anims.timeScale = anim === 'move' ? Math.max(0.6, Math.min(1.4, s.v / 2.6)) : 1;
    this.body.setVisible(true).setOrigin(this.def.anchor[0], this.def.anchor[1]).setPosition(s.x, s.y).setDepth(s.y).setFlipX(flip);
    const sh = (this.def.shadow && this.def.shadow[base]) || [154, 47, 26.57];
    this.shadow.setVisible(true).setPosition(s.x, s.y + 2).setDisplaySize(sh[0], sh[1] * 1.15).setAngle(flip ? -sh[2] : sh[2]);
    const fr = this.body.frame && this.body.frame.name, i = fr ? Number(fr.split('_').pop()) || 0 : 0;
    const of = fr ? frameOf(this.def.overlay ? this.def.overlay.atlas : this.def.atlas, 'over_' + fr) : null;
    // the rider on the basket (not while he is at a door)
    const door = s.st === 'door' && s.tl;
    let riderIn = true;
    if (door) {
      const r = this.courier.draw({ tl: s.tl, t: s.tlT, van: { x: s.x, y: s.y, dk: s.dk }, vanArt: this, dt, night: view.night(), lang: view.lang(), sled: true,
        addr: (aid) => view.m.book.get(aid), hidOf: () => null, line: () => null, joy: (x, y) => view.coinPop(x, y - 110, 0), quiet: !!(view.m.quiet && view.m.quiet()) });
      riderIn = r.driverIn;
      this.wasDoor = true;
    } else { if (this.wasDoor) { this.courier.reset(); this.wasDoor = false; } this.courier.hideAll(); }
    const seat = this.def.seatsStand && this.def.seatsStand[base] && this.def.seatsStand[base][0];
    if (seat && riderIn) {
      this.rider.visible(true);
      this.rider.play('idle', flip ? (base === 'SE' ? 'SW' : 'NW') : base);
      this.rider.place(s.x + (flip ? -seat[0] : seat[0]), s.y + seat[1], s.y + 0.001, 1);
    } else this.rider.visible(false);
    if (of) this.over.setTexture(of.tex, of.frame).setOrigin(this.def.anchor[0], this.def.anchor[1]).setVisible(true).setFlipX(flip).setPosition(s.x, s.y).setDepth(s.y + 0.004);
    else this.over.setVisible(false);
    // the pennant (explicit per-dir tables, with the sled's bob)
    const P = Assets.def('gb_pennant'), tbl = P && P.sledPennant && P.sledPennant[s.dk] && P.sledPennant[s.dk][anim];
    this.penT += dt;
    if (tbl) {
      const p = tbl[Math.min(tbl.length - 1, i)];
      const pf = frameOf(P.atlas, 'gb_pennant_' + base + '_' + (Math.floor(this.penT * 10) % 4));
      if (pf) this.pen.setTexture(pf.tex, pf.frame).setOrigin(P.anchor[0], P.anchor[1]).setFlipX(flip).setVisible(true).setPosition(s.x + p[0], s.y + p[1]).setDepth(s.y + 0.005);
      else this.pen.setVisible(false);
    } else this.pen.setVisible(false);
    // parcels in the basket (the load on a run, the queue at the stand)
    const n = Math.min(4, door ? 0 : (s.load.length || s.queue.length || 0));
    const cp = this.def.cargoPoint && this.def.cargoPoint[base];
    while (this.boxes.length < n) { const b = spriteOf(parcelKey('s')); if (!b) break; this.boxes.push(this.scene.add.image(0, 0, b.tex, b.frame).setOrigin(0.5, 0.75)); }
    for (let k = 0; k < this.boxes.length; k++) {
      const im = this.boxes[k];
      if (k >= n || !cp) { im.setVisible(false); continue; }
      im.setVisible(true).setScale(0.42).setPosition(s.x + (flip ? -cp[0] : cp[0]) + (k % 2) * 9 - 4, s.y + cp[1] + 4 - Math.floor(k / 2) * 11).setDepth(s.y + 0.003 + k * 1e-5);
    }
  }

  hide() {
    for (const o of [this.body, this.over, this.pen, this.shadow].concat(this.boxes)) o.setVisible(false);
    this.rider.visible(false);
    this.courier.hideAll();
  }

  objects() { return 4 + this.boxes.length + (this.flag ? 1 : 0) + this.courier.objects(); }
  destroy() { for (const o of [this.body, this.over, this.pen, this.shadow].concat(this.boxes)) o.destroy(); if (this.flag) this.flag.destroy(); this.rider.destroy(); this.courier.destroy(); }
}
