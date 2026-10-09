# beachfolk build report

The beachfolk fragment (CONTRACT_V7 §Y) is finished. All the test scripts pass:

- **Checker (`bf_check.py`):** 0 errors. It reports 42 warnings: 41 slight tint clamps of 3–12 % on pale colours, and the GPU note below.
- **Python/JS parity:** 2180 of 2180 draw lists are identical, and all 25,093 frames resolve to the right atlas. 3797 people made by the JS generator can all play their preset anims, with 0 missing core frames.
- **Phaser 3.90 test:** 42 beach people, 729 sprites, 1 draw call per frame. It checked 186,888 layer frames and found 0 missing frames, 0 people unable to play their anim and no page errors.

The payload is **6.35 MB** (limit 7 MB). The atlases take **82.4 MiB** of GPU memory, a little over the ~75 MiB target; see *GPU memory* below. The game merges this fragment after `assets/townfolk` and `assets/townfolk2` using `mergeBeachfolkManifests()` in `tools/beachfolk_compose.js`.

## Paths (under `frost-village/`)
- **Assets:** `assets/beachfolk/` holds `manifest.json` (block `beachfolk`) and 7 atlases in the same compact `tfatlas` v1 format as townfolk:
  - `bf_head_0`: 2048×1364
  - `bf_child_slim_0`: 2048×1632
  - `bf_adult_slim_0`, `_1`, `_2`
  - `bf_elder_slim_0`, `_1`
  - Together they are 21.6 Mpx.
- **Scripts:** all are new files; no `tf_*` or `tf2_*` file was edited.
  - `tools/blender/bf_anim.py`, `bf_parts.py`, `bf_presets.py`, `bf_render.py`, `bf_pack.py`, `bf_check.py`, `bf_preview.py`.
  - They import `tf_*` and `tf2_*`, and register their parts into the same registry in-process only.
- **Compositors:**
  - `tools/beachfolk_compose.py` is the Python reference.
  - `tools/beachfolk_compose.js` is the JS port, ready to copy into `src/`.
  - Both import the townfolk and townfolk2 compositors and leave them unchanged.
- **Test:** `tools/test/beachfolk_phaser.mjs` runs the parity check (`--parity cases.json`) and the headless Phaser test.
- **Render cache:** `<scratch>/v7_beachfolk/cache`. Nothing in `assets/townfolk*` or `/tmp/fv_cache` was written.

## New anims (all 6 bases; round bases reuse the slim renders, as in townfolk)
| Anim | Frames, fps | Dirs | What it does |
|---|---|---|---|
| `swim` | 8, 10, loop | S SE E NE N | Head-up crawl with the arms windmilling. Only the head, shoulders and arms show above a **baked waterline cut**. |
| `float` | 4, 4, loop | S SE E | Bobbing in a swim ring with the arms resting on it. The ring is drawn automatically (`animParts`). |
| `sunbathe` | 4, 3, loop | SE NE | Lying on the back and breathing. Dir is where the **feet** point; it lies along both iso axes. |
| `dig` | 6, 8, loop | S SE E | Kneeling and building a sandcastle with a toy spade (the spade is drawn automatically). |
| `ball_throw` | 6, 10, once | S SE E | Two-handed underhand toss. `impactFrame` 3 is the release. |
| `ball_catch` | 6, 10, once | S SE E | Ready, catch on `impactFrame` 2, hug the ball, settle. |
| `splash_play` | 6, 10, loop | S SE E | Shin-deep in the sea, sweeping water up. `impactFrame` 2 is the splash. |
| `surf` | 4, 6, loop | SE NE | Riding a surfboard. Dir is where the **board nose** points; the board is drawn automatically. |

SW, W and NW are mirrored, as in townfolk. `BeachfolkSprite.play()` snaps a wanted dir to the nearest one the anim has; for example, sunbathe has only the diagonal dirs.

New head poses:
- `swim`: 5 dirs, cut at the waterline.
- `lie`: SE and NE, with face dirs SE only.

New face expressions are `laugh`, `relax` and `wow`.

