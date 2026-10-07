CONTRACT_V3 §E is finished: all 9 buildings, the shop overlay, 9 construction stages, 8 items, 2 boats and the 2 staff overrides are in `assets/buildings/`. `bld_check.py` reports **0 errors, 0 warnings**, and the payload is **1.50 MB** (limit 5 MB). All 267 existing files under the protected asset folders, `tools/blender/` and `pack_utils.py` have the same sha1 as at the start. `prop_check` and `life_check` still pass.

## Files
- **Scripts (new):** `tools/blender/bld_assets.py`, `bld_boats.py`, `bld_render.py`, `bld_pack.py`, `bld_check.py`.
  - They only import `bl_common`, `prop_lib`, `prop_assets`, `life_assets`, `char_build`, `char_geo`, `char_anim`, `char_pack`, `prop_pack` and `pack_utils`; none of those were changed.
  - Render cache is `/tmp/fv_cache/buildings`. A full render took 35 min on the shared CPU, and reruns skip finished frames.
- **Assets:** `assets/buildings/` holds `manifest.json` plus atlases `bld_buildings`, `bld_buildings_2`, `bld_sites`, `bld_items`, `boat_rowboat`, `boat_fishing` (png + json each).
  - Atlases are 256-colour (imagequant, dither 0.6). I checked at 2× and saw no banding in the shadows.
- **Previews:** `docs/previews/bld_all.png` (labelled), `bld_scene.png`, `bld_items.png`, `bld_work.gif`, `bld_boats.gif`.
- **Packer guard:** `bld_pack.py` merges into the existing manifest. It keeps unknown top-level fields and hand-added entry fields; generated fields win.
  - It exits 1 without writing anything if any manifest or required key (boats included) is missing from the cache. `--allow-partial` overrides this.
  - It never writes an empty manifest.
  - I tested the guard with a partial cache, an empty cache and a missing cache folder; files were unchanged in each case.

## Manifest — `sprites{}`
All point fields are px offsets from the anchor. Anchor is the footprint centre, front is -Y (screen down-left), shadows are baked.

| key | kind | atlas | footprint | work anim | special fields |
|---|---|---|---|---|---|
| `warehouse` | building | bld_buildings | 3×3 m | 4f @ 6 fps: hoist lifts sacks, doors sway | inPoint [-158,38], outPoint [77,79], staffPoints [[-9,78]] SW, staffDepth front, doorPoint, fxPoints hoist/door |
| `station_cannery` | station | bld_buildings | 3×3 m | 4f @ 8 fps: cans travel the belt, press stamps, lamp, steam, smoke | inPoint [-158,38], outPoint [77,79], fxPoints press/steam/smoke/input/output |
| `shop_general` | building | bld_buildings | 3×3 m | none (static) | staffPoints [[-9,7]] SW, staffDepth front, overlay `shop_general_front`, customerPoints [[-70,37]] NE, cashPoint [-32,66], inPoint [131,50], fxPoints register/coins |
| `shop_general_front` | overlay | bld_buildings | — | — | `of: shop_general`, same frame and anchor |
| `station_toolsmith` | station | bld_buildings | 3×3 m | 4f @ 8 fps: trip hammer, spark burst on frame 2, bellows, coals, smoke | inPoint, outPoint (same as above), staffPoints [[-109,0]] SE, staffDepth front, fxPoints fire/sparks/smoke/steam |
| `house_a` | building | bld_buildings_2 | 2.2 m | — | fxPoints.smoke, doorPoint |
| `house_b` | building | bld_buildings_2 | 2.5 m | — | fxPoints.smoke, doorPoint |
| `house_c` | building | bld_buildings_2 | 2 m | — | fxPoints.smoke, doorPoint |
| `watchtower` | building | bld_buildings_2 | 2×2 m, ~5.3 m tall | idle unlit, 4f @ 8 fps fire | fxPoints fire [0,-248], smoke, platform |
| `boathouse` | building | bld_buildings_2 | 3×2 m | 4f @ 6 fps: crane lifts net, stove smoke | outPoint [-63,59], dockPoint [149,23], dockDir NE, doorPoint |
| `site_{plot,foundation,scaffold}_{S,M,L}` | site | bld_sites | 2/3/4 m | — | stage 0/1/2, stages, size; workPoints + workDirs; dropPoint. The three stages of one size share frame and anchor. |
| `item_can`, `item_fish_big`, `item_axe`, `item_pickaxe`, `item_rod`, `item_sickle`, `item_bow`, `item_toolbox` | item | bld_items | — | — | 72×72, anchor [0.5,0.75], icon; stackStep 14/14/8/8/8/8/8/14; carryScale 0.65/0.55/0.65/0.65/0.55/0.55/0.55/0.65 |
| `market_counter_staff` | staff | (no image) | — | — | `of: market_counter`, staffPoints [[70,-8]] SW, staffDepth behind |
| `trade_post_staff` | staff | (no image) | — | — | `of: trade_post`, staffPoints [[61,-21]] SW, staffDepth behind |

