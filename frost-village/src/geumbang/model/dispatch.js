// Dispatch (plan §5.5–5.7, pure): the 금방 vans (1–3) and the dog sled (G1b).
// A van leaves bay 1 when van.cap parcels are ready or the oldest has waited van.waitS (the forced first order at
// once): a tour of ≤ van.maxStops stops (all parcels of one address in one stop; addresses sharing a curb are one
// stop = one courier round), nearest neighbour + 2-opt on the cached lane matrix. States:
//   bay → load (loadS, dock 1 open) → out (spur, S-jog, lanes) → curb (the doorstep timeline) → leg … → home (lanes
//   → spur token → the jog, ave_s, bank_st → the apron gate at the corner → the dock lane) → pivot → reverse → bay
// Every tour ends in the bay; the watchdog returns a van whose state has not moved for van.watchdogS (its parcels go
// back to the pile). Kinematics: per-segment limits (class speed, turns), accel / decel, reverse at reverseMult.
// Walkers in a van.corridorM corridor yieldNearM–yieldAheadM ahead stop it (on screen only: off screen there are no
// bodies); one horn after honkAfterS; blocked > skipAfterS on the way to a curb skips that stop (retry at the end,
// then restock). The courier's doorstep timeline is built here at arrival (the same near and far: the view only
// draws it). Events go to `ev` ({ t: 'load' | 'dispatch' | 'arrive' | 'beat' | 'deliver' | 'horn' | 'home' | 'bay' |
// 'skip' | 'watchdog' | 'sled' | 'turn' … }).

import { VanPath, dir8, axisDir } from './path.js';
import { metres } from '../../vehicles/model/geom.js';
import { stream } from './rng.js';
import { polyLen } from './addresses.js';

const EPS = 0.04;

// ------------------------------------------------------------------------------------------------ the courier timeline
/**
 * beats for one stop: [{ k, t0, t1, pts?, cum?, len?, aid?, ids?, carry, how? }]
 * visits: [{ aid, kind, walk: { pts, len }, orders: [Order], home: bool, quiet: bool, meet: bool }]
 */
export function courierBeats(visits, C, night, opts = {}) {
  const beats = [];
  let t = 0;
  const add = (k, d, o = {}) => { const b = Object.assign({ k, t0: t, t1: t + d, carry: 0 }, o); beats.push(b); t += d; return b; };
  const walkSeg = (k, pts, mps, o) => { const cum = cumOf(pts); const len = cum[cum.length - 1]; add(k, Math.max(0.2, len / mps), Object.assign({ pts, cum, len }, o)); };
  const carryMps = night ? C.nightMps : C.carryMps, walkMps = night ? C.nightMps : C.walkMps;
  add('park', C.parkS);
  // rounds of ≤ perTrip parcels, nearest doors first
  const vs = visits.slice().sort((a, b) => a.walk.len - b.walk.len);
  const rounds = [];
  let cur = [], n = 0;
  for (const v of vs) {
    const k = v.orders.length;
    if (cur.length && n + k > (opts.perTrip || C.perTrip)) { rounds.push(cur); cur = []; n = 0; }
    cur.push(v); n += k;
  }
  if (cur.length) rounds.push(cur);
  for (const r of rounds) {
    let carry = r.reduce((s, v) => s + v.orders.length, 0);
    add('take', C.takeS, { carry, size: r[0].orders[0] ? r[0].orders[0].size : 'm' });
    let prev = null;
    for (const v of r) {
      const pts = prev ? branch(prev.walk.pts, v.walk.pts) : v.walk.pts;
      walkSeg('walk', pts, carryMps, { aid: v.aid, carry, size: v.orders[0].size });
      const ids = v.orders.map((o) => o.id);
      // quiet hours are decided when the courier reaches the door (a stop that began at 20:59 rings no bell at 21:01)
      const quiet = opts.quietAt ? opts.quietAt(t) : v.quiet;
      if (v.kind === 'stand') { add('drop', C.dropS, { aid: v.aid, ids, carry, how: 'stand' }); }
      else if (v.kind === 'locker') { add('fill', Math.max(0.6, (opts.fillEachS || 1.2) * ids.length), { aid: v.aid, ids, carry, how: 'locker' }); }
      else if (quiet) { add('drop', C.dropS, { aid: v.aid, ids, carry, how: 'doorstep' }); add('photo', C.photoS, { aid: v.aid, carry: carry - ids.length }); }
      else {
        add('ring', C.ringS, { aid: v.aid, carry });
        if (v.kind === 'apt' && !v.meet) add('inside', C.insideS, { aid: v.aid, ids, carry, how: 'inside' });
        else if (v.home) {
          add('open', C.doorOpenS, { aid: v.aid, carry });
          add('hand', C.handS, { aid: v.aid, ids, carry, how: 'hand' });
          add('joy', C.joyS, { aid: v.aid, carry: carry - ids.length });
        } else { add('drop', C.dropS, { aid: v.aid, ids, carry, how: 'doorstep' }); add('photo', C.photoS, { aid: v.aid, carry: carry - ids.length }); }
      }
      carry -= ids.length;
      prev = v;
    }
    walkSeg('back', prev.walk.pts.slice().reverse(), walkMps, { carry: 0 });
  }
  if (opts.fetch) add('fetch', opts.fetch, { how: 'fetch' });
  add('in', C.getInS);
  return { beats, T: t };
}

/** from door A to door B: back along A's walk to where B's walk branches off, then along B's */
function branch(a, b) {
  let c = 0;
  while (c + 1 < a.length && c + 1 < b.length && Math.abs(a[c + 1].x - b[c + 1].x) < 0.5 && Math.abs(a[c + 1].y - b[c + 1].y) < 0.5) c++;
  const out = a.slice(c).reverse().concat(b.slice(c + 1));
  return out.length >= 2 ? out : [a[a.length - 1], b[b.length - 1]];
}
function cumOf(pts) { const c = new Float64Array(pts.length); for (let k = 1; k < pts.length; k++) c[k] = c[k - 1] + metres(pts[k - 1].x, pts[k - 1].y, pts[k].x, pts[k].y); return c; }

