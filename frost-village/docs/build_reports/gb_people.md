# 금방 crew (geumbangfolk) - build report (CONTRACT_GEUMBANG section AP + AS)

The 금방 delivery crew as a townfolk paper-doll fragment: drivers, riders, the night driver, the depot pickers /
packers / dockhand and the team lead 방금순. 6 new anims, 6 new parts, 7 presets, 2 atlas pages (5 files). Rendered
with Blender 5.2 Cycles (the townfolk tf_* pipeline + the officefolk acting technique), packed as compact `tfatlas` v1
like assets/townfolk, composed by `tools/geumbangfolk_compose.py` (reference) and `tools/geumbangfolk_compose.js` (game
port + the game-runtime patch). The brand is original: a honey-gold puffer with a cream collar and chest band, the
symmetric 금방이 mark (gold disc, cream face-on parcel; the same texture the 금방 van / hub job uses), charcoal + navy
accents. No rocket, wings, bird, arrow-smile, lightning or cat; no letters anywhere in this set; no real company's
logo, colours, mascot or slogan (the plan 7.4 colour-pair test runs on every preset).

**Polish pass (2026-10-17)** after `docs/build_reports/gb_people_critique.md` (verdict polish: 0 critical, 4 high, 3
medium, 9 low): every high and medium is fixed, 7 of the 9 lows are fixed, 2 are left (L2 needs a re-pose and the critic
calls it acceptable; L6 is a designer call). See **Polish** below.

| Gate | Result |
|---|---|
| `gbf_check.py` (bare = townfolk + geumbangfolk, v4.3 = + officefolk, all = every fragment present) | 0 errors, 0 warnings in all three, with the new polish rules (see-through holes, parcel vs coat contrast, parcel visible in the dirs it is used in, parcelDepth coverage). On the critique-time assets the same rules give 720 hole frames, 16 contrast errors and "ring NE: 9 px of parcel" |
| Holes (polish rule) | 3416 / 3416 preset frames (7 presets x 2 seeds, crew + v4 anims, every dir / frame) without an enclosed see-through patch >= 4 px in the body layers' torso band |
| Parcel vs coat (dE2000 of the mean colours, 3 px ring; carry S / SE / E, ring E / NE / N) | driver 14.6-21.1, dispatcher 12.9-19.3, rider 13.0-19.0, picker 14.7-21.9, packer 13.4-22.4, night 10.6-16.7 (was 1.6-6.3) |
| Parcel visible while ringing / carrying (driver, min over frames) | ring NE >= 428 px, N >= 284, E >= 361; carry S >= 502, SE >= 504, E >= 392 (ring NE was 0-5 px) |
| Merging geumbangfolk changes nothing else | 4000 generated people (random + every other preset) identical; 1500 / 1500 v4-anim draw lists + atlases identical; 0 existing values changed; 0 wrong atlas lookups (29 825 / 47 238 / 123 927 frames) |
| Python vs JS parity (500 seeded people x 4 anims -> pickAnim, dir incl. mirrors, frame, face, noItems) | 2000 / 2000 identical draw lists (frame, order, z, tint, atlas) in all three merges; 0 pickAnim / canPlay / point / page mismatches |
| JS vs the game runtime `src/core/Townfolk.js` `TF` + `installGeumbangfolkRuntime(TF)` | 2000 / 2000 identical in all three merges (z, order, frame, tint, atlas, flip, sx, dx, dy, head), crew anims included; `TF.person` 500 / 500; `TF.gb` (+ `TF.of`) wired |
| Page residency through the game's own `TF.pick` (new, critique H4) | 4000 cases per merge (hub page missing / every page loaded), 0 mismatches against `Geumbangfolk.pickAnim`: with `gbf_hub_0` missing the hub anims fall back (1488 / 1579 / 1626 cases) and `want('hub')` is called; 0 crew draws from a missing page; with every page loaded nothing falls back |
| JS vs the unpatched v4 `TF.layersInto` (v4 anims, for reference) | 0 list mismatches; the atlas differs on 142 layers with every fragment = officefolk's own extended layers (why officefolk's / this runtime patch exists) |
| `--jsgen` (JS generator: 560 preset people per merge, 3000 random) | 0 promise fails, 0 uniform fails, 0 missing core frames (2.29 M layer frames checked per merge), 0 unplayable picks |
| Phaser 3.90 headless (swiftshader) | 9 / 9 runs: 390 x 844 CSS @ DPR 3 (k 1.65) at zoom 0.6 / 1.0 / 1.2 / 1.6 by day, night (zoom 1.0, MULTIPLY tint + ADD glows), road page only, all fragments; 360 x 640 @ DPR 2 at zoom 1.0 / 0.6. Real ground tiles (snow, wide cobble, dirt, plaza), the logistics centre (cut state) with the clerk / packers at `hub.places`, the 금방 van / parcels (assets/geumbang), two cabins (ring_doorbell NE with the item, and {noItems} + the game's parcel), officefolk's depot_worker and random townsfolk. 0 missing frames (101 984 layer frames of every anim each staged person can play audited per run; 126 642 with all fragments, 74 862 road-only), 0 page errors, 0 404s; 3 draw calls (5 at night) and 39-41 texture binds per frame for 25 people + the centre + the van; gbf textures 5.15 MiB (3.30 with the road page only). Road-only run: the 9 hub-anim requests fall back to idle and the dockhand's carry to walk, every courier anim draws. Game-drawn parcels at parcelDepth, the bell flash and the scanner beam from the manifest points every frame |
| Texture memory | `gbf_road_0` 1480 x 584 = **3.30 MiB** (budget 3.5), `gbf_hub_0` 560 x 868 = **1.85 MiB** (budget 2.5), AP total 5.15 MiB (budget 6); payload 0.63 MB (313 + 183 KB png, 40 + 34 KB json, 47 KB manifest) |
| Brand (AS) | navy <= 15 %: worst 1.9 % of a preset sprite's opaque px (the vehicles job's metric); plan 7.4 pairs: no preset's two largest colour areas within dE 15 of UPS / DHL / Coupang / Baemin / Kurly / KoreaPost / Yamato / IKEA-like; mark texture vs its own mirror 1.6 % (512 px) and 0.0 % at the drawn sizes (24 / 14 / 10 / 7 px); letters: none; crew vs depot_worker at 0.3 scale: min torso dE 11.1-17.8 (>= 10; the depot workers among themselves 6.9) |

