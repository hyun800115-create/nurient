# v42_train2: adversarial art review (train cars and loop rails, CONTRACT_V42 §AK)

**Verdict: polish.**

The cars themselves are the best part of v4.2 so far. The sky-blue coach full of bobble-hatted passengers, the chestnut
box car whose door slides open onto sacks and crates, and the low dark flat car match the town engine in palette,
light, outline and toy scale. On a phone at zoom 0.6 they read as four separate units, and the loop decals sit on the
`rail_x` tiles with no hard seam. The manifest follows §AK almost to the letter.

What needs work is around the art, not the art itself:
- **Texture budget at the station.** The set only meets its budgets if the build is changed, and the rails atlas can
  never be released after baking.
- **The water tower.** Its suggested spot hides the train going round the loop.
- **Wheels on the loop.** The wheel loop repeats every half turn, so on the curves the wheels flicker instead of turn.
- **Night lights.** The night-glow points blow out the windows.
- **Town loop at the map edge.** The town loop runs into the east edge of the map.

None of these needs a new art direction. Two of them should be settled before CODE-2 wires the set in.

**What I tested**
- **Scope and references.** The set is `assets/train2/**` (9 files), treated as read-only. I checked it against
  `docs/CONTRACT_V42.md` §AK and §AN, `docs/v42_plan.md` §5 and §13, and the game code that will draw it:
  `src/systems/RailPath.js`, `src/systems/Rail.js` (`UNITS`), `src/entities/Train.js`, `src/systems/RoadPaint.js`,
  `src/systems/Ground.js`, `src/systems/DayClock.js` and `tools/build/pack_pages.py`.
- **My own Phaser 3.90 harness** (`$S/page.js` + `$S/harness.mjs`), separate from the builder's, drawing the set the
  way the game will:
  - **Ground.** Baked on a 2D canvas like `Ground.bakeChunk` + `RoadPaint.paintRails`: snow pattern anchored at the
    world origin, shoreline from `shoreY`, plain `rail_x` k −6…41 (crossings at 8 and 33), then the loop decal. Below
    zoom 0.85 it is baked at half resolution, like Ground level 1.
  - **Train placement.** The game's own `RailPath` and the game's consist offsets (`Rail.js` `UNITS`, the plan
    figures). `Train.updateRoute` rules: chord heading ±0.4 L, nearest of 8 headings, flipX mirrors, a shadow per
    true heading, depth = anchor y.
  - **Freight.** lgx crate icons at `cargoSlots` / `cargoScale`.
  - **Night.** `DayClock`'s MULTIPLY tint (darkness 0.45, `#5a6aa8`) plus `fv_glow` ADD glows.
- **Neighbours.** The real `train_station` (town_civic), the town engine, real townfolk dolls on the platform and on
  the 역 가는 길, the chief (`char_player`), the fence run, switch stand and water tower at the manifest's
  `placeHint`s.
- **Captures.** Phone 390 × 844 at DPR 3 (k = 1.65, `src/main.js` maths) at zoom 0.6, 1.0 and 1.2, by day and night.
  Also zoom 2.0 close-ups of the four rail joints, the 읍 consist stopped at 서리역, mid-loop at both ends, a 51-frame
  run round our loop, and the procedural fallback for comparison.
- **Approximations.**
  - The sea is a flat two-tone fill, not the Water shader.
  - The `link` street paint (역 가는 길) and the pre-repair snow drifts are not drawn.
  - People are placed by hand.
- **Results.** Every page load had 0 page errors and 0 404s. `tr2_check.py` re-run: 0 errors, 1 warning.

Scratch folder `$S` = `/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v42art_train2_review`
(evidence in `$S/shots/`).

| Severity | Count |
|---|---|
| critical | 0 |
| high | 2 |
| medium | 5 |
| low | 7 |

---

## 0. 디자이너용 요약 (쉬운 말)

**좋은 점**
- 기차가 정말 귀여워요.
  - 하늘색 객차 창문마다 방울모자 쓴 손님들이 보여요.
  - 화물칸 문이 스르르 열리면 안에 자루와 상자가 보여요.
  - 무개화차에는 초록 방수포와 밧줄이 실려 있어요.
