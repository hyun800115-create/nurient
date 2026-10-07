# vehicles build report

All of CONTRACT_V5 §L (vehicles) and §M (vehicle buildings) is in `assets/vehicles/`. `veh_check.py` reports 0 errors and 0 warnings, and the payload is 4.58 MB against the 7 MB budget. In a Phaser 3.90 load test (my own page, kept in scratchpad) all 27 atlases loaded with no page errors, all 680 vehicle and overlay frames and 25 sprites were found, and all 94 animations played in all four headings.

I look-devved the horse_sleigh_bus, retro_bus and car_a first and refined them before building the rest. Every file I wrote is new; no existing script was edited and nothing under `src/` was touched.

## Keys
**Vehicles** (`characters{}`, kind `vehicle`, one atlas `veh_<key>` each):
- **Era 2:** `horse_sleigh_bus`, `steam_wagon`, `dog_sled`, `cargo_sleigh`.
- **Era 3:**
  - `retro_bus`, `truck_cargo`, `truck_cargo_chief`, `police_car`, `fire_truck`, `ambulance`.
  - Cars: `car_a_red|blue|yellow`, `car_b_red|blue|mint`, `car_c_red|blue|orange`, `car_d_red|blue|cream`.
- `vehicleFamilies` and `eras` lists are in the manifest.
- Sizes: cars 3.5–4.1 m, bus 7.2 m, horse sleigh bus 7.9 m. Seats fit 1.45 m chibis, and their heads stay under the roofs.

**Buildings** (`sprites{}`, baked shadows; atlases `veh_depots`, `veh_street`, `veh_lots`, `veh_signs`):
- Stops: `bus_stop` and `bus_stop_y` (blank sign board), `sleigh_stop` and `sleigh_stop_y`. The `_y` versions are for roads along world Y.
- Depots: `stable_depot` (a horse looks out of the stall); `bus_depot` and `bus_depot_open` (2 bays).
- `garage_small` and `garage_small_open`, `fuel_depot`.
- `parking_lot_s` (4 stalls) and `parking_lot_m` (8 stalls). Both are ground pieces (kind `decal`).
- Traffic lights: `traffic_light` and `traffic_light_b`, each with `_green`, `_yellow` and `_red` frames and an `anims.cycle` loop.
- Road signs, all blank boards: `road_sign_round`, `_tri`, `_rect`, `_arrow`, `_info`.

## Directions and animations
- **Rendered headings:** `SE` (world +X) and `NE` (world +Y). The game mirrors `SW←SE` and `NW←NE` with flipX. `axisDirs` maps `X+:SE, Y+:NE, Y-:SW, X-:NW`. Frame names are `{anim}_{dir}_{i}`.
- **Era 2:** idle 4 frames and move 8 frames. Horses trot in diagonal pairs with swinging bells, dogs reuse the village dog's run cycle, and the steam wagon puffs steam.
- **Era 3:** idle 2 and move 4 (wheels turn, body bounces).
  - Emergency vehicles also have `siren` 4 frames. Their beacons are off in idle and blink in move and siren.
  - `truck_cargo_chief` has idle 4: the chief smiles and waves.

## Fields
- **Size and placement:** anchor (ground centre), `lengthM`, `widthM`, `heightM`, `era`, `topPx`, `footprintPoly[dir]`.
- **Shadow:** `shadow[dir] = [w, h, angleDeg]`, a rotated soft ellipse. Negate the angle when mirrored.
- **Points** (per dir, px from the anchor; negate dx when mirrored):
  - `cargoPoint` ([dx, dy, behind]), `doorPoints` ([0] = camera side, [1] = far side).
  - `exhaustPoint` or `steamPoint`, `lightPoints`, `tailPoints`, `sirenPoint`.
  - Bus only: `routeBoardPoint` (blank route board).
