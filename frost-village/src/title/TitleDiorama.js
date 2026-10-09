// TitleDiorama — the little snowy island that grows from a fishing camp into a city (world camera).
//
// Pictures: the game's own core atlases for what the game loads before the title anyway (props, the
// chief, villagers, fx) and the title bake (src/title/bake, 4 groups = 4 growth stages) for everything else.
// Layout + timing of every object: src/title/layout.js. Light: setLight(t) with t 0 day .. 1 dusk .. 2 night
// (tint on every picture + additive window / lamp / fire glows). Life: the chief carrying a tower of grilled
// fish, 콩이, villagers, the snow train, buses and cars, ferry / sailboat / rowboat, gulls, chimney smoke.
//
// Per frame: no allocations (records and pools are made up front; pops run on their own little clock).
import * as L from './layout.js';
import { Assets } from '../core/Assets.js';
import { DIR_BASE, DIR_FLIP, dirFromVec } from '../core/Iso.js';
import { TitleAssets } from './TitleAssets.js';
import { tod3 } from './TitleFx.js';

const ADD = () => Phaser.BlendModes.ADD;
// window / lamp / headlight glows are many and sit between the buildings in depth order: they use NORMAL
// blending (a warm, partly transparent picture) so they batch with the sprites around them instead of
// breaking the batch with a blend switch each (about 90 -> 30 draw calls at night). The few big lights
// (fires, lighthouse) stay additive.
const LIGHT = () => Phaser.BlendModes.NORMAL;
const D_GROUND = -100000;
const D_AIR = 100000;
const WARM = 0xffd58f;
const LAMP_KEYS = { streetlight: ['light'], streetlight_double: ['lightA', 'lightB'], harbor_lamp: ['light'], lamp_post: null, buoy: ['light'] };
const TINT = [0xffffff, 0xf6c7ad, 0x6d7dbd];      // pictures: day, dusk, night
const SMOKE_TINT = [0xffffff, 0xf3d6cc, 0x9aa6d0];
const GULL_SE = 'seagull:fly:SE', GULL_NE = 'seagull:fly:NE';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
function backOut(p, s = 2.0) { const q = p - 1; return q * q * ((s + 1) * q + s) + 1; }
function hash(i) { let x = (i * 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return (x >>> 0) / 4294967296; }

const wx = L.wx, wy = L.wy;

export class TitleDiorama {
  /**
   * scene: the title scene; put(obj): hand a game object to the world camera;
   * opts: { reduced: bool, cue(name, vol): play an intro sound }
   */
  constructor(scene, put, opts = {}) {
    this.scene = scene;
    this.put = put;
    this.reduced = !!opts.reduced;
    this.cue = opts.cue || (() => {});
    this.time = 0;
    this.stage = 0;              // highest stage shown (or being shown)
    this.tod = -1;
    this.tint = 0xffffff;
    this.glowK = 0; this.lampK = 0; this.nightK = 0;
    this.lastCue = -9;
    this.recs = [];              // OBJECTS records
    this.groundRecs = [];
    this.active = [];            // records with a scheduled / running pop
    this.tintables = [];         // pictures that follow the light
    this.windowGlows = [];       // { img, rec, th }
    this.lamps = [];             // { img, pool, rec, base }
    this.fires = [];             // { spr, glow, rec, base }
    this.smokeSrc = [];          // { x, y, rec, acc, rate }
    this.walkers = [];
    this.vehicles = [];
    this.ships = [];
    this.gulls = [];
    this.train = null;
    this.beams = null;
    this.buildRecords();
    this.makePools();
    this.materialize();
  }

  // ------------------------------------------------------------------ records
  buildRecords() {
    const man = TitleAssets.man;
    L.OBJECTS.forEach((o, i) => {
      const sp = man && man.sprites[o.k];
      const live = !sp || !!sp.live;
      const group = live ? 1 : Math.max(1, sp.stage || 1);
      this.recs.push({ o, i, key: o.k, sp, live, group, img: null, glow: null, x: wx(o.x, o.y), y: wy(o.x, o.y) + (o.w ? L.WATER_PX : 0),
        bs: 1, shown: false, want: false, popAt: 0, popDur: 0, popMode: 0, popT: -1, size: 1, bob: o.w ? hash(i) * 6.28 : -1,
        extras: [], smoke: [], th: 0.15 + hash(i + 7) * 0.45 });
    });
    if (man) {
      for (let s = 0; s <= 4; s++) {
        const key = s === 0 ? 'ttl_ground_base' : 'ttl_ground_s' + s;
        const f = man.files[key];
        if (!f) continue;
        this.groundRecs.push({ stage: s, key, f, group: Math.max(1, s), img: null, shown: false, want: false, fade: -1 });
      }
    }
  }

  makePools() {
    const s = this.scene;
    // snow puffs for the pops
    this.puffs = [];
    const poof = Assets.sheet('fx_poof');
    for (let i = 0; i < 10; i++) {
      const p = s.add.sprite(0, 0, 'fx_poof', 0).setVisible(false).setDepth(D_AIR - 10);
      const sd = Assets.sheetDef('fx_poof');
      p.setOrigin(sd && sd.anchor ? sd.anchor[0] : 0.5, sd && sd.anchor ? sd.anchor[1] : 0.6);
      if (poof) p.on('animationcomplete', () => p.setVisible(false));
      this.put(p);
      this.puffs.push(p);
    }
    this.puffI = 0;
    this.poofAnim = poof;
    // chimney smoke: one pooled emitter, particles emitted where needed
    const sm = Assets.sprite('fx_smoke');
    this.smoke = s.add.particles(0, 0, sm.tex, {
      frame: sm.frame, emitting: false, lifespan: { min: 2400, max: 3400 }, speedY: { min: -26, max: -16 }, speedX: { min: 5, max: 13 },
      scale: { start: 0.16, end: 0.62 }, alpha: { start: 0.55, end: 0 }, rotate: { min: 0, max: 360 }, maxParticles: 90,
    }).setDepth(D_AIR - 20);
    this.put(this.smoke);
  }

  /** create the pictures of every record whose textures are there (call again when a group arrives) */
  materialize() {
    for (const r of this.groundRecs) if (!r.img && TitleAssets.ready(r.group)) this.makeGround(r);
    for (const r of this.recs) if (!r.img && (r.live || TitleAssets.ready(r.group))) this.makeObject(r);
  }

  onGroup() {
    this.materialize();
    // removals that waited for this stage's pictures
    if (this.pendingOuts && this.stageReady(this.pendingTo)) {
      const outs = this.pendingOuts;
      this.pendingOuts = null;
      outs.forEach((r, k) => { if (this.wanted(r.o, this.stage)) return; r.want = false; this.schedule(r, this.time + 0.05 * k, -1, 0.24); });
    }
    // records that should already be visible (stage passed while their pictures were loading): fade in
    for (const r of this.recs) if (r.img && r.want && !r.shown && r.popT < 0 && r.popMode === 0) this.schedule(r, this.time, 1, 0.35);
    for (const r of this.groundRecs) if (r.img && r.want && !r.shown) { r.shown = true; r.fade = 0; r.img.setVisible(true).setAlpha(0); }
    this.spawnLife(this.stage);
  }

  /** are the pictures of stages 1..s all loaded? */
  stageReady(s) {
    for (let g = 1; g <= s; g++) if (!TitleAssets.ready(g)) return false;
    return true;
  }

  makeGround(r) {
    const s = this.scene, f = r.f;
    const img = s.add.image(f.x, f.y, r.key).setOrigin(0, 0).setScale(1 / f.scale).setDepth(D_GROUND + r.stage).setVisible(false);
    this.put(img);
    img.setTint(this.tint);
    this.tintables.push(img);
    r.img = img;
  }

  makeObject(r) {
    const s = this.scene, o = r.o;
    let img;
    if (r.live) {
      const p = Assets.sprite(r.key);
      if (p.ph || p.pending) return;
      const an = r.key === 'station_grill' ? Assets.spriteAnim(r.key, 'work') : null;
      img = an ? s.add.sprite(r.x, r.y, p.tex, p.frame) : s.add.image(r.x, r.y, p.tex, p.frame);
      img.setOrigin(p.anchor[0], p.anchor[1]);
      if (an && !this.reduced) img.play(an);
      r.bs = 1;
      r.size = Math.max(0.35, Math.min(2.2, (img.frame.realWidth || 200) / 260));
    } else {
      const sp = r.sp;
      const animKey = sp.anim ? TitleAssets.anim(s, r.key, sp.anim.frames, sp.anim.fps) : null;
      img = animKey ? s.add.sprite(r.x, r.y, sp.tex, sp.frame) : s.add.image(r.x, r.y, sp.tex, sp.frame);
      img.setOrigin(sp.ox, sp.oy);
      if (animKey && !this.reduced) img.play(animKey);
      r.bs = 1 / sp.scale;
      r.size = Math.max(0.35, Math.min(2.2, (img.frame.realWidth * r.bs) / 260));
    }
    img.setScale(r.bs).setDepth(r.y).setVisible(false);
    if (o.f) img.setFlipX(true);
    img.setTint(this.tint);
    this.put(img);
    this.tintables.push(img);
    r.img = img;
    const def = Assets.def(r.key) || {};
    const fx = (r.sp && r.sp.fx) || def.fxPoints || null;
    const fxs = o.f ? -1 : 1;
    // night glow of the windows
    const g = r.sp && r.sp.glow;
    if (g && s.textures.exists(g.tex)) {
      const gi = s.add.image(r.x, r.y, g.tex, g.frame).setOrigin(g.ox, g.oy).setScale(1 / (r.sp.scale * g.res)).setBlendMode(LIGHT())
        .setDepth(r.y + 0.5).setVisible(false).setAlpha(0);
      if (o.f) gi.setFlipX(true);
      this.put(gi);
      r.glow = gi;
      this.windowGlows.push({ img: gi, rec: r, th: r.th });
    }
    // lamps
    if (r.key in LAMP_KEYS) {
      const names = LAMP_KEYS[r.key];
      const pts = names && fx ? names.map((n) => fx[n]).filter(Boolean) : [[0, -((def.topPx || r.sp && r.sp.topPx || 120) - 16)]];
      for (const p of pts) this.addLamp(r, r.x + p[0] * fxs, r.y + p[1], r.key === 'buoy' ? 0.35 : 0.62, r.key !== 'buoy');
    }
    if (r.key === 'lighthouse' && fx && fx.light) this.addLighthouse(r, r.x + fx.light[0] * fxs, r.y + fx.light[1]);
    if (r.key === 'campfire') this.addFire(r, r.x, r.y - 4, 0.42);
    if (r.key === 'watchtower' && fx && fx.fire) this.addFire(r, r.x + fx.fire[0] * fxs, r.y + fx.fire[1] + 6, 0.62);
    if (r.key === 'flag_pole' || r.key === 'traffic_light') { /* no light */ }
    // chimney smoke / steam
    if (fx) for (const n of ['smoke', 'smoke2', 'steam']) if (fx[n] && r.key !== 'lighthouse') r.smoke.push(this.smokeSrc.push({ x: r.x + fx[n][0] * fxs, y: r.y + fx[n][1], rec: r, acc: hash(r.i * 3 + n.length), rate: n === 'steam' ? 0.9 : 1.35 }) - 1);
  }

  addLamp(r, x, y, sc, pool) {
    const s = this.scene;
    const gl = Assets.sprite('fx_glow');
    const img = s.add.image(x, y, gl.tex, gl.frame).setBlendMode(LIGHT()).setTint(WARM).setScale(sc).setDepth(r.y + 0.6).setVisible(false).setAlpha(0);
    this.put(img);
    let pl = null;
    if (pool) {
      pl = s.add.image(r.x, r.y + 2, gl.tex, gl.frame).setBlendMode(LIGHT()).setTint(0xffc777).setScale(sc * 2.6, sc * 1.25).setDepth(r.y - 30).setVisible(false).setAlpha(0);
      this.put(pl);
    }
    this.lamps.push({ img, pool: pl, rec: r, ph: hash(this.lamps.length + 11) * 6.28 });
  }

  addFire(r, x, y, sc) {
    const s = this.scene;
    const an = Assets.sheet('fx_fire');
    const sd = Assets.sheetDef('fx_fire');
    const spr = s.add.sprite(x, y, 'fx_fire', 0).setScale(sc).setDepth(r.y + 0.7).setVisible(false);
    if (sd && sd.anchor) spr.setOrigin(sd.anchor[0], sd.anchor[1]);
    if (an && !this.reduced) spr.play({ key: an, startFrame: Math.floor(hash(r.i) * 10) });
    this.put(spr);
    const gl = Assets.sprite('fx_glow');
    const glow = s.add.image(x, y - 14 * sc, gl.tex, gl.frame).setBlendMode(ADD()).setTint(0xffa040).setScale(sc * 2.4).setDepth(r.y + 0.8).setVisible(false).setAlpha(0);
    this.put(glow);
    this.fires.push({ spr, glow, rec: r, sc, ph: hash(r.i + 5) * 6.28 });
  }

  addLighthouse(r, x, y) {
    const s = this.scene;
    const gl = Assets.sprite('fx_glow');
    const lamp = s.add.image(x, y, gl.tex, gl.frame).setBlendMode(ADD()).setTint(0xfff0b8).setScale(1.25).setDepth(r.y + 0.6).setVisible(false).setAlpha(0);
    this.put(lamp);
    const cont = s.add.container(x, y).setDepth(D_AIR - 30).setVisible(false).setAlpha(0);
    cont.setScale(1, 0.5);
    const b1 = s.add.image(0, 0, 'ttl_fx_beam').setOrigin(0, 0.5).setBlendMode(ADD()).setScale(2.6, 2.4);
    const b2 = s.add.image(0, 0, 'ttl_fx_beam').setOrigin(0, 0.5).setBlendMode(ADD()).setScale(2.6, 2.4);
    cont.add([b1, b2]);
    this.put(cont);
    this.beams = { lamp, cont, b1, b2, rec: r, a: 0.6 };
  }

  // ------------------------------------------------------------------ stages
  /** objects of stage s are visible (s >= o.s and not replaced) */
  wanted(o, s) { return o.s <= s && !(o.u && o.u <= s); }

  /** jump to stage s at once (idle title, reduced motion) */
  setStageInstant(s) {
    this.stage = s;
    this.pendingOuts = null;
    for (const r of this.recs) {
      r.want = this.wanted(r.o, s);
      r.popT = -1; r.popMode = 0;
      if (r.img) this.showRec(r, r.want);
    }
    for (const r of this.groundRecs) {
      r.want = r.stage <= s;
      r.fade = -1;
      if (r.img) { r.shown = r.want; r.img.setVisible(r.want).setAlpha(1); }
    }
    this.active.length = 0;
    this.spawnLife(s);
  }

  /**
   * grow from the current stage to stage `to` over `win` seconds (pops ripple out from the stage's hero
   * object; replaced objects puff away first). Returns the time the last pop ends.
   */
  grow(to, win = 1.6, opts = {}) {
    const from = this.stage;
    if (to <= from) return 0;
    this.stage = to;
    const t0 = this.time;
    const cam = L.CAMERA[to];
    const order = [];
    for (const r of this.recs) {
      const want = this.wanted(r.o, to);
      if (want === r.want) continue;
      r.want = want;
      order.push(r);
    }
    // removals first (quick), then the hero, then the rest rippling out from the middle of the view
    const hx = wx(cam.mx, cam.my), hy = wy(cam.mx, cam.my);
    const ins = order.filter((r) => r.want);
    const outs = order.filter((r) => !r.want);
    ins.sort((a, b) => (b.o.hero ? 1 : 0) - (a.o.hero ? 1 : 0) || ((a.x - hx) ** 2 + ((a.y - hy) * 2) ** 2) - ((b.x - hx) ** 2 + ((b.y - hy) * 2) ** 2));
    // what this stage replaces goes only once its successors can be drawn (a late or missing stage never
    // makes the island poorer): until then the old buildings stay
    this.pendingOuts = null;
    let outWin = 0;
    if (outs.length && !this.stageReady(to)) {
      for (const r of outs) r.want = true;
      this.pendingOuts = outs; this.pendingTo = to;
    } else if (outs.length) {
      outWin = Math.min(0.35, win * 0.2);
      outs.forEach((r, k) => this.schedule(r, t0 + (outs.length > 1 ? (k / (outs.length - 1)) * outWin : 0), -1, 0.24));
    }
    const start = t0 + outWin + (outWin ? 0.08 : 0);
    const n = ins.length;
    let end = start;
    ins.forEach((r, k) => {
      const f = n > 1 ? k / (n - 1) : 0;
      const at = start + (r.o.hero ? 0 : 0.12 + Math.pow(f, 0.85) * (win - 0.12));
      const dur = r.o.big ? 0.5 : 0.32;
      this.schedule(r, at, 1, dur);
      end = Math.max(end, at + dur);
    });
    for (const g of this.groundRecs) {
      if (g.stage > from && g.stage <= to) { g.want = true; if (g.img) { g.shown = true; g.fade = 0; g.img.setVisible(true).setAlpha(0); } }
    }
    if (opts.life !== false) this.lifeAt = start + win * 0.4;
    this.lifeStage = to;
    return end - t0;
  }

  schedule(r, at, mode, dur) {
    if (this.reduced) dur = Math.max(dur, 0.45);
    r.popAt = at; r.popMode = mode; r.popDur = dur; r.popT = -1;
    if (this.active.indexOf(r) < 0) this.active.push(r);
  }

  showRec(r, on) {
    r.shown = on;
    if (!r.img) return;
    r.img.setVisible(on).setAlpha(1).setScale(r.bs);
    if (r.o.f) r.img.setFlipX(true);
    r.img.y = r.y;
    if (r.glow) r.glow.setVisible(on);
    for (const l of this.lamps) if (l.rec === r) { l.img.setVisible(on); if (l.pool) l.pool.setVisible(on); }
    for (const f of this.fires) if (f.rec === r) { f.spr.setVisible(on); f.glow.setVisible(on); }
    if (this.beams && this.beams.rec === r) { this.beams.lamp.setVisible(on); this.beams.cont.setVisible(on); }
  }

  puff(x, y, size, big) {
    if (!this.poofAnim) return;
    const p = this.puffs[this.puffI];
    this.puffI = (this.puffI + 1) % this.puffs.length;
    p.setPosition(x, y + 4).setScale(0.55 + size * 0.55).setVisible(true).setAlpha(0.95);
    p.setTint(this.tint);
    p.play(this.poofAnim);
    // the title art's pop (ring, snow balls, gold stars) on top for the buildings
    if (big && this.popPool === undefined) this.makePopPool();
    if (big && this.popPool) {
      const q = this.popPool[this.popI];
      this.popI = (this.popI + 1) % this.popPool.length;
      q.setPosition(x, y).setScale(0.8 + size * 0.5).setVisible(true);
      q.play(this.popAnim);
    }
  }

  makePopPool() {
    const s = this.scene;
    const an = s.textures.exists('ttl_fx_pop') ? TitleAssets.sheetAnim(s, 'ttl_fx_pop') : null;
    if (!an) { this.popPool = null; return; }
    this.popAnim = an;
    this.popPool = [];
    this.popI = 0;
    for (let i = 0; i < 6; i++) {
      const q = s.add.sprite(0, 0, 'ttl_fx_pop', 0).setOrigin(0.5, 0.6).setVisible(false).setDepth(D_AIR - 9);
      q.on('animationcomplete', () => q.setVisible(false));
      this.put(q);
      this.popPool.push(q);
    }
  }

  updatePops() {
    const now = this.time;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const r = this.active[i];
      if (now < r.popAt) continue;
      if (!r.img) {           // pictures still loading: wait (the director holds the clock a little)
        if (r.popMode < 0) { r.popMode = 0; this.active[i] = this.active[this.active.length - 1]; this.active.length--; }
        continue;
      }
      if (r.popT < 0) {
        r.popT = 0;
        if (r.popMode > 0) {
          this.showRec(r, true);
          if (!this.reduced) {
            this.puff(r.x, r.y, r.size, !!r.o.big);
            if (r.o.big && now - this.lastCue > 0.14) { this.lastCue = now; this.cue(r.o.hero ? 'stage' : 'pop', r.o.hero ? 0.8 : 0.55); }
          }
        } else if (!this.reduced) this.puff(r.x, r.y, r.size * 0.8);
      }
      r.popT = (now - r.popAt) / r.popDur;
      const p = clamp01(r.popT);
      const img = r.img;
      if (this.reduced) {
        img.setAlpha(r.popMode > 0 ? p : 1 - p);
      } else if (r.popMode > 0) {
        const k = backOut(p, 2.3);
        const sq = Math.sin(p * Math.PI) * (1 - p) * 0.5;
        img.setScale(r.bs * k * (1 + sq), r.bs * k * (1 - sq * 0.8));
        img.y = r.y - (1 - Math.min(1, p * 1.6)) * 26;
        if (r.glow) r.glow.setScale(img.scaleX / r.bs / (r.sp.scale * r.sp.glow.res), img.scaleY / r.bs / (r.sp.scale * r.sp.glow.res));
      } else {
        const k = 1 - p * p;
        img.setScale(r.bs * k, r.bs * k);
      }
      if (p >= 1) {
        if (r.popMode > 0) { img.setScale(r.bs).setAlpha(1); img.y = r.y; if (r.glow) r.glow.setScale(1 / (r.sp.scale * r.sp.glow.res)); } else this.showRec(r, false);
        r.popMode = 0; r.popT = -1;
        this.active[i] = this.active[this.active.length - 1];
        this.active.length--;
      }
    }
    for (const g of this.groundRecs) {
      if (g.fade < 0) continue;
      g.fade = Math.min(1, g.fade + this.dt / 0.7);
      g.img.setAlpha(g.fade);
      if (g.fade >= 1) g.fade = -1;
    }
  }

  // ------------------------------------------------------------------ light
  setLight(t) {
    if (Math.abs(t - this.tod) < 0.002) return;
    this.tod = t;
    const c = tod3(TINT[0], TINT[1], TINT[2], t);
    this.glowK = smooth(0.7, 1.75, t);
    this.lampK = smooth(0.55, 1.25, t);
    this.nightK = smooth(1.0, 2.0, t);
    if (c !== this.tint) {
      this.tint = c;
      for (const im of this.tintables) im.setTint(c);
      this.smoke.setParticleTint(tod3(SMOKE_TINT[0], SMOKE_TINT[1], SMOKE_TINT[2], t));
    }
  }

  updateLights() {
    const t = this.time;
    for (const w of this.windowGlows) {
      if (!w.rec.shown) continue;
      // windows light up one house after another as dusk falls
      const a = smooth(w.th, w.th + 0.35, this.glowK);
      w.img.setAlpha(a * 0.95);
    }
    for (const l of this.lamps) {
      if (!l.rec.shown) continue;
      const fl = 0.93 + 0.07 * Math.sin(t * 7.3 + l.ph);
      l.img.setAlpha(this.lampK * fl);
      if (l.pool) l.pool.setAlpha(this.lampK * 0.42);
    }
    for (const f of this.fires) {
      if (!f.rec.shown) continue;
      const fl = 0.85 + 0.15 * Math.sin(t * 11 + f.ph) * Math.sin(t * 4.3 + f.ph * 2);
      f.glow.setAlpha((0.3 + 0.7 * this.lampK) * fl);
      f.glow.setScale(f.sc * (2.2 + this.lampK * 1.4) * (0.96 + 0.04 * fl));
    }
    const b = this.beams;
    if (b && b.rec.shown) {
      const k = this.lampK;
      b.lamp.setAlpha(k * (0.85 + 0.15 * Math.sin(t * 2.1)));
      b.cont.setAlpha(this.nightK * 0.85);
      if (!this.reduced) b.a = t * 0.9;
      b.b1.rotation = b.a; b.b2.rotation = b.a + Math.PI;
    }
  }

  updateSmoke(dt) {
    if (this.reduced) return;
    for (const s of this.smokeSrc) {
      if (!s.rec.shown || s.rec.popMode !== 0) continue;
      s.acc += dt * s.rate;
      if (s.acc >= 1) { s.acc -= 1; this.smoke.emitParticleAt(s.x + (Math.random() - 0.5) * 6, s.y, 1); }
    }
  }

  // ------------------------------------------------------------------ life (people, dog, vehicles, train, ships, gulls)
  spawnLife(stage) {
    for (const a of L.ACTORS) if (a.s <= stage && !this.walkers.some((w) => w.def === a)) this.addWalker(a);
    for (const v of L.VEHICLES) if (v.s <= stage && !this.vehicles.some((w) => w.def === v)) this.addVehicle(v);
    for (const sh of L.SHIPS) if (sh.s <= stage && !this.ships.some((w) => w.def === sh)) this.addShip(sh);
    L.GULLS.forEach((g, i) => { if (g.s <= stage && !this.gulls.some((w) => w.def === g)) this.addGull(g, i); });
    if (L.TRAIN.s <= stage && !this.train) this.addTrain();
    for (const v of this.vehicles) v.retired = !!(v.def.u && v.def.u <= stage);
  }

  /** a character sprite: live (core atlas) or baked (late atlas) */
  charSprite(char) {
    const s = this.scene;
    const baked = !!TitleAssets.actor(char + ':run:SE') || !!TitleAssets.actor(char + ':move:SE') || !!TitleAssets.actor(char + ':fly:SE');
    if (!baked && (!Assets.charReady(char))) return null;
    const spr = s.add.sprite(0, 0, '__WHITE');
    this.put(spr);
    spr.setTint(this.tint);
    this.tintables.push(spr);
    return { spr, baked };
  }

  playChar(w, anim, dirIdx) {
    const base = DIR_BASE[dirIdx], flip = DIR_FLIP[dirIdx];
    let key = null;
    if (w.baked) {
      let a = TitleAssets.actor(w.char + ':' + anim + ':' + base);
      if (!a) a = TitleAssets.actor(w.char + ':' + anim + ':SE');
      if (!a) return;
      key = TitleAssets.anim(this.scene, w.char + ':' + anim + ':' + a.dir, a.frames, a.fps);
      if (key && key !== w.key) { w.spr.setOrigin(a.ox, a.oy).setScale(1 / a.scale); }
    } else {
      key = Assets.charAnim(w.char, anim, base);
      if (key !== w.key) { const d = Assets.charDef(w.char); w.spr.setOrigin(d.anchor[0], d.anchor[1]).setScale(1); }
    }
    if (key && key !== w.key) {
      w.key = key;
      if (this.reduced) {
        // reduced motion: hold the first pose of the anim
        const f0 = this.scene.anims.get(key).frames[0];
        w.spr.anims.stop();
        w.spr.setTexture(f0.textureKey, f0.textureFrame);
      } else w.spr.play(key, true);
    }
    w.spr.setFlipX(flip);
    w.dir = dirIdx;
  }

  addWalker(a) {
    const cs = this.charSprite(a.char);
    if (!cs) return;
    const s = this.scene;
    // (reduced motion: everyone stands still at the second point of the path, facing the camera)
    const p0 = this.reduced && a.path.length > 1 ? a.path[1] : a.path[0];
    const w = { def: a, char: a.char, spr: cs.spr, baked: cs.baked, key: null, i: this.reduced && a.path.length > 1 ? 1 : 0, mx: p0[0], my: p0[1], back: false, dir: 1, shadow: null, stack: null, appear: 0 };
    const d = cs.baked ? null : Assets.charDef(a.char);
    const sh = s.add.image(0, 0, 'fv_shadow').setAlpha(0.5);
    const shw = d && d.shadow ? d.shadow : [46, 18];
    sh.setDisplaySize(shw[0], shw[1]);
    this.put(sh);
    w.shadow = sh;
    if (a.stack) {
      const it = Assets.sprite(a.stack);
      w.stack = [];
      w.stackStep = (Assets.def(a.stack).stackStep || 9) * 0.6;
      for (let k = 0; k < a.stackN; k++) {
        const im = s.add.image(0, 0, it.tex, it.frame).setOrigin(it.anchor[0], it.anchor[1]).setScale(0.6);
        this.put(im);
        im.setTint(this.tint);
        this.tintables.push(im);
        w.stack.push(im);
      }
    }
    if (this.reduced) {
      this.playChar(w, a.speed > 0 ? a.anim : a.anim, 2);
    } else if (a.speed > 0) {
      const p1 = a.path[1] || a.path[0];
      this.playChar(w, a.anim, dirFromVec(wx(p1[0], p1[1]) - wx(w.mx, w.my), wy(p1[0], p1[1]) - wy(w.mx, w.my)));
    } else {
      const dIdx = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'].indexOf(a.dir || 'SE');
      this.playChar(w, a.anim, dIdx < 0 ? 1 : dIdx);
    }
    w.appear = this.reduced ? 1 : 0;
    this.walkers.push(w);
    this.placeWalker(w);
  }

  placeWalker(w) {
    const x = wx(w.mx, w.my), y = wy(w.mx, w.my);
    const k = w.appear < 1 ? backOut(w.appear, 2.5) : 1;
    w.spr.setPosition(x, y).setDepth(y + 1);
    if (w.baseScale === undefined) w.baseScale = w.spr.scaleX;
    w.spr.setScale(w.baseScale * k);
    w.shadow.setPosition(x, y + 1).setDepth(y - 2);
    w.shadow.setAlpha(0.45 * k);
    if (w.stack) {
      const def = Assets.charDef(w.char);
      const base = DIR_BASE[w.dir], flip = DIR_FLIP[w.dir];
      const cp = (def.carryPoint && def.carryPoint[base]) || [0, -34, false];
      const cx = x + (flip ? -cp[0] : cp[0]), cy = y + cp[1];
      const behind = !!cp[2];
      for (let n = 0; n < w.stack.length; n++) {
        const im = w.stack[n];
        const sway = Math.sin(this.time * 5.2 - n * 0.35) * n * 0.22;
        im.setPosition(cx + sway, cy - n * w.stackStep * k).setScale(0.6 * k);
        im.setDepth(y + 1 + (behind ? -0.5 : 0.5) + n * 0.001);
      }
    }
  }

  updateWalkers(dt) {
    for (const w of this.walkers) {
      if (w.appear < 1) w.appear = Math.min(1, w.appear + dt / 0.4);
      const a = w.def;
      if (a.speed > 0 && !this.reduced) {
        const path = a.path;
        const nextI = w.back ? w.i - 1 : w.i + 1;
        const tgt = path[(nextI + path.length) % path.length];
        const dx = tgt[0] - w.mx, dy = tgt[1] - w.my;
        const d = Math.sqrt(dx * dx + dy * dy);
        const step = a.speed * dt;
        if (d <= step) {
          w.mx = tgt[0]; w.my = tgt[1];
          if (a.loop) w.i = (nextI + path.length) % path.length;
          else { w.i = nextI; if (w.i >= path.length - 1) w.back = true; else if (w.i <= 0) w.back = false; }
          const n2 = w.back ? w.i - 1 : w.i + 1;
          const t2 = path[(n2 + path.length) % path.length];
          this.playChar(w, a.anim, dirFromVec(wx(t2[0], t2[1]) - wx(w.mx, w.my), wy(t2[0], t2[1]) - wy(w.mx, w.my)));
        } else {
          w.mx += (dx / d) * step; w.my += (dy / d) * step;
        }
      }
      this.placeWalker(w);
    }
  }

  addVehicle(v) {
    const s = this.scene;
    const dir = v.dir > 0 ? 'SE' : 'NE';
    const a = TitleAssets.actor(v.char + ':move:' + dir);
    if (!a || !TitleAssets.ready(v.s)) return;
    const key = TitleAssets.anim(s, v.char + ':move:' + dir, a.frames, a.fps);
    if (!key) return;
    const spr = s.add.sprite(0, 0, a.frames[0][0], a.frames[0][1]).setOrigin(a.ox, a.oy).setScale(1 / a.scale);
    if (!this.reduced) spr.play({ key, startFrame: Math.floor(hash(this.vehicles.length + 3) * a.frames.length) });
    if (v.dir < 0) spr.setFlipX(true);
    spr.setTint(this.tint);
    this.tintables.push(spr);
    this.put(spr);
    // headlights at night
    const gl = Assets.sprite('fx_glow');
    const hl = s.add.image(0, 0, gl.tex, gl.frame).setBlendMode(LIGHT()).setTint(0xfff1c4).setScale(0.32, 0.22).setAlpha(0);
    this.put(hl);
    const span = 15.5;
    const veh = { def: v, spr, hl, mx: v.dir > 0 ? -span + v.gap * 0.8 : span - v.gap * 0.8, v: v.speed, wait: 0, span, retired: false, alpha: 0 };
    this.vehicles.push(veh);
    this.placeVehicle(veh);
  }

  placeVehicle(c) {
    const x = wx(c.mx, c.def.lane), y = wy(c.mx, c.def.lane);
    c.spr.setPosition(x, y).setDepth(y + 1);
    const edge = c.span - Math.abs(c.mx);
    const a = clamp01(edge / 1.6) * (c.wait > 0 ? 0 : 1) * (c.fade === undefined ? 1 : c.fade);
    c.spr.setAlpha(a);
    // headlight: ahead of the vehicle on the road
    const fx = c.def.dir > 0 ? 1 : -1;
    c.hl.setPosition(x + fx * 62, y + fx * 24 - 14).setDepth(y + 1.2).setAlpha(a * this.lampK * 0.9);
  }

  updateVehicles(dt) {
    for (const c of this.vehicles) {
      if (c.fade === undefined) c.fade = 0;
      c.fade = c.retired ? Math.max(0, c.fade - dt * 1.5) : Math.min(1, c.fade + dt * 1.2);
      if (this.reduced) { this.placeVehicle(c); continue; }
      if (c.wait > 0) { c.wait -= dt; if (c.wait <= 0) c.mx = c.def.dir > 0 ? -c.span : c.span; this.placeVehicle(c); continue; }
      // keep a gap to the vehicle ahead in the same lane
      let sp = c.def.speed;
      for (const o of this.vehicles) {
        if (o === c || o.def.lane !== c.def.lane || o.wait > 0) continue;
        const ahead = (o.mx - c.mx) * c.def.dir;
        if (ahead > 0 && ahead < 7.5) sp = Math.min(sp, o.v * (ahead < 5.5 ? 0.6 : 1));
      }
      c.v += (sp - c.v) * Math.min(1, dt * 2);
      c.mx += c.def.dir * c.v * dt;
      if (Math.abs(c.mx) > c.span) { c.wait = c.def.gap; }
      this.placeVehicle(c);
    }
  }

  addTrain() {
    const s = this.scene, T = L.TRAIN;
    if (!TitleAssets.ready(T.s)) return;
    const cars = [];
    let off = 0;
    T.cars.forEach((ch, i) => {
      const a = TitleAssets.actor(ch + ':move:SE');
      if (!a) return;
      const key = TitleAssets.anim(s, ch + ':move:SE', a.frames, a.fps);
      const spr = s.add.sprite(0, 0, a.frames[0][0], a.frames[0][1]).setOrigin(a.ox, a.oy).setScale(1 / a.scale);
      spr.setTint(this.tint);
      this.tintables.push(spr);
      this.put(spr);
      if (i > 0) off += T.spacing[i - 1];
      cars.push({ spr, key, off });
    });
    if (!cars.length) return;
    this.train = { cars, head: T.fromMx, from: T.fromMx, dur: ((T.stopMx - T.fromMx) / T.speed) * 1.6, state: 'in', t: 0, whistled: false, wait: 0 };
    this.placeTrain();
  }

  placeTrain() {
    const tr = this.train, my = L.RAIL.my;
    for (const c of tr.cars) {
      const m = tr.head - c.off;
      const x = wx(m, my), y = wy(m, my);
      c.spr.setPosition(x, y).setDepth(y + 1);
    }
  }

  updateTrain(dt) {
    const tr = this.train, T = L.TRAIN;
    if (!tr) return;
    if (this.reduced) { tr.head = T.stopMx; this.placeTrain(); return; }
    tr.t += dt;
    const dist = T.stopMx - T.fromMx;
    const dur = dist / T.speed * 1.6;
    if (tr.state === 'in') {
      const p = clamp01(tr.t / tr.dur);
      tr.head = tr.from + (T.stopMx - tr.from) * (1 - Math.pow(1 - p, 2.2));
      if (!tr.whistled && p > 0.25) { tr.whistled = true; this.cue('train', 0.7); }
      if (p > 0.15 && Math.random() < dt * 5) this.trainPuff();
      if (p >= 1) { tr.state = 'wait'; tr.t = 0; for (const c of tr.cars) c.spr.anims.pause(); }
    } else if (tr.state === 'wait') {
      if (Math.random() < dt * 1.2) this.trainPuff();
      if (tr.t > 9) { tr.state = 'out'; tr.t = 0; for (const c of tr.cars) c.spr.anims.resume(); }
    } else if (tr.state === 'out') {
      const p = clamp01(tr.t / dur);
      tr.head = T.stopMx - dist * Math.pow(p, 2.0);
      if (Math.random() < dt * 4) this.trainPuff();
      if (p >= 1) { tr.state = 'gone'; tr.t = 0; }
    } else if (tr.state === 'gone') {
      if (tr.t > 7) { tr.state = 'in'; tr.t = 0; tr.whistled = false; tr.from = T.fromMx; tr.dur = dur; }
    }
    for (const c of tr.cars) if (tr.state !== 'wait' && c.key && !c.spr.anims.isPlaying && !c.spr.anims.isPaused) c.spr.play(c.key);
    this.placeTrain();
  }

  trainPuff() {
    const e = this.train.cars[0].spr;
    this.smoke.emitParticleAt(e.x + 18, e.y - 118, 1);
  }

  /**
   * the train pulls in now (the intro calls this when stage 3 begins): it comes off the bridge a few metres
   * before the station and stops there within ~2.3 s; the intro plays the whistle itself. Returns false when
   * the town's pictures are not loaded (the train then arrives the long way once they are).
   */
  trainArrive(intro) {
    if (!this.train) this.addTrain();
    const tr = this.train, T = L.TRAIN;
    if (!tr) return false;
    tr.state = 'in'; tr.t = 0;
    tr.from = intro ? T.stopMx - (T.introRun || 8) : T.fromMx;
    tr.dur = intro ? (T.introSec || 2.3) : ((T.stopMx - T.fromMx) / T.speed) * 1.6;
    tr.whistled = !!intro;
    tr.head = tr.from;
    for (const c of tr.cars) if (c.key && !this.reduced) c.spr.play(c.key);
    this.placeTrain();
    return true;
  }

  /** the ferry glides towards the terminal now (the intro's city beat); the intro plays the horn itself */
  ferryArrive() {
    const def = L.SHIPS.find((d) => d.char === 'ferry');
    if (!def || def.s > this.stage) return false;
    let sp = this.ships.find((w) => w.def === def);
    if (!sp) { this.addShip(def); sp = this.ships.find((w) => w.def === def); }
    if (!sp) return false;
    sp.mx = def.stopMx - (def.introRun || 4.5); sp.state = 'in'; sp.t = 0; sp.cued = true;
    this.placeShip(sp);
    return true;
  }

  addShip(sh) {
    const s = this.scene;
    const anim = sh.char === 'ferry' ? 'idle' : sh.anim || 'move';
    const a = TitleAssets.actor(sh.char + ':' + anim + ':' + sh.dir);
    if (!a || !TitleAssets.ready(sh.s)) return;
    const key = a.frames.length > 1 ? TitleAssets.anim(s, sh.char + ':' + anim + ':' + sh.dir, a.frames, a.fps) : null;
    const spr = s.add.sprite(0, 0, a.frames[0][0], a.frames[0][1]).setOrigin(a.ox, a.oy).setScale((sh.scale || 1) / a.scale);
    if (key && !this.reduced) spr.play(key);
    if (sh.flip) spr.setFlipX(true);
    spr.setTint(this.tint);
    this.tintables.push(spr);
    this.put(spr);
    let lt = null;
    if (sh.char === 'ferry') {
      const gl = Assets.sprite('fx_glow');
      lt = s.add.image(0, 0, gl.tex, gl.frame).setBlendMode(ADD()).setTint(0xffe2a0).setScale(1.2, 0.5).setAlpha(0);
      this.put(lt);
    }
    const ship = { def: sh, spr, lt, mx: sh.char === 'ferry' ? sh.fromMx + (sh.stopMx - sh.fromMx) * 0.55 : sh.fromMx + (sh.toMx - sh.fromMx) * hash(sh.my * 7), state: 'in', t: 0, ph: hash(sh.my) * 6.28, fade: 0 };
    this.ships.push(ship);
    this.placeShip(ship);
  }

  placeShip(sp) {
    const d = sp.def;
    const x = wx(sp.mx, d.my), y = wy(sp.mx, d.my) + L.WATER_PX + Math.sin(this.time * 1.75 + sp.ph) * 2.2;
    sp.spr.setPosition(x, y).setDepth(y - 200);
    const span = Math.abs(d.toMx - d.fromMx);
    const p = (sp.mx - Math.min(d.fromMx, d.toMx)) / span;
    const edge = clamp01(Math.min(p, 1 - p) * 8);
    sp.spr.setAlpha(edge * sp.fade);
    if (sp.lt) { const k = d.scale || 1; sp.lt.setPosition(x - 20 * k, y - 90 * k).setDepth(y - 199).setAlpha(this.lampK * edge * sp.fade * 0.75); }
  }

  updateShips(dt) {
    for (const sp of this.ships) {
      sp.fade = Math.min(1, sp.fade + dt * 1.2);
      const d = sp.def;
      if (!this.reduced) {
        if (d.char === 'ferry') {
          sp.t += dt;
          if (sp.state === 'in') {
            const rem = d.stopMx - sp.mx;
            sp.mx += Math.max(0.12, Math.min(d.speed, rem * 0.35)) * dt;
            if (rem < 0.05) { sp.state = 'wait'; sp.t = 0; if (!sp.cued) this.cue('ship', 0.55); sp.cued = false; }
          } else if (sp.state === 'wait') {
            if (sp.t > 7) { sp.state = 'out'; sp.t = 0; }
          } else {
            sp.mx += Math.min(d.speed, 0.15 + sp.t * 0.35) * dt;
            if (sp.mx > d.toMx) { sp.mx = d.fromMx; sp.state = 'in'; sp.t = 0; }
          }
        } else {
          const dir = Math.sign(d.toMx - d.fromMx);
          sp.mx += dir * d.speed * dt;
          if ((sp.mx - d.toMx) * dir > 0) sp.mx = d.fromMx;
        }
      }
      this.placeShip(sp);
    }
  }

  addGull(g, i) {
    const s = this.scene;
    if (!TitleAssets.ready(2)) return;
    const a = TitleAssets.actor('seagull:fly:SE');
    if (!a) return;
    const spr = s.add.sprite(0, 0, a.frames[0][0], a.frames[0][1]).setOrigin(a.ox, a.oy).setScale(1 / a.scale);
    spr.setTint(this.tint);
    this.tintables.push(spr);
    this.put(spr);
    this.gulls.push({ def: g, spr, ang: hash(i + 1) * 6.28, key: null, fade: 0 });
  }

  updateGulls(dt) {
    for (const gl of this.gulls) {
      const g = gl.def;
      gl.fade = Math.min(1, gl.fade + dt);
      if (!this.reduced) gl.ang += g.speed * dt;
      const mx = g.cx + Math.cos(gl.ang) * g.r, my = g.cy + Math.sin(gl.ang) * g.r;
      const x = wx(mx, my), y = wy(mx, my) - g.h - Math.sin(gl.ang * 2) * 12;
      // direction of travel (tangent)
      const vx = wx(-Math.sin(gl.ang), Math.cos(gl.ang)), vy = wy(-Math.sin(gl.ang), Math.cos(gl.ang));
      const flip = vx < 0;
      const name = vy >= 0 ? GULL_SE : GULL_NE;
      if (gl.key !== name) {
        const a = TitleAssets.actor(name);
        if (a) {
          const k = TitleAssets.anim(this.scene, name, a.frames, a.fps);
          if (k) { if (this.reduced) gl.spr.setTexture(a.frames[0][0], a.frames[0][1]); else gl.spr.play(k, true); gl.spr.setOrigin(a.ox, a.oy); }
        }
        gl.key = name;
      }
      gl.spr.setFlipX(flip).setPosition(x, y).setDepth(D_AIR + y * 0.001).setAlpha(gl.fade);
    }
  }

  updateBob() {
    const t = this.time;
    for (const r of this.recs) {
      if (r.bob < 0 || !r.img || !r.shown || r.popMode !== 0) continue;
      r.img.y = r.y + Math.sin(t * 1.8 + r.bob) * 1.6;
    }
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    this.dt = dt;
    this.time += dt;
    if (this.lifeAt !== undefined && this.time >= this.lifeAt) { this.spawnLife(this.lifeStage); this.lifeAt = undefined; }
    this.updatePops();
    this.updateLights();
    this.updateSmoke(dt);
    this.updateWalkers(dt);
    this.updateVehicles(dt);
    this.updateTrain(dt);
    this.updateShips(dt);
    this.updateGulls(dt);
    if (!this.reduced) this.updateBob();
  }

  /** remove every moving thing (people, vehicles, train, ships, gulls) - for a replay of the intro */
  clearLife() {
    const kill = (o) => { if (o) { const i = this.tintables.indexOf(o); if (i >= 0) this.tintables.splice(i, 1); o.destroy(); } };
    for (const w of this.walkers) { kill(w.spr); kill(w.shadow); if (w.stack) w.stack.forEach(kill); }
    for (const v of this.vehicles) { kill(v.spr); kill(v.hl); }
    for (const sp of this.ships) { kill(sp.spr); kill(sp.lt); }
    for (const g of this.gulls) kill(g.spr);
    if (this.train) for (const c of this.train.cars) kill(c.spr);
    this.walkers.length = 0; this.vehicles.length = 0; this.ships.length = 0; this.gulls.length = 0;
    this.train = null;
    this.lifeAt = undefined;
  }

  /** world rect of the island (+ margin) for the camera */
  static focusOf(stage) {
    const c = L.CAMERA[stage] || L.CAMERA[4];
    return { x: wx(c.mx, c.my), y: wy(c.mx, c.my), span: c.span };
  }

  destroy() {
    // the scene destroys the game objects; drop references
    this.recs.length = 0; this.tintables.length = 0; this.active.length = 0;
    this.walkers.length = 0; this.vehicles.length = 0; this.ships.length = 0; this.gulls.length = 0;
  }
}
