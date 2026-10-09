// Social life: who meets whom (residents present at the same place), what they talk about (rumours
// from memory, questions, congratulations, shared memories, small talk, romance, quarrels, jokes,
// invitations), how a rumour changes when it is retold (exaggeration, wrong place / item / count,
// forgetting who), what a conversation does to the relationship, and the small happenings of daily
// life (a slip on the ice, a giant snowman, the dog stealing a mitten …) that feed the stories.

import { getRel, ensureRel, stageFor, clampRel, ST_NONE, ST_ACQ, ST_FRIEND, ST_BEST, ST_SWEET, ST_ENGAGED, ST_SPOUSE,
  RF_RIVAL, RF_CRUSH_A, RF_CRUSH_B, RF_FAMILY, RF_COWORK, RF_CLASS, RF_NEIGHBOR } from './relations.js';
import { remember, findMem, novelty, SRC_SEEN, SRC_DID, SRC_TOLD, SRC_NEWS, SRC_ASKED, D_NONE, D_PLACE, D_ITEM, D_ANON, D_COUNT } from './memory.js';
import { G_TODDLER, G_KID, G_TEEN, G_ADULT, G_ELDER, S_IDLE, F_NEWCOMER, F_OWNER, groupOf, ageOf } from './people.js';
import { COND } from '../lang/conds.js';
import { ITEMS } from '../data/items.js';
import { LIKES } from '../data/traits.js';
import { FACT_KINDS } from '../data/facts.js';
import { B_OK } from './world.js';

// which distortions make sense for a kind of fact
const DISTORT = {
  theft: [D_PLACE, D_ITEM, D_ANON, D_COUNT], window: [D_ANON, D_PLACE], prank: [D_ANON, D_PLACE], queue_jump: [D_ANON, D_PLACE],
  scuffle: [D_PLACE], fire: [D_PLACE], ruin: [D_PLACE], slip: [D_PLACE], pet: [D_PLACE], snowman: [D_PLACE, D_COUNT],
  lost_found: [D_ITEM, D_PLACE], bigcatch: [D_COUNT], delivery: [D_ITEM, D_COUNT], big_buy: [D_ITEM], gift: [D_ITEM],
  burnt_food: [D_ITEM, D_COUNT], move_in: [D_COUNT], loan: [D_COUNT], deposit: [D_COUNT], train: [D_COUNT], concert: [D_PLACE],
};
// facts that are not gossiped about (private or too small)
const NO_GOSSIP = { deposit: 1, meet: 1, crush: 2, confess_no: 2, bank_help: 2, outing: 1, shop_plan: 0, move_plan: 0 };
// own facts worth telling a friend about (personal news)
const PERSONAL = { baby: 1, big_buy: 1, loan: 1, loan_paid: 1, deposit: 1, outing: 1, slip: 1, bigcatch: 1, gift: 1, lost_found: 1, new_job: 1, first_job: 1,
  shop_plan: 1, move_plan: 1, crush: 1, confess_no: 1, sweetheart: 1, engaged: 1, burnt_food: 1, prank: 1, snowman: 1, concert: 1, bank_help: 1, help: 1, retire: 1, housewarming: 1 };
// news about one's own family is told as one's own news ('our baby!'), never as gossip about a relative
const FAMILY_NEWS = { baby: 1, wedding: 1, engaged: 1, sweetheart: 1, move_in: 1, move_out: 1, move_plan: 1 };
const CONGRATS = { wedding: 1, engaged: 1, baby: 1, shop_open: 1, new_job: 1, first_job: 1, loan_paid: 1, rebuilt: 1, move_in: 1, bigcatch: 1, sweetheart: 1, retire: 1 };
const COMFORT = { theft: 1, ruin: 1, fire: 1, move_plan: 1, farewell: 1, window: 1, confess_no: 1 };
const RECALL = { outing: 1, snowman: 1, concert: 1, fire: 1, wedding: 1, slip: 1, prank: 1, meet: 1, gift: 1, help: 1, scuffle: 1, cat_rescue: 1, pet: 1, bigcatch: 1, housewarming: 1, reconcile: 1, arrest: 1 };
// follow-up questions after a rumour
const FOLLOW = { theft: 'caught', fire: 'hurt', ruin: 'after', engaged: 'when', baby: 'name', move_in: 'who', move_out: 'why', move_plan: 'why',
  shop_open: 'what', scuffle: 'why', wanted: 'who', window: 'who', arrest: 'after', loan: 'why', sweetheart: 'since', farewell: 'after' };

const SMALL = ['home', 'weather', 'prices', 'chief', 'pet', 'train', 'shop', 'work', 'hobby', 'family', 'bank', 'logistics', 'food', 'plans', 'news', 'town', 'health', 'school', 'play', 'oldtimes', 'dream', 'newcomer', 'season', 'sleep', 'money', 'fashion', 'music', 'snow'];

export class Beat {
  constructor() {
    this.w = -1; this.to = -1; this.r = ''; this.f = null;
    this.x = 0; this.d = 0; this.alt = -1; this.src = 0; this.from = -1;
    this.o = -1; this.p = -1; this.i = -1; this.h = -1; this.n = 0; this.s = '';
    this.fl = [];
    this.em = null; this.an = 'talk'; this.topic = '';
    this.nq = false;      // the line must not ask a question (a follow-up question comes next)
    this.q = -1; this.qk = 0;   // the other version's place (qk 1) or item (qk 2): '{Q} 말고 {P}'
  }
}

export class Social {
  constructor(e) {
    this.e = e;
    this.tmp = []; this.tmpW = [];
    this.ended = false;       // a row ends the conversation
    this.byeAt = -1;          // where the goodbyes of the current conversation start
    this.toldNow = [];        // stories (root fact ids) told in the current conversation
    this.askedNow = [];       // questions already asked in the current conversation
    this.stats = { talks: 0, beats: 0, intros: 0, gossip: 0, gossipNew: 0, distortions: 0, exaggerations: 0, questions: 0, answered: 0, dunno: 0,
      confessions: 0, confessYes: 0, proposals: 0, quarrels: 0, reconciles: 0, invites: 0, outings: 0, happenings: 0, topics: Object.create(null) };
    this.affAcc = 0;
  }

  free(r) { return r.alive && r.state === S_IDLE && r.busyUntil <= this.e.now && !r.jailUntil; }

  // ---------------------------------------------------------------- who talks to whom
  update() {
    const e = this.e, rng = e.rng, W = e.world, hour = e.clock.minute / 60;
    if (hour < 6 || hour > 22.5) return;
    const rate = e.cfg.talkRate * e.cfg.step;
    const free = this.tmp;
    for (let pi = 0; pi < W.places.length; pi++) {
      const p = W.places[pi];
      if (p.here.length < 2) continue;
      free.length = 0;
      for (let k = 0; k < p.here.length; k++) { const r = e.people[p.here[k]]; if (this.free(r) && groupOf(e, r) !== G_TODDLER) free.push(r); }
      if (free.length < 2) continue;
      const chance = Math.min(0.85, p.K.social * rate * (free.length - 1) * (p.cat === 'home' ? 1.6 : 1));
      if (!rng.chance(chance)) continue;
      // initiator: sociable and lonely people start talking
      const ws = this.tmpW;
      ws.length = 0;
      for (const r of free) ws.push(20 + r.tr[0] + r.socialNeed);
      const a = free[rng.weighted(ws, free.length)];
      const b = this.pickPartner(a, free, p);
      if (!b) continue;
      this.converse(a, b, p);
    }
  }

  pickPartner(a, free, p) {
    const e = this.e, rng = e.rng, ws = this.tmpW;
    ws.length = 0;
    const ga = groupOf(e, a);
    let known = 0, strange = 0;
    const early = e.clock.day < 3;
    for (const q of free) {
      if (q === a) { ws.push(0); continue; }
      const rel = getRel(e, a.id, q.id);
      let w = 1;
      const gq = groupOf(e, q);
      const ageW = ga === gq ? 1.6 : Math.abs(ga - gq) >= 2 ? 0.6 : 1;
      if (rel && rel.n > 0) {
        w += rel.fam / 220 + Math.max(0, rel.aff) / 300;
        if (rel.stage >= ST_SWEET) w += 3;
        if (rel.crushOf(a.id)) w += 4;
        if (rel.crushOf(q.id) && rel.aff > 200) w += 1.5;
        if (rel.flags & RF_RIVAL) w += 0.6;
        if (e.now - rel.last < e.cfg.dayLength * 0.08) w *= 0.15;   // just talked
        w *= ageW;
        known += w;
      } else {
        // strangers: curious / sociable people say hello; newcomers attract attention. Once the town has
        // settled in (day 3+) people mostly talk to people they know — a full introduction is an event
        w = (0.1 + (a.tr[0] + a.tr[3]) / 700) * (early ? 1 : 0.45) + (q.flags & F_NEWCOMER ? 0.9 : 0);
        w *= ageW;
        if (!(q.flags & F_NEWCOMER)) { strange += w; w = -w; }    // marked: may be scaled below
      }
      ws.push(w);
    }
    // a crowd of strangers (a busy plaza at the weekend) does not drown out the people one knows
    const cap = known > 0 ? known * (early ? 0.5 : 0.14) : strange;
    const k = strange > cap && strange > 0 ? cap / strange : 1;
    for (let i = 0; i < ws.length; i++) if (ws[i] < 0) ws[i] = -ws[i] * k;
    const i = rng.weighted(ws, free.length);
    return i >= 0 && free[i] !== a ? free[i] : null;
  }

