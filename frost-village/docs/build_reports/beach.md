# beach build report

The Sunny Beach (햇살 해변) ground and prop set for CONTRACT_V7 §W is in `assets/beach/`: 97 sprite keys (61 props in
7 atlases, 34 ground decals and transition pieces in 1 atlas, 2 seamless sand textures) plus 6 characters-style
atlases (boats and the crab). The payload is 1.91 MB (limit 6 MB). `beach_check.py` reports 0 errors and
0 warnings (97 sprites, 6 characters, 383 frame names), and `check_beach_ground.py` reports 0 errors and 0 warnings
(36 ground keys). A headless Phaser 3.90 load (`tools/test/beach_phaser.mjs`) checked 439 frames with none missing,
registered 92 anims, and logged no console errors and no 404s.

Style: the village's soft toy-like 3D chibi look, PPU 64, 2:1 iso, the shared `bl_common` camera and light, Cycles with
denoising, baked soft cool shadows falling screen down-right (lighter on the water plane). Materials: woven canvas
with sheen, glossy vinyl with clear-coat, oiled teak, painted wood, damp-sand mounds.

## Keys

**Ground** (procedural, `tools/fx/gen_beach_ground.py`)
- `ground_sand` (dry, fine wind ripples and grains), `ground_sand_wet` (darker, glossy streaks, bubble holes):
  512² seamless textures in `images[]` (kind `tile`).
- Sand-to-snow transition kit on the roads cell grid: `ground_sand_snow_edge_x`, `_x_near`, `_y`, `_y_near`
  (3 variants each: no suffix, `_1`, `_2`), `ground_sand_snow_corner_n/e/s/w`, `ground_sand_snow_inner_n/e/s/w`.
  Placement rules are in `manifest.sandKit` (same rules as the snow edges in `assets/roads`).
- Decals: `decal_footprints_sand`, `decal_shells`, `decal_seaweed`, `decal_sand_ripples`, `decal_volleyball_court`
  (+ `_x`, with `cornerPoints`), `decal_towel_red/blue/yellow/green` (+ `_x`, with `lyingPoints`, `lyingDirs`,
  `lyingHeadPoints`, `lyingAxis`).

**Shade and rest** (`beach_shade`)
- `parasol_red`, `parasol_blue`, `parasol_yellow`, `parasol_green`, `parasol_pink`, `parasol_rainbow`. Each has
  `anims.flutter` (= `work`, 4 frames at 6 fps): the valance flaps and the canopy breathes. `shadePoint` and
  `shadeRadiusM` give the shade spot.
- `sun_lounger` (along world Y) and `sun_lounger_x`, `beach_chair_folding` (+ `_x`), `beach_swing`,
  `picnic_table_beach`.

**Play** (`beach_play`)
- `beach_ball`: a 72×72 item (anchor (36, 54), `stackStep`, `icon`, `carryScale`).
- `beach_ball_bounce`: 9-frame bounce with squash and the shadow on the sand (`impactFrame` 0).
- `swim_ring_red`, `swim_ring_duck`, `swim_ring_donut` (lying on the sand), `bucket_spade`, `kite`
  (`anims.fly`, 6 frames; no baked shadow; `stringPoint`, `flyHeightM`).
- `sandcastle_s`, `sandcastle_m`, `sandcastle_l`, and `sandcastle_build_0..3`: 4 build stages that share one frame
  size and anchor. `sandcastle_build` is an alias of stage 0.
- `volleyball_net` (+ `_y`, with `playPoints` and `netAxis`), `surfboard_rack`.

**Service** (`beach_service`)
- `lifeguard_tower`: platform at 1.76 m, `staffPoints` / `staffPoint` (the guard at the rail), `seatPoints` (the high
  chair), `lookDir` SW and `lookPoint`, `ladderPoint`, `fxPoints.flag` / `whistle`. It has an occluder overlay
  `lifeguard_tower_front`.
- `rescue_board`, `rescue_buoy_stand`, `beach_shower` (`anims.water`, 4 frames; `standPoints`), `changing_booth`
  (`doorPoint`, `doorDir`).
- `icecream_cart` (`anims.bell`, `staffPoints`, `customerPoints` queue, `staffDepth` front), `corn_stand` (`anims.grill`
  with smoke, `staffDepth` behind), `rental_stand` (rings and parasols for hire, `staffDepth` behind).
- `beach_sign_arrow`, `beach_sign_board`, `beach_sign_notice`: blank boards; `fxPoints.board` is where to draw text.

**Nature** (`beach_nature`)
- `palm_tree_a`, `palm_tree_b` (double trunk): `anims.sway` 4 frames, `fxPoints.crown`.
- `beach_pine`, `dune_grass_a/b/c`, `starfish`, `driftwood` (`seatPoints`).

