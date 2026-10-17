// Upgrades (plan §5.9, pure): offered one at a time, only when the numbers say they are needed (a pad at the depot +
// a card in the app's 기사님 tab). Nothing here spends coins: buy() asks env.spend (the player's tap). Anti-softlock:
// every price is producible by lines the player already has; nothing here gates anything else.
//   up.measure(dt, m)  m = { pickPack, ready, sledQ, day, vans, dockSurplus, overnight (at 07:00), dayChanged, sled }
//   up.offer -> kind | null · up.cost(kind) · up.buy(kind, env) -> bool · up.lv

export const KINDS = ['pack', 'van2', 'van3', 'sled2', 'lockA', 'lockP', 'dawn', 'back'];
const NAME = { pack: 'gb_up_pack', van2: 'gb_up_van2', van3: 'gb_up_van3', sled2: 'gb_up_sled2', lockA: 'gb_up_lockA', lockP: 'gb_up_lockP', dawn: 'gb_up_dawn', back: 'gb_up_back' };

export class Upgrades {
  constructor(tune, lv) {
    this.tune = tune;
    this.lv = Object.assign({ van: 1, pack: 0, sled: 1, dawn: 0, back: 0, lockP: 0, lockA: 0 }, lv || {});
    this.t = {};                 // kind -> seconds the need has held
    this.ok = new Set();         // needs that were met (stay met)
    this.nights = 0;             // game days with ≥ dawnWaiting orders waiting at 07:00
    this.sledDays = 0;
    this.offer = null;
    this.seen = new Set();       // offers already announced (toast once)
  }

  name(kind) { return NAME[kind] || kind; }
  bought(kind) {
    const L = this.lv;
    return { pack: L.pack >= 1, van2: L.van >= 2, van3: L.van >= 3, sled2: L.sled >= 2, lockA: L.lockA >= 1, lockP: L.lockP >= 1, dawn: L.dawn >= 1, back: L.back >= 1 }[kind];
  }
  cost(kind) {
    const U = this.tune.up;
    const c = { pack: U.pack2, van2: U.van2, van3: U.van3, sled2: U.sled2, lockA: U.lockerApt, lockP: U.lockerPlaza, dawn: U.dawn, back: U.backhaul }[kind];
    return Array.isArray(c) ? { coins: c[0], item_ingot: c[1] } : { coins: c || 0 };
  }

  hold(kind, cond, need, dt) {
    if (this.ok.has(kind) || this.bought(kind)) return;
    this.t[kind] = cond ? (this.t[kind] || 0) + dt : 0;
    if (this.t[kind] >= need) this.ok.add(kind);
  }

  /** returns { t: 'offer', kind } when a new offer appears */
  measure(dt, m) {
    const U = this.tune.up, L = this.lv;
    this.hold('pack', m.pickPack >= U.packQueue, U.packS, dt);
    if (L.van < 2) this.hold('van2', m.day && m.ready >= U.vanWait, U.vanS, dt);
    else this.hold('van3', m.day && m.ready >= U.vanWait, U.vanS, dt);
    if (L.sled >= 1) this.hold('sled2', m.sledQ >= U.sledWait, U.sledS, dt);
    if (L.van >= 2 && !this.bought('lockA')) this.ok.add('lockA');
    if (m.dayChanged && L.sled >= 1) this.sledDays++;
    if (L.sled >= 1 && this.sledDays >= U.lockerDays) this.ok.add('lockP');
    if (m.overnight !== undefined && m.overnight !== null) { if (m.overnight >= U.dawnWaiting) this.nights++; if (this.nights >= U.dawnNights) this.ok.add('dawn'); }
    this.hold('back', m.vans >= 2 && m.dockSurplus >= U.backhaulDock, U.backhaulS, dt);
    // the offer: the first need met that is not bought (order of value, plan §0)
    const prev = this.offer;
    this.offer = null;
    for (const k of KINDS) if (this.ok.has(k) && !this.bought(k) && !(k === 'sled2' && L.sled < 1)) { this.offer = k; break; }
    if (this.offer && this.offer !== prev && !this.seen.has(this.offer)) { this.seen.add(this.offer); return { t: 'offer', kind: this.offer, cost: this.cost(this.offer) }; }
    return null;
  }

  /** the player bought it (env.spend said yes): returns the new levels or null */
  buy(kind, env) {
    if (this.bought(kind) || !KINDS.includes(kind)) return null;
    if (kind === 'van3' && this.lv.van < 2) return null;
    if (env && env.spend && !env.spend(this.cost(kind), kind)) return null;
    const L = this.lv;
    if (kind === 'pack') L.pack = 1;
    else if (kind === 'van2') L.van = Math.max(L.van, 2);
    else if (kind === 'van3') L.van = 3;
    else if (kind === 'sled2') L.sled = 2;
    else if (kind === 'lockA') L.lockA = 1;
    else if (kind === 'lockP') L.lockP = 1;
    else if (kind === 'dawn') L.dawn = 1;
    else if (kind === 'back') L.back = 1;
    if (this.offer === kind) this.offer = null;
    return Object.assign({}, L);
  }
}
