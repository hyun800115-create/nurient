# cityfolk build report

The cityfolk fragment (CONTRACT_V8 §AD) is finished. All the test scripts pass:

- **Checker (`cf_check.py`):** 0 errors. It reports 5 warnings, all about the reporter's notepad: it is held in the far hand, so the body hides it in some E and NE frames of idle, walk and talk.
- **Python/JS parity:** 1200 of 1200 draw lists are identical, with 0 `pickAnim` / `canPlay` mismatches and 0 nozzle / box / sweep point mismatches. The generic merge of townfolk + townfolk2 gives exactly `townfolk2_compose.mergeTownfolk`. The test merged all four fragments: townfolk, townfolk2, beachfolk and cityfolk.
- **JS generator (`--jsgen`):** 1690 people made by the JS `Cityfolk.preset()` keep every promise of their preset (outfit and anims). The test checked 4,569,176 layer frames and found 0 missing head, face or brow frames. For 2000 random townsfolk, every anim `pickAnim()` returns is playable.
- **Phaser 3.90 test:** 45 people, 785 sprites, 35 textures (townfolk, townfolk2, beachfolk and cityfolk loaded together) on 16 texture units, **4 draw calls per frame**. It checked 205,948 layer frames and found 0 missing frames and no page errors.
- **beachfolk compatibility:** the beachfolk critic's cross-check compares `Beachfolk` with `Cityfolk` on beach people. Over 13,500 checks there are 0 `canPlay` mismatches and 0 draw-list mismatches; see merge rule 7.

The payload is **6.84 MB** (limit 7 MB). The atlases take **85.1 MiB** of GPU memory, over the ~75 MiB aim; see *GPU memory*. The game merges this fragment after `assets/townfolk` and `assets/townfolk2`, with beachfolk in between or not loaded, using `mergeTownfolkFragments()` in `tools/cityfolk_compose.js`.

## Paths (under `frost-village/`)
- **Assets:** `assets/cityfolk/` holds `manifest.json` (block `cityfolk`) and 8 atlases in the same compact `tfatlas` v1 format as townfolk. Together they are 22.30 Mpx and hold 24,991 frames, plus 7,775 aliases that share an image:
  - `cf_head_0`: 2048×388
  - `cf_child_slim_0`: 2048×1684
  - `cf_adult_slim_0` to `_3`: 1492, 1464, 1456 and 1696 px tall
  - `cf_elder_slim_0`: 1404 px tall, `_1`: 1304 px tall
- **Scripts:** all are new files; no `tf_*`, `tf2_*` or `bf_*` file was edited.
  - `tools/blender/cf_anim.py`, `cf_parts.py`, `cf_presets.py`, `cf_render.py`, `cf_pack.py`, `cf_check.py`, `cf_preview.py`.
  - They import `tf_*` and `tf2_*`, and register their parts into the same registry in-process only.
- **Compositors:**
  - `tools/cityfolk_compose.py` is the Python reference.
  - `tools/cityfolk_compose.js` is the JS port, ready to copy into `src/` next to `townfolk_compose.js` and `townfolk2_compose.js`. It imports both and leaves them unchanged.
- **Test:** `tools/test/cityfolk_phaser.mjs` has three modes: the Phaser scene (no flag), `--parity cases.json` and `--jsgen`.
- **Render cache:** `/tmp/fv_cache/cityfolk` (about 160 MB). The townfolk caches were not touched.

## New anims (all 6 bases; round bases reuse the slim renders, as in townfolk)
| Anim | Frames, fps | Dirs | What it does |
|---|---|---|---|
| `run` | 8, 14, loop | S SE E NE N | Real run with pumping arms and a forward lean: police chases, rushing to a fire, kids playing. |
| `flee` | 8, 14, loop | S SE E NE N | Comic panic with both arms up and the `panic` face. The burglar hugs the loot sack over his shoulder instead. |
| `arrested_walk` | 8, 9, loop | S SE E NE N | Hands behind the back, head down, `sheepish` face, short shuffling steps. |
| `carry_box` | 8, 10, loop | S SE E NE N | Hugs a big cardboard box in front (`held_box` is drawn automatically). Gives `boxPoint`. |
| `argue` | 6, 8, loop | S SE E | Wagging finger (`hand_point`), a stomp, `angry` face. |
| `fight` | 6, 12, loop | S SE E | Comic windmill flail with little hops, `angry` face, made for use inside `fx_fight_cloud_back` / `_front`. |
| `point` | 6, 8, loop | S SE E | Raise, point, jab, with the pointing finger. |
| `think` | 4, 3, loop | S SE E | Taps the chin, head tilting up, `thinking` face. |
| `shocked` | 4, 8, loop | S SE E | A jolt, then mittens on the cheeks, `shocked` face. |
| `phone` | 4, 5, loop | S SE E | Phone at the ear (`held_phone`) while the free hand gestures. |
| `sweep` | 6, 8, loop | S SE E | Broom swung in a ping-pong across the front (`held_broom`). Gives `sweepPoint`. |
| `spray_hose` | 4, 10, loop | S SE E NE | Braced stance, nozzle in both mittens with a small recoil, the hose lying on the snow behind. `determined` face. Gives `nozzlePoint`. |

