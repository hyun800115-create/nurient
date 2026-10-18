// (v4.2, docs/v42_plan.md §4.3 F4 / F5, §2 offers) the upgrades the overflow fixes offer, each as a pay pad that
// appears only when the measured need is there (village complete first; the first 20 minutes never change):
//   짐꾼 2        a second goods porter for a line whose output has been ≥ porter2.fullAt full for fullForS s in
//                 total (and the 창고 exists): pad on the line's porter spot                       (v42.p2)
//   가공소 2단     the station makes one item in station2.timeMult of the time (×1.5) once the line has its
//                 3rd gatherer (the miners: their 2nd): pad beside the station, ×1.5 badge after   (v42.up)
//   역 짐꾼 3 / 4  more station porters once the 서리 물류창고 stands                              (Growth porters)
//   화물칸 크게    the freight cars take freight.big instead of perTrain once surplus waited
//                 ≥ bigOfferWait for bigOfferS s                                                  (v42.train.big)
//   썰매 한 대 더  a second cargo sleigh once the 물류창고 stands and a sleigh load (depot.sleigh.cap) of surplus has
//                 waited at the dock for sleigh2S s in total while the racks had room             (v42.depot.sleighs)
//   테이블 늘리기 (v4.2 touch) the big restaurant's line has waited for a free seat for civic.restaurant.tables.offerS s
//                 in total (BigRestaurant.busyT): two more tables in the back yard, 2 levels; pad where they will
//                 stand (a restaurant pad: not counted in the 3 offers at a time)                (rest.tables)
//   서빙 직원 2   (v4.2 touch) once the back yard has tables and plates waited on the pass (2+) while the server was
//                 out for civic.restaurant.server2.offerS s in total: pad on the restaurant's staff spot  (rest.server2)
// (v4.2 touch) 짐꾼 2 for every line with a goods porter of its own: also the 대장간 (tools), the 통조림 공장 (cans) and the
// 배 창고 (the boats' catch). The full time counts only while the line's porter is not standing at the pad with goods
// nobody wants (then the goods have nowhere to go and a second porter would not help).
// Every pad keeps the v4.1 pad rules (step-off, pay while standing); one banner per offer, once per save.

import { BALANCE } from '../data/balance.js';
import { WORLD, L4 } from '../data/world.js';
import { UnlockPad } from '../entities/UnlockPad.js';
import { Porter } from '../entities/Worker.js';
import { Assets } from '../core/Assets.js';
import { t } from '../data/strings.js';
import { LINES } from './StockLedger.js';

const V = () => BALANCE.v42 || {};
const WORKER = { grill: 'fisherman', sawmill: 'lumberjack', bakery: 'farmer', smelter: 'miner', smokehouse: 'hunter' };
const PILE = { grill: 'fish', sawmill: 'log', bakery: 'wheat', smelter: 'ore', smokehouse: 'meat' };
const MAX_OFFERS = 3;
const MAX_P2 = 2;            // ((v4.2 touch) 짐꾼 2 pads at a time, besides the MAX_OFFERS other line offers
// ((v4.2 touch) the lines a 짐꾼 2 can join, and what the pad calls the goods of the three without a LINES row)
const P2_LINES = ['grill', 'sawmill', 'bakery', 'smelter', 'smokehouse', 'toolsmith', 'cannery', 'dock'];
const P2_ITEM = { toolsmith: 'cat_tools', cannery: 'item_can', dock: 'item_fish_raw' };
const REST_KINDS = new Set(['tables', 'srv2']);
const RT = () => (BALANCE.civic && BALANCE.civic.restaurant && BALANCE.civic.restaurant.tables) || {};

export class LineUpgrades {
  constructor(gs, v42, saved) {
    this.gs = gs;
    this.v42 = v42;
    const s = saved || {};
    this.up = {};
    for (const k in s.up || {}) if (WORKER[k] && s.up[k]) this.up[k] = 1;
    this.p2 = Array.isArray(s.p2) ? s.p2.filter((k, i, a) => P2_LINES.indexOf(k) >= 0 && a.indexOf(k) === i).slice(0, P2_LINES.length) : [];
    this.fullT = {};
    for (const k in (s.full && typeof s.full === 'object') ? s.full : {}) if (P2_LINES.indexOf(k) >= 0) this.fullT[k] = Math.max(0, Number(s.full[k]) || 0);
    this.waitT = {};         // line -> seconds its porter has stood at the pad with goods nobody wants
    this.offeredT = {};      // line -> seconds its 가공소 2단 pad has been offered (Surplus: raw only after F5 had a chance)
    this.pads = {};          // offer id -> UnlockPad
    this.badges = {};
    this.porters2 = [];
    this.t = 0;
    this.paid = Object.assign({}, (s.offerPaid && typeof s.offerPaid === 'object') ? s.offerPaid : {});
    this.sleighWaitT = Math.max(0, Number(s.sleighWait) || 0);
  }

