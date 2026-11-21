# Critique: fidelity and scope of 00_architecture.md and specs 01–07

Reviewer lens: will the Unity slice look and feel the same as the Phaser game on the designer's phone, is everything the
go/no-go test needs in a work package, are the spec numbers right, and does it fit in 2–3 weeks of AI work.
Phaser source checked read-only at `/home/user/nurient/frost-village` (v4.3.0-a3.2). Paths below are relative to that
folder unless they start with `specs/` (= this spec folder).

**Verdict.** The specs' numbers are very accurate. I re-derived about 30 of them from the code and every one matched
(see the appendix). The problems are elsewhere:

1. the schedule does not fit 2–3 weeks;
2. the old-save success criterion cannot be met with the chosen asset tiers;
3. the asset tiers and the font differ from what the Phaser game really shows on an Android phone;
4. the side-by-side comparison method is not defined well enough;
5. tap-to-walk on the ground has no rules for where he walks or what the screen shows;
6. there is no reference that a machine can check (a dump of what Phaser draws, or a tick-by-tick trace).

Count: 2 BLOCKER, 7 MAJOR, 7 MINOR.

---

## Findings

### 1. BLOCKER — The plan does not fit 2–3 weeks, and its own estimate already says so

**Problem.** §8 adds up to ≈ 24 Claude-days single-track (WP-0 1–2, WP-1 1, WP-2 2, WP-3 2, WP-4 3, WP-5 1.5, WP-6 3,
WP-7 1, WP-8 3, WP-9 2.5, WP-10 2, WP-11 1.5), ±50 %. Several packages are underestimated compared with the class
lists they contain:

* WP-4 ("3 d") covers all of 02 §11: shore strip meshes, the foam UV strip, zone floors with an erf-LUT halo, dashed
  outlines, the road-mask baker with a Gaussian blur, fog walls with scroll and puffs, snowfall, about 300 props, the
  deck/grill/stall views and the colliders. It also has a look-review loop with the designer.
* WP-6 ("3 d") has about 25 Core classes (Scheduler, Easing, ItemStack, Flights, FramePlayer, Collision, Roads, BinaryHeap
  A*, grid A*, MoveAgent, FreeSpot, GoalWalk, Resident with 6 jobs, Bubbles, CarryPill, Halo) plus 5 views.
* WP-8 ("3 d") has 15 Core loop classes, the bot, 5 world views, 7 HUD classes and audio.
* WP-9 ("2.5 d") has the MIGRATE chain, Sanitize (07 §7 plus the Appendix A pass-through), Remap43, Check43, Check43b,
  transfer decode, 33 fixtures and 3 UI panels.

None of these estimates includes Unity batchmode overhead or waiting for people. That overhead is: the first import
takes minutes, each PlayMode run and each APK build takes several minutes, the editor lock forces a worktree (§9.4),
and the designer has to be available for the Ph checks.

**Evidence.** `specs/00_architecture.md` §8 (lines 665–870) and line 884: "≈ 23 Claude days … longer than the Korean
plan's 2–3 weeks". The K20 risk only says "Track C in parallel".

**Realistic estimate (Claude-days).**

