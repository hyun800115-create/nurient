# 금방 crew (geumbangfolk) - build report (CONTRACT_GEUMBANG section AP + AS)

The 금방 delivery crew as a townfolk paper-doll fragment: drivers, riders, the night driver, the depot pickers /
packers / dockhand and the team lead 방금순. 6 new anims, 6 new parts, 7 presets, 2 atlas pages (5 files). Rendered
with Blender 5.2 Cycles (the townfolk tf_* pipeline + the officefolk acting technique), packed as compact `tfatlas` v1
like assets/townfolk, composed by `tools/geumbangfolk_compose.py` (reference) and `tools/geumbangfolk_compose.js` (game
port + the game-runtime patch). The brand is original: a honey-gold puffer with a cream collar and chest band, the
symmetric 금방이 mark (gold disc, cream face-on parcel; the same texture the 금방 van / hub job uses), charcoal + navy
accents. No rocket, wings, bird, arrow-smile, lightning or cat; no letters anywhere in this set; no real company's
logo, colours, mascot or slogan (the plan 7.4 colour-pair test runs on every preset).

| Gate | Result |
|---|---|
| `gbf_check.py` (bare = townfolk + geumbangfolk, v4.3 = + officefolk, all = every fragment present) | 0 errors, 0 warnings in all three |
| Merging geumbangfolk changes nothing else | 4000 generated people (random + every other preset) identical; 1500 / 1500 v4-anim draw lists + atlases identical; 0 existing values changed; 0 wrong atlas lookups (29 821 / 47 234 / 123 923 frames) |
| Python vs JS parity (500 seeded people x 4 anims -> pickAnim, dir incl. mirrors, frame, face, noItems) | 2000 / 2000 identical draw lists (frame, order, z, tint, atlas) in all three merges; 0 pickAnim / canPlay / point / page mismatches |
| JS vs the game runtime `src/core/Townfolk.js` `TF` + `installGeumbangfolkRuntime(TF)` | 2000 / 2000 identical in all three merges (z, order, frame, tint, atlas, flip, sx, dx, dy, head), crew anims included (895 / 852 / 1150 crew-anim cases, ~300 noItems); `TF.person` 500 / 500 identical crew; `TF.gb` (+ `TF.of`) wired |
| JS vs the unpatched v4 `TF.layersInto` (v4 anims, for reference) | 0 list mismatches; the atlas differs on 130 (v4.3) / 142 (all) layers = officefolk's own extended layers, which is why officefolk's / this runtime patch exists |
| `--jsgen` (JS generator: 560 preset people per merge, 3000 random) | 0 promise fails, 0 uniform fails, 0 missing core frames (2.3 M layer frames checked per merge), 0 unplayable picks |
| Phaser 3.90 headless, 390 x 844 CSS @ DPR 3 (k 1.65), next to the logistics centre (cut state), the 금방 van / nameplate / parcels (assets/geumbang), a townfolk cabin, officefolk's depot_worker and random townsfolk | 6 / 6 runs - zoom 0.6 / 1.0 / 1.2 by day, night (zoom 1.0, MULTIPLY tint + ADD glows), road page only, all fragments: 0 missing frames (95 590 layer frames of every anim each staged person can play audited per run; 118 648 with all fragments), 0 page errors, 0 404s; 2-4 draw calls and 22-34 texture binds per frame for 24 people + the centre + the van; gbf textures 4.89 MiB (3.31 with the road page only). Road-only run: the 9 hub-anim requests fall back to idle, every courier anim draws, the dockhand's carry_parcel at the dock still works. Game-drawn parcels (carry {noItems}, hub box / counter parcel, hand_parcel), bell flash and scanner beam drawn from the manifest points every frame |
| Texture memory | `gbf_road_0` 488 x 1780 = **3.31 MiB** (budget 3.5), `gbf_hub_0` 512 x 808 = **1.58 MiB** (budget 2.5), AP total 4.89 MiB (budget 6); payload 0.53 MB (266 + 133 KB png, 44 + 30 KB json, 45 KB manifest) |
| Brand (AS) | navy <= 15 %: worst 0.7 % of a preset sprite's opaque px (the vehicles job's metric); plan 7.4 pairs: no preset's two largest colour areas within dE 15 of UPS / DHL / Coupang / Baemin / Kurly / KoreaPost / Yamato / IKEA-like; mark texture vs its own mirror 1.6 % (512 px) and 0.0 % at the drawn sizes (24 / 14 / 10 / 7 px); letters: none; crew vs depot_worker at 0.3 scale: min torso dE 11.0-17.8 (>= 10; the depot workers among themselves 6.9) |

