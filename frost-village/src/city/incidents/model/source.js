// ScriptedSource — a small, seeded stand-in for the story engine's incident flow (src/story/engine/src/incidents.js):
// the same kinds, phases, timers, ack rules and event shapes, cast from a roster with the same rules. Pure.
//
// Used where the real story must not or cannot run: the designer preview menu (도둑 추격, 불 끄기 — a throwaway copy
// that never touches the story), the lab, the Node tests and a fallback when the story module is not running. The
// director cannot tell the two apart (except `src: 'self'`).
//
//   const S = new ScriptedSource({ seed, roster, places })
//   S.start('fire', { building: 't_flower', outcome: 'ruin', T })  -> id     (opts are all optional)
//   S.update(T); for (const ev of S.drain()) model.feed(ev)
//   S.ack(id)                    the game showed the phase: move on now (exactly like engine.ack)
//   S.planDay(day, rates, happy) the fallback's daily schedule (the engine's planDay formula)
//   S.move('in' | 'out' | 'plan', { home, n })                       households stay valid
//
//   roster = [{ pid, sid, age, role?, named?, hh?, home? }]
//   places = { shops: [id], outdoor: [id], homes: [id], queues: [id], fireStation?: { x, y }, dist?(a, b) }

import { stream } from './rng.js';
import { DAY, atHour, dayOf } from './time.js';
import { canCulprit, canScuffle, bandOf, BAND } from './rules.js';

const PETTY = ['item_bread', 'item_fish_cooked', 'item_can', 'item_bread', 'item_fish_raw'];
const CAUSES = ['stove', 'chimney', 'cooking', 'sweet_potato', 'candle'];
const ACKS = { 'theft:chase': 1, 'fire:dispatch': 1, 'fire:spray': 1, 'scuffle:fight': 1 };

export class ScriptedSource {
  constructor(opts = {}) {
    this.seed = opts.seed || 7;
    this.roster = (opts.roster || []).map((p) => Object.assign({}, p));
    this.places = Object.assign({ shops: [], outdoor: [], homes: [], queues: [] }, opts.places || {});
    this.rng = stream(this.seed, 'source');
    this.active = [];
    this.q = [];
    this.nextId = opts.firstId || 1;
    this.sched = [];             // [T, kind, opts]
    this.posters = [0, 0, 0];
    this.ruinAfter = opts.ruinAfter || 43;
    this.T = 0;
    this.nextPid = 1;
    this.stats = { started: 0, theft: 0, queue: 0, window: 0, scuffle: 0, fire: 0, ruin: 0, caught: 0, escaped: 0, ended: 0, moves: 0 };
  }

  person(pid) { return this.roster.find((p) => p.pid === pid) || null; }
  pids(list) { return list.map((sid) => { const p = this.roster.find((r) => r.sid === sid); return p ? p.pid : null; }); }
  push(ev) { this.q.push(ev); }
  drain() { const q = this.q; this.q = []; return q; }

  // ------------------------------------------------------------------------------------------ incidents
  newInc(kind, place, T) {
    const I = { id: this.nextId++, kind, phase: 'start', t: T, next: 0, place, building: null, culprit: -1, victim: -1, officers: [], crew: [], witnesses: [], item: null, cause: null, outcome: '', ackWait: false, acked: false, waitUntil: 0, opts: {} };
    this.active.push(I);
    this.stats.started++; this.stats[kind]++;
    return I;
  }

  emit(I, extra) {
    const pid = (sid) => { const p = this.roster.find((r) => r.sid === sid); return p ? p.pid : null; };
    this.push(Object.assign({
      t: 'story:incident', src: 'self', id: I.id, kind: I.kind, phase: I.phase, place: I.place, building: I.building, culprit: I.culprit, victim: I.victim,
      officers: I.officers.slice(), crew: I.crew.slice(), witnesses: I.witnesses.slice(0, 8), item: I.item, cause: I.cause, outcome: I.outcome || null,
      culpritPid: pid(I.culprit), victimPid: pid(I.victim), officersPid: this.pids(I.officers), crewPid: this.pids(I.crew), witnessesPid: this.pids(I.witnesses.slice(0, 8)),
    }, extra || null));
  }

