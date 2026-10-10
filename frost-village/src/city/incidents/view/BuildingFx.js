// Buildings after fires, drawn whenever they are near the view (staged or not — the state lives in the model):
//   smoking   a window fire + a thin smoke column; the building glows warm (tint flicker, fx_city fireMount.tint)
//   burning   the measured fire (fx_city fireMount.buildings[key]): fires, glow, window fires, smoke, embers; a scene
//             may douse it (douse(id, k): the flames shrink, more steam)
//   scorched  soot tint and a last wisp of smoke until it is repaired
//   ruin      the civic ruin (ruinFor[key]) in place of the building, its smoke overlay while it smoulders, a scorch
//             decal on the snow and the insurance sign
//   demolition the fence ring (gate left open), the excavator digging over the fence with dust at the bite, the dump
//             truck filling up (cargo overlay from the dump frame), ruin -> rubble -> half -> clear; a worker sweeps
//   site      stakes -> foundation -> scaffold (assets/buildings site_*), builders carrying boxes
//   rebuilt   the building is back (one level better: ports.world.upgrade), a ribbon garland and flower stands

import { put, has, sdef, ruinOf, fenceRing, demolitionOf, fireMountOf, rng, DEPTH, Assets } from './art.js';
import { Vehicle } from './Vehicle.js';

const NEAR = 1500;
const TINT = [0xffe2c8, 0xffcfa6];
const CHARRED = 0x6e605a;          // the burnt building before its ruin picture is in
const WISP_S = 30;                // a scorched building smokes thinly this long after the fire (holds the fire art)

export class BuildingFx {
  constructor(view) {
    this.view = view;
    this.scene = view.scene;
    this.ports = view.ports;
    this.items = new Map();       // building id -> { id, b, state, objs[], sheets[], fire, vehicles, actors, t, ... }
    this.douseK = new Map();      // building id -> 0..1 (1 = full fire)
  }

  /** the persistent states from the model (called on every inc:fire and on view.sync) */
  sync(list) {
    const want = new Map(list.map((r) => [r.id, r]));
    for (const [id, it] of this.items) if (!want.has(id) || want.get(id).state === 'ok') { this.clearItem(it, true); this.items.delete(id); }
    for (const r of list) {
      if (r.state === 'ok') continue;
      let it = this.items.get(r.id);
      if (!it) { it = { id: r.id, state: '', objs: [], sheets: [], vehicles: [], actors: [], t: 0, seed: (r.t | 0) + r.id.length }; this.items.set(r.id, it); }
      it.rec = r;
      if (it.state !== r.state) this.enter(it, r.state);
    }
  }

  /** an art group arrived (Residency): items drawn before it was resident are drawn again */
  artReady() {
    for (const it of this.items.values()) {
      if (!it.shown) continue;
      const art = it.art; it.art = null;                 // keep the group held while redrawing
      const st = it.state, t = it.t;
      this.clearItem(it, false);
      it.state = st; it.t = t; it.art = art;
      this.show(it);
    }
  }

  douse(id, k) { this.douseK.set(id, Math.max(0, Math.min(1, k))); }

  near(b) { const v = this.view.rect(); if (!v) return true; const dx = Math.max(0, v.x - b.x, b.x - (v.x + v.width)), dy = Math.max(0, v.y - b.y, b.y - (v.y + v.height)); return Math.hypot(dx, dy) < NEAR; }

  bld(id) { const W = this.ports.world; return W && W.building ? W.building(id) : null; }

  clearItem(it, restore) {
    for (const o of it.objs) o.destroy();
    for (const s of it.sheets) this.view.sheets.release(s);
    for (const v of it.vehicles) v.destroy();
    for (const a of it.actors) this.view.cast.remove(a);
    it.objs = []; it.sheets = []; it.vehicles = []; it.actors = []; it.fire = null; it.shown = false;
    if (it.loop) { it.loop.stop(); it.loop = null; }
    if (it.art) { this.view.art('drop', it.art); it.art = null; }
    if (restore && it.heldArt) { this.view.art('drop', it.heldArt); it.heldArt = null; }
    if (restore) { this.setHidden(it.id, false); this.tint(it.id, null); }
  }

