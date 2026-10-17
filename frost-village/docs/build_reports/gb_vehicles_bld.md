# gb_vehicles_bld build report (금방 van, hub layers, props, items)

Job `gb_vehicles_bld` of docs/CONTRACT_GEUMBANG.md section AO, **polished after the critique**
(`docs/build_reports/gb_vehicles_bld_critique.md`, verdict "polish": 2 high, 5 medium, 8 low). `assets/geumbang/`
holds the 금방 delivery van (8 headings: 2 rendered + mirrors, 4 corner frames, door and unload patches with their own
overlays), the 금방 roof signs, the logistics-centre layers (금방 and 서리 nameplates, a swaying 금방 banner, three
patches that repaint the old logistics mark for the 금방 hub), 4 props, 6 items and the sled pennant, in **2 atlases**:

| Page | Size | Decoded | Budget |
|---|---|---|---|
| `gb_van_0` | 1784 x 944 | 6.42 MiB | ≤ 2048 x 1024, ≤ 8 MiB |
| `gb_bld_0` | 616 x 864 | 2.03 MiB | ≤ 1024 x 1024, ≤ 2.5 MiB |
| total | | **8.45 MiB** (was 9.57) | ≤ 10.5 MiB |

The pages got smaller although they hold more (14 patch overlays, 3 hub patches): `gb_pack.py` now packs with its own
MaxRects packer (`pack_tight`, the smallest page over a sweep of widths) instead of the shelf packer.

The files are 5 sources and 3 shipped, matching the AS budget of 5 / 3:
- the 5 sources are 2 palette-quantized PNG pages, 2 atlas JSON files and `manifest.json`, **513,433 bytes
  (0.49 MiB)** in all;
- the 3 shipped files are the 2 pages and the manifest, because the atlas JSON is embedded at build time.

`gb_check.py` reports **0 errors and 0 warnings** with the new rules. Run against a copy of the pre-polish set
(`GB_DIR=<copy> python3 tools/blender/gb_check.py`) the same script reports 54 errors, among them every finding below.

`tools/test/geumbang_phaser.mjs` reports `geumbang_phaser: OK` (390 x 844 at DPR 3 and 360 x 640 at DPR 2, zoom 0.6 /
1.0 / 1.2 / 1.6, day and night):
- 124 frames found, 20 anims registered, 0 missing, no page errors, no 404s;
- the loop van showed all 8 headings;
- 6 real crew / resident dolls rode the vans;
- at zoom 0.6 the van mark is 14.75 CSS px (needs ≥ 12) and the roof sign 31.2 CSS px (needs ≥ 30);
- the sled-pennant mirror probe matched with 0.00 % mismatch at a 0 px shift for both SE / SW and NE / NW.

## Polish: finding → status

| # | Sev | Finding | Status |
|---|---|---|---|
| H1 | High | Rear-door porthole + handle float in `unload` (NE / NW mid-air, SE / SW "ears") | **fixed** |
| H2 | High | Patch draw order shreds a seated driver / ghosts the door | **fixed** |
| M1 | Medium | Banner "금방" lies on its side | **fixed** (cause differs: see below) |
| M2 | Medium | The 금방 hub still wears two winged-parcel emblems | **fixed** (+ the red-ribboned roof parcel) |
| M3 | Medium | English roof sign letters 6 px, never legible | **fixed** (11 px) |
| M4 | Medium | Pennant mirrors land ~50 px off the sled in SW / NW | **fixed** |
| M5 | Medium | `parcelPoints` SE / SW sit on the flank, no visibility flag | **fixed** |
| L1 | Low | Van gold duller than the brand gold | **fixed in part** (ΔE 11.3 → 8.9) |
| L2 | Low | Lockers at the navy cap, read blue + yellow | **fixed in part** (navy doors kept, contract) |
| L3 | Low | `gb_check.py` blind spots | **fixed** |
| L4 | Low | Glows on hidden headlights | **fixed** |
| L5 | Low | `gb_parcel_cat` stacking fields | **fixed** |
| L6 | Low | Report accuracy | **fixed** (this report) |
| L7 | Low | Wordmark set in Jua | **won't fix** here |
| L8 | Low | Night facade: 금방 name darkest on the lit facade | **fixed** (glow rule; no new frames) |

