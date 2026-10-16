// (v4.2, docs/v42_plan.md §4.3) Surplus: one rule set for what the village really cannot use — used by the station
// porters (to the 짐 싣는 곳's surplus sink), the train's freight cars (F7) and the 서리 물류창고 (F8). Also keeps the
// shelves' "empty for N s" clocks for F1 (PRIO.SHELF_EMPTY).
//
//   source                     surplus when                                                         keeps
//   station / workshop output  ≥ outAt 70 % for outForS 20 s and no sink with prio ≥ 40 within 1,500 px  30 %
//   collection pile            ≥ pileAt 90 % for pileForS 20 s (after its line's 가공소 2단 had a chance)   pileKeep 16
//   v3 창고                     > whAt 70 % full                                                      whKeep 50 %
//   boathouse catch            ≥ boatAt 90 %                                                         30 %
// All of it only after "village complete" (progress.celebrated): the first 20 minutes never change.

import { BALANCE } from '../data/balance.js';
import { gdist } from '../core/Iso.js';
import { FOODS, GOODS, STORE_GOODS } from '../data/items.js';

const B = () => (BALANCE.v42 && BALANCE.v42.surplus) || {};
const P = () => (BALANCE.v42 && BALANCE.v42.porters) || {};
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

export class Surplus {
  constructor(gs, v42) {
    this.gs = gs;
    this.v42 = v42;
    this.t = 0;
    this.overT = new Map();     // source -> seconds at/over its threshold (1 Hz)
    this.emptyT = new Map();    // seller -> { type: seconds at 0 }
    this.pileShims = new Map(); // pile -> { outStack, outPad, enabled, pile } (station porters take from it like an output)
  }

  get on() { return !!(this.v42 && this.v42.frules); }

  update(dt) {
    this.t += dt;
    if (this.t < 1) return;
    const step = this.t;
    this.t = 0;
    const gs = this.gs, S = B();
    // outputs
    for (const s of gs.sources ? gs.sources() : []) {
      if (!s.outStack || s.outStack.max <= 0) continue;
      const f = s.outStack.count / s.outStack.max;
      const at = s === gs.boathouse ? num(S.boatAt, 0.9) : num(S.outAt, 0.7);
      this.overT.set(s, f >= at ? (this.overT.get(s) || 0) + step : 0);
    }
    // piles
    for (const k in gs.piles || {}) {
      const p = gs.piles[k];
      if (!p || !p.stack) continue;
      const f = p.stack.max > 0 ? p.stack.count / p.stack.max : 0;
      this.overT.set(p, p.shown && f >= num(S.pileAt, 0.95) ? (this.overT.get(p) || 0) + step : 0);
    }
    // shelves (F1)
    for (const sl of this.sellers()) {
      let m = this.emptyT.get(sl);
      if (!m) this.emptyT.set(sl, m = {});
      for (const ty of sl.goods || []) m[ty] = sl.enabled !== false && sl.stock && sl.stock.countWithIncoming(ty) <= 0 ? (m[ty] || 0) + step : 0;
    }
  }

  sellers() { const gs = this.gs; return [gs.market, gs.trade, gs.store].filter((q) => q && q.stock); }

  /** (F1) seconds the shelf of `seller` has had no `ty` (nothing on its way either) */
  emptyFor(seller, ty) { const m = this.emptyT.get(seller); return (m && m[ty]) || 0; }
  /** (F1) the shelf sink's priority boost: PRIO.SHELF_EMPTY once empty for porters.shelfEmptyAfter s */
  shelfEmpty(seller, ty) { return this.on && this.emptyFor(seller, ty) >= num(P().shelfEmptyAfter, 10); }

  /** is there a sink with prio ≥ 40 that wants `ty` within localPx of (x, y)? */
  localWant(ty, x, y) {
    const L = this.gs.logistics;
    if (!L) return false;
    const far = num(B().localPx, 1500);
    for (const s of L.sinks) {
      if (s.isWarehouse || s.remote) continue;
      if (L.want(s, ty) <= 0) continue;
      if (s.prio(ty) < 40) continue;
      if (gdist(x, y, s.x, s.y) <= far) return true;
    }
    return false;
  }

