# v4.2 officefolk - build report (CONTRACT_V42 section AJ), after polish

The office / bank / depot staff as a townfolk paper-doll fragment: 14 anims, 12 new parts (the contract's 11 + the
tellers' bow tie, see Deviations), 8 presets, 4 atlas pages (9 files). Rendered with Blender 5.2 Cycles (bl_common
camera + light, the townfolk tf_* pipeline), packed as compact `tfatlas` v1 like assets/townfolk, composed by
`tools/officefolk_compose.py` (reference) and `tools/officefolk_compose.js` (game port + the game runtime patch).

The polish pass worked through the critic's findings in `docs/build_reports/v42_officefolk_critique.md` (verdict polish:
0 critical, 3 high, 7 medium, 10 low). Its outcome is in the section "Polish" below. Numbers in this report are after
polish.

| Gate | Result |
|---|---|
| `of_check.py` (v4.2 merge and all-fragments merge) | 0 errors, 0 warnings. New in the polish: points on their items (308 / 308), eased bow / scoop (head steps <= 8 px), office board tip inside `boardRect`, civic bank counter heights |
| Python vs JS parity (500 seeded people x 4 anims, both merges) | 2000 / 2000 draw lists identical (frame, order, z, tint, atlas); 0 pickAnim / canPlay / point / page mismatches |
| JS vs the game runtime `src/core/Townfolk.js` `TF` patched with `installOfficefolkRuntime(TF)` | 2000 / 2000 identical in both merges, office anims included (1333 office-anim cases in v4.2, 1212 in all); `TF.person` 500 / 500 identical people; the 은행장 gets his blazer 62 / 62 (unpatched `TF`: 0) |
| JS vs the unpatched v4 `TF.layersInto` (v4 anims only, for reference) | 667 lists, 0 list mismatches; the atlas differs on 95 layers (v4.2) / 184 (all), the extended layers' old-anim frames. That is why the patch exists |
| `--jsgen` (JS generator, 640 preset people, 3000 random) | 0 promise fails, 0 wardrobe fails, 0 missing core frames (3.6 M layer frames checked), 0 unplayable picks |
| Phaser 3.90 headless, 390 x 844 CSS @ DPR 3: zoom 0.6 / 1.0 / 1.2 office, plaza (only `sack` resident), civic bank at 1.2, all fragments | 6 / 6 runs: 0 missing frames, 0 page errors, 0 404s; 1-2 draw calls / frame, 14-24 texture binds |
| Merging officefolk changes nothing else | 4000 generated people (random + every other preset) identical; 1500 v4-anim draw lists + atlases identical; 0 existing values changed (both merges); 35 old-anim routes added (extended / new layers only) |
| The critic's probes, re-run | `gamepath` (through the game `TF` + `installOfficefolkRuntime`): 11 / 11 cases draw every layer (was: floating heads). `wavehappy`: every preset can wave and be happy, 40 / 40 each (was 0 / 40 for 6 presets). `plaza_picks`: see M1 / M2 |

## Files

- `assets/officefolk/manifest.json` (block `officefolk`) + `of_desk_0`, `of_work_0`, `of_errand_0`, `of_sack_0` (`.png` + `.json`): 9 files
- `tools/blender/of_anim.py` (anims, poses, timelines), `of_parts.py` (12 parts, item placement), `of_presets.py`
  (cover, presets, palettes, promises, page routing), `of_render.py` (Blender passes; `--drop-layers` and tile-change
  cache hygiene), `of_pack.py` (pages + manifest, civic bank counter measurement), `of_check.py` (checks + parity
  dump), `of_preview.py` (previews / GIFs)
- `tools/officefolk_compose.py` (reference compositor), `tools/officefolk_compose.js` (game port: `mergeOfficefolk`,
  `Officefolk`, `OfficefolkSprite`, `applyOfficefolkRules`, `applyForce`, and for the game runtime `layersIntoOF` +
  `installOfficefolkRuntime`)
