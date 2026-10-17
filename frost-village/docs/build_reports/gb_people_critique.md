# Critique: gb_people (금방 crew, `assets/geumbangfolk`)

Adversarial art review of the geumbangfolk fragment against `docs/CONTRACT_GEUMBANG.md` §AP / §AS and
`docs/geumbang_plan.md` §5.4–5.6 and §7. The review was read-only: nothing in the repo was changed except this file.
Every probe, harness and capture is in the critic scratch folder
`/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/geumbang_gb_people_review/`, written
`$C` below.

## Verdict: **polish** (0 critical · 4 high · 3 medium · 9 low)

The crew is charming and sits in the house style. On a phone at zoom 0.6 the seven presets read at once as one gold
team: the cap people (driver, dockhand, night driver), the gold beanies (picker, rider), the charcoal beanie (packer)
and 방금순 with her hair and glasses. They are clearly different from the officefolk depot workers, from 딸랑이 and from
the townsfolk around them, by day and by night. Light, the ink edge, scale and the chibi proportions match the townfolk
neighbours. The brand is original: no letters, a symmetric mark, and no listed courier colour pair.

Four problems sit in the core delivery loop, which the designer will watch first, so the set should not ship as it is:

- **H1:** the gold jacket has a see-through hole at the hip in every crew anim seen from E / W, SE / SW or NE / NW.
- **H2:** the parcel the courier hugs is nearly the same colour as the gold jacket, so the box disappears.
- **H3:** at the door (`ring_doorbell` NE / NW, the direction every doorbell is rung from) the parcel is not drawn at all.
- **H4:** the shipped runtime patch makes the game's `TF.pick` believe the 금방 pages are always loaded, so a depot
  worker can be drawn as a floating head.

None of this needs a new art direction:
- H1 is one re-render of the jacket's crew-anim torso keys.
- H2 is the parcel's material.
- H3 is one re-posed anim, or a data-only "set it down" beat.
- H4 is three lines of code.

## 디자이너용 요약 (쉬운 말)

**좋은 점**
- 금방 직원 7명이 휴대폰 화면에서도 "한 팀"으로 바로 보여요. 꿀금색 패딩, 금색 띠 모자, 금색 비니가 귀엽고, 마을 사람들이나
  물류창고 직원(주황 비니 + 형광 조끼)과도 잘 구별돼요. 밤에도 잘 보여요.
- 등판의 금방이 마크, 크림색 깃과 가슴 띠가 예쁘고, 글자나 다른 회사 로고는 없어요. 쿠팡, 배민, 우체국 같은 색 조합도 아니에요.
- 크기, 빛, 외곽선이 기존 마을 사람들과 똑같아서 같은 세계 사람처럼 보여요.

**꼭 고칠 점**
1. **패딩 엉덩이 쪽에 구멍이 있어요.** 기사님이 옆이나 뒤를 볼 때 (상자 들고 걷기, 초인종, 건네기, 스캔, 분류, 테이프 작업)
   패딩 아래쪽에 손톱만 한 구멍이 뚫려 있어서 바닥(눈, 돌길)이 비쳐 보여요. 눈 위에서는 하얀 얼룩처럼 보여요.
2. **상자가 패딩 색에 묻혀요.** 기사님이 안고 가는 상자 색이 금색 패딩과 거의 같아서, 휴대폰에서는 "상자를 안고 있다"가 잘 안
   보여요. (물류센터 상자처럼 갈색 크래프트에 밝은 윗면이면 잘 보여요.)
3. **초인종 누를 때 상자가 사라져요.** 집 문은 화면 아래쪽을 보고 있어서 기사님은 늘 뒤돌아 초인종을 눌러요. 그런데 이 방향에서는
   상자가 몸 뒤에 완전히 가려져서, 상자를 들고 오다가 문 앞에서 갑자기 상자가 없어졌다가 건넬 때 다시 나타나요.
