# beach_bld build report — "햇살 해변" beachfront buildings & resort hotel (CONTRACT_V7 §X)

**Status after the polish pass:** `assets/beach_bld/` holds **65 sprites** in **7 atlases** with a **payload of 1.65 MB**
(limit 7 MB; was 1.86 MB).
- The sprites are 26 buildings / street pieces (20 contract keys + 6 `_x` variants), 12 front overlays, 26 night glows
  and `hotel_pool_water`.
- 4 atlases always load: `bbld_hotel`, `bbld_shops`, `bbld_civic`, `bbld_street`. 3 load lazily: `bbld_x`, `bbld_glow`,
  `bbld_x_glow`. Every sheet is ≤ 2048 px and palettised to 256 colours.
- `bbld_check.py`: **0 errors, 0 warnings**.
- Headless Phaser 3.90 test (`tools/test/beach_bld_phaser.mjs`, exit 0):
  - loaded all 7 atlases, found all **125 frames**, played all **12 anim keys**;
  - no page errors and no 404s;
  - built the pool with the real **`src/systems/Water.js` shader** (`isShader` true, 24 body verts, 30 ms);
  - land-over-water probe: drew the pool with Water.js and with the opaque fallback water and compared 1671 points along
    the deck. Worst difference 1/255, mean 0, so the Water.js mesh never shows outside the pool.

**Style (unchanged):** a warm-current coast with **no snow anywhere**. Pastel / white stucco, terracotta and turquoise
roofs, striped awnings, wood decks and palms. Same toy-like 3D look, palette family, camera, sun, PPU 64 and baked cool
shadow as the village, town and harbour sets (unchanged `bl_common` / `bld_render` helpers).

What the polish pass changed (details in the table at the end):
- **Pool.** `hotel_pool` is now the **deck with the water cut out**. The water goes **under** it (Water.js or the
  fallback loop), the same "land over water" rule as the sea.
- **Night.** It follows the game's **DayClock** model:
  - one MULTIPLY overlay for the whole screen, plus `<key>_glow` in ADD and `DayClock.addLight` halos;
  - the hotel night frames are retired;
  - every shop sign / medallion, the lit shop windows, the tourist kiosk and the pool (underwater lights + 2 lamps) glow.
- **Hotel (hero building):**
  - checkerboard balconies, so no guest pokes into the balcony above;
  - barrel-tile roof with ridge and eave caps, chimneys, gulls, a ribbed dome;
  - coral-striped entrance canopy with planters, warm-lit lobby, more palms;
  - the doorman moved out of the canopy column.
- **People fields.** Per-point `staffDepths` (only staff behind an overlay are drawn on the building), and lying fields
  that work with beachfolk `sunbathe`.
- **BBQ.** No baked smoke blob; the chef's face is clear of the lanterns.
- **Aquarium.** A deep-blue tank with saturated fish and an 8-frame swim loop.
- **Atlases.** `_x` buildings and all glows are in lazy atlases.
- **Previews.** `bbld_phone.png` now uses the real phone scale (720 logical px across at zoom 1).

