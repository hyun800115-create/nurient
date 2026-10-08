// StoryEngine — the deterministic social simulation of the town (CONTRACT_V8 §AF).
// No Phaser, no DOM: the game imports it, feeds it time (tick), its world (places, prices, the chief's
// deeds) and renders what it says on the event bus (talk, goTo, incident, build, move, life, bank,
// shop, news, wanted, gossip …). See docs/build_reports/story.md for the API and the integration plan.

import { Rng, hashStr, mix32 } from './rng.js';
import { Bus } from './bus.js';
import { World, B_OK } from './world.js';
import { Resident, Household, makeResident, addToHousehold, setHome, ageOf, groupOf, G_TODDLER, G_KID, G_TEEN, G_ADULT, G_ELDER,
  S_IDLE, S_SLEEP, F_OWNER, F_EXTERNAL, F_JAILED } from './people.js';
import { Fact, remember, nightly as memNightly, SRC_SEEN, SRC_DID, SRC_TOLD, SRC_NEWS } from './memory.js';
import { ensureRel, getRel, stageFor, clampRel, friendsOf, ST_ACQ, ST_FRIEND, ST_BEST, ST_SWEET, ST_SPOUSE,
  RF_FAMILY, RF_PARENT_A, RF_PARENT_B, RF_SIBLING, RF_COWORK, RF_NEIGHBOR, RF_CLASS, RF_GRAND_A, RF_GRAND_B, RF_RIVAL, RF_CRUSH_A, RF_CRUSH_B } from './relations.js';
import { Plans, A_HOME } from './plans.js';
import { Economy } from './econ.js';
import { Bank } from './bank.js';
import { Social, Beat } from './social.js';
import { Incidents } from './incidents.js';
import { Life } from './life.js';
import { Jobs } from './jobs.js';
import { Weather } from './weather.js';
import { Newspaper } from './newspaper.js';
import { Dialogue, CHIEF } from './dialogue.js';
import { FACT_KINDS } from '../data/facts.js';
import { JOBS, STAFF, PLACE_KINDS } from '../data/places.js';
import { LIKES } from '../data/traits.js';
import { defaultTown } from '../data/town.js';
import { serialize as doSerialize, deserialize as doDeserialize } from './save.js';

export const DEFAULTS = {
  seed: 1,
  lang: 'ko',             // language of generated text ('ko' | 'en')
  dayLength: 600,         // game seconds per day (the game's day-night cycle)
  yearDays: 6,            // days per year of age (a generation per long playthrough)
  step: 1,                // simulation step in game seconds
  textMode: 'visible',    // 'all' | 'visible' (setVisible) | 'none'
  incidents: true,        // petty crime, scuffles, fires ('사건·사고 끄기' sets false)
  lifeEvents: true,       // romance, weddings, babies, gentle farewells
  farewell: true,         // gentle farewells of the very old (own toggle)
  happenings: true,       // small daily happenings (slips, snowmen, pets …)
  memCap: 40,             // memories per resident
  talkRate: 0.045,        // conversation start rate per free pair per second
  lineTime: 2.6,          // seconds per line (talk duration estimate)
  incidentRate: 1,        // multiplier for petty incidents
  fireRate: 0.22,         // fires per day per 250 residents
  fireRuinAfter: 40,      // seconds of burning after which a building is lost
  babyRate: 0.006,
  proposeAfterDays: 3,
  moveInRate: 0.12,
  moveOutRate: 0.0025,
  romanceAnySex: false,
  gamePrices: false,      // true when the game feeds prices (no random drift)
  population: 250,        // generated residents when no save is given
  targetPop: 0,           // move-ins aim at this population (0 = the starting population)
};

export class StoryEngine {
  constructor(opts = {}) {
    const cfg = Object.assign({}, DEFAULTS, opts.config || {}, pickCfg(opts));
    cfg.seedNum = typeof cfg.seed === 'string' ? hashStr(cfg.seed) : cfg.seed >>> 0;
    this.cfg = cfg;
    this.rng = new Rng(cfg.seedNum);
    this.bus = new Bus();
    this.now = 0;
    this.accMs = 0;
    this.clock = { day: 0, minute: 0, dow: 0 };
    this.world = new World(this);
    this.people = [];
    this.alive = [];
    this.usedNames = new Set();
    this.nextPersonId = 1;
    this.households = new Map();
    this.nextHH = 1;
    this.facts = new Map();
    this.nextFactId = 1;
    this.deadFacts = [];
    this.pairs = new Map();
    this.sched = [];             // [at, kind, data] sorted by time
    this.talkSeq = 1;
    this.chiefFacts = 0;
    this.lastChief = null;
    this.newestShop = -1;
    this.quotes = [];
    this.initialPop = 0;
    this.upkeepI = -1;
    this.likes = LIKES;
    this.visible = null;
    this.metrics = opts.metrics || null;
    this.plans = new Plans(this);
    this.econ = new Economy(this);
    this.bank = new Bank(this);
    this.social = new Social(this);
    this.incidents = new Incidents(this);
    this.life = new Life(this);
    this.jobs = new Jobs(this);
    this.weather = new Weather(this);
    this.news = new Newspaper(this);
    this.dialogue = new Dialogue(this);
    this.perf = { steps: 0, ms: 0, maxMs: 0 };
    if (opts.save) this.deserialize(opts.save);
    else this.setup(opts);
  }

