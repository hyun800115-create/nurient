// The floor of the logistics centre (pure, deterministic): the forklift on its loop, the two dock bays with the
// vans / trucks that back into them, the shop owners' queue at the settlement counter, and the staff's little work
// beats. Everything is in px relative to the centre's anchor and in game seconds; the view only draws it.
//
// Forklift (manifest forkliftPath, 10 nodes): N0 food rack -> N1 corner -> [N2 dock 2 -> N3] -> N4 corner ->
// [N5 dock 1 -> N6] -> N7 -> N8 tools rack -> N9 -> N0. The two dock spurs are optional (N1 = N3, N4 = N6), so the
// forklift visits a bay only when it has work there. Greedy at every node:
//   N0      empty + a ready outbound order whose vehicle is docked  -> lift a pallet off the rack (loaded, 'out')
//   N1 / N4 loaded 'out' for that bay, or empty + an inbound vehicle docked there -> take the spur
//   N2 / N5 'out' -> lift the pallet into the vehicle; empty -> lift a pallet out of the inbound vehicle ('in')
//   N8      loaded 'in' -> put the pallet away on the racks (the stock grows here)
// Nothing to do: it waits at N0 facing the rack (idle engine shake), re-checking every checkS; after tidyS idle it
// does a 재고 정리 lap (a pallet from the food rack to the tools rack, no dock spurs, stock unchanged) so the floor
// never looks dead. Real work found on the way waits at most one lap (~10 s).

import { Mover, driveLegs, walkLegs, dist, dir8, lerp } from './geom.js';
import { stream } from './rng.js';

// ================================================================================================== forklift
export class Forklift {
  constructor(m) {
    this.m = m;
    this.node = 0;
    this.mover = null;
    this.phase = 'idle';           // idle | drive | lift
    this.liftT = 0;
    this.load = null;              // { kind: 'out', order, n, dock } | { kind: 'in', ship, items, n, dock }
    this.waitT = 0;
    this.laps = 0;
    this.idleFor = 0;
    this.pallets = { out: 0, in: 0, tidy: 0 };
  }
  get P() { return this.m.geo.path; }
  get T() { return this.m.tune.forklift; }
  pos() { return this.mover && this.phase === 'drive' ? this.mover.pos() : this.P[this.node].p.slice(); }
  dir() {
    if (this.phase === 'drive' && this.mover) return this.mover.dir();
    if (this.phase === 'lift') return this.P[this.node].dir;
    return this.P[this.node].dir;
  }
  band() {
    if (this.phase === 'drive') return this.P[this.legFrom].legBand;
    const n = this.P[this.node];
    return n.legBand;
  }
  /** fork height 0..1 during a lift (up, then down) */
  liftK() {
    if (this.phase !== 'lift') return 0;
    const L = this.T.liftS, t = this.liftT;
    return t < L ? t / L : Math.max(0, 1 - (t - L) / L);
  }
  loaded() { return !!this.load; }
  reversing() { return this.phase === 'drive' && this.mover && this.mover.reversing(); }

  drive(from, to) {
    const a = this.P[from], b = this.P[to];
    this.legFrom = from;
    const v = this.T.speed * (a.reverse ? this.T.reverse : 1);
    this.mover = new Mover([{ a: a.p.slice(), b: b.p.slice(), dir: a.legDir, rev: a.reverse, v }]);
    this.target = to;
    this.phase = 'drive';
  }
  lift(onTop) { this.phase = 'lift'; this.liftT = 0; this.onTop = onTop; this.topDone = false; }

  update(dt) {
    const m = this.m;
    if (this.phase === 'lift') {
      this.liftT += dt;
      if (!this.topDone && this.liftT >= this.T.liftS) { this.topDone = true; if (this.onTop) this.onTop(); }
      if (this.liftT >= this.T.liftS * 2) { this.phase = 'idle'; this.after(); }
      return;
    }
    if (this.phase === 'drive') {
      this.mover.step(dt);
      if (this.mover.done) { this.node = this.target; this.phase = 'idle'; this.arrive(); }
      return;
    }
    // idle at a node: only N0 waits
    if (this.node === 0) {
      this.idleFor += dt;
      this.waitT -= dt;
      if (this.waitT <= 0) { this.waitT = this.T.checkS; this.arrive(); }
    } else this.arrive();
    void m;
  }

