// 항구 사람들 (harbor_runtime view): the ferry's tourists as the model has them (down the gangway, along the quay
// lane, at the market stalls and the restaurant terrace, on the station platform, queueing at the gate, up the
// gangway), the auction (auctioneer at the lectern with the bell, buyers waving, the call in a bubble), the trawler
// crews carrying the catch to the auction hall, shipwrights at the slip, a sailor on the lodge bench.
// Paper dolls through ports.dolls (≤ budget.people rigs, nearest first). Walks follow the harbour's lanes
// (quay lane j -8.4, sidewalk j -3.6, the crossing at i 65.5 to the platform) instead of cutting through houses.

import { BLD, SPOTS, LR, WALK } from '../layout.js';
import { SPOTS as TSPOTS } from '../model/tourists.js';
import { sdef, dirOf } from './art.js';
import { ht } from '../strings.js';

const LANE = { q: -8.4, s: -3.6, t: 1.25 };
const ORDER = ['q', 's', 't'];
const XING_I = 65.5;
const zone = (p) => (p[1] < -6.2 ? 'q' : p[1] < 0.2 ? 's' : 't');

/** lattice waypoints from a to b along the lanes */
export function route(a, b) {
  const za = zone(a), zb = zone(b), pts = [a];
  if (za === zb) { if (za === 'q' && Math.abs(a[0] - b[0]) > 0.6) pts.push([a[0], LANE.q], [b[0], LANE.q]); pts.push(b); return pts; }
  pts.push([a[0], LANE[za]]);
  let k = ORDER.indexOf(za); const kb = ORDER.indexOf(zb); let i = a[0];
  while (k !== kb) {
    const nx = ORDER[k + Math.sign(kb - k)];
    const xi = ORDER[k] === 't' || nx === 't' ? XING_I : (nx === zb ? b[0] : i);
    pts.push([xi, LANE[ORDER[k]]], [xi, LANE[nx]]);
    i = xi; k = ORDER.indexOf(nx);
  }
  pts.push([b[0], LANE[zb]], b);
  return pts;
}
/** px polyline + cumulative lengths */
function poly(pts) {
  const px = pts.map((p) => LR(p[0], p[1])), cum = [0];
  for (let k = 1; k < px.length; k++) cum.push(cum[k - 1] + Math.hypot(px[k][0] - px[k - 1][0], (px[k][1] - px[k - 1][1]) * 2));
  return { px, cum, len: cum[cum.length - 1] };
}
/** point at fraction u of a polyline -> [x, y, dx, dy] */
function along(P, u) {
  const d = Math.max(0, Math.min(1, u)) * P.len;
  let k = 1;
  while (k < P.cum.length - 1 && P.cum[k] < d) k++;
  const a = P.px[k - 1], b = P.px[k] || a, seg = (P.cum[k] - P.cum[k - 1]) || 1, f = Math.max(0, Math.min(1, (d - P.cum[k - 1]) / seg));
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, b[0] - a[0], b[1] - a[1]];
}

export class People {
  constructor(view) {
    this.v = view;
    this.rigs = new Map();         // who -> rig
    this.paths = new Map();        // tourist id + leg -> poly
    this.used = new Set();
    this.auctionT = -99;           // the last bell
    this.carry = [];               // trawler crew carrying boxes: { who, t, P }
    this.lastCoins = [];
  }

  /** a rig for `who` this frame (pooled by the view); null over budget */
  rig(who, look) {
    this.used.add(who);
    let r = this.rigs.get(who);
    if (r) return r;
    if (this.rigs.size >= this.v.budgetPeople()) return null;
    r = this.v.takeRig({ who, look });
    if (r) this.rigs.set(who, r);
    return r;
  }
  show(who, look, x, y, anim, dir, depth) {
    const r = this.rig(who, look);
    if (!r) return null;
    r.play(anim, dir);
    r.place(x, y, depth === undefined ? y : depth);
    return r;
  }

  update(dt) {
    const v = this.v;
    this.used.clear();
    if (v.dollsOn() && v.model.open) {
      this.tourists();
      this.auction();
      this.crews(dt);
    }
    for (const [who, r] of this.rigs) if (!this.used.has(who)) { v.dropRig(r); this.rigs.delete(who); }
  }