  /** after the v3 sites / porters are back (V42.afterRestore) */
  afterRestore() {
    for (const id of this.p2) this.hireP2(id, true);
    for (const id in this.up) this.badge(id);
  }

  // ------------------------------------------------------------------ rules
  timeMult(stationId) { return this.up[stationId] ? Math.max(0.2, Number(V().station2 && V().station2.timeMult) || 0.66) : 1; }
  lineOfPile(pile) { const gs = this.gs; for (const id in PILE) if (gs.piles && gs.piles[PILE[id]] === pile) return id; return null; }
  /** the line's 가공소 2단 was bought, or has been offered for 3 minutes */
  f5Chance(line) { return !!this.up[line] || (this.offeredT[line] || 0) >= 180 || !this.f5Due(line, true); }
  gatherers3(line) {
    const pr = this.gs.progress, w = WORKER[line];
    if (!pr || !w) return false;
    return w === 'miner' ? pr.isDone('hire2_miner') : pr.isDone('hire3_' + w);
  }
  /** (F5) the line can have its 가공소 2단 (ignoreBought: the line qualifies whether or not it was bought) */
  f5Due(line, ignoreBought) { return this.v42.complete && (ignoreBought || !this.up[line]) && !!this.gs.stations[line] && this.gatherers3(line); }
  /** ((v4.2 touch) the line's goods source: a station, a workshop (toolsmith / cannery) or the boathouse (dock)) */
  src(line) { const gs = this.gs; return gs.sourceById ? gs.sourceById(line) : gs.stations[line] || null; }
  hasPorter(line) { const st = this.src(line); return !!st && (this.gs.porters || []).some((p) => p.station === st && p.role === 'porter'); }
  /** ((v4.2 touch) a porter of the line stands at its pad with a load nobody wants (seconds, updated each step) */
  porterWaits(line, st, step) {
    const w = (this.gs.porters || []).some((p) => p.station === st && p.role === 'porter' && p.state === 'load' && p.stack && p.stack.count >= Math.min(4, p.stack.max));
    this.waitT[line] = w ? (this.waitT[line] || 0) + step : 0;
    return this.waitT[line] > 4;
  }
  /** (F4) the line's output has been full long enough, it has its porter, and the 창고 stands */
  f4Due(line) {
    const P2 = V().porter2 || {};
    return this.v42.complete && this.p2.indexOf(line) < 0 && !!this.gs.warehouse && !!this.src(line) && this.hasPorter(line) && (this.fullT[line] || 0) >= (Number(P2.fullForS) || 45);
  }
  depotBuilt() { const d = this.v42.depot; return !!(d && d.built); }
  stationPorters() { const G = this.gs.v4 && this.gs.v4.growth; return G && G.porters ? G.porters.length : 0; }

