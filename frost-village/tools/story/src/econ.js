// Money that moves: wages, pensions, pocket money, everyday food, shop purchases, shop takings,
// stock pick-ups and settlement at the logistics centre (paid to the chief), big buys (furniture,
// appliances) and dream shops. Wallets and savings never go below zero (every debit is checked).

import { ITEMS, ITEM_BY_ID } from '../data/items.js';
import { JOBS, SHOP_COST, PLACE_KINDS } from '../data/places.js';
import { G_KID, G_TEEN, G_ADULT, G_ELDER, F_OWNER, groupOf, ageOf, isKept } from './people.js';
import { A_WORK, A_SHOP, A_EAT, A_BANK, A_PICKUP, A_BIGBUY, A_HOME, A_SOCIAL, A_PLAY, A_CLINIC, A_OUTING, A_VISIT } from './plans.js';
import { B_OK } from './world.js';
import { SRC_DID } from './memory.js';

const FURN = ITEMS.filter((i) => i.cat === 'furniture').map((i) => i.idx);
const APPL = ITEMS.filter((i) => i.cat === 'appliances').map((i) => i.idx);

export class Economy {
  constructor(e) {
    this.e = e;
    this.stats = { sales: 0, salesCoins: 0, pickups: 0, settled: 0, wages: 0, bigBuys: 0, skippedBuys: 0, shopsOpened: 0 };
  }

  /** take up to `amount` from wallet then savings; returns what was paid */
  pay(r, amount, useSavings = true) {
    if (amount <= 0) return 0;
    let paid = Math.min(r.wallet, amount);
    r.wallet -= paid;
    if (paid < amount && useSavings) { const s = Math.min(r.savings, amount - paid); r.savings -= s; paid += s; }
    return paid;
  }
  canPay(r, amount, useSavings = false) { return r.wallet + (useSavings ? r.savings : 0) >= amount; }

  onArrive(r, p, act) {
    const e = this.e;
    switch (act) {
      case A_WORK: r.workedDay = e.clock.day; break;
      case A_SHOP: this.buy(r, p, 1 + (r.hunger > 60 ? 1 : 0)); break;
      case A_EAT: this.eat(r, p); break;
      case A_BANK: e.bank.visit(r, p); break;
      case A_PICKUP: this.pickup(r, p); break;
      case A_BIGBUY: this.bigBuy(r, p); break;
      case A_HOME: if (e.clock.minute < 600 && r.readDay !== e.clock.day) e.news.read(r); r.energy = Math.min(100, r.energy + 5); break;
      case A_OUTING: this.outing(r, p); r.fun = Math.min(100, r.fun + 12); e.social.happen(r, p); break;
      case A_SOCIAL: case A_PLAY: case A_VISIT: r.fun = Math.min(100, r.fun + 12); e.social.happen(r, p); break;
      case A_CLINIC: r.mood = Math.min(100, r.mood + 6); break;
    }
  }

  /** a promised outing: when the friend is already there, it becomes a shared memory (and a story) */
  outing(r, p) {
    const e = this.e, day = e.clock.day;
    for (let i = 0; i < r.agenda.length; i++) {
      const a = r.agenda[i];
      if (a[0] !== day || a[2] !== p.idx) continue;
      const o = e.people[a[3]];
      if (!o || !o.alive || o.loc !== p.idx) return;
      const f = e.fact('outing', { a: o.id, b: r.id, p: p.idx });
      e.witness(f, p, o.id, r.id);
      e.social.stats.outings++; e.life.stats.outings++;
      // done: the promise is kept for both
      r.agenda.splice(i, 1);
      for (let k = 0; k < o.agenda.length; k++) if (o.agenda[k][0] === day && o.agenda[k][2] === p.idx && o.agenda[k][3] === r.id) { o.agenda.splice(k, 1); break; }
      return;
    }
  }

