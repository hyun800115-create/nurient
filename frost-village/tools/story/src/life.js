// Life events and the town's population: sweethearts, proposals, weddings (town hall, guests),
// babies, growing up (school, first job), retiring, the gentle farewell of very old residents (own
// toggle), moving in (new households when there are empty homes) and moving out (unhappy, jobless,
// or simply off to new adventures), staying with friends after a fire and coming home again.

import { makeResident, Household, addToHousehold, removeFromHousehold, setHome, ageOf, groupOf, ageGroupOf,
  G_TODDLER, G_KID, G_TEEN, G_ADULT, G_ELDER, F_NEWCOMER, F_GONE, F_DEAD, F_HOMELESS, F_OWNER, S_IDLE, S_AWAY, S_EVENT } from './people.js';
import { ensureRel, getRel, removeAllRels, ST_FRIEND, ST_BEST, ST_SWEET, ST_ENGAGED, ST_SPOUSE, RF_FAMILY, RF_PARENT_A, RF_PARENT_B, RF_SIBLING, RF_NEIGHBOR, RF_CRUSH_A, RF_CRUSH_B } from './relations.js';
import { SRC_SEEN, SRC_DID, remember, forgetAll } from './memory.js';
import { B_OK } from './world.js';
import { A_EVENT, A_HOME } from './plans.js';

export class Life {
  constructor(e) {
    this.e = e;
    this.stats = { sweethearts: 0, engaged: 0, weddings: 0, babies: 0, grewUp: 0, firstJobs: 0, retired: 0, farewells: 0, movedIn: 0, movedOut: 0, newResidents: 0, leftResidents: 0, movedWithin: 0, housewarmings: 0, outings: 0 };
  }

  canRomance(a, b, rel) {
    const e = this.e;
    if (!e.cfg.lifeEvents) return false;
    if (rel.flags & RF_FAMILY) return false;
    if (rel.stage >= ST_SWEET) return true;
    if (groupOf(e, a) !== G_ADULT || groupOf(e, b) !== G_ADULT) return false;
    if (a.spouse >= 0 || b.spouse >= 0) return false;
    if (!e.cfg.romanceAnySex && a.male === b.male) return false;
    const aa = ageOf(e, a), ab = ageOf(e, b);
    if (aa < 21 || ab < 21 || aa > 58 || ab > 58 || Math.abs(aa - ab) > 10) return false;
    if (this.partnerOf(a) >= 0 || this.partnerOf(b) >= 0) return false;
    return true;
  }

  /** a single adult who could fall in love */
  canRomanceSolo(r) {
    const e = this.e;
    if (!e.cfg.lifeEvents || r.spouse >= 0 || groupOf(e, r) !== G_ADULT) return false;
    const age = ageOf(e, r);
    return age >= 21 && age <= 55 && this.partnerOf(r) < 0;
  }

  partnerOf(r) {
    for (const rel of r.adj) if (rel.stage >= ST_SWEET) return rel.other(r.id);
    return -1;
  }

  becomeSweethearts(a, b, rel) {
    const e = this.e;
    rel.stage = ST_SWEET; rel.sweetDay = e.clock.day;
    rel.flags &= ~(RF_CRUSH_A | RF_CRUSH_B);
    a.crushOn = -1; b.crushOn = -1;
    this.stats.sweethearts++;
    const f = e.fact('sweetheart', { a: a.id, b: b.id, p: a.loc });
    e.learn(a, f, SRC_DID); e.learn(b, f, SRC_DID);
    if (a.loc >= 0) e.witness(f, e.world.places[a.loc], a.id, b.id);
    if (e.bus.has('life')) e.bus.emit('life', { op: 'sweetheart', a: a.id, b: b.id });
  }

  engage(a, b, rel) {
    const e = this.e;
    rel.stage = ST_ENGAGED;
    this.stats.engaged++;
    const day = e.clock.day + 2;
    const f = e.fact('engaged', { a: a.id, b: b.id, n: day, p: a.loc });
    f.pinned++;
    e.learn(a, f, SRC_DID); e.learn(b, f, SRC_DID);
    if (a.loc >= 0) e.witness(f, e.world.places[a.loc], a.id, b.id);
    e.schedule(day * e.cfg.dayLength + Math.floor(e.cfg.dayLength * (11 / 24)), 'wedding', [a.id, b.id, f.id]);
    if (e.bus.has('life')) e.bus.emit('life', { op: 'engaged', a: a.id, b: b.id, day });
  }

