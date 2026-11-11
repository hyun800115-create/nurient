# v4.3 step B 「마을 새 단장 둘째 걸음」: TX map (texture and perf budget)

- **Date:** 2026-11-11.
- **Tree read:** `scratchpad/hud_wt/frost-village`, branch `local/v43-hud` (v4.3.0-a3.1; HEAD has 2 later commits that only touch `tools/test/flag.mjs` and the Play record). Read only. No game, browser or bot was run for this map.
- **Companion files in this folder:** `decisions.md` §10 (TX-1 … TX-9, adopted) and `map_scope.md` B15. This map adds the numbers behind those rows and the levers they do not cover. IDs here are **T-1 … T-8**, so they do not clash with `decisions.md`'s TX-n.
- **Decision rule:** every open question takes its ★ answer. A question with no ★ takes the safest default. Each one is recorded in §10.

---

## 0. Summary

1. **Headroom today is about 0–3 MiB.**
   - The hard gate is "full v4, GL total (textures + render targets) ≤ 455 MiB".
   - The latest run, a3 on 2026-11-11, peaked at **451.8 MiB** at the town square, +10 s. That is 3.2 MiB of room.
   - Runs of the same tree spread by about 3–4 MiB.
   - One 관망 case already failed at **455.2** on 2026-11-07. The a3 run was killed before it reached that case, so it is unmeasured on a3.
   - The committed `docs/build_reports/texbudget_v4.json` is stale (2026-10-09, v4-C1). §1 explains why.
2. **The a3 merge was roughly neutral, about −1 MiB at the peak.**
   - The bakery split repacked `props_buildings` from 11.03 to 7.47 MiB and added `bakery43` (1.30 MiB). Net −2.62 MiB.
   - The new code-drawn textures are small:
     - flag 0.06 MiB, plus up to 2.3 MiB only while the flag maker is open;
     - navigator end marker 0.21 MiB;
     - carry plate 0.09 MiB.
   - The forklift is +3.76 MiB, but only while the depot is open and only after it is bought.
3. **Step B adds about +2 to +4 MiB at the peak views without TX. That is over the gate.**
   - The stage-4 page is ≈ +2.0 MiB, or +0.8 if the stage-3 page is dropped.
   - The hall page is **2.12 MiB packed, not 15.4**. It adds +2.1 MiB in the village views. The station and town views already hold it.
   - The forklift adds +3.8 MiB in depot views.
   - Projection: town square ≈ 453.8, station ≈ 451.6, 관망 seated at the station ≈ 457. The ±2 MiB run spread comes on top.
4. **The peaks have two causes, and the adopted TX rows only fix the first.**
   - **(a) Steady overlap at the station, the track and the overview.** Every area is "near" there: village, east, town and depot. Area eviction of the core pages fixes this. It is `decisions.md` TX-2/TX-3 plus T-3 here.
   - **(b) Arrival transients.** The town square +10 s and plaza +5 s peaks happen because the area you left keeps its pages for the 10 s TTL while the new area's pages load.
     - Town square: +49 MiB over its steady level.
     - Plaza: +52 MiB.
     - Splitting or evicting more pages does not touch this. A **swap rule (T-2)** does: drop the far areas *before* loading the near ones when the total would cross a line.
5. **Recommended TX plan:** T-1 … T-5. Estimated effort is ≈ 1.55 builder-days against 1.25 planned. T-6 (effects on demand, +0.25 d) is a stretch item.

   | T | What | Saves at the worst views (source-sum MiB) | Kind |
   |---|---|---|---|
   | T-1 | Residency line counts render targets (GL-aware) | safety net; on full-HD phones it is what keeps ≤ 455 | code |
   | T-2 | Swap, don't stack: far areas (and RoadPaint's bake-only set) go *before* a near area loads | town square +10 s −45, plaza +5 s −34 | code |
   | T-3 | Core-district areas (= TX-2 `bld_buildings` split + TX-3 `props_buildings`, plus `deck43`, `bakery43`, `market_s*`), tight near/far | station / track / overview / 관망 −24.6; east dock −6.6 | code + 2 repacks |
   | T-4 | A shop stage drops the earlier stages' pages | −1.2 to −2.9 at stage 4 | code |
   | T-5 | Test scenario on the step-B layout + new views + fixes to `texbudget.mjs` | — | tests |
   | T-6 (stretch) | Rare effect sheets on demand (`fx_build_done`, `fx_levelup`, `fx_unlock`, `fx_fire_big`) | −7.9 in every steady view | code |

6. **Projected exit with T-1 … T-5 (estimate):** the worst full-v4 view is ≈ **430 MiB GL**. The worst measured-based view is ≈ 428 (관망 seated at the station). That meets the roadmap's ≤ 445 with about 15 MiB of margin before noise.
   - With T-6 the worst view is ≈ 422.
   - Village views (plaza ≈ 396 steady) keep about 13 MiB for v4.6's 한마당 events, which `기획서_광장과축제.md` budgets at ≤ 13 MiB.
7. **Step-B risks that no current doc lists:**
   - **눈꽃 큰길 drawn by RoadPaint.** It would pin RoadPaint's 13.05 MiB bake-only set in the village. Without that, it brings back the re-fetch loop the perf branch fixed. Paint the village part with the Ground road painter instead: `ground_road` is already resident, so the cost is 0 MiB (§4.3).
   - **The gate's viewport.** The gate is measured at 390×844×2 (render scale k 1.1, render targets 33.8 MiB). A 1080-wide phone on 고사양 runs at k 1.5 with ≈ 66 MiB of render targets, so the same village is ≈ +32 MiB GL. The perf audit measured **463 MiB** on its 46-min tour. T-1 makes Residency trim to the real render-target size.

---

## 1. Sources, and how the gate is measured

- **Tool:** `tools/test/texbudget.mjs` (fixed-step clock, default viewport `390x844x2`, default 그래픽 사양 = 자동 = 고사양 under the driver). It records two numbers:
  - Phaser's source-sum (`__FV.texStats`, Residency's own measure, `memScale`-aware);
  - the live GL bytes from a `texImage2D` / `texStorage2D` / `deleteTexture` wrapper.