## Polish (critique `gb_people_critique.md`)

| Finding | Result | What changed |
|---|---|---|
| **H1** see-through hole at the hip (side / back views, every crew anim) | **fixed** | Root cause: the torso pass rendered the jacket body with its cuff subs as holdouts, but the cuffs follow the arms (ACT pass, other z / other frames), so where a cuff crossed the hip the coat was cut out. The torso pass no longer holds out `follow` subs (`gbf_render.layer_specs`). Jacket crew torso keys re-rendered. 0 / 3416 frames with a hole (new `gbf_check` rule; 720 on the old assets) |
| **H2** the hugged parcel melts into the gold coat | **fixed** | `held_parcel_gb` is a deep kraft box now: sides `#704E30` / `#523A25`, a pale lid `#9A7A52`, a cream label on the lid and the front, the gold tape cross and the mark sticker kept. Parcel vs coat dE 12.9-22.4 on the gold-jacket presets, 10.6-16.7 on the night driver (was 1.6-6.3); new contrast rule (error under 9) |
| **H3** no parcel at the door (`ring_doorbell` NE / NW / N) | **fixed** (option a, re-pose) | Facing away the parcel now rides under the RIGHT arm on the camera side (turned 90 degrees, short side against the body) and the LEFT mitten presses the bell; that arm, mitten and the parcel are drawn over the coat (`zfront`). E / W unchanged. `boxPoint` re-measured (1.1 / 2.5 px from the rendered parcel), `parcelDepth.ring_doorbell` +0.0045 in every dir for the game's own parcel. Visible parcel NE >= 428 px (was 0-5) |
| **H4** the runtime patch said the 금방 pages were always loaded | **fixed** | `installGeumbangfolkRuntime` registers the 금방 atlases per page group in `TF.ofAtlas`, so `TF.ofReady` asks the real page state and `want()` runs, and installs a `TF.pick` that also works without officefolk (`TF.of` or `TF.gb`). New residency parity (4000 cases x 3 merges, 0 mismatches) |
| **M1** carry upper body glides (0 px sway, 1 px bob) | **fixed** | 3 upper-body keys (`cw_hi_L`, `cw_lo`, `cw_hi_R`, keys 0 0 1 1 2 2 1 1): the head sways +-3 px and bobs 2 px with the steps; trousers and boots stay per-frame walk renders with the natural hips (feet planted, groundSpeed unchanged) |
| **M2** 방금순's face behind the counter board | **fixed** | `hub.places.staff0.offsetPx` [24, 12]: she stands 27 px further along the counter, the yellow board is beside her, face and glasses clear (`gbf_hub_places.png`, z 1.2 capture) |
| **M3** belt packer floats on the far rail; the table packer hidden by the bubble-wrap roll | **fixed** | staff1 (conveyor) plays `sort_parcel` on a 12 px step: the belt hides his boots, mittens and parcel show over it. staff2 `offsetPx` [-20, -10]: the middle of the table, left of the roll; mittens, tape gun and box read. `places[].anim` / `offsetPx` / `why` added |
| **L1** `hand_parcel` NE / NW: no depth rule, handPoint off the visible mitten | **fixed** | handPoint NE = the camera-side mitten pushed 0.10 m out to the side (the parcel stays visible); `parcelDepth.hand_parcel` +0.0045 |
| **L2** `sort_parcel` NE / NW shows 7-38 px of parcel at the racks | **won't fix** | Needs a re-pose (parcel in the camera-side hand) and the frames are on the hub page with no budget concern, but the critic calls it acceptable (picking reads as reaching into the shelf). Left for a later art pass |
| **L3** quantisation grain on the fixed-colour layers | **fixed** | 128 colours, dither 0.25 per page (was 64 / 0.5) and the cap's 20 head frames re-rendered at 48 samples. Light specks on the charcoal crown 2.6 % -> 0.0 % of its px; cap high-pass 5.5 -> 4.7, the townfolk beanie 0.5 (the rest is the quilting) |
| **L4** stale `brand.notes` | **fixed** | Now: tinted = only the jacket body; fixed = trim / cuffs / marks, vest, cap and every held item (preset colours for those slots do nothing) |
| **L5** builder test gaps | **fixed** | Phaser: 360 x 640 @ DPR 2 (zoom 1.0 and 0.6), zoom 1.6, real ground (snow, wide cobble, dirt, plaza tiles); a second house with a noItems ring + the game's parcel. `gbf_check`: hole, contrast, visibility and parcelDepth rules |
| **L6** gold + charcoal, not gold + cream | **won't fix (designer call)** | The charcoal crown is the navy-budget answer (Deviation 1). Option for the designer: a cream band on the cap crown (one fixed layer, 20 head frames, ~0.05 MiB) |
| **L7** boxPoint jumps between item / noItems | **fixed** for ring NE / N (1.1 / 2.5 px); carry NE **not a data error** | carry NE: the parcel is behind the body (depth -0.0001), only a sliver shows; boxPoint is the whole parcel's centre, the 5.5 px is the sliver's centroid |
| **L8** counter parcel a speck at zoom 0.6 | **fixed** | The parcel on the counter (scan) is `gb_parcel_m` at 0.20 m like the box being taped (`hub.workHeightsM.parcelOnCounter`, the rule text, previews, Phaser test) |
| **L9** ponytail / low bun under the cap | **fixed** | The cap wearers (driver, night driver, dockhand) draw short hair only (`_CAP_HAIR`: no ponytail / low bun) |

