// Shops first (plan §5.3, pure). 금방 sells depot rack stock only, and an item pauses while any shop shelf selling it
// is short: `부족` / `길 막힘` in the v4.2 ledger, or under guard.shelfMin. It sells again after guard.resumeS at
// 적당 / 남음. 훈제 고기 sells only while its shelf has been ≥ guard.meatShelf for guard.meatForS. Items no shelf sells
// (raw goods) are never paused. The racks keep orders.keepFloor of every item (keepFloor lives in orders.js).
//   guard.update(dt, shelf)   shelf(item) -> [{ level 0..1, status: 'short' | 'jam' | 'ok' | 'surplus' }] | null
//   guard.paused(item) -> true while the item may not be ordered

export class ShopGuard {
  constructor(tune) {
    this.tune = tune;
    this.st = new Map();         // item -> { paused, okT, meatT }
    this.t = 0;
  }

  /** check every catalogue item against its shelves (≤ 2 Hz is plenty; the model calls it each second) */
  update(dt, shelf, items) {
    const G = this.tune.guard;
    this.t += dt;
    for (const item of items) {
      let s = this.st.get(item);
      if (!s) { s = { paused: false, okT: 0, meatT: 0 }; this.st.set(item, s); }
      const rows = shelf ? shelf(item) : null;
      if (!rows || !rows.length) { s.paused = false; s.okT = 0; s.meatT = G.meatForS; continue; }
      let short = false, minLv = 1;
      for (const r of rows) {
        const lv = Number.isFinite(r.level) ? r.level : 1;
        minLv = Math.min(minLv, lv);
        if (r.status === 'short' || r.status === 'jam' || lv < G.shelfMin) short = true;
      }
      if (short) { s.paused = true; s.okT = 0; }
      else if (s.paused) { s.okT += dt; if (s.okT >= G.resumeS) { s.paused = false; s.okT = 0; } }
      // 훈제 고기: the shelf must have been >= meatShelf for meatForS
      if (item === 'item_meat_cooked') {
        if (minLv >= G.meatShelf && !short) s.meatT = Math.min(G.meatForS * 4, s.meatT + dt); else s.meatT = 0;
      }
    }
  }

  paused(item) {
    const s = this.st.get(item);
    if (!s) return false;
    if (s.paused) return true;
    if (item === 'item_meat_cooked' && s.meatT < this.tune.guard.meatForS) return true;
    return false;
  }

  /** the app's status chip of an item: 'shop' (가게 먼저) | null */
  chip(item) { return this.paused(item) ? 'shop' : null; }
}