  wedding(data) {
    const e = this.e;
    const [ia, ib, fid] = data;
    const a = e.people[ia], b = e.people[ib];
    const ef = e.facts.get(fid);
    if (ef) ef.pinned--;
    if (!a || !b || !a.alive || !b.alive) return;
    const rel = getRel(e, ia, ib);
    if (!rel || rel.stage !== ST_ENGAGED) return;
    rel.stage = ST_SPOUSE;
    a.spouse = b.id; b.spouse = a.id;
    this.stats.weddings++;
    const hall = e.world.first('town_hall');
    const f = e.fact('wedding', { a: a.id, b: b.id, p: hall ? hall.idx : -1 });
    // guests: family and close friends of both
    const guests = [];
    for (const r of [a, b]) {
      for (const rr of r.adj) {
        const o = e.people[rr.other(r.id)];
        if (!o.alive || o === a || o === b || guests.indexOf(o.id) >= 0) continue;
        if ((rr.flags & RF_FAMILY) || rr.stage >= ST_FRIEND) guests.push(o.id);
      }
    }
    guests.sort((x, y) => x - y);
    guests.length = Math.min(guests.length, 14);
    for (const r of [a, b]) { e.learn(r, f, SRC_DID); r.mood = Math.min(100, r.mood + 40); }
    for (const id of guests) {
      const g = e.people[id];
      e.learn(g, f, SRC_SEEN);
      if (hall && g.state !== 3 && !(g.flags & 64)) { e.plans.goTo(g, hall.idx, A_EVENT, { reason: 'wedding' }); g.busyUntil = e.now + 40; }
    }
    if (hall) { e.plans.goTo(a, hall.idx, A_EVENT, { reason: 'wedding' }); e.plans.goTo(b, hall.idx, A_EVENT, { reason: 'wedding' }); a.busyUntil = b.busyUntil = e.now + 45; }
    if (e.bus.has('life')) e.bus.emit('life', { op: 'wedding', a: a.id, b: b.id, place: hall ? hall.id : null, guests });
    // live together: the bigger household's home, or a free home that fits everyone
    this.mergeHouseholds(a, b);
  }

  mergeHouseholds(a, b) {
    const e = this.e;
    const ha = e.households.get(a.hh), hb = e.households.get(b.hh);
    if (ha && hb && ha === hb) return;
    // both move with their dependants? keep it simple: the spouse joins; kids from before stay with them
    const into = !ha ? hb : !hb ? ha : ha.members.length >= hb.members.length ? ha : hb;
    const mover = into === ha ? b : a;
    if (!into) return;
    const home = into.home >= 0 ? e.world.places[into.home] : null;
    if (home && into.members.length + 1 > home.cap) {
      const free = this.findHome(into.members.length + 1);
      if (free) { setHome(e, into, free.idx); this.stats.movedWithin++; if (e.bus.has('move')) e.bus.emit('move', { op: 'within', household: into.id, members: into.members.slice(), home: free.id }); }
    }
    addToHousehold(e, into, mover);
    const f = e.fact('move_within', { a: mover.id, p: into.home });
    e.learn(mover, f, SRC_DID);
  }

  findHome(size) {
    const e = this.e;
    let best = null;
    for (const h of e.world.homes()) if (h.state === B_OK && h.hh < 0 && h.cap >= size && (!best || h.cap < best.cap)) best = h;
    return best;
  }

  // ---------------------------------------------------------------- daily
  daily() {
    this.aging();
    if (this.e.cfg.lifeEvents) this.babies();
    this.moves();
  }