Also found and fixed during the pass: facing away (NE / N / NW) the pressing mitten and the bell are behind the head, so
the bell flash drawn on top landed on the back of the cap. The manifest now says to draw it behind the doll (depth
-0.0001; the head hides most of it, the 띵-동 sound carries the beat), never over the face; the Phaser test and
`gbf_doorstep.gif` do that. Also fixed: `--parity` wrote the bare merge's result as `gbf_parity_v43.json` and the v4.3
merge's as `gbf_parity_all.json` (file naming only; the runs themselves were right).

### 디자이너용 요약 (쉬운 말)

1. **패딩 구멍 메움.** 옆/뒤에서 볼 때 엉덩이 쪽에 비치던 구멍을 없앴어요 (모든 동작, 모든 방향 3416장 검사: 0장).
2. **상자가 잘 보여요.** 상자를 진한 갈색 골판지로 바꾸고 뚜껑은 밝게, 크림색 송장 라벨을 붙였어요. 금색 패딩 위에서도
   "상자를 안고 있다"가 휴대폰에서 바로 보여요 (야간 기사는 패딩이 어두워서 차이가 조금 작아요).
3. **초인종 누를 때 상자가 보여요.** 뒤돌아 초인종을 누를 때 상자를 화면 쪽 오른팔 아래에 끼고, 왼손으로 벨을 눌러요.
   벨 반짝임은 얼굴 위에 그리지 않아요 (뒤돌아 있을 땐 머리에 가려지고 '띵동' 소리로 알려줘요).
