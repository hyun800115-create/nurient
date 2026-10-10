// C13 북극곰 수영 대회 (the designer's own idea, docs/v5_v8_plan.md §6.5): at OUR snowy village coast, residents in
// swimsuits run into the winter sea, swim with chattering teeth (emote_cold), splash out shivering, and the bundled-up
// crowd claps and cheers. Timeline from the model (gather → countdown → run → swim → out → shiver → end). The
// swimmers are beachfolk swimsuit looks; the crowd wears winter townsfolk clothes. Water: the village sea
// (ports.water.village(): heightAt / ripple), the winter palette.

import { polarSpot } from '../layout.js';
import { stream } from '../model/rng.js';

export class PolarSwim {
  constructor(view) {
    this.v = view;
    this.cur = null;
  }

  start(a) {
    this.stop();
    const m = this.v.model, D = this.v.ports.dolls, R = stream(m.seed, 'polar:' + Math.floor(a.t0));
    if (!D || !D.rig) return;
    const P = polarSpot();
    const n = a.data.swimmers || 6, swimmers = [], crowd = [];
    for (let k = 0; k < n; k++) {
      const person = m.looks.make(k % 3 === 2 ? 'family_beach' : 'swimmer', R);
      const rig = D.rig(person, 'polar:s' + k);
      if (!rig) continue;
      const x = P.x - 130 + k * 52 + R.range(-8, 8);
      swimmers.push({ rig, x, y: P.y - 18 + (k % 2) * 14, k, person, ring: false });
    }
    for (let k = 0; k < 9; k++) {
      const person = m.looks.townsperson ? m.looks.townsperson(R) : m.looks.make('beach_tourist', R);
      const rig = D.rig(person, 'polar:c' + k);
      if (!rig) continue;
      crowd.push({ rig, x: P.x - 190 + k * 48 + R.range(-6, 6), y: P.y + 64 + (k % 3) * 16, k });
    }
    this.cur = { a, P, swimmers, crowd, said: {} };
  }

  stop() {
    const c = this.cur;
    if (!c) return;
    for (const s of c.swimmers) s.rig.release();
    for (const s of c.crowd) s.rig.release();
    this.cur = null;
  }

  update(dt, T) {
    const c = this.cur;
    if (!c) return;
    const tl = c.a.data.timeline, P = c.P, W = this.v.ports.water && this.v.ports.water.village ? this.v.ports.water.village() : null;
    if (T > tl.end + 2) { this.stop(); return; }
    const shoreY = P.shoreY;
    for (const s of c.swimmers) {
      let x = s.x, y = s.y, anim = 'idle', dir = 'S', bob = 0, depth = s.y;
      const lag = s.k * 0.18;
      if (T < tl.run + lag) { anim = T > tl.countdown ? (Math.floor((T + s.k) * 2) % 2 ? 'happy' : 'idle') : 'idle'; dir = 'N'; }
      else if (T < tl.swim + lag) { const f = (T - tl.run - lag) / (tl.swim - tl.run); anim = 'walk'; dir = 'N'; y = s.y + (shoreY + 6 - s.y) * Math.min(1, f); }
      else if (T < tl.out) { const f = Math.min(1, (T - tl.swim - lag) / 3); anim = this.v.model.looks.pickAnim(s.person, 'swim'); dir = ['N', 'NE', 'N', 'NE', 'N', 'NE'][s.k % 6]; y = shoreY + 6 + (P.shoreY + this.swimDy() - shoreY - 6) * f + Math.sin(T * 2 + s.k) * 4; x = s.x + Math.sin(T * 1.3 + s.k) * 8; if (W) bob = W.heightAt(x, y, W.t); depth = y; }
      else if (T < tl.shiver) { const f = Math.min(1, (T - tl.out) / (tl.shiver - tl.out)); anim = 'walk'; dir = 'S'; y = shoreY + this.swimDy() + (s.y - shoreY - this.swimDy()) * f; }
      else { anim = 'idle'; dir = 'S'; x = s.x + Math.sin(T * 38 + s.k) * 1.2; }        // shivering
      s.rig.show(anim, dir);
      s.rig.at(x, y - bob, depth);
      s.rig.visible(true);
      s.rig.update(dt * 1000);
      if (T >= tl.swim + 1.5 + s.k * 0.4 && !c.said['c' + s.k]) { c.said['c' + s.k] = 1; this.v.fx.emote('emote_cold', x, y, 2.4, 60); if (W && W.ripple) W.ripple(x, y, 1.2); }
      if (T >= tl.shiver + 0.5 + s.k * 0.3 && !c.said['s' + s.k]) { c.said['s' + s.k] = 1; this.v.fx.emote(s.k % 2 ? 'emote_cold' : 'emote_laugh', x, y, 2.4); }
      if (T >= tl.swim + lag && !c.said['sp' + s.k]) { c.said['sp' + s.k] = 1; this.v.fx.sheet('fx_splash_small', x, shoreY + 2, shoreY + 3, 0.9); this.v.sound.at('sfx_splash_beach', x, shoreY, 0.5); }
    }
    for (const s of c.crowd) {
      const cheer = (T > tl.run && T < tl.swim + 2) || T > tl.shiver;
      const anim = cheer ? (s.k % 3 === 0 ? 'happy' : 'clap') : (T > tl.countdown && s.k % 2 ? 'wave' : 'idle');
      s.rig.show(anim, s.k % 2 ? 'NE' : 'N');
      s.rig.at(s.x, s.y, s.y);
      s.rig.visible(true);
      s.rig.update(dt * 1000);
    }
    if (T >= tl.countdown && !c.said.go) { c.said.go = 1; this.v.sound.play('sfx_lifeguard_whistle', 0.7); }
  }
  swimDy() { return -54; }
  count() { const c = this.cur; return c ? (c.swimmers.length + c.crowd.length) * 12 : 0; }
  destroy() { this.stop(); }
}
