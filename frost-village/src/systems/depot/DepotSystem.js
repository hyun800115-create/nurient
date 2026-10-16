// (v4.2, docs/v42_plan.md §4.4, F8) 서리 물류창고 — gs.v42.depot. The site (WORLD.plots v42_depot: after 읍 + the 창고 + the
// se land), the building (DepotBuilding), the cargo sleigh(s) from the station's dock (CargoSleigh), the racks (Depot
// model) and the walk-in 솔방울 상인 (sales per minute while open -> coins into the 물류 금고; a few buyer walkers when
// the depot is on screen). The surplus the train cannot carry reaches the racks; the 재고 tab shows its row.
// Interface (frozen at C1-P0): wants(ty), room(), take(load), stock, built.
// Save: v42.depot { st, sleighs, load, porters34, sales } + the v8 `logistics` slice (Depot.slice()).

import { BALANCE } from '../../data/balance.js';
import { WORLD, L4 } from '../../data/world.js';
import { Character } from '../../entities/Character.js';
import { DepotBuilding } from '../../entities/DepotBuilding.js';
import { CargoSleigh } from '../../entities/CargoSleigh.js';
import { TF } from '../../core/Townfolk.js';
import { Assets } from '../../core/Assets.js';
import { Depot } from './Depot.js';
import { ITEMS } from '../../data/items.js';
import { t } from '../../data/strings.js';

const D = () => (BALANCE.v42 && BALANCE.v42.depot) || {};

export class DepotSystem {
  constructor(gs, v42, saved) {
    this.gs = gs;
    this.v42 = v42;
    const s = (saved && saved.depot) || {};
    this.model = new Depot(v42.savedLgx);
    this.sleighN = s.sleighs === 2 ? 2 : 1;
    this.loadSaved = s.load && typeof s.load === 'object' ? s.load : {};
    this.salesSaved = Array.isArray(s.sales) ? s.sales : [0, 0, 0];
    this.building = null;
    this.sleighs = [];
    this.buyers = [];
    this.buyT = 4;
    this.camReveal = false;
  }

  get built() { return !!this.building; }
  handles(bkey) { return bkey === 'depot42'; }
  get stock() { return this.model.stock; }
  get till() { return this.building ? this.building.till : null; }
  wants(ty) { return this.model.wants(ty); }
  /** room for surplus (all categories) */
  room() { if (!this.building) return 0; let n = 0; for (const c of ['materials', 'food', 'goods', 'tools']) n += Math.max(0, (Number(this.model.stock.cap[c]) || 0) - this.model.stock.total(c)); return n; }
  total() { return this.model.total(); }
  capTotal() { return this.model.capTotal(); }

  makeBuilding(bkey, site, instant) {
    const gs = this.gs;
    this.building = new DepotBuilding(gs, site, this);
    this.addSleighs();
    // goods that were on the sleigh at the save go back to the dock pile
    const F = this.v42.freight;
    if (F) for (const k in this.loadSaved) if (ITEMS.indexOf(k) >= 0) F.addSurplus(k, Math.max(0, Math.floor(Number(this.loadSaved[k]) || 0)));
    this.loadSaved = {};
    if (!instant) gs.ui.banner(t('builtDone', { name: t('b_depot42') }), t('bsub_depot42'));
    // the v4.2 lanes join the street paint (dirt) once the depot stands
    if (gs.v4 && gs.v4.paint && gs.v4.paint.addV42Streets) gs.v4.paint.addV42Streets();
    return this.building;
  }

  addSleighs() { while (this.sleighs.length < this.sleighN) this.sleighs.push(new CargoSleigh(this.gs, this, this.sleighs.length)); }

  /** the sleigh arrives at bay 2: the racks take what fits; the rest rides back */
  unload(load) {
    const got = this.model.take(load);
    const back = [];
    for (const q of load) { const g = got.find((x) => x.ty === q.ty); const left = q.n - (g ? g.n : 0); if (left > 0) back.push({ ty: q.ty, n: left }); }
    return back;
  }

  clock() { const nb = this.gs.v4; return nb && nb.clock && nb.clock.on ? nb.clock : null; }

