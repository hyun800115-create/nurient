# logistics build report

The logistics set for CONTRACT_V8 §AA is finished. `assets/logistics/` holds 38 sprites (the centre and its 12 cutaway layers / patches, 22 items, 2 producers) and 7 vehicles in 12 atlases, with a payload of **1.84 MB** (limit 7 MB). `lgx_check.py` reports **0 errors and 0 warnings**, and the depth-band validation list is empty. A headless Phaser 3.90 load found all 188 frames, registered 40 anims, played 9 of them and passed the reveal toggle by tap and by hover. Re-packing gives byte-identical files.

Same house style as `assets/town` / `assets/vehicles`: `bl_common` camera and light, PPU 64, 2:1 iso, toy materials, snow on roofs and sills. Bodies, signs and helpers are imported from prop_lib, prop_assets, bld_assets, town_lib, life2_lib, veh_models and veh_render; none of those files was changed.

## Keys
- **`logistics_center`** (솔방울 물류센터 / Pinecone Logistics Centre), 11 × 8 m.
  - **Outside:** a blue corrugated hall with a snowy barrel roof, a brick plinth, a striped entrance awning, a blank cream name board, two yellow roll-up dock doors under hazard-striped canopies, a box emblem and roof vents.
  - **Inside (revealed):**
    - Four blue and orange pallet racks on the back wall, with round category signs: food (fish), goods (can), tools (hammer) and appliances (fridge).
    - A furniture rack on the left wall (chair sign).
    - A green belt conveyor with a feeder hood and a labeller arch, and a packing table.
    - An office corner: desk with a ledger and an abacus, a cabinet, a safe, and a heater with a sleeping cat.
    - A green settlement counter with a ledger, a stamp, a bell and coins.
    - Four materials floor bays, two dock levellers, floor markings, and a cone next to the empty-pallet stack.
  - Layer and patch sprites:

    | Key | Kind | depthOffset | What it is |
    |---|---|---|---|
    | `logistics_center_back` | layer | -0.40 | Back and side walls seen from inside: lining, windows, clock, notice board, wall lamps. |
    | `logistics_center_floor` | layer | -0.35 | Floor slab, markings, levellers and the outside apron. |
    | `logistics_center_interior` | layer | -0.30 | Racks, conveyor body, table, office, counter and decor. |
    | `logistics_center_lamp` | patch | -0.29 | Office desk lamp, `anims.office_lamp`: 4 frames at 4 fps, a glow pulse. |
    | `logistics_center_interior_racks` | layer | -0.22 | Rack front uprights, front beams, beam tags and the top signs. Drawn over the stock so the goods sit inside the racks. |
    | `logistics_center_interior_front` | layer | -0.10 | The counter, conveyor and packing table again. Staff stand behind these. |
    | `logistics_center_conveyor` | patch | -0.09 | Belt and riding boxes, `anims.conveyor`: 8 frames at 8 fps, a seamless loop. |
    | `logistics_center_stub` | layer | -0.02 | Front walls cut at 0.45 m with cream section caps. Always drawn. |
    | `logistics_center_shell_cut` | layer | -0.015 | Optional state: walls at 1.6 m, roof off. |
    | `logistics_center_shell` | layer | 0.00 | Front walls, roof and signage; this is the part that fades. The main entry `logistics_center` uses the same frame. |
    | `logistics_center_dock1`, `logistics_center_dock2` | patch | 0.001 | `anims.dock_door`: 6 frames at 8 fps, repeat 0. The door rolls up; play it backwards to close. One per bay. |
    | `logistics_center_props` | layer | 0.01 | Apron props: bins, bench, bollards, dock lights, snow lumps. Always drawn. |
- **Items** (72 × 72, anchor [0.5, 0.75], `stackStep`, `carryScale`, `thicknessM`, `category`, `icon: true`):
  - Furniture: `item_chair`, `item_table`, `item_sofa`, `item_bed`, `item_wardrobe`.
  - Appliances: `item_fridge`, `item_stove_iron`, `item_washer`, `item_radio`, `item_tv_retro`.
  - Tools: `item_toolbox`.
  - Food crates: `item_crate_food`, `item_crate_cans`, `item_crate_bread`, `item_crate_produce`.
  - Pallets: `pallet_planks`, `pallet_ingots`, `pallet_logs`, `pallet_boxes`.
  - Boxes: `cardboard_box_s`, `cardboard_box_m`, `cardboard_box_l`.
