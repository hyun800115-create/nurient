// 눈덩이 유리창 — a kid's snowball goes astray: the kid winds up (point), the snowball (emotes fx_snowball) arcs onto a
// window, splat (fx_snow_splat) with a soft bump (sfx_collapse_soft at 0.3 — there is no glass sound on purpose), the
// kid gasps (shocked, "앗! 유리창이…!") and scampers off; the owner comes out puzzled (think + ?). The apology comes
// the next morning with a parent (ApologyScene).
//   crash -> wait (the scene's tail)

import { Scene } from './Scene.js';
import { faceTo, fireMountOf, put } from './art.js';

export class WindowScene extends Scene {
  start() {
    const V = this.view;
    const b = this.b = this.building(this.inc.building) || this.building(this.inc.place);
    if (!b) { this.done = true; return; }
    this.anchor = b;
    const e = fireMountOf(b.key);
    const w = (e.windows && e.windows[0]) || [-Math.round(b.fp[0] * 0.27), -Math.round(b.top * 0.33)];
    this.win = { x: b.x + w[0], y: b.y + w[1] };
    const spot = this.front(b, 130, -30);
    const C = this.inc.cast || {};
    const kid = this.kid = this.actor(this.look(C.culprit, 'kid', 0), spot.x - 90, spot.y + 45, 'NE', { kid: true });
    kid.go(spot, { anim: 'walk', route: false, then: (x) => { x.play('point', faceTo(x.x, x.y, this.win.x, this.win.y)); this.later(0.5, () => this.throw()); } });
    this.friend = this.actor(this.look({ sid: 401 + (this.id % 7), age: 9 }, 'friend', 1), spot.x - 60, spot.y + 40, 'NE', { kid: true });
    this.friend.play('happy', 'NE');
  }

  throw() {
    const V = this.view, k = this.kid, w = this.win;
    const ball = put(V.scene, 'fx_snowball', k.x + 18, k.y - 80, 40000);
    if (!ball) { this.hit(); return; }
    ball.setScale(0.55);
    (this.objs || (this.objs = [])).push(ball);
    const x0 = ball.x, y0 = ball.y;
    this.tween(0.65, (s) => { ball.setPosition(x0 + (w.x - x0) * s, y0 + (w.y - y0) * s - 90 * 4 * s * (1 - s)); ball.setAngle(s * 360); }, () => { ball.setVisible(false); this.hit(); });
  }

  hit() {
    const V = this.view, k = this.kid, w = this.win, b = this.b;
    this.sheet('fx_snow_splat', w.x, w.y, { depth: b.y + 3, once: true, scale: 0.9 });
    V.sound('sfx_collapse_soft', w.x, w.y, 0.3);
    k.play('shocked', k.dir, 'shocked');
    k.say('sWindow', null, 0, 'emote_sweat', 2.0);
    this.friend.play('shocked', this.friend.dir);
    this.later(1.4, () => {
      k.say('sWindow', null, 1, null, 1.4);
      const away = this.at(k, 120, -420);
      k.go(away, { anim: 'run', route: false, then: (x) => x.fade(0) });
      this.friend.go(this.at(this.friend, 140, -420), { anim: 'run', route: false, then: (x) => x.fade(0) });
    });
    this.later(1.8, () => {
      const d = this.door(b);
      const o = this.owner = this.actor(this.look(this.inc.cast && this.inc.cast.victim, 'owner', 2), d.x, d.y, 'SW');
      o.go(this.at(d, 40, 10), { anim: 'walk', route: false, then: (x) => { x.play('think', 'SW', 'thinking'); x.say('sWindowWho', null, (this.id | 0) % 2, 'emote_question', 2.6); this.q = this.sheet('fx_question_mark', x.x, x.y - 150, { depth: 40000 }); } });
    });
  }
}
