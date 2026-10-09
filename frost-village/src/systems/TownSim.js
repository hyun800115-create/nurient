// TownSim (v4, docs/v4_plan.md §5.2–5.4): the ~100 people of 솔방울 마을 and their days.
// Plain objects, an event heap on the 600 s day (DayClock), routes cached per (place, place) over the walk
// graph (RoadNet), positions computed only when asked (analytic off screen). People near the view get a body:
// a pooled Character whose sprite is a paper doll (DollSprite / DollPool decide full, lite or dot rig).
// Citizens are never in gs.agents (no O(n²) separation); train visitors are (see Visitor.js).

import { BALANCE } from '../data/balance.js';
import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { TF, mulberry32 } from '../core/Townfolk.js';
import { Character } from '../entities/Character.js';
import { Roads } from './Roads.js';
import { line, t as tr, townName } from '../data/strings.js';
import { DIR_BASE, dirFromVec } from '../core/Iso.js';
import { WORLD } from '../data/world.js';

export const KINDS = ['student', 'teen', 'shopkeeper', 'civic', 'adult', 'elder', 'builder'];
const COUNTS = { student: 18, teen: 6, shopkeeper: 7, civic: 13, adult: 36, elder: 17, builder: 3 };   // 100
const CIVIC = ['teacher', 'teacher', 'teacher', 'police', 'police', 'postal', 'postal', 'doctor', 'nurse', 'fire', 'fire', 'mayor', 'station'];
const FOODS_FAV = ['item_bread', 'item_fish_cooked', 'item_meat_cooked', 'item_bread', 'item_can'];
export const F = { ON_TRAIN: 1, IN_VILLAGE: 2, WAITING: 4, DISTRICT: 8 };
const DISTRICT_KINDS = new Set(['keeper', 'resident']);
const HOUR = 25;               // s per clock hour (600 s day)
const TIER_EVERY = 0.25;
const MAX_CHAT = 2, MAX_EMOTE = 3;

/** a tiny binary min-heap of [time, id] */
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(t, id) {
    const a = this.a; a.push([t, id]);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  peek() { return this.a[0]; }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; }
    }
    return top;
  }
}

/** a body: a Character with a doll sprite, reused for whoever is materialised */
class TownBody extends Character {
  constructor(gs, c) {
    super(gs, 'tf:' + c.person.base, c.x, c.y, { person: c.person, radius: 12 });
    this.noXray = false;
    this.c = null;
  }
  wear(c) {
    const key = 'tf:' + c.person.base;
    if (key !== this.key) { this.key = key; this.def = Assets.charDef(key); const sh = this.def.shadow || [46, 18]; this.shadow.setDisplaySize(sh[0] * 1.15, sh[1] * 1.3); }
    this.sprite.setPerson(c.person, key);
    this.animKey = ''; this.animName = ''; this._faced = null;
    this.c = c;
    this.alive = true;
    this.sprite.setVisible(true);
    this.sprite.setAlpha(1);
    this.shadow.setVisible(true).setAlpha(1);
    this.sprite.lift = 0;
    this.stack.clear(this.gs.effects);
  }
  park() {
    this.c = null;
    this.alive = false;            // (bubbles drop it)
    this.sprite.setVisible(false);
    this.shadow.setVisible(false);
    this.stack.clear(this.gs.effects);
  }
}

export class TownSim {
  constructor(nb, opts = {}) {
    this.nb = nb;
    this.gs = nb.gs;
    this.B = BALANCE.v4;
    this.L = this.B.townLife;
    this.seed = (opts.seed >>> 0) || this.B.town.seed || 2611;
    this.T = 0;
    this.started = false;
    this.places = {};
    this.buildPlaces(nb.buildings);
    this.graph = new Roads(() => true, nb.roadNet.walkGraph(), () => true);
    this.routes = new Map();
    this.citizens = [];
    this.heap = new Heap();
    this.bodies = [];
    this.free = [];
    this.tierT = 0;
    this.log = [];
    this.stats = { live: 0, walking: 0, inside: 0, out: 0, away: 0, ms: 0, pops: 0 };
    this.populate(this.B.town.people || 100, opts.extra || []);
    this.lastHour = -1;
    this.chatT = 3;
    this.townX = WORLD.territory.town.rect[0];
  }

  // ================================================================ places
  buildPlaces(blds) {
    const P = this.places;
    const add = (id, bld, kind, spots, cap, door) => { P[id] = { id, bld, kind, spots: spots.length ? spots : [door], door: door || spots[0], cap: cap || spots.length || 1, occ: 0 }; };
    for (const b of blds) {
      const door = b.door || b.stopPt || { x: b.x, y: b.y + 40 };
      add(b.id + ':in', b.id, 'in', [door], 999, door);
      if (b.staff && b.staff.length) add(b.id + ':staff', b.id, 'staff', b.staff, b.staff.length, door);
      if (b.customer && b.customer.length) {
        // the line in front of a shop: its customer points, then a few more behind them
        const cp = b.customer.slice();
        const last = cp[cp.length - 1], prev = cp[cp.length - 2] || { x: last.x + 15, y: last.y - 12 };
        for (let k = 1; k <= 4; k++) cp.push({ x: last.x + (last.x - prev.x) * k, y: last.y + (last.y - prev.y) * k, dir: last.dir });
        add(b.id + ':line', b.id, 'line', cp, cp.length, door);
      }
      if (b.gather && b.gather.length) add(b.id + ':gather', b.id, 'gather', b.gather, b.gather.length * 2, door);
      if (b.play && b.play.length) add(b.id + ':play', b.id, 'play', b.play, b.play.length * 3, door);
      if (b.seat && b.seat.length) add(b.id + ':seat', b.id, 'seat', b.seat, b.seat.length, door);
      if (b.wait && b.wait.length) add(b.id + ':wait', b.id, 'wait', b.wait, b.wait.length * 3, door);
      if (b.board && b.board.length) add(b.id + ':board', b.id, 'board', b.board, b.board.length * 4, door);
    }
    // the school yard is its play points; the fountain square is its gather + seat points
    this.byRole = {};
    for (const b of blds) (this.byRole[b.role] = this.byRole[b.role] || []).push(b);
  }
  place(id) { return this.places[id] || null; }
  bld(role, k) { const l = this.byRole[role] || []; return l.length ? l[((k || 0) % l.length + l.length) % l.length] : null; }