## Keys (`sprites{}` in `assets/beach_bld/manifest.json`)
| key | 한국어 | what | derived / special |
|---|---|---|---|
| `resort_hotel` (+`_x`) | 햇살 리조트 호텔 | 8.0 × 5.8 m, 4 storeys + a 5-storey peach tower. Bright white stucco under a terracotta barrel-tile hip roof (scalloped eaves, ridge caps, dormers, 2 chimneys, gulls). Tower: arched windows, flower boxes, sun plaques, ribbed turquoise dome with a gold finial and flag. 9 **checkerboard** balconies with parasols, deck chairs, flowers and towels, plus shuttered windows with flower boxes. Warm-lit lobby under coral awnings. Coral-striped canopy on white columns with planters and gold stars, red carpet, palms, concierge desk (bell + guest book), brass luggage trolley. Blank marquee board with bulbs + 5 stars on the roof | `_front` (railings, towels, desk), `_glow` |
| `hotel_pool` | 호텔 수영장 | 6.4 × 5.9 m tiled **deck with the 3.6 × 2.2 m water surface cut out**. Coping, ladder, slide, 6 loungers with towels, 2 parasols, towel shelf, lifebuoy, shower, potted palms, flower pots, 2 deck lamps, 3 underwater lights | `hotel_pool_water` (underlay: opaque water + pool floor, 6 f caustic loop), `hotel_pool_glow` |
| `pension` | 바다 민박 | 2-storey lemon cottage, terracotta roof, bougainvillea pergola, balcony with towels on a line, bicycle, picket fence, house-and-heart sign | `_front`, `_glow` |
| `beach_cafe` (+`_x`) | 파도 카페 | turquoise-roofed plank cafe, walk-up window with a **lit interior** (barista inside), iced-coffee roof medallion, party bulbs, side terrace with 2 parasol tables | `_front`, `_glow` |
| `beach_bar` (+`_x`) | 코코넛 바 | thatched palapa, bamboo bar with 4 stools, bartender behind the bar, bottles, coconuts, tiki torches, bulbs, coconut-cocktail medallion | `_front`, `_glow` |
| `seafood_bbq` | 조개구이 | red shack with a striped awning. Charcoal grill with clams / scallops / fish; chef behind the grill (face clear of the lanterns); red lanterns; glowing live tanks; banners; side tables. **No baked smoke** | `anims.work`/`grill` 4 f @7 (flames, embers, lantern sway), `_front`, `_glow` |
| `icecream_shop` (+`_x`) | 구름 아이스크림 | candy-striped kiosk, giant cone on the roof, sprinkles, mint awning, **lit** freezer counter (vendor inside), bench | `_front`, `_glow` |
| `souvenir_shop` | 조개 기념품 | blue-roofed shop, shell sign, frost-village snow-globe window, postcard spinner, straw hats, wind chime | `_glow` |
| `swimwear_shop` | 튜브 가게 | sky-blue shop, giant swim ring on the roof, mannequin, swim-ring rack, flamingo float, beach balls | `_glow` |
| `surf_shop` | 파도타기 서핑샵 | driftwood shack, teal tin roof, surfboard on top, board rack, wetsuits, blank surf-school board | `workPoints`, `_glow` |
| `convenience_store` (+`_x`) | 바닷가 편의점 | white box with a green-orange fascia, lit shelves, freezer, cooler, water packs, terrace with parasols | `_glow` |
| `lifeguard_station` | 인명구조대 | white/red base with rescue boards, yellow look-out room, deck, stair, flag, loud-hailer, red-cross medallion | `lookoutPoint`, `_front`, `_glow` |
| `tourist_info` | 관광 안내소 | round kiosk with a parasol roof, "i" medallion, **lit window and posters**, map board, brochure rack (guide inside the window) | `_front`, `_glow` |
| `restroom_shower` | 화장실·샤워장 | tiled block, blue / pink doors, pictogram sign, water tank, 2 outdoor showers, foot-wash tap, bench | `showerPoints`, `_glow` |
| `mini_aquarium` | 꼬마 수족관 | white building, wave roof, smiling whale. **Deep-blue** glass tank (dark back wall, coral, sea grass, turtle, saturated emissive fish, 2 thin glints). Ticket window | `anims.work`/`fish` **8 f @6**, `viewPoints`, `_glow` |
| `beach_arcade` | 반짝 오락실 | lilac fun house, open entrance, 2 claw machines, coin booth, star marquee, bulbs | `anims.work`/`lights` 4 f, `_glow` |
| `beach_gate` (+`_x`) | 햇살 해변 입구 | driftwood pillars with rope, starfish, life rings, curved arch, BLANK sign board, smiling sun, pennants | `fxPoints.boardCentre`, `passage`, `_glow` |
| `beach_lamp` | 해변 가로등 | white post, turquoise nautical lantern | `lightPoints`, `_glow` |
| `string_lights_x` / `_y` | 전구 줄 | two posts, 4 m string of coloured bulbs (along X / along Y) | `anims.work`/`twinkle` 4 f, `_glow` |