  setHidden(id, on) { const W = this.ports.world; if (W && W.hide) W.hide(id, on); }
  tint(id, c) { const W = this.ports.world; if (W && W.tint) W.tint(id, c); }

  enter(it, state) {
    const prev = it.state;
    // the group stays held across the change (dropped after the new state wants its own: no evict + reload)
    if (it.art) { if (it.heldArt) this.view.art('drop', it.heldArt); it.heldArt = it.art; it.art = null; }
    this.clearItem(it, false);
    it.state = state; it.t = 0;
    const b = this.bld(it.id);
    it.b = b;
    if (!b) return;
    if (state === 'smoking' || state === 'burning' || state === 'scorched') this.setHidden(it.id, false);
    // a ruin: the burnt building stays (charred) until the ruin picture is in (show hides it then); demolition / site
    // hide it at once
    if (state === 'ruin') { this.setHidden(it.id, false); this.tint(it.id, CHARRED); }
    if (state === 'demolition' || state === 'site') this.setHidden(it.id, true);
    if (state === 'scorched') this.tint(it.id, 0xd9cfc8);
    if (state === 'rebuilt') {
      this.setHidden(it.id, false); this.tint(it.id, null);
      const W = this.ports.world;
      if (W && W.upgrade && it.rec && it.rec.lv > 0) W.upgrade(it.id, it.rec.lv);
      if (prev === 'site' || prev === '' ) this.view.burst(b.x, b.y - 120, 'rebuilt');
    }
    if (state === 'ruin' && prev === 'burning') { this.view.sound('sfx_collapse_soft', b.x, b.y, 0.7); it.dust = true; }
  }

