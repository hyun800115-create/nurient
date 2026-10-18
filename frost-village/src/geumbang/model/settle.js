// Settlement (plan §5.6, §5.8, pure): coins on delivery into the 물류 금고 (env.pay, source tag 'gb'), the gentle
// happiness nudge (on time: pay.happyOnTime, late: pay.happyLate — never a penalty), today's numbers and the 7-day
// history, reviews (4–5 stars only), and the doorstep boxes (nobody home / quiet hours): a box sits on the step
// (f0), gets a snow cap after door.snowCapH game hours (f1), and is taken in when a household member passes, at
// door.pickupHour or after door.keepS (never longer than a game day). ≤ door.maxDoorstep boxes, then 옆집에 맡겼어요.
// Conservation: every delivered order's value goes through env.pay exactly once (tot[2] == Σ pay); restocked
// orders pay nothing.

import { stream } from './rng.js';
import { REVIEW_TPLS } from '../strings.js';

export class Settle {
  constructor(tune, seed) {
    this.tune = tune; this.seed = seed >>> 0;
    this.today = { orders: 0, delivered: 0, coins: 0, units: 0, overnight: 0, col: 0 };
    this.col = 0;                  // 금방 집하: crates the sleds brought to the dock (all time)
    this.lockers = { A: [], P: [] };   // the apartment / plaza locker: [{ id, aid, age (s) }] (paid at the fill)
    this.days = [];                // [[orders, delivered, coins], …] newest first, ≤ 7
    this.tot = [0, 0, 0, 0];       // orders, delivered, coins, units
    this.rev = [];                 // [[tpl, aid, stars]] newest first, ≤ 12
    this.door = [];                // [{ aid, size, age (s), id, snowy }]
    this.photos = [];              // last 3 doorstep photos [{ aid, size, T }] (not saved)
    this.paid = 0;                 // Σ coins paid through env.pay (tests)
    this.happy = 0;
    this.r = stream(seed, 'settle', 0);
    this.day = -1;
  }

  newDay(day) {
    if (this.day >= 0 && day !== this.day) {
      this.days.unshift([this.today.orders, this.today.delivered, this.today.coins]);
      while (this.days.length > 7) this.days.pop();
      this.today = { orders: 0, delivered: 0, coins: 0, units: 0, overnight: 0, col: 0 };
      this.r = stream(this.seed, 'settle', day);
    }
    this.day = day;
  }

  ordered(o) { this.today.orders++; this.tot[0]++; void o; }

  /** an order reached its home: pay, nudge happiness, count, maybe a review / a doorstep box. Returns the event. */
  deliver(o, how, T, env, ctx) {
    const P = this.tune.pay;
    const coins = Math.max(0, Math.floor(o.value || 0));
    o.st = 'done'; o.tDone = T;
    const start = o.tomorrow ? Math.max(o.t0, ctx.openedAt(o.t0)) : o.t0;
    o.onTime = T - start <= P.promiseS;
    if (coins > 0 && env.pay) env.pay(coins, { id: o.id, aid: o.aid, how });
    this.paid += coins;
    if (env.happy) env.happy(o.onTime ? P.happyOnTime : P.happyLate);
    this.happy += o.onTime ? P.happyOnTime : P.happyLate;
    this.today.delivered++; this.today.coins += coins; this.today.units += o.n;
    this.tot[1]++; this.tot[2] += coins; this.tot[3] += o.n;
    let box = null;
    if (how === 'doorstep') {
      o.doorstep = true;
      if (this.door.length < this.tune.door.maxDoorstep) {
        box = { aid: o.aid, size: o.size, age: 0, id: o.id, snowy: false, x: ctx.doorOf(o.aid).x, y: ctx.doorOf(o.aid).y };
        this.door.push(box);
        this.photos.unshift({ aid: o.aid, size: o.size, T, id: o.id });
        while (this.photos.length > this.tune.door.photos) this.photos.pop();
      } else how = 'neighbour';
    }
    // a review now and then (4 or 5 stars, never fewer)
    let review = null;
    if (this.r.chance(this.tune.review.chance)) {
      review = [1 + this.r.int(REVIEW_TPLS), o.aid, this.r.chance(0.7) ? 5 : 4];
      this.rev.unshift(review);
      while (this.rev.length > this.tune.review.max) this.rev.pop();
    }
    return { t: 'delivered', id: o.id, aid: o.aid, n: o.n, coins, onTime: o.onTime, how, box: !!box, review };
  }

  /**
   * (critique H5) the lockers empty: a parcel is fetched when someone of its household passes home (apartments), at
   * door.pickupHour, or after locker.pickS — the locker has room again. Returns { t: 'lockerPickup', kind, aid, id }.
   */
  updateLockers(dt, hour, env) {
    const out = [], D = this.tune.door, pickS = (this.tune.locker && this.tune.locker.pickS) || 50;
    for (const kind of ['A', 'P']) {
      const L = this.lockers[kind];
      for (let i = L.length - 1; i >= 0; i--) {
        const b = L[i];
        b.age += dt;
        const morning = hour >= D.pickupHour && hour < D.pickupHour + 0.5 && b.age > 5;
        const passer = kind === 'A' && b.age > 5 && env.passer ? env.passer(b.aid, { age: b.age, locker: true }) : false;
        if (morning || passer || b.age >= pickS) { L.splice(i, 1); out.push({ t: 'lockerPickup', kind, aid: b.aid, id: b.id }); }
      }
    }
    return out;
  }

  /** the boxes on the steps: snow caps, taken in. Returns pickup events. */
  updateDoor(dt, hour, env, ctx) {
    const D = this.tune.door, out = [];
    const snowS = D.snowCapH * ctx.hourS;
    for (let i = this.door.length - 1; i >= 0; i--) {
      const b = this.door[i];
      b.age += dt;
      if (!b.snowy && b.age >= snowS) { b.snowy = true; out.push({ t: 'snowcap', aid: b.aid, id: b.id }); }
      const morning = hour >= D.pickupHour && hour < D.pickupHour + 0.5 && b.age > ctx.hourS;
      const passer = env.passer ? env.passer(b.aid, b) : false;
      if (morning || passer || b.age >= D.keepS) {
        this.door.splice(i, 1);
        const unbox = this.r.chance(D.unboxChance);
        out.push({ t: 'pickup', aid: b.aid, id: b.id, unbox, cat: unbox && this.r.chance(0.25), morning, snowy: b.snowy });
      }
    }
    return out;
  }
}
