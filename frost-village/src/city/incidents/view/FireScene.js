// 불이야! — a fire on stage (and the fire drill). Nobody is ever hurt: everyone inside walks out first, the street
// watches from a safe distance, the brigade puts it out (or the building is lost, the family is safe and the street
// claps for the firefighters anyway).
//   smoke     the window fire and a thin plume (BuildingFx), the family hurries out (flee, panic face, "불이야!"),
//             a neighbour runs to the fire alarm post (ring + fx_alarm_flash + the bell), onlookers gather
//   dispatch  the fire truck comes from the station with its siren (or the vehicles module's dispatch), parks on
//             the street; three firefighters hop out and run to their spots -> shown (ack)
//   spray     spray_hose with fx_hose_rope jets from each nozzle to the fire, mist and steam at the impact, the
//             flames shrink (BuildingFx.douse) -> shown after minShow (ack)
//   repair    out! steam, the crew waves, the crowd claps (sfx_crowd_cheer_small)       (minor)
//   ruin      the building is lost: dust, the family hugs ("우리 가족 다 괜찮아요"), applause for the crew anyway

import { Scene, FRONT, AXIS } from './Scene.js';
import { faceTo, hoseArc, fireMountOf, has, sdef } from './art.js';
import { Vehicle } from './Vehicle.js';
import { FIRE_STATION, FIRE_PAD, ALARM_POSTS } from '../layout.js';

export class FireScene extends Scene {
  start() {
    const V = this.view;
    this.drill = this.kind === 'drill';
    const b = this.b = this.drill ? this.drillSpot() : this.building(this.inc.building);
    if (!b) { this.done = true; return; }
    this.anchor = b;
    const e = this.e = this.drill ? null : fireMountOf(b.key);
    const f0 = e && e.fires && e.fires[0];
    this.target = f0 ? { x: b.x + f0[0], y: b.y + f0[1] - 0.25 * 136 * (f0[3] || 1) } : { x: b.x, y: b.y - 60 };
    // the street watches from the next door's pavement (down-right of the fire), clear of the truck and the hoses
    this.crowdAt = this.front(b, 30, 235);
    this.hoses = [];
    // residents come out of the door (the family + witnesses), the first one shouts
    if (!this.drill) {
      const W = (this.inc.cast && this.inc.cast.witnesses) || [];
      const fam = W.slice(0, 2);
      if (!fam.length) fam.push({ sid: 1 });
      const d = this.door(b);
      this.family = fam.map((ref, k) => {
        const a = this.actor(this.look(ref, 'family', k), d.x + k * 18, d.y + k * 6, 'SW');
        const spot = this.at(this.crowdAt, 52, -46 - k * 40);
        a.go(spot, { anim: 'flee', route: false, face: 'panic', then: (x) => x.play('shocked', faceTo(x.x, x.y, b.x, b.y)) });
        return a;
      });
      this.family[0].say('sFire', null, 0, 'emote_exclaim', 2.4);
      V.sound('sfx_crowd_gasp', b.x, b.y, 0.6);
      this.alarm();
      this.later(1.2, () => this.gather(4, this.crowdAt, b));
    } else {
      this.smokePot = this.sheet('fx_smoke_column', b.x, b.y, { scale: 0.45, depth: b.y + 2, alpha: 0.8 });
      this.gather(3, this.crowdAt, b, { anims: ['point', 'think', 'phone'] });
    }
    // the truck: already parked when the scene starts in a later phase
    const ph = this.inc.phase;
    if (this.drill || ph === 'dispatch' || ph === 'spray') this.truckIn(ph === 'spray');
    if (ph === 'spray') this.sprayOn();
  }

  drillSpot() { const p = this.cmd.at || { x: FIRE_PAD.x + 260, y: FIRE_PAD.y + 40 }; return { x: p.x, y: p.y, key: 'fire_hydrant', fp: [120, 60], dp: [0, 0], top: 80 }; }

  /** a neighbour runs to the nearest fire alarm post and rings it */
  alarm() {
    const V = this.view, b = this.b;
    let best = null, bd = 900;
    for (const p of ALARM_POSTS) { const d = Math.hypot(p.x - b.x, (p.y - b.y) * 2); if (d < bd) { bd = d; best = p; } }
    const W = (this.inc.cast && this.inc.cast.witnesses) || [];
    if (best) {
      const start = this.at(best, 40, 260);
      const a = this.actor(this.look(W[2] || { sid: 77 }, 'neighbour', 3), start.x, start.y, 'NW');
      a.fadeIn = 0; a.fade(0);
      const to = { x: best.x + 26, y: best.y + 18 };
      a.go(to, { anim: 'run', route: false, then: (x) => { x.play('point', faceTo(x.x, x.y, best.x, best.y - 40)); x.say('sAlarm', null, 1, null, 2.2); V.decor.ring(best, 9); } });
    } else {
      const al = this.e && this.e.alarm;
      if (al) this.alarmFx = this.sheet('fx_alarm_flash', b.x + al[0], b.y + al[1], { depth: b.y + 4 });
      V.sound('sfx_fire_alarm_bell', b.x, b.y, 0.6);
    }
  }

