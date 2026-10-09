// 큰 식당 (v4-C, docs/기획서_v4_추가요청.md §4): a big restaurant with an outdoor terrace on an XL plot of the west
// strip. It buys the village's cooked food — grilled fish, bread, smoked meat — into its pantry (the chief or the
// goods porters bring it: a logistics sink like a shop shelf), and turns it into meals:
//   1. guests queue at the counter; the front one orders (one dish, or the 정식 = all three, worth more) once
//      someone stands at the register (the chief, or the hired 계산 점원) and a table seat is free;
//   2. they sit at a terrace table (the sit pose, or standing just behind the table — the table hides the legs);
//   3. the kitchen cooks the order: the chief standing on the kitchen pad, or the hired 요리사;
//   4. the plate comes to the table: the chief on the kitchen pad sends it flying (until a 서빙 직원 is hired, who
//      carries it); after the cook is hired the chief there only serves;
//   5. they eat, the coins for the meal fly to the restaurant's cash pad, and they leave (train visitors walk on to
//      their next target / the train).
// A guest who waits too long at the table (no cook, no server) leaves without paying; the food goes back to the
// pantry if it was not cooked yet. The v3.5 rules hold: nobody pays without the register being staffed, partial
// stock never stalls the line (the order is made from what is there), nothing is lost on a reload (the pantry is
// saved with the food guests had ordered).
// Numbers: balance.js civic.restaurant (+ buildings.big_restaurant for the cost); texts: strings.js.

import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { TF } from '../core/Townfolk.js';
import { BALANCE } from '../data/balance.js';
import { t } from '../data/strings.js';
import { FOODS, priceOf } from '../data/items.js';
import { gdist } from '../core/Iso.js';
import { DEPTH } from '../systems/DepthSort.js';
import { PRIO } from '../systems/Logistics.js';
import { Pad } from './Pad.js';
import { ItemStack } from './ItemStack.js';
import { CashPad } from './Seller.js';
import { Character } from './Character.js';
import { Register } from './Register.js';
import { TownBuilding } from './TownBuilding.js';
import { floatLabel } from './Shop.js';

const SCALE = 1.3;                         // the "big" restaurant: the town restaurant drawn 1.3x
const M = (x, y, mx, my) => ({ x: Math.round(x + 45.25 * (mx + my)), y: Math.round(y + 22.63 * (mx - my)) });
// the layout in metres on the XL plot (X along the plot's long side, Y across; the building faces −Y)
const L = {
  bld: [2.3, 0.35],
  // the front apron (−Y): register (the line comes from −Y) · kitchen (the pass behind it) · pantry · staff; the cash pad at
  // the corner of the terrace (clear of the line: a tall coin pile must not hide the guests)
  register: [-0.5, -3.0], cashier: [-0.3, -2.25], cash: [-2.6, -2.2],
  kitchen: [1.4, -3.0], cook: [1.55, -2.1], pass: [2.2, -2.15],
  pantry: [3.2, -3.0], staffPad: [5.1, -3.4],
  queue: [-0.5, -4.3], queueStep: -0.85,
  // the terrace (−X): four picnic tables under a string of lanterns
  tables: [[-3.8, 1.1], [-2.1, 1.1], [-3.8, -0.9], [-2.1, -0.9]],
  lanterns: [-2.95, 0.1], lamps: [[-5.0, -1.9], [-5.0, 2.2], [-1.0, 2.8]],
};
const YOFF = (m) => [45.25 * m, -22.63 * m];       // along +Y
const SEAT_DROP = 14;                              // a guest without a sit pose stands this much lower (behind the table)

let GUEST_ID = 0;