4. **게임 코드 연결 문제 (코드 담당용).** 물류센터가 화면에 없을 때도 게임이 "직원 그림이 준비됐다"고 착각해서, 포장 직원이
   몸 없이 머리만 떠 보일 수 있어요. 세 줄이면 고쳐져요.

**그 밖에 보이는 것들**
- 상자를 들고 걸을 때 몸통이 거의 흔들리지 않아서 (1픽셀), 다리만 걷고 윗몸은 미끄러지는 것처럼 뻣뻣해 보여요.
- 물류센터 안에서:
  - 방금순 팀장의 얼굴 반이 카운터의 노란 안내판에 가려요.
  - 컨베이어 앞 포장 직원은 벨트 위에 떠 있는 것처럼 보여요.
  - 포장대 직원은 뽁뽁이 롤에 손이 가려서 "찌익" 테이프 작업이 안 보여요.
- 그 밖에 작은 것들:
  - 모자 윗부분에 모래 같은 작은 점이 보여요.
  - 선반에서 물건을 꺼낼 때 상자가 몸에 가려서 안 보여요.

---

## How it was tested

**Static checks**
- I read §AP / §AS, plan §5.4–5.6 and §7, the build report and the whole manifest, then wrote my own contract table
  (below).
- I re-ran `tools/blender/gbf_check.py --fragments bare|v43|all` without `--dump`, so the builder's cache was untouched.
  Every run gave 0 errors and 0 warnings, and every budget line was reproduced.

**Pixel probes (`$C/tools/`, repo compositors used as a library)**

| Script | What it does |
|---|---|
| `layers.py` | per-layer stacks, ΔE2000 |
| `parcel_contrast.py` | parcel against its 3 px surround |
| `holes.py`, `holes2.py`, `holeviz.py`, `layerholes.py` | enclosed see-through pixels in composites and in single layers |
| `halo.py` | edge luminance against the interior, compared with the townfolk / officefolk layers |
| `noise.py` | grain |
| `feet.py` | planted foot at `groundSpeed`, compared with cityfolk `walk` / `carry_box` |
| `points.py` | every manifest point against the pixels it names |
| `pairs.py` | dominant colour pairs against the plan §7.4 brand pairs |
| `bobgif.py` | `carry_parcel` against cityfolk `carry_box`, officefolk `carry_sack` and townfolk `walk` |

**Game path (`$C/node/`)**
- `gamepath.mjs` runs the game's real incremental order: `TF.init(townfolk)`, then `TF.mergeOfficefolk(officefolk)`,
  then the documented 금방 recipe (`mergeGeumbangfolk({atlases, townfolk: TF.T}, gb)` and
  `installGeumbangfolkRuntime(TF)`).
  - It compares `TF.layersInto` with a one-shot `Geumbangfolk.layers`.
  - Result: **144,200 / 144,200 draw lists identical**, plus 350 / 350 persons and 0 pick mismatches.
- `pickres.mjs` checks the game's `TF.pick` against page residency (H4).

**Own Phaser 3.90 harness (`$C/harness.mjs` + `$C/page.js`, headless Chromium, `nice -n 10`)**
- Code used: the repo's `serve.mjs`, `pw.mjs` and `geumbangfolk_compose.js`, read-only.
- Screens:
  - 390 × 844 CSS at DPR 3, with the logical 720 px canvas and k = 1.65 as in `src/main.js`;
  - 360 × 640 at DPR 2 (k = 1).
- Zooms and lighting: 0.6, 1.0, 1.2 and 1.6, by day and by night (the DayClock MULTIPLY `0x5a6aa8` at 0.45).
- Ground: real ground textures (`ground_snow`, `road_cobble_wide`, `road_dirt`, `ground_plaza`).
- Neighbours drawn alongside:
  - `house_a` with its `doorPoint`;
  - the 금방 van and `gb_parcel_*` from `assets/geumbang`;
  - the logistics centre in its cut state, with `hub.places` lifts;
  - officefolk `courier` (딸랑이) and `depot_worker`;
  - random townsfolk.