  // ---------------------------------------------------------------- one conversation
  converse(a, b, place) {
    const e = this.e, rng = e.rng;
    // two strangers passing each other mostly just nod hello; newcomers, the curious and the chatty introduce themselves
    const had = getRel(e, a.id, b.id);
    if ((!had || (had.n === 0 && !(had.flags & RF_FAMILY))) && !((a.flags | b.flags) & F_NEWCOMER) && e.clock.day >= 2 && rng.chance(0.62 - (a.tr[0] + a.tr[3]) / 500)) return this.nod(a, b, place);
    const rel = ensureRel(e, a, b);
    const beats = [];
    this.affAcc = 0;
    this.toldNow.length = 0;
    this.askedNow.length = 0;
    const family = (rel.flags & RF_FAMILY) !== 0 || rel.stage === ST_SPOUSE;
    const first = rel.n === 0 && !family;
    if (first) this.intro(a, b, rel, beats);
    else this.greet(a, b, rel, beats, place);
    let turns = first ? (rng.chance(0.45) ? 1 : 0) : 1 + (rng.chance((a.tr[0] + b.tr[0]) / 260) ? 1 : 0) + (rng.chance(0.18) ? 1 : 0);
    if (rel.flags & RF_RIVAL) turns = Math.min(turns, 1);   // rivals do not chat on after a row
    let s = a, l = b;
    this.ended = false;
    for (let t = 0; t < turns && !this.ended; t++) {
      this.topic(s, l, rel, place, beats);
      if (rng.chance(0.65)) { const x = s; s = l; l = x; }
    }
    this.byeAt = beats.length;   // a confession or a proposal goes in before the goodbyes
    this.bye(a, b, rel, beats);
    // the relationship
    const compat = this.compat(a, b);
    if (first && e.life.canRomance(a, b, rel) && (a.tr[5] + b.tr[5]) > 120 && compat > 0.2 && rng.chance(0.25)) rel.rom += 160;
    rel.n++;
    rel.last = e.now;
    if (rel.met < 0) rel.met = e.clock.day;
    rel.fam += (first ? 45 : 22) + turns * 9 + (family ? 0 : 0);
    rel.aff += Math.round(compat * 34 + (rng.next() - 0.4) * 18 + this.affAcc);
    this.romance(a, b, rel, compat, beats);
    clampRel(rel);
    if (rel.aff < -260) rel.flags |= RF_RIVAL; else if (rel.aff > -80) rel.flags &= ~RF_RIVAL;
    const ns = stageFor(rel);
    if (ns > rel.stage && rel.stage < ST_SWEET) this.promote(a, b, rel, ns, place);
    else if (ns < rel.stage && rel.stage < ST_SWEET) rel.stage = ns;
    // needs
    for (const r of [a, b]) { r.socialNeed = Math.max(0, r.socialNeed - 22); r.mood = Math.min(100, r.mood + 2); r.talks++; r.lastTalk = e.now; }
    // timing: one spare line for a short answer the realizer may insert (lines are fitted into dur)
    const dur = (beats.length + 1) * e.cfg.lineTime;
    a.busyUntil = b.busyUntil = e.now + Math.ceil(dur);
    this.stats.talks++; this.stats.beats += beats.length;
    const talk = { id: e.talkSeq++, a: a.id, b: b.id, place: place.id, placeIdx: place.idx, start: e.now, dur, beats, lines: null, topics: this.topicsOf(beats) };
    e.onTalk(talk);
    return talk;
  }

  topicsOf(beats) {
    const out = [];
    for (const bt of beats) if (bt.topic && out.indexOf(bt.topic) < 0) out.push(bt.topic);
    return out;
  }

  beat(beats, w, to, rule, topic) {
    const b = new Beat();
    b.w = w.id; b.to = to.id; b.r = rule; b.topic = topic || '';
    beats.push(b);
    return b;
  }

  compat(a, b) {
    const t = a.tr, u = b.tr;
    let c = (t[1] + u[1]) / 200 - 0.35;
    for (const li of a.likes) if (b.likes.indexOf(li) >= 0) c += 0.28;
    if (a.likes.indexOf(b.dislike) >= 0 || b.likes.indexOf(a.dislike) >= 0) c -= 0.12;
    c -= Math.abs(t[9] - u[9]) / 400 + Math.abs(t[0] - u[0]) / 500;
    if (t[1] < 28) c -= 0.18;
    if (u[1] < 28) c -= 0.18;
    if (groupOf(this.e, a) === groupOf(this.e, b)) c += 0.15;
    return c;
  }

  // ---------------------------------------------------------------- openings & closings
  /** two strangers passing by: a nod and a hello (no introduction, no relationship yet) */
  nod(a, b, place) {
    const e = this.e, rng = e.rng;
    const beats = [];
    let bt = this.beat(beats, a, b, 'nod', 'nod'); bt.an = 'wave';
    if (rng.chance(0.7)) { bt = this.beat(beats, b, a, 'nod.re', 'nod'); bt.an = 'wave'; }
    this.stats.nods = (this.stats.nods || 0) + 1;
    const dur = beats.length * e.cfg.lineTime;
    a.busyUntil = b.busyUntil = e.now + Math.ceil(dur);
    const talk = { id: e.talkSeq++, a: a.id, b: b.id, place: place.id, placeIdx: place.idx, start: e.now, dur, beats, lines: null, topics: ['nod'] };
    e.onTalk(talk);
    return talk;
  }

  intro(a, b, rel, beats) {
    const e = this.e, rng = e.rng;
    this.stats.intros++;
    let bt = this.beat(beats, a, b, 'intro.hello', 'intro'); bt.em = 'emote_wave'; bt.an = 'wave';
    bt = this.beat(beats, b, a, 'intro.hello.re', 'intro'); bt.an = 'wave';
    bt = this.beat(beats, a, b, 'intro.self', 'intro'); bt.o = a.id; bt.p = a.work; bt.h = a.likes[0];
    bt = this.beat(beats, b, a, 'intro.self.re', 'intro'); bt.o = b.id; bt.p = b.work; bt.h = b.likes[0];
    if (a.likes.some((x) => b.likes.indexOf(x) >= 0) && rng.chance(0.6)) {
      const li = a.likes.find((x) => b.likes.indexOf(x) >= 0);
      bt = this.beat(beats, a, b, 'intro.samelike', 'intro'); bt.h = li; bt.em = 'emote_question';
      bt = this.beat(beats, b, a, 'intro.samelike.re', 'intro'); bt.h = li; bt.em = 'emote_heart';
      this.affAcc += 30;
    }
    if (rng.chance(0.3)) { bt = this.beat(beats, b, a, 'intro.end', 'intro'); bt.em = 'emote_heart'; }
    const f = e.fact('meet', { a: a.id, b: b.id, p: a.loc });
    e.learn(a, f, SRC_DID); e.learn(b, f, SRC_DID);
    // a newcomer who was asked about: questions answered by meeting
    this.resolveQ(a, 'who', b.id); this.resolveQ(b, 'who', a.id);
  }

  greet(a, b, rel, beats, place) {
    const e = this.e, rng = e.rng;
    const gap = (e.now - rel.last) / e.cfg.dayLength;
    let bt = this.beat(beats, a, b, 'greet', 'greet');
    if (gap > 3) bt.fl.push(COND.old); else if (gap < 0.12 && rel.n > 0) bt.fl.push(COND.twice);
    bt.an = 'wave';
    if (rng.chance(0.65)) { bt = this.beat(beats, b, a, 'greet.re', 'greet'); if (gap > 3) bt.fl.push(COND.old); else if (gap < 0.12) bt.fl.push(COND.twice); }
  }

  bye(a, b, rel, beats) {
    const rng = this.e.rng;
    let bt = this.beat(beats, a, b, 'bye', 'bye'); bt.an = 'wave';
    if (rng.chance(0.55)) { bt = this.beat(beats, b, a, 'bye.re', 'bye'); bt.an = 'wave'; }
  }