  /** decide what to do at the node just reached */
  arrive() {
    const m = this.m, k = this.node;
    if (k === 0) {
      if (!this.load) {
        const job = m.outJob();
        if (job) {
          this.idleFor = 0;
          // lift a pallet of the order off the rack (the goods were picked by the pickers; the pallet is staged here)
          const n = Math.min(m.tune.pallet, job.order.n() - job.order.loaded - (job.order.onFork || 0));
          job.order.onFork = (job.order.onFork || 0) + n;
          this.lift(() => { this.load = { kind: 'out', order: job.order, n, dock: job.dock }; m.view({ t: 'fork', op: 'pick', at: 'rack' }); });
          this.after = () => this.drive(0, 1);
          return;
        }
        if (m.inJob(null)) { this.idleFor = 0; this.drive(0, 1); return; }
        const tidy = this.T.tidyS;
        // only in a quiet moment: nothing on its way into a bay
        if (tidy && this.idleFor >= tidy && !m.docks.list.some((v) => v.dock && (v.st === 'in' || v.st === 'docked'))) {
          this.idleFor = 0;
          this.lift(() => { this.load = { kind: 'tidy', n: 0 }; m.view({ t: 'fork', op: 'pick', at: 'rack', tidy: true }); });
          this.after = () => this.drive(0, 1);
          return;
        }
        this.phase = 'idle'; this.node = 0; this.after = () => {};
        return;
      }
      this.drive(0, 1);
      return;
    }
    if (k === 1 || k === 4) {
      const bay = k === 1 ? 2 : 1, spur = k === 1 ? 2 : 5, skip = k === 1 ? 3 : 6;
      if (this.wantsBay(bay)) { this.drive(k, spur); return; }
      // skip the spur: N3 / N6 stand where N1 / N4 stand
      this.node = skip;
      this.drive(skip, skip + 1);
      return;
    }
    if (k === 2 || k === 5) {
      const bay = k === 2 ? 2 : 1;
      const v = m.dockVehicle(bay);
      if (this.load && this.load.kind === 'out' && v && v.order === this.load.order) {
        const L = this.load;
        this.lift(() => {
          L.order.loaded += L.n; L.order.onFork = Math.max(0, (L.order.onFork || 0) - L.n);
          this.load = null; this.pallets.out++;
          m.view({ t: 'fork', op: 'drop', at: 'dock', bay });
        });
      } else if (!this.load && v && v.ship && v.ship.n() > 0) {
        this.lift(() => {
          const items = v.ship.takePallet(m.tune.pallet);
          let n = 0; for (const q in items) n += items[q];
          if (n) this.load = { kind: 'in', ship: v.ship, items, n, dock: bay };
          m.view({ t: 'fork', op: 'pick', at: 'dock', bay });
        });
      } else this.lift(null);              // nothing there any more: a little check of the bay
      this.after = () => this.drive(k, k + 1);
      return;
    }
    if (k === 8) {
      const L = this.load;
      if (L && L.kind === 'in') {
        this.lift(() => { m.putAway(L.items); this.load = null; this.pallets.in++; m.view({ t: 'fork', op: 'drop', at: 'rack' }); });
        this.after = () => this.drive(8, 9);
        return;
      }
      if (L && L.kind === 'tidy') {
        this.lift(() => { this.load = null; this.pallets.tidy++; m.view({ t: 'fork', op: 'drop', at: 'rack', tidy: true }); });
        this.after = () => this.drive(8, 9);
        return;
      }
      if (L && L.kind === 'out') {
        // its vehicle went away without it (cannot happen in normal play): the pallet goes back to the racks
        this.lift(() => { m.unstage(L.order, L.n); this.load = null; });
        this.after = () => this.drive(8, 9);
        return;
      }
      this.drive(8, 9);
      return;
    }
    if (k === 9) { this.laps++; this.node = 0; this.arrive(); return; }
    this.drive(k, k + 1);
  }

