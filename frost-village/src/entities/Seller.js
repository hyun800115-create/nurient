// Sellers: the market counter (customers queue and buy food) and the trade post (a merchant
// buys planks & ingots). Both pay into a CashPad whose coin pile the player collects.

import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { BALANCE } from '../data/balance.js';
import { Pad } from './Pad.js';
import { ItemStack } from './ItemStack.js';
import { Character } from './Character.js';
import { Register } from './Register.js';
import { DEPTH } from '../systems/DepthSort.js';
import { FOODS, GOODS, priceOf } from '../data/items.js';
import { PRIO } from '../systems/Logistics.js';

export { FOODS, GOODS };

// ------------------------------------------------------------------ cash pad
export class CashPad {
  constructor(gs, x, y) {
    this.gs = gs; this.x = x; this.y = y;
    this.pad = new Pad(gs, x, y, 'cash', 1.5);
    this.value = 0;
    this.pile = new ItemStack(gs, { scale: 0.85, cols: [[0, -16], [-22, -5], [22, -5], [0, 6], [-44, 6], [44, 6], [-22, 17], [22, 17], [0, 28]], perCol: 5, max: BALANCE.cash.pileVisualMax });
    this.collectT = 0;
    this.enabled = true;
    this.spin = gs.effects.loop('fx_coin_spin', x, y - 70, 46, DEPTH.LABEL - 5);
    if (this.spin) this.spin.setVisible(false);
  }
  setEnabled(v) { this.enabled = v; this.pad.setVisible(v); this.pile.setVisible(v); if (this.spin && !v) this.spin.setVisible(false); }

  /** add `amount` coins, flying `n` coin sprites from (fx, fy) */
  add(amount, fx, fy) {
    const gs = this.gs;
    this.value += amount;
    const n = Math.min(6, Math.max(1, Math.round(amount / 3)));
    for (let i = 0; i < n; i++) {
      gs.time.delayedCall(i * 55, () => {
        if (this.pile.count + this.pile.incoming >= this.pile.max) {
          // pile is visually full — just a sparkle
          gs.effects.burst('coin', this.x, this.y - 30, 1);
          return;
        }
        const spr = gs.effects.takeItem('item_coin');
        this.pile.incoming++;
        gs.effects.fly(spr, fx, fy, () => this.pile.nextPos(), {
          dur: 340, height: 70, scaleTo: this.pile.scale,
          onDone: (s) => { this.pile.incoming--; this.pile.push('item_coin', s); if (gs.isNear(this.x, this.y, 500)) Audio.play('sfx_coin', { volume: 0.4, rate: 0.95 + Math.random() * 0.2, throttle: 50 }); },
        });
      });
    }
  }

  update(dt) {
    this.pile.layout(this.x, this.y + 4, this.y, 0, dt);
    if (!this.enabled) return;
    if (this.spin) {
      const show = this.value > 0;
      if (this.spin.visible !== show) this.spin.setVisible(show);
      if (show) this.spin.y = this.y - 74 - this.pile.count * 0.8 + Math.sin(this.gs.time.now / 300) * 5;
    }
    const p = this.gs.player;
    if ((this.value > 0 || this.pile.count > 0) && this.pad.contains(p.x, p.y)) {
      if (this.value > 0) {
        const v = this.value;
        this.value = 0;
        this.gs.economy.add(v, p.x, p.y - 60, true);
        this.gs.effects.floatText(p.x, p.y - 100, '+' + v, '#ffd84a', 34);
        Audio.play('sfx_coins_many', { volume: 0.9 });
        this.gs.effects.vibrate(15);
        this.pad.pulse();
      }
      this.collectT -= dt;
      while (this.collectT <= 0 && this.pile.count > 0) {
        this.collectT += BALANCE.cash.collectInterval;
        const it = this.pile.pop();
        this.gs.effects.fly(it.spr, it.spr.x, it.spr.y, () => ({ x: p.x, y: p.y - 50 }), {
          dur: 240, height: 60, scaleTo: 0.5,
          onDone: (s) => { this.gs.effects.releaseItem(s); this.gs.ui.coinFly(p.x, p.y - 50, 1); },
        });
      }
    }
  }
  serialize() { return this.value; }
  restore(v) {
    v = Math.max(0, Math.floor(v || 0));
    this.value = v;
    const n = Math.min(this.pile.max, Math.ceil(v / 3));
    for (let i = 0; i < n; i++) this.pile.push('item_coin', null, this.gs.effects);
  }
}

