// BeachView (beach_runtime, docs/v5_v8_plan.md §6.5): the Phaser side of 햇살 해변. It reads the pure model every
// frame and owns nothing the save needs. Parts: Sand (bake hook), Beach (buildings + props), Beachgoers (people),
// Boats (+ crabs), Night (glows), Fx, Happenings (P9–P12), PolarSwim (C13), Reveal (E7). The tropical sea is a Water.js
// region (ports.water.region: palette 'tropical', shore 'sand', the rocky point 'rock'); the hotel pool another one.

import { Sand } from './Sand.js';
import { Beach } from './Beach.js';
import { Beachgoers } from './Beachgoers.js';
import { Boats } from './Boats.js';
import { Night } from './Night.js';
import { Fx } from './Fx.js';
import { Happenings } from './Happenings.js';
import { PolarSwim } from './PolarSwim.js';
import { Reveal } from './Reveal.js';
import { px2L, sandCell, wetCell, seaRegion, landPoly, shoreTypes, LR, placePos, HOTEL } from '../layout.js';
import { stream } from '../model/rng.js';

export class BeachView {
  constructor(host, ports) {
    this.host = host;
    this.ports = ports;
    this.model = host.model;
    this.scene = ports.world.scene;
    this.T = host.T();
    this.later = [];
    this.sound = this.makeSound();
    this.fx = new Fx(this);
    this.night = new Night(this);
    this.sand = new Sand(this.scene, (need) => this.model.ok(need));
    if (ports.ground && ports.ground.bakeHook) this.hook = ports.ground.bakeHook((ctx, x0, y0, w, h) => this.sand.paint(ctx, x0, y0, w, h), this.sand.rect);
    this.sandSig = this.sand.signature();
    this.sea = null;
    this.makeSea();
    this.beach = new Beach(this);
    this.goers = new Beachgoers(this);
    this.boats = new Boats(this);
    this.happen = new Happenings(this);
    this.polar = new PolarSwim(this);
    this.reveal = new Reveal(this);
    this.beach.sync();
    this.stepT = 0;
    this.chiefLast = null;
  }

  ok(need) { return this.model.ok(need); }
  lang() { return this.ports.lang ? this.ports.lang() : 'ko'; }
  viewRect() { const V = this.ports.view; return V && V.rect ? V.rect() : { x: 0, y: 0, w: 99999, h: 99999 }; }

  /** the warm sea in front of the beach (P23: the game owns the region; the module asks for it) */
  makeSea() {
    const W = this.ports.water;
    if (!W || !W.region) return;
    try {
      this.sea = W.region({ name: 'tropical', region: seaRegion(), mask: { land: [{ poly: landPoly(), waterPx: 0 }] }, shoreTypes: shoreTypes(), defaultShore: 'sand', palette: 'tropical' });
    } catch (e) { this.sea = null; }
  }

  makeSound() {
    const S = this.ports.sound || {}, R = stream(this.model.seed, 'snd');
    const pick = (key) => { const g = S.group ? S.group(key) : null; return g && g.length ? g[R.int(g.length)] : key; };
    return {
      play: (key, vol = 1) => { if (S.play) S.play(pick(key), { volume: vol }); },
      at: (key, x, y, vol = 1) => { if (S.at) S.at(pick(key), x, y, { volume: vol }); else if (S.play) S.play(pick(key), { volume: vol }); },
      amb: (key, vol) => { if (S.amb) S.amb(key, vol); },
    };
  }

  // ------------------------------------------------------------------------------------------ model events
  onModel(ev) {
    const L = this.later, T = this.T;
    switch (ev.t) {
      case 'beach:step':
        this.beach.sync();
        if (ev.step === 'reveal') this.reveal.start();
        if (ev.step === 'lifeguard') this.sound.play('sfx_lifeguard_whistle', 0.6);
        break;
      case 'beach:shop': if (ev.op === 'open') this.beach.sync(); break;
      case 'beach:extras': this.beach.sync(); break;
      case 'beach:clean': this.beach.syncBits(); this.sound.at('sfx_pop', ev.x, ev.y, 0.6); this.fx.flash(ev.x, ev.y - 10); break;
      case 'beach:treat': {
        this.beach.ringCart();
        this.goers.flash(ev.vid, 'happy', 1.1, 'SW');
        this.fx.emote(ev.key || 'emote_star', ev.x, ev.y, 1.6, 74);
        const cart = this.beach.item('cart');
        if (cart) { this.sound.at('sfx_icecream_bell', cart.x, cart.y, 0.55); this.fx.coins(cart.x, cart.y, ev.coins); }
        break;
      }
      case 'beach:whistle': L.push({ t: ev.at, fn: () => this.whistle(ev.vid) }); break;
      case 'beach:emote': L.push({ t: ev.at || T, fn: () => { const p = this.goers.posOf(ev.vid); if (p) this.fx.emote(ev.key, p.x, p.y, 2); } }); break;
      case 'beach:fx': if (ev.kind === 'photo') L.push({ t: ev.at, fn: () => { this.fx.flash(ev.x, ev.y); this.sound.at('sfx_pop', ev.x, ev.y, 0.4); } }); break;
      case 'beach:checkin': { const [x, y] = LR(HOTEL.i, HOTEL.j); this.sound.at('sfx_hotel_bell', x, y, 0.6); break; }
      case 'beach:event': this.event(ev); break;
      case 'beach:happening':
        if (ev.op === 'start') this.happen.start(ev);
        if (ev.op === 'end') this.happen.stop();
        if (ev.op === 'catch') { this.fx.emote('emote_star', ev.x, ev.y, 2.2, 110); this.sound.play('sfx_pop', 0.8); }
        break;
      case 'beach:castle': if (ev.stage === 3) { const it = this.beach.item(ev.id); if (it) this.fx.emote('emote_sparkle', it.x, it.y, 1.6, 60); } break;
      default: break;
    }
  }

