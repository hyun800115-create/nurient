// The beach's static picture (docs/v5_v8_plan.md §6.5 view/Beach): the beachfront buildings (overlays at d + 1, the
// pool deck over its Water.js pool region at d − 0.5), the props by what is open (parasols flutter, palms sway, the
// buoy line bobs in sync on the swell, the raft, castles by stage, the ice-cream cart's bell, the lifeguard tower and
// its front overlay), blank boards with their Korean / English text, the clean-up bits before the beach opens.
// Things pop in (a small bounce) when they appear during play; on load they are simply there.

import { art } from './art.js';
import { DEPTH } from '../../systems/DepthSort.js';
import { FONT } from '../../data/strings.js';
import { LR, ROW1, ROW2, GATE, PROPS, buoyTiles, HOTEL, POOL } from '../layout.js';
import { bt } from '../strings.js';

const BUILT = ROW1.concat(ROW2, [GATE]);

export class Beach {
  constructor(view) {
    this.v = view;
    this.scene = view.scene;
    this.items = new Map();          // id -> { img, over, text, key, x, y, kind }
    this.bits = new Map();           // clean-up bits
    this.first = true;
    this.poolWater = null;
    this.flying = null;              // P12: the parasol id that is in the air
  }
  ok(need) { return this.v.ok(need); }

  /** create what is open now (called when the model's steps / shops change) */
  sync() {
    const pop = !this.first;
    for (const b of BUILT) {
      const need = b.shop ? 'shop:' + b.shop : b.need || 'open';
      if (!this.items.has(b.id) && this.ok(need)) this.addBuilding(b, pop);
    }
    for (const p of PROPS) if (p.layer !== 'decal' && !this.items.has(p.id) && this.ok(p.need)) this.addProp(p, pop);
    if (this.ok('open') && !this.items.has('buoys')) this.addBuoys(pop);
    this.syncBits();
    this.first = false;
  }

  addBuilding(b, pop) {
    const S = this.scene, [x, y] = LR(b.i, b.j), def = art.def(b.key);
    const img = art.make(S, b.key, x, y);
    if (!img) return;
    img.setDepth(y);
    const it = { img, key: b.key, x, y, kind: 'building', b };
    if (def.anims && def.anims.work) art.loop(img, b.key, 'work', { start: (x >> 3) % 4 });
    if (def.overlay && art.has(def.overlay)) it.over = art.image(S, def.overlay, x, y).setDepth(y + 1);
    if (b.board) it.text = this.board(b.board, x, y, def, y + 1.5);
    if (b.key === 'hotel_pool') this.makePool(it);
    this.items.set(b.id, it);
    if (pop) this.pop([img, it.over, it.text].filter(Boolean));
    this.v.night && this.v.night.addLights(b.id, b.key, x, y);
  }

  /** the pool water goes UNDER the deck (land over water): Water.js 'pool' region, or the baked fallback loop */
  makePool(it) {
    const def = art.def('hotel_pool'), x = it.x, y = it.y;
    const W = this.v.ports.water;
    if (W && W.region && def.waterRegion && def.waterPolyFlat) {
      const r = def.waterRegion;
      const poly = def.waterPolyFlat.map((v, k) => (k % 2 ? v + y : v + x));
      try {
        it.water = W.region({ region: { x: x + r[0], y: y + r[1], w: r[2] - r[0], h: r[3] - r[1] }, mask: { water: [poly] }, waterPx: def.waterPx || 0,
          defaultShore: def.waterShore || 'quay', palette: def.waterPalette || 'pool', openSea: false, depth: y - 0.5, shoreDepth: y - 0.45, name: 'pool' });
      } catch (e) { it.water = null; }
    }
    if (!it.water || !it.water.isShader) {
      if (it.water && it.water.destroy) { it.water.destroy(); it.water = null; }
      const w = art.sprite(this.scene, 'hotel_pool_water', x, y);
      if (w) { w.setDepth(y - 0.5); art.loop(w, 'hotel_pool_water', 'ripple') || art.loop(w, 'hotel_pool_water', 'work'); it.under = w; }
    }
    this.poolWater = it.water || null;
  }

  addProp(p, pop) {
    const S = this.scene, def = art.def(p.key);
    const key = p.stages ? 'sandcastle_build_' + (this.v.model.castles[p.id] ? this.v.model.castles[p.id].stage : 0) : p.key;
    const [x, y] = LR(p.i, p.j);
    const img = p.key === 'beach_shower' || p.key === 'icecream_cart' ? art.sprite(S, key, x, y) : art.make(S, key, x, y);
    if (!img) return;
    img.setDepth(y);
    const it = { img, key: p.key, x, y, kind: p.layer === 'water' ? 'water' : 'prop', p, stage: -1 };
    const anim = def.anims ? (def.anims.flutter ? 'flutter' : def.anims.sway ? 'sway' : def.anims.bob ? 'bob' : def.anims.twinkle ? 'twinkle' : def.anims.grill ? 'grill' : null) : null;
    if (anim) art.loop(img, p.key, anim, { start: Math.abs((x * 7 + y * 3) >> 4) % 4 });
    if (def.overlay && art.has(def.overlay)) it.over = art.image(S, def.overlay, x, y).setDepth(y + 1);
    if (p.text) it.text = this.board(p.text, x, y, def, y + 0.6);
    this.items.set(p.id, it);
    if (pop && it.kind !== 'water') this.pop([img, it.over, it.text].filter(Boolean));
    this.v.night && this.v.night.addLights(p.id, p.key, x, y);
  }

