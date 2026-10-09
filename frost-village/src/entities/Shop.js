// A shop founded around our station (v4-B, docs/v4_plan.md §8.3–8.4): a lot of the station district that goes
//   wait   — the order card is done: a staked-out plot, the founder and two builders come by the next train
//   build  — foundation -> scaffold at 50 % -> the shop (balance.js v4.founding.buildTime s; builders hammer)
//   ribbon — the shop stands with two flower stands and a ribbon pad: the chief cuts it (1 s) or it opens alone
//   open   — its shelves are a remote logistics sink (station porters, the chief at the delivery pad): every
//            restocked item pays wholesale into the station till; train visitors queue at its customer points
//            and the keeper hands over 1–3 items; the town buys one item per `inlandEvery` s; rent ticks.
// Also the carpenter's house lots (HouseLot): a plank sink, a 30 s build, a townhouse, 4 new neighbours.

import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { BALANCE } from '../data/balance.js';
import { WORLD } from '../data/world.js';
import { t } from '../data/strings.js';
import { gdist } from '../core/Iso.js';
import { DEPTH } from '../systems/DepthSort.js';
import { PRIO } from '../systems/Logistics.js';
import { priceOf } from '../data/items.js';
import { Pad } from './Pad.js';
import { ItemStack } from './ItemStack.js';
import { TownBuilding } from './TownBuilding.js';
import { panel } from '../core/Panel.js';

const SHOW_PER_TYPE = 5;        // item sprites drawn per sold item on the shelf (the count is on the label)
const HAND_OVER = 1.2;          // s per item the keeper hands over
const RIBBON_STAND = 1.0;       // s the chief stands on the ribbon pad to cut it

/** a floating label (panel + optional icon + text) above a point, like the v3 site labels */
export function floatLabel(gs, x, y, icon) {
  const lab = gs.add.container(x, y).setDepth(y + 2000);
  const bg = panel(gs, 0, 0, 'ui_panel', 120, 50).setOrigin(0.5, 0.5);
  const ic = icon ? Assets.image(gs, 0, 0, icon).setOrigin(0.5, 0.5) : null;
  if (ic) ic.setScale(34 / Math.max(ic.frame.realWidth, ic.frame.realHeight, 1));
  const tx = gs.add.text(0, 0, '', { fontFamily: gs.font, fontSize: '20px', fontStyle: '800', color: '#2b2f3a', resolution: 2 }).setOrigin(0, 0.5);
  lab.add(ic ? [bg, ic, tx] : [bg, tx]);
  const o = {
    c: lab, bg, ic, tx, baseY: y, key: null,
    set(text, iconKey) {
      if (text === this.key && (!iconKey || iconKey === this.iconKey)) return;
      this.key = text;
      if (iconKey && this.ic && iconKey !== this.iconKey) { this.iconKey = iconKey; Assets.apply(this.ic, iconKey); this.ic.setOrigin(0.5, 0.5).setScale(34 / Math.max(this.ic.frame.realWidth, this.ic.frame.realHeight, 1)); }
      tx.setText(text);
      const iw = this.ic ? 40 : 0;
      const w = Math.max(100, tx.width + iw + 34);
      bg.setSize(w, 50);
      if (this.ic) this.ic.setPosition(-w / 2 + 14 + iw / 2, 0);
      tx.setPosition(-w / 2 + 16 + iw, 0);
    },
    bob(now) { lab.y = this.baseY + Math.sin(now / 450 + x * 0.01) * 4; },
    destroy() { lab.destroy(); },
  };
  return o;
}

/** point `k` of a short line in front of a door (buildings face −j: screen (−64, +32) per cell) */
function linePoint(base, k) {
  return { x: base.x - 26 * k, y: base.y + 14 * k };
}

