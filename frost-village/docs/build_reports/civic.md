# civic build report

The civic and incident set for CONTRACT_V8 §AB, after the polish pass:
- `assets/civic/` holds 54 sprites and 2 vehicles in 10 atlases.
- The payload is 2.02 MB (the limit is 7 MB). All atlases together use 37.4 MB of GPU memory.
- `civ_check.py` reports 0 errors and 0 warnings, including the new layout, mirroring, point-clearance, ember and readability rules.
- A headless Phaser 3.90 load found all 186 frames and registered 32 anims (18 playing in the demo). The tap-to-reveal test passed: hovering fades the bank's shell to its `openAlpha` 0.12 and shows `_shell_cut`, while the police station stays closed.
  - The demo now draws two M demolition plots from `demolitionLayout.M.sides`: Y-, and X+ with the vehicles mirrored the way the game mirrors them (`setOrigin(anchor)` + `setFlipX`).
  - The demo also shows the loaded truck (the truck anim plus the cargo-overlay anim), the town ruins smouldering, and the truck tipping onto a `dump_pile`.
- Re-packing produces byte-identical files.
  - Two packs into empty folders are identical (21 files), and their atlases match `assets/civic`.
  - Re-packing in place reproduces `assets/civic` exactly.
  - The production manifest has no stale keys left over from the merge with the old one.
- The packer's guard still works: with an empty cache it stops with exit 1 and writes nothing.

The art follows the house style: toy-like, snowy and warm. Ruins are charred but cute (snow-capped beams, warm soot, one surviving cute thing in each). A ruin is cold once its smoke overlay is removed.

## What changed in the polish pass
- **Demolition reads now.**
  - The excavator stands on the street side, in front of the ruin, and digs over the fence. Its bucket bites the ruin's front at `digFrame` 2, about 3.3 m ahead of the excavator, so it clears the fence on every plot size.
  - `dig` now swings LEFT, away from the camera, to dump. The dump truck parks on that side, behind the excavator. On the front sides the truck covers 0% of the excavator, and 96% of the truck stays visible.
  - There are layouts for all four street sides (`sides.Y- / X+ / X- / Y+`). Each has a `gateIndex`: the fence piece to leave out, which no vehicle blocks.
- **Mirroring is exact.** Excavator and dump-truck frames are padded so `anchor x` is exactly 0.5. `setOrigin(anchor)` + `setFlipX(true)` therefore mirrors around the anchor.
  - The padding is trimmed in the atlas, so it costs no memory.
  - Before: the excavator was 42 px off on a 332 px frame (ax 0.43675), and the dump truck 24 px off on 348 px.
- **The bank has its own identity.**
  - Honey-sandstone ashlar walls with cream quoins.
  - A burgundy slate mansard roof with round gold coin dormers and a big gold coin finial on a drum.
  - A burgundy frieze sign with gold coin stacks, a burgundy pediment and door, a round coin window and a piggy bracket sign.
  - Mean luminance fell from 204 to 172, and the roof is no longer a blank white slab.
  - The layer split, footprint and anchor rule are unchanged.
- **The bank interior is untangled.**
  - The waiting seats are a red velvet bench on the front-left wall. The nearest seat is 82 px from any counter or queue point; before, it was 8 px.
  - The ATM moved to the front-right corner, on the right wall, and its user faces it (SE).
  - The piggy statue is a little smaller, and the plant that blocked the lane is gone.
- **The police cell is cosy, not a cage.** The bars are powder blue with gold knobs, 0.16 m apart and 1.7 m high, and there is a sleepy-moon "time-out" sign. The desk officer moved 0.3 m to +X, so the inmate's face at `cellPoint` is clear.
- **Police car bay fixed.**
  - The painted bay is wider and the car parks 0.45 m further out (`carBayPoint` [115, 58]).
  - The car's near door point is 0.35 m off the wall, and `sideDoorPoint` [96, 5] is clear of the parked car.
  - The footprint grew to 7.2 × 4.6 m. The new `buildingRectM` / `carBayRectM` give the walls and the bay in metres.