  // ================================================================ people
  populate(n, extra) {
    const r = mulberry32(this.seed);
    const cap = {};
    for (const b of this.nb.buildings) if (b.cfg.home) cap[b.id] = b.cfg.home;
    const apts = this.nb.buildings.filter((b) => b.role === 'home');
    const shops = this.byRole.shop || [];
    let aptK = 0;
    const scale = n / 100;
    const make = (kind, extraFields) => {
      const id = this.citizens.length;
      const cr = mulberry32((this.seed * 2654435761 + id * 97 + 13) >>> 0);
      const c = Object.assign({ id, kind, role: null, person: null, name: townName(id), age: 30, home: null, work: null, fav: FOODS_FAV[Math.floor(cr() * FOODS_FAV.length)],
        act: 'home', place: null, spot: null, wakeT: 0, route: null, t0: 0, speed: 60 + cr() * 30, lane: (cr() - 0.5) * 20, jit: (cr() - 0.5) * 2,
        lod: 3, flags: 0, body: null, visits: 0, x: 0, y: 0, state: 'in', seg: -1, plan: null, day: -1, rng: cr, regular: false }, extraFields || {});
      this.citizens.push(c);
      return c;
    };
    this.make = make;
    const civ = CIVIC.slice();
    const order = [];
    for (const k of KINDS) for (let q = 0; q < Math.round(COUNTS[k] * scale); q++) order.push(k);
    while (order.length > n) order.pop();
    while (order.length < n) order.push('adult');
    let civK = 0, shopK = 0;
    for (const kind of order) {
      const c = make(kind);
      const cr = c.rng;
      // look, age, home, work
      if (kind === 'student') { c.person = TF.person(cr, 'student'); c.age = 7 + Math.floor(cr() * 6); }
      else if (kind === 'teen') { c.person = TF.person(cr, cr() < 0.5 ? 'student' : null); if (TF.age(c.person.base) === 'elder') c.person = TF.person(cr, 'student'); c.age = 13 + Math.floor(cr() * 5); }
      else if (kind === 'shopkeeper') {
        const sh = shops[shopK++ % Math.max(1, shops.length)];
        c.work = sh ? sh.id : null; c.home = sh ? sh.id : null;
        c.person = TF.person(cr, sh && sh.key === 'cafe' ? 'barista' : sh && sh.key === 'hair_salon' ? 'hairdresser' : null);
        if (TF.age(c.person.base) === 'child') c.person = TF.person(cr, 'barista');
        c.age = 28 + Math.floor(cr() * 30);
      } else if (kind === 'civic') {
        c.role = civ[civK++ % civ.length];
        const preset = { teacher: 'teacher', police: 'police', postal: 'postal', doctor: 'doctor', nurse: 'nurse', fire: 'factory', mayor: null, station: 'station' }[c.role];
        c.person = TF.person(cr, preset);
        if (TF.age(c.person.base) === 'child') c.person = TF.person(cr, 'teacher');
        if (c.role === 'fire' && c.person.colors) c.person.colors.hat = '#C8402E';
        c.age = 26 + Math.floor(cr() * 34);
        c.work = { teacher: 't_school', police: 't_police', postal: 't_post', doctor: 't_clinic', nurse: 't_clinic', fire: 't_fire', mayor: 't_hall', station: 't_station' }[c.role] || null;
        if (c.role === 'mayor') c.home = 't_hall';
        if (c.role === 'fire') c.home = 't_fire';
        if (c.role === 'station') c.home = 't_station';
      } else if (kind === 'elder') { c.person = TF.person(cr, null); for (let k = 0; k < 6 && TF.age(c.person.base) !== 'elder'; k++) c.person = TF.person(cr, null); c.age = 64 + Math.floor(cr() * 22); c.fav = cr() < 0.6 ? 'item_bread' : c.fav; }
      else if (kind === 'builder') { c.person = TF.person(cr, 'factory'); c.age = 30 + Math.floor(cr() * 25); }
      else { c.person = TF.person(cr, null); for (let k = 0; k < 6 && TF.age(c.person.base) !== 'adult'; k++) c.person = TF.person(cr, null); c.age = 22 + Math.floor(cr() * 40); }
      if (c.home && cap[c.home] > 0) cap[c.home]--;
      if (!c.home) {
        // a few students / elders live above the shops (the shop households), everyone else in the apartments
        let h = null;
        if (kind === 'student' || kind === 'elder') h = shops.find((sb) => cap[sb.id] > 0);
        if (!h) h = apts.find((ab) => cap[ab.id] > 0) || apts[aptK++ % Math.max(1, apts.length)];
        c.home = h ? h.id : 't_apt1';
        if (cap[c.home] > 0) cap[c.home]--;
      }
      c.person.id = c.id;
    }
    this.base = this.citizens.length;
    // people who came later (saved as [id, kind, home]): newcomers of the town (읍), founders' households and
    // house residents in the station district (a founder who was a townsperson keeps his id: converted)
    // ((v4 review L3) a saved home that is not a town building or a district lot (an edited / old save) is dropped:
    //  a district person without one is skipped, a townsperson gets an ordinary home)
    const V4 = WORLD.v4 || {}, known = (h) => !!h && !!((V4.lots && V4.lots[h]) || (V4.town && V4.town.buildings.some((b) => b.id === h)));
    for (const e of extra) {
      if (!Array.isArray(e)) continue;
      const kind = String(e[1] || 'adult'), home = known(e[2]) ? e[2] : null;
      if (DISTRICT_KINDS.has(kind) && !home) continue;
      if (DISTRICT_KINDS.has(kind) && Number.isFinite(e[0]) && e[0] < this.base && this.citizens[e[0]]) { this.toDistrict(this.citizens[e[0]], kind, home); continue; }
      this.addCitizen(kind, home);
    }
  }

  /** a new person: a town kind (adult, elder, student, teen) or a district kind (keeper, resident) */
  addCitizen(kind, home) {
    const district = DISTRICT_KINDS.has(kind);
    const c = this.make(district ? kind : (KINDS.indexOf(kind) >= 0 ? kind : 'adult'), { flags: district ? F.DISTRICT : 0 });
    const cr = c.rng;
    const want = kind === 'student' ? 'child' : kind === 'elder' ? 'elder' : 'adult';
    c.person = TF.person(cr, kind === 'student' ? 'student' : null);
    for (let k = 0; k < 6 && TF.age(c.person.base) !== want && kind !== 'resident'; k++) c.person = TF.person(cr, kind === 'student' ? 'student' : null);
    c.person.id = c.id;
    c.age = want === 'child' ? 7 + Math.floor(cr() * 6) : want === 'elder' ? 64 + Math.floor(cr() * 22) : kind === 'teen' ? 13 + Math.floor(cr() * 5) : 24 + Math.floor(cr() * 36);
    if (TF.age(c.person.base) === 'child' && kind === 'resident') c.age = 6 + Math.floor(cr() * 7);
    c.home = home || (this.nb.buildings.find((b) => b.role === 'home') || { id: 't_apt1' }).id;
    if (district) { c.work = kind === 'keeper' ? c.home : null; this.ensureLot(c.home); }
    return c;
  }

  /** a townsperson becomes a station-district citizen (the founder of a shop moves in above it) */
  toDistrict(c, kind, home) {
    c.flags = (c.flags | F.DISTRICT) & ~(F.WAITING);
    c.kind = DISTRICT_KINDS.has(kind) ? kind : 'resident';
    c.home = home || c.home;
    c.work = c.kind === 'keeper' ? c.home : null;
    c.plan = null; c.day = -1; c.trip = false;
    this.ensureLot(c.home);
  }

