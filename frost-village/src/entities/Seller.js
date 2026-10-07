// Sellers: the market counter (customers queue and buy food) and the trade post (a merchant
// buys planks & ingots). Both pay into a CashPad whose coin pile the player collects.

import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { BALANCE } from '../data/balance.js';
import { Pad } from './Pad.js';
import { ItemStack } from './ItemStack.js';
import { Character } from './Character.js';
import { DEPTH } from '../systems/DepthSort.js';

export const FOODS = ['item_fish_cooked', 'item_bread', 'item_meat_cooked'];
export const GOODS = ['item_plank', 'item_ingot'];

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
export class Market {
  constructor(gs, cfg) {
    this.gs = gs; this.cfg = cfg;
    this.x = cfg.x; this.y = cfg.y;
    this.img = Assets.image(gs, this.x, this.y, cfg.sprite).setDepth(this.y);
    const fp = Assets.def(cfg.sprite).footprint || [195, 97];
    this.obstacle = gs.collision.add(this.x, this.y, fp[0] * 0.44, 'market');
    this.shelf = new Pad(gs, this.x + cfg.shelf[0], this.y + cfg.shelf[1], 'input', 1.6, { icon: 'item_fish_cooked', iconSize: 40 });
    this.stock = new ItemStack(gs, {
      scale: 0.95, cols: [[-28, -2], [0, 10], [28, -2]],
      typeCols: { item_fish_cooked: 0, item_bread: 1, item_meat_cooked: 2 }, max: 120,
    });
    this.maxPerType = 40;
    this.cash = new CashPad(gs, this.x + cfg.cash[0], this.y + cfg.cash[1]);
    this.queue = [];      // customers in line (index 0 = front)
    this.leaving = [];
    this.spawnT = 1.0;
    this.serveT = 0;
  }

  slotPos(i) {
    const c = this.cfg;
    return { x: this.x + c.queueStart[0] + c.queueStep[0] * i, y: this.y + c.queueStart[1] + c.queueStep[1] * i };
  }

  accepts(type) { return FOODS.indexOf(type) >= 0 && this.stock.countOf(type) < this.maxPerType; }

  feedFrom(ch) {
    const gs = this.gs;
    for (let i = ch.stack.items.length - 1; i >= 0; i--) {
      const t = ch.stack.items[i].type;
      if (FOODS.indexOf(t) >= 0 && this.stock.countOf(t) + this.stock.incoming < this.maxPerType) {
        return gs.moveItem(ch.stack, this.stock, t, { dur: 240, height: 60, sfx: 'drop' });
      }
    }
    return false;
  }

  availableFoods() {
    const p = this.gs.progress;
    const list = ['item_fish_cooked'];
    if (p.isDone('zone_farm')) list.push('item_bread');
    if (p.isDone('zone_hunt')) list.push('item_meat_cooked');
    return list;
  }

  makeWant() {
    const foods = this.availableFoods();
    // newest food is a bit more likely
    let type = foods[Math.floor(Math.random() * foods.length)];
    if (foods.length > 1 && Math.random() < 0.25) type = foods[foods.length - 1];
    const b = BALANCE.customers;
    const zones = this.gs.progress.zonesOpen();
    const maxW = Math.min(b.wantMaxLate, b.wantMax + Math.floor(zones / 2));
    const count = b.wantMin + Math.floor(Math.random() * (maxW - b.wantMin + 1));
    return { type, count };
  }

  spawnCustomer(atSlot) {
    const gs = this.gs;
    const keys = ['villager_a', 'villager_b', 'villager_c'];
    const key = keys[Math.floor(Math.random() * keys.length)];
    let x, y;
    if (atSlot !== undefined) { const s = this.slotPos(atSlot); x = s.x; y = s.y; }
    else { const e = this.cfg.entry[0]; x = e[0] + (Math.random() - 0.5) * 60; y = e[1]; }
    const c = new Customer(gs, this, key, x, y, this.makeWant());
    this.queue.push(c);
    if (atSlot !== undefined) { c.state = 'wait'; c.path.length = 0; c.arrived = true; c.faceTo(this.x, this.y); c.showBubble(); }
    return c;
  }

