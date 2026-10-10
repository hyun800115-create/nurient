// story_runtime extensions E1–E9 of the story engine (docs/v5_v8_plan.md §6.1). They let the game own the
// bodies (external plans, leases), adopt its people (add / remove / relate), keep the side save small
// (compact, packed saves), age children faster than grown-ups, script the first proposal and the baby's
// name, and book weddings at our own town hall. Every default keeps the engine's own behaviour, so the 30
// original tests run unchanged on this copy (tools/test/story_lab/engine/).
//
// Installed on StoryEngine.prototype by engine.js (installExtensions). Pure: no Phaser, no DOM.

import { makeResident, addToHousehold, setHome, ageOf, groupOf, isKept, daysForAge, ageFromDays,
  G_TODDLER, G_KID, G_TEEN, G_ADULT, G_ELDER, GROUP_NAMES, S_IDLE, S_SLEEP, S_TRAVEL,
  F_OWNER, F_XPLAN, F_LEASED, F_GONE, F_DEAD, F_NEWCOMER, F_EXTERNAL } from './people.js';
import { ensureRel, getRel, removeRel, clampRel, stageFor, friendsOf, ST_ACQ, ST_FRIEND, ST_BEST, ST_SWEET, ST_ENGAGED, ST_SPOUSE,
  RF_FAMILY, RF_PARENT_A, RF_PARENT_B, RF_SIBLING, RF_GRAND_A, RF_GRAND_B, RF_COWORK, RF_NEIGHBOR, RF_CLASS, STAGE_NAMES, STAGE_KO } from './relations.js';
import { A_SOCIAL, A_SLEEP, A_EVENT, A_OUTING } from './plans.js';
import { dropAt, keepScore } from './memory.js';
import { JOBS } from '../data/places.js';
import { LIKES } from '../data/traits.js';
import { GIVEN, poolFor } from '../lang/names.js';
import { romanize } from '../lang/josa.js';
import { hashStr, mix32 } from './rng.js';
import { B_OK } from './world.js';

/** cfg keys the game may change after creation (configure / setRates) */
export const RUNTIME_KEYS = ['incidents', 'lifeEvents', 'farewell', 'happenings', 'memCap', 'talkRate', 'incidentRate', 'fireRate', 'fireRuinAfter',
  'babyRate', 'proposeAfterDays', 'moveInRate', 'moveOutRate', 'targetPop', 'ackWait', 'keepNamed', 'externalPlans', 'yearDaysKid', 'yearDaysAdult',
  'freezeAgeWhenOff', 'weddingInDays', 'weddingHour', 'weddingGapDays', 'babyAfterWeddingDays', 'birthAfterNews', 'farewellHold',
  'farewellNeedsGarden', 'farewellFromDay', 'farewellGapDays', 'farewellBirthGapDays', 'farewellLastDay', 'memorialHour', 'birthHour', 'textMode',
  'avoidClash', 'paperRateBp'];

const SOLO_JOBS = { student: 'student', retired: 'retired', none: 'none' };

