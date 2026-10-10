// Orders of the logistics centre (pure).
//   Outbound — what leaves the racks for a customer:
//     to      'shop:<id>' (a v4 Growth shop's restock), 'story:<shop>' (a resident's own shop picking up, story
//             engine `shop pickup`), 'home:<id>' (살림살이 for a house / a new household's furniture)
//     mode    'van'  — the owner drives a delivery van to a dock, queues, settles, the forklift loads the pallets
//             'walk' — a small order: the owner walks in, settles and carries the parcel home (carry_box)
//             'centre' — the centre's own van takes it to a home (no queue; the household pays on delivery)
//     st      pick -> pack -> ready -> gone (off the stage, on its way) -> done      (cancel: nothing could be picked)
//     want/got  { item: n } asked / picked off the racks (picked items left the stock)
//   Inbound — a vehicle bringing goods in (freight from the yard, a producer's output): its cargo goes onto the racks
//     when the forklift puts the pallets away.
// Settlement: shop / story orders pay price x wholesaleRate x (1 + settleBonus) at the counter (the stamp); home
// orders pay price x homeRate on delivery. Every coin goes into the 물류 금고 (cash).

export const sum = (o) => { let n = 0; for (const k in o) n += o[k] || 0; return n; };
export const copy = (o) => { const r = {}; for (const k in o) if (o[k] > 0) r[k] = o[k]; return r; };

/** coins for the goods of an order (rounded once, on the whole order) */
export function orderValue(kind, goods, price, tune) {
  let v = 0;
  for (const k in goods) v += (price(k) || 0) * goods[k];
  const rate = kind === 'home' ? (tune.homeRate || 1) : (tune.wholesaleRate || 0.7) * (1 + (tune.settleBonus || 0));
  return Math.max(0, Math.round(v * rate));
}

let SEQ_GUARD = 0;      // (only for ids made without a model: tests)

export class Order {
  /** o: { id, to, kind: 'shop'|'story'|'home', mode: 'van'|'walk'|'centre', want, got?, st?, settled?, tag?, look?, name? } */
  constructor(o) {
    this.id = o.id || 'o' + (++SEQ_GUARD);
    this.to = o.to;
    this.kind = o.kind;
    this.mode = o.mode;
    this.want = copy(o.want || {});
    this.got = copy(o.got || {});
    this.st = o.st || 'pick';
    this.settled = !!o.settled;      // the money is in (counter stamp or delivery)
    this.loaded = 0;                 // items handed to the vehicle / owner
    this.onFork = 0;                 // items on the forklift's pallet right now
    this.tag = o.tag || null;        // 'lv3' (살림살이) | 'movein' | null
    this.look = o.look || null;      // the owner's doll look (game: the shop keeper / the resident)
    this.name = o.name || null;      // shop name for chips and toasts
    this.waitT = 0;                  // s waiting for stock while picking
    this.packT = 0;
    this.age = 0;
    this.value = 0;
    this.veh = null;                 // vehicle id serving it
    this.agent = null;               // owner agent id
  }
  n() { return sum(this.got); }
  wantN() { return sum(this.want); }
  /** items still to pick (want - got) */
  missing() { const m = {}; for (const k in this.want) { const d = this.want[k] - (this.got[k] || 0); if (d > 0) m[k] = d; } return m; }
  pallets(size) { return Math.max(1, Math.ceil(this.n() / Math.max(1, size))); }
}

export class Shipment {
  /** o: { id, from, items, veh: key } */
  constructor(o) {
    this.id = o.id;
    this.from = o.from;              // 'yard' | 'station' | 'producer:<id>' | 'harbor'
    this.items = copy(o.items || {});
    this.key = o.key || 'truck_cargo';
    this.st = 'road';                // road -> docked -> done
    this.n0 = sum(this.items);
  }
  n() { return sum(this.items); }
  /** take up to n items (a pallet), biggest lines first */
  takePallet(n) {
    const out = {};
    let left = n;
    for (const k of Object.keys(this.items).sort((a, b) => this.items[b] - this.items[a] || (a < b ? -1 : 1))) {
      if (left <= 0) break;
      const q = Math.min(left, this.items[k]);
      if (q > 0) { out[k] = q; this.items[k] -= q; left -= q; if (!this.items[k]) delete this.items[k]; }
    }
    return out;
  }
}
