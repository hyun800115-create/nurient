// HarborView (harbor_runtime view, docs/v5_v8_plan.md §6.4): everything the player sees of 갈매기 항구, driven by the
// pure model through the host. Phaser only; the game reached through ports (docs/v5_v8_plan.md §5.3):
//
//   ports.world.scene                         the Phaser scene (required)
//   ports.view.rect() / zoom() / focus(x,y,ms)  camera (v4 gs.viewRect / gs.focusCamera)
//   ports.clock.T() / dark() / addLight(x,y,k)  DayClock (dark = the night tint's alpha 0..0.45)
//   ports.ground.bakeHook(fn, rect)           v4 Ground.addBakeHook (sea cut, apron, quay walls baked)
//   ports.water.region(opts)                  new Water(gs, opts) (else the view makes its own)
//   ports.dolls.make(look)                    paper-doll rigs { play, place, visible, update, setLook, destroy }
//   ports.fx.sheet / loop / burst / floatText v4 Effects
//   ports.sound.at / play / music             Audio, gs.sfxAt, music(area) (P15)
//   ports.say(x, y, text, dur)                (optional) the game's Bubbles; else a small own bubble
//   ports.collision.add(x, y, r, tag)         (optional) v4 gs.collision: building circles (layout.colliders)
//   ports.occluders.add(img)                  (optional) v4 x-ray occluders (gs.addOccluder)
//   ports.chief.x() / y()                     the music area, the pad hops
//   ports.assets.want(keys)                   (optional) Residency demand for ship pages
//
// Parts: Quays (bake + Water region), Statics, Fleet (ships), Crane, Lighthouse, Gulls, People, Pads, Reveal.

import { Water } from '../../systems/Water.js';
import { BLD, BERTHS, W, LR, REGIONS } from '../layout.js';
import { Quays, waterOpts } from './Quays.js';
import { Statics } from './Statics.js';
import { Fleet } from './Ship.js';
import { Crane } from './Crane.js';
import { Lighthouse } from './Lighthouse.js';
import { Gulls } from './Gulls.js';
import { People } from './People.js';
import { Pads } from './Pads.js';
import { Reveal } from './Reveal.js';
import { Bubble, glowTex, Assets, DEPTH } from './art.js';
import { ht } from '../strings.js';
import { hourOf } from '../model/time.js';

const GLOWS = 24;
const HARBOR_AREA = { x0: 5300, y0: 2900, x1: 10752, y1: 5000 };

export class HarborView {
  constructor(host, ports) {
    this.host = host;
    this.ports = ports;
    this.model = host.model;
    this.cfg = host.cfg;
    const sc = this.scene = ports.world.scene;
    this.t = 0; this.dt = 0; this.T = host.T(); this.dark = 0;
    this.rigFree = [];
    this.liveRigs = new Set();
    this.stats = { rigs: 0, ms: 0, n: 0 };
    this.timers = [];
    // ground: one bake hook (sea cut out, apron, quay walls, rocks, breakwater)
    this.quays = new Quays({ want: (k) => this.want(k) });
    const G = ports.ground;
    const hook = (ctx, x0, y0, w, h) => this.quays.paint(ctx, x0, y0, w, h);
    this.hook = G && G.bakeHook ? G.bakeHook(hook, this.quays.rect()) : G && G.addBakeHook ? G.addBakeHook(hook, this.quays.rect()) : null;
    // the sea: a Water region (harbor palette); the view updates it when it made it itself
    const man = sc.cache && sc.cache.json && sc.cache.json.exists('manifest_water') ? sc.cache.json.get('manifest_water') : null;
    try {
      if (ports.water && ports.water.region) { this.water = ports.water.region(waterOpts({ manifest: man })); this.ownWater = false; }
      else { this.water = new Water(sc, waterOpts({ manifest: man, quality: ports.water && ports.water.quality ? ports.water.quality() : 'high' })); this.ownWater = true; }
    } catch (e) { this.water = null; this.ownWater = false; }
    this.glows = [];
    this.glowN = 0;
    this.bubble = new Bubble(sc);
    this.statics = new Statics(this);
    this.fleet = new Fleet(this);
    this.crane = new Crane(this);
    this.lighthouse = new Lighthouse(this);
    this.gulls = new Gulls(this);
    this.people = new People(this);
    this.pads = new Pads(this);
    this.reveal = new Reveal(this);
    this.crane.refreshPile();
    this.area = null;
  }

