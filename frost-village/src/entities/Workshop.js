// Workshops (v3): stations with a recipe of several inputs.
//   toolsmith (대장간): 1 plank + 1 ingot -> 1 tool (the tool a hire pad is waiting for, else what the shop lacks)
//   cannery (통조림 공장): 3 fish (a big tuna counts as 3) + 1 ingot -> 3 cans
// Built on a construction plot; the input pad takes every ingredient (porters and the chief).

import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { BALANCE } from '../data/balance.js';
import { TOOLS } from '../data/items.js';
import { PRIO } from '../systems/Logistics.js';
import { Station } from './Station.js';
import { ItemStack } from './ItemStack.js';

export const RECIPES = {
  toolsmith: {
    sprite: 'station_toolsmith', inputs: { item_plank: 1, item_ingot: 1 }, out: 'tool', outN: 1, sfx: 'sfx_hammer',
    cols: { item_plank: 0, item_ingot: 1 },
  },
  cannery: {
    sprite: 'station_cannery', inputs: { fish: 3, item_ingot: 1 }, out: 'item_can', outN: 3, sfx: 'sfx_smelt',
    cols: { item_fish_raw: 0, item_fish_big: 0, item_ingot: 1 },
  },
};
const FISH_UNITS = { item_fish_raw: 1, item_fish_big: 3 };

export class Workshop extends Station {
  constructor(gs, kind, site) {
    const R = RECIPES[kind];
    const d = Assets.def(R.sprite);
    const bal = Object.assign({ time: 3, inputMax: 8, outputMax: 12 }, (BALANCE.stations3 && BALANCE.stations3[kind]) || {});
    const fx = d.fxPoints || {};
    super(gs, {
      id: kind, sprite: R.sprite, x: site.x, y: site.y, in: d.inPoint || [-158, 38], out: d.outPoint || [77, 79],
      input: kind === 'cannery' ? 'item_fish_raw' : 'item_ingot', output: kind === 'cannery' ? 'item_can' : 'item_axe',
      sfx: R.sfx, smoke: fx.smoke || null, bal, zone: null,
    });
    this.kind = kind;
    this.recipe = R;
    this.site = site;
    this.isWorkshop = true;
    this.isWarehouse = false;
    this.inputTypes = Object.keys(R.cols);
    // one tower per ingredient on the input pad
    this.inStack.clear(gs.effects);
    this.inStack = new ItemStack(gs, { scale: 0.92, cols: [[-16, -4], [16, 6]], typeCols: R.cols, max: bal.inputMax * 3 });
    if (kind === 'toolsmith') this.outStack.max = bal.outputMax;
    this.inPad.icon && this.inPad.icon.setAlpha(0.45);
    this.nextTool = 0;
    this.enabled = true;
    // as a logistics sink (porters bring the ingredients)
    this.sink = {
      id: kind + '_in', isWarehouse: false, enabled: true,
      x: this.inPad.x + 26, y: this.inPad.y + 18,
      accepts: (ty) => this.inputTypes.indexOf(ty) >= 0,
      room: (ty) => this.roomFor(ty),
      prio: () => PRIO.INPUT,
      feed: (ch) => this.feedFrom(ch),
    };
    if (gs.logistics) gs.logistics.add(this.sink);
  }

  /** how many more of `type` the input pad takes (items flying in counted) */
  roomFor(type) {
    if (this.inputTypes.indexOf(type) < 0 || !this.enabled) return 0;
    const max = this.bal.inputMax;
    if (type === 'item_fish_raw' || type === 'item_fish_big') {
      const units = this.fishUnits(true);
      return Math.max(0, Math.floor((max - units) / FISH_UNITS[type]));
    }
    return Math.max(0, max - this.inStack.countWithIncoming(type));
  }

  fishUnits(withIncoming) {
    let u = 0;
    for (const t in FISH_UNITS) u += (withIncoming ? this.inStack.countWithIncoming(t) : this.inStack.countOf(t)) * FISH_UNITS[t];
    return u;
  }

  /** every ingredient of one batch is on the pad */
  hasBatch() {
    for (const k in this.recipe.inputs) {
      const n = this.recipe.inputs[k];
      if (k === 'fish') { if (this.inStack.countOf('item_fish_big') < 1 && this.inStack.countOf('item_fish_raw') < n) return false; }
      else if (this.inStack.countOf(k) < n) return false;
    }
    return true;
  }

  canWork() { return this.hasBatch() && this.outStack.count + this.outStack.incoming + this.recipe.outN <= this.outStack.max; }

  /** accept one ingredient from a character standing on the input pad */
  feedFrom(ch) {
    for (let i = ch.stack.items.length - 1; i >= 0; i--) {
      const ty = ch.stack.items[i].type;
      if (this.roomFor(ty) > 0) return this.gs.moveItem(ch.stack, this.inStack, ty, { dur: 240, height: 60, sfx: 'drop' });
    }
    return false;
  }