4. **걷는 느낌.** 상자 들고 걸을 때 몸이 좌우로 살짝 흔들리고 발걸음마다 통통 튀어요 (발은 그대로 땅에 붙어 있어요).
5. **물류센터 자리.** 방금순 팀장은 안내판 옆으로 옮겨 얼굴이 보이고, 컨베이어 직원은 벨트에서 상자를 집고, 포장 직원은
   뽁뽁이 롤 왼쪽에서 테이프 작업을 해요.
6. **게임 코드 연결.** 물류센터 그림(hub 페이지)이 아직 없으면 직원 동작이 자동으로 기본 동작으로 바뀌고 페이지를
   불러달라고 요청해요.
7. **작은 것들.** 모자 위 모래알 같은 점 제거, 모자 쓴 기사는 짧은 머리만, 카운터 위 상자 크게, 360 x 640 폰과
   1.6배 확대에서도 확인.
8. **남겨 둔 것.** 선반에서 상자 꺼내는 뒷모습은 상자가 작게 보여요 (손을 선반에 넣는 동작으로 읽혀서 그대로 둠).
   모자 크라운에 크림색 띠를 넣어 "금색 + 크림" 느낌을 키울지는 디자이너 결정이에요.

## Files

- `assets/geumbangfolk/manifest.json` (block `geumbangfolk`) + `gbf_road_0`, `gbf_hub_0` (`.png` + `.json`): 5 files
- `tools/blender/gbf_mark.py` (the 금방이 decal texture, from the vehicles job's `gb_mark_thumbs.mark`, read only),
  `gbf_anim.py` (anims, poses, keys, timelines, work heights), `gbf_parts.py` (6 parts, decals, item placement),
  `gbf_presets.py` (cover, presets, palettes, promises, crew names), `gbf_render.py` (Blender passes: head / torso /
  act / walk-lower / old + meta), `gbf_pack.py` (2 pages + manifest + the logistics-centre hub measurement),
  `gbf_check.py` (checks + parity dumps), `gbf_preview.py` (previews / GIFs)
- `tools/geumbangfolk_compose.py` (reference compositor), `tools/geumbangfolk_compose.js` (game port:
  `mergeGeumbangfolk`, `Geumbangfolk`, `GeumbangfolkSprite`, `applyGeumbangfolkRules`, `installGeumbangfolkRuntime`)
- `tools/test/geumbangfolk_phaser.mjs` (`--parity` incl. the patched game runtime and page residency, `--jsgen`, the
  Phaser phone test)
- `docs/previews/gbf_*` (listed below), this report

## Merge (header `{version 1, fragment "geumbangfolk", extends "townfolk", requires ["townfolk"], mergeAfter ["townfolk2", "beachfolk", "cityfolk", "officefolk"]}`)

Merges after townfolk with or without the others (checked: bare, v4.3 = townfolk + officefolk, all). Generic cityfolk
merge (new keys only; `frameAtlasExt` routes this set's frames of layers an earlier fragment owns - limbs, top_parka,
top_sweater, bot_pants, shoe_boots, acc_scarf - into `frameAtlasAnim[anim]`), the officefolk post rules when officefolk
is merged, then `headPoseFallback {down: nod}` on the crew timelines when townfolk2 (the owner of `down`) is absent.
Game: after merging the block into `TF.T`, call `installGeumbangfolkRuntime(TF)`: draw lists via officefolk's
`layersIntoOF`; `TF.gb`, and `TF.of = TF.gb` when officefolk is merged; the 금방 page groups are added to `TF.ofAtlas`
(so `TF.ofReady(group)` / `want(group)` see `gbf_road_0` / `gbf_hub_0`), and `TF.pick` asks `pageNeeded` per person.
Calling it again after officefolk merges later re-installs (idempotent otherwise). `canPlay`: a crew anim needs every
worn body part in `bases[b].gbCover[anim]`; fallbacks `carry_parcel -> walk`, `ring_doorbell / hand_parcel -> talk ->
idle`, hub anims `-> idle`.

## Anims (all 128 x 128, anchor [0.5, 0.8125]; dirs + mirrors SW / W / NW)

| Anim | Frames · fps · repeat | Dirs | Head pose | Items (animItems) | Page | Points |
|---|---|---|---|---|---|---|
| `carry_parcel` | 8 · 12 · loop (walk) | S SE E NE N | loco | `held_parcel_gb` (main) | road | boxPoint [cx, cy, bx, by], groundSpeed, parcelDepth |
| `ring_doorbell` | 6 · 8 · once, impactFrame 2 | NE N E | soc (NE / N -> loco) | `held_parcel_gb`: under the right arm facing away, under the left arm facing E | road | boxPoint, bellPoint (press held on 2-3), parcelDepth |
| `hand_parcel` | 6 · 9 · once, f5 bow | NE E SE | soc (f5 nod) | - (the game flies its gb_parcel_*) | road | handPoint, parcelDepth |
| `scan` | 4 · 6 · loop, impactFrame 2 | S SE E | down -> nod (f3 soc glance) | `held_scanner` | hub | beamPoint [wx, wy, tx, ty], boxPoint.scan (counter parcel) |
| `sort_parcel` | 6 · 8 · loop | SE E NE | down -> nod | `held_parcel_gb` (small) on 1-4 | hub | handPoint |
| `tape_box` | 6 · 10 · loop, impactFrame 3 | S SE E | down -> nod | `held_tapegun` | hub | tapePoint, boxPoint.tape_box (the box) |

No new head art. Timeline head poses: bare / v4.3 merge loco 64, soc 19, nod 41; with townfolk2 `down` stays (39).
`noItems` leaves the anim items out so the game draws its own `gb_parcel_s/m/l` (assets/geumbang) at `boxPoint` /
`handPoint` with `parcelDepth[anim][dir]` over the doll's depth: carry +0.0045 in S / SE / E (over the body, under the
arms that hug it), -0.0001 in NE / N; ring and hand_parcel +0.0045 in every dir; mirrored dirs negate every x.
`groundSpeed.carry_parcel` (adult_slim) S 28.8, SE 46.3, E 58.9, NE 46.9, N 30.2 px/s.

