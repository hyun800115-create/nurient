// The backdrop behind the island (screen space, the title's "sky" camera): sky gradients for day / dusk /
// night, stars, the moon, the aurora, clouds, far + near snowy mountains (a far-away city at night once
// the island became a city), and the sea from the horizon down. The sea texture is locked to the island's
// camera (it zooms and pans with the diorama) while the strips move much less: parallax.
// Pictures: the title_art fragment (assets/title, keys ttl_*) with its own tints / parallax from its
// manifest meta; procedural stand-ins (TitleFx) for anything that is not loaded (yet). Art that lands
// while the title plays replaces its stand-in in place (sky, stars, moon, aurora) or fades in over it
// (clouds, mountains, forest, the far city): lateArt().
import { Assets } from '../core/Assets.js';
import { TitleAssets } from './TitleAssets.js';
import { lerpColor, TitleFx } from './TitleFx.js';

const HAZE = [0xf4f9ff, 0xffd9b8, 0x5873ac];        // horizon haze per time
const SEA = [0xffffff, 0xe7b3bd, 0x5f73b2];         // sea tint
// fallback tints for strips the art manifest does not give one for
const STRIP_TINT = { dusk: 0xf3b9b4, night: 0x5f72ad };
const PARALLAX = { ttl_clouds: 0.05, ttl_mtn_far: 0.08, ttl_city_far: 0.1, ttl_city_lights: 0.1, ttl_mtn_mid: 0.16, ttl_forest: 0.3 };
const FADE_IN = 0.7;            // seconds a late strip takes to fade in over its stand-in

function hex(s) { return typeof s === 'string' ? parseInt(s.replace('#', ''), 16) : s; }
function tod3(c0, c1, c2, t) { return t <= 1 ? lerpColor(c0, c1, Math.max(0, t)) : lerpColor(c1, c2, Math.min(1, t - 1)); }

export class TitleSky {
  constructor(scene, put, W, H, layout) {
    this.scene = scene; this.put = put; this.W = W; this.H = H; this.L = layout;
    this.t = 0;
    this.tod = -1;
    this.cityK = 0;
    this.nightK = 0;
    this.horizon = Math.round(H * layout.horizonY);
    this.strips = [];
    this.fbK = 1;               // procedural mountains (stand-ins) fade out when the painted ones land
    this.fading = false;
    this.build();
  }

  art(key) { return TitleAssets.artSprite(this.scene, key); }

  /** a procedural stand-in (made on first use) */
  fb(key) { return TitleFx.ensure(this.scene, key); }

  get tints() { const meta = TitleAssets.art && TitleAssets.art.meta; return (meta && meta.tints) || {}; }

  /** a horizontal strip (tile x) with its bottom at y; null when the art is missing */
  strip(key, y, depth, opts = {}, fadeIn = false) {
    const a = this.art(key);
    if (!a) return null;
    const s = this.scene;
    const fr = s.textures.get(a.tex).get(a.frame);
    const fw = fr.realWidth, fh = fr.realHeight;
    const sc = (this.W / fw) * (opts.scale || 1);
    const ts = s.add.tileSprite(this.W / 2, y, this.W + 8, fh * sc, a.tex, a.frame).setOrigin(0.5, 1).setDepth(depth);
    ts.tileScaleX = ts.tileScaleY = sc;
    if (opts.add) ts.setBlendMode(Phaser.BlendModes.ADD);
    this.put(ts);
    const st = { key, ts, sc, p: PARALLAX[key] || 0.1, drift: opts.drift || 0, base: y, tint: opts.tint !== false, city: !!opts.city, k: fadeIn ? 0 : 1 };
    if (fadeIn) this.fading = true;
    this.strips.push(st);
    if (st.tint && this.tod >= 0) ts.setTint(this.stripTint(st, this.tod));
    this.alphaStrip(st);
    return st;
  }

