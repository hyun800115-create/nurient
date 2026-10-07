# townfolk2 build report

The townfolk2 fragment is finished. All three test scripts pass:

- **Checker (`tf2_check.py`):** 0 errors, 8 slight tint-clamp warnings.
- **Python/JS parity:** 1200 of 1200 draw lists identical, and all 46,408 frames resolve to the right atlas.
- **Phaser test:** 37 people, 1 draw call per frame, 0 missing frames, no page errors.

The payload is **5.42 MB** (target 7 MB). The game still has to merge this fragment with `assets/townfolk`, using the merge helpers in `tools/townfolk2_compose.js`.

**Paths** (under `frost-village/`)
- Assets: `assets/townfolk2/` holds `manifest.json` (block `townfolk2`) and 9 atlases in the same compact format as `assets/townfolk`:
  - `tf2_head_0` (0.21 MB)
  - `tf2_child_slim_0`, `_1` (0.93 MB)
  - `tf2_adult_slim_0`, `_1`, `_2` (2.18 MB)
  - `tf2_elder_slim_0`, `_1`, `_2` (1.55 MB)
  - Together 19.0 Mpx, about 73 MiB of GPU memory.
- Scripts (new files only): `tools/blender/tf2_anim.py`, `tf2_parts.py`, `tf2_presets.py`, `tf2_render.py`, `tf2_pack.py`, `tf2_check.py`, `tf2_preview.py`.
- Compositors: `tools/townfolk2_compose.py` and `tools/townfolk2_compose.js`. Both import the v4 compositors and leave them unchanged.
- Tests: `tools/test/townfolk2_parity.mjs`, `tools/test/townfolk2_phaser.mjs`.
- Render cache: `/tmp/fv_cache/townfolk2`. Nothing in `assets/townfolk`, `tf_*.py` or `townfolk_compose.*` was edited.

**New anims (for all 6 bases)**

| Anim | Frames, fps | Dirs | What it does |
|---|---|---|---|
| `sad` | 4, 5 | S, SE, E | New head pose `down` (bowed 15°), hands folded in front, faces `sad` / `sad_closed` |
| `clap` | 6, 10 | S, SE, E | Two claps per loop, happy face, hands drawn above the head (both in S, near hand in SE/E) |
| `sit` | 4, 4 | S, SE, E | Seat 0.45 m; the sprite anchor is the **seat front-centre**, same as the villager / life_props / life2 `seatPoints` |
| `push` | 8, 10 | 5 dirs | Both hands on the stroller bar; grip held still while the body bobs (max hand gap 0 m) |

- **Push grip:** I read the life2 stroller script and used its grip height, 0.64 m, for every age (the 0.75 m default was not used). The grip sits 0.25 m in front for adults, 0.24 m for elders, 0.17 m for children.
- **Stroller placement:** put the stroller at `pusher anchor + pushPoint[dir] − stroller.handlePoint[dir]`. For adults this matches life2's `pushOffset` exactly.
- **New face expressions:** `sad`, `sad_closed`, `tear`, plus a `sad` brow, rendered for every head pose. Any sprite can override its face, for example walking to the garden with a sad face.

**New parts**
- `wedding_dress` (adults/elders): gown, puff sleeves and a sash with a back bow. It is a dress, so tights go underneath, and arms are bare.
- `veil` (head part, a new `veil` family): semi-transparent; it never combines with a hat.
- `groom_suit` (adults/elders): suit, white shirt, bow tie and a buttonhole flower.
- `flower_crown` (head accessory, all ages): two tintable bloom colours.
- `mourning_coat` (all ages): long coat with a small white flower pin.
- `black_hat` (full hat, all ages).
- `held_bouquet` (right-hand item, all ages): it has **no frames** in `carry_walk`, `clap` or `push`, so hide it or pick another anim there. It is drawn above the coat, and above the head whenever the right hand is raised.
- **New colour slots:** `gown`, `flower`, `flower2`, `wrap`. Without a colour they draw near-white, which suits the white farewell bouquets.
- **Presets:** `bride`, `groom`, `wedding_guest`, `flower_girl`, `mourner`, `mourner_family`.

**How the game uses it**
1. Load both manifests and call `mergeTownfolkManifests(m1, m2)`.
2. Call `townfolkPreload` / `townfolkInstall` on the merged result.
3. Create `new Townfolk2(merged.townfolk)` and draw people with `TownfolkSprite2`; `setFace('sad')` overrides the face.
4. People come from `tf.preset('bride', rng)` and so on.

The merge rules are in the manifest under `townfolk2.merge`. The main points:
- The fragment never redefines an existing key.
- When an existing (v4) layer gets new frames, `frameAtlasAnim` / `frameAtlasPose` route those frames to the new atlases.
- For sitting people, draw the shadow 25 px below the anchor (`sit.groundOffsetPx`).
- `bases[b].pushPoint` is `[dx, dy, strollerBehind]`: draw the stroller under the pusher when heading NE/N/NW, over the pusher otherwise.

**Previews** (in `docs/previews/`)
- Wedding: `townfolk2_wedding.png` (2x close-up) and `_1x.png`, staged on the life2 wedding layout at the town hall: couple at the arch, seated guests, clapping guests, flower girl.
- Farewell: `townfolk2_farewell.png` (2x) and `_1x.png`: family at the memorial stone with bowed heads, friends with white flowers, grandma on the bench with a sad face.
- GIFs: `townfolk2_push.gif` (with the life2 strollers) and `townfolk2_clap.gif`.
- Sheets: `townfolk2_anims.png`, `townfolk2_parts.png`, `townfolk2_phaser.png`, and `townfolk2_proof.png`. The proof sheet shows full Blender renders next to the layered composites; they match closely.

**Known issues**
- **Two broken frames in the existing townfolk assets.** In `assets/townfolk`, `hat_headband.main/soc_S` and `hat_cap.visor/up_SE` rendered black. I re-rendered all three directions of both and the fragment replaces them (listed under `townfolk2.overrides`). Code that loads only `assets/townfolk` still shows them black; the clean fix is for that folder's owner to re-render those two layers and repack.
- **GPU memory:** about 180 MB for both fragments together, and 20 textures in total, which is more than the 16 a single draw call can bind. Loading townfolk2 only when a life event starts is worth considering.
- **Long skirt in the new anims:** for the new anims, `bot_longskirt` was rendered with slightly thicker under-legs. Otherwise sitting left holes at the lap; its existing frames are untouched.
- **Veil:** in S/SE/E it is drawn behind the body, so only its edges show. Its see-through pixels look a little grainy after palette compression.
- **Bouquet edges:** while walking NE/N, a sliver of bouquet can draw over the coat edge.
- **Children pushing** hold the bar closer (0.17 m), so the pram sits nearer to a child than to an adult. The grip height still matches the stroller.
- **Bodies and colours:** round bodies are still stretched slim renders, as before. The 8 tint warnings are 3–6% darker than listed; 5 of those colours come from the existing palettes.

**Rebuild steps**
1. `tf2_render.py` with modes `head`, `headfix`, `body --pass new` and `body --pass old`, run per base.
2. `python3 tools/blender/tf2_pack.py --colors 56`
3. `python3 tools/blender/tf2_check.py --dump /tmp/fv_review/townfolk2_cases.json`
4. `node tools/test/townfolk2_parity.mjs` and `node tools/test/townfolk2_phaser.mjs`
5. `python3 tools/blender/tf2_preview.py`
