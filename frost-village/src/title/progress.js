// Save-progress adapter for the title (READ-ONLY): which growth stage the player's village has reached.
//
// The title never writes, migrates or backs up the save: it reads the raw JSON the game stored
// (src/core/Save.js SAVE_KEY) and looks at a few fields defensively. A save it cannot read = stage 1.
// The lead can pass the game's own value instead (TitleScreen hooks.stage), see
// docs/build_reports/title_code.md §4.
//
// The game's own rank (v4 plan §9 / §12: `v4.rank` 1 마을 | 2 읍 | 3 도시, strings rank_1..3) decides the
// town and the city. Before the 승격식 the title shows the village, however far v3 / v4 got:
//
//   stage 1 개척 : no save yet, or the first steps (grill, counter, first sales)
//   stage 2 마을 : the village took shape - first land opened, houses / watchtower / workshops built, the
//                  v2 or v3 village completed, the station repaired, the town open (rank 1 = 마을)
//   stage 3 읍   : rank 2 (the 승격식 was held: `v4.rank >= 2` or `progress.flags.rankEup`)
//   stage 4 도시 : rank 3 (`v4.rank >= 3`, or `v4.city.open`). Save.js sanitizes `v4.rank` to 1|2 today,
//                  so the city appears on the title once v5 lets the rank reach 3.
import { readJSON, SAVE_KEY } from '../core/Save.js';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** the game's rank (0 when the save has none): `v4.rank` as a number, or `{ level }` if it ever grows one */
export function rankOf(s) {
  const v4 = isObj(s) && isObj(s.v4) ? s.v4 : null;
  if (!v4) return 0;
  const r = v4.rank;
  if (typeof r === 'number' && Number.isFinite(r)) return Math.max(0, Math.floor(r));
  if (isObj(r) && typeof r.level === 'number' && Number.isFinite(r.level)) return Math.max(0, Math.floor(r.level));
  return 0;
}

/** stage 1..4 from a raw (or sanitized) save object; null / garbage -> 1 */
export function stageFromSave(s) {
  if (!isObj(s)) return 1;
  const pr = isObj(s.progress) ? s.progress : {};
  const done = isObj(pr.done) ? pr.done : {};
  const flags = isObj(pr.flags) ? pr.flags : {};
  const terr = isObj(s.territory) ? s.territory : {};
  const v4 = isObj(s.v4) ? s.v4 : {};
  const sites = isObj(s.sites) ? s.sites : {};
  const rank = rankOf(s);
  if (rank >= 3 || (isObj(v4.city) && v4.city.open === true)) return 4;
  if (rank >= 2 || flags.rankEup === true) return 3;
  let built = 0;
  for (const id in sites) { const d = sites[id]; if (isObj(d) && d.st === 'done') built++; }
  let nDone = 0;
  for (const k in done) if (done[k] === true) nDone++;
  if (pr.celebrated === true || pr.celebrated3 === true || done.zone_forest === true || terr.east === true || terr.south === true
    || terr.rail === true || terr.town === true || (isObj(v4.town) && v4.town.open === true) || built > 0 || nDone >= 10) return 2;
  return 1;
}

/** { exists, stage, rank } from the stored save (read-only; never throws) */
export function readProgress() {
  let raw = null;
  try { raw = readJSON(SAVE_KEY); } catch (e) { raw = null; }
  const exists = isObj(raw);
  return { exists, stage: exists ? stageFromSave(raw) : 1, rank: exists ? rankOf(raw) : 0 };
}
