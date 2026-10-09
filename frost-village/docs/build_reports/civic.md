# civic build report

The civic and incident set for CONTRACT_V8 §AB is finished:
- `assets/civic/` holds 49 sprites and 2 vehicles in 9 atlases.
- The payload is 1.61 MB (the limit is 7 MB).
- `civ_check.py` reports 0 errors and 0 warnings.
- A headless Phaser 3.90 load found all 173 frames, registered 30 anims and passed the tap-to-reveal test. That test fades the bank's shell while the police station stays closed.
- Re-packing produces byte-identical files.
- The packer's guard works: with an empty cache it stops with exit 1 and writes nothing.

The art follows the house style: toy-like, snowy and warm. The ruins are charred but cute: snow on black beams, soot on the snow, a few embers and soft smoke wisps, and something that survived in each one (a rubber duck in a bathtub, a kettle on the stove, a flower box).

## Keys
- **Bank** (`bank`, 은행 "솔방울 은행", footprint 5.4 × 4.6 m): a cream sandstone hall with a white portico, a teal pediment, a gold coin on the roof and a piggy-bank sign.
  - It is a cutaway, like the logistics centre. The layers are `bank_floor`, `bank_back`, `bank_interior`, `bank_front`, `bank_shell_cut` and `bank_shell`, plus the overlay `bank_vault`.
  - `bank_vault` is the round vault door. `anims.vault` is 8 frames that open it; `vault_close` plays them in reverse.
  - Inside: teller counter with glass partitions and number lamps, number display, waiting chairs with a coffee table, ATM, manager desk, piggy statue, money cart and a vault room with gold bars.
- **Police station** (`police_station`, 경찰서, footprint 6.4 × 4.6 m including the car bay): a white-and-navy clapboard station with a light bar, a star badge sign and a painted car bay.
  - It is a cutaway with the same layer set, plus the overlay `police_station_cell`.
  - `police_station_cell` is the cell door. `anims.open` is 6 frames; `close` reverses it.
  - The cosy cell has a cot with a patchwork quilt, a teddy, cocoa, a flower and a red rug. The room also has a reception desk with donuts, a stove with a kettle, a filing cabinet, a visitor bench and coat hooks.
- **Incident props:**
  - `wanted_board`: a roofed notice board with 3 blank WANTED posters.
  - `fire_hydrant`.
  - `fire_alarm_post`: `anims.work` / `anims.ring` is 4 frames — the lamp flashes and the bell shakes.
- **Fire aftermath:**
  - `ruin_s` (log cottage), `ruin_m` (log house) and `ruin_l` (brick building) match plots S / M / L (2 / 3 / 4 m). `ruin_house_town` matches the town houses (2.6 m).
  - Each ruin has a smoke overlay: `ruin_*_smoke`, `anims.smoke`, 4 frames, looping.
  - Ground decals: `scorch_decal_s/m/l`.
  - `rubble_pile_s/m/l`, plus `_half` stages that share the same frame and anchor.
  - `insurance_sign`: a blank board.
- **Demolition:**
  - Fence tiles `demolition_fence_x` / `_y`, plus `_lamp` variants (`anims.blink`, 2 frames) and `demolition_fence_post`.
  - `excavator`: idle, move, and `dig` (8 frames).
  - `dump_truck`: idle, move, `idle_loaded`, `move_loaded`, and `tip` (6 frames).
- **Moving:** `moving_boxes_stack`, `furniture_pile_s`, `furniture_pile_l` (`furniture_pile` is an alias of `_l`), `for_sale_sign`, `sold_sign` and `welcome_mat`, which is a ground decal.

Atlases: `civ_bank`, `civ_police`, `civ_ruins`, `civ_props`, `civ_moving`, `civ_demo`, `civ_decals`, `civ_excavator`, `civ_dump_truck`. All are palettised and every sheet is at most 2048 px.