  update(dt) {
    if (!this.building) return;
    const gs = this.gs, c = this.clock();
    this.building.update(dt);
    for (const s of this.sleighs) s.update(dt);
    if (c) this.model.newDay(c.day());
    // the buyers (analytic: coins into the 물류 금고; a few walkers when on screen)
    const sold = this.model.sell(dt, c ? c.hour() : 12);
    if (sold.length) {
      const coins = sold.reduce((a, q) => a + q.coins, 0);
      const till = this.building.till;
      if (gs.isOnScreen(till.x, till.y, 300)) till.add(coins, this.building.door.x, this.building.door.y - 30);
      else till.value += coins;
      const O = this.v42.office;
      if (O) O.income.depot = (O.income.depot || 0) + coins;
    }
    this.buyT -= dt;
    if (this.buyT <= 0) { this.buyT = Number(D().sell && D().sell.every) || 8; if (sold.length || this.model.today.sales > 0) this.spawnBuyer(); }
    for (let i = this.buyers.length - 1; i >= 0; i--) { const b = this.buyers[i]; if (!b.alive) { this.buyers.splice(i, 1); continue; } b.tick(dt); }
  }

  /** a 솔방울 상인 walks the footpath to the door, waits, leaves with a parcel (only near the view, ≤ 3) */
  spawnBuyer() {
    const gs = this.gs, B = this.building;
    if (this.buyers.length >= 3 || !gs.isOnScreen(B.door.x, B.door.y, 400) || !TF.ok || !TF.readyFor(Assets, 'adult')) return;
    const walk = (WORLD.v4.streets.concat(WORLD.v42.streets).find((s) => s.id === 'lgx_walk') || {}).pts || [[23.8, -24.2], [23.8, -31.0], [27.3, -31.0]];
    let sd = (this.model.today.sales * 7919 + this.buyers.length * 31) >>> 0 || 1;
    const rng = () => { sd ^= sd << 13; sd >>>= 0; sd ^= sd >>> 17; sd ^= sd << 5; sd >>>= 0; return (sd % 100000) / 100000; };
    let person = null;
    try { person = TF.person(rng, null); } catch (e) { return; }
    if (!person) return;
    const pts = walk.map(([i, j]) => { const [x, y] = L4(i, j); return { x, y }; });
    const ch = new Character(gs, 'tf:' + person.base, pts[0].x, pts[0].y, { person, radius: 12 });
    ch.route = pts.slice(1).concat([{ x: B.door.x - 10, y: B.door.y + 20 }]);
    ch.ri = 0;
    ch.phase = 'in';
    ch.waitT = 3;
    ch.tick = (dt) => {
      if (ch.phase === 'in' || ch.phase === 'out') {
        if (gs.followRoute(ch, 95, dt, 10)) {
          if (ch.phase === 'in') { ch.phase = 'buy'; ch.vx = ch.vy = 0; ch.locomotion(false); }
          else { ch.alive = false; ch.destroy(); return; }
        }
      } else if (ch.phase === 'buy') {
        ch.waitT -= dt;
        if (ch.waitT <= 0) { ch.phase = 'out'; ch.route = pts.slice().reverse(); ch.ri = 0; if (Assets.has('cardboard_box_s')) { ch.stack.push('cardboard_box_s', null, gs.effects); } }
      }
      if (ch.alive) ch.sync(dt);
    };
    this.buyers.push(ch);
  }

  serializeInto(o) {
    const load = {};
    for (const s of this.sleighs) for (const q of s.load) load[q.ty] = (load[q.ty] || 0) + q.n;
    const st = this.building ? 2 : (this.gs.sites && this.gs.sites.v42_depot && this.gs.sites.v42_depot.state !== 'plot' ? 1 : 0);
    o.depot = { st, sleighs: this.sleighN, load, porters34: Math.max(0, ((this.gs.v4 && this.gs.v4.growth && this.gs.v4.growth.porters.length) || 0) - 2), sales: [Math.max(0, this.model.day), this.model.today.sales, this.model.today.coins] };
  }

  /** the v8 logistics slice (only once the depot stands) */
  slices() { return this.building ? { logistics: this.model.slice() } : {}; }

  state() {
    return { built: this.built, total: this.total(), cap: this.capTotal(), stock: this.model.stock.snapshot(), today: Object.assign({}, this.model.today), sleighs: this.sleighs.map((s) => ({ state: s.state, s: +s.s.toFixed(1), load: s.count(), trips: s.trips })), till: this.building ? this.building.till.value : 0, buyers: this.buyers.length, revealed: this.building ? this.building.revealed : false };
  }

  hooks(H) {
    H.depot = (o) => {
      const gs = this.gs;
      if (o && o.build) { const st = gs.sites && gs.sites.v42_depot; if (st && !gs.isBuilt('depot42')) { st.setShown(true); if (st.state === 'plot') st.start('depot42', { instant: true }); if (st.state !== 'done') st.finish(true); } }
      if (o && o.stock) for (const k in o.stock) this.model.take([{ ty: k, n: o.stock[k] }]);
      return this.state();
    };
  }

  destroy() { if (this.building) this.building.destroy(); for (const s of this.sleighs) s.destroy(); for (const b of this.buyers) if (b.alive) b.destroy(); }
}
