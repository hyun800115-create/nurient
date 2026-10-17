// (v4.2, docs/v42_plan.md §3.3) 자동 줍기: ONE policy for every "take" path of the chief —
//   Game.handlePlayerPads (station outputs, workshop outputs, the boathouse catch), Game.updateLabour (collection
//   piles), Player.update (gathering: trees, rocks, wheat, the net, animals). Deliveries are never gated.
//   mode 'auto' (켬, default)  v4.1: on contact, one item per padItemInterval; gathering after stillDelay
//        'still' (멈추면)     only after his speed stayed < pickup.stillSpeed on the pad for pickup.stillS (gathering
//                             after pickup.gatherStillS still): crossing a pad at 255 px/s (≈ 0.27 s) never grabs
//        'off' (끔)          never automatic: the 줍기 button (tap = one load up to bag room, hold = stream)
// The tutorial forces 'auto' until the fisherman is hired (the first loop teaches by walking onto pads).
//   PickupPolicy.mayTake(src, chief, dt)   call every frame the chief stands on a take pad (dwell timers)
//   PickupPolicy.mayGather(node, chief)    may he start / keep gathering this node now
//   held / tap()                           the 줍기 button
//   offer()                                { icon, n, label, src } while something takeable is within reach (the HUD)

import { BALANCE } from '../data/balance.js';
import { Settings } from '../core/Save.js';
import { t } from '../data/strings.js';

const P = () => (BALANCE.v42 && BALANCE.v42.pickup) || { stillS: 0.35, stillSpeed: 20, gatherStillS: 0.35, tipSpeed: 0.6 };

const TAP_MS = 300;            // a press shorter than this is a tap (one load); longer is a hold (stream)

export class PickupPolicy {
  constructor(gs, v42) {
    this.gs = gs;
    this.v42 = v42;
    this.held = false;        // the 줍기 button is pressed
    this.oneLoad = false;     // a tap: take until the bag is full / the pad is empty / he steps off
    this.src = null;          // the take pad he stood on last frame
    this.dwell = 0;           // s still on it
    this.touched = null;
    this.taken = 0;           // items taken (tests)
    this.blocked = 0;         // takes the policy held back (tests)
  }

  /** the mode in force: the setting, but 'auto' through the first loop */
  get mode() {
    const gs = this.gs;
    if (gs.tutorial && gs.tutorial.inTutorial) return 'auto';
    // (관망: the pilot picks up like the v4.1 chief)
    if (this.v42 && this.v42.pilot && this.v42.pilot.on) return 'auto';
    const m = Settings.data.pickup;
    return m === 'still' || m === 'off' ? m : 'auto';
  }

  /** start of Game.handlePlayerPads */
  frame() { this.touched = null; }
  /** end of the pad pass (+ updateLabour): leaving every take pad resets the dwell and a tap's load */
  endFrame() {
    if (this.touched !== this.src) { if (this.src && !this.touched) this.oneLoad = false; this.src = this.touched; this.dwell = 0; }
    // a tap's load ends when the bag is full or he walks off
    const p = this.gs.player;
    if (this.oneLoad && p && (p.room <= 0 || Math.hypot(p.vx || 0, p.vy || 0) > P().stillSpeed * 3)) this.oneLoad = false;
  }

  /** the chief stands on take pad `src` this frame: may he take from it now? */
  mayTake(src, p, dt) {
    this.touched = src;
    const mode = this.mode;
    const sp = Math.hypot(p.vx || 0, p.vy || 0);
    if (src === this.src && sp < P().stillSpeed) this.dwell += dt || 0;
    else if (src !== this.src || sp >= P().stillSpeed) this.dwell = 0;
    if (mode === 'auto') {
      // ((v4.2 fix, gameplay M5) while the 길 안내 leads a load somewhere, crossing another kind's pad does not grab it
      //  in passing (the ingot run picked up a plank on the way): stop on it to take some — the 멈추면 rule)
      if (!this.guidedOther(src, p)) return true;
      if (this.dwell >= P().stillS) return true;
      this.blocked++;
      return false;
    }
    if (mode === 'still') return this.dwell >= P().stillS;
    // 'off': only the button
    if (this.oneLoad && p.room <= 0) this.oneLoad = false;
    return this.held || this.oneLoad;
  }