**On the water** (`beach_water`, all `waterPlane: true`, anchor = waterline)
- `swim_buoy_line_x`, `swim_buoy_line_y`: tiles √2 m long; `anims.bob` (4 frames) carries a travelling wave. Cap
  them with `swim_buoy_line_end`.
- `float_raft`: 2 × 2 m swim platform on four barrels, `anims.bob`, `ladderPoint`, `playPoints`, `deckM` 0.35.

**Boardwalk tiles** (`beach_tiles`, kind `decal`, ground layer)
- `boardwalk_x`, `boardwalk_y`, closed ends `boardwalk_end_xp`, `_xn`, `_yp`, `_yn`. `boardwalk_end` is an alias of
  `boardwalk_end_yn` (the end toward the sea).

**Characters-style atlases** (`characters{}`, one atlas `beach_<key>` each, 1 px ink outline, no baked shadow)

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
  `customerPoints` / `customerDirs`, `seatPoints` / `seatDirs` (the `sit` anchor), `lyingPoints` / `lyingDirs` /
  `lyingHeadPoints` / `lyingFeetPoints` / `lyingAxis` (sunbathers), `workPoints` / `workDirs` (kneeling diggers),
  `playPoints` / `playDirs`, `standPoints` / `standDirs` (shower), `doorPoint`, `ladderPoint`, `lookPoint` / `lookDir`.
- **Water:** `waterPlane: true`, `waterline: "anchor"`, top-level `waterPx` 30.
- **Tiles:** `tileAxis`, `segM` √2, `stepPx` (64, 32) along X or (64, −32) along Y, `cuts`, `rampM`, `openEnds`,
  `tileLayer`.
- **Anims:** every named loop is also listed as `anims.work`; all frames of a key share `frameSize` and `anchor`.

## How the game should use them
1. **Load:** add `'beach'` to `FRAGMENTS` in `src/core/Assets.js` (or to `LAZY_FRAGMENTS`). Sprite anims register
   themselves as `spr:<key>:<anim>`; the boats and the crab are built like other characters as `<key>:<anim>:<dir>`.
   Also register the overlay frames as `<key>:over_<anim>:<dir>`, as `beach_phaser.mjs` does.
2. **Ground layering:** snow everywhere, then `ground_sand` (or `ground_sand_wet` on the band next to the sea) on
   sand cells. Draw the `ground_sand_snow_*` kit on the border cells by the `sandKit` rules, then the `decal_*`, then
   the depth-sorted sprites. Draw the textures as patterns anchored at the grid origin, scale 1.
3. **Levels:** z 0 is the sand, and people walk on the boardwalk with no lift. The sea surface is 0.55 m lower
   (`waterPx` 30). Put the anchor of every water-plane prop and boat on a sea point.
4. **Sea:** the beach faces the sea on −Y (screen down-left), like the harbour waterfront. Draw the water with
   `assets/water` (`Water.js`, palette `tropical`, shore type `sand`). Without the shader, use `fx_shore_wave_x`
   (scale 2, chained every (+256, +128) px on the waterline), but that sheet is drawn for a sea on the far (+Y)
   side. For this beach, flip it both ways (`setFlip(true, true)`, which is a 180° turn). That keeps the coast line
   and puts the sea on the near side. `beach_scene.png` shows it this way.
5. **Tiles:** chain the boardwalk and buoy-line tiles at `stepPx`; the joins are seamless, shadows included. Play
   all buoy-line tiles' `bob` at the same frame index so the wave travels along the line.
6. **Lifeguard tower:** draw the tower at depth d, the guard at `staffPoint` at d + 0.5, and `lifeguard_tower_front`
   at d + 1.
7. **Sunbathers:** put a beachfolk `sunbathe` frame at `lyingPoints[i]`, facing `lyingDirs[i]`. Loungers along Y lie
   NE; the `_x` ones lie NW.
8. **Boats with riders:** draw the boat frame, then each rider (townsfolk / beachfolk `sit` frame facing
   `seatDirs[dir][k]`) at `seats[dir][k]` in `seatDrawOrder[dir]`, then the `over_` frame. Mirrored headings negate
   dx and flip every layer. Put `fx_wake_v2` at `wakePoint` while moving.
9. **Banana boat:** it is towed. Keep the towing boat's stern just ahead of `towPoint[dir]` and draw a rope.
10. **Sandcastle building:** swap `sandcastle_build_0` → `_3` in place while kids `dig` at `workPoints`.
11. **Crab:** `dir` is the movement direction (it scuttles sideways). Draw a soft ellipse `shadow` [34, 14] under it.
12. **Do not flip** baked-shadow sprites. Use the `_x` / `_y` variants instead.