**`_x` variants.** `resort_hotel_x`, `beach_cafe_x`, `icecream_shop_x`, `beach_bar_x`, `convenience_store_x` and
`beach_gate_x` (plus `string_lights_y`) are yawed 90°. Their front is +X (screen down-right), for a coast along the
other iso axis.
- The visible faces are modelled for that view, and every point / poly is already rotated.
- They live in the lazy `bbld_x` (+ `bbld_x_glow`) atlas.
- Never mirror a sprite: baked shadows can't flip.

**Retired** (listed in manifest `retired`): `resort_hotel_night` and `resort_hotel_x_night`. The DayClock overlay plus
`<key>_glow` replaces them, and the `bbld_hotel_2` sheet is gone.

## Fields (all points = px offsets `[dx, dy]` from the anchor)
- **Every sprite:** `anchor`, `frameSize`, `footprint`, `footprintM`, `footprintPoly`, `topPx`, `front`, `fxPoints`,
  `name` (ko/en), `zone`, `kind` (`building` / `decor` / `overlay` / `glow` / `underlay`), `notes`.
- **People:**
  - `doorPoint`/`doorDir`, `customerPoints`/`Dirs`, `seatPoints`/`Dirs` (seat ≈ 0.45 m = `sit`).
  - `viewPoints`, `showerPoints`, `workPoints`, `lookoutPoint`, `inPoint` (delivery pad for village goods).
  - `staffPoints` + `staffDirs` + `staffRoles`.
  - **`staffDepths`** (one per point; new):
    - `"front"`: draw at building depth d + 0.5. Used for staff behind a counter / desk / railing (listed in
      `staffBehindOverlay`), staff standing on a flat part of the sprite (pool deck), and points so close to the facade
      that their own y would sort them behind the building.
    - `"behind"`: ordinary y-sort at the character's own y. Used for staff in the open in front of the building: hotel
      doorman + bellhop, shop clerks at the door, aquarium ticket seller, etc.
    - `staffDepth` = `staffDepths[0]` (the field `Register.js` reads).
- **Hotel staff:**
  - `[0]` doorman, **moved** beside the red carpet clear of the canopy column: `[-92, 74]`; `_x` `[148, 46]`.
  - `[1]` bellhop at the trolley.
  - `[2]` receptionist behind the concierge desk (`front`).
  - In `_x` the bellhop is `front` too, because his point is right at the facade.
- **Balconies:** `balconyPoints`/`Dirs` (hotel 9, pension 2; elevated). New fields:
  - **`balconyFloors`**: the floor of each point (0 = first upper floor).
  - **`balconyHeadroomPx`**: free height above that balcony floor (144 px to the next balcony or the eaves; 72 px for
    top-floor balconies under the eaves).
  - The hotel balconies are checkerboarded: no balcony sits directly above another.
- **Pool lying fields (new / changed):**
  - `lyingPoints`: hip ON the cushion; `lyingHeightM` 0.38.
  - **`lyingHeadPoints` / `lyingFeetPoints`**.
  - `lyingDirs`: hips → HEAD (as in `assets/beach`).
  - **`lyingFeetDirs`**: the opposite. **Pass this to beachfolk `sunbathe`**, whose dir is where the feet point.
  - **`lyingAxis`**: `"y"`.
- **`staffPresets`** (top level) maps every role to an existing preset (`beachfolk:doorman`, … `chef` →
  `townfolk:barista`, `owner` → `beachfolk:beach_tourist`). `bbld_check` fails if a role has no entry.
- **Night:** `night: {glow: "<key>_glow", blend: "ADD", layer: "light"}` on every lit sprite (including `hotel_pool`),
  plus `lightPoints` + `lightKinds` + `lightRadiusPx` + **`lightK`** (the `DayClock.addLight` strength per point).
  - Top-level **`night`** block: `model: "DayClock"`, overlay `#5A6AA8` at darkness 0.45, MULTIPLY at `DEPTH.FX - 30`.
    Glows go in ADD at `DEPTH.FX - 29`; `glowAtlases`; glow alpha = `min(1, dayClock.cur.a / darkness)` while
    `dayClock.lightsOn`.
  - `night.tint` and `night.frame` no longer exist.