export class Shop {
  /** g: Growth; lotId: world.js v4.lots key; shop: founding.shops key; s: saved { st, t, stock } */
  constructor(g, lotId, shop, s) {
    this.g = g; this.gs = g.gs; this.nb = g.nb;
    this.id = lotId;
    this.shop = shop;
    this.lot = WORLD.v4.lots[lotId];
    this.x = this.lot.x; this.y = this.lot.y;
    this.size = this.lot.size === 'L' ? 'L' : this.lot.size === 'S' ? 'S' : 'M';
    this.cfg = BALANCE.v4.founding.shops[shop] || { need: {}, rent: 0, sells: [] };
    this.sells = (this.cfg.sells || []).slice();
    this.st = 'wait';
    this.t = 0;
    this.stock = {};
    for (const ty of this.sells) this.stock[ty] = 0;
    // logistics sink (remote: only the station porters and the chief)
    this.remote = true; this.isWarehouse = false; this.enabled = false;
    this.queue = [];          // visitors waiting / being served
    this.inlandT = 0;
    this.thumbT = 0;
    this.actors = [];
    this.founder = null;
    this.objs = [];
    this.makeSite();
    if (s && typeof s === 'object') this.restore(s);
  }

  get name() { return t('shop_' + this.shop); }
  get def() { return Assets.def(this.shop); }

  // ------------------------------------------------------------------ visuals
  makeSite() {
    const gs = this.gs;
    const key = 'site_plot_' + this.size;
    this.siteImg = Assets.image(gs, this.x, this.y, key).setDepth(DEPTH.GROUND_DECAL + 5);
    gs.lazyImage(this.siteImg, key);
    gs.territory.add('rail', this.siteImg);
    this.label = floatLabel(gs, this.x, this.y - 150, Assets.pick('ui_icon_hammer', 'ui_icon_lock'));
    this.label.set(t('shopFounding', { shop: this.name }));
    this.obstacle = gs.collision.add(this.x, this.y, (this.size === 'L' ? 362 : 272) * 0.34, 'site');
  }

  setStage(stage) {
    const key = 'site_' + stage + '_' + this.size;
    if (!this.siteImg) return;
    Assets.apply(this.siteImg, key);
    this.gs.lazyImage(this.siteImg, key);
    this.siteImg.setDepth(stage === 'plot' ? DEPTH.GROUND_DECAL + 5 : this.y);
  }

  /** the ring that shows the build progress */
  drawRing() {
    const gs = this.gs;
    if (!this.ring) {
      this.ringY = this.y - 230;
      this.ringBg = Assets.image(gs, this.x, this.ringY, 'ui_ring_bg').setDepth(DEPTH.LABEL - 2);
      this.ringBg.setScale(58 / Math.max(this.ringBg.frame.realWidth, 1));
      this.ring = gs.add.graphics().setDepth(DEPTH.LABEL - 1);
      this.ringIcon = Assets.image(gs, this.x, this.ringY, Assets.pick('ui_icon_hammer', 'ui_icon_lock')).setDepth(DEPTH.LABEL);
      this.ringIcon.setScale(28 / Math.max(this.ringIcon.frame.realWidth, 1));
    }
    const pct = Math.min(1, this.t / this.buildTime());
    if (this._pct !== undefined && Math.abs(pct - this._pct) < 0.004) return;
    this._pct = pct;
    const g = this.ring;
    g.clear();
    g.lineStyle(8, 0xffb648, 1);
    g.beginPath();
    g.arc(this.x, this.ringY, 21, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct, false);
    g.strokePath();
  }
  clearRing() { if (this.ring) { this.ring.destroy(); this.ringBg.destroy(); this.ringIcon.destroy(); this.ring = null; this._pct = undefined; } }

  buildTime() { return Math.max(1, Number(BALANCE.v4.founding.buildTime) || 25); }

