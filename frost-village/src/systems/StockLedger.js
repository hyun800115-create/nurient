// (v4.2, docs/v42_plan.md §6.7 재고) StockLedger: every stock of the village in one registry, sampled once a second.
//   register({ id, nameKey, item, get(), cap, place, kind, line })   (place = { x, y } for the camera hop)
//   rows()     one row per goods line (+ 창고, 물류창고): pile · station in / out · shelf · status · flows per minute
//   status(line) -> 'short' | 'jam' | 'surplus' | 'ok'           (BALANCE.v42.ledger: emptyS / fullS)
//   stocks()   every registered stock with its EWMA in / out per minute and % of the time full / empty (tests, census)
// The statuses colour the office wall board, the 재고 tab and the letters' "stuck" rules (ledger.full is saved).
// Pure bookkeeping: the game registers its stocks (V42.registerStocks); no Phaser here.

import { BALANCE } from '../data/balance.js';

/** the five goods lines: raw pile -> station -> product -> where it is sold */
export const LINES = [
  { id: 'grill', pile: 'fish', raw: 'item_fish_raw', product: 'item_fish_cooked', shelf: 'market' },
  { id: 'sawmill', pile: 'log', raw: 'item_log', product: 'item_plank', shelf: 'trade' },
  { id: 'bakery', pile: 'wheat', raw: 'item_wheat', product: 'item_bread', shelf: 'market' },
  { id: 'smelter', pile: 'ore', raw: 'item_ore', product: 'item_ingot', shelf: 'trade' },
  { id: 'smokehouse', pile: 'meat', raw: 'item_meat_raw', product: 'item_meat_cooked', shelf: 'market' },
];

const L = () => (BALANCE.v42 && BALANCE.v42.ledger) || { window: 300, emptyS: 30, fullS: 60 };

export class StockLedger {
  constructor(saved) {
    this.list = [];
    this.byId = new Map();
    this.t = 0;
    this.sampleT = 0;
    this.samples = 0;
    // seconds each stock has been full without a break (the letters' "남음 > 2 min" rules), restored from the save
    this.fullSaved = saved && saved.full && typeof saved.full === 'object' ? saved.full : {};
  }

  /** add a stock (re-registering an id replaces it: a building that was rebuilt) */
  register(s) {
    if (!s || !s.id || typeof s.get !== 'function') return null;
    const old = this.byId.get(s.id);
    const o = Object.assign({ cap: 0, kind: 'stock', line: null, item: null, place: null, nameKey: null }, s, {
      prev: null, inPm: 0, outPm: 0, fullS: Math.max(0, Number(this.fullSaved[s.id]) || 0), emptyS: 0, fullT: 0, emptyT: 0, seen: 0,
    });
    if (old) { o.inPm = old.inPm; o.outPm = old.outPm; o.fullS = old.fullS; o.emptyS = old.emptyS; o.fullT = old.fullT; o.emptyT = old.emptyT; o.seen = old.seen; const i = this.list.indexOf(old); if (i >= 0) this.list.splice(i, 1); }
    this.list.push(o);
    this.byId.set(o.id, o);
    return o;
  }
  remove(id) { const o = this.byId.get(id); if (!o) return; this.byId.delete(id); const i = this.list.indexOf(o); if (i >= 0) this.list.splice(i, 1); }
  get(id) { return this.byId.get(id) || null; }
  /** seconds stock `id` has been full without a break (the letters' rules) */
  fullFor(id) { const o = this.byId.get(id); return o ? o.fullS : 0; }

  /** read a stock's count (a stock whose object went away reads 0) */
  read(o) { try { const v = Number(o.get()); return Number.isFinite(v) ? Math.max(0, v) : 0; } catch (e) { return 0; } }

  update(dt) {
    this.t += dt;
    this.sampleT -= dt;
    if (this.sampleT > 0) return;
    const step = 1 - this.sampleT;           // the time since the last sample (≈ 1 s)
    this.sampleT = 1;
    this.sample(Math.min(5, Math.max(0.2, step)));
  }