- **Render targets (RT):** texImage2D calls with no pixels are counted apart. They are the renderer's screen-sized buffers plus DynamicTextures such as `fv_stackbake` (1024²) and `__fvg_*` bakes.
- **Must lines:**
  - new game ≤ 368;
  - v3.5 village complete ≤ 455;
  - full v4 any view ≤ 455;
  - full v4 GL total ≤ 455;
  - 관망 look-around GL ≤ 455;
  - 관망 seated far look-around GL ≤ 455;
  - RT ≤ 40;
  - GL vs source within 10 %.
- **Soft targets:** title 90, plaza 300, tour 300, return-to-start + 5. All are missed and stay missed in v4.3 (`decisions.md` TX-7).
- **"Over the must" rule:** `overFor(list, must) ≤ 2` with 5-s samples. In practice a single sample over the line fails.
- **Where the results are:**
  - `docs/build_reports/texbudget_v4.json` is **2026-10-09 (v4 build C1)**: full v4 GL 421.9, 12 checks. Nothing newer is committed.
  - The suite lane runner (`scratchpad/v43/a3/lane.sh`) runs `git checkout -- docs/build_reports` after every suite, so default-path results are thrown away.
  - Every v4.3 number lives in the scratchpad.

| Run (scratchpad `v43/…`) | Date | Tree | Full-v4 GL max | Notes |
|---|---|---|---|---|
| `m0/logs/texbudget.log` | 11-06 | v4.2.1 baseline `da1436f` | 448.8 | M0 baseline (`docs/build_reports/v43_baseline/report.md` §7) |
| `review/suites/logs/texbudget{,_run2,_run3,_run4}.log` | 11-06 | step A merged | 452.1 / 454.7 / 454.7 / 454.5 | same tree, 4 runs: spread 2.6 |
| `review/fix/logs/texbudget_c.log` | 11-06 | step-A fix variant | **455.3** | one variant over the must |
| `verify/final/texbudget2.log` | 11-07 | step A final | 452.7 | the roadmap's "2–3 MiB of room" |
| `watch/fix/suites11/texbudget.log` | 11-07 | 관망 pan fix | 454.4; 관망 seated **455.2 FAIL** | the only run with the seated case measured |
| `perf/presets2/texbudget_{mid,low}.log` | 11-07 | perf branch, early | mid 444.1, low 195.2 | mid's 0.75 pictures were not active yet (new game 207.8, same as high). Superseded by `perf_presets` below |
| `hotfix/suites{,3}/texbudget.log` | 11-09 | a2.1 | 453.6 / 453.0 | |
| **`a3/s1/texbudget_.log`** | **11-11** | **a3 (`ed04b7d`)** | **451.8** | 관망 tour 448.4. The browser was closed at the seated case (FATAL), so that case is not measured. JSON overwritten by the lane runner |
| `a3/s1/perf_presets_.log` | 11-11 | a3 | — | 46-min plaza source-sum: 고 337.9 / 중 213.7 / 저 146.1 MiB (k 1.5, canvas 1080×2399) |
| `perf/audit/measure.md` §3.6 | 11-07 | a2 | **463** (B 46-min tour, k 1.5) | a real 46-min village on a 1080×2400 viewport: RT 67 MiB |

**There is no a3.1 run yet.** a3.1 adds no pages; its only new texture is the carry plate, 0.09 MiB. `decisions.md` TX-8 asks for an a3.1 run as the TX baseline before any TX code lands.

---

## 2. Where a3 stands: per view

GL total = source-sum + ≈ 3.5–4.2 (GL-only text canvases) + RT 33.8.

| View (texbudget) | m0 (4.2.1) src / GL | step A final src / GL | **a3 src / GL** | a3 shape |
|---|---|---|---|---|
| new game | 200.7 / 240.4 | 207.6 / 247.4 | 206.3 / 246.2 | |
| v3.5 village complete | 322.7 / 360.7 | 334.4 / 372.5 | 328.4 / 366.6 | |
| full v4 plaza | 411.7 / 448.8 | 415.4 / 452.7 | 407.5 / 444.9 | **transient**: +5 s 407.5 → +30 s 355.0 |
| east dock | 377.8 / 414.9 | 392.3 / 429.9 | 387.7 / 425.3 | steady |
| our station | 402.9 / 440.2 | 413.6 / 451.3 | **411.9 / 449.6** | **steady**: +20 s still 406.6 |
| along the track | 406.8 / 444.1 | 413.5 / 451.2 | 407.3 / 444.9 | steady |
| town square | 407.0 / 444.7 | 397.9 / 435.8 | **413.8 / 451.8** | **transient**: +10 s 413.8 → +20 s 364.4 |
| town zoom 0.6 | 366.8 / 404.5 | 374.8 / 412.8 | 380.2 / 418.3 | |
| overview (rail strip + town) | 386.9 / 424.5 | 409.4 / 447.3 | 403.6 / 441.6 | steady |
| back at the plaza | 404.0 / 441.7 | 409.9 / 447.8 | 397.9 / 436.0 | transient (+5 s) |
| 관망 at our station | — | — | 409.6 / 448.4 | steady |
| 관망 at the depot spot (zoom 0.7; clamped at 3200, 2337) | — | — | 395.4 / 434.4 | |
| 관망 seated at the desk | — | — | 400.1 / 438.9 | |
| 관망 seated, camera at the station | — | (11-07) 416.7 / **455.2** | not reached | the case that failed |

### 2.1 What is resident at the peaks

**By class** (`watch/fix/suites11`, 11-07; a3 differs by about −2.6):

