// (v4.2, docs/v42_plan.md §6.7 + §15) 서리 소식 and 편지, Node only:
//   node tools/test/letters.test.mjs
// nothing before the office stands; the paper prints once a game day at news.hour only when 소복이 is hired, from
// the day's counters (≤ 5 headlines, ≥ 1), keeps news.keep papers; letters arrive every minH–maxH game hours when a
// template's trigger holds, once each, ≤ maxUnread unread; an answer = happiness +1 (later = 0) and the office's
// action; unanswered letters archive after archiveDays; the save round-trips; every string key exists (ko + en).
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const { VillageNews, LETTERS, BLD } = await import(path.join(ROOT, 'src/systems/VillageNews.js'));
const { BALANCE } = await import(path.join(ROOT, 'src/data/balance.js'));
const S = await import(path.join(ROOT, 'src/data/strings.js'));

let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra) : '')); } };
const N = BALANCE.v42.news, LT = BALANCE.v42.letters;

function world() {
  const L = {};
  const clock = { t: 0, hourLen: 25, on: true, day() { return Math.floor(this.t / (24 * this.hourLen)); }, hour() { return (this.t / this.hourLen) % 24; }, dayLen() { return 24 * this.hourLen; } };
  const built = new Set(['town_hall']);
  const actions = [];
  const office = { built: false, hires: new Set(), depositedTotal: 0, hired(r) { return this.hires.has(r); }, letters: [], papers: [], onLetter(r) { this.letters.push(r); }, onPaper(d) { this.papers.push(d); }, letterAction(act) { actions.push(act); } };
  const full = {};
  const gs = {
    events: { on: (e, f) => ((L[e] = L[e] || []).push(f)), off: () => {}, emit: (e, ...a) => (L[e] || []).forEach((f) => f(...a)) },
    time: { now: 0 }, economy: { earned: 0 }, life: { moved: [] }, civic: null, sites: {}, ui: { toast() {} },
    isBuilt: (k) => built.has(k), v4: { clock, rank: { level: 2 }, town: { population: () => 40 }, arrivals: 0 },
  };
  const v42 = { office, freight: { big: 0, stats: { exported: 0, waitT: 0 } }, ledger: { fullFor: (id) => full[id] || 0, rows: () => [], status: () => 'ok' }, aura: { on: true }, trainNew: () => true };
  return { gs, v42, clock, office, built, actions, full };
}
const run = (W, N, sec, dt = 0.5) => { for (let s = 0; s < sec; s += dt) { W.clock.t += dt; W.gs.time.now += dt * 1000; N.update(dt); } };

console.log('papers');
{
  const W = world();
  const P = new VillageNews(W.gs, W.v42, null);
  run(W, P, 24 * 25 * 2);
  ok(P.list.length === 0 && P.inbox.length === 0, 'no office: no paper, no letter');
  W.office.built = true;
  run(W, P, 24 * 25 * 2);
  ok(P.list.length === 0, 'the office without 소복이: no paper yet');
  ok(P.inbox.length > 0, 'the office alone already gets letters (' + P.inbox.length + ')');
  W.office.hires.add('bok');
  W.clock.t = Math.ceil(W.clock.t / (24 * 25)) * 24 * 25;          // midnight
  W.gs.events.emit('v4:visitorDone'); W.gs.events.emit('sold'); W.gs.events.emit('built', 'warehouse');
  W.gs.economy.earned += 1500; W.v42.freight.stats.exported += 30;
  run(W, P, (N.hour - 0.5) * 25);
  const before = P.list.length;
  run(W, P, 25);
  ok(P.list.length === before + 1 && P.day === W.clock.day(), 'one paper at news.hour (' + N.hour + ':00)');
  run(W, P, 10 * 25);
  ok(P.list.length === before + 1, 'not twice the same day');
  const last = P.papers()[P.papers().length - 1];
  ok(last.lines.length >= 1 && last.lines.length <= 5 && last.lines.every((x) => typeof x === 'string' && x.length > 3 && !/\{|\}/.test(x)), 'headlines are filled strings (≤ 5)', last.lines);
  ok(last.lines.some((x) => /1,?500|1500/.test(x)) && last.lines.some((x) => /30/.test(x)), "the day's coins and exports are in the headlines");
  for (let d = 0; d < 5; d++) run(W, P, 24 * 25);
  ok(P.list.length === (N.keep || 3), 'keeps news.keep papers (' + P.list.length + ')');
  ok(W.office.papers.length >= 2, 'the office hears of each paper (mail flag / board)');
}