  /** places for a lot of the station district (door, the shopkeeper's spot, a short line), from its door point */
  ensureLot(id, opts = {}) {
    if (!id) return null;
    if (this.places[id + ':in'] && !opts.staff && !opts.customers) return this.places[id + ':in'];
    const sp = this.nb.roadNet && this.nb.roadNet.doorSpur ? this.nb.roadNet.doorSpur[id] : null;
    const lot = WORLD.v4.lots[id];
    const door = sp ? { x: sp.x, y: sp.y } : lot ? { x: lot.x, y: lot.y + 40 } : null;
    if (!door) return null;
    // in front of the door is toward -j: screen (−64, +32) per cell
    const front = (d, s) => ({ x: door.x - 64 * d + 40 * s, y: door.y + 32 * d + 20 * s, dir: 'NE' });
    const staff = opts.staff ? [Object.assign({ dir: 'SW' }, opts.staff)] : [Object.assign(front(0.5, -0.6), { dir: 'S' })];
    const line = opts.customers && opts.customers.length ? opts.customers.map((q) => Object.assign({ dir: 'NE' }, q)) : [front(1.2, 0.3), front(1.7, 0.6), front(2.2, 0.9), front(2.7, 1.2)];
    this.places[id + ':in'] = { id: id + ':in', bld: id, kind: 'in', spots: [door], door, cap: 999, occ: 0 };
    this.places[id + ':staff'] = { id: id + ':staff', bld: id, kind: 'staff', spots: staff, door, cap: staff.length, occ: 0 };
    this.places[id + ':line'] = { id: id + ':line', bld: id, kind: 'line', spots: line, door, cap: line.length + 4, occ: 0 };
    return this.places[id + ':in'];
  }

  // ================================================================ B's API (docs/v4_plan.md §17.3)
  /** someone from the town comes by the next train (the mayor, founders, builders): handle.onArrive(actor => …) */
  sendByTrain(kind, opts) { return this.nb.sendByTrain(kind, opts); }

  /** n people move into lot homeId of the station district (a founder's household: opts.kind 'keeper' and
   *  opts.citizen = the founder who came by train; a house: residents). opts.staff {x, y} / opts.customers
   *  [{x, y}] = the shop's points (else made from the lot's door). Saved; they never ride the train. */
  addDistrictHome(homeId, n, opts = {}) {
    const out = [];
    this.ensureLot(homeId, opts);
    for (let k = 0; k < n; k++) {
      const kind = k === 0 && opts.kind === 'keeper' ? 'keeper' : 'resident';
      let c;
      if (k === 0 && opts.citizen && this.citizens[opts.citizen.id] === opts.citizen) {
        c = opts.citizen;
        c.flags &= ~(F.ON_TRAIN | F.IN_VILLAGE);
        c.sent = false; c.visitor = null;
        this.toDistrict(c, kind, homeId);
        if (Number.isFinite(opts.x)) { c.x = opts.x; c.y = opts.y; }
      } else {
        c = this.addCitizen(kind, homeId);
        const pl = this.places[homeId + ':in'];
        if (pl) { c.x = pl.door.x; c.y = pl.door.y; }
        // (v4-B) new neighbours of a house walk in from the town gate (opts.from)
        if (opts.from && Number.isFinite(opts.x)) { c.x = opts.x + (k % 2 ? 22 : -22); c.y = opts.y + k * 12; }
      }
      this.nb.extra.push([c.id, c.kind, homeId]);
      if (this.started) this.settle(c, this.T, (k === 0 || opts.from) && Number.isFinite(opts.x) ? { x: c.x, y: c.y, bld: null } : null);
      out.push(c);
    }
    return out;
  }

  /** (v4-B) does lot `id` have its household already? */
  districtOf(id) { for (const c of this.citizens) if ((c.flags & F.DISTRICT) && c.home === id) return true; return false; }

  /** people of the station district (founders' households + house residents) */
  districtPeople() { let n = 0; for (const c of this.citizens) if (c.flags & F.DISTRICT) n++; return n; }
  /** people of the town itself (100, 120 after 읍) */
  townPeople() { return this.citizens.length - this.districtPeople(); }

  /** the town grows to n people (읍): the newcomers come on the next trains and move into the apartments */
  growTo(n, instant) {
    const kinds = ['adult', 'student', 'adult', 'elder', 'teen', 'adult', 'student', 'elder', 'adult', 'adult'];
    const apts = this.nb.buildings.filter((b) => b.role === 'home');
    const out = [];
    while (this.townPeople() < Math.min(n, 200)) {
      const k = this.citizens.length;
      const c = this.addCitizen(kinds[k % kinds.length], apts.length ? apts[k % apts.length].id : null);
      this.nb.extra.push([c.id, c.kind, c.home]);
      out.push(c);
      if (instant || !this.nb.trainRuns()) { if (this.started) this.settle(c, this.T); continue; }
      // on the next train to the town, with their luggage
      c.flags |= F.ON_TRAIN; c.state = 'away'; c.act = 'train'; c.newcomer = true;
      this.nb.newcomers.push(c);
    }
    return out;
  }

  /** people near (x, y) (within r ground px, outdoors) come and stand in a ring around it for `secs` s (the
   *  ceremony); returns how many came */
  gather(x, y, r = 900, n = 30, secs = 14) {
    const id = 'gather:' + (this._gk = (this._gk || 0) + 1);
    const ring = [];
    for (let k = 0; k < n; k++) {
      const a = (k / Math.max(1, n)) * Math.PI * 2 + 0.3, rr = 150 + (k % 3) * 46;
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.5;
      ring.push({ x: px, y: py, dir: DIR_NAME[dirFromVec(x - px, y - py)] });
    }
    this.places[id] = { id, bld: null, kind: 'gather', spots: ring, door: ring[0], cap: n, occ: 0 };
    const h = this.hourOf(this.T), p = { x: 0, y: 0, dx: 0, dy: 0 };
    // the nearest people outdoors come (they stay `secs` once there, then go back to their day)
    const near = [];
    for (const c of this.citizens) {
      if ((c.flags & (F.ON_TRAIN | F.IN_VILLAGE)) || c.state === 'in' || c.state === 'away' || c.over) continue;
      this.pos(c, p);
      const d = Math.hypot(p.x - x, (p.y - y) * 2);
      if (d <= r) near.push([d, c, p.x, p.y]);
    }
    near.sort((a, b) => a[0] - b[0]);
    let k = 0;
    for (const [, c, px, py] of near) {
      if (k >= n) break;
      c.x = px; c.y = py;
      c.over = { place: id, act: 'cheer', mode: 'out', s: h, e: h + secs / HOUR, secs, run: 1.4 };
      this.go(c, c.over, this.T, { x: px, y: py, bld: null });
      k++;
    }
    return k;
  }

  population() { return this.citizens.length; }

