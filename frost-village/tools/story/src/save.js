// Compact save: every piece of state is an integer or a string, written as varints (zig-zag for
// signed) with a string table, then base64. Round-trips exactly, so a loaded town continues to live
// identically (same seed state, same orders of lists and maps). Only the speakers' short-term phrasing
// memory (which template / line they used last) is not stored, so lines after a load may be worded a
// little differently — the story itself (who meets whom, what they say about what) is the same.

import { Resident, Household } from './people.js';
import { Fact, Mem } from './memory.js';
import { Rel, pairKey } from './relations.js';
import { Loan } from './bank.js';

const MAGIC = 0x46565331; // 'FVS1'
const VERSION = 2;          // 2: + pending day-change pieces, sub-step clock, shop credit, loan reschedules, ack waits

// ---------------------------------------------------------------- byte codec
class Writer {
  constructor() { this.buf = new Uint8Array(1 << 16); this.pos = 0; this.strs = new Map(); this.list = []; }
  grow(n) { if (this.pos + n > this.buf.length) { const b = new Uint8Array(Math.max(this.buf.length * 2, this.pos + n + 1024)); b.set(this.buf.subarray(0, this.pos)); this.buf = b; } }
  u(n) {
    if (!(n >= 0)) n = 0;
    n = Math.floor(n);
    this.grow(10);
    while (n >= 128) { this.buf[this.pos++] = (n % 128) | 128; n = Math.floor(n / 128); }
    this.buf[this.pos++] = n;
  }
  i(n) { n = Math.round(n || 0); this.u(n >= 0 ? n * 2 : -n * 2 - 1); }
  b(v) { this.u(v ? 1 : 0); }
  s(str) {
    if (str === null || str === undefined) { this.u(0); return; }
    str = String(str);
    let k = this.strs.get(str);
    if (k === undefined) { k = this.list.length + 1; this.strs.set(str, k); this.list.push(str); }
    this.u(k);
  }
  ints(a) { this.u(a.length); for (let k = 0; k < a.length; k++) this.i(a[k]); }
}

class Reader {
  constructor(bytes) { this.buf = bytes; this.pos = 0; this.list = [null]; }
  u() { let n = 0, mul = 1, b; do { b = this.buf[this.pos++]; n += (b & 127) * mul; mul *= 128; } while (b & 128); return n; }
  i() { const z = this.u(); return z % 2 === 0 ? z / 2 : -(z + 1) / 2; }
  b() { return this.u() === 1; }
  s() { return this.list[this.u()]; }
  ints() { const n = this.u(), a = new Array(n); for (let k = 0; k < n; k++) a[k] = this.i(); return a; }
}

function toBase64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length).toString('base64');
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64(str) {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(str, 'base64'));
  const s = atob(str), out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// ---------------------------------------------------------------- serialize