### Waterline and anim points (for the game and the water fx)
All four water anims put the **sprite anchor on the water surface**: place it on the sea surface point under the person. Everything below the surface is removed from every layer, and the ink outline is erased along the cut. Manifest block `beachfolk.water`:

| Anim | Where the body sits | FX the game adds |
|---|---|---|
| `swim` | Head centre 0.42 m above the water, about 23 px at 1x | `fx_swim_ripple` centred on the anchor, radius ≈ 0.45 m (29×14 px; × `bodyK` for children) |
| `float` | Ring centre 0.03 m above the water | Ripple with radius ≈ ring radius + 0.1 m |
| `splash_play` | Feet 0.14 m under the water | `fx_splash_small` at anchor + `bases[b].splashPoint[dir]` on `impactFrame`, plus the ripple |
| `surf` | Board deck 0.045 m above the water | `fx_wake_v2` behind the tail |

No anim in the water draws a ground shadow.

Other anims:
- **`sunbathe`:** the anchor sits under the hips on the lying surface, such as a towel decal or a lounger's lying point. In place of the round shadow, draw the ellipse `bases[b].lieShadow[dir]` = `{center, length, width, angleDeg}`; for mirrored dirs, negate dx and the angle.
- **`dig`:** `bases[b].digPoint[dir]` is where the sandcastle stands (the beach `sandcastle_build` stages).
- **Ball anims:** `bases[b].ballPoint[anim][dir][i]` = `[dx, dy, front, radiusPx]`; null means the hands are empty. The ball has a 0.1 m radius.
  - Spawn the flying ball on `ball_throw` frame 3; it arrives on `ball_catch` frame 2.
  - `front` means the ball is drawn over the person.
- **`bodyK`:** the per-base body scale (child 0.70, adult 1.02).

## New parts (36, all tintable through the townfolk tint model)

**Swimwear and beach wear (body):**
- `swimsuit_one`, `swim_trunks`, `rash_guard`, `wetsuit` (child and adult)
- `bare_skin` and `bare_arms`: skin layers under swimwear
- `no_top`
- `flip_flops`; bare feet means no shoes
- `towel_shoulder`, `swim_ring_worn`, `arm_floaties` (kids)
- `aloha_shirt`, `beach_shorts`, `tourist_camera`

**Job outfits (body):**
- Lifeguard: `lifeguard_top` (red tank top with a white cross), `whistle`, `rescue_tube`
- Hotel: `bellhop_jacket` (gold frogging), `hotel_vest` (waistcoat over a shirt; the receptionist), `doorman_coat` (braid and buttons), `housekeeper_dress` (with apron)
- Ice-cream vendor: `vendor_shirt` (striped, with apron)
- Beach bar: `bar_apron` over an aloha shirt
- Anim props: `surfboard` and `toy_spade`

**Head:**
- Hats: `swim_cap`, `swim_cap_flower`, `straw_hat`, `sun_hat_wide`, `sun_visor`
- Glasses and mask: `sunglasses`, `snorkel_mask`
- Job hats: `bellhop_cap` (pillbox), `doorman_hat` (top hat), `paper_cap` (ice-cream), `kerchief` (housekeeper)

**New colour slots:**
- `swim`, `swim2`, `ring`, `ring2`, `float`, `board`, `board2`, `toy`.
- They are rendered near-white, so pale swimwear colours tint without clamping.
- `generate3` always fills them, so the auto-drawn ring, board and spade always have colours.

**Look-dev changes in this pass:**
- Sun hats are now worn pushed back (`straw_hat` −13°, `sun_hat_wide` −18°). A level brim hid the eyes from the 30° game camera; the faces now read under the brim.
- When sunbathing, the two wide-brim hats are **laid over the face**, the "napping in the sun" look. Before, they stood on edge behind the lying head like a big disc.

**Shared layers keep memory in check:**
- `swim` and `float` only carry the upper-body layers that show above the water. Swim trunks under the water have no frames there, by design.
- v4 and v5 head layers are re-rendered only for the new `swim` and `lie` poses.
- The beach parts carry frames only for the anims they need (`parts[p].anims`). For example, the hotel uniforms have no beach anims, and the doorman has no pushing or carrying.

