// 새치기 — a little queue squabble at a shop door: four neighbours wait in line, someone hurries in front, the next
// in line wags a finger (argue, "새치기하면 안 돼요!", emote_anger), the line wonders (think / ?), the cutter says sorry
// (sad, emote_sweat, "앗, 죄송해요! 뒤로 갈게요") and walks to the back; the line shuffles up.
//   argue -> done (apology)   (a queue that turns into a scuffle starts its own scuffle incident)

import { Scene, AXIS } from './Scene.js';
import { faceTo } from './art.js';

export class QueueScene extends Scene {
  start() {
    const shop = this.shop = this.building(this.inc.place);
    if (!shop) { this.done = true; return; }
    this.anchor = shop;
    const d = this.door(shop);
    // the line runs from the door along the street (towards screen down-right), facing the door
    this.spots = [];
    for (let k = 0; k < 6; k++) this.spots.push(this.at({ x: d.x, y: d.y }, 28 + k * 4, 30 + k * 40));
    this.line = [];
    for (let k = 0; k < 4; k++) {
      const s = this.spots[k];
      const ref = k === 0 ? this.inc.cast && this.inc.cast.victim : { sid: 300 + k };
      const a = this.actor(this.look(ref, 'line', k), s.x + AXIS.x * 200, s.y + AXIS.y * 200, 'NW');
      a.fadeIn = 0; a.fade(0);
      a.go(s, { anim: 'walk', route: false, then: (x) => x.play('idle', faceTo(x.x, x.y, d.x, d.y)) });
      this.line.push(a);
    }
    this.victim = this.line[0];
    const from = this.at(this.spots[0], 220, -260);
    this.cutter = this.actor(this.look(this.inc.cast && this.inc.cast.culprit, 'cutter', 9), from.x, from.y, 'NE');
    this.later(1.4, () => this.cutter.go(this.at(this.spots[0], -2, -42), { anim: 'run', route: false, then: (x) => { x.play('idle', faceTo(x.x, x.y, d.x, d.y)); this.argue(); } }));
  }

  argue() {
    if (this.argued) return;
    this.argued = true;
    const v = this.victim, c = this.cutter;
    v.play('argue', faceTo(v.x, v.y, c.x, c.y), 'angry');
    v.say('sQueue', null, (this.id | 0) % 2, 'emote_anger', 2.6);
    this.later(0.8, () => { for (const a of this.line.slice(1)) { a.play('think', faceTo(a.x, a.y, c.x, c.y), 'thinking'); } this.q = this.sheet('fx_question_mark', this.line[2].x, this.line[2].y - 140, { depth: 40000 }); });
    if (this.phaseName === 'done' || this.inc.outcome === 'apology') this.later(2.4, () => this.sorry());
  }

  phase(name, inc) {
    super.phase(name, inc);
    if (name === 'done' && this.argued) this.later(0.8, () => this.sorry());
  }

  sorry() {
    if (this.sorried) return;
    this.sorried = true;
    const c = this.cutter, v = this.victim;
    if (this.q) { this.unsheet(this.q); this.q = null; }
    c.play('sad', faceTo(c.x, c.y, v.x, v.y), 'sheepish');
    c.say('sQueueSorry', null, 0, 'emote_sweat', 2.4);
    this.later(1.8, () => {
      v.play('happy', faceTo(v.x, v.y, c.x, c.y)); v.emote('emote_heart');
      for (const a of this.line.slice(1)) a.play('idle', a.dir);
      const back = this.spots[4];
      c.go(this.at(back, 18, 0), { anim: 'walk', route: false, then: (x) => x.play('idle', 'NW') });
    });
  }

  update(dt) {
    super.update(dt);
    if (this.q && this.line[2]) this.q.setPosition(this.line[2].x, this.line[2].y - 140);
  }

  end() { if (this.argued && !this.sorried) this.sorry(); super.end(); }
}
