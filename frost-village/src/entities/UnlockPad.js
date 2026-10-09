// Unlock / hire / upgrade pads: stand on one with coins and they drain into it
// (progress ring + rising tick). When fully paid the pad completes.

import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { BALANCE } from '../data/balance.js';
import { DEPTH } from '../systems/DepthSort.js';
import { Pad } from './Pad.js';
import { t, fmt } from '../data/strings.js';
import { panel } from '../core/Panel.js';
import { ItemStack } from './ItemStack.js';
import { PRIO } from '../systems/Logistics.js';

/** a price from balance.js as a whole number >= 1 (0, negative, missing or text would make a pad that never completes) */
export function sanePrice(v) { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= 1 ? n : 1; }

export class UnlockPad {
  /**
   * opts: kind ('unlock'|'hire'|'upgrade'), cost, paid, label (string key), labelFn, icon (sprite key), onComplete(pad), sizeM
   */
  constructor(gs, id, x, y, opts) {
    this.gs = gs; this.id = id; this.x = x; this.y = y;
    this.opts = opts;
    this.kind = opts.kind || 'unlock';
    this.cost = sanePrice(opts.cost);
    this.paid = Math.max(0, Math.min(Math.floor(Number(opts.paid)) || 0, this.cost));
    this.needsLeave = false;
    this.standT = 0;
    this.acc = 0;
    this.coinT = 0;
    this.tickT = 0;
    this.done = false;
    this.maxed = false;
    this.active = true;
    const sizeM = opts.sizeM || 1.9;
    this.pad = new Pad(gs, x, y, this.kind === 'upgrade' ? 'upgrade' : this.kind === 'hire' ? 'hire' : 'unlock', sizeM, { radiusK: 0.8, tex: opts.padTex || undefined });

    // cost on the floor: coin icon + number
    this.costCoin = Assets.image(gs, x - 30, y + 2, 'ui_icon_coin').setDepth(DEPTH.PAD_TEXT);
    const cf = this.costCoin.frame;
    this.costCoin.setScale(30 / Math.max(cf.realWidth, cf.realHeight)).setOrigin(0.5, 0.5);
    this.costText = gs.add.text(x - 10, y + 2, '', { fontFamily: gs.font, fontSize: '30px', fontStyle: '900', color: '#ffffff', stroke: '#2b2f3a', strokeThickness: 6, resolution: 2 }).setOrigin(0, 0.5).setDepth(DEPTH.PAD_TEXT);
    this.maxBadge = null;

    // floating label: icon + title on a little panel
    // ((v4-B) opts.labelAt [dx, dy]: a label beside the pad where the one above would cover a neighbour pad)
    const la = Array.isArray(opts.labelAt) ? opts.labelAt : [0, -62];
    const lab = gs.add.container(x + la[0], y + la[1]).setDepth(y + 2000);
    const title = gs.add.text(0, 0, '', { fontFamily: gs.font, fontSize: '22px', fontStyle: '800', color: '#2b2f3a', resolution: 2 }).setOrigin(0, 0.5);
    const icon = Assets.image(gs, 0, 0, opts.icon || 'ui_icon_lock').setOrigin(0.5, 0.5);
    const icf = icon.frame;
    icon.setScale((opts.iconSize || 46) / Math.max(icf.realWidth, icf.realHeight));
    const bg = panel(gs, 0, 0, 'ui_panel', 100, 56).setOrigin(0.5, 0.5);
    lab.add([bg, icon, title]);
    this.label = lab; this.labelBg = bg; this.labelIcon = icon; this.labelText = title;
    this.labelBaseY = y + la[1];
    this.labelDx = la[0];

    // progress ring (drawn while paying)
    this.ringBg = Assets.image(gs, x, y - 118, 'ui_ring_bg').setDepth(DEPTH.LABEL).setVisible(false);
    const rf = this.ringBg.frame;
    this.ringBg.setScale(64 / Math.max(rf.realWidth, rf.realHeight));
    this.ring = gs.add.graphics().setDepth(DEPTH.LABEL + 1).setVisible(false);
    // (v3) pads that also need an item (a tool for a second worker / the fishing boat): it has to be
    // brought to the pad — by a porter or the chief. The label shows it: [axe] 0/1
    this.items = opts.items || null;
    this.got = {};
    if (this.items) {
      for (const k in this.items) this.got[k] = Math.max(0, Math.min(this.items[k], Math.floor(Number(opts.got && opts.got[k])) || 0));
      this.itemStack = new ItemStack(gs, { scale: 0.75, max: 20 });
      this.itemIcons = [];
      for (const k in this.items) {
        const ic = Assets.image(gs, 0, 0, k).setOrigin(0.5, 0.6);
        ic.setScale(40 / Math.max(ic.frame.realWidth, ic.frame.realHeight, 1));
        const tx = gs.add.text(0, 0, '', { fontFamily: gs.font, fontSize: '21px', fontStyle: '900', color: '#2b2f3a', resolution: 2 }).setOrigin(0, 0.5);
        lab.add([ic, tx]);
        this.itemIcons.push({ k, ic, tx });
      }
      // as a logistics sink: porters bring the item here
      this.ux = x + 30; this.uy = y + 26;
      this.id = id;
      this.isWarehouse = false;
      this.enabled = true;
      if (gs.logistics) gs.logistics.add(this);
    }
    this.refresh();
  }

