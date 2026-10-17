// (v4.2, docs/v42_plan.md §6.7) 서리 소식 (one paper per game day at news.hour) and 편지 (citizens' letters).
// Interface { papers(), letters(), markRead(id), answer(id, b) } so v5's story newspaper / missions can take over the
// source and keep the office panel. Papers are printed from counters that already exist (economy.earned, the
// visitors done, move-ins, buildings, exports, the rank, the courier's deposits); a headline is [templateKey, a1, a2]
// (a2 indexes ITEMS / BLD for the item / building names). Letters: ≤ maxUnread unread, a regular one every
// letters.minH–maxH game hours when a template's trigger holds (most are once per save), answered = happiness +1,
// unanswered ones archive after archiveDays game days.
// Needs: 소식 / 편지 tabs open once 소복이 is hired; the letters arrive from the office being built.

import { BALANCE } from '../data/balance.js';
import { ITEMS, priceOf } from '../data/items.js';
import { t, fmt } from '../data/strings.js';

const N = () => (BALANCE.v42 && BALANCE.v42.news) || { hour: 6, keep: 3 };
const LT = () => (BALANCE.v42 && BALANCE.v42.letters) || { minH: 2, maxH: 4, maxUnread: 6, archiveDays: 2 };
export const BLD = ['chief_office', 'bank42', 'depot42', 'town_hall', 'big_restaurant', 'warehouse', 'store', 'toolsmith', 'cannery', 'boathouse', 'station'];

// the letter templates: from / body / buttons (strings lt_<id>_from, _body, _b1, _b2) and a trigger
export const LETTERS = ['baker', 'minji', 'miner', 'cook', 'family', 'porter', 'cafe', 'kid', 'grandma', 'banker'];

export class VillageNews {
  constructor(gs, v42, saved) {
    this.gs = gs;
    this.v42 = v42;
    const nw = (saved && saved.news) || {}, lt = (saved && saved.letters) || {};
    this.day = Number.isFinite(nw.day) ? nw.day : -1;
    this.list = Array.isArray(nw.papers) ? nw.papers.slice(-3) : [];
    this.seq = Math.max(0, Math.floor(Number(lt.seq) || 0));
    this.inbox = Array.isArray(lt.inbox) ? lt.inbox.slice(-6).map((r) => ({ id: r[0], tpl: r[1], state: r[2] || 0, day: r[3] || 0 })) : [];
    this.once = new Set(Array.isArray(lt.once) ? lt.once : []);
    this.nextT = Number.isFinite(lt.nextT) ? lt.nextT : 60;
    this.happy = Math.max(0, Math.min(99, Math.floor(Number(lt.happy) || 0)));
    // the day's counters (from cumulative values, so nothing new is wired into the economy)
    this.mark = null;
    this.today = { visitors: 0, sold: 0, built: [], movein: 0, items: {} };
    this.trig = { jamBakery: 0, pantryEmpty: 0, rides: 0 };
    // ((robust review L3) the letters' trigger timers and the bank's first day survive a reload)
    if (Array.isArray(lt.tg)) { this.trig.jamBakery = Math.max(0, Math.min(3600, Number(lt.tg[0]) || 0)); this.trig.pantryEmpty = Math.max(0, Math.min(86400, Number(lt.tg[1]) || 0)); this.trig.rides = Math.max(0, Math.min(99, Math.floor(Number(lt.tg[2]) || 0))); }
    if (Number.isFinite(lt.bk) && lt.bk >= 0) this.bankDay = Math.floor(lt.bk);
    this.onVisitor = () => { this.today.visitors++; };
    // ((gameplay review M6) the paper names one item: count what each customer bought, by item)
    this.onSold = (value, c) => {
      this.today.sold++;
      const w = c && c.want;
      if (w && w.type) this.today.items[w.type] = (this.today.items[w.type] || 0) + Math.max(1, Math.floor(Number(w.count) || 1));
    };
    this.onBuilt = (k) => { if (BLD.indexOf(k) >= 0) this.today.built.push(k); };
    this.onTrain = (ev, stop) => { if (ev === 'arrive' && stop === 'ours') this.trainArrived(); };
    gs.events.on('v4:visitorDone', this.onVisitor);
    gs.events.on('sold', this.onSold);
    gs.events.on('built', this.onBuilt);
    gs.events.on('v4:train', this.onTrain);
    this.t = 0;
  }