| View | atlas (raw) | page (packed, not on demand) | social (on demand) | ground pool | canvas | Σ |
|---|---|---|---|---|---|---|
| plaza steady (+30 s) | 189.1 | 129.9 | 13.5 | 16 | 2 | 350.6 |
| plaza +5 s (arrival) | 214.2 | 149.1 | 23.5 | 28 | 2 | 416.9 |
| our station +10 s | 214.2 | 149.1 | 17.1 | 28 | 2 | 410.5 |
| town square +10 s / +20 s | 214.2 / 169.8 | 149.1 | 11.6 / 4.5 | 28 | 2 | 405.1 / 353.5 |

How to read the deltas:

- **atlas 214.2 vs 182.9 = 31.4.** These are the `village` area pages: `bld_buildings` 10.73, `bld_buildings_2` 8.92, `boat_fishing` 7.77, `boat_rowboat` 3.94.
- **atlas 182.9 vs 169.8 = 13.1.** This matches RoadPaint's bake-only set byte for byte: `roads_decals` 5.70, 5 road tiles 1.00 each, `town_rails` 0.64, `train2_rails` 1.71 = 13.05.
  - It also toggles at the plaza (189.1 ↔ 202.2): that is the re-fetch loop of the pre-perf-fix tree.
  - At the town square the cause is likely the test itself. `RoadPaint.update` reads `cam.worldView` (`RoadPaint.js:192`), which the fixed-step stepper does not refresh between drawn frames. Residency uses the camera's follow target instead.
  - T-2 should give RoadPaint the same view source as Residency.
- **page 149.1 vs 129.9 = 19.2.** These are the `town` area pages: `town_civic@rest` 6.95, `@rest2` 3.25, `@hall` 2.12, `town_shops@a` 6.87. `town_park` 1.62 comes on top as a raw atlas.

**Full-v4 plaza by kind** (`review/fix/scratch/texdump_m.json`, step-A tree, 375.5 MiB):

| Kind | MiB | Notes |
|---|---|---|
| v3 character / worker raw atlases (`char_*`, `wkr_*`, pets) | 82.7 | v4.4's v3 atlas split target (≈ −40). Not v4.3 |
| villager `@core` pages (32) | 65.3 | |
| townsfolk loco / soc | 37.1 | |
| village buildings (`bld_*`, boats) | 35.4 | |
| ground / road / water raw | 22.2 | |
| fx sheets (21) | 20.3 | 7.9 of it is four rare one-shot sheets: T-6 |
| villager `@social` (5, the cap) | 20.9 | |
| trains (4 pages + rails) | 19.3 | resident at the plaza 2,000 px from the line: reserve lever R-3 |
| ground pool slots | 16.0 | the pool's cap is 28 |
| `props_buildings` | 11.0 → now 7.47 | not managed by any area |
| `deck43` / market / `bakery43` | 7.8 → now 6.6 | not managed by any area |
| other props / life, UI, `fv_*` canvases, rest | 30.0 | |

**What the station holds.** At our station (3420, 1640; zoom 1.2, view 600 × 1298 world px) every area is near:

| Area | Gap from the station view | Default near |
|---|---|---|
| `village` (rect to x 3000) | 120 px | 800 |
| `east` | in | 800 |
| `town` (from x 4150) | 430 px | 800 |
| `depot` (from y 2850) | 561 px | 800 |
| `sleigh` | in | 800 |

On top of that come the trains and every page no area manages. That is why the station is a steady peak, not a transient.

---

## 3. What the a3 merge added (a3 + a3.1)

| Item | Texture | MiB | When resident | Source |
|---|---|---|---|---|
| Bakery split: `props_buildings` repack | 1980×1460 → 1600×1224 | **−3.56** | always (boot page) | `scratchpad/v43/bakery/art_changes.md` |
| Bakery split: `vil_npc_aunt@core` | 1024×756 → 1024×664 | −0.36 | | |
| `bakery43` page | 1024×332 | **+1.30** | from the lumberjack hire. Lazy, but no area manages it, so it never leaves | `Game.lazyAllowed` (`Game.js:434`) |
| Village flags (`fv_flag`, shared canvas) | 124×136 | +0.06 | always | `src/flag/VillageFlags.js:21-27` |
| Hall flag patch (`fv_flag_hallpatch`) | ≈ 38×50 | +0.01 | with the hall | `VillageFlags.js:190` |
| Flag maker preview + option sheet (`fv_flag_big`, `fv_flag_ui`) | ≈ 712×453 + 1036×272 | ≤ +2.3 | **only while the maker is open** (new game, settings); removed on close | `FlagMaker.js:152, 253-255, 358-366` |
| Navigator end marker (`fv_nav_end`, `fv_nav_fx`) | 176×106 + 352×106 | +0.21 | once the navigator draws | `src/systems/goals/navTex.js` |
| Carry pill plate (`fv_carry_plate` / `_star` / `_tail`, at 2×) | 136×128 + 68² + 48×32 | +0.09 | with the carry pill (a3.1) | `src/systems/carry/CarryPill.js:31-35, 72-90` |
| Depot forklift `lgx_forklift` | 2036×484 | **+3.76** | on demand (`Residency.want`, noCap): only after it is bought and while the depot is open. Goes 30 s after nobody wants it | `src/entities/DepotForklift.js:43` |
| Goal, residents and HUD windows | text canvases only (GL-only) | ≈ +0.1 | while shown | the GL − source gap stayed 3.5–4.2 |

**Measured net:** step A final 452.7 → a3 451.8 at the GL peak. The arithmetic is −2.62 + ≈ 0.4 ± run noise. The peak moved from the plaza arrival to the town-square arrival; that is transient timing, not new memory.

---

## 4. What step B adds

### 4.1 Per feature (step-B scope from `engineering_plan.md` §3 / §4 and `decisions.md`)

