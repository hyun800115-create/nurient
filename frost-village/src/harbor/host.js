// HarborHost (harbor_runtime, docs/v5_v8_plan.md §5.2 / §6.4): ports -> the pure model -> the Phaser view.
// Runs headless when no view class is given (Node tests): everything the game sees goes through `api` and events.
//
//   host = new HarborHost(ports, savedSlice, { View, tuning, seed })
//   host.update(dt) · host.onFeed(ev) · host.serialize() · host.api (gs.later.harbor) · host.destroy()

import { BALANCE } from '../data/balance.js';
import { harborTuning, HARBOR_TUNING, STEPS } from './tuning.js';
import { HarborModel } from './model/HarborModel.js';
import { sanitizeHarbor, fitHarbor } from './save.js';
import { ht, HSTR } from './strings.js';
import { PADS, LR, BLD, wpx2L } from './layout.js';
import { hourOf } from './model/time.js';

/** the cute happenings this module stages (story's HappeningClock format, docs/v5_v8_plan.md §6.1.6) */
export const HARBOR_HAPPENINGS = [
  { id: 'P7', key: 'gull_grab', ko: '갈매기의 생선구이 습격', en: 'The gull’s grilled-fish raid', where: 'harbor_restaurant', need: 'terminal',
    toastKo: '갈매기가 관광객 생선구이를 낚아챘어요!', toastEn: 'A gull snatched a tourist’s grilled fish!', chief: 'watch', fame: 2, secs: 12 },
  { id: 'P8', key: 'crate_wobble', ko: '크레인 상자 흔들흔들', en: 'The crane’s wobbly crate', where: 'harbor_crane', need: 'crane',
    toastKo: '크레인 상자가 흔들흔들~ 부두 일꾼들이 깜짝!', toastEn: 'The crane’s crate wobbles — the dock workers jump!', chief: 'watch', fame: 2, secs: 10 },
];

const PAD_R = 58;               // px: standing on a pad (like v4 Pad radius 1.45 m)
const TAKE_EVERY = 0.12;        // s per item taken from the chief (v4 input pads)

export class HarborHost {
  constructor(ports, saved, opts = {}) {
    this.ports = ports;
    this.opts = opts;
    this.cfg = opts.tuning ? harborTuning({ v6: { harbor: opts.tuning } }) : harborTuning(opts.balance || BALANCE) || HARBOR_TUNING;
    const clean = sanitizeHarbor(saved);
    this.model = new HarborModel({ tuning: this.cfg, saved: clean, seed: opts.seed || 20261010, T: this.T() });
    this.offered = null;          // step whose site is offered
    this.callT = null;            // the far horn ("the call") at 도시 + 1 min
    this.called = false;
    this.padT = 0;
    this.stats = { ms: 0, n: 0 };
    this.view = opts.View && ports.world && ports.world.scene ? new opts.View(this, ports) : null;
    this.api = this.makeApi();
    if (ports.rail && ports.rail.add) this.railDrawn = !!ports.rail.add(this.model.coast);
    this.offerNext();
  }

  T() { return this.ports.clock ? this.ports.clock.T() : 0; }
  lang() { return this.ports.lang ? this.ports.lang() : 'ko'; }
  rank() { return this.ports.rank ? this.ports.rank() : 3; }

  // ------------------------------------------------------------------------------------------ sites (P29)
  /** offer the next revive step's site (and the trawler order once the shipyard stands) */
  offerNext() {
    const P = this.ports, m = this.model;
    const step = m.revive.next();
    if (step && step !== this.offered && (m.open || step === 'railExt') && (step !== 'railExt' || this.rank() >= 3)) {
      this.offered = step;
      const def = m.revive.site(step, this.cfg);
      def.name = ht(this.lang(), 's_' + step);
      if (P.sites && P.sites.offer) P.sites.offer(def);
      if (this.view) this.view.siteOffered(def);
    }
    if (m.has('shipyard') && m.fleet.canOrder() && this.offeredTrawler !== m.fleet.total()) {
      this.offeredTrawler = m.fleet.total();
      const [x, y] = LR(PADS.trawler.i, PADS.trawler.j);
      const T = this.cfg.trawler;
      const def = { id: 'h_trawler_' + (m.fleet.total() + 1), step: 'trawler', x, y, key: 'trawler_big', cost: { coins: T.coins, item_plank: T.item_plank, item_ingot: T.item_ingot }, time: 1, name: ht(this.lang(), 'trawlerOrder') };
      if (P.sites && P.sites.offer) P.sites.offer(def);
      if (this.view) this.view.siteOffered(def);
    }
  }