## Files

- `assets/geumbangfolk/manifest.json` (block `geumbangfolk`) + `gbf_road_0`, `gbf_hub_0` (`.png` + `.json`): 5 files
- `tools/blender/gbf_mark.py` (the 금방이 decal texture, from the vehicles job's `gb_mark_thumbs.mark`, read only),
  `gbf_anim.py` (anims, poses, keys, timelines, work heights), `gbf_parts.py` (6 parts, decals, item placement),
  `gbf_presets.py` (cover, presets, palettes, promises, crew names), `gbf_render.py` (Blender passes: head / torso /
  act / walk-lower / old + meta), `gbf_pack.py` (2 pages + manifest + the logistics-centre hub measurement),
  `gbf_check.py` (checks + parity dumps), `gbf_preview.py` (previews / GIFs)
- `tools/geumbangfolk_compose.py` (reference compositor), `tools/geumbangfolk_compose.js` (game port:
  `mergeGeumbangfolk`, `Geumbangfolk`, `GeumbangfolkSprite`, `applyGeumbangfolkRules`, `installGeumbangfolkRuntime`)
- `tools/test/geumbangfolk_phaser.mjs` (`--parity` incl. the patched game runtime, `--jsgen`, the Phaser phone test)
- `docs/previews/gbf_*` (listed below), this report

## Merge (header `{version 1, fragment "geumbangfolk", extends "townfolk", requires ["townfolk"], mergeAfter ["townfolk2", "beachfolk", "cityfolk", "officefolk"]}`)

Merges after townfolk with or without the others (checked: bare, v4.3 = townfolk + officefolk, all). Generic cityfolk
merge (new keys only; `frameAtlasExt` routes this set's frames of layers an earlier fragment owns - limbs, top_parka,
top_sweater, bot_pants, shoe_boots, acc_scarf - into `frameAtlasAnim[anim]`), the officefolk post rules when officefolk
is merged, then `headPoseFallback {down: nod}` on the crew timelines when townfolk2 (the owner of `down`) is absent.
Game: after merging the block into `TF.T`, call `installGeumbangfolkRuntime(TF)` (draw lists via officefolk's
`layersIntoOF`; `TF.gb`, and `TF.of = TF.gb` when officefolk is merged). `canPlay`: a crew anim needs every worn body
part in `bases[b].gbCover[anim]` (parts with an `anims` list: `partPlays`); fallbacks `carry_parcel -> walk`,
`ring_doorbell / hand_parcel -> talk -> idle`, hub anims `-> idle`.

## Anims (all 128 x 128, anchor [0.5, 0.8125]; dirs + mirrors SW / W / NW)

| Anim | Frames · fps · repeat | Dirs | Head pose | Items (animItems) | Page | Points |
|---|---|---|---|---|---|---|
| `carry_parcel` | 8 · 12 · loop (walk) | S SE E NE N | loco | `held_parcel_gb` (main) | road | boxPoint [cx, cy, bx, by], groundSpeed |
| `ring_doorbell` | 6 · 8 · once, impactFrame 2 | NE N E | soc (NE / N -> loco) | `held_parcel_gb` under the left arm | road | boxPoint, bellPoint (press held on 2-3) |
| `hand_parcel` | 6 · 9 · once, f5 bow | NE E SE | soc (f5 nod) | - (the game flies its gb_parcel_*) | road | handPoint |
| `scan` | 4 · 6 · loop, impactFrame 2 | S SE E | down -> nod (f3 soc glance) | `held_scanner` | hub | beamPoint [wx, wy, tx, ty], boxPoint.scan (counter parcel) |
| `sort_parcel` | 6 · 8 · loop | SE E NE | down -> nod | `held_parcel_gb` (small) on 1-4 | hub | handPoint |
| `tape_box` | 6 · 10 · loop, impactFrame 3 | S SE E | down -> nod | `held_tapegun` | hub | tapePoint, boxPoint.tape_box (the box) |

No new head art. Timeline head poses: bare / v4.3 merge loco 64, soc 19, nod 41; with townfolk2 `down` stays (39).
`noItems` leaves the anim items out so the game draws its own `gb_parcel_s/m/l` (assets/geumbang) at `boxPoint`:
depth +0.0045 in S / SE / E (z 45: over the body, under the arms that hug it), -0.0001 in NE / N; mirrored dirs
negate every x. `groundSpeed.carry_parcel` (adult_slim) S 28.8, SE 46.3, E 58.9, NE 46.9, N 30.2 px/s.

Acting technique (texture memory): garments are rendered once per (torso key, dir) and shared (aliases); arms,
mittens, cuffs and items per body key, drawn in front in the front views (`zfront`). `carry_parcel`'s upper body has
two bob levels (`cw_hi` / `cw_lo`, the parcel hugged at the belly) shared over the 8 frames; trousers and boots are
rendered per frame (a real walk, feet planted, groundSpeed measured on them). `ring_doorbell` keys 0 1 2 2 1 0 (the
mitten stays on the bell for 띵-동).

## New parts

| Part | Family / space | Subs (tint, z) | Notes |
|---|---|---|---|
| `top_gb_jacket` | top / body | main (`top`, 30), trim (fixed, 31.4), cuff_R / cuff_L (fixed, follow the arms) | gold quilted puffer (goldDark for the night crew = tint), cream stand collar + chest band + cuffs; the mark centred on the band (0.12 m) and big on the back (0.25 m), conformed to the quilting by ray casting. Frames in the 6 crew anims + idle / walk / talk / wave / happy |
| `det_gb_vest` | job / body | main (fixed, 35) | gold work vest open at the front, goldDark hem, 2 cream stripes, the mark on the back (0.18 m). Same anims as the jacket |
| `hat_gb_cap` | hat / head, cls full | main (fixed, 80) | charcoal crown, small navy ear flaps under a gold band, gold brim + crown button, the mark centred on the crown front. All 20 head frames (17 v4 + 3 `down`) |
| `held_parcel_gb` | held | main (carry / ring), small (sort) | kraft box (`#C99A62` = the logistics cardboard), gold tape cross, the mark sticker; z 45.5 in front views, 2.5 in NE / N |
| `held_scanner` | held | main | charcoal grip, gold nose / trigger, glowing window (1.35x so it reads on a phone) |
| `held_tapegun` | held | main | gold tape roll on a charcoal frame, cream core, steel cutter (1.3x) |

## Presets (labels ko / en, crew names)

| Preset | Bases | Uniform (contract) | Colours | Names / signature |
|---|---|---|---|---|
| `gb_driver` | slim 3 : round 2 | jacket, cap, charcoal pants, boots | gold jacket, slate boots | 쌩쌩이 · 부릉이 · 씽씽이 / carry, ring, hand |
| `gb_picker` | slim 3 : round 1 | cream parka, vest, gold beanie | | 쏙쏙이 / sort, carry, wave |
| `gb_packer` | round 2 : slim 1 | oat sweater, vest, beanie | **charcoal** beanie (see Deviations) | 척척이 / tape, scan, happy |
| `gb_sorter` | round 2 : slim 1 | parka, vest, cap | charcoal parka | 영차 / carry, scan, sort |
| `gb_dispatcher` | slim 2 : round 1 | jacket, glasses (look A) | ash / blue-black hair (see Deviations) | 방금순 팀장 / scan, talk, hand |
| `gb_rider` | slim 2 : round 1 | jacket, scarf, gold beanie | **cream scarf with navy stripes** (see Deviations) | 뽀득이 / carry, ring, hand |
| `gb_night` | slim 3 : round 2 | driver in goldDark | goldDark jacket (cap fixed: gold brim) | 반짝이 · 살금이 / carry, hand, idle |

Every preset keeps its promise (the 6 crew anims + idle / walk / talk / wave / happy) in every merge (60 people per
preset in Python, 80 in JS). Random townsfolk can play the crew anims only when everything they wear is in the cover
(~1.6 %), otherwise they fall back.

## Pages (texture memory)

| Page | Size | MiB | Holds | Load |
|---|---|---|---|---|
| `gbf_road_0` (`gbPages.resident`) | 488 x 1780 | 3.31 / 3.5 | carry_parcel, ring_doorbell, hand_parcel; the cap on all head frames; jacket / vest in the v4 anims | wherever a courier or crew member can be seen |
| `gbf_hub_0` | 512 x 808 | 1.58 / 2.5 | scan, sort_parcel, tape_box; `gbPages.hubRouted`: top_sweater in the road anims, top_parka in ring_doorbell / hand_parcel | while the depot is revealed (`scenes.depot`) |

1025 + 691 rects, 710 + 521 aliases (shared torso keys, identical renders); 64-colour imagequant per page.
`pageNeeded(person, anim)` is per person (asks the sprite's `has()`); a depot-crew doorstep anim without `hub` falls
back to talk / idle, a courier never needs `hub`.

## Hub (assets/logistics, read only)

`hub.places` measures the centre's `_interior_front` in front of staffPoints 0-2 and gives the lift that stands the
game-drawn parcel 2 px behind the real counter / table front edge (the worker stands on a hidden step, depth
unchanged): clerk (staff0, `scan`, counter front 45 px) lift **39**; packer staff1 (`tape_box` on the conveyor, 34 px)
lift **30**; packer staff2 (`tape_box`, packing table 13 px) lift **9**. The scanner beam target is the top of the
parcel on the counter; the tape roller runs along the box top. Pickers (racks: `sort_parcel`, shelf heights per dir)
and the dockhand (`carry_parcel` outside) need no lift. The game draws the hub parcels at
`bases.boxPoint.scan / .tape_box` (gb_parcel_s at 0.14 m / gb_parcel_m at 0.20 m) at the worker's depth + 0.005 (over
the body, under the head / arms / tool).

## Previews (docs/previews, all looked at)

| File | What it shows |
|---|---|
| `gbf_lineup.png` | the 7 presets (ko / en labels): idle S, walk SE, the signature anim, idle N; idle SE at phone zoom 0.6 (0.975 device px / world px) and 1.0 (1.625) |
| `gbf_anims.png` | the 6 crew anims x 7 presets at the impact / mid frame, with the game-drawn parcels composed per the manifest |
| `gbf_carry_parcel.gif` `gbf_ring_doorbell.gif` `gbf_hand_parcel.gif` `gbf_scan.gif` `gbf_sort_parcel.gif` `gbf_tape_box.gif` | each crew anim in every dir incl. the mirrors, 3 presets, real fps; bell flash on impact (ring), beam on impact (scan), parcels per the manifest; once anims hold the last frame |
| `gbf_carry_noitems.gif` | carry_parcel {noItems} in 8 dirs + the game's gb_parcel_m at boxPoint with the depth rule (the mittens hug it in front views, the body hides it in NE / N / NW) |
| `gbf_points.png` | every point on its frames (boxPoint centre / bottom, handPoint, bellPoint, beamPoint window -> target, tapePoint, the static hub parcels) |
| `gbf_dirs_gb_driver.png` | every crew anim x dir x frame on the driver (review sheet) |
| `gbf_v4.png` | the uniform in idle / walk / talk / wave / happy (driver, picker, packer, rider, night) |
| `gbf_before_after.png` | BEFORE: the plan's fallback courier (gold top_puffer + navy hat_cap + mailbag + hi-vis, navy 33 %) and officefolk's depot workers (navy beanie 37-42 %); AFTER: the 7 crew presets (navy 0 %), at 1.3x and at 0.3 scale |
| `gbf_phone_z06.png` `gbf_phone_z10.png` `gbf_phone_z12.png` `gbf_phone_night.png` `gbf_phone_road.png` `gbf_phone_all.png` | the Phaser phone captures (390 x 844 @ DPR 3) |
| `gbf_phone_details.png` | device-pixel crops of the captures: the clerk at the counter, packers / pickers, the doorstep, the crew row, night |

## Deviations from the contract (and why)

1. **Navy (brand rule over preset colour).** The contract asks for a navy cap and the packer's navy beanie, and also
   for navy <= 15 % of a sprite's opaque px. On the chibi body the hat dome alone is 30-40 % of the sprite (measured:
   driver 39 %, packer 49 % with a navy dome), and gold + a large blue block is the IKEA-like pair the plan forbids.
   So `hat_gb_cap` has a **charcoal** crown with **navy ear flaps** under the gold band / brim (worst navy now 0.7 %),
   and `gb_packer` wears a **charcoal** beanie. Both read as the dark brand accent at phone zoom (gbf_lineup.png).
