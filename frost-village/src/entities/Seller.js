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
import { t } from '../data/strings.js';
import { floatLabel } from './Shop.js';

export { FOODS, GOODS };

// ------------------------------------------------------------------ cash pad
/** (v4.2 F1) has this shelf had none of `ty` for porters.shelfEmptyAfter s? (Surplus keeps the clocks) */
function shelfEmpty(gs, seller, ty) { const S = gs.v42 && gs.v42.surplus; return !!(S && S.shelfEmpty(seller, ty)); }

export class CashPad {
  constructor(gs, x, y) {
    this.gs = gs; this.x = x; this.y = y;
    this.pad = new Pad(gs, x, y, 'cash', 1.5);
    this.value = 0;
    this.pile = new ItemStack(gs, { scale: 0.85, cols: [[0, -16], [-22, -5], [22, -5], [0, 6], [-44, 6], [44, 6], [-22, 17], [22, 17], [0, 28]], perCol: 5, max: BALANCE.cash.pileVisualMax, bake: true });
    this.collectT = 0;
    this.toChief = 0;       // ((v4.2.1) coins of the pile the chief has already been paid for: they fly to him)
    this.enabled = true;
    this.spin = gs.effects.loop('fx_coin_spin', x, y - 70, 46, DEPTH.LABEL - 5);
    if (this.spin) this.spin.setVisible(false);
  }
  setEnabled(v) { this.enabled = v; this.pad.setVisible(v); this.pile.setVisible(v); if (this.spin && !v) this.spin.setVisible(false); }
  /** ((v4.3) the shop grew: the till moves with its coins (the pile lays itself out at the new place) */
  moveTo(x, y) {
    if (x === this.x && y === this.y) return;
    this.x = x; this.y = y;
    this.pad.x = x; this.pad.y = y;
    this.pad.img.setPosition(x, y);
    if (this.pad.icon) this.pad.icon.setPosition(x, y);
    if (this.spin) this.spin.x = x;
  }

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
          onDone: (s) => {
            this.pile.incoming--;
            // ((v4.2.1 fix, ghost coins) the till was emptied while this coin flew (딸랑이's round, a self-emptying till, the
            //  chief who took it and walked on): the coin went with it — it never lands on the empty till as a coin worth
            //  nothing (딸랑이 skips a till with no value: it stayed there for good)
            if (this.value <= 0 && !this.pad.contains(gs.player.x, gs.player.y)) { gs.effects.releaseItem(s); gs.effects.burst('coin', this.x, this.y - 30, 1); return; }
            this.pile.push('item_coin', s);
            if (gs.isNear(this.x, this.y, 500)) Audio.play('sfx_coin', { volume: 0.4, rate: 0.95 + Math.random() * 0.2, throttle: 50 });
          },
        });
      });
    }
  }

  /** ((v4.2.0.1) add `amount` coins without the flight (the till is off screen): value AND pile, by add()'s rule — the
   *  tax box and the 물류 금고 used to raise only the value while the camera was away: real coins, no picture) */
  addQuiet(amount) {
    this.value += amount;
    const n = Math.min(6, Math.max(1, Math.round(amount / 3)));
    for (let i = 0; i < n && this.pile.count + this.pile.incoming < this.pile.max; i++) this.pile.push('item_coin', null, this.gs.effects);
  }

  update(dt) {
    this.pile.layout(this.x, this.y + 4, this.y, 0, dt);
    if (!this.enabled) return;
    if (this.spin) {
      const show = this.value > 0;
      if (this.spin.visible !== show) this.spin.setVisible(show);
      if (show) this.spin.y = this.y - 74 - this.pile.count * 0.8 + Math.sin(this.gs.time.now / 300) * 5;
    }
    const p = this.gs.player, on = this.pad.contains(p.x, p.y);
    // ((v4.2.1 fix, ghost coins) the coins on the pad when the chief takes the till are his: they follow him even when he
    //  runs straight on, and even when a customer pays again before they have all flown (a busy till); a pile that holds
    //  no value follows him too. Left on the pad they looked uncollected, and 딸랑이 skips a till that holds no value)
    if (this.toChief > this.pile.count) this.toChief = this.pile.count;
    if ((this.value > 0 && on) || (this.pile.count > 0 && (on || this.value <= 0 || this.toChief > 0))) {
      if (this.value > 0 && on) {
        const v = this.value;
        this.value = 0;
        this.toChief = this.pile.count;
        this.gs.economy.add(v, p.x, p.y - 60, true);
        this.gs.effects.floatText(p.x, p.y - 100, '+' + v, '#ffd84a', 34);
        Audio.play('sfx_coins_many', { volume: 0.9 });
        this.gs.effects.vibrate(15);
        this.pad.pulse();
      }
      this.collectT -= dt;
      while (this.collectT <= 0 && this.pile.count > 0 && (on || this.value <= 0 || this.toChief > 0)) {
        this.collectT += BALANCE.cash.collectInterval;
        if (this.toChief > 0) this.toChief--;
        const it = this.pile.pop();
        this.gs.effects.fly(it.spr, it.spr.x, it.spr.y, () => ({ x: p.x, y: p.y - 50 }), {
          dur: 240, height: 60, scaleTo: 0.5,
          onDone: (s) => { this.gs.effects.releaseItem(s); this.gs.ui.coinFly(p.x, p.y - 50, 1); },
        });
      }
    }
  }
  /** (v4.2, docs/v42_plan.md §6.5) someone else empties the till (딸랑이's round): every coin, the top of the pile
   *  hops toward `ch` (an object with x / y), the pad pulses; returns the coins taken */
  takeAll(ch) {
    const gs = this.gs;
    const n = Math.max(0, Math.floor(this.value || 0));
    if (n <= 0) return 0;
    this.value = 0;
    for (let i = 0; i < 6 && this.pile.count > 0; i++) {
      const it = this.pile.pop();
      if (!it) break;
      if (it.spr) gs.effects.fly(it.spr, it.spr.x, it.spr.y, { x: (ch ? ch.x : this.x) + 12, y: (ch ? ch.y : this.y) - 110 }, { dur: 260 + i * 40, height: 50, scaleTo: 0.35, onDone: (s) => gs.effects.releaseItem(s) });
    }
    this.pile.clear(gs.effects);
    this.toChief = 0;
    if (this.pad && this.pad.pulse) this.pad.pulse();
    return n;
  }
  serialize() { return this.value; }
  restore(v) {
    v = Math.max(0, Math.floor(v || 0));
    this.value = v;
    const n = Math.min(this.pile.max, Math.ceil(v / 3));
    for (let i = 0; i < n; i++) this.pile.push('item_coin', null, this.gs.effects);
  }
}