// ------------------------------------------------------------------------------------------------ a van
export class Van {
  constructor(n, kit) {
    this.id = n;                 // 1, 2, 3
    this.name = 'gb_crew_d' + n;
    this.st = 'bay';
    this.path = null; this.s = 0; this.v = 0;
    const b = kit.reverse().pts[1];
    this.x = b.x; this.y = b.y; this.hx = 0.8944; this.hy = 0.4472; this.dk = 'SE'; this.rev = false;
    this.load = [];              // orders on board
    this.tour = []; this.stopI = 0;
    this.tl = null; this.tlT = 0; this.beat = -1;
    this.stT = 0;                // seconds in this state
    this.blockedT = 0; this.honkT = 99; this.runs = 0; this.breakT = 0;
    this.sig = ''; this.sigT = 0;
    this.queue = [];             // the path pieces still to drive this phase: [{ path, then }]
    this.night = false;
    this.backload = null;        // backhaul crates on board { item: n }
    this.firstRun = false;
  }
  state() {
    return { id: this.id, st: this.st, x: this.x, y: this.y, hx: this.hx, hy: this.hy, dk: this.dk, v: this.v, rev: this.rev, s: this.s,
      load: this.load.map((o) => o.id), stop: this.tour[this.stopI] ? this.tour[this.stopI].key : null, stops: this.tour.length, stopI: this.stopI,
      tl: this.tl, tlT: this.tlT, beat: this.beat, blocked: this.blockedT, runs: this.runs, night: this.night, path: this.path ? this.path.tag : null };
  }
}

// ------------------------------------------------------------------------------------------------ the dispatcher
export class Dispatcher {
  constructor(tune, kit, seed) {
    this.tune = tune; this.kit = kit; this.seed = seed >>> 0;
    this.vans = [];
    this.token = null;           // the van on the spur (one at a time)
    this.firstDone = false;
    this.r = stream(seed, 'courier', 0);
    this.lastHornT = -99;
    this.sled = null;
  }

  setVans(n) { while (this.vans.length < Math.min(this.tune.van.max, n)) this.vans.push(new Van(this.vans.length + 1, this.kit)); }

