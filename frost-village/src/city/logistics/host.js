// LogisticsHost — the 솔방울 물류센터 module between the game (ports) and the pure LgxModel (+ the Phaser LgxView).
//   - the call (beach ★2 — the bank manager's letter) and the site at c_logistics (v4 Site flow, P29)
//   - feeds the model: shops' restock needs (P32), homes (살림살이), freight trucks, the receiving pad, story pick-ups
//     and move-ins, the producers (Civic M plots, P27); drains its events to the game (lgx:*)
//   - the 물류 금고: settlements pile up there and drop into the coin counter every `collectEvery` s
//   - api = gs.later.logistics (docs/v5_v8_plan.md §6.6)
// Runs headless (no View) in Node tests. Never touches Phaser itself.
// (Not to be confused with v4's src/systems/Logistics.js — the porters' sink router. The centre's receiving pad is
//  one more sink there, added through ports.sinks at integration.)

import { LgxModel } from './model/LgxModel.js';
import { layoutFor } from './layout.js';
import { lgxTuning, LGX_TUNING } from './tuning.js';
import { lt, ltPick, catName } from './strings.js';
import { CATS } from './model/catalog.js';
import { sanitizeLogistics } from './save.js';

const noop = () => {};

export class LogisticsHost {
  /**
   * ports: see the build report §4 (all optional except clock.T); saved: the `logistics` slice (sanitized here);
   * opts: { View, seed, man (the logistics manifest), tune, price, place ('A' default | 'plan' | { i, j, dock }) }
   */
  constructor(ports, saved, opts = {}) {
    this.P = ports || {};
    this.opts = opts;
    this.tune = opts.tune || lgxTuning(opts.BALANCE) || LGX_TUNING;
    this.saved = saved ? sanitizeLogistics(saved) : null;
    this.seed = opts.seed || 20261010;
    this.lay = layoutFor(opts.place);
    this.anchor = this.lay.ANCHOR.slice();
    this.envT = 0; this.collectT = 0;
    this.env = { shops: [], homes: [] };
    this.producerPos = new Map();             // producer id -> { x, y } world (for the view)
    this.firstSettle = !(this.saved && this.saved.tot && this.saved.tot[0] > 0);
    this.offered = false;
    this.model = null;
    this.view = null;
    this.api = this.makeApi();
    this.tryInit();
  }

  // ------------------------------------------------------------------------------------------ ports (safe calls)
  T() { const c = this.P.clock; return c && c.T ? c.T() : 0; }
  lang() { return this.P.lang ? this.P.lang() : 'ko'; }
  emit(ev) { if (this.P.emit) this.P.emit(ev); }
  toast(m, hold) { if (this.P.ui && this.P.ui.toast) this.P.ui.toast(m, hold); }
  banner(m, s) { if (this.P.ui && this.P.ui.banner) this.P.ui.banner(m, s); }
  manifest() { return this.opts.man || (this.P.assets && this.P.assets.manifest ? this.P.assets.manifest('logistics') : null); }

  /** the model needs the logistics manifest (forkliftPath, rackSlots …): created as soon as it is there */
  tryInit() {
    if (this.model) return true;
    const man = this.manifest();
    if (!man || !man.sprites || !man.sprites.logistics_center) return false;
    this.geo = this.lay.makeGeo(man);
    const price = this.opts.price || ((k) => (this.tune.prices && this.tune.prices[k]) || (this.P.price ? this.P.price(k) : 5));
    this.model = new LgxModel({ tune: this.tune, geo: this.geo, seed: this.seed, saved: this.saved, price,
      deliver: (ord) => this.deliverToShop(ord) });
    // producers come back from the save; the game re-announces their plots (addProducer) for their positions
    if (this.opts.View && this.P.world && this.P.world.scene) this.view = new this.opts.View(this, man, this.opts);
    return true;
  }

  /** a v4 Growth shop takes the goods onto its shelf (P32: no wholesale is paid there any more — it was settled here) */
  deliverToShop(ord) {
    const id = ord.to.slice(5);
    if (this.P.shops && this.P.shops.deliver) return this.P.shops.deliver(id, Object.assign({}, ord.got)) || {};
    return Object.assign({}, ord.got);
  }