  wantsBay(bay) {
    const m = this.m, v = m.dockVehicle(bay);
    if (!v) return false;
    if (this.load) return this.load.kind === 'out' && this.load.dock === bay && v.order === this.load.order;
    return !!(v.ship && v.ship.n() > 0);
  }
}

// ================================================================================================== vehicles
const FAMILY = (key) => (/^delivery_van/.test(key) ? 'delivery_van' : /^truck_cargo/.test(key) ? 'truck_cargo' : key);

export class Docks {
  constructor(m) {
    this.m = m;
    this.list = [];                  // vehicles on the stage or on their way
    this.bay = { 1: null, 2: null }; // vehicle id per bay (reserved from the start of its entry)
    this.door = { 1: { st: 'closed', t: 0 }, 2: { st: 'closed', t: 0 } };
    this.seq = 0;
  }
  add(v) { v.id = 'v' + (++this.seq); v.st = 'road'; v.alpha = 0; this.list.push(v); return v; }
  get(id) { return this.list.find((v) => v.id === id) || null; }
  at(bay) { const id = this.bay[bay]; const v = id && this.get(id); return v && v.st === 'docked' ? v : null; }
  /** door frame 0..5 (0 closed, 5 rolled up) */
  doorFrame(bay) {
    const d = this.door[bay], S = 0.75;
    if (d.st === 'open') return 5;
    if (d.st === 'opening') return Math.min(5, Math.floor((d.t / S) * 6));
    if (d.st === 'closing') return Math.max(0, 5 - Math.floor((d.t / S) * 6));
    return 0;
  }
  setDoor(bay, open) {
    const d = this.door[bay];
    if (open && (d.st === 'closed' || d.st === 'closing')) { d.st = 'opening'; d.t = 0; this.m.view({ t: 'door', bay, open: true }); }
    if (!open && (d.st === 'open' || d.st === 'opening')) { d.st = 'closing'; d.t = 0; this.m.view({ t: 'door', bay, open: false }); }
  }

  /**
   * a free bay for a vehicle, or 0. As in the art's forklift story (pick at the food rack -> load at dock 2 -> unload
   * at dock 1 -> put away at the tools rack): outbound (owners' vans, the centre's van) load at bay 2, inbound
   * (trucks, pickup vans) unload at bay 1 — one lap of the loop then moves a pallet out AND a pallet in. Either may
   * borrow the other bay while nobody of the other kind waits.
   */
  freeBay(v, waiting) {
    const inbound = v.role === 'truck' || v.role === 'pickup';
    const own = inbound ? 1 : 2, other = inbound ? 2 : 1;
    if (!this.bay[own]) return own;
    const otherWaits = waiting.some((q) => q !== v && ((q.role === 'truck' || q.role === 'pickup') !== inbound));
    if (!this.bay[other] && !otherWaits) return other;
    return 0;
  }
  /** the dock lane holder (a vehicle id) — one manoeuvre at a time */
  zoneFree(v) { return !this.zone || this.zone === v.id; }

