# beach_bld — 비평·다듬기 기록

## critique

{
 "verdict": "polish",
 "summary": "I tested beach_bld the way the game really draws it: a Phaser 3.90 page with the game's View setup (720 logical px wide, View.k = 1.1, phone screen 390x844 at DPR 2), at zooms 0.6, 1.0, 1.2 and 1.7. It sat beside harbour (sailor_lodge, seafood_restaurant), town (cafe, apartment_a, town_gate) and buildings (shop_general) pieces and the chief. Staff, guests, customers, seated, lying and swimming people were real beachfolk dolls, drawn exactly as the manifest says. I also drew a debug overlay of every point, footprintPoly, lightPoints radius and waterPoly.\n\n**The art itself is mostly good.** It matches the house style (same light, shadows and materials as the harbour and town sets). The hotel reads as the landmark, the shop roof props are charming, the _x points are rotated correctly, and all staffPresets resolve.\n\n**The weak part is everything around the art.** Three of the builder's claims are wrong:\n1. **Pool water (main path):** the main pool-water path (Water.js on waterPoly at d+0.25) covers the deck in a blocky opaque patch. It was never tested.\n2. **Night:** the night recipe does not fit the game's DayClock night. The hotel night frame turns into a dark hole.\n3. **Phone preview:** bbld_phone.png shows everything 1.85x larger than a real phone does.\n\n**Medium problems:**\n- Balcony guests' hats poke into the balcony above.\n- The lying-direction convention conflicts with the beachfolk sunbathe animation, so heads land on the wrong end of the loungers.\n- Outdoor staff are drawn at depth d+0.5, so people walking behind them draw over them.\n- The doorman stands inside a canopy column.\n- The BBQ smoke is an opaque white blob.\n- Several shops, and the pool, are dark at night.\n- The aquarium tank is milky.\n- Night-only and _x sprites are not in lazily loaded atlases.\n\nEvidence root: SCR=/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v7_beach_bld_critic. Page: SCR/page.js. Runner: SCR/run.mjs (node SCR/run.mjs [--qs '?water=0'] [--out DIR] [--only REGEX]). Screenshots are in SCR/shots (Water.js pool) and SCR/shots_fallback (fallback water); crops are in SCR/crops.",
 "issues": [
  {
   "severity": "high",
   "area": "hotel_pool / Water.js integration (contract X: waterPoly so the Water module can draw it)",
   "problem": "Following the manifest recipe (Water.js with mask {water:[waterPoly]}, palette 'pool', shore 'quay', depth d+0.25) paints an opaque, stair-stepped turquoise block well outside the pool rim. It covers the deck, loungers, ladder and the near coping. The Water.js body shader writes alpha 1.0 everywhere in its mesh (Water.js:489, gl_FragColor = vec4(col, 1.0)) and builds the mesh from coarse cells. It relies on land being drawn OVER the water, the opposite of drawing water at d+0.25 over the pool sprite. The builder's test (beach_bld_phaser.mjs) only plays the hotel_pool_water fallback, so the main path was never run.",
   "evidence": "SCR/shots/pool_z17.png, SCR/shots/hotel_z06.png and SCR/shots/shops2_z10_dbg.png (blocky water over the deck). Same view with the fallback: SCR/shots_fallback/pool_z17.png. Water.js lines 1790-1833 (mesh) and 489 (alpha 1). The Water object built fine (isShader true, buildMs 118, bodyVerts 36), so this is a recipe failure, not a load error.",
   "fix": "Pick a working path, then document and test it: (a) ship hotel_pool_deck (pool sprite with the water surface cut to transparent) plus hotel_pool_floor (basin floor and mosaic) and draw floor < Water.js body < deck, i.e. land over water, the way the sea works; or (b) ask the Water.js owner for opts.clipPoly (discard outside the polygon) and keep d+0.25. Also give waterPoly flattened to world px with waterPx 0, update conventions.pool, and add a Water.js pool case to tools/test/beach_bld_phaser.mjs. Until then the manifest should say the fallback is the only supported path."
  },
  {
   "severity": "high",
   "area": "Night variant vs the game's DayClock",
   "problem": "The manifest says to multiply-tint every sprite with #6B7AB8, add <key>_glow at d+0.3, and draw resort_hotel_night untinted. The game's night (src/systems/DayClock.js) is different: one full-screen MULTIPLY overlay at DEPTH.FX-30 with 0x5a6aa8 at darkness 0.45 (about x0.71/0.74/0.85), plus pooled ADD glows at FX-29. The pre-darkened hotel night frame gets that overlay on top, so the hotel ends up at luminance 0.30 while its neighbours sit at 0.57. Glows at d+0.3 sit under the overlay and lose about 30%. The night frame is also redundant: resort_hotel_night is almost exactly day x tint + glow (mean abs diff 0.0099). Yet it costs the whole bbld_hotel_2 sheet: 1624x840, 5.5 MB GPU, 280 KB payload, and it is not lazy.",
   "evidence": "SCR/crops/night_models.png, panels: bbld recipe / game DayClock with glow / night frame + overlay / town apartment in game night. DayClock.js lines 53-69 and 97-117; balance.js line 339 (darkness 0.45). Measured hotel luminance: 0.419 / 0.565 / 0.302.",
   "fix": "Rewrite the night conventions for DayClock: no per-sprite tint, drop resort_hotel_night and resort_hotel_x_night (or at least list bbld_hotel_2 in lazyAtlases), draw <key>_glow with ADD above the night overlay in a light layer (or at FX-29, culled per building), and re-tune glow strength for a 0.71 night. Feed lightPoints to DayClock.addLight(x, y, k) for warm ground pools, and regenerate bbld_night.png with the DayClock model."
  },
  {
   "severity": "high",
   "area": "Phone-zoom preview (bbld_phone.png) and readability claims",
   "problem": "phone_preview() crops 390/zoom world px across, as if 1 world px = zoom CSS px. The game shows 720 logical px across (View.W 720; camera zoom = z x View.k), so the real scale is 0.54z CSS px per world px. bbld_phone.png is therefore 1.85x too large. At real zoom 0.6 the hotel fills 46% of the screen width (the preview shows 85%), people are about 27 CSS px tall, and a counter clerk's face is about 8 CSS px. Every 'readable at phone zoom' judgement and staff-visibility fix was checked on that wrong preview.",
   "evidence": "SCR/crops/phone_scale_compare.png (left: builder 'zoom 0.6'; right: real game View at 0.6, same street). tools/blender/bbld_preview.py lines 796-806 (w, h = W / z, H / z). src/main.js and src/core/View.js (W 720, k).",
   "fix": "In phone_preview use w = 720/z and h = (720*844/390)/z (or crop 1.85x more world). Re-judge legibility at the real 0.6/0.9/1.2. At 0.6, consider larger roof medallions and stronger shop-identity colour blocks; staff faces behind counters only read from about 1.2x."
  },
  {
   "severity": "medium",
   "area": "resort_hotel(_x) balcony guests",
   "problem": "The hotel floor-to-floor step is 72 px (about 1.3 m; balconyPoints B0->B2->B4 at y -128/-208/-272 with ±17 px alternation). Beachfolk dolls are 81-96 px tall. Each guest's head and straw hat rises into the balcony above. The _front overlay holds only railings (no slabs), so the hat is drawn over the upper balcony's floor but under its railing bars, and looks like a hat lying on the next balcony.",
   "evidence": "SCR/crops/balc_left.png (stacked hats between the upper railings), SCR/shots/hotel_z17_entrance.png, SCR/shots_fallback/hotel_z12.png, SCR/crops/hotel_front_overlay.png (railings + desk only), SCR/shots/xrow_z10_dbg.png (same on resort_hotel_x).",
   "fix": "Seat balcony guests in the deck chairs already modelled (add balconyAnim 'sit' or balconySeatPoints; seat 0.45 m lowers the head by about 25 px). Or add each upper balcony's slab front and underside to the overlay so heads below are clipped, or only populate the top floor and the tower balconies."
  },
  {
   "severity": "medium",
   "area": "hotel_pool lyingPoints / lyingDirs convention",
   "problem": "The bbld manifest says lyingDirs is the HEAD direction (NE = loungers' backrests). The beachfolk sunbathe anim takes dir = where the FEET point (beachfolk manifest, sunbathe.dir). Passing lyingDirs straight to sunbathe, as any integrator would, puts every head on the flat foot end of the loungers. assets/beach also adds lyingHeadPoints, lyingFeetPoints and lyingAxis; beach_bld has none of them.",
   "evidence": "SCR/shots_fallback/pool_z17.png (white-haired heads at the low SW end of all 6 loungers). SCR/crops/pool_loungers.png (backrests at NE). Manifest conventions.pool says 'lyingDirs = loungers (seat surface, head direction)'.",
   "fix": "Add lyingFeetDirs (opposite of lyingDirs) or rename to lyingHeadDirs. Add lyingAxis, lyingHeadPoints and lyingFeetPoints like assets/beach, and state the sunbathe conversion in conventions. Also document that the lying anchor is the hip ON the lounger surface (lieHeightM)."
  },
  {
   "severity": "medium",
   "area": "staffDepth for outdoor staff",
   "problem": "Every building sets staffDepth 'front' (all staff at d+0.5). That includes staff standing in the open in front of the facade: the hotel doorman [-39,53] and bellhop [16,119], surf instructor, souvenir/swimwear clerks, arcade attendant, aquarium ticket seller, restroom housekeeper, pool lifeguard and lifeguard #2. Anyone walking behind them (y between d+0.5 and d+dy) is drawn on top. Example: the chief at doorPoint (dy 38) draws over the doorman (dy 53).",
   "evidence": "SCR/crops/entrance_depth.png (chief's coat over the doorman although the doorman stands nearer the camera). Manifest conventions.staff.",
   "fix": "Draw at d+0.5 only the staffBehindOverlay indices. Give the others normal y-sorting at their own y (or make staffDepth a per-point array) and update conventions and the Register.js note."
  },
  {
   "severity": "medium",
   "area": "resort_hotel doorman placement",
   "problem": "staffPoints[0] [-39,53] coincides with the canopy's front-right white column, so the doorman appears to stand inside the pillar with its base sticking out under his feet.",
   "evidence": "SCR/crops/entrance_depth.png, SCR/shots/hotel_z17_entrance.png.",
   "fix": "Move the doorman to about [-55,62] (carpet edge beside the door, clear of the column) and mirror it for resort_hotel_x. Re-check that customer queue 0 does not then overlap him."
  },
  {
   "severity": "medium",
   "area": "seafood_bbq art (smoke + chef)",
   "problem": "The grill smoke is baked into the building frames as an opaque white cotton-wool lump under the awning. It reads as a blob, not smoke. The chef (d+0.5) draws over it, so the smoke sits behind him, and in the 4-frame loop it jumps. The chef's face is mostly behind the front red lantern at real zoom.",
   "evidence": "SCR/crops/bbq_frames.png (4 frames), SCR/shots/civic_z17_bbq.png, SCR/shots_fallback/hotel_z12.png (white lump at the bottom).",
   "fix": "Remove the baked smoke from seafood_bbq_work_*; keep flames, embers and lantern sway. Emit translucent rising puffs from fxPoints.smoke with the existing FX smoke sheets (alpha 0.35-0.6) so they rise past the awning edge. Move the front lantern about 0.25 m right or up, or the chef about 0.3 m left, so the face clears."
  },
  {
   "severity": "medium",
   "area": "Night charm / glow coverage",
   "problem": "Key 'cute' shops are almost dark at night (glow > 0.35 in % of sprite): tourist_info 0.0% (glow sprite empty), beach_cafe 1.1%, icecream_shop 1.1%, restroom 1.0%. None of the roof medallion signs glow (iced coffee, cone, coconut, fish, shell, basket, 'i'). hotel_pool has no night field, no glow and no lightPoints at all; bbld_check explicitly exempts it. A resort night with dark kiosks and an unlit pool undersells the beach.",
   "evidence": "SCR/shots/night_civic_z10.png, SCR/crops/glow_check.png, the glow coverage measurement, tools/blender/bbld_check.py NO_COMMON 'hotel_pool': ['lightPoints','night'].",
   "fix": "Make the roof medallions emissive (backlit) in the glow pass. Light the cafe service window, the ice-cream interior and the tourist kiosk window. Add underwater pool lights (a hotel_pool_glow following waterPoly, two deck lamps) plus night and lightPoints for hotel_pool, and remove the check exemption."
  },
  {
   "severity": "medium",
   "area": "mini_aquarium tank",
   "problem": "The hero feature of the aquarium is still milky: pale cyan water, white glare stripes, low-saturation fish that read as smudges at 1.0x. Only 4 frames at 5 fps make the two schools jump across the tank.",
   "evidence": "SCR/crops/aq_frames.png (frames 0-3), SCR/shots/shops1_z10_dbg.png.",
   "fix": "Deep blue water inside the tank (value about 0.35-0.5), a darker back wall, saturated fish with strong value contrast, fewer and thinner glare streaks. Use 8 frames, or slower drift with smaller per-frame steps, so the loop reads as swimming."
  },
  {
   "severity": "medium",
   "area": "Atlas residency / texture memory",
   "problem": "bbld_hotel_2 holds only the two night frames (5.5 MB GPU) but is not in lazyAtlases. The _x orientation frames are about 25-30% of the used atlas area (41% of bbld_hotel, 19% of bbld_shops) and always load, although a coast uses one orientation. Total GPU footprint is 50 MB, similar to harbour/town, but avoidable.",
   "evidence": "Atlas measurement: bbld_hotel _x area 814k of 1.997M px; bbld_hotel_2 = resort_hotel_night + resort_hotel_x_night only; manifest lazyAtlases = ['bbld_glow'].",
   "fix": "Drop the night frames (see the night issue) or mark bbld_hotel_2 lazy. Move every *_x building frame and its _front/_glow into a separate lazy 'bbld_x' atlas."
  },
  {
   "severity": "low",
   "area": "Hotel as hero building: detail and tonal range",
   "problem": "The silhouette is the biggest and most distinctive in the game (topPx 549 vs apartment_a 442, dome + marquee). But about a quarter of the sprite is a plain banded hip roof, the entrance canopy top is a flat white slab, the lobby has no warm interior light (town/harbour bake lit windows even by day), and there is a single palm. Whites are greyish (luminance p5/p95 0.42/0.89 vs town 0.36-0.42/1.00). Beside the harbour sailor_lodge at the default 1.2x zoom the hotel looks paler and less crafted.",
   "evidence": "SCR/shots_fallback/hotel_z12.png, SCR/crops/lineup_scale.png, SCR/frames/resort_hotel.png; luminance stats in this review.",
   "fix": "Barrel-tile eave edge and ridge caps, a couple of roof features (chimneys, water tank or AC units, rooftop parasols). A striped coral or glass canopy top with planter boxes. A warm lit lobby behind the arched windows. A hedge and flower bed along the base and a second palm. Lift lit-face stucco to about 0.95 and deepen the accent darks (shutters, glass)."
  },
  {
   "severity": "low",
   "area": "Blank sign boards",
   "problem": "The beach_gate(_x) board is skewed along the iso axis (about 26.6°), but only fxPoints.boardCentre is given. The game's makeBoard (TownBuilding.js:100-105) writes flat, unrotated text scaled to 150 px, so '햇살 해변' will look pasted on. The surf-school board is the same.",
   "evidence": "SCR/crops/boards.png (crosshair at boardCentre; hotel board camera-facing = fine, gate boards slanted).",
   "fix": "Add boardAngleDeg plus boardSizePx (or a 4-corner boardQuad) for beach_gate, beach_gate_x and surf_shop so the game can rotate or shear the text."
  },
  {
   "severity": "low",
   "area": "Queues and staff lines of sight; surf school",
   "problem": "First customers stand right on the line of sight to the counter (beach_cafe customer0 [-103,2] in front of the window, the ice-cream queue, tourist_info customers around its window), so a queue hides the clerk the builder just re-rendered to be visible. The surf instructor [-23,48] stands in front of the door [-7,26], and the students' workDirs face the wall (NE) instead of the instructor.",
   "evidence": "SCR/shots/shops_z17_counter.png, SCR/shots/shops_z17_ice.png, SCR/shots/civic_z10_dbg.png, SCR/shots/shops3_z10_dbg.png.",
   "fix": "Shift queue position 0 sideways along the counter edge and angle the queue away from the window centre line. Move the instructor to about [-60,40] facing E and turn the students toward him."
  },
  {
   "severity": "low",
   "area": "staffPresets / doorPoints",
   "problem": "The pension 'owner' is mapped to beachfolk:beach_tourist (camera/aloha look) and chef to townfolk:barista. 16 of 18 doorPoints lie inside footprintPoly and inside TownBuilding.addCollision circles (town: 19 of 23 doors outside). That is fine for NPC dolls, but the chief can't reach them.",
   "evidence": "Manifest staffPresets; footprint containment check run in this review; src/entities/TownBuilding.js:32-49.",
   "fix": "Map owner to a housekeeper or apron look until beachfolk adds pension_owner and chef presets. Document that doorPoints are NPC-only, or move them to the footprint edge for player-reachable doors (hotel lobby)."
  },
  {
   "severity": "low",
   "area": "beach_arcade night glow",
   "problem": "At night the claw-machine glass glows as solid white rectangles and the plushies disappear.",
   "evidence": "SCR/crops/glow_check.png (row 2).",
   "fix": "Tint the glass glow cyan or pink at about 60% and keep the plush silhouettes dark inside."
  }
 ],
 "keep": [
  "Rendering language matches the house: same sun direction, soft baked cool cast shadows, no ink outline (edge/inner luminance ratio about 1.0 like town and harbour), PPU 64. Beside the harbour sailor_lodge and the town cafe the beach set reads as the same world (SCR/shots/hotel_z10.png).",
  "Hotel silhouette: peach tower + turquoise dome + flag + bulb marquee with stars. It is the tallest landmark and stays recognisable even at real 0.6x (SCR/crops/phone_scale_compare.png, right).",
  "Hotel staff trio and desk overlay: the receptionist's face shows over the concierge desk, the bellhop is at the brass trolley, the red carpet, and the staffRoles plus staffBehindOverlay data.",
  "Pool fallback water: clear turquoise with a drifting caustic net. The earlier white-blotch problem is truly fixed (SCR/shots_fallback/pool_z17.png). waterPoly matches the basin rim and the near coping is clipped correctly.",
  "Shop identity props: giant cone with sprinkles, swim ring, surfboard, whale, star marquee and medallion icons consistent with the town sign language. They read at real zoom.",
  "Bartender and ice-cream vendor faces are now visible over their counters at 1.0-1.7x. Lifeguard lookoutPoint plus deck overlay works.",
  "_x variants: points truly rotated, not mirrored (hotel_x doorman [106,20] = yaw-90 of [-39,53]); balconies, desk and trolley line up in SCR/shots/xrow_z10_dbg.png.",
  "staffPresets covers every role, and every target preset exists (beachfolk generator presets + townfolk:barista verified).",
  "Glow sprites align exactly with windows and bulbs; string-light lightPoints sit on the bulbs (SCR/crops/glow_check.png, SCR/shots/shops2_z10_dbg.png).",
  "Pipeline hygiene: packer merge guard, bbld_check (including the no-snow scan), Korean names in the manifest and labels, 1.86 MB payload, palettised atlases no larger than 2048 px."
 ]
}