- Every run: 0 page errors, 0 404s, 0 missing frames.
- Shots are in `$C/shots/` (`door_*`, `door2_*`, `row_*`, `hub_*`); crops use `$C/tools/crop.py`.

## What is good (keep)

- **Contract.**
  - Header, the 6 anims (frames / fps / repeat / dirs / impact / bow), head poses, `animItems`, `animFallback`,
    `boxPoint` format, the noItems depth rule, presets and pages all match §AP. Deviations are documented.
  - Budgets: `gbf_road_0` 3.31 / 3.5 MiB, `gbf_hub_0` 1.58 / 2.5 MiB, 4.89 / 6 MiB in total; 5 source / 3 shipped
    files; 0.53 MB payload.
- **Merge.**
  - It merges bare, v4.3 and all (re-checked).
  - The game's incremental officefolk-then-금방 path draws identically, in 144,200 cases.
- **Style.**
  - Edges match the house: edge pixels are darker than the interior, with no light halos.

    | Layer | Edge Y − interior Y |
    |---|---|
    | gb jacket | −0.37 |
    | gb vest | −0.28 |
    | gb cap | −0.16 |
    | townfolk `top_puffer` | −0.32 |
    | townfolk `hat_beanie` | −0.38 |

  - The jacket body is tinted like townfolk, with grain 2.9 against 2.0 for `top_puffer`.
  - Scale and proportions are the townfolk bases.
  - The crew stands about half the van's height, like every other doll.
- **Motion.**
  - Planted-foot drift in `carry_parcel` at `groundSpeed` is S 2.3, SE 3.3, E 4.9, NE 5.2 and N 3.3 px per frame
    (mean). That is the same class as cityfolk `walk` (1.8 / 3.0 / 5.1 / 4.8 / 4.0), so there is no skating.
  - `bellPoint` sits on the pressing mitten within 0.2–0.7 px; it is hidden in N, as it should be.
  - `tapePoint` is on the tape gun within 0.7 px.
  - `beamPoint` starts on the scanner.
  - `carry_parcel` `boxPoint` is within 0.5–1.9 px of the rendered parcel in S / SE / E.
- **Phone read.**
  - At zoom 0.6 the team identity holds on snow, cobble, dirt and plaza, at 360 × 640, and at night.
  - The back 금방이 mark reads as a cream badge from zoom 1.0 up.
- **Brand.**
  - No letters on any sprite. The mark is the vehicles job's symmetric texture.
  - Rendered dominant pairs are at ΔE2000 ≥ 17 from every plan §7.4 pair:

    | Pair | ΔE2000 (driver) |
    |---|---|
    | IKEA-like | 17.0 |
    | Yamato | 24.3 |
    | UPS | 23.1 |

  - Gold sits next to cream and charcoal, never red. Nothing echoes Coupang (blue / red), 배민 (mint) or 우체국.
  - Navy is at most 0.7 %.

## Contract compliance (§AP / §AS)

