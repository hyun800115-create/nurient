# harbor build report

The harbour set for CONTRACT_V6 §T is finished. `assets/harbor/` holds 43 sprites in 5 atlases plus the townsfolk presets file, with a payload of 1.44 MB (limit 6 MB). `harbor_check.py` reports 0 errors and 0 warnings. A headless Phaser 3.90 load found all 87 frames and played all 7 anims. Re-packing produces byte-identical files.

## Keys
- **Landmarks:**
  - `lighthouse`: red-white tower with a little keeper's cottage. `anims.work` / `anims.light` is 8 frames at 8 fps: the lit lens turns and two beams sweep (22.5° per frame); the idle frame is daytime, lamp off.
  - `harbor_crane`: yellow portal crane. `anims.work` / `anims.lift` is 8 frames at 4 fps: it picks a crate from the ship (frame 0), lifts it, swings 90° to the quay, sets it down (frame 5) and swings back empty. `hookPoints` gives the hook position for each frame.
- **Buildings:** `ferry_terminal`, `customs_house`, `fish_auction`, `shipyard`, `harbor_market`, `seafood_restaurant`, `sailor_lodge`, `harbor_warehouse`, `harbor_office`.
  - `shipyard` has a 4-frame `anims.work`: welding sparks, flash, forge glow, swinging plank and smoke. It has no hammer motion; the sparks and flash stand in for it.
- **Props:** `bollard`, `harbor_lamp`, `anchor_decor`, `net_rack`, `crate_stack`, `barrel_stack`, `buoy`.
  - Containers come as `container_stack` and `container_stack_b` (mixed colours) plus single `container_red`, `container_blue`, `container_green`, `container_yellow`.
  - `buoy` has a 4-frame bob (`anims.work` / `anims.bob`).
- **Water-edge tiles:**
  - Piers: `pier_x`, `pier_y`, the sea ends `pier_end_xp`, `pier_end_xn`, `pier_end_yp`, `pier_end_yn`, and the land ends `pier_root_xp`, `pier_root_xn`, `pier_root_yp`, `pier_root_yn`.
  - Breakwater: `breakwater_x`, `breakwater_y`, `breakwater_end_xp`, `breakwater_end_yn`.
  - Quay wall: `quay_x`, `quay_y`, `quay_corner`. These are extra, beyond the contract: they draw the drop where the land meets the sea.
  - The contract names `pier_end` and `breakwater` are alias entries pointing at `pier_end_yn` and `breakwater_x` (`aliasOf` is set).

## Fields
All points are pixel offsets from the anchor, as in the town set.
- **Every sprite:** `anchor`, `frameSize`, `footprint`, `footprintM`, `footprintPoly`, `topPx`, `fxPoints`, `name`, `zone`.
- **Characters' spots:** `doorPoint` / `doorDir`, `staffPoints` / `staffDirs` with `staffDepth`, `customerPoints`, `seatPoints`, `workPoints`, `inPoint` / `outPoint`.
- **Ferry terminal:**
  - `waitPoints` is the queue lane; the first point is at the gate.
  - `boardPoints` run gate → gangway → tip.
  - `gangwayPoint` is the gangway tip at deck level.
  - `berthPoint` is that tip on the water, with `berthAxis` x and `berthSide` -Y.
- **Fish auction:** `staffPoints[0]` is the auctioneer at the bell lectern; `buyerPoints` is the same list as `customerPoints`.
- **Crane:** `pickPoint`, `dropPoint`, `hookPoint`, `pickFrame` 0, `dropFrame` 5, `cargoHangPx` 62, `jibReachM`.
- **Waterfront buildings** (`ferry_terminal`, `fish_auction`, `shipyard`, `harbor_crane`): `quayEdge` gives two points on the quay edge line.
- **Tiles:** `tileAxis`, `stepPx` (64, 32) along X or (64, -32) along Y, `segM` √2, `cuts`, `rampM`, `openEnds`, `tileLayer: ground`. Pier tiles also have `moorPoints` (one per side, already on the water) and the sea ends have `ladderPoint`.