| Step-B item | Texture effect | MiB | Views |
|---|---|---|---|
| Shop stage 4 (X-1: three counters, open roof) | new lazy page `market_s4`. Estimate 1.3–2.4 MiB; 2.0 is used below (s3 is 836×388 = 1.24). The old sled must ride on the s4 page (TX-5) | +2.0 if s3 stays; **+0.8** with T-4 | everywhere (no area manages market pages) |
| Hall at village complete (D2) | `Civic.needArt` loads the **packed `town_civic@hall` page only: 1024×544 = 2,228,224 B = 2.12 MiB** (`assets/_packed/index.json`), not the 15.35 MiB raw `town_civic.png` (2008×2004, used only with `__FV_NO_PACKED`). The `village` area keeps it once the hall stands (`Residency.js:36-44`) | +2.12 | village views. The station, track, town and overview already hold it through the `town` area. Mid-game rises ≈ 2–3 min earlier (village complete ≈ 20.5 vs east tower ≈ 23) |
| Ceremony at the hall (D3, rank_eup moved) | confetti / star / `fx_poof` (resident) and the crowd's social pages (capped at 5) | +0 steady; transient social within the cap | new view, est. GL 423–430 after TX |
| Station cash by train (X-5: hall pile) | none | 0 | |
| Office ≈ 16 side goal (X-7) | `office_bld@closed` 2.40 (area), `@inside` 2.74 and chief2 3.10 on demand: as today, ≈ 16 min instead of after the hall | inside the new-game window: est. +5–8 at ≈ 16 min (must 368) | Note: the `office` area rect (`Residency.js:51`) is still the pre-step-A spot (TX-6) |
| Fixed plots v2 (D6/D19 ★ A, Q25 ★, 광장 1 ★) | no new art. School / clinic / `w_civic` hidden, no sign; the 한마당 reserve is snow only | 0 | **This enables T-3**: every workshop now stands in the core district, for old saves too (R43 move table) |
| 눈꽃 큰길 (§4.5.2) | depends on the painter: see §4.3 | 0 or **+13.05** | village views |
| Labour plot hidden until v4.4 | none | 0 | |
| Migration card, P1 play log | DOM / text | ≈ 0 | |
| Depot (D20 ★ A: stays) | `lgx_center_a…d` 23.4, `lgx_items` 0.34 unchanged; forklift +3.76 when bought (a2.2) | +3.76 | depot views (scenario must buy it, T-5) |

### 4.2 Projection without TX (a3 numbers + step-B adds)

| View | a3 GL | + step B | Projected GL | vs 455 |
|---|---|---|---|---|
| town square +10 s | 451.8 | +2.0 | **453.8** | 1.2 left, then noise |
| our station | 449.6 | +2.0 | **451.6** | |
| 관망 seated at the station (11-07 455.2, minus bakery −2.6) | ≈ 452.6 | +2.0 | **≈ 454.6–457** | fails on a bad run |
| full v4 plaza +5 s | 444.9 | +2.0 +2.12 | 449.0 | |
| real depot view with the forklift (unmeasured) | ≈ station composition | +2.0 +3.76 | **≈ 455** | |
| east dock | 425.3 | +2.0 +2.12 | 429.4 | |
| along the track / overview | 444.9 / 441.6 | +2.0 | 446.9 / 443.6 | over the 445 exit |

**Verdict:** without TX, step B fails the 455 must on some runs and fails the roadmap's ≤ 445 exit on every run. The roadmap's order holds: TX lands before stage 4.

### 4.3 The 눈꽃 큰길 trap

`engineering_plan.md` §4.5.2 says "눈꽃 큰길 = a `RoadPaint` street `spine43` from the hall front → … → station cash box". That causes trouble either way:

- **RoadPaint's residency.** RoadPaint releases its bake-only set when the view is beyond `NEAR` (1300 px) of `streetRect` and `railRect` for 10 s (`RoadPaint.js:191-205`). The set is `BAKE_ONLY`: `road_dirt`, `_y`, `_cross`, `sidewalk`, `road_cobble_wide`, `roads_decals`, `town_rails`, `train2_rails` = **13.05 MiB**.
- **If the spine joins `streetRect`:** the village is always "near", and the 13.05 MiB never leaves. Every village view gains +13: plaza steady ≈ 371 → GL ≈ 409.
- **If the spine is a separate bake hook** (like `addV42Streets`, which `update()` does not watch): a village tile that needs `road_dirt` calls `want()` again after each release. That is the re-fetch loop the perf branch fixed (`perf/audit/measure.md` §0 (a): 11–21 % of the main thread in `texImage2D`).
- **Adopted (T-8, safest):** paint the village part of the 큰길 (hall front → east tower) with Ground's own village road painter. `Ground.drawRoads` (`Ground.js:644-690`) uses `ground_road`, which is already resident, so the cost is **0 MiB**. Hand over to RoadPaint only where the street meets RoadPaint's existing street / rail rects (coast road → station). If RoadPaint must draw a village segment, give it its own small set (the three `road_dirt*` tiles, 3 MiB) with its own near/far. Never pull `roads_decals`, `town_rails` or `train2_rails` (8.05 MiB) into the village.

---

## 5. Presets (`src/core/Perf.js`) and render targets

| Knob | 고사양 (high) | 중사양 (mid) | 저사양 (low) |
|---|---|---|---|
| render-scale cap `maxK` | 2 | 1.5 | 1 |
| `texScale` (big pages uploaded at this scale; UI, ground, water kept full) | 1 | 0.75 (56 % of bytes) | 0.5 (25 %) |
| Residency overrides (`tex`) | none (social 5, TTL 30, target 300) | social 3, TTL 18, target 280 | social 2, TTL 12, target 200, low 150 |
| area near / far (px) | 800 / 1200 | 700 / 1050 | 600 / 900 |
| ground pool | 28 slots (1 MiB each) | 28 | 20, half-resolution tiles |
| measured, 46-min plaza source-sum (a3 `perf_presets`) | 337.9 | 213.7 (−37 %) | 146.1 (−57 %) |
| measured, full v4 GL (texbudget `--gfx low`, 11-07) | — | — | 195.2 |

