# fx_city build report (CONTRACT_V8 §AC)

The city FX and UI kit is in `assets/fx_city/`. It has all 17 contract FX sheets plus 2 hose extras, all 24 contract icons plus a bank stamp, and the 4 contract panels plus 6 helper pieces. `check_fx_city.py` reports 0 errors and 0 warnings. The payload is 1985 KB, under the 3 MB limit. The Phaser 3.90 load test passes: every frame exists, there are no page errors and no 404s.

The build is procedural (numpy + Pillow on top of `fxlib`), uses no Blender and is deterministic. Re-rendered sheets were byte-identical to the shipped PNGs. I didn't edit any existing script or asset, and ran no state-changing git commands.

**One code change is needed before the game can load it:** add `'fx_city'` to `FRAGMENTS` in `src/core/Assets.js`. The manifest uses the standard §2 format (`spritesheets`, `atlases`, `images`, `sprites`, `nineSlice`), so `Assets.sheetAnims` creates the anims as-is. Each anim key equals its sheet key.

## FX spritesheets

All sheets use NORMAL blend: saturated cores with darker warm or cool rims, so they read on white snow. In the sheet PNGs, frames run left to right and wrap into rows at 2048 px. Loops are seamless. One-shots start visible on frame 0 and fade on their last frames.

| key | frame | frames | fps | play | anchor | what / how the game uses it |
|---|---|---|---|---|---|---|
| fx_fire_bld_s | 208x224 | 16 | 14 | loop | [0.5, 0.86] | Building fire for S plots (footprint ≤ 280 px): a crown of toy flame tongues on a glowing base, licks breaking off, warm halo. |
| fx_fire_bld_m | 280x288 | 16 | 14 | loop | [0.5, 0.86] | Same fire for M plots (footprint ≤ 380 px). |
| fx_fire_bld_l | 352x352 | 16 | 14 | loop | [0.5, 0.86] | Same fire for L plots (apartments, halls, warehouses). |
| fx_fire_window | 96x144 | 12 | 14 | loop | [0.5, 0.74] | Flames licking out of a window with a flickering room glow. Anchor = window centre; flipX freely. |
| fx_smoke_column | 224x400 | 16 | 10 | loop | [0.32, 0.95] | Tall plume: sooty billows lit orange underneath that drift right and lighten as they rise. flipX for the other wind; scale 0.5 for a starting fire or smouldering ruin. |
| fx_embers | 128x224 | 16 | 12 | loop | [0.5, 0.96] | Sparks with short trails spiralling up, for big fires and ruins. |
| fx_hose_stream | 32x24 | 8 | 30 | loop | [0, 0.5] | One seamless water-jet segment that flows +x by 4 px per frame. Chained along the aimed arc. |
| fx_hose_rope | 256x24 | 8 | 30 | loop | [0, 0.5] | Extra: the same jet, 8 periods long, as a Phaser Rope texture. This is the recommended aiming path. |
| fx_hose_tip | 96x64 | 8 | 30 | loop | [0, 0.5] | Extra: end of the jet breaking into a fan of droplets. Attach it at the arc end with the last tangent rotation. |
| fx_water_mist | 160x112 | 12 | 14 | loop | [0.5, 0.6] | Spray cloud, splash flicks and falling droplets at the impact point. |
| fx_steam_puff | 128x192 | 14 | 16 | once | [0.5, 0.9] | White steam billow where water meets fire. Spawn one every 0.3–0.5 s near the impact point, more often as the fire dies. |
| fx_fight_cloud | 192x176 | 12 | 14 | loop | [0.5, 0.86] | Cartoon scuffle: a tumbling dust ball with fists and boots popping out, two pairs of grumpy cartoon eyes peeking out, dizzy stars, pow bursts, swooshes and kicked-up dust. |
| fx_alarm_flash | 128x128 | 8 | 10 | loop | [0.5, 0.5] | Red alarm lamp with "!", a warning burst, ringing arcs and a ripple ring. |
| fx_siren_glow_red | 128x64 | 8 | 12 | loop | [0.5, 0.5] | Rotating beacon light fan on the ground plane, with a lamp flare. Place at the vehicle `sirenPoint`. |
| fx_siren_glow_blue | 128x64 | 8 | 12 | loop | [0.5, 0.5] | Half a turn after red. Police: start both on the same frame. |
| fx_demolish_dust | 256x192 | 16 | 20 | once | [0.5, 0.78] | Collapse or demolition: a dust ring rolls out, a cloud billows and planks and bricks fly. Scale 1.2–1.6 for big plots, 0.6 per excavator bucket hit. |
| fx_question_mark | 80x112 | 12 | 10 | loop | [0.5, 0.95] | Curious resident: a glossy blue "?" bobbing, with small ones popping off. Anchor = head top (character anchor + [0, -78]). |
| fx_lightbulb_idea | 96x128 | 14 | 16 | once | [0.5, 0.95] | "Aha!": the bulb pops up, flickers and lights. It ends lit on purpose: hold the last frame about 0.8 s, then fade. |
| fx_memory_sparkle | 112x112 | 16 | 12 | loop | [0.5, 0.9] | Remembering or hearing a rumour: pastel twinkles and a ribbon spiral in a soft lilac glow. |

