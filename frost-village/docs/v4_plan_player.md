# v4 plan, player-experience first: "my village feeds the neighbours and the world grows around me"

Author role: v4 design proposal, player-experience angle. No game code was changed. The only other file written is the layout preview `docs/previews/v4_plan_player_map.png`.
Inputs: `docs/기획서_v4_이웃마을.md`, `docs/기획서_v5_생활과미션.md` §1/§5, `docs/CONTRACT_V4.md` §J–K, the build reports (town, townfolk, townfolk2, roads_ui, vehicles, life2, v35_build), the engine handoff doc 05, and the current `src/` (v3.5, about 15.7k lines).
Scope (from 기획서 v5 §5): neighbour town 솔방울 마을, snow train, routines for 100 people, shop founding and village growth, rank 마을 → 읍, and a road structure v5 vehicles can use.

---

## 0. TL;DR

1. **Nothing changes in the first 20 minutes.** v4 code and art stay dormant until the village is complete. The only additions before then are two rumour lines from residents, and they cost no assets. Village complete stays at 20.2 min ±0.5 for the smart bot.
2. **The v4 reveal rides on v3's first goal.** When `tower_east` is lit (about 21.5 min), the fog clears over the east coast **and** a new strip of land, `rail`. In that strip: a railway runs out of the eastern fog along the coast and ends at a snowed-in ruined station. Its pad reads **"서리역 고치기"**.
3. **First train at about 24 min.** Once the station is repaired, a toy steam train whistles out of the fog with 6 neighbours. They walk to **역전 시장**, a second market of ours on the station square, and buy our food.
4. **One loop, readable on one phone screen.** The station hub fits in 600×600 world px. It holds the train, the platform, the market counter with its queue, the **짐 싣는 곳** cargo pad, the **주문판** order board, the cash pad and the rent box.
5. **Our surplus finally has somewhere to go.** v3.5 lines are over-supplied from about 15 min. In v4, goods porters overflow into the cargo pad (logistics priority 30, below shelves and above the warehouse) and we are paid at a wholesale rate (70%).
6. **Orders found shops.** Each of up to 3 order cards is a neighbour asking to open a shop near our station, for example "빵 30개 보내 주시면 역앞에 카페를 열게요". Filling a card means a builder steps off the next train, a shop rises on a lot along **역앞 거리** in 25 s, the chief cuts the ribbon, and from then on the shop pays **rent** and buys our goods **wholesale**. There are five founding shops: 카페, 생선구이 식당, 목공소, 철물점, 슈퍼마켓. Each is gated by a line the player already runs: bread, fish+meat, planks, ingots+tools, cans.
7. **The neighbour town opens as a gift, not a toll.** The first shop opening brings 솔방울 마을's mayor, who invites the chief. The town's fog clears at once and the chief can walk there in about 4 s, or ride the train (P1). The town has 100 citizens with seeded paper-doll looks, daily routines, school bells, lunch rushes and lit streets at night.
8. **Rank 마을 → 읍 is the v4 finale (about 48–52 min smart, 53–56 min for the "think" bot).** It needs 3 bars: population ≥ 40 (the carpenter's houses add people), founded shops ≥ 5, and happiness ≥ 70 (how well we served the neighbours). When the bars are full, a **승격식** pad (3000 coins) appears. Paying it starts a 12 s ceremony: bells, confetti, cobblestones replacing the dirt roads, new lots and a badge.
9. **100 people stay cheap.** `TownSim` is pure JavaScript and simulates every citizen on a schedule. Only citizens near the camera are drawn as layered townsfolk sprites (cap 40 in town, 24 in the station district), and the sprites are pooled. Logic budget is +0.8 ms per tick and display objects +650.
10. **Memory is the main risk.** Today: 368 MB of textures at the start, 441 MB at peak. Art is gated by stage: the train and station at `tower_east`, adult townsfolk at the first train, everything else at the town visit. Road textures are bake-only, so they cost no GPU memory. Distant ground tiles are evicted. Projected peak is about 600–620 MB once the town is open, and an optional unloader brings the village steady state back to about 520–540 MB.

Layout preview: `docs/previews/v4_plan_player_map.png`. It shows the new `rail` and `town` regions, the track, both stations, the lots, the streets and every town building.

---

## 1. Experience pillars and guardrails

| Pillar | What the designer should feel on the phone | Design consequence |
|---|---|---|
| **Cause → visible effect** | "I sent bread, and now there's a café" | Every order card names the shop it creates and shows that shop's icon. The founding happens on screen, near the station, within 30 s of the card completing. |
| **The world comes to me** | People arrive, shop and leave on their own | Train shoppers buy at the station hub, which is on the player's screen when they're there. Rent and wholesale pile up in one cash spot. |
| **No dead time** | Something new every ~1.5 min | v4 goals are interleaved with v3 goals (§7). Order cards fill passively from surplus while the player does v3. The longest gap target is ≤ 2.0 min. |
| **No softlocks** | Never "what now?" with nothing to do | Every v4 requirement is producible by lines the player already has. There are always free lots, a happiness floor, and a fallback hint for every v4 state (§7.3). |
| **Calm early game** | v3.5's snappy first 20 min unchanged | v4 systems aren't constructed until `tower_east` is lit or a save already has it. No v4 art is requested before `tower_east`; only 9 small sounds load at village complete (tested, §9). |
| **Alive, not noisy** | Bustle without clutter on a 390 px wide screen | Caps: 2 chat bubbles on screen in town, 1 train toast per arrival (only the first 3 arrivals), and no train toasts while a banner shows. |

v3.5 behaviours that must stay exactly as they are: the tutorial and arrow (including the step-off pill and the register fix), labour, the dog, piles, saves v1→v4, lazy-load gates, every existing test, and the version string and settings flow.

---

## 2. The arc, minute by minute (bot timings in game minutes)

Baseline v3.5 after the review fixes: fish line automatic at 4.4 min, village complete at 20.2, v3 complete at 39.0 (smart). "Think" bots are about 1.5–3 min slower.

### 2.1 Before v4 (0–20 min): foreshadow only, no new assets
| When | What the player sees or hears | Cost |
|---|---|---|
| after `zone_mine` (~13 min) | A resident chat line now and then (`LINES.ko.rumor`): "동쪽 안개 너머에 기찻길이 있대!" / "옛날엔 기차가 다녔대요" | strings only |
| village complete (~20.2) | The existing celebration, plus a sub-line on the `v3`-goal banner: "동쪽 안개 너머에서 기적 소리가…". About 2 s later a faint `sfx_steam_whistle` plays, panned east at volume 0.25, followed by 3 grey `fx_smoke_puff`s drifting over the east fog wall | audio3 sounds queued at village complete (~0.5 MB) |

### 2.2 v4 proper
| t (smart) | Event | Player does | Player sees or feels |
|---|---|---|---|
| 21.5 | `tower_east` lit. Fog clears over `east` **and** `rail` | — | The camera pan (existing tower code) widens to show the coast, the rails running into the eastern fog, and a snowed-in grey station. Banner: **"오래된 기찻길을 찾았어요!"** / "기차역을 고치면 이웃 마을과 이어져요" |
| 21.6–24 | Station site, a v3-style `Site`: 500 coins, 14 planks, 4 ingots, 10 s | Pay the pad. Porters or the chief bring planks and ingots | Scaffold, dust, hammering. Then a bell, the station sign lights up, and the snow drifts on the track pop away |
| 24.0 | **First train** (scripted the first time only) | Watch, then serve | Camera focus for 2.5 s on the arrival: whistle → brakes → steam → doors (`sfx_door`) → 6 neighbours step down. Banner: **"솔방울 마을 사람들이 장 보러 왔어요!"**. The day/night clock starts at 08:00 |
| 24–25 | First station sale | Stand at the station register, as with the first sale in v1 | The register arrow appears only when someone is waiting to pay (v3.5 fix rule). The 역무원 pad (300) appears after this first sale |
| 24.5 | Order board opens with 3 cards: 카페 (빵 30), 식당 (생선구이 40 + 훈제고기 15), 목공소 (판자 50) | Nothing is required: porters overflow into the cargo pad. The chief can carry goods there to speed it up | HUD order chip, e.g. "🍞 12/30 → 카페", plus a world label over the cargo pad. Each item loaded flies into the wagon with a coin pop at 70% of its price |
| 25.5 | 역무원 hired (300) | — | The register runs on its own (clerk preset `station`) |
| 27.5 | **First order done → first shop** | — | `sfx_mission_done` and the card flips to done. The next train brings the café owner with an "!" bubble: "역앞에 카페를 열게요!". Two builders (`factory` preset, hard hats) put up a scaffold on `lotA1`, 25 s |
| 28.0 | **Ribbon cutting** | Step on the ribbon pad (free, 1 s) | Flower stands (`life2 flower_stand`) by the door, confetti, banner **"역앞 카페 개업!"**. The owner waves and starts selling. The rent box shows "+20/분" |
| 28.5 | **Invitation**: the mayor of 솔방울 arrives on the next train and walks to the chief | — | Bubble: "우리 마을에도 놀러 오세요!". The fog over `town` clears along the track (camera rides the rails east for 3 s, then comes back). Goal: **"솔방울 마을 가 보기"** |
| 29–31 | **Town visit** (goal completes on entering the town square) | Walk there in ~4 s with boots, or ride (P1) | The town pops in, building by building in order of distance. 100 people, a bell, banner: **"솔방울 마을에 오신 걸 환영해요 · 주민 100명"**. If it's 08:00–15:00, the school bell rings and kids run out at recess |
| 31–44 | v3 goals continue (toolsmith, boathouse, south, warehouse, cannery, store, se, fishing boat), interleaved with v4: station porter (600), 철물점 founding (needs tools: toolsmith), 슈퍼마켓 founding (needs cans: cannery), 목공소 → first house on `lotH1` (20 planks, 30 s, +4 people move in) | v3 as before, plus ribbons and lots | Shops line 역앞 거리, the station square gets busier, and evening falls with lamps coming on |
| ~39–41 | 5 shops founded | — | The rank chip's shop bar fills |
| ~42–45 | v3 complete (existing celebration) | — | — |
| ~44–48 | Population reaches 40 (village 25–33 + houses + shop owners) | Feed the carpenter planks | Each house: "새 이웃이 이사 왔어요! (+4)" |
| **~48–52** | **승격식 pad** (3000 coins) → **rank 읍** | Stand on the pad | The ceremony (§5.6). After it: cobble roads, 3 more lots, auto-collected rent, a second passenger coach, a new title |

Targets for the bot acceptance runs are in §9.

---

## 3. Map: two new regions east of the v3 land

### 3.1 Regions and world size
- `WORLD.width` 3000 → **6144** (exactly 6 ground tiles of 1024). Height stays 3450.
- New regions in `WORLD.territory`:
  - `rail: { rect: [3000, 0, 4150, 3450], name: 'r_rail', center: [3420, 1560], openWith: 'east' }`. It opens at the same moment as `east`, from the tower_east beacon.
  - `town: { rect: [4150, 0, 6144, 3450], name: 'r_town', center: [4900, 2500], openFlag: 'townInvite' }`. It opens on the invitation flag, not a tower.
- Existing regions keep their rects. **No v3 plot, tower, node or building moves.**
- `borderTrees` gets an optional 7th field `until`, a region id: the trees disappear once that region is open.
  - `[2880, 300, 3000, 1500, 100, 'east', 'rail']`
  - `[2880, 1500, 3000, 3450, 100, 'se', 'rail']`
  - New: `[3000, 3380, 4150, 3450, 115, 'rail']`, `[4150, 3380, 6144, 3450, 115, 'town']`, `[6024, 300, 6144, 3450, 100, 'town']`
- Remove `regionTrees [2720, 1240]`, which sits on the new link path. `[2950, 1150]` is 3 cells from the track and can stay.

### 3.2 The iso lattice (the roads kit grid)
All v4 geometry sits on the roads-kit lattice (√2 m cells), with origin **G = (3120, 1315)** on the track:

```
L(i, j) = (3120 + 64·(i + j), 1315 + 32·(i − j))      i along iso X (screen down-right), j along iso Y (up-right)
```

- The track is the line **j = 0**. Rail tile anchors sit at `L(k, 0)` for k = −1…47, with a buffer stop `rail_x_end_n` at k = −1 → (3056, 1283).
- The east end runs out of the world at x 6144. That's where the v6 harbour line continues; see §12.
- Pedestrian crossings use `rail_x_crossing` at **k = 7**, two cells past our platform's east end (3568, 1539), and **k = 32 and 33**, the town avenue (5168, 2339) and (5232, 2371). k = 7 rather than 5 so the standing train never covers the crossing, even with the second passenger coach added at 읍 (the train's east end then reaches about i 6.5).
- Buildings face −Y (the town set's `front: "-Y"`), so every row of buildings faces an X-street on its −j side.
- The track runs about 380 px inland, parallel to the coast (the coast slope east of x 1880 is about 0.5). That leaves a clean snow and sea strip for the future Water module's shore types (§12).

### 3.3 Coordinates (validated: no overlaps, inside regions with a 46 px inset, ≥ 60 px from the sea, nothing inside the v5 road reserve)
Anchor = footprint centre (town manifest convention). Script and checks: scratch `v4_player/layout3.py`.

**Station district (`rail`)**

| id | sprite | lattice (i, j) | px anchor | notes |
|---|---|---|---|---|
| our_station "서리역" | `train_station` | (2.5, 2.03) | (3410, 1330) | trackPoint (3280, 1395). Train stops heading NW (arrival): engine (3174, 1342), car_a (3280, 1395), car_b (3382, 1446) |
| stn_market "역전 시장" | `market_counter` | (6.4, −2.3) | (3382, 1593) | queue runs −Y then turns +X, like the plaza market |
| cargo_pad "짐 싣는 곳" | pad 1.6 m | (3.9, −1.75) | (3258, 1496) | next to car_b, the goods wagon |
| order_board "주문판" | `notice_board` (life_props) | (3.6, −3.3) | (3139, 1536) | world prop. Stepping near it opens the order panel |
| cash_pad | pad 1.5 m | (8.3, −1.6) | (3549, 1632) | station market sales + wholesale + card bonuses |
| rent_box "임대료 상자" | pad 1.2 m | (8.2, −3.5) | (3421, 1689) | rent from founded shops |
| clerk / porter hire pads | pads | (6.0, −1.3) | (3421, 1549) | one after another on the same spot (the v3.5 line rule) |
| lotA1–A3 (M) | shop lots | (10.4 / 13.0 / 15.6, −2.45) | (3629,1726) (3795,1809) (3962,1893) | face 역앞 거리 |
| lotB1–B4 (M) | shop lots | (10.2 / 12.8 / 15.4 / 18.0, −9.1) | (3190,1933) (3357,2016) (3523,2099) (3690,2182) | face 뒷골목 |
| lotB5 (L) | shop lot | (20.9, −9.3) | (3862, 2281) | the supermarket lot (4.4×3.4 m) |
| lotH1–H6 | house lots (2.6 m) | (14.0 / 16.1 / 18.2 / 20.3 / 22.4 / 24.5, −13.1) | (3178,2182) (3312,2249) (3446,2317) (3581,2384) (3715,2451) (3850,2518) | the carpenter builds `townhouse_a..d` here |

**Neighbour town (`town`)**: 21 buildings plus props

| row (faces) | buildings, lattice i at j | px anchors |
|---|---|---|
| town station | `train_station` (28.0, 2.03) | (5042, 2146). trackPoint (4912, 2211). Westbound stop (heading NW): engine (4806, 2158), car_a (4912, 2211), car_b (5014, 2262) |
| row A (j −2.45, faces 솔방울 큰길) | cafe 21.6, playground 24.4 (j −2.3), park_fountain 28.0 (j −2.5), sled_stop 30.6 (j −3.1), toy_shop 35.2, bookstore 37.8, clothing_store 40.4, flower_shop 43.0, hair_salon 45.6 | (4346,2085) (4534,2169) (4752,2291) (4880,2393) (5216,2520) (5382,2603) (5549,2686) (5715,2769) (5882,2853) |
| row B (j −9.6, faces 학교길) | restaurant 30.0 (west of the avenue), school 36.4, town_hall 40.6, post_office 43.8, clinic 46.6, police_box 49.0, fire_station 51.6 | (4426,2582) (4835,2787) (5104,2921) (5309,3024) (5488,3113) (5642,3190) (5808,3273) |
| row C (j −15.3, faces 아파트길) | apartment_a 35.6, apartment_b 39.0, apartment_a 42.4, apartment_b 45.8 | (4419,2944) (4637,3053) (4854,3161) (5072,3270) |
| street props | streetlight every 4 cells along 큰길 and 학교길 (south side), streetlight_double at both track crossings, bench_x by the fountain and in front of the school, `town_gate_x` / `town_gate` (whichever spans across an X street) with board "솔방울 마을" at L(19.5, −6) = (3984, 2131) | |

Where the 100 people live: apartment_a ×2 at 24, apartment_b ×2 at 18 (84), 7 shopkeepers above their shops, the mayor's family of 3 in the town hall, 2 in the fire-station dorm, 2 in the station house, 2 in the clinic flat. That makes 100. The district citizens (founded-shop owners, house residents) are extra, and they live in our station district.

**Streets** (lattice rects; cells are tagged with the region of their centre and baked only when that region is open, so a road can lead into the fog).
- The roads kit's one-lane village track is 2 cells. A two-lane carriageway is 4 cells, with edges and the centre line on even grid lines.
- **The main street gets a two-lane reserve now**: paved 2 cells in v4 (`road_dirt`), and the 4 reserve cells are kept free of buildings so v5 can repaint them as a two-lane road without moving anything.
- Side streets stay one-lane tracks, enough for one-way or village traffic in v5.

| id | i range | j range | kind |
|---|---|---|---|
| link_west "역 가는 길" | −6.6…3.0 | −1.4…−0.6 | 1-cell footpath from `e_east` (2560,1180) via (2640,1139) to the square. It passes 1.8 cells from `tower_se` |
| stn_square "역 광장" | 3.0…9.0 | −4.0…−0.75 | paved square (`sidewalk` texture) |
| stn_street "역앞 거리 → 솔방울 큰길" (X street) | 5.0…50.0 | paved −7…−5, **reserve −8…−4** | road; vehicles' main route in v5 |
| back_lane "뒷골목" | 10.0…25.0 | −12…−11 | walk (lotB fronts) |
| house_lane | 13.5…27.0 | −16…−15 | walk (lotH fronts) |
| street_b "학교길" | 30.5…53.0 | −14…−12 | road |
| street_c "아파트길" | 34.0…46.5 | −19…−17 | road |
| ave_town "솔방울 중앙로" (Y street) | 31.5…33.5 | −17…0.6 | road; crosses the track on 2 `rail_x_crossing` tiles, k = 32 and 33 |

**Routing nodes** to add to `WORLD.roads.nodes`, with edges tagged `region: 'rail' | 'town'`. Porters, shoppers, residents and citizens all use the existing `Roads` A*:
- `v_link_w` (2640,1139), `v_link_e` (3248,1443), `v_cross` (3568,1539), `v_square` (3299,1558), `v_st_0` (3088,1683), `v_st_10` (3376,1827), `v_gate` (3856,2067)
- `v_back_0` (3088,2035), `v_back_1` (3952,2467), `v_house_0` (3088,2291), `v_house_1` (3824,2659)
- `t_track` (5200,2355), `t_sq` (4790,2381), `t_cross` (4816,2547), `t_a_e` (5872,3075), `t_b_x` (4368,2771), `t_b_e` (5552,3363), `t_c_w` (4176,2995), `t_c_e` (4912,3363)
- edge: `e_east`–`v_link_w`

The graph grows from 47 to about 70 nodes. A* stays a linear scan, which is fine at this size.

---

## 4. Systems: file by file

The rule throughout: **one orchestrator** keeps `Game.js` changes small. `Game.build()` creates `this.v4 = new Neighbours(this, sv.v4)` only when `east` is open, or lazily on the `region` event for `east`.

### 4.1 New modules

| File | Owns | Key API / data |
|---|---|---|
| `src/systems/Neighbours.js` (~350 lines) | Wires Rail, Train, StationHub, Orders, Founding, TownSim, Clock and Rank. Owns the v4 lazy-load gates and v4 events (`'train'`, `'order'`, `'founded'`, `'rank'`) | `update(dt)`, `serialize()`, `state()` (for `__FV`), `onRegion(id)`, `onStep(id)` |
| `src/systems/Rail.js` (~220) | Track geometry on the lattice, station stop points (from `trainStops` + mirror), timetable state machine | `pos(s)` (arc length → px), `stops = {ours, town}`. Phases `toOurs, atOurs, toTown, atTown`, each `{t, dur}`. Ease in/out over the last and first 120 px |
| `src/entities/Train.js` (~260) | 3 car sprites (`train_engine`, `train_car_a`, `train_car_b`, plus a second `car_a` at 읍) with baked shadow frames, heading SE/NW. Steam (`fx_smoke_puff` at `smokePoint`), lamp glow at night (`lampPoint`), whistle, brakes, doors. **Run-around at both terminals**: a 0.5 s puff of steam hides the engine, then it reappears at the other end and the consist order flips. This toy-train trick avoids turntables or a loop | `setPhase()`, `update(dt)`, `cars[]`, `passengers` (ids), `cargo` (item counts, visual crates at `cargoPoint`). Anim fps = 12 × speed / 166 |
| `src/systems/StationHub.js` (~300) | Our station: the ruin → site → open lifecycle; 역전 시장 (a `Market` instance with `id: 'station'`, goods `FOODS + item_can`, sink priority SHELF); the cargo pad sink (priority **WHOLESALE 30**); cash pad; rent box; clerk and porter pads; platform walk polygon (`platformPoly`, lift 18 px) | `cargoSink`, `market`, `cash`, `rent`, `boardShoppers(list)`, `alight(n)` |
| `src/systems/Orders.js` (~230) | Up to 3 cards. Card = `{id, shop?, need:{item:n}, got:{item:n}, bonus}`. Founding cards follow `BALANCE.v4.founding.order` (first the 5 shops in order, filtered by available lines). After that, "정기 납품" cards from `BALANCE.v4.orders.standing` | `accept(item)` (counts and pays wholesale), `complete(card)`, `swap(card)` (free after `swapAfter` s without progress), `focus()` (the card for the HUD chip) |
| `src/entities/Shop.js` (~260) | A founded shop on a lot. States `request → build → ribbon → open`. The owner stands at `staffPoints[0]`. Shoppers queue at `customerPoints`. Shelf stock is a logistics sink (priority **SHOP 35**) paying wholesale on delivery. Rent ticks into the rent box. The carpenter variant builds houses on lotH (20 planks → 30 s → `townhouse_*` + 4 residents) | `serialize() {lot, shop, st, t, stock, built}` |
| `src/core/Townfolk.js` (~420) | Port of `tools/townfolk_compose.js` and `townfolk2_compose.js` merge helpers (townfolk2 is not loaded in v4, but the merge code comes over unchanged). Changes: (1) a **per-sheet lazy loader**: compact atlases are installed as each image arrives; (2) `generate(rng, {ages})` restricts to loaded bases; (3) a `TownfolkPool` of `TownfolkSprite`s (re-dress = `person = p; refresh(true)`); (4) drawing is skipped when a layer's atlas isn't loaded | `Townfolk`, `TownfolkSprite`, `TownfolkPool.take(person)/give(spr)`, `TF.ready(base)` |
| `src/entities/TownfolkBody.js` (~180) | A **Character-compatible wrapper** around a pooled `TownfolkSprite`: `x, y, dir, headTop, shadow (fv_shadow 46×18), sprite proxy (setVisible/setAlpha/setTint over all layers), play(anim) with fallbacks (carry_idle→idle, run→walk, sad→idle + emote_tear), face(vx,vy), locomotion(), sync(dt), carryOffset()` using `bases[b].carryPoint` | Lets `Customer`, `Bubbles` and `moveAgent` work unchanged with townsfolk |
| `src/systems/TownSim.js` (~480) | 100 town citizens + district citizens (shop owners, house residents). Deterministic generation from `BALANCE.v4.town.seed`. Daily schedules (§6). Abstract movement off-screen. **Materialization** in view, plus a 220 px margin, capped. Riders on the train. Set pieces (school bell, lunch bell, after-school rush, evening lamps) | `citizens[]` (see 4.4), `update(dt)` at 4 Hz abstract + per-frame for live ones, `materialize()`, `riders(trainStop)` |
| `src/systems/Clock.js` (~170) | Game clock and day/night. A full-screen MULTIPLY overlay (one `Rectangle`, camera-sized) at depth `DEPTH.FX − 30`. ADD-blend glow sprites (`fv_glow`, generated radial texture) for streetlights (`fxPoints.light/lightA/lightB`), the town gate lanterns, the station lamp, the train lamp, campfires, and the chief's lantern at night (P1). Settings toggle "낮과 밤" | `hour()`, `phase()` ∈ dawn/day/dusk/night, `onHour(h, fn)`, `serialize()` |
| `src/systems/Rank.js` (~200) | Stats: `people` = `life.people()` + district citizens; `shops` = founded and open; `happy` = rolling satisfaction. Rank state (1 마을 → 2 읍; 3 도시 is v5). The 승격식 pad, the ceremony script, rewards | `bars()`, `canRankUp()`, `ceremony()` |
| `src/systems/RoadGrid.js` (~240) | Lattice cell map for v4 land: `Uint8Array` cells, 0 = snow, 1 = dirt, 2 = cobble, 3 = asphalt (v5), 4 = sidewalk/square. Cells come from `WORLD.v4.streets`, and `repave(era)` changes them. **Bake hook** for `Ground`: draws road textures as Canvas patterns anchored at G (scale 1), then `snow_edge_*` / `curb_*` decals from `roads_decals`, following the manifest's `roadKit` rules. Images are loaded as **bake-only `HTMLImageElement`s**, so they cost no GPU memory | `cellAt(x,y)`, `bake(ctx, x0, y0, w, h)`, `repave(era)` → `Ground.invalidate(rect)` |

### 4.2 Changes to existing files

| File | Change |
|---|---|
| `src/scenes/Game.js` | **build():** if `territory.isOpen('east')`, create `this.v4`, otherwise subscribe to `region`. **tick():** `if (this.v4) this.v4.update(dt)` after `life`. **serialize/restore:** `v4: this.v4 ? this.v4.serialize() : sv.v4`, so an unloaded v4 block passes through. **`lazyAllowed(k)`:** v4 gates (§8.2). **`fitZoom`/`toggleOverview`:** frame the *area* the chief is in (`village` = start+east+south+se; `neighbours` = rail+town), so the whole-map overview doesn't shrink to 0.12×. **Hooks:** `__FV.state().v4`, `__FV.v4.*` (§9). Ambience: `amb_town` scaled by live citizens; `amb_night` at night. **No change before the east region opens.** |
| `src/systems/Territory.js` | `openWith` (`rail` follows `east`, also when restoring a save) and `openFlag` (`town` opens on `progress.flags.townInvite`). `borderTrees … until`. `areaRect(area)` for the overview. Fog: no change, since regions stay rects |
| `src/systems/Ground.js` | (1) `invalidate(rect)` drops baked tiles so `ensure()` re-bakes them; used when rail/town atlases or road textures arrive and when repaving. (2) **Tile eviction (LRU)**: keep at most `BALANCE.v4.ground.maxTiles` (16) baked tiles and evict those farthest from the camera; a re-bake costs 25–60 ms and is spread at 1 per frame, as `ensure` already does. (3) Bake calls `RoadGrid.bake` and draws rail tiles (`town_rails` frames via `drawFrame`) into the tile. The baked track gets snow drifts until the station is repaired. (4) The sea `tileSprite` width follows `WORLD.width`, nothing more. **Water integration seam:** move the sea creation into `makeSea()` unchanged, so the later `Water.js` swap touches one method. No import of `Water.js` |
| `src/systems/Collision.js` | No API change. New buildings call `collision.add` with 2–4 circles along the footprint's long axis (helper `addFootprint(def, x, y)`). The train is **not** an obstacle for the chief. Instead it stops 90 px before an obstacle on the track (chief, dog, a citizen) and whistles (§7.3) |
| `src/systems/Progression.js` | New step types: `station` (the repair Site), `stationClerk`, `stationPorter`, `lot` (lot-clearing pads after 읍), `rankPad`. New goal kinds: `build:station`, `flag:firstTrain`, `flag:townVisit`, `shops:N`, `people:N`, `rank:N`, all `passive` except build/visit. **GOALS split**: `GOALS_V3` (unchanged list, drives `v3Complete` and `celebrate3` exactly as today) + `GOALS_V4` (§7.1). `nextGoal()` walks the merged order but **skips passive goals that are in progress**, so a slow order card never hides the next v3 pad |
| `src/systems/Tutorial.js` | New hints (§5.2). `cashes()` includes the station cash pad and rent box. `registerHint` includes the station register. `v3Hint` gets `v4Hint(set, idle)` after it. `goalText()` knows the v4 goal keys |
| `src/scenes/UI.js` | Rank chip, order chip, clock icon, order panel, rank panel, train edge icon, and the night-safe banner background (§5.4) |
| `src/entities/Seller.js` | `Market`: config fields `id`, `goods`, `spawnEvery: 0` (station market: no random spawns; shoppers come from TownSim), `onServed(c, frac)` for happiness, `patience`. `Customer`: optional `body` (a `TownfolkBody`) instead of creating a `Character` sprite. **Plaza market unchanged.** After the station opens, `customers.spawnEveryLate` still applies there. Station shoppers are extra, not a replacement |
| `src/entities/Register.js` | Optional `bodyFactory` in the config, so the station clerk can be a `TownfolkBody` with the townsfolk `station` preset. Falls back to `npc_clerk_a` while townsfolk art is loading. Payment logic is unchanged |
| `src/entities/Worker.js` | `Porter` and `WarehousePorter` already ask `Logistics.best()`, so the new sinks just work. `StationPorter` (new class, ~60 lines, extends `WarehousePorter`): home at the station, pulls from the warehouse and station outputs **only for station sinks** (station market, cargo, shops, carpenter), so the long east trip is covered even without a warehouse |
| `src/systems/Logistics.js` | `PRIO.SHOP = 35` (founded shop shelves), `PRIO.WHOLESALE = 30` (cargo pad, only up to the open cards' remaining need, so the warehouse keeps working) |
| `src/systems/VillageLife.js` | `rumor` lines (§2.1). Residents cheer (`emote_star`) at the first train and at shop openings within 600 px. `people()` stays village-only; `Rank` adds district citizens. New areas `stn_square` and `town_sq` are **not** added for v2 residents (keeps their LOD budget). P1: 2 residents per day ride the train to the town |
| `src/core/Assets.js` | `FRAGMENTS` += `'town', 'ui3', 'life2', 'audio3'` (kept as a quoted string array for the build regex). `LAZY_FRAGMENTS` += `'town', 'ui3', 'life2'`. Only `life2_wedding` (the ribbon `flower_stand`s, 1.6 MB GPU) is allowed by the gate, at the first card completion; the other life2 atlases are v5. New `CUSTOM_FRAGMENTS = ['townfolk', 'roads']`: the manifest is loaded and files are packaged, but the generic loader doesn't queue them (`Townfolk.js` and `RoadGrid.js` load their own). `isDeferredAudio` += `/^(sfx_(steam_whistle|brakes|door|school_bell|bell_hall|mission_done|fame_up)|amb_(town|night))$/`. `isUnused` excludes the other audio3 keys (`bgm_wedding/farewell`, vehicle loops) so they are never fetched in v4 |
| `src/core/Save.js` | SAVE_VERSION 5 (§4.5) |
| `src/data/*` | `balance.js` (§4.6), `balanceCheck.js` covers every new key, `world.js` (`WORLD.v4` + regions + borderTrees + roads), `strings.js` (ko + en, §4.7), `version.js` → `'v4'` |
| `tools/build/build_artifact.mjs` | Package `CUSTOM_FRAGMENTS` folders (read with the same regex style). File count 339 → about 400; still 2 publish batches, with the boot files in the last batch as today |

### 4.3 Station hub details
- **Ruin state** before repair: the `train_station` sprite tinted `0x9aa6b4` at alpha 0.85, 3 `decal_snow_drift_*` on the platform, no lamp. The pad is a v3 `Site` with `kind: 'station'` and a custom footprint (7.2×4.4 m). Its drop pad sits at the square's north corner (3270, 1470).
- **Repair finish**: tint clears over 0.6 s, `fx_build_done`, then `sfx_bell_hall` (one strike) and the drift decals pop. Then `Neighbours.firstTrain()` is scheduled 3 s later.
- **Platform**: citizens walk on the `platformPoly` and are lifted 18 px. Alighting happens at `boardPoints` (3 doors), with a 0.25 s stagger and a fade-in at the door. People step off the platform's east end (i ≈ 4.8, clear of the station footprint, which ends at i ≈ 5.05) and leave through the crossing at k=7 → `v_cross` → square.
- **역전 시장**: a `Market` with `maxQueue: 8`, goods `item_fish_cooked, item_bread, item_meat_cooked, item_can`, and `shelfMax: 30` per type. Townsfolk wants: 2–5 items, weighted toward their favourite food (`citizen.fav`).
- **Cargo pad**: accepts any item an open card still needs. Loading is visible: items fly into car_b when the train is in, otherwise onto a crate stack at the pad that is loaded at the next arrival. Each item pays `price × 0.7` into the cash pad. When a card completes, `bonus × Σ(need × price)` pays out on top.
- **Rent box**: `Σ shop.rent / 60` coins per second, capped at `rent.box` (2000). It shows `+N/분` and a coin spin. From 읍 onward rent goes straight to coins (`economy.add` with a fly to the HUD every 15 s).

### 4.4 TownSim data (pure JS, testable in Node)
```js
// one citizen (~120 bytes; 130 total)
{ id: 17, person: {base, look, preset, parts, face, nose, colors},  // Townfolk.generate, seeded by (seed, id)
  name: '민지', age: 9, kind: 'student',          // student|teen|shopkeeper|civic|adult|elder|builder
  home: 'apartment_a#1', work: 'school', fav: 'item_bread',
  sched: 0,                                        // index into BALANCE.v4.townLife.templates[kind]
  act: 3, at: 'school', route: null, r0: 0,        // current activity, place id, polyline + start time
  live: null,                                      // TownfolkBody when materialized
  visits: 0 }                                      // our village visits (regulars "단골" ≥ 3)
```
- **Places** come from manifest points: `doorPoint`, `staffPoints`, `customerPoints`, `gatherPoints`, `playPoints`, `seatPoints`, `waitPoints`, `boardPoints`. Each place has a capacity and an `occupied` counter so people don't stack.
- **Movement**: routes come from `Roads.route()` and are cached per (from, to) place pair (up to ~600 entries). Position at time t = arc length `speed × (t − r0)`. Citizens are **never** in `gs.agents`, which avoids the O(n²) separation cost. Each one gets a seeded lane offset of ±10 px instead.
- **Materialization**: each frame, the candidates are citizens outdoors within `view + 220 px`, sorted by distance to the view centre. Take up to `liveMax` (40 in town, 24 in the district). A sprite fades in over 0.25 s when it materializes, unless it is entering through a door, and is released to the pool when it leaves.
- **Indoors** (home, school, work interior) means not drawn. Leaving or entering plays a fade at the door, plus `sfx_door` if within 300 px.

### 4.5 Save version 5
`MIGRATE[4] = (s) => Object.assign({}, s, { v: 5 })`. No old field changes meaning, and `sanitizeSave` adds:
```js
s.territory.rail = s.territory.east === true || raw.territory.rail === true;   // rail follows east
s.territory.town = raw.territory.town === true;
s.v4 = {                                     // all optional; absent = fresh v4 state
  station: { st: 'ruin'|'site'|'open', got: counts(MATERIALS), t },
  clerk, porter,                              // booleans (also mirrored in progress.done as steps)
  orders: [{ id, shop, need: counts(ITEMS), got: counts(ITEMS) }] (≤ 3),
  shops: { lotA1: { shop, st: 'build'|'ribbon'|'open', t, stock: counts(ITEMS) } } (lot ids validated against WORLD.v4.lots),
  houses: { lotH1: { st: 'build'|'done', got, t } },
  rent: count, happy: { n, sum } (n ≤ 40), rank: 1..3, flags: { firstTrain, townInvite, townVisit, rankPad },
  clock: 0..day.length, seed: int, regulars: [[id, visits]] (≤ 24), cargo: counts(ITEMS) (crate stack at the pad)
};
```
- Not saved: train position (it restarts at `atTown` with 5 s left), riders, and shoppers in our village. Shoppers re-spawn on the next train.
- A shopper partly served in the queue is lost. That costs at most one basket, which is acceptable and matches today's customer queue.
- Migration expectations:
  - **A v3.5 save with east open** gets `rail` open on load, the ruin, and a one-time pan with the banner "오래된 기찻길을 찾았어요!" when the save loads (deferred 2 s after the first frame).
  - **v3-complete saves** go straight into v4 with nothing lost.
  - **A save made before village complete** never sees v4 until tower_east.

Expected size: +0.8–1.4 KB, with the total under 5 KB.

### 4.6 `balance.js` v4 section
The Korean comments follow the existing style; English glosses here. All keys are validated in `balanceCheck.js`: counts ≥ 1, times clamped, rates 0–1, schedules sorted.
```js
v4: {
  station: { coins: 500, item_plank: 14, item_ingot: 4, time: 10 },   // 서리역 고치기
  stationClerk: 300,  stationPorter: 600,                            // 역무원 / 역 짐꾼
  train: { speed: 200, dwellOurs: 14, dwellTown: 10, seats: 12, firstRide: 6, swapTime: 0.5 }, // ~46 s cycle
  shoppers: { perTrainMin: 3, perTrainMax: 10, nightMult: 0.4, duskMult: 1.3,
              wantMin: 2, wantMax: 5, patience: 45, shopChance: 0.45, regularAt: 3 },
  wholesale: { rate: 0.7 },
  orders: { cards: 3, swapAfter: 180, bonus: 0.5,
            standing: [{ item_bread: 40 }, { item_fish_cooked: 50 }, { item_plank: 40 }, { item_ingot: 25 }, { item_can: 30 }, { item_meat_cooked: 25 }] },
  founding: {
    buildTime: 25,
    order: ['cafe', 'restaurant', 'carpenter_workshop', 'hardware_store', 'supermarket'],
    shops: {
      cafe:               { need: { item_bread: 30 },                                rent: 20, lot: 'M', sells: ['item_bread'] },
      restaurant:         { need: { item_fish_cooked: 40, item_meat_cooked: 15 },    rent: 30, lot: 'M', sells: ['item_fish_cooked', 'item_meat_cooked'] },
      carpenter_workshop: { need: { item_plank: 50 },                                rent: 25, lot: 'M', buys: ['item_plank'] },
      hardware_store:     { need: { item_ingot: 25, item_axe: 1, item_pickaxe: 1 },  rent: 30, lot: 'M', sells: ['item_axe', 'item_pickaxe', 'item_rod', 'item_sickle', 'item_bow'] },
      supermarket:        { need: { item_can: 30, item_bread: 20 },                  rent: 40, lot: 'L', sells: ['item_can', 'item_bread'] },
    },
  },
  houses: { item_plank: 20, time: 30, people: 4 },
  rent: { box: 2000, autoFromRank: 2 },
  lots: { lotB2: 800, lotB3: 1100, lotB4: 1500 },     // after 읍
  rank: { 2: { people: 40, shops: 5, happy: 70, coins: 3000 } },
  happiness: { window: 40, base: 50 },                 // happy = base + (100-base) × average satisfaction
  day: { on: true, length: 600, dawn: 40, day: 330, dusk: 90, night: 140, darkness: 0.35, startHour: 8 },
  town: { people: 100, seed: 2611, liveMax: 40, districtLiveMax: 24, walk: 70 },
  ground: { maxTiles: 16 },
  townLife: { templates: { /* §6.1, hours as numbers */ } },
},
```

### 4.7 Strings (ko + en; about 70 keys)
- Banners: `railFound`, `stationRepaired`, `firstTrain`, `orderDone`, `shopFounded` (`{name} 개업!`), `inviteTitle`, `townWelcome`, `houseMoved` (`새 이웃 {n}명 이사 왔어요!`), `rankUp` (`서리마을 → 서리읍!`), `rankUpSub`.
- Pads: `station_site`, `hire_station_clerk`, `hire_station_porter`, `ribbon`, `rank_pad`, `lot_clear`.
- Objectives: `obj_station`, `obj_firstSale_station`, `obj_cargo` (`{item} 짐 싣는 곳으로`), `obj_ribbon`, `obj_visit_town`, `obj_feed_carpenter`, `obj_rank`, `obj_off_track` (`기찻길에서 비켜 주세요!`), `obj_happy_low` (`손님들이 {item}이(가) 없어 아쉬워해요`).
- HUD and panels: `rank_1..3` (마을/읍/도시), `bar_people/shops/happy`, `orders_title`, `order_to` (`→ {shop}`), `order_swap`, `day/dusk/night`.
- Shop names: `shop_cafe` (역앞 카페 / Station Café), `shop_restaurant` (생선구이 식당 / Grill House), `shop_carpenter_workshop` (목공소 / Carpenter), `shop_hardware_store` (철물점 / Hardware), `shop_supermarket` (슈퍼마켓 / Supermarket).
- `LINES.ko/en`:
  - `rumor`
  - `town_kid`, `town_adult`, `town_elder`
  - `shopper_happy`, `shopper_sad`, `regular` (`또 왔어요! 서리마을 빵이 최고예요`)
  - `mayor_invite`, `founder_ask`
  - 6–10 lines each
- Name lists: `TOWN_NAMES.ko` (80 given names) and `TOWN_NAMES.en` (romanized), indexed by citizen id.

---

## 5. Readable feedback spec

### 5.1 Train
| Moment | Sound | Visual | Text |
|---|---|---|---|
| 2.5 s before arrival at our station | `sfx_steam_whistle` positional (`sfxAt`, audible within 900 px) | Steam puffs at `smokePoint` every 0.35 s while moving | — |
| braking (last 120 px) | `sfx_brakes` | 3 `fx_smoke_puff` at the wheels | — |
| doors | `sfx_door` (throttled to 1 per 0.3 s) | people fade in at `boardPoints` | — |
| first 3 arrivals | — | `focusCamera` 2.5 s on the first one only; the 2nd and 3rd just get a toast | toast `솔방울 기차 도착 · 손님 {n}명` |
| later arrivals | — | **train edge icon** (UI) when the chief is in the `rail` region but the train is off screen | none |
| blocked track | whistle ×2 | train stops 90 px before the obstacle | `obj_off_track` objective pill while blocked > 2 s |

### 5.2 Tutorial / arrow priorities (added after the existing v3 ones)
1. Station site pad affordable → arrow (existing affordable-pad rule).
2. Materials for the station site → existing `v3Hint` site logic (porters, or "판자를 가져가세요").
3. **First station sale**: someone waiting to pay and no clerk → arrow to the station register (the existing `registerHint` with the station market added; `waitingPay` only).
4. **Ribbon pad present** → arrow + `obj_ribbon`. It's free, so it ranks like an affordable pad.
5. **Carrying goods an open card needs, card ≥ 1 short** → arrow to the cargo pad (`obj_cargo`). Only shown when the matching shelf (plaza or station market) is ≥ 50% full, so selling stays first.
6. **Invitation open, town not visited** → arrow to `v_gate`, then the town square (`obj_visit_town`).
7. **Carpenter open, house lot waiting for planks, chief idle 3 s** → `obj_feed_carpenter`.
8. **Rank bars full** → 승격식 pad arrow when affordable, otherwise goal text `승격식 준비 {coins}`.
9. **Happiness < 70 and a station shelf item is at 0** → `obj_happy_low` with an arrow to the empty shelf (idle only).

Goal text when idle with nothing actionable shows the focus card, e.g. `솔방울 주문: 빵 18/30 → 역앞 카페`.

### 5.3 Bubbles and emotes (existing `Bubbles` system; caps: 2 chat bubbles at once in town, 3 emotes)
- Shoppers: the existing want bubble (item icon ×n), then a coin when paid.
  - Fully served: `emote_heart`.
  - Partly served and out of patience: `emote_dots`, then they leave.
  - Nothing at all: `emote_tear` + `LINES.shopper_sad`.
  - Regulars (≥ 3 visits): a small star on the bubble and `LINES.regular` on arrival (1 in 3).
- Founder: `emote_exclaim` while walking to the lot, then `founder_ask` at the lot.
- Mayor: `emote_wave` + `mayor_invite`.
- Town set pieces: kids `emote_star` at the 15:00 bell, elders `emote_zzz` on benches after 20:00, shopkeepers `emote_wave` at the chief within 170 px (the existing `waveRange` rule).
- Chief passing a founded shop: owner `emote_thumbs` (cooldown 25 s).

### 5.4 HUD layout (logical 720-wide UI, `top = 62 + safeTop`)
| Element | Position | Size | Shows | Tap |
|---|---|---|---|---|
| coin bar | (26, top) | existing | — | — |
| population | (28, top+152) | existing | now `n/cap`, where n includes district citizens once v4 runs | — |
| **rank chip** | (188, top+152) | 150×50 | `ui_badge_rank_N` 40 px + `마을` + 3 mini bars (people/shops/happy, 6 px tall, fill colours #6bbf59 / #e8a33d / #e35d8c) | rank panel |
| **order chip** | (28, top+212) | 260×56 | shop icon (sprite thumbnail 36 px) + item icon 32 px + `18/30` + a 4 px progress line | order panel |
| **clock** | (W−62, top+92) | 52 px | `ui_icon_day` / `ui_icon_night` + an arc of the day | none |
| objective pill | existing (W/2, top+88) | existing | unchanged | — |
| train edge icon | screen edge | 44 px | `ui_icon_delivery`, tinted to read as the train (P1: a tiny engine thumbnail) | — |

- **Panels** are non-pausing overlays, closed by tapping outside.
  - **Order panel:** 3 `ui_mission_card` 9-slices, 640×150 each. Each card shows shop name, item rows, a progress bar (`ui_progress_bg/fill`, tint #e8a33d) and the reward. A `다른 주문` button appears after 180 s without progress. Done cards use `ui_mission_card_done`.
  - **Rank panel:** badge 128 px, 3 rows (people, shops, happy) with ✓, then a "읍이 되면" reward list.
- Chips are hidden until the station opens. The whistle button and dog bar keep their spots; the dog bar's top-clearance rule (v3.5 L1) adds the new chips' bottom (top+268).

### 5.5 Founding sequence (about 35 s, the heart of v4)
1. Card completes → `sfx_mission_done`, the card flips and coins fly. Banner `주문 완료!` / `{shop} 창업 준비 중`.
2. The next train (≤ 46 s) brings the founder (preset per shop: `barista`, `factory`, …) and 2 builders (`factory` + hard hat). The founder walks to the lot with `emote_exclaim`.
3. A lot plot (`site_plot_M` / `site_plot_L`) pops in. The builders hammer (`fx_build_dust`, `sfx_hammer`). The site goes `site_foundation_M/L` → `site_scaffold_M/L` at 50%, 25 s in total (the v3 `Site` stages).
4. Done (`fx_build_done`). Two `flower_stand`s (life2) appear at `doorPoint ± (40, 0)` with a ribbon pad at `doorPoint + (0, 46)`.
5. The chief steps on the ribbon pad (1 s) → confetti, `sfx_fame_up`, banner `{shop} 개업!`. Residents within 600 px cheer. The owner waves, its stock sink opens, rent starts, and its card leaves the board.

If the chief never comes, the shop opens by itself after 90 s with a smaller banner. That rules out a softlock.

### 5.6 Rank-up ceremony (12 s; any joystick input after 3 s skips to the end state)
1. Camera to the station square. Residents and visiting citizens within 900 px gather (`PartyEvent` reuse) around the square.
2. `sfx_bell_hall` ×3 and the music ducks. Banner **`서리마을 → 서리읍!`** / `rankUpSub`. The rank badge flies from the square to the HUD chip, which changes to `ui_badge_rank_2`.
3. Confetti and star bursts ×10 (existing `celebrate3` pattern).
4. **Repave wipe**: `RoadGrid.repave(2)` turns dirt into `road_cobble_wide`. `Ground.invalidate` is called tile by tile outward from the square, every 0.25 s over about 3 s, with `fx_poof` puffs at the wipe front.
5. New streetlights pop along 역앞 거리, and a `town_gate_x` with the board "서리읍" pops up at the west end of 역앞 거리 (3088, 1683). Lots B2–B4 appear as lot-clearing pads. A second `car_a` is coupled at the next arrival.
6. Toasts list the rewards: rent auto-collect, +1 coach (seats +8), new lots, title "읍장".

---

## 6. Making 100 people feel alive on a phone

### 6.1 Daily routine templates (`BALANCE.v4.townLife.templates`, hours on the game clock)
One day is 600 s of real time: dawn 06–08 (40 s), day 08–17 (330 s), dusk 17–20 (90 s), night 20–06 (140 s). Each citizen gets ±0.4 h of seeded jitter.

| Kind (count) | Template |
|---|---|
| student (18, child bases) | 07:30 home → school gate (`gatherPoints`) 08:00 → inside. 10:30–10:50 recess in the yard (`playPoints`). 12:00–12:40 lunch in the yard. 15:00 bell → playground or fountain until 17:30 → home |
| teen (6) | like students, then cafe or bookstore (`customerPoints`) 15:30–17:30 |
| shopkeeper (12: the 7 town shops + 5 founded) | 07:40 → shop `staffPoints` (outside, as the town report says). 12:00 lunch at the restaurant or cafe. 18:30 home. Founded-shop owners live in the district (house lots or their shop) |
| civic (13) | teacher ×3 (school), mayor + clerk (town hall), postal ×2 (**route**: post office → 8 doors, loop), police ×2 (**patrol** loop on the main streets), doctor + nurse (clinic), firefighter ×1, station attendant ×1 (town platform `staffPoints`) |
| adult (32) | home → errands in town (2–3 shop visits, 6–15 min each) → **our-village trip** with probability `p(day)` → home 19:00. Evening walk 19:00–20:00 for 30% |
| elder (16) | 09:00 fountain or benches (`seatPoints`) → cafe 11:00 → clinic visit (20%) → our-village trip (elders love bread) → home 18:00 |
| builder (3) | idle at the town hall square until called by a founding |

The **our-village trip** is what pays. Each train picks riders from waiting citizens at the town station (`waitPoints`). Demand per train = `clamp(perTrainMin + shops×1 + (rank−1)×2, perTrainMax) × timeMult` (night 0.4, dusk 1.3). Riders stay 1–2 cycles and return with bags (`carry_walk`, item at the base's `carryPoint`).

### 6.2 Set pieces (town; only visible if the camera is in the town, logged regardless)
| Hour | Set piece | Hook |
|---|---|---|
| 08:00 | school bell (`sfx_school_bell`, school `anims.ring`), kids stream in | `Clock.onHour(8)` |
| 10:30 | recess: 18 kids in the yard and playground, snowball emotes | |
| 12:00 | town hall bell (`sfx_bell_hall`), lunch queue of 6 outside the restaurant (`customerPoints` + overflow queue) | |
| 15:00 | school out: kids run (walk anim at 1.4× speed) to the fountain and playground | |
| 17:30 | shops close; commuters walk to the town station; the **dusk rush** train is full | |
| 19:00 | streetlights glow on one by one along the streets (0.15 s apart, from the station outward) | `Clock` glows |
| 21:00 | most people inside; 3 elders on benches with `emote_zzz`; police patrol continues | |

### 6.3 Day/night spec
- Overlay colours (MULTIPLY, alpha = intensity): dawn `#ffd6b0` 0.15, day none, dusk `#ffb070` → `#7d88c8` 0.25, night `#5a6aa8` with `darkness` 0.35. Transitions lerp over 8 s.
- **Readability floor**: characters and items keep ≥ 65% brightness; UI and bubbles are unaffected (UI scene and depths above the overlay).
- Glows: 96 px radial `fv_glow` (generated like `fv_shadow`), ADD blend, alpha 0.7. Placed at streetlights, the station clock, train lamps and campfires. P1: house window glows from a small per-building offset table `WORLD.v4.windowGlows`.
- Economy is neutral over a day: our stations, workers and porters never slow down at night. Only townsfolk demand moves (night ×0.4, dusk ×1.3), and it averages about 1.0 over a day.
- Settings toggle "낮과 밤 켜기/끄기": off means always day. The clock still runs, because schedules need it.
- **No day/night before the station opens.** The early game looks exactly as v3.5.

### 6.4 Density tricks for a 600×1100 px view
- Public activities are weighted toward places near the camera, the same trick `VillageLife.pickArea` uses (×3 within 650 px). The schedule fixes *which* activity; the *spot* inside a place (bench, point) prefers the camera-near one.
- At 12:00 the expected outdoor count is about 45. At zoom 1.2 the view sees about 18–25; at zoom 0.6 the cap of 40 applies, and the nearest are drawn first.
- Sound sells density: `amb_town` volume = 0.15 + 0.5 × min(1, live/30).
- **Tap a citizen** (P1): a name card bubble 2.5 s, e.g. `민지 · 9살 · 학교 가는 중 · 좋아하는 것: 빵`. Regulars show `단골 ★`.

---

## 7. Goals without dead time or softlocks

### 7.1 Goal order (`nextGoal` walks this; passive goals in progress are skipped)
```
east → station(build) → firstTrain(flag) → toolsmith → fedMiners → firstShop(shops:1, passive) → hire2_lumberjack →
townVisit(flag) → boathouse → boat_rowboat → shops:3 (passive) → south → warehouse → cannery → store → se →
boat_fishing → shops:5 (passive) → people:40 (passive, hint: carpenter) → rank:2 (pad)
```
`GOALS_V3` (the 12 v3 entries, unchanged) still drives `v3Complete` and `celebrate3`. `rank:2` drives the v4 finale.

### 7.2 Gap analysis (smart-bot projection from v3.5 timings and the costs above)
- 20.2 → 21.5 tower_east (existing).
- 24 station + first train.
- 25.5 clerk.
- ~26 toolsmith (400 coins; income ~950/min + station ~150/min).
- 27.5 first shop.
- 28.5 invite, 29.5 visit.
- 30–31 hire2_lumberjack.
- 32 hardware (tools now exist).
- 33 boathouse.

From there v3 continues at its usual 1–2 min cadence, with ribbons (every ~3–5 min) and houses filling the cracks. **Projected longest gap: about 1.6 min.**

### 7.3 Anti-softlock rules (each one gets a test case)
| Risk | Rule |
|---|---|
| Order needs an item the player can't make | Cards are only drawn when the item's producer exists: bread → `zone_farm`, cans → `b:cannery`, tools → `b:toolsmith` (all others exist at village complete). If a line is lost (it can't be), the card is swapped on load |
| Card stuck (no porter routes there and the player ignores it) | A `다른 주문` swap after 180 s without progress. Plus the tutorial hint (5.2 #5). Plus `StationPorter` |
| No free lot for a founding | Lots A1–A3, B1 (M) and B5 (L) are reserved for the 5 founding shops, so a fit always exists. Post-읍 shops need a cleared lot, and the pad appears automatically |
| Ribbon never cut | Auto-open after 90 s |
| Happiness stuck below 70 | Floor `base` 50. Repeat shoppers recompute it from the last 40 only. The hint points to the empty shelf. The station porter covers stocking. Rank shows exactly which bar is short |
| People < 40 with no carpenter | The carpenter is the 3rd founding (planks always exist). v3 houses (S plots) also count. The house hint appears |
| Train blocked by the chief, the dog or a citizen | The train stops 90 px before, whistles every 3 s, and shows `obj_off_track`. Citizens and the dog step off the track (the dog's roam excludes track cells). After 20 s the train waits, never pushes; the chief is the only possible blocker and he controls himself |
| Shopper can't be served (queue full, no stock) | `patience` 45 s → sad, back to the platform, lower satisfaction. At most 24 district shoppers live; the rest stay on board (fewer alight) |
| Register deadlock (v3.5 finding 2) | Station market uses the same `waitingPay` rule. Clerk pad after the first station sale |
| Same-spot pads (v3.5 H1) | Clerk and porter pads share a spot. The existing `needsLeave` + step-off pill applies unchanged |
| Reload mid-anything | The train restarts at the town, shoppers are not saved, sites/shops/orders/houses restore from `v4`, wholesale counts are paid instantly (no partial-flight loss). Partial pad payments use the existing `paid` map |
| Old saves with odd states | `sanitizeSave` drops unknown lots and shops, clamps counts, and validates states. `rail` follows `east`. A town-open save without an invite flag is honoured (open stays open) |

---

## 8. Budgets

### 8.1 Performance (headless SwiftShader fixed-step numbers are relative, like the v3.5 reports)
| Metric | v3.5 | v4 budget | Notes |
|---|---|---|---|
| Logic per tick, village view | 1.24 ms | ≤ 1.6 ms | TownSim abstract at 4 Hz ≈ 0.05 ms; train 0.03; hub 0.1; district shoppers (≤ 24) ≈ 0.25 |
| Logic per tick, town view | — | ≤ 2.1 ms | 40 live townsfolk: layer refresh only on frame change (≈ 1.3 ms at 40 per the townfolk report's 3.7 ms/100) |
| Display objects (excluding stacks) | ~970 | ≤ 1650 | 40 × ~15 layers + 35 buildings/props + 4 train + glows ≤ 60 |
| Draw calls per frame | 4–6 | ≤ 12 | 11 townfolk sheets fit the 16 texture units. Town + train atlases add 1–2 batches |
| Ground tiles baked | ≤ 12 | ≤ 16 (LRU) | Re-bake ≤ 60 ms, 1 per frame |
| Save write | 0.07–1.3 ms | ≤ 2 ms | |
| Save size | ~3.5 KB | ≤ 5 KB | |

### 8.2 Texture memory (GPU) and download, by stage
| Stage | Loads | +GPU | Running total (projected) | +Download |
|---|---|---|---|---|
| v3.5 new game → v3.5 peak | — | — | 368 → 441 MB | — |
| village complete | audio3 subset (9 sounds) | 0 | 441 | 0.5 MB |
| tower_east | `town_rails` 0.6, `town_street` 2.5, `town_civic` 15.4 (station inside), `train_engine/car_a/car_b` 16.6, `ui3` 1.5 | +36.6 | 478 | 1.7 MB |
| station open | townfolk `tf_head_0/1` 17.4 + `tf_adult_slim_0..3` 41.2 (adults only) | +58.6 | 536 | 4.2 MB |
| first card done | `life2_wedding` (ribbon flower stands) | +1.6 | 538 | 0.1 MB |
| town invite | `town_shops` 12.0, `town_homes` 7.9, `town_park` 1.6, `tf_child_slim_0/1` 20.9, `tf_elder_slim_0..2` 25.3 | +67.7 | 606 | 3.7 MB |
| roads kit | bake-only `HTMLImageElement`s (CPU ~12 MB decoded), **0 GPU** | 0 | 606 | 1.2 MB |
| ground tiles beyond 12 | LRU cap 16 | +16 max | ≈ 590–620 | — |

Mitigation:
- **P0:** stage gates (above), bake-only roads, tile LRU.
- **P1:** `TextureBudget` unloader. When the chief has been outside `rail`+`town` for 60 s, release `town_homes/park/shops` and `tf_child/elder` (~68 MB). Destroy the pooled sprites first. Re-queue them when the chief crosses x 3800 (they're browser-cached, so a re-decode takes about 0.2 s). Steady state in the village: ≈ 520–540 MB.
- **P2 (art request, low effort):** split the station out of `town_civic` into `town_station` (~3 MB) so `tower_east` loads 3 MB instead of 15.4.

The memory numbers must be re-measured with the v3.5 `texmem.py` method at each stage.

### 8.3 Artifact
- About 400 files and about 45 MB, still 2 batches with boot files last (`publishBatches()` unchanged).
- `townfolk` (23 files) and `roads` (9) are packaged through `CUSTOM_FRAGMENTS`. Only the audio3 sounds v4 uses are packaged; `isUnused` keeps the rest out.

---

## 9. Tests and acceptance

New hooks: `__FV.v4 = { open(region), stationDone(), train(phase, t), order(item, n), found(shop, lot), ribbon(lot), house(lot), rank(n), clock(hour), stats() }` and `__FV.state().v4 = {station, train:{phase,t,riders}, orders, shops, houses, rank, happy, people, live:{town,district}, clock, townOpen}`.

| Test | What it asserts |
|---|---|
| `tools/test/v4.mjs` (new, fixed-step) | From `unlockAll` + tower_east: rail opens with east, ruin present, site completes with porter deliveries, first train arrives ≤ 6 s after repair, 6 alight, a shopper buys at the station market and pays only with someone at the register, cargo item counts toward the cafe card and pays 70%, card completion → founder on the next train → build 25 s → ribbon → rent ticks, invite → town open → visit flag, carpenter house +4 people, rank pad appears at 40/5/70 and the ceremony sets cobble cells, 0 page errors, 0 placeholders |
| `tools/test/town.mjs` (new) | One game day (600 s) in town at fixed step: every citizen reaches every scheduled place (none stuck > 20 s), set pieces fire at their hours, live ≤ 40, district ≤ 24, display objects bounded, logic ms/tick logged, all 100 looks unique |
| `tools/test/save_v4.mjs --browser` (new) | Real v3.5 saves (from `save_v35` fixtures) at 0.5 / 12 / 21 / 38 min load into v4 with nothing lost. The ≥ tower_east ones get rail + ruin + pan. Round-trip of every `v4` field. 20 corrupted `v4` shapes boot. Reload mid-founding, mid-train, mid-ceremony |
| bots (`review_gameplay_sim.mjs` + bot `--v4` policy) | Smart, arrow, think and pure-arrow runs to rank 읍 with 0 stuck and 0 errors. Targets: village complete 20.2 ±0.5 (smart), first train ≤ 25, first shop ≤ 29, town visit ≤ 32, v3 complete ≤ 46, rank 읍 47–52 (smart) / ≤ 57 (think). **Longest gap ≤ 2.0 min.** Early-game request log: **no `town/`, `townfolk/`, `roads/`, `ui3/` request before tower_east** |
| existing suites | smoke 53/53, v3 18/18, labour 28/28, dog 15/15, life 14/14, zoom 11/11, save_v2/v3/v35 unchanged and passing |
| perf | `review_robust_drawcalls` in town at 12:00 and 21:00 (≤ 12 calls); `texmem` at each stage (§8.2); `review_robust_soak --town` 10 min (heap flat, objects flat, tweens and timers flat, pool size stable) |
| visual (`shots_v4.mjs`, 390×844 + 360×640, ko + en) | The 15 must-look shots: ruin reveal, station site, first train arriving, shoppers queue, order panel, cargo loading into the wagon, founder walking, builders, ribbon, rent box, town welcome, school bell exodus, dusk lamps, night town, rank ceremony + HUD chips |

---

## 10. Build order (each milestone ends with a phone-playable artifact)

| M | Contents | Demo for the designer |
|---|---|---|
| **M1 map + rail** | Regions, world width, borderTrees `until`, roads nodes, Ground tile LRU + invalidate + RoadGrid bake (dirt), track bake, ruin, station Site, Train with timetable, no passengers | Light tower_east → see the coast railway and the ruin, repair it, the train comes and goes |
| **M2 townsfolk + shoppers** | `Townfolk.js` port + pool + `TownfolkBody`, StationHub market/cash/clerk, district shoppers via the train, happiness | Neighbours ride in and buy bread |
| **M3 orders + founding** | Orders, cargo sink, wholesale, Shop lifecycle, ribbon, rent box, carpenter houses, StationPorter, HUD chips + order panel | Watch 역앞 거리 fill with shops |
| **M4 town + day/night** | Town region + invite + visit, TownSim schedules, set pieces, Clock overlay + glows, town art gates | Visit 솔방울 마을 at noon and at night |
| **M5 rank + polish** | Rank bars/panel/pad/ceremony, repave, post-읍 lots, coach, tutorial hints, strings ko/en, balanceCheck | Become 서리읍 |
| **M6 verify** | Tests (§9), bots, texmem, shots, save migration, artifact | Release candidate |

---

## 11. Risks and mitigations

| Risk | Likelihood / impact | Mitigation |
|---|---|---|
| GPU memory > 600 MB kills the tab on low-RAM iPhones | medium / high | Stage gates, bake-only roads, tile LRU (P0). `TextureBudget` unloader (P1). Station atlas split (P2). Measure each stage |
| Layered townsfolk CPU cost on older Android | medium / medium | Caps 40/24, refresh on frame change only, 12 fps anims. Drop the cap to 24 if `loop.actualFps < 40` for 5 s (same spirit as `View.forceK`) |
| v4 slows v3 or makes it trivial (more income) | medium / medium | Bot-tuned: station 500, wholesale 0.7, rents 20–40/min. Watch `v3 complete ≤ 46` and `≥ 40`, and tune `wholesale.rate` first |
| Two hubs split the player's attention (plaza vs station 2,400 px apart) | medium / medium | The station hub is self-contained (its own market, cash and register clerk at 300). The plaza stays automatic from v3.5. Edge icon for the train. StationPorter |
| Night hurts readability | low / medium | Darkness 0.35, readability floor, glows, settings toggle, night lasts only 23% of the day |
| `Customer` coupled to `Character` | medium / low | The `TownfolkBody` adapter implements the used subset; `Customer` gets an optional `body`. The plaza market path is untouched |
| Townfolk custom atlas format and artifact webp conversion | medium / medium | Townfolk JSON is read from the (rewritten) manifest paths. Add a build test that loads one townsperson from `dist/artifact` |
| Train through fog looks odd before the town opens | low | The fog depth is above world objects, so the train cleanly disappears into the fog and emerges from it. This is intended ("the town beyond the fog") |
| Founding and ceremony scripts interrupting the player | low / medium | No camera grabs except the first train, the invite pan and the rank ceremony (player-triggered). Everything else is a toast or banner |

---

## 12. Forward compatibility (v5 vehicles, v6 harbour, v7 beach and living water)

- **v5 roads and vehicles:** the main street (역앞 거리 → 솔방울 큰길, the only road between the two places) keeps a 4-cell two-lane reserve (j −8…−4) free of buildings. `RoadGrid.repave(3)` → asphalt + lane markings + curbs (`roads_decals`) without moving a building. Side streets stay one-lane tracks. Stops go at `sled_stop` / `bus_stop` spots on 솔방울 큰길 and 역앞 거리 (curb side). The truck route is `v_gate` → `t_cross` along `stn_street`. `Rail.js` timetable code is reusable for bus lines.
- **v6 harbour 갈매기 항구:** the coastal railway is aimed at it. It continues past x 6144 along j = 0 (the coast keeps a ~0.5 slope). A buffer stop at k=47 now, with a `signpost` (props) and a world label "갈매기 항구 방면 (공사 중)". The vehicles fragment, which has the blank road signs, isn't loaded in v4. The world widens again to ~9200 px; Ground's LRU and the rect regions already cope.
- **v7 햇살 해변 and living water** (the designer's latest request, "바닷물도 진짜처럼… 출렁 파도치고 해변가 해수욕장도"):
  - v4 deliberately keeps the strip between the track and the sea free of buildings, except the two stations. That gives the Water module's per-segment shore types room to work: `snowbank` along the village and rail coast, `quay` at a future harbour pier, `sand` at the beach south of the harbour.
  - The sea stays a plain `tileSprite` in v4, created in one `Ground.makeSea()` method, so the v7 swap to `src/systems/Water.js` is a one-method change. v4 never imports or loads `Water.js` or `assets/{water,beach,beach_bld,beachfolk,audio5}`.
  - TownSim's schedule and set-piece engine (§6) is the same machinery beach-goers, lifeguards and hotel staff will need. Templates are data in `balance.js`, so `swimmer` / `sunbather` / `lifeguard` kinds are new rows, not new code.

---

## Appendix A. What the designer edits
- `balance.js → v4`: every number in §4.6 (Korean comments).
- `world.js → WORLD.v4`: station, lots, town building list, streets, nodes, glows. Every position is written as a lattice `L(i, j)` plus a px comment, so moving a building by one cell is one number.
- `strings.js`: every new text (ko + en), the name lists and the town chat lines.
- Settings: "낮과 밤" toggle.

## Appendix B. Open questions for the lead
1. Should the plaza market also accept townsfolk shoppers who walk on from the station (~30% of riders)? It's more life on the plaza, but the walk is 2,400 px. Proposed: off in v4, on in v5 when the bus exists.
2. Should rank 읍 also re-skin our village's own paths (Ground soft paths) to cobble? Proposed: v5, because the soft-path renderer is a different system.
3. Train ride for the chief (P1): worth it in v4? It's cheap (hide chief, follow train, pop out) and the most delightful "world grows" moment after the reveal.
