# logistics — 비평·다듬기 기록

## critiques

[
 {
  "verdict": "polish",
  "summary": "Art-wise this is a strong set, and the \"polish\" verdict is about integration, not looks. The closed hall (blue corrugated walls, snowy barrel roof, striped awning, hazard-striped yellow dock doors) matches assets/town and veh_scene, and the open view feels like a busy, charming dollhouse at phone zoom 0.6–1.2. I checked this in my own Phaser 3.90 harness at 390x844 (DPR 3, 720 logical px) and at desktop size, next to supermarket, hardware_store, townhouse_a, truck_cargo, retro_bus, villagers and the chief. All shots are in scratch/v8_logistics_critic_art/shots/.\n\nLayer alignment is clean:\n- No seams between layers.\n- _interior_front and _interior_racks match _interior pixel-for-pixel (max difference ≤56, edge pixels only).\n- No inside layer pokes out past the closed shell (interior leak: 156 edge pixels).\n- No double shadows, and the racks stand on the floor (none float).\n- Vehicle headings and mirroring are correct, and the overlay frames match their base frames (mean difference ≤0.7).\n\nProblems that would hurt in the game:\n- **High:** `footprintPoly` was shipped in whole-frame pixel coordinates instead of offsets from the anchor. Every \"is this person in front of the building?\" test fails, so the door queue, the dock hand and the docked vans would sort behind the shell.\n- **High:** two pickers stand exactly where the forklift picks and puts away goods, so the forklift drives through them.\n- **Medium:**\n  - The tip to skip the inside layers while closed would delete the outdoor concrete apron, because the apron is inside `_floor`.\n  - The baked `_props` layer cannot sort against docked vehicles.\n  - Some appliances and furniture never fit their shelf slot.\n  - How many stacks go in each rack slot is not written in the manifest.\n  - The name board ships blank, while the previews show the name.\n  - The producers' baked smoke looks like grey rocks, and the operators stand in front of the machines and hide the work animation.\n  - Each forklift has a snow disc on top, even though it works indoors.\n  - The building casts no shadow once opened.\n  - The open dock doors show a fixed, empty picture of the inside.\n  - A few path, queue and naming details need fixing.\n\nAll of these can be fixed with data or small re-render changes; the art direction can stay as it is.",
  "issues": [
   {
    "severity": "high",
    "area": "manifest / footprintPoly (integration)",
    "problem": "logistics_center.footprintPoly is in absolute frame pixels: [[48,475],[546,724],[908,543],[410,294]]. Every other manifest, and the logistics producers, use offsets from the anchor (e.g. town clinic [[-154,-5],[9,77],...]). The anchor is at frame pixel (478,509), so the shipped polygon sits 478 px right and 509 px down, off the building. The outsideActors rule ('in front when below the two front edges of footprintPoly') then puts the dock hand and the vans at dockVehiclePoints BEHIND the building. It also cannot place doorPoint or the outdoor queue (customer places 4–6) at all, because they fall outside the shipped polygon's x-range. Any 'chief entered the building, so reveal' test, collision test or placement test using the polygon breaks too. lgx_check.py (line 124) only checks that the field exists.",
    "evidence": "assets/logistics/manifest.json sprites.logistics_center.footprintPoly. The cause is tools/blender/lgx_render.py around line 373: footprintPoly uses px_of(p, anchor), while hull_px uses (0,0). The red polygon labelled 'footprintPoly AS SHIPPED' in scratch/v8_logistics_critic_art/shots/d_overlay_open.png and d_vehicles.png lands on the snow below the building. With the shipped polygon, dockhand, van@dock1 and truck@dock2 test as 'behind'; with the corrected polygon they test 'in front'. The full numbers are in my bash run.",
    "fix": "Export the polygon relative to the anchor, as [[-430,-34],[68,215],[430,34],[-68,-215]] (use px_of(p,(0,0)) or subtract anchorPx in lgx_pack). Add an lgx_check rule that the polygon's centroid is within ±5 px of (0,0) and its bounding box equals footprint [860,430]. Also write down what the rule does to the right of the right corner: truck_cargo at dock 2 is at x=464, past the corner at x=430. For example, compare such points against the corner's y."
   },
   {
    "severity": "high",
    "area": "staffPoints vs forkliftPath",
    "problem": "The food-rack picker stands 0.76 m from forklift path node F0, the food-rack pick facing NE. The tools-rack picker stands 0.75 m from F8, the tools-rack put-away. Each picker is standing right where the forks go in, so whenever the forklift works it drives and lifts through them. The furniture picker is also only 0.23 m from the forklift's side at F0. The manifest's validation list is empty because it never tests staff against the forklift path.",
    "evidence": "In the manifest: staffPoints[3] = (-22,-120) vs forkliftPath[0] = (-57,-103); staffPoints[4] = (186,-16) vs forkliftPath[8] = (152,1). In scratch/v8_logistics_critic_art/shots/evidence_picker_vs_forklift_F0.png the lifted forks cut through the picker's head and the overhead guard covers the furniture picker. Also see d_overlay_open.png, where the 'picker NE any' label sits on top of 'F0 NE pick mid', and d_z2_rack.png.",
    "fix": "Move the pickers to the gaps between racks, clear of the forks. For example, food picker to about (26,-93), between the food and goods racks (about 0.55 m clear of F0); tools picker to about (234,11), between the tools and appliance racks (about 0.55 m clear of F8 once it faces NE). Add a keep-clear test to lgx_pack validation: the forklift footprint plus 1.4 m of fork reach at each action node must not contain any staff, customer or dock point."
   },
   {
    "severity": "medium",
    "area": "layers / closed-state fill-rate advice",
    "problem": "The manifest's reveal.notes and the build report say the inside layers can be skipped while the shell is at alpha 1 and the doors are closed. But `_floor` also holds the outdoor apron: the concrete pads in front of the docks and the entrance, the red doormat, the yellow-framed inPoint pad and the dock levellers. That is 52.7k pixels visible outside the solid shell. Following the advice deletes them, and the bench, bin, bollards and sign are left floating on bare snow.",
    "evidence": "scratch/v8_logistics_critic_art/frames/closed_skip_inside.png: on the left the documented order; on the right the same with the inside layers skipped, and the apron is gone. Pixel test: _floor has 52,731 pixels with alpha above 40 outside the shell's opaque area.",
    "fix": "Split the apron, the mats and the outdoor levellers into their own always-drawn `logistics_center_apron` layer (depth about -0.03). Alternatively, fold them into `_props`/`_stub`. Then correct reveal.notes and the build report, which currently say only _stub and _props are always drawn."
   },
   {
    "severity": "medium",
    "area": "_props depth vs docked vehicles",
    "problem": "Every apron prop is baked into one `_props` sprite at building depth +0.01: the round forklift sign on a pole at dock 1, the dock-light posts, bollards, the empty-pallet stack, bench, bin and snow lumps. A docked vehicle sorted as an outside actor therefore always draws over all of them. The forklift sign stands on the -Y side of the truck, nearer the camera, yet the truck's green bed covers half the sign. Bollards and dock posts get the same wrong overlap as vehicles come and go.",
    "evidence": "scratch/v8_logistics_critic_art/shots/evidence_props_under_truck.png and d_z2_docks_closed.png: the truck_cargo bed covers the forklift-sign disc. The builder's own docs/previews/lgx_phaser_closed.png shows the same with the red van at dock 1. Also p10_open_docks_crop.png.",
    "fix": "Export the tall or free-standing props (forklift sign, the 2 dock-light posts, bollards, bench, bin, pallet stack, lamp) as separate sprites, each with its own ground anchor, so they are y-sorted like town props. Keep only flat decals in `_props`. The cheaper alternative is to move the sign and pallets at least 0.8 m out of the dockVehiclePoints lanes."
   },
   {
    "severity": "medium",
    "area": "rackSlots / item fit",
    "problem": "Some items are taller than the space on their shelf. At the documented stock scale of 0.85: fridge 42.5 px, stove_iron 40 px and tv_retro 39 px against a 34 px limit on appliance levels 0–1; chair and wardrobe 46 px against a 40 px limit on furniture level 0. So 3 of the 5 appliance types can never go on 4 of the 6 appliance slots, and 2 of the 5 furniture types never on furniture level 0. rackCategories lists them all, so the game will either leave gaps or draw past the limit. lgx_preview allows going 6 px over the limit, so its TV pokes 5 px into the shelf above.",
    "evidence": "My bash table of item topPx×0.85 against maxStackPx, and shots/desk_info.json, which lists 21 'too tall' cases in the harness's strict fill. tools/blender/lgx_preview.py lines 184–186 (`if h1 > s['maxStackPx'] + 6`).",
    "fix": "Give each rackSlot an `items` list of the keys that fit, or give each item a `fitsLevels` table. Alternatively, raise the spacing of the lower appliance and furniture levels to about 1.45 m (like the furniture rack's level 1), or export `stockScale` per category (for example 0.72 for appliances and furniture). Make lgx_check fail whenever an item in rackCategories cannot fit at least one slot of its category."
   },
   {
    "severity": "medium",
    "area": "rackSlots / stock layout rule",
    "problem": "The manifest rule says 'lanes x rows of stacks … full = every lane x row stacked to maxStackPx', but no slot says how many lanes or rows it has. The reference code uses an unwritten rule: trimmed width ≤44 px gets 2×2, otherwise 1×1, and floor bays 1×1. A developer following the written rule with 2×2 everywhere turns the four materials floor bays into one solid wall of pallets that hides the bay markings.",
    "evidence": "tools/blender/lgx_preview.py lines 167–181 (the hidden rule). scratch/v8_logistics_critic_art/shots/p06_open_crop.png, d_full_open.png and p10_open_racks_crop.png: the floor-bay pallet heap when the written rule is followed.",
    "fix": "Export `cells` per slot (for example {small: [[t,u],…], big: [[0,0]]}), or an item `sizeClass` / `footprintPx`, plus `stockScale: 0.85` in conventions. Floor bays should be a single 1×1 pallet stack each."
   },
   {
    "severity": "medium",
    "area": "name board",
    "problem": "The shipped shell has a blank cream name board, and the game expects to write sheared text onto it (nameBoard.shearY 0.5). No other manifest uses nameBoard, and no code in src/ reads it. Phaser Text cannot be sheared without a custom CanvasTexture or mesh. The designer's previews (lgx_all.png) show '솔방울 물류센터' painted on, but in the game the facade will show an empty board that looks unfinished.",
    "evidence": "docs/previews/lgx_phaser_closed.png and scratch/v8_logistics_critic_art/shots/p06_town_crop.png show the blank board beside the town shops. `grep -rn nameBoard src/` finds nothing.",
    "fix": "Render baked board patches `logistics_center_nameplate_ko` and `_en` at the same frame and anchor (depthOffset 0.0005), fading with the shell, and keep the blank board only for custom names. Make the previews use the shipped patch rather than drawing the text in preview code."
   },
   {
    "severity": "medium",
    "area": "producers work anim + workSpot",
    "problem": "The chimney smoke baked into the work frames is faceted low-poly grey blobs with dithered, speckled transparency. It loops in 4 frames at 8 fps (0.5 s), so it looks like grey rocks jittering above both chimneys. The operator at workSpot faces NW, back to the camera, and stands right in front of the saw and press. That hides the saw, sawdust, press ram and sparks, which is the main motion.",
    "evidence": "scratch/v8_logistics_critic_art/frames/factory_zoom.png (smoke facets and dithering, small sparks), frames/producers.png, and shots/evidence_operator_hides_work.png / p10_producers_crop.png: the operator covers the saw and the press.",
    "fix": "Take the smoke out of the baked frames and let the game spawn the existing soft smoke FX at fxPoints.smoke. Alternatively, re-render 8 soft frames at about 6 fps with non-dithered alpha. Move workSpot to the side of the machine, for example the right end of the bench or press table facing W (mirrored E), so the saw or press stays visible and the operator is seen in profile. Also fix the workSpot note, which says W while dir says NW."
   },
   {
    "severity": "medium",
    "area": "forklift / pallet_jack look",
    "problem": "Every forklift, loaded or not, carries a large solid snow disc on its open-frame overhead guard. These vehicles work inside the warehouse. At 0.6–1.2x the disc reads as a white lid floating on the bars and is the brightest spot on every forklift inside.",
    "evidence": "scratch/v8_logistics_critic_art/frames/veh_points_3x.png, frames/vehicles_grid.png, shots/p10_open_racks_crop.png and evidence_picker_vs_forklift_F0.png.",
    "fix": "Turn off snow on the forklift and forklift_loaded roofs (and check the pallet jack). Keep the snow on the vans, moving truck and truck_cargo, which work outdoors."
   },
   {
    "severity": "medium",
    "area": "open state shadow",
    "problem": "The building's only shadow on the ground is in `_shell` (about 124k dark semi-transparent pixels). When the shell fades out, the 4 m back walls, the stub walls and the apron props cast nothing on the snow. Next to the supermarket and streetlight shadows, the open warehouse looks pasted on.",
    "evidence": "scratch/v8_logistics_critic_art/frames/alpha_logistics_center_shell.png (the shadow footprint), shots/d_layers_only.png and p06_open_crop.png: no shadow right of the back wall's end, while the neighbours have shadows.",
    "fix": "Render a `logistics_center_shadow_open` pass: shadow catcher on, with back, stub and props casting and the shell hidden. Fade it in as the shell fades out, at depth about -0.45."
   },
   {
    "severity": "medium",
    "area": "dock door patches",
    "problem": "The dock patches bake a picture of the inside, seen through the opening, into the door frames. With a door open and the shell closed, the player sees bare appliance shelves and an empty floor through dock 2, whatever the stock level. A forklift inside is hidden by the patch until it crosses the wall, and then pops into view.",
    "evidence": "scratch/v8_logistics_critic_art/frames/docks_open_with_props.png and frames/dock1_seq.png: dock 2 open shows empty orange shelves.",
    "fix": "Render `_shell` without the door leaves, with the openings transparent, and make the dock patches the leaf only. Then the real inside layers, stock and actors show through an open door. If that is too much, at least darken the baked interior in the opening so the empty shelves don't read."
   },
   {
    "severity": "medium",
    "area": "forkliftPath details",
    "problem": "Node 8 'drop at the tools rack' has dir NW, along the lane, so the forks point down the aisle and not into the rack (node 0 correctly uses NE). At the dock nodes the forklift centre sits about 0.15 m outside the wall, and the docked vehicle's tail is at about 0.35 m: F2 (330,91) at X 5.65 vs van/truck tail X 5.86, F5 (161,175) vs truck tail X 5.85. With 1.25 m of half-length, the mast and wheels overlap the vehicle's rear. Reverse legs (nodes 3 and 6) are only implied by dir≠motion, so the builder's own Phaser test turns the forklift round instead of reversing. Also, dock1 is the van bay in lgx_center.py and the path notes but holds the truck in lgx_scene.png.",
    "evidence": "forkliftPath in the manifest. scratch/v8_logistics_critic_art/shots/d_z2_docks.png (F5 dot on the truck's rear wheel, F2 on the van's tail). tools/test/logistics_phaser.mjs line 80 picks dir from motion.",
    "fix": "Set F8 dir to 'NE'. Put F2 and F5 at about X=5.0 (on the leveller, inside the door) so that only forkTip (+1.37 m) reaches the bed, or move dockVehiclePoints 0.5 m further out. Add `reverse:true` on legs 3→4 and 6→7. Settle the dock1/dock2 roles (van vs truck) in dockNames."
   },
   {
    "severity": "low",
    "area": "customer queue",
    "problem": "Queue places are 34 px (0.75 m) apart, but a chibi is about 45 px wide, so c0–c3 inside and c4 at the door merge into one blob at 1.2x. The outside queue head c4 (-287,71) is 10 px from doorPoint (-278,67), so it stands in the doorway and blocks anyone leaving.",
    "evidence": "scratch/v8_logistics_critic_art/shots/p12_open_office_crop.png and d_z2_counter.png.",
    "fix": "Space the places 46–50 px apart (1.0–1.1 m). Start the outside queue about 1 m to the side of the door, for example c4 at about (-323,45), then run it SW as now."
   },
   {
    "severity": "low",
    "area": "conventions gaps",
    "problem": "Some values are not defined in the conventions text:\n- staffBands uses 'any' (pickers) and 'outside' (dock hand), but the text defines only mid/front.\n- conveyor.start/end are at belt height (0.85 m), not on the ground; this is not stated.\n- moving_truck unload only reads in NE/NW. In SE/SW the roll door and ramp face away, and rampPoint is hidden.",
    "evidence": "In the manifest: staffBands, conventions.cutaway, conveyor. scratch/v8_logistics_critic_art/frames/vehicles_grid.png: unload_SE_5 looks the same as idle.",
    "fix": "Define 'any' (for example 'mid unless y > lane y'), or replace it with mid/front. Document conveyor heightM, or export ground points. Add `unloadDirs: ['NE','NW']` to moving_truck."
   },
   {
    "severity": "low",
    "area": "category variety / design coverage",
    "problem": "Goods (가공품) shows plain cardboard boxes and crates of cans, the same cans the food rack uses. Tools is one real item (toolbox) plus the same plain boxes, so at 0.6x the goods and tools racks both read as brown boxes except the red toolboxes. The design's materials list has 광석 (ore), but rackCategories.materials has no ore. The design's 훈제고기 (smoked meat) is not clearly shown.",
    "evidence": "scratch/v8_logistics_critic_art/shots/p10_open_racks_crop.png and frames/items_phone06_x3.png. 기획서 v8 §1.",
    "fix": "Add 2–3 goods boxes with printed colour labels (jam jars, cloth rolls, smoked-fish packs) and a pallet_ore. Bring in the existing buildings items item_axe, item_pickaxe and item_sickle (or a tool rack crate) for tools."
   },
   {
    "severity": "low",
    "area": "duplicate key",
    "problem": "item_toolbox already exists in assets/buildings (bld_items). The logistics fragment ships a re-render under the same key. Assets.mergeManifests uses Object.assign, so whichever loads later silently re-points the v3 tools-chain item to the other atlas (lgx_items or bld_items).",
    "evidence": "Duplicate scan in my bash run: sprites item_toolbox in ['buildings','logistics']. src/core/Assets.js line 122. The two frames are nearly identical (mean difference 0.9).",
    "fix": "Remove item_toolbox from the logistics manifest and reference the buildings key in rackCategories, or rename it to item_toolbox_lgx."
   },
   {
    "severity": "low",
    "area": "half reveal state",
    "problem": "At 45% the shell's awning, hazard stripes, roof snow and ground shadow lie as a ghost over the stocked interior. This is the muddiest of the four states.",
    "evidence": "scratch/v8_logistics_critic_art/shots/p06_half_crop.png vs p06_cut_crop.png.",
    "fix": "Only pass through 'half' during the 350 ms tween, or replace it with the 'cut' state as the in-between."
   },
   {
    "severity": "low",
    "area": "vans",
    "problem": "The delivery vans have no rear-door-open frame. The path 'picks a pallet from the van' through a closed rear, and the design wants vans visibly loading and unloading. The moving truck does have one.",
    "evidence": "lgx_delivery_van_*.json has only idle and move. scratch/v8_logistics_critic_art/frames/veh_points_3x.png.",
    "fix": "Add `unload` (4 frames: rear doors swing open, NE/SE) to delivery_van, with the doors' open extent in the manifest."
   }
  ],
  "keep": [
   "Closed exterior: blue corrugated hall, snowy barrel roof with the icy blue band and the box on the roof, green-and-white striped awning, brick plinth, yellow roll-up docks under hazard-striped canopies, round box emblem. It sits naturally next to assets/town (p06_town_crop.png).",
   "Cutaway layer method: one frame and one anchor for all layers, the depthOffset ordering, and _interior_front / _interior_racks derived from _interior. I found no seams and no double shadows, inside layers do not poke out past the shell (only edge pixels), and the racks stand on the floor.",
   "Mid/front drawing bands: the clerk behind the counter and the packers behind the conveyor and table are hidden by the furniture correctly (zoom_table.png, d_z2_counter.png).",
   "Office corner: wall clock, cork board, calendar, file cabinet, pot-belly stove with the sleeping cat, abacus, ledger, stamp, bell, and the water cooler by the door. This is exactly the kind of detail the designer loves.",
   "Round category signs on the racks (fish, can, hammer, fridge, chair, plus the floor sign for materials). They read at 0.6x.",
   "Conveyor patch: a seamless 8-frame loop with the feeder hood and the labeller arch (conveyor_seq.png). The lamp and dock-door patches line up with the shell.",
   "The 22 items: cute silhouettes that read at phone size (items_4x.png, items_phone06_x3.png). The retro fridge, the pot-belly stove with its kettle and the TV with antennas are especially good.",
   "Vehicles: headings and mirroring are right in all 4 directions. Overlay frames match the base frames. cargoPoint (including behind=true for NE), forkTipPoint, liftPx, handlePoint, pushOffset and rearDoorPoint all check out. The forklift lift (0 to 1.25 m), the moving-truck NE unload with door, ramp and boxes inside, and the retro vans in three colours.",
   "Producers' overall design: the plank workshop with a giant chair on the ridge, and the brick factory with a striped chimney, a TV emblem and a stamping press with sparks.",
   "Payload 1.84 MB, within the 7 MB budget. The atlases are 2048 px or smaller, and the frame counts follow the vehicles' house conventions (idle 2, move 4).",
   "bandDepth export, the revealPoly hull (simplified with RDP), the 350 ms fade, and the reveal tested by both tap and hover."
  ]
 }
]