  /** the shop building itself (+ flower stands, the ribbon, the shelf stacks) */
  makeShop(instant) {
    const gs = this.gs;
    if (this.bld) return;
    if (this.siteImg) { this.siteImg.destroy(); this.siteImg = null; }
    if (this.obstacle) { this.obstacle.active = false; this.obstacle = null; }
    this.bld = new TownBuilding(gs, { id: this.id, key: this.shop, x: this.x, y: this.y, role: 'shop' });
    gs.territory.add('rail', this.bld.img);
    this.points();
    if (!instant) {
      const o = this.bld.img, sx = o.scaleX, sy = o.scaleY;
      o.setScale(0.01);
      gs.tweens.add({ targets: o, scaleX: sx, scaleY: sy, duration: 520, ease: 'Back.easeOut' });
      gs.effects.sheet('fx_build_done', this.x, this.y, { size: 330, depth: DEPTH.FX });
      gs.time.delayedCall(250, () => gs.effects.burst('confetti', this.x, this.y - 140, 26));
      gs.sfxAt(Assets.audioDef('sfx_build_done') ? 'sfx_build_done' : 'sfx_unlock', this.x, this.y, { volume: 0.9 }, true);
    }
    // the shelf: one tower per sold item at the delivery point
    const cols = this.sells.map((_, i) => [(i - (this.sells.length - 1) / 2) * 26, (i % 2) * 8]);
    const typeCols = {};
    this.sells.forEach((ty, i) => { typeCols[ty] = i; });
    this.shelf = new ItemStack(gs, { scale: 0.62, cols: cols.length ? cols : [[0, 0]], typeCols, max: 999 });
    for (const ty of this.sells) for (let i = 0; i < Math.min(SHOW_PER_TYPE, this.stock[ty] || 0); i++) this.shelf.push(ty, null, gs.effects);
    if (this.sells.length) {
      this.inPad = new Pad(gs, this.inPt.x + 26, this.inPt.y + 38, 'input', 1.2, { icon: this.sells[0], iconSize: 36 });
      this.inPad.setVisible(this.st === 'open');
    }
  }

  points() {
    const d = this.bld ? this.bld.def : this.def;
    const P = (p, dflt) => ({ x: this.x + (p ? p[0] : dflt[0]), y: this.y + (p ? p[1] : dflt[1]) });
    this.door = P(d.doorPoint, [-44, 53]);
    this.staffPt = P(d.staffPoints && d.staffPoints[0], [-3, 66]);
    const cps = Array.isArray(d.customerPoints) && d.customerPoints.length ? d.customerPoints : [[-55, 65], [-70, 77]];
    this.customerPoints = cps.map((p) => P(p));
    this.inPt = P(d.inPoint, [95, 45]);
  }

  /** the ribbon: two flower stands by the door and a red ribbon between them, a pad in front */
  makeRibbon() {
    const gs = this.gs;
    if (this.ribbonPad) return;
    const d = this.door;
    for (const dx of [-40, 40]) {
      const fs = Assets.image(gs, d.x + dx, d.y + 30 - dx * 0.25, 'flower_stand').setDepth(d.y + 40);
      gs.lazyImage(fs, 'flower_stand');
      this.objs.push(fs);
    }
    const g = gs.add.graphics().setDepth(d.y + 41);
    this.ribbonG = g;
    this.drawRibbon(0);
    this.ribbonPad = new Pad(gs, d.x - 6, d.y + 86, 'unlock', 1.5, { tex: Assets.pick('ui_pad_hire', 'ui_pad_unlock'), radiusK: 0.85 });
    this.ribbonLabel = floatLabel(gs, d.x - 6, d.y + 30, Assets.pick('ui_icon_flower', 'ui_icon_heart_pair', 'ui_icon_lock'));
    this.ribbonLabel.set(t('ribbon'));
    this.ribbonT = 0;
  }

