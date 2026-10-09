# fx_city: build, critique, polish

## Polish (final)

The fx_city polish pass is complete. The previous agent had stopped after reading the code (it hit a usage limit), so every fix below was done in this run. The full rebuild finished. `check_fx_city.py` reports 0 errors and 0 warnings, and the Phaser test exits 0 with no page errors or 404s. The payload is 2440 KB, under the 3 MB limit.

One change outside my files is still needed before the game can load the kit: add `'fx_city'` to `FRAGMENTS` in `src/core/Assets.js` (owned by the v4 code agents). The manifest keeps the standard §2 format, so each anim key is its sheet key.

**What changed:**
- **Fires:** fires now sit on each roof and melt into it along a curved edge, with no straight glowing band. The heavy dark outline became a thin light rim that matches the existing house fire effects.
- **Fire placement:** a new table in the manifest gives the fire position for each of 87 buildings, measured from their images.
- **Window fire:** it is now a real glowing window opening on the wall, with soot above it and flames coming out of the top.
- **Scuffle:** the fight cloud is now snow powder with two different faces visible in every frame. There is also a back/front layered version, so the cityfolk `fight` animation can play inside it.
- **Hose:** the jet now looks like water rather than a pipe, works when aimed left, and no longer hooks back or stands as a rigid vertical pole.
- **Smaller fixes:** sirens read on snow, smoke has no seams, embers are solid, the newspaper headline bar is taller, and there is a new optional newspaper logo. The move-in and move-out icons now differ by shape, and there is a new unknown-culprit poster portrait.
- **Texture memory:** big sheets are marked lazy, so only 5.0 MB stays loaded all the time.

## FX spritesheets (all NORMAL blend, frames left to right in rows of at most 2048 px, anim key = sheet key)

| key | frame | frames / fps | play | anchor | load group | how the game uses it |
|---|---|---|---|---|---|---|
| fx_fire_bld_s / _m / _l | 240x272 / 328x360 / 424x432 | 12 / 14 | loop | [0.5, 0.7757] / [0.5, 0.7792] / [0.5, 0.7697] | fire | Building fire with base width 196 / 270 / 350 px. Anchor = centre of the fire base on the roof. Place it from `fireMount.buildings`. |
| fx_fire_glow (new) | 192x96 | 12 / 10 | loop | [0.5, 0.5] | fire | Flickering firelight on the roof, on the snow in front, or on a smouldering ruin. |
| fx_fire_window | 96x144 | 12 / 14 | loop | [0.5, 0.74] | fire | Drawn for a left-facing wall; use flipX for a right-facing wall. |
| fx_smoke_column | 224x400 | 16 / 10 | loop | [0.32, 0.95] | fire | Plume whose top breaks into separate puffs; flipX for wind from the other side. |
| fx_embers | 128x224 | 16 / 12 | loop | [0.5, 0.96] | fire | Solid 6–8 px embers. |
| fx_hose_stream | 32x24 | 8 / 30 | loop | [0, 0.5] | fire | Water segment, symmetric so any aim angle works; Canvas-fallback chain. |
| fx_hose_rope / _long (new long) | 256x24 / 512x24 | 8 / 30 | loop | [0, 0.5] | fire | Phaser Rope texture: the 256 px one for arcs up to 360 px, the 512 px one above. |
| fx_hose_tip | 96x80 | 8 / 30 | loop | [0, 0.5] | fire | Starts at the jet's width and breaks into droplets; `setFlipY(T.x < N.x)`. |
| fx_water_mist | 160x112 | 12 / 14 | loop | [0.5, 0.6] | fire | Spray where the jet hits. |
| fx_steam_puff | 128x192 | 14 / 16 | once | [0.5, 0.9] | fire | Steam where water meets fire. |
| fx_fight_cloud | 192x176 | 12 / 14 | loop | [0.5, 0.86] | fight | Simple mode: hide both residents and play this. |
| fx_fight_cloud_back / _front (new) | 224x192 | 12 / 14 | loop | [0.5, 0.86] | fight | Layered mode: back layer behind the two residents, front layer in front, same frame. |
| fx_alarm_flash | 128x128 | 8 / 10 | loop | [0.5, 0.5] | always loaded | Alarm lamp, about 2.5 Hz (under the 3 Hz photosensitivity limit). |
| fx_siren_glow_red / _blue | 128x64 | 8 / 12 | loop | [0.5, 0.5] | always loaded | Place at the vehicle `sirenPoint`; police start both on the same frame. |
| fx_demolish_dust | 256x192 | 16 / 20 | once | [0.5, 0.78] | demolish | Collapse / demolition. |
| fx_question_mark / fx_lightbulb_idea / fx_memory_sparkle | 80x112 / 96x128 / 112x112 | 12/10, 14/16 once (hold the last frame), 16/12 | — | [0.5, 0.95] / [0.5, 0.95] / [0.5, 0.9] | always loaded | Story-network effects over a resident's head. |

**How the game places things (manifest guides):**
- **`fireMount.buildings[key]`** lists, per building: the fires (position, sheet, scale, depth), glow, smoke, embers, window points (with flip) and alarm point. Offsets are in px from the building anchor.
  - The roof line is the median top edge of the building image, so towers, chimneys and floating shop signs don't lift the fire.
  - Window points come from the lit window panes in each render.
  - Buildings wider than 400 px get several fires along the roof (14 buildings).
  - The `tint` rule flickers the burning building between 0xffe2c8 and 0xffcfa6; the `grow` rule covers the stages from first flames to ruin.