Before / after of every visual fix: `docs/previews/gb_polish_before_after.png`.

### H1 · rear-door parts (fixed)
- **Cause.** `gb_van.py` picked the leaf for each rear window and handle by reading `o.location.x` inside the loop over
  the two leaves. The R pass re-parented the R parts to the R hinge first, so in the L pass their x (now relative to
  that hinge) was positive and they were re-parented again, to the L hinge. All six parts rode the L leaf: the R leaf's
  porthole and handle swung about the wrong hinge.
- **Fix.** The side of every part is decided once, in body space, before any re-parenting (`side_of`). The van was
  re-rendered (all frames, see L1).
- **Checks.**
  - `gb_render.py` measures every rear part against its own leaf in every unload pose (`rearParts.maxOffLeafM` 0.01 m,
    no problems; stored in the manifest report).
  - `gb_check.py` composites every door / unload patch over `idle_<dir>_0` and fails on any detached island of 6 px
    or more. The new set has none; the old set fails with islands of 186 + 45 px (NE f2) and 208 + 48 px (NE f3).

### H2 · patch draw order (fixed)
The game draws a van as shadow, body, riders (+0.001, +0.0004 each), then `over_*` (+0.004). The patches now fit
that order:
1. **Each door / unload frame ships its own overlay**, `over_door_<dir>_<i>` / `over_unload_<dir>_<i>`, on the patch
   canvas. It is cut from occlusion masks rendered in that pose (the open driver door and its pillar in front of seat
   1; a rear leaf in front of a standing rider). It replaces `over_idle_<dir>_0` while the patch shows, so the closed
   door is never drawn over the open one.
2. **The patch goes under the riders.** `anims.door / unload` carry `patchDepth` 0.0005, `overlay`,
   `emptySeats` (`door`: [0], the driver steps out at `doorPoints[0]`; a seat-1 passenger stays) and `drawOrder`.
   `conventions.patches` says it in words.
3. **The unload patches are re-cut.** A pixel is kept only within 4 px of a real change (> 24) and never in the cab /
   rider zone (seat and seatsStand boxes + the rider-proxy silhouette), not even as collar. Unchanged cab pixels in
   the rider zone: 0 (was 747–757 in SE, 234–239 in NE). Door patches keep the whole changed area (they sit under
   the riders and their own overlay).
4. **The Phaser test draws real riders** (gb_driver and a resident composed with `tools/geumbangfolk_compose.py`) the
   VehicleSprite way, with the patch under them and the overlay switch. `docs/previews/gb_phaser_order.png` shows door
   f2 / unload f3 in SE, NE, SW and NW with driver and passenger, plus the dock van at zoom 1.6: the driver is whole,
   the passenger is never cut, there is no doubled door.
5. **`gb_check.py`** fails on a patch depth at or above the riders, a missing / misshaped overlay, `door` without
   seat 0 in `emptySeats`, or more than 3 unchanged cab pixels of an unload patch in the rider zone.

### M1 · banner (fixed; the cause is the wall, not a rotated print)
- **Reproduced in part.** The print was upright and stacked (금 above 방): the rendered navy text correlates 0.75 with
  the projected upright print against 0.45 / 0.47 for the rotated ones. What the critic saw is real on screen,
  though. The banner hangs on the -Y facade, a 0.7 m cloth is only ~32 px wide there, and the iso view drops every
  horizontal stroke 1 px per 2 px, so upright syllables read as a word turned on its side.
- **Fix.** `gb_tex.banner` draws the mark and the syllables on their own layer and de-shears it for the wall
  (`iso_wall_shear`, k = 0.408). On screen 금 and 방 now stand upright and level, and they are bigger (0.74 of the
  cloth width, the mark 0.66). The en banner (sparkles) is de-sheared the same way. The 8 sway frames were
  re-rendered.