  drawRibbon(cut) {
    const g = this.ribbonG, d = this.door;
    if (!g) return;
    g.clear();
    const ax = d.x - 40, ay = d.y + 30 + 10 - 44, bx = d.x + 40, by = d.y + 30 - 10 - 44;
    g.lineStyle(5, 0xd8344a, 1);
    if (!cut) {
      g.beginPath(); g.moveTo(ax, ay); g.lineTo((ax + bx) / 2, (ay + by) / 2 + 6); g.lineTo(bx, by); g.strokePath();
      // the bow
      const mx = (ax + bx) / 2, my = (ay + by) / 2 + 6;
      g.fillStyle(0xe8455c, 1); g.fillTriangle(mx, my, mx - 12, my - 8, mx - 12, my + 8); g.fillTriangle(mx, my, mx + 12, my - 8, mx + 12, my + 8);
      g.fillStyle(0xb02338, 1); g.fillCircle(mx, my, 4);
    } else {
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax + 12, ay + 22); g.strokePath();
      g.beginPath(); g.moveTo(bx, by); g.lineTo(bx - 12, by + 22); g.strokePath();
    }
  }

  clearRibbon(instant) {
    const gs = this.gs;
    if (this.ribbonPad) { this.ribbonPad.img.destroy(); if (this.ribbonPad.icon) this.ribbonPad.icon.destroy(); this.ribbonPad = null; }
    if (this.ribbonLabel) { this.ribbonLabel.destroy(); this.ribbonLabel = null; }
    if (this.ribbonG) {
      if (instant) { this.ribbonG.destroy(); this.ribbonG = null; }
      else { this.drawRibbon(true); const g = this.ribbonG; this.ribbonG = null; gs.tweens.add({ targets: g, alpha: 0, delay: 1400, duration: 600, onComplete: () => g.destroy() }); }
    }
  }

  // ------------------------------------------------------------------ states
  /** the founder and the builders are here (or the fallback timer ran out): start building */
  startBuild(instant, t0) {
    const gs = this.gs;
    if (this.st !== 'wait') return;
    this.st = 'build';
    this.t = Math.max(0, Math.min(this.buildTime() - 0.5, Number(t0) || 0));
    this.setStage(this.t >= this.buildTime() / 2 ? 'scaffold' : 'foundation');
    this.label.set(t('shopFounding', { shop: this.name }));
    if (!instant) {
      gs.effects.sheet('fx_build_dust', this.x, this.y + 10, { size: 240 });
      gs.effects.sheet('fx_poof', this.x, this.y - 20, { size: 240 });
      gs.sfxAt('sfx_build', this.x, this.y, { volume: 0.8 });
    }
  }

  built(instant) {
    if (this.st !== 'build') return;
    this.st = 'ribbon';
    this.t = 0;
    this.clearRing();
    this.label.destroy(); this.label = null;
    this.makeShop(instant);
    this.makeRibbon();
    for (const a of this.actors) if (a.role === 'builder') this.g.sendHome(a);
    this.actors = this.actors.filter((a) => a.role !== 'builder');
    if (!instant) this.gs.events.emit('v4:shopBuilt', this);
  }

  /** the ribbon is cut (or the shop opens alone): shelves, rent, the household moves in */
  open(instant, auto) {
    const gs = this.gs;
    if (this.st === 'open') return;
    if (!this.bld) { this.st = 'build'; this.built(true); }
    this.st = 'open';
    this.t = 0;
    this.clearRibbon(instant || auto);
    this.enabled = true;
    if (this.inPad) this.inPad.setVisible(true);
    if (gs.logistics) gs.logistics.add(this);
    this.g.moveIn(this, instant);
    if (instant) return;
    const d = this.door;
    if (!auto) {
      Audio.play(Audio.exists('sfx_fame_up') ? 'sfx_fame_up' : 'sfx_unlock', { volume: 0.9 });
      for (let i = 0; i < 5; i++) gs.time.delayedCall(i * 160, () => { gs.effects.burst('confetti', d.x + (Math.random() - 0.5) * 220, d.y - 160 - Math.random() * 80, 20); gs.effects.burst('star', d.x, d.y - 120, 6); });
      gs.ui.banner(t('shopFounded', { shop: this.name }), t('shopFoundedSub', { rent: this.cfg.rent || 0 }));
      if (gs.life) gs.life.cheer();
    } else gs.ui.toast(t('shopOpenAuto', { shop: this.name }));
    gs.events.emit('v4:shopOpen', this);
  }

  // ------------------------------------------------------------------ logistics sink (restocking)
  shelfMax() { return Math.max(1, Math.floor(BALANCE.v4.founding.shopShelf) || 20); }
  accepts(type) { return this.st === 'open' && this.sells.indexOf(type) >= 0; }
  room(type) { return this.accepts(type) ? Math.max(0, this.shelfMax() - (this.stock[type] || 0)) : 0; }
  prio() { return PRIO.SHOP; }
  get ux() { return this.inPt ? this.inPt.x + 40 : this.x; }
  get uy() { return this.inPt ? this.inPt.y + 30 : this.y; }
  feed(ch) {
    for (let i = ch.stack.items.length - 1; i >= 0; i--) {
      const ty = ch.stack.items[i].type;
      if (this.room(ty) <= 0) continue;
      return this.take(ch, ty);
    }
    return false;
  }
  /** one item of `ty` from character ch: counted and paid now (wholesale), its sprite flies onto the shelf */
  take(ch, ty) {
    const gs = this.gs;
    this.stock[ty] = (this.stock[ty] || 0) + 1;
    this.g.payWholesale(ty, 1, this.inPt.x, this.inPt.y - 20);
    if (this.shelf.countOf(ty) + this.shelf.inTypes.filter((q) => q === ty).length < SHOW_PER_TYPE) return gs.moveItem(ch.stack, this.shelf, ty, { dur: 260, height: 70, sfx: 'drop' });
    // (the shelf shows a few of each; the rest is counted) the item flies in and is put away
    const it = ch.stack.pop(ty);
    if (!it) return false;
    gs.effects.fly(it.spr, it.spr.x, it.spr.y, { x: this.inPt.x, y: this.inPt.y - 10 }, { dur: 260, height: 70, scaleTo: 0.4, onDone: (sp) => gs.effects.releaseItem(sp) });
    return true;
  }
  /** one item leaves the shelf (a visitor, the town); returns its sprite position or null */
  takeOut(ty) {
    if ((this.stock[ty] || 0) <= 0) return null;
    this.stock[ty]--;
    const gs = this.gs;
    let at = { x: this.inPt.x, y: this.inPt.y - 20 };
    if (this.shelf.countOf(ty) > this.stock[ty]) {
      const it = this.shelf.pop(ty);
      if (it) { at = { x: it.spr.x, y: it.spr.y }; gs.effects.releaseItem(it.spr); }
    }
    return at;
  }
  stockTotal() { let n = 0; for (const k in this.stock) n += this.stock[k]; return n; }

  // ------------------------------------------------------------------ visitors (docs/v4_plan.md §7.2)
  /** a visitor joins this shop's line; cb(frac) when served (1 all, 0.6 part, 0 nothing) */
  serve(v, cb) {
    if (this.st !== 'open') { cb(0); return; }
    const fav = v.citizen && this.sells.indexOf(v.citizen.fav) >= 0 ? v.citizen.fav : null;
    const n = 1 + Math.floor(Math.random() * 3);
    this.queue.push({ v, cb, want: n, fav, given: 0, t: 0 });
  }
  lineSpot(k) {
    const cp = this.customerPoints;
    if (k < cp.length) return cp[k];
    return linePoint(cp[cp.length - 1], k - cp.length + 1);
  }

  updateQueue(dt) {
    const gs = this.gs;
    for (let i = this.queue.length - 1; i >= 0; i--) { const q = this.queue[i]; if (!q.v.alive || q.v.stage !== 'shopB') this.queue.splice(i, 1); }
    this.queue.forEach((q, k) => {
      const p = this.lineSpot(k);
      const v = q.v;
      if (gdist(v.x, v.y, p.x, p.y) > 10) { gs.moveAgent(v, p.x, p.y, (v.speed || 100) * 0.8, dt, 8); q.walking = true; }
      else if (q.walking) { q.walking = false; v.vx = v.vy = 0; v.locomotion(false); v.faceTo(this.staffPt.x, this.staffPt.y); }
    });
    const f = this.queue[0];
    if (!f || f.walking) return;
    f.t += dt;
    if (f.t < HAND_OVER) return;
    f.t = 0;
    const types = this.sells.filter((ty) => (this.stock[ty] || 0) > 0);
    if (f.given < f.want && types.length) {
      const ty = f.fav && (this.stock[f.fav] || 0) > 0 ? f.fav : types[Math.floor(Math.random() * types.length)];
      const at = this.takeOut(ty);
      if (at) { gs.spawnItemTo(ty, at.x, at.y, f.v, false); f.given++; }
      if (f.given === 1 && this.g.bubbles() && gs.isOnScreen(f.v.x, f.v.y, 60)) this.g.bubbles().emote(f.v, 'emote_heart', 1.4);
      return;
    }
    // done: how did it go?
    this.queue.shift();
    const frac = f.given >= f.want ? 1 : f.given > 0 ? 0.6 : 0;
    try { f.cb(frac); } catch (e) { console.error(e); }
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    const gs = this.gs, p = gs.player;
    let on = false;
    if (this.label) this.label.bob(gs.time.now);
    if (this.st === 'wait') {
      this.t += dt;
      // the founder never came (the train / the townsfolk art is late): the builders start anyway
      if (this.t > (this.waitMax || 75)) this.startBuild(false);
    } else if (this.st === 'build') {
      const half = this.buildTime() / 2;
      const before = this.t;
      this.t += dt;
      if (before < half && this.t >= half) { this.setStage('scaffold'); if (gs.isOnScreen(this.x, this.y, 200)) gs.effects.sheet('fx_build_dust', this.x, this.y + 10, { size: 220 }); }
      this.drawRing();
      this.hammerT = (this.hammerT || 0) - dt;
      if (this.hammerT <= 0) {
        this.hammerT = 0.55 + Math.random() * 0.4;
        if (gs.isOnScreen(this.x, this.y, 120)) {
          gs.effects.sheet('fx_build_dust', this.x + (Math.random() - 0.5) * 160, this.y + 10 + Math.random() * 30, { size: 90, depth: this.y + 50 });
          gs.sfxAt(Assets.audioGroup('sfx_hammer') ? 'sfx_hammer' : 'sfx_chop', this.x, this.y, { volume: 0.4, throttle: 90 });
        }
      }
      if (this.t >= this.buildTime()) this.built(false);
    } else if (this.st === 'ribbon') {
      this.t += dt;
      if (this.ribbonLabel) this.ribbonLabel.bob(gs.time.now);
      const onPad = this.ribbonPad && this.ribbonPad.contains(p.x, p.y);
      if (onPad) {
        on = true;
        this.ribbonT += dt;
        if (this.ribbonT >= RIBBON_STAND) this.open(false, false);
      } else this.ribbonT = 0;
      if (this.st === 'ribbon' && this.t >= (Number(BALANCE.v4.founding.ribbonAuto) || 90)) this.open(false, true);
    } else if (this.st === 'open') {
      this.updateQueue(dt);
      // the town's own customers: one item every `inlandEvery` s while stocked
      this.inlandT += dt;
      if (this.inlandT >= (Number(BALANCE.v4.founding.inlandEvery) || 40)) {
        this.inlandT = 0;
        const types = this.sells.filter((ty) => (this.stock[ty] || 0) > 0);
        if (types.length) this.takeOut(types[Math.floor(Math.random() * types.length)]);
      }
      // the chief brings goods to the delivery pad
      if (this.inPad && this.inPad.contains(p.x, p.y)) {
        on = true;
        if (gs.padT <= 0 && p.stack.hasAny(this.sells)) {
          for (let i = p.stack.items.length - 1; i >= 0; i--) { const ty = p.stack.items[i].type; if (this.room(ty) > 0) { this.take(p, ty); gs.padT = BALANCE.player.padItemInterval; this.inPad.pulse(); break; } }
        }
      }
      // a thumbs-up from the keeper when the chief passes by
      this.thumbT -= dt;
      if (this.thumbT <= 0 && gdist(p.x, p.y, this.staffPt.x, this.staffPt.y) < 220) {
        this.thumbT = 25;
        const k = this.g.keeperBody(this);
        if (k && this.g.bubbles()) this.g.bubbles().emote(k, Assets.pick('emote_thumbs', 'emote_heart'), 1.6);
      }
    }
    if (this.shelf && this.inPt) this.shelf.layout(this.inPt.x, this.inPt.y, this.inPt.y + 2, 0, dt);
    return on;
  }

  // ------------------------------------------------------------------ save
  serialize() {
    const stock = {};
    for (const ty of this.sells) if (this.stock[ty] > 0) stock[ty] = this.stock[ty];
    return { shop: this.shop, st: this.st, t: Math.round(Math.min(600, this.t) * 10) / 10, stock };
  }

  restore(s) {
    const st = ['wait', 'build', 'ribbon', 'open'].indexOf(s.st) >= 0 ? s.st : 'wait';
    for (const ty of this.sells) this.stock[ty] = Math.max(0, Math.min(this.shelfMax(), Math.floor(Number(s.stock && s.stock[ty]) || 0)));
    if (st === 'wait') { this.t = 0; return; }
    this.startBuild(true, st === 'build' ? s.t : 0);
    if (st === 'build') return;
    this.built(true);
    if (st === 'ribbon') { this.t = Math.max(0, Math.min(600, Number(s.t) || 0)); return; }
    this.open(true);
  }

  destroy() {
    if (this.label) this.label.destroy();
    this.clearRing();
    this.clearRibbon(true);
    for (const o of this.objs) o.destroy();
    if (this.siteImg) this.siteImg.destroy();
    if (this.gs.logistics) this.gs.logistics.remove(this);
  }
}