  /** which tool to make next: the one a hire pad waits for, else the one the shop has least of */
  pickTool() {
    const gs = this.gs;
    const want = gs.toolsWanted ? gs.toolsWanted() : {};
    let best = null, bn = 0;
    for (const tl of TOOLS) {
      const have = this.outStack.countWithIncoming(tl) + (gs.toolsInTransit ? gs.toolsInTransit(tl) : 0);
      const n = (want[tl] || 0) - have;
      if (n > bn) { bn = n; best = tl; }
    }
    if (best) return best;
    const store = gs.store;
    if (store && store.enabled) {
      let low = null, lc = Infinity;
      for (const tl of TOOLS) { const c = store.stock.countOf(tl) + this.outStack.countWithIncoming(tl); if (c < lc) { lc = c; low = tl; } }
      if (low) return low;
    }
    const tl = TOOLS[this.nextTool % TOOLS.length];
    this.nextTool++;
    return tl;
  }

  process() {
    const gs = this.gs;
    const R = this.recipe;
    if (!this.hasBatch()) return;
    // ingredients hop into the machine
    const used = [];
    for (const k in R.inputs) {
      if (k === 'fish') {
        if (this.inStack.countOf('item_fish_big') > 0) used.push(this.inStack.pop('item_fish_big'));
        else for (let i = 0; i < R.inputs[k]; i++) used.push(this.inStack.pop('item_fish_raw'));
      } else for (let i = 0; i < R.inputs[k]; i++) used.push(this.inStack.pop(k));
    }
    const fx = (this.site && Assets.def(R.sprite).fxPoints) || {};
    const mx = this.x + (fx.input ? fx.input[0] : 0), my = this.y + (fx.input ? fx.input[1] : -40);
    used.forEach((it, i) => {
      if (!it) return;
      gs.effects.fly(it.spr, it.spr.x, it.spr.y, { x: mx, y: my }, { dur: 240 + i * 40, height: 50, scaleTo: 0.4, onDone: (spr) => gs.effects.releaseItem(spr) });
    });
    const outType = R.out === 'tool' ? this.pickTool() : R.out;
    for (let i = 0; i < R.outN; i++) this.outStack.reserve(outType);
    const ox = this.x + (fx.output ? fx.output[0] : 0), oy = this.y + (fx.output ? fx.output[1] : -50);
    for (let i = 0; i < R.outN; i++) {
      gs.time.delayedCall(300 + i * 140, () => {
        const spr = gs.effects.takeItem(outType);
        spr.setScale(0.5);
        gs.effects.fly(spr, ox, oy, () => this.outStack.nextPos(), {
          dur: 300, height: 60, scaleTo: 1,
          onDone: (s) => {
            this.outStack.arrive(outType);
            this.outStack.push(outType, s);
            if (gs.isOnScreen(this.outPad.x, this.outPad.y, 60)) Audio.play('sfx_drop', { volume: 0.35, rate: 1.1 + Math.random() * 0.2, throttle: 60 });
          },
        });
      });
    }
    gs.time.delayedCall(260, () => {
      if (gs.isNear(this.x, this.y, 520)) gs.sfxAt(Assets.audioGroup(R.sfx) || Assets.audioDef(R.sfx) ? R.sfx : 'sfx_smelt', this.x, this.y, { volume: 0.4, throttle: 300 });
      gs.effects.pop(this.img, 0.04, 90);
      if (this.smith) this.smith.cheer();
    });
    gs.events.emit('crafted', this.kind, outType);
  }

  /** a little extra life while working (sparks at the anvil, steam) */
  workFx() {
    const gs = this.gs, fx = Assets.def(this.recipe.sprite).fxPoints || {};
    if (fx.sparks) gs.effects.burst('spark', this.x + fx.sparks[0], this.y + fx.sparks[1], 3);
    if (fx.steam && Math.random() < 0.5) gs.effects.burst('smoke', this.x + fx.steam[0], this.y + fx.steam[1], 1);
  }

  setEnabled(v) {
    super.setEnabled(v);
    this.sink.enabled = v;
    if (this.smith) { this.smith.sprite.setVisible(v); this.smith.shadow.setVisible(v); }
  }

  serialize() {
    const ins = {};
    for (const ty of this.inputTypes) { const n = this.inStack.countWithIncoming(ty); if (n) ins[ty] = n; }
    const outs = {};
    for (const it of this.outStack.items) outs[it.type] = (outs[it.type] || 0) + 1;
    for (const ty of this.outStack.inTypes) outs[ty] = (outs[ty] || 0) + 1;
    return { ins, outs };
  }

  restore(s) {
    if (!s) return;
    const fx = this.gs.effects;
    if (s.ins) for (const ty in s.ins) if (this.inputTypes.indexOf(ty) >= 0) for (let k = 0; k < Math.min(s.ins[ty], this.bal.inputMax); k++) this.inStack.push(ty, null, fx);
    if (s.outs) for (const ty in s.outs) for (let k = 0; k < s.outs[ty] && this.outStack.count < this.outStack.max; k++) this.outStack.push(ty, null, fx);
  }
}
