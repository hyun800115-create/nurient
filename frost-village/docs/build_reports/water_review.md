# water: build, critique, polish

## Polish (final)

# water build report — living water (CONTRACT_V7 §V), after the polish pass

The sea now reads as real water at phone zoom. Long swells roll toward the shore and break as surf. The village's snow-bank coast now has rolling surf lines and foam washing up the bank. Every high and medium critic issue was reproduced (or measured), then fixed; the cheap low ones were fixed too (table in §10).

Checks, all passing:
- `python3 tools/fx/check_water.py`: 0 errors, 0 warnings.
- `node tools/test/water_lab/node_test.mjs`: passes.
- `node tools/test/water_lab.mjs check`: passes with no console errors. It covers every scene at high, low and the old sea, a forced mediump GPU, night, and the Canvas fallback.

The section 6 integration was run in the real game again without changing any game file: headless Chromium was served patched copies of `Assets.js`, `Ground.js` and `Game.js`. Nothing in the game imports `Water.js` yet; section 6 gives the exact steps to wire it in.

The full report, with the code snippets and the complete integration steps, is in `/home/user/nurient/frost-village/docs/build_reports/water.md`.

## 1. Files

All new files, or files the water job owns; nothing else was touched.

| path | what |
|---|---|
| `assets/water/` | 5 data textures, the baked village shoreline field `field_village.png`, 12 FX sheets and `manifest.json` (now with a `fields` section). **1.36 MB** in total; the limit is 2.5 MB. |
| `src/systems/Water.js` | The module: `Water`, `WaterMask`, `WaterPresets`, `WaterSheets`, `WaterBudget`, `bakedField`, `suggestWaterQuality`, `waterShaderCosts`, `SWELL`, `SHORE_TYPES`, `DEFAULT_PALETTES`, `WATER_PX`. |
| `tools/fx/gen_water.py` | Textures, colour LUT, manifest and `water_textures.png`. Reruns give byte-identical files. |
| `tools/fx/gen_water_fx.py` | FX sheets and their previews. |
| `tools/fx/gen_water_field.mjs` (new) | Bakes the village shoreline field. `--check` fails when the bake is out of date. |
| `tools/fx/check_water.py` | Validator. It now also checks: winter vs tropical palette rules, loop closure ≤ 1.3×, that the baked field is current, and decoded sheet memory. |
| `tools/test/water_lab.html`, `water_lab.mjs` | Lab page and runner. `check` now also reads the drawn height back from the shader, and runs mediump, night and Canvas. |
| `tools/test/water_lab/lab.js`, `assets.js`, `land.js`, `compose.py` | Lab scenes and helpers. |
| `tools/test/water_lab/integrate.mjs` | The section 6 integration as exact text patches. |
| `tools/test/water_lab/node_test.mjs` (new) | Node tests without a browser. |
| `docs/previews/water_*` | GIFs, stills, before/after, `water_polish_fixes.png` (new), in-game proof, textures, FX sheets. |

## 2. Previews

| file | shows |
|---|---|
| `water_before_after.png` | The village coast today next to the new water, same framing. |
| `water_polish_fixes.png` | The critic's captures next to the same views now: open sea, snow-bank shore, breakwater spray, beach drop-off. |
| `water_village.gif` / `.png` | Snow-bank coast with surf rolling in and washing up the bank. Boats with foam collars, a fishing boat with a V wake, fish under the surface, soft whitecap streaks. 72 frames, 15 fps. |
| `water_harbor.gif` / `.png` | Quay walls with a lapping line and a shadow along the wall. A sheet of spray rises behind the breakwater's seaward wall and runs along it. Moored sailboat, buoy, a rowboat crossing with its wake. |
| `water_beach.gif` / `.png` | Tropical palette: turquoise shallows with caustics, deeper blue offshore with no seam, foam lace running up the sand and back, the wet band drying. Swimmers, a cannonball splash, an offshore breakwater. 90 frames, 6 s. |
| `water_ingame.png` | The real game with the patches: today vs Water high vs low vs zoom 1.2. At zoom 0.6 above the old sea edge: the background band today, open sea now. |
| `water_textures.png` | Every texture tiled 2 × 2, the LUT rows and the shore ramps. |
| `water_fx_sheet.png`, `water_fx_*.gif` | Every FX sheet on snow, sand and deep sea. |

The GIFs are 390 px wide and between 4.9 and 5.03 MB each.

## 3. Textures

All textures are sampled on the iso ground plane seen from above ("G space", 64 G px = 1 m), so they are foreshortened 2:1 like the ground. They are seamless.

| key | size | content |
|---|---|---|
| `water_waves_a` | 512² | Ripple normal from a periodic FFT ocean field, plus caustics |
| `water_waves_b` | 256² | Fine ripple normal, plus fine caustics |
| `water_foam` | 256² | Foam lace, bubbles and slush bits, low-frequency variation (also used to group glints and whitecaps into drifting patches) |
| `water_lut` | 256 × 8 | One colour row per palette |
| `water_shore_ramp` | 256 × 4 | Wet/dry ramps per shore material |
| `water_field_village` | 384 × 1017 RGB | The baked village shoreline field, 58 KB |

**Winter palette, retuned colder and darker.**
- Shallows run `#7FAFC0` → `#4D8DB0`: saturation 0.37 (tropical 0.66), hue 198° (tropical 177°).
- Deep water is `#1A4884`, lightness 0.31. That is darker than the old `water_sea` (0.40).
- The sky is a cold grey-blue, caustics are 0.35, and the foam shade is ice-grey.
- `check_water.py` now enforces both: the winter shallows must stay apart from the tropical ones, and the winter deep must be no lighter than the old sea.

## 4. `Water.js`

**How it draws (unchanged).** Two Phaser `Extern` objects: the body at `DEPTH.WATER`, the shore layer at `DEPTH.GROUND + 5`.

**Open sea (new).** Any region edge that lies in open water gets a 3000 px extension of the sea. When the camera is free (zoom below 0.7, overview), the background no longer shows past the old sea edge.

**Mediump-safe.** No uniform is shared between the vertex and fragment shaders any more, so a GPU with a mediump-only fragment stage now links the program.

**Shader budgets.**

| variant | fragment uniform vectors | texture fetches per pixel (body / shore) |
|---|---|---|
| high | 55 (body), 16 (shore) | 7 / 4 |
| low | 45 (body), 16 (shore) | 2 / 2 |

`check` fails above 60 uniform vectors.

**Surface look.**
- The swell normal is drawn 3.3× steeper than it moves (was 6×).
- Swell crests are lit and troughs darkened as moving gradients, not flat patches.
- The sky reflection eases in softly instead of hitting a hard clamp, so the flat pale plateaus are gone.
- Sun glints are small, soft, tinted and capped, grouped into drifting patches, and broader and fainter when zoomed out.
- The fine ripple layer fades below zoom 1, so there is no "salt noise" at zoom 0.6.
- Whitecaps are soft streaks on the swell crests that live about 1.5 s. The foam lace texture is no longer cut into hard shapes in open water, so no "cracked ice".
- The shore swell now lights the surface along the coast direction, so the crests visibly roll in.

**Shore types.**
- Snow bank: run-up 0.42 and a 114 G px surf zone, with a breaking front and trailing foam. A white roll breaks at the waterline on every crest. Slush lace and ice bits ride up the bank and slide back. It looks colder than sand.
- Swash follows the local shore direction instead of one direction for the whole region.
- Quay: a lapping line 6–10 G px wide that pulses with the crests, plus a 36 G px contact shadow along the wall.

**Ripple rings.** Up to 64 rings are kept on the CPU. Each frame the strongest live rings near the camera view are picked: 12 at high, 6 at low. The shader and `heightAt` use exactly that set. Low quality now keeps all four swells.

**Contacts (new).** `addContact`, `addHull` and `moveHull` draw a foam collar that pulses with the local wave height, plus a soft shadow. Up to 16 near the view at high, 8 at low.

**Shoreline field.**
- Field textures:
  - Texture A: distance to shore, distance to wave-making coasts, run-up, sea-bed depth.
  - Texture B: coast direction, edge kind, snow.
- The sea bed comes from the nearest wave-making coast, with its slope blurred widely. Quays and breakwaters change it only within 48 G px of their wall.
- Land cells take the wave distance of their nearest water cell before blurring, so land values no longer leak into the water next to a breakwater.
- JS reads the same 8-bit texels the shader filters, so the heights agree.

**Baked field (new).** `gen_water_field.mjs` bakes the village field into one image, signed with everything the field depends on plus a hash of its data. Water uses the bake only when the signature matches; otherwise it builds the field itself and warns. For changing coasts, `opts.async` builds the field over several frames.

**Crash spray.**
- One wall convention: polygons are ground-level footprints, and every visible wall is tested `waterPx` lower.
- Crash points are kept only on faces that look into the swell.
- Bursts follow the swell travelling along the wall.
- On faces turned away from the camera, the spray is drawn behind the structure (`crashDepthBehind`), so it rises over the wall top.