export function serialize(e) {
  const w = new Writer();
  w.s(JSON.stringify(e.cfg));
  w.ints(e.rng.getState());
  w.u(e.now); w.u(0);
  w.u(e.nextPersonId); w.u(e.nextHH); w.u(e.nextFactId); w.u(e.talkSeq); w.u(e.chiefFacts); w.i(e.lastChief ? e.lastChief.id : -1);
  w.i(e.newestShop); w.u(e.initialPop); w.i(e.upkeepI);
  // weather
  const wx = e.weather.today;
  w.s(wx.kind); w.i(wx.temp); w.b(wx.first); w.b(wx.aurora); w.u(e.weather.heavyDays); w.s(e.weather.forced ? JSON.stringify(e.weather.forced) : null);
  // world
  const W = e.world;
  w.ints(W.prices); w.ints(W.basePrices); w.ints(W.priceDelta);
  w.u(W.plots.length);
  for (const pl of W.plots) { w.s(pl.id); w.s(pl.size); w.i(pl.x); w.i(pl.y); }
  w.u(W.places.length);
  for (const p of W.places) {
    w.s(p.id); w.s(p.kind); w.s(p.name ? p.name.ko : null); w.s(p.name ? p.name.en : null); w.i(p.x); w.i(p.y); w.u(p.cap);
    w.i(p.owner); w.i(p.hh); w.u(p.state); w.i(p.stateT); w.u(p.level); w.b(p.insured); w.i(p.stock); w.i(p.stockMax); w.i(p.till);
    w.u(p.jobs.length); for (const [j, n] of p.jobs) { w.s(j); w.u(n); }
    w.i(p.built); w.s(p.plot || null); w.ints(p.residents); w.ints(p.here);
  }
  // facts (in map order)
  w.u(e.facts.size);
  for (const f of e.facts.values()) {
    w.u(f.id); w.s(f.k); w.i(f.day); w.i(f.sec); w.i(f.a); w.i(f.b); w.i(f.c); w.i(f.p); w.i(f.i); w.i(f.n); w.s(f.s || null);
    w.i(f.v); w.u(f.imp); w.u(f.ref); w.i(f.st); w.u(f.knowers); w.u(f.reach); w.i(f.firstAt); w.u(f.maxHop); w.i(f.pinned);
  }
  w.u(e.deadFacts.length); for (const f of e.deadFacts) w.u(f.id);
  // relationships (in map order); residents refer to them by index
  const relIdx = new Map();
  w.u(e.pairs.size);
  let ri = 0;
  for (const rel of e.pairs.values()) {
    relIdx.set(rel, ri++);
    w.u(rel.a); w.u(rel.b); w.i(rel.fam); w.i(rel.aff); w.i(rel.rom); w.u(rel.stage); w.u(rel.flags); w.i(rel.met); w.i(rel.last); w.u(rel.n); w.u(rel.fights); w.i(rel.sweetDay || 0);
  }
  // people (alive ones in full, departed ones as identity only)
  w.u(e.people.length);
  for (let id = 0; id < e.people.length; id++) {
    const r = e.people[id];
    if (!r) { w.u(0); continue; }
    w.u(r.alive ? 2 : 1);
    w.u(r.flags); w.s(r.key); w.s(r.persona); w.s(r.given); w.s(r.sur); w.s(r.title); w.s(r.titleEn); w.b(r.male); w.i(r.birth); w.i(r.goneDay);
    w.ints(r.parents); w.ints(r.kids); w.i(r.spouse); w.s(r.job);
    if (!r.alive) continue;
    w.ints(r.tr); w.ints(r.likes); w.u(r.dislike);
    w.i(r.work); w.i(r.home); w.i(r.hh); w.i(r.wallet); w.i(r.savings); w.i(r.intAcc);
    w.i(r.mood); w.i(r.hunger); w.i(r.energy); w.i(r.socialNeed); w.i(r.fun); w.i(r.unhappy); w.i(r.jobless);
    w.i(r.loc); w.i(r.hereI); w.i(r.dest); w.u(r.destAct); w.i(r.arriveAt); w.u(r.state); w.i(r.busyUntil);
    w.ints(Array.prototype.slice.call(r.plan, 0, r.planN)); w.u(r.planI); w.i(r.planDay);
    // memories
    w.u(r.mem.length);
    for (const m of r.mem) { w.u(m.f.id); w.u(m.src); w.i(m.from); w.i(m.s); w.u(m.x); w.u(m.d); w.i(m.alt); w.i(m.t); w.u(m.told); w.u(m.heard); w.u(m.lt); w.u(m.h); w.ints(m.tt); }
    w.u(r.qs.length);
    for (const q of r.qs) { w.s(q.k); w.u(q.f ? q.f.id : 0); w.i(q.o); w.i(q.t); w.u(q.n); }
    w.u(r.adj.length); for (const rel of r.adj) w.u(relIdx.get(rel));
    // (r.recent / rel.ring — the speakers' short-term phrasing memory — are not saved: text only)
    w.u(r.log.length);
    for (const L of r.log) { w.i(L[0]); w.s(L[1]); w.i(L[2]); w.i(L[3]); if (typeof L[4] === 'string') { w.u(1); w.s(L[4]); } else { w.u(0); w.i(L[4]); } w.u(L[5]); w.i(L[6]); }
    w.s(r.dream); w.i(r.crushOn); w.u(r.agenda.length); for (const a of r.agenda) w.ints(a);
    w.i(r.readDay); w.i(r.lastTalk); w.i(r.wanted); w.i(r.jailUntil); w.i(r.stayWith); w.i(r.leaveDay); w.u(r.talks);
    w.i(r.workedDay); w.s(r.bigBuy); w.s(r.loanWant ? JSON.stringify(r.loanWant) : null); w.i(r.dreamShop); w.i(r.lastBuy);
    w.i(r.lastGroup); w.i(r.arrived); w.i(r.widowed); w.i(r.lastBaby);
  }
  // households (map order)
  w.u(e.households.size);
  for (const hh of e.households.values()) { w.u(hh.id); w.ints(hh.members); w.i(hh.home); w.i(hh.since); w.i(hh.unhappy); w.i(hh.planOut); w.s(hh.why || ''); }
  // alive order
  w.ints(e.alive.map((r) => r.id));
  // schedule
  w.u(e.sched.length);
  for (const [at, kind, data] of e.sched) { w.i(at); w.s(kind); w.s(JSON.stringify(data)); }
  // bank
  const B = e.bank;
  w.u(B.nextLoan); w.u(B.depositBp); w.u(B.loanBp);
  w.u(B.loans.length);
  for (const L of B.loans) { w.u(L.id); w.i(L.who); w.s(L.purpose); w.i(L.principal); w.i(L.bal); w.i(L.inst); w.i(L.start); w.i(L.term); w.i(L.missed); w.u(L.paused); w.i(L.acc); w.u(L.done); w.i(L.target); }
  // incidents
  const In = e.incidents;
  w.u(In.nextId); w.ints(In.posters);
  w.u(In.active.length);
  for (const I of In.active) {
    w.u(I.id); w.s(I.kind); w.s(I.phase); w.i(I.t); w.i(I.next); w.i(I.place); w.i(I.building); w.i(I.culprit); w.i(I.victim);
    w.ints(I.officers); w.ints(I.crew); w.ints(I.witnesses); w.i(I.item); w.i(I.cause); w.u(I.fact ? I.fact.id : 0); w.ints(I.facts);
    w.s(I.outcome || ''); w.i(I.poster); w.i(I.data); w.i(I.burnSince || 0); w.u(I.wantedFact ? I.wantedFact.id : 0);
  }
  // newspapers, quotes
  w.u(e.news.papers.length);
  for (const p of e.news.papers) w.s(JSON.stringify({ day: p.day, head: p.head ? p.head.id : 0, items: p.items.map((f) => f.id), weather: p.weather, prices: p.prices, rate: p.rate, wanted: p.wanted.map((f) => f.id), reporter: p.reporter, quote: null, no: p.no }));
  w.s('[]');   // overheard quotes are text (wording), not story state: not saved
  // statistics
  w.s(JSON.stringify({ social: e.social.stats, incidents: In.stats, life: e.life.stats, bank: B.stats, econ: e.econ.stats, jobs: e.jobs.stats, news: e.news.stats }));
  // v2: state that used to be flushed before saving (a save no longer changes the story), and newer fields
  const owed = [];
  for (const p of W.places) if (p.owed) owed.push(p.idx, p.owed);
  w.s(JSON.stringify({
    accUs: e.accUs, dayQ: e.dayQ, nightI: e.nightI, nightIds: e.nightIds, owed,
    restr: B.loans.map((L) => L.restr || 0), ack: In.active.map((I) => (I.ackWait ? 1 : 0) | (I.acked ? 2 : 0)), wait: In.active.map((I) => I.waitUntil || 0),
  }));
  // assemble: magic, version, string table, body
  const head = new Writer();
  head.u(MAGIC); head.u(VERSION); head.u(w.list.length);
  const enc = new TextEncoder();
  for (const str of w.list) { const bytes = enc.encode(str); head.u(bytes.length); head.grow(bytes.length); head.buf.set(bytes, head.pos); head.pos += bytes.length; }
  const out = new Uint8Array(head.pos + w.pos);
  out.set(head.buf.subarray(0, head.pos), 0);
  out.set(w.buf.subarray(0, w.pos), head.pos);
  return toBase64(out);
}