## Fields
All points are pixel offsets from the anchor. `*Dir` gives the facing; SW, W and NW are mirrored frames.

**Cutaways** (`sprites.bank.cutaway`, `sprites.police_station.cutaway`):
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
- `seatPoints`: at seat height, for a sitting pose.
- `atmPoint` (faces NW), `vaultPoint`, `deskPoint`, `entryPoint`, `doorPoint`.
- `fxPoints`: sign, display, vault, lamp.

**Police station:**
- `staffPoints`: desk officer and filing officer.
- `customerPoints`: visitors at the desk.
- `seatPoints`: the bench.
- `cellPoint` / `cellPoints`: the inmate on the cell rug, facing SE so the face reads between the bars.
- `cellSeatPoint`: the edge of the cot.
- `cellDoorPoint`: the officer at the cell door.
- `carBayPoint` / `carBayDir` (SW): where `police_car` from assets/vehicles parks.
- `doorPoint`, `entryPoint`, `sideDoorPoint`.

**Props:**
- `wanted_board`: `posterPoints` (3 portrait windows), `posterSizePx` [24, 19] and `gatherPoints`, where readers stand.
- `fire_hydrant`: `hosePoint`.
- `fire_alarm_post`: `fxPoints` (bell, lamp).
- Signs: `boardPx` and `fxPoints.board`, the area where the game writes text.
- `moving_boxes_stack`: `dropPoint`.

**Ruins and rubble:**
- Ruins carry `workPoints` / `workDirs`, which are crew and bucket spots.
- Ruins also carry `fxPoints`: smoke bases, chimney and ember.
- Rubble carries `stage` / `stages`.
- `footprintM` and the anchor match `site_plot_S/M/L` in assets/buildings, so a ruin replaces the building in place. `ruin_house_town` matches `townhouse_a..d`.
- Scorch decals: anchor at the centre, `radiusM`, `plotM`, `layer: ground`.

**Vehicles** (`characters.excavator`, `characters.dump_truck`): same conventions as assets/vehicles.
- Headings: SE and NE are rendered; SW and NW are mirrored. Frames are named `{anim}_{dir}_{i}`.
- An operator is baked into each cab. There is no baked shadow; use the `shadow` ellipse.
- `excavator`:
  - `anims.dig.digFrame` 2 and `dumpFrame` 5.
  - `bucketPoint[anim][dir][i]` gives the bucket position per frame.
  - `digPoint` / `dumpPoint` are the ground points under the bucket.
- `dump_truck`:
  - `cargoPoint`, `cargoGround` and `bedPoint[anim][dir][i]`.
  - `tipPoint` and `anims.tip.tipFrame` 2.

**Top-level manifest fields:**
- `fenceRings.S/M/L`: fence pieces with px offsets from the plot centre.
- `demolitionLayout.S/M/L`: where the excavator and dump truck stand, heading SE.
- `fireSequence`: the step list.
- `conventions`.

## How the game uses them
1. **Load:** add `'civic'` to `LATE_FRAGMENTS` (or `FRAGMENTS`) in `src/core/Assets.js`. I did not edit src; that belongs to the code agents.
   - Sprite anims register as `spr:<key>:<anim>`: `spr:bank_vault:vault`, `spr:police_station_cell:open`, `spr:ruin_m_smoke:smoke`, `spr:fire_alarm_post:ring`, `spr:demolition_fence_x_lamp:blink`.
   - Vehicles load like assets/vehicles.
2. **Cutaways:**
   - **Closed:** draw only the `<key>` sprite, which is all layers composited.
   - **Open:** draw every layer at the building's position and origin, in `drawOrder`, with depth = base + 0.01 × index. Put characters into `@behind` / `@front` according to `pointSlots`.
   - **Reveal:** on a tap or hover inside `revealPoly` (or when the chief walks in), fade `_shell` to `openAlpha` and fade in `_shell_cut`.
   - **Bank:** play `vault` when someone goes to `vaultPoint`, and `vault_close` after.
   - **Police station:** play `open` when an officer at `cellDoorPoint` brings someone to `cellPoint`, then `close`.
