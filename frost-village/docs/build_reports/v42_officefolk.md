# v4.2 officefolk - build report (CONTRACT_V42 section AJ)

The office / bank / depot staff as a townfolk paper-doll fragment: 14 anims, 11 new parts, 8 presets, 4 atlas pages
(9 files). Rendered with Blender 5.2 Cycles (bl_common camera + light, the townfolk tf_* pipeline), packed as compact
`tfatlas` v1 like assets/townfolk, composed by `tools/officefolk_compose.py` (reference) and
`tools/officefolk_compose.js` (game port).

| Gate | Result |
|---|---|
| `of_check.py` (v4.2 merge and all-fragments merge) | 0 errors, 0 warnings |
| Python vs JS parity (500 seeded people x 4 anims, both merges) | 2000 / 2000 draw lists identical (frame, order, z, tint, atlas); 0 pickAnim / canPlay / point / page mismatches |
| JS vs game runtime `src/core/Townfolk.js` `TF.layersInto` (v4 anims) | 630 / 630 (v4.2) and 505 / 505 (all) lists identical in frames, order, z, tints; atlas differs on 132 / 207 layers (see Known issues, item 1) |
| `--jsgen` (JS generator, 640 preset people, 3000 random) | 0 promise fails, 0 wardrobe fails, 0 missing core frames (3.3 M layer frames checked), 0 unplayable picks |
| Phaser 3.90 headless, 390 x 844 CSS @ DPR 3, zoom 0.6 / 1.0 / 1.2, plaza residency, all fragments | 5 / 5 runs: 0 missing frames, 0 page errors, 0 404s; 2 draw calls / frame, 14-18 texture binds |
| Merging officefolk changes nothing else | 4000 generated people (random + every other preset) identical; 1500 v4-anim draw lists + atlases identical; 0 existing values changed (both merges) |

## Files

- `assets/officefolk/manifest.json` (block `officefolk`) + `of_desk_0`, `of_work_0`, `of_errand_0`, `of_sack_0` (`.png` + `.json`): 9 files
- `tools/blender/of_anim.py` (anims, poses, timelines), `of_parts.py` (11 parts, item placement), `of_presets.py`
  (cover, presets, palettes, promises), `of_render.py` (Blender passes), `of_pack.py` (pages + manifest),
  `of_check.py` (checks + parity dump), `of_preview.py` (previews / GIFs)
- `tools/officefolk_compose.py` (reference compositor), `tools/officefolk_compose.js` (game port: `mergeOfficefolk`,
  `Officefolk`, `OfficefolkSprite`, `applyOfficefolkRules`, `applyForce`)
- `tools/test/officefolk_phaser.mjs` (`--parity`, `--jsgen`, Phaser phone test)
- `docs/previews/officefolk_*` (listed below), this report

## Anims (all 128 x 128, anchor [0.5, 0.8125]; dirs + mirrors SW / W / NW)

| Anim | Frames · fps · repeat | Dirs | Head pose (v4.2 merge) | Items (animItems) | Page | Points |
|---|---|---|---|---|---|---|
| `sit_idle` | 4 · 4 · loop | S SE E | soc | - | desk | deskSeat |
| `desk_type` | 6 · 10 · loop | S SE E | down -> nod | - (typewriter = building overlay) | desk | deskSeat |
| `desk_write` | 6 · 8 · loop, impactFrame 4 | S SE E | down -> nod | `held_pen` 0-3, `held_stamp` 4-5 | desk | impactPoint.desk_write |
| `desk_phone` | 4 · 5 · loop | S SE E | soc | `held_receiver` | desk | |
| `desk_read` | 4 · 4 · loop | S SE E | down -> nod | `held_letter` (sheet) | desk | |
| `desk_count` | 6 · 8 · loop | S SE E | down -> nod | `held_coins` | desk | |
| `file` | 6 · 8 · loop | NE N | loco | `held_letter` (envelope) | work | |
| `point_board` | 6 · 8 · loop | NE N E | soc (NE / N: loco) | `held_pointer` | work | tipPoint |
| `stamp_stand` | 6 · 8 · loop, impactFrame 3 | S SE E | down -> nod | `held_stamp` | work | impactPoint.stamp_stand |
| `bow` | 6 · 8 · once | S SE E | down -> nod | - | errand | |
| `note` | 4 · 5 · loop | S SE E | down -> nod | `held_notebook` | errand | |
| `hand_over` | 6 · 9 · once | NE E SE | soc (NE: loco) | - (game flies the real item) | errand | handPoint[dir][i] |
| `scoop` | 6 · 9 · loop | S SE E | down -> nod | `held_sack_open` | errand | sackPoint.scoop |
| `carry_sack` | 8 · 12 · loop (walk) | S SE E NE N | loco | `held_sack_shoulder` | sack | sackPoint.carry_sack, groundSpeed |