**Other new API.** `slopeAt` is now the exact derivative of `heightAt`. Also new: `setLighting` (night), `syncPhase` and `bedSeek` (stay in step with the sea ambience), `setDebug('height')`, `WaterSheets` (load FX sheets on demand), `suggestWaterQuality` and `WaterBudget` (weak-GPU defaults), `WaterPresets.village`, `bakedField`.

## 5. FX sheets

- **`fx_wave_crash`, redrawn ("철썩").** A translucent sheet of water rises above the wall with a frothy top edge. It tears into streaked droplets and falls back as mist, leaving a soft foam patch. The anchor is now 0.5, 0.86.
- **`fx_splash_big`, redrawn.** A chunky crown of 6 petals joined by a low wall, a short column with a rounded top, round droplets, and a foam ring that stays a few frames.
- **`fx_shore_wave_x` / `_y`.** Now half resolution (192 × 128, draw at scale 2), 24 frames at 12 fps. The end crossfades into the start: the jump at the loop is now 0.36× a normal frame step (was 1.84×).
- **Wakes.** They now fade out toward the frame edges, so no straight edge of the churned-water tint shows. They load per heading on first use.

Decoded memory for all sheets is 15.9 MB (was 24.5 MB). The village with the shader decodes none until they are used.

## 6. Integration

The patches in `integrate.mjs` cover:
- **`Assets.js`:** load the `water` fragment.
- **`Game.js` loading:** the lazy loader lets through only the water sheets a system asked for (`WaterSheets.allowed`).
- **`Ground.js`:**
  - build the sea with `new Water(gs, Object.assign(WaterPresets.village(W, shoreY), { quality: Settings.data.water || suggestWaterQuality(gl), fish, fishKey, manifest, baked: bakedField(gs, wm, 'village') }))`;
  - `syncFish` and `setWaterQuality`;
  - no more baked shallow band or foam strip.
- **`Game.js` decor:** the pier posts and decor boats or ice get contacts; floaters bob on `heightAt`.

The full report also gives:
- the Boathouse snippet (hull contacts, wakes on demand by heading);
- the settings layout: rows on a 96 px pitch, panel 760, buttons at cy + 200, a drawn wave icon, and the 5-row variant;
- automatic quality;
- the harbour, beach and pool configurations with the single wall convention;
- the request to the harbour art owner;
- the depth order;
- night and ambience steps.

**Proof in the real game.**
- All patch anchors were found in the current files.
- The baked field is used, and building the field and meshes takes 92–159 ms (was 0.8–2.8 s).
- GPU texture memory is 3.32 MB (was 4.36).
- Fish are drawn under the surface at high; the old fish tileSprites come back at low.
- 8 decor floaters ride the swell.
- At zoom 0.6 the open sea shows past the old edge.
- No console errors.

**Shader vs `heightAt`** (reading the drawn height back): the same at high and low (low was mean 0.63, max 1.49 px).

| scene | mean | max |
|---|---|---|
| village | 0.0018 px | 0.009 px |
| harbour | 0.0006 px | 0.003 px |
| beach | 0.0009 px | 0.0045 px |

**`slopeAt`** against the true derivative of `heightAt`: p95 error 3.5 % (was 1.5–2.9× off, with sign flips).

## 7. Performance

SwiftShader (software WebGL), relative numbers only. The cost is a frame with the sea minus the same frame without it.

| scene | old tileSprite | Water low | Water high |
|---|---|---|---|
| village | 184 ms | 545 ms (3.0×) | 749 ms (4.1×) |
| beach | 73 ms | 289 ms (3.9×) | 334 ms (4.6×) |

- My estimate for a mid-range phone is about 10–15 % of the GPU frame at high quality: fine.
- Weak GPUs start at low quality.
- The frame-time check switches any phone to low before the game lowers its resolution.
- `heightAt` plus `slopeAt` cost about 3.4 µs per floating object.

## 8. How to run

```
python3 tools/fx/gen_water.py
python3 tools/fx/gen_water_fx.py
node tools/fx/gen_water_field.mjs        # after a world / coast change
python3 tools/fx/check_water.py
node tools/test/water_lab/node_test.mjs
node tools/test/water_lab.mjs check | gifs | beforeafter | perf | ingame | still …
```

## 9. Notes and limits

- The Canvas renderer still shows the old sea.
- Static coasts should be baked; changing coasts can use `async: true`.
- The open-sea extension only covers region edges that are open water; a coast that runs off the side of a region is not extended.
- The swell stays calm at the toy scale.
- The shader draws only the contacts nearest the view (16 at high, 8 at low).

## 10. Critic issues → outcome

| # | sev. | issue | status | change / evidence |
|---|---|---|---|---|
| 1 | high | Open sea: flat reflection patches, paper-chip glints, cracked-ice whitecaps, salt noise at zoom 0.6 | **fixed** | Soft reflection, normal 6 → 3.3× with crest/trough gradient, small soft capped glints in patches, soft streak whitecaps with a ~1.5 s life, fine ripples fade when zoomed out (`water_polish_fixes.png` row 1, before/after) |
| 2 | high | Snow-bank coast does not sell "출렁 파도" | **fixed** | Run-up 0.16 → 0.42, surf 62 → 114 G px with front and trail, white roll each crest, slush riding the swash, shore swell lights the surface, colder look (`water_village.gif`, `water_ingame.png`) |
| 3 | high | Breakwater spray on the deck, on the sheltered side, all at once; cotton-ball art | **fixed** | One wall convention (0 of 6 harbour crash points on the deck); exposure filter > 0.3; bursts travel along the wall (spans 0.25–1.75 s, no silence over 6 s); spray behind the structure on far faces; `fx_wave_crash` redrawn |
| 4 | med | Crisp depth arc; wave distance dragged down next to breakwaters | **fixed** | Sea bed baked from wave-making coasts with wide slope blur, hard structures only within 48 G px; land cells take the nearest water value before blurring. Largest depth step 6 % per 6 px |
| 5 | med | `slopeAt` 2× off near the shore | **fixed** | Central differences of `heightAt`; node test p95 3.5 % |
| 6 | med | Background shows past the sea edge | **fixed** | Open-sea extension; in-game zoom 0.6 shows sea |
| 7 | med | Winter sea reads as a tropical lagoon | **fixed** | New winter palette plus two `check_water.py` rules |
| 8 | med | No contact foam; invisible quay line; baked rings on harbour tiles | **fixed** (tiles **requested**) | `addContact` / `addHull` wired to posts, boats and ice; quay line 6–10 G px plus wall shadow. Ring-free harbour tiles requested from the harbour art owner in §6.6 |
| 9 | med | Rings evicted mid-life; low quality out of sync with `heightAt` | **fixed** | 64-ring pool packed per frame for both shader and `heightAt`; low keeps all 4 swells; readback max 0.009 px at both qualities |
| 10 | med | All new sheets loaded after the title: 24.5 MB decoded | **fixed** | On-demand loading through the lazy loader, shore wave at half resolution, 15.9 MB if all loaded. Packing the wake headings into one sheet: **won't do** — per-heading loading saves the same memory and keeps the keys other tools read |
| 11 | med | Field built on the main thread (0.4–2.8 s) | **fixed** | Baked village field: 92–159 ms in the page; build arrays freed; async build for dynamic regions. A Web Worker: **won't do** (mask functions can't move to a worker; bake plus async cover it) |
| 12 | med | No weak-GPU safety | **fixed** (module + documented hook) | `suggestWaterQuality` and `WaterBudget`; the wiring into the game's settings is game code, given in §6.5 |
| 13 | med | Big splash looks like glass needles; shore wave jumps at the loop | **fixed** | Crown splash redrawn; shore wave 24 frames at 12 fps with crossfade (0.36×); check now fails loops above 1.3× |
| 14 | low | WebGL1 precision mismatch | **reproduced and fixed** | Old code with mediump: "Precisions of uniform 'uRotA' differ" and fell back to the old sea; new code links and renders with `?precision=mediump` |
| 15 | low | One swash direction per region | **fixed** | Local shore direction from the field (low keeps one direction) |
| 16 | low | Settings row overlaps the buttons | **fixed** (doc) | 96 px row pitch, wave icon, 5-row variant (§6.5) |
| 17 | low | Night keeps daytime glints; crests out of step with the ambience | **fixed** | `setLighting`, `syncPhase` / `bedSeek`; the DayClock hook is documented because `Game.js` does not create the DayClock yet |

Kept as the critic asked:
- the `Extern` compositing and world-locked pan;
- the shader / `heightAt` agreement, now also a lab check at both qualities;
- the directional swell;
- the tropical shallows and swash;
- fish under the surface;
- low quality keeping the look;
- the old sea without WebGL;
- no per-frame allocations;
- the `integrate.mjs` route-interception approach;
- `check_water.py` and the deterministic lab clock.