- **The gate is measured on 고사양** (자동 resolves to high under the test driver; `decisions.md` TX-1). The low preset's cut does not count toward TX.
- **Render targets scale with the canvas.** `k = clamp(cssW · dpr / 720, 1, maxK)` (`main.js:37`). RT ≈ 6.5 canvas-sized RGBA buffers, plus `fv_stackbake` (4 MiB) and small `__fvg_*` bakes.

  | Phone class (viewport) | k on high | Canvas | RT (MiB) | Same village as the a3 station peak, GL |
  |---|---|---|---|---|
  | texbudget default 390×844×2 | 1.1 | 792×1714 | **33.8** (measured) | 449.6 (measured) |
  | full HD 412×915×2.625 / 1080×2400 | 1.5 | 1080×2400 | **≈ 66** (67 measured, audit B) | **≈ 482** (est.) |
  | QHD 1440 px wide | 2.0 | 1440×3200 | **≈ 114** (est.) | ≈ 530 (est.) |

- **What that means.** The 455 must is "never above v3.5" measured at one small viewport (`v4_plan.md` §11.2). Phones with bigger screens on 고사양 are already over that line today: the audit measured **463 MiB** on its 46-min tour at k 1.5. 자동 sends phones under 4.5 GB RAM, weak GPUs and ≤ 4 cores to 중사양. That cuts both pictures (×0.56) and k (≤ 1.5), so those phones fit, but a 6–8 GB full-HD phone on 고사양 does not.
- **T-1** makes Residency trim to the real RT on every phone. **T-5** adds report-only runs at `--vp 412x915x2.625` (high and mid) so the gap is visible. **No preset change in v4.3** (TXD-4).

---

## 6. Residency today: what is managed and what is not

- **Area pages** (`REGIONS`, `Residency.js:30-54`): `town`, `east`, `village` (`bld_buildings`, `bld_buildings_2`, `boat_rowboat`, `boat_fishing` + hall / park extras), `bank42`, `office` (stale rect), `depot`, `sleigh`. They load within `near` and go after `townTtl` 10 s beyond `far` (×6 under the soft budget; 3 s in 관망). `makeRoom` drops far areas early only above `must − 30` = **425 source-sum**.
- **That 425 line is in source-sum MiB.** At the default viewport that is ≈ 463 GL, so the refusal / room logic never fires before the GL gate does.
- **On-demand pages** (`Residency.want`):
  - residents' `@social` pages, capped at 5 (high), TTL 30 s;
  - townsfolk `@soc` pages, town area only at zoom ≥ 0.9;
  - noCap pages: `office_bld@inside` 2.74, `ui5_icons@panels` 1.03, chief2 `char_player_b` 3.10, late-fragment extras (3.2 each), `lgx_forklift` 3.76.

  At the peaks the social class holds 12–23.5 MiB.
- **RoadPaint bake-only set** (13.05 MiB): its own 10-s far clock, beyond NEAR 1300.
- **Ground pool:** a fixed 28 × 1 MiB. Peaks always sit at 28.
- **Not managed (resident once loaded, everywhere):**
  - boot `props_buildings` 7.47, `deck43` 3.01, `deck43_ch` 1.78, `market_s1` 0.54;
  - lazy `bakery43` 1.30, `market_s2` / `s3` (and `s4`), `bld_sites` 3.90, `town_civic@station` 1.84;
  - train pages 17.6;
  - all fx sheets 20.3;
  - v3 character / worker raw atlases 82.7.
- **Boot pages and areas.** A boot-fragment page that an area evicts is **never fetched again**. `Assets.queueAssets` lazy pass requires `isLazy(k)` (`Assets.js:274, 478-480`), and boot fragments are not lazy. T-3 needs a one-line change for `props_buildings` and `deck43`.
- **`evictArea` does not check what is on screen.** It assumes nothing in a far area is visible. Any page made area-managed must have **no user outside its rect**. `props_buildings` breaks this today:
  - `mine_entrance` at se (2770, 1960);
  - `boat_small` at (2760, 560) and (−760, 262);
  - `campfire` at (2060, 790), (2440, 2620), (560, 2700) and (−260, 2350).

  See `world.js:446-512`, and T-3b.

---

## 7. The TX plan

### T-1. GL-aware Residency line (code, 0.15 d)

- **Change** (`Residency.js:91-97` `budget()`, `:148, :187, :208, :408, :484, :490`). Replace the literal `must − 30` with one `line()`:

  ```
  rtMiB  = Σ renderer render targets (w·h·4) — renderer.renderTargets, refreshed on resize
  line() = mustMiB − rtMiB − glExtra(5) − margin(10)       // source-sum MiB
  ```

  `fv_stackbake` and the `__fvg_*` bakes are counted in both the source-sum and the RT list. That double count errs on the safe side, by ≈ 4 MiB.
- **Line by phone:**

  | Phone | Line (source-sum) | Same as GL |
  |---|---|---|
  | default viewport | 455 − 33.8 − 15 ≈ **406** | 445 |
  | full HD, k 1.5 | ≈ 374 | 445 |
  | QHD, k 2 | ≈ 326 | 445 |

- **Effect.** Above the line, `makeRoom` drops far areas, then on-demand pages that are off screen and were unused for 1 s, LRU first, and refuses new ones. Residents then play their fallback anims.
  - At the default viewport after T-2/T-3, no view should cross the line (§8). T-1 is the safety net for unmeasured views: real depot, ceremony, busy 46-min villages.
  - On a full-HD phone the station after T-3 is ≈ 388 + 66 + 4 = 458 GL. T-1 trims ≈ 13 MiB of social pages and holds ≈ 445. **This is the only lever that keeps big-screen phones on 고사양 under 455.**
  - On QHD 고사양 the steady plaza (≈ 358) sits above the 326 line. Residency then refuses new social pages and evicts far areas at once. It degrades quietly but cannot reach 455. Recorded as TXD-4; measure in T-5.
- **Risk:** churn of social pages near the line. Keep the existing `evictLRU(…, 1000)` minimum age, and refuse rather than evict pages wanted by something on screen.

### T-2. Swap, don't stack (code, 0.25 d)

- **Change** (`Residency.regionTick`, `:370-414`). When `back` (an area coming near) is non-empty and `total + need > line() − 15`, evict now every area whose gap is beyond its `far`, farthest first, without waiting for `farT ≥ ttl`.
  - Pages a near area also lists are never dropped (as `makeRoom` does). Nothing is dropped while `camFocus` is set.