  // ---------------------------------------------------------------------------------------- tours
  /**
   * ready parcels -> a tour for one van: [{ key, curb, visits: [{ aid, orders }] }] (≤ maxStops, ≤ cap parcels)
   * ctx: { book, addresses, T, working, standOk, sledWaitS }
   */
  plan(ready, ctx) {
    const V = this.tune.van, A = ctx.addresses;
    const groups = new Map();       // stop key -> { key, curb, t0, n, first, visits: Map(aid -> orders) }
    for (const o of ready) {
      let key, curb, aid = o.aid;
      if (o.mode === 'sled') {
        const st = A.get('stand');
        if (!st || !st.curb) continue;
        key = st.cluster; curb = st.curb; aid = 'stand';
      } else {
        const a = A.get(o.aid);
        if (!a || a.zone !== 'van' || !a.curb) continue;
        const lk = ctx.lockerFor ? ctx.lockerFor(a) : null;
        if (lk) { key = lk.cluster; curb = lk.curb; aid = lk.aid; } else { key = a.cluster; curb = a.curb; }
      }
      let g = groups.get(key);
      if (!g) { g = { key, curb, t0: o.t0, n: 0, first: false, visits: new Map(), sled: false }; groups.set(key, g); }
      g.t0 = Math.min(g.t0, o.t0); g.n++; g.first = g.first || o.first; if (o.mode === 'sled') g.sled = true;
      if (!g.visits.has(aid)) g.visits.set(aid, []);
      g.visits.get(aid).push(o);
    }
    // backhaul: the stand stop rides along (no parcels) when crates wait at the station dock
    if (ctx.extraStand) {
      const st = A.get('stand');
      if (st && st.curb && !groups.has(st.cluster)) groups.set(st.cluster, { key: st.cluster, curb: st.curb, t0: Infinity, n: 0, first: false, visits: new Map(), sled: false, fetch: true });
    }
    if (!groups.size || !Array.from(groups.values()).some((g) => g.n > 0)) return null;
    const gl = Array.from(groups.values()).sort((a, b) => (b.first - a.first) || (a.t0 - b.t0) || (a.key < b.key ? -1 : 1));
    // the sled stand joins only when it is on the way (≤ 25 m extra) or its parcels have waited sled.waitS
    const kit = this.kit, join = kit.joinPos(), back = kit.backPos();
    const pos = (g) => ({ lane: g.curb.lane, s: g.curb.s });
    const chosen = [gl[0]];
    let n = Math.min(gl[0].n, V.cap);
    const firstOnly = gl[0].first;
    // (the last tours of the day are short: nobody drives on long after closing — the rest leaves at 07:00)
    const maxStops = ctx.lateTour ? Math.max(1, V.lastStops || 2) : V.maxStops;
    while (!firstOnly && chosen.length < maxStops) {
      let best = null, bd = Infinity;
      for (const g of gl) {
        if (chosen.includes(g)) continue;
        if (n + g.n > V.cap) continue;
        let d = Infinity;
        for (const c of chosen) d = Math.min(d, kit.cost(pos(c), pos(g)), kit.cost(pos(g), pos(c)));
        if (g.sled && !(ctx.T - g.t0 >= this.tune.sled.waitS) && d > 25) continue;
        if (g.fetch) d = -1;
        if (d < bd) { bd = d; best = g; }
      }
      if (!best) break;
      chosen.push(best); n += best.n;
    }
    // order: nearest neighbour from the join, then 2-opt on join → … → back
    const order = [];
    const left = chosen.slice();
    let at = join;
    while (left.length) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < left.length; i++) { const d = kit.cost(at, pos(left[i])); if (d < bd) { bd = d; bi = i; } }
      const g = left.splice(bi, 1)[0];
      order.push(g); at = pos(g);
    }
    const tourLen = (ord) => { let m = kit.cost(join, pos(ord[0])); for (let i = 1; i < ord.length; i++) m += kit.cost(pos(ord[i - 1]), pos(ord[i])); return m + kit.cost(pos(ord[ord.length - 1]), back); };
    let best = tourLen(order), improved = true, guard = 30;
    while (improved && guard-- > 0 && order.length > 2) {
      improved = false;
      for (let i = 0; i < order.length - 1; i++) for (let j = i + 1; j < order.length; j++) {
        const cand = order.slice(0, i).concat(order.slice(i, j + 1).reverse(), order.slice(j + 1));
        const L = tourLen(cand);
        if (L + 0.01 < best) { best = L; order.splice(0, order.length, ...cand); improved = true; }
      }
    }
    // (near closing: only the stops that fit before hours.close + van.lastTourH — the tour estimate is the lane cost at
    //  4.5 m/s + each stop's walk there and back + the doorstep beats; the first stop always goes)
    if (Number.isFinite(ctx.leftS)) {
      let est = 0, at = join;
      for (let k = 0; k < order.length; k++) {
        const g = order[k];
        est += kit.cost(at, pos(g)) / 4.5;
        for (const vs of g.visits.values()) { const a = A.get(vs[0].aid); const w = a && a.walk ? a.walk.len : 10; est += 2 * w / 1.4 + 6; }
        at = pos(g);
        if (k > 0 && est + kit.cost(at, back) / 4.5 > ctx.leftS) { order.length = k; break; }
      }
    }
    // cap: whole addresses only (the oldest first) within van.cap
    let room = V.cap;
    const tour = [];
    for (const g of order) {
      const visits = [];
      for (const [aid, os] of Array.from(g.visits.entries()).sort((a, b) => Math.min(...a[1].map((o) => o.t0)) - Math.min(...b[1].map((o) => o.t0)))) {
        if (os.length > room) continue;
        visits.push({ aid, orders: os }); room -= os.length;
      }
      if (visits.length || g.fetch) tour.push({ key: g.key, curb: g.curb, visits, skipped: 0, fetch: !!g.fetch, len: Number.isFinite(best) ? best : 0 });
    }
    return tour.length ? tour : null;
  }

  // ---------------------------------------------------------------------------------------- update
  /**
   * ctx: { T, hour, dt, book, addresses, working (hub hours or dawn), quiet (no bell), night (lights), env, ev,
   *        settle(o, how, van), standDrop(orders), sleighBusy(), walkers(x, y) | null, live(x, y), home(aid, o) }
   */
  update(dt, ctx) {
    const V = this.tune.van;
    for (const van of this.vans) {
      van.stT += dt;
      van.night = ctx.night;
      switch (van.st) {
        case 'bay': this.inBay(van, ctx); break;
        case 'break': if ((van.breakT -= dt) <= 0) this.setSt(van, 'bay', ctx); break;
        case 'load': this.loading(van, dt, ctx); break;
        case 'out': case 'leg': case 'home': case 'spurA': case 'spurB': case 'reverse': this.drive(van, dt, ctx); break;
        case 'wait': this.waiting(van, ctx); break;
        case 'curb': this.atCurb(van, dt, ctx); break;
        case 'pivot': if (van.stT >= V.pivotS) this.startReverse(van, ctx); break;
        default: break;
      }
      this.watchdog(van, dt, ctx);
    }
  }

  setSt(van, st, ctx, extra) {
    van.st = st; van.stT = 0;
    ctx.ev.push(Object.assign({ t: 'van', id: van.id, st }, extra || {}));
  }

  inBay(van, ctx) {
    const V = this.tune.van;
    van.v = 0;
    if (!ctx.working) return;
    if (van.runs > 0 && van.runs % V.breakEvery === 0 && !van.breakDone) { van.breakDone = true; van.breakT = V.breakS; this.setSt(van, 'break', ctx); return; }
    // the parcels on the pile nobody has taken yet
    const ready = ctx.book.list.filter((o) => o.st === 'ready' && !o.van && (!o.tomorrow || ctx.working));
    if (!ready.length) return;
    const oldest = ready.reduce((m, o) => Math.min(m, o.tReady >= 0 ? o.tReady : o.t0), Infinity);
    const first = ready.some((o) => o.first);
    // (critique M3: "금방" is quick) with every other van home, a parcel waits only van.idleWaitS for company; while
    // another van is out the bay batches up to van.waitS
    const others = this.vans.some((q) => q !== van && q.st !== 'bay' && q.st !== 'break');
    const wait = others || !Number.isFinite(V.idleWaitS) ? V.waitS : V.idleWaitS;
    if (!(first || ready.length >= V.cap || ctx.T - oldest >= wait)) return;
    const tour = this.plan(ready, ctx);
    if (!tour) return;
    van.tour = tour; van.stopI = 0;
    van.load = [];
    for (const s of tour) for (const v of s.visits) for (const o of v.orders) { o.van = van.id; van.load.push(o); }
    van.loadT = Math.max(V.loadS, van.load.length * this.tune.hub.loadEachS);
    van.breakDone = false;
    van.firstRun = first;
    this.setSt(van, 'load', ctx, { n: van.load.length, ids: van.load.map((o) => o.id) });
    ctx.ev.push({ t: 'load', id: van.id, ids: van.load.map((o) => o.id), loadS: van.loadT });
  }

  loading(van, dt, ctx) {
    if (van.stT < van.loadT) return;
    // the spur must be free (one van at a time) and the sleigh off the apron
    if ((this.token !== null && this.token !== van.id) || (ctx.sleighBusy && ctx.sleighBusy())) return;
    const first = van.tour[0];
    const path = this.kit.out({ lane: first.curb.lane, s: first.curb.s });
    if (!path) { this.abortTour(van, ctx, 'noRoute'); return; }
    this.token = van.id;
    van.spurEnd = this.spurLen();
    for (const o of van.load) { o.st = 'gone'; o.tGone = ctx.T; }
    this.go(van, path, 'out', ctx);
    ctx.ev.push({ t: 'dispatch', id: van.id, ids: van.load.map((o) => o.id), stops: van.tour.length, first: van.firstRun, night: !!ctx.night });
  }

  /** metres from the bay to the join (the token is released there) */
  spurLen() { if (this.spurM === undefined) { const p = this.kit.out(null); this.spurM = p ? p.len : 30; } return this.spurM; }

  go(van, path, st, ctx) {
    van.path = path; van.s = 0; van.rev = !!path.rev;
    if (!path.rev) van.v = Math.min(van.v, 1.0);
    van.blockedT = 0;
    this.setSt(van, st, ctx);
    this.place(van);
  }

  place(van) {
    const p = van.path.at(van.s, {});
    van.x = p.x; van.y = p.y;
    if (van.rev) { van.hx = -p.hx; van.hy = -p.hy; } else { van.hx = p.hx; van.hy = p.hy; }
    van.dk = dir8(van.hx, van.hy);
    van.axis = axisDir(van.hx, van.hy);
  }

  /** kinematics along the path; arrival -> next phase */
  drive(van, dt, ctx) {
    const V = this.tune.van, P = van.path;
    let lim = P.limit(van.s, V.decel);
    // walkers ahead (on screen only)
    let blocked = false;
    if (!van.rev && ctx.walkers && ctx.live(van.x, van.y)) blocked = this.walkerAhead(van, ctx);
    if (van.rev && ctx.walkers && ctx.live(van.x, van.y)) blocked = this.walkerAhead(van, ctx, true);
    if (blocked) lim = 0;
    if (van.v < lim) van.v = Math.min(lim, van.v + V.accel * dt);
    else van.v = Math.max(lim, van.v - V.decel * 1.6 * dt);
    if (blocked) {
      van.blockedT += dt; van.honkT += dt;
      if (van.blockedT >= V.honkAfterS && van.honkT >= V.honkAfterS && ctx.T - this.lastHornT >= V.honkAfterS) { van.honkT = 0; this.lastHornT = ctx.T; ctx.ev.push({ t: 'horn', id: van.id, x: van.x, y: van.y }); }
      if (van.blockedT >= V.skipAfterS && (van.st === 'out' || van.st === 'leg')) { this.skipStop(van, ctx); return; }
    } else { van.blockedT = 0; van.honkT = V.honkAfterS; }
    van.s = Math.min(P.len, van.s + van.v * dt);
    this.place(van);
    // the spur token goes when the van is past the join (out) — the next van may leave
    if (van.st === 'out' && this.token === van.id && van.s >= van.spurEnd) this.token = null;
    if (van.s >= P.len - EPS && van.v < 0.25) this.arrive(van, ctx);
  }

  /** is a walker in the corridor ahead (or behind, reversing)? */
  walkerAhead(van, ctx, back) {
    const V = this.tune.van;
    const ws = ctx.walkers(van.x, van.y);
    if (!ws || !ws.length) return false;
    const sx = back ? -van.hx : van.hx, sy = back ? -van.hy : van.hy;
    // ground frame: (dx, 2dy)/64 metres
    const gx = sx, gy = sy * 2, gl = Math.hypot(gx, gy) || 1, ux = gx / gl, uy = gy / gl;
    for (const w of ws) {
      const dx = (w.x - van.x) / 64, dy = ((w.y - van.y) * 2) / 64;
      const a = dx * ux + dy * uy, l = Math.abs(-dx * uy + dy * ux);
      // (critique M4) the cargo sleigh is a vehicle: the van keeps a body length back from it (its points carry .sleigh)
      const reach = back ? 2.4 : V.yieldAheadM + 2.2 + (w.sleigh ? 1.6 : 0);   // from the anchor (the van centre) to beyond its nose
      if (a > (back ? 0.4 : w.sleigh ? 0 : V.yieldNearM) && a < reach && l < V.corridorM / 2 + 0.95) return true;
    }
    return false;
  }

  arrive(van, ctx) {
    van.v = 0;
    switch (van.st) {
      case 'out': case 'leg': {
        const stop = van.tour[van.stopI];
        this.setSt(van, 'curb', ctx, { stop: stop.key });
        this.buildTimeline(van, stop, ctx);
        ctx.ev.push({ t: 'arrive', id: van.id, stop: stop.key, aids: stop.visits.map((v) => v.aid), x: van.x, y: van.y, dk: van.dk });
        break;
      }
      case 'home': {
        // at the end of 中央로 −j: the spur (token) next. The cargo sleigh shares ave_s, bank_st and the apron (one lane):
        // while it is anywhere on that stretch the van waits here, before the jog (G-P2b holds the sleigh the same way)
        if (this.token !== null && this.token !== van.id) { this.setSt(van, 'wait', ctx, { gate: 'token' }); van.waitFor = 'token'; return; }
        if (ctx.sleighBusy && ctx.sleighBusy()) { this.setSt(van, 'wait', ctx, { gate: 'sleigh' }); van.waitFor = 'token'; return; }
        this.token = van.id;
        this.go(van, this.spurA(), 'spurA', ctx);
        break;
      }
      case 'spurA': {
        if (ctx.sleighBusy && ctx.sleighBusy()) { this.setSt(van, 'wait', ctx, { gate: 'apron' }); van.waitFor = 'apron'; return; }
        this.go(van, this.spurB(), 'spurB', ctx);
        break;
      }
      case 'spurB': this.setSt(van, 'pivot', ctx); break;
      case 'reverse': this.inBayAgain(van, ctx); break;
      default: break;
    }
  }

  waiting(van, ctx) {
    if (van.waitFor === 'token') {
      if ((this.token === null || this.token === van.id) && !(ctx.sleighBusy && ctx.sleighBusy())) { this.token = van.id; this.go(van, this.spurA(), 'spurA', ctx); }
    } else if (van.waitFor === 'apron') {
      if (!(ctx.sleighBusy && ctx.sleighBusy())) this.go(van, this.spurB(), 'spurB', ctx);
    }
  }

  /** the spur in, split at the corner (the apron gate): A = jog + ave_s + bank_st, B = corner -> pivot */
  spurA() {
    if (!this._spurA) {
      const full = this.kit.home(null);
      const S = this.kit.lay.spur;
      const c = full.pts.findIndex((p) => Math.abs(p.x - (3120 + 64 * (S.corner[0] + S.corner[1]))) < 1 && Math.abs(p.y - (1315 + 32 * (S.corner[0] - S.corner[1]))) < 1);
      const k = c > 0 ? c : full.pts.length - 2;
      this._spurA = new VanPath(full.pts.slice(0, k + 1), full.lim.slice(0, k), { tag: 'spurA' });
      this._spurB = new VanPath(full.pts.slice(k), full.lim.slice(k), { tag: 'spurB' });
    }
    return this._spurA;
  }
  spurB() { this.spurA(); return this._spurB; }

  startReverse(van, ctx) { this.go(van, this.kit.reverse(), 'reverse', ctx); }

  inBayAgain(van, ctx) {
    van.path = null; van.v = 0; van.rev = false;
    van.hx = 0.8944; van.hy = 0.4472; van.dk = 'SE';
    if (this.token === van.id) this.token = null;
    van.runs++;
    van.tour = []; van.stopI = 0;
    // anything still on board (skipped twice / address gone) goes back on the pile
    for (const o of van.load) if (o.st === 'gone') { o.st = 'ready'; o.van = null; }
    van.load = [];
    if (van.backload) { ctx.ev.push({ t: 'backhaul', id: van.id, items: van.backload }); if (ctx.backhaul) ctx.backhaul(van.backload); van.backload = null; }
    this.setSt(van, 'bay', ctx);
    ctx.ev.push({ t: 'bay', id: van.id, runs: van.runs });
  }

  /** after a stop: the next curb, or home */
  nextLeg(van, ctx) {
    van.stopI++;
    const from = { lane: van.tour[van.stopI - 1].curb.lane, s: van.tour[van.stopI - 1].curb.s };
    while (van.stopI < van.tour.length) {
      const st = van.tour[van.stopI];
      if (!st.fetch && !st.visits.some((v) => v.orders.some((o) => o.st === 'gone'))) { van.stopI++; continue; }
      const leg = this.kit.leg(from, { lane: st.curb.lane, s: st.curb.s });
      if (leg) { this.go(van, leg, 'leg', ctx); return; }
      this.restockStop(van, st, ctx, 'noRoute');
      van.stopI++;
    }
    this.goHome(van, from, ctx);
  }

  goHome(van, from, ctx) {
    const p = this.kit.leg(from, this.kit.backPos(), 'home');
    if (!p) { this.watchdogReturn(van, ctx, 'noRoute'); return; }
    this.go(van, p, 'home', ctx);
    ctx.ev.push({ t: 'home', id: van.id });
  }

  /** a stop the van could not reach: retry at the end once, then restock */
  skipStop(van, ctx) {
    const st = van.tour[van.stopI];
    if (!st) return;
    st.skipped++;
    ctx.ev.push({ t: 'skip', id: van.id, stop: st.key, n: st.skipped });
    if (st.skipped >= 2) { this.restockStop(van, st, ctx, 'blocked'); van.tour.splice(van.stopI, 1); }
    else { van.tour.splice(van.stopI, 1); van.tour.push(st); }
    // re-plan from where the van stands (the lane under it)
    const here = this.kit.lg.snap(van.x, van.y);
    van.blockedT = 0;
    if (!here) { this.watchdogReturn(van, ctx, 'lost'); return; }
    const from = { lane: here.lane, s: here.s };
    while (van.stopI < van.tour.length) {
      const nx = van.tour[van.stopI];
      const leg = this.kit.leg(from, { lane: nx.curb.lane, s: nx.curb.s });
      if (leg) { this.go(van, leg, 'leg', ctx); return; }
      this.restockStop(van, nx, ctx, 'noRoute'); van.tour.splice(van.stopI, 1);
    }
    this.goHome(van, from, ctx);
  }

  restockStop(van, st, ctx, why) {
    for (const v of st.visits) for (const o of v.orders) if (o.st === 'gone') { ctx.restock(o, why); const i = van.load.indexOf(o); if (i >= 0) van.load.splice(i, 1); }
  }

  abortTour(van, ctx, why) {
    for (const o of van.load) if (o.st === 'gone' || o.st === 'ready') { o.st = 'ready'; o.van = null; }
    van.load = []; van.tour = [];
    this.setSt(van, 'bay', ctx, { why });
  }

  // ---------------------------------------------------------------------------------------- the doorstep
  buildTimeline(van, stop, ctx) {
    const C = this.tune.courier;
    const visits = [];
    for (const v of stop.visits) {
      const live = v.orders.filter((o) => o.st === 'gone');
      if (!live.length) continue;
      const a = v.aid === 'stand' ? ctx.addresses.get('stand') : ctx.addresses.get(v.aid);
      if (!a || !a.walk) { for (const o of live) { ctx.restock(o, 'gone'); const i = van.load.indexOf(o); if (i >= 0) van.load.splice(i, 1); } continue; }
      const hh = live[0].hid;
      const home = a.kind === 'stand' || a.kind === 'locker' ? true : ctx.home(a.aid, hh);
      const meet = a.kind === 'apt' && (live.some((o) => o.first) || (home && this.r.chance(C.aptMeet)));
      visits.push({ aid: a.aid, kind: a.kind, walk: a.walk, orders: live, home: !!home, quiet: ctx.quiet && a.kind !== 'stand' && a.kind !== 'locker', meet });
    }
    const fetch = stop.key === (ctx.addresses.get('stand') || {}).cluster && ctx.fetchDue && ctx.fetchDue(van) ? 6 : 0;
    if (!visits.length && !fetch) { van.tl = null; this.nextLeg(van, ctx); return; }
    const quietAt = (t) => ctx.quietAt(t);
    van.tl = visits.length ? courierBeats(visits, C, ctx.quiet, { fillEachS: this.tune.locker.fillEachS, fetch, quietAt })
      : { beats: [{ k: 'park', t0: 0, t1: C.parkS, carry: 0 }, { k: 'fetch', t0: C.parkS, t1: C.parkS + fetch, carry: 0, how: 'fetch' }, { k: 'in', t0: C.parkS + fetch, t1: C.parkS + fetch + C.getInS, carry: 0 }], T: C.parkS + fetch + C.getInS };
    van.tl.stop = stop.key;
    van.tlT = 0; van.beat = -1;
    van.fetching = fetch > 0;
  }

  atCurb(van, dt, ctx) {
    const tl = van.tl;
    if (!tl) { this.nextLeg(van, ctx); return; }
    van.tlT += dt;
    // beats that started by now
    while (van.beat + 1 < tl.beats.length && tl.beats[van.beat + 1].t0 <= van.tlT) {
      van.beat++;
      const b = tl.beats[van.beat];
      ctx.ev.push({ t: 'beat', id: van.id, k: b.k, aid: b.aid || null, ids: b.ids || null, how: b.how || null, x: van.x, y: van.y });
      if (b.k === 'joy' || b.k === 'photo') { /* delivered at the hand / drop beat */ }
      if (b.ids && (b.k === 'hand' || b.k === 'drop' || b.k === 'inside' || b.k === 'fill')) {
        for (const id of b.ids) {
          const o = van.load.find((q) => q.id === id);
          if (!o || o.st !== 'gone') continue;
          van.load.splice(van.load.indexOf(o), 1);
          if (b.how === 'stand') ctx.standDrop(o, van); else ctx.settle(o, b.how, van);
        }
      }
      if (b.k === 'fetch' && ctx.fetch) van.backload = ctx.fetch(van);
    }
    if (van.tlT >= tl.T) { van.tl = null; this.nextLeg(van, ctx); }
  }

  // ---------------------------------------------------------------------------------------- watchdog
  watchdog(van, dt, ctx) {
    const V = this.tune.van;
    if (van.st === 'bay' || van.st === 'break') { van.sigT = 0; van.sig = ''; return; }
    const sig = van.st + ':' + Math.round(van.s * 4) + ':' + van.stopI + ':' + Math.round(van.tlT * 4) + ':' + Math.round(van.stT * 0);
    if (sig === van.sig) van.sigT += dt; else { van.sig = sig; van.sigT = 0; }
    // the gates and the loading pause count as waiting, not as stuck — unless far beyond the watchdog
    const lim = van.st === 'wait' || van.st === 'load' ? V.watchdogS * 3 : V.watchdogS;
    if (van.sigT >= lim) this.watchdogReturn(van, ctx, 'stuck:' + van.st);
  }

  watchdogReturn(van, ctx, why) {
    ctx.ev.push({ t: 'watchdog', id: van.id, why, st: van.st });
    if (this.token === van.id) this.token = null;
    for (const o of van.load) if (o.st === 'gone' || o.st === 'ready') { o.st = 'ready'; o.van = null; }
    van.load = []; van.tour = []; van.stopI = 0; van.tl = null;
    van.path = null; van.v = 0; van.rev = false;
    const b = this.kit.reverse().pts[1];
    van.x = b.x; van.y = b.y; van.hx = 0.8944; van.hy = 0.4472; van.dk = 'SE';
    van.sig = ''; van.sigT = 0;
    this.setSt(van, 'bay', ctx, { why });
  }

  serializeVans() { return this.vans.length; }

  /**
   * (critique M1) the road net changed under the vans (a street upgraded, a lot paved): every parcel on a van or being
   * loaded goes back on the pile (st 'ready', no van) and the vans of the new dispatcher start in bay 1 — nothing stays
   * 'gone' on a van that no longer exists. Returns the orders put back.
   */
  release(ctx) {
    const back = [];
    for (const van of this.vans) {
      for (const o of van.load) if (o.st === 'gone' || o.st === 'ready') { o.st = 'ready'; o.van = null; back.push(o); }
      van.load = []; van.tour = []; van.tl = null;
    }
    this.token = null;
    if (ctx && ctx.book) for (const o of ctx.book.list) if ((o.st === 'gone' || o.st === 'ready') && typeof o.van === 'number') { o.st = 'ready'; o.van = null; if (back.indexOf(o) < 0) back.push(o); }
    return back;
  }
}