### M2 · hub emblems (fixed)
Three re-render patches over `logistics_center_shell`, drawn with the 금방 hub only (the 서리 depot keeps the centre's
own mark):

| Key | What |
|---|---|
| `gb_emblem_gable` | the big gable disc above dock 2: the 금방이 mark (R 0.56 m) instead of the winged parcel |
| `gb_emblem_blade` | the corner blade sign: a 금방이 disc (R 0.45 m) covering the blue winged-parcel disc |
| `gb_roofparcel` | the giant parcel on the ridge: gold ribbons and bow instead of red |

- `gb_hub.py` renders each region twice in the shell pass, as shipped (`base_*`) and in 금방 dress, and `gb_pack.py`
  keeps only the changed pixels plus a 2 px collar. The wall where the old wings were is re-rendered too, so the
  patch lands pixel-exactly on the shell.
- `kind: patch`, `of: logistics_center`, `depthOffset` 0.0004, alpha = shell alpha.
- `gb_check.py` fails if any of them is missing or misplaced.

### M3 · English roof sign (fixed)
- The en board is now a stacked lockup: a smaller mark (0.40 m) and **GEUM / BANG** on two lines in Fredoka SemiBold
  (cap 0.192 m). The letter lines measure **11 / 11 px** (lit frame 10 / 11) against 6 px before: 6.0 CSS px at
  zoom 1.0 and 7.1 at 1.2. The ko sign is unchanged (19 px).
- SemiBold keeps the board's navy share at 12.3 %.
- `gb_check.py` measures every text line of every roof sign and fails under 10 px.

### M4 · pennant mirrors (fixed)
- Phaser 3 flips a frame about its **centre**, not its origin. A point (dx, dy) of a flipped sprite lands at
  (-dx + mirrorShiftPx, dy), with mirrorShiftPx = frameW - 2 · anchorX · frameW.
  - `dog_sled` +30, `gb_pennant` -20: 50 px between them.
  - `gb_van` -2 and `gb_van_turn` -4 (these are now manifest fields).
- **Fix.** `sledPennant` now ships explicit **SW and NW** tables (x = -x + 30 + 20; SE idle [-76, -83] → SW
  [126, -83]). The note says to use them as they are, without negating. `conventions.mirror` states the general
  rule; the roof-sign note gives `x - p[0] + mirrorShiftPx` for mirrored vans.
- **Why no re-pad.** The pennant art is 29–32 px wide with the stick at its right edge, so it cannot sit with the
  foot at x = 24 in the contract's 48 px frame.
- **Checks.**
  - `gb_check.py` recomputes the SW / NW tables from both frames.
  - The Phaser test has a mirror probe: still sleds and pennants in SE / SW and NE / NW on a flat backdrop, the SW
    (NW) window flipped and compared with SE (NE) on the screenshot. Result: 0.00 % mismatch at 0 px shift for both pairs
    (limit 1 %; `docs/previews/gb_sled_mirror_probe.png`).
  - `gb_preview.py` now flips the way Phaser does (same box), so the previews show what the game draws.

### M5 · parcel visibility (fixed)
- `gb_render.py` ray-tests every point toward the camera in Blender. The manifest gets one boolean per point:
  - `parcelPointsVisible`: SE [F, F, F], NE [F, T, F]. In NE the right leaf hides two of the three parcels at f3.
  - `doorstepDirs` ['NE', 'NW'].
- The van note says to stage doorstep kerb stops facing NE / NW, or to show the parcel only once the courier holds it.
- `gb_check.py` requires the flags (one per point) and at least one dir that shows the parcels.

### Lows
- **L1 (in part).**
  - The glossy, clear-coated vehicle paint renders ~10 ΔE duller than the flat-shaded props. The van livery now uses
    `VAN_GOLD` #FFC640 for the paint (the mark, the props and the UI keep #F2B33D).
  - The gold-family mean ΔE2000 to brand gold drops from 11.3 to **8.9** (turn frame 8.6). With the same measure the
    locker is 7.7, the sign 8.0 and the flag 4.7.
  - The critic's ≤ 6 was not reached. Going further needs a flatter paint than the red van's, which would break the
    vehicle family. Coat 0.25 vs 0.5 moved it by only 0.1.
  - The whole van was re-rendered (29 frames + masks, 4 min).