- 빨간 기관차와 색·빛·외곽선이 한 가족이에요.
- 휴대폰 줌 0.6에서도 기관차, 객차, 화물칸, 무개화차가 각각 따로 보여요.
- 고리 선로 그림은 원래 철길과 이음새 없이 붙어요. 임시로 그려 둔 선로보다 훨씬 예뻐요.

**꼭 고칠 점 1: 물탱크가 기차를 가려요.**
- 설명서가 물탱크를 고리 한가운데에 두라고 해요.
- 그러면 기차가 고리를 돌 때마다 뒤쪽 객차가 물탱크 뒤로 몇 초씩 사라져요. 서리역과 솔방울역 둘 다요.
- "기차가 빙글 도는 모습"이 이번 업데이트의 자랑인데, 그 순간을 가려요.
- 물탱크를 고리 바깥, 바다 쪽 뒤편으로 옮기거나 빼면 돼요.

**꼭 고칠 점 2: 그림 메모리가 역 앞 화면 한도를 넘어요.**
- 고리 선로 그림이 울타리·전철기·물탱크와 한 장에 묶여 있어요. 그래서 땅에 구운 뒤에도 메모리에서 내릴 수 없어요.
- 이대로면 역 앞 화면이 계획한 한도(+14 MiB)를 약 6 MiB 넘어요.
- 그림을 다시 그릴 필요는 없어요. 묶는 방법만 바꾸면 돼요.

**그 밖에 보이는 것들**
- 고리를 돌 때 바퀴가 도는 게 아니라 깜빡여요. 바퀴 무늬가 반 바퀴마다 똑같아서 그래요.
- 밤에 창문 불빛이 너무 세서 손님이 하얗게 날아가요. 객차와 객차 사이에도 하얀 빛 덩어리가 생겨요. 불빛을 반으로 줄이면 예뻐요(비교 사진 있음).
- 솔방울역 고리의 끝이 지도 동쪽 끝에 딱 붙어요. 기관차가 고리 끝을 돌 때 화면 밖으로 반쯤 나가요.
- S자 커브에서 객차 두 대가 나란히 서 있는 것처럼 보이는 순간이 있어요. 방향이 8개뿐이라서예요(계획서가 알고 있는 위험).
- 기관차와 첫 객차 사이 간격은 게임 코드가 이 세트의 보정값을 써야 생겨요. 지금 코드로는 거의 붙어 보여요.

---

## 1. Contract conformance (§AK, §AN)

| Item | Contract | Delivered (measured) | Result |
|---|---|---|---|
| Keys | 3 cars; `rail_loop_ours`, `rail_loop_town`, `rail_fence_x`, `rail_fence_x_end`, `rail_switch_stand`, optional `rail_water_tower` | all present | pass |
| Files | AK 9 | 9 (manifest + 4 × png/json), 1.47 MB | pass |
| Dirs / mirrors | S SE E NE N + SW←SE, W←E, NW←NE | yes | pass |
| Frame names | `{anim}_{dir}_{i}` | yes; `shadow_<8 headings>` as the engine | pass |
| `idle` / `move` / `door_open` | 1 f / 8 f @12 loop / 4 f @10 once, SE + NE | all frames present (coach 53, box car 61, flat car 53); `idle_*_0` aliases `move_*_0` | pass, but see M1 (the 8 move frames are periodic every 4) |
| frameSize ≤ | 240×216 / 216×216 / 208×152 | 206×196 / 176×172 / 166×108 | pass |
| Anchor | ground under car centre, track centre line | yes; frames symmetric (ax 0.5), so flipX alone keeps a car on the track | pass |
| lengthM / couplerM | 3.0 ±1.5 / 2.6 ±1.3 / 2.4 ±1.2 | silhouettes end at ±1.50 / −1.31 +1.30 / −1.22 +1.20 m (E frame) | pass |
| Coupler gap ≥ 0.3 m | "visible dark gap between bodies" | walls 0.31 / 0.32 / 0.36 m (check); full silhouette (lanterns, railings, roof) 0.23 / 0.19 / 0.22 m | ambiguous (L2) |
| Points | `doorPoints`, `windowPoints`, `lampPoints`, `cargoPoint`, `cargoSlots` ×6 + `stackStep` ≈14, `headTop` | all present, inside frames, L/R and front/rear correct | pass, see M2 and L4 |
| `shadowFrames` | 8 headings, not mirrored | yes (NW ≠ mirrored NE) | pass |
| Look | coach `#5DA9DD` / teal roof `#3E6E78`, never red; box car `#8A5A3A` + X-braces + walkway; flat car stakes, tarp, rope, tail lamps, empty middle | all there; roof 0 % red | pass |
| Budgets (packed, curve dirs 4 f) | coach ≤ 5, box car ≤ 5.5, flat car ≤ 3.5 MiB | raw 5.99 / 5.86 / 3.02; packed with the train rule 4.39 / 5.14 / 2.33, but `pack_pages.py` does not cover `train2` yet | conditional (H1) |
| Decal anchors | T1 = L(−1,0), T2 = L(37,0) exact | (3056, 1283) / (5488, 2499) | pass |
| Decal contents | turnout, D→T, C→D, B→C, A→B; not the straight main line | yes; straight-bed alpha 0 | pass |
| Decal frames ≈ | 576 × 416 | 604 × 412 / 784 × 324 | ok (the town loop is wider by geometry) |
| Seam at A / T | no visible seam | no hard seam; tone change visible at zoom ≥ 1.2 | pass (L1) |
| Fence / end / stand / tower | ≈160×112, 48×96, 64×96 (`idle_0/1`), ≤256×320 + `pour` 6 f | 132×105, 44×58, 72×83 (`rail_switch_stand_idle_0/1` + `states`), 249×257 + `pour` 6 f | pass (L6 naming) |
| AN.1 ≥ 45 CSS px at 0.6 | "each car ≥ 45 CSS px long" | width 60 / 54 / 49; along the track at SE/NW 49 / 43 / 40 | ambiguous (L3) |
| AN.5 v4.2 total ≤ 45 MiB | | chief_fx 2.80 + chief2 2.94 + office 5.03 + officefolk 11.55 + train2 19.52 + ui5 1.50 = **43.35 MiB**; train2 alone is 45 % | pass (tight) |
| Halos / outline | house ink outline, no bright fringe | edge luminance 83–93 (engine 98–101), 0 bright semi-transparent edge pixels | pass |

