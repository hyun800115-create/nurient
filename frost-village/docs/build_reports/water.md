# water build report — living water (CONTRACT_V7 §V)

The sea now rolls. `src/systems/Water.js` is a standalone WebGL water module for Phaser 3.90 (GLSL ES 1.0,
WebGL1-safe). It draws:

- long swells rolling toward the shore, plus a shore swell whose crests follow the coastline and bunch up as
  they reach shallow water;
- two drifting ripple layers, sky reflection that is stronger at grazing angles (fresnel), and sun glints;
- depth colour from deep water to the shallows, with the sea bed and moving caustics showing through;
- fish schools swimming under the surface;
- ripple rings for splashes, wakes and swimmers;
- foam that depends on the kind of shore: lace that rolls up a sand beach and recedes, leaving wet sand that
  dries; slush along a snow bank; slap and spray on rock and breakwaters; a bright lapping line on quay walls.

`assets/water/` holds the procedural textures and 12 FX sheets (1.76 MB). `tools/test/water_lab.*` renders the
village coast, a harbour and a beach with the real game sprites and a deterministic clock, and makes the GIFs
and stills. I also ran the integration below in the real game, without changing any game file: a headless
browser was served patched copies of `Ground.js`, `Assets.js` and `Game.js`. It works (section 6.8).
`check_water.py` passes with 0 errors and 0 warnings, the lab check reports 0 errors, and the Canvas renderer
falls back to the old sea.

Nothing in the game imports `Water.js` yet. Section 6 gives the exact steps to wire it in.

## 1. Files (all new)

