# 금방 art → v4.3 code handoff (polish results)

## polish:gb_vehicles_bld

Every critical, high and medium finding is fixed, along with five of the eight lows. Two lows are only partly met, and the font low (L7) is left for the brand job. `gb_check.py` now reports 0 errors and 0 warnings. Run against a copy of the set from before the fixes, the new rules report 54 errors, which covers every finding. The Phaser phone test (390×844 at DPR 3 and 360×640, zoom 0.6/1.0/1.2/1.6, day and night) passes: 124 frames found and 20 animations registered, 0 page errors, 0 missing files, all 8 headings shown. On a phone at zoom 0.6 the van mark is 14.75 CSS px and the roof sign 31.2. Total texture memory fell from 9.57 to 8.45 MiB (van page 6.42, building page 2.03), mainly because of a tighter atlas packer.

Re-rendered: the whole van (about 4 minutes), the English roof signs, the 8 banner frames, 6 small building patch renders and the two lockers. Everything else came from the existing render cache.

| # | Status | What changed |
|---|---|---|
| H1 floating porthole and handle | fixed | All six rear-door windows and handles were attached to the left door, so the right door's parts swung loose when it opened. Each part now follows its own door. A new geometry check measures them at most 0.01 m off their door in every unload pose. The check for loose bits of picture finds none; on the old set it finds 186+45 px and 208+48 px in NE frames 2–3. |
| H2 draw order | fixed | Every door and unload frame now has its own overlay frame (14 in total), drawn instead of the closed-door overlay. The manifest says the door/unload frame goes under the riders (depth +0.0005) and that seat 0 is empty during `door`. Unload frames no longer carry cab pixels where riders sit: 0, down from 747–757 (SE) and 234–239 (NE). The Phaser test now seats real crew dolls in the game's draw order: the driver stays whole and nothing is cut. |
| M1 banner text sideways | fixed, but the cause was different | The printed text was upright (it matches upright text at 0.75 against 0.45 for sideways). The sideways look comes from the slant of the wall in the iso view on a 32 px-wide cloth. The print is now counter-slanted to cancel the wall, with bigger syllables, so 금 and 방 stand upright on screen. |
| M2 old winged-parcel emblems | fixed | Three new patches over the building: the 금방이 mark on the gable disc and on the corner blade sign, and gold ribbons instead of red on the roof parcel. They are drawn only for the 금방 hub; the 서리 depot keeps the building's own mark. |
| M3 English roof sign unreadable | fixed | The English sign now shows the mark with "GEUM / BANG" on two lines: 11/11 px letters, was 6. A check now fails any roof-sign line under 10 px. |
| M4 sled pennant 50 px off | fixed | Phaser mirrors a sprite around its centre, not its anchor. The manifest now has explicit SW/NW pennant positions and a mirror shift per sprite (van −2, corner frames −4, pennant −20; sled +30). A new on-screen test compares each flipped sled with its pennant against the original and matches exactly (0 % difference). The pennant frame was not re-padded because the art does not fit a 48 px frame with the stick centred. |
| M5 parcel visibility | fixed | Per-point visibility flags, tested in Blender (SE: no parcels visible; NE: one of three), plus a note to stage doorstep stops facing NE/NW. |
| L1 van gold dull | partly fixed | The van paint is now #FFC640; distance from the brand gold drops from 11.3 to 8.9 (locker 7.7, flag 4.7). The critic's target of 6 is not reached without making the van flatter than the red van's toy look. |
| L2 lockers too navy | partly fixed | The contract asks for navy doors, so they stay navy with a cream label plate on each; navy share drops from 14.5–14.9 % to 11.5–11.9 %. |
| L3 check blind spots | fixed | The colour-pair test now treats lit and shaded gold as one colour, the building layers and patches are checked too, and the van mark is measured on the actual sprite (45.4 × 59.9 px). |
| L4 glows on hidden headlights | fixed | Per-lamp visibility flags; night glows only on visible lamps. |
| L5 cat parcel stacking values | fixed | Takes 24 / 0.44 from the large cardboard box. |
| L6 report errors | fixed | The build report is rewritten with the real numbers. |
| L7 Jua font in the wordmark | won't fix | It is the game's house Korean font. A hand-drawn wordmark would have to be shared with the UI job's logo files, which are outside my paths. |
| L8 dark nameplate at night | fixed (rule only) | The manifest now asks the game for a glow at the nameplate (`fxPoints.board`); no lit nameplate frames were added. |

