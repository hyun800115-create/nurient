// incidents_runtime test helpers: a roster with every kind of person (kids, teens, grown-ups, grandparents, the town's
// helpers, a named villager), the story places of the town, a fake game (ports) for the host, and a driver that runs
// a model with a ScriptedSource over game time.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IncidentsModel } from '../../../src/city/incidents/model/IncidentsModel.js';
import { ScriptedSource } from '../../../src/city/incidents/model/source.js';
import { INCIDENTS_TUNING } from '../../../src/city/incidents/tuning.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export const PLACES = {
  shops: ['t_flower', 't_toy', 't_cloth', 't_hair', 't_rest', 't_cafe', 't_book'],
  outdoor: ['t_fountain', 't_play', 't_sled', 'plaza'],
  homes: ['t_apt1#1', 't_apt1#2', 't_apt2#1', 't_apt3#1', 't_apt4#1', 'lotH1#1', 'lotH2#1', 'house_3#1'],
  queues: ['t_cafe', 't_rest', 't_flower'],
};

/** 40 people: households of 2 grown-ups + kids / teens, a few grandparents, 2 officers, 3 firefighters, a named villager */
export function makeRoster() {
  const out = [];
  let sid = 1;
  const add = (o) => { out.push(Object.assign({ pid: 't:' + sid, sid: sid++ }, o)); };
  PLACES.homes.forEach((home, h) => {
    add({ age: 30 + h, hh: 'h' + h, home });
    add({ age: 28 + h, hh: 'h' + h, home });
    add({ age: h % 2 ? 9 : 15, hh: 'h' + h, home });
    if (h % 3 === 0) add({ age: 11, hh: 'h' + h, home });
    if (h % 4 === 1) add({ age: 72, hh: 'h' + h, home });
  });
  add({ age: 35, role: 'police', hh: 'pol', home: 'c_police' });
  add({ age: 41, role: 'police', hh: 'pol', home: 'c_police' });
  add({ age: 33, role: 'firefighter', hh: 'ff', home: 't_fire' });
  add({ age: 29, role: 'firefighter', hh: 'ff', home: 't_fire' });
  add({ age: 38, role: 'firefighter', hh: 'ff', home: 't_fire' });
  add({ age: 50, role: 'banker', hh: 'bk', home: 'v5_bank' });
  out.push({ pid: 'v:npc_aunt', sid: sid++, age: 55, named: true, hh: 'v', home: 'vhouse#1' });
  out.push({ pid: 'v:npc_kid', sid: sid++, age: 9, named: true, hh: 'v', home: 'vhouse#1' });
  return out;
}

export const personOf = (roster) => (ref) => roster.find((p) => p.pid === ref || p.sid === ref) || null;

/** env for the director: venues in view by default; the slot free unless `busy()` */
export function makeEnv(roster, opts = {}) {
  const person = personOf(roster);
  return {
    inRange: opts.inRange || (() => true),
    far: opts.far || (() => false),
    slotFree: opts.slotFree || (() => true),
    person,
  };
}

/**
 * run a model + source for `secs` game seconds at `dt`; returns { model, source, log, cmds }.
 * opts: { seed, days, view: 'shown' | 'never' | 'off', start(T, src) hook, fallback planDay }
 */
export function drive(opts = {}) {
  const seed = opts.seed || 11;
  const roster = opts.roster || makeRoster();
  const tuning = Object.assign({}, INCIDENTS_TUNING, opts.tuning || {});
  const model = opts.model || new IncidentsModel({ tuning, saved: opts.saved || null, seed, T: opts.T0 || 0 });
  const source = opts.source || new ScriptedSource({ seed, roster, places: PLACES });
  const env = opts.env || makeEnv(roster, opts.envOpts || {});
  const log = [], cmds = [];
  let T = opts.T0 || 0;
  const dt = opts.dt || 0.25;
  const end = T + (opts.secs || 600);
  let lastDay = -1;
  const seen = new Map();        // staged incident -> T a fake view "shows" the ack phase
  while (T < end) {
    T += dt;
    const d = Math.floor(T / 600);
    if (opts.plan && d !== lastDay) { lastDay = d; source.planDay(d, model.safety.rates(T), 0.5); }
    if (opts.hook) opts.hook(T, source, model);
    source.update(T);
    for (const ev of source.drain()) { log.push(Object.assign({ T }, ev)); model.feed(ev, T, env); }
    model.update(dt, T, env);
    const { events, cmds: cs } = model.drain();
    for (const e of events) log.push(Object.assign({ T }, e));
    for (const c of cs) {
      cmds.push(Object.assign({ T }, c));
      if (c.t === 'ack') source.ack(c.id);
      if (c.t === 'scene' && opts.view === 'shown') seen.set(c.id, T + (opts.showAfter || 4));
    }
    if (opts.view === 'shown') for (const [id, t] of seen) if (T >= t) { const I = model.director.get(id); if (I && I.ack) { model.director.shown(id, I.ack.phase, T); seen.set(id, T + (opts.showAfter || 4)); } else if (!I) seen.delete(id); }
  }
  return { model, source, log, cmds, roster, T };
}

/** a fake game for the host (headless: no view) */
export function fakePorts(over = {}) {
  const S = { T: 0, events: [], toasts: [], cards: [], sites: [], acks: [], rates: [], toggles: [], arranged: [], art: [], stage: { held: false, n: 0 } };
  const ports = {
    clock: { T: () => S.T, hour: () => (S.T % 600) / 25, day: () => Math.floor(S.T / 600) },
    lang: () => 'ko',
    emit: (e) => S.events.push(e),
    ui: { toast: (m) => S.toasts.push(m), card: (c) => S.cards.push(c), banner: (m) => S.toasts.push(m) },
    view: { rect: () => ({ x: 4000, y: 1500, width: 1400, height: 1600 }) },
    world: {
      building: (id) => (/^t_|^lot|^house/.test(id) ? { id, key: 'flower_shop', x: 4500, y: 2000 } : null),
      place: (id) => ({ x: 4600, y: 2100 }),
      name: () => '꽃가게',
      storyPlaces: () => PLACES,
    },
    sites: { offer: (d) => S.sites.push(d) },
    story: { ack: (id) => S.acks.push(id), setRates: (r) => S.rates.push(r), toggles: (t) => S.toggles.push(t), arrange: (op, d) => S.arranged.push([op, d]) },
    stage: { free: () => !S.stage.held, request: () => { S.stage.held = true; S.stage.n++; }, end: () => { S.stage.held = false; } },
    residency: { want: (a) => S.art.push(['want', a]), drop: (a) => S.art.push(['drop', a]) },
    people: { roster: () => makeRoster(), person: (ref) => personOf(makeRoster())(ref), name: (pid) => '김' + pid },
    settings: { get: () => undefined },
  };
  return { ports: Object.assign(ports, over), S };
}