  addBuoys(pop) {
    const imgs = [];
    for (const t of buoyTiles()) {
      const [x, y] = LR(t.i, t.j);
      const img = art.sprite(this.scene, t.key, x, y);
      if (!img) continue;
      img.setDepth(y);
      art.loop(img, t.key, 'bob', { start: 0 });       // the travelling wave plays IN SYNC on every tile
      imgs.push({ img, x, y });
    }
    this.items.set('buoys', { kind: 'buoys', list: imgs });
    void pop;
  }

  /** a blank board's text, centred on its fxPoints.boardCentre / board */
  board(key, x, y, def, depth) {
    const fx = def.fxPoints || {};
    const c = fx.boardCentre || fx.board;
    if (!c) return null;
    const lang = this.v.lang();
    const big = key === 'boardHotel' || key === 'boardGate';
    const t = this.scene.add.text(x + c[0], y + c[1], bt(lang, key), { fontFamily: FONT, fontSize: big ? '19px' : '13px', fontStyle: '900', color: key === 'boardHotel' ? '#fff6d8' : '#7a4320',
      stroke: key === 'boardHotel' ? '#8a3d1c' : '#fff8ec', strokeThickness: big ? 4 : 3, align: 'center' }).setOrigin(0.5, 0.5).setDepth(depth);
    t.setResolution && t.setResolution(2);
    return t;
  }

  pop(list) {
    for (const o of list) {
      const sy = o.scaleY || 1;
      o.setScale(o.scaleX * 0.86, sy * 0.86).setAlpha(0);
      this.scene.tweens.add({ targets: o, scaleX: o.scaleX / 0.86, scaleY: sy, alpha: 1, duration: 420, ease: 'Back.easeOut' });
    }
  }

  /** clean-up bits (seaweed decals and driftwood) on the sand until the clean-up is done */
  syncBits() {
    const m = this.v.model;
    if (m.stepDone('cleanup')) { for (const b of this.bits.values()) if (b) b.destroy(); this.bits.clear(); return; }
    if (!m.stepDone('reveal') && !m.stepDone('path')) return;
    for (const b of m.cleanupBits()) {
      const have = this.bits.get(b.k);
      if (b.picked) { if (have) { this.scene.tweens.add({ targets: have, y: have.y - 30, alpha: 0, scaleX: 0.4, scaleY: 0.4, duration: 300, onComplete: () => have.destroy() }); this.bits.set(b.k, null); } continue; }
      if (have !== undefined) continue;
      const img = art.image(this.scene, b.key, b.x, b.y);
      if (!img) continue;
      img.setScale(b.key === 'decal_seaweed' ? 0.5 : 0.62).setDepth(b.key === 'decal_seaweed' ? DEPTH.GROUND_DECAL : b.y);
      this.bits.set(b.k, img);
    }
  }

  // ------------------------------------------------------------------------------------------ per frame
  update(dt, T) {
    const m = this.v.model, W = this.v.sea, wt = W ? W.t : T;
    // buoys and the raft ride the swell
    const bu = this.items.get('buoys');
    if (bu && W) for (const b of bu.list) b.img.y = b.y - W.heightAt(b.x, b.y, wt);
    for (const it of this.items.values()) {
      if (it.kind === 'water' && W) it.img.y = it.y - W.heightAt(it.x, it.y, wt);
      if (it.p && it.p.stages) {
        const c = m.castles[it.p.id], st = c ? c.stage : 0;
        if (st !== it.stage) { if (it.stage >= 0 && st > it.stage) this.v.fx.puff(it.x, it.y - 8); it.stage = st; art.apply(it.img, 'sandcastle_build_' + st); }
      }
    }
    // the shower runs while someone stands under it
    const sh = this.items.get('shower_1');
    if (sh) { const on = m.slots.of('shower').some((s) => s.prop === 'shower_1' && s.by); if (on !== !!sh.on) { sh.on = on; if (on) art.loop(sh.img, 'beach_shower', 'water'); else { sh.img.anims && sh.img.anims.stop(); art.apply(sh.img, 'beach_shower'); } } }
    // P12: the parasol in the air is drawn by the happening; hide the standing one
    if (this.flying !== this.hidden) {
      if (this.hidden && this.items.get(this.hidden)) this.items.get(this.hidden).img.setVisible(true);
      this.hidden = this.flying;
      if (this.hidden && this.items.get(this.hidden)) this.items.get(this.hidden).img.setVisible(false);
    }
  }

  /** the cart's bell swings (and rings on bellFrames) for a moment */
  ringCart() {
    const it = this.items.get('cart');
    if (!it) return;
    art.loop(it.img, 'icecream_cart', 'bell');
    if (it.bellT) it.bellT.remove();
    it.bellT = this.scene.time.delayedCall(1300, () => { if (it.img.anims) it.img.anims.stop(); art.apply(it.img, 'icecream_cart'); });
  }

  item(id) { return this.items.get(id); }
  count() { let n = 0; for (const it of this.items.values()) n += it.list ? it.list.length : 1 + (it.over ? 1 : 0) + (it.text ? 1 : 0) + (it.under ? 1 : 0); return n + this.bits.size; }

  destroy() {
    for (const it of this.items.values()) {
      if (it.list) for (const b of it.list) b.img.destroy();
      for (const k of ['img', 'over', 'text', 'under']) if (it[k]) it[k].destroy();
      if (it.water && it.water.destroy) it.water.destroy();
    }
    this.items.clear();
    for (const b of this.bits.values()) if (b) b.destroy();
    this.bits.clear();
  }
}
