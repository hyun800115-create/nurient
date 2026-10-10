// BeachHost (beach_runtime, docs/v5_v8_plan.md §5.2 / §6.5): ports -> the pure model -> the Phaser view. Runs
// headless when no view class is given (Node tests): everything the game sees goes through `api` and events.
//
//   host = new BeachHost(ports, savedSlice, { View, tuning, seed, looks, defs })
//   host.update(dt) · host.onFeed(ev) · host.serialize() · host.api (gs.later.beach) · host.destroy()

import { BALANCE } from '../data/balance.js';
import { beachTuning, BEACH_TUNING, SITE_STEPS } from './tuning.js';
import { BeachModel, NULL_LOOKS } from './model/BeachModel.js';
import { BEACH_HAPPENINGS } from './model/events.js';
import { sanitizeBeach, fitBeach } from './save.js';
import { bt } from './strings.js';
import { LR, STREETS, ROW1, ROW2, HOTEL, POOL, PLACES, placePos, CLEANUP } from './layout.js';
import { hourOf } from './model/time.js';

const SITE_AT = {
  path: () => { const s = STREETS[0]; return LR((s.i[0] + s.i[1]) / 2 - 8, -6.0); },
  lifeguard: () => LR(101.75, -16.75),
  hotel: () => LR(HOTEL.i, HOTEL.j),
  pool: () => LR(POOL.i, POOL.j),
  aquarium: () => { const b = ROW1[7]; return LR(b.i, b.j); },
  up2: () => LR(HOTEL.i - 1.5, HOTEL.j - 2.4),
  up3: () => LR(HOTEL.i - 1.5, HOTEL.j - 2.4),
};
const SITE_KEY = { path: null, lifeguard: 'lifeguard_tower', hotel: 'resort_hotel', pool: 'hotel_pool', aquarium: 'mini_aquarium', up2: null, up3: null };

export class BeachHost {
  constructor(ports, saved, opts = {}) {
    this.ports = ports || {};
    this.opts = opts;
    this.cfg = opts.tuning ? beachTuning({ v7: { beach: opts.tuning } }) : beachTuning(opts.balance || BALANCE) || BEACH_TUNING;
    const clean = sanitizeBeach(saved);
    const P = this.ports;
    const defs = opts.defs || (P.assets && P.assets.defs ? P.assets.defs() : {});
    const stage = P.stage && P.stage.request ? P.stage : null;
    this.model = new BeachModel({
      tuning: this.cfg, saved: clean, seed: opts.seed || 20261017, T: this.T(), looks: opts.looks || (P.dolls && P.dolls.looks) || NULL_LOOKS, defs, stage: stage || undefined,
      ownRent: !(P.shops && P.shops.growth), ownHappenings: !(P.story && P.story.happenings), fallbackFerry: opts.fallbackFerry !== undefined ? opts.fallbackFerry : !P.harbor,
    });
    this.offered = null;
    this.calledAt = clean ? null : this.T() + (opts.callAfter !== undefined ? opts.callAfter : 60);
    this.waiters = [];           // event(kind) promises
    this.timers = [];
    this.restocks = [];          // standalone porter deliveries
    this.stats = { ms: 0, n: 0, max: 0 };
    this.view = opts.View && P.world && P.world.scene ? new opts.View(this, P) : null;
    this.api = this.makeApi();
    if (P.story && P.story.happenings) P.story.happenings(BEACH_HAPPENINGS, (id) => this.happening(id));
    this.offerNext();
  }

  T() { return this.ports.clock ? this.ports.clock.T() : 0; }
  lang() { return this.ports.lang ? this.ports.lang() : 'ko'; }
  toast(msg, ms = 2400) { if (this.ports.ui && this.ports.ui.toast) this.ports.ui.toast(msg, ms); }
  banner(a, b) { if (this.ports.ui && this.ports.ui.banner) this.ports.ui.banner(a, b || ''); }
  later(s, fn) { this.timers.push({ t: this.T() + s, fn }); }

