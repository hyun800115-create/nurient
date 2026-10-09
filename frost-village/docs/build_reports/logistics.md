# logistics build report

The logistics set for CONTRACT_V8 §AA is finished and polished. `assets/logistics/` holds 55 sprites and 7 vehicles in 13 atlases:
- the centre: its 13 cutaway layers, 4 animated patches and 8 outdoor-prop sprites;
- 27 items;
- 2 producers.

The payload is **1.84 MB** (limit 7 MB). `lgx_check.py` reports **0 errors and 1 warning**. The warning is documented: `item_toolbox` is also a key in `assets/buildings`, built with the same builder and identical to it. The validation list is empty: depth bands, forklift keep-clear and stock fit all pass.

A headless Phaser 3.90 load of the fragment:
- found all 205 frames and registered 40 anims, with no page errors and no 404s;
- drew 129 stock stacks from `itemFit` with no stack overflowing its shelf;
- drew all 11 outdoor props;
- drove the forklift round its path, playing the lift at each pick/drop;
- passed the reveal toggle by tap and by hover: shell, door leaves and nameplate go to 0 while `_shadow_open` goes to 1, and back.

Re-packing gives byte-identical files.

The house style is the same as `assets/town` / `assets/vehicles`: `bl_common` camera and light, PPU 64, 2:1 iso, toy materials, snow on roofs and sills. Bodies, signs and helpers are imported from prop_lib, prop_assets, bld_assets, town_lib, life2_lib, veh_models and veh_render; none of those files was changed. The closed building is unchanged: outside the dock openings the new `_shell` matches the old one to palette noise.

## Keys
- **`logistics_center`** (솔방울 물류센터 / Pinecone Logistics Centre), 11 × 8 m.
  - **Outside:** a blue corrugated hall with a snowy barrel roof and a brick plinth. It has:
    - a striped entrance awning;
    - the name board, now with **baked raised navy lettering "솔방울 물류센터"** (Jua font, or "Pinecone Logistics" in Fredoka);
    - two yellow roll-up dock doors under hazard-striped canopies;
    - a box emblem and roof vents.
  - **Inside (revealed):**
    - Back wall: three blue and orange 3-level pallet racks with round category signs (food: fish, goods: can, tools: hammer).
    - Next to them, a **lower, 2-level heavy rack** for appliances (fridge sign), with 1.5 m between decks.
    - Left wall: the furniture rack (chair sign). Its lower level is now 1.58 m tall.
    - A green belt conveyor with a feeder hood and a labeller arch, and a packing table.
    - An office corner: desk with a ledger and an abacus, cabinet, safe, and a heater with a sleeping cat.
    - A green settlement counter with a ledger, stamp, bell and coins.
    - Four materials floor bays, two dock levellers, and floor markings.
  - Layers, patches and outdoor props. Every layer and patch shares `frameSize` [1152, 864] and `anchor` [0.41493, 0.58912].

    | Key | Kind | depthOffset | What it is |
    |---|---|---|---|
    | `logistics_center_apron` | layer | -0.45 | **New.** Outside ground: dock apron with bay lines and hazard edges, entrance landing, doormat, and the receiving pad (inPoint). Always drawn. |
    | `logistics_center_shadow_open` | layer | -0.44 | **New.** Ground shadow of the open building (back walls, stub walls, racks), outside the footprint only. alpha = 1 - shell alpha. |
    | `logistics_center_back` | layer | -0.40 | Back and side walls seen from inside: lining, windows, clock, notice board, wall lamps. |
    | `logistics_center_floor` | layer | -0.35 | Floor slab, markings and levellers. The apron moved out of this layer. |
    | `logistics_center_interior` | layer | -0.30 | Racks, conveyor body, table, office, counter and decor. |
    | `logistics_center_lamp` | patch | -0.29 | Office desk lamp, `anims.office_lamp`: 4 frames at 4 fps. |
    | `logistics_center_interior_racks` | layer | -0.22 | Rack front uprights, beams, tags and top signs, drawn over the stock. |
    | `logistics_center_interior_front` | layer | -0.10 | Counter, conveyor and packing table again; staff stand behind these. |
    | `logistics_center_conveyor` | patch | -0.09 | Belt and parcels, `anims.conveyor`: 8 frames at 8 fps, a seamless loop. |
    | `logistics_center_stub` | layer | -0.02 | Front walls cut at 0.45 m. |
    | `logistics_center_shell_cut` | layer | -0.015 | Optional state: walls at 1.6 m, roof off. |
    | `logistics_center_shell` | layer | 0.00 | Front walls, roof and signage, with **open holes at the dock doors**. Carries the closed building's ground shadow. |
    | `logistics_center_nameplate_ko`, `_en` | layer | 0.0005 | **New.** The baked name lettering. Draw one of them, with the shell's alpha. |
    | `logistics_center_dock1`, `_dock2` | patch | 0.001 | **Now the door leaf only.** `anims.dock_door`: 6 frames at 8 fps, repeat 0. Frame 0 is closed and 5 is rolled up under the lintel. Always drawn. |
    | `logistics_center_props` | layer | 0.01 | The wall-mounted dock bumpers only. Always drawn. |
    | `logistics_center_prop_<kind>` | prop | own anchor | **New.** bollard, docklight, bench, bin, pallets, loadsign, snow_big, snow_small. Each is its own sprite with a ground anchor and a baked soft shadow. They are placed by `outdoorProps` and y-sorted. |
