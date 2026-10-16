# v4.2 train cars and loop rails (`assets/train2`, CONTRACT_V42 §AK) — build report (after the polish pass)

The real train is finished: a sky-blue **객차 "솔방울호"** with a slate-teal snowy roof and a warm-lit window full of
bobble-hatted passengers, a chestnut **화물칸** whose X-braced door slides open onto a stack of crates, and a dark-wood
**무개화차** with stakes, a rolled green tarp, a flat rope coil and an empty middle deck for the game's crate icons. The
two **balloon loops** (서리역 and 솔방울역) come as ground decals that lay a turnout, two R 1.75-cell curves, a straight
and a semicircle over the existing `rail_x` tiles without a seam, with a low snow fence, a switch stand (green / yellow
lamp) and a small wooden water tower that stands **behind** each loop and pours into a trough.

On a 390 px phone at zoom 0.6 every car reads as its own unit next to the town engine: red-and-navy engine, blue coach,
brown-and-green box car, low dark flat car, each separated by a dark coupler gap. Going round the loop, every car is now
drawn in front of the water tower (`tr2_phone_day_z06.png`, `tr2_loop_*_z06.gif`). `tr2_check.py` reports **0 errors**
and 2 warnings (both about things outside this set: the town engine's own overhang and the plan's town-loop position at
the east map edge, below). The headless Phaser 3.90 test passes (numbers under *Checks and tests*).

### 디자이너용 요약 (이번 손질)
- **물탱크를 고리 뒤쪽(바다 쪽)으로 옮겼어요.** 이제 기차가 고리를 돌 때 객차가 물탱크 뒤로 숨지 않아요. 서리역·솔방울역 둘 다요.
- **바퀴가 진짜로 굴러가 보여요.** 바퀴마다 크림색 바큇살 표시를 달고 축마다 각도를 다르게 해서, 커브에서도 깜빡이지 않고 한 방향으로 돌아요.
- **밤 창문 불빛을 반으로 줄였어요.** 손님들 얼굴이 보이고, 객차 사이 하얀 빛 덩어리와 지붕 위 엉뚱한 불빛이 없어졌어요.
- **화물칸 문을 열면 상자가 먼저 보여요.** 문은 살짝 열리기 시작해서 부드럽게 끝까지 열려요. 무개화차의 밧줄은 바구니가 아니라 바닥에 감아 둔 밧줄로 보여요.
- **커브 선로에도 반짝이는 레일 윗면 선**이 생겨서 곧은 선로와 이음새가 더 자연스러워요.
- **메모리**: 고리 선로 그림만 따로 한 장에 묶어서 땅에 구운 뒤 내릴 수 있어요. 울타리·전철기·물탱크는 무개화차 그림 장에 함께 실었어요. 기차 그림 전체가 1.2 MiB 줄었어요.
- 남은 것(이 세트 밖): 솔방울역 고리가 지도 동쪽 끝에 닿는 문제(고리 위치는 기획 몫), 기관차 그림 장이 계획보다 큰 문제, 커브에서 차량 배치(게임 코드 몫, 추천 방법은 manifest에 적어 두었어요).

## Polish after the review (`docs/build_reports/v42_train2_critique.md`)

