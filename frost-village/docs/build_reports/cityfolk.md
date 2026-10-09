# cityfolk build report (polish pass)

The cityfolk fragment (CONTRACT_V8 §AD) has been polished against the art critic's review. Every high and medium issue the review raised reproduced. All were fixed, except a few props that are listed as "won't fix" in the issue table below, each with its reason. All test scripts pass on the re-packed fragment:

- **Checker (`cf_check.py`):** 0 errors. It reports 5 warnings, all about the reporter's notepad, which the body hides in some E and NE frames; this is unchanged. New checks cover:
  - no `animFallback` target is an anim the v4 runtime drops (`carry_walk`, read from `tools/build/pack_pages.py`);
  - each part's `anims` list equals `cfCover`;
  - `groundSpeed` is present;
  - each atlas belongs to exactly one page.
- **Python/JS parity:** 1200 of 1200 draw lists are identical, with 0 `pickAnim` / `canPlay` mismatches and 0 point mismatches. All four fragments were merged: townfolk, townfolk2, beachfolk and cityfolk. The generic merge of v4 + v5 still gives exactly `mergeTownfolk`.
- **JS generator (`--jsgen`):**
  - 1690 preset people keep every promise of their preset.
  - It checked 4,775,234 layer frames and found 0 missing head, face or brow frames.
  - For 3000 random residents:
    - every anim `pickAnim()` returns is playable;
    - **0 fall back to `carry_walk`**;
    - **0 flee with a calm walk**.
- **Phaser 3.90 test:** 46 people and 794 sprites, with townfolk, townfolk2, beachfolk and cityfolk loaded together (37 textures, 16 units). It runs at **2 draw calls per frame** and checked 218,316 layer frames: 0 missing frames, 0 page errors.
- **Phaser incident test (`--incident fire`):** only the fire pages are loaded, **59.8 MiB of cityfolk instead of 88.2**. The scene has 20 people, runs at 1 draw call per frame and has 0 missing frames. Anims whose page is not loaded fall back through `pickAnim({has})`.
- **beachfolk cross-check:** `Beachfolk` and `Cityfolk` were compared on beach people over 9000 checks: 0 `canPlay` and 0 draw-list mismatches.

**Payload and GPU:**
- **Payload:** 6.96 MB (limit 7 MB).
- **GPU:** all pages together take 88.2 MiB in 10 atlases. They are now split into pages, so a scene only loads what its incident needs, 36.7 to 67.0 MiB; see *GPU memory*.

The game merges this fragment after `assets/townfolk` and `assets/townfolk2`, with beachfolk in between or not loaded, using `mergeTownfolkFragments()` in `tools/cityfolk_compose.js`.

This job did not cover the user's latest request: deleting buildings in a newly opened area, existing buildings shown as inactive with "no residents", widening the starting area to the left, and a town hall and a big restaurant. That is game code under `src/**`, owned by the v4 code agents, plus town art. Nothing outside the cityfolk files was touched.

