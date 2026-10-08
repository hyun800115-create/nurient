// 솔방울 신문 (The Pinecone Times): every morning at 05:00 the town paper collects yesterday's news
// (weddings, babies, new shops, fires, arrests, wanted posters, newcomers, farewells, the chief's
// deeds …), today's weather, prices that moved, the bank's interest rate, upcoming weddings and a
// quote of the day overheard in town. Readers learn the stories (source = newspaper) and talk about them.

import { FACT_KINDS } from '../data/facts.js';
import { remember, SRC_NEWS } from './memory.js';
import { ITEMS } from '../data/items.js';
import { groupOf, G_KID } from './people.js';

export class Newspaper {
  constructor(e) {
    this.e = e;
    this.papers = [];      // last few papers
    this.stats = { papers: 0, articles: 0, readers: 0 };
  }

  latest() { return this.papers.length ? this.papers[this.papers.length - 1] : null; }

  compile() {
    const e = this.e, day = e.clock.day;
    const cands = [];
    for (const f of e.facts.values()) {
      const K = FACT_KINDS[f.k];
      if (!K.news) continue;
      if (f.day !== day - 1 && !(f.day === day && e.clock.minute < 360)) continue;
      const sc = K.news * 40 + f.imp + Math.min(40, f.reach * 2) + (f.k === 'chief' ? 20 : 0);
      cands.push([sc, f]);
    }
    // upcoming weddings
    for (const f of e.facts.values()) if (f.k === 'engaged' && f.n >= day && f.n <= day + 2 && cands.every((c) => c[1] !== f)) cands.push([70, f]);
    cands.sort((a, b) => b[0] - a[0] || a[1].id - b[1].id);
    // one story per kind per paper at most twice
    const per = Object.create(null), items = [];
    for (const [, f] of cands) {
      per[f.k] = (per[f.k] || 0) + 1;
      if (per[f.k] > 2) continue;
      items.push(f);
      if (items.length >= 7) break;
    }
    const W = e.world;
    const moved = [];
    for (let i = 0; i < W.priceDelta.length; i++) if (W.priceDelta[i] !== 0 && ITEMS[i].cat !== 'materials') moved.push([ITEMS[i].idx, W.prices[i], W.priceDelta[i]]);
    moved.sort((a, b) => Math.abs(b[2]) - Math.abs(a[2]) || a[0] - b[0]);
    const wanted = [];
    for (const I of e.incidents.active) if (I.kind === 'theft' && I.phase === 'wanted' && I.wantedFact) wanted.push(I.wantedFact);
    const reporter = e.alive.find((r) => r.job === 'reporter') || null;
    const paper = {
      day, head: items[0] || null, items: items.slice(1), weather: Object.assign({}, e.weather.today), prices: moved.slice(0, 3),
      rate: e.bank.depositBp, wanted, reporter: reporter ? reporter.id : -1, quote: e.quotePick(), no: this.stats.papers + 1,
    };
    for (const f of items) f.pinned++;
    for (const f of wanted) f.pinned++;
    this.papers.push(paper);
    while (this.papers.length > 4) {
      const old = this.papers.shift();
      for (const f of [old.head].concat(old.items, old.wanted)) if (f) { f.pinned--; if (f.knowers <= 0) e.factMaybeDead(f); }
    }
    this.stats.papers++;
    this.stats.articles += items.length;
    if (e.bus.has('news')) e.bus.emit('news', { day, paper, text: e.cfg.textMode !== 'none' ? e.dialogue.paperText(paper, e.cfg.lang) : null });
    return paper;
  }

  /** a resident reads the paper at breakfast */
  read(r) {
    const e = this.e, rng = e.rng;
    r.readDay = e.clock.day;
    const p = this.latest();
    if (!p || p.day !== e.clock.day) return;
    if (groupOf(e, r) < G_KID) return;
    if (!rng.chance(0.35 + r.tr[3] / 250)) return;
    this.stats.readers++;
    if (p.head) remember(e, r, p.head, SRC_NEWS);
    for (const f of p.items) if (rng.chance(0.55)) remember(e, r, f, SRC_NEWS);
    for (const f of p.wanted) if (rng.chance(0.6)) remember(e, r, f, SRC_NEWS);
  }
}
