// (v4.3 step B — build_plan.md BP-7 / BP-19; B0 the seam, L1 the `types` rule) what a building plot may hold, in one
// place. The callers (Game.buildV3, the build menu (Civic.choices), later Tutorial.plotFor and Progression.freePlotFor (P))
// ask here instead of reading `only` / `size` themselves.
//
//   - a plot with `only` takes that one building (the fixed workshop plots d_tool / d_wh / d_cannery / d_store, the hall's
//     w_hall, the office, the bank, the depot, the station, the first houses);
//   - a plot with `types` (world.js plot table v2: the generic M / L plots ['house_*', 'deco_*'], the restaurant's w_rest
//     ['big_restaurant']) takes the cards of its size that match one of the patterns ('house_*' = every key that starts
//     with 'house_'; a plain key = that key, offered even when its catalog card has no size letter for this plot): one
//     entry each for later kinds (v5: 'br', 'care_*') — the build menu only, never sanitize (map_save V-N5);
//   - any other plot takes the Civic MENU cards of its size (S: houses + small decor; M / L: houses + decor (the four big
//     workshops left the generic menus with plot table v2: each has its own plot); XL: the hall and the big restaurant);
//   - `hidden: true` (w_civic, d_labour, d_school, d_clinic): the plot gets no Site at all — no sprite, pad, sign or menu
//     (Game.buildV3 skips it). Its `only` is not a building of this version, so Save.js drops anything saved there.
// `plot` may be a world.js row (WORLD.plots[id]) or a Site (it carries `only`, `size` and its row as `cfg`).
// (Civic imports Progression; Progression may import this file later: MENU / CATALOG are only read inside the functions, so
//  the import cycle is harmless)

import { MENU, CATALOG } from './Civic.js';

const SIZE_LETTER = { S: 'S', M: 'M', L: 'L', XL: 'X' };

/** is this plot kept out of the world (no Site)? */
export function isHidden(plot) {
  return !!plot && (plot.hidden === true || (!!plot.cfg && plot.cfg.hidden === true));
}

/** the plot's `types` patterns (a row or a Site's row), or null */
export function typesOf(plot) {
  if (!plot) return null;
  const t = Array.isArray(plot.types) ? plot.types : plot.cfg && Array.isArray(plot.cfg.types) ? plot.cfg.types : null;
  return t ? t.filter((q) => typeof q === 'string' && q.length > 0) : null;
}

/** does building key `kind` match a `types` pattern ('house_*' = a prefix, else the exact key)? */
export function kindMatches(kind, pat) {
  if (typeof kind !== 'string' || typeof pat !== 'string' || !pat) return false;
  return pat.charAt(pat.length - 1) === '*' ? kind.indexOf(pat.slice(0, -1)) === 0 : kind === pat;
}

/** the building keys a plot's build menu offers, in menu order (a new array) */
export function menuKinds(plot) {
  if (!plot) return [];
  const only = plot.only || (plot.cfg && plot.cfg.only);
  if (only) return [only];
  const size = plot.size || (plot.cfg && plot.cfg.size);
  const base = MENU[size] || MENU.M;
  const types = typesOf(plot);
  if (!types) return base.slice();
  // the size's menu first (its order), then any other catalog card of this size (a later kind: one CATALOG row), then a
  // plain key the row names outright
  const letter = SIZE_LETTER[size] || 'M';
  const pool = base.slice();
  for (const k in CATALOG) if (pool.indexOf(k) < 0 && String((CATALOG[k] && CATALOG[k].sizes) || '').indexOf(letter) >= 0) pool.push(k);
  for (const p of types) if (p.charAt(p.length - 1) !== '*' && CATALOG[p] && pool.indexOf(p) < 0) pool.push(p);
  return pool.filter((k) => types.some((p) => kindMatches(k, p)));
}

/** may building `kind` stand on this plot? (`only`, else `types` over the cards of its size, else the menu of its size) */
export function plotAccepts(plot, kind) {
  return !!plot && typeof kind === 'string' && menuKinds(plot).indexOf(kind) >= 0;
}
