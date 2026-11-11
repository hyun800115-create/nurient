// (v4.2, docs/v42_plan.md §7.4) 관망's camera: follows the chief (the game's own follow), keeps the zoom ≥ pilot.minZoom
// (restored on hand-back unless the player zoomed meanwhile), and now and then cuts to something worth seeing (볼거리,
// setting observeEvents): at most one cut every cutEvery 45–90 s, cutHold 6–8 s, events within cutRange px of the chief —
// the train arriving at ours (when he is > 900 px away), a ribbon, a move-in, the courier's deposit (the vault), a letter
// at the mailbox, the sleigh. No cut within 20 s of the last, none while a panel is open; the caption names the event.
// ((v4.3) 둘러보기: while 관망 is on one finger (or the mouse, or the arrow keys / WASD) moves the camera over the whole
//  village — Input.pan / Input.panKeys. The first move detaches the camera from the chief (`free`, mirrored as gs.camPan
//  for Game.tick, which then follows it 1:1): a cut on its way is dropped, no new cut and no other focusCamera moves it,
//  the point stays inside the camera bounds (Territory.camRect: the open land, the fog peek, 150 px over the sea's top
//  edge), a quick flick glides on a little. attach() (the 「촌장님 보기」 chip) or the end of 관망 glides it back
//  (gs.camGlide, pilot.camLerp). Residency, the ground baking and the view culling read gs.camTarget / the camera, so they
//  follow the free camera as they follow the chief.)

import { BALANCE } from '../../data/balance.js';
import { Settings } from '../../core/Save.js';
import { Input } from '../../core/Input.js';
import { gdist } from '../../core/Iso.js';

const PB = () => (BALANCE.v42 && BALANCE.v42.pilot) || {};
const FLING_MAX = 2600;      // world px / s a flick may glide at
const FLING_DECAY = 6;       // 1/s: how fast the glide after a flick dies down
const FLING_MIN = 30;        // world px / s below which it stops

export class CameraDirector {
  constructor(gs, pilot) {
    this.gs = gs;
    this.pilot = pilot;
    this.nextCut = 30;
    this.cut = null;          // { what, x, y, until }
    this.cuts = 0;
    this.zoom0 = null;
    this.zoomSet = null;
    this.events = [];
    this.free = null;         // (v4.3) { x, y }: where the player looks around (null = with the chief / a cut)
    this.goal = null;         // (v4.3) { x, y }: a glide of the free point the player asked for (office panel 「보러 가기」)
    this.vel = { x: 0, y: 0 };
    this.panned = 0;          // (v4.3) world px moved by the player while 관망 was on (state / tests)
    this.detaches = 0;
    this.blocked = 0;         // (v4.3) cuts held back because the player was looking around
    const push = (what, x, y) => { if (this.pilot.on) this.events.push({ what, x, y, t: this.pilot.t }); };
    this.onTrain = (ev, stop) => { const nb = gs.v4; if (ev === 'whistle' && stop === 'ours' && nb && nb.ours) push('cut_train', nb.ours.x - 60, nb.ours.y + 40); };
    this.onDeposit = () => { const O = gs.v42 && gs.v42.office; if (O && O.bank) push('cut_vault', O.bank.x, O.bank.y - 60); };
    this.onLetter = () => { const O = gs.v42 && gs.v42.office; if (O && O.building) push('cut_mail', O.building.spots.mailbox.x, O.building.spots.mailbox.y); };
    this.onBuilt = (k, site) => { if (site) push('cut_ribbon', site.x, site.y - 60); };
    gs.events.on('v4:train', this.onTrain);
    gs.events.on('courier:deposit', this.onDeposit);
    gs.events.on('office:letter', this.onLetter);
    gs.events.on('built', this.onBuilt);
  }

  start() {
    const gs = this.gs;
    this.zoom0 = gs.zoomTarget;
    const mz = Number(PB().minZoom) || 0.7;
    if (gs.zoomTarget < mz && gs.zoomBy) gs.zoomTarget = mz;
    this.zoomSet = gs.zoomTarget;
    this.nextCut = this.range(PB().cutEvery, 45, 90) * 0.6;
    this.events.length = 0;
    this.free = null;
    this.vel.x = this.vel.y = 0;
    gs.camPan = null;
  }