  // ------------------------------------------------------------------------------------------ tourists
  tourists() {
    const v = this.v, m = v.model, T = v.T;
    const here = [];
    for (const t of m.tourists.list) {
      if (t.state === 'away' || t.state === 'returning') continue;
      const p = this.posOf(t, T);
      if (!p) continue;
      if (!v.near(p[0], p[1], 80)) continue;
      here.push([t, p]);
    }
    // nearest first (the budget)
    const r = v.rect(), cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    here.sort((a, b) => Math.hypot(a[1][0] - cx, a[1][1] - cy) - Math.hypot(b[1][0] - cx, b[1][1] - cy));
    for (const [t, p] of here.slice(0, 14)) this.show(t.id, { preset: 'tourist', seed: t.look }, p[0], p[1], p[2], p[3]);
  }

  /** where a tourist is at T: [x, y, anim, dir] or null (aboard / away) */
  posOf(t, T) {
    if (t.state === 'off') {
      // down the gangway from the ferry's side to the terminal gate, then to the door (2.6 s)
      const left = t.until - T;
      if (left > 2.6) return null;
      const P = this.path('gw', [WALK.gangway[2], WALK.gangway[1], WALK.gangway[0], TSPOTS.door]);
      const [x, y, dx, dy] = along(P, 1 - left / 2.6);
      return [x, y, 'walk', dirOf(dx, dy)];
    }
    if (t.state === 'board') {
      const u = (T - (t.t0 || T)) / 4;
      if (u >= 1) return null;
      const P = this.path('bd' + t.id, [t.from || TSPOTS.wait[0], WALK.gangway[0], WALK.gangway[1], WALK.gangway[2]]);
      const [x, y, dx, dy] = along(P, u);
      return [x, y, 'walk', dirOf(dx, dy)];
    }
    if (!t.from || !t.spot) return null;
    const walk = Math.max(0.5, t.walk || 1);
    const u = (T - (t.t0 || 0)) / walk;
    if (u < 1) {
      const key = t.id + ':' + t.from[0] + ',' + t.from[1] + '>' + t.spot[0] + ',' + t.spot[1];
      const P = this.path(key, route(t.from, t.spot));
      const [x, y, dx, dy] = along(P, u);
      return [x, y, 'walk', dirOf(dx, dy)];
    }
    const [x, y] = LR(t.spot[0], t.spot[1]);
    // standing: shoppers face the stall / the terrace, the platform crowd faces the rails, the queue the gate
    const st = t.state;
    const dir = st === 'shop' ? 'NE' : st === 'station' ? 'NE' : st === 'wait' ? 'SE' : ['S', 'SW', 'SE'][(t.look >>> 3) % 3];
    const anim = st === 'stroll' && ((t.look >>> 5) % 3 === 0) ? 'talk' : 'idle';
    return [x, y, anim === 'talk' && dir === 'NE' ? 'idle' : anim, dir];
  }

  path(key, pts) {
    let P = this.paths.get(key);
    if (!P) { P = poly(pts); this.paths.set(key, P); if (this.paths.size > 400) this.paths.delete(this.paths.keys().next().value); }
    return P;
  }

  // ------------------------------------------------------------------------------------------ the auction
  auction() {
    const v = this.v, m = v.model;
    if (!m.has('auction')) return;
    const b = BLD.h_fish_auction, d = sdef('fish_auction');
    if (!d || !v.near(b.x, b.y, 300)) return;
    const T = v.T, ringing = T - this.auctionT < 3.5;
    const sp = d.staffPoints || [], bp = d.buyerPoints || d.customerPoints || [];
    // the auctioneer at the lectern; two helpers among the boxes
    const a0 = sp[0];
    if (a0) this.show('auc:0', { preset: 'auctioneer', seed: 77 }, b.x + a0[0], b.y + a0[1], ringing ? 'talk' : 'idle', 'S', b.y + 1);
    for (let k = 1; k < Math.min(3, sp.length); k++) this.show('auc:' + k, { preset: 'dock_worker', seed: 300 + k }, b.x + sp[k][0], b.y + sp[k][1], 'idle', k === 1 ? 'SW' : 'S', b.y + 1);
    // buyers: more of them around the big auction
    const nb = ringing ? 5 : 3;
    for (let k = 0; k < Math.min(nb, bp.length); k++) {
      const wave = ringing && (k + Math.floor(T * 2)) % 3 !== 0;
      this.show('buy:' + k, { preset: k % 2 ? 'sailor' : 'tourist', seed: 510 + k * 17 }, b.x + bp[k][0], b.y + bp[k][1], wave ? 'wave' : 'idle', wave ? 'SE' : 'NE', b.y + 1 + k * 0.01);
    }
  }