export class BigRestaurant {
  constructor(gs, site, instant) {
    this.gs = gs; this.site = site;
    this.key = 'big_restaurant';
    this.drivesGuests = true;                    // (Visitor: a train visitor eating here is walked by the restaurant)
    this.ox = site.x; this.oy = site.y;          // the plot centre (the layout is measured from it)
    this.enabled = true;
    const P = (k) => M(this.ox, this.oy, L[k][0], L[k][1]);
    this.bpos = P('bld');
    this.x = this.bpos.x; this.y = this.bpos.y;  // the building (the Register measures from it)
    this.front = [-60, 30];
    // pads: pantry (food goes in), register (orders are taken while someone stands here), kitchen (the chief cooks /
    // serves), cash (the meals' coins)
    const pp = P('pantry');
    this.pantryPad = new Pad(gs, pp.x, pp.y, 'input', 1.5, { icon: 'item_fish_cooked', iconSize: 40 });
    this.pantry = new ItemStack(gs, { scale: 0.85, cols: [[-26, -4], [0, 8], [26, -4]], typeCols: { item_fish_cooked: 0, item_bread: 1, item_meat_cooked: 2 }, max: this.pantryMax() * 3, drawMax: 8 });
    this.pantryLabel = floatLabel(gs, pp.x + 10, pp.y - 92, null);
    this.pantryLabel.set(t('rest_pantry'));
    const kp = P('kitchen');
    this.kitchenPad = new Pad(gs, kp.x, kp.y, 'input', 1.3, { tex: Assets.pick('ui_pad_register', 'ui_pad_input'), tint: 0xffe2b0 });
    this.kitchenLabel = floatLabel(gs, kp.x - 20, kp.y + 58, null);      // (below the pad: the register's label is above)
    const ps = P('pass');
    this.pass = new ItemStack(gs, { scale: 0.7, cols: [[-20, 0], [0, 6], [20, 0], [40, 6]], perCol: 3, max: 40 });
    this.passPos = ps;
    const cp = P('cash');
    this.cash = new CashPad(gs, cp.x, cp.y);
    // the register (v2 rule: guests only order while someone stands at it / a clerk is hired)
    const rg = P('register'), ck = P('cashier');
    this.register = new Register(gs, this, { register: [rg.x - this.x, rg.y - this.y], staff: [ck.x - this.x, ck.y - this.y], clerk: ['npc_clerk_b', 'npc_clerk_a', 'villager_b'] }, 'big_restaurant');
    // tables + seats (picnic tables of the village props), lanterns over the terrace, lamps
    this.tables = [];
    this.seats = [];
    this.props = [];
    for (const [mx, my] of L.tables) {
      const tp = M(this.ox, this.oy, mx, my);
      const img = this.prop('picnic_table', tp.x, tp.y, {});
      const ob = gs.collision.add(tp.x, tp.y, 44, 'table');
      const d = Assets.def('picnic_table');
      const pts = d.seatPoints || [[-27, -41], [27, -41]];
      const table = { x: tp.x, y: tp.y, img, ob };
      this.tables.push(table);
      for (const q of pts) this.seats.push({ table, x: tp.x + q[0], y: tp.y + q[1], by: null, dir: 2 });
    }
    const lt = M(this.ox, this.oy, L.lanterns[0], L.lanterns[1]);
    this.prop('lantern_string', lt.x, lt.y, { depthOff: 120 });
    for (const [mx, my] of L.lamps) { const lp = M(this.ox, this.oy, mx, my); const im = this.prop('lamp_post', lp.x, lp.y, {}); gs.collision.add(lp.x, lp.y, 12, 'lamp'); (gs.lamps || (gs.lamps = [])).push(im); }
    // the building (town art: a stand-in until its page arrives)
    this.bld = null;
    this.obs = [];
    this.addCollision();
    this.makeArt();
    // the order counter's line, tickets, guests
    this.queue = [];
    this.guests = [];
    this.tickets = [];
    this.spawnT = 2;
    this.payT = 0;
    this.cookT = 0;
    this.serveT = 0;
    this.served = 0;
    this.earned = 0;
    this.lost = 0;
    // staff (Progression steps rest_cashier / rest_cook / rest_server)
    this.cook = null;
    this.server = null;
    this.chiefKitchen = false;
    this.staffSpot = P('staffPad');
    // logistics: the pantry is a sink like a shop shelf (goods porters and the warehouse restock it)
    this.sink = {
      id: 'rest_pantry', isWarehouse: false, enabled: true, x: pp.x + 30, y: pp.y + 22,
      accepts: (ty) => FOODS.indexOf(ty) >= 0,
      room: (ty) => (this.enabled ? Math.max(0, this.pantryMax() - this.pantry.countWithIncoming(ty)) : 0),
      prio: (ty) => (this.pantry.countWithIncoming(ty) < this.pantryMax() * (BALANCE.warehouse.restockBelow || 0.25) ? PRIO.PANTRY_LOW : PRIO.SHELF),
      feed: (ch) => this.feedFrom(ch),
    };
    if (gs.logistics) gs.logistics.add(this.sink);
    if (gs.padSpots) for (const p of [pp, kp, rg, cp]) gs.padSpots.push({ x: p.x, y: p.y, r: 70 });
    this.refreshKitchenLabel();
    if (!instant) gs.time.delayedCall(1500, () => { if (gs.life) gs.life.cheer(); });
  }

  get R() { return (BALANCE.civic && BALANCE.civic.restaurant) || {}; }
  pantryMax() { return Math.max(1, Math.floor(Number(this.R.pantryMax) || 30)); }

  prop(key, x, y, o) {
    const gs = this.gs, r = Assets.sprite(key);
    const img = gs.add.image(x, y, r.tex, r.frame).setOrigin(r.anchor[0], r.anchor[1]).setDepth(y + (o.depthOff || 0));
    if (gs.lazyImage) gs.lazyImage(img, key);
    if (o.scale) img.setScale(o.scale);
    this.props.push(img);
    if (key === 'lamp_post') gs.addOccluder(img);
    return img;
  }

  /** collision circles along the scaled footprint (like TownBuilding) */
  addCollision() {
    const gs = this.gs, b = this.bpos;
    const X = 3.2 * SCALE, Y = 3.0 * SCALE;
    const r = Math.min(X, Y) * 0.5 * 45.25 * 1.05;
    for (const s of [-0.5, 0.5]) {
      const mx = s * (X - Y + 0.6);
      this.obs.push(gs.collision.add(b.x + 45.25 * mx, b.y + 22.63 * mx, r, 'restaurant'));
    }
  }

  makeArt() {
    const gs = this.gs;
    const go = () => {
      if (this.bld || !gs.sys || !gs.sys.isActive()) return;
      this.bld = new TownBuilding(gs, { id: 'c1_rest', key: 'restaurant', x: this.bpos.x, y: this.bpos.y, role: 'restaurant' }, { collision: false });
      this.bld.img.setScale(SCALE);
      if (this.bld.img.__bs === undefined) this.bld.img.__bs = SCALE;
      if (!this.enabled) this.bld.img.setVisible(false);
      // (the occluder box was measured at scale 1)
      const oc = (gs.occluders || []).find((o) => o.img === this.bld.img);
      if (oc) { oc.hw *= SCALE; oc.top *= SCALE; oc.x = this.bpos.x + (oc.x - this.bpos.x) * SCALE; }
    };
    if (gs.civic) gs.civic.needArt(['restaurant'], go); else go();
  }

  // ================================================================ pantry
  feedFrom(ch) {
    const gs = this.gs;
    for (let i = ch.stack.items.length - 1; i >= 0; i--) {
      const ty = ch.stack.items[i].type;
      if (FOODS.indexOf(ty) >= 0 && this.pantry.countWithIncoming(ty) < this.pantryMax()) return gs.moveItem(ch.stack, this.pantry, ty, { dur: 240, height: 60, sfx: 'drop' });
    }
    return false;
  }
  lowFood() {
    for (const f of FOODS) if (this.pantry.countOf(f) === 0) return f;
    return null;
  }
  hasFood() { return FOODS.some((f) => this.pantry.countOf(f) > 0); }

