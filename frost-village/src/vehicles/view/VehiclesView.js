// VehiclesView (vehicles_runtime view): draws the model. Vehicles near the view get a pooled VehicleSprite (≤ 12,
// nearest first); parked cars near the view a light one; stops / depots / the yard / lights are Statics; the UI
// scene shows the TransitChip and the DriveHUD. It also plays the module's little moments: goods flying from a
// truck bed onto a shelf, depot doors, the chief getting on a bus (the camera follows the bus), the delivery pin,
// horns and bells, and the 도시 ceremony's part (lights pop, buses swap, the banner).

import { Assets } from '../../core/Assets.js';
import { DEPTH } from '../../systems/DepthSort.js';
import { VehicleSprite, SLED } from './VehicleSprite.js';
import { Statics } from './Statics.js';
import { TransitChip } from './TransitChip.js';
import { DriveHUD } from './DriveHUD.js';
import { vt } from '../strings.js';

const DRIVER_PRESET = { bus: 'station', freight: 'factory', porter: 'postal', dispatch: 'factory', extra: null, car: null, retire: 'station' };

export class VehiclesView {
  constructor(host, ports) {
    this.host = host;
    this.ports = ports;
    this.scene = ports.world.scene;
    this.ui = ports.ui && ports.ui.scene ? ports.ui.scene : null;
    this.cfg = host.cfg;
    this.pool = [];                   // free VehicleSprites
    this.active = new Map();          // vehicle id -> sprite
    this.parked = new Map();          // car pid -> sprite
    this.rigFree = [];                // spare doll rigs { rig, kind }
    this.drivers = new Map();         // vehicle id -> look of its driver
    this.fades = new Map();           // vehicle id -> fade-in timer
    this.statics = new Statics(this);
    this.statics.build();
    this.chip = this.ui ? new TransitChip(this) : null;
    this.hud = this.ui ? new DriveHUD(this) : null;
    this.pin = null;
    this.flying = [];
    this.horn = -99;
    this.rideBus = 0;
    this.lastLoops = {};
    this.stats = { drawn: 0, parked: 0, rigs: 0, waiting: 0 };
    this.ready = new Set();           // vehicle keys whose atlas is here (anims built)
  }

  /**
   * is this vehicle's art here? (a late atlas: the era's vehicles, the palette's cars). Not yet: ask the host for it
   * and draw nothing for that vehicle meanwhile (never a placeholder)
   */
  artReady(key) {
    if (this.ready.has(key)) return true;
    const def = Assets.charDef(key);
    const a = def && def.atlas;
    if (!a) return false;
    if (!Assets.texOf(a)) { this.host.wantArt([a]); this.stats.waiting++; return false; }
    if (!Assets.built[key] || (Assets.charReady && !Assets.charReady(key))) Assets.buildCharacter(this.scene.game, key);
    this.ready.add(key);
    return true;
  }

  // ------------------------------------------------------------------------------------------ helpers
  zoom() { return this.ports.view && this.ports.view.zoom ? this.ports.view.zoom() : 1; }
  rect() { const r = this.ports.view && this.ports.view.rect ? this.ports.view.rect() : null; return r || { x: -1e9, y: -1e9, width: 2e9, height: 2e9 }; }
  near(x, y, m = 200) { const r = this.rect(); return x > r.x - m && x < r.x + r.width + m && y > r.y - m && y < r.y + r.height + m; }
  dollsOn() { return !!(this.ports.dolls && this.ports.dolls.make); }
  maxPassengers() { const p = this.cfg.budget && this.cfg.budget.passengersDrawn; return p === undefined || p === null ? 4 : p; }
  night() { return this.ports.clock && this.ports.clock.night ? this.ports.clock.night() : 0; }

  /** a doll rig for a seat (pooled): w = { who, look, chief } */
  takeRig(w) {
    const D = this.ports.dolls;
    if (w.chief) { const r = D.chief ? D.chief() : null; return r ? { rig: r, kind: 'chief', canSit: false } : null; }
    let s = this.rigFree.pop();
    if (s) { s.rig.setLook(w.look); s.rig.visible(true); }
    else { const rig = D.make(w.look); if (!rig) return null; s = { rig, kind: 'doll' }; }
    this.stats.rigs++;
    return s;
  }
  dropRig(s) {
    if (!s) return;
    if (s.kind === 'chief') { s.rig.visible(false); return; }
    s.rig.visible(false);
    this.stats.rigs = Math.max(0, this.stats.rigs - 1);
    if (this.rigFree.length < 10) this.rigFree.push(s); else s.rig.destroy();
  }