The manifest also has three guide blocks: `fireMount`, `hoseAim` and `fightGuide`.

**`fireMount` (building fires)**
- **Choose a sheet** by building `footprint[0]`: up to 280 px use S, up to 380 px use M, larger use L.
- **Place it** at building anchor + [0, −0.55·topPx] with scale clamp(0.85·fw / baseWidthPx, 0.7, 1.3) and depth = building depth + 1.
- **Stages:**
  - Start: one `fx_fire_window` plus `fx_smoke_column` at 0.5.
  - Full fire: fire sheet, 1–2 windows, full smoke and `fx_embers`.
  - Dying: lower the alpha and scale, spawn more steam and tint the smoke lighter.
  - Burnt out: swap in the civic `ruin_*` sprite with a small smoke column and faint embers.

**`hoseAim` (aimable hose)**
- **Arc:** P(s) = N + (T − N)·s + [0, −h·4s(1−s)], where h = clamp(0.3·|T−N|, 20, 120). N is the nozzle (cityfolk `nozzlePoint` or truck `hosePoint`) and T is the target.
- **Rope (WebGL, recommended):** call `this.add.rope(N.x, N.y, 'fx_hose_rope', 0, points)` with points sampled every ~12 px, and advance the frame at 30 fps. Re-aim with `setPoints`. This is one draw call with perfectly smooth bends.
- **Chain (works on Canvas too):** ceil(length / 32) `fx_hose_stream` sprites, each rotated to the tangent, with scaleX = (L + 1) / 32 and scaleY 1.0 → 0.7 along the arc, all animating in sync.
- **Both:** `fx_hose_tip` goes at the end and `fx_water_mist` + `fx_steam_puff` at T.

**`fightGuide`:** hide both residents, then play `fx_fight_cloud` at their midpoint for 2–4 s. Finish with `fx_poof` (assets/fx) and show them apart, dizzy or sulking. Police arrive with the red and blue glows. It also maps the story FX: `?` when asking about something new, the lightbulb when learning or getting an idea, the sparkle when remembering or hearing a rumour.

## UI

**`ui4_icons`** is a trimmed JSON-hash atlas, 1016×264, with `sourceSize` 96×96 and anchor [0.5, 0.5]. The icons are in the soft-toy house style of `assets/ui`, `ui2` and `ui3`, and stay readable at 32 px on cream, the dark HUD and blue buttons.
- **Bank:** piggy, loan, interest, passbook, insurance
- **Story:** story, rumor (ear), question, friend_new, memory, move_in, move_out, newspaper
- **Police:** badge, wanted, cuffs_cute, thief
- **Fire:** fire_alert, firetruck, hydrant
- **Logistics:** box, forklift, settle (receipt + stamp), stock
- **Extra:** `ui_stamp_bank` (red bank seal imprint)

**Panels** are plain images, not atlas frames, so `this.add.nineslice` can use them. No text is baked anywhere: the game draws every word.

| key | size | 9-slice L/R/T/B | layout |
|---|---|---|---|
| ui_wanted_poster | 224x296 | fixed (not 9-slice) | titleBox [40,22,144,36] for "현상수배", portraitWindow [48,78,128,128], nameBox [40,224,144,26], rewardIcon [52,262,24,24], rewardBox [82,256,104,26]. Use ×0.3 on the civic wanted_board `posterPoints`. |
| ui_newspaper | 160x160 | 26/26/26/30 | newsprint page, contentInset [24,24,24,28] |
| ui_newspaper_masthead | 320x96 | 96/96/18/28 | pinecone medallions; draw "솔방울 신문" in titleBox (x 96 → width − 96) |
| ui_newspaper_column | 112x128 | 16/16/40/16 | headline bar (headlineBox), body in contentInset [12,42,12,10] |
| ui_newspaper_photo | 96x80 | 14/14/14/14 | photo slot, clip to contentInset [10,10,10,10] |
| ui_newspaper_divider | 128x16 | 24/24/6/6 | section rule (stretch x only) |
| ui_passbook | 200x200 | 48/32/74/30 | 통장: titleBox [44,12,120,22], column titles at headerY 66, rows in contentInset [42,74,22,26] |
| ui_passbook_row | 128x32 | 10/10/4/6 | one 32-px line; stamp deposits with ui_stamp_bank ×0.3 |
| ui_story_card | 176x124 | 40/26/36/36 | rumour card (lilac band, speech tail); icon at iconPoint [24,20] ×0.4, text in contentInset [18,34,16,28] |
| ui_story_card_news | 176x124 | 40/26/36/36 | extra news variant (sky-blue band, push-pin); same size and margins |