2. **gb_rider's scarf** is cream with navy stripes instead of solid navy: a navy scarf under the gold jacket + gold
   beanie made the sprite's two largest areas gold + blue (IKEA-like pair, dE 12.9 < 15). Navy stays as the accent.
3. **gb_dispatcher's hair** uses an ash / blue-black palette (`gb_hair_ash`): her big hatless hair next to the gold
   jacket was the UPS pair (warm dark brown + gold, dE 14.8). Boots never use navy (`gb_boots` = slate shades).
4. **Fixed-colour layers (texture memory, road page <= 3.5 MiB).** The cap is ONE fixed-colour layer (crown, flaps,
   band, brim, button, mark), so gb_night's brim is gold (his goldDark is the jacket); the vest is one fixed-colour
   layer (gold, goldDark hem, cream stripes, mark); the jacket's collar, chest band and both marks are one fixed
   `trim` layer, its body stays tinted (`top`: gold / goldDark).
5. **Page routing.** `gbf_road_0` holds the road anims + the new parts' v4 anims as the contract says, except the depot
   crew's own v4 garments at the door: top_sweater (packer) in all road anims and top_parka (picker, dockhand) in
   ring_doorbell / hand_parcel live on `gbf_hub_0` (`gbPages.hubRouted`). Couriers (jacket, cap, scarf, beanie) and the
   dockhand's carry_parcel at the docks never need the hub page. Without it those doorstep anims fall back
   (talk / idle) for the depot crew only.