- **`hoseAim`:** the arc height comes from the horizontal distance and is capped so the jet never hooks back; steep aims get a slight side curve and the hose sways a little.
  - Depth: max(firefighter, building + 1) + 0.5 for the jet, +1 for tip, mist and steam.
  - The jet textures need no flip; only the tip flips for leftward aims.
- **`fightGuide.play`** is the layered mode with the cityfolk `fight` animation. **`playSimple`** is the single cloud for far zoom or before cityfolk exists.
- **Loading:** load groups only when an incident starts. The fire group is 28.4 MB in total, but a typical small-house fire needs about 15 MB. The fight group is 5.5 MB and demolish 3.0 MB. Everything if loaded at once is 41.9 MB, versus 35.6 MB that was always loaded before.

## UI

**`ui4_icons`** is a 1016x264 atlas of 96 px icons with anchor [0.5, 0.5], plus `ui_stamp_bank`. `move_in` now shows an open lit doorway with a heart welcome mat and an arrow going in. `move_out` is a moving truck, so the two differ by shape, not only by arrow colour.

| panel | size | 9-slice L/R/T/B | layout |
|---|---|---|---|
| ui_wanted_poster | 224x296 | fixed | Portrait window 128x128 at [48,78]; title, name and reward boxes as before. |
| ui_wanted_silhouette (new) | 128x128 | fixed | Unknown-culprit portrait for the "도둑을 찾아라" mission. |
| ui_newspaper | 160x160 | 26/26/26/30 | Page. |
| ui_newspaper_masthead | 320x104 | 96/96/18/26 | Title area [96,12,128,64], now 64 px tall (was 52). |
| ui_newspaper_logo / _en (new) | 266x65 / 317x52 | fixed | Optional "솔방울 신문" logo (Jua) / "Pinecone News" (Fredoka); centre it in the masthead title area. |
| ui_newspaper_column | 112x140 | 16/16/54/16 | Headline bar 36 px (was 22), fits 24–30 px headlines; body inset [12,56,12,10]. |
| ui_newspaper_photo / ui_newspaper_divider | 96x80 / 128x16 | 14×4 / 24/24/6/6 | Unchanged. |
| ui_passbook / ui_passbook_row | 200x200 / 128x32 | 48/32/74/30 / 10/10/4/6 | Unchanged. |
| ui_story_card / _news | 176x124 | 40/26/36/36 | Unchanged. |

## Previews (`docs/previews/`)
- **Sheets and UI:** `fxcity_sheet.png` (all 23 strips) and `fxcity_ui.png` (icons and panels).
  - The UI mock-ups show a poster with a head-and-shoulders portrait plus an unknown-culprit poster, the newspaper with the logo, a passbook with a 이월 (carried-forward) row and stamps on deposits only, and the story cards.
  - Preview text uses Pretendard + Jua; Pretendard is downloaded once into `/tmp/fv_cache`.
- **`fxcity_firemount.png`:** all 87 buildings burning exactly as the table places them.
- **Phone shots:** `fxcity_phone_z06.png` and `fxcity_phone_z12.png` are real Phaser screenshots at 390x844, DPR 3, camera zoom 0.6 and 1.2. They show a burning townhouse and the school with two fires, swaying hoses, the fire truck and police car with sirens, the layered and simple scuffles, the crowd with story effects, and the alarm.
- **GIFs:** one per sheet (22), plus `fxcity_hose_arc.gif` (jets aimed right, left, steep and long) and `fxcity_fight_layers.gif` (layered vs simple scuffle).
- **Still mock-ups:** `fxcity_scene.png` (1x street mock-up) and `fxcity_phaser.png` (load-test screenshot).

I looked at every output; at phone zoom 0.6–1.2 the fire, jets, sirens and scuffle all read clearly.

## Checks
- **`check_fx_city.py`:** 0 errors, 0 warnings. New checks:
  - jet textures are vertically symmetric;
  - fire-table entries are valid, and the check warns if a current building has no entry;
  - lazy sheets have a load group;
  - memory is reported per load group.
- **`tools/test/fx_city_phaser.mjs`:** exit 0.
  - 23 anims, 268 frames checked, none missing, 55 sprites playing, 41 textures.
  - 8 Rope jets (one per direction) plus 2 chains: no hook-back, straight-up and straight-down aims curve 12 px, the tip flips only on leftward aims.
  - 8 nine-slices; phone shots at zoom 0.6 and 1.2.
- **Determinism:** re-rendering fx_fight_cloud, fx_siren_glow_red and fx_hose_tip gives byte-identical PNGs.

## Known issues
- `assets/civic` and `assets/cityfolk` don't exist yet, so the previews use stand-ins: a drawn wanted board, a streetlight as the alarm post, and townfolk or villagers as firefighters, police and fighters (`angry` villagers instead of the `fight` animation).
- The fire table is a snapshot of the building fragments. `beach_bld` appeared mid-build and is included after I ran `--mount-only`. When civic or any building fragment changes, run `python3 tools/fx/gen_fx_city.py --mount-only`; the check warns until then.
- 19 buildings have no detectable lit windows. They get estimated wall points, kept only where the image really shows a wall. 13 open stations, stalls and the hotel pool get no window fire. Exact window points from the building owners would be better, but agents couldn't message each other in this run.
- Every footprinted building or station gets an entry, including odd ones like the pool, the piers and the tent; the game decides what can burn.
- The Canvas-fallback chain still shows small steps at bends. The Rope is smooth.
- Fires are a 12-frame (~1 s) loop.