/**
 * (v4-B, §8.6) a house lot of the carpenter: a plank site (remote sink at PRIO.SITE, the chief can bring planks
 * to its pad), then a 30 s build, a townhouse and 4 new neighbours of the station district.
 */
export class HouseLot {
  constructor(g, lotId, s) {
    this.g = g; this.gs = g.gs;
    this.id = lotId;
    this.lot = WORLD.v4.lots[lotId];
    this.x = this.lot.x; this.y = this.lot.y;
    this.st = 'site';
    this.t = 0;
    this.got = 0;
    this.look = (lotId.charCodeAt(lotId.length - 1) + lotId.length) % 4;
    this.remote = true; this.isWarehouse = false; this.enabled = true;
    this.kind = 'houseLot';
    if (s && typeof s === 'object') {
      this.st = ['site', 'build', 'done'].indexOf(s.st) >= 0 ? s.st : 'site';
      this.got = Math.max(0, Math.min(this.need(), Math.floor(Number(s.got && s.got.item_plank) || 0)));
      this.t = Math.max(0, Math.min(600, Number(s.t) || 0));
      if (Number.isFinite(s.look)) this.look = Math.max(0, Math.min(3, Math.floor(s.look)));
    }
    this.make(true);
  }

  need() { return Math.max(1, Math.floor(BALANCE.v4.houses.item_plank) || 20); }
  time() { return Math.max(1, Number(BALANCE.v4.houses.time) || 30); }
  get houseKey() { return 'townhouse_' + 'abcd'[this.look]; }

