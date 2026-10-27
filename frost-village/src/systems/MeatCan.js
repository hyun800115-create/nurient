// (v4.2.1 고기 통조림, docs/build_reports/v421_l0.md §10, the designer's "육고기 통조림도 만들어줘 육고기가 너무 많이
// 남네") a v4.2 system (gs.v42.meatcan): the cannery learns a second recipe, raw meat 3 + ingot 1 → meat cans 3.
//   offer   after village complete, with the 통조림 공장 + its 기술자 (op_cannery) and the meat rack ≥ meatcan.offerFullAt
//           full for meatcan.offerFullS s in total (1 Hz, not saved): progress.seen.mcanOffer (offered once, kept) →
//           a pad '고기 통조림 기계' beside the cannery's input (LineUpgrades, kind 'mcan': apart from the 3 line offers)
//   buy     progress.flags.meatCan; the cannery takes raw meat (Workshop.meatOn) and works meatcan.timeMult faster;
//           two porters come: 고기 짐꾼 (통조림) — the rack's surplus to the cannery (Worker.MeatCanPorter) — and
//           고기 통조림 짐꾼 — a goods porter bound to the meat cans (Porter.only); the 잡화점 sells them (its 7th tower,
//           guests every meatcan.storeGuestK × its spawn time), a standing card '고기 통조림 30' (Growth), exports
//   save    nothing new: progress.flags.meatCan, progress.seen.mcanOffer, v42.seen.up.mcan (banner), v42.offerPaid.mcan;
//           the porters are made again by afterRestore (a load in a bag goes back to the rack: Game.serialize)
// Nothing exists before village complete: the first 20 minutes never change.

import { BALANCE } from '../data/balance.js';
import { Assets } from '../core/Assets.js';
import { t } from '../data/strings.js';
import { MeatCanPorter, Porter } from '../entities/Worker.js';

const M = () => BALANCE.meatcan || {};
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

export class MeatCan {
  constructor(gs, v42) {
    this.gs = gs;
    this.v42 = v42;
    this.on = false;
    this.fullT = 0;            // seconds the meat rack has stood ≥ offerFullAt (since this session's start; not saved)
    this.t = 0;
    this.rawPorter = null;     // 고기 짐꾼 (통조림)
    this.goodsPorter = null;   // 고기 통조림 짐꾼
  }

  cannery() { return (this.gs.workshops || []).find((w) => w.kind === 'cannery') || null; }
  pile() { const p = this.gs.piles && this.gs.piles.meat; return p && p.stack ? p : null; }

  /** the line could be offered now: village complete, the cannery with its 기술자, the rack in sight, the art loaded */
  ready() {
    const gs = this.gs, pr = gs.progress, C = this.cannery(), p = this.pile();
    return !!(this.v42.complete && !this.on && C && C.enabled && pr && pr.isDone('op_cannery') && p && p.shown && Assets.has('item_can_meat'));
  }
  offered() { const pr = this.gs.progress; return !!(pr && pr.seen && pr.seen.mcanOffer); }

  update(dt) {
    this.t += dt;
    if (this.t < 1) return;
    const step = this.t;
    this.t = 0;
    if (this.on) { this.ensurePorters(false); return; }
    if (this.offered() || !this.ready()) return;
    const p = this.pile();
    if (p.count >= p.stack.max * num(M().offerFullAt, 0.9)) this.fullT += step;
    if (this.fullT >= num(M().offerFullS, 90)) this.gs.progress.seen.mcanOffer = true;
  }

  /** the pad LineUpgrades shows ({ id, kind, cost, x, y, label, icon }) or null */
  offer() {
    if (this.on || !this.offered() || !this.ready()) return null;
    const p = this.padPos();
    return { id: 'mcan', kind: 'mcan', cost: Math.max(1, Math.floor(num(M().cost, 1500))), x: p.x, y: p.y, label: 'mcan_pad', icon: Assets.pick('item_can_meat', 'ui_icon_upgrade', 'ui_icon_lock') };
  }