- **Overlay:** `overlay: "<key>_front"` (same frame + anchor) on the 12 sprites with occluders in front of people.
- **Pool (Water.js):**
  - `waterPoly` (px pairs) and **`waterPolyFlat`** (flat `[x0, y0, x1, y1 …]`, ready for `Water.js` `mask.water`);
  - **`waterRegion`** `[-131, -65, 249, 125]` = the water bbox with **no margin**;
  - **`waterPx` 0**, **`waterDepth` −0.5**, `waterZ` −0.12 m;
  - `waterPalette: "pool"`, `waterShore: "quay"`, `waterRectPx` / `waterRectM`, `waterOverlay: "hotel_pool_water"`.
- **Anims:** `anims.work` + an alias (`grill`, `fish`, `lights`, `twinkle`, `ripple`). Every frame shares frameSize +
  anchor, and the anim key is `spr:<key>:<anim>`.
- **`conventions`** (top level) spells out all of the above. Sections: `staff`, `balconyPoints`, `lying`, `night`,
  `anims`, `pool`, `atlases`.

## How the game should use them
1. **Load.** Add `'beach_bld'` to `FRAGMENTS` in `src/core/Assets.js`, and to `LAZY_FRAGMENTS`, since it is only
   needed at the beach.
   - Load `bbld_hotel`, `bbld_shops`, `bbld_civic`, `bbld_street` with the fragment.
   - Load the manifest's `lazyAtlases` only when needed: `bbld_x` where a coast runs along Y; `bbld_glow` /
     `bbld_x_glow` at dusk.
   - Anims register as `spr:<key>:<anim>`.
2. **Place.** Draw the sprite at its anchor with depth = anchor y. Buildings face the sea on −Y (screen down-left); use
   the `_x` variants where the coast runs along Y.
3. **Staff and guests.**
   - For each staff point, read `staffDepths[i]`. `"front"` → draw at d + 0.5. `"behind"` → normal y-sorting at the
     point's own y.
   - Then draw the `overlay` sprite at d + 1. This is what `src/entities/Register.js` already does for
     `shop_general_front`; it only needs the per-point depth.
   - Dress staff with `staffPresets[role]`.
   - Balcony guests: d + 0.5, under the overlay at d + 1.
4. **Pool (land over water).**
   - Draw the water **under** the deck at d − 0.5. Shader path:
     `new Water(scene, {region: waterRegion + anchor, mask: {water: [waterPolyFlat + anchor]}, waterPx: 0, defaultShore: 'quay', palette: 'pool', openSea: false, depth: d - 0.5, shoreDepth: d - 0.45})`.
   - Canvas / low quality: draw `hotel_pool_water` (play `spr:hotel_pool_water:ripple`) at d − 0.5 instead.
   - Then draw the `hotel_pool` deck at d. One of the two waters must always be drawn, because the deck has a hole.
   - Swimmers on `swimPoints` at d + 0.5 (+ `fx_swim_ripple`).
   - Sunbathers on `lyingPoints` at d + 0.6, using `sunbathe` with `lyingFeetDirs`.
5. **Night (DayClock).**
   - Don't tint sprites: the DayClock MULTIPLY overlay darkens everything.
   - For buildings in or near the view, add `<key>_glow` (same frame + anchor, ADD) at `DEPTH.FX - 29`, with alpha =
     the DayClock night factor.
   - For every `lightPoints[i]`, call `dayClock.addLight(ax + dx, ay + dy, lightK[i])`.
6. **Smoke / FX.** The BBQ has no baked smoke. Emit translucent rising puffs (existing FX smoke sheet, alpha 0.35–0.6)
   from `fxPoints.smoke`. Other spots (steam, bell, sign, flag, shower) are in `fxPoints`.
7. **Text.** Blank boards (hotel roof marquee, beach gate, surf school) have `fxPoints.boardCentre`. The game writes
   "햇살 리조트", "햇살 해변" etc. there.
8. **String lights.** Chain `string_lights_x` every 4.0 m along X, a step of (+181, +91) px. Chain `string_lights_y`
   along Y, a step of (+181, −91) px.

## Scripts and how to rebuild
The scripts are in `tools/blender/`:
- `bbld_lib.py`: warm-coast helpers. New this pass: `glow_objs`, `barrel_roof_mat`, `eave_caps`, barrel `hip_roof`,
  `glass_door`, `canopy_flat(top=)`, `tank_glass(night_on=)`.