---

## 2. Findings

### H1 (high): the station view goes over its texture gate, and the build does not yet keep the cars inside their AK budgets

**What**
1. **No build rule for these atlases.** `tools/build/pack_pages.py` only page-packs `train_(engine|car_a|car_b)` in
   `TOWN_FRAGS = ['town']`. As shipped, `train_coach` (5.99 MiB) and `train_boxcar` (5.86 MiB) exceed §AK (5.0 / 5.5).
   The "page the build keeps" figures in the build report (4.39 / 5.14 / 2.33) only exist if CODE-2 extends that rule.
   I re-ran the rule from scratch against `split_hash` and got exactly those numbers.
2. **The rails page cannot be released.** `train2_rails` (2008 × 608, 4.66 MiB) mixes bake-only ground decals
   (`rail_loop_ours` / `_town`, 1.48 MiB of content) with live y-sorted objects (fence, switch stand, water tower). The
   decals are baked into the ground, but the page stays resident for the props. So the station view carries the
   whole 4.66 MiB page that the plan never budgeted.
   - Of that page, the water tower's `pour` is 6 full 249 × 257 frames (1.46 MiB). Between pour frames only a
     ≈17 × 54 px water stream changes (232 px > 24 levels from frame to frame).
3. **Near-duplicate move frames.** The straight dirs carry 4 near-duplicate move frames per car (M1): 2.3 MiB across
   the three cars.

**Numbers (station square, train in; plan §13.2 gate = v4.1 + 14 MiB, v4.1 train = 3.7 MiB, so the train pages
may total at most 17.7 MiB)**

| Case | Train pages | vs v4.1 |
|---|---|---|
| Today, with fix 1 only: engine@dirs 7.00 (already packed by CODE-1; the plan estimated 4.6) + cars 4.39 + 5.14 + 2.33 + rails page 4.66 | 23.5 | **+19.8** |
| Fixes 1 + 2 (decals released; the props page stays ≈ 2.0 because of the 7 tower frames) | 20.9 | +17.2 |
| Fixes 1 + 2 + 3 (tower `pour` as an overlay, props page ≈ 0.4) | 19.3 | +15.6 |
| Fixes 1 – 4 (also drop the duplicate straight move frames, −2.3) | 17.0 | **+13.3** ✓ |
| For reference, with the plan's 4.6 MiB engine: fixes 1 – 3 | 16.9 | +13.2 ✓ |