// ------------------------------------------------------------------------------------------------ the dog sled (G1b)
/**
 * 금방 개썰매 (1, or 2 with 개썰매 2): the village parcels the vans leave at the 역앞 금방 정류장 go round the old
 * village (stops nearest first, the rider walks the last bit); between deliveries the team does 금방 집하 — to the full
 * village piles (fish · meat · log · wheat · ore), loads what the pile can spare (the gatherers work on), and brings it
 * to the stand next to the 짐 싣는 곳, where it joins the station dock's surplus (the cargo sleigh and the train take it
 * on). That is how 금방 makes the village's overflowing piles lighter (critique C1).
 * ctx (the model's sled context): { T, working, quiet, quietAt, queue (the shared stand queue), addresses, ev, home,
 *   settle, restock, piles() -> [{ id, item, x, y, n, max }], takePile(id, n, to) -> n, dockRoom(item) -> n,
 *   dockDrop(items), claimed(id, sled) -> bool, collect: bool }
 */
export class Sled {
  constructor(tune, village, stand, idx = 1) {
    this.tune = tune;
    this.idx = idx;                 // 1, 2 (개썰매 2)
    this.g = village;               // { nodes: { id: [x, y] }, edges: [[a, b]] , stand: id }
    this.home = stand;              // node id of the stand
    this.st = 'stand';
    this.queue = [];                // (kept for old callers: the shared stand queue lives in the model)
    this.load = [];
    this.path = null; this.s = 0; this.v = 0;
    const p = village && village.nodes[stand];
    this.x = p ? p[0] : 0; this.y = p ? p[1] : 0; this.hx = 0.8944; this.hy = 0.4472; this.dk = 'SE';
    this.stops = []; this.stopI = 0; this.tl = null; this.tlT = 0; this.beat = -1;
    this.waitT = 0; this.runs = 0; this.stT = 0;
    this.cplan = null; this.cstop = 0; this.cload = {}; this.colT = 1 + idx; this.cT = 0; this.cDur = 0; this.cn = 0; this.cpile = null;
    this.adj = new Map();
    this.pileNodes = new Map();
    if (village) for (const [a, b] of village.edges || []) {
      const pa = village.nodes[a], pb = village.nodes[b];
      if (!pa || !pb) continue;
      const m = metres(pa[0], pa[1], pb[0], pb[1]);
      if (!this.adj.has(a)) this.adj.set(a, []); if (!this.adj.has(b)) this.adj.set(b, []);
      this.adj.get(a).push([b, m]); this.adj.get(b).push([a, m]);
    }
  }