  /** a site of ours was built (the game's Site flow reports `built` with the site id) */
  built(siteId) {
    const m = this.model;
    if (/^h_trawler_/.test(siteId)) { if (m.orderTrawler()) { this.offeredTrawler = -1; this.toast(ht(this.lang(), 'trawlerOrder')); } return true; }
    const step = String(siteId).replace(/^h_step_/, '');
    if (STEPS.indexOf(step) < 0) return false;
    const ok = m.build(step, this.T());
    if (ok) { this.offered = null; this.drainModel(); this.offerNext(); }
    return ok;
  }

  // ------------------------------------------------------------------------------------------ frame
  update(dt) {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const P = this.ports, m = this.model, T = this.T();
    // the call: 1 min after 도시, a far horn, gulls and rumours; the rail-end sign sparkles
    if (!m.open && this.rank() >= 3) {
      if (this.callT === null) this.callT = T + 60;
      if (!this.called && T >= this.callT) { this.called = true; this.call(); }
      if (!this.offered) this.offerNext();
    }
    m.update(dt, T, { blocked: P.rail && P.rail.blockedAhead ? (nose, dir, ahead) => P.rail.blockedAhead('coast', nose, dir, ahead) : null });
    this.drainModel();
    this.runTimers();
    this.pads(dt);
    if (this.view) this.view.update(dt);
    if (t0) { this.stats.ms += performance.now() - t0; this.stats.n++; }
  }

  drainModel() { for (const ev of this.model.drain()) this.onModel(ev); }

  /** game-time timers (pause-safe) */
  later(s, fn) { (this.timers = this.timers || []).push({ t: this.T() + s, fn }); }
  runTimers() {
    if (!this.timers || !this.timers.length) return;
    const T = this.T(), due = this.timers.filter((x) => x.t <= T);
    if (!due.length) return;
    this.timers = this.timers.filter((x) => x.t > T);
    for (const d of due) d.fn();
  }

  call() {
    const P = this.ports, lang = this.lang();
    if (P.sound && P.sound.play) P.sound.play('sfx_ship_horn_big', { volume: 0.25, pan: 0.7 });
    this.later(1.6, () => { if (P.sound && P.sound.play) P.sound.play('sfx_seagull_1', { volume: 0.4, pan: 0.6 }); });
    this.later(6, () => { if (!this.model.open) this.toast(ht(this.lang(), 'rumour1')); });
    this.later(14, () => { if (!this.model.open) this.toast(ht(this.lang(), 'rumour2')); });
    this.toast(ht(lang, 'hornFar'));
    if (P.emit) P.emit({ t: 'harbor:call' });
    if (this.view) this.view.call();
  }

  toast(msg, hold) { const P = this.ports; if (P.ui && P.ui.toast) P.ui.toast(msg, hold); }

  onModel(ev) {
    const P = this.ports, lang = this.lang();
    switch (ev.t) {
      case 'coins': {
        const at = ev.at ? LR(ev.at[0], ev.at[1]) : ev.from === 'auction' ? LR(PADS.auction.i, PADS.auction.j) : LR(PADS.export.i, PADS.export.j);
        if (P.coins && P.coins.add) P.coins.add(ev.n, at[0], at[1] - 60, ev.from !== 'tourist', 'harbor:' + ev.from);
        break;
      }
      case 'harbor:open':
        if (P.world && P.world.open) P.world.open('harbor');
        if (P.ui && P.ui.banner) P.ui.banner(ht(lang, 'found'), ht(lang, 'foundSub'));
        break;
      case 'harbor:step': if (ev.step !== 'railExt' && P.ui && P.ui.banner) P.ui.banner(ht(lang, 'stepDone', { name: ht(lang, 's_' + ev.step) }), ''); break;
      case 'harbor:import': if (ev.first && P.ui && P.ui.banner) { const k = 'i_' + ev.kind; P.ui.banner(ht(lang, 'importFirst', { kind: ht(lang, k), what: '' }).trim(), whatOf(k, lang)); } break;
      case 'harbor:star': if (ev.n >= 2 && P.ui && P.ui.banner) P.ui.banner(ht(lang, 'star', { n: ev.n }), ht(lang, ev.n >= 3 ? 'star3' : 'star2')); break;
      case 'harbor:guest': this.toast(ht(lang, 'guest_' + ev.kind, { item: ev.item || '' })); break;
      case 'harbor:settler': this.toast(ht(lang, 'settler')); break;
      case 'harbor:rare': this.toast(ht(lang, 'rareFish')); break;
      case 'harbor:trawler': if (ev.op === 'launch') this.toast(ht(lang, 'trawlerLaunch')); if (ev.op === 'launched') this.offerNext(); break;
      case 'harbor:ship':
        if (ev.kind === 'cargo' && ev.op === 'arrive') this.toast(ht(lang, 'cargoIn', { order: orderText(ev.items, lang) }), 4);
        break;
      case 'train': if (P.rail && P.rail.event && this.railDrawn) P.rail.event(ev.ev, ev.stop, ev.line); break;
      default: break;
    }
    if (this.view) this.view.onModel(ev);
    // module events out (the GameFeed bus): harbor:* and the coast train
    if (P.emit && (/^harbor:/.test(ev.t) || ev.t === 'train')) P.emit(ev);
  }