// ------------------------------------------------------------------ market counter
const BASE_CUSTOMERS = ['villager_a', 'villager_b', 'villager_c'];
// villager looks that are not shoppers (job characters / too small to shop alone)
const NOT_CUSTOMER = /^npc_(clerk|porter|toddler)/;

export class Market {
  constructor(gs, cfg) {
    this.gs = gs; this.cfg = cfg;
    this.x = cfg.x; this.y = cfg.y;
    this.id = cfg.id || 'market';
    this.goods = cfg.goods || FOODS;
    this.enabled = true;
    this.img = Assets.image(gs, this.x, this.y, cfg.sprite).setDepth(this.y);
    if (gs.lazyImage) gs.lazyImage(this.img, cfg.sprite);
    gs.addOccluder(this.img);
    const fp = Assets.def(cfg.sprite).footprint || [195, 97];
    const co = cfg.collider || [0, 0, 0.44];
    this.obstacle = gs.collision.add(this.x + co[0], this.y + co[1], fp[0] * co[2], this.id);
    this.shelf = new Pad(gs, this.x + cfg.shelf[0], this.y + cfg.shelf[1], 'input', 1.6, { icon: this.goods[0], iconSize: 40 });
    this.maxPerType = Math.max(1, Math.floor(cfg.shelfMax || BALANCE.customers.shelfMax) || 40);
    const tc = {};
    this.goods.forEach((g, i) => { tc[g] = i; });
    this.stock = new ItemStack(gs, {
      scale: 0.95, cols: cfg.stockCols || [[-28, -2], [0, 10], [28, -2]],
      typeCols: tc, max: this.maxPerType * this.goods.length,
    });
    this.cash = new CashPad(gs, this.x + cfg.cash[0], this.y + cfg.cash[1]);
    this.queue = [];      // customers in line (index 0 = front)
    this.leaving = [];
    this.spawnT = 1.0;
    this.serveT = 0;
    this.payT = 0;
    this.lastKeys = [];
    this.front = [-60, 30];    // where the counter faces (clerk idle facing)
    // (v2) customers only pay and leave when someone stands at the register (the chief or a clerk)
    this.register = new Register(gs, this, cfg, cfg.sprite);
    this.waitPayT = 0;         // how long the front customer has been waiting to pay
    // (v3) porters restock the shelf through logistics
    this.sink = {
      id: this.id + '_shelf', isWarehouse: false, enabled: true, x: this.shelf.x + 30, y: this.shelf.y + 22,
      accepts: (ty) => this.goods.indexOf(ty) >= 0,
      room: (ty) => (this.enabled ? Math.max(0, this.maxPerType - this.stock.countWithIncoming(ty)) : 0),
      prio: (ty) => (this.stock.countWithIncoming(ty) < this.maxPerType * (BALANCE.warehouse.restockBelow || 0.25) ? PRIO.SHELF_LOW : PRIO.SHELF),
      feed: (ch) => this.feedFrom(ch),
    };
    if (gs.logistics) gs.logistics.add(this.sink);
  }

  setEnabled(v) {
    this.enabled = v;
    this.sink.enabled = v;
    this.img.setVisible(v); this.shelf.setVisible(v); this.cash.setEnabled(v); this.stock.setVisible(v);
    this.obstacle.active = v;
    this.register.setEnabled(v);
    for (const c of this.queue) { c.sprite.setVisible(v); c.shadow.setVisible(v); if (c.bubble) c.bubble.setVisible(v); }
  }
  revealObjects() { return [this.img, this.shelf.img, this.cash.pad.img].concat(this.register.revealObjects()); }

  /** the customer the cashier is serving (front of the line) */
  payTarget() { const f = this.queue[0]; return f && f.arrived ? f : null; }

  /** front customer has everything and waits at the register */
  get waitingPay() { const f = this.queue[0]; return !!(f && f.state === 'wait' && f.arrived && f.got >= f.want.count); }