## Files (in `/home/user/nurient/frost-village/`)
- `tools/fx/gen_fx_city.py`: the builder. A full build takes about 10 min with 2 workers; it also accepts `--no-gif`, `--no-scene`, `--only k1,k2` and `--mount-only`.
- `tools/fx/gen_fx_city_mount.py` (new: measures the buildings and draws the firemount preview)
- `tools/fx/gen_fx_city_fx.py`, `tools/fx/gen_ui4.py`
- `tools/fx/gen_fx_city_preview.py`, `tools/fx/gen_fx_city_scene.py`
- `tools/fx/check_fx_city.py`, `tools/test/fx_city_phaser.mjs`
- `assets/fx_city/` (23 sheets, the `ui4_icons` atlas, 13 panel images, `manifest.json`)
- `docs/build_reports/fx_city.md`, which has this report plus the same outcome table.

## Critic issues and outcomes

| # | severity | issue | outcome |
|---|---|---|---|
| 1 | high | Fire placement: fires floated above towered roofs or sliced facades; scale was clamped on 39 of 48 buildings; no multi-fire rule | **Fixed.** Measured per-building table (87 buildings); new spans and a 0.85–1.15 clamp; several fires along the roof for wide buildings, in the table and the fallback rule; no reuse of `fxPoints.fire`. |
| 2 | high | Straight glowing band at the fire base | **Fixed.** Fire rises from an iso ellipse with roots at different heights and a curved, noisy fade; added `fx_fire_glow` and the building tint rule. |
| 3 | high | Fight cloud read as one mascot; random limbs; beige dust; the guide hid the cityfolk `fight` animation | **Fixed.** Two distinct faces in all 12 frames, two consistent outfits, bigger fists, a flying hat, snow powder. Added back/front layers and the layered `play` mode. |
| 4 | medium | Steep aims hooked back; straight-up aims were rigid poles | **Fixed.** Height from horizontal distance with a cap, side curve and sway; the test checks 8 directions. |
| 5 | medium | Leftward jets lit from below, droplets flying up | **Fixed.** Symmetric jet textures (checked) and a tip flip for leftward aims (tested). |
| 6 | medium | Jet looked like a pipe; tip had a step, a flat cap and bubble droplets | **Fixed.** Translucent cyan jet; the tip starts at the jet width and breaks into filled droplets. |
| 7 | medium | Contradictory hose depth rule | **Fixed.** Rule given above. |
| 8 | medium | Window fire had no window and no window points | **Fixed.** Iso window opening with soot; measured window points per building. |
| 9 | medium | Sirens invisible on snow | **Fixed.** 16→48 px flare, saturated rims, pulsing ring. A separate night (ADD) variant: **won't fix** — the normal art already reads at night. |
| 10 | medium | Smoke seams and flat top | **Fixed.** Smoothed billows, outline only on the outside, each puff fades by its own age and breaks away. |
| 11 | medium | Heavy dark fire outline vs house effects | **Fixed.** Thin light rim. |
| 12 | medium | 35.6 MB GPU, nothing lazy | **Fixed.** Lazy load groups; 5.0 MB always loaded. The large fire sheet is kept because it's a contract key, and only 4 buildings use it. |
| 13 | medium | Headline bar and masthead too small for game fonts | **Fixed.** 36 px bar, 64 px title area. |
| 14 | low | Masthead in the system font | **Fixed.** Optional logo images. |
| 15 | low | Censor-bar portrait, tiny face, no unknown-culprit art | **Fixed.** Head fills ~70% of the window; added `ui_wanted_silhouette`. |
| 16 | low | move_in / move_out differ only by arrow colour | **Fixed.** Open doorway vs moving truck. |
| 17 | low | Tip clipped; chain stepped; single rope length | Tip and rope length **fixed**. Chain steps: **won't fix** — it's only the Canvas fallback, softening the segment ends would add beads at every joint, and the Rope is smooth. |
| 18 | low | Hollow embers; mist arc popped at the loop point | **Fixed.** |
| 19 | low | Passbook stamps and missing carried-forward row; Hangul preview font | **Fixed.** |

All 19 issues reproduced as described.

## Critique