## polish

# logistics build report (after the polish)

I fixed every high and medium critic issue and all the low ones. The centre, the two producers, both forklifts and five new items were re-rendered, then packed, checked, previewed and load-tested again.

- **Check:** `lgx_check.py` reports 0 errors and 1 warning. The warning is that `item_toolbox` is also a key in `assets/buildings`; it is the same builder and looks the same, so whichever fragment loads last shows the same picture. The validation list is empty: depth bands, forklift keep-clear and stock fit all pass.
- **Phaser 3.90 load test:**
  - All 205 frames found and 40 anims registered.
  - No page errors and no 404s.
  - 129 stock stacks drawn, none taller than its shelf.
  - All 11 outdoor props drawn.
  - The forklift drove its path, lifting at each pick and drop.
  - The reveal works by tap and by hover: shell, door leaves and name plate fade to 0 while `_shadow_open` fades to 1, and back.
- **Repack:** gives byte-identical files.
- **Payload:** 1.84 MB (limit 7 MB).
- **Closed look kept:** outside the dock openings the new shell matches the old one, apart from colour-palette noise.

## Keys

**`logistics_center`** (솔방울 물류센터), 11 × 8 m. All layers share one frame (1152 × 864) and one anchor, each with its own depth offset:

| Key | Depth offset | Notes |
|---|---|---|
| `_apron` | -0.45 | **New.** Outside ground, always drawn. |
| `_shadow_open` | -0.44 | **New.** Shadow of the open building; alpha = 1 − shell alpha. |
| `_back` | -0.40 | |
| `_floor` | -0.35 | The apron moved out of this layer. |
| `_interior` | -0.30 | |
| `_lamp` (patch) | -0.29 | |
| `_interior_racks` | -0.22 | |
| `_interior_front` | -0.10 | |
| `_conveyor` (patch) | -0.09 | |
| `_stub` | -0.02 | |
| `_shell_cut` | -0.015 | |
| `_shell` | 0 | Now has open holes at the dock doors. |
| `_nameplate_ko` / `_en` | 0.0005 | **New.** Baked raised lettering "솔방울 물류센터" / "Pinecone Logistics". |
| `_dock1` / `_dock2` (patches) | 0.001 | The door leaf only. Always drawn; frame 0 = closed. |
| `_props` | 0.01 | The wall bumpers only. |
| `_prop_<kind>` ×8 | own anchor | **New.** bollard, docklight, bench, bin, pallets, loadsign, snow_big, snow_small. Each is its own y-sorted sprite with a ground anchor and soft shadow. |