- **Items** (72 × 72, anchor [0.5, 0.75], with `stackStep`, `carryScale`, `thicknessM`, `category`, `icon: true` and the **new `sizeClass`** small/big):
  - Furniture: `item_chair`, `item_table`, `item_sofa`, `item_bed`, `item_wardrobe`.
  - Appliances: `item_fridge`, `item_stove_iron`, `item_washer`, `item_radio`, `item_tv_retro`.
  - Tools: `item_toolbox`, and **new `item_crate_tools`** (a crate of new axes and picks with their heads up, plus a sickle).
  - Food: `item_crate_food`, `item_crate_cans`, `item_crate_bread`, `item_crate_produce`, and **new `item_crate_smoked`** (훈제: smoked hams and golden smoked fish).
  - Goods: **new `item_crate_jam`** (strawberry, blueberry and apricot jars) and **new `item_cloth_rolls`** (red gingham, blue stripe and yellow bolts tied with twine).
  - Pallets: `pallet_planks`, `pallet_ingots`, `pallet_logs`, `pallet_boxes`, and **new `pallet_ore`** (광석).
  - Boxes: `cardboard_box_s`, `cardboard_box_m`, `cardboard_box_l`.
- **Producers** (station conventions, 3 × 3 m, baked shadow):
  - `furniture_workshop` (가구 공방): `chain` item_plank → furniture. `anims.work` is 4 frames at 8 fps: the saw spins, sawdust sprays, the lamp glows.
  - `appliance_factory` (가전 공장): `chain` item_ingot → appliances. `anims.work` is 4 frames at 8 fps: the press stamps, sparks burst, a lamp blinks.
  - The chimney smoke is **no longer baked**. `smokeFx` asks the game to spawn the soft `fx_smoke` puffs (assets/fx) at `fxPoints.smoke`, as House and TownBuilding already do.
  - `workSpot` / `staffPoints` now stand at the **screen-left of the machine, in profile, facing E**, so the saw or press stays visible. Both also have `inPoint` and `outPoint`.