  phase(I, name, wait, T) {
    I.phase = name; I.t = T;
    I.next = T + Math.max(1, Math.round(wait));
    I.ackWait = !!ACKS[I.kind + ':' + name];
    I.acked = false;
    I.waitUntil = I.ackWait ? T + Math.max(Math.round(wait) * 3, Math.round(wait) + 30) : 0;
    this.emit(I, I.ackWait ? { ack: true } : null);
  }

  ack(id) { for (const I of this.active) if (I.id === id) { I.acked = true; if (I.next > 0) I.next = this.T; } }

  pickOf(list, ok, rng) { const c = list.filter(ok); return c.length ? rng.pick(c) : null; }
  helpers(role, n, prefix) {
    const out = this.roster.filter((p) => p.role === role).slice(0, n).map((p) => p.sid);
    // pseudo helpers (the station's crew) when the roster has none: negative sids the view dresses by role
    let k = 1;
    while (out.length < n) { const sid = -(1000 + k++ + (prefix === 'ff' ? 100 : prefix === 'bd' ? 200 : 0)); out.push(sid); if (!this.roster.some((p) => p.sid === sid)) this.roster.push({ pid: prefix + ':' + -sid, sid, age: 34, role, pseudo: true }); }
    return out;
  }

  /** start an incident now: kind + optional { place, building, culprit, victim, outcome, T, cause, item } -> id (0 = no cast) */
  start(kind, opts = {}) {
    const T = opts.T !== undefined ? opts.T : this.T;
    this.T = T;
    const rng = stream(this.seed, 'start:' + this.nextId + ':' + kind);
    const P = this.places;
    const byPid = (pid) => (pid ? this.person(pid) : null);
    let I = null;
    if (kind === 'theft') {
      const shop = opts.place || rng.pick(P.shops);
      const thief = byPid(opts.culprit) || this.pickOf(this.roster, (p) => canCulprit(p, 'theft') && !p.pseudo, rng);
      if (!shop || !thief) return 0;
      I = this.newInc('theft', shop, T);
      I.culprit = thief.sid;
      const vic = byPid(opts.victim) || this.pickOf(this.roster, (p) => p.sid !== thief.sid && !p.pseudo && bandOf(p.age) >= BAND.adult, rng);
      I.victim = vic ? vic.sid : -1;
      I.item = opts.item || rng.pick(PETTY);
      I.witnesses = this.roster.filter((p) => !p.pseudo && p.sid !== thief.sid && p.sid !== I.victim).slice(0, 3).map((p) => p.sid);
      I.opts = opts;
      this.phase(I, 'act', 3, T);
    } else if (kind === 'queue') {
      const at = opts.place || rng.pick(P.queues.length ? P.queues : P.shops);
      const cutter = byPid(opts.culprit) || this.pickOf(this.roster, (p) => canCulprit(p, 'queue') && !p.pseudo, rng);
      if (!at || !cutter) return 0;
      const vic = byPid(opts.victim) || this.pickOf(this.roster, (p) => p.sid !== cutter.sid && !p.pseudo && bandOf(p.age) >= BAND.teen, rng);
      if (!vic) return 0;
      I = this.newInc('queue', at, T);
      I.culprit = cutter.sid; I.victim = vic.sid; I.opts = opts;
      this.phase(I, 'argue', 6 + rng.int(5), T);
    } else if (kind === 'window') {
      const kid = byPid(opts.culprit) || this.pickOf(this.roster, (p) => canCulprit(p, 'window') && !p.pseudo, rng);
      const bld = opts.building || rng.pick(P.homes.concat(P.shops));
      if (!kid || !bld) return 0;
      const owner = byPid(opts.victim) || this.pickOf(this.roster, (p) => !p.pseudo && bandOf(p.age) >= BAND.adult && p.hh !== kid.hh, rng);
      I = this.newInc('window', opts.place || rng.pick(P.outdoor) || bld, T);
      I.culprit = kid.sid; I.victim = owner ? owner.sid : -1; I.building = bld; I.opts = opts;
      this.phase(I, 'crash', 4, T);
    } else if (kind === 'scuffle') {
      const a = byPid(opts.culprit) || this.pickOf(this.roster, (p) => canCulprit(p, 'scuffle') && !p.pseudo, rng);
      const b = a ? byPid(opts.victim) || this.pickOf(this.roster, (p) => !p.pseudo && canScuffle(a, p), rng) : null;
      const at = opts.place || rng.pick(P.outdoor);
      if (!a || !b || !at || !canScuffle(a, b)) return 0;
      I = this.newInc('scuffle', at, T);
      I.culprit = a.sid; I.victim = b.sid; I.opts = opts;
      I.witnesses = this.roster.filter((p) => !p.pseudo && p.sid !== a.sid && p.sid !== b.sid).slice(0, 3).map((p) => p.sid);
      this.phase(I, 'fight', 8 + rng.int(5), T);
    } else if (kind === 'fire') {
      const bld = opts.building || rng.pick(P.homes.concat(P.shops));
      if (!bld) return 0;
      if (this.active.some((x) => x.kind === 'fire' && x.building === bld)) return 0;
      I = this.newInc('fire', bld, T);
      I.building = bld;
      const owner = byPid(opts.victim) || this.roster.find((p) => p.home === bld && !p.pseudo) || null;
      I.victim = owner ? owner.sid : -1;
      I.cause = opts.cause || rng.pick(CAUSES);
      I.witnesses = this.roster.filter((p) => p.home === bld && !p.pseudo).slice(0, 4).map((p) => p.sid);
      I.opts = opts;
      this.phase(I, 'smoke', opts.smoke || 5 + rng.int(8), T);
    } else return 0;
    return I.id;
  }