Key paths:
- `/home/user/nurient/frost-village/docs/build_reports/water.md`
- `/home/user/nurient/frost-village/src/systems/Water.js`
- `/home/user/nurient/frost-village/tools/fx/gen_water_field.mjs`
- `/home/user/nurient/frost-village/assets/water/field_village.png`
- `/home/user/nurient/frost-village/tools/test/water_lab/node_test.mjs`
- `/home/user/nurient/frost-village/docs/previews/water_polish_fixes.png`
- `/home/user/nurient/frost-village/docs/previews/water_ingame.png`
- `/home/user/nurient/frost-village/docs/previews/water_village.gif`
- `/home/user/nurient/frost-village/docs/previews/water_harbor.gif`
- `/home/user/nurient/frost-village/docs/previews/water_beach.gif`

## Critique

```json
{
 "verdict": "polish",
 "summary": "The living water is a real upgrade and works, but it needs art and code polish before the designer sees it. I re-ran the lab check and node checks, and rendered my own captures: 390x844 at DPR 2, zoom 0.6/1.0/1.4, 9 s at 10 fps, a pan test, the low quality setting, each shore type, and in-game runs with the integrate.mjs patches. The engineering core is strong. The water stays exactly on the world under camera pan: the measured difference is 0.000. The heights the code reports match what the shader draws to within 0.10 px at high quality. The swells really do roll toward the shore (a time-slice of the frames shows diagonal bands). All integration patch anchors are found in the current src. Low quality keeps the look, and with no WebGL the old sea comes back. At the default in-game zoom of 1.2 it already looks clearly better than the old texture.\n\nWhat still reads as fake is the open sea. About 11% of open-water pixels sit on one flat clamped sky-reflection colour, which looks like camouflage blotches. Sun glints are pure-white paint chips (1.6% of pixels). Whitecaps show the foam texture's network and look like cracked ice. At zoom 0.6 the sparkles turn into salt noise. The winter shallows are almost the same hue as the tropical beach.\n\nThe village coast, which ships first, undersells \"출렁 파도\". The same coast set to the sand shore type is far livelier.\n\nBreakwater spray has three problems. It spawns on the breakwater deck in the harbour setup, because that config uses a different water-level offset from the beach. It also fires on the sheltered inner side. And the spray art reads as cotton balls with pearls.\n\nThere is also a crisp depth-colour arc where the nearest-shore type switches between beach and breakwater. The background shows above the sea at zoom below 0.7 or in overview mode.\n\nOn the code side:\n- `slopeAt` returns twice the true y-slope near the shore.\n- Low quality silently desyncs from `heightAt` (up to 1.5 px), and 61% of wake rings never reach its shader.\n- There is no contact foam around hulls, pier posts or quay walls.\n- Loading all the new FX sheets lazily costs 24.5 MB of decoded texture memory.\n- Building the shoreline field blocks the main thread for 0.4–2.8 s.\n\nNone of this needs a rewrite; the fixes are tuning, configuration and art.",
 "issues": [
  {
   "severity": "high",
   "area": "open-sea surface look (art direction)",
   "problem": "The open sea does not read as rolling water at phone zoom. (1) `col = mix(col, sky, clamp(fres * uMisc.z, 0.0, 0.55))` saturates, so the swell's light bands become flat, featureless, hard-edged pale-blue blotches. 10.9% of open-water pixels are within ±5 of one colour (109,161,214), and the luminance histogram has a spike at L≈150 (camouflage pattern). (2) Sun glints `pow(ndh, 320..760) * glint * 1.5` clip to pure white, solid, hard-edged chips up to about 20 px (1.6% of pixels). They look like floating paper or ice, not light. (3) Whitecaps threshold the foam texture's lace network, so they show as white Y-shaped veins like cracked ice (dangerous on a winter sea). (4) At zoom 0.6 the high-frequency energy is 1.6× that at 1.0 (Laplacian 10.5 vs 6.6) with the same white fraction: salt noise ('snow on the sea').",
   "evidence": "/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v7_water_critic/v_z10_open_consec.png, v_z14_caps.png, v_z10_plateau_mask.png, v_z06_open.png (same folder); Water.js FRAG_BODY lines 355-370.",
   "fix": "Replace the hard clamp with a soft shoulder, e.g. reflection = 0.55*(1-exp(-fres*refl/0.55)), and lower normalBoost from 6 to about 3–3.5. Instead, add a smooth crest-lit / trough-dark gradient from h and hS, so the bands are moving gradients, not plateaus. Glints: tint them with sun × sky, cap the peak at about 0.8 above the base colour, add a soft falloff and a 1–3 px core, and gate their count (e.g. ripple-B.b > 0.7). Scale glint intensity and size by zoom, or use a Toksvig/mip-roughness term, so zoom 0.6 does not alias. Whitecaps: draw short soft elongated streaks along swell crests with a spawn→fade lifetime (about 1.5 s) from a low-frequency noise. Do not threshold the lace network in open water."
  },
  {
   "severity": "high",
   "area": "village snow-bank coast (ships first) — '출렁 파도'",
   "problem": "`snowbank` has a 16% run-up (24 G px ≈ 12 screen px), a surf width of 30+200·0.16 = 62 G px, and little foam. At the village shore the visible wave action is a thin foam line and slush. The rolling crests fade near the shore (in the time-slice image the bands go horizontal near the shore). The same coast with shoreTypes 'sand' shows clear white surf lines rolling in and washing up. The designer's first and main request will be judged on this coast (기획서 §8: '서리마을 앞바다부터').",
   "evidence": "/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v7_water_critic/v_z10_shore.png (snowbank) vs v_sand_shore.png (same coast, sand); kymo_village.png; in-game igs_dock12_f20_top.png",
   "fix": "Give `snowbank` its own surf profile:\n- run-up about 0.35–0.45;\n- surfW about 120 G px, with the breaking crest line `front` and the `trail` foam of the sand path;\n- slush lace that rides up and slides back;\n- a short white roll at the waterline every crest.\n\nKeep it colder and greyer than sand. Re-check at in-game zoom 1.2 with integrate.mjs."
  },
  {
   "severity": "high",
   "area": "rock / breakwater spray (placement, exposure, FX art)",
   "problem": "(a) In the harbour configuration the breakwater mask uses {poly, waterPx: 0} (report §6.6), but the sprite's waterline is about 30 px lower, so crash points sit ON the breakwater deck and the spray erupts from its top. The beach config uses WATER_PX for the same tile set, so the two documented conventions contradict each other. (b) Crash points are not filtered by exposure. Spray fires on both sides, including the sheltered harbour basin. With no wave-making coast, dw is 768 everywhere, so 7 sprays fire within 0.7 s (t 2.43–3.13) and then nothing until t 9.08. (c) The fx_wave_crash art reads as cotton balls or cauliflower with pearl beads, and its residue is a white net. There is no rising sheet of water, so it does not read as '철썩!'.",
   "evidence": "/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v7_water_critic/crash_harbor.png and crash_harbor_quay_crop.png (red dots = crashPoints on the deck), crash_beach.png, crash.json, h_z10_quay.png, b_z10_spray.png; docs/build_reports/water.md §6.6",
   "fix": "(a) Use one convention: the land footprint at z0 tested `waterPx` lower for every structure whose wall shows (breakwater and quay alike). Fix §6.6 and the harbour lab, and anchor the spray at the visible wall foot (y + waterPx). (b) Keep a crash point only if dot(outward edge normal, -swellDir) > 0.3 (compute the normal from the d-field gradient). Space bursts along a breakwater with a travelling phase (crest arrival along the wall), not a shared av gate. (c) Redraw fx_wave_crash: a 2–3 frame vertical, translucent white-to-ice-blue sheet that fans up above the wall top, with streaked droplets and spray mist falling back, then a short soft foam patch (no lattice). Keep the toy bevel and rim."
  },
  {
   "severity": "medium",
   "area": "depth colour: crisp arc where the nearest-shore type changes",
   "problem": "Run-up and edge kind are copied from the nearest shore cell and blurred by only σ = 2 cells. They switch from 1/0 (sand) to 0/1 (breakwater) within about 35 px on the beach/breakwater bisector (sampled: run-up 0.98→0.87→0.57→0.22→0.04 over 4 samples at d≈340–360 G px). The sea-bed slope (`slp`), and therefore depth and LUT colour, jumps there and draws a sharp static curved line across open water. A related artifact: the wave-distance blur mixes land values (w=d<0) into water. Next to the breakwater, dw falls from 678 to 452 within about 30 px, which squeezes a phase fringe along a structure marked `wave:false`.",
   "evidence": "/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v7_water_critic/b_z06_dropoff_crop.png (arc static in f10/f25: b_z06_f.png); arc.mjs output (run-up/edge/dw samples)",
   "fix": "Take the sea-bed depth from the soft-coast distance (dw) with the sand or snow profile, and apply hard-structure steepness only within about 40 G px of the hard edge: depth = min(profileSoft(dw), profileHard(d) blended by 1 - smoothstep(0, 40, d)). Alternatively, blend run-up and edge by inverse-distance weighting of nearby shore types (σ ≥ 8 cells). For the wave field, set land cells to their nearest water value (or DM) before blurring, not to d."
  },
  {
   "severity": "medium",
   "area": "slopeAt correctness (JS API)",
   "problem": "In `_surface`, the y-derivative of wave distance is `(W(y+e/2) - W(y-e/2)) / e`, which is per world-y px. It is then treated as per G px and doubled again by `out.y = 2*sy`. In the shore-swell band, slopeAt.y is therefore about 2× the true derivative of heightAt. Measured slopeAt.y / finite-difference ratios: 1.5–2.9 typical, 6.9 and 16.7 where terms cancel, and sign flips (−5.5) at d≈290. It is exact (1.00) offshore beyond the reach. The x term is also off 10–50% because d(av)/dx and d(nu)/dx are ignored. The report claims slopeAt matches the shader maths.",
   "evidence": "/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v7_water_critic/num.mjs (console tables: village rows 0–35, east rows 0–17); Water.js lines 1040-1045",
   "fix": "Divide by 2*e (the Δy of e world px is 2e G px). Simpler and exact: compute slopeAt as central differences of the analytic heightAt at ±1 world px (about 4 extra evaluations, still under 10 µs). Add a node test that asserts |slopeAt − FD| < 5%."
  },
  {
   "severity": "medium",
   "area": "region bounds: background shows past the sea edge",
   "problem": "The body mesh only covers the region rectangle. With free camera (zoom < 0.7 hook, or toggleOverview → removeBounds), the in-game view above world y −200 shows a flat background band across the top third of the screen. The harbour lab shows the same grey bands top and bottom at zoom 0.8. The old tileSprite had the same limit, but the new sea makes the hard edge more visible, and every new harbour or beach region will hit it.",
   "evidence": "/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v7_water_critic/ig2_old_vs_z06.png (real game + patches, zoom 0.6 at 1300,250), crash_harbor.png (top/bottom bands), v_z06_f0.png",
   "fix": "Add an 'open sea' mode. The body draws a camera-covering quad (or extends its mesh past the region edges that touch open water). The field is sampled with CLAMP_TO_EDGE and treated as deep water (d = dw = DM, run-up 0) outside the region. The ocean is then unbounded at zero field cost, and the field only needs to cover the coasts. At minimum, raise the village region top to cover the overview fitZoom view."
  },
  {
   "severity": "medium",
   "area": "winter vs tropical palette, house style",
   "problem": "The winter shallows (#78C7D8 → #45A3C9 LUT) measure hue 198°, saturation 0.61, lightness 0.61 in frame, against the tropical beach water at hue 192°, saturation 0.55–0.71. The village coast reads as a bright tropical lagoon, so the designed contrast (서리마을 '짙은 남색·차가운 청록' vs 해변 '따뜻한 에메랄드') is lost. The reflected sky (#A9CDEC) adds summer-blue plateaus. The deep water (hue 211°, lightness 0.44) is lighter than the old house water (210°, 0.40) and than 'navy'.",
   "evidence": "/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v7_water_critic/ig1_shore_old_new.png, ig1_old_vs_new_top.png, v_z10_shore.png; palette measurements in session (village shallow vs beach)",
   "fix": "winter_sea:\n- shallows #7FAFC0 → #4D8DB0 (saturation ≈ 0.35–0.45);\n- deep #1A4D8A → #163F75;\n- skyLo a cold grey-blue #9DB6CC, skyHi #3F6E9E;\n- caustic about 0.35;\n- a hint of ice-grey in the foam shade.\n\nKeep tropical as is. Add check_water.py rules: a minimum hue or saturation distance between the winter_sea and tropical shallows, and the winter deep colour no lighter than the old water_sea."
  },
  {
   "severity": "medium",
   "area": "contact foam: hulls, pier posts, quay walls",
   "problem": "Moored boats, ice chunks, pier posts and swimmers have no waterline interaction from the shader: no contact collar, no darkening, no lapping. They float like stickers (in-game, boat_small and the pier at zoom 1.2). The quay 'bright lapping line' is 1–6 G px wide (`smoothstep(1, 4+2.5·…)`) and invisible at phone scale, so quay walls look dead. Harbour sprites (breakwater_end, buoy, pier posts) carry static baked white rings that now sit on top of live foam (double foam).",
   "evidence": "/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v7_water_critic/igs_dock12_f20_top.png, v_quay_shore_f10.png, crash_harbor_quay_crop.png (static 'ooo' rings at the breakwater end)",
   "fix": "Add `water.addContact(x, y, rx, ry, {foam, shadow})`: up to 16 ellipses passed as uniforms. Each gives a 4–8 px pulsing foam collar in time with heightAt, plus a 20–30% darkening under hulls and pier decks. Use it for boats, floaters and pier posts. Quay: lap line 6–10 G px, pulsing with the crest phase, plus a 20–40 G px contact-shadow band along walls. Ask the harbour art owner for ring-free variants of the water-plane tiles, used when water.isShader."
  },
  {
   "severity": "medium",
   "area": "ripple ring buffer and LOW-quality sync",
   "problem": "(1) There is one 12-ring buffer per region with oldest-first eviction and no view culling. With 4 swimmers at 1/s plus a boat every 0.28 s, rings are evicted at age about 1.6–1.9 s. A busy beach (many swimmers, swan boats, banana boat) will drop rings mid-life (cannonball 1.8 at 1.6 s still has env ≈ 0.22). (2) LOW draws the first 4 live slots in buffer order, not the newest: a simulated boat wake shows 19 of 31 rings never drawn. heightAt still includes them, so boats bob on invisible rings. (3) LOW draws 2 of the 4 directional swells but heightAt sums all 4. Measured shader−JS height error is mean 0.63 / max 1.49 px (village low) and 0.34 / 1.01 px (beach low), against max 0.07–0.10 px at high.",
   "evidence": "/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v7_water_critic/dbg/height_sync.json and height_sync2.json (debug shader readback), lowrings.mjs output, num.mjs (eviction ages); Water.js _draw ring packing lines 1480-1488",
   "fix": "Keep a CPU list of about 64 rings. Each frame, pack the N strongest live rings (strength·e^{−1.3·age}) inside the camera view plus a margin, newest first, and have heightAt use exactly that packed set. In LOW, keep all 4 swells: they are ALU-only and the saving is in texture fetches. Otherwise make heightAt quality-aware. Add the debug-readback height test to check_water / the lab for both qualities."
  },
  {
   "severity": "medium",
   "area": "memory: lazy FX sheets",
   "problem": "The proposed LAZY_KEY loads all 12 new sheets after the title. Decoded they are 24.5 MB of RGBA. fx_shore_wave_x/_y alone are 12.6 MB (1536×1024 each) and are only for beaches drawn without the shader, so the village shader path never uses them. The five wake_v2 directional sheets are 7.2 MB more. This regresses the texture-memory work done in v3.5 (R-fixes) on low-end phones.",
   "evidence": "assets/water/*.png sizes (session computation: shore_wave 6.29 MB each, wake_v2 1.44 MB × 5, splash_big 2.06 MB); tools/test/water_lab/integrate.mjs LAZY_KEY patch",
   "fix": "Do not put fx_shore_wave_* (or sparkle) in the village load. Load them only for Canvas or non-shader beach regions. Load wake_v2_<dir> on first use per heading, or pack the 5 headings into one sheet at half resolution (256×176 → 192×132). Half-resolution shore-wave frames scaled ×2 are fine for a soft white strip."
  },
  {
   "severity": "medium",
   "area": "load time: shoreline field on the main thread",
   "problem": "`new Water()` builds the field synchronously inside the Ground constructor: 520k cells for the v4 village sea. It took 0.36–0.45 s in node (cold JIT) and 0.8–2.8 s in the page here (782 / 1307 / 2097 ms measured in my in-game runs). On a mid-range phone expect a 0.5–1.5 s hitch at Game creation, repeated on every scene restart. It also keeps about 10 MB of JS arrays (cov is dropped, but fieldD/W/R/E are 2 MB each, plus fieldPx).",
   "evidence": "/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v7_water_critic/ig1/ingame.json (buildMs 1306.7), ig2/ingame.json (782.5), igs_dock12/info.json (2096.6); num.mjs (445 ms node)",
   "fix": "The village coast is static data (WORLD.shore), so bake its field offline (tools/fx) into assets/water/field_village.png (768×677 RGBA, small) plus a JSON (nx, ny, region, autoDir, crash points), and load it. Keep the runtime build for dynamic regions, but run it in idle chunks or a worker. Free fieldR and fieldE after the meshes and crash points are built."
  },
  {
   "severity": "medium",
   "area": "performance safety on weak GPUs",
   "problem": "The report recommends 'high' by default and relies on the existing weak-GPU drop for low-end devices. That drop (main.js) only fires when View.k > 1.05 and fps < 30, it lowers resolution (forceK) rather than water quality, and it stops checking after about 15 s. The report's own estimate is that high takes about half a frame on Mali-G52-class GPUs (common Galaxy A-series), which usually lands at 35–45 fps and never triggers the < 30 rule. The ALU estimate (about 330 ops) also leaves out the 12-iteration ring loop.",
   "evidence": "src/main.js lines 79-88; docs/build_reports/water.md §7",
   "fix": "Default to 'low' when WEBGL_debug_renderer_info matches Mali-G5x/G6x MP≤3, Adreno 5xx/6[01]x or PowerVR GE8xxx. Add a water budget check: sample frame time for 3 s with the sea on screen and drop the water to low before forceK. Store the result in Settings.water so the settings toggle reflects it."
  },
  {
   "severity": "medium",
   "area": "FX sheets: splash_big and shore_wave",
   "problem": "fx_splash_big reads as a thin glass needle topped by a bead with an ice-shard crown. At zoom 1 it is about 60 px tall, slim and crystal-like, too weak for a cannonball and more ice than water on the tropical beach. fx_shore_wave_x/_y loop with a 1.84 / 1.88× jump at the wrap (check_water notes) at only 6 fps, so a large white strip will visibly stutter every 2.7 s.",
   "evidence": "/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v7_water_critic/b_z10_splash.png; docs/previews/water_fx_sheet.png; check_water.py output 'loop fx_shore_wave_x close/step 1.84'",
   "fix": "Splash_big: a chunky white crown (5–7 thick petals) with round toy droplets and a short central column (no bead), plus a foam ring that stays for 3–4 frames. Keep the 1 px rim. Shore wave: re-render as 24 frames at 12 fps, with the last frame blended into the first (crossfade the final 3 frames). Make check_water fail above 1.3× for loop sheets."
  },
  {
   "severity": "low",
   "area": "WebGL1 compatibility (precision)",
   "problem": "uRotA and uRotB are declared in both shaders: highp in the vertex shader (`precision highp float`) and mediump in the fragment shader when GL_FRAGMENT_PRECISION_HIGH is undefined. GLSL ES 1.0 / WebGL1 require uniforms shared between stages to have matching precision, so on mediump-only GPUs the program fails to link and Water falls back to the old sea. The 'mediump-safe' claim in the report was never actually exercised.",
   "evidence": "Water.js VERT lines 159-167, FRAG_COMMON 191-195, FRAG_BODY 234-235",
   "fix": "Use fragment-only names (e.g. uRotAf / uRotBf) for the slope rotation, or declare `uniform mediump vec4 uRotA` in both stages. Add a lab flag that forces `precision mediump float` in both shaders to test the mediump path (SwiftShader honours it)."
  },
  {
   "severity": "low",
   "area": "swash direction on multi-orientation coasts",
   "problem": "The lace offset uses one region-wide uSwDir. On the v4 village sea, autoDir (−0.55, 0.84) is 33° off the west coast's normal and 11° off the east diagonal coast, so the lace shears sideways while the waterline moves straight up. On opposite-facing coasts in one region (coves, islands, pools) the lace would slide away from land during the uprush.",
   "evidence": "num.mjs: 'village swellDir [-0.5466, 0.8374]'; FRAG_SHORE line 407",
   "fix": "Use the local shore normal: the d-field gradient from 2 extra field fetches (high only), or pack the normal into a second small field texture. Fall back to uSwDir in LOW."
  },
  {
   "severity": "low",
   "area": "integration doc §6.5 (settings row)",
   "problem": "The new '물결 품질' row at cy+150 (76 px tall, so it reaches cy+188) overlaps the reset/reload buttons moved to cy+220 (80 px tall, so they start at cy+180) by 8 px. It has no icon, while the other rows have one. The v4 agent added Settings.daynight, so a second row is likely to land in the same slot.",
   "evidence": "src/scenes/UI.js lines 706-728; docs/build_reports/water.md §6.5",
   "fix": "Lay out the rows on a 96 px pitch (cy−170, −74, +22, +118), with buttons at cy+228 and the panel at 760. Add a wave icon to the row. Coordinate the row order with the v4 day/night row."
  },
  {
   "severity": "low",
   "area": "night lighting and audio phase",
   "problem": "(1) DayClock darkens the world with a MULTIPLY rectangle, but the water keeps its full daytime glints, sky reflection and subsurface tint, so sparkles stay bright at night. (2) The 6 s shore period matches audio5, but there is no phase alignment: water.t starts at Ground creation, update() clamps dt to 0.1 (drifts after hitches), and the ambience loop runs independently. Crest visuals and wash sounds will be randomly offset.",
   "evidence": "src/systems/DayClock.js header (MULTIPLY overlay); Water.update lines 1145-1149",
   "fix": "Add `water.setLighting({sun, sky, glint})`, driven by DayClock (glint ×0.25 and a cold sky at night, reflections of lamp glows optional). Add `water.syncPhase(audioSeekSeconds)`, or derive the shore phase from the ambience's playback position, so the crest arrival and sfx_wave_wash coincide."
  }
 ],
 "keep": [
  "Compositing with Phaser Extern objects: depth-sorted body at DEPTH.WATER and shore layer at GROUND+5, static meshes only over water cells, shared programs and textures, context-loss rebuild. World-locked camera-relative G coordinates: an integer-shift pan shows 0.000 mean pixel difference (pan_v12 in scratch).",
  "heightAt matches the shader height at high quality: mean 0.008–0.013 px, max 0.10 px in the village, beach and harbour (dbg/height_sync*.json, debug-shader readback). Keep this as a regression test.",
  "A real directional swell moving shoreward, not a scrolling texture: kymo_village.png shows diagonal bands travelling toward the coast. The 6 s shore period lines up with audio5.",
  "Tropical beach shallows: clear water over sand, moving caustics, the swash cycle (30% uprush, 150 G px run-up) and the drying wet band (b_z10_swash.png, b_z14_swash.png). The 'sand' surf on the village coast (v_sand_shore.png) shows the liveliness the snow bank needs.",
  "Fish under the surface (refracted, tinted, faded in shallows, glints weakened over them) in a single texture fetch. It looks good in-game at zoom 1.2 (igs_dock12_f20_top.png).",
  "LOW quality keeps the look with 2 fetches (v_high_vs_low.png, b_high_vs_low.png). With no WebGL the old sea and fish come back (check run: canvas fallback without errors).",
  "No per-frame allocations in _draw or update, preallocated uniform arrays, and a 2–3.5 µs heightAt plus slopeAt.",
  "The integrate.mjs approach: the patches are applied through route interception, so src/ is never written. Every anchor still matches the current Ground.js, Assets.js and Game.js (missing: {}). The liveShore switch keeps the baked shallows and foam for the fallback.",
  "check_water.py (seams, POT sizes, palette parity between JS and manifest, loop closure, allocation scan) and the deterministic lab clock W.frame(t)."
 ]
}
```