- **L2 (in part).**
  - Contract AO.5 asks for navy doors, so they stay navy. Each door gets a cream label plate (0.2 x 0.075 m), and the
    12-door grid reads gold + cream + navy.
  - Navy counted the critic's way (lit and shaded, x 0.5–1.2, chroma ≥ 12) falls from 14.5 / 14.9 % to **11.5 / 11.9 %**.
  - The lockers were re-rendered.
- **L3.** New `gb_check.py` rules:
  - the pair test merges k-means clusters by hue family, so lit and shaded gold are one area;
  - hub layers and patches are included (nameplates, which are letters only, are not given a navy share);
  - the van mark is **measured**: the projected box of the mark mesh the camera sees, 45.4 x 59.9 px = 14.75 CSS px at
    zoom 0.6, checked on the frame's pixels (cream face + navy eyes);
  - navy is counted wide;
  - plus the island, rider-zone, draw-order, overlay, cap-height, mirror-table, visibility and hub-patch rules above.
- **L4.**
  - `lightsVisible` / `tailsVisible` (one boolean per point; ray-tested) on `gb_van` (SE lights [T, T], NE [T, F]) and
    `gb_van_turn` (N lights [F, F]).
  - `conventions.night` says to glow only the visible lamps. The Phaser test and `gb_night.png` do so.
- **L5.** Items with `boxOf` take `stackStep` / `thicknessM` from that box: `gb_parcel_cat` is now 24 / 0.44.
- **L6.** This report is corrected:
  - the frame counts below are the real ones;
  - the turn points are the gold van's own measurement (the red van has no turn frames);
  - the en-sign claim is replaced by the measured letter heights;
  - the tool paths are listed as they are.
