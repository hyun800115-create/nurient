// World model: places (outdoor spots, civic buildings, shops, homes), their state (fire, ruin,
// construction), who is there right now, shop stock, free plots, goods & prices.
// Places are identified by a string id (the game's building / area id) and an int index.

import { PLACE_KINDS, SHOP_ADJ } from '../data/places.js';
import { ITEMS, ITEM_BY_ID, SHOP_SELLS } from '../data/items.js';

export const B_OK = 0, B_BURNING = 1, B_RUIN = 2, B_DEMOLISH = 3, B_BUILD = 4, B_DAMAGED = 5;

export class World {
  constructor(engine) {
    this.e = engine;
    this.places = [];          // index -> place
    this.byId = Object.create(null);
    this.byKind = Object.create(null);
    this.plots = [];           // free building plots: { id, size, x, y }
    this.prices = new Int32Array(ITEMS.length);
    for (const it of ITEMS) this.prices[it.idx] = it.price;
    this.basePrices = Int32Array.from(this.prices);
    this.priceDelta = new Int32Array(ITEMS.length);   // change vs. yesterday (for small talk / paper)
    this.socialIdx = [];       // indices of places where conversations can start
  }

  /**
   * add a place. def: { id, kind, name?: {ko, en}, x?, y?, cap? (homes), owner?, insured?, level? }
   * returns the place record
   */
  addPlace(def) {
    if (this.byId[def.id]) return this.byId[def.id];
    const K = PLACE_KINDS[def.kind];
    if (!K) throw new Error('story: unknown place kind ' + def.kind);
    const p = {
      idx: this.places.length, id: def.id, kind: def.kind, K, cat: K.cat,
      name: def.name || null,            // {ko, en} — null: generic name from the kind (or '{owner}네 집')
      x: def.x || 0, y: def.y || 0,
      cap: def.kind === 'home' ? (def.cap || 3) : 0,
      residents: [],                     // home: resident ids living here
      owner: def.owner === undefined ? -1 : def.owner,
      hh: -1,                            // home: household id
      state: B_OK, stateT: 0, level: def.level || 1, insured: def.insured !== undefined ? !!def.insured : true,
      stock: def.kind in SHOP_SELLS || K.shop ? 60 : 0, stockMax: 80,
      till: 0,                           // shop takings not yet settled
      here: [],                          // resident ids present now
      sells: K.shop ? SHOP_SELLS[K.shop] || [] : [],
      sellIdx: K.shop ? (SHOP_SELLS[K.shop] || []).map((s) => ITEM_BY_ID[s].idx) : [],
      queue: !!K.queue,
      jobs: [],                          // [jobId, slots]
      game: def.game || null,            // anything the game wants to keep with it
      built: def.built || 0,             // day built
    };
    this.places.push(p);
    this.byId[p.id] = p;
    (this.byKind[p.kind] || (this.byKind[p.kind] = [])).push(p);
    if (p.cat !== 'home') this.socialIdx.push(p.idx);
    return p;
  }

  addPlot(def) { this.plots.push({ id: def.id, size: def.size || 'M', x: def.x || 0, y: def.y || 0 }); }

  get(idOrIdx) { return typeof idOrIdx === 'number' ? this.places[idOrIdx] : this.byId[idOrIdx]; }
  first(kind) { const l = this.byKind[kind]; return l && l.length ? l[0] : null; }
  all(kind) { return this.byKind[kind] || []; }

  /** is the place usable now (opening hours, not burnt) */
  isOpen(p, hour) {
    if (p.state === B_RUIN || p.state === B_DEMOLISH || p.state === B_BUILD || p.state === B_BURNING) return false;
    const o = p.K.open;
    return hour >= o[0] && hour < o[1];
  }

  /** the eldest grown-up living in a home (-1 when empty): who owns it, whose name it carries */
  headOf(p) {
    const e = this.e;
    let best = -1, ba = -1;
    for (const id of p.residents) {
      const r = e.people[id];
      if (!r || !r.alive) continue;
      const a = e.clock.day - r.birth;
      const grown = a >= 19 * e.cfg.yearDays;
      const sc = (grown ? 1e6 : 0) + a;
      if (sc > ba) { ba = sc; best = id; }
    }
    return best;
  }

  /** display name of a place in a language */
  nameOf(p, lang) {
    if (!p) return lang === 'en' ? 'somewhere' : '어딘가';
    if (p.name) return p.name[lang] || p.name.ko;
    if (p.kind === 'home') {
      const e = this.e, h = this.headOf(p), o = h >= 0 ? e.people[h] : null;
      if (o) return lang === 'en' ? e.dialogue.nameEn(o) + '’s house' : o.given + '네 집';
      return lang === 'en' ? 'an empty house' : '빈집';
    }
    return lang === 'en' ? p.K.en : p.K.ko;
  }

  shopName(kind, rng) {
    const a = SHOP_ADJ[rng.int(SHOP_ADJ.length)], K = PLACE_KINDS[kind];
    return { ko: a[0] + ' ' + K.ko, en: a[1] + ' ' + K.en.replace(/^\w/, (c) => c.toUpperCase()) };
  }

  // ---------------------------------------------------------------- presence
  enter(p, r) {
    if (r.loc === p.idx) return;
    if (r.loc >= 0) this.leave(r);
    r.loc = p.idx;
    r.hereI = p.here.length;
    p.here.push(r.id);
  }
  leave(r) {
    if (r.loc < 0) return;
    const p = this.places[r.loc];
    const i = r.hereI, last = p.here.length - 1;
    if (p.here[i] === r.id) {
      if (i !== last) { const mv = p.here[last]; p.here[i] = mv; this.e.people[mv].hereI = i; }
      p.here.pop();
    } else {
      const j = p.here.indexOf(r.id);
      if (j >= 0) { p.here.splice(j, 1); for (let k = j; k < p.here.length; k++) this.e.people[p.here[k]].hereI = k; }
    }
    r.loc = -1; r.hereI = -1;
  }

  // ---------------------------------------------------------------- goods & prices
  /** game feeds prices: { item_bread: 7, … } */
  setPrices(map) {
    for (const k in map) {
      const it = ITEM_BY_ID[k];
      if (!it) continue;
      const v = Math.max(1, Math.round(+map[k] || 1));
      this.priceDelta[it.idx] = v - this.prices[it.idx];
      this.prices[it.idx] = v;
    }
  }
  price(idx) { return this.prices[idx]; }

  /** daily drift of prices when the game does not feed them (small, mean-reverting) */
  driftPrices(rng) {
    for (const it of ITEMS) {
      const i = it.idx, base = this.basePrices[i], cur = this.prices[i];
      let d = 0;
      const r = rng.next();
      if (r < 0.08) d = 1; else if (r < 0.16) d = -1;
      if (cur > base * 1.3) d = -1; else if (cur < base * 0.75) d = 1;
      const v = Math.max(1, cur + d);
      this.priceDelta[i] = v - cur;
      this.prices[i] = v;
    }
  }

  homes() { return this.byKind.home || []; }
  vacancies() { let n = 0; for (const h of this.homes()) if (h.state === B_OK && h.hh < 0) n++; return n; }
}