  /** the offers due now: [{ id, kind, line?, cost, x, y, label, icon }] */
  offers() {
    const gs = this.gs, out = [];
    if (!this.v42.complete) return out;
    const P2 = V().porter2 || {}, S2 = V().station2 || {};
    // ((v4.2 touch) 테이블 늘리기 first: it stands at the restaurant, apart from the 3 line offers at a time)
    const R = gs.civic && gs.civic.restaurant;
    if (R && R.enabled && R.setTables && R.tableLevel < R.maxTableLevel) {
      const id = 'tables' + (R.tableLevel + 1), TB = RT();
      if (R.busyT >= (Number(TB.offerS) || 60) || this.paid[id] > 0 || this.pads[id]) {
        const p = R.tablesPadPos();
        out.push({ id, kind: 'tables', cost: Number((TB.costs || [])[R.tableLevel]) || 1500, x: p.x, y: p.y, label: 'tables_pad', icon: Assets.pick('ui_icon_upgrade', 'ui_icon_lock_open', 'ui_icon_lock') });
      }
    }
    // ((v4.2 touch) 서빙 직원 2: the back yard has tables and plates waited on the pass while the server was out)
    const S2R = (BALANCE.civic && BALANCE.civic.restaurant && BALANCE.civic.restaurant.server2) || {};
    if (R && R.enabled && R.server && !R.server2 && R.tableLevel >= 1 && (R.serveWaitT >= (Number(S2R.offerS) || 60) || this.paid.srv2 > 0 || this.pads.srv2)) {
      out.push({ id: 'srv2', kind: 'srv2', cost: Number(S2R.cost) || 1000, x: R.staffSpot.x, y: R.staffSpot.y, label: 'rest_server2', icon: Assets.pick('ui_icon_porter', 'ui_icon_worker') });
    }
    for (const line of P2_LINES) {
      const st = this.src(line);
      if (!st) continue;
      if (this.f4Due(line)) {
        const h = Porter.homeFor(gs, st);
        out.push({ id: 'p2_' + line, kind: 'p2', line, cost: Number(P2.costs && P2.costs[line]) || 600, x: h[0] + 34, y: h[1] + 30, label: 'p2_pad', icon: Assets.pick('ui_icon_porter', 'ui_icon_backpack') });
      }
      if (WORKER[line] && this.f5Due(line)) {
        out.push({ id: 'st2_' + line, kind: 'st2', line, cost: Number(S2.costs && S2.costs[line]) || 1000, x: st.x + (st.cfg.in[0] < 0 ? -1 : 1) * 30, y: st.y + 118, label: 'st2_pad', icon: Assets.pick('ui_icon_upgrade', 'ui_icon_lock_open', 'ui_icon_lock') });
      }
    }
    const G = gs.v4 && gs.v4.growth, Q = WORLD.v4.square;
    const F = this.v42.freight;
    if (G && G.active) {
      const n = this.stationPorters(), c34 = V().stationPorter34 || [1000, 1500];
      if (this.depotBuilt() && n >= 2 && n < 4) out.push({ id: 'sp' + (n + 1), kind: 'sp34', cost: Number(c34[n - 2]) || 1000, x: Q.porter.x, y: Q.porter.y, label: 'sp34_pad', n: n + 1, icon: Assets.pick('ui_icon_porter', 'ui_icon_backpack') });
      const FB = V().freight || {};
      if (F && !F.big && F.stats.waitT >= (Number(FB.bigOfferS) || 120)) out.push({ id: 'bigcar', kind: 'big', cost: Number(FB.bigCost) || 2000, x: G.dock.x + 96, y: G.dock.y + 84, label: 'bigCar_pad', icon: Assets.pick('ui_icon_delivery', 'ui_icon_backpack') });
      const Dp = this.v42.depot, SL = (V().depot && V().depot.sleigh) || {};
      if (Dp && Dp.built && Dp.sleighN < 2 && this.sleighWaitT >= (Number(SL.offerS) || 120)) {
        const st = (WORLD.v42.depot && WORLD.v42.depot.sleighStop) || [5, -5];
        const [sx, sy] = L4(st[0] - 1.2, st[1] - 1.1);
        out.push({ id: 'sleigh2', kind: 'sleigh2', cost: Number(SL.secondCost) || 2500, x: sx, y: sy, label: 'sleigh2_pad', icon: Assets.pick('ui_icon_delivery', 'ui_icon_backpack') });
      }
    }
    return out;
  }

  update(dt) {
    const gs = this.gs;
    for (const id in this.pads) this.pads[id].update(dt);
    this.t += dt;
    if (this.t < 1) return;
    const step = this.t;
    this.t = 0;
    const P2 = V().porter2 || {};
    for (const line of P2_LINES) {
      const st = this.src(line);
      if (!st || !st.outStack) continue;
      // ((v4.2 touch) not while its porter stands at the pad with goods nobody wants: no 짐꾼 2 would help then)
      const stuck = this.porterWaits(line, st, step);
      if (!stuck && st.outStack.count >= st.outStack.max * (Number(P2.fullAt) || 0.8) && this.v42.complete) this.fullT[line] = (this.fullT[line] || 0) + step;
      if (WORKER[line] && this.f5Due(line)) this.offeredT[line] = (this.offeredT[line] || 0) + step;
    }
    // (썰매 한 대 더) a sleigh load of surplus waits at the dock while the racks have room
    const Dp = this.v42.depot, F = this.v42.freight, SL = (V().depot && V().depot.sleigh) || {};
    if (Dp && Dp.built && Dp.sleighN < 2 && F) {
      if (F.dockCount() >= (Number(SL.cap) || 60) && Dp.room() > 0) this.sleighWaitT += step; else this.sleighWaitT = Math.max(0, this.sleighWaitT - step * 0.5);
    }
    // pads: show the due offers (a few at a time), drop the ones no longer due (unless being paid)
    const due = this.offers();
    const ids = new Set(due.map((o) => o.id));
    for (const id in this.pads) {
      const p = this.pads[id];
      if (!ids.has(id) && !(p.paid > 0)) { this.paid[id] = p.paid; p.vanish(); delete this.pads[id]; }
    }
    // (a v4.1 save: the "새로워진 것" card first, the offers and their banners after it)
    if (this.v42.fromOld && !(this.v42.seen && this.v42.seen.whatsNew)) return;
    // ((v4.2 touch) the restaurant's pads stand apart, and the 짐꾼 2 pads have their own MAX_P2 slots: they used to wait
    //  behind three unbought 가공소 2단 pads for the whole game — the designer's "짐이 밀려요")
    const kindOf = (id) => (this.pads[id].offer && this.pads[id].offer.kind) || '';
    let n = Object.keys(this.pads).filter((id) => !REST_KINDS.has(kindOf(id)) && kindOf(id) !== 'p2').length;
    let n2 = Object.keys(this.pads).filter((id) => kindOf(id) === 'p2').length;
    for (const o of due) {
      if (this.pads[o.id]) continue;
      if (REST_KINDS.has(o.kind)) { this.makePad(o); continue; }
      if (o.kind === 'p2') { if (n2 < MAX_P2) { this.makePad(o); n2++; } continue; }
      if (n >= MAX_OFFERS) continue;
      this.makePad(o);
      n++;
    }
  }