- **Vehicles** (`characters{}`, kind "vehicle", assets/vehicles conventions):
  - All have dirs SE and NE, with SW and NW drawn mirrored. All have `shadow`, `footprintPoly`, `wheels` and `cargoPoint`. All except the pallet jack have seats with an `over_*` overlay.
  - `forklift` and `forklift_loaded` (family `forklift`):
    - **No roof snow any more**: the overhead guard is an open frame.
    - `idle` is 2 frames and `move` is 4.
    - `lift` is 6 frames, with `liftPx`, `forkTipPoint` and `cargoPoint`. `cargoPoint.behind` is true for NE.
  - `delivery_van_red`, `delivery_van_blue`, `delivery_van_mint`: `idle` is 2 frames and `move` is 4.
  - `moving_truck`:
    - `unload` is 6 frames, with `rampPoint`.
    - **New `unloadDirs` ['NE', 'NW']**: the rear only faces the camera in these two.
  - `pallet_jack`: `handlePoint` and `pushOffset` place the townfolk `push` pose.

## Fields of `logistics_center`
All values are px offsets from the anchor.
- **Geometry:**
  - `footprint` [860, 430] and `footprintM` [11, 8].
  - **`footprintPoly` is now in anchor offsets:** [[-430,-34],[68,215],[430,34],[-68,-215]]. It used to be in frame pixels.
  - **New `frontTest`** {a 181, b 249}. An actor at (x, y) is in front of the building when `y - x/2 > a` or `y + x/2 > b`. These are the two front edges, extended, which means world y < -4 m or x > 5.5 m.
  - `revealPoly` (17 points), `topPx` 487, `front` -Y.
- **`layers`, `patches`, `nameplates` {ko, en}:**
  - `layerOrder`: apron, shadow_open, back, floor, interior, lamp, `<stock>`, interior_racks, `<actors mid>`, interior_front, conveyor, `<actors front + floor stock>`, stub, shell_cut, shell, nameplate_<lang>, dock1, dock2, props.
  - `alwaysDrawn` and `insideLayers` are listed explicitly.
  - `bandDepth` {stock -0.25, mid -0.20, front -0.05}.
- **`reveal`:**
  - `states` (shell / shell_cut / shadow_open alpha):

    | State | shell | shell_cut | shadow_open |
    |---|---|---|---|
    | closed | 1 | 0 | 0 |
    | half | 0.45 | 0 | 0.55 |
    | cut | 0 | 1 | 1 |
    | open | 0 | 0 | 1 |
  - `withShell`: dock1, dock2, nameplate. `fadeMs` is 350.
- **Docks:**
  - `dockPoints` and `dockDirs` (SE).
  - `dockNames` and **`dockRoles`**: dock 1 is the van bay (front, screen lower) and dock 2 the truck bay (back). Any vehicle family can use either.
  - `dockVehiclePoints[family][bay]` for truck_cargo, delivery_van, moving_truck and forklift.
- **`forkliftPath`:** a 10-node loop. Each node has:
  - `point`;
  - `dir`: the way the forklift faces while doing its action;
  - **`legDir`**: the way it faces while driving to the next node;
  - **`reverse`**: the leg is driven backwards;
  - `legBand`;
  - optional `action` (pick or drop) and `note`.

  The route:
  1. Pick at the food rack (facing NE).
  2. Drive the lane.
  3. Drop at the dock-2 truck, standing on the leveller **inside** the door, and back out.
  4. Drive the corridor.
  5. Pick from the dock-1 van and back out.
  6. Drive up the corridor and along the lane.
  7. Put away at the tools rack, **now facing NE into the rack**.
  8. Loop.

  No leg leaves the building, so there is no band switch.