- **RoadPaint.** Hook its bake-only set into the same rule: `gs.v4.paint.releaseIfFar()` = `release()` when the view is beyond `NEAR` of both rects, ignoring `farT`.
- **Under the line** nothing changes: short trips keep the TTL and the ×6 grace, so no extra uploads.
- **Effect (source-sum):**

  | Transient | Swapped out | MiB |
  |---|---|---|
  | town square +10 s | the `village` area 20.6 (with T-3: + core pages 24.6) | −45.2 |
  | plaza +5 s / back at the plaza +5 s | `town` pages 19.2 + `town_park` 1.62 + RoadPaint 13.05 | −33.9 |
  | 관망 → town square | as the town square | −45 |
  | station arrival from the east dock | core pages (T-3) | −24.6 |

- **Why it is required.** `decisions.md` TX-2/TX-3 alone leave the town square +10 s at ≈ 414.6 source = **452.6 GL** and the plaza +5 s at ≈ 448. Both are above the 445 exit, because the pages they make evictable still wait out their 10-s TTL at the moment of the peak.

### T-3. Core-district areas (= `decisions.md` TX-2 + TX-3, completed) (code 0.35 d + repacks 0.3 d)

Step B pins the four workshops to the core district for every village (D6, D19 ★ A, R43 move table). The plot-table-v2 candidates (`decisions.md` X-2/X-3) are:

| Plot | Position |
|---|---|
| `d_wh` | (380, 1560) |
| `d_tool` | ≈ (60–120, 1580) |
| `d_cannery` | ≈ (1600, 580) |
| `d_store` | ≈ (1700, 1030) |

The stations, hut / office, hall (180, 760), deck, shop, bakery and the 한마당 reserve are all in the same district. Everything a core page shows therefore lies within x ≈ −150 … 1,900 and y ≈ 150 … 2,600.

