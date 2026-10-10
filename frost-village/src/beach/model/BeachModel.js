// BeachModel (beach_runtime, docs/v5_v8_plan.md §6.5): the pure, seeded heart of 햇살 해변. No Phaser, window,
// timers, Date.now or Math.random. The host feeds it time (DayClock T), the chief's position and the game's events;
// it answers with state the view draws and events (`drain()`) the host turns into toasts, coins, sounds and feed
// events. Sub-models: slots (activities.js), crowd (crowd.js), resort (resort.js), events + happenings (events.js),
// the sea (sea.js: boats, crabs). Steps and stars follow the plan's "How it opens" and "Building the resort" tables.

import { STEPS } from '../tuning.js';
import { buildSlots } from './activities.js';
import { Crowd } from './crowd.js';
import { Resort } from './resort.js';
import { BeachEvents, BEACH_HAPPENINGS } from './events.js';
import { Sea } from './sea.js';
import { LocalStage } from './stage.js';
import { stream } from './rng.js';
import { hourOf, dayOf } from './time.js';
import { L, LR, px2L, PROPS, BUILDINGS, GATE, CLEANUP, REVEAL, PLACES, placePos, polarSpot, BOARDWALK, waterJ } from '../layout.js';

const PRE = { doorman: 'doorman', bellhop: 'bellhop', receptionist: 'receptionist', housekeeper: 'housekeeper', lifeguard: 'lifeguard', icecream_vendor: 'icecream_vendor',
  beach_bar_staff: 'beach_bar_staff', surfer: 'surfer', barista: 'beach_bar_staff', chef: 'beach_bar_staff', clerk: 'beach_bar_staff', attendant: 'beach_bar_staff',
  guide: 'receptionist', ticket_seller: 'receptionist', owner: 'beach_tourist', vendor: 'icecream_vendor' };

/** the null looks: everyone can play everything (used when no compositor is given) */
export const NULL_LOOKS = {
  make: (preset, R) => ({ preset, base: R && R.next() < 0.3 ? 'child_slim' : 'adult_slim', parts: [], colors: {} }),
  family: (R) => [NULL_LOOKS.make('family_beach', { next: () => 0.9 }), NULL_LOOKS.make('family_beach', { next: () => 0.1 })],
  ageOf: (p) => (/^child/.test(p.base) ? 'child' : /^elder/.test(p.base) ? 'elder' : 'adult'),
  canPlay: () => true,
  pickAnim: (p, a) => a,
};

export class BeachModel {
  /**
   * opts: { tuning, saved (sanitized slice), seed, T, looks, defs (sprite defs of beach + beach_bld), stage,
   *         ownRent (no Growth: the beach pays its shops' rent), ownHappenings (no story: run P9–P12 here),
   *         fallbackFerry (no harbour: ferries at the tuning's hours) }
   */
  constructor(opts = {}) {
    this.cfg = opts.tuning;
    this.seed = (opts.seed >>> 0) || 20261010;
    this.T = opts.T || 0;
    this.looks = opts.looks || NULL_LOOKS;
    this.defs = opts.defs || {};
    this.stage = opts.stage || new LocalStage();
    this.ownRent = opts.ownRent !== false;
    this.ownHappenings = opts.ownHappenings !== false;
    this.fallbackFerry = !!opts.fallbackFerry;
    const s = opts.saved || {};
    this.steps = {};
    for (const k of STEPS) if (s.steps && s.steps[k]) this.steps[k] = 1;
    this.clean = (s.clean | 0) >>> 0;
    this.stars = s.stars && Number.isFinite(s.stars.n) ? Math.max(0, Math.min(3, s.stars.n | 0)) : 0;
    this.out = [];
    this.slots = buildSlots(this.defs);
    this.resort = new Resort(this, { hotel: s.hotel, shops: s.shops, card: s.card, fish: s.fish, spendDay: s.sd });
    this.crowd = new Crowd(this, s.crowd);
    this.events = new BeachEvents(this, s.events || {});
    this.sea = new Sea(this);
    this.castles = {};
    for (const p of PROPS) if (p.stages) this.castles[p.id] = { stage: 0, prog: 0 };
    this.acc = 0;
    this.lastWhistle = -1e9;
    this.chief = null;
    this.ferryDay = -1; this.ferryDone = {};
    this.boardAt = this.steps.lifeguard && !this.steps.board ? this.T + 10 : null;
    this.stats = { ticks: 0 };
    this.checkStars(this.T, true);
  }

  emit(e) { this.out.push(e); }
  drain() { const o = this.out; this.out = []; return o; }

