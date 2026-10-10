// IncidentsModel — the whole pure model of incidents_runtime (docs/v5_v8_plan.md §6.7): the director (story phases ->
// stage), building states, the 안심 bar and the engine rates, the wanted board, moving jobs. No Phaser, no window, no
// clock: the host passes T (game seconds) and a small `env`; everything the game should do comes out of drain().
//
//   const m = new IncidentsModel({ tuning, saved, seed, T })
//   m.feed(ev, T, env)      story:incident | story:build | story:wanted | story:move | settlers | day | built |
//                           mission:done | mission:accept | bank:claim | happy | settings
//   m.update(dt, T, env)
//   m.drain() -> { events: [...module events], cmds: [...host commands] }
//   m.serialize() -> slice (save.js caps it)        m.state(T) -> what the view draws

import { Director } from './director.js';
import { BuildingStates, ST, ST_NAME, bldOf } from './buildings.js';
import { Safety } from './safety.js';
import { WantedBoard } from './wanted.js';
import { Moves } from './moving.js';
import { dayOf } from './time.js';

const SITE = /^inc_(police|fire2|fire3|hydrant_(\d+))$/;

export class IncidentsModel {
  constructor(opts = {}) {
    const cfg = (this.cfg = opts.tuning);
    const s = opts.saved || {};
    this.seed = opts.seed || 20261010;
    this.director = new Director(cfg);
    this.buildings = new BuildingStates(cfg, s.buildings);
    this.safety = new Safety(cfg, s);
    this.wanted = new WantedBoard(s.wanted);
    this.moves = new Moves(cfg, s);
    this.police = !!s.police;
    this.insured = new Set();       // buildings whose fire claim was paid (rebuilt one level better)
    this.events = [];
    this.lastRates = null;
    this.day = dayOf(opts.T || 0);
    this.stats = { feed: 0, builds: 0, moves: 0, posters: 0, toggles: 0 };
    this.pushRates(opts.T || 0, true);
  }

  emit(ev) { this.events.push(ev); }

  // ------------------------------------------------------------------------------------------ input
  feed(ev, T, env) {
    if (!ev || typeof ev.t !== 'string') return;
    this.stats.feed++;
    const D = this.director;
    switch (ev.t) {
      case 'story:incident': {
        if (!this.safety.on && !D.get(Number(ev.id))) return;     // switched off: nothing new comes on (a running fire still resolves)
        const I = D.onIncident(ev, T, this.safety.on ? env : null);
        if (I && I.kind === 'fire') this.fireState(I, ev, T);
        return;
      }
      case 'story:build': return this.build(ev, T);
      case 'story:wanted': return this.wantedEv(ev, T);
      case 'story:move': case 'settlers': {
        const job = this.moves.add(ev.t === 'settlers' ? Object.assign({ op: 'settlers' }, ev) : ev, T);
        if (job) { this.stats.moves++; if (this.moves.queue.indexOf(job) < 0) this.emit({ t: 'inc:move', op: job.op, id: job.id, home: job.home, household: job.household, members: job.members.slice(), membersPid: job.pids.slice(), who: job.members[0], whoPid: job.pids[0] || null }); }
        else if (ev.op === 'plan' && ev.home) this.emit({ t: 'inc:move', op: 'plan', home: ev.home, household: ev.household === undefined ? null : ev.household });
        return;
      }
      case 'day': this.pushRates(T); return;
      case 'happy': { const h = Number(ev.h); if (Number.isFinite(h)) { this.safety.happy = h > 1 ? h / 100 : h; this.pushRates(T); } return; }
      case 'built': return this.builtSite(String(ev.siteId || ev.key || ''), ev, T);
      case 'mission:done': case 'mission:accept': return this.mission(ev, T, env);
      case 'bank:claim': if (ev.id) this.insured.add(bldOf(ev.id)); return;
      case 'settings': if (ev.incidents !== undefined) this.toggle(!!ev.incidents, T); return;
      default: return;
    }
  }

