// Warehouse (v3, 창고): keeps what the village makes when there is no room for it elsewhere, so
// production never stalls. Its porters carry overflow from full station outputs in, and bring
// things back out to whoever needs them (construction sites, hire pads, the miners' food box,
// workshops, nearly empty shop shelves). The chief can drop anything he carries on the input pad.

import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { BALANCE } from '../data/balance.js';
import { ITEMS } from '../data/items.js';
import { t, fmt } from '../data/strings.js';
import { DEPTH } from '../systems/DepthSort.js';
import { PRIO } from '../systems/Logistics.js';
import { Pad } from './Pad.js';
import { ItemStack } from './ItemStack.js';
import { panel } from '../core/Panel.js';

// raw materials go to their stations, not into storage
const STORABLE = ITEMS.filter((k) => ['item_log', 'item_wheat', 'item_ore', 'item_meat_raw'].indexOf(k) < 0);

export class Warehouse {
  constructor(gs, site) {
    this.gs = gs; this.site = site;
    this.x = site.x; this.y = site.y;
    this.isWarehouse = true;
    this.enabled = true;
    this.id = 'warehouse';
    const d = Assets.def('warehouse');
    const r = Assets.sprite('warehouse');
    this.img = gs.add.sprite(this.x, this.y, r.tex, r.frame).setOrigin(r.anchor[0], r.anchor[1]).setDepth(this.y);
    gs.addOccluder(this.img);
    this.workAnim = Assets.spriteAnim('warehouse', 'work');
    const fp = d.footprint || [272, 136];
    this.obstacle = gs.collision.add(this.x, this.y, fp[0] * 0.42, 'warehouse');
    const ip = d.inPoint || [-158, 38], op = d.outPoint || [77, 79];
    this.inPad = new Pad(gs, this.x + ip[0], this.y + ip[1], 'input', 1.5, { icon: Assets.pick('ui_icon_house', 'item_plank'), iconSize: 40 });
    this.outPad = new Pad(gs, this.x + op[0], this.y + op[1], 'output', 1.5, { icon: 'item_plank', iconSize: 40 });
    this.counts = {};
    this.total = 0;
    this.incoming = 0;
    this.cap = Math.max(10, Math.floor(BALANCE.warehouse.capacity) || 300);
    // a little pile on the pick-up pad shows what is inside (one sprite per few items)
    this.pile = new ItemStack(gs, { scale: 0.8, cols: [[-24, -6], [0, 4], [24, -6], [-12, 14], [12, 14]], alternate: true, max: 25, hop: false });
    this.pileKey = '';
    this.busyT = 0;
    // label: "창고 123/300"
    const lab = gs.add.container(this.x, this.y - (d.topPx || 235) - 30).setDepth(DEPTH.LABEL - 20);
    this.labelBg = panel(gs, 0, 0, 'ui_panel', 150, 48).setOrigin(0.5).setAlpha(0.95);
    this.labelText = gs.add.text(0, 0, '', { fontFamily: gs.font, fontSize: '21px', fontStyle: '800', color: '#2b2f3a', resolution: 2 }).setOrigin(0.5);
    lab.add([this.labelBg, this.labelText]);
    this.label = lab;
    this.refresh();
    this.porters = [];
    // as a logistics sink of last resort
    this.sink = {
      id: 'warehouse', isWarehouse: true, enabled: true, x: this.inPad.x + 24, y: this.inPad.y + 18,
      accepts: (ty) => STORABLE.indexOf(ty) >= 0,
      room: () => this.room,
      prio: () => PRIO.STORE,
      feed: (ch) => this.feedFrom(ch),
    };
    if (gs.logistics) gs.logistics.add(this.sink);
  }

  get room() { return Math.max(0, this.cap - this.total - this.incoming); }
  count(type) { return this.counts[type] || 0; }
  types() { return Object.keys(this.counts).filter((k) => this.counts[k] > 0); }
  accepts(type) { return STORABLE.indexOf(type) >= 0; }

