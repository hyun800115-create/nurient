// VehicleSprite (vehicles_runtime view): one vehicle drawn the manifest's way — a soft ellipse shadow on the
// ground, the body frame (2 rendered headings + flipX mirrors), the people inside at their seats (seatDrawOrder;
// `sit` facing front, `idle` at seatsStand for the back views), then the overlay frame (doors / window frames in
// front of the passengers). The driver is always there (baked on the chief's truck). Night: lamp glows + beams.
// Steam / breath / exhaust puffs and snow kicked up by runners. Pooled: the view re-points it at another vehicle.

import { Assets } from '../../core/Assets.js';
import { DEPTH } from '../../systems/DepthSort.js';
import { baseDir, shadowTex, glowTex, frameOf } from './art.js';

const SLED = new Set(['horse_sleigh_bus', 'cargo_sleigh', 'dog_sled']);
const BUS = new Set(['horse_sleigh_bus', 'retro_bus']);

export class VehicleSprite {
  constructor(view) {
    this.view = view;
    const sc = this.scene = view.scene;
    this.shadow = sc.add.image(0, 0, shadowTex(sc)).setDepth(DEPTH.SHADOW + 2).setVisible(false);
    this.body = sc.add.sprite(0, 0, '__WHITE').setVisible(false);
    this.over = sc.add.image(0, 0, '__WHITE').setVisible(false);
    this.glows = [];
    this.seated = new Map();          // seat index -> { rig, who }
    this.key = null; this.vid = 0; this.anim = ''; this.dk = '';
    this.alpha = 1; this.fade = 0;
    this.puffT = Math.random(); this.kickT = 0; this.breathT = Math.random() * 2;
    glowTex(sc);
  }

  /** point the sprite at a vehicle art key */
  setKey(key) {
    if (this.key === key) return;
    this.key = key;
    const game = this.scene.game;
    if (!Assets.built[key]) Assets.buildCharacter(game, key);
    this.def = Assets.charDef(key);
    const a = this.def.anchor || [0.5, 0.7];
    this.body.setOrigin(a[0], a[1]);
    this.over.setOrigin(a[0], a[1]);
    this.anim = ''; this.dk = '';
    this.clearSeats();
  }

  // ------------------------------------------------------------------------------------------ per frame
  /**
   * v: the model vehicle (x, y, dk, v, state, riders...) or a parked car { x, y, dk };
   * o: { night 0..1, parked, riders: [{ pid, look }], chief: bool, driver: look | null, speedRef, dt, alpha }
   */
  sync(v, o) {
    const def = this.def;
    if (!def) return;
    const { base, flip } = baseDir(v.dk || 'SE');
    const sx = flip ? -1 : 1;
    const x = v.x, y = v.y;
    const moving = !o.parked && v.v > 0.12;
    const anim = moving ? 'move' : 'idle';
    // body
    if (anim !== this.anim || base !== this.dk) {
      const k = Assets.charAnim(this.key, anim, base);
      this.body.play(k, true);
      this.anim = anim; this.dk = base;
      if (o.parked) { this.body.anims.pause(); }
    }
    this.body.setFlipX(flip);
    if (moving) this.body.anims.timeScale = Math.max(0.45, Math.min(1.5, v.v / Math.max(0.5, o.speedRef || 4)));
    else this.body.anims.timeScale = 1;
    const a = (o.alpha !== undefined ? o.alpha : 1) * this.alpha;
    this.body.setVisible(true).setPosition(x, y).setDepth(y).setAlpha(a);
    // shadow: a rotated soft ellipse along the heading
    const sh = (def.shadow && def.shadow[base]) || [def.frameSize ? def.frameSize[0] * 0.8 : 200, 60, base === 'SE' ? 26.57 : -26.57];
    this.shadow.setVisible(true).setPosition(x, y + 2).setDisplaySize(sh[0], sh[1] * 1.15).setAngle(flip ? -sh[2] : sh[2]).setAlpha(Math.min(1, a * 1.1));
    // people inside, then the overlay in front of them
    const fr = this.body.anims.currentFrame;
    const fname = fr ? fr.textureFrame : null;
    const bob = fr && def.anims[anim] && def.anims[anim].bobPx ? (def.anims[anim].bobPx[(fr.index || 1) - 1] || 0) : 0;
    const people = this.seatPeople(v, o, base, flip, x, y + bob, sx, a);
    if (people && def.overlay && fname) {
      const f = frameOf(def.overlay.atlas, 'over_' + fname);
      if (f) { this.over.setTexture(f.tex, f.frame).setVisible(true).setFlipX(flip).setPosition(x, y).setDepth(y + 0.004).setAlpha(a); }
      else this.over.setVisible(false);
    } else this.over.setVisible(false);
    // lamps at night (and the bus's lanterns at dusk)
    this.lamps(o.night || 0, base, flip, x, y, sx, a, moving, o.parked);
    // puffs and snow
    if (!o.parked && o.dt) this.effects(v, o.dt, base, sx, x, y, moving);
  }

