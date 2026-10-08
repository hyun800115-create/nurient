// Incidents — all cute, all non-violent, all with a happy ending:
//   theft   a hungry or mischievous resident pinches a bun -> "도둑이야!" -> police dispatched -> comic
//           chase -> arrest (walks along holding the officer's hand) -> police station (cocoa) -> apology +
//           paying back -> release;
//           or the thief gets away -> wanted poster (3 slots) -> a witness tips the police / the thief
//           turns themselves in -> arrest -> apology -> release
//   queue   someone cuts in line -> argument -> apology (or a scuffle)
//   window  a kid's snowball breaks a window -> the kid runs -> next morning: apology with a parent
//   scuffle two rivals -> argument -> dust-cloud scuffle (stars, no one hurt) -> police / a brave
//           bystander separates them -> handshake
//   fire    stove / chimney / cooking / sweet potatoes … -> smoke, everyone evacuates -> reported ->
//           firefighters -> hose -> out: scorched (repair) or burnt down (ruin) -> insurance + loan ->
//           demolition (excavator, dump truck) -> construction -> rebuilt (often nicer) -> housewarming
// Everything is driven by phase timers in game seconds; the game renders the phases it receives on
// the 'incident' / 'build' / 'wanted' events and may call engine.ack(id) to move a phase on early.

import { G_TODDLER, G_KID, G_TEEN, G_ADULT, G_ELDER, S_IDLE, S_EVENT, F_WANTED, F_JAILED, F_HOMELESS, F_OWNER, groupOf } from './people.js';
import { SRC_SEEN, SRC_DID, D_ANON, findMem, remember } from './memory.js';
import { getRel, ensureRel, clampRel, RF_RIVAL } from './relations.js';
import { ITEMS } from '../data/items.js';
import { FIRE_CAUSES } from '../data/facts.js';
import { B_OK, B_BURNING, B_RUIN, B_DEMOLISH, B_BUILD, B_DAMAGED } from './world.js';
import { A_HOME, A_JAIL, A_EVENT, A_SOCIAL } from './plans.js';

const PETTY = ITEMS.filter((i) => i.petty).map((i) => i.idx);

export class Incidents {
  constructor(e) {
    this.e = e;
    this.active = [];
    this.nextId = 1;
    this.posters = [0, 0, 0];      // incident ids on the wanted board
    this.stats = { theft: 0, caught: 0, escaped: 0, tipped: 0, surrendered: 0, queue: 0, window: 0, scuffle: 0, fire: 0, minor: 0, ruin: 0, rebuilt: 0, catRescue: 0, posters: 0, resolved: 0, open: 0 };
  }

  enabled() { return !!this.e.cfg.incidents; }

  // ---------------------------------------------------------------- daily schedule
  planDay() {
    const e = this.e, rng = e.rng;
    if (!this.enabled()) return;
    const pop = e.alive.length;
    const happy = e.avgMood() / 100;            // -1 .. 1
    const k = (pop / 250) * Math.max(0.35, 1.1 - happy * 0.6) * e.cfg.incidentRate;
    const n = (mean) => { let c = 0, x = mean; while (x > 0) { if (rng.chance(Math.min(1, x))) c++; x -= 1; } return c; };
    const add = (kind, count, h0, h1) => { for (let i = 0; i < count; i++) e.schedule(e.clock.day * e.cfg.dayLength + Math.floor(((h0 + rng.next() * (h1 - h0)) / 24) * e.cfg.dayLength), 'incident', kind); };
    add('theft', n(0.9 * k), 9, 19.5);
    add('queue', n(0.9 * k), 9.5, 16.5);
    add('window', n(0.45 * k), 10, 17);
    add('scuffle', n(0.3 * k), 10, 20);
    add('fire', n(e.cfg.fireRate * (pop / 250)), 7, 22);
  }

  startScheduled(kind) {
    if (!this.enabled()) return;
    switch (kind) {
      case 'theft': return this.theft();
      case 'queue': return this.queue();
      case 'window': return this.window();
      case 'scuffle': return this.randomScuffle();
      case 'fire': return this.fire();
    }
  }

  newIncident(kind, place) {
    const I = { id: this.nextId++, kind, phase: 'start', t: this.e.now, next: 0, place: place ? place.idx : -1, building: -1, culprit: -1, victim: -1, officers: [], crew: [], witnesses: [], item: -1, cause: -1, fact: null, facts: [], outcome: '', poster: -1, data: 0 };
    this.active.push(I);
    this.stats.open++;
    return I;
  }