Every finding was reproduced first (the critic's harness evidence plus my own measurements on the shipped atlases).

| Finding | Result | What changed |
|---|---|---|
| **H1** texture budget at the station | **fixed in the art** (the build-rule part is CODE-2's, spelled out in the manifest) | `train2_rails` now holds **only the two loop decals** (1260 × 356, 1.71 MiB): a bake-only page (`atlases[].bakeOnly`, `build.bakeOnly`) RoadPaint can release after baking. The live props (fence, end post, switch stand, water tower) moved onto the flat car's page (resident with the train; the 9-file budget kept). The water tower's `pour` is now **6 small overlays over one `pourBase` frame** (≤ 4,680 px each instead of 6 full 249 × 257 frames). Pages the build keeps: coach 4.43, box car 4.75, flat car + props 3.14 MiB (budgets 5.0 / 5.5 / 3.5). Station view, train in: engine 7.00 + 4.43 + 4.75 + 3.14 = **19.32 MiB** (critic's "today": 23.5). The `pack_pages.py` rule for train2 is CODE-2's file: `manifest.build.pageRule` states it exactly. The critic's 4th fix (drop the duplicate straight `move` frames) no longer applies: M1 made all 8 frames different. |
| **H2** water tower hides the train | **fixed** | `placeHint.rail_water_tower` moved **behind each loop on the sea side**: L(−8.0, 4.3) ours, L(38.5, 4.3) town (searched over the lattice with the game's `RailPath`, `shoreY`, v4 buildings, lots and plots). No track point that would draw a car behind the tower's body (tr2_check: 0 / 0), 0.70 cell from the ballast, every footprint corner ≥ 60 px on land (the plan's rule for buildings; train2_phaser checks it against `src/data/world.js`, read-only), sprite x 2791–3040 / 5767–6016 (inside the 6144 world). |
| **M1** wheel loop repeats every 4 frames | **fixed (re-render)** | Every wheel carries a 1-fold cream spoke + bolt, each axle at its own phase (0 / 135 / 270 / 45°), and the body rocks once per 8-frame loop (bob and roll a quarter turn apart; frame 0 = idle). Frame k vs k + 4 now differs as much as neighbouring frames (mean abs 1.3–3.4 levels, was 0.03–0.27), so the 4 frames the packer keeps on the curves (0, 2, 4, 6) turn the wheels one way. `tr2_check` fails any dir that repeats every 4 frames. |
| **M2** night glows blow out the windows | **fixed** | `windowPoints` = the 4 side windows only; the end-door windows moved to `endWindowPoints` (not glowed: they sit between coupled coaches). `lampPoints` list only the lamps the camera really sees in that dir (Blender ray cast, and for the flat car's tail lamps also the lens facing): the coach's far lantern in S / SE / NE / N and the flat car's far tail lamp no longer put a glow on the roof or the tarp. New `nightGlow`: coach `windowK` 0.35, `lampK` 0.5, `endWindowK` 0; flat car `lampK` 0.35, red tint. |
| **M3** town loop at the map edge | **partly fixed; the rest is plan geometry (won't fix here)** | The town decal is clipped at x 6144 (nothing beyond `WORLD.width`). A car rounding the loop tip still reaches x 6176: that needs the loop itself moved (T2 = L(37, 0) is fixed by the contract and `world.js`, and moving it a cell west lands the turnout on crossing 33), so it is the lead's call. `tr2_check` measures it and warns. |
| **M4** engine → coach gap, mirrored engine | **won't fix here** (`src/systems/Rail.js`, `src/entities/Train.js`) | The data CODE-2 needs is in the manifest: `trainConsist.couplerOverride.train_engine.back` 1.375 m and `trainConsist.engineFlip` (origin 1 − ax when flipped). The new cars are symmetric and need neither. |
| **M5** cars fold on the loop curves | **won't fix in the art; recipe validated** | `trainConsist.curvePlacement`: draw each car at the midpoint of its bogie chord (± 0.4 L) with ~8° heading hysteresis. `train2_phaser.mjs` implements it (`place: 'chord'`, used for every capture and GIF) and `tr2_loop_curve_cmp.png` compares it with today's arc-point placement at the critic's six picks. |
| **L1** curved rails duller than `rail_x` | **fixed (re-render)** | The swept loop rails get the same bevels as the straight `rail_x` rails (head 0.006, foot / web 0.003): the bright rail-top line runs round the curves. The loop ballast shifted to the straight tiles' tone (median 155 vs 152; was 162). Colour change across the joint at A: 2.4 / 3.9 levels (was 6.3 / 4.8). |
| **L2** coupler-gap definition | **fixed (documented)** | See *Coupler gaps* below: both definitions with numbers. |
| **L3** along-track length < 45 CSS px | **won't fix** (contract numbers) | 2.6 m and 2.4 m at 50.6 px/m and 0.325 CSS/px are 42.8 / 39.5 CSS px whatever the art does; the sprites are 54 / 49 CSS px wide. A contract-wording item. |
| **L4** `headTop` sits on the roof | **fixed** | New `labelTopDir[dir]` = 6 px above the drawn silhouette of that dir (coach −149 / −143 / −121, box car −142 / −136 / −118, flat car −82 … −73). `headTop` / `headTopDir` keep the town engine's roof-centre convention. |
| **L5** switch stand in the 역 가는 길 band | **fixed** | Hint on the fence line, L(−1.2, −0.75) / L(37.2, −0.75), with `blockM` 0.3 so walkers keep off its lever. |
| **L6** switch-stand frame names | **no change** (accepted by the critic) | `frames` + `states` (green / yellow) stay; namespaced names are right for a shared atlas. |
| **L7** nits | **fixed** | `door_open` eases from just ajar (8 %, 36 %, 72 %, 100 %); the crates now fill the doorway (stack of two + one, sacks and barrel pushed to the back corners); the flat car's rope coil lies flat (4 turns + a loose end). The pinecone pictogram stays small on purpose. |

Re-rendered: the three cars (all frames: the wheel mark and sway touch every `move` frame; box car `door_open` twice),
both loop decals and the water tower (8 frames incl. the new `pourBase`); props, decal matte and manifest repacked.
Fence and switch stand reuse their cached renders.

## Files (9, the AK file budget) and texture memory
`assets/train2/`: `manifest.json`, `train_coach.png/.json`, `train_boxcar.png/.json`, `train_flatcar.png/.json`,
`train2_rails.png/.json`. Total 1.89 MB on disk.

| Atlas | Sheet | RGBA source-sum | Page the build keeps (curve dirs S/E/N at 4 move frames) | Budget | File |
|---|---|---|---|---|---|
| `train_coach` | 1984 × 792 | 5.99 MiB | **4.43 MiB** | 5.0 | 319 KB (palette) |
| `train_boxcar` | 2020 × 760 | 5.86 MiB | **4.75 MiB** | 5.5 | 301 KB (palette) |
| `train_flatcar` (+ live props) | 2040 × 608 | 4.73 MiB | **3.14 MiB** (car 2.33 + props 1.00) | 3.5 | 838 KB (RGBA) |
| `train2_rails` (decals, bake-only) | 1260 × 356 | 1.71 MiB | released after baking | — | 320 KB (RGBA) |
| **total** | | **18.29 MiB** (was 19.52) | | | |

- The flat car's page stays **RGBA**: with the props on it, one shared 256-colour palette mangled their soft shadows
  and the pour overlays (p99 error 75–214 levels). The coach and box car stay palettised (car frames p99 31).
- **Station square, train in** (plan §13.2: train pages ≤ v4.1's 3.7 + 14 = 17.7 MiB): engine 7.00 (CODE-1's packed
  `train_engine@dirs`; the plan estimated 4.6) + coach 4.43 + box car 4.75 + flat car and props 3.14 = **19.32 MiB**.
  train2's own share is **12.32 MiB**, under the plan's 13.0 estimate; the gate needs the engine page down to the
  plan's figure (with 4.6 the total is 16.92, +13.2 ✓). That is CODE-1 / the town atlas, not this set.
- AN.5: train2's source-sum dropped by 1.23 MiB (19.52 → 18.29); the v4.2 total the critic measured (43.35) becomes
  ≈ 42.1 MiB with the other jobs unchanged.

## Cars (`characters{}`, kind `train`, same conventions as `assets/town`)

| Key | frameSize / anchorPx | lengthM / bodyM | couplerM | headTop / labelTopDir (S, SE, E) | Anims |
|---|---|---|---|---|---|
| `train_coach` | [206, 196] / [103, 146] | 3.0 / 2.7 | −1.5 / 1.5 | −103 / −149, −143, −121 | `idle` 1, `move` 8 @ 12 fps loop (S SE E NE N) |
| `train_boxcar` | [176, 172] / [88, 139] | 2.6 / 2.3 | −1.3 / 1.3 | −101 / −142, −136, −118 | `idle`, `move`, **`door_open` 4 @ 10 fps once, SE + NE only** |
| `train_flatcar` | [166, 108] / [83, 82] | 2.4 / 2.1 | −1.2 / 1.2 | −47 / −82, −85, −73 | `idle`, `move` |

All within the contract's maximum frame sizes ([240, 216], [216, 216], [208, 152]).

- **Dirs**: S, SE, E, NE, N rendered; SW ← SE, W ← E, NW ← NE by flipX. Frame names `{anim}_{dir}_{i}`; `anims[a].dirs`
  lists the dirs an anim exists in. `idle_<dir>_0` is an alias of `move_<dir>_0` (same rectangle).
- **Anchor** = ground point under the car centre on the track centre line. Car frames are packed **symmetric about the
  anchor** (ax = W / 2), so `setFlipX(true)` alone keeps a mirrored car on the track.
- **move** = one wheel turn in 8 frames (45° per frame): a cream 1-fold mark on every wheel (each axle at its own
  phase) + one gentle rock per loop, so all 8 frames differ and the curve set 0, 2, 4, 6 still rolls one way.
  `wheelR` 0.19 / 0.19 / 0.17 m, `trackPerLoopM` 1.194 / 1.194 / 1.068 m: slip-free at fps = 8 × v / trackPerLoopM.
- **shadowFrames**: 8 headings (not mirrored), own frameSize / anchor; ground layer under the car.
- **boundsPx[dir]** = opaque bounds [x0, y0, x1, y1] from the anchor; **labelTopDir[dir]** = boundsPx top − 6.
- **Points** (px from the anchor per rendered dir; mirrored dirs negate x and swap L ↔ R):
  - `doorPoints[dir] = {L: [front, rear], R: [front, rear]}` — coach: the platform steps; box car: the two door halves.
  - `windowPoints[dir]` (coach) — the 4 lit side windows (SE / E / NE; none in the end views S / N);
    `endWindowPoints[dir]` — the end-door windows (S, SE, NE, N), kept dark at night (`nightGlow.endWindowK` 0).
  - `lampPoints[dir]` — only the lamps seen in that dir: coach lanterns (2 in E, 1 elsewhere), flat car red tail lamps
    (2 in E, 1 elsewhere).
  - `nightGlow` — coach `windowK` 0.35 / `lampK` 0.5, flat car `lampK` 0.35 + tint `#FF6B5A` (fv_glow, ADD).
  - `cargoPoint[dir] = [dx, dy, behind]` (box car), `cargoSlots[dir]` (flat car, 6 × [dx, dy, behind], back to front),
    `stackStep` 14, `cargoScale` 0.737 (lgx crate icons, origin [0.5, 0.75]).
  - `doorAnim` — `door_open` forwards to open (frame 0 just ajar … frame 3 fully open), reversed to close.
- **trainConsist** — `village` (마을) and `eup` (읍) with `spacingM` (2.875 / 2.8 / 2.5 m; 읍 + 3.0), `lengthM`
  10.755 / 13.755 m, `couplerOverride.train_engine.back` 1.375, `engineFlip` (origin 1 − ax when mirrored),
  `curvePlacement` (chord midpoint + 8° heading hysteresis; see M5), and the plan figures (`spacingPlanM`,
  `lengthPlanM`).
- **Coupler gaps** (L2): the coupler stubs are 0.15 m per car by construction (lengthM − bodyM = 0.3 m). Measured on
  the E frames with the game's spacing: **walls** (columns ≥ 40 % of the car's height) coach–coach 0.31, coach–box car
  0.32, box car–flat car 0.36 m; silhouette **above coupler height** (everything drawn higher than the buffers:
  lanterns, railings, roof) 0.31 / 0.28 / 0.34 m; the critic's full-silhouette figure (incl. steps and buffer beams)
  was 0.23 / 0.19 / 0.22 m. Engine–coach 0.25 m with `couplerOverride` (walls), 0.10 m with the plan's 2.72 m.
- `replaces`: the CODE-1 stand-in each key retires (`train_car_a × 1.33, light sky tint`, `train_car_b × 1.15 + code
  crate stack`, `train_car_b × 1.07`).

## Loop rails (`sprites{}`, atlas `train2_rails`, bake-only) and props (atlas `train_flatcar`)

| Key | Atlas | frameSize / anchorPx | Placement |
|---|---|---|---|
| `rail_loop_ours` | `train2_rails` | [604, 412] / [458, 356] | anchor = **T1 = L(−1, 0) = (3056, 1283)** (`anchorWorldPx`) |
| `rail_loop_town` | `train2_rails` | [784, 324] / [94, 84] | anchor = **T2 = L(37, 0) = (5488, 2499)**; nothing beyond x 6144 |
| `rail_fence_x` | `train_flatcar` | [132, 105] / [55, 57] | step (64, 32) px, owns the post at its −X end; `run.ours` = 4 tiles at j −0.75, i −6 … −2 + end post |
| `rail_fence_x_end` | `train_flatcar` | [44, 58] / [11, 40] | last tile anchor + (32, 16) |
| `rail_switch_stand` | `train_flatcar` | [72, 83] / [28, 59] | `idle_0` green / `idle_1` yellow (`states`), `lampPoint` [−4, −44]; `placeHint` L(−1.2, −0.75) / L(37.2, −0.75), `blockM` 0.3 |
| `rail_water_tower` (optional) | `train_flatcar` | [249, 257] / [92, 173] | `frame` idle (spout up), `pourBase` (spout down), anim `pour` = 6 overlays @ 10 fps (`overlay: true`, `usage`), `spoutPoint`; footprint 1.6 m; `placeHint` **L(−8.0, 4.3) / L(38.5, 4.3)**, behind the loops |

- Each decal contains the spring turnout (long switch ties, two tie bars to the land side, switch blades, closure
  rails, frog, guard rails; the straight route through it repainted), the curves D → T and C → D (R 1.75 cells), the
  straight B → C and the semicircle A → B. It is a **difference matte over exactly the `rail_x` tiles in `tilesUnder`**
  (ours k −6 … 2, town k 34 … 41, plain `rail_x`, no buffer stop): decal over tiles = the render, so the joints at A
  and T have no seam (matte residual p99.9 0.32 / 0.35 of 255). The curved rails now carry the straight rails'
  bevelled rail-top highlight; the plain straight between the turnout and A is not in the decal (alpha 0).
- **Pouring tower**: show `pourBase` on the tower sprite and play `pour` on a second sprite at the same position,
  origin and depth (+0.001). The overlays are trimmed frames whose sourceSize = frameSize, so they land exactly
  (`pourOverlay.frames[*].bboxPx`, max error 43–51 levels only where water edges meet the base).
- Props carry a baked soft cool shadow (screen down-right) like the town props.

## How the game uses them (CODE-2 swap, plan §16.2 C2-B)
1. Add the `train2` fragment (one manifest, 4 atlases). Extend `tools/build/pack_pages.py`'s TRAIN rule to
   `train_(coach|boxcar|flatcar)` exactly as `manifest.build.pageRule` says (non-anim names = the props are kept).
2. Cars: anchor at the **chord midpoint** of `RailPath.at(s_nose − off ± 0.4 L)`, heading from that chord → nearest of
   8 with ~8° hysteresis → rendered dir + flipX (`trainConsist.curvePlacement`); shadow `shadowFrames.frames[heading]`
   under it; `move` while moving, `idle` stopped; box car `door_open` during the dwell (SE / NE, mirrored NW / SW),
   reversed to close; flat car crate icons at `cargoSlots[dir]`; night glows per `nightGlow` at `windowPoints` /
   `lampPoints` (iterate the lists; skip `endWindowPoints`); visitors board at the coach `doorPoints`; labels at
   `labelTopDir`.
3. Engine: `couplerOverride` (spacing 2.875 m engine → first car) and `engineFlip` (origin 1 − ax when mirrored).
4. RoadPaint: bake `rail_x` k −6 … 41 plain, then `rail_loop_ours` / `rail_loop_town` at `anchorWorldPx` with origin
   `anchor`; add `train2_rails` to `BAKE_ONLY` (it holds nothing else). Keep it lossless in `webp_assets.py`.
5. Objects: the fence run, the switch stand (flip `idle_0` ↔ `idle_1` with `sfx_switch_clack` when a train trails
   through; keep walkers `blockM` off it) and, if wanted, the water tower at its `placeHint` (all on `train_flatcar`).

## Checks and tests
- `python3 tools/blender/tr2_check.py [--json FILE]` — **0 errors, 2 warnings** (engine–coach gap 0.25 m: the town
  engine's own overhang; the town loop's car sprite reaching x 6176 > 6144: plan geometry). Besides the original
  checks (files, frames, dirs, anchors, couplers, points, look, silhouette, gaps, decals, matte, fence, switch lamp,
  consist), the polish adds: frame k + 4 ≠ frame k in every `move` dir (M1), seen-only lamps + `nightGlow` + side-only
  `windowPoints` (M2), `labelTopDir` (L4), `train2_rails` = the two decals only and `bakeOnly` (H1), the pour overlays
  ≤ 25 % of the tower frame and changing (H1), the tower hints: no car drawn behind the body, ballast clearance, world
  bounds (H2), the switch-stand hint on the fence line with `blockM` (L5), and the town loop's east reach (M3).
- `node tools/test/train2_phaser.mjs [--no-gif] [--quick] [--only=a,b]` (Phaser 3.90, SwiftShader): load test with
  every `assets/town` atlas next to `train2`, Assets-style anim registration, the flip probe, phone captures
  (390 × 844, DPR 3, zoom 0.6 / 1.0 / 1.2 / 1.6, day and night), the arc-vs-chord comparison and three loop GIFs; the
  water-tower hints are checked against `src/data/world.js` (`shoreY`, `WORLD.width`). Result JSON:
  `/tmp/fv_cache/train2/phaser/train2_phaser.json`.

PHASER_RESULTS

## Previews (`docs/previews/`)
- `tr2_cars_8dir.png`, `tr2_anims.png` (move 8 f; box car door SE / NE), `tr2_consist.png`, `tr2_silhouette.png`.
- `tr2_loops.png` — both loops baked over the tiles (+ fence, stand and the water tower at its new hint) and 3× crops
  of both turnouts and both joints at A.
- `tr2_props.png` — fence run + end post, switch stand green / yellow, water tower idle + `pourBase` with overlays.
- `tr2_wheels.gif` — SE and E with all 8 frames, plus E with the 4 frames the packer keeps on curves.
- `tr2_door.gif`, `tr2_water_tower.gif` (idle → pour, as base + overlay).
- `tr2_phaser_sheet.png` — the in-engine 8-heading sheet.
- `tr2_phone_day_z06 / z10 / z12 / z16.png`, `tr2_phone_night_z10 / z06.png` (glows at `nightGlow`),
  `tr2_phone_stop_z10 / z06.png`, `tr2_phone_town_z06.png`, `tr2_phone_fallback_z10.png` vs `tr2_phone_decal_z10.png`.
- `tr2_loop_curve_cmp.png` — 읍 consist on the loop at zoom 0.6: arc-point (today) vs chord-midpoint placement at
  d 11.2 / 12.0 / 12.8 / 20.0 / 20.8 / 21.6 m.
- `tr2_loop_village_z06.gif`, `tr2_loop_eup_z06.gif`, `tr2_loop_eup_z10.gif` — the consists round the loop (chord
  placement), the tower behind.

## Rebuild
```
nice -n 10 /tmp/bvenv/bin/python tools/blender/tr2_render.py -- [cars | rails | <key> ...] [--force] [--anims A] [--meta-only]
nice -n 10 python3 tools/blender/tr2_pack.py        # -> assets/train2 (no Blender)
python3 tools/blender/tr2_check.py
python3 tools/blender/tr2_previews.py
node tools/test/train2_phaser.mjs
```
Cache `/tmp/fv_cache/train2` (pre-polish copy in `/tmp/fv_cache/train2_prepolish`). On the shared box (load ≈ 20) the
three cars took 13 min, the two decals 84 s each, the tower 3 min. `--meta-only` recomputes a car's points from the
model without rendering.

## Known issues
- **Station-square gate (H1 remainder)**: with CODE-1's 7.0 MiB engine page the train pages total 19.3 MiB, 1.6 over
  the plan's +14 gate; train2's own 12.3 MiB is under its 13.0 estimate. Needs the engine page at the plan's 4.6.
- **Town loop at the east edge (M3)**: a car rounding the town loop tip reaches x 6176 (> 6144). Moving the loop is a
  plan / `world.js` change (T2, A′, stops, tiles, crossing 33); `tr2_rails.py` re-renders the decal in ~85 s once it
  moves.
- **Integration items for CODE-2** (critique §4): `windowPoints` / `lampPoints` are lists; flat-car freight uses
  `cargoSlots`; the engine's coupler override and flip origin; chord placement on curves; `pack_pages` rule;
  `BAKE_ONLY` + lossless `train2_rails`.
- **Decal pixels the tiles keep**: 318 (ours) / 278 (town) pixels where the render is more transparent than the
  `rail_x` tile under it (the tiles' snow lumps inside the turnout) cannot be erased by a decal.
- At zoom ≥ 2 the curved rail-top line is a little softer than the straight tiles' (p90 rail luminance 167 vs 190);
  invisible at phone zooms.
- The Phaser GIF capture is slow on the shared machine; use `--no-gif` for a quick load test.