  // ================================================================ prices
  dishPrice(ty, n) { return Math.max(1, Math.round(priceOf(ty) * (Number(this.R.dishMult) || 1.3) * n)); }
  comboPrice() { let s = 0; for (const f of FOODS) s += priceOf(f); return Math.max(1, Math.round(s * (Number(this.R.comboMult) || 1.6))); }

  // ================================================================ guests
  /** beside a seat's table (on the seat's side): where a guest steps in and out */
  seatSide(seat) { const sg = seat.x >= seat.table.x ? 1 : -1; return { x: seat.table.x + sg * 96, y: seat.y + 12 }; }
  freeSeat() { return this.seats.find((s) => !s.by) || null; }
  slotPos(i) { const q = M(this.ox, this.oy, L.queue[0], L.queue[1]); const s = YOFF(L.queueStep); return { x: q.x + s[0] * i, y: q.y + s[1] * i }; }
  payTarget() { const f = this.queue[0]; return f && f.at ? f.ch : null; }
  get maxQueue() { return Math.max(1, Math.floor(Number(this.R.maxQueue) || 6)); }

  /** where an anonymous guest appears: a road node off screen, not too near */
  spawnPoint() {
    const gs = this.gs;
    const ns = gs.roads.nodes.filter((n) => n.edges.some((e) => gs.roads.usable(e)));
    // (the nearest few that are off screen: guests should not walk across half the map for a meal)
    const cand = ns.filter((n) => { const d = gdist(n.x, n.y, this.x, this.y); return d > 300 && d < 2200 && !gs.isOnScreen(n.x, n.y, 80); })
      .sort((a, b) => gdist(a.x, a.y, this.x, this.y) - gdist(b.x, b.y, this.x, this.y)).slice(0, 4);
    const n = cand.length ? cand[Math.floor(Math.random() * cand.length)] : (ns.length ? ns[Math.floor(Math.random() * ns.length)] : { x: this.x + 400, y: this.y + 300 });
    return { x: n.x, y: n.y };
  }

  /** the look of a new guest: a townsperson once the neighbours come by train, else a villager look */
  pickLook() {
    const gs = this.gs;
    const look = gs.v4 && gs.v4.pickLook ? gs.v4.pickLook(this) : null;
    if (look) return look;
    const ks = gs.market && gs.market.customerKeys ? gs.market.customerKeys() : ['villager_a', 'villager_b', 'villager_c'];
    return { key: ks[Math.floor(Math.random() * ks.length)] || 'villager_a' };
  }

  spawnGuest() {
    const gs = this.gs;
    const sp = this.spawnPoint();
    const look = this.pickLook();
    const ch = new Character(gs, look.key, sp.x, sp.y, look.person ? { person: look.person, radius: 13 } : { radius: 13 });
    ch.citizen = look.citizen || null;
    if (look.citizen && gs.v4 && gs.v4.noteVisit) gs.v4.noteVisit(look.citizen);
    gs.agents.push(ch);
    ch.sprite.setAlpha(0); ch.shadow.setAlpha(0);
    gs.tweens.add({ targets: [ch.sprite, ch.shadow], alpha: 1, duration: 400 });
    const g = { id: ++GUEST_ID, ch, visitor: null, cb: null, state: 'walk', at: false, route: null, t: 0, wait: 0, home: sp };
    const end = this.slotPos(Math.min(this.maxQueue - 1, this.queue.length));
    ch.route = gs.roads.route(sp.x, sp.y, end.x, end.y, []);
    ch.ri = 0;
    this.queue.push(g);
    this.guests.push(g);
    return g;
  }

  /** (v4 train visitors, Visitor.tryJoin's `serve` contract) a visitor eats here; cb(frac) when done */
  serve(visitor, cb) {
    if (!this.enabled || this.queue.length >= this.maxQueue || !this.hasFood()) { cb(this.hasFood() ? 0.3 : 0); return; }
    const g = { id: ++GUEST_ID, ch: visitor, visitor, cb, state: 'walk', at: false, t: 0, wait: 0 };
    const end = this.slotPos(Math.min(this.maxQueue - 1, this.queue.length));
    visitor.route = this.gs.roads.route(visitor.x, visitor.y, end.x, end.y, []);
    visitor.ri = 0;
    this.queue.push(g);
    this.guests.push(g);
  }
  /** where a train visitor heads for this target (Visitor.joinPoint for a target with `serve`) */
  get customerPoints() { return [this.slotPos(Math.min(this.maxQueue - 1, this.queue.length))]; }

  /** the order for the front guest, made from what is in the pantry: { items, combo, price } or null */
  makeOrder(g) {
    const R = this.R, P = this.pantry;
    const all = FOODS.every((f) => P.countOf(f) > 0);
    const fav = g.ch && g.ch.citizen && g.ch.citizen.fav;
    if (all && Math.random() < (Number(R.comboChance) || 0.4)) return { items: FOODS.slice(), combo: true, price: this.comboPrice() };
    const av = FOODS.filter((f) => P.countOf(f) > 0);
    if (!av.length) return null;
    const ty = fav && av.indexOf(fav) >= 0 && Math.random() < 0.6 ? fav : av[Math.floor(Math.random() * av.length)];
    const n = Math.min(P.countOf(ty), Math.random() < 0.45 ? 2 : 1);
    const items = [];
    for (let i = 0; i < n; i++) items.push(ty);
    return { items, combo: false, price: this.dishPrice(ty, n) };
  }

