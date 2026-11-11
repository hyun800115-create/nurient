// (v4.3 step B, B0 — build_plan.md §2 Test helper, BP-21) helpers for suites that inject a save.
//
// From step S on, a save without the R43 marker (v43.lay < 2: every fixture made before step B, every hand-built save)
// is remapped to plot table v2 when the game loads it: workshops move to their d_* plots, the hall / office prices are
// re-checked, the chief restarts at WORLD.v43.oldStart. A suite that only wants the step-B rules on its own save,
// without that remap, marks it with asStepB(). A suite that measures what a real old village gets (G4 walks, meat cans,
// porters, the coin census) loads the fixture as it is, through the real remap. The B0 audit lists which suite takes
// which: scratchpad/v43/stepB/b0/suites_audit.md.
//
//   asStepB(save)   save object -> a copy with v43.lay = 2 (other v43 fields kept)
//                   save text (JSON) -> the same, as text
//                   a fixture of keys ({ keys: { 'frostVillage.save.v1': text, ... } } or the keys map itself) -> a copy
//                   whose save key is marked; the other keys are untouched
//   isStepB(save)   does it carry the marker already (any of the three shapes)?
//   LAY, SAVE_KEY

import { LAY } from '../../src/data/ids43.js';

export { LAY };
export const SAVE_KEY = 'frostVillage.save.v1';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const mark = (o) => Object.assign({}, o, { v43: Object.assign({}, isObj(o.v43) ? o.v43 : {}, { lay: LAY }) });
const marked = (o) => isObj(o) && isObj(o.v43) && Math.floor(Number(o.v43.lay)) >= LAY;

export function asStepB(save) {
  if (typeof save === 'string') return JSON.stringify(mark(JSON.parse(save)));
  if (!isObj(save)) throw new Error('asStepB: a save object, its JSON text or a keys fixture');
  if (isObj(save.keys) && typeof save.keys[SAVE_KEY] === 'string') return Object.assign({}, save, { keys: asStepB(save.keys) });
  if (typeof save[SAVE_KEY] === 'string') return Object.assign({}, save, { [SAVE_KEY]: asStepB(save[SAVE_KEY]) });
  return mark(save);
}

export function isStepB(save) {
  if (typeof save === 'string') { try { return marked(JSON.parse(save)); } catch (e) { return false; } }
  if (!isObj(save)) return false;
  if (isObj(save.keys) && typeof save.keys[SAVE_KEY] === 'string') return isStepB(save.keys[SAVE_KEY]);
  if (typeof save[SAVE_KEY] === 'string') return isStepB(save[SAVE_KEY]);
  return marked(save);
}
