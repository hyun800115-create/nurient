// StoryHost (docs/v5_v8_plan.md §6.1 host.js): runs the story core in a Web Worker (or inline on the main thread
// with the same protocol), adopts the game's people, tells the engine where every body is (external plans),
// turns story events into what the player sees (through the view, when one is attached), keeps the main-save slice
// and the side record, and publishes the module API (gs.later.story). No Phaser here: the view is attached by the
// module (index.js) or by the lab.

import { StoryCore } from './model/core.js';
import { M, W, ACT, TOWN_ACT } from './model/protocol.js';
import { PersonRegistry } from './model/registry.js';
import { adoptRoster } from './model/adopt.js';
import { buildStoryWorld } from './model/places.js';
import { chronicleFacts } from './model/chronicle.js';
import { LifeDirector, HOUR, sanitizeLifeState } from './model/lifeRules.js';
import { StageDirector, SLOT_OF } from './model/stage.js';
import { HappeningClock, mulberry32 } from './model/happenings.js';
import { StoryMirror } from './mirror.js';
import { STORY_TUNING, engineConfig } from './tuning.js';
import { makeSlice, sanitizeSlice, StorySideStore } from './save.js';
import { s as str } from './strings.js';

const DAY = 24 * HOUR;
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
/** small ceremony beats a wedding or a farewell may cut short when they hold the stage (critique H6) */
const PREEMPT = { birthday: 1, proposal: 1, housewarming: 1, firstjob: 1 };
/** the beats whose end is worth a side save at once (critique H1 c) */
const SAVE_AFTER = { wedding: 1, farewell: 1, proposal: 1, lastday: 1, school: 1 };

// ---------------------------------------------------------------- transports
export class InlineTransport {
  constructor(opts = {}) {
    this.mode = 'inline';
    this.inbox = [];
    this.core = new StoryCore((m) => this.inbox.push(m), { maxCatch: opts.maxCatch || 8 });
  }
  post(m) { this.core.handle(m); }
  close() { this.core = null; }
}

export class WorkerTransport {
  /** worker: a Worker (module or Blob) speaking the protocol */
  constructor(worker, mode = 'worker') {
    this.mode = mode;
    this.inbox = [];
    this.failed = false;
    this.w = worker;
    this.onwake = null;
    this.onsaved = null;
    // a side save is written the moment its packed engine arrives, not on the next frame: a hidden page has no
    // frames, and a save forced on visibilitychange: hidden must land before the OS kills the tab (critique H1 / E9)
    worker.onmessage = (e) => {
      const m = e.data;
      if (m && m.t === W.SAVED && this.onsaved) { this.onsaved(m); return; }
      this.inbox.push(m);
      if (this.onwake) this.onwake();
    };
    worker.onerror = (e) => { this.failed = true; this.error = (e && e.message) || 'worker error'; if (e && e.preventDefault) e.preventDefault(); };
  }
  post(m, transfer) { try { this.w.postMessage(m, transfer || []); } catch (e) { this.failed = true; this.error = String(e); } }
  close() { try { this.w.terminate(); } catch (e) { /* gone */ } }
}

/** worker -> Blob worker (opts.workerSrc: the bundled classic script text) -> null (inline) */
export function makeWorker(opts = {}) {
  if (typeof Worker === 'undefined' || opts.worker === false) return null;
  try {
    if (opts.workerUrl) return { w: new Worker(opts.workerUrl, { type: opts.classic ? 'classic' : 'module' }), mode: 'worker' };
    return { w: new Worker(new URL('./model/worker.js', import.meta.url), { type: 'module' }), mode: 'worker' };
  } catch (e) { /* blocked: try a Blob worker */ }
  if (opts.workerSrc && typeof Blob !== 'undefined' && typeof URL !== 'undefined' && URL.createObjectURL) {
    try { const url = URL.createObjectURL(new Blob([opts.workerSrc], { type: 'text/javascript' })); return { w: new Worker(url), mode: 'blob' }; } catch (e) { /* inline */ }
  }
  return null;
}

// ---------------------------------------------------------------- host
export class StoryHost {
  /**
   * ports: see ports.js. saved: the main-save slice (or undefined). opts: { tuning, transport ('worker' | 'inline' |
   *   a transport object), workerUrl, workerSrc, view (attachView later), lang }
   */
  constructor(ports, saved, opts = {}) {
    this.ports = ports;
    this.opts = opts;
    this.T = Object.assign({}, STORY_TUNING, opts.tuning || {});
    this.T.life = Object.assign({}, STORY_TUNING.life, (opts.tuning && opts.tuning.life) || {});
    this.T.stage = Object.assign({}, STORY_TUNING.stage, (opts.tuning && opts.tuning.stage) || {});
    this.slice = sanitizeSlice(saved);
    const life = this.slice ? this.slice.life : null;
    this.registry = new PersonRegistry({ knownServed: this.T.life.knownServed });
    this.mirror = new StoryMirror();
    this.facade = this.mirror;
    this.nameCache = new Map();            // sid -> [ko, en, male, age]
    this.director = new LifeDirector(Object.assign({}, this.T.life, { paperHour: this.T.paper.hour }), life, this.hooks());
    this.stage = new StageDirector({ near: 1200 });
    const T0 = ports.T ? ports.T() : 0;
    // (critique L3) a happening order of its own per save and day, not the same first happening every session
    const hseed = (((ports.seed ? ports.seed() : 1) >>> 0) ^ Math.imul(Math.floor(T0 / DAY) + 1, 2654435761)) >>> 0;
    this.happen = new HappeningClock(this.T.happenings, this.slice ? this.slice.happen : null, mulberry32(hseed));
    this.view = null;
    this.reqs = new Map();
    this.saveReqs = new Map();             // save request -> the registry / life state as they were when it was asked for (L9)
    this.reqN = 1;
    this.acc = 0;
    this.visAcc = 0;
    this.lastAt = new Map();               // sid -> place * 64 + act (deltas only)
    this.rows = [];
    this.visKey = '';
    this.ready = false;
    this.failed = null;
    this.mode = null;
    this.placeIdx = new Map();
    this.byGame = Object.create(null);
    this.homeIdx = new Map();              // pid -> story home place idx
    this.cardQ = [];
    this.board = [];                       // older cards: the hall board's 마을 소식
    this.cardOn = null;
    this.paper = null;
    this.paperDay = -1;
    this.sold = { day: -1, n: 0, reported: false };
    this.trainHour = -1;
    this.pending = [];                     // slot beats waiting for the stage (until their window ends)
    this.running = null;                   // the ceremony beat on stage now
    this.afterBeat = [];                   // banners held while a set piece is on stage
    this.watching = new Set();             // beat kinds the chief asked to watch (보러 가기)
    this.proposalAt = null;                // T of the scripted first proposal (읍 + 12 s); retried until it plays
    this.quietUntil = null;                // stale side record: the engine replays up to here quietly (H1)
    this.saveSoon = false;
    this.lastForced = -1e9;
    this.t0 = this.slice && this.slice.t0 > 0 ? this.slice.t0 : null;
    this.chars = this.slice ? this.slice.chars : 0;
    this.stats = { ticks: 0, ms: 0, maxMs: 0, long: 0, events: 0, talks: 0, msgsIn: 0, msgsOut: 0, beats: 0, cards: 0, saves: 0, saveMs: 0, quiet: 0, skipped: 0 };
    this.log = [];                         // last actions (tests, the lab HUD)
    this.listeners = Object.create(null);
    this.store = ports.storage ? new StorySideStore(ports.storage, ports.sideKey || 'frostVillage.save.v1.story', { hardChars: this.T.save.hardChars }) : null;
    this.api = this.makeApi();
  }

