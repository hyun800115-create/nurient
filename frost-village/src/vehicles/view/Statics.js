// Statics (vehicles_runtime view): what stands still — stops (썰매 정류장 → 버스 정류장, pole signs), the depots
// (마구간 차고지 → 주유소 in place, 버스 차고지 with its doors), 서리 화물장 (a pad and stacked crates), the traffic
// lights at the 도시 junction, the parking lot. Rebuilt when something is built or the era turns; the lights and
// the depot doors update every frame.

import { Assets } from '../../core/Assets.js';
import { DEPTH } from '../../systems/DepthSort.js';
import { L } from '../layout.js';

const TXT = (size, color = '#2b2f3a', stroke = '#ffffff', st = 5) => ({ fontFamily: 'Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif', fontSize: size + 'px', fontStyle: '900', color, stroke, strokeThickness: st, resolution: 2 });

export class Statics {
  constructor(view) {
    this.view = view;
    this.scene = view.scene;
    this.items = [];          // every display object
    this.lights = [];         // { img, base, node, axis }
    this.doors = null;        // the bus depot image (door frames)
    this.doorT = 0;
    this.labels = [];
  }

  /** (re)make everything for the model's built state and era */
  build() {
    this.clear();
    const m = this.view.host.model, lay = m.layout, sc = this.scene, era = m.era;
    const put = (key, x, y, depth) => {
      if (!Assets.has(key)) return null;
      const im = Assets.image(sc, x, y, key).setDepth(depth !== undefined ? depth : y);
      this.items.push(im);
      return im;
    };
    // stops
    for (const id in lay.STOPS) {
      if (!m.stopBuilt(id)) continue;
      const s = lay.STOPS[id];
      if (s.sign === 'shelter') put(era >= 3 ? 'bus_stop' : 'sleigh_stop', s.x, s.y);
      else if (s.sign === 'pole') put('road_sign_round', s.x, s.y);
      else if (s.sign === 'town' && era >= 3) { const [x, y] = L(s.at[0] + 1.1, s.at[1] - 0.9); put('road_sign_rect', Math.round(x), Math.round(y)); }
      this.label(id, s);
    }
    // depots
    const B = lay.BUILDINGS;
    if (m.built.depot) put(era >= 3 ? 'fuel_depot' : 'stable_depot', B.stable.x, B.stable.y);
    if (era >= 3 && m.built.busDepot) { this.doors = put('bus_depot', B.busDepot.x, B.busDepot.y); }
    // the freight yard: a trodden pad, crates and a barrel (the v4 props; the harbour's crate_stack comes with v6)
    if (m.built.yard) {
      const Y = B.yard;
      const pad = sc.add.graphics().setDepth(DEPTH.GROUND_DECAL + 5);
      pad.fillStyle(0x8a6b4e, 0.28); pad.fillEllipse(Y.x, Y.y + 4, 230, 112);
      pad.lineStyle(4, 0xffffff, 0.55); pad.strokeEllipse(Y.x, Y.y + 4, 230, 112);
      this.items.push(pad);
      for (const [dx, dy, k, s] of [[-58, -6, 'crate', 0.9], [-24, 12, 'crate', 0.95], [-44, -26, 'crate', 0.8], [38, -8, 'barrel', 0.85], [62, 10, 'crate', 0.8]]) { const im = put(k, Y.x + dx, Y.y + dy); if (im) im.setScale(s); }
      this.label('yard', Y);
    }
    // the parking lot (a ground piece)
    if (era >= 3 && m.built.lot) put(lay.PARKING.lot.key, lay.PARKING.lot.x, lay.PARKING.lot.y, DEPTH.GROUND_DECAL + 2);
    // traffic lights
    if (era >= 3) for (const Lt of lay.LIGHTS) {
      const node = 'n' + Math.round(Lt.node[0] * 20) + ',' + Math.round(Lt.node[1] * 20);
      for (const p of Lt.poles) {
        const [x, y] = L(p.at[0], p.at[1]);
        const im = put(p.key, Math.round(x), Math.round(y));
        if (im) this.lights.push({ img: im, base: p.key, node, axis: p.axis });
      }
    }
  }

  /** a small name board over a stop / the yard (easy Korean / English) */
  label(id, s) {
    const m = this.view.host.model, lang = this.view.host.lang();
    const st = m.layout.STOPS[id];
    const name = st ? st.name[lang] || st.name.ko : (m.layout.PLACES['p:yard'].name[lang] || '서리 화물장');
    const t = this.scene.add.text(s.x, s.y - (st && st.sign === 'pole' ? 160 : 190), name, TXT(20)).setOrigin(0.5, 1).setDepth(DEPTH.FX - 40).setAlpha(0.95);
    this.items.push(t); this.labels.push(t);
  }

  /** the bus depot doors stand open for a moment when a bus goes in or out */
  openDoors(s = 2.5) { this.doorT = Math.max(this.doorT, s); }

  update(dt) {
    const m = this.view.host.model, T = m.T;
    for (const L2 of this.lights) {
      const st = m.sim.lightState(L2.node, L2.axis, T);
      const key = L2.base + (st === 'g' ? '_green' : st === 'y' ? '_yellow' : '_red');
      if (L2.cur !== key && Assets.has(key)) { Assets.apply(L2.img, key); L2.cur = key; }
    }
    if (this.doors) {
      this.doorT -= dt;
      const want = this.doorT > 0 ? 'bus_depot_open' : 'bus_depot';
      if (this.doors.__state !== want && Assets.has(want)) { Assets.apply(this.doors, want); this.doors.__state = want; }
    }
    // name boards only when the camera is close enough to read them
    const z = this.view.zoom();
    for (const t of this.labels) t.setVisible(z >= 0.7).setScale(1 / Math.max(0.7, z));
  }

  clear() { for (const o of this.items) o.destroy(); this.items = []; this.lights = []; this.labels = []; this.doors = null; }
  objects() { return this.items.length; }
  destroy() { this.clear(); }
}
