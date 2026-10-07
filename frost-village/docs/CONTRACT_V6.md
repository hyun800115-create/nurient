# Contract addendum v6 — the harbour city "갈매기 항구"

Extends CONTRACT.md … CONTRACT_V5.md (PPU 64, `bl_common` camera/light, manifest §2 format, paths relative
to `frost-village/assets/`). Design (Korean): `docs/기획서_v6_항구도시.md`. New fragments: `assets/ships/`,
`assets/harbor/`, `assets/audio4/`.

## S. Ships — `assets/ships/` (Blender; characters-style atlases, kind "ship", anchor = waterline centre,
no baked shadow, 1 px ink outline; headings: ships sail along the two iso axes like vehicles (2 rendered
dirs + mirroring, document names) plus an `S`-ish "arriving towards camera" heading if it reads better)
- `ferry` (passenger ship, ~16 m, two decks, portholes, funnel; `idle` 2f + `move` 4f with funnel smoke;
  `gangwayPoint`, `deckPoints` where passengers stand)
- `cargo_ship` (~22 m, cute chunky freighter with a crate/container deck and its own small crane;
  `idle`/`move`; `cargoPoints` for crate stacks the game can draw/hide)
- `trawler_big` (deep-sea trawler ~14 m, nets/booms, crew; `idle`/`move`/`haul` (net coming up))
- `tugboat` (small, fat, cute), `sailboat` (tourist sail), `yacht` (white, small)
- `seagull` (animated bird, atlas: `fly` 6f in 5 dirs, `glide` 2f, `land` 4f, `idle` 4f on a post)
- Scale must match: characters 1.45 m; ships big but toy-like.

## T. Harbour buildings & props — `assets/harbor/` (Blender, prop conventions, baked shadows)
`lighthouse` (tall, red-white, `anims.work` rotating light 8f), `pier_x` / `pier_y` (tiling wooden pier
segments along both iso axes like fence_log_x/y), `pier_end`, `breakwater` (stone segments), `bollard`,
`harbor_crane` (big gantry/jib crane with `anims.work` lifting a crate 8f; `hookPoint` per frame),
`container_stack` (a few colours), `crate_stack`, `barrel_stack`, `ferry_terminal` (waiting hall + gangway,
`boardPoints`, `waitPoints`), `customs_house`, `fish_auction` (open hall with fish crates, `staffPoints`,
`customerPoints`), `shipyard` (dry dock with a half-built hull, `anims.work` sparks/hammers), `harbor_market`
(stalls), `seafood_restaurant`, `sailor_lodge`, `harbor_warehouse` (big), `harbor_office`, `buoy`
(bobbing anim), `harbor_lamp`, `anchor_decor`, `net_rack`. Fields like the town set (doorPoint,
customerPoints, staffPoints, inPoint, fxPoints, footprintPoly).
Townsfolk presets (no new parts unless needed; document): dock_worker, sailor, auctioneer, lighthouse_keeper,
tourist (camera/backpack if parts exist) — add new parts only if essential (e.g. sailor cap, life vest).

## U. Audio — `assets/audio4/` (procedural synthesis, same loudness rules)
`sfx_ship_horn_big` (deep, warm), `sfx_ferry_bell`, `sfx_seagull_1..3`, `sfx_crane` (winch + clank),
`sfx_auction_bell`, `sfx_rope_creak`, `amb_harbor` (waves on pier, gulls, distant bells; seamless loop),
`bgm_harbor` (cheerful sea-shanty flavoured theme in the same melodic family as bgm_village, 60–90 s loop).