**Items (27):**
- **Furniture:** chair, table, sofa, bed, wardrobe.
- **Appliances:** fridge, stove_iron, washer, radio, tv_retro.
- **Tools:** toolbox, and new `item_crate_tools` (axes and picks heads-up, plus a sickle).
- **Food:** crate_food, crate_cans, crate_bread, crate_produce, and new `item_crate_smoked` (훈제 hams and golden fish).
- **Goods:** new `item_crate_jam` and new `item_cloth_rolls`.
- **Pallets:** planks, ingots, logs, boxes, and new `pallet_ore` (광석).
- **Boxes:** cardboard_box_s / m / l.
- Every item now has a `sizeClass` (small or big).

**Producers:**
- `furniture_workshop` and `appliance_factory`, each with a 4-frame work anim.
- The baked chimney smoke is gone. A new `smokeFx` field tells the game to spawn the soft `fx_smoke` puffs at `fxPoints.smoke`, the same way houses do.
- The operator (`workSpot` / `staffPoints`) now stands at the screen-left of the machine, side-on and facing E, so the saw or press stays visible.

**Vehicles:**
- `forklift` / `forklift_loaded`: no snow on the roof any more; lift is 6 frames with `liftPx`.
- `delivery_van_red`, `_blue`, `_mint`.
- `moving_truck`: unload is 6 frames with `rampPoint`, plus new `unloadDirs` ['NE', 'NW'] (the rear only faces the camera in those two).
- `pallet_jack`.

