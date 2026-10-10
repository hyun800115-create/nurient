// LgxView — the Phaser side of the 솔방울 물류센터. Parts: Centre (cutaway layers, doors, conveyor, lamp, nameplate,
// outdoor props), Racks (real stock), Forklift, Docks (vans + trucks), People (staff + owners), Settlement (till, stamp,
// chip), Producers. It reads the model's info() each frame and its view events (stamp, doors, pick-ups ...).
// Reveal: a tap inside revealPoly toggles the see-through roof (tap = a short press without a drag, so the game's
// joystick is untouched); on a PC a hovering mouse reveals while it stays inside; the chief at the front door does too.
// Far from the camera (nearPx) everything is hidden and nothing is updated but the model.

import { Centre } from './Centre.js';
import { Racks } from './Racks.js';
import { Forklift } from './Forklift.js';
import { Docks } from './Docks.js';
import { People } from './People.js';
import { Settlement } from './Settlement.js';
import { Producers } from './Producers.js';
import { outsideDepth, inPoly, spriteImage } from './art.js';
import { lt } from '../strings.js';
import { FRAGMENTS } from '../fragments.js';

const DEPTH_FX = 31000, DEPTH_LABEL = 41000;

export class LgxView {
  constructor(host, man, opts = {}) {
    this.host = host;
    this.P = host.P;
    this.scene = host.P.world.scene;
    this.man = man;
    this.C = man.sprites.logistics_center;
    this.geo = host.geo;
    this.lang = host.lang();
    [this.bx, this.by] = host.anchor;
    this.D = this.by;
    this.fxDepth = DEPTH_FX; this.labelDepth = DEPTH_LABEL;
    this.chip = [-60, -545];
    // the counter top (between the clerk and the head of the queue) where the stamp comes down
    const q0 = this.C.customerPoints[0], ck = this.C.staffPoints[this.C.staffRoles.indexOf('clerk')];
    this.counter = [(q0[0] + ck[0]) / 2, (q0[1] + ck[1]) / 2 - 18];
    this.revealed = false; this.revealBy = null; this.hoverOut = 0;
    this.rigs = new Set();
    this.ms = 0; this.frames = 0;
    this.centre = new Centre(this, man);
    this.racks = new Racks(this, man);
    this.forklift = new Forklift(this);
    this.docks = new Docks(this);
    this.people = new People(this);
    this.settle = new Settlement(this);
    this.producers = new Producers(this);
    this.hint = null;
    this.shown = true;
    this.input();
    const info = host.model.info();
    if (!info.open) this.setShown(false);
    else if (!host.model.tut) this.showHint();
  }

  // ------------------------------------------------------------------------------------------ helpers for the parts
  outside(x, y) { return outsideDepth(x, y, this.bx, this.by, this.D, this.C.frontTest); }
  near(x, y, m = 0) {
    const r = this.P.view && this.P.view.rect ? this.P.view.rect() : null;
    if (!r) return true;
    return x > r.x - m && x < r.x + r.width + m && y > r.y - m && y < r.y + r.height + m;
  }
  /** a doll rig from the game's pool (ports.dolls) */
  rig(look, tag) {
    if (!this.P.dolls || !this.P.dolls.make) return null;
    const r = this.P.dolls.make(look, tag);
    if (r) this.rigs.add(r);
    return r;
  }
  drop(r) { if (!r) return; this.rigs.delete(r); r.destroy(); }
  sfxAt(key, x, y, vol = 1) { const s = this.P.sound; if (!s) return; if (s.at) s.at(key, x, y, { volume: vol }); else if (s.play) s.play(key, { volume: vol }); }

