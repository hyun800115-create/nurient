// (v4.2 touch, docs/기획서_v4_2_촌장.md §13) 창고 직원: the 창고's porters grow with what the village makes.
//   The village's making (raw on the collection piles + products of the stations and workshops + the boat's catch,
//   counted by Game.noteMade) is followed as a per-minute rate (an average over warehouse.crew.window s). The crew
//   it calls for is  target = clamp(base + floor(max(0, rate − from) / perMin), base, cap)  (base = warehouse.porters, 2:
//   the two who come with the 창고 follow a village making `from` a minute; every perMin more brings one more).
//   One more walks in along the roads from the edge of the village when the target is above the crew (one every
//   warehouse.crew.every s at most), free of charge, with a banner and a line in the next 서리 소식. Nobody is ever sent
//   away (no flapping): the count only grows, and it is saved (v42.crew). An older save starts from what it had and
//   grows again as its village makes things (never below what was there).
// Needs: the 창고 (v3). The first 20 minutes never change (no 창고 then).

import { BALANCE } from '../data/balance.js';
import { t } from '../data/strings.js';
import { gdist } from '../core/Iso.js';
import { WarehousePorter } from '../entities/Worker.js';

const C = () => (BALANCE.warehouse && BALANCE.warehouse.crew) || {};
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

export class WarehouseCrew {
  constructor(gs, v42, saved) {
    this.gs = gs;
    this.v42 = v42;
    const s = (saved && saved.crew && typeof saved.crew === 'object') ? saved.crew : {};
    this.extra = Math.max(0, Math.floor(num(s.n, 0)));     // crew members beyond the base who have come
    this.rate = Math.max(0, num(s.rate, 0));                // made per minute (moving average)
    this.seen = this.rate > 0;                              // a rate worth trusting (a save carries it; else after a while)
    this.watchT = 0;                                        // seconds the rate has been measured since the load
    this.lastN = null;
    this.sampleT = 0;
    this.sinceT = Math.max(0, num(s.since, 0));             // seconds since the last arrival
    this.arrivals = 0;                                      // (this session)
  }

  get base() { return Math.max(0, Math.min(6, Math.floor(BALANCE.warehouse.porters) || 2)); }
  get cap() { return Math.max(this.base, Math.floor(num(C().cap, 6))); }
  /** the crew the village's making calls for now */
  target() {
    const per = Math.max(1, num(C().perMin, 70)), from = Math.max(0, num(C().from, 300));
    return Math.max(this.base, Math.min(this.cap, this.base + Math.floor(Math.max(0, this.rate - from) / per)));
  }
  /** the 창고's porters now (base + those who came) */
  crew() { const W = this.gs.warehouse; return W && W.porters ? W.porters.length : 0; }

  /** after the restore: the ones who had come are back at the 창고 (no walk) */
  afterRestore() {
    const W = this.gs.warehouse;
    if (!W) return;
    const want = Math.min(this.cap, this.base + this.extra);
    while (W.porters.length < want) this.spawn(true);
  }

  update(dt) {
    const gs = this.gs;
    // the rate: the count of things made, sampled every 5 s, averaged over crew.window s
    this.sampleT -= dt;
    if (this.sampleT <= 0) {
      const step = 5 - this.sampleT;
      this.sampleT = 5;
      const n = gs.madeN || 0;
      if (this.lastN !== null && step > 0) {
        const inst = Math.max(0, n - this.lastN) * 60 / step;
        const W = Math.max(30, num(C().window, 180));
        // (the first minutes after a load fill the average quickly, then it moves slowly)
        this.watchT += step;
        const k = this.seen ? 1 - Math.exp(-step / W) : Math.min(1, step / Math.max(step, this.watchT));
        this.rate += (inst - this.rate) * k;
        if (!this.seen && this.watchT >= Math.min(W, 60)) this.seen = true;
      }
      this.lastN = n;
    }
    this.sinceT += dt;
    const W = gs.warehouse;
    if (!W || !W.enabled || !this.seen) return;
    // one more walks in when the village makes more than the crew can follow (one at a time, every crew.every s)
    if (this.crew() < this.target() && this.sinceT >= Math.max(5, num(C().every, 60))) this.arrive();
  }

  /** one more 창고 직원 walks in from the edge of the village */
  arrive() {
    const gs = this.gs;
    const wp = this.spawn(false);
    if (!wp) return;
    this.extra = Math.max(this.extra, this.crew() - this.base);
    this.sinceT = 0;
    this.arrivals++;
    gs.ui.banner(t('crewCame'), t('crewSub', { n: this.crew() }));
    const N = this.v42.news;
    if (N && N.today) N.today.crew = (N.today.crew || 0) + 1;
    gs.events.emit('crewArrived', this.crew());
    gs.save(true);
  }

  /** a new 창고 직원: instant = at the 창고 (a restore), else at a village entry off screen walking in */
  spawn(instant) {
    const gs = this.gs, W = gs.warehouse;
    if (!W) return null;
    const home = WarehousePorter.homeFor(gs, W, W.porters.length);
    const from = instant ? home : this.entryPoint(W);
    const wp = new WarehousePorter(gs, W, from.x, from.y, gs.porters.length);
    wp.homePt = home;
    gs.porters.push(wp);
    W.porters.push(wp);
    if (gs.life) gs.life.release(wp.key);
    if (!instant) {
      wp.state = 'arrive';
      wp.arriveT = 0;
      wp.go(home.x, home.y);
      wp.sprite.setAlpha(0); wp.shadow.setAlpha(0);
      gs.tweens.add({ targets: [wp.sprite, wp.shadow], alpha: 1, duration: 400 });
    }
    return wp;
  }

  /** the nearest of the village's ways in that is off screen (like the settlers) */
  entryPoint(W) {
    const gs = this.gs, R = gs.roads;
    const ids = ['w_gate_n', 'w_gate_m', 'gate', gs.territory && gs.territory.isOpen('rail') ? 'v_link_w' : null].filter(Boolean);
    let best = null, bd = Infinity;
    for (const id of ids) {
      const n = R.byId[id];
      if (!n) continue;
      const d = gdist(n.x, n.y, W.x, W.y) + (gs.isOnScreen(n.x, n.y, 60) ? 4000 : 0);
      if (d < bd) { bd = d; best = n; }
    }
    return best ? { x: best.x, y: best.y } : { x: W.outPad.x + 300, y: W.outPad.y + 200 };
  }

  serializeInto(o) {
    o.crew = { n: Math.max(this.extra, Math.max(0, this.crew() - this.base)), rate: Math.round(this.rate), since: Math.round(Math.min(600, this.sinceT)) };
  }

  state() {
    return { crew: this.crew(), base: this.base, extra: this.extra, target: this.target(), cap: this.cap, rate: Math.round(this.rate), seen: this.seen, made: this.gs.madeN || 0, arrivals: this.arrivals, since: Math.round(this.sinceT) };
  }

  hooks(H) {
    // (tests) set the rate / let one walk in now
    H.crew = (o) => {
      if (o && Number.isFinite(o.rate)) { this.rate = o.rate; this.seen = true; }
      if (o && o.now) this.sinceT = 1e6;
      return this.state();
    };
  }
}
