The neighbour town "솔방울 마을" is finished. All 40 town sprites and the 3 train cars are packed in `assets/town/` with their own manifest. `town_check.py` reports 0 errors and 0 warnings, and the payload is 2.14 MB against the 8 MB limit. A Phaser 3.90 load test also passed: all 9 atlases load, nothing is missing, and the 36 animations and all 8 train headings (mirrored ones included) play.

I look-devved the school, cafe and train first and refined them before doing the rest:
- **Shop signs:** each shop has a big emblem on its roof and a hanging corner sign that faces the camera.
- **Station:** the platform is part of the station sprite; the track is laid separately from rail tiles.

## Keys
All of these are in `sprites{}` in `assets/town/manifest.json`. Each entry also has a Korean/English `name` and a `zone`.
- **Civic** (`town_civic`): `school`, `town_hall`, `post_office`, `clinic`, `police_box`, `fire_station`, `train_station`.
- **Shops** (`town_shops`): `cafe` (coffee cup), `clothing_store` (T-shirt), `hair_salon` (scissors + barber pole), `flower_shop` (flower), `bookstore` (open book), `toy_shop` (teddy bear), `restaurant` (plate, fork, knife), `supermarket` (basket), `hardware_store` (hammer), `carpenter_workshop` (saw).
- **Homes** (`town_homes`): `apartment_a` (4 storeys), `apartment_b` (3 storeys), `townhouse_a`, `townhouse_b`, `townhouse_c`, `townhouse_d`.
- **Park** (`town_park`): `park_fountain`, `playground`.
- **Street** (`town_street`): `streetlight`, `streetlight_double`, `bench_x`, `bench_y`, `sled_stop`, `town_gate`, `town_gate_x`. Both gates have a blank sign board; `fxPoints.boardCentre` is where the game writes the name.
- **Rails** (`town_rails`, ground layer): `rail_x`, `rail_y`, `rail_x_crossing`, `rail_y_crossing`, and the buffer-stop ends `rail_x_end_p`, `rail_x_end_n`, `rail_y_end_p`, `rail_y_end_n`.
- **Train** (`characters{}`, kind `train`, one atlas each): `train_engine`, `train_car_a` (passenger coach), `train_car_b` (goods wagon). `trainConsist` gives the order and spacing (2.34 m and 2.24 m).

## Fields
All points are pixel offsets from the anchor, which is the footprint centre.
- **Every sprite:** `anchor`, `frameSize`, `footprint`, `footprintM`, `footprintPoly` (4 ground corners, for depth and collision tests), `topPx`, `front`, `fxPoints` (smoke, steam, bell, clock, siren, sign, light).
- **Interaction points:** `doorPoint` (+`doorDir`), `customerPoints`, `staffPoints` (+`staffDepth: "front"`), `inPoint` (delivery pad for goods bought from the village), `gatherPoints`, `seatPoints`, `playPoints`, `waitPoints`, `boardPoints`, each with a matching `*Dirs` list. All standing points are in front of the building, so draw characters there above the building sprite.
- **Animations:** `school` (bell `ring`), `hair_salon` (pole `spin`) and `park_fountain` (`water`) each have a 4-frame loop under both `anims.work` and the named alias.
- **Station:** `trackPoint` and `trackAxis: "x"`; `trainStops` gives the engine, car A and car B anchors when the train stands at the platform heading SE. `platformPoly` and `platformLiftPx` (18) cover people walking on the raised platform.
- **Rails:** each tile is √2 m long, so tiles sit exactly (64, 32) px apart along X and (64, −32) px along Y. The rail tiles also carry `tileAxis`, `stepPx`, `openEnds`, `railTopM` and `gaugeM`. They join without visible seams, shadow included.
- **Train cars:** 5 directions mirrored like the characters, `idle` (4 frames for the engine, 1 for cars) and `move` (8 frames). One move loop is about 1.7 m of track, so move the train about 166 px/s at 12 fps.
  - They also carry `couplerM`, `lengthM`, `headTop`, and per-direction `smokePoint`, `lampPoint`, `boardPoint` and `cargoPoint` (wagon).
  - The baked shadows are separate frames for all 8 headings, not mirrored, because the light doesn't flip.
- **Train directions:** rails run along the iso axes, so on straight track the train only uses SE and NE plus their mirrors. S, E and N are there for turning.

## How to use
1. Add `town` to `FRAGMENTS` in `src/core/Assets.js`; sprite animations then register automatically as `spr:<key>:<anim>`.
2. Rebuild:
   ```
   /tmp/bvenv/bin/python tools/blender/town_render.py -- [keys|group] [--force]
   python3 tools/blender/town_pack.py
   python3 tools/blender/town_check.py
   ```
   - The render cache is `/tmp/fv_cache/town`, and a full render took about 1 hour on the shared CPU.
   - The packer merges into the existing manifest. It refuses to run (exit 1, nothing written) if anything would go missing; I tested this, and the asset file hashes were unchanged.

The new scripts in `tools/blender/` are `town_lib.py`, `town_assets.py`, `town_rails.py`, `town_train.py`, `town_render.py`, `town_pack.py` and `town_check.py`. The buildings are rendered by the unchanged `bld_render.render_build()`, so the camera, light, scale and shadows match the village. No existing script was edited.

## Known issues
- **Scratchpad mix-up:** a test run of my packer wrote into another agent's scratch folder (`scratchpad/packtest/out`) and replaced its `manifest.json`. I removed my files and rebuilt that manifest as closely as I could from `assets/characters/manifest.json`; that agent should re-run its own packing. I had also briefly moved their `packtest/prev` folder and have put it back.
- **Train driver:** he is built from `char_build`, which the workers agent has been editing, so a full re-render could change him slightly.
- **No curved rails:** only straight pieces, crossings and buffer-stop ends.
- **Wagon cargo:** `cargoPoint` always sets `behind` to false, so stacks are drawn on top of the wagon's low side walls.
- **Hardware sign:** the wrench is faint on the cream disc, so the sign reads mainly as a hammer.
- **Shops are closed boxes:** shopkeepers stand outside, and customers "enter" at `doorPoint`.
- **No library:** the design doc mentions one but CONTRACT_V4 §K doesn't list it, so I didn't make one.
- **Scene preview is a mock-up:** `town_scene.png` is a static composite, not an in-game check.

Files are in `/home/user/nurient/frost-village`:
- `assets/town/manifest.json` (+ 9 atlases)
- `docs/previews/town_all.png` (labelled sheet of every asset)
- `docs/previews/town_scene.png` (mock town block with villagers and roads)
- `docs/previews/town_anims.gif`
- `docs/previews/town_train.gif`