  // ---------------------------------------------------------------- topics
  topic(s, l, rel, place, beats) {
    const e = this.e, rng = e.rng;
    const W = [], K = [];
    const add = (k, w) => { if (w > 0) { K.push(k); W.push(w); } };
    const gs = groupOf(e, s);
    const tell = this.pickTellable(s, l);
    if (tell) add('rumor', 1.6 * tell.score * (0.6 + s.tr[0] / 120 + (s.tr[7] < 35 ? 0.5 : 0)));
    const own = this.pickPersonal(s, l, rel);
    if (own) add('personal', 1.4 * (rel.stage >= ST_FRIEND ? 1.6 : 0.6));
    const cg = this.pickAbout(s, l, true);
    if (cg) add('congrats', 3);
    const cf = this.pickAbout(s, l, false);
    if (cf) add('comfort', 3);
    const nq = this.nextQ(s);
    if (nq && this.canAsk(l, nq)) add('ask', 1.3 + s.tr[3] / 60);
    const rc = rel.n > 1 ? this.pickRecall(s, l) : null;
    if (rc) add('recall', 1.0);
    if (rel.crushOf(s.id) || rel.stage >= ST_SWEET && rel.stage <= ST_SPOUSE) add('romance', rel.stage >= ST_SWEET ? 1.4 : 1.8);
    if (rel.flags & RF_RIVAL) add((rel.aff > -220 || rel.fights >= 3) && s.tr[1] > 40 ? 'reconcile' : 'quarrel', 2.2);   // after a few rows, the kinder one says sorry
    if (rel.stage >= ST_FRIEND && gs >= G_KID && s.agenda.length < 2) {
      let shared = -1;
      for (const li of s.likes) if (l.likes.indexOf(li) >= 0) { shared = li; break; }
      add('invite', shared >= 0 ? 0.55 : 0.18);
    }
    if (s.tr[9] > 60) add('joke', 0.35 + (s.tr[9] - 60) / 80);
    add('small', 1.2);
    const k = K[rng.weighted(W, W.length)];
    this.stats.topics[k] = (this.stats.topics[k] || 0) + 1;
    switch (k) {
      case 'rumor': return this.tRumor(s, l, tell.m, beats);
      case 'personal': return this.tPersonal(s, l, own, beats);
      case 'congrats': return this.tAbout(s, l, cg, true, beats);
      case 'comfort': return this.tAbout(s, l, cf, false, beats);
      case 'ask': return this.tAsk(s, l, beats);
      case 'recall': return this.tRecall(s, l, rc, beats);
      case 'romance': return this.tRomance(s, l, rel, beats);
      case 'quarrel': return this.tQuarrel(s, l, rel, place, beats);
      case 'reconcile': return this.tReconcile(s, l, rel, beats);
      case 'invite': return this.tInvite(s, l, rel, beats);
      case 'joke': return this.tJoke(s, l, beats);
      default: return this.tSmall(s, l, rel, place, beats);
    }
  }

  /** news that is out of date: a proposal after the wedding, dating after the engagement, a crush on
   *  someone one now dates, a planned move of someone who has already left */
  stale(f) {
    const e = this.e;
    if (f.a < 0 || f.b < 0) return f.k === 'move_plan' && f.a >= 0 && !(e.people[f.a] && e.people[f.a].alive);
    const rel = getRel(e, f.a, f.b);
    const st = rel ? rel.stage : -1;
    switch (f.k) {
      case 'crush': case 'confess_no': return st >= ST_SWEET;
      case 'sweetheart': return st >= ST_ENGAGED;
      case 'engaged': return st >= ST_SPOUSE;
    }
    return false;
  }

  /** the juiciest memory s could tell l about */
  pickTellable(s, l) {
    const e = this.e;
    let best = null, bs = 0.12;
    for (let i = 0; i < s.mem.length; i++) {
      const m = s.mem[i], f = m.f;
      if (this.toldNow.indexOf(f.ref || f.id) >= 0) continue;     // that story was just told in this talk
      if (this.stale(f)) continue;
      const ng = NO_GOSSIP[f.k];
      if (ng === 1) continue;
      if (ng === 2 && !(s.tr[7] < 35)) continue;
      if (m.tt.indexOf(l.id) >= 0) continue;
      if (f.a === l.id || f.b === l.id) continue;
      if (f.a === s.id && m.src === SRC_DID) continue;
      if (FAMILY_NEWS[f.k] && (f.a === s.id || f.b === s.id || (f.a >= 0 && e.people[f.a] && e.people[f.a].hh === s.hh))) continue;
      const nov = novelty(e, f);
      if (nov <= 0) continue;
      const sc = (f.imp / 100) * (m.s / 1000) * nov * (1 + 0.3 * m.x) * (m.told > 5 ? 0.25 : 1) * (FACT_KINDS[f.k].news ? 1 : 0.8);
      if (sc > bs) { bs = sc; best = m; }
    }
    return best ? { m: best, score: bs } : null;
  }

  /** something juicy a resident would tell the chief when tapped */
  pickTellableForChief(r) {
    const e = this.e;
    let best = null, bs = 0.05;
    for (const m of r.mem) {
      const f = m.f;
      if (NO_GOSSIP[f.k] === 1 || NO_GOSSIP[f.k] === 2) continue;
      if (f.a === r.id && m.src === SRC_DID) continue;
      const sc = (f.imp / 100) * (m.s / 1000) * novelty(e, f) * (1 + 0.3 * m.x);
      if (sc > bs) { bs = sc; best = m; }
    }
    return best;
  }

  pickPersonal(s, l, rel) {
    const e = this.e;
    let best = null, bs = 0;
    for (const m of s.mem) {
      const f = m.f;
      if (!PERSONAL[f.k] || m.tt.indexOf(l.id) >= 0) continue;
      const famHH = f.k === 'baby' && f.a >= 0 && e.people[f.a] && e.people[f.a].hh === s.hh;     // a new baby brother or sister
      if (f.a !== s.id && f.b !== s.id && !famHH) continue;
      // family news is not news to the family
      if (FAMILY_NEWS[f.k] && (f.a === l.id || f.b === l.id || f.c === l.id || (f.a >= 0 && e.people[f.a] && e.people[f.a].hh === l.hh))) continue;
      if (f.a === l.id || f.b === l.id) continue;   // no 'I went to the beach with my husband!' to the husband (that is a shared memory: recall)
      if (this.toldNow.indexOf(f.ref || f.id) >= 0) continue;
      if (this.stale(f)) continue;
      if ((f.k === 'crush' || f.k === 'confess_no') && rel.stage < ST_BEST) continue;
      if (f.k === 'crush' && f.b === l.id) continue;
      if (f.k === 'deposit' && rel.stage < ST_FRIEND) continue;
      const nov = novelty(e, f);
      if (nov <= 0.2) continue;
      const sc = f.imp * nov + e.rng.next() * 10;
      if (sc > bs) { bs = sc; best = m; }
    }
    return best;
  }

  /** a fact about l that s knows: good news (congrats) or bad (comfort) */
  pickAbout(s, l, good) {
    const e = this.e;
    for (const m of s.mem) {
      const f = m.f;
      const tbl = good ? CONGRATS : COMFORT;
      if (!tbl[f.k] || m.tt.indexOf(l.id) >= 0) continue;
      if (novelty(e, f) < 0.3 || this.stale(f)) continue;
      if (this.toldNow.indexOf(f.ref || f.id) >= 0) continue;
      let about = f.a === l.id || f.b === l.id;
      if (f.k === 'theft' || f.k === 'window') about = f.b === l.id;
      if ((f.k === 'fire' || f.k === 'ruin') && f.p >= 0) about = e.world.places[f.p].residents.indexOf(l.id) >= 0 || e.world.places[f.p].owner === l.id;
      if (f.k === 'farewell') about = l.parents.indexOf(f.a) >= 0 || l.kids.indexOf(f.a) >= 0 || l.spouse === f.a;
      if (f.k === 'baby') about = f.a === l.id || f.b === l.id;
      // no 'congratulations on our wedding!' to one's own spouse, no comfort about one's own fire,
      // no 'welcome to the town!' to the family one moved in with
      if (f.a === s.id || f.b === s.id) about = false;
      if (s.hh === l.hh && s.hh >= 0 && (f.k === 'move_in' || f.k === 'rebuilt' || f.k === 'ruin' || f.k === 'fire' || f.k === 'baby' || f.k === 'wedding')) about = false;
      if ((f.k === 'fire' || f.k === 'ruin') && f.p >= 0 && (e.world.places[f.p].residents.indexOf(s.id) >= 0 || e.world.places[f.p].owner === s.id)) about = false;
      if (about) return m;
    }
    return null;
  }

  pickRecall(s, l) {
    const e = this.e;
    for (const m of s.mem) {
      const f = m.f;
      if (!RECALL[f.k] || m.tt.indexOf(l.id) >= 0) continue;
      if (e.now - f.sec < e.cfg.dayLength * 0.3) continue;
      const both = (f.a === s.id || f.b === s.id || m.src === SRC_SEEN) && (f.a === l.id || f.b === l.id || (findMem(l, f) && findMem(l, f).src <= SRC_DID));
      if (!both) continue;
      if (f.k === 'meet' && e.now - f.sec < e.cfg.dayLength * 4) continue;
      return m;
    }
    return null;
  }