  fireState(I, ev, T) {
    const B = this.buildings, b = I.building;
    if (!b) return;
    let r = null;
    if (ev.phase === 'smoke') { r = B.set(b, 'smoking', T, { inc: I.id }); this.safety.fire(T); this.pushRates(T); }
    else if (ev.phase === 'dispatch' || ev.phase === 'spray') r = B.set(b, 'burning', T, { inc: I.id });
    if (r) this.emit({ t: 'inc:fire', id: I.id, op: ST_NAME[r.st], state: ST_NAME[r.st], building: r.id, bld: r.id });
  }

  build(ev, T) {
    const place = ev.place;
    if (!place) return;
    const B = this.buildings;
    const id = bldOf(place);
    const fire = this.director.active().find((I) => I.kind === 'fire' && bldOf(I.building) === id);
    const fid = fire ? fire.id : 0;
    let r = null, op = ev.op;
    switch (ev.op) {
      case 'scorched': r = B.set(place, 'scorched', T, { inc: fid }); break;
      case 'repaired': r = B.set(place, 'ok', T); op = 'repaired'; break;
      case 'ruin': r = B.set(place, 'ruin', T, { inc: fid }); if (fire) fire.ruined = true; break;
      case 'demolish': r = B.set(place, 'demolition', T, { inc: fid }); break;
      case 'construct': r = B.set(place, 'site', T, { inc: fid }); break;
      case 'done': {
        const prev = B.get(place);
        if (!prev || prev.st !== ST.site) { if (ev.purpose !== 'rebuild') return; }
        const up = this.insured.has(id) || (Number(ev.level) || 1) > 1;
        r = B.set(place, 'rebuilt', T, { inc: fid, levelUp: up, force: true });
        this.insured.delete(id);
        op = 'rebuilt';
        break;
      }
      default: return;
    }
    if (!r) return;
    this.stats.builds++;
    this.emit({ t: 'inc:fire', id: fid, op, state: ST_NAME[r.st], building: r.id, bld: r.id, level: r.lv });
  }

  wantedEv(ev, T) {
    const W = this.wanted;
    if (ev.op === 'post') {
      const pid = typeof ev.whoPid === 'string' ? ev.whoPid : null;
      const r = W.post(ev, T, pid);
      if (r) { this.stats.posters++; this.emit({ t: 'inc:wanted', op: 'post', id: r.inc, slot: r.slot, pid: r.pid, reward: r.reward, item: r.item, anon: r.anon }); }
    } else if (ev.op === 'remove') {
      const r = W.remove(ev);
      if (r) this.emit({ t: 'inc:wanted', op: 'remove', id: r.inc, slot: r.slot, pid: r.pid });
    }
  }

  builtSite(id, ev, T) {
    const m = SITE.exec(id);
    if (!m) return;
    if (m[1] === 'police') { this.police = true; this.emit({ t: 'inc:police', op: 'open' }); }
    else if (m[1] === 'fire2' || m[1] === 'fire3') { if (this.safety.setLevel(m[1] === 'fire3' ? 3 : 2)) this.emit({ t: 'inc:fireLevel', level: this.safety.fireLevel }); }
    else if (m[2] !== undefined) { const x = Number(ev.x), y = Number(ev.y); if (Number.isFinite(x) && Number.isFinite(y) && this.safety.addHydrant(x, y)) this.emit({ t: 'inc:hydrant', n: this.safety.hydrants.length, x, y }); }
    this.pushRates(T);
  }

  mission(ev, T, env) {
    const code = String(ev.code || ev.tpl || ev.id || '');
    if (/^(C14|evt_fire_drill)$/.test(code)) {
      if (ev.t === 'mission:done' && !this.safety.drill) { this.safety.drill = true; this.emit({ t: 'inc:drill', op: 'done' }); this.pushRates(T); }
      else if (ev.t === 'mission:accept') this.director.cmd({ t: 'scene', op: 'drill', at: ev.at || null });
    } else if (/^(E12|exp_wanted)$/.test(code) && ev.t === 'mission:done') {
      // the mission's event key is the incident id (missions: mission:done carries `key: i.k`, patch P-M1); without it
      // the oldest unknown face on the board is the one the chief found
      let inc = Number(ev.key || ev.incident);
      if (!this.wanted.find(inc)) { const a = this.wanted.list().filter((x) => x.anon).sort((x, y) => x.day - y.day || x.slot - y.slot)[0]; inc = a ? a.inc : NaN; }
      const r = this.wanted.tip(inc);
      if (r) { this.emit({ t: 'inc:wanted', op: 'tip', id: r.inc, slot: r.slot, pid: r.pid }); this.director.cmd({ t: 'tip', id: r.inc }); }
    }
  }

