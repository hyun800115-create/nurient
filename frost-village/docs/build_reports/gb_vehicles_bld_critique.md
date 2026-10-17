# Critique: gb_vehicles_bld (금방 van, depot layers, props, items, pennant)

Adversarial art review of `assets/geumbang/` against `docs/CONTRACT_GEUMBANG.md` §AO/§AS and `docs/geumbang_plan.md`
§7. The review was read-only. Every probe, harness and capture lives in the critic scratch folder
`/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/geumbang_vehicles_crit/`
(written below as `$C`).

## Verdict: **polish** (0 critical · 2 high · 5 medium · 8 low)

The set is close to shippable and it is charming:
- **The van.** On a phone it reads as a honey-gold toy bread-van with a white snowy roof and a little 금방 roof board.
  - At zoom 0.6, "금방" on the roof sign and the 금방이 mark on the flank both read.
  - The van uses the red van's rig exactly (0 px delta on every point) and keeps the house light, the ink outline and
    the scale.
- **The brand is original.** The parcel-face mark is symmetric. There is no rocket, wing, arrow-smile or red/blue
  scheme, and the rendered colour pairs sit at ΔE ≥ 18 from every listed courier pair.
- **Budgets.** 9.57 of 10.5 MiB, 5 source files and 3 shipped.
- **Clean edges.** No halos were found.

Two problems would be visible in the core delivery loop on day one, so the set is not ready to ship as is:
- **H1:** the rear-door porthole and handle float in mid-air whenever the van unloads.
- **H2:** the documented way of drawing the door and unload patches shreds a seated driver or ghosts the closed door.

Both are fixed by re-rendering the patches and adding one manifest rule; nothing needs to be redesigned.

## How it was tested
- **Own Phaser 3.90 harness** (`$C/crit_phaser.mjs`, headless Chromium, `nice -n 10`):
  - Screen: a 390 × 844 CSS phone at DPR 3, with the logical 720 px canvas and K = 1.65 as `src/main.js` sets it.
  - Zooms and lighting: 0.6, 1.0 and 1.2 (plus 1.6 close-ups), each in day and in night. Night is the DayClock
    MULTIPLY 0x5a6aa8 at 0.45 plus ADD glows.
  - Neighbours drawn alongside: `logistics_center` with its real layers and props, `delivery_van_red`, `car_a_red`,
    `townhouse_a`, `dog_sled` and the ground textures.
  - Real characters, made with `tools/geumbangfolk_compose.py`: `gb_driver`, `gb_picker` and a townfolk resident. The
    resident is shown seated with `sit`, standing with `idle`, and the driver with `carry_parcel`.
- **Vans drawn exactly as `src/city/logistics/view/VehicleSprite.js` draws them:**
  - layer order: shadow, then body, then riders at `seats` (`seatsStand` in back views), then `over_*`;
  - patches placed at both candidate depths.
  - The shots are in `$C/shots/` (`crit_<focus>_z<zoom>_<day|night>.png`).
  - The run had 0 page errors and 0 missing files (`$C/shots/crit.json`).
- **Pixel probes** (all scripts in `$C`):
  - patch versus overlay versus seat zones (`a_patch.py`, `k_order.py`);
  - detached islands (`l_islands.py`);
  - colour families and ΔE2000 (`e_color.py`, `lab.py`);
  - letter heights (`i_text.py`);
  - edge halo (`j_edge.py`);
  - the shell emblems and the sled flip (`f_emblem.py`, `h_sled.py`).
- **Reading:** the builder's previews and GIFs, `gb_check.py` and `geumbang_phaser.mjs`.

## What is good (keep)
- **Rig.** `gb_van` copies every `delivery_van_red` field: frame, anchor, dirs, seats, door, cargo, light, tail,
  exhaust, footprint, shadow, wheels and topPx.
  - The turn frames are consistent with 2:1 iso: footprints of 122 × 140 (S) and 282 × 60 (E) px give 1.9 × 4.4 m.
  - The roof sign sits 0.35 m forward of the roof centre in every heading (centre height −131 px), so it does not pop
    at corners.
- **Light and tone.** Gold is the same across idle, move and turn frames: median (198, 157, 84) ± 2.
- **Edges.** No light halos. The semi-transparent edge luminance is at or below the rim luminance on every frame.
  Vehicles, the roof sign and the pennant carry the ink outline, while props and items stay soft like
  `cardboard_box_*` and the logistics props.
