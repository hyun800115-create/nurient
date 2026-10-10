// 이사 — moving in and out (not an incident: it plays with 사건·사고 off too). One moving set piece at a time, only
// when the home is near the view; otherwise the signs and the welcome mat (Decor) tell the story.
//   in   the moving truck (assets/logistics moving_truck) pulls up at the curb, opens its ramp (`unload`), a furniture
//        pile appears behind it, two movers carry boxes (carry_box) to a box stack by the door (sfx_box_drop), the new
//        family walks up, waves and says "여기가 우리 새 집이야!", a welcome mat goes down, the truck leaves
//   out  the for-sale sign is up; the movers carry boxes from the door into the truck, the family waves goodbye to a
//        neighbour ("그동안 고마웠어요!") and walks off down the street; the sold sign goes up

import { Scene } from './Scene.js';
import { faceTo, put, sdef, DEPTH } from './art.js';
import { Vehicle } from './Vehicle.js';

export class MovingScene extends Scene {
  start() {
    const V = this.view, J = this.cmd.job;
    this.job = J;
    const b = this.b = this.building(String(J.home || '').split('#')[0]);
    if (!b) { this.done = true; return; }
    this.anchor = b;
    const d = this.d = this.door(b);
    const park = this.park = this.front(b, 150, 150);
    const from = this.at(park, 0, -760);
    const truck = this.truck = new Vehicle(V, 'moving_truck', from.x, from.y, 'SE', { driver: { preset: 'mover', seed: 31 + (this.id | 0) } });
    this.vehicles.push(truck);
    const lp = V.loop('sfx_moving_truck', truck.x, truck.y, 0.35, () => ({ x: truck.x, y: truck.y }));
    if (lp) { this.loops.push(lp); this.truckLoop = lp; }
    truck.drive([park], () => this.parked());
    this.boxes = 0;
    this.stack = put(V.scene, 'moving_boxes_stack', d.x - 40, d.y + 26);
    if (this.stack) this.stack.setVisible(J.op === 'out');
    this.fam = [];
    const n = Math.max(1, Math.min(3, (J.members || []).length || 2));
    for (let k = 0; k < n; k++) {
      const ref = { sid: (J.members || [])[k], pid: (J.pids || [])[k] };
      const a = J.op === 'in' ? this.actor(this.look(ref, 'family', k), park.x + 520 + k * 34, park.y + 260 + k * 16, 'NW', { kid: k === 2 }) : this.actor(this.look(ref, 'family', k), d.x + k * 20, d.y + 8 + k * 6, 'SW', { kid: k === 2 });
      if (J.op === 'in') { a.fadeIn = 0; a.fade(0); }
      this.fam.push(a);
    }
  }

  parked() {
    const V = this.view, t = this.truck;
    if (this.truckLoop) { this.truckLoop.stop(); this.loops.splice(this.loops.indexOf(this.truckLoop), 1); this.truckLoop = null; }
    t.setAnim('unload', true);
    this.later(1.1, () => {
      const r = t.point('rampPoint');
      this.ramp = r;
      if (this.job.op === 'in') { this.pile = put(V.scene, 'furniture_pile_s', r.x - 70, r.y + 40); }
      this.movers = [0, 1].map((k) => { const a = this.actor({ preset: 'mover', seed: 200 + k + (this.id | 0) * 3 }, r.x + k * 26, r.y + 10 + k * 8, 'SW'); a.k = k; a.trips = 0; return a; });
      this.movers[0].say('sMovers', null, 0, null, 1.8);
      for (const m of this.movers) this.later(m.k * 1.6, () => this.trip(m));
      if (this.job.op === 'in') this.later(3, () => this.familyIn());
      else this.later(2, () => this.familyOut());
    });
  }

  /** one box from the truck to the door (in) or from the door to the truck (out) */
  trip(m) {
    if (this.leaving) return;
    const V = this.view, d = this.d, r = this.ramp;
    const sd = sdef('moving_boxes_stack') || {};
    const drop = sd.dropPoint ? { x: d.x - 40 + sd.dropPoint[0], y: d.y + 26 + sd.dropPoint[1] } : { x: d.x - 30, y: d.y + 40 };
    const into = this.job.op === 'in';
    const A = into ? r : drop, B = into ? drop : r;
    m.go({ x: B.x + (m.k ? 14 : -14), y: B.y + 4 }, { anim: 'carry_box', route: false, then: (x) => {
      V.sound('sfx_box_drop', x.x, x.y, 0.3);
      this.boxes++;
      if (into && this.stack && !this.stack.visible) this.stack.setVisible(true);
      x.trips++;
      if (x.trips >= 2) { x.go({ x: r.x + 10, y: r.y + 14 }, { anim: 'walk', route: false, then: (y) => y.play('idle', 'SW') }); return; }
      x.go({ x: A.x + (x.k ? 12 : -12), y: A.y + 6 }, { anim: 'walk', route: false, then: (y) => this.trip(y) });
    } });
  }

  familyIn() {
    const d = this.d;
    this.fam.forEach((a, k) => a.go({ x: d.x - 70 + k * 30, y: d.y + 58 + k * 12 }, { anim: 'walk', route: false, then: (x) => { x.play('wave', faceTo(x.x, x.y, d.x, d.y)); if (k === 0) { x.say('sMoveIn', null, 1, 'emote_heart', 2.6); this.mat(); } } }));
  }

  mat() {
    const V = this.view, d = this.d;
    if (this.matImg) return;
    this.matImg = put(V.scene, 'welcome_mat', d.x, d.y + 4, DEPTH.GROUND_DECAL + 5);
    V.burst(d.x, d.y - 40, 'heart');
  }

  familyOut() {
    const V = this.view, d = this.d, b = this.b;
    const nb = this.at(d, 160, -220);
    const n = this.actor({ seed: 600 + (this.id | 0) }, nb.x, nb.y, 'NE');
    n.play('wave', faceTo(n.x, n.y, d.x, d.y));
    this.fam.forEach((a, k) => {
      a.go(this.at(d, 60 + k * 14, -40 - k * 30), { anim: 'walk', route: false, then: (x) => {
        x.play('wave', faceTo(x.x, x.y, n.x, n.y));
        if (k === 0) x.say('sMoveOut', null, 0, 'emote_heart', 2.6);
        this.later(3.2, () => x.go(this.at(x, 40, 640), { anim: 'walk', route: false, then: (y) => y.fade(0) }));
      } });
    });
    void b;
  }

  update(dt) {
    super.update(dt);
    if (this.leaving || this.done || !this.truck) return;
    const J = this.job;
    // the job's time is up (or every box is moved): the truck leaves
    if ((this.boxes >= 4 && this.t > 18) || this.t > (J.dur || 46) - 2) this.view.endMoving(this);
  }

  destroy() {
    for (const o of [this.stack, this.pile, this.matImg]) if (o) o.destroy();
    super.destroy();
  }
}
