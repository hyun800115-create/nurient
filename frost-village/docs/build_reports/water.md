# water build report — living water (CONTRACT_V7 §V), after the polish pass

The sea now rolls and reads as real water at phone zoom. `src/systems/Water.js` is a standalone WebGL water
module for Phaser 3.90 (GLSL ES 1.0, WebGL1-safe, mediump-safe). It draws:

- **Swells:** four directional swells rolling toward the shore, plus a shore swell whose crests follow the
  coastline and bunch up as they reach shallow water. Both light the surface, as moving soft gradients
  (crest-lit, trough-dark), never flat plateaus.
- **Surface light:** two drifting ripple layers, a sky reflection with a soft shoulder (fresnel), and small,
  soft, tinted sun glints in drifting patches. Both fade gracefully when zoomed out: no salt noise at 0.6.
- **Depth:** a sea bed baked into the shoreline field (gentle under sand, steeper under snow banks and rock,
  deep along quay walls), seen through clear water in the shallows with moving caustics. The winter sea is
  a cold navy and grey-teal; the beach is emerald and turquoise.
- **Life in the water:** fish schools under the surface; ripple rings from splashes, wakes and swimmers; foam
  collars and soft shadows around hulls, pier posts, ice chunks and swimmers (`addContact`, `addHull`); soft
  whitecap streaks that ride the swell crests offshore and fade after about 1.5 s.
- **Foam by shore type:**
  - sand: surf lines roll in, foam lace runs up the beach and back, and a wet band is left behind and dries;
  - snow bank (the village): surf lines roll in, a white roll breaks at the waterline on every crest, and
    slushy lace and ice bits ride up the bank and slide back;
  - rock and breakwater: a slap collar and `fx_wave_crash` spray, only on faces that look into the swell,
    travelling along the wall with the crest;
  - quay walls: a lapping line that breathes with the crests, plus a contact shadow along the wall.

`assets/water/` holds the procedural textures, the baked village shoreline field and 12 FX sheets (1.36 MB in
total). `tools/test/water_lab.*` renders the village coast, a harbour and a beach with the real game sprites
and a fixed test clock. It produces the GIFs and stills, and it checks the shader against the JS maths by
reading the drawn height back. The integration of section 6 was run in the real game again, without changing
any game file: the patched `Assets.js`, `Ground.js` and `Game.js` were served to headless Chromium (6.8).

Checks: `check_water.py` passes with 0 errors and 0 warnings; `node tools/test/water_lab/node_test.mjs` passes;
`water_lab.mjs check` passes with no console errors (all scenes, both qualities, a forced mediump GPU, night,
and the Canvas fallback).

Nothing in the game imports `Water.js` yet. Section 6 gives the exact steps to wire it in.

## 1. Files (all new; nothing outside these was changed)