SW, W and NW are mirrored, as in townfolk. `CityfolkSprite.play()` falls back automatically (rule 7) and snaps to the anim's dirs like `TownfolkSprite2`.

New face expressions work on every head pose and every face set (std, bold, lash, kid, kidlash, elder): `shocked`, `panic`, `angry`, `shout`, `thinking`, `determined` and `sheepish`. There is also a new brow shape, `angry`.

### Anim points (manifest `bases[b]`; mirrored dirs negate x and the x direction)
- **`nozzlePoint.spray_hose[dir][i]`** = `[x, y, ux, uy]`: the nozzle tip in px from the anchor, plus the unit screen direction of the water. Start `fx_hose_rope` / `fx_hose_stream` there (fx_city `hoseAim`).
- **`boxPoint.carry_box[dir][i]`** = `[cx, cy, bx, by]`: the box centre and its bottom-centre. To carry a real logistics item instead of the default box, call `setItems(false)` and draw the item at the bottom-centre:
  - depth = person depth + 0.0045 in S, SE and E, where the box is in front of the body;
  - depth = person depth − 0.0001 in NE and N, where it is behind.
- **`sweepPoint.sweep[dir][i]`** = `[x, y]`: where the bristles touch the snow. Puff snow or `fx_demolish_dust` there.

## New parts (24 wearables + 5 anim items, all tinted through the townfolk tint model)
The existing parts are reused, as the contract asks: `hat_police`, `det_police`, `hat_hardhat`, `det_hivis`, plus `hat_fedora`, `hat_beanie`, `hat_cap`, `hat_flatcap`, `hat_beret`, the trousers, shoes, sweaters and coats.
- **Fire:**
  - `top_fire_coat`: turnout coat with lime and silver reflective bands, cuffs and a collar flap.
  - `bot_fire_pants`: matching trousers.
  - `acc_air_tank`: breathing tank on harness straps.
  - `hat_fire_helmet`: domed helmet with a comb ridge, a long back brim, a leather front shield with a brass rim, and a lime reflective band.
- **Police:** `top_police_v2`, a winter police jacket with a hi-vis vest, patch, radio and pockets.
- **Petty thief:**
  - `top_stripes`: the striped shirt.
  - `acc_eye_mask`: a comic domino mask.
  - `hat_burglar_beanie`: docker beanie.
  - `held_loot_sack`: drawn only in the anims where his hands are free.
- **Bank:**
  - `top_suit_3pc`: three-piece suit with a pocket square, its own necktie and a watch chain.
  - `top_teller_vest`: waistcoat over a shirt, with a bow tie and sleeve garters.
  - `acc_visor`: green eyeshade.
- **Logistics and moving:**
  - `top_work_jacket`, `acc_gloves`.
  - `hat_delivery_cap`, `top_delivery_polo`.
  - `bot_mover_overalls`, `acc_back_brace`.
- **Building sites:** `top_hivis_jacket`, `acc_toolbelt`.
- **Press and detective:** `acc_camera`, `held_notepad`, `top_trench`, `hat_deerstalker`.
- **Anim items** (`animItems`, added automatically for their anim only; `noItems` skips them): `held_box` (carry_box), `held_hose` (spray_hose), `held_broom` (sweep), `held_phone` (phone), and `hand_point` (point and argue).

`det_tie` stays a children's part, because assets/townfolk packs it for children only. That is why the suit and the teller waistcoat carry their own tie and bow tie.

**Look-dev changes in this pass:**
- The fire helmet's reflective band moved from the tinted shell layer to the untinted `shield` layer. It used to come out a darker shade of the helmet colour; now red, yellow and black helmets all show the lime band. Only those 40 head layers were re-rendered.
- **Palette anchors in `cf_pack.build_sheets3`.** Each sheet is quantized to 56 colours. Small saturated items were collapsing onto the neutral palette: the red fire hose came out tan, and the hi-vis and brass trims went muddy. Any untinted layer whose mean colour error is above 9/255 after the first pass now gets pixels in a temporary strip under the sheet, and the sheet is quantized again. The `PALETTE` lines in the pack log list each fix; for example, the hose went from 28 to 16 and the work jacket trim from 37 to 18. Tinted layers changed by less than 0.4/255.
- **Tail merge:** two 240-px stub atlases were packed into the sheets before them, so there are 2 fewer textures (10 → 8) at the same area.