  // ================================================================ clock + schedules
  hourOf(T) { return ((T / HOUR) % 24 + 24) % 24; }
  dayOf(T) { return Math.floor(T / (HOUR * 24)); }
  /** absolute clock time of hour h on day d */
  at(d, h) { return (d * 24 + h) * HOUR; }

  /** start the town at clock time T (the first train / a reload) */
  start(T) {
    this.T = T;
    this.started = true;
    for (const c of this.citizens) { if (c.flags & (F.ON_TRAIN | F.IN_VILLAGE)) continue; this.settle(c, T); }
  }

  /** the citizen's plan for day d: segments [{ s, e, act, place, mode, run }] covering 0..24 h */
  planDay(c, d) {
    const L = this.L, j = (c.jit || 0) * (L.jitter || 0.4);
    const S = [];
    const seg = (s, e, act, place, mode, extra) => { if (e > s) S.push(Object.assign({ s, e, act, place, mode }, extra || {})); };
    const home = (c.home || 't_apt1') + ':in';
    const r = mulberry32(((c.id + 1) * 7919 + d * 104729 + this.seed) >>> 0);
    const pick = (arr) => arr[Math.floor(r() * arr.length)];
    const shopsLine = (this.byRole.shop || []).filter((b) => this.places[b.id + ':line']).map((b) => b.id + ':line');
    const parkSpots = ['t_fountain:seat', 't_fountain:gather', 't_play:play', 't_sled:wait'].filter((p) => this.places[p]);
    const benches = Object.keys(this.places).filter((k) => /^prop_bench.*:seat$/.test(k));
    const kidFun = ['t_play:play', 't_fountain:gather', 't_play:play'].filter((p) => this.places[p]);
    switch (c.kind) {
      case 'student': case 'teen': {
        const S0 = L.school;
        // (kids hurry to school and run back in when the bell rings)
        seg(0, S0.leave + j * 0.25, 'sleep', home, 'in');
        seg(S0.leave + j * 0.25, S0.bell, 'school', 't_school:gather', 'out', { run: 1.25 });
        seg(S0.bell, S0.recess, 'class', 't_school:in', 'in', { run: 1.4 });
        seg(S0.recess, S0.recessEnd, 'recess', 't_school:play', 'out', { run: 1.4 });
        seg(S0.recessEnd, S0.lunch, 'class', 't_school:in', 'in', { run: 1.4 });
        seg(S0.lunch, S0.lunchEnd, 'lunch', 't_school:play', 'out', { run: 1.3 });
        seg(S0.lunchEnd, S0.out, 'class', 't_school:in', 'in', { run: 1.4 });
        if (c.kind === 'teen') {
          seg(S0.out, L.teen.cafe, 'play', pick(kidFun) || home, 'out', { run: 1.4 });
          seg(L.teen.cafe, L.teen.home + j * 0.3, 'cafe', pick(['t_cafe:line', 't_book:line'].filter((p) => this.places[p])) || home, 'out');
          seg(L.teen.home + j * 0.3, 24, 'home', home, 'in');
        } else {
          seg(S0.out, S0.home + j * 0.3, 'play', pick(kidFun) || home, 'out', { run: 1.4 });
          seg(S0.home + j * 0.3, 24, 'home', home, 'in');
        }
        break;
      }
      case 'shopkeeper': {
        const S0 = L.shop, w = c.work;
        const lunchAt = w === 't_rest' ? 't_cafe:line' : 't_rest:line';
        seg(0, S0.open + j * 0.2, 'sleep', home, 'in');
        seg(S0.open + j * 0.2, S0.lunch, 'work', w + ':staff', 'out');
        seg(S0.lunch, S0.lunchEnd, 'lunch', this.places[lunchAt] ? lunchAt : w + ':in', 'out');
        seg(S0.lunchEnd, S0.close + j * 0.2, 'work', w + ':staff', 'out');
        seg(S0.close + j * 0.2, 24, 'home', home, 'in');
        break;
      }
      case 'civic': {
        const C = L.civic, w = c.work || 't_hall';
        const start = C.start + j * 0.2;
        if (c.role === 'teacher') {
          seg(0, start, 'sleep', home, 'in');
          seg(start, L.school.bell, 'work', 't_school:staff', 'out');
          seg(L.school.bell, C.teacherEnd, 'work', 't_school:in', 'in');
          seg(C.teacherEnd, C.teacherEnd + 0.6, 'walk', pick(parkSpots) || home, 'out');
          seg(C.teacherEnd + 0.6, 24, 'home', home, 'in');
        } else if (c.role === 'police') {
          const night = c.id % 2 === 1 && (L.night.patrol || 0) > 0;
          const a = night ? 13 : start, b = night ? 23.5 : C.end;
          seg(0, a, 'sleep', home, 'in');
          for (let h = a; h < b; h += 1.5) { seg(h, Math.min(b, h + 0.6), 'patrol', pick(['t_police:staff', 't_fountain:gather', 't_sled:wait', 't_station:wait'].filter((p) => this.places[p])), 'out'); seg(Math.min(b, h + 0.6), Math.min(b, h + 1.5), 'patrol', pick(['t_hall:gather', 't_school:gather', 't_post:line', 't_rest:line'].filter((p) => this.places[p])) || home, 'out'); }
          seg(b, 24, 'home', home, 'in');
        } else if (c.role === 'postal') {
          seg(0, start, 'sleep', home, 'in');
          const doors = Object.keys(this.places).filter((k) => /:in$/.test(k) && !/t_post|t_station|t_play|t_fountain|t_sled|t_gate/.test(k));
          let h = start;
          seg(h, h + 0.5, 'work', 't_post:staff', 'out'); h += 0.5;
          while (h < C.end - 0.5) { seg(h, h + 0.35, 'mail', pick(doors).replace(':in', ':in'), 'door'); h += 0.35; if (r() < 0.2) { seg(h, h + 0.6, 'work', 't_post:staff', 'out'); h += 0.6; } }
          seg(h, 24, 'home', home, 'in');
        } else if (c.role === 'station') {
          seg(0, 6.5, 'sleep', home, 'in');
          seg(6.5, 21.5, 'work', 't_station:staff', 'out');
          seg(21.5, 24, 'home', home, 'in');
        } else {
          seg(0, start, 'sleep', home, 'in');
          const out = this.places[w + ':staff'] ? w + ':staff' : this.places[w + ':gather'] ? w + ':gather' : w + ':in';
          for (let h = start; h < C.end; h += 2) { seg(h, Math.min(C.end, h + 1.2), 'work', out, out.endsWith(':in') ? 'in' : 'out'); seg(Math.min(C.end, h + 1.2), Math.min(C.end, h + 2), 'work', w + ':in', 'in'); }
          seg(C.end, 24, 'home', home, 'in');
        }
        break;
      }
      case 'elder': {
        const E = L.elder;
        seg(0, E.out + j * 0.3, 'sleep', home, 'in');
        seg(E.out + j * 0.3, E.cafe, 'bench', pick(parkSpots.concat(benches)) || home, 'out');
        seg(E.cafe, E.cafe + 0.8, 'cafe', this.places['t_cafe:line'] ? 't_cafe:line' : home, 'out');
        let h = E.cafe + 0.8;
        if (r() < E.clinicChance) { seg(h, h + 0.6, 'clinic', this.places['t_clinic:line'] ? 't_clinic:line' : 't_clinic:in', 'out'); h += 0.6; }
        seg(h, Math.max(h, E.home - 1.5), 'bench', pick(parkSpots.concat(benches)) || home, 'out');
        seg(Math.max(h, E.home - 1.5), E.home + j * 0.3, 'errand', pick(shopsLine) || home, 'out');
        // 3 elders doze on the benches in the evening
        if (c.id % 6 === 0 && benches.length) { seg(E.home + j * 0.3, 21, 'home', home, 'in'); seg(21, 23, 'doze', pick(benches), 'out'); seg(23, 24, 'home', home, 'in'); }
        else seg(E.home + j * 0.3, 24, 'home', home, 'in');
        break;
      }
      case 'keeper': {
        // (B) a founded shop's keeper: behind the counter of the shop 08–19, lunch at the café / restaurant
        const S0 = L.shop, w = c.work || c.home;
        seg(0, S0.open + j * 0.2, 'sleep', home, 'in');
        seg(S0.open + j * 0.2, S0.lunch, 'work', w + ':staff', 'out');
        seg(S0.lunch, S0.lunchEnd, 'lunch', this.places['t_cafe:line'] ? 't_cafe:line' : w + ':in', 'out');
        seg(S0.lunchEnd, S0.close + 0.5 + j * 0.2, 'work', w + ':staff', 'out');
        seg(S0.close + 0.5 + j * 0.2, 24, 'home', home, 'in');
        break;
      }
      case 'resident': {
        // (B) a station-district resident: errands at the district's shops and the town's, a walk, home
        const A = L.adult;
        const lines = Object.keys(this.places).filter((k) => /^lot.*:line$/.test(k) && this.citizens.some((q) => q.kind === 'keeper' && q.work + ':line' === k));
        const errands = lines.concat(shopsLine.slice(0, 3));
        seg(0, A.out + 0.4 + j * 0.3, 'sleep', home, 'in');
        let h = A.out + 0.4 + j * 0.3;
        while (h < A.home - 0.5) {
          const roll = r();
          const len = roll < 0.5 ? (A.errandMin + r() * (A.errandMax - A.errandMin)) / 60 + 0.3 : roll < 0.75 ? 0.5 + r() * 0.5 : 0.8 + r() * 0.8;
          const place = roll < 0.5 ? pick(errands) : roll < 0.75 ? pick(parkSpots.concat(benches)) : null;
          seg(h, Math.min(A.home, h + len), roll < 0.5 ? 'errand' : roll < 0.75 ? 'walk' : 'home', place || home, place ? 'out' : 'in');
          h += len;
        }
        seg(h, 24, 'home', home, 'in');
        break;
      }
      case 'builder': {
        seg(0, 8, 'sleep', home, 'in');
        seg(8, 18, 'work', this.places['t_hall:gather'] ? 't_hall:gather' : 't_hall:in', 'out');
        seg(18, 24, 'home', home, 'in');
        break;
      }
      default: {     // adult
        // out from 08:00 to 19:00: errands at the town's shops (6–15 min each), a walk or a bench in the park,
        // the café, now and then a while at home. (An errand / a walk in the afternoon can turn into a trip to
        // Frost Village: tripWanted.)
        const A = L.adult;
        seg(0, A.out + j * 0.3, 'sleep', home, 'in');
        let h = A.out + j * 0.3;
        const errands = shopsLine.concat(['t_post:line', 't_clinic:line']).filter((p) => this.places[p]);
        let last = '';
        while (h < A.home - 0.45) {
          const roll = r();
          let len, act, place, mode = 'out';
          if (roll < 0.45 || last === 'home') { len = (A.errandMin + r() * (A.errandMax - A.errandMin)) / 60 + 0.35; act = 'errand'; place = pick(errands); }
          else if (roll < 0.68) { len = 0.4 + r() * 0.5; act = 'walk'; place = pick(parkSpots.concat(benches)); }
          else if (roll < 0.8) { len = 0.5; act = 'cafe'; place = this.places['t_cafe:line'] ? 't_cafe:line' : pick(errands); }
          else { len = 0.6 + r() * (A.homeStay || 0.8); act = 'home'; place = home; mode = 'in'; }
          len = Math.min(len, A.home - h);
          seg(h, h + len, act, place || home, place ? mode : 'in');
          h += len;
          last = act;
        }
        seg(h, A.home + j * 0.2, 'home', home, 'in');
        if (r() < A.walkChance) { seg(A.home + j * 0.2, A.walkEnd, 'walk', pick(parkSpots.concat(benches)) || home, 'out'); seg(A.walkEnd, 24, 'home', home, 'in'); }
        else seg(A.home + j * 0.2, 24, 'home', home, 'in');
      }
    }
    // fill gaps (every hour belongs to a segment)
    S.sort((a, b) => a.s - b.s);
    const out = [];
    let h = 0;
    for (const s of S) { if (s.s > h + 1e-6) out.push({ s: h, e: s.s, act: 'home', place: home, mode: 'in' }); if (s.e > h) { out.push(Object.assign({}, s, { s: Math.max(s.s, h) })); h = s.e; } }
    if (h < 24) out.push({ s: h, e: 24, act: 'home', place: home, mode: 'in' });
    return out;
  }