  puff(x, y, size, depth) { const F = this.ports.fx; if (F && F.puff) F.puff(x, y, size, depth); else if (F && F.sheet) F.sheet('fx_smoke_puff', x, y, { size, depth }); }
  kick(x, y) { const F = this.ports.fx; if (F && F.kick) F.kick(x, y); else if (F && F.burst) F.burst('snowhit', x, y, 2); }
  sound(key, x, y, opts) { const S = this.ports.sound; if (!S) return; if (x !== undefined && S.at) S.at(key, x, y, opts || {}); else if (S.play) S.play(key, opts || {}); }

  // ------------------------------------------------------------------------------------------ frame
  update(dt) {
    const m = this.host.model;
    const r = this.rect();
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const margin = 320;
    const night = this.night();
    const riding = m.transit.riding();
    const chiefBus = riding ? riding.bus : 0;
    const driveV = m.chief.vehicle();
    // which vehicles get a sprite: on (or near) the screen, nearest first, ≤ budget
    const want = [];
    for (const v of m.sim.list) {
      if (v.state === 'hidden') continue;
      if (!v.path && v.state !== 'bay') continue;
      if (v.x < r.x - margin || v.x > r.x + r.width + margin || v.y < r.y - margin || v.y > r.y + r.height + margin) continue;
      if (!this.artReady(v.key)) continue;
      want.push(v);
    }
    want.sort((a, b) => Math.hypot(a.x - cx, (a.y - cy) * 2) - Math.hypot(b.x - cx, (b.y - cy) * 2));
    const max = (this.cfg.budget && this.cfg.budget.materialised) || 12;
    const keep = new Set();
    for (let i = 0; i < Math.min(max, want.length); i++) keep.add(want[i].id);
    if (chiefBus) keep.add(chiefBus);
    if (driveV) keep.add(driveV.id);
    for (const [id, s] of this.active) if (!keep.has(id)) { s.hide(); this.pool.push(s); this.active.delete(id); }
    for (const v of want) {
      if (!keep.has(v.id)) continue;
      let s = this.active.get(v.id);
      if (!s) { s = this.pool.pop() || new VehicleSprite(this); s.setKey(v.key); s.vid = v.id; this.active.set(v.id, s); }
      else if (s.key !== v.key) s.setKey(v.key);
      let a = 1;
      const f = this.fades.get(v.id);
      if (f !== undefined) { const t = f + dt; if (t >= 0.5) this.fades.delete(v.id); else this.fades.set(v.id, t); a = Math.min(1, t / 0.5); }
      s.sync(v, { night, riders: v.riders, chief: v.id === chiefBus || (driveV && v.id === driveV.id && SLED.has(v.key)), driver: this.driverLook(v), speedRef: v.vmax, dt, alpha: a });
    }
    this.stats.drawn = this.active.size;
    // parked cars near the view (a frame, a shadow; no driver)
    const seen = new Set();
    let np = 0;
    for (const c of m.fleet.parked()) {
      if (c.x < r.x - 200 || c.x > r.x + r.width + 200 || c.y < r.y - 200 || c.y > r.y + r.height + 200 || np >= 12) continue;
      if (!this.artReady(c.key)) continue;
      np++;
      seen.add(c.pid);
      let s = this.parked.get(c.pid);
      if (!s) { s = this.pool.pop() || new VehicleSprite(this); s.setKey(c.key); s.vid = -1; this.parked.set(c.pid, s); }
      else if (s.key !== c.key) s.setKey(c.key);
      s.sync({ x: c.x, y: c.y, dk: c.dk, v: 0 }, { night, parked: true, dt });
    }
    for (const [pid, s] of this.parked) if (!seen.has(pid)) { s.hide(); this.pool.push(s); this.parked.delete(pid); }
    this.stats.parked = this.parked.size;
    // rigs animate (dolls tick their frames)
    for (const s of this.active.values()) for (const seat of s.seated.values()) seat.rig.update(dt);
    this.statics.update(dt);
    if (this.chip) this.chip.update();
    if (this.hud) this.hud.update();
    this.updatePin(dt);
    this.updateFlying(dt);
    this.followRide(chiefBus);
    this.loops(dt);
  }