| Item | Result |
|---|---|
| Header / merge order | ✓ (`requires [townfolk]`, `mergeAfter` the 4 fragments; bare / v4.3 / all re-checked) |
| 6 anims (f · fps · repeat · dirs, impact 2 / 3, bow 5) | ✓ |
| Head poses (loco, soc / loco, soc, down→nod) | ✓ (the `down→nod` fallback is applied when townfolk2 is absent) |
| Items | ✓ `held_parcel_gb` (main / small), `held_scanner`, `held_tapegun` |
| `boxPoint` [cx, cy, bx, by], noItems depth +0.0045 / −0.0001, mirrors negate x | ✓ by data. ✗ in effect at the door: H3 |
| Fallbacks | ✓ (`carry→walk`, `ring/hand→talk→idle`, hub anims `→idle`) |
| Parts | `hat_gb_cap` crown is **charcoal**, not navy (deviation 1; accepted, see L6). Vest and cap are fixed colour (deviation 4) |
| Cover | ✓ (body parts only; head parts need no cover) |
| Presets | ✓, with deviations 1–3: packer charcoal beanie, rider cream / navy scarf, dispatcher ash hair |
| Pages ≤ 3.5 / ≤ 2.5 MiB | ✓ 3.31 / 1.58 |
| "500-person parity" | ✓, and the game's own incremental merge path is identical (144,200 cases) |
| AS test matrix (390 × 844 **and 360 × 640**, zoom 0.6 / 1 / **1.6**, day / night, **snow / cobble / dirt**) | ✗ in the builder's test: 390 × 844 only, 0.6 / 1.0 / 1.2, a flat fill instead of ground. Covered here; see L5 |
| AS brand checks | ✓ for no letters, mirror and pairs |
| AS: crew distinct from `depot_worker` at 0.3 scale | ✓ |

## Findings

| # | Sev | Area | Finding |
|---|---|---|---|
| H1 | High | `top_gb_jacket.main` crew anims | See-through hole (about 12 × 6 px, composite alpha 0.08–0.15) at the hip in E / W, SE / SW and NE / NW, on every frame and on all 4 jacket presets |
| H2 | High | `held_parcel_gb` vs jacket | The hugged parcel is ΔE2000 1.6–6.3 from the jacket around it, so the box melts into the coat at phone zoom |
| H3 | High | `ring_doorbell` NE / NW (+ `boxPoint` NE) | The parcel is 0–5 px visible while ringing (z 2.5, or depth −0.0001 with noItems). Doors face the camera, so every ring is NE / NW |
| H4 | High | `installGeumbangfolkRuntime` / `TF.pick` | `TF.ofReady('hub')` and `TF.ofReady('road')` are always true and `want()` is never called, so hub anims are picked with `gbf_hub_0` unloaded: 10–12 body layers missing |
| M1 | Medium | `carry_parcel` acting | The upper body has 0 px sway and a 1 px bob, against ±2–3 px sway and a 2–3 px bob in every sibling carry / walk. It glides on the walking legs |
| M2 | Medium | `hub.places.staff0` | 방금순 at the counter (lift 39): the counter's yellow board covers half her face |
| M3 | Medium | `hub.places.staff1 / staff2` | The belt packer's boots sit on the far rail (he floats). At the table the bubble-wrap roll hides the hands, the tape gun and the box |
| L1 | Low | `hand_parcel` NE / NW | No depth rule for the flown parcel. `handPoint` is 6–9.5 px from the only visible mitten |
| L2 | Low | `sort_parcel` NE / NW | Pickers always face NE / NW at the racks; the picked parcel shows 7–38 px |
| L3 | Low | fixed-colour layers | Quantisation grain: cap crown 6.6 against townfolk beanie 0.5 (light specks on charcoal, visible from zoom 1.0); parcel speckle |
| L4 | Low | manifest docs | `brand.notes` says the vest is tinted `acc` and the cap tinted `hat` / `hat2`, but both are fixed. Preset colours for the fixed parts are dead data |
| L5 | Low | builder tests | No 360 × 640, no zoom 1.6, no real ground. No hole or contrast check in `gbf_check.py`, which is why H1 and H2 passed |
| L6 | Low | brand balance | The dominant pair is gold + charcoal (19–38 % dark), not the plan's gold + cream; the IKEA-like margin is 17 against a rule of 15 (designer call) |
| L7 | Low | `boxPoint` | `carry_parcel` NE centre is 5.5 px from the rendered held parcel; `ring_doorbell` NE / N is 7.6–10.3 px, so a noItems ↔ item swap jumps |
| L8 | Low | hub clerk | The counter parcel is 0.14 m (about 8 px); at 0.6 the beam target is a speck |
| L9 | Low | cap + `hair_ponytail` | The ponytail sticks up behind the crown in SE / E and covers the back mark in N (about 1 in 7 drivers) |