## Centre fields
- **`footprintPoly`:** now in offsets from the anchor, `[[-430,-34],[68,215],[430,34],[-68,-215]]`.
- **New `frontTest`** {a 181, b 249}: a point is in front of the building when `y − x/2 > a` or `y + x/2 > b`.
- **Layering:** `revealPoly`, `layerOrder`, and the lists `alwaysDrawn` and `insideLayers`. `bandDepth` is {stock −0.25, mid −0.20, front −0.05}.
- **`reveal.states`:** now carry the `_shadow_open` alpha; `withShell` lists what fades with the shell; `fadeMs` is 350.
- **Docks:** `dockPoints`, `dockDirs`, `dockNames`, new `dockRoles` (dock 1 = van bay, dock 2 = truck bay), and `dockVehiclePoints`.
- **`forkliftPath`:** 10 nodes. Each has `dir` (facing during its action), new `legDir` (facing while driving to the next node), new `reverse`, `legBand`, and `action`. The dock nodes stand on the leveller inside the door, so only the forks reach into a vehicle.
- **`rackSlots`:** 30 slots. Each has new `cells` (small items 2 × 2, big 1 × 1, floor bays 1 × 1), new `maxStackPxBy`, and new `itemFit` (item key → how many stacks of it fit). `stockScale` is 0.85 for every category.
- **Staff:** bands are now only mid / front / outside.
- **Customers:** the 7-place queue is spaced 0.95 m apart.
- **Outdoor props:** new `outdoorProps`, 11 placements.
- **Other points:** `doorPoint`, `inPoint`, `insidePoint`, `conveyor` (new `heightM`, `startGround` / `endGround`), `fxPoints`, `nameBoard` (now only for a custom name).