## Critic issues → result
| # | Sev | Issue | Result | What was done / why not |
|---|---|---|---|---|
| 1 | high | carry_box falls back to `carry_walk`, which v4 never loads (floating heads) | **fixed** | `animFallback.carry_box = ['walk']`.<br>`carry_walk` removed from CAST3, the promises and the old-anim cast (saves its frames).<br>`pickAnim(person, anim, {has})` skips anims the runtime cannot show.<br>`cf_check` reads `TF_DROP_ANIMS` from pack_pages and fails if any fallback names one.<br>jsgen: 0 carry_walk picks in 3000 residents. |
| 2 | high | 85 MiB in one indivisible group; no paging, no half tier | **fixed (cityfolk side)**; half tier and pack_pages hookup **won't fix here** | Re-packed into 7 anim pages plus a head page (`cfPages`), with one `frameAtlasExt` entry per page. `cfPages.incidents` lists each scene's pages:<br>• fire 59.8 MiB<br>• crime 67.0 MiB<br>• rebuild 40.0 MiB<br>• bank 36.9 MiB<br>• logistics 36.7 MiB<br>The `--incident fire` Phaser test proves it.<br>The half-res tier and `TF_FRAGS` live in `tools/build/pack_pages.py` (v4-B's file); see the port plan. |
| 3 | high | Most residents can't flee, fight or play the crowd anims; 26 % flee with a calm walk | **fixed** for run, flee and crowd; **won't fix** the work anims fully | Run and crowd anims went from 74 % to 94 %.<br>Flee went from 19 % to 75 %; another 21 % run with the panic face, 5 % stand in panic, and **0 % walk**.<br>The necklace (and the satchel and backpack in the work and flee anims) are drop accessories now.<br>The run blockers were rendered: dress, adult bomber, pleated skirt, backpack.<br>Flee gets every run bottom and shoe as free aliases.<br>fight, arrested_walk and carry_box are at 5-6 % (were 3-4 %). Each everyday outfit costs ~1-2 MiB per anim, and the payload is at 6.96 / 7 MB. Use the presets, and use `fx_fight_cloud` simple mode for a scuffle (merge rule 8). |
| 4 | high | Bank teller reads as a kindergarten uniform; visor on 55 % | **fixed** | Short waistcoat with pointed fronts, cut above the waistband, in bottle green, burgundy or brown.<br>Pale-blue, grey or cream shirt.<br>Red sleeve garters, a white name badge with a red stripe and a brass frame, a black bow tie and a pen.<br>Visor on 100 %, grown-up hair, grey trousers or skirt.<br>Re-rendered. |
| 5 | med | Job presets don't read at 0.6× | **fixed**, except 3 props **won't fix** | **Warehouse:** sky-blue logistics tabard (`det_lgx_vest`) with a yellow band and a parcel logo, plus brand-colour caps.<br>**Delivery:** no brown; the cap uses the polo's contrast colour. The cap logo is about 2.8× its old area, the chest logo is on a white patch about 7× its old area, and there is a bigger patch on the back.<br>**Forklift:** `hat_bump_cap` with red ear defenders and an orange hi-vis.<br>**Demolition:** orange `hat_demo_helmet` with a face shield, plus `acc_dust_mask` (70 %).<br>**Construction:** keeps the yellow hard hat and lime jacket.<br>**Reporter:** `hat_press_fedora` with a PRESS card, and a bigger camera with a flash.<br>**Mover:** no cream sweater, no red hat, a bright brace.<br>**Banker:** grown-up hair, more elders, glasses 65 %.<br>Not added: the sledgehammer, scanner/lanyard and press armband. Each would be a prop drawn in every anim of its job (~1 MiB each) with the payload at the limit; the new hats carry the job instead. |
| 6 | med | Ponytail and twin-tail ties poke through full job hats | **fixed** | Generator excludes: tied hair × job hats. The job hats are the `jobhat` tag (fire helmet, burglar beanie, delivery cap, deerstalker, the 3 new hats), plus police, hard hat, station, postal and fedora. Both generators apply them (parity). |
| 7 | med | Broom looks like a spoon and floats at hip height in E | **fixed** | Korean besom: the straw fan is 2.2× longer and fuller, with 9 twig streaks, dark binding and a thicker handle.<br>Wider ping-pong arc, with a lift at both ends.<br>The broom is on the near side in every rendered dir, so no per-dir z is needed.<br>`sweepPoint` E is now y +7..+16, in front of the feet (was −18..−14). |
| 8 | med | Hose in S/SE is a red tab hanging from the belt | **fixed** | The line now runs from the nozzle tail past the hip to the snow and trails back, in every dir.<br>Black nozzle with a brass band.<br>Gloves use a dark `firegloves` palette. |
| 9 | med | Burglar's sack covers his face in flee; mask merges on dark skin | **fixed**; arrested head tilt **not reproduced** | The sack has a flee-only sub over the far shoulder, behind the head, and hangs low at his side elsewhere.<br>Navy mask with light rims and a slimmer band; the beanie brim is raised.<br>Arrested_walk uses the same head pose as walk. The "dark blob" came from the mask and beanie, which are fixed. |
| 10 | med | Run reads like a walk; feet slide at game speeds | **fixed** | New keyed cartoon run:<br>• ground-solved hips;<br>• 16 fps;<br>• hips ±42°, knee up to 112°;<br>• 5-7 px flight bob (adult);<br>• opposite-arm pump, wider elbows.<br>Flee shares the legs.<br>`bases[b].groundSpeed[anim][dir]` is published in px/s; adult E: run 131.8, walk 62.1. |
| 11 | med | Merge with the live runtime and beachfolk | **fixed (tools)**; editing `src/core/Townfolk.js` **won't fix** (not owned) | Both compositors import `partPlays` / `headHidden` from beachfolk_compose.<br>Cityfolk parts carry per-base `anims` lists, and worn hand items carry `noAnims`.<br>The Python loader skips incomplete fragment folders with a warning.<br>Port plan for the integrator below. |
| — | (summary) | Angry/shout blush turns glasses into red eyes | **fixed** | New `cheek_angry` flush, lower than the glasses line, for angry and shout on every face set. |

Also in this pass: `cityfolk_proof.png` now shows the runtime fallback, labelled, instead of a blank cell. A stray-pixel bug found in townfolk / townfolk2 (not ours, not fixed here) is listed under *Known issues*.

## Paths (under `frost-village/`)
- **Assets:** `assets/cityfolk/` holds `manifest.json` (block `cityfolk`) and 10 atlases in the `tfatlas` v1 format. Together they are 23.12 Mpx and hold 24,696 frames plus 8,552 aliases. Each atlas holds one page:

  | Atlas | Size |
  |---|---|
  | `cf_head_0` | 2048×504 |
  | `cf_loco_0` | 2048×1648 |
  | `cf_rush_0` | 2048×1472 |
  | `cf_rush_1` | 2048×1452 |
  | `cf_rush_2` | 2048×916 |
  | `cf_crowd_0` | 2048×1496 |
  | `cf_scuffle_0` | 2048×1088 |
  | `cf_work_0` | 2048×1472 |
  | `cf_fire_0` | 2048×164 |
  | `cf_social_0` | 2048×1076 |
- **Scripts:** all are new files.
  - `tools/blender/cf_anim.py`, `cf_parts.py`, `cf_presets.py`, `cf_render.py`, `cf_pack.py`, `cf_check.py`, `cf_preview.py`.
  - They import `tf_*` and `tf2_*` and never edit them.
- **Compositors:**
  - `tools/cityfolk_compose.py` is the Python reference.
  - `tools/cityfolk_compose.js` is the JS port. It imports `townfolk_compose.js`, `townfolk2_compose.js` and `beachfolk_compose.js` (`partPlays`, `headHidden`) unchanged.
- **Test:** `tools/test/cityfolk_phaser.mjs` has four modes: the Phaser scene (no flag), `--parity cases.json`, `--jsgen` and `--incident fire`.
- **Render cache:** `/tmp/fv_cache/cityfolk`, about 320 MB.
  - `old_pass1*` (~105 MB) holds first-pass layer backups and can be deleted.
  - `old_assets` holds the first-pass atlases used by `cityfolk_polish.png`.

## New anims (all 6 bases; round bases reuse the slim renders, as in townfolk)
| Anim | Frames, fps | Dirs | What it does |
|---|---|---|---|
| `run` | 8, **16**, loop | S SE E NE N | Keyed cartoon run with real flight frames, forward lean, pumping arms opposite the legs and wider elbows. Police chases, rushing to a fire, kids playing. |
| `flee` | 8, **16**, loop | S SE E NE N | Same legs as run (shared images), with both arms up and the `panic` face. The burglar hugs the loot sack over his far shoulder. |
| `arrested_walk` | 8, 9, loop | S SE E NE N | Hands behind the back, head down, `sheepish` face, short shuffling steps. |
| `carry_box` | 8, 10, loop | S SE E NE N | Hugs a big cardboard box (`held_box`). Gives `boxPoint`. |
| `argue` | 6, 8, loop | S SE E | Wagging finger (`hand_point`), a stomp, `angry` face. |
| `fight` | 6, 12, loop | S SE E | Comic windmill flail with little hops, made for use inside `fx_fight_cloud_back` / `_front`. |
| `point` | 6, 8, loop | S SE E | Raise, point, jab. |
| `think` | 4, 3, loop | S SE E | Taps the chin, `thinking` face. |
| `shocked` | 4, 8, loop | S SE E | A jolt, then mittens on the cheeks. |
| `phone` | 4, 5, loop | S SE E | Phone at the ear (`held_phone`), free hand gesturing. |
| `sweep` | 6, 8, loop | S SE E | Besom swept in a wide ping-pong arc in front of the near foot, lifting at the ends. Gives `sweepPoint`. |
| `spray_hose` | 4, 10, loop | S SE E NE | Braced stance with a black and brass nozzle in both mittens. The hose runs past the hip to the snow and trails back. `determined` face. Gives `nozzlePoint`. |

- SW, W and NW are mirrored. `CityfolkSprite.play()` falls back automatically (rule 8).
- **Faces:** 7 expressions on every head pose and face set: `shocked`, `panic`, `angry`, `shout`, `thinking`, `determined`, `sheepish`, plus an `angry` brow. Angry and shout use the lower `cheek_angry` flush, so glasses stay clear.

### Anim points and speeds (manifest `bases[b]`; mirrored dirs negate x and the x direction)
- **`nozzlePoint.spray_hose[dir][i]`** = `[x, y, ux, uy]`: the nozzle tip in px from the anchor, plus the unit screen direction of the water. Start fx_city `fx_hose_rope` / `fx_hose_stream` there.
- **`boxPoint.carry_box[dir][i]`** = `[cx, cy, bx, by]`: the box centre and bottom-centre. For a real logistics item, call `setItems(false)` and draw the item at the bottom-centre:
  - depth = person depth + 0.0045 in S, SE and E;
  - depth = person depth − 0.0001 in NE and N.
- **`sweepPoint.sweep[dir][i]`** = `[x, y]`: where the bristles touch the snow. Puff snow or `fx_demolish_dust` there.
- **`groundSpeed[anim][dir]`** (new): px/s at the anim's fps for walk, run, flee, carry_box and arrested_walk. It is measured from the planted foot, per base and per rendered dir; mirrored dirs use their source dir.
  - Move the sprite at that speed, or scale the fps by `gameSpeed / groundSpeed`.

  | px/s, E | walk | run / flee | carry_box | arrested_walk |
  |---|---|---|---|---|
  | adult_slim | 62.1 | 131.8 | 39.1 | 35.2 |
  | adult_round | 75.8 | 161.1 | 47.7 | 42.9 |
  | child_slim | 53.1 | 79.3 | 35.4 | 31.8 |
  | elder_slim | 40.6 | 74.1 | 28.6 | 25.8 |

  The N and S dirs are slower, because screen-space speed is foreshortened.

## New parts (29 wearables + 5 anim items, all tinted through the townfolk tint model)
The existing parts are reused: `hat_police`, `det_police`, `hat_hardhat`, `det_hivis`, `hat_fedora`, `hat_beanie`, `hat_cap`, `hat_flatcap`, `hat_beret`, plus the trousers, shoes, sweaters and coats.
- **Fire:**
  - `top_fire_coat`: turnout coat with lime and silver bands.
  - `bot_fire_pants`.
  - `acc_air_tank`.
  - `hat_fire_helmet`: comb ridge, long back brim, leather front shield, lime band.
- **Police:** `top_police_v2`, a winter jacket with a hi-vis vest, patch and radio.
- **Petty thief:**
  - `top_stripes`: the striped shirt, adults only.
  - `acc_eye_mask`: navy domino mask with light rims.
  - `hat_burglar_beanie`: docker beanie with a raised brim.
  - `held_loot_sack`: low at his side in his calm anims, and over the far shoulder in flee.
- **Bank:**
  - `top_suit_3pc`: three-piece suit with its own tie and a watch chain.
  - `top_teller_vest`: short pointed waistcoat, pale shirt, red garters, name badge, bow tie and pen.
  - `acc_visor`: green eyeshade.
- **Logistics and moving:**
  - `top_work_jacket`, `acc_gloves`.
  - `det_lgx_vest` (new): sky-blue logistics tabard with a yellow band and a navy parcel logo.
  - `hat_bump_cap` (new): bump cap with red ear defenders.
  - `hat_delivery_cap`, `top_delivery_polo`: bigger parcel logos, on white patches front and back.
  - `bot_mover_overalls`, `acc_back_brace`.
- **Building sites:**
  - `top_hivis_jacket`, `acc_toolbelt`.
  - `hat_demo_helmet` (new): orange helmet with a clear face shield.
  - `acc_dust_mask` (new).
- **Press and detective:**
  - `acc_camera`: bigger, with a flash and a red press tag.
  - `held_notepad`, `top_trench`, `hat_deerstalker`.
  - `hat_press_fedora` (new): fedora with a PRESS card in the band.
- **Anim items** (`animItems`, added for their anim only; `noItems` skips them):
  - `held_box` (carry_box);
  - `held_hose` (spray_hose);
  - `held_broom` (sweep; now a Korean besom);
  - `held_phone` (phone);
  - `hand_point` (point, argue).

**Part metadata (new):**
- Every cityfolk body part carries an `anims` list per base (equal to `cfCover`).
- Worn hand items (sack, notepad) carry `noAnims` for the anims they have no frames in.
- Subs can carry `onlyAnims` / `noAnims`; the sack's `main` and `flee` subs use this.
- `det_tie` stays a children's part in assets/townfolk; that is why the suit and the waistcoat carry their own ties.

**Palette:** each sheet is quantized after a palette-anchor pass. Small saturated items (hose, hi-vis, brass, logos, the helmet shield) get anchor pixels so they keep their colour. Bodies use 50 colours and heads 96. The `PALETTE` lines in the pack log list each anchored layer.

## Presets (`generator.presets`)
| Preset (ko) | Outfit | Anims it is guaranteed to play (checker PROMISE + JS generator) |
|---|---|---|
| `firefighter` 소방관 | turnout coat and trousers; helmet (red, yellow or black); air tank; rubber boots; dark gloves; no ponytails | spray_hose, run, point, idle, walk, talk, happy, wave |
| `police_officer` 경찰관 | `top_police_v2`, `hat_police`, `det_police` | run, point, phone, think, walk, talk |
| `detective` 탐정 | trench coat; deerstalker or fedora (adult or elder) | think, point, phone, walk, talk, run |
| `burglar` 좀도둑 | stripes, navy eye mask, docker beanie, loot sack | flee, run, arrested_walk, walk, idle, fight, argue, sad, sit |
| `banker` 은행장 | three-piece suit; grown-up hair; mostly elders; glasses 65 % | walk, talk, think, shocked, phone, sit |
| `bank_teller` 은행 창구 직원 | short teller waistcoat (green, burgundy or brown); pale shirt; visor always; grey trousers or skirt | walk, talk, phone, shocked, idle |
| `warehouse_worker` 물류센터 직원 | work jacket, sky-blue `det_lgx_vest`, gloves, brand-colour beanie or cap | carry_box, walk, sweep, idle, talk, point |
| `forklift_driver` 지게차 기사 | work jacket, overalls, `hat_bump_cap`, orange hi-vis, gloves | carry_box, walk, talk, idle |
| `delivery_driver` 택배 기사 | courier polo (red, teal or green) with a contrasting cap | carry_box, run, walk, phone |
| `mover` 이삿짐 일꾼 | sweater or work jacket, mover overalls, bright back brace, gloves | carry_box, walk, idle, talk |
| `construction_worker` 공사장 인부 | lime hi-vis jacket, yellow hard hat, tool belt | sweep, carry_box, point, walk |
| `demolition_worker` 철거 작업자 | work jacket, orange `hat_demo_helmet`, orange hi-vis, dust mask (70 %), tool belt | sweep, carry_box, point, walk |
| `reporter` 기자 | coat, `hat_press_fedora` (or flat cap or beret), big camera, notepad | run, phone, point, talk, walk, think, shocked |

**Random townsfolk** play the crowd anims in their everyday clothes. These are the jsgen numbers for 3000 residents:

| Anim | Plays it | Otherwise |
|---|---|---|
| run, argue, point, think, shocked, phone | 94 % (was 74 %) | walk / talk / idle with the anim's face |
| flee | 75 % (was 19 %) | run 21 % or idle 5 %, both with the `panic` face; never walk |
| sweep | 11 % | idle |
| carry_box | 6 % | walk |
| arrested_walk | 5 % | walk (sheepish) |
| fight | 5 % | argue (angry) |
| spray_hose | 5 % | idle (determined) |

The bank staff, the banker and the teller, never run or flee: flee gives idle with the `panic` face and run gives walk. They play `shocked` and `phone` in a robbery.

## Merge rules (manifest `cityfolk.merge`; implemented in both compositors)
1. **Merge order:** `townfolk` ← `townfolk2` ← (`beachfolk`) ← `cityfolk`, through one generic `mergeTownfolkFragments(man, ...fragments)`. For v4 + v5 it gives exactly `mergeTownfolk`.
   - Concatenate the atlas lists.
   - The Python loader skips a fragment folder that is incomplete or whose requirements are not met, with a warning.
2. **No redefinitions:** `anims`, `timeline`, `headPoses`, `parts`, `z`, `tintRef`, `palettes`, `frameAtlas` and `presets` only add keys. The merge throws on a redefinition.
3. **New frames for existing layers:** `frameAtlasExt` (one entry per page, with a `page` key) routes them to `frameAtlasAnim[anim][layer@base]`. Body frames resolve as `frameAtlasAnim[anim]?.[layer@base] ?? frameAtlas[layer@base]`.
4. **Faces:** `faceExprs` is a union per head pose; `exprBrow` adds entries.
5. **Bases:**
   - `headOffset` gets the new anims and `parts` is a union.
   - `cfCover`, `nozzlePoint`, `boxPoint`, `sweepPoint` and `groundSpeed` are new keys.
6. **Generator:**
   - `presets` and `slotPalette` add entries; `exclude` is concatenated, including the new tied-hair × job-hat rules; `extraSlots` is a union.
   - Unknown generator keys from other fragments are merged generically.
7. **Other top-level keys** are copied; objects are shallow-merged and arrays concatenated: `animItems`, `animFallback`, `fallbackFace`, `cfDrop`, `cfPages`, `cfParts`, `cityfolkAnims`, `lowerShare`.
8. **Draw and play rules (`Cityfolk.layers`, `canPlay`, `pickAnim`):**
   - **Parts with an `anims` list** (beachfolk and cityfolk parts) follow `beachfolk_compose.partPlays`, the canonical rule. Worn hand items are not drawn in their `noAnims`. Subs follow their own `onlyAnims` / `noAnims`.
   - **Hidden head parts** (`beachfolk_compose.headHidden`, e.g. a swimmer's hat) are not drawn, and a hidden full hat no longer squashes the hair.
   - **v4 and v5 parts in a cityfolk anim** need `bases[b].cfCover[anim]`.
   - **`cfDrop[part]`** lists the cityfolk anims where a v4 accessory is simply not drawn; it never blocks the anim. This covers the necklace in all of them, and the satchel and backpack in flee, fight, arrested_walk, carry_box, sweep and spray_hose.
   - **`animItems`** are added unless `noItems` is set.
   - **`pickAnim(person, anim, {has})`** walks `animFallback[anim]` and returns `{anim, face: fallbackFace[anim]}`. `has(anim, person) = false` skips anims the runtime cannot show right now (page not resident). The last resort is idle, else walk.

     | Requested | Falls back to | Face |
     |---|---|---|
     | flee | run → idle | panic |
     | carry_box | walk (never `carry_walk`) | |
     | fight | argue → talk → idle | angry |
     | argue | talk → idle | angry |
     | arrested_walk | walk | sheepish |
     | point | talk → idle | shocked |
     | phone | talk → idle | |
     | think | idle | thinking |
     | shocked | idle | shocked |
     | spray_hose | idle | determined |
     | sweep | idle | |
   - **Scuffles:** when either resident cannot play `fight`, use `fx_fight_cloud` in its simple mode, which bakes both fighters in, instead of two dolls.
9. **Shared lower bodies (`lowerShare`):**
   - run and flee share their legs; 1447 lower-body frame pairs are one rect each.
   - Flee gets every bottom and shoe cast in run as free aliases (`LOWER_PARTNER`).
   - arrested_walk and carry_box share the same leg images, but live on different pages, so they are stored twice.
   - The standing anims share their planted stance.
10. **Pages (`cfPages`):**
    - Every atlas holds one page of `cfPages.groups`, with its anims, atlases, bases and MiB.
    - `cfPages.incidents[name].pages` lists what a scene needs.
    - `Cityfolk.pageOf(anim)` and `pageNeeded(person, anim)` give the page a frame lives in. `pageNeeded` is null when the person draws only from townfolk / townfolk2.

## How the game uses it
```js
import { mergeTownfolkFragments, Cityfolk, CityfolkSprite } from './cityfolk_compose.js';
import { townfolkPreload, townfolkInstall, mulberry32 } from './townfolk_compose.js';
const man = mergeTownfolkFragments(manTownfolk, manTownfolk2, /* manBeachfolk, */ manCityfolk);
const cf = new Cityfolk(man.townfolk);
const P = man.townfolk.cfPages;
// a fire starts: make P.groups[g].atlases resident for g of P.incidents.fire.pages (Residency), drop them afterwards
const resident = new Set(P.incidents.fire.pages);
const has = (a, p) => { const g = p ? cf.pageNeeded(p, a) : cf.pageOf(a); return !g || resident.has(g); };
const ff = cf.preset('firefighter', rng);                        // or cf.randomPerson(rng) for a resident
const s = new CityfolkSprite(scene, cf, ff, x, y); s.has = has;
s.play('spray_hose', 'NE');                                      // falls back (with a face) if needed
const [nx, ny, ux, uy] = cf.nozzlePoint(ff, s.dir, s.frame);     // aim the fx_city hose
const v = cf.groundSpeed(ff, 'run', 'E');                        // px/s: move at v, or scale fps by speed / v
```
- **Fire (`incidents.fire`):**
  - Firefighters play `spray_hose` with `nozzlePoint` → `fx_hose_rope` / `fx_hose_stream`, and `run` from the truck.
  - The crowd plays `shocked`, `point`, `phone` and `think`.
  - Residents of the burning house play `flee`; nobody is hurt.
- **Crime (`incidents.crime`):**
  - The burglar flees with the sack and police run after him and point.
  - After the catch: `arrested_walk` with an officer walking beside him.
  - Scuffles are two `fight` dolls in `fx_fight_cloud_back` / `_front`, or simple mode (rule 8).
- **Logistics / moving (`incidents.logistics`):**
  - `carry_box` for movers, warehouse crew and couriers.
  - `setItems(false)` + `boxPoint` to carry a real item.
- **Bank (`incidents.bank`):** banker and teller staff the counters (`talk`, `phone`, `think`, `shocked`).
- **Clean-up and rebuild (`incidents.rebuild`):** construction and demolition workers sweep; `sweepPoint` puffs dust.
- **Story network:** reporters `phone`, `run` and `point`; detectives `think`. Any resident can take a story face (`s.setFace('thinking')`).

**Port plan for the integrator (v4 code owns these files):**
1. **Runtime layers:** `src/core/Townfolk.js` still has `TOWNFOLK2 = false` and its own `layersInto`. Either:
   - port `tools/cityfolk_compose.js` into it, `Cityfolk.layers`, `canPlay` and `pickAnim` with `{has}` (it already imports the townfolk2 and beachfolk rules); or
   - call it directly.

   Then run `node tools/test/cityfolk_phaser.mjs --parity` against the ported module.
2. **Packed pages:** add `townfolk2` and `cityfolk` to `TF_FRAGS` in `tools/build/pack_pages.py`, and map each `cfPages` group to a Residency group.
3. **Half tier:** add the 0.5 tier for zoom < 0.85, as for the townfolk loco pages. It quarters every MiB number below.
4. **Speeds:** use `groundSpeed` when moving cityfolk sprites. Villager runners move at 150 px/s, which matches the adult round run (161) and is 1.1× the adult slim run (132).

## GPU memory and payload
- **Payload:** 6.96 MB (limit 7 MB): 50-colour body sheets and 96-colour heads, dither 0.5, palette anchors.
- **GPU, all pages:** 88.2 MiB (23.12 Mpx) in 10 textures. It was 85.1 MiB before.
  - It is up 3 MiB because of the coverage renders (run and crowd now reach 94 % of residents) and the 5 new job parts.
  - It is down by the dropped `carry_walk` frames.
- **Pages:**

  | Page | Anims | MiB |
  |---|---|---|
  | head | new hats, masks, faces (loaded with any page) | 3.9 |
  | loco | job outfits in idle / walk | 12.9 |
  | rush | run, flee | 30.0 |
  | crowd | point, think, shocked, phone | 11.7 |
  | scuffle | argue, fight, arrested_walk | 8.5 |
  | work | carry_box, sweep | 11.5 |
  | fire | spray_hose | 1.3 |
  | social | job outfits in talk / wave / happy / sit / sad | 8.4 |
- **Incidents** (what has to be resident):

  | Incident | Pages | MiB |
  |---|---|---|
  | fire | head, loco, rush, crowd, fire | 59.8 |
  | crime | head, loco, rush, crowd, scuffle | 67.0 |
  | rebuild | head, loco, work, crowd | 40.0 |
  | bank | head, loco, social, crowd | 36.9 |
  | logistics | head, loco, work, social | 36.7 |

  With the half tier at zoom 0.6 these drop to about 9-17 MiB.
- **What was traded** (`cf_presets.CAST3`):
  - **core** wardrobe: run and the crowd anims, all ages; flee for adults.
  - **mini**: flee for children and elders, with every run bottom and shoe aliased in for free.
  - **tiny**: arrested_walk, carry_box and fight.
  - The job outfits are only in the anims their jobs need.
  - Left out for the 7 MB payload, about 5 % of residents who fall back: child bombers, vests and cardigans, and elder overalls.

## Previews (`docs/previews/`)
- **`cityfolk_crowd.png` (1x, + `cityfolk_crowd_2x.png`):** 79 people, 33 cityfolk presets and 46 random townsfolk, on a town street around a house fire. It is staged with the real town, vehicle, civic and fx_city assets. It shows:
  - firefighters aiming hoses from `nozzlePoint`;
  - residents fleeing, and a shocked, pointing and phoning crowd;
  - a police chase, an arrest and a scuffle;
  - movers, sweepers and walkers.
- **`cityfolk_jobs.png`:** every preset × 3 people, as idle S, walk SE, the signature anim and idle N. All 13 signature anims play without fallback.
- **`cityfolk_lineup.png` (new):** a phone-zoom 0.6 lineup in device pixels: 13 presets × 2 plus 8 residents, and the same at CSS size. Every job reads by its hat and colour block.
- **`cityfolk_polish.png` (new):** each critic issue, first pass next to this pass, at 2×. It covers the teller, warehouse, forklift, delivery, demolition, reporter, burglar flee, hose S/SE, sweep, angry-with-glasses and run S.
- **`cityfolk_anims.png`:** the 12 anims on all 6 bases.
- **GIFs:**
  - `cityfolk_run.gif`, `_flee`, `_argue`, `_fight`, `_arrested_walk`, `_point`, `_think`, `_shocked`, `_phone`, `_carry_box`.
  - `_spray_hose`, with a stand-in water arc from `nozzlePoint`.
  - `_sweep`, with a white snow puff at `sweepPoint`.
- **`cityfolk_proof.png`:** full Blender renders next to the layered composites. Over 122 frames, the mean difference is 17.9/255 over the silhouette and 14.0/255 inside it; the ink outline only exists on the composites (townfolk measured 14). Outfit and anim pairs the cast does not cover now show their runtime fallback, labelled "not cast → …".
- **`cityfolk_phaser.png`:** the headless Phaser scene.

## Known issues
- **Work anims for everyday clothes:** fight, arrested_walk and carry_box reach only 5-6 % of random residents, spray_hose 5 % and sweep 11 %.
  - Use the presets (burglar, mover, firefighter and so on).
  - For scuffles, use `fx_fight_cloud` simple mode when either side cannot `fight`.
  - Raising this costs ~1-2 MiB per outfit per anim, and the payload is at the limit.
- **Bank staff** stand in panic instead of fleeing; this is by design, see *Presets*.
- **Waiting on v4 code** (not owned here):
  - the runtime port to `src/core/Townfolk.js`;
  - the `pack_pages` hookup and the half tier.

  Until then the game has no runtime path for cityfolk, and the v4 Residency cannot page it; the page split is ready in the manifest (`cfPages`).
- **Teller at 0.6×:** the burgundy and brown waistcoats with pale sleeves still lean a little "uniform". The visor (100 %) and the name badge make them read as bank staff. Green is the clearest; reweight to green-only if the designer still sees a school uniform.
- **The reporter's notepad** is hidden by the body in some E and NE frames (the 5 checker warnings). It is still visible in its signature anims, and the camera and press fedora carry the job.
- **arrested_walk and carry_box legs** are the same images on two pages (scuffle and work), so they are stored twice. Aliasing them would force both pages resident together.
- **Upstream bug, not cityfolk:** some townfolk / townfolk2 body frames carry a 2-px sliver at the very top of the frame (rect `oy = 0`, `h = 114`).
  - Affected: `bot_longskirt.main@elder_slim` in 33 townfolk frames (walk_E 5-7, walk_SE 6-7, …), and `wedding_dress.main` / `bot_longskirt.main` in 104 townfolk2 frames.
  - It shows as a short red line floating above a walking elder in a long skirt; it was seen in `cityfolk_phaser.png`.
  - Cityfolk's own atlases have 0 such frames.
  - The fix belongs to the townfolk owners: clear rows 0-1 of those frames or re-trim.
- **`hair_bun.tie`** is never packed in assets/townfolk. It is harmless; the layer is skipped.
- **Elders' mittens in run N** pump in front of the torso and are hidden on half the frames (`HIDDEN_LIMBS`, expected).
- **Round bodies** are stretched slim renders, as in townfolk; their `groundSpeed` in E is scaled to match.
- **Palette:** the red hose still dithers slightly (not visible at 1×), and a few pale tints clamp, as in townfolk.

## Rebuild
The render steps are resumable: only missing layer PNGs render. Run one Blender process at a time with `--threads 2`, and keep ≥ 3 GB RAM free.
1. **Heads:** `/tmp/bvenv/bin/python tools/blender/cf_render.py -- --mode head`
2. **Anim metadata:** `/tmp/bvenv/bin/python tools/blender/cf_render.py -- --mode meta --bases all`. This writes the head offsets, points and the feet tracks behind `groundSpeed`; run it after any anim change.
3. **Bodies:** `/tmp/bvenv/bin/python tools/blender/cf_render.py -- --mode body --pass lower|upper|old --bases child_slim|adult_slim|elder_slim [--anims run,flee,runlegs] [--force]`
4. **Proof renders:** `/tmp/bvenv/bin/python tools/blender/cf_render.py -- --mode full --combos look --out /tmp/fv_cache/cityfolk/look_proof`
5. **Pack:** `python3 tools/blender/cf_pack.py`. The defaults are 50 body colours and 96 head colours; `--colors N`, `--head-colors N` and `--dither D` override them.
6. **Check:** `python3 tools/blender/cf_check.py --dump /tmp/fv_cache/cityfolk/review/cityfolk_cases.json`
7. **Tests:**
   - `node tools/test/cityfolk_phaser.mjs --parity /tmp/fv_cache/cityfolk/review/cityfolk_cases.json`
   - `node tools/test/cityfolk_phaser.mjs --jsgen`
   - `node tools/test/cityfolk_phaser.mjs` (the Phaser scene)
   - `node tools/test/cityfolk_phaser.mjs --incident fire`
8. **Previews:** `python3 tools/blender/cf_preview.py`, which builds jobs, anims, crowd, gifs, proof, polish and lineup; name any subset to build only those.