  /** birthdays into the next age group, newcomers settling in, gentle farewells, old agendas */
  aging() {
    const e = this.e, rng = e.rng, day = e.clock.day;
    const list = e.alive.slice();
    for (const r of list) {
      if (!r.alive) continue;
      const age = ageOf(e, r);
      const g = ageGroupOf(age);
      if (r.lastGroup < 0) r.lastGroup = g;
      if (g !== r.lastGroup) this.grow(r, r.lastGroup, g);
      r.lastGroup = g;
      if (r.flags & F_NEWCOMER && day - (r.arrived || 0) >= 3) r.flags &= ~F_NEWCOMER;
      // gentle farewell of the very old (can be switched off)
      if (e.cfg.lifeEvents && e.cfg.farewell && g === G_ELDER && age >= 86 && rng.chance(0.004 * (age - 85))) this.farewell(r);
      // agenda clean-up
      if (r.agenda.length) r.agenda = r.agenda.filter((a) => a[0] >= day);
    }
    this.dates();
  }

  /** sweethearts and the engaged plan a date for tomorrow evening (a café, the park, the ice rink …) */
  dates() {
    const e = this.e, rng = e.rng, day = e.clock.day + 1;
    if (!e.cfg.lifeEvents) return;
    for (const r of e.alive) {
      const o = this.partnerOf(r);
      if (o < r.id) continue;                 // each pair once (and skips -1)
      const p = e.people[o];
      if (!p || !p.alive || r.spouse === o) continue;
      if (!rng.chance(0.55)) continue;
      if (r.agenda.some((a) => a[0] === day) || p.agenda.some((a) => a[0] === day)) continue;
      const kinds = ['cafe', 'park', 'ice_rink', 'restaurant', 'plaza', 'beach_fire', 'bakery'];
      let place = null;
      for (let k = 0; k < 4 && !place; k++) { const list = e.world.all(kinds[rng.int(kinds.length)]).filter((q) => q.state === B_OK); if (list.length) place = list[rng.int(list.length)]; }
      if (!place) continue;
      const min = 1020 + rng.int(7) * 15;
      r.agenda.push([day, min, place.idx, p.id]);
      p.agenda.push([day, min, place.idx, r.id]);
    }
  }

  grow(r, from, to) {
    const e = this.e;
    this.stats.grewUp++;
    if (to === G_KID) {
      r.job = 'student';
      const sc = e.world.first('school');
      r.work = sc ? sc.idx : -1;
      const f = e.fact('grow', { a: r.id, s: 'school' });
      e.learn(r, f, SRC_DID);
      for (const pid of r.parents) { const p = e.people[pid]; if (p && p.alive) e.learn(p, f, SRC_DID); }
    } else if (to === G_ADULT) {
      r.job = 'none'; r.work = -1;
      e.jobs.firstJob(r);
      if (r.job !== 'none') {
        this.stats.firstJobs++;
        const f = e.fact('first_job', { a: r.id, p: r.work, s: r.job });
        e.learn(r, f, SRC_DID);
      }
    } else if (to === G_ELDER) {
      if (!(r.flags & F_OWNER)) {
        e.jobs.retire(r);
        this.stats.retired++;
        const f = e.fact('retire', { a: r.id });
        e.learn(r, f, SRC_DID);
      }
    }
    if (e.bus.has('life')) e.bus.emit('life', { op: 'grow', who: r.id, group: ['toddler', 'kid', 'teen', 'adult', 'elder'][to] });
  }

  babies() {
    const e = this.e, rng = e.rng;
    for (const r of e.alive) {
      if (r.male || r.spouse < 0 || !r.alive) continue;
      const sp = e.people[r.spouse];
      if (!sp || !sp.alive || sp.hh !== r.hh) continue;
      const age = ageOf(e, r);
      if (age < 23 || age > 42) continue;
      if (r.kids.length >= 3) continue;
      if (r.lastBaby && e.clock.day - r.lastBaby < 8) continue;
      if (!rng.chance(e.cfg.babyRate)) continue;
      this.baby(r, sp);
    }
  }