  /** node path a -> b (Dijkstra) as px points, or null */
  route(a, b) {
    if (a === b) { const p = this.g.nodes[a]; return [{ x: p[0], y: p[1] }, { x: p[0] + 0.01, y: p[1] }]; }
    const dist = new Map([[a, 0]]), prev = new Map(), todo = [[0, a]];
    while (todo.length) {
      todo.sort((p, q) => p[0] - q[0]);
      const [d, n] = todo.shift();
      if (n === b) break;
      if (d > (dist.get(n) ?? Infinity)) continue;
      for (const [m, w] of this.adj.get(n) || []) { const nd = d + w; if (nd < (dist.get(m) ?? Infinity)) { dist.set(m, nd); prev.set(m, n); todo.push([nd, m]); } }
    }
    if (!dist.has(b)) return null;
    const ids = [];
    for (let c = b; c !== undefined; c = prev.get(c)) { ids.push(c); if (c === a) break; }
    ids.reverse();
    if (ids[0] !== a) return null;
    return ids.map((id) => ({ x: this.g.nodes[id][0], y: this.g.nodes[id][1] }));
  }

  /** the village-road node nearest a pile (≤ collect.reachM, reachable from the stand), cached per pile */
  pileNode(p) {
    const k = p.id + ':' + Math.round(p.x) + ':' + Math.round(p.y);
    if (this.pileNodes.has(k)) return this.pileNodes.get(k);
    let best = null;
    for (const id in this.g.nodes) {
      if (id === this.home) continue;
      const q = this.g.nodes[id], d = metres(q[0], q[1], p.x, p.y);
      if (!best || d < best.d) best = { node: id, d };
    }
    const out = best && best.d <= this.tune.collect.reachM && this.route(this.home, best.node) ? best : null;
    this.pileNodes.set(k, out);
    return out;
  }

