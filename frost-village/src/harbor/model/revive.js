// Reviving the harbour (harbor_runtime model, docs/v5_v8_plan.md §6.4 "Revive steps"): seven sites in order — the
// rail east, the station + halt, the fish auction, the lighthouse, the ferry terminal, the crane + customs, the
// shipyard. Each site is offered when the one before is built; what each starts is listed in `EFFECTS`. Pure.

import { STEPS } from '../tuning.js';
import { BLD, RAIL, PADS, LR } from '../layout.js';

/** where each step's build site stands, which buildings come back to life, what it starts */
export const EFFECTS = {
  railExt: { site: { i: RAIL.sign.i - 0.2, j: RAIL.sign.j - 1.4 }, wakes: [], starts: ['region', 'reveal'] },
  station: { site: { i: 63.6, j: -0.2 }, wakes: ['h_station', 'h2_sailor_lodge', 'h2_harbor_office'], starts: ['coast'] },
  auction: { site: { i: 68.3, j: -8.6 }, wakes: ['h_fish_auction'], starts: ['auction'] },
  lighthouse: { site: { i: 86.6, j: -9.6 }, wakes: ['h_lighthouse'], starts: ['beam', 'nightFerry'] },
  terminal: { site: { i: 62.6, j: -8.6 }, wakes: ['h_ferry_terminal', 'h2_harbor_market', 'h2_seafood_restaurant'], starts: ['ferries'] },
  crane: { site: { i: 82.6, j: -8.7 }, wakes: ['h_harbor_crane', 'h_customs_house', 'h_harbor_warehouse'], starts: ['cargo', 'exports'] },
  shipyard: { site: { i: PADS.trawler.i - 1.6, j: PADS.trawler.j }, wakes: ['h_shipyard'], starts: ['trawlers'] },
};

export class Revive {
  constructor(saved = null) {
    this.built = new Set();
    if (saved) for (const s of saved) if (STEPS.indexOf(s) >= 0) this.built.add(s);
  }
  has(s) { return this.built.has(s); }
  /** the next step to offer (null when all are built) */
  next() { return STEPS.find((s) => !this.built.has(s)) || null; }
  index(s) { return STEPS.indexOf(s); }
  all() { return STEPS.every((s) => this.built.has(s)); }
  /** build a step (only the next one in order); -> true when it was new */
  build(s) {
    if (this.built.has(s) || STEPS.indexOf(s) < 0) return false;
    if (this.next() !== s) return false;
    this.built.add(s);
    return true;
  }
  /** is building `id` awake (revived)? */
  awake(id) { for (const s of this.built) if (EFFECTS[s].wakes.indexOf(id) >= 0) return true; return false; }
  /** the site def of a step: { id, step, x, y, cost } (the game's Site flow builds it, P29) */
  site(s, cfg) {
    const E = EFFECTS[s], c = cfg[s] || {};
    const [x, y] = LR(E.site.i, E.site.j);
    const b = E.wakes[0] ? BLD[E.wakes[0]] : null;
    return { id: 'h_step_' + s, step: s, x, y, key: b ? b.key : null, at: b ? { x: b.x, y: b.y } : null,
      cost: { coins: c.coins || 0, item_plank: c.item_plank || 0, item_ingot: c.item_ingot || 0 }, time: c.time || 10 };
  }
  serialize() { return STEPS.filter((s) => this.built.has(s)); }
}
