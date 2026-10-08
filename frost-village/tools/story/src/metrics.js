// Metrics for the headless runner (not used by the game): distinct lines, verbatim repeats per pair,
// template and topic coverage, how far and how fast rumours travel, relationships formed, moves,
// incidents, the bank, and the time the simulation takes per game second.

import { pairKey } from './relations.js';
import { hashStr } from './rng.js';
import { FACT_KINDS } from '../data/facts.js';

export class Metrics {
  constructor(opts = {}) {
    this.keepLines = opts.keepLines !== false;
    this.lines = 0;
    this.uniq = new Set();
    this.pairLines = new Map();     // pairKey -> Set of hashes
    this.pairRepeats = 0;
    this.speakerRepeats = 0;
    this.speakerLines = new Map();
    this.topics = Object.create(null);
    this.talks = 0;
    this.shouts = 0;
    this.tracked = new Map();       // fact id -> { kind, firstAt, at10, at25, at50, pop }
    this.learnEvents = 0;
    this.byDay = [];
    this.promotions = Object.create(null);
    this.onLine = opts.onLine || null;
    this.lineLen = 0;
  }

  onFact(f) {
    const K = FACT_KINDS[f.k];
    if (K.news >= 2 || f.imp >= 60) this.tracked.set(f.id, { kind: f.k, firstAt: f.sec, at10: -1, at25: -1, at50: -1, reach: 0, maxHop: 0 });
  }

  onLearn(f, r, m) {
    this.learnEvents++;
    const t = this.tracked.get(f.id);
    if (!t) return;
    t.reach = f.reach;
    if (m.h > t.maxHop) t.maxHop = m.h;
    const pop = this.pop || 250;
    const frac = f.reach / pop;
    const now = this.now;
    if (t.at10 < 0 && frac >= 0.1) t.at10 = now - t.firstAt;
    if (t.at25 < 0 && frac >= 0.25) t.at25 = now - t.firstAt;
    if (t.at50 < 0 && frac >= 0.5) t.at50 = now - t.firstAt;
  }

  onStep(e) { this.now = e.now; this.pop = e.alive.length; }

  onTalk(talk, e) {
    this.now = e.now;
    this.pop = e.alive.length;
    if (talk.shout) this.shouts++; else this.talks++;
    for (const tp of talk.topics) this.topics[tp] = (this.topics[tp] || 0) + 1;
    if (!talk.lines) return;
    for (const l of talk.lines) {
      this.lines++;
      this.lineLen += l.text.length;
      if (this.keepLines) this.uniq.add(l.text);
      const h = hashStr(l.text);
      if (l.to >= 0) {
        // verbatim repeats inside a pair (same speaker -> same listener)
        const k = pairKey(l.who, l.to) * 2 + (l.who < l.to ? 0 : 1);
        let s = this.pairLines.get(k);
        if (!s) { s = new Set(); this.pairLines.set(k, s); }
        if (s.has(h)) this.pairRepeats++; else s.add(h);
      }
      if (this.onLine) this.onLine(l, talk, e);
    }
  }

  summary(e, extra = {}) {
    const days = Math.max(1, e.clock.day);
    const tracked = Array.from(this.tracked.values());
    const med = (arr) => { if (!arr.length) return null; const a = arr.slice().sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
    const hours = (s) => (s === null ? null : Math.round((s / e.cfg.dayLength) * 24 * 10) / 10);
    const reachPct = tracked.map((t) => (t.reach / Math.max(1, e.alive.length)) * 100);
    const byKind = Object.create(null);
    for (const t of tracked) { const k = byKind[t.kind] || (byKind[t.kind] = { n: 0, reach: [], at25: [] }); k.n++; k.reach.push(t.reach); if (t.at25 >= 0) k.at25.push(t.at25); }
    const kindSummary = {};
    for (const k in byKind) kindSummary[k] = { facts: byKind[k].n, medianReach: med(byKind[k].reach), medianHoursTo25pct: hours(med(byKind[k].at25)) };
    // relationship stages now
    const stages = [0, 0, 0, 0, 0, 0, 0];
    let rivals = 0;
    for (const rel of e.pairs.values()) { stages[rel.stage]++; if (rel.flags & 1) rivals++; }
    const ko = e.dialogue.grammars.ko ? e.dialogue.grammars.ko.coverage() : null;
    const en = e.dialogue.grammars.en ? e.dialogue.grammars.en.coverage() : null;
    const st = e.stats();
    return Object.assign({
      days, residents: e.alive.length, talks: this.talks, shouts: this.shouts, lines: this.lines, uniqueLines: this.uniq.size,
      uniqueRatio: this.lines ? Math.round((this.uniq.size / this.lines) * 1000) / 1000 : 0,
      avgLineChars: this.lines ? Math.round((this.lineLen / this.lines) * 10) / 10 : 0,
      pairRepeats: this.pairRepeats, pairRepeatRate: this.lines ? Math.round((this.pairRepeats / this.lines) * 10000) / 100 + '%' : '0%',
      talksPerResidentPerDay: Math.round(((this.talks * 2) / days / Math.max(1, e.alive.length)) * 10) / 10,
      templateCoverage: { ko: ko ? { used: ko.used, total: ko.total, pct: Math.round((ko.used / ko.total) * 1000) / 10 } : null, en: en ? { used: en.used, total: en.total, pct: Math.round((en.used / en.total) * 1000) / 10 } : null },
      topics: { distinct: Object.keys(this.topics).length, counts: this.topics },
      gossip: {
        trackedFacts: tracked.length, medianReachPct: Math.round(med(reachPct) || 0), maxHop: tracked.reduce((m, t) => Math.max(m, t.maxHop), 0),
        medianHoursTo10pct: hours(med(tracked.filter((t) => t.at10 >= 0).map((t) => t.at10))),
        medianHoursTo25pct: hours(med(tracked.filter((t) => t.at25 >= 0).map((t) => t.at25))),
        medianHoursTo50pct: hours(med(tracked.filter((t) => t.at50 >= 0).map((t) => t.at50))),
        reached25pct: tracked.filter((t) => t.at25 >= 0).length, reached50pct: tracked.filter((t) => t.at50 >= 0).length,
        tellings: st.social.gossip, newTellings: st.social.gossipNew, exaggerations: st.social.exaggerations, distortions: st.social.distortions,
        byKind: kindSummary,
      },
      relationships: { pairs: e.pairs.size, byStage: { acquaintance: stages[1], friend: stages[2], bestFriend: stages[3], sweetheart: stages[4], engaged: stages[5], spouse: stages[6], neverTalked: stages[0] }, rivals },
      life: st.life, incidents: st.incidents, incidentsPerDay: perDay(st.incidents, days), bank: st.bank, econ: st.econ, jobs: st.jobs, news: st.news,
      social: Object.assign({}, st.social, { topics: undefined }), dialogue: { lines: st.dialogue.lines, rerolls: st.dialogue.rerolls, misses: st.dialogue.misses, missRules: st.dialogue.missRules },
    }, extra);
  }
}

function perDay(inc, days) {
  const o = {};
  for (const k of ['theft', 'queue', 'window', 'scuffle', 'fire']) o[k] = Math.round((inc[k] / days) * 100) / 100;
  return o;
}