  /** the segment of the plan at hour h */
  segAt(plan, h) { for (let i = 0; i < plan.length; i++) if (h >= plan[i].s && h < plan[i].e) return i; return plan.length - 1; }

  /** put a citizen where its plan says it is at clock time T (no walk): start / reload / back from a trip */
  settle(c, T, from) {
    const d = this.dayOf(T), h = this.hourOf(T);
    if (c.day !== d || !c.plan) { c.plan = this.planDay(c, d); c.day = d; }
    const i = this.segAt(c.plan, h);
    const sg = c.plan[i];
    c.seg = i;
    if (from) { this.go(c, sg, T, from); return; }
    this.arriveAt(c, sg, T, true);
  }

  /** start walking to segment sg's place */
  go(c, sg, T, from) {
    const pl = this.places[sg.place] || this.places[(c.home || 't_apt1') + ':in'];
    if (!pl) { this.arriveAt(c, sg, T, true); return; }
    const spot = this.takeSpot(c, pl, sg);
    const fx = from ? from.x : c.x, fy = from ? from.y : c.y;
    const r = this.route(fx, fy, from && from.bld, spot.x, spot.y, pl.bld);
    c.route = r; c.t0 = T;
    const spd = c.speed * (sg.run || 1) * (c.kind === 'elder' ? 0.8 : 1);
    c.spd = spd;
    c.state = 'walk';
    c.act = sg.act; c.mode = sg.mode;
    this.schedule(c, T + r.len / spd + 0.01);
  }