  driverLook(v) {
    let l = this.drivers.get(v.id);
    if (l === undefined) { l = { preset: DRIVER_PRESET[v.role] || null, seed: v.id * 7919 + 17, pid: v.pid || null }; this.drivers.set(v.id, l); }
    return l;
  }

  /** the camera follows the bus the chief rides; he reappears at the stop he gets off at */
  followRide(busId) {
    const P = this.ports;
    if (busId === this.rideBus) return;
    if (busId && !this.rideBus) { if (P.chief && P.chief.hide) P.chief.hide(true); }
    this.rideBus = busId;
    if (P.view && P.view.follow) P.view.follow(busId ? () => { const v = this.host.model.sim.get(busId); return v ? { x: v.x, y: v.y - 60 } : null; } : null);
  }

  /** the delivery pin over the next stop: a bouncing pink drop and a ring on the ground */
  updatePin(dt) {
    const st = this.host.model.chief.state();
    if (!st.active || !st.next) { if (this.pin) { this.pin.destroy(); this.pin = null; } return; }
    if (!this.pin) {
      const g = this.scene.add.graphics().setDepth(DEPTH.FX - 20);
      this.pin = g; this.pinT = 0;
    }
    this.pinT += dt;
    const g = this.pin, x = st.next.x, y = st.next.y, b = Math.abs(Math.sin(this.pinT * 4)) * 18;
    g.clear();
    g.lineStyle(6, 0xff5c9a, 0.85); g.strokeEllipse(x, y, 130 + 10 * Math.sin(this.pinT * 4), 64 + 5 * Math.sin(this.pinT * 4));
    g.fillStyle(0xffffff, 1); g.fillCircle(x, y - 110 - b, 24);
    g.fillStyle(0xff5c9a, 1); g.fillCircle(x, y - 110 - b, 19);
    g.fillTriangle(x - 15, y - 100 - b, x + 15, y - 100 - b, x, y - 72 - b);
    g.fillStyle(0xffffff, 1); g.fillCircle(x, y - 110 - b, 7);
  }