  /** every look a customer can have right now (base parkas + all villagers whose art is loaded) */
  customerKeys() {
    const ks = BASE_CUSTOMERS.slice();
    for (const k of Assets.charKeys('villager')) if (!NOT_CUSTOMER.test(k) && Assets.charReady(k) && !this.gs.keysInUse.has(k)) ks.push(k);
    return ks;
  }

  get maxQueue() { return Math.max(1, Math.floor(this.cfg.maxQueue || BALANCE.customers.maxQueue) || 6); }

  /** queue slot i: straight back from the counter, then turning (queueTurn / queueStep2) so a long line stays on the plaza */
  slotPos(i) {
    const c = this.cfg;
    const turn = c.queueTurn || 1e9;
    const a = Math.min(i, turn - 1), b = Math.max(0, i - (turn - 1));
    const s2 = c.queueStep2 || c.queueStep;
    return { x: this.x + c.queueStart[0] + c.queueStep[0] * a + s2[0] * b, y: this.y + c.queueStart[1] + c.queueStep[1] * a + s2[1] * b };
  }

  accepts(type) { return this.goods.indexOf(type) >= 0 && this.stock.countOf(type) < this.maxPerType; }

  feedFrom(ch) {
    const gs = this.gs;
    for (let i = ch.stack.items.length - 1; i >= 0; i--) {
      const t = ch.stack.items[i].type;
      if (this.goods.indexOf(t) >= 0 && this.stock.countWithIncoming(t) < this.maxPerType) {
        return gs.moveItem(ch.stack, this.stock, t, { dur: 240, height: 60, sfx: 'drop' });
      }
    }
    return false;
  }

  availableFoods() {
    if (this.cfg.available) return this.cfg.available();
    const p = this.gs.progress;
    const list = ['item_fish_cooked'];
    if (p.isDone('zone_farm')) list.push('item_bread');
    if (p.isDone('zone_hunt')) list.push('item_meat_cooked');
    return list;
  }

  makeWant() {
    const foods = this.availableFoods();
    if (!foods.length) foods.push(this.goods[0]);
    // newest food is a bit more likely
    let type = foods[Math.floor(Math.random() * foods.length)];
    if (foods.length > 1 && Math.random() < 0.25) type = foods[foods.length - 1];
    const b = BALANCE.customers;
    const zones = this.gs.progress.zonesOpen();
    const lo = Math.max(1, Math.floor(b.wantMin) || 1);
    const maxW = Math.max(lo, Math.min(b.wantMaxLate, b.wantMax + Math.floor(zones / 2)) || lo);
    let count = lo + Math.floor(Math.random() * (maxW - lo + 1));
    if (this.cfg.wantMax) count = Math.min(count, this.cfg.wantMax);
    return { type, count };
  }

  /** (v3) the path a customer walks in on: the fixed entry path, or along the roads from where they appear */
  entryPath(from, sp) {
    if (this.cfg.entry) return this.cfg.entry.slice(Math.max(1, from)).map((p) => ({ x: p[0] + (Math.random() - 0.5) * 40, y: p[1] + (Math.random() - 0.5) * 20 }));
    const end = this.slotPos(Math.min(this.maxQueue - 1, this.queue.length));
    return this.gs.roads.route(sp ? sp.x : this.x, sp ? sp.y : this.y + 300, end.x, end.y, []).slice(0, -1);
  }

  /** (v3) the way home after shopping */
  exitPath(c) {
    if (this.cfg.exit) { const side = (Math.random() - 0.5) * 70; return this.cfg.exit.map((p) => ({ x: p[0] + side + (Math.random() - 0.5) * 20, y: p[1] + (Math.random() - 0.5) * 16 })); }
    const h = c.home || this.spawnPoint();
    return this.gs.roads.route(c.x, c.y, h.x, h.y, []);
  }

