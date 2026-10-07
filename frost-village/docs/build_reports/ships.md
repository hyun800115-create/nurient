# ships build report

All seven CONTRACT_V6 §S assets are in `assets/ships/`: ferry, cargo_ship, trawler_big, tugboat, sailboat, yacht and seagull. `ship_check.py` reports 0 errors and 0 warnings, and the payload is 3.37 MB of the 5 MB budget. A headless Phaser 3.90 test loads all 7 atlases and builds 66 animations from 257 frames. No frames are missing, no files 404 and the console shows no errors. Re-packing gives byte-identical files.

One incident to pass on: my first dry run of the packer wrote into another agent's scratch folder, `scratchpad/packtest/out/manifest.json`. That file was itself a rebuild the town agent had already made after the same mistake. I put it back to that state: boar, deer and villager_a entries copied from `assets/characters/manifest.json`, with the earlier `_note` kept. I also deleted the files I had added there. The owning agent should re-run its own pack if it still needs that folder. Every dry run after that went to `scratchpad/ships_agent_v6_dry/`.

## Keys, headings, anims
Each ship is an entry under `characters{}` (kind `"ship"`, seagull `"bird"`) with one atlas each, `ship_<key>`, at most 2048 px. Frame names are `{anim}_{dir}_{i}`.

| key | length | headings | anims |
|---|---|---|---|
| `ferry` | 16 m | S, SE, NE | idle 2f, move 4f, foam 4f |
| `cargo_ship` | 21 m | S, SE, NE | idle, move, foam + 6 container slots |
| `trawler_big` | 14 m | S, SE, NE | idle, move, foam, haul 6f (NE only) |
| `tugboat` | 6.2 m | S, SE, NE | idle 2f, move 4f |
| `sailboat` | 5.6 m | S, SE, NE | idle 2f, move 4f |
| `yacht` | 7.2 m | S, SE, NE | idle 2f, move 4f |
| `seagull` | — | S, SE, E, NE, N | fly 6f, glide 2f, land 4f (plays once), idle 4f |

- **Headings:** ships sail along the two iso axes. SE (down-right) and NE (up-right) are rendered, and the game mirrors SW from SE and NW from NE with flipX, negating each point's dx. S is the "arriving toward the camera" heading. E, W and N are not rendered; the manifest field `nearest` says which heading to use instead.
- **Cargo ship length:** it is 21 m rather than about 22 m, because at 22 m its two diagonal views don't fit in one 2048 atlas.
- **Haul heading:** the trawler's haul is rendered only for NE, where the stern faces the camera. Turn it to NE or NW before hauling.

## How the game should draw them
1. **Small boats and the gull** work like the existing `boat_rowboat`. Each frame is a complete picture, so `Assets.buildCharacter` handles them once `ships` is added to `FRAGMENTS`.
2. **The ferry, cargo ship and trawler are layered** (`layered: true`). This is what keeps a 16–21 m ship inside one atlas.
   - Put all layers in one container with the same position, origin (= anchor) and flipX.
   - Draw order: image `base_<dir>`, then deck people or cargo slots, then `foam_<dir>_i` while moving, then the current idle/move/haul sprite on top.
   - The anim frames hold only the moving parts (funnel smoke, haul gear) and are already occluded by the ship.
   - Bob the container: `y += bob.px * sin(2πt / bob.periodS)`.
3. **Ferry passengers:** `deckPoints[dir]` are spots where a whole townsperson is visible (ray-tested per heading, ordered far to near): 11 for S, 12 for SE, 13 for NE.
4. **Ferry gangway:** there are openings on both sides. `gangwayPoint` is the camera side and `gangwayFarPoint` the far side. The new `harbor/ferry_terminal` puts the sea in front of the quay, so a berthed ferry touches it with its far side. Use heading SE or NW and `ferry anchor = terminal anchor + terminal.gangwayPoint − ferry.gangwayFarPoint[dir]`. Its notes say to put the ship anchor at `berthPoint`, but that would sink the hull into the gangway by half the ship's width.
5. **Cargo:** each container stack is its own sprite, `slot<k>_<dir>`, already cut where the ship hides it. Draw the loaded ones in `cargoSlots.order[dir]` and hide them when unloaded. `cargoPoints` are the same spots, for the game's own crate stacks.
6. **Other points** (per heading): `wakePoint` (for `fx_wake`/`fx_wake_ring`), `bowPoint`, `smokePoint`, `hornPoint`, `perchPoints` (where a gull can sit), `lightPoints`, `hookPoint`, `netPoint`, `towPoint`, `headTop`, plus `lengthM`, `beamM` and `speedPx`. The gull's anchor is at its feet in every frame; for flight, raise the anchor by the altitude and draw a small shadow on the ground.

## Known issues
- **Haul is a loop:** the net bag swings up and down out of the water; the fish are never dumped on deck.
- **Mirrored ferry:** SW and NW flip the flags and the funnel star.
- **Trawler haul overlay:** a few edge pixels of the wider net drum show only where they stick out past the drum in the base picture.
- **Scenes are mock-ups:** `ships_scene.png` is a static composite, not an in-game capture.
- **Repo state:** `git status` shows four of my scripts already tracked and modified, so someone has been committing work in progress.

## Files
All paths are under `/home/user/nurient/frost-village/`.
- **Scripts:** `tools/blender/ship_lib.py`, `ship_models.py`, `ship_gull.py`, `ship_render.py`, `ship_pack.py` (MaxRects packing, merge, guard), `ship_check.py`, `ship_preview.py`, and `tools/test/ships_phaser.mjs`.
  - They import `bl_common`, `prop_lib`, `prop_assets`, `bld_boats`, `bld_assets`, `char_*` and `pack_utils` without changing them.
  - Render cache is `/tmp/fv_cache/ships`. Re-rendering is resumable, and a cached frame at a different frame size is treated as out of date and re-rendered.
  - The packer refuses (exit 1, nothing written) if the cache folder is missing, empty or incomplete; I tested all three.
- **Assets:** `assets/ships/manifest.json` and seven `ship_<key>.png/.json` atlases.
- **Previews** (in `docs/previews/`):
  - `ships_all.png`
  - `ships_scene.png`: the ferry berthed at `harbor/ferry_terminal`, with the existing dock_pier, boathouse, boats and villagers for scale
  - `ships_move.gif`
  - `ships_haul.gif`
  - `ships_gull.gif`
  - `ships_phaser.png`
- **Rerun:** `/tmp/bvenv/bin/python tools/blender/ship_render.py -- [keys] [--force]`, then `python3 tools/blender/ship_pack.py`, then `python3 tools/blender/ship_check.py`, then `node tools/test/ships_phaser.mjs`.