  // ------------------------------------------------------------------------------------------ gates
  stepDone(k) { return !!this.steps[k]; }
  isOpen() { return !!this.steps.lifeguard; }
  /** does `need` hold now? nature | cleanup | open | lifeguard | shop:<id> | hotel | pool | aquarium | extras */
  ok(need) {
    if (!need || need === 'nature') return true;
    if (need === 'cleanup') return !!this.steps.cleanup;
    if (need === 'open' || need === 'lifeguard') return !!this.steps.lifeguard;
    if (need.startsWith('shop:')) return !!this.steps.lifeguard && this.resort.isOpen(need.slice(5));
    if (need === 'hotel') return this.resort.hotel.level > 0;
    if (need === 'pool' || need === 'extras') return !!this.steps.pool;
    if (need === 'aquarium') return !!this.steps.aquarium;
    return false;
  }
  lifeguardOn() { return !!this.steps.lifeguard; }

  /** the next step to offer (a site, a walk or the board), or null */
  nextStep() {
    const s = this.steps, shops = this.resort.shops.size;
    if (!s.path) return 'path';
    if (!s.reveal) return 'reveal';
    if (!s.cleanup) return 'cleanup';
    if (!s.lifeguard) return 'lifeguard';
    if (!s.board) return 'board';
    if (!s.hotel) return shops >= 3 ? 'hotel' : null;
    if (!s.pool) return 'pool';
    if (!s.aquarium) return 'aquarium';
    if (!s.up2) return 'up2';
    if (!s.up3) return 'up3';
    return null;
  }

  /** a step is done (a site was built, the chief walked in, the board opened); returns true when it changed things */
  build(step, T = this.T) {
    if (STEPS.indexOf(step) < 0 || this.steps[step]) return false;
    if (step !== this.nextStep() && !(step === 'reveal' && this.steps.path)) return false;
    this.steps[step] = 1;
    const E = (o) => this.emit(Object.assign({ t: 'beach:step', step, n: STEPS.indexOf(step) + 1 }, o || {}));
    if (step === 'lifeguard') { this.boardAt = T + 10; E(); this.checkStars(T); }
    else if (step === 'hotel') { this.resort.hotel.level = Math.max(1, this.resort.hotel.level); E({ rooms: this.resort.rooms() }); this.checkStars(T); }
    else if (step === 'up2' || step === 'up3') { this.resort.upgrade(); E({ level: this.resort.hotel.level, rooms: this.resort.rooms() }); }
    else if (step === 'pool') { E(); this.emit({ t: 'beach:extras', keys: this.cfg.extras.slice() }); this.checkStars(T); }
    else E();
    if (step === 'aquarium') this.checkStars(T);
    return true;
  }

  /** the chief walks east past the lighthouse point once the path is built: the beach is found (E7) */
  reveal(T) { return this.build('reveal', T); }

  /** the chief's position (px) each tick: E7 walk-in, E8 clean-up, P12 catch */
  chiefAt(x, y, T) {
    this.chief = { x, y };
    if (this.steps.path && !this.steps.reveal) { const [i, j] = px2L(x, y); if (i > REVEAL.i && j > -20 && j < 2) this.reveal(T); }
    if (this.steps.reveal && !this.steps.cleanup) {
      const R = this.cfg.cleanup.reach;
      CLEANUP.forEach(([i, j], k) => {
        if (this.clean & (1 << k)) return;
        const [bx, by] = L(i, j);
        if (Math.abs(bx - x) < R && Math.abs(by - y) < R * 0.6) { this.clean |= 1 << k; this.emit({ t: 'beach:clean', k, n: this.cleanCount(), max: CLEANUP.length, x: bx, y: by }); }
      });
      if (this.cleanCount() >= Math.min(this.cfg.cleanup.pieces, CLEANUP.length)) this.build('cleanup', T);
    }
    const hp = this.events.happening;
    if (hp && hp.h.id === 'P12' && !hp.caught) {
      const p = this.parasolAt(hp.data, T);
      if (p && p.flying && Math.hypot(p.x - x, p.y + 30 - y) < 70) { hp.caught = true; hp.fame = hp.h.fame; hp.until = Math.min(hp.until, T + 3); this.emit({ t: 'beach:happening', id: 'P12', op: 'catch', fame: hp.h.fame, x, y }); }
    }
  }
  cleanCount() { let n = 0; for (let k = 0; k < CLEANUP.length; k++) if (this.clean & (1 << k)) n++; return n; }
  cleanupBits() { return CLEANUP.map(([i, j], k) => ({ k, x: LR(i, j)[0], y: LR(i, j)[1], picked: !!(this.clean & (1 << k)), key: k % 3 === 1 ? 'driftwood' : 'decal_seaweed' })); }