- **Scale.**
  - The van matches the red van exactly.
  - The crew and residents stand at about half the van's height, as with the red van.
  - `gb_parcel_s/m/l` bounding boxes are within 1 px of `cardboard_box_s/m/l`.
  - The 2 m locker stands about 1.5 resident heights tall.
- **Phone readability at zoom 0.6, as measured on the pixels:**
  - **Mark:** the disc measures 46 × 60 px on `idle_SE_0`, which is 15.0 × 19.5 CSS px at zoom 0.6 (needs ≥ 12).
  - **Korean roof sign:** "금방" glyphs are 19 px tall, 6.2 CSS px at 0.6 and 10.3 at 1.0. It reads.
  - **Nameplate:** "금방" reads. "물류센터" is small but in proportion.
- **Night.** The lit roof sign, sign disc and locker screen read as glowing under the tint. The lit frames are
  day-lit, which the builder already noted and which is acceptable.
- **Brand.**
  - The mark is its own mirror.
  - The van, sign and pennant carry no letters.
  - Rendered gold against IKEA yellow is ΔE 18–21 and against UPS gold about 10 by hue; UPS brown is far.
- **Budgets.**

  | Page | Size | Memory |
  |---|---|---|
  | `gb_van_0` | 2032 × 916 | 7.10 MiB (limit 8) |
  | `gb_bld_0` | 980 × 660 | 2.47 MiB (limit 2.5) |
  | Total | | 9.57 MiB (limit 10.5) |

  There are 5 source files and 3 shipped. The manifest's `pages.bytes` counts the png plus the json, which is fine.

## Findings

| # | Sev | Area | Finding |
|---|---|---|---|
| H1 | High | van `unload` | Rear-door porthole and handle detach and float (NE/NW f2–f3 in mid-air beside the door; SE/SW f1–f3 as "ears" above the roof) |
| H2 | High | van patches / manifest | Documented patch order ("draw on top") shreds a seated driver during `unload`; `door` ghosts the closed door under `over_*` or cuts a seat-1 rider above it |
| M1 | Medium | `gb_banner_ko` | "금방" is lying on its side (rotated 90°), not upright vertical 세로쓰기 |
| M2 | Medium | hub brand | 금방 물류센터 still wears two baked winged-parcel emblems (gable disc + corner blade sign): a competing mark and the forbidden "wings on parcels" motif |
| M3 | Medium | `gb_roofsign_en_*` | "GEUMBANG" has 6 px caps: 3.3 CSS px at zoom 1.0, never legible; the report says "reads from 1.0" |
| M4 | Medium | `gb_pennant` mirrors | `sledPennant` "negate x and flip" ignores Phaser's centre-flip: in SW/NW the pole stands about 50 px off the sled, mid-basket |
| M5 | Medium | `parcelPoints` SE/SW | In SE/SW the rear doors and the 3 parcels are on the hidden far side; `parcelPoints` there lie on the van flank with no visibility flag |
| L1 | Low | van colour | Van body gold renders ΔE about 10 from brand gold (props: 4–6); next to the flag and locker the van reads mustard |
| L2 | Low | lockers | Navy share is 14.5–14.9 % with shaded navy counted (check: 12.9 %); 12 navy doors on gold read "blue + yellow" |
| L3 | Low | `gb_check.py` | The pair test splits gold into lit/shaded clusters, skips hub layers, mark size is a formula, and there are no island or rider-zone tests |
| L4 | Low | `lightPoints` | Hidden headlights (N turn, NE) have no visibility flag; "ADD glow at lightPoints" paints glows on the roof |
| L5 | Low | `gb_parcel_cat` | `boxOf: cardboard_box_l` and `sizeClass: big`, but `stackStep` 19 / `thicknessM` 0.34 are the m values |
| L6 | Low | report | 104 frames (atlases hold 96); "same points as the red van's turn frames" (the red van has none); en sign claim; tool paths (known) |
| L7 | Low | wordmark | 금방 lettering is set in Jua (= BM JUA, Woowa Brothers / 배민); house font, but a delivery brand's wordmark in 배민's own type is the one real-brand echo left |
| L8 | Low | night hub | Nameplate and banner have no night state; at night the 금방 name is the darkest thing on the lit facade |

### H1 · High · floating rear-door porthole and handle in `unload`
- **Repro.**
  - Composite `unload_NE_2` and `unload_NE_3` over `idle_NE_0` at the anim anchor.
  - Or look at any `unload` in Phaser: the dock bay in SE and kerb stops in NE.