```json
[
 {
  "verdict": "polish",
  "summary": "I reviewed the kit read-only in the critic scratch folder S=/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v8_fx_city_critic_art/ (screenshots in S/out). The harness S/review_phaser.mjs ran Phaser at 390x844 with DPR 3, matching main.js: 720 logical px wide, k=1.65. It ran at zoom 0.6 and 1.0 over the real town houses, the fire truck, the police car and villagers.\n\n**Working well:**\n- **Contract:** every §AC item is present.\n- **Loops:** they are seamless. The wrap-to-first-frame difference is within the normal frame-to-frame range for fire, smoke, embers, hose and sirens.\n- **Nine-slices:** they stretch cleanly. The stretched strips vary by 0.00 px along x in every centre and edge, from 40x60 up to 680x1000.\n- **Icons:** they match ui2/ui3 in outline weight and glossy toy shading.\n- **Blending:** NORMAL is the right choice on snow.\n- **Korean text in the mock-ups:** natural and correct, and the passbook arithmetic adds up.\n\n**Three problems that will show in-game:**\n1. **Fire placement (fireMount):** following the manifest's own rules on real buildings leaves fires floating above the roof (school) or slicing across a facade with a ruler-straight glowing base (apartment). The scale is clamped to 1.3 on 39 of 48 buildings.\n2. **Fight cloud:** it reads as one grumpy cloud mascot with pencil-like limbs, not two people scuffling. Two pairs of eyes appear in only 2 of 12 frames. The fightGuide also hides both residents, so the contract's cityfolk `fight` anim (meant to play inside the cloud) is never shown.\n3. **Hose:** steep aims make a hairpin at the top, and leftward aims flip the jet's lighting and spray. The jet reads as a blue pipe more than water.\n\n**Smaller issues:**\n- The window fire has no window.\n- The siren glows are nearly invisible on snow.\n- The smoke shows bubble-wrap seams and a flat top.\n- The newspaper headline bar is too small for the game's font sizes.\n- The kit takes 35.6 MB of GPU memory and is not loaded lazily.\n\nFix the guide numbers, the fight cloud, and the hose and fire-base art, and it can ship.",
  "issues": [
   {
    "severity": "high",
    "area": "fireMount guide (fire size + placement)",
    "problem": "The manifest rules (anchor + [0, -0.55*topPx], scale clamp(0.85*fw/baseWidthPx, 0.7, 1.3)) do not fit real buildings. 39 of 48 town/buildings/harbor/vehicle buildings clamp at 1.3 because baseWidthPx 140/192/248 is far below footprints of 181-860 px. topPx includes towers and chimneys, so the school's fire floats in the air above its roof. On apartment_a (topPx 442) the fire base sits at the 4th floor and its glow band cuts across the brick facade. On logistics_center (fw=860) one L fire covers about 37% of the width; the 'two L fires' advice exists only in the build report, not in the manifest.",
    "evidence": "S/out/firemount_sizes.png (townhouse_b, supermarket, apartment_a, school composited exactly per fireMount); per-building table (e.g. supermarket raw 1.56, school raw 1.65, logistics_center raw 2.95, all clamped to 1.30); S/out/ph_street_z10_fire.png",
    "fix": "Recalibrate the sizes: S for fw<=240 (base ~200 px), M for <=340 (~290), L above that (~360), with a clamp of 0.85-1.15. For fw>420, spawn n=ceil(fw/360) L fires along the roof's long axis (from footprintPoly) with small depth offsets. Ask the town/civic/logistics owners for a per-building `fxPoints.blaze` [x,y] plus `blazeWidth`. Do not reuse `fxPoints.fire`: it already means the forge/grill point on station_toolsmith, watchtower and the props stations. Until those points exist, use the eave height rather than topPx for towered buildings. Put the multi-fire rule into manifest.fireMount."
   },
   {
    "severity": "high",
    "area": "fx_fire_bld_s/m/l base",
    "problem": "Every frame ends in a ruler-straight horizontal band of pale-yellow glow at the anchor line. In 2:1 iso the fire sits on sloped roofs and facades, so the straight base reads as a sticker on an invisible shelf, clearly visible at phone zoom 0.6-1.0. The burning house underneath also stays fully lit and clean, which makes the pasted look worse.",
    "evidence": "S/out/strip_fx_fire_bld_s_1.0.png and strip_fx_fire_bld_l_0.6.png (dark rows show the straight base); S/out/ph_street_z10_fire.png; S/out/firemount_sizes.png (apartment_a)",
    "fix": "Make the base irregular: a 2:1 iso-ellipse falloff, tongue roots starting at different heights, and a noisy fade over the bottom 20%. Alternatively, ship the flame crown without a base plus a separate `fx_fire_glow` (2:1 ellipse, warm, around 0.5 alpha) laid on the roof plane. Add to fireMount: tint the burning building with a warm flicker (setTint around 0xffd9b8, changing every ~0.15 s) so it looks lit by its own fire."
   },
   {
    "severity": "high",
    "area": "fx_fight_cloud comedy / contract integration",
    "problem": "The cloud does not read as two people. Two pairs of eyes appear in only frames 1 and 7 of 12; the other 10 frames show one angry face, so it reads as a cloud mascot. The cause is the eye windows in gen_fx_city_fx.py lines 742-747 (each pair visible for 0.62 of the loop, offset by 0.5). The limbs use four sleeve colours (PARKAS red/blue/yellow/green) and two trouser colours, which suggests random limbs, not two fighters. The fists look like pencil erasers at 1x. The fightGuide says to hide both residents, which contradicts CONTRACT_V8 §AD: cityfolk `fight` (cf_anim.py line 55) is 'for use inside fx_fight_cloud'. The beige dirt colour is also unbelievable on snow; the house fx_poof is snow-white with cool shading.",
    "evidence": "S/out/fight_zoom_0_3.png, S/out/fight_4_11.png, S/out/ph_street_z10_fight.png (at phone zoom 1.0: a beige cauliflower with tiny eyes); S/out/ph_street_z06.png",
    "fix": "Preferred: split the cloud into `fx_fight_cloud_back` and `fx_fight_cloud_front`. The front is a ring of puffs with gaps, stars, pow bursts and swooshes, so the two residents' `fight` anims show through, and the guide plays them inside instead of hiding them. Minimum fix: show both eye pairs in at least 10 of 12 frames with distinct styles (round eyes with brows vs squinty eyes under a beanie brim). Limit the limbs to two consistent identities, or make them a white tintable layer `fx_fight_limbs` that the game tints with each resident's outfit colours. Add a flying hat or mitten. Recolour the dust to snow powder (white to #DCE6F2 cool shading, like fx/fx_poof)."
   },
   {
    "severity": "medium",
    "area": "hoseAim arc (steep aims)",
    "problem": "The arc height h = clamp(0.3*|T-N|, 20, 120) ignores horizontal distance. For a target nearly straight above the nozzle, the jet passes the target and arrives moving downward. The tip, rotated to the final tangent, then points back down, giving a hook or hairpin. Straight north and south aims render as rigid vertical poles. The demo and GIF only aim up and to the right, so this was never caught.",
    "evidence": "S/out/ph_street_z10_fire.png (right-hand jet: N=(hx+40,hy+205), T about 382 px above with dx=-10, h=114.6, end slope +76, so the tip folds down); S/out/ph_hose_rope.png (N/S poles)",
    "fix": "Base the arc on horizontal distance: h = clamp(0.3*|dx|, 8, 120). If T is above N and the end tangent comes out downward, reduce h until it does not. Better still, use a ballistic arc in ground/height space (fixed launch angle, gravity) and project it to iso. Add 8-direction aims to tools/test/fx_city_phaser.mjs."
   },
   {
    "severity": "medium",
    "area": "hose lighting & tip orientation for leftward aims",
    "problem": "fx_hose_stream and fx_hose_rope are lit from the top: row 8 is brightest, rows 16-18 are dark blue at alpha 255. fx_hose_tip's droplets sit below the axis (1.4-1.7x more mass below centre). When aiming W/NW/SW, the rotation is about 180°, so the highlight ends up under the jet and the droplets fly upward.",
    "evidence": "S/out/ph_hose_W_vs_E.png (W jet lit from below vs E lit from above); S/out/zoom_fx_hose_stream.png; column profile of fx_hose_stream x=5",
    "fix": "Add to hoseAim: if T.x < N.x, set rope.flipY = true (Phaser 3.90 Rope.updateUVs honours _flipY), tip.setFlipY(true), and setFlipY on each chain segment. Alternatively, make the stream texture vertically symmetric with a centred highlight."
   },
   {
    "severity": "medium",
    "area": "hose look (water vs pipe)",
    "problem": "The jet is fully opaque, a constant ~13 px wide, with a dark-blue outline and regular sausage-like lumps, so at phone zoom it reads as a blue hose pipe or rope. The tip starts narrower than the rope, with a visible step at the seam, and ends in a squared-off cap. Its droplets are hollow outlined rings that read as soap bubbles.",
    "evidence": "S/out/ph_hose_W_vs_E.png, S/out/zoom_fx_hose_tip.png, S/out/ph_street_z10.png",
    "fix": "Use a cyan-white core with semi-transparent edges (edge alpha 0.5-0.7) and a lighter rim (around #5AA6E8). Break the jet up over the last ~30% with rope.setAlphas plus scattered droplets. Draw the tip at exactly the rope's width, without the flat cap, fanning into filled light-centred teardrops."
   },
   {
    "severity": "medium",
    "area": "hoseAim depth rule",
    "problem": "The chain text says 'Depth: above the firefighter, below the building fire', but the fire's depth is the building's depth + 1. A firefighter standing in front of the building has a greater depth than that, so no value satisfies both conditions.",
    "evidence": "assets/fx_city/manifest.json hoseAim.chain; fireMount.place 'depth = building depth + 1'",
    "fix": "Rope/chain depth = max(firefighter.depth, building.depth + 1) + 0.5, so the jet draws over the fire. Put the tip, mist and steam at rope depth + 1."
   },
   {
    "severity": "medium",
    "area": "fx_fire_window",
    "problem": "There is no window in the art: it is a free-floating outlined teardrop flame with a rounded bottom and a yellow glow pill. It has no wall facing (iso windows are parallelograms on either the x or the y wall) and no soot. No building manifest has window points (fxPoints keys found: smoke, sign, steam, light, …, no windows), so the guide's '1-2 fx_fire_window' has nowhere to go.",
    "evidence": "S/out/strip_fx_fire_window_1.0.png; S/out/ph_street_z10_fire.png; fxPoints key survey across */manifest.json",
    "fix": "Paint a glowing iso window opening with a soot streak above it and flames curling out of the top edge, as two facings (_x/_y) or flipX documented as the facing switch. Give fireMount a window heuristic, for example left wall = anchor + [-0.27*fw, -0.33*topPx] and right wall = [+0.27*fw, -0.33*topPx]. Also ask the town and civic owners for `fxPoints.windows`."
   },
   {
    "severity": "medium",
    "area": "fx_siren_glow_red/_blue readability",
    "problem": "With NORMAL blend on white snow, the rotating light fan comes out pale pink or lilac, and the core is only about 12 px. At phone zoom 0.6 the fire-truck beacon shows as a white star about 4 CSS px across, with no visible light spill. The vehicles already blink their own beacons, so the FX adds almost nothing by day.",
    "evidence": "S/out/strip_fx_siren_glow_red_1.0.png and strip_fx_siren_glow_blue_1.0.png (top rows); S/out/ph_street_z06.png; S/out/ph_street_z10.png",
    "fix": "Use a bigger 32-48 px four-point flare with a saturated darker rim (#D3202A / #1E5BD8), and a pulsing 2:1 ground ring with a saturated edge so it reads on snow. Optionally add an `_add` variant for night."
   },
   {
    "severity": "medium",
    "area": "fx_smoke_column shape",
    "problem": "The plume is built from overlapping circles whose outlines all show inside it, giving bubble-wrap or cobblestone seams. Every frame's top is cut by one global y alpha ramp: the first row with alpha >0.5 is at y=51-52 in all 16 frames, and its width jumps from 1-5 px to 71-129 px within 5 px, which makes a flat ceiling.",
    "evidence": "S/out/smoke_f0_zoom.png; S/out/strip_fx_smoke_column_1.0.png; top-row measurement in this review",
    "fix": "Outline only the outer silhouette (union the shapes first, then rim), with soft internal shading. Fade each puff by its own age so the top breaks into ragged separate puffs, and add 1-2 detached puffs drifting off the top."
   },
   {
    "severity": "medium",
    "area": "fire style vs house FX",
    "problem": "The building fire has a heavy dark-red outline, so it looks like an emoji sticker. The house fires already in use (assets/fx/fx_fire.png, ui2/fx_fire_big.png for the watchtower basket) have no outline and soft inner gradients. Both will be on screen together, and the town buildings are outline-free 3D renders.",
    "evidence": "S/out/house_fx_compare.png",
    "fix": "Soften the outline to a thin, lighter orange-red rim (around #E0582A, partial alpha) or drop it. Keep the toy colour bands and add a little inner glow and curl volume to match fx_fire_big."
   },
   {
    "severity": "medium",
    "area": "texture memory / loading",
    "problem": "fx_city takes 35.6 MB of GPU memory (fire_l 1408² = 7.6 MB, fire_m 5.5 MB, smoke 5.5 MB, demolish 3.0 MB), compared with 9.3 MB for all of assets/fx. Nothing in the manifest says these can load lazily, and the v3.5 review already raised texture memory.",
    "evidence": "VRAM computation over assets/fx_city/*.png (W*H*4); disk size 1954 KB",
    "fix": "Add `lazy: true` (or a note in conventions) for the fire, smoke, embers and demolish sheets: load them on the first incident and call textures.remove after the swap to the ruin sprite. Crop the frames tighter (fire_l frames are 30-36% empty). Consider dropping fire_l in favour of fire_m x1.25 plus a second instance."
   },
   {
    "severity": "medium",
    "area": "ui_newspaper_column / masthead legibility",
    "problem": "The column's headline bar is 22 px tall (headlineBox h=22, nine-slice top 40). That fits text of about 18 logical px, roughly 9.7 CSS px on a 390-pt phone (720 logical px map to 390 CSS px, a factor of 0.54). The game's own headline sizes are 24-30 px. In Phaser, 24 px headlines overflow the grey bar. The masthead titleBox is only 52 px tall for the paper's name.",
    "evidence": "S/out/ph_ui.png; manifest sprites.ui_newspaper_column.headlineBox [10,9,-10,22]; survey of fontSize values in src",
    "fix": "Make the headline bar about 36 px (top margin ~54) and the masthead title area about 64 px. Or author the pieces at 2x and document setScale(0.5)."
   },
   {
    "severity": "low",
    "area": "솔방울 신문 masthead",
    "problem": "With no baked text, the paper's name is drawn in the system font. The game bundles no web font (index.html and strings.js fall back through Pretendard, Apple SD Gothic Neo and Noto Sans KR), so the masthead looks like a plain document title rather than a town-paper logotype.",
    "evidence": "S/out/ph_ui.png",
    "fix": "Ship an optional baked logotype `ui_newspaper_logo` (plus `_en`) in tools/fonts/Jua-Regular.ttf, the OFL font already used for the title art, with a pinecone accent. Keep the text-free strip for localisation."
   },
   {
    "severity": "low",
    "area": "wanted poster mock / portraits",
    "problem": "`_mask_band` (gen_fx_city_preview.py lines 166-167) stamps a flat black bar with square white eye dots over a 3D portrait, which looks like a censor bar. The head fills only about 40% of the portrait window, so at x0.32 on the board the face is about 15 px and cannot be identified. That defeats the design's '주민 제보로 잡아요' (residents' tips catch the thief). There is also no art for an unknown culprit.",
    "evidence": "S/out/ui_wanted_mock_zoom.png; docs/previews/fxcity_scene.png board",
    "fix": "Frame the portrait as head and shoulders, with the head at least 65% of the window, and drop the band (or use the cityfolk acc_eye_mask render). Add `ui_wanted_silhouette` (a shadow bust with '?') for the '도둑을 찾아라' (find the thief) mission."
   },
   {
    "severity": "low",
    "area": "ui_icon_move_in vs move_out",
    "problem": "The two icons are near mirror images (house, box, arrow). At 32 px they differ only by arrow hue, green vs orange, which fails for red-green colour-blind players.",
    "evidence": "S/out/icons32_zoom.png; S/out/ph_ui.png HUD row",
    "fix": "move_in: an open door with a welcome mat or heart, and the arrow going in. move_out: a moving truck, or a box with motion lines plus a for-sale sign."
   },
   {
    "severity": "low",
    "area": "fx_hose_tip / chain fallback / rope length",
    "problem": "The tip clips droplets at the frame bottom (bottom-row alpha 173-252 in frames 0, 2, 3, 5 and 6). The Canvas fallback chain is stepped along the whole arc, not only at tight bends. The 256 px rope texture is mapped once, so a 450 px jet stretches the beads 1.76x and speeds up the flow.",
    "evidence": "tip edge measurement; docs/previews/fxcity_phaser.png top right; manifest hoseAim.rope",
    "fix": "Make the tip frame 96x80. Feather the first and last 3 px of fx_hose_stream and overlap segments by 4 px (or use stepPx 16). Provide 128/256/512 rope textures, or scale the rope fps by 256/L."
   },
   {
    "severity": "low",
    "area": "embers / water_mist loop",
    "problem": "The embers are 4-6 px hollow rings that disappear on snow at zoom 0.6. In fx_water_mist the long left splash arc of frame 11 vanishes on frame 0: the wrap difference is 40.6 against a median of 29.4 and a maximum of 34.5 between consecutive frames.",
    "evidence": "S/out/strip_fx_embers_1.0.png; S/out/strip_fx_water_mist_1.0.png; S/metrics.py output",
    "fix": "Make embers solid warm cores of 6-8 px with a dark-orange rim. Fade the mist's left arc out over frames 10-11."
   },
   {
    "severity": "low",
    "area": "preview mocks",
    "problem": "The passbook mock stamps 저축 (savings), 대출 (loan) and 화재 보험 (fire insurance) but not 이자 (interest) or 상환 (repayment), which contradicts the manifest's 'stamp deposits'. The first row implies an opening balance of 1,000 but has no 이월 (carried forward) row. The previews draw Hangul in WenQuanYi Zen Hei, a Chinese font with weak Hangul, which the designer will judge.",
    "evidence": "docs/previews/fxcity_ui.png passbook; gen_fx_city_preview.py FONT_PATHS",
    "fix": "Stamp only the + rows and add an '이월 1,000' row. Render the previews with Jua (display) and Noto Sans KR or Pretendard if available."
   }
  ],
  "keep": [
   "The manifest's standard format (anim key = sheet key) and the three guide blocks (fireMount, hoseAim, fightGuide): keep the structure and fix the numbers.",
   "NORMAL blend for every sheet, with saturated cores and darker rims so they read on white snow.",
   "The Rope-on-WebGL approach for aimed jets, with the seamless 4 px/frame flow and the 32 px period.",
   "Seamless loops: the wrap difference stays within the frame-to-frame range for fire S/M/L, smoke, embers, hose and sirens.",
   "The ui4_icons set: outline weight and glossy toy shading match ui2/ui3, and it reads well at 48 px. Keep piggy, passbook, badge, cuffs_cute (with the pink heart charm), thief, hydrant, firetruck, forklift, stock, story, question and memory.",
   "All 10 panels: the nine-slice stretch areas are perfectly uniform (0.00 variation along x) and the corners hold up from 40x60 to 680x1000. Keep the pinecone masthead medallions, the passbook's navy cover and bookmark, and the lilac/blue story-card variants with the speech tail.",
   "The no-baked-text policy for body copy (add only an optional logotype).",
   "fx_lightbulb_idea: pop, flicker, lit, then hold.",
   "fx_question_mark bobbing with small ?s popping off.",
   "fx_memory_sparkle: the pastel ribbon spiral.",
   "fx_steam_puff and fx_demolish_dust one-shots: visible from frame 0 and fully faded by the last frame.",
   "fx_alarm_flash reads clearly at zoom 0.6 and flashes at about 2.5 Hz, under the 3 Hz photosensitivity limit.",
   "The smoke column's overall silhouette, its orange-lit underside and the wind drift (flipX for the other wind).",
   "Korean copy in the mock-ups: natural, with correct particles and a cute tone (현상수배 / 빵 도둑 \"살금이\" / 포상금 500, the 솔방울 신문 headlines, 들었어? …났대!). The passbook arithmetic is correct.",
   "The deterministic procedural build, the payload of 1985 KB (under 3 MB) and the check script."
  ]
 }
]
```