  update(dt) {
    const m = this.m, T = m.tune, Z = m.geo.zone;
    for (const b of [1, 2]) { const d = this.door[b]; if (d.st === 'opening' || d.st === 'closing') { d.t += dt; if (d.t >= 0.75) { d.st = d.st === 'opening' ? 'open' : 'closed'; d.t = 0; } } }
    // vehicles that have arrived and wait for a bay: outbound first, then the one waiting longest. A new one comes on
    // only when the one before it is a van's length down the street (FOLLOW px)
    const FOLLOW = 260;
    const ins = this.list.filter((q) => q.st === 'in' && q.onStreet);
    const gateClear = ins.every((q) => q.mover.doneDist() >= FOLLOW);
    const waiting = this.list.filter((q) => q.st === 'road' && q.roadT <= 0);
    waiting.sort((a, b) => ((a.role === 'truck' || a.role === 'pickup') - (b.role === 'truck' || b.role === 'pickup')) || (a.roadT - b.roadT));
    for (const v of this.list) if (v.st === 'road') v.roadT -= dt;
    if (gateClear && m.working()) {
      for (const v of waiting) {
        const bay = this.freeBay(v, waiting);
        if (!bay) continue;
        this.bay[bay] = v.id; v.dock = bay;
        const R = m.geo.routes[(v.role === 'owner' && !v.noDrop ? 'owner' : FAMILY(v.key)) + ':' + bay] || m.geo.routes['delivery_van:' + bay];
        let spec = R.in;
        if (v.via && v.via.length) spec = [spec[0]].concat(v.via.map((s) => ({ p: s.p, dwell: s.dwell, tag: s.tag })), spec.slice(1));
        v.mover = new Mover(driveLegs(spec, T.van.speed, T.van.turnS, T.van.reverse));
        v.zoneLeg = v.mover.legAt(Z.enter);
        v.st = 'in'; v.onStreet = true; v.tags = new Set();
        m.view({ t: 'veh', op: 'in', id: v.id, key: v.key, bay });
        break;
      }
    }
    const toCorner = (q) => { let n = 0; for (let k = q.mover.i; k < q.zoneLeg; k++) { const L = q.mover.legs[k]; n += Math.hypot(L.b[0] - L.a[0], L.b[1] - L.a[1]) - (k === q.mover.i ? q.mover.s : 0); } return n; };
    // the street before the dock lane: in line, a van's length apart
    const street = this.list.filter((q) => q.st === 'in' && q.onStreet).sort((a, b) => b.mover.doneDist() - a.mover.doneDist());
    for (const v of this.list.slice()) {
      if (v.st === 'in') {
        v.alpha = Math.min(1, v.alpha + dt / 0.6);
        let stopAt = -1, room = Infinity;
        if (v.onStreet) {
          const k = street.indexOf(v);
          if (k > 0) room = Math.max(0, street[k - 1].mover.doneDist() - FOLLOW - v.mover.doneDist());
          if (v.zoneLeg >= 0 && this.zone !== v.id) {
            // only the first in line may take the dock lane, and only when it is nearly at the corner
            if (k === 0 && !this.zone && toCorner(v) < 160) this.zone = v.id;
            if (this.zone !== v.id) stopAt = v.zoneLeg;
          }
        }
        v.mover.step(dt, stopAt, room);
        if (v.onStreet && v.zoneLeg >= 0 && v.mover.i >= v.zoneLeg && this.zone === v.id) v.onStreet = false;
        const L = v.mover.leg;
        if (L && L.dwell && L.tag && !v.tags.has(L.tag) && v.mover.i !== stopAt) { v.tags.add(L.tag); m.curbStop(v, L.tag); }
        if (v.mover.reversing() && !v.backing) { v.backing = true; this.setDoor(v.dock, true); }
        if (v.mover.done) {
          v.st = 'docked'; v.backing = false; v.dockT = 0;
          if (this.zone === v.id) this.zone = null;
          m.docked(v); m.view({ t: 'veh', op: 'docked', id: v.id, bay: v.dock });
        }
        continue;
      }
      if (v.st === 'docked') {
        v.dockT += dt;
        if (!v.leaveT && m.vehicleDone(v)) { v.leaveT = T.van.leaveWaitS; this.setDoor(v.dock, false); }
        if (v.leaveT) {
          v.leaveT -= dt;
          if (v.leaveT <= 0 && !this.zone) {
            const R = m.geo.routes[(v.role === 'owner' && !v.noDrop ? 'owner' : FAMILY(v.key)) + ':' + v.dock] || m.geo.routes['delivery_van:' + v.dock];
            v.mover = new Mover(driveLegs(R.out, T.van.speed, T.van.turnS, T.van.reverse));
            v.tags = new Set();
            v.zoneOut = v.mover.legAt(Z.leave);
            this.zone = v.id;
            v.st = 'out';
            this.bay[v.dock] = null;
            m.view({ t: 'veh', op: 'out', id: v.id, bay: v.dock });
          } else if (v.leaveT <= 0) v.leaveT = 0.15;
        }
        continue;
      }
      if (v.st === 'out') {
        // past the dock lane, in line on the west lane (a van picking up its owner at the kerb holds the ones behind)
        let room = Infinity;
        if (this.zone !== v.id) {
          const p = v.mover.pos();
          for (const q of this.list) {
            if (q === v || q.st !== 'out' || this.zone === q.id) continue;
            const qp = q.mover.pos();
            if (qp[0] < p[0]) room = Math.min(room, Math.max(0, Math.hypot(qp[0] - p[0], qp[1] - p[1]) - FOLLOW));
          }
        }
        v.mover.step(dt, -1, room);
        const L = v.mover.leg;
        if (L && L.dwell && L.tag && !v.tags.has(L.tag)) { v.tags.add(L.tag); m.curbStop(v, L.tag); }
        // off the dock lane once it drives along the west lane (past the corner turn)
        if (this.zone === v.id && (v.zoneOut < 0 || v.mover.i > v.zoneOut)) this.zone = null;
        const left = v.mover.left();
        if (left < 110) v.alpha = Math.max(0, left / 110);
        if (v.mover.done) { v.st = 'gone'; if (this.zone === v.id) this.zone = null; m.vehicleGone(v); this.list.splice(this.list.indexOf(v), 1); }
      }
    }
  }
  /** vehicles on the dock lane right now (for tests: never two manoeuvring at once) */
  inZone() { return this.list.filter((v) => (v.st === 'in' && !v.onStreet) || (v.st === 'out' && this.zone === v.id)).length; }
}