export function installExtensions(StoryEngine) {
  const P = StoryEngine.prototype;
  const setToggles0 = P.setToggles;

  // ---------------------------------------------------------------- E1 external plans
  /** the game reports where a resident is now: placeIdx (-1 = between places), act code (plans.js A_*) */
  P.at = function at(id, placeIdx, act = A_SOCIAL) {
    const r = this.people[id];
    if (!r || !r.alive || !(r.flags & F_XPLAN) || (r.flags & F_LEASED)) return false;
    if (r.state === S_TRAVEL) return false;                                  // walking to a story beat: the beat owns the body
    if (r.busyUntil > this.now && (r.destAct === A_EVENT || r.destAct === A_OUTING)) return false;
    const W = this.world;
    if (placeIdx < 0) { if (r.loc >= 0) W.leave(r); if (r.state === S_SLEEP) r.state = S_IDLE; return true; }
    const p = W.places[placeIdx];
    if (!p) return false;
    const moved = r.loc !== p.idx;
    if (moved) W.enter(p, r);
    if (act === A_SLEEP) r.state = S_SLEEP; else if (r.state === S_SLEEP) r.state = S_IDLE;
    if (moved || r.destAct !== act) { r.destAct = act; this.econ.onArrive(r, p, act); }
    return true;
  };
  /** batched at(): [sid, placeIdx, act, sid, placeIdx, act, …] (an Int32Array from the worker protocol) */
  P.atMany = function atMany(list) { let n = 0; for (let i = 0; i + 2 < list.length; i += 3) if (this.at(list[i], list[i + 1], list[i + 2])) n++; return n; };

  // ---------------------------------------------------------------- E2 adoption
  /**
   * a person of the game joins the story. spec: { gid, key, given, sur, title, titleEn, age, male, job, role, persona,
   *   kept (a named villager: never ages, marries, leaves or misbehaves), hh (household key: people with the same key live
   *   together), home (place id of the household's home), work (place id), owner (owns work), spouse (sid), parents [sid],
   *   xplan (default cfg.externalPlans), newcomer, wallet, savings }   -> the story id
   */
  P.addResident = function addResident(spec = {}) {
    const job = spec.job && JOBS[spec.job] ? spec.job : undefined;
    const r = makeResident(this, { key: spec.key || null, given: spec.given, sur: spec.sur, title: spec.title, titleEn: spec.titleEn,
      age: spec.age, male: spec.male, job, persona: spec.persona, wallet: spec.wallet, savings: spec.savings, external: !!spec.kept });
    // a named villager known only by a title ('빵집 아주머니'): no rolled given name (name() shows the title)
    if (spec.title && !spec.given) { if (!this.alive.some((p) => p !== r && p.given === r.given)) this.usedNames.delete(r.given); r.given = ''; r.sur = ''; }
    r.role = spec.role || null;
    r.gid = spec.gid != null ? String(spec.gid) : null;
    if (spec.xplan !== undefined ? spec.xplan : this.cfg.externalPlans) r.flags |= F_XPLAN;
    if (spec.newcomer) { r.flags |= F_NEWCOMER; r.arrived = this.clock.day; }
    if (!this.hhByKey) this.hhByKey = new Map();
    let hh = null;
    if (spec.hh != null) { const id = this.hhByKey.get(String(spec.hh)); hh = id !== undefined ? this.households.get(id) || null : null; }
    if (!hh) { hh = this.newHousehold(); if (spec.hh != null) this.hhByKey.set(String(spec.hh), hh.id); }
    addToHousehold(this, hh, r);
    if (hh.home < 0 && spec.home) {
      const p = this.world.get(spec.home);
      if (p && p.cat === 'home' && p.hh < 0) setHome(this, hh, p.idx);
    }
    if (spec.spouse >= 0 && spec.spouse !== undefined) this.relate(r.id, spec.spouse, 'spouse');
    for (const pid of spec.parents || []) this.relate(pid, r.id, 'parent');
    if (spec.work) {
      const p = this.world.get(spec.work);
      if (p) { r.work = p.idx; if (spec.owner && p.cat === 'shop') { p.owner = r.id; r.flags |= F_OWNER; } }
    } else if (r.job === 'student') { const sc = this.world.first('school'); r.work = sc ? sc.idx : -1; }
    r.lastGroup = groupOf(this, r);
    r.lastAge = ageOf(this, r);
    const home = this.plans.homeOf(r);
    if (this.world.places[home]) this.world.enter(this.world.places[home], r);
    r.state = S_IDLE;
    if (!(r.flags & F_XPLAN)) this.plans.build(r, this.clock.day, this.clock.minute);
    return r.id;
  };

  /** a person leaves the story (moved away in the game, a removed settler): no orphans are left behind */
  P.removeResident = function removeResident(id, why = 'left') {
    const r = this.people[id];
    if (!r || !r.alive) return false;
    this.life.remove(r, why === 'farewell' ? F_DEAD : F_GONE);
    return true;
  };

  /** a relationship the game already knows: 'spouse' | 'parent' (a is b's parent) | 'grand' | 'sibling' | 'family' |
   *  'sweetheart' | 'best' | 'friend' | 'cowork' | 'neighbor' | 'class' | 'acquaint' */
  P.relate = function relate(ia, ib, kind) {
    const a = this.people[ia], b = this.people[ib];
    if (!a || !b || !a.alive || !b.alive || a === b) return null;
    const rel = ensureRel(this, a, b), rng = this.rng;
    const day = this.clock.day;
    const fam = (flags, stage) => {
      rel.flags |= flags;
      rel.fam = Math.max(rel.fam, 700 + rng.int(250)); rel.aff = Math.max(rel.aff, 500 + rng.int(400)); rel.n = Math.max(rel.n, 3);
      if (rel.stage < stage) rel.stage = stage;
      if (rel.met < 0) rel.met = day - 30;
      rel.last = this.now;
    };
    const tie = (fm, af, flags, stage) => {
      rel.flags |= flags || 0;
      rel.fam = Math.max(rel.fam, fm); rel.aff = Math.max(rel.aff, af); rel.n = Math.max(rel.n, 2 + rng.int(5));
      if (rel.met < 0) rel.met = day - 1 - rng.int(30);
      rel.last = this.now - rng.int(this.cfg.dayLength * 2);
      clampRel(rel);
      const st = Math.max(stage || 0, stageFor(rel));
      if (rel.stage < ST_SWEET && st > rel.stage) rel.stage = Math.min(st, ST_BEST);
    };
    switch (kind) {
      case 'spouse':
        fam(0, ST_SPOUSE); rel.stage = ST_SPOUSE; rel.rom = Math.max(rel.rom, 650 + rng.int(300));
        a.spouse = b.id; b.spouse = a.id; a.wedDay = b.wedDay = day - 30;
        break;
      case 'parent':
        fam(RF_FAMILY | (a.id < b.id ? RF_PARENT_A : RF_PARENT_B), ST_BEST);
        if (a.kids.indexOf(b.id) < 0) a.kids.push(b.id);
        if (b.parents.indexOf(a.id) < 0) b.parents.push(a.id);
        break;
      case 'grand': fam(RF_FAMILY | (a.id < b.id ? RF_GRAND_A : RF_GRAND_B), ST_BEST); rel.aff = Math.max(rel.aff, 900); break;
      case 'sibling': fam(RF_FAMILY | RF_SIBLING, ST_FRIEND); break;
      case 'family': fam(RF_FAMILY, ST_FRIEND); break;
      case 'sweetheart':
        tie(450 + rng.int(250), 420 + rng.int(250), 0, ST_FRIEND);
        if (rel.stage < ST_SWEET) { rel.stage = ST_SWEET; rel.rom = Math.max(rel.rom, 560 + rng.int(240)); rel.sweetDay = day - rng.int(5); }
        break;
      case 'best': tie(650 + rng.int(200), 650 + rng.int(250), 0, ST_BEST); break;
      case 'friend': tie(380 + rng.int(250), 330 + rng.int(250), 0, ST_FRIEND); break;
      case 'cowork': tie(150 + rng.int(500), 80 + rng.int(500), RF_COWORK); break;
      case 'neighbor': tie(100 + rng.int(300), 60 + rng.int(350), RF_NEIGHBOR); break;
      case 'class': tie(150 + rng.int(500), 80 + rng.int(500), RF_CLASS); break;
      default: tie(120 + rng.int(200), 40 + rng.int(200), 0); break;
    }
    return rel;
  };

  /** after adoption: the town's everyday ties (classmates, coworkers, neighbours, old friends, a few sweethearts),
   *  jobs for grown-ups without one, the morning paper */
  P.settleTown = function settleTown(opts = {}) {
    this.seedRelations();
    if (opts.jobs !== false) this.jobs.fillOpenings();
    this.initialPop = this.alive.length;
    for (const r of this.alive) { r.lastGroup = groupOf(this, r); r.lastAge = ageOf(this, r); }
    return this.alive.length;
  };

  // ---------------------------------------------------------------- E3 leases
  /** the body of resident id is busy in gameplay (a visitor trip, a builder, a ceremony crowd): never cast into a story beat */
  P.lease = function lease(id, on, placeIdx = -1) {
    const r = this.people[id];
    if (!r || !r.alive) return false;
    if (on) {
      r.flags |= F_LEASED;
      if (r.state === S_TRAVEL || r.state === S_SLEEP) r.state = S_IDLE;
      r.busyUntil = 0;
      const p = placeIdx >= 0 ? this.world.places[placeIdx] : null;
      if (p) this.world.enter(p, r); else this.world.leave(r);
    } else {
      if (!(r.flags & F_LEASED)) return false;
      r.flags &= ~F_LEASED;
      if (!(r.flags & F_XPLAN)) this.plans.build(r, this.clock.day, this.clock.minute);
    }
    return true;
  };
  P.leased = function leased(id) { const r = this.people[id]; return !!(r && (r.flags & F_LEASED)); };

  // ---------------------------------------------------------------- E4 game-owned places and rates
  /** a place the game adds later (a founded shop, our town hall, the memorial garden …) */
  P.addPlaceLive = function addPlaceLive(def) {
    const p = this.world.addPlace(def);
    if (def.owner !== undefined && def.owner >= 0) this.setOwner(p.id, def.owner);
    return p.idx;
  };
  /** resident sid runs shop placeId (Growth decides; the story follows) */
  P.setOwner = function setOwner(placeId, sid) {
    const p = this.world.get(placeId), r = this.people[sid];
    if (!p) return false;
    if (p.owner >= 0 && this.people[p.owner] && this.people[p.owner].work === p.idx) this.people[p.owner].flags &= ~F_OWNER;
    p.owner = r && r.alive ? r.id : -1;
    if (r && r.alive) { r.flags |= F_OWNER; r.work = p.idx; if (p.cat === 'shop') r.job = jobForKind(p.kind); }
    return true;
  };
  P.setRates = function setRates(o = {}) {
    for (const k of ['fireRate', 'incidentRate', 'babyRate', 'moveInRate', 'moveOutRate', 'talkRate']) if (Number.isFinite(o[k])) this.cfg[k] = Math.max(0, o[k]);
  };
  /** runtime config (tuning.js after a load): only RUNTIME_KEYS */
  P.configure = function configure(o = {}) {
    for (const k of RUNTIME_KEYS) if (o[k] !== undefined) this.cfg[k] = o[k];
    if (o.farewell !== undefined) this.setToggles({ farewell: o.farewell });
  };

  // ---------------------------------------------------------------- E5 compact
  /** shrink the side save: level 1 memCap 24, level 2 memCap 16 + shorter diaries; one-off acquaintances and facts
   *  nobody remembers are dropped. Returns what was removed. */
  P.compact = function compact(level = 1) {
    const caps = [40, 24, 16], cap = caps[Math.max(0, Math.min(2, level | 0))];
    if (this.cfg.memCap > cap) this.cfg.memCap = cap;
    let mem = 0, rels = 0, facts = 0;
    for (const r of this.alive) {
      while (r.mem.length > this.cfg.memCap) {
        let wi = 0, ws = 1e18;
        for (let i = 0; i < r.mem.length; i++) { const k = keepScore(r.mem[i]); if (k < ws) { ws = k; wi = i; } }
        dropAt(this, r, wi); mem++;
      }
      if (level >= 2 && r.log.length > 12) r.log.splice(0, r.log.length - 12);
    }
    const drop = [];
    for (const rel of this.pairs.values()) if (rel.stage <= ST_ACQ && rel.flags === 0 && rel.n <= (level >= 2 ? 2 : 1)) drop.push(rel);
    for (const rel of drop) { removeRel(this, rel); rels++; }
    const keep = new Set();
    for (const f of this.facts.values()) if (f.ref && (f.knowers > 0 || f.pinned > 0)) keep.add(f.ref);
    for (const f of Array.from(this.facts.values())) {
      if (f.knowers > 0 || f.pinned > 0 || keep.has(f.id) || this.lastChief === f) continue;
      this.facts.delete(f.id); facts++;
    }
    this.deadFacts = this.deadFacts.filter((f) => this.facts.has(f.id));
    for (const r of this.alive) for (let i = r.qs.length - 1; i >= 0; i--) if (r.qs[i].f && !this.facts.has(r.qs[i].f.id)) r.qs.splice(i, 1);
    return { level, memCap: this.cfg.memCap, mem, rels, facts };
  };

  // ---------------------------------------------------------------- E7 farewell switch freezes the elders
  P.setToggles = function setToggles(t = {}) {
    const was = this.cfg.farewell;
    setToggles0.call(this, t);
    if (t.farewell === undefined) return;
    if (!this.cfg.farewell) {
      if (this.cfg.freezeAgeWhenOff > 0) this.cfg.freezeAge = this.cfg.freezeAgeWhenOff;
      for (const r of this.alive) if (r.farewellDay >= 0) r.farewellDay = -1;        // a queued farewell is cancelled
    } else if (!was && this.cfg.freezeAge > 0) {
      // back on: the frozen elders go on from the age they were frozen at (no sudden jump)
      const fz = this.cfg.freezeAge;
      this.cfg.freezeAge = 0;
      for (const r of this.alive) {
        if ((r.flags & F_EXTERNAL) && this.cfg.keepNamed) continue;
        if (ageOf(this, r) > fz) r.birth = this.clock.day - Math.ceil(daysForAge(this, fz));
      }
    }
  };

  // ---------------------------------------------------------------- E8 arranged beats
  /** 'propose' { a, b, inDays | day, hour, silent } · 'nameBaby' { sid, name: { ko, en } } · 'expect' { a, b (a married couple), inDays } */
  P.arrange = function arrange(op, data = {}) {
    if (op === 'propose') {
      const a = this.people[data.a], b = this.people[data.b];
      if (!a || !b || !a.alive || !b.alive || a === b || a.spouse >= 0 || b.spouse >= 0) return null;
      const rel = ensureRel(this, a, b);
      if (rel.stage >= ST_ENGAGED) return null;
      if (rel.n === 0) { rel.n = 3; rel.fam = Math.max(rel.fam, 520); rel.aff = Math.max(rel.aff, 520); rel.met = this.clock.day - 10; }
      if (rel.stage < ST_SWEET) this.life.becomeSweethearts(a, b, rel);
      rel.rom = Math.max(rel.rom, 760);
      // silent: a promise the player already saw is re-made after a stale side record (no second card or banner)
      this.life.engage(a, b, rel, { inDays: data.inDays, day: data.day, hour: data.hour, scripted: true, ignoreGap: true, silent: !!data.silent });
      const f = this.facts.get(Array.from(this.facts.keys()).pop());
      return { a: a.id, b: b.id, day: f && f.k === 'engaged' ? f.n : this.clock.day + (data.inDays || 0) };
    }
    if (op === 'nameBaby') {
      const r = this.people[data.sid];
      const nm = data.name || {};
      if (!r || !r.alive || !nm.ko) return null;
      if (!this.alive.some((p) => p !== r && p.given === r.given)) this.usedNames.delete(r.given);
      r.given = String(nm.ko).slice(0, 8);
      r.enName = nm.en ? String(nm.en).slice(0, 16) : null;
      r.en = null;
      this.usedNames.add(r.given);
      return { sid: r.id, ko: r.given, en: this.name(r.id, 'en') };
    }
    if (op === 'expect') {
      const a = this.people[data.a], b = this.people[data.b];
      if (!a || !b || !a.alive || !b.alive || a === b || a.expecting || b.expecting) return null;
      // only a married couple of grown-ups under 50, a man and a woman (critique H3: stale ids never make a baby)
      if (a.spouse !== b.id || b.spouse !== a.id || a.male === b.male) return null;
      const ga = ageOf(this, a), gb = ageOf(this, b);
      if (ga < 19 || gb < 19 || ga >= 50 || gb >= 50) return null;
      this.life.expect(a.male ? b : a, a.male ? a : b, data.inDays);
      return { a: a.id, b: b.id };
    }
    return null;
  };

  /** three baby names from the pool of the newest generation (deterministic per baby, never in use) */
  P.namePool = function namePool(sid, n = 3) {
    const r = this.people[sid];
    if (!r) return [];
    const pool = GIVEN[poolFor(0)][r.male ? 'm' : 'f'];
    const out = [];
    let h = mix32(hashStr('names') ^ (this.cfg.seedNum + sid * 2654435761));
    for (let k = 0; k < 64 && out.length < n; k++) {
      h = mix32(h + k + 1);
      const g = pool[h % pool.length];
      if (out.some((o) => o.ko === g) || (this.usedNames.has(g) && g !== r.given)) continue;
      out.push({ ko: g, en: romanize(g) });
    }
    return out;
  };

  // ---------------------------------------------------------------- queries for the game (pure)
  /** the person card: name, age, job, home, mood, best friend, spouse, kids, likes, the chief memory */
  P.card = function card(id, lang = this.cfg.lang) {
    const r = this.people[id];
    if (!r) return null;
    const en = lang === 'en';
    const J = JOBS[r.job] || JOBS.none;
    let best = -1, bs = -1;
    for (const rel of r.adj) {
      if (rel.stage !== ST_BEST || (rel.flags & RF_FAMILY)) continue;
      const sc = rel.aff + rel.fam;
      if (sc > bs) { bs = sc; best = rel.other(r.id); }
    }
    const partner = this.life.partnerOf(r);
    const pr = partner >= 0 ? getRel(this, r.id, partner) : null;
    let chief = null;
    for (const m of r.mem) if (m.f.k === 'chief' && (!chief || m.f.sec > chief.f.sec)) chief = m;
    let chiefLine = null;
    if (chief) {
      const deed = this.dialogue.chiefDeed(chief.f, lang);
      const type = (chief.f.s || '').split('|')[0];
      if (deed && type !== 'other') chiefLine = en ? 'The chief ' + deed + '.' : '촌장님이 ' + deed + '어요.';
    }
    const home = r.home >= 0 ? this.world.places[r.home] : null;
    const age = ageOf(this, r);
    return {
      id: r.id, gid: r.gid, alive: r.alive, name: this.name(r.id, lang), age, group: GROUP_NAMES[groupOf(this, r)], male: r.male,
      job: r.job === 'none' ? (en ? 'between jobs' : '쉬는 중') : en ? J.en : J.ko, jobId: r.job, role: r.role,
      home: home ? this.world.nameOf(home, lang) : null, mood: r.mood,
      best: best >= 0 ? { id: best, name: this.name(best, lang) } : null,
      spouse: r.spouse >= 0 && this.people[r.spouse] && this.people[r.spouse].alive ? { id: r.spouse, name: this.name(r.spouse, lang) } : null,
      partner: partner >= 0 && r.spouse !== partner ? { id: partner, name: this.name(partner, lang), stage: STAGE_NAMES[pr ? pr.stage : 0] } : null,
      kids: r.kids.filter((k) => this.people[k] && this.people[k].alive).map((k) => ({ id: k, name: this.name(k, lang), age: ageOf(this, this.people[k]) })),
      likes: r.likes.map((i) => (en ? LIKES[i].en : LIKES[i].ko)),
      chiefMemory: chiefLine, kept: isKept(this, r), leased: !!(r.flags & F_LEASED), day: this.clock.day,
    };
  };

  /** compact rows for the game's mirror: [id, group, age, flags(spouse? partner? kept?), mood] */
  P.peopleRows = function peopleRows() {
    const out = [];
    for (const r of this.alive) out.push([r.id, groupOf(this, r), ageOf(this, r), (r.spouse >= 0 ? 1 : 0) | (this.life.partnerOf(r) >= 0 ? 2 : 0) | (isKept(this, r) ? 4 : 0) | (r.male ? 8 : 0), r.mood, r.gid]);
    return out;
  };

  /** elders who may make a wish (age ≥ minAge, not kept), most-loved likes first */
  P.wishers = function wishers(minAge = 82) {
    const out = [];
    for (const r of this.alive) {
      if (isKept(this, r) || (r.flags & F_LEASED)) continue;
      const a = ageOf(this, r);
      if (a < minAge) continue;
      out.push({ id: r.id, gid: r.gid, age: a, likes: r.likes.map((i) => LIKES[i].id), name: this.name(r.id, 'ko'), nameEn: this.name(r.id, 'en'),
        family: r.kids.concat(r.spouse >= 0 ? [r.spouse] : []).filter((k) => this.people[k] && this.people[k].alive) });
    }
    return out;
  };

  /** booked beats (weddings, births, memorials) for a host that reloads: [{ kind, at, a, b }] */
  P.booked = function booked() {
    const out = [];
    for (const [at, kind, data] of this.sched) {
      if (kind === 'wedding') out.push({ kind, at, a: data[0], b: data[1], day: Math.floor(at / this.cfg.dayLength), hour: Math.round(((at % this.cfg.dayLength) * 24 / this.cfg.dayLength) * 2) / 2 });
      else if (kind === 'birth') out.push({ kind, at, a: data[0], b: data[1] });
      else if (kind === 'memorial') out.push({ kind, at, a: data[0] });
    }
    for (const r of this.alive) if (r.farewellDay >= 0) out.push({ kind: 'lastday', at: r.farewellDay * this.cfg.dayLength, a: r.id });
    return out;
  };

  /** wedding guests of a and b: family and friends (the engine's own rule), at most 14 */
  P.guestsOf = function guestsOf(ia, ib) {
    const out = [];
    for (const id of [ia, ib]) {
      const r = this.people[id];
      if (!r) continue;
      for (const rel of r.adj) {
        const o = this.people[rel.other(r.id)];
        if (!o || !o.alive || o.id === ia || o.id === ib || out.indexOf(o.id) >= 0) continue;
        if ((rel.flags & RF_FAMILY) || rel.stage >= ST_FRIEND) out.push(o.id);
      }
    }
    out.sort((x, y) => x - y);
    return out.slice(0, 14);
  };

  P.ageOfId = function ageOfId(id) { const r = this.people[id]; return r ? ageOf(this, r) : -1; };

  /** extended stats (the base stats() + the extension counters) */
  P.extStats = function extStats() {
    let xplan = 0, leased = 0, kept = 0;
    for (const r of this.alive) { if (r.flags & F_XPLAN) xplan++; if (r.flags & F_LEASED) leased++; if (isKept(this, r)) kept++; }
    return { residents: this.alive.length, xplan, leased, kept, facts: this.facts.size, pairs: this.pairs.size, memCap: this.cfg.memCap,
      lastWeddingDay: this.life.lastWeddingDay, lastFarewellDay: this.life.lastFarewellDay };
  };
}

function jobForKind(kind) {
  return kind === 'bakery' ? 'baker' : kind === 'cafe' ? 'barista' : kind === 'restaurant' ? 'cook' : kind === 'stall' ? 'stall_keeper' : kind === 'salon' ? 'hairdresser'
    : kind === 'grocer' ? 'grocer' : kind === 'fishmonger' ? 'fishmonger' : 'shopkeeper';
}

export { ageFromDays, daysForAge, SOLO_JOBS, G_TODDLER, G_KID, G_TEEN, G_ADULT, G_ELDER, STAGE_KO, friendsOf };
