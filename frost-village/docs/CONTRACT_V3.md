# Contract addendum v3 — residents batch 2, new buildings, construction, boats, roads, territory

Extends `docs/CONTRACT.md` and `docs/CONTRACT_VILLAGERS.md` (all their rules apply: PPU 64,
`bl_common` camera/light, 5 render dirs + mirroring, manifest §2 format, paths relative to
`frost-village/assets/`). Design (Korean): `docs/기획서_v2.md`. Everything here goes into NEW
folders/fragments so nothing collides with existing assets. New fragments the game will load:
`assets/villagers2/manifest.json`, `assets/buildings/manifest.json`, `assets/ui2/manifest.json`,
`assets/audio2/manifest.json`.

## D. Residents batch 2 — `assets/villagers2/` (Blender, villager pipeline `vil_*`)
Same rules as CONTRACT_VILLAGERS §A (128×128, anchor (64,104), trimmed atlas `vil_<key>`, faces
with expressions, 1 px outline, palette-quantized, locomotion 5 dirs, social anims 3 dirs S/SE/E).
All have the 12 core human anims (idle, walk, carry_walk, happy, talk, laugh, wave, surprised,
angry, sad, hit, shiver). Keys, looks and extras:

| key | 이름 | look | extra anims |
|---|---|---|---|
| npc_clerk_a | 점원 미소 | bob hair, red-white striped apron, headscarf, name tag | serve (6f, 3 dirs: hand an item over a counter + nod), bow (6f) |
| npc_clerk_b | 점원 민호 | side-parted hair, green vest + bow tie, arm sleeves | serve, bow |
| npc_porter_a | 짐꾼 곰돌 | big & sturdy, headband, gloves, **A-frame back carrier (지게)** | run; carry_walk carries on the BACK (stack sits on the A-frame) |
| npc_porter_b | 짐꾼 다람 | small & quick, beanie, scarf, **big backpack frame** | run; back carry like porter_a |
| npc_captain | 선장 바다 | captain hat, white beard, navy pea coat with gold buttons | wave, sit |
| npc_chef | 요리사 쿡 | tall chef hat, white chef jacket, moustache | serve, dance |
| npc_postman | 우체부 | red cap, blue uniform, mail satchel | run |
| npc_doctor | 의사 선생님 | white coat over sweater, stethoscope, round glasses, scarf | sit |
| npc_painter | 화가 | messy tied hair, paint-splattered smock, palette in hand when idle | dance |
| npc_guard | 경비대장 | fur-trimmed helmet, padded armour vest, spear held upright | salute (6f, 3 dirs) |
| npc_skater | 스케이트 소녀 | ear-flap hat, sky-blue skating outfit, ice skates | skate (8f glide, 5 dirs), run, dance |
| npc_toddler | 아기 콩콩 | tiny (~0.85 m) in a snowman-like puffy onesuit | run (waddle), fall (6f plop-sit, 3 dirs) |

Porters: `carryPoint[dir] = [dx, dy, behind]` refers to the stack bottom ON THE CARRIER FRAME
(behind=true for S/SE/E because the frame is on the back; false for NE/N). Manifest gets
`"carryStyle": "back"` for porters (front-carry characters have `"front"`).
Clerks/chef `serve` has `impactFrame` (hand-over moment). Same manifest fields as batch 1
(`kind`, `role`, `name`, `traits`, `headTop`, `shadow`, `portrait`, anim `dirs`).

## E. New buildings, construction stages, boats, items — `assets/buildings/` (Blender)
New scripts `tools/blender/bld_*.py` reusing `prop_lib`/`life_*` helpers (do not edit prop_*/life_*).
Static props bake a soft shadow (shadow catcher + clean_alpha + border fade), anchor = footprint
centre, `footprint` [w,h] px, `topPx`, `kind`, and where useful `fxPoints`, `staffPoints`
([[dx,dy],...] where a clerk/worker stands), `inPoint`/`outPoint` (px offsets of the input/output
pad centres). Work anims 4 frames (idle frame + `anims.work`), visible motion like the existing stations.

