// (v4.3 step B, B0) the step-B systems' entry: Game.js imports the seams from here, and this file registers each
// package's after-load hook in a fixed order (N's letter first; P1 only reads). build_plan.md §2 Seams.
//   (a package adds its own hook here in one line; S wires `info.remapped` / `info.refunds43` in Game.build)

import { onAfterLoad } from './hooks.js';
import { Renewal43 } from './Renewal43.js';
import { Goals43 } from '../goals/Goals43.js';
import { EupTaste } from './EupTaste.js';
import { PlayLog } from './PlayLog.js';

onAfterLoad((gs, info) => Renewal43.afterLoad(gs, info));
// (B0b, postdepot_addendum.md §6.1) the post-depot chain (G), then the 읍장 취임 맛보기 (T): after N's letter, before P1
onAfterLoad((gs, i) => Goals43.attach(gs, i));
onAfterLoad((gs, i) => EupTaste.attach(gs, i));
onAfterLoad((gs, info) => PlayLog.afterLoad(gs, info));

export { onAfterLoad, runAfterLoad, emit, on, off, recent, v43Holder } from './hooks.js';
export { Renewal43, Renewal43Card } from './Renewal43.js';
export { Goals43, GOALS43 } from '../goals/Goals43.js';
export { EupTaste } from './EupTaste.js';
export { PlayLog } from './PlayLog.js';
