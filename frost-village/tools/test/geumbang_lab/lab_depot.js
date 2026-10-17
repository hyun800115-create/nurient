// The lab's v4.2 depot: a stand-in for src/entities/DepotBuilding.js (the logistics_center cutaway drawn the same
// way: layerOrder at y + 0.01 × index, alwaysDrawn layers, the inside only while revealed, the rack stock from
// rackFill between interior and interior_racks, ≤ 2 Hz when the stock changed) plus the depot's stock (the real rack
// Stock of src/systems/depot/rack.js with the v4.2 caps) and a stand-in cargo sleigh clock (sleighBusy). It adds
// the two hooks the Integration section asks of DepotBuilding: setShown(fn) (the racks draw 금방's shownStock) and
// the reveal from the camera (camReveal). Nothing here is game code.

import { Assets } from '../../../src/core/Assets.js';
import { WORLD, L4 } from '../../../src/data/world.js';
import { Stock, rackFill } from '../../../src/systems/depot/rack.js';
import { mulberry32Lab } from './lab_rng.js';

const KEY = 'logistics_center';
export const CAPS = { materials: 160, food: 160, goods: 120, tools: 60, furniture: 0, appliances: 0 };
const INFLOW = ['item_log', 'item_fish_raw', 'item_wheat', 'item_meat_raw', 'item_bread', 'item_plank', 'item_fish_cooked', 'item_can', 'item_meat_cooked', 'item_ore'];

/** the depot stock + the env.source the module reads */
export function makeDepot(fill = 0.6, seed = 7) {
  const st = new Stock(Object.assign({}, CAPS));
  const r = mulberry32Lab(seed);
  const pools = { materials: ['item_log', 'item_plank', 'item_wheat', 'item_ore'], food: ['item_bread', 'item_fish_raw', 'item_fish_cooked', 'item_meat_raw', 'item_meat_cooked'], goods: ['item_can'], tools: ['item_axe', 'item_rod', 'item_sickle', 'item_bow', 'item_pickaxe'] };
  for (const c in pools) { let n = Math.floor(CAPS[c] * fill); while (n > 0) { const k = pools[c][Math.floor(r() * pools[c].length)]; const q = Math.min(n, 1 + Math.floor(r() * 6)); st.add(k, q); n -= q; } }
  const D = {
    stock: st, surplus: 0, dock: 0,
    count: (k) => st.count(k),
    level: (cat) => st.level(cat),
    pick(items) { const got = {}; for (const k in items) { const q = st.take(k, items[k]); if (q > 0) got[k] = q; } return got; },
    restock(items) { const refused = {}; for (const k in items) { const q = Math.min(st.room(k), items[k]); if (q > 0) st.add(k, q); if (items[k] - q > 0) refused[k] = items[k] - q; } return refused; },
    bring(n) { for (let i = 0; i < n; i++) { const k = INFLOW[Math.floor(r() * INFLOW.length)]; if (st.room(k) > 0) st.add(k, 1); } },
    fill: () => { let a = 0, b = 0; for (const c of ['materials', 'food', 'goods', 'tools']) { a += st.total(c); b += CAPS[c]; } return a / b; },
  };
  return D;
}

export class LabDepot {
  constructor(scene, depot) {
    this.scene = scene; this.depot = depot;
    const D = WORLD.v42.depot;
    const [x, y] = L4(D.i, D.j);
    this.x = x; this.y = y;
    this.def = Assets.def(KEY) || {};
    const def = this.def, L = def.layers || {}, P = def.patches || {};
    this.lang = 'ko';
    this.layerKey = (name) => (name === 'nameplate_<lang>' ? (def.nameplates && def.nameplates[this.lang]) || L.nameplate_ko : L[name] || P[name] || null);
    this.order = (def.layerOrder || []).slice();
    this.imgs = {};
    this.stockIndex = this.order.indexOf('<stock>');
    this.order.forEach((name, i) => {
      if (name[0] === '<') return;
      const k = this.layerKey(name);
      if (!k || !Assets.has(k)) return;
      this.imgs[name] = Assets.image(scene, x, y, k).setDepth(y + 0.01 * i);
    });
    this.props = [];
    for (const pr of def.outdoorProps || []) if (Assets.has(pr.sprite)) this.props.push(Assets.image(scene, x + pr.point[0], y + pr.point[1], pr.sprite).setDepth(y + pr.point[1]));
    this.always = new Set((def.alwaysDrawn || []).concat(['shell', 'apron']));
    this.alpha = 0; this.revealed = false; this.camReveal = false; this.labReveal = false;
    this.rackImgs = []; this.rackVer = -1; this.rackT = 0;
    this.shown = null;
    this.ready = true;
    this.apply();
  }