## Build

# water build report: living water (CONTRACT_V7 §V)

The sea now moves. Long swells roll toward the shore and break as foam. `src/systems/Water.js` is a standalone WebGL water module for Phaser 3.90 (GLSL ES 1.0, WebGL1-safe). It draws:

- **Swells:** long swells rolling toward the shore, plus a shore swell whose crests follow the coastline and bunch up as they reach shallow water.
- **Surface light:** two drifting ripple layers, a sky reflection that gets stronger at grazing angles (fresnel), and sun glints.
- **Depth:** colour runs from deep water to the shallows, and the sea bed and moving caustics show through.
- **Life in the water:** fish schools swim under the surface, and ripple rings spread from splashes, boat wakes and swimmers.
- **Foam by shore type:**
  - sand: lace runs up the beach and back, leaving a wet band that dries;
  - snow bank: slush;
  - rock and breakwater: slap and spray;
  - quay walls: a bright lapping line.

`assets/water/` holds the procedural textures and 12 FX sheets (1.76 MB in total). `tools/test/water_lab.*` renders three scenes with the real game sprites and a fixed test clock: the village coast, a harbour and a beach. It produces the GIFs and stills.

I also ran the integration from section 6 in the real game without changing any game file: a headless browser was served patched copies of `Ground.js`, `Assets.js` and `Game.js`, and it worked (section 6.8). `check_water.py` passes with 0 errors and 0 warnings, and the lab check reports 0 errors. With the Canvas renderer, the old sea comes back.