  baby(mom, dad) {
    const e = this.e;
    const hh = e.households.get(mom.hh);
    const b = makeResident(e, { age: 0, sur: dad.sur });
    b.birth = e.clock.day;
    b.lastGroup = G_TODDLER;
    b.parents = [mom.id, dad.id];
    mom.kids.push(b.id); dad.kids.push(b.id);
    mom.lastBaby = e.clock.day;
    if (hh) addToHousehold(e, hh, b);
    for (const p of [mom, dad]) {
      const rel = ensureRel(e, p, b);
      rel.flags |= RF_FAMILY | (p.id === rel.a ? RF_PARENT_A : RF_PARENT_B);
      rel.fam = 800; rel.aff = 900; rel.stage = ST_BEST; rel.n = 1;
    }
    for (const kid of mom.kids) {
      if (kid === b.id) continue;
      const k = e.people[kid];
      if (!k || !k.alive) continue;
      const rel = ensureRel(e, k, b); rel.flags |= RF_FAMILY | RF_SIBLING; rel.fam = 500; rel.aff = 700; rel.stage = ST_FRIEND; rel.n = 1;
    }
    this.stats.babies++;
    this.stats.newResidents++;
    const clinic = e.world.first('clinic');
    const f = e.fact('baby', { a: mom.id, b: dad.id, c: b.id, p: clinic ? clinic.idx : -1 });
    e.learn(mom, f, SRC_DID); e.learn(dad, f, SRC_DID);
    mom.mood = Math.min(100, mom.mood + 40); dad.mood = Math.min(100, dad.mood + 40);
    // the baby's home may be too small now: a bigger house (with a house loan)
    const home = hh && hh.home >= 0 ? e.world.places[hh.home] : null;
    if (home && hh.members.length > home.cap) {
      const free = this.findHome(hh.members.length);
      if (free) {
        setHome(e, hh, free.idx);
        this.stats.movedWithin++;
        if (e.bus.has('move')) e.bus.emit('move', { op: 'within', household: hh.id, members: hh.members.slice(), home: free.id });
        e.bank.lend(dad.wallet + dad.savings > mom.wallet + mom.savings ? dad : mom, 'house', 300 + free.cap * 60, free.idx);
      }
    }
    if (e.bus.has('life')) e.bus.emit('life', { op: 'baby', a: mom.id, b: dad.id, baby: b.id, place: clinic ? clinic.id : null });
  }

  farewell(r) {
    const e = this.e;
    this.stats.farewells++;
    const f = e.fact('farewell', { a: r.id, p: r.home });
    f.pinned++;
    // family and friends know first
    for (const rel of r.adj) {
      const o = e.people[rel.other(r.id)];
      if (!o.alive) continue;
      if ((rel.flags & RF_FAMILY) || rel.stage >= ST_FRIEND) { e.learn(o, f, SRC_DID); o.mood = Math.max(-100, o.mood - 25); }
    }
    if (r.spouse >= 0) { const sp = e.people[r.spouse]; if (sp) { sp.spouse = -1; sp.widowed = r.id; } }
    if (e.bus.has('life')) e.bus.emit('life', { op: 'farewell', who: r.id });
    const mg = e.world.first('memorial');
    e.schedule(e.now + Math.floor(e.cfg.dayLength * 0.6), 'memorial', [r.id, f.id, mg ? mg.idx : -1]);
    this.remove(r, F_DEAD);
  }

  memorial(data) {
    const e = this.e;
    const [id, fid, mgIdx] = data;
    const ff = e.facts.get(fid);
    if (ff) ff.pinned--;
    const r = e.people[id];
    const mg = mgIdx >= 0 ? e.world.places[mgIdx] : null;
    const f = e.fact('memorial', { a: id, p: mgIdx });
    const mourners = [];
    for (const o of e.alive) {
      const fam = r.parents.indexOf(o.id) >= 0 || r.kids.indexOf(o.id) >= 0 || o.widowed === id;
      if (!fam && !(o.mem.some((m) => m.f === ff && m.src === SRC_DID))) continue;
      mourners.push(o.id);
      e.learn(o, f, SRC_SEEN);
      if (mg && o.state !== 3) { e.plans.goTo(o, mg.idx, A_EVENT, { reason: 'memorial' }); o.busyUntil = e.now + 40; }
      if (mourners.length >= 12) break;
    }
    if (e.bus.has('life')) e.bus.emit('life', { op: 'memorial', who: id, place: mg ? mg.id : null, mourners });
  }

