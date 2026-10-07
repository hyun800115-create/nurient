# Contract addendum v8 — the living city: logistics centre (cutaway), bank, police & petty crime, fire & firefighters, ruins → demolition → rebuild, moving in/out, city FX/UI, cityfolk, city audio, and the story-network engine

Extends CONTRACT.md … CONTRACT_V7.md (PPU 64, `bl_common` camera/light, 2:1 iso, manifest §2 format, paths relative
to `frost-village/assets/`). Design (Korean): `docs/기획서_v8_살아있는도시.md`. New fragments: `assets/logistics/`,
`assets/civic/`, `assets/fx_city/`, `assets/cityfolk/`, `assets/audio6/`; new code-only module tree `tools/story/`.
Tone: everything stays cute, warm and family-friendly (comic petty crime, cartoon dust-cloud fights, nobody is
ever hurt in a fire). Snowy town look (same palette, light, outline, toy materials as `assets/town`, `assets/vehicles`).

## AA. Logistics centre — `assets/logistics/` (Blender)
- `logistics_center`: a big warehouse (~11 × 8 m footprint) rendered as **aligned cutaway layers** sharing one anchor
  so the game can fade the outer shell to reveal the inside: `_floor` (floor, markings, rack bases), `_interior`
  (tall racks, conveyor, packing tables, office corner with desk + ledger, settlement counter), `_back` (back/side
  walls seen from inside), `_shell` (front walls + roof + signage, the part that fades; also a `_shell_cut` mid-fade
  frame optional). Anims: `conveyor` (8 f), `dock_door` (open/close 6 f, per bay), office lamp. Fields: `dockPoints`
  + `dockDirs` (truck/van bays), `forkliftPath` (point loop between racks and docks), `rackSlots` (per rack and
  shelf level: where the game draws stock-level item stacks, grouped by category: materials, food, goods,
  furniture, tools, appliances), `staffPoints` (pickers at racks, packer at conveyor, clerk at office, dock hand)
  with dirs, `customerPoints` (shop owners queuing at the settlement counter), `doorPoint`, `inPoint`,
  `footprintPoly`, `revealPoly` (screen-space polygon where tapping / hovering reveals the inside).
- Items (72×72 item conventions, `stackStep`, `carryScale`, `icon`): furniture `item_chair`, `item_table`,
  `item_sofa`, `item_bed`, `item_wardrobe`; appliances `item_fridge`, `item_stove_iron`, `item_washer`,
  `item_radio`, `item_tv_retro`; `item_toolbox`; crates `item_crate_food`, `item_crate_cans`, `item_crate_bread`,
  `item_crate_produce`; pallets `pallet_planks`, `pallet_ingots`, `pallet_logs`, `pallet_boxes`; `cardboard_box_s/m/l`.
- New producers for the chains (prop/building conventions, operator `workSpot`, `inPoint`/`outPoint`):
  `furniture_workshop` (planks → furniture; `anims.work`), `appliance_factory` (ingots → appliances; `anims.work`).
- Vehicles (assets/vehicles conventions, kind "vehicle", 2 rendered axis headings + mirror): `forklift` (idle,
  move, `lift` 6 f fork up/down; variants `_loaded` with a pallet; `cargoPoint`), `delivery_van` (3 colours),
  `moving_truck` (box truck; `unload` 6 f ramp + door), `pallet_jack` (prop pushed by a worker).

## AB. Civic & incidents — `assets/civic/` (Blender)
- `bank`: cutaway layers like the logistics centre (`_floor`, `_interior` with teller counters + glass, number
  display, waiting chairs, ATM, vault with `anims.vault` round door 8 f, `_back`, `_shell`); `staffPoints`
  (tellers, manager), `customerPoints` (queue), `atmPoint`, `vaultPoint`, `doorPoint`, `revealPoly`.
- `police_station` (bigger than the town's police_box; cutaway with desk and a cosy `jail_cell` with door anim;
  `cellPoint`, `staffPoints`, `doorPoint`, `carBayPoint`), `wanted_board` (notice board with 3 blank poster
  slots: `posterPoints` so the game draws portraits), `fire_hydrant`, `fire_alarm_post`.
