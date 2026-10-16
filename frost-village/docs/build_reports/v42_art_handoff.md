# v4.2 art → CODE-2 handoff (polish results of every art job)

Each section is the polisher's final report; items marked for CODE-2 must be done when wiring the art.

## polish:v42_office

Every finding was handled: 15 fixed, L2 partly fixed and M6 left for the lead. The check now reports 0 errors and 0 warnings. The Phaser test exits 0 and draws the office with the game's own `src/entities/Cutaway.js`. Earlier test runs used the old pre-polish office; the final run used the repacked `assets/office`, and I looked at the previews and phone captures it produced.

| Finding | Result | Measured after |
|---|---|---|
| H1 Cutaway.js shows night glow by day, double shadow, inside layers while closed | fixed | The `cutaway` block was rewritten for Cutaway.js: the glow only draws at night while closed, and the floor's outer edge and open shadow moved into the stub layer. The closed look differs from shell + props by **0 px**, in both the Phaser pixel test and the check (before: 25,400 px). |
| H2 door frame cuts across 소복이's face | fixed | The door frame is now two short posts with no lintel, and desk 2 is 0.28 m shorter. Probing found two more hidden heads, so the secretary desk and counting table moved into the stub layer and their sitters into band `front` (new `deskBands` field). Head boxes are 0 % covered for all 13 people and spots. |
| M1 bench crowded | fixed | Bench moved 0.5 m into the corner, plant removed from the leg space; seats 0.71 m apart, leg space clear. |
| M2 chief's pad behind the bench | fixed | Pad moved; it is at least 0.35 m from tall furniture. |
| M3 safe spot inside a wall circle | fixed | 11 new wall circles. Every standing spot and the door path clear the 16 px player radius (safe spot: 25 px); walls are closed except the doorway. |
| M4 mailbox flag does not read | fixed | The raised flag rises 13 px above the lowered one. |
| M5 safe half hidden, open safe shows nothing inside | fixed | Hollow safe with coins and gold bars, on a 0.32 m plinth. The wall stub covers 18 % of the door (was 70 %); 229 gold px show when open. |
| M6 one atlas page keeps the inside loaded | won't fix (needs the lead) | The contract names one `office_bld` page and other jobs load it that way. The manifest now carries a `pageSplit` recipe (closed 2.20 MiB, inside 2.55 MiB). Until it is applied, the plan's memory table has to book the whole 4.61 MiB page. |
| L1 crowded work spots | fixed | All busy pairs at least 0.75 m apart; the tightest is board–safe at 0.75 m. |
| L2 animated parts very small | partly fixed | 셈이's typewriter and lamp re-spaced (342 px visible, was 275). The stove fire and key motions stay small (won't fix). |
| L3 coin sacks too alike | fixed | Widths 26 / 34 / 48 px, and the large sack spills coins. |
| L4 `reveal.states` naming | fixed | States are `closed` / `open` (default) / `bare`, with `cut` kept as an alias. |
| L5 outside-prop depth rule ambiguous | fixed | Rule is now `max(world y, building depth + top)`. |
| L6 sign tiny, ghost text in cut view | fixed | Sign area 104 × 28 px (was 83 × 25); text hidden while the shell alpha is below 0.5. |
| L7 previews use stand-ins | fixed | All previews use the real officefolk staff and chief2. |
| L8 inside staff have no shadow | fixed on the art side | `insideShadowDepthOffset` −0.449 is in the manifest; `Character.js` still draws shadows under the floor, which is CODE-2's change. |
| L9 muddy `half` state | fixed | `half` dropped. |

The build report `/home/user/nurient/frost-village/docs/build_reports/v42_office.md` now has these after-polish numbers:
- **Files:** 5 files, 241,073 bytes. `office_bld` is 1120 × 1080 and 4.61 MiB (was 968 × 1352, 4.99 MiB; budget 5.5). `office_items` is 104 × 112.
- **Frame:** 634 × 512, anchor (272, 319), 23 sprites.
- **Phaser test:** 66 frames, 0 missing, 8 anims, reveal toggle passes, phone captures at zoom 0.6, 1.0 and 1.2 plus two night shots.

