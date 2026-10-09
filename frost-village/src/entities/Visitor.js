// A train visitor (v4, docs/v4_plan.md §7.2): one of the 100 townsfolk, come by the snow train to shop at our
// sellers. A Customer with a paper-doll body: it walks from our platform over the level crossing and the
// station road to its first target (the plaza market, the general store, a founded shop), joins the normal
// queue (every v3.5 rule — register, waitingPay, partial payment — still holds), then the next target or back
// to the platform, where it waits for a train home. Patience: a full line -> browse nearby, retry; give up
// after `patience` s. Satisfaction is emitted as 'v4:visitorDone' (person, frac).

import { BALANCE } from '../data/balance.js';
import { Audio } from '../core/Audio.js';
import { Customer } from './Seller.js';
import { line } from '../data/strings.js';
import { px2L4 } from '../data/world.js';

const JOIN_DIST = 260;      // px (ground) from the end of the line: join from here
const RETRY = 5;            // s between tries when the line is full

export class Visitor extends Customer {
  /** plan: { targets: [market...], want: { type, count } } */
  constructor(gs, nb, citizen, x, y, plan) {
    // (the Customer base wants a seller with a line; a founded shop target is handled by this class)
    // ((v4-B) a founded Shop has a queue too, but no entry path: the base class gets a real seller)
    const first = plan.targets.find((q) => q && q.queue && typeof q.entryPath === 'function') || gs.market;
    super(gs, first, 'tf:' + citizen.person.base, x, y, plan.want, 1, null, { person: citizen.person });
    this.nb = nb;
    this.citizen = citizen;
    this.targets = plan.targets.slice();
    this.target = this.targets[0] || first;
    this.wantPlan = plan.want;
    this.stage = 'walk';
    this.path = [];
    this.route = null; this.ri = 0;
    this.waitT = 0;
    this.patienceT = 0;
    this.got0 = 0;
    this.results = [];
    this.speed = (BALANCE.v4.visitors.speed || 105) * (0.9 + Math.random() * 0.2);
    this.state = 'visit';                    // (not a Customer state: the Market does not drive it yet)
    this.sprite.setAlpha(0); this.shadow.setAlpha(0);
    gs.tweens.add({ targets: [this.sprite, this.shadow], alpha: 1, duration: 350 });
    this.goTo(this.joinPoint());
    this.regular = !!citizen.regular;
  }

  // ---------------------------------------------------------------- where to go
  joinPoint() {
    const m = this.target;
    // (B) a founded shop: its customer points
    if (m.serve) { const cp = (m.customerPoints && m.customerPoints[0]) || m; return { x: cp.x, y: cp.y }; }
    const s = m.slotPos(Math.min(m.maxQueue - 1, m.queue.length + 1));
    return { x: s.x, y: s.y };
  }

  goTo(p) {
    const gs = this.gs;
    this.route = this.nb.route ? this.nb.route(this.x, this.y, p.x, p.y) : gs.roads.route(this.x, this.y, p.x, p.y, []);
    this.ri = 0;
    this.dest = p;
  }

  /** the way back: to a wait spot on our platform */
  exitPathOverride() { return []; }