  get office() { return this.v42.office; }
  /** the paper / letters are on once 소복이 (or for letters: the office) is there */
  get on() { const O = this.office; return !!(O && O.built); }
  get reporter() { const O = this.office; return !!(O && O.hired('bok')); }

  clock() { const nb = this.gs.v4; return nb && nb.clock && nb.clock.on ? nb.clock : null; }
  gameDay() { const c = this.clock(); return c ? c.day() : Math.floor(this.gs.time.now / 600000); }
  hour() { const c = this.clock(); return c ? c.hour() : 12; }

  snapshot() {
    const gs = this.gs, F = this.v42.freight, O = this.office, nb = gs.v4;
    return { earned: gs.economy.earned, exported: F ? F.stats.exported : 0, moved: gs.life && gs.life.moved ? gs.life.moved.length : 0, rank: nb && nb.rank ? nb.rank.level : 1, deposited: O ? O.depositedTotal : 0, people: nb && nb.town ? nb.town.population() : 0 };
  }

  // ---------------------------------------------------------------- papers
  /** print yesterday's paper (headlines from the day's counters) */
  print(day) {
    const S = this.snapshot(), M = this.mark || S, T = this.today;
    const H = [];
    const coins = Math.max(0, S.earned - M.earned);
    if (S.rank > M.rank) H.push(['news_rank', S.rank, 0]);
    for (const k of T.built.slice(0, 2)) H.push(['news_building', 0, BLD.indexOf(k)]);
    if (S.exported > M.exported) H.push(['news_exports', S.exported - M.exported, 0]);
    if (T.visitors > 0) H.push(['news_visitors', T.visitors, 0]);
    // ((gameplay review M6) the item the plaza sold most of yesterday, with ITS count — not every food sold)
    let best = null;
    for (const ty in T.items || {}) { const n = T.items[ty]; if (n > 0 && ITEMS.indexOf(ty) >= 0 && (!best || n > best.n)) best = { n, item: ty }; }
    if (best) H.push(['news_sales', best.n, ITEMS.indexOf(best.item)]);
    if (S.moved > M.moved) H.push(['news_movein', S.moved - M.moved, 0]);
    if (S.deposited > M.deposited) H.push(['news_courier', S.deposited - M.deposited, 0]);
    if (coins > 0) H.push(['news_coins', coins, 0]);
    if (!H.length) H.push(['news_quiet', 0, 0]);
    if (H.length < 3) H.push([(day % 3) === 0 ? 'news_snow' : (day % 3) === 1 ? 'news_dog' : 'news_bread', 0, 0]);
    this.list.push([day, H.slice(0, 5)]);
    while (this.list.length > (Number(N().keep) || 3)) this.list.shift();
    this.mark = S;
    this.today = { visitors: 0, sold: 0, built: [], movein: 0, items: {} };
    this.day = day;
    const O = this.office;
    if (O && O.onPaper) O.onPaper(day);
  }

  papers() { return this.list.map(([day, H]) => ({ day, weather: t('weather_' + (Math.abs(day * 7 + 3) % 5)), lines: H.map((h) => this.headline(h)) })); }

  headline(h) {
    const [k, a, b] = h;
    if (k === 'news_building') return t(k, { name: t('b_' + (BLD[b] || 'station')) });
    if (k === 'news_sales') return t(k, { a, item: t(ITEMS[b] || 'item_bread') });
    if (k === 'news_rank') return t(k, { rank: t('rank_' + a) });
    return t(k, { a });
  }