  /** how many of `ty` at `src` are surplus right now (what may leave the village) */
  amount(src, ty) {
    if (!this.on || !src) return 0;
    const gs = this.gs, S = B();
    // the v3 창고
    if (src === gs.warehouse) {
      const cap = src.cap || (BALANCE.warehouse && BALANCE.warehouse.capacity) || 300, tot = src.total || 0;
      if (tot <= cap * num(S.whAt, 0.7)) return 0;
      return Math.max(0, Math.min(src.count(ty), Math.floor(tot - cap * num(S.whKeep, 0.5))));
    }
    // a collection pile (shim or the pile itself)
    const pile = src.pile || (src.stack && src.pad && !src.outStack ? src : null);
    if (pile) {
      if ((this.overT.get(pile) || 0) < num(S.pileForS, 30)) return 0;
      if (!this.f5Chance(pile)) return 0;
      return Math.max(0, pile.stack.countOf(ty) - Math.max(0, Math.floor(num(S.pileKeep, 20))));
    }
    const out = src.outStack;
    if (!out || out.max <= 0) return 0;
    const have = out.countOf(ty);
    if (src === gs.boathouse) return (this.overT.get(src) || 0) > 0 ? Math.max(0, have - Math.ceil(out.max * 0.3)) : 0;
    if ((this.overT.get(src) || 0) < num(S.outForS, 20)) return 0;
    const pad = src.outPad || src;
    if (this.localWant(ty, pad.x, pad.y)) return 0;
    return Math.max(0, Math.min(have, out.count - Math.ceil(out.max * 0.3)));
  }

  /** raw goes only after the line's 가공소 2단 had a chance: bought, or offered for 3 minutes */
  f5Chance(pile) {
    const L = this.v42 && this.v42.lines;
    if (!L) return true;
    const line = L.lineOfPile(pile);
    return !line || L.f5Chance(line);
  }

  /** a source-like view of a pile for the station porters ({ outStack, outPad, enabled }) */
  pileSource(p) {
    let s = this.pileShims.get(p);
    if (!s) { s = { pile: p, outStack: p.stack, outPad: p.pad, get enabled() { return !!(p.shown && p.enabled !== false); }, id: 'pile_' + (p.item || '') }; this.pileShims.set(p, s); }
    return s;
  }

  /** every place surplus can come from: [{ src, type, n, x, y }] */
  list() {
    const gs = this.gs, out = [];
    if (!this.on) return out;
    const W = gs.warehouse;
    if (W && W.enabled) for (const ty of W.types()) { const n = this.amount(W, ty); if (n > 0) out.push({ src: W, type: ty, n, x: W.outPad.x, y: W.outPad.y }); }
    for (const s of gs.sources ? gs.sources() : []) {
      if (!s.enabled || !s.outStack) continue;
      const seen = {};
      for (const it of s.outStack.items) { if (seen[it.type]) continue; seen[it.type] = 1; const n = this.amount(s, it.type); if (n > 0) out.push({ src: s, type: it.type, n, x: s.outPad.x, y: s.outPad.y }); }
    }
    for (const k in gs.piles || {}) {
      const p = gs.piles[k];
      if (!p || !p.shown || !p.item) continue;
      const n = this.amount(p, p.item);
      if (n > 0) { const sh = this.pileSource(p); out.push({ src: sh, type: p.item, n, x: p.pad.x, y: p.pad.y }); }
    }
    return out;
  }

  state() {
    const o = { on: this.on, list: this.list().map((q) => [q.src.id || (q.src.pile ? 'pile' : '?'), q.type, q.n]), empty: {} };
    for (const sl of this.sellers()) { const m = this.emptyT.get(sl) || {}; for (const ty in m) if (m[ty] > 0) o.empty[(sl.id || 'shop') + ':' + ty] = Math.round(m[ty]); }
    return o;
  }
}

export { FOODS, GOODS, STORE_GOODS };