// ================================================================================================== queue + owners
/**
 * The settlement queue: 7 places (customerPoints 0 = the counter, 1–3 inside, 4–6 outside toward the street).
 * Corridor (outside -> counter): q6, q5, q4, door, q3, q2, q1, q0; people walk along it, so nobody walks through
 * a wall. Owners: van owners step out of their docked van; walk-ins come along the sidewalk from the west.
 */
export class Queue {
  constructor(m) {
    this.m = m;
    this.agents = [];
    this.slots = [];                   // agent ids by place
    this.seq = 0;
    this.settling = null;              // { agent, t, stamped }
  }
  get G() { return this.m.geo; }
  corridor() { const q = this.G.queue; return [q[6].p, q[5].p, q[4].p, this.G.door, q[3].p, q[2].p, q[1].p, q[0].p]; }
  ci(slot) { return slot >= 4 ? 6 - slot : 7 - slot; }
  slotPos(k) { return this.G.queue[k].p; }
  room() { return this.slots.length < this.G.queue.length; }
  get(id) { return this.agents.find((a) => a.id === id) || null; }

  add(a) { a.id = 'a' + (++this.seq); this.agents.push(a); return a; }

  /** walk legs along the corridor from index i to index j */
  along(i, j) { const C = this.corridor(), pts = []; const s = i <= j ? 1 : -1; for (let k = i; k !== j + s; k += s) pts.push(C[k]); return pts; }

  join(a, from) {
    const k = this.slots.length;
    this.slots.push(a.id);
    a.slot = k; a.st = 'queue';
    const target = this.ci(k);
    let pts = from.slice();
    // a van owner reaches the corridor at q4 (index 2) from the forecourt, a walk-in at q6 (index 0)
    const entry = a.kind === 'walk' ? 0 : 2;
    if (target <= entry) pts.push(this.corridor()[target]);
    else pts = pts.concat(this.along(entry, target));
    a.mover = new Mover(walkLegs(pts, this.m.tune.walk));
  }