  // ------------------------------------------------------------------------------------------ the call + the site
  /** the gate opened (beach ★2): the letter, then the site at c_logistics */
  call() {
    if (!this.model || this.model.open || this.offered) return;
    this.offered = true;
    const T = this.tune.centre;
    if (!this.saved || !this.saved.open) this.toast(lt(this.lang(), 'letter'), 5200);
    if (this.P.sites && this.P.sites.offer) this.P.sites.offer({ id: 'lgx_centre', key: this.lay.CENTRE.key, x: this.anchor[0], y: this.anchor[1], at: { i: this.lay.CENTRE.i, j: this.lay.CENTRE.j },
      cost: { coins: T.coins, item_plank: T.item_plank, item_ingot: T.item_ingot }, time: T.time, name: lt(this.lang(), 'name'), module: 'logistics' });
    this.emit({ t: 'lgx:call' });
  }
  /** a site of this module was finished (P29 Site.finish -> onFeed built) */
  built(siteId) {
    if (!this.tryInit()) return false;
    if (siteId === 'lgx_centre' && !this.model.open) {
      this.model.build(false);
      this.banner(lt(this.lang(), 'opened'), lt(this.lang(), 'openedSub'));
      if (this.view) this.view.opened();
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------------------------------------ feed (game -> module)
  onFeed(ev) {
    if (!ev || !this.tryInit()) return;
    const m = this.model;
    switch (ev.t) {
      case 'built':
        if (ev.siteId) this.built(ev.siteId);
        if (ev.key === 'furniture_workshop' || ev.key === 'appliance_factory') this.api.addProducer(ev.key === 'furniture_workshop' ? 'furniture' : 'appliance', ev.siteId || ev.key, ev.x, ev.y);
        break;
      case 'veh:freight':
        if (ev.to === 'lgx' || ev.to === 'logistics') { const ok = m.inbound(ev.items || {}, ev.from || 'yard', 'truck_cargo'); if (ev.reply) ev.reply(ok); }
        break;
      case 'delivered':
        if (ev.pad === 'lgx_in') m.receive(ev.item, ev.n || 1);
        else if (typeof ev.pad === 'string' && ev.pad.startsWith('lgx_prod:')) m.feedProducer(ev.pad.slice(9), ev.n || 1);
        break;
      case 'story:shop':
        if (ev.op === 'pickup') m.storyPickup(Object.assign({}, ev, { look: this.P.lookOf ? this.P.lookOf(ev.owner) : null }));
        break;
      case 'story:move':
        if (ev.op === 'in') m.moveIn({ home: ev.home || ev.house || (this.P.homeOf ? this.P.homeOf(ev.who) : null), name: ev.name });
        break;
      case 'tap':
        if (this.view && typeof ev.x === 'number') this.view.tapAt(ev.x, ev.y);
        break;
      default: break;
    }
  }

  // ------------------------------------------------------------------------------------------ frame
  update(dt) {
    if (!this.tryInit()) return;
    const m = this.model;
    if (!m.open && !this.offered) this.call();
    const T = this.T();
    this.envT -= dt;
    if (this.envT <= 0) {
      this.envT = 1;
      this.env = {
        shops: this.P.shops && this.P.shops.list ? this.P.shops.list() || [] : [],
        homes: this.P.homes && this.P.homes.list ? this.P.homes.list() || [] : [],
      };
    }
    m.update(dt, T, this.env);
    for (const ev of m.drain()) this.onModel(ev);
    // the 물류 금고 empties itself into the coin counter (like the station till's rent from 읍 on)
    this.collectT += dt;
    if (this.collectT >= this.tune.collectEvery && m.cash > 0) {
      this.collectT = 0;
      const n = Math.floor(m.cash);
      m.cash -= n;
      const [x, y] = [this.anchor[0] + this.lay.TILL[0], this.anchor[1] + this.lay.TILL[1]];
      if (this.P.coins && this.P.coins.add) this.P.coins.add(n, x, y - 40, !!(this.P.view && this.P.view.onScreen ? this.P.view.onScreen(x, y, 120) : true), 'lgx');
      if (this.view) this.view.collected(n);
    }
    if (this.view) this.view.update(dt, m.drainView());
    else m.drainView();
  }

  /** module events out + the little words for the player */
  onModel(ev) {
    const L = this.lang();
    this.emit(ev);
    switch (ev.t) {
      case 'lgx:settle':
        if (this.view) this.view.settled(ev);
        if (this.firstSettle && ev.kind !== 'home') { this.firstSettle = false; this.toast(lt(L, 'firstSettle', { shop: this.shopName(ev.shop) })); }
        break;
      case 'lgx:delivered':
        // one line per 살림살이 round (a van may furnish two homes): the happiness it brings + a diary line
        if (ev.tag === 'lv3') { this.diaryI = (this.diaryI || 0) + 1; const n = ev.to.slice(5).split('+').length; this.toast(lt(L, 'houseLv3', { n: this.tune.houseLv3.happy * n }) + '  ' + (this.diaryI === 1 ? lt(L, 'diary') : ltPick(L, 'diaryAlt', this.diaryI)), 3000); }
        if (ev.tag === 'movein') this.toast(lt(L, 'moveIn'), 2400);
        break;
      case 'lgx:producer':
        break;
      default: break;
    }
  }
  shopName(to) {
    const id = String(to || '').replace(/^(shop|story):/, '');
    const s = (this.env.shops || []).find((q) => q.id === id);
    return (s && s.name) || (this.lang() === 'en' ? 'The shop' : '가게');
  }

  // ------------------------------------------------------------------------------------------ api (gs.later.logistics)
  makeApi() {
    const H = this;
    const M = () => H.model;
    return {
      open: () => !!(M() && M().open),
      /** items of a rack category (materials | food | goods | tools | furniture | appliances), or of one item id */
      stock: (cat) => (!M() ? 0 : CATS.includes(cat) ? M().stock.total(cat) : M().stock.count(cat)),
      stockItems: () => (M() ? M().stock.snapshot() : {}),
      level: (cat) => (M() ? M().stock.level(cat) : 0),
      room: (item) => (M() ? M().room(item) : 0),
      /** an outbound order for a shop (P32 calls this; the centre also polls shops itself) -> id | null */
      order: (shopId, items, o = {}) => (M() ? M().order('shop:' + shopId, items, Object.assign({ kind: 'shop' }, o)) : null),
      /**
       * does the centre look after this shop's `type` (P32: the v4 station porters leave that shelf alone)? Yes while
       * an order for it is open or the racks hold some
       */
      serves: (shopId, type) => {
        const m = M();
        if (!m || !m.open) return false;
        const q = m.openFor('shop:' + shopId);
        return !!((q && (q.want[type] || 0) > 0) || m.stock.count(type) > 0);
      },
      /** a van / truck is turning in the dock lane right now (placement A: the police car waits at its door) */
      laneBusy: () => !!(M() && M().docks.zone),
      /** settle an order (the chief carries a receipt to the counter: mission A22) -> coins */
      settle: (id) => (M() ? M().settle(id) : 0),
      deliveriesToday: () => (M() ? M().deliveriesToday() : 0),
      deliveries: () => (M() ? M().days.slice() : []),
      reveal: (on) => { if (H.view) H.view.reveal(on !== false, 'api'); },
      revealed: () => !!(H.view && H.view.revealed),
      /** porters / the chief at the receiving pad -> taken */
      receive: (item, n) => (M() ? M().receive(item, n) : 0),
      /** a vehicle bringing goods -> accepted { item: n } */
      inbound: (items, from) => (M() ? M().inbound(items, from || 'yard', 'truck_cargo') : {}),
      /**
       * a producer was built on a plot (P27): kind 'furniture' | 'appliance', world x, y of its anchor;
       * o.station === false when the game draws the building itself (the view adds operator, pads, smoke)
       */
      addProducer: (kind, id, x, y, o = {}) => {
        if (!H.tryInit()) return null;
        const pid = String(id || kind);
        if (typeof x === 'number') H.producerPos.set(pid, { x, y, station: o.station !== false });
        const curb = H.stageCurb(x, y);
        const p = M().addProducer(kind, pid, { curb });
        if (H.view && p) H.view.producerAdded(p, H.producerPos.get(pid));
        return p ? p.id : null;
      },
      feedProducer: (id, n) => (M() ? M().feedProducer(id, n) : 0),
      producers: () => (M() ? Array.from(M().producers.values()).map((p) => ({ id: p.id, kind: p.kind, inQ: p.inQ, out: p.outQ.length, made: p.made, working: p.working(), input: p.input, room: p.room() })) : []),
      /** happiness the 살림살이 houses add (Growth.happiness adds it, capped) */
      happyBonus: () => (M() ? M().happyBonus() : 0),
      homesFurnished: () => (M() ? Array.from(M().lv3) : []),
      /** places for missions / story (world px): the settlement counter's door, the receiving pad, the docks */
      places: () => ({
        logistics_office: { x: H.anchor[0] + H.geoPt('door')[0], y: H.anchor[1] + H.geoPt('door')[1] },
        receive: { x: H.anchor[0] + H.geoPt('inPoint')[0], y: H.anchor[1] + H.geoPt('inPoint')[1] },
        till: { x: H.anchor[0] + H.lay.TILL[0], y: H.anchor[1] + H.lay.TILL[1] },
        centre: { x: H.anchor[0], y: H.anchor[1] },
      }),
      state: () => (M() ? M().state() : { open: false }),
    };
  }
  geoPt(k) { return this.geo ? this.geo[k] : [0, 0]; }
  /**
   * a producer standing beside lgx_st on the van's way in (after the stage edge, before the dock lane) gets a kerb
   * stop on the east lane in front of it; anywhere else (an M plot in the village) the pickup is off the stage
   */
  stageCurb(x, y) {
    if (typeof x !== 'number' || typeof y !== 'number') return null;
    const [i, j] = this.pxToL(x, y);
    const { CURB_RANGE, LANES, R } = this.lay;
    if (i < CURB_RANGE.i0 || i > CURB_RANGE.i1 || j < LANES.st_west || j > LANES.st_west + 6) return null;
    const p = R(i, LANES.st_east);
    const q = R(i, j);
    return Math.hypot(p[0] - q[0], p[1] - q[1]) <= CURB_RANGE.maxPx ? p : null;
  }
  pxToL(x, y) { const a = (x - 3120) / 64, b = (y - 1315) / 32; return [(a + b) / 2, (a - b) / 2]; }

  // ------------------------------------------------------------------------------------------ save
  serialize() { return this.model ? this.model.serialize() : this.saved || undefined; }
  destroy() { if (this.view) this.view.destroy(); this.view = null; }

  /** designer preview (이야기 미리보기 — 물류 센터 열기): open now, reveal, a van and an owner on their way */
  preview() {
    if (!this.tryInit()) return false;
    if (!this.model.open) this.built('lgx_centre');
    if (this.view) { this.view.reveal(true, 'preview'); this.view.focus(); }
    return true;
  }
}

export { noop };