  // ---------------------------------------------------------------- rumours
  setVersion(bt, m) {
    bt.f = m.f; bt.x = m.x; bt.d = m.d; bt.alt = m.alt; bt.src = m.src; bt.from = m.from;
  }

  tRumor(s, l, m, beats) {
    const e = this.e, rng = e.rng, f = m.f;
    this.toldNow.push(f.ref || f.id);
    const known = findMem(l, f);
    let bt = this.beat(beats, s, l, 'rumor.' + f.k, 'rumor:' + f.k);
    this.setVersion(bt, m);
    const rb = bt;
    bt.em = f.v < 0 ? 'emote_exclaim' : f.v > 0 ? 'emote_heart' : 'emote_dots';
    bt.an = f.v < 0 ? 'point' : 'talk';
    // the listener
    if (known) {
      const dk = this.differs(f, m, known);
      if (!dk) { bt = this.beat(beats, l, s, 'react.known.' + f.k, 'rumor:' + f.k); this.setVersion(bt, known); bt.em = 'emote_idea'; }
      else {
        // 'I heard it differently' — and the listener says how (a different place, a different item, a
        // bigger story, or who it was); the teller laughs it off
        bt = this.beat(beats, l, s, 'react.differs.' + dk, 'rumor:' + f.k);
        this.setVersion(bt, dk === 'unknown' ? m : known);
        if (dk === 'place') { bt.q = m.d === D_PLACE ? m.alt : f.p; bt.qk = 1; }
        if (dk === 'item') { bt.q = m.d === D_ITEM ? m.alt : f.i; bt.qk = 2; }
        bt.em = 'emote_question'; bt.an = 'think';
        bt = this.beat(beats, s, l, 'react.differs.re.' + dk, 'rumor:' + f.k); this.setVersion(bt, m); bt.em = 'emote_laugh'; bt.an = 'laugh';
      }
    } else {
      const doubt = s.tr[7] < 35 && l.tr[7] > 65 && m.x > 0;
      const rule = doubt ? 'react.doubt' : f.k === 'slip' || f.k === 'prank' || f.k === 'pet' || f.k === 'burnt_food' ? 'react.funny' : f.v < 0 ? 'react.bad' : f.v > 0 ? 'react.good' : 'react.neutral';
      bt = this.beat(beats, l, s, rule + '.' + f.k, 'rumor:' + f.k); this.setVersion(bt, m);
      bt.em = rule === 'react.bad' ? 'emote_exclaim' : rule === 'react.funny' ? 'emote_laugh' : rule === 'react.good' ? 'emote_heart' : 'emote_question';
      bt.an = rule === 'react.bad' ? 'shocked' : rule === 'react.funny' ? 'laugh' : rule === 'react.doubt' ? 'think' : 'talk';
      // follow-up question and answer
      let fq = FOLLOW[f.k];
      if (fq === 'who' && m.d !== D_ANON && f.a >= 0 && (f.k !== 'wanted' || e.dialogue.knowsCulprit(s, f))) fq = null;   // already said who
      if (fq === 'caught' && this.followFact(s, f, 'caught')) fq = null;   // the teller knows how it ended (and mostly says so)
      if (fq === 'what' && f.k === 'shop_open' && !(m.d === D_PLACE && m.alt < 0)) fq = null;   // the shop's name already says what it sells
      if (fq && rng.chance(0.55)) {
        bt.nq = true;
        bt = this.beat(beats, l, s, 'follow.' + fq + '.' + f.k, 'rumor:' + f.k); this.setVersion(bt, m); bt.em = 'emote_question';
        this.answerFollow(s, l, m, fq, beats);
      } else if (m.src === SRC_TOLD && m.from >= 0 && rng.chance(0.3)) {
        bt.nq = true;
        rb.fl.push(COND.srcq);   // so the story itself does not already say who told it
        bt = this.beat(beats, l, s, 'follow.source', 'rumor:' + f.k); this.setVersion(bt, m); bt.em = 'emote_question';
        bt = this.beat(beats, s, l, 'answer.source', 'rumor:' + f.k); this.setVersion(bt, m);
      }
    }
    this.tell(s, l, m);
    // gossip bonds friends a little; honest people do not like it much
    this.affAcc += l.tr[7] > 72 && f.v < 0 ? -8 : 6;
  }

  /** how the listener's version `k` of fact f really differs from the teller's version `m` (null: it does not) */
  differs(f, m, k) {
    const placeOf = (v) => (v.d === D_PLACE ? v.alt : f.p), itemOf = (v) => (v.d === D_ITEM ? v.alt : f.i);
    if (f.p >= 0 && placeOf(k) >= 0 && placeOf(m) >= 0 && placeOf(k) !== placeOf(m)) return 'place';
    if (f.i >= 0 && itemOf(k) >= 0 && itemOf(m) >= 0 && itemOf(k) !== itemOf(m)) return 'item';
    if (f.a >= 0 && f.k !== 'wanted') {
      const ka = k.d === D_ANON, ma = m.d === D_ANON;
      if (ka && !ma) return 'unknown';      // the teller says who it was: 'oh, so it was X!'
      if (!ka && ma) return 'who';          // the listener knows who it was
    }
    const big = (v) => v.x + (v.d === D_COUNT ? Math.max(1, v.alt - 1) : 0);
    if (big(k) >= big(m) + 1) return 'bigger';
    if (big(k) + 1 <= big(m)) return 'smaller';
    return null;
  }

  answerFollow(s, l, m, fq, beats) {
    const e = this.e, f = m.f;
    let rule = 'answer.dunno', bt;
    const follow = this.followFact(s, f, fq);
    if (follow) {
      rule = 'answer.' + fq + '.' + f.k;
      bt = this.beat(beats, s, l, rule, 'rumor:' + f.k);
      this.setVersion(bt, m);
      bt.o = follow.o; bt.n = follow.n; bt.s = follow.s || ''; bt.i = follow.i !== undefined ? follow.i : -1;
      if (follow.f) { bt.fl.push(COND.caught); this.tellFact(s, l, follow.f); }
      if (follow.esc) bt.fl.push(COND.escaped);
      if (follow.ruin) bt.fl.push(COND.ruin);
    } else {
      bt = this.beat(beats, s, l, rule, 'rumor:' + f.k); this.setVersion(bt, m);
      // the listener now wonders
      this.addQ(l, fq === 'caught' ? 'caught' : fq === 'who' ? 'who' : fq === 'when' ? 'when' : fq === 'why' ? 'why' : fq === 'name' ? 'name' : 'more', f);
    }
  }

  /** what s knows that answers follow-up `fq` about fact f */
  followFact(s, f, fq) {
    const e = this.e;
    switch (fq) {
      case 'caught': {
        for (const m of s.mem) if ((m.f.k === 'arrest' || m.f.k === 'apology') && m.f.ref === f.id) return { f: m.f, o: m.f.c };
        for (const m of s.mem) if (m.f.k === 'wanted' && m.f.ref === f.id) return { esc: true, o: -1 };
        return null;
      }
      case 'hurt': return { n: 0 };      // nobody is ever hurt
      case 'after': {
        if (f.k === 'ruin' || f.k === 'fire') { for (const m of s.mem) if ((m.f.k === 'rebuilt' || m.f.k === 'demolish') && m.f.p === f.p) return { s: m.f.k, o: -1 }; return f.k === 'fire' && f.st === 1 ? { s: 'out' } : null; }
        if (f.k === 'arrest') { for (const m of s.mem) if (m.f.k === 'apology' && m.f.ref === f.ref) return { s: 'apology', o: m.f.b }; return null; }
        if (f.k === 'farewell') return { s: 'memorial' };
        return null;
      }
      case 'when': return f.n > 0 ? { n: f.n } : null;          // wedding day
      case 'name': return f.c >= 0 ? { o: f.c } : null;         // baby
      case 'who': return f.a >= 0 && !(f.k === 'theft' && f.st === 0) ? { o: f.a } : null;
      case 'why': return f.s ? { s: f.s } : f.n ? { n: f.n } : null;
      case 'what': return f.p >= 0 ? { s: e.world.places[f.p].kind } : null;
      case 'since': return { n: Math.max(1, e.clock.day - f.day) };
    }
    return null;
  }