---

### H1 · High · see-through hole in the gold jacket (every crew anim, side and back views)

**Repro.** Any jacket preset (`gb_driver`, `gb_dispatcher`, `gb_rider`, `gb_night`), any crew anim, dir E / W, SE / SW
or NE / NW, any frame. Compose it with `geumbangfolk_compose.py`, or draw it in Phaser on any ground.

**Evidence.**
- **Composite hole size** (enclosed, alpha < 0.5, below the head; `$C/tools/holes2.py`), max px per anim and dir:

  | Anim | Hole sizes (max px) |
  |---|---|
  | `carry_parcel` | E 44, NE 25–28, SE 19 |
  | `ring_doorbell` | E 49, NE 21 |
  | `hand_parcel` | E 49, NE 21–24, SE 24 |
  | `scan` | E 49, SE 19 |
  | `sort_parcel` | E 49, NE 35, SE 20 |
  | `tape_box` | E 46, SE 19 |

  - It appears on every frame, for example `carry_parcel` E 8 / 8 and `ring_doorbell` NE 6 / 6. The mean composite
    alpha in the hole is 0.08–0.15, so it is nearly fully see-through.
  - The same anims on parka / sweater wearers have 0 px of hole. The jacket in idle / walk / talk / wave / happy has
    0 px.
- **Cause.**
  - The hole is inside `top_gb_jacket.main@…/<crew anim>_<dir>_<i>`: layer alpha is 0.33–0.49, bounded only by the
    jacket itself.
  - In E it sits about 8 px left of the anchor to 4 px right of it, and 18–24 px above the anchor (the back hip). This
    is the shared crew-anim torso key; it looks like an arm or mitten holdout that is not covered by any drawn layer.
- **Pictures.**

  | File | What it shows |
  |---|---|
  | `$C/out/holes_viz.png` | the hole in magenta |
  | `$C/shots/door_z10_crops.png` | A / B / C / D at the door, zoom 1.0: a white blob with a dark speck at the right hip |
  | `$C/shots/door_z16_crops.png` | G `carry E` and I `ring E` at zoom 1.6 |
  | `$C/shots/door2_z12_crops.png` | dirt and cobble ground |

  The builder's own `gbf_anims.png` (ring row) and `gbf_phone_details.png` (the rider at the door) show the same white
  spot.

**Why it matters.** These are exactly the couriers' doorstep and walking views. On snow the hole looks like a stray
white patch; on cobble or dirt the ground shows through the coat.

**Fix.**
- In `gbf_render.py` (torso / act pass), render the crew-anim jacket torso keys without the arm / mitten holdout. Or
  fill the holdout with the jacket's own back surface: the far arm is not drawn in those keys.
- Re-pack. That is about 6 torso keys × 3 dirs per base.
- Add a `gbf_check.py` rule: no enclosed pixel with alpha < 0.5 inside the composite silhouette below the neck, for every
  preset × anim × dir × frame.

### H2 · High · the courier's parcel melts into the gold jacket

**Repro.** `gb_driver`, `gb_dispatcher`, `gb_rider` or `gb_night` in `carry_parcel` S / SE / E, or `ring_doorbell` E,
at zoom 0.6–1.0.

**Evidence** (`$C/tools/parcel_contrast.py`, `$C/out/parcel_contrast.txt`).
- **Measure:** ΔE2000 between the visible parcel's mean colour and the 3 px ring around it. The rendered parcel is about
  (196, 154, 96); the jacket around it is about (203, 164, 89).

  | Preset | S | SE | E |
  |---|---|---|---|
  | driver | 4.5 | 4.2 | 6.3 |
  | dispatcher | 3.9 | 3.6 | 4.8 |
  | rider | 3.5 | 3.4 | 4.3 |
  | night | 3.0 | 2.7 | 2.6 |

  - `ring_doorbell` E: 1.6–4.2.
  - Parka / sweater presets: 3.8–11.2.