- `bbld_assets.py`: registry + hotel, pool, cafe, ice-cream shop.
- `bbld_assets2.py`: the rest.
- `bbld_render.py`: now with per-object glow strengths and `--only glow`.
- `bbld_pack.py`, `bbld_preview.py`, `bbld_check.py`.

The test is `tools/test/beach_bld_phaser.mjs`. These scripts only import existing helpers (`bl_common`, `prop_lib`,
`bld_render`, `town_lib`, `harbor_lib`, `pack_utils`, the townfolk / beachfolk compositors, …). No existing script,
asset or `src/**` file was edited.
```
/tmp/bvenv/bin/python tools/blender/bbld_render.py -- [keys|atlas|zone] [--force] [--samples N] [--only glow]
python3 tools/blender/bbld_pack.py            # atlases + manifest + previews (merge + guard)
python3 tools/blender/bbld_preview.py         # previews only (re-reads the render cache)
python3 tools/blender/bbld_check.py
node tools/test/beach_bld_phaser.mjs [--out DIR]
```
- **Render cache:** `/tmp/fv_cache/beach_bld`. Reruns skip finished builds.
  - This pass re-rendered the hotel (+`_x`), pool, BBQ, aquarium, cafe / ice-cream (+`_x`) and tourist_info.
  - It re-rendered only the glow pass for all signed shops (sign strength 0.10–0.12).
- **Packer:**
  - Cuts the pool deck inside `waterPoly`.
  - Builds the opaque fallback water (pool floor + caustics from `assets/water` `water_waves_b`).
  - Writes the glows (gain 0.85, small bloom; the pool glow follows `waterPoly`).
  - Sorts frames into the 7 atlases.
  - Merges into the existing manifest and refuses (exit 1, nothing written) if a non-retired key would go missing.
    `--allow-partial` drops keys on purpose.
- **Check rules added this pass:**
  - per-point `staffDepths`; staff behind the overlay must be `front`;
  - lying point arrays, with `lyingFeetDirs` opposite to `lyingDirs`;
  - balcony headroom, and no hotel balcony directly above another;
  - DayClock night: no `tint` / `frame`, every glow non-empty, `hotel_pool` lit (exemption removed);
  - deck cut out inside `waterPoly`, fallback water opaque there, deck covering `waterRegion`;
  - retired sprites absent;
  - `bbld_glow` / `bbld_x` / `bbld_x_glow` lazy, and every `_x` building in `bbld_x`.
- **Phaser test (`beach_bld_phaser.mjs`):**
  - three bands: day with the fallback pool; day with the **Water.js** pool; night with the DayClock overlay +
    glows + `fv_glow` halos;
  - the land-over-water region probe;
  - exit 1 on missing frames / anims, page errors, 404s, a non-shader Water or a probe difference.

## Payload and memory
- **Payload: 1.65 MB** (7 MB limit).

| atlas | size (px) | GPU memory | when loaded |
|---|---|---|---|
| `bbld_hotel` | 1976×924 | 7.0 MB | always |
| `bbld_shops` | 2048×1636 | 12.8 MB | always |
| `bbld_civic` | 1844×1132 | 8.0 MB | always |
| `bbld_street` | 1860×636 | 4.5 MB | always |
| `bbld_x` | 1896×1184 | 8.6 MB | lazy |
| `bbld_glow` | 1936×904 | 6.7 MB | lazy |
| `bbld_x_glow` | 1488×528 | 3.0 MB | lazy |

- A −Y coast by day keeps **32 MB** resident.
- Before this pass, every atlas except `bbld_glow` always loaded: `_x` frames, both hotel night frames and the
  `bbld_hotel_2` sheet. The critic measured 50 MB in total.

## Previews (`docs/previews/`)
- **`bbld_all.png`:** every sprite at 1x, labelled with key + Korean name. Includes idle + one anim frame, night
  entries (game DayClock + glow) and the pool three ways: deck with the cut-out, over its water, at night.