**Updated summary.** The 금방 set keeps the red van's exact rig, scale, lighting and art style. The patch draw order now matches the game's vehicle drawing code (`VehicleSprite`). The hub is fully on-brand after 금방 opens. It fits in 8.45 of 10.5 MiB, in the 5 source / 3 shipped files. The checks and the phone test are green, and I looked at every preview. Known limits: the van gold is still 8.9 from the brand gold; the banner print is counter-slanted for this one camera, so it is slanted on the cloth itself; the English name is split over two lines on the roof sign. `git status` also shows changes under `assets/geumbangfolk/` and `docs/previews/screens_v42/`; those come from other jobs, not this one.

Files are in `/home/user/nurient/frost-village/`:
- `docs/build_reports/gb_vehicles_bld.md`
- `docs/previews/gb_polish_before_after.png` (before/after of every visual fix)
- `docs/previews/gb_phaser_order.png`
- `docs/previews/gb_sled_mirror_probe.png`
- `assets/geumbang/` (atlases and manifest)
- `tools/blender/gb_van.py`, `gb_render.py`, `gb_signs.py`, `gb_tex.py`, `gb_hub.py`, `gb_assets.py`, `gb_pack.py`, `gb_check.py`, `gb_preview.py`
- `tools/test/geumbang_phaser.mjs`

## polish:gb_ui_audio

Polish pass for gb_ui_audio is finished. I reproduced all 15 findings before fixing them. Every critical, high and medium is fixed, as are 9 of the 10 lows. L10 is left as a note for the designer, and L5 is fixed except for the optional extra idle frames. All three checks pass:
- `gen_ui6.py --check`: 0 errors, 0 warnings. The atlas is 56 frames on an 828 × 768 page, 2.426 MiB (was 916 × 710, 2.481 MiB).
- `check_audio8.py`: OK, 0 errors, 0 warnings.
- `ui6_phaser.mjs`: OK, 0 problems, at 390 × 844 DPR 3 (zoom 0.6 / 1.0 / 1.2 day and night, 1.6 day) and 360 × 640. It now uses a real 금방 courier ringing the doorbell, two real residents and the real v4.2 HUD column.