  // ------------------------------------------------------------------------------------------ the switch
  toggle(on, T) {
    if (this.safety.on === on) return false;
    this.safety.on = on;
    this.stats.toggles++;
    if (!on) this.director.clearStage(T);
    this.emit({ t: 'inc:toggle', on });
    this.pushRates(T, true);
    return true;
  }

  pushRates(T, force) {
    const r = this.safety.rates(T);
    const k = JSON.stringify(r);
    if (!force && k === this.lastRates) return;
    this.lastRates = k;
    this.director.cmd({ t: 'rates', rates: r });
  }

  // ------------------------------------------------------------------------------------------ frame
  update(dt, T, env) {
    this.director.update(T, this.safety.on ? env : null);
    for (const I of this.director.takeEnded()) this.safety.record(T, I.ok);
    for (const r of this.buildings.update(T)) this.emit({ t: 'inc:fire', id: 0, op: 'ok', state: 'ok', building: r.id, bld: r.id, level: r.lv });
    const mv = this.moves.update(T);
    for (const j of mv.ended) this.emit({ t: 'inc:move', op: 'done', id: j.id, was: j.op, home: j.home, household: j.household });
    for (const j of mv.started) this.emit({ t: 'inc:move', op: j.op, id: j.id, home: j.home, household: j.household, members: j.members.slice(), membersPid: j.pids.slice(), who: j.members[0], whoPid: j.pids[0] || null });
    // the fire gap ends: the engine may plan fires again
    const allowed = this.safety.fireAllowed(T);
    if (allowed !== this.fireWas) { this.fireWas = allowed; this.pushRates(T); }
    const d = dayOf(T);
    if (d !== this.day) { this.day = d; this.pushRates(T); }
  }

  drain() {
    const D = this.director;
    const events = this.events.concat(D.out);
    this.events = []; D.out = [];
    const cmds = D.cmds; D.cmds = [];
    return { events, cmds };
  }

  // ------------------------------------------------------------------------------------------ views + save
  /** everything the persistent view draws (buildings, posters, moves, the cell) */
  state(T) {
    const D = this.director;
    const cell = D.active().filter((I) => I.kind === 'theft' && (I.phase === 'station' || I.phase === 'release')).map((I) => ({ id: I.id, phase: I.phase, culprit: I.cast.culprit || null, victim: I.cast.victim || null, officers: I.cast.officers || [] }));
    return {
      on: this.safety.on, safety: this.safety.percent(T), police: this.police, fireLevel: this.safety.fireLevel, hydrants: this.safety.hydrants.map((h) => h.slice()), drill: this.safety.drill,
      buildings: this.buildings.list().map((r) => ({ id: r.id, state: ST_NAME[r.st], t: r.t, lv: r.lv, smoulder: this.buildings.smouldering(r, T) })),
      wanted: this.wanted.list(), moves: this.moves.jobs.map((j) => Object.assign({}, j)), cell,
      staged: D.staged, active: D.active().map((I) => ({ id: I.id, kind: I.kind, phase: I.phase, staged: I.staged, place: I.place, building: I.building })),
    };
  }

  serialize() {
    const S = this.safety.serialize();
    return {
      v: 1, on: S.on, buildings: this.buildings.serialize(16), wanted: this.wanted.serialize(), hydrants: S.hydrants, fireLevel: S.fireLevel,
      safety: S.safety, drill: S.drill, lastFire: S.lastFire, police: this.police ? 1 : 0, sale: this.moves.serialize(),
    };
  }
}
