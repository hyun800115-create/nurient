// The backdrop behind the island (screen space, the title's "sky" camera): sky gradients for day / dusk /
// night, stars, the moon, the aurora, clouds, far + near snowy mountains (a far-away city at night once
// the island became a city), and the sea from the horizon down. The sea texture is locked to the island's
// camera (it zooms and pans with the diorama) while the strips move much less: parallax.
// Pictures: the title_art fragment (assets/title, keys ttl_*) with its own tints / parallax from its
// manifest meta; procedural stand-ins (TitleFx) for anything that is missing.
import { Assets } from '../core/Assets.js';
import { TitleAssets } from './TitleAssets.js';
import { lerpColor } from './TitleFx.js';

const HAZE = [0xf4f9ff, 0xffd9b8, 0x5873ac];        // horizon haze per time
const SEA = [0xffffff, 0xe7b3bd, 0x5f73b2];         // sea tint
// fallback tints for strips the art manifest does not give one for
const STRIP_TINT = { dusk: 0xf3b9b4, night: 0x5f72ad };
const PARALLAX = { ttl_clouds: 0.05, ttl_mtn_far: 0.08, ttl_city_far: 0.1, ttl_city_lights: 0.1, ttl_mtn_mid: 0.16, ttl_forest: 0.3 };

function hex(s) { return typeof s === 'string' ? parseInt(s.replace('#', ''), 16) : s; }
function tod3(c0, c1, c2, t) { return t <= 1 ? lerpColor(c0, c1, Math.max(0, t)) : lerpColor(c1, c2, Math.min(1, t - 1)); }

export class TitleSky {
  constructor(scene, put, W, H, layout) {
    this.scene = scene; this.put = put; this.W = W; this.H = H; this.L = layout;
    this.t = 0;
    this.tod = -1;
    this.cityK = 0;
    this.horizon = Math.round(H * layout.horizonY);
    const meta = TitleAssets.art && TitleAssets.art.meta;
    this.tints = (meta && meta.tints) || {};
    this.strips = [];
    this.build();
  }

  art(key) { return TitleAssets.artSprite(this.scene, key); }

  /** a horizontal strip (tile x) with its bottom at y; returns null when the art is missing */
  strip(key, y, depth, opts = {}) {
    const a = this.art(key);
    if (!a) return null;
    const s = this.scene;
    const fw = s.textures.get(a.tex).get(a.frame).realWidth, fh = s.textures.get(a.tex).get(a.frame).realHeight;
    const sc = (this.W / fw) * (opts.scale || 1);
    const ts = s.add.tileSprite(this.W / 2, y, this.W + 8, fh * sc, a.tex, a.frame).setOrigin(0.5, 1).setDepth(depth);
    ts.tileScaleX = ts.tileScaleY = sc;
    if (opts.add) ts.setBlendMode(Phaser.BlendModes.ADD);
    this.put(ts);
    const st = { key, ts, sc, p: PARALLAX[key] || 0.1, drift: opts.drift || 0, base: y, tint: opts.tint !== false };
    this.strips.push(st);
    return st;
  }