  make(instant) {
    const gs = this.gs;
    if (this.st === 'done') { this.makeHouse(instant); return; }
    const stage = this.st === 'build' ? (this.t >= this.time() / 2 ? 'scaffold' : 'foundation') : 'plot';
    const key = 'site_' + stage + '_S';
    this.img = Assets.image(gs, this.x, this.y, key).setDepth(stage === 'plot' ? DEPTH.GROUND_DECAL + 5 : this.y);
    gs.lazyImage(this.img, key);
    gs.territory.add('rail', this.img);
    this.dropX = this.x + 2; this.dropY = this.y + 64;
    this.ux = this.dropX + 30; this.uy = this.dropY + 20;
    this.obstacle = gs.collision.add(this.x, this.y, 181 * 0.34, 'site');
    if (this.st === 'site') {
      this.pad = new Pad(gs, this.dropX, this.dropY, 'input', 1.4, { icon: 'item_plank', iconSize: 40 });
      this.stack = new ItemStack(gs, { scale: 0.75, cols: [[-14, -2], [14, 6]], max: 999 });
      for (let i = 0; i < Math.min(8, this.got); i++) this.stack.push('item_plank', null, gs.effects);
      this.label = floatLabel(gs, this.x, this.y - 150, 'item_plank');
      this.refreshLabel();
      if (gs.logistics) gs.logistics.add(this);
    }
  }