Nothing in the game imports `Water.js` yet. Section 6 gives the exact steps to wire it in.

## 1. Files (all new)

| path | what |
|---|---|
| `assets/water/` | 5 data textures, 12 FX sheets and `manifest.json` (§2 format: images, sprites, spritesheets, palettes, waterPx 30). **1.76 MB** in total, of which 0.54 MB is textures (limit 2.5 MB). |
| `src/systems/Water.js` | the module: `Water`, `WaterMask`, `SWELL`, `SHORE_TYPES`, `DEFAULT_PALETTES`, `WATER_PX` |
| `tools/fx/gen_water.py` | textures, manifest and `docs/previews/water_textures.png`; reruns give byte-identical files |
| `tools/fx/gen_water_fx.py` | FX sheets (added to the manifest), `water_fx_sheet.png` and `water_fx_*.gif` |
| `tools/fx/check_water.py` | validator: seams, power-of-two sizes, normals, that the LUT, palettes and `Water.js` agree, sheet grids, loop closure, and no allocations in `Water._draw` |
| `tools/test/water_lab.html`, `water_lab.mjs` | lab page and Playwright runner (`still`, `seq`, `gifs`, `beforeafter`, `perf`, `check`, `ingame`) |
| `tools/test/water_lab/lab.js`, `assets.js`, `land.js`, `compose.py` | lab scenes, asset loader, land baker (a copy of Ground's shoreline bake), image composer (Hangul-capable labels) |
| `tools/test/water_lab/integrate.mjs` | **the integration of section 6 as exact text patches**, used by `water_lab.mjs ingame` |
| `docs/previews/water_*` | GIFs, stills, before/after, in-game proof, textures, FX sheets |

## 2. Previews

| file | shows |
|---|---|
| `water_before_after.png` | the village coast today (scrolling `water_sea` tileSprite, baked shallow band, foam strip) next to the new water; same framing, t = 4 s |
| `water_village.gif` / `.png` | snow-bank coast and dock pier, with: a moored rowboat; a fishing boat leaving a V wake and ripple rings; an ice chunk and small boats bobbing on the swell; a fishing line plopping in; fish under the surface. 72 frames, 15 fps, 4.8 s |
| `water_harbor.gif` / `.png` | `harbor` palette, with: quay walls with the lapping line; a breakwater taking slap and spray (`fx_wave_crash` timed to the swell crests); a moored tugboat and sailboat; a buoy; a rowboat crossing with a wake |
| `water_beach.gif` / `.png` | `tropical` palette over `ground_sand` from `assets/beach`, with: turquoise shallows with caustics; foam lace running up the sand and back; the wet band drying; swimmers with `fx_swim_ripple` and rings; a cannonball (`fx_splash_big`); an offshore breakwater with spray. 90 frames, 6 s |
| `water_ingame.png` | **the real game** with the section 6 patches, side by side: today, Water high, Water low (물결 품질: 간단), zoom 0.6, zoom 1.2 |
| `water_textures.png` | every texture tiled 2 × 2 (a seam would cross the centre), the LUT rows and the shore ramps |
| `water_fx_sheet.png`, `water_fx_*.gif` | every FX sheet on snow, sand and deep sea |

The GIFs are phone crops 352 or 390 px wide at about zoom 1.0, each under 5.6 MB. The stills are 780 × 1688, which is a 390 × 844 phone at DPR 2.

## 3. Textures (`assets/water`, `tools/fx/gen_water.py`)

All textures are sampled in **G space**: G = (screen x, 2 · screen y) in world px. That is the iso ground plane seen from above (64 G px = 1 m), so every texture and every wave is foreshortened 2:1, like the ground.

The data textures are plain RGB with alpha 255. They are uploaded unpremultiplied, without colour-space conversion, with REPEAT and mipmaps. They are seamless, checked on 2 × 2 tilings.

| key | size | content |
|---|---|---|
| `water_waves_a` | 512² | R,G = ripple normal from a periodic FFT ocean height field (JONSWAP spectrum, peak 1.4 m, 8 m tile = 512 G px); B = caustics from the same field |
| `water_waves_b` | 256² | the fine layer: peak 0.5 m, 3 m tile, sampled every 192 G px; B = fine caustics |
| `water_foam` | 256² | R = foam lace potential (equalised, so threshold t covers about 1 − t of the area), G = bubbles and slush bits, B = low-frequency variation |
| `water_lut` | 256 × 8 RGBA | one row per palette: RGB = colour, A = opacity over the sea bed, u = 1 − exp(−depth / depthScale). Row 0 `winter_sea` (deep navy → cold teal), row 1 `harbor` (greener, murkier), row 2 `tropical` (deep emerald blue → turquoise → clear over sand), row 3 `pool`. Rows 4–7 are free for custom palettes. |
| `water_shore_ramp` | 256 × 4 | wet/dry ramps (dry → damp → wet → submerged) for sand, snow bank, rock and quay. Shipped for bakes such as the beach ground; the shader takes its wet colour from the palette (`wet`, `film`). |

The palettes live in the manifest and in `DEFAULT_PALETTES` in `Water.js`, and `check_water.py` checks that the two match.

## 4. `src/systems/Water.js`

### 4.1 How it composites: two Phaser `Extern` game objects, each with its own GL program

A Shader game object would draw a full quad over the whole region, and a custom pipeline would have to be wired into Phaser's batching. `Extern` (`scene.add.extern()`) is the simplest mechanism that composites correctly:

- **Depth sorting.** When the display list reaches an `Extern`, Phaser flushes the current batch (`pipelines.clear()`), calls our `render(renderer, camera, calcMatrix)`, then restores its own GL state (`pipelines.rebind()`). The water therefore sorts by **depth** like any other object:
  - the body sits at `DEPTH.WATER` (−20000), under everything;
  - the shore layer sits at `DEPTH.GROUND + 5`, above the baked land tiles and below floors and sprites.
- **Camera and screen density.** `calcMatrix` already contains the camera scroll and zoom. Phaser's projection matrix covers the real canvas (View.k × the logical size), so devicePixelRatio is handled too. The lab proves zoom 0.6–1.2 at DPR 1 and 2. The in-game run proves the game's own camera (View.k 1.08, zoom 0.6 / 1.0 / 1.2).
- **No wasted pixels.** The meshes are static and cover only cells that hold water (body: 64 × 32 px blocks) or a soft shore (shore: 32 × 16 px blocks). No pixel is shaded over inland snow.
- **Precision.** G coordinates are passed relative to the camera centre, and every phase and offset is wrapped on the CPU. The interpolated values stay small, so `mediump` is safe.
- **Sharing and context loss.** Programs and textures are shared per renderer, so several Water regions cost one upload. Water listens for `losewebgl` / `restorewebgl` and rebuilds after a context loss.

### 4.2 The surface (body pass)

- **Directional swell.** Four Gerstner-like sine waves (`SWELL.waves`):
  - wavelengths 460 / 300 / 196 / 124 G px, amplitudes 3.0 / 1.8 / 1.0 / 0.5 px;
  - rotated 0 / +23 / −34 / +61° from the swell direction;
  - deep-water dispersion ω = √(g k), slowed by `timeScale` 0.42 to keep the toy scale calm.

  The swell direction comes from the field (toward the shore) or from `opts.swellDir`. Near land the swell drops to 45 % of its size.
- **Shore swell.** Its phase is k · ψ(distance to the coast) + ωt, so the crests run parallel to the coast; ψ bunches them together as they reach shallow water.
  - The period is 6 s (`SWELL.shore.period`), the same grid `amb_sea_waves` / `amb_beach` were re-rendered on.
  - Phase and amplitude vary slowly along the coast (ν, a(v)), so it never reads as stripes.
  - Each crest gets a glassy subsurface line, and small whitecaps break along it.
- **Ripples.** Two FFT normal layers, rotated 17° and −31° and scrolling in different directions, so no tiling repetition shows.
- **Light.** The swell normal is drawn 6× steeper than the surface actually moves, so the rolling bands read on a phone. On top of that: a lambert term, fresnel sky reflection (sky gradient from the palette), sun glints (sharper when zoomed in), and a subsurface tint on the crests.
- **Depth.** The shore distance and shore type give a depth (gentle for sand, steep for quay walls). The depth picks the LUT colour and its opacity over the sea bed. In shallow water the bed shows the moving caustics (waves_a.B × waves_b.B).
- **Fish under the surface (high quality).**
  - The `fish_school` texture is sampled in the same two bands as the old tileSprites: y 40–240, α 0.55, 22 px/s; and y 150–350, α 0.35, scale 0.8, 14 px/s. Both bands cost **one fetch**.
  - The fish are refracted by the surface slope, tinted toward the water colour above them, and faded out in very shallow water.
  - They are composited **before** the sky reflection and glints, and those are weakened over them (reflection × (1 − 0.7 α), glint × (1 − 0.6 α)). So they read as silhouettes under the water, not stickers on top.
  - At low quality and in the Canvas fallback, Ground keeps the old fish tileSprites at `DEPTH.FISH`, over the water.
- **Ripple rings.** A ring buffer of 12 (`ripple()`), spreading at 110 G px/s and fading out over 4 s. Rings change the height, slope and foam.
- **Hard-shore foam.**
  - Rock and breakwater: a slap collar that bursts when a shore-swell crest arrives.
  - Quay: a thin bright lapping line plus a faint pattern of reflected waves.
  - Whitecaps appear on big crests.

### 4.3 The soft shore (shore pass, premultiplied alpha over the land)

- **Surf zone.** A breaking crest line and the foam it leaves behind, plus a foam collar along the waterline.
- **Swash (sand).**
  - Foam lace rides up the beach on the 6 s cycle; the uprush takes 30 % of the cycle.
  - The run-up reaches up to 150 G px (about 2.3 m) and varies along the coast. Then the water recedes.
  - The water sheet carries a glint.
  - It leaves a **darker wet band** that dries over 2.6 s, with a short-lived gloss.
- **Snow bank.** A short run-up (16 %), little foam, and **slush**: ice bits bobbing in a narrow band at the waterline.

### 4.4 Shoreline field (built once in JS)

1. The mask is evaluated as 2 × 2 samples per **8 × 4 world-px cell** (8 × 8 G px). Land drawn as a wall over the water is tested `waterPx` lower.
2. A signed distance field is built with 8SSEDT (two passes) plus a small blur. Boundary cells get a sub-cell shoreline from their coverage.
3. A second distance field measures only to the coasts that make waves. The swell rolls past breakwaters and quays and slaps against them, so the crest lines stay round.
4. Each cell copies the run-up and edge kind of its nearest shore cell, blurred.
5. Everything is packed into one RGBA8 texture: R = distance and G = wave distance (both sqrt-encoded over ±768 G px), B = run-up, A = edge kind.

Cost and accuracy:

- **Lab regions:** about 60–150 k cells, built in 0.15–0.4 s of CPU.
- **The whole village sea** (6144 × 2708 px ≈ 520 k cells) is built on 2 × 2 coarser cells and upsampled.
  - This happens automatically above 300 k cells; `opts.fieldScale` overrides it, and `info().fieldScale` reports it.
  - It costs **0.09–0.18 s of CPU instead of 0.18–0.49 s** for the fine field, or 0.39 s for the very first build in a fresh process (JIT cold).
- **Coarse vs fine field:** mean error 1.9 G px within 48 G px of the shore, maximum 8 G px. `heightAt` differs by at most 0.34 px.
- **Optimisation:** inline 8SSEDT, a blur without clamping in the interior, and one evaluation of the shoreline curve per column. For regions up to 300 k cells the output is byte-identical to the first version, so the lab previews are still accurate.

### 4.5 Shore types (`SHORE_TYPES`)

| type | run-up | edge | makes the shore swell | look |
|---|---|---|---|---|
| `sand` | 1.0 | 0 | yes | surf lines, swash lace up the beach and back, wet band that dries |
| `snowbank` | 0.16 | 0 | yes | small foam and slush at the waterline (the village coast; default) |
| `rock` | 0 | 1 | yes | slap collar and spray events |
| `breakwater` | 0 | 1 | no (waves pass and slap) | slap collar and spray events |
| `quay` | 0 | 0.5 | no | deep right at the wall, bright lapping line |

Shore types are given per segment as `shoreTypes: 'sand'`, as `fn(x, y)`, or as `[{type, rect | poly | x: [x0, x1]}]`. `defaultShore` covers the rest.

For rock and breakwater, `crashEvents(t0, t1, fn)` returns the crest arrivals (x, y, strength, t). They use the same phase as the shader's slap burst, and only the bigger waves of a set qualify. `update()` plays `fx_wave_crash` at them (a pool of 6, on screen only), or calls `opts.onCrash` if one is given.

### 4.6 Quality, fallback, budget

| | body fetches / px | shore fetches / px | what is dropped |
|---|---|---|---|
| `high` | 6 (field, ripple A, ripple B, foam, LUT, fish) | 3 | nothing |
| `low` | **2** (field, ripple A) | **2** | ripple B, caustics, foam texture (lace comes from ripple A), LUT (3 colour stops instead), fish in the shader (Ground keeps the tileSprites), 2 of the 4 swells, 8 of the 12 rings |
| Canvas renderer or failed compile | n/a | n/a | the old scrolling `water_sea` tileSprite (`water.fallback`) and the fish tileSprites |

- **GPU memory.** 4.36 MB for the whole village sea: the shared textures with mipmaps, the fish texture, and a 768 × 677 field. Lab regions use about 2.7–2.9 MB. Phaser also keeps its own upload of each loaded image, about 1.3 MB.
- **No per-frame allocations.** Every uniform lives in preallocated typed arrays, and `check_water.py` scans `_draw` for allocations.

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

`heightAt` and `slopeAt` add up exactly what the shader adds up: the 4 swells with the same coast weighting, the shore swell with its variation along the coast, and the rings. So boats, buoys, ice chunks and swimmers ride the same crests the player sees.

## 5. FX spritesheets (`assets/water`, conventions of `assets/fx`)

All sheets are NORMAL-blend toy water: a white to ice-blue body, bevel light from the upper left, and a thin sea-blue rim so they read on snow, sand and deep sea. They work with or without the shader.

| key | frame | frames · fps · repeat | anchor | use |
|---|---|---|---|---|
| `fx_wave_crash` | 192² | 10 · 20 · once | 0.5, 0.80 | spray burst on rock or breakwater (Water plays it at `crashEvents`) |
| `fx_splash_small` | 96² | 10 · 24 · once | 0.5, 0.72 | fish jump, pebble, line plop, swimmer kick |
| `fx_splash_big` | 192² | 14 · 24 · once | 0.5, 0.80 | dive, cannonball, crate overboard |
| `fx_swim_ripple` | 128 × 64 | 12 · 12 · loop | 0.5, 0.5 | rings and a lacy collar around a swimmer, drawn under the swimmer (depth − 1); clear centre 32 × 14 px |
| `fx_wake_v2` (+ `_s`, `_e`, `_ne`, `_n`) | 256 × 176 | 8 · 12 · loop | 0.5, 0.5 | boat wake V, one sheet per rendered heading (SE, S, E, NE, N; flipX for SW / W / NW). Anchor = hull centre at the waterline; scale 1.15 for the rowboat, 2.0 for the fishing boat |
| `fx_sparkle_water` | 128 × 64 | 12 · 12 · loop | 0.5, 0.5 | twinkling glints (low quality, Canvas, or calm water) |
| `fx_shore_wave_x` / `_y` | 384 × 256 | 16 · 6 · loop | 0.5, 0.55 | rolling breaking-wave strip for sand beaches drawn **without** the shader. Chain one every (+256, +128) px (`_x`, sea up-right) or (+256, −128) px (`_y`, sea up-left); seamless along the coast |

## 6. Integration: exact steps

Sections 6.1–6.3 are exactly the patches in `tools/test/water_lab/integrate.mjs`. They were applied to the current files and run in the real game (6.8). Sections 6.4–6.7 build on them and are proven in the lab scenes, not in the game.

### 6.1 `src/core/Assets.js`: load the fragment (FX sheets after the title)

```js
export const FRAGMENTS = [/* …, */ 'workers', 'pets2', 'water'];
const LAZY_KEY = /^fx_(build_dust|build_done|wake|wake_ring|fire_big|wave_crash|splash_small|splash_big|swim_ripple|wake_v2(_[a-z]+)?|sparkle_water|shore_wave_[xy])$/;
```

The textures (0.54 MB) load with the first screen, and the FX sheets load after the title. Water checks `textures.exists` before it plays anything, so a missing sheet does no harm.

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

In the constructor, replace the block from `// --- sea (live, scrolling)` through `this.t = 0;` (the sea tileSprite and the two fish tileSprites) with:

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

In `update(dt)`, replace the two `this.sea.tilePosition…` lines with `this.water.update(dt);`. Water scrolls the fallback tileSprite itself. The fish lines stay as they are; they only run while the tileSprites exist.

The rest of the shore code needs no changes: `shoreY` is the mask, and Water registers its own `destroy()` on scene shutdown.

### 6.3 `src/scenes/Game.js`: things in the sea bob with the swell

In `buildDecor()`, the boats and ice chunks in the sea join a floater list instead of getting their sine tween. The tween stays for the fallback.

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

### 6.4 `src/entities/Boathouse.js`: the boats ride the swell and leave rings and a V wake

This is not run in the game because it needs the v3 progression. The same calls drive the lab boats.

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

- `src/core/Save.js` → `Settings`: add `water: 'high'` to `data`, and in `load()` add `this.data.water = s.water === 'low' ? 'low' : 'high';`.
- `src/data/strings.js`:
  - ko: `waterQuality: '물결 품질', qualityHigh: '고급', qualityLow: '간단'`
  - en: `waterQuality: 'Water', qualityHigh: 'High', qualityLow: 'Low'`
- `src/scenes/UI.js` → `buildPanelContent()`: add a row under the language row.
  - Grow the panel by 100 px (`openSettings`: `panel(…, 560, 740)`).
  - Move the title, version and close icon up 50 px, and the reset/reload/close buttons down 50 px.

  ```js
  const wq = S.water === 'low' ? 'low' : 'high';
  row(cy + 150, t('waterQuality'), wq === 'high' ? t('qualityHigh') : t('qualityLow'), wq === 'high' ? 'green' : 'gray', () => {
    S.water = wq === 'high' ? 'low' : 'high'; Settings.save();
    if (this.gs.ground && this.gs.ground.setWaterQuality) this.gs.ground.setWaterQuality(S.water);
    this.buildPanelContent(false);
  });
  ```

- Auto quality: wherever the game already drops `View.forceK` for a weak GPU, also call `ground.setWaterQuality('low')` and save it. Low keeps the look (swell, glints, shore foam) with only 2 fetches.

### 6.6 Harbour, beach, hotel pool

Any number of Water regions can run at once, and they share programs and textures. These are the configurations of the lab's harbour and beach scenes:

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

- **Orientation.** In `docs/build_reports/beach.md` the beach faces the sea on −Y (screen down-left). Water does not depend on orientation, because the swell direction comes from the field.
- **Floating props.** Put every water-plane prop (`swim_buoy_line_*`, `float_raft`, boats, `buoy`) at its sea point. Every frame, move it to `y - water.heightAt(x, y)` and tilt it by `slopeAt`, like the floaters in 6.3.
- **Swimmers** (beachfolk `swim`): draw `fx_swim_ripple` under them at the waterline, bob them with `heightAt`, and call `water.ripple(x, y, 0.55)` about once a second.
- **Splashes:** `fx_splash_small` / `fx_splash_big` plus `water.ripple(x, y, 1.3 … 1.8)`.
- **Sound.** The shore swell has a 6 s period.
  - On rocks and breakwaters, `crashEvents()` gives the exact crest times for `sfx_wave_crash_1..3`.
  - On sand, `water.swashPhase(x, y)` wraps from about 1 back to 0 when a crest reaches the waterline at that point. That is the moment to play `sfx_wave_wash`.

### 6.7 Depth order (`DepthSort.DEPTH`)

| layer | depth |
|---|---|
| water body | `DEPTH.WATER` (−20000) |
| old fish tileSprites (low / fallback only) | `DEPTH.FISH` |
| baked land tiles | `DEPTH.GROUND` |
| water shore layer (swash, wet band, slush) | `DEPTH.GROUND + 5` |
| floors, decals, pads, sprites | unchanged |

`DEPTH.WAVES` is no longer used and is free.

### 6.8 Proof in the real game (`node tools/test/water_lab.mjs ingame`)

`water_lab.mjs ingame` boots the real game (`index.html`, fresh save, 390 × 844 at DPR 2):

1. Playwright route interception serves the patched `Assets.js`, `Ground.js` and `Game.js` from `integrate.mjs`. The files in `src/` are never written.
2. The run taps through the title and points the game's camera hook at the dock.
3. It takes one fixed frame: the game loop is paused and the water clock is set before the final step.
4. The same run is repeated without patches as a baseline, and the composite goes to `docs/previews/water_ingame.png`.

Findings:

- **All patch anchors were found in the current files.** If someone edits these files later, the run names any anchor that is missing.
- The WebGL path is active. `drawsFish` is true at high quality (the fish tileSprites are destroyed) and false at low (the tileSprites come back).
- 8 decor floaters (boats and ice chunks) ride the swell.
- No errors. The first run logged one unrelated warning from work in progress elsewhere (missing `site_plot_XL`); the second run logged nothing.

Results (`ingame.json`, two full runs; the second run is the one in `water_ingame.png`):

| run | sea | fish | floaters on the swell | fetches / px (body, shore) | GPU texture memory | field build in the page | whole game frame, run 1 / run 2 |
|---|---|---|---|---|---|---|---|
| today, zoom 1.0 | tileSprite | tileSprites | 0 (sine tweens) | 1 / n/a | n/a | n/a | 927 / 1522 ms |
| Water high, zoom 1.0 | shader | under the surface | 8 | 6, 3 | 4.36 MB | 2.8 s | 1651 / 1318 ms |
| Water high, zoom 0.6 | shader | under the surface | 8 | 6, 3 | 4.36 MB | 2.4 s | 1041 / 1504 ms |
| Water high, zoom 1.2 | shader | under the surface | 8 | 6, 3 | 4.36 MB | 3.0 s | 1693 / 1604 ms |
| Water low, zoom 1.0 | shader | tileSprites again | 8 | 2, 2 | 4.36 MB | 1.6 s | 1461 / 975 ms |

- **Frame times are noise here.** They swing by ±50 % between the two runs and between neighbouring rows. The cause is the shared machine (SwiftShader on 4 cores at load average 30–37, with Blender renders running), not the water. The table only shows that the game still runs with the water in it; section 7 measures the sea's own cost properly.
- **Field build.** The whole village sea (768 × 677 cells; 519,936 is over the 300,000 limit) is automatically built 2 × coarser, and `info().fieldScale` is 2. In node on the same machine, the first build in a fresh process (JIT still cold) takes 0.36 s wall and 0.39 s CPU. The 1.6–3.0 s in the page is the same work on a CPU that 30+ other threads were competing for.

## 7. Performance

All measurements use SwiftShader (CPU WebGL) on a 4-core machine shared with several Blender renders, at a load average of about 25–33. Read them as **relative** costs. `perf` alternates the variants over 5 rounds and reports medians.

**Cost of drawing the sea itself** (`water_lab.mjs perf`): the frame time with the sea minus the same frame with the sea hidden. Canvas 780 × 1688 (390 × 844 at DPR 2), zoom 1.0.

| scene | old tileSprite | Water low | Water high |
|---|---|---|---|
| village coast | 117 ms (1×) | 654 ms (5.6×) | 846 ms (7.2×) |
| beach (including the sand shore band) | 198 ms (1×) | 455 ms (2.3×) | 744 ms (3.8×) |

Texture fetches per pixel, body and shore: old tileSprite 1 (no shore pass), Water low 2 and 2, Water high 6 and 3.

**Whole game frame** (`ingame`, the real game, game.step + readPixels): see the table in 6.8.

Phone estimate:

- SwiftShader runs the shader arithmetic on the CPU, so its ratios overstate arithmetic relative to texture bandwidth compared with a phone GPU. The old sea is one fetch with almost no arithmetic, which also makes the ratio look large.
- The high body shader is about 330 scalar ALU operations plus about 20 transcendentals, with 6 fetches per pixel. Low is about 200 operations with 2 fetches.
- On a 1170 × 2530 phone canvas (View.k 1.6, max 2) with the sea covering about half the screen, that is about 1.5 M px × 400 ops ≈ 0.6 G ops per frame. At 60 fps that is roughly 10–15 % of a mid-range GPU (Adreno 6xx / Apple A-series). **'high' is fine on a mid phone.**
- On low-end Mali-G52-class GPUs, 'high' would take about half the frame. Use 'low' there (2 fetches, no caustics, no fish in the shader), either through the auto-drop in 6.5 or by letting the player choose with 물결 품질.

Other costs:

- **Draw calls:** 2 per Water region, plus one batch break each (Extern flushes Phaser's batch). They replace the 3 tileSprites.
- **CPU per frame:** about 40 uniform uploads and no allocations. `heightAt` + `slopeAt` cost about 2 µs per floater (node, 8 live rings).
- **Load:** the field for the whole village sea costs 0.09–0.18 s of CPU once the JIT is warm, and 0.39 s for the very first build in a fresh process (2.1 GHz Xeon, node). Lab-size regions cost 0.1–0.4 s.
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

The lab scenes use the real textures and sprites:

- village: `ground_snow`, `dock_pier`, `boat_small`, `ice_chunk`, the rowboat and fishing boat, villagers and the fisherman;
- harbour: quay, pier and breakwater tiles, tugboat, sailboat, buoy;
- beach: `ground_sand`, and the parasols, loungers and lifeguard tower from `assets/beach` when present.

Time comes only from `window.__W.frame(t)`.

## 9. Notes and limits

- **Canvas renderer:** the old look (tileSprite sea and fish). The FX sheets work there too; for beaches without the shader, use `fx_shore_wave_*` and `fx_sparkle_water`.
- **Top of the village sea:** the region keeps the old sea rectangle, with its top at world y −200. At zoom 0.6 the game removes its camera bounds, so the background shows above −200, exactly as with the old tileSprite. Raise `region.y` if that view should show sea; it costs about 25 k more field cells per 100 px.
- **Changing coasts:** the field is built once. If the coast changes (a new quay, reclaimed land), destroy the region and build a new one. A region of about 150 k cells costs a few hundred ms of CPU.
- **`fx_shore_wave_*`** loop every 2.7 s and are meant for beaches drawn without the shader. The shader draws its own swash on the 6 s shore swell.
- **Calm by design:** the swell moves only about 3 px, and the shore swell about 2 px, at the toy scale; it reads mostly through light and foam. To make it livelier, raise `SWELL.normalBoost` or the palette's `swell` / `surf`, or pass `opts.swell`.

Relevant paths: /home/user/nurient/frost-village/docs/build_reports/water.md, /home/user/nurient/frost-village/src/systems/Water.js, /home/user/nurient/frost-village/assets/water/, /home/user/nurient/frost-village/tools/fx/gen_water.py, /home/user/nurient/frost-village/tools/fx/gen_water_fx.py, /home/user/nurient/frost-village/tools/fx/check_water.py, /home/user/nurient/frost-village/tools/test/water_lab.mjs, /home/user/nurient/frost-village/tools/test/water_lab.html, /home/user/nurient/frost-village/tools/test/water_lab/, /home/user/nurient/frost-village/docs/previews/water_before_after.png, /home/user/nurient/frost-village/docs/previews/water_ingame.png, /home/user/nurient/frost-village/docs/previews/water_village.gif, /home/user/nurient/frost-village/docs/previews/water_harbor.gif, /home/user/nurient/frost-village/docs/previews/water_beach.gif
