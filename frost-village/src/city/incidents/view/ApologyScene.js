// The happy ending of a little incident: saying sorry.
//   theft  (release) at the police station door: the culprit bows (sad, "정말 죄송해요. 두 배로 갚을게요"), the shop
//          owner forgives with a heart ("다음부턴 그러지 마요~"), the officer waves, everyone goes home
//   window (done, the next morning) at the owner's door: the kid with a parent, "유리창 깨서 죄송해요…" — "괜찮아,
//          다음엔 조심하렴", a coin sparkle (the parent pays for the pane)

import { Scene } from './Scene.js';
import { faceTo } from './art.js';
import { POLICE } from '../layout.js';
import { sdef } from './art.js';

export class ApologyScene extends Scene {
  start() {
    const V = this.view, I = this.inc, C = I.cast || {};
    let at;
    if (I.kind === 'theft') {
      const d = sdef('police_station') || {};
      const dp = d.doorPoint || [-127, 38];
      at = { x: POLICE.x + dp[0], y: POLICE.y + dp[1] + 30 };
      const cop = this.actor(this.look((C.officers || [])[0] || { sid: 504 }, 'officer', 0), at.x + 20, at.y - 10, 'SW');
      cop.play('idle', 'SW');
      this.cop = cop;
    } else {
      const b = this.building(I.building);
      if (!b) { this.done = true; return; }
      at = this.door(b);
    }
    this.anchor = at;
    const who = this.actor(this.look(C.culprit, I.kind === 'window' ? 'kid' : 'culprit', 1), at.x - 120, at.y + 70, 'NE', { kid: I.kind === 'window' });
    const other = this.actor(this.look(C.victim, 'victim', 2), at.x, at.y, 'SW');
    other.play('idle', faceTo(other.x, other.y, who.x, who.y));
    this.who = who; this.other = other;
    if (I.kind === 'window') { this.parent = this.actor(this.look({ sid: 700 + (this.id % 9) }, 'parent', 3), at.x - 150, at.y + 96, 'NE'); this.parent.go(this.at(at, 70, -60), { anim: 'walk', route: false, then: (x) => x.play('idle', faceTo(x.x, x.y, other.x, other.y)) }); }
    who.go(this.at(at, 56, -28), { anim: 'walk', route: false, then: (x) => this.sorry() });
  }

  sorry() {
    const V = this.view, I = this.inc, who = this.who, other = this.other;
    who.play('sad', faceTo(who.x, who.y, other.x, other.y), 'sheepish');
    who.say(I.kind === 'window' ? 'sWindowSorry' : 'sSorry', null, (this.id | 0) % 2, 'emote_sweat', 2.6);
    this.later(2.4, () => {
      other.play('happy', faceTo(other.x, other.y, who.x, who.y));
      other.say(I.kind === 'window' ? 'sWindowOk' : 'sForgive', { item: V.itemName(I.item) }, (this.id | 0) % 2, 'emote_heart', 2.6);
      if (this.parent) V.burst(this.parent.x, this.parent.y - 90, 'coin');
      if (this.cop) this.cop.play('wave', this.cop.dir);
    });
    this.later(4.6, () => { who.play('happy', who.dir); who.emote('emote_heart'); });
  }
}