  // ================================================================ setup
  setup(opts) {
    const cfg = this.cfg;
    this.now = Math.floor(cfg.dayLength * (6 / 24));      // the story starts at 06:00 on day 0
    this.updateClock();
    const town = opts.world || defaultTown(opts.residents && !opts.population ? opts.residents.length : cfg.population);
    for (const p of town.places) {
      const pl = this.world.addPlace(p);
      if (pl.cat === 'shop' && !p.name) pl.name = this.world.shopName(pl.kind, this.rng);
    }
    for (const pl of town.plots || []) this.world.addPlot(pl);
    this.weather.roll();
    const specs = opts.residents || [];
    this.populate(specs, opts.residents && !opts.population ? 0 : cfg.population);
    this.initialPop = this.alive.length;
    this.incidents.planDay();
    for (const r of this.alive) {
      this.plans.build(r, this.clock.day, this.clock.minute);
      const home = this.plans.homeOf(r);
      this.world.enter(this.world.places[home], r);
      r.state = S_IDLE;
    }
    this.news.compile();
  }

  /** create the town's households: the game's named residents first, then generated families */
  populate(specs, total) {
    const rng = this.rng;
    const created = [];
    // the game's named villagers become singles / small households
    for (const s of specs) {
      const r = makeResident(this, Object.assign({ external: true }, s));
      created.push(r);
      const hh = this.newHousehold();
      addToHousehold(this, hh, r);
    }
    const want = Math.max(0, total - specs.length);
    let made = 0;
    while (made < want) {
      const kinds = [['single', 2.6], ['couple', 2], ['family', 4], ['single_parent', 0.6], ['elders', 1.2], ['elder', 0.6], ['three_gen', 0.8], ['roommates', 1]];
      const k = kinds[rng.weighted(kinds.map((x) => x[1]))][0];
      const size = { single: 1, couple: 2, family: 3 + rng.int(3), single_parent: 2 + rng.int(2), elders: 2, elder: 1, three_gen: 4 + rng.int(2), roommates: 2 }[k];
      const hh = this.newHousehold();
      const ms = this.makeFamily(hh, k, Math.min(size, want - made));
      made += ms.length;
      created.push(...ms);
    }
    // homes
    const homes = this.world.homes().slice().sort((a, b) => a.cap - b.cap || a.idx - b.idx);
    const hhs = Array.from(this.households.values()).sort((a, b) => b.members.length - a.members.length || a.id - b.id);
    for (const hh of hhs) {
      let best = null;
      for (const h of homes) if (h.hh < 0 && h.cap >= hh.members.length && (!best || h.cap < best.cap)) best = h;
      if (!best) for (const h of homes) if (h.hh < 0 && (!best || h.cap > best.cap)) best = h;
      if (best) setHome(this, hh, best.idx);
    }
    // shop owners, then jobs for everyone else
    const owners = this.alive.filter((r) => groupOf(this, r) === G_ADULT && ageOf(this, r) >= 26);
    rng.shuffle(owners);
    for (const p of this.world.places) {
      if (p.cat !== 'shop') continue;
      const o = owners.pop();
      if (!o) break;
      p.owner = o.id;
      o.flags |= F_OWNER;
      const st = STAFF[p.kind];
      o.job = st ? st[0][0] : 'shopkeeper';
      o.work = p.idx;
    }
    // students to school
    const school = this.world.first('school');
    for (const r of this.alive) if (r.job === 'student') r.work = school ? school.idx : -1;
    this.jobs.fillOpenings();
    this.seedRelations();
  }

  newHousehold() { const hh = new Household(this.nextHH++); hh.since = this.clock.day; this.households.set(hh.id, hh); return hh; }