## Previews (`docs/previews/`)
- `fxcity_sheet.png`: every FX strip cycling over snow, plaza, sea and night, with anchor crosses.
- `fxcity_ui.png`: icons at 96, 48 and 32 px on cream, dark and button backgrounds, and the panels with their 9-slice margins. It also has mock-ups as the game would compose them: a wanted poster with portrait, the 솔방울 신문 page, a passbook and two story cards.
- `fxcity_<key>.gif` for all 19 sheets, plus `fxcity_hose_arc.gif`, which shows the Rope and the chain aimed at three targets, with the tip, mist and steam.
- `fxcity_scene.png`: a 1x mock street (PPU 64) built from `assets/town` houses. It shows:
  - a townhouse on fire, with smoke column, embers and a window fire;
  - the `assets/vehicles` fire truck with its red beacon;
  - two firefighters aiming hose ropes, with mist and steam at the impact;
  - a townfolk crowd with `?`, lightbulb and sparkle;
  - the fight cloud next to the police car with red and blue glows;
  - an alarm post;
  - a wanted board with two posters that carry portraits;
  - the 솔방울 신문 and a rumour card as UI overlays.
- `fxcity_phaser.png`: the headless Phaser screenshot. It plays all 19 anims, lays out the icons, stretches 11 nine-slices, and shows 3 chained streams and 2 ropes.

## Checks
- `python3 tools/fx/check_fx_city.py`: 0 errors, 0 warnings. It checks:
  - every contract key is present, and file paths and grid sizes are correct;
  - no frame is empty, loops are seamless and one-shots are visible on frame 0;
  - FX keep enough rim contrast to read on snow;
  - hose segment and rope are seamless in x with an exact 4 px/frame flow;
  - atlas frames are in bounds and filled enough to read at 32 px;
  - 9-slice margins and layout boxes are inside their images;
  - payload ≤ 3 MB, and there are no unlisted files.
- `node tools/test/fx_city_phaser.mjs`: 19 anims, 236 frames checked, 0 missing, 62 sprites playing, 38 hose segments, 11 nine-slices, Rope OK, 34 textures, no errors and no 404s.

## Known issues
- The segment chain shows faint joints at tight bends. That is inherent to straight 32 px pieces, so use the Rope on WebGL (the game runs `Phaser.AUTO`) and keep the chain as the Canvas fallback.
- `assets/civic` and `assets/cityfolk` don't exist yet, so the scene uses stand-ins:
  - a hand-drawn wooden board instead of the wanted_board;
  - a town streetlight instead of the fire_alarm_post;
  - townfolk in red helmets instead of cityfolk firefighters and police.

  `gen_fx_city_scene.py` already switches to the real sprites once those manifests appear. Re-run it then.
- The scene is a static frame mock-up, not a game capture. It draws hose ropes with a Python stand-in for the Phaser Rope.
- Burnt-out building art isn't part of this kit; the civic `ruin_*` sprites cover it. The fire guide only says when to swap them in.
- Fire sizes come in three fixed classes plus the 0.7–1.3 scale clamp. A very wide warehouse should get two L fires side by side rather than one stretched sheet.
- The poster, newspaper and passbook text in the previews is drawn by the preview script in WenQuanYi Zen Hei. The game renders it in its own Korean UI font, so the look will differ slightly.

## Files
In `/home/user/nurient/frost-village/`:
- `tools/fx/gen_fx_city.py`: builder, specs, manifest and guides. Run `python3 tools/fx/gen_fx_city.py`; it takes about 5 min with 2 workers. `--no-gif` and `--no-scene` skip outputs, and `--only k1,k2` writes scratch previews only.
- `tools/fx/gen_fx_city_fx.py`: FX art.
- `tools/fx/gen_ui4.py`: icons and panels.
- `tools/fx/gen_fx_city_preview.py`: sheet and UI previews, hose GIF, and the mock-up helpers (`wanted_mock`, `newspaper_mock`, `passbook_mock`).
- `tools/fx/gen_fx_city_scene.py`: street scene, plus the Python `hose_rope()` and `hose_arc()`.
- `tools/fx/check_fx_city.py`
- `tools/test/fx_city_phaser.mjs`
- `assets/fx_city/`: 19 sheets, `ui4_icons.png` + `.json`, 10 panel PNGs and `manifest.json`.