  whistle(vid) {
    const tower = this.beach.item('tower');
    if (tower) { this.sound.at('sfx_lifeguard_whistle', tower.x, tower.y - 90, 0.8); this.fx.emote('emote_exclaim', tower.x - 16, tower.y - 90, 1.6, 100); }
    const g = this.model.staff(this.T).find((s) => s.role === 'lifeguard' && s.at === 'tower');
    if (g) this.goers.flash('s:' + g.id, 'wave', 1.6, 'SW');
    const p = this.goers.posOf(vid);
    if (p) this.fx.emote('emote_sweat', p.x, p.y, 1.8, 48);
  }

  event(ev) {
    if (ev.kind === 'polar' && ev.op === 'start') { const a = this.model.events.active; if (a) this.polar.start(a); const V = this.ports.view; const p = placePos('polar'); if (V && V.focus) V.focus(p.x, p.y - 40, 1500); }
    if (ev.kind === 'polar' && ev.op === 'end') { this.polar.stop(); const V = this.ports.view; if (V && V.focus) V.focus(null); }
    if (ev.kind === 'fireworks' && ev.op === 'start') {
      const a = this.model.events.active;
      if (a) for (const b of a.data.bursts) { const [x, y] = LR(b.i, b.j); this.later.push({ t: b.t, fn: () => this.fx.firework({ x, y, h: b.h, kind: b.kind, col: b.col, big: b.big }, this.T, this.sea) }); }
    }
    if (ev.kind === 'contest' && ev.op === 'judge') for (const c of ev.castles) { const it = this.beach.item(c); if (it) this.fx.emote('emote_question', it.x, it.y, 6, 70); }
    if (ev.kind === 'contest' && ev.op === 'winner') { const it = this.beach.item(ev.castle); if (it) { this.fx.emote('emote_star', it.x, it.y, 3, 76); this.fx.flash(it.x, it.y - 30); } this.sound.play('sfx_beach_kids', 0.8); }
  }

  /** the designer preview menu (§5.8): 해변 하루 · 북극곰 수영 */
  preview(kind) {
    const api = this.host.api, V = this.ports.view;
    if (kind === 'polar') return api.event('polar');
    if (kind === 'day') { const p = placePos('beach'); if (V && V.focus) V.focus(p.x, p.y, 1200); return api.happening('P12') || api.happening('P11'); }
    return null;
  }

  siteOffered(def) { void def; }

  // ------------------------------------------------------------------------------------------ per frame
  update(dt, T) {
    this.T = T;
    if (this.later.length) { const due = this.later.filter((x) => x.t <= T); if (due.length) { this.later = this.later.filter((x) => x.t > T); for (const d of due) d.fn(); } }
    const sig = this.sand.signature();
    if (sig !== this.sandSig) { this.sandSig = sig; if (this.ports.ground && this.ports.ground.invalidate) this.ports.ground.invalidate(this.sand.rect); this.beach.sync(); }
    this.beach.update(dt, T);
    this.goers.update(dt, T);
    this.boats.update(dt, T);
    this.night.update(dt, T);
    this.happen.update(dt, T);
    this.polar.update(dt, T);
    this.reveal.update(dt, T);
    this.fx.update(dt, T);
    this.chiefSteps(dt);
    this.ambience();
  }

  /** sand steps for the chief on the beach (wet steps on the wet band) */
  chiefSteps(dt) {
    const C = this.ports.chief;
    if (!C || !C.x) return;
    const x = C.x(), y = C.y(), l = this.chiefLast;
    this.chiefLast = { x, y };
    if (!l) return;
    const v = Math.hypot(x - l.x, y - l.y) / Math.max(1e-3, dt);
    if (v < 25) { this.stepT = 0.12; return; }
    const [i, j] = px2L(x, y), ci = Math.floor(i), cj = Math.floor(j);
    if (!sandCell(ci, cj)) return;
    this.stepT -= dt;
    if (this.stepT <= 0) { this.stepT = 0.31; this.sound.play(wetCell(ci, cj) ? 'sfx_sand_step_wet' : 'sfx_sand_step', 0.5); }
  }

  /** the beach ambience follows how much of the beach is in view */
  ambience() {
    const r = this.viewRect(), [i, j] = px2L(r.x + r.w / 2, r.y + r.h / 2);
    const near = i > 86 && i < 126 && j < -2 && j > -28 ? 1 : i > 80 && j < 2 ? 0.4 : 0;
    if (near !== this.ambNear) { this.ambNear = near; this.sound.amb('amb_beach', 0.7 * near); if (this.ports.sound && this.ports.sound.area) this.ports.sound.area(near >= 1 && this.model.stepDone('reveal') ? 'beach' : null); }
  }

  objects() { return this.beach.count() + this.goers.count() + this.boats.count() + this.night.count() + this.fx.count() + this.happen.count() + this.polar.count(); }

  destroy() {
    for (const p of [this.happen, this.polar, this.reveal, this.goers, this.boats, this.night, this.fx, this.beach]) p.destroy();
    if (this.hook && this.ports.ground && this.ports.ground.removeHook) this.ports.ground.removeHook(this.hook);
    if (this.sea && this.sea.destroy && this.ports.water && this.ports.water.owned) this.sea.destroy();
  }
}
