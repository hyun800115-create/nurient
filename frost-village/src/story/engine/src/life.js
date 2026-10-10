// Life events and the town's population: sweethearts, proposals, weddings (town hall, guests),
// babies, growing up (school, first job), retiring, the gentle farewell of very old residents (own
// toggle), moving in (new households when there are empty homes) and moving out (unhappy, jobless,
// or simply off to new adventures), staying with friends after a fire and coming home again.

import { makeResident, Household, addToHousehold, removeFromHousehold, setHome, ageOf, groupOf, ageGroupOf, isKept,
  G_TODDLER, G_KID, G_TEEN, G_ADULT, G_ELDER, F_NEWCOMER, F_GONE, F_DEAD, F_HOMELESS, F_OWNER, F_LEASED, F_XPLAN, S_IDLE, S_AWAY, S_EVENT } from './people.js';
import { ensureRel, getRel, removeAllRels, ST_FRIEND, ST_BEST, ST_SWEET, ST_ENGAGED, ST_SPOUSE, RF_FAMILY, RF_PARENT_A, RF_PARENT_B, RF_SIBLING, RF_NEIGHBOR, RF_CRUSH_A, RF_CRUSH_B } from './relations.js';
import { SRC_SEEN, SRC_DID, remember, forgetAll } from './memory.js';
import { B_OK } from './world.js';
import { A_EVENT, A_HOME } from './plans.js';

export class Life {
  constructor(e) {
    this.e = e;
    this.stats = { sweethearts: 0, engaged: 0, weddings: 0, babies: 0, grewUp: 0, firstJobs: 0, retired: 0, farewells: 0, movedIn: 0, movedOut: 0, newResidents: 0, leftResidents: 0, movedWithin: 0, housewarmings: 0, outings: 0 };
    this.lastWeddingDay = -1e9;     // (E9) the latest wedding day booked (weddingGapDays spaces them)
    this.lastFarewellDay = -1e9;    // (story_runtime) gentle farewells are spaced (farewellGapDays)
  }

