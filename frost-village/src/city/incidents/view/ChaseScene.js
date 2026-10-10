// 좀도둑! — a petty theft on stage: comic, never scary.
//   act      the culprit slips out of the shop door with the loot; the shopkeeper pops out after them, shocked:
//            "도둑이야!" (emote_exclaim)
//   chase    the culprit flees (flee, panic face) to the 'away' place and runs comic loops around it; an officer runs
//            after them blowing the whistle (sfx_police_whistle, "거기 서!"), bgm_chase plays; when the officer has
//            caught up -> shown (ack)
//   arrest   "잡았다!" (point), sfx_cuffs_click and the cute cuffs icon; the culprit walks off with the officer
//            (arrested_walk, sheepish face, "죄송해요…") towards the police car / station
//   wanted   (not caught) the culprit gets away and fades; the officer scratches their head (think + fx_question_mark)

import { Scene } from './Scene.js';
import { faceTo, put } from './art.js';
import { Vehicle } from './Vehicle.js';
import { POLICE } from '../layout.js';

export class ChaseScene extends Scene {
  start() {
    const V = this.view;
    const shop = this.shop = this.building(this.inc.place) || this.building(this.inc.building);
    if (!shop) { this.done = true; return; }
    this.anchor = shop;
    const C = this.inc.cast || {};
    const d = this.door(shop);
    this.thief = this.actor(this.look(C.culprit, 'culprit', 0), d.x, d.y, 'SW');
    this.thief.play('shocked', 'SW', 'sheepish');
    this.victimRef = C.victim;
    const ph = this.inc.phase;
    if (ph === 'act') this.act();
    else if (ph === 'chase') { this.act(true); this.chase(); }
    else this.chase();
    this.gather(2, this.front(shop, 170, -40), d, { anims: ['shocked', 'point'] });
  }

  act(quick) {
    const V = this.view, shop = this.shop, d = this.door(shop);
    this.thief.say('sFlee', null, 0, 'emote_sweat', 2.0);
    this.later(quick ? 0.1 : 0.8, () => {
      const v = this.victim = this.actor(this.look(this.victimRef, 'victim', 1), d.x + 10, d.y + 4, 'SW');
      v.play('shocked', faceTo(v.x, v.y, this.thief.x, this.thief.y));
      v.say('sThief', { item: V.itemName(this.inc.item) }, (this.id | 0) % 2, 'emote_exclaim', 2.6);
      V.sound('sfx_crowd_gasp', shop.x, shop.y, 0.5);
    });
  }

  /** the away place (the story moves I.place there at the chase), else a spot down the street */
  awaySpot() {
    const p = this.view.pos(this.inc.place);
    const shop = this.shop;
    if (p && Math.hypot(p.x - shop.x, p.y - shop.y) > 200 && Math.hypot(p.x - shop.x, p.y - shop.y) < 1100) return this.front(p, 60, 0);
    return this.front(shop, 230, 420);
  }

  chase() {
    if (this.chasing) return;
    this.chasing = true; this.chaseT = this.t;
    const V = this.view, th = this.thief;
    const away = this.away = this.awaySpot();
    V.music('chase');
    th.go(away, { anim: 'flee', face: 'panic', then: () => this.loop() });
    // the officer: the police car comes up the street from behind (the other side of the shop from where the
    // culprit runs), stops by the shop; the officer hops out whistling and runs after them on foot
    const C = this.inc.cast || {};
    const o0 = (C.officers && C.officers[0]) || { sid: 501 };
    const side = this.side = this.sOf(away) >= 0 ? 1 : -1;
    const stop = this.front(this.shop, 120, -side * 110), start = this.front(this.shop, 120, -side * 900);
    this.car = new Vehicle(V, 'police_car', start.x, start.y, side > 0 ? 'SE' : 'NW', { driver: this.look(o0, 'officer', 0) });
    this.vehicles.push(this.car);
    this.car.setSiren(2);
    const sl = V.loop('sfx_siren_police', this.car.x, this.car.y, 0.35, () => ({ x: this.car.x, y: this.car.y }));
    if (sl) this.loops.push(sl);
    this.car.drive([stop], () => {
      this.car.setAnim('siren');
      const dp = this.car.point('doorPoints', 0);
      const cop = this.cop = this.actor(this.look(o0, 'officer', 1), dp.x, dp.y, 'SE');
      cop.say('sChase', null, 0, 'emote_exclaim', 2.2);
      V.sound('sfx_police_whistle', cop.x, cop.y, 0.7);
      this.follow = true;
    });
  }

  /** a point's offset along the street (AXIS) from the shop (FRONT / AXIS are not orthogonal on screen) */
  sOf(p) { return ((p.x - this.shop.x) / 0.894 + (p.y - this.shop.y) / 0.447) / 2; }