  /** the guide is leading his load and this pad holds a kind not in the bag */
  guidedOther(src, p) {
    const nav = this.v42 && this.v42.nav;
    if (!nav || !nav.active || !nav.dest || !nav.dest.pad || !p.stack || !p.stack.count) return false;
    if (this.gs.tutorial && this.gs.tutorial.inTutorial) return false;
    if (this.v42.pilot && this.v42.pilot.on) return false;
    const st = src && src.outStack, top = st && st.items && st.items[st.items.length - 1];
    const ty = top ? top.type : src && src.item;
    if (!ty) return false;
    for (const it of p.stack.items) if (it.type === ty) return false;
    return true;
  }

  /** may the chief gather `node` (he has stood still `p.stillT` s)? */
  mayGather(node, p) {
    const mode = this.mode;
    if (mode === 'auto') return true;
    if (mode === 'still') return (p.stillT || 0) >= P().gatherStillS;
    // ('off': gathering only while 줍기 is held — a tap's "one load" is for pads)
    return this.held;
  }
  /** keep gathering the node he works (the button released in 'off' mode stops him) */
  keepGathering(p) { void p; return this.mode !== 'off' || this.held; }

  /** a take happened (tests; the one-time tip when 'auto' grabbed while crossing fast) */
  took(p) {
    this.taken++;
    const v = this.v42;
    if (this.mode !== 'auto' || !v || v.seen.pickupTip || (this.gs.tutorial && this.gs.tutorial.inTutorial)) return;
    const sp = Math.hypot(p.vx || 0, p.vy || 0), max = (BALANCE.player.speed || 255) * (this.gs.progress ? this.gs.progress.speedMult() : 1);
    if (sp > max * P().tipSpeed) { v.seen.pickupTip = 1; this.gs.ui.toast(t('pickupTip')); }
  }

  /** the 줍기 button */
  // ((gameplay review L2) tap = one load up to the bag's room; hold = stream while held, and letting go stops)
  press() { this.held = true; this.oneLoad = false; this.pressAt = this.gs.time.now; }
  release() {
    if (!this.held) return;
    this.held = false;
    this.oneLoad = this.gs.time.now - (this.pressAt || 0) < TAP_MS;
  }

  /** what the 줍기 button offers now: a take pad under the chief, or a node to gather within reach */
  offer() {
    const gs = this.gs, p = gs.player;
    if (!p || this.mode !== 'off') return null;
    const near = (pad) => pad && pad.contains && pad.contains(p.x, p.y, 20);
    const outOf = (src) => { const it = src.outStack && src.outStack.items[src.outStack.items.length - 1]; return it ? it.type : null; };
    for (const s of gs.stationList || []) if (s.enabled && s.outStack.count > 0 && near(s.outPad)) return { icon: outOf(s), n: s.outStack.count, src: s };
    for (const w of gs.workshops || []) if (w.enabled && w.outStack.count > 0 && near(w.outPad)) return { icon: outOf(w), n: w.outStack.count, src: w };
    const bh = gs.boathouse;
    if (bh && bh.enabled && bh.outStack.count > 0 && near(bh.outPad)) return { icon: outOf(bh), n: bh.outStack.count, src: bh };
    for (const id in gs.piles || {}) { const pl = gs.piles[id]; if (pl.shown && pl.enabled && pl.count > 0 && near(pl.pad)) return { icon: pl.item, n: pl.count, src: pl }; }
    const n = gs.findGatherable && gs.findGatherable(p.x, p.y, BALANCE.player.gatherRange);
    if (n) return { icon: n.item || null, n: 0, src: n, gather: true };
    return null;
  }

  state() { return { mode: this.mode, held: this.held, oneLoad: this.oneLoad, dwell: +this.dwell.toFixed(2), taken: this.taken, blocked: this.blocked }; }
}