  /** where a new customer appears: the point of the entry path nearest the plaza that is off-screen */
  spawnPoint() {
    const gs = this.gs;
    if (!this.cfg.entry) {
      // (v3) a road node of the open land, off-screen, not too near and not too far
      const ns = gs.roads.nodes.filter((n) => n.edges.some((e) => gs.roads.usable(e)));
      const cand = ns.filter((n) => { const d = Math.hypot(n.x - this.x, (n.y - this.y) * 2); return d > 500 && d < 2200 && !gs.isOnScreen(n.x, n.y, 80); });
      const n = cand.length ? cand[Math.floor(Math.random() * cand.length)] : (ns.length ? ns[Math.floor(Math.random() * ns.length)] : { x: this.x - 400, y: this.y + 300 });
      return { x: n.x, y: n.y, next: 1, visible: gs.isOnScreen(n.x, n.y, 80) };
    }
    const pts = this.cfg.entry;
    for (let i = pts.length - 1; i > 0; i--) {
      const [bx, by] = pts[i], [ax, ay] = pts[i - 1];
      const len = Math.hypot(bx - ax, by - ay) || 1;
      for (let d = 0; d <= len; d += 24) {
        const x = bx + ((ax - bx) * d) / len, y = by + ((ay - by) * d) / len;
        if (!gs.isOnScreen(x, y, 80)) return { x, y, next: i, visible: false };
      }
    }
    return { x: pts[0][0], y: pts[0][1], next: 1, visible: true };
  }

  spawnCustomer(atSlot) {
    const gs = this.gs;
    // variety: never the same look twice in a row, and not one of the last few when there is a choice
    const all = this.customerKeys();
    const recent = this.lastKeys;
    let pool = all.filter((k) => recent.indexOf(k) < 0);
    if (!pool.length) pool = all.filter((k) => k !== recent[recent.length - 1]);
    if (!pool.length) pool = all;
    const key = pool[Math.floor(Math.random() * pool.length)];
    recent.push(key);
    while (recent.length > Math.min(4, Math.max(1, all.length - 2))) recent.shift();
    let x, y, next = 1, visible = false;
    if (atSlot !== undefined) { const s = this.slotPos(atSlot); x = s.x; y = s.y; }
    else { const sp = this.spawnPoint(); x = sp.x + (Math.random() - 0.5) * 30; y = sp.y; next = sp.next; visible = sp.visible; }
    const c = new Customer(gs, this, key, x, y, this.makeWant(), next, atSlot === undefined ? { x, y } : null);
    this.queue.push(c);
    if (atSlot !== undefined) { c.state = 'wait'; c.path.length = 0; c.arrived = true; c.faceTo(this.x, this.y); c.showBubble(); }
    else if (visible) c.fadeIn();
    return c;
  }