// ((v4.2.0.2) the signboard's name, written by the game on the art's blank board; (v4.3) also the name plates of the
//  staged shop's counters) a canvas text sheared like the board (the office sign's way, OfficeBuilding.makeSign):
//  q = the 4 corners of the board face (px from the anchor; the face looks down-left, so its top edge falls 1 px per 2 px
//  to the right). Made once per key; returns { w, h, sh, fs (letter size, sprite px), lines } (fs 0: made before)
const SIGN_S = 3;
export function signTexture(gs, key, txt, q, color, iconRoom) {
  const w = Math.max(8, q[1][0] - q[0][0]), h = Math.max(8, q[3][1] - q[0][1]), sh = (q[1][1] - q[0][1]) / w;
  const out = { w, h, sh, fs: 0, lines: 1 };
  if (gs.textures.exists(key)) return out;
  const S = SIGN_S;
  const c = gs.textures.createCanvas(key, Math.ceil(w * S), Math.ceil((h + w * Math.abs(sh)) * S) + 2);
  if (!c) return out;
  const ctx = c.context, font = (px) => '900 ' + px + 'px ' + (gs.font || 'sans-serif');
  ctx.setTransform(S, S * sh, 0, S, 0, sh < 0 ? -S * sh * w : 0);
  // ((v4.3) a plate with an item icon on its left: the word takes the rest of the board)
  const ix = Math.max(0, Math.floor(iconRoom || 0)), tw = w - ix;
  let fs = Math.round(h * 0.66);
  ctx.font = font(fs);
  while (fs > 7 && ctx.measureText(txt).width > tw - 8) { fs--; ctx.font = font(fs); }
  // ((v4.2.0.2 fix STALL-P3) a long name that one line shrinks (en "Snowbloom Stall": 11 px on the 25 px board)
  //  goes on two lines, split at the space nearest its middle, when that makes the letters at least 2 px bigger
  //  ("Snowbloom" / "Stall": 13 px in the test browser); 「눈꽃 노점」 stays one 17 px line)
  let lines = [txt], fs2 = 0, two = null;
  const sp = txt.indexOf(' ') > 0 ? [...txt.matchAll(/ /g)].map((m) => m.index) : [];
  if (sp.length && fs < Math.round(h * 0.66)) {
    const at = sp.reduce((b, i) => (Math.abs(i - txt.length / 2) < Math.abs(b - txt.length / 2) ? i : b), sp[0]);
    two = [txt.slice(0, at), txt.slice(at + 1)];
    const met = (l, px) => { const m = ctx.measureText(l); return { wd: m.width, a: Number.isFinite(m.actualBoundingBoxAscent) ? m.actualBoundingBoxAscent : px * 0.76, dd: Number.isFinite(m.actualBoundingBoxDescent) ? m.actualBoundingBoxDescent : px * 0.04 }; };
    const fits = (px) => { ctx.font = font(px); const m = two.map((l) => met(l, px)); return m.every((q2) => q2.wd <= tw - 6) && m[0].a + m[0].dd + m[1].a + m[1].dd + Math.max(1, px * 0.08) <= h - 1; };
    fs2 = Math.round(h * 0.66);
    while (fs2 > 7 && !fits(fs2)) fs2--;
    if (fs2 >= fs + 2) lines = two; else ctx.font = font(fs);
  }
  ctx.textAlign = 'center';
  const cx = ix + tw / 2;
  const ink = (dy) => {
    if (lines.length === 1) { ctx.textBaseline = 'middle'; ctx.fillText(txt, cx, h / 2 + dy); return; }
    ctx.font = font(fs2); ctx.textBaseline = 'alphabetic';
    const m = lines.map((l) => { const q2 = ctx.measureText(l); return { a: Number.isFinite(q2.actualBoundingBoxAscent) ? q2.actualBoundingBoxAscent : fs2 * 0.76, dd: Number.isFinite(q2.actualBoundingBoxDescent) ? q2.actualBoundingBoxDescent : fs2 * 0.04 }; });
    const gap = Math.max(1, fs2 * 0.08), tall = m[0].a + m[0].dd + gap + m[1].a + m[1].dd, top = (h - tall) / 2;
    ctx.fillText(lines[0], cx, top + m[0].a + dy - 0.6);
    ctx.fillText(lines[1], cx, top + m[0].a + m[0].dd + gap + m[1].a + dy - 0.6);
  };
  // carved look: a light edge below, the brown letters on top
  ctx.fillStyle = 'rgba(255, 248, 230, 0.55)';
  ink(1.6);
  ctx.fillStyle = color || '#6E3E1E';
  ink(0.6);
  c.refresh();
  out.fs = lines.length === 1 ? fs : fs2;
  out.lines = lines.length;
  return out;
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
    // ((v4.2.0.2) the stage-1 stall 「눈꽃 노점」 (assets/market, docs: 기획서_마을새단장 ① ②): its art missing (a
    //  failed download) -> the old awning stall it replaced (spriteOld) so the plaza never shows a hole)
    const spr = this.sprite = cfg.spriteOld && !Assets.has(cfg.sprite) ? cfg.spriteOld : cfg.sprite;
    this.img = Assets.image(gs, this.x, this.y, spr).setDepth(this.y);
    if (gs.lazyImage) gs.lazyImage(this.img, spr);
    gs.addOccluder(this.img);
    this.occ = gs.occluders ? gs.occluders[gs.occluders.length - 1] : null;
    const fp = Assets.def(spr).footprint || [195, 97];
    const co = cfg.collider || [0, 0, 0.44];
    this.obstacle = gs.collision.add(this.x + co[0], this.y + co[1], fp[0] * co[2], this.id);
    this.shelf = new Pad(gs, this.x + cfg.shelf[0], this.y + cfg.shelf[1], 'input', 1.6, { icon: this.goods[0], iconSize: 40 });
    this.maxPerType = Math.max(1, Math.floor(cfg.shelfMax || BALANCE.customers.shelfMax) || 40);
    const tc = {};
    this.goods.forEach((g, i) => { tc[g] = i; });
    this.stock = new ItemStack(gs, {
      scale: 0.95, cols: cfg.stockCols || [[-28, -2], [0, 10], [28, -2]],
      typeCols: tc, max: this.maxPerType * this.goods.length, bake: cfg.id === 'store' ? true : 'eager',
      // ((v4.2.0.2 fix STALL-P2) the plaza stall's towers stop growing below its signboard (world.js stockDrawMax):
      //  40 cooked fish rose over the sign's last syllable 「점」. The extra items stay on top of their tower)
      drawMax: Math.max(0, Math.floor(cfg.stockDrawMax) || 0),
      // ((v4.2.0.2 fix R4) bread layers are about 1.5x a fish layer: its tower stops lower (world.js stockDrawMaxBy))
      drawMaxBy: cfg.stockDrawMaxBy || null,
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
    this.register = new Register(gs, this, cfg, spr);
    this.waitPayT = 0;         // how long the front customer has been waiting to pay
    // ((v4.2.0.2) the signboard's name, written by the game (strings.js sign_market_1 = 눈꽃 노점), so a later stage
    //  only changes the key; the sign and the counter (the front layer over the clerk) fade with the stall's x-ray)
    this.sign = null;
    this.makeSign();
    this.linkFade(this.sign);
    // ((v4.2.0.2 fix STALL-C2) only the stall's counter layer: the 잡화점 (a Market on shop_general) keeps its counter
    //  overlay opaque as in 4.2.0.1)
    if (Assets.def(spr).stage) this.linkFade(this.register.overlay);
    // (v3) porters restock the shelf through logistics
    this.sink = {
      id: this.id + '_shelf', isWarehouse: false, enabled: true, x: this.shelf.x + 30, y: this.shelf.y + 22,
      accepts: (ty) => this.goods.indexOf(ty) >= 0,
      room: (ty) => (this.enabled ? Math.max(0, this.maxPerType - this.stock.countWithIncoming(ty)) : 0),
      prio: (ty) => (shelfEmpty(gs, this, ty) ? PRIO.SHELF_EMPTY : this.stock.countWithIncoming(ty) < this.maxPerType * (BALANCE.warehouse.restockBelow || 0.25) ? PRIO.SHELF_LOW : PRIO.SHELF),
      feed: (ch) => this.feedFrom(ch),
    };
    if (gs.logistics) gs.logistics.add(this.sink);
  }

  /**
   * ((v4.2.0.2) the stall's name on its blank signboard: the art's signQuad (4 corners of the board face, px from the
   * anchor; the face looks down-left, so its top edge falls 1 px per 2 px to the right) and signText (a strings.js
   * key). A canvas text sheared like the board (the office sign's way, OfficeBuilding.makeSign), redrawn on a
   * language change (refreshSign). No signQuad (the old stall, the general store): nothing.
   */
  makeSign() {
    const gs = this.gs, d = Assets.def(this.sprite), q = d && d.signQuad;
    if (!Array.isArray(q) || q.length < 4 || !d.signText) return null;
    const txt = t(d.signText) || '';
    const key = 'fv_sign_' + this.id + '_' + txt;
    const m = signTexture(gs, key, txt, q, d.signColor);
    if (m.fs) { this.signFont = m.fs; this.signLines = m.lines; }     // (tests: the letter size in sprite px)
    if (this.sign) {
      const old = this.sign.texture && this.sign.texture.key;
      this.sign.setTexture(key);
      // (the other language's name: one sign texture in memory at a time)
      if (old && old !== key && /^fv_sign_/.test(old) && gs.textures.exists(old)) gs.textures.remove(old);
    } else this.sign = gs.add.image(this.x + q[0][0], this.y + q[0][1] - (m.sh < 0 ? -m.sh * m.w : 0), key).setOrigin(0, 0).setScale(1 / SIGN_S).setDepth(this.y + 0.2);
    this.sign.setVisible(this.enabled && this.img.visible);
    return this.sign;
  }
  /** (v4.2.0.2) the language changed: the signboard's name again */
  refreshSign() { if (this.sign) this.makeSign(); }
  /** (v4.2.0.2) a picture drawn with the stall (its sign, its front layer) fades with the stall's x-ray */
  linkFade(img) {
    const gs = this.gs;
    if (!img || !this.occ || !gs.occluders) return;
    gs.occluders.push({ img, x: img.x, y: -1e9, hw: 0, top: 0, a: 1, link: this.occ });
  }

  setEnabled(v) {
    this.enabled = v;
    this.sink.enabled = v;
    this.img.setVisible(v); this.shelf.setVisible(v); this.cash.setEnabled(v); this.stock.setVisible(v);
    if (this.sign) this.sign.setVisible(v);
    this.obstacle.active = v;
    this.register.setEnabled(v);
    if (this.emptyLab && !v) this.emptyLab.c.setVisible(false);
    for (const c of this.queue) { c.sprite.setVisible(v); c.shadow.setVisible(v); if (c.bubble) c.bubble.setVisible(v); }
  }
  revealObjects() { const o = [this.img, this.shelf.img, this.cash.pad.img].concat(this.register.revealObjects()); if (this.sign) o.push(this.sign); return o; }

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
    // ((v4.2 fix) the general store's places moved around a pine / the edge of the land: Game.storeLine)
    if (c.slots && c.slots[i]) return { x: c.slots[i].x, y: c.slots[i].y };
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
    let foods = this.availableFoods();
    // ((v4.2 final, gameplay review #5) the 잡화점: a new customer asks for a kind that is on the shelf, on its way to it
    //  or waiting at its workshop's door (the forge makes runs of one kind) — bubbles for bows while only cans stood on
    //  the shelf read as a shop that cannot sell. Nothing anywhere: any kind it sells, as before
    if (this.cfg.id === 'store' && foods.length > 1) {
      const gs = this.gs;
      const atDoor = (g) => (gs.workshops || []).some((w) => w.outStack && w.outStack.countOf(g) > 0);
      const have = foods.filter((g) => this.stock.countWithIncoming(g) > 0 || (gs.carriedTo && gs.carriedTo(this.sink, g) > 0) || atDoor(g));
      if (have.length) foods = have;
    }
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
    if (c && c.exitPathOverride) return c.exitPathOverride();     // (v4-A) a train visitor walks back to the station
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
    let key = pool[Math.floor(Math.random() * pool.length)];
    recent.push(key);
    while (recent.length > Math.min(4, Math.max(1, all.length - 2))) recent.shift();
    // (v4-A) once the neighbours come by train, the customers look like the townsfolk they are
    const look = gs.v4 && gs.v4.pickLook ? gs.v4.pickLook(this) : null;
    if (look) key = look.key;
    let x, y, next = 1, visible = false;
    if (atSlot !== undefined) { const s = this.slotPos(atSlot); x = s.x; y = s.y; }
    else { const sp = this.spawnPoint(); x = sp.x + (Math.random() - 0.5) * 30; y = sp.y; next = sp.next; visible = sp.visible; }
    const c = new Customer(gs, this, key, x, y, this.makeWant(), next, atSlot === undefined ? { x, y } : null, look ? { person: look.person } : null);
    if (look) { c.citizen = look.citizen || null; if (gs.v4.noteVisit) gs.v4.noteVisit(look.citizen); }
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
    if (this.cfg.emptyLabel) this.emptyCue(dt);
    // spawn
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      // (v3.5 review) once the village is complete customers come a little more often (balance.js customers.spawnEveryLate)
      const late = !this.cfg.spawnEvery && gs.progress && gs.progress.complete && Number(BALANCE.customers.spawnEveryLate);
      // ((v4.2.1) cfg.spawnK(): a factor on that time — the 잡화점's guests come more often once meat cans exist)
      const k = this.cfg.spawnK ? Math.max(0.1, Number(this.cfg.spawnK()) || 1) : 1;
      this.spawnT = Math.max(0.3, Number(this.cfg.spawnEvery || late || BALANCE.customers.spawnEvery) || 2.6) * (0.8 + Math.random() * 0.4) * k;
      // (v4-A) while train visitors wait to join the line, the anonymous customers let them in first
      const vw = gs.v4 && gs.v4.visitorsWaiting ? gs.v4.visitorsWaiting(this) : 0;
      if (this.queue.length < this.maxQueue && vw < 2 && (!this.cfg.available || this.availableFoods().length)) this.spawnCustomer();
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

  /**
   * ((v4.2 fix, the designer's "잡화점 판매원있는데 판매를 안해") the general store's shelf has been empty for
   * customers.emptyCueS s while a customer waits at the counter: a label over the shelf says so ('판매대가 비었어요'),
   * so a clerk standing by a still line reads as "the goods are on their way", not "the shop does not sell"
   */
  emptyCue(dt) {
    const gs = this.gs, f = this.queue[0];
    const waiting = this.stock.count === 0 && !!(f && f.arrived && f.state === 'wait' && f.need > 0);
    this.emptyT = waiting ? (this.emptyT || 0) + dt : 0;
    const show = this.emptyT >= (Number(BALANCE.customers.emptyCueS) || 4);
    if (show && !this.emptyLab) this.emptyLab = floatLabel(gs, this.shelf.x, this.shelf.y - 92, this.goods[0]);
    if (!this.emptyLab) return;
    // ((v4.2 final, gameplay review #7) the icon is what the waiting customer wants, not always the can)
    if (show) this.emptyLab.set(t('storeShelfEmpty'), (f && f.want && f.want.type) || this.goods[0]);
    if (this.emptyLab.c.visible !== show) this.emptyLab.c.setVisible(show);
    if (show) this.emptyLab.bob(gs.time.now);
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
    gs.events.emit(this.cfg.soldEvent || 'sold', value, c);
  }

  restoreQueue(n) {
    for (let i = 0; i < n; i++) this.spawnCustomer(i);
  }
}

// ------------------------------------------------------------------ customer
export class Customer extends Character {
  constructor(gs, market, key, x, y, want, pathFrom = 1, home = null, opts = null) {
    // (v4-A) opts.person: the customer is a townsperson paper doll
    super(gs, key, x, y, Object.assign({ radius: 13, capacity: 10 }, opts || {}));
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

  bubbleTarget(slot) { const k = this.market && this.market.bubbleScale; if (k) return k(slot); return slot <= 0 ? 0.9 : slot === 1 ? 0.72 : 0.62; }

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
    // ((v4.2 final) an item still flying to a customer whose bubble went (he left, a train visitor called away, a
    //  despawn): its landing must not write into the destroyed text — Phaser threw from setText)
    if (!this.bubbleText || !this.bubble) return;
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
    this.bubble = null; this.bubbleText = null; this.bubbleIcon = null;
    this.gs.tweens.add({ targets: b, scale: 0, alpha: 0, duration: 180, onComplete: () => b.destroy() });
  }
  bubblePos() { return { x: this.x - 12 + ((this.market && this.market.bubbleDX) || 0), y: this.y + this.headTop - 40 }; }

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
      // ((v4.3) in the staged shop's lines the bubble leans left (market.bubbleDX): the next counter's clerk stands to the
      //  right, a straight-up bubble covered her apron (gate G6))
      this.bubble.setPosition(this.x + (this.market.bubbleDX || 0), this.y + this.headTop - 6 + (this.market.bubbleDY || 0) + Math.sin(gs.time.now / 300 + this.x) * 2);
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
    this.stock = new ItemStack(gs, { scale: 0.95, cols: [[-20, -4], [20, 6]], typeCols: { item_plank: 0, item_ingot: 1 }, max: this.maxPerType * GOODS.length, bake: 'eager' });
    this.cash = new CashPad(gs, this.x + cfg.cash[0], this.y + cfg.cash[1]);
    // (v3) the merchant is the customer: he stands in front of the stall (the clerk works behind it)
    this.merchant = new Character(gs, 'villager_c', this.x + cfg.merchant[0], this.y + cfg.merchant[1], { dir: 1 });
    this.merchant.faceTo(this.x + 20, this.y - 30);
    this.merchant.noXray = true;
    this.buyT = 0;
    this.happyT = 0;
    this.flying = {};      // goods on their way to the merchant (not paid yet)
    this.front = [-60, 30];
    // (v2) the merchant only buys while someone stands at the register (the chief or a clerk)
    this.register = new Register(gs, this, cfg, cfg.sprite);
    this.waitT = 0;
    this.waitIcon = null;
    this.goods = GOODS;
    this.sink = {
      id: 'trade_shelf', isWarehouse: false, enabled: true, x: this.shelf.x + 30, y: this.shelf.y + 22,
      accepts: (ty) => GOODS.indexOf(ty) >= 0,
      room: (ty) => (this.enabled ? Math.max(0, this.maxPerType - this.stock.countWithIncoming(ty)) : 0),
      prio: (ty) => (shelfEmpty(gs, this, ty) ? PRIO.SHELF_EMPTY : this.stock.countWithIncoming(ty) < this.maxPerType * (BALANCE.warehouse.restockBelow || 0.25) ? PRIO.SHELF_LOW : PRIO.SHELF),
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
  get waitingPay() { return this.enabled && this.stock.count > this.kept() && !this.register.staffed; }
  /** ((v4.2) the display the merchant leaves on the shelf after village complete: not waiting to be sold) */
  kept() {
    const gs = this.gs, keep = gs.v42 && gs.v42.frules ? Math.max(0, Math.floor(Number(BALANCE.v42.trade && BALANCE.v42.trade.displayKeep) || 0)) : 0;
    if (!keep) return 0;
    let n = 0;
    for (const ty of GOODS) n += Math.min(keep, this.stock.countOf(ty));
    return n;
  }

  feedFrom(ch) {
    for (let i = ch.stack.items.length - 1; i >= 0; i--) {
      const t = ch.stack.items[i].type;
      if (GOODS.indexOf(t) >= 0 && this.stock.countWithIncoming(t) < this.maxPerType) {
        return this.gs.moveItem(ch.stack, this.stock, t, { dur: 240, height: 60, sfx: 'drop' });
      }
    }
    return false;
  }

  /** (v4-A) once the neighbours come by train, the buyer here is one of them too (a builder of 솔방울 마을
   *  buying planks and ingots); after a dozen purchases, with nothing left on the shelf, another one comes */
  townLook(dt) {
    this.lookT = (this.lookT || 0) - dt;
    if (this.lookT > 0) return;
    this.lookT = 3;
    const nb = this.gs.v4, m = this.merchant;
    if (!nb || !nb.merchantLook) return;
    const busy = this.stock.count > 0 || this.happyT > 0 || Object.keys(this.flying).some((k) => this.flying[k] > 0);
    if (m.citizen && (this.bought < 12 || busy)) return;
    if (!m.citizen && busy && this.bought > 0) return;
    const look = nb.merchantLook(m.citizen || null);
    if (look) this.swapMerchant(look);
  }

  /** the kinds on the shelf with more than `keep` items (what the merchant may buy) */
  buyable(keep) {
    const out = this._buyable || (this._buyable = []);
    out.length = 0;
    for (const ty of GOODS) if (this.stock.countOf(ty) > keep) out.push(ty);
    return out;
  }

  swapMerchant(look) {
    const gs = this.gs, old = this.merchant;
    const m = new Character(gs, look.key, old.x, old.y, { dir: 1, person: look.person });
    m.citizen = look.citizen || null;
    m.noXray = true;
    m.faceTo(this.x + 20, this.y - 30);
    this.merchant = m;
    this.bought = 0;
    if (!this.enabled) { m.sprite.setVisible(false); m.shadow.setVisible(false); old.destroy(); return; }
    m.sprite.setAlpha(0); m.shadow.setAlpha(0);
    gs.tweens.add({ targets: [m.sprite, m.shadow], alpha: 1, duration: 450 });
    gs.tweens.add({ targets: [old.sprite, old.shadow], alpha: 0, duration: 300, onComplete: () => old.destroy() });
  }

  update(dt) {
    this.stock.layout(this.shelf.x, this.shelf.y + 6, this.shelf.y, 0, dt);
    this.cash.update(dt);
    if (!this.enabled) return;
    this.register.update(dt);
    this.townLook(dt);
    const m = this.merchant;
    const gs = this.gs;
    this.buyT -= dt;
    const staffed = this.register.staffed;
    const selling = this.stock.count > this.kept();
    if (selling && !staffed) this.waitT += dt; else this.waitT = 0;
    // waiting for a cashier: a pulsing coin over the merchant
    const showWait = selling && !staffed;
    if (showWait && !this.waitIcon) {
      this.waitIcon = Assets.image(gs, m.x, m.y + m.headTop - 30, Assets.pick('ui_icon_coin', 'ui_icon_check')).setDepth(DEPTH.BUBBLE);
      this.waitIcon.setScale(40 / Math.max(1, this.waitIcon.frame.realWidth));
      this.waitIcon.__bs = this.waitIcon.scaleX;
    }
    if (this.waitIcon) {
      this.waitIcon.setVisible(showWait);
      if (showWait) { this.waitIcon.setScale(this.waitIcon.__bs * (1 + Math.max(0, Math.sin(gs.time.now / 140)) * 0.15)); this.waitIcon.y = m.y + m.headTop - 30 + Math.sin(gs.time.now / 300) * 3; }
    }
    // ((v4.2, gameplay review M5) after village complete the merchant leaves `displayKeep` of each kind on the shelf:
    //  goods stand on display instead of the shelf looking empty between deliveries; nothing is lost)
    const keep = gs.v42 && gs.v42.frules ? Math.max(0, Math.floor(Number(BALANCE.v42.trade && BALANCE.v42.trade.displayKeep) || 0)) : 0;
    const buyable = keep > 0 ? this.buyable(keep) : null;
    if (this.buyT <= 0 && this.stock.count > 0 && staffed && (!keep || buyable.length)) {
      this.buyT = this.register.clerk ? BALANCE.trade.buyInterval * BALANCE.register.clerkTradeSlow : BALANCE.trade.buyInterval;
      const it = keep ? this.stock.pop(buyable) : this.stock.pop();
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
      this.bought = (this.bought || 0) + 1;
    }
    if (this.happyT > 0) { this.happyT -= dt; if (this.happyT <= 0) { m.faceTo(this.x + 20, this.y - 30); m.play('idle'); } }
    m.sync(dt);
  }
}

// ================================================================== (v4.3) the plaza shop in stages
// 「마을 새 단장」 (docs/기획서_마을새단장.md §4–5, docs/redesign_v43/engineering_plan.md §4.2): the first shop grows sideways —
// 1 눈꽃 노점 (one food counter, the 4.2.0.2 stall as shipped), 2 눈꽃 가게 (자재 창구 · 먹거리; comes with the forest),
// 3 눈꽃 시장 (자재 · 생선 · 빵·고기; bought after the first bread sale). The counters stand in one straight row, the 자재 창구
// (the old trade post, merged) at the WEST end, the lines side by side in front. gs.market = this shop; gs.trade = its 자재
// 창구 (MatCounter: the old TradePost surface, so Surplus / V42 / Neighbours / Occlusion / OfficePanel keep working).
//   Food counters ("lanes") have their own line, register and clerk; they share ONE food rack (this.stock: every food, one
//   tower per kind at the east end) and ONE till (this.cash). A new customer only picks a kind that a SERVED lane sells (a
//   clerk at its post, or the chief on its register pad — the chief opens a lane at once); with nobody serving anywhere the
//   first lane takes them, as the stall always did. A lane whose kinds have been gone for market43.switchS s (or that
//   nobody serves) sends its waiting customers to a served lane that has stock. Customers still appear on market.entry.
//   Seats: the clerks belong to seats that move with the stages — A = the first clerk (hire_clerk_market: the food lane,
//   at stage 3 the fish lane), M = the 자재 점원 (hire_clerk_trade), B = the stage-3 빵·고기 clerk (hire_clerk_s3).
const LANE_TYPES = { food: FOODS, fish: ['item_fish_cooked'], breadmeat: ['item_bread', 'item_meat_cooked'] };
export const SHOP_COUNTERS = { 1: ['food'], 2: ['mat', 'food'], 3: ['mat', 'fish', 'breadmeat'] };
export const SHOP_STAGE_MAX = 3;
const SEAT_OF = { food: 'A', fish: 'A', breadmeat: 'B', mat: 'M' };
const M43 = () => BALANCE.market43 || {};
const LANE_BUBBLE = (slot) => (slot <= 0 ? 0.74 : slot === 1 ? 0.64 : 0.56);
const m43List = (k, i, d) => { const a = M43()[k]; const v = Array.isArray(a) ? Number(a[Math.max(0, Math.min(a.length - 1, i))]) : NaN; return Number.isFinite(v) && v > 0 ? v : d; };
/** the per-kind shelf max at stage `st` (market43.shelfMax; stage 1 = customers.shelfMax as in 4.2) */
export function shopShelfMax(st) { return Math.max(1, Math.floor(m43List('shelfMax', st - 1, st <= 1 ? (BALANCE.customers.shelfMax || 40) : 40))); }
const XO = (m) => [Math.round(45.25 * m), Math.round(22.63 * m)];
const YO = (m) => [Math.round(45.25 * m), Math.round(-22.63 * m)];
const LM = (lx, ly) => [Math.round(45.25 * (lx + ly)), Math.round(22.63 * (lx - ly))];   // art-local metres -> px

/** a food counter of the shop: one line, one register; Customer / Visitor treat it as their market */
class Lane {
  constructor(shop, id) {
    this.shop = shop; this.gs = shop.gs; this.id = id;
    this.types = LANE_TYPES[id];
    this.queue = [];
    this.open = false;
    this.register = null;
    this.cfg = { queueStart: [0, 0], queueStep: YO(-0.9), queueTurn: 6, queueStep2: XO(0.9), faceTo: [40, -20] };
    this.front = [-60, 30];
    this.serveT = 0; this.payT = 0; this.waitPayT = 0; this.emptyT = 0; this.idleT = 0;
  }
  get x() { return this.shop.x; }
  get y() { return this.shop.y; }
  /** ((v4.3) stages 2-3: the bubbles of this line lean left and sit a little lower and smaller (Customer.update): the
   *  next counter's clerk stands up-right of the front customer, and the clerk two counters west stands right above the
   *  front bubble on screen (the iso view: 4 m east and 2.45 m out lands under her apron) — gate G6, clerk_view.mjs */
  get bubbleDX() { return this.shop.stage >= 2 ? -22 : 0; }
  get bubbleDY() { return this.shop.stage >= 2 ? 8 : 0; }
  get bubbleScale() { return this.shop.stage >= 2 ? LANE_BUBBLE : null; }
  get leaving() { return this.shop.leaving; }
  get enabled() { return this.shop.enabled && this.open; }
  get goods() { return this.types; }
  get stock() { return this.shop.stock; }
  get maxQueue() { return this.shop.maxQueue; }
  get maxPerType() { return this.shop.maxPerType; }
  get sink() { return this.shop.sink; }
  get shelf() { return this.shop.shelf; }
  get cash() { return this.shop.cash; }
  /** someone takes payments here now (a clerk at her post, or the chief on the pad) */
  get served() { return this.open && !!this.register && this.register.staffed; }
  slotPos(i) { return Market.prototype.slotPos.call(this, i); }
  entryPath(from, sp) { return this.shop.entryPath(from, sp); }
  exitPath(c) { return this.shop.exitPath(c); }
  spawnPoint() { return this.shop.spawnPoint(); }
  availableFoods() { return this.shop.availableFoods().filter((ty) => this.types.indexOf(ty) >= 0); }
  payTarget() { const f = this.queue[0]; return f && f.arrived ? f : null; }
  get waitingPay() { const f = this.queue[0]; return !!(f && f.state === 'wait' && f.arrived && f.got >= f.want.count); }
  hasStock() { for (const ty of this.types) if (this.stock.countOf(ty) > 0) return true; return false; }

  update(dt) {
    const gs = this.gs, shop = this.shop, front = this.queue[0];
    const sw = Math.max(0.5, Number(M43().switchS) || 4);
    if (front && front.state === 'wait' && front.arrived) {
      if (!front.bubbleShown) front.showBubble();
      // never stall the line: the wanted kind is out but another kind of this counter is there -> take that one
      if (front.need > 0 && this.stock.countOf(front.want.type) === 0) {
        for (const f of this.types) if (this.stock.countOf(f) > 0) { front.setWant(f); break; }
      }
      this.serveT -= dt;
      if (this.serveT <= 0 && front.need > 0 && this.stock.countOf(front.want.type) > 0) {
        this.serveT = BALANCE.customers.takeInterval;
        shop.handOver(front, this);
      }

      // everything handed over: pay at the register (only while someone is at it)
      if (this.queue[0] === front && front.got >= front.want.count && front.flying.length === 0) {
        this.waitPayT += dt;
        if (!front.payWait) { front.payWait = true; front.updateBubble(); }
        if (this.register.staffed) {
          this.payT -= dt;
          if (this.payT <= 0) {
            this.payT = this.register.clerk ? BALANCE.register.clerkPayTime : BALANCE.register.chiefPayTime;
            this.register.onPay(front);
            shop.complete(front, this);
          }
        } else this.payT = Math.min(this.payT, 0.25);
      } else this.waitPayT = 0;
    } else this.waitPayT = 0;
    // ((v4.3) none of this counter's kinds on the rack for switchS s: its customers who still want something move to a
    //  served line that has goods (and want what is there) — the front one too, with what it already got. With no such
    //  line they wait for the porters, as at the stall. Checked again every switchS / 2 s while the rack stays empty
    if (this.queue.length && !this.hasStock()) this.emptyT += dt; else this.emptyT = 0;
    if (this.emptyT >= sw) {
      this.emptyT = sw * 0.5;
      for (const c of this.queue.slice()) if (c.need > 0 && c.flying.length === 0 && (c.state === 'wait' || c.state === 'arrive')) shop.moveOn(this, c);
    }
    // ((v4.3) a line nobody serves (the chief stepped off a counter he had opened) sends the customers who got nothing
    //  yet to a served line after switchS s — those already served wait to pay, as at the stall)
    if (!this.served && this.queue.length && shop.servedLanes(this).length) {
      this.idleT += dt;
      if (this.idleT >= sw) {
        this.idleT = 0;
        for (const c of this.queue.slice()) if (c.got === 0 && c.flying.length === 0 && (c.state === 'wait' || c.state === 'arrive')) shop.moveOn(this, c);
      }
    } else this.idleT = 0;
    for (let i = this.queue.length - 1; i >= 0; i--) if (!this.queue[i].alive) this.queue.splice(i, 1);
    for (let i = 0; i < this.queue.length; i++) this.queue[i].update(dt, i);
  }
}

/** the 자재 창구 (the old trade post merged into the shop): the merchant buys planks / ingots here — TradePost's loop and
 *  numbers (trade.buyInterval, register.clerkTradeSlow), and its surface (gs.trade) */
class MatCounter {
  constructor(shop) {
    const gs = this.gs = shop.gs;
    this.shop = shop; this.id = 'mat';
    this.cfg = shop.cfg.mat || {};          // (world.js market.mat: the 자재 점원's looks)
    this.open = false;
    this.goods = GOODS;
    this.shelf = new Pad(gs, shop.x, shop.y, 'input', 1.6, { icon: 'item_plank', iconSize: 40 });
    this.maxPerType = shopShelfMax(1);
    // ((v4.3) the planks / ingots tower at the west end of the row stops at 20 layers (the trade post's grew to 40))
    //  ((review SHOP-2) the rack holds the top stage's count of each kind: maxPerType (per kind) says how full it may get)
    this.stock = new ItemStack(gs, { scale: 0.95, cols: [[-20, -4], [20, 6]], typeCols: { item_plank: 0, item_ingot: 1 }, max: shopShelfMax(SHOP_STAGE_MAX) * GOODS.length, bake: 'eager', drawMax: 20 });
    this.merchant = new Character(gs, 'villager_c', shop.x, shop.y, { dir: 1 });
    this.merchant.noXray = true;
    this.buyT = 0; this.happyT = 0; this.waitT = 0; this.waitIcon = null;
    this.flying = {};
    this.front = [-60, 30];
    this.register = null;
    this.sink = {
      id: 'trade_shelf', isWarehouse: false, enabled: true, x: this.shelf.x + 30, y: this.shelf.y + 22,
      accepts: (ty) => GOODS.indexOf(ty) >= 0,
      room: (ty) => (this.enabled ? Math.max(0, this.maxPerType - this.stock.countWithIncoming(ty)) : 0),
      prio: (ty) => (shelfEmpty(gs, this, ty) ? PRIO.SHELF_EMPTY : this.stock.countWithIncoming(ty) < this.maxPerType * (BALANCE.warehouse.restockBelow || 0.25) ? PRIO.SHELF_LOW : PRIO.SHELF),
      feed: (ch) => this.feedFrom(ch),
    };
    if (gs.logistics) gs.logistics.add(this.sink);
  }
  get x() { return this.shop.x; }
  get y() { return this.shop.y; }
  /** open at stage 2 and up (the old trade post opened with the forest too) */
  get enabled() { return this.shop.enabled && this.open; }
  /** the shop's till: the merchant pays into it (one till for the whole shop) */
  get cash() { return this.shop.cash; }
  get img() { return this.shop.img; }
  setEnabled() { this.shop.refreshVisible(); }
  setOpen(v) {
    this.open = v;
    this.sink.enabled = this.enabled;
    const on = this.enabled;
    this.shelf.setVisible(on); this.stock.setVisible(on);
    this.merchant.sprite.setVisible(on); this.merchant.shadow.setVisible(on);
    if (this.register) this.register.setEnabled(on);
    if (this.waitIcon && !on) this.waitIcon.setVisible(false);
  }
  /** the stage moved the counter: its rack, the merchant's spot */
  placeAt(shelf, merchant, faceTo) {
    this.shelf.x = shelf.x; this.shelf.y = shelf.y;
    this.shelf.img.setPosition(shelf.x, shelf.y);
    if (this.shelf.icon) this.shelf.icon.setPosition(shelf.x, shelf.y);
    // (porters unload at the rack's west-front: the rack stands at the WEST end of the row, the counter east of it)
    this.sink.x = shelf.x - 36; this.sink.y = shelf.y + 10;
    const m = this.merchant;
    m.x = merchant.x; m.y = merchant.y; m.vx = m.vy = 0;
    this.faceAt = faceTo;
    m.faceTo(faceTo.x, faceTo.y);
    m.sync(0);
  }
  revealObjects() { return [this.shelf.img, this.merchant.sprite].concat(this.register ? this.register.revealObjects() : []); }
  payTarget() { return this.merchant; }
  get waitingPay() { return this.enabled && this.stock.count > this.kept() && !(this.register && this.register.staffed); }
  kept() { return TradePost.prototype.kept.call(this); }
  feedFrom(ch) { return TradePost.prototype.feedFrom.call(this, ch); }
  buyable(keep) { return TradePost.prototype.buyable.call(this, keep); }
  townLook(dt) { return TradePost.prototype.townLook.call(this, dt); }
  swapMerchant(look) {
    TradePost.prototype.swapMerchant.call(this, look);
    if (this.faceAt) this.merchant.faceTo(this.faceAt.x, this.faceAt.y);
  }

  update(dt) {
    const gs = this.gs, m = this.merchant;
    this.stock.layout(this.shelf.x, this.shelf.y + 6, Math.max(this.shelf.y, this.shop.y + 2), 0, dt);
    if (!this.enabled) return;
    this.townLook(dt);
    this.buyT -= dt;
    const staffed = this.register.staffed;
    const selling = this.stock.count > this.kept();
    if (selling && !staffed) this.waitT += dt; else this.waitT = 0;
    const showWait = selling && !staffed;
    if (showWait && !this.waitIcon) {
      this.waitIcon = Assets.image(gs, m.x, m.y + m.headTop - 30, Assets.pick('ui_icon_coin', 'ui_icon_check')).setDepth(DEPTH.BUBBLE);
      this.waitIcon.setScale(40 / Math.max(1, this.waitIcon.frame.realWidth));
      this.waitIcon.__bs = this.waitIcon.scaleX;
    }
    if (this.waitIcon) {
      this.waitIcon.setVisible(showWait);
      if (showWait) { this.waitIcon.x = m.x; this.waitIcon.setScale(this.waitIcon.__bs * (1 + Math.max(0, Math.sin(gs.time.now / 140)) * 0.15)); this.waitIcon.y = m.y + m.headTop - 30 + Math.sin(gs.time.now / 300) * 3; }
    }
    const keep = gs.v42 && gs.v42.frules ? Math.max(0, Math.floor(Number(BALANCE.v42.trade && BALANCE.v42.trade.displayKeep) || 0)) : 0;
    const buyable = keep > 0 ? this.buyable(keep) : null;
    if (this.buyT <= 0 && this.stock.count > 0 && staffed && (!keep || buyable.length)) {
      this.buyT = this.register.clerk ? BALANCE.trade.buyInterval * BALANCE.register.clerkTradeSlow : BALANCE.trade.buyInterval;
      const it = keep ? this.stock.pop(buyable) : this.stock.pop();
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
      this.bought = (this.bought || 0) + 1;
    }
    if (this.happyT > 0) { this.happyT -= dt; if (this.happyT <= 0) { if (this.faceAt) m.faceTo(this.faceAt.x, this.faceAt.y); m.play('idle'); } }
    m.sync(dt);
  }
}

export class StageMarket {
  constructor(gs, cfg) {
    this.gs = gs; this.cfg = cfg;
    this.id = 'market';
    this.goods = FOODS;
    this.enabled = true;
    this.stage = 1;
    this.base = { x: cfg.x, y: cfg.y };            // the stage-1 stall's anchor (world.js market): stage offsets start here
    this.x = cfg.x; this.y = cfg.y;
    const spr = this.sprite = cfg.spriteOld && !Assets.has(cfg.sprite) ? cfg.spriteOld : cfg.sprite;
    this.img = Assets.image(gs, this.x, this.y, spr).setDepth(this.y);
    if (gs.lazyImage) gs.lazyImage(this.img, spr);
    gs.addOccluder(this.img);
    this.occ = gs.occluders ? gs.occluders[gs.occluders.length - 1] : null;
    // the front layer (the counters) above the clerks: drawn by the shop for all its counters
    const fk = Assets.def(spr).overlay;
    this.front = fk && Assets.m.sprites[fk] ? Assets.image(gs, this.x, this.y, fk).setDepth(this.y + 1) : null;
    if (this.front && gs.lazyImage) gs.lazyImage(this.front, fk);
    if (this.front && Assets.def(spr).stage) this.linkFade(this.front);
    // stage 1: the stall's round collider (as 4.2.0.2); stages 2+: a wall along the counter row
    const fp = Assets.def(spr).footprint || [195, 97];
    const co = cfg.collider || [0, 0, 0.44];
    this.obstacle = gs.collision.add(this.x + co[0], this.y + co[1], fp[0] * co[2], this.id);
    this.walls = [];
    this.shelf = new Pad(gs, this.x + cfg.shelf[0], this.y + cfg.shelf[1], 'input', 1.6, { icon: FOODS[0], iconSize: 40 });
    this.maxPerType = shopShelfMax(1);
    const tc = {};
    FOODS.forEach((g, i) => { tc[g] = i; });
    this.stock = new ItemStack(gs, {
      scale: 0.95, cols: cfg.stockCols || [[-28, -2], [0, 10], [28, -2]], typeCols: tc, max: shopShelfMax(SHOP_STAGE_MAX) * FOODS.length, bake: 'eager',
      drawMax: Math.max(0, Math.floor(cfg.stockDrawMax) || 0), drawMaxBy: cfg.stockDrawMaxBy || null,
    });
    this.cash = new CashPad(gs, this.x + cfg.cash[0], this.y + cfg.cash[1]);
    this.leaving = [];
    this.spawnT = 1.0;
    this.lastKeys = [];
    this.lanes = { food: new Lane(this, 'food'), fish: new Lane(this, 'fish'), breadmeat: new Lane(this, 'breadmeat') };
    this.mat = new MatCounter(this);
    // the seats' registers (A: the first clerk, M: the 자재 점원, B: the stage-3 빵·고기 clerk), all built on the stall's art
    const clerkOf = { A: cfg.clerk, M: (cfg.mat && cfg.mat.clerk) || ['npc_clerk_b', 'npc_merchant'], B: cfg.clerk3 || cfg.clerk };
    this.seats = {};
    for (const k of ['A', 'M', 'B']) {
      const rc = Object.assign({}, cfg, { noOverlay: true, clerk: clerkOf[k] });
      this.seats[k] = new Register(gs, k === 'M' ? this.mat : this.lanes.food, rc, spr);
    }
    this.register = this.seats.A;                    // (the first clerk's register: gs.market.register as before)
    this.register.overlay = this.front;              // (4.2.0.2 code reads the stall's front layer there)
    this.mat.register = this.seats.M;
    this.sign = null; this.plates = [];
    this.sink = {
      id: this.id + '_shelf', isWarehouse: false, enabled: true, x: this.shelf.x + 30, y: this.shelf.y + 22,
      accepts: (ty) => FOODS.indexOf(ty) >= 0,
      room: (ty) => (this.enabled ? Math.max(0, this.maxPerType - this.stock.countWithIncoming(ty)) : 0),
      prio: (ty) => (shelfEmpty(gs, this, ty) ? PRIO.SHELF_EMPTY : this.stock.countWithIncoming(ty) < this.maxPerType * (BALANCE.warehouse.restockBelow || 0.25) ? PRIO.SHELF_LOW : PRIO.SHELF),
      feed: (ch) => this.feedFrom(ch),
    };
    if (gs.logistics) gs.logistics.add(this.sink);
    this.setStage(1, true);
  }

  // ---------------------------------------------------------------- stages
  /** the art of stage `st` (its back sprite key), falling back to an earlier stage when the art is missing */
  artOf(st) { if (st <= 1) return this.cfg.spriteOld && !Assets.has(this.cfg.sprite) && !Assets.pending(this.cfg.sprite) ? this.cfg.spriteOld : this.cfg.sprite; const S = this.cfg.stages && this.cfg.stages[st]; return (S && S.sprite) || this.cfg.sprite; }
  /** the open lanes, west -> east (food lanes only) */
  openLanes() { const o = []; for (const id of SHOP_COUNTERS[this.stage]) if (id !== 'mat') o.push(this.lanes[id]); return o; }
  /** lanes that take customers now: open, served (but `not`) */
  servedLanes(not) { return this.openLanes().filter((l) => l !== not && l.served); }
  /** every customer standing in a food line (the stall's one line before; read-only) */
  get queue() { const o = []; for (const l of this.openLanes()) for (const c of l.queue) o.push(c); for (const id in this.lanes) if (!this.lanes[id].open) for (const c of this.lanes[id].queue) o.push(c); return o; }
  get maxQueue() { return Math.max(1, Math.floor(this.cfg.maxQueue || BALANCE.customers.maxQueue) || 6); }
  /** the lane of seat A now (the stall's line; the fish line at stage 3) */
  get primary() { return this.stage >= 3 ? this.lanes.fish : this.lanes.food; }
  /** a seller's register by the step's seller id ('market' = seat A, 'trade' = the 자재 창구, 'breadmeat' = seat B) */
  registerOf(seller) { return seller === 'trade' || seller === 'mat' ? this.seats.M : seller === 'breadmeat' ? this.seats.B : this.seats.A; }

  /**
   * go to stage `st`: the art, the counters (their pads, clerks' posts, lines), the racks, the till, the walls. instant =
   * a reload (no effects). Everything already on the racks / in the till stays; customers walk to their new places
   * (a stage-3 split sends each to the lane of what it wants).
   */
  setStage(st, instant) {
    const gs = this.gs;
    st = Math.max(1, Math.min(SHOP_STAGE_MAX, Math.floor(st) || 1));
    const was = this.stage;
    this.stage = st;
    const S = st > 1 ? (this.cfg.stages && this.cfg.stages[st]) || null : null;
    const at = S && S.at ? S.at : [0, 0];
    this.x = this.base.x + at[0]; this.y = this.base.y + at[1];
    // the art (stages 2-3 load after the first minutes: an invisible stand-in until the page arrives)
    const art = this.artOf(st);
    this.sprite = art;
    const D = Assets.def(art);
    // ((review SHOP-1) an earlier stage's page still on its way must not dress this stage's pictures when it arrives (a
    //  reload runs stage 2 then 3: the stage-2 page came first and the shop kept the stage-2 art)
    if (gs.lazyImgs) for (let i = gs.lazyImgs.length - 1; i >= 0; i--) { const q = gs.lazyImgs[i]; if (q.img === this.img || (this.front && q.img === this.front)) gs.lazyImgs.splice(i, 1); }
    Assets.apply(this.img, art);
    this.img.setPosition(this.x, this.y).setDepth(this.y);
    if (gs.lazyImage && Assets.pending(art)) gs.lazyImage(this.img, art);
    this.refreshOcc();
    if (this.front) {
      const fk = D.overlay;
      if (fk && Assets.m.sprites[fk]) { Assets.apply(this.front, fk); if (gs.lazyImage && Assets.pending(fk)) gs.lazyImage(this.front, fk); }
      this.front.setPosition(this.x, this.y).setDepth(this.y + 1);
    }
    // collision: the round stall, or a wall along the row
    this.obstacle.active = st === 1 && this.enabled;
    for (const w of this.walls) w.active = false;
    if (S && S.wall && !this.wallsOf) this.wallsOf = {};
    if (S && S.wall) {
      if (!this.wallsOf[st]) { const [a, b] = S.wall; this.wallsOf[st] = gs.collision.addSeg(this.base.x + a[0], this.base.y + a[1], this.base.x + b[0], this.base.y + b[1], S.wallR || 46, this.id); }
      this.wallsOf[st].active = this.enabled;
      this.walls = [this.wallsOf[st]];
    } else this.walls = [];
    // the racks, the till
    const P = (o, d) => (o ? { x: this.base.x + o[0], y: this.base.y + o[1] } : d);
    const fShelf = P(S && S.shelf, { x: this.base.x + this.cfg.shelf[0], y: this.base.y + this.cfg.shelf[1] });
    this.shelf.x = fShelf.x; this.shelf.y = fShelf.y; this.shelf.img.setPosition(fShelf.x, fShelf.y);
    if (this.shelf.icon) this.shelf.icon.setPosition(fShelf.x, fShelf.y);
    this.sink.x = fShelf.x + 30; this.sink.y = fShelf.y + 22;
    const cp = P(S && S.cash, { x: this.base.x + this.cfg.cash[0], y: this.base.y + this.cfg.cash[1] });
    this.cash.moveTo(cp.x, cp.y);
    this.maxPerType = shopShelfMax(st);
    this.mat.maxPerType = this.maxPerType;
    // the counters: open the stage's, place each seat at its counter (the art's staff / customer points, west -> east)
    const ids = SHOP_COUNTERS[st];
    const staffPts = Array.isArray(D.staffPoints) ? D.staffPoints : [];
    const custPts = Array.isArray(D.customerPoints) ? D.customerPoints : [];
    const used = {};
    ids.forEach((id, k) => {
      const seat = this.seats[SEAT_OF[id]];
      used[SEAT_OF[id]] = true;
      const staff = st === 1 ? null : staffPts[k] || [LM(-ids.length + 1 + 2 * k + 0.18, 0.46)[0], LM(-ids.length + 1 + 2 * k + 0.18, 0.46)[1]];
      const cust = st === 1 ? this.cfg.queueStart : custPts[k] || [staff[0] - 128, staff[1] + 22];
      const regOff = st === 1 ? this.cfg.register : (S.registers && S.registers[id]) || null;
      const regXY = regOff ? { x: this.base.x + regOff[0], y: this.base.y + regOff[1] } : { x: this.x + (staff ? staff[0] - 77 : 0), y: this.y + (staff ? staff[1] + 39 : 0) };
      const stf = st === 1 ? { x: seat.staff0 ? seat.staff0.x : seat.staff.x, y: seat.staff0 ? seat.staff0.y : seat.staff.y } : { x: this.x + staff[0], y: this.y + staff[1] };
      if (st === 1 && !seat.staff0) seat.staff0 = { x: seat.staff.x, y: seat.staff.y };
      seat.place(regXY.x, regXY.y, st === 1 ? seat.staff0 : stf, art, this.y, instant || was === st);
      if (id === 'mat') {
        const ms = S && S.matShelf ? P(S.matShelf) : { x: this.x - 200, y: this.y };
        this.mat.placeAt(ms, { x: this.x + cust[0], y: this.y + cust[1] }, { x: stf.x, y: stf.y - 10 });
      } else {
        const L = this.lanes[id];
        seat.seller = L;
        L.register = seat;
        L.cfg = {
          queueStart: cust,
          queueStep: this.cfg.queueStep || YO(-0.9),
          // ((review PT-3) at stage 3 the east-most line turns east after 4: its 5th-7th places stood on the 옷·신발 공방)
          queueTurn: Math.min(st === 3 && k === ids.length - 1 ? 4 : 1e9, Math.max(2, Math.floor(Number(M43().lineShow) || this.cfg.queueTurn || 6))),
          // the east-most line bends east (as the stall's did), the others bend west: never into the next line
          queueStep2: st === 1 ? (this.cfg.queueStep2 || XO(0.9)) : (k === ids.length - 1 ? XO(0.9) : XO(-0.9)),
          faceTo: st === 1 ? (this.cfg.faceTo || [40, -20]) : [(staff[0] + 11), (staff[1] - 14)],
        };
      }
    });
    // lanes: open this stage's, close the others (their customers go to the lane of what they want)
    const moved = [];
    for (const id in this.lanes) {
      const L = this.lanes[id], on = ids.indexOf(id) >= 0;
      if (L.open && !on) for (const c of L.queue) moved.push(c);
      if (!on) L.queue.length = 0;
      L.open = on;
    }
    this.mat.setOpen(ids.indexOf('mat') >= 0);
    for (const k in this.seats) if (!used[k]) this.seats[k].setEnabled(false); else this.seats[k].setEnabled(this.enabled);
    for (const c of moved) {
      // ((review SHOP-3) to a served counter: one nobody serves would keep them waiting with what they got)
      const ty = this.servedType(c.want.type);
      if (ty !== c.want.type && c.need > 0 && c.setWant) c.setWant(ty);
      const L = this.laneFor(ty) || this.primary;
      L.queue.push(c);
      c.market = L; c.path = []; c.arrived = false; if (c.state === 'wait') c.state = 'arrive';
    }
    // the old trade post's merchant sled stays on the plaza as decor (assets/market market_sled, world.js stages[st].sled)
    this.placeSled(S);
    // stages 2-3: a coloured rug under each line, from its counter out, with the kind's picture by the counter: the line
    //  reads as that counter's even where it stands in front of the next counter on screen (the iso view shifts it left)
    this.placeRugs(st);
    // signs: the stage's name on its board, the counters' name plates
    this.placeSigns();
    if (gs.roads && was !== st) gs.roads.invalidate();
    if (gs.v42 && gs.v42.registerStocks && was !== st) gs.v42.registerStocks();
    // padSpots (residents keep off the pads)
    if (gs.padSpots) for (const p of [this.shelf, this.mat.shelf, this.cash.pad].concat(ids.map((id) => this.seats[SEAT_OF[id]]))) gs.padSpots.push({ x: p.x, y: p.y, r: 70 });
    this.refreshVisible();
    if (!instant && was !== st) this.celebrateStage(st);
  }

  /** ((v4.3) the lines' rugs and floor pictures (stages 2-3) */
  placeRugs(st) {
    const gs = this.gs;
    if (!this.rugG) { this.rugG = gs.add.graphics().setDepth(DEPTH.GROUND_DECAL + 2); this.rugIcons = []; }
    const g = this.rugG;
    g.clear();
    let n = 0;
    if (st >= 2) {
      const COL = { mat: 0x8ea2b6, food: 0xe7a55e, fish: 0x6aa6dc, breadmeat: 0xe7a55e };
      const ICON = { mat: 'item_plank', food: 'item_fish_cooked', fish: 'item_fish_cooked', breadmeat: 'item_bread' };
      for (const id of SHOP_COUNTERS[st]) {
        const c = id === 'mat' ? this.mat.merchant : null;
        const L = id === 'mat' ? null : this.lanes[id];
        const p0 = c ? { x: c.x, y: c.y } : L.slotPos(0);
        const len = id === 'mat' ? 1.6 : 3.4;
        const a = YO(1.2), b = YO(-len), w = XO(0.52);
        const pts = [
          { x: p0.x + a[0] - w[0], y: p0.y + a[1] - w[1] }, { x: p0.x + a[0] + w[0], y: p0.y + a[1] + w[1] },
          { x: p0.x + b[0] + w[0], y: p0.y + b[1] + w[1] }, { x: p0.x + b[0] - w[0], y: p0.y + b[1] - w[1] },
        ];
        g.fillStyle(COL[id], 0.38); g.fillPoints(pts, true);
        g.lineStyle(3, COL[id], 0.75); g.strokePoints(pts, true);
        let ic = this.rugIcons[n];
        if (!ic) { ic = this.rugIcons[n] = Assets.image(gs, 0, 0, ICON[id]).setDepth(DEPTH.GROUND_DECAL + 3); }
        Assets.apply(ic, ICON[id]);
        const at = YO(0.62);
        const fr = ic.frame, k = 46 / Math.max(1, fr.realWidth, fr.realHeight);
        ic.setPosition(p0.x + at[0], p0.y + at[1]).setScale(k, k * 0.62).setAlpha(0.85).setOrigin(0.5, 0.5);
        n++;
      }
    }
    for (let i = 0; i < this.rugIcons.length; i++) this.rugIcons[i].setVisible(i < n && this.enabled);
    g.setVisible(this.enabled);
  }

  /** ((v4.3) the old trade post's merchant sled without its canopy (assets/market market_sled), parked where the trade post
   *  stood (decor with a round collider per stage) */
  placeSled(S) {
    const gs = this.gs, c = S && S.sled;
    if (this.sledObs) for (const k in this.sledObs) this.sledObs[k].active = false;
    const key0 = (c && c.sprite) || 'market_sled';
    if (!c || !c.at || !Assets.m.sprites[key0]) { if (this.sled) this.sled.setVisible(false); return; }
    const x = this.base.x + c.at[0], y = this.base.y + c.at[1], k = Number(c.scale) || 1;
    if (!this.sled) {
      this.sled = Assets.image(gs, x, y, key0).setScale(k);
      if (gs.lazyImage) gs.lazyImage(this.sled, key0);
      gs.addOccluder(this.sled);
      this.sledOcc = gs.occluders ? gs.occluders[gs.occluders.length - 1] : null;
    } else if (this.sledKey !== key0) {
      // ((review CD-2) the stage's own page carries the sled (stage 3: market_sled_s3): the stage-2 page is not needed there)
      if (gs.lazyImgs) for (let i = gs.lazyImgs.length - 1; i >= 0; i--) if (gs.lazyImgs[i].img === this.sled) gs.lazyImgs.splice(i, 1);
      Assets.apply(this.sled, key0);
      if (gs.lazyImage && Assets.pending(key0)) gs.lazyImage(this.sled, key0);
    }
    this.sledKey = key0;
    this.sled.setPosition(x, y).setScale(k).setDepth(y);
    if (this.sledOcc) { const w = this.sled.displayWidth; this.sledOcc.x = x + (0.5 - this.sled.originX) * w; this.sledOcc.y = y; this.sledOcc.hw = w * 0.5; this.sledOcc.top = this.sled.displayHeight * this.sled.originY * 0.95; }
    this.sledObs = this.sledObs || {};
    const key = this.stage;
    if (!this.sledObs[key]) { const fp = Assets.def(key0).footprint || [204, 102]; this.sledObs[key] = gs.collision.add(x, y, fp[0] * 0.42 * k, 'sled'); }
    // ((review CD-4) the office on the hut's plot (its scaffold or the office) reaches the sled's spot: the sled is put
    //  away until 4.3 B parks it by the 자재 창구)
    const on = this.enabled && !this.sledAway();
    this.sledObs[key].active = on;
    this.sled.setVisible(on);
  }
  /** (review CD-4) the office plot is no longer the hut (the office's scaffold is up, or it stands) */
  sledAway() { const so = this.gs.sites && this.gs.sites.v42_office; return !!(so && so.replace && !so.keepsOld); }

  /** the stage changed in play: a puff of snow over the row, a sound, a banner (Progression sends the banner text) */
  celebrateStage(st) {
    const gs = this.gs;
    gs.effects.sheet('fx_poof', this.x, this.y - 40, { size: 420 });
    if (gs.effects.shake) gs.effects.shake(160, 0.004);
    Audio.play('sfx_build', { volume: 0.7 });
    // the row pops up from its anchor; the board and the plates (drawn from their corner) fade in after it
    for (const o of [this.img, this.front]) {
      if (!o) continue;
      const sx = o.scaleX, sy = o.scaleY;
      o.setScale(sx * 0.2, sy * 0.2);
      gs.tweens.add({ targets: o, scaleX: sx, scaleY: sy, duration: 460, ease: 'Back.easeOut' });
    }
    const late = [].concat(this.sign ? [this.sign] : [], ...this.plates.filter((p) => p.on).map((p) => (p.hasIcon ? [p.img, p.icon] : [p.img])));
    for (const o of late) { o.setAlpha(0); gs.tweens.add({ targets: o, alpha: 1, duration: 360, delay: 380 }); }
  }

  /** the stage name on the board (Market.makeSign, at this stage's place) + the counters' plates (stages 2-3).
   *  The pictures are made once and reused (their x-ray links stay valid) */
  placeSigns() {
    const gs = this.gs, d = Assets.def(this.sprite), q = d && d.signQuad;
    if (Array.isArray(q) && q.length >= 4 && d.signText) {
      Market.prototype.makeSign.call(this);
      if (this.sign) {
        const w = Math.max(8, q[1][0] - q[0][0]), sh = (q[1][1] - q[0][1]) / w;
        this.sign.setPosition(this.x + q[0][0], this.y + q[0][1] - (sh < 0 ? -sh * w : 0)).setDepth(this.y + 0.2);
        if (!this.signFaded) { this.signFaded = true; this.linkFade(this.sign); }
      }
    } else if (this.sign) this.sign.setVisible(false);
    const pls = Array.isArray(d.plates) ? d.plates : [];
    this.plates = this.plates || [];
    let n = 0;
    for (const pl of pls) {
      const pq = pl.quad;
      if (!Array.isArray(pq) || pq.length < 4) continue;
      const txt = t(pl.text) || '';
      const icon = { plate_fish: 'item_fish_cooked', plate_food: 'item_fish_cooked', plate_breadmeat: 'item_bread', plate_mat: 'item_plank' }[pl.text] || null;
      const w = Math.max(8, pq[1][0] - pq[0][0]), h = Math.max(8, pq[3][1] - pq[0][1]);
      const room = icon ? Math.min(w * 0.36, h * 1.25) : 0;
      const key = 'fv_plate_' + this.stage + '_' + pl.text + '_' + txt;
      const m = signTexture(gs, key, txt, pq, d.signColor, room);
      let P = this.plates[n];
      if (!P) {
        P = this.plates[n] = { img: gs.add.image(0, 0, key).setOrigin(0, 0).setScale(1 / SIGN_S), icon: Assets.image(gs, 0, 0, icon || 'item_plank') };
        this.linkFade(P.img); this.linkFade(P.icon);
      }
      const old = P.img.texture && P.img.texture.key;
      P.img.setTexture(key);
      if (old && old !== key && /^fv_plate_/.test(old) && gs.textures.exists(old) && !this.plates.some((o) => o !== P && o.img.texture && o.img.texture.key === old)) gs.textures.remove(old);
      P.img.setPosition(this.x + pq[0][0], this.y + pq[0][1] - (m.sh < 0 ? -m.sh * m.w : 0)).setDepth(this.y + 0.2);
      P.key = pl.text; P.on = true;
      if (icon) {
        Assets.apply(P.icon, icon);
        P.icon.setPosition(this.x + pq[0][0] + room * 0.55, this.y + pq[0][1] + h * 0.5 + m.sh * room * 0.55).setDepth(this.y + 0.25);
        const fr = P.icon.frame;
        P.icon.setScale(Math.min(room * 0.9, h * 1.05) / Math.max(1, fr.realWidth, fr.realHeight));
      }
      P.hasIcon = !!icon;
      n++;
    }
    for (let i = n; i < this.plates.length; i++) this.plates[i].on = false;
  }
  /** the language changed: the board, the plates and the registers' 계산대 labels again */
  refreshSign() { this.placeSigns(); for (const k in this.seats) this.seats[k].refresh(); this.refreshVisible(); }
  /** the x-ray box of the shop's picture (Game.addOccluder's numbers) after the stage changed it */
  refreshOcc() {
    const o = this.occ, img = this.img;
    if (!o) return;
    const w = img.displayWidth, h = img.displayHeight * img.originY;
    o.x = img.x + (0.5 - img.originX) * w; o.y = img.y; o.hw = w * 0.5; o.top = h * 0.95; o.big = w > 250;
  }
  /** a picture drawn with the shop fades with its x-ray */
  linkFade(img) { Market.prototype.linkFade.call(this, img); }

  /** visibility of everything the shop draws (enabled, stage) */
  refreshVisible() {
    const v = this.enabled;
    this.img.setVisible(v);
    if (this.front) this.front.setVisible(v);
    this.shelf.setVisible(v); this.cash.setEnabled(v); this.stock.setVisible(v);
    if (this.sign) this.sign.setVisible(v);
    for (const p of this.plates) { p.img.setVisible(v && p.on); p.icon.setVisible(v && p.on && p.hasIcon); }
    if (this.sled) this.sled.setVisible(v && this.stage >= 2);
    if (this.rugG) { this.rugG.setVisible(v); for (let i = 0; i < this.rugIcons.length; i++) this.rugIcons[i].setVisible(v && this.stage >= 2 && i < SHOP_COUNTERS[this.stage].length); }
    this.sink.enabled = v;
    this.mat.setOpen(this.mat.open);
  }
  setEnabled(v) {
    this.enabled = v;
    this.obstacle.active = v && this.stage === 1;
    for (const w of this.walls) w.active = v;
    for (const k in this.seats) this.seats[k].setEnabled(v && (k === 'A' || (k === 'M' && this.stage >= 2) || (k === 'B' && this.stage >= 3)));
    this.refreshVisible();
    for (const c of this.queue) { c.sprite.setVisible(v); c.shadow.setVisible(v); if (c.bubble) c.bubble.setVisible(v); }
  }
  revealObjects() { const o = [this.img, this.shelf.img, this.cash.pad.img]; if (this.front) o.push(this.front); if (this.sled && this.sled.visible) o.push(this.sled); for (const k in this.seats) if (this.seats[k].enabled) o.push(...this.seats[k].revealObjects()); if (this.sign) o.push(this.sign); return o; }

  // ---------------------------------------------------------------- the stall's surface (gs.market)
  /** the customer the cashier of seat A serves (the stall's front customer) */
  payTarget() { return this.primary.payTarget(); }
  /** a food line's front customer has everything and waits at its register */
  get waitingPay() { return this.openLanes().some((l) => l.waitingPay); }
  /** ((v4.3) the register where customers wait to pay with no clerk (the arrow / bots go there)) */
  get waitRegister() { const l = this.payWaitLane(); return l ? l.register : null; }
  get waitPayT() { const l = this.payWaitLane() || this.primary; return l.waitPayT; }
  payWaitLane() { let best = null; for (const l of this.openLanes()) if (l.waitingPay && !l.register.clerk && (!best || l.waitPayT > best.waitPayT)) best = l; return best; }
  /** the chief stands on one of the shop's register pads */
  chiefOn() { for (const k in this.seats) if (this.seats[k].chief) return true; return false; }
  slotPos(i) { return this.primary.slotPos(i); }
  accepts(type) { return FOODS.indexOf(type) >= 0 && this.stock.countOf(type) < this.maxPerType; }
  feedFrom(ch) { return Market.prototype.feedFrom.call(this, ch); }
  customerKeys() { return Market.prototype.customerKeys.call(this); }
  entryPath(from, sp) {
    if (this.cfg.entry) return this.cfg.entry.slice(Math.max(1, from)).map((p) => ({ x: p[0] + (Math.random() - 0.5) * 40, y: p[1] + (Math.random() - 0.5) * 20 }));
    return Market.prototype.entryPath.call(this, from, sp);
  }
  exitPath(c) { return Market.prototype.exitPath.call(this, c); }
  spawnPoint() { return Market.prototype.spawnPoint.call(this); }
  availableFoods() { return Market.prototype.availableFoods.call(this); }

  /** the open lane that sells `type` (a served one first) */
  laneFor(type, servedOnly) {
    let any = null;
    for (const l of this.openLanes()) {
      if (l.types.indexOf(type) < 0) continue;
      if (l.served) return l;
      if (!any) any = l;
    }
    return servedOnly ? null : any;
  }

  /** what a new customer wants: a kind that a served lane sells (same weights as the stall); its lane */
  makeWant() {
    let foods = this.availableFoods();
    const served = this.servedLanes();
    let lanes = served.length ? served : [this.primary];
    let pick = foods.filter((ty) => lanes.some((l) => l.types.indexOf(ty) >= 0));
    if (!pick.length) { lanes = [this.primary]; pick = this.primary.types.filter((ty) => foods.indexOf(ty) >= 0); }
    if (!pick.length) pick = [this.primary.types[0]];
    foods = pick;
    let type = foods[Math.floor(Math.random() * foods.length)];
    if (foods.length > 1 && Math.random() < 0.25) type = foods[foods.length - 1];
    const b = BALANCE.customers;
    const zones = this.gs.progress.zonesOpen();
    const lo = Math.max(1, Math.floor(b.wantMin) || 1);
    const maxW = Math.max(lo, Math.min(b.wantMaxLate, b.wantMax + Math.floor(zones / 2)) || lo);
    const count = lo + Math.floor(Math.random() * (maxW - lo + 1));
    let lane = lanes.find((l) => l.types.indexOf(type) >= 0) || this.primary;
    // ((v4.3) the counter of that kind has nothing on the rack but another served one has: the new customer goes there
    //  and wants what it sells (the stall's front customer took another food the same way) — an empty counter never
    //  fills the plaza's line places while the next one has goods)
    if (!lane.hasStock()) {
      const alt = lanes.filter((l) => l !== lane && l.hasStock());
      if (alt.length) {
        lane = alt[Math.floor(Math.random() * alt.length)];
        const have = lane.types.filter((ty) => this.stock.countOf(ty) > 0 && foods.indexOf(ty) >= 0);
        const pickFrom = have.length ? have : lane.types.filter((ty) => this.stock.countOf(ty) > 0);
        if (pickFrom.length) type = pickFrom[Math.floor(Math.random() * pickFrom.length)];
      }
    }
    return { type, count, lane };
  }

  spawnCustomer(atSlot) {
    const gs = this.gs;
    const all = this.customerKeys();
    const recent = this.lastKeys;
    let pool = all.filter((k) => recent.indexOf(k) < 0);
    if (!pool.length) pool = all.filter((k) => k !== recent[recent.length - 1]);
    if (!pool.length) pool = all;
    let key = pool[Math.floor(Math.random() * pool.length)];
    recent.push(key);
    while (recent.length > Math.min(4, Math.max(1, all.length - 2))) recent.shift();
    const look = gs.v4 && gs.v4.pickLook ? gs.v4.pickLook(this) : null;
    if (look) key = look.key;
    // (the spawn point before the want, as the stall drew them: the same random numbers give the same customers)
    let x, y, next = 1, visible = false, w;
    if (atSlot !== undefined) { w = this.makeWant(); const s = w.lane.slotPos(atSlot); x = s.x; y = s.y; }
    else { const sp = this.spawnPoint(); x = sp.x + (Math.random() - 0.5) * 30; y = sp.y; next = sp.next; visible = sp.visible; w = this.makeWant(); }
    const lane = w.lane;
    const c = new Customer(gs, lane, key, x, y, { type: w.type, count: w.count }, next, atSlot === undefined ? { x, y } : null, look ? { person: look.person } : null);
    if (look) { c.citizen = look.citizen || null; if (gs.v4.noteVisit) gs.v4.noteVisit(look.citizen); }
    lane.queue.push(c);
    if (atSlot !== undefined) { c.state = 'wait'; c.path.length = 0; c.arrived = true; c.faceTo(lane.x + lane.cfg.faceTo[0], lane.y + lane.cfg.faceTo[1]); c.showBubble(); }
    else if (visible) c.fadeIn();
    return c;
  }
  restoreQueue(n) { for (let i = 0; i < n; i++) this.spawnCustomer(i); }

  /** ((review SHOP-3) what someone who wants `type` buys here: `type` when a served lane sells it, else what a served lane
   *  has on its rack (as moveOn does) — a counter nobody serves takes no new customers. Nobody serving at all: `type` */
  servedType(type) {
    if (this.laneFor(type, true)) return type;
    const sv = this.servedLanes();
    for (const l of sv) { const ty = l.types.find((q) => this.stock.countOf(q) > 0); if (ty) return ty; }
    return sv.length && sv[0].types.length ? sv[0].types[0] : type;
  }

  /** (v4-A) a train visitor joins: the lane of what it wants (Visitor.tryJoin asks servedType first) */
  join(c, type) {
    const L = this.laneFor(type) || this.primary;
    L.queue.push(c);
    return L;
  }

  /** one item of what the front customer `c` of lane `L` wants flies from the rack */
  handOver(c, L) {
    const gs = this.gs;
    const type = c.want.type;
    const it = this.stock.pop(type);
    c.need--;
    c.flying.push(type);
    gs.effects.fly(it.spr, it.spr.x, it.spr.y, () => c.bubblePos(), {
      dur: 280, height: 60, scaleTo: 0.5,
      onDone: (s) => {
        gs.effects.releaseItem(s);
        const fi = c.flying.indexOf(type);
        if (fi >= 0) c.flying.splice(fi, 1);
        c.got++;
        c.value += priceOf(type);
        c.bought.push(type);
        c.popBubble();
        if (gs.isNear(c.x, c.y, 600)) Audio.play('sfx_pickup', { volume: 0.4, rate: 1 + c.got * 0.08, throttle: 40 });
      },
    });
  }

  /** ((v4.3) customer `c` of lane `from` goes on to a served lane that has stock of its kinds (and wants what is there);
   *  with none, it stays where it is */
  moveOn(from, c) {
    const cand = this.servedLanes(from).filter((l) => l.hasStock() && l.queue.length < this.maxQueue);
    cand.sort((a, b) => a.queue.length - b.queue.length);
    const to = cand[0];
    if (!to) return false;
    const i = from.queue.indexOf(c);
    if (i >= 0) from.queue.splice(i, 1);
    to.queue.push(c);
    c.market = to;
    c.path = []; c.arrived = false; c.state = 'arrive'; c.payWait = false;
    const ty = to.types.find((q) => this.stock.countOf(q) > 0) || to.types[0];
    if (c.need > 0) c.setWant(ty);
    c.updateBubble();
    return true;
  }

  update(dt) {
    const gs = this.gs;
    this.stock.layout(this.shelf.x, this.shelf.y + 6, this.shelf.y, 0, dt);
    // (the stage's page arrived after the stage was set: the x-ray box takes the real picture's size)
    if (this.img.frame !== this._occFrame) { this._occFrame = this.img.frame; this.refreshOcc(); }
    if (!this.enabled) { this.mat.update(dt); return; }
    // ((review CD-4) the office went up on the hut's plot meanwhile: the sled goes)
    if (this.sled && this.sled.visible && this.sledAway()) this.placeSled(this.stage > 1 ? this.cfg.stages && this.cfg.stages[this.stage] : null);
    this.cash.update(dt);
    for (const k in this.seats) this.seats[k].update(dt);
    // (the 자재 창구 after the registers, as the trade post did: who stands at its register counts this frame)
    this.mat.update(dt);
    // spawn: same points and intervals as the stall, ÷ market43.spawnMul of the stage (3단: a few more customers)
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      const late = !this.cfg.spawnEvery && gs.progress && gs.progress.complete && Number(BALANCE.customers.spawnEveryLate);
      const mul = m43List('spawnMul', this.stage - 1, 1);
      this.spawnT = Math.max(0.3, Number(this.cfg.spawnEvery || late || BALANCE.customers.spawnEvery) || 2.6) * (0.8 + Math.random() * 0.4) / mul;
      const vw = gs.v4 && gs.v4.visitorsWaiting ? gs.v4.visitorsWaiting(this) : 0;
      if (this.queue.length < this.maxQueue && vw < 2) this.spawnCustomer();
    }
    for (const l of this.openLanes()) l.update(dt);
    for (let i = this.leaving.length - 1; i >= 0; i--) {
      const c = this.leaving[i];
      if (c.alive) c.update(dt, -1);
      if (!c.alive) this.leaving.splice(i, 1);
    }
  }

  complete(c, L) {
    const gs = this.gs;
    if (c.state !== 'wait' && c.state !== 'arrive') return;
    const i = L.queue.indexOf(c);
    if (i >= 0) L.queue.splice(i, 1);
    this.leaving.push(c);
    const value = c.value > 0 ? c.value : priceOf(c.want.type) * c.want.count;
    c.hideBubble();
    c.state = 'happy';
    c.happyT = 0.9;
    c.play('happy', true);
    gs.effects.burst('heart', c.x, c.y + c.headTop - 4, 3);
    Audio.play('sfx_customer_happy', { volume: 0.7 });
    gs.time.delayedCall(200, () => { this.cash.add(value, c.x, c.y - 50); if (gs.isNear(c.x, c.y, 650)) Audio.play('sfx_cash', { volume: 0.55, throttle: 250 }); });
    gs.events.emit(this.cfg.soldEvent || 'sold', value, c);
    // ((v4.3, D4) the first bread sold: the 눈꽃 시장 pad appears (Progression mkt_s3 flag)
    if (gs.progress && !gs.progress.flags.firstBreadSale && (c.bought || []).indexOf('item_bread') >= 0) gs.progress.setFlag('firstBreadSale');
  }
}