## Presets (`generator.presets`)
| Preset (ko) | Outfit | Anims it is guaranteed to play (checker PROMISE, 60 people each, + JS generator) |
|---|---|---|
| `firefighter` 소방관 | turnout coat and trousers, helmet (red, yellow or black), air tank, rubber boots | spray_hose, run, point, idle, walk, talk, happy, wave |
| `police_officer` 경찰관 | `top_police_v2`, `hat_police`, `det_police` | run, point, phone, think, walk, talk |
| `detective` 탐정 | trench coat, deerstalker or fedora (adult or elder) | think, point, phone, walk, talk, run |
| `burglar` 좀도둑 | stripes, eye mask, docker beanie, loot sack | flee, run, arrested_walk, walk, idle, fight, argue, sad, sit |
| `banker` 은행장 | three-piece suit (adult or elder) | walk, talk, think, shocked, phone, sit |
| `bank_teller` 은행 창구 직원 | teller waistcoat, eyeshade | walk, talk, phone, shocked, idle |
| `warehouse_worker` 물류센터 직원 | work jacket, gloves | carry_box, carry_walk, walk, sweep |
| `forklift_driver` 지게차 기사 | work jacket, overalls, hard hat, hi-vis | carry_box, walk, talk |
| `delivery_driver` 택배 기사 | courier polo and cap | carry_box, run, walk, phone |
| `mover` 이삿짐 일꾼 | mover overalls, back brace, gloves | carry_box, carry_walk, walk |
| `construction_worker` 공사장 인부 | hi-vis jacket, hard hat, tool belt | sweep, carry_box, point, walk |
| `demolition_worker` 철거 작업자 | work jacket, hard hat, hi-vis, gloves, tool belt | sweep, carry_box, point, walk |
| `reporter` 기자 | press camera, notepad, coat, flat cap or beret | run, phone, point, talk, walk, think, shocked |

**Random townsfolk:** ordinary residents play the crowd anims in their everyday clothes. The checker's coverage for random townsfolk:

| Anim | Share of random townsfolk |
|---|---|
| run, argue, point, think, shocked, phone | 76 % |
| flee | 22 % |
| sweep | 10 % |
| carry_box, arrested_walk, fight | 4 % |
| spray_hose | 3 % |

Everyone else falls back gracefully, keeping the mood with a face override (rule 7). For example, a resident who cannot flee runs with the `panic` face.

## Merge rules (manifest `cityfolk.merge`; implemented in both compositors)
1. **Merge order:** `townfolk` ← `townfolk2` ← (`beachfolk`) ← `cityfolk`, all through `mergeTownfolkFragments(man, ...fragments)`.
   - It is one generic merge for any fragment in the townfolk2 format; for v4 + v5 it gives exactly `mergeTownfolk`.
   - Concatenate the atlas lists.
2. **No redefinitions:** `anims`, `timeline`, `headPoses`, `parts`, `z`, `tintRef`, `palettes`, `frameAtlas` and `presets` only add keys. The merge throws if a fragment would redefine one.
3. **New frames for existing layers:** `frameAtlasExt` routes them to the new atlases. `frameAtlasAnim[anim][layer@base]` covers v4 parts in the new anims.
4. **Faces:** `faceExprs` is a union per head pose; `exprBrow` adds entries.
5. **Bases:** `headOffset` gets the new anims and `parts` is a union. `cfCover`, `nozzlePoint`, `boxPoint` and `sweepPoint` are new keys.
6. **Generator:**
   - `presets` and `slotPalette` add entries; `exclude` is concatenated; `extraSlots` is a union.
   - Other generator keys from beachfolk, such as `beachSlots` and `animParts`, are merged generically.
   - Other top-level keys (`animItems`, `animFallback`, `fallbackFace`, `cfParts`, `lowerShare`) are copied; objects are shallow-merged and arrays concatenated.