  update(dt) {
    const gs = this.gs;
    this.stock.layout(this.shelf.x, this.shelf.y + 6, this.shelf.y, 0, dt);
    if (!this.enabled) return;
    this.cash.update(dt);
    this.register.update(dt);
    // spawn
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = Math.max(0.3, Number(this.cfg.spawnEvery || BALANCE.customers.spawnEvery) || 2.6) * (0.8 + Math.random() * 0.4);
      if (this.queue.length < this.maxQueue && (!this.cfg.available || this.availableFoods().length)) this.spawnCustomer();
    }
    // serve the front customer
    const front = this.queue[0];
    if (front && front.state === 'wait' && front.arrived) {
      if (!front.bubbleShown) front.showBubble();
      // never stall the line: whenever the wanted food is out but another food is on the shelf, take that one
      // (also for a customer who already got part of the order)
      if (front.need > 0 && this.stock.countOf(front.want.type) === 0) {
        for (const f of this.goods) if (this.stock.countOf(f) > 0) { front.setWant(f); break; }
      }
      this.serveT -= dt;
      if (this.serveT <= 0 && front.need > 0 && this.stock.countOf(front.want.type) > 0) {
        this.serveT = BALANCE.customers.takeInterval;
        const type = front.want.type;
        const it = this.stock.pop(type);
        front.need--;
        front.flying.push(type);
        gs.effects.fly(it.spr, it.spr.x, it.spr.y, () => front.bubblePos(), {
          dur: 280, height: 60, scaleTo: 0.5,
          onDone: (s) => {
            gs.effects.releaseItem(s);
            const fi = front.flying.indexOf(type);
            if (fi >= 0) front.flying.splice(fi, 1);
            front.got++;
            front.value += priceOf(type);
            front.bought.push(type);
            front.popBubble();
            if (gs.isNear(front.x, front.y, 600)) Audio.play('sfx_pickup', { volume: 0.4, rate: 1 + front.got * 0.08, throttle: 40 });
          },
        });
      }
      // everything handed over: pay at the register (only while someone is at it)
      if (front.got >= front.want.count && front.flying.length === 0) {
        this.waitPayT += dt;
        if (!front.payWait) { front.payWait = true; front.updateBubble(); }
        if (this.register.staffed) {
          this.payT -= dt;
          if (this.payT <= 0) {
            this.payT = this.register.clerk ? BALANCE.register.clerkPayTime : BALANCE.register.chiefPayTime;
            this.register.onPay(front);
            this.complete(front);
          }
        } else this.payT = Math.min(this.payT, 0.25);
      } else this.waitPayT = 0;
    } else this.waitPayT = 0;
    for (let i = 0; i < this.queue.length; i++) this.queue[i].update(dt, i);
    for (let i = this.leaving.length - 1; i >= 0; i--) {
      const c = this.leaving[i];
      if (c.alive) c.update(dt, -1);
      if (!c.alive) this.leaving.splice(i, 1);
    }
  }

  complete(c) {
    const gs = this.gs;
    if (c.state !== 'wait' && c.state !== 'arrive') return;
    const i = this.queue.indexOf(c);
    if (i >= 0) this.queue.splice(i, 1);
    this.leaving.push(c);
    const value = c.value > 0 ? c.value : priceOf(c.want.type) * c.want.count;
    c.hideBubble();
    c.state = 'happy';
    c.happyT = 0.9;
    c.play('happy', true);
    gs.effects.burst('heart', c.x, c.y + c.headTop - 4, 3);
    Audio.play('sfx_customer_happy', { volume: 0.7 });
    gs.time.delayedCall(200, () => { this.cash.add(value, c.x, c.y - 50); if (gs.isNear(c.x, c.y, 650)) Audio.play('sfx_cash', { volume: 0.55, throttle: 250 }); });
    gs.events.emit(this.cfg.soldEvent || 'sold', value);
  }

  restoreQueue(n) {
    for (let i = 0; i < n; i++) this.spawnCustomer(i);
  }
}

// ------------------------------------------------------------------ customer
export class Customer extends Character {
  constructor(gs, market, key, x, y, want, pathFrom = 1, home = null) {
    super(gs, key, x, y, { radius: 13, capacity: 10 });
    this.home = home;
    this.market = market;
    this.want = want;
    this.need = want.count;
    this.got = 0;
    this.value = 0;        // coins earned so far (price of each item actually handed over)
    this.bought = [];      // item types handed over (carried home)
    this.flying = [];      // item types on their way from the shelf
    this.state = 'arrive';
    this.path = market.entryPath(pathFrom, home);
    this.arrived = false;
    this.speed = BALANCE.customers.speed * (0.88 + Math.random() * 0.24);
    this.bubble = null;
    this.bubbleShown = false;
    this.bubbleK = 0.2;
    this.punch = 0;
    this.happyT = 0;
    this.leaveT = 0;
    this.slot = -1;
    // a little variety so a crowd of the same model does not look cloned
    this.sizeK = 0.96 + Math.random() * 0.08;
    this.sprite.setScale(this.sizeK);
    gs.agents.push(this);
  }

  fadeIn() {
    this.sprite.setAlpha(0); this.shadow.setAlpha(0);
    this.gs.tweens.add({ targets: [this.sprite, this.shadow], alpha: 1, duration: 450 });
  }

  bubbleTarget(slot) { return slot <= 0 ? 0.9 : slot === 1 ? 0.72 : 0.62; }