  buy(r, p, count) {
    const e = this.e, W = e.world;
    if (!p.sellIdx.length || p.stock <= 0) return;
    for (let k = 0; k < count; k++) {
      // food first when hungry
      let idx = p.sellIdx[e.rng.int(p.sellIdx.length)];
      if (r.hunger > 40) for (const i of p.sellIdx) if (ITEMS[i].cat === 'food') { idx = i; break; }
      const price = W.price(idx);
      if (r.wallet < price) {
        // a quick top-up from savings is fine for food
        if (ITEMS[idx].cat === 'food' && r.savings >= price * 3) { const t = Math.min(r.savings, price * 4); r.savings -= t; r.wallet += t; }
        else { this.stats.skippedBuys++; r.mood = Math.max(-100, r.mood - 2); return; }
      }
      r.wallet -= price;
      p.till += price;
      p.stock = Math.max(0, p.stock - 1);
      this.stats.sales++; this.stats.salesCoins += price;
      if (ITEMS[idx].cat === 'food') r.hunger = Math.max(0, r.hunger - 28);
      r.lastBuy = idx;
      e.lifelog(r, 'buy', -1, p.idx, idx);
    }
  }

  eat(r, p) {
    const e = this.e;
    const idx = p.sellIdx.length ? p.sellIdx[e.rng.int(p.sellIdx.length)] : ITEM_BY_ID.item_bread.idx;
    const price = e.world.price(idx) + 2;
    if (r.wallet < price) { if (r.savings >= price) { r.savings -= price; r.wallet += price; } else return; }
    r.wallet -= price; p.till += price; p.stock = Math.max(0, p.stock - 1);
    r.hunger = Math.max(0, r.hunger - 45);
    r.mood = Math.min(100, r.mood + 4);
    r.lastBuy = idx;
    this.stats.sales++; this.stats.salesCoins += price;
    e.lifelog(r, 'eat', -1, p.idx, idx);
  }

  /** a shop owner restocks at the logistics centre and settles the bill there (coins to the chief) */
  pickup(r, lc) {
    const e = this.e, W = e.world;
    if (r.work < 0) return;
    const shop = W.places[r.work];
    if (!shop || !shop.sellIdx.length) return;
    const want = shop.stockMax - shop.stock;
    if (want <= 4) return;
    // wholesale cost ~55 % of retail of an average item of the shop
    let avg = 0;
    for (const i of shop.sellIdx) avg += W.price(i);
    avg = Math.max(1, Math.round((avg / shop.sellIdx.length) * 0.55));
    // first settle what is still on the shop's account, then pay cash for what the budget allows;
    // the centre lets a shop take a little more on account (paid back at the next pick-up), so a shop
    // with an empty till is never stuck with empty shelves
    let settledNow = 0;
    if (shop.owed > 0) { const pd = this.pay(r, shop.owed); shop.owed -= pd; settledNow += pd; }
    const budget = r.wallet + r.savings;
    let qty = Math.min(want, Math.floor(budget / avg));
    const cost = qty * avg;
    if (cost > 0) { this.pay(r, cost); settledNow += cost; }
    const credit = Math.max(0, Math.min(want - qty, 30 - qty, Math.floor((600 - (shop.owed || 0)) / avg)));
    if (credit > 0) { shop.owed = (shop.owed || 0) + credit * avg; qty += credit; }
    if (qty <= 0) return;
    shop.stock += qty;
    this.stats.pickups++; this.stats.settled += settledNow;
    if (credit > 0) this.stats.credit = (this.stats.credit || 0) + 1;
    if (e.bus.has('shop')) {
      const items = [];
      for (const i of shop.sellIdx) items.push(ITEMS[i].id);
      e.bus.emit('shop', { op: 'pickup', shop: shop.id, owner: r.id, place: lc.id, items, qty });
      e.bus.emit('shop', { op: 'settle', shop: shop.id, owner: r.id, place: lc.id, coins: settledNow, owed: shop.owed || 0 });
    }
    e.lifelog(r, 'pickup', -1, lc.idx, qty);
  }