  // ------------------------------------------------------------------------------------------ stars
  checkStars(T, quiet) {
    if (!this.isOpen()) return;
    const st = this.cfg.stars, shops = this.resort.shops.size, hotel = this.resort.hotel.level;
    let n = 1;
    if (shops >= st[2].shops && hotel >= st[2].hotel) n = 2;
    if (n >= 2 && shops >= st[3].shops && (!st[3].pool || this.steps.pool) && (!st[3].aquarium || this.steps.aquarium)) n = 3;
    if (n > this.stars) {
      this.stars = n;
      if (!quiet) this.emit({ t: 'beach:star', n });
      if (n >= 3 && !quiet && !this.events.week) this.events.request('week', T);
    }
  }
  star() { return this.stars; }

  // ------------------------------------------------------------------------------------------ the game feeds us
  onFerry(n, T = this.T) {
    if (!this.isOpen()) return { beach: 0, rooms: 0 };
    const rooms = this.resort.checkin(n, T);
    const beach = this.crowd.onFerry(Math.max(0, n - rooms), T);
    return { beach, rooms };
  }
  shopOpened(id, T = this.T) { const ok = this.resort.open(id); if (ok) this.checkStars(T); return ok; }

  // ------------------------------------------------------------------------------------------ castles, kids, watchers
  castleReset(id) { const c = this.castles[id]; if (c) { c.stage = 0; c.prog = 0; } }
  tallestCastle(ids) { let best = ids[0], bs = -1; for (const id of ids) { const c = this.castles[id]; const sc = c ? c.stage * 100 + c.prog : 0; if (sc > bs) { bs = sc; best = id; } } return best; }
  stepCastles(dt) {
    const by = {};
    for (const s of this.slots.of('dig')) if (s.castle && s.by) { const v = this.crowd.byId.get(s.by); if (v && v.mode === 'act' && v.act.kind === 'dig') by[s.castle] = (by[s.castle] || 0) + 1; }
    const every = this.cfg.sandcastle.stageEvery;
    for (const id in this.castles) {
      const c = this.castles[id], n = by[id] || 0;
      if (!n) continue;
      c.prog += dt * (n >= 2 ? 1.25 : 1);
      while (c.prog >= every && c.stage < 3) { c.prog -= every; c.stage++; this.emit({ t: 'beach:castle', id, stage: c.stage }); }
      if (c.stage >= 3) c.prog = Math.min(c.prog, every);
    }
  }
  /** six kids for the sandcastle contest: kids on the beach first, then a local party of kids comes running */
  contestKids(T, n) {
    const out = [];
    const slots = this.slots.of('dig').filter((s) => s.castle && /^castle_\d$/.test(s.castle));
    for (const s of slots) if (s.by) { const v = this.crowd.byId.get(s.by); if (v) { this.slots.release(s, v.id); v.slot = null; if (v.mode === 'act') v.act.until = T; } }
    const kids = this.crowd.list.filter((v) => v.age === 'child' && !v.leaving && v.mode !== 'gone' && this.looks.pickAnim(v.person, 'dig') === 'dig');
    const R = stream(this.seed, 'contest:' + dayOf(T));
    while (kids.length < n && this.crowd.list.length < this.cfg.live.present - 1) {
      const fam = this.crowd.spawnGroup('family', 'local', 'gate', T, R) || [];
      for (const v of fam) if (v.age === 'child' && this.looks.pickAnim(v.person, 'dig') === 'dig') kids.push(v);
      if (!fam.length) break;
    }
    for (const s of slots) {
      const v = kids.shift();
      if (!v) break;
      if (v.slot) this.crowd.releaseSlot(v);
      this.crowd.dropCourt(v);
      if (!this.slots.take(s, v.id)) continue;
      v.slot = s;
      v.plan = ['splash', 'icecream'];
      v.pi = 0;
      v.next = { kind: 'dig', dur: this.cfg.events.contest.secs + 10, anim: 'dig', dir: s.dir, slot: s.id };
      v.leaveT = Math.max(v.leaveT, T + 200);
      this.crowd.goTo(v, s, T);
      out.push(v.id);
    }
    return out;
  }
  /** fireworks: people gather at the boardwalk edge facing the sea */
  watchers(T, until) {
    const R = stream(this.seed, 'watch:' + dayOf(T));
    const n = 8;
    for (let k = 0; k < n && this.crowd.list.length < this.cfg.live.present - 2; k++) this.crowd.queue.push({ T: T + k * 0.8, n: 0, src: 'sunset', at: R.chance(0.5) ? 'gate' : 'east', kind: 'sunset' });
    void until;
  }