  /** the fire truck: from the station (or just off screen along its route) to the street in front */
  truckIn(parked) {
    const V = this.view, b = this.b;
    if (this.truck) return;
    const park = this.park = this.front(b, 120, -150);
    const crew = (this.inc.cast && this.inc.cast.crew) || [];
    const from = { x: FIRE_STATION.x, y: FIRE_STATION.y + 70 };
    const route = V.driveRoute(from, park);
    const t = this.truck = new Vehicle(V, 'fire_truck', route[0].x, route[0].y, 'NW', { driver: this.look(crew[0] || { sid: 901 }, 'crew', 0) });
    this.vehicles.push(t);
    t.setSiren(1);
    if (parked || this.drill && !route.length) { t.x = park.x; t.y = park.y; t.setHeading('NW'); this.arrived(true); return; }
    this.sirenLoop = V.loop('sfx_siren_fire', t.x, t.y, 0.5, () => ({ x: t.x, y: t.y }));
    if (this.sirenLoop) this.loops.push(this.sirenLoop);
    t.drive(route.slice(1), () => { t.setHeading('NW'); this.arrived(false); });
  }

  /** parked: the crew hops out and runs to the hose spots (the ack for 'dispatch' when they are there) */
  arrived(instant) {
    const V = this.view, b = this.b, t = this.truck;
    if (this.alarmFx) { this.unsheet(this.alarmFx); this.alarmFx = null; }
    if (this.sirenLoop) { this.sirenLoop.stop(); this.sirenLoop = null; }
    t.setAnim(t.def && t.def.anims.siren ? 'siren' : 'idle');
    const crew = (this.inc.cast && this.inc.cast.crew) || [];
    const n = 3;
    this.crew = [];
    let there = 0;
    for (let k = 0; k < n; k++) {
      const dp = t.point('doorPoints', k % 2);
      const spot = this.crewSpot(k);
      const a = this.actor(this.look(crew[k + 1] || crew[k] || { sid: 910 + k }, 'crew', k + 1), instant ? spot.x : dp.x, instant ? spot.y : dp.y, 'NE');
      a.keep = false;
      this.crew.push(a);
      const ready = (x) => { x.play('idle', faceTo(x.x, x.y, this.target.x, this.target.y), 'determined'); if (++there === n) this.crewReady(); };
      if (instant) ready(a);
      else a.go(spot, { anim: 'run', route: false, then: ready });
    }
    if (!this.drill) this.crew[0].say('sCrew', null, 0, 'emote_exclaim', 2.4);
    else this.crew[0].say('sDrill', null, 0, null, 2.6);
    V.sound('sfx_crowd_gasp', b.x, b.y, 0.25);
  }

  crewSpot(k) {
    const b = this.b;
    // a fan in front of the building, 0.4 x footprint away from the walls, facing the fire
    const s = [-70, 15, 100][k];
    return this.front(b, this.drill ? 70 : 60 + (k === 1 ? 18 : 0), s);
  }

  crewReady() {
    this.ready = true;
    if (this.inc.phase === 'dispatch' || this.drill) this.view.shown(this.id, 'dispatch');
    if (this.inc.phase === 'spray' || this.drill) this.sprayOn();
  }

  sprayOn() {
    if (this.spraying || !this.crew) return;
    this.spraying = true; this.sprayT = this.t;
    const V = this.view;
    for (const a of this.crew) a.play('spray_hose', faceTo(a.x, a.y, this.target.x, this.target.y), 'determined');
    this.hoseLoop = V.loop('sfx_hose_spray', this.b.x, this.b.y, 0.45);
    if (this.hoseLoop) this.loops.push(this.hoseLoop);
    this.mist = this.sheet('fx_water_mist', this.target.x, this.target.y, { depth: this.b.y + 6 });
  }

  sprayOff() {
    this.spraying = false;
    for (const h of this.hoses) { if (h.rope) h.rope.destroy(); if (h.tip) this.unsheet(h.tip); }
    this.hoses = [];
    if (this.mist) { this.unsheet(this.mist); this.mist = null; }
    if (this.hoseLoop) { this.hoseLoop.stop(); this.hoseLoop = null; }
  }

  phase(name, inc) {
    super.phase(name, inc);
    const V = this.view, b = this.b;
    if (!b) return;
    if (name === 'dispatch') this.truckIn(false);
    else if (name === 'spray') { if (!this.truck) this.truckIn(true); if (this.ready) this.sprayOn(); }
    else if (name === 'repair') this.out(false);
    else if (name === 'ruin') this.out(true);
  }