  refresh() {
    const s = t('warehouse') + ' ' + fmt(this.total) + '/' + fmt(this.cap);
    if (this.labelText.text !== s) { this.labelText.setText(s); this.labelBg.setSize(Math.max(120, this.labelText.width + 36), 48); }
    // pile: up to 25 sprites, types in proportion
    const types = this.types().sort((a, b) => this.counts[b] - this.counts[a]);
    const n = Math.min(25, Math.ceil(this.total / 6));
    const key = n + ':' + types.slice(0, 5).map((k) => k + Math.round((this.counts[k] / Math.max(1, this.total)) * 10)).join(',');
    if (key === this.pileKey) return;
    this.pileKey = key;
    this.pile.clear(this.gs.effects);
    const want = [];
    for (const ty of types) want.push([ty, Math.max(1, Math.round((this.counts[ty] / Math.max(1, this.total)) * n))]);
    let k = 0;
    for (let i = 0; k < n && want.length; i++) {
      const w = want[i % want.length];
      if (w[1] <= 0) { if (want.every((q) => q[1] <= 0)) break; continue; }
      w[1]--; k++;
      this.pile.push(w[0], null, this.gs.effects);
    }
    this.pile.setVisible(this.enabled);
  }

  /** an item arrives (from a porter / the chief): it flies onto the pile, then is counted */
  feedFrom(ch) {
    if (this.room <= 0) return false;
    for (let i = ch.stack.items.length - 1; i >= 0; i--) {
      const ty = ch.stack.items[i].type;
      if (!this.accepts(ty)) continue;
      const it = ch.stack.pop(ty);
      this.incoming++;
      const gs = this.gs;
      gs.effects.fly(it.spr, it.spr.x, it.spr.y, { x: this.inPad.x, y: this.inPad.y - 10 }, {
        dur: 240, height: 60, scaleTo: 0.5,
        onDone: (s) => {
          gs.effects.releaseItem(s);
          this.incoming = Math.max(0, this.incoming - 1);
          this.counts[ty] = (this.counts[ty] || 0) + 1;
          this.total++;
          this.busyT = 1.2;
          this.refresh();
          if (gs.isNear(this.x, this.y, 500)) Audio.play('sfx_drop', { volume: 0.4, rate: 0.9 + Math.random() * 0.2, throttle: 50 });
        },
      });
      return true;
    }
    return false;
  }

  /** a porter takes one `type` out (flies from the pick-up pad into its stack) */
  giveTo(ch, type) {
    if (!this.count(type) || ch.stack.room <= 0) return false;
    this.counts[type]--;
    this.total--;
    this.busyT = 1.2;
    const gs = this.gs;
    ch.stack.reserve(type);
    const spr = gs.effects.takeItem(type);
    spr.setScale(0.5);
    gs.effects.fly(spr, this.outPad.x, this.outPad.y - 10, () => ch.stack.nextPos(type), {
      dur: 230, height: 55, scaleTo: ch.stack.scale,
      onDone: (s) => { ch.stack.arrive(type); if (!ch.alive) { gs.effects.releaseItem(s); return; } ch.stack.push(type, s); },
    });
    this.refresh();
    return true;
  }

  update(dt) {
    this.pile.layout(this.outPad.x, this.outPad.y + 6, this.outPad.y, 0, dt);
    if (!this.enabled) return;
    if (this.busyT > 0) {
      this.busyT -= dt;
      if (!this.working && this.workAnim) { this.working = true; this.img.play(this.workAnim); }
    } else if (this.working) {
      this.working = false;
      this.img.stop();
      Assets.apply(this.img, 'warehouse');
    }
  }

  setEnabled(v) {
    this.enabled = v;
    this.img.setVisible(v);
    this.inPad.setVisible(v); this.outPad.setVisible(v);
    this.pile.setVisible(v);
    this.label.setVisible(v);
    this.obstacle.active = v;
    this.sink.enabled = v;
  }

  revealObjects() { return [this.img, this.inPad.img, this.outPad.img]; }

  serialize() { const o = {}; for (const k in this.counts) if (this.counts[k] > 0) o[k] = this.counts[k]; return o; }
  restore(o) {
    if (!o) return;
    for (const k in o) {
      if (!this.accepts(k)) continue;
      const n = Math.max(0, Math.min(this.cap - this.total, Math.floor(o[k]) || 0));
      if (n) { this.counts[k] = (this.counts[k] || 0) + n; this.total += n; }
    }
    this.refresh();
  }
}