  // ------------------------------------------------------------------------------------------ lifeguard + happenings
  lifeguardWhistle(v, at) {
    if (at - this.lastWhistle < this.cfg.lifeguard.whistleGap) return false;
    this.lastWhistle = at;
    this.emit({ t: 'beach:whistle', vid: v.id, at });
    return true;
  }
  happeningReady(id) {
    if (!this.isOpen()) return false;
    if (id === 'P9') return this.crowd.list.some((v) => v.mode === 'act' && v.act.kind === 'sunbathe');
    if (id === 'P10') return Object.keys(this.castles).some((k) => this.castles[k].stage >= 2) && !(this.events.active && this.events.active.kind === 'contest');
    if (id === 'P11') return this.lifeguardOn();
    if (id === 'P12') return PROPS.some((p) => /^par_/.test(p.id) && this.ok(p.need));
    return false;
  }
  happeningData(id, T) {
    const R = stream(this.seed, 'hap:' + id + ':' + Math.floor(T));
    if (id === 'P9') {
      const lying = this.crowd.list.filter((v) => v.mode === 'act' && v.act.kind === 'sunbathe');
      const v = lying[R.int(lying.length)];
      if (!v) return null;
      v.act.until = Math.max(v.act.until, T + 16);
      return { vid: v.id, x: v.x, y: v.y, crab: R.int(this.cfg.live.crabs || 1), pinchAt: T + 4.5 };
    }
    if (id === 'P10') {
      const ids = Object.keys(this.castles).filter((k) => this.castles[k].stage >= 2);
      const c = ids[R.int(ids.length)];
      return { castle: c, waveAt: T + 3, rebuild: T + 8 };
    }
    if (id === 'P11') {
      const i = R.range(97, 112);
      const a = LR(i, waterJ(i) + 0.4), b = LR(i - 0.6, -22.4), c = LR(i - 1.1, -23.2);
      const tower = PROPS.find((p) => p.id === 'tower');
      return { from: a, to: b, far: c, tower: tower ? LR(tower.i, tower.j) : a, kickAt: T + 1, paddleAt: T + 4, backAt: T + 13 };
    }
    if (id === 'P12') {
      const camps = PROPS.filter((p) => /^par_/.test(p.id) && this.ok(p.need));
      const p = camps[R.int(camps.length)];
      const [x0, y0] = LR(p.i, p.j), [x1, y1] = LR(p.i + 5.5 + R.next() * 2, Math.max(waterJ(p.i + 6) + 1.2, p.j - 1.2));
      return { prop: p.id, key: p.key, x0, y0, x1, y1, liftAt: T + 1.5, landAt: T + 7.5, hop: 150 };
    }
    return null;
  }
  /** the flying parasol of P12 at T: { x, y, z, rot, flying } */
  parasolAt(d, T) {
    if (!d) return null;
    if (T < d.liftAt) return { x: d.x0, y: d.y0, z: 0, rot: 0, flying: false };
    if (T >= d.landAt) return { x: d.x1, y: d.y1, z: 0, rot: 0.9, flying: false };
    const u = (T - d.liftAt) / (d.landAt - d.liftAt);
    const e = u * u * (3 - 2 * u);
    return { x: d.x0 + (d.x1 - d.x0) * e, y: d.y0 + (d.y1 - d.y0) * e, z: Math.sin(u * Math.PI) * d.hop + Math.sin(u * 14) * 8, rot: Math.sin(u * 9) * 0.6 + u * 6.28, flying: true };
  }
  venue(kind) {
    if (kind === 'polar') { const p = polarSpot(); return { x: p.x, y: p.y }; }
    if (kind === 'contest') return placePos('sandcastles');
    return placePos('beach');
  }

