# Contract addendum 금방 (v4.3): van, hub, props, crew, app UI, sounds

Extends CONTRACT.md … CONTRACT_V42.md (PPU 64, `bl_common`, 2:1 iso, manifest §2, paths under `frost-village/assets/`).
Design: `docs/geumbang_plan.md`. New folders/tools only. Blender 5.2 under `nice -n 10`, one at a time. No e-scooter or
e-trike: the village uses `dog_sled` + `gb_pennant`.

**Brand (all jobs).**
- Colours: gold `#F2B33D`, goldDark `#D9962A`, cream `#F4EDE0`, charcoal `#3B3F52`, navy `#2B4F7E` (navy ≤ 15 % of a
  sprite's opaque px).
- **Mark 금방이:** a gold disc (goldDark rim) holding a face-on cream parcel with navy dot eyes, pink cheeks and an "o"
  mouth, and a cream 4-point sparkle above. Symmetric; reads at 24 px.
- Never: rocket, wings, bird, arrow-smile, lightning, cat; gold beside red/brown/black or a big navy block.
- Text (Jua / Fredoka Bold) only in listed keys. **No letters or asymmetric marks on any mirrored sprite.**

## AO. `assets/geumbang/` (Blender; `lgx_vehicles.py` van builder with a livery override)
Pages: `gb_van_0` (van + roof sign, ≤ 2048 × 1024, ≤ 8 MiB), `gb_bld_0` (the rest, ≤ 1024², ≤ 2.5 MiB). Manifest
`brand` = the colours.

**AO.1 `gb_van`** (vehicle, family `delivery_van`, variant `gb`, era 3, role `gb`).
- Rig = `delivery_van_red`: frame [284, 252], anchor [0.50352, 0.75], dirs SE, NE (SW ← SE, NW ← NE flipX), same sizes,
  every point field copied (0 px).
- Gold body, cream roof band + snow, navy belt line, mark (≥ 36 px) on both sides.
- Anims:
  - `idle` 2 f · 6 fps, `move` 4 f · 10 fps loops (red's bobPx) + `over_{anim}_{dir}_{i}`.
  - `door` 3 f · 10 fps once: driver door opens.
  - `unload` 4 f · 8 fps once: rear doors open; f3 shows 3 parcels.
  - `door`/`unload` are **patches** (full-render crops over `idle_{dir}_0`, ≤ 0.5 % px diff).
- New points per dir: `roofSignPoint`, `parcelPoints[3]` (`unload` f3).

**AO.2 `gb_van_turn`**
- 8 headings: S, E, N rendered; W ← E. `turn_{dir}_0` + `over_turn_{dir}_0`; frame ≤ [368, 352];
  anchor = ground at the van centre.
- Points: seats\*, light/tailPoints, roofSignPoint, shadow, footprintPoly.
- Shown 0.3 s mid-corner; first cut if `gb_van_0` > 8 MiB.

**AO.3 `gb_roofsign_{ko|en}_{0|1}`**
- 0 day, 1 lit; 96 × 56, anchor [0.5, 1] on `roofSignPoint`, never mirrored: cream A-board, gold rim, mark, navy
  "금방" / "GEUMBANG".

**AO.4 Hub layers** (of `logistics_center`, frame [1152, 864], anchor [0.41493, 0.58912], trimmed, fade with `_shell`)
- `gb_nameplate_ko` (mark, big "금방", small "물류센터"), `gb_nameplate_en` ("GEUMBANG" / "CENTRE"),
  `seori_nameplate_ko` ("서리 물류창고"), `seori_nameplate_en` ("Frost Depot").
  - kind `layer`, depthOffset 0.0005, `replaces: nameplate_<lang>`.
  - Raised navy letters lit like the shell, inside `nameBoard` (137 × 43 px, shear 0.5).
- `gb_banner_{ko|en}_{0..3}`: kind `patch`, depthOffset 0.0012, `sway` 4 f · 5 fps loop.
  - 0.7 × 1.8 m cloth on the wall left of dock 1, clear of `dock1`, dock lights, `loadsign`, `nameBoard`; ko = mark +
    vertical "금방", en = mark only.

**AO.5 Props** (baked shadow; anchor = ground; footprintPoly, topPx; night = f1 or a crop patch)

| Key | Size | Anims | Points |
|---|---|---|---|
| `gb_sign` (mark only) | pole 3.2 m, disc Ø 1 m, ≤ [128, 288] | `idle` f0 day / f1 lit | — |
| `gb_flag` | pole 2.4 m, ≤ [128, 224] | `wave` 6 f · 8 fps loop | — |
| `gb_locker_a` (faces SW), `_b` (faces SE) | 1.8 × 0.6 × 2 m, 4 × 3 doors, ≤ [208, 224] | `idle` f0 / f1 lit; `open` 4 f · 12 fps once (patches) | `slotPoints[12]`, `openSlot`, `standPoint/Dir`, `fillPoint/Dir` |

Lockers: gold frame, navy doors, mark screen, snow cap.

**AO.6 Items** (72 × 72, anchor [0.5, 0.75], `icon`; stackStep, carryScale, topPx, sizeClass = `cardboard_box_s/m/l`)
- `gb_parcel_s/m/l`: kraft, gold tape cross, mark sticker.
- `gb_parcel_doorstep`: f0 parcel on a mat, f1 + snow cap.
- `gb_parcel_open`: flaps open, empty.
- Optional `gb_parcel_cat` 2 f: `pet_cat` peeking, blinking.

**AO.7 `gb_pennant_{SE|NE}_{i}`**
- 48 × 56, anchor = stick foot, `flutter` 4 f · 10 fps, mark only. `sledPennant[dir][i]` = px from the `dog_sled`
  anchor per idle (4) / move (8) frame; mirrored: negate x, flip.

## AP. `assets/geumbangfolk/` (townfolk paper dolls, `tf_*`/`of_*` pipeline, compact tfatlas)
- Header `{version 1, fragment "geumbangfolk", extends "townfolk", requires ["townfolk"], mergeAfter ["townfolk2",
  "beachfolk", "cityfolk", "officefolk"]}`.
- Merges with or without them (v4.3 has no cityfolk); `cityfolk.merge` rules; 128², anchor [0.5, 0.8125], no new head
  art; bases `adult_slim`, `adult_round`.

| Anim | f · fps · repeat | Dirs | Head | Item | Page | Points |
|---|---|---|---|---|---|---|
| `carry_parcel` | 8 · 12 · loop | S SE E NE N | loco | `held_parcel_gb` | road | boxPoint, groundSpeed |
| `ring_doorbell` | 6 · 8 · once, impact 2 | NE N E | soc/loco | parcel on the left arm | road | boxPoint, bellPoint |
| `hand_parcel` | 6 · 9 · once, f5 bow | NE E SE | soc | — | road | handPoint |
| `scan` | 4 · 6 · loop, impact 2 | S SE E | down→nod | `held_scanner` | hub | beamPoint |
| `sort_parcel` | 6 · 8 · loop | SE E NE | down→nod | small parcel | hub | handPoint |
| `tape_box` | 6 · 10 · loop, impact 3 | S SE E | down→nod | `held_tapegun` | hub | — |

- `boxPoint[anim][dir][i]` = [cx, cy, bx, by]. With `{noItems:true}` the game draws `gb_parcel_*` there, at depth
  +0.0045 in S/SE/E and −0.0001 in NE/N. Mirrored dirs negate x.
- Fallbacks: carry_parcel → walk; ring_doorbell and hand_parcel → talk, idle; the hub anims → idle.
- **Parts:** `top_gb_jacket` (gold puffer, cream collar/cuffs/chest band, mark centred on the band and big on the back),
  `det_gb_vest` (gold, 2 cream stripes, back mark), `hat_gb_cap` (navy, gold brim, centred mark, ear flaps), held
  `held_parcel_gb`, `held_scanner`, `held_tapegun`.
- **Cover** (new anims + idle/walk/talk/wave/happy for the new parts): `top_gb_jacket`, `top_parka`, `top_sweater`,
  `det_gb_vest`, `hat_gb_cap`, `hat_beanie`, `bot_pants`, `shoe_boots`, `acc_scarf`, `acc_glasses`, all hair.
- **Presets:** `gb_driver` (jacket, cap, charcoal pants, boots), `gb_picker` (cream parka, vest, gold beanie),
  `gb_packer` (oat sweater, vest, navy beanie), `gb_sorter` (parka, vest, cap), `gb_dispatcher` (jacket, glasses),
  `gb_rider` (jacket, navy scarf, gold beanie), `gb_night` (driver in goldDark).
- **Pages:** `gbf_road_0` ≤ 3.5 MiB (road anims + the new parts' v4 anims) and `gbf_hub_0` ≤ 2.5 MiB.
  `tools/geumbangfolk_compose.{py,js}`; 500-person parity.

## AQ. `assets/ui6/` (`tools/fx/gen_ui6.py`, ui5 house style; atlas `ui6_gb` ≤ 1024², ≤ 2.5 MiB, `pagePlan`)
- **Icons** 96 × 96, no text, readable at 32 px: `ui_icon_gb` (mark), `_order`, `_van`, `_sled`, `_locker`, `_deal`,
  `_review`, `_today`, `_catalog`, `_crew`, `_dawn`, `_doorstep`, `_cart`, `_follow`.
- **Tracker:** `ui_gb_step_{order|pick|pack|go|done}_{on|off}` 64², `ui_gb_dot_{off|on|now}` 28², `ui_gb_line_{off|on}`
  32 × 8, `ui_gb_star_{full|empty}` 32².
- **Logos** (the only baked UI text): `ui_gb_logo_ko` (mark + "금방", ≤ 256 × 96), `ui_gb_logo_en` (mark + "Geumbang",
  ≤ 320 × 96), `ui_gb_mark` 128².
- **Mascot 금방이** (a running parcel, navy scarf), 128², anchor [0.5, 0.9]: `idle` 2 f, `run` 4 f · 8 fps, `bow` 2 f.
- **9-slice** (untrimmed, `nineSlice`, `contentInset`): `ui_gb_phone` 360 × 640 (chief's phone), `ui_gb_header` 320 ×
  128, `ui_gb_tab`/`_on` 144 × 64, `ui_gb_card` 320 × 160, `ui_gb_chip` 200 × 64 (`ui_chip` rules), `ui_gb_toast` 300 × 64,
  `ui_gb_ribbon` 160 × 48 (blank). Fixed `ui_gb_photo` 176 × 136 (`photoRect` 128 × 80). FX `fx_gb_bell` 64², 4 f · 12
  fps once.

## AR. `assets/audio8/` (procedural, audio7 rules)
- One sprite `audio8_sprite.mp3` + manifest (sprite JSON); 50 ms gaps, mono 96 kbps. No real-brand jingle, no voice.

| Key | ≤ s | Sound |
|---|---|---|
| `sfx_gb_doorbell`, `_2` | 0.9 | soft two-tone 띵동 (G5→E5, A5→F♯5) |
| `sfx_gb_horn` | 0.5 | friendly double toy beep |
| `sfx_gb_chime` | 0.45 | app ping, two rising notes |
| `sfx_gb_thump`, `_2` | 0.35 | parcel on a snowy step |
| `sfx_gb_jingle` | 1.2 | an original rising 3-note "금-방!" |
| `sfx_gb_tape`, `_2` | 0.5 | packing tape 찌익 |
| `sfx_gb_scan` | 0.15 | soft 삑 |
| `sfx_gb_locker` | 0.4 | click + two-note chime |

## AS. Delivery, checks, budgets
- **Each job:** trimmed atlases (≤ 2048, RGBA); `tools/<job>/<job>_check.py` (frames, dirs, anchors, points, alignment,
  MiB); a new `tools/test/gb_<job>_phaser.mjs` (390 × 844, 360 × 640, zoom 0.6/1/1.6, day/night, snow/cobble/dirt);
  previews; `docs/build_reports/<job>.md`; a critique.
- **`gb_check.py`:** mirrored emblems vs own mirror ≤ 6 % px; `gb_van` points = red van's; colour pairs (plan §7.4); no
  text outside the listed keys.
- **Zoom 0.6:** van mark ≥ 12 CSS px, roof sign ≥ 30 CSS px; crew distinct from `depot_worker` at 0.3 scale.
- **Budgets** (source / shipped files; MiB): AO 5 / 3, ≤ 10.5 · AP 5 / 3, ≤ 6 · AQ 3 / 2, ≤ 2.5 · AR 2 / 2 → **15 / 10**.
  Every key has a code stand-in (plan §10.3).
