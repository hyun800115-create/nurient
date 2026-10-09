// Growth (v4-B, docs/v4_plan.md §8): our village feeds the neighbours and the station district grows.
//   - the 솔방울 주문판 (order board): up to 3 cards; the 5 founding cards come first (a card is offered only once
//     its producer exists), then 정기 납품 cards in rotation; a card with no progress for `swapAfter` s can be
//     swapped for another (free)
//   - the loading dock (짐 싣는 곳): a remote logistics sink at PRIO.WHOLESALE that takes what an open card still
//     needs; every accepted item pays price x wholesale.rate into the station till (역 금고); a finished card pays
//     a bonus on top. Items fly into the goods wagon when the train stands at our station, else onto a crate stack
//     that is loaded at the next arrival
//   - founding: the shop's founder + 2 builders come by the next train -> 25 s build -> ribbon -> open (Shop.js);
//     the first opening brings the mayor's invitation; the founder's household moves into the district
//   - rent of the open shops into the till (capped), from 읍 on the till empties itself every 15 s
//   - the carpenter's houses (HouseLot): planks -> a townhouse -> 4 new neighbours
//   - happiness: base + (100 - base) x mean(the last `window` visitors' satisfaction)
//   - the station porters (Worker.js StationPorter): surplus -> the remote sinks
// API for A (§8.8): shopTargets(), openShopCount(), serialize(); listens to v4:visitorDone, v4:train, built.

import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { BALANCE } from '../data/balance.js';
import { WORLD } from '../data/world.js';
import { t } from '../data/strings.js';
import { gdist } from '../core/Iso.js';
import { DEPTH } from './DepthSort.js';
import { PRIO } from './Logistics.js';
import { priceOf, ITEMS } from '../data/items.js';
import { Pad } from '../entities/Pad.js';
import { ItemStack } from '../entities/ItemStack.js';
import { CashPad } from '../entities/Seller.js';
import { Shop, HouseLot, floatLabel } from '../entities/Shop.js';
import { StationPorter } from '../entities/Worker.js';
import { TF } from '../core/Townfolk.js';
import { F } from './TownSim.js';

const CRATES_SHOWN = 12;     // crate sprites drawn on the dock (the rest is counted)
const LOAD_EVERY = 0.14;     // s between crates flying into the goods wagon

/** the founding table and order (balance.js, checked by balanceCheck) */
const FND = () => BALANCE.v4.founding;

export class Growth {
  constructor(nb, saved) {
    this.nb = nb;
    this.gs = nb.gs;
    const s = saved && typeof saved === 'object' ? saved : {};
    this.saved = s;
    const o = s.orders && typeof s.orders === 'object' ? s.orders : {};
    this.seq = 0;
    this.cards = [];
    for (const c of Array.isArray(o.cards) ? o.cards : []) { const k = this.cardFrom(c); if (k) this.cards.push(k); }
    this.cards = this.cards.slice(0, 3);
    this.done = Array.isArray(o.done) ? o.done.filter((k, i, a) => FND().shops[k] && a.indexOf(k) === i) : [];
    this.standing = Math.max(0, Math.floor(Number(o.standing) || 0));
    this.skipped = [];
    this.cargo = 0;                   // crates waiting on the dock (already counted on their cards)
    this.savedCargo = s.cargo && typeof s.cargo === 'object' ? s.cargo : {};
    this.savedCash = Math.max(0, Math.floor(Number(s.cash) || 0));
    this.rentFrac = 0;
    this.rentAcc = Math.max(0, Math.floor(Number(s.rentAcc) || 0));
    this.payFrac = 0;
    // happiness: the last `window` satisfactions (saved as a count and their sum)
    this.happyList = [];
    const hp = s.happy && typeof s.happy === 'object' ? s.happy : null;
    if (hp && hp.n > 0) { const n = Math.min(200, Math.floor(hp.n)), mean = Math.max(0, Math.min(1, (Number(hp.sum) || 0) / Math.max(1, hp.n))); for (let i = 0; i < n; i++) this.happyList.push(mean); }
    this.porterN = Math.max(0, Math.min(2, Math.floor(Number(s.porters) || 0)));
    this.shops = {};                  // lotId -> Shop
    this.houses = {};                 // lotId -> HouseLot
    this.porters = [];
    this.ready = false;               // the town manifest is here (shops / houses restored)
    this.active = false;              // the square pads exist (the first train came)
    this.loadT = 0;
    const gs = this.gs;
    this.onVisitor = (person, frac) => this.addSatisfaction(frac);
    this.onTrain = (ev, stop) => this.trainEvent(ev, stop);
    this.onFlag = (f) => { if (f === 'firstTrain') this.activate(false); };
    gs.events.on('v4:visitorDone', this.onVisitor);
    gs.events.on('v4:train', this.onTrain);
    gs.events.on('flag', this.onFlag);
    gs.events.once('shutdown', () => this.destroy());
  }

