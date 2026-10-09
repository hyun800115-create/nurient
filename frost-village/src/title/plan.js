// What this title will show, decided once from the player's state (read-only): the first-run intro or the
// idle title, which growth stage, which time of day. TitleAssets uses it to fetch only what the first frame
// needs (the game's Preload can ask for it at boot) and to stream the rest in the order it is needed;
// TitleScreen uses the same answer to run the title.
import { TITLE_CFG } from './config.js';
import { TitlePrefs, prefersReducedMotion, lowMemoryDevice } from './prefs.js';
import { readProgress } from './progress.js';

/** idle time of day for a stage: 0 day .. 1 dusk .. 2 night (TITLE_CFG.idleTime) */
export function idleTod(stage) {
  const m = TITLE_CFG.idleTime;
  if (m === 'day') return 0.15;
  if (m === 'dusk') return 1.05;
  if (m === 'night') return 2;
  // 'auto': a warm dusk with the first lights for the camp and the village, the starry night for the
  // town and the city (their windows, streetlights and the lighthouse are the show)
  return stage <= 2 ? 1.12 : 2;
}

/**
 * { intro, reduced, cap, saveStage, idleStage, grows, tod, shown }
 * hooks (all optional): { intro: bool, stage: 1..4, reduced: bool } - window.__FV_TITLE_HOOKS is read too
 */
export function titlePlan(hooks) {
  const h = Object.assign({}, (typeof window !== 'undefined' && window.__FV_TITLE_HOOKS) || {}, hooks || {});
  TitlePrefs.load();
  const reduced = h.reduced !== undefined ? !!h.reduced : prefersReducedMotion();
  const cap = lowMemoryDevice() ? Math.max(1, Math.min(4, TITLE_CFG.lowMemStageCap)) : 4;
  const st = Number.isFinite(h.stage) ? h.stage : readProgress().stage;
  const saveStage = Math.max(1, Math.min(4, Math.floor(st) || 1));
  const intro = (h.intro !== undefined ? !!h.intro : TitlePrefs.wantIntro()) && !reduced;
  const idleStage = Math.min(cap, saveStage);
  const shown = TitlePrefs.data.shown;
  const grows = !intro && !reduced && shown >= 1 && shown < idleStage;
  return { intro, reduced, cap, saveStage, idleStage, grows, tod: idleTod(idleStage), shown };
}

/** the packs the first frame of this title needs (the title waits for these; Preload can fetch them at boot) */
export function firstPaintPacks(plan) {
  const p = ['art:sky', 'art:fx', 'art:logo'];
  if (plan.intro) { p.unshift('g1'); return p; }
  for (let g = plan.idleStage; g >= 1; g--) p.unshift('g' + g);
  p.push('art:shine');
  if (plan.tod >= 1.5) p.push('art:night');      // stars, moon, aurora: the night sky (at dusk they stream)
  if (plan.idleStage >= 4) p.push('art:city');
  return p;
}

/** what streams in while the title plays, in the order it is needed */
export function streamPacks(plan, intro) {
  if (intro) {
    // (2 packs download at once, the island first: on a slow phone network the next stage matters more than
    // the painted stars or the pop sparkle, which have stand-ins / the game's own puff until they land)
    const p = ['g2', 'g3', 'art:pop', 'g4', 'art:night', 'cues', 'art:city', 'art:parts', 'art:shine'];
    return p.filter((n) => (n[0] === 'g' ? +n.slice(1) <= plan.cap : n !== 'art:city' || plan.cap >= 4));
  }
  const p = [];
  if (plan.grows) p.push('art:pop');
  p.push('art:night');
  if (plan.idleStage >= 3) p.push('cues');
  return p;
}