  bigBuy(r, p) {
    const e = this.e, W = e.world;
    if (!p.sellIdx.length) { r.bigBuy = null; return; }
    const idx = p.sellIdx[e.rng.int(p.sellIdx.length)];
    const price = W.price(idx);
    if (r.wallet + r.savings < price + 20) { r.bigBuy = null; return; }
    this.pay(r, price);
    p.till += price; p.stock = Math.max(0, p.stock - 1);
    r.bigBuy = null;
    r.mood = Math.min(100, r.mood + 15);
    this.stats.bigBuys++;
    const f = e.fact('big_buy', { a: r.id, p: p.idx, i: idx, n: price });
    e.witness(f, p, r.id);
    e.lifelog(r, 'big_buy', -1, p.idx, idx);
    if (e.bus.has('shop')) e.bus.emit('shop', { op: 'sale', shop: p.id, buyer: r.id, item: ITEMS[idx].id, coins: price });
  }

  /** nightly money: wages, pensions, pocket money, home food, shop takings, dreams */
  nightly(r) {
    const e = this.e, rng = e.rng, day = e.clock.day;
    const g = groupOf(e, r);
    const job = JOBS[r.job];
    if (job && job.wage && r.workedDay === day) {
      let w = job.wage;
      if (r.flags & F_OWNER) {
        // owners live on their shop's takings
        const shop = e.world.places[r.work];
        w = shop ? Math.floor(shop.till * 0.9) : 0;
        if (shop) shop.till = 0;
      }
      r.wallet += w; this.stats.wages += w;
      r.jobless = 0;
    } else if (g === G_ADULT && (r.job === 'none')) r.jobless++;
    if (g === G_ELDER) r.wallet += 12;
    if (g === G_KID || g === G_TEEN) {
      // pocket money from a parent who can afford it
      for (const pid of r.parents) { const par = e.people[pid]; if (par && par.alive && par.wallet > 30) { par.wallet -= 2; r.wallet += 2; break; } }
    }
    // food at home (adults pay for the household's groceries)
    if (g >= G_ADULT) this.pay(r, 3);
    r.hunger = Math.min(100, r.hunger + 26);
    // move savings back to the wallet when it runs dry (a visit to the ATM)
    if (r.wallet < 8 && r.savings > 20) { const t = Math.min(r.savings, 30); r.savings -= t; r.wallet += t; e.bank.stats.withdrawals++; }
    // big wishes: a new sofa, a radio … (rich and vain more often)
    if (g >= G_ADULT && !r.bigBuy && r.wallet + r.savings > 450 && rng.chance(0.03 + r.tr[10] / 2000)) {
      r.bigBuy = rng.chance(0.5) ? 'furniture_store' : 'appliance_store';
    }
    // a small furniture loan for someone who wants a new sofa but cannot quite afford it (paid off in ~2 weeks)
    if (g >= G_ADULT && !r.bigBuy && !r.loanWant && !e.bank.hasLoan(r) && r.wallet + r.savings > 120 && r.wallet + r.savings <= 450 && rng.chance(0.004 + r.tr[10] / 6000)) {
      r.loanWant = { purpose: 'furniture', amount: 120 + rng.int(160) };
      r.bigBuy = 'furniture_store';
    }
    // dreams of a shop: start saving, then ask the bank
    if (g === G_ADULT && !r.dream && !(r.flags & F_OWNER) && r.dreamShop < 0 && !isKept(e, r) && rng.chance(0.004 + (r.job === 'none' ? 0.01 : 0))) {
      const kinds = Object.keys(SHOP_COST);
      r.dream = kinds[rng.int(kinds.length)];
      const f = e.fact('shop_plan', { a: r.id, s: r.dream });
      e.learn(r, f, SRC_DID);
    }
    if (r.dream && r.dreamShop < 0 && !r.loanWant && !(r.flags & F_OWNER) && r.savings + r.wallet >= SHOP_COST[r.dream] * 0.25 && e.world.plots.length) {
      r.loanWant = { purpose: 'shop', amount: Math.round(SHOP_COST[r.dream] * 0.8) };
    } else if (r.dream && r.dreamShop < 0 && !e.world.plots.length && rng.chance(0.03)) r.dream = null;   // no free plot for weeks: the dream fades
  }