  // ================================================================== lifecycle
  /** the town manifest is here: lots, shops, houses come back from the save */
  onReady() {
    if (this.ready) return;
    this.ready = true;
    const gs = this.gs, s = this.saved;
    const lots = WORLD.v4.lots;
    if (s.shops && typeof s.shops === 'object') {
      for (const id in s.shops) {
        const d = s.shops[id];
        if (!lots[id] || !d || !FND().shops[d.shop] || this.shops[id]) continue;
        this.shops[id] = new Shop(this, id, d.shop, d);
      }
    }
    // a founding card that was done before the save without its lot (old / edited save): its lot appears
    for (const k of this.done) if (!Object.values(this.shops).some((sh) => sh.shop === k)) { const lot = FND().lots[k]; if (lots[lot] && !this.shops[lot]) this.shops[lot] = new Shop(this, lot, k, { st: 'open' }); }
    if (s.houses && typeof s.houses === 'object') for (const id in s.houses) if (lots[id] && !this.houses[id] && !this.shops[id]) this.houses[id] = new HouseLot(this, id, s.houses[id]);
    if (gs.progress.flags.firstTrain) this.activate(true);
    // shops that needed their founder: they ride the next train (a reload lost them in transit)
    for (const id in this.shops) if (this.shops[id].st === 'wait') this.callFounder(this.shops[id]);
    this.houseCheck(true);
  }

  /** the townsfolk sim exists now: the open shops' keeper spot and customer line come from the shop's points */
  onTown() {
    const town = this.nb.town;
    if (!town) return;
    for (const id in this.shops) { const sh = this.shops[id]; if (sh.st === 'open' && sh.staffPt) town.ensureLot(id, { staff: sh.staffPt, customers: sh.customerPoints }); }
  }

  /** the station square comes alive with the first train: the loading dock, the order board, the till */
  activate(instant) {
    if (this.active || !this.ready) return;
    this.active = true;
    const gs = this.gs, Q = WORLD.v4.square;
    // the order board (주문판)
    this.board = Assets.image(gs, Q.board.x, Q.board.y, 'notice_board').setDepth(Q.board.y);
    gs.lazyImage(this.board, 'notice_board');
    gs.territory.add('rail', this.board);
    this.boardObs = gs.collision.add(Q.board.x, Q.board.y, 30, 'board');
    const LB = Object.assign({ board: [0, -150], cargo: [-34, -70], cash: [36, -172] }, Q.labels || {});
    this.boardLabel = floatLabel(gs, Q.board.x + LB.board[0], Q.board.y + LB.board[1], Assets.pick('ui_icon_mission', 'ui_icon_request', 'ui_icon_lock'));
    // the loading dock
    this.dock = { id: 'cargo', x: Q.cargo.x, y: Q.cargo.y, ux: Q.cargo.x + 34, uy: Q.cargo.y + 22, enabled: true, remote: true, isWarehouse: false, kind: 'cargo',
      accepts: (ty) => this.needOf(ty) > 0, room: (ty) => this.needOf(ty), prio: () => PRIO.WHOLESALE, feed: (ch) => this.feedDock(ch) };
    this.dockPad = new Pad(gs, Q.cargo.x, Q.cargo.y, 'input', 1.6, { tex: Assets.pick('ui_pad_porter', 'ui_pad_input'), icon: Assets.pick('ui_icon_delivery', 'ui_icon_backpack'), iconSize: 40 });
    this.dockLabel = floatLabel(gs, Q.cargo.x + LB.cargo[0], Q.cargo.y + LB.cargo[1], Assets.pick('ui_icon_delivery', 'ui_icon_backpack'));
    this.dockLabel.set(t('cargo_pad'));
    this.crates = new ItemStack(gs, { scale: 0.7, cols: [[-24, -6], [0, 6], [24, -6], [-12, 18], [12, 18]], perCol: 3, max: 999 });
    if (gs.logistics) gs.logistics.add(this.dock);
    // the station till (역 금고): wholesale, card bonuses and rent
    this.till = new CashPad(gs, Q.cash.x, Q.cash.y);
    this.till.restore(this.savedCash);
    this.tillLabel = floatLabel(gs, Q.cash.x + LB.cash[0], Q.cash.y + LB.cash[1], 'ui_icon_coin');
    for (const ty in this.savedCargo) { const n = Math.max(0, Math.min(999, Math.floor(Number(this.savedCargo[ty]) || 0))); if (ITEMS.indexOf(ty) >= 0) for (let i = 0; i < n; i++) this.addCrate(ty, null); }
    // the station porters hired before a reload come back (Progression applies the steps; this catches a
    // save whose steps were kept while the porter count was not)
    this.refill(true);
    this.refreshLabels(true);
    if (!instant) for (const o of [this.board, this.dockPad.img, this.till.pad.img, this.dockLabel.c, this.tillLabel.c, this.boardLabel.c]) { const sx = o.scaleX, sy = o.scaleY; o.setScale(0.01); gs.tweens.add({ targets: o, scaleX: sx, scaleY: sy, duration: 420, ease: 'Back.easeOut' }); }
    // pads that never take coins on the spot the chief stands on
    if (gs.padSpots) gs.padSpots.push({ x: Q.cargo.x, y: Q.cargo.y, r: 80 }, { x: Q.cash.x, y: Q.cash.y, r: 80 }, { x: Q.board.x, y: Q.board.y, r: 70 });
    gs.events.emit('v4:ordersOpen');
  }