  /** the strips, far to near (bottoms relative to the horizon). Missing ones are made when their art lands. */
  makeStrips(late) {
    const H = this.H, hz = this.horizon;
    // (the title_art strips are painted for a backdrop whose foot is hidden by the diorama; here the sea
    // runs up to the far shore, so the forest is drawn as a smaller, farther tree line)
    const defs = [
      ['clouds', 'ttl_clouds', hz - H * 0.115, 5.5, { drift: 4 }],
      ['mtnFar', 'ttl_mtn_far', hz - H * 0.035, 6, {}],
      ['cityFar', 'ttl_city_far', hz - H * 0.022, 6.2, { scale: 0.8, city: true }],
      ['cityLights', 'ttl_city_lights', hz - H * 0.022, 6.3, { add: true, tint: false, scale: 0.8, city: true }],
      ['mtnMid', 'ttl_mtn_mid', hz - H * 0.006, 7, {}],
      ['forest', 'ttl_forest', hz + 4, 7.5, { scale: 0.42 }],
    ];
    let made = false;
    for (const [name, key, y, d, o] of defs) {
      if (this[name]) continue;
      // (the far city fades in with cityK anyway: no extra fade)
      this[name] = this.strip(key, y, d, o, late && !o.city);
      if (this[name]) made = true;
    }
    return made;
  }

  build() {
    const s = this.scene, W = this.W, H = this.H, hz = this.horizon;
    const add = (o, d) => { o.setDepth(d); this.put(o); return o; };
    const sky = (key, fb, d) => {
      const a = this.art(key);
      const im = add(a ? s.add.image(W / 2, 0, a.tex, a.frame) : s.add.image(W / 2, 0, this.fb(fb)), d).setOrigin(0.5, 0);
      im.setDisplaySize(W + 4, hz + 60);
      im.fromArt = !!a;
      im.artKey = key;
      return im;
    };
    this.skyDay = sky('ttl_sky_day', 'ttl_fx_sky_day', 0);
    this.skyDusk = sky('ttl_sky_dusk', 'ttl_fx_sky_dusk', 1);
    this.skyNight = sky('ttl_sky_night', 'ttl_fx_sky_night', 2);
    this.stars = add(s.add.image(W / 2, 0, '__WHITE'), 3).setOrigin(0.5, 0);
    this.moon = add(s.add.image(W * 0.12, H * 0.075, '__WHITE'), 4);
    this.aurora1 = add(s.add.image(W * 0.5, H * 0.02, '__WHITE'), 5).setOrigin(0.5, 0).setBlendMode(Phaser.BlendModes.ADD);
    this.aurora2 = add(s.add.image(W * 0.56, H * 0.06, '__WHITE'), 5).setOrigin(0.5, 0).setBlendMode(Phaser.BlendModes.ADD).setFlipX(true);
    this.nightArt = null;
    this.setNightPictures();
    this.makeStrips(false);
    if (!this.mtnFar && !this.mtnMid) this.makeStandIns();
    // the sea: world-locked texture under the horizon
    const sea = Assets.sprite('water_sea');
    this.sea = add(s.add.tileSprite(0, hz, W, H - hz, sea.tex, sea.frame).setOrigin(0, 0), 8);
    this.haze = add(s.add.image(W / 2, hz - 2, TitleFx.ensure(s, 'ttl_fx_haze')).setOrigin(0.5, 0), 9);
    this.haze.setDisplaySize(W + 4, Math.max(70, H * 0.07));
  }