- **The game's `gb_parcel_s/m/l` is not much better:** ΔE about 8 from the jacket and 3.3–3.7 from the held parcel.
- **Comparison with cityfolk:** `$C/out/bob_strip.png` puts cityfolk `carry_box` beside it. Its kraft box with a light
  top and a tape stripe reads at once even against a brown coat, while the 금방 courier hugs "a darker gold patch".
- **In game:** `$C/shots/door_z06_crops_sel.png` (zoom 0.6), `$C/shots/door_z16_crops.png` (zoom 1.6, E `carry S`) and
  `$C/out/z_gb_driver_0_carry_parcel_S_0-2.png` (5×).

**Why it matters.** "기사님이 상자를 안고 띵동" is the beat the designer asked for. At phone zoom the box is the
story, and here it is camouflaged by the uniform. The brand rule makes the jacket gold, so the box must change.

**Fix.**
- Re-render `held_parcel_gb` (main + small) and, ideally, ask the vehicles job to match `gb_parcel_*`:
  - a lighter, cooler kraft top face, around L* 75–80 and less saturated;
  - darker side faces (L* about 50);
  - a clear cream label or tape band across the top.
- Target ΔE2000 ≥ 12 against the jacket ring in S / SE / E. The gold tape cross alone cannot do it, because it is gold
  on gold.
- Add the contrast check to `gbf_check.py`.

### H3 · High · at the door the parcel is invisible (`ring_doorbell` NE / NW)

**Repro.** `house_a`'s front faces screen down-left (`front: -Y`), so the courier stands SW of the door and plays
`ring_doorbell` NE. A door facing SE gives NW. Draw it with the item, or with noItems plus `gb_parcel_m` at
`boxPoint.ring_doorbell` at depth −0.0001, as the manifest says.

**Evidence.**
- **Visible parcel area at f2:** NE 0–5 px for every preset, N 26–53 px, E 279–339 px. The item is at z 2.5, behind the
  body, under the far (left) arm.
- **`boxPoint.ring_doorbell` NE** is 9–10 px from the rendered item (`$C/out/points.txt`). Even a game-drawn parcel would
  not line up, and at −0.0001 it is hidden anyway.
- **Pictures:** `$C/shots/door_z10_crops.png` panels A (item) and B (noItems + game parcel): no box. The builder's
  `gbf_phone_details.png` doorstep panel shows the same.
- **Sequence the player sees:** `carry_parcel` NE (box visible at the right side), then ring with no box for 0.75 s plus
  the hold until the door opens, then `hand_parcel`, where the box reappears from `handPoint`. The box pops out and back.

**Fix.** Choose one.
- **(a)** Re-pose `ring_doorbell` NE / N so that the parcel rides on the camera side. In NE / N the right side faces the
  camera, and the box sticks out to the right as it already does in `carry_parcel` NE. The bell stays a left-hand press,
  or the parcel is hugged in the right elbow while the right forearm rises.
- **(b)** Data only, with no re-render. Add `doorstepPoint[dir]` and a "set the box down" beat: the game draws
  `gb_parcel_doorstep` f0 at the feet before the ring, and the courier picks it up for `hand_parcel`. This also gives
  the "문 앞에 두고 갈게요" path its pose for free.
- In either case, fix `boxPoint.ring_doorbell` NE / N to the parcel that is actually drawn.

### H4 · High · the runtime patch tells `TF.pick` that the 금방 pages are always loaded

**Repro.** `node $C/node/pickres.mjs` (output in `$C/out/pick_residency.txt`). It merges in the game's order, runs
`installGeumbangfolkRuntime(TF)`, and makes every sheet ready except `gbf_hub_0`.