  /** the chief on our pads: goods to the export quay, fish to the auction */
  pads(dt) {
    const P = this.ports, m = this.model, ch = P.chief;
    if (!ch || !ch.x) return;
    const cx = ch.x(), cy = ch.y();
    this.padT -= dt;
    if (this.padT > 0) return;
    const on = (p) => { const [x, y] = LR(p.i, p.j); return Math.hypot(cx - x, (cy - y) * 2) < PAD_R * 2 ? [x, y] : null; };
    let at;
    if (m.has('crane') && (at = on(PADS.export))) {
      const need = m.trade.needs(m.T);
      for (const item of Object.keys(need).concat(Object.keys(need).indexOf('tools') >= 0 ? ['item_axe', 'item_pickaxe', 'item_rod', 'item_sickle', 'item_bow'] : [])) {
        if (item === 'tools' || !(ch.count(item) > 0)) continue;
        if (ch.take(item, 1, at[0], at[1] - 30) > 0) { m.deliver(item, 1, m.T); this.drainModel(); this.padT = TAKE_EVERY; if (this.view) this.view.padTook('export', item); return; }
      }
    }
    if (m.has('auction') && (at = on(PADS.auction))) {
      for (const item of ['item_fish_big', 'item_fish_raw']) {
        if (!(ch.count(item) > 0)) continue;
        if (ch.take(item, 1, at[0], at[1] - 30) > 0) { m.dropFish(item, 1); this.padT = TAKE_EVERY; if (this.view) this.view.padTook('auction', item); return; }
      }
    }
  }

  // ------------------------------------------------------------------------------------------ feed (game -> module)
  onFeed(ev) {
    if (!ev || !ev.t) return;
    const m = this.model;
    switch (ev.t) {
      case 'built': if (ev.siteId || ev.key) this.built(ev.siteId || ev.key); break;
      case 'rank': if (ev.level >= 3 && this.callT === null) this.callT = this.T() + 60; break;
      case 'delivered': if (ev.pad === 'h_export') m.deliver(ev.item, ev.n || 1, this.T()); else if (ev.pad === 'h_auction') m.dropFish(ev.item, ev.n || 1); break;
      case 'veh:freight': if (ev.to === 'h_export' && ev.items) for (const k in ev.items) m.deliver(k, ev.items[k], this.T()); break;
      default: break;
    }
    this.drainModel();
  }

  serialize() { return fitHarbor(this.model.serialize()); }
  state() { return this.model.state(); }

  /** stage one of our happenings (the story module's scheduler or the designer preview calls it) */
  happening(id) { if (this.view) return this.view.happening(id); return false; }

  makeApi() {
    const m = this.model, host = this;
    return {
      open: () => m.open,
      star: () => m.stars.n,
      nextShip: (kind) => m.nextShip(kind),
      exports: () => m.trade.contracts.map((c) => ({ id: c.id, items: Object.assign({}, c.items), got: Object.assign({}, c.got), due: c.due, done: c.done, expired: !!c.expired })),
      needs: () => m.trade.needs(m.T),
      imports: () => ({ unlocked: m.trade.unlocked.slice(), stock: Object.assign({}, m.trade.stock) }),
      hasImport: (kind) => m.trade.has(kind),
      takeImport: (kind, n) => m.takeImport(kind, n),
      touristsToday: () => m.tourists.today,
      auction: () => ({ next: m.auction.next(m.T), today: m.auction.coins, waiting: m.auction.waiting() }),
      deliver: (item, n) => m.deliver(item, n, m.T),
      dropFish: (item, n) => m.dropFish(item, n),
      coastLine: m.coast,
      addCoastStop: (stop) => m.addCoastStop(stop),
      residents: () => m.residents,
      happening: (id) => host.happening(id),
      happenings: HARBOR_HAPPENINGS,
      state: () => m.state(),
    };
  }

  destroy() { if (this.view) this.view.destroy(); this.view = null; }
}

function whatOf(k, lang) { const e = HSTR[k]; return e && e.what ? (e.what[lang] || e.what.ko) : ''; }
function orderText(items, lang) {
  const names = { item_can: ['통조림', 'cans'], item_plank: ['판자', 'planks'], item_bread: ['빵', 'bread'], item_fish_cooked: ['구운 생선', 'grilled fish'], item_ingot: ['주괴', 'ingots'], tools: ['도구', 'tools'], item_fish_big: ['참치', 'tuna'] };
  return Object.keys(items || {}).map((k) => (names[k] ? names[k][lang === 'en' ? 1 : 0] : k) + ' ' + items[k]).join(lang === 'en' ? ' + ' : ' + ');
}

export { hourOf, BLD, wpx2L };