  /** l learns fact f from s (the version s remembers) */
  tell(s, l, m) {
    const e = this.e, rng = e.rng, f = m.f;
    let x = m.x, d = m.d, alt = m.alt;
    const had = findMem(l, f);
    if (!had) {
      const hon = s.tr[7];
      if (x < 3 && rng.chance(hon > 72 ? 0.03 : hon < 35 ? 0.38 : 0.14)) { x++; this.stats.exaggerations++; }
      if (d === D_NONE && DISTORT[f.k] && rng.chance(hon > 72 ? 0.01 : hon < 35 ? 0.13 : 0.05)) {
        const r = this.distort(f);
        if (r) { d = r[0]; alt = r[1]; this.stats.distortions++; }
      }
      this.stats.gossipNew++;
    }
    const lm = remember(e, l, f, SRC_TOLD, s.id, { x, d, alt, s: Math.max(300, Math.round(m.s * 0.78)), h: m.h + 1 });
    m.told++;
    if (m.tt.length >= 4) m.tt.shift();
    m.tt.push(l.id);
    this.stats.gossip++;
    if (lm && !had) {
      // new rumours make people wonder
      if ((f.k === 'theft' || f.k === 'window' || f.k === 'prank') && (d === D_ANON || f.a < 0)) this.addQ(l, 'who', f);   // only when the story did not say who
      if (f.k === 'theft' && f.st !== 1) this.addQ(l, 'caught', f);
      if (f.k === 'fire' && d === D_PLACE && alt < 0) this.addQ(l, 'where', f);
      if (f.k === 'move_in') this.addQ(l, 'who', f);
      if (f.k === 'engaged') this.addQ(l, 'when', f);
      if (f.k === 'move_plan') this.addQ(l, 'why', f);
      if (f.k === 'shop_plan' || (f.k === 'shop_open' && d === D_PLACE && alt < 0)) this.addQ(l, 'what', f);
    }
    if (e.bus.has('gossip')) e.bus.emit('gossip', { fact: f.id, kind: f.k, from: s.id, to: l.id, x: lm ? lm.x : x, d: lm ? lm.d : d, hop: lm ? lm.h : m.h + 1 });
    return lm;
  }

  /** tell a fact s remembers (by fact) */
  tellFact(s, l, f) { const m = findMem(s, f); if (m) this.tell(s, l, m); }

  distort(f) {
    const e = this.e, rng = e.rng, opts = DISTORT[f.k];
    const d = opts[rng.int(opts.length)];
    if (d === D_PLACE) {
      if (f.p < 0) return null;
      const p = e.world.places[f.p];
      const same = e.world.all(p.kind).length > 1 ? e.world.all(p.kind) : e.world.places.filter((q) => q.cat === p.cat);
      const q = same[rng.int(same.length)];
      return q && q.idx !== p.idx ? [D_PLACE, q.idx] : null;
    }
    if (d === D_ITEM) {
      if (f.i < 0) return null;
      const cat = ITEMS[f.i] ? ITEMS[f.i].cat : 'food';
      const same = ITEMS.filter((it) => it.cat === cat && it.idx !== f.i);
      return same.length ? [D_ITEM, same[rng.int(same.length)].idx] : null;
    }
    if (d === D_ANON) return f.a >= 0 ? [D_ANON, -1] : null;
    if (d === D_COUNT) return [D_COUNT, 2 + rng.int(3)];
    return null;
  }

  // ---------------------------------------------------------------- personal news, congratulations, comfort
  tPersonal(s, l, m, beats) {
    const f = m.f;
    let bt = this.beat(beats, s, l, 'own.' + f.k, 'own:' + f.k); this.setVersion(bt, m);
    bt.em = f.v > 0 ? 'emote_sparkle' : f.v < 0 ? 'emote_sweat' : 'emote_dots';
    const rule = f.k === 'crush' ? 'react.crush' : f.k === 'slip' || f.k === 'burnt_food' || f.k === 'prank' ? 'react.funny' : f.v < 0 ? 'react.sorry' : 'react.happyfor';
    bt = this.beat(beats, l, s, rule + '.' + f.k, 'own:' + f.k); this.setVersion(bt, m);
    bt.em = rule === 'react.funny' ? 'emote_laugh' : rule === 'react.crush' ? 'emote_love' : rule === 'react.sorry' ? 'emote_sweat' : 'emote_thumbs';
    bt.an = rule === 'react.funny' ? 'laugh' : 'happy';
    this.tell(s, l, m);
    this.toldNow.push(f.ref || f.id);
    this.affAcc += 18;
  }

  tAbout(s, l, m, good, beats) {
    const f = m.f;
    let bt = this.beat(beats, s, l, (good ? 'congrats.' : 'comfort.') + f.k, good ? 'congrats' : 'comfort'); this.setVersion(bt, m);
    bt.em = good ? 'emote_heart' : 'emote_sweat'; bt.an = good ? 'happy' : 'talk';
    bt = this.beat(beats, l, s, (good ? 'thanks.good.' : 'thanks.comfort.') + f.k, good ? 'congrats' : 'comfort'); this.setVersion(bt, m);
    bt.em = good ? 'emote_love' : 'emote_tear';
    m.tt.push(l.id);
    if (m.tt.length > 4) m.tt.shift();
    this.toldNow.push(f.ref || f.id);
    this.affAcc += good ? 35 : 45;
    if (!good) l.mood = Math.min(100, l.mood + 8);
  }

  // ---------------------------------------------------------------- questions
  addQ(r, k, f, o = -1) {
    if (!r.alive || r.qs.length >= 4 || groupOf(this.e, r) === G_TODDLER) return;
    for (const q of r.qs) if (q.k === k && q.f === f && q.o === o) return;
    r.qs.push({ k, f, o, t: this.e.now, n: 0 });
  }
  resolveQ(r, k, o) {
    for (let i = r.qs.length - 1; i >= 0; i--) {
      const q = r.qs[i];
      if (q.k === k && (q.o === o || (q.f && (q.f.a === o || q.f.b === o)))) r.qs.splice(i, 1);
    }
  }

  /** a question that makes sense to ask l (no bank rates from a six-year-old, no 'how is X?' to X) */
  canAsk(l, q) {
    const gl = groupOf(this.e, l);
    if ((q.k === 'price' || q.k === 'buy') && gl < G_TEEN) return false;
    if ((q.k === 'rate' || q.k === 'job') && gl < G_ADULT) return false;
    if (q.k === 'how' && q.o === l.id) return false;
    if (q.f && (q.f.a === l.id || q.f.b === l.id) && (q.k === 'who' || q.k === 'caught')) return false;
    return true;
  }

  /** the first open question of s not yet asked in this conversation */
  nextQ(s) {
    for (let i = 0; i < s.qs.length; i++) if (this.askedNow.indexOf(s.qs[i]) < 0) return s.qs[i];
    return null;
  }

  tAsk(s, l, beats) {
    const e = this.e, rng = e.rng;
    const q = this.nextQ(s);
    this.askedNow.push(q);
    q.n++;
    this.stats.questions++;
    let bt = this.beat(beats, s, l, 'ask.' + q.k + (q.f ? '.' + q.f.k : ''), 'ask:' + q.k);
    bt.f = q.f; bt.o = q.o; bt.em = 'emote_question'; bt.an = 'think';
    if (q.f) { const sm = findMem(s, q.f); if (sm) { bt.x = sm.x; bt.d = sm.d; bt.alt = sm.alt; bt.src = sm.src; bt.from = sm.from; } }
    if (q.k === 'price' || q.k === 'buy') bt.i = q.o;
    if (q.k === 'how') bt.o = q.o;
    const ans = this.answer(l, q);
    if (ans) {
      bt = this.beat(beats, l, s, 'ans.' + q.k + (q.f ? '.' + q.f.k : ''), 'ask:' + q.k);
      Object.assign(bt, ans.bt);
      bt.em = 'emote_idea'; bt.an = 'point';
      if (ans.m) { this.tell(l, s, ans.m); this.setVersion(bt, ans.m); }
      // 'did you hear more about it?' is answered by telling the story itself (the version l remembers)
      if (q.k === 'more' && ans.m) { bt.r = 'rumor.' + q.f.k; this.toldNow.push(q.f.ref || q.f.id); }
      if (ans.lead) this.jobLead(s, ans.lead);
      bt = this.beat(beats, s, l, 'ask.thanks', 'ask:' + q.k); bt.f = q.f; bt.em = 'emote_heart';
      const i = s.qs.indexOf(q);
      if (i >= 0) s.qs.splice(i, 1);
      this.stats.answered++;
      this.affAcc += 12;
    } else {
      bt = this.beat(beats, l, s, 'ans.dunno.' + q.k + (q.f ? '.' + q.f.k : ''), 'ask:' + q.k); bt.f = q.f; bt.o = q.o; if (q.k === 'price' || q.k === 'buy') bt.i = q.o; bt.em = 'emote_sweat'; bt.an = 'think';
      if (q.f) { const lm = findMem(l, q.f); bt.src = lm ? lm.src : SRC_ASKED; }   // 'I only saw the smoke' only from someone who saw it
      const tip = this.suggestWho(l, q, s.id);
      if (tip >= 0) { bt = this.beat(beats, l, s, 'ans.suggest', 'ask:' + q.k); bt.o = tip; bt.f = q.f; }
      else if (rng.chance(0.4)) { bt = this.beat(beats, s, l, 'ask.shrug', 'ask:' + q.k); bt.f = q.f; }
      // the listener now wonders too
      if (q.f && rng.chance(0.4)) this.addQ(l, q.k, q.f, q.o);
      if (q.n >= 4) { const i = s.qs.indexOf(q); if (i >= 0) s.qs.splice(i, 1); }
      else { s.qs.push(s.qs.shift()); }
      this.stats.dunno++;
    }
  }