  // ---------------------------------------------------------------- (v3) item requirement
  itemsMissing() { if (!this.items) return 0; let n = 0; for (const k in this.items) n += Math.max(0, this.items[k] - this.got[k] - this.itemStack.countOf(k) - this.inFlight(k)); return n; }
  inFlight(k) { let n = 0; for (const t of this.itemStack.inTypes) if (t === k) n++; return n; }
  itemsDone() { if (!this.items) return true; for (const k in this.items) if (this.got[k] < this.items[k]) return false; return true; }
  accepts(type) { return !!(this.items && this.items[type] && this.active && !this.done); }
  room(type) { return this.accepts(type) ? Math.max(0, this.items[type] - this.got[type] - this.itemStack.countWithIncoming(type)) : 0; }
  prio() { return PRIO.SITE; }
  feed(ch) {
    for (let i = ch.stack.items.length - 1; i >= 0; i--) {
      const ty = ch.stack.items[i].type;
      if (this.room(ty) > 0) return this.gs.moveItem(ch.stack, this.itemStack, ty, { dur: 260, height: 70, sfx: 'drop' });
    }
    return false;
  }

  get remaining() { return Math.max(0, this.cost - this.paid); }

  setCost(cost, paid = 0) {
    this.cost = sanePrice(cost); this.paid = Math.max(0, Math.min(Math.floor(Number(paid)) || 0, this.cost));
    this.refresh();
  }

  refresh() {
    const txt = this.opts.labelFn ? this.opts.labelFn() : t(this.opts.label || this.id);
    this.labelText.setText(txt);
    const iconW = this.labelIcon.displayWidth;
    let extra = 0;
    if (this.itemIcons) for (const q of this.itemIcons) { const have = this.got[q.k] || 0, need = this.items[q.k]; q.tx.setText(have >= need ? '✓' : have + '/' + need); q.tx.setColor(have >= need ? '#2f8f4e' : '#c0392b'); extra += 44 + q.tx.width + 8; }
    const w = Math.max(120, this.labelText.width + iconW + 34 + extra);
    this.labelBg.setSize(w, 60);
    this.labelIcon.setPosition(-w / 2 + 14 + iconW / 2, -2);
    this.labelText.setPosition(-w / 2 + 22 + iconW, 0);
    if (this.itemIcons) { let x = -w / 2 + 22 + iconW + this.labelText.width + 12; for (const q of this.itemIcons) { q.ic.setPosition(x + 20, 2); q.tx.setPosition(x + 42, 0); x += 44 + q.tx.width + 8; } }
    if (this.maxed) {
      this.costText.setVisible(false); this.costCoin.setVisible(false);
      if (!this.maxBadge) {
        const gs = this.gs;
        const c = gs.add.container(this.x, this.y).setDepth(DEPTH.PAD_TEXT);
        const b = Assets.image(gs, 0, 0, 'ui_badge_max').setOrigin(0.5);
        b.setScale(96 / Math.max(b.frame.realWidth, 1));
        const tx = gs.add.text(0, -1, t('max'), { fontFamily: gs.font, fontSize: '24px', fontStyle: '900', color: '#ffffff', stroke: '#7a2a1a', strokeThickness: 5, resolution: 2 }).setOrigin(0.5);
        c.add([b, tx]);
        this.maxBadge = c;
      }
      this.maxBadge.setVisible(this.active);
    } else {
      this.costText.setText(fmt(this.remaining));
      // [coin] gap [digits], centred as a group (the text stroke needs a few px of air)
      const tw = this.costText.width + 42;
      this.costCoin.setPosition(this.x - tw / 2 + 15, this.y + 1);
      this.costText.setPosition(this.x - tw / 2 + 38, this.y + 1);
      this.costText.setVisible(this.active); this.costCoin.setVisible(this.active);
      if (this.maxBadge) this.maxBadge.setVisible(false);
    }
  }

