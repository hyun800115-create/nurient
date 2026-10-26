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
// ((v4.2.1 물류 손질, docs/logistics_plan.md LD4 / §5.4) the seats still grow with production, but one more walks in only
//   when the crew is busy on REAL-USE jobs — carrying to a place that uses the thing (sink prio ≥ crew.useFrom 40: a
//   shelf, a workshop, the restaurant; not the 창고 STORE 10 or the dock SURPLUS 12) — at least crew.busyAt (0.8) of the
//   time (an average over crew.window s), and such a job has waited crew.backlogS s with nobody free. Overflow carried
//   into the 창고 and raw runs to the dock are true almost all the time late and no longer call more people.

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
    this.bannerT = Infinity;                                // seconds since the last big banner (this session)
    // ((v4.2.1) the need gate: share of crew time on real-use jobs (moving average), seconds a use job has waited)
    this.useBusy = 0;
    this.backlogT = 0;
    this.needT = 0;
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
    this.bannerT += dt;
    const W = gs.warehouse;
    if (!W || !W.enabled) return;
    // ((v4.2.1) once a second: how busy the crew is on real-use jobs, and whether such a job waits for a free member
    this.needT -= dt;
    if (this.needT <= 0) { const step = 1 - this.needT; this.needT = 1; this.sampleNeed(W, Math.min(5, step)); }
    if (!this.seen) return;
    // one more walks in when the village makes more than the crew can follow (one at a time, every crew.every s) and
    // the crew is busy on real-use jobs with one waiting (v4.2.1)
    if (this.crew() < this.target() && this.sinceT >= Math.max(5, num(C().every, 60)) && this.needMet()) this.arrive();
  }

  /** ((v4.2.1) the need gate is met: use-busy ≥ crew.busyAt and a use job waited ≥ crew.backlogS */
  needMet() {
    if (this.forceOnce || this.needForced) return true;
    return this.useBusy >= num(C().busyAt, 0.8) && this.backlogT >= num(C().backlogS, 60);
  }

  /** ((v4.2.1) one sample of the crew: the use-busy share (moving average over crew.window) and the use-job wait */
  sampleNeed(W, step) {
    let n = 0, use = 0, idle = 0;
    for (const p of W.porters) {
      if (p.state === 'arrive') continue;
      n++;
      if (p.onUseJob && p.onUseJob()) use++;
      // (free = standing without a job for a moment; between two jobs a member is idle for a fraction of a second)
      if (p.state === 'idle' && !p.job && (p.idleT || 0) >= 2) idle++;
    }
    if (!n) { this.backlogT = 0; return; }
    const win = Math.max(30, num(C().window, 180)), k = 1 - Math.exp(-step / win);
    this.useBusy += (use / n - this.useBusy) * k;
    // a use job waits only while nobody is free to take it (an idle member would take it on his next look)
    if (idle === 0 && this.useJobWaiting(W)) this.backlogT += step; else this.backlogT = 0;
  }

  /** ((v4.2.1) is there a real-use job for the crew that nobody has taken: something the 창고 holds that a place wants
   *  (prio ≥ 45), an output past warehouse.overflowAt that a using place wants straight away, or the fish link */
  useJobWaiting(W) {
    const gs = this.gs, L = gs.logistics;
    if (!L) return false;
    const taken = (pred) => gs.porters.some((p) => p.wh && p.job && pred(p.job));
    const types = W.types();
    if (types.length) {
      const b = L.bestAny(types, W.outPad.x, W.outPad.y, { minPrio: 45, noStore: true });
      if (b && !taken((j) => j.kind === 'out' && j.sink === b.sink && j.type === b.type)) return true;
    }
    const from = Math.max(num(C().useFrom, 40), 1);
    const at = num(BALANCE.warehouse.overflowAt, 0.6);
    for (const s of gs.sources ? gs.sources() : []) {
      if (!s.enabled || !s.outStack || s.outStack.max <= 0 || s.outStack.count < s.outStack.max * at) continue;
      if (taken((j) => j.kind === 'in' && j.src === s)) continue;
      if (s.recipe && s.recipe.out === 'tool') continue;       // (the forge's runs are its own porter's: Worker leaveToOwnPorter)
      const top = s.outStack.items[s.outStack.items.length - 1];
      if (!top) continue;
      if (L.best(top.type, s.outPad.x, s.outPad.y, { minPrio: from, noStore: true })) return true;
    }
    const probe = W.porters.find((p) => p.linkJob);
    if (probe && probe.linkJob()) return true;
    return false;
  }

  /** one more 창고 직원 walks in from the edge of the village */
  arrive() {
    const gs = this.gs;
    const wp = this.spawn(false);
    if (!wp) return;
    this.extra = Math.max(this.extra, this.crew() - this.base);
    this.sinceT = 0;
    this.forceOnce = false;
    this.backlogT = 0;
    this.arrivals++;
    // (one big banner, then a small toast for the next ones within crew.bannerGap s: an older save's busy village calls
    //  for several at once after the load — four banners in six minutes was too many)
    // ((v4.2 final) through the banner queue: not over an offer's banner shown the same second)
    if (this.bannerT >= Math.max(0, num(C().bannerGap, 300))) { const n = this.crew(); if (this.v42.queueBanner) this.v42.queueBanner('crew', () => t('crewCame'), () => t('crewSub', { n })); else gs.ui.banner(t('crewCame'), t('crewSub', { n })); this.bannerT = 0; }
    else if (gs.ui.toast) gs.ui.toast(t('crewToast', { n: this.crew() }), 2200);
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
      wp.cameFrom = { x: Math.round(from.x), y: Math.round(from.y) };
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
    return { crew: this.crew(), base: this.base, extra: this.extra, target: this.target(), cap: this.cap, rate: Math.round(this.rate), seen: this.seen, made: this.gs.madeN || 0, arrivals: this.arrivals, since: Math.round(this.sinceT),
      useBusy: +this.useBusy.toFixed(3), backlogT: Math.round(this.backlogT), need: this.needMet() };
  }

  hooks(H) {
    // (tests) set the rate / let one walk in now
    H.crew = (o) => {
      if (o && Number.isFinite(o.rate)) { this.rate = o.rate; this.seen = true; }
      // (now: the next one walks in at once — the time gap and (v4.2.1) the need gate skipped once)
      if (o && o.now) { this.sinceT = 1e6; this.forceOnce = true; }
      // ((v4.2.1) tests: need = the need gate counts as met (true) / measured again (false); useBusy 0–1 and backlog
      //  seconds set its measures)
      if (o && typeof o.need === 'boolean') this.needForced = o.need;
      if (o && Number.isFinite(o.useBusy)) this.useBusy = Math.max(0, Math.min(1, o.useBusy));
      if (o && Number.isFinite(o.backlog)) this.backlogT = Math.max(0, o.backlog);
      return this.state();
    };
  }
}
