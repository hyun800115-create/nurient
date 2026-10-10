// The call and the reveal (harbor_runtime view, docs/v5_v8_plan.md §6.4 "How it opens"): at 도시 + 1 min the
// rail-end signpost sparkles (E4) until the rail is extended; when the harbour opens the camera rides the new rails
// east and shows the sleepy, snowed-in harbour (ruins, three crates at the old auction hall, the dark lighthouse,
// two village boats, gulls on the bollards), then goes back to the chief. Camera moves only through
// ports.view.focus (the game decides whether a module may grab the camera).

import { RAIL, LR, L } from '../layout.js';

export class Reveal {
  constructor(view) {
    this.v = view;
    this.sparkT = 0;
    this.calling = false;
    this.seq = null;
  }

  call() { this.calling = true; this.sparkT = 0; }

  /** the rail is extended: ride east to the harbour */
  reveal() {
    this.calling = false;
    const [sx, sy] = LR(RAIL.sign.i, RAIL.sign.j);
    const mid = L(66, 0), basin = L(70, -14);
    this.seq = [
      { at: 0, x: sx, y: sy - 40, ms: 900 },
      { at: 0.8, x: mid[0], y: mid[1] - 40, ms: 1600 },
      { at: 2.2, x: basin[0], y: basin[1] - 60, ms: 3200 },
    ];
    this.seqT = 0;
  }

  update(dt) {
    const v = this.v;
    if (this.calling) {
      this.sparkT -= dt;
      if (this.sparkT <= 0) {
        this.sparkT = 1.3;
        const [x, y] = LR(RAIL.sign.i, RAIL.sign.j);
        if (v.near(x, y, 100)) { v.burst('star', x, y - 70, 4); v.fx('fx_sparkle', x, y - 60, 90, y + 2); }
      }
    }
    if (this.seq) {
      this.seqT += dt;
      while (this.seq.length && this.seq[0].at <= this.seqT) { const s = this.seq.shift(); v.focus(s.x, s.y, s.ms); }
      if (!this.seq.length) this.seq = null;
    }
  }

  destroy() { this.seq = null; }
}