  /** members of a new household (kind: single, couple, family, single_parent, elders, elder, three_gen) */
  makeFamily(hh, kind, size) {
    const rng = this.rng;
    const out = [];
    const add = (spec) => { const r = makeResident(this, spec); addToHousehold(this, hh, r); out.push(r); return r; };
    const fam = (a, b, flags, stage) => { const rel = ensureRel(this, a, b); rel.flags |= flags; rel.fam = 700 + rng.int(250); rel.aff = 500 + rng.int(400); rel.n = 3; rel.stage = stage; return rel; };
    const parentOf = (p, k) => { fam(p, k, RF_FAMILY | (p.id < k.id ? RF_PARENT_A : RF_PARENT_B), ST_BEST); p.kids.push(k.id); k.parents.push(p.id); };
    const marry = (a, b) => { const rel = fam(a, b, 0, ST_SPOUSE); rel.rom = 650 + rng.int(300); a.spouse = b.id; b.spouse = a.id; };
    if (size <= 0) return out;
    if (kind === 'single') { add({ age: 21 + (rng.chance(0.6) ? rng.int(15) : rng.int(43)) }); return out; }
    if (kind === 'roommates') {
      const male = rng.chance(0.5);
      const a = add({ age: 21 + rng.int(14), male });
      if (size > 1) { const b = add({ age: 21 + rng.int(14), male }); const rel = fam(a, b, 0, ST_FRIEND); rel.flags &= ~RF_FAMILY; rel.aff = 300 + rng.int(400); }
      return out;
    }
    if (kind === 'elder') { add({ age: 66 + rng.int(20) }); return out; }
    if (kind === 'elders') { const a = add({ age: 66 + rng.int(18), male: true }); const b = add({ age: 64 + rng.int(18), male: false, sur: rng.chance(0.5) ? a.sur : undefined }); marry(a, b); return out; }
    if (kind === 'couple') { const a = add({ age: 24 + rng.int(30), male: true }); if (size > 1) { const b = add({ age: Math.max(21, ageOf(this, a) - 4 + rng.int(8)), male: false }); marry(a, b); } return out; }
    // families with children (and grandparents)
    const momAge = 28 + rng.int(24);
    const kids = [];
    let mom = null, dad = null;
    if (kind !== 'single_parent' || rng.chance(0.5)) mom = add({ age: momAge, male: false });
    if (kind !== 'single_parent' || !mom) dad = add({ age: momAge + rng.int(6) - 1, male: true });
    if (mom && dad) marry(mom, dad);
    const sur = dad ? dad.sur : mom.sur;
    let left = size - out.length - (kind === 'three_gen' ? 1 : 0);
    while (left-- > 0) {
      const k = add({ age: Math.max(0, momAge - 22 - rng.int(Math.min(momAge - 21, 19))), sur });
      kids.push(k);
      if (mom) parentOf(mom, k);
      if (dad) parentOf(dad, k);
    }
    for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) fam(kids[i], kids[j], RF_FAMILY | RF_SIBLING, ST_FRIEND);
    if (kind === 'three_gen') {
      const parent = dad || mom;
      const g = add({ age: Math.max(66, ageOf(this, parent) + 26 + rng.int(6)), male: rng.chance(0.4), sur: parent.sur });
      parentOf(g, parent);
      for (const k of kids) { const rel = fam(g, k, RF_FAMILY | (g.id < k.id ? RF_GRAND_A : RF_GRAND_B), ST_BEST); rel.aff = 900; }
    }
    return out;
  }

  /** neighbours, coworkers, classmates, old friends, a few rivals and crushes */
  seedRelations() {
    const rng = this.rng, W = this.world;
    const link = (a, b, fam, aff, flag) => {
      if (a === b || !a.alive || !b.alive) return null;
      const rel = ensureRel(this, a, b);
      if (rel.flags & RF_FAMILY) return rel;
      rel.flags |= flag || 0;
      rel.fam = Math.max(rel.fam, fam); rel.aff = Math.max(rel.aff, aff);
      rel.n = Math.max(rel.n, 2 + rng.int(6)); rel.met = this.clock.day - 1 - rng.int(30); rel.last = this.now - rng.int(this.cfg.dayLength * 3);
      clampRel(rel);
      rel.stage = Math.max(rel.stage, stageFor(rel));
      return rel;
    };
    // coworkers
    const byWork = new Map();
    for (const r of this.alive) if (r.work >= 0) { if (!byWork.has(r.work)) byWork.set(r.work, []); byWork.get(r.work).push(r); }
    for (const [, staff] of byWork) {
      const isSchool = staff.length > 12;
      for (let i = 0; i < staff.length; i++) {
        const n = isSchool ? 4 : staff.length;
        for (let k = 0; k < n && k < staff.length; k++) {
          const j = isSchool ? rng.int(staff.length) : k;
          if (j <= i && !isSchool) continue;
          const a = staff[i], b = staff[j];
          const bothKids = groupOf(this, a) <= G_TEEN && groupOf(this, b) <= G_TEEN;
          link(a, b, 150 + rng.int(500), 80 + rng.int(500), bothKids ? RF_CLASS : RF_COWORK);
        }
      }
    }
    // neighbours (same neighbourhood, adjacent homes)
    const homes = W.homes();
    for (let i = 0; i + 4 < homes.length; i++) {
      const h1 = homes[i], h2 = homes[i + 4];
      for (const a of h1.residents) for (const b of h2.residents) if (rng.chance(0.5)) link(this.people[a], this.people[b], 100 + rng.int(300), 60 + rng.int(350), RF_NEIGHBOR);
    }
    // old friends of the same age group
    const list = this.alive.slice();
    for (const r of list) {
      const g = groupOf(this, r);
      if (g === G_TODDLER) continue;
      const n = 1 + rng.int(3);
      for (let k = 0; k < n; k++) {
        const o = list[rng.int(list.length)];
        if (Math.abs(groupOf(this, o) - g) > (g === G_ADULT ? 1 : 0) || groupOf(this, o) === G_TODDLER) continue;
        link(r, o, 300 + rng.int(500), 250 + rng.int(550));
      }
    }
    // a few rivals and crushes
    for (let k = 0; k < Math.round(list.length * 0.03); k++) {
      const a = list[rng.int(list.length)], b = list[rng.int(list.length)];
      if (a === b || groupOf(this, a) < G_KID || groupOf(this, b) < G_KID) continue;
      const rel = link(a, b, 250, 0);
      if (rel && !(rel.flags & RF_FAMILY)) { rel.aff = -280 - rng.int(250); rel.flags |= RF_RIVAL; rel.stage = ST_ACQ; }
    }
    const singles = list.filter((r) => this.life.canRomanceSolo(r));
    rng.shuffle(singles);
    for (let k = 0; k + 1 < singles.length && k < 28; k += 2) {
      const a = singles[k];
      const b = singles.slice(k + 1).find((x) => x.male !== a.male && Math.abs(ageOf(this, x) - ageOf(this, a)) <= 8 && this.life.partnerOf(x) < 0);
      if (!b) continue;
      const rel = link(a, b, 400 + rng.int(300), 380 + rng.int(300));
      if (!rel || (rel.flags & RF_FAMILY)) continue;
      if (k < 8) { rel.stage = ST_SWEET; rel.rom = 560 + rng.int(240); rel.sweetDay = -rng.int(10); }
      else { rel.rom = 300 + rng.int(200); rel.aff = Math.max(rel.aff, 380); rel.flags |= a.id === rel.a ? RF_CRUSH_A : RF_CRUSH_B; a.crushOn = b.id; }
    }
  }

  // ================================================================ time
  /** advance the story by dt game seconds */
  tick(dt) {
    this.accMs += Math.round(dt * 1000);
    const stepMs = this.cfg.step * 1000;
    let n = 0;
    while (this.accMs >= stepMs && n < 600) { this.accMs -= stepMs; this.step(); n++; }
  }

  /** run whole days quickly (headless) */
  runDays(days, onStep) {
    const steps = Math.round((days * this.cfg.dayLength) / this.cfg.step);
    for (let i = 0; i < steps; i++) { this.step(); if (onStep) onStep(this); }
  }

  updateClock() {
    const L = this.cfg.dayLength;
    const day = Math.floor(this.now / L);
    const sod = this.now - day * L;
    this.clock.day = day;
    this.clock.minute = Math.floor((sod * 1440) / L);
    this.clock.dow = ((day % 7) + 7) % 7;
  }

  step() {
    const prevMin = this.clock.minute, prevDay = this.clock.day;
    this.now += this.cfg.step;
    this.updateClock();
    const min = this.clock.minute;
    if (this.clock.day !== prevDay) this.newDay();
    if (prevMin < 1425 && min >= 1425) this.endOfDay();
    if (prevMin < 300 && min >= 300) this.news.compile();
    if (prevMin < 60 && min >= 60) this.upkeepI = 0;
    if (this.upkeepI >= 0) this.upkeepSlice();
    this.runScheduled();
    this.plans.update();
    this.social.update();
    this.incidents.update();
    if (this.metrics) this.metrics.onStep(this);
  }

  newDay() {
    this.weather.roll();
    if (!this.cfg.gamePrices) this.world.driftPrices(this.rng);
    this.incidents.planDay();
    this.incidents.dailyWanted();
    this.life.daily();
    this.jobs.fillOpenings(true);
    this.curiosity();
    this.gcFacts();
    if (this.bus.has('day')) this.bus.emit('day', { day: this.clock.day, weather: this.weather.today });
  }

  endOfDay() {
    for (let i = 0; i < this.alive.length; i++) {
      const r = this.alive[i];
      this.econ.nightly(r);
      this.moodNightly(r);
    }
    this.bank.daily();
  }

  /** memories fade / consolidate at night, a slice of residents per step (no frame spikes) */
  upkeepSlice() {
    const per = Math.max(4, Math.ceil(this.alive.length / 60));
    for (let k = 0; k < per; k++) {
      if (this.upkeepI >= this.alive.length) { this.upkeepI = -1; return; }
      const r = this.alive[this.upkeepI++];
      memNightly(this, r);
      // old questions are dropped
      for (let i = r.qs.length - 1; i >= 0; i--) if (this.now - r.qs[i].t > this.cfg.dayLength * 3) r.qs.splice(i, 1);
      // familiarity fades a little between people who no longer meet
      for (const rel of r.adj) if (rel.a === r.id && !(rel.flags & RF_FAMILY) && rel.stage < ST_SWEET && this.now - rel.last > this.cfg.dayLength * 4) { rel.fam = Math.max(0, rel.fam - 8); if (rel.aff < 0) rel.aff += 6; }
    }
  }

  moodNightly(r) {
    let t = 18;
    t += r.hunger < 50 ? 8 : r.hunger > 80 ? -18 : -4;
    let fr = 0;
    for (const rel of r.adj) if (rel.stage >= ST_FRIEND) fr++;
    t += Math.min(22, fr * 3);
    if (groupOf(this, r) === G_ADULT && r.job === 'none') t -= 16;
    if (r.stayWith >= 0) t -= 12;
    if (r.wallet + r.savings < 20) t -= 12;
    if (r.socialNeed > 80) t -= 8;
    t += this.rng.int(11) - 5;
    r.mood = Math.round(r.mood * 0.6 + t * 0.4);
    r.socialNeed = Math.min(100, r.socialNeed + 35 + Math.round(r.tr[0] / 6));
    r.energy = 85 + this.rng.int(15);
  }

  /** curious residents wonder about things: prices, the bank, the chief, the dog, the train, friends */
  curiosity() {
    const rng = this.rng;
    for (const r of this.alive) {
      if (r.qs.length >= 2 || groupOf(this, r) < G_KID) continue;
      if (!rng.chance(0.08 + r.tr[3] / 400)) continue;
      const g = groupOf(this, r);
      const opts = ['price', 'buy', 'chief', 'dog', 'train', 'how'];
      if (g >= G_ADULT) opts.push('rate');
      if (g === G_ADULT && r.job === 'none') opts.push('job', 'job');
      const k = opts[rng.int(opts.length)];
      let o = -1;
      if (k === 'price' || k === 'buy') o = this.likesItem(r);
      if (k === 'how') { const fr = friendsOf(this, r); if (!fr.length) continue; o = fr[rng.int(fr.length)]; }
      if (k === 'chief' && !this.chiefFacts) continue;
      this.social.addQ(r, k, null, o);
    }
  }

  likesItem(r) {
    const rng = this.rng;
    const pool = [0, 1, 2, 6, 7, 8, 9, 10, 11, 12, 13, 24, 25, 28, 29, 30, 31, 41, 46, 47];
    return pool[(r.id * 7 + rng.int(pool.length)) % pool.length];
  }

  // ================================================================ scheduling
  schedule(at, kind, data) {
    const s = this.sched;
    let i = s.length;
    while (i > 0 && s[i - 1][0] > at) i--;
    s.splice(i, 0, [at, kind, data]);
  }

  runScheduled() {
    const s = this.sched;
    while (s.length && s[0][0] <= this.now) {
      const [, kind, data] = s.shift();
      switch (kind) {
        case 'incident': this.incidents.startScheduled(data); break;
        case 'wedding': this.life.wedding(data); break;
        case 'memorial': this.life.memorial(data); break;
        case 'shopReady': this.econ.shopReady(data); this.newestShop = data; break;
      }
    }
  }

  // ================================================================ facts, memory, witnesses
  fact(kind, fields) {
    if (!FACT_KINDS[kind]) throw new Error('story: unknown fact kind ' + kind);
    const f = new Fact(this.nextFactId++, kind);
    f.day = this.clock.day; f.sec = this.now;
    if (fields) {
      if (fields.a !== undefined) f.a = fields.a;
      if (fields.b !== undefined) f.b = fields.b;
      if (fields.c !== undefined) f.c = fields.c;
      if (fields.p !== undefined && fields.p !== null) f.p = fields.p;
      if (fields.i !== undefined) f.i = fields.i;
      if (fields.n !== undefined) f.n = fields.n;
      if (fields.s !== undefined && fields.s !== null) f.s = String(fields.s);
      if (fields.ref !== undefined) f.ref = fields.ref;
      if (fields.imp !== undefined) f.imp = fields.imp;
    }
    this.facts.set(f.id, f);
    if (kind === 'chief') { this.chiefFacts++; this.lastChief = f; }
    if (this.metrics) this.metrics.onFact(f);
    if (this.bus.has('fact')) this.bus.emit('fact', f);
    return f;
  }

  learn(r, f, src, from = -1, opts) {
    if (!r || !r.alive) return null;
    const m = remember(this, r, f, src, from, opts);
    if (m && (src === SRC_DID || src === SRC_SEEN) && f.imp >= 25) this.lifelog(r, f.k, f.a === r.id ? f.b : f.a, f.p, f.n, f.id);
    return m;
  }

  /** everyone present at place p sees fact f (actors a / b did it) */
  witness(f, p, a = -1, b = -1) {
    if (a >= 0) this.learn(this.people[a], f, SRC_DID);
    if (b >= 0 && b !== a) this.learn(this.people[b], f, SRC_DID);
    if (!p) return;
    for (let i = 0; i < p.here.length; i++) {
      const id = p.here[i];
      if (id === a || id === b) continue;
      const r = this.people[id];
      if (r.state === S_SLEEP) continue;
      this.learn(r, f, SRC_SEEN);
    }
  }

  lifelog(r, kind, other, place, extra, fid) {
    const L = r.log;
    if (L.length >= 40) L.shift();
    L.push([this.clock.day, kind, other === undefined ? -1 : other, place === undefined ? -1 : place, extra === undefined ? 0 : extra, fid || 0, this.clock.minute]);
  }

  factMaybeDead(f) { if (f.knowers <= 0 && f.pinned <= 0) this.deadFacts.push(f); }

  gcFacts() {
    const keepRefs = new Set();
    for (const f of this.facts.values()) if (f.ref && (f.knowers > 0 || f.pinned > 0)) keepRefs.add(f.ref);
    for (const f of this.deadFacts) {
      if (f.knowers > 0 || f.pinned > 0 || keepRefs.has(f.id)) continue;
      if (this.clock.day - f.day < 2) continue;
      if (this.lastChief === f) continue;
      this.facts.delete(f.id);
    }
    this.deadFacts = this.deadFacts.filter((f) => this.facts.has(f.id) && f.knowers <= 0);
    // weekly full sweep (facts nobody remembers any more)
    if (this.clock.day % 7 === 0) {
      for (const f of this.facts.values()) if (f.knowers <= 0 && f.pinned <= 0 && !keepRefs.has(f.id) && this.clock.day - f.day >= 3 && this.lastChief !== f) this.facts.delete(f.id);
    }
  }

  jobTag(r) { const J = JOBS[r.job]; return J ? J.tag : null; }

  avgMood() {
    if (!this.alive.length) return 0;
    let s = 0;
    for (const r of this.alive) s += r.mood;
    return s / this.alive.length;
  }

  // ================================================================ conversations out
  onTalk(talk) {
    const mode = this.cfg.textMode;
    const vis = this.visible;
    if (mode === 'all' || (mode === 'visible' && vis && (vis(talk.a) || (talk.b >= 0 && vis(talk.b))))) this.dialogue.realize(talk, this.cfg.lang);
    // remember notable conversations in the life log (for diaries)
    if (!talk.shout) {
      let notable = null;
      for (const b of talk.beats) if (b.topic && /^(rumor|congrats|comfort|romance|quarrel|reconcile|invite|recall|own|ask)/.test(b.topic)) { notable = b; break; }
      if (notable) {
        const fid = notable.f ? notable.f.id : 0;
        const tp = notable.topic.split(':')[0];
        this.lifelog(this.people[talk.a], 'talk', talk.b, talk.placeIdx, tp, fid);
        if (talk.b >= 0) this.lifelog(this.people[talk.b], 'talk', talk.a, talk.placeIdx, tp, fid);
      }
    }
    if (talk.lines) {
      // quote of the day candidates: jokes and funny reactions said in town
      for (const l of talk.lines) if (/^(joke|react\.funny|small\.weather|sweet|flirt\.re)/.test(l.rule) && l.text.length <= 40) { this.quotes.push({ who: l.who, text: l.text, day: this.clock.day }); if (this.quotes.length > 12) this.quotes.shift(); }
    }
    if (this.metrics) this.metrics.onTalk(talk, this);
    if (this.bus.has('talk')) this.bus.emit('talk', talk);
  }

  quotePick() {
    const q = this.quotes.filter((x) => x.day >= this.clock.day - 1 && this.people[x.who] && this.people[x.who].alive);
    return q.length ? q[(this.clock.day * 7) % q.length] : null;
  }

  // ================================================================ public API
  on(name, fn, ctx) { this.bus.on(name, fn, ctx); return this; }
  off(name, fn, ctx) { this.bus.off(name, fn, ctx); return this; }

  /** fn(residentId) -> true when the resident is on screen (their talks get text in 'visible' mode) */
  setVisible(fn) { this.visible = fn; }
  setLang(lang) { this.cfg.lang = lang === 'en' ? 'en' : 'ko'; }
  setToggles(t) {
    if (t.incidents !== undefined) this.cfg.incidents = !!t.incidents;
    if (t.lifeEvents !== undefined) this.cfg.lifeEvents = !!t.lifeEvents;
    if (t.farewell !== undefined) this.cfg.farewell = !!t.farewell;
    if (!this.cfg.incidents) { this.sched = this.sched.filter((s) => s[1] !== 'incident'); }
  }
  setPrices(map) { this.cfg.gamePrices = true; this.world.setPrices(map); }
  setWeather(kind, temp) { this.weather.set(kind, temp); }
  ack(incidentId) { this.incidents.ack(incidentId); }

  /**
   * the game reports something that happened in its world:
   *   report('chief', { what: 'built', target: { ko: '물류센터', en: 'the logistics centre' }, place: 'logistics' })
   *   report('pet', { pet: 0, antic: 2, place: 'plaza' })     report('train', { passengers: 40, news: 0 })
   *   report('fire', { place: 'home_12' })                   report('fact', { kind, a, b, place, item, n })
   */
  report(kind, data = {}) {
    const W = this.world;
    const p = data.place !== undefined ? W.get(data.place) : null;
    let f = null;
    if (kind === 'chief') {
      const t = data.target || {};
      const ko = typeof t === 'string' ? t : t.ko || '', en = typeof t === 'string' ? t : t.en || ko;
      f = this.fact('chief', { s: (data.what || 'other') + '|' + ko + '|' + en, p: p ? p.idx : -1 });
      this.witness(f, p);
      // the chief's deeds get noticed: a few residents hear about it right away
      for (const r of this.alive) if (this.rng.chance(0.06)) this.learn(r, f, SRC_SEEN);
    } else if (kind === 'pet') f = this.fact('pet', { n: data.pet || 0, i: data.antic !== undefined ? data.antic : this.rng.int(6), p: p ? p.idx : -1 });
    else if (kind === 'train') f = this.fact('train', { n: data.news || 0, i: data.passengers || 20, p: p ? p.idx : W.first('station') ? W.first('station').idx : -1 });
    else if (kind === 'fire') return this.incidents.fire(p ? p.idx : undefined, data.cause);
    else if (kind === 'theft') return this.incidents.theft();
    else if (kind === 'fact') f = this.fact(data.kind, { a: data.a, b: data.b, c: data.c, p: p ? p.idx : -1, i: data.item, n: data.n, s: data.s });
    if (f && p && kind !== 'chief') this.witness(f, p);
    return f;
  }

  /** the chief taps a resident: 1–2 lines addressed to the chief (a rumour, a question, small talk) */
  talkTo(id, lang = this.cfg.lang) {
    const r = this.people[id];
    if (!r || !r.alive) return null;
    const beats = [];
    const mk = (rule, topic) => { const b = new Beat(); b.w = r.id; b.to = CHIEF; b.r = rule; b.topic = topic; beats.push(b); return b; };
    let b = mk('chief.greet', 'chief');
    b.an = 'wave'; b.em = 'emote_heart';
    const tell = this.social.pickTellableForChief(r);
    if (tell) { b = mk('rumor.' + tell.f.k, 'rumor:' + tell.f.k); this.social.setVersion(b, tell); b.em = tell.f.v < 0 ? 'emote_exclaim' : 'emote_heart'; }
    else if (r.qs.length) { const q = r.qs[0]; b = mk('ask.' + q.k + (q.f ? '.' + q.f.k : ''), 'ask:' + q.k); b.f = q.f; b.o = q.o; b.i = q.k === 'price' || q.k === 'buy' ? q.o : -1; b.em = 'emote_question'; }
    else { b = mk('chief.small', 'small'); b.h = r.likes[0]; }
    const talk = { id: this.talkSeq++, a: r.id, b: CHIEF, place: r.loc >= 0 ? this.world.places[r.loc].id : null, placeIdx: r.loc, start: this.now, dur: beats.length * this.cfg.lineTime, beats, lines: null, topics: [], chief: true };
    this.dialogue.realize(talk, lang);
    return talk;
  }

  // ---------------------------------------------------------------- queries
  resident(id) { return this.people[id] || null; }
  relationship(a, b) {
    const rel = getRel(this, a, b);
    if (!rel) return { stage: 'stranger', familiarity: 0, affinity: 0, romance: 0 };
    return { stage: ['stranger', 'acquaintance', 'friend', 'best friend', 'sweetheart', 'engaged', 'spouse'][rel.stage], familiarity: rel.fam, affinity: rel.aff, romance: rel.rom,
      rival: !!(rel.flags & RF_RIVAL), family: !!(rel.flags & RF_FAMILY), talks: rel.n, metDay: rel.met };
  }
  friends(id, min = ST_FRIEND) { const r = this.people[id]; return r ? friendsOf(this, r, min) : []; }
  /** recent memories of a resident, strongest / newest first */
  memories(id, n = 8) {
    const r = this.people[id];
    if (!r) return [];
    return r.mem.slice().sort((a, b) => b.t - a.t || b.s - a.s).slice(0, n).map((m) => this.describeMem(r, m));
  }
  describeMem(r, m) {
    return { fact: m.f.id, kind: m.f.k, day: m.f.day, source: ['seen', 'did', 'told', 'newspaper', 'asked'][m.src], from: m.from, strength: m.s, exaggeration: m.x, distortion: ['', 'place', 'item', 'who', 'count'][m.d], longTerm: !!m.lt, told: m.told,
      a: m.f.a, b: m.f.b, place: m.f.p >= 0 ? this.world.places[m.f.p].id : null };
  }
  /** what is being said about resident id (rumours in town, with how many know them) */
  rumorsAbout(id) {
    const out = [];
    for (const f of this.facts.values()) if ((f.a === id || f.b === id) && f.knowers > 0 && FACT_KINDS[f.k].imp >= 30) out.push({ fact: f.id, kind: f.k, day: f.day, knowers: f.knowers, reach: f.reach });
    out.sort((a, b) => b.knowers - a.knowers || b.fact - a.fact);
    return out;
  }
  newspaper(lang = this.cfg.lang) { const p = this.news.latest(); return p ? this.dialogue.paperText(p, lang) : null; }
  diary(id, day = this.clock.day, lang = this.cfg.lang) { const r = this.people[id]; return r ? this.dialogue.diary(r, day, lang) : []; }
  wantedBoard() { return this.incidents.posters.map((id) => { const I = this.incidents.active.find((x) => x.id === id); return I ? { incident: I.id, who: I.culprit, item: I.item, reward: I.wantedFact ? I.wantedFact.n : 0 } : null; }); }
  passbook(id) { const r = this.people[id]; if (!r) return null; return { wallet: r.wallet, savings: r.savings, loans: this.bank.loansOf(r).map((l) => ({ id: l.id, purpose: l.purpose, balance: l.bal, instalment: l.inst, missed: l.missed, paused: !!l.paused })) }; }
  name(id, lang = this.cfg.lang) { const r = this.people[id]; if (!r) return ''; return lang === 'en' ? this.dialogue.nameEn(r) : r.title && !r.given ? r.title : (r.sur || '') + r.given; }

  stats() {
    return { day: this.clock.day, residents: this.alive.length, households: this.households.size, facts: this.facts.size, pairs: this.pairs.size,
      social: this.social.stats, incidents: this.incidents.stats, life: this.life.stats, bank: Object.assign({}, this.bank.stats, this.bank.totals()), econ: this.econ.stats,
      jobs: this.jobs.stats, news: this.news.stats, dialogue: this.dialogue.stats };
  }

  // ---------------------------------------------------------------- save
  serialize() { return doSerialize(this); }
  deserialize(s) { doDeserialize(this, s); }
}

function pickCfg(o) {
  const out = {};
  for (const k in DEFAULTS) if (o[k] !== undefined) out[k] = o[k];
  return out;
}

export function createStory(opts) { return new StoryEngine(opts); }
