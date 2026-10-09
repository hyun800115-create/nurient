# beach build report (after the polish pass)

The Sunny Beach (햇살 해변) ground and prop set for CONTRACT_V7 §W is in `assets/beach/`: 117 sprite keys
(61 prop keys in 6 atlases, 2 of them aliases; 54 ground decals and transition pieces in 1 atlas; 2 seamless sand textures) plus 6
characters-style atlases (boats and the crab). The payload is 2.33 MB (limit 6 MB). `beach_check.py` reports
0 errors and 0 warnings (117 sprites, 6 characters, 419 frame names), and `check_beach_ground.py` reports 0 errors and 0 warnings (56 ground keys; dry ↔ wet seam excess ≤ 13, limit 20). A headless Phaser 3.90 load (`tools/test/beach_phaser.mjs`)
loads every texture and frame with no errors and no 404s: 117 sprites, 6 characters, 92 anims and 475 frames checked,
0 missing, 57 anims playing (`docs/previews/beach_phaser.png`). A phone check (390 × 844 at DPR 3, live Water.js
shader, zoom 0.6 / 1.0 / 1.2) showed no errors either.

Style: the village's soft toy-like 3D chibi look, PPU 64, 2:1 iso, the shared `bl_common` camera and light, Cycles with
denoising, baked soft cool shadows falling screen down-right (lighter on the water plane). Materials: woven canvas
with sheen and darker seam piping, glossy vinyl with clear-coat, oiled teak, painted wood, damp packed sand.

**What the polish pass changed** (independent critic review; details in "Critic issues" at the end):
- **People points now play correctly:** sunbathers get `lyingFeetDirs` (beachfolk `sunbathe` is played by the FEET
  direction), sandcastle diggers kneel on the far side facing SE / SW / S (`dig` has frames there) so the castle stays
  in front of them, lounger seats sit on the cushion edge on the camera side, the picnic table's near bench faces out
  to sea (no more NE sitters), the ice-cream vendor stands behind the cart (`staffDepth` "behind"), and every seat
  has a `seatGroundPoints` + `seatHeightM`. `beach_check` now refuses any direction that has no frames.
- **Dry ↔ wet sand kit:** `ground_sand_wet_edge_*` / `_corner_*` / `_inner_*` (20 pieces, same placement rules as
  the snow kit, `manifest.wetKit`) give the wet band a wavy edge, a ragged damp ramp and a soft line of dried foam
  instead of a ruler-straight brown strip; `ground_sand_wet` now uses the Water.js wet-sand colour.
- **One sea level:** on the sand beach the sea surface is level with the sand (`waterPx` 0, `waterPxByShore`), the
  same rule as `assets/water` (water.md §6.6) and `assets/beachfolk`.
- **Tonal range:** darker secondary materials (teak lounger frames, deeper canvas piping, dark rubber tyres, warm
  off-white paint, damper castle sand) and one exposure step down (−0.2 EV, −0.3 on the pastel props).
