// Water lab scenes (tools/test/water_lab.html). Builds three phone-sized test scenes with the REAL game
// textures and sprites and draws the sea either with the new src/systems/Water.js (mode=new) or the way
// src/systems/Ground.js draws it today (mode=old: scrolling water_sea tileSprite + fish tileSprites +
// baked shallow band + shore_foam strip). Time is driven only by window.__W.frame(t) (deterministic
// captures) unless ?play=1.
import { Water, WaterMask, WATER_PX } from '../../../src/systems/Water.js';
import { shoreY } from '../../../src/data/world.js';
import { Loader, iso, ISO } from './assets.js';
import { bakeVillageLand, bakeTexturedLand } from './land.js';

const Q = new URLSearchParams(location.search);
const SCENE = Q.get('scene') || 'village';
const MODE = Q.get('mode') || 'new';
const QUALITY = Q.get('quality') || 'high';
const CW = +(Q.get('w') || 390), CH = +(Q.get('h') || 844), DPR = +(Q.get('dpr') || 1);
const ZOOM = +(Q.get('zoom') || 1.0);
const PLAY = Q.get('play') === '1';
const RENDERER = Q.get('renderer') === 'canvas' ? Phaser.CANVAS : Phaser.WEBGL;
const PRECISION = Q.get('precision') || undefined;   // 'mediump': fragment stage forced to mediump (mediump-only GPUs)
const DARK = +(Q.get('dark') || 0);                 // night test: Water.setLighting({ dark })
const NOCONTACT = Q.get('contacts') === '0';
const K = (CW * DPR) / 720;                      // canvas px per logical px (the game's View.k)
const ROOT = new URL('../../', location.href).href;

const W = (window.__W = { ready: false, scene: SCENE, mode: MODE, errors: [], t: +(Q.get('t') || 0) });

const loader = new Loader(ROOT + 'assets/');

// ------------------------------------------------------------------------------------------- scenes
// Each scene: fragments to read, keys to load, camera centre, build(scene) -> {water, tick(t)}
const SCENES = {
  village: {
    fragments: ['ground', 'water', 'props', 'buildings', 'characters', 'ui2', 'fx'],
    keys: ['ground_snow', 'water_sea', 'water_shallow', 'shore_foam', 'fish_school', 'dock_pier', 'boat_small', 'ice_chunk',
      'lamp_post', 'barrel', 'crate', 'char:boat_rowboat', 'char:boat_fishing', 'char:villager_a', 'char:fisherman', 'char:villager_b',
      'fx_wake', 'fx_wake_ring', 'fx_splash', 'fx_wake_v2', 'fx_wake_v2_ne', 'fx_swim_ripple', 'fx_splash_small', 'fx_sparkle_water'],
    camera: [1430, 250],
    build: buildVillage,
  },
  harbor: {
    fragments: ['ground', 'water', 'harbor', 'ships', 'buildings', 'characters', 'props', 'ui2', 'fx'],
    keys: ['ground_snow', 'ground_plaza', 'water_sea', 'fish_school', 'quay_x', 'quay_y', 'quay_corner', 'breakwater_x', 'breakwater_end_xp',
      'pier_x', 'pier_end_xp', 'pier_root_xn', 'buoy', 'bollard', 'harbor_lamp', 'crate_stack', 'barrel_stack', 'net_rack',
      'char:tugboat', 'char:sailboat', 'char:boat_rowboat', 'char:villager_b', 'char:fisherman',
      'fx_wake', 'fx_wake_ring', 'fx_wave_crash', 'fx_wake_v2', 'fx_wake_v2_ne', 'fx_sparkle_water'],
    camera: [1420, 650],
    build: buildHarbor,
  },
  beach: {
    fragments: ['ground', 'water', 'harbor', 'props', 'characters', 'villagers', 'buildings', 'beach', 'beachfolk', 'ui2', 'fx'],
    keys: ['ground_snow', 'ground_sand', 'ground_sand_wet', 'water_shore_ramp', 'water_sea', 'shore_foam', 'fish_school', 'breakwater_y', 'breakwater_end_yn',
      'parasol_red', 'parasol_blue', 'parasol_yellow', 'parasol_a', 'parasol_b', 'sun_lounger', 'swim_ring_red', 'beach_ball', 'lifeguard_tower', 'palm_tree_a',
      'char:villager_a', 'char:villager_c', 'char:npc_kid_boy', 'char:npc_kid_girl', 'char:npc_teen_girl', 'char:boat_rowboat', 'barrel', 'crate',
      'fx_swim_ripple', 'fx_splash_small', 'fx_splash_big', 'fx_shore_wave_x', 'fx_shore_wave_y', 'fx_wave_crash', 'fx_sparkle_water', 'fx_wake_v2'],
    camera: [1010, 640],
    build: buildBeach,
  },
};

