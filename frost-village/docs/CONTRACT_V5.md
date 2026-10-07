# Contract addendum v5 — vehicles by era, roads, missions & fame UI, life events (weddings, babies, farewells)

Extends CONTRACT.md … CONTRACT_V4.md (PPU 64, `bl_common` camera/light, manifest §2 format, paths
relative to `frost-village/assets/`). Design (Korean): `docs/기획서_v5_생활과미션.md`.
New fragments: `assets/vehicles/`, `assets/roads/`, `assets/ui3/`, `assets/life2/`, `assets/townfolk2/`, `assets/audio3/`.

## L. Vehicles — `assets/vehicles/` (Blender; characters-style atlases, kind "vehicle", NO baked shadow — the game draws a soft ellipse; 1 px ink outline like characters)
Vehicles drive only along the two iso ground axes, so render the 4 axis headings as 2 directions +
mirroring (document the dir names you use and the mirror map, e.g. `X+`/`Y+` with `X-`/`Y-` mirrored).
Anims: `idle` (2-4 f: engine/steam/horse breathing) and `move` (4-8 f loop: wheels/hooves/steam).
Fields: anchor (ground centre), `lengthM`, `widthM`, `seats` (passenger seat points per heading),
`cargoPoint` (where a cargo stack sits), `doorPoints`, `exhaustPoint`/`steamPoint`, `lightPoints`, `era`.
- Era 2 (읍): `horse_sleigh_bus` (two draft horses + covered sleigh coach, ~8 seats), `steam_wagon`
  (cute steam cargo wagon with crates), `dog_sled` (small), `cargo_sleigh` (hand/horse cargo sleigh).
- Era 3 (도시, round toy-like retro): `retro_bus` (village bus), `truck_cargo` (delivery truck with a
  visible cargo bed), `car_a` (round compact), `car_b` (sedan), `car_c` (pickup), `car_d` (wagon) — each
  car in 3 colour variants (`car_a_red`, `car_a_blue`, …) — plus `police_car`, `fire_truck`, `ambulance`.
  The chief must be able to drive `truck_cargo`: provide a variant with the chief visible in the cab
  (`truck_cargo_chief`).

## M. Vehicle buildings — `assets/vehicles/` sprites (Blender, prop conventions, baked shadows)
`stable_depot` (era 2 sleigh/horse depot), `sleigh_stop`, `bus_depot` (garage with 2 bays), `bus_stop`
(shelter + sign, blank board), `parking_lot_s` (4 stalls) / `parking_lot_m` (8 stalls) as ground pieces
with stall markings and `stallPoints`/`stallDirs`, `garage_small` (house garage), `fuel_depot` (retro
fuel/coal depot), `traffic_light` (3-state anim), `road_sign` set (blank boards).

## N. Roads — `assets/roads/` (procedural; numpy + Pillow; must read well beside ground_snow / ground_road)
Seamless textures and iso-aligned decals for three road classes: `road_dirt` (packed snow + ruts),
`road_cobble_wide`, `road_asphalt` (dark grey, light snow dusting); `sidewalk` (pale paving), `curb_x`/`curb_y`
edge strips, lane markings along both iso axes (`lane_x`, `lane_y`, dashed centre lines), `crosswalk_x`/`_y`,
`intersection` piece, `stall_lines`. Document how the game should compose a road segment along world X/Y
(widths in metres, layer order).

## O. UI v5 — `assets/ui3/` (procedural, house style of assets/ui)
Mission board panel pieces (9-slice `ui_mission_card`, `ui_mission_card_done`), icons (96 px atlas
`ui3_icons`): `ui_icon_mission`, `ui_icon_fame` (star medal), `ui_icon_title` (crown/ribbon),
`ui_icon_delivery` (truck), `ui_icon_request` (speech bubble with heart), `ui_icon_event` (party
popper), `ui_icon_goal` (target), `ui_icon_explore` (compass), `ui_icon_calendar`, `ui_icon_day`,
`ui_icon_night`, `ui_icon_ring` (wedding), `ui_icon_baby`, `ui_icon_flower` (farewell), `ui_icon_heart_pair`
(relationship), `ui_icon_steer` (drive), `ui_icon_timer`; title badges `ui_badge_rank_1..5`.

## P. Life-event props — `assets/life2/` (Blender, prop conventions)
`wedding_arch` (flowers + ribbons), `wedding_carpet`, `wedding_chairs` (rows, `seatPoints`),
`wedding_cake_table`, `flower_stand`, `ribbon_garland` (for the town hall front), `memorial_garden`
(gentle garden: stone path, flowers, a small tree, bench, 6 `stonePoints`), `memorial_stone` (small,
flowers at the base), `flower_wreath`, `baby_stroller` (characters-style atlas: idle/move in 5 dirs; a
baby visible, so a parent can push it), `cradle` (decor), `school_desk_row` (decor), items
`item_bouquet`, `item_cake`, `item_gift_box`, `item_letter`.

## Q. Townsfolk additions — `assets/townfolk2/` (townsfolk paper-doll pipeline `tf_*`)
New parts: `wedding_dress` (+ `veil`), `groom_suit` (+ bow tie), `flower_crown`, `mourning_coat`,
`black_hat`, `held_bouquet` (hand item). New anims for ALL bases: `sad` (4 f, S/SE/E), `clap` (6 f,
S/SE/E), `sit` (4 f, S/SE/E, seat height 0.45 m), `push` (walking while pushing a stroller, 8 f, 5 dirs).
Same compact atlas format / manifest conventions as `assets/townfolk` (merge rules documented).

## R. Audio v5 — `assets/audio3/` (procedural synthesis, same loudness rules)
`sfx_bus_horn` (retro), `sfx_truck_engine` (short loop), `sfx_car_honk_1..2`, `sfx_steam_whistle`,
`sfx_sleigh_bells` (loop), `sfx_horse_trot` (loop), `sfx_brakes`, `sfx_door`, `sfx_bell_hall`
(town-hall bell), `sfx_school_bell`, `sfx_baby_giggle`, `sfx_mission_done`, `sfx_fame_up`,
`bgm_wedding` (short joyful march in the village style, 30–45 s loop), `bgm_farewell` (gentle,
hopeful, 30–45 s loop), `amb_night` (winter night: soft wind, distant owl), `amb_town` (busy town
murmur).