  refreshLabel() { if (this.label) this.label.set(t('house_site') + ' · ' + this.got + '/' + this.need()); }

  // logistics sink
  accepts(type) { return this.st === 'site' && type === 'item_plank'; }
  room(type) { return this.accepts(type) ? Math.max(0, this.need() - this.got) : 0; }
  prio() { return PRIO.SITE; }
  feed(ch) {
    if (this.room('item_plank') <= 0 || ch.stack.countOf('item_plank') <= 0) return false;
    this.got++;
    this.g.payWholesale('item_plank', 1, this.dropX, this.dropY - 20);
    this.refreshLabel();
    const gs = this.gs;
    if (this.stack.count + this.stack.incoming < 8) return gs.moveItem(ch.stack, this.stack, 'item_plank', { dur: 240, height: 60, sfx: 'drop' });
    const it = ch.stack.pop('item_plank');
    if (it) gs.effects.fly(it.spr, it.spr.x, it.spr.y, { x: this.dropX, y: this.dropY - 6 }, { dur: 240, height: 60, scaleTo: 0.4, onDone: (sp) => gs.effects.releaseItem(sp) });
    return true;
  }

  startBuild(instant) {
    const gs = this.gs;
    this.st = 'build';
    this.t = 0;
    this.enabled = false;
    if (gs.logistics) gs.logistics.remove(this);
    if (this.pad) { this.pad.img.destroy(); if (this.pad.icon) this.pad.icon.destroy(); this.pad = null; }
    if (this.label) { this.label.destroy(); this.label = null; }
    if (this.stack) { this.stack.clear(gs.effects); }
    Assets.apply(this.img, 'site_foundation_S'); gs.lazyImage(this.img, 'site_foundation_S');
    this.img.setDepth(this.y);
    if (!instant) { gs.effects.sheet('fx_build_dust', this.x, this.y + 10, { size: 200 }); gs.sfxAt('sfx_build', this.x, this.y, { volume: 0.7 }); }
  }

