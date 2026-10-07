# Contract addendum v7 — living water, "햇살 해변" (Sunny Beach) resort: sand, beach props, beachfront shops & hotel, beachfolk, beach audio

Extends CONTRACT.md … CONTRACT_V6.md (PPU 64, `bl_common` camera/light, 2:1 iso, manifest §2 format, paths relative
to `frost-village/assets/`). Design (Korean): `docs/기획서_v7_해변.md`. New fragments: `assets/water/`,
`assets/beach/`, `assets/beach_bld/`, `assets/beachfolk/`, `assets/audio5/`.

Setting: Sunny Beach lies on the warm-current coast south of the harbour city 갈매기 항구 — white sand, no snow on
the beach itself, turquoise water, but the same soft toy-like 3D look, palette family, light direction and
1 px ink outline conventions as every other set (compare `docs/previews/harbor_scene.png`, `ships_scene.png`,
`veh_scene.png`, town previews). Beach props may carry a light dusting of snow ONLY where they sit at the
snowy edge (provide `_snow` variants only if cheap). Everything must stay readable at phone zoom (0.6–1.2×).

## V. Living water — `assets/water/` (procedural textures + a standalone WebGL water module + lab)
Goal: the sea looks alive and believable in the house style (glossy, stylised-real, premium mobile game look):
long swells rolling toward shore, two layers of small ripples, sun glints, depth colour (deep → mid → shallow
→ transparent over the sand/rock bottom), animated caustics in shallow water, foam lace that rolls up a sand
beach and recedes leaving a darker wet-sand band, slap + spray against rocks / breakwater / quay, wakes.
- Textures (seamless, power-of-two, iso ground-plane aware): ≥2 tiling normal maps (FFT/Tessendorf-style or
  Gerstner sums, periodic), foam/whitecap noise, caustics (tiling, animatable by scrolling 2 layers), sand
  wet/dry ramp, colour ramps (LUT strips) for palettes `winter_sea` (village coast: deep navy, cold teal),
  `harbor` (slightly greener), `tropical` (beach: emerald → turquoise → clear), all in the manifest.
- `src/systems/Water.js` — a NEW standalone module (do not import it from existing game files yet): a Phaser 3.90
  WebGL shader object (or custom pipeline) that draws a water region in world space; samples textures in
  iso ground-plane coordinates (waves foreshortened 2:1 like the ground); takes a land/water mask and builds a
  low-res shoreline distance field once (JS, cheap) → depth proxy, shore foam bands moving with a swell phase,
  wet-sand band; per-segment shore type (`sand`, `snowbank`, `rock`, `quay`, `breakwater`); palette per
  region; `quality: 'high'|'low'` (low = 1-2 texture fetches, no caustics) and a Canvas-renderer fallback (the
  old scrolling tileSprite). JS API mirrors the swell maths: `water.heightAt(x, y, t)` and `slopeAt` so boats,
  buoys, swimmers and floating props bob in sync; `water.ripple(x, y, strength)` for splashes / wakes (ring
  buffer of N ripples fed to the shader); `water.setPalette()`, `setQuality()`, `destroy()`.
- FX spritesheets (fx conventions of `assets/fx`): `fx_wave_crash` (spray burst on rock/breakwater, 8–10 f),
  `fx_splash_small`, `fx_splash_big`, `fx_swim_ripple` (ring around a swimmer, loop), `fx_wake_v2` (boat wake
  V, loop), `fx_sparkle_water` (glints), `fx_shore_wave` (rolling breaking-wave crest strip for sand beaches,
  along both iso axes, loop) — usable with or without the shader.
- Lab: `tools/test/water_lab.html` + `tools/test/water_lab.mjs` (Playwright) rendering three scenes with the real
  game ground textures and a few existing sprites: (1) the current village coast (snow bank, dock pier,
  boats), (2) a harbour quay + breakwater with a moored ship, (3) a sand beach with swimmers/props placeholders.
  Capture frame sequences → GIFs/MP4s in `docs/previews/` (`water_village.gif`, `water_harbor.gif`,
  `water_beach.gif`) + stills; measure GPU/CPU cost (SwiftShader is slow — report relative cost of high vs low
  vs old tileSprite), texture memory, and document the exact integration steps for `src/systems/Ground.js`
  (which today draws `water_sea` as a scrolling tileSprite + baked shallow band + `shore_foam` strip along
  `shoreY(x)` from `Collision.js`).

## W. Beach ground & props — `assets/beach/` (procedural ground + Blender props, prop conventions, baked shadows)
- Ground (procedural, 512² seamless like `assets/ground`): `ground_sand` (dry, fine ripples), `ground_sand_wet`,
  `ground_sand_snow_edge` transition decals (both iso axes + corners), decals `decal_footprints_sand`,
  `decal_shells`, `decal_seaweed`, `decal_sand_ripples`, `decal_towel_*` (4 colours, beach towels as ground
  decals with `lyingPoints`), `decal_volleyball_court`.