  /** can l answer q? -> { bt: beat fields, m: memory to pass on } */
  answer(l, q) {
    const e = this.e, W = e.world;
    const gl = groupOf(e, l);
    if (q.f) {
      const lm = findMem(l, q.f);
      if (q.k === 'who') {
        if (q.f.k === 'move_in') { // newcomers: whoever met one of them can say
          const hh = q.f.s && q.f.s.charAt(0) === 'h' ? e.households.get(+q.f.s.slice(2)) : null;
          if (hh) for (const id of hh.members) { const rel = getRel(e, l.id, id); if (rel && rel.n > 0) return { bt: { o: id, f: q.f }, m: lm }; }
          return null;
        }
        if (lm && lm.d !== D_ANON && q.f.a >= 0 && q.f.st !== 0) return { bt: { o: q.f.a, f: q.f }, m: lm };
        if (lm && lm.d !== D_ANON && q.f.a >= 0 && lm.src <= SRC_DID) return { bt: { o: q.f.a, f: q.f }, m: lm };
        return null;
      }
      if (q.k === 'caught') {
        const fu = this.followFact(l, q.f, 'caught');
        if (fu && fu.f) return { bt: { o: fu.o, f: q.f, fl: [COND.caught] }, m: findMem(l, fu.f) };
        if (fu && fu.esc) return { bt: { f: q.f, fl: [COND.escaped] }, m: null };
        return null;
      }
      if (!lm) return null;
      if (q.k === 'where') return lm.d === D_PLACE && lm.alt < 0 ? null : { bt: { f: q.f, p: q.f.p }, m: lm };
      if (q.k === 'when') return q.f.n > 0 ? { bt: { f: q.f, n: q.f.n }, m: lm } : null;
      if (q.k === 'name') return q.f.c >= 0 ? { bt: { f: q.f, o: q.f.c }, m: lm } : null;
      if (q.k === 'why') return q.f.s ? { bt: { f: q.f, s: q.f.s }, m: lm } : null;
      if (q.k === 'what') return q.f.p >= 0 || q.f.s ? { bt: { f: q.f, s: q.f.s || W.places[q.f.p].kind }, m: lm } : null;
      if (q.k === 'more') return { bt: { f: q.f }, m: lm };
      return null;
    }
    switch (q.k) {
      case 'price': return gl >= G_TEEN ? { bt: { i: q.o, n: W.price(q.o) } } : null;
      case 'buy': { if (gl < G_KID) return null; for (const p of W.places) if (p.state === B_OK && p.sellIdx.indexOf(q.o) >= 0) return { bt: { i: q.o, p: p.idx } }; return null; }
      case 'rate': return gl >= G_ADULT && (l.savings > 100 || /bank/.test(l.job)) ? { bt: { n: e.bank.depositBp } } : null;
      case 'chief': { for (const m of l.mem) if (m.f.k === 'chief') return { bt: { f: m.f }, m }; return null; }
      case 'dog': { for (const m of l.mem) if (m.f.k === 'pet' && m.f.p >= 0) return { bt: { f: m.f, p: m.f.p }, m }; return null; }
      case 'train': return gl >= G_KID ? { bt: { n: 3 } } : null;
      case 'job': { if (l.work < 0 || gl < G_ADULT) return null; const p = W.places[l.work]; return e.jobs.hasOpening(p) ? { bt: { p: p.idx }, lead: p } : null; }
      case 'how': {
        const o = q.o;
        for (const m of l.mem) if ((m.f.a === o || m.f.b === o) && novelty(e, m.f) > 0.2 && m.f.k !== 'meet') return { bt: { o, f: m.f }, m };
        const rel = getRel(e, l.id, o);
        return rel && e.now - rel.last < e.cfg.dayLength ? { bt: { o, fl: [COND.fresh] } } : null;
      }
    }
    return null;
  }

  /** someone l thinks might know (police for thefts, firefighters for fires, a chatty friend …) */
  suggestWho(l, q, asker = -1) {
    const e = this.e;
    const want = q.k === 'caught' || (q.f && (q.f.k === 'theft' || q.f.k === 'wanted')) ? 'j_police' : q.f && (q.f.k === 'fire' || q.f.k === 'ruin') ? 'j_fire' : q.k === 'rate' ? 'j_bank' : q.k === 'price' || q.k === 'buy' ? 'j_shop' : null;
    let best = -1, bs = 0;
    for (const rel of l.adj) {
      if (rel.n === 0) continue;
      const o = e.people[rel.other(l.id)];
      if (!o.alive || o.id === asker || (q.f && (q.f.a === o.id && q.k === 'who'))) continue;
      let sc = o.tr[0] / 100 + rel.fam / 1000;
      if (want && e.jobTag(o) === want) sc += 2;
      if (sc > bs) { bs = sc; best = o.id; }
    }
    return bs > 0.9 ? best : -1;
  }

  jobLead(r, place) {
    const e = this.e;
    if (r.job !== 'none' || groupOf(e, r) !== G_ADULT) return;
    e.jobs.hireAt(r, place);
  }

  // ---------------------------------------------------------------- shared memories
  tRecall(s, l, m, beats) {
    const f = m.f;
    let bt = this.beat(beats, s, l, 'recall.' + f.k, 'recall:' + f.k); this.setVersion(bt, m); bt.em = 'emote_sparkle';
    bt = this.beat(beats, l, s, 'recall.re.' + f.k, 'recall:' + f.k); this.setVersion(bt, m); bt.em = f.v >= 0 ? 'emote_laugh' : 'emote_sweat'; bt.an = 'laugh';
    m.heard++;
    const lm = findMem(this.e.people[l.id], f);
    if (lm) lm.heard++;
    m.tt.push(l.id); if (m.tt.length > 4) m.tt.shift();
    this.affAcc += 25;
  }

  // ---------------------------------------------------------------- romance (progress happens in romance())
  tRomance(s, l, rel, beats) {
    const e = this.e;
    if (rel.stage >= ST_SWEET) {
      let bt = this.beat(beats, s, l, rel.stage === ST_SPOUSE ? 'sweet.married' : 'sweet', 'romance'); bt.em = 'emote_love';
      bt = this.beat(beats, l, s, rel.stage === ST_SPOUSE ? 'sweet.married.re' : 'sweet.re', 'romance'); bt.em = 'emote_heart';
      this.affAcc += 20;
      rel.rom += 25;
      return;
    }
    let bt = this.beat(beats, s, l, 'flirt', 'romance'); bt.em = 'emote_sparkle'; bt.h = l.likes[0];
    const noticed = l.tr[5] > 45 || rel.crushOf(l.id);
    bt = this.beat(beats, l, s, noticed ? 'flirt.re' : 'flirt.oblivious', 'romance'); bt.em = noticed ? 'emote_heart' : 'emote_question';
    rel.rom += noticed ? 30 : 10;
  }

  /** romance progress after a conversation between two eligible adults */
  romance(a, b, rel, compat, beats) {
    const e = this.e, rng = e.rng;
    if (!e.life.canRomance(a, b, rel)) return;
    if (rel.aff < 200) return;
    const rr = (a.tr[5] + b.tr[5]) / 200;
    rel.rom += Math.round(14 + rr * 34 * Math.max(0.3, compat + 0.4) + (rel.stage >= ST_SWEET ? 20 : 0));
    if (rel.rom >= 240) {
      const who = a.tr[5] >= b.tr[5] ? a : b;
      const flag = who.id === rel.a ? RF_CRUSH_A : RF_CRUSH_B;
      if (!(rel.flags & flag) && rel.stage < ST_SWEET) {     // (sweethearts and spouses are past the secret-crush stage)
        rel.flags |= flag;
        who.crushOn = (who === a ? b : a).id;
        const f = e.fact('crush', { a: who.id, b: (who === a ? b : a).id });
        e.learn(who, f, SRC_DID);
      }
    }
    // confession (in the conversation itself)
    if (rel.stage < ST_SWEET && rel.rom >= 420 && rel.aff >= 320 && rng.chance(0.45)) {
      const s = rel.crushOf(a.id) ? a : b, l = s === a ? b : a;
      this.stats.confessions++;
      const yes = rel.rom >= 450 && (l.tr[5] > 30 || rel.crushOf(l.id)) && rng.chance(0.62 + (rel.rom - 450) / 900);
      beats.splice(this.byeAt >= 0 ? this.byeAt : beats.length - 1, 0, ...this.confessBeats(s, l, yes));
      if (yes) { this.stats.confessYes++; e.life.becomeSweethearts(s, l, rel); }
      else {
        rel.rom = Math.max(0, rel.rom - 260);
        rel.flags &= ~(RF_CRUSH_A | RF_CRUSH_B);
        s.crushOn = -1;
        const f = e.fact('confess_no', { a: s.id, b: l.id });
        e.learn(s, f, SRC_DID); e.learn(l, f, SRC_DID);
      }
    }
    // proposal
    if (rel.stage === ST_SWEET && rel.rom >= 700 && e.clock.day - (rel.sweetDay || 0) >= e.cfg.proposeAfterDays && rng.chance(0.35)) {
      this.stats.proposals++;
      const s = a.male ? a : b, l = s === a ? b : a;
      beats.splice(this.byeAt >= 0 ? this.byeAt : beats.length - 1, 0, ...this.proposeBeats(s, l));
      e.life.engage(s, l, rel);
    }
  }

