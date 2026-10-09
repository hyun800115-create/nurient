# beach — 비평·다듬기 기록 (v7 해수욕장 소품)

## critique

{
 "verdict": "polish",
 "summary": "I reviewed the Sunny Beach set (assets/beach) in a Phaser 3.90 page at phone size: 390x844 CSS at DPR 3 with the game's View.k of 1.65, zoom 0.6, 1.0 and 1.2. The page used the live Water.js tropical sea, the real snow and sand ground with the snow kit placed by its own rules, and existing sprites next to the beach props: the chief, villagers, the harbour seafood_restaurant, the town cafe, a bench and lamps, and the ships yacht. I also built a points sheet with stand-in characters on every staff, customer, seat, lying, work, play, stand and door point, a sheet of all 8 boat headings with riders and overlays, frame strips with per-frame pixel differences for every animation, seam composites for the tiles, and colour and contrast measurements against the harbour, town and village props.\n\nAll artefacts are in OUT = /tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v7_beach_critic/out. The harness is in the parent folder (review.js, run.mjs, strips.py, cstrips.py, outline.py).\n\nAt 1.0–1.2x the beach is genuinely charming. The parasols, lifeguard tower, changing booth, banana boat and kayak crews, raft and buoy line read well and sit happily next to the harbour and town sets. Scale against the 1.45 m chief is right. Shadows fall down-right with the same alpha as the harbour (about 88 against 89). Atlases are at most 2048 px and the payload is 1.91 MB.\n\nThe set is not ready to integrate as documented, because of these problems:\n- **Sunbathers will lie backwards.** The beach's lyingDirs point from hips to head, but the beachfolk `sunbathe` direction is where the feet point.\n- **Sand-castle diggers point the wrong way.** Their workDirs are NE/N, which no people set has `dig` frames for, and the stand-ins hide the castle completely.\n- **The wet sand is a hard-edged brown strip.** There is no piece to blend dry sand into wet.\n- **Four seat points need fixing.** The sun-lounger seat is about 19 px too low. The lounger_x seat and two picnic-table seats face NE, which no character set has `sit` frames for.\n- **The ice-cream cart's bell animation does nothing,** and the vendor is drawn on top of the cart.\n- **The beach and water sets disagree on sea level.** Beach says the sea is 30 px below the sand; Water.js and water.md say the sea is level with the sand on a sand beach.\n\nThe props are also systematically more washed-out than the house style: tonal spread 0.31 against about 0.52, and their darkest 5% sits at 0.6–0.72 against 0.27–0.45. Pastel items on pale sand therefore fade at 0.6x.\n\nSeveral pieces look cheap next to the rest: blank sign boards, invisible footprint and ripple decals, sand castles that blend into the sand, paper-cutout palm fronds whose sway jumps, and a sand texture with visibly repeating blotches.",
 "issues": [
  {
   "severity": "high",
   "area": "lying points / beachfolk sunbathe contract",
   "problem": "lyingDirs is defined as the screen direction from hips to head (NE on sun_lounger and every decal_towel_*, NW on the _x variants). Beachfolk `sunbathe` uses dir = where the FEET point, with SE/NE rendered and SW/NW mirrored. The beach report says to put a sunbathe frame at lyingPoints[i] facing lyingDirs[i]; doing that lays every sunbather head-to-foot reversed, with the head at the footrest and the feet up on the raised backrest. The core beach activity looks broken.",
   "evidence": "assets/beach/manifest.json conventions.points ('lyingDirs = screen direction hips -> head'), sun_lounger.lyingDirs ['NE'] with lyingHeadPoints [27,-56]; tools/blender/bf_anim.py:9 and :222 and assets/beachfolk/manifest.json beachfolk.sunbathe.dir ('dir = where the FEET point'); tools/beachfolk_compose.js:20; docs/build_reports/beach.md 'How the game should use them' item 7. Overlay of hip, head and feet lines: OUT/pt_row2a.png, OUT/pt_lounger_4x.png.",
   "fix": "Add an explicit `lyingFeetDirs` field (SW for sun_lounger and the Y towels, SE for sun_lounger_x and the _x towels) and add lyingFeetPoints to the towels too. Rewrite report item 7 as 'play beachfolk sunbathe with dir = lyingFeetDirs[i]'. Add a beach_check assertion that lyingFeetDirs matches the screen direction from lyingPoints to lyingFeetPoints. Tell the beachfolk owner so both build reports use one sentence."
  },
  {
   "severity": "high",
   "area": "sandcastle_* / bucket_spade work and play points",
   "problem": "Every sandcastle has workDirs NE/N, and bucket_spade has playDirs NE. Beachfolk `dig` exists only for S/SE/E (SW/W by mirroring), so diggers at these points have no animation. The points also sit on the camera side (−Y, below the castle), so the kids' backs cover the castle entirely, which breaks the '모래성 쌓기 / 모래성 대회' feature the design doc promises.",
   "evidence": "assets/beach/manifest.json sandcastle_build_0..3 workPoints [[-44,6],[5,25]] workDirs ['NE','N']; sandcastle_l adds ['NE','NE','NW']; assets/beachfolk/manifest.json anims.dig.dirs ['S','SE','E']. Kids with their backs to the camera hide sandcastle_build_2 and sandcastle_l: OUT/pt_row2b.png. The castle is invisible in the phone render: OUT/phone_z10_crop_mid.png (kids at the bottom left, castle not visible).",
   "fix": "Move work points to the far side so the castle is drawn in front of the diggers. For example, put sandcastle_build_* and _m at [[-34,-17],[34,-17]] with workDirs ['SE','SW'], add [0,-30] facing 'S' for _l, and use bucket_spade playPoints [[-24,-12]] facing 'SE'. Keep a beach_check rule that every *Dirs value has frames in the target anim's dirs (or their mirrors)."
  },
  {
   "severity": "high",
   "area": "ground: dry to wet sand transition",
   "problem": "ground_sand_wet can only be used as a whole-cell fill, and sandKit has no dry-to-wet transition piece. Along the whole shoreline the result is a ruler-straight, hard-edged orange-brown stripe that reads like a dirt road or cardboard strip. It also clashes with the animated wet band Water.js draws itself. This is the first thing the eye meets at the waterline, at every zoom.",
   "evidence": "OUT/z10_wetedge.png (hard edge between dry and wet cells), OUT/phone_z06.png (brown stripe along the whole shore at 0.6x). manifest.sandKit.layers lists no wet transition. The builder's preview hides this with a per-pixel numpy slope (tools/blender/beach_preview.py:442-456) the game does not have.",
   "fix": "Ship feathered `ground_sand_wet_edge_x/_y` (+ `_near`, 3 variants each) strips with an irregular, lace-like alpha ramp 40–60 px wide, with placement rules in sandKit. Alternatively replace the cell fill with a tiling `decal_wet_band_x/_y` (512×128, vertical alpha gradient). Match the wet colour to Water.js water_shore_ramp's sand row so the shader's wet band and the baked band meet without a step."
  },
  {
   "severity": "medium",
   "area": "sun_lounger / sun_lounger_x seat points",
   "problem": "sun_lounger.seatPoints [0,-4] puts the sit anchor about 0.07 m above the sand at the footprint centre, while the cushion is at about 0.41–0.47 m (lyingPoints dy −23, lyingHeightM 0.47). A seated villager sinks about 19 px into the frame with her legs among the lounger legs. sun_lounger_x seats the person on the FAR (+Y) rail facing NE, back to the camera, and no people set has `sit` NE frames, so the game falls back to a standing figure.",
   "evidence": "OUT/pt_lounger_4x.png (grandma `sit` SW at seatPoint sinks below the cushion); OUT/pt_row2a.png (sun_lounger_x: fallback standing figure, back to the camera). The page logged 'fallback npc_aunt sit NE -> idle_NE_0' (OUT/phone_z10.json, OUT/points.json); townfolk2 sit dirs are S/SE/E only.",
   "fix": "sun_lounger: seatPoints ≈ [14,-17] (the +X side rail at seat height) with seatDirs 'SE'. sun_lounger_x: seatPoints ≈ [-14,-17] (the −Y near rail) with seatDirs 'SW'. Add a beach_check rule that the seat dy roughly equals −55.4 × seat height in metres."
  },
  {
   "severity": "medium",
   "area": "picnic_table_beach seats facing NE",
   "problem": "Seats 1 and 3 face NE, and no character set (villagers, townfolk2, beachfolk) has `sit` NE frames. Half of the table can only show a standing figure poking through the bench.",
   "evidence": "manifest picnic_table_beach seatDirs ['SW','NE','SW','NE']. Fallback logged in OUT/points.json ('npc_grandpa sit NE -> idle_NE_0'). Visible standing figures at the near bench: OUT/pt_row1b.png, OUT/phone_z10_crop_mid.png.",
   "fix": "Copy the boats' solution: add `seatsStand` (idle-NE anchors about 12 px lower) for the back-facing seats plus an overlay `picnic_table_beach_front` (near bench and table edge), so a back-view idle figure is cut at the waist. Otherwise drop seats 1 and 3 until a sit-NE pose exists."
  },
  {
   "severity": "medium",
   "area": "icecream_cart",
   "problem": "(a) anims.bell is effectively a no-op: frame 0 equals frame 2, the mean frame difference is 0.02, and about 220 scattered pixels change. The bell at fxPoints.bell [-1,-91] is hidden under the umbrella, so the 'calling customers' moment is invisible. (b) The notes promise 'a giant strawberry cone on the roof', which is not in the render; only a small cone peeks from under the umbrella, so the cart reads plain. (c) With staffDepth 'front' the vendor, who stands BEHIND the cart at [28,-14], is drawn over it, so his legs and feet appear on top of the mint body.",
   "evidence": "OUT/strip_beach_service.png and OUT/icecream_bell_crop.png (no visible bell or motion); frame-difference stats printed by strips.py ('icecream_cart bell [0.02, 0.02, 0.03, 0.03]'); OUT/pt_icecream_4x.png (vendor overlapping the cart).",
   "fix": "Re-render the bell anim with a brass hand bell hung on the handle or umbrella pole outside the canopy, swinging ±25° with a glint, and move fxPoints.bell there. Add the cone/scoop topper or a glass dipping-cabinet lid with colourful scoops. Set staffDepth to 'behind' (normal y-sorting hides his legs behind the counter), or move staffPoint to the handle end (≈[66,10], facing W) if 'front' is kept."
  },
  {
   "severity": "medium",
   "area": "water level convention (beach vs water set)",
   "problem": "The beach manifest says the sea surface is 0.55 m (waterPx 30) below the sand and that every water-plane anchor and boat goes on a point 30 px lower. water.md §6.6 and the Water.js lab say a sand beach polygon ends at the waterline with waterPx 0, so the sea is level with the sand. The 2.4 m sloped beach that reconciles the two exists only inside beach_preview.py (SLOPE_TOP / slope_dz), with no asset or rule the game can use. Integrators will either float rafts, boats and buoy lines 30 px (about 0.66 m) off their intended spot, or draw a cliff at the waterline.",
   "evidence": "assets/beach/manifest.json conventions.anchor + waterPx 30; docs/build_reports/water.md lines 164-165 and 510-513 ('the sand polygon ends at the waterline itself (waterPx 0)'); tools/blender/beach_preview.py:34-39 and :442. My phone scene uses the beach convention on the Water.js sea: OUT/phone_z10.png, OUT/phone_z12.png.",
   "fix": "Agree one rule with the water owner and write it in both manifests. Recommended: on sand beaches water-plane anchors use waterPx 0 (the sand plane continued); waterPx 30 applies only next to quays, piers or breakwaters. If the drop is wanted, ship a `ground_sand_slope_x/_y` strip plus a documented z-offset formula (slope width and drop in px) and the matching Water.js mask entry."
  },
  {
   "severity": "medium",
   "area": "house style: tonal range / contour",
   "problem": "The beach props are rendered high-key with almost no dark accents or contour shading compared with the harbour, town and village props. Pastel props (ice-cream cart, surfboards, driftwood, sun lounger, rescue board, shower) lose their silhouette on the bright sand at 0.6x and look more 'plastic placeholder' than chunky toy.",
   "evidence": "OUT/outline.py results: mean edge/inner luminance ratio is 1.02 for beach (edges as bright as the interior) against 0.93 harbour, 0.88 town and 0.96 props. Tonal spread (p90−p10 of value) is 0.31 for beach against 0.53 harbour, 0.52 town and 0.54 props. Darkest-5% value is 0.61–0.72 on parasol_red, icecream_cart, surfboard_rack and driftwood, against 0.26–0.45 on harbour and town props. Side by side at 4x: OUT/outline_compare_4x.png. At 0.6x: OUT/phone_z06.png and OUT/z06_crop_items.png.",
   "fix": "Re-render with the same AO and contour settings harbor_render uses, darken secondary materials one step (warm grey or teak frames instead of pure white, darker poles and wheels, one step more saturation on the mint cart), and drop exposure about 0.2 EV on the pastel props. Target tonal spread ≥0.45 and darkest-5% ≤0.45 like the harbour."
  },
  {
   "severity": "medium",
   "area": "palm_tree_a / palm_tree_b",
   "problem": "The crowns are flat, serrated paper-cutout fronds around a brown disc, with no coconuts and no drooping pinnate leaflets, so they read more like agave than coconut palm. The 4-frame, 4 fps sway re-shapes individual fronds between frames (fronds appear and disappear at the top) instead of swinging them, so the loop will pop at 250 ms per frame.",
   "evidence": "OUT/palm_crowns.png (idle + 4 sway frames; compare frame 2 and frame 4); OUT/strip_beach_nature.png; per-step differences 4.2–6.3 (strips.py) against about 2.3 for the smooth parasol flutter.",
   "fix": "Model drooping pinnate fronds (leaflets with a midrib), add a cluster of 3–4 glossy coconuts under the crown, and render the sway as 8 frames at 8 fps with ≤2–3 px tip motion per step, where the same fronds rotate rather than being re-simulated."
  },
  {
   "severity": "medium",
   "area": "ground textures ground_sand / ground_sand_wet",
   "problem": "The 512 px ground_sand repeats a visible camouflage-like blotch pattern (four tiles across a 0.6x phone screen) and carries dark pepper grains that look like dirt at 1.0–1.2x. ground_sand_wet's white glint dashes form an obvious diagonal grid when tiled. Seams are clean (difference across the seam equals the interior difference).",
   "evidence": "OUT/tile_ground_sand_4x3_0.6.png, OUT/tile_ground_sand_wet_4x3_0.6.png, OUT/z10_wetedge.png (pepper grain). Seam check: sand seam 5.05 against interior 5.12, wet 1.47 against 1.31.",
   "fix": "Lower the blotch contrast by about 50% and break the repeat with 2–3 large soft variation decals (`decal_sand_patch_a/b`, 384–512 px). Cap dark grains at about 8% darker than base and halve their count. Randomise and halve the wet glints, and make them short soft highlights rather than dashes."
  },
  {
   "severity": "medium",
   "area": "sandcastle_* readability",
   "problem": "The castles are sand-coloured on sand (median colour difference ΔE 17–20; sandcastle_build_0 12.5). They vanish at 0.6–1.0x; only the red bucket shows. Stage 0 reads as a turtle-shaped lump. The castle the kids build, and the contest mission built on it, needs to pop.",
   "evidence": "ΔE measurements from the session (sandcastle_s 20.1, _m 16.9, _l 18.3, build_0 12.5). OUT/small_props_2x.png, OUT/phone_z06.png (castle invisible next to the kids), OUT/phone_z10_crop_mid.png.",
   "fix": "Render castles in damp, darker and warmer sand (−15% value) with crisp tower crenellations, coloured shell and sea-glass inlays, a small flag on every stage, a moat ring with water and stronger contact AO. Make stage 0 a readable bucket-shaped mound plus a dug hole."
  },
  {
   "severity": "medium",
   "area": "beach_sign_arrow / _board / _notice",
   "problem": "All three signs are blank boards. Every harbour and town sign carries a pictogram (fish, ship, anchor), so blank beach signs read as placeholders, and they depend on in-game text rendering the game does not do for props today.",
   "evidence": "OUT/small_props_2x.png (first three items); docs/previews/harbor_scene.png (round pictogram signs).",
   "fix": "Keep the blank versions for text and add pictogram variants rendered into the board: swim zone, ice cream, lifeguard cross, rental (ring + parasol), shower/WC, and a sun-motif '햇살 해변' plate."
  },
  {
   "severity": "low",
   "area": "crab directions",
   "problem": "The atlas holds 5 'rendered' directions, but S is pixel-identical to E (all idle and walk frames) and N is identical to NE (all idle frames, 4 of 6 walk frames). The report's '5 directions + mirrors' is overstated. A crab walking S shows the front view and appears to walk forward, not scuttle. At 0.5 m across it is about a third of the chief's height and looks dog-sized next to kids at 1.0x.",
   "evidence": "Frame-equality check in the session ('idle S E pixel-equal [True×4]', 'walk S E [True×6]', 'walk NE N [F,F,T,T,T,T]'); OUT/cstrip_crab.png; OUT/boats.png (crab next to the chief); OUT/z10_wetedge.png.",
   "fix": "Either render true side-profile S/N frames, or drop S/N and map them through `nearest` (fewer frames, honest manifest). Consider 0.35 m across."
  },
  {
   "severity": "low",
   "area": "corn_stand / rental_stand customer spacing",
   "problem": "corn_stand customerPoints are 0.40 m apart (rental_stand 0.51 m), while a character's footprint is about 0.7 m (shadow ellipse 46 px). Three customers pile into one blob at the counter corner.",
   "evidence": "Spacing computed in the session (corn_stand [0.4, 0.4] m, rental [0.51] m, icecream [0.71, 0.70] m); OUT/pt_row1a.png (three kids overlapping at the corn stand).",
   "fix": "Space corn and rental customers about 0.65 m apart (≈(28,14) px steps along the counter), or queue them away from the counter along −Y like the ice-cream cart."
  },
  {
   "severity": "low",
   "area": "corn_stand grill anim",
   "problem": "The 'grill with smoke' is a single white cotton-ball puff trapped under the awning, hidden by the valance. The animation is imperceptible at phone zoom (mean frame difference 0.35–0.49).",
   "evidence": "OUT/corn_smoke.png; OUT/strip_beach_service.png.",
   "fix": "Render 2–3 translucent rising wisps that clear the awning's front edge, plus brighter ember flicker, or document that the game spawns an existing fx smoke sheet at fxPoints.smoke and drop the baked puff."
  },
  {
   "severity": "low",
   "area": "swim_buoy_line_end",
   "problem": "The end buoy is a yellow dome on a square red collar, which reads like a hamburger or rice cooker. The flag is a grey edge-on needle. Frame 3 pops a much bigger foam disc (differences 5.07/5.07/5.91/5.91, alternating).",
   "evidence": "OUT/strip_beach_water.png, OUT/tiles_buoy_f1.png.",
   "fix": "Use a round collar (or a classic cone/spar marker) and an orange triangular pennant turned 3/4 to camera, and even out the foam pulse across the 4 frames."
  },
  {
   "severity": "low",
   "area": "boardwalk_end_* / swan wings / snow-edge kit (polish)",
   "problem": "(a) Boardwalk end rope posts have rope stubs that dangle into the air with no second post. (b) The swan pedal boat's wings read as a pile of white pebbles or bubble wrap, and the all-white body has little form shading. (c) The sand-snow edge shows regular, repeating saw-teeth.",
   "evidence": "OUT/tiles_boardwalk_2x.png (rope stubs at both ends); OUT/cstrip_swan_pedal_boat.png and OUT/boats.png; OUT/z12_snowedge.png.",
   "fix": "(a) Run the rope between the two end posts. (b) Sculpt layered feather rows with soft grey AO and a thin pink or blue trim line. (c) Add 2–3 more edge variants with irregular lobes and vary the tooth phase per variant."
  },
  {
   "severity": "low",
   "area": "invisible decals",
   "problem": "decal_sand_ripples (median ΔE 1.9 against the sand, 91% of pixels below ΔE 10) and decal_footprints_sand (ΔE 5.8) cannot be seen at any phone zoom, so they are wasted atlas space.",
   "evidence": "ΔE measurements from the session; docs/previews/beach_ground.png (bottom row); OUT/phone_z10.png (footprints placed at P(5.5,2.8), not visible).",
   "fix": "Increase contrast: footprints as damp, darker pressed prints with light rims (ΔE ≥12); ripples as soft shadow/highlight bands (ΔE ≥8), still subtle."
  },
  {
   "severity": "low",
   "area": "beach_swing / sun_lounger recline vs flat sunbathe pose",
   "problem": "(a) beach_swing has seatPoints but no swing animation, so a seated kid can never swing. (b) The lounger backrest is raised 38°, but beachfolk `sunbathe` is a flat lying pose (lieHeightM 0.13). The head point is about 15 px above where a flat body's head lands, so the upper body floats in front of the backrest.",
   "evidence": "manifest beach_swing has no anims; sun_lounger backrestDeg 38, lyingHeadPoints [27,-56] against a flat-body estimate of about [31,-41]; OUT/pt_lounger_4x.png.",
   "fix": "(a) Add anims.swing (6 frames) with per-frame seat offsets (`seatPointsFrames`). (b) Provide a flat-backrest `sun_lounger_flat` frame for occupied loungers, or ask beachfolk for a `recline` pose matched to 38°."
  },
  {
   "severity": "low",
   "area": "docs / preview consistency",
   "problem": "Several docs do not match the delivered art. The icecream_cart notes describe a giant cone topper that is not rendered. The beach_shower notes say 'showerPoints' but the field is standPoints. The report calls the crab '5 rendered directions'. The report says to flip fx_shore_wave_x by 180°, which shows the breaking face toward the camera although that face looks shoreward, away from the viewer. beach_scene.png still shows winter-clothed townsfolk sunbathing; don't show it to the designer.",
   "evidence": "manifest icecream_cart.notes, beach_shower.notes; docs/build_reports/beach.md 'Characters-style atlases' and items 4 and 'Known issues'; docs/previews/beach_scene.png.",
   "fix": "Correct the notes and report text. Ask the water owner for an `fx_shore_wave_x_near` variant for seas on the −Y side instead of the 180° flip. Re-run `beach_pack.py --previews-only` once beachfolk lands, before the designer sees the previews."
  }
 ],
 "keep": [
  "Parasols (6 colourways): sagging canvas panels, scalloped valance with tassel fringe, smooth 4-frame flutter (uniform per-frame difference 2.1–2.6, clean loop); shadePoint matches the baked shadow centre.",
  "lifeguard_tower + lifeguard_tower_front overlay + staffPoint: a guard at the rail reads clearly and is correctly occluded (OUT/pt_row1a.png, OUT/phone_z10_crop_mid.png); ladderPoint and lookPoint are correct. Platform height and overall 4–5 m scale sit right against the 1.45 m chief.",
  "changing_booth: candy stripes, heart door, peaked roof; doorPoint [-48,24] is exactly 0.5 m in front of the −Y face midpoint.",
  "Boardwalk x/y chains with end pieces and swim_buoy_line_x/_y chains join seamlessly, baked shadows included (OUT/tiles_boardwalk_2x.png, OUT/tiles_buoy_f1.png); the synchronised bob wave travels along the line.",
  "Boat system: seats, seatsStand back-view anchors, seatDrawOrder and over_ overlays work in all 8 headings including mirrors (OUT/boats.png); the swan S overlay correctly brings the neck in front of riders; towPoint, bowPoint and wakePoint land on the hull ends.",
  "banana_boat_crew and kayak_crew: lively, cheerful baked riders in buoyancy vests; strong silhouettes at 0.6x on the shader sea.",
  "float_raft (barrels, ladder, life ring, pennant; deck playPoints land on the deck) and the buoy line both read well on the Water.js tropical sea.",
  "Crab character design (glossy coral shell, googly eyes, ink outline) and swim_ring_duck / swim_ring_donut / beach_ball: cute and readable as colour accents.",
  "beach_ball_bounce physics: the shadow offset grows with height and the ball keeps its x, consistent with the house light.",
  "picnic_table_beach with its integrated parasol, rental_stand and corn_stand art (the problems are only points, smoke and spacing).",
  "Sand-snow transition kit: rules are implementable and seams are clean; the soft snow lip with pellets reads as a natural snow bank (only add variety to the teeth).",
  "Shadow direction and alpha match bl_common and the harbour (mean shadow alpha about 88 against 89); scale against the chief is consistent across the set.",
  "Technical packaging: all atlases ≤2048 px, payload 1.91 MB, palette PNGs like the harbour set, deterministic pack, beach_check and the Phaser load green, `--previews-only` mode leaves assets untouched."
 ]
}