- **`bbld_scene.png`:** a beachfront street at 1x.
  - Buildings along a promenade, a boardwalk with lamps and string lights, and the beach set and sea in front.
  - People are **beachfolk**: hotel uniforms, lifeguards, swimmers in the pool, sunbathers on the loungers (feet
    direction), staff by `staffDepths`. Townsfolk in summer clothes fill in.
  - The pool water is drawn under the deck.
- **`bbld_night.png`:** the same street with the game's DayClock night (overlay + glows + `fv_glow` halos at
  `lightPoints`).
- **`bbld_phone.png`:** the day street as a 390 × 844 phone **really** shows it at zoom 0.6 / 0.9 / 1.2, i.e. 720 / z
  world px across. The old preview was 1.85× too large.
- **GIFs:**
  - `bbld_anims.gif`: BBQ grill without smoke, aquarium 8-frame fish, arcade lights, string lights.
  - `bbld_pool.gif`: pool water under the deck.
  - `bbld_hotel_daynight.gif`: the DayClock fade; the palette is built from a strip of frames, so there is no speckle.
- **`bbld_phaser.png`:** the Phaser test, with shelf + three bands.

## Known issues
- **Preview ground is a stand-in.** In the previews the promenade, back street and sea are drawn by the preview script.
  In the game the sand comes from `assets/beach` and the sea / pool from `Water.js`.
- **Counter staff read only up close.** Staff behind counters show from the chest / face up. At the real phone zoom
  0.6 a counter clerk's face is about 8 CSS px, so faces read from about 1.2x. The roof medallions were not enlarged;
  at 0.6 shops are told apart by roof colour and roof props.
- **Glows draw over people.** A glow sprite in the light layer is drawn over a character standing in front of a lit
  window, which reads as light spill.
- **BBQ smoke is the game's job.** It now depends on the game emitting FX puffs at `fxPoints.smoke`.
- **Water.js needs the deck.** The Water.js pool relies on the deck covering its 64 × 32 px block mesh. Keep
  `waterRegion` exactly as given (no margin), and always draw one of the two waters.
- **Top-floor balcony hats.** On the top-floor balconies (72 px headroom, under the eaves) a standing guest's hat
  overlaps the roof edge. It is drawn in front of the eaves and reads fine. Seating guests in the deck chairs would not
  help: the `sit` pose plus seat height is taller (≈ 99 px) than standing (84–96 px).
- **Borrowed presets.** `chef` still uses `townfolk:barista` (apron), and `owner` uses a tourist look.
- **Whites slightly grey.** The hotel's whites are only slightly brighter than before (luminance p95 0.89 → 0.90). The
  baked cool shadow and the Standard view transform cap them.

## Polish pass: critic issues
Re-checked with the critic's own Phaser harness, adapted copy in `scratchpad/v7_beach_bld/crit/`:
- Shots: `shots/hotel_z12`, `hotel_z17_entrance`, `hotel_z17_balc`, `pool_z17`, `pool_z17_dbg`, `civic_z17_bbq`,
  `night_hotel_z06`, `night_civic_z10`, `xrow_z10`, plus `shots_fallback/pool_z17` and `hotel_z12`.
- The harness's own doll-loader 404s (beachfolk roles without `sit` / `swim` / `sunbathe`) also occur in the critic's
  original run. They are not beach_bld assets.