  /** a bell: the auctioneer's call, buyers wave, coins rise */
  bell(ev) {
    const v = this.v, b = BLD.h_fish_auction, d = sdef('fish_auction');
    this.auctionT = v.T;
    const bp = d && d.fxPoints && d.fxPoints.bell ? d.fxPoints.bell : [-127, -87];
    v.sound('sfx_auction_bell', b.x + bp[0], b.y + bp[1], { volume: 0.8 });
    if (!v.near(b.x, b.y, 200)) return;
    const n = ev.boxes ? ev.boxes * 10 : 0;
    const text = n ? ht(v.lang(), 'auctionCall', { n }) : ht(v.lang(), 'auctionCall2');
    const a0 = (d && d.staffPoints && d.staffPoints[0]) || [-131, -45];
    v.say(b.x + a0[0], b.y + a0[1] - 92, text, 2.8);
    if (ev.coins > 0) v.float(b.x + 40, b.y - 150, ht(v.lang(), 'auctionSold', { coins: ev.coins.toLocaleString() }));
  }

  // ------------------------------------------------------------------------------------------ crews
  crews(dt) {
    const v = this.v, m = v.model, T = v.T;
    // trawler crews: each 'box' event sends a sailor from the west quay to the auction hall's catch pile
    for (const c of this.carry) c.t += dt;
    this.carry = this.carry.filter((c) => c.t < c.dur);
    for (const c of this.carry) {
      const u = c.t / c.dur, back = u > 0.5, P = c.P;
      const [x, y, dx, dy] = along(P, back ? (1 - u) * 2 : u * 2);
      if (!v.near(x, y, 80)) continue;
      this.show(c.who, { preset: 'sailor', seed: c.seed }, x, y, back ? 'walk' : 'carry_walk', dirOf(back ? -dx : dx, back ? -dy : dy));
    }
    // shipwrights while a trawler is on the slip
    if (m.has('shipyard') && m.fleet.building > 0) {
      const b = BLD.h_shipyard, d = sdef('shipyard');
      if (d && v.near(b.x, b.y, 200)) (d.workPoints || []).slice(0, 2).forEach((p, k) => this.show('yard:' + k, { preset: 'sailor', seed: 700 + k }, b.x + p[0], b.y + p[1], (Math.floor(T * 0.8) + k) % 3 ? 'idle' : 'talk', (d.workDirs || [])[k] === 'SE' ? 'SE' : 'SW', b.y + 1));
    }
    // a sailor on the lodge bench (sit), the harbour master at his door
    if (m.has('station')) {
      const L = BLD.h2_sailor_lodge, d = sdef('sailor_lodge');
      if (d && d.seatPoints && v.near(L.x, L.y, 200)) this.show('lodge:0', { preset: 'sailor', seed: 4242 }, L.x + d.seatPoints[1][0], L.y + d.seatPoints[1][1], 'sit', 'SE', L.y + 1);
      const O = BLD.h2_harbor_office, od = sdef('harbor_office');
      if (od && od.staffPoints && v.near(O.x, O.y, 200)) this.show('office:0', { preset: 'sailor', seed: 99 }, O.x + od.staffPoints[0][0], O.y + od.staffPoints[0][1], 'idle', 'SW', O.y + 1);
    }
  }

  box(ev) {
    const n = this.carry.length;
    if (n >= 3) return;
    const P = this.path('box', route([SPOTS.fishQuay.i, SPOTS.fishQuay.j], [SPOTS.catchPile.i, SPOTS.catchPile.j]));
    this.carry.push({ who: 'crew:' + (this.boxN = ((this.boxN || 0) + 1) % 3), seed: 900 + (this.boxN || 0), t: 0, dur: 2 * P.len / 70, P });
  }

  /** P7: a tourist on the restaurant terrace (or the nearest one) — the gull's target */
  victim() {
    const v = this.v, m = v.model;
    let best = null;
    for (const t of m.tourists.list) if (t.state === 'shop' && t.shop === 'restaurant' && v.T - (t.t0 || 0) > (t.walk || 0)) { best = t; break; }
    if (!best) for (const t of m.tourists.list) if (t.state === 'stroll' && v.T - (t.t0 || 0) > (t.walk || 0)) { best = t; break; }
    if (!best) return null;
    const [x, y] = LR(best.spot[0], best.spot[1]);
    return { t: best, x, y };
  }

  destroy() { for (const r of this.rigs.values()) this.v.dropRig(r); this.rigs.clear(); }
}