## How the game should use them
1. **Load:** add `'harbor'` to `FRAGMENTS` in `src/core/Assets.js`, and to `LAZY_FRAGMENTS` if it should load after the title. The anims register automatically as `spr:<key>:work` / `light` / `lift` / `bob`.
2. **Levels:** z 0 is the land, quay and pier deck, so characters walk onto piers with no lift. The sea surface sits 0.55 m lower, which is `waterPx` 30 screen px. Every `berthPoint` and `moorPoints` value is already on the water plane: put a ship's anchor (its waterline) exactly there. The buoy's anchor is its own waterline.
3. **Tiles:**
   - Draw all tiles on the ground layer, chained at `stepPx`; the joins are seamless, shadows included.
   - A `pier_root_*` end line goes on the quay edge.
   - From the `quay_corner` anchor, chain `quay_x` toward -X at (-64, -32) px × n and `quay_y` toward +Y at (64, -32) px × n.
   - Ships moored on the far (+Y) side of a pier should be drawn below the pier layer.
4. **Crane:** at `dropFrame` spawn or grow a `crate_stack` at `dropPoint`; at `pickFrame` hide one of the ship's cargo crates.
5. **Market:** its `staffDepth` is `behind`, so normal y-sorting lets the counter hide the sellers' legs.
6. **Orientation:** the waterfront buildings face the sea on their -Y side (screen down-left), with the front footprint edge on the quay. Sprites can't be flipped because the shadows are baked, so a coast facing another way would need its own variants.

## Townsfolk presets
`assets/harbor/townfolk_presets.json` defines `dock_worker`, `sailor`, `auctioneer`, `lighthouse_keeper` and `tourist`, built only from existing townfolk parts.
- **Merge:** `Object.assign(man.townfolk.generator.presets, presets)`, then call `tf.preset('dock_worker', rng)` as usual.
- **Checked:** 1,000 people generated across the presets with no errors or part conflicts.
- **Not added — recommended parts:** a sailor cap and a striped breton shirt (high priority); a life vest, a captain cap and a tourist camera (medium); a sou'wester, held bell or clipboard, and a sea bag (low). Tourists currently get backpacks but no camera.
- **Existing characters:** `npc_captain` (in assets/villagers2) and the fisherman variants can serve as captains and crews.

## Scripts and how to rebuild
New scripts in `tools/blender/`: `harbor_lib.py`, `harbor_assets.py`, `harbor_water.py`, `harbor_bld.py`, `harbor_props.py`, `harbor_render.py`, `harbor_pack.py`, `harbor_check.py`. They only import the existing helpers; no existing script was edited. I also added `tools/test/harbor_phaser.mjs`.

```
/tmp/bvenv/bin/python tools/blender/harbor_render.py -- [keys|group] [--force]
python3 tools/blender/harbor_pack.py
python3 tools/blender/harbor_check.py
node tools/test/harbor_phaser.mjs
```
- The render cache is `/tmp/fv_cache/harbor`; a full render took about 2 h on the shared CPU, and reruns skip finished frames.
- The packer merges into the existing manifest. If a key would go missing it stops with exit 1 and writes nothing; I tested this with a missing, an empty and a partial cache, and `assets/harbor` was unchanged each time.

## Previews (`docs/previews/`)
- `harbor_all.png`: every sprite, idle plus one anim frame.
- `harbor_scene.png`: the harbour block — quay along both edges, piers along both axes, the crane at work, containers, terminal with a queue, auction hall, lighthouse, breakwater, buoys, existing fishing boats, and townsfolk using the new presets.
- `harbor_tiles.png`: chained tiles for checking the joins.
- `harbor_townfolk.png`: the five presets, 8 people each.
- `harbor_phaser.png`: screenshot from the Phaser load test.
- `harbor_lighthouse.gif`, `harbor_crane.gif`, `harbor_shipyard.gif`, `harbor_buoy.gif`.

## Known issues
- **Ships not in the scene:** `assets/ships` didn't exist yet, so the scene uses the existing boats from `assets/buildings`. Re-running `harbor_pack.py` will draw `ferry` and `cargo_ship` at their berths once that fragment appears.
- **Small seam at the quay edge:** next to a building that reaches over the water, its baked shadow changes slightly at the edge line. The quay tiles cover this line.
- **Fish auction depth:** the back row of fish boxes is partly hidden by the roof, and characters stand only in the front half of the hall.
- **Busy scene:** buildings overlap a lot in the mock-up, so some name tags sit over neighbouring buildings. It is a static composite, not an in-game check.
- **Another agent's scratch folder:** an early test pack of mine wrote into the shared `scratchpad/packtest/out` folder, which belongs to another agent and had not been touched since 15:16. I removed my files and rebuilt its `manifest.json` from `assets/characters/manifest.json` (same keys and atlases as before). Its owner should re-pack if they still need that folder.