## Build

The fx_city job is finished: the city FX and UI kit is built and `check_fx_city.py` reports 0 errors and 0 warnings. The Phaser 3.90 load test passes with no missing frames, page errors or 404s. The payload is 1985.4 KB, under the 3 MB limit. One code change is still needed before the game can load the kit: add `'fx_city'` to `FRAGMENTS` in `src/core/Assets.js` (the v4 code agents own that file).

**Resume.** The earlier agent was killed during its last full rebuild, so I restarted that build and it completed. After looking at every output I made three improvements:
- **Fight cloud:** two pairs of grumpy cartoon eyes now peek out of the dust ball, so it reads as two people scuffling.
- **Scene wanted board:** the posters were empty. They now show composed portraits with name and reward text, and the board has a proper snow-capped top. The portrait-and-text step is a shared helper, `wanted_mock`, which the UI preview also uses.
- **Labels:** I moved overlapping labels and the misplaced lightbulb in the scene, and fixed the cut-off caption in the hose GIF.

Re-rendering the same sheets gave byte-identical PNGs.

**FX sheets** (`fx_city/<key>.png`). All use normal blend so they read on white snow. Frames run left to right, wrapped into rows of at most 2048 px. The anim key is the sheet key.

| key | frame | frames | fps | play | anchor |
|---|---|---|---|---|---|
| fx_fire_bld_s / _m / _l | 208x224 / 280x288 / 352x352 | 16 | 14 | loop | [0.5, 0.86] |
| fx_fire_window | 96x144 | 12 | 14 | loop | [0.5, 0.74] |
| fx_smoke_column | 224x400 | 16 | 10 | loop | [0.32, 0.95] |
| fx_embers | 128x224 | 16 | 12 | loop | [0.5, 0.96] |
| fx_hose_stream | 32x24 | 8 | 30 | loop | [0, 0.5] |
| fx_hose_rope (extra) | 256x24 | 8 | 30 | loop | [0, 0.5] |
| fx_hose_tip (extra) | 96x64 | 8 | 30 | loop | [0, 0.5] |
| fx_water_mist | 160x112 | 12 | 14 | loop | [0.5, 0.6] |
| fx_steam_puff | 128x192 | 14 | 16 | once | [0.5, 0.9] |
| fx_fight_cloud | 192x176 | 12 | 14 | loop | [0.5, 0.86] |
| fx_alarm_flash | 128x128 | 8 | 10 | loop | [0.5, 0.5] |
| fx_siren_glow_red / _blue | 128x64 | 8 | 12 | loop | [0.5, 0.5] |
| fx_demolish_dust | 256x192 | 16 | 20 | once | [0.5, 0.78] |
| fx_question_mark | 80x112 | 12 | 10 | loop | [0.5, 0.95] |
| fx_lightbulb_idea | 96x128 | 14 | 16 | once (ends lit; hold, then fade) | [0.5, 0.95] |
| fx_memory_sparkle | 112x112 | 16 | 12 | loop | [0.5, 0.9] |