- **Producers** (station conventions, 3 × 3 m, baked shadow):
  - `furniture_workshop` (가구 공방): `chain` item_plank → furniture. `anims.work` is 4 frames at 8 fps: the saw spins, sawdust sprays, the lamp glows, the chimney smokes.
  - `appliance_factory` (가전 공장): `chain` item_ingot → appliances. `anims.work` is 4 frames at 8 fps: the press ram stamps, sparks burst, a warning lamp blinks, the chimney smokes.
  - Both have `workSpot` {point, dir NW, forwardM, heightM}, `staffPoints`, `staffDirs` and `staffDepth: "front"`, plus `inPoint`, `outPoint` and `fxPoints`.
- **Vehicles** (`characters{}`, kind "vehicle", assets/vehicles conventions):
  - All have dirs SE and NE; SW and NW are drawn mirrored. Frames are named `{anim}_{dir}_{i}`.
  - All have `shadow`, `footprintPoly`, `wheels`, `cargoPoint` and seats with an `over_*` overlay, except the pallet jack.
  - `forklift` and `forklift_loaded` (family `forklift`):
    - `idle` is 2 frames, `move` is 4 frames with the beacon blinking.
    - `lift` is 6 frames: the forks rise from the ground to 1.25 m. Play it backwards to lower them.
    - `liftPx[i]` is the extra screen-y of the forks in each lift frame. `forkTipPoint` is also given.
    - `cargoPoint.behind` is true for NE: draw the load before the truck.
    - The `_loaded` variant carries a pallet of boxes.
  - `delivery_van_red`, `delivery_van_blue`, `delivery_van_mint` (family `delivery_van`): rounded retro vans with the box emblem. `idle` is 2 frames and `move` is 4. They have `rearDoorPoint`, `doorPoints`, `lightPoints`, `tailPoints` and `exhaustPoint`.
  - `moving_truck` (이삿짐 트럭): a mint cab with a cream box body and a house-with-heart emblem.
    - `unload` is 6 frames: the roll door goes up (frames 0–3), the ramp slides out (3–4) and tilts down to the snow (5).
    - `rampPoint` is where movers start walking up the ramp.
  - `pallet_jack`: `idle` is 1 frame, `move` is 4. `handlePoint` and `pushOffset` place the townsfolk `push` pose.

## Fields of `logistics_center`
All values are px offsets from the anchor. Every layer and patch shares `frameSize` [1152, 864] and `anchor` [0.41493, 0.58912].
- **Geometry:**
  - `footprint` [860, 430] and `footprintM` [11, 8].
  - `footprintPoly`: 4 corners.
  - `revealPoly`: 17 points. It is the hull of the shell, simplified with RDP.
  - `topPx` 487 and `front` -Y.
- **`layers` / `patches` / `layerOrder` / `bandDepth`:**
  - `layerOrder`: back, floor, interior, lamp, `<stock>`, interior_racks, `<actors mid>`, interior_front, conveyor, `<actors front + floor stock>`, stub, shell_cut, shell, dock1, dock2, props.
  - `bandDepth` gives the placeholder bands: `stock` -0.25, `mid` -0.20, `front` -0.05.
- **`reveal`:**
  - `states`:

    | State | shell alpha | shell_cut alpha |
    |---|---|---|
    | closed | 1 | 0 |
    | half | 0.45 | 0 |
    | cut | 0 | 1 |
    | open | 0 | 0 |
  - `fadeMs` is 350.
- **Docks:**
  - `dockPoints`: 2 bays, front and back.
  - `dockDirs`: SE.
  - `dockNames`.
  - `dockVehiclePoints[family][bay]`: where the vehicle anchor goes when it is backed up to a bay, for truck_cargo, delivery_van, moving_truck and forklift.
- **`forkliftPath`:** a 10-node loop.
  - The forklift picks at the food rack, drives along the rack lane, goes out through dock 2 to drop at the truck, and comes back down the dock corridor.
  - It then goes out through dock 1 to pick from the van and puts away at the tools rack.
  - Each node has `point`, `dir`, `legBand` (mid/front), an optional `action` (pick/drop) and `legCrossesWall`.
- **`rackSlots`:** 32 slots. Each one has:
  - `rack`, `category`, `level`, `slot` and `point` (the bottom of the stack).
  - `maxStackPx`, `widthM` and `depthM`.
  - `spanPx` (lane axis) and `depthPx` (row axis).
  - `face`, `band` and `drawOrder`.

  The slots are:
  - 4 back racks × 3 levels × 2 slots.
  - The furniture rack: 2 levels × 2 slots.
  - 4 floor bays for materials.

  Space above the stock:
  - Racks: `maxStackPx` is 34–35 below a shelf and 40 on the lower furniture-rack level.
  - Top shelves: capped at 46.
  - Floor bays: capped at 58.