  /** (Integration G-P4) the racks draw what 금방's shownStock() says (the stock + the lines not picked yet) */
  setShown(fn) { this.shown = fn; this.rackVer = -1; }

  update(dt) {
    const want = this.labReveal || this.camReveal;
    this.revealed = want;
    const ms = Number(this.def.reveal && this.def.reveal.fadeMs) || 350;
    const target = want ? 1 : 0;
    if (this.alpha !== target) { this.alpha = target > this.alpha ? Math.min(1, this.alpha + (dt * 1000) / ms) : Math.max(0, this.alpha - (dt * 1000) / ms); this.apply(); }
    this.rackT -= dt;
    const st = (this.shown && this.shown()) || this.depot.stock;
    if (this.alpha > 0.05 && this.rackT <= 0) { this.rackT = 0.5; if (st.ver !== this.rackVer) this.drawRacks(st); }
    for (const im of this.rackImgs) if (im.__on && im.visible !== this.alpha > 0.05) im.setVisible(this.alpha > 0.05);
  }

  apply() {
    const a = this.alpha;
    for (const name in this.imgs) {
      const img = this.imgs[name];
      if (name === 'shell') img.setAlpha(1 - a);
      else if (name === 'shadow_open') img.setVisible(a > 0.02).setAlpha(a);
      else if (name === 'shell_cut') img.setVisible(false);
      else if (this.always.has(name)) img.setVisible(true);
      else img.setVisible(a > 0.02);
    }
  }

  drawRacks(stock) {
    const def = this.def, sc = this.scene;
    this.rackVer = stock.ver;
    const geo = { slots: def.rackSlots || [], items: Assets.m.sprites };
    const fill = rackFill(geo, stock);
    const scale = def.stockScale || {};
    let n = 0;
    const base = this.y + 0.01 * (this.stockIndex >= 0 ? this.stockIndex : 5);
    for (const f of fill) {
      const s = geo.slots[f.slot];
      if (!f.key || !s || !Assets.has(f.key)) continue;
      const it = Assets.def(f.key) || {}, k = Number(scale[s.category]) || 0.85, step = (Number(it.stackStep) || 20) * k;
      for (const q of f.stacks.slice().sort((a, b) => a.u - b.u)) {
        const px = this.x + s.point[0] + s.spanPx[0] * q.t + s.depthPx[0] * q.u, py = this.y + s.point[1] + s.spanPx[1] * q.t + s.depthPx[1] * q.u;
        for (let c = 0; c < q.n && c * step <= (s.maxStackPx || 40); c++) {
          let im = this.rackImgs[n];
          if (!im) { im = Assets.image(sc, 0, 0, f.key); this.rackImgs[n] = im; }
          if (im.__k !== f.key) { Assets.apply(im, f.key); im.__k = f.key; }
          im.setScale(k).setPosition(px, py - c * step).setDepth(base + (s.drawOrder || 0) * 1e-4 + c * 1e-6).setVisible(this.alpha > 0.05);
          im.__on = true;
          n++;
        }
      }
    }
    for (let q = n; q < this.rackImgs.length; q++) { this.rackImgs[q].setVisible(false); this.rackImgs[q].__on = false; }
    this.rackN = n;
  }

  destroy() { for (const k in this.imgs) this.imgs[k].destroy(); for (const im of this.rackImgs.concat(this.props)) im.destroy(); }
}
