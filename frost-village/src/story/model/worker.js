// Story worker entry (docs/v5_v8_plan.md §6.1 model/worker.js): the engine lives here, off the main thread. A
// module worker in the lab and in development; the build (P25) bundles it into the classic script
// story_worker.js (no import / export), which StoryHost also accepts as a Blob worker.
import { StoryCore } from './core.js';

const core = new StoryCore((msg, transfer) => self.postMessage(msg, transfer || []), { maxCatch: 600 });
self.onmessage = (ev) => core.handle(ev.data);
