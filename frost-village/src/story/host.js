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
import { LifeDirector, HOUR } from './model/lifeRules.js';
import { StageDirector, SLOT_OF } from './model/stage.js';
import { HappeningClock } from './model/happenings.js';
import { StoryMirror } from './mirror.js';
import { STORY_TUNING, engineConfig } from './tuning.js';
import { makeSlice, sanitizeSlice, StorySideStore } from './save.js';
import { s as str } from './strings.js';

const DAY = 24 * HOUR;
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

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
    worker.onmessage = (e) => { this.inbox.push(e.data); if (this.onwake) this.onwake(); };
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
    this.slice = sanitizeSlice(saved);
    const life = this.slice ? this.slice.life : null;
    this.registry = new PersonRegistry({ knownServed: this.T.life.knownServed });
    this.mirror = new StoryMirror();
    this.facade = this.mirror;
    this.nameCache = new Map();            // sid -> [ko, en, male, age]
    this.director = new LifeDirector(Object.assign({}, this.T.life, { paperHour: this.T.paper.hour }), life, this.hooks());
    this.stage = new StageDirector({ near: 1200 });
    this.happen = new HappeningClock(this.T.happenings, this.slice ? this.slice.happen : null);
    this.view = null;
    this.reqs = new Map();
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
    this.pending = [];                     // beats waiting for a free slot
    this.afterBeat = [];                   // banners held while a set piece is on stage
    this.proposalAt = null;                // T of the scripted first proposal (읍 + 12 s)
    this.t0 = this.slice && Number.isFinite(this.slice.t0) ? this.slice.t0 : null;
    this.chars = this.slice ? this.slice.chars : 0;
    this.stats = { ticks: 0, ms: 0, maxMs: 0, long: 0, events: 0, talks: 0, msgsIn: 0, msgsOut: 0, beats: 0, cards: 0, saves: 0, saveMs: 0 };
    this.log = [];                         // last actions (tests, the lab HUD)
    this.listeners = Object.create(null);
    this.store = ports.storage ? new StorySideStore(ports.storage, ports.sideKey || 'frostVillage.save.v1.story', { hardChars: this.T.save.hardChars }) : null;
    this.api = this.makeApi();
  }

  // ---------------------------------------------------------------- startup
  /** async: adopt (or restore), boot the core; resolves with { mode, restored, people } */
  async start() {
    const P = this.ports;
    const T = P.T ? P.T() : 200;
    if (this.t0 === null) this.t0 = T;
    const side = this.store ? this.store.load(P.cid ? P.cid() : 'story') : null;
    this.transport = this.pickTransport();
    this.mode = this.transport.mode;
    // until the story is ready, worker replies are handled as they come (no frame loop needed); then once a frame
    this.transport.onwake = () => { if (!this.ready) this.drain(); };
    const lang = P.lang ? P.lang() : 'ko';
    const farewellOn = this.farewellOn();
    const cfg = engineConfig(this.T, { farewell: farewellOn, farewellFromDay: this.farewellFromDay() });
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
      res.sids.forEach((sid, i) => { const sp = A.specs[i]; this.registry.bind(sp.gid, sid, { kept: !!sp.kept, role: sp.role }); });
      people = res.people;
      if (side === null && this.slice && this.slice.ok) this.queueCard({ kind: 'forgot', ko: str('ko', 'forgot'), en: str('en', 'forgot'), icon: 'ui_icon_memory', pids: [] });
    } else {
      await this.reconcile();
    }
    await this.mapPlaces();
    this.post({ t: M.TOGGLES, toggles: { lifeEvents: this.lifeOn(), farewell: farewellOn, incidents: false } });
    const prices = P.people && P.people.prices ? P.people.prices() : null;
    if (prices) this.post({ t: M.PRICES, map: prices });
    // weddings / births / farewells booked before a reload get their timed beats back
    const booked = await this.query('booked');
    for (const b of booked || []) {
      if (b.kind === 'wedding') this.dispatch({ e: 'life', op: 'engaged', a: b.a, b: b.b, day: b.day, hour: b.hour, restored: true });
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

  /** after a restore: game people missing in the story join it; story people without a body are leased 'away' */
  async reconcile() {
    const P = this.ports;
    const roster = P.people ? P.people.roster() : [];
    const have = new Set(roster.map((r) => r.pid));
    const missing = roster.filter((r) => !this.registry.has(r.pid));
    if (missing.length) {
      const A = adoptRoster(missing, { seed: P.seed ? P.seed() : 1, relations: [] });
      const Wd = buildStoryWorld({ buildings: P.world ? P.world.buildings() : [], spots: [], households: A.households });
      for (const pl of Wd.places) if (pl.kind === 'home') await this.request({ t: M.PLACE, def: pl });
      for (const sp of A.specs) sp.home = Wd.homeOf[sp.home] || undefined;
      const res = await this.request({ t: M.ADOPT, specs: A.specs, rels: A.rels, settle: false, jobs: false });
      res.sids.forEach((sid, i) => { const sp = A.specs[i]; this.registry.bind(sp.gid, sid, { kept: !!sp.kept, role: sp.role }); });
    }
    for (const pid of this.registry.pids()) if (!have.has(pid) && !/^x:/.test(pid)) { this.post({ t: M.LEASE, sid: this.registry.sidOf(pid), on: true }); this.registry.lease(pid, 'gameplay'); }
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
      case W.EVENTS: for (const ev of m.list) this.dispatch(ev); return;
      default: return;
    }
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const t0 = nowMs();
    this.drain();
    if (this.ready) {
      this.acc += dt;
      this.visAcc += dt;
      if (this.acc >= this.T.tickEvery) { const d = this.acc; this.acc = 0; this.sendTick(d); }
      const T = this.ports.T ? this.ports.T() : 0;
      for (const a of this.director.update(T)) this.exec(a);
      if (this.pending.length) this.retryPending();
      this.happenings(T);
      if (this.cardOn && T >= this.cardOn.until) this.nextCard();
      if (this.proposalAt !== null && T >= this.proposalAt) { this.proposalAt = null; this.firstProposal(); }
      // the first couple's good news comes at v5 + firstBabyAfterMin (23 min), the baby one game day later
      const ls = this.director.s;
      if (ls.seen.wedding && !ls.seen.expect && ls.firstCouple.length === 2 && T >= (this.t0 || 0) + this.T.life.firstBabyAfterMin * 60) {
        ls.seen.expect = true;
        this.arrange('expect', { a: ls.firstCouple[0], b: ls.firstCouple[1], inDays: 1 });
      }
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
    switch (ev.e) {
      case 'talk': this.stats.talks++; this.mirror.emit('talk', ev); if (this.view) this.view.talk(ev); return;
      case 'arrive': if (this.view) this.view.arrive(ev); return;
      case 'bank': this.out('story:bank', ev); return;
      case 'shop': this.out('story:shop', ev); return;
      case 'build': this.out('story:build', ev); return;
      case 'incident': this.out('story:incident', ev); return;
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
        if (((cer && cer.staged) || this.holdBanners) && !a.leave) { this.afterBeat.push(a); return; }
        this.ui('banner', { kind: a.kind, ko: a.ko, en: a.en, subKo: a.subKo, subEn: a.subEn });
        if (a.leave && a.sids) for (const sid of a.sids) { const pid = this.registry.pidOf(sid); if (pid) { if (this.ports.town) this.ports.town.leave(pid); this.registry.unbind(pid); } }
        return;
      }
      case 'emit': return this.out(a.name, a.data);
      case 'route': if (this.view) this.view.route(a.kind, a.ev); return;
      case 'paper': return this.deliverPaper(a);
      case 'body': return this.makeBody(a);
      case 'wishcheck': return this.wishCheck();
      case 'arrange': this.arrange(a.op, a.data); return;
      case 'config': this.post({ t: M.CONFIG, config: a.config }); return;
      default: return;
    }
  }

  /** module events out, with pids next to sids (other modules know people by pid) */
  out(name, data) {
    const d = Object.assign({}, data);
    for (const k of ['a', 'b', 'who', 'baby']) if (Number.isInteger(d[k])) d[k + 'Pid'] = this.registry.pidOf(d[k]);
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

  playBeat(b) {
    this.stats.beats++;
    const slot = SLOT_OF[b.kind];
    const venue = b.venue ? this.venueXY(b.venue, 'gather') : null;
    if (slot) {
      const view = this.ports.view && this.ports.view.rect ? this.ports.view.rect() : null;
      const d = this.stage.request({ kind: b.kind, venue, watch: !!b.watch, T: this.ports.T ? this.ports.T() : 0 }, view);
      if (!d.ok) { if (d.why === 'busy' && b.kind !== 'birthday') { b.tries = (b.tries || 0) + 1; if (b.tries < 40) this.pending.push(b); } return; }
      if (b.kind === 'wedding' || b.kind === 'farewell') this.post({ t: M.CONFIG, config: { farewellHold: true } });
      if (this.view && d.staged) this.view.play(b, d, () => this.endBeat(b));
      else this.endBeat(b);
      return;
    }
    if (this.view) this.view.play(b, { ok: true, staged: true, ambient: true }, null);
  }

  endBeat(b) {
    this.stage.end(b.kind);
    if (this.afterBeat.length) { const list = this.afterBeat; this.afterBeat = []; for (const a of list) this.exec(a); }
    if (b.kind === 'wedding' || b.kind === 'farewell') this.post({ t: M.CONFIG, config: { farewellHold: false } });
    this.emit('beatEnd', b);
  }

  retryPending() {
    const list = this.pending;
    this.pending = [];
    for (const b of list) this.playBeat(b);
  }

  happenings(T) {
    const spots = this.ports.happenSpots ? this.ports.happenSpots() : null;
    const h = this.happen.due(T, { busy: this.stage.busy('ceremony') || this.stage.driving, open: this.ports.open ? this.ports.open() : {}, spots });
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
    const T = this.ports.T ? this.ports.T() : 0;
    this.cardOn = { card: c, until: T + (c.kind === 'farewell' ? 14 : 8) };
    const lang = this.ports.lang ? this.ports.lang() : 'ko';
    // the attached view draws the story card itself; without one the game's card host (ports.ui.card) shows it
    if (this.view && this.view.card) { this.emit('ui:card', c); this.view.card(c, lang); }
    else this.ui('card', Object.assign({ text: lang === 'en' ? c.en : c.ko, sub: lang === 'en' ? c.subEn : c.subKo }, c));
  }

  ui(kind, spec) {
    const U = this.ports.ui;
    this.emit('ui:' + kind, spec);
    if (!U) return;
    if (kind === 'banner' && U.banner) U.banner(spec);
    else if (kind === 'card' && U.card) U.card(spec);
    else if (kind === 'toast' && U.toast) U.toast((this.ports.lang && this.ports.lang() === 'en') ? spec.en : spec.ko, 2.5);
  }

  deliverPaper(a) {
    this.paper = a.paper;
    this.paperDay = a.day;
    if (a.paper) this.mirror.apply({ paper: a.paper });
    const U = this.ports.ui;
    // the view's own edge icon when a view is attached, else the game's chip row
    if (U && U.chip && !(this.view && this.view.paper)) U.chip('news', { icon: 'ui_icon_newspaper', pulse: true, day: a.day, first: !!a.first });
    if (this.ports.sound) this.ports.sound.play('sfx_newspaper', { volume: 0.6 });
    this.out('story:news', { day: a.day, first: !!a.first });
    if (this.view && this.view.paper) this.view.paper(a);
  }

  async makeBody(a) {
    const T = this.ports.town;
    if (!T || !T.addCitizen) return;
    const fam = await this.query('family', { sid: a.sid });
    const parents = fam ? fam.parents.map((s) => this.registry.pidOf(s)).filter(Boolean) : [];
    const homePid = parents[0] || null;
    const pid = T.addCitizen({ kind: 'child', age: a.age, parents, home: homePid ? { like: homePid } : null, sid: a.sid });
    if (pid) { this.registry.bind(pid, a.sid, { role: 'child' }); if (homePid && this.homeIdx.has(homePid)) this.homeIdx.set(pid, this.homeIdx.get(homePid)); }
  }

  async wishCheck() {
    const list = await this.query('wishers', { minAge: this.T.life.wishAge });
    if (!list || !list.length) return;
    const fam = [];
    for (const w of list) { const n = this.nameCache.get(w.id); if (!n) this.nameCache.set(w.id, [w.name, w.nameEn, 0, w.age]); fam.push(w); }
    const pick = this.director.pickWish(fam, { open: this.ports.open ? this.ports.open() : {} });
    if (!pick) return;
    this.queueCard({ kind: 'wish', sids: [pick.sid], pids: [this.registry.pidOf(pick.sid)], ko: pick.ko, en: pick.en, icon: 'ui_icon_story', mission: 'C7', wish: pick.wish.id });
    this.out('story:wish', { who: pick.sid, wish: pick.wish.id, place: pick.wish.place, ko: pick.wish.ko, en: pick.wish.en });
  }

  // ---------------------------------------------------------------- hooks for the director
  hooks() {
    return {
      pidOf: (sid) => this.registry.pidOf(sid),
      known: (pid) => this.registry.known(pid),
      farewellOn: () => this.farewellOn(),
      gardenReady: () => !!(this.ports.world && this.ports.world.has && this.ports.world.has('memorial_garden')),
      nameOf: (sid, lang) => { const n = this.nameCache.get(sid); return n ? (lang === 'en' ? n[1] : n[0]) : this.mirror.name(sid, lang) || '?'; },
      today: () => Math.floor((this.ports.T ? this.ports.T() : 0) / DAY),
      hall: () => this.placeOfKind('town_hall', true),
      clinic: () => this.placeOfKind('clinic', true),
      garden: () => this.placeOfKind('memorial', true),
      school: () => this.placeOfKind('school', true),
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

  /** 설정 '인생 이야기' (lifeEvents): off -> no romance, weddings, babies or farewells (the elders stop at 85) */
  lifeOn() {
    const S = this.ports.settings;
    return !(S && S.get && S.get('lifeEvents') === false);
  }
  /** 설정 '따뜻한 이별' (lifeFarewell), only while life events are on */
  farewellOn() {
    const S = this.ports.settings;
    const v = S && S.get ? S.get('lifeFarewell') : undefined;
    return this.lifeOn() && v !== false;
  }
  farewellFromDay() {
    // gentle farewells start ≥ farewellFirstAfterMin minutes after v5 began
    return Math.ceil(((this.t0 || 0) + this.T.life.farewellFirstAfterMin * 60) / DAY);
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
        const day = Math.floor((P.T ? P.T() : 0) / DAY);
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
        const hour = Math.floor((P.T ? P.T() : 0) / HOUR);
        if (hour === this.trainHour) return;
        this.trainHour = hour;
        this.report('train', { passengers: ev.passengers || 20, news: hour % 4, place: 't_station' });
        return;
      }
      case 'rank': {
        this.report('chief', { what: 'rank', target: ev.level >= 3 ? { ko: '도시', en: 'city' } : { ko: '읍', en: 'town' } });
        if (ev.level === 2 && !this.director.s.seen.proposal) this.proposalAt = (P.T ? P.T() : 0) + this.T.life.firstProposalAfterSec;
        return;
      }
      case 'dogLove': this.report('pet', { pet: 0, antic: ev.antic === undefined ? 4 : ev.antic, place: ev.place || null }); return;
      case 'snowball': if (ev.a && ev.b) { const a = R.sidOf(ev.a), b = R.sidOf(ev.b); if (a >= 0 && b >= 0) this.report('fact', { kind: 'prank', a, b, n: 0 }); } return;
      case 'mission:done': this.report('chief', { what: 'mission', target: ev.target || { ko: '주민', en: 'a neighbour' } }); if (ev.wish && Number.isInteger(ev.who)) this.wishGranted(ev.who, ev.wish); return;
      case 'fame:title': this.report('chief', { what: 'fame', target: ev.title || { ko: '촌장', en: 'chief' } }); return;
      case 'settlers': if (ev.pids && ev.pids.length) this.addPeople(ev.rows || []); return;
      case 'lang': this.post({ t: M.LANG, lang: ev.lang }); this.mirror.lang = ev.lang; return;
      case 'settings': {
        this.post({ t: M.TOGGLES, toggles: { lifeEvents: this.lifeOn(), farewell: this.farewellOn() } });
        // life back on at 읍 without the first proposal yet: it comes a few seconds later
        const ch = P.people && P.people.chronicle ? P.people.chronicle() : {};
        if (this.lifeOn() && (ch.rank || 1) >= 2 && !this.director.s.seen.proposal && this.proposalAt === null) this.proposalAt = (P.T ? P.T() : 0) + 5;
        return;
      }
      default: return;
    }
  }

  /** people the game added (settlers, newcomers): adopted like on the first boot */
  async addPeople(rows) {
    if (!rows.length) return;
    const A = adoptRoster(rows, { seed: this.ports.seed ? this.ports.seed() : 1, relations: [] });
    const Wd = buildStoryWorld({ buildings: this.ports.world ? this.ports.world.buildings() : [], spots: [], households: A.households });
    for (const pl of Wd.places) if (pl.kind === 'home') { const r = await this.request({ t: M.PLACE, def: pl }); if (r) this.placeIdx.set(pl.id, r.idx); }
    for (const sp of A.specs) { sp.home = Wd.homeOf[sp.home] || undefined; sp.newcomer = true; }
    const res = await this.request({ t: M.ADOPT, specs: A.specs, rels: A.rels, settle: false, jobs: false });
    res.sids.forEach((sid, i) => { const sp = A.specs[i]; this.registry.bind(sp.gid, sid, { role: sp.role }); if (sp.home && this.placeIdx.has(sp.home)) this.homeIdx.set(sp.gid, this.placeIdx.get(sp.home)); });
    // other modules (missions: 'welcome the new family') hear about it with one grown-up of the household
    if (res.sids.length) {
      const k = Math.max(0, A.specs.findIndex((sp) => sp.age >= 20));
      this.out('story:move', { op: 'in', who: res.sids[k], members: res.sids.slice() });
    }
  }

  /** the scripted first proposal: a young regular of ours and their sweetheart kneel in the crowd after 읍 */
  async firstProposal() {
    if (this.director.s.seen.proposal || !this.lifeOn()) return null;
    const pairs = await this.query('sweethearts', { n: 16 });
    const R = this.registry;
    // the ceremony crowd is on screen: a pair standing in it is the one that steps up
    const T = this.ports.town, V = this.ports.view;
    const seen = (pid) => { const b = pid && T && T.bodyOf ? T.bodyOf(pid) : null; return !!(b && V && V.onScreen && V.onScreen(b.x, b.y, 0)); };
    const scored = (pairs || []).map((p) => {
      const pa = R.pidOf(p.a), pb = R.pidOf(p.b);
      const reg = (pa && R.regular(pa) ? 2 : 0) + (pb && R.regular(pb) ? 2 : 0) + (pa && /^t:/.test(pa) ? 1 : 0) + (seen(pa) ? 3 : 0) + (seen(pb) ? 3 : 0);
      return Object.assign({ score: reg }, p);
    }).filter((p) => R.pidOf(p.a) && R.pidOf(p.b) && !/^v:/.test(R.pidOf(p.a)) && !/^v:/.test(R.pidOf(p.b)));
    scored.sort((x, y) => y.score - x.score || y.rom - x.rom || x.a - y.a);
    const req = this.director.firstProposal(scored);
    if (!req) return null;
    this.holdBanners = true;            // "첫 결혼식이 열려요!" comes after the "네!"
    const res = await this.arrange(req.op, req.data);
    if (res) this.playBeat({ a: 'beat', kind: 'proposal', sids: [res.a, res.b], venue: this.placeOfKind('town_hall', true), data: { scripted: true }, watch: true });
    this.holdBanners = false;
    const cer = this.stage.active.ceremony;
    if (!(cer && cer.staged) && this.afterBeat.length) { const list = this.afterBeat; this.afterBeat = []; for (const a of list) this.exec(a); }
    return res;
  }

  wishGranted(sid, wishId) {
    this.director.wishGranted(sid, wishId);
    const n = this.nameCache.get(sid);
    this.report('chief', { what: 'wish', target: { ko: n ? n[0] : '어르신', en: n ? n[1] : 'an elder' } });
  }

  refreshCard(pid) {
    const sid = this.registry.sidOf(pid);
    if (sid < 0) return;
    this.query('card', { sid, lang: this.ports.lang ? this.ports.lang() : 'ko' }).then((c) => { if (c) this.mirror.apply({ cards: { [sid]: c } }); });
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
    }
    return r;
  }

  // ---------------------------------------------------------------- saves
  /** the main-save slice (≤ 1 KB) */
  serialize() {
    const o = makeSlice({ day: Math.floor((this.ports.T ? this.ports.T() : 0) / DAY), ok: this.ready, chars: this.chars, life: this.director.s, happen: this.happen.state() });
    o.t0 = Math.round(this.t0 || 0);
    return o;
  }
  state() { return { ready: this.ready, mode: this.mode, people: this.registry.size, cards: this.cardQ.length, board: this.board.length, slots: Object.assign({}, this.stage.active) }; }

  /** write the side record (at the day change, pagehide, visibilitychange: hidden) */
  saveSide(force) {
    if (!this.ready || !this.store) return Promise.resolve(null);
    const day = Math.floor((this.ports.T ? this.ports.T() : 0) / DAY);
    if (!force && this.savedDay === day) return Promise.resolve(null);
    this.savedDay = day;
    return this.request({ t: M.SAVE, packed: true, cap: this.T.save.capChars });
  }
  onSaved(m) {
    const fn = this.reqs.get(m.req);
    if (fn) this.reqs.delete(m.req);
    this.stats.saves++; this.stats.saveMs = m.ms;
    let res = 'nostore';
    if (this.store) {
      res = this.store.write(this.ports.cid ? this.ports.cid() : 'story', { T: m.T, day: m.day, reg: this.registry.toJSON(), eng: m.data });
      if (res === 'big' && !this.warnedBig) { this.warnedBig = true; this.ui('toast', { ko: str('ko', 'saveFull'), en: str('en', 'saveFull') }); }
    }
    this.chars = m.chars;
    if (fn) fn({ result: res, chars: m.chars, ms: m.ms, compacted: m.compacted });
  }

  // ---------------------------------------------------------------- misc
  attachView(view) { this.view = view; if (view && view.bind) view.bind(this); }
  perf() { const S = this.stats; return { mode: this.mode, ticks: S.ticks, avgMs: S.ticks ? S.ms / S.ticks : 0, maxMs: S.maxMs, long: S.long, events: S.events, talks: S.talks, msgsIn: S.msgsIn, msgsOut: S.msgsOut, beats: S.beats, cards: S.cards }; }
  on(name, fn) { (this.listeners[name] || (this.listeners[name] = [])).push(fn); return this; }
  emit(name, d) { const l = this.listeners[name]; if (l) for (const fn of l) { try { fn(d); } catch (e) { /* listeners never break the story */ } } }
  destroy() { if (this.view && this.view.destroy) this.view.destroy(); if (this.transport) this.transport.close(); this.ready = false; this.reqs.clear(); }
}