- **Evidence.**
  - **Detached opaque islands** in the composite (px, box relative to the van anchor):

    | Frame | Islands |
    |---|---|
    | `unload_NE_2` | 234 px at x −162…−147, y −42…−24 |
    | `unload_NE_3` | 261 px at x −170…−153, y −47…−29, and 71 px at x −157…−151, y −22…−12 |

    That is a cream porthole disc and the handle pill hanging in the air left of the open door. NW mirrors it.
  - **SE f1–f3:** the same parts stick up above the rear roof line as two "ears". They are attached to the
    silhouette, so the island test misses them; they are visible to the eye.
  - **In game at zoom 0.6 and 1.6:**
    - `$C/out/z06_unload_crops.png` (left: dock bay SE; right: kerb NE);
    - `$C/out/hub16_daynight.png`.
  - **Close-up:** `$C/out/zoom_unload_parts.png` shows NE f0–f3 and SE f0–f3 at 4×.
- **Why it matters.** `unload` plays at every dock load (plan §5.4/5.5) and every doorstep take (§5.6). The fault is
  visible at zoom 0.6 day and night.
- **Fix.**
  - In `gb_van.py`, parent the rear-door porthole and handle objects to their hinged leaf, or include them in the
    boolean split. Then re-render `unload` for both dirs.
  - Add to `gb_check.py`:
    - no detached island of 6 px or more in any patch-over-base composite;
    - no new opaque pixel above the `idle_<dir>_0` roof silhouette outside the leaf's swing box.

### H2 · High · patch draw order: `unload` shreds a seated driver, `door` ghosts or cuts
- **Repro.** Draw the patch the way the manifest says ("hold the van on `idle_<dir>_0` and draw the patch frame on
  top") with riders seated. `$C/k_order.py` does this the `VehicleSprite` way.
- **Evidence.** `$C/out/patch_order_zoom.png` shows the five cases:

  | Panel | Setup | Result |
  |---|---|---|
  | 1 | idle, no patch | Driver and passenger both visible |
  | 2 | `unload` under the riders | Identical to panel 1 (fine) |
  | 3 | `unload` above `over_*` | The seated driver is torn apart |
  | 4 | `door` under `over_*` | The closed-door frame from `over_idle` is drawn over the open door (doubled door) |
  | 5 | `door` above `over_*` | A seat-1 passenger is cut away by empty-cab pixels |

  - **The `unload` patches carry cab pixels that do not change.** `unload_SE_0` has 1,701 opaque patch px but only
    144 that differ by more than 24 RGB from `idle_SE_0`. 407 of them fall in the seat-0 rider box and 234 in the
    seat-1 box. `over_idle_SE_0` intersects the patch in 518 px.
  - **The `door` patches overlap `over_idle` almost everywhere.** The overlap is 2,122–2,739 px in SE and
    2,837–3,458 px in NE.
  - **The builder's own `geumbang_phaser.mjs` puts the patch above the overlay** (`y + 0.015` against
    `y + 0.01`). An integrator copying it gets panel 3 at the hub, where the driver waits seated while the dockhand
    loads (plan §5.5 `bay` state).
- **Fix.**
  1. **Re-cut the `unload` patches** to pixels that changed by more than 24 RGB, plus a 1 px collar, and to nothing
     inside the cab zone (seat boxes and `over_idle` alpha).
  2. **Write the order into the manifest:**
     - `unload`: body depth + 0.0005, under the riders and `over_*`;
     - `door`: hide `over_*` while frames 1–2 show, or ship `over_door_<dir>_<i>` (the open-door frame and pillar in
       front of seat 1). Seat 1 must be empty or drawn after the patch.
  3. **Fix the builder test's depths** to match the new rule.
  4. **Add a `gb_check` rule:** no `unload` patch pixel inside the seat rider boxes.

### M1 · Medium · `gb_banner_ko`: the word is sideways
- **Repro.** `gb_banner_ko_0`, cropped to its bounding box at 6×: `$C/out/banner_ko_x6.png`.
- **Evidence.** The glyphs lie on their side, with the horizontal word "금방" turned 90° clockwise. There is no
  horizontal ㅡ bar across the cloth, only vertical strokes. Compare with the references in
  `$C/out/banner_ref.png` (`rot90cw` matches; `stack_upright` is what the contract asks for).
  - On a phone the word reads as a tilted logo rather than as 금방.
  - Korean vertical shop banners (세로 현수막) stack the syllables upright: 금 above 방.
  - Contract AO.4 asks for a vertical "금방".