  makeHouse(instant) {
    const gs = this.gs;
    if (this.house) return;
    if (this.img) { this.img.destroy(); this.img = null; }
    if (this.obstacle) { this.obstacle.active = false; this.obstacle = null; }
    this.house = new TownBuilding(gs, { id: this.id, key: this.houseKey, x: this.x, y: this.y, role: 'home' });
    gs.territory.add('rail', this.house.img);
    if (!instant) {
      const o = this.house.img, sx = o.scaleX, sy = o.scaleY;
      o.setScale(0.01);
      gs.tweens.add({ targets: o, scaleX: sx, scaleY: sy, duration: 520, ease: 'Back.easeOut' });
      gs.effects.sheet('fx_build_done', this.x, this.y, { size: 260, depth: DEPTH.FX });
      gs.sfxAt(Assets.audioDef('sfx_build_done') ? 'sfx_build_done' : 'sfx_unlock', this.x, this.y, { volume: 0.8 }, true);
    }
  }

  update(dt) {
    const gs = this.gs, p = gs.player;
    let on = false;
    if (this.st === 'site') {
      if (this.label) this.label.bob(gs.time.now);
      this.stack.layout(this.dropX, this.dropY + 6, this.dropY, 0, dt);
      if (this.pad && this.pad.contains(p.x, p.y)) {
        on = true;
        if (gs.padT <= 0 && p.stack.countOf('item_plank') > 0 && this.feed(p)) { gs.padT = BALANCE.player.padItemInterval; this.pad.pulse(); }
      }
      if (this.got >= this.need() && this.stack.incoming === 0) this.startBuild(false);
    } else if (this.st === 'build') {
      const before = this.t;
      this.t += dt;
      if (before < this.time() / 2 && this.t >= this.time() / 2 && this.img) { Assets.apply(this.img, 'site_scaffold_S'); gs.lazyImage(this.img, 'site_scaffold_S'); }
      this.hammerT = (this.hammerT || 0) - dt;
      if (this.hammerT <= 0) {
        this.hammerT = 0.7 + Math.random() * 0.5;
        if (gs.isOnScreen(this.x, this.y, 100)) { gs.effects.sheet('fx_build_dust', this.x + (Math.random() - 0.5) * 120, this.y + 14, { size: 80, depth: this.y + 40 }); gs.sfxAt(Assets.audioGroup('sfx_hammer') ? 'sfx_hammer' : 'sfx_chop', this.x, this.y, { volume: 0.35, throttle: 90 }); }
      }
      if (this.t >= this.time()) { this.st = 'done'; this.makeHouse(false); this.g.houseDone(this); }
    }
    return on;
  }

  serialize() { return { st: this.st, got: { item_plank: this.got }, t: Math.round(Math.min(600, this.t) * 10) / 10, look: this.look }; }

  destroy() {
    if (this.label) this.label.destroy();
    if (this.gs.logistics) this.gs.logistics.remove(this);
  }
}

export { priceOf };
