// (v4.2, docs/v42_plan.md §7.4) 관망's camera: follows the chief (the game's own follow), keeps the zoom ≥ pilot.minZoom
// (restored on hand-back), and now and then cuts to something worth seeing (볼거리, setting observeEvents): at most one
// cut every cutEvery 45–90 s, cutHold 6–8 s, events within cutRange px of the chief — the train arriving at ours (when
// he is > 900 px away), a ribbon, a move-in, the courier's deposit (the vault), a letter at the mailbox, the sleigh.
// No cut within 20 s of the last, none while a panel is open; the caption names the event.

import { BALANCE } from '../../data/balance.js';
import { Settings } from '../../core/Save.js';
import { gdist } from '../../core/Iso.js';

const PB = () => (BALANCE.v42 && BALANCE.v42.pilot) || {};

export class CameraDirector {
  constructor(gs, pilot) {
    this.gs = gs;
    this.pilot = pilot;
    this.nextCut = 30;
    this.cut = null;          // { what, x, y, until }
    this.cuts = 0;
    this.zoom0 = null;
    this.events = [];
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
    this.nextCut = this.range(PB().cutEvery, 45, 90) * 0.6;
    this.events.length = 0;
  }

  stop() {
    const gs = this.gs;
    if (this.cut) { gs.camFocus = null; this.cut = null; }
    if (this.zoom0 !== null && gs.zoomTarget !== this.zoom0) gs.zoomTarget = this.zoom0;
    this.zoom0 = null;
  }

  range(a, lo, hi) { const r = Array.isArray(a) ? a : [lo, hi]; return r[0] + this.pilot.rand() * Math.max(0, r[1] - r[0]); }

  update(dt) {
    const gs = this.gs, P = this.pilot;
    if (!P.on) return;
    if (this.cut) {
      if (P.t >= this.cut.until) { this.cut = null; gs.camFocus = null; }
      return;
    }
    this.nextCut -= dt;
    // events older than 10 s are stale
    this.events = this.events.filter((e) => P.t - e.t < 10);
    if (Settings.data.observeEvents === false || this.nextCut > 0 || !this.events.length) return;
    const ui = gs.ui;
    if (ui && (ui.panelOpen || ui.buildOpen || ui.v4PanelOpen || ui.v42PanelOpen)) return;
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
    gs.events.off('v4:train', this.onTrain);
    gs.events.off('courier:deposit', this.onDeposit);
    gs.events.off('office:letter', this.onLetter);
    gs.events.off('built', this.onBuilt);
  }
}