  /** comic loops around the away spot until the story decides */
  loop() {
    if (this.caught || this.escaped) return;
    const c = this.away, r = 70;
    const pts = [];
    for (let k = 1; k <= 8; k++) { const a = (k / 8) * Math.PI * 2; pts.push({ x: c.x + Math.cos(a) * r * 1.4, y: c.y + Math.sin(a) * r * 0.7 }); }
    this.thief.go(pts, { anim: 'flee', face: 'panic', route: false, then: () => this.loop() });
    if (this.R() < 0.5) this.thief.say('sFlee', null, 1, 'emote_sweat', 1.6);
  }

  phase(name, inc) {
    super.phase(name, inc);
    if (name === 'chase') { if (!this.victim) this.act(true); this.chase(); }
    else if (name === 'arrest') this.arrest();
    else if (name === 'wanted') this.escape();
  }

  arrest() {
    if (this.caught) return;
    this.caught = true;
    const V = this.view, th = this.thief;
    if (!this.cop) { const p = this.at(th, 10, -60); this.cop = this.actor(this.look({ sid: 502 }, 'officer', 1), p.x, p.y, 'E'); }
    const cop = this.cop;
    this.follow = false;
    th.stop('idle');
    cop.stop('point', faceTo(cop.x, cop.y, th.x, th.y));
    cop.say('sArrest', null, 0, 'emote_exclaim', 2.4);
    V.sound('sfx_cuffs_click', th.x, th.y, 0.7);
    V.music(null);
    const icon = put(V.scene, 'ui_icon_cuffs_cute', th.x, th.y - 150, 40000);
    if (icon) {
      icon.setScale(0.5);
      (this.objs || (this.objs = [])).push(icon);
      const y0 = icon.y;
      this.later(0.6, () => this.tween(1.6, (k) => icon.setY(y0 - 30 * k).setScale(0.5 + 0.12 * k).setAlpha(1 - k), () => icon.setVisible(false)));
    }
    th.play('idle', faceTo(th.x, th.y, cop.x, cop.y), 'sheepish');
    // the car comes up to the pair (siren off), they get in, it drives on to the station (the cell scene plays there)
    const car = this.car, side = this.side || 1;
    const board = () => {
      const to = car ? car.point('doorPoints', 1) : this.at(th, 40, -400);
      th.go({ x: to.x + 14, y: to.y + 8 }, { anim: 'arrested_walk', face: 'sheepish', route: false, then: (x) => x.fade(0) });
      cop.go({ x: to.x - 16, y: to.y + 2 }, { anim: 'walk', route: false, then: (x) => x.fade(0) });
      this.later(2.6, () => { if (car) { car.setSiren(0); car.drive([this.front(this.shop, 120, this.sOf(car) + side * 1100)]); car.parkedForGood = true; } });
    };
    if (car) { car.drive([this.front(this.shop, 120, this.sOf(th) - side * 90)], () => this.later(0.3, board)); } else this.later(1.4, board);
    this.later(2.6, () => { th.play('arrested_walk', th.dir, 'sheepish'); th.say('sCaught', null, (this.id | 0) % 2, 'emote_sweat', 2.6); });
    if (this.victim) this.later(2.2, () => { this.victim.play('happy', faceTo(this.victim.x, this.victim.y, th.x, th.y)); this.victim.emote('emote_heart'); });
    this.all(this.crowd, 'clap', th);
  }

  escape() {
    if (this.escaped) return;
    this.escaped = true;
    const V = this.view, th = this.thief;
    this.follow = false;
    V.music(null);
    const far = this.at(th, 140, 700);
    th.go(far, { anim: 'flee', face: 'panic', route: false, then: (x) => x.fade(0) });
    this.later(1.5, () => th.fade(0.4));
    if (this.cop) {
      this.cop.stop('think', faceTo(this.cop.x, this.cop.y, far.x, far.y), 'thinking');
      this.cop.say('sThink', null, 0, null, 2.6);
      this.q = this.sheet('fx_question_mark', this.cop.x, this.cop.y - 150, { depth: 40000 });
    }
  }

  update(dt) {
    super.update(dt);
    if (this.leaving || this.done) return;
    if (this.q && this.cop) this.q.setPosition(this.cop.x, this.cop.y - 150);
    // the officer runs after the culprit (re-aimed twice a second); caught up -> the chase has been shown
    if (this.follow && this.cop) {
      this.aimT = (this.aimT || 0) - dt;
      if (this.aimT <= 0) { this.aimT = 0.5; const th = this.thief; this.cop.go({ x: th.x - 34, y: th.y + 6 }, { anim: 'run', route: false }); if (this.R() < 0.12) this.view.sound('sfx_police_whistle', this.cop.x, this.cop.y, 0.4); }
      const d = Math.hypot(this.cop.x - this.thief.x, (this.cop.y - this.thief.y) * 2);
      if (d < 90) this.close = true;
      if (this.close && this.t - this.chaseT >= (this.view.cfg.minShow['theft:chase'] || 12)) this.view.shown(this.id, 'chase');
    }
  }

  end() { this.view.music(null); super.end(); }
}

void POLICE;