- **Town ruins.**
  - `ruin_house_town` was rebuilt:
    - Neutral cream clapboard that fits every townhouse colour, with warm charcoal soot (#4A3F3A) instead of near-black.
    - The gable is about a third lower, there are snow caps on the broken edges, and the chimney is at the back like the townhouses' chimneys.
    - The flower box is big.
    - Mean luminance rose from 88 to 146, and near-black pixels fell from 26% to 2%.
  - New `ruin_shop_town` (town lot M, 3.4 × 3.0 m) and `ruin_l_town` (town lot L, 4.4 × 3.4 m).
  - New `ruinFor` maps every building to its ruin, scorch decal, rubble pile and fence ring.
- **Rubble reads as debris.** It is mottled ash-grey and warm charcoal with brick-red crumbs, charred timber with light wood ends, lots of bricks and only a dusting of snow. Mean luminance fell from 180 to 105–135.
- **Smoke and embers.**
  - The ruin smoke is one continuous warm-grey wisp (dark core, light top). It renders at 64 samples, is smoothed with a premultiplied blur, and is packed RGBA in the new `civ_smoke` atlas, so it has no palette speckle.
  - The embers moved out of the base ruins (0 ember pixels left; before, 30 / 110 / 68 / 22) into the `_smoke` overlay, where they flicker.
- **Readable props.**
  - `wanted_board` is 2.9 m wide with three big portrait windows (`posterSizePx` 42 × 35; before, 24 × 19), a magnifier pictogram on the red header and a coin on the reward strip.
  - `for_sale_sign` carries a house with a gold price tag and a coin. `sold_sign` has a ribbon and a big pink heart.
  - The `fire_alarm_post` lamp flashes bright yellow-white with a halo, and the bell swings ±15°. About 730–880 px change per frame; before, 46–324.
- **Dump truck.**
  - The loaded look is now a cargo overlay (`cargo_{idle|move}_{dir}_{i}`) instead of two whole extra anims. The atlas fell from 2040 × 1708 to 2040 × 1292, so the truck uses 10.0 MB of GPU memory instead of 13.9 MB.
  - `tip` pours a rubble stream at frames 2–3, and the new `dump_pile` prop goes at `tipPoint` from `pileFrame` 3.
- **Previews** use the cityfolk outfits: bank tellers and a banker, police officers, a little burglar in the cell, movers and a demolition worker. The fire sequence shows the whole smoke column, and a new sheet shows every demolition layout.

## Keys
- **Bank** (`bank`, 은행 "솔방울 은행", footprint 5.4 × 4.6 m): the sandstone, burgundy and gold hall described above.
  - It is a cutaway, like the logistics centre. The layers are `bank_floor`, `bank_back`, `bank_interior`, `bank_front`, `bank_shell_cut` and `bank_shell`, plus the overlay `bank_vault`.
  - `bank_vault` is the round vault door. `anims.vault` is 8 frames that open it; `vault_close` reverses them.
  - Inside:
    - Teller counter with glass partitions and number lamps, plus a number display.
    - The red velvet waiting bench on the front-left wall.
    - The ATM in the front-right corner, the manager desk, the piggy statue and the money cart.
    - A vault room with gold bars.
- **Police station** (`police_station`, 경찰서, footprint 7.2 × 4.6 m including the car bay): a white-and-navy clapboard station with a light bar, a star badge sign and a painted car bay.
  - It is a cutaway with the same layer set, plus the overlay `police_station_cell`.
  - `police_station_cell` is the cell door. `anims.open` is 6 frames; `close` reverses it.
  - The cosy cell has powder-blue bars with gold knobs and the time-out sign. Inside are a cot with a patchwork quilt, a teddy, cocoa, a flower and a red rug.
  - The room also has a reception desk with donuts, a stove with a kettle, a filing cabinet, a visitor bench and coat hooks.
- **Incident props:**
  - `wanted_board`: three big portrait windows, a magnifier header and a coin reward strip.
  - `fire_hydrant`.
  - `fire_alarm_post`: `anims.work` / `anims.ring` is 4 frames. The lamp flashes and the bell swings.
- **Fire aftermath:**
  - Village ruins: `ruin_s` (log cottage), `ruin_m` (log house) and `ruin_l` (brick building) for plots S / M / L (2 / 3 / 4 m).
  - Town ruins:
    - `ruin_house_town`: townhouses and the police box, 2.6 m.
    - `ruin_shop_town`: town lot M, 3.4 × 3.0 m. It has an awning frame with tatters, a shop bell, a basket bracket sign, and a mug and a flower pot on the sill.
    - `ruin_l_town`: town lot L, 4.4 × 3.4 m. It has a false front with a green stripe, a toppled shelf with cans and boxes, and a shopping cart.
  - Every ruin has a smoke overlay, `ruin_*_smoke`. It shows smoke wisps and flickering embers: `anims.smoke`, 4 frames, looping, in the `civ_smoke` atlas.
  - Ground decals: `scorch_decal_s/m/l`.
  - `rubble_pile_s/m/l`, plus `_half` stages that share the same frame and anchor.
  - `dump_pile`: 1.4 × 1.2 m, the heap a dump truck leaves at the dump.
  - `insurance_sign`: an umbrella over a house.
- **Demolition:**
  - Fence tiles `demolition_fence_x` / `_y`, plus `_lamp` variants (`anims.blink`, 2 frames) and `demolition_fence_post`.
  - `excavator`: idle, move, and `dig` (8 frames, swings left to dump).
  - `dump_truck`: idle, move and `tip` (6 frames), plus the cargo overlay frames `cargo_idle_{SE,NE}_{0,1}` and `cargo_move_{SE,NE}_{0..3}`.
- **Moving:**
  - `moving_boxes_stack`, `furniture_pile_s` and `furniture_pile_l` (`furniture_pile` is an alias of `_l`).
  - `for_sale_sign` and `sold_sign`, both with pictograms.
  - `welcome_mat`, a ground decal.

Atlases: `civ_bank`, `civ_police`, `civ_ruins`, `civ_smoke`, `civ_props`, `civ_moving`, `civ_demo`, `civ_decals`, `civ_excavator`, `civ_dump_truck`.
- All are palettised except `civ_smoke`, which is RGBA because of its soft alpha.
- Every sheet is at most 2048 px.

| atlas | size | frames | on disk |
|---|---|---|---|
| civ_bank | 1780×740 | 15 | 161.5 KB |
| civ_police | 1884×708 | 13 | 145.4 KB |
| civ_ruins | 1840×532 | 12 | 222.5 KB |
| civ_smoke | 1888×492 | 24 | 515.2 KB |
| civ_props | 1300×220 | 11 | 28.8 KB |
| civ_moving | 504×180 | 3 | 19.1 KB |
| civ_demo | 1040×116 | 10 | 20.7 KB |
| civ_decals | 1016×232 | 3 | 67.5 KB |
| civ_excavator | 1960×952 | 28 | 357.5 KB |
| civ_dump_truck | 2040×1292 | 36 | 428.9 KB |

## Fields
All points are pixel offsets from the anchor. `*Dir` gives the facing; SW, W and NW are mirrored frames.

**Cutaways** (`sprites.bank.cutaway`, `sprites.police_station.cutaway`), unchanged:
- `layers` and `drawOrder`. For the bank the order is floor, back, interior, vault, `@behind`, front, `@front`, shell_cut, shell. The police station has the cell overlay after front.
- `overlays`.
- `fade`: `layer` _shell, `openAlpha` 0.12, `ms` 260.
- `cut`: _shell_cut is shown only while the building is revealed.
- `revealPoly`: the silhouette polygon, used for tap and hover tests.
- `floorLiftPx`.
- On the building entry, `pointSlots` maps each point field to `behind`, `front` or `outside`.

**Bank:**
- `staffPoints`: tellers ×3 facing SW, then the manager.
- `customerPoints`: the queue, 3 spots facing NE.
- `counterPoints`: one per teller window, facing NE.
- `seatPoints`: the waiting bench, at seat height and facing SE. The nearest is 82 px from any counter or queue point, and `civ_check` requires at least 30 px.
- `atmPoint` [17, 35], facing SE into the ATM.
- `vaultPoint`, `deskPoint`, `entryPoint`, `doorPoint`.
- `fxPoints`: sign, display, vault, lamp.

**Police station:**
- `staffPoints`: the desk officer, now 0.3 m further to +X, and the filing officer.
- `customerPoints`: visitors at the desk.
- `seatPoints`: the bench.
- `cellPoint` / `cellPoints`: the inmate on the cell rug, facing SE.
- `cellSeatPoint`: the edge of the cot.
- `cellDoorPoint`: the officer at the cell door.
- `carBayPoint` [115, 58] / `carBayDir` (SW): where `police_car` from assets/vehicles parks.
- `doorPoint`, `entryPoint`, `sideDoorPoint` [96, 5].
- New `buildingRectM` [−3.1, 0.9, −1.4, 1.8] and `carBayRectM` [1.38, 3.56, −2.18, 2.18]: the walls and the painted bay as [x0, x1, y0, y1] metres from the anchor.

**Props:**
- `wanted_board`:
  - `posterPoints`: 3 portrait windows (same geometry as before).
  - `posterSizePx` [42, 35] (was [24, 19]).
  - `gatherPoints`: where readers stand.
  - `posterNote`: on tap, open fx_city `ui_wanted_poster`.
- `fire_hydrant`: `hosePoint`.
- `fire_alarm_post`: `fxPoints` (bell, lamp).
- Signs: `boardPx` and `fxPoints.board`, the free strip where the game may write text. `boardPx` is [35, 6] for for-sale and sold, and [58, 16] for insurance. The pictograms are baked, so the text is optional.
- `moving_boxes_stack`: `dropPoint`.

**Ruins and rubble:**
- Ruins carry `workPoints` / `workDirs`, which are crew and bucket spots.
- Ruins also carry `fxPoints`: smoke bases, chimney, ember, and on `ruin_shop_town` the sign.
- `<ruin>_smoke` entries carry `of: <ruin>`. They are drawn at the ruin's position and anchor.
- Rubble carries `stage` / `stages`.
- Anchors and footprints:
  - Village ruins match `site_plot_S/M/L` in assets/buildings.
  - `ruin_house_town` matches `townhouse_a..d`.
  - `ruin_shop_town` and `ruin_l_town` match the town lots M [3.4, 3.0] and L [4.4, 3.4].
  - A ruin replaces its building in place.
- Scorch decals: anchor at the centre, `radiusM`, `plotM`, `layer: ground`.
- `dump_pile`: a decor heap with `workPoints`.

**Vehicles** (`characters.excavator`, `characters.dump_truck`): same conventions as assets/vehicles.
- Headings: SE and NE are rendered; SW and NW are mirrored. Frames are named `{anim}_{dir}_{i}`.
- `anchor[0]` is exactly 0.5: excavator frames are 398 × 292 and dump-truck frames 372 × 388.
- An operator is baked into each cab. There is no baked shadow; use the `shadow` ellipse.
- `excavator`:
  - `anims.dig.digFrame` 2 (bite) and `dumpFrame` 5 (dump to the left).
  - `bucketPoint[anim][dir][i]` gives the bucket position per frame.
  - `digPoint` / `dumpPoint` are the ground points under the bucket.
- `dump_truck`:
  - `cargoPoint`, `cargoGround` and `bedPoint[anim][dir][i]`.
  - `tipPoint` and `anims.tip.tipFrame` 2. New: `pileFrame` 3.
  - New `cargoOverlay`: `{frameName: 'cargo_{anim}_{dir}_{i}', anims: [idle, move], frames: {idle: 2, move: 4}}`. Draw it on top of the truck frame with the same position, origin and flip.

**Top-level manifest fields:**
- `fenceRings.S/M/L`: fence pieces with px offsets from the plot centre. The rings are 2.83 / 4.24 / 5.66 m squares, so they fit the town lots too.
- `demolitionLayout.S/M/L` (v2):
  - `.default` = `Y-`.
  - `.sides[Y- | X+ | X- | Y+]` = `{excavator: {at, dir, anim, worldM, digPointWorldM, notes}, dump_truck: {at, dir, worldM, anim, notes}, gateIndex, digVisible, checks}`.
  - `at` is px from the plot centre. `checks` holds the screen-space test results: `digVisible`, `bucketCoveredSamples`, `truckCoversExcavator`, `truckVisible`.
  - The flat `excavator` / `dump_truck` / `gateIndex` fields mirror `sides.Y-`, for older readers.
- `ruinFor`: building key → `{ruin, scorch, rubble, ring}`. `'*'` describes the fallback.
- `fireSequence`: the step list.
- `conventions`. New: `flip`, `vehicles` (the cargo overlay, `pileFrame`) and `demolition`.

## How the game uses them
1. **Load:** add `'civic'` to `LATE_FRAGMENTS` (or `FRAGMENTS`) in `src/core/Assets.js`. I did not edit src; that belongs to the code agents.
   - Sprite anims register as `spr:<key>:<anim>`: `spr:bank_vault:vault`, `spr:police_station_cell:open`, `spr:ruin_m_smoke:smoke`, `spr:fire_alarm_post:ring`, `spr:demolition_fence_x_lamp:blink`.
   - Vehicles load like assets/vehicles. Also register the cargo anims `cargo_idle_{dir}` and `cargo_move_{dir}` from `cargoOverlay`.
   - `civ_smoke` is only needed while something smoulders, so it can be loaded lazily.
2. **Cutaways:**
   - **Closed:** draw only the `<key>` sprite, which is all layers composited.
   - **Open:** draw every layer at the building's position and origin, in `drawOrder`, with depth = base + 0.01 × index. Put characters into `@behind` / `@front` according to `pointSlots`.
   - **Reveal:** on a tap or hover inside `revealPoly` (or when the chief walks in), fade `_shell` to `openAlpha` and fade in `_shell_cut`.
   - **Bank:** play `vault` when someone goes to `vaultPoint`, and `vault_close` after.
   - **Police station:** play `open` when an officer at `cellDoorPoint` brings someone to `cellPoint`, then `close`.
3. **Bank flow:**
   - A customer goes door → `entryPoint` → queue (`customerPoints`) → `counterPoints[i]`, served by `staffPoints[i]`.
   - The manager is at `deskPoint`.
   - ATM users stand at `atmPoint`, and waiting customers sit on the `seatPoints` (sit pose).
4. **Police:** park `police_car` at `carBayPoint` heading `carBayDir`. Staff use `sideDoorPoint`. The game can test against `buildingRectM` / `carBayRectM`.
5. **Fire → rebuild** (also in `fireSequence`):
   1. **Burning:** fx_city `fx_fire_bld_<s|m|l>` and `fx_smoke_column`.
   2. **Ruin:** use `ruinFor[building]`.
      - Swap the building for `ruin` at the same anchor and put `scorch` on the ground layer.
      - Draw `<ruin>_smoke` on top while it smoulders, and put an `insurance_sign` nearby.
      - Remove the overlay when it has cooled; the base ruin is cold.
   3. **Demolition:** take `demolitionLayout[ring].sides[<the plot's street side>]`, or `default` (`Y-`).
      - Put up `fenceRings[ring]` without the `gateIndex` piece.
      - Place the excavator (`dig`) and the dump truck at their `at` and `dir`. For SW / NW, use `setOrigin(anchor)` + `setFlipX(true)` and negate the dx of every point.
      - At `digFrame`, play fx_city `fx_demolish_dust` at `bucketPoint`.
      - From `dumpFrame` on, draw the truck's cargo overlay.
      - Swap the ruin for `rubble`, then `_half`, then nothing.
      - Prefer the front sides (`Y-`, `X+`), where `digVisible` is true.
   4. **Clearing:** the truck leaves with `move` plus `cargo_move`. At the dump it plays `tip`, with the cargo overlay hidden from tip frame 0, and places `dump_pile` at `tipPoint` from `pileFrame`.
   5. **Rebuild:** place assets/buildings `site_*` at the same anchor, remove the fence, fade out the scorch decal, then place the new building.
6. **Wanted board:** draw resident portraits centred on `posterPoints`, scaled to `posterSizePx`; residents read it from `gatherPoints`. On a tap, open fx_city `ui_wanted_poster`.
7. **Moving:**
   - Swap `for_sale_sign` for `sold_sign` when the house sells.
   - Put `moving_boxes_stack` and `furniture_pile_*` by the door; movers carry boxes to `dropPoint`.
   - Place `welcome_mat` at the new family's `doorPoint` on the ground layer.
   - The truck is assets/logistics `moving_truck`.
8. **Fire brigade:** firefighters connect at `fire_hydrant.hosePoint`. `fire_alarm_post` plays `ring` when a resident reports a fire; pair it with fx_city `fx_alarm_flash` at `fxPoints.lamp`.

## Scripts and how to rebuild
These are all new files, owned by this set:
- `tools/blender/civ_lib.py`: layer tagging, overlays and materials.
  - Polish added `rubble_mat`, `SoftSmoke2` and `smoke_wisps2`, siding planks in `scorched`, and light wood ends on `charred_beam`.
- `tools/blender/civ_assets.py`: all builders.
  - Polish added the new bank shell and interior, the police cell and bay, `ruin_smoke`, the town ruins, the rubble, `dump_pile`, the wanted board, the alarm and the signs.
- `tools/blender/civ_veh.py`: the excavator (left-swing `dig`) and the dump truck (tip stream, cargo overlay renders).
- `tools/blender/civ_render.py`: smoke overlays render at 64 samples or more.
- `tools/blender/civ_decals.py`: procedural scorch decals.
- `tools/blender/civ_pack.py`:
  - Anchor centring for vehicles.
  - The `civ_smoke` RGBA atlas with premultiplied smoothing.
  - `demolitionLayout` v2: a search with separating-axis gaps in metres plus screen-space pixel checks using the real sprites.
  - `ruinFor`, the cargo overlay and the police rects.
- `tools/blender/civ_preview.py`
- `tools/blender/civ_check.py`. New rules:
  - Vehicle anchor within 2 px of the centre.
  - Cargo overlay frames and `pileFrame`.
  - Bank seats at least 30 px from counter and queue points.
  - Police car vs side door, walls and its own door points.
  - `posterSizePx` at least [40, 34].
  - Every ruin has a smoke overlay, at most 6 ember pixels in a base ruin, and a luminance warning below 105.
  - `demolitionLayout` sides, clearances, dig point inside the plot, bucket over the bed, `gateIndex`, bucket visible on the front sides, and truck covering at most 30% of the excavator.
  - `ruinFor` keys exist.
- `tools/test/civic_phaser.mjs`

The scripts import the existing helpers read-only: `bl_common`, `prop_lib`, `bld_assets` / `bld_render`, `town_lib`, `veh_lib` / `veh_models` / `veh_render`, `pack_utils`, `prop_pack`, `char_pack`, `town_pack.Scene` and `cityfolk_compose`. No existing script or asset outside this set was edited.

```
/tmp/bvenv/bin/python tools/blender/civ_render.py -- [keys|zones|prefix*] [--force] [--samples N] [--threads N] [--list]
python3 tools/blender/civ_pack.py [--out DIR] [--prev DIR] [--no-previews] [--allow-partial]
python3 tools/blender/civ_preview.py [--out DIR] [--prev DIR]
python3 tools/blender/civ_check.py [--out DIR]
node tools/test/civic_phaser.mjs
```
- **Render cache:** `/tmp/fv_cache/civic`. Cycles uses 2 fixed threads, and rendering resumes where it stopped.
- **Polish render times on the shared CPU:**
  - bank ≈ 14.5 min
  - police station ≈ 10.5 min
  - dump truck with cargo overlays ≈ 12 min
  - excavator ≈ 8 min
  - six ruins with smoke overlays ≈ 11.5 min (plus 5.5 min to re-render 4 after a material fix)
  - rubble ≈ 2 min
  - props ≈ 1.5 min
- **Packer:** it merges into the existing manifest and refuses to write when a current or required key is missing from the cache. Packing takes about 1.5 min without previews.

## Previews (`docs/previews/`)
- `civ_all.png`: everything, labelled.
  - Both cutaways closed and revealed.
  - All six ruins with smoke, plus rubble, `dump_pile` and the props.
  - Vehicle frames, including the loaded and tipping truck.
- `civ_bank_cutaway.png` / `civ_police_cutaway.png`: the exploded layers, then closed, revealing, open with cityfolk people in their slots, and the overlay's last frame.
  - Bank: tellers, the banker, customers, the ATM user and two waiting people on the bench.
  - Police: officers, a visitor, and a sheepish little prankster in the cosy cell.
- `civ_fire_sequence.png`: one S plot in 8 steps.
  - house → fire (whole smoke column) → ruin + smoke & embers → cooled down + insurance sign
  - → fence (gate open) + excavator biting + truck → rubble + loaded truck → construction site → new house.
- `civ_demolition_layouts.png` (new): every plot size × street side at 1x.
  - A magenta ring marks the bucket.
  - Each cell is labelled with bite visibility and truck coverage.
- `civ_scene.png`: a town corner at 1x.
  - The bank revealed.
  - The wanted board on the pavement with three portraits, an officer pointing at it, and the police station with `police_car` in its bay.
  - Moving day with the assets/logistics `moving_truck` and movers carrying boxes.
  - A cold burnt M plot being cleared from its X+ side (mirrored excavator with a dust puff at the bite, loaded truck behind it) and a demolition worker.
- `civ_phaser.png` / `civ_phaser_closed.png`: the live Phaser demo, with the bank revealed by hover.
- GIFs: `civ_vault.gif`, `civ_reveal.gif`, `civ_cell.gif`, `civ_excavator.gif`, `civ_dump_truck.gif`, `civ_ruin_smoke.gif`, `civ_alarm.gif`, `civ_fence_lamp.gif`.
  - The dump-truck GIF runs loaded → tip with stream and pile → empty.
  - The ruin-smoke GIF includes the town ruins.

## Critic issues
| # | severity | issue | result |
|---|---|---|---|
| 1 | high | Demolition layout: truck hides excavator, gate blocked, bucket hidden behind ruin and fence | **fixed**. `dig` re-rendered with a left swing and a 3.3 m reach. Layout v2 has 4 sides with `gateIndex`. Front sides: bite visible, truck covers 0%. Enforced by civ_check. |
| 2 | high | Vehicle mirroring: anchor x far from 0.5 | **fixed**. Frames padded to ax = 0.5 (0 px off), with `conventions.flip`. civ_check enforces ≤ 2 px, and the Phaser demo mirrors X+ with setFlipX. |
| 3 | medium | Bank exterior reads as a town-hall annex | **fixed**. Sandstone, burgundy and gold palette; mansard roof with coin dormers and a gold coin finial; frieze sign; coin window. Layers and anchor unchanged. |
| 4 | medium | ruin_house_town too dark, mustard siding, chimney in the wrong place | **fixed**. Cream siding, warm charcoal soot, gable ~1/3 lower, snow caps, chimney at the back, big flower box. Luminance 88 → 146; near-black pixels 26% → 2.3%. |
| 5 | medium | No town-shop ruin | **fixed**. `ruin_shop_town` (lot M) and `ruin_l_town` (lot L), plus a `ruinFor` map for every building family. |
| 6 | medium | Wanted board portraits too small, blank header | **fixed**. 2.9 m board, `posterSizePx` 24×19 → 42×35, magnifier pictogram, coin reward strip, `posterNote` pointing at fx_city `ui_wanted_poster`. |
| 7 | medium | Police cell reads as a black cage; desk officer overlaps the inmate | **fixed**. Powder-blue 1.7 m bars, 0.16 m apart, with gold knobs; time-out sign; desk officer moved 0.3 m to +X. |
| 8 | medium | Bank seats stacked on the counter points | **fixed**. Bench on the front-left wall, at least 82 px from every counter and queue point (was 8 px). ATM moved to the front-right corner. civ_check enforces ≥ 30 px. |
| 9 | medium | Parked police car covers the side door; car door point inside the wall | **fixed**. Wider bay, `carBayPoint` [115, 58], side door clear, near car door 0.35 m off the wall. civ_check tests against police_car `footprintPoly` / `doorPoints` and `buildingRectM`. |
| 10 | medium | Rubble reads as a snowdrift | **fixed**. Ash-grey and charcoal mottled heap with brick-red crumbs, charred timber with wood ends, a light snow dusting. Luminance 180 → 105–135. Footprints and anchors unchanged. |
| 11 | low | Smoke pale, beaded and speckled | **fixed**. One continuous warm-grey wisp at 64 samples, smoothed, packed RGBA (`civ_smoke`). |
| 12 | low | Embers baked into the base ruins | **fixed**. 0 ember pixels in every base ruin (was 30 / 110 / 68 / 22). Embers flicker in the `_smoke` overlay. civ_check enforces this. |
| 13 | low | for_sale / sold signs blank | **fixed**. House with gold price tag and coin; sold has a ribbon and a big pink heart. `boardPx` kept for optional text. |
| 14 | low | Alarm ring anim too subtle | **fixed**. Yellow-white lamp flash with a halo, bell swinging ±15°. 730–880 px change per frame (was 46–324). The fx_city `fx_alarm_flash` pairing is documented. |
| 15 | low | Dump truck tip has no stream; loaded anims double the memory | **fixed**. Rubble stream at tip frames 2–3, `dump_pile` at `tipPoint` from `pileFrame` 3, cargo overlay instead of loaded anims. Atlas 2040×1708 → 2040×1292 (13.9 → 10.0 MB GPU). Not fully visible in SE: see Known issues. |

Every issue reproduced before it was fixed:
- **Checked against the old manifest and frames:** the layout coordinates, ax 0.43675 / 0.53448, seat-to-counter distances of 8–27 px, the side door inside the car polygon, `posterSizePx` [24, 19], ember pixels baked into the base ruins, and luminance 88 for ruin_house_town.
- **Seen in the old previews:** the bank, the cell, the rubble, the smoke, the signs, the alarm and the tip.

Kept as the critic asked:
- The cutaway layer split, `drawOrder` slots, fade and cut metadata, and `revealPoly`.
- Ruin and rubble footprints and anchors.
- The vault and cell-door anims.
- The wanted-board point geometry.
- Vehicle modelling and outlines.
- The police station's look.
- The moving props, the fence tiles and rings, and the insurance sign.
- The bank interior dressing.
- The pipeline guard.

## Known issues
- **Back-side demolition:** `X-` / `Y+` layouts (street behind the plot) have the excavator behind the ruin, so the ruin hides the bite (`digVisible: false`). This is inherent to the view. Use a front side when the plot allows it, or fade the ruin a little while digging.
- **Tip stream partly hidden:** in `tip_SE` the stream falls behind the truck body; in `tip_NE` the raised tailgate hides part of it. The `dump_pile` at `tipPoint` from `pileFrame` 3 makes the drop read anyway.
- **Ruins slightly shallower than two town buildings:** `fire_station` (4.2 × 3.6 m) and `post_office` (3.4 × 3.2 m) are 0.2 m deeper than the lots of `ruin_l_town` / `ruin_shop_town`. Centre the ruin on the building's anchor; the scorch decal covers the gap.
- **Wider police lot:** the police station's footprint grew from 6.4 to 7.2 m, 0.4 m on each side around the same anchor. The building did not move relative to the anchor, but the lot it reserves is 0.8 m wider. Nothing in src places it yet.
- **RGBA smoke atlas:** `civ_smoke` is 515 KB on disk and 3.5 MB GPU. Load it only while something smoulders.
- **Small bank interior:** with more than about 8 people inside, heads start to overlap. Suggested cap: 3 tellers, the manager and about 4 customers.
- **Seat-height points:** the bank `seatPoints` and police `cellSeatPoint` are at seat height, for the cityfolk `sit` pose. A standing sprite placed there needs about +25 px of y.
- **Phaser demo uses pegs:** the demo draws coloured pegs in the character slots. The previews use real cityfolk outfits.
