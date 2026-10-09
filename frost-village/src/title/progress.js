// Save-progress adapter for the title (READ-ONLY): which growth stage the player's village has reached.
//
// The title never writes, migrates or backs up the save: it reads the raw JSON the game stored
// (src/core/Save.js SAVE_KEY) and looks at a few fields defensively. A save it cannot read = stage 1.
// The lead can pass the game's own summary instead (TitleScreen opts.stage / opts.summary), see
// docs/build_reports/title_code.md §4.
//
//   stage 1 개척 : no save yet, or the first steps (grill, counter, first sales)
//   stage 2 마을 : the village took shape — first land opened, houses / watchtower / workshops built,
//                  or the v2 village was completed (progress.celebrated)
//   stage 3 읍   : v4 — the rail strip / town is open, the station was repaired, or the v3 village was
//                  completed (progress.celebrated3)
//   stage 4 도시 : v5+ (buses, harbour, city). Not reachable in v4; any of `city` / `v5` / `v4.city.open`
//                  in the save switches it on, so the title is ready when the city lands.
import { readJSON, SAVE_KEY } from '../core/Save.js';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** stage 1..4 from a raw (or sanitized) save object; null / garbage -> 1 */
export function stageFromSave(s) {
  if (!isObj(s)) return 1;
  const pr = isObj(s.progress) ? s.progress : {};
  const done = isObj(pr.done) ? pr.done : {};
  const terr = isObj(s.territory) ? s.territory : {};
  const v4 = isObj(s.v4) ? s.v4 : {};
  const sites = isObj(s.sites) ? s.sites : {};
  if (isObj(s.city) || isObj(s.v5) || (isObj(v4.city) && v4.city.open === true)) return 4;
  let builtXL = false, built = 0;
  for (const id in sites) {
    const d = sites[id];
    if (!isObj(d) || d.st !== 'done') continue;
    built++;
    if (d.b === 'station') builtXL = true;
  }
  if ((isObj(v4.town) && v4.town.open === true) || terr.town === true || builtXL || pr.celebrated3 === true) return 3;
  let nDone = 0;
  for (const k in done) if (done[k] === true) nDone++;
  if (pr.celebrated === true || done.zone_forest === true || terr.east === true || terr.south === true || built > 0 || nDone >= 10) return 2;
  return 1;
}

/** { exists, stage } from the stored save (read-only; never throws) */
export function readProgress() {
  let raw = null;
  try { raw = readJSON(SAVE_KEY); } catch (e) { raw = null; }
  const exists = isObj(raw);
  return { exists, stage: exists ? stageFromSave(raw) : 1 };
}