const SPEC = SCENES[SCENE];

class Lab extends Phaser.Scene {
  constructor() { super('lab'); }
  preload() { loader.queue(this, SPEC.keys); }
  create() {
    try {
      loader.anims(this);
      const cam = this.cameras.main;
      cam.setZoom(ZOOM * K);
      cam.centerOn(SPEC.camera[0], SPEC.camera[1]);
      cam.setBackgroundColor('#dbe6f2');
      const built = SPEC.build(this);
      W.water = built.water || null;
      W.tick = built.tick || (() => {});
      W.built = built;
      W.cam = cam;
      W.game = this.game;
      W.scene = this;
      if (W.water && DARK) {
        W.water.setLighting({ dark: DARK });
        // the DayClock's MULTIPLY overlay (a tinted white image, like src/systems/DayClock.js)
        const ov = this.add.rectangle(0, 0, 8000, 8000, 0x5a6ea8).setOrigin(0.5).setScrollFactor(0).setDepth(9999).setBlendMode(Phaser.BlendModes.MULTIPLY);
        ov.setPosition(cam.width / 2, cam.height / 2);
      }
      if (!PLAY) this.game.loop.sleep();
      W.frame(W.t);
      W.ready = true;
    } catch (e) {
      W.errors.push(String(e && e.stack || e));
      console.error(e);
      W.ready = true;
    }
  }
  update(time, delta) {
    if (!PLAY) return;
    W.t += delta / 1000;
    W.apply(W.t);
  }
}

/** set every time-driven thing to time t (no randomness, no wall clock) */
W.apply = (t) => {
  W.t = t;
  if (W.water) W.water.setTime(t);
  if (W.tick) W.tick(t);
};
/** draw one frame at time t (game loop asleep: synchronous render) */
W.frame = (t) => {
  W.apply(t);
  const g = W.game;
  g.step(1000 + t * 1000, 0);
  return true;
};
W.info = () => {
  const gl = W.game && W.game.renderer && W.game.renderer.gl;
  const lim = gl ? { maxFragUniformVectors: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS), fragHighp: !!(gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT) || {}).precision } : {};
  return Object.assign(W.water ? W.water.info() : { shader: false, mode: MODE }, lim, { precisionOpt: PRECISION || 'auto' });
};
/**
 * shader height vs Water.heightAt at the same world points: the debug program writes the surface height into
 * R/G (h = (R + G / 255) / 255 * 32 - 16), everything else hidden; a grid of canvas pixels is read back.
 */