  canRomance(a, b, rel) {
    const e = this.e;
    if (!e.cfg.lifeEvents) return false;
    if (rel.flags & RF_FAMILY) return false;
    if (rel.stage >= ST_SWEET) return true;
    if (isKept(e, a) || isKept(e, b)) return false;     // the game's named villagers stay as the game draws them
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
    if (!e.cfg.lifeEvents || r.spouse >= 0 || groupOf(e, r) !== G_ADULT || isKept(e, r)) return false;
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

  engage(a, b, rel, opts) {
    const e = this.e, c = e.cfg;
    rel.stage = ST_ENGAGED;
    this.stats.engaged++;
    // (E9) the wedding is weddingInDays later at weddingHour, and never closer than weddingGapDays to the last one
    const inDays = opts && opts.inDays !== undefined ? opts.inDays : c.weddingInDays !== undefined ? c.weddingInDays : 2;
    let day = opts && Number.isFinite(opts.day) ? Math.max(e.clock.day, opts.day | 0) : e.clock.day + Math.max(0, inDays | 0);
    if (c.weddingGapDays > 0 && !(opts && (opts.ignoreGap || Number.isFinite(opts.day)))) day = Math.max(day, this.lastWeddingDay + c.weddingGapDays);
    // (story_runtime) one ceremony a day: never on the day of a gentle farewell (the memorial garden at 10:00)
    if (c.avoidClash && !(opts && Number.isFinite(opts.day))) for (let k = 0; k < 4 && this.dayBusy(day, 'wedding'); k++) day++;
    if (day > this.lastWeddingDay) this.lastWeddingDay = day;
    const hour = opts && opts.hour !== undefined ? opts.hour : c.weddingHour !== undefined ? c.weddingHour : 11;
    const f = e.fact('engaged', { a: a.id, b: b.id, n: day, p: a.loc });
    f.pinned++;
    e.learn(a, f, SRC_DID); e.learn(b, f, SRC_DID);
    if (a.loc >= 0) e.witness(f, e.world.places[a.loc], a.id, b.id);
    e.schedule(day * c.dayLength + Math.floor(c.dayLength * (hour / 24)), 'wedding', [a.id, b.id, f.id]);
    if (e.bus.has('life')) e.bus.emit('life', { op: 'engaged', a: a.id, b: b.id, day, hour, place: a.loc >= 0 ? e.world.places[a.loc].id : null, scripted: !!(opts && opts.scripted), silent: !!(opts && opts.silent) });
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
    a.wedDay = b.wedDay = e.clock.day;
    const hall = e.world.first('town_hall', { prefer: 'ours', ok: true });     // (E9) our 마을회관 when it is built
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
    // the bigger household's home (a named villager keeps the home the game draws)
    let into = !ha ? hb : !hb ? ha : ha.members.length >= hb.members.length ? ha : hb;
    if (ha && hb && isKept(e, b) && !isKept(e, a)) into = hb;
    else if (ha && hb && isKept(e, a) && !isKept(e, b)) into = ha;
    const mover = into === ha ? b : a;
    if (!into) return;
    // the spouse moves in with their children (and any other child who would be left without a grown-up)
    const old = e.households.get(mover.hh);
    const movers = [mover];
    if (old) {
      const rest = old.members.filter((id) => id !== mover.id);
      const grownLeft = rest.some((id) => groupOf(e, e.people[id]) >= G_ADULT);
      for (const id of rest) { const k = e.people[id]; if (groupOf(e, k) <= G_TEEN && (!grownLeft || mover.kids.indexOf(id) >= 0)) movers.push(k); }
    }
    const home = into.home >= 0 ? e.world.places[into.home] : null;
    if (home && into.members.length + movers.length > home.cap) {
      const free = this.findHome(into.members.length + movers.length);
      if (free) { setHome(e, into, free.idx); this.stats.movedWithin++; if (e.bus.has('move')) e.bus.emit('move', { op: 'within', household: into.id, members: into.members.slice(), home: free.id }); }
    }
    for (const r of movers) addToHousehold(e, into, r);
    const f = e.fact('move_within', { a: mover.id, p: into.home });
    for (const r of movers) e.learn(r, f, SRC_DID);
    if (e.bus.has('move')) e.bus.emit('move', { op: 'within', household: into.id, members: movers.map((r) => r.id), home: home ? home.id : null, why: 'wedding' });
  }

  /** a household left with children only (a parent's gentle farewell, a parent moving in with a new spouse):
   *  the children go to live with a parent, a grandparent or a grown-up sibling — or the family moves to relatives */
  ensureGuardian(hh) {
    const e = this.e;
    if (!hh || hh.leaving || !hh.members.length) return;
    for (const id of hh.members) if (groupOf(e, e.people[id]) >= G_ADULT) return;
    const kids = hh.members.map((id) => e.people[id]);
    let host = null;
    for (const k of kids) {
      for (const pid of k.parents) { const p = e.people[pid]; if (p && p.alive && p.hh >= 0 && p.hh !== hh.id) { host = e.households.get(p.hh); break; } }
      if (host) break;
      for (const rel of k.adj) {
        const o = e.people[rel.other(k.id)];
        if (o.alive && (rel.flags & RF_FAMILY) && groupOf(e, o) >= G_ADULT && o.hh >= 0 && o.hh !== hh.id) { host = e.households.get(o.hh); break; }
      }
      if (host) break;
    }
    if (host) {
      const home = host.home >= 0 ? e.world.places[host.home] : null;
      if (home && host.members.length + kids.length > home.cap) { const free = this.findHome(host.members.length + kids.length); if (free) setHome(e, host, free.idx); }
      for (const k of kids) addToHousehold(e, host, k);
      if (e.bus.has('move')) e.bus.emit('move', { op: 'within', household: host.id, members: kids.map((k) => k.id), home: host.home >= 0 ? e.world.places[host.home].id : null, why: 'family' });
    } else { hh.why = 'family'; this.moveOut(hh); }
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
    const bday = e.bus.has('life');
    for (const r of list) {
      if (!r.alive) continue;
      const age = ageOf(e, r);
      const g = ageGroupOf(age);
      if (r.lastGroup < 0) r.lastGroup = g;
      if (g !== r.lastGroup) this.grow(r, r.lastGroup, g);
      r.lastGroup = g;
      // (E7) a birthday (the game stages first steps at 4, the first school day at 7, a first job at 16 …)
      if (r.lastAge >= 0 && age > r.lastAge && bday) e.bus.emit('life', { op: 'birthday', who: r.id, age });
      r.lastAge = age;
      if (r.flags & F_NEWCOMER && day - (r.arrived || 0) >= 3) r.flags &= ~F_NEWCOMER;
      // gentle farewell of the very old (can be switched off; the game's gates: farewellAllowed)
      if (r.farewellDay !== undefined && r.farewellDay >= 0) {
        // (story_runtime) the last day was yesterday: the farewell is today (unless the game switched it off)
        if (day >= r.farewellDay) { r.farewellDay = -1; if (e.cfg.lifeEvents && e.cfg.farewell) this.farewell(r); }
        continue;
      }
      if (e.cfg.lifeEvents && e.cfg.farewell && g === G_ELDER && age >= 86 && !isKept(e, r) && this.farewellAllowed(r) && rng.chance(0.004 * (age - 85))) {
        if (e.cfg.farewellLastDay) {
          // a whole last day first: favourite places, gentle words to the chief, the sunset on the garden bench
          r.farewellDay = day + 1;
          this.lastFarewellDay = day + 1;
          if (e.bus.has('life')) e.bus.emit('life', { op: 'lastday', who: r.id, day: day + 1 });
        } else this.farewell(r);
      }
      // agenda clean-up
      if (r.agenda.length) r.agenda = r.agenda.filter((a) => a[0] >= day);
    }
    this.dates();
  }

  /** (story_runtime) the game's gentle-farewell gates: a memorial garden exists, not too early in the game, spaced
   *  farewellGapDays apart, not within farewellBirthGapDays of a birth in the family, not while the game holds them */
  farewellAllowed(r) {
    const e = this.e, c = e.cfg, day = e.clock.day;
    if (c.farewellHold) return false;
    // (story_runtime) one ceremony a day: no farewell (tomorrow, after the last day) on a wedding day
    if (c.avoidClash && this.dayBusy(day + (c.farewellLastDay ? 1 : 0), 'farewell')) return false;
    if (c.farewellNeedsGarden && !e.world.first('memorial')) return false;
    if (c.farewellFromDay && day < c.farewellFromDay) return false;
    if (c.farewellGapDays && day - this.lastFarewellDay < c.farewellGapDays) return false;
    if (r.flags & F_LEASED) return false;
    if (c.farewellBirthGapDays) {
      const gap = c.farewellBirthGapDays;
      for (const k of r.kids) { const kk = e.people[k]; if (kk && kk.alive && kk.lastBaby && day - kk.lastBaby < gap) return false; }
      const hh = e.households.get(r.hh);
      if (hh) for (const id of hh.members) { const m = e.people[id]; if (m && day - m.birth < gap && m.birth <= day) return false; }
    }
    return true;
  }

  /** (story_runtime) a day that already has a ceremony: a booked wedding (for a farewell), a farewell or the memorial
   *  ceremony (for a wedding) */
  dayBusy(day, forKind) {
    const e = this.e, L = e.cfg.dayLength;
    for (const [at, kind] of e.sched) {
      if (Math.floor(at / L) !== day) continue;
      if (forKind === 'farewell' && kind === 'wedding') return true;
      if (forKind === 'wedding' && kind === 'memorial') return true;
    }
    if (forKind === 'wedding') for (const r of e.alive) if (r.farewellDay === day) return true;
    return false;
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
      if (sc) e.introduceAt(r, sc);
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

  /** share of children (and teens) and of grandparents in town — move-ins and babies lean against an ageing town */
  ageMix() {
    const e = this.e;
    let young = 0, old = 0;
    for (const r of e.alive) { const g = groupOf(e, r); if (g <= G_TEEN) young++; else if (g === G_ELDER) old++; }
    const n = Math.max(1, e.alive.length);
    return { young: young / n, old: old / n };
  }

  babies() {
    const e = this.e, rng = e.rng;
    const mix = this.ageMix();
    const boost = mix.young < 0.22 ? 1 + 2.5 * (0.22 - mix.young) / 0.22 : 1;
    for (const r of e.alive) {
      if (r.male || r.spouse < 0 || !r.alive) continue;
      const sp = e.people[r.spouse];
      if (!sp || !sp.alive || sp.hh !== r.hh) continue;
      const age = ageOf(e, r);
      if (age < 23 || age > 42) continue;
      if (r.kids.length >= 3) continue;
      if (r.lastBaby && e.clock.day - r.lastBaby < 8) continue;
      if (e.cfg.babyAfterWeddingDays && r.wedDay !== undefined && e.clock.day - r.wedDay < e.cfg.babyAfterWeddingDays) continue;
      if (r.expecting) continue;
      if (!rng.chance(e.cfg.babyRate * boost)) continue;
      this.expect(r, sp);
    }
  }

  /** (story_runtime) good news first, the baby birthAfterNews days later (0 = born right away, the engine's old way) */
  expect(mom, dad, inDays) {
    const e = this.e;
    const d = inDays !== undefined ? inDays : e.cfg.birthAfterNews || 0;
    if (!(d > 0)) { this.baby(mom, dad); return; }
    mom.expecting = 1;
    if (e.bus.has('life')) e.bus.emit('life', { op: 'goodnews', a: mom.id, b: dad.id, home: mom.home >= 0 ? e.world.places[mom.home].id : null, inDays: d });
    // (story_runtime) birthHour: the parents walk to the clinic at dusk of the birth day (−1 = d days from now)
    const L = e.cfg.dayLength;
    const at = e.cfg.birthHour >= 0 ? (e.clock.day + Math.max(1, Math.round(d))) * L + Math.floor(L * e.cfg.birthHour / 24) : e.now + Math.round(d * L);
    e.schedule(at, 'birth', [mom.id, dad.id]);
  }

  birth(data) {
    const e = this.e, mom = e.people[data[0]], dad = e.people[data[1]];
    if (mom) mom.expecting = 0;
    if (!mom || !mom.alive || !dad || !dad.alive) return;
    this.baby(mom, dad);
  }

  baby(mom, dad) {
    const e = this.e;
    const hh = e.households.get(mom.hh);
    const b = makeResident(e, { age: 0, sur: dad.sur });
    b.birth = e.clock.day;
    if (e.cfg.externalPlans) b.flags |= F_XPLAN;     // (E1) the game gives the child a body (a stroller, then a doll at 4)
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
    this.lastFarewellDay = e.clock.day;
    const f = e.fact('farewell', { a: r.id, p: r.home });
    f.pinned++;
    // family and friends know first
    for (const rel of r.adj) {
      const o = e.people[rel.other(r.id)];
      if (!o.alive) continue;
      if ((rel.flags & RF_FAMILY) || rel.stage >= ST_FRIEND) { e.learn(o, f, SRC_DID); o.mood = Math.max(-100, o.mood - 25); }
    }
    if (r.spouse >= 0) { const sp = e.people[r.spouse]; if (sp) { sp.spouse = -1; sp.widowed = r.id; } }
    if (e.bus.has('life')) e.bus.emit('life', { op: 'farewell', who: r.id, name: e.name(r.id, 'ko'), nameEn: e.name(r.id, 'en'), age: ageOf(e, r), male: r.male });
    const mg = e.world.first('memorial', { prefer: 'ours', ok: true });
    // (story_runtime) memorialAt = the next day's game hour of the ceremony (10:00); 0 = the engine's 0.6 day later
    const L = e.cfg.dayLength;
    let at = e.now + Math.floor(L * 0.6);
    if (e.cfg.memorialHour > 0) { at = e.clock.day * L + Math.floor(L * e.cfg.memorialHour / 24); if (at <= e.now + L * 0.1) at += L; }
    e.schedule(at, 'memorial', [r.id, f.id, mg ? mg.idx : -1]);
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
    const oldHH = e.households.get(r.hh);
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
    // two residents can share a given name: free it only when nobody living still has it (a loaded save rebuilds the set the same way)
    if (!e.alive.some((p) => p.given === r.given)) e.usedNames.delete(r.given);
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
    // children are never left on their own
    if (oldHH && e.households.get(oldHH.id) === oldHH) this.ensureGuardian(oldHH);
  }

  // ---------------------------------------------------------------- moving in / out
  moves() {
    const e = this.e, rng = e.rng, day = e.clock.day;
    // leaving: households who are unhappy for days, or simply off on an adventure
    for (const hh of Array.from(e.households.values())) {
      if (!e.households.has(hh.id)) continue;
      if (hh.planOut >= 0) { if (day >= hh.planOut) this.moveOut(hh); continue; }
      if (hh.members.some((id) => isKept(e, e.people[id]))) continue;   // the game's named villagers stay
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
    hh.leaving = true;
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
    // young families are drawn to a town with few children; fewer grandparents move into a town full of them
    const mix = this.ageMix();
    const fam = mix.young < 0.24 ? 1 + 4 * (0.24 - mix.young) / 0.24 : 1;
    const eld = mix.old > 0.16 ? Math.max(0.15, 1 - 4 * (mix.old - 0.16)) : 1;
    const kinds = [['single', 3], ['couple', 3], ['family', 4 * fam], ['elders', 1.5 * eld], ['single_parent', 1 * fam]];
    const k = kinds[rng.weighted(kinds.map((x) => x[1]))][0];
    const size = k === 'single' ? 1 : k === 'couple' || k === 'elders' ? 2 : k === 'single_parent' ? 2 + rng.int(2) : 3 + rng.int(2);
    const home = this.findHome(size) || this.findHome(1);
    if (!home) return null;
    const hh = e.newHousehold();
    setHome(e, hh, home.idx);
    hh.since = e.clock.day;
    const members = e.makeFamily(hh, k, size);
    for (const r of members) { r.flags |= F_NEWCOMER; r.arrived = e.clock.day; if (e.cfg.externalPlans) r.flags |= F_XPLAN; }
    e.jobs.fillOpenings(true);
    this.stats.movedIn++;
    this.stats.newResidents += members.length;
    const f = e.fact('move_in', { a: members[0].id, n: members.length, s: 'hh' + hh.id, p: home.idx });
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