- train2's own share is the cars (11.86, 1.1 under the plan's 13.0 estimate) plus the rails page (4.66, which the plan
  never budgeted).
- The engine page is 2.4 MiB over the plan, but that is not this job's file. It is why fix 4 is needed too.

**Repro**
```
grep -n "^TRAIN = \|^TOWN_FRAGS" tools/build/pack_pages.py     # engine|car_a|car_b, ['town'] only
# build-rule simulation (writes nothing): import pack_pages, call split_hash(key, png, json, classify, ['dirs']) on
# assets/train2/train_*.png|json with classify = the TRAIN rule (NE/SE full, curve dirs move 0,2,4,6 + idle_0,
# all shadows)  ->  4.391 / 5.141 / 2.328 MiB
```

**Fix** (no re-render needed for 1 and 2)
1. **CODE-2: train rule.** In `pack_pages.py`, add the `train2` fragment and `train_(coach|boxcar|flatcar)` to the
   TRAIN rule.
2. **CODE-2: split the rails page.** At build time, split `train2_rails` into:
   - a bake-only page `train2_rails@decals`, put on RoadPaint's `BAKE_ONLY` list so it is released after baking (add
     its key to `RoadPaint.onArrive`);
   - a small props page `@props`.
3. **Art: water tower.** Ship `pour` as a small stream overlay on one "spout lowered" frame, or drop `pour`. That saves
   about 1.2 MiB. The tower is optional.
4. **Art (with M1): move frames.** Keep 4 distinct straight move frames. That saves 2.3 MiB.

All four fixes together bring the station view back under the gate, even with the larger engine page. Fixes 2 and 3
alone bring train2's own share back under the plan's estimate.

### H2 (high): the suggested water-tower spot hides the train on both loops, every pass

**What**
- `placeHint.rail_water_tower` = the semicircle centre: L(−6, 1.75) at ours, L(42, 1.75) at town. The build report
  says to place it there.
- The far half of each semicircle (and the B→C straight) has a smaller y than the tower anchor, so every car there is
  drawn behind the 3.2 m tower.
- On our loop, with the 읍 consist, a car is partly or fully hidden from about d 12 m to 24 m past the stop. That is
  about 12 m of travel, 5–6 s at the 2.2 m/s curve speed, at each end once per 85 s cycle.
- That is exactly the moment the plan sells as the delight of v4.2: "기차가 빙글".
- At d 18 m the second coach is reduced to its two ends either side of the tank.

**Evidence**
- `$S/shots/c_run12_z06.png`, `c_run18_z06.png`, `c_run24_z06.png`, `c_runs_z06.png`
- `$S/shots/seq_sheet.png`, and `$S/shots/loop_eup_z06.gif` (51 frames, game RailPath)
- The builder's own `docs/previews/tr2_phone_day_z06.png` shows the same thing (coach behind the tank).

**Repro**
```
cd $S && nice -n 10 node harness.mjs r="mode=run&zoom=0.6&stage=2&d=18&frame=2"      # tower=0 to compare
```

**Fix**
- **Rule.** Do not place the tower inside the loops. Put the hint where no track point under the tower's sprite rect
  has a smaller y than the tower anchor.
- **Candidates behind the loop, on the sea side** (they need a `v42_layout.mjs` check):
  - L(−7, 4.8) = (2979, 937): 69 px from `shoreY`, clear of the B→C ballast;
  - L(40, 4.8) = (5987, 2441) at town.
- **Or** leave the tower out (it is optional) and save its 1.7 MiB.

### M1 (medium): the wheel and sway loop repeats every 4 frames, so the 4 frames kept on curves alternate between two pictures

**What**
- In every rendered dir, `move_*_4` ≈ `move_*_0` (and 5 ≈ 1, and so on):
  - mean abs difference 0.03–0.27 levels;
  - neighbouring frames differ by 1.4–4.9;
  - coach E frame 0 vs 4: 132 px over 24 levels, out of about 19,600 opaque px.
- The disc-wheel hub pattern is 180° symmetric, and the sway follows the same 4-frame period.
- The town engine has a crank pin, so its frames 0 and 4 differ (diff 4.8).
- The plan's packer keeps move 0, 2, 4, 6 for the curve dirs S/E/N, which leaves two distinct images in A-B-A-B
  order. Each step is a 90° wheel step, so the direction is ambiguous. On the loop, where the train is slow and
  watched, the wheels flicker instead of rolling and the body jitters by 1 px.