**How the game uses them.** The manifest has three guides with exact rules:
- **`fireMount`:** picks S, M or L from the building footprint width (up to 280 px is S, up to 380 px is M). It also gives placement, scale, and the order of stages: window fire, full fire, dying with steam, then swap to the civic `ruin_*` sprite.
- **`hoseAim`:** gives the arc formula from nozzle to target. On WebGL the recommended path is a Phaser Rope textured with `fx_hose_rope`. The Canvas fallback is a chain of `fx_hose_stream` sprites, plus the tip, mist and steam at the target.
- **`fightGuide`:** hide both residents, play the cloud for 2–4 s, then the poof and the police. It also says when to show the "?", lightbulb and sparkle.

**UI.** `ui4_icons` is a 1016x264 atlas of the 24 contract icons plus a bank stamp (`ui_stamp_bank`), all 96x96 with anchor [0.5, 0.5]. They stay readable at 32 px. The 10 panels are plain images for Phaser's nine-slice:
- **`ui_wanted_poster`:** a fixed 224x296 image with a 128 px portrait window and title, name and reward boxes.
- **`ui_newspaper`:** plus masthead, column, photo and divider pieces.
- **`ui_passbook`:** plus a 32 px row piece.
- **`ui_story_card`:** plus a news variant.

Margins and layout boxes are in the manifest. No text is baked in; the game draws every word, including "솔방울 신문".