- **Re-modelled:** coconut palms (pinnate fronds with hanging leaflets, spear fronds, a coconut cluster, 8-frame rigid
  sway at 8 fps), the ice-cream cart (a giant three-scoop cone on the roof, a brass hand bell that really swings with a
  glint and "ding" strokes, rubber tyres), the sign boards (decorated frames around a blank text area; the notice
  board's face used to sit inside its frame and showed plain brown).
- **Ground:** `ground_sand` without the repeating camouflage blotches and dark pepper grains; `ground_sand_wet`
  without the white dash grid; stronger `decal_footprints_sand` and `decal_sand_ripples`.

## Keys

**Ground** (procedural, `tools/fx/gen_beach_ground.py`)
- `ground_sand` (dry: soft undulation, wind ripples along world X, warm and bright grains, shell crumbs),
  `ground_sand_wet` (smooth, soft sky sheen, faint broken backwash threads, bubble pits; base colour = the
  `water_shore_ramp` sand row at u ≈ 0.5): 512² seamless textures in `images[]` (kind `tile`).
- Sand ↔ snow kit on the roads cell grid: `ground_sand_snow_edge_x`, `_x_near`, `_y`, `_y_near` (3 variants each: no
  suffix, `_1`, `_2`), `ground_sand_snow_corner_n/e/s/w`, `ground_sand_snow_inner_n/e/s/w` (rules: `manifest.sandKit`).
- **New:** dry ↔ wet kit with the same names under `ground_sand_wet_*`: `ground_sand_wet_edge_x/_x_near/_y/_y_near`
  (3 variants each), `ground_sand_wet_corner_n/e/s/w`, `ground_sand_wet_inner_n/e/s/w` (rules: `manifest.wetKit` =
  the sandKit rules with WET read as SNOW).
- Decals: `decal_footprints_sand`, `decal_shells`, `decal_seaweed`, `decal_sand_ripples`, `decal_volleyball_court`
  (+ `_x`, with `cornerPoints`), `decal_towel_red/blue/yellow/green` (+ `_x`, with `lyingPoints`, `lyingFeetPoints`,
  `lyingFeetDirs`, `lyingHeadPoints`, `lyingDirs`, `lyingAxis`).

**Shade and rest** (`beach_shade`)
- `parasol_red`, `parasol_blue`, `parasol_yellow`, `parasol_green`, `parasol_pink`, `parasol_rainbow`. Each has
  `anims.flutter` (= `work`, 4 frames at 6 fps): the valance flaps and the canopy breathes. `shadePoint` and
  `shadeRadiusM` give the shade spot.
- `sun_lounger` (along world Y) and `sun_lounger_x`: dark-teak frame, striped cushion; `lyingPoints` /
  `lyingFeetPoints` / `lyingFeetDirs` (SW / SE), `seatPoints` (cushion edge, camera side: SE / SW),
  `seatGroundPoints`, `seatHeightM` 0.45.
- `beach_chair_folding` (+ `_x`), `beach_swing` (2 seats), `picnic_table_beach` (4 seats, `seatDepths`).

**Play** (`beach_play`)
- `beach_ball`: a 72×72 item (anchor (36, 54), `stackStep`, `icon`, `carryScale`).
- `beach_ball_bounce`: 9-frame bounce with squash and the shadow on the sand (`impactFrame` 0).
- `swim_ring_red`, `swim_ring_duck`, `swim_ring_donut` (lying on the sand), `bucket_spade` (`playPoints` / `playDirs`
  SE, `playAnim` "dig"), `kite` (`anims.fly`, 6 frames; no baked shadow; `stringPoint`, `flyHeightM`).
- `sandcastle_s`, `sandcastle_m`, `sandcastle_l`, and `sandcastle_build_0..3`: 4 build stages that share one frame
  size and anchor (`sandcastle_build` = alias of stage 0). `workPoints` / `workDirs` (SE / SW / S) on the far side,
  `workDepth` "behind".
- `volleyball_net` (+ `_y`, with `playPoints`, `playDirs`, `ballDirs`, `netAxis`), `surfboard_rack`.

**Service** (`beach_service`)
- `lifeguard_tower`: platform at 1.76 m, `staffPoints` / `staffPoint` (the guard at the rail), `seatPoints` (the high
  chair, + `seatGroundPoints` on the platform), `lookDir` SW and `lookPoint`, `ladderPoint`, `fxPoints.flag` /
  `whistle`. It has an occluder overlay `lifeguard_tower_front`.
- `rescue_board`, `rescue_buoy_stand`, `beach_shower` (`anims.water`, 4 frames; `standPoints`), `changing_booth`
  (`doorPoint`, `doorDir`).
- `icecream_cart` (`anims.bell` 4 frames at 8 fps, `bellFrames` [1, 3] for `sfx_icecream_bell`, `staffPoints`,
  `staffDepth` behind, `customerPoints` queue, `fxPoints.bell` / `sign`), `corn_stand` (`anims.grill` with smoke,
  `staffDepth` behind), `rental_stand` (rings and parasols for hire, `staffDepth` behind).
- `beach_sign_arrow`, `beach_sign_board`, `beach_sign_notice`: the text area is blank and `fxPoints.board` marks its
  centre; the frame around it is decorated (painted rims and icons, a flower lei, pinned notes, a life ring).

**Nature** (`beach_nature`)
- `palm_tree_a`, `palm_tree_b` (double trunk): `anims.sway` 8 frames at 8 fps, `fxPoints.crown`.
- `beach_pine`, `dune_grass_a/b/c`, `starfish`, `driftwood` (`seatPoints`, 0.36 m).

**On the water** (`beach_water`, all `waterPlane: true`, anchor = waterline)
- `swim_buoy_line_x`, `swim_buoy_line_y`: tiles √2 m long; `anims.bob` (4 frames) carries a travelling wave. Cap
  them with `swim_buoy_line_end`.
- `float_raft`: 2 × 2 m swim platform on four barrels, `anims.bob`, `ladderPoint`, `playPoints`, `deckM` 0.35.

**Boardwalk tiles** (`beach_tiles`, kind `decal`, ground layer)
- `boardwalk_x`, `boardwalk_y`, closed ends `boardwalk_end_xp`, `_xn`, `_yp`, `_yn`. `boardwalk_end` is an alias of
  `boardwalk_end_yn` (the end toward the sea).

**Characters-style atlases** (`characters{}`, one atlas `beach_<key>` each, 1 px ink outline, no baked shadow;
unchanged in the polish pass)

| key | kind | render dirs (mirrors) | anims |
|---|---|---|---|
| `swan_pedal_boat` | ship | S, SE, NE (SW←SE, NW←NE; E/W/N via `nearest`) | idle 2 f, move 4 f |
| `kayak`, `kayak_crew` | ship | same | idle 2 f, move 4 f |
| `banana_boat`, `banana_boat_crew` | ship | same | idle 2 f, move 4 f |
| `crab` | animal | S, SE, E, NE, N (SW←SE, W←E, NW←NE) | idle 4 f, walk 6 f |

- The empty boats (`swan_pedal_boat`, `kayak`, `banana_boat`) have `seats[dir]` (sit anchors), `seatDirs`,
  `seatsStand`, `seatDrawOrder` and an overlay `over_<anim>_<dir>_<i>` (the hull parts in front of the riders), like
  `assets/vehicles`.
- `kayak_crew` and `banana_boat_crew` have their riders baked in (a paddler with strokes; four riders bouncing and
  cheering).
- Boat points: `bowPoint`, `wakePoint` (stern), `headPoint`; `banana_boat*` also have `towPoint`.

## Fields

All points are pixel offsets `[dx, dy]` from the sprite anchor, unscaled, with height included (town / harbour
convention). Every prop has `anchor`, `frameSize`, `footprint`, `footprintM`, `footprintPoly`, `topPx`, `front`,
`name` {ko, en}, `zone`, `notes`.
- **People spots:** `staffPoints` / `staffDirs` / `staffDepth` (+ `staffPoint` / `staffDir` = the first),
  `customerPoints` / `customerDirs`, `seatPoints` / `seatDirs` (the townsfolk2 / villagers `sit` anchor = seat
  front-centre at the seat height) + `seatGroundPoints` (the floor under the sitter: draw the shadow there) +
  `seatHeightM` + `seatDepth` / `seatDepths`, `lyingPoints` (hips) / `lyingFeetPoints` / `lyingFeetDirs` (the
  sunbathe `dir`) / `lyingHeadPoints` / `lyingDirs` (hips → head, reference only) / `lyingAxis`, `workPoints` /
  `workDirs` / `workDepth` (kneeling diggers), `playPoints` / `playDirs` / `playDepth` / `playAnim`, `ballDirs`
  (volleyball), `standPoints` / `standDirs` (shower), `doorPoint`, `ladderPoint`, `lookPoint` / `lookDir`.
- **Every `*Dirs` value has frames** in the anim played there, or in its flipX mirror (`beach_check` enforces it):
  `sit` S / SE / E (+ SW / W), `sunbathe` SE / NE (+ SW / NW), `dig` and `ball_throw` / `ball_catch` S / SE / E
  (+ SW / W); idle frames cover all 8 directions.
- **Water:** `waterPlane: true`, `waterline: "anchor"`; top-level `waterPx` 0 and `waterPxByShore` {sand 0, quay /
  pier / breakwater 30}.
- **Tiles:** `tileAxis`, `segM` √2, `stepPx` (64, 32) along X or (64, −32) along Y, `cuts`, `rampM`, `openEnds`,
  `tileLayer`.
- **Anims:** every named loop is also listed as `anims.work`; all frames of a key share `frameSize` and `anchor`.

## How the game should use them
1. **Load:** add `'beach'` to `FRAGMENTS` in `src/core/Assets.js` (or to `LAZY_FRAGMENTS`). Sprite anims register
   themselves as `spr:<key>:<anim>`; the boats and the crab are built like other characters as `<key>:<anim>:<dir>`.
   Also register the overlay frames as `<key>:over_<anim>:<dir>`, as `beach_phaser.mjs` does.
2. **Ground layering:** snow everywhere; `ground_sand` on sand cells; `ground_sand_wet` on the wet cells (the cell row
   along the sea); the `ground_sand_wet_*` kit on dry / wet cell borders by `wetKit` (on this beach the shore band
   uses `ground_sand_wet_edge_x_near`); the `ground_sand_snow_*` kit on sand / snow borders by `sandKit`; then the
   `decal_*`; then the depth-sorted sprites. Draw the textures as patterns anchored at the grid origin, scale 1. With
   the Water.js shader the animated swash band sits on top of the baked wet band; both use the same wet-sand colour.
3. **Sea level:** on the sand beach the sea surface is level with the sand (`waterPx` 0): put the anchor of every
   water-plane prop and boat on the sea point itself, and pass the sand polygon to Water.js as `{poly, waterPx: 0}`
   (water.md §6.6). Only beside walls that show (quay, pier, breakwater) is the sea 30 px (0.55 m) lower.
4. **Sea look:** draw the water with `assets/water` (`Water.js`, palette `tropical`, shore type `sand`). Without the
   shader, use `fx_shore_wave_x` (scale 2, chained every (+256, +128) px on the waterline). That sheet is drawn for a
   sea on the far (+Y) side; this beach faces −Y, so flip it both ways (`setFlip(true, true)` = a 180° turn), as
   `beach_scene.png` does.
5. **Tiles:** chain the boardwalk and buoy-line tiles at `stepPx`; the joins are seamless, shadows included. Play
   all buoy-line tiles' `bob` at the same frame index so the wave travels along the line.
6. **Lifeguard tower:** draw the tower at depth d, the guard at `staffPoint` at d + 0.5, and `lifeguard_tower_front`
   at d + 1.
7. **Sunbathers:** play beachfolk `sunbathe` with `dir = lyingFeetDirs[i]` at `lyingPoints[i]` (its `dir` is where
   the FEET point; `lyingDirs` points the other way and is kept only for reference). Loungers along Y: SW; `_x`
   loungers: SE; towels the same.
8. **Sitting:** play `sit` facing `seatDirs[i]` with the anchor on `seatPoints[i]`; draw its soft shadow at
   `seatGroundPoints[i]`. `seatDepth` / `seatDepths` "front" = just above the prop, "behind" = normal y-sort (the
   picnic table top hides the laps of the far-bench sitters).
9. **Sandcastle building:** kids `dig` at `workPoints` facing `workDirs` (they kneel on the far side; normal y-sort
   draws the castle in front of them) while you swap `sandcastle_build_0` → `_3` in place. `bucket_spade`: one kid
   `dig`s at `playPoints[0]`.
10. **Volleyball:** players stand at `playPoints`; play `ball_throw` / `ball_catch` with `ballDirs[i]` (the far side
    faces the net; the near side, whose true facing is away from the camera, turns side-on).
11. **Ice-cream cart:** the vendor stands behind the cart at `staffPoint` (y-sort hides his legs); loop `bell` while
    calling customers and play `sfx_icecream_bell` on `bellFrames` 1 and 3.
12. **Boats with riders:** draw the boat frame, then each rider (`sit` facing `seatDirs[dir][k]`) at `seats[dir][k]`
    in `seatDrawOrder[dir]`, then the `over_` frame. Mirrored headings negate dx and flip every layer. Put
    `fx_wake_v2` at `wakePoint` while moving. The banana boat is towed: keep the towing boat's stern just ahead of
    `towPoint[dir]` and draw a rope.
13. **Crab:** `dir` is the movement direction (it scuttles sideways). Draw a soft ellipse `shadow` [34, 14] under it.
14. **Do not flip** baked-shadow sprites. Use the `_x` / `_y` variants instead.

## Scripts and how to rebuild
Scripts: `tools/blender/beach_lib.py`, `beach_assets.py`, `beach_props.py`, `beach_water.py`, `beach_boats.py`,
`beach_render.py`, `beach_pack.py`, `beach_check.py`, `beach_preview.py`, `tools/fx/gen_beach_ground.py`,
`tools/fx/check_beach_ground.py` and `tools/test/beach_phaser.mjs`. They only import the existing helpers
(`bl_common`, `prop_lib`, `life2_lib`, `veh_lib`, `town_lib`, `bld_assets` / `bld_render` / `bld_boats`,
`harbor_water` / `harbor_render` / `harbor_pack`, `char_pack`, `pack_utils`, `prop_pack`, `fxlib`, `gen_ground`, and
for the previews `beachfolk_compose` / `townfolk2_compose`); no existing script or asset was edited.

```
python3 tools/fx/gen_beach_ground.py                                  # ground textures + both kits + decals (+ check)
/tmp/bvenv/bin/python tools/blender/beach_render.py -- [keys] [--force]   # cache /tmp/fv_cache/beach (resumable)
python3 tools/blender/beach_pack.py                                   # atlases + merged manifest + previews
python3 tools/blender/beach_pack.py --previews-only                   # redraw docs/previews/beach_* only
python3 tools/blender/beach_check.py
python3 tools/fx/check_beach_ground.py
node tools/test/beach_phaser.mjs
```
`beach_pack.py` merges into the manifest: it keeps the ground generator's keys, and it refuses to write (exit 1) if
a key it owns has no complete render in the cache. `beach_render.py` sets the exposure per build (`EXPOSURE`) and
renders occluder masks at 0 EV.

## Previews (`docs/previews/`)
- `beach_all.png`: every key at 1x, labelled, with one anim frame each; water props on turquoise.
- `beach_scene.png`: a 1x mock beach: sand with the snow kit and bays, the wet band with the dry ↔ wet kit, the sea
  level with the sand (from `assets/water`: tropical LUT, ripples, and the `fx_shore_wave_x` crest turned 180°),
  props, the buoy line and raft, boats with riders, the towed banana boat, crabs, beachfolk (sunbathers on loungers
  and towels, kids digging behind the castles, people at the picnic table, swimmers, the lifeguard) and the chief
  (1.45 m) for scale.
- `beach_ground.png`: ground textures, the sand ↔ snow kit, the dry ↔ wet kit and the decals.
- GIFs: `beach_parasols.gif` (flutter), `beach_palms.gif` (sway), `beach_service.gif` (shower water, ice-cream bell,
  corn grill), `beach_play.gif` (ball bounce, kite), `beach_sandcastle.gif` (4 build stages),
  `beach_water_props.gif` (buoy line, raft), `beach_swan.gif`, `beach_kayak.gif`, `beach_banana.gif`,
  `beach_crab.gif`.
- `beach_phaser.png`: the headless Phaser load.

## Known issues
- The game draws a few things itself: the crab's soft shadow, the kite string (from `stringPoint`), the banana boat's
  tow rope, boat wakes (`fx_wake_v2` at `wakePoint`), and the sign text (the boards are blank on purpose; centre
  the text on `fxPoints.board`).
- Boats are rendered for 3 headings (S, SE, NE + mirrors); E / W / N use the nearest one.
- No `_snow` variants: the beach is a summer zone.
- `beach_scene.png`'s sea is a still imitation of Water.js (tropical LUT, ripples, a static `fx_shore_wave_x` crest);
  the live shader animates the swash over the baked wet band.
- `fx_shore_wave_x` is drawn for a sea on the far (+Y) side, so this beach (sea on −Y) must turn it 180°.
- Tonal range is only partly at the critic's target: the dark-framed props reach it (loungers spread 0.51 / 0.46,
  darkest 5 % at 0.44), but the white-and-colour canvas canopies stay light by design (parasols spread 0.23–0.42,
  darkest 5 % 0.49–0.58; ice-cream cart 0.39 / 0.51). Going darker made the canvas look dirty at phone zoom.