- **`rackCategories`:** for each of the six categories (materials, food, goods, furniture, tools, appliances), the item keys that belong on its slots.
- **Staff:**
  - `staffPoints` / `staffDirs` / `staffRoles` / `staffBands`:

    | Role | Where | Band |
    |---|---|---|
    | clerk | behind the counter | mid |
    | packer | behind the conveyor | mid |
    | packer | behind the packing table | mid |
    | picker | food rack | any |
    | picker | tools rack | any |
    | picker | furniture rack | mid |
    | dock hand | outside | outside |
- **Customers:** `customerPoints` / `customerDirs` / `customerBands` form a 7-place shop-owner queue. Places 0–3 are inside at the settlement counter (band front); 4–6 are outside on the apron.
- **Doors and other points:**
  - `doorPoint` / `doorDir` for the entrance.
  - `inPoint` and `insidePoint`.
  - `conveyor` {start, end, axis}.
  - `fxPoints`: board, emblem, lamp, vents, dockLights.
- **`nameBoard`:** {point, widthPx 137, heightPx 43, shearY 0.5, text ko/en}. The board on the facade is blank, so the game writes the name onto it and fades it with the shell.
- **`manifest.logistics.validation`:** the per-point depth test results. It is empty of issues.

## How the game composes and reveals it
1. **Place the layers.** Put every layer sprite at the building anchor, with depth = building depth + `depthOffset`. Then play the patches: conveyor and lamp loop, and the dock doors play when a vehicle docks.
   - Closed, only `_shell`, `_props` and the dock-door patches show; everything else is covered by the shell.
   - While the shell is at alpha 1 and both doors are closed, the inside layers can be skipped to save fill-rate.
2. **Draw the stock.** For each rack slot, choose a stock level from 0 to 1 and draw item sprites of the slot's category.
   - Draw at `point + spanPx·t + depthPx·u`, scaled about 0.85, at depth `bandDepth.stock` plus a tiny y term. Draw back rows first.
   - Stack by `stackStep` and never go higher than `maxStackPx`.
   - An empty slot shows the bare shelf; a full one has every lane and row stacked to the cap.
   - Because `_interior_racks` sits on top, the uprights and beams cover the goods.
   - Floor-bay pallets use band `front`.
   - The stock-level GIF shows the sequence 0 → 100 % → 0.
3. **Draw the actors.** Inside actors go into band `mid` or `front` according to their `staffBands`, `customerBands` or forklift `legBand`, sorted by y within the band.
   - Outside actors use normal y-sort against `footprintPoly`.
   - A forklift leg with `legCrossesWall` uses the outside rule once it passes the wall.
4. **Reveal.** A tap, or hover on desktop, inside `revealPoly` tweens `_shell` together with `_dock1` and `_dock2` to alpha 0 over `fadeMs`. A second tap, or pointer-out, brings them back.
   - `_shell_cut` is an optional middle state with the walls at 1.6 m.
   - `_stub` and `_props` are always drawn.

`tools/blender/lgx_preview.py` (`compose_scene`) and `tools/test/logistics_phaser.mjs` both follow these rules exactly, so either can serve as a reference implementation.

## Pipeline
- **`tools/blender/lgx_lib.py`:** materials (hazard stripes, corrugated, concrete), pallets, crates, boxes, toy furniture, retro appliances, and the cutaway group tagging.
- **`tools/blender/lgx_center.py`:** the centre builder. Every object is tagged back / floor / apron / interior / rackf / front_f / belt / lamp / stub / cut / shell / door1 / door2 / props.
- **`tools/blender/lgx_assets.py`:** items and producers, through the bld_render conventions.
- **`tools/blender/lgx_vehicles.py`:** vehicles. They are registered into veh_models.VEH at run time.
- **`tools/blender/lgx_render.py`:** one scene and many passes, with a fixed camera.
  - In each pass, every group is visible, ghost (casts shadows but is not seen), holdout or hidden, so the layers align and composite back exactly.
  - Masks: fmask and rmask. A 16-bit view-depth pass is used for validation.
  - Patches are rendered with a render border.
  - Cycles uses 2 fixed threads. Renders write `.tmp.png` and rename, and existing frames are skipped unless `--force`, so the cache is resumable.
  - Cache: `/tmp/fv_cache/logistics`.