  now() { return this.ports.T ? this.ports.T() : 0; }
  today() { return Math.floor(this.now() / DAY); }

  // ---------------------------------------------------------------- startup
  /** async: adopt (or restore), boot the core; resolves with { mode, restored, people } */
  async start() {
    const P = this.ports;
    const T = this.now();
    if (this.t0 === null) this.t0 = T;
    const side = this.store ? this.store.load(P.cid ? P.cid() : 'story') : null;
    this.transport = this.pickTransport();
    this.mode = this.transport.mode;
    // until the story is ready, worker replies are handled as they come (no frame loop needed); then once a frame
    this.transport.onwake = () => { if (!this.ready) this.drain(); };
    this.transport.onsaved = (m) => this.onSaved(m);
    const lang = P.lang ? P.lang() : 'ko';
    const farewellOn = this.farewellOn();
    const cfg = engineConfig(this.T, { farewell: farewellOn, farewellFromDay: this.farewellFromDay(), paperRateBp: this.bankRateBp() });
    let restored = false, people = 0;
    if (side) {
      this.registry = PersonRegistry.fromJSON(side.reg, { knownServed: this.T.life.knownServed });
      const r = await this.boot({ t: M.INIT, save: side.eng, config: cfg, lang, startAt: T, world: { places: this.extraPlaces() } });
      restored = !!r.restored;
      if (!restored) this.registry = new PersonRegistry({ knownServed: this.T.life.knownServed });
      people = r.people;
    }
    if (!restored) {
      const roster = P.people ? P.people.roster() : [];
      const A = adoptRoster(roster, { seed: P.seed ? P.seed() : 1, relations: P.people && P.people.relations ? P.people.relations() : [] });
      const Wd = buildStoryWorld({ buildings: P.world ? P.world.buildings() : [], spots: P.world ? P.world.spots() : [], households: A.households });
      this.byGame = Wd.byGame;
      for (const sp of A.specs) sp.home = Wd.homeOf[sp.home] || undefined;
      await this.boot({ t: M.INIT, seed: P.seed ? P.seed() : 1, lang, dayLength: DAY, world: { places: Wd.places, plots: [] }, config: cfg, startAt: T });
      const chron = chronicleFacts(P.people && P.people.chronicle ? P.people.chronicle() : {});
      const res = await this.request({ t: M.ADOPT, specs: A.specs, rels: A.rels, chronicle: chron });
      this.bindSpecs(A.specs, res.sids, roster);
      people = res.people;
      if (side === null && this.slice && this.slice.ok) this.queueCard({ kind: 'forgot', ko: str('ko', 'forgot'), en: str('en', 'forgot'), icon: 'ui_icon_memory', pids: [] });
      // a re-adoption deals new sids: the slice speaks pids, and a first couple whose bodies are gone is let go (H3)
      const fc = this.director.s.firstCouple;
      if (fc.length === 2 && !(this.registry.has(fc[0]) && this.registry.has(fc[1]))) this.director.s.firstCouple = [];
    } else {
      await this.reconcile();
      const sliceT = this.slice ? this.slice.T : 0;
      // the side record is newer than the main save (the main save lagged): its copy of the life state wins
      if (side.life && side.T > sliceT + 1) this.director.s = sanitizeLifeState(side.life);
      // a stale side record: the engine replays what the player already saw, quietly (critique H1 / E1)
      if (this.slice && side.T < sliceT - 30) { this.quietUntil = sliceT; this.director.quietUntil = sliceT; }
    }
    await this.mapPlaces();
    this.post({ t: M.TOGGLES, toggles: { lifeEvents: this.lifeOn(), farewell: farewellOn, incidents: false } });
    const prices = P.people && P.people.prices ? P.people.prices() : null;
    if (prices) this.post({ t: M.PRICES, map: prices });
    // the beats the player was promised (a wedding day, a school day, a last day, a farewell) get their timers back,
    // and a promised wedding the (stale or new) engine does not know is made again, silently (critique H1 / H11)
    const weddings = this.director.restore(T);
    if (weddings.length) {
      const booked = (await this.query('booked')) || [];
      for (const w of weddings) {
        const a = this.registry.sidOf(w.a), b = this.registry.sidOf(w.b);
        if (a < 0 || b < 0 || booked.some((x) => x.kind === 'wedding' && ((x.a === a && x.b === b) || (x.a === b && x.b === a)))) continue;
        await this.arrange('propose', { a, b, day: w.day, hour: this.T.life.weddingHour, silent: true });
      }
    }
    // today's paper after a reload between 05:00 and its delivery
    const ls = this.director.s, today = Math.floor(T / DAY);
    if (ls.seen.wedding && today >= ls.paperFrom && ls.paperDay < today) {
      const p = await this.query('paperNow');
      if (p && p.day === today) this.director.later(Math.max(T, this.director.at(today, this.T.paper.hour)), { a: 'paper', key: 'p:' + today, day: today, paper: p });
    }
    // an old save already at 읍 plays the first proposal once, 5 s after the load
    const ch = P.people && P.people.chronicle ? P.people.chronicle() : {};
    if ((ch.rank || 1) >= 2 && !this.director.s.seen.proposal) this.proposalAt = T + 5;
    this.ready = true;
    this.emit('ready', { mode: this.mode, restored, people });
    return { mode: this.mode, restored, people };
  }

  pickTransport() {
    const o = this.opts;
    if (o.transport && typeof o.transport === 'object') return o.transport;
    const wantWorker = o.transport !== 'inline' && this.T.worker !== false;
    if (wantWorker) {
      const mw = makeWorker({ workerUrl: o.workerUrl, workerSrc: o.workerSrc, classic: o.classicWorker });
      if (mw) return new WorkerTransport(mw.w, mw.mode);
    }
    return new InlineTransport({ maxCatch: this.T.inlineCatch });
  }

  /** send init; a worker that fails before 'ready' is replaced by the inline core (same messages again) */
  boot(msg) {
    return new Promise((resolve) => {
      const req = this.reqN++;
      msg.req = req;
      this.reqs.set(req, (data) => { this.transportReady = true; resolve(data); });
      this.initMsg = msg;
      this.post(msg);
      if (this.transport.mode === 'inline') this.drain();
    });
  }

  /** bind adopted specs; the game's own visit counts seed 단골 (v4 regulars, critique M8) */
  bindSpecs(specs, sids, rows) {
    const byPid = new Map((rows || []).map((r) => [r.pid, r]));
    sids.forEach((sid, i) => {
      const sp = specs[i];
      this.registry.bind(sp.gid, sid, { kept: !!sp.kept, role: sp.role });
      const row = byPid.get(sp.gid);
      if (row && Number.isFinite(row.visits)) this.registry.seedServed(sp.gid, row.visits);
    });
  }