  build() {
    const s = this.scene, W = this.W, H = this.H, hz = this.horizon;
    const add = (o, d) => { o.setDepth(d); this.put(o); return o; };
    const sky = (key, fb, d) => {
      const a = this.art(key) || { tex: fb, frame: undefined };
      const im = add(s.add.image(W / 2, 0, a.tex, a.frame).setOrigin(0.5, 0), d);
      im.setDisplaySize(W + 4, hz + 60);
      return im;
    };
    this.skyDay = sky('ttl_sky_day', 'ttl_fx_sky_day', 0);
    this.skyDusk = sky('ttl_sky_dusk', 'ttl_fx_sky_dusk', 1);
    this.skyNight = sky('ttl_sky_night', 'ttl_fx_sky_night', 2);
    const st = this.art('ttl_stars');
    if (st) { this.stars = add(s.add.image(W / 2, 0, st.tex, st.frame).setOrigin(0.5, 0), 3); this.stars.setScale(W / this.stars.frame.realWidth); }
    else { this.stars = add(s.add.image(W / 2, 0, 'ttl_fx_stars').setOrigin(0.5, 0), 3); this.stars.setDisplaySize(W * 1.1, hz * 0.95); }
    const mo = this.art('ttl_moon');
    this.moon = mo ? add(s.add.image(W * 0.12, H * 0.075, mo.tex, mo.frame), 4).setScale(0.62) : add(s.add.image(W * 0.12, H * 0.075, 'ttl_fx_moon'), 4).setScale(1.2);
    const au = this.art('ttl_aurora');
    const auTex = au ? au.tex : 'ttl_fx_aurora';
    this.aurora1 = add(s.add.image(W * 0.5, H * 0.02, auTex, au && au.frame).setOrigin(0.5, 0), 5).setBlendMode(Phaser.BlendModes.ADD);
    this.aurora1.setDisplaySize(W * 1.45, hz * 0.85);
    this.aurora2 = add(s.add.image(W * 0.56, H * 0.06, auTex, au && au.frame).setOrigin(0.5, 0), 5).setBlendMode(Phaser.BlendModes.ADD).setFlipX(true);
    this.aurora2.setDisplaySize(W * 1.2, hz * 0.6);
    this.auroraSX = [this.aurora1.scaleX, this.aurora2.scaleX];
    // strips, far to near (bottoms relative to the horizon)
    // (the title_art strips are painted for a backdrop whose foot is hidden by the diorama; here the sea
    // runs up to the far shore, so the forest is drawn as a smaller, farther tree line)
    this.clouds = this.strip('ttl_clouds', hz - H * 0.115, 5.5, { drift: 4 });
    this.mtnFar = this.strip('ttl_mtn_far', hz - H * 0.035, 6);
    this.cityFar = this.strip('ttl_city_far', hz - H * 0.022, 6.2, { scale: 0.8 });
    this.cityLights = this.strip('ttl_city_lights', hz - H * 0.022, 6.3, { add: true, tint: false, scale: 0.8 });
    this.mtnMid = this.strip('ttl_mtn_mid', hz - H * 0.006, 7);
    this.forest = this.strip('ttl_forest', hz + 4, 7.5, { scale: 0.42 });
    if (!this.mtnFar && !this.mtnMid) {
      // procedural stand-ins
      this.fbFar = add(s.add.image(W / 2, hz + 2, 'ttl_fx_mtn_far').setOrigin(0.5, 1), 6);
      this.fbFar.setScale((W * 1.5) / this.fbFar.frame.realWidth, ((W * 1.5) / this.fbFar.frame.realWidth) * 0.62);
      this.fbNear = add(s.add.image(W / 2, hz + 4, 'ttl_fx_mtn_near').setOrigin(0.5, 1), 7);
      this.fbNear.setScale((W * 1.6) / this.fbNear.frame.realWidth, ((W * 1.6) / this.fbNear.frame.realWidth) * 0.5);
    }
    if (this.cityFar) this.cityFar.ts.setAlpha(0);
    if (this.cityLights) this.cityLights.ts.setAlpha(0);
    // the sea: world-locked texture under the horizon
    const sea = Assets.sprite('water_sea');
    this.sea = add(s.add.tileSprite(0, hz, W, H - hz, sea.tex, sea.frame).setOrigin(0, 0), 8);
    this.haze = add(s.add.image(W / 2, hz - 2, 'ttl_fx_haze').setOrigin(0.5, 0), 9);
    this.haze.setDisplaySize(W + 4, Math.max(70, H * 0.07));
  }

  stripTint(st, t) {
    const td = this.tints;
    const dusk = hex((td.dusk && td.dusk[st.key]) || STRIP_TINT.dusk);
    const night = hex((td.night && td.night[st.key]) || STRIP_TINT.night);
    return tod3(0xffffff, dusk, night, t);
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
    const n = this.nightK || 0;
    if (this.cityFar) this.cityFar.ts.setAlpha(this.cityK * 0.9);
    if (this.cityLights) this.cityLights.ts.setAlpha(this.cityK * n);
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