7. **Draw and play rules (`Cityfolk.layers`, `canPlay`, `pickAnim`):**
   - `animItems[anim]` parts are added for that anim. Parts with `onlyAnims` draw only there, and parts with `noAnims` never do.
   - **For a cityfolk anim:** every worn body part (items excepted) must be listed in `bases[b].cfCover[anim]`.
   - **For an older anim:** every worn cityfolk part must be listed there too.
   - **Beachfolk parts** use their `anims` list. `drop: true` accessories are ignored, as in `beachfolk_compose`: they are simply not drawn there. This rule was added in this pass and makes the two compositors agree on beach people.
   - `pickAnim(person, anim)` walks `animFallback[anim]` and returns `{anim, face}`, where `face = fallbackFace[anim]`. For example:
     - flee → run → walk (panic)
     - carry_box → carry_walk → walk
     - fight → argue → talk (angry)
     - arrested_walk → walk (sheepish)
     - point → talk (shocked)
     - shocked / think → idle with the matching face
     - spray_hose → idle (determined)
8. **Shared lower bodies:** lower-body layers are shared within each group (`lowerShare`): run with flee, arrested_walk with carry_box, and the standing anims with each other. The shared frames are the same rects, 840 pairs in all.

## How the game uses it
```js
import { mergeTownfolkFragments, Cityfolk, CityfolkSprite } from './cityfolk_compose.js';
import { townfolkPreload, townfolkInstall, mulberry32 } from './townfolk_compose.js';
const man = mergeTownfolkFragments(manTownfolk, manTownfolk2, /* manBeachfolk, */ manCityfolk);
// preload: townfolkPreload(scene, man, 'assets/');   create: townfolkInstall(scene, man);
const cf = new Cityfolk(man.townfolk);
const ff = cf.preset('firefighter', rng);                 // or cf.randomPerson(rng) for a resident
const s = new CityfolkSprite(scene, cf, ff, x, y).play('spray_hose', 'NE');   // falls back if needed
const [nx, ny, ux, uy] = cf.nozzlePoint(ff, s.dir, s.frame);                   // aim the fx_city hose arc
```
- **Fire:** firefighters play `spray_hose` toward the fire (fx_city `fireMount`) with `nozzlePoint` → `fx_hose_rope`, and `run` from the truck. The crowd plays `shocked`, `point`, `phone` and `think`; residents of the burning house play `flee` (nobody is hurt).
- **Crime:**
  - The burglar plays `flee` with the sack; police `run` after him and `point`.
  - After the catch: `arrested_walk` with a police officer walking beside him, toward the police station cell.
  - The wanted poster uses `ui_wanted_poster` from fx_city.
  - A scuffle is two residents ~44 px apart playing `fight` (E and W) inside `fx_fight_cloud_back` / `_front` (fx_city `fightGuide`). They can also `argue` first.
- **Logistics and moving:**
  - `carry_box` for movers, warehouse crew and couriers.
  - Use `setItems(false)` with `boxPoint` to carry a real logistics item (sofa boxes, appliances).
  - `forklift_driver` / `warehouse_worker` stand at the logistics centre.
- **Bank:** `banker` and `bank_teller` staff the counters (`talk`, `phone`, `think`; `shocked` during a robbery).
- **Clean-up and rebuild:** `construction_worker` and `demolition_worker` `sweep` rubble and snow; `sweepPoint` puffs dust.
- **Story network:** the press presets add life: `reporter` with `phone`, `run` and `point`, and `detective` with `think`. Any resident can show the story faces as overrides (`s.setFace('thinking')` and so on).

## GPU memory and payload
- **Payload:** 6.84 MB. Bodies and heads use 56 colours with dither 0.5, as townfolk does; the palette anchors keep the saturated items true.
- **GPU:** 85.1 MiB (22.30 Mpx) across 8 textures. For comparison:

  | Fragment | GPU |
  |---|---|
  | townfolk | 104.7 MiB |
  | townfolk2 | 72.6 MiB |
  | beachfolk | 82.4 MiB |
  | cityfolk | 85.1 MiB |

  The 2048-px sheets are about 85 % filled (rect area ÷ sheet area), so better packing has little left to win.
- **Share of the atlas area:**

  | Group | Anims | Share |
  |---|---|---|
  | moving anims | run, flee, arrested_walk, carry_box | 47 % (run alone 22 %) |
  | job outfits in the v4/v5 anims | idle, walk, talk, wave, happy, carry_walk, sit, sad | 29 % |
  | crowd and work anims | argue, fight, point, think, shocked, phone, sweep, spray_hose | 21 % |
  | heads | | 3 % |
- **What was traded:** the cast (`cf_presets.CAST3`) keeps memory down. Rendering every part in every new anim would cost ~160 MiB.
  - The everyday 'core' wardrobe of each age is in the crowd anims (run, argue, point, think, shocked, phone).
  - Flee uses a smaller 'mini' wardrobe, and the work anims a 'tiny' one.
  - The job outfits appear only in the anims their jobs need.
  - Shared lower bodies and identical frames are stored once.