- **`rackSlots`:** 30 slots.
  - 3 back racks × 3 levels × 2, the appliance rack 2 × 2, the furniture rack 2 × 2, and 4 floor bays.
  - Each slot has `rack`, `category`, `level`, `slot` and `point`, plus `maxStackPx` (1 × 1 cell), `widthM`, `depthM`, `spanPx`, `depthPx`, `face`, `band` and `drawOrder`.
  - **New:** `cells` {small: 2 lanes × 2 rows, big: 1 × 1; floor bays 1 × 1}.
  - **New:** `maxStackPxBy[sizeClass]`, measured at every cell, so back rows are measured where they stand.
  - **New:** `itemFit` {item key → stacks of that item that fit, at the category's stockScale}.
- **`rackCategories`:** the six categories, including the new items. **`stockScale`** per category is 0.85 for all six: everything fits.
- **Staff:** `staffPoints`, `staffDirs`, `staffRoles`, `staffBands`. Bands are now only mid, front or outside.

  | Role | Where | Band |
  |---|---|---|
  | clerk | behind the counter | mid |
  | packer | behind the conveyor | mid |
  | packer | behind the packing table | mid |
  | picker | between the food and goods racks, just outside the lane line | mid |
  | picker | between the tools and appliance racks | mid |
  | picker | furniture rack, lower slot, clear of the lane | mid |
  | dock hand | on the apron between the bays | outside |
- **Customers:** `customerPoints`, `customerDirs`, `customerBands`. The 7-place shop-owner queue is now spaced 0.95 m (about 48 px):
  - places 0–3 are inside, at the counter (front band);
  - places 4–6 are outside, starting **1 m to the left of the door**, so the doorway stays free, and running toward the street.
- **`outdoorProps`:** 11 placements as [{sprite, name, point}]: 2 bollards, 2 dock lamps, bench, bin, empty pallets, loading sign and 3 snow piles.
- **Other points:**
  - `doorPoint` / `doorDir`, `inPoint`, `insidePoint`.
  - `conveyor` {start, end on the belt, **`heightM` 0.85, `startGround` / `endGround`**}.
  - `fxPoints`.
  - `nameBoard`, now only needed for a custom name.
- **`manifest.logistics.validation`:** empty. It covers depth bands, forklift keep-clear against every person point, and stock fit.

## How the game composes and reveals it
1. **Place the layers.** Put every layer and patch at the building anchor, with depth = building depth + `depthOffset`.
   - Always draw `_apron`, `_props`, the dock-door leaves (frame 0 = closed), one nameplate and the `outdoorProps`.
   - Play the conveyor and lamp patches. Play a dock door when a vehicle docks.
2. **Skip the inside while it is hidden.** While the shell is at alpha 1 and both doors are at frame 0, the `insideLayers` (back, floor, interior, lamp, racks, front, conveyor, stub) plus the stock and inside actors are fully covered and may be skipped.
3. **Open dock doors.** With a door open, the real inside shows through the hole in the shell, darkened to at most 55 % by the roof shadow baked into `_shell`.
4. **Draw the stock.** For each rack slot:
   - pick an item key from `slot.itemFit`;
   - draw one stack per cell of `slot.cells[item.sizeClass]` at `point + spanPx·t + depthPx·u`, at `stockScale[category]`, back rows first;
   - each stack has up to `itemFit[key]` copies, `stackStep · scale` apart. Stock level 0 to 1 sets how many of those copies are drawn.
   - Rack slots use band `stock`; floor bays use `front`.
5. **Draw the actors.**
   - Inside actors go into band `mid` or `front` by `staffBands`, `customerBands` or the forklift leg's `legBand`, sorted by y.
   - The forklift faces `legDir` on each leg, and `dir` while it plays `lift` at an action node.
   - Outside actors, outdoor props and docked vehicles use plain y-sort. Use `frontTest` for anything in front of the left part of the front wall: give it at least building depth + 0.02.
6. **Reveal.** A tap or hover inside `revealPoly` tweens the shell, both dock leaves and the nameplate to 0, and `_shadow_open` to 1, over `fadeMs`. A second tap or pointer-out reverses it. `_shell_cut` is the optional middle state.
7. **Producers.** Spawn `fx_smoke` at `fxPoints.smoke` while working. Draw the operator at `workSpot` facing E, above the station sprite.

`tools/blender/lgx_preview.py` (`Centre.draw`, `compose_scene`) and `tools/test/logistics_phaser.mjs` both follow these rules exactly.

## Pipeline
- **`lgx_lib.py`:** materials, pallets, crates, boxes, furniture, appliances and the cutaway group tagging.
- **`lgx_center.py`:** the centre builder.
  - Groups: back / floor / apron / interior / rackf / front_f / belt / lamp / stub / cut / shell / door1 / door2 / props, plus **new oprop** (each free-standing prop tagged with its instance and kind) and **name_ko / name_en** (text-curve lettering converted to meshes).
  - Rack specs are now per rack (`RACK_SPEC`).
  - Holds the queue, picker and forklift-path data.
- **`lgx_assets.py`:** items and producers. Adds the five new items, removes the baked smoke and moves the workSpots.
- **`lgx_vehicles.py`:** vehicles. The forklift has no roof snow.
- **`lgx_render.py`:** one scene and many passes, with every group visible, ghost, holdout or hidden per pass.
  - New passes: `apron`, `shadow_open` (a ground catcher with a hole the size of the footprint), `name_ko` / `name_en`, and `oprop_<kind>` (one per kind, alone on the ground catcher).
  - The door passes now render the leaf only. The shell pass renders without the leaves, with the back walls as ghost.
  - `footprintPoly` is written in anchor offsets.
  - Cycles uses 2 fixed threads. Renders write `.tmp.png` and are resumable. Cache: `/tmp/fv_cache/logistics`.
- **`lgx_pack.py`:**
  - Builds the atlases, adding `lgx_center_d` (apron, shadow_open and outdoor props).
  - Crops the props, and clamps the open-door roof shadow to alpha 140.
  - Validates the depth bands and the **forklift keep-clear**: the 2.5 × 1.16 m body on every leg and at every node, plus a 0.4 m load overhang at action nodes, must not touch any person (r 0.25 m).
  - Builds the **stock plan** (cells, per-cell heights, itemFit, stockScale), `frontTest`, `outdoorProps` and the conventions text.
  - Guards and merges like harbor_pack. Re-packing is deterministic.
- **`lgx_check.py`:** the contract checks plus the new rules:
  - `footprintPoly` centroid and bbox;
  - bands limited to mid / front / outside;
  - every slot has cells and itemFit, and every rackCategories item fits at least one slot of its category;
  - nameplates and outdoorProps frames exist;
  - forklift action nodes are inside the wall, and every node has legDir;
  - `workSpot.dir` and `smokeFx` are present;
  - `unloadDirs` is present;
  - no key or atlas collides with another fragment. `item_toolbox` gets a warning instead.
- **`lgx_preview.py`:** the previews, as the reference composition. **`logistics_phaser.mjs`:** the Phaser load and reveal test.

Rebuild:
```
/tmp/bvenv/bin/python tools/blender/lgx_render.py -- center|items|producers|vehicles [--force] [--samples N] [--passes a,b]
python3 tools/blender/lgx_pack.py && python3 tools/blender/lgx_check.py && python3 tools/blender/lgx_preview.py
node tools/test/logistics_phaser.mjs
```

## Previews (docs/previews)
- `lgx_all.png`: every key, labelled. It shows:
  - the centre closed (with the nameplate) and open;
  - all 13 layers, including the apron, shadow_open and both nameplates;
  - the 8 outdoor props;
  - both producers;
  - 27 items at 2×;
  - every vehicle.
- `lgx_cutaway.png`: closed / half / cut / open side by side. The open-state shadow fades in.
- `lgx_reveal.gif`: the shell, nameplate and dock leaves fade out and back in while `_shadow_open` cross-fades.
- `lgx_scene.png`: at 1×, the centre open with full racks:
  - the clerk, packers, pickers between the racks and the dock hand;
  - a forklift picking at the food rack (lift), a loaded forklift on its lane leg, and a worker with a pallet jack;
  - **the van at dock 1 and the truck at dock 2**;
  - the shop-owner queue, spaced out.
- `lgx_docks.gif`: the closed building with the doors rolling up. The **real inside** shows through: stock, and a loaded forklift waiting on the dock-1 leveller. The van and truck are docked.
- `lgx_stock.gif`: racks going empty → full → empty, using `itemFit`.
- `lgx_producers.gif`: both producers working. Each shows its operator in profile at `workSpot` and the soft game-side smoke.
- `lgx_conveyor.gif`, `lgx_forklift.gif` (lift, no roof snow), `lgx_trucks.gif`.
- `lgx_phaser_closed.png` and `lgx_phaser_open.png`: the Phaser test before and after the tap, with full stock and the outdoor props y-sorted against the docked van and truck.

## Changes in this session (polish after the critic review)
- **`footprintPoly`** is in anchor offsets, and `frontTest` gives the in-front rule as two numbers. The packer converts an old cache, and the check fails on frame pixels.
- **Pickers vs forklift.**
  - The pickers stand between racks, 0.25 m outside the lane line.
  - The furniture picker stands at the lower slot, away from the forks' sweep.
  - A keep-clear test in the packer now guards this, against staff, customers and door points.
  - F8 faces NE into the tools rack.
- **Apron.** It is its own always-drawn layer, so skipping the inside while closed no longer deletes it.
- **Outdoor props.** Free-standing props are their own y-sorted sprites with soft shadows. They were moved so that no docked vehicle has one beside its camera-side flank:
  - bollards and dock lamps hug the wall beside the doors;
  - the loading sign and the empty pallets moved to the front-right of the apron;
  - the bin moved off the outside queue.
- **Item fit.**
  - The appliance rack is now 2 levels, 1.5 m apart, and the furniture rack's lower level is 1.58 m tall.
  - Fridge, stove, TV, chair and wardrobe all fit at scale 0.85.
  - The stock heights are measured per cell over the item's own width. Back rows no longer poke into the deck above, and the end-frame bracing no longer zeroes the middle shelves.
- **Stock rule.** It is fully in the data: `cells`, `sizeClass`, `itemFit`, `stockScale`, `maxStackPxBy`. Floor bays hold one stack each.
- **Name.** A baked Korean and an English nameplate patch. The previews use the shipped patch.
- **Producers.** The baked faceted smoke is gone; use `smokeFx` / `fxPoints.smoke` instead. The operator stands in profile at the screen-left of the machine, facing E, and the note matches.
- **Forklift.** No roof snow.
- **Open-state shadow.** The new `_shadow_open` layer.
- **Dock doors.** The patches are the leaf only. The shell has holes there, so the real stock and actors show through, dimmed to at most 55 %.
- **Forklift path.**
  - Dock nodes sit on the leveller (x 5.0 m), so only the forks reach into the bed.
  - `legDir` and `reverse` on every leg.
  - Dock roles are settled: van at dock 1, truck at dock 2, matching the scene.
- **Queue.** 0.95 m spacing; the outside head stands 1 m beside the door.
- **Conventions.**
  - "any" is replaced by mid; "outside" is defined.
  - The conveyor has `heightM` and ground points.
  - `moving_truck.unloadDirs`.
- **Variety.** Jam crates, cloth rolls, smoked goods, tool crates and an ore pallet.
- **Phaser test.** Uses the new data (itemFit, legDir, outdoor props, shadow_open) and fails on stock overflow or missing props.

## Known issues
- **Bracing rods under the goods.** Goods next to a rack end frame still draw over that frame's thin diagonal bracing rods. Only visible at 2×.
- **Cross-fade darkness.** While the reveal cross-fades (half state), the closed and open shadows overlap and the ground right of the building is a little darker for 350 ms.
- **Long vehicles and plain y-sort.** The props were placed so that plain anchor y-sort is right for vehicles parked at `dockVehiclePoints`. A long vehicle driving past a prop on its camera side mid-manoeuvre can still briefly sort wrong; this is a general limitation of plain y-sort.
- **Daylight only.** There is no night version of the interior. The office lamp and dock lamps are the only lights.
- **`item_toolbox` key.** It is the same key as in `assets/buildings`, with an identical picture. Whichever fragment wins the merge, the game shows the same toolbox. `lgx_check` reports it as a warning.