W.heightSync = (times = [1.3, 4.7, 8.15]) => {
  const wt = W.water;
  if (!wt || !wt.isShader) return null;
  const list = W.scene.children.list.slice();
  const was = list.map((o) => o.visible);
  // (live list: one-shot sprites may be created while the clock is applied)
  const hide = () => { for (const o of W.scene.children.list) if (o !== wt.body) o.setVisible(false); };
  wt.setDebug('height');
  const gl = W.game.renderer.gl, cam = W.cam, px = new Uint8Array(4), diffs = [], worst = [];
  const Wc = W.game.canvas.width, Hc = W.game.canvas.height;
  for (const t of times) {
    W.apply(t); hide();
    W.game.step(1000 + t * 1000, 0);
    for (let sy = 20; sy < Hc; sy += 37) for (let sx = 11; sx < Wc; sx += 41) {
      const p = cam.getWorldPoint(sx + 0.5, sy + 0.5);
      if (wt.shoreDistance(p.x, p.y) < 12) continue;
      gl.readPixels(sx, Hc - 1 - sy, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const hs = ((px[0] + px[1] / 255) / 255) * 32 - 16;
      const dd = Math.abs(hs - wt.heightAt(p.x, p.y, t));
      diffs.push(dd);
      if (dd > 1) worst.push([+p.x.toFixed(0), +p.y.toFixed(0), +wt.shoreDistance(p.x, p.y).toFixed(1), +hs.toFixed(2), +wt.heightAt(p.x, p.y, t).toFixed(2), px[2], px[3]]);
    }
  }
  wt.setDebug(null);
  list.forEach((o, i) => o.setVisible(was[i]));
  W.frame(times[0]);
  diffs.sort((a, b) => a - b);
  const n = diffs.length;
  return { n, mean: +(diffs.reduce((a, b) => a + b, 0) / Math.max(1, n)).toFixed(4), p95: +(diffs[Math.floor(n * 0.95)] || 0).toFixed(4), max: +(diffs[n - 1] || 0).toFixed(4), worst: worst.slice(0, 5) };
};
W.setQuality = (q) => { if (W.water) W.water.setQuality(q); return W.info(); };
/** average ms per synchronous frame (gl.finish) over n frames */
W.perf = (n = 30, t0 = 0) => {
  const g = W.game, gl = g.renderer.gl;
  const stamp = () => { if (gl) { const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } };
  W.frame(t0); stamp();
  const a = performance.now();
  for (let i = 0; i < n; i++) { W.frame(t0 + i / 30); stamp(); }
  return (performance.now() - a) / n;
};
W.hideObjects = (v) => { for (const o of W.scene.children.list) if (o !== W.water?.body && o !== W.water?.shoreObj && o.__obj) o.setVisible(!v); };

await loader.fetchManifests(SPEC.fragments).catch((e) => W.errors.push('manifests: ' + e));
new Phaser.Game({
  type: RENDERER,
  parent: 'game',
  width: Math.round(CW * DPR),
  height: Math.round(CH * DPR),
  backgroundColor: '#dbe6f2',
  scale: { mode: Phaser.Scale.NONE, zoom: 1 / DPR },
  render: { antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' },
  banner: false,
  scene: Lab,
});

// ------------------------------------------------------------------------------------------- helpers
function obj(o) { o.__obj = true; return o; }

/** floating thing: bob with the water (heightAt), tilt a little (slopeAt), foam collar + shadow (addContact) */
function floater(sc, water, sprite, wx, wy, opts = {}) {
  const base = { x: wx, y: wy };
  const tiltK = opts.tilt !== undefined ? opts.tilt : 0.25;
  const slope = { x: 0, y: 0 };
  if (water && opts.contact && !NOCONTACT) {
    // contact circles on the water plane: [dx, dy (world px from the waterline point), r, foam, shadow]
    for (const c of opts.contact) water.addContact(wx + c[0], wy + c[1], c[2], { foam: c[3], shadow: c[4] });
  }
  if (water && opts.hull && !NOCONTACT) water.addHull(wx, wy, opts.hull[0], opts.hull[1], { foam: 0.8, shadow: 0.24 });
  return (t) => {
    let h = 0;
    if (water) {
      h = water.heightAt(base.x, base.y, t) * (opts.bob || 1);
      water.slopeAt(base.x, base.y, t, slope);
      sprite.setRotation(Math.max(-0.12, Math.min(0.12, -slope.x * tiltK)));
    } else {
      h = Math.sin(t * 1.9 + wx * 0.01) * 1.6;           // the old in-game feel: a plain sine
    }
    sprite.setPosition(base.x, base.y - h);
  };
}

/** a pool of one-shot sheet sprites driven by the lab clock: show(key, x, y, t0, t, scale, depth) */
function oneShots(sc) {
  const pool = [];
  let used = 0;
  return {
    begin() { used = 0; },
    show(key, x, y, t0, t, scale = 1, depth) {
      if (!loader.has(key)) return;
      const d = loader.sheetDef(key);
      const f = Math.floor((t - t0) * (d.fps || 20));
      if (f < 0 || f >= (d.frameCount || 1)) return;
      let s = pool[used];
      if (!s) { s = obj(sc.add.sprite(0, 0, key)); pool.push(s); }
      used++;
      s.setTexture(key, f).setOrigin(...(d.anchor || [0.5, 0.5])).setPosition(x, y).setScale(scale).setVisible(true).setDepth(depth !== undefined ? depth : y + 2);
    },
    end() { for (let i = used; i < pool.length; i++) pool[i].setVisible(false); },
  };
}

function frameAt(sprite, frames, fps, t) {
  if (!frames || !frames.length) return;
  sprite.setFrame(frames[Math.floor(t * fps) % frames.length]);
}

// ------------------------------------------------------------------------------------------- village
function buildVillage(sc) {
  const Wd = 3000;
  let maxShore = 0;
  for (let x = 0; x <= Wd; x += 8) maxShore = Math.max(maxShore, shoreY(x));
  const view = { x: 760, y: -60, w: 1400, h: 1300 };
  const ticks = [];
  let water = null;
  if (MODE === 'old') {
    // exactly like Ground.js today
    const seaH = Math.ceil(maxShore + 40);
    const sea = sc.add.tileSprite(0, -640, Wd, seaH + 640, 'water_sea').setOrigin(0, 0).setDepth(-20000);
    const f1 = sc.add.tileSprite(0, 40, Wd, 200, 'fish_school').setOrigin(0, 0).setDepth(-19900).setAlpha(0.55);
    const f2 = sc.add.tileSprite(0, 150, Wd, 200, 'fish_school').setOrigin(0, 0).setDepth(-19900).setAlpha(0.35).setTilePosition(130, 40);
    f2.setTileScale(0.8, 0.8);
    ticks.push((t) => {
      sea.tilePositionX = t * 6; sea.tilePositionY = Math.sin(t * 0.4) * 6;
      f1.tilePositionX = t * 22; f1.tilePositionY = Math.sin(t * 0.7) * 5;
      f2.tilePositionX = 130 + t * 14;
    });
    bakeVillageLand(sc, view, shoreY, { shallow: true, foam: true, rimWater: true });
  } else {
    water = new Water(sc, {
      region: { x: 0, y: -640, w: Wd, h: maxShore + 40 + 640 + 40 },
      mask: WaterMask.shoreY(shoreY),
      shoreTypes: 'snowbank',
      palette: 'winter_sea',
      quality: QUALITY,
      fish: [{ y0: 40, y1: 240, alpha: 0.55, scale: 1, speed: [22, 0], wobble: [5, 0.7] },
        { y0: 150, y1: 350, alpha: 0.35, scale: 0.8, speed: [14, 0], offset: [130, 40], wobble: [0, 0] }],
      manifest: loader.man.water,
      precision: PRECISION,
    });
    if (!water.drawsFish) {
      const f1 = sc.add.tileSprite(0, 40, Wd, 200, 'fish_school').setOrigin(0, 0).setDepth(-19900).setAlpha(0.55);
      const f2 = sc.add.tileSprite(0, 150, Wd, 200, 'fish_school').setOrigin(0, 0).setDepth(-19900).setAlpha(0.35).setTilePosition(130, 40);
      f2.setTileScale(0.8, 0.8);
      ticks.push((t) => { f1.tilePositionX = t * 22; f1.tilePositionY = Math.sin(t * 0.7) * 5; f2.tilePositionX = 130 + t * 14; });
    }
    bakeVillageLand(sc, view, shoreY, { shallow: false, foam: false, rimWater: false });
  }
  // the world decor of the coast (data/world.js): pier, small boats, ice chunks, lamp, barrels
  const pier = obj(loader.sprite(sc, 'dock_pier', 1460, 300));
  const bs1 = obj(loader.sprite(sc, 'boat_small', 1650, 250));
  const bs2 = obj(loader.sprite(sc, 'boat_small', 1290, 214)).setFlipX(true).setScale(0.85);
  const ice1 = obj(loader.sprite(sc, 'ice_chunk', 1120, 350)).setScale(0.55);
  obj(loader.sprite(sc, 'lamp_post', 1180, 470));
  obj(loader.sprite(sc, 'barrel', 1150, 470));
  obj(loader.sprite(sc, 'crate', 1205, 492));
  obj(loader.sprite(sc, 'crate', 1182, 448)).setScale(0.8);
  void pier;
  const hullX = (s) => [[-34 * s, -17 * s, 32 * s, 0.75, 0.22], [34 * s, 17 * s, 32 * s, 0.75, 0.22]];   // boat_small: 2.6 x 1.1 m along world X
  ticks.push(floater(sc, water, bs1, 1650, 250, { tilt: 0.3, contact: hullX(1) }));
  ticks.push(floater(sc, water, bs2, 1290, 214, { tilt: 0.3, contact: hullX(0.85) }));
  ticks.push(floater(sc, water, ice1, 1120, 350, { tilt: 0.15, bob: 0.7, contact: [[0, 2, 26, 0.6, 0.12]] }));
  // the pier posts standing in the water (dock_pier: 2 x 4.4 m along world +Y around its anchor)
  if (water && !NOCONTACT) {
    for (const [mx, my] of [[-1, 0.7], [1, 0.7], [-1, 2.2], [1, 2.2]]) {
      const p = iso(1460, 300, mx * 0.92, my);
      if (water.shoreDistance(p[0], p[1]) > 4) water.addContact(p[0], p[1], 7, { foam: 0.85, shadow: 0.1 });
    }
    water.addContact(1460, 300, 30, { foam: 0, shadow: 0.2 });           // the deck's shadow on the water
  }
  // the rowboat moored at the pier end, the fishing boat sailing by (NE heading) with a wake
  const row = loader.character(sc, 'boat_rowboat', 'idle', 'NE', 1600, 266);
  obj(row.sprite);
  // NE hull: along world -Y (screen up-right)
  ticks.push(floater(sc, water, row.sprite, 1600, 266, { tilt: 0.35, hull: [row.def, 'NE'] }));
  ticks.push((t) => frameAt(row.sprite, row.frames, 3, t));
  const fb = loader.character(sc, 'boat_fishing', 'sail', 'SE', 1200, 110);
  obj(fb.sprite);
  const def = loader.charDef('boat_fishing');
  const wp = (def.wakePoint && def.wakePoint.SE) || [-100, -48];
  const wake = loader.has('fx_wake_v2') ? obj(sc.add.sprite(0, 0, 'fx_wake_v2')) : (loader.has('fx_wake') ? obj(sc.add.sprite(0, 0, 'fx_wake')) : null);
  const wakeV2 = wake && wake.texture.key === 'fx_wake_v2';
  if (wake) { const sd = loader.sheetDef(wake.texture.key); wake.setOrigin(...(sd.anchor || [0.5, 0.5])).setScale(wakeV2 ? 1.9 : 1.2); }
  const fx = oneShots(sc);
  const path = (t) => {
    // a slow pass along the world X axis (screen down-right), 26 px/s, looping every 30 s
    const s = ((t * 26) % 780) - 60;
    return { x: 1180 + s * 0.894, y: 70 + s * 0.447 };
  };
  const fbC = water && !NOCONTACT ? water.addHull(0, 0, fb.def, 'SE', { foam: 0.85, shadow: 0.25 }) : null;
  ticks.push((t) => {
    const p = path(t);
    const h = water ? water.heightAt(p.x, p.y, t) : Math.sin(t * 1.9) * 1.6;
    fb.sprite.setPosition(p.x, p.y - h).setDepth(p.y);
    frameAt(fb.sprite, fb.frames, 4, t);
    if (fbC) water.moveHull(fbC, p.x, p.y, fb.def, 'SE');
    if (wake) {
      if (wakeV2) wake.setPosition(p.x, p.y - h).setDepth(p.y - 3);         // hull centre at the waterline
      else wake.setPosition(p.x + wp[0] * 0.5, p.y + wp[1] * 0.5 - h).setDepth(p.y - 3);
      const fr = loader.sheetFrames(wake.texture.key);
      wake.setFrame(Math.floor(t * 12) % fr);
    }
    fx.begin();
    const tp0 = Math.floor(t / 2.4) * 2.4;
    fx.show('fx_splash_small', 1592, 214, tp0, t, 0.8, 216);
    fx.end();
    if (water && MODE === 'new') {
      // a puff of ripple at the stern every 0.3 s (re-built from scratch each frame = deterministic)
      water.clearRipples();
      for (let k = 0; k < 11; k++) {
        const tk = Math.floor(t / 0.3) * 0.3 - k * 0.3;
        if (tk < 0) break;
        const q = path(tk);
        water.ripple(q.x + wp[0], q.y + wp[1], 0.9, tk);
      }
      // the villager's fishing line plops every 2.4 s
      const tp = Math.floor(t / 2.4) * 2.4;
      water.ripple(1592, 214, 1.3, tp);
    }
  });
  // people: a villager on the shore, the fisherman fishing off the pier
  const v1 = loader.character(sc, 'villager_a', 'idle', 'NE', 1330, 455);
  obj(v1.sprite);
  ticks.push((t) => frameAt(v1.sprite, v1.frames, 6, t));
  const fm = loader.character(sc, 'fisherman', 'work', 'NE', 1488, 292);
  obj(fm.sprite);
  ticks.push((t) => frameAt(fm.sprite, fm.frames, 10, t));
  const v2 = loader.character(sc, 'villager_b', 'walk', 'E', 1240, 520);
  obj(v2.sprite);
  ticks.push((t) => { const s = (t * 40) % 320; v2.sprite.setPosition(1180 + s, 520 + 0.0 * s).setDepth(520); frameAt(v2.sprite, v2.frames, 12, t); });
  return { water, tick: (t) => { for (const f of ticks) f(t); } };
}

// ------------------------------------------------------------------------------------------- harbour
function buildHarbor(sc) {
  const Q2 = Math.SQRT2;
  // quay corner (outer, bottom vertex of the harbour block) and the block reaching up-left / up-right
  const corner = { x: 1060, y: 700 };
  const P = (mx, my) => iso(corner.x, corner.y, mx, my);
  const Lx = 9 * Q2, Ly = 9 * Q2;       // block size (m)
  const land = [...P(0, 0), ...P(-Lx, 0), ...P(-Lx, Ly), ...P(0, Ly)];
  // breakwater along world X from the block's +X edge at y = 6 Q, footprint 3.6 m wide (at the water)
  const bwY = 6 * Q2, bwX0 = 0, bwX1 = 4 * Q2 + 1.6;
  const breakwater = [...P(bwX0 - 0.2, bwY - 1.8), ...P(bwX0 - 0.2, bwY + 1.8), ...P(bwX1, bwY + 1.8), ...P(bwX1 + 1.0, bwY), ...P(bwX1, bwY - 1.8)];
  const region = { x: 150, y: -200, w: 2400, h: 1800 };
  const ticks = [];
  let water = null;
  bakeTexturedLand(sc, land, 'ground_snow', { stone: 'ground_plaza' });
  if (MODE === 'old') {
    const sea = sc.add.tileSprite(region.x, region.y, region.w, region.h, 'water_sea').setOrigin(0, 0).setDepth(-20000);
    ticks.push((t) => { sea.tilePositionX = t * 6; sea.tilePositionY = Math.sin(t * 0.4) * 6; });
  } else {
    water = new Water(sc, {
      region,
      // one convention: z0 footprints; quay AND breakwater walls show, so both are tested WATER_PX lower
      mask: { land: [land, breakwater] },
      waterPx: WATER_PX,
      shoreTypes: [{ type: 'breakwater', poly: breakwater.map((v, i) => (i % 2 ? v + WATER_PX : v)) }],
      defaultShore: 'quay',
      palette: 'harbor',
      quality: QUALITY,
      swellDir: [-0.55, 0.83],
      manifest: loader.man.water,
      precision: PRECISION,
    });
  }
  // quay tiles along both camera-facing edges (chained at their stepPx)
  for (let n = 1; n <= 9; n++) obj(loader.tile(sc, 'quay_x', ...P(-n * Q2 + 0.0, 0)));
  for (let n = 1; n <= 9; n++) obj(loader.tile(sc, 'quay_y', ...P(0, n * Q2)));
  obj(loader.tile(sc, 'quay_corner', ...P(0, 0)));
  // a pier off the -Y quay running along world -Y? (pier_x runs along X: out from the +X quay)
  obj(loader.tile(sc, 'pier_root_xn', ...P(Q2 / 2, 2.5 * Q2)));
  for (let n = 1; n <= 3; n++) obj(loader.tile(sc, 'pier_x', ...P(Q2 / 2 + n * Q2, 2.5 * Q2)));
  obj(loader.tile(sc, 'pier_end_xp', ...P(Q2 / 2 + 4 * Q2, 2.5 * Q2)));
  // breakwater
  for (let n = 0; n <= 2; n++) obj(loader.tile(sc, 'breakwater_x', ...P(Q2 / 2 + n * Q2, bwY)));
  obj(loader.tile(sc, 'breakwater_end_xp', ...P(Q2 / 2 + 3 * Q2, bwY)));
  // props on the quay
  obj(loader.sprite(sc, 'bollard', ...P(-2.2, 0.6)));
  obj(loader.sprite(sc, 'bollard', ...P(-6.4, 0.6)));
  obj(loader.sprite(sc, 'harbor_lamp', ...P(-0.8, 3.4)));
  obj(loader.sprite(sc, 'crate_stack', ...P(-4.3, 2.4)));
  obj(loader.sprite(sc, 'barrel_stack', ...P(-2.0, 5.2)));
  obj(loader.sprite(sc, 'net_rack', ...P(-7.2, 3.4)));
  // the tugboat moored along the -Y quay (heading NE = along +X ... use SE/NW along X), a sailboat at the pier
  const wpx = water ? 0 : WATER_PX;
  void wpx;
  const tugAt = P(-6.5, -2.2);
  const tug = loader.character(sc, 'tugboat', 'idle', 'SE', tugAt[0], tugAt[1] + WATER_PX);
  obj(tug.sprite).setFlipX(true);
  ticks.push(floater(sc, water, tug.sprite, tugAt[0], tugAt[1] + WATER_PX, { tilt: 0.15, hull: [tug.def, 'SW'] }));
  ticks.push((t) => frameAt(tug.sprite, tug.frames, 3, t));
  const sbAt = P(3.6, 1.0);
  const sb = loader.character(sc, 'sailboat', 'idle', 'NE', sbAt[0], sbAt[1] + WATER_PX);
  obj(sb.sprite);
  ticks.push(floater(sc, water, sb.sprite, sbAt[0], sbAt[1] + WATER_PX, { tilt: 0.3, hull: [sb.def, 'NE'] }));
  ticks.push((t) => frameAt(sb.sprite, sb.frames, 3, t));
  // buoy out in the basin, a rowboat crossing with ripples
  const bAt = P(6.5, -3.5);
  const buoy = obj(loader.sprite(sc, 'buoy', bAt[0], bAt[1] + WATER_PX));
  ticks.push(floater(sc, water, buoy, bAt[0], bAt[1] + WATER_PX, { tilt: 0.6, contact: [[0, 0, 16, 0.85, 0.15]] }));
  const rb = loader.character(sc, 'boat_rowboat', 'row', 'NE', 0, 0);
  obj(rb.sprite);
  const rdef = loader.charDef('boat_rowboat');
  const rwp = rdef.wakePoint.NE;
  const rpath = (t) => { const s = ((t * 30) % 900) - 300; return { x: 760 + s * 0.894, y: 1010 - s * 0.447 }; };
  const rwake = loader.has('fx_wake_v2_ne') ? obj(sc.add.sprite(0, 0, 'fx_wake_v2_ne')) : null;
  if (rwake) rwake.setOrigin(0.5, 0.5).setScale(1.15);
  const fx = oneShots(sc);
  ticks.push((t) => {
    fx.begin();
    if (water) water.crashEvents(t - 0.6, t, (x, y, st, tc, behind) => fx.show('fx_wave_crash', x, y, tc, t, 0.75 + 0.3 * st, behind ? -13600 : undefined));
    fx.end();
  });
  const rbC = water && !NOCONTACT ? water.addHull(0, 0, rb.def, 'NE') : null;
  ticks.push((t) => {
    const p = rpath(t);
    if (rbC) water.moveHull(rbC, p.x, p.y, rb.def, 'NE');
    const h = water ? water.heightAt(p.x, p.y, t) : Math.sin(t * 1.9) * 1.6;
    rb.sprite.setPosition(p.x, p.y - h).setDepth(p.y);
    frameAt(rb.sprite, rb.frames, 9, t);
    if (rwake) rwake.setPosition(p.x, p.y - h).setDepth(p.y - 3).setFrame(Math.floor(t * 12) % loader.sheetFrames('fx_wake_v2_ne'));
    if (water) {
      water.clearRipples();
      for (let k = 0; k < 10; k++) {
        const tk = Math.floor(t / 0.33) * 0.33 - k * 0.33;
        if (tk < 0) break;
        const q = rpath(tk);
        water.ripple(q.x + rwp[0], q.y + rwp[1], 0.8, tk);
      }
    }
  });
  // people on the quay
  const v = loader.character(sc, 'villager_b', 'idle', 'SE', ...P(-3.0, 1.2));
  obj(v.sprite);
  ticks.push((t) => frameAt(v.sprite, v.frames, 6, t));
  const fm = loader.character(sc, 'fisherman', 'work', 'SE', ...P(Q2 / 2 + 3.8 * Q2, 2.5 * Q2 + 0.3));
  obj(fm.sprite);
  ticks.push((t) => frameAt(fm.sprite, fm.frames, 10, t));
  return { water, tick: (t) => { for (const f of ticks) f(t); } };
}

// ------------------------------------------------------------------------------------------- beach
function buildBeach(sc) {
  // coastline along world Y (screen up-right) through C, gently curved (a bay); sea on the -X side (up-left);
  // a detached breakwater (이안제) offshore, parallel to the beach: the swell slaps + sprays on it
  const C = { x: 1000, y: 640 };
  const P = (mx, my) => iso(C.x, C.y, mx, my);
  const shoreX = (my) => 0.9 * Math.sin(my * 0.21) + 0.45 * Math.sin(my * 0.53 + 1.1);   // metres along X
  const pts = [];
  for (let my = -30; my <= 30; my += 0.5) pts.push(...P(shoreX(my), my));
  const land = [...pts, ...P(34, 30), ...P(34, -30)];
  const region = { x: -200, y: -300, w: 2400, h: 1900 };
  const bwX = -13.5, bwY0 = 3.0, Q2 = Math.SQRT2, bwN = 8;
  // breakwater footprint (3.6 m wide) at the WATER level = the z0 footprint seen 30 px lower
  const bwEnd = bwY0 + bwN * Q2 + Q2 / 2;
  const bwZ0 = [...P(bwX - 1.7, bwY0 - 0.9), ...P(bwX + 1.7, bwY0 - 0.9), ...P(bwX + 1.7, bwEnd), ...P(bwX - 1.7, bwEnd)];
  const bwWater = bwZ0.map((v, i) => (i % 2 ? v + WATER_PX : v));
  const ticks = [];
  let water = null;
  const sandKey = loader.has('ground_sand') ? 'ground_sand' : null;
  bakeTexturedLand(sc, land, sandKey, { sandRamp: !sandKey, region });
  if (MODE === 'old') {
    const sea = sc.add.tileSprite(region.x, region.y, region.w, region.h, 'water_sea').setOrigin(0, 0).setDepth(-20000);
    ticks.push((t) => { sea.tilePositionX = t * 6; sea.tilePositionY = Math.sin(t * 0.4) * 6; });
  } else {
    water = new Water(sc, {
      region,
      mask: { land: [{ poly: land }, { poly: bwZ0, waterPx: WATER_PX }] },
      shoreTypes: [{ type: 'breakwater', poly: bwWater }],
      defaultShore: 'sand',
      palette: 'tropical',
      quality: QUALITY,
      manifest: loader.man.water,
      precision: PRECISION,
    });
  }
  // the breakwater tiles (closed at its -Y end, running off up-right)
  obj(loader.tile(sc, 'breakwater_end_yn', ...P(bwX, bwY0)));
  for (let n = 1; n <= bwN; n++) obj(loader.tile(sc, 'breakwater_y', ...P(bwX, bwY0 + n * Q2)));
  // swimmers (placeholders: villagers cut at the waterline) + rings
  const swimmers = [
    { key: 'villager_a', at: P(-3.6, -3.0), dir: 'SE', ph: 0 },
    { key: 'npc_kid_girl', at: P(-2.2, -6.2), dir: 'S', ph: 1.3 },
    { key: 'villager_c', at: P(-5.6, 2.0), dir: 'E', ph: 2.1 },
    { key: 'npc_teen_girl', at: P(-1.6, 1.2), dir: 'SE', ph: 0.6 },
  ];
  const rip = loader.has('fx_swim_ripple');
  for (const s of swimmers) {
    if (!loader.charDef(s.key)) continue;
    const c = loader.character(sc, s.key, 'idle', s.dir, s.at[0], s.at[1]);
    obj(c.sprite);
    const fr = c.sprite.frame;
    const cut = Math.round(fr.realHeight * 0.58);
    c.sprite.setCrop(0, 0, fr.realWidth, cut);
    let ring = null;
    if (rip) { ring = obj(sc.add.sprite(s.at[0], s.at[1], 'fx_swim_ripple')); ring.setOrigin(...(loader.sheetDef('fx_swim_ripple').anchor || [0.5, 0.5])); }
    const wl = { x: s.at[0], y: s.at[1] };
    if (water && !NOCONTACT) water.addContact(wl.x, wl.y, 12, { foam: 0.5, shadow: 0.06 });
    const offY = Math.round(cut - c.def.anchor[1] * fr.realHeight);   // waterline below the anchor
    ticks.push((t) => {
      const h = water ? water.heightAt(wl.x, wl.y, t) : Math.sin(t * 1.9 + s.ph) * 1.6;
      const bob = Math.sin(t * 2.2 + s.ph) * 1.2;
      c.sprite.setPosition(wl.x, wl.y - offY - h - bob).setDepth(wl.y);
      frameAt(c.sprite, c.frames, 6, t);
      c.sprite.setCrop(0, 0, c.sprite.frame.realWidth, cut);
      if (ring) { ring.setPosition(wl.x, wl.y - h).setDepth(wl.y - 1); ring.setFrame(Math.floor(t * 10 + s.ph * 3) % loader.sheetFrames('fx_swim_ripple')); }
      if (water && MODE === 'new') {
        const tk = Math.floor((t + s.ph) / 1.1) * 1.1 - s.ph;
        if (tk >= 0) water.ripple(wl.x, wl.y, 0.55, tk);
      }
    });
  }
  // spray on the breakwater at crest times + a kid's cannonball now and then
  const fx = oneShots(sc);
  const jump = P(-4.6, -1.0);
  ticks.push((t) => {
    fx.begin();
    if (water) water.crashEvents(t - 0.6, t, (x, y, st, tc, behind) => fx.show('fx_wave_crash', x, y, tc, t, 0.8 + 0.3 * st, behind ? -13600 : undefined));
    const tj = Math.floor((t + 1.0) / 4.5) * 4.5 - 1.0;
    fx.show('fx_splash_big', jump[0], jump[1], tj, t, 0.8);
    if (water && t - tj < 3 && tj >= 0) water.ripple(jump[0], jump[1], 1.8, tj);
    fx.end();
  });
  // beach props (assets/beach when it exists) + people on the sand
  const props = [['parasol_red', 4.5, -4], ['parasol_blue', 6.5, 1.5], ['parasol_yellow', 5.0, 6.0], ['sun_lounger', 5.6, -2.6], ['beach_ball', 3.0, -0.8],
    ['lifeguard_tower', 7.5, -9.0], ['palm_tree_a', 10.5, 4.0], ['swim_ring_red', 2.6, 3.2]];
  let placed = 0;
  for (const [k, mx, my] of props) if (loader.has(k)) { obj(loader.sprite(sc, k, ...P(mx, my))); placed++; }
  if (!placed) {
    obj(loader.sprite(sc, 'barrel', ...P(5.0, -3.0)));
    obj(loader.sprite(sc, 'crate', ...P(5.6, 2.0)));
  }
  const walkers = [['npc_kid_boy', 'walk', 1.6, -10, 1], ['villager_a', 'idle', 2.4, -1.5, 0]];
  for (const [k, an, mx, my, mv] of walkers) {
    if (!loader.charDef(k)) continue;
    const c = loader.character(sc, k, an, mv ? 'NE' : 'SE', ...P(mx, my));
    obj(c.sprite);
    ticks.push((t) => {
      if (mv) { const s = (t * 0.9) % 14; const q = P(mx + 0.1 * Math.sin(t), my + s); c.sprite.setPosition(q[0], q[1]).setDepth(q[1]); }
      frameAt(c.sprite, c.frames, mv ? 12 : 6, t);
    });
  }
  // a rowboat drifting off the beach
  const rbAt = P(-7.5, -5.0);
  const rb = loader.character(sc, 'boat_rowboat', 'idle', 'NE', rbAt[0], rbAt[1]);
  obj(rb.sprite);
  ticks.push(floater(sc, water, rb.sprite, rbAt[0], rbAt[1], { tilt: 0.35, hull: [rb.def, 'NE'] }));
  ticks.push((t) => frameAt(rb.sprite, rb.frames, 3, t));
  return { water, tick: (t) => { if (water) water.clearRipples(); for (const f of ticks) f(t); } };
}

export { SCENES, ISO };