  stop() {
    const gs = this.gs;
    if (this.cut) { gs.camFocus = null; this.cut = null; }
    // ((v4.3) looking around: the camera glides back to the chief)
    if (this.free) { this.free = null; gs.camPan = null; gs.camGlide = true; }
    this.goal = null;
    this.vel.x = this.vel.y = 0;
    // (the zoom 관망 raised goes back; a zoom the player chose meanwhile stays)
    if (this.zoom0 !== null && gs.zoomTarget !== this.zoom0 && gs.zoomTarget === this.zoomSet) gs.zoomTarget = this.zoom0;
    this.zoom0 = null;
    this.zoomSet = null;
  }

  range(a, lo, hi) { const r = Array.isArray(a) ? a : [lo, hi]; return r[0] + this.pilot.rand() * Math.max(0, r[1] - r[0]); }

  // ------------------------------------------------------------------ (v4.3) 둘러보기
  /** the camera leaves the chief where it stands now (a cut on its way is dropped) */
  detach() {
    const gs = this.gs, ct = gs.camTarget;
    if (this.free || !ct) return this.free;
    if (this.cut) { this.cut = null; gs.camFocus = null; }
    else if (gs.camFocus) gs.camFocus = null;
    this.free = this.clamp({ x: ct.x, y: ct.y });
    gs.camPan = this.free;
    gs.camGlide = false;
    this.detaches++;
    // (the one-time look-around hint has done its job)
    this.pilot.hintUntil = 0;
    return this.free;
  }

  /** back to the chief (and the cuts): the 「촌장님 보기」 chip */
  attach() {
    const gs = this.gs;
    if (!this.free) return false;
    this.free = null;
    this.goal = null;
    gs.camPan = null;
    gs.camGlide = true;
    this.vel.x = this.vel.y = 0;
    // (his seated / social sheet asked for again at once; no cut the moment he is back in view)
    this.pilot.sheetT = 0;
    this.nextCut = Math.max(this.nextCut, 8);
    this.events.length = 0;
    return true;
  }

  /** keep a look-around point inside the camera bounds (the view's centre range at the current zoom) */
  clamp(pt) {
    const gs = this.gs, cam = gs.cameras && gs.cameras.main, b = gs.territory && gs.territory.camRect;
    if (!cam || !b) return pt;
    const z = Math.max(0.05, cam.zoom || 1), hw = cam.width / z / 2, hh = cam.height / z / 2;
    pt.x = b.w <= hw * 2 ? b.x + b.w / 2 : Math.max(b.x + hw, Math.min(b.x + b.w - hw, pt.x));
    pt.y = b.h <= hh * 2 ? b.y + b.h / 2 : Math.max(b.y + hh, Math.min(b.y + b.h - hh, pt.y));
    return pt;
  }

  /** (a jump the player asked for while looking around: the office panel's 「보러 가기」) glide the point there */
  glideTo(x, y) { if (!this.free) return false; this.goal = { x, y }; this.vel.x = this.vel.y = 0; return true; }

  /** move the look-around point by world px (detaches first) */
  panBy(dx, dy) {
    if (!dx && !dy) return;
    const f = this.free || this.detach();
    if (!f) return;
    const x0 = f.x, y0 = f.y;
    f.x += dx; f.y += dy;
    this.clamp(f);
    this.panned += Math.hypot(f.x - x0, f.y - y0);
  }

