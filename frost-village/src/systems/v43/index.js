// (v4.3 step B, B0) the step-B systems' entry: Game.js imports the seams from here, and this file registers each
// package's after-load hook in a fixed order (N's letter first; P1 only reads). build_plan.md §2 Seams.
//   (a package adds its own hook here in one line; S wires `info.remapped` / `info.refunds43` in Game.build)

import { onAfterLoad } from './hooks.js';
import { Renewal43 } from './Renewal43.js';
import { PlayLog } from './PlayLog.js';

onAfterLoad((gs, info) => Renewal43.afterLoad(gs, info));
onAfterLoad((gs, info) => PlayLog.afterLoad(gs, info));

export { onAfterLoad, runAfterLoad, emit, on, off, recent, v43Holder } from './hooks.js';
export { Renewal43, Renewal43Card } from './Renewal43.js';
export { PlayLog } from './PlayLog.js';