**Evidence.**
- `TF.ofAtlas` only knows `desk / work / errand / sack`, so `TF.ofReady('hub')` and `TF.ofReady('road')` both return
  `true`, and `want()` is never called.

  | Request | `TF.pick` | Honest `pickAnim` | Body layers on the unloaded `gbf_hub_0` |
  |---|---|---|---|
  | `gb_packer` `tape_box` | `tape_box` | `idle` | 10 (pants, boots, sweater, vest, arms …) |
  | `gb_dispatcher` `scan` | `scan` | `idle` | 11 |
  | `gb_picker` `sort_parcel` | `sort_parcel` | `idle` | 12 |
  | `gb_packer` `ring_doorbell` | `ring_doorbell` | `talk` | 2 (`top_sweater`) |

- The report says that after the install `TF.pick` "knows the crew anims too". It does, but it has no residency for
  them. A depot worker asked for a hub anim off the depot is therefore drawn as a head and hands. Residency is also never
  asked to load the hub page.
- Without officefolk (bare merge) `TF.of` stays null, and `TF.pick` returns any crew anim unchecked.

**Fix**, in `installGeumbangfolkRuntime`:
```js
TF.of = gb;                                     // also when officefolk is absent
TF.ofAtlas = Object.assign({}, TF.ofAtlas);
for (const [g, inf] of Object.entries((TF.T.gbPages || {}).groups || {})) TF.ofAtlas[g] = (inf.atlases || [])[0];
```
Then extend `--parity` with a residency case: hub page missing, so `TF.pick` must equal
`pickAnim(..., {has: pageNeeded})`.

### M1 · Medium · `carry_parcel` upper body glides (0 px sway, 1 px bob)

**Evidence.** `headOffset.carry_parcel`, compared with sibling anims:

| Anim | Head offset (adult_slim) | Sway | Bob |
|---|---|---|---|
| 금방 `carry_parcel` S | (0, −44)(0, −44)(0, −43)(0, −43)… | 0 px | 1 px, 2 levels |
| 금방 `carry_parcel` SE / E / NE | same pattern | 0 px | 1 px |
| cityfolk `carry_box` | — | ±2 px | 2 px |
| officefolk `carry_sack` | — | ±3 px | 3 px |
| townfolk `walk` | — | ±3 px | 3 px |

The parcel, arms and torso share 2 bob keys (`cw_hi` / `cw_lo`). See `$C/out/bob_strip.png` and
`$C/out/bob_compare.gif`. Legs walk while a rigid block slides over them: the walk a sharp eye notices first.

**Fix.**
- Give the 8 frames 4 torso keys (hi / mid / lo / mid) with ±1–2 px lateral sway, matching `carry_box`.
- Memory: about +4 shared torso renders per dir. `gbf_road_0` has 0.19 MiB of headroom, so move `hubRouted`-style
  frames or shrink the cap pass if needed.

### M2 · Medium · 방금순's face is half hidden by the counter board (`hub.places.staff0`)

**Evidence.**
- With the documented lift (39 px, SW), the counter's yellow display board on its pole sits over her left cheek and
  glasses.
- `$C/shots/hub_z12_clerk.png`; the builder's `gbf_phone_details.png` (first panel) shows the same.
- She is the founder and the voice of "네~ 금방입니다!".

**Fix.** Add a per-place stand offset to `hub.places` (for example `staff0.offsetPx: [+16, +8]`, sliding her along the
counter, clear of the board) and re-measure `frontTopPx` there. Or play `talk` / `scan` facing S at that spot.

### M3 · Medium · the packers at the belt and at the table do not read

**Evidence.**
- **staff1** (`tape_box`, lift 30): the boots show just above the belt's far rail, so he reads as standing on the belt.
  The builder lists this as a known limit. The game's 0.20 m box hangs at belly height above the rail
  (`$C/shots/hub_z12_packer1.png`).
- **staff2** (lift 9): the logistics centre's bubble-wrap roll on the packing table is drawn in front of his hands, the
  tape gun and the box, so the 찌익 never shows (`$C/shots/hub_z12_packer2.png`).