- **Fix.** In `gb_tex.py`, set 금 and 방 as two upright syllables stacked one above the other. Each is about 24 px at
  the banner's width, which is larger than now and reads better. Re-render the 4 sway frames.

### M2 · Medium · the 금방 물류센터 still wears the old winged-parcel emblems
- **Repro.** Draw the hub the documented way with `gb_nameplate_ko` and `gb_banner_ko`, as in `$C/shots/crit_hub_z1_day.png`.
- **Evidence.**
  - `logistics_center_shell` bakes two "parcel with white wings" discs:
    - the gable disc above dock 2;
    - the blade sign on the corner pillar, right beside the 금방 banner.
  - It also bakes the red-ribboned parcel on the roof.
  - Crops are in `$C/out/shell_emblems.png`. Both discs are clearly visible at zoom 0.6 and 1.0.
  - Plan §7.4 forbids "wings on parcels". Visually the building now carries two brands, with the old logistics mark
    beside 금방이.
  - This is a contract gap: AO.4 lists only nameplates and a banner. The art review still has to flag it, because
    the hub is where the brand lives.
- **Fix.** Add patches `of: logistics_center`, `withShell`, depthOffset 0.0005:
  - **`gb_emblem_gable`:** a 금방이 disc over `fxPoints.emblem`'s gable disc;
  - **`gb_emblem_blade`:** a 금방이 blade disc.

  Each is about 70 × 70 px trimmed. `gb_bld_0` has 0.03 MiB of headroom, so re-pack tighter or move the nameplates
  and banner frames into a shared trimmed strip. Optionally add a gold parcel patch for the roof parcel.

### M3 · Medium · English roof sign is unreadable at every phone zoom
- **Repro.** Measure the navy letters of `gb_roofsign_en_0`: the bounding box is 70 × 6 px.
- **Evidence.**

  | Sign | Letter height | 0.6 | 1.0 | 1.2 | 1.6 |
  |---|---|---|---|---|---|
  | `gb_roofsign_en_0` "GEUMBANG" | 6 px caps | 2.0 CSS px | 3.3 | 3.9 | 5.2 |
  | `gb_roofsign_ko_0` "금방" | 19 px glyphs | 6.2 CSS px | 10.3 | | |

  - `$C/out/roofsigns_x5.png` shows the signs at 5×; the B already fills in like an 8.
  - The report's claim "reads from zoom 1.0 up" does not hold.
  - The contract's ≥ 30 CSS px applies to the board, and the board passes. The English player still never sees the
    brand name.
- **Fix.** Pick one:
  - Drop the mark from the en board (the flanks already carry it) and set GEUMBANG at a cap height of 11 px or more,
    which is ≥ 6 CSS px at 1.0.
  - Use the ko wordmark as the logo in every locale, since the brand is a proper name.

  Add a cap-height check (≥ 10 px) to `gb_check`.

### M4 · Medium · pennant mirrors land about 50 px off the sled in SW/NW
- **Repro.** Draw `dog_sled` with `setFlipX` and its anchor origin, exactly as `src/vehicles/view/VehicleSprite.js`
  does. Then draw `gb_pennant_NE_*` flipped at `x − q[0]` as the manifest instructs.
- **Evidence.** `$C/out/sled_mirror_evidence.png`: on the right, NE is correct, at the rear corner post. On the left,
  the NW mirror's pole stands in the middle of the basket, where the rider sits.
  - **Phaser 3.90 flips a frame about its centre**, not about its origin (`m += -realWidth + 2*displayOriginX`).
    Mirrored art therefore moves by `frameW − 2·anchorX·frameW` against a negated point.

    | Sprite | Shift when flipped |
    |---|---|
    | `dog_sled` | +30 px |
    | `gb_pennant` (anchor 0.708 of 48) | −20 px |
    | Net pennant error | 50 px |

  - The builder's PIL preview (`gb_sled.gif`) mirrors about the anchor, so it looked right.
  - The same rule costs the van only 2 px, and the W turn frame 4 px (anchors near the centre).
- **Fix.**
  - Re-pad the pennant frames so the stick foot is at x = 24 (anchor 0.5).
  - Ship explicit mirrored offsets, `sledPennant.SW` and `sledPennant.NW` with x′ = −x + 30, or document the formula
    `x′ = −x + (frameW_sled − 2·ox_sled)`.
  - Note the general rule in `conventions` for every mirrored point table.