  update(T) {
    this.T = T;
    for (let k = 0; k < this.sched.length; k++) {
      const [t, kind] = this.sched[k];
      if (t > T) continue;
      this.sched.splice(k--, 1);
      this.start(kind, { T });
    }
    for (let i = this.active.length - 1; i >= 0; i--) {
      const I = this.active[i];
      if (I.next > 0 && T >= I.next && !(I.ackWait && !I.acked && T < I.waitUntil)) { I.next = 0; this.advance(I, T); }
      if (I.phase === 'done') { this.active.splice(i, 1); this.stats.ended++; }
    }
  }

  done(I, outcome, T) { I.outcome = outcome; I.phase = 'done'; I.t = T; I.next = 0; this.emit(I); }

  advance(I, T) {
    const rng = stream(this.seed, 'adv:' + I.id + ':' + I.phase);
    const o = I.opts || {};
    switch (I.kind + ':' + I.phase) {
      // ---- theft
      case 'theft:act': {
        const cops = this.helpers('police', rng.chance(0.5) ? 2 : 1, 'po');
        I.officers = cops;
        I.place = o.away || rng.pick(this.places.outdoor) || I.place;
        this.phase(I, 'chase', 18 + rng.int(20), T);
        return;
      }
      case 'theft:chase': {
        const caught = o.outcome ? o.outcome !== 'escaped' : rng.chance(0.62);
        if (caught) { this.stats.caught++; this.phase(I, 'arrest', 6, T); return; }
        this.stats.escaped++;
        I.outcome = 'escaped';
        const slot = this.posters.indexOf(0);
        if (slot >= 0) { this.posters[slot] = I.id; I.poster = slot; this.push({ t: 'story:wanted', src: 'self', op: 'post', incident: I.id, who: I.culprit, whoPid: this.pids([I.culprit])[0], slot, reward: 20 + rng.int(4) * 10, item: I.item, anonymous: true }); }
        this.phase(I, 'wanted', 0, T);
        // the tip comes in a later morning (09:00-11:00)
        const days = o.tipDays !== undefined ? o.tipDays : 1 + rng.int(2);
        I.next = atHour(dayOf(T) + days, 9 + rng.next() * 2);
        return;
      }
      case 'theft:wanted': { I.crew = []; I.outcome = 'tip'; this.phase(I, 'tipped', 1, T); return; }
      case 'theft:tipped': { I.officers = this.helpers('police', 1, 'po'); this.phase(I, 'arrest', 6, T); return; }
      case 'theft:arrest': this.phase(I, 'station', o.station || 50 + rng.int(40), T); return;
      case 'theft:station': this.phase(I, 'release', 10, T); return;
      case 'theft:release': {
        if (I.poster !== undefined && I.poster >= 0) { this.posters[I.poster] = 0; this.push({ t: 'story:wanted', src: 'self', op: 'remove', incident: I.id, slot: I.poster }); I.poster = -1; }
        this.done(I, 'released', T); return;
      }
      // ---- queue
      case 'queue:argue': {
        const a = this.roster.find((p) => p.sid === I.culprit), b = this.roster.find((p) => p.sid === I.victim);
        if ((o.outcome === 'scuffle' || (!o.outcome && rng.chance(0.08))) && a && b && canScuffle(a, b)) { this.done(I, 'scuffle', T); this.start('scuffle', { T, culprit: a.pid, victim: b.pid, place: I.place }); return; }
        this.done(I, 'apology', T); return;
      }
      // ---- window
      case 'window:crash': { I.phase = 'wait'; I.t = T; I.next = o.wait ? T + o.wait : atHour(dayOf(T) + 1, 8.5); this.emit(I); return; }
      case 'window:wait': this.done(I, 'apology', T); return;
      // ---- scuffle
      case 'scuffle:fight': I.officers = this.helpers('police', 1, 'po'); this.phase(I, 'separate', 6, T); return;
      case 'scuffle:separate': this.done(I, 'handshake', T); return;
      // ---- fire
      case 'fire:smoke': {
        I.crew = this.helpers('firefighter', 3, 'ff');
        I.burnSince = I.t;
        this.phase(I, 'dispatch', o.travel || 11, T);
        return;
      }
      case 'fire:dispatch': this.phase(I, 'spray', o.spray || 14 + rng.int(14), T); return;
      case 'fire:spray': {
        const burnt = T - I.burnSince;
        const ruin = o.outcome ? o.outcome === 'ruin' : burnt > this.ruinAfter + rng.int(20);
        if (!ruin) { I.outcome = 'minor'; this.push({ t: 'story:build', src: 'self', op: 'scorched', place: I.building }); this.phase(I, 'repair', o.repair || DAY * 0.3, T); return; }
        this.stats.ruin++;
        I.outcome = 'ruin';
        this.push({ t: 'story:build', src: 'self', op: 'ruin', place: I.building });
        I.phase = 'ruin'; I.t = T; I.next = o.ruinWait ? T + o.ruinWait : atHour(dayOf(T) + 1, 8); I.ackWait = false;
        this.emit(I);
        return;
      }
      case 'fire:repair': this.push({ t: 'story:build', src: 'self', op: 'repaired', place: I.building }); this.done(I, 'minor', T); return;
      case 'fire:ruin': {
        I.crew = this.helpers('builder', 3, 'bd');
        this.push({ t: 'story:build', src: 'self', op: 'demolish', place: I.building, crew: I.crew.slice() });
        this.phase(I, 'demolish', o.demolish || DAY * 0.35, T);
        return;
      }
      case 'fire:demolish': {
        this.push({ t: 'story:build', src: 'self', op: 'construct', place: I.building, purpose: 'rebuild', crew: I.crew.slice() });
        this.phase(I, 'construct', o.construct || DAY * 1.4, T);
        return;
      }
      case 'fire:construct': {
        const better = o.better !== undefined ? !!o.better : true;
        this.push({ t: 'story:build', src: 'self', op: 'done', place: I.building, purpose: 'rebuild', level: better ? 2 : 1 });
        this.done(I, better ? 'rebuilt_better' : 'rebuilt', T); return;
      }
      default: this.done(I, I.outcome || 'done', T);
    }
  }