| Finding | Status |
|---|---|
| **H1** mascot runs backwards | **Fixed.** The 4 run frames are re-rendered facing left; lighting still comes from the upper left. The manifest now gives the run-in: start hidden behind the right edge of the screen, masked to the screen, under the close button, 600 ms at constant speed, then idle. The test checks that it starts hidden and ends idle at x 540. New `ui6_mascot_runin.gif`. |
| **H2** bell covers people | **Fixed.** Bell size is min(24 CSS, 0.7 × the courier's height on screen): 18.2 CSS at zoom 0.6, 24 CSS from 1.0 up. It sits above the courier's head, a little toward the door, with its bottom 4 px above the highest head under it. The test measures head boxes from the real dolls: 0 overlaps at every zoom. Manifest and report now say the same thing. |
| **M1** icons too light | **Fixed.** The 7 flagged icons plus `deal` (also below 0.2) were redrawn with the house ink weight. The mark icon keeps the same design with a darker outline. Median share of pixels at 3:1 against cream went from 0.10 to 0.33 (ui3 0.28, ui5 0.39); the lightest is now 0.25. New check: every icon ≥ 0.20. |
| **M2** HUD chip too big, toast on the hint pill | **Fixed.** The chip is now the 업무 chip's size (50 logical tall, 20 px text, 36 px icon) right under it, with an invisible 44 CSS tap area. The toast takes the hint pill's place while it shows. The test finds 0 overlaps with the v4.2 HUD. |
| **M3** 새벽배송 icon looks like 샛별배송 | **Fixed.** The sky goes blue to peach to gold with no violet, and the star is now a gold sparkle. The catalog's lavender yarn is now green. New check rejects any sprite that is ≥ 20 % lilac or violet. |
| L1 phone speaker slot stretched | Fixed. The slot and camera are a new fixed frame, `ui_gb_phone_notch`, drawn at `appLayout.notch`; the phone's top bezel is plain. New check on 9-slice edge strips. |
| L2 atlas bleed | Fixed. Every frame now has at least 1 transparent pixel around it; the full-bleed header and tracker lines get a 1 px extrude. `--check` verifies this on the written page, and the critic's probe finds no frame packed with a 0 px gap. |
| L3 stand-ins not loaded | Fixed. Every sound stand-in is now a key v4.3 actually loads: `sfx_pickup`, `sfx_drop`, `sfx_coin`, `sfx_car_honk_1`, `sfx_mailbox_flag`. `check_audio8` reads `Assets.js` and fails on an unloaded key. The critique's suggested `sfx_hotel_bell` is not loaded either, because `USED_ONLY` limits audio5 to the sea sound. Icon fallbacks now point at ui3/ui5 icons instead of the unloaded ui4 `ui_icon_box`. |
| L4 locker icon unlike the prop | Fixed. Redrawn as 3 × 4 small slate doors in a gold frame, like `gb_locker_a`. |
| L5 scarf and mouth | Fixed: the "o" mouth shows, and the scarf hangs under it with a knot, a hanging front tail and fringe. Idle stays 2 frames, because the contract sets it at 2. |
| L6 bell gone before the dong | Fixed. On the dong cue the bell swings again, then holds and fades, so it lasts the full 0.9 s. New `ui6_phaser_bell_door.gif`. |
| L7 thump quiet on a phone | Fixed. A cardboard "tock" was added. Phone-speaker loss went from 4.0 / 4.8 dB to 1.8 / 2.4 dB, and volume from 1.0 / 0.989 to 0.804 / 0.684, so there is now headroom. |
| L8 doc inconsistencies | Fixed: logo note, one bell rule, all 5 tracker rows in the preview, and the test's night overlay now works like the game's night. |
| L9 small and pale labels | Fixed. English labels go from 24 to 26 logical px, inactive text is #6B5D48 (≥ 4.5:1), and the smallest-text minimum is now 13 CSS and gated. |
| L10 logo font is Jua (BM) | Won't fix. Jua is the game's house display font. It is flagged in the Korean designer summary as a choice for the designer. |

For the code owner: `UIv42.updateEdge` keeps the left edge badge at y ≥ 480. With the 금방 chip showing, that limit should be 540; this is noted in `appLayout.hud.edgeBadge`.

Only files in this job's paths were changed, and nothing was committed. The pre-polish copy is in `/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/geumbang_ui_audio/before_polish/`.

Files are in /home/user/nurient/frost-village:
- `assets/ui6/` (`ui6_gb.png`, `ui6_gb.json`, `manifest.json`)
- `assets/audio8/` (`audio8_sprite.mp3`, `manifest.json`)
- `tools/fx/gen_ui6.py`
- `tools/audio/sfx8.py`, `tools/audio/build_audio8.py`, `tools/audio/check_audio8.py`
- `tools/test/ui6_phaser.mjs`
- `docs/build_reports/gb_ui_audio.md` (section 0 is the polish table and the Korean summary)
- `docs/previews/ui6_*` and `docs/previews/audio8_*`, including the new `ui6_mascot_runin.gif` and `ui6_phaser_bell_door.gif`

## polish:gb_people

Polish is done: all 4 highs and 3 mediums are fixed, and 7 of the 9 lows. L2 and L6 are left as won't-fix. The re-check, Phaser test and previews all pass and I looked at the captures. The build report is updated. Atlas PNG and JSON files are byte-identical to the ones the Phaser run used; only one text note in the manifest changed after it.

| Finding | Result | What changed |
|---|---|---|
| H1 see-through hole at the hip | fixed | The torso pass treated the arm-following cuffs as cutouts, which cut a hole in the coat. It no longer does; jacket torso keys re-rendered. Holes: 0 of 3416 preset frames (720 on the old assets). |
| H2 parcel melts into the gold jacket | fixed | Deep kraft box: sides #704E30 / #523A25, pale lid #9A7A52, cream labels on lid and front, gold tape and mark sticker kept. Contrast against the coat is now ΔE 12.9–22.4 on gold jackets and 10.6–16.7 on the night driver (was 1.6–6.3). |
| H3 no parcel while ringing NE/N | fixed (re-pose) | Facing away, the parcel sits under the right arm on the camera side and the left mitten rings; that arm and the parcel draw in front. Visible parcel NE ≥428 px (was 0–5). New `parcelDepth` table. |
| H4 runtime patch claimed pages always loaded | fixed | `installGeumbangfolkRuntime` registers the 금방 atlases with the game's page tracking and installs a `TF.pick` that works with or without officefolk. New page-loading test: 4000 cases per merge, 0 mismatches, 0 crew drawn from a missing page. |
| M1 carry upper body glides | fixed | 3 upper-body keys: head sways ±3 px and bobs 2 px; legs and groundSpeed unchanged. |
| M2 방금순's face behind the counter board | fixed | Stand offset [24, 12] along the counter. |
| M3 belt packer floats, table packer hidden | fixed | Belt packer plays `sort_parcel` on a 12 px step; table packer offset [-20, -10], left of the bubble-wrap roll. |
| L1 hand_parcel NE/NW | fixed | handPoint moved beside the camera-side mitten; parcel depth +0.0045. |
| L2 sort_parcel NE/NW shows little parcel | won't fix | Needs a re-pose, and the critic called it acceptable (reads as reaching into the shelf). |
| L3 grain on fixed-colour layers | fixed | 128 colours, dither 0.25; cap re-rendered at 48 samples. Light specks on the charcoal crown 2.6% → 0%. |
| L4 stale `brand.notes` | fixed | |
| L5 test gaps | fixed | Phaser adds 360×640 (zoom 1.0 and 0.6), zoom 1.6, real ground tiles, and a second house with the game's own parcel. `gbf_check` adds hole, contrast, visibility and `parcelDepth` rules; on the old assets they flag the critic's bugs. |
| L6 gold + charcoal instead of gold + cream | won't fix | Designer call; a cream band on the cap crown is offered as an option. |
| L7 boxPoint jumps between item and noItems | fixed for ring NE/N (1.1 / 2.5 px) | carry NE is not a data error: the 5.5 px is the centre of the visible sliver, not the parcel. |
| L8 counter parcel a speck at zoom 0.6 | fixed | Now gb_parcel_m at 0.20 m. |
| L9 ponytail under the cap | fixed | Cap wearers get short hair only. |

Two extra fixes:
- **Bell flash:** facing away, it landed on the back of the cap. It now draws behind the doll, where the head hides most of it, so the 띵-동 sound carries the beat there.
- **Parity output names:** `--parity` saved results under the wrong merge names. Fixed.

**Results:**
- `gbf_check` (bare / v4.3 / all fragments): 0 errors, 0 warnings.
- Python vs JS vs game-runtime parity: 2000/2000 identical in all three merges; `TF.person` 500/500.
- Phaser: 9 of 9 runs with 0 missing frames, 0 page errors and 0 404s; 3 draw calls (5 at night) and 39–41 texture binds per frame. In the road-page-only run the hub anims fall back to idle.
- Pages: road 1480×584 = 3.30 MiB (budget 3.5), hub 560×868 = 1.85 MiB (budget 2.5), 5.15 MiB total; download 0.63 MB.

**Trade-offs and handoffs:**
- The dockhand's parka carry frames moved to the hub page so the third carry key fits the road budget. Outside the depot he walks instead of carrying.
- The 128-colour palette adds 0.10 MB of PNG download; texture memory is unchanged.
- The night driver has the weakest parcel contrast (ΔE 10.6–16.7).
- The vehicles job's game parcels (`gb_parcel_s/m/l`) are still light kraft. I recommend retoning them to the new parcel colours, or the box visibly changes colour when it is handed over.

Changed files:
- /home/user/nurient/frost-village/tools/blender/gbf_anim.py
- /home/user/nurient/frost-village/tools/blender/gbf_parts.py
- /home/user/nurient/frost-village/tools/blender/gbf_presets.py
- /home/user/nurient/frost-village/tools/blender/gbf_render.py
- /home/user/nurient/frost-village/tools/blender/gbf_pack.py
- /home/user/nurient/frost-village/tools/blender/gbf_check.py
- /home/user/nurient/frost-village/tools/blender/gbf_preview.py
- /home/user/nurient/frost-village/tools/geumbangfolk_compose.js
- /home/user/nurient/frost-village/tools/geumbangfolk_compose.py
- /home/user/nurient/frost-village/tools/test/geumbangfolk_phaser.mjs
- /home/user/nurient/frost-village/assets/geumbangfolk/ (manifest.json, gbf_road_0.png/.json, gbf_hub_0.png/.json)
- /home/user/nurient/frost-village/docs/previews/gbf_* (new: gbf_polish.png, gbf_hub_places.png, gbf_doorstep.gif, gbf_phone_z16.png, gbf_phone_p360.png, gbf_phone_p360_z06.png)
- /home/user/nurient/frost-village/docs/build_reports/gb_people.md (includes the finding table, Korean designer summary, deviations, known limits and handoffs)