  /** a resident leaves the story (moved away or farewell): no orphans left behind */
  remove(r, flag) {
    const e = this.e;
    e.bank.settleLeaving(r);
    e.world.leave(r);
    removeFromHousehold(e, r);
    removeAllRels(e, r);
    forgetAll(e, r);
    r.alive = false;
    r.flags |= flag;
    r.goneDay = e.clock.day;
    r.state = S_AWAY;
    r.qs.length = 0; r.agenda.length = 0;
    const i = e.alive.indexOf(r);
    if (i >= 0) e.alive.splice(i, 1);
    e.usedNames.delete(r.given);
    if (r.work >= 0 && (r.flags & F_OWNER)) {
      // the shop is taken over by someone else (or stays open with its staff)
      const p = e.world.places[r.work];
      if (p.owner === r.id) {
        let heir = -1;
        for (const k of r.kids) { const kk = e.people[k]; if (kk && kk.alive && groupOf(e, kk) === G_ADULT) { heir = k; break; } }
        p.owner = heir;
        if (heir >= 0) { const h = e.people[heir]; h.flags |= F_OWNER; h.job = r.job; h.work = p.idx; }
      }
    }
    // pending loans are settled by the town's mutual-aid fund (Bank.daily forgives them)
    this.stats.leftResidents++;
  }

  // ---------------------------------------------------------------- moving in / out
  moves() {
    const e = this.e, rng = e.rng, day = e.clock.day;
    // leaving: households who are unhappy for days, or simply off on an adventure
    for (const hh of Array.from(e.households.values())) {
      if (hh.planOut >= 0) { if (day >= hh.planOut) this.moveOut(hh); continue; }
      let mood = 0, adults = 0, jobless = 0, friends = 0;
      for (const id of hh.members) {
        const r = e.people[id];
        mood += r.mood;
        if (groupOf(e, r) === G_ADULT) { adults++; if (r.job === 'none' && r.jobless > 3) jobless++; }
        for (const rel of r.adj) if (rel.stage >= ST_FRIEND && !(rel.flags & RF_FAMILY)) friends++;
      }
      mood /= Math.max(1, hh.members.length);
      const bad = (mood < -10 ? 1 : 0) + (adults && jobless === adults ? 1 : 0) + (friends < 1 && day - hh.since > 5 ? 1 : 0);
      hh.unhappy = bad ? hh.unhappy + bad : Math.max(0, hh.unhappy - 1);
      if ((hh.unhappy >= 10 && rng.chance(0.12)) || rng.chance(e.cfg.moveOutRate)) this.planMoveOut(hh, hh.unhappy >= 5 ? (jobless ? 'job' : 'lonely') : rng.pick(['family', 'adventure', 'city', 'sea']));
    }
    // arriving: empty homes attract new households
    const target = e.cfg.targetPop || e.initialPop;
    let vac = e.world.vacancies();
    let arrivals = 0;
    while (vac > 0 && e.alive.length < target * 1.06 && arrivals < 2 && rng.chance(Math.min(0.9, e.cfg.moveInRate + 0.07 * vac))) { this.moveIn(); vac--; arrivals++; }
  }

  planMoveOut(hh, why) {
    const e = this.e;
    hh.planOut = e.clock.day + 2;
    hh.why = why;
    const head = e.people[hh.members[0]];
    const f = e.fact('move_plan', { a: head.id, n: hh.id, s: why });
    for (const id of hh.members) e.learn(e.people[id], f, SRC_DID);
    if (e.bus.has('move')) e.bus.emit('move', { op: 'plan', household: hh.id, members: hh.members.slice(), day: hh.planOut, why });
  }

  moveOut(hh) {
    const e = this.e;
    const members = hh.members.slice();
    const home = hh.home >= 0 ? e.world.places[hh.home] : null;
    const head = e.people[members[0]];
    const f = e.fact('move_out', { a: head.id, n: members.length, p: hh.home, s: hh.why || 'adventure' });
    // neighbours and friends see the moving truck
    for (const id of members) for (const rel of e.people[id].adj) { const o = e.people[rel.other(id)]; if (o.alive && rel.stage >= ST_FRIEND) e.learn(o, f, SRC_SEEN); }
    this.stats.movedOut++;
    if (e.bus.has('move')) e.bus.emit('move', { op: 'out', household: hh.id, members, home: home ? home.id : null });
    for (const id of members) this.remove(e.people[id], F_GONE);
    if (home) { home.hh = -1; home.residents.length = 0; }
  }