- Volleyball: the near-side players' true facing (toward the net, away from the camera) has no ball frames, so
  `ballDirs` turns them side-on.
- Picnic table: `sit` has no N / NE frames, so the near-bench sitters face the sea (SW) with their backs to the table;
  only the far-bench sitters face the camera across the table top.
- Wet tongues one or two cells wide (wet cells reaching inland) read as soft rounded-rectangle damp patches; the kit
  is at its best along a long shore band.
- The coconuts show through a window kept in the frond ring toward the camera, so the palms must not be flipped
  (true of all baked-shadow sprites).
- The beachfolk owner could not be messaged (this workflow has no messaging). Beachfolk's own manifest already uses
  the same rules (`sunbathe` dir = the feet, sand-beach sea level 0), so nothing is needed there. If its polish pass
  changes the `sunbathe` convention, `lyingFeetDirs` must follow it.

## Critic issues (polish pass)
| # | severity | critic issue | status | what was done / evidence |
|---|---|---|---|---|
| 1 | high | `lyingDirs` (hips → head) contradicts beachfolk `sunbathe` (dir = where the feet point) | fixed | Reproduced: a sunbather played with `lyingDirs` lay head-to-feet reversed. New `lyingFeetPoints` / `lyingFeetDirs` (the `sunbathe` dir: loungers along Y and towels SW, `_x` SE) on loungers and all 8 towels; `lyingDirs` stays for reference only. `beach_check` verifies `lyingFeetDirs` against the geometry and the `sunbathe` dirs; the scene and the points sheet use it. |
| 2 | high | sandcastle / bucket_spade `workDirs` NE / N have no `dig` frames; diggers hide the castle | fixed | Reproduced (NE / N have no `dig` frames, and near-side kids covered the castle). Work points moved to the far side facing SE / SW / S (`sandcastle_l` 3 kids, `_m` / `_build` 2, `_s` 1), `workDepth` "behind"; `bucket_spade` `playPoints` behind the toys facing SE, `playAnim` "dig". `beach_check` now refuses any dir without frames. |
| 3 | high | wet sand is a hard-edged brown strip, no dry → wet transition | fixed | Reproduced. New 20-piece dry ↔ wet kit `ground_sand_wet_*` (wavy edge, damp ramp, dried-foam line; `manifest.wetKit`, same rules as `sandKit`); `ground_sand_wet` recoloured to the Water.js wet-sand colour; seam check ≤ 13 (limit 20); the scene and the Phaser test chain the edge pieces along the shore. |
| 4 | medium | lounger seat points: seat 19 px too low; `_x` seat on the far rail facing NE | fixed | Partly reproduced: the seat sat at 0.37 m instead of the `sit` seat height 0.45 m, and the `_x` seat really was on the far rail facing NE. Seats now on the cushion edge on the camera side (SE / SW) at 0.45 m with `seatGroundPoints`, `seatHeightM`, `seatDepth` "front"; `beach_check` measures seat height from the points (0.25–0.65 m and ± 0.05 m of `seatHeightM`). |
| 5 | medium | picnic table seats facing NE have no `sit` frames | fixed | Reproduced. The near bench now faces out to sea (SW) and the far bench faces the camera (SW / SE) - only dirs with frames; `seatDepths` ["behind", "front", "behind", "front"], `seatHeightM` 0.46. |
| 6 | medium | ice-cream cart: `bell` anim is a no-op (diff 0.02), no giant cone, vendor drawn over the cart | fixed | Reproduced (frame diff 0.02). Rebuilt cart: a brass hand bell that swings ±25° with a glint and orange "ding" strokes on frames 1 and 3 (step diff now 0.45–0.73 between packed frames, `bellFrames` [1, 3]), a giant three-scoop cone with a cherry on the roof, mint body, rubber tyres; the vendor stands behind (`staffDepth` "behind"). `beach_check` now fails any anim whose frames barely change. |
| 7 | medium | sea level: beach `waterPx` 30 vs water / beachfolk 0 on sand beaches | fixed | Reproduced. `waterPx` 0 plus `waterPxByShore` {sand 0, quay / pier / breakwater 30}; docs, notes, the scene and the Phaser test use 0; `beach_check` enforces it. |
| 8 | medium | tonal range: spread 0.31 vs ~0.52, darkest 5 % 0.60–0.72 vs 0.27–0.45 | partly fixed | Reproduced. Darker secondary materials and −0.2 EV (−0.3 on the pastel props). Measured after: loungers 0.51 / 0.44 (were 0.29 / 0.62), `_x` 0.46 / 0.44, cart 0.39 / 0.51 (0.25 / 0.70), parasols 0.23–0.42 / 0.49–0.58 (0.20–0.37 / 0.58–0.73), lifeguard tower 0.36 / 0.51. The white-striped canvas stays lighter than the target on purpose (see known issues). |
| 9 | medium | palms: paper-cutout fronds, no coconuts, 4-frame sway that pops | fixed | Reproduced (step diffs 3.2–4.3 between 4 frames). New pinnate fronds (midrib + hanging leaflets, bare petiole, spear fronds, a dried frond), a coconut cluster seen through a window in the frond ring toward the camera, 8-frame rigid sway at 8 fps (step diffs 1.6–3.0 between 8 frames). |
| 10 | medium | `ground_sand` repeating blotches + pepper grains; `ground_sand_wet` dash grid | fixed | Reproduced. `ground_sand`: soft large undulation, wind ripples, warm and bright grains, no dark pepper, no camouflage blotches; `ground_sand_wet`: smooth with a soft sheen, sparse broken backwash threads, no grid. |
| low | low | sign boards are blank | fixed (text stays blank by design) | The boards keep a blank text area (the game writes the text at `fxPoints.board`), but the frames are now decorated: painted rims and sun / wave / cone icons on the arrow sign, a flower lei and shells on the surfboard sign, a turquoise header, pinned notes, a life ring and shells on the notice board (whose face used to sit inside its frame). |
| low | low | footprint and ripple decals invisible | fixed | `decal_footprints_sand` larger and darker, `decal_sand_ripples` stronger; both read at 1x in the scene. |
| low | low | sandcastles blend into the sand | fixed | Castles use a damper, darker sand (#D9B57C) and −0.3 EV: darkest 5 % 0.65 → 0.55 (`_l`), 0.69 → 0.59 (`_m`), 0.68 → 0.60 (`_s`), and the new `ground_sand` is lighter and calmer, so they stand out at 1x. |
| low | low | (the critic's JSON was cut off after "Lower the b…") | not reproduced | The rest of that item was not in the review text, so it could not be identified. |