  /** places the game built since the side record was written (they are added to the restored world) */
  extraPlaces() {
    const P = this.ports;
    const Wd = buildStoryWorld({ buildings: P.world ? P.world.buildings() : [], spots: P.world ? P.world.spots() : [], households: [] });
    this.byGame = Wd.byGame;
    return Wd.places;
  }

  async mapPlaces() {
    const ids = await this.query('placeIds');
    this.placeIdx.clear();
    (ids || []).forEach((id, i) => this.placeIdx.set(id, i));
    // each person's story home (households live in '<building>#n')
    const fam = await this.query('homes');
    if (fam) for (const [sid, homeId] of fam) { const pid = this.registry.pidOf(sid); if (pid && this.placeIdx.has(homeId)) this.homeIdx.set(pid, this.placeIdx.get(homeId)); }
  }

  /** after a restore: game people missing in the story join it (a story child's body finds its person again); story
   *  people without a body are leased 'away'; a story child whose body the game lost gets a new one */
  async reconcile() {
    const P = this.ports;
    const roster = P.people ? P.people.roster() : [];
    const have = new Set(roster.map((r) => r.pid));
    const missing = [];
    for (const r of roster) {
      if (this.registry.has(r.pid)) continue;
      // a body the game kept for a story child (P6: pid 'k:…' + its sid) whose binding was not in the side record
      if (Number.isInteger(r.sid) && !this.registry.pidOf(r.sid)) {
        const q = await this.query('alive', { sid: r.sid });
        if (q && !q.kept && Math.abs(q.age - (Number.isFinite(r.age) ? r.age : q.age)) <= 2) { this.registry.bind(r.pid, r.sid, { role: 'child' }); continue; }
      }
      missing.push(r);
    }
    if (missing.length) {
      const A = adoptRoster(missing, { seed: P.seed ? P.seed() : 1, relations: [] });
      const Wd = buildStoryWorld({ buildings: P.world ? P.world.buildings() : [], spots: [], households: A.households });
      for (const pl of Wd.places) if (pl.kind === 'home') await this.request({ t: M.PLACE, def: pl });
      for (const sp of A.specs) sp.home = Wd.homeOf[sp.home] || undefined;
      const res = await this.request({ t: M.ADOPT, specs: A.specs, rels: A.rels, settle: false, jobs: false });
      this.bindSpecs(A.specs, res.sids, missing);
    }
    for (const pid of this.registry.pids()) {
      if (have.has(pid) || /^x:/.test(pid)) continue;
      const sid = this.registry.sidOf(pid);
      if (/^k:/.test(pid)) {
        // the game lost a story child's body: make it again (the kit persists 'k:' bodies; this is the safety net)
        const q = await this.query('alive', { sid });
        this.registry.unbind(pid);
        if (q) await this.makeBody({ sid, age: q.age });
        continue;
      }
      this.post({ t: M.LEASE, sid, on: true }); this.registry.lease(pid, 'gameplay');
    }
  }

  // ---------------------------------------------------------------- messaging
  post(msg, transfer) { this.stats.msgsOut++; this.transport.post(msg, transfer); }
  request(msg) {
    return new Promise((resolve) => {
      const req = this.reqN++;
      msg.req = req;
      this.reqs.set(req, resolve);
      this.post(msg);
      if (this.transport.mode === 'inline') this.drain();
    });
  }
  query(name, args) { return this.request({ t: M.QUERY, name, args: args || {} }); }

  drain() {
    const tr = this.transport;
    if (!tr) return;
    if (tr.failed && !this.ready && tr.mode !== 'inline') {
      // the worker could not start (blocked in the published page): the same protocol on the main thread
      this.failed = tr.error;
      const pend = Array.from(this.reqs.entries());
      this.transport = new InlineTransport({ maxCatch: this.T.inlineCatch });
      this.mode = 'inline';
      if (this.initMsg) { this.reqs.clear(); for (const [req, fn] of pend) this.reqs.set(req, fn); this.transport.post(this.initMsg); }
    }
    const box = this.transport.inbox;
    if (!box.length) return;
    this.transport.inbox = [];
    for (const m of box) { this.stats.msgsIn++; this.receive(m); }
    if (this.transport.inbox.length && this.transport.mode === 'inline') this.drain();
  }

  receive(m) {
    switch (m.t) {
      case W.READY: { const fn = this.reqs.get(m.req); if (fn) { this.reqs.delete(m.req); fn(m); } return; }
      case W.REPLY: { const fn = this.reqs.get(m.req); if (fn) { this.reqs.delete(m.req); fn(m.data); } return; }
      case W.MIRROR: this.mirror.apply(m); return;
      case W.SAVED: return this.onSaved(m);
      case W.ERROR: { this.log.push(['error', m.msg]); if (m.req) { const fn = this.reqs.get(m.req); if (fn) { this.reqs.delete(m.req); fn(null); } } this.emit('error', m); return; }
      case W.EVENTS:
        for (const ev of m.list) this.dispatch(ev);
        if (this.quietUntil !== null && m.T > this.quietUntil) this.endQuiet();
        return;
      default: return;
    }
  }