| WP | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Plan | 1.5 | 1 | 2 | 2 | 3 | 1.5 | 3 | 1 | 3 | 2.5 | 2 | 1.5 | ≈ 24 |
| Realistic | 2 | 1 | 2.5 | 2.5 | 5 | 2 | 5 | 1.5 | 5 | 4 | 3.5 (+2 for #2) | 2 | ≈ 36–38 |

Running Track C in parallel takes ≈ 9–10 days of Core work off the main line. The Unity critical path is still
≈ 26–28 days, about 5–6 calendar weeks.

**Fix.** Before WP-0, ask the designer to choose one of these:

* **(A) Split the milestone.**
  * M1a = go/no-go items 1–5 (new game, look, movement, residents, loop, save/load of the slice's own saves).
  * M1b = item 6 (old village), together with the transfer/Remap43/Check43 half of WP-9 and all of WP-10.
  * This takes about 6 days off M1a.
* **(B) Keep one milestone and cut these items** (≈ 6–7 days saved):
  * halo, carry pill and emote bubbles (04 SLICE-opt);
  * clerk and cook walking (place them at their posts);
  * the auto preset pick, step-down watcher, perf overlay and JNI device facts (use one fixed preset: 60 fps,
    render scale from a fixed k);
  * running the Core tests in two places (keep dotnet for Core and EditMode only for Unity-side tests; the
    GitHub Actions run comes later);
  * Check43/Check43b (keep the golden-output tests instead);
  * the in-app fixture list (keep the editor menu);
  * GoalWalk detour and side-step (keep the route and the 7 s give-up).
* **In both cases:** re-baseline the plan to 5–6 weeks single-track, or about 4 weeks with two Claude sessions (Track C
  plus Track U). Tell the designer this in the first message, not at the end.

### 2. BLOCKER — "An existing v4.x save shows its layout" cannot pass with Tier A + B art, and §5 states a wrong fact about Phaser

**Problem 1: the buildings.** Almost every real v4.x save contains buildings whose art is in Tier C, so the slice draws
placeholders for them:

* the rail `station`, `town_hall`, `big_restaurant`, `chief_office`, `bank42`, `depot42`;
* `town_hall` sits on `w_hall` (180, 760) and `chief_office` on the `v42_office` plot, both next to the plaza;
* the rail strip's rails and streets, which the slice draws as plain snow;
* the town region, which is open land with nothing on it.

**Problem 2: the residents.** A key with no art is skipped (04 §13.1). The S-3 fixture has 26 residents ("주민 26명")
and only 4 of them have Tier A/B art.

**Problem 3: §5 is wrong about Phaser.** Phaser does not show placeholders for these buildings. It fetches their real
art on demand, so a placeholder is only visible for a few seconds while the file loads.

**Problem 4: the test fixture hides the problem.** `v4202_25min` is the easy case: no hall, no restaurant, no office,
and its station is outside the village overview frame. The designer's own save (S-3 allows "the designer's own code")
will very likely include them.

**Evidence.**
* `specs/00_architecture.md` lines 623–625: "Anything a v4.x save references beyond Tier B (town hall, office, bank,
  depot) shows a placeholder, exactly as in Phaser." The code does the opposite:
  * `src/entities/OfficeBuilding.js:96` `Assets.loadFragment(gs, 'office', …, () => this.build())`;
  * `src/entities/BankBuilding42.js:31`;
  * `src/entities/DepotBuilding.js:40`;
  * `src/entities/TownHall.js:13` ("a stand-in until it arrives").
* Fixture census of the 27 `tools/test/fixtures/v4*.json`:

  | Opened or built | Fixtures (of 27) |
  |---|---|
  | `rail` region open, `firstTrain` set | 26 |
  | `station` | 26 |
  | `town` region open | 23 |
  | `big_restaurant` | 21 |
  | `town_hall` | 17 |
  | `chief_office` | 11 |
  | `bank42`, `depot42` | 9 |

* `specs/03_buildings_depth.md` §5.10 marks "closed exterior SLICE (layout)" for town_hall, big_restaurant,
  chief_office, bank42 and depot42. But `specs/05_assets_formats.md` §16.3 leaves their art out of Tier B (it is in the
  Tier C list, line 686). The two specs contradict each other.
* The S-3 pass condition says "the village matches the WebView app's" (`specs/07_save.md` line 937;
  `00_architecture.md` WP-10, line 849).

**Fix.** Choose one before WP-10, and write it into the J11 row:

* **(a) Add a "static exteriors" set (≈ 2 days).**
  * Take the closed-exterior layers of station, town_hall, big_restaurant, chief_office, bank42 and depot42 from their
    late pages, in manifest `drawOrder`, with no interiors.
  * Load every `villagers`/`villagers2`/`villagers3` atlas, which also fixes #3 (ASTC 6×6 ≈ 20–25 MiB).
  * Bake the rail strip's and the town's ground (RoadPaint) to PNG overlays in WP-R. Use the existing stepper, hide
    every non-ground object through `window.__FV.scene`, and screenshot the region at zoom 1. Unity shows these overlays
    when `rail` or `town` is open.
* **(b) Agree with the designer now** that the old-village check means "footprints and positions". Draw Tier C
  buildings as labelled footprint diamonds. Accept that only 4 residents appear. Make the false sentence in §5 say this
  honestly.

Either way, add a fixture that has a hall, restaurant and office (for example `v43a3_late.json`) to the WP-10 tests.

### 3. MAJOR — Customers come from 3 looks in the slice but from about 25 looks in Phaser

**Problem.** Phaser picks each new customer's look from `villager_a/b/c` plus every villager atlas that has loaded:

* Right after a new game, Phaser background-loads all the `villagers*` atlases, residents first.
* By about the 3rd or 4th customer, the stall line shows npc_grandpa, npc_teen_girl, npc_postman, npc_guard and the
  others.

The slice loads only `char_villager_a/b/c` and three resident atlases, so its line repeats about 4 looks. The line at
the stall is the most watched place in the opening loop.

**Evidence.**
* The customer pool: `src/entities/Seller.js:201–203` (BASE_CUSTOMERS, NOT_CUSTOMER) and `:316–320` (`customerKeys()`:
  `for k of Assets.charKeys('villager') if (!NOT_CUSTOMER.test(k) && Assets.charReady(k) …) ks.push(k)`).
* The background loading:
  * `src/scenes/Game.js:424–445` (`loadDeferredAudio`, which calls `queueLazy` with the residents first);
  * `:451–479` (`lazyAllowed` has no rule for the villager fragments and falls through to `return true` at line 478);
  * `src/core/Assets.js:21` (LAZY_FRAGMENTS).
* The villager manifests define 17 + 12 + 6 `kind: "villager"` characters.
* The specs: `specs/06_opening_loop.md` §9.4 states the rule correctly ("every loaded villager* look"). But
  `specs/04_characters_nav.md` line 264 ("villager_a/b/c (customers)") and `specs/05_assets_formats.md` §16.1/§16.2
  ("Customers: villager_a/b/c") load only those.

**Fix.** Add the villager atlases to the boot set (Tier "A+", ASTC 6×6). Only `idle`, `walk`, `carry_walk` and `happy`
are needed, and they are already in the atlases. This is the same addition as #2(a), so it costs nothing extra if #2(a)
is chosen. If memory is tight, load 8 to 10 of them and list the difference in J8.

### 4. MAJOR — The resident cast differs from Phaser, and the work package contradicts the designer check

**Problem.** In Phaser a new game queues 4 people and the dog at t = 0. The slice has different numbers in different
places:

* 04 says all 4 people come.
* 05 says "the slice takes the first three".
* WP-6 says three people "+ pet_dog if time".
* J7 expects "2–3 people **and the dog**".

**Evidence.**
* `src/data/world.js:905` `start: ['npc_grandpa','npc_aunt','npc_kid_girl','npc_kid_prankster','pet_dog']`.
* `src/systems/VillageLife.js:228–245` (`queueMoveIn`, `instant` for a new game).
* `specs/04_characters_nav.md` §13.1, line 960; `specs/05_assets_formats.md` line 604.
* `specs/00_architecture.md` lines 789–791 (WP-6 content) and line 1053 (J7).

**Fix.**
* Make the cast exactly `moveIns.start`: put `villagers/vil_npc_kid_prankster.png` in Tier A; the dog's art is already in
  Tier B.
* Move `JobPet` (04 §13.8, about half a day) from "if time" to SLICE.
* Give the designer the K15 note: in Unity the residents appear at once; in Phaser they appear a few seconds late.

### 5. MAJOR — Nothing a machine can check against Phaser, although the Phaser repo already has the tool for it

**Problem.** "Same places, same draw order, same timings" is checked only against things the spec writers derived:

* `world_static.json` was built from `world.js` plus copied generator functions, not dumped from the running scene, and
  its generator was not kept (K1).
* The A1–A14 numbers come from reading the code.
* WP-R captures only screenshots, a video and the first-sale time.

A misread spec therefore passes its own tests. The Phaser repo already has a fixed-step driver that makes exact traces
cheap.

**Evidence.**
* `tools/test/fv_step.mjs` (puts the loop to sleep, calls `game.headlessStep(T, 1000/60)`, keeps `Date.now` in step,
  and exposes `window.__FV.scene`).
* `specs/02_world_ground.md` line 4.
* `specs/00_architecture.md` lines 866–870 (WP-R) and K1 (line 1022).

**Fix.** Make WP-R deliver three golden files, captured with the stepper. Pin `Math.random` to the constant 0.5 (the
Unity side uses an `IRandom` that returns 0.5 in the same mode) and use 저사양 off.

1. **`displaylist_newgame.json`.** At t = 0 and t = 5 s, dump `scene.children.list` in draw order: texture key, frame,
   x, y, depth, flipX, scaleX, scaleY, alpha, visible, and container children. A PlayMode test then compares Unity's
   `WorldViews` against it: same keys, positions within 0.5 px, and the same relative order for every overlapping pair.
   This test is the real proof of "same places, same draw order".
2. **`trace_loop.json`.** Drive `Input.override` from a scripted path (walk to the reel spot, wait, walk to the work
   spot, the output pad, the shelf, the register, then the till). Record per tick: chief x, y, dir, anim key and frame
   index, stack contents, grill timers and stacks, shelf, till value, coins, queue states and the camera target. The
   Core GameSim replays the same input and must match frame by frame within tolerances. This also covers the frame
   rates of the animations and the impact timing.
3. **`trace_resident.json`.** One resident's route from a fixed start point with pinned randomness. It checks
   `Roads.Route`, `MoveAgent` and LOD from end to end.

Run WP-R on day 1–2, because its outputs gate the checks in WP-4, WP-6 and WP-8.

### 6. MAJOR — The side-by-side comparison is defined against a Phaser setup the designer cannot reproduce, or one that looks and runs differently

**Problem 1: what 저사양 changes.** §10.2 and WP-4 say to compare "with the WebView app on 저사양". In Phaser, 저사양
changes much more than the sea:
* `maxK 1` (render scale 1);
* `texScale 0.5`: every atlas page is uploaded at half resolution;
* `groundLow`: ground tiles at half resolution;
* `fps 30`, with MSAA off and snowfall at 0.3×.

So the look pass would compare a sharp Unity build with a blurry Phaser one. If feel (J4, J5, J8) is judged in the same
session, it compares 30 fps Phaser with 60 fps Unity.

**Problem 2: the WebView app's state.** The app cannot take `?onboard=0&flagmaker=0`. On a new game it shows the Act 1
coach cards (camera views, fish cap, held banners) and the flag maker. Its saved zoom also carries over:
`Settings.zoom` lives outside the save, so 「처음부터」 does not reset it, and J1's "(985, 600) at zoom 1.2" fails unless
the designer never zoomed. Spec 06 L6 assumes the URL can be used; the architecture assumes the WebView app. The two
contradict each other.

**Problem 3: time of day in loaded saves.** In a loaded v4 save, Phaser runs the day/night clock with a night overlay.
The slice freezes it.

**Evidence.**
* `src/core/Perf.js:43` (`low: { maxK: 1, fps: 30, aa: false, water: 'static', snow: 0.3, …, groundLow: true,
  texScale: 0.5 … }`).
* `src/systems/Onboarding.js:33–44` (`onboardAllowed()` is true in the WebView) and `:148` (`skip()`).
* `src/scenes/Game.js:267, 270` (onboarding and the flag maker on every new village) and `:362–363` (saved zoom).
* `src/core/Save.js:1048, 1064–1065` (zoom is part of the settings record).
* `specs/06_opening_loop.md` L6; `specs/00_architecture.md` §10.2 (lines 1043–1058) and WP-4 Verify (line 769).

**Fix.** Write a comparison protocol into §10.2:

* **Look pass (J1–J3).** Use the Phaser play link in Chrome on the same phone with `?onboard=0&flagmaker=0`. Set
  설정 › 그래픽 › 저사양 for the old sea, using a fresh origin so the zoom is 1.2. Tell the designer in advance that
  Phaser will look softer (half-resolution art).
* **Feel pass (J4, J5, J8).** Use Phaser on the designer's usual preset at 60 fps and accept that the sea differs.
  Optionally, add a Unity debug toggle "Phaser 저사양처럼" that sets `targetFrameRate` to 30 and render scale to
  `1/devPerLogical`.
* **If the WebView app is used anyway:** press 「건너뛰기」 on the first coach card, close the flag maker, and clear the
  app data to reset the zoom.
* **Loaded villages:** compare during the day.

### 7. MAJOR — The font is not the one the Phaser game shows on Android

**Problem.** A10 and §4.6 choose Pretendard ExtraBold because it is first in the CSS font stack. But the game ships no
font file. On an Android phone the WebView falls back to the system Korean font: Noto Sans CJK KR on Pixel and AOSP
phones, usually with only Regular and Bold so weights 800 and 900 are drawn as Bold, and Samsung's One UI font on Galaxy
phones. Pretendard's geometric shapes and widths look different. J9 ("font weight and outline as in Phaser") would then
compare two different fonts. Spec 05 §11 even says the fallback happens and still recommends Pretendard.

**Evidence.**
* `tools/fonts/README.txt` lines 1–2: "no font file ships with the game".
* No `@font-face` in `index.html` (line 30 is only the CSS stack) or in `tools/build/build_artifact.mjs:99`.
* `src/data/strings.js:1428` (the FONT stack).
* `specs/05_assets_formats.md` §11, first bullet; `specs/00_architecture.md` A10 and §4.6.

**Fix.** In WP-0, find out the designer's phone model and take a screenshot of the Phaser HUD text on it. For parity,
use Noto Sans KR (OFL; Bold and Black from Google Fonts or `@fontsource/noto-sans-kr`) as the TMP font. Present
Pretendard as a separate design choice for the designer to approve. Decide before WP-8, because label widths and panel
sizes are tuned on whichever font is chosen.

### 8. MAJOR — Tap-to-walk on the ground (the designer's request, on by default) has no rules for its target or its feedback

**Problem.** A12 and §6 send a ground tap to `GoalWalk.Go` unchanged. GoalWalk was built for goal rows. Four things go
wrong when it is used for ground taps:

* **Targets inside things.** A tap on the stall, a pine or the hut puts the target inside a collider. The chief pushes
  into it, detours twice, and gives up after 7 s with 「길이 막혔어요」.
* **Toast spam.** Every walk toasts `g_walk` with `{place: row.name}` and `g_arrived` on arrival. A ground tap has no
  name (the test hook passes `'test'`), so the player gets two odd toasts per tap.
* **Re-tapping during a walk.** A tap that lasts more than 0.12 s first cancels the walk (`g_cancel` toast), then starts
  a new one. The result is three toasts.
* **Missing feedback.** There is no marker at the target and no rule for a tap on a pad.

**Evidence.**
* `src/systems/goals/GoalWalk.js:109, 145` (`say('g_walk', {place: row.name})`), `:177–185` (arrival, stuck, cancel and
  gone toasts), `:295` (`goTo` names the target `'test'`).
* `specs/01_core_view.md` §4.8 (HOLD_S 0.12, DROP_S 7).
* `specs/00_architecture.md` §6, line 639.

**Fix.** Add a "ground-tap mode" to the WP-5/WP-6 spec:

* **Target.**
  * A tap inside a pad's ellipse (shelf, register, till, grill pads, unlock pads) walks to that pad's centre.
  * Otherwise snap the target with `Collision.FreeSpot(x, y, 16, 120)`.
  * If it is off land, or no free spot is found, show the `g_noWay` toast only.
* **Feedback.** Make the walk quiet: no `g_walk`, `g_arrived` or `g_cancel` toasts. Show a small ring at the target that
  fades after arrival, using the existing pad pulse look.
* **Re-tapping.** A new tap during a walk re-targets with no cancel toast. Skip the 0.12 s hold-cancel when the finger
  is lifted within the tap limits.
* **Camera.** During the tutorial, keep the tutorial camera framing (Phaser has no ground walk at that point, so only
  the designer can judge it). Add a case to J6.

### 9. MINOR — Spec sections that A3 replaced still read as instructions, and three specs contradict each other

**Problem.** A3 (exact rank on one sorting layer) replaced these sections, but none of them is marked:

* 02 §10 (×8 orders per band and a custom-axis sort);
* 03 §9 options P2 and P3;
* 04 C5 and §15 (a SortingGroup per character, separate sorting layers GroundTop/Fly/Bubbles/Labels, and an order
  formula).

An engineer who works from 04 alone builds the wrong sorting system. There are also other contradictions:

* 03 §5.10 (exteriors in the slice) vs 05 Tier C (see #2);
* 04 §13.1 (4 people) vs 05 §16.1 ("first three") (see #4);
* 06 L6 (the onboard=0 URL) vs §10.2 (the WebView app) (see #6).

**Evidence.**
* `specs/04_characters_nav.md` lines 26 and 1222–1251; `specs/02_world_ground.md` §10.
* `specs/00_architecture.md` line 21 ("closes 02 Q1 / 03 Q1 / 04 C5") and line 499 ("This replaces 04 C5").

**Fix.** When the specs are copied into `Docs/PortSpecs` (WP-0), put a one-line banner "SUPERSEDED by 00 A3/§4.1" on
each of those sections. Fix the three contradictions in the specs themselves (00 wins).

### 10. MINOR — 04 §4.3 and C4 say Phaser flips about the anchor; it flips inside the frame box

**Problem.** The spec states the wrong rule. It does no harm today, because all 8 character manifests (characters,
villagers, villagers2, villagers3, pets2, workers, deck43, chief2) use anchor x = 0.5, where the two rules give the
same result. Any future character with an off-centre anchor would be wrong by `srcW·(1 − 2ax)`. 02 and 03 state the rule
correctly.

**Evidence.**
* `specs/04_characters_nav.md` line 25 and lines 185–186 vs `specs/03_buildings_depth.md` S4 and §2.3.
* `src/scenes/Game.js:573` ("a flipped picture is mirrored inside its frame box").
* The batchSprite flip offset `(−realWidth + 2·displayOriginX)` in `lib/phaser.min.js`.

**Fix.** Correct the text, and send character flips through `WorldImage` `flipShift` too (it is 0 when ax = 0.5).

### 11. MINOR — The stall's sheared name sign is in no work package

**Problem.** 「눈꽃 노점」 on the stage-1 stall's board is canvas text drawn at 3×, sheared to the board's slope
(`signQuad`) and drawn at depth y + 0.2. It is on screen in the first view. No WP file list creates it: ShopView has
no sign-text generator, and TMP has no built-in shear.

**Evidence.**
* `specs/03_buildings_depth.md` §4.7 ("sign board (canvas text, origin (0,0), scale 1/3, sheared)").
* `assets/market/manifest.json` `market_s1_back.signQuad` and `signText`.
* `src/entities/Seller.js:150` (`SIGN_S = 3`, the sign maker that follows).

**Fix.** Add a `SignText` to WP-4 or WP-8: TMP with a vertex modifier that applies the shear from `signQuad` (y drops
1 px for every 2 px of x), or an editor-baked PNG for each language. About 2 hours.

### 12. MINOR — The HUD and the post-first-sale re-skin differ from Phaser and are not listed as known differences

**Problem.** Phaser's HUD at a new game has more than the slice's coin bar, objective, zoom and settings:

* the whistle/dog-bar button bottom left;
* the population chip that `setCoins` re-places;
* the goal-window button and the v4.2 chips.

Also, after the first sale Phaser loads the `v42_core` page and re-skins the HUD icons and the chief's halo. The slice
keeps the stand-ins, and the architecture lists only the halo.

**Evidence.**
* `src/scenes/UI.js:234–242` (placePop population chip, setBtn, mapBtn, zoom buttons, whistleBtn and badge).
* `src/scenes/UIv42.js:1–20` (the v4.2 HUD list and the reskin note).
* `specs/00_architecture.md` §4.7 and §11 ("Halo art … informational").

**Fix.** Add inactive look-alike buttons (whistle and goal) that show a 「준비 중」 toast. Or list "HUD buttons missing,
icons do not re-skin after the first sale" next to J9, so the designer does not report them as bugs.

### 13. MINOR — What happens after the fisher stub is undefined; the next pads would appear with nothing behind them

**Problem.** The stub marks `hire_fisherman` done and ends the tutorial. Progression then shows the next rows, for
example `raw_grill` 70 and `porter_grill` 100 at (925, 745) and `zone_forest` 90. Paying them does nothing, because
their completion effects are LATER. The designer will keep playing past the loop and will report "pads don't work".
Phaser also seats a fisherman, upgrades the deck to tier 2 and shows the fish crate at this point; the slice shows none
of this.

**Evidence.**
* `specs/00_architecture.md` WP-8 rules, line 817.
* `specs/06_opening_loop.md` §11.1 and §17.
* `src/data/balance.js` costs `raw_grill` 70, `porter_grill` 100, `zone_forest` 90.

**Fix.** After the stub, show one banner 「여기까지가 시험판이에요」 and don't show any later pads (a `SliceEnd` flag in
SyncPads). Add this to the J8 notes.

### 14. MINOR — Small render-order details to pin down in the specs

**Problem 1: particles.** Phaser draws the particles of an emitter in emission order, so the newest is on top. A Unity
`ParticleSystemRenderer` defaults to `sortMode = None`, which does not guarantee that order.

**Problem 2: Culler tie order.** Phaser's Culler takes far props off the display list and puts them back, which
re-appends them. So Phaser's own order for equal-depth props can change at run time. Unity keeps creation order, which
is fine, but a #5 display-list test must not demand the tie order for props that were off screen.

**Evidence.**
* `specs/00_architecture.md` §4.1 table ("particles draw in emission order").
* `src/systems/Culler.js:17–25` (PARK_OUT and PARK_IN re-add).

**Fix.** Set `sortMode = YoungestInFront` on every emitter, or write a Core CPU emitter. Make the #5 comparison ignore
tie order for props of the `props` atlas that were more than 450 px off screen.

### 15. MINOR — Getting the APK onto the designer's phone is not planned

**Problem.** `ci.ps1 -Task install` assumes the designer's phone is plugged into the build PC by USB. The handoff says
the designer works from phone links, so builds must reach a phone that is not on the PC. Each iteration needs a way to
deliver the build. The Play upload key must not be used (A14).

**Evidence.**
* `specs/00_architecture.md` §9.1 (`install`, `adb`) and A14.
* `handoff/CLAUDE.md` ("휴대폰으로 바로 해볼 수 있는 플레이 링크").

**Fix.** Add `ci.ps1 -Task publish`. It uploads `SnowbloomSlice-<n>.apk` to an agreed private share (a GitHub release
asset of the private repo, or a Drive folder) and prints a Korean two-line install note ("출처를 알 수 없는 앱 설치
허용"). Add one human step to WP-0: the designer installs a hello-world APK this way.

### 16. MINOR — Track C's oracles depend on the spec writers' reading of the code

**Problem.** Track C is "verified with dotnet test", but its expectations (06 §19 A1–A14, the 04 §21 table) were derived
by reading the code. Only the routes goldens (04 §12.4) and the save goldens (07) were produced by running the JS.
Without #5, a whole Track C can be green and still behave differently from Phaser, for example in the order of updates
within one tick.

**Evidence.**
* `specs/06_opening_loop.md` §19.
* `specs/04_characters_nav.md` §21 vs §12.4 ("Golden outputs (Node, from the JS module …)").
* `specs/00_architecture.md` A15.

**Fix.** Make the #5 traces the oracle for WP-6a and WP-8a. Keep the spec tables as unit tests. Mark a Track C package
done only when the trace replay is green.

---

## Appendix A — Numbers checked against the code (all correct)

| Spec claim | Code |
|---|---|
| Camera: zoom 1.2, lerp 0.12, zoomMin 0.6, zoomMax 1.7, step 1.25, zoomSmooth 0.18; focus lerp 0.06; framing ±120/±260 and the clerk-pad blend over 240 px; fitZoom `min(vw/r.w, vh/(r.h+80))` | `balance.js:38–48`, `Game.js:2238–2276, 2307–2364` |
| Start camera on tutorialView (985, 600) when gdist < 500; −20 at start vs −30 per frame | `Game.js:372–377` |
| Overview new game 0.40 at (900, 1270) | `overviewRect`, `fitZoom` (start rect, `r.h/2 − 40`) |
| Phaser clamp sticks left/top | `clampX` in phaser.min.js (`max(bx, bx + w − dw)`) |
| Joystick 78, dead zone 8, full speed 58.5, keys replace stick, pinch `d0 = max(20, d)`, tap < 300 ms and < 16·k | `Input.js:9–139`, `UI.js:148–215` |
| Chief 255 px/s, vertical 0.74, accel `min(1, dt·16)`, timeScale `clamp(v/210, 0.6, 1.35)`, steps 0.27 starting at 0 | `balance.js:51–60`, `Player.js:18, 99–125` |
| Shadow `46·1.15 × 18·1.3` | `Character.js:37–39` |
| Pad `w = 90.5·sizeM`, `r = w/2·0.78`, iso gdist test | `Pad.js:10–25` |
| Unlock drain `max(12, cost/1.6)` after padDelay 0.5 | `UnlockPad.js:237–247` |
| Loop balance: grill 0.8 s with chief ×1.25; net max 6, refill 1.1; customers 2.0 / 10 / 1–3 / 0.2 / 120; pay 0.35 / 0.55; cash 48 / 0.03; autosave 5 | `balance.js:110–320, 717` |
| Animations: player walk 8/12, give 6/10 once impact 3; deck43 reel 6/10 once impact 3 and fish 6/10 loop impact 3 (NE only) | manifests `characters`, `deck43` |
| FramePlayer semantics: accumulator, several frames per update (`skipMissedFrames`), handleStart at play with delay 0 | phaser.min.js `AnimationState.update`, `startAnimation` |
| `Shore(1130) + 46 = 426.517` (the Float32 cache sampled every 8 px and interpolated, not the analytic 426.544) | `Collision.js:20–21, 195–199` |
| JsRng outputs for seeds 1234, 11 and 5 | `Placeholders.js:27`, re-run in Node |
| Z() for the grill (1004, 590) and the stall (1207, 782) | `world.js` ZONES, Iso constants |
| Stall occluder X 1274.0, Hw 194, Top 218.5, Big | `Game.js:609–614`, `market_s1_back` frameSize 388×328, anchor (0.32732, 0.70122) |
| Occlusion: 0.1 s decisions, three sample points, faded alpha 0.32, `min(1, dt·10)`, snap 0.02, worked-station and linked rules | `Occlusion.js:1–147` |
| Register and work-spot labels at y + 1990 | `Register.js:30`, `Labour.js:74` |
| Road passes 92/128.8 rim σ 11 at 0.30, 70/98 body σ 7, alpha 0.92 | `Ground.js:647–698` |
| New-game cast `moveIns.start` (5 keys) | `world.js:905` |
| Save v 8, lv 43 | `Save.js:45, 60` |