Other changes:
- **Re-renders:** only the changed passes were re-rendered, plus the mailbox and items, using the cache in `/tmp/fv_cache/office`.
- **Packer fix (`keep_opaque`):** the colour reduction was making some fully opaque shell pixels slightly see-through, which let the floor show through. Opaque pixels now stay opaque.
- **Phaser test:** it accepts `OFFICE_DIR=<dir>` to test a candidate pack instead of `assets/office`.
- **Before/after sheet:** `assets/office` was not in git, so `off_compare.py` compares against a copy of the pre-polish set I saved before repacking. That copy lives in the scratchpad and is passed with `--before`.

Files are in /home/user/nurient/frost-village:
- assets/office/
- docs/build_reports/v42_office.md
- docs/previews/off_polish_before_after.png
- docs/previews/off_office_states.png
- docs/previews/off_phone_z06.png
- docs/previews/off_phone_z10.png
- docs/previews/off_phone_z12.png
- docs/previews/off_phone_night.png
- docs/previews/off_phone_night_open.png
- tools/blender/off_assets.py
- tools/blender/off_render.py
- tools/blender/off_pack.py
- tools/blender/off_check.py
- tools/blender/off_preview.py
- tools/blender/off_compare.py
- tools/test/office_phaser.mjs

Pre-polish copy: /tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v42art_office_polish/before_assets

## polish:v42_chief2

I fixed the high finding, three of the four mediums and five of the lows inside the chief2 paths. M4 (props on the office desk) can only be fixed in the office art. `ch2_check.py` reports 0 errors and the Phaser 3.90 test passes. Only 34 frames were re-rendered: cheer (18), wave SE and E (12) and warm_hands S (4). The other 182 cached frames were reused unchanged, and `assets/characters` still matches its sha256 baseline (44/44).

## Finding by finding
- **H1, cheer looks like wave: fixed.**
  - The chief now holds a small teal 서리마을 pennant (cream snowflake, birch stick, brass knob, no text) up in his right fist. The flag flies above shoulder height: beside his head in S/SE/SW, in front of him in E/W.
  - The hop is now 9 px (was 5), and the left hand does an "아자" fist pump.
  - The contract asks for one mitten overhead. The short chibi arm can't reach over the big head, so the pennant gives the overhead read. This adds a prop the contract didn't list: if you'd rather not have it, the same pose without the prop takes about 20 s to re-render.
- **M1, mitten in front of the face in wave/cheer E/W and wave SE: fixed.**
  - In SE/SW the mitten waves up and out past the edge of the head.
  - In E/W he reaches forward toward the train, with the mitten clear of his face, and turns his head a little toward the camera.
  - Wave S is unchanged.
- **M2, `sit_read` snaps shut on a plain loop: fixed.** I added two alias anims, `sit_read_in` (frames 0–1, plays once) and `sit_read_loop` (frames 2–5, loops). They reuse the same atlas rectangles, so they cost no texture memory, and the existing `buildCharacter` builds them with no code change. The manifest no longer suggests looping all 6 frames.
- **M3, no seat for the 22:00 doze by the stove: fixed by placement.** The manifest now says he dozes on the desk chair (`chiefDeskPoint`), never at `stovePoint`. The stove part of the routine is `warm_hands` standing at `stovePoint`.
- **M4, blue box and lamp on the chief's desk: won't fix here.** It needs a change to the office art. The request for the office job is to keep a 0.5 × 0.35 m area in front of `chiefDeskPoint` clear. The office files as of 20:33 still have both props there.
- **L1, warm_hands S looks like clasped hands: fixed.** The mittens are now spread at chest height, palms out, with a small rub.
- **L2, cheer feet sink and shuffle: fixed.** The crouch frames keep the idle stance and ground row exactly, and the check now enforces this for every standing frame.
- **L3, loop pacing: fixed with hints.** The manifest suggests a 600 ms pause between cheer hops (`repeatDelay`) and a 1600 ms hold on the deepest doze nod (`frameHold`). The Phaser test confirms both work.
- **L4, one `headTop` for all standing anims: fixed.** There are now per-anim values (talk −82, wave −85, cheer −93) and `cheer.propTop` −96 for the pennant.
- **L5, desk overlay doubles its edge: fixed.** The overlay is now clipped to the desk side of the desk edge, with a 2 px margin. Side effect in the real office: the desk lamp (and a few pixels of the blue box) is now drawn in front of his right forearm instead of behind the paper. That is the correct depth, and it makes M4 a little more visible.
- **L6, dangling seated legs: won't fix.** The legs can't reach the floor, and the townsfolk sit the same way.
- **L7, mirrored handedness: won't fix.** It's the house style.
- **L8, integration notes: addressed in the report,** plus a new zoom-1.6 phone capture.

