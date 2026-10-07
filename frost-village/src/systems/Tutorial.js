// Tutorial / objective arrow: a bouncing world-space arrow over the next thing to do
// (+ an edge indicator drawn by the UI scene when it is off-screen).

import { Assets } from '../core/Assets.js';
import { DEPTH } from './DepthSort.js';
import { gdist } from '../core/Iso.js';
import { t, fmt } from '../data/strings.js';

const ZONE_CHAINS = [
  { zone: 'forest', raw: 'item_log', product: 'item_plank', station: 'sawmill', seller: 'trade' },
  { zone: 'farm', raw: 'item_wheat', product: 'item_bread', station: 'bakery', seller: 'market' },
  { zone: 'mine', raw: 'item_ore', product: 'item_ingot', station: 'smelter', seller: 'trade' },
  { zone: 'hunt', raw: 'item_meat_raw', product: 'item_meat_cooked', station: 'smokehouse', seller: 'market' },
];
export const PRODUCT_ZONE = { item_plank: 'forest', item_bread: 'farm', item_ingot: 'mine', item_meat_cooked: 'hunt' };

export class Tutorial {
  constructor(gs) {
    this.gs = gs;
    this.arrow = Assets.image(gs, 0, 0, 'ui_arrow').setDepth(DEPTH.ARROW).setVisible(false);
    const f = this.arrow.frame;
    this.arrow.setScale(58 / Math.max(f.realWidth, 1));
    this.target = null;      // { x, y, h, key }
    this.textKey = null;
    this.t = 0;
    this.evalT = 0;
    this.hintT = 0;          // after tutorial: show arrow for new things for a while
    this._tg = { x: 0, y: 0, h: 0 };
  }

  get inTutorial() { return !this.gs.progress.isDone('hire_fisherman'); }

  evaluate() {
    const gs = this.gs, p = gs.player, prog = gs.progress, eco = gs.economy;
    const tg = this._tg;
    const set = (x, y, h, key) => { tg.x = x; tg.y = y; tg.h = h; this.target = tg; this.textKey = key; };
    this.target = null; this.textKey = null; this.text = null;

    const pad = prog.affordablePad(eco.coins);
    if (pad && !pad.pad.contains(p.x, p.y)) { set(pad.x, pad.y, 112, this.inTutorial ? 'obj_unlock' : null); return; }
    if (pad) return;
    if (!this.inTutorial) {
      if (this.zoneHint(set)) return;
      // gentle hint: lots of coins waiting on a cash pad
      const cashes = [gs.market.cash, gs.trade && gs.trade.enabled ? gs.trade.cash : null];
      for (const c of cashes) if (c && c.value >= 40 && !c.pad.contains(p.x, p.y) && gdist(p.x, p.y, c.x, c.y) > 260) { set(c.x, c.y, 40, null); return; }
      // otherwise just name the next goal (no arrow)
      const nx = prog.nextPad();
      if (nx && !prog.complete) { this.textKey = 'obj_next:' + nx.id + ':' + nx.remaining; this.text = t('obj_next', { name: t(nx.id), cost: fmt(nx.remaining) }); }
      return;
    }
    const grill = gs.stations.grill, m = gs.market;
    const raw = p.stack.countOf('item_fish_raw'), cooked = p.stack.countOf('item_fish_cooked');
    const next = prog.nextPad();
    if (m.cash.value > 0 && cooked === 0 && (eco.coins + m.cash.value >= (next ? next.remaining : 0) || (raw === 0 && grill.outStack.count === 0))) {
      if (!m.cash.pad.contains(p.x, p.y)) set(m.cash.x, m.cash.y, 40, 'obj_cash');
      return;
    }
    if (cooked > 0) { set(m.shelf.x, m.shelf.y, 60, 'obj_sell'); return; }
    if (raw > 0 && (p.room <= 0 || !gs.net.ready() || raw >= Math.min(4, p.capacity))) { set(grill.inPad.x, grill.inPad.y, 50, 'obj_grill'); return; }
    if (grill.outStack.count > 0 && raw === 0) { set(grill.outPad.x, grill.outPad.y, 80, 'obj_take'); return; }
    if (grill.inStack.count > 0 && raw === 0) { set(grill.outPad.x, grill.outPad.y, 80, 'obj_take'); return; }
    set(gs.net.gather.x, gs.net.gather.y - 10, 30, 'obj_fish');
  }

  /** guided first run through each newly opened zone (until its product is sold once) */
  zoneHint(set) {
    const gs = this.gs, p = gs.player, prog = gs.progress;
    for (const z of ZONE_CHAINS) {
      if (!prog.isDone('zone_' + z.zone) || prog.hints[z.zone]) continue;
      const st = gs.stations[z.station];
      const seller = z.seller === 'trade' ? gs.trade.shelf : gs.market.shelf;
      if (p.stack.countOf(z.product) > 0) { set(seller.x, seller.y, 60, 'obj_' + z.zone + '_4'); return true; }
      if (p.stack.countOf(z.raw) > 0 && (p.room <= 0 || p.stack.countOf(z.raw) >= 3)) { set(st.inPad.x, st.inPad.y, 50, 'obj_' + z.zone + '_2'); return true; }
      if (st.outStack.count > 0 && p.stack.countOf(z.raw) === 0) { set(st.outPad.x, st.outPad.y, 80, 'obj_' + z.zone + '_3'); return true; }
      if (st.inStack.count > 0 && p.stack.countOf(z.raw) === 0) { set(st.outPad.x, st.outPad.y, 80, 'obj_' + z.zone + '_3'); return true; }
      // nearest ready resource
      const list = z.zone === 'forest' ? gs.trees : z.zone === 'farm' ? gs.wheat : z.zone === 'mine' ? gs.rocks : gs.animals;
      let best = null, bd = 1e12;
      for (const n of list) { if (!n.ready()) continue; const d = gdist(p.x, p.y, n.x, n.y); if (d < bd) { bd = d; best = n; } }
      if (best && bd > 90) { set(best.x, best.y, z.zone === 'forest' ? 200 : z.zone === 'hunt' ? 70 : 90, 'obj_' + z.zone + '_1'); return true; }
      if (best) { this.textKey = 'obj_' + z.zone + '_1'; this.target = null; return true; }
      return false;
    }
    return false;
  }

  update(dt) {
    this.t += dt;
    this.evalT -= dt;
    if (this.evalT <= 0) { this.evalT = 0.2; this.evaluate(); }
    const tg = this.target;
    if (!tg) { this.arrow.setVisible(false); this.gs.ui.setObjective(this.textKey, null, this.text); return; }
    const bounce = Math.abs(Math.sin(this.t * 4.2)) * 16;
    this.arrow.setVisible(true).setPosition(tg.x, tg.y - tg.h - bounce);
    this.gs.ui.setObjective(this.textKey, tg, this.text);
  }
}
