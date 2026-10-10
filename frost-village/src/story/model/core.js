// StoryCore — owns the story engine and answers the protocol (model/protocol.js). The same class runs inside the
// Web Worker (model/worker.js) and, as the fallback, on the main thread (host.js InlineTransport), so both modes
// produce the same event stream for the same messages (tested: tools/test/story_lab/story.test.mjs "parity").
// Pure: no Phaser, no DOM; `send(msg)` is given by the transport.

import { createStory } from '../engine/index.js';
import { M, W, FORWARD, slimEvent, slimTalk } from './protocol.js';

const STAGES = ['stranger', 'acquaintance', 'friend', 'best friend', 'sweetheart', 'engaged', 'spouse'];

export class StoryCore {
  /** send(msg, transfer?) posts to the main thread; opts.maxCatch = game seconds simulated per tick at most */
  constructor(send, opts = {}) {
    this.send = send;
    this.e = null;
    this.out = [];
    this.vis = new Set();
    this.watch = [];
    this.watchDirty = false;
    this.kept = new Set();
    this.walking = new Set();         // sids on a story walk (their arrive events are forwarded)
    this.maxCatch = opts.maxCatch || 600;
    this.ticks = 0;
    this.diaryQ = [];
    this.diaries = Object.create(null);
    this.cardT = Object.create(null);
    this.perf = { steps: 0, ms: 0, maxMs: 0, ticks: 0 };
    this.lastDay = -1;
    this.paper = null;
  }