Buildings (footprint in metres):
- `warehouse` (창고, 3×3): big log barn, open doors with crates/sacks; work = door/hoist moving.
- `station_cannery` (통조림 공장, 3×3): brick+timber workshop, conveyor with cans, steam; work anim.
- `shop_general` (잡화점, 3×3): shop with display shelves (cans, tools, jars), awning, counter with a cash register; `staffPoints` for the clerk behind the counter.
- `station_toolsmith` (대장간, 3×3): forge with glowing coals, anvil, tool rack (axes, picks); work = hammer sparks/glow.
- `house_a`, `house_b`, `house_c` (집, 2×2 – 2.5×2.5): three different cosy log/stone cottages with snowy roofs, chimneys (smoke via game fx at `fxPoints.smoke`).
- `watchtower` (망루, 2×2, tall ~5 m): log tower with a fire basket on top; idle = unlit, `anims.work` = fire burning (4f).
- `boathouse` (선착장 보트 창고, 3×2): wooden boathouse on the shore with a small pier.
- Staff overrides for EXISTING sellers: entries `market_counter_staff` = {"of":"market_counter","staffPoints":[...]} and `trade_post_staff` likewise (compute from prop_assets.py geometry; do not re-render).

Construction stages (generic, per footprint size S=2×2, M=3×3, L=4×4 m), all sharing the size's anchor:
`site_plot_S|M|L` (empty plot: stakes + rope + flattened snow), `site_foundation_S|M|L` (stone
foundation + a few planks), `site_scaffold_S|M|L` (half-built timber frame inside scaffolding,
ladder, plank piles). A finished building simply replaces the site sprite.

Boats (characters-style atlases `boat_<key>`, frame names `{anim}_{dir}_{i}`, 5 dirs, anchor =
waterline centre, NO baked shadow; the rower/crew is baked in):
`boat_rowboat` (나룻배, ~2.5 m, one fisherman rowing): `idle` 2f, `row` 6f loop.
`boat_fishing` (어선, ~4.5 m, small cabin, net boom, crew of 2): `idle` 2f, `sail` 4f loop.
Manifest under `characters{}` with `kind: "boat"`, `carryPoint`-like `cargoPoint` per dir.

New items (72×72, `kind: item`, `stackStep`, `carryScale`, icon-readable):
`item_can` (통조림), `item_fish_big` (참치), `item_axe`, `item_pickaxe`, `item_rod`, `item_sickle`, `item_bow`
(tools, each a single chunky tool), `item_toolbox` (generic tool crate).

## F. UI / ground / FX for v2–v3 — `assets/ui2/` (procedural, `tools/fx/gen_ui2.py` etc.)
Pads (iso 2:1 diamonds like the existing pads, colour-coded, engraved white symbol):
`ui_pad_clerk` (cash register), `ui_pad_porter` (crate on a back frame), `ui_pad_build` (hammer +
plus), `ui_pad_tower` (watchtower), `ui_pad_boat` (boat), `ui_pad_register` (the spot where the
chief/clerk stands to take payment).
Icons (atlas `ui2_icons`, 96 px like ui_icons): `ui_icon_zoom_in`, `ui_icon_zoom_out`,
`ui_icon_map` (overview), `ui_icon_hammer`, `ui_icon_house`, `ui_icon_people` (population),
`ui_icon_clerk`, `ui_icon_porter`, `ui_icon_tools`, `ui_icon_food`, `ui_icon_happy`, `ui_icon_lock_open`.
Build menu: `ui_card` (9-slice selectable card for a building choice) and `ui_card_selected`.
Ground: `ground_road` (seamless 512 packed-snow/cobble road texture, readable as a path between
zones), `road_edge` (soft alpha edge strip, seamless horizontally).
Territory: `fog_bank` (soft drifting snow-fog/blizzard wall, alpha, seamless horizontally,
~512×256) and `fog_puff` (particle for the clearing moment).
FX sheets: `fx_build_dust` (construction dust/hammer puff), `fx_build_done` (completion
sparkle burst with stars), `fx_wake` (boat wake ripple loop), `fx_fire_big` (tower fire loop).

## G. Audio — `assets/audio2/` (procedural, same toolkit/loudness rules as CONTRACT §8)
`sfx_hammer_1..3`, `sfx_build_done`, `sfx_saw_short`, `sfx_boat_horn`, `sfx_row`, `sfx_register`
(cash register for clerks), `sfx_tower_fire`, `sfx_fog_clear` (wind whoosh reveal), `sfx_chatter_1..6`
(cute babble syllables for talking villagers: 3 high, 3 low), `sfx_laugh_1..2`, `sfx_snowball_throw`,
`sfx_snowball_hit`, `sfx_dog_bark`, `sfx_cat_meow`, `sfx_penguin`, `sfx_lute` (short bard strum
loop, 8–12 s), `sfx_cheer` (small crowd cheer), music `bgm_spring` (warm spring theme for the
chapter ending, 60–90 s loop, same melodic family as bgm_village). Groups: `sfx_hammer`,
`sfx_chatter`, `sfx_laugh`.