Acting technique (texture memory): garments are rendered once per (torso key, dir) and shared (aliases); arms,
mittens, cuffs and items per body key, drawn in front in the front views (`zfront`; ring NE / N: the right arm and
mitten only). `carry_parcel`'s upper body has three keys (`cw_hi_L` / `cw_lo` / `cw_hi_R`: sway left, down, sway right,
the parcel hugged at the belly) over the 8 frames; trousers and boots are rendered per frame (a real walk, feet planted,
groundSpeed measured on them). `ring_doorbell` keys 0 1 2 2 1 0 (the mitten stays on the bell for 띵-동).

## New parts

| Part | Family / space | Subs (tint, z) | Notes |
|---|---|---|---|
| `top_gb_jacket` | top / body | main (`top`, 30), trim (fixed, 31.4), cuff_R / cuff_L (fixed, follow the arms) | gold quilted puffer (goldDark for the night crew = tint), cream stand collar + chest band + cuffs; the mark centred on the band (0.12 m) and big on the back (0.25 m), conformed to the quilting by ray casting. Frames in the 6 crew anims + idle / walk / talk / wave / happy |
| `det_gb_vest` | job / body | main (fixed, 35) | gold work vest open at the front, goldDark hem, 2 cream stripes, the mark on the back (0.18 m). Same anims as the jacket |
| `hat_gb_cap` | hat / head, cls full | main (fixed, 80) | charcoal crown, small navy ear flaps under a gold band, gold brim + crown button, the mark centred on the crown front. All 20 head frames (17 v4 + 3 `down`), 48 samples |
| `held_parcel_gb` | held | main (carry / ring), small (sort) | deep kraft box (`#704E30`, sides `#523A25`), pale lid `#9A7A52`, cream label on the lid and the front, gold tape cross, the mark sticker; z 45.5 in front views, 2.5 (behind the body) in NE / N except the ring tuck, where it follows the right mitten to the front (`zfrontFollow`) |
| `held_scanner` | held | main | charcoal grip, gold nose / trigger, glowing window (1.35x so it reads on a phone) |
| `held_tapegun` | held | main | gold tape roll on a charcoal frame, cream core, steel cutter (1.3x) |

## Presets (labels ko / en, crew names)