- **Measured options to reach ~75 MiB:**
  - Dropping children's and elders' crowd anims to 'mini' saves only ~1 MiB, because those frames are mostly shared.
  - Dropping `run` to 'mini' for everyone saves ~7 MiB, but then only ~22 % of residents could run instead of 76 %.
  - Both were rejected as poor trades.
- **Paging:** the v4-B residency system can page this fragment as one lazy group, loaded when the town reaches its city stage and its first job NPCs appear.

## Previews (`docs/previews/`)
- **`cityfolk_crowd.png` (1x, + `cityfolk_crowd_2x.png`):** 80 people, 33 cityfolk presets and 47 random townsfolk, on a town street around a house fire. It is staged with the real game assets, all read-only: town houses, fire truck, police car, cargo truck, civic props, and fx_city fire, smoke, embers, hose ropes, mist, steam and fight cloud. It shows:
  - three firefighters aiming hoses from their `nozzlePoint`s;
  - residents fleeing and the crowd shocked, pointing and phoning;
  - a police chase, an arrest and a scuffle;
  - movers with boxes, sweepers, and everyday walkers.
- **`cityfolk_jobs.png`:** every preset × 3 people, as idle S, walk SE, the signature anim and idle N. All 13 signature anims play without fallback.
- **`cityfolk_anims.png`:** the 12 anims on all 6 bases.
- **GIFs:** `cityfolk_run.gif`, `_flee`, `_argue`, `_fight`, `_arrested_walk`, `_spray_hose` (with a stand-in water arc from `nozzlePoint`), `_point`, `_think`, `_shocked`, `_phone`, `_carry_box`, `_sweep`.
- **`cityfolk_proof.png`:** full Blender renders next to the layered composites. The mean difference is 14.9/255 over 114 frames, mostly the ink outline that only the composites carry (townfolk measured 14).
- **`cityfolk_phaser.png`:** the headless Phaser scene.

## Known issues
- **GPU memory is 85 MiB**, about 13 % over the ~75 MiB aim; see the options above. With townfolk and townfolk2 the total is about 262 MiB, and about 345 MiB with beachfolk too. Page beachfolk and cityfolk by area or stage.
- **The work anims are for the job presets.**
  - carry_box, arrested_walk, fight, sweep and spray_hose cover only the presets and a small everyday wardrobe; other residents fall back. A thief in a cardigan who is caught walks with the `sheepish` face instead of `arrested_walk`.
  - The game should give its burglars the `burglar` preset, its movers the `mover` preset, and so on.
- **The reporter's notepad** is hidden in the far hand in some E and NE frames (the 5 checker warnings).
- **Elders' mittens in run N:** they pump in front of the torso and are hidden on half the frames. This is expected (`HIDDEN_LIMBS`).
- **Palette:** after the anchors, the red hose still dithers slightly (mean error 16/255); this is not visible at 1×. A few pale tints clamp, as in townfolk.
- **Round bodies** are stretched slim renders, as in townfolk.
- **beachfolk is being polished in parallel.** If it adds new draw rules to its own compositor, such as hiding the head in an anim, `Cityfolk.layers` must mirror them. Until then the game should keep drawing beach anims with `BeachfolkSprite`. The generic merge already accepts unknown manifest keys, and the current beachfolk fragment merges and composes identically.

## Rebuild
The render steps are resumable: only missing layer PNGs render. Run one Blender process at a time with `--threads 2`.
1. `/tmp/bvenv/bin/python tools/blender/cf_render.py -- --mode head`
2. `/tmp/bvenv/bin/python tools/blender/cf_render.py -- --mode body --pass lower|upper|old --bases child_slim|adult_slim|elder_slim`
3. `/tmp/bvenv/bin/python tools/blender/cf_render.py -- --mode meta --bases all` (only after an anim changes)
4. `/tmp/bvenv/bin/python tools/blender/cf_render.py -- --mode full --combos look --out /tmp/fv_cache/cityfolk/look_proof` (for the proof)
5. `python3 tools/blender/cf_pack.py`
6. `python3 tools/blender/cf_check.py --dump <scratch>/cases.json`
7. `node tools/test/cityfolk_phaser.mjs --parity <scratch>/cases.json`, then `--jsgen`, then with no flag for the Phaser test
8. `python3 tools/blender/cf_preview.py` (jobs, anims, crowd, gifs, proof)
