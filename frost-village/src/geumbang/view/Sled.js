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
  constructor(view, idx = 1) {
    this.view = view;
    this.idx = idx;                 // 1, 2 (개썰매 2 parks beside the first at the stand)
    const sc = this.scene = view.scene;
    // (the sled draws only once its own atlas is here: a manifest without the picture — the game's USED_ONLY keeps
    //  veh_dog_sled out until patch G-P6 — would otherwise build placeholder anims; the model runs the sled anyway)
    this.ok = false; this.def = null; this.okT = 0;
    this.ready();
    this.shadow = sc.add.image(0, 0, shadowTex(sc)).setDepth(DEPTH.SHADOW + 2).setVisible(false);
    this.body = sc.add.sprite(0, 0, '__WHITE').setVisible(false);
    this.over = sc.add.image(0, 0, '__WHITE').setVisible(false);
    this.pen = sc.add.image(0, 0, '__WHITE').setVisible(false);
    this.boxes = [];
    this.rider = view.dolls.make({ preset: 'gb_rider', seed: 515 + idx * 97, name: 'gb_crew_rider' });
    this.courier = new Courier(view, 'sled' + idx, { preset: 'gb_rider', seed: 515 + idx * 97 });
    this.crates = [];               // 금방 집하: item icons in the basket
    this.anim = ''; this.base = '';
    this.penT = 0;
    // the stand: a gold flag beside the parked sled (역앞 금방 정류장)
    const lay = view.host.lay, st = lay.sledStand && idx === 1 ? L(lay.sledStand[0] + 0.9, lay.sledStand[1] - 0.6) : null;
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

  /** the dog sled's manifest entry AND its atlas are here: build the anims once */
  ready() {
    if (this.ok) return true;
    if (!Assets.m.characters[KEY]) return false;
    const d = Assets.charDef(KEY);
    if (!d || !d.atlas || !Assets.texOf(d.atlas)) return false;
    if (!Assets.built[KEY]) Assets.buildCharacter(this.scene.game, KEY);
    this.def = d; this.ok = true;
    return true;
  }

  sync(s0, dt) {
    const view = this.view;
    // (the second team parks a sled length beside the first at the stand)
    const parked = s0.st === 'stand' || s0.st === 'cdrop';
    const s = this.idx > 1 && parked ? Object.assign(Object.create(s0), { x: s0.x - 70, y: s0.y + 34 }) : s0;
    if (!this.ok) { this.okT -= dt; if (this.okT <= 0) { this.okT = 1; this.ready(); } }
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
    // 금방 집하: the rider walks to the pile and back with the crates (cload), or carries them across to the dock (cdrop)
    const seat = this.def.seatsStand && this.def.seatsStand[base] && this.def.seatsStand[base][0];
    const walkTo = s.st === 'cload' && s.cpile ? { x: s.cpile.x, y: s.cpile.y + 10 } : s.st === 'cdrop' ? this.dockPoint(s) : null;
    if (walkTo && s.cDur > 0) {
      riderIn = false;
      const u = Math.max(0, Math.min(1, s.cT / s.cDur)), ph = u < 0.5 ? u * 2 : 2 - u * 2;   // there and back
      const ox = s.x + 30, oy = s.y + 18, x = ox + (walkTo.x - ox) * Math.min(1, ph * 1.15), y = oy + (walkTo.y - oy) * Math.min(1, ph * 1.15);
      const back = u >= 0.5;
      const dir = dollDirOf(back ? ox - walkTo.x : walkTo.x - ox, back ? oy - walkTo.y : walkTo.y - oy);
      this.rider.visible(true);
      this.rider.play(s.st === 'cload' ? (back ? 'carry_parcel' : 'walk') : (back ? 'walk' : 'carry_parcel'), dir);
      this.rider.place(x, y, y + 0.002, 1);
    } else if (seat && riderIn) {
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
    // 금방 집하 crates in the basket (the items' own icons), else parcels (the load on a run, the queue at the stand)
    this.drawCrates(s, base, flip, door);
    const n = Math.min(4, door || (s.cload && sumC(s.cload) > 0) ? 0 : (s.load.length || s.queueN || 0));
    const cp = this.def.cargoPoint && this.def.cargoPoint[base];
    while (this.boxes.length < n) { const b = spriteOf(parcelKey('s')); if (!b) break; this.boxes.push(this.scene.add.image(0, 0, b.tex, b.frame).setOrigin(0.5, 0.75)); }
    for (let k = 0; k < this.boxes.length; k++) {
      const im = this.boxes[k];
      if (k >= n || !cp) { im.setVisible(false); continue; }
      im.setVisible(true).setScale(0.42).setPosition(s.x + (flip ? -cp[0] : cp[0]) + (k % 2) * 9 - 4, s.y + cp[1] + 4 - Math.floor(k / 2) * 11).setDepth(s.y + 0.003 + k * 1e-5);
    }
  }

  /** the 짐 싣는 곳 next to the stand (where 집하 crates go): the cargo sleigh's stop, else beside the stand */
  dockPoint(s) { const p = this.view.host.lay.sleighStop || [5, -5]; const q = L(p[0], p[1]); return Math.hypot(q.x - s.x, (q.y - s.y) * 2) < 700 ? { x: q.x + 40, y: q.y + 10 } : { x: s.x + 90, y: s.y - 40 }; }

  drawCrates(s, base, flip, door) {
    const items = [];
    if (!door && s.cload) for (const k of Object.keys(s.cload).sort()) for (let q = 0; q < Math.min(6, s.cload[k]); q++) items.push(k);
    const cp = this.def.cargoPoint && this.def.cargoPoint[base];
    const show = Math.min(6, items.length);
    // (unloading at the dock: the stack goes down as the rider carries it over)
    const left = s.st === 'cdrop' && s.cDur > 0 ? Math.ceil(show * (1 - Math.min(1, s.cT / s.cDur))) : show;
    for (let k = 0; k < Math.max(left, this.crates.length); k++) {
      if (k >= left || !cp) { if (this.crates[k]) this.crates[k].setVisible(false); continue; }
      const sp = spriteOf(items[k]);
      if (!sp) continue;
      let im = this.crates[k];
      if (!im) { im = this.scene.add.image(0, 0, sp.tex, sp.frame); this.crates[k] = im; }
      if (im.texture.key !== sp.tex || im.frame.name !== sp.frame) im.setTexture(sp.tex, sp.frame);
      const sz = 22 / Math.max(1, Math.max(im.frame.realWidth, im.frame.realHeight));
      im.setOrigin(0.5, 0.75).setVisible(true).setScale(sz).setPosition(s.x + (flip ? -cp[0] : cp[0]) + (k % 3) * 9 - 9, s.y + cp[1] + 4 - Math.floor(k / 3) * 9).setDepth(s.y + 0.0035 + k * 1e-5);
    }
  }

  hide() {
    for (const o of this.crates) o.setVisible(false);
    for (const o of [this.body, this.over, this.pen, this.shadow].concat(this.boxes)) o.setVisible(false);
    this.rider.visible(false);
    this.courier.hideAll();
  }

  objects() { return 4 + this.boxes.length + this.crates.length + (this.flag ? 1 : 0) + this.courier.objects(); }
  destroy() { for (const o of [this.body, this.over, this.pen, this.shadow].concat(this.boxes, this.crates)) o.destroy(); if (this.flag) this.flag.destroy(); this.rider.destroy(); this.courier.destroy(); }
}

const sumC = (o) => { let n = 0; for (const k in o || {}) n += o[k] || 0; return n; };
/** a doll dir from a px step (screen) */
function dollDirOf(dx, dy) { const a = Math.atan2(dy, dx) * 180 / Math.PI; return a > -22.5 && a <= 22.5 ? 'E' : a > 22.5 && a <= 67.5 ? 'SE' : a > 67.5 && a <= 112.5 ? 'S' : a > 112.5 && a <= 157.5 ? 'SW' : (a > 157.5 || a <= -157.5) ? 'W' : a > -157.5 && a <= -112.5 ? 'NW' : a > -112.5 && a <= -67.5 ? 'N' : 'NE'; }