- Fire aftermath: `ruin_s`, `ruin_m`, `ruin_l` (burnt shells matching plot sizes S/M/L: charred beams, soot,
  smoke-stained snow, still cute), `ruin_house_town` (burnt townhouse look), `scorch_decal_s/m/l` (ground
  decals), `rubble_pile_s/m/l`, `demolition_fence_x/_y`, `insurance_sign` (blank board).
- Demolition vehicles (vehicle conventions): `excavator` (idle, move, `dig` 8 f bucket swing with
  `bucketPoint`), `dump_truck` (idle, move, `tip` 6 f).
- Moving: `moving_boxes_stack`, `furniture_pile` (sofa + lamp + boxes on the snow, two sizes), `for_sale_sign`,
  `sold_sign`, `welcome_mat`.

## AC. City FX & UI — `assets/fx_city/` (procedural + optional Blender, fx/ui house style)
FX spritesheets: `fx_fire_bld_s/m/l` (building-sized flame loops with readable silhouettes), `fx_fire_window`
(flames licking out of a window), `fx_smoke_column` (tall dark-grey to light plume, loop), `fx_embers`,
`fx_hose_stream` (water arc in segments/frames so the game can aim from nozzle to target), `fx_water_mist`,
`fx_steam_puff`, `fx_fight_cloud` (comic dust cloud with stars, fists and feet poking out, loop), `fx_alarm_flash`,
`fx_siren_glow_red`, `fx_siren_glow_blue`, `fx_demolish_dust`, `fx_question_mark`, `fx_lightbulb_idea`,
`fx_memory_sparkle`. UI (96 px atlas `ui4_icons` + panels): bank (`ui_icon_piggy`, `ui_icon_loan`,
`ui_icon_interest`, `ui_icon_passbook`, `ui_icon_insurance`), story (`ui_icon_story`, `ui_icon_rumor` (ear),
`ui_icon_question`, `ui_icon_friend_new`, `ui_icon_memory`, `ui_icon_move_in`, `ui_icon_move_out`,
`ui_icon_newspaper`), police (`ui_icon_badge`, `ui_icon_wanted`, `ui_icon_cuffs_cute`, `ui_icon_thief`), fire
(`ui_icon_fire_alert`, `ui_icon_firetruck`, `ui_icon_hydrant`), logistics (`ui_icon_box`, `ui_icon_forklift`,
`ui_icon_settle` (receipt + stamp), `ui_icon_stock`); panels `ui_wanted_poster` (poster frame with a portrait
window), `ui_newspaper` (town paper "솔방울 신문" masthead + columns as 9-slice-friendly pieces),
`ui_passbook` (bank book), `ui_story_card` (rumour/news card, 9-slice).

## AD. Cityfolk — `assets/cityfolk/` (townsfolk paper-doll pipeline tf_* / tf2_*; same compact atlas format and
merge rules as townfolk2; must merge with townfolk + townfolk2 + beachfolk)
Existing townfolk parts already include `hat_police`, `det_police`, `hat_hardhat`, `det_hivis`, `det_tie` — reuse
them and add only what is missing: firefighter (`hat_fire_helmet`, `top_fire_coat` with reflective stripes,
`bot_fire_pants`, `acc_air_tank`), `top_police_v2` (winter police jacket + vest details), burglar (`top_stripes`,
`acc_eye_mask`, `hat_burglar_beanie`, `held_loot_sack`), banker (`top_suit_3pc`), teller (`top_teller_vest`,
`acc_visor`), warehouse/forklift (`top_work_jacket`, `acc_gloves`), delivery driver (`hat_delivery_cap`,
`top_delivery_polo`), mover (`bot_mover_overalls`, `acc_back_brace`), construction/demolition (`top_hivis_jacket`,
`acc_toolbelt`), reporter (`acc_camera`, `held_notepad`), detective (`top_trench`, `hat_deerstalker`).
New anims for ALL bases: `run` (8 f, 5 dirs), `flee` (8 f, 5 dirs, arms up — comic), `argue` (6 f, S/SE/E),
`fight` (6 f, S/SE/E, comic flailing for use inside `fx_fight_cloud`), `arrested_walk` (hands behind back, 8 f,
5 dirs), `spray_hose` (4 f loop, S/SE/E/NE with `nozzlePoint`), `point` (6 f, S/SE/E), `think` (4 f, S/SE/E),
`shocked` (4 f, S/SE/E), `phone` (4 f, S/SE/E), `carry_box` (front-hug a big box, 8 f, 5 dirs, `boxPoint`),
`sweep` (6 f, S/SE/E). Presets: firefighter, police_officer, detective, burglar, banker, bank_teller,
warehouse_worker, forklift_driver, delivery_driver, mover, construction_worker, demolition_worker, reporter.