  // ================================================================ staff
  /** hire a role (Progression step): 'cashier' | 'cook' | 'server' */
  hire(role, instant, x, y) {
    const gs = this.gs;
    if (role === 'cashier') { this.register.hireClerk(instant, x, y); return; }
    const post = role === 'cook' ? M(this.ox, this.oy, L.cook[0], L.cook[1]) : { x: this.passPos.x + 30, y: this.passPos.y + 44 };
    const look = this.staffLook(role);
    const sx = instant || x === undefined ? post.x : x, sy = instant || y === undefined ? post.y : y;
    const ch = new Character(gs, look.key, sx, sy, look.person ? { person: look.person, radius: 12 } : { radius: 12 });
    ch.noXray = true;
    ch.role = role; ch.post = post; ch.state = instant ? 'post' : 'go'; ch.carry = null;
    gs.agents.push(ch);
    if (!instant) { gs.effects.sheet('fx_poof', ch.x, ch.y - 30, { size: 170 }); gs.effects.burst('star', ch.x, ch.y - 40, 12); }
    if (role === 'cook') this.cook = ch; else this.server = ch;
    if (!instant) gs.ui.banner(t('hired', { name: t('rest_' + role) }), t('restStaffSub_' + role));
    this.refreshKitchenLabel();
  }

