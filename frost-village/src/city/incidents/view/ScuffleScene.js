// 티격태격 — a cartoon scuffle: two neighbours of the same age band argue, vanish into a snow-powder dust cloud with
// stars and flailing mittens (fx_fight_cloud_back / _front around their cityfolk `fight` anims; the simple cloud when
// an outfit cannot play `fight`), an officer (or a brave bystander) blows the whistle, poof — they stand apart, dizzy,
// and shake hands. Nobody is hurt.
//   fight     argue (1.6 s, "네가 먼저 그랬잖아!") -> the cloud -> shown after minShow (ack)
//   separate  whistle, poof, apart, sweat drops
//   done      handshake, hearts

import { Scene } from './Scene.js';
import { faceTo } from './art.js';

export class ScuffleScene extends Scene {
  start() {
    const p = this.view.pos(this.inc.place);
    if (!p) { this.done = true; return; }
    const c = this.c = this.front(p, 120, (this.id % 3) * 40 - 40);
    this.anchor = c;
    const C = this.inc.cast || {};
    this.a = this.actor(this.look(C.culprit, 'a', 0), c.x - 22, c.y, 'E');
    this.b = this.actor(this.look(C.victim, 'b', 1), c.x + 22, c.y, 'W');
    this.a.play('argue', 'E', 'angry'); this.b.play('argue', 'W', 'angry');
    this.a.say('sFight', null, 0, 'emote_anger', 1.8);
    this.later(0.9, () => this.b.say('sFight', null, 1, 'emote_anger', 1.6));
    this.gather(3, this.at(c, 120, 10), c, { anims: ['shocked', 'point', 'phone'] });
    this.view.sound('sfx_crowd_gasp', c.x, c.y, 0.5);
    const ph = this.inc.phase;
    if (ph === 'fight') this.later(1.6, () => this.cloud());
    else if (ph === 'separate') this.separate();
  }

  cloud() {
    if (this.inCloud || this.parted) return;
    this.inCloud = true; this.cloudT = this.t;
    const V = this.view, c = this.c, A = this.a, B = this.b;
    A.play('fight', 'E', 'angry'); B.play('fight', 'W', 'angry');
    const layered = A.rig && B.rig && A.rig.anim === 'fight' && B.rig.anim === 'fight';
    this.layered = layered;
    if (layered) {
      this.cback = this.sheet('fx_fight_cloud_back', c.x, c.y + 6, { depth: Math.min(A.y, B.y) - 0.5 });
      this.cfront = this.sheet('fx_fight_cloud_front', c.x, c.y + 6, { depth: Math.max(A.y, B.y) + 0.5 });
    } else {
      A.show(false); B.show(false);
      this.simple = this.sheet('fx_fight_cloud', c.x, c.y + 6, { depth: c.y + 1 });
    }
    const l = V.loop('sfx_comic_fight', c.x, c.y, 0.5);
    if (l) { this.loops.push(l); this.fightLoop = l; }
  }

  phase(name, inc) {
    super.phase(name, inc);
    if (name === 'separate') this.separate();
  }

  separate() {
    if (this.parted) return;
    this.parted = true;
    const V = this.view, c = this.c;
    const C = this.inc.cast || {};
    const o = (C.officers && C.officers[0]) || (C.crew && C.crew[0]) || null;
    const from = this.at(c, 80, -320);
    const cop = this.cop = this.actor(this.look(o || { sid: 503 }, o ? 'officer' : 'bystander', 2), from.x, from.y, 'E');
    cop.go(this.at(c, 46, -50), { anim: 'run', route: false, then: (x) => {
      x.play('point', faceTo(x.x, x.y, c.x, c.y));
      x.say('sSeparate', null, o ? 1 : 0, 'emote_exclaim', 2.2);
      V.sound('sfx_police_whistle', x.x, x.y, 0.7);
      this.later(0.7, () => this.poof());
    } });
  }

  poof() {
    const V = this.view, c = this.c, A = this.a, B = this.b;
    this.unsheet(this.cback); this.unsheet(this.cfront); this.unsheet(this.simple);
    this.cback = this.cfront = this.simple = null;
    if (this.fightLoop) { this.fightLoop.stop(); this.loops.splice(this.loops.indexOf(this.fightLoop), 1); this.fightLoop = null; }
    this.sheet('fx_poof', c.x, c.y - 30, { depth: c.y + 2, once: true, scale: 1.3 });
    A.show(true); B.show(true);
    { const pa = this.at(c, 0, -58), pb = this.at(c, 0, 58); A.set(pa.x, pa.y); B.set(pb.x, pb.y); }
    A.play('sad', faceTo(A.x, A.y, B.x, B.y), 'sheepish'); B.play('sad', faceTo(B.x, B.y, A.x, A.y), 'sheepish');
    A.emote('emote_sweat'); this.later(0.4, () => B.emote('emote_sweat'));
    this.later(2.4, () => this.shake());
  }

  shake() {
    if (this.shaken) return;
    this.shaken = true;
    const A = this.a, B = this.b;
    A.go({ x: this.c.x - 22, y: this.c.y }, { anim: 'walk', route: false, then: (x) => { x.play('talk', 'E'); x.say('sShake', null, 0, null, 2); } });
    B.go({ x: this.c.x + 22, y: this.c.y }, { anim: 'walk', route: false, then: (x) => { x.play('talk', 'W'); this.later(1.4, () => { x.say('sShake', null, 1, 'emote_heart', 2.2); x.play('happy', 'W'); A.play('happy', 'E'); A.emote('emote_heart'); }); } });
    this.later(2.2, () => this.all(this.crowd, 'clap', this.c));
  }

  update(dt) {
    super.update(dt);
    if (this.inCloud && !this.parted && this.t - this.cloudT >= (this.view.cfg.minShow['scuffle:fight'] || 6)) this.view.shown(this.id, 'fight');
  }

  end() { if (this.parted && !this.shaken) this.shake(); super.end(); }
}