  // ---------------------------------------------------------------- letters
  letters() { return this.inbox.map((r) => ({ id: r.id, tpl: r.tpl, state: r.state, day: r.day, from: t('lt_' + r.tpl + '_from'), body: t('lt_' + r.tpl + '_body'), buttons: this.buttons(r.tpl) })); }
  unread() { return this.inbox.filter((r) => r.state === 0).length; }
  markRead(id) { const r = this.inbox.find((q) => q.id === id); if (r && r.state === 0) r.state = 1; }

  buttons(tpl) {
    const V = BALANCE.v42 || {};
    // ((v4.2 fix, gameplay L9) '· 2,000' like every other price)
    const c = (x) => ({ cost: fmt(x) });
    switch (tpl) {
      case 'baker': return [{ k: 'lt_baker_b1', a: c((V.porter2 && V.porter2.costs && V.porter2.costs.bakery) || 700), act: 'p2:bakery' }, { k: 'lt_baker_b2', act: 'later' }];
      case 'miner': return [{ k: 'lt_miner_b1', a: c((V.station2 && V.station2.costs && V.station2.costs.smelter) || 1400), act: 'st2:smelter' }, { k: 'lt_miner_b2', act: 'later' }];
      case 'cook': return [{ k: 'lt_cook_b1', act: 'stock:smokehouse' }];
      case 'family': return [{ k: 'lt_family_b1', act: 'plot' }, { k: 'lt_family_b2', act: 'later' }];
      case 'porter': return [{ k: 'lt_porter_b1', a: c((V.freight && V.freight.bigCost) || 2000), act: 'bigcar' }, { k: 'lt_porter_b2', act: 'later' }];
      case 'cafe': return [{ k: 'lt_cafe_b1', act: 'depot' }, { k: 'lt_cafe_b2', act: 'later' }];
      case 'kid': return [{ k: 'lt_kid_b1', a: c(120), act: 'snowman' }, { k: 'lt_kid_b2', act: 'later' }];
      case 'minji': case 'grandma': return [{ k: 'lt_' + tpl + '_b1', act: 'reply' }];
      case 'banker': return [{ k: 'lt_banker_b1', act: 'reply' }];
      default: return [{ k: 'lt_banker_b1', act: 'reply' }];
    }
  }

  /** is template tpl due now? (§6.7 table) */
  due(tpl) {
    const gs = this.gs, v = this.v42, L = v.ledger, nb = gs.v4;
    const fullFor = (id) => (L && L.fullFor ? L.fullFor(id) : 0);
    switch (tpl) {
      case 'baker': return this.trig.jamBakery >= 60;
      case 'minji': return this.trig.rides > 0;
      case 'miner': return fullFor('pile:ore') >= 120;
      case 'cook': { const R = gs.civic && gs.civic.restaurant; return !!(R && this.trig.pantryEmpty >= 0.2 * (this.clock() ? this.clock().dayLen() : 600)); }
      case 'family': { const C = gs.civic; if (!C || !C.vacantBeds) return false; const free = Object.values(gs.sites || {}).some((s) => s.kind === 'plot' && s.shown && s.state === 'plot' && s.size === 'S'); return free && C.vacantBeds() < 2; }
      case 'porter': return !!(v.freight && !v.freight.big && v.freight.stats.waitT >= 120);
      case 'cafe': return !!(nb && nb.rank && nb.rank.level >= 2 && !gs.isBuilt('depot42'));
      case 'kid': return gs.isBuilt('town_hall');
      case 'grandma': { const S = v.aura; return !!(S && S.on !== false) && this.gameDay() >= 2; }
      case 'banker': return gs.isBuilt('bank42') && this.bankDay !== undefined && this.gameDay() - this.bankDay >= 3;
      default: return false;
    }
  }

  /** a new letter (from the mailbox) */
  deliver(tpl) {
    if (this.unread() >= (Number(LT().maxUnread) || 6)) return null;
    const r = { id: ++this.seq, tpl, state: 0, day: this.gameDay() };
    this.inbox.push(r);
    while (this.inbox.length > 6) { const i = this.inbox.findIndex((q) => q.state !== 0); this.inbox.splice(i >= 0 ? i : 0, 1); }
    this.once.add(tpl);
    const O = this.office;
    if (O && O.onLetter) O.onLetter(r);
    return r;
  }

