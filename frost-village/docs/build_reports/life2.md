# life2 build report

Everything in §P is built and packed into `assets/life2/`, and `life2_check` reports 0 errors and 0 warnings. The payload is 0.94 MB against the 2.5 MB budget, and a headless Phaser 3.90 load test passed: all 6 atlases load, 144 frames checked, none missing, 21 anims play. I added no git commits and edited no existing scripts or assets.

## Keys (sprites{} in `assets/life2/manifest.json`)
- **Wedding** (atlas `life2_wedding`):
  - `wedding_arch` (span along X) and `wedding_arch_y` (span along Y).
  - `wedding_carpet` and `wedding_carpet_x`: kind `decal`, draw on the ground layer.
  - `wedding_chairs` (sitters face SW) and `wedding_chairs_x` (sitters face SE).
  - `wedding_cake_table`, `flower_stand`.
  - `ribbon_garland`: kind `overlay`, with `attachTo: "town_hall"`, offset [0,0], depth = town_hall depth + 1.
- **Memorial** (atlas `life2_memorial`): `memorial_garden`, `memorial_stone`, `flower_wreath`.
- **Decor** (atlas `life2_decor`):
  - `cradle`: anim `rock`, 4 frames at 4 fps.
  - `cradle_empty`: same frame size and anchor as `cradle`, so you can swap it in place.
  - `school_desk_row` plus its overlay `school_desk_row_front`.
- **Items** (atlas `life2_items`, 72×72, anchor (36,54)): `item_bouquet`, `item_cake`, `item_gift_box`, `item_letter`. Each has stackStep 9 / 12 / 13 / 8, `carryScale` and `icon`.
- **Strollers** (characters{}, kind `stroller`, atlases `l2_baby_stroller` and `l2_baby_stroller_pink`): 128×128, anchor [0.5,0.8125]. Frame names are `{anim}_{dir}_{i}` for `idle` (4 frames, 6 fps) and `move` (8 frames, 12 fps) in S/SE/E/NE/N; SW/W/NW are flipX mirrors. No baked shadow; draw an ellipse of `shadow` [50,20].

## Fields and how the game uses them
All points are px offsets from the sprite anchor.

- **Sitting:** `seatPoints` are the seat-surface front centre, 0.45 m up (the villager `sit` anchor convention). `seatGroundPoints` give the ground point under each seat, in case a sit anim is anchored at the floor. `seatDirs` are SW/SE/S, all directions that have sit frames.
  - `seatDepth: "front"`: draw the sitter at prop depth + 1 (+ dy·0.001).
  - The desk row uses `"between"`: desk row (d), then kids (d + 0.5), then `school_desk_row_front` (d + 1).
- **Arch:** `couplePoints` are bride and groom under the arch facing each other (E/W, so their faces show in profile). `officiantPoint` is the chief behind them facing S. `fxPoints.heart` is for hearts or petals after the vows.
- **Carpet:** `aislePoints` are the walk start (hall end) and end (arch end). **Cake table:** `servePoints` are where the couple stands behind the table, facing S.
- **Garden:**
  - `stonePoints` (6) with `stoneDirs` S. Draw stones, mourners and walkers above the garden; every tall part of the garden is behind the stone spots.
  - `seatPoints` (the bench), `gatherPoints` (facing N), `doorPoint`, `pathPoints`.
  - `fxPoints.lantern` and `fxPoints.tree`.
- **Stone:**
  - `mournerPoints`: one family member on each side, facing E/W, where sad frames exist.
  - `layPoint`: faces N; after the visit, drop an `item_bouquet` at the stone base.
  - `wreathPoint`: just behind the stone.
  - `plaquePoint`: a blank plaque if you want to write a name.
- **Stroller:**
  - **Preferred alignment:** stroller anchor = pusher anchor + townfolk2 `pushPoint[dir]` − `handlePoint[dir]`, negating both dx for mirrored dirs. The townfolk2 agent already built `push` around my grip height of 0.64 m.
  - **Fallback:** `pushOffset[dir]`, which assumes the adult grip is 0.25 m in front of the pusher.
  - `depthVsPusher`: draw the stroller over the pusher for S/SE/E/SW/W and under for NE/N/NW.
  - `babyPoint` is the baby's face, for emote bubbles.
- **`layouts.wedding_town_hall`** places every prop in px and metres from the town_hall anchor, plus `standPoints`/`standDirs` for standing guests. **`layouts.farewell_garden`** gives the farewell order and stone order.

## Rebuild
```
/tmp/bvenv/bin/python tools/blender/life2_render.py -- [keys|wedding|memorial|decor|items|stroller] [--force]
python3 tools/blender/life2_pack.py      # merges into the manifest; refuses (exit 1, nothing written) if a key would vanish
python3 tools/blender/life2_check.py
node tools/test/life2_phaser.mjs
```
- The render cache is `/tmp/fv_cache/life2`. A full render took about 18 min on the heavily shared CPU.
- I tested the packer's guard with an empty cache, a partial cache and a missing folder; all asset hashes were unchanged.

## Known issues
- **Seating direction:** sit frames only exist facing S/SE/E (and their mirrors), so guests face the arch (SW) with the arch at the far end of the carpet. The couple therefore faces each other in profile rather than facing the guests.
- **Crowded chairs:** chairs are 0.75 m apart, but chibi heads are about 0.6 m wide, so a completely full row still overlaps slightly.
- **Garland is tied to the hall:** `ribbon_garland` was rendered against the real town_hall geometry. If town_hall is ever re-rendered, re-render the garland. I removed a faint full-facade shadow veil at pack time; only shadows close to the swags remain.
- **Wedding preview couple:** the bride and groom are plain townsfolk stand-ins, because `assets/townfolk2` wasn't packed yet.
- **Not palettised:** atlases are kept as RGBA, since the payload is well under the 90%-of-budget threshold.
- **Slow helper (FYI for other agents):** `prop_lib.MB` gets quadratically slower as a mesh grows. It took about 270 s to build the arch's flowers on this machine, so `life2_lib.MB` is a linear replacement.
- **Shared scratch folder (FYI):** the scratchpad is shared; another agent overwrote my scratch `look.py`. My scratch files now live under `scratchpad/life2w/`.

## Files
- **Scripts:** `/home/user/nurient/frost-village/tools/blender/life2_lib.py`, `life2_assets.py`, `life2_stroller.py`, `life2_render.py`, `life2_pack.py`, `life2_check.py`, and `/home/user/nurient/frost-village/tools/test/life2_phaser.mjs`
- **Assets:** `/home/user/nurient/frost-village/assets/life2/` (manifest.json + 6 atlases)
- **Previews:** in `/home/user/nurient/frost-village/docs/previews/`:
  - `life2_all.png`
  - `life2_wedding.png` (at 2x)
  - `life2_memorial.png` (at 2x)
  - `life2_anims.gif`
  - `life2_phaser.png`