## polish

# beach build report (after the polish pass)

The polish pass fixed every high- and medium-severity critic issue that reproduced, except tonal range (#8), which is only partly fixed. The cheap low-severity issues are fixed too.
- **Checks:** `beach_check.py` reports 0 errors and 0 warnings (117 sprites, 6 characters, 419 frame names). `check_beach_ground.py` reports 0 errors and 0 warnings (56 ground keys; the worst dry ↔ wet seam excess is 13, limit 20).
- **Payload:** 2.33 MB (limit 6 MB).
- **Phaser load:** the headless Phaser 3.90 load (`tools/test/beach_phaser.mjs`) finished with no errors and no 404s. It checked 117 sprites, 6 characters, 92 anims and 475 frames; none were missing and 57 anims were playing.
- **Phone check:** a run at 390 × 844, DPR 3, with the live Water.js shader at zoom 0.6, 1.0 and 1.2 showed no errors.

`assets/beach/` (Sunny Beach, 햇살 해변, CONTRACT_V7 §W) holds 117 sprite keys:
- 61 prop keys in 6 atlases, 2 of them aliases;
- 54 ground decals and transition pieces in 1 atlas;
- 2 seamless sand textures.

It also has 6 characters-style atlases (the boats and the crab).

**Style:** the village's soft toy-like 3D chibi look, PPU 64, 2:1 iso, the shared `bl_common` camera and light, Cycles with denoising. Baked soft cool shadows fall to screen down-right and are lighter on the water plane. Materials are woven canvas with darker seam piping, glossy vinyl, oiled teak, painted wood and damp packed sand.

## What the polish pass changed
- **People points now play correctly:**
  - Sunbathers get `lyingFeetDirs`, because beachfolk `sunbathe` is played by the direction the feet point.
  - Sandcastle diggers kneel on the far side facing SE / SW / S, where `dig` has frames, so the castle stays in front of them.
  - Lounger seats are on the cushion edge on the camera side, at 0.45 m.
  - The picnic table's near bench faces the sea, so there are no NE sitters.
  - The ice-cream vendor stands behind the cart (`staffDepth` "behind").
  - Every seat has `seatGroundPoints` and `seatHeightM`.
  - `beach_check` now rejects any direction that has no frames.
- **Dry ↔ wet sand kit:** 20 new pieces (`ground_sand_wet_edge_*`, `_corner_*`, `_inner_*`) with the same placement rules as the snow kit (`manifest.wetKit`). The wet band now has a wavy edge, a ragged damp ramp and a soft line of dried foam. `ground_sand_wet` uses the Water.js wet-sand colour.
- **One sea level:** on the sand beach the sea is level with the sand (`waterPx` 0, plus `waterPxByShore`). This is the same rule as `assets/water` (water.md §6.6) and `assets/beachfolk`.
- **Tonal range:** darker secondary materials and lower exposure (−0.2 EV, −0.3 on the pastel props).
- **Re-modelled props:**
  - **Coconut palms:** pinnate fronds with a bare base stalk, spear fronds, a dried frond, a coconut cluster seen through a gap in the fronds kept toward the camera, and an 8-frame rigid sway at 8 fps.
  - **Ice-cream cart:** a giant three-scoop cone on the roof, a brass bell that really swings with a glint and "ding" strokes, and rubber tyres.
  - **Sign boards:** decorated frames around a blank text area. The notice board's face used to sit inside its frame.
- **Ground:** `ground_sand` no longer has repeating blotches or dark pepper grains. `ground_sand_wet` no longer has the dash grid. `decal_footprints_sand` and `decal_sand_ripples` are stronger.
- **Scene preview:** the arrow sign and the notice board moved to open spots (the notice board now stands at the top of the boardwalk entrance), and the kite flies to the right so it no longer covers them.
- **Checks:** `beach_check` now also catches dead anims and frames of different sizes within one key.

## Keys
**Ground** (procedural, made by `gen_beach_ground.py`)
- `ground_sand` and `ground_sand_wet`: 512² seamless textures in `images[]`.
- Sand ↔ snow kit, rules in `sandKit`:
  - `ground_sand_snow_edge_x`, `_x_near`, `_y`, `_y_near`, 3 variants each;
  - `ground_sand_snow_corner_n/e/s/w`;
  - `ground_sand_snow_inner_n/e/s/w`.
- **New** dry ↔ wet kit, rules in `wetKit` (the `sandKit` rules with WET read as SNOW):
  - `ground_sand_wet_edge_x`, `_x_near`, `_y`, `_y_near`, 3 variants each;
  - `ground_sand_wet_corner_n/e/s/w`;
  - `ground_sand_wet_inner_n/e/s/w`.
- Decals:
  - `decal_footprints_sand`, `decal_shells`, `decal_seaweed`, `decal_sand_ripples`;
  - `decal_volleyball_court` (+ `_x`, with `cornerPoints`);
  - `decal_towel_red/blue/yellow/green` (+ `_x`), with `lyingPoints`, `lyingFeetPoints`, `lyingFeetDirs`, `lyingHeadPoints`, `lyingDirs` and `lyingAxis`.

**Shade and rest** (`beach_shade`)
- 6 parasols: `parasol_red`, `parasol_blue`, `parasol_yellow`, `parasol_green`, `parasol_pink`, `parasol_rainbow`. Each has a `flutter` anim (4 frames at 6 fps), `shadePoint` and `shadeRadiusM`.
- `sun_lounger` and `sun_lounger_x`:
  - `lyingPoints`, `lyingFeetPoints`, `lyingFeetDirs` (SW / SE);
  - `seatPoints` on the cushion edge facing SE / SW;
  - `seatGroundPoints`, `seatHeightM` 0.45, `seatDepth` "front".
- `beach_chair_folding` (+ `_x`), `beach_swing` (2 seats).
- `picnic_table_beach`: 4 seats, `seatDepths`, `seatHeightM` 0.46.

**Play** (`beach_play`)
- `beach_ball` (item) and `beach_ball_bounce` (9 frames).
- `swim_ring_red`, `swim_ring_duck`, `swim_ring_donut`.
- `bucket_spade`: `playPoints` behind the toys, facing SE, `playAnim` "dig".
- `kite`: `fly` anim, `stringPoint`, `flyHeightM`.
- `sandcastle_s`, `sandcastle_m`, `sandcastle_l`.
- `sandcastle_build_0..3`: 4 build stages; `sandcastle_build` is an alias of stage 0. Work points face SE / SW / S on the far side, `workDepth` "behind".
- `volleyball_net` (+ `_y`): `playPoints`, `playDirs`, `ballDirs`, `netAxis`.
- `surfboard_rack`.

**Service** (`beach_service`)
- `lifeguard_tower`:
  - `staffPoints` (the guard at the rail);
  - `seatPoints` plus `seatGroundPoints` on the platform;
  - `lookDir` SW, `lookPoint`, `ladderPoint`, `fxPoints.flag` / `whistle`;
  - an occluder overlay, `lifeguard_tower_front`.
- `rescue_board`, `rescue_buoy_stand`.
- `beach_shower`: `water` anim, `standPoints`.
- `changing_booth`: `doorPoint`, `doorDir`.
- `icecream_cart`: `bell` anim (4 frames at 8 fps), `bellFrames` [1, 3], `staffDepth` "behind", `customerPoints`, `fxPoints.bell` / `sign`.
- `corn_stand` and `rental_stand`: both `staffDepth` "behind".
- Signs: `beach_sign_arrow`, `beach_sign_board`, `beach_sign_notice`. The text area is blank and `fxPoints.board` marks its centre.

**Nature** (`beach_nature`)
- `palm_tree_a`, `palm_tree_b`: `sway` anim (8 frames at 8 fps), `fxPoints.crown`.
- `beach_pine`, `dune_grass_a/b/c`, `starfish`.
- `driftwood`: a seat at 0.36 m.

**On the water** (`beach_water`)
- `swim_buoy_line_x` / `_y` / `_end`.
- `float_raft`.

**Boardwalk tiles** (`beach_tiles`)
- `boardwalk_x`, `boardwalk_y`.
- Closed ends `boardwalk_end_xp`, `_xn`, `_yp`, `_yn`; `boardwalk_end` is an alias of `boardwalk_end_yn`.

**Characters-style atlases** (unchanged in this pass)

| key | kind | render dirs (mirrors) | anims |
|---|---|---|---|
| `swan_pedal_boat` | ship | S, SE, NE (SW←SE, NW←NE; E/W/N via nearest) | idle 2 f, move 4 f |
| `kayak`, `kayak_crew` | ship | same | idle 2 f, move 4 f |
| `banana_boat`, `banana_boat_crew` | ship | same | idle 2 f, move 4 f |
| `crab` | animal | S, SE, E, NE, N (SW←SE, W←E, NW←NE) | idle 4 f, walk 6 f |

## Fields
All points are pixel offsets `[dx, dy]` from the anchor, with height included.

**People spots**
- `staffPoints` / `staffDirs` / `staffDepth`.
- `customerPoints` / `customerDirs`.
- `seatPoints` / `seatDirs`: the `sit` anchor is the seat's front-centre at seat height.
- `seatGroundPoints`, `seatHeightM`, `seatDepth` / `seatDepths`.
- `lyingPoints` (hips), `lyingFeetPoints`, `lyingFeetDirs` (= the `sunbathe` dir), `lyingHeadPoints`, `lyingDirs` (hips → head, reference only).
- `workPoints` / `workDirs` / `workDepth`.
- `playPoints` / `playDirs` / `playDepth` / `playAnim`.
- `ballDirs`, `standPoints`, `doorPoint`, `ladderPoint`, `lookPoint` / `lookDir`.

**Every `*Dirs` value has frames** in the anim played there, or in its mirror; `beach_check` enforces this.
- `sit`: S / SE / E (+ SW / W).
- `sunbathe`: SE / NE (+ SW / NW).
- `dig`, `ball_throw`, `ball_catch`: S / SE / E (+ SW / W).

**Other fields**
- **Water:** `waterPlane`, `waterline` "anchor", `waterPx` 0, `waterPxByShore` {sand 0, quay / pier / breakwater 30}.
- **Tiles:** `tileAxis`, `segM`, `stepPx`, `cuts`, `rampM`, `openEnds`, `tileLayer`.
- **Anims:** every named loop is also listed as `anims.work`. All frames of a key share `frameSize` and `anchor`.

## How the game should use them
1. **Load:** add `'beach'` to `FRAGMENTS` (or `LAZY_FRAGMENTS`) in `src/core/Assets.js`, and register the overlay frames.
2. **Ground layering**, bottom to top:
   1. snow;
   2. `ground_sand` on sand cells;
   3. `ground_sand_wet` on the wet cells;
   4. the `ground_sand_wet_*` kit on dry / wet borders, placed by `wetKit` (on this beach the shore band uses `edge_x_near`);
   5. the `ground_sand_snow_*` kit, placed by `sandKit`;
   6. the decals;
   7. the depth-sorted sprites.
3. **Sea level:** `waterPx` 0 on sand. Put water-plane anchors on the sea point itself, and pass Water.js `{poly, waterPx: 0}`. Use 30 only beside a quay, pier or breakwater.
4. **Sea look:** draw the sea with Water.js (palette `tropical`, shore `sand`). Without the shader, use `fx_shore_wave_x` turned 180° (`setFlip(true, true)`).
5. **Tiles:** chain at `stepPx`, and play all buoy-line tiles' `bob` on the same frame index.
6. **Lifeguard tower:** tower at depth d, guard at d + 0.5, `lifeguard_tower_front` at d + 1.
7. **Sunbathers:** play `sunbathe` with `dir = lyingFeetDirs[i]` at `lyingPoints[i]`.
8. **Sitting:** play `sit` facing `seatDirs[i]` at `seatPoints[i]`, with the shadow at `seatGroundPoints[i]`. `seatDepth(s)` "front" means just above the prop; "behind" means normal y-sort.
9. **Sandcastles:** kids `dig` at `workPoints` / `workDirs` while you swap `sandcastle_build_0` → `_3`. For `bucket_spade`, one kid digs at `playPoints[0]`.
10. **Volleyball:** players stand at `playPoints` and play `ball_throw` / `ball_catch` with `ballDirs[i]`.
11. **Ice-cream cart:** the vendor stands at `staffPoint` behind the cart. Play `sfx_icecream_bell` on `bellFrames` 1 and 3.
12. **Boats:** draw the boat, then the riders in `seatDrawOrder`, then the `over_` frame. Draw the wake at `wakePoint`. The tow rope ends at `towPoint`.
13. **Crab:** `dir` is the movement direction. Draw a soft shadow ellipse [34, 14] under it.
14. **Do not flip** baked-shadow sprites; use the `_x` / `_y` variants instead.

## Paths and rebuild
```
python3 tools/fx/gen_beach_ground.py
/tmp/bvenv/bin/python tools/blender/beach_render.py -- [keys] [--force]   (cache /tmp/fv_cache/beach)
python3 tools/blender/beach_pack.py            (or --previews-only)
python3 tools/blender/beach_check.py
python3 tools/fx/check_beach_ground.py
node tools/test/beach_phaser.mjs
```

## Payload
2.33 MB of 6 MB.
- `beach_nature` 573 KB (the 8-frame palms).
- `beach_shade` 246 KB.
- `beach_service` 142 KB.
- The rest of the atlases are each under 200 KB.

## Previews (`/home/user/nurient/frost-village/docs/previews/`)
- `beach_all.png`
- `beach_scene.png`: people from beachfolk.
- `beach_ground.png`
- `beach_phaser.png`
- GIFs: `beach_parasols`, `beach_palms`, `beach_service`, `beach_play`, `beach_sandcastle`, `beach_water_props`, `beach_swan`, `beach_kayak`, `beach_banana`, `beach_crab`.

I looked at all of the stills, plus phone captures at 0.6, 1.0 and 1.2 zoom:
- the coconuts read at 1x;
- the vendor stands behind the cart;
- kids dig behind the castles;
- the arrow sign and notice board are in clear view;
- the wet band blends softly into the dry sand.

## Known issues
- **Drawn by the game:** the crab shadow, kite string, tow rope, boat wakes and sign text.
- **Boat headings:** boats have 3 rendered headings (S, SE, NE + mirrors); E / W / N use the nearest one.
- **No `_snow` variants.**
- **Scene sea is still:** the sea in `beach_scene.png` imitates Water.js but does not move. `fx_shore_wave_x` must be turned 180° on this beach.
- **Tonal range only partly at target:**
  - Dark-framed props reach the critic's target: loungers have spread 0.51 / 0.46 and darkest 5 % at 0.44.
  - The white-striped canopies stay light: parasols spread 0.23–0.42, darkest 5 % 0.49–0.58; the cart 0.39 / 0.51.
  - Pushing them darker made the canvas look dirty at phone zoom.
- **Volleyball:** near-side players turn side-on, because ball frames do not exist facing away from the camera.
- **Picnic table:** near-bench sitters face the sea with their backs to the table, because `sit` has no N / NE frames.
- **Wet patches:** wet patches only 1–2 cells wide read as soft rounded rectangles.
- **Palms must not be flipped:** the coconut gap faces the camera.
- **Beachfolk owner not messaged** (messaging is not allowed in this workflow). Beachfolk's manifest already uses the same feet-direction and sea-level-0 rules. If its polish pass changes `sunbathe`, `lyingFeetDirs` must follow.

## Critic issues

| # | sev | issue | status | what was done |
|---|---|---|---|---|
| 1 | high | `lyingDirs` contradicts `sunbathe` | fixed | New `lyingFeetPoints` / `lyingFeetDirs` on the loungers and all 8 towels; checked against geometry and frames. |
| 2 | high | work dirs NE / N have no `dig` frames; diggers hide the castles | fixed | Far-side work points facing SE / SW / S, `workDepth` "behind"; `bucket_spade` play point moved behind the toys. |
| 3 | high | hard brown wet strip, no dry → wet transition | fixed | 20-piece dry ↔ wet kit + `wetKit`; Water.js wet colour; seam excess ≤ 13. |
| 4 | medium | lounger seats too low; `_x` seat on the far rail facing NE | fixed (partly reproduced) | The seat was at 0.37 m, not 0.45 m; the `_x` seat really was wrong. Now on the cushion edge at 0.45 m facing SE / SW, with `seatGroundPoints`; the check measures seat height. |
| 5 | medium | picnic NE seats have no frames | fixed | Near bench faces SW, far bench SW / SE; `seatDepths`. |
| 6 | medium | cart bell does nothing, no cone, vendor drawn over the cart | fixed | Bell swings ±25° with glint and "ding" strokes (step diff 0.45–0.73, was 0.02); giant cone; vendor behind; the check catches dead anims. |
| 7 | medium | `waterPx` 30 vs 0 | fixed | `waterPx` 0 + `waterPxByShore`; the check enforces it. |
| 8 | medium | tonal range | partly fixed | Loungers 0.51 / 0.44 (were 0.29 / 0.62); cart 0.39 / 0.51 (were 0.25 / 0.70); parasols 0.23–0.42 / 0.49–0.58 (were 0.20–0.37 / 0.58–0.73). Canvas canopies kept lighter on purpose. |
| 9 | medium | paper-cutout fronds, no coconuts, popping sway | fixed | Pinnate fronds, visible coconut cluster, 8-frame sway (step diffs 1.6–3.0, were 3.2–4.3). |
| 10 | medium | sand blotches and pepper; wet dash grid | fixed | Both textures redone. |
| low | low | blank signs | fixed (text area stays blank by design) | Decorated frames; the notice-board face bug is fixed. |
| low | low | invisible footprint / ripple decals | fixed | Larger and darker. |
| low | low | castles blend into the sand | fixed | Damper, darker castle sand; darkest 5 % 0.65 → 0.55 (`_l`), 0.69 → 0.59 (`_m`), 0.68 → 0.60 (`_s`). |
| low | low | truncated item ("Lower the b…") | not reproduced | Its text was cut off in the review, so it could not be identified. |

Files are in /home/user/nurient/frost-village:
- assets/beach/
- docs/build_reports/beach.md
- docs/previews/beach_*
- tools/blender/beach_*.py
- tools/fx/gen_beach_ground.py
- tools/fx/check_beach_ground.py
- tools/test/beach_phaser.mjs