- In the straight dirs, frames 4–7 cost 2.3 MiB of page memory for no visible gain (H1).

**Evidence**
- `$S/shots/wheels_E.png`: 8 frames at 6×.
- `python3 $S/tools/framediff.py`: the table of frame 0 vs k for every car and dir.
  - Cars: frame 0 vs 4 = 0.01–0.27, and 0–195 px over 24 levels.
  - Engine: 0.83–5.04, and 768–3344 px.

**Fix (pick one)**
- **(a)** Give each wheel a 1-fold mark like the engine's crank pin (a white bolt or a red spoke) so frames 0–7 are
  all distinct. Then 0/2/4/6 rotate 90° per step with a clear direction.
- **(b)** Render the 8 frames over 180° (22.5° per frame) and ship 4 for the straight dirs, 2 for the curve dirs.
  `trackPerLoopM` halves.
- **(c)** CODE-2: keep 0, 1, 2, 3 for the curve dirs. Cheapest, but the sway still has a period of 4.

(a) keeps the contract's "one wheel turn in 8 frames" literally true. (b) also saves the most memory.

### M2 (medium): night lights blow out the coach windows; hidden lamp points light up roofs

**What**
- **Window band blows out.** The plan's night rule is one `fv_glow` per window point at k 0.7, as `DayClock`
  `coachPoints` does today. With 5 `windowPoints` per side view, the coach's window band turns to cream-white and the
  passengers disappear.
- **Hotspot at every coupling.** The end-door window point plus both lanterns stack into a white blob between every
  pair of coaches.
- **Hidden lamps in end views.**
  - Coach S/N: the far lantern point (−30, −116) / (30, −116) lands on the teal roof (pixel 115, 151, 161).
  - Flat car S/N: the far tail lamp (∓32, −71) lands on the green tarp (60, 78, 71).
  - So on the loop at night, glows sit on roofs where no lamp is drawn.
- **Self-lit windows.** The coach's windows are already self-lit (warm emissive seat backs). With window glows at k
  0.35 they read best: warm, passengers visible, no hotspot.

**Evidence**
- `$S/shots/c_night_cmp_full.png`: left = k 0.7 per window (plan), middle = k 0.35, right = lamps only.
- `$S/shots/c_stop_n06.png`, `c_stop_n10.png`

**Fix**
- **Art/manifest.**
  - Drop or flag points that are hidden in a dir: `{ p: [dx, dy], visible: false }`, or simply omit them.
  - Mark the end-door window (`windowPoints` SE[4] / NE[4]) as `end: true`.
  - Add a recommended `glowK` (≈ 0.35 per window, 0.5 per lantern).
- **CODE-2.** Use those values. Also note that `Train.routePoint` currently treats `windowPoints[dir]` as a single
  `[dx, dy]`; the real data is a list (see the integration notes in §4).

### M3 (medium): the town loop runs into the world's east edge

**What**
- **The decal reaches the edge.** `rail_loop_town` is opaque to x 6145 (`WORLD.width` 6144). The semicircle's outer
  ballast reaches about x 6133.
- **Why.** The plan's clearance in §5.1 ("ballast x ≤ 6075 < 6144") measured the lattice-rightmost point (43.75,
  1.75). The screen-rightmost point of the R 1.75 circle is at i + j = 46.22, x ≈ 6078, plus 55 px of ballast.
- **In normal play** the camera is bounded at `WORLD.width` (`Territory.bounds`), so the loop tip and the engine
  rounding it are cut by the screen edge.
- **In overview, with no camera bounds**, the engine (its sprite reaches about x 6178) and its shadow overhang the
  void beyond 6144.
- **What `v42_layout.mjs` checks.** It knows the screen extreme (≈ 6134) and accepts it against
  `WORLD.width − 8` = 6136, a 2 px margin. It does not check the cars that round the tip, and the plan text still says
  6075.

**Evidence**
- `$S/shots/c_edge_town06.png`: view right edge at 6144.
- `$S/shots/c_edge2_town06.png`: void painted dark beyond 6144.

**Repro**
```
cd $S && nice -n 10 node harness.mjs e="mode=town&zoom=0.6&stage=2&d=22&edge=1&fx=5800&fy=2560&vh=500"
```