  shift() {
    // the head left: everybody moves up one place along the corridor
    this.slots.shift();
    this.slots.forEach((id, k) => {
      const a = this.get(id); if (!a) return;
      const from = a.mover && !a.mover.done ? a.mover.pos() : this.corridor()[this.ci(a.slot)];
      const pts = [from].concat(this.along(this.ci(a.slot), this.ci(k)).slice(1));
      a.slot = k;
      a.mover = new Mover(walkLegs(pts, this.m.tune.walk));
    });
  }

  update(dt) {
    const m = this.m, T = m.tune;
    for (const a of this.agents.slice()) {
      if (a.mover) a.mover.step(dt);
      switch (a.st) {
        case 'road':
          a.t -= dt;
          if (a.t <= 0 && m.working()) { a.st = 'come'; a.mover = new Mover(walkLegs([this.G.walkIn.from, this.G.walkIn.stand], T.walk)); }
          break;
        case 'come':
          if (a.mover.done && this.room()) this.join(a, [this.G.walkIn.stand]);
          break;
        case 'walkIn':
          if (a.mover.done && this.room()) this.join(a, [a.walk[a.walk.length - 1]]);
          break;
        case 'queue':
          if (a.slot === 0 && a.mover.done && !this.settling) {
            const o = m.orderOf(a);
            if (o && (a.kind !== 'walk' || o.st === 'ready')) { this.settling = { a, t: 0, stamped: false }; a.st = 'settle'; m.view({ t: 'settle', op: 'start', agent: a.id }); }
            else a.waiting = true;
          }
          break;
        case 'settle': {
          const s = this.settling;
          s.t += dt;
          if (!s.stamped && s.t >= T.stampAt) { s.stamped = true; m.view({ t: 'stamp', agent: a.id }); }
          if (s.t >= T.settleS) {
            this.settling = null;
            m.settleAt(a);
            this.shift();
            // back out along the corridor to the door, then to the van / the sidewalk
            const C = this.corridor();
            let pts = this.along(7, 3);
            if (a.kind === 'walk') { a.carry = true; pts = pts.concat([[C[3][0] + 6, C[3][1] + 40], [this.G.walkIn.stand[0] + 40, this.G.walkIn.stand[1] + 6], this.G.walkIn.from]); a.st = 'leave'; }
            else { pts = pts.concat(this.G.walks.pick); a.st = 'toCurb'; }
            a.mover = new Mover(walkLegs(pts, T.walk));
          }
          break;
        }
        case 'toCurb':
          if (a.mover.done) { a.st = 'curb'; a.lastDir = 'SW'; }
          break;
        case 'curb':
          break;
        case 'leave':
          if (a.mover.done) { a.st = 'gone'; m.walkerGone(a); this.agents.splice(this.agents.indexOf(a), 1); }
          break;
        case 'inVan':
          break;
        default: break;
      }
    }
  }
  /** an owner's drawing info (rel px) */
  info(a) {
    const p = a.mover ? a.mover.pos() : (a.st === 'queue' ? this.slotPos(a.slot) : [0, 0]);
    let dir = a.mover && a.mover.moving() ? a.mover.dir() : null;
    if (!dir) dir = a.st === 'queue' || a.st === 'settle' ? this.G.queue[Math.max(0, a.slot || 0)].dir : a.st === 'curb' ? 'SW' : (a.lastDir || 'S');
    a.lastDir = dir;
    return { id: a.id, x: p[0], y: p[1], dir, moving: !!(a.mover && a.mover.moving()), st: a.st, carry: !!a.carry, look: a.look, kind: a.kind, waiting: !!a.waiting };
  }
}