  update(dt) {
    const gs = this.gs;
    this.stock.layout(this.shelf.x, this.shelf.y + 6, this.shelf.y, 0, dt);
    this.cash.update(dt);
    // spawn
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = BALANCE.customers.spawnEvery * (0.8 + Math.random() * 0.4);
      if (this.queue.length < BALANCE.customers.maxQueue) this.spawnCustomer();
    }
    // serve the front customer
    const front = this.queue[0];
    if (front && front.state === 'wait' && front.arrived) {
      if (!front.bubbleShown) front.showBubble();
      // don't stall the line: if nothing of the wanted food is on the shelf yet, take another food that is
      if (front.got === 0 && front.need === front.want.count && this.stock.countOf(front.want.type) === 0) {
        for (const f of FOODS) if (this.stock.countOf(f) > 0) { front.setWant(f); break; }
      }
      this.serveT -= dt;
      if (this.serveT <= 0 && front.need > 0 && this.stock.countOf(front.want.type) > 0) {
        this.serveT = BALANCE.customers.takeInterval;
        const it = this.stock.pop(front.want.type);
        front.need--;
        front.updateBubble();
        gs.effects.fly(it.spr, it.spr.x, it.spr.y, () => front.bubblePos(), {
          dur: 280, height: 60, scaleTo: 0.5,
          onDone: (s) => {
            gs.effects.releaseItem(s);
            front.got++;
            front.popBubble();
            if (gs.isNear(front.x, front.y, 600)) Audio.play('sfx_pickup', { volume: 0.4, rate: 1 + front.got * 0.08, throttle: 40 });
            if (front.got >= front.want.count) this.complete(front);
          },
        });
      }
    }
    for (let i = 0; i < this.queue.length; i++) this.queue[i].update(dt, i);
    for (let i = this.leaving.length - 1; i >= 0; i--) {
      const c = this.leaving[i];
      c.update(dt, -1);
      if (!c.alive) this.leaving.splice(i, 1);
    }
  }

  complete(c) {
    const gs = this.gs;
    const i = this.queue.indexOf(c);
    if (i >= 0) this.queue.splice(i, 1);
    this.leaving.push(c);
    const price = BALANCE.prices[c.want.type] || 1;
    const value = price * c.want.count;
    c.hideBubble();
    c.state = 'happy';
    c.happyT = 0.9;
    c.play('happy', true);
    gs.effects.burst('heart', c.x, c.y + c.headTop - 4, 3);
    Audio.play('sfx_customer_happy', { volume: 0.7 });
    gs.time.delayedCall(200, () => { this.cash.add(value, c.x, c.y - 50); if (gs.isNear(c.x, c.y, 650)) Audio.play('sfx_cash', { volume: 0.55, throttle: 250 }); });
    gs.events.emit('sold', value);
  }

  restoreQueue(n) {
    for (let i = 0; i < n; i++) this.spawnCustomer(i);
  }
}