  /** beside the cannery's input pad, on open ground (never on another pad or a porter's spot) */
  padPos() {
    const gs = this.gs, C = this.cannery();
    if (this.padAt && this.padAt.c === C) return this.padAt;
    const ip = C.inPad, keep = (gs.padSpots || []).concat([{ x: C.inPad.x, y: C.inPad.y, r: 90 }, { x: C.outPad.x, y: C.outPad.y, r: 90 }]);
    if (C.op && C.op.x !== undefined) keep.push({ x: C.op.x, y: C.op.y, r: 80 });
    const free = (q) => !gs.collision.blocked(q.x, q.y, 30) && (!gs.collision.inWalk || gs.collision.inWalk(q.x, q.y)) && !keep.some((k) => Math.hypot(k.x - q.x, (k.y - q.y) * 2) < (k.r || 70) + 40);
    let best = null;
    for (const [dx, dy] of [[-150, 70], [-170, -40], [-60, 120], [120, 120], [-230, 20], [40, 160]]) {
      const q = { x: ip.x + dx, y: ip.y + dy };
      gs.collision.resolve(q, 30);
      if (free(q)) { best = q; break; }
    }
    if (!best) { best = { x: ip.x - 150, y: ip.y + 70 }; gs.collision.resolve(best, 30); }
    this.padAt = { x: best.x, y: best.y, c: C };
    return this.padAt;
  }

  /** the pad was paid for (LineUpgrades.done saves after it) */
  buy(instant) {
    const gs = this.gs;
    if (this.on) return;
    gs.progress.setFlag('meatCan');
    this.apply(instant);
    if (!instant && gs.ui && gs.ui.banner) gs.ui.banner(t('mcanDone'), t('mcanDoneSub'));
  }

  /** the line is on: the cannery reads it (Workshop.meatOn), the two porters come */
  apply(instant) {
    this.on = true;
    this.ensurePorters(instant);
    // (the 잡화점's shelf takes meat cans now: Game.makeStore's available() reads `on`)
  }

  /** the two porters (again after a reload; later if the cannery was not standing yet) */
  ensurePorters(instant) {
    const gs = this.gs, C = this.cannery(), p = this.pile();
    if (!C || !p) return;
    if (!this.rawPorter) {
      const h = MeatCanPorter.homeFor(gs, p);
      const pr = new MeatCanPorter(gs, p, C, h[0], h[1], gs.rawPorters.length);
      gs.rawPorters.push(pr);
      if (gs.life) gs.life.release(pr.key);
      this.pop(pr, instant);
      this.rawPorter = pr;
    }
    if (!this.goodsPorter) {
      const h0 = Porter.homeFor(gs, C), h = { x: h0[0] + 80, y: h0[1] + 44 };
      gs.collision.resolve(h, 14);
      const pr = new Porter(gs, C, h.x, h.y, gs.porters.length);
      pr.home = [h.x, h.y];
      pr.only = 'item_can_meat';
      gs.porters.push(pr);
      if (gs.life) gs.life.release(pr.key);
      this.pop(pr, instant);
      this.goodsPorter = pr;
    }
  }

  pop(pr, instant) {
    const gs = this.gs;
    if (instant) return;
    gs.effects.sheet('fx_poof', pr.x, pr.y - 30, { size: 180 });
    gs.effects.burst('star', pr.x, pr.y - 40, 12);
    pr.sprite.setScale(0.1);
    gs.tweens.add({ targets: pr.sprite, scale: 1, duration: 450, ease: 'Back.easeOut' });
  }

  /** after the v3 sites (the cannery) are back */
  afterRestore() { const pr = this.gs.progress; if (pr && pr.flags && pr.flags.meatCan) this.apply(true); }

  state() {
    const C = this.cannery(), p = this.pile(), R = this.rawPorter, G = this.goodsPorter;
    const who = (q) => (q ? { state: q.state, carry: q.stack.count, type: q.carriedType ? q.carriedType() : null, dest: q.dest ? q.dest.id : null, x: Math.round(q.x), y: Math.round(q.y), home: q.home } : null);
    return {
      on: this.on, offered: this.offered(), ready: this.ready(), fullT: +this.fullT.toFixed(1), rack: p ? p.count : null, rackMax: p ? p.stack.max : null,
      cannery: C ? { meat: C.inStack.countOf('item_meat_raw'), fishUnits: C.fishUnits(false), ingot: C.inStack.countOf('item_ingot'), out: C.outStack.count, outMeat: C.outStack.countOf('item_can_meat'), made: Object.assign({}, C.madeKinds), last: C.lastKind, timeMult: C.timeMult() } : null,
      rawPorter: who(R), goodsPorter: who(G),
    };
  }

  /** test hooks: H.meatcan({ buy, offer, fullT }) → state() */
  hooks(H) {
    H.meatcan = (o) => {
      if (o && o.offer) this.gs.progress.seen.mcanOffer = true;
      if (o && Number.isFinite(o.fullT)) this.fullT = o.fullT;
      if (o && o.buy) { this.buy(o.buy === 'instant'); this.gs.save(true); }
      return this.state();
    };
  }
}
