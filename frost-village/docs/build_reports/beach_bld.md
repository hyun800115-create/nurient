# beach_bld build report — "햇살 해변" beachfront buildings & resort hotel (CONTRACT_V7 §X)

The beachfront set is finished. `assets/beach_bld/` holds **66 sprites** — 26 buildings / street pieces (20 contract
keys + 6 `_x` variants) plus their derived sprites (13 overlays incl. the pool water loop, 25 night-glow sprites, 2 hotel
night frames) — in **6 atlases** (`bbld_hotel`, `bbld_hotel_2`, `bbld_shops`, `bbld_civic`, `bbld_street`, `bbld_glow`,
every sheet ≤ 2048 px, palettised 256 colours) with a **payload of 1.86 MB** (limit 7 MB). `bbld_check.py` reports
**0 errors, 0 warnings**. A headless Phaser 3.90 load found all **118 frames** and played all **12 anim keys** with no
errors, no 404s and no missing frames (`tools/test/beach_bld_phaser.mjs` → `docs/previews/bbld_phaser.png`).

Warm-current coast = **no snow anywhere**: white / pastel stucco, terracotta and turquoise roofs, striped awnings, wood
decks, palms — but the same toy-like 3D look, palette family, camera, sun, PPU 64 and baked cool shadow as the village,
town and harbour sets (rendered with the unchanged `bl_common` / `bld_render` helpers).

Look-dev first: `resort_hotel` (the hero) went through three versions (flat-roofed tower → wide hotel under a
terracotta hip roof with a five-storey central tower and a turquoise dome), then `beach_cafe` (terrace moved to the
side so the service window reads), `icecream_shop` (lit interior), `hotel_pool`, and every other building was
checked at 1x and fixed (BBQ smoke hidden under a too-deep awning, aquarium glass too milky, arched windows whose glass
sat behind the frame, lifeguard stair). In the final pass every staff point was checked with a real townsfolk drawn
behind its overlay (the townsfolk are chibis ~1.45 m tall with their eyes at ~0.95 m):
- `beach_bar`: the thatch hid the bartender's head and the 1.1 m bar hid his face → roof raised to 2.75 m and stopped
  just in front of the counter, bar top lowered to 0.87 m, bartender one step closer — now his face shows over the bar.