  state() {
    const c = this.cplan && this.cplan[this.cstop];
    return { idx: this.idx, st: this.st, x: this.x, y: this.y, hx: this.hx, hy: this.hy, dk: this.dk, v: this.v, queue: this.queueN || 0, load: this.load.map((o) => o.id), tl: this.tl, tlT: this.tlT, beat: this.beat, runs: this.runs,
      cload: Object.assign({}, this.cload), cn: sumC(this.cload), cT: this.cT, cDur: this.cDur, pile: c ? { id: c.id, item: c.item, x: c.x, y: c.y } : null };
  }

  /** busy with anything (a delivery run or 집하) */
  busy() { return this.st !== 'stand'; }

  update(dt, ctx) {
    const S = this.tune.sled;
    this.stT += dt;
    const queue = ctx.queue || this.queue;
    this.queueN = queue.length;
    if (this.st === 'stand') {
      this.v = 0;
      // crates still on board (a reload, a dock that was full): to the dock first
      if (sumC(this.cload) > 0) { this.startDrop(ctx); return; }
      if (queue.length && ctx.working) {
        const oldest = Math.min(...queue.map((o) => o.tStand || ctx.T));
        if (queue.length < S.cap && ctx.T - oldest < 20) return;
        this.load = queue.splice(0, S.cap);
        // stops: one per village address, nearest first from the stand
        const by = new Map();
        for (const o of this.load) { const a = ctx.addresses.get(o.aid); if (!a || !a.vnode) { ctx.restock(o, 'gone'); continue; } if (!by.has(a.aid)) by.set(a.aid, { a, orders: [] }); by.get(a.aid).orders.push(o); }
        this.load = this.load.filter((o) => o.st === 'gone');
        const stops = Array.from(by.values());
        const ordered = [];
        let at = this.home;
        while (stops.length) {
          let bi = 0, bd = Infinity;
          for (let i = 0; i < stops.length; i++) { const r = this.route(at, stops[i].a.vnode); const d = r ? polyLen(r) : Infinity; if (d < bd) { bd = d; bi = i; } }
          const s = stops.splice(bi, 1)[0]; ordered.push(s); at = s.a.vnode;
        }
        this.stops = ordered; this.stopI = 0;
        if (!ordered.length) return;
        ctx.ev.push({ t: 'sled', op: 'go', sled: this.idx, ids: this.load.map((o) => o.id) });
        this.legTo(ordered[0].a.vnode, this.home, ctx);
        return;
      }
      // 금방 집하 (between deliveries, by day)
      this.colT -= dt;
      if (this.colT <= 0) { this.colT = this.tune.collect.everyS; if (ctx.working && ctx.collect) this.planCollect(ctx); }
      return;
    }
    if (this.st === 'run' || this.st === 'back' || this.st === 'cgo' || this.st === 'cback') {
      const P = this.path, lim = P.limit(this.s, 2.0);
      this.v = this.v < lim ? Math.min(lim, this.v + 1.2 * dt) : Math.max(lim, this.v - 3 * dt);
      this.s = Math.min(P.len, this.s + this.v * dt);
      const p = P.at(this.s, {}); this.x = p.x; this.y = p.y; this.hx = p.hx; this.hy = p.hy; this.dk = axisDir(p.hx, p.hy);
      if (this.s >= P.len - EPS && this.v < 0.3) {
        this.v = 0;
        if (this.st === 'back') { this.st = 'stand'; this.stT = 0; this.runs++; ctx.ev.push({ t: 'sled', op: 'home', sled: this.idx }); return; }
        if (this.st === 'cgo') { this.startLoad(ctx); return; }
        if (this.st === 'cback') { this.startDrop(ctx); return; }
        const st = this.stops[this.stopI];
        const C = this.tune.courier;
        const visits = [{ aid: st.a.aid, kind: 'house', walk: st.a.vwalk, orders: st.orders, home: ctx.quiet ? false : ctx.home(st.a.aid, st.orders[0].hid), quiet: ctx.quiet, meet: false }];
        this.tl = courierBeats(visits, C, ctx.quiet, { quietAt: (t) => ctx.quietAt(t) }); this.tlT = 0; this.beat = -1; this.st = 'door'; this.stT = 0;
        ctx.ev.push({ t: 'sled', op: 'door', sled: this.idx, aid: st.a.aid });
      }
      return;
    }
    if (this.st === 'door') {
      this.tlT += dt;
      const tl = this.tl;
      while (this.beat + 1 < tl.beats.length && tl.beats[this.beat + 1].t0 <= this.tlT) {
        this.beat++;
        const b = tl.beats[this.beat];
        ctx.ev.push({ t: 'beat', id: 'sled', sled: this.idx, k: b.k, aid: b.aid || null, ids: b.ids || null, how: b.how || null, x: this.x, y: this.y });
        if (b.ids) for (const id of b.ids) { const o = this.load.find((q) => q.id === id); if (o && o.st === 'gone') { this.load.splice(this.load.indexOf(o), 1); ctx.settle(o, b.how, 'sled'); } }
      }
      if (this.tlT >= tl.T) {
        this.tl = null;
        const from = this.stops[this.stopI].a.vnode;
        this.stopI++;
        if (this.stopI < this.stops.length) this.legTo(this.stops[this.stopI].a.vnode, from, ctx);
        else { this.legTo(this.home, from, ctx, true); }
      }
      return;
    }
    if (this.st === 'cload') {
      this.cT += dt;
      // the crates leave the pile when the rider reaches it (a third of the way in), all at once (one take)
      if (!this.cTook && this.cT >= this.cDur * 0.3) this.takeNow(ctx);
      if (this.cT >= this.cDur) this.nextPile(ctx);
      return;
    }
    if (this.st === 'cdrop') {
      this.cT += dt;
      if (this.cT >= this.cDur) {
        const items = this.cload, n = sumC(items);
        this.cload = {};
        if (n > 0 && ctx.dockDrop) ctx.dockDrop(items);
        ctx.ev.push({ t: 'collect', op: 'drop', sled: this.idx, items, n });
        this.st = 'stand'; this.stT = 0; this.cplan = null;
      }
    }
  }