  setActive(v) {
    this.active = v;
    this.pad.setVisible(v);
    this.label.setVisible(v);
    if (!v) { this.ring.setVisible(false); this.ringBg.setVisible(false); }
    this.refresh();
  }

  /** returns true while the player is standing on it (for tutorial / UI) */
  update(dt) {
    if (!this.active || this.done) return false;
    const gs = this.gs, p = gs.player;
    if (this.items) {
      // delivered items settle into the pad (counted), then the pad may complete on its own
      this.itemStack.layout(this.x + 46, this.y - 4, this.y + 1, 0, dt);
      let changed = false;
      for (const k in this.items) {
        while (this.itemStack.countOf(k) > 0 && this.got[k] < this.items[k]) {
          const it = this.itemStack.pop(k);
          this.got[k]++; changed = true;
          gs.effects.fly(it.spr, it.spr.x, it.spr.y, { x: this.x, y: this.y - 30 }, { dur: 260, height: 40, scaleTo: 0.3, onDone: (sp) => { gs.effects.releaseItem(sp); gs.effects.burst('star', this.x, this.y - 30, 6); } });
        }
      }
      if (changed) { this.refresh(); Audio.play('sfx_pickup', { volume: 0.6, rate: 1.3 }); if (this.remaining <= 0 && this.itemsDone()) { this.complete(); return false; } }
      // the chief carries the item: hand it over
      if (this.pad.contains(p.x, p.y) && (this.handT = (this.handT || 0) - dt) <= 0) { if (this.feed(p)) { this.handT = 0.12; this.pad.pulse(); } }
    }
    // (v4-B, v3.5 known issue) the chief standing on the pad: the label lifts over his head (glides)
    // (v4 fix) a label set below its pad (labelAt dy > 0, the station porter) stays put: lifting it would cover the price
    const onPad = this.pad.contains(p.x, p.y) && !this.labelDx && this.labelBaseY < this.y;
    this.lift = (this.lift || 0) + ((onPad ? 1 : 0) - (this.lift || 0)) * Math.min(1, dt * 8);
    this.label.y = this.labelBaseY - this.lift * 74 + Math.sin(gs.time.now / 420 + this.x * 0.01) * 4;
    // keep the floating label inside the screen while its pad is visible
    const v = gs.cameras.main.worldView, hw = this.labelBg.width * 0.5 + 8;
    const bx = this.x + (this.labelDx || 0);
    let lx = bx;
    if (this.x > v.x - 40 && this.x < v.right + 40 && v.width > hw * 2) lx = Math.max(v.x + hw, Math.min(v.right - hw, bx));
    if (this.label.x !== lx) this.label.x = lx;
    // "ready" highlight when the player can afford it
    const afford = !this.maxed && this.remaining > 0 && gs.economy.coins >= this.remaining;
    if (afford && !this.sparkle) {
      this.sparkle = gs.effects.loop('fx_sparkle', this.x, this.y - 30, 150, DEPTH.PAD_TEXT + 1) || 'none';
    }
    if (this.sparkle && this.sparkle !== 'none') this.sparkle.setVisible(afford);
    if (afford) {
      const k = 1 + Math.sin(gs.time.now / 180) * 0.035;
      this.pad.img.setScale(this.pad.bsx * k, this.pad.bsy * k);
      if (this.sparkle === 'none') { this.spT = (this.spT || 0) - dt; if (this.spT <= 0) { this.spT = 0.35; gs.effects.burst('spark', this.x + (Math.random() - 0.5) * 120, this.y - 10 - Math.random() * 30, 1); } }
    } else if (this.wasAfford) this.pad.img.setScale(this.pad.bsx, this.pad.bsy);
    this.wasAfford = afford;
    const on = this.pad.contains(p.x, p.y);
    // (review fix) a pad waiting for the chief to step off keeps its label readable (what comes next)
    const la = on && !(this.needsLeave && afford) ? 0.3 : 1;
    if (Math.abs(this.label.alpha - la) > 0.01) this.label.setAlpha(this.label.alpha + (la - this.label.alpha) * Math.min(1, dt * 10));
    if (!on || this.maxed) {
      this.standT = 0;
      this._warned = false;
      this._itemWarned = false;
      if (!on) this.needsLeave = false;
      if (this.ring.visible) { this.ring.setVisible(false); this.ringBg.setVisible(false); }
      return on;
    }
    // after an upgrade the player has to step off before the next level starts draining coins
    if (this.needsLeave) return true;
    this.standT += dt;
    if (this.standT < (Number(BALANCE.player.padDelay) || 0)) return true;
    // already fully paid (e.g. the price was lowered in balance.js below a saved partial payment)
    if (!(this.remaining > 0)) {
      if (this.itemsDone()) this.complete();
      else if (!this._itemWarned) { this._itemWarned = true; const k = Object.keys(this.items).find((q) => this.got[q] < this.items[q]); gs.ui.toast(t('needItem', { name: t(k) })); Audio.play('sfx_error', { volume: 0.4 }); }
      return true;
    }
    if (!this.ring.visible) this.drawRing();
    const eco = gs.economy;
    if (eco.coins > 0) {
      const rate = Math.max(12, this.cost / Math.max(0.1, Number(BALANCE.payDuration) || 1.6));
      this.acc += rate * dt;
      let amt = Math.floor(this.acc);
      if (amt >= 1) {
        this.acc -= amt;
        amt = Math.min(amt, this.remaining, eco.coins);
        eco.spend(amt);
        this.paid += amt;
        this.refresh();
        this.drawRing();
        // visual coins
        this.coinT -= dt;
        if (this.coinT <= 0) {
          this.coinT = 0.06;
          const spr = gs.effects.takeItem('item_coin');
          spr.setScale(0.7);
          gs.effects.fly(spr, p.x, p.y - 60, { x: this.x, y: this.y }, { dur: 220, height: 40, scaleTo: 0.35, onDone: (s) => gs.effects.releaseItem(s) });
        }
        this.tickT -= dt;
        if (this.tickT <= 0) {
          this.tickT = 0.07;
          Audio.play('sfx_pad_fill', { volume: 0.5, rate: 0.85 + 0.7 * (this.paid / this.cost), throttle: 60 });
        }
      }
      if (this.remaining <= 0 && this.itemsDone()) this.complete();
    } else if (this.remaining > 0 && eco.coins <= 0 && this.standT > BALANCE.player.padDelay + 0.05 && !this._warned) {
      this._warned = true;
      gs.ui.toast(t('notEnoughCoins'));
      Audio.play('sfx_error', { volume: 0.5 });
    }
    return true;
  }