3. **Bank flow:** door → `entryPoint` → queue (`customerPoints`) → `counterPoints[i]`, served by `staffPoints[i]`. The manager is at `deskPoint`. ATM users stand at `atmPoint`, and people wait on the `seatPoints`.
4. **Fire → rebuild** (also in `fireSequence`):
   1. **Burning:** fx_city `fx_fire_bld_<s|m|l>` and `fx_smoke_column`.
   2. **Ruin:** swap the building for `ruin_<size>`, or `ruin_house_town` for town houses, at the same anchor. Add `scorch_decal_<size>` on the ground, the `ruin_<size>_smoke` overlay while it smoulders, and an `insurance_sign` nearby.
   3. **Demolition:** put up `fenceRings[size]` (leave one front piece out as a gate), with the excavator and dump truck at `demolitionLayout[size]`.
      - At `digFrame`, play the dust FX at `bucketPoint`.
      - At `dumpFrame`, swap the truck from `idle` to `idle_loaded`.
      - Swap the ruin for `rubble_pile_<size>`, then `_half`, then nothing.
      - The truck leaves with `move_loaded` and plays `tip` at the dump.
   4. **Rebuild:** place assets/buildings `site_*` at the same anchor, remove the fence, fade out the scorch decal, then place the new building.
5. **Wanted board:** draw resident portraits centred on `posterPoints`, scaled to `posterSizePx`; residents read it from `gatherPoints`. fx_city has the close-up wanted-poster UI panel.
6. **Moving:** swap `for_sale_sign` for `sold_sign` when the house sells. Put `moving_boxes_stack` and `furniture_pile_*` by the door; movers carry boxes to `dropPoint`. Place `welcome_mat` at the new family's `doorPoint` on the ground layer. The truck is assets/logistics `moving_truck`.
7. **Fire brigade:** firefighters connect at `fire_hydrant.hosePoint`; `fire_alarm_post` rings when a resident reports a fire.

## Scripts and how to rebuild
These are all new files, owned by this set:
- `tools/blender/civ_lib.py`: layer tagging, overlays and materials.
- `tools/blender/civ_assets.py`: all builders.
- `tools/blender/civ_veh.py`: the excavator and dump truck.
- `tools/blender/civ_render.py`
- `tools/blender/civ_decals.py`: procedural scorch decals.
- `tools/blender/civ_pack.py`
- `tools/blender/civ_preview.py`
- `tools/blender/civ_check.py`
- `tools/test/civic_phaser.mjs`

The scripts import the existing helpers (`bl_common`, `prop_lib`, `bld_assets` / `bld_render`, `town_lib`, `veh_lib` / `veh_models` / `veh_render`, `pack_utils`, `prop_pack`, `char_pack`, `town_pack.Scene`) read-only. No existing script or asset was edited.

```
/tmp/bvenv/bin/python tools/blender/civ_render.py -- [keys|zones|prefix*] [--force] [--samples N] [--threads N] [--list]
python3 tools/blender/civ_pack.py [--out DIR] [--prev DIR] [--no-previews] [--allow-partial]
python3 tools/blender/civ_check.py [--out DIR]
node tools/test/civic_phaser.mjs
```
- **Render cache:** `/tmp/fv_cache/civic`. Cycles uses 2 fixed threads, and rendering resumes where it stopped.
- **Render times on the shared CPU:**
  - bank ≈ 14 min
  - police station ≈ 13 min
  - dump truck ≈ 13 min, plus 3 min to re-render the loaded frames
  - ruins 1–2 min each
  - excavator 2.5 min
  - props seconds each
- **Packer:** it merges into the existing manifest and refuses to write when a current or required key is missing from the cache.