- **L7 (won't fix here).**
  - Jua is the game's house Korean face (OFL), used on every Korean sign in the village, so this is not imitation.
  - A hand-drawn 금방 wordmark would have to be shared with ui6 `ui_gb_logo_ko`, which belongs to the gb_ui_audio job.
    It is noted for the brand pass.
- **L8.**
  - `conventions.night` asks for a soft ADD glow at `logistics_center.fxPoints.board`, so the nameplate and banner do
    not sink below the lit windows. The Phaser night shots draw it.
  - No lit nameplate frames were added.

## Brand

| Token | Hex | Used for |
|---|---|---|
| gold | `#F2B33D` | the mark disc, roof-sign rim, banner, flag, locker cabinet, parcel tape (van paint: `VAN_GOLD` #FFC640, L1) |
| goldDark | `#D9962A` | trims, rods, shadows of gold |
| cream | `#F4EDE0` | roof band, sign faces, locker label plates, the mark's border / parcel / sparkle |
| charcoal | `#3B3F52` | tyres, bumpers, hardware |
| navy | `#2B4F7E` | belt line, letters, mark face, locker doors (≤ 15 % of any sprite, counted wide; max 12.3 %) |

- **The mark, 금방이**, is built by `gb_lib.mark`:
  - a gold disc with a goldDark rim and a cream sticker border;
  - inside, a face-on cream parcel with navy dot eyes, pink cheeks and an "o" mouth;
  - a cream four-point sparkle above.
- **It is its own mirror image** (0 % px difference at 96 and 24 px).
- **No sprite is a real courier's colour pair.** No sprite's two largest colour families sit within ΔE2000 15 of a
  listed pair (min 20.6).
- **Letters** appear only on:
  - `gb_roofsign_*`;
  - `gb_nameplate_*` and `seori_nameplate_*`;
  - `gb_banner_ko`.

  No mirrored sprite (`gb_van`, `gb_van_turn`, `gb_pennant`) carries letters.

## Keys

### `gb_van` (character, kind `vehicle`, family `delivery_van`, variant `gb`, rig `delivery_van_red`)
- **The red van's rig, exactly**: frame 284 x 252, anchor [0.50352, 0.75], dirs SE / NE (SW ← SE, NW ← NE by flipX) and
  every point field (0 px delta, re-measured on the gold render).
- **Anims** (`{anim}_{dir}_{i}`, overlays `over_{anim}_{dir}_{i}`; no baked shadow, draw `shadow[dir]`):

  | Anim | Frames | fps | Repeat | Notes |
  |---|---|---|---|---|
  | `idle` | 2 | 6 | loop | |
  | `move` | 4 | 10 | loop | the red van's `bobPx` |
  | `door` | 3 | 10 | once | patch over `idle_<dir>_0` + `over_door_*`; seat 0 empty |
  | `unload` | 4 | 8 | once | patch over `idle_<dir>_0` + `over_unload_*`; parcels at f3 where visible |

- **New points and flags** (per dir, px from the anchor):
  - `roofSignPoint`;
  - `parcelPoints[3]` / `parcelGround[3]`, with `parcelPointsVisible`;
  - `lightsVisible`, `tailsVisible`;
  - `mirrorShiftPx` -2;
  - `doorstepDirs`.
- **`gb_van_turn`** (S / E / N, W ← E): frame 296 x 256, anchor [0.50676, 0.75], its own `shadow`, seats, lights,
  tails, roof sign, door, cargo and exhaust points (measured on the gold van), `lightsVisible` / `tailsVisible`,
  `mirrorShiftPx` -4, `headingDeg`.

### Roof signs: `gb_roofsign_{ko|en}_{0|1}` (in `gb_van_0`)
- A 96 x 56 camera-facing A-board on a charcoal roof bar, anchor [0.5, 1]: a cream face with a gold rim.
  - **ko**: the mark + "금방" (19 px glyphs);
  - **en**: the mark + GEUM / BANG (11 px letters).
- `_1` is the lit night face. Draw at `roofSignPoint[dir]` + `bobPx`, depth van + 0.02, never flipped (mirrored van:
  `x - p[0] + mirrorShiftPx`).

### Hub layers and patches (in `gb_bld_0`, all on `logistics_center`'s frame [1152, 864], anchor [0.41493, 0.58912])

| Key | Kind | depthOffset | What |
|---|---|---|---|
| `gb_nameplate_ko` / `_en` | layer, replaces `nameplate_<lang>` | 0.0005 | mark + 금방 / 물류센터, GEUMBANG / CENTRE (raised navy letters) |
| `seori_nameplate_ko` / `_en` | layer, replaces `nameplate_<lang>` | 0.0005 | 서리 물류창고 / Frost Depot (before 금방 opens) |
| `gb_emblem_gable`, `gb_emblem_blade`, `gb_roofparcel` | patch over the shell (금방 hub only) | 0.0004 | M2 above |
| `gb_banner_ko` / `_en` | patch, `sway` 4 f · 5 fps loop | 0.0012 | 0.7 x 1.8 m cloth left of dock 1, print de-sheared for the wall |

- Every nameplate letter pixel is inside the name board.
- The banner overlaps 0 opaque px of dock 1, the dock lamps, the loading sign and the board.

### Props, items, pennant (in `gb_bld_0`)
- **Props:**
  - `gb_sign` (mark disc on a pole, lit patch);
  - `gb_flag` (`wave` 6 f · 8 fps);
  - `gb_locker_a` (faces SW) / `gb_locker_b` (faces SE): 12 navy doors with cream label plates, the lit screen as a
    patch, `open` 4 f · 12 fps as patches. Points: `slotPoints` 12, `openSlot`, `standPoint/Dir`, `fillPoint/Dir`.
- **Items** (72 x 72, anchor [0.5, 0.75], fields from `boxOf`): `gb_parcel_s/m/l`, `gb_parcel_doorstep` (fresh /
  snowy), `gb_parcel_open`, `gb_parcel_cat` (blink).
- **`gb_pennant`:** 48 x 56, anchor = the stick foot, `flutter` 4 f · 10 fps. `sledPennant[dir][anim][i]` for SE / NE /
  SW / NW (idle 4, move 8), with `mirrorShiftPx` -20.

## How the game uses it (summary)
1. **Load** `assets/geumbang/manifest.json` (fragment `geumbang`) and its two atlases.
2. **Drive** `gb_van` exactly like `delivery_van_red`; use `gb_van_turn` for ~0.3 s at corners.
3. **Roof sign:** a child sprite at `roofSignPoint` + `bobPx` (mirrored: `-x + mirrorShiftPx`); `_1` at night.
4. **door / unload:**
   - hold the body on `idle_<dir>_0`;
   - draw the patch at body depth + 0.0005;
   - the riders (seat 0 empty during `door`);
   - then `over_<anim>_<dir>_<i>` with the patch anchor / frameSize instead of `over_idle`;
   - play backward to close.
5. **Hub:**
   - before 금방 opens: `seori_nameplate_<lang>`;
   - after: `gb_nameplate_<lang>` + `gb_emblem_gable` + `gb_emblem_blade` + `gb_roofparcel` + optionally
     `gb_banner_<lang>`.
6. **Night:** MULTIPLY tint, then ADD glows at the visible lamps, `roofSignPoint`, the sign disc, the locker screens
   and `fxPoints.board`.
7. **Sled pennant:** `sledPennant[dir]` for all four dirs, flipX in SW / NW, no negation.

## Pipeline and rebuild
Run each step under `nice -n 10`, one Blender at a time. All tools are under the job's own paths.
```
cd frost-village
/tmp/bvenv/bin/python tools/blender/gb_render.py -- all      # or van|roofsign|hub|builds|pennant; --force --only k,k; GB_CACHE=DIR
python3 tools/blender/gb_pack.py [--cache DIR]               # -> assets/geumbang/{gb_van_0,gb_bld_0}.{png,json}, manifest.json
python3 tools/blender/gb_check.py [--json OUT]               # contract + brand + polish rules, exit 1 on any error (GB_DIR=<copy> to check another copy)
python3 tools/blender/gb_preview.py                          # docs/previews/gb_*.png / .gif (GB_BEFORE=<old set> adds the before/after sheet)
node tools/test/geumbang_phaser.mjs                          # GB_OUT=<dir> for shots, dolls, geumbang_phaser.json
```
The polish re-rendered only what changed:
- the van (all frames: the rear-door fix and the paint), plus masks for door / unload;
- the en roof signs;
- the 8 banner frames;
- 6 hub patch renders (base + 금방 for 3 regions);
- the two lockers.

Everything else came from the existing render cache.

| File | Role (polish changes in **bold**) |
|---|---|
| `gb_van.py` | livery override of `lgx_vehicles.b_van`; **rear parts' leaf decided in body space (H1); `VAN_GOLD` (L1)** |
| `gb_render.py` | renders; **masks for door / unload; ray-tested visibility flags; rear-part check; measured mark box** |
| `gb_signs.py` | roof signs and pennant; **en stacked lockup (M3)** |
| `gb_tex.py` | banner / flag / pennant prints; **`iso_wall_shear` + de-sheared banner print (M1)** |
| `gb_hub.py` | nameplates and banner; **emblem / roof-parcel re-render patches (M2)** |
| `gb_assets.py` | props / items; **locker label plates (L2)** |
| `gb_pack.py` | **MaxRects packer; unload re-cut; per-pose overlays; hub patch cut; draw-order fields; visibility; mirror tables; L5** |
| `gb_check.py` | **islands, rear parts, draw order, rider zone, overlays, cap height, mirror tables, hub patches, measured mark, hue-family pairs, wide navy** |
| `gb_preview.py` | **Phaser's centre flip; patch + overlay order; emblems; visibility; before/after sheet** |
| `tools/test/geumbang_phaser.mjs` | **real rider dolls, VehicleSprite order, order grid, mirror probe, visible-lamp glows, board glow** |

## Check results (`gb_check.py`: 0 errors, 0 warnings)
- **Frames and anims:** every frame named by a key, anim, dir, overlay or patch exists. Atlases: `gb_van_0` 62 entries
  (49 unique rectangles, 13 aliased identical overlays), `gb_bld_0` 51.
- **Rig delta:** 0.0 px on every point field of every dir.
- **Van patches:**
  - pixels changed outside the patch ≤ 0.037 % (limit 0.5 %);
  - 0 px to erase;
  - no patch touches the canvas edge;
  - 0 islands;
  - unchanged rider-zone px ≤ 1 (limit 3);
  - every patch has its overlay.
- **Rear parts:** at most 0.01 m off their leaf in every unload pose.
- **Mark:**
  - measured 45.4 x 59.9 px (SE) and 45.5 x 60.0 px (NE), which is 14.75 CSS px at zoom 0.6 (≥ 12);
  - mirror difference 0 %.
- **Roof signs:** 31.2 CSS px wide at zoom 0.6 (≥ 30). Letter lines: ko 19, en 11 / 11, en lit 10 / 11 px (≥ 10).
- **Navy share:** max 12.3 % (lockers 11.5 / 11.9 %).
- **Brand pairs:** min ΔE2000 20.6 (limit 15).
- **Hub:**
  - nameplates 0 px outside the board;
  - banner overlaps 0 px;
  - emblem patches 3784 / 2681 / 1494 px.
- **sledPennant:** SW / NW equal the centre-flip mirrors (sled +30, pennant -20).
- **Keys:** no collision with another fragment.

## Previews (`docs/previews/`)

| File | What |
|---|---|
| `gb_polish_before_after.png` | **new:** H1 (NE f3, SE f2), M1 banner, M2 hub emblems + roof parcel, M3 en sign, L1 van gold, L2 locker |
| `gb_phaser_order.png` | **new:** Phaser, phone 390 x 844: the door / unload grid with real riders (zoom 1.0 day / night) and the dock van at 1.6 |
| `gb_sled_mirror_probe.png` | **new:** the mirror probe windows (SE \| SW, NE \| NW) as captured in Phaser |
| `gb_phaser_390_day_night.png` | Phaser phone shots, zoom 0.6 / 1.0 / 1.2 / 1.6, day and night |
| `gb_phaser_360.png` | Phaser 360 x 640 DPR 2, zoom 1.0 |
| `gb_van_8dirs.png`, `gb_van_compare.png`, `gb_van_move.gif` | the van in 8 headings, next to the red van, driving |
| `gb_van_door.gif`, `gb_van_unload.gif` | patches + their overlays, SE / NE / SW / NW; parcelPoints green = seen, red = hidden |
| `gb_hub.png`, `gb_banner.gif` | the centre four ways (금방 ko / en with the emblem patches, 서리 / Frost Depot without) |
| `gb_props.png` / `.gif`, `gb_items.png`, `gb_sled.png` / `.gif`, `gb_night.png`, `gb_all.png`, `gb_mark_thumbs.png` | as before, regenerated |

## Self-critique / known issues
- **Van gold.** It is ΔE 8.9 from the brand gold, not ≤ 6 (L1).
- **Lit frames.** They are lit in daylight and tinted by the game's MULTIPLY. The locker `open` patch has no lit
  variant.
- **The banner print is de-sheared for the fixed camera.** It reads upright on screen, but in world terms the print
  is slanted on the cloth. Only this game camera ever sees it.
- **No lit nameplate frame.** The night readability of the name relies on the `fxPoints.board` glow rule.
- **The en roof sign splits the brand name over two lines (GEUM / BANG).** It was the only way to reach 11 px letters
  on the 96 px board with the mark kept.
- **The turn frames are single frames** (no wheel spin during the 0.3 s corner), as with the red van.
- **Paths differ from AS.** AS names `tools/<job>/<job>_check.py` and `tools/test/gb_<job>_phaser.mjs`. Under this job's
  path assignment they are `tools/blender/gb_check.py` and `tools/test/geumbang_phaser.mjs`.