**Fix**
- **Owner: lead or plan.** Move the town loop at least 1 cell west (t 36, a 41; stops and tiles follow) and
  re-render `rail_loop_town` (a cheap, roughly 25 s render).
- **Or** keep it and make sure border trees or the camera rect cover x > 6144 at that y.
- **Either way**, extend `v42_layout.mjs` to check the cars' sprite extent at the loop tip (about ballast + 45 px),
  not only the ballast.

### M4 (medium, integration): the engine and the first coach only part if CODE-2 uses this set's override; the mirrored engine sits 28 px off the track today

**What**
- **Gap needs an override nobody reads.** `Rail.js` `UNITS.train_engine.back` = 1.22 m (the plan). The town engine's
  sprite reaches 1.375 m behind its anchor (rear hook) and its cab body 1.31 m.
  - With the game's offsets the engine and coach bodies are 0.03 m apart, and their couplers overlap by 0.155 m
    (E frame).
  - The fix exists only in `assets/train2/manifest.json` `trainConsist.couplerOverride`, which nothing reads.
- **Mirrored engine misplaced.** `Train.js` mirrors with `setOrigin(ax)`. For the asymmetric engine (ax 0.434),
  heading NW, W or SW, that puts it 28 px off its track point, into the coach. At 서리역 the stopped train is always
  heading NW.
- **The new cars are symmetric**, so they are fine.

**Evidence**
- `$S/shots/c_flip_cmp.png`: left = `Train.js` today, right = origin 1 − ax.
- `$S/shots/junc_SE.png`, `$S/shots/cmp_NWE.png`
- Row-wise gap table from `$S/tools/consist.py`.

**Fix (CODE-2)**
- Read `trainConsist.couplerOverride` (or set `UNITS.train_engine.back = 1.375`). The train becomes 0.155 m longer,
  so re-check the `rail42.test` stop and crossing spans.
- Use `setOrigin(flip ? 1 − ax : ax, ay)`.

### M5 (medium, plan-level): on the loop's curves the 3 m coaches fold and stand side by side

**What**
- **Semicircle.** On the R 1.75-cell semicircle the two coaches fold into a stacked ">" (seq frames d 9.6–12.8).
- **S-curve.** On the C→D→T S-curve, consecutive cars all snap to the vertical S frame while their anchors swing ±46 px
  across the curve. The coach then stands beside the engine instead of behind it (d 20–23).
- **On a phone at 0.6 it reads as a pile-up for 2–3 s per loop.**
- The plan accepts "stiff with 8 headings" (§18) and the builder lists it. In the run, though, it looks wrong more
  than stiff.
- The art cannot fix this inside the budget (no 16-heading frames).

**Evidence**
- `$S/shots/seq_pick.png`: d 11.2 / 12.0 / 12.8 and 20.0 / 20.8 / 21.6.
- `$S/shots/loop_eup_z06.gif`

**Fix (CODE-2, cheap)**
- **Chord-midpoint anchor.** Draw each car at the midpoint of its bogie chord (± 0.4 L) instead of its arc point. On
  R 2.47 m the sagitta is 0.31 m ≈ 20 px, which pulls consecutive cars back into a line.
- **Heading hysteresis.** Add about 8° of hysteresis on the heading so cars don't flip back and forth at sector edges.
- **If it still reads badly**, the plan owner can ease the D→T reverse curve (R 2.5 cells).

### Low

- **L1 – Rails on the curves are duller than the straight rails.**
  - The curved rails have no bright rail-top highlight dash, and the decal ballast is lighter and more mottled than
    `rail_x`.
  - So the tone changes where the decal meets the tiles (A, A′, T1, T2). It shows at zoom ≥ 1.2 and is invisible at
    0.6 and 1.0. The builder lists this.
  - Evidence: `$S/shots/c_seamA_z2.png`, `c_seamA2_z2.png`, `c_seamT1_z2.png`, `c_seamT2_z2.png`.
  - Fix: add the highlight in `tr2_rails.py` the next time the decals are rendered.
- **L2 – The coupler-gap figure depends on how it is measured.**
  - `tr2_check` measures wall to wall (0.31 / 0.32 / 0.36 m).
  - The full silhouette, including end lanterns, railings and roof overhang, leaves 0.23 / 0.19 / 0.22 m. That is
    13–15 px at E, or about 4–5 CSS px at 0.6.
  - It reads fine on the phone (`$S/shots/consist_E_plan.png`), but the report should state which definition it uses.
    Otherwise the contract wording "between bodies" should say "walls".