- **`tools/blender/lgx_pack.py`:**
  - Trims the frames into ≤ 2048 px sheets with 256-colour imagequant palettes. Layers that are drawn on top of each other share a sheet.
  - Derives `_interior_front` (= interior × fmask) and `_interior_racks` (= interior × rmask).
  - Validates every standing point, forklift-path sample and rack slot against the rendered depth.
  - **Guard and merge:** like harbor_pack, it keeps unknown fields, refuses to write if a required key has no complete render, and has an `--allow-partial` option.
- **`tools/blender/lgx_check.py`:** the contract checks.
- **`tools/blender/lgx_preview.py`:** the previews.
- **`tools/test/logistics_phaser.mjs`:** the Phaser load test with the reveal toggle.

Rebuild:
```
/tmp/bvenv/bin/python tools/blender/lgx_render.py -- center|items|producers|vehicles [--force] [--samples N] [--passes a,b]
python3 tools/blender/lgx_pack.py && python3 tools/blender/lgx_check.py && python3 tools/blender/lgx_preview.py
node tools/test/logistics_phaser.mjs
```

## Previews (docs/previews)
- `lgx_all.png`: every key, labelled. The centre closed and open, all 9 layers as thumbnails, both producers idle and working, 22 items at 2×, and every vehicle in SE, NE, lift 5 and unload 5.
- `lgx_cutaway.png`: closed / half (shell 45 %) / cut (walls 1.6 m) / open, side by side, with the inside working.
- `lgx_reveal.gif`: the shell fading out and back in while the forklift drives.
- `lgx_scene.png`: at 1×, the centre open with stocked racks. It shows:
  - Staff at their staffPoints: the clerk at the counter, packers, pickers and a dock hand.
  - Two forklifts on the path and a worker pushing a pallet jack.
  - A truck_cargo and a delivery van at the docks.
  - Shop owners queuing at the settlement counter.
- `lgx_stock.gif`: the racks going empty → full → empty.
- `lgx_conveyor.gif`, `lgx_docks.gif`, `lgx_forklift.gif` (lift), `lgx_trucks.gif` (moving-truck unload and the vans), `lgx_producers.gif`.
- `lgx_phaser_closed.png` and `lgx_phaser_open.png`: the Phaser test before and after the tap.

## Changes in this session (resume)
- **Vehicle renders.** Rendering stopped after the first vehicle because `lgx_lib` had cached a material that the vehicle scene reset had freed. The material cache now checks that the material is still live. All 7 vehicles are rendered.
- **Rack stock heights.** Every slot next to a rack end frame got `maxStackPx` 0, because the end-frame bracing rods were in front of the stack, so half of each rack could never show goods.
  - The stack test now ignores thin rods (runs under 10 px) and stops where a solid occluder begins.
  - All slots of one rack level now share that level's free height.
  - The category signs on top of the racks now belong to the rack-front group (re-rendered rmask), so goods on the top shelf sit behind them. Top shelves are capped at 46 px.
- **Front-furniture test.** The anti-aliased rims of the counter, conveyor and table now count as front furniture (mask ratio test). This cleared the false "hidden" reports for the forklift lane and the packer.
- **Traffic cone.** The cone stood beside the dock corridor, in front of the forklift's path, so the forklift would have been drawn over it. It now stands next to the empty-pallet stack; interior, floor, stub, cut, masks and depth were re-rendered.
- **`bandDepth`.** The numeric band offsets are now exported, so the game does not have to guess them.
- **Scene preview.** The second forklift moved so the packer at the table is visible, and the caption is shortened.

## Known issues
- **Thin rods under the goods.** Stock in the slot next to a rack end frame is drawn over that frame's thin diagonal bracing rods. In a real rack the rods would be in front of the goods. It only shows when you look closely at 2×.
- **Back-row piles.** `maxStackPx` is measured at the slot centre, so a back-row stack can reach a few px into the shelf above. Keep back-row stacks one item lower than front-row stacks, or use 0.85 × `maxStackPx`.
- **Vehicle order at the docks.** Vehicles at the docks stand outside, and the dock-door patch (depth +0.001) belongs to the building. A van backed against an open door should be y-sorted as an outside actor. That is the case at `dockVehiclePoints`, but a vehicle driven inside along `forkliftPath` must switch to the inside bands at `legCrossesWall`.
- **No interior lighting variants.** There is no night version of the interior; it is the daylight render. The office lamp glow and the dock lights are the only animated lights.