  /** build the pictures of an item (only near the view) */
  show(it) {
    const b = it.b;
    if (!b) return;
    it.shown = true;
    const S = this.scene, V = this.view, st = it.state;
    const R = ruinOf(b.key);
    if (st === 'smoking' || st === 'burning') {
      const e = fireMountOf(b.key);
      it.fire = { e, fires: [], windows: [], glow: null, smoke: null, embers: null };
      const F = it.fire;
      const full = st === 'burning';
      if (full) {
        for (const [k, f] of e.fires.entries()) { const s = V.sheets.play(f[2], b.x + f[0], b.y + f[1], { scale: f[3], depth: b.y + (f[4] || 1) + k * 0.01, frame: k * 3 }); if (s) { F.fires.push([s, f[3]]); it.sheets.push(s); } }
        if (e.glow) { F.glow = V.sheets.play('fx_fire_glow', b.x + e.glow[0], b.y + e.glow[1], { scale: e.glow[2], depth: b.y + 0.9 }); if (F.glow) it.sheets.push(F.glow); }
        if (e.embers) { F.embers = V.sheets.play('fx_embers', b.x + e.embers[0], b.y + e.embers[1], { depth: b.y + 1.5 }); if (F.embers) it.sheets.push(F.embers); }
      }
      const wins = (e.windows || []).slice(0, full ? 2 : 1);
      for (const w of wins) { const s = V.sheets.play('fx_fire_window', b.x + w[0], b.y + w[1], { scale: w[3] || 0.8, flipX: !!w[2], depth: b.y + 0.5 }); if (s) { F.windows.push(s); it.sheets.push(s); } }
      if (e.smoke) { F.smoke = V.sheets.play('fx_smoke_column', b.x + e.smoke[0], b.y + e.smoke[1], { scale: (full ? 1 : 0.5) * (e.smoke[2] || 1), depth: b.y + 2.5, alpha: 0.95 }); if (F.smoke) it.sheets.push(F.smoke); }
      it.loop = V.loop('amb_fire_big', b.x, b.y, full ? 0.55 : 0.25);
      this.wantArt(it, 'fire');
    } else if (st === 'scorched') {
      const e = fireMountOf(b.key);
      if (e.smoke && it.t < WISP_S) {
        this.wantArt(it, 'fire');
        const s = V.sheets.play('fx_smoke_column', b.x + e.smoke[0], b.y + e.smoke[1] + 40, { scale: 0.35, depth: b.y + 2.5, alpha: 0.55, tint: 0xdfe4ec }); if (s) it.sheets.push(s);
      }
    } else if (st === 'ruin' || st === 'demolition' || st === 'site') {
      // the transient budget: the rebuild pictures come in only once the fire's are out of memory (the burnt,
      // charred building stands in meanwhile — the street is still clapping for the crew)
      if (st === 'ruin' && (V.artRef.get('fire') || 0) > 0) { it.waitFire = true; return; }
      it.waitFire = false;
      this.wantArt(it, 'rebuild');
      const sc = put(S, R.scorch, b.x, b.y, DEPTH.GROUND_DECAL + 2); if (sc) it.objs.push(sc);
      if (st === 'ruin') {
        const r = put(S, R.ruin, b.x, b.y);
        if (r) { it.objs.push(r); this.setHidden(it.id, true); }
        if (it.rec && it.rec.smoulder) {
          const so = put(S, R.ruin + '_smoke', b.x, b.y, b.y + 0.2);
          if (so) { const a = Assets.spriteAnim(R.ruin + '_smoke', 'smoke'); if (a) { const sp = S.add.sprite(b.x, b.y, so.texture.key, so.frame.name).setOrigin(so.originX, so.originY).setDepth(b.y + 0.2); sp.play(a); so.destroy(); it.objs.push(sp); } else it.objs.push(so); }
        }
        if (it.dust && V.sheets.play('fx_demolish_dust', b.x, b.y + 10, { depth: b.y + 3, scale: 1.2, once: true })) it.dust = false;
        const d = sdef(R.ruin) || {};
        const dp = d.doorPoint || [-60, 40];
        const sign = put(S, 'insurance_sign', b.x + dp[0] - 70, b.y + dp[1] + 34); if (sign) it.objs.push(sign);
      }
      if (st === 'demolition' || st === 'site') this.fence(it, b, R.ring, st === 'site');
      if (st === 'demolition') this.demolition(it, b, R);
      if (st === 'site') this.site(it, b, R);
    } else if (st === 'rebuilt') {
      const d = sdef(b.key) || {};
      const dp = d.doorPoint || [-50, 40];
      // v4's opening look (Shop.makeRibbon): two flower stands by the door and the red ribbon, already cut
      this.wantArt(it, 'opening');
      const dx0 = b.x + dp[0], dy0 = b.y + dp[1] + 6;
      for (const sx of [-40, 40]) { const f = put(S, 'flower_stand', dx0 + sx, dy0 + 30 - sx * 0.25, dy0 + 40); if (f) it.objs.push(f); }
      const g = S.add.graphics().setDepth(dy0 + 41);
      const ax = dx0 - 40, ay = dy0 + 30 + 10 - 44, bx = dx0 + 40, by = dy0 + 30 - 10 - 44;
      g.lineStyle(5, 0xd8344a, 1);
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax + 12, ay + 22); g.strokePath();
      g.beginPath(); g.moveTo(bx, by); g.lineTo(bx - 12, by + 22); g.strokePath();
      it.objs.push(g);
    }
  }

  fence(it, b, ring, open) {
    const F = fenceRing(ring);
    if (!F) return;
    const lay = demolitionOf(ring, 'Y-');
    const gate = lay && lay.gateIndex !== undefined ? lay.gateIndex : -1;
    F.pieces.forEach((p, k) => {
      if (k === gate) return;
      if (open && k % 4 === 1) return;      // the builders opened two more gaps
      const o = put(this.scene, p.key, b.x + p.at[0], b.y + p.at[1]);
      if (o) { if (Assets.spriteAnim(p.key, 'blink')) { const s = this.scene.add.sprite(o.x, o.y, o.texture.key, o.frame.name).setOrigin(o.originX, o.originY).setDepth(o.depth); s.play(Assets.spriteAnim(p.key, 'blink')); o.destroy(); it.objs.push(s); } else it.objs.push(o); }
    });
  }

  demolition(it, b, R) {
    const lay = demolitionOf(R.ring, 'Y-');
    if (!lay) return;
    const ex = lay.excavator, tr = lay.dump_truck;
    const exc = new Vehicle(this.view, 'excavator', b.x + ex.at[0], b.y + ex.at[1], ex.dir || 'NE');
    exc.setAnim('dig');
    const truck = new Vehicle(this.view, 'dump_truck', b.x + tr.at[0], b.y + tr.at[1], tr.dir || 'SW');
    it.vehicles.push(exc, truck);
    it.exc = exc; it.truck = truck;
    it.pile = put(this.scene, R.ruin, b.x, b.y);
    if (it.pile) it.objs.push(it.pile);
    it.stage = 0;
    const W = (sdef(R.ruin) || {}).workPoints || [[-100, 34]];
    const w = W[W.length > 2 ? 2 : 0];
    it.actors.push(this.view.cast.add({ preset: 'demolition_worker', seed: it.seed }, b.x + w[0] - 30, b.y + w[1] + 40, 'NE'));
    it.actors[0].play('sweep', 'NE');
    this.wantArt(it, 'rebuild');
    it.loop = this.view.loop('sfx_excavator', b.x, b.y, 0.35);
  }

  site(it, b, R) {
    const ring = R.ring || 'M';
    it.siteKeys = ['site_plot_' + ring, 'site_foundation_' + ring, 'site_scaffold_' + ring];
    it.siteImg = put(this.scene, it.siteKeys[0], b.x, b.y);
    if (it.siteImg) it.objs.push(it.siteImg);
    it.stage = 0;
    const d = sdef(it.siteKeys[0]) || {};
    const wp = d.workPoints || [[-100, 34], [100, 36]];
    const r = rng(it.seed);
    for (let k = 0; k < 2; k++) {
      const p = wp[k % wp.length];
      const a = this.view.cast.add({ preset: 'construction_worker', seed: it.seed + k * 7 }, b.x + p[0], b.y + p[1] + 24, k ? 'NW' : 'NE');
      a.home = { x: a.x, y: a.y }; a.next = 1 + r() * 2; a.k = k;
      it.actors.push(a);
    }
    this.wantArt(it, 'rebuild');
    it.loop = this.view.loop('amb_construction', b.x, b.y, 0.3);
  }

  wantArt(it, art) { if (!it.art) { it.art = art; this.view.art('want', art); } }

  update(dt) {
    const V = this.view;
    for (const it of this.items.values()) {
      it.t += dt;
      if (!it.b) { it.b = this.bld(it.id); if (!it.b) { if (it.heldArt) { V.art('drop', it.heldArt); it.heldArt = null; } continue; } }
      const near = this.near(it.b);
      if (near && !it.shown) this.show(it);
      else if (!near && it.shown) this.clearItem(it, false);
      if (it.heldArt) { const h = it.heldArt; it.heldArt = null; V.art('drop', h); }
      if (!it.shown) continue;
      if (it.waitFire && !(V.artRef.get('fire') > 0)) { this.clearItem(it, false); this.show(it); }
      if (it.state === 'scorched' && it.art === 'fire' && it.t >= WISP_S) {
        for (const s of it.sheets) V.sheets.release(s);
        it.sheets = [];
        V.art('drop', 'fire'); it.art = null;
      }
      const b = it.b;
      // the warm flicker of a building lit by its own fire
      if (it.state === 'smoking' || it.state === 'burning') {
        it.tk = (it.tk || 0) - dt;
        if (it.tk <= 0) { it.tk = 0.12 + ((it.t * 7.3) % 0.06); it.tn = (it.tn || 0) ^ 1; this.tint(it.id, TINT[it.tn]); }
        const k = this.douseK.has(it.id) ? this.douseK.get(it.id) : 1;
        if (it.fire) {
          for (const [s, sc] of it.fire.fires) s.setScale(sc * (0.45 + 0.55 * k)).setAlpha(0.35 + 0.65 * k);
          if (it.fire.glow) it.fire.glow.setAlpha(0.3 + 0.7 * k);
          if (it.fire.embers) it.fire.embers.setAlpha(k);
          for (const w of it.fire.windows) w.setAlpha(Math.min(1, it.t * 1.5) * (0.2 + 0.8 * k));
          if (it.fire.smoke) { it.fire.smoke.setAlpha(0.55 + 0.4 * k); if (k < 0.9) it.fire.smoke.setTint(0xdfe4ec); }
        }
        if (it.loop && it.loop.volume) it.loop.volume(0.2 + 0.4 * k);
      }
      if (it.state === 'demolition') this.demolitionTick(it, dt, b);
      if (it.state === 'site') this.siteTick(it, dt, b);
      for (const v of it.vehicles) v.update(dt);
      if (it.state === 'rebuilt' && it.t > 1 && !it.sparkled) { it.sparkled = true; V.burst(b.x, b.y - 140, 'rebuilt'); }
    }
  }

  demolitionTick(it, dt, b) {
    const R = ruinOf(b.key), exc = it.exc, truck = it.truck, V = this.view;
    if (!exc || !exc.def) return;
    const A = exc.def.anims.dig || {};
    if (exc.anim === 'dig' && exc.frame !== it.lastF) {
      it.lastF = exc.frame;
      if (exc.frame === (A.digFrame || 2)) { const p = exc.point('bucketPoint'); V.sheets.play('fx_demolish_dust', p.x, p.y + 30, { depth: b.y + 3, scale: 0.7 }); V.sound('sfx_demolish_crunch', b.x, b.y, 0.4); }
      if (exc.frame === (A.dumpFrame || 5) && truck && !truck.cargo) truck.setCargo(true);
    }
    // the ruin goes down in stages while the bucket bites (time based, capped by the phase change)
    const stage = it.t < 22 ? 0 : it.t < 48 ? 1 : it.t < 80 ? 2 : 3;
    if (stage !== it.stage) {
      it.stage = stage;
      const key = stage === 1 ? R.rubble : stage === 2 ? R.rubble + '_half' : null;
      if (it.pile) { it.objs.splice(it.objs.indexOf(it.pile), 1); it.pile.destroy(); it.pile = null; }
      if (key && has(key)) { it.pile = put(this.scene, key, b.x, b.y); it.objs.push(it.pile); }
      V.sheets.play('fx_demolish_dust', b.x, b.y, { depth: b.y + 3, scale: 1 });
      if (stage === 3) { exc.setAnim('idle'); if (truck) truck.drive([{ x: truck.x - 260, y: truck.y + 130 }], (t) => t.show(false)); }
    }
    for (const a of it.actors) if (!a.busy && a.anim !== 'sweep') a.play('sweep', a.dir);
  }

  siteTick(it, dt, b) {
    const stage = it.t < 30 ? 0 : it.t < 90 ? 1 : 2;
    if (stage !== it.stage && it.siteKeys) {
      it.stage = stage;
      if (it.siteImg) { it.objs.splice(it.objs.indexOf(it.siteImg), 1); it.siteImg.destroy(); }
      it.siteImg = put(this.scene, it.siteKeys[stage], b.x, b.y);
      if (it.siteImg) it.objs.push(it.siteImg);
      this.view.sheets.play('fx_build_dust', b.x, b.y, { depth: b.y + 2 });
    }
    // builders: carry a box in, put it down, walk back (a gentle loop)
    const d = sdef(it.siteKeys ? it.siteKeys[0] : '') || {};
    const drop = d.dropPoint || [0, 80];
    for (const a of it.actors) {
      if (a.busy) continue;
      a.next -= dt;
      if (a.next > 0) continue;
      a.next = 2.5 + (a.k ? 1.2 : 0);
      const atHome = Math.hypot(a.x - a.home.x, a.y - a.home.y) < 4;
      if (atHome) a.go({ x: b.x + drop[0] + (a.k ? 40 : -40), y: b.y + drop[1] }, { anim: 'carry_box', route: false });
      else { this.view.sound('sfx_box_drop', a.x, a.y, 0.25); a.go(a.home, { anim: 'walk', route: false, then: (x) => x.play('idle', x.k ? 'NW' : 'NE') }); }
    }
  }

  destroy() { for (const it of this.items.values()) this.clearItem(it, true); this.items.clear(); }
  get count() { let n = 0; for (const it of this.items.values()) n += it.objs.length + it.sheets.length + it.vehicles.length * 3; return n; }
}