  /** one sample: in / out flows (EWMA per minute over `window` s), full / empty timers */
  sample(dt) {
    this.samples++;
    const W = Math.max(10, Number(L().window) || 300);
    const k = 1 - Math.exp(-dt / W);
    for (const o of this.list) {
      const v = this.read(o);
      if (o.prev !== null) {
        const d = v - o.prev;
        o.inPm += ((d > 0 ? d : 0) * 60 / dt - o.inPm) * k;
        o.outPm += ((d < 0 ? -d : 0) * 60 / dt - o.outPm) * k;
      }
      o.prev = v;
      o.count = v;
      o.seen += dt;
      const full = o.cap > 0 && v >= o.cap * 0.95, empty = v <= 0;
      o.fullS = full ? o.fullS + dt : 0;
      o.emptyS = empty ? o.emptyS + dt : 0;
      if (full) o.fullT += dt;
      if (empty) o.emptyT += dt;
    }
  }

  /** the status of goods line `lineId` (§6.7 table) */
  status(lineId) {
    const C = L();
    const line = LINES.find((q) => q.id === lineId);
    if (!line) return 'ok';
    const shelf = this.get('shelf:' + line.product), out = this.get('out:' + line.id), pile = this.get('pile:' + line.pile), wh = this.get('wh:' + line.product);
    const shelfEmpty = shelf ? shelf.emptyS > C.emptyS : false;
    const src = (out ? out.count || 0 : 0) + (wh ? wh.count || 0 : 0);
    if (shelfEmpty) return src > 0 ? 'jam' : 'short';
    const stuck = (pile && pile.fullS > C.fullS) || (out && out.fullS > C.fullS);
    const shelfOk = !shelf || shelf.cap <= 0 || (shelf.count || 0) >= shelf.cap * 0.5;
    if (stuck && shelfOk) return 'surplus';
    return 'ok';
  }

  /** the 재고 tab / wall board rows */
  rows() {
    const out = [];
    for (const line of LINES) {
      const g = (id) => this.get(id);
      const pile = g('pile:' + line.pile), sin = g('in:' + line.id), sout = g('out:' + line.id), shelf = g('shelf:' + line.product), wh = g('wh:' + line.product);
      if (!sout || (sout.isOn && !sout.isOn())) continue;
      out.push({
        line: line.id, raw: line.raw, product: line.product, status: this.status(line.id),
        pile: pile ? pile.count || 0 : null, pileCap: pile ? pile.cap : 0,
        in: sin ? sin.count || 0 : 0, inCap: sin ? sin.cap : 0,
        out: sout.count || 0, outCap: sout.cap,
        shelf: shelf ? shelf.count || 0 : 0, shelfCap: shelf ? shelf.cap : 0,
        wh: wh ? wh.count || 0 : 0,
        // flows per minute: caught -> made -> taken from the shelf (sold)
        flow: [Math.round(pile ? pile.inPm : 0), Math.round(sout.inPm), Math.round(shelf ? shelf.outPm : 0)],
        place: (sout && sout.place) || null, shelfPlace: shelf ? shelf.place : null,
      });
    }
    return out;
  }

  /** every stock (tests / the census bot) */
  stocks() {
    return this.list.map((o) => ({ id: o.id, kind: o.kind, item: o.item, n: o.count || 0, cap: o.cap, inPm: +o.inPm.toFixed(2), outPm: +o.outPm.toFixed(2), fullS: Math.round(o.fullS), emptyS: Math.round(o.emptyS), fullPct: o.seen ? Math.round((o.fullT / o.seen) * 100) : 0, emptyPct: o.seen ? Math.round((o.emptyT / o.seen) * 100) : 0 }));
  }

  /** all the village's goods (the top line of the 재고 tab) */
  // ((gameplay review L5) the 창고's per-product rows ('wh:<product>', kind 'wh') are a breakdown of its 'wh' row: not
  //  counted twice)
  total() { let n = 0; for (const o of this.list) if (o.kind !== 'cash' && o.kind !== 'depot' && o.kind !== 'wh') n += o.count || 0; return n; }

  /** the saved part: how long the full stocks have been full (≤ 40) */
  serialize() {
    const full = {};
    let n = 0;
    for (const o of this.list) { if (n >= 40) break; if (o.fullS >= 1 && /^[a-z0-9_:]{1,32}$/.test(o.id)) { full[o.id] = Math.round(o.fullS); n++; } }
    return { full };
  }
}