  // ================================================================== order cards
  cardFrom(c) {
    if (!c || typeof c !== 'object') return null;
    const shop = c.shop && FND().shops[c.shop] ? c.shop : null;
    const need = {};
    const src = shop ? FND().shops[shop].need : (c.need && typeof c.need === 'object' ? c.need : null);
    if (!src) return null;
    for (const k in src) { const n = Math.floor(Number(src[k])); if (ITEMS.indexOf(k) >= 0 && n > 0) need[k] = Math.min(999, n); }
    if (!Object.keys(need).length) return null;
    const got = {};
    for (const k in need) got[k] = Math.max(0, Math.min(need[k], Math.floor(Number(c.got && c.got[k]) || 0)));
    return { id: ++this.seq, shop, need, got, idle: Math.max(0, Math.min(3600, Number(c.idle) || 0)), standing: !shop };
  }

  /** is a founding shop's producer there? (balance.js founding.shops.<k>.after: a step id, 'b:<building>', 'r:<land>') */
  eligible(k) {
    const sh = FND().shops[k];
    if (!sh) return false;
    return this.gs.progress.met(sh.after || null);
  }

  /** fill the board up to `orders.cards` cards */
  refill(quiet) {
    const O = BALANCE.v4.orders, order = FND().order;
    const max = Math.max(1, Math.min(3, Math.floor(O.cards) || 3));
    let added = 0;
    while (this.cards.length < max) {
      const onBoard = new Set(this.cards.map((c) => c.shop).filter(Boolean));
      const taken = (k) => onBoard.has(k) || this.done.indexOf(k) >= 0 || Object.values(this.shops).some((s) => s.shop === k);
      let k = order.find((x) => !taken(x) && this.skipped.indexOf(x) < 0 && this.eligible(x));
      if (!k && this.skipped.length) k = order.find((x) => !taken(x) && this.eligible(x) && this.cards.length + 1 < max);
      if (k) { const i = this.skipped.indexOf(k); if (i >= 0) this.skipped.splice(i, 1); this.cards.push(this.cardFrom({ shop: k })); added++; continue; }
      // every founding card is out (or none is possible yet while some remain): regular deliveries come only
      // once all the founding shops are open
      const allFounded = order.every((x) => this.done.indexOf(x) >= 0);
      if (!allFounded) break;
      const st = O.standing || [];
      if (!st.length) break;
      let pick = null;
      for (let n = 0; n < st.length && !pick; n++) {
        const cand = st[(this.standing + n) % st.length];
        const ty = Object.keys(cand)[0];
        if (!this.cards.some((c) => c.need[ty])) { pick = cand; this.standing += n; }
      }
      if (!pick) pick = st[this.standing % st.length];
      this.standing++;
      this.cards.push(this.cardFrom({ need: pick }));
      added++;
    }
    if (added && !quiet) { this.refreshLabels(true); this.gs.events.emit('v4:cards'); }
    return added;
  }

