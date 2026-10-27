// Workshops (v3): stations with a recipe of several inputs.
//   toolsmith (대장간): 1 plank + 1 ingot -> 1 tool (the tool a hire pad is waiting for, else what the shop lacks)
//   cannery (통조림 공장): 3 fish (a big tuna counts as 3) + 1 ingot -> 3 cans
//            ((v4.2.1) once the 고기 통조림 machine is bought (systems/MeatCan.js): also 3 raw meat + 1 ingot -> 3 meat cans;
//            the next batch is picked by systems/cans.js pickCanKind, and one batch takes meatcan.timeMult of the time)
// Built on a construction plot; the input pad takes every ingredient (porters and the chief).

import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { BALANCE } from '../data/balance.js';
import { TOOLS } from '../data/items.js';
import { PRIO } from '../systems/Logistics.js';
import { Station } from './Station.js';
import { ItemStack } from './ItemStack.js';
import { pickCanKind } from '../systems/cans.js';

export const RECIPES = {
  toolsmith: {
    sprite: 'station_toolsmith', inputs: { item_plank: 1, item_ingot: 1 }, out: 'tool', outN: 1, sfx: 'sfx_hammer',
    cols: { item_plank: 0, item_ingot: 1 },
  },
  cannery: {
    sprite: 'station_cannery', inputs: { fish: 3, item_ingot: 1 }, out: 'item_can', outN: 3, sfx: 'sfx_smelt',
    // ((v4.2.1) item_meat_raw: the meat-can recipe's input, a third tower in front (Workshop.meatRecipe)
    cols: { item_fish_raw: 0, item_fish_big: 0, item_ingot: 1, item_meat_raw: 2 },
  },
};
const MC = () => BALANCE.meatcan || {};
const int = (v, d, lo, hi) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
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
      sfx: R.sfx, smoke: fx.smoke || null, bal, zone: null, noSink: true,
    });
    this.kind = kind;
    this.recipe = R;
    this.site = site;
    this.isWorkshop = true;
    this.isWarehouse = false;
    this.inputTypes = Object.keys(R.cols);
    // one tower per ingredient on the input pad ((v4.2.1) the cannery's third, front tower: raw meat)
    this.inStack.clear(gs.effects);
    // (each type keeps its inputMax: max ÷ types = the tower height the baked slot is sized for, 18 as before)
    const nCols = Math.max(...Object.values(R.cols)) + 1;
    this.inStack = new ItemStack(gs, { scale: 0.92, cols: [[-16, -4], [16, 6], [-2, 18]].slice(0, nCols), typeCols: R.cols, max: bal.inputMax * Math.max(3, Object.keys(R.cols).length), bake: true });
    if (kind === 'toolsmith') this.outStack.max = bal.outputMax;
    // ((v4.2.1) the output holds both cans: its baked slot is sized for both before the first bake)
    if (kind === 'cannery') this.outStack.bakeTypes = ['item_can', 'item_can_meat'];
    this.lastKind = null;            // ((v4.2.1) the can kind made last: a tie alternates)
    this.madeKinds = { fish: 0, meat: 0 };
    this.inPad.icon && this.inPad.icon.setAlpha(0.45);
    this.nextTool = 0;
    this.enabled = true;
    // as a logistics sink (porters bring the ingredients)
    this.sink = {
      id: kind + '_in', isWarehouse: false, enabled: true,
      x: this.inPad.x + 26, y: this.inPad.y + 18,
      accepts: (ty) => this.inputTypes.indexOf(ty) >= 0 && (ty !== 'item_meat_raw' || this.meatOn()),
      room: (ty) => this.roomFor(ty),
      // ((v4.2 F2) after village complete an input is urgent only while nearly empty: a far workshop no longer
      //  takes every goods load the shelves wait for)
      prio: (ty) => this.inputPrio(ty),
      feed: (ch) => this.feedFrom(ch),
    };
    if (gs.logistics) gs.logistics.add(this.sink);
  }

  inputPrio(ty) {
    // ((v4.2.1) raw meat for meat cans: always below the 훈제장's input (PRIO.GRILL 60) — any carrier with raw meat feeds
    //  the smokehouse first — and ≥ 40, a real-use job for the 창고 crew (balance.js meatcan.inPrio)
    if (ty === 'item_meat_raw') return Math.max(1, Math.min(PRIO.GRILL - 1, Number(MC().inPrio) || 41));
    const v42 = this.gs.v42, P = BALANCE.v42 && BALANCE.v42.porters;
    if (!v42 || !v42.frules || !P) return PRIO.INPUT;
    const max = Math.max(1, this.bal.inputMax), have = max - this.roomFor(ty);
    // ((v4.2.1) with both recipes the ingots go about twice as fast: urgent below meatcan.ingotUrgentBelow)
    const below = ty === 'item_ingot' && this.meatOn() ? Number(MC().ingotUrgentBelow) || 0.5 : Number(P.inputUrgentBelow) || 0.25;
    return have < max * below ? PRIO.INPUT : (Number(P.inputCalmPrio) || 42);
  }

  /** ((v4.2.1) the cannery's meat-can line is bought (gs.v42.meatcan.on) */
  meatOn() { const v42 = this.gs.v42; return this.kind === 'cannery' && !!(v42 && v42.meatcan && v42.meatcan.on); }

  /** ((v4.2.1) the machine makes each batch in meatcan.timeMult of the time (both recipes) */
  timeMult() { return this.meatOn() ? Math.max(0.3, Math.min(1, Number(MC().timeMult) || 0.7)) : super.timeMult(); }

  /** ((v4.2.1) the meat-can recipe: meatcan.meatIn raw meat + 1 ingot → meatcan.out meat cans (read at use) */
  meatRecipe() { const M = MC(); return { inputs: { item_meat_raw: int(M.meatIn, 3, 1, 9), item_ingot: 1 }, out: 'item_can_meat', outN: int(M.out, 3, 1, 9) }; }

  /** ((v4.2.1) the cannery's next batch: 'fish' | 'meat' | null (systems/cans.js) */
  canKind() {
    return pickCanKind({ fishUnits: this.fishUnits(false), meat: this.inStack.countOf('item_meat_raw'), ingot: this.inStack.countOf('item_ingot'), meatOn: this.meatOn(), last: this.lastKind, fishIn: this.recipe.inputs.fish, meatIn: this.meatRecipe().inputs.item_meat_raw });
  }

  /** ((v4.2.1) the size of the next batch (the cannery's two cans may differ); 0 = no batch on the pad */
  nextOutN() {
    if (this.kind === 'cannery') { const k = this.canKind(); return !k ? 0 : k === 'meat' ? this.meatRecipe().outN : this.recipe.outN; }
    return this.hasBatch() ? this.recipe.outN : 0;
  }

  /** how many more of `type` the input pad takes (items flying in counted) */
  roomFor(type) {
    if (this.inputTypes.indexOf(type) < 0 || !this.enabled) return 0;
    if (type === 'item_meat_raw' && !this.meatOn()) return 0;      // ((v4.2.1) closed until the line is bought
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
    if (this.kind === 'cannery') return this.canKind() !== null;
    for (const k in this.recipe.inputs) {
      const n = this.recipe.inputs[k];
      if (k === 'fish') { if (this.inStack.countOf('item_fish_big') < 1 && this.inStack.countOf('item_fish_raw') < n) return false; }
      else if (this.inStack.countOf(k) < n) return false;
    }
    return true;
  }

  canWork() {
    // (v3.5) somebody has to work the forge / the press (the chief on its work spot, or its operator)
    if (!this.operated()) return false;
    const n = this.nextOutN();
    if (!n || this.outStack.count + this.outStack.incoming + n > this.outStack.max) return false;
    // the toolsmith only forges what someone needs (a hire pad) or the shop can sell
    if (this.recipe.out === 'tool') { this.planned = this.pickTool(); return !!this.planned; }
    return true;
  }

  hasWork() {
    const n = this.nextOutN();
    if (!n || this.outStack.count + this.outStack.incoming + n > this.outStack.max) return false;
    return this.recipe.out === 'tool' ? !!this.pickTool() : true;
  }
  acceptsFromChief(p) { for (const it of p.stack.items) if (this.roomFor(it.type) > 0) return true; return false; }

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
      // ((v4.2 fix, the designer's "잡화점 판매원있는데 판매를 안해") for the shop: keep forging the kind already waiting on
      // the output pad while the shop has room for it. A porter carries one kind per trip: five kinds mixed on the pad
      // went 3 tools a trip (46-min save: 3.0 a trip, a 57 s round trip of 3,079 px), the forge stood full 26 % of the
      // time and the shop's tool shelves were empty 85 % of the time while 8–12 tools waited here
      let run = null, rn = 0;
      for (const tl of TOOLS) { const o = this.outStack.countWithIncoming(tl); if (o > rn && store.stock.countOf(tl) + o < store.maxPerType) { rn = o; run = tl; } }
      if (run) return run;
      // a new run: the kind the shop has least of; on a tie the kind after the last one forged (process() keeps it): the
      // shelf gets every kind in turn, not only axes
      let low = null, lc = Infinity;
      const k0 = (TOOLS.indexOf(this.lastRun) + 1) % TOOLS.length;
      for (let j = 0; j < TOOLS.length; j++) { const tl = TOOLS[(k0 + j) % TOOLS.length]; const c = store.stock.countOf(tl) + this.outStack.countWithIncoming(tl); if (c < lc) { lc = c; low = tl; } }
      if (low) return low;
    }
    return null;     // nobody needs a tool and there is no shop to sell them: the forge rests
  }

  process() {
    const gs = this.gs;
    let R = this.recipe;
    if (!this.hasBatch()) return;
    // ((v4.2.1) the cannery: fish cans or meat cans, by systems/cans.js)
    const can = this.kind === 'cannery' ? this.canKind() : null;
    if (can) { if (can === 'meat') R = Object.assign({}, R, this.meatRecipe()); this.lastKind = can; this.madeKinds[can]++; }
    // ingredients hop into the machine
    const used = [];
    for (const k in R.inputs) {
      if (k === 'fish') {
        if (this.inStack.countOf('item_fish_big') > 0) used.push(this.inStack.pop('item_fish_big'));
        else for (let i = 0; i < R.inputs[k]; i++) used.push(this.inStack.pop('item_fish_raw'));
      } else for (let i = 0; i < R.inputs[k]; i++) used.push(this.inStack.pop(k));
    }
    const fx = (this.site && Assets.def(this.recipe.sprite).fxPoints) || {};
    const mx = this.x + (fx.input ? fx.input[0] : 0), my = this.y + (fx.input ? fx.input[1] : -40);
    used.forEach((it, i) => {
      if (!it) return;
      gs.effects.fly(it.spr, it.spr.x, it.spr.y, { x: mx, y: my }, { dur: 240 + i * 40, height: 50, scaleTo: 0.4, onDone: (spr) => gs.effects.releaseItem(spr) });
    });
    const outType = R.out === 'tool' ? (this.planned || this.pickTool() || TOOLS[0]) : R.out;
    if (R.out === 'tool') this.lastRun = outType;
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
      const sfx = this.recipe.sfx;
      if (gs.isNear(this.x, this.y, 520)) gs.sfxAt(Assets.audioGroup(sfx) || Assets.audioDef(sfx) ? sfx : 'sfx_smelt', this.x, this.y, { volume: 0.4, throttle: 300 });
      gs.effects.pop(this.img, 0.04, 90);
    });
    gs.events.emit('crafted', this.kind, outType);
    if (gs.noteMade) gs.noteMade(R.outN);                    // ((v4.2 touch) products made)
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