  // ------------------------------------------------------------------------------------------ sites (P29)
  offerNext() {
    const m = this.model, P = this.ports;
    if (this.calledAt !== null) return;          // the call comes first
    const step = m.nextStep();
    if (!step || step === this.offered || SITE_STEPS.indexOf(step) < 0) return;
    this.offered = step;
    const C = this.cfg, c = step === 'up2' ? { coins: C.hotel.up[0] } : step === 'up3' ? { coins: C.hotel.up[1] } : C[step] || {};
    const cost = { coins: c.coins | 0 };
    for (const k of ['item_plank', 'item_ingot']) if (c[k]) cost[k] = c[k];
    if (step === 'hotel' && C.hotel.glassCrates) cost.crate_glass = C.hotel.glassCrates;
    const [x, y] = SITE_AT[step]();
    const def = { id: 'b_step_' + step, step, x, y, key: SITE_KEY[step], cost, time: step.startsWith('up') ? C.hotel.upTime : c.time || 12, name: bt(this.lang(), 's_' + step) };
    if (P.sites && P.sites.offer) P.sites.offer(def);
    if (this.view && this.view.siteOffered) this.view.siteOffered(def);
    this.emit({ t: 'beach:site', step, id: def.id });
  }
  /** a site of ours was built (the game's Site flow reports `built` with the site id) */
  built(siteId) {
    const step = String(siteId).replace(/^b_step_/, '');
    if (SITE_STEPS.indexOf(step) < 0) return false;
    const ok = this.model.build(step, this.T());
    if (ok) { this.offered = null; this.drain(); this.offerNext(); }
    return ok;
  }

  // ------------------------------------------------------------------------------------------ the tick
  update(dt) {
    const t0 = now();
    const T = this.T(), P = this.ports, m = this.model;
    if (this.calledAt !== null && T >= this.calledAt) this.call();
    if (P.chief && P.chief.x) m.chiefAt(P.chief.x(), P.chief.y(), T);
    m.update(dt, T);
    this.drain();
    if (this.timers.length) { const due = this.timers.filter((x) => x.t <= T); if (due.length) { this.timers = this.timers.filter((x) => x.t > T); for (const d of due) d.fn(); } }
    if (this.restocks.length) this.porter(T);
    const t1 = now();
    if (this.view) this.view.update(dt, T);
    const ms = t1 - t0;
    this.stats.ms = this.stats.ms * 0.95 + ms * 0.05; this.stats.n++; if (ms > this.stats.max) this.stats.max = ms;
  }

  /** the call (1 min after the harbour's ★2): ferry tourists ask for the warm sea, the harbour master shows the map */
  call() {
    this.calledAt = null;
    const L = this.lang();
    this.toast('“' + bt(L, 'callTourist') + '”', 2600);
    this.later(2.8, () => this.toast('“' + bt(L, 'callMaster') + '”', 3200));
    this.emit({ t: 'beach:call' });
    this.offerNext();
  }

  emit(ev) { if (this.ports.emit) this.ports.emit(ev); }

  /** model events -> toasts, banners, coins, missions, the feed, the view */
  drain() {
    const P = this.ports, L = this.lang();
    let stepped = false;
    for (const ev of this.model.drain()) {
      if (ev.t === 'beach:step' || (ev.t === 'beach:shop' && ev.op === 'open')) stepped = true;
      switch (ev.t) {
        case 'coins': {
          const at = ev.at === 'hotel' ? LR(HOTEL.i, HOTEL.j) : ev.at === 'aquarium' ? LR(ROW1[7].i, ROW1[7].j) : (ROW1.concat(ROW2).find((b) => b.shop === ev.at) || HOTEL);
          const xy = Array.isArray(at) ? at : LR(at.i, at.j);
          if (P.coins && P.coins.add) P.coins.add(ev.n, xy[0], xy[1] - 80, !ev.small, 'beach:' + ev.from);
          break;
        }
        case 'beach:step': this.stepBanner(ev, L); break;
        case 'beach:extras': this.later(1.5, () => this.toast(bt(L, 'extras'), 2600)); break;
        case 'beach:star': if (ev.n >= 2) this.banner(bt(L, 'star', { n: ev.n }), bt(L, ev.n >= 3 ? 'star3' : 'star2')); break;
        case 'beach:clean': if (ev.n < ev.max) this.toast(bt(L, 'cleanupHint', { n: ev.n, max: ev.max }), 1400); break;
        case 'beach:checkin': this.toast(bt(L, 'checkin', { n: ev.n }), 1800); break;
        case 'beach:shop':
          if (ev.op === 'open') this.banner(bt(L, 'shopOpen', { name: bt(L, ev.id) }), '');
          else if (ev.op === 'restock') { if (P.shops && P.shops.restock) P.shops.restock(ev.id, ev.need); else this.restocks.push({ id: ev.id, need: ev.need, at: this.T() + 18 }); }
          break;
        case 'beach:event': this.eventOut(ev, L); break;
        case 'beach:happening':
          if (ev.op === 'start') { const h = BEACH_HAPPENINGS.find((x) => x.id === ev.id); if (h && !(P.view && P.view.onScreen && ev.data && ev.data.x && P.view.onScreen(ev.data.x, ev.data.y, 200))) this.toast(L === 'en' ? h.toastEn : h.toastKo, 2400); }
          if (ev.op === 'catch') this.toast(bt(L, 'p12Catch'), 2000);
          break;
        case 'beach:fish': this.toast(bt(L, 'rareFish'), 2200); break;
        default: break;
      }
      if (this.view && this.view.onModel) this.view.onModel(ev);
      if (/^beach:(arrive|leave|checkin|shop|event|star|step|happening|whistle|clean|call|site)$/.test(ev.t)) this.emit(ev);
    }
    if (stepped) this.offerNext();
  }