## AE. Audio v8 — `assets/audio6/` (procedural, same loudness rules and loop fitting as audio1–5)
`sfx_siren_fire` (retro two-tone, loop), `sfx_siren_police` (loop), `amb_fire_big` (crackle + roar loop),
`sfx_fire_flare`, `sfx_hose_spray` (loop), `sfx_steam_hiss`, `sfx_collapse_soft` (cute timber collapse, no
violence), `sfx_excavator` (engine loop), `sfx_demolish_crunch`, `amb_construction` (loop), `amb_bank` (murmur +
counting machine), `sfx_coin_count`, `sfx_stamp`, `sfx_vault_door`, `amb_warehouse` (conveyor hum + distant
reverse beeps), `sfx_forklift_beep`, `sfx_police_whistle`, `sfx_crowd_gasp`, `sfx_crowd_cheer_small`,
`sfx_comic_fight` (pow/puff loop), `sfx_cuffs_click`, `sfx_fire_alarm_bell`, `sfx_moving_truck`, `sfx_box_drop`,
`sfx_newspaper`, `bgm_city` (busy upbeat town theme, same melodic family, 60–90 s loop), `bgm_chase` (comic
chase, 20–40 s loop).

## AF. Story-network engine — `tools/story/` (pure JS ES modules; no Phaser, no DOM; Node-runnable)
Deterministic (seeded) simulation of residents' social life that the game will import in v5: personalities and
traits, needs/mood, money (wallet, savings, loans), jobs and homes, an episodic **memory** store per resident
(event, who, where, when, sentiment, importance, source = seen / told-by / did; decay + consolidation), a
**relationship graph** (acquaintance → friend → best friend → sweetheart → spouse; rivalry and reconciliation),
**gossip propagation** along the graph (with mild exaggeration / distortion, rumours dying out), **questions**
(asking about unknown topics, answering from memory or "모르겠어"), meeting strangers, moving in/out (driven by
housing, jobs, happiness), the **bank** (deposits, interest, loans for shops/houses/rebuilding, defaults handled
gently), **incidents** (petty theft, queue-jumping, snowball-window, scuffles → police chase → arrest → apology and
release; wanted posters when not caught; fires with causes → fire brigade → ruin → insurance + loan → demolition →
rebuild), a daily **newspaper** digest, and a **dialogue generator**: natural Korean (and English) lines from a
large, data-driven grammar — thousands of templates and slot fillers over names, places, items, events, feelings,
memories, rumours and questions — with correct Korean particles (은/는, 이/가, 을/를, 과/와, (으)로, 이에요/예요 by
받침) and speech levels by relationship (반말 among friends/kids, 존댓말 to elders/strangers/the chief). The
engine exposes events/hooks the game can render (who walks where, who talks to whom, bubble text, emote, incident
start/end), a compact save/serialize, and must handle 200–400 residents cheaply (budget: ≤ 2 ms per game second
on a mid phone; measure in Node). Headless runner `node tools/story/sim.mjs --days 30 --residents 250 --seed N`
writes logs and metrics (unique lines, topic coverage, gossip reach/latency, relationships formed, moves, incident
rates) and `docs/story_samples.md` (Korean samples for the designer: conversations, rumours chains, a few
newspapers, one resident's 30-day diary).