  showBubble() {
    if (this.bubble) { this.bubble.setVisible(true); this.bubbleShown = true; return; }
    const gs = this.gs;
    const c = gs.add.container(this.x, this.y + this.headTop - 8).setDepth(DEPTH.BUBBLE);
    const bg = Assets.image(gs, 0, 0, 'ui_bubble');
    bg.setOrigin(0.5, 1);
    const fr = bg.frame;
    bg.setScale(Math.min(96 / fr.realWidth, 84 / fr.realHeight));
    const ic = Assets.image(gs, -14, -bg.displayHeight * 0.56, this.want.type);
    ic.setOrigin(0.5, 0.6);
    const ifr = ic.frame;
    ic.setScale(46 / Math.max(ifr.realWidth, ifr.realHeight) * 1.25);
    const tx = gs.add.text(22, -bg.displayHeight * 0.58, '', { fontFamily: gs.font, fontSize: '26px', fontStyle: '900', color: '#2b2f3a', resolution: 2 }).setOrigin(0.5, 0.5);
    c.add([bg, ic, tx]);
    this.bubble = c; this.bubbleText = tx; this.bubbleIcon = ic; this.bubbleIconScale = ic.scaleX; this.bubbleBgH = bg.displayHeight;
    this.bubbleShown = true;
    this.bubbleK = 0.2;
    c.setScale(this.bubbleK);
    this.updateBubble();
  }
  updateBubble() {
    if (!this.bubbleText) return;
    const left = Math.max(0, this.want.count - this.got);
    if (left > 0) { this.bubbleText.setText('x' + left); return; }
    // order complete: a coin (= "I'd like to pay") instead of "x0"; the register decides when
    this.bubbleText.setText('');
    const ic = Assets.pick('ui_icon_coin', 'ui_icon_check');
    if (this.bubbleIcon && Assets.has(ic)) {
      Assets.apply(this.bubbleIcon, ic);
      this.bubbleIcon.setOrigin(0.5, 0.5).setPosition(0, -this.bubbleBgH * 0.56);
      this.bubbleIcon.setScale(44 / Math.max(1, this.bubbleIcon.frame.realWidth));
    }
  }
  setWant(type) {
    if (this.want.type === type) return;
    this.want.type = type;
    if (this.bubbleIcon) { Assets.apply(this.bubbleIcon, type); this.bubbleIcon.setOrigin(0.5, 0.6).setScale(this.bubbleIconScale); }
    this.punch = 1;
  }
  popBubble() { this.updateBubble(); this.punch = 1; }
  hideBubble() {
    if (!this.bubble) return;
    const b = this.bubble;
    this.bubble = null;
    this.gs.tweens.add({ targets: b, scale: 0, alpha: 0, duration: 180, onComplete: () => b.destroy() });
  }
  bubblePos() { return { x: this.x - 12, y: this.y + this.headTop - 40 }; }

  update(dt, slot) {
    const gs = this.gs;
    this.slot = slot;
    switch (this.state) {
      case 'arrive':
      case 'wait': {
        let tx, ty;
        if (this.path.length) { tx = this.path[0].x; ty = this.path[0].y; }
        else { const s = this.market.slotPos(slot); tx = s.x; ty = s.y; }
        const arrived = gs.moveAgent(this, tx, ty, this.speed, dt, this.path.length ? 30 : 6);
        if (arrived) {
          if (this.path.length) this.path.shift();
          else {
            if (this.state === 'arrive') this.state = 'wait';
            this.arrived = true;
            this.vx = this.vy = 0;
            const fd = this.market.cfg.faceTo || [40, -20];
            this.faceTo(this.market.x + fd[0], this.market.y + fd[1]);
            this.play('idle');
            if (!this.bubbleShown && slot <= 2) this.showBubble();
          }
        } else this.arrived = false;
        break;
      }
      case 'happy':
        this.vx = this.vy = 0;
        this.happyT -= dt;
        if (this.happyT <= 0) {
          this.state = 'leave';
          this.leaveT = 0;
          // walk away carrying what we bought
          const got = this.bought.length ? this.bought : [this.want.type];
          for (let i = 0; i < Math.min(6, got.length); i++) this.stack.push(got[i], null, gs.effects);
          this.path = this.market.exitPath(this);
          this.speed *= 0.95 + Math.random() * 0.2;
        }
        break;
      case 'leave': {
        this.leaveT += dt;
        const t = this.path[0];
        // gone once out of sight (or at the end of the path / after a safety timeout)
        if (!t || this.leaveT > 30 || this.y > gs.H - 70 || (this.leaveT > 1.2 && !gs.isOnScreen(this.x, this.y, 90))) { this.fadeOut(); break; }
        if (gs.moveAgent(this, t.x, t.y, this.speed * 1.1, dt, 30)) this.path.shift();
        break;
      }
      case 'fade':
        this.vx = this.vy = 0;
        break;
    }
    if (this.bubble) {
      const k = Math.min(1, dt * 12);
      this.bubbleK += (this.bubbleTarget(slot) - this.bubbleK) * k;
      this.punch = Math.max(0, this.punch - dt * 6);
      this.bubble.setScale(this.bubbleK * (1 + this.punch * 0.18));
      // front of the line on top so its request is never hidden behind the next bubble
      const d = DEPTH.BUBBLE + 50 - Math.max(0, slot);
      if (this.bubble.depth !== d) this.bubble.setDepth(d);
      this.bubble.setPosition(this.x, this.y + this.headTop - 6 + Math.sin(gs.time.now / 300 + this.x) * 2);
      // waiting at the register with nobody there: the coin bubble pulses
      if (this.payWait && slot === 0 && !this.market.register.staffed) this.bubble.setScale(this.bubbleK * (1 + Math.max(0, Math.sin(gs.time.now / 140)) * 0.12));
    }
    if (this.alive) this.sync(dt);
  }