- `beach_cafe` / `icecream_shop` (+`_x`): the barista / vendor stood off the camera's line of sight through the window
  (only an eye showed at the window edge) → moved onto that line (mirrored for `_x`); the ice-cream freezer was lowered
  and its awning made shorter and higher, the sneeze-guard glass removed (a transparent occluder can't be an overlay).
- `tourist_info`: the guide stood in the middle of the round kiosk, hidden by its wall → now right behind the window.
- `hotel_pool_water` (the baked fallback water): the Blender ripples read as white blotches → rebuilt in the packer
  as clear turquoise water over the pool floor (sun mosaic and tiles show through) with a drifting caustic net from
  `assets/water` `water_waves_b` (two layers moving on small circles in opposite directions = a seamless 6-frame loop).

## Keys (`sprites{}` in `assets/beach_bld/manifest.json`)
| key | 한국어 | what | special |
|---|---|---|---|
| `resort_hotel` (+`_x`) | 햇살 리조트 호텔 | 8.0 × 5.8 m, 4 storeys + a 5-storey peach tower with a turquoise dome; balconies with parasols, deck chairs, flowers and towels; lobby with arched windows + coral awnings; turquoise canopy with gold stars, red carpet, palms, concierge desk with bell + guest book, brass luggage trolley; rooftop marquee sign board (blank, bulbs, 5 stars) | `resort_hotel_night`, `resort_hotel_front`, `resort_hotel_glow` |
| `hotel_pool` | 호텔 수영장 | 6.4 × 4.6 m deck, 3.6 × 2.2 m pool (sun mosaic, ladder, slide), loungers with towels, parasols, towel shelf, lifebuoy, shower, palms | `waterPoly`, `hotel_pool_water` (6 f caustic loop) |
| `pension` | 바다 민박 | 2-storey lemon cottage, terracotta roof, bougainvillea pergola, balcony with towels on a line, bicycle, picket fence, house-and-heart sign | `pension_front` (balcony) |
| `beach_cafe` (+`_x`) | 파도 카페 | turquoise-roofed plank cafe, walk-up window (barista inside), iced-coffee roof sign, party bulbs, side terrace with 2 parasol tables | `beach_cafe_front` |
| `beach_bar` (+`_x`) | 코코넛 바 | thatched palapa, bamboo bar with 4 stools, bartender behind the bar, bottles + coconuts, tiki torches, bulbs, coconut-cocktail sign | `beach_bar_front` |
| `seafood_bbq` | 조개구이 | red shack, striped awning, charcoal grill with clams / scallops / fish, chef behind the grill, red lanterns, glowing live tanks, banners, side tables | `anims.work`/`grill` 4 f (smoke, flames, lanterns sway), `seafood_bbq_front` |
| `icecream_shop` (+`_x`) | 구름 아이스크림 | candy-striped kiosk, giant cone on the roof, sprinkles, mint awning, freezer counter of tubs (vendor inside), bench, cone sign | `icecream_shop_front` |
| `souvenir_shop` | 조개 기념품 | blue-roofed shop, shell sign, window with a snow globe of the frost village, postcard spinner, straw-hat stand, shell wind chime | |
| `swimwear_shop` | 튜브 가게 | sky-blue shop with a giant swim ring on the roof, swimsuit mannequin, swim-ring rack, flamingo float, beach balls | |
| `surf_shop` | 파도타기 서핑샵 | driftwood shack, teal tin roof, big surfboard on top, board rack, wetsuits, blank surf-school board | `workPoints` (students) |
| `convenience_store` (+`_x`) | 바닷가 편의점 | white box with a green-orange stripe fascia, lit shelves, chest freezer, drinks cooler, water packs, plastic tables + parasols terrace | |
| `lifeguard_station` | 인명구조대 | white/red base with rescue boards, yellow look-out room, wrap-around deck, stair, flag, loud-hailer, red-cross sign | `lookoutPoint`, `lifeguard_station_front` (deck railing) |
| `tourist_info` | 관광 안내소 | round kiosk with a parasol roof, "i" sign, beach map board, brochure rack (guide inside the window) | `tourist_info_front` |
| `restroom_shower` | 화장실·샤워장 | tiled block, blue / pink doors, pictogram sign, water tank, two outdoor showers on a grate, foot-wash tap, bench | `showerPoints`, `fxPoints.shower0/1` |
| `mini_aquarium` | 꼬마 수족관 | white building, wave roof, smiling whale, glowing glass tank (coral, sea grass, turtle, fish), ticket window | `anims.work`/`fish` 4 f (two schools cross the tank, bubbles), `viewPoints` |
| `beach_arcade` | 반짝 오락실 | lilac fun house, open entrance, two claw machines with plushies, coin booth, star marquee, bulbs | `anims.work`/`lights` 4 f chase |
| `beach_gate` (+`_x`) | 햇살 해변 입구 | rope-wrapped driftwood pillars, starfish, life rings, curved arch, BLANK sign board, smiling sun, pennants | `fxPoints.boardCentre`, `passage` |
| `beach_lamp` | 해변 가로등 | white post, turquoise nautical lantern | `lightPoints` |
| `string_lights_x` / `_y` | 전구 줄 | two posts, 4 m string of coloured bulbs (along X / along Y) | `anims.work`/`twinkle` 4 f |

`_x` variants (yaw 90, front = +X / screen down-right, for a coast along the other iso axis): `resort_hotel_x`,
`beach_cafe_x`, `icecream_shop_x`, `beach_bar_x`, `convenience_store_x`, `beach_gate_x`, plus `string_lights_y`. Their
visible side is the model's −X side (modelled for them); every point / poly is already rotated. Baked shadows can't be
flipped, so never mirror a sprite.

## Fields (all points = px offsets `[dx, dy]` from the anchor, as in the town / harbour sets)
- Every sprite: `anchor`, `frameSize`, `footprint`, `footprintM`, `footprintPoly` (round things: the square around the
  circle), `topPx`, `front`, `fxPoints`, `name` (ko/en), `zone`, `notes`.
- People: `doorPoint`/`doorDir`, `staffPoints`/`staffDirs` + `staffRoles` + `staffDepth: "front"` +
  `staffBehindOverlay` (indices of staff standing behind a counter / desk / deck railing), `customerPoints`/`Dirs`,
  `seatPoints`/`Dirs` (chairs / stools, seat height ≈ 0.45 m = townfolk2 `sit`), `balconyPoints`/`Dirs` (hotel 9,
  pension 2 — elevated), `lyingPoints`/`Dirs` (pool loungers), `swimPoints` (on the pool water plane),
  `viewPoints`/`Dirs` (aquarium glass), `showerPoints`/`Dirs`, `workPoints`/`Dirs` (surf students), `lookoutPoint`
  (lifeguard deck), `inPoint` (delivery pad for village goods: fish, bread, smoked meat, cans).
- Hotel staff: `staffPoints[0]` doorman at the door, `[1]` bellhop by the luggage trolley, `[2]` receptionist behind
  the concierge desk (`staffRoles` says so).
- **`staffPresets`** (top level): every role → an existing townsfolk preset, so the game can dress all staff today:
  doorman / bellhop / receptionist / housekeeper / lifeguard / icecream_vendor / beach_bar_staff / surfer →
  `beachfolk:<same name>`; barista, chef → `townfolk:barista`; clerk, attendant → `beachfolk:beach_bar_staff`;
  guide, ticket_seller → `beachfolk:receptionist`; owner → `beachfolk:beach_tourist`. `bbld_check` fails if a role
  has no entry.
- Night: `lightPoints` + `lightKinds` (lamp, window, sign, string, bulb, torch, lantern, tank) + `lightRadiusPx`;
  `night: {glow: "<key>_glow", blend: "ADD", tint: "#6B7AB8"}` (+ `frame: "resort_hotel_night"` for the hotel).
- Overlay: `overlay: "<key>_front"` on every sprite that has occluders in front of people (railings, desk, counters).
- Pool: `waterPoly` (visible water surface, near coping clipped), `waterRectPx`, `waterRectM`, `waterZ` (−0.12 m),
  `waterPalette: "pool"`, `waterShore: "quay"`, `waterOverlay: "hotel_pool_water"`.
- Anims: `anims.work` + a named alias (`grill`, `fish`, `lights`, `twinkle`, `ripple`), all frames share frameSize +
  anchor (swap in place, `spr:<key>:<anim>`).

## How the game should use them
1. **Load:** add `'beach_bld'` to `FRAGMENTS` in `src/core/Assets.js` (and to `LAZY_FRAGMENTS` — it is only needed at the
   beach). The night atlas `bbld_glow` can load lazily (manifest `lazyAtlases`). Sprite anims register automatically as
   `spr:<key>:work` / `grill` / `fish` / `lights` / `twinkle` / `ripple`.
2. **Place:** sprite at its anchor, depth = anchor y (like every building). Buildings face the sea on −Y (screen
   down-left) with their front footprint edge on the promenade; use the `_x` variants where the coast runs along Y.
3. **Staff and guests:** draw characters on `staffPoints` / `balconyPoints` at building depth d + 0.5 (dressed with
   `staffPresets[role]`), then the `overlay` sprite (same frame + anchor) at d + 1 — exactly what
   `src/entities/Register.js` already does for `shop_general` + `shop_general_front`. Customers / seats / doors are in
   front of the building and simply y-sort.
4. **Pool:** hand `waterPoly` (+ `waterZ`) to `src/systems/Water.js` (palette `pool`) at depth d + 0.25; with the
   Canvas renderer or `quality: 'low'` draw `hotel_pool_water` playing `spr:hotel_pool_water:ripple` there instead.
   Swimmers stand on `swimPoints` (add `fx_swim_ripple`), sunbathers on `lyingPoints`.
5. **Night:** tint every sprite with `night.tint` (multiply) and add `<key>_glow` (blendMode ADD, untinted) at the same
   position; the hotel instead swaps to `resort_hotel_night` (already graded — draw it untinted). `lightPoints` mark
   where extra `fx_glow` sprites / warm ground pools look good (`bbld_night.png` shows both).
6. **Text:** the blank boards (hotel roof sign, beach gate, surf school) have `fxPoints.boardCentre` — the game writes
   "햇살 리조트", "햇살 해변" etc. there. Smoke / steam / bell / sign / flag / shower points are in `fxPoints`.
7. **String lights:** chain `string_lights_x` every 4.0 m along X (step (+181, +91) px) and `string_lights_y` along Y
   (step (+181, −91) px).

## Scripts and how to rebuild
New scripts in `tools/blender/`: `bbld_lib.py` (warm-coast helpers), `bbld_assets.py` (registry + hotel, pool, cafe,
ice-cream shop), `bbld_assets2.py` (the rest), `bbld_render.py`, `bbld_pack.py`, `bbld_preview.py`, `bbld_check.py`;
plus `tools/test/beach_bld_phaser.mjs`. They only import the existing helpers (`bl_common`, `prop_lib`, `prop_assets`,
`life_assets`, `bld_assets`, `bld_render`, `town_lib`, `harbor_lib`, `harbor_assets`, `prop_pack`, `pack_utils`,
`townfolk_compose`, `townfolk2_compose`); no existing script or asset was edited.

```
/tmp/bvenv/bin/python tools/blender/bbld_render.py -- [keys|atlas|zone] [--force] [--samples N]
python3 tools/blender/bbld_pack.py            # atlases + manifest + previews (merge + guard)
python3 tools/blender/bbld_preview.py         # previews only (re-reads the render cache)
python3 tools/blender/bbld_check.py
node tools/test/beach_bld_phaser.mjs
```
- **No snow:** the shared helpers bake snow (window sills, roof slabs, `snowy()`, snow caps, drifts). `bbld_lib.warm()`
  swaps those functions for snow-free stand-ins *in memory, only while a beach build runs* (module attributes, restored
  afterwards) and `sweep_snow()` deletes any leftover snow mesh; the check script also scans for snow-albedo pixels.
- **Passes per build:** frames (idle + anim), pool water frames, a front-occluder mask (tagged railings / desk) and / or
  a plane mask (counter in front of a clerk, clipped to the clerk), and a night glow pass (only `night()`-registered
  and emissive materials glow, everything else black) — `bbld_pack` turns them into `<key>_front`, `<key>_glow`
  (with bloom), `resort_hotel_night` (day × tint + glow) and `hotel_pool_water` (caustic loop cut to `waterPoly`).
- Render cache `/tmp/fv_cache/beach_bld`; the full render took ~57 min on the shared CPU (plus ~17 min of re-renders
  for the staff fixes); reruns skip finished builds (`--force` to redo).
- The packer merges into the existing manifest and refuses (exit 1, nothing written) if a key of the current manifest or
  of `bbld_check.REQUIRED` would go missing; an empty manifest is never written; `--allow-partial` drops keys on
  purpose. Guard tested into scratch folders: an empty cache → abort, nothing written; a cache with only the gate and
  the lamp → abort listing the 36 missing keys, nothing written; the same with `--allow-partial` → a 4-sprite manifest.

## Previews (`docs/previews/`)
- `bbld_all.png` — every sprite at 1x, labelled with key + Korean name (idle + one anim frame, the hotel night frames,
  the pool with its fallback water).
- `bbld_scene.png` — a beachfront street at 1x: aquarium, hotel, pool, pension and convenience store behind, cafe,
  ice-cream, souvenir, swimwear, BBQ, arcade along a paved promenade; a boardwalk with lamps and string lights; on the
  sand the gate, info kiosk, surf shop, beach bar, lifeguard station, showers and a volleyball court; in the sea a
  swim-area buoy line, a raft, a swan pedal boat with riders, a banana boat and a kayak; behind the shops a back street
  with palms, lamps, a flower bed and a park with sea pines. People = existing `assets/townfolk` (+ `townfolk2` sit)
  in light summer clothes (in-memory presets in `bbld_preview.SUMMER`; turquoise uniforms for the hotel staff) at the
  sprite points (doorman, bellhop, receptionist, baristas, bartender, chef, lifeguards, guests on balconies, queues,
  seated guests). Sand / props / boats = `assets/beach`, the sea = a static look-alike of `assets/water` (tropical).
- `bbld_night.png` — the same street at night (tint + glow overlays + hotel night frame + warm lamp pools).
- `bbld_phone.png` — the day street as a 390 × 844 phone screen shows it at zoom 0.6 / 0.9 / 1.2.
- `bbld_anims.gif` (BBQ grill, aquarium fish, arcade lights, string lights), `bbld_pool.gif` (pool water loop),
  `bbld_hotel_daynight.gif` (hotel fading day → night), `bbld_phaser.png` (Phaser load test: 0.33x shelf + a 1x
  mini street by day and by night drawn the way the game should).

## Known issues
- The street preview ground (promenade, boardwalk, back street, lawn, sea) is drawn by the preview script as a stand-in;
  in the game the ground comes from `assets/beach` (sand) and `src/systems/Water.js` (sea and pool).
- The preview people are townsfolk in summer colours, not the new beachfolk (swimsuits, hotel uniforms) — the beach
  hotel / shop staff should use `staffPresets` once the game spawns beachfolk.
- `chef` has no dedicated preset yet (mapped to `townfolk:barista` with an apron); `owner` maps to a tourist look.
- Characters behind counters show from the chest / face up only (that is the chibi scale vs. a real counter height);
  the BBQ chef's face is partly behind a hanging lantern from this camera.
- `hotel_pool_water` is the low-quality fallback; the intended look is `Water.js` with the `pool` palette on
  `waterPoly`. The pool base sprite has no water by itself, so one of the two must always be drawn.
- `bbld_hotel` needs two sheets (`bbld_hotel`, `bbld_hotel_2`) because the hotel + `_x` + both night frames don't fit
  one 2048 sheet; both are listed in `atlases` (load all of them).
- Night frames exist only for the hotel; every other building uses tint + glow (as the contract asks).