  makePad(o) {
    const gs = this.gs;
    const item = o.line ? (P2_ITEM[o.line] || (LINES.find((q) => q.id === o.line) || {}).product) : null;
    const lab = o.kind === 'p2' ? () => t('p2_pad', { item: t(item) }) : o.kind === 'st2' ? () => t('st2_pad', { st: t('line_' + o.line) }) : o.kind === 'sp34' ? () => t('sp34_pad', { n: o.n }) : o.kind === 'sleigh2' ? () => t('sleigh2_pad') : o.kind === 'tables' ? () => t('tables_pad') : o.kind === 'srv2' ? () => t('rest_server2') : () => t('bigCar_pad');
    const pad = new UnlockPad(gs, o.id, o.x, o.y, {
      kind: o.kind === 'st2' || o.kind === 'big' || o.kind === 'sleigh2' || o.kind === 'tables' ? 'upgrade' : 'hire', cost: o.cost, paid: this.paid[o.id] || 0, labelFn: lab, icon: o.icon, iconSize: 48,
      padTex: o.kind === 'p2' || o.kind === 'sp34' ? Assets.pick('ui_pad_porter', 'ui_pad_hire') : o.kind === 'srv2' ? Assets.pick('ui_pad_clerk', 'ui_pad_hire') : undefined,
      onComplete: (p) => this.done(o, p),
    });
    if (gs.player && pad.pad.contains(gs.player.x, gs.player.y)) pad.needsLeave = true;
    if (gs.popIn) gs.popIn(pad);
    this.pads[o.id] = pad;
    pad.offer = o;
    // one banner per offer, once per save
    const sk = { p2: 'p2', st2: 'up', sp34: 'p34', big: 'big', sleigh2: 'big', tables: 'tb', srv2: 'tb' }[o.kind] || 'p2', seen = this.v42.seen[sk] || (this.v42.seen[sk] = {});
    if (!seen[o.line || o.id]) {
      seen[o.line || o.id] = 1;
      if (o.kind === 'p2') gs.ui.banner(t('p2Banner', { item: t(item) }), t('p2Sub', { item: t(item) }));
      else if (o.kind === 'st2') gs.ui.banner(t('st2Banner', { st: t('line_' + o.line) }), t('st2Sub'));
      else if (o.kind === 'big') gs.ui.banner(t('bigCar_pad'), t('dockSurplus', { n: this.v42.freight ? this.v42.freight.dockCount() : 0 }));
      else if (o.kind === 'sleigh2') gs.ui.banner(t('sleigh2_pad'), t('dockSurplus', { n: this.v42.freight ? this.v42.freight.dockCount() : 0 }));
      else if (o.kind === 'tables') gs.ui.banner(t('tablesBanner'), t('tablesSub'));
      else if (o.kind === 'srv2') gs.ui.banner(t('srv2Banner'), t('srv2Sub'));
    }
  }