  /** what open cards still need of `type` (focus card first) */
  needOf(type) {
    let n = 0;
    for (const c of this.cards) if (c.need[type]) n += Math.max(0, c.need[type] - c.got[type]);
    return n;
  }
  /** what the open founding cards (a new shop, not the 정기 납품) still need of `type` */
  foundingNeedOf(type) {
    let n = 0;
    for (const c of this.cards) if (c.shop && c.need[type]) n += Math.max(0, c.need[type] - c.got[type]);
    return n;
  }
  cardDone(c) { for (const k in c.need) if (c.got[k] < c.need[k]) return false; return true; }
  /** the card the HUD shows: the first one that is not done */
  focusCard() { return this.cards.find((c) => !this.cardDone(c)) || this.cards[0] || null; }
  /** value of a card's items (coins) */
  cardValue(c) { let v = 0; for (const k in c.need) v += c.need[k] * priceOf(k); return v; }
  cardReward(c) {
    const O = BALANCE.v4.orders;
    const b = c.shop ? O.bonus : (this.nb.rank && this.nb.rank.level >= 2 ? O.standingBonusRank2 : O.standingBonus);
    return Math.round(this.cardValue(c) * (Number(b) || 0));
  }
  canSwap(c) { return !!c && !this.cardDone(c) && c.idle >= (Number(BALANCE.v4.orders.swapAfter) || 180); }

  /** the 다른 주문 button: this card leaves the board for now, the next one takes its place */
  swap(id) {
    const i = this.cards.findIndex((c) => c.id === id);
    if (i < 0 || !this.canSwap(this.cards[i])) return false;
    const c = this.cards[i];
    // what was already delivered for it is not lost: it stays paid (wholesale), the card goes to the back
    this.cards.splice(i, 1);
    if (c.shop) this.skipped.push(c.shop);
    this.refill();
    // nothing else could take its place: it comes back (fresh idle timer)
    if (this.cards.length < 1 || (c.shop && !this.cards.some((q) => q.shop === c.shop) && this.cards.length < 3 && !this.refill())) {
      if (!this.cards.some((q) => q.shop === c.shop && q.shop)) { c.idle = 0; this.cards.push(c); }
    }
    Audio.play('sfx_click', { volume: 0.5 });
    this.refreshLabels(true);
    this.gs.events.emit('v4:cards');
    return true;
  }

  // ================================================================== the loading dock
  /** one carried item that an open card needs goes onto the dock (paid now) */
  feedDock(ch) {
    for (let i = ch.stack.items.length - 1; i >= 0; i--) {
      const ty = ch.stack.items[i].type;
      if (this.needOf(ty) <= 0) continue;
      const c = this.cards.find((q) => q.need[ty] && q.got[ty] < q.need[ty]);
      if (!c) continue;
      c.got[ty]++;
      c.idle = 0;
      this.payWholesale(ty, 1, this.dock.x, this.dock.y - 30);
      this.addCrate(ty, ch);
      if (this.cardDone(c)) this.gs.time.delayedCall(350, () => this.completeCard(c));
      this.refreshLabels();
      this.gs.events.emit('v4:cards');
      return true;
    }
    return false;
  }

  /** a crate on the dock (or straight into the goods wagon while the train stands at our station) */
  addCrate(ty, from) {
    const gs = this.gs;
    const wagon = this.trainIn() ? this.nb.train.cargoPoint() : null;
    if (wagon && from) {
      const it = from.stack.pop(ty);
      if (it) gs.effects.fly(it.spr, it.spr.x, it.spr.y, wagon, { dur: 420, height: 110, scaleTo: 0.45, onDone: (sp) => { gs.effects.releaseItem(sp); if (this.nb.train) this.nb.train.loadCargo(1); } });
      return;
    }
    this.cargo++;
    if (this.crates.count + this.crates.incoming < CRATES_SHOWN) {
      if (from) gs.moveItem(from.stack, this.crates, ty, { dur: 260, height: 70, sfx: 'drop' });
      else this.crates.push(ty, null, gs.effects);
    } else if (from) {
      const it = from.stack.pop(ty);
      if (it) gs.effects.fly(it.spr, it.spr.x, it.spr.y, { x: this.dock.x, y: this.dock.y - 10 }, { dur: 260, height: 70, scaleTo: 0.4, onDone: (sp) => gs.effects.releaseItem(sp) });
    }
    (this.cargoTypes = this.cargoTypes || []).push(ty);
  }

  trainIn() { const r = this.nb.rail; return !!(r && r.running && r.phase === 'atOurs' && this.nb.train && this.nb.train.cargoPoint()); }

  /** wholesale for n items of `ty` into the till (fractions carried over) */
  payWholesale(ty, n, fx, fy) {
    const v = priceOf(ty) * (Number(BALANCE.v4.wholesale.rate) || 0.7) * n + this.payFrac;
    const whole = Math.floor(v);
    this.payFrac = v - whole;
    if (whole > 0) this.payTill(whole, fx, fy);
  }
  payTill(n, fx, fy) {
    if (!this.till || n <= 0) { this.savedCash += Math.max(0, n); return; }
    this.till.add(n, fx, fy);
    this.earned = (this.earned || 0) + n;
  }