  takeSpot(c, pl, sg) {
    if (c.placeObj && c.placeObj !== pl) c.placeObj.occ = Math.max(0, c.placeObj.occ - 1);
    c.placeObj = pl;
    pl.occ++;
    if (sg && sg.mode === 'in') { c.spot = pl.door; return pl.door; }
    // the least crowded spot (people do not stack)
    const k = pl.spots.length;
    const idx = (c.id * 7 + pl.occ * 3) % k;
    let s = pl.spots[idx];
    // a crowd beyond the spots: rings around the spot (wider for every extra round), so nobody stands on anyone
    const over = Math.floor((pl.occ - 1) / Math.max(1, k));
    if (over > 0) {
      const ang = c.id * 2.399963 + pl.occ * 0.7, rad = 22 + 20 * over;
      s = { x: s.x + Math.cos(ang) * rad, y: s.y + Math.sin(ang) * rad * 0.5, dir: s.dir };
    }
    c.spot = s;
    return s;
  }

  arriveAt(c, sg, T, instant) {
    const pl = this.places[sg.place] || this.places[(c.home || 't_apt1') + ':in'];
    if (instant || !c.spot || c.placeObj !== pl) this.takeSpot(c, pl, sg);
    c.x = c.spot.x; c.y = c.spot.y;
    c.route = null;
    c.act = sg.act; c.mode = sg.mode;
    c.state = sg.mode === 'in' ? 'in' : 'out';      // ('door': the postman stands at the door for a moment)
    const d = this.dayOf(T);
    // (a gather: `secs` from arriving)
    if (sg === c.over && sg.secs) { this.schedule(c, T + sg.secs); return; }
    this.schedule(c, Math.max(T + 0.5, this.at(d, sg.e)));
  }

  schedule(c, T) { c.wakeT = T; this.heap.push(T, c.id); }

  /** a citizen's event: the walk ended, or its segment is over */
  wake(c, T) {
    if (c.flags & (F.ON_TRAIN | F.IN_VILLAGE)) return;
    if (c.flags & F.WAITING) { this.schedule(c, T + 5); return; }        // waiting for the train: Neighbours decides
    if (c.state === 'walk') {
      const sg = c.over || c.plan[c.seg];
      // a trip to Frost Village: wait on the platform for the train
      if (c.trip && c.act === 'trip') { c.state = 'out'; c.x = c.spot.x; c.y = c.spot.y; c.route = null; c.flags |= F.WAITING; this.schedule(c, T + 5); return; }
      this.arriveAt(c, sg, T, false);
      if (sg.mode === 'in' && c.body && this.gs.isOnScreen(c.x, c.y, 300)) { this.gs.sfxAt('sfx_door', c.x, c.y, { volume: 0.25, throttle: 300 }); }
      return;
    }
    // segment over: the next one
    if (c.over) { const pl = this.places[c.over.place]; c.over = null; if (pl && /^gather:/.test(pl.id) && pl.occ <= 1) delete this.places[pl.id]; }
    const d = this.dayOf(T), h = this.hourOf(T);
    if (c.day !== d || !c.plan) { c.plan = this.planDay(c, d); c.day = d; }
    let i = this.segAt(c.plan, h);
    if (i === c.seg && c.day === d && h >= c.plan[i].e - 1e-6) i = Math.min(c.plan.length - 1, i + 1);
    c.seg = i;
    const sg = c.plan[i];
    // a village trip instead of an errand (afternoon for adults, morning / afternoon for elders)
    if (this.tripWanted(c, sg, h)) { this.startTrip(c, T); return; }
    if (sg.place === (c.placeObj && c.placeObj.id) && c.state !== 'walk') { this.arriveAt(c, sg, T, false); return; }
    this.go(c, sg, T, { x: c.x, y: c.y, bld: c.placeObj ? c.placeObj.bld : null });
  }

  tripWanted(c, sg, h) {
    if (!this.nb.trainRuns() || (c.flags & F.DISTRICT)) return false;
    if (c.kind !== 'adult' && c.kind !== 'elder' && c.kind !== 'teen') return false;
    if (sg.act !== 'errand' && sg.act !== 'bench' && sg.act !== 'cafe' && sg.act !== 'play') return false;
    if (c.tripDay === c.day) return false;
    const A = this.L.adult, E = this.L.elder;
    const ok = c.kind === 'elder' ? ((h >= E.tripMorning[0] && h < E.tripMorning[1]) || (h >= E.tripAfternoon[0] && h < E.tripAfternoon[1])) : (h >= A.tripFrom && h < A.tripTo);
    if (!ok) return false;
    const chance = (this.B.town.tripChance || 0.35) * (c.kind === 'teen' ? 0.5 : 1);
    const r = mulberry32(((c.id + 3) * 31337 + c.day * 7 + this.seed) >>> 0)();
    c.tripDay = c.day;            // (decided once a day, at the first segment that could be a trip)
    return r < chance;
  }

  /** walk to the town platform and wait for the train to Frost Village */
  startTrip(c, T) {
    const pl = this.places['t_station:wait'] || this.places['t_station:in'];
    c.trip = true;
    c.act = 'trip';
    const sg = { place: pl.id, act: 'trip', mode: 'out', s: this.hourOf(T), e: this.hourOf(T) + 1 };
    this.go(c, sg, T, { x: c.x, y: c.y, bld: c.placeObj ? c.placeObj.bld : null });
    c.act = 'trip';
    this.log.push({ T, ev: 'trip', id: c.id });
  }

  // ================================================================ routes
  /** cached polyline between two points (door spurs + the walk graph) */
  route(ax, ay, abld, bx, by, bbld) {
    const key = Math.round(ax) + ',' + Math.round(ay) + '>' + Math.round(bx) + ',' + Math.round(by);
    let r = this.routes.get(key);
    if (r) return r;
    const g = this.graph;
    const na = this.nodeFor(ax, ay, abld), nb = this.nodeFor(bx, by, bbld);
    const pts = [[ax, ay]];
    const direct = Math.hypot(bx - ax, (by - ay) * 2);
    if (na >= 0 && nb >= 0 && na !== nb && direct > 150) {
      const p = g.path(na, nb);
      if (p) for (const [ni] of p) pts.push([g.nodes[ni].x, g.nodes[ni].y]);
    }
    pts.push([bx, by]);
    // drop points that double back right at the ends (a door node just behind us)
    const P = new Float32Array(pts.length * 2), cum = new Float32Array(pts.length);
    let len = 0;
    for (let k = 0; k < pts.length; k++) {
      P[k * 2] = pts[k][0]; P[k * 2 + 1] = pts[k][1];
      if (k) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
      cum[k] = len;
    }
    r = { pts: P, cum, len, n: pts.length };
    if (this.routes.size > 900) this.routes.clear();
    this.routes.set(key, r);
    return r;
  }