  emit(I, extra) {
    const e = this.e;
    if (!e.bus.has('incident')) return;
    const W = e.world;
    e.bus.emit('incident', Object.assign({
      id: I.id, kind: I.kind, phase: I.phase, place: I.place >= 0 ? W.places[I.place].id : null, building: I.building >= 0 ? W.places[I.building].id : null,
      culprit: I.culprit, victim: I.victim, officers: I.officers.slice(), crew: I.crew.slice(), witnesses: I.witnesses.slice(0, 8),
      item: I.item >= 0 ? ITEMS[I.item].id : null, cause: I.cause >= 0 ? FIRE_CAUSES[I.cause][0] : null, outcome: I.outcome || null,
    }, extra || null));
  }

  phase(I, name, wait) {
    I.phase = name;
    I.t = this.e.now;
    I.next = this.e.now + Math.max(1, Math.round(wait));
    this.emit(I);
  }

  /** the game says it has shown phase `phase` of incident `id` — move on now */
  ack(id) { for (const I of this.active) if (I.id === id) I.next = this.e.now; }

  update() {
    const now = this.e.now;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const I = this.active[i];
      if (I.next > 0 && now >= I.next) {
        I.next = 0;
        this.advance(I);
      }
      if (I.phase === 'done') { this.active.splice(i, 1); this.stats.open--; this.stats.resolved++; }
    }
  }

  advance(I) {
    switch (I.kind) {
      case 'theft': return this.theftNext(I);
      case 'queue': return this.queueNext(I);
      case 'window': return this.windowNext(I);
      case 'scuffle': return this.scuffleNext(I);
      case 'fire': return this.fireNext(I);
    }
  }

  // ---------------------------------------------------------------- helpers
  hold(r, secs) { r.state = S_EVENT; r.busyUntil = this.e.now + secs; }
  release(r) { if (r.state === S_EVENT) r.state = S_IDLE; r.busyUntil = this.e.now; }
  present(p) { const out = []; for (const id of p.here) { const r = this.e.people[id]; if (r.alive && r.state !== 3) out.push(r); } return out; }

  officersOnDuty(n) {
    const e = this.e, out = [];
    const hour = e.clock.minute / 60;
    for (const r of e.alive) {
      if (!/^(police|detective)$/.test(r.job) || (r.flags & F_JAILED)) continue;
      if (r.state === S_EVENT || r.state === 3) continue;
      const onShift = hour >= 7 && hour < 20;
      if (!onShift && r.state === 3) continue;
      out.push(r);
    }
    // the ones at the station first
    const st = e.world.first('police');
    out.sort((a, b) => (st && b.loc === st.idx ? 1 : 0) - (st && a.loc === st.idx ? 1 : 0) || a.id - b.id);
    return out.slice(0, n);
  }

  crewOnCall(n) {
    const e = this.e, out = [];
    for (const r of e.alive) if (r.job === 'firefighter' && r.state !== S_EVENT && !(r.flags & F_JAILED)) out.push(r);
    out.sort((a, b) => a.id - b.id);
    return out.slice(0, n);
  }

  // ---------------------------------------------------------------- theft
  theft() {
    const e = this.e, rng = e.rng, W = e.world;
    // a shop with customers in it
    const shops = W.places.filter((p) => p.cat === 'shop' && p.state === B_OK && p.here.length >= 2 && p.sellIdx.length);
    if (!shops.length) return null;
    const p = shops[rng.int(shops.length)];
    const cand = this.present(p).filter((r) => groupOf(e, r) >= G_KID && r.id !== p.owner && !(r.flags & (F_WANTED | F_JAILED)) && r.state === S_IDLE && !/police|detective/.test(r.job));
    if (!cand.length) return null;
    const ws = cand.map((r) => 1 + r.tr[2] / 18 + (r.hunger > 60 ? 2 : 0) + (r.wallet < 10 ? 2 : 0) - r.tr[7] / 40);
    const thief = cand[rng.weighted(ws)];
    const owner = p.owner >= 0 && e.people[p.owner].alive ? e.people[p.owner] : null;
    const I = this.newIncident('theft', p);
    I.culprit = thief.id;
    I.victim = owner ? owner.id : -1;
    const foods = p.sellIdx.filter((i) => ITEMS[i].petty);
    I.item = foods.length ? foods[rng.int(foods.length)] : PETTY[rng.int(PETTY.length)];
    I.data = 1 + rng.int(3);   // how many
    this.stats.theft++;
    const f = e.fact('theft', { a: thief.id, b: I.victim, p: p.idx, i: I.item, n: I.data });
    f.pinned++;
    I.fact = f; I.facts.push(f.id);
    // the thief did it; people around saw it (those who know the thief recognise them)
    e.learn(thief, f, SRC_DID);
    for (const r of this.present(p)) {
      if (r === thief) continue;
      const rel = getRel(e, r.id, thief.id);
      const knows = rel && rel.fam > 120;
      remember(e, r, f, SRC_SEEN, -1, knows ? null : { d: D_ANON, alt: -1 });
      I.witnesses.push(r.id);
      if (!knows) e.social.addQ(r, 'who', f);
    }
    this.hold(thief, 60);
    this.phase(I, 'act', 3);
    return I;
  }

  theftNext(I) {
    const e = this.e, rng = e.rng, W = e.world;
    const thief = e.people[I.culprit];
    const p = W.places[I.place];
    switch (I.phase) {
      case 'act': {
        const shouter = I.victim >= 0 ? e.people[I.victim] : I.witnesses.length ? e.people[I.witnesses[0]] : null;
        if (shouter) e.social.say(shouter, 'shout.thief', { f: I.fact, i: I.item, em: 'emote_exclaim', an: 'shocked' });
        // the thief runs off
        const away = this.awayPlace(p);
        e.plans.goTo(thief, away.idx, A_SOCIAL, { run: true, reason: 'flee' });
        this.hold(thief, 120);
        e.social.say(thief, 'shout.flee', { f: I.fact, em: 'emote_sweat', an: 'flee' });
        const cops = this.officersOnDuty(rng.chance(0.5) ? 2 : 1);
        if (!cops.length) { this.escape(I); return; }
        I.officers = cops.map((c) => c.id);
        for (const c of cops) { this.hold(c, 200); e.plans.goTo(c, away.idx, A_SOCIAL, { run: true, reason: 'chase' }); }
        e.social.say(cops[0], 'shout.police', { f: I.fact, o: thief.id, em: 'emote_exclaim', an: 'run' });
        I.place = away.idx;
        this.phase(I, 'chase', 18 + rng.int(20));
        return;
      }
      case 'chase': {
        const g = groupOf(e, thief);
        let pCatch = 0.5 + 0.12 * I.officers.length - (g === G_KID ? 0.08 : 0) + (e.people[I.officers[0]].tr[11] > 70 ? 0.1 : 0) - (thief.tr[11] > 75 ? 0.08 : 0);
        if (rng.chance(pCatch)) this.arrest(I, I.officers[0]);
        else { for (const id of I.officers) this.release(e.people[id]); this.escape(I); }
        return;
      }
      case 'arrest': {
        // at the station, a cosy cell for a little while
        const st = W.first('police');
        thief.flags |= F_JAILED;
        if (st) e.plans.goTo(thief, st.idx, A_JAIL, { reason: 'arrested' });
        for (const id of I.officers) { const c = e.people[id]; if (st) e.plans.goTo(c, st.idx, A_SOCIAL, { reason: 'escort' }); this.hold(c, 30); }
        this.hold(thief, 400);
        this.phase(I, 'station', 50 + rng.int(40));
        return;
      }
      case 'station': {
        // apology: the victim is called to the station (or a witness accepts on behalf of the shop)
        const vic = I.victim >= 0 ? e.people[I.victim] : null;
        const f = e.fact('apology', { a: thief.id, b: I.victim, p: I.place, i: I.item, ref: I.fact.id });
        I.facts.push(f.id);
        e.learn(thief, f, SRC_DID);
        if (vic && vic.alive) {
          e.learn(vic, f, SRC_DID);
          e.social.say(thief, 'shout.sorry', { to: vic.id, f: I.fact, i: I.item, em: 'emote_sweat', an: 'sad' });
          e.social.say(vic, 'shout.forgive', { to: thief.id, f: I.fact, em: 'emote_heart', an: 'talk' });
          // paying back twice the price (if they can), relationship mends a little
          const cost = e.world.price(I.item) * I.data * 2;
          const paid = e.econ.pay(thief, cost);
          vic.wallet += paid;
          const rel = ensureRel(e, thief, vic);
          rel.aff += 60; clampRel(rel);
        }
        for (const id of I.officers) e.learn(e.people[id], f, SRC_SEEN);
        thief.tr[2] = Math.max(0, thief.tr[2] - 12);   // learnt a lesson
        thief.tr[7] = Math.min(100, thief.tr[7] + 8);
        this.phase(I, 'release', 10);
        return;
      }
      case 'release': {
        thief.flags &= ~(F_JAILED | F_WANTED);
        thief.wanted = 0;
        this.release(thief);
        for (const id of I.officers) this.release(e.people[id]);
        e.plans.build(thief, e.clock.day, e.clock.minute);
        I.outcome = 'released';
        I.fact.pinned--;
        this.unpost(I);
        this.phase(I, 'done', 1);
        I.next = 0;
        return;
      }
      case 'wanted': return;   // waits for a tip / surrender (daily check)
    }
  }

  arrest(I, officerId) {
    const e = this.e;
    const thief = e.people[I.culprit];
    const cop = e.people[officerId];
    this.stats.caught++;
    I.fact.st = 1;
    const f = e.fact('arrest', { a: thief.id, b: I.victim, c: cop.id, p: thief.loc >= 0 ? thief.loc : I.place, i: I.item, ref: I.fact.id });
    I.facts.push(f.id);
    e.learn(cop, f, SRC_DID); e.learn(thief, f, SRC_DID);
    const here = thief.loc >= 0 ? e.world.places[thief.loc] : null;
    if (here) e.witness(f, here, cop.id, thief.id);
    e.social.say(cop, 'shout.arrest', { o: thief.id, f: I.fact, em: 'emote_exclaim', an: 'point' });
    e.social.say(thief, 'shout.caught', { f: I.fact, em: 'emote_sweat', an: 'arrested_walk' });
    if (I.officers.indexOf(officerId) < 0) I.officers.push(officerId);
    this.phase(I, 'arrest', 6);
  }

  escape(I) {
    const e = this.e, rng = e.rng;
    const thief = e.people[I.culprit];
    this.stats.escaped++;
    I.fact.st = 2;
    this.release(thief);
    thief.flags |= F_WANTED;
    thief.wanted = I.id;
    const reward = 20 + rng.int(4) * 10;
    const f = e.fact('wanted', { a: thief.id, b: I.victim, p: I.place, i: I.item, n: reward, ref: I.fact.id });
    I.facts.push(f.id);
    f.pinned++;
    I.wantedFact = f;
    // posters on the board: everybody passing the board / reading the paper learns about it
    const slot = this.posters.indexOf(0);
    if (slot >= 0) {
      this.posters[slot] = I.id; I.poster = slot; this.stats.posters++;
      if (e.bus.has('wanted')) e.bus.emit('wanted', { op: 'post', incident: I.id, who: thief.id, slot, reward, item: ITEMS[I.item].id, anonymous: true });
    }
    for (const id of I.officers) e.learn(e.people[id], f, SRC_DID);
    I.outcome = 'escaped';
    this.phase(I, 'wanted', 0);
    I.next = 0;
  }

  unpost(I) {
    if (I.poster >= 0) {
      this.posters[I.poster] = 0;
      if (this.e.bus.has('wanted')) this.e.bus.emit('wanted', { op: 'remove', incident: I.id, slot: I.poster });
      I.poster = -1;
    }
    if (I.wantedFact) { I.wantedFact.pinned--; I.wantedFact = null; }
  }

  /** daily: wanted thieves get tipped off by witnesses who know them, or turn themselves in */
  dailyWanted() {
    const e = this.e, rng = e.rng;
    for (const I of this.active) {
      if (I.kind !== 'theft' || I.phase !== 'wanted') continue;
      const thief = e.people[I.culprit];
      if (!thief.alive) { I.outcome = 'gone'; this.unpost(I); I.phase = 'done'; continue; }
      // a witness who saw who it was and knows about the poster
      let tipper = null;
      for (const r of e.alive) {
        if (r === thief) continue;
        const m = findMem(r, I.fact);
        if (!m || m.d === D_ANON) continue;
        if (I.wantedFact && !findMem(r, I.wantedFact) && !rng.chance(0.3)) continue;
        if (rng.chance(0.18 + r.tr[7] / 400)) { tipper = r; break; }
      }
      const age = (e.now - I.t) / e.cfg.dayLength;
      if (tipper) {
        this.stats.tipped++;
        const f = e.fact('tip', { a: thief.id, b: tipper.id, ref: I.fact.id, n: I.wantedFact ? I.wantedFact.n : 0 });
        e.learn(tipper, f, SRC_DID);
        tipper.wallet += I.wantedFact ? I.wantedFact.n : 20;
        this.catchLater(I);
      } else if (age > 1.5 && rng.chance(thief.tr[7] / 220 + 0.15)) {
        this.stats.surrendered++;
        this.catchLater(I, true);
      }
    }
  }

  catchLater(I, surrender) {
    const e = this.e;
    const cops = this.officersOnDuty(1);
    const cop = cops[0] || null;
    if (cop) I.officers = [cop.id];
    const thief = e.people[I.culprit];
    this.hold(thief, 200);
    if (surrender) {
      const st = e.world.first('police');
      if (st) e.plans.goTo(thief, st.idx, A_SOCIAL, { reason: 'surrender' });
      e.social.say(thief, 'shout.surrender', { f: I.fact, em: 'emote_sweat', an: 'sad' });
    }
    if (cop) this.arrest(I, cop.id);
    else { I.fact.st = 1; this.phase(I, 'station', 30); }
  }

  awayPlace(p) {
    const e = this.e, W = e.world;
    const opts = W.places.filter((q) => q.cat === 'outdoor' && q.state === B_OK && q.idx !== p.idx);
    return opts.length ? opts[e.rng.int(opts.length)] : p;
  }

  // ---------------------------------------------------------------- queue jumping
  queue() {
    const e = this.e, rng = e.rng, W = e.world;
    const qs = W.places.filter((p) => p.queue && p.state === B_OK && p.here.length >= 3);
    if (!qs.length) return null;
    const p = qs[rng.int(qs.length)];
    const ppl = this.present(p).filter((r) => groupOf(e, r) >= G_TEEN && r.state === S_IDLE && r.busyUntil <= e.now);
    if (ppl.length < 2) return null;
    ppl.sort((a, b) => (a.tr[1] - a.tr[2] * 0.5) - (b.tr[1] - b.tr[2] * 0.5) || a.id - b.id);
    const cutter = ppl[0], victim = ppl[1 + rng.int(ppl.length - 1)];
    const I = this.newIncident('queue', p);
    I.culprit = cutter.id; I.victim = victim.id;
    this.stats.queue++;
    const f = e.fact('queue_jump', { a: cutter.id, b: victim.id, p: p.idx });
    I.fact = f;
    e.witness(f, p, cutter.id, victim.id);
    this.hold(cutter, 30); this.hold(victim, 30);
    e.social.say(victim, 'shout.queue', { to: cutter.id, o: cutter.id, em: 'emote_anger', an: 'argue' });
    this.phase(I, 'argue', 6 + rng.int(5));
    return I;
  }

  queueNext(I) {
    const e = this.e, rng = e.rng;
    const a = e.people[I.culprit], b = e.people[I.victim];
    if (I.phase === 'argue') {
      const rel = ensureRel(e, a, b);
      if (a.tr[1] < 35 && b.tr[1] < 40 && rng.chance(0.25)) {
        this.release(a); this.release(b);
        I.outcome = 'scuffle';
        this.phase(I, 'done', 1); I.next = 0;
        this.scuffle(a, b, e.world.places[I.place]);
        return;
      }
      e.social.say(a, 'shout.queue_sorry', { to: b.id, em: 'emote_sweat', an: 'sad' });
      rel.aff += 30; clampRel(rel);
      const f = e.fact('apology', { a: a.id, b: b.id, p: I.place, ref: I.fact.id });
      e.witness(f, e.world.places[I.place], a.id, b.id);
      I.outcome = 'apology';
      this.release(a); this.release(b);
      this.phase(I, 'done', 1); I.next = 0;
    }
  }

  // ---------------------------------------------------------------- snowball through a window
  window() {
    const e = this.e, rng = e.rng, W = e.world;
    const kids = e.alive.filter((r) => groupOf(e, r) === G_KID && r.state === S_IDLE && r.loc >= 0 && W.places[r.loc].cat === 'outdoor' && r.tr[2] > 50);
    if (!kids.length) return null;
    const kid = kids[rng.int(kids.length)];
    const targets = W.places.filter((p) => (p.cat === 'home' || p.cat === 'shop') && p.state === B_OK && p.hh !== kid.hh && (p.residents.length || p.owner >= 0));
    if (!targets.length) return null;
    const bld = targets[rng.int(targets.length)];
    const ownerId = bld.owner >= 0 ? bld.owner : bld.residents[0];
    const I = this.newIncident('window', W.places[kid.loc]);
    I.culprit = kid.id; I.victim = ownerId; I.building = bld.idx;
    this.stats.window++;
    const f = e.fact('window', { a: kid.id, b: ownerId, p: bld.idx });
    f.pinned++;
    I.fact = f;
    e.witness(f, W.places[kid.loc], kid.id);
    const owner = e.people[ownerId];
    if (owner && owner.alive) remember(e, owner, f, SRC_SEEN, -1, { d: D_ANON, alt: -1 });
    e.social.say(kid, 'shout.window', { f, em: 'emote_sweat', an: 'shocked' });
    this.hold(kid, 20);
    e.plans.goTo(kid, this.awayPlace(W.places[kid.loc]).idx, A_SOCIAL, { run: true, reason: 'flee' });
    this.phase(I, 'crash', 4);
    return I;
  }

  windowNext(I) {
    const e = this.e;
    const kid = e.people[I.culprit];
    if (I.phase === 'crash') {
      // the apology comes the next morning, with mum or dad
      this.release(kid);
      const at = (e.clock.day + 1) * e.cfg.dayLength + Math.floor(e.cfg.dayLength * (8.5 / 24));
      I.phase = 'wait'; I.next = at;
      this.emit(I);
      return;
    }
    if (I.phase === 'wait') {
      const owner = e.people[I.victim];
      const parent = kid.parents.map((id) => e.people[id]).find((p) => p && p.alive) || null;
      const f = e.fact('apology', { a: kid.id, b: I.victim, c: parent ? parent.id : -1, p: I.building, ref: I.fact.id });
      e.learn(kid, f, SRC_DID);
      if (owner && owner.alive) {
        e.learn(owner, f, SRC_DID);
        // the owner now knows who it was
        const m = findMem(owner, I.fact);
        if (m) { m.d = 0; m.alt = -1; }
        e.social.say(kid, 'shout.window_sorry', { to: owner.id, em: 'emote_sweat', an: 'sad' });
        e.social.say(owner, 'shout.forgive_kid', { to: kid.id, em: 'emote_heart' });
        const pay = parent ? e.econ.pay(parent, 15) : e.econ.pay(kid, 10);
        owner.wallet += pay;
      }
      if (parent) e.learn(parent, f, SRC_DID);
      kid.tr[2] = Math.max(0, kid.tr[2] - 8);
      I.fact.pinned--;
      I.outcome = 'apology';
      this.phase(I, 'done', 1); I.next = 0;
    }
  }

  // ---------------------------------------------------------------- scuffles (comic dust clouds)
  randomScuffle() {
    const e = this.e, rng = e.rng;
    // rivals (or two grumpy people who do not get on) who happen to be in the same place
    let cand = null;
    for (const r of e.alive) {
      if (r.state !== S_IDLE || r.loc < 0 || groupOf(e, r) < G_KID) continue;
      for (const rel of r.adj) {
        if (!(rel.flags & RF_RIVAL) && !(rel.aff < 0 && r.tr[1] < 40)) continue;
        const o = e.people[rel.other(r.id)];
        if (o.loc === r.loc && o.state === S_IDLE) { cand = [r, o]; if (rng.chance(0.5)) break; }
      }
      if (cand && rng.chance(0.3)) break;
    }
    if (cand) return this.scuffle(cand[0], cand[1], e.world.places[cand[0].loc]);
    // two grumpy strangers bump into each other in a busy place
    const busy = e.world.places.filter((p) => p.here.length >= 4 && p.cat !== 'home');
    if (!busy.length) return null;
    const p = busy[rng.int(busy.length)];
    const ppl = this.present(p).filter((r) => groupOf(e, r) >= G_TEEN && r.state === S_IDLE).sort((x, y) => x.tr[1] - y.tr[1] || x.id - y.id);
    if (ppl.length < 2 || ppl[1].tr[1] > 45) return null;
    return this.scuffle(ppl[0], ppl[1], p);
  }

  scuffle(a, b, p) {
    const e = this.e, rng = e.rng;
    if (!this.enabled() || !p) return null;
    for (const I of this.active) if (I.kind === 'scuffle' && (I.culprit === a.id || I.victim === a.id || I.culprit === b.id || I.victim === b.id)) return null;
    const I = this.newIncident('scuffle', p);
    I.culprit = a.id; I.victim = b.id;
    this.stats.scuffle++;
    const f = e.fact('scuffle', { a: a.id, b: b.id, p: p.idx });
    I.fact = f;
    e.witness(f, p, a.id, b.id);
    this.hold(a, 80); this.hold(b, 80);
    for (const r of this.present(p)) if (r !== a && r !== b && rng.chance(0.5)) e.social.say(r, 'shout.gasp', { f, em: 'emote_exclaim', an: 'shocked' });
    this.phase(I, 'fight', 8 + rng.int(5));
    return I;
  }

  scuffleNext(I) {
    const e = this.e, rng = e.rng;
    const a = e.people[I.culprit], b = e.people[I.victim];
    if (I.phase === 'fight') {
      const cops = this.officersOnDuty(1);
      const p = e.world.places[I.place];
      let sep = null;
      if (cops.length) { sep = cops[0]; I.officers.push(sep.id); e.plans.goTo(sep, p.idx, A_SOCIAL, { run: true, reason: 'separate' }); this.hold(sep, 40); }
      else { const by = this.present(p).filter((r) => r !== a && r !== b && groupOf(e, r) >= G_TEEN).sort((x, y) => y.tr[11] - x.tr[11]); sep = by[0] || null; }
      if (sep) { I.crew = [sep.id]; e.social.say(sep, cops.length ? 'shout.separate_police' : 'shout.separate', { em: 'emote_exclaim', an: 'point' }); }
      this.phase(I, 'separate', 6);
      return;
    }
    if (I.phase === 'separate') {
      const rel = ensureRel(e, a, b);
      e.social.say(a, 'shout.handshake', { to: b.id, em: 'emote_sweat' });
      const f = e.fact('apology', { a: a.id, b: b.id, p: I.place, ref: I.fact.id });
      e.witness(f, e.world.places[I.place], a.id, b.id);
      rel.aff += 140; clampRel(rel);
      if (rng.chance(0.4)) { rel.aff = Math.max(rel.aff, 40); rel.flags &= ~RF_RIVAL; const g = e.fact('reconcile', { a: a.id, b: b.id, p: I.place }); e.learn(a, g, SRC_DID); e.learn(b, g, SRC_DID); }
      this.release(a); this.release(b);
      for (const id of I.officers) this.release(e.people[id]);
      I.outcome = 'handshake';
      this.phase(I, 'done', 1); I.next = 0;
    }
  }

  // ---------------------------------------------------------------- fire
  fire(bldIdx, causeIdx) {
    const e = this.e, rng = e.rng, W = e.world;
    let b;
    if (bldIdx !== undefined) b = W.places[bldIdx];
    else {
      const cand = W.places.filter((p) => (p.cat === 'home' || p.cat === 'shop') && p.state === B_OK && (p.residents.length || p.owner >= 0));
      if (!cand.length) return null;
      b = cand[rng.weighted(cand.map((p) => (p.K.fire || 0.6) * (p.level <= 1 ? 1.2 : 0.8)))];
    }
    if (!b || b.state !== B_OK) return null;
    for (const I of this.active) if (I.kind === 'fire' && I.building === b.idx) return null;
    const I = this.newIncident('fire', b);
    I.building = b.idx;
    I.cause = causeIdx !== undefined ? causeIdx : rng.int(FIRE_CAUSES.length);
    this.stats.fire++;
    b.state = B_BURNING; b.stateT = e.now;
    const ownerId = b.owner >= 0 ? b.owner : b.residents.length ? b.residents[0] : -1;
    I.victim = ownerId;
    const f = e.fact('fire', { a: ownerId, p: b.idx, n: I.cause });
    f.pinned++;
    I.fact = f;
    // everyone inside gets out (nobody is ever hurt) and shouts
    const inside = this.present(b);
    for (const r of inside) {
      e.learn(r, f, SRC_SEEN);
      I.witnesses.push(r.id);
      const out = this.awayPlace(b);
      e.plans.goTo(r, out.idx, A_SOCIAL, { run: true, reason: 'evacuate' });
      this.hold(r, 30);
    }
    if (inside.length) e.social.say(inside[0], 'shout.fire', { f, em: 'emote_exclaim', an: 'flee' });
    // people outdoors see the smoke from afar — they do not know where it is yet
    for (const p of W.places) {
      if (p.cat !== 'outdoor') continue;
      for (const id of p.here) {
        const r = e.people[id];
        if (!r.alive || findMem(r, f)) continue;
        if (rng.chance(0.6)) { remember(e, r, f, SRC_SEEN, -1, { d: 1, alt: -1, s: 500 }); e.social.addQ(r, 'where', f); }
      }
    }
    this.phase(I, 'smoke', 5 + rng.int(8));
    return I;
  }

  fireNext(I) {
    const e = this.e, rng = e.rng, W = e.world;
    const b = W.places[I.building];
    switch (I.phase) {
      case 'smoke': {
        // reported: the fire station sends its crew (the game shows the fire truck with siren)
        const crew = this.crewOnCall(4);
        I.crew = crew.map((r) => r.id);
        const st = W.first('fire_station');
        const d = st ? Math.abs(st.x - b.x) + Math.abs(st.y - b.y) : 40;
        const travel = Math.round((8 + d * 0.18) * (st && st.level > 1 ? 0.8 : 1)) + (crew.length ? 0 : 25);
        for (const c of crew) { e.plans.goTo(c, b.idx, A_EVENT, { run: true, reason: 'fire' }); this.hold(c, 400); }
        I.burnSince = I.t;
        this.phase(I, 'dispatch', travel);
        return;
      }
      case 'dispatch': {
        if (I.crew.length) e.social.say(e.people[I.crew[0]], 'shout.firefighter', { f: I.fact, em: 'emote_exclaim', an: 'spray_hose' });
        this.phase(I, 'spray', 14 + rng.int(14));
        return;
      }
      case 'spray': {
        const burnt = e.now - I.burnSince;
        const ruin = burnt > e.cfg.fireRuinAfter + rng.int(20) - (b.level > 1 ? 8 : 0);
        I.fact.st = ruin ? 2 : 1;
        const chief = I.crew.length ? I.crew[0] : -1;
        const fo = e.fact('fire_out', { a: I.victim, c: chief, p: b.idx, n: ruin ? 1 : 0, ref: I.fact.id });
        I.facts.push(fo.id);
        e.witness(fo, b, chief, I.victim);
        for (const id of I.crew) e.learn(e.people[id], fo, SRC_DID);
        // the crowd cheers the firefighters
        const crowd = this.nearCrowd(b);
        for (const r of crowd.slice(0, 2)) e.social.say(r, 'shout.cheer_fire', { f: fo, em: 'emote_star', an: 'clap' });
        if (rng.chance(0.3) && chief >= 0) {
          this.stats.catRescue++;
          const cr = e.fact('cat_rescue', { c: chief, p: b.idx, a: I.victim });
          e.witness(cr, b, chief);
        }
        for (const id of I.crew) this.release(e.people[id]);
        for (const id of I.witnesses) this.release(e.people[id]);
        if (ruin) this.toRuin(I, b);
        else { this.stats.minor++; b.state = B_DAMAGED; b.stateT = e.now; I.outcome = 'minor'; if (e.bus.has('build')) e.bus.emit('build', { op: 'scorched', place: b.id }); this.phase(I, 'repair', e.cfg.dayLength * 0.3); }
        return;
      }
      case 'repair': {
        b.state = B_OK;
        if (e.bus.has('build')) e.bus.emit('build', { op: 'repaired', place: b.id });
        I.fact.pinned--;
        this.phase(I, 'done', 1); I.next = 0;
        return;
      }
      case 'ruin': {
        // demolition crew with excavator + dump truck
        b.state = B_DEMOLISH; b.stateT = e.now;
        const crew = this.builders(3);
        I.crew = crew.map((r) => r.id);
        for (const c of crew) { e.plans.goTo(c, b.idx, A_EVENT, { reason: 'demolish' }); this.hold(c, Math.round(e.cfg.dayLength * 0.15)); }
        const f = e.fact('demolish', { p: b.idx, a: I.victim, ref: I.fact.id });
        e.witness(f, b, crew.length ? crew[0].id : -1);
        if (e.bus.has('build')) e.bus.emit('build', { op: 'demolish', place: b.id, crew: I.crew.slice() });
        this.phase(I, 'demolish', e.cfg.dayLength * 0.35);
        return;
      }
      case 'demolish': {
        b.state = B_BUILD; b.stateT = e.now;
        const crew = this.builders(4);
        I.crew = crew.map((r) => r.id);
        for (const c of crew) { e.plans.goTo(c, b.idx, A_EVENT, { reason: 'construct' }); this.hold(c, Math.round(e.cfg.dayLength * 0.2)); }
        if (e.bus.has('build')) e.bus.emit('build', { op: 'construct', place: b.id, kind: b.kind, purpose: 'rebuild', crew: I.crew.slice() });
        this.phase(I, 'construct', e.cfg.dayLength * 1.4);
        return;
      }
      case 'construct': {
        b.state = B_OK; b.stateT = e.now;
        const better = I.data === 1;
        if (better) b.level++;
        this.stats.rebuilt++;
        const f = e.fact('rebuilt', { p: b.idx, a: I.victim, n: better ? 1 : 0, ref: I.fact.id });
        e.witness(f, b, I.victim);
        if (e.bus.has('build')) e.bus.emit('build', { op: 'done', place: b.id, kind: b.kind, purpose: 'rebuild', level: b.level });
        e.life.returnHome(b);
        I.fact.pinned--;
        I.outcome = better ? 'rebuilt_better' : 'rebuilt';
        this.phase(I, 'done', 1); I.next = 0;
        return;
      }
    }
  }

  toRuin(I, b) {
    const e = this.e;
    this.stats.ruin++;
    b.state = B_RUIN; b.stateT = e.now;
    I.outcome = 'ruin';
    const f = e.fact('ruin', { p: b.idx, a: I.victim, n: I.cause, ref: I.fact.id });
    e.witness(f, b, I.victim);
    I.facts.push(f.id);
    if (e.bus.has('build')) e.bus.emit('build', { op: 'ruin', place: b.id, kind: b.kind });
    // the family stays with friends or relatives; the shop closes for a while
    e.life.evacuate(b);
    // money: insurance + a rebuild loan for the rest (rebuilt nicer when there is enough)
    const cost = b.cat === 'home' ? 600 + b.cap * 80 : 900;
    const pay = e.bank.insurance(b, cost);
    const owner = I.victim >= 0 ? e.people[I.victim] : null;
    if (owner && owner.alive) {
      owner.wallet += 0;
      const rest = cost - pay;
      if (rest > 0) e.bank.lend(owner, 'rebuild', rest, b.idx);
      I.data = 1;     // rebuilt a level higher (insurance + loan)
    } else I.data = 0;
    // demolition starts the next morning
    const at = (e.clock.day + 1) * e.cfg.dayLength + Math.floor(e.cfg.dayLength * (8 / 24));
    I.phase = 'ruin'; I.t = e.now; I.next = at;
    this.emit(I);
  }

  nearCrowd(b) {
    const e = this.e, out = [];
    for (const p of e.world.places) {
      if (p.cat !== 'outdoor') continue;
      for (const id of p.here) { const r = e.people[id]; if (r.alive && r.state === S_IDLE) out.push(r); }
      if (out.length > 4) break;
    }
    return out;
  }

  builders(n) {
    const e = this.e, out = [];
    for (const r of e.alive) if (/^(builder|mover)$/.test(r.job) && r.state !== S_EVENT) out.push(r);
    out.sort((a, b) => a.id - b.id);
    return out.slice(0, n);
  }
}