// ================================================================================================== staff beats
/**
 * The staff's little work loops (cosmetic, deterministic). Roles from the manifest: clerk (counter), packer x2
 * (conveyor, packing table), picker x3 (between the racks), dockhand (outside between the bays).
 *   beat = { name, anim, dir, off: [dx, dy] (a small step from the staff point), t, dur }
 */
export class Staff {
  constructor(m) {
    this.m = m;
    this.list = m.geo.staff.map((s, k) => ({ k, role: s.role, p: s.p.slice(), dir: s.dir, band: s.band, beat: null, rng: stream(m.seed, 'staff:' + k), n: 0 }));
  }
  update(dt, ctx) {
    for (const s of this.list) {
      if (s.beat) { s.beat.t += dt; if (s.beat.t < s.beat.dur) continue; }
      s.beat = this.next(s, ctx);
      s.n++;
    }
  }
  next(s, ctx) {
    const r = s.rng, B = (name, anim, dur, dir = s.dir, off = [0, 0]) => ({ name, anim, dur, dir, off, t: 0 });
    // toward the rack the picker faces: a 9 px step in its facing (NE: up-right, NW: up-left)
    const step = { NE: [8, -4], NW: [-8, -4], SW: [-8, 4], SE: [8, 4] }[s.dir] || [0, 0];
    switch (s.role) {
      case 'picker':
        if (ctx.picking) {
          const phase = s.n % 3;
          if (phase === 0) return B('reach', 'point', 0.9 + r.range(0, 0.4), s.dir, step);
          if (phase === 1) return B('carry', 'carry_box', 1.1 + r.range(0, 0.3), s.dir === 'NW' ? 'SE' : 'SW');
          return B('drop', 'idle', 0.35, s.dir === 'NW' ? 'SE' : 'SW');
        }
        { const q = r.next(); if (q < 0.5) return B('idle', 'idle', 2 + r.range(0, 3)); if (q < 0.75) return B('think', 'think', 1.6); if (q < 0.9) return B('sweep', 'sweep', 3.0, s.dir === 'NW' ? 'SW' : 'SE'); return B('look', 'idle', 1.5, s.dir === 'NE' ? 'SE' : 'SW'); }
      case 'packer':
        if (ctx.packing) return s.n % 2 === 0 ? B('pack', 'carry_box', 1.0 + r.range(0, 0.3)) : B('tape', 'talk', 0.8);
        { const q = r.next(); if (q < 0.55) return B('idle', 'idle', 2 + r.range(0, 2)); if (q < 0.8) return B('chat', 'talk', 2.0); return B('think', 'think', 1.4); }
      case 'clerk':
        if (ctx.settling) return B('serve', 'talk', 0.8);
        { const q = r.next(); if (q < 0.45) return B('idle', 'idle', 2 + r.range(0, 2)); if (q < 0.7) return B('phone', 'phone', 2.4); return B('ledger', 'think', 1.8); }
      case 'dockhand':
        if (ctx.backing) return B('guide', 'wave', 0.9, ctx.backingDir || 'SE');
        if (ctx.docked) return r.next() < 0.5 ? B('point', 'point', 1.2, 'SE') : B('wait', 'idle', 1.4, 'SE');
        { const q = r.next(); if (q < 0.6) return B('idle', 'idle', 2 + r.range(0, 2)); if (q < 0.85) return B('sweep', 'sweep', 3.0, 'SW'); return B('stretch', 'happy', 1.2, 'S'); }
      default: return B('idle', 'idle', 3);
    }
  }
  info() {
    return this.list.map((s) => {
      const b = s.beat || { anim: 'idle', dir: s.dir, off: [0, 0], name: 'idle' };
      // the reach step eases in and out
      const k = b.name === 'reach' ? Math.sin(Math.min(1, b.t / Math.max(0.01, b.dur)) * Math.PI) : 0;
      return { k: s.k, role: s.role, x: s.p[0] + b.off[0] * k, y: s.p[1] + b.off[1] * k, dir: b.dir, anim: b.anim, beat: b.name, band: s.band };
    });
  }
}

export { dist, dir8, lerp };