  /** open the dream shop of resident r on a free plot (after the loan) */
  openShop(r) {
    const e = this.e, W = e.world;
    if (!r.dream || !W.plots.length) return null;
    const plot = W.plots.shift();
    const kind = r.dream;
    const name = W.shopName(kind, e.rng);
    const p = W.addPlace({ id: 'shop_' + plot.id, kind, name, x: plot.x, y: plot.y, owner: r.id });
    p.state = 4; // B_BUILD
    p.stateT = e.now;
    p.plot = plot.id;
    p.stock = 0;
    r.dreamShop = p.idx;
    this.stats.shopsOpened++;
    if (e.bus.has('build')) e.bus.emit('build', { op: 'construct', place: p.id, kind, plot: plot.id, purpose: 'shop', owner: r.id });
    e.schedule(e.now + Math.round(e.cfg.dayLength * 1.2), 'shopReady', p.idx);
    return p;
  }

  shopReady(pIdx) {
    const e = this.e, p = e.world.places[pIdx];
    if (!p || p.state !== 4) return;
    p.state = B_OK; p.built = e.clock.day;
    p.stock = p.stockMax;
    const r = p.owner >= 0 ? e.people[p.owner] : null;
    if (r && r.alive) {
      r.flags |= F_OWNER;
      r.job = jobForShop(p.kind);
      r.work = p.idx;
      r.dream = null;
      r.mood = Math.min(100, r.mood + 40);
    } else p.owner = -1;     // the founder left before the opening: someone takes it over (adoptShops)
    p.jobs = [[r ? r.job : 'shopkeeper', 2]];
    const f = e.fact('shop_open', { a: p.owner, p: p.idx, s: p.kind });
    e.witness(f, p, p.owner);
    if (e.bus.has('build')) e.bus.emit('build', { op: 'done', place: p.id, kind: p.kind, purpose: 'shop' });
    if (e.bus.has('shop')) e.bus.emit('shop', { op: 'opened', shop: p.id, kind: p.kind, owner: p.owner, name: p.name });
    e.jobs.fillOpenings();
  }

  /** daily: a shop whose owner has left is taken over by its staff, a resident who dreamt of a shop, or a
   *  grown-up looking for work (and gets the till and the account) */
  adoptShops() {
    const e = this.e, rng = e.rng, W = e.world;
    for (const p of W.places) {
      if (p.cat !== 'shop' || p.state !== B_OK) continue;
      const o = p.owner >= 0 ? e.people[p.owner] : null;
      if (o && o.alive) continue;
      let best = null, bs = -1;
      for (const r of e.alive) {
        if (groupOf(e, r) !== G_ADULT || (r.flags & F_OWNER) || r.dreamShop >= 0 || isKept(e, r) || ageOf(e, r) < 24) continue;
        let sc = -1;
        if (r.work === p.idx) sc = 3;
        else if (r.dream) sc = r.dream === p.kind ? 2.5 : 2;
        else if (r.job === 'none') sc = 1;
        if (sc < 0) continue;
        sc += rng.next() * 0.5;
        if (sc > bs) { bs = sc; best = r; }
      }
      if (!best) { p.owner = -1; continue; }
      p.owner = best.id;
      best.flags |= F_OWNER;
      best.job = jobForShop(p.kind);
      best.work = p.idx;
      best.dream = null;
      best.wallet += p.till; p.till = 0;
      best.mood = Math.min(100, best.mood + 25);
      const f = e.fact('new_job', { a: best.id, p: p.idx, s: best.job });
      e.witness(f, p, best.id);
      if (e.bus.has('shop')) e.bus.emit('shop', { op: 'takeover', shop: p.id, kind: p.kind, owner: best.id, name: p.name });
    }
  }
}

/** the job of a shop's owner */
export function jobForShop(kind) {
  const K = PLACE_KINDS[kind];
  return K && K.shop === 'bakery' ? 'baker' : kind === 'cafe' ? 'barista' : kind === 'restaurant' ? 'cook' : kind === 'stall' ? 'stall_keeper' : kind === 'salon' ? 'hairdresser' : kind === 'grocer' ? 'grocer' : kind === 'fishmonger' ? 'fishmonger' : 'shopkeeper';
}

export { FURN, APPL };