  now() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }

  handle(msg) {
    try { this.dispatch(msg); } catch (err) { this.send({ t: W.ERROR, msg: String(err && err.stack || err), req: msg && msg.req }); }
  }

  dispatch(msg) {
    const e = this.e;
    switch (msg.t) {
      case M.INIT: return this.init(msg);
      case M.TICK: return this.tick(msg);
      case M.VISIBLE: this.vis = new Set(msg.ids || []); return;
      case M.WATCH: this.watch = (msg.ids || []).slice(0, 64); this.watchDirty = true; return;
      case M.ACK: if (e) e.ack(msg.id); return;
      case M.REPORT: if (e) { const f = e.report(msg.kind, msg.data || {}); if (msg.req) this.reply(msg.req, f ? { fact: f.id || 0 } : null); } return;
      case M.LEASE: if (e) e.lease(msg.sid, !!msg.on, msg.place === undefined || msg.place === null ? -1 : (e.world.get(msg.place) || { idx: -1 }).idx); return;
      case M.ADOPT: return this.adopt(msg);
      case M.ADD: { const sid = e.addResident(msg.spec || {}); if (msg.spec && msg.spec.kept) this.kept.add(sid); if (msg.req) this.reply(msg.req, { sid }); return; }
      case M.REMOVE: { const ok = e.removeResident(msg.sid, msg.why); if (msg.req) this.reply(msg.req, { ok }); return; }
      case M.TOGGLES: if (e) e.setToggles(msg.toggles || {}); return;
      case M.PRICES: if (e) e.setPrices(msg.map || {}); return;
      case M.LANG: if (e) e.setLang(msg.lang); return;
      case M.CONFIG: if (e) { e.configure(msg.config || {}); e.setRates(msg.config || {}); } return;
      case M.PLACE: if (e) { const idx = e.addPlaceLive(msg.def); if (msg.req) this.reply(msg.req, { idx }); } return;
      case M.ARRANGE: this.reply(msg.req, e ? e.arrange(msg.op, msg.data) : null); return;
      case M.TALK_TO: { const t = e ? e.talkTo(msg.sid, msg.lang) : null; this.reply(msg.req, t ? slimTalk(t) : null); return; }
      case M.QUERY: this.reply(msg.req, this.query(msg.name, msg.args || {})); return;
      case M.SAVE: return this.save(msg);
      default: this.send({ t: W.ERROR, msg: 'story core: unknown message ' + msg.t });
    }
  }

  reply(req, data) { if (req) this.send({ t: W.REPLY, req, data }); }

  // ---------------------------------------------------------------- init / adoption
  init(msg) {
    const t0 = this.now();
    let restored = false;
    if (msg.save) {
      try { this.e = createStory({ save: msg.save, warm: false }); restored = true; } catch (err) { this.e = null; this.send({ t: W.ERROR, msg: 'story save unreadable: ' + err.message, soft: true }); }
    }
    if (!this.e) {
      this.e = createStory({ seed: msg.seed, lang: msg.lang || 'ko', dayLength: msg.dayLength || 600, world: msg.world || { places: [], plots: [] },
        residents: [], population: 0, textMode: 'visible', warm: false, config: msg.config || {} });
      if (Number.isFinite(msg.startAt)) this.startAt(msg.startAt);
    }
    const e = this.e;
    if (restored) {
      e.configure(msg.config || {});
      for (const r of e.alive) if (r.flags & 1 && e.cfg.keepNamed) this.kept.add(r.id);
      for (const p of (msg.world && msg.world.places) || []) if (!e.world.get(p.id)) e.world.addPlace(p);   // places the game built since
    }
    if (msg.lang) e.setLang(msg.lang);
    e.setVisible((id) => this.vis.has(id));
    for (const name of FORWARD) e.on(name, (ev) => this.capture(name, ev));
    // the grammar compiles now (≈ 0.15–0.35 s), in the worker; inline mode does it here once
    e.dialogue.grammar(e.cfg.lang);
    this.lastDay = e.clock.day;
    this.send({ t: W.READY, restored, T: e.now, day: e.clock.day, people: e.alive.length, ms: Math.round(this.now() - t0), req: msg.req });
    this.pushMirror(true);
  }

  /** a fresh engine starts at the game's clock (DayClock.T), not at 06:00 of day 0 */
  startAt(T) {
    const e = this.e;
    if (!(T > e.now)) return;
    e.now = Math.floor(T);
    e.accUs = (T - e.now) * 1e6;
    e.updateClock();
    e.weather.roll();
  }

  adopt(msg) {
    const e = this.e;
    const sids = [];
    for (const spec of msg.specs || []) { const sid = e.addResident(spec); sids.push(sid); if (spec.kept) this.kept.add(sid); }
    for (const [i, j, kind] of msg.rels || []) if (sids[i] !== undefined && sids[j] !== undefined) e.relate(sids[i], sids[j], kind);
    if (msg.settle !== false) e.settleTown({ jobs: msg.jobs !== false });
    // the chief's chronicle: deeds the residents already know about (some of them, as gossip would have it)
    for (const c of msg.chronicle || []) e.report('chief', c);
    this.reply(msg.req, { sids, people: e.alive.length });
    this.pushMirror(true);
  }

  // ---------------------------------------------------------------- time
  tick(msg) {
    const e = this.e;
    if (!e) return;
    const t0 = this.now();
    if (msg.at && msg.at.length) e.atMany(msg.at);
    const now0 = e.now;
    // follow the game's clock: catch up when behind (≤ maxCatch game seconds per tick), wait when ahead
    const target = Number.isFinite(msg.T) ? msg.T : e.now + e.accUs / 1e6 + (msg.dt || 0);
    const d = target - (e.now + e.accUs / 1e6);
    if (d > 0) e.tick(Math.min(d, this.maxCatch));
    this.ticks++;
    if (e.clock.day !== this.lastDay) { this.lastDay = e.clock.day; this.onNewDay(); }
    this.sliceDiaries();
    if (this.watchDirty || this.ticks % 8 === 0) this.pushCards();
    if (this.out.length) { this.send({ t: W.EVENTS, T: e.now, list: this.out }); this.out = []; }
    const ms = this.now() - t0;
    const P = this.perf;
    P.ticks++; P.ms += ms; if (ms > P.maxMs) P.maxMs = ms; P.steps += e.now - now0;
  }

  capture(name, ev) {
    if (name === 'talk') { if (!ev.lines && !ev.chief) return; }
    else if (name === 'goTo') { if (!ev.reason) return; this.walking.add(ev.who); }
    else if (name === 'arrive') { if (!this.walking.has(ev.who)) return; this.walking.delete(ev.who); }
    else if (name === 'news') {
      // both languages for the panel (the paper is compiled at 05:00; the game shows it at 07:00)
      const e = this.e, p = e.news.latest();
      this.paper = p ? { day: ev.day, ko: e.dialogue.paperText(p, 'ko'), en: e.dialogue.paperText(p, 'en') } : null;
      this.out.push({ e: 'news', day: ev.day, paper: this.paper, T: e.now });
      return;
    } else if (name === 'bank' && !this.kept.has(ev.who)) return;
    const o = slimEvent(name, ev);
    o.e = name;
    // the engine time of the event: after a stale side record the host replays what the player saw quietly (H1)
    o.T = this.e.now;
    if (name === 'life' || name === 'move' || name === 'goTo') o.nm = this.names(ev);
    if (name === 'life') {
      const r = this.e.people[ev.who];
      const alive = (id) => id >= 0 && this.e.people[id] && this.e.people[id].alive;
      // the family of a departed elder (the garden ceremony), the parents of a child (a party's host, the school day)
      if (ev.op === 'farewell' && r) o.fam = r.kids.filter(alive).concat(alive(r.spouse) ? [r.spouse] : []).slice(0, 4);
      else if ((ev.op === 'birthday' || ev.op === 'grow') && r && r.parents.length && this.e.ageOfId(ev.who) < 18) o.par = r.parents.filter(alive).slice(0, 2);
    }
    this.out.push(o);
  }

  /** display names of the people in an event: { sid: [ko, en, male, age] } (cards and banners need them at once) */
  names(ev) {
    const e = this.e, out = {};
    const add = (id) => { if (Number.isInteger(id) && id >= 0 && e.people[id] && out[id] === undefined) { const r = e.people[id]; out[id] = [e.name(id, 'ko'), e.name(id, 'en'), r.male ? 1 : 0, e.ageOfId(id)]; } };
    for (const k of ['a', 'b', 'who', 'baby', 'with']) add(ev[k]);
    if (Array.isArray(ev.members)) for (const id of ev.members.slice(0, 6)) add(id);
    return out;
  }

  onNewDay() {
    // yesterday's diary lines of the named villagers (the chat bridge reads them), sliced over the next ticks
    this.diaryQ = Array.from(this.kept);
    this.pushMirror(true);
  }

  sliceDiaries() {
    if (!this.diaryQ.length) return;
    const e = this.e;
    for (let k = 0; k < 4 && this.diaryQ.length; k++) {
      const id = this.diaryQ.shift();
      const r = e.people[id];
      if (!r || !r.alive) continue;
      this.diaries[id] = { day: e.clock.day - 1, ko: e.diary(id, e.clock.day - 1, 'ko'), en: e.diary(id, e.clock.day - 1, 'en') };
    }
    if (!this.diaryQ.length) this.send({ t: W.MIRROR, diaries: this.diaries });
  }

  pushCards() {
    const e = this.e;
    if (!this.watch.length) { this.watchDirty = false; return; }
    const cards = {};
    let n = 0;
    for (const id of this.watch) {
      if (n >= 12) break;
      if (!this.watchDirty && this.cardT[id] !== undefined && e.now - this.cardT[id] < 60) continue;
      const c = e.card(id, e.cfg.lang);
      if (c) { cards[id] = c; this.cardT[id] = e.now; n++; }
    }
    this.watchDirty = false;
    if (n) this.send({ t: W.MIRROR, cards });
  }

  /** clock, weather, counts, the named villagers' relationships (chat), today's paper */
  pushMirror(full) {
    const e = this.e;
    const m = { t: W.MIRROR, clock: Object.assign({}, e.clock), weather: Object.assign({}, e.weather.today), now: e.now,
      stats: { residents: e.alive.length, day: e.clock.day, life: Object.assign({}, e.life.stats), talks: e.social.stats.talks } };
    if (full) {
      const rel = [];
      const kept = Array.from(this.kept);
      for (let i = 0; i < kept.length; i++) for (let j = i + 1; j < kept.length; j++) {
        const r = e.relationship(kept[i], kept[j]);
        if (r.stage !== 'stranger') rel.push([kept[i], kept[j], STAGES.indexOf(r.stage), r.affinity, r.family ? 1 : 0]);
      }
      m.rel = rel;
      if (this.paper) m.paper = this.paper;
    }
    this.send(m);
  }

  // ---------------------------------------------------------------- queries
  query(name, a) {
    const e = this.e;
    if (!e) return null;
    switch (name) {
      case 'card': return e.card(a.sid, a.lang || e.cfg.lang);
      case 'cards': { const o = {}; for (const id of a.sids || []) { const c = e.card(id, a.lang || e.cfg.lang); if (c) o[id] = c; } return o; }
      case 'passbook': return e.passbook(a.sid);
      case 'newspaper': return e.newspaper(a.lang || e.cfg.lang);
      case 'diary': return e.diary(a.sid, a.day === undefined ? e.clock.day : a.day, a.lang || e.cfg.lang);
      case 'relationship': return e.relationship(a.a, a.b);
      case 'namePool': return e.namePool(a.sid, a.n || 3);
      case 'wishers': return e.wishers(a.minAge || 82);
      case 'people': return e.peopleRows();
      case 'name': return e.name(a.sid, a.lang || e.cfg.lang);
      case 'memories': return e.memories(a.sid, a.n || 8);
      case 'rumorsAbout': return e.rumorsAbout(a.sid);
      case 'stats': return Object.assign({ ext: e.extStats(), core: this.perfStats() }, e.stats());
      case 'clock': return { clock: Object.assign({}, e.clock), now: e.now };
      case 'booked': return e.booked();
      case 'placeIds': return e.world.places.map((p) => p.id);
      case 'homes': { const out = []; for (const r of e.alive) if (r.home >= 0) out.push([r.id, e.world.places[r.home].id]); return out; }
      case 'guests': return e.guestsOf(a.a, a.b);
      case 'sweethearts': {
        // pairs of sweethearts (for the scripted first proposal): [{ a, b }]
        const out = [];
        for (const rel of e.pairs.values()) if (rel.stage === 4 && e.people[rel.a].alive && e.people[rel.b].alive) out.push({ a: rel.a, b: rel.b, rom: rel.rom });
        out.sort((x, y) => y.rom - x.rom || x.a - y.a);
        return out.slice(0, a.n || 12);
      }
      case 'singles': {
        // grown-ups who could become the first couple when the town has no sweethearts yet: [{ a, b, rom }]
        const pool = e.alive.filter((r) => r.spouse < 0 && !this.kept.has(r.id) && e.ageOfId(r.id) >= 20 && e.ageOfId(r.id) <= 45 && e.life.partnerOf(r) < 0);
        const out = [];
        for (const r of pool) {
          if (!r.male) continue;
          let best = null, bs = -1;
          for (const q of pool) {
            if (q.male || Math.abs(e.ageOfId(q.id) - e.ageOfId(r.id)) > 10) continue;
            const rel = e.relationship(r.id, q.id), sc = (rel.affinity || 0) + (rel.familiarity || 0);
            if (sc > bs) { bs = sc; best = q; }
          }
          if (best) out.push({ a: r.id, b: best.id, rom: bs });
        }
        out.sort((x, y) => y.rom - x.rom || x.a - y.a);
        return out.slice(0, a.n || 12);
      }
      case 'alive': { const r = e.people[a.sid]; return r && r.alive ? { sid: r.id, age: e.ageOfId(r.id), kept: this.kept.has(r.id) } : null; }
      case 'paperNow': { const p = e.news.latest(); return p ? { day: p.day, ko: e.dialogue.paperText(p, 'ko'), en: e.dialogue.paperText(p, 'en') } : null; }
      case 'family': {
        const r = e.people[a.sid];
        if (!r) return null;
        const alive = (id) => e.people[id] && e.people[id].alive;
        return { spouse: r.spouse, parents: r.parents.filter(alive), kids: r.kids.filter(alive), hh: (e.households.get(r.hh) || { members: [] }).members.slice() };
      }
      default: return null;
    }
  }

  perfStats() { const P = this.perf; return { ticks: P.ticks, avgMs: P.ticks ? P.ms / P.ticks : 0, maxMs: P.maxMs, steps: P.steps }; }

  // ---------------------------------------------------------------- save
  save(msg) {
    const t0 = this.now();
    const data = this.e.serialize({ packed: msg.packed !== false });
    let out = data, level = 0;
    // over the cap: compact (memCap 24, then 16) and try again
    const cap = msg.cap || 450000;
    while (out.length > cap && level < 2) { level++; this.e.compact(level); out = this.e.serialize({ packed: msg.packed !== false }); }
    this.send({ t: W.SAVED, req: msg.req, data: out, chars: out.length, ms: Math.round(this.now() - t0), compacted: level, T: this.e.now, day: this.e.clock.day });
  }
}
