// (v4.2, docs/v42_plan.md §4.4) 화물 썰매 — the pony cargo sleigh (assets/vehicles `cargo_sleigh`) that carries the
// surplus the train cannot from the station's 짐 싣는 곳 to the 물류창고's dock bay 2 along WORLD.v42.sleighRoute
// (lattice points on the streets: 역앞 거리 -> 중앙로 -> ave_s -> bank_st -> lgx_dock), U-turns on the apron, and
// trots back. The route is axis-aligned, so the art's two dirs (SE = +i, NE = +j, mirrored for −) cover it.
//   states: wait (at the stop) -> load (depot.sleigh.loadS) -> go -> unload -> back -> wait
//   the train first (§4.4): the sleigh takes only the dock surplus beyond the next train's free room
//   model:  load = [{ ty, n }] (what rides), saved in v42.depot.load (goods on the sleigh return to the dock on reload)

import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { WORLD, L4 } from '../data/world.js';
import { BALANCE } from '../data/balance.js';

const PX_PER_M = 64 / Math.SQRT2;    // one lattice cell = √2 m = (64, 32) px

export class CargoSleigh {
  constructor(gs, sys, index) {
    this.gs = gs; this.sys = sys; this.index = index || 0;
    this.pts = (WORLD.v42.sleighRoute || []).map(([i, j]) => ({ i, j }));
    this.s = 0;                 // position along the route (cells), 0 = the stop
    this.len = 0;
    for (let k = 1; k < this.pts.length; k++) this.len += Math.hypot(this.pts[k].i - this.pts[k - 1].i, this.pts[k].j - this.pts[k - 1].j);
    this.state = 'wait';
    this.t = 0;
    this.load = [];
    this.trips = 0;
    Assets.loadFragment(gs, 'vehicles', { only: ['veh_cargo_sleigh'] });
    this.spr = gs.add.sprite(-9999, -9999, '__WHITE').setVisible(false);
    this.crates = [];
    for (let k = 0; k < 6; k++) this.crates.push(gs.add.image(-9999, -9999, '__WHITE').setVisible(false));
    this.dir = 'SE'; this.flip = false; this.anim = '';
    this.ready = false;
  }

  /** the dock surplus the next train cannot take (the train first: its free room after the order-card crates stays) */
  spare(F) {
    const G = this.gs.v4 && this.gs.v4.growth;
    const keep = Math.max(0, F.cap() - Math.max(0, Number(G && G.cargo) || 0));
    return Math.max(0, F.dockCount() - keep);
  }

  get B() { return (BALANCE.v42 && BALANCE.v42.depot && BALANCE.v42.depot.sleigh) || { cap: 60, speed: 2.5, loadS: 8 }; }
  count() { return this.load.reduce((a, q) => a + q.n, 0); }

  /** lattice point + heading at route distance s (cells) */
  at(s) {
    let left = Math.max(0, Math.min(this.len, s));
    for (let k = 1; k < this.pts.length; k++) {
      const a = this.pts[k - 1], b = this.pts[k], L = Math.hypot(b.i - a.i, b.j - a.j);
      if (left <= L || k === this.pts.length - 1) { const f = L > 0 ? Math.min(1, left / L) : 0; return { i: a.i + (b.i - a.i) * f, j: a.j + (b.j - a.j) * f, di: Math.sign(b.i - a.i), dj: Math.sign(b.j - a.j) }; }
      left -= L;
    }
    return { i: this.pts[0].i, j: this.pts[0].j, di: 1, dj: 0 };
  }

