// Money that moves: wages, pensions, pocket money, everyday food, shop purchases, shop takings,
// stock pick-ups and settlement at the logistics centre (paid to the chief), big buys (furniture,
// appliances) and dream shops. Wallets and savings never go below zero (every debit is checked).

import { ITEMS, ITEM_BY_ID } from '../data/items.js';
import { JOBS, SHOP_COST, PLACE_KINDS } from '../data/places.js';
import { G_KID, G_TEEN, G_ADULT, G_ELDER, F_OWNER, groupOf } from './people.js';
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
      case A_SOCIAL: case A_PLAY: case A_OUTING: case A_VISIT: r.fun = Math.min(100, r.fun + 12); e.social.happen(r, p); break;
      case A_CLINIC: r.mood = Math.min(100, r.mood + 6); break;
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
    const budget = r.wallet + r.savings;
    const qty = Math.min(want, Math.floor(budget / avg));
    if (qty <= 0) return;
    const cost = qty * avg;
    this.pay(r, cost);
    shop.stock += qty;
    this.stats.pickups++; this.stats.settled += cost;
    if (e.bus.has('shop')) {
      const items = [];
      for (const i of shop.sellIdx) items.push(ITEMS[i].id);
      e.bus.emit('shop', { op: 'pickup', shop: shop.id, owner: r.id, place: lc.id, items, qty });
      e.bus.emit('shop', { op: 'settle', shop: shop.id, owner: r.id, place: lc.id, coins: cost });
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
    if (r.wallet < 8 && r.savings > 20) { const t = Math.min(r.savings, 30); r.savings -= t; r.wallet += t; }
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
    if (g === G_ADULT && !r.dream && !(r.flags & F_OWNER) && rng.chance(0.004 + (r.job === 'none' ? 0.01 : 0))) {
      const kinds = Object.keys(SHOP_COST);
      r.dream = kinds[rng.int(kinds.length)];
      const f = e.fact('shop_plan', { a: r.id, s: r.dream });
      e.learn(r, f, SRC_DID);
    }
    if (r.dream && !r.loanWant && r.savings + r.wallet >= SHOP_COST[r.dream] * 0.25 && e.world.plots.length) {
      r.loanWant = { purpose: 'shop', amount: Math.round(SHOP_COST[r.dream] * 0.8) };
    }
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
    const r = e.people[p.owner];
    if (r && r.alive) {
      r.flags |= F_OWNER;
      r.job = PLACE_KINDS[p.kind].shop === 'bakery' ? 'baker' : p.kind === 'cafe' ? 'barista' : p.kind === 'restaurant' ? 'cook' : p.kind === 'stall' ? 'stall_keeper' : p.kind === 'salon' ? 'hairdresser' : p.kind === 'grocer' ? 'grocer' : 'shopkeeper';
      r.work = p.idx;
      r.dream = null;
      r.mood = Math.min(100, r.mood + 40);
    }
    p.jobs = [[r ? r.job : 'shopkeeper', 2]];
    const f = e.fact('shop_open', { a: p.owner, p: p.idx, s: p.kind });
    e.witness(f, p, p.owner);
    if (e.bus.has('build')) e.bus.emit('build', { op: 'done', place: p.id, kind: p.kind, purpose: 'shop' });
    if (e.bus.has('shop')) e.bus.emit('shop', { op: 'opened', shop: p.id, kind: p.kind, owner: p.owner, name: p.name });
    e.jobs.fillOpenings();
  }
}

export { FURN, APPL };