| Preset | Bases | Uniform (contract) | Colours | Names / signature |
|---|---|---|---|---|
| `gb_driver` | slim 3 : round 2 | jacket, cap, charcoal pants, boots | gold jacket, slate boots; short hair only under the cap | 쌩쌩이 · 부릉이 · 씽씽이 / carry, ring, hand |
| `gb_picker` | slim 3 : round 1 | cream parka, vest, gold beanie | | 쏙쏙이 / sort, carry, wave |
| `gb_packer` | round 2 : slim 1 | oat sweater, vest, beanie | **charcoal** beanie (see Deviations) | 척척이 / tape, scan, happy |
| `gb_sorter` | round 2 : slim 1 | parka, vest, cap | charcoal parka | 영차 / carry, scan, sort |
| `gb_dispatcher` | slim 2 : round 1 | jacket, glasses (look A) | ash / blue-black hair (see Deviations) | 방금순 팀장 / scan, talk, hand |
| `gb_rider` | slim 2 : round 1 | jacket, scarf, gold beanie | **cream scarf with navy stripes** (see Deviations) | 뽀득이 / carry, ring, hand |
| `gb_night` | slim 3 : round 2 | driver in goldDark | goldDark jacket (cap fixed: gold brim); short hair only | 반짝이 · 살금이 / carry, hand, idle |

Every preset keeps its promise (the 6 crew anims + idle / walk / talk / wave / happy) in every merge (60 people per
preset in Python, 80 in JS). Random townsfolk can play the crew anims only when everything they wear is in the cover
(~1.6 %), otherwise they fall back.

## Pages (texture memory)

| Page | Size | MiB | Holds | Load |
|---|---|---|---|---|
| `gbf_road_0` (`gbPages.resident`) | 1480 x 584 | 3.30 / 3.5 | carry_parcel, ring_doorbell, hand_parcel; the cap on all head frames; jacket / vest in the v4 anims | wherever a courier or crew member can be seen |
| `gbf_hub_0` | 560 x 868 | 1.85 / 2.5 | scan, sort_parcel, tape_box; `gbPages.hubRouted`: top_sweater and top_parka in carry_parcel / ring_doorbell / hand_parcel | while the depot (its docks included) is revealed (`scenes.depot`) |

1045 + 759 rects, 540 + 607 aliases (shared torso keys, identical renders); 128-colour imagequant, dither 0.25
per page. `pageNeeded(person, anim)` is per person (asks the sprite's `has()`); a depot-crew road anim without `hub`
falls back (carry -> walk, ring / hand -> talk / idle), a courier never needs `hub`.

## Hub (assets/logistics, read only)

`hub.places` measures the centre's `_interior_front` in front of staffPoints 0-2 (shifted by `offsetPx`) and gives what
to play there and the lift that stands the game-drawn parcel 2 px behind the real counter / table front edge (the
worker stands on a hidden step, depth = the shifted point):

| Place | Role | anim | offsetPx | Front top | liftPx | Why |
|---|---|---|---|---|---|---|
| staff0 | clerk (방금순) | scan | [24, 12] | 45 px | 39 | the counter's display board no longer covers her face |
| staff1 | packer at the conveyor | sort_parcel | [0, 0] | 34 px | 12 (fixed) | picks parcels off the belt; the belt hides the boots (tape_box needed a 30 px step that put the boots on the far rail) |
| staff2 | packer at the packing table | tape_box | [-20, -10] | 31 px | 27 | the middle of the table, left of the bubble-wrap roll |

The scanner beam target is the top of the parcel on the counter; the tape roller runs along the box top. Pickers
(racks: `sort_parcel`, shelf heights per dir) and the dockhand (`carry_parcel` outside) need no lift. The game draws the
hub parcels at `bases.boxPoint.scan / .tape_box` (both `gb_parcel_m` at 0.20 m) at the worker's depth + 0.005 (over
the body, under the head / arms / tool).

## Previews (docs/previews, all looked at)