  // ------------------------------------------------------------------------------------------ reveal + input
  /** see-through on / off. by: 'tap' | 'hover' | 'chief' | 'api' | 'preview' */
  reveal(on, by = 'tap') {
    if (on === this.revealed) { if (on) this.revealBy = by; return; }
    this.revealed = on; this.revealBy = on ? by : null;
    this.centre.reveal(on, this.host.tune.fadeMs || this.C.reveal.fadeMs || 350);
    const m = this.host.model;
    if (on && !m.tut) { m.tut = true; this.hideHint(); if (this.P.ui && this.P.ui.toast) this.P.ui.toast(lt(this.lang, 'revealFirst'), 2600); }
    if (this.P.emit) this.P.emit({ t: 'lgx:reveal', on, by });
  }
  inPoly(x, y) { return inPoly(x - this.bx, y - this.by, this.C.revealPoly); }
  /** a tap at a world point (the feed's `tap`, or the scene's own pointer) */
  tapAt(x, y) { if (this.shown && this.host.model.open && this.inPoly(x, y)) { this.reveal(!this.revealed, 'tap'); return true; } return false; }
  input() {
    const inp = this.scene.input;
    if (!inp) return;
    this.onDown = (p) => { this.downAt = { x: p.x, y: p.y, t: p.downTime || 0 }; };
    this.onUp = (p) => {
      const d = this.downAt; this.downAt = null;
      if (!d || Math.hypot(p.x - d.x, p.y - d.y) > 14 || (p.upTime || 0) - d.t > 350) return;
      const wp = p.positionToCamera ? p.positionToCamera(this.scene.cameras.main) : { x: p.worldX, y: p.worldY };
      this.tapAt(wp.x, wp.y);
    };
    this.onMove = (p) => {
      if (p.isDown || (p.pointerType && p.pointerType !== 'mouse') || p.wasTouch) return;
      const wp = p.positionToCamera ? p.positionToCamera(this.scene.cameras.main) : { x: p.worldX, y: p.worldY };
      const ins = this.shown && this.inPoly(wp.x, wp.y);
      if (ins && !this.revealed) this.reveal(true, 'hover');
      this.hoverIn = ins;
    };
    // the mouse leaving the canvas counts as leaving the roof
    this.onOut = () => { this.hoverIn = false; };
    inp.on('pointerdown', this.onDown); inp.on('pointerup', this.onUp); inp.on('pointermove', this.onMove); inp.on('gameout', this.onOut);
  }
  showHint() {
    const sc = this.scene;
    if (this.hint) return;
    // over the middle of the roof (where a tap opens it), clear of the chip above the ridge
    const im = spriteImage(sc, 'ui_arrow', this.bx + 10, this.by - 300);
    if (!im) return;
    im.setDepth(DEPTH_LABEL + 5).setOrigin(0.5, 1);
    this.hint = im;
    this.hintTw = sc.tweens.add({ targets: im, y: im.y - 26, yoyo: true, repeat: -1, duration: 520, ease: 'Sine.easeInOut' });
  }
  hideHint() { if (this.hintTw) this.hintTw.stop(); if (this.hint) this.hint.destroy(); this.hint = null; }

  /** the centre opened (built): show it, the tap hint and the tutorial toast */
  opened() {
    this.setShown(true);
    this.showHint();
    const mobile = !(this.scene.sys.game.device && this.scene.sys.game.device.os && this.scene.sys.game.device.os.desktop);
    if (this.P.ui && this.P.ui.toast) this.scene.time.delayedCall(2600, () => this.P.ui.toast(lt(this.lang, mobile ? 'tapHint' : 'hoverHint'), 3200));
  }
  focus() { if (this.P.view && this.P.view.focus) this.P.view.focus(this.bx + 60, this.by - 120, 900); }

  // ------------------------------------------------------------------------------------------ producers (from the host)
  producerAdded(p, pos) { if (pos) this.producers.add(p, pos); }

  // ------------------------------------------------------------------------------------------ frame
  setShown(on) {
    if (on === this.shown) return;
    this.shown = on;
    this.centre.setVisible(on); this.racks.setVisible(on && this.centre.insideOn); this.forklift.setVisible(on); this.docks.setVisible(on);
    this.people.setVisible(on); this.settle.setVisible(on);
    // the producers stand on their own M plots: they keep their own visibility (Producers.update)
    if (!on) for (const r of this.rigs) if (!this.producers.owns(r)) r.visible(false);
  }