- **L3 – Along-track length at the stopped headings is under 45 CSS px.**
  - AN.1 asks for "≥ 45 CSS px long". Along the track at the stopped headings SE/NW: box car 42.8, flat car 39.5.
  - `tr2_check` computes `alongTrackCssZoom06` but the build report quotes widths (54 / 49).
  - The lengths are fixed by §AK.1, so this is a contract-wording item. Note it rather than re-render.
- **L4 – `headTop` is the roof centre, not the top of the silhouette.**
  - `headTop` / `headTopDir` (−103 / −101 / −47 for every dir) is the roof centre.
  - The silhouette top is −143 in S/N, −137 in SE/NE and −115 in E.
  - A label or bubble placed at `headTop` sits on the roof in end and diagonal views. (`Train.js` uses a hard-coded
    −110 today.)
  - Fix: `headTopDir[d] = boundsPx[d][1] − 6`.
- **L5 – The switch stand and fence stand in the 역 가는 길 band.**
  - The switch stand's hint L(−1.2, −0.8) is inside the `link` street band (j −1.5…−0.5), 0.2 cell from the walk line
    j −1. Walkers drawn in front will pass through its lever.
  - The fence at j −0.75 is in the same band, but that is the plan's choice and it reads as an edge.
  - Fix: hint at i −1.6, j −0.85 (the end of the tie bars), or give the stand a 0.3 m collision circle.
- **L6 – The switch-stand frame names differ from the contract.**
  - The frames are `rail_switch_stand_idle_0/1`, not the contract's literal `idle_0/1`.
  - Namespacing is right for a shared atlas, and `frames` and `states` are given. Accept it; CODE-2 should read
    `states`.
- **L7 – Nits.**
  - `door_open` frame 0 is already about ¼ open, so there is a small jump from `idle`.
  - Inside the open box car the sacks read more than the crates ("crates visible inside" is only weakly met).
  - The flat car's rope coil reads as a small basket.
  - The box car's pinecone pictogram is invisible at phone zoom.
  - None of these matters at 0.6.

---

## 3. What works (keep)

- **Distinct units.** At 0.6 the engine (red and navy), coach (sky blue, teal and white roof), box car (chestnut, green
  roof) and flat car (low, dark, crate stacks) are four different blobs. The silhouette test passes in the real scene,
  not only on a white sheet (`$S/shots/t_stop06_crop.png`).
- **Charm and detail at 1.0–1.2.**
  - Passengers in scarves and bobble hats behind gold window frames.
  - The pinecone emblem and blank name plate.
  - End platforms with railings and lanterns.
  - The door sliding open onto sacks under a warm lamp.
  - `$S/shots/c_stop_z10.png`, `c_stop_z12.png`, `c_stop_z2.png`, `door_NE.png`.
- **Same family as the town engine.** Same light (shadows down-right), ink outline and toy scale. No halos, and no
  red on the coach roof.
- **Anchors and points.**
  - Mirrored cars land exactly on the track.
  - Every point lies inside its frame. Door points sit at the platform steps, on the correct side.
  - Window points sit on the windows.
  - The 6 `cargoSlots` fill the deck nicely at the flat car's real load of 6 icons (`$S/shots/flat_crates.png`,
    `points_all.png`).
- **Loop decals.**
  - Exact lattice anchors, no hard seam.
  - Still clean when baked at half resolution (Ground level 1).
  - Far better than the CODE-1 procedural stand-in (`$S/shots/c_loop_vs_fb_z10.png`).
  - The turnout with tie bars and the green/yellow switch lamp is a lovely detail at 1.0+.
- **Night.** With smaller window glows the coaches look like warm lanterns gliding along the shore
  (`c_night_cmp_full.png`, middle).

---

## 4. Integration notes for CODE-2 (not defects of the set)

1. **Window and lamp points are lists.** `Train.routePoint` / `coachPoints` expect one `[dx, dy]` per dir.
   `windowPoints` / `lampPoints` are lists, so the real coach gives NaN glows. Iterate over the list, and honour M2's
   flags.