## Presets (`generator.presets`)
| Preset | Notes |
|---|---|
| `swimmer` | Swimsuit or rash guard, trunks, caps, snorkel; floaties and rings as add-ons |
| `sunbather` | Sun hats and sunglasses |
| `family_beach` | `bf.beachFamily(rng)` gives 1–2 adults and 1–3 kids, 75 % of them in matching swimwear colours |
| `lifeguard` | Red and yellow, whistle, visor or cap, rescue tube |
| `bellhop` | |
| `receptionist` | |
| `doorman` | |
| `housekeeper` | |
| `icecream_vendor` | Adults and elders |
| `beach_bar_staff` | Aloha shirt and apron |
| `surfer` | Wetsuit plus board |
| `beach_tourist` | Aloha shirt, sun hat, camera |

The contract calls the last preset "tourist". It is keyed `beach_tourist` because `assets/harbor/townfolk_presets.json` already defines a winter `tourist`, and the two can now load together.

Each preset lists the `anims` it is made for, and every generated person can play all of them; the checker tests 1200 people. Two new preset keys:
- `addOns`: optional extra parts, such as floaties or a ring.
- `anims`

## Merge rules (manifest `beachfolk.merge`; implemented in both compositors)
1. **Merge order:** `townfolk` + `townfolk2` (`mergeTownfolk`), then `beachfolk` (`mergeBeachfolk`). Queue all three atlas lists.
2. **No redefinitions:** the fragment never redefines an existing key in `anims`, `timeline`, `headPoses`, `parts`, `z`, `tintRef`, `palettes`, `frameAtlas` or `presets`. The merge throws if it would.
3. **New frames for existing layers:** `frameAtlasExt` routes them to the new atlases. `frameAtlasAnim[anim]` covers v4 limbs in the new anims; `frameAtlasPose[pose]` covers v4 head layers in `swim` and `lie`.
4. **Faces:** `faceExprs` is a union per head pose. `faceDirsByPose` is new (`lie`: SE only).
5. **Bases:** `bases[b].headOffset` gets the new anims. `parts` is a union. `ballPoint`, `digPoint`, `splashPoint`, `lieShadow` and `bodyK` are new keys.
6. **Generator:**
   - `tintModel.slotS` and `tintTable` are unions.
   - `beachSlots` and `animParts` are new: `float` → `swim_ring_worn`, `surf` → `surfboard`, `dig` → `toy_spade`.
7. **Part anims:**
   - `parts[p].anims` lists the anims a beach part has frames for; a part without it is a v4/v5 part.
   - `canPlay(person, anim)` is true when every body part has frames for the anim.
   - **New: `drop: true` accessories are ignored by `canPlay`.** These are towel, swim ring, flip-flops, camera, rescue tube and arm floaties. They are simply not drawn in anims they have no frames for, so someone with a towel on the shoulder can still swim or dig.
8. **Small extras:** `timeline[...].hd` (optional head-frame dir) and `followDz` (optional sub z offset over a limb).

## How the game uses it
```js
import { mergeBeachfolkManifests, Beachfolk, BeachfolkSprite } from './beachfolk_compose.js';
import { townfolkPreload, townfolkInstall, mulberry32 } from './townfolk_compose.js';
const man = mergeBeachfolkManifests(manTownfolk, manTownfolk2, manBeachfolk);
// preload: townfolkPreload(scene, man, 'assets/');   create: townfolkInstall(scene, man);
const bf = new Beachfolk(man.townfolk);
const p = bf.preset('swimmer', rng);            // or bf.beachFamily(rng) -> [people]
if (bf.canPlay(p, 'swim')) new BeachfolkSprite(scene, bf, p, x, y).play('swim', 'SW');
```
- **Placing people in water:** for the four water anims, set the sprite position to the water-surface point. The Water.js shore line works on a sand beach (surface level with the sand line). At the harbour, use the `waterPx` surface.
- **Ripple:** draw `fx_swim_ripple` one depth below the person.
- **Ball:** `bf.ballPoint(p, anim, dir, i)` gives the ball sprite position.
- **Hotel and shop staff** (bellhop, receptionist, doorman, housekeeper, ice-cream vendor, bar staff) are ordinary dolls. They use the land anims their preset lists, such as `push` for the ice-cream cart or luggage trolley and `carry_walk` for trays and suitcases.