  completeCard(c) {
    const gs = this.gs;
    const i = this.cards.indexOf(c);
    if (i < 0) return;
    this.cards.splice(i, 1);
    const bonus = this.cardReward(c);
    this.payTill(bonus, this.dock.x, this.dock.y - 40);
    Audio.play(Audio.exists('sfx_mission_done') ? 'sfx_mission_done' : 'sfx_unlock', { volume: 0.9 });
    if (c.shop) {
      this.done.push(c.shop);
      gs.ui.banner(t('orderDone'), t('shopFounding', { shop: t('shop_' + c.shop) }));
      this.found(c.shop);
    } else gs.ui.toast(t('standingDone', { n: bonus }));
    gs.effects.burst('star', this.dock.x, this.dock.y - 60, 10);
    gs.events.emit('v4:cardDone', c);
    gs.time.delayedCall(1500, () => { this.refill(); this.refreshLabels(true); });
    this.refreshLabels(true);
    gs.save(true);
  }

  // ================================================================== founding (§8.3)
  found(shop) {
    const lot = FND().lots[shop];
    if (!WORLD.v4.lots[lot] || this.shops[lot]) return null;
    // the art of the founded shops and the ribbon's flower stands
    this.wantArt();
    const sh = new Shop(this, lot, shop, null);
    this.shops[lot] = sh;
    this.callFounder(sh);
    return sh;
  }

  wantArt() {
    const gs = this.gs;
    if (this._art) return;
    this._art = true;
    Assets.loadFragment(gs, 'town', { only: ['town_shops@b'] });     // (the founded shops' page)
    Assets.loadFragment(gs, 'life2', { only: ['life2_wedding'] });
  }

  /** the founder (+ the builders) come by the next train and walk to the lot */
  callFounder(sh) {
    const nb = this.nb;
    if (!nb.sendByTrain || !nb.town || !TF.ok) return;
    sh.waitMax = 75;
    const lotP = { x: sh.x, y: sh.y };
    const workSpots = [[-120, 70], [110, 64]];
    nb.sendByTrain('founder', {}).onArrive((a) => {
      a.role = 'founder';
      sh.actors.push(a);
      sh.founder = a;
      a.speed = 105;
      a.emote('emote_exclaim');
      const d = sh.customerPoints ? sh.customerPoints[0] : { x: lotP.x - 60, y: lotP.y + 90 };
      a.walkTo(d.x - 30, d.y + 30, () => { a.faceTo(lotP.x, lotP.y); a.say('founder_ask'); if (sh.st === 'wait') sh.startBuild(false); });
    });
    for (let k = 0; k < 2; k++) {
      nb.sendByTrain('builder', {}).onArrive((a) => {
        a.role = 'builder';
        sh.actors.push(a);
        a.speed = 110;
        const w = workSpots[k];
        a.walkTo(lotP.x + w[0], lotP.y + w[1], () => {
          a.faceTo(lotP.x, lotP.y);
          if (sh.st === 'wait') sh.startBuild(false);
          if (sh.st === 'build') { a.play('talk', true); if (k === 0) a.say('builder'); }
        });
      });
    }
  }

  /** a scripted townsperson goes back to the platform and home by train */
  sendHome(a) {
    const st = this.nb.ours;
    if (!a || !a.alive) return;
    const w = st && st.wait && st.wait.length ? st.wait[(a.c.id || 0) % st.wait.length] : null;
    if (w) a.walkTo(w.x, w.y, () => a.release()); else a.release();
  }

  /** the shop opened: the founder's household moves in above it (district citizens); the first one invites */
  moveIn(sh, instant) {
    const nb = this.nb, town = nb.town;
    const hh = Math.max(1, Math.floor(FND().household) || 2);
    if (!instant && town && !town.districtOf(sh.id)) {
      const f = sh.founder && sh.founder.alive ? sh.founder : null;
      const opts = { kind: 'keeper', staff: sh.staffPt, customers: sh.customerPoints };
      if (f) { opts.citizen = f.c; opts.x = f.x; opts.y = f.y; }
      town.addDistrictHome(sh.id, hh, opts);
      if (f) { f.release(); sh.founder = null; }
    } else if (town) town.ensureLot(sh.id, { staff: sh.staffPt, customers: sh.customerPoints });
    for (const a of sh.actors) if (a.alive) this.sendHome(a);
    sh.actors = [];
    if (!instant) {
      // the first shop: the mayor comes to invite the chief to Pinecone Village
      if (this.openShopCount() === 1 && !this.gs.progress.flags.townInvite) this.gs.time.delayedCall(2500, () => this.nb.invite());
      if (this.openShopCount() >= 3) this.gs.progress.setFlag('shops3');
      this.houseCheck(false);
      this.gs.save(true);
    } else if (this.openShopCount() >= 3) this.gs.progress.flags.shops3 = true;
  }