  fadeOut() {
    if (this.state === 'fade') return;
    this.state = 'fade';
    if (!this.gs.isOnScreen(this.x, this.y, 60)) { this.despawn(); return; }
    this.gs.tweens.add({ targets: [this.sprite, this.shadow], alpha: 0, duration: 350, onComplete: () => this.despawn() });
    this.stack.setVisible(false);
  }

  despawn() {
    if (!this.alive) return;
    this.alive = false;
    this.stack.clear(this.gs.effects);
    this.hideBubble();
    const i = this.gs.agents.indexOf(this);
    if (i >= 0) this.gs.agents.splice(i, 1);
    this.destroy();
  }
}

// ------------------------------------------------------------------ trade post
export class TradePost {
  constructor(gs, cfg) {
    this.gs = gs; this.cfg = cfg;
    this.x = cfg.x; this.y = cfg.y;
    this.enabled = true;
    this.img = Assets.image(gs, this.x, this.y, cfg.sprite).setDepth(this.y);
    gs.addOccluder(this.img);
    const fp = Assets.def(cfg.sprite).footprint || [213, 106];
    this.obstacle = gs.collision.add(this.x, this.y, fp[0] * 0.42, 'trade');
    this.shelf = new Pad(gs, this.x + cfg.shelf[0], this.y + cfg.shelf[1], 'input', 1.6, { icon: 'item_plank', iconSize: 40 });
    this.maxPerType = Math.max(1, Math.floor(BALANCE.trade.shelfMax) || 40);
    this.stock = new ItemStack(gs, { scale: 0.95, cols: [[-20, -4], [20, 6]], typeCols: { item_plank: 0, item_ingot: 1 }, max: this.maxPerType * GOODS.length });
    this.cash = new CashPad(gs, this.x + cfg.cash[0], this.y + cfg.cash[1]);
    this.merchant = new Character(gs, 'villager_c', this.x + cfg.merchant[0], this.y + cfg.merchant[1], { dir: 1 });
    this.merchant.faceTo(this.shelf.x, this.shelf.y);
    this.merchant.noXray = true;   // the merchant always stands behind his cart: the cart must not fade for him
    this.buyT = 0;
    this.happyT = 0;
    this.flying = {};      // goods on their way to the merchant (not paid yet)
    this.front = [-60, 30];
    // (v2) the merchant only buys while someone stands at the register (the chief or a clerk)
    this.register = new Register(gs, this, Object.assign({ avoid: cfg.merchant }, cfg), cfg.sprite);
    this.waitT = 0;
    this.waitIcon = null;
    this.goods = GOODS;
    this.sink = {
      id: 'trade_shelf', isWarehouse: false, enabled: true, x: this.shelf.x + 30, y: this.shelf.y + 22,
      accepts: (ty) => GOODS.indexOf(ty) >= 0,
      room: (ty) => (this.enabled ? Math.max(0, this.maxPerType - this.stock.countWithIncoming(ty)) : 0),
      prio: (ty) => (this.stock.countWithIncoming(ty) < this.maxPerType * (BALANCE.warehouse.restockBelow || 0.25) ? PRIO.SHELF_LOW : PRIO.SHELF),
      feed: (ch) => this.feedFrom(ch),
    };
    if (gs.logistics) gs.logistics.add(this.sink);
  }
  setEnabled(v) {
    this.enabled = v;
    if (this.sink) this.sink.enabled = v;
    this.img.setVisible(v); this.shelf.setVisible(v); this.cash.setEnabled(v);
    this.merchant.sprite.setVisible(v); this.merchant.shadow.setVisible(v);
    this.obstacle.active = v;
    this.stock.setVisible(v);
    this.register.setEnabled(v);
    if (this.waitIcon && !v) this.waitIcon.setVisible(false);
  }
  revealObjects() { return [this.img, this.shelf.img, this.cash.pad.img, this.merchant.sprite].concat(this.register.revealObjects()); }