## Previews (`docs/previews/`)
- `civ_all.png`: everything, labelled. Shows both cutaways closed and revealed, ruins with smoke, and vehicle frames.
- `civ_bank_cutaway.png` / `civ_police_cutaway.png`: the exploded layers, then closed, revealing, open with people in their slots, and the overlay's last frame. The police one includes a sheepish little prankster in the cell.
- `civ_fire_sequence.png`: one S plot going house → fire → ruin → fence + excavator digging + dump truck → rubble → construction site (assets/buildings `site_scaffold_S`) → new house.
- `civ_scene.png`: a town corner at 1x.
  - The civic row behind the main street: the bank revealed with tellers and customers, the wanted board with portraits, and the police station with `police_car` in its bay.
  - Moving day at a townhouse, with the assets/logistics `moving_truck` backed up and unloading.
  - A burnt M plot being cleared, plus the hydrant and alarm post.
- `civ_phaser.png` / `civ_phaser_closed.png`: the live Phaser demo, with the bank revealed by hover.
- GIFs: `civ_vault.gif`, `civ_reveal.gif`, `civ_cell.gif`, `civ_excavator.gif`, `civ_dump_truck.gif`, `civ_ruin_smoke.gif`, `civ_alarm.gif`, `civ_fence_lamp.gif`.

## Changes in this session (resume)
- **All renders finished:** the production render completed, including the bank, police station, every ruin and prop, the excavator and the dump truck. The dump truck's loaded frames were re-rendered with the lighter rubble load.
- **demolitionLayout fix:**
  - The search only slid the vehicles toward +Y, so for M and L it never found a clear spot and the dump truck stood inside the fence ring.
  - It now searches both ways and also requires the bucket's dig point to land inside the plot. M uses y = −0.4 m and L uses y = −1.1 m.
  - `civ_check.py` now verifies this: vehicles clear of the ring, bucket inside the plot.
- **Cell points:** the inmate spots (`cellPoints`) moved onto the cell rug, facing SE. At the old spot the face was hidden behind the corner post of the bars.
  - I changed the markers in `civ_assets.py` and the same numbers in the cached render meta. Markers do not change any pixels, so nothing was re-rendered.
- **Previews:**
  - `civ_scene.png` re-laid out. Before, the wanted board was hidden inside the police station's footprint, the buildings faced away from the streets and labels overlapped.
  - Calmer bank crowd.
  - Wider fire-sequence panels, so the vehicles are no longer clipped.
  - The exploded layer rows show the overlays at frame 0.
- **Phaser test:** the ruins are spaced by their width, the demo plot moved right, and the reveal test now waits for the fade (up to 20 s). Software WebGL on a busy machine is slow.

## Known issues
- **Dump truck covers the excavator:** in `demolitionLayout` the truck stands on the excavator's right, which is the camera side. It hides the excavator's tracks; the cab, the arm and the dig stay visible. Swinging to the other side would need a re-render of `dig` (about 3 min).
- **Mirrored headings:** `demolitionLayout` is defined for the SE heading only. On a mirrored SW / NW excavator, the dump side flips too.
- **Small bank interior:** with more than about 8 people inside, heads start to overlap. Suggested cap: 3 tellers, the manager and about 4 customers.
- **Dark cell bars:** the bars are dense and dark navy. An inmate reads as "behind bars" (striped), with the face visible between the bars at `cellPoint`.
- **Stand-in characters:** the cityfolk fragment (police and firefighter outfits) did not exist yet. The previews use assets/townfolk and villagers, and the Phaser demo uses coloured pegs for the character slots.
- **Smoke clipped in one preview:** the fire panel of `civ_fire_sequence.png` crops the top of the fx_city smoke column. This affects the preview only.
- **Seat-height points:** the bank `seatPoints` and police `cellSeatPoint` are at seat height. A standing sprite placed there needs about +25 px of y.