Head poses: no new head art. `down` is townfolk2's; `headPoseFallback {down: nod}` makes the v4.2 merge (no townfolk2)
use `nod` (132 of 244 timeline frames; soc 42, loco 70); faces on those frames are neutral / blink / smile only, which
exist on both poses. With townfolk2 merged the frames keep `down`.

Acting technique (texture memory): garments / legs / shoes / bags are rendered once per (torso key, dir) and shared by
every frame with that torso pose (aliases); the arms, mittens, cuff sleeves and items are rendered per frame and drawn
above the garments and head stack in the front views (timeline `zfront` lists all four limbs in S / SE / E, none in
NE / N), cut wherever the body or head hides them. carry_sack is a normal per-frame walk render.

## New parts

| Part | Family / space | Subs (tint, z) | Ages | Notes |
|---|---|---|---|---|
| `acc_sleeves` | detail / body | R, L (`acc`, follow arm_R / arm_L) | adult | clerk's cuff sleeves, rendered in the office anims + idle / walk / talk |
| `acc_bell_pin` | detail / body | main (no tint, z 44.6) | adult | small gold bell (딸랑이), office anims + carry_sack + idle / walk / talk |
| `held_receiver` | held / body | main (z 45, zfrontFollow hand_R) | - | black candlestick receiver, no cord; desk_phone |
| `held_pen` | held | main | - | quill; desk_write 0-3 |
| `held_stamp` | held | main | - | wooden stamp, red base; desk_write 4-5, stamp_stand |
| `held_letter` | held | sheet (desk_read), env (file) | - | cream letter / envelope (`onlyAnims` per sub) |
| `held_notebook` | held | book, pencil | - | spiral notebook (not cityfolk `held_notepad`) |
| `held_pointer` | held | main | - | 0.56 m wooden pointer; point_board |
| `held_sack_open` | held | main | - | burlap coin sack held open; scoop |
| `held_coins` | held | stack, coin | - | gold coin stack + lifted coin; desk_count |
| `held_sack_shoulder` | held | main (z S/SE/E 45, NE/N 92) | - | burlap sack with a gold coin emblem over the right shoulder, bounces with the walk |

Every new part has `anims` = exactly the anims it has frames in (checked); anim items are tagged `anim_item`.

## Presets (`generator.presets`, townfolk format)

| Preset | Label | Bases | Wardrobe (contract) | Colours | Signature (previews) |
|---|---|---|---|---|---|
| `office_a` | 장부 담당 (셈이) | adult_round | top_cardigan, bot_longskirt, shoe_shoes, acc_glasses_sq, det_lanyard, acc_sleeves, hair_bob | cardigan mustard / sage | desk_write, point_board, desk_count |
| `office_b` | 소식·편지 담당 (소복이) | adult_slim | top_sweater, bot_pants, shoe_boots, acc_scarf, hair_ponytail | sweater rose / sky | desk_type, desk_phone, file |
| `secretary` | 수행비서 (총총이) | adult_slim | top_blazer, det_bow, bot_skirt, bot_tights, shoe_shoes, hair_bun | blazer plum (+ navy), gold / ivory bow | note, hand_over, bow |
| `courier` | 수금원 (딸랑이) | adult_round | top_duffle, bot_pants, shoe_furboots, hat_beanie, acc_satchel, acc_bell_pin | duffle red / green, beanie yellow / navy | carry_sack, scoop, desk_count |
| `teller_a` | 은행 창구 직원 | adult_slim | top_vest, det_bow, bot_pants, shoe_shoes | vest bottle green | stamp_stand, hand_over, desk_count |
| `teller_b` | 은행 창구 직원 | adult_round | top_vest, det_bow, bot_skirt, shoe_shoes | vest burgundy | stamp_stand, bow, hand_over |
| `bank_manager` | 은행장 | elder_round | top_blazer (force), det_tie, bot_pants, shoe_shoes, acc_glasses | blazer charcoal, pants = blazer | desk_write, desk_read, bow |
| `depot_worker` | 물류창고 직원 | adult_slim / adult_round | top_parka, det_hivis, bot_pants, shoe_boots, hat_beanie | parka slate / olive | hand_over, note, bow |

Every preset plays all 13 acting anims + idle / walk / talk (office_b and depot_worker also wave / happy; the courier
also carry_sack) for 60 generated people in both merges (`of_check`) and 80 in JS (`--jsgen`). The contract wardrobe
is worn by every generated person (0 fails).