  /** goods fly from the bed to their shelf (≤ 6 icons) */
  flyItems(items, from, to) {
    let k = 0;
    for (const it in items) {
      const n = Math.min(3, items[it]);
      for (let i = 0; i < n && k < 6; i++, k++) {
        if (!Assets.has(it)) continue;
        const im = Assets.image(this.scene, from.x, from.y, it).setDepth(DEPTH.FLY).setScale(0.55);
        this.flying.push({ im, t: -k * 0.12, d: 0.6, ax: from.x, ay: from.y, bx: to.x, by: to.y });
      }
    }
  }
  updateFlying(dt) {
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      f.t += dt;
      if (f.t < 0) continue;
      const p = Math.min(1, f.t / f.d), q = 1 - p;
      const mx = (f.ax + f.bx) / 2, my = Math.min(f.ay, f.by) - 140;
      f.im.setPosition(q * q * f.ax + 2 * q * p * mx + p * p * f.bx, q * q * f.ay + 2 * q * p * my + p * p * f.by).setScale(0.55 - 0.15 * p);
      if (p >= 1) { f.im.destroy(); this.flying.splice(i, 1); }
    }
  }

  /** engine / bells / hooves: the nearest vehicle of each kind sets its loop's volume */
  loops() {
    const S = this.ports.sound;
    if (!S || !S.loop) return;
    const m = this.host.model, r = this.rect();
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const best = { sfx_sleigh_bells: 0, sfx_horse_trot: 0, sfx_truck_engine: 0 };
    for (const v of m.sim.list) {
      if (v.state === 'hidden' || !v.path) continue;
      const d = Math.hypot(v.x - cx, (v.y - cy) * 2);
      const vol = Math.max(0, 1 - d / 1100) * (v.v > 0.2 ? 1 : 0.4);
      if (SLED.has(v.key)) best.sfx_sleigh_bells = Math.max(best.sfx_sleigh_bells, vol);
      if (v.key === 'horse_sleigh_bus' || v.key === 'cargo_sleigh') best.sfx_horse_trot = Math.max(best.sfx_horse_trot, vol * (v.v > 0.2 ? 1 : 0));
      if (!SLED.has(v.key) && v.key !== 'steam_wagon') best.sfx_truck_engine = Math.max(best.sfx_truck_engine, vol * 0.8);
    }
    for (const k in best) { const v = Math.round(best[k] * 20) / 20; if (this.lastLoops[k] !== v) { this.lastLoops[k] = v; S.loop(k, v); } }
  }

  // ------------------------------------------------------------------------------------------ model events
  onModel(ev) {
    const m = this.host.model, lang = this.host.lang();
    const v = ev.id ? m.sim.get(ev.id) : null;
    switch (ev.t) {
      case 'veh:depot':
        if (ev.op === 'out') { this.fades.set(ev.id, 0); if (v && m.era >= 3) this.statics.openDoors(); }
        if (ev.op === 'in' && m.era >= 3) this.statics.openDoors();
        break;
      case 'veh:arrive':
        if (v && this.near(v.x, v.y, 0)) {
          if (ev.riders || ev.off) this.sound('sfx_door', v.x, v.y, { volume: 0.45 });
          if (m.T - this.horn > 3 && m.era >= 3) { this.horn = m.T; this.sound('sfx_brakes', v.x, v.y, { volume: 0.35 }); }
        }
        break;
      case 'veh:freight': {
        if (!v || !this.near(v.x, v.y, 100)) break;
        const def = Assets.charDef(v.key), cp = def && def.cargoPoint && def.cargoPoint[v.dk === 'SW' || v.dk === 'SE' ? 'SE' : 'NE'];
        const flip = v.dk === 'SW' || v.dk === 'NW';
        const from = { x: v.x + (cp ? cp[0] * (flip ? -1 : 1) : 0), y: v.y + (cp ? cp[1] : -60) };
        const to = ev.to === 'cargo' ? m.layout.PLACES['p:cargo'] : this.ports.freight && this.ports.freight.shelf ? this.ports.freight.shelf(ev.to) : null;
        this.flyItems(ev.items, from, to || { x: v.x - 90, y: v.y - 130 });
        break;
      }
      case 'veh:drop': {
        const run = m.chief.run;
        const items = ev.cargo || { item_letter: 2 };
        const veh = m.sim.get(ev.id);
        if (veh) this.flyItems(Object.keys(items).length ? items : { item_letter: 2 }, { x: veh.x, y: veh.y - 70 }, { x: ev.x, y: ev.y - 40 });
        if (this.ports.ui && this.ports.ui.toast) this.ports.ui.toast(vt(lang, 'dropDone'), 900);
        void run;
        break;
      }
      case 'veh:driveDone': if (this.hud) this.hud.result(ev); break;
      case 'veh:bell': {
        // a sleigh rings its bells, a city vehicle gives a soft toot; the person ahead hurries across
        const sleigh = /sleigh|sled/.test(ev.key || '');
        this.sound(sleigh ? 'sfx_sleigh_bells' : ev.key === 'retro_bus' ? 'sfx_bus_horn' : 'sfx_car_honk_2', ev.x, ev.y, { volume: 0.35 });
        this.bubble(ev.x, ev.y - 140, vt(lang, sleigh ? 'bell' : 'toot'));
        break;
      }
      case 'veh:honk':
        this.sound(m.era >= 3 ? 'sfx_car_honk_1' : 'sfx_sleigh_bells', ev.x, ev.y, { volume: 0.6 });
        this.bubble(ev.x, ev.y - 150, vt(lang, 'honk') + '!');
        break;
      case 'veh:ride':
        if (ev.chief && ev.op === 'board') { const b = m.sim.get(ev.id); if (b) this.emote(b.x, b.y - 200, 'emote_heart'); }
        if (ev.chief && ev.op === 'alight') {
          const P = this.ports;
          const s = ev.stop && m.layout.STOPS[ev.stop];
          if (P.chief && P.chief.place && s) P.chief.place(s.x - 40, s.y + 30);
          if (P.chief && P.chief.hide) P.chief.hide(false);
          if (P.ui && P.ui.toast && s) P.ui.toast(vt(lang, 'rideOff', { stop: s.name[lang] || s.name.ko }), 1400);
        }
        break;
      case 'veh:era': this.statics.build(); break;
      default: break;
    }
  }

  bubble(x, y, text) {
    // readable at every zoom: a constant size on screen (≈ 38 px of the 720-wide UI)
    const k = Math.max(0.9, 1 / Math.max(0.3, this.zoom()));
    const t = this.scene.add.text(x, y, text, { fontFamily: 'Pretendard, sans-serif', fontSize: '38px', fontStyle: '900', color: '#ffffff', stroke: '#e07a1a', strokeThickness: 9, resolution: 2 }).setOrigin(0.5).setDepth(DEPTH.BUBBLE);
    t.setScale(0.4 * k);
    this.scene.tweens.add({ targets: t, scale: k, y: y - 30, duration: 260, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: t, alpha: 0, delay: 900, duration: 300, onComplete: () => t.destroy() });
  }
  emote(x, y, key) {
    if (!Assets.has(key)) return;
    const e = Assets.image(this.scene, x, y, key).setDepth(DEPTH.BUBBLE).setScale(0.1);
    this.scene.tweens.add({ targets: e, scale: 0.8, y: y - 30, duration: 300, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: e, alpha: 0, delay: 1300, duration: 300, onComplete: () => e.destroy() });
  }

  // ------------------------------------------------------------------------------------------ host calls
  built() { this.statics.build(); }
  rideBooked() {}
  driveStarted(r, spec) {
    const lang = this.host.lang();
    if (this.ports.ui && this.ports.ui.toast) this.ports.ui.toast(vt(lang, spec && spec.vehicle === 'dog_sled' ? 'driveStart' : 'driveStartT'), 2200);
    if (spec && spec.capSpeed && spec.capSpeed < 1 && this.ports.ui && this.ports.ui.toast) this.ports.ui.toast(vt(lang, 'slowCake'), 2200);
  }

  /** the 도시 ceremony, the vehicles' part: lights pop, depot doors, horn, the banner */
  ceremony() {
    const lang = this.host.lang(), sc = this.scene;
    this.statics.build();
    for (const L of this.statics.lights) {
      const im = L.img, s = im.scaleX || 1;
      im.setScale(0.05);
      sc.tweens.add({ targets: im, scale: s, duration: 520, delay: 2600, ease: 'Back.easeOut' });
      if (Assets.has('fx_star')) { const st = Assets.image(sc, im.x, im.y - 150, 'fx_star').setDepth(DEPTH.FX).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffe28a).setScale(0.1).setAlpha(0); sc.tweens.add({ targets: st, scale: 1.4, alpha: { from: 1, to: 0 }, duration: 900, delay: 2700, onComplete: () => st.destroy() }); }
    }
    this.statics.openDoors(8);
    sc.time.delayedCall(5200, () => this.sound('sfx_bus_horn', undefined, undefined, { volume: 0.6 }));
    if (this.ports.ui && this.ports.ui.banner) sc.time.delayedCall(800, () => this.ports.ui.banner(vt(lang, 'eraCity'), vt(lang, 'eraCitySub')));
  }

  objects() {
    let n = this.statics.objects() + this.flying.length + (this.pin ? 1 : 0);
    for (const s of this.active.values()) n += s.objects() + s.seated.size * 8;
    for (const s of this.parked.values()) n += s.objects();
    return n;
  }

  destroy() {
    for (const s of this.active.values()) s.destroy();
    for (const s of this.parked.values()) s.destroy();
    for (const s of this.pool) s.destroy();
    for (const s of this.rigFree) s.rig.destroy();
    this.statics.destroy();
    if (this.chip) this.chip.destroy();
    if (this.hud) this.hud.destroy();
    if (this.pin) this.pin.destroy();
    for (const f of this.flying) f.im.destroy();
    this.active.clear(); this.parked.clear(); this.pool = []; this.rigFree = []; this.flying = [];
  }
}