  drawRing() {
    const g = this.ring;
    const pct = this.cost > 0 ? this.paid / this.cost : 1;
    g.clear();
    g.setVisible(true); this.ringBg.setVisible(true);
    const cx = this.x, cy = this.y - 118, r = 23;
    g.lineStyle(9, 0x5cc86a, 1);
    g.beginPath();
    g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct, false);
    g.strokePath();
  }

  complete() {
    if (this.done) return;
    const gs = this.gs;
    this.done = true;
    if (this.items && gs.logistics) gs.logistics.remove(this);
    if (this.sparkle && this.sparkle !== 'none') this.sparkle.setVisible(false);
    this.pad.img.setScale(this.pad.bsx, this.pad.bsy);
    this.ring.setVisible(false); this.ringBg.setVisible(false);
    gs.effects.sheet('fx_unlock', this.x, this.y - 20, { size: 260 });
    gs.effects.burst('star', this.x, this.y - 30, 18);
    Audio.play(this.kind === 'hire' ? 'sfx_hire' : this.kind === 'upgrade' ? 'sfx_levelup' : 'sfx_unlock', { volume: 1 });
    gs.effects.shake(160, 0.005);
    gs.effects.vibrate(40);
    if (this.opts.onComplete) this.opts.onComplete(this);
  }

  /** remove from the world with a little shrink */
  vanish() {
    const gs = this.gs;
    const objs = [this.pad.img, this.label, this.costText, this.costCoin];
    if (this.pad.icon) objs.push(this.pad.icon);
    gs.tweens.add({ targets: objs, alpha: 0, duration: 300, onComplete: () => this.destroy() });
  }

  destroy() {
    if (this.items) { if (this.gs.logistics) this.gs.logistics.remove(this); this.itemStack.clear(this.gs.effects); }
    this.pad.img.destroy(); if (this.pad.icon) this.pad.icon.destroy();
    this.label.destroy(); this.costText.destroy(); this.costCoin.destroy();
    this.ring.destroy(); this.ringBg.destroy();
    if (this.maxBadge) this.maxBadge.destroy();
    if (this.sparkle && this.sparkle !== 'none') this.sparkle.destroy();
    this.sparkle = null;
    this.active = false;
  }

  /** allow paying again (upgrades): reset completion state */
  rearm(cost) {
    this.done = false; this.cost = sanePrice(cost); this.paid = 0; this.acc = 0;
    this.needsLeave = true; this.standT = 0;
    this.ring.setVisible(false); this.ringBg.setVisible(false);
    this.refresh();
  }
}