### M5 · Medium · `unload` in SE/SW shows no open rear and no parcels, but `parcelPoints` say otherwise
- **Repro.** `unload_SE_3` composite with `parcelPoints.SE` circled: `$C/out/zoom_patches.png` (second panel), and
  the builder's own `gb_van_unload.gif`.
- **Evidence.**
  - In SE and SW the rear faces away from the camera. Only door slivers show, and the 3 parcels are hidden by the body.
  - `parcelPoints.SE` (−95…−72, −98…−82) sits on the visible flank.
  - The manifest note "f3 shows 3 parcels at parcelPoints" has no per-dir visibility flag (`cargoPoint` has one as
    its third field).
  - Code that pops a parcel sprite there, or stages the hand-off there, will draw parcels floating on the gold flank.
  - The courier at `rearDoorPoint.SE` is hidden behind the van. That is inherited from the red rig, but the doorstep
    beat (plan §5.6) depends on it.
- **Fix.**
  - Add `parcelPointsVisible: {SE:false, NE:true}` or a third boolean per point.
  - Tell the integrator to face doorstep kerb stops NE/NW, or to draw the parcel only once the courier holds it.

### L1 · Low · the van's gold is duller than the brand gold and the props' gold
- **Evidence.** ΔE2000 of each sprite's median gold against brand gold #F2B33D:

  | Sprite | ΔE2000 |
  |---|---|
  | `idle_SE_0` | 10.0 |
  | `turn_E_0` | 9.7 |
  | `gb_banner_ko_0` | 9.5 |
  | `gb_roofsign_ko_0` | 7.8 |
  | `gb_sign_0` | 7.0 |
  | `gb_locker_a_0` | 5.7 |
  | `gb_flag_wave_0` | 3.7 |

  In the hub shot the van reads mustard-ochre next to the brighter locker and flag. The 2D UI gold will be brighter
  still.
- **Fix.** Raise the van livery albedo or value by about 8 % in the livery override, aiming for ΔE ≤ 6.

### L2 · Low · lockers sit at the navy cap and read blue plus yellow
- **Evidence.**
  - Counting shaded navy (×0.5–1.2) with chroma ≥ 12 gives `gb_locker_a_0` 14.5 % and `gb_locker_b_0` 14.9 %.
    The blue family by hue is 14.9 % and 15.2 %.
  - `gb_check` reports 12.9 %, because it counts only navy at ×0.8–1.2.
  - The 12-door grid is the "large navy block next to gold" that plan §7.4 warns about. The pair test passes only
    because the rendered gold is darker than IKEA yellow (ΔE 18–19); flat brand gold against IKEA yellow is ΔE 13.1.
- **Fix.** Cream doors with navy slot numbers, or goldDark doors with cream knobs, keeping navy for the screen frame.
  It reads more 금방 and drops navy to about 5 %.

### L3 · Low · `gb_check.py` blind spots
- **Pair test.** The two "largest colour areas" come from a k-means split, which separates lit and shaded gold, so a
  gold sprite can never trip a gold+X brand pair. Merge clusters by hue family first.
- **Skipped sprites.** Hub layers and the banner are skipped ("judged with the building"), and nothing judges them.
- **Mark size** is computed from the design radius (`markPx = 2·R·64·√½`), not measured on the pixels. The measured
  value agrees, but the check should measure.
- **Missing checks:** detached islands (H1), patch pixels in the rider zones (H2), and letter cap height (M3).

### L4 · Low · glows on hidden headlights
- **Evidence.**
  - `gb_van_turn.lightPoints.N` = (±37, −117) and `gb_van.lightPoints.NE` are on faces turned away from the camera.
  - The manifest says "ADD glows at lightPoints", so at night a glow blooms on the roof of N-heading vans
    (`$C/shots/crit_hub_z0.6_night.png`, the rear-view van in the bottom row).
- **Fix.** Add a per-dir visibility flag, as `cargoPoint` has, or a `lightsVisible` table (S, E, SE true; N, NE false).

### L5 · Low · `gb_parcel_cat` stacking fields
- **Evidence.** It has `boxOf: cardboard_box_l` and `sizeClass: big`, but `stackStep` 19 and `thicknessM` 0.34, which
  are the m values.
- **Fix.** Use 24 and 0.44, or point `boxOf` at m.

