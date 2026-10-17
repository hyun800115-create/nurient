// (v4.2 CODE-2, docs/v42_plan.md §5.1, CONTRACT_V42 AK.2) the loops' live props from assets/train2 (on the flat car's
// page, resident with the train): the low snow fence along our loop's new straight (rail_fence_x tiles + the closing
// post; it replaces CODE-1's log-fence stand-in), the spring turnouts' switch stands (lamp green; yellow + 철컥 while a
// train trails through over the curve), the little water towers behind each loop (they pour while the engine rounds
// their loop), and the loop sounds: the soft wheel squeal while a car on screen is on a curve.
// Positions are the art's own place hints (manifest rail_loop_ours / rail_loop_town .placeHint, rail_fence_x.run).

import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { L4 } from '../data/world.js';

const POUR_S = 5;          // s the tower pours after the engine passed it

export class RailProps {
  constructor(gs, nb) {
    this.gs = gs;
    this.nb = nb;
    this.made = false;
    this.stands = [];
    this.towers = [];
    this.fence = [];
    this.squeal = false;
    this.pend = 0;
  }

  /** the train2 manifest + its flat car page are here (Assets.has on a prop frame) */
  ready() { return Assets.has('rail_switch_stand') && Assets.has('rail_fence_x'); }

  make() {
    if (this.made || !this.ready()) return false;
    this.made = true;
    const gs = this.gs, nb = this.nb;
    // CODE-1's log fence goes: the art's fence takes its place
    if (nb.logFence) { for (const im of nb.logFence) { if (im.__ob) im.__ob.active = false; im.destroy(); } nb.logFence = null; }
    const run = (Assets.def('rail_fence_x').run || {}).ours;
    if (run && run.worldPx) {
      for (const [x, y] of run.worldPx) this.fence.push(gs.staticImage('rail_fence_x', x, y, { r: 22, region: gs.territory.regionAt(x, y) }));
      if (run.endWorldPx) { const [x, y] = run.endWorldPx; this.fence.push(gs.staticImage('rail_fence_x_end', x, y, { r: 8, region: gs.territory.regionAt(x, y) })); }
    }
    const P = this.nb.rail.path;
    for (const [loop, sExit] of [['rail_loop_ours', P ? P.sMainSE : 0], ['rail_loop_town', P ? P.sMainNW : 0]]) {
      const hint = Assets.def(loop).placeHint || {};
      const sh = hint.rail_switch_stand;
      if (sh && sh.lattice) {
        const [x, y] = L4(sh.lattice[0], sh.lattice[1]);
        // (blockM 0.3: walkers keep off the lever)
        const img = gs.staticImage('rail_switch_stand', x, y, { r: Math.round((Number(sh.blockM) || 0.3) * 64), region: gs.territory.regionAt(x, y) });
        this.stands.push({ img, sExit, yellow: false, lamp: Assets.def('rail_switch_stand').lampPoint || [-4, -44] });
      }
      const wt = hint.rail_water_tower;
      if (wt && wt.lattice && Assets.has('rail_water_tower')) {
        const [x, y] = L4(wt.lattice[0], wt.lattice[1]);
        const img = gs.staticImage('rail_water_tower', x, y, { r: 40, region: gs.territory.regionAt(x, y) });
        const ov = Assets.image(gs, x, y, 'rail_water_tower').setDepth(y + 0.001).setVisible(false);
        if (gs.territory) gs.territory.add(gs.territory.regionAt(x, y), ov);
        // the tower pours while the engine rounds the semicircle in front of it
        const seg = P ? P.segs[loop === 'rail_loop_ours' ? 1 : 7] : null;
        this.towers.push({ img, ov, x, y, s0: seg ? seg.s0 : -1, s1: seg ? seg.s0 + seg.len : -1, pourT: 0 });
      }
    }
    return true;
  }

  update(dt) {
    if (!this.made) { if ((this.pend -= dt) <= 0) { this.pend = 1; this.make(); } return; }
    const gs = this.gs, rail = this.nb.rail, P = rail.path;
    if (!P) return;
    const running = rail.running, nose = rail.m, len = rail.length;
    // switch stands: yellow while the train trails through the turnout over the curve (nose past the loop's exit, the
    // tail not yet), 철컥 on each change
    for (const st of this.stands) {
      const ahead = P.wrap(nose - st.sExit);
      const y = running && ahead >= 0 && ahead <= len + 0.4;
      if (y !== st.yellow) {
        st.yellow = y;
        st.img.setFrame(y ? 'rail_switch_stand_idle_1' : 'rail_switch_stand_idle_0');
        if (gs.isOnScreen(st.img.x, st.img.y, 160)) Audio.play(Audio.exists('sfx_switch_clack') ? 'sfx_switch_clack' : 'sfx_click', { volume: 0.55 });
      }
    }
    // water towers: pour when the engine rounds their loop
    const sNose = P.wrap(nose);
    for (const tw of this.towers) {
      if (running && tw.s0 >= 0 && sNose >= tw.s0 && sNose <= tw.s1) tw.pourT = POUR_S;
      const was = tw.pouring;
      tw.pourT = Math.max(0, tw.pourT - dt);
      tw.pouring = tw.pourT > 0 && gs.isOnScreen(tw.x, tw.y, 300);
      if (tw.pouring !== was) {
        const d = Assets.def('rail_water_tower');
        tw.img.setFrame(tw.pouring ? d.pourBase || 'rail_water_tower_pour_base' : d.frame);
        const ak = Assets.spriteAnim('rail_water_tower', 'pour');
        if (tw.pouring && ak) { tw.ov.setVisible(true); if (tw.ov.play) tw.ov.play(ak); }
        else { tw.ov.setVisible(false); if (tw.ov.anims) tw.ov.anims.stop(); }
      }
    }
    // the soft flange squeal while the train rounds a loop on screen (audio7's steady 1.23 s loop, as an ambience bed:
    // it fades in and out with the curve)
    const tr = this.nb.train;
    const on = !!(tr && tr.onCurve);
    if (on !== this.squeal) { this.squeal = on; Audio.setAmbience('sfx_wheel_squeal', on ? 0.9 : 0); }
  }

  /** the switch stands' lamps at night (DayClock moving lights: green or yellow) */
  lightPoints(pts) {
    for (const st of this.stands) if (st.img.visible) pts.push({ x: st.img.x + st.lamp[0], y: st.img.y + st.lamp[1], k: 0.35, tint: st.yellow ? 0xffd34a : 0x7dffb0 });
  }

  destroy() { Audio.setAmbience('sfx_wheel_squeal', 0); this.squeal = false; }
}