  /** the open shop's keeper's body (materialised), for a thumbs-up */
  keeperBody(sh) {
    const town = this.nb.town;
    if (!town) return null;
    for (const b of town.bodies) if (b.c && b.c.kind === 'keeper' && b.c.home === sh.id && b.alive) return b;
    return null;
  }
  bubbles() { return this.nb.bubbles(); }

  // ================================================================== houses (§8.6)
  /** the carpenter is open: the next house lot shows its plank site (one at a time) */
  houseCheck(instant) {
    if (!this.ready) return;
    const carp = Object.values(this.shops).find((s) => s.shop === 'carpenter_workshop' && s.st === 'open');
    if (!carp) return;
    for (const id in this.houses) if (this.houses[id].st !== 'done') return;
    const H = BALANCE.v4.houses;
    const lots = (H.lots || []).concat(this.nb.rank && this.nb.rank.level >= 2 ? (H.lotsRank2 || []) : []);
    const next = lots.find((id) => WORLD.v4.lots[id] && !this.houses[id] && !this.shops[id]);
    if (!next) return;
    this.houses[next] = new HouseLot(this, next, null);
    if (!instant && this.gs.isOnScreen(this.houses[next].x, this.houses[next].y, 300)) this.gs.effects.sheet('fx_sparkle', this.houses[next].x, this.houses[next].y, { size: 160 });
  }

  houseDone(h) {
    const gs = this.gs, nb = this.nb;
    const n = Math.max(1, Math.floor(BALANCE.v4.houses.people) || 4);
    if (nb.town) {
      const gate = (nb.buildings || []).find((b) => b.id === 't_gate');
      nb.town.addDistrictHome(h.id, n, gate ? { x: gate.x - 40, y: gate.y + 60, from: true } : {});
    }
    gs.ui.banner(t('houseMoved', { n }), t('houseMovedSub'));
    if (gs.life) gs.life.cheer();
    gs.events.emit('v4:houseDone', h);
    gs.time.delayedCall(1500, () => this.houseCheck(false));
    gs.save(true);
  }

  // ================================================================== happiness (§8.7)
  addSatisfaction(frac) {
    const f = Math.max(0, Math.min(1, Number(frac) || 0));
    this.happyList.push(f);
    const w = Math.max(1, Math.floor(BALANCE.v4.happiness.window) || 40);
    while (this.happyList.length > w) this.happyList.shift();
  }
  happiness() {
    const H = BALANCE.v4.happiness, base = Number(H.base) || 50;
    if (!this.happyList.length) return 100;
    const mean = this.happyList.reduce((a, b) => a + b, 0) / this.happyList.length;
    // (v4-C) the town hall and the decor make the village happier (Civic.happyBonus, capped by civic.happyCap)
    const bonus = this.gs.civic ? this.gs.civic.happyBonus() : 0;
    return Math.min(100, Math.round(base + (100 - base) * mean) + bonus);
  }

  // ================================================================== station porters (§8.5)
  hireStationPorter(instant, x, y) {
    const gs = this.gs, Q = WORLD.v4.square;
    const k = this.porters.length;
    const home = { x: Q.porter.x + 40 + k * 46, y: Q.porter.y + 54 + k * 10 };
    gs.collision.resolve(home, 14);
    const pr = new StationPorter(gs, this, x !== undefined && !instant ? x : home.x, y !== undefined && !instant ? y : home.y, gs.porters.length, home);
    gs.porters.push(pr);
    this.porters.push(pr);
    this.porterN = Math.max(this.porterN, this.porters.length);
    if (gs.life) gs.life.release(pr.key);
    if (!instant) {
      gs.effects.sheet('fx_poof', pr.x, pr.y - 30, { size: 180 });
      gs.effects.burst('star', pr.x, pr.y - 40, 12);
      pr.sprite.setScale(0.1);
      gs.tweens.add({ targets: pr.sprite, scale: 1, duration: 450, ease: 'Back.easeOut' });
    }
    return pr;
  }