  /** the finger / mouse / keys of this frame */
  look(dt) {
    const gs = this.gs, q = Input.pan, k = Input.panKeys, v = this.vel;
    if (!gs.cameras || !gs.camTarget) { q.dx = q.dy = 0; return; }
    // (the whole-village view shows everything already: no look-around there; a rank ceremony shows its square — the
    //  camera goes with it)
    const R = gs.v4 && gs.v4.rank;
    if (R && R.ceremonyOn && this.free) this.attach();
    if (gs.overview || (R && R.ceremonyOn)) { q.dx = q.dy = 0; v.x = v.y = 0; return; }
    const z = Math.max(0.05, gs.zoomCur || 1);
    // (a glide the player asked for: until it arrives or a finger / key takes over)
    if (this.goal && (q.dx || q.dy || k.x || k.y || !this.free)) this.goal = null;
    if (this.goal) {
      const f = this.free, g = this.goal, a = 1 - Math.pow(1 - 0.08, dt * 60);
      const x0 = f.x, y0 = f.y;
      f.x += (g.x - f.x) * a; f.y += (g.y - f.y) * a;
      if (Math.hypot(g.x - f.x, g.y - f.y) < 3) { f.x = g.x; f.y = g.y; this.goal = null; }
      this.clamp(f);
      // (as near as the bounds let it)
      if (this.goal && Math.hypot(f.x - x0, f.y - y0) < 0.05) this.goal = null;
    }
    if (q.dx || q.dy) {
      // a logical px on screen is 1 / zoom world px; the village moves with the finger
      const dx = -q.dx / z, dy = -q.dy / z;
      q.dx = q.dy = 0;
      this.panBy(dx, dy);
      const a = Math.min(1, dt * 18), s = 1 / Math.max(dt, 1 / 120);
      v.x += (dx * s - v.x) * a; v.y += (dy * s - v.y) * a;
    } else if (q.active) {
      // a finger held still: no glide when it lifts
      const a = Math.min(1, dt * 20);
      v.x -= v.x * a; v.y -= v.y * a;
    } else if (q.flick && (v.x || v.y)) {
      // ((v4.3 review F1) only after the panning finger was really lifted (Input.pointerUp): a pinch's second finger
      //  (Input.release) clears `flick` — the camera used to slide on while both fingers were held still)
      const sp = Math.hypot(v.x, v.y);
      if (sp > FLING_MAX) { v.x *= FLING_MAX / sp; v.y *= FLING_MAX / sp; }
      if (this.free && sp > FLING_MIN) {
        this.panBy(v.x * dt, v.y * dt);
        const d = Math.exp(-FLING_DECAY * dt);
        v.x *= d; v.y *= d;
      } else { v.x = v.y = 0; q.flick = false; }
    } else { v.x = v.y = 0; q.flick = false; }
    if (k.x || k.y) {
      const sp = (Number(PB().panKeys) || 900) / z;
      v.x = v.y = 0; q.flick = false;
      this.panBy(k.x * sp * dt, k.y * sp * dt);
    }
    // (the zoom may have changed: the range of the view's centre with it)
    if (this.free) this.clamp(this.free);
  }

  /** events older than 10 s are stale ((v4.3 review F9) in place, and only when there are any: no array a frame) */
  dropStale() {
    const E = this.events;
    if (!E.length) return;
    const t = this.pilot.t;
    let w = 0;
    for (let i = 0; i < E.length; i++) if (t - E[i].t < 10) E[w++] = E[i];
    E.length = w;
  }

  update(dt) {
    const gs = this.gs, P = this.pilot;
    if (!P.on) return;
    this.look(dt);
    // ((v4.3) the player is looking around: the camera is theirs, no cut takes it away (what would have been one is
    //  counted and dropped))
    if (this.free) {
      this.nextCut -= dt;
      this.dropStale();
      if (this.nextCut <= 0 && this.events.length && Settings.data.observeEvents !== false) { this.blocked++; this.events.length = 0; }
      return;
    }
    if (this.cut) {
      if (P.t >= this.cut.until) { this.cut = null; gs.camFocus = null; }
      return;
    }
    this.nextCut -= dt;
    this.dropStale();
    if (Settings.data.observeEvents === false || this.nextCut > 0 || !this.events.length) return;
    const ui = gs.ui;
    if (ui && (ui.panelOpen || ui.buildOpen || ui.v4PanelOpen || ui.v42PanelOpen)) return;
    // ((v4.3 review F5) a rank ceremony has the camera: no cut over it)
    if (gs.v4 && gs.v4.rank && gs.v4.rank.ceremonyOn) return;
    const p = gs.player, far = Number(PB().cutRange) || 2500;
    const e = this.events.find((q) => gdist(p.x, p.y, q.x, q.y) < far && (q.what !== 'cut_train' || gdist(p.x, p.y, q.x, q.y) > 900));
    if (!e) return;
    const hold = this.range(PB().cutHold, 6, 8);
    gs.focusCamera(e.x, e.y, hold * 1000);
    this.cut = { what: e.what, x: e.x, y: e.y, until: P.t + hold };
    this.cuts++;
    this.events.length = 0;
    this.nextCut = Math.max(20, this.range(PB().cutEvery, 45, 90));
  }

  destroy() {
    const gs = this.gs;
    if (this.free) { this.free = null; gs.camPan = null; }
    gs.events.off('v4:train', this.onTrain);
    gs.events.off('courier:deposit', this.onDeposit);
    gs.events.off('office:letter', this.onLetter);
    gs.events.off('built', this.onBuilt);
  }
}