## polish

# beach_bld polish pass: updated report

All 3 high and all 8 medium critic issues reproduced and are fixed. The one low issue visible to me (the hotel as hero building) is mostly fixed. The checks pass:
- `bbld_check.py` reports **0 errors and 0 warnings**.
- The Phaser 3.90 load test passes (exit 0). The pool uses the real `Water.js` shader.
- The critic's own test harness (my adapted copy in scratch), re-run on the final assets, shows the pool, balconies, doorman, BBQ and night lighting fixed.

The critic's JSON reached me cut off right after the hotel issue, so any later low issues were never seen. Two critic fixes were done differently from what the critic suggested (balconies and pool), explained in the table.

`docs/build_reports/beach_bld.md` is rewritten with all of this.

## Keys
`assets/beach_bld/` now holds **65 sprites** in **7 atlases**:
- **26 buildings and street pieces:** `resort_hotel`, `hotel_pool`, `pension`, `beach_cafe`, `beach_bar`, `seafood_bbq`, `icecream_shop`, `souvenir_shop`, `swimwear_shop`, `surf_shop`, `convenience_store`, `lifeguard_station`, `tourist_info`, `restroom_shower`, `mini_aquarium`, `beach_arcade`, `beach_gate`, `beach_lamp`, `string_lights_x` / `_y`.
- **Side-facing `_x` variants** (yawed 90°, front faces +X): `resort_hotel_x`, `beach_cafe_x`, `icecream_shop_x`, `beach_bar_x`, `convenience_store_x`, `beach_gate_x`. They are all in the lazy `bbld_x` atlas.
- **Derived sprites:** 12 `<key>_front` overlays, 26 `<key>_glow` night glows (the new one is `hotel_pool_glow`), and `hotel_pool_water`. That last one is the fallback water drawn under the pool deck: opaque water plus the pool floor, a 6-frame caustic loop.
- **Retired** (listed in the manifest's `retired`): `resort_hotel_night` and `resort_hotel_x_night`. The atlas sheet that held them, `bbld_hotel_2`, is gone.
- **Animations (12 keys):**
  - `seafood_bbq` `work`/`grill`: 4 frames at 7 fps. Flames, embers and swaying lanterns, with no baked smoke.
  - `mini_aquarium` `work`/`fish`: 8 frames at 6 fps.
  - `beach_arcade` `work`/`lights`.
  - `string_lights_x` / `_y` `work`/`twinkle`.
  - `hotel_pool_water` `work`/`ripple`.

## Fields
**Unchanged from the builder:**
- Every sprite: `anchor`, `frameSize`, `footprint`, `footprintM`, `footprintPoly`, `topPx`, `front`, `fxPoints`, Korean/English `name`, `zone`, `notes`.
- People spots: `doorPoint`, `customerPoints`, `seatPoints`, `viewPoints`, `showerPoints`, `workPoints`, `lookoutPoint`, `inPoint`, `staffPoints` with `staffRoles`.
- The top-level `staffPresets` (every staff role mapped to an existing character look).

**New or changed:**
- **`kind`:** building, decor, overlay, glow or underlay.
- **`staffDepths`:** one entry per staff point; `staffDepth` equals `staffDepths[0]`.
  - `front` means draw at the building's depth + 0.5. Used for staff behind a counter, desk or railing, on the pool deck, or right at the facade.
  - `behind` means normal y-sorting at the character's own position. Used for outdoor staff such as the doorman.
- **Hotel doorman** moved beside the red carpet, clear of the canopy column: point `[-92, 74]` (`[148, 46]` on `_x`).
- **Balconies:** `balconyFloors` and `balconyHeadroomPx` (144 px of free height, 72 px on top-floor balconies under the eaves).
- **Pool loungers:** `lyingHeadPoints`, `lyingFeetPoints`, `lyingAxis` and `lyingHeightM` (0.38 m), and `lyingFeetDirs`. `lyingFeetDirs` is the opposite of `lyingDirs`, and it is what gets passed to the beachfolk `sunbathe` animation.
- **Pool water:** `waterPolyFlat`, `waterRegion` `[-131, -65, 249, 125]` (the water's bounding box, no margin), `waterPx` 0, `waterDepth` −0.5. Kept: `waterPoly`, `waterZ`, `waterPalette` `pool`, `waterShore` `quay`, `waterOverlay`.
- **Night:** each lit sprite has `night: {glow, blend: "ADD", layer: "light"}` plus `lightPoints`, `lightKinds`, `lightRadiusPx` and a new `lightK` (light strength per point).
  - A top-level `night` block describes the game's DayClock model.
  - `night.tint` and `night.frame` no longer exist.
- **`lazyAtlases`:** `bbld_glow`, `bbld_x`, `bbld_x_glow`.
- **Top-level:** `retired`, and `conventions` sections for staff, balconyPoints, lying, night, anims, pool and atlases.

## How the game uses them
1. **Load:** add `beach_bld` as a lazy fragment in `src/core/Assets.js`.
   - The 4 base atlases load with it.
   - `bbld_x` loads only where the coast runs along Y.
   - `bbld_glow` and `bbld_x_glow` load at dusk.
   - Animations register as `spr:<key>:<anim>`.
2. **Place:** put each sprite at its anchor with depth = anchor y.
3. **Staff:** draw each staff member by `staffDepths[i]`, then the `_front` overlay at depth + 1 (what `Register.js` already does). Dress them with `staffPresets[role]`. Balcony guests go at depth + 0.5.
4. **Pool, water under the deck:**
   - Shader path: `new Water(scene, {region: waterRegion + anchor, mask: {water: [waterPolyFlat + anchor]}, waterPx: 0, defaultShore: 'quay', palette: 'pool', openSea: false, depth: d - 0.5, shoreDepth: d - 0.45})`.
   - Canvas or low quality: draw `hotel_pool_water` at depth − 0.5 instead.
   - Then draw the `hotel_pool` deck at depth d. One of the two waters must always be drawn, because the deck has a hole.
   - Swimmers on `swimPoints` at depth + 0.5.
   - Sunbathers on `lyingPoints` at depth + 0.6, using `sunbathe` with `lyingFeetDirs`.
5. **Night (DayClock):** don't tint the sprites.
   - Add `<key>_glow` in ADD blend at `DEPTH.FX - 29`, with alpha = `min(1, dayClock.cur.a / 0.45)`, shown while `dayClock.lightsOn`.
   - Call `dayClock.addLight(ax + dx, ay + dy, lightK[i])` for each light point.
6. **BBQ smoke:** the game emits translucent puffs from `fxPoints.smoke` (an existing FX smoke sheet, alpha 0.35–0.6).
7. **Blank sign boards:** the game writes the names at `fxPoints.boardCentre`.
8. **String lights:** chain `string_lights_x` every (+181, +91) px and `string_lights_y` every (+181, −91) px.

## Paths and scripts
All under `/home/user/nurient/frost-village/`. Nothing outside my owned files was changed.
- `assets/beach_bld/` (manifest plus the 7 atlases)
- `tools/blender/bbld_lib.py`, `bbld_assets.py`, `bbld_assets2.py`, `bbld_render.py` (new `--only glow` option), `bbld_pack.py`, `bbld_preview.py`, `bbld_check.py`
- `tools/test/beach_bld_phaser.mjs`
- Render cache: `/tmp/fv_cache/beach_bld`

To rebuild:
```
/tmp/bvenv/bin/python tools/blender/bbld_render.py -- [keys] [--force] [--only glow]
python3 tools/blender/bbld_pack.py
python3 tools/blender/bbld_check.py
node tools/test/beach_bld_phaser.mjs --out DIR
```

## Payload and test results
**Payload is 1.65 MB** of the 7 MB limit (was 1.86 MB).

| atlas | size (px) | GPU memory | loaded |
|---|---|---|---|
| `bbld_hotel` | 1976×924 | 7.0 MB | always |
| `bbld_shops` | 2048×1636 | 12.8 MB | always |
| `bbld_civic` | 1844×1132 | 8.0 MB | always |
| `bbld_street` | 1860×636 | 4.5 MB | always |
| `bbld_x` | 1896×1184 | 8.6 MB | lazy |
| `bbld_glow` | 1936×904 | 6.7 MB | lazy |
| `bbld_x_glow` | 1488×528 | 3.0 MB | lazy |

A daytime beach whose coast runs along −Y keeps 32 MB in GPU memory; all 7 atlases together are 50 MB.

Phaser load test:
- **Assets:** loaded all 7 atlases, found all 125 frames, played all 12 animations, placed 65 sprites. No page errors and no 404s.
- **Pool:** built with the real `Water.js` shader (24 vertices, 30 ms).
- **Water under the deck:** I compared 1671 points around the pool between the shader water and the fallback water. The worst difference was 1/255, so the water never shows outside the pool.

## Previews (`docs/previews/`, all regenerated and looked at)
- **`bbld_all.png`:** every sprite, labelled, with night entries and the pool shown three ways (deck alone, over its water, at night).
- **`bbld_scene.png`:** the day street, with beachfolk staff, swimmers, and sunbathers lying the right way round.
- **`bbld_night.png`:** the same street with the game's DayClock night.
- **`bbld_phone.png`:** the street at the real phone scale for zoom 0.6, 0.9 and 1.2 (720 game pixels across the screen at zoom 1).
- **GIFs:** `bbld_anims.gif`, `bbld_pool.gif`, and `bbld_hotel_daynight.gif` (no speckle now).
- **`bbld_phaser.png`:** the Phaser test, in three bands: day with fallback water, day with shader water, night.

## Known issues
- The preview ground (promenade, back street, sea) is a stand-in drawn by the preview script; the game uses `assets/beach` and `Water.js`.
- Staff behind counters show from the chest up. Their faces read only from about 1.2x zoom (about 8 CSS px tall at 0.6). I did not enlarge the roof medallions.
- A glow sprite draws over a person standing in front of a lit window; it reads as light spill.
- BBQ smoke only appears if the game emits FX puffs at `fxPoints.smoke`.
- The shader pool depends on the deck covering it. Use `waterRegion` exactly as given (no margin) and always draw one of the two waters.
- On top-floor balconies a standing guest's hat overlaps the roof edge. It is drawn in front of the eaves and looks fine.
- The `chef` role borrows `townfolk:barista`, and `owner` borrows a tourist look.
- The hotel's whites are only marginally brighter (brightness at the 95th percentile went from 0.89 to 0.90).

## Critic issues

| # | issue (severity) | result | what was done |
|---|---|---|---|
| 1 | The manifest's `Water.js` pool recipe paints an opaque blocky patch over the deck (high) | fixed | The pool sprite is now the deck with the water cut out, and the water (shader or fallback) is drawn underneath. This is the critic's option (a) without a separate floor sprite. New fields `waterPolyFlat`, `waterRegion`, `waterPx`, `waterDepth`; the deck was enlarged to cover the region. New check rules. The Phaser test now runs the shader pool and the water-under-deck comparison. |
| 2 | The night recipe doesn't fit the game's DayClock; the hotel night frame becomes a dark hole (high) | fixed | Hotel night frames retired and `bbld_hotel_2` removed. Night is now the DayClock model, with glows above the darkening layer and `lightK` light strengths. Glow strengths re-tuned for the game's darker night (signs 0.10–0.12, windows about 1.0). Night previews and the Phaser night band regenerated. |
| 3 | `bbld_phone.png` shows everything 1.85× too large (high) | fixed | The preview now shows 720 / zoom game pixels across. Readability was re-judged at the real scale. |
| 4 | Balcony guests' hats poke into the balcony above (medium) | fixed, different method | Seating guests, as the critic suggested, would make them taller (about 99 px vs 84–96 px standing). Instead the balconies were re-modelled as a checkerboard, so none sits directly above another. Added `balconyFloors` / `balconyHeadroomPx` and two check rules. |
| 5 | Lying direction is the head, but beachfolk `sunbathe` wants the feet, so heads land on the wrong end (medium) | fixed | Added `lyingFeetDirs`, head and feet points, `lyingAxis`, `lyingHeightM`, the conventions text and a check. |
| 6 | Outdoor staff are drawn at depth + 0.5, so people walking behind them draw over them (medium) | fixed | Per-point `staffDepths`; only staff behind an overlay, on the deck or at the facade use `front`. Conventions and check updated. |
| 7 | The doorman stands inside a canopy column (medium) | fixed | Moved to `[-92, 74]` (`_x` `[148, 46]`); the customer queue stays clear. |
| 8 | BBQ smoke is an opaque blob and the chef's face is behind a lantern (medium) | fixed | Baked smoke removed (smoke is now an FX job). Lanterns moved out of the line of sight and the chef moved 0.5 m left. |
| 9 | Several shops and the pool are dark at night (medium) | fixed | Roof medallions glow. Cafe, ice-cream and tourist-kiosk windows are lit (the kiosk's glow was empty before). The pool has 3 underwater lights, 2 deck lamps, its own glow and light points; the check no longer exempts it. |
| 10 | The aquarium tank is milky (medium) | fixed | Root cause: the water plane sat inside the facade wall. Now deep blue with a darker back wall, fewer glints and saturated fish; the glass no longer glows at night. The fish loop is now 8 frames at 6 fps. |
| 11 | Night-only and `_x` sprites are not in lazily loaded atlases (medium) | fixed | Night frames dropped; `bbld_x`, `bbld_glow` and `bbld_x_glow` are lazy, and the check enforces it. |
| 12 | Hotel as hero building: plain roof, flat canopy, no warm lobby, one palm, greyish whites (low) | mostly fixed | Barrel-tile roof with ridge and eave caps, chimneys, gulls, ribbed dome, coral-striped canopy with planters, warm-lit lobby, more palms. Whites only marginally brighter. |
| – | Any further low issues | not reproduced | Never seen: the critic's JSON was cut off after issue 12. |

The rebuilt previews are in `/home/user/nurient/frost-village/docs/previews/` and the critic-harness screenshots are in `/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v7_beach_bld/crit/shots/`.

Files are in `/home/user/nurient/frost-village/`:
- docs/build_reports/beach_bld.md
- assets/beach_bld/manifest.json
- tools/blender/bbld_pack.py
- tools/blender/bbld_check.py
- tools/blender/bbld_render.py
- tools/test/beach_bld_phaser.mjs