| File | What it shows |
|---|---|
| `gbf_polish.png` | critique BEFORE / AFTER at 2x and phone size: the hip hole (H1), the parcel on the coat (H2), ring NE (H3), carry sway / bob (M1), the cap crown grain (L3), ponytail under the cap (L9) |
| `gbf_hub_places.png` | the clerk, belt packer and table packer in the real logistics centre, BEFORE / AFTER (M2 / M3) |
| `gbf_doorstep.gif` | the delivery beat at house_a's door at 2x and phone zoom 0.6: carry_parcel NE -> ring_doorbell NE (flash behind the doll) -> hand_parcel NE -> idle |
| `gbf_lineup.png` | the 7 presets (ko / en labels): idle S, walk SE, the signature anim, idle N; idle SE at phone zoom 0.6 and 1.0 |
| `gbf_anims.png` | the 6 crew anims x 7 presets at the impact / mid frame, with the game-drawn parcels composed per the manifest |
| `gbf_carry_parcel.gif` `gbf_ring_doorbell.gif` `gbf_hand_parcel.gif` `gbf_scan.gif` `gbf_sort_parcel.gif` `gbf_tape_box.gif` | each crew anim in every dir incl. the mirrors, 3 presets, real fps; bellPoint ring on impact (ring), beam on impact (scan), parcels per the manifest; once anims hold the last frame |
| `gbf_carry_noitems.gif` | carry_parcel {noItems} in 8 dirs + the game's gb_parcel_m at boxPoint with parcelDepth |
| `gbf_points.png` | every point on its frames (boxPoint centre / bottom, handPoint, bellPoint, beamPoint window -> target, tapePoint, the static hub parcels) |
| `gbf_dirs_gb_driver.png` | every crew anim x dir x frame on the driver (review sheet) |
| `gbf_v4.png` | the uniform in idle / walk / talk / wave / happy (driver, picker, packer, rider, night) |
| `gbf_before_after.png` | BEFORE: the plan's fallback courier and officefolk's depot workers; AFTER: the 7 crew presets, at 1.3x and at 0.3 scale |
| `gbf_phone_z06.png` `gbf_phone_z10.png` `gbf_phone_z12.png` `gbf_phone_z16.png` `gbf_phone_night.png` `gbf_phone_road.png` `gbf_phone_all.png` `gbf_phone_p360.png` `gbf_phone_p360_z06.png` | the Phaser phone captures (390 x 844 @ DPR 3; 360 x 640 @ DPR 2) |
| `gbf_phone_details.png` | device-pixel crops of the captures: the clerk at the counter, packers / pickers, the two doorsteps (item and noItems), zoom 1.6, the crew row, night, 360 x 640 |

## Deviations from the contract (and why)

1. **Navy (brand rule over preset colour).** The contract asks for a navy cap and the packer's navy beanie, and also
   for navy <= 15 % of a sprite's opaque px. On the chibi body the hat dome alone is 30-40 % of the sprite (measured:
   driver 39 %, packer 49 % with a navy dome), and gold + a large blue block is the IKEA-like pair the plan forbids.
   So `hat_gb_cap` has a **charcoal** crown with **navy ear flaps** under the gold band / brim (worst navy 1.9 %),
   and `gb_packer` wears a **charcoal** beanie. Both read as the dark brand accent at phone zoom (gbf_lineup.png).
2. **gb_rider's scarf** is cream with navy stripes instead of solid navy: a navy scarf under the gold jacket + gold
   beanie made the sprite's two largest areas gold + blue (IKEA-like pair, dE 12.9 < 15). Navy stays as the accent.
3. **gb_dispatcher's hair** uses an ash / blue-black palette (`gb_hair_ash`): her big hatless hair next to the gold
   jacket was the UPS pair (warm dark brown + gold, dE 14.8). Boots never use navy (`gb_boots` = slate shades).
4. **Fixed-colour layers (texture memory, road page <= 3.5 MiB).** The cap is ONE fixed-colour layer (crown, flaps,
   band, brim, button, mark), so gb_night's brim is gold (his goldDark is the jacket); the vest is one fixed-colour
   layer (gold, goldDark hem, cream stripes, mark); the jacket's collar, chest band and both marks are one fixed
   `trim` layer, its body stays tinted (`top`: gold / goldDark). The parcel is fixed (deep kraft, cream label).
5. **Page routing.** `gbf_road_0` holds the road anims + the new parts' v4 anims as the contract says, except the depot
   crew's own v4 garments: top_sweater (packer) and top_parka (picker, dockhand) in carry_parcel / ring_doorbell /
   hand_parcel live on `gbf_hub_0` (`gbPages.hubRouted`). The parka's carry frames moved there in the polish pass to
   fit the third carry key in the road budget, so the dockhand's carry_parcel needs the depot scene (the docks are part
   of it); outside it he walks. Couriers (jacket, cap, scarf, beanie) never need the hub page.
6. **ring_doorbell** holds the press for 2 frames (keys 0 1 2 2 1 0: 띵 on 2, 동 on 3, one pose). Facing away the
   parcel is under the right arm and the left mitten rings (critique H3).