  update(dt, events) {
    const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);
    const m = this.host.model;
    const info = m.info();
    const near = info.open && this.near(this.bx, this.by - 200, this.host.tune.nearPx - 700);
    // the producers (village M plots, anywhere) draw themselves when they are on screen
    this.producers.update(dt, info.producers);
    // the chief at the front door: the roof comes off while he is there
    const ch = this.P.chief;
    if (ch && ch.x && info.open) {
      const d = Math.hypot(ch.x() - (this.bx + this.geo.door[0]), (ch.y() - (this.by + this.geo.door[1])) * 2);
      if (d < 90 && !this.revealed) this.reveal(true, 'chief');
      else if (d > 170 && this.revealed && this.revealBy === 'chief') this.reveal(false);
    }
    // hover: the roof stays off while the mouse is inside (a short grace when it leaves)
    if (this.revealed && this.revealBy === 'hover') {
      if (this.hoverIn) this.hoverOut = 0; else { this.hoverOut += dt; if (this.hoverOut > 0.35) this.reveal(false); }
    }
    // far away: hidden (and a tap-reveal closes quietly so the inside pages can leave memory)
    if (!near) {
      if (this.shown) this.setShown(false);
      this.farT = (this.farT || 0) + dt;
      if (this.revealed && this.farT > 5) { this.revealed = false; this.revealBy = null; this.centre.setShell(1); }
      for (const ev of events) void ev;
      this.sound(false, false);
      this.ms += ((typeof performance !== 'undefined' ? performance.now() : 0) - t0); this.frames++;
      return;
    }
    this.farT = 0;
    if (!this.shown) this.setShown(true);
    this.wantArt(info);
    const night = this.P.clock && this.P.clock.dark ? this.P.clock.dark() : 0;
    for (const ev of events) this.onEvent(ev, info);
    this.centre.update(dt, info);
    const inside = this.centre.insideOn;
    this.racks.setVisible(inside);
    if (inside) this.racks.draw(m.rackFill(), info.stockVer, false);
    this.forklift.update(dt, info.forklift, inside);
    this.docks.update(dt, info.vehicles, night);
    this.people.update(dt, info, inside);
    this.settle.update(dt, info);
    this.sound(true, inside);
    this.ms += ((typeof performance !== 'undefined' ? performance.now() : 0) - t0); this.frames++;
  }

  onEvent(ev, info) {
    const inside = this.centre.insideOn;
    switch (ev.t) {
      case 'stamp': this.settle.stamp(inside); break;
      case 'settle':
        if (ev.op === 'start') this.settleAgent = ev.agent;
        break;
      case 'fork':
        if (ev.op === 'drop' && ev.at === 'rack') this.sfxAt('sfx_box_drop_3', this.bx + 150, this.by, 0.35);
        break;
      case 'pickup': {
        const v = info.vehicles.find((q) => q.id === ev.veh);
        this.producers.pickup(ev.producer, v ? [this.bx + v.pos[0], this.by + v.pos[1]] : null);
        break;
      }
      default: break;
    }
  }
  /** model events about money come through the host (lgx:settle): coins + thanks */
  settled(ev) {
    const inside = this.centre.insideOn;
    if (ev.kind === 'home') return;
    const a = this.settleAgent;
    this.settle.coinsFly(ev.coins, inside, a ? this.people.ownerAt(a) : null);
    this.scene.time.delayedCall(250, () => this.settle.thanks(a ? this.people.ownerAt(a) : null));
  }
  collected(n) { this.settle.collected(n); }

  /** ambience: the warehouse hum while near (louder with the roof off) */
  sound(near, inside) {
    const s = this.P.sound;
    if (!s || !s.ambience) return;
    const v = !near ? 0 : inside ? 0.85 : 0.35;
    if (v !== this.ambV) { this.ambV = v; s.ambience('amb_warehouse', v); }
  }
  /** Residency hints: the shell pages while near, the inside pages while they are drawn */
  wantArt(info) {
    const a = this.P.assets;
    if (!a || !a.want) return;
    const inside = this.centre.insideOn;
    const k = (inside ? 2 : 1) + (info.vehicles.length ? 4 : 0);
    if (k === this.wantK) return;
    this.wantK = k;
    const keys = FRAGMENTS.logistics.always.concat(inside ? FRAGMENTS.logistics.inside : [], info.vehicles.length ? FRAGMENTS.logistics.vehicles : []);
    a.want(keys);
  }

  info() {
    return {
      msView: this.frames ? this.ms / this.frames : 0, revealed: this.revealed, inside: this.centre.insideOn, shown: this.shown,
      stock: this.racks.count(), vehicles: this.docks.count(), people: this.people.count(), rigs: this.rigs.size, producers: this.producers.count(),
    };
  }
  destroy() {
    const inp = this.scene.input;
    if (inp) { inp.off('pointerdown', this.onDown); inp.off('pointerup', this.onUp); inp.off('pointermove', this.onMove); inp.off('gameout', this.onOut); }
    this.hideHint();
    for (const p of [this.centre, this.racks, this.forklift, this.docks, this.people, this.settle, this.producers]) p.destroy();
    for (const r of this.rigs) r.destroy();
    this.rigs.clear();
  }
}