  /** the fallback's day plan (the engine's planDay formula with the module's rates) */
  planDay(day, rates, happy = 0.5) {
    if (!rates || !rates.incidents) return 0;
    const rng = stream(this.seed, 'plan:' + day);
    const pop = this.roster.filter((p) => !p.pseudo).length;
    const k = (pop / 250) * Math.max(0.35, 1.1 - (happy * 2 - 1) * 0.6) * rates.incidentRate;
    const add = (kind, n, h0, h1) => { for (let i = 0; i < n; i++) this.sched.push([atHour(day, h0 + rng.next() * (h1 - h0)), kind]); };
    let n = 0;
    const c = (m) => { const v = rng.count(m); n += v; return v; };
    add('theft', c(0.6 * k), 9, 19.5);
    add('queue', c(0.7 * k), 9.5, 16.5);
    add('window', c(0.4 * k), 10, 17);
    add('scuffle', c(0.3 * k), 10, 20);
    add('fire', c(rates.fireRate * (pop / 250)), 7, 22);
    this.sched.sort((a, b) => a[0] - b[0]);
    return n;
  }

  /** moving: keep the roster's households valid (members in exactly one household, homes not double booked) */
  move(op, opts = {}) {
    const T = opts.T !== undefined ? opts.T : this.T;
    const rng = stream(this.seed, 'move:' + this.stats.moves);
    this.stats.moves++;
    if (op === 'in') {
      const used = new Set(this.roster.map((p) => p.home));
      const home = opts.home || this.places.homes.find((h) => !used.has(h));
      if (!home) return null;
      const n = Math.max(1, Math.min(5, opts.n || 2 + rng.int(3)));
      const hh = 'hh' + (1000 + this.stats.moves);
      const members = [];
      for (let i = 0; i < n; i++) { const sid = 5000 + this.nextPid++; const age = i < 2 ? 25 + rng.int(20) : 3 + rng.int(12); this.roster.push({ pid: 'n:' + sid, sid, age, hh, home }); members.push(sid); }
      this.push({ t: 'story:move', src: 'self', op: 'in', household: hh, home, who: members[0], whoPid: 'n:' + members[0], members, membersPid: members.map((s) => 'n:' + s) });
      return { hh, home, members };
    }
    if (op === 'plan' || op === 'out') {
      const homes = Array.from(new Set(this.roster.filter((p) => p.home && p.hh && !p.pseudo && !p.named).map((p) => p.home)));
      const home = opts.home || rng.pick(homes);
      if (!home) return null;
      const fam = this.roster.filter((p) => p.home === home && !p.pseudo);
      if (!fam.length) return null;
      const hh = fam[0].hh;
      if (op === 'plan') { this.push({ t: 'story:move', src: 'self', op: 'plan', household: hh, home, members: fam.map((p) => p.sid), day: dayOf(T) + 1 }); return { hh, home }; }
      this.roster = this.roster.filter((p) => p.home !== home || p.pseudo);
      this.push({ t: 'story:move', src: 'self', op: 'out', household: hh, home, who: fam[0].sid, whoPid: fam[0].pid, members: fam.map((p) => p.sid), membersPid: fam.map((p) => p.pid) });
      return { hh, home, members: fam.map((p) => p.sid) };
    }
    return null;
  }
}