## GPU memory and payload
- **Payload:** 6.35 MB. Bodies use 80 colours with dither 0.35, and the head sheet uses 96 colours with dither 0.3. Beach people show large areas of bare skin, and the townfolk setting of 56 colours with dither 0.5 speckled it once tinted; the finer palette costs +0.45 MB.
- **GPU:** 82.4 MiB (21.6 Mpx) across 7 textures. Earlier in this pass it was 99 MiB. These cuts brought it down:
  - Each job outfit carries only its job's anims.
  - Elder wetsuits were dropped, so surfers are now child and adult only.
  - A small last sheet is merged into the previous one, which removed 2 stub textures.
- **By anim class:**

  | Class | Anims | Share |
  |---|---|---|
  | loco | idle and walk | 25 % (19 MiB) |
  | social | talk, wave, happy, clap, sit, push, carry_walk, sad | 38 % |
  | water | swim, float, surf, splash_play | 12 % |
  | beach | sunbathe, dig, ball anims | 12 % |
  | heads | | 13 % |

  The v4-B residency system, which keeps loco pages resident and loads the social pages on demand, can page this the same way as townfolk.

## Previews (`docs/previews/`)
- **`beachfolk_crowd.png` (+ `_2x`):** 59 random beach people on the beach sand with a strip of sea, using the water fx from `assets/water`. It shows swimmers, floaters, surfers, splashing kids, sunbathers on towels, sandcastle diggers, ball players, tourists and staff.
- **`beachfolk_jobs.png`:** the 12 presets × 3 seeds, each as idle S, walk SE, idle N and a signature anim.
- **`beachfolk_parts.png`:** the wardrobe on several bases.
- **GIFs:**
  - `beachfolk_swim.gif`, `_float.gif`, `_sunbathe.gif`, `_dig.gif`, `_splash.gif` (with `fx_splash_small` on the impact frame), `_surf.gif`
  - `_ball.gif`: a throw and catch between two people, timed on the impact frames.
- **`beachfolk_proof.png`:** full Blender renders next to the layered composites. The mean difference is 19.5/255 over 75 frames, mostly the ink outline that only the composites carry (townfolk measured 14).
- **`beachfolk_phaser.png`:** the headless Phaser scene.

## Known issues
- **GPU memory is 82 MiB**, about 10 % over the ~75 MiB aim; the next cuts would remove content. Together with townfolk and townfolk2 the total is about 260 MiB, so load beachfolk only near the beach, or page it.
- **Missing anims in some outfits:**
  - Lifeguards always wear swim trunks; beach shorts cannot swim.
  - Tourists always wear flip-flops; v4 shoes cannot play the beach anims.
  - Wetsuits have no dig, ball or sunbathe anims, and hotel uniforms have no beach anims. `canPlay` is the guard.
- **Kids in a float ring facing S:** the big head hides most of the ring, so only its colours peek out under the chin.
- **Tint clamps:** 41 pale colours from the beach palettes draw 3–12 % darker than listed. Bodies are slightly brighter in the full renders than in the composites.
- **Dithering:** the face and skin gradients in the `lie` pose still show faint dithering at 3× zoom; it is not visible at 1×.
- **Round bodies** are stretched slim renders, as in townfolk.

## Rebuild
The render steps are resumable: only missing layer PNGs render.
1. `/tmp/bvenv/bin/python tools/blender/bf_render.py -- --mode head --frames all`. The head scene is spread over linked scene copies (`--chunk 24`); without this, setting up 350 view layers takes hours.
2. `/tmp/bvenv/bin/python tools/blender/bf_render.py -- --mode body --bases <base> --set new|old`, run for child_slim, adult_slim and elder_slim.
3. `python3 tools/blender/bf_pack.py`
4. `python3 tools/blender/bf_check.py --dump <scratch>/cases.json`
5. `node tools/test/beachfolk_phaser.mjs --parity <scratch>/cases.json`
6. `python3 tools/blender/bf_preview.py all`