  stepBanner(ev, L) {
    const P = this.ports;
    if (ev.step === 'reveal') {
      this.banner(bt(L, 'revealTitle'), bt(L, 'revealSub'));
      if (P.world && P.world.reveal) P.world.reveal('beach');
      if (P.sound && P.sound.music) P.sound.music('beach', 6);
      if (P.missions && P.missions.report) P.missions.report({ how: 'stand', code: 'E7' });
    } else if (ev.step === 'cleanup') this.banner(bt(L, 'cleanupDone'), '');
    else if (ev.step === 'lifeguard') this.banner(bt(L, 'open'), bt(L, 'openSub'));
    else if (ev.step === 'board') this.toast(bt(L, 'boardOpen'), 2200);
    else if (ev.step === 'hotel') this.banner(bt(L, 'hotelOpen'), bt(L, 'hotelSub'));
    else if (ev.step === 'pool') this.banner(bt(L, 'poolOpen'), '');
    else if (ev.step === 'aquarium') this.banner(bt(L, 'aquariumOpen'), '');
    else if (ev.step === 'up2' || ev.step === 'up3') this.banner(bt(L, 'hotelUp', { n: ev.level, rooms: ev.rooms }), '');
  }

  eventOut(ev, L) {
    const names = { contest: 'ev_contest', fireworks: 'ev_fireworks', polar: 'ev_polar', week: 'ev_week' };
    if (ev.op === 'start') this.banner(bt(L, names[ev.kind] || ev.kind), bt(L, names[ev.kind] + 'Go'));
    if (ev.op === 'winner') this.banner(bt(L, 'ev_contestPick', { n: String(ev.castle || '').replace(/\D/g, '') || '1' }), '');
    if (ev.op === 'winner' && ev.by === 'chief' && this.ports.missions && this.ports.missions.report) this.ports.missions.report({ how: 'choose', code: 'C11' });
    if (ev.op === 'end' && ev.kind === 'polar') this.toast(bt(L, 'ev_polarDone'), 2400);
    if (ev.op === 'end' || ev.op === 'cancel') {
      const w = this.waiters.filter((x) => x.kind === ev.kind);
      this.waiters = this.waiters.filter((x) => x.kind !== ev.kind);
      for (const x of w) x.resolve({ ok: ev.op === 'end', kind: ev.kind, winner: ev.winner || null, why: ev.why || null });
    }
  }

  /** standalone porter: the village goods reach the beach shop a little later (Growth / freight in the game) */
  porter(T) {
    const due = this.restocks.filter((r) => r.at <= T);
    if (!due.length) return;
    this.restocks = this.restocks.filter((r) => r.at > T);
    const W = this.ports.warehouse;
    for (const r of due) {
      const items = {};
      for (const it in r.need) { const n = W && W.take ? W.take(it, r.need[it]) : r.need[it]; if (n > 0) items[it] = n; }
      this.model.resort.deliver(r.id, items, T);
    }
    this.drain();
  }