## How the game composes and reveals it
1. **Place the layers** at the building anchor with depth = building depth + depth offset. Always draw the apron, bumpers, door leaves, one name plate and the outdoor props.
2. **Skip the inside while hidden.** While the shell is at alpha 1 and both doors are closed, the inside layers, stock and inside actors are fully covered and can be skipped.
3. **Open dock doors** show the real inside through the hole in the shell, dimmed to at most 55 % by the roof shadow baked into `_shell`.
4. **Stock:** for each slot, pick a key from `itemFit`. Draw one stack per cell of `cells[sizeClass]`, at `stockScale`, back rows first, with up to `itemFit[key]` copies per stack. The stock level (0–1) sets how many copies are drawn.
5. **Inside actors** go in band mid or front, sorted by y. The forklift faces `legDir` while driving and `dir` while lifting.
6. **Outside actors, outdoor props and docked vehicles** use plain y-sort, plus the `frontTest` rule for anything in front of the left part of the front wall.
7. **Reveal:** a tap or hover inside `revealPoly` fades the shell, door leaves and name plate to 0 and `_shadow_open` to 1; a second tap reverses it.

`lgx_preview.py` and `logistics_phaser.mjs` both follow these rules.

## Issues: fixed / not reproduced / won't fix

| Critic issue | Result |
|---|---|
| High: `footprintPoly` in frame pixels | Reproduced and fixed. Now offsets from the anchor, plus `frontTest`; the check fails on a wrong centroid or bounding box. |
| High: pickers stand in the forklift's path | Reproduced and fixed. Pickers moved between racks, outside the lane line; the furniture picker is clear of the fork sweep; the tools put-away node now faces NE. A keep-clear test in the packer guards this for every leg and node. |
| Skipping the inside while closed deleted the apron | Reproduced and fixed with its own always-drawn `_apron` layer; the notes are corrected. |
| `_props` cannot sort against docked vehicles | Reproduced and fixed. Free-standing props are their own y-sorted sprites with shadows, moved so no docked vehicle has one beside its near side; only the bumpers stay in `_props`. |
| Tall appliances and furniture never fit their slots | Reproduced and fixed. The appliance rack is now 2 levels 1.5 m apart and the furniture rack's lower level is taller; every item fits at 0.85; the check fails if an item fits no slot of its category. |
| Stacks per slot not in the manifest | Fixed with `cells`, `sizeClass`, `itemFit`, `stockScale` and `maxStackPxBy`. Heights are measured at each cell, which also fixes back rows poking into the shelf above. |
| Name board ships blank | Fixed with baked Korean and English name plates; the previews use them. |
| Producer smoke looks like rocks; operator hides the machine | Fixed. Smoke is no longer baked (`smokeFx`); the operator stands side-on, facing E, and the note matches. |
| Snow disc on the forklift roof | Fixed; both forklifts re-rendered. |
| No shadow when open | Fixed with the new `_shadow_open` layer, cross-faded with the shell. |
| Open dock doors show a fixed empty picture | Fixed. The door patches are the leaf only and the shell has holes, so stock and the forklift show through. |
| Forklift path details | Fixed: tools put-away faces NE, dock nodes at x 5.0 m inside the door, `legDir` and `reverse` added, dock roles settled (van at dock 1, truck at dock 2). |
| Low: customer queue too tight | Fixed: 0.95 m (about 48 px) apart; the outside queue starts 1 m beside the door. |
| Low: conventions gaps | Fixed: "any" replaced by mid, "outside" defined, conveyor `heightM` and ground points, `unloadDirs`. |
| Low: goods and tools racks look the same | Fixed with five new items (jam crate, cloth rolls, smoked goods, tool crate, ore pallet). |
| Truncated last issue ("d…") | Text not received. Most likely the duplicate `item_toolbox` key (the critic saved a toolbox-duplicate frame). Won't fix: the contract names `item_toolbox`, both copies look the same, and it is documented and reported as a warning. |