  // ---------------------------------------------------------------------------------------- 금방 집하
  planCollect(ctx) {
    const C = this.tune.collect;
    if (!C.on || !ctx.piles) return false;
    const list = [];
    for (const p of ctx.piles() || []) {
      if (!p || !(p.max > 0) || p.n / p.max < C.pileAt) continue;
      const spare = p.n - Math.ceil(p.max * C.keep);
      if (spare < C.minLoad || (ctx.claimed && ctx.claimed(p.id, this))) continue;
      const room = ctx.dockRoom ? ctx.dockRoom(p.item) : 0;
      if (room < C.minLoad) continue;
      const pn = this.pileNode(p);
      if (!pn) continue;
      list.push({ id: p.id, item: p.item, x: p.x, y: p.y, node: pn.node, walkM: pn.d, fill: p.n / p.max, spare: Math.min(spare, room) });
    }
    if (!list.length) return false;
    list.sort((a, b) => (b.fill - a.fill) || (a.id < b.id ? -1 : 1));
    const plan = [list[0]];
    let room = list[0].spare;
    for (let k = 1; k < list.length && plan.length < C.piles && room < C.cap; k++) { plan.push(list[k]); room += list[k].spare; }
    this.cplan = plan; this.cstop = 0; this.cload = {}; this.capLeft = C.cap;
    ctx.ev.push({ t: 'collect', op: 'go', sled: this.idx, piles: plan.map((q) => q.id) });
    this.legTo(plan[0].node, this.home, ctx, false, 'cgo');
    return true;
  }