  moveIn() {
    const e = this.e, rng = e.rng;
    const kinds = [['single', 3], ['couple', 3], ['family', 4], ['elders', 1.5], ['single_parent', 1]];
    const k = kinds[rng.weighted(kinds.map((x) => x[1]))][0];
    const size = k === 'single' ? 1 : k === 'couple' || k === 'elders' ? 2 : k === 'single_parent' ? 2 + rng.int(2) : 3 + rng.int(2);
    const home = this.findHome(size) || this.findHome(1);
    if (!home) return null;
    const hh = e.newHousehold();
    setHome(e, hh, home.idx);
    hh.since = e.clock.day;
    const members = e.makeFamily(hh, k, size);
    for (const r of members) { r.flags |= F_NEWCOMER; r.arrived = e.clock.day; }
    e.jobs.fillOpenings(true);
    this.stats.movedIn++;
    this.stats.newResidents += members.length;
    const f = e.fact('move_in', { a: members[0].id, n: hh.id, p: home.idx });
    for (const r of members) e.learn(r, f, SRC_DID);
    // people outside see the moving truck and wonder who it is
    for (const p of e.world.places) {
      if (p.cat !== 'outdoor') continue;
      for (const id of p.here) { const r = e.people[id]; if (r.alive && !(r.flags & F_NEWCOMER) && rng.chance(0.35)) { remember(e, r, f, SRC_SEEN, -1, { d: 3, alt: -1 }); e.social.addQ(r, 'who', f); } }
    }
    for (const r of members) e.plans.build(r, e.clock.day, e.clock.minute);
    if (e.bus.has('move')) e.bus.emit('move', { op: 'in', household: hh.id, members: members.map((m) => m.id), home: home.id, kind: k });
    return hh;
  }

  // ---------------------------------------------------------------- after a fire
  evacuate(b) {
    const e = this.e;
    if (b.cat === 'home') {
      for (const id of b.residents) {
        const r = e.people[id];
        if (!r || !r.alive) continue;
        // a relative's or best friend's home
        let host = -1, bs = 0;
        for (const rel of r.adj) {
          const o = e.people[rel.other(r.id)];
          if (!o.alive || o.home < 0 || o.home === b.idx) continue;
          const h = e.world.places[o.home];
          if (h.state !== B_OK) continue;
          const sc = (rel.flags & RF_FAMILY ? 2000 : 0) + rel.aff + rel.fam;
          if (sc > bs) { bs = sc; host = o.home; }
        }
        r.stayWith = host;
        r.flags |= F_HOMELESS;
        e.plans.build(r, e.clock.day, e.clock.minute);
      }
    }
  }

  returnHome(b) {
    const e = this.e;
    let owner = null;
    for (const id of b.residents) {
      const r = e.people[id];
      if (!r || !r.alive) continue;
      r.stayWith = -1;
      r.flags &= ~F_HOMELESS;
      r.mood = Math.min(100, r.mood + 30);
      if (!owner) owner = r;
    }
    if (b.cat === 'shop' && b.owner >= 0) owner = e.people[b.owner];
    if (owner && owner.alive) {
      this.stats.housewarmings++;
      const f = e.fact('housewarming', { a: owner.id, p: b.idx });
      e.learn(owner, f, SRC_DID);
      // friends drop by
      let n = 0;
      for (const rel of owner.adj) {
        if (rel.stage < ST_FRIEND || n >= 6) continue;
        const o = e.people[rel.other(owner.id)];
        if (!o.alive || o.state === 3) continue;
        e.learn(o, f, SRC_SEEN);
        e.plans.goTo(o, b.idx, A_EVENT, { reason: 'housewarming' }); o.busyUntil = e.now + 30;
        n++;
      }
      if (e.bus.has('life')) e.bus.emit('life', { op: 'housewarming', who: owner.id, place: b.id });
    }
  }
}