**Fix.**
- staff1: play `sort_parcel` (no lift), as the builder suggests, or add a stand offset.
- staff2: offset him to the free end of the table, or let the box sit on the right of the roll (a per-place `boxOffset`).
- Re-shoot the hub at zoom 1.2.

### Lows

- **L1 · `hand_parcel` NE / NW.**
  - `items.hand_parcel` has no depth rule, and `handPoint` NE is 6–9.5 px from the visible mitten.
  - With +0.0045 the flown box sits on the jacket's right side; with −0.0001 it is hidden (`$C/shots/door_z10_crops.png`
    C / D).
  - Fix: specify +0.0045 with a few px of x toward the camera side for NE / NW.
- **L2 · `sort_parcel` NE / NW** (the racks' `staffDirs`). The small parcel shows only 7–38 px, so picking reads as
  reaching. That is acceptable because the rack stack drops, but a parcel in the right hand on the camera side would sell
  it.
- **L3 · Grain.**
  - Fixed-colour layers carry quantisation specks:

    | Layer | Grain |
    |---|---|
    | cap crown | 6.6 |
    | vest | 6.4 |
    | jacket trim | 6.1 |
    | `held_parcel_gb` | 7.9 |
    | townfolk `hat_beanie` | 0.5 |
    | officefolk hi-vis | 0.7 |

  - On the charcoal crown they show as sandy light dots from zoom 1.0 (`$C/out/raw_hat_gb_cap…png`).
  - Fix: tint the crown (grey render + `hat` tint) or exclude it from dithering.
- **L4 · `brand.notes` is stale.** It says the vest is tinted `acc` and the cap tinted `hat` / `hat2`. Both are fixed
  layers, so `generator.presets.*.colors.hat / hat2 / acc` for these parts do nothing.
- **L5 · Builder test coverage.** `geumbangfolk_phaser.mjs` runs 390 × 844 only, zoom 0.6 / 1.0 / 1.2, on a flat fill;
  §AS asks for 360 × 640, zoom 1.6 and snow / cobble / dirt. `gbf_check.py` has no hole, contrast or "item visible in
  the dir it is used" rule. Those three gaps let H1–H3 through.
- **L6 · Brand balance (designer call).**
  - Because the cap became charcoal, the presets' two largest areas are gold and charcoal (the packer: charcoal beanie
    and trousers), with a dark share of 19–38 %, not the plan's "gold + cream".
  - All pair checks pass, but the IKEA-like margin is only 17 against the 15 rule (driver).
  - A cream band or crown highlight on the cap would pull it back toward gold + cream.
- **L7 · `boxPoint`.** `carry_parcel` NE centre is 5.5 px from the held item, and `ring_doorbell` NE / N is 7.6–10.3 px.
  A sprite switching between item and noItems jumps.
- **L8 · Counter parcel.** `scan`'s counter parcel is 0.14 m (about 8 px world), mostly behind the counter front. At zoom
  0.6 the beam ends on a speck.
- **L9 · Cap with `hair_ponytail` / `hair_lowbun`** (`$C/out/hair_cap.png`). The tail rises behind the crown in SE / E
  and covers the back mark in N. Hiding the back sub under `hat_gb_cap`, or using the beanie-style `~hat` short tail,
  would keep the mark readable.

## Fix order

1. **Code / data only.**
   - H4: three lines.
   - H3 (b): `doorstepPoint` plus the set-down beat.
   - M2 / M3: stand offsets in `hub.places`.
   - L1, L4 and L7.
2. **Re-render.**
   - H1: jacket crew torso keys.
   - H2: parcel material.
   - M1: 4-key carry upper body.
   - Optionally H3 (a): ring NE / N.
   - L3: crown tint.
3. **Re-run.**
   - `gbf_check.py` with the new hole, contrast and visibility rules.
   - The Phaser test with 360 × 640, zoom 1.6 and real ground.