  /** procedural far + near mountains (no painted ones loaded) */
  makeStandIns() {
    const s = this.scene, W = this.W, hz = this.horizon;
    this.fbFar = s.add.image(W / 2, hz + 2, this.fb('ttl_fx_mtn_far')).setOrigin(0.5, 1).setDepth(6);
    this.fbFar.setScale((W * 1.5) / this.fbFar.frame.realWidth, ((W * 1.5) / this.fbFar.frame.realWidth) * 0.62);
    this.fbNear = s.add.image(W / 2, hz + 4, this.fb('ttl_fx_mtn_near')).setOrigin(0.5, 1).setDepth(7);
    this.fbNear.setScale((W * 1.6) / this.fbNear.frame.realWidth, ((W * 1.6) / this.fbNear.frame.realWidth) * 0.5);
    this.put(this.fbFar); this.put(this.fbNear);
    this.fbK = 1;
  }

  /** stars, moon and aurora: the painted ones when loaded, else the stand-ins (swapped in place) */
  setNightPictures() {
    const W = this.W, H = this.H, hz = this.horizon;
    const st = this.art('ttl_stars'), mo = this.art('ttl_moon'), au = this.art('ttl_aurora');
    const sig = (st ? 1 : 0) + (mo ? 2 : 0) + (au ? 4 : 0);
    if (this.nightArt === sig) return;
    this.nightArt = sig;
    if (st) { this.stars.setTexture(st.tex, st.frame); this.stars.setScale(W / this.stars.frame.realWidth); }
    else { this.stars.setTexture(this.fb('ttl_fx_stars')); this.stars.setDisplaySize(W * 1.1, hz * 0.95); }
    if (mo) this.moon.setTexture(mo.tex, mo.frame).setScale(0.62); else this.moon.setTexture(this.fb('ttl_fx_moon')).setScale(1.2);
    const auTex = au ? au.tex : this.fb('ttl_fx_aurora'), auFr = au ? au.frame : undefined;
    this.aurora1.setTexture(auTex, auFr); this.aurora1.setDisplaySize(W * 1.45, hz * 0.85);
    this.aurora2.setTexture(auTex, auFr); this.aurora2.setDisplaySize(W * 1.2, hz * 0.6);
    this.auroraSX = [this.aurora1.scaleX, this.aurora2.scaleX];
    void H;
  }

  /** title art arrived after the title opened: use it (in place, or fading in over the stand-ins) */
  lateArt() {
    for (const im of [this.skyDay, this.skyDusk, this.skyNight]) {
      if (im.fromArt) continue;
      const a = this.art(im.artKey);
      if (!a) continue;
      im.setTexture(a.tex, a.frame); im.setDisplaySize(this.W + 4, this.horizon + 60); im.fromArt = true;
    }
    this.setNightPictures();
    if (this.makeStrips(true)) {
      for (const st of this.strips) if (st.tint && this.tod >= 0) st.ts.setTint(this.stripTint(st, this.tod));
    }
  }

  stripTint(st, t) {
    const td = this.tints;
    const dusk = hex((td.dusk && td.dusk[st.key]) || STRIP_TINT.dusk);
    const night = hex((td.night && td.night[st.key]) || STRIP_TINT.night);
    return tod3(0xffffff, dusk, night, t);
  }

  alphaStrip(st) {
    if (st.key === 'ttl_city_far') st.ts.setAlpha(st.k * this.cityK * 0.9);
    else if (st.key === 'ttl_city_lights') st.ts.setAlpha(st.k * this.cityK * this.nightK);
    else st.ts.setAlpha(st.k);
  }

  /** time of day 0 day .. 1 dusk .. 2 night */
  setTime(t) {
    if (Math.abs(t - this.tod) < 0.002) return;
    this.tod = t;
    const night = Math.max(0, t - 1);
    this.skyDusk.setAlpha(Math.min(1, t));
    this.skyNight.setAlpha(night);
    // a sky fully covered by the one above it is not drawn (fill rate on phones)
    this.skyDay.setVisible(t < 1);
    this.skyDusk.setVisible(t > 0.001 && night < 1);
    this.nightK = night;
    const hz = tod3(HAZE[0], HAZE[1], HAZE[2], t);
    this.haze.setTint(hz);
    this.haze.setAlpha(0.85 - night * 0.3);
    this.sea.setTint(tod3(SEA[0], SEA[1], SEA[2], t));
    for (const st of this.strips) if (st.tint) st.ts.setTint(this.stripTint(st, t));
    if (this.fbFar) { this.fbFar.setTint(tod3(0xf6f9ff, 0xf3b9b4, 0x6f86c0, t)); this.fbNear.setTint(tod3(0xffffff, 0xe9b5aa, 0x5d73ad, t)); }
    this.moon.setAlpha(Math.max(0, night * 1.2 - 0.2));
    this.applyCity();
  }

