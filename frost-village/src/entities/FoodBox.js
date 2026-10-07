// Miners' food box (v3, 광산 식량 상자): miners eat bread or smoked meat — one for every few ores
// (balance.js food.orePerFood). When the box is empty they stop and wait, hungry (a bread emote),
// until a porter or the chief brings food. A crate on a pad by the mine with the food stacked on it.

import { Assets } from '../core/Assets.js';
import { BALANCE } from '../data/balance.js';
import { MINER_FOOD } from '../data/items.js';
import { t } from '../data/strings.js';
import { DEPTH } from '../systems/DepthSort.js';
import { PRIO } from '../systems/Logistics.js';
import { Pad } from './Pad.js';
import { ItemStack } from './ItemStack.js';
import { panel } from '../core/Panel.js';

export class FoodBox {
  constructor(gs, cfg) {
    this.gs = gs;
    this.x = cfg.x; this.y = cfg.y;
    this.id = 'foodbox';
    this.isWarehouse = false;
    this.enabled = false;
    this.active = false;            // appears with v3 (balance.js food)
    this.max = Math.max(1, Math.floor(BALANCE.food.boxMax) || 20);
    this.pad = new Pad(gs, this.x, this.y, 'input', 1.45, { icon: Assets.pick('ui_icon_food', 'item_bread'), iconSize: 46 });
    this.crate = Assets.image(gs, this.x - 64, this.y - 26, 'crate').setDepth(this.y - 26);
    this.crate.setScale(0.8);
    this.stock = new ItemStack(gs, { scale: 0.9, cols: [[-15, -3], [15, 6]], typeCols: { item_bread: 0, item_meat_cooked: 1 }, max: this.max });
    const lab = gs.add.container(this.x, this.y - 58).setDepth(this.y + 2000);
    this.labelBg = panel(gs, 0, 0, 'ui_panel', 140, 46).setOrigin(0.5).setAlpha(0.95);
    this.labelIcon = Assets.image(gs, 0, 0, Assets.pick('ui_icon_food', 'item_bread')).setOrigin(0.5);
    this.labelIcon.setScale(34 / Math.max(1, this.labelIcon.frame.realWidth));
    this.labelText = gs.add.text(0, 0, '', { fontFamily: gs.font, fontSize: '20px', fontStyle: '800', color: '#2b2f3a', resolution: 2 }).setOrigin(0, 0.5);
    lab.add([this.labelBg, this.labelIcon, this.labelText]);
    this.label = lab;
    this.labelKey = '';
    this.eaten = 0;
    this.setShown(false);
  }

  get count() { return this.stock.count; }
  get empty() { return this.active && this.stock.count === 0; }

  /** the box appears (v3 step); gift = bread already inside */
  activate(instant, gift) {
    if (this.active) return;
    this.active = true;
    this.enabled = true;
    this.setShown(true);
    for (let i = 0; i < Math.min(this.max, gift || 0); i++) this.stock.push('item_bread', null, this.gs.effects);
    if (this.gs.logistics) this.gs.logistics.add(this);
    if (!instant) {
      const gs = this.gs;
      for (const o of [this.pad.img, this.crate, this.label]) { const sx = o.scaleX, sy = o.scaleY; o.setScale(0.01); gs.tweens.add({ targets: o, scaleX: sx, scaleY: sy, duration: 420, ease: 'Back.easeOut' }); }
      gs.effects.sheet('fx_poof', this.x, this.y - 20, { size: 160 });
    }
    this.refresh();
  }

  setShown(v) {
    this.pad.setVisible(v); this.crate.setVisible(v); this.label.setVisible(v); this.stock.setVisible(v);
  }

  refresh() {
    const k = this.stock.count + '/' + this.max;
    if (k === this.labelKey) return;
    this.labelKey = k;
    this.labelText.setText(t('foodBox') + ' ' + k);
    this.labelText.setColor(this.stock.count === 0 ? '#c0392b' : '#2b2f3a');
    const w = Math.max(130, this.labelText.width + 66);
    this.labelBg.setSize(w, 46);
    this.labelIcon.setPosition(-w / 2 + 24, 0);
    this.labelText.setPosition(-w / 2 + 46, 0);
  }

  // logistics sink
  accepts(type) { return this.active && MINER_FOOD.indexOf(type) >= 0; }
  room() { return this.active ? Math.max(0, this.max - this.stock.count - this.stock.incoming) : 0; }
  prio() { return this.stock.count + this.stock.incoming < this.max * 0.5 ? PRIO.FOOD_LOW : PRIO.FOOD; }
  feed(ch) {
    if (this.room() <= 0) return false;
    for (let i = ch.stack.items.length - 1; i >= 0; i--) {
      const ty = ch.stack.items[i].type;
      if (MINER_FOOD.indexOf(ty) >= 0) { const ok = this.gs.moveItem(ch.stack, this.stock, ty, { dur: 240, height: 60, sfx: 'drop' }); if (ok) this.gs.events.emit('fedMiners'); return ok; }
    }
    return false;
  }
  feedFromPlayer() { if (this.feed(this.gs.player)) { this.pad.pulse(); return true; } return false; }

  /** a miner eats one portion (flies from the box toward him); false when the box is empty */
  eat(miner) {
    if (!this.active) return true;
    const it = this.stock.pop();
    if (!it) return false;
    const gs = this.gs;
    if (gs.isOnScreen(this.x, this.y, 200)) gs.effects.fly(it.spr, it.spr.x, it.spr.y, () => ({ x: miner.x, y: miner.y - 50 }), { dur: 380, height: 70, scaleTo: 0.3, onDone: (s) => { gs.effects.releaseItem(s); gs.effects.burst('heart', miner.x, miner.y - 70, 2); } });
    else gs.effects.releaseItem(it.spr);
    this.eaten++;
    return true;
  }

  update(dt) {
    if (!this.active) return false;
    this.stock.layout(this.x, this.y + 6, this.y, 0, dt);
    this.label.y = this.y - 58 + Math.sin(this.gs.time.now / 430 + 1.3) * 3;
    this.refresh();
    const p = this.gs.player;
    return this.pad.contains(p.x, p.y);
  }

  serialize() { const o = {}; for (const it of this.stock.items) o[it.type] = (o[it.type] || 0) + 1; for (const ty of this.stock.inTypes) o[ty] = (o[ty] || 0) + 1; return { on: this.active, food: o }; }
  restore(s) {
    if (!s || !s.on) return;
    this.activate(true, 0);
    if (s.food) for (const ty of MINER_FOOD) for (let i = 0; i < Math.min(this.max - this.stock.count, s.food[ty] || 0); i++) this.stock.push(ty, null, this.gs.effects);
    this.refresh();
  }
}
// keep DEPTH imported for consistency with other pads
void DEPTH;