  // ---------------------------------------------------------------- update
  update(dt, slot) {
    const gs = this.gs;
    if (!this.alive) return;
    // inside a seller's line: the Customer logic (the Market calls this with the slot)
    if (this.stage === 'shop') {
      super.update(dt, slot);
      this.checkPatience(dt);
      if (this.state === 'leave') this.leftShop();
      return;
    }
    if (slot !== undefined && slot !== null && this.stage !== 'shop') return;     // the Market only drives it while in its line
    this.lift();
    switch (this.stage) {
      case 'walk': {
        const arrived = this.follow(dt);
        const jp = this.joinPoint();
        const near = Math.hypot(this.x - jp.x, (this.y - jp.y) * 2) < JOIN_DIST;
        if (near || arrived) this.tryJoin();
        break;
      }
      case 'browse': {
        this.waitT -= dt;
        this.patienceT += dt;
        this.follow(dt);
        if (this.waitT <= 0) { this.waitT = RETRY; this.tryJoin(); }
        if (this.stage === 'browse' && this.patienceT > (BALANCE.v4.visitors.patience || 60)) { this.finishTarget(0.3); }
        break;
      }
      case 'home': {
        if (this.follow(dt)) { this.stage = 'platform'; this.vx = this.vy = 0; this.play('idle'); this.faceTo(this.x + 40, this.y - 20); this.nb.visitorAtPlatform(this); }
        break;
      }
      case 'shopB':
        // (B) waiting at a founded shop; never longer than its patience
        this.vx = this.vy = 0;
        if ((this.shopBT += dt) > (BALANCE.v4.visitors.patience || 60) * 1.5) this.finishTarget(0.3);
        break;
      case 'platform':
        this.vx = this.vy = 0;
        if (this.stack.count && this.animName !== 'carry_idle') this.locomotion(false);
        break;
      case 'board': {
        if (this.follow(dt) || (this.boardT = (this.boardT || 0) + dt) > 6) this.board();
        break;
      }
      default: break;
    }
    if (this.alive) this.sync(dt);
  }

  /** drawn higher on the raised platform */
  lift() {
    const st = this.nb.ours;
    const on = !!(st && st.onPlatform(this.x, this.y));
    const l = on ? st.lift : 0;
    if (this.sprite.lift !== l) this.sprite.lift = l;
  }

  /** walk the route; waits before the level crossing while the train is near. true on arrival */
  follow(dt) {
    const gs = this.gs, r = this.route;
    if (!r || !r.length) return true;
    const w = r[Math.min(this.ri, r.length - 1)];
    // about to step over the track? (the next point is on the other side of j = 0)
    const a = px2L4(this.x, this.y), b = px2L4(w.x, w.y);
    if ((a.j > 0.35 && b.j < 0.35) || (a.j < -0.35 && b.j > -0.35)) {
      if (this.nb.rail && this.nb.rail.blocking(this.nb.xingNear(this.x, this.y))) { this.vx = this.vy = 0; this.locomotion(false); this.waitXing = true; return false; }
    }
    this.waitXing = false;
    return gs.followRoute(this, this.speed, dt, 12);
  }

  tryJoin() {
    const m = this.target;
    // (B) a founded shop serves its own line: wait there until it calls back with how it went
    if (m && m.serve) {
      if (this.stage === 'shopB') return;
      this.stage = 'shopB'; this.vx = this.vy = 0; this.locomotion(false);
      try { m.serve(this, (frac) => { if (this.alive && this.stage === 'shopB') this.finishTarget(Number.isFinite(frac) ? frac : 0); }); } catch (e) { this.finishTarget(0); }
      this.shopBT = 0;
      return;
    }
    if (!m || !m.enabled) { this.finishTarget(0); return; }
    if (m.queue.length < m.maxQueue) {
      m.queue.push(this);
      this.stage = 'shop';
      this.state = 'arrive';
      this.path = [];
      this.arrived = false;
      this.market = m;
      this.want = { type: this.pickType(m), count: this.wantPlan.count };
      this.need = this.want.count; this.got = 0; this.value = 0; this.bought = []; this.flying = [];
      this.bubble = null; this.bubbleShown = false; this.payWait = false;
      this.patienceT = 0;
      if (this.regular && Math.random() < 0.34 && this.nb.bubbles()) this.nb.bubbles().chat(this, line('regular'), 'emote_heart', 2.2);
      return;
    }
    // the line is full: look around nearby and try again
    if (this.stage !== 'browse') { this.stage = 'browse'; this.waitT = RETRY; }
    const p = this.nb.browseSpot(m);
    if (p) this.goTo(p);
  }

  /** what this visitor wants from seller m (their favourite when it sells it) */
  pickType(m) {
    const av = m.availableFoods ? m.availableFoods() : m.goods;
    const fav = this.citizen.fav;
    if (fav && av.indexOf(fav) >= 0 && Math.random() < 0.7) return fav;
    return av.length ? av[Math.floor(Math.random() * av.length)] : m.goods[0];
  }