  // ================================================================== A's API (§8.8)
  /** founded shops with something on their shelves (train visitors' targets) */
  shopTargets() {
    const out = [];
    for (const id in this.shops) { const s = this.shops[id]; if (s.st === 'open' && s.stockTotal() > 0 && s.customerPoints) out.push(s); }
    return out;
  }
  openShopCount() { let n = 0; for (const id in this.shops) if (this.shops[id].st === 'open') n++; return n; }
  houseCount() { let n = 0; for (const id in this.houses) if (this.houses[id].st === 'done') n++; return n; }
  rentPerMin() { let r = 0; for (const id in this.shops) { const s = this.shops[id]; if (s.st === 'open') r += Number(s.cfg.rent) || 0; } return r; }

  // ================================================================== frame
  trainEvent(ev, stop) {
    if (ev === 'arrive' && stop === 'ours') this.loadT = 0.6;
  }

  /** the chief on the dock / a shop's delivery pad / a house site / a ribbon (Game.handlePlayerPads) */
  playerPads(dt) {
    const gs = this.gs, p = gs.player;
    let on = false;
    if (this.active && this.till.pad.contains(p.x, p.y)) on = true;
    if (this.active && this.dockPad.contains(p.x, p.y)) {
      on = true;
      if (gs.padT <= 0 && p.stack.count > 0 && this.feedDock(p)) { gs.padT = BALANCE.player.padItemInterval; this.dockPad.pulse(); }
    }
    return on;
  }

  update(dt) {
    const gs = this.gs;
    if (!this.ready) return false;
    let on = false;
    for (const id in this.shops) if (this.shops[id].update(dt)) on = true;
    for (const id in this.houses) if (this.houses[id].update(dt)) on = true;
    if (!this.active) {
      if (gs.progress.flags.firstTrain) this.activate(false);
      return on;
    }
    if (this.playerPads(dt)) on = true;
    this.crates.layout(this.dock.x, this.dock.y + 4, this.dock.y + 1, 0, dt);
    this.till.update(dt);
    // crates into the goods wagon while the train stands at our station
    if (this.cargo > 0 && this.trainIn()) {
      this.loadT -= dt;
      if (this.loadT <= 0) {
        this.loadT = LOAD_EVERY;
        this.cargo--;
        const ty = (this.cargoTypes && this.cargoTypes.shift()) || null;
        const it = ty ? this.crates.pop(ty) : this.crates.pop();
        const w = this.nb.train.cargoPoint();
        if (it && w) gs.effects.fly(it.spr, it.spr.x, it.spr.y, w, { dur: 420, height: 110, scaleTo: 0.45, onDone: (sp) => { gs.effects.releaseItem(sp); if (this.nb.train) this.nb.train.loadCargo(1); } });
        else if (it) gs.effects.releaseItem(it.spr);
        // a counted crate with no sprite: refill the visible stack from the count
        if (this.crates.count + this.crates.incoming < Math.min(CRATES_SHOWN, this.cargo) && this.cargoTypes && this.cargoTypes.length) this.crates.push(this.cargoTypes[Math.min(this.cargoTypes.length - 1, this.crates.count)], null, gs.effects);
      }
    }
    // the board: idle timers (no progress), refill when a producer appeared (a building / zone)
    for (const c of this.cards) if (!this.cardDone(c)) c.idle = Math.min(3600, c.idle + dt);
    this.refillT = (this.refillT || 0) - dt;
    if (this.refillT <= 0) { this.refillT = 2; if (this.refill()) this.refreshLabels(true); this.houseCheck(false); }
    // rent of the open shops into the till (capped while nobody collects)
    const rpm = this.rentPerMin();
    if (rpm > 0) {
      const cap = Math.max(1, Number(BALANCE.v4.rent.cap) || 2000);
      if (this.till.value < cap) this.rentFrac += (rpm / 60) * dt;
      this.rentT = (this.rentT || 0) + dt;
      if (this.rentT >= 6 && this.rentFrac >= 1) {
        this.rentT = 0;
        const n = Math.floor(this.rentFrac);
        this.rentFrac -= n;
        const src = Object.values(this.shops).find((s) => s.st === 'open');
        this.payTill(n, src ? src.x : this.till.x, src ? src.y - 120 : this.till.y - 60);
      }
    }
    // from 읍 on the till empties itself into the coin counter
    const R = BALANCE.v4.rent;
    if (this.nb.rank && this.nb.rank.level >= (R.autoFromRank || 2)) {
      this.autoT = (this.autoT || 0) + dt;
      if (this.autoT >= (Number(R.autoEvery) || 15)) {
        this.autoT = 0;
        const v = this.till.value;
        if (v > 0) { this.till.value = 0; this.till.pile.clear(gs.effects); gs.economy.add(v, this.till.x, this.till.y - 50, gs.isOnScreen(this.till.x, this.till.y, 100)); if (gs.isOnScreen(this.till.x, this.till.y, 100)) gs.effects.floatText(this.till.x, this.till.y - 90, '+' + v, '#ffd84a', 30); }
      }
    }
    // the order board opens its panel when the chief stands beside it
    const p = gs.player, Q = WORLD.v4.square;
    const near = gdist(p.x, p.y, Q.board.x, Q.board.y + 40) < 95;
    if (near && !this.nearBoard && p.vx === 0 && p.vy === 0) { this.nearBoard = true; if (gs.ui.openOrders) gs.ui.openOrders(); }
    else if (!near) this.nearBoard = false;
    this.labelT = (this.labelT || 0) - dt;
    if (this.labelT <= 0) { this.labelT = 0.5; this.refreshLabels(); }
    this.boardLabel.bob(gs.time.now); this.dockLabel.bob(gs.time.now); this.tillLabel.bob(gs.time.now);
    return on;
  }