## Pages and budgets (RGBA source-sum, MaxRects, 64-colour palette PNG)

| Atlas (page) | Size | MiB (budget) | Rects (+ aliases) | PNG |
|---|---|---|---|---|
| `of_desk_0` (desk: 6 seated anims + the manager's blazer / tie in idle / walk / talk) | 704 x 1368 | 3.67 (6.0) | 1667 (+5782) | 308 KB |
| `of_work_0` (file, point_board, stamp_stand) | 640 x 1268 | 3.10 (4.0) | 1141 (+2365) | 266 KB |
| `of_errand_0` (bow, note, hand_over, scoop) | 856 x 1076 | 3.51 (4.0) | 1390 (+3704) | 293 KB |
| `of_sack_0` (carry_sack + bow / sleeves / bell pin in idle / walk / talk) | 744 x 448 | 1.27 (1.5) | 784 | 102 KB |
| total | | 11.55 | 4982 rects, 16833 frame names | payload 1.50 MB, 9 files |

`ofPages.scenes`: office / bank = desk + work + errand + sack; plaza = sack; depot = errand + sack.

## Manifest fields and how the game uses them

- Header `{version 1, fragment "officefolk", extends "townfolk", requires ["townfolk"], mergeAfter [townfolk2, beachfolk, cityfolk]}`.
  Merge with `mergeOfficefolk(mTownfolk, ...optional fragments, mOfficefolk)` (v4.2: `mergeOfficefolk(mTownfolk, mOfficefolk)`),
  then `townfolkPreload` / `townfolkInstall` as for every tfatlas set.
- `anims`, `timeline` (hp / face / brow / zfront per frame), `officefolkAnims`, `animItems`, `animFallback` (contract list).
- `bases[b]` for adult_slim / adult_round / elder_slim / elder_round:
  - `headOffset[anim][dir][i]`; `parts` (adds acc_sleeves / acc_bell_pin / det_bow to adults, top_blazer / det_tie to elders);
  - `ofCover[anim]`: body parts rendered for that anim (canPlay); carry_sack = courier wardrobe on adults only;
  - `ofExt[part]`: v4 parts this fragment rendered for a base v4 never packed them for, with the v4 anims they have
    (det_bow on adults, top_blazer / det_tie on elders: idle / walk / talk); such a person plays only those + the office anims;
  - `handPoint[dir][i]` (hand_over), `impactPoint[anim][dir]` (desk_write frame 4 / stamp_stand frame 3),
    `sackPoint.scoop[dir][i]` (sack mouth) and `sackPoint.carry_sack[dir][i]` (adults), `tipPoint.point_board[dir][i]`:
    px from the anchor, mirrored dirs negate x (`handPoint()` / `impactPoint()` / `sackPoint()` / `tipPoint()`);
  - `groundSpeed.carry_sack[dir]` px/s (adult_slim S 27.1, SE 43.7, E 55.6, NE 44.3, N 28.5; adult_round SE 51.6, E 67.9):
    move the courier at this speed (or scale the fps) so the feet stay planted;
  - `deskSeat {groundOffsetPx 24.94, deskTopPx -14.96}`: the floor and the desk-top edge relative to the seat anchor.
- `parts` (11), `z` (`of_item` 45, `of_pin` 44.6, `of_sack_shoulder`), `tintTable` (precomputed preset colours),
  `palettes` (cardigan_office, sweater_office, blazer_aide, duffle_courier, vest_teller_g / _r, blazer_bank, parka_depot,
  hivis_depot, shirt_office, sleeves_office), `generator.presets` (8, `bank_manager.force = [top_blazer]`).
- `frameAtlas` (only the 26 layers of the new parts) + `frameAtlasExt` (per page: the page's anims -> every layer it
  holds; plus `old: true` entries routing ONLY the extended layers' idle / walk / talk frames) -> merged `frameAtlasAnim`.
- `ofPages` (groups, scenes), `seat` (seated convention), `items` (notes per anim), `merge` (rules), `notes`.

Game recipe (CODE-2, `src/entities/staff/*`):
1. Seated anims: put the sprite anchor ON the office `deskPoints[i]` (seat front-centre, 0.45 m) in the building's
   `behind` band so `_interior_front` (the desks) draws over the lap; the soft shadow goes to `y + deskSeat.groundOffsetPx`.
   Standing anims: anchor on the feet as usual.
2. `new OfficefolkSprite(scene, of, person, x, y)`; `s.has = (a, p) => resident(of.pageNeeded(p, a))`; `s.play(anim, dir)`
   picks the fallback when a page or a frame is missing and snaps dirs the anim lacks (file NE / N / NW; hand_over
   SE / E / NE + mirrors). `bow` and `hand_over` play once, hold the last frame and call `s.onDone(anim)`; `s.replay()`.
3. desk_write / stamp_stand: on `frame === anims[a].impactFrame` play `sfx_stamp` + a puff at `impactPoint`.
   hand_over: fly the real item (`item_coin_sack_*`, `item_letter_bundle`, receipt) from `handPoint(dir, 3)`.
   scoop / carry_sack: coin hops target `sackPoint(anim, dir, i)`; the courier moves at `groundSpeed('carry_sack', dir)`.
   point_board: chalk / highlight at `tipPoint(dir, i)` on the board bar.
4. Pages: office / bank load desk + work + errand + sack; keep `sack` resident wherever the courier or the aide walk
   (it holds their bell pin / bow / cuff-sleeve idle / walk / talk frames); the manager's blazer / tie idle / walk /
   talk frames are on `desk` (the bank loads it).

## Placeholders replaced (plan section 16.1 / 6.4: CODE-1 fallback in brackets -> officefolk key)

| Staff (STAFF_PRESET role) | CODE-1 | officefolk |
|---|---|---|
| 셈이 `sem` (office_a) | desk work [idle], board [talk] | `desk_write` (+ impactPoint stamp on frame 4), `point_board` (+ tipPoint), `desk_count` |
| 소복이 `bok` (office_b) | typing [idle], pigeonholes [idle facing NE], phone [talk] | `desk_type`, `file` (NE / N / NW), `desk_phone` |
| 총총이 `chong` (secretary) | notes [idle], news to the chief [talk], sits [idle] | `note`, `hand_over` (+ handPoint), `sit_idle`, `bow` |
| 딸랑이 `ttal` (courier) | [walk + `item_coin_sack_s/m/l` head-carried], pads [happy], bank counter [talk], corner [idle] | `carry_sack` (shoulder sack, groundSpeed), `scoop` (+ sackPoint), `hand_over`, `desk_count` |
| tellers `teller0` / `teller1` | counter [idle / talk] | `stamp_stand` (impactFrame 3 -> sfx_stamp), `hand_over`, `desk_count` |
| 은행장 `manager` | seated [idle] | `desk_write`, `desk_read`, `bow` |
| depot workers `depot` | idle / talk | unchanged anims available + `note`, `hand_over`, `bow` |
| looks | code presets `src/data/staffLooks.js` via `TF.addPresets()` | manifest presets of the same 8 names (addPresets is merge-only: the manifest wins) |
| head pose `down` | - | `nod` until townfolk2 is loaded (headPoseFallback) |

## Merge compatibility (fixed during this build)

- `palettes.shirt_pale` collided with cityfolk -> renamed `shirt_office`.
- `frameAtlas` owned `bot_skirt.tights@adult_slim / elder_slim`, which townfolk2 owns -> `frameAtlas` now holds only
  new-part layers; everything else routes through `frameAtlasExt`.
- The first pack listed idle / walk / talk on whole-page `frameAtlasExt` entries, which re-routed every adult's
  townfolk limbs and garments in idle to officefolk pages (frames missing there). Old anims now get separate entries
  with only the 8 extended layers (check: "officefolk adds 24 old-anim routes, changes 0 existing values").
- `bases[b].seat` would have overwritten townfolk2's sit `seat.groundOffsetPx` -> renamed `deskSeat`.
- Elders no longer carry carry_sack `groundSpeed` / `sackPoint` (no frames).

## Previews (docs/previews, all looked at)

- `officefolk_lineup.png`: the 8 presets (ko / en labels): idle S, walk SE, signature, idle N, + phone zoom 0.6 / 1.0
- `officefolk_anims.png`: 14 anims x 8 presets contact sheet (carry_sack -> walk fallback marked on non-couriers)
- `officefolk_<anim>.gif` x 14: each anim on the 8 presets at its fps
- `officefolk_signature.png/.gif`: each preset doing its 3 signature anims (seated ones on a stool at the seat anchor)
- `officefolk_dirs.png`: every anim x dir x frame (review sheet)
- `officefolk_desk_row.png/.gif`: seated row behind a desk mock (legs hidden) + without the desk, seat anchor / desk-top / floor marked
- `officefolk_office.png/.gif`, `officefolk_office_2x.png`: the real assets/office building (revealed cut state) with the clerks at deskPoints, the board and the door
- `officefolk_courier_walk.gif` (loop at groundSpeed, feet planted), `officefolk_courier_dirs.gif` (8 dirs)
- `officefolk_phone_z06.png`, `_z10.png`, `_z12.png` (Phaser, v4.2 merge next to random v4 townsfolk and the office),
  `_plaza.png` (only `sack` resident: fallbacks labelled), `_all.png` (every fragment + officefolk)

At zoom 0.6 on a 390 px phone (0.325 CSS px / world px, 0.975 device px) the presets read by silhouette and colour:
yellow-beanie courier with the sack, plum aide, green / burgundy tellers, grey elder manager, orange-hi-vis depot worker.

## Known issues

1. Game runtime atlas lookup: `src/core/Townfolk.js` `TF.layersInto` reads `frameAtlas` only. For officefolk anims and
   for the extended layers in idle / walk / talk the atlas must come from `frameAtlasAnim[anim][layer@base]` first
   (as `cityfolk_compose.js` does: `(T.frameAtlasAnim[anim] || {})[L] || T.frameAtlas[L]`), and the fragment rules
   (anim items, `onlyAnims`, part `anims`) apply. CODE-2's `TF.mergeFragment` must add both (or draw staff with
   `OfficefolkSprite`). The parity test counts the layers this affects.
2. The bank manager's blazer / tie idle / walk / talk frames live on `desk`; with only `sack` resident (plaza) he falls
   back and is drawn without them (visible in `officefolk_phone_plaza.png`). Keep `desk` resident where he walks.
3. Tellers: `det_bow` and the `top_vest` shirt share the v4 tint slot `top2`, so the bow is the shirt colour and reads
   only as a faint outline. v4 part definitions cannot change in a fragment.
4. `top_blazer` (v4 part) carries its untinted school crest sub; on the aide and the manager it reads as a pocket badge.
5. `desk_count` E: the coins are hidden by the head on elders (0 / 6 frames) and visible on the lift frames 1 and 4 for
   adults; back views hide items in parts of `file N` and `point_board N` (intended). Far-side mittens are hidden in
   side views (35 limb rows, listed by the check).
6. Seated chibi legs do not reach the floor (feet +13..+19 px below the seat anchor, floor at +25 px); the desk hides it.
7. The shoulder sack has one size; sack value can still be shown by the coin hops / jingle or the item flown at the
   counter (`item_coin_sack_s/m/l` remain the CODE-1 fallback and the hand_over flight).
8. Adults rendered with `det_tie` in office anims (cover) have `ofExt.det_tie = []`; no preset gives adults a tie, but a
   future one would be limited to the office anims.
9. Random townsfolk can play the office anims only when they wear cover parts (about 33 %, children never: no child
   bases); carry_sack only the courier wardrobe. Office anims are meant for the presets.
10. Headless Phaser frame times (350-1270 ms) are SwiftShader software GL at 1188 x 2571 and not representative; the
    batching numbers (2 draw calls, 14-18 binds / frame for about 400 layer sprites) are.

## Rebuild

```
# renders (resumable, one Blender process at a time; cache /tmp/fv_cache/officefolk)
nice -n 10 /tmp/bvenv/bin/python tools/blender/of_render.py -- --mode body --pass torso --bases adult_slim,elder_slim
nice -n 10 /tmp/bvenv/bin/python tools/blender/of_render.py -- --mode body --pass act   --bases adult_slim,elder_slim
nice -n 10 /tmp/bvenv/bin/python tools/blender/of_render.py -- --mode body --pass walk  --bases adult_slim
nice -n 10 /tmp/bvenv/bin/python tools/blender/of_render.py -- --mode body --pass old   --bases adult_slim,elder_slim
nice -n 10 /tmp/bvenv/bin/python tools/blender/of_render.py -- --mode meta --bases all
# pack + check + parity + tests + previews
nice -n 10 python3 tools/blender/of_pack.py
nice -n 10 python3 tools/blender/of_check.py --dump /tmp/fv_cache/officefolk/review/officefolk_cases.json
nice -n 10 python3 tools/blender/of_check.py --fragments all --dump /tmp/fv_cache/officefolk/review/officefolk_cases_all.json
node tools/test/officefolk_phaser.mjs --parity /tmp/fv_cache/officefolk/review/officefolk_cases.json
node tools/test/officefolk_phaser.mjs --parity /tmp/fv_cache/officefolk/review/officefolk_cases_all.json
node tools/test/officefolk_phaser.mjs --jsgen
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/test/officefolk_phaser.mjs
nice -n 10 python3 tools/blender/of_preview.py
```