7. **Extras in the manifest** (non-breaking): `bases.boxPoint.scan / .tape_box`, `hub.places[staffN] = {role, point,
   dir, anim, offsetPx, frontTopPx, parcelBottomPx, liftPx, why}` measured from assets/logistics, `parcelDepth`,
   `gbPages.hubRouted`, item notes (`items.*`, `items.gbOthers`), `crew` names / signatures, `brand`.
8. **Checks.** The navy metric is the 금방 vehicles job's (`gb_check.py`: dE2000 < 10 to navy at 0.8 / 1.0 / 1.2 and
   chroma >= 20, alpha >= 240) so both sets measure the same thing. "Crew distinct from depot_worker at 0.3 scale" is
   measured per pixel on the torso band of same-base 38 px thumbnails, >= 10 dE. The mark's mirror test runs on the
   texture at the sizes it is drawn (24 / 14 / 10 / 7 px). Holes / contrast / visibility rules: see Polish.
9. **128 colours per page** (townfolk uses 64): the 64-colour / 0.5-dither palette put light specks on the fixed
   charcoal and kraft layers (critique L3). PNG payload +0.10 MB; texture memory is unchanged (RGBA on the GPU).

## Known limits

- gb_night's goldDark jacket is the closest to the deep kraft parcel: dE 10.6-16.7 (the gold jackets 12.9-22.4). It reads
  at zoom 1.0 (`gbf_phone_night.png`); a darker label band would push it further.
- `sort_parcel` NE / NW at the racks shows 7-38 px of parcel (critique L2, left as is).
- hand_parcel's offering frames keep the mittens ~0.1 m short of the IK target (the chibi arm is fully stretched);
  handPoint is measured on the rendered mittens, so the flying parcel starts between them (NE: beside the camera-side
  mitten).
- The game's own parcels (`gb_parcel_s/m/l`, the vehicles job) are still the light kraft `#C99A62` with gold tape: at
  hand_parcel / noItems the box changes tone against the held deep kraft. Handoff below.
- Facing away the bell is behind the courier's head: the flash is drawn behind the doll (manifest note) and is mostly
  hidden; the 띵-동 sound carries the beat. Drawn on top it would land on the back of the cap.
- Random townsfolk play the crew anims only when everything they wear is in the cover (~1.6 %); otherwise pickAnim
  falls back (walk / talk / idle). The 7 presets always can.
- adult_round draws the slim frames stretched (townfolk rule): points / groundSpeed are scaled per base in the manifest.
- Phaser timing under swiftshader on a shared box is 1.5-3 s per frame for the whole scene (software GL, CPU shared
  with other jobs); the meaningful numbers are the draw calls and texture binds per frame.

## Handoffs

- **Vehicles / hub job (assets/geumbang):** retone `gb_parcel_s/m/l` to this set's parcel (sides `#704E30` /
  `#523A25`, lid `#9A7A52`, cream label, gold tape, the mark sticker) so the held box and the game's box are one parcel.
- **Game code (src/**, v4.2 owner):** call `installGeumbangfolkRuntime(TF)` after merging (again if officefolk merges
  later); stand hub workers at `staffPoint + offsetPx`, play `places[].anim`, lift by `liftPx`; draw game parcels at
  `parcelDepth[anim][dir]`; the bell flash behind the doll facing away (NE / NW / N).

## Reproduce

```
B=nice -n 10 /tmp/bvenv/bin/python          # one Blender at a time
nice -n 10 python3 tools/blender/gbf_mark.py  # mark texture (PIL) -> /tmp/fv_cache/geumbangfolk/mark
$B tools/blender/gbf_render.py -- --mode head --samples 48
$B tools/blender/gbf_render.py -- --mode body --pass all
$B tools/blender/gbf_render.py -- --mode meta
nice -n 10 python3 tools/blender/gbf_pack.py                  # 128 colours, dither 0.25
nice -n 10 python3 tools/blender/gbf_check.py --dump /tmp/fv_cache/geumbangfolk/review/gbf_cases.json   # --fragments bare|v43|all
nice -n 10 node tools/test/geumbangfolk_phaser.mjs --parity /tmp/fv_cache/geumbangfolk/review/gbf_cases.json
nice -n 10 node tools/test/geumbangfolk_phaser.mjs --jsgen
nice -n 10 node tools/test/geumbangfolk_phaser.mjs                       # GBF_RUNS=z06,z10,... for a subset
nice -n 10 python3 tools/blender/gbf_preview.py               # GBF_BEFORE_ASSETS=<old assets root> for gbf_polish / hub_places BEFORE
```