**Previews** (in `docs/previews/`):
- `fxcity_sheet.png`
- `fxcity_ui.png`
- `fxcity_<key>.gif` for all 19 sheets
- `fxcity_hose_arc.gif`
- `fxcity_scene.png` (1x street: burning townhouse with smoke and embers, fire truck with beacon, two firefighters aiming hoses with mist and steam, crowd with "?", lightbulb and sparkle, fight cloud by the police car, alarm post, wanted board, newspaper and rumour card)
- `fxcity_phaser.png`

**Known issues:**
- The Canvas-fallback hose chain shows faint joints at tight bends. The Rope is smooth, and the game runs WebGL when available.
- `assets/civic` and `assets/cityfolk` don't exist yet, so the scene uses stand-ins: a drawn wooden board, a town streetlight for the alarm post, and townfolk in red helmets as firefighters. The scene script switches to the real sprites once those appear; re-run it then.
- The scene is a still mock-up, and its hose uses a Python imitation of the Phaser Rope.
- Burnt-out building art comes from the civic agent's `ruin_*` sprites, not this kit.
- Fire comes in three fixed sizes with a 0.7–1.3 scale limit; a very wide building should get two large fires side by side.
- Preview text is drawn in WenQuanYi Zen Hei, so in-game text will look slightly different.

Rebuild everything with `python3 tools/fx/gen_fx_city.py` (about 5 minutes with 2 workers).

Files are in `/home/user/nurient/frost-village/`:
- `tools/fx/gen_fx_city.py`
- `tools/fx/gen_fx_city_fx.py`
- `tools/fx/gen_ui4.py`
- `tools/fx/gen_fx_city_preview.py`
- `tools/fx/gen_fx_city_scene.py`
- `tools/fx/check_fx_city.py`
- `tools/test/fx_city_phaser.mjs`
- `assets/fx_city/`
- `docs/build_reports/fx_city.md`