- **Seats:** `seats[dir]` (seat front-centre, the villagers' `sit` convention), `seatDirs`, `seatsStand`, `seatDrawOrder`, `driverSeat`. `driverSeat` is null on the chief truck because the chief is baked in.
- **Per-anim extras:** `bobPx`, `wheels`, `beacons`, `steam`.
- **Overlay:** `overlay: {atlas, frameName: "over_{anim}_{dir}_{i}"}`.
- **Buildings:** `stallPoints`/`stallDirs`, `bayPoints`/`bayDirs`, `stopPoint`/`stopDir`, `waitPoints`, `seatPoints`, `boardPoints`, `staffPoints`, `pumpPoints`, `fxPoints.board` plus `boardPx`, `layer: "ground"` (parking lots), and states.

## How the game should use them
1. **Load the fragment:** add `'vehicles'` to `FRAGMENTS` in `src/core/Assets.js` (code agent's file, not changed by me). The entries use the same dirs/mirror format as characters.
2. **Draw order for one vehicle:** shadow ellipse, then the vehicle frame, then passengers in `seatDrawOrder`, then the `over_*` frame. Passengers go at `seats` using `sit` frames. For back views (NE/NW) use the `idle` frame at `seatsStand`.
   - Without passengers the overlay can be skipped.
   - No drivers are baked in except the chief, so a moving bus or car with no passengers drawn looks empty.
3. **Turning:** vehicles drive only along the iso axes. At corners, swap between SE/NE and their mirrors.
4. **Bus and sleigh stops:** the shelter stands on the far side of the road. The bus halts at `stopPoint`, heading `stopDir` (NW or SW, right-hand traffic). Passengers walk to `doorPoints[1]` behind the bus and fade out there.
5. **Parked vehicles:** park at `stallPoints` with `stallDirs`. Draw the parking lots on the ground layer.

## Rebuild
```
/tmp/bvenv/bin/python tools/blender/veh_render.py -- [keys|vehicles|buildings|era2|era3|cars] [--force]
python3 tools/blender/veh_pack.py      # merges into the manifest; refuses (exit 1, nothing written) if keys would be dropped; --allow-partial
python3 tools/blender/veh_check.py
python3 tools/blender/veh_preview.py
```
- The render cache is `/tmp/fv_cache/vehicles`, and reruns skip finished frames.
- On the shared CPU the vehicles took about 80 minutes and the buildings about 35.
- I tested the packer guard with an empty cache and a partial cache: it exited 1 both times and the manifest was unchanged.

## Known issues
- **Mirrored headings:** SW/NW are flipped images, so the door, driver and badge always appear on the camera side.
- **Small details:** the beacons are only about 6–8 px at 1x, so a glow sprite at `sirenPoint` would help. The chief is small in the cab and his wave is subtle.
- **Depth sorting:** long vehicles sort by a single anchor; use `footprintPoly` for better sorting.
- **Stopped bus:** a bus standing at `stopPoint` covers most of its shelter. This follows from the iso view.
- **Painted interiors:** the "open" states of the depot and garage are painted onto solid walls, so they are flat.
- **Atlas notes:**
  - Matching overlay frames are stored once and listed again as alias entries in the atlas JSON.
  - The horse sleigh bus overlays sit in a separate atlas, `veh_horse_sleigh_bus_over`.
- **Roof snow:** reads as flat white ovals.
- **Scene preview:** `veh_scene.png` is a static mock-up, not an in-game screenshot.

## Files (in `/home/user/nurient/frost-village/`)
- **Scripts:** `tools/blender/veh_lib.py`, `veh_models.py`, `veh_bld.py`, `veh_render.py`, `veh_pack.py`, `veh_preview.py`, `veh_check.py`
- **Assets:** `assets/vehicles/manifest.json` plus 27 atlases (png + json)
- **Previews** (in `docs/previews/`):
  - `veh_all.png` (labelled), `veh_scene.png` (street at 1x), `veh_passengers.png` (seats and overlay in all 4 headings)
  - GIFs: `veh_move_era2.gif`, `veh_move_era3.gif`, `veh_siren.gif`, `veh_chief.gif`
- **Phaser test (scratchpad):** `/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/veh/phaser_veh.mjs`