## Report summary (`docs/build_reports/v42_chief2.md`)
- **Files:** still 3 files, 382,985 B in total. The sheet is 544 × 1492, using 3.10 MiB of texture memory (budget 3.5; it was 2.94). Repacking gives byte-identical files.
- **Checks:** `ch2_check.py` has new rules for every fix above. Run against the old files it reports 40 errors, so it does catch the problems.
- **Phaser 3.90 test:** 101 anims and 582 frames checked, 0 missing, 0 page errors, 0 failed file loads, all 65 sprites playing.
- **Phone size:** the chief is 26, 43, 52 and 69 CSS px tall at zoom 0.6, 1.0, 1.2 and 1.6. The pennant can still be seen at 0.6, about 6 × 3.5 CSS px.
- **For CODE-2:** the report lists what the game code needs. The new anims only show if frame lookup in `buildCharacter` and `Character.play` uses `a.atlas || def.atlas`. The pacing hints can be passed straight through to Phaser. The desk overlay and the 22:00 routine have short instructions, and the report says which seats to offer him.
- **Known issues:**
  - the pennant is an added prop;
  - the E/W wave is a forward reach, not a hand beside the head;
  - the office desk props (M4);
  - the legs dangle on seats;
  - `headTopSit` is −67 rather than about −62.

Previews are in `docs/previews/`; start with `chief2_polish_before_after.png`. New this round are that file, `chief2_office_close.png` and `chief2_phone_z16.png`, and the other `chief2_*` previews and GIFs were regenerated with the new pacing. The tools changed are the `ch2_*.py` scripts in `tools/blender/` and `tools/test/chief2_phaser.mjs`. The pre-polish files are backed up in `/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v42art_chief2_polish`.

Files are in /home/user/nurient/frost-village:
- `assets/chief2/char_player_b.png`
- `assets/chief2/char_player_b.json`
- `assets/chief2/manifest.json`
- `docs/build_reports/v42_chief2.md`
- `docs/previews/chief2_polish_before_after.png`

## polish:v42_officefolk

The officefolk polish is finished: all three high findings are fixed on the officefolk side, five of the seven mediums are fully fixed and two partly, and seven of the ten lows are fixed or reported. Every gate is green. Two of the high fixes still need a line each from CODE-2 before the game shows them (H1 and H3).

The earlier attempt had already done the fixes, re-renders, pack, check, parity and previews; it stopped during the Phaser test when the container restarted. I re-ran the Phaser test (6/6 runs pass), re-ran the critic's probes, looked at the previews, and rewrote the build report.

## Finding → status