6. **ring_doorbell** holds the press for 2 frames (keys 0 1 2 2 1 0: 띵 on 2, 동 on 3, one pose).
7. **Extras in the manifest** (non-breaking): `bases.boxPoint.scan / .tape_box` (where the game draws the counter parcel
   / the box being taped), `hub.places[staffN] = {anim, frontTopPx, parcelBottomPx, liftPx}` measured from
   assets/logistics, `gbPages.hubRouted`, item notes (`items.*`, `items.gbOthers`), `crew` names / signatures, `brand`.
8. **Checks.** The navy metric is the 금방 vehicles job's (`gb_check.py`: dE2000 < 10 to navy at 0.8 / 1.0 / 1.2 and
   chroma >= 20, alpha >= 240) so both sets measure the same thing. "Crew distinct from depot_worker at 0.3 scale" is
   measured per pixel on the torso band (the uniform) of same-base 38 px thumbnails, >= 10 dE (the depot workers
   among themselves: 6.9). The mark's mirror test runs on the texture at the sizes it is drawn (24 / 14 / 10 / 7 px):
   whole rendered garment layers are never mirror-symmetric under the key light, the decal itself is centred on the
   garment's symmetry plane (x = 0).

## Known limits

- `hub.places.staff1` (the packer at the conveyor) stands on a 30 px hidden step: at zoom 1.2 his boots can show just
  above the belt's far rail (the belt hides less of the legs than the clerk's counter does). The game may prefer
  `sort_parcel` (no lift; the SE / E shelf reach is the belt height) there; staff0 / staff2 look right.