## Known issues
- **Thin rods under goods:** goods next to a rack end still draw over that frame's thin bracing rods; only visible at 2×.
- **Darker shadow mid-fade:** the closed and open shadows overlap during the 350 ms fade, so the ground beside the building is a little darker for that moment.
- **Moving vehicles and y-sort:** plain y-sort is correct for vehicles parked at the dock points, but a long vehicle driving past a prop on its camera side can briefly sort wrong.
- **Daylight only:** there is no night interior.
- **`item_toolbox`:** same key as in `assets/buildings`, as described above.

A WIP snapshot commit made by someone else (not me) already contains part of this session's script changes; I ran no git commands.

## Paths
Everything is in `/home/user/nurient/frost-village`:
- **Assets:** `assets/logistics/` (`manifest.json` and 13 atlases, including the new `lgx_center_d`).
- **Scripts:** `tools/blender/lgx_lib.py`, `lgx_center.py`, `lgx_assets.py`, `lgx_vehicles.py`, `lgx_render.py`, `lgx_pack.py`, `lgx_check.py`, `lgx_preview.py`, and `tools/test/logistics_phaser.mjs`.
- **Report:** `docs/build_reports/logistics.md` (updated).
- **Previews:** `docs/previews/lgx_all.png`, `lgx_cutaway.png`, `lgx_scene.png`, `lgx_reveal.gif`, `lgx_stock.gif`, `lgx_docks.gif`, `lgx_conveyor.gif`, `lgx_forklift.gif`, `lgx_trucks.gif`, `lgx_producers.gif`, `lgx_phaser_closed.png`, `lgx_phaser_open.png`.
- **Render cache:** `/tmp/fv_cache/logistics`.