  // ------------------------------------------------------------------------------------------ the game feeds us
  onFeed(ev) {
    if (!ev || !ev.t) return;
    const m = this.model, T = this.T();
    switch (ev.t) {
      case 'harbor:ship': if (ev.kind === 'ferry' && ev.op === 'arrive') m.onFerry(ev.n | 0, T); break;
      case 'harbor:tourists': m.onFerry(ev.n | 0, T); break;
      case 'harbor:rare': if (m.resort.donate()) { /* toast in drain */ } break;
      case 'train': if (ev.ev === 'arrive' && ev.stop === 'beach' && ev.line === 'coast' && ev.n) m.crowd.onTrain(ev.n | 0, T); break;
      case 'built': if (ev.siteId) this.built(ev.siteId); break;
      case 'shopOpen': if (ev.board === 'beach' || m.cfg.founding.order.indexOf(ev.id) >= 0) m.shopOpened(ev.id, T); break;
      case 'delivered': if (ev.pad && /^bshop:/.test(ev.pad)) m.resort.deliver(ev.pad.slice(6), { [ev.item]: ev.n | 0 }, T); break;
      case 'veh:freight': if (ev.to && /^b_|^b2_/.test(ev.to) && ev.items) { const b = ROW1.concat(ROW2).find((x) => x.id === ev.to); if (b && b.shop) m.resort.deliver(b.shop, ev.items, T); } break;
      case 'stage:open': if (ev.slot === 'ceremony' && ev.kind !== 'contest' && ev.kind !== 'fireworks' && ev.kind !== 'polar' && ev.kind !== 'reveal') m.events.abort(T); break;
      case 'tap': if (ev.what === 'crab' && this.ports.missions && this.ports.missions.report) this.ports.missions.report({ how: 'tap', what: 'crab' }); break;
      default: break;
    }
    this.drain();
  }

  /** the story's HappeningClock picked one of ours */
  happening(id) { const ok = this.model.events.startHappening(id, this.T()); this.drain(); return ok; }

  // ------------------------------------------------------------------------------------------ public API (gs.later.beach)
  makeApi() {
    const m = this.model, host = this;
    return {
      open: () => m.isOpen(),
      star: () => m.star(),
      hotel: () => m.hotel(),
      crowd: () => m.crowdInfo(),
      /** run an event; resolves { ok, kind, winner, why } when it ends (or is refused) */
      event: (kind) => new Promise((resolve) => {
        const r = m.events.request(kind, host.T());
        if (!r.ok) { resolve({ ok: false, kind, why: r.why }); return; }
        if (kind === 'week') { resolve({ ok: true, kind }); return; }
        host.waiters.push({ kind, resolve });
      }),
      pick: (castle) => { const ok = m.events.pick(castle, host.T(), 'chief'); host.drain(); return ok; },
      step: () => m.nextStep(),
      steps: () => Object.assign({}, m.steps),
      shops: () => Array.from(m.resort.shops),
      card: () => ({ shop: m.resort.cardShop(), need: m.resort.cardNeed(), got: Object.assign({}, m.resort.card) }),
      deliverCard: (items) => { const r = m.resort.deliverCard(items, host.T()); host.drain(); return r; },
      donate: () => { const ok = m.resort.donate(); host.drain(); return ok; },
      places: () => { const out = {}; for (const k of Object.keys(PLACES).concat(['polar'])) out['p:' + k] = placePos(k); return out; },
      findSpot: (what) => (what === 'litter' ? m.cleanupBits().filter((b) => !b.picked).map((b) => ({ x: b.x, y: b.y })) : null),
      staff: () => m.staff(host.T()).map((s) => ({ pid: 'b:' + s.id, role: s.role, preset: s.preset, x: s.x, y: s.y, on: s.on })),
      happenings: () => BEACH_HAPPENINGS.slice(),
      happening: (id) => host.happening(id),
      economy: () => Object.assign({}, m.resort.stats),
      cleanup: () => ({ n: m.cleanCount(), max: CLEANUP.length }),
      hour: () => hourOf(host.T()),
    };
  }

  serialize() { return fitBeach(this.model.serialize()); }
  state() { const m = this.model; return { steps: Object.assign({}, m.steps), stars: m.stars, hotel: m.hotel(), crowd: m.crowdInfo(), shops: Array.from(m.resort.shops), event: m.events.active ? m.events.active.kind : null, ms: Math.round(this.stats.ms * 1000) / 1000 }; }
  objects() { return this.view && this.view.objects ? this.view.objects() : 0; }
  destroy() { if (this.view) { this.view.destroy(); this.view = null; } for (const w of this.waiters) w.resolve({ ok: false, why: 'destroyed' }); this.waiters = []; }
}

function now() { return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now(); }