  update(dt) {
    const gs = this.gs, F = gs.v42 && gs.v42.freight, B = this.B;
    const v = (Number(B.speed) || 2.5) / Math.SQRT2;       // cells per second
    this.t += dt;
    switch (this.state) {
      case 'wait': {
        // the train takes first while it stands at our station; the rest rides the sleigh
        const trainIn = F && F.trainIn();
        // (썰매 한 대 더: one sleigh loads at a time; the other waits its turn behind it)
        const other = this.sys.sleighs.some((o) => o !== this && o.state === 'load');
        if (F && this.spare(F) > 0 && !trainIn && !other && this.sys.room() > 0 && this.t > 3) { this.state = 'load'; this.t = 0; }
        break;
      }
      case 'load': {
        if (this.t >= (Number(B.loadS) || 8)) {
          const n = Math.min(Number(B.cap) || 60, this.sys.room(), F ? this.spare(F) : 0);
          this.load = F && n > 0 ? F.takeSurplus(n) : [];
          this.state = this.count() > 0 ? 'go' : 'wait';
          this.t = 0;
          if (this.count() > 0 && gs.isOnScreen(this.x, this.y, 300) && Audio.exists('sfx_sleigh_bells')) Audio.play('sfx_sleigh_bells', { volume: 0.6 });
        }
        break;
      }
      case 'go': { this.s += v * dt; if (this.s >= this.len) { this.s = this.len; this.state = 'unload'; this.t = 0; } break; }
      case 'unload': {
        if (this.t >= 3) {
          const back = this.sys.unload(this.load);
          this.load = back;               // what did not fit rides back to the dock
          this.trips++;
          this.state = 'back'; this.t = 0;
        }
        break;
      }
      case 'back': {
        this.s -= v * dt;
        if (this.s <= 0) { this.s = 0; this.state = 'wait'; this.t = 0; if (this.load.length && F) { for (const q of this.load) F.addSurplus(q.ty, q.n); this.load = []; } }
        break;
      }
      default: this.state = 'wait';
    }
    this.draw();
  }

  draw() {
    const gs = this.gs;
    const p = this.at(this.s);
    // (two sleighs at the stop: the later one waits a sled length behind, toward the station)
    const queued = this.s <= 0 && (this.state === 'wait' || this.state === 'load') && this.sys.sleighs.some((o) => o !== this && o.index < this.index && o.s <= 0 && (o.state === 'wait' || o.state === 'load'));
    const [x, y] = L4(p.i - (queued ? 1.4 : 0), p.j);
    this.x = x; this.y = y;
    const onScreen = gs.isOnScreen(x, y, 300);
    // ((robust review H3) Residency takes the sleigh's page out of memory while the camera is far from its lanes:
    //  build its anims again when the page is back)
    if (this.ready && !Assets.texOf('veh_cargo_sleigh')) { this.ready = false; this.anim = null; }
    if (!this.ready) { if (Assets.texOf('veh_cargo_sleigh')) { Assets.buildCharacter(gs.game, 'cargo_sleigh'); const d = Assets.charDef('cargo_sleigh'); this.spr.setOrigin(d.anchor[0], d.anchor[1]); this.ready = true; this.anim = null; } }
    const show = onScreen && this.ready;
    if (this.spr.visible !== show) this.spr.setVisible(show);
    for (const c of this.crates) if (!show && c.visible) c.setVisible(false);
    if (!show) return;
    // heading: going = along the route, back = against it
    const sgn = this.state === 'back' ? -1 : 1;
    const di = p.di * sgn, dj = p.dj * sgn;
    let dir = 'SE', flip = false;
    if (Math.abs(di) >= Math.abs(dj)) { dir = 'SE'; flip = di < 0; } else { dir = 'NE'; flip = dj < 0; }
    // (the art: SE = +i, NE = +j; −i = NW = mirrored NE, −j = SW = mirrored SE)
    if (dir === 'SE' && flip) { dir = 'NE'; } else if (dir === 'NE' && flip) { dir = 'SE'; }
    const moving = this.state === 'go' || this.state === 'back';
    const want = 'cargo_sleigh:' + (moving ? 'move' : 'idle') + ':' + dir;
    if (want !== this.anim && gs.anims.exists(want)) { this.anim = want; this.spr.anims.play(want); }
    this.spr.setFlipX(flip).setPosition(x, y).setDepth(y);
    // crates on the sled (one per 10 items)
    const n = Math.min(6, Math.ceil(this.count() / 10));
    const tex = Assets.has('crate') ? Assets.texOf(Assets.def('crate').atlas, 'crate') : null;
    this.crates.forEach((c, k) => {
      const on = k < n && !!tex;
      if (c.visible !== on) c.setVisible(on);
      if (!on) return;
      if (c.texture.key !== tex) c.setTexture(tex, 'crate').setOrigin(0.375, 0.58).setDisplaySize(30, 28);
      c.setPosition(x + (flip ? 1 : -1) * (20 + (k % 3) * 14), y - 42 - Math.floor(k / 3) * 15).setDepth(y + 1 + k * 0.01);
    });
  }

  stateText() { return this.state === 'load' ? 'sleigh_load' : this.state === 'go' ? 'sleigh_go' : this.state === 'unload' ? 'sleigh_unload' : this.state === 'back' ? 'sleigh_back' : 'sleigh_wait'; }

  destroy() { this.spr.destroy(); for (const c of this.crates) c.destroy(); }
}

export { PX_PER_M };