  endQuiet() { this.quietUntil = null; this.director.quietUntil = null; this.saveSoon = true; }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const t0 = nowMs();
    this.drain();
    if (this.ready) {
      this.acc += dt;
      this.visAcc += dt;
      if (this.acc >= this.T.tickEvery) { const d = this.acc; this.acc = 0; this.sendTick(d); }
      const T = this.now();
      for (const a of this.director.update(T)) this.exec(a);
      if (this.pending.length) this.retryPending();
      this.happenings(T);
      if (this.cardOn && T >= this.cardOn.until) this.nextCard();
      if (this.proposalAt !== null && T >= this.proposalAt) { this.proposalAt = null; this.firstProposal(); }
      // the first couple's good news comes at v5 + firstBabyAfterMin (23 min), the baby one game day later — only
      // while life events are on (critique M7)
      const ls = this.director.s;
      if (ls.seen.wedding && !ls.seen.expect && ls.firstCouple.length === 2 && this.lifeOn() && T >= (this.t0 || 0) + this.T.life.firstBabyAfterMin * 60 && this.quietUntil === null) {
        ls.seen.expect = true;
        const a = this.registry.sidOf(ls.firstCouple[0]), b = this.registry.sidOf(ls.firstCouple[1]);
        if (a >= 0 && b >= 0) this.arrange('expect', { a, b, inDays: 1 });
      }
      if (this.saveSoon && this.quietUntil === null && T - this.lastForced > 5) { this.saveSoon = false; this.lastForced = T; this.saveSide(true); }
    }
    if (this.view) this.view.update(dt);
    const ms = nowMs() - t0;
    const S = this.stats;
    S.ticks++; S.ms += ms; if (ms > S.maxMs) S.maxMs = ms; if (ms > 50) S.long++;
  }

  sendTick(dt) {
    const P = this.ports, R = this.registry;
    const rows = this.rows;
    rows.length = 0;
    if (P.town && P.town.whereabouts) P.town.whereabouts(rows);
    const at = [];
    for (const row of rows) {
      const pid = row[0];
      const sid = R.sidOf(pid);
      if (sid < 0) continue;
      const owner = R.owner(pid);
      const busy = row[4];
      if (busy === 'gameplay' && owner === 'town') { R.lease(pid, 'gameplay'); this.post({ t: M.LEASE, sid, on: true }); continue; }
      if (!busy && owner === 'gameplay') { R.release(pid, 'gameplay'); this.post({ t: M.LEASE, sid, on: false }); }
      if (owner !== 'town') continue;
      const state = row[3];
      let place = -1, act = TOWN_ACT[row[2]] !== undefined ? TOWN_ACT[row[2]] : ACT.social;
      if (state !== 'walk' && state !== 'away') {
        if ((act === ACT.home || act === ACT.sleep) && this.homeIdx.has(pid)) place = this.homeIdx.get(pid);
        else if (row[1]) { const id = this.byGame[row[1]] || row[1]; place = this.placeIdx.has(id) ? this.placeIdx.get(id) : -1; }
      }
      const key = place * 64 + act;
      if (this.lastAt.get(sid) === key) continue;
      this.lastAt.set(sid, key);
      at.push(sid, place, act);
    }
    const msg = { t: M.TICK, dt, T: P.T ? P.T() : 0, at: Int32Array.from(at) };
    this.post(msg, this.transport.mode === 'inline' ? undefined : [msg.at.buffer]);
    // who is on screen (≤ 2 Hz, ≤ 64): their talks get words
    if (this.visAcc >= 0.5) {
      this.visAcc = 0;
      const vis = [];
      if (P.town && P.town.visible) P.town.visible(vis, 64);
      const sids = [];
      for (const pid of vis) { const sid = R.sidOf(pid); if (sid >= 0) sids.push(sid); }
      sids.sort((a, b) => a - b);
      const key = sids.join(',');
      if (key !== this.visKey) { this.visKey = key; this.post({ t: M.VISIBLE, ids: sids }); this.post({ t: M.WATCH, ids: sids.slice(0, 24) }); }
    }
  }

  // ---------------------------------------------------------------- story events -> the game
  dispatch(ev) {
    this.stats.events++;
    if (ev.nm) for (const id in ev.nm) this.nameCache.set(+id, ev.nm[id]);
    // a replay of time the player already saw (stale side record): the engine's state moves on, nothing is shown
    const quiet = this.quietUntil !== null && Number.isFinite(ev.T) && ev.T <= this.quietUntil;
    if (quiet) this.stats.quiet++;
    switch (ev.e) {
      case 'talk': if (quiet) return; this.stats.talks++; this.mirror.emit('talk', ev); if (this.view) this.view.talk(ev); return;
      case 'arrive': if (!quiet && this.view) this.view.arrive(ev); return;
      case 'bank': if (!quiet) this.out('story:bank', ev); return;
      case 'shop': if (!quiet) this.out('story:shop', ev); return;
      case 'build': if (!quiet) this.out('story:build', ev); return;
      case 'incident': if (!quiet) this.out('story:incident', ev); return;
      case 'wanted': return;
      default: break;
    }
    if (ev.e === 'news') this.mirror.apply({ paper: ev.paper });
    for (const a of this.director.onEvent(ev)) this.exec(a);
  }

  exec(a) {
    this.log.push([a.a, a.kind || a.name || a.op || '']);
    if (this.log.length > 200) this.log.splice(0, 50);
    switch (a.a) {
      case 'beat': return this.playBeat(a);
      case 'card': return this.queueCard(a.card);
      case 'banner': {
        // a banner waits until the set piece on stage ends (the wedding banner comes after the "네!", not over it)
        const cer = this.stage.active.ceremony;
        if ((cer && cer.staged) || this.holdBanners) { this.afterBeat.push(a); return; }
        this.ui('banner', { kind: a.kind, ko: a.ko, en: a.en, subKo: a.subKo, subEn: a.subEn });
        return;
      }
      case 'leave': return this.leave(a.sids || [], a.why);
      case 'emit':
        if (a.name === 'story:life' && (a.data.op === 'engaged' || a.data.op === 'lastday' || a.data.op === 'farewell' || a.data.op === 'school')) this.saveSoon = true;
        return this.out(a.name, a.data);
      case 'route': if (this.view) this.view.route(a.kind, a.ev); return;
      case 'paper': return this.deliverPaper(a);
      case 'body': return this.makeBody(a);
      case 'wishcheck': return this.wishCheck();
      case 'arrange': this.arrange(a.op, a.data); return;
      case 'config': this.post({ t: M.CONFIG, config: a.config }); return;
      default: return;
    }
  }

  /** people who left the story (a family moved away, an elder's farewell): their bodies leave the town, their pids
   *  are unbound so no scene, talk or card can use them again (critique H4) */
  leave(sids, why) {
    for (const sid of sids) {
      const pid = this.registry.pidOf(sid);
      if (!pid) continue;
      if (this.view && this.view.releaseBody) this.view.releaseBody(pid);
      if (this.ports.town && this.ports.town.leave) this.ports.town.leave(pid, why || 'left');
      this.registry.unbind(pid);
      this.homeIdx.delete(pid);
      this.lastAt.delete(sid);
      this.director.wishEnded(pid);
    }
  }

  /** module events out, with pids next to sids (other modules know people by pid) */
  out(name, data) {
    const d = Object.assign({}, data);
    for (const k of ['a', 'b', 'who', 'baby']) if (Number.isInteger(d[k]) && d[k] >= 0) d[k + 'Pid'] = this.registry.pidOf(d[k]);
    if (Array.isArray(d.members)) d.membersPid = d.members.map((sid) => this.registry.pidOf(sid) || null);
    if (this.ports.events) this.ports.events.emit(name, d);
    this.emit(name, d);
  }

  // ---------------------------------------------------------------- beats
  venueXY(id, kind) {
    const w = this.ports.world;
    const p = w && w.spot ? w.spot(id, kind || 'door') : null;
    return p || null;
  }

  /**
   * a beat from the director. Slot beats (ceremony / happening) ask the StageDirector; a busy slot keeps the beat
   * waiting by game time until its window ends (wedding → 12:00, farewell → 12:00, others a game minute), and a
   * wedding or a farewell cuts a birthday party or a later proposal short (critique H6). The first wedding and the
   * first farewell wait until 11:00 for the camera to come near (or the chief's 보러 가기) before they play far away (M9).
   */
  playBeat(b, retry) {
    if (!retry) this.stats.beats++;
    const slot = SLOT_OF[b.kind];
    if (!slot) { if (this.view) this.view.play(b, { ok: true, staged: true, ambient: true }, null); return; }
    const T = this.now();
    if (b.until && T > b.until) { this.skipBeat(b); return; }
    const venue = b.venue ? this.venueXY(b.venue, 'gather') : null;
    const view = this.ports.view && this.ports.view.rect ? this.ports.view.rect() : null;
    const watch = !!b.forceWatch || this.watching.has(b.kind);
    if (b.waitUntil === undefined) b.waitUntil = this.firstWait(b);
    if (b.waitUntil && T < b.waitUntil && !watch && !this.stage.inRange(venue, view)) { this.pending.push(b); return; }
    const d = this.stage.request({ kind: b.kind, venue, watch, T }, view);
    if (!d.ok) {
      if (d.why === 'busy' && b.kind !== 'birthday') {
        const cur = this.stage.active.ceremony, run = this.running;
        const small = cur && PREEMPT[cur.kind] && !(cur.kind === 'proposal' && run && run.data && run.data.scripted);
        if ((b.kind === 'wedding' || b.kind === 'farewell') && small && this.view && this.view.cancel) this.view.cancel(cur.kind);
        if (!b.until) b.until = T + this.T.stage.waitSec;
        this.pending.push(b);
      }
      return;
    }
    if (watch) this.watching.delete(b.kind);
    if (b.kind === 'wedding' || b.kind === 'farewell') this.post({ t: M.CONFIG, config: { farewellHold: true } });
    if (slot === 'ceremony') this.running = b;
    if (this.view && d.staged) this.view.play(b, d, () => this.endBeat(b));
    else this.endBeat(b);
  }

  /** the first wedding / farewell waits for the camera until 11:00 of its day */
  firstWait(b) {
    const s = this.director.s, d = b.at ? Math.floor(b.at / DAY) : this.today();
    if (b.kind === 'wedding' && b.data && b.data.first) return d * DAY + this.T.stage.firstWatchHour * HOUR;
    if (b.kind === 'farewell' && !s.seen.farewellBeat) return d * DAY + this.T.stage.firstWatchHour * HOUR;
    return 0;
  }

  endBeat(b) {
    this.stage.end(b.kind);
    if (this.running === b) this.running = null;
    if (b.book) this.director.unbook(b.book);
    if (b.kind === 'school') this.director.s.seen.school = true;
    if (b.kind === 'farewell') this.director.s.seen.farewellBeat = true;
    if (this.afterBeat.length) { const list = this.afterBeat; this.afterBeat = []; for (const a of list) this.exec(a); }
    if (b.kind === 'wedding' || b.kind === 'farewell') this.post({ t: M.CONFIG, config: { farewellHold: false } });
    if (SAVE_AFTER[b.kind]) this.saveSoon = true;
    this.emit('beatEnd', b);
  }

  /** the window of a waiting beat passed: it happened off stage (the engine's own events still ran) */
  skipBeat(b) { this.stats.skipped++; b.skipped = true; this.endBeat(b); }

  retryPending() {
    const list = this.pending;
    this.pending = [];
    for (const b of list) this.playBeat(b, true);
  }

  happenings(T) {
    const busy = this.stage.busy('ceremony') || this.stage.driving;
    if (!this.happen.peek(T, busy)) return;               // the ports are asked only when one is due (M14)
    const spots = this.ports.happenSpots ? this.ports.happenSpots() : null;
    const h = this.happen.due(T, { busy, open: this.ports.open ? this.ports.open() : {}, spots });
    if (!h) return;
    const d = this.stage.request({ kind: 'happening' }, null);
    if (!d.ok) { this.happen.end(); return; }
    const sp = spots && spots[h.where], V = this.ports.view;
    this.out('story:happening', { id: h.id, key: h.key, where: h.where || null, watched: !!(sp && V && V.onScreen && V.onScreen(sp.x, sp.y, 0)) });
    if (this.view && this.view.happening) this.view.happening(h, () => { this.stage.end('happening'); this.happen.end(); });
    else { this.ui('toast', { ko: h.toastKo, en: h.toastEn }); this.stage.end('happening'); this.happen.end(); }
  }

  // ---------------------------------------------------------------- cards (one at a time, queue 3; older ones go to the hall board)
  queueCard(card) {
    const muted = this.ports.settings && this.ports.settings.get && this.ports.settings.get('missionToasts') === false;
    this.stats.cards++;
    if (muted && card.kind !== 'farewell') { this.board.push(card); return; }
    this.cardQ.push(card);
    while (this.cardQ.length > (this.T.life.cardsQueue || 3)) this.board.push(this.cardQ.shift());
    if (this.board.length > 12) this.board.splice(0, this.board.length - 12);
    if (!this.cardOn) this.nextCard();
  }
  nextCard() {
    this.cardOn = null;
    const c = this.cardQ.shift();
    if (!c) return;
    const T = this.now();
    this.cardOn = { card: c, until: T + (c.kind === 'farewell' ? 14 : 8) };
    const lang = this.ports.lang ? this.ports.lang() : 'ko';
    // the attached view draws the story card itself; without one the game's card host (ports.ui.card) shows it
    if (this.view && this.view.card) { this.emit('ui:card', c); this.view.card(c, lang); }
    else this.ui('card', Object.assign({ text: lang === 'en' ? c.en : c.ko, sub: lang === 'en' ? c.subEn : c.subKo }, c));
  }

  /** ports.ui: toast(text, holdSec) — seconds (the kit converts for UI.toast's ms); banner(spec) — the kit picks the
   *  language: gs.ui.banner(title, sub) (critique M5) */
  ui(kind, spec) {
    const U = this.ports.ui;
    this.emit('ui:' + kind, spec);
    if (!U) return;
    if (kind === 'banner' && U.banner) U.banner(spec);
    else if (kind === 'card' && U.card) U.card(spec);
    else if (kind === 'toast' && U.toast) U.toast((this.ports.lang && this.ports.lang() === 'en') ? spec.en : spec.ko, spec.holdSec || 3);
  }

  deliverPaper(a) {
    const no = this.director.paperOut(a.day);
    if (!no) return;
    // the issue number counts from the first edition the chief gets (창간호), not the engine's own count (M3)
    const num = (p) => (p ? Object.assign({}, p, { no, first: no === 1 }) : p);
    const paper = a.paper ? Object.assign({}, a.paper, { ko: num(a.paper.ko), en: num(a.paper.en) }) : null;
    this.paper = paper;
    this.paperDay = a.day;
    if (paper) this.mirror.apply({ paper });
    const U = this.ports.ui;
    // the view's own edge icon when a view is attached, else the game's chip row
    if (U && U.chip && !(this.view && this.view.paper)) U.chip('news', { icon: 'ui_icon_newspaper', pulse: true, day: a.day, first: no === 1 });
    if (this.ports.sound) this.ports.sound.play('sfx_newspaper', { volume: 0.6 });
    this.out('story:news', { day: a.day, first: no === 1, no });
    if (this.view && this.view.paper) this.view.paper(Object.assign({}, a, { paper }));
  }

  /** a story child (4) gets a body in the town: pid 'k:<sid>' (never a TownSim 't:' id that a later citizen could get, H7) */
  async makeBody(a) {
    const T = this.ports.town;
    if (!T || !T.addCitizen || this.registry.pidOf(a.sid)) return;
    const fam = await this.query('family', { sid: a.sid });
    if (this.registry.pidOf(a.sid)) return;
    const parents = fam ? fam.parents.map((s) => this.registry.pidOf(s)).filter(Boolean) : [];
    const homePid = parents[0] || null;
    let want = 'k:' + a.sid;
    for (let n = 2; this.registry.has(want); n++) want = 'k:' + a.sid + '.' + n;
    const pid = T.addCitizen({ pid: want, kind: 'child', townKind: a.age < 7 ? 'toddler' : 'student', age: a.age, parents, home: homePid ? { like: homePid } : null, sid: a.sid });
    if (pid) { this.registry.bind(pid, a.sid, { role: 'child' }); if (homePid && this.homeIdx.has(homePid)) this.homeIdx.set(pid, this.homeIdx.get(homePid)); this.saveSoon = true; }
  }

  async wishCheck() {
    if (this.quietUntil !== null) return;
    const list = await this.query('wishers', { minAge: this.T.life.wishAge });
    if (!list || !list.length) return;
    const fam = [];
    for (const w of list) { const n = this.nameCache.get(w.id); if (!n) this.nameCache.set(w.id, [w.name, w.nameEn, 0, w.age]); fam.push(w); }
    const pick = this.director.pickWish(fam, { open: this.ports.open ? this.ports.open() : {} });
    if (!pick) return;
    this.queueCard({ kind: 'wish', sids: [pick.sid], pids: [pick.pid], ko: pick.ko, en: pick.en, icon: 'ui_icon_story', mission: 'C7', wish: pick.wish.id });
    // missions_bank spawns C7 on story:life { op: 'wish' } (critique H5); story:wish stays for its wish text
    const d = { who: pick.sid, wish: pick.wish.id, place: pick.wish.place, ko: pick.wish.ko, en: pick.wish.en };
    this.out('story:life', Object.assign({ op: 'wish' }, d));
    this.out('story:wish', d);
    this.saveSoon = true;
  }

  // ---------------------------------------------------------------- hooks for the director
  hooks() {
    return {
      pidOf: (sid) => this.registry.pidOf(sid),
      sidOf: (pid) => this.registry.sidOf(pid),
      known: (pid) => this.registry.known(pid),
      farewellOn: () => this.farewellOn(),
      gardenReady: () => !!(this.ports.world && this.ports.world.has && this.ports.world.has('memorial_garden')),
      nameOf: (sid, lang) => { const n = this.nameCache.get(sid); return n ? (lang === 'en' ? n[1] : n[0]) : this.mirror.name(sid, lang) || '?'; },
      today: () => this.today(),
      hall: () => this.placeOfKind('town_hall', true),
      clinic: () => this.placeOfKind('clinic', true),
      garden: () => this.placeOfKind('memorial', true),
      school: () => this.placeOfKind('school', true),
      ours: (id) => { const w = this.ports.world; const b = w && w.buildings ? w.buildings().find((x) => x.id === id) : null; return !!(b && b.ours); },
    };
  }

  placeOfKind(kind, preferOurs) {
    const w = this.ports.world;
    if (!w || !w.buildings) return null;
    const keys = { town_hall: ['town_hall'], clinic: ['clinic', 'village_clinic'], memorial: ['memorial_garden'], school: ['school', 'village_school'] }[kind] || [kind];
    let best = null;
    for (const b of w.buildings()) { if (keys.indexOf(b.key) < 0) continue; if (preferOurs && b.ours) return b.id; if (!best) best = b.id; }
    return best;
  }

  /** 'lifeEvents' (an advanced switch, not in the settings panel): off -> no romance, weddings, babies or farewells */
  lifeOn() {
    const S = this.ports.settings;
    return !(S && S.get && S.get('lifeEvents') === false);
  }
  /** 설정 '생애 이벤트' (Settings.data.lifeFarewell, the designer's switch): off -> old age only, no farewell (M12) */
  farewellOn() {
    const S = this.ports.settings;
    const v = S && S.get ? S.get('lifeFarewell') : undefined;
    return this.lifeOn() && v !== false;
  }
  farewellFromDay() {
    // gentle farewells start ≥ farewellFirstAfterMin minutes after v5 began (t0 is in the slice: it survives reloads, H2)
    return Math.ceil(((this.t0 || 0) + this.T.life.farewellFirstAfterMin * 60) / DAY);
  }
  /** the chief's own bank rate for the paper's bank line (ports.bank.rate(): a day's interest, 0.01 = 1 %); -1 = none */
  bankRateBp() {
    const B = this.ports.bank;
    const r = B && B.rate ? B.rate() : null;
    return Number.isFinite(r) && r >= 0 ? Math.round(r * 10000) : -1;
  }

  // ---------------------------------------------------------------- game feed (GameFeed events, §5.4)
  onFeed(ev) {
    if (!ev || !this.ready) return;
    const P = this.ports, R = this.registry;
    const names = (k) => (P.world && P.world.names ? P.world.names(k) : { ko: k, en: k });
    switch (ev.t) {
      case 'tap': if (ev.pid) { R.tapped(ev.pid); this.refreshCard(ev.pid); } return;
      case 'sold': case 'visitorDone': {
        if (ev.pid) R.served(ev.pid);
        const day = this.today();
        if (this.sold.day !== day) this.sold = { day, n: 0, reported: false };
        this.sold.n += ev.n || 1;
        if (!this.sold.reported && this.sold.n >= 20) { this.sold.reported = true; this.report('chief', { what: 'market', target: { ko: '물건', en: 'goods' } }); }
        return;
      }
      case 'built': {
        const nm = names(ev.key);
        this.report('chief', { what: 'built', target: nm });
        if (ev.key === 'memorial_garden' || ev.key === 'town_hall' || ev.key === 'school' || ev.key === 'clinic' || ev.key === 'bank') {
          const kind = { memorial_garden: 'memorial', town_hall: 'town_hall', school: 'school', clinic: 'clinic', bank: 'bank' }[ev.key];
          const id = ev.siteId || ev.key;
          this.request({ t: M.PLACE, def: { id, kind, x: Math.round((ev.x || 0) / 50), y: Math.round((ev.y || 0) / 50), tag: 'ours' } }).then((r) => { if (r) { this.placeIdx.set(id, r.idx); this.byGame[id] = id; } });
        }
        if (ev.key === 'bank') this.post({ t: M.CONFIG, config: { paperRateBp: this.bankRateBp() } });
        return;
      }
      case 'shopOpen': {
        const id = ev.shop || ev.id;
        if (!id) return;
        this.request({ t: M.PLACE, def: { id, kind: ev.kind || 'general', x: Math.round((ev.x || 0) / 50), y: Math.round((ev.y || 0) / 50), locked: true, name: ev.name || null,
          owner: ev.founder ? R.sidOf(ev.founder) : -1 } }).then((r) => { if (r) { this.placeIdx.set(id, r.idx); this.byGame[id] = id; } });
        this.report('chief', { what: 'built', target: ev.name || names(ev.kind || 'shop') });
        return;
      }
      case 'train': {
        if (ev.ev !== 'arrive') return;
        const hour = Math.floor(this.now() / HOUR);
        if (hour === this.trainHour) return;
        this.trainHour = hour;
        this.report('train', { passengers: ev.passengers || 20, news: hour % 4, place: 't_station' });
        return;
      }
      case 'rank': {
        this.report('chief', { what: 'rank', target: ev.level >= 3 ? { ko: '도시', en: 'city' } : { ko: '읍', en: 'town' } });
        if (ev.level === 2 && !this.director.s.seen.proposal) this.proposalAt = this.now() + this.T.life.firstProposalAfterSec;
        return;
      }
      case 'dogLove': this.report('pet', { pet: 0, antic: ev.antic === undefined ? 4 : ev.antic, place: ev.place || null }); return;
      case 'snowball': if (ev.a && ev.b) { const a = R.sidOf(ev.a), b = R.sidOf(ev.b); if (a >= 0 && b >= 0) this.report('fact', { kind: 'prank', a, b, n: 0 }); } return;
      case 'mission:done': this.missionDone(ev); return;
      case 'mission:expire': if (ev.code === 'C7') this.director.wishEnded(this.wishPid(ev)); return;
      case 'fame:title': this.report('chief', { what: 'fame', target: ev.title || { ko: '촌장', en: 'chief' } }); return;
      case 'settlers': if (ev.pids && ev.pids.length) this.addPeople(ev.rows || []); return;
      case 'lang': this.post({ t: M.LANG, lang: ev.lang }); this.mirror.lang = ev.lang; return;
      case 'settings': {
        this.post({ t: M.TOGGLES, toggles: { lifeEvents: this.lifeOn(), farewell: this.farewellOn() } });
        // life back on at 읍 without the first proposal yet: it comes a few seconds later
        const ch = P.people && P.people.chronicle ? P.people.chronicle() : {};
        if (this.lifeOn() && (ch.rank || 1) >= 2 && !this.director.s.seen.proposal && this.proposalAt === null) this.proposalAt = this.now() + 5;
        return;
      }
      default: return;
    }
  }

  /** the person of a missions C7 event: key 's<sid>' (missions' own key), who (sid or pid), w / gv / nm (pids) */
  wishPid(ev) {
    const R = this.registry;
    if (Number.isInteger(ev.who) && R.pidOf(ev.who)) return R.pidOf(ev.who);
    if (typeof ev.who === 'string' && R.has(ev.who)) return ev.who;
    if (typeof ev.whoPid === 'string' && R.has(ev.whoPid)) return ev.whoPid;
    if (typeof ev.key === 'string' && /^s\d+$/.test(ev.key)) { const p = R.pidOf(+ev.key.slice(1)); if (p) return p; }
    for (const k of ['w', 'nm', 'gv']) if (typeof ev[k] === 'string' && R.has(ev[k])) return ev[k];
    return this.director.s.wishActive;
  }

  /** missions_bank: mission:done { target } (the chief helped someone); a C7 stage carries { wish } (one wish granted);
   *  the whole C7 done (no wish) or expired frees the elder's wish slot (critique H5) */
  missionDone(ev) {
    this.report('chief', { what: 'mission', target: ev.target || { ko: '주민', en: 'a neighbour' } });
    if (ev.wish) this.wishGranted(this.wishPid(ev), ev.wish);
    else if (ev.code === 'C7') this.director.wishEnded(this.wishPid(ev));
  }

  /** people the game added (settlers with bodies, newcomers): adopted like on the first boot */
  async addPeople(rows) {
    rows = (rows || []).filter((r) => r && r.pid && !this.registry.has(r.pid) && !(r.kind === 'settler' && !r.body));
    if (!rows.length) return;
    const A = adoptRoster(rows, { seed: this.ports.seed ? this.ports.seed() : 1, relations: [] });
    if (!A.specs.length) return;
    const Wd = buildStoryWorld({ buildings: this.ports.world ? this.ports.world.buildings() : [], spots: [], households: A.households });
    for (const pl of Wd.places) if (pl.kind === 'home') { const r = await this.request({ t: M.PLACE, def: pl }); if (r) this.placeIdx.set(pl.id, r.idx); }
    for (const sp of A.specs) { sp.home = Wd.homeOf[sp.home] || undefined; sp.newcomer = true; }
    const res = await this.request({ t: M.ADOPT, specs: A.specs, rels: A.rels, settle: false, jobs: false });
    this.bindSpecs(A.specs, res.sids, rows);
    res.sids.forEach((sid, i) => { const sp = A.specs[i]; if (sp.home && this.placeIdx.has(sp.home)) this.homeIdx.set(sp.gid, this.placeIdx.get(sp.home)); });
    // other modules (missions: 'welcome the new family') hear about it with one grown-up of the household
    if (res.sids.length) {
      const k = Math.max(0, A.specs.findIndex((sp) => sp.age >= 20));
      this.out('story:move', { op: 'in', who: res.sids[k], members: res.sids.slice() });
    }
  }

  /** the scripted first proposal: a young regular of ours and their sweetheart kneel in the crowd after 읍. Retried
   *  every proposalRetrySec until it plays: no pair free right now, or the pair busy in gameplay (critique M8) */
  async firstProposal() {
    if (this.director.s.seen.proposal || !this.lifeOn() || this.proposing) return null;
    this.proposing = true;
    const retry = () => { if (!this.director.s.seen.proposal) this.proposalAt = this.now() + (this.T.life.proposalRetrySec || 10); };
    try {
      let pairs = await this.query('sweethearts', { n: 16 });
      if (!pairs || !pairs.length) pairs = await this.query('singles', { n: 16 });
      const R = this.registry;
      const T = this.ports.town, V = this.ports.view;
      const seen = (pid) => { const b = pid && T && T.bodyOf ? T.bodyOf(pid) : null; return !!(b && V && V.onScreen && V.onScreen(b.x, b.y, 0)); };
      const free = (pid) => !!pid && !/^v:/.test(pid) && R.owner(pid) === 'town' && !(this.view && this.view.isHeld && this.view.isHeld(pid));
      const scored = (pairs || []).filter((p) => free(R.pidOf(p.a)) && free(R.pidOf(p.b))).map((p) => {
        const pa = R.pidOf(p.a), pb = R.pidOf(p.b);
        // the ceremony crowd is on screen: a pair standing in it is the one that steps up; regulars of ours first
        const score = (R.regular(pa) ? 2 : 0) + (R.regular(pb) ? 2 : 0) + (/^t:/.test(pa) ? 1 : 0) + (seen(pa) ? 3 : 0) + (seen(pb) ? 3 : 0);
        return Object.assign({ score }, p);
      });
      scored.sort((x, y) => y.score - x.score || (y.rom || 0) - (x.rom || 0) || x.a - y.a);
      const req = this.director.firstProposal(scored);
      if (!req) { retry(); return null; }
      this.holdBanners = true;            // "첫 결혼식이 열려요!" comes after the "네!"
      const res = await this.arrange(req.op, req.data);
      if (res) {
        this.director.s.seen.proposal = true;
        this.playBeat({ a: 'beat', kind: 'proposal', sids: [res.a, res.b], venue: this.placeOfKind('town_hall', true), data: { scripted: true }, forceWatch: true });
        this.saveSoon = true;
      } else retry();
      this.holdBanners = false;
      const cer = this.stage.active.ceremony;
      if (!(cer && cer.staged) && this.afterBeat.length) { const list = this.afterBeat; this.afterBeat = []; for (const a of list) this.exec(a); }
      return res;
    } finally { this.proposing = false; }
  }

  wishGranted(pid, wishId) {
    if (!pid) return;
    this.director.wishGranted(pid, wishId);
    const sid = this.registry.sidOf(pid);
    const n = sid >= 0 ? this.nameCache.get(sid) : null;
    this.report('chief', { what: 'wish', target: { ko: n ? n[0] : '어르신', en: n ? n[1] : 'an elder' } });
    this.saveSoon = true;
  }

  refreshCard(pid) {
    const sid = this.registry.sidOf(pid);
    if (sid < 0) return;
    this.query('card', { sid, lang: this.ports.lang ? this.ports.lang() : 'ko' }).then((c) => { if (c) this.mirror.apply({ cards: { [sid]: c } }); });
  }

  /** the chief tapped 보러 가기 on a story card: the beat it announces is staged wherever it is (the camera may follow) */
  watch(card) {
    const kind = card && ({ engaged: 'wedding', farewell: 'farewell', school: 'school', wish: 'wish' })[card.kind];
    if (!kind) return false;
    this.watching.add(kind);
    const venue = kind === 'wedding' ? this.placeOfKind('town_hall', true) : kind === 'farewell' ? this.placeOfKind('memorial', true) : kind === 'school' ? this.placeOfKind('school', true) : null;
    const p = venue ? this.venueXY(venue, 'gather') : null;
    if (p && this.ports.view && this.ports.view.focus) this.ports.view.focus(p.x, p.y, 1200);
    return true;
  }

  // ---------------------------------------------------------------- module API (gs.later.story)
  makeApi() {
    const host = this;
    return {
      get facade() { return host.mirror; },
      talkTo(pid, lang) { const sid = host.registry.sidOf(pid); if (sid < 0) return Promise.resolve(null); host.registry.tapped(pid); return host.request({ t: M.TALK_TO, sid, lang: lang || (host.ports.lang ? host.ports.lang() : 'ko') }); },
      card(pid) { const sid = host.registry.sidOf(pid); if (sid < 0) return null; const c = host.mirror.card(sid); host.refreshCard(pid); return c ? Object.assign({ known: host.registry.known(pid), regular: host.registry.regular(pid) }, c) : null; },
      passbook(pid) { const sid = host.registry.sidOf(pid); return sid < 0 ? Promise.resolve(null) : host.query('passbook', { sid }); },
      pidOf(body) { return host.ports.town && host.ports.town.pidOfBody ? host.ports.town.pidOfBody(body) : null; },
      bodyOf(pid) { return host.ports.town && host.ports.town.bodyOf ? host.ports.town.bodyOf(pid) : null; },
      known(pid) { return host.registry.known(pid); },
      sidOf(pid) { return host.registry.sidOf(pid); },
      report(kind, data) { host.report(kind, data); },
      arrange(op, data) { return host.arrange(op, data); },
      toggles(t) { host.post({ t: M.TOGGLES, toggles: t || {} }); },
      stage(kind, data) { return host.stage.request({ kind, venue: data && data.venue, watch: !!(data && data.watch) }, host.ports.view && host.ports.view.rect ? host.ports.view.rect() : null); },
      endStage(kind) { host.stage.end(kind); },
      nameBaby(sid, name) { return host.nameBaby(sid, name); },
      board() { return host.board.slice(); },
      paper(lang) { return host.mirror.newspaper(lang); },
      watch(card) { return host.watch(card); },
      booked() { return host.director.s.booked.slice(); },
      mode() { return host.mode; },
      perf() { return host.perf(); },
    };
  }

  report(kind, data) { this.post({ t: M.REPORT, kind, data: data || {} }); }
  arrange(op, data) { return this.request({ t: M.ARRANGE, op, data }); }

  /** the chief chose a name in the naming sheet (or 'parents' chose: null) */
  async nameBaby(sid, name) {
    if (!name || !name.ko) return null;
    const r = await this.arrange('nameBaby', { sid, name });
    if (r) {
      const pid = this.registry.pidOf(sid) || ('x:' + sid);
      this.director.s.names.push([pid, r.ko, r.en || '']);
      if (this.director.s.names.length > 40) this.director.s.names.shift();
      this.nameCache.set(sid, [r.ko, r.en, 0, 0]);
      this.report('chief', { what: 'named', target: { ko: r.ko, en: r.en } });
      this.out('story:life', { op: 'named', who: sid, ko: r.ko, en: r.en });
      this.saveSoon = true;
    }
    return r;
  }

  // ---------------------------------------------------------------- saves
  /** the main-save slice (≤ 1 KB): written with every autosave; T and t0 travel with it (critique H2) */
  serialize() {
    const T = this.now();
    return makeSlice({ day: Math.floor(T / DAY), T, t0: this.t0 || 0, ok: this.ready, chars: this.chars, life: this.director.s, happen: this.happen.state() });
  }
  state() { return { ready: this.ready, mode: this.mode, people: this.registry.size, cards: this.cardQ.length, board: this.board.length, slots: Object.assign({}, this.stage.active), quiet: this.quietUntil !== null, booked: this.director.s.booked.length }; }

  /**
   * write the side record: unforced at most once per game day (call it from the autosave), forced at pagehide /
   * visibilitychange: hidden and by the host itself after a ceremony or a booking. The registry and the life state are
   * copied when the save is asked for (they belong to the engine state the worker packs, L9).
   */
  saveSide(force) {
    if (!this.ready || !this.store || this.quietUntil !== null) return Promise.resolve(null);
    const day = this.today();
    if (!force && this.savedDay === day) return Promise.resolve(null);
    this.savedDay = day;
    return new Promise((resolve) => {
      const req = this.reqN++;
      this.saveReqs.set(req, { reg: this.registry.toJSON(), life: JSON.parse(JSON.stringify(this.director.s)) });
      this.reqs.set(req, resolve);
      this.post({ t: M.SAVE, req, packed: true, cap: this.T.save.capChars });
      if (this.transport.mode === 'inline') this.drain();
    });
  }
  onSaved(m) {
    const fn = this.reqs.get(m.req);
    if (fn) this.reqs.delete(m.req);
    const meta = this.saveReqs.get(m.req) || { reg: this.registry.toJSON(), life: this.director.s };
    this.saveReqs.delete(m.req);
    this.stats.saves++; this.stats.saveMs = m.ms;
    let res = 'nostore';
    if (this.store) {
      res = this.store.write(this.ports.cid ? this.ports.cid() : 'story', { T: m.T, day: m.day, reg: meta.reg, eng: m.data, life: meta.life });
      if (res === 'big' && !this.warnedBig) { this.warnedBig = true; this.ui('toast', { ko: str('ko', 'saveFull'), en: str('en', 'saveFull'), holdSec: 4 }); }
    }
    this.chars = m.chars;
    if (fn) fn({ result: res, chars: m.chars, ms: m.ms, compacted: m.compacted });
  }

  // ---------------------------------------------------------------- misc
  attachView(view) { this.view = view; if (view && view.bind) view.bind(this); }
  perf() { const S = this.stats; return { mode: this.mode, ticks: S.ticks, avgMs: S.ticks ? S.ms / S.ticks : 0, maxMs: S.maxMs, long: S.long, events: S.events, talks: S.talks, msgsIn: S.msgsIn, msgsOut: S.msgsOut, beats: S.beats, cards: S.cards, quiet: S.quiet, skipped: S.skipped }; }
  on(name, fn) { (this.listeners[name] || (this.listeners[name] = [])).push(fn); return this; }
  emit(name, d) { const l = this.listeners[name]; if (l) for (const fn of l) { try { fn(d); } catch (e) { /* listeners never break the story */ } } }
  destroy() { if (this.view && this.view.destroy) this.view.destroy(); if (this.transport) this.transport.close(); this.ready = false; this.reqs.clear(); }
}