  confessBeats(s, l, yes) {
    const out = [];
    let bt = new Beat(); bt.w = s.id; bt.to = l.id; bt.r = 'confess'; bt.topic = 'romance'; bt.em = 'emote_love'; bt.h = l.likes[0]; out.push(bt);
    bt = new Beat(); bt.w = l.id; bt.to = s.id; bt.r = yes ? 'confess.yes' : 'confess.no'; bt.topic = 'romance'; bt.em = yes ? 'emote_heart' : 'emote_sweat'; out.push(bt);
    return out;
  }
  proposeBeats(s, l) {
    const out = [];
    let bt = new Beat(); bt.w = s.id; bt.to = l.id; bt.r = 'propose'; bt.topic = 'romance'; bt.em = 'emote_love'; out.push(bt);
    bt = new Beat(); bt.w = l.id; bt.to = s.id; bt.r = 'propose.yes'; bt.topic = 'romance'; bt.em = 'emote_heart'; bt.an = 'happy'; out.push(bt);
    return out;
  }

  // ---------------------------------------------------------------- quarrels and making up
  tQuarrel(s, l, rel, place, beats) {
    const e = this.e, rng = e.rng;
    this.stats.quarrels++;
    let bt = this.beat(beats, s, l, 'argue', 'quarrel'); bt.em = 'emote_anger'; bt.an = 'argue';
    bt = this.beat(beats, l, s, 'argue.back', 'quarrel'); bt.em = 'emote_anger'; bt.an = 'argue';
    bt = this.beat(beats, s, l, 'argue.huff', 'quarrel'); bt.em = 'emote_sweat';
    this.affAcc -= 40;
    rel.fights++;
    this.ended = true;
    // two grumpy rivals: a comic dust-cloud scuffle (the police come and they shake hands)
    if (rel.aff < -300 && (s.tr[1] < 50 || l.tr[1] < 50) && rng.chance(0.35)) e.incidents.scuffle(s, l, place);
  }

  tReconcile(s, l, rel, beats) {
    const e = this.e;
    this.stats.reconciles++;
    let bt = this.beat(beats, s, l, 'sorry', 'reconcile'); bt.em = 'emote_sweat';
    bt = this.beat(beats, l, s, 'sorry.re', 'reconcile'); bt.em = 'emote_heart'; bt.an = 'happy';
    rel.aff = Math.max(rel.aff, 60);
    rel.flags &= ~RF_RIVAL;
    const f = e.fact('reconcile', { a: s.id, b: l.id, p: s.loc });
    e.witness(f, e.world.places[s.loc], s.id, l.id);
  }

  // ---------------------------------------------------------------- invitations
  tInvite(s, l, rel, beats) {
    const e = this.e, rng = e.rng;
    this.stats.invites++;
    let li = -1;
    for (const x of s.likes) if (l.likes.indexOf(x) >= 0) { li = x; break; }
    if (li < 0) li = s.likes[rng.int(s.likes.length)];
    const place = e.plans.placeForLike(li);
    let bt = this.beat(beats, s, l, 'invite', 'invite'); bt.h = li; bt.p = place ? place.idx : -1; bt.em = 'emote_idea';
    const yes = l.likes.indexOf(li) >= 0 ? rng.chance(0.8) : rng.chance(0.35 + rel.aff / 2000);
    bt = this.beat(beats, l, s, yes ? 'invite.yes' : 'invite.no', 'invite'); bt.h = li; bt.p = place ? place.idx : -1;
    bt.em = yes ? 'emote_heart' : 'emote_sweat';
    if (yes && place) {
      const day = e.clock.day + 1, min = 900 + rng.int(8) * 30;
      s.agenda.push([day, min, place.idx, l.id]);
      l.agenda.push([day, min, place.idx, s.id]);
      this.affAcc += 15;
    }
  }

  tJoke(s, l, beats) {
    let bt = this.beat(beats, s, l, 'joke', 'joke'); bt.em = 'emote_idea';
    const groan = this.e.rng.chance(0.35);
    bt = this.beat(beats, l, s, groan ? 'joke.groan' : 'joke.laugh', 'joke'); bt.em = groan ? 'emote_sweat' : 'emote_laugh'; bt.an = groan ? 'talk' : 'laugh';
    this.affAcc += groan ? 4 : 14;
  }

  // ---------------------------------------------------------------- small talk
  tSmall(s, l, rel, place, beats) {
    const e = this.e, rng = e.rng, W = e.world;
    const gs = groupOf(e, s), gl = groupOf(e, l);
    const ws = [], ks = [];
    const add = (k, w) => { if (w > 0) { ks.push(k); ws.push(w); } };
    const wx = e.weather.today;
    const home = s.hh === l.hh && s.hh >= 0;     // people who live together talk about home things
    if (home) add('home', 3.2);
    add('weather', 1.0 + (wx.kind === 'blizzard' || wx.kind === 'heavy' ? 1.2 : 0) + (wx.first ? 2 : 0));
    add('snow', gs <= G_TEEN ? 1.2 : 0.3);
    if (gs >= G_TEEN) add('prices', 0.5 + (W.priceDelta.some((d) => d !== 0) ? 0.5 : 0));
    if (e.chiefFacts > 0) add('chief', 0.7);
    add('pet', 0.5 + (s.likes.some((li) => /dogs|cats|penguins/.test(LIKES[li].id)) ? 0.8 : 0));
    add('train', 0.25 + (s.likes.some((li) => LIKES[li].id === 'trains') ? 1 : 0));
    if (e.newestShop >= 0) add('shop', 0.5);
    if (s.work >= 0 && gs >= G_ADULT) add('work', place.idx === s.work ? 1.6 : 0.6);
    add('hobby', 1.0);
    if (s.spouse >= 0 || s.kids.length) add('family', 0.6);
    if (gs >= G_ADULT) add('bank', 0.2 + (e.bank.hasLoan(s) ? 0.4 : 0) + (s.tr[6] > 70 ? 0.3 : 0));
    if (/j_logi/.test(e.jobTag(s)) || (s.flags & F_OWNER)) add('logistics', 0.6);
    add('food', 0.6 + (s.hunger > 50 ? 0.8 : 0));
    add('plans', 0.5);
    if (s.readDay === e.clock.day) add('news', 0.8);
    add('town', 0.3);
    if (gs === G_ELDER) { add('health', 0.6); add('oldtimes', 0.8); }
    if (gs <= G_TEEN && s.job === 'student') add('school', 1.0);
    if (gs <= G_KID) add('play', 1.4);
    if (s.dream) add('dream', 0.6);
    if ((l.flags & F_NEWCOMER) && !home) add('newcomer', 1.6);
    add('season', 0.25);
    if (s.energy < 40 || s.tr[4] < 25) add('sleep', 0.4);
    if (gs >= G_ADULT) add('money', 0.25 + (s.wallet < 20 ? 0.5 : 0));
    if (s.tr[10] > 70) add('fashion', 0.8);
    if (s.likes.some((li) => /music|singing|dancing/.test(LIKES[li].id))) add('music', 0.6);
    const k = ks[rng.weighted(ws, ws.length)];
    let bt = this.beat(beats, s, l, 'small.' + k, 'small:' + k);
    this.fillSmall(bt, k, s, l, place);
    bt.em = SMALL_EMOTE[k] || null;
    const first = bt;
    bt = this.beat(beats, l, s, 'small.' + k + '.re', 'small:' + k);
    // the reply talks about the same thing (except things that are the listener's own: hobbies, work, family)
    if (k === 'hobby' || k === 'music' || k === 'work' || k === 'family') this.fillSmall(bt, k, l, s, place);
    else { bt.o = first.o; bt.p = first.p; bt.i = first.i; bt.h = first.h; bt.n = first.n; bt.s = first.s; bt.f = first.f; bt.fl = first.fl.slice(); }
    if (rng.chance(0.15)) { bt = this.beat(beats, s, l, 'small.more', 'small:' + k); bt.o = first.o; bt.p = first.p; bt.i = first.i; bt.h = first.h; bt.n = first.n; }
    this.affAcc += 6;
  }