// ---------------------------------------------------------------- deserialize
export function deserialize(e, str) {
  const bytes = fromBase64(str);
  const r = new Reader(bytes);
  if (r.u() !== MAGIC) throw new Error('story: not a story save');
  const ver = r.u();
  if (ver !== VERSION && ver !== 1) throw new Error('story: unsupported save version ' + ver);
  const nStr = r.u();
  const dec = new TextDecoder();
  for (let k = 0; k < nStr; k++) { const len = r.u(); r.list.push(dec.decode(bytes.subarray(r.pos, r.pos + len))); r.pos += len; }
  const cfg = JSON.parse(r.s());
  Object.assign(e.cfg, cfg);
  e.rng.setState(r.ints());
  e.now = r.u(); e.accUs = r.u() * 1000;
  e.nextPersonId = r.u(); e.nextHH = r.u(); e.nextFactId = r.u(); e.talkSeq = r.u(); e.chiefFacts = r.u();
  const lastChiefId = r.i();
  e.newestShop = r.i(); e.initialPop = r.u(); e.upkeepI = r.i();
  e.updateClock();
  e.weather.today = { kind: r.s(), temp: r.i(), first: r.b(), aurora: r.b() };
  e.weather.heavyDays = r.u();
  const forced = r.s(); e.weather.forced = forced ? JSON.parse(forced) : null;
  const W = e.world;
  W.prices.set(r.ints()); W.basePrices.set(r.ints()); W.priceDelta.set(r.ints());
  const np = r.u();
  for (let k = 0; k < np; k++) W.addPlot({ id: r.s(), size: r.s(), x: r.i(), y: r.i() });
  const nPl = r.u();
  for (let k = 0; k < nPl; k++) {
    const id = r.s(), kind = r.s(), nko = r.s(), nen = r.s(), x = r.i(), y = r.i(), cap = r.u();
    const p = W.addPlace({ id, kind, x, y, cap, name: nko || nen ? { ko: nko, en: nen } : null });
    p.cap = cap;
    p.owner = r.i(); p.hh = r.i(); p.state = r.u(); p.stateT = r.i(); p.level = r.u(); p.insured = r.b(); p.stock = r.i(); p.stockMax = r.i(); p.till = r.i();
    const nj = r.u(); p.jobs = []; for (let j = 0; j < nj; j++) p.jobs.push([r.s(), r.u()]);
    p.built = r.i(); const plot = r.s(); if (plot) p.plot = plot;
    p.residents = r.ints(); p.here = r.ints();
  }
  // facts
  const nf = r.u();
  for (let k = 0; k < nf; k++) {
    const id = r.u(), kind = r.s();
    const f = new Fact(id, kind);
    f.day = r.i(); f.sec = r.i(); f.a = r.i(); f.b = r.i(); f.c = r.i(); f.p = r.i(); f.i = r.i(); f.n = r.i(); f.s = r.s() || '';
    f.v = r.i(); f.imp = r.u(); f.ref = r.u(); f.st = r.i(); f.knowers = r.u(); f.reach = r.u(); f.firstAt = r.i(); f.maxHop = r.u(); f.pinned = r.i();
    e.facts.set(id, f);
  }
  e.lastChief = lastChiefId >= 0 ? e.facts.get(lastChiefId) || null : null;
  const nd = r.u(); e.deadFacts = []; for (let k = 0; k < nd; k++) { const f = e.facts.get(r.u()); if (f) e.deadFacts.push(f); }
  // relationships
  const nRel = r.u();
  const rels = new Array(nRel);
  for (let k = 0; k < nRel; k++) {
    const rel = new Rel(r.u(), r.u());
    rel.fam = r.i(); rel.aff = r.i(); rel.rom = r.i(); rel.stage = r.u(); rel.flags = r.u(); rel.met = r.i(); rel.last = r.i(); rel.n = r.u(); rel.fights = r.u();
    const sd = r.i(); if (sd) rel.sweetDay = sd;
    rels[k] = rel;
    e.pairs.set(pairKey(rel.a, rel.b), rel);
  }
  // people
  const nP = r.u();
  e.people = new Array(nP);
  for (let id = 0; id < nP; id++) {
    const tag = r.u();
    if (!tag) continue;
    const p = new Resident(id);
    e.people[id] = p;
    p.flags = r.u(); p.key = r.s(); p.persona = r.s(); p.given = r.s() || ''; p.sur = r.s() || ''; p.title = r.s(); p.titleEn = r.s(); p.male = r.b(); p.birth = r.i(); p.goneDay = r.i();
    p.parents = r.ints(); p.kids = r.ints(); p.spouse = r.i(); p.job = r.s();
    if (tag === 1) { p.alive = false; p.state = 6; continue; }
    p.tr.set(r.ints()); p.likes = r.ints(); p.dislike = r.u();
    p.work = r.i(); p.home = r.i(); p.hh = r.i(); p.wallet = r.i(); p.savings = r.i(); p.intAcc = r.i();
    p.mood = r.i(); p.hunger = r.i(); p.energy = r.i(); p.socialNeed = r.i(); p.fun = r.i(); p.unhappy = r.i(); p.jobless = r.i();
    p.loc = r.i(); p.hereI = r.i(); p.dest = r.i(); p.destAct = r.u(); p.arriveAt = r.i(); p.state = r.u(); p.busyUntil = r.i();
    const plan = r.ints(); p.plan.set(plan); p.planN = plan.length; p.planI = r.u(); p.planDay = r.i();
    const nm = r.u();
    for (let k = 0; k < nm; k++) {
      const m = new Mem();
      m.f = e.facts.get(r.u()); m.src = r.u(); m.from = r.i(); m.s = r.i(); m.x = r.u(); m.d = r.u(); m.alt = r.i(); m.t = r.i(); m.told = r.u(); m.heard = r.u(); m.lt = r.u(); m.h = r.u(); m.tt = r.ints();
      if (m.f) p.mem.push(m);
    }
    const nq = r.u();
    for (let k = 0; k < nq; k++) { const kk = r.s(), fid = r.u(), o = r.i(), t = r.i(), n = r.u(); p.qs.push({ k: kk, f: fid ? e.facts.get(fid) || null : null, o, t, n }); }
    const na = r.u(); for (let k = 0; k < na; k++) p.adj.push(rels[r.u()]);
    const nl = r.u();
    for (let k = 0; k < nl; k++) { const L = [r.i(), r.s(), r.i(), r.i(), 0, 0, 0]; L[4] = r.u() === 1 ? r.s() : r.i(); L[5] = r.u(); L[6] = r.i(); p.log.push(L); }
    p.dream = r.s(); p.crushOn = r.i(); const ng = r.u(); for (let k = 0; k < ng; k++) p.agenda.push(r.ints());
    p.readDay = r.i(); p.lastTalk = r.i(); p.wanted = r.i(); p.jailUntil = r.i(); p.stayWith = r.i(); p.leaveDay = r.i(); p.talks = r.u();
    p.workedDay = r.i(); p.bigBuy = r.s(); const lw = r.s(); p.loanWant = lw ? JSON.parse(lw) : null; p.dreamShop = r.i(); p.lastBuy = r.i();
    p.lastGroup = r.i(); p.arrived = r.i(); p.widowed = r.i(); p.lastBaby = r.i();
  }
  // households
  const nh = r.u();
  for (let k = 0; k < nh; k++) { const hh = new Household(r.u()); hh.members = r.ints(); hh.home = r.i(); hh.since = r.i(); hh.unhappy = r.i(); hh.planOut = r.i(); hh.why = r.s() || undefined; e.households.set(hh.id, hh); }
  e.alive = r.ints().map((id) => e.people[id]);
  e.usedNames = new Set(e.alive.map((p) => p.given));
  // schedule
  const ns = r.u();
  e.sched = [];
  for (let k = 0; k < ns; k++) e.sched.push([r.i(), r.s(), JSON.parse(r.s())]);
  // bank
  const B = e.bank;
  B.nextLoan = r.u(); B.depositBp = r.u(); B.loanBp = r.u();
  const nL = r.u();
  B.loans = [];
  for (let k = 0; k < nL; k++) { const L = new Loan(r.u()); L.who = r.i(); L.purpose = r.s(); L.principal = r.i(); L.bal = r.i(); L.inst = r.i(); L.start = r.i(); L.term = r.i(); L.missed = r.i(); L.paused = r.u(); L.acc = r.i(); L.done = r.u(); L.target = r.i(); B.loans.push(L); }
  // incidents
  const In = e.incidents;
  In.nextId = r.u(); In.posters = r.ints();
  const ni = r.u();
  In.active = [];
  for (let k = 0; k < ni; k++) {
    const I = { id: r.u(), kind: r.s(), phase: r.s(), t: r.i(), next: r.i(), place: r.i(), building: r.i(), culprit: r.i(), victim: r.i(), officers: r.ints(), crew: r.ints(), witnesses: r.ints(), item: r.i(), cause: r.i(), fact: null, facts: [], outcome: '', poster: -1, data: 0 };
    const fid = r.u(); I.fact = fid ? e.facts.get(fid) || null : null;
    I.facts = r.ints(); I.outcome = r.s() || ''; I.poster = r.i(); I.data = r.i(); I.burnSince = r.i();
    const wf = r.u(); I.wantedFact = wf ? e.facts.get(wf) || null : null;
    In.active.push(I);
  }
  // newspapers, quotes
  const npap = r.u();
  e.news.papers = [];
  for (let k = 0; k < npap; k++) {
    const o = JSON.parse(r.s());
    const F = (id) => e.facts.get(id) || null;
    e.news.papers.push({ day: o.day, head: o.head ? F(o.head) : null, items: o.items.map(F).filter(Boolean), weather: o.weather, prices: o.prices, rate: o.rate, wanted: o.wanted.map(F).filter(Boolean), reporter: o.reporter, quote: o.quote, no: o.no });
  }
  e.quotes = JSON.parse(r.s());
  const st = JSON.parse(r.s());
  Object.assign(e.social.stats, st.social); Object.assign(In.stats, st.incidents); Object.assign(e.life.stats, st.life); Object.assign(B.stats, st.bank);
  Object.assign(e.econ.stats, st.econ); Object.assign(e.jobs.stats, st.jobs); Object.assign(e.news.stats, st.news);
  if (ver >= 2) {
    const x = JSON.parse(r.s());
    e.accUs = x.accUs || 0;
    e.dayQ = x.dayQ || [];
    e.nightI = x.nightI === undefined ? -1 : x.nightI;
    e.nightIds = x.nightIds || null;
    for (let k = 0; k + 1 < (x.owed || []).length; k += 2) W.places[x.owed[k]].owed = x.owed[k + 1];
    (x.restr || []).forEach((n, k) => { if (B.loans[k]) B.loans[k].restr = n; });
    (x.ack || []).forEach((a, k) => { const I = In.active[k]; if (I) { I.ackWait = !!(a & 1); I.acked = !!(a & 2); I.waitUntil = (x.wait || [])[k] || 0; } });
  }
}