**High**
- **H1 (the game can't draw officefolk): fixed.** The set now ships `installOfficefolkRuntime(TF)` in `tools/officefolk_compose.js`. It replaces the game's `TF.layersInto` and adds the 은행장's forced blazer to `TF.person`.
  - Against the real `src/core/Townfolk.js` with this installed, 2000/2000 draw lists match, office anims included; the manager gets his blazer 62/62.
  - The critic's probe now draws every layer in 11/11 cases (before: floating heads).
  - CODE-2 still has to add the one install call after `TF.init`.
- **H2 (coins fly onto the courier's hat): fixed.** The scoop point now sits at the open sack mouth. A new check confirms every hand, stamp, sack and pointer point lies on its item: 308/308.
- **H3 (tellers hidden under the bank counter): fixed on our side.**
  - The tellers now stamp at a higher counter (0.56 m; elders 0.45 m) with a bigger stamp.
  - The manifest carries the counter height measured from the civic bank (50 px) and how far to lift each teller (adults 27 px, elders 32 px). Lifted, the stamp lands at 52 px and the hands at 56 px, above the counter.
  - Still open: CODE-2 must draw the tellers lifted, and the civic owner should fix the bank glass, which still veils their faces a little.

**Medium**
- **M1 (staff lose their acts on the plaza): partly fixed.**
  - The aide's note frames moved to the always-loaded plaza page, so she takes notes there now.
  - Wave and happy were rendered for the extra parts, so all 8 staff can wave and be happy (40/40 each; before, 6 of 8 couldn't).
  - Not fixed: on the plaza the courier's scoop still plays happy and the aide's hand-over plays talk. Their frames would add 0.27 + 0.13 MiB to a page already at 1.46 of its 1.5 MiB limit. If you want the real scoop at plaza pads, the lead has to load the errand page there or raise the limit.
- **M2 (manager marches in place without his blazer): fixed.** He now stands idle in shirt and tie on the plaza; the blazer stays on the bank/office page.
- **M3 (no valid seat for the 은행장): fixed.** The manifest now seats him at the bank's manager point, raised by the seat height. The plan's §6.4 still names the wrong point; the lead should correct it.
- **M4 (pointer misses the office board): fixed.** The facing-NE pose was redone; the tip now lands inside the board on all 6 frames, and a new check reads the office manifest to keep it there.
- **M5 (sack unreadable from the front): mostly fixed.** The sack hangs out beside the right shoulder with a coin emblem toward the camera; walking toward the camera, his fist rests on the shoulder instead of looking like a wave. Three sack sizes: won't fix, because the sack page is at its limit; the coin hops and the sacks flown at the counter show the value.
- **M6 (invisible bow tie): fixed.** A new bow-tie part replaces the old bow on the two teller presets (burgundy/red on the green vest, navy/gold on the burgundy one), and the aide's ivory bow colour was dropped.
- **M7 (bow and scoop snap): fixed.** An in-between pose was added; head steps are now 6 px instead of 12–13, and the scoop dip is held 2 frames. A check keeps steps at 8 px or less.

**Low**
- **L1 (props too small): fixed.** Receiver 1.45×, stamp 1.4×, bell pin 1.85×.
- **L2 (arms over long hair): won't fix.** It needs a per-frame arm/hair ordering and a re-render of every acting anim; only visible from zoom 1.2.
- **L3 (holes in seated shoes): won't fix.** It comes from the townfolk shoe itself and the desks cover the feet. I tried an automatic fill, but it would also fill the real gap between the legs; the proper fix is a sock layer in the townfolk shoe part.
- **L4 (courier feet slide at speed 150): fixed in the recipe.** The game should play the walk at `timeScale = clamp(speed / groundSpeed, 0.8, 1.8)`; the speed itself is CODE's setting.
- **L5 (heads look forward, not down): won't fix.** That is the v4.2 design; heads look down again once townfolk2 loads.
- **L6 (undeclared head-pose deviation): fixed.** Now listed under deviations in the report.
- **L7 (office view memory): reported.** The four pages are 12.21 MiB in the office/bank views, against the plan's estimate of about 8. The lead should re-measure the ≤ 345 gate.
- **L8 (manager looks like a grey ball): fixed.** Moustache only, no full beard.
- **L9 (courier and depot worker look alike): fixed.** The depot worker's beanie is never yellow now.
- **L10 (elder hand_over NE): documented.**
- **Office desk cutting a head (seen in passing):** belongs to the office set, not this one.

## Updated report summary (`docs/build_reports/v42_officefolk.md`)
- **Checks:** 0 errors and 0 warnings in both merges.
- **Parity:** Python vs JS 2000/2000 in both merges; JS generator 0 fails over 640 preset and 3000 random people.
- **Phaser** (390×844 @ DPR 3, zoom 0.6 / 1.0 / 1.2, plaza, bank, all fragments): 6/6 runs, 0 missing frames, 0 errors, 0 404s, 1–2 draw calls and 14–24 texture binds per frame.

| Page | Size | MiB (limit) |
|---|---|---|
| desk | 840×1304 | 4.18 (6) |
| work | 1000×808 | 3.08 (4) |
| errand | 680×1348 | 3.50 (4) |
| sack | 936×408 | 1.46 (1.5) |
| **total** | 9 files, 1.57 MB payload | **12.21** (was 11.55) |

- **New in the manifest:** the per-person page routing, the bank counter heights and lifts, and the office and bank seat placements, all listed in the report.
- **Contract deviations:** 12 parts instead of 11 (the bow tie, needs a one-line contract note); facing-NE/N head pose `loco` instead of `soc` (no such head frames exist); the aide's note frames live on the plaza page.

Previews regenerated and all looked at, including new ones for this pass: `officefolk_points.png` (every point on its frames), `officefolk_bank.png/.gif`, `officefolk_before_after.png` and `officefolk_phone_bank.png`.

Files are in `/home/user/nurient/frost-village`:
- `docs/build_reports/v42_officefolk.md`
- `tools/officefolk_compose.js`
- `assets/officefolk/manifest.json`
- `docs/previews/officefolk_*`

## polish:v42_train2

The train2 polish pass is finished. Both highs and four of the five mediums are fixed in this set; M3's remaining part and M4 need changes outside my paths. Of the lows, five are fixed and L3 and L6 stay as they are. The check gives 0 errors and 2 warnings, the final Phaser run exited 0 with no errors, and the previews are re-rendered and I looked at them.

On resume, all the fixes were already on disk. The last Phaser run had been killed after the water tower hints moved, so two of the three loop GIFs and the result JSON still showed the old tower spot. I re-ran the check and the full Phaser test, looked at the new captures and GIFs, and replaced the `PHASER_RESULTS` placeholder in the report with the real numbers.

**Findings**

| Finding | Result | What changed |
|---|---|---|
| H1 texture budget at the station | fixed in the art | `train2_rails` now holds only the two loop decals (1.71 MiB) and is marked bake-only, so the game can release it after baking. The fence, switch stand and water tower moved onto the flat car's page. The tower's `pour` is 6 small overlays over one `pourBase` frame. Pages kept: coach 4.43, box car 4.75, flat car with props 3.14 MiB, all under budget. The `pack_pages.py` rule is CODE-2's file; the exact rule is written in `manifest.build.pageRule`. |
| H2 water tower hides the train | fixed | The tower hint moved behind each loop on the sea side: L(−8.0, 4.3) at ours and L(38.5, 4.3) at town. No car is ever drawn behind it. It is 0.70 cell from the ballast and 63 / 77 px on land. Confirmed in the check, the Phaser test and all three GIFs. |
| M1 wheels repeat every 4 frames | fixed (re-render) | Every wheel has a 1-fold cream spoke and bolt, each axle at its own phase, and the body rocks once per 8-frame loop. Frame k vs k+4 now differs by 1.3–3.4 levels (was 0.03–0.27), so the 4 frames kept on curves roll one way. The check fails any direction that repeats. |
| M2 night glows blow out the windows | fixed | `windowPoints` lists only the 4 side windows; the end-door windows moved to a separate list that is not lit. `lampPoints` lists only lamps the camera can see. New `nightGlow` values: windows 0.35, lamps 0.5, flat car lamps 0.35 in red. |
| M3 town loop at the map edge | partly fixed; the rest won't fix here | The decal is clipped at x 6144. A car rounding the loop tip still reaches x 6176, which needs the loop moved in the plan / `world.js`. The check warns about it. |
| M4 engine–coach gap, mirrored engine offset | won't fix here | The cause is in `Rail.js` / `Train.js`. The data CODE-2 needs is in the manifest (`couplerOverride` 1.375 m, `engineFlip`). |
| M5 cars fold on loop curves | won't fix in the art | The fix is CODE-2 placement code. The recipe is in `trainConsist.curvePlacement`, the test harness uses it, and `tr2_loop_curve_cmp.png` compares it with today's placement. |
| L1 curved rails duller | fixed (re-render) | The curves get the straight rails' bright rail-top line and the ballast tone was matched; the colour step at joint A dropped to 2.4 / 3.9 levels. |
| L2 coupler-gap definition | fixed (documented) | The report gives both definitions with numbers. |
| L3 along-track length under 45 CSS px | won't fix | The contract's lengths fix it at 42.8 / 39.5 CSS px whatever the art does; it is a contract-wording item. |
| L4 `headTop` sits on the roof | fixed | New `labelTopDir` per direction, 6 px above the drawn silhouette. |
| L5 switch stand in the 역 가는 길 band | fixed | Hint moved onto the fence line, L(−1.2, −0.75), with `blockM` 0.3 so walkers keep off it. |
| L6 switch-stand frame names | no change | The critic accepted the namespaced names. |
| L7 nits | fixed | The box-car door now opens from just ajar, crates fill the doorway, and the flat car's rope coil lies flat. The pinecone pictogram stays small on purpose. |

**Report summary (`docs/build_reports/v42_train2.md`, after polish)**
- **Files:** 9 in `assets/train2`, 1.89 MB on disk. The atlases total 18.29 MiB uncompressed (was 19.52).
- **Station view, train in:** 19.32 MiB (the critic measured 23.5). That is still 1.6 MiB over the plan's gate, because CODE-1's engine page is 7.0 MiB against the plan's 4.6. This set's own share is 12.32 MiB, under its 13.0 estimate.
- **Check:** 0 errors, 2 warnings, both outside this set: the town engine's 0.25 m overhang at the first coupling, and the town loop tip at x 6176.
- **Phaser 3.90 test:** phone 390×844 at DPR 3, zoom 0.6 / 1.0 / 1.2 / 1.6, day and night. 0 page errors, 0 404s, 0 missing frames. 49 textures, 33 anims, 182 frames checked. Mirrored cars land exactly on the track, cars follow the game's rail path within 0.63 px, and the tower spots pass. 11 phone captures, the curve comparison and 3 loop GIFs.
- **Previews:** the car sheet, loops, phone captures and loop GIFs show four distinct cars at 0.6, the tower behind the train on both loops, and warm night windows with the passengers visible.
- **Known issues left:** the engine page size (CODE-1), the town loop position (plan), the CODE-2 integration items, and 318 / 278 decal pixels the tiles keep inside the turnouts.

Everything is in `/home/user/nurient/frost-village`:
- `assets/train2/`
- `tools/blender/tr2_cars.py`, `tr2_rails.py`, `tr2_render.py`, `tr2_pack.py`, `tr2_check.py`, `tr2_previews.py`
- `tools/test/train2_phaser.mjs`
- `docs/previews/tr2_*`
- `docs/build_reports/v42_train2.md`

The Phaser result JSON is at `/tmp/fv_cache/train2/phaser/train2_phaser.json`.

## polish:v42_fx_ui_audio

All 19 findings were handled: the high, all 6 mediums and 8 lows are fixed (one medium only as far as the contract allows), 2 lows are won't-fix and 1 is outside my paths. The checks pass. `gen_chief_fx --check` gives 0 errors and 1 warning (the page is 2.44 MiB against the contract's "≈ 2"); `gen_ui5 --check` and `check_audio7` give 0 errors and 0 warnings. The Phaser 3.90 test reports 0 problems across all phone captures (zoom 0.6 / 1.0 / 1.2 day and night, plus 1.6 by day). I re-ran the critic's own harness on the new art in my scratch folder: 0 page errors. Only my own paths changed. Caches are now per key, so this pass re-rendered 5 of 12 chief_fx keys, 6 of 27 ui5 items and 5 of 10 audio keys.

## Finding → result

| # | Result |
|---|---|
| **H1** 광채 veils villagers behind him | **Fixed.** `chief_glow_back` now hugs his body: the core sits behind head and torso, a soft gold rim fades out about 15 world px past his outline, nothing reaches the ground, and mint/lilac stay below 8 % alpha. Same contract frame (160×200, 8 frames). In the critic's crowd repro (night, zoom 1.0), pixels lifted by more than 8 levels fell from 6,134 to 1,072 and the maximum lift from 41 to 31. The texture fell from 0.53 to 0.18 MiB. The check now fails on any light more than 16 px outside his outline or below his feet. |
| **M1** hand-over gives missing-texture boxes | **Fixed (hand-over and test).** The Phaser test now loads the real `src/core/Assets.js`. It shows `add.image('chief_halo')` gives `__MISSING`, while `Assets.sprite` / `Assets.image` / `Assets.spriteAnim` resolve to `chief_fx` and play. The report and `conventions.codeUse` give CODE-2 the corrected recipe. |
| **M2** notch and chevron pile up | **Fixed in art.** New key `chief_halo_notch` (16 headings, a small gold gem on the ring, same atlas, no extra file). Placement rules for CODE-2: chevron at `max(56, rx + 36)`, dots hidden within `max(90, ahead + 30)`. |
| **M3** edge badge | **Fixed.** A gold arrowhead 16.4 × 27 px (about 8 × 13 CSS px, was about 3 × 7). Its light no longer turns with the badge. The metres label goes on the side away from the arrow. It is still one frame, so CODE-1's rotation keeps working. |
| **M4** page budget | **Fixed as far as the contract allows.** chief_fx went from 2.80 to 2.44 MiB; the contract's own frame counts block going lower. ui5 is 1.492 MiB (budget 1.5). `ui5 pagePlan` lists the panels (0.918 MiB) for the transient office page. With that split the plaza sum is 330.05 ≤ 331; without it, 331.05. |
| **M5** squeal is a swell | **Fixed.** It is now a steady loop of exactly 1.23 s, which is the slice plus the 30 ms the game keeps. So `sound.play({loop: true})` on the cut buffer is seamless. It never dips more than 12 dB (was 55 % of the time), and the Chromium seam is 0.02 at both 44.1 and 48 kHz. |
| **M6** office bed too loud | **Fixed.** Target −30.5 LUFS, delivered −32.4: 2.3 dB above `amb_bank` and 0.2 dB under the fire bed (it was −28.0, the loudest bed). Changing only `volume` (×1.68) gets back to the contract's −26. |
| L1 gold rays look like clock ticks | Fixed: soft, outline-free light streaks across the tube. |
| L2 ring dull at night | Won't fix in art: NORMAL art under the multiply overlay can't get brighter. Needs a code-side ADD copy or the DayClock light. |
| L3 chip turns to a lemon shape | Fixed in data: `minHeight 64` and "build at 64, scale uniformly"; the Phaser mock does this. |
| L4 thin icons | Fixed: route 0.30, play_tab 0.32, halo 0.34, cheer 0.37 coverage at 32 px. The mitten has a teal cuff and darker outline; the pony has a fuller head, forelock and harness. |
| L5 aurora spins too fast | Fixed: new `calm` anim at 5 fps (one turn in 2.4 s); the contract's `play` at 10 fps is kept. |
| L6 clock masked | Fixed: the tick is now the loudest high event in 18 of 24 seconds (was 5). |
| L7 glows touch the frame edge | Fixed: gold 29 → 18, marker 32 → 8, edge badge 18 → 9 (alpha /255). The halo's 14 is its contract rim. |
| L8 marker frames repeat | Fixed: 4 distinct frames (frame 0 is a rest frame with a star twinkle). |
| L9 letter ruling / badge name plate | Fixed in data: `ruling {firstLineY 86, lineGap 22}`, and the notes say to draw the badge name on `ui_chip` at a constant screen size. |
| L10 typewriter sounds wooden | Fixed: a bright type-bar tick was added (centroid 0.89 → 1.1–1.3 kHz). Nobody has listened in game yet. |
| L11 pin and badge are the same teal | Won't fix: the contract sets both colours; they already differ in shape and content. |
| L12 contract housekeeping | Not in my paths: the lead should amend §AL to `ui_icon_play_tab` and decide between no bob and the code's ±2 px pin bob. |

## Report summary (`docs/build_reports/v42_fx_ui_audio.md`)

- **chief_fx:** 728×880 page, 2.44 MiB, 83 frames, png 713 KB.
- **ui5:** 490×798 page, 1.492 MiB, 27 frames.
- **audio7:** 316,227 bytes.
- **Previews:** two new ones, `chief_fx_glow_behind.png` (glow on/off with villagers behind him) and `chief_fx_edge_badges.png` (8 headings); all others regenerated, and I looked at them.

Decisions for you or the lead:
- **Panel packing:** keeping the ui5 panels off the resident `v42_core` page is what puts the plaza under its gate.
- **Contract notes:** `chief_halo_notch` is an addition beyond §AG, and §AL needs `ui_icon_play_tab`.
- **Office level:** −30.5 LUFS was my choice over the contract's −26.
- **For CODE-2:** the chief only glows brighter at night if it adds him as a moving DayClock light; NORMAL art can't do it.
- **Listening:** the typewriter tick, the office balance and the squeal should each get one listen in game.

Files are in `/home/user/nurient/frost-village`:
- `docs/build_reports/v42_fx_ui_audio.md`
- `assets/chief_fx/`, `assets/ui5/`, `assets/audio7/`
- `tools/fx/gen_chief_fx.py`, `tools/fx/gen_ui5.py`
- `tools/audio/sfx7.py`, `tools/audio/build_audio7.py`, `tools/audio/check_audio7.py`
- `tools/test/chief_fx_phaser.mjs`
- `docs/previews/chief_fx_*`, `docs/previews/ui5_*`, `docs/previews/audio7_*`