  /** a button of a letter: its effect, then the letter is answered */
  answer(id, bi) {
    const r = this.inbox.find((q) => q.id === id);
    if (!r || r.state >= 2) return false;
    const b = this.buttons(r.tpl)[bi || 0];
    if (!b) return false;
    const O = this.office;
    if (b.act !== 'later') { this.happy = Math.min(99, this.happy + 1); }
    r.state = 2;
    if (O && O.letterAction) O.letterAction(b.act, b, r);
    this.gs.ui.toast(t('letterThanks'));
    return true;
  }

  trainArrived() { const nb = this.gs.v4; if (nb && nb.arrivals > 0 && !this.once.has('minji') && this.v42.trainNew()) this.trig.rides++; }

  update(dt) {
    this.t += dt;
    if (!this.on) return;
    if (!this.mark) this.mark = this.snapshot();
    // the triggers' clocks
    const L = this.v42.ledger;
    if (L && L.status && L.status('bakery') === 'jam') this.trig.jamBakery += dt; else this.trig.jamBakery = Math.max(0, this.trig.jamBakery - dt);
    const R = this.gs.civic && this.gs.civic.restaurant;
    if (R && R.pantry && R.pantry.countOf && R.pantry.countOf('item_meat_cooked') === 0) this.trig.pantryEmpty += dt;
    if (this.gs.isBuilt('bank42') && this.bankDay === undefined) this.bankDay = this.gameDay();
    // the paper at 06:00 (once a game day; before the day clock runs: every 10 game minutes)
    const day = this.gameDay();
    if (this.reporter && day > this.day && this.hour() >= (Number(N().hour) || 6)) this.print(day);
    // letters: every minH–maxH game hours, a due template (once each)
    this.nextT -= dt;
    if (this.nextT <= 0) {
      const c = this.clock(), hl = c ? c.hourLen : 25;
      const lt = LT();
      this.nextT = hl * (lt.minH + Math.random() * Math.max(0, lt.maxH - lt.minH));
      const tpl = LETTERS.find((k) => !this.once.has(k) && this.due(k));
      if (tpl) this.deliver(tpl);
    }
    // archive: unanswered letters after archiveDays
    for (const r of this.inbox) if (r.state < 2 && day - r.day >= (Number(LT().archiveDays) || 2)) r.state = 3;
  }

  /** happiness from answered letters (capped) */
  happyBonus() { return Math.min(5, this.happy); }

  serializeInto(o) {
    o.news = { day: this.day, papers: this.list.slice(-3).map(([d, H]) => [d, H.slice(0, 5)]) };
    o.letters = { seq: this.seq, inbox: this.inbox.slice(-6).map((r) => [r.id, r.tpl, r.state, r.day]), once: Array.from(this.once).slice(0, 16), nextT: Math.round(Math.max(0, this.nextT)), happy: this.happy };
    const tg = this.trig;
    if (tg.jamBakery > 0 || tg.pantryEmpty > 0 || tg.rides > 0) o.letters.tg = [Math.round(tg.jamBakery), Math.round(tg.pantryEmpty), tg.rides];
    if (this.bankDay !== undefined) o.letters.bk = this.bankDay;
  }

  state() { return { day: this.day, papers: this.list.length, inbox: this.inbox.map((r) => r.tpl + ':' + r.state), unread: this.unread(), next: Math.round(this.nextT), trig: Object.assign({}, this.trig), happy: this.happy }; }

  hooks(H) {
    H.news = (o) => { if (o && o.print) this.print(this.gameDay()); if (o && o.letter) this.deliver(o.letter); if (o && o.answer) this.answer(o.answer[0], o.answer[1]); return { papers: this.papers(), letters: this.letters(), state: this.state() }; };
  }

  destroy() {
    const gs = this.gs;
    gs.events.off('v4:visitorDone', this.onVisitor);
    gs.events.off('sold', this.onSold);
    gs.events.off('built', this.onBuilt);
    gs.events.off('v4:train', this.onTrain);
  }
}

export { priceOf };
