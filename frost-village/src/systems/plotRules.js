// (v4.3 step B, B0 — build_plan.md BP-7 / BP-19) what a building plot may hold, in one place. The callers (Game.buildV3,
// later Tutorial.plotFor and Progression.freePlotFor (P), the build menu (L)) ask here instead of reading `only` / `size`
// themselves, so plot table v2's `types` (L1) changes one file.
//
// B0 writes today's rules, unchanged:
//   - a plot with `only` takes that one building;
//   - any other plot takes the Civic MENU cards of its size (S: houses + small decor; M / L: the four big workshops,
//     houses, big decor; XL: the hall and the big restaurant);
//   - `hidden: true` (none yet; L1 adds w_civic, d_labour, d_school, d_clinic): the plot gets no Site at all — no sprite,
//     pad, sign or menu (Game.buildV3 skips it). Save.js still keeps a site saved there when its `only` allows it.
// `plot` may be a world.js row (WORLD.plots[id]) or a Site (it carries `only`, `size` and its row as `cfg`).
// (Civic imports Progression; Progression may import this file later: MENU is only read inside the functions, so the
//  import cycle is harmless)

import { MENU } from './Civic.js';

/** is this plot kept out of the world (no Site)? */
export function isHidden(plot) {
  return !!plot && (plot.hidden === true || (!!plot.cfg && plot.cfg.hidden === true));
}

/** the building keys a plot's build menu offers, in menu order (a new array) */
export function menuKinds(plot) {
  if (!plot) return [];
  const only = plot.only || (plot.cfg && plot.cfg.only);
  if (only) return [only];
  return (MENU[plot.size] || MENU.M).slice();
}

/** may building `kind` stand on this plot? (today: `only`, else the menu of its size) */
export function plotAccepts(plot, kind) {
  return !!plot && typeof kind === 'string' && menuKinds(plot).indexOf(kind) >= 0;
}