  /** the far-away city across the bay (only once the island itself became a city) */
  setCity(k) { this.cityK = k; this.applyCity(); }
  applyCity() {
    if (this.cityFar) this.alphaStrip(this.cityFar);
    if (this.cityLights) this.alphaStrip(this.cityLights);
  }

  destroy() {
    for (const o of [this.skyDay, this.skyDusk, this.skyNight, this.stars, this.moon, this.aurora1, this.aurora2, this.sea, this.haze, this.fbFar, this.fbNear]) if (o) o.destroy();
    for (const st of this.strips) st.ts.destroy();
    this.strips.length = 0;
  }

  /**
   * follow the island camera: z = logical px per world px, (fx, fy) = world point shown at screen (W/2, focusY*H)
   */
  update(dt, z, fx, fy, still) {
    if (!still) this.t += dt;
    const W = this.W, H = this.H, hz = this.horizon, L = this.L;
    // late strips fading in over the stand-ins
    if (this.fading) {
      let any = false;
      for (const st of this.strips) if (st.k < 1) { st.k = Math.min(1, st.k + dt / FADE_IN); this.alphaStrip(st); any = true; }
      if (this.fbFar && (this.mtnFar || this.mtnMid)) {
        this.fbK = Math.max(0, this.fbK - dt / FADE_IN);
        this.fbFar.setAlpha(this.fbK); this.fbNear.setAlpha(this.fbK);
        if (this.fbK <= 0) { this.fbFar.destroy(); this.fbNear.destroy(); this.fbFar = this.fbNear = null; } else any = true;
      }
      this.fading = any;
    }
    // sea texture locked to the world: screen (sx, sy) shows world (fx + (sx - W/2)/z, fy + (sy - focusY*H)/z)
    const sea = this.sea;
    sea.tileScaleX = sea.tileScaleY = z;
    sea.tilePositionX = (fx - W / 2 / z) + this.t * 9;
    sea.tilePositionY = (fy + (hz - L.focusY * H) / z) + Math.sin(this.t * 0.45) * 5;
    // parallax strips: they slide a little with the camera's pan, clouds drift on their own
    const pan = fx * z;
    for (const st of this.strips) st.ts.tilePositionX = (pan * st.p + this.t * st.drift) / st.sc;
    // night sky life
    const n = this.nightK || 0;
    if (n > 0.001) {
      const tt = this.t;
      this.stars.setAlpha(n * (0.88 + 0.12 * Math.sin(tt * 1.7)));
      this.aurora1.setAlpha(n * (0.8 + 0.2 * Math.sin(tt * 0.37)));
      this.aurora2.setAlpha(n * (0.45 + 0.25 * Math.sin(tt * 0.29 + 1.3)));
      if (!still) {
        this.aurora1.x = W * 0.5 + Math.sin(tt * 0.11) * W * 0.05;
        this.aurora2.x = W * 0.56 + Math.sin(tt * 0.083 + 2) * W * 0.06;
        this.aurora1.scaleX = this.auroraSX[0] * (1 + 0.04 * Math.sin(tt * 0.21));
        this.aurora2.scaleX = this.auroraSX[1] * (1 + 0.05 * Math.sin(tt * 0.17 + 1));
      }
    } else {
      this.stars.setAlpha(0); this.aurora1.setAlpha(0); this.aurora2.setAlpha(0);
    }
  }
}