- `tools/test/officefolk_phaser.mjs` (`--parity` incl. the patched game runtime, `--jsgen`, Phaser phone test with the
  office, plaza and civic bank scenes)
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
| `stamp_stand` | 6 · 8 · loop, impactFrame 3 | S SE E | down -> nod | `held_stamp` | work | impactPoint.stamp_stand, counter |
| `bow` | 6 · 8 · once | S SE E | down -> nod | - | errand | |
| `note` | 4 · 5 · loop | S SE E | down -> nod | `held_notebook` | errand (the aide's frames: sack) | |
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

Torso poses after the polish: `bow` = stand, bend, deep, deep, bend, stand; `scoop` = stand, bend, deep, deep, bend,
stand(jingle). `bend` and `deep` are shared by both anims (adult S head y: -44, -38, -32, -32, -38, -44; 6 px steps).

## New parts

| Part | Family / space | Subs (tint, z) | Ages | Notes |
|---|---|---|---|---|
| `acc_sleeves` | detail / body | R, L (`acc`, follow arm_R / arm_L) | adult | clerk's cuff sleeves, office anims + idle / walk / talk / wave / happy |
| `acc_bell_pin` | detail / body | main (no tint, z 44.6) | adult | gold bell (딸랑이) with a red bow, 1.85x (polish), office anims + carry_sack + the 5 v4 anims |
| `acc_bowtie` (polish) | detail / body | main (`acc2`, z job_detail + 0.5) | adult | the tellers' satin bow tie with pleats and a knot, office anims + the 5 v4 anims |
| `held_receiver` | held / body | main (z 45, zfrontFollow hand_R) | - | black candlestick receiver, 1.45x (polish); desk_phone |
| `held_pen` | held | main | - | quill; desk_write 0-3 |
| `held_stamp` | held | main | - | wooden stamp with a red base, 1.4x (polish); desk_write 4-5, stamp_stand |
| `held_letter` | held | sheet (desk_read), env (file) | - | cream letter / envelope (`onlyAnims` per sub) |
| `held_notebook` | held | book, pencil | - | spiral notebook (not cityfolk `held_notepad`) |
| `held_pointer` | held | main | - | 0.56 m wooden pointer; point_board |
| `held_sack_open` | held | main | - | burlap coin sack held open, coins inside; scoop |
| `held_coins` | held | stack, coin | - | gold coin stack + lifted coin; desk_count |
| `held_sack_shoulder` | held | main (z S/SE/E 45, NE/N 92) | - | burlap sack over the right shoulder with two gold coin emblems (back + camera side); bounces with the walk |

Every new part has `anims` = exactly the anims it has frames in (checked); anim items are tagged `anim_item`.

## Presets (`generator.presets`, townfolk format)

| Preset | Label | Bases | Wardrobe (contract) | Colours | Signature (previews) |
|---|---|---|---|---|---|
| `office_a` | 장부 담당 (셈이) | adult_round | top_cardigan, bot_longskirt, shoe_shoes, acc_glasses_sq, det_lanyard, acc_sleeves, hair_bob | cardigan mustard / sage | desk_write, point_board, desk_count |
| `office_b` | 소식·편지 담당 (소복이) | adult_slim | top_sweater, bot_pants, shoe_boots, acc_scarf, hair_ponytail | sweater rose / sky | desk_type, desk_phone, file |
| `secretary` | 수행비서 (총총이) | adult_slim | top_blazer, det_bow, bot_skirt, bot_tights, shoe_shoes, hair_bun | blazer plum (+ navy); bow gold / pink / red (ivory dropped) | note, hand_over, bow |
| `courier` | 수금원 (딸랑이) | adult_round | top_duffle, bot_pants, shoe_furboots, hat_beanie, acc_satchel, acc_bell_pin | duffle red / green, beanie yellow / navy | carry_sack, scoop, desk_count |
| `teller_a` | 은행 창구 직원 | adult_slim | top_vest, acc_bowtie, bot_pants, shoe_shoes | vest bottle green, bow tie burgundy / red | stamp_stand, hand_over, desk_count |
| `teller_b` | 은행 창구 직원 | adult_round | top_vest, acc_bowtie, bot_skirt, shoe_shoes | vest burgundy, bow tie navy / gold | stamp_stand, bow, hand_over |
| `bank_manager` | 은행장 | elder_round | top_blazer (force), det_tie, bot_pants, shoe_shoes, acc_glasses; `fh_moustache` 60 % | blazer charcoal, pants = blazer | desk_write, desk_read, bow |
| `depot_worker` | 물류창고 직원 | adult_slim / adult_round | top_parka, det_hivis, bot_pants, shoe_boots, hat_beanie | parka slate / olive, beanie orange / navy / orange-red (no yellow) | hand_over, note, bow |

Every preset plays all 13 acting anims + idle / walk / talk / wave / happy (the courier also carry_sack) for 60
generated people in both merges (`of_check`) and 80 in JS (`--jsgen`). The contract wardrobe is worn by every generated
person (0 fails).

## Pages and budgets (RGBA source-sum, MaxRects, 64-colour palette PNG)

| Atlas (page) | Size | MiB (budget) | Rects (+ aliases) | PNG |
|---|---|---|---|---|
| `of_desk_0` (desk: 6 seated anims + the cuff sleeves / manager's blazer in the 5 v4 anims) | 840 x 1304 | 4.18 (6.0) | 1938 (+5860) | 347 KB |
| `of_work_0` (file, point_board, stamp_stand) | 1000 x 808 | 3.08 (4.0) | 1139 (+2397) | 259 KB |
| `of_errand_0` (bow, note, hand_over, scoop) | 680 x 1348 | 3.50 (4.0) | 1343 (+3646) | 288 KB |
| `of_sack_0` (carry_sack + the aide's note + bell pin / aide bow / bow tie / manager tie in the 5 v4 anims) | 936 x 408 | 1.46 (1.5) | 1009 (+81) | 117 KB |
| total | | 12.21 (was 11.55) | 5429 rects, 17413 frame names | payload 1.57 MB, 9 files |

`ofPages.scenes`: office / bank = desk + work + errand + sack; plaza = sack; depot = errand + sack.
`ofPages.resident = 'sack'`; `ofPages.roam.note.adult_slim` lists the layers of the aide's note that live on `sack`
(156 frame names).

## Manifest fields and how the game uses them

- Header `{version 1, fragment "officefolk", extends "townfolk", requires ["townfolk"], mergeAfter [townfolk2, beachfolk, cityfolk]}`.
  Merge with `mergeOfficefolk(mTownfolk, ...optional fragments, mOfficefolk)` (v4.2: `mergeOfficefolk(mTownfolk, mOfficefolk)`),
  then `townfolkPreload` / `townfolkInstall` as for every tfatlas set.
- `anims`, `timeline` (hp / face / brow / zfront per frame), `officefolkAnims`, `animItems`, `animFallback` (contract list).
- `bases[b]` for adult_slim / adult_round / elder_slim / elder_round:
  - `headOffset[anim][dir][i]`; `parts` (adds acc_sleeves / acc_bell_pin / acc_bowtie / det_bow to adults, top_blazer / det_tie to elders);
  - `ofCover[anim]`: body parts rendered for that anim (canPlay); carry_sack = courier wardrobe on adults only;
  - `ofExt[part]`: v4 parts this fragment rendered for a base v4 never packed them for, with the v4 anims they have
    (det_bow on adults, top_blazer / det_tie on elders: idle / walk / talk / wave / happy);
  - `handPoint[dir][i]` (hand_over), `impactPoint[anim][dir]` (desk_write frame 4 / stamp_stand frame 3),
    `sackPoint.scoop[dir][i]` (the open sack mouth) and `sackPoint.carry_sack[dir][i]` (the shoulder sack belly; adults),
    `tipPoint.point_board[dir][i]`: px from the anchor, mirrored dirs negate x (`handPoint()` / `impactPoint()` /
    `sackPoint()` / `tipPoint()`). `of_check` proves each point lies on the item it names on every frame;
  - `groundSpeed.carry_sack[dir]` px/s (adult_slim S 27.1, SE 43.7, E 55.6, NE 44.3, N 28.5; adult_round SE 51.6, E 67.9, NE 52.1);
  - `deskSeat {groundOffsetPx 24.94, deskTopPx -14.96}`: the floor and the desk-top edge relative to the seat anchor.
- `parts` (12), `z`, `tintTable`, `palettes`, `generator.presets` (8, `bank_manager.force = [top_blazer]`).
- `frameAtlas` (only the new parts' layers) + `frameAtlasExt` (one entry per page and per group of anims with the same
  layer map, so `note` routes the aide's layers to `sack` and everyone else's to `errand`; `old: true` entries route
  ONLY the extended layers' v4-anim frames) -> merged `frameAtlasAnim`.
- `ofPages` (groups, scenes, `resident`, `roam`), `seat` (+ `places.office`, `places.bank`), `counter` (polish, below),
  `items` (notes per anim), `merge` (rules), `notes`.
- `counter` (polish H3): `counterTopM` 0.56 (stamp_stand / teller hand_over are acted at that height) and
  `places.bank`, measured on the civic `bank_front` pixels in front of `bank.staffPoints[0..2]`: `counterTopPx` 50
  (range 46-80), `glassTopPx` 76, `liftPx` adult S 27 / SE 27 / E 23, elder S 33 / SE 32 / E 29, band `behind`.

Game recipe (CODE-2, `src/entities/staff/*`):
0. Runtime: after `TF.init(mergeOfficefolk(mTownfolk, mOfficefolk), game)` call
   `installOfficefolkRuntime(TF)` once (from `tools/officefolk_compose.js`; copy it next to `Townfolk.js` if tools/ is
   not shipped). It replaces `TF.layersInto` with `layersIntoOF` (frameAtlasAnim / frameAtlasPose, animItems,
   onlyAnims / noAnims / part anims, cfDrop, hidden head parts, zfrontFollow, the face override) and wraps `TF.person`
   with the preset `force` rule (the manager's blazer). `TF.of` is the `Officefolk` on the same block (pickAnim, pages,
   points). Without it the game draws floating heads in the office anims (critic H1). DollSprite needs no change.
1. Seated anims, office: put the sprite anchor ON `chief_office.deskPoints[i]` (seat front-centre, 0.45 m) in the
   building's `behind` band so `_interior_front` (the desks) draws over the lap; the soft shadow goes to
   `y + deskSeat.groundOffsetPx`. Bank: the 은행장 sits at civic `bank.staffPoints[3]` facing SE, band `behind`, anchor
   at `y - deskSeat.groundOffsetPx` (about 25 px up), shadow on the point (`seat.places.bank`; civic `bank.deskPoint`
   is a customer floor spot facing NW and not a seat). Standing anims: anchor on the feet as usual.
2. Bank tellers (`bank.staffPoints[0..2]`, SW = mirrored SE): draw them `counter.places.bank.liftPx[base].SE` px higher
   (sprite y - liftPx; sort depth unchanged) for every anim they play behind the counter. The stamp then lands 52 px
   and the hands 56 px above the feet, over the 50 px counter top.
3. `new OfficefolkSprite(scene, of, person, x, y)`; `s.has = (a, p) => { const g = of.pageNeeded(p, a); return !g || resident(g); }`;
   `s.play(anim, dir)` picks the fallback when a page or a frame is missing and snaps dirs the anim lacks (file NE / N / NW;
   hand_over SE / E / NE + mirrors). `pageNeeded` is per person (the aide's note is on `sack`). A v4 anim whose only
   missing page holds the person's extended layers is played without them (the manager idles in shirt and tie on the
   plaza instead of walking in place). `bow` and `hand_over` play once, hold the last frame and call `s.onDone(anim)`.
4. desk_write / stamp_stand: on `frame === anims[a].impactFrame` play `sfx_stamp` + a puff at `impactPoint`.
   hand_over: fly the real item (`item_coin_sack_*`, `item_letter_bundle`, receipt) from `handPoint(dir, 3)`.
   scoop / carry_sack: coin hops target `sackPoint(anim, dir, i)`. The courier moves at `groundSpeed('carry_sack', dir)`,
   or plays at `timeScale = clamp(speed / groundSpeed, 0.8, 1.8)` (TownSim style) so the feet do not skate.
   point_board: chalk / highlight at `tipPoint(dir, i)` on the board bar (inside `boardRect` at the office board).
5. Pages: office / bank load desk + work + errand + sack; keep `sack` resident wherever staff can be seen (plaza
   included). The cuff sleeves and the manager's blazer in the v4 anims are office wear on `desk`: off that page they
   are simply not drawn.

## Placeholders replaced (plan section 16.1 / 6.4: CODE-1 fallback in brackets -> officefolk key)

| Staff (STAFF_PRESET role) | CODE-1 | officefolk |
|---|---|---|
| 셈이 `sem` (office_a) | desk work [idle], board [talk] | `desk_write` (+ impactPoint stamp on frame 4), `point_board` (+ tipPoint), `desk_count` |
| 소복이 `bok` (office_b) | typing [idle], pigeonholes [idle facing NE], phone [talk] | `desk_type`, `file` (NE / N / NW), `desk_phone` |
| 총총이 `chong` (secretary) | notes [idle], news to the chief [talk], sits [idle] | `note` (everywhere, plaza included), `hand_over` (+ handPoint), `sit_idle`, `bow` |
| 딸랑이 `ttal` (courier) | [walk + `item_coin_sack_s/m/l` head-carried], pads [happy], bank counter [talk], corner [idle] | `carry_sack` (shoulder sack, groundSpeed), `scoop` (+ sackPoint; on the plaza: `happy`), `hand_over`, `desk_count` |
| tellers `teller0` / `teller1` | counter [idle / talk] | `stamp_stand` (impactFrame 3 -> sfx_stamp, lifted at the counter), `hand_over`, `desk_count` |
| 은행장 `manager` | seated [idle] | `desk_write`, `desk_read` at `staffPoints[3]`, `bow` |
| depot workers `depot` | idle / talk | unchanged anims available + `note`, `hand_over`, `bow` |
| looks | code presets `src/data/staffLooks.js` via `TF.addPresets()` | manifest presets of the same 8 names (addPresets is merge-only: the manifest wins) |
| head pose `down` | - | `nod` until townfolk2 is loaded (headPoseFallback) |

## Polish (critique `v42_officefolk_critique.md`)

Every finding was reproduced with the critic's own probes and pixel tools before it was fixed. Re-rendered: the torso
pass (new `bend` / `deep` poses, the bow tie, the bigger bell), the acting pass of bow, scoop, stamp_stand, desk_write,
desk_phone, point_board (both render bases), the carry_sack walk pass, the old-anim pass (wave / happy, bow tie) and
meta. Everything else came from the cache (`/tmp/fv_cache/officefolk`, pre-polish copy in `prepolish/`).

| Finding | Status | What changed / why not |
|---|---|---|
| H1 game runtime cannot draw officefolk | fixed (officefolk side) | `layersIntoOF` + `installOfficefolkRuntime(TF)` in `officefolk_compose.js`; `--parity` now also runs the real `src/core/Townfolk.js` `TF` with the patch: 2000 / 2000 identical incl. office anims, `TF.person` force rule (manager blazer 62 / 62). The one-line install call in the game is CODE-2's |
| H2 `sackPoint.scoop` on the hat | fixed | `place_items4` assigns the shoulder-sack point only when that sack is shown; the scoop point sits just inside the open mouth. New check "points on their items" (hand 6 px, impact / tip 3 px, sack 4 px): 308 / 308 |
| H3 tellers' acting hidden under the bank counter | fixed (officefolk side) | stamp_stand / teller hand_over acted at a 0.56 m counter (elders 0.45 m) with the bigger stamp; manifest `counter.places.bank` measured from civic `bank_front` (top 50 px, glass to 76 px) with `liftPx`; check: lifted stamp 52 px, hands 56 px above the feet. Still open, civic side: the glass partitions veil the lifted faces a little (lighter glass or a separate glass layer) |
| M1 roaming acts lost on the plaza | partly fixed | The aide's `note` frames (her wardrobe + adult limbs + notebook, 156 names) moved to the resident `sack` page: she takes notes on the plaza. wave / happy rendered for every extended layer, so the contract fallbacks now play for all 8 presets (40 / 40 each). The courier's `scoop` on the plaza plays its contract fallback `happy` (with the bell), the aide's `hand_over` plays `talk`: their frames (+0.27 / +0.13 MiB) do not fit the 1.5 MiB `sack` cap (now 1.46). If the real scoop is wanted at plaza pads, the lead can load `errand` near the pads or amend the cap |
| M2 manager off the bank page | fixed | `pickAnim` keeps a v4 anim when only the extended layers' page is missing: on the plaza the 은행장 idles (no walking in place) in shirt and tie (tie on `sack`); the blazer stays on `desk` (office wear). `plaza_picks`: manager walk / idle / bow -> wave |
| M3 no valid seat for the 은행장 | fixed | `seat.places.bank` (staffPoints[3], SE, behind, anchor y - deskSeat.groundOffsetPx) + recipe line + `officefolk_bank.png`; plan section 6.4 still names `deskPoint` (lead to correct) |
| M4 pointer misses the office board | fixed | `point_board` NE re-posed: steeper, inward stick; at the office `boardPoint` / `boardDir` the tip is at board-local x 21..29 (half width 42.5) on all 6 frames; new cross-set check reads `assets/office/manifest.json` |
| M5 shoulder sack unreadable from the front, one size | mostly fixed | The sack hangs outboard of the right shoulder, turned toward the camera, with a second coin emblem on the camera side; in S the fist rests on the shoulder (no more "wave"). Three sizes: won't fix (each size = another 40-frame layer on a page at 1.46 / 1.5 MiB); the value reads through the coin hops / jingle and `item_coin_sack_s/m/l` flown at the counter |
| M6 invisible bow tie | fixed | New part `acc_bowtie` (tint `acc2`) in the teller presets: burgundy / red on the green vest, navy / gold on the burgundy vest. The aide's ivory bow dropped (gold / pink / red) |
| M7 bow / scoop snap | fixed | in-between `bend` pose shared by bow and scoop; head steps 6 px (was 12-13 px); scoop dip held 2 frames; check: steps <= 8 px |
| L1 props too small | fixed | receiver 1.45x, stamp 1.4x, bell pin 1.85x (previews `officefolk_before_after.png`) |
| L2 arms over long hair in front views | won't fix | needs a per-frame z split of upper arm vs forearm (timeline rule + re-render of every acting anim); same rule as the townfolk acting sets; visible only from zoom 1.2 |
| L3 holes in seated shoes | won't fix | the open mouth of the v4 `shoe_shoes` (also in townfolk idle S); the desks cover the feet wherever seated anims are placed. A pack-time hole fill was measured and rejected: the regions enclosed by shoe + pants also include the real gap between the legs (11-30 px). The robust fix is a sock fill in the townfolk shoe part |
| L4 courier speed vs stride | fixed (recipe) | `items.carry_sack` + recipe: timeScale = clamp(speed / groundSpeed, 0.8, 1.8); the `BALANCE` speed is CODE's |
| L5 v4.2 heads look forward | won't fix | by design: `down -> nod` in v4.2; `down` returns with townfolk2 |
| L6 undeclared head-pose deviation | fixed | listed under Deviations |
| L7 office / bank view memory | reported | officefolk adds 12.21 MiB in the office / bank views (plan section 13.2 estimated about 8). The lead should re-measure the <= 345 gate |
| L8 manager a grey ball from the side | fixed | `fh_moustache` only (60 %), no full beard |
| L9 courier vs depot worker | fixed | depot beanie orange / navy / orange-red (no yellow) |
| L10 elder hand_over NE | documented | mittens behind the body on frames 0-1 / 4-5; the NE hand tolerance is 6 + 5 px |
| (seen in passing) office desk 0 cuts the head at desk 2 | not this set | office set (`_interior_front`) |

## Deviations from the contract

- 12 parts instead of 11: `acc_bowtie` replaces `det_bow` in the teller presets (critic M6; `det_bow` shares the
  shirt's tint slot `top2`). Needs a one-line contract note.
- `point_board` NE / N and `hand_over` NE use head pose `loco` where the contract says `soc`: `soc` has no NE / N head
  frames (no new head art allowed).
- The aide's `note` frames live on `sack`, not `errand` (critic M1; routing is per layer in `frameAtlasExt`, the anim's
  group is still `errand`).

## Previews (docs/previews, all looked at)

- `officefolk_lineup.png`: the 8 presets (ko / en labels): idle S, walk SE, signature, idle N, + phone zoom 0.6 / 1.0
- `officefolk_anims.png`: 14 anims x 8 presets contact sheet (carry_sack -> walk fallback marked on non-couriers)
- `officefolk_<anim>.gif` x 14: each anim on the 8 presets at its fps
- `officefolk_signature.png/.gif`: each preset doing its 3 signature anims (seated ones on a stool at the seat anchor)
- `officefolk_dirs.png`: every anim x dir x frame (review sheet)
- `officefolk_desk_row.png/.gif`: seated row behind a desk mock (legs hidden) + without the desk, seat anchor / desk-top / floor marked
- `officefolk_office.png/.gif`, `officefolk_office_2x.png`: the real assets/office building (revealed cut state) with the clerks at deskPoints, the board and the door
- `officefolk_courier_walk.gif` (loop at groundSpeed, feet planted), `officefolk_courier_dirs.gif` (8 dirs)
- (polish) `officefolk_points.png`: every point drawn on its frames (scoop mouth, carry_sack sack, hand_over hands,
  stamp impact, pointer tip); `officefolk_bank.png/.gif`: the civic bank with the tellers lifted at the counter, the
  manager seated at staffPoints[3], the courier at the counter; `officefolk_before_after.png`: pre-polish vs now
  (eased bow / scoop, sack from the front, bow tie, bigger bell / stamp / receiver)
- `officefolk_phone_z06.png`, `_z10.png`, `_z12.png` (Phaser, v4.2 merge next to random v4 townsfolk and the office),
  `_plaza.png` (only `sack` resident: fallbacks labelled), `_bank.png` (civic bank, zoom 1.2), `_all.png` (every fragment + officefolk)

At zoom 0.6 on a 390 px phone (0.325 CSS px / world px, 0.975 device px) the presets read by silhouette and colour:
yellow-beanie courier with the sack (now visible from every side), plum aide, green / burgundy tellers with a red or
navy bow tie, grey elder manager with glasses and moustache, orange-hi-vis depot worker.

## Known issues

1. The game must call `installOfficefolkRuntime(TF)` (recipe step 0) and apply the teller lift (step 2); both are CODE-2
   lines outside this job's paths.
2. Bank glass: the civic `bank_front` glass partitions (to 76 px above the teller's feet) veil the lifted tellers' faces
   a little. Civic-side fix (lighter glass, or the glass as its own layer drawn under the tellers).
3. On the plaza the courier's `scoop` plays `happy` and the aide's `hand_over` plays `talk` (contract fallbacks; `sack`
   page budget). See M1.
4. `top_blazer` (v4 part) carries its untinted school crest sub; on the aide and the manager it reads as a pocket badge.
5. `desk_count` E: the coins are hidden by the head on elders (0 / 6 frames) and visible on the lift frames for adults;
   back views hide items in parts of `file N` and `point_board N` (intended); the elder stamp in stamp_stand E is
   visible on 5 / 6 frames. Far-side mittens are hidden in side views (36 limb rows, listed by the check).
6. Seated chibi legs do not reach the floor (feet +13..+19 px below the seat anchor, floor at +25 px), and `shoe_shoes`
   shows its open mouth (L3); the desk hides both.
7. The shoulder sack has one size (M5).
8. Adults rendered with `det_tie` in office anims (cover) have `ofExt.det_tie = []`; no preset gives adults a tie, but a
   future one would be limited to the office anims.
9. Random townsfolk can play the office anims only when they wear cover parts (about 33 %, children never: no child
   bases); carry_sack only the courier wardrobe. Office anims are meant for the presets.
10. Memory: 12.21 MiB for all four pages in the office / bank views, 1.46 MiB on the plaza (L7).
11. Headless Phaser frame times (325-515 ms) are SwiftShader software GL at 1170 x 2532 and not representative; the
    batching numbers (1-2 draw calls, 14-24 binds / frame for about 400 layer sprites) are.

## Rebuild

```
# renders (resumable, one Blender process at a time; cache /tmp/fv_cache/officefolk; --drop-layers re-renders single layers)
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
nice -n 10 python3 tools/blender/of_preview.py      # OF_BEFORE=<pre-polish assets/officefolk> for before_after
```