  /** the end of the fire: out (minor) or lost (ruin); either way the street claps for the crew */
  out(ruin) {
    const V = this.view, b = this.b;
    this.sprayOff();
    V.bfx.douse(this.inc.building, 0);
    for (let k = 0; k < 3; k++) this.later(k * 0.5, () => { this.sheet('fx_steam_puff', this.target.x + (k - 1) * 30, this.target.y + 20, { depth: b.y + 6, once: true }); });
    V.sound('sfx_steam_hiss', b.x, b.y, 0.5);
    if (this.crew) { this.crew[0].say('sOut', null, ruin ? 1 : 0, 'emote_star', 2.6); for (const a of this.crew) a.play(ruin ? 'idle' : 'happy', 'SW'); }
    this.later(1.2, () => {
      this.all(this.crowd, 'clap', b);
      V.sound('sfx_crowd_cheer_small', b.x, b.y, 0.6);
      if (this.crowd[0]) this.crowd[0].say('sCheer', null, (this.id | 0) % 3, 'emote_star', 2.4);
      for (const a of this.crowd) a.emote(ruin ? 'emote_heart' : 'emote_star', 1.6);
    });
    if (this.family) {
      this.later(ruin ? 2.6 : 3.4, () => { const f = this.family[0]; if (f) { f.play('happy', faceTo(f.x, f.y, this.crew ? this.crew[0].x : b.x, this.crew ? this.crew[0].y : b.y)); f.say(ruin ? 'sSafe' : 'sCheer', null, ruin ? 0 : 2, 'emote_heart', 2.6); } });
    }
    if (this.crew) this.later(4.5, () => { for (const a of this.crew) a.play('wave', 'SW'); });
  }

  update(dt) {
    super.update(dt);
    const V = this.view;
    if (this.leaving || !this.b) return;
    // the flames shrink while the hoses play on them
    if (this.spraying) {
      const k = Math.max(0.3, 1 - (this.t - this.sprayT) / 12);
      if (!this.drill) V.bfx.douse(this.inc.building, k);
      else if (this.smokePot) this.smokePot.setAlpha(0.3 + 0.5 * k);
      this.aimHoses();
      this.steamT = (this.steamT || 0) - dt;
      if (this.steamT <= 0) { this.steamT = 1.1 + this.R() * 0.6; this.sheet('fx_steam_puff', this.target.x + (this.R() - 0.5) * 50, this.target.y + 10, { depth: this.b.y + 6, once: true }); if (this.R() < 0.4) V.sound('sfx_steam_hiss', this.b.x, this.b.y, 0.25); }
      if (this.t - this.sprayT >= (V.cfg.minShow['fire:spray'] || 10)) V.shown(this.id, 'spray');
      if (this.drill && this.t - this.sprayT > 9) { this.sprayOff(); this.crew[0].say('sOut', null, 0, 'emote_star'); this.all(this.crowd, 'clap', this.b); this.drill = 'done'; this.later(4, () => { this.view.endDrill(this); }); }
    }
  }

  /** one jet per firefighter from the nozzle (cityfolk nozzlePoint, mirrored) to the fire (fx_city hoseAim) */
  aimHoses() {
    const S = this.view.scene;
    for (let k = 0; k < this.crew.length; k++) {
      const a = this.crew[k];
      let h = this.hoses[k];
      const nz = a.rig && a.rig.nozzle ? a.rig.nozzle(a.dir, a.rig.frame) : null;
      const N = nz ? { x: a.x + nz[0], y: a.y + nz[1] } : { x: a.x + (a.dir.indexOf('W') >= 0 ? -24 : 24), y: a.y - 46 };
      const T = { x: this.target.x + (k - 1) * 26, y: this.target.y + (k === 1 ? -10 : 8) };
      const { pts, L } = hoseArc(N, T, this.t + k);
      const key = L > 360 && has('fx_hose_rope_long') ? 'fx_hose_rope_long' : 'fx_hose_rope';
      if (!h) {
        h = { rope: S.textures.exists(key) ? S.add.rope(N.x, N.y, key, 0, pts) : null, tip: null, f: k * 3, n: pts.length };
        if (h.rope) h.rope.setAlpha(0.92);
        h.tip = this.sheet('fx_hose_tip', T.x, T.y, { depth: 0 });
        this.hoses[k] = h;
      }
      const depth = Math.max(a.y, this.b.y + 1) + 0.5;
      if (h.rope) {
        h.rope.setPosition(N.x, N.y).setDepth(depth);
        h.rope.setPoints(pts);
        h.f = (h.f + 0.5) % 8;
        h.rope.setFrame(Math.floor(h.f));
      }
      if (h.tip) {
        const p1 = pts[pts.length - 1], p0 = pts[Math.max(0, pts.length - 2)];
        h.tip.setPosition(N.x + p1.x, N.y + p1.y).setRotation(Math.atan2(p1.y - p0.y, p1.x - p0.x)).setFlipY(T.x < N.x).setScale(0.75).setDepth(depth + 1);
      }
    }
  }

  end() { this.sprayOff(); super.end(); }
  destroy() { this.sprayOff(); super.destroy(); }
}

void FRONT; void AXIS; void sdef;
