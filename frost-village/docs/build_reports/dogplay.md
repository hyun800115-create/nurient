Done. The new `assets/pets2/` folder is built and checked: `pet2_check.py` reports 0 errors and 0 warnings, the folder is 0.420 MB against the 1.5 MB budget, and a headless Phaser 3.90 test loaded all 266 frames and built 41 anims with no missing frames and no page errors.

**Dog (`characters.pet_dog`, atlas `pets2_pet_dog`, 2048×392, 266 frames)**
- **Same look as batch 1.** It is built with the batch-1 builder `vil_pets.build('pet_dog')` (shiba with red scarf) and the old anims use the batch-1 poses from `vil_anim`. Compared with the batch-1 atlas, the average pixel difference per frame is about 0.2 (on a 0–255 scale), which is render noise only.
- **Batch-1 anims, unchanged settings:**
  - idle 4f/6fps loop (5 dirs)
  - walk 8f/12fps loop (5 dirs)
  - run 8f/16fps loop (5 dirs)
  - sit 4f/4fps loop (S/SE/E)
  - happy 6f/10fps loop (S/SE/E)
- **New anims:**
  - **eat** 6f/8fps loop (S/SE/E): sits and crunches a bone biscuit held across its jaws, with ^^ eyes and crumbs.
  - **roll** 6f/8fps loop (S/SE/E): on its back with the belly up, paws paddling, head tilted toward the camera, tongue out.
  - **beg** 6f/8fps loop (S/SE/E): sits up on its haunches with front paws curled and paddling.
  - **run_ball** 8f/16fps loop (5 dirs): the batch-1 run with the red ball in its mouth.
  - **catch** 6f/12fps once (S/SE/E): crouch, leap, snaps the ball on `impactFrame` 3, lands holding it.
  - **trick** 8f/12fps once (S/SE/E): play-bow, a full hop-spin, lands with a raised paw.
- **Extra fields.** All points are pixel offsets from the anchor; negate dx for mirrored dirs.
  - `anims.catch.impactPoint`: where the ball is caught, for S/SE/E.
  - `mouthPoint`: the mouth, for all 5 dirs.
  - `treatPoint`: the biscuit in `eat`, for S/SE/E.
  - `bellyPoint`: where the petting hand goes in `roll`, for S/SE/E.
  - Also: `headTop` -39, `headTopBeg` -55, `headTopRoll` -30, `shadow` [54,23], `animNotes` (how the game should use each anim), `overrides`, `portrait`.

**Items (atlas `pets2_items`, 72×72, anchor [0.5,0.75])**
- `item_treat`: bone biscuit, stackStep 8, carryScale 0.65.
- `item_ball`: red ball with a white band, stackStep 13 (nominal, since balls don't stack), carryScale 0.65.

They were rendered through the existing `bld_assets`/`bld_render` item code. They match the biscuit and ball the dog holds.

**UI icons (atlas `pets2_icons`, 96×96, anchor [0.5,0.5])**
- `ui_icon_whistle`, `ui_icon_treat`, `ui_icon_play`, `ui_icon_pet`, `ui_icon_heart_full`, `ui_icon_heart_empty`.
- The two hearts have the identical shape and position, so a partial heart can be drawn by cropping the full heart over the empty one.

**Known issues**
- **Game wiring (code agent):** add `pets2` to `FRAGMENTS` after `villagers` so its `pet_dog` entry and `portrait_pet_dog` image take over. The old `vil_pet_dog` atlas (140 KB) is then unused and can be skipped.
- **roll in S** is turned toward the camera: the dog lies diagonally with its head at the lower left. In SE and E the belly is tipped toward the camera.
- **beg and the catch rising frames in S** look like a tall upright dog; that's unavoidable from the front. For catch, keep the ground shadow at the anchor so the jump reads.
- **eat** loops without the biscuit getting smaller; the game decides how long to play it.
- **Crumbs** in eat are only 1–2 px. In run_ball N the ball is hidden behind the head, which is correct for that view.
- **Import risk:** these modules import `vil_dress`, which imports `char_build` (currently being edited by the workers agent). The dog uses no `char_build` geometry, but a broken `char_build` would stop the import.

**To regenerate, from `frost-village/`:**
1. `/tmp/bvenv/bin/python tools/blender/pet2_render.py -- --portrait --items` (about 2 minutes; frames are cached in `/tmp/fv_cache/pets2`)
2. `python3 tools/fx/gen_pets2_ui.py`
3. `python3 tools/blender/pet2_pack.py`
4. `python3 tools/blender/pet2_check.py`

Running steps 2–3 again produces byte-identical files.

I only touched the files below and ran no git commands that change state. The modified `char_*.py` and `src/**` files in git status belong to other agents.

Files are in `/home/user/nurient/frost-village/`:
- `assets/pets2/`
  - manifest.json
  - pets2_pet_dog.png / .json
  - pets2_items.png / .json
  - pets2_icons.png / .json
  - portrait_pet_dog.png
- `tools/blender/`
  - pet2_props.py
  - pet2_anim.py
  - pet2_build.py
  - pet2_items.py
  - pet2_render.py
  - pet2_pack.py
  - pet2_check.py
- `tools/fx/gen_pets2_ui.py`
- `docs/previews/`
  - pets2_sheet.png
  - pets2_before_after.png
  - pets2_scene.png
  - pets2_icons.png
  - pets2_phaser_smoke.png
  - pets2_pet_dog_eat.gif
  - pets2_pet_dog_roll.gif
  - pets2_pet_dog_beg.gif
  - pets2_pet_dog_run_ball.gif
  - pets2_pet_dog_catch.gif
  - pets2_pet_dog_trick.gif