| Sub-step | What | MiB |
|---|---|---|
| T-3a (TX-2) | **Split `bld_buildings`** (10.73) into two district pages:<br>• `bld_work`: warehouse + toolsmith frames 5.91 → page ≈ 6.6;<br>• `bld_east`: cannery + store + front 3.64 → page ≈ 4.1.<br>Each gets its own area; remove `bld_buildings` from the `village` list | same total |
| T-3b (TX-3) | **Move `props_buildings`' outside users** (mine_entrance, boat_small, campfire: 0.45 MiB of frames) onto `props_decor` (1376×336 = 1.76 → ≈ 2.2; boot). The re-packed `props_buildings` then has only core users: ≈ 6.7–7.5 MiB, 7.0 used below. Add it to a `core` area | +0.45 always |
| T-3c | `core` area: `props_buildings`, `deck43` (3.01), `bakery43` (1.30), `market_s1…s4` (the current stage), and the hall page as core `extra` when the hall stands. **`deck43_ch` stays unmanaged in v4.3** (1.78): it holds `extends` character anims (the chief's reel, the seated fishers). The anim re-make after an area round trip is unproven for a boot fragment | |
| T-3d | Rects from the live users: the bounding box of the display objects showing each page, + 64 px, recomputed on `built` / load. The static fallbacks are the district boxes above | |
| T-3e | Tight hysteresis for these areas: near/far × 0.65 of the preset (high 520 / 780; mid 455 / 680; low 390 / 585). The walk from the station or the east dock into the core is ≥ 500 px, ≈ 2 s at the chief's speed. 관망 already accepts brief stand-ins (`LOOK_TTL`) | |
| T-3f | Boot pages come back: `Assets.isLazy(k) \|\| Residency.areaPage(k)` (`Assets.js:274`), so a held `props_buildings` / `deck43` is queued again | |
| T-3g | Re-anchor the `office` rect on the hut / office (600, 640) (`decisions.md` TX-6) | ≈ 0 |

**Evictable at a far view:** `bld_work` 6.6 + `bld_east` 4.1 + `props_buildings` 7.0 + `deck43` 3.01 + `bakery43` 1.30 + `market_s4` 2.0 + `market_s1` 0.54 = **24.6 MiB**. That becomes 26.4 if `deck43_ch` is proven safe.

| View | Core gap (est.) | Saves |
|---|---|---|
| our station (view x ≥ 3120) | ≈ 1,250 | −24.6 |
| along the track | ≈ 1,700 | −24.6 |
| overview of rail + town (view x ≈ 2950) | ≈ 1,050 | −24.6 |
| real depot view, zoom 1.2 (x ≈ 2900) | ≈ 1,000 | −24.6 |
| 관망 depot spot, zoom 0.7 (x 2686) | ≈ 816 vs far 780 | −24.6 (tight: §9 checks it) |
| east dock (x 2400) | `bld_work` far (≈ 1,850); `bld_east` near (≈ 500) | **−6.6** |
| hall / bank / office views (ceremony) | `bld_east` ≈ 950 | −4.1 |
| plaza, village | near | 0 |

### T-4. Stage pages (code, 0.05 d)

At a stage change, remove the pages of the earlier stages (`market_s1`…`s(n−1)`) once no display object shows them. `lazyAllowed` already never fetches an earlier stage again (`Game.js:428-432`). Today a session that plays 1 → 4 holds s1 + s2 + s3 + s4 ≈ 4.9 MiB; after T-4 it holds ≈ 2.0 (**−2.9**). From a reload at stage 4 the saving is −1.24 (s3), plus s1's 0.54 if the boot load skips it when the saved stage is ≥ 2. Copy the sled frame onto the s4 page (`decisions.md` TX-5).

### T-5. Measurement on the step-B layout (tests, 0.35 d)

Changes to `tools/test/texbudget.mjs`:

1. **Scenario = step B.**
   - `unlockV3`'s plan (`Game.js:2832`) is `e_m1` / `e_m2` / `s_m1` / `s_m2`. Today it puts the workshops 600–1,100 px from the station. Under D19 those plots are `types`-only, so the plan moves to `d_tool` / `d_wh` / `d_cannery` / `d_store`.
   - The hall built at village complete; stage 4 bought after 읍; the forklift bought; the 큰길 painted.
2. **New views:**
   - the ceremony at the hall front, sampled through its 12 s;
   - the stage-4 plaza with three lines and two merchants (G7's view);
   - the real depot at zoom 1.2 with the chief at the depot (forklift open);
   - the station approached from the east dock *and* from the town (both arrival orders);
   - the 관망 seated case to the end (it failed on 11-07 and was cut on a3).
3. **Texture tour at 0, 12, ≈ 20.5 (hall), 26, 45 min** (`decisions.md` TX-8). Use the fixtures, or fix `--bot` first: it dies on `window.__BAL` (`v43_baseline/report.md` §10). The fix is one `page.evaluate` that imports `balance.js`, as `bakery.mjs:50` does.
4. **Fix the first "return to the start ≤ start + 5" check.** Subtract the ground pool, as the 관망 check already does. a3 failed it only by the pool: +5.6, of which 12 slots were `fv_gslot`.
5. **Report-only runs** (no gate): `--vp 412x915x2.625` on high and on mid (full-HD class), and `--gfx mid`.
6. **Keep the results.** Write with `--out docs/build_reports/texbudget_v43.json` and commit it with the TX change. The lane runner's `git checkout -- docs/build_reports` must skip that file, or the suites must write their copy to the scratchpad.

### T-6 (stretch). Rare effect sheets on demand (code, 0.25 d)

`fx_build_done` 2.53, `fx_levelup` 2.25, `fx_unlock` 1.97 and `fx_fire_big` 1.12 = **7.87 MiB**. They are resident from the title on, but play only at a construction end, a level-up, a pad unlock or a tower fire.

- Mark them on-demand (noCap, TTL 30 s, like `lgx_forklift`).
- `effects.sheet(k)` asks `Residency.want(k)` and plays on arrival (or at once with `fx_poof`, which is resident).
- Prefetch `fx_unlock` while the chief stands on an affordable pad.

**Effect:** −7.9 in every steady view, +2–2.5 for 30 s after an effect. Wake / splash / smoke sheets stay resident: boats and stations use them all the time.

### Reserve levers (not planned; with numbers in case a T-5 view lands above 440)

| R | Lever | MiB | Cost / risk |
|---|---|---|---|
| R-1 | `town` near 800 → 400 and `depot` near 800 → 450 | station −20.8 (town) / −23.7 (depot) | pop-in walking from the station to the town or the depot |
| R-2 | `socialPages` 5 → 4 on high | −4.5 where the cap is full | one fewer resident playing social anims at once |
| R-3 | Train pages (17.6) as a `rail` area (x ≥ 3000) | −17.6 at the plaza / village views only | train sprites need re-skin support in `evictArea` (they are not manifest sprites). This is the v4.6 한마당 headroom lever |
| R-4 | `town_civic@station` (1.84) into the `east` area | −1.84 at village views | none |
| R-5 | v3 character / worker atlas split (82.7 MiB raw) | ≈ −40 | v4.4 art pipeline; the precondition for F2 (`decisions.md` TX-9) |

---

## 8. Projected numbers after TX

All step-B rows are estimates. The a3 rows are measured. GL is source + 38. Step-B adds use T-4 (s4 net +0.8). The hall page is +2.12 in village views.

| View | a3 GL (measured) | Step B, no TX | **+ T-1…T-5** | + T-6 |
|---|---|---|---|---|
| full v4 plaza (+5 s arrival) | 444.9 | 449.0 | **414.5** (swap −33.9) | 406.6 |
| plaza steady | 393.0 | 395.9 | 395.9 | 388.0 |
| east dock | 425.3 | 429.4 | **421.6** (s3 drop −1.2, `bld_work` −6.6) | 413.7 |
| our station | 449.6 | 451.6 | **426.1** | 418.2 |
| along the track | 444.9 | 446.9 | **421.5** | 413.6 |
| town square (+10 s arrival) | 451.8 | 453.8 | **407.4** (swap −45.2) | 399.5 |
| town square steady | 402.5 | 404.5 | 389.3 | 381.4 |
| overview (rail + town) | 441.6 | 443.6 | **417.8** | 409.9 |
| 관망 at the station / pan through the track | 448.4 | 450.4 | **423.8** | 415.9 |
| 관망 depot spot (zoom 0.7) | 434.4 | 436.4 | 409.6 (427.6 if the core stays near) | 401.7 |
| 관망 seated, camera at the station (11-07 base) | ≈ 452.6 | ≈ 454.6 | **≈ 428.3** | ≈ 420.4 |
| real depot, zoom 1.2, forklift (unmeasured) | — | ≈ 455 | **≈ 430** | ≈ 422 |
| ceremony at the hall (new) | — | ≈ 427–434 | **≈ 423–430** | ≈ 415–422 |
| v3.5 village complete | 366.6 | 368.7 | 368.7 | 360.8 |
| new game (must 368 source) | 246.2 GL / 206.3 src | +0 | +0 | −4.2 to −7.9 (`fx_levelup` and `fx_unlock` are boot sheets; the other two load after the title) |

- **Exit check (roadmap: full-v4 GL ≤ 445):** worst ≈ 430 (estimated views) and ≈ 426–428 (measured-based views). That is ≈ 15 MiB of margin before the ±2 MiB run spread.
- **Full-HD phones on 고사양:** the station is ≈ 426 − 33.8 + 66 = 458 before T-1. T-1 trims it to ≈ 445.
- **v4.6 한마당:** budgeted ≤ 13 MiB with the event pages, in the core district. With T-3 the plaza leaves with the core at the station.

---

## 9. Order, effort, and what to check

1. **a3.1 baseline first** (`decisions.md` TX-8): one full `texbudget.mjs` run plus `watchpan.mjs`, written to the scratchpad. The lane runner wipes `docs/build_reports`.
2. **TX before the stage-4 art and before the hall-at-village-complete code** (roadmap §3 order):
   - T-1 → T-2 → T-3f (boot re-queue) → T-3a/b repacks → T-3c/d/e → T-4.
   - Then the T-5 scenario on the step-B plot table, after `v43_layout --probe` fixes the positions: the T-3 rects come from the live users, so a later plot nudge needs no TX change.
3. **Effort:** T-1 0.15 + T-2 0.25 + T-3 0.65 (code 0.35, two repacks 0.3) + T-4 0.05 + T-5 0.35 = **1.45–1.55 d** against the roadmap's 1.25. T-6 is +0.25 if a T-5 view lands above 440.
4. **Checks that must pass with TX:**
   - every `texbudget` must, plus the new views;
   - `watchpan.mjs`: the free camera crosses the core boundary, and areas honour `LOOK_TTL`;
   - `deck.mjs`, `bakery.mjs`, `market43.mjs` after a round trip core → station → core: stand-ins re-skinned, work loops replayed (`spr:*:work`), the stage sled present;
   - `ghostsweep.mjs` (pooled item pictures, LAZY-1);
   - `padvis` per stage;
   - `smoke`;
   - `perf_presets.mjs`;
   - one 10-min soak (G7) for upload churn. Count `Residency.loads` and `evictions`: the swap rule must not loop.
5. **Specific risks:**
   - **The 관망 depot spot.** It sits only ≈ 36 px beyond the core's far edge at zoom 0.7. If T-5 shows it near, accept 427.6. It is still under 445.
   - **UI panels showing a core frame** (a goal icon or build card) while the core is far. The game pauses under a panel, so Residency does not tick, and `GoalPanel` falls back to `ui_icon_goal` when a key is missing. Add a guard anyway: `evictArea` skips a page a UI scene shows (`Residency.lists()`).
   - **Social-page churn** on full-HD phones near T-1's line. The minimum-age rule stays, and refusals are counted in `stats()`.

---

## 10. Decisions recorded (★ adopted, or the safest default where no ★ exists)

| # | Question | Adopted | Effect on TX |
|---|---|---|---|
| D2 ★ A | Hall at village complete | yes | +2.12 MiB in village views from ≈ 20.5 min (packed `town_civic@hall`; the roadmap's 15.4 is the raw atlas) |
| D3 ★ A | Hut → office ≈ 16 → hall beside it | yes | office pages inside the new-game window (est. +5–8, must 368) |
| D6 ★ A / D19 ★ A | One fixed plot per workshop; old saves' workshops move | yes | **makes T-3 exact**: the four `bld_buildings` workshops are in the core district for every village |
| D15 ★ A / X-1 | Stage 4 = three counters, open roof, spawn ×1.2 | yes | `market_s4` ≈ 1.3–2.4 MiB; T-4 drops s3 (net ≈ +0.8) |
| D20 ★ A | Depot stays | yes | depot pages unchanged; the forklift (a2.2) joins the test scenario |
| 광장 1 ★ | Reserve the 한마당 site | yes, snow only | 0 MiB in v4.3; the site is in the core district, so v4.6's ≤ 13 MiB event pages ride T-3's area |
| Q25 ★ | School XL, clinic L, hidden | yes, no sign (`decisions.md`) | 0 MiB in v4.3. These plots lie west of the core (x −930 … −1160): v5.0 art there needs its own area |
| TX-1 (`decisions.md`) | Gate = GL total incl. transients ≤ 455; v4.3 exit ≤ 445; default preset | kept | T-1 adds the RT-aware line so the same rule holds on bigger canvases |
| TX-2 / TX-3 (`decisions.md`) | Split `bld_buildings` by district; area-evict `props_buildings` | kept, completed by T-3b (move 3 outside frames), T-3c (core area), T-3e (tight hysteresis), T-3f (boot re-queue) | without T-3b, an evicted `props_buildings` would blank the se mine entrance and the east / west campfires and boats |
| **TXD-1** (new, no ★) | Add the swap rule (T-2) | yes | required for the ≤ 445 exit: the two biggest peaks are arrival transients |
| **TXD-2** (new) | `deck43_ch` area-managed? | no, not in v4.3 (safest) | −1.78 MiB left on the table until the anim re-make is proven |
| **TXD-3** (new) | 큰길 painter | Ground's village road painter in the village; RoadPaint only at its existing rects | avoids +13.05 MiB in village views, or the re-fetch loop |
| **TXD-4** (new) | Change presets for big screens? | no change in v4.3; report-only full-HD / QHD runs (T-5); T-1 trims to the real RT | revisit at v4.4 with phone numbers (k cap 1.75 on high, or RT in the 자동 pick) |
| **TXD-5** (new) | Effects on demand (T-6) | stretch: only if a T-5 view lands above 440 | −7.9 MiB in every steady view |
| TX-7 (`decisions.md`) | Soft targets | stay missed, reported | — |

---

## 11. Not verified

- **Nothing was measured for this map.** Projections are a3 measurements plus per-page byte arithmetic. The step-B adds and TX savings assume the page lists above are what is resident in each view; verify with T-5 and a per-key dump (`texdump.mjs` in `scratchpad/v43/review/fix/scratch/` does this at the plaza).
- **The class composition comes from the 11-07 run (`suites11`).** The a3 JSON was overwritten, so a3's own composition is unknown; a3 differs from 11-07 by about −2.6 (the bakery repack).
- **Gaps and edges are estimates.** View widths assume a 720-logical-px viewport at zoom 1.2 (600 × 1298 world px). Core edges come from plot-table-v2 candidates that `v43_layout --probe` may still move.
- **`market_s4`'s size** is an estimate (1.3–2.4 MiB). The split-page sizes assume today's 89 % packing.
- **QHD render targets** (≈ 114 MiB) are extrapolated from 33.8 at k 1.1 and 67 at k 1.5.
- **The seated 관망 case** has no a3 number. Its projection is the 11-07 value minus the bakery saving.