  // ------------------------------------------------------------------------------------------ helpers (parts use these)
  lang() { return this.host.lang(); }
  rect() {
    const V = this.ports.view, r = V && V.rect ? V.rect() : null;
    if (!r) { const wv = this.scene.cameras.main.worldView; return wv; }
    if (r.width === undefined) return { x: r.x, y: r.y, width: r.right - r.x, height: r.bottom - r.y };
    return r;
  }
  near(x, y, m = 200) { const r = this._r || (this._r = this.rect()); return x > r.x - m && x < r.x + r.width + m && y > r.y - m && y < r.y + r.height + m; }
  zoom() { const V = this.ports.view; return V && V.zoom ? V.zoom() : this.scene.cameras.main.zoom; }
  dollsOn() { return !!(this.ports.dolls && this.ports.dolls.make); }
  budgetPeople() { return (this.cfg.budget && this.cfg.budget.people) || 24; }
  takeRig(w) {
    const D = this.ports.dolls;
    if (!D || !D.make) return null;
    let r = this.rigFree.pop();
    if (r) { r.setLook(w.look); r.visible(true); }
    else { r = D.make(w.look); if (!r) return null; }
    this.stats.rigs++;
    this.liveRigs.add(r);
    return r;
  }
  dropRig(r) { if (!r) return; r.visible(false); this.liveRigs.delete(r); this.stats.rigs = Math.max(0, this.stats.rigs - 1); if (this.rigFree.length < 12) this.rigFree.push(r); else r.destroy(); }
  fx(key, x, y, size, depth) { const F = this.ports.fx; if (F && F.sheet) F.sheet(key, x, y, { size, depth: depth === undefined ? DEPTH.FX : depth }); }
  loop(key, x, y, size, depth) { const F = this.ports.fx; return F && F.loop ? F.loop(key, x, y, size, depth) : null; }
  burst(name, x, y, n) { const F = this.ports.fx; if (F && F.burst) F.burst(name, x, y, n); }
  float(x, y, text) { const F = this.ports.fx; if (F && F.floatText) F.floatText(x, y, text, '#ffe27a', 30); }
  say(x, y, text, dur) { if (this.ports.say) this.ports.say(x, y, text, dur); else this.bubble.show(x, y, text, dur); }
  sound(key, x, y, opts) { const S = this.ports.sound; if (!S) return; if (x !== undefined && S.at) S.at(key, x, y, opts || {}); else if (S.play) S.play(key, opts || {}); }
  focus(x, y, ms) { const V = this.ports.view; if (V && V.focus) V.focus(x, y, ms); }
  addLight(x, y, k) { const C = this.ports.clock; if (C && C.addLight) C.addLight(x, y, k); }
  want(keys) { const A = this.ports.assets; if (A && A.want) A.want([].concat(keys)); }
  wantArt(key) { const d = Assets.m.characters[key]; if (d && d.atlas) this.want([d.atlas]); }
  /** a night glow this frame (pooled, ADD, over the DayClock tint) */
  glow(x, y, k, a = 1) {
    if (this.glowN >= GLOWS) return;
    let g = this.glows[this.glowN];
    if (!g) { g = this.scene.add.image(0, 0, glowTex(this.scene)).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.FX - 29); this.glows.push(g); }
    this.glowN++;
    const al = Math.min(0.75, this.dark * 2.2) * a * (0.88 + 0.06 * Math.sin(this.t * 3 + x));
    g.setVisible(al > 0.01).setPosition(x, y).setScale(1.1 * k).setAlpha(al);
  }
  later(s, fn) { this.timers.push({ t: this.t + s, fn }); }

  // ------------------------------------------------------------------------------------------ host -> view
  siteOffered(def) { if (def && def.step === 'railExt') this.reveal.call(); }
  call() { this.reveal.call(); }
  padTook(kind, item) { this.pads.took(kind, item); }

  onModel(ev) {
    switch (ev.t) {
      case 'harbor:open': this.reveal.reveal(); this.statics.sync(); break;
      case 'harbor:step': this.statics.sync(); this.crane.refreshPile(); break;
      case 'harbor:auction': this.people.bell(ev); break;
      case 'box': this.people.box(ev); break;
      case 'crane': case 'harbor:import': this.crane.onModel(ev); break;
      case 'harbor:happening': this.happening(ev.id); break;
      case 'harbor:trawler':
        if (ev.op === 'launched' || ev.op === 'launch') { const [x, y] = W(BERTHS.W.i, -12.8); if (this.near(x, y, 100) && ev.op === 'launched') { this.fx('fx_splash_big', x, y, 220, y + 3); if (this.water) this.water.ripple(x, y, 1.8); this.sound('sfx_rope_creak', x, y, { volume: 0.6 }); } }
        break;
      case 'ship': {
        if (ev.op === 'near' && (ev.kind === 'ferry' || ev.kind === 'cargo')) { const sp = this.fleet.sprite(ev.id); if (sp && sp.on) this.sound('sfx_ship_horn_big', sp.x, sp.y, { volume: 0.6 }); }
        if (ev.op === 'pushed') { const sp = this.fleet.sprite(ev.id); if (sp && sp.on && this.water) this.water.ripple(sp.x, sp.y, 1.2); }
        break;
      }
      case 'harbor:ship': {
        const sp = this.fleet.sprite(ev.id);
        if (ev.kind === 'ferry' && ev.op === 'arrive') { const b = BLD.h_ferry_terminal; this.sound('sfx_ferry_bell', b.x, b.y, { volume: 0.7 }); this.later(0.8, () => this.sound('sfx_rope_creak', b.x, b.y + 120, { volume: 0.5 })); }
        if (ev.kind === 'ferry' && ev.op === 'depart' && sp && sp.on) this.sound('sfx_ship_horn_big', sp.x, sp.y, { volume: 0.5 });
        if (ev.kind === 'trawler' && ev.op === 'haul' && sp && sp.on) { const np = sp.def.netPoint && sp.def.netPoint.NE; if (np) { const x = sp.x + (sp.flip ? -np[0] : np[0]), y = sp.y + np[1]; this.fx('fx_splash_big', x, y, 200, sp.y + 1); if (this.water) this.water.ripple(x, y, 1.6); } }
        break;
      }
      case 'coins':
        if (ev.from === 'tourist' && ev.at) { const [x, y] = LR(ev.at[0], ev.at[1]); if (this.near(x, y, 0)) this.float(x, y - 120, '+' + ev.n); }
        break;
      default: break;
    }
  }

  /** stage a happening (story's scheduler, the designer preview, the model's own clock) */
  happening(id) {
    const lang = this.lang();
    if (id === 'P7') {
      const vt = this.people.victim();
      if (!vt) return false;
      const ok = this.gulls.raid(vt.x, vt.y - 46, () => {
        this.fx('fx_poof', vt.x, vt.y - 50, 60, vt.y + 3);
        this.sound('sfx_seagull_2', vt.x, vt.y, { volume: 0.7 });
        this.say(vt.x, vt.y - 110, lang === 'en' ? 'My fish!' : '내 생선구이!', 2.2);
        this.host.toast(ht(lang, 'P7'));
      });
      return ok;
    }
    if (id === 'P8') {
      if (!this.model.crane.cur) return false;
      this.crane.wobble();
      const b = BLD.h_harbor_crane;
      this.say(b.x - 180, b.y - 200, lang === 'en' ? 'Whoa, steady!' : '어어, 조심조심!', 2.2);
      this.host.toast(ht(lang, 'P8'));
      return true;
    }
    return false;
  }

  /** designer preview (이야기 미리보기): the next ferry arrival / cargo crane, camera on it -> { T, x, y } */
  preview(name) {
    const m = this.model, T = m.T;
    const kind = name === 'crane' ? 'cargo' : 'ferry';
    const n = m.sched.next(kind, 'arrive', T);
    const B = kind === 'cargo' ? BERTHS.C : BERTHS.F;
    const [x, y] = W(B.i, B.j);
    this.focus(x, y - 80, 6000);
    const at = n ? n.t - (kind === 'cargo' ? 4 : 30) : T;
    const C = this.ports.clock;
    if (C && C.jump && at > T) C.jump(at);
    return { T: at, x, y };
  }

  // ------------------------------------------------------------------------------------------ frame
  update(dt) {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    this.dt = dt; this.t += dt; this.T = this.host.T();
    this._r = this.rect();
    const C = this.ports.clock;
    this.dark = C && C.dark ? C.dark() : nightOf(this.T);
    if (this.timers.length) { const due = this.timers.filter((x) => x.t <= this.t); if (due.length) { this.timers = this.timers.filter((x) => x.t > this.t); for (const d of due) d.fn(); } }
    this.glowN = 0;
    const wv = this.water;
    if (wv) {
      if (this.ownWater) wv.update(dt);
      if (Math.abs((this._lit || 0) - this.dark) > 0.01) { this._lit = this.dark; if (wv.setLighting) wv.setLighting({ dark: this.dark }); }
    }
    const inView = this.near(BLD.h_fish_auction.x + 400, BLD.h_fish_auction.y, 2400);
    if (inView) {
      this.statics.update(dt);
      this.statics.setWork('shipyard', this.model.fleet.building > 0);
      this.fleet.update(dt);
      this.crane.update(dt);
      this.lighthouse.update(dt);
      this.gulls.update(dt);
      this.people.update(dt);
      this.pads.update(dt);
      // the harbour lamps' and buoys' own glows are the DayClock's; the buoy lamps blink here
      if (this.dark > 0.08) for (const f of this.statics.floaters) if (f.light && f.light.light && this.near(f.x, f.y, 60) && Math.floor(this.t * 1.2 + f.x) % 2 === 0) this.glow(f.img.x + f.light.light[0], f.img.y + f.light.light[1], 0.6);
    } else { this.fleet.update(dt); this.gulls.hideAll(); }
    this.reveal.update(dt);
    this.bubble.update(dt);
    for (const r of this.liveRigs) if (r.update) r.update(dt);         // (DollSprite rigs: the game's DollPool animates them)
    for (let k = this.glowN; k < this.glows.length; k++) if (this.glows[k].visible) this.glows[k].setVisible(false);
    this.music();
    if (t0) { this.stats.ms += performance.now() - t0; this.stats.n++; }
  }

  /** bgm_harbor + amb_harbor while the chief (or the camera) is in the harbour (sound.music, P15) */
  music() {
    const S = this.ports.sound, ch = this.ports.chief;
    if (!S || !S.music) return;
    let x, y;
    if (ch && ch.x) { x = ch.x(); y = ch.y(); } else { x = this._r.x + this._r.width / 2; y = this._r.y + this._r.height / 2; }
    const A = HARBOR_AREA, inside = this.model.open && x > A.x0 && x < A.x1 && y > A.y0 && y < A.y1;
    const want = inside ? 'harbor' : null;
    if (want !== this.area) { this.area = want; S.music(want); }
  }

  /** counts for the lab / the ModuleHost HUD */
  info() {
    let disp = this.statics.count() + this.glows.length + 2;
    for (const sp of this.fleet.live.values()) disp += 4 + sp.slots.length + (sp.wake ? 1 : 0);
    return { ships: this.fleet.stats.drawn, atSea: this.fleet.stats.atSea, rigs: this.stats.rigs, displayObjects: disp, gulls: this.gulls.list.length, water: this.water ? (this.water.isShader ? 'shader' : 'fallback') : 'none', msView: this.stats.n ? this.stats.ms / this.stats.n : 0 };
  }

  destroy() {
    const G = this.ports.ground;
    if (this.hook && G) { if (G.removeHook) G.removeHook(this.hook); else if (G.removeBakeHook) G.removeBakeHook(this.hook); }
    for (const p of [this.people, this.fleet, this.crane, this.lighthouse, this.gulls, this.pads, this.reveal, this.statics]) p.destroy();
    for (const g of this.glows) g.destroy();
    this.bubble.destroy();
    for (const r of this.rigFree) r.destroy();
    this.rigFree = [];
    if (this.water && this.ownWater) this.water.destroy();
  }
}

/** night amount without a DayClock (the same curve as v4's: dusk 17-20, dawn 6-8, darkness 0.45) */
function nightOf(T) {
  const h = hourOf(T);
  if (h >= 8 && h < 17) return 0;
  if (h >= 17 && h < 20) return 0.16 + (0.45 - 0.16) * (h - 17) / 3;
  if (h >= 6 && h < 8) return 0.45 * (1 - (h - 6) / 2);
  return 0.45;
}

export { REGIONS };
