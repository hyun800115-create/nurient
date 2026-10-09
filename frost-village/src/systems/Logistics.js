// Logistics (v3): who needs which item, so porters know where to carry things.
// Every place that takes items registers itself as a "sink" (construction sites, hire pads waiting
// for a tool, the miners' food box, workshop inputs, the shops' shelves, the warehouse). A porter
// asks for the best sink for the item it carries: the most urgent kind first, then the nearest.
// Reservations make sure two porters do not both bring the last 4 planks a site needs.
//
// sink interface: { id, x, y (where a porter stands to unload), enabled, accepts(type),
//                   room(type) (how many more it takes, items flying in counted), prio(type),
//                   feed(ch) (move one item from ch.stack in; true if one moved) }

import { gdist } from '../core/Iso.js';

export const PRIO = {
  SITE: 100,        // construction materials, a tool for a hire pad
  FOOD_LOW: 95,     // the miners' food box is getting empty
  INPUT: 70,        // a workshop (toolsmith / cannery) input
  GRILL: 60,        // boat fish for the grill
  FOOD: 50,         // topping the food box up
  SHELF_LOW: 45,    // a shop shelf is nearly empty
  SHELF: 40,        // a shop shelf
  SHOP: 35,         // (v4) a founded shop's shelf at the station district (remote)
  WHOLESALE: 30,    // (v4) the loading dock at the station square (remote)
  STORE: 10,        // the warehouse
};

export class Logistics {
  constructor(gs) {
    this.gs = gs;
    this.sinks = [];
    this.res = new Map();      // sink -> { type: n } reserved by porters on their way
  }

  add(sink) { if (this.sinks.indexOf(sink) < 0) this.sinks.push(sink); return sink; }
  remove(sink) { const i = this.sinks.indexOf(sink); if (i >= 0) this.sinks.splice(i, 1); this.res.delete(sink); }

  reserved(sink, type) { const r = this.res.get(sink); return (r && r[type]) || 0; }
  reserve(sink, type, n) { if (!sink || n <= 0) return; let r = this.res.get(sink); if (!r) this.res.set(sink, r = {}); r[type] = (r[type] || 0) + n; }
  release(sink, type, n) { const r = sink && this.res.get(sink); if (!r || !r[type]) return; r[type] = Math.max(0, r[type] - n); }

  /** how many more of `type` the sink takes once the porters already on their way have arrived */
  want(sink, type) {
    if (!sink.enabled || !sink.accepts(type)) return 0;
    return Math.max(0, sink.room(type) - this.reserved(sink, type));
  }

  /**
   * best place for `type` from (x, y): { sink, n } or null. opts: minPrio, maxPrio (exclusive),
   * exclude (a sink), noStore (never the warehouse), remote (v4: also the far station-district sinks —
   * the loading dock, the new shops, the carpenter's house sites; regular porters never walk there),
   * onlyRemote (v4: only those — the station porters)
   */
  best(type, x, y, opts = {}) {
    let best = null, bp = -1, bd = Infinity, bn = 0;
    for (const s of this.sinks) {
      if (s === opts.exclude || (opts.noStore && s.isWarehouse)) continue;
      if (s.remote ? !(opts.remote || opts.onlyRemote) : opts.onlyRemote) continue;
      const n = this.want(s, type);
      if (n <= 0) continue;
      const p = s.prio(type);
      if (p <= 0 || (opts.minPrio !== undefined && p < opts.minPrio) || (opts.maxPrio !== undefined && p >= opts.maxPrio)) continue;
      const d = gdist(x, y, s.x, s.y);
      if (p > bp || (p === bp && d < bd)) { best = s; bp = p; bd = d; bn = n; }
    }
    return best ? { sink: best, n: bn, prio: bp } : null;
  }

  /** the most urgent sink that wants any of `types` (warehouse restocking): { sink, type, n } */
  bestAny(types, x, y, opts = {}) {
    let out = null;
    for (const ty of types) {
      const b = this.best(ty, x, y, opts);
      if (b && (!out || b.prio > out.prio || (b.prio === out.prio && gdist(x, y, b.sink.x, b.sink.y) < gdist(x, y, out.sink.x, out.sink.y)))) out = { sink: b.sink, type: ty, n: b.n, prio: b.prio };
    }
    return out;
  }
}