## Scripts and how to rebuild
New scripts: `tools/blender/beach_lib.py`, `beach_assets.py`, `beach_props.py`, `beach_water.py`, `beach_boats.py`,
`beach_render.py`, `beach_pack.py`, `beach_check.py`, `beach_preview.py`, `tools/fx/gen_beach_ground.py`,
`tools/fx/check_beach_ground.py` and `tools/test/beach_phaser.mjs`. They only import the existing helpers
(`bl_common`, `prop_lib`, `life2_lib`, `veh_lib`, `town_lib`, `bld_assets` / `bld_render` / `bld_boats`,
`harbor_water` / `harbor_render` / `harbor_pack`, `char_pack`, `pack_utils`, `prop_pack`, `fxlib`, `gen_ground`); no
existing script or asset was edited.

```
python3 tools/fx/gen_beach_ground.py                                  # ground textures + kit + decals (+ check)
/tmp/bvenv/bin/python tools/blender/beach_render.py -- [keys] [--force]   # cache /tmp/fv_cache/beach (resumable)
python3 tools/blender/beach_pack.py                                   # atlases + merged manifest + previews
python3 tools/blender/beach_pack.py --previews-only                   # redraw docs/previews/beach_* only
python3 tools/blender/beach_check.py
python3 tools/fx/check_beach_ground.py
node tools/test/beach_phaser.mjs
```
`beach_pack.py` merges into the manifest: it keeps the ground generator's keys, and it refuses to write (exit 1) if
a key it owns has no complete render in the cache.

## Previews (`docs/previews/`)
- `beach_all.png`: every key at 1x, labelled, with one anim frame each; water props on turquoise.
- `beach_scene.png`: a 1x mock beach: sand with the snow kit and bays, the wet slope, the sea from `assets/water`
  (tropical LUT, ripples, and the `fx_shore_wave_x` crest turned 180°), props, the buoy line and raft, boats with riders, the towed banana boat, crabs, townsfolk and the chief (1.45 m) for
  scale.
- `beach_ground.png`: ground textures, kit and decals.
- GIFs: `beach_parasols.gif` (flutter), `beach_palms.gif` (sway), `beach_service.gif` (shower water, ice-cream bell,
  corn grill), `beach_play.gif` (ball bounce, kite), `beach_sandcastle.gif` (4 build stages),
  `beach_water_props.gif` (buoy line, raft), `beach_swan.gif`, `beach_kayak.gif`, `beach_banana.gif`,
  `beach_crab.gif`.
- `beach_phaser.png`: the headless Phaser load.

## Known issues
- **Beachfolk was not finished when the previews were drawn.** `assets/beachfolk` had only `bf_adult_slim_0` and
  `bf_head_0`. Where beachfolk had no frames (lifeguard, sunbathers, swimmers, kids digging), `beach_scene.png` uses
  Townfolk2 people, so some figures wear winter clothes. When beachfolk is complete, run
  `python3 tools/blender/beach_pack.py --previews-only`. It redraws only `docs/previews/beach_*` and does not touch
  `assets/beach`.
- **The shore wave faces the wrong way for this beach.** `fx_shore_wave_x` / `_y` from `assets/water` assume the sea
  is on the far side. This beach faces −Y, so flip the sheet both ways (see "How the game should use them", item 4),
  or let the `Water.js` shader draw the swash.
- **The sea in `beach_scene.png` is not the game's water.** It is a still numpy imitation of the `Water.js` look:
  the tropical LUT, the two ripple textures, foam lace, and one shore-wave frame. In the game the shader animates the
  swell, the swash and the wet band.
- **Boats render 3 headings.** Boats have S, SE and NE; SW and NW are mirrors, and E, W and N use `nearest`, as the
  ships do. The crab has 5 rendered directions plus mirrors.
- **Some things are left for the game to draw:**
  - the crab's soft shadow (`shadow` [34, 14]),
  - the kite string from `stringPoint` to the kid's hand,
  - the banana boat's tow rope,
  - wakes (`fx_wake_v2` at `wakePoint`),
  - the text on the `beach_sign_*` boards (at `fxPoints.board`).
- **No `_snow` variants.** The contract makes them optional. Props at the snowy edge sit on the sand side of the
  `ground_sand_snow_*` kit.
- **Previews were redrawn with `--previews-only`.** This picked up the current `assets/water` (water polish) and
  the new scene framing. `assets/beach` is byte-identical to the last full pack, which was deterministic: two runs
  gave the same md5 sums.