- hand_parcel's offering frames keep the mittens ~0.1 m short of the IK target (the chibi arm is fully stretched);
  handPoint is measured on the rendered mittens, so the flying parcel starts between them.
- Random townsfolk play the crew anims only when everything they wear is in the cover (~1.6 %); otherwise pickAnim
  falls back (walk / talk / idle). The 7 presets always can.
- adult_round draws the slim frames stretched (townfolk rule): points / groundSpeed are scaled per base in the manifest.
- Phaser timing under swiftshader on a shared 4-core box is ~1-1.5 s per frame for the whole scene (software GL);
  the meaningful numbers are 2 draw calls and ~30 texture binds per frame.

## Reproduce

```
B=nice -n 10 /tmp/bvenv/bin/python          # one Blender at a time
nice -n 10 python3 tools/blender/gbf_mark.py  # mark texture (PIL) -> /tmp/fv_cache/geumbangfolk/mark
$B tools/blender/gbf_render.py -- --mode head
$B tools/blender/gbf_render.py -- --mode body --pass all
$B tools/blender/gbf_render.py -- --mode meta
nice -n 10 python3 tools/blender/gbf_pack.py
nice -n 10 python3 tools/blender/gbf_check.py --dump /tmp/fv_cache/geumbangfolk/review/gbf_cases.json   # --fragments bare|v43|all
nice -n 10 node tools/test/geumbangfolk_phaser.mjs --parity /tmp/fv_cache/geumbangfolk/review/gbf_cases.json
nice -n 10 node tools/test/geumbangfolk_phaser.mjs --jsgen
nice -n 10 node tools/test/geumbangfolk_phaser.mjs                       # GBF_RUNS=z06,z10,... for a subset
nice -n 10 python3 tools/blender/gbf_preview.py
```