  done(o, pad) {
    const gs = this.gs;
    delete this.pads[o.id];
    delete this.paid[o.id];
    pad.vanish();
    if (o.kind === 'p2') { if (this.p2.indexOf(o.line) < 0) this.p2.push(o.line); this.hireP2(o.line, false); }
    else if (o.kind === 'st2') { this.up[o.line] = 1; this.badge(o.line, true); const st = gs.stations[o.line]; if (st && st.op && st.op.operator && st.op.operator.syncSpeed) st.op.operator.syncSpeed(); }
    else if (o.kind === 'sp34') { const G = gs.v4 && gs.v4.growth; if (G) { G.hireStationPorter(false); G.porterN = Math.max(G.porterN, G.porters.length); } }
    else if (o.kind === 'big') { const F = this.v42.freight; if (F) { F.big = 1; gs.ui.banner(t('bigCarDone', { n: F.cap() }), ''); } }
    else if (o.kind === 'sleigh2') { const Dp = this.v42.depot; if (Dp) { Dp.sleighN = 2; Dp.addSleighs(); this.sleighWaitT = 0; gs.ui.banner(t('sleigh2Done'), ''); } }
    else if (o.kind === 'tables') {
      // ((v4.2 touch) the next two tables in the back yard; the line's waiting time starts again for the next level)
      const R = gs.civic && gs.civic.restaurant;
      if (R) { R.setTables(R.tableLevel + 1, false); R.busyT = 0; const N = this.v42.news; if (N && N.today) N.today.tables = R.seats.length; }
    } else if (o.kind === 'srv2') { const R = gs.civic && gs.civic.restaurant; if (R) { R.hire('server2', false); R.serveWaitT = 0; } }
    gs.save(true);
  }

  /** the line's second goods porter (a little apart from the first) */
  hireP2(line, instant) {
    const gs = this.gs;
    if (this.porters2.some((p) => p.station && p.station.id === line)) return;
    const pr = gs.hirePorter(line, instant);
    if (!pr) return;
    const h = { x: pr.home[0] + 40, y: pr.home[1] + 22 };
    gs.collision.resolve(h, 14);                // ((v4.2 touch) a workshop's / the boathouse's spot may be close to its wall)
    pr.home = [h.x, h.y];
    if (instant) { pr.x = pr.home[0]; pr.y = pr.home[1]; }
    pr.p2 = true;
    this.porters2.push(pr);
  }

  /** the ×1.5 badge on a 2단 station */
  badge(line, pop) {
    const gs = this.gs, st = gs.stations[line];
    if (!st || this.badges[line]) return;
    const b = gs.add.text(st.x + 70, st.y - 150, t('st2Badge'), { fontFamily: gs.font, fontSize: '26px', fontStyle: '900', color: '#ffd84a', stroke: '#7a4a12', strokeThickness: 6, resolution: 2 }).setOrigin(0.5).setDepth(st.y + 3);
    this.badges[line] = b;
    if (pop) { b.setScale(0.1); gs.tweens.add({ targets: b, scale: 1, duration: 420, ease: 'Back.easeOut' }); }
  }

  serializeInto(o) {
    o.up = Object.assign({}, this.up);
    o.p2 = this.p2.slice();
    const paid = {};
    for (const id in this.pads) if (this.pads[id].paid > 0) paid[id] = this.pads[id].paid;
    for (const id in this.paid) if (this.paid[id] > 0 && !(id in paid)) paid[id] = this.paid[id];
    if (Object.keys(paid).length) o.offerPaid = paid;
    o.full = {};
    for (const k in this.fullT) o.full[k] = Math.round(Math.min(3600, this.fullT[k]));
    if (this.sleighWaitT > 0) o.sleighWait = Math.round(Math.min(3600, this.sleighWaitT));
  }

  state() {
    return { up: Object.assign({}, this.up), p2: this.p2.slice(), fullT: Object.assign({}, this.fullT), offeredT: Object.assign({}, this.offeredT), sleighWaitT: +this.sleighWaitT.toFixed(1), pads: Object.keys(this.pads), due: this.offers().map((o) => o.id) };
  }

  hooks(H) {
    H.lines = (o) => {
      if (o && o.full) for (const k in o.full) this.fullT[k] = o.full[k];
      if (o && o.up) for (const k in o.up) { this.up[k] = 1; this.badge(k); }
      if (o && o.p2) for (const k of o.p2) { if (this.p2.indexOf(k) < 0) this.p2.push(k); this.hireP2(k, true); }
      if (o && Number.isFinite(o.sleighWait)) this.sleighWaitT = o.sleighWait;
      return this.state();
    };
  }

  destroy() { for (const id in this.pads) this.pads[id].destroy(); this.pads = {}; for (const k in this.badges) this.badges[k].destroy(); }
}