| path | what |
|---|---|
| `assets/water/` | 5 data textures + 12 FX sheets + `manifest.json` (§2 format: images, sprites, spritesheets, palettes, waterPx 30). Payload **1.76 MB** in total, 0.54 MB of it textures (limit 2.5 MB). |
| `src/systems/Water.js` | the module: `Water`, `WaterMask`, `SWELL`, `SHORE_TYPES`, `DEFAULT_PALETTES`, `WATER_PX` |
| `tools/fx/gen_water.py` | textures + manifest + `docs/previews/water_textures.png` (deterministic, byte-identical reruns) |
| `tools/fx/gen_water_fx.py` | FX sheets (adds them to the manifest) + `water_fx_sheet.png` + `water_fx_*.gif` |
| `tools/fx/check_water.py` | validator (seams, power of two, normals, LUT ↔ palettes ↔ `Water.js`, sheet grids, loop closure, no allocations in `Water._draw`) |
| `tools/test/water_lab.html`, `water_lab.mjs` | lab page + Playwright runner (`still`, `seq`, `gifs`, `beforeafter`, `perf`, `check`, `ingame`) |
| `tools/test/water_lab/lab.js`, `assets.js`, `land.js`, `compose.py` | lab scenes, asset loader, land baker (a copy of Ground's shoreline bake), image composer |
| `tools/test/water_lab/integrate.mjs` | **the integration of section 6 as exact text patches**, used by `water_lab.mjs ingame` |
| `docs/previews/water_*` | GIFs, stills, before/after, in-game proof, textures, FX sheets |

## 2. Previews

| file | shows |
|---|---|
| `water_before_after.png` | the village coast today (scrolling `water_sea` tileSprite + baked shallow band + foam strip) vs the new water; same framing, t = 4 s |
| `water_village.gif` / `.png` | snow-bank coast, dock pier, moored rowboat, a fishing boat with a V wake + ripple rings, ice chunk and small boats bobbing on the swell, a line plopping, fish under the surface (72 frames, 15 fps, 4.8 s) |
| `water_harbor.gif` / `.png` | `harbor` palette: quay walls with the lapping line, a breakwater taking slap + spray (`fx_wave_crash` timed to the swell crests), moored tugboat + sailboat, buoy, rowboat crossing with a wake |
| `water_beach.gif` / `.png` | `tropical` palette over `assets/beach` `ground_sand`: turquoise shallows with caustics, foam lace running up the sand and back, wet band drying, swimmers with `fx_swim_ripple` + rings, a cannonball (`fx_splash_big`), an offshore breakwater with spray (90 frames, 6 s) |
| `water_ingame.png` | **the real game** with the section 6 patches: today vs Water high vs low (물결 품질 간단) vs zoom 0.6 vs zoom 1.2 |
| `water_textures.png` | every texture tiled 2 × 2 (a seam would cross the centre), the LUT rows and the shore ramps |
| `water_fx_sheet.png`, `water_fx_*.gif` | every FX sheet on snow, sand and deep sea |

The GIFs are 352 or 390 px wide phone crops at about zoom 1.0, each under 5.6 MB. The stills are 780 × 1688,
a 390 × 844 phone at DPR 2.

## 3. Textures (`assets/water`, `tools/fx/gen_water.py`)

All textures are sampled in **G space**: G = (screen x, 2 · screen y) in world px, which is the iso ground
plane seen from above (64 G px = 1 m). So every texture and every wave is foreshortened 2:1, like the ground.
The data textures are plain RGB with alpha 255. They are uploaded unpremultiplied, without colour-space
conversion, with REPEAT and mipmaps, and they are seamless (checked on 2 × 2 tilings).

| key | size | content |
|---|---|---|
| `water_waves_a` | 512² | R,G = ripple normal from a periodic FFT ocean height field (JONSWAP spectrum, peak 1.4 m, 8 m tile = 512 G px); B = refraction caustics of that same field |
| `water_waves_b` | 256² | the fine layer: peak 0.5 m, 3 m tile, sampled every 192 G px; B = fine caustics |
| `water_foam` | 256² | R = foam lace potential (equalised: threshold t covers about 1 − t of the area), G = bubbles and slush bits, B = low-frequency variation |
| `water_lut` | 256 × 8 RGBA | one row per palette, RGB = colour, A = opacity over the sea bed, u = 1 − exp(−depth / depthScale): row 0 `winter_sea` (deep navy → cold teal), row 1 `harbor` (greener, murkier), row 2 `tropical` (deep emerald blue → turquoise → clear over sand), row 3 `pool`, rows 4–7 free for custom palettes |
| `water_shore_ramp` | 256 × 4 | wet/dry ramps (dry → damp → wet → submerged) for sand / snow bank / rock / quay. Shipped for bakes such as the beach ground; the shader takes its wet colour from the palette (`wet`, `film`) |

The palettes live in the manifest and in `DEFAULT_PALETTES` in `Water.js`. `check_water.py` checks that the two
match.

## 4. `src/systems/Water.js`

### 4.1 Mechanism: two Phaser `Extern` game objects, each with its own GL program

A Shader game object would draw a full quad over the region. A custom pipeline would have to be wired into
Phaser's batching. `Extern` (`scene.add.extern()`) is the simplest mechanism that composites correctly:

- When the display list reaches it, Phaser flushes the current batch (`pipelines.clear()`), calls our
  `render(renderer, camera, calcMatrix)`, then restores its own GL state (`pipelines.rebind()`). The water
  therefore sorts by **depth** like any other object: the body sits at `DEPTH.WATER` (−20000) under
  everything, and the shore layer at `DEPTH.GROUND + 5`, above the baked land tiles and below floors and
  sprites.
- `calcMatrix` already contains the camera scroll and zoom. Phaser's projection matrix covers the real canvas,
  which is View.k × the logical size, so devicePixelRatio is handled too. The lab proves zoom 0.6–1.2 at DPR 1
  and 2, and the in-game run proves the game's own camera (View.k 1.08, zoom 0.6 / 1.0 / 1.2).
- The meshes are static and cover only the cells that hold water (body: 64 × 32 px blocks) or a soft shore
  (shore: 32 × 16 px blocks). No pixel is shaded over inland snow.
- The G coordinates go to the shader relative to the camera centre, and every phase and offset is wrapped on
  the CPU. The interpolated values therefore stay small, which keeps `mediump` safe.
- Programs and textures are shared per renderer, so several Water regions cost one upload. On WebGL context
  loss, Water listens for `losewebgl` / `restorewebgl` and rebuilds.

### 4.2 The surface (body pass)

- **Directional swell.** Four Gerstner-like sine waves (`SWELL.waves`: 460 / 300 / 196 / 124 G px long,
  amplitudes 3.0 / 1.8 / 1.0 / 0.5 px, rotated 0 / +23 / −34 / +61° from the swell direction). They follow
  deep-water dispersion ω = √(g k), slowed by `timeScale` 0.42 to keep the toy scale calm. The swell direction
  is found automatically from the field (toward the shore) or set with `opts.swellDir`. Near land, the swell
  falls to 45 % of its size.
- **Shore swell.** A wave whose phase is k · ψ(distance to the coast) + ωt, so its crests run parallel to the
  coast. ψ bunches the crests together as they shoal. The period is 6 s (`SWELL.shore.period`), the same grid
  `amb_sea_waves` / `amb_beach` were re-rendered on. Phase and amplitude vary slowly along the coast (ν, a(v)),
  so it never reads as stripes. Its crest gets a glassy subsurface line, and white horses break along it.
- **Ripples.** Two FFT normal layers, rotated 17° and −31° and scrolling in different directions, so no tiling
  repetition shows.
- **Light.** The swell normal is drawn 6× steeper than it moves, so the rolling bands read on a phone. Then:
  lambert term, fresnel sky reflection (sky gradient from the palette), sun glints (sharper when zoomed in),
  and subsurface tint on the crests.
- **Depth.** The shore distance and the shore type give a depth (gentle for sand, steep for quay walls). The
  depth picks the LUT colour and its opacity over the sea bed. The bed shows the moving caustics
  (waves_a.B × waves_b.B) in shallow water.
- **Fish under the surface (high quality).** The `fish_school` texture is sampled in the same two bands as the
  old tileSprites (y 40–240, α 0.55, 22 px/s; y 150–350, α 0.35, scale 0.8, 14 px/s) — **one fetch** for both
  bands. It is refracted by the surface slope, tinted toward the water colour above it, and faded out in very
  shallow water. The fish are composited **before** the sky reflection and glints, which are weakened over
  them (reflection × (1 − 0.7 α), glint × (1 − 0.6 α)). They read as silhouettes under the water, not stickers
  on top. At low quality and in the Canvas fallback, Ground keeps the old fish tileSprites at `DEPTH.FISH`
  over the water.
- **Ripple rings.** A ring buffer of 12 (`ripple()`), 110 G px/s, ageing out in 4 s. Rings change the height,
  slope and foam.
- **Hard-shore foam.** Rock and breakwater: a slap collar that bursts when the shore-swell crest arrives.
  Quay: a thin bright lapping line plus a faint reflected-wave pattern. Whitecaps appear on big crests.

### 4.3 The soft shore (shore pass, premultiplied alpha over the land)

- **Surf zone.** A breaking crest line and the foam it leaves behind, plus a foam collar along the waterline.
- **Swash (sand).** Foam lace rides up the beach with the 6 s cycle: the uprush takes 30 % of the cycle, run-up
  up to 150 G px (about 2.3 m) and varying along the coast. Then it recedes. The water sheet carries a glint.
  Behind it stays a **darker wet band** that dries over 2.6 s, with a short-lived gloss.
- **Snow bank.** A short run-up (16 %), little foam, and **slush**: ice bits bobbing in a narrow band at the
  waterline.

### 4.4 Shoreline field (built once in JS)

1. The mask is evaluated as 2 × 2 samples per **8 × 4 world-px cell** (8 × 8 G px). Land drawn as a wall over
   the water is tested `waterPx` lower.
2. A signed distance field is built with 8SSEDT, two passes, plus a small blur. Boundary cells get a sub-cell
   shoreline from their coverage.
3. A second distance goes only to the coasts that make waves. The swell rolls past breakwaters and quays and
   slaps against them, so the crest lines stay round.
4. Each cell copies the run-up and edge kind of its nearest shore cell, blurred.
5. Everything is packed into one RGBA8 texture: R = distance, G = wave distance (both sqrt-encoded ±768 G px),
   B = run-up, A = edge kind.

Cost and size:

- Lab regions: about 60–150 k cells in 0.15–0.4 s of CPU.
- **The whole village sea (6144 × 2708 px ≈ 520 k cells)** is built on 2 × 2 coarser cells and upsampled.
  This happens automatically above 300 k cells, and `opts.fieldScale` overrides it. It costs **0.09–0.18 s of
  CPU instead of 0.18–0.49 s** for the fine field (0.39 s for the very first build in a fresh process, JIT cold).
- Against the fine field: mean error 1.9 G px within 48 G px of the shore, maximum 8 G px; heightAt differs by
  at most 0.34 px.
- The field code is optimised: inline 8SSEDT, blur without clamping in the interior, one evaluation of the
  shoreline curve per column. For regions up to 300 k cells it gives byte-identical results to the first
  version, so the lab previews still stand.

### 4.5 Shore types (`SHORE_TYPES`)

| type | run-up | edge | makes the shore swell | look |
|---|---|---|---|---|
| `sand` | 1.0 | 0 | yes | surf lines, swash lace up the beach and back, wet band that dries |
| `snowbank` | 0.16 | 0 | yes | small foam + slush at the waterline (the village coast; default) |
| `rock` | 0 | 1 | yes | slap collar + spray events |
| `breakwater` | 0 | 1 | no (waves pass and slap) | slap collar + spray events |
| `quay` | 0 | 0.5 | no | deep right at the wall, bright lapping line |

Shore types are given per segment: `shoreTypes: 'sand'`, or `fn(x, y)`, or
`[{type, rect | poly | x: [x0, x1]}]`, with `defaultShore` for the rest.

For rock and breakwater, `crashEvents(t0, t1, fn)` returns the crest arrivals (x, y, strength, t). They come
from the same phase as the shader's slap burst, and only the bigger waves of a set qualify. `update()` plays
`fx_wave_crash` at them (a pool of 6, on screen only), or calls `opts.onCrash` if one is given.

### 4.6 Quality, fallback, budget

| | body fetches / px | shore fetches / px | what is dropped |
|---|---|---|---|
| `high` | 6 (field, ripple A, ripple B, foam, LUT, fish) | 3 | — |
| `low` | **2** (field, ripple A) | **2** | ripple B, caustics, foam texture (lace from ripple A), LUT (3 colour stops instead), fish in the shader (Ground keeps the tileSprites), 2 of the 4 swells, 8 of the 12 rings |
| Canvas renderer or failed compile | — | — | the old scrolling `water_sea` tileSprite (`water.fallback`), fish tileSprites |

- **GPU memory.** 4.36 MB for the whole village sea: shared textures with mipmaps, the fish texture, and a
  768 × 677 field. Lab regions are about 2.7–2.9 MB. Phaser also keeps its own upload of each loaded image,
  about 1.3 MB.
- **No per-frame allocations.** Every uniform lives in preallocated typed arrays; `check_water.py` scans
  `_draw`.

### 4.7 API

```js
import { Water, WaterMask, WATER_PX, SWELL, SHORE_TYPES } from './Water.js';

const water = new Water(scene, {
  region: { x, y, w, h },        // world px rectangle the water may cover
  mask,                           // fn(x, y) -> water? | WaterMask.shoreY(fn) | { water: [poly], land: [poly | {poly, waterPx}] }
  waterPx: 0,                     // sea surface below the land in screen px (WATER_PX = 30 where quay walls show)
  shoreTypes, defaultShore,       // see 4.5
  palette: 'winter_sea',          // 'winter_sea' | 'harbor' | 'tropical' | 'pool' | a palette object
  quality: 'high',                // 'high' | 'low'
  swellDir, swell, surf, ripple,  // optional overrides (direction in G space; multipliers)
  fish: [{ y0, y1, alpha, scale, speed: [vx, vy], offset: [x, y], wobble: [amp, freq] }], fishKey: 'fish_school',
  depth, shoreDepth,              // default DEPTH.WATER, DEPTH.GROUND + 5
  onCrash: (x, y, strength) => {},// default: plays fx_wave_crash
  manifest,                       // assets/water manifest (palettes); fallbackKey 'water_sea'; fieldScale 1 | 2
});
water.update(dt);                 // advance the clock (call every frame; clamps dt to 0.1)
water.setTime(t);                 // deterministic clock (tests / captures)
water.heightAt(x, y, t?)          // surface height in screen px (+ = up) — same maths as the shader
water.slopeAt(x, y, t?, out?)     // { x: dh/dx, y: dh/dy } screen px per px: tilt floating things
water.surfaceY(x, y, t?)          // y + waterPx - heightAt: where a floating sprite's waterline goes
water.ripple(x, y, strength, t0?) // a ring (0.3 .. 2; ring buffer of 12, oldest dropped)
water.clearRipples()
water.crashEvents(t0, t1, fn)     // rock / breakwater crest arrivals in (t0, t1]
water.shoreDistance(x, y)         // signed G px (+ = water), waveDistance(x, y)
water.swashPhase(x, y, t?)        // 0..1 shore-swell cycle: 0 = a crest reaches the waterline here (6 s period)
water.setPalette(name | object); water.setQuality('high' | 'low'); water.setFish(layers, key)
water.drawsFish                   // true when the shader draws the fish (keep the tileSprites otherwise)
water.isShader, water.fallback    // WebGL path? / the fallback tileSprite
water.setVisible(v); water.destroy()  // also destroyed on scene shutdown
water.info()                      // { shader, quality, palette, field, fieldScale, drawsFish, fetchesBody, fetchesShore, textureBytes, buildMs, … }
```

`heightAt` and `slopeAt` sum exactly what the shader sums: the 4 swells with the same coast weighting, the
shore swell with its along-coast variation, and the rings. So boats, buoys, ice chunks and swimmers ride the
same crests the player sees.

## 5. FX spritesheets (`assets/water`, conventions of `assets/fx`)

All sheets are NORMAL-blend toy water: white to ice-blue body, bevel light from the upper left, and a thin
sea-blue rim so they read on snow, sand and deep sea. They work with or without the shader.

| key | frame | frames · fps · repeat | anchor | use |
|---|---|---|---|---|
| `fx_wave_crash` | 192² | 10 · 20 · once | 0.5, 0.80 | spray burst on rock / breakwater (Water plays it at `crashEvents`) |
| `fx_splash_small` | 96² | 10 · 24 · once | 0.5, 0.72 | fish jump, pebble, line plop, swimmer kick |
| `fx_splash_big` | 192² | 14 · 24 · once | 0.5, 0.80 | dive, cannonball, crate overboard |
| `fx_swim_ripple` | 128 × 64 | 12 · 12 · loop | 0.5, 0.5 | rings + lacy collar around a swimmer, under the swimmer (depth − 1); clear centre 32 × 14 px |
| `fx_wake_v2` (+ `_s`, `_e`, `_ne`, `_n`) | 256 × 176 | 8 · 12 · loop | 0.5, 0.5 | boat wake V, one sheet per rendered heading (SE, S, E, NE, N; flipX for SW / W / NW); anchor = hull centre at the waterline; scale 1.15 rowboat, 2.0 fishing boat |
| `fx_sparkle_water` | 128 × 64 | 12 · 12 · loop | 0.5, 0.5 | twinkling glints (low quality / Canvas, or calm water) |
| `fx_shore_wave_x` / `_y` | 384 × 256 | 16 · 6 · loop | 0.5, 0.55 | rolling breaking-wave strip for sand beaches drawn **without** the shader; chain every (+256, +128) px (`_x`, sea up-right) or (+256, −128) px (`_y`, sea up-left); seamless along the coast |

## 6. Integration — exact steps

Sections 6.1–6.3 are exactly the patches in `tools/test/water_lab/integrate.mjs`. They were applied to the
current files and booted in the real game (6.8). Sections 6.4–6.7 build on them and are proven in the lab
scenes, not in the game.

### 6.1 `src/core/Assets.js` — load the fragment (FX sheets after the title)

```js
export const FRAGMENTS = [/* …, */ 'workers', 'pets2', 'water'];
const LAZY_KEY = /^fx_(build_dust|build_done|wake|wake_ring|fire_big|wave_crash|splash_small|splash_big|swim_ripple|wake_v2(_[a-z]+)?|sparkle_water|shore_wave_[xy])$/;
```

The textures (0.54 MB) load with the first screen. The FX sheets come in after the title. Water checks
`textures.exists` before it plays anything, so a missing sheet is harmless.

### 6.2 `src/systems/Ground.js`

```js
// imports
import { Water, WaterMask } from './Water.js';
import { Settings } from '../core/Save.js';

// the two fish-school bands of the old tileSprites (world px); Water draws them UNDER its surface
const FISH_BANDS = [
  { y0: 40, y1: 240, alpha: 0.55, scale: 1, speed: [22, 0], offset: [0, 0], wobble: [5, 0.7] },
  { y0: 150, y1: 350, alpha: 0.35, scale: 0.8, speed: [14, 0], offset: [130, 40], wobble: [0, 0] },
];
```

In the constructor, replace the block from `// --- sea (live, scrolling)` through `this.t = 0;` (the sea
tileSprite and the two fish tileSprites) with:

```js
    const seaH = Math.ceil(maxShore + 40);
    this.water = new Water(gs, {
      region: { x: 0, y: -200, w: W, h: seaH + 200 },
      mask: WaterMask.shoreY(shoreY),          // water above the shoreline curve
      defaultShore: 'snowbank',                 // (rocky stretches: shoreTypes: [{ type: 'rock', x: [x0, x1] }])
      palette: 'winter_sea',
      quality: Settings.data.water === 'low' ? 'low' : 'high',
      fish: FISH_BANDS,
      fishKey: Assets.sprite('fish_school').tex,
      manifest: gs.cache.json.exists('manifest_water') ? gs.cache.json.get('manifest_water') : null,
    });
    this.sea = this.water.fallback || null;
    this.liveShore = this.water.isShader;       // the shallows + shore foam are drawn live, not baked
    this.fish1 = null; this.fish2 = null;
    this.syncFish();
    this.t = 0;
```

Add two methods:

```js
  /** fish schools: under the water surface (Water, high quality) or the old tileSprites over it */
  syncFish() {
    const want = !this.water.drawsFish;
    if (want && !this.fish1) {
      const fs = Assets.sprite('fish_school'), gs = this.gs, W = this.W;
      this.fish1 = gs.add.tileSprite(0, 40, W, 200, fs.tex, fs.frame).setOrigin(0, 0).setDepth(DEPTH.FISH).setAlpha(0.55);
      this.fish2 = gs.add.tileSprite(0, 150, W, 200, fs.tex, fs.frame).setOrigin(0, 0).setDepth(DEPTH.FISH).setAlpha(0.35).setTilePosition(130, 40);
      this.fish2.setTileScale(0.8, 0.8);
    } else if (!want && this.fish1) {
      this.fish1.destroy(); this.fish2.destroy();
      this.fish1 = null; this.fish2 = null;
    }
  }

  /** settings '물결 품질': 'high' | 'low' */
  setWaterQuality(q) { this.water.setQuality(q); this.syncFish(); }
```

Stop baking what the water now draws live:

```js
// bakeChunk(): the shallow band
    if (y0 < tileShoreMax + 20 && !this.liveShore) this.drawShallow(ctx, x0, y0, w, h);

// bakeShore(): keep the two land-side rim strokes, drop the water-side stroke and the shore_foam strip
    if (!this.liveShore) { ctx.strokeStyle = 'rgba(156,199,230,0.55)'; ctx.lineWidth = 5; line(-6); ctx.stroke(); }
    ctx.restore();
    if (this.liveShore) return;                 // Water draws the foam lace, slush and wet edge live
```

In `update(dt)`, replace the two `this.sea.tilePosition…` lines with `this.water.update(dt);`. Water scrolls
the fallback tileSprite itself. The fish lines stay as they are; they only run while the tileSprites exist.

The rest of the shore code needs no changes. `shoreY` is the mask, and Water registers its own
`destroy()` on scene shutdown.

### 6.3 `src/scenes/Game.js` — things in the sea bob with the swell

In `buildDecor()`, the boats and ice chunks in the sea join a floater list instead of their sine tween. The
tween stays for the fallback.

```js
      if ((key === 'boat_small' || key === 'ice_chunk') && y < shoreY(x) + 10 && this.ground.water && this.ground.water.isShader) {
        (this.floaters = this.floaters || []).push({ img, x, y, tilt: key === 'boat_small' ? 0.3 : 0.15, rot: img.rotation || 0 });
      } else if ((key === 'boat_small' || key === 'ice_chunk') && y < shoreY(x) + 10) {
        this.tweens.add(/* … unchanged … */);
      }
```

In `tick()`, right after `this.ground.update(dt);`:

```js
    if (this.floaters) {
      const wv = this.ground.water, sl = this._floatSlope || (this._floatSlope = { x: 0, y: 0 });
      for (const f of this.floaters) {
        if (!f.img.active || !this.isOnScreen(f.x, f.y, 120)) continue;
        wv.slopeAt(f.x, f.y, undefined, sl);
        f.img.setPosition(f.x, f.y - wv.heightAt(f.x, f.y)).setRotation(f.rot + Math.max(-0.12, Math.min(0.12, -sl.x * f.tilt)));
      }
    }
```

### 6.4 `src/entities/Boathouse.js` — the boats ride the swell, leave rings and a V wake

This is not run in the game: it needs the v3 progression. The same calls drive the lab boats.

```js
const WAKE_V2 = { S: 'fx_wake_v2_s', SE: 'fx_wake_v2', E: 'fx_wake_v2_e', NE: 'fx_wake_v2_ne', N: 'fx_wake_v2_n' };

// update(): replace this.sprite.setPosition(this.x, this.y);
    const wv = gs.ground && gs.ground.water;
    const bob = wv && wv.isShader ? wv.heightAt(this.x, this.y) : 0;
    this.sprite.setPosition(this.x, this.y - bob);
// the wake: the V sheet of the heading (fallback: the old fx_wake)
    if (moving && onScreen) {
      const wk = Assets.sheet(WAKE_V2[base]) ? WAKE_V2[base] : 'fx_wake';
      if (this.wake && this.wakeKey !== wk) { this.wake.destroy(); this.wake = null; }
      if (!this.wake) {
        const size = wk === 'fx_wake' ? (this.level >= 2 ? 300 : 190) : (this.level >= 2 ? 512 : 294);   // v2: x2.0 / x1.15
        this.wake = gs.effects.loop(wk, this.x, this.y, size, d - 2);
        this.wakeKey = wk;
      }
      if (this.wake) {
        if (wk === 'fx_wake') this.wake.setPosition((this.x + wx) / 2, (this.y + wy) / 2);
        else this.wake.setPosition(this.x, this.y - bob);          // v2 anchor = hull centre at the waterline
        this.wake.setVisible(true).setDepth(d - 2).setFlipX(flip);
      }
      this.ringT -= dt;
      if (this.ringT <= 0) {
        this.ringT = 0.28;
        if (wv && wv.isShader) wv.ripple(wx, wy, this.level >= 2 ? 1.0 : 0.7);     // rings in the water itself
        else gs.effects.sheet('fx_wake_ring', wx, wy, { size: this.level >= 2 ? 170 : 120, depth: d - 3 });
      }
      // … row sound unchanged
    }
// catchOne(): rings where the fish comes out (next to the existing fx_splash at sx, sy)
    const wv = gs.ground && gs.ground.water;
    if (wv && wv.isShader) wv.ripple(sx, sy, 1.2);
```

### 6.5 Settings toggle '물결 품질'

- `src/core/Save.js` → `Settings`: add `water: 'high'` to `data`, and in `load()` add
  `this.data.water = s.water === 'low' ? 'low' : 'high';`.
- `src/data/strings.js`:
  - ko: `waterQuality: '물결 품질', qualityHigh: '고급', qualityLow: '간단'`
  - en: `waterQuality: 'Water', qualityHigh: 'High', qualityLow: 'Low'`
- `src/scenes/UI.js` → `buildPanelContent()`: add a row under the language row. Grow the panel by 100 px
  (`openSettings`: `panel(…, 560, 740)`) and move the title, version and close icon up 50 px and the
  reset/reload/close buttons down 50 px.

  ```js
  const wq = S.water === 'low' ? 'low' : 'high';
  row(cy + 150, t('waterQuality'), wq === 'high' ? t('qualityHigh') : t('qualityLow'), wq === 'high' ? 'green' : 'gray', () => {
    S.water = wq === 'high' ? 'low' : 'high'; Settings.save();
    if (this.gs.ground && this.gs.ground.setWaterQuality) this.gs.ground.setWaterQuality(S.water);
    this.buildPanelContent(false);
  });
  ```

- Auto quality: wherever the game already drops `View.forceK` for a weak GPU, also call
  `ground.setWaterQuality('low')` (and save it). Low keeps the look — swell, glints, shore foam — with
  2 fetches.

### 6.6 Harbour, beach, hotel pool

Any number of Water regions can run at once; they share programs and textures. These configurations are the
lab's harbour and beach scenes:

```js
// harbour (CONTRACT_V6 quays: the land polygon is the quay deck at z 0; walls show 30 px down to the sea)
new Water(gs, {
  region, waterPx: WATER_PX,
  mask: { land: [{ poly: quayDeckPoly }, { poly: breakwaterPoly, waterPx: 0 }] },   // breakwater slopes reach the water
  shoreTypes: [{ type: 'breakwater', poly: breakwaterPoly }], defaultShore: 'quay',
  palette: 'harbor', quality,
});
// sunny beach (CONTRACT_V7 §W): the sand polygon ends at the waterline, the sea outside it
new Water(gs, {
  region, waterPx: 0,
  mask: { land: [{ poly: sandPoly }, { poly: breakwaterPoly, waterPx: WATER_PX }] },
  shoreTypes: [{ type: 'breakwater', poly: breakwaterWaterPoly }, { type: 'rock', x: [rx0, rx1] }],
  defaultShore: 'sand', palette: 'tropical', quality,
});
// hotel pool (beach_bld hotel_pool.waterPoly): calm, clear, tiled-blue bottom
new Water(gs, { region: bboxOf(waterPoly), mask: { water: [waterPoly] }, defaultShore: 'quay', palette: 'pool', swell: 0, surf: 0 });
```

- The beach faces the sea on −Y (screen down-left) in `docs/build_reports/beach.md`. Water does not care
  about orientation: the swell direction comes from the field.
- Put every water-plane prop (`swim_buoy_line_*`, `float_raft`, boats, `buoy`) at its sea point and move it to
  `y - water.heightAt(x, y)` every frame, tilted by `slopeAt`, like the floaters in 6.3.
- Swimmers (beachfolk `swim`): draw `fx_swim_ripple` under them at the waterline, bob them with `heightAt`,
  and call `water.ripple(x, y, 0.55)` about once a second. Splashes: `fx_splash_small` / `fx_splash_big`
  plus `water.ripple(x, y, 1.3 … 1.8)`.
- Sound: the shore swell has a 6 s period. `crashEvents()` gives the exact crest times on rocks and
  breakwaters (`sfx_wave_crash_1..3`). For sand, `water.swashPhase(x, y)` wraps from about 1 back to 0 when a
  crest reaches the waterline at that point, which is the moment to play `sfx_wave_wash`.

### 6.7 Depth order (`DepthSort.DEPTH`)

| layer | depth |
|---|---|
| water body | `DEPTH.WATER` (−20000) |
| old fish tileSprites (low / fallback only) | `DEPTH.FISH` |
| baked land tiles | `DEPTH.GROUND` |
| water shore layer (swash, wet band, slush) | `DEPTH.GROUND + 5` |
| floors, decals, pads, sprites | unchanged |

`DEPTH.WAVES` is free.

### 6.8 Proof in the real game (`node tools/test/water_lab.mjs ingame`)

`water_lab.mjs ingame` boots the real game: `index.html`, fresh save, 390 × 844 at DPR 2. Playwright
route interception serves it the patched `Assets.js`, `Ground.js` and `Game.js` from `integrate.mjs`; the
files in `src/` are never written. The run taps through the title, points the game's camera hook at the
dock, and takes a deterministic frame: the loop is asleep and the water clock is set before the final step.
The same run is repeated without patches as a baseline, and the composite goes to
`docs/previews/water_ingame.png`.

- **All patch anchors were found in the current files.** If someone edits these files, the report names
  any anchor that is missing.
- WebGL path active; `drawsFish` true at high (the fish tileSprites are destroyed), false at low (the
  tileSprites come back).
- 8 decor floaters (boats and ice chunks) ride the swell.
- No errors. The first run logged one unrelated warning from work in progress elsewhere (missing
  `site_plot_XL`); the second run logged nothing.

Results (`ingame.json`, two full runs; the second run is the one in `water_ingame.png`):

| run | sea | fish | floaters on the swell | fetches / px (body, shore) | GPU texture memory | field build in the page | whole game frame, run 1 / run 2 |
|---|---|---|---|---|---|---|---|
| today, zoom 1.0 | tileSprite | tileSprites | 0 (sine tweens) | 1 / – | – | – | 927 / 1522 ms |
| Water high, zoom 1.0 | shader | under the surface | 8 | 6, 3 | 4.36 MB | 2.8 s | 1651 / 1318 ms |
| Water high, zoom 0.6 | shader | under the surface | 8 | 6, 3 | 4.36 MB | 2.4 s | 1041 / 1504 ms |
| Water high, zoom 1.2 | shader | under the surface | 8 | 6, 3 | 4.36 MB | 3.0 s | 1693 / 1604 ms |
| Water low, zoom 1.0 | shader | tileSprites again | 8 | 2, 2 | 4.36 MB | 1.6 s | 1461 / 975 ms |

- The whole-frame times swing by ±50 % between the two runs and between neighbouring rows. That is the shared
  machine (SwiftShader on 4 cores at load average 30–37 with Blender renders), not the water. They only show
  that the game still runs with the water in it. The sea's own cost is measured cleanly, interleaved, in
  section 7.
- The field for the whole village sea (768 × 677 cells, 519,936 > 300,000) is built 2 × coarser
  automatically: `info().fieldScale` is 2. In node on the same machine, the first build in a fresh process
  (JIT still cold) takes 0.36 s wall and 0.39 s CPU.
  The 1.6–3.0 s in the page is the same work on a CPU that 30+ other threads were competing for.

## 7. Performance

All measurements are SwiftShader (CPU WebGL) on a 4-core machine shared with several Blender renders, at load
average about 25–33. Read them as **relative** costs. `perf` interleaves the variants over 5 rounds and
reports medians.

**Cost of drawing the sea itself** (`water_lab.mjs perf`): a frame with the sea minus the same frame with the
sea hidden, 780 × 1688 canvas (390 × 844 at DPR 2), zoom 1.0.

| scene | old tileSprite | Water low | Water high | texture fetches / px (body, shore) |
|---|---|---|---|---|
| village coast | 117 ms (1×) | 654 ms (5.6×) | 846 ms (7.2×) | 1 / – · 2, 2 · 6, 3 |
| beach (+ the sand shore band) | 198 ms (1×) | 455 ms (2.3×) | 744 ms (3.8×) | 1 / – · 2, 2 · 6, 3 |

**Whole game frame** (`ingame`, the real game, game.step + readPixels): see the table in 6.8.

Phone estimate:

- SwiftShader runs the ALU on the CPU, so its ratios overstate ALU against texture bandwidth compared with a
  phone GPU. The old sea is one fetch with almost no ALU, which also makes the ratio look large.
- The high body shader is about 330 scalar ALU operations plus about 20 transcendentals, with 6 fetches per
  pixel. Low is about 200 operations with 2 fetches.
- On a 1170 × 2530 phone canvas (View.k 1.6, max 2) with the sea covering about half the screen, that is about
  1.5 M px × 400 ops ≈ 0.6 G ops per frame. At 60 fps that is roughly 10–15 % of a mid-range GPU (Adreno
  6xx / Apple A-series). **'high' is fine on a mid phone.**
- On low-end Mali-G52-class GPUs, 'high' would take about half the frame. Use 'low' there (2 fetches, no
  caustics, no in-shader fish) through the auto-drop in 6.5, or let the player choose with 물결 품질.

Other costs:

- **Draw calls:** +2 per Water region, plus one batch break each (Extern flushes Phaser's batch), instead of
  the 3 tileSprites.
- **CPU per frame:** about 40 uniform uploads, no allocations; `heightAt` + `slopeAt` cost about 2 µs per
  floater (node, 8 live rings).
- **Load:** the field for the whole village sea costs 0.09–0.18 s of CPU once the JIT is warm, and 0.39 s
  for the very first build in a fresh process (2.1 GHz Xeon, node). Lab-size regions cost 0.1–0.4 s.
- **Memory:** see 4.6.

## 8. How to run

```sh
python3 tools/fx/gen_water.py            # textures + manifest + water_textures.png (deterministic)
python3 tools/fx/gen_water_fx.py         # FX sheets + previews   (--only key,key --no-gif)
python3 tools/fx/check_water.py          # validate -> RESULT: OK (0 errors, 0 warnings)
export WATER_LAB_TMP=/some/scratch/dir   # frame cache (resumable)
node tools/test/water_lab.mjs check      # every scene x new high / new low / old + Canvas fallback, fails on console errors
node tools/test/water_lab.mjs gifs       # water_village/harbor/beach.gif + stills (--only beach)
node tools/test/water_lab.mjs beforeafter
node tools/test/water_lab.mjs perf
node tools/test/water_lab.mjs ingame     # the real game with the Ground.js integration patches
node tools/test/water_lab.mjs still beach --quality low --zoom 0.6 --dpr 2 --t 7.5 --out x.png
# interactive: node tools/test/serve.mjs 8080 -> /tools/test/water_lab.html?scene=beach&play=1
```

Lab scenes use the real textures and sprites: `ground_snow`, `dock_pier`, `boat_small`, `ice_chunk`,
rowboat and fishing boat, villagers and fisherman, harbour quay / pier / breakwater tiles, tugboat, sailboat,
buoy, `ground_sand`, and parasols / loungers / lifeguard tower from `assets/beach` when present. Time comes
only from `window.__W.frame(t)`.

## 9. Notes and limits

- Canvas renderer: the old look (tileSprite sea + fish). The FX sheets work there too; for beaches without
  the shader, use `fx_shore_wave_*` and `fx_sparkle_water`.
- The village region keeps the old sea rectangle (top at world y −200). At zoom 0.6 the game removes its
  camera bounds, and above −200 the background shows, exactly as with the old tileSprite. Raise
  `region.y` if that view should show sea (about +25 k field cells per 100 px).
- The field is built once. If the coast changes (new quay, land reclaimed), destroy the region and build a
  new one. Regions of about 150 k cells cost a few hundred ms of CPU.
- `fx_shore_wave_*` loop every 2.7 s and are meant for beaches drawn without the shader. The shader draws its
  own swash on the 6 s shore swell.
- The swell is deliberately calm (3 px swell, about 2 px shore swell at the toy scale); it reads mostly
  through light and foam. To make it livelier, raise `SWELL.normalBoost`, the palette's `swell` / `surf`, or
  pass `opts.swell`.