// ------------------------------------------------------------------ customer
export class Customer extends Character {
  constructor(gs, market, key, x, y, want) {
    super(gs, key, x, y, { radius: 13, capacity: 10 });
    this.market = market;
    this.want = want;
    this.need = want.count;
    this.got = 0;
    this.state = 'arrive';
    this.path = market.cfg.entry.slice(1).map((p) => ({ x: p[0] + (Math.random() - 0.5) * 40, y: p[1] + (Math.random() - 0.5) * 20 }));
    this.arrived = false;
    this.speed = BALANCE.customers.speed * (0.9 + Math.random() * 0.2);
    this.bubble = null;
    this.bubbleShown = false;
    this.happyT = 0;
    this.slot = -1;
    gs.agents.push(this);
  }

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
    c.setScale(0.85);
    this.bubble = c; this.bubbleText = tx; this.bubbleIcon = ic; c.__bs = 0.85;
    this.bubbleShown = true;
    this.updateBubble();
    c.setScale(0.2);
    gs.tweens.add({ targets: c, scale: 0.85, duration: 260, ease: 'Back.easeOut' });
  }
  updateBubble() { if (this.bubbleText) this.bubbleText.setText('x' + Math.max(0, this.want.count - this.got)); }
  setWant(type) {
    this.want.type = type;
    if (this.bubbleIcon) { const sc = this.bubbleIcon.scaleX; Assets.apply(this.bubbleIcon, type); this.bubbleIcon.setOrigin(0.5, 0.6).setScale(sc); }
    if (this.bubble) this.gs.effects.pop(this.bubble, 0.15, 90);
  }
  popBubble() {
    this.updateBubble();
    if (!this.bubble) return;
    this.gs.tweens.add({ targets: this.bubble, scale: { from: 1.0, to: 0.85 }, duration: 160, ease: 'Quad.easeOut' });
  }
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
            this.faceTo(this.market.x + 40, this.market.y - 20);
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
          // walk away carrying what we bought
          for (let i = 0; i < Math.min(6, this.want.count); i++) this.stack.push(this.want.type, null, gs.effects);
          this.path = this.market.cfg.exit.map((p) => ({ x: p[0] + (Math.random() - 0.5) * 50, y: p[1] }));
        }
        break;
      case 'leave': {
        const t = this.path[0];
        if (!t) { this.despawn(); break; }
        if (gs.moveAgent(this, t.x, t.y, this.speed * 1.1, dt, 30)) this.path.shift();
        break;
      }
    }
    if (this.bubble) {
      this.bubble.setPosition(this.x, this.y + this.headTop - 6 + Math.sin(gs.time.now / 300 + this.x) * 2);
    }
    this.sync(dt);
  }

  despawn() {
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
    const fp = Assets.def(cfg.sprite).footprint || [213, 106];
    this.obstacle = gs.collision.add(this.x, this.y, fp[0] * 0.42, 'trade');
    this.shelf = new Pad(gs, this.x + cfg.shelf[0], this.y + cfg.shelf[1], 'input', 1.6, { icon: 'item_plank', iconSize: 40 });
    this.stock = new ItemStack(gs, { scale: 0.95, cols: [[-20, -4], [20, 6]], typeCols: { item_plank: 0, item_ingot: 1 }, max: 80 });
    this.maxPerType = 40;
    this.cash = new CashPad(gs, this.x + cfg.cash[0], this.y + cfg.cash[1]);
    this.merchant = new Character(gs, 'villager_c', this.x + cfg.merchant[0], this.y + cfg.merchant[1], { dir: 1 });
    this.merchant.faceTo(this.shelf.x, this.shelf.y);
    this.buyT = 0;
    this.happyT = 0;
  }
  setEnabled(v) {
    this.enabled = v;
    this.img.setVisible(v); this.shelf.setVisible(v); this.cash.setEnabled(v);
    this.merchant.sprite.setVisible(v); this.merchant.shadow.setVisible(v);
    this.obstacle.active = v;
    this.stock.setVisible(v);
  }
  revealObjects() { return [this.img, this.shelf.img, this.cash.pad.img, this.merchant.sprite]; }

  feedFrom(ch) {
    for (let i = ch.stack.items.length - 1; i >= 0; i--) {
      const t = ch.stack.items[i].type;
      if (GOODS.indexOf(t) >= 0 && this.stock.countOf(t) + this.stock.incoming < this.maxPerType) {
        return this.gs.moveItem(ch.stack, this.stock, t, { dur: 240, height: 60, sfx: 'drop' });
      }
    }
    return false;
  }

  update(dt) {
    this.stock.layout(this.shelf.x, this.shelf.y + 6, this.shelf.y, 0, dt);
    this.cash.update(dt);
    if (!this.enabled) return;
    const m = this.merchant;
    this.buyT -= dt;
    if (this.buyT <= 0 && this.stock.count > 0) {
      this.buyT = BALANCE.trade.buyInterval;
      const it = this.stock.pop();
      const gs = this.gs;
      gs.effects.fly(it.spr, it.spr.x, it.spr.y, { x: m.x, y: m.y - 40 }, {
        dur: 260, height: 50, scaleTo: 0.5,
        onDone: (s) => {
          gs.effects.releaseItem(s);
          this.cash.add(BALANCE.prices[it.type] || 1, m.x, m.y - 50);
        },
      });
      if (this.happyT <= 0) { m.play('happy', true); }
      this.happyT = 0.7;
    }
    if (this.happyT > 0) { this.happyT -= dt; if (this.happyT <= 0) m.play('idle'); }
    m.sync(dt);
  }
}