| path | what |
|---|---|
| `assets/water/` | 5 data textures, the baked village field `field_village.png`, 12 FX sheets and `manifest.json` (§2 format: images, sprites, spritesheets, palettes, `fields`, waterPx 30). **1.36 MB** in total (limit 2.5 MB). |
| `src/systems/Water.js` | the module: `Water`, `WaterMask`, `WaterPresets`, `WaterSheets`, `WaterBudget`, `bakedField`, `suggestWaterQuality`, `waterShaderCosts`, `SWELL`, `SHORE_TYPES`, `DEFAULT_PALETTES`, `WATER_PX` |
| `tools/fx/gen_water.py` | textures, LUT, manifest and `docs/previews/water_textures.png` (reruns give byte-identical files) |
| `tools/fx/gen_water_fx.py` | FX sheets (added to the manifest), `water_fx_sheet.png` and `water_fx_*.gif` |
| `tools/fx/gen_water_field.mjs` | bakes the shoreline field of static coasts (the village sea) into `field_village.png` + `manifest.fields.village`; `--check` fails when the bake is stale |
| `tools/fx/check_water.py` | validator: seams, power-of-two sizes, normals, LUT ↔ palettes ↔ `Water.js`, winter vs tropical palette rules, sheet grids, loop closure ≤ 1.3, baked field fresh, decoded sheet memory, no allocations in `Water._draw` |
| `tools/test/water_lab.html`, `water_lab.mjs` | lab page and Playwright runner (`still`, `seq`, `gifs`, `beforeafter`, `perf`, `check`, `ingame`) |
| `tools/test/water_lab/lab.js`, `assets.js`, `land.js`, `compose.py` | lab scenes, asset loader, land baker (a copy of Ground's shoreline bake), image composer |
| `tools/test/water_lab/integrate.mjs` | **the integration of section 6 as exact text patches**, used by `water_lab.mjs ingame` |
| `tools/test/water_lab/node_test.mjs` | node tests without a browser (slopeAt, ring packing, crash exposure / travel, sea-bed smoothness, bake round trip, wall convention, shader budgets) |
| `docs/previews/water_*` | GIFs, stills, before/after, polish before/now, in-game proof, textures, FX sheets |

## 2. Previews

| file | shows |
|---|---|
| `water_before_after.png` | the village coast today (scrolling `water_sea` tileSprite, baked shallow band, foam strip) next to the new water; same framing, t = 4 s |
| `water_polish_fixes.png` | the critic's captures next to the same views now: open sea, the snow-bank shore, the breakwater spray, the beach drop-off |
| `water_village.gif` / `.png` | snow-bank coast and dock pier: surf lines rolling in and washing up the bank; a moored rowboat and small boats bobbing with foam collars; a fishing boat with a V wake, hull collar and ripple rings; an ice chunk; a fishing line plopping in; fish under the surface; soft whitecap streaks offshore. 72 frames, 15 fps |
| `water_harbor.gif` / `.png` | `harbor` palette: quay walls with the lapping line and contact shadow; the breakwater taking slap and a sheet of spray behind its seaward wall, travelling along it with the crest; a moored sailboat with a hull collar; a buoy; a rowboat crossing with wake and rings |
| `water_beach.gif` / `.png` | `tropical` palette over `assets/beach` `ground_sand`: turquoise shallows with caustics, deeper blue offshore with no seam, foam lace running up the sand and back, the wet band drying, swimmers with `fx_swim_ripple`, rings and collars, a cannonball (`fx_splash_big`), an offshore breakwater with spray. 90 frames, 6 s |
| `water_ingame.png` | **the real game** with the section 6 patches: today vs Water high vs low (물결 품질: 간단) vs zoom 1.2, and today vs Water at zoom 0.6 above the old sea edge (the background band is gone) |
| `water_textures.png` | every texture tiled 2 × 2 (a seam would cross the centre), the LUT rows and the shore ramps |
| `water_fx_sheet.png`, `water_fx_*.gif` | every FX sheet on snow, sand and deep sea |

The GIFs are phone crops 390 px wide at about zoom 1.0, each under 5.3 MB. The stills are 780 × 1688, which is
a 390 × 844 phone at DPR 2.

## 3. Textures (`assets/water`, `tools/fx/gen_water.py`)

All textures are sampled in **G space**: G = (screen x, 2 · screen y) in world px. That is the iso ground plane
seen from above (64 G px = 1 m), so every texture and every wave is foreshortened 2:1, like the ground. The data
textures are plain RGB, uploaded unpremultiplied, without colour-space conversion, with REPEAT and mipmaps, and
seamless (checked on 2 × 2 tilings).

| key | size | content |
|---|---|---|
| `water_waves_a` | 512² | R,G = ripple normal from a periodic FFT ocean height field (JONSWAP spectrum, peak 1.4 m, 8 m tile = 512 G px); B = caustics from the same field |
| `water_waves_b` | 256² | the fine layer: peak 0.5 m, 3 m tile, sampled every 192 G px; B = fine caustics |
| `water_foam` | 256² | R = foam lace potential (equalised), G = bubbles and slush bits, B = low-frequency variation (also gates glints and whitecaps into drifting patches) |
| `water_lut` | 256 × 8 RGBA | one row per palette: RGB = colour, A = opacity over the sea bed, u = 1 − exp(−depth / depthScale). Row 0 `winter_sea`, row 1 `harbor`, row 2 `tropical`, row 3 `pool`; rows 4–7 free for custom palettes |
| `water_shore_ramp` | 256 × 4 | wet/dry ramps (dry → damp → wet → submerged) for sand, snow bank, rock and quay (for bakes such as the beach ground) |
| `water_field_village` (`field_village.png`) | 384 × 1017 RGB | the baked shoreline field of the village sea (§4.4), 58 KB |

**Palettes.** `winter_sea` was re-tuned colder and darker (critic): shallows `#7FAFC0` → `#4D8DB0`
(saturation 0.37 against tropical 0.66, hue 198° against 177°), deep `#21589A` → `#1A4884` (lightness 0.31,
darker than the old `water_sea` at 0.40, so the navy holds after the sky reflection), a cold grey-blue sky
(`#3F6E9E` / `#9DB6CC`), caustics 0.35, an ice-grey foam shade `#B3C7D6` and a greyer swash film. `tropical`,
`harbor` and `pool` are unchanged. The palettes live in the manifest and in `DEFAULT_PALETTES`;
`check_water.py` checks that the two match and that the winter shallows stay clearly apart from the tropical
ones and the winter deep is no lighter than the old sea.

## 4. `src/systems/Water.js`

### 4.1 How it composites: two Phaser `Extern` game objects, each with its own GL program

- **Depth sorting.** When the display list reaches an `Extern`, Phaser flushes its batch, calls our
  `render(renderer, camera, calcMatrix)`, then restores its GL state. The body sits at `DEPTH.WATER` (−20000),
  under everything; the shore layer at `DEPTH.GROUND + 5`, above the baked land tiles and below floors and
  sprites.
- **Camera and screen density.** `calcMatrix` contains the camera scroll and zoom, and Phaser's projection
  covers the real canvas, so devicePixelRatio is handled. The lab proves zoom 0.6–1.4 at DPR 1 and 2; the
  in-game run proves the game's own camera (zoom 0.6 / 1.0 / 1.2).
- **No wasted pixels, no edge.** The meshes are static and cover only the blocks that hold water (body:
  64 × 32 px) or a soft shore (shore: 32 × 16 px). **Open sea (new):** every region edge whose border cells
  are open water (more than 300 G px from land, beyond the shore swell) gets a 3000 px skirt; outside the region
  the field is clamped, so the sea simply continues. The background no longer shows past the sea edge when the
  camera is free (zoom < 0.7, overview); `opts.openSea: false` turns it off.
- **Precision.** G coordinates are relative to the camera centre and every phase is wrapped on the CPU.
  **No uniform is shared between the vertex and fragment stages** (the fragment stage has its own `uRotAf` /
  `uRotBf`), so a mediump-only fragment stage links. `opts.precision: 'mediump'` forces it in the lab.
- **Budgets.** Fragment uniform vectors: body high 55, body low 45, shore 16 (WebGL1 phones offer ≥ 64;
  `check` fails above 60). Programs and textures are shared per renderer; Water rebuilds after a WebGL context
  loss.

### 4.2 The surface (body pass)

- **Directional swell.** Four Gerstner-like sine waves (`SWELL.waves`: 460 / 300 / 196 / 124 G px, amplitudes
  3.0 / 1.8 / 1.0 / 0.5 px, rotated 0 / +23 / −34 / +61° from the swell direction, deep-water dispersion slowed
  by `timeScale` 0.42). Near land the swell drops to 45 %.
- **Shore swell.** Phase k · ψ(distance to the wave-making coast) + ωt, period 6 s (the grid `amb_sea_waves` /
  `amb_beach` are rendered on), with slow along-coast variation. **It now lights the surface:** its slope runs
  along the baked coast direction, so the crests visibly roll in up to the waterline.
- **Light (re-tuned).** The swell normal is drawn 3.3× steeper than it moves (was 6×). A crest-lit / trough-dark
  gradient (±10 %) follows the height, so the swell bands are moving gradients. The sky reflection has a soft
  shoulder, 0.5 · (1 − e^(−2 · fresnel · refl)), instead of a hard clamp: no flat pale plateaus. Sun glints are
  small and soft (a broad lobe plus a tight core, softly saturated at 0.8 above the base colour, tinted
  sun × sky), gated into drifting patches by the low-frequency noise, and broader and fainter when zoomed out.
  At zoom < 1 the fine ripple layer fades, which removes the salt noise at 0.6.
- **Whitecaps (new).** Short soft streaks on the crests of the main swell, born and fading within about 1.5 s
  (two travelling streak patterns plus the drifting wind-patch noise, so they never form a regular lattice).
  The body is a soft ramp broken up by bubbles. The lace network is never thresholded in open water, so no
  "cracked ice".
- **Depth.** The sea-bed depth comes from the field (§4.4) and picks the LUT colour and its opacity over the
  bed; the shallows show the bed and moving caustics (waves_a.B × waves_b.B).
- **Fish under the surface (high quality).** The `fish_school` texture in the same two bands as the old
  tileSprites, one fetch for both, refracted by the surface slope, tinted toward the water above, faded out in
  very shallow water, and composited **before** the sky reflection and glints, which are weakened over them.
- **Ripple rings.** The CPU keeps up to 64 rings; every frame the strongest live ones near the view
  (strength · e^(−1.3 · age), 12 at high, 6 at low) are packed for the shader **and** for `heightAt`.
- **Contacts (new).** `addContact` / `addHull`: up to 16 (high) / 8 (low) circles on the water plane near the
  view. Each draws a foam collar whose width breathes with the local surface height and a soft shadow (pier
  decks, hulls, posts, ice, swimmers).
- **Hard shores.** Rock and breakwater: a slap collar that bursts when a crest arrives; where the shore swell
  does not reach (an offshore breakwater, a harbour), the burst follows the swell travelling along the wall.
  Quay: a lapping line 6–10 G px wide that breathes with the crest phase, plus a 36 G px contact shadow along
  the wall.

### 4.3 The soft shore (shore pass, premultiplied alpha over the land)

- **Surf zone.** A breaking crest line and the foam it leaves behind; a foam collar along the waterline; and
  (new) a white roll at the waterline every time a crest arrives.
- **Swash.** Foam lace rides up the shore with the 6 s cycle along the **local** shore normal (from the
  field, not one region-wide direction), then recedes. Behind it stays a darker wet band that dries over 2.6 s,
  with a short-lived gloss.
- **Snow bank (re-profiled).** Run-up 0.42 (was 0.16), surf zone 114 G px (was 62), the same breaking front and
  trailing foam as sand, and slush bits in a band that rides up with the swash and slides back. Colder: grey
  film, ice-grey foam shade, blue-grey wet snow.

### 4.4 Shoreline field (built once in JS, or baked offline)

1. The mask is evaluated as 2 × 2 samples per 8 × 4 world-px cell (polygon masks by scanline rasterisation).
   **One wall convention:** mask polygons are z0 footprints; every structure whose wall shows (quay and
   breakwater alike) is tested `waterPx` lower. Only land drawn down to the waterline itself (a sand or snow
   polygon) uses `{poly, waterPx: 0}`.
2. Regions above 300 k fine cells (the village: 520 k) are built on 2 × 2 coarser cells, and that coarse
   field is uploaded as is (the GPU filters it).
3. Distances by 8SSEDT: signed distance to any shore, and distance to the coasts that make waves. Land cells
   now take their nearest water cell's wave distance before the blur, so nothing drags the wave field down
   next to a breakwater.
4. **Sea bed (new):** the profile of the nearest wave-making coast along the wave distance (unclamped, so it
   keeps deepening offshore), with its slope blurred wide (σ = 8 cells). Quays and breakwaters change the bed
   only within 48 G px of their wall (deep at a quay, rubble at a breakwater). No crisp arc where the nearest
   shore type changes: the largest step anywhere in the beach scene is 6 % per 6 px.
5. Two RGBA8 textures: A = distance, wave distance, run-up, depth; B = coast direction (x, y), edge kind,
   snow.
6. **JS reads the same 8-bit texels the shader filters**, so `heightAt` matches the pixels (§6.8).

**Baked fields (new).** Static coasts are baked by `tools/fx/gen_water_field.mjs` into one opaque RGB image
(three bands stacked, exact through a 2D canvas) and a manifest entry with a signature of everything the
field depends on (region, mask samples, shore types, field version, data hash). `new Water(..., { baked })`
uses it only when the signature matches, otherwise it builds the field itself and warns; `check_water.py`
fails when the bake is stale. The village field costs 0.48–0.61 s to build in node (cold); from the bake it
takes 92–159 ms in the page (was 0.8–2.8 s). Build-time arrays are dropped after the build (1.0 MB of 8-bit
field data stays for `heightAt` and context restore). For dynamic regions, `opts.async: true` builds the field
over several frames (6 ms per frame) and shows the old sea meanwhile.

### 4.5 Shore types (`SHORE_TYPES`)

| type | run-up | edge | wave | sea bed | look |
|---|---|---|---|---|---|
| `sand` | 1.0 | 0 | yes | gentle (1.0) | surf lines, swash lace up the beach and back, wet band that dries |
| `snowbank` | 0.42 | 0 | yes | 0.75 | surf lines, white roll at the waterline, slush riding the swash (the village default) |
| `rock` | 0 | 1 | yes | steep (0.25) | slap collar + spray on faces into the swell |
| `breakwater` | 0 | 1 | no (waves pass and slap) | rubble within 48 G px | slap collar + spray on the seaward faces |
| `quay` | 0 | 0.5 | no | deep at the wall | lapping line + contact shadow |

Shore types are given per segment: `shoreTypes: 'sand'`, `fn(x, y)`, or `[{type, rect | poly | x: [x0, x1]}]`,
with `defaultShore` for the rest.

**Crash spray.** Crash points are hard-shore cells at the visible wall foot whose outward normal looks into
the swell (dot(normal, −swellDir) > 0.3), so the sheltered side never sprays. `crashEvents(t0, t1, fn)` gives
`fn(x, y, strength, t, behind)` at the crest arrivals (the same phase as the shader's burst; only the bigger
waves of a set). A face that looks away from the camera has its foot hidden behind the structure: `behind` is
true and the default player draws the spray at `opts.crashDepthBehind` (default `DEPTH.GROUND + 10`), under the
structure's tiles, so it rises over the wall top from the far side.

### 4.6 Quality, fallback, budget

| | body fetches / px | shore fetches / px | what is dropped |
|---|---|---|---|
| `high` | 7 (field A, field B, ripple A, ripple B, foam, LUT, fish) | 4 | — |
| `low` | **2** (field A, ripple A) | **2** | field B (one swell direction, every hard edge slaps), ripple B, caustics, foam texture, LUT (3 colour stops), fish in the shader, 6 of the 12 rings, 8 of the 16 contacts |
| Canvas renderer or failed compile | — | — | the old scrolling `water_sea` tileSprite (`water.fallback`), fish tileSprites |

LOW keeps **all four swells** (ALU only), and `heightAt` uses exactly the rings the shader draws, so boats bob on
what the player sees at both qualities. GPU texture memory for the whole village sea: 3.32 MB (shared textures
with mipmaps, fish texture, the two coarse field textures). No per-frame allocations (`check_water.py` scans
`_draw`; the low-quality uniform views are made once).

`suggestWaterQuality(gl)` picks `'low'` for Mali-G5x/G6x with ≤ 3 cores, Mali-4xx/T6xx–T8xx, Adreno 3xx–5xx
and 60x–61x, PowerVR GE8xxx / Rogue (and SwiftShader); `WaterBudget` answers `'low'` once when the median frame
with the sea on screen is slower than 22 ms over 3 s.

### 4.7 API

```js
import { Water, WaterMask, WaterPresets, WaterSheets, WaterBudget, bakedField, suggestWaterQuality, WATER_PX, SWELL, SHORE_TYPES } from './Water.js';

const water = new Water(scene, {
  region: { x, y, w, h },        // world px rectangle the field covers (open-water edges get an open-sea skirt)
  mask,                           // fn(x, y) | WaterMask.shoreY(fn) | { water: [poly], land: [poly | {poly, waterPx}] } (z0 footprints)
  waterPx: 0,                     // sea surface below the land in screen px (WATER_PX = 30 where walls show)
  shoreTypes, defaultShore,       // see 4.5
  palette: 'winter_sea',          // 'winter_sea' | 'harbor' | 'tropical' | 'pool' | a palette object
  quality: 'high',                // 'high' | 'low'
  swellDir, swell, surf, ripple,  // optional overrides (direction in G space; multipliers)
  fish: [{ y0, y1, alpha, scale, speed: [vx, vy], offset: [x, y], wobble: [amp, freq] }], fishKey: 'fish_school',
  depth, shoreDepth,              // default DEPTH.WATER, DEPTH.GROUND + 5
  openSea: true,                  // skirt past open-water edges
  onCrash: (x, y, strength, behind) => {}, crashDepthBehind, // default: plays fx_wave_crash
  baked: bakedField(scene, manifest, 'village'),            // { image, meta } from tools/fx/gen_water_field.mjs
  async: false,                   // build the field over several frames (old sea meanwhile)
  manifest,                       // assets/water manifest (palettes, fields); fallbackKey 'water_sea'; fieldScale 1 | 2
});
water.update(dt);                 // advance the clock (call every frame; clamps dt to 0.1)
water.setTime(t);                 // deterministic clock (tests / captures)
water.heightAt(x, y, t?)          // surface height in screen px (+ = up): same field texels, same packed rings as the shader
water.slopeAt(x, y, t?, out?)     // { x: dh/dx, y: dh/dy }: central differences of heightAt (±1 px)
water.surfaceY(x, y, t?)          // y + waterPx - heightAt: where a floating sprite's waterline goes
water.ripple(x, y, strength, t0?) // a ring (0.3 .. 2); 64 kept, the strongest near the view drawn
water.clearRipples()
water.addContact(x, y, r, { foam, shadow }) -> id;  water.moveContact(id, x, y, r?);  water.removeContact(id);  water.clearContacts()
water.addHull(x, y, charDef, dir, { foam, shadow }) -> ids;  water.moveHull(ids, x, y, charDef, dir)   // boats / ships (bowPoint, wakePoint, lengthM, beamM)
water.crashEvents(t0, t1, fn)     // fn(x, y, strength, t, behind) at rock / breakwater crest arrivals in (t0, t1]
water.shoreDistance(x, y); water.waveDistance(x, y); water.seaDepth(x, y)
water.swashPhase(x, y, t?)        // 0..1 shore-swell cycle: 0 = a crest reaches the waterline here (6 s)
water.syncPhase(cyc, x, y, maxStep?)  // nudge the crests toward an ambience bed's crest cycle (no visible jump)
water.bedSeek(x, y, swellPhase, swellPeriod, duration)  // where to seek a bed so its crests land with the water
water.setLighting({ dark, glint, refl, sss })           // night: dims glints / sky reflection / crest glow
water.setPalette(name | object); water.setQuality('high' | 'low'); water.setFish(layers, key); water.setDebug('height' | null)
water.drawsFish; water.isShader; water.fallback; water.ready
water.setVisible(v); water.destroy()  // also destroyed on scene shutdown
water.info()                      // { shader, quality, field, fieldScale, fieldFrom, fetchesBody, fetchesShore, fragUniformVectors, textureBytes, buildMs, ringsPacked, openEdges, ... }
WaterSheets.want(key); WaterSheets.allowed(key); WaterSheets.wake(dir) -> { key, flip }   // FX sheets on demand
```

## 5. FX spritesheets (`assets/water`, conventions of `assets/fx`)

All sheets are NORMAL-blend toy water: white to ice-blue body, bevel light from the upper left, and a thin
sea-blue rim so they read on snow, sand and deep sea.

| key | frame | frames · fps · repeat | anchor | use |
|---|---|---|---|---|
| `fx_wave_crash` | 192² | 10 · 20 · once | 0.5, 0.86 | **redrawn: "철썩!"** a translucent sheet of water (white rim, ice-blue body, soft streaks, a frothy scalloped lip) fans up above the wall top, tears into streaked droplets, falls back as mist; a short soft mottled foam patch on the water (no lattice). Anchor = the wall foot at the waterline |
| `fx_splash_small` | 96² | 10 · 24 · once | 0.5, 0.72 | fish jump, pebble, line plop, swimmer kick (unchanged) |
| `fx_splash_big` | 192² | 14 · 24 · once | 0.5, 0.80 | **redrawn:** a chunky crown (6 tall petals joined by a low serrated wall), a short rounded column with a dome cap (no bead), round toy droplets on arcs, a foam ring that outlives the crown |
| `fx_swim_ripple` | 128 × 64 | 12 · 12 · loop | 0.5, 0.5 | rings + lacy collar around a swimmer, under the swimmer (unchanged) |
| `fx_wake_v2` (+ `_s`, `_e`, `_ne`, `_n`) | 256 × 176 | 8 · 12 · loop | 0.5, 0.5 | boat wake V per heading (SE, S, E, NE, N; flipX for SW / W / NW); now fades out toward the frame edges (no straight edge of the churned-water tint); loaded per heading on first use |
| `fx_sparkle_water` | 128 × 64 | 12 · 12 · loop | 0.5, 0.5 | twinkling glints (low quality / Canvas, or calm water) |
| `fx_shore_wave_x` / `_y` | **192 × 128, draw at scale 2** (`drawScale` 2) | **24 · 12 · loop** | 0.5, 0.55 | rolling breaking-wave strip for sand beaches drawn **without** the shader; 2 s loop whose end cross-fades into its start (last → first change 0.36 × a normal step, was 1.84 ×); chain every (+256, +128) world px (`_x`) or (+256, −128) (`_y`) |

Decoded memory of all sheets: 15.9 MB (was 24.5 MB). The village with the shader decodes **none** of them until
used: `fx_wave_crash` only where crash points exist, a wake heading the first time a boat sails that way,
`fx_splash_small` when someone fishes (§6.1).

## 6. Integration — exact steps

Sections 6.1–6.3 are exactly the patches in `tools/test/water_lab/integrate.mjs`; they were applied to the
current files and booted in the real game (6.8). Sections 6.4–6.9 build on them.

### 6.1 `src/core/Assets.js` + the lazy gate in `src/scenes/Game.js`

```js
// Assets.js
export const FRAGMENTS = [/* …, */ 'workers', 'pets2', 'water'];
const LAZY_KEY = /^fx_(build_dust|build_done|wake|wake_ring|fire_big|wave_crash|splash_small|splash_big|swim_ripple|wake_v2(_[a-z]+)?|sparkle_water|shore_wave_[xy])$/;

// Game.js
import { WaterSheets } from '../systems/Water.js';
  lazyAllowed(k) {
    const pr = this.progress, f = Assets.fragOf[k];
    if (f === 'water') return WaterSheets.allowed(k);     // (v7) only the water effect sheets a system asked for
    if (!pr) return true;
    // … unchanged
```

The data textures and the baked field (0.6 MB) load with the first screen. The FX sheets are after-title files
that the gate lets through only when a system called `WaterSheets.want(key)` (Water does it for
`fx_wave_crash` when it has crash points; `WaterSheets.wake(dir)` for wakes); `checkLazyGates` picks them up
within 2 s. Water checks `textures.exists` before it plays anything, so a missing sheet is harmless.

### 6.2 `src/systems/Ground.js`

```js
// imports
import { Water, WaterPresets, bakedField, suggestWaterQuality } from './Water.js';
import { Settings } from '../core/Save.js';

// the two fish-school bands of the old tileSprites (world px); Water draws them UNDER its surface
const FISH_BANDS = [
  { y0: 40, y1: 240, alpha: 0.55, scale: 1, speed: [22, 0], offset: [0, 0], wobble: [5, 0.7] },
  { y0: 150, y1: 350, alpha: 0.35, scale: 0.8, speed: [14, 0], offset: [130, 40], wobble: [0, 0] },
];
```

In the constructor, replace the block from `// --- sea (live, scrolling)` through `this.t = 0;` with:

```js
    const wm = gs.cache.json.exists('manifest_water') ? gs.cache.json.get('manifest_water') : null;
    this.water = new Water(gs, Object.assign(WaterPresets.village(W, shoreY), {
      quality: Settings.data.water || suggestWaterQuality(gs.sys.renderer && gs.sys.renderer.gl),   // '물결 품질'
      fish: FISH_BANDS,
      fishKey: Assets.sprite('fish_school').tex,
      manifest: wm,
      baked: bakedField(gs, wm, 'village'),
    }));
    this.sea = this.water.fallback || null;
    this.liveShore = this.water.isShader;       // the shallows + shore foam are drawn live, not baked
    this.fish1 = null; this.fish2 = null;
    this.syncFish();
    this.t = 0;
```

`WaterPresets.village(W, shoreY)` is the old sea rectangle (x 0, y −200, the world width, down to the lowest
shore + 40) with the snow-bank coast and `winter_sea`; the bake tool uses the same preset, so the signatures
match. **When the coast or the world width changes, re-run `node tools/fx/gen_water_field.mjs`** (otherwise
Water builds the field at load and warns; `check_water.py` fails).

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

In `update(dt)`, replace the two `this.sea.tilePosition…` lines with `this.water.update(dt);` (it also scrolls
the fallback tileSprite).

### 6.3 `src/scenes/Game.js` — things in the sea bob with the swell and touch the water

In `buildDecor()`:

```js
      const wv = this.ground.water;
      if (key === 'dock_pier' && wv && wv.isShader) {
        // (v7) the pier's posts stand in the water: foam collars + the deck's shadow on the water
        for (const [mx, my] of [[-0.92, 0.7], [0.92, 0.7], [-0.92, 2.2], [0.92, 2.2]]) {
          const px = x + 45.25 * (mx + my), py = y + 22.63 * (mx - my);
          if (wv.shoreDistance(px, py) > 4) wv.addContact(px, py, 7, { foam: 0.85, shadow: 0.1 });
        }
        wv.addContact(x, y, 30, { foam: 0, shadow: 0.2 });
      }
      if ((key === 'boat_small' || key === 'ice_chunk') && y < shoreY(x) + 10 && wv && wv.isShader) {
        (this.floaters = this.floaters || []).push({ img, x, y, tilt: key === 'boat_small' ? 0.3 : 0.15, rot: img.rotation || 0 });
        const s = (o && o.scale) || 1;
        if (key === 'boat_small') { wv.addContact(x - 34 * s, y - 17 * s, 32 * s, { foam: 0.75, shadow: 0.22 }); wv.addContact(x + 34 * s, y + 17 * s, 32 * s, { foam: 0.75, shadow: 0.22 }); }
        else wv.addContact(x, y + 2, 26 * s, { foam: 0.6, shadow: 0.12 });
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

### 6.4 `src/entities/Boathouse.js` — the boats ride the swell, touch the water, leave rings and a V wake

Not run in the game (it needs the v3 progression); the same calls drive the lab boats.

```js
import { WaterSheets } from '../systems/Water.js';

// update(): replace this.sprite.setPosition(this.x, this.y);
    const wv = gs.ground && gs.ground.water, live = wv && wv.isShader;
    const bob = live ? wv.heightAt(this.x, this.y) : 0;
    this.sprite.setPosition(this.x, this.y - bob);
    if (live) {
      if (!this.hull) this.hull = wv.addHull(this.x, this.y, this.def, this.dir, { foam: 0.8, shadow: 0.24 });
      wv.moveHull(this.hull, this.x, this.y, this.def, this.dir);   // collar + shadow under the hull
    }
// the wake: the V sheet of the heading, asked for on first use (fallback: the old fx_wake)
    if (moving && onScreen) {
      const wv2 = WaterSheets.wake(this.dir);                         // { key, flip } and want(key)
      const wk = gs.textures.exists(wv2.key) ? wv2.key : 'fx_wake';
      if (this.wake && this.wakeKey !== wk) { this.wake.destroy(); this.wake = null; }
      if (!this.wake) {
        this.wake = gs.effects.loop(wk, this.x, this.y, wk === 'fx_wake' ? (this.level >= 2 ? 300 : 190) : (this.level >= 2 ? 512 : 294), d - 2);
        this.wakeKey = wk;
      }
      if (this.wake) {
        if (wk === 'fx_wake') this.wake.setPosition((this.x + wx) / 2, (this.y + wy) / 2).setFlipX(flip);
        else this.wake.setPosition(this.x, this.y - bob).setFlipX(wv2.flip);   // v2 anchor = hull centre at the waterline
        this.wake.setVisible(true).setDepth(d - 2);
      }
      this.ringT -= dt;
      if (this.ringT <= 0) {
        this.ringT = 0.28;
        if (live) wv.ripple(wx, wy, this.level >= 2 ? 1.0 : 0.7);       // rings in the water itself
        else gs.effects.sheet('fx_wake_ring', wx, wy, { size: this.level >= 2 ? 170 : 120, depth: d - 3 });
      }
      // … row sound unchanged
    }
// destroy(): if (this.hull && wv) for (const id of this.hull) wv.removeContact(id);
// catchOne(): rings where the fish comes out (next to the existing fx_splash at sx, sy)
    if (live) { wv.ripple(sx, sy, 1.2); WaterSheets.want('fx_splash_small'); }
```

### 6.5 Settings toggle '물결 품질'

- `src/core/Save.js` → `Settings`: add `water: null` to `data` (null = automatic), and in `load()`:
  `this.data.water = s.water === 'low' || s.water === 'high' ? s.water : null;`.
- `src/data/strings.js`: ko `waterQuality: '물결 품질', qualityHigh: '고급', qualityLow: '간단'`;
  en `waterQuality: 'Water', qualityHigh: 'High', qualityLow: 'Low'`.
- `src/scenes/UI.js` → four rows on a 96 px pitch (76 px buttons never overlap), panel 760 tall:
  `openSettings`: `panel(this, W / 2, H / 2, 'ui_panel', 560, 760)`; `buildPanelContent()`: title `cy - 322`,
  version `cy - 274`, rows sound `cy - 200`, music `cy - 104`, language `cy - 8` (its globe at `cy - 8`),
  water `cy + 88`, reset / reload buttons `cy + 200`, close `cy + 316`. A 5th row (the v4 day/night toggle)
  goes to `cy + 184` with the panel at 856, buttons at `cy + 296`, close at `cy + 412` and the title, version
  and rows moved up by 48.

  ```js
  // wave icon for the water row (drawn, like the globe)
  const wq = (S.water || this.gs.ground.water.quality) === 'low' ? 'low' : 'high';
  const wi = add(this.add.graphics());
  wi.fillStyle(0x2f86c9, 1); wi.fillCircle(cx - 200, cy + 88, 25);
  wi.lineStyle(4, 0xffffff, 0.95);
  for (const dy of [-7, 5]) { wi.beginPath(); for (let i = 0; i <= 16; i++) { const x = cx - 216 + i * 2, y = cy + 88 + dy + Math.sin(i * 0.8) * 3.5; if (i) wi.lineTo(x, y); else wi.moveTo(x, y); } wi.strokePath(); }
  row(cy + 88, t('waterQuality'), wq === 'high' ? t('qualityHigh') : t('qualityLow'), wq === 'high' ? 'green' : 'gray', () => {
    S.water = wq === 'high' ? 'low' : 'high'; Settings.save();
    if (this.gs.ground && this.gs.ground.setWaterQuality) this.gs.ground.setWaterQuality(S.water);
    this.buildPanelContent(false);
  });
  ```

- **Automatic quality.** The default is `suggestWaterQuality(gl)` (weak GPUs start at low). While
  `Settings.data.water` is still automatic, feed `new WaterBudget()` the frame delta with the sea on screen; when
  it answers `'low'`, call `ground.setWaterQuality('low')`, store it in `Settings.data.water`, and only then let
  the existing resolution drop (`View.forceK`) act.

### 6.6 Harbour, beach, hotel pool

Any number of Water regions can run at once; they share programs and textures. One wall convention for all:
mask polygons are z0 footprints, walls are seen `waterPx` lower. These are the lab's configurations:

```js
// harbour (CONTRACT_V6 quays): quay AND breakwater walls show, both tested WATER_PX lower (the region's waterPx)
new Water(gs, {
  region, waterPx: WATER_PX,
  mask: { land: [quayDeckPoly, breakwaterPoly] },
  shoreTypes: [{ type: 'breakwater', poly: shifted(breakwaterPoly, WATER_PX) }], defaultShore: 'quay',
  palette: 'harbor', quality,
});
// sunny beach (CONTRACT_V7 §W): the sand polygon ends at the waterline itself (waterPx 0), the breakwater wall shows
new Water(gs, {
  region,
  mask: { land: [{ poly: sandPoly, waterPx: 0 }, { poly: breakwaterPoly, waterPx: WATER_PX }] },
  shoreTypes: [{ type: 'breakwater', poly: shifted(breakwaterPoly, WATER_PX) }, { type: 'rock', x: [rx0, rx1] }],
  defaultShore: 'sand', palette: 'tropical', quality,
});
// hotel pool (beach_bld hotel_pool.waterPoly): calm, clear, tiled-blue bottom
new Water(gs, { region: bboxOf(waterPoly), mask: { water: [waterPoly] }, defaultShore: 'quay', palette: 'pool', swell: 0, surf: 0, openSea: false });
```

(`shifted(p, d)` = the polygon moved `d` px down: `p.map((v, i) => (i % 2 ? v + d : v))`.)

- Static coasts should be baked like the village: add the region to `FIELDS` in `gen_water_field.mjs` (and a
  preset next to `WaterPresets.village`), pass `baked: bakedField(gs, manifest, name)`.
- Every water-plane prop (`swim_buoy_line_*`, `float_raft`, `buoy`, boats) goes to `y - water.heightAt(x, y)`
  every frame, tilted by `slopeAt`, with an `addContact` / `addHull` under it. Swimmers: `fx_swim_ripple` under
  them (`WaterSheets.want('fx_swim_ripple')`), a small contact (`r 12, foam 0.5, shadow 0.06`), and
  `water.ripple(x, y, 0.55)` about once a second. Splashes: `fx_splash_small` / `fx_splash_big` plus
  `water.ripple(x, y, 1.3 … 1.8)`.
- **Request to the harbour art owner:** ring-free variants of the water-plane tiles (`breakwater_end_*`,
  `buoy`, pier posts) for use when `water.isShader`; their baked white rings now sit on top of the live foam.

### 6.7 Depth order (`DepthSort.DEPTH`)

| layer | depth |
|---|---|
| water body (+ open-sea skirt) | `DEPTH.WATER` (−20000) |
| old fish tileSprites (low / fallback only) | `DEPTH.FISH` |
| baked land tiles | `DEPTH.GROUND` |
| water shore layer (surf, swash, wet band, slush) | `DEPTH.GROUND + 5` |
| crash spray behind a structure | `DEPTH.GROUND + 10` (`crashDepthBehind`) |
| floors, decals, harbour tiles, pads, sprites; crash spray in front of a wall | unchanged; spray at `y + 2` |

### 6.8 Proof in the real game (`node tools/test/water_lab.mjs ingame`)

`water_lab.mjs ingame` boots the real game (`index.html`, fresh save, 390 × 844 at DPR 2). Playwright route
interception serves it the patched `Assets.js`, `Ground.js` and `Game.js`; the files in `src/` are never
written. The loop is put to sleep and the water clock set before the final frame. The same views are taken
without patches as a baseline; the composite is `docs/previews/water_ingame.png`.

- **All patch anchors were found in the current files** (`missing: {}`).
- WebGL path active; the **baked field is used** (`fieldFrom: 'baked'`); `drawsFish` true at high, false at low
  (the tileSprites come back); 8 decor floaters ride the swell; the pier posts and boats have contacts.
- No console errors or warnings in any run.

| run | sea | fish | field | field + meshes in the page | GPU texture memory |
|---|---|---|---|---|---|
| today, zoom 1.0 | tileSprite | tileSprites | – | – | – |
| Water high, zoom 1.0 / 0.6 / 1.2 | shader | under the surface | baked | 159 / 145 / 92 ms (was 0.8–2.8 s) | 3.32 MB (was 4.36) |
| Water low, zoom 1.0 | shader | tileSprites | baked | 104 ms | 3.32 MB |
| today vs Water high, zoom 0.6 above the old sea edge | background band vs **open sea** | | | 105 ms | |

**Shader vs `heightAt`** (lab `check`, debug readback of the drawn height at about 300–540 points over 3 times
per scene): village mean 0.0018 / max 0.009 px, harbour 0.0006 / 0.003 px, beach 0.0009 / 0.0045 px, **the same
at high and low** (was mean 0.63 / max 1.49 px at low). `node_test.mjs`: `slopeAt` vs the derivative of
`heightAt` p50 0.04 %, p95 3.5 %, max 0.0095 (was 1.5–2.9× off with sign flips).

### 6.9 Night and the sea ambience

- **Night.** Where the v4 `DayClock` updates its tint (each frame or on change):
  `ground.water.setLighting({ dark: dayClock.cur.a })`. Glints dim to 15 %, the sky reflection cools and
  darkens and the crest glow drops, under the DayClock's MULTIPLY overlay (lab `?dark=0.6`).
- **Ambience in step with the crests.** Start `amb_sea_waves` / `amb_beach` at
  `water.bedSeek(x, y, swellPhase, swellPeriod, duration)` (audio5 manifest fields) for the shore point near the
  camera. While it plays, every second or so call
  `water.syncPhase(fract((sound.seek - swellPhase) / swellPeriod), x, y)`: the water moves its shore-swell phase
  by at most 0.05 s per call toward the bed, so hitches (`update` clamps dt) and loop drift never put the crests
  and the washes out of step. `swashPhase` and `crashEvents` follow the same phase.

## 7. Performance

All measurements are SwiftShader (CPU WebGL) on a 4-core machine shared with other agents' renders (load
average about 12–15). Read them as **relative** costs. `perf` interleaves the variants over 5 rounds and reports
medians: a frame with the sea minus the same frame with the sea hidden, 780 × 1688 canvas (390 × 844 at DPR 2),
zoom 1.0.

| scene | old tileSprite | Water low | Water high | texture fetches / px (body, shore) |
|---|---|---|---|---|
| village coast | 184 ms (1×) | 545 ms (3.0×) | 749 ms (4.1×) | 1 / – · 2, 2 · 7, 4 |
| beach (+ the sand shore band) | 73 ms (1×) | 289 ms (3.9×) | 334 ms (4.6×) | 1 / – · 2, 2 · 6, 4 |

The builder's run measured 654 / 846 ms (village low / high) and 455 / 744 ms (beach) on a busier machine; the
polish adds work (shore-swell lighting, whitecaps, contacts, one more fetch) and removes some (lower glint
powers, fewer whitecap texture paths), and the totals stayed within the noise of the shared machine.

Phone estimate:

- SwiftShader runs the ALU on the CPU, so its ratios overstate ALU against texture bandwidth compared with a
  phone GPU, and the old sea is one fetch with almost no ALU.
- High body: about 380 scalar ALU operations plus about 24 transcendentals and 7 fetches per pixel, plus about
  10 operations per ripple ring and per contact near the pixel's view (the loops stop at the live count:
  typically 0–6 contacts and 0–12 rings). Low: about 230 operations, 2 fetches, 6 rings, 8 contacts.
- On a 1170 × 2530 phone canvas with the sea covering about half the screen, high is about 1.5 M px × 420 ops ≈
  0.65 G ops per frame, roughly 10–15 % of a mid-range GPU (Adreno 6xx above 61x, Apple A-series, Mali-G7x).
  **'high' is fine on a mid phone.**
- Weak GPUs (Mali-G52/G57 MC2, Adreno 610, PowerVR GE8320 …) start at **low** through
  `suggestWaterQuality`, and `WaterBudget` drops any phone to low when the median frame with the sea on screen
  is slower than 22 ms over 3 s, before the resolution drop (§6.5).

Other costs:

- **Draw calls:** +2 per Water region, each a batch break (Extern flushes Phaser's batch), instead of the
  3 tileSprites.
- **CPU per frame:** about 45 uniform uploads, ring packing (≤ 64 × 12 compares), no allocations;
  `heightAt` + `slopeAt` together cost about 3.4 µs per floater (node).
- **Load:** the village field from the bake: 92–159 ms in the page (0.08 s headless); built from scratch it
  would be 0.5–0.6 s in node. Lab-size regions build in 0.4–0.9 s (they are not baked).
- **Memory:** GPU textures 3.32 MB for the whole village sea; FX sheets decoded on demand (15.9 MB if every
  sheet were loaded, none by default in the village).

## 8. How to run

```sh
python3 tools/fx/gen_water.py            # textures + manifest + water_textures.png (deterministic)
python3 tools/fx/gen_water_fx.py         # FX sheets + previews   (--only key,key --no-gif)
node tools/fx/gen_water_field.mjs        # bake the village shoreline field (after a world / coast change)
python3 tools/fx/check_water.py          # validate -> RESULT: OK (0 errors, 0 warnings)
node tools/test/water_lab/node_test.mjs  # JS maths, packing, crash exposure, sea bed, bake round trip
export WATER_LAB_TMP=/some/scratch/dir   # frame cache
node tools/test/water_lab.mjs check      # every scene x high / low / old (+ height readback), mediump, night, Canvas
node tools/test/water_lab.mjs gifs       # water_village/harbor/beach.gif + stills (--only beach)
node tools/test/water_lab.mjs beforeafter
node tools/test/water_lab.mjs perf
node tools/test/water_lab.mjs ingame     # the real game with the integration patches
node tools/test/water_lab.mjs still beach --quality low --zoom 0.6 --dpr 2 --t 7.5 --out x.png
# interactive: node tools/test/serve.mjs 8080 -> /tools/test/water_lab.html?scene=beach&play=1  (&precision=mediump, &dark=0.6, &contacts=0)
```

## 9. Notes and limits

- Canvas renderer: the old look (tileSprite sea + fish). The FX sheets work there too; for beaches without
  the shader use `fx_shore_wave_*` (scale 2) and `fx_sparkle_water`.
- Dynamic coasts (a new quay, land reclaimed): destroy the region and build a new one (`async: true` spreads
  the build over frames). Static coasts: bake them.
- The open-sea skirt only extends region edges that are open water; a coast that runs off the region side is
  not extended (enlarge the region there).
- The swell stays calm at the toy scale (3 px swell, about 2 px shore swell); it reads through light, foam and
  the surf. `SWELL.normalBoost`, the palette `swell` / `surf` and `opts.swell` make it livelier.
- Contacts are circles on the water plane (two or three per hull); the shader draws the 16 (8 at low) nearest
  the view.

## 10. Critic issues

Every high and medium issue was reproduced (or measured) first, then fixed; the cheap lows too.

| # | sev. | issue | status | what changed / evidence |
|---|---|---|---|---|
| 1 | high | Open sea: flat sky-reflection plateaus, paper-chip glints, cracked-ice whitecaps, salt noise at zoom 0.6 | **fixed** | soft-shoulder reflection; normal boost 6 → 3.3 plus a crest-lit / trough-dark gradient; small soft tinted glints, softly capped, gated into patches, broader and fainter when zoomed out; whitecaps redone as soft streaks on the swell crests with a ~1.5 s life (no lace threshold in open water); fine ripples fade below zoom 1. `water_polish_fixes.png` row 1, `water_before_after.png`, zoom 0.6 / 1.4 lab stills |
| 2 | high | Village snow-bank coast undersells "출렁 파도" | **fixed** | `snowbank` run-up 0.16 → 0.42, surf zone 62 → 114 G px with the breaking front and trailing foam, a white roll at the waterline on every crest, slush lace riding the swash up and back; the shore swell now lights the surface up to the waterline; colder film / foam shade. `water_village.gif`, `water_ingame.png`, `water_polish_fixes.png` row 2 |
| 3 | high | Breakwater spray: (a) on the deck, (b) on the sheltered side, all at once, (c) cotton-ball art | **fixed** | (a) one wall convention (z0 footprints, every visible wall tested `waterPx` lower; harbour lab + §6.6 fixed): 0 of 6 harbour crash points on the deck (`node_test`); (b) crash points only where dot(outward normal, −swellDir) > 0.3; bursts follow the swell travelling along the wall (beach: crest groups spread 0.25–1.75 s, no silence over 6 s); far-side sprays draw behind the structure; (c) `fx_wave_crash` redrawn as a rising translucent sheet with a frothy lip, streaked droplets, mist and a soft foam patch. `water_polish_fixes.png` row 3, `water_harbor.gif` |
| 4 | med | Crisp depth arc where the nearest shore type changes; wave-distance blur dragged land values into the water | **fixed** | sea bed baked in the field from the wave-making coast (slope blurred σ = 8 cells, unclamped distance), hard structures only within 48 G px; land cells take the nearest water cell's wave distance before the blur. Largest depth step in the beach scene 6 % per 6 px (`node_test`); `water_polish_fixes.png` row 4 |
| 5 | med | `slopeAt` 2× off in y near the shore, x term ignored | **fixed** | `slopeAt` = central differences of `heightAt` (±1 px); node test p95 3.5 %, max 0.0095 against a ±0.25 px derivative (the residue is the bilinear field's cell edges) |
| 6 | med | Background shows past the sea edge (free camera, overview) | **fixed** | open-sea skirt (3000 px) past every open-water region edge, field clamped outside; in-game zoom 0.6 above y −200 now shows sea (`water_ingame.png`, bottom row); the harbour lab has no grey bands |
| 7 | med | Winter shallows read as a tropical lagoon; deep too light | **fixed** | new `winter_sea` (shallows sat 0.37 vs tropical 0.66, hue 198° vs 177°; deep L 0.31 < old sea 0.40; cold sky; caustics 0.35; ice-grey foam shade); `check_water.py` enforces both rules |
| 8 | med | No contact foam at hulls / posts / quay walls; invisible quay lap line; baked rings on harbour tiles | **fixed** (tiles: **requested**) | `addContact` / `addHull` / `moveHull` (collar breathing with the local height + soft shadow, 16 / 8 near the view); pier posts, decor boats, ice and Boathouse boats wired in §6.3 / 6.4; quay lap line 6–10 G px pulsing with the crest + 36 G px contact shadow. The ring-free variants of the harbour water-plane tiles belong to the harbour art owner: requested in §6.6 |
| 9 | med | Ring buffer evicts mid-life rings; LOW draws stale rings and 2 of 4 swells, desyncs from `heightAt` | **fixed** | 64 rings on the CPU, the strongest live ones near the view packed each frame (12 high / 6 low) and used by both the shader and `heightAt`; LOW sums all 4 swells. Readback: shader vs `heightAt` max 0.009 px at **both** qualities (was 1.49 px at low) |
| 10 | med | All 12 new sheets lazy-loaded: 24.5 MB decoded | **fixed** | on-demand loading through the Game's lazy gate (`WaterSheets.want / allowed / wake`): the village decodes none until used; `fx_shore_wave_*` half resolution (192 × 128 at scale 2); all sheets 15.9 MB. Packing the five wake headings into one sheet: **won't do** — per-heading on demand saves the same memory and keeps the sheet keys other tools read |
| 11 | med | Shoreline field built on the main thread (0.4–2.8 s) | **fixed** | the village field is baked (`gen_water_field.mjs`, 58 KB, signature + data-hash checked; `check_water.py` fails when stale): 92–159 ms in the page; build-time arrays dropped; `async: true` builds dynamic regions over frames. A Web Worker: **won't do** (mask functions are closures; bake + async cover the cases) |
| 12 | med | 'high' by default with no real weak-GPU safety | **fixed** (module + documented hook) | `suggestWaterQuality(gl)` (Mali-G5x/G6x ≤ MC3, Adreno ≤ 61x, PowerVR GE8xxx …) as the setting's default and `WaterBudget` (median frame > 22 ms over 3 s → low, before `View.forceK`); the `main.js` / settings wiring is game code, given in §6.5 |
| 13 | med | `fx_splash_big` reads as glass needles; `fx_shore_wave` jumps 1.84× at the loop | **fixed** | crown splash redrawn (6 tall petals joined by a low wall, dome-capped column, round droplets, lingering foam ring); shore wave 24 f at 12 fps, end cross-faded into its start (0.36×); `check_water.py` now fails loops above 1.3× |
| 14 | low | uRotA / uRotB shared between stages with different precision | **reproduced and fixed** | old code with a mediump fragment stage: "Precisions of uniform 'uRotA' differ between VERTEX and FRAGMENT shaders" → old sea. No shared uniforms now (`uRotAf` / `uRotBf`); `?precision=mediump` links and renders (lab `check`) |
| 15 | low | One region-wide swash direction | **fixed** | the swash lace and slush follow the local shore normal baked in field B (LOW keeps the region direction) |
| 16 | low | Settings row overlaps the buttons; no icon | **fixed** (doc) | 96 px row pitch, panel 760, buttons at cy + 200, drawn wave icon, and the 5-row layout for the v4 day/night row (§6.5) |
| 17 | low | Night keeps daytime glints; crests not in step with the ambience | **fixed** | `setLighting({ dark })` (glints to 15 %, cooler darker sky, less crest glow; lab `?dark=0.6`), `syncPhase` / `bedSeek` drive the shore-swell phase toward the audio5 beds (§6.9). The DayClock call is documented: `Game.js` does not create the DayClock yet |

Kept as the critic asked: the `Extern` compositing (pan stays world-locked), the shader/`heightAt` agreement
(now also a lab check at both qualities), the directional swell, the tropical shallows and swash, fish under
the surface, LOW keeping the look, the old sea without WebGL, no per-frame allocations, the `integrate.mjs`
route-interception approach (all anchors found), `check_water.py` and the deterministic lab clock.