The two staff overrides were measured from the `prop_assets` geometry by ray-casting a chibi head; 98% and 100% of the head is visible. Nothing was re-rendered.

## Manifest — `characters{}`
Both boats are kind `boat`, have dirs S/SE/E/NE/N with the usual mirror, frame names `{anim}_{dir}_{i}`, the 1 px ink outline, and no shadow (`shadow: null`). Each entry also has `wakePoint[dir]`, `bowPoint[dir]`, `headTop`, `lengthM` and `crew`.

| boat | frame | anchor | anims | cargoPoint [dx, dy, behind] |
|---|---|---|---|---|
| `boat_rowboat` | 232×160 | [0.5, 0.65] (waterline centre) | idle 2f @ 3 fps, row 6f @ 9 fps | S [-1,-49,true], SE [-38,-41,true], E [-52,-22,false], NE [-37,-4,false], N [1,4,false] |
| `boat_fishing` | 336×304 | [0.5, 0.77632] | idle 2f @ 3, sail 4f @ 6 | S [1,-1,false], SE [45,-11,false], E [64,-33,false], NE [45,-56,true], N [-1,-65,true] |

## What the code integrator needs to do
- **Load the new fragment.** Add `'buildings'` to `FRAGMENTS` in `Assets.js`.
- **Shop clerk layering.** Draw the shop at depth d, the clerk at d + 0.5 (whatever the clerk's own y), then `shop_general_front` at d + 1. Without the overlay the clerk will appear standing in front of the counter.
- **Other staff spots.** Characters at the warehouse and toolsmith staff spots, and builders at site `workPoints`, should be drawn just above the building sprite. The existing market counter and trade post clerks use normal y-sorting (`staffDepth: behind`).
- **Pads.** All `inPoint`, `outPoint` and `cashPoint` values have dy > 0, so a character standing on a pad sorts above the building.

## Deviations
- **Shop overlay sprite.** I added `shop_general_front` because a clerk standing inside the shop can't be layered correctly any other way.
- **Two-part buildings atlas.** The building atlas is split into `bld_buildings` and `bld_buildings_2` to stay within 2048 px.
- **Watchtower height.** It is about 5.3 m including the flag.
- **Tools tilted.** The tool items lean back 60° to read as icons, unlike the other items, which lie flat. They still stack at 8 px.
- **Rower faces forward.** The rowboat fisherman faces the bow and pushes the oars, so his face shows when the boat moves toward the camera.
- **Boathouse pier.** The pier sticks out about 1 m past the 3×2 footprint toward world +Y (the sea).
- **Construction sites.** They are generic per size, not per building type.

## Known issues
- **Crowded scaffold.** In the S-size scaffold stage the scaffolding is crowded.
- **Hidden cargo on the fishing boat.** With `behind=true` (NE and N), the cabin hides a short fish stack completely.
- **Market counter clerk.** The awning edge partly covers the clerk's hair; the face is visible.
- **Sickle is a variant.** The sickle item uses a smoother blade than the small sickles in the shop and smithy; the code path is kept deterministic.
- **Scene previews are mock-ups.** `bld_scene.png` is a static composite, not a check inside the game engine.

Rerun commands: `/tmp/bvenv/bin/python tools/blender/bld_render.py -- [keys] [--force]`, then `python3 tools/blender/bld_pack.py`, then `python3 tools/blender/bld_check.py`.