### L6 · Low · report accuracy
- The atlases hold 96 frames; the "104" counts overlay checks.
- `delivery_van_red` has no turn frames to copy points from; the turn points are new.
- The en sign claim is wrong (M3).
- The check and test paths differ from AS (already noted).

### L7 · Low · wordmark typeface
- Google's "Jua" is BM JUA by Woowa Brothers, the company behind 배달의민족.
- It is the game's house font, so this is not imitation. Still, the 금방 wordmark on the van, roof sign and nameplate
  is the one place where a delivery brand wears another delivery brand's type.
- **Optional.** Hand-draw a 금방 wordmark (it is two syllables) and share it with ui6 `ui_gb_logo_ko`.

### L8 · Low · night facade
- The nameplate and banner have no lit state; under the night tint the brand name is darker than the lit windows.
- **Optional.** Add a `gb_nameplate_<lang>_lit` patch, or have the game add an ADD glow at `fxPoints.board`.

## Contract checklist (AO / AS)

| Item | Status |
|---|---|
| AO.1 rig = red van (frame, anchor, dirs, every point) | pass (0 px) |
| AO.1 gold body, cream roof + snow, navy belt, mark ≥ 36 px both sides | pass (46 × 60 px) |
| AO.1 idle 2 f / move 4 f + `over_*` | pass |
| AO.1 door 3 f, unload 4 f, patches ≤ 0.5 % | pass on numbers; **fail on content** (H1 floating parts, H2 order/cab pixels) |
| AO.1 unload f3 shows 3 parcels; `roofSignPoint`, `parcelPoints[3]` | NE/NW only (M5) |
| AO.2 turn S/E/N (+W), ≤ [368, 352], centre anchor, points | pass (296 × 256) |
| AO.3 roof sign 96 × 56, anchor [0.5, 1], day/lit, never mirrored | pass; en text illegible (M3) |
| AO.4 nameplates (4), `replaces`, 0.0005, inside `nameBoard` | pass |
| AO.4 banner patch, 0.0012, sway 4 f · 5 fps, clear of dock/lamps/loadsign/board | pass; ko text sideways (M1) |
| AO.5 sign ≤ [128, 288], flag ≤ [128, 224] 6 f · 8 fps, lockers 208 × 224, 12 slots, open patches, points | pass |
| AO.6 items 72², anchor [0.5, 0.75], box fields | pass (L5 nit) |
| AO.7 pennant 48 × 56, flutter 4 f · 10 fps, `sledPennant` idle 4 / move 8 | data pass; mirrored placement wrong in Phaser (M4) |
| Brand: no letters on mirrored sprites, mark symmetric, pairs > ΔE 15 | pass; hub keeps winged emblems (M2) |
| AS budgets (≤ 10.5 MiB; 5 / 3 files) | pass (9.57 MiB) |
| AS zoom 0.6: mark ≥ 12, roof sign ≥ 30 CSS px | pass (15.0 / 31.2) |

## Evidence index (`$C` = `/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/geumbang_vehicles_crit`)

| File | Shows |
|---|---|
| `$C/out/z06_unload_crops.png` | H1 in Phaser at zoom 0.6: SE dock "ears", NE floating porthole |
| `$C/out/hub16_daynight.png` | H1 at zoom 1.6, day and night, at the dock bay |
| `$C/out/zoom_unload_parts.png` | H1 per frame at 4× |
| `$C/out/patch_order_zoom.png` | H2 five draw orders with seated driver and passenger |
| `$C/out/patch_overlay.png` | H2 patch (magenta), overlay (cyan) and overlap (yellow) |
| `$C/out/banner_ko_x6.png` | M1 sideways 금방 |
| `$C/out/banner_ref.png` | M1 reference orientations |
| `$C/out/shell_emblems.png` | M2 winged-parcel discs on the shell |
| `$C/shots/crit_hub_z1_day.png` | M2 next to the banner |
| `$C/out/roofsigns_x5.png` | M3 ko vs en sign letter size |
| `$C/out/sled_mirror_evidence.png` | M4 NW (wrong) vs NE (right) |
| `$C/out/zoom_patches.png` | M5 SE parcelPoints on the flank |
| `$C/shots/crit_*_z{0.6,1,1.2,1.6}_{day,night}.png` | Full phone captures |

Rebuild the evidence with `nice -n 10 node $C/crit_phaser.mjs` (set `CRIT_PLANS` to pick shots) and
`python3 $C/{a_patch,k_order,l_islands,e_color,i_text,j_edge}.py`. They read only from `frost-village/`.