- Props (Blender): `parasol_*` (≥5 colourways; optional `anims.flutter` 4 f), `sun_lounger` (+ `_x` axis variant;
  `lyingPoints`/`lyingDirs`), `beach_chair_folding`, `swim_ring_*` (on sand), `beach_ball` (item 72×72 + bounce
  anim), `sandcastle_s/m/l` (+ `sandcastle_build` 4 stages), `bucket_spade`, `lifeguard_tower` (`staffPoint`,
  `lookDir`), `rescue_board`, `rescue_buoy_stand`, `beach_shower` (anim water), `changing_booth`,
  `boardwalk_x/_y/_end` (tiling like piers), `volleyball_net`, `surfboard_rack`, `swim_buoy_line_x/_y`
  (rope + floats; water-plane anchored, bob anim), `swan_pedal_boat` (characters-style atlas, kind "ship", 2
  rendered axis headings + mirroring like ships, idle/move, `seats`), `kayak` (same), `banana_boat` (same, towed),
  `float_raft` (water-plane), `palm_tree_a/b` (+ `anims.sway`), `beach_pine`, `dune_grass_*`,
  `beach_swing`, `picnic_table_beach`, `icecream_cart` (vendor `staffPoint`, `customerPoints`, bell),
  `corn_stand`, `rental_stand` (rings/parasols), `beach_sign_*` (blank boards), `crab` (characters-style atlas:
  walk sideways 6 f + idle 4 f, 5 dirs or 2 axis dirs + mirror), `starfish`, `driftwood`, `kite` (flying anim).
- Fields: `staffPoints`, `customerPoints`, `seatPoints`, `lyingPoints`, `waterPlane: true` for water props
  (anchor = waterline; sea surface 0.55 m below land like the harbour's `waterPx` 30), `footprintPoly`.

## X. Beachfront buildings — `assets/beach_bld/` (Blender, town/harbour building conventions)
`resort_hotel` (big, 4–5 floors, balconies, sign board, entrance canopy, lit windows variant; `doorPoint`,
`staffPoints` for doorman/bellhop/receptionist, `inPoint`, `balconyPoints` for guests), `hotel_pool` (outdoor
pool deck with loungers; pool water region given as `waterPoly` so the Water module can draw it, plus a baked
fallback frame), `pension` (small guesthouse), `beach_cafe`, `beach_bar`, `seafood_bbq` (`anims.work` smoke/
grill), `icecream_shop`, `souvenir_shop`, `swimwear_shop`, `surf_shop` (boards outside), `convenience_store`,
`lifeguard_station`, `tourist_info`, `restroom_shower`, `mini_aquarium` (glass front, fish anim),
`beach_arcade` (lights anim), `beach_gate` (entrance arch "햇살 해변" with a blank sign board), string lights /
`beach_lamp`. Fields like the town set (doorPoint, customerPoints, staffPoints, inPoint, fxPoints,
footprintPoly, `lightPoints` for night). Buildings face the sea on their −Y side like the harbour set; provide
`_x`-facing variants for the 4–5 most important ones if the coastline needs them (document).

## Y. Beachfolk — `assets/beachfolk/` (townsfolk paper-doll pipeline `tf_*` / `tf2_*`, merge rules as townfolk2)
New tintable parts: `swimsuit_one`, `swim_trunks`, `rash_guard`, `swim_cap`, `straw_hat`, `sun_hat_wide`,
`sunglasses`, `flip_flops` (and a bare-feet option), `towel_shoulder`, `swim_ring_worn`, `snorkel_mask`,
`arm_floaties` (kids), `aloha_shirt`, `wetsuit`; job outfits `lifeguard` (+ whistle), `bellhop` (+ pillbox cap),
`hotel_receptionist`, `doorman`, `housekeeper`, `icecream_vendor`, `beach_bar_staff`, `surfer`, `tourist_camera`.
Presets: swimmer, sunbather, family_beach (parent/kid), lifeguard, bellhop, receptionist, doorman,
housekeeper, icecream_vendor, beach_bar_staff, surfer, tourist.
New anims for ALL bases: `swim` (8 f, 5 dirs; only head/shoulders/arms above a baked waterline cut — document
the waterline offset so the game can add `fx_swim_ripple`), `float` (in a swim ring, 4 f loop, S/SE/E), `sunbathe`
(lying on back, 4 f breathing, along both iso axes), `dig` (kneeling, building sand, 6 f, S/SE/E),
`ball_throw` + `ball_catch` (6 f each, S/SE/E, impactFrame + ballPoint), `splash_play` (6 f, S/SE/E),
`surf` (on a board, 4 f, axis dirs). Same compact atlas format / compositor conventions as townfolk/townfolk2,
with merge helpers documented; a 60-person beach crowd preview.

## Z. Audio v7 — `assets/audio5/` (procedural synthesis, same loudness rules and loop-fitting as audio1–4)
`amb_beach` (gentle surf on sand + distant kids + gulls; seamless), `amb_sea_waves` (realistic rolling waves for
the village coast, replaces the flat sea feel; seamless), `sfx_wave_crash_1..3` (on rocks/breakwater),
`sfx_wave_wash` (swash up the sand), `sfx_splash_1..3`, `sfx_lifeguard_whistle`, `sfx_icecream_bell`,
`sfx_beachball_bounce`, `sfx_hotel_bell`, `sfx_sand_step_1..4`, `sfx_pool_splash`, `bgm_beach` (sunny,
ukulele / steel-pan colour, same melodic family as bgm_village, 45–90 s loop).