  /** draw the driver + up to N passengers; true when anyone is drawn */
  seatPeople(v, o, base, flip, x, y, sx, a) {
    const def = this.def;
    const seats = def.seats && def.seats[base];
    if (!seats || !this.view.dollsOn()) { this.clearSeats(); return false; }
    const want = new Map();          // seat index -> { who, look, kind }
    const driver = def.driverSeat;
    if (o.chief && SLED.has(this.key) && driver !== null && driver !== undefined) want.set(driver, { who: 'chief', chief: true });
    else if (driver !== null && driver !== undefined && !o.parked) want.set(driver, { who: 'driver:' + this.vid, look: o.driver });
    else if (driver !== null && driver !== undefined && o.parked && o.showDriver) want.set(driver, { who: 'driver:' + this.vid, look: o.driver });
    const free = [];
    for (let i = 0; i < seats.length; i++) if (!want.has(i) && i !== driver) free.push(i);
    // the chief by a window (a bus ride), then the riders
    if (o.chief && !SLED.has(this.key) && free.length) want.set(free.shift(), { who: 'chief', chief: true });
    const max = Math.min(free.length, this.view.maxPassengers());
    const R = o.riders || [];
    for (let i = 0; i < Math.min(max, R.length); i++) want.set(free[i], { who: R[i].pid, look: R[i].look });
    // release seats whose occupant changed
    for (const [si, s] of this.seated) { const w = want.get(si); if (!w || w.who !== s.who) { this.view.dropRig(s); this.seated.delete(si); } }
    if (!want.size) return false;
    const order = (def.seatDrawOrder && def.seatDrawOrder[base]) || Array.from(want.keys());
    const back = base === 'NE';
    const dir = flip ? (back ? 'NW' : 'SW') : (back ? 'NE' : 'SE');
    let n = 0;
    for (const si of order) {
      const w = want.get(si);
      if (!w) continue;
      let s = this.seated.get(si);
      if (!s) { s = this.view.takeRig(w); if (!s) continue; s.who = w.who; this.seated.set(si, s); }
      const sit = !back && !w.chief && s.canSit !== false;
      const pt = (sit ? seats : (def.seatsStand && def.seatsStand[base]) || seats)[si];
      if (!pt) continue;
      s.rig.play(sit ? 'sit' : 'idle', dir);
      s.rig.place(x + pt[0] * sx, y + pt[1], y + 0.001 + n * 0.0004, a);
      n++;
    }
    return n > 0;
  }

  clearSeats() { for (const s of this.seated.values()) this.view.dropRig(s); this.seated.clear(); }

  lamps(night, base, flip, x, y, sx, a, moving, parked) {
    const def = this.def;
    const pts = [];
    if (night > 0.05 && !parked) {
      for (const p of (def.lightPoints && def.lightPoints[base]) || []) pts.push({ p, warm: true, k: SLED.has(this.key) ? 1.1 : 0.8 });
      for (const p of (def.tailPoints && def.tailPoints[base]) || []) pts.push({ p, warm: false, k: 0.5 });
    }
    while (this.glows.length < pts.length) this.glows.push(this.scene.add.image(0, 0, 'veh_glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.FX - 28).setVisible(false));
    const front = base === 'SE';            // the headlamps face the camera in SE / SW
    for (let i = 0; i < this.glows.length; i++) {
      const g = this.glows[i], q = pts[i];
      if (!q) { if (g.visible) g.setVisible(false); continue; }
      g.setVisible(true).setPosition(x + q.p[0] * sx, y + q.p[1]).setScale(q.k * (q.warm && front && !SLED.has(this.key) ? 1.25 : 1)).setTint(q.warm ? 0xfff0c8 : 0xff6a5a).setAlpha(Math.min(0.95, night * 1.6) * a * (q.warm ? 1 : 0.8));
    }
    void moving;
  }

  effects(v, dt, base, sx, x, y, moving) {
    const def = this.def, view = this.view;
    if (!view.near(x, y)) return;
    // steam (the wagon's chimney), the horses' breath, exhaust in the cold
    this.puffT -= dt;
    if (this.puffT <= 0) {
      const sp = def.steamPoint && def.steamPoint[base];
      if (this.key === 'steam_wagon' && sp) { view.puff(x + sp[0] * sx, y + sp[1], 52, y + 1); this.puffT = moving ? 0.45 : 1.1; }
      else if (def.exhaustPoint && def.exhaustPoint[base]) { const e = def.exhaustPoint[base]; view.puff(x + e[0] * sx, y + e[1], 26, y - 0.5); this.puffT = moving ? 0.9 : 1.6; }
      else this.puffT = 2;
    }
    if (this.key === 'horse_sleigh_bus' || this.key === 'cargo_sleigh') {
      this.breathT -= dt;
      const sp = def.steamPoint && def.steamPoint[base];
      if (this.breathT <= 0 && sp) { view.puff(x + sp[0] * sx, y + sp[1], 24, y + 1); this.breathT = 1.8 + Math.random() * 1.2; }
    }
    // runners and paws kick up snow
    if (SLED.has(this.key) && moving) {
      this.kickT -= dt;
      if (this.kickT <= 0) {
        // behind the runners (the rear of the body) and under the paws / hooves (the front)
        this.kickT = 0.3;
        const hx = v.hx || 0, hy = v.hy || 0, m = Math.hypot(hx, 2 * hy) / 64 || 1, k = ((v.len || 4) / 2) / m;
        const f = this.kick2 = !this.kick2;
        const t = f ? -0.9 : 0.75;
        view.kick(x + hx * k * t + (Math.random() - 0.5) * 14, y + hy * k * t + 3);
      }
    }
  }

  hide() {
    this.body.setVisible(false); this.over.setVisible(false); this.shadow.setVisible(false);
    for (const g of this.glows) g.setVisible(false);
    this.clearSeats();
    this.vid = 0;
  }

  objects() { return 3 + this.glows.length; }
  destroy() { this.hide(); this.body.destroy(); this.over.destroy(); this.shadow.destroy(); for (const g of this.glows) g.destroy(); this.glows = []; }
}

export { BUS, SLED };
