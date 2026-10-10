// Ferry passengers (harbor_runtime model, docs/v5_v8_plan.md §6.4 tourists.js). Pure, seeded, transient (never
// saved: only the day / total counters are). Conservation: everyone who comes down a gangway leaves on a later ferry.
//
// A tourist's day: down the gangway (off) -> strolls the quay (stroll) -> shops at the harbour market or the seafood
// restaurant (shop: coins) -> either rides the coast train to 솔방울 and our village (station -> away) or keeps
// strolling -> when its ferry (the `stayFerries`-th one after its own) docks, it walks back to the terminal (wait;
// one who is away comes back on the next coast train, or boards unseen if the ferry leaves first) -> up the gangway
// (board) -> gone. Ferries also bring special guests (a famous chef, a merchant, a photographer) and new settlers.

import { stream } from './rng.js';

export const SPOTS = {
  market: [[56.46, -2.82], [56.92, -2.92], [57.76, -2.8], [58.23, -2.92], [59.07, -2.8], [59.52, -2.91]],
  restaurant: [[62.8, -3.41], [62.85, -3.71], [63.17, -2.7], [63.53, -2.38]],
  quay: [[66.4, -8.55], [71.6, -8.6], [81.6, -9.7], [84.3, -10.9], [61.0, -8.6], [55.9, -9.3]],
  station: [[61.0, 1.35], [61.8, 1.3], [62.6, 1.35], [63.4, 1.3]],
  wait: [[64.14, -11.55], [63.76, -11.55], [63.36, -11.55], [62.98, -11.55], [62.59, -11.54]],
  gangway: [64.47, -13.5],
  door: [62.34, -11.34],
};
export const GUESTS = ['chef', 'merchant', 'photographer'];
const SPEED = 70 / Math.hypot(64, 32);          // cells / s (townsfolk walk 70 px / s)
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export class Tourists {
  constructor(cfg, seed = 1, saved = null) {
    this.cfg = cfg;
    this.seed = seed >>> 0;
    this.list = [];               // present tourists (and the ones away)
    this.n = 0;
    this.arrived = 0; this.left = 0;            // conservation counters (this session)
    this.today = saved ? saved.today | 0 : 0;
    this.total = saved ? saved.total | 0 : 0;
    this.day = saved ? saved.day | 0 : -1;
    this.out = [];                // events for the model
  }
  F() { return this.cfg.ferry; }
  present() { return this.list.length; }
  here() { return this.list.filter((t) => t.state !== 'away'); }

  emit(e) { this.out.push(e); }
  drain() { const o = this.out; this.out = []; return o; }

  /** spot coordinates (lattice) for a state */
  spotOf(t) { return t.spot; }

  /** a ferry docked (mission id F): those due leave next; new passengers come down */
  ferryArrives(F, T, day, opts = {}) {
    const R = stream(this.seed, 'ferry:' + F);
    // 1. whose ferry is this?
    for (const t of this.list) {
      if (t.ferry === F || t.leaveOn) continue;
      t.wait--;
      if (t.wait <= 0) {
        t.leaveOn = F;
        if (t.state === 'away') { t.state = 'returning'; }
        else this.go(t, 'wait', T, R);
      }
    }
    // 2. new passengers
    const C = this.F();
    const n = opts.n !== undefined ? opts.n : R.between(C.tourists[0], C.tourists[1]);
    if (day !== this.day) { this.day = day; this.today = 0; }
    const born = [];
    for (let k = 0; k < n; k++) {
      const t = { id: 'tr' + (++this.n), look: (R.next() * 4294967296) >>> 0, wants: R.between(C.wantMin, C.wantMax), ferry: F, wait: C.stayFerries,
        leaveOn: null, state: 'off', until: T + 1.0 + k * 0.85, spot: SPOTS.gangway, spent: 0, kind: 'tourist', rng: R.state() ^ k };
      this.list.push(t); born.push(t);
    }
    this.arrived += n; this.today += n; this.total += n;
    this.emit({ t: 'harbor:tourists', op: 'arrive', n, ferry: F });
    // 3. a special guest now and then (after the harbour's first star)
    let guest = null;
    if (opts.star >= 1 && R.chance(C.guestChance || 0)) {
      guest = R.pick(GUESTS);
      const g = { id: 'tr' + (++this.n), look: (R.next() * 4294967296) >>> 0, wants: 5, ferry: F, wait: 1, leaveOn: null, state: 'off', until: T + 1.0 + n * 0.85, spot: SPOTS.gangway, spent: 0, kind: guest };
      this.list.push(g); born.push(g);
      this.arrived++;
      this.emit({ t: 'harbor:guest', kind: guest, id: g.id, ferry: F, item: guest === 'merchant' ? R.pick(['item_can', 'item_plank', 'item_bread', 'item_ingot']) : null });
    }
    // 4. new settlers for the sailor lodge
    let settlers = 0;
    if (opts.lodge && opts.residents < (C.settlersMax || 20) && R.chance(C.settlerChance || 0)) settlers = Math.min(R.between(1, 2), (C.settlersMax || 20) - opts.residents);
    return { born, guest, settlers };
  }

  /** a ferry leaves: everyone whose ferry it is has gone (those still away board unseen) */
  ferryDeparts(F, T) {
    let n = 0;
    this.list = this.list.filter((t) => { if (t.leaveOn === F) { n++; return false; } return true; });
    this.left += n;
    if (n) this.emit({ t: 'harbor:tourists', op: 'leave', n, ferry: F });
    return n;
  }
  /** a few seconds before the ferry leaves: the ones waiting walk up the gangway */
  boarding(F, T) { for (const t of this.list) if (t.leaveOn === F && t.state !== 'away' && t.state !== 'returning' && t.state !== 'board') { t.state = 'board'; t.from = t.spot; t.spot = SPOTS.gangway; t.t0 = T; t.until = Infinity; } }

  /** the coast train left the harbour stop: the ones on the platform ride to town */
  coastDeparts(T) {
    let n = 0;
    for (const t of this.list) if (t.state === 'station') { t.state = 'away'; t.until = Infinity; n++; }
    if (n) this.emit({ t: 'harbor:tourists', op: 'toTown', n });
    return n;
  }
  /** the coast train arrived at the harbour: the ones due back get off and walk to the terminal */
  coastArrives(T) {
    let n = 0;
    const R = stream(this.seed, 'back:' + Math.round(T * 10));
    for (const t of this.list) if (t.state === 'returning') { t.spot = SPOTS.station[n % SPOTS.station.length]; this.go(t, 'wait', T, R); n++; }
    if (n) this.emit({ t: 'harbor:tourists', op: 'back', n });
    return n;
  }

  /** move to a state with its spot and how long it lasts (walk + stay) */
  go(t, state, T, R) {
    const C = this.F();
    const from = t.spot || SPOTS.door;
    let to, stay;
    if (state === 'stroll') { to = R.pick(SPOTS.quay); stay = R.range(5, 12); }
    else if (state === 'shop') { const shop = R.next() < 0.55 ? 'market' : 'restaurant'; t.shop = shop; to = R.pick(SPOTS[shop]); stay = R.range(5, 9); }
    else if (state === 'toStation') { to = R.pick(SPOTS.station); stay = 0; state = 'station'; }
    else if (state === 'wait') { to = SPOTS.wait[(t.n = (this.waitN = ((this.waitN || 0) + 1))) % SPOTS.wait.length]; stay = Infinity; }
    else { to = from; stay = 2; }
    t.state = state; t.spot = to; t.from = from; t.t0 = T;
    t.walk = dist(from, to) * 1.25 / SPEED;     // paths are ~25 % longer than straight lines
    t.until = state === 'station' || state === 'wait' ? Infinity : T + t.walk + stay;
    void C;
  }

  /** advance to T: timers -> next states; coins for shopping (via events) */
  update(T, ctx = {}) {
    const C = this.F();
    for (const t of this.list) {
      if (!(T >= t.until)) continue;
      const R = stream(this.seed, t.id + ':' + Math.round(t.until * 10));
      if (t.state === 'off') { t.spot = SPOTS.door; this.go(t, 'stroll', T, R); continue; }
      if (t.state === 'stroll') { if (!t.shopped && ctx.shops !== false) this.go(t, 'shop', T, R); else if (!t.rode && ctx.coast && R.chance(C.townChance)) { t.rode = true; this.go(t, 'toStation', T, R); } else this.go(t, 'stroll', T, R); continue; }
      if (t.state === 'shop') {
        t.shopped = true;
        const coins = Math.round(t.wants * (C.spendPerItem || 10) * (t.kind === 'chef' ? 1 : 1) * (ctx.boost && ctx.boost[t.shop] ? ctx.boost[t.shop] : 1));
        t.spent += coins;
        this.emit({ t: 'coins', from: 'tourist', shop: t.shop, n: coins, at: t.spot, id: t.id });
        this.go(t, 'stroll', T, R);
        continue;
      }
    }
  }

  /** counters for the save slice */
  serialize() { return { day: this.day, today: this.today, total: this.total }; }
}