2. **Flat-car freight uses the wrong fields.** `Train.cargoPoint()` falls back to `[19, −46]` for the flat car, which
   has `cargoSlots`, not `cargoPoint`. `drawCrates` draws 30 × 28 code crates in its own layout. Switch to lgx crate
   icons at `cargoSlots[dir]` × `cargoScale` (6 icons at the 24-item capacity, 1 per slot), drawn in the listed order.
3. **Box-car door.** Play `door_open` NE flipped at ours (heading NW) and SE at town. Close it reversed. The visible
   side faces the 짐 싣는 곳 ✓.
4. **Engine.** `Rail.UNITS` engine back and the mirrored origin (M4).
5. **RoadPaint.**
   - Plain `rail_x` for k −6…41, except crossings 8 and 33, which lie outside `tilesUnder` ✓.
   - Then the two decals at `anchorWorldPx`, with origin = anchor.
   - Wait for (and re-bake on arrival of) `train2_rails` as it does for `town_rails`.
   - Pre-repair drifts are drawn after the decals ✓.
6. **Build.**
   - `pack_pages.py` train rule plus the rails page split (H1).
   - Keep `train2_rails` lossless in `webp_assets.py` (`skip_dirs`), or at least its decal frames.

---

## 5. Evidence index (`$S/shots/`)

| File | What |
|---|---|
| `t_stop06_crop.png`, `c_stop_z10.png`, `c_stop_z12.png`, `c_stop_z2.png` | 읍 consist stopped at 서리역 (heading NW, box car open, crates on the flat car), zoom 0.6 / 1.0 / 1.2 / 2.0 |
| `c_stop_n06.png`, `c_stop_n10.png`, `c_night_cmp_full.png` | night: the plan's glows, k 0.35, lamps only (M2) |
| `c_run12_z06.png`, `c_run18_z06.png`, `c_run24_z06.png`, `c_runs_z06.png`, `seq_sheet.png`, `seq_pick.png`, `loop_eup_z06.gif` | the train round our loop with the tower (H2, M5) |
| `c_town20_z06.png`, `c_edge_town06.png`, `c_edge2_town06.png` | town loop; world edge (M3) |
| `c_seamT1_z2.png`, `c_seamA_z2.png`, `c_seamT2_z2.png`, `c_seamA2_z2.png`, `c_loop_vs_fb_z10.png` | decal joints at zoom 2; decal vs procedural fallback (L1) |
| `cmp_SE.png`, `cmp_NWE.png`, `junc_SE.png`, `consist_*_plan.png` / `_ovr.png`, `c_flip_cmp.png` | consist spacing, engine override and flip (M4, L2) |
| `points_all.png`, `points_coach.png`, `flat_crates.png`, `door_NE.png`, `wheels_E.png`, `z3_*.png` | manifest points, crate slots, door anim, wheel loop (M1), 3× detail |

Tools: `$S/page.js` and `$S/harness.mjs` (Phaser harness; `seq=d0:d1:step` writes frame sequences),
`$S/tools/atl.py` (frame extraction), `consist.py` (consist composites and row-wise gaps), `points.py`, `edge.py`
(halo and outline statistics), `framediff.py` (move-frame periodicity, M1). `$S/tr2_check_rerun.json` is the builder's check, re-run.

## 6. Repro

```
S=/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v42art_train2_review
cd $S && nice -n 10 node harness.mjs \
  stop06="mode=stop&zoom=0.6&stage=2" stop10="mode=stop&zoom=1.0&stage=2" stop12="mode=stop&zoom=1.2&stage=2" \
  night10="mode=stop&zoom=1.0&stage=2&night=1" night10k="mode=stop&zoom=1.0&stage=2&night=1&wk=0.35" \
  run18="mode=run&zoom=0.6&stage=2&d=18&frame=2" town="mode=town&zoom=0.6&stage=2&d=20" \
  flip0="mode=stop&zoom=1.2&stage=2&flipfix=0&fx=3060&fy=1230" fb="mode=run&zoom=1.0&stage=1&d=60&fallback=1"
cd $S && nice -n 10 node harness.mjs seq2/eup06="mode=run&zoom=0.6&stage=2&vh=440&seq=0:40:0.8"   # loop frames
python3 $S/tools/consist.py && python3 $S/tools/points.py && python3 $S/tools/edge.py
python3 tools/blender/tr2_check.py      # from frost-village: 0 errors, 1 warning
```