  nodeFor(x, y, bldId) {
    const g = this.graph;
    if (bldId) { const did = this.nb.roadNet.doorNode(bldId); if (did && g.byId[did]) return g.byId[did].i; }
    let best = -1, bd = Infinity;
    for (const n of g.nodes) { const d = Math.hypot(n.x - x, (n.y - y) * 2); if (d < bd) { bd = d; best = n.i; } }
    return best;
  }

  /** position on route r at distance d (px): into out {x, y, dx, dy} */
  along(r, d, out) {
    const cum = r.cum, P = r.pts;
    if (d <= 0) { out.x = P[0]; out.y = P[1]; out.dx = r.n > 1 ? P[2] - P[0] : 0; out.dy = r.n > 1 ? P[3] - P[1] : 0; return out; }
    if (d >= r.len) { const k = r.n - 1; out.x = P[k * 2]; out.y = P[k * 2 + 1]; out.dx = k ? P[k * 2] - P[k * 2 - 2] : 0; out.dy = k ? P[k * 2 + 1] - P[k * 2 - 1] : 0; return out; }
    let lo = 0, hi = r.n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; }
    const seg = cum[hi] - cum[lo] || 1, f = (d - cum[lo]) / seg;
    const ax = P[lo * 2], ay = P[lo * 2 + 1], bx = P[hi * 2], by = P[hi * 2 + 1];
    out.x = ax + (bx - ax) * f; out.y = ay + (by - ay) * f; out.dx = bx - ax; out.dy = by - ay;
    return out;
  }

  /** where citizen c is now (analytic for walkers) */
  pos(c, out) {
    out = out || this._p || (this._p = { x: 0, y: 0, dx: 0, dy: 0 });
    if (c.state === 'walk' && c.route) {
      this.along(c.route, (this.T - c.t0) * c.spd, out);
      // walk a little off the centre line (two people on the same street do not overlap)
      const l = Math.hypot(out.dx, out.dy) || 1;
      out.x += (-out.dy / l) * c.lane; out.y += (out.dx / l) * c.lane * 0.5;
      return out;
    }
    out.x = c.x; out.y = c.y; out.dx = 0; out.dy = 0;
    return out;
  }

  // ================================================================ update
  update(dt, T) {
    if (!this.started) return;
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    this.T = T;
    // events due
    let pops = 0;
    while (this.heap.size && this.heap.peek()[0] <= T && pops < 40) {      // (spread: at midnight everyone plans a new day)
      const [wt, id] = this.heap.pop();
      const c = this.citizens[id];
      if (!c || c.wakeT !== wt) continue;
      pops++;
      this.wake(c, wt);
    }
    this.stats.pops += pops;
    this.setPieces(T);
    // tiers + bodies
    this.tierT -= dt;
    if (this.tierT <= 0) { this.tierT = TIER_EVERY; this.retier(); }
    for (const b of this.bodies) if (b.c) this.drive(b, dt);
    this.chatter(dt);
    if (t0) this.stats.ms = this.stats.ms * 0.95 + (performance.now() - t0) * 0.05;
  }

  /** who is near the view gets a body (nearest first, up to the caps) */
  retier() {
    const gs = this.gs, P = this.B.perf;
    const v = gs.viewRect ? gs.viewRect() : gs.cameras.main.worldView;
    const m = P.margin || 120, near = P.near || 600;
    const cap = (P.maxRigs || 32) + (P.maxLite || 40);
    const cx = (v.x + v.right) / 2, cy = (v.y + v.bottom) / 2;
    const want = this._want || (this._want = []);
    want.length = 0;
    let walking = 0, inside = 0, out = 0, away = 0;
    const p = { x: 0, y: 0, dx: 0, dy: 0 };
    const townOpen = this.nb.townVisible();
    for (const c of this.citizens) {
      if (c.flags & (F.ON_TRAIN | F.IN_VILLAGE)) { away++; c.lod = 3; continue; }
      if (c.state === 'in') { inside++; c.lod = 3; continue; }
      if (c.state === 'walk') walking++; else out++;
      this.pos(c, p);
      const mm = m + (c.body ? 60 : 0);
      const inView = (townOpen || p.x < this.townX) && p.x > v.x - mm && p.x < v.right + mm && p.y > v.y - mm && p.y - 110 < v.bottom + mm;
      c.lod = inView ? 0 : (p.x > v.x - near && p.x < v.right + near && p.y > v.y - near && p.y < v.bottom + near ? 1 : 2);
      if (inView) { c._d = Math.abs(p.x - cx) + Math.abs(p.y - cy) * 2; want.push(c); }
    }
    want.sort((a, b) => a._d - b._d);
    if (want.length > cap) want.length = cap;
    const keep = new Set(want);
    for (const b of this.bodies) if (b.c && !keep.has(b.c)) { b.c.body = null; b.park(); this.free.push(b); }
    for (const c of want) {
      if (c.body) continue;
      let b = this.free.pop();
      if (!b) { b = new TownBody(gs, c); this.bodies.push(b); }
      b.wear(c);
      c.body = b;
      this.pos(c, p);
      b.x = p.x; b.y = p.y;
      // out of a door: fade at the door; elsewhere the rig fades in by itself
      b.sync(0);
    }
    const live = want.length;
    this.stats.live = live; this.stats.walking = walking; this.stats.inside = inside; this.stats.out = out; this.stats.away = away;
    if (this.nb.townVisible()) Audio.setAmbience('amb_town', Math.min(0.65, 0.15 + 0.5 * Math.min(1, live / 30)) * (this.nb.nearTown() ? 1 : 0));
  }

  /** move / animate one materialised citizen */
  drive(b, dt) {
    const c = b.c, p = this.pos(c);
    const moving = c.state === 'walk' && this.T - c.t0 < c.route.len / c.spd;
    b.x = p.x; b.y = p.y;
    if (moving) {
      b.vx = p.dx; b.vy = p.dy;
      b.face(p.dx, p.dy);
      b.play('walk');
      b.sprite.anims.timeScale = Math.min(1.5, c.spd / 75);
    } else {
      b.vx = b.vy = 0;
      // face the spot's way once on arriving (an anim drawn only in S / SE / E may turn them after that)
      if (c.spot && c.spot.dir && b._faced !== c.spot) { b._faced = c.spot; const want = DIR_INDEX[c.spot.dir]; if (want !== undefined && b.dir !== want) { b.dir = want; b.play(b.animName || 'idle', true, true); } }
      const anim = c.act === 'cheer' ? (((c.id + Math.floor(this.T / 2)) % 3) === 0 ? 'wave' : 'happy') : c.act === 'recess' || c.act === 'play' ? (((c.id + Math.floor(this.T / 3)) % 3) === 0 ? 'happy' : 'idle') : c.act === 'lunch' || c.act === 'cafe' ? (((c.id + Math.floor(this.T / 4)) % 4) === 0 ? 'talk' : 'idle') : 'idle';
      b.play(anim);
      b.sprite.anims.timeScale = 1;
    }
    // station platform: drawn higher
    const st = this.nb.townStation;
    b.sprite.lift = st && st.onPlatform && st.onPlatform(b.x, b.y) ? st.lift : 0;
    b.sync(dt);
  }

  /** a few lines / emotes from the people on screen (at most 2 chats, 3 emotes) */
  chatter(dt) {
    this.chatT -= dt;
    if (this.chatT > 0) return;
    this.chatT = 2.5 + Math.random() * 3;
    const B = this.nb.bubbles();
    if (!B) return;
    let chats = 0, emotes = 0;
    for (const b of B.active) { if (b.who && b.who.c) { if (b.kind === 'chat') chats++; else emotes++; } }
    const live = this.bodies.filter((b) => b.c && this.gs.isOnScreen(b.x, b.y, -20));
    if (!live.length) return;
    const b = live[Math.floor(Math.random() * live.length)];
    const c = b.c;
    if (c.act === 'doze' || c.act === 'sleep') { if (emotes < MAX_EMOTE) B.emote(b, 'emote_zzz', 2.2); return; }
    if (chats < MAX_CHAT && Math.random() < 0.55) {
      const cat = c.kind === 'student' || c.kind === 'teen' ? 'town_kid' : c.kind === 'elder' ? 'town_elder' : c.role === 'station' ? 'station' : 'town_adult';
      B.chat(b, line(cat), null, 2.4);
    } else if (emotes < MAX_EMOTE) {
      const em = c.act === 'recess' || c.act === 'play' ? 'emote_snowball' : c.act === 'cafe' || c.act === 'lunch' ? 'emote_heart' : c.act === 'work' ? 'emote_note' : 'emote_dots';
      B.emote(b, em, 1.6);
    }
  }

  // ================================================================ set pieces
  setPieces(T) {
    const h = this.hourOf(T), hi = Math.floor(h * 2) / 2;     // half hours
    if (hi === this.lastHour) return;
    const prev = this.lastHour;
    this.lastHour = hi;
    if (prev < 0) return;
    const L = this.L;
    const ev = (name) => { this.log.push({ T, ev: name, h: Math.round(h * 100) / 100 }); if (this.log.length > 400) this.log.splice(0, 100); this.gs.events.emit('v4:hour', h, name); };
    const school = (this.byRole.school || [])[0];
    const near = (b, d) => b && this.gs.isNear(b.x, b.y, d || 900);
    if (hi === L.school.bell || hi === Math.floor(L.school.bell * 2) / 2) { ev('school_bell'); if (school) { school.ring(3); if (near(school)) Audio.play('sfx_school_bell', { volume: 0.7 }); } }
    if (hi === Math.floor(L.school.recess * 2) / 2) ev('recess');
    if (hi === 12) { ev('hall_bell'); const hall = (this.byRole.hall || [])[0]; if (near(hall)) Audio.play('sfx_bell_hall', { volume: 0.6 }); }
    if (hi === Math.floor(L.school.out * 2) / 2) { ev('school_out'); if (school) { school.ring(2); if (near(school)) Audio.play('sfx_school_bell', { volume: 0.6 }); } }
    if (hi === 17.5) ev('shops_close');
    if (hi === 21) ev('night');
  }

  // ================================================================ trips (Neighbours)
  /** citizens to put on the next train to Frost Village: those waiting on the platform first */
  pickRiders(n, opts = {}) {
    const out = [];
    const waiting = this.citizens.filter((c) => (c.flags & F.WAITING) && !(c.flags & (F.ON_TRAIN | F.IN_VILLAGE)));
    for (const c of waiting) { if (out.length >= n) break; out.push(c); }
    if (out.length < n) {
      // top up with people who are free right now and not in sight (moved abstractly)
      // ((v4 review) not someone asleep or at home for the night: night trains stay nearly empty)
      const free = this.citizens.filter((c) => !(c.flags & (F.ON_TRAIN | F.IN_VILLAGE | F.WAITING | F.DISTRICT)) && (c.kind === 'adult' || c.kind === 'elder' || c.kind === 'teen') && (opts.any || c.lod >= 1) && c.act !== 'work' && c.act !== 'class' && c.act !== 'sleep' && !(c.act === 'home' && this.nightNow()));
      free.sort((a, b) => ((a.id * 7 + this.dayOf(this.T)) % 13) - ((b.id * 7 + this.dayOf(this.T)) % 13));
      for (const c of free) { if (out.length >= n) break; out.push(c); }
    }
    for (const c of out) this.leave(c);
    return out;
  }

  /** (v4 review) is it night on the town's clock (lights on .. dawn)? */
  nightNow() { const D = BALANCE.v4.day || {}, h = this.hourOf(this.T); return h >= (D.night || 20) || h < (D.dawn || 6); }

  /** a citizen gets on the train (town side) */
  leave(c) {
    c.flags = (c.flags | F.ON_TRAIN) & ~F.WAITING;
    c.trip = false;
    if (c.body) { const b = c.body; c.body = null; b.park(); this.free.push(b); }
    if (c.placeObj) { c.placeObj.occ = Math.max(0, c.placeObj.occ - 1); c.placeObj = null; }
    c.state = 'away';
    c.route = null;
    c.act = 'train';
  }

  /** back from Frost Village: off the train at the town station, then on with the day (home) */
  alight(c, T, at) {
    c.flags &= ~(F.ON_TRAIN | F.IN_VILLAGE | F.WAITING);
    c.trip = false;
    if (c.newcomer) { c.newcomer = false; c.visits = (c.visits || 0) - 1; }       // (moved in: not back from a visit)
    c.visits = (c.visits || 0) + 1;
    if (c.visits >= (this.B.visitors.regularAt || 3)) c.regular = true;
    c.x = at.x; c.y = at.y;
    c.state = 'out';
    c.placeObj = null;
    this.settle(c, T, { x: at.x, y: at.y, bld: 't_station' });
  }

  /** citizen by id */
  get(id) { return this.citizens[id] || null; }

  /** counts for the conservation test */
  census() {
    let town = 0, train = 0, village = 0;
    for (const c of this.citizens) { if (c.flags & F.ON_TRAIN) train++; else if (c.flags & F.IN_VILLAGE) village++; else town++; }
    return { town, train, village, total: this.citizens.length };
  }

  /** tap on a citizen: name card (polish) */
  card(c) {
    const act = tr('act_' + (c.act === 'class' ? 'class' : c.act === 'school' ? 'school' : c.act === 'sleep' ? 'home' : c.act));
    let s = tr('tfCard', { name: c.name, age: c.age, act });
    if (c.regular) s += '\n' + tr('tfRegular');
    return s;
  }

  destroy() { for (const b of this.bodies) { b.alive = true; b.destroy(); } this.bodies = []; this.free = []; }
}

const DIR_INDEX = { E: 0, SE: 1, S: 2, SW: 3, W: 4, NW: 5, N: 6, NE: 7 };
const DIR_NAME = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
export { DIR_BASE };