  /** the staff look: a townsperson in an apron (once the neighbours' art is here), else a village look */
  staffLook(role) {
    if (TF.ok && TF.readyFor(Assets, 'adult')) {
      let s = role === 'cook' ? 911 : 4242;
      const rng = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s % 100000) / 100000; };
      try { const p = TF.person(rng, 'barista'); if (p && TF.age(p.base) === 'adult') return { key: 'tf:' + p.base, person: p }; } catch (e) { /* village look */ }
    }
    const k = role === 'cook' ? 'npc_chef' : 'npc_clerk_a';
    return { key: Assets.m.characters[k] && (Assets.charReady(k) || Assets.charPending(k)) ? k : 'villager_b' };
  }

  refreshKitchenLabel() {
    const show = !(this.cook && this.server);
    this.kitchenPad.setVisible(show && this.enabled);
    this.kitchenLabel.c.setVisible(show && this.enabled);
    if (show) this.kitchenLabel.set(this.cook ? t('rest_kitchen_serve') : t('rest_kitchen_cook'));
  }

  // ================================================================ frame
  /** the chief stands on one of the pads */
  playerPads(dt) {
    const gs = this.gs, p = gs.player;
    if (!this.enabled) { this.chiefKitchen = false; return false; }
    let on = false;
    if (this.pantryPad.contains(p.x, p.y)) {
      on = true;
      if (gs.padT <= 0 && p.stack.hasAny(FOODS) && this.feedFrom(p)) { gs.padT = BALANCE.player.padItemInterval; this.pantryPad.pulse(); }
    }
    this.chiefKitchen = !(this.cook && this.server) && this.kitchenPad.contains(p.x, p.y);
    if (this.chiefKitchen) { on = true; if (p.vx === 0 && p.vy === 0) { const tk = this.tickets.find((q) => q.state === 'cook'); if (tk && !this.cook) p.faceTo(this.passPos.x, this.passPos.y); } }
    if (this.cash.pad.contains(p.x, p.y)) on = true;
    if (this.register.chief) on = true;
    return on;
  }

  update(dt) {
    const gs = this.gs;
    this.pantry.layout(this.pantryPad.x, this.pantryPad.y + 6, this.pantryPad.y, 0, dt);
    this.pass.layout(this.passPos.x, this.passPos.y, this.passPos.y + 2, 0, dt);
    this.cash.update(dt);
    if (!this.enabled) return;
    this.register.update(dt);
    const now = gs.time.now;
    this.pantryLabel.bob(now); this.kitchenLabel.bob(now + 400);
    // anonymous guests come while there is food (the line never waits for an empty pantry)
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = Math.max(0.5, Number(this.R.spawnEvery) || 5) * (0.8 + Math.random() * 0.4);
      if (this.queue.length < this.maxQueue && this.hasFood() && (gs.progress.complete || gs.isBuilt('big_restaurant'))) this.spawnGuest();
    }
    this.updateQueue(dt);
    this.updateKitchen(dt);
    this.updateStaff(dt);
    for (let i = this.guests.length - 1; i >= 0; i--) this.updateGuest(this.guests[i], dt);
  }

  updateQueue(dt) {
    const front = this.queue[0];
    if (!front || !front.at || front.state !== 'queue') { this.payT = Math.min(this.payT, 0.3); return; }
    // the front guest orders when someone takes the order, a seat is free and the pantry has food
    if (!front.bubble) this.showBubble(front, front.order ? front.order.items : null);
    if (!this.register.staffed) { this.payT = Math.min(this.payT, 0.3); front.waitPay = (front.waitPay || 0) + dt; return; }
    const seat = this.freeSeat();
    if (!seat || !this.hasFood()) return;
    this.payT -= dt;
    if (this.payT > 0) return;
    this.payT = this.register.clerk ? BALANCE.register.clerkPayTime : BALANCE.register.chiefPayTime;
    const order = this.makeOrder(front.ch);
    if (!order) return;
    this.takeOrder(front, order, seat);
  }

  takeOrder(g, order, seat) {
    const gs = this.gs;
    this.queue.shift();
    g.order = order;
    g.seat = seat; seat.by = g;
    g.state = 'toSeat';
    g.t = 0;
    // the food leaves the pantry for the kitchen (reserved for this guest's ticket)
    const kp = this.passPos;
    for (const ty of order.items) {
      const it = this.pantry.pop(ty);
      if (it) gs.effects.fly(it.spr, it.spr.x, it.spr.y, { x: kp.x, y: kp.y - 20 }, { dur: 260, height: 50, scaleTo: 0.4, onDone: (s) => gs.effects.releaseItem(s) });
    }
    this.tickets.push({ g, items: order.items.slice(), combo: order.combo, state: 'cook', t: 0 });
    this.register.onPay(g.ch);
    this.updateBubble(g);
    g.ch.route = [this.seatSide(seat), { x: seat.x, y: seat.y + 2 }];
    g.ch.ri = 0;
    gs.events.emit('restOrder', order);
  }

  updateKitchen(dt) {
    const gs = this.gs, R = this.R;
    const cookOn = !!(this.cook && this.cook.state === 'post') || (!this.cook && this.chiefKitchen);
    const tk = this.tickets.find((q) => q.state === 'cook');
    this.cooking = !!(tk && cookOn);
    if (tk && cookOn) {
      const k = this.cook ? 1 : Math.max(0.1, Number(BALANCE.labour && BALANCE.labour.chiefSpeed) || 1.25);
      tk.t += dt * k;
      const need = tk.combo ? Number(R.cookTimeCombo) || 2.4 : Number(R.cookTime) || 1.4;
      // sizzle and steam while cooking
      this.fxT = (this.fxT || 0) - dt;
      if (this.fxT <= 0 && gs.isOnScreen(this.passPos.x, this.passPos.y, 100)) { this.fxT = 0.5; gs.effects.burst('steam', this.passPos.x - 10, this.passPos.y - 40, 1); gs.sfxAt(Assets.audioDef('sfx_sizzle') || Assets.audioGroup('sfx_sizzle') ? 'sfx_sizzle' : 'sfx_drop', this.passPos.x, this.passPos.y, { volume: 0.25, throttle: 900 }); }
      if (tk.t >= need) {
        tk.state = 'ready';
        tk.plates = tk.items.map((ty) => { this.pass.push(ty, null, gs.effects); return ty; });
        if (this.cook) { this.cook.play(Assets.hasAnim(this.cook.key, 'serve') ? 'serve' : 'happy', true); this.cook.oneShot = 0.8; }
      }
    }
    // serving: the server carries; until one is hired the chief on the kitchen pad sends the plate flying
    const ready = this.tickets.find((q) => q.state === 'ready');
    if (ready && !this.server && this.chiefKitchen) {
      this.serveT -= dt;
      if (this.serveT <= 0) { this.serveT = 0.45; this.flyToTable(ready); }
    }
  }

  /** a ready ticket's plates fly from the pass to the guest's table */
  flyToTable(tk) {
    const gs = this.gs, g = tk.g;
    tk.state = 'served';
    const seat = g.seat;
    tk.items.forEach((ty, i) => {
      const it = this.pass.pop(ty);
      const spr = it ? it.spr : gs.effects.takeItem(ty);
      const tx = seat.x - 14 + i * 14, ty2 = seat.table.y - 12 - i * 2;
      gs.effects.fly(spr, spr.x || this.passPos.x, spr.y || this.passPos.y, { x: tx, y: ty2 }, { dur: 360, height: 90, scaleTo: 0.55, onDone: (s) => this.plateDown(g, s) });
    });
    gs.sfxAt('sfx_drop', seat.x, seat.y, { volume: 0.4, throttle: 120 });
  }

  plateDown(g, spr) {
    if (!g.plates) g.plates = [];
    if (!this.guests.includes(g) || g.state === 'gone' || g.state === 'leave') { this.gs.effects.releaseItem(spr); return; }
    spr.setDepth(g.seat.table.y + 1).setScale(0.55);
    g.plates.push(spr);
    if (g.state === 'seated') { g.state = 'eat'; g.t = 0; this.hideBubble(g); if (this.gs.life) this.gs.life.bubbles.emote(g.ch, Assets.pick('emote_bread', 'emote_heart'), 1.4); }
  }

  updateStaff(dt) {
    const gs = this.gs;
    for (const ch of [this.cook, this.server]) {
      if (!ch) continue;
      if (ch.state === 'go') { if (gs.moveAgent(ch, ch.post.x, ch.post.y, BALANCE.workers.speed, dt, 10)) { ch.state = 'post'; ch.faceTo(ch.post.x - 40, ch.post.y + 30); ch.play('idle'); } }
      else if (ch === this.cook) {
        ch.vx = ch.vy = 0;
        ch.oneShot = Math.max(0, (ch.oneShot || 0) - dt);
        if (ch.oneShot > 0) { /* serving a plate */ }
        else if (this.cooking) { ch.faceTo(this.passPos.x, this.passPos.y); const a = Assets.hasAnim(ch.key, 'operate') ? 'operate' : Assets.hasAnim(ch.key, 'talk') ? 'talk' : 'idle'; if (ch.animName !== a) ch.play(a); }
        else if (ch.animName !== 'idle') { ch.faceTo(ch.post.x - 40, ch.post.y + 30); ch.play('idle'); }
      } else this.updateServer(ch, dt);
      ch.sync(dt);
    }
  }

  /** the server: pass -> table -> back, one ticket at a time */
  updateServer(ch, dt) {
    const gs = this.gs;
    if (ch.state === 'post') {
      ch.vx = ch.vy = 0;
      const tk = this.tickets.find((q) => q.state === 'ready');
      if (tk) {
        tk.state = 'carry';
        ch.carry = tk;
        for (const ty of tk.items) { const it = this.pass.pop(ty); if (it) gs.effects.releaseItem(it.spr); ch.stack.push(ty, null, gs.effects); }
        ch.state = 'deliver';
        ch.dest = { x: tk.g.seat.x + 34, y: tk.g.seat.table.y + 40 };
      } else if (ch.animName !== 'idle') ch.play('idle');
    } else if (ch.state === 'deliver') {
      const tk = ch.carry;
      if (!tk || !this.guests.includes(tk.g) || tk.g.state === 'leave' || tk.g.state === 'gone') { ch.stack.clear(gs.effects); ch.carry = null; ch.state = 'back'; return; }
      if (gs.moveAgent(ch, ch.dest.x, ch.dest.y, BALANCE.workers.speed * 0.9, dt, 14) || (ch.dt2 = (ch.dt2 || 0) + dt) > 12) {
        ch.dt2 = 0;
        const g = tk.g;
        tk.state = 'served';
        tk.items.forEach((ty, i) => {
          const it = ch.stack.pop(ty);
          const spr = it ? it.spr : gs.effects.takeItem(ty);
          gs.effects.fly(spr, spr.x, spr.y, { x: g.seat.x - 14 + i * 14, y: g.seat.table.y - 12 - i * 2 }, { dur: 240, height: 30, scaleTo: 0.55, onDone: (s) => this.plateDown(g, s) });
        });
        ch.play(Assets.hasAnim(ch.key, 'serve') ? 'serve' : 'happy', true);
        ch.carry = null;
        ch.state = 'back';
        ch.pause = 0.5;
      }
    } else if (ch.state === 'back') {
      if ((ch.pause = (ch.pause || 0) - dt) > 0) return;
      if (gs.moveAgent(ch, ch.post.x, ch.post.y, BALANCE.workers.speed, dt, 10)) { ch.state = 'post'; ch.faceTo(this.passPos.x, this.passPos.y); ch.play('idle'); }
    }
  }

  updateGuest(g, dt) {
    const gs = this.gs, ch = g.ch, R = this.R;
    if (!ch.alive) { this.drop(g); return; }
    if (g.visitor) { g.visitor.shopBT = 0; if (g.visitor.stage !== 'shopB') { this.drop(g, true); return; } }
    g.t += dt;
    switch (g.state) {
      case 'walk': {
        // along the roads to the end of the line, then into the slot
        const slot = this.queue.indexOf(g);
        if (slot < 0) { g.state = 'leave'; break; }
        if (gs.followRoute(ch, 110, dt, 30) || g.t > 40) { g.state = 'queue'; g.t = 0; }
        break;
      }
      case 'queue': {
        const slot = this.queue.indexOf(g);
        const s = this.slotPos(Math.max(0, slot));
        g.at = gs.moveAgent(ch, s.x, s.y, 100, dt, 6);
        if (g.at) { ch.vx = ch.vy = 0; ch.faceTo(this.register.staff.x, this.register.staff.y); ch.play('idle'); }
        // a line that does not move: after a long while the guest gives up (a train visitor sooner: the train home)
        if ((slot > 0 && g.t > 120) || (g.visitor && g.t > ((BALANCE.v4 && BALANCE.v4.visitors && BALANCE.v4.visitors.patience) || 60))) this.leave(g, 0.3);
        break;
      }
      case 'toSeat': {
        // the last steps onto the seat without collision (the table stands right in front of it)
        const w = ch.route && ch.route[ch.ri || 0];
        if (!w) { this.sitDown(g); break; }
        const near = gdist(ch.x, ch.y, w.x, w.y) < 70 || (ch.ri || 0) > 0;
        if (near) {
          const dx = w.x - ch.x, dy = w.y - ch.y, d = Math.hypot(dx, dy), st = 100 * dt;
          if (d <= st + 1) { ch.x = w.x; ch.y = w.y; ch.ri = (ch.ri || 0) + 1; if (ch.ri >= ch.route.length) this.sitDown(g); }
          else { ch.x += dx / d * st; ch.y += dy / d * st; ch.face(dx, dy); ch.locomotion(true); }
        } else if (gs.moveAgent(ch, w.x, w.y, 100, dt, 20) || g.t > 25) ch.ri = (ch.ri || 0) + 1;
        if (g.t > 30) { ch.x = g.seat.x; ch.y = g.seat.y; this.sitDown(g); }
        break;
      }
      case 'seated':
        ch.vx = ch.vy = 0;
        g.wait += dt;
        if (g.wait > (Number(R.patience) || 70)) this.giveUp(g);
        break;
      case 'eat': {
        ch.vx = ch.vy = 0;
        const need = g.order.combo ? Number(R.eatTimeCombo) || 13 : Number(R.eatTime) || 9;
        g.eatT = (g.eatT || 0) + dt;
        if (Math.floor(g.eatT / 3) !== Math.floor((g.eatT - dt) / 3) && gs.life && Math.random() < 0.4) gs.life.bubbles.emote(ch, Assets.pick(g.order.combo ? 'emote_star' : 'emote_heart', 'emote_heart'), 1.2);
        if (g.eatT >= need) this.finishMeal(g);
        break;
      }
      case 'leave': {
        if (g.visitor) { this.drop(g); break; }
        if (g.getUp) {
          const dx = g.getUp.x - ch.x, dy = g.getUp.y - ch.y, d = Math.hypot(dx, dy), st = 110 * dt;
          if (d <= st + 1) { ch.x = g.getUp.x; ch.y = g.getUp.y; g.getUp = null; const h = g.home || this.spawnPoint(); ch.route = gs.roads.route(ch.x, ch.y, h.x, h.y, []); ch.ri = 0; }
          else { ch.x += dx / d * st; ch.y += dy / d * st; ch.face(dx, dy); ch.locomotion(true); }
          break;
        }
        const tw = ch.route && ch.route[ch.ri || 0];
        if (!tw || g.t > 30 || (g.t > 1.5 && !gs.isOnScreen(ch.x, ch.y, 90))) { this.fadeOut(g); break; }
        if (gs.followRoute(ch, 115, dt, 30)) this.fadeOut(g);
        break;
      }
      default: break;
    }
    if (!g.visitor && ch.alive) this.syncGuest(g, dt);
    else if (g.visitor && g.state !== 'walk' && g.state !== 'queue') this.placeVisitor(g);
    if (g.bubble) g.bubble.setPosition(ch.x, ch.y + ch.headTop - 6 + Math.sin(gs.time.now / 300 + ch.x) * 2);
  }

  /** a guest at a seat: the sit pose when it has one, else standing just behind the table (it hides the legs) */
  sitDown(g) {
    const ch = g.ch, s = g.seat;
    g.state = g.plates && g.plates.length ? 'eat' : 'seated';
    g.wait = 0;
    ch.vx = ch.vy = 0;
    ch.dir = 2;
    g.sits = !ch.sprite.isDoll && Assets.hasAnim(ch.key, 'sit');
    ch.x = s.x; ch.y = s.y + (g.sits ? 0 : SEAT_DROP);
    ch.play(g.sits ? 'sit' : 'idle', true);
    this.updateBubble(g);
  }

  placeVisitor(g) {
    // the Visitor syncs itself; keep it on its seat while it sits / eats
    const ch = g.ch;
    if (g.state === 'seated' || g.state === 'eat') { ch.x = g.seat.x; ch.y = g.seat.y + (g.sits ? 0 : SEAT_DROP); ch.vx = ch.vy = 0; if (ch.animName !== (g.sits ? 'sit' : 'idle')) ch.play(g.sits ? 'sit' : 'idle'); }
  }

  syncGuest(g, dt) {
    const ch = g.ch;
    ch.sync(dt);
    // seated: in front of the seat's table back (depth just above the seat, below the table)
    if ((g.state === 'seated' || g.state === 'eat') && g.seat) { const d = g.seat.table.y - 2; if (ch.sprite.depth !== d) ch.sprite.setDepth(d); }
  }

  finishMeal(g) {
    const gs = this.gs, ch = g.ch;
    // the coins for the meal fly to the cash pad, the plates are cleared
    const price = g.order.price;
    this.cash.add(price, ch.x, ch.y - 50);
    this.served++; this.earned += price;
    gs.events.emit('restMeal', price, g.order.combo);
    for (const s of g.plates || []) gs.effects.releaseItem(s);
    g.plates = [];
    if (gs.isOnScreen(ch.x, ch.y, 120)) { gs.effects.burst('heart', ch.x, ch.y + ch.headTop - 4, 3); Audio.play('sfx_customer_happy', { volume: 0.55, throttle: 300 }); }
    this.leave(g, 1);
  }

  /** waited too long at the table: leave without paying (uncooked food back to the pantry) */
  giveUp(g) {
    const gs = this.gs;
    this.lost++;
    this.cancelTicket(g);
    if (gs.life) gs.life.bubbles.emote(g.ch, Assets.pick('emote_tear', 'emote_dots'), 1.6);
    this.leave(g, 0.2);
  }

  cancelTicket(g) {
    const gs = this.gs;
    for (let i = this.tickets.length - 1; i >= 0; i--) {
      const tk = this.tickets[i];
      if (tk.g !== g) continue;
      if (tk.state === 'cook') for (const ty of tk.items) if (this.pantry.countWithIncoming(ty) < this.pantryMax()) this.pantry.push(ty, null, gs.effects);
      if (tk.state === 'ready') for (const ty of tk.items) { const it = this.pass.pop(ty); if (it) gs.effects.releaseItem(it.spr); }
      this.tickets.splice(i, 1);
    }
  }

  leave(g, frac) {
    const gs = this.gs, ch = g.ch;
    const qi = this.queue.indexOf(g);
    if (qi >= 0) this.queue.splice(qi, 1);
    this.hideBubble(g);
    if (g.seat) {
      if (g.seat.by === g) g.seat.by = null;
      const sd = this.seatSide(g.seat);
      g.getUp = { x: sd.x, y: sd.y };                  // first a step out beside the table (no collision)
      g.seat = null;
    }
    for (const s of g.plates || []) gs.effects.releaseItem(s);
    g.plates = [];
    for (let i = this.tickets.length - 1; i >= 0; i--) if (this.tickets[i].g === g && this.tickets[i].state === 'served') this.tickets.splice(i, 1);
    g.state = 'leave';
    g.t = 0;
    if (g.visitor) {
      if (g.getUp) { ch.x = g.getUp.x; ch.y = g.getUp.y; g.getUp = null; }
      const cb = g.cb; g.cb = null; this.drop(g); try { if (cb) cb(frac); } catch (e) { console.error(e); } return;
    }
    if (!g.getUp) { const h = g.home || this.spawnPoint(); ch.route = gs.roads.route(ch.x, ch.y, h.x, h.y, []); ch.ri = 0; }
  }

  fadeOut(g) {
    if (g.state === 'gone') return;
    g.state = 'gone';
    const gs = this.gs, ch = g.ch;
    if (!gs.isOnScreen(ch.x, ch.y, 60)) { this.drop(g); return; }
    gs.tweens.add({ targets: [ch.sprite, ch.shadow], alpha: 0, duration: 350, onComplete: () => this.drop(g) });
  }

  /** forget a guest (visitors are not destroyed: they walk on) */
  drop(g, keepVisitor) {
    const gs = this.gs;
    const i = this.guests.indexOf(g);
    if (i < 0) return;
    this.guests.splice(i, 1);
    const qi = this.queue.indexOf(g);
    if (qi >= 0) this.queue.splice(qi, 1);
    if (g.seat && g.seat.by === g) g.seat.by = null;
    this.cancelTicket(g);
    this.hideBubble(g);
    for (const s of g.plates || []) gs.effects.releaseItem(s);
    g.plates = [];
    if (g.visitor) { void keepVisitor; return; }
    const ai = gs.agents.indexOf(g.ch);
    if (ai >= 0) gs.agents.splice(ai, 1);
    if (gs.life) gs.life.bubbles.clear(g.ch);
    if (g.ch.alive) g.ch.destroy();
  }

  // ================================================================ order bubble
  showBubble(g, items) {
    const gs = this.gs, ch = g.ch;
    if (g.bubble) return;
    const c = gs.add.container(ch.x, ch.y + ch.headTop - 8).setDepth(DEPTH.BUBBLE);
    const bg = Assets.image(gs, 0, 0, 'ui_bubble').setOrigin(0.5, 1);
    bg.setScale(Math.min(110 / bg.frame.realWidth, 84 / bg.frame.realHeight));
    c.add(bg);
    g.bubble = c; g.bubbleBg = bg; g.icons = [];
    c.setScale(0.7);
    this.updateBubble(g, items);
  }

  updateBubble(g, items0) {
    const gs = this.gs, c = g.bubble;
    if (!c) return;
    for (const ic of g.icons || []) ic.destroy();
    g.icons = [];
    const items = items0 || (g.order ? g.order.items : null);
    const h = g.bubbleBg.displayHeight;
    if (!items) {
      // waiting to order: a menu icon (the restaurant's three foods, small)
      const ic = Assets.image(gs, 0, -h * 0.56, Assets.pick('ui_icon_food', 'item_fish_cooked')).setOrigin(0.5, 0.5);
      ic.setScale(44 / Math.max(1, ic.frame.realWidth, ic.frame.realHeight));
      c.add(ic); g.icons.push(ic);
      return;
    }
    const n = items.length, w = n > 1 ? 28 : 0;
    items.forEach((ty, i) => {
      const ic = Assets.image(gs, -w + (n > 1 ? (2 * w * i) / (n - 1) : 0), -h * 0.56, ty).setOrigin(0.5, 0.6);
      ic.setScale((n > 2 ? 30 : 40) / Math.max(1, ic.frame.realWidth, ic.frame.realHeight) * 1.2);
      c.add(ic); g.icons.push(ic);
    });
    if (g.order && g.order.combo) {
      const tx = gs.add.text(0, -h - 10, t('rest_combo'), { fontFamily: gs.font, fontSize: '18px', fontStyle: '900', color: '#b05a10', stroke: '#ffffff', strokeThickness: 5, resolution: 2 }).setOrigin(0.5, 0.5);
      c.add(tx); g.icons.push(tx);
    }
  }

  hideBubble(g) {
    if (!g.bubble) return;
    const b = g.bubble;
    g.bubble = null; g.icons = [];
    this.gs.tweens.add({ targets: b, scale: 0, alpha: 0, duration: 160, onComplete: () => b.destroy() });
  }

  // ================================================================ state
  setEnabled(v) {
    this.enabled = v;
    this.sink.enabled = v;
    for (const o of [this.pantryPad, this.cash.pad]) o.setVisible(v);
    this.cash.setEnabled(v);
    this.pantry.setVisible(v); this.pass.setVisible(v);
    this.register.setEnabled(v);
    for (const p of this.props) p.setVisible(v);
    this.pantryLabel.c.setVisible(v);
    if (this.bld && this.bld.img) this.bld.img.setVisible(v);
    this.refreshKitchenLabel();
  }
  revealObjects() { const o = this.props.concat([this.pantryPad.img, this.cash.pad.img]); if (this.bld && this.bld.img) o.push(this.bld.img); return o; }

  /** the pantry (with what guests had ordered but not eaten yet: nothing is lost on a reload) and the cash */
  serialize() {
    const st = {};
    for (const f of FOODS) st[f] = this.pantry.countWithIncoming(f);
    for (const tk of this.tickets) if (tk.state === 'cook' || tk.state === 'ready' || tk.state === 'carry') for (const ty of tk.items) st[ty] = (st[ty] || 0) + 1;
    for (const f of FOODS) st[f] = Math.min(this.pantryMax(), st[f] || 0);
    return { pantry: st, cash: this.cash.serialize(), served: this.served };
  }
  restore(d) {
    if (!d || typeof d !== 'object') return;
    const gs = this.gs;
    if (d.pantry && typeof d.pantry === 'object') for (const f of FOODS) for (let i = 0; i < Math.min(this.pantryMax(), Math.max(0, Math.floor(Number(d.pantry[f]) || 0))); i++) this.pantry.push(f, null, gs.effects);
    this.cash.restore(Math.max(0, Math.floor(Number(d.cash) || 0)));
    this.served = Math.max(0, Math.floor(Number(d.served) || 0));
  }
  state() {
    const P = {};
    for (const f of FOODS) P[f] = this.pantry.countOf(f);
    return {
      pantry: P, cash: this.cash.value, queue: this.queue.length, guests: this.guests.length,
      seated: this.guests.filter((g) => g.state === 'seated' || g.state === 'eat').length,
      eating: this.guests.filter((g) => g.state === 'eat').length,
      tickets: this.tickets.map((q) => q.state), served: this.served, earned: this.earned, lost: this.lost,
      staffed: this.register.staffed, cashier: !!this.register.clerk, cook: !!this.cook, server: !!this.server,
      chiefKitchen: this.chiefKitchen, visitors: this.guests.filter((g) => g.visitor).length,
      sits: this.guests.filter((g) => (g.state === 'seated' || g.state === 'eat') && g.sits).length,
      art: !!(this.bld && Assets.has('restaurant')),
    };
  }
  where() {
    return { pantry: this.pantryPad, kitchen: this.kitchenPad, register: this.register.pad, cash: this.cash.pad, staff: this.staffSpot, queue: this.slotPos(0) };
  }
}