console.log('letters');
{
  const W = world();
  W.office.built = true;
  const P = new VillageNews(W.gs, W.v42, null);
  // triggers: the miner (ore pile full 2 min), the porter (freight waiting 2 min), the kid (town hall), grandma (day ≥ 2)
  W.full['pile:ore'] = 200; W.v42.freight.stats.waitT = 200;
  // (answer each letter the moment it arrives, before it can archive)
  const fresh = {};
  for (let s = 0; s < 24 * 25 * 3; s += 0.5) { W.clock.t += 0.5; W.gs.time.now += 500; P.update(0.5); for (const q of P.inbox) if (!fresh[q.tpl]) fresh[q.tpl] = q; }
  const tpls = Object.keys(fresh);
  ok(tpls.includes('miner') && tpls.includes('porter') && tpls.includes('kid'), 'due templates arrive (' + tpls.join(', ') + ')');
  ok(new Set(tpls).size === tpls.length, 'each template once');
  ok(P.unread() <= LT.maxUnread, '≤ maxUnread unread');
  ok(!tpls.includes('banker'), 'no banker letter before the bank');
  // answer (a fresh letter: unread)
  const W2 = world(); W2.office.built = true; W2.full['pile:ore'] = 200; W2.v42.freight.stats.waitT = 200;
  const P2 = new VillageNews(W2.gs, W2.v42, null);
  let r = null, k = null;
  for (let s = 0; s < 24 * 25 * 3 && !(r && k); s += 0.5) { W2.clock.t += 0.5; P2.update(0.5); r = r || P2.inbox.find((q) => q.tpl === 'miner' && q.state === 0); k = k || P2.inbox.find((q) => q.tpl === 'porter' && q.state === 0); }
  const h0 = P2.happy;
  ok(r && P2.answer(r.id, 0) && P2.happy === h0 + 1 && W2.actions.includes('st2:smelter'), 'answer: happiness +1 and the office acts (st2:smelter)');
  ok(r && !P2.answer(r.id, 0), 'a letter is answered once');
  if (k && k.state < 2) { const h1 = P2.happy; P2.answer(k.id, 1); ok(P2.happy === h1 && W2.actions[W2.actions.length - 1] === 'later', "'나중에' (later): no happiness"); }
  ok(P.happyBonus() <= 5, 'happiness from letters is capped (5)');
  // archive
  W.office.letters.length = 0;
  run(W, P, 24 * 25 * (LT.archiveDays + 1));
  ok(P.inbox.every((q) => q.state >= 2), 'unanswered letters archive after archiveDays (' + P.inbox.map((q) => q.state).join('') + ')');
  // the bank's letter: 3 days after the bank opens
  W.built.add('bank42');
  run(W, P, 24 * 25 * 4);
  ok(P.inbox.some((q) => q.tpl === 'banker'), 'the banker writes 3 days after the bank opens');
  // save round trip
  const o = {};
  P.serializeInto(o);
  const Q = new VillageNews(W.gs, W.v42, JSON.parse(JSON.stringify(o)));
  ok(Q.inbox.length === P.inbox.length && Q.inbox.every((q, i) => q.tpl === P.inbox[i].tpl && q.state === P.inbox[i].state) && Q.happy === P.happy && Q.list.length === P.list.length, 'save → load: the same inbox, papers and happiness');
  const Q2 = new VillageNews(W.gs, W.v42, JSON.parse(JSON.stringify(o)));
  run(W, Q2, 24 * 25 * 3);
  const again = Q2.inbox.map((q) => q.tpl).filter((t) => P.once.has(t) && !P.inbox.some((x) => x.tpl === t && x.id === Q2.inbox.find((y) => y.tpl === t).id));
  ok(again.length === 0, 'a reload never sends a template twice', again);
}

console.log('strings');
{
  const miss = [];
  for (const lang of ['ko', 'en']) {
    const T = S.STRINGS ? S.STRINGS[lang] : null;
    if (!T) continue;
    for (const tpl of LETTERS) for (const suf of ['_from', '_body']) if (!T['lt_' + tpl + suf]) miss.push(lang + ':lt_' + tpl + suf);
    for (const k of ['news_rank', 'news_building', 'news_exports', 'news_visitors', 'news_sales', 'news_movein', 'news_courier', 'news_coins', 'news_quiet', 'news_snow', 'news_dog', 'news_bread', 'letterThanks']) if (!T[k]) miss.push(lang + ':' + k);
    for (const b of BLD) if (!T['b_' + b]) miss.push(lang + ':b_' + b);
  }
  ok(S.STRINGS ? miss.length === 0 : true, 'every letter / headline / building key in ko + en', miss.slice(0, 10));
  const W = world();
  const P = new VillageNews(W.gs, W.v42, null);
  const bad = [];
  for (const tpl of LETTERS) for (const b of P.buttons(tpl)) if (!S.t(b.k) || S.t(b.k) === b.k) bad.push(b.k);
  ok(bad.length === 0, 'every letter button has a label', bad);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