| # | issue (severity) | result | what was done |
|---|---|---|---|
| 1 | Water.js pool covers the deck in an opaque blocky patch (high) | **fixed** | Reproduced. Fixed with the critic's option (a), land over water: the pool sprite is the deck with the water cut out; Water.js or `hotel_pool_water` goes under it at d − 0.5. `hotel_pool_water` is the opaque basin floor + caustics, so no separate floor sprite is needed. Added `waterPolyFlat`, `waterRegion` (bbox, no margin; found with a headless probe of the Water.js mesh), `waterPx` 0 and `waterDepth`. The deck was enlarged so it covers the whole region. Rewrote `conventions.pool` and added check rules. The Phaser test now builds the real Water.js pool and probes 1671 deck points (worst 1/255). Critic shots `pool_z17` / `hotel_z12`: clean. |
| 2 | Night recipe doesn't fit the DayClock; the hotel night frame becomes a dark hole (high) | **fixed** | Reproduced. Retired both hotel night frames (`bbld_hotel_2` removed). Night is now the DayClock model: top-level `night` block, glows in ADD at FX − 29 above the overlay, `lightK` for `addLight`. Glow strengths re-tuned for the 0.71 night (windows ≈ 1.0, signs 0.10–0.12, suns 0.15, marquee stars 0.2; pack gain 0.85). `bbld_night.png` and the Phaser night band were regenerated with the DayClock model. |
| 3 | `bbld_phone.png` 1.85× too large (high) | **fixed** | Reproduced. The crop is now 720 / z world px wide (`PHONE_LOGICAL_W`). Legibility was re-judged at the real scale: buildings and roofs read at 0.6; counter faces read from about 1.2x (known issue). |
| 4 | Balcony guests' hats poke into the balcony above (medium) | **fixed (different method)** | Reproduced. Seating guests was measured to make them *taller* (≈ 99 px vs 84–96 px standing), so instead the hotel balconies are re-modelled as a checkerboard: no balcony sits right above another. Added `balconyFloors` / `balconyHeadroomPx` and two check rules. Critic shots `hotel_z17_balc` / `xrow_z10`: no overlaps. |
| 5 | `lyingDirs` points to the head, but beachfolk `sunbathe` wants the feet (medium) | **fixed** | Reproduced. Added `lyingFeetDirs` (pass to `sunbathe`), `lyingHeadPoints`, `lyingFeetPoints`, `lyingAxis` and `lyingHeightM`, and documented the hip anchor in `conventions.lying`. Checked that `lyingFeetDirs` is the opposite of `lyingDirs`. Previews and the critic shots show heads on the backrests. |
| 6 | All staff drawn at d + 0.5, so walkers behind outdoor staff draw over them (medium) | **fixed** | Reproduced. Per-point `staffDepths`: `front` only behind an overlay, on the deck, or at the facade; `behind` (normal y-sort) for the others. `staffDepth` = `[0]`. Conventions and the check were updated. |
| 7 | Doorman inside a canopy column (medium) | **fixed** | Reproduced. Moved beside the carpet clear of the column, facing the street: `[-92, 74]` (`_x` `[148, 46]`). The customer queue is clear (`hotel_z17_entrance`). |
| 8 | BBQ smoke is an opaque blob; chef's face behind a lantern (medium) | **fixed** | Reproduced. Baked smoke removed; the work loop now has flames, embers and lantern sway. Smoke is documented as FX puffs at `fxPoints.smoke`. Lanterns moved out of the line of sight and the chef moved 0.5 m left, so the face is clear (`civic_z17_bbq`). |
| 9 | Shops / pool dark at night; medallions don't glow (medium) | **fixed** | Reproduced (tourist_info glow was empty). All roof medallions and emblems glow (backlit). Cafe, ice-cream and tourist-kiosk windows got lit linings where the camera actually looks. The pool got 3 underwater lights + 2 deck lamps, `night`, `lightPoints` and `hotel_pool_glow`, and its check exemption was removed. A check fails on an empty glow. |
| 10 | Aquarium tank milky, 4 jumpy frames (medium) | **fixed** | Reproduced. Root cause: the water plane sat inside the facade wall. Fixed: water now in front; deep-blue water, darker back wall, 2 thin glints, saturated emissive fish; the glass no longer glows at night. 8 frames @6 fps with small steps. |
| 11 | Night / `_x` frames not in lazy atlases (medium) | **fixed** | Night frames dropped; every `_x` building (+ overlay) moved to `bbld_x`; glows split into `bbld_glow` / `bbld_x_glow`. All three are lazy and check-enforced. |
| 12 | Hotel as hero: plain roof, flat canopy, no warm lobby, one palm, grey whites (low) | **fixed (mostly)** | Barrel-tile roof material with ridge and eave caps, 2 chimneys, gulls, a ribbed dome; coral-striped canopy top with planters; warm-lit lobby; more palms; flower boxes. Whites are only marginally brighter (see known issues). |
| – | Any further low issues | **not reproduced** | Not seen: the critic JSON handed to this pass was cut off after issue 12. |