  // ------------------------------------------------------------------------------------------ staff and balconies
  /** fixed staff by open facilities: [{ id, role, preset, x, y, dir, depth, at, hours }] (story pids 'b:<id>') */
  staff(T = this.T) {
    const out = [], h = hourOf(T);
    const put = (at, key, def, roles, hours, k0 = 0) => {
      const [ax, ay] = LR(at.i, at.j);
      (def.staffPoints || []).forEach((pt, k) => {
        const role = (roles || def.staffRoles || [])[k] || 'clerk';
        out.push({ id: at.id + ':s' + k, role, preset: PRE[role] || 'beach_bar_staff', x: ax + pt[0], y: ay + pt[1], ay, dir: (def.staffDirs || [])[k] || def.staffDir || 'SW',
          depth: (def.staffDepths || [])[k] || def.staffDepth || 'behind', at: at.id, key, on: h >= hours[0] && h < hours[1], seed: k + k0 });
      });
    };
    for (const p of PROPS) {
      const d = this.defs[p.key];
      if (!d || !d.staffPoints || !this.ok(p.need)) continue;
      const roles = p.key === 'lifeguard_tower' ? ['lifeguard'] : p.key === 'icecream_cart' ? ['icecream_vendor'] : p.key === 'corn_stand' ? ['chef'] : ['attendant'];
      put(p, p.key, d, roles, p.key === 'lifeguard_tower' ? [8, 19] : [9, 18.5]);
    }
    for (const b of BUILDINGS) {
      const d = this.defs[b.key];
      if (!d || !d.staffPoints) continue;
      const open = b.shop ? this.ok('shop:' + b.shop) : this.ok(b.need || 'open');
      if (!open) continue;
      const hours = b.key === 'resort_hotel' ? [6, 23.5] : b.key === 'beach_bar' ? [10, 24] : b.key === 'lifeguard_station' ? [8, 19] : b.key === 'hotel_pool' ? [9, 18] : [8, 20];
      put(b, b.key, d, null, hours);
    }
    return out;
  }
  /** hotel guests on the balconies in the evening (by occupancy) */
  balconies(T = this.T) {
    const h = hourOf(T), H = this.cfg.hotel;
    if (!this.resort.hotel.level || h < H.balconyFrom - 1.5 || h >= H.balconyTo) return [];
    const slots = this.slots.of('balcony').filter((s) => s.key === 'resort_hotel' || (s.key === 'pension' && this.ok('extras')));
    const n = Math.min(slots.length, Math.ceil(this.resort.occupancy() * slots.length * 0.9));
    const R = stream(this.seed, 'balc:' + dayOf(T));
    const pick = R.shuffle(slots.slice()).slice(0, n);
    return pick.map((s, k) => ({ id: s.id, x: s.x, y: s.y, dir: s.dir, key: s.key, seed: R.int(1e9) + k, wave: (k + dayOf(T)) % 3 === 0 }));
  }

  // ------------------------------------------------------------------------------------------ time
  update(dt, T) {
    this.T = T;
    this.acc += dt;
    const step = this.cfg.tick;
    if (this.acc < step) return;
    const n = Math.min(8, Math.floor(this.acc / step));
    this.acc -= n * step;
    const DT = n * step;
    this.stats.ticks++;
    if (this.boardAt !== null && T >= this.boardAt) { this.boardAt = null; this.build('board', T); }
    if (this.fallbackFerry) this.ferries(T);
    this.crowd.step(T);
    this.stepCastles(DT);
    this.resort.hotelDay(T);
    this.resort.stepBuild(T);
    this.resort.rent(DT);
    this.events.step(T);
    if (this.resort.shops.size !== this.lastShops) { this.lastShops = this.resort.shops.size; this.checkStars(T); }
  }
  /** no harbour module: ferries dock at the tuning's hours (each once a day) */
  ferries(T) {
    const d = dayOf(T), h = hourOf(T);
    if (d !== this.ferryDay) { this.ferryDay = d; this.ferryDone = {}; }
    for (const fh of this.cfg.crowd.fallbackFerry) if (h >= fh && h < fh + 1 && !this.ferryDone[fh]) { this.ferryDone[fh] = 1; this.onFerry(this.cfg.crowd.fallbackN, T); }
  }

  /** public summaries */
  hotel() { const r = this.resort; return { level: r.hotel.level, rooms: r.rooms(), booked: r.roomsBooked(), occupancy: Math.round(r.occupancy() * 100) / 100 }; }
  crowdInfo() { const c = this.crowd; return { present: c.present(), swimmers: c.inWater(), lying: c.lying(), today: c.today, total: c.total, arrived: c.arrived, left: c.left }; }

  serialize() {
    const r = this.resort.serialize();
    const out = { v: 1, open: this.isOpen() ? 1 : 0, steps: Object.assign({}, this.steps), hotel: r.hotel, shops: r.shops, stars: { n: this.stars }, events: this.events.state(),
      crowd: { today: this.crowd.today, total: this.crowd.total, day: dayOf(this.T) } };
    if (this.clean && !this.steps.cleanup) out.clean = this.clean;
    if (r.card) out.card = r.card;
    if (r.fish) out.fish = r.fish;
    if (r.spendDay >= 0) out.sd = r.spendDay;
    if (this.steps.pool) out.facilities = { extras: 1 };
    return out;
  }
}

export { BEACH_HAPPENINGS };