  /** labels of the board (focus card), the dock, the till (+N/분) */
  refreshLabels() {
    if (!this.active) return;
    const c = this.focusCard();
    if (c) {
      const ty = Object.keys(c.need).find((k) => c.got[k] < c.need[k]) || Object.keys(c.need)[0];
      this.boardLabel.set((c.shop ? t('shop_' + c.shop) : t('order_standing')) + ' ' + c.got[ty] + '/' + c.need[ty], ty);
    } else this.boardLabel.set(t('order_board'));
    const r = this.rentPerMin();
    this.tillLabel.set(r > 0 ? t('stn_cash') + ' ' + t('rentPerMin', { n: r }) : t('stn_cash'));
  }

  // ================================================================== save (§12)
  serialize() {
    if (!this.ready) {
      const s = this.saved;
      return { orders: s.orders, cargo: s.cargo, shops: s.shops, houses: s.houses, cash: s.cash, rentAcc: s.rentAcc, happy: s.happy, porters: s.porters };
    }
    const cards = this.cards.map((c) => ({ shop: c.shop || null, need: Object.assign({}, c.need), got: Object.assign({}, c.got), idle: Math.round(Math.min(3600, c.idle)) }));
    const cargo = {};
    for (const ty of this.cargoTypes || []) cargo[ty] = (cargo[ty] || 0) + 1;
    const shops = {};
    for (const id in this.shops) shops[id] = this.shops[id].serialize();
    const houses = {};
    for (const id in this.houses) houses[id] = this.houses[id].serialize();
    const n = this.happyList.length;
    return {
      orders: { cards, done: this.done.slice(0, 5), standing: this.standing },
      cargo,
      shops, houses,
      cash: this.till ? this.till.value : this.savedCash,
      rentAcc: Math.min(Number(BALANCE.v4.rent.cap) || 2000, Math.floor(this.rentFrac)),
      happy: { n, sum: Math.round(this.happyList.reduce((a, b) => a + b, 0) * 100) / 100 },
      porters: Math.max(this.porters.length, 0),
    };
  }

  state() {
    return {
      ready: this.ready, active: this.active,
      cards: this.cards.map((c) => ({ id: c.id, shop: c.shop, need: c.need, got: c.got, idle: Math.round(c.idle), swap: this.canSwap(c) })),
      done: this.done.slice(), cargo: this.cargo, till: this.till ? this.till.value : this.savedCash,
      shops: Object.fromEntries(Object.keys(this.shops).map((k) => [k, { shop: this.shops[k].shop, st: this.shops[k].st, t: Math.round(this.shops[k].t * 10) / 10, stock: Object.assign({}, this.shops[k].stock), queue: this.shops[k].queue.length }])),
      houses: Object.fromEntries(Object.keys(this.houses).map((k) => [k, { st: this.houses[k].st, got: this.houses[k].got, t: Math.round(this.houses[k].t * 10) / 10 }])),
      happy: this.happiness(), happyN: this.happyList.length, rent: this.rentPerMin(), porters: this.porters.length,
      earned: this.earned || 0,
    };
  }

  destroy() {
    const gs = this.gs;
    gs.events.off('v4:visitorDone', this.onVisitor);
    gs.events.off('v4:train', this.onTrain);
    gs.events.off('flag', this.onFlag);
  }
}

export { DEPTH };