  /** waiting at the front with an empty shelf for too long: settle for what they got (or leave) */
  checkPatience(dt) {
    const m = this.market;
    if (this.state !== 'wait' && this.state !== 'arrive') return;
    const front = m.queue[0] === this;
    const empty = !m.goods.some((g) => m.stock.countOf(g) > 0);
    if (front && empty && this.flying.length === 0 && this.got < this.want.count) this.patienceT += dt; else if (!front) this.patienceT += dt * 0.25; else this.patienceT = 0;
    if (this.patienceT < (BALANCE.v4.visitors.patience || 60)) return;
    this.patienceT = 0;
    if (this.got > 0) { this.want.count = this.got; this.need = 0; this.updateBubble(); return; }    // pays for what it has (v3.5 register rules)
    // nothing at all: leave the line, sad
    const i = m.queue.indexOf(this);
    if (i >= 0) m.queue.splice(i, 1);
    this.hideBubble();
    this.finishTarget(0);
  }

  /** the Market completed this customer (paid): on to the next target or home */
  leftShop() {
    const m = this.market;
    const i = m.leaving.indexOf(this);
    if (i >= 0) m.leaving.splice(i, 1);
    const frac = this.want.count > 0 ? (this.got >= this.wantPlan.count ? 1 : this.got > 0 ? 0.6 : 0) : 0;
    this.finishTarget(frac);
  }

  finishTarget(frac) {
    const gs = this.gs;
    this.results.push(frac);
    this.targets.shift();
    this.target = this.targets[0] || null;
    if (this.target && (this.target.enabled || this.target.serve)) { this.stage = 'walk'; this.state = 'visit'; this.goTo(this.joinPoint()); return; }
    // done: how was it?
    const f = this.results.length ? this.results.reduce((a, b) => a + b, 0) / this.results.length : 0;
    this.frac = f;
    const B = this.nb.bubbles();
    if (B) {
      if (f >= 0.99) B.emote(this, 'emote_heart', 1.6);
      else if (f >= 0.5) B.emote(this, 'emote_dots', 1.6);
      else { B.emote(this, 'emote_tear', 1.8); if (Math.random() < 0.5) gs.time.delayedCall(900, () => { if (this.alive && B) B.chat(this, line('shopper_sad'), null, 2.2); }); }
    }
    gs.events.emit('v4:visitorDone', this.citizen, f);
    this.state = 'visit';
    this.stage = 'home';
    this.goTo(this.nb.platformSpot(this));
  }

  /** the train is in: walk to a door and get on */
  boardTrain(p) {
    if (this.stage !== 'platform' && this.stage !== 'home') return false;
    this.stage = 'board';
    this.boardT = 0;
    // (over the level crossing if still on the other side of the rails)
    this.route = this.nb.route ? this.nb.route(this.x, this.y, p.x, p.y) : [{ x: p.x, y: p.y }]; this.ri = 0;
    return true;
  }

  board() {
    if (this.stage === 'gone') return;
    this.stage = 'gone';
    const gs = this.gs;
    if (gs.isOnScreen(this.x, this.y, 200)) Audio.play('sfx_door', { volume: 0.4, throttle: 300 });
    gs.tweens.add({ targets: [this.sprite, this.shadow], alpha: 0, duration: 250, onComplete: () => this.despawn() });
    this.nb.visitorBoarded(this);
  }

  /** gone without a train (reload / cleanup): the citizen goes home abstractly */
  despawn() {
    if (!this.alive) return;
    for (const m of this.nb.sellers()) {
      const i = m.queue.indexOf(this); if (i >= 0) m.queue.splice(i, 1);
      const j = m.leaving.indexOf(this); if (j >= 0) m.leaving.splice(j, 1);
    }
    super.despawn();
    this.nb.visitorGone(this);
  }
}