  fillSmall(bt, k, s, l, place) {
    const e = this.e, rng = e.rng, W = e.world;
    switch (k) {
      case 'prices': {
        // an item whose price moved (or a random everyday item)
        let best = -1;
        for (let i = 0; i < W.priceDelta.length; i++) if (W.priceDelta[i] !== 0 && ITEMS[i].cat === 'food' && (best < 0 || rng.chance(0.4))) best = i;
        if (best < 0) best = ITEMS.filter((it) => it.cat === 'food')[rng.int(14)].idx;
        bt.i = best; bt.n = W.price(best);
        const dlt = W.priceDelta[best];
        if (dlt > 0) bt.fl.push(COND.pos); else if (dlt < 0) bt.fl.push(COND.neg);
        break;
      }
      case 'chief': { const f = e.lastChief; if (f) { bt.f = f; bt.s = f.s; } break; }
      case 'pet': bt.n = rng.int(3); break;
      case 'shop': if (e.newestShop >= 0) { bt.p = e.newestShop; } break;
      case 'work': bt.p = s.work; bt.o = s.id; break;
      case 'hobby': bt.h = s.likes[rng.int(s.likes.length)]; break;
      case 'family': bt.o = s.spouse >= 0 && rng.chance(0.5) ? s.spouse : s.kids.length ? s.kids[rng.int(s.kids.length)] : s.spouse; break;
      case 'food': bt.i = s.lastBuy >= 0 && ITEMS[s.lastBuy].cat === 'food' ? s.lastBuy : ITEMS[rng.int(17)].idx; break;
      case 'plans': { const n = s.plan; let p = -1; for (let j = s.planI; j < s.planN; j += 3) if (n[j + 2] !== 0 && n[j + 2] !== 9 && n[j + 1] !== place.idx) { p = n[j + 1]; break; } bt.p = p; break; }
      case 'news': { const pap = e.news.latest(); if (pap && pap.head) { bt.f = pap.head; } break; }
      case 'newcomer': bt.o = l.id; bt.p = l.home; break;
      case 'dream': bt.s = s.dream || ''; break;
      case 'logistics': bt.i = ITEMS[rng.int(ITEMS.length)].idx; break;
      case 'music': { const li = s.likes.find((x) => /music|singing|dancing/.test(LIKES[x].id)); bt.h = li === undefined ? -1 : li; break; }
      case 'home': { bt.o = l.id; bt.p = s.work >= 0 ? s.work : -1; bt.n = rng.int(3); break; }
    }
  }

  // ---------------------------------------------------------------- small happenings of daily life
  happen(r, p) {
    const e = this.e, rng = e.rng;
    if (!e.cfg.happenings) return;
    const g = groupOf(e, r);
    if (g === G_TODDLER) return;
    let f = null;
    const others = p.here.length - 1;
    switch (p.kind) {
      case 'ice_rink': if (rng.chance(0.05)) f = e.fact('slip', { a: r.id, p: p.idx }); break;
      case 'playground': if (g <= G_KID && others >= 2 && rng.chance(0.05)) f = e.fact('snowman', { a: r.id, p: p.idx, n: 1 + rng.int(3) }); else if (r.tr[2] > 75 && others >= 1 && rng.chance(0.08)) f = this.prank(r, p); break;
      case 'plaza': if (r.job === 'musician' && rng.chance(0.4)) f = e.fact('concert', { a: r.id, p: p.idx }); else if (rng.chance(0.025)) f = e.fact('pet', { p: p.idx, n: rng.int(3), i: rng.int(6) }); break;
      case 'park': case 'beach_fire': if (rng.chance(0.02)) f = e.fact('pet', { p: p.idx, n: rng.int(3), i: rng.int(6) }); else if (r.tr[2] > 75 && others >= 1 && rng.chance(0.05)) f = this.prank(r, p); break;
      case 'harbor': if (r.job === 'fisher' && rng.chance(0.06)) f = e.fact('bigcatch', { a: r.id, p: p.idx, n: 80 + rng.int(220) }); break;
      case 'station': if (rng.chance(0.03)) f = e.fact('train', { p: p.idx, n: rng.int(4), i: 20 + rng.int(60) }); break;
      case 'logistics': if (/j_logi/.test(e.jobTag(r)) && rng.chance(0.05)) { const cats = ITEMS.filter((it) => it.cat === 'furniture' || it.cat === 'appliances'); f = e.fact('delivery', { a: r.id, p: p.idx, i: cats[rng.int(cats.length)].idx, n: 10 + rng.int(40) }); } break;
      case 'bakery': case 'restaurant': case 'stall': if (p.idx === r.work && r.tr[8] > 55 && rng.chance(0.04)) { const it = p.sellIdx.length ? p.sellIdx[rng.int(p.sellIdx.length)] : 0; f = e.fact('burnt_food', { a: r.id, p: p.idx, i: it, n: 3 + rng.int(20) }); } break;
    }
    if (!f && others >= 1 && rng.chance(0.012)) {
      // a kindness or a lost & found
      const o = e.people[p.here[rng.int(p.here.length)]];
      if (o && o !== r && o.alive) {
        const rel = getRel(e, r.id, o.id);
        if (rel && rel.stage >= ST_FRIEND && rng.chance(0.5)) { const pet = ITEMS.filter((x) => x.petty); const it = pet[rng.int(pet.length)]; f = e.fact('gift', { a: r.id, b: o.id, p: p.idx, i: it.idx }); rel.aff += 40; clampRel(rel); }
        else if (rng.chance(0.5)) f = e.fact('help', { a: r.id, b: o.id, p: p.idx, i: rng.int(5) });
        else { const it = ITEMS.filter((x) => x.petty && x.cat === 'goods'); f = e.fact('lost_found', { a: o.id, b: r.id, p: p.idx, i: it[rng.int(it.length)].idx }); }
      }
    }
    if (f) { this.stats.happenings++; e.witness(f, p, f.a, f.b); }
  }

  prank(r, p) {
    const e = this.e, rng = e.rng;
    const o = e.people[p.here[rng.int(p.here.length)]];
    if (!o || o === r) return null;
    const f = e.fact('prank', { a: r.id, b: o.id, p: p.idx, n: rng.int(5) });
    const rel = ensureRel(e, r, o);
    rel.aff += o.tr[9] > 50 ? 10 : -60;
    clampRel(rel);
    return f;
  }

  // ---------------------------------------------------------------- relationship promotions
  promote(a, b, rel, ns, place) {
    const e = this.e;
    rel.stage = ns;
    this.stats.promotions = this.stats.promotions || {};
    this.stats.promotions[ns] = (this.stats.promotions[ns] || 0) + 1;
    if ((ns === ST_FRIEND || ns === ST_BEST) && !(rel.flags & RF_FAMILY)) {   // no 'Dad and I became best friends!'
      const f = e.fact(ns === ST_BEST ? 'bestfriend' : 'friend', { a: a.id, b: b.id, p: place.idx });
      e.learn(a, f, SRC_DID); e.learn(b, f, SRC_DID);
      if (e.bus.has('relation')) e.bus.emit('relation', { a: a.id, b: b.id, stage: ns });
    }
  }

  /** one resident says one thing (incident shouts, reactions) — emitted as a one-line talk */
  say(r, rule, opts) {
    const e = this.e;
    const bt = new Beat();
    bt.w = r.id; bt.to = opts && opts.to !== undefined ? opts.to : -1; bt.r = rule; bt.topic = 'say:' + rule;
    if (opts) { if (opts.f) bt.f = opts.f; if (opts.o !== undefined) bt.o = opts.o; if (opts.p !== undefined) bt.p = opts.p; if (opts.i !== undefined) bt.i = opts.i; if (opts.em) bt.em = opts.em; if (opts.an) bt.an = opts.an; if (opts.n !== undefined) bt.n = opts.n; if (opts.s) bt.s = opts.s; }
    const talk = { id: e.talkSeq++, a: r.id, b: bt.to, place: r.loc >= 0 ? e.world.places[r.loc].id : null, placeIdx: r.loc, start: e.now, dur: e.cfg.lineTime, beats: [bt], lines: null, topics: [bt.topic], shout: true };
    e.onTalk(talk);
    return talk;
  }
}

const SMALL_EMOTE = { weather: 'emote_cold', snow: 'emote_snowball', prices: 'emote_dots', chief: 'emote_thumbs', pet: 'emote_heart', train: 'emote_exclaim', shop: 'emote_sparkle',
  work: 'emote_sweat', hobby: 'emote_heart', family: 'emote_love', bank: 'emote_dots', logistics: 'emote_exclaim', food: 'emote_bread', plans: 'emote_idea', news: 'emote_exclaim',
  town: 'emote_star', health: 'emote_heart', school: 'emote_star', play: 'emote_snowball', oldtimes: 'emote_dots', dream: 'emote_sparkle', newcomer: 'emote_wave', season: 'emote_cold',
  sleep: 'emote_zzz', money: 'emote_sweat', fashion: 'emote_sparkle', music: 'emote_music', home: 'emote_heart' };

export { SMALL };