  payTarget() { return this.merchant; }
  /** goods on the shelf but nobody at the register */
  get waitingPay() { return this.enabled && this.stock.count > 0 && !this.register.staffed; }

  feedFrom(ch) {
    for (let i = ch.stack.items.length - 1; i >= 0; i--) {
      const t = ch.stack.items[i].type;
      if (GOODS.indexOf(t) >= 0 && this.stock.countWithIncoming(t) < this.maxPerType) {
        return this.gs.moveItem(ch.stack, this.stock, t, { dur: 240, height: 60, sfx: 'drop' });
      }
    }
    return false;
  }

  update(dt) {
    this.stock.layout(this.shelf.x, this.shelf.y + 6, this.shelf.y, 0, dt);
    this.cash.update(dt);
    if (!this.enabled) return;
    this.register.update(dt);
    const m = this.merchant;
    const gs = this.gs;
    this.buyT -= dt;
    const staffed = this.register.staffed;
    if (this.stock.count > 0 && !staffed) this.waitT += dt; else this.waitT = 0;
    // waiting for a cashier: a pulsing coin over the merchant
    const showWait = this.stock.count > 0 && !staffed;
    if (showWait && !this.waitIcon) {
      this.waitIcon = Assets.image(gs, m.x, m.y + m.headTop - 30, Assets.pick('ui_icon_coin', 'ui_icon_check')).setDepth(DEPTH.BUBBLE);
      this.waitIcon.setScale(40 / Math.max(1, this.waitIcon.frame.realWidth));
      this.waitIcon.__bs = this.waitIcon.scaleX;
    }
    if (this.waitIcon) {
      this.waitIcon.setVisible(showWait);
      if (showWait) { this.waitIcon.setScale(this.waitIcon.__bs * (1 + Math.max(0, Math.sin(gs.time.now / 140)) * 0.15)); this.waitIcon.y = m.y + m.headTop - 30 + Math.sin(gs.time.now / 300) * 3; }
    }
    if (this.buyT <= 0 && this.stock.count > 0 && staffed) {
      this.buyT = this.register.clerk ? BALANCE.trade.buyInterval * BALANCE.register.clerkTradeSlow : BALANCE.trade.buyInterval;
      const it = this.stock.pop();
      this.flying[it.type] = (this.flying[it.type] || 0) + 1;
      gs.effects.fly(it.spr, it.spr.x, it.spr.y, { x: m.x, y: m.y - 40 }, {
        dur: 260, height: 50, scaleTo: 0.5,
        onDone: (s) => {
          this.flying[it.type]--;
          gs.effects.releaseItem(s);
          this.cash.add(priceOf(it.type), m.x, m.y - 50);
          gs.events.emit('traded', priceOf(it.type));
        },
      });
      if (this.happyT <= 0) { m.play('happy', true); this.register.onPay(m); }
      this.happyT = 0.7;
    }
    if (this.happyT > 0) { this.happyT -= dt; if (this.happyT <= 0) m.play('idle'); }
    m.sync(dt);
  }
}