  /** at the pile's road point: the rider walks over, loads, walks back (cDur) */
  startLoad(ctx) {
    const C = this.tune.collect, cr = this.tune.courier, p = this.cplan[this.cstop];
    this.cpile = p; this.cTook = false; this.cT = 0; this.cn = 0;
    const est = Math.min(this.capLeft, p.spare);
    this.cDur = 2 * Math.max(0.6, p.walkM / cr.walkMps) + Math.max(1, est * C.loadEachS);
    this.st = 'cload'; this.stT = 0;
  }

  takeNow(ctx) {
    this.cTook = true;
    const C = this.tune.collect, p = this.cpile;
    let n = 0;
    const cur = (ctx.piles ? ctx.piles() : []).find((q) => q.id === p.id);
    if (cur && cur.max > 0) {
      const room = ctx.dockRoom ? ctx.dockRoom(p.item) - (this.cload[p.item] || 0) : 0;
      const want = Math.max(0, Math.min(this.capLeft, cur.n - Math.ceil(cur.max * C.keep), room));
      if (want > 0) n = Math.max(0, Math.floor(ctx.takePile(p.id, want, { x: this.x, y: this.y - 30 }) || 0));
    }
    if (n > 0) { this.cload[p.item] = (this.cload[p.item] || 0) + n; this.capLeft -= n; }
    this.cn = n;
    ctx.ev.push({ t: 'collect', op: 'load', sled: this.idx, pile: p.id, item: p.item, n, x: p.x, y: p.y });
  }

  nextPile(ctx) {
    const from = this.cplan[this.cstop].node;
    this.cstop++;
    while (this.cstop < this.cplan.length && this.capLeft >= this.tune.collect.minLoad) {
      const q = this.cplan[this.cstop];
      if (this.route(from, q.node)) { this.legTo(q.node, from, ctx, false, 'cgo'); return; }
      this.cstop++;
    }
    this.legTo(this.home, from, ctx, false, 'cback');
  }

  /** back at the stand: the crates go across to the 짐 싣는 곳 (dropEachS a crate) */
  startDrop(ctx) {
    const n = sumC(this.cload);
    this.cT = 0; this.cDur = Math.max(1, n * this.tune.collect.dropEachS);
    this.st = 'cdrop'; this.stT = 0;
    const p = this.g.nodes[this.home];
    if (p) { this.x = p[0]; this.y = p[1]; }
  }

  legTo(to, from, ctx, back, st) {
    const pts = this.route(from, to);
    if (!pts) {
      for (const o of this.load) ctx.restock(o, 'noRoute');
      this.load = [];
      if (sumC(this.cload) > 0) { this.startDrop(ctx); return; }    // (집하: what is on board still goes to the dock)
      this.st = 'stand'; this.cplan = null;
      const p = this.g.nodes[this.home]; if (p) { this.x = p[0]; this.y = p[1]; }
      return;
    }
    const v = this.tune.sled.speed;
    this.path = new VanPath(pts, pts.slice(1).map(() => v), { tag: back ? 'sledBack' : st || 'sled' });
    this.s = 0; this.st = st || (back ? 'back' : 'run'); this.stT = 0;
  }
}

const sumC = (o) => { let n = 0; for (const k in o || {}) n += o[k] || 0; return n; };
