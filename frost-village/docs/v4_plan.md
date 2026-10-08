# v4 binding design: 솔방울 마을, the snow train, and a village that grows into 읍

Status: **binding** for BUILD-A and BUILD-B. Supersedes `docs/v4_plan_player.md` and `docs/v4_plan_tech.md` wherever they differ; both stay as background reading.
Inputs: `기획서_v4_이웃마을.md` (the designer's idea), `기획서_v5_생활과미션.md` §1 + §5 (v4 scope), `CONTRACT_V4.md` §J–K, build reports town / townfolk / townfolk2 / roads_ui / vehicles / life2 / v35_build, handoff doc 05, the v3.5 code.
Layout preview: `docs/previews/v4_plan_map.png`. Layout reference and checker: `tools/test/v4_layout_ref.py` (prints `no problems` for the numbers in §3).

v4 scope, from 기획서 v5 §5: the neighbour town 솔방울 마을 (about 100 people), the snow train, daily routines for 100 people, townsfolk shopping at our village, shops founded around our station, the village growing from 마을 to 읍, and a road structure that v5 vehicles can drive on.

---

## 0. Decisions at a glance

| Topic | Binding choice | Taken from | Why |
|---|---|---|---|
| First 20 minutes | No change at all. No v4 request, system or tick before the **tower_east site starts** (about 20.5 min) | both | Must stay as snappy as v3.5. The boot request log stays byte-identical |
| Reveal | The `rail` strip opens **together with `east`** when tower_east is lit. The coastal track and a snowed-in ruined station appear in the same fog clearing | player | One reveal moment, riding on v3's first goal. The neighbours arrive ~5 min after village complete instead of ~10 |
| Station | The ruin sits on a v3 plot (`only: 'station'`, size XL). Repair it like any v3 building: 500 coins + 14 planks + 4 ingots, 12 s, porters deliver | player cost + tech's XL plot | Reuses Site, the build menu, porters and tutorial site hints. Nothing new to learn |
| World size | **6144 × 3450**, two new regions `rail` [3000–4150] and `town` [4150–6144] | player | Compact: the town is ~7 s on foot from our station. Fewer ground tiles, short train ride. 8704×5120 (tech) doubles the map for no gameplay gain |
| Layout | Player's lattice (G = 3120, 1315; track = j 0), **re-laid by the lead**: 6-cell main-street corridor for v5, no second market, crossings clear of a 4-car train, all rows inside the regions | player, corrected | The player layout had a 4-cell reserve (no room for v5 sidewalks), a crossing the 4-car train covered, and a 2-cell dirt track on odd lattice lines (ruts out of lane). Validated by script, 0 problems |
| Town opening | On the **mayor's invitation**, after the first founded shop opens (fallback: 8 min after the first train) | player | A second reveal, and a reward for the first shop. Tech opened the town with the station, which uses up both moments at once |
| Train | Engine + 2 cars (+1 coach at 읍), 2.6 m/s, about one train a minute. **Push-pull, engine always on the village (NW) end**: it pulls into our station and pushes back to the town | merged | The engine always leads into **our** station, the moment the player sees most. Only the NW heading's frames are needed (tech's memory saving). No run-around trick, no turntable art needed |
| Who shops | Townsfolk shop at **our existing sellers** (plaza market, general store) and at the founded shops. No second market at the station | tech | The designer's words: "서리마을 판매대·잡화점·교역소의 손님 대부분이 이웃 마을 사람들". One hub stays the heart of the game. A second register would split the player's attention |
| Customer model | Hybrid: anonymous customers keep the v3.5 rate but **look like real townsfolk** (looks taken from the 100 citizens). Real train visitors come on top | tech | Income can only rise. Every v3.5 rule (queue, register, waitingPay) still holds |
| Surplus / founding | **Order cards** on a 주문판 board, filled at a **cargo pad** that pays 70% wholesale. Each card names the shop it founds. Founder + builders arrive by train, 25 s build, ribbon. Founded shops pay rent and buy our goods wholesale | player | Readable cause → effect ("빵 30개 → 역앞 카페"). Tech's invisible supply meters give no goal and no feedback |
| Founded-shop people | The founder is a real citizen from the sim, who moves into the district with family | tech | Continuity: the person you served becomes the shopkeeper |
| Rank 마을 → 읍 | Three bars (people ≥ 45, founded shops ≥ 5, happiness ≥ 70), then a 3000-coin 승격식 pad and a 12 s ceremony | player | Readable bars beat a hidden point formula |
| Road structure | **RoadNet** (cells with class, lanes, sidewalks, junctions, level crossings; walk graph merged into Roads.js; right-hand lane graph unit-tested for v5) laid on the binding street table | tech, on the corrected layout | v5 vehicles need lanes and junctions, not just a free strip |
| Townsfolk sim | Plain JS objects, event heap on a 600 s day, analytic positions off screen, 4 LOD tiers, ≤ 32 full rigs (16 low tier), lite rigs and dots when zoomed out | tech | 100 people at ≤ 0.35 ms per frame |
| Paper-doll runtime | Port `tools/townfolk_compose.js` unchanged, plus a frame cache and layer-plan cache. A duck-typed `DollSprite` lets `Character` (and so `Customer`, `Bubbles`, `moveAgent`) drive dolls unchanged. `carry_walk` is dropped (head carry, as in the village) | tech | One code path for every walker. 20% less townfolk memory |
| Day / night | 600 s day: dawn 06–08, day 08–17, dusk 17–20, night 20–06. MULTIPLY overlay, darkness 0.35, pooled ADD glows. Starts at the first train. Settings toggle | player, + tech's glow pool | Matches the 기획서 ("하루 약 10분"). Night is 23% of the day and readable |
| Texture memory | Asset compiler (pages), residency manager, pooled ground tiles, region hysteresis. Gates: **must** never exceed v3.5 (455 MiB) and **target** ≤ 300 MiB for any view of a full v4 save | tech, with lead's gates | v3.5 is already 441–455 MiB. v4 adds 175 MiB if loaded naively. The player plan's 600 MB would kill the tab on phones |
| Save | `SAVE_VERSION 5`, one namespaced `v4` block, people regenerated from the seed, pass-through when v4 isn't running | player | Small save, one sanitizer, no lost data |
| Water / beach (designer's latest request) | Not in v4 code. v4 keeps the seam: `Ground.makeSea()`, one `shoreY()`, the sea-side strip almost free, 8 MiB reserved. The living water goes in as its own step right after v4 | both | The water and beach agents are still working; they own `Water.js` and the v7 folders |

---

## 1. Guardrails (apply to every v4 change)

1. **First 20 minutes unchanged.** Before the tower_east site starts, v4 constructs nothing, ticks nothing, requests nothing. The test compares the request log of a v3.5 run with a v4 run up to that moment. Bot "village complete" stays within ±5% of v3.5 (smart 19.2–21.2 min).
2. **Keep every v3.5 safety feature**: same-spot pad step-off, register `waitingPay` rule, partial payment refunds, pile overflow saved, lazy stand-ins, the crash card and backup slots, the publish batch order, `balanceCheck` clamping, try/catch around storage.
3. **Every existing test stays green**: smoke 53/53, v3 18/18, labour 28/28, dog 15/15, life 14/14, zoom 11/11, save_v2 16, save_v3 26, save_v35 25, test_deploy (pages + standalone).
4. **Designer-editable data**: numbers in `src/data/balance.js` (Korean comments, every key covered by `balanceCheck.js`), layout in `src/data/world.js` (Korean comments), text in `src/data/strings.js` (ko + en).
5. **Never touch, import or load** `src/systems/Water.js`, `assets/{water,beach,beach_bld,beachfolk,audio5}`, `tools/blender/{beach_,bbld_,bf_}*`, `tools/fx/gen_water*`, `tools/fx/gen_beach*`, `tools/audio/*5.py`, `tools/test/water_lab*`, `beach*_phaser.mjs`.
6. **Process**: no state-changing git commands, no SendMessage. Scratch files only in `scratchpad/v4_buildA/` or `scratchpad/v4_buildB/`. Bash calls time out at 10 min: run Playwright with `nohup … &` and poll. Headless Chromium is SwiftShader on 4 shared cores, so judge logic with the fixed-step clock (`tools/test/fv_step.mjs`), not wall time.
7. **No softlocks.** Every v4 requirement is producible by lines the player already has, every timed event has a fallback, and every v4 state has a hint (§15.3).
8. **Alive, not noisy** on a 390 px wide phone: at most 2 chat bubbles and 3 emotes on screen in the town, 1 train toast per arrival for the first 3 arrivals only, no camera grab except the reveal, the first train, the invitation and the (player-started) ceremony.

---

## 2. The arc (smart-bot game minutes; think/arrow bots are 1.5–3 min slower)

| t | Event | The player does | The player sees |
|---|---|---|---|
| 0–20 | v3.5 exactly | — | — |
| ~13 | after `zone_mine`, residents sometimes say a rumour line | — | "동쪽 안개 너머에 기찻길이 있대!" (strings only) |
| 20.2 | village complete (existing party) | — | Sub-line on the banner: "동쪽 안개 너머에서 기적 소리가…". 2 s later a faint whistle from the east (`sfx_steam_whistle`, volume 0.25, panned east) |
| ~20.5 | tower_east site starts | — | Nothing new. v4 manifests and the station/rail art prefetch silently (§11.6) |
| ~21.5 | tower_east lit: fog clears over `east` **and** `rail` | — | Existing pan to the east coast, then a second 2.5 s pan to the ruin. Banner **"오래된 기찻길을 찾았어요!"** / "기차역을 고치면 이웃 마을과 이어져요". Snowed-in rails run into the eastern fog; the 솔방울 마을 gate stands at the fog's edge |
| 21.5–23.5 | Station repair (plot `r_station`) | Stand on the plot, pick 서리역, pay 500; porters or the chief bring 14 planks + 4 ingots | Scaffold, hammering; then a bell, the station sign lights, drift decals on the rails pop away |
| ~23.5 | **First train** (3 s after the repair) | Watch | Camera on the arrival for 2.5 s: whistle → brakes → steam → doors → 6 neighbours step down. Banner **"솔방울 마을 사람들이 장 보러 왔어요!"**. The clock starts at 08:00 |
| 23.5–25 | Neighbours walk the 역 가는 길 to the plaza | Serve them as usual | From now on the plaza customers look like townsfolk. The 주문판 shows 3 cards: 카페 (빵 30), 식당 (생선구이 40 + 훈제고기 15), 목공소 (판자 50) |
| ~24 | toolsmith (v3) | v3 as before | — |
| ~25 | 역 짐꾼 (600) | Hire on the station square | A porter now carries surplus from the stations and the warehouse to the cargo pad |
| ~26.5 | First card done → **first founding** | — | `sfx_mission_done`; the next train brings the café owner and 2 builders; 25 s build on lot A1 |
| ~27.5 | **Ribbon** | Step on the ribbon pad (free, 1 s; opens alone after 90 s) | Flower stands, confetti, **"역앞 카페 개업!"**, rent "+20/분" on the station cash pad |
| ~28 | **Invitation**: the mayor arrives by train and walks to the chief | — | "우리 마을에도 놀러 오세요!". Fog clears over `town` (3 s camera ride along the track). Goal **"솔방울 마을 가 보기"** |
| ~29 | Town visit | Walk ~7 s east, or wait for a train ride (polish backlog) | Buildings pop in by distance. Banner **"솔방울 마을에 오신 걸 환영해요 · 주민 100명"**. School bells, recess, lunch queue, lamps at dusk |
| 29–44 | v3 goals continue, interleaved with v4 | v3 + carry for cards, ribbons, houses | 식당 (~30), 목공소 (~32) → first house on H1 (+4 people), 철물점 (~34, needs tools), 슈퍼마켓 (~39, needs cans); 2nd 역 짐꾼 after the 3rd shop |
| ~44 | v3 complete (existing celebration) | — | — |
| ~45 | 5 shops open, people ≥ 45, happiness ≥ 70 | — | Rank chip bars full; the **승격식** pad (3000) appears |
| **48–55** | **Rank 읍** | Stand on the pad | 12 s ceremony (§9.3): bells, confetti, the main street repaved to cobble, streetlights, second coach, 20 newcomers to the town, new house lots, title 읍장 |

Longest wait for anything new: target ≤ 2.0 min (smart), ≤ 2.5 min (pure arrow). The v4 goal order (§15.1) interleaves with v3 so v3 never stalls.

---

## 3. Map layout and reveal

### 3.1 World and regions (`world.js`, BUILD-A)

- `WORLD.width` 3000 → **6144**. `WORLD.height` stays **3450**.
- No v3 plot, tower, node, building or zone moves.
- New regions in `WORLD.territory`:

```js
// (v4) 서리역 앞: 동쪽 망루에 불이 켜질 때 east 와 함께 열려요
rail: { rect: [3000, 0, 4150, 3450], name: 'r_rail', center: [3420, 1560], openWith: 'east' },
// (v4) 솔방울 마을: 촌장님 초대(첫 가게 개업 뒤)로 열려요
town: { rect: [4150, 0, 6144, 3450], name: 'r_town', center: [4900, 2450], openFlag: 'townInvite' },
```

- **Territory changes** (`Territory.js`, BUILD-A):
  - `openWith`: when the named region reveals, this one reveals in the same frame. On load, a save with `east` open gets `rail` open, instantly.
  - `openFlag`: Neighbours calls `reveal('town')` when the progression flag is set. It also reveals instantly on load if the flag is set or the saved territory has `town`.
  - **Fog on all four sides.** `makeFog` only builds billows for the top and left edges today. `se`'s right edge faces the open `rail` strip from tower_east until tower_se, so add `r` and `b` spans (mirrored banks, same puffs).
  - `borderTrees` gets an optional 7th field `until` (region id): those trees are hidden once that region opens. Use `[2880, 300, 3000, 1500, 100, 'east', 'rail']` and `[2880, 1500, 3000, 3450, 100, 'se', 'rail']`. Add `[3000, 3380, 4150, 3450, 115, 'rail']`, `[4150, 3380, 6144, 3450, 115, 'town']` and `[6024, 300, 6144, 3450, 100, 'town']`.
  - Remove `regionTrees [2720, 1240]`; it sits 0.45 cell from the new 역 가는 길.
  - `areaOf(x)`: `'village'` (start, east, south, se) or `'neighbours'` (rail, town), plus `areaRect(area)`. The overview button frames the area the chief is in (fit zoom ≈ 0.3), so the map never shrinks to a 0.12× view.
- The sea `tileSprite` simply follows `WORLD.width`. BUILD-B moves its creation, unchanged, into `Ground.makeSea()` (§10.2, §3.8).

### 3.2 The lattice and the track

All v4 geometry is on the roads-kit lattice (one cell = √2 m = a 128×64 diamond):

```
L(i, j) = (3120 + 64·(i + j),  1315 + 32·(i − j))        i: iso X (screen down-right), j: iso Y (screen up-right)
px → lattice:  a = (x − 3120)/64, b = (y − 1315)/32,  i = (a + b)/2,  j = (a − b)/2
```

- **The track is lattice line j = 0** (`y = 0.5·x − 245`). It runs 378 px below the coast (`y − shoreY ≈ 378 − 64·j` px), parallel to the east coast.
- Rail tile k covers cells [k, k+1) and is drawn at `L(k + 0.5, 0)` minus its anchor. `rail_x` steps (64, 32) and joins seamlessly. Tiles run from k = −1 (`rail_x_end_n`, buffer stop at the village end) to k = 46 (`rail_x_end_p` at x ≈ 6096, plus a `signpost` labelled "갈매기 항구 방면 (공사 중)" for v6).
- Level crossings (`rail_x_crossing`): **k = 8** (our square) and **k = 33** (town). The 4-car 읍 train ends at i 6.48 at our station and at i 31.98 in town, so both crossings stay clear.
- The ballast is 1.72 m wide (±0.61 cells). Nothing but the stations stands within |j| < 0.75.
- Rails are **ground decals baked into the ground tiles** by RoadPaint (BUILD-B, §10.3), not 50 sprites. Snow-drift decals cover them until the station is repaired.
- All buildings face −Y (`front: "-Y"`), so every building row faces an X-street on its −j side.

### 3.3 Coordinates (validated by `tools/test/v4_layout_ref.py`: inside region with the 46 px inset, ≥ 60 px from the sea, no overlaps with a 0.12-cell margin, nothing on a street corridor or the ballast)

Anchor = footprint centre (town manifest convention).

**Station district (`rail` region)**

| id | art | lattice (i, j) | px anchor | role |
|---|---|---|---|---|
| our_station | `train_station` | (2.5, 2.03) | (3410, 1330) | 서리역. Built on plot `r_station` (size XL, `only: 'station'`). trackPoint (3280, 1395) |
| cargo_pad | pad 1.6 m | (4.1, −1.8) | (3267, 1504) | 짐 싣는 곳: the cargo pad (wholesale sink) |
| order_board | `notice_board` | (2.6, −2.4) | (3133, 1475) | 주문판: stepping beside it opens the order panel |
| stn_cash | pad 1.5 m | (6.3, −1.6) | (3421, 1568) | 역 금고: one cash pad for wholesale, card bonuses and rent |
| stn_porter_pad | pad 1.4 m | (7.6, −2.4) | (3453, 1635) | 역 짐꾼 hire pads (1st, then 2nd on the same spot; the step-off rule applies) |
| rank_pad | pad 1.6 m | (2.6, −1.35) | (3200, 1441) | 승격식 pad (appears when the bars are full). The same spot is the station site's material drop pad while the ruin is being repaired |
| lotA1 | M lot 3.4×3.0 m | (9.65, −1.9) | (3616, 1685) | 1st founded shop |
| lotA2 | M lot | (12.3, −1.9) | (3786, 1769) | 2nd founded shop |
| lotA3 | M lot | (14.95, −1.9) | (3955, 1854) | 3rd founded shop |
| lotB1 | M lot | (12.8, −10.25) | (3283, 2053) | 4th founded shop |
| lotB5 | L lot 4.4×3.4 m | (21.2, −10.25) | (3821, 2321) | 5th founded shop (supermarket) |
| lotB2, lotB3 | M lot | (15.45, −10.25), (18.1, −10.25) | (3453, 2137), (3622, 2222) | house lots after 읍 |
| lotH1–H3 | S lot 2.6×2.6 m | (16.0 / 18.4 / 20.8, −15.2) | (3171, 2313) (3325, 2390) (3478, 2467) | house lots, carpenter |
| lotH4, lotH5 | S lot | (25.5 / 27.9, −15.2) | (3779, 2617) (3933, 2694) | house lots after 읍 |
| town_gate | `town_gate` + board "솔방울 마을" | (18.05, −2.2) | (4134, 1963) | Stands beside 역앞 거리 at the town line; visible from the rail reveal |

The founding order assigns lots: café → A1, restaurant → A2, carpenter → A3, hardware → B1, supermarket → B5 (`BALANCE.v4.founding.lots`).

**Train stop points** (engine on the NW end; `v4_layout_ref.py` prints them):

| Stop | engine | car_a | 3 cars: car_b | 4 cars (읍): car_a2, car_b | train ends (i): 3 cars / 4 cars |
|---|---|---|---|---|---|
| ours | (3174, 1342) i 0.85 | (3280, 1395) i 2.5 | (3381, 1446) i 4.08 | (3381, 1446) i 4.08, (3483, 1496) i 5.67 | −0.07 … 4.90 / 6.48 |
| town | (4806, 2158) i 26.35 | (4912, 2211) i 28.0 | (5013, 2262) i 29.58 | (5013, 2262) i 29.58, (5115, 2312) i 31.17 | 25.43 … 30.40 / 31.98 |

**Neighbour town (`town` region)**: 21 buildings plus props.

| row | id: art (i, j) → px |
|---|---|
| Station (sea side) | town_station: `train_station` (28.0, 2.03) → (5042, 2146), trackPoint (4912, 2211); t_police: `police_box` (31.6, 2.6) → (5309, 2243) "역전 파출소" |
| Row A, j −1.9, faces 솔방울 큰길 | t_cafe (21.0) → (4342, 2048); t_book `bookstore` (23.5) → (4502, 2128); t_play `playground` (26.4) → (4688, 2221); t_fountain `park_fountain` (29.5) → (4886, 2320); t_sled `sled_stop` (31.7) → (5027, 2390); (alley to the crossing at i 33–34); t_toy `toy_shop` (35.3) → (5258, 2505); t_cloth `clothing_store` (37.9) → (5424, 2589); t_flower `flower_shop` (40.5) → (5590, 2672); t_hair `hair_salon` (43.1) → (5757, 2755); t_rest `restaurant` (45.8) → (5930, 2841) |
| Row B, j −10.5, faces 뒷길 | t_post `post_office` (35.5) → (4720, 2787); t_school `school` (39.3) → (4963, 2909); t_hall `town_hall` (43.5) → (5232, 3043); t_clinic `clinic` (46.8) → (5443, 3149); t_fire `fire_station` (49.9) → (5642, 3248) |
| Row C, j −15.3, faces 아파트 앞길 | t_apt1 `apartment_a` (35.7) → (4426, 2947); t_apt2 `apartment_b` (38.95) → (4634, 3051); t_apt3 `apartment_a` (42.2) → (4842, 3155); t_apt4 `apartment_b` (45.45) → (5050, 3259) |

- The low playground and fountain stand in front of the town station, so the waiting train stays visible.
- **Where the 100 live**: apartment_a ×2 (24 each), apartment_b ×2 (18 each) = 84; 7 shopkeeper households above the 7 town shops (1–2 each) = 10; the mayor's family in the town hall (3); fire-station dorm (2); station house (1).
- **Street props** (`WORLD.v4.props`, `[key, i, j]`):
  - `streetlight` every 4 cells on the +j sidewalk cell of 솔방울 큰길 (j −3.5) from i 20 to 48;
  - `streetlight_double` at both crossings;
  - `bench_x` ×2 at the fountain and ×1 in front of the school;
  - `bench_y` ×1 at the playground.
- Our district gets its streetlights at 읍 (§9.4).

### 3.4 Streets (binding street table; RoadNet input, `WORLD.v4.streets`)

`corridor` = cells kept free of buildings, forever. `v4` = what is painted now; `읍` = what the ceremony repaves; `v5` = what v5 may paint without moving anything.
Carriageway edges and lane centre lines sit on even lattice lines (the kit's rut rule).

| id | name | axis | i | j corridor | v4 paint | 읍 | v5 (reserved) |
|---|---|---|---|---|---|---|---|
| main | 역앞 거리 → 솔방울 큰길 | X | 8 … 49.5 | −9 … −3 (6 cells) | `road_dirt` one-lane track j −6 … −4 (shop side) | `road_cobble_wide` two lanes j −8 … −4, `sidewalk` j −4 … −3 | asphalt j −8 … −4, sidewalks both sides, lane + crosswalk markings, curbs |
| back | 뒷길 / 학교길 | X | 13 … 50 | −14 … −12 | `road_dirt` one lane | cobble | one-way or one-lane |
| ave | 솔방울 중앙로 | Y | 30 … 34 | j −18 … −9 | `road_dirt_y` two lanes (4 cells) | cobble | asphalt two lanes |
| square | 역 광장 | — | 2 … 8.3 | −3 … −0.75 | `sidewalk` | — | bus stop |
| link | 역 가는 길 | X | −6.5 … 2 | −1.5 … −0.5 | soft v2 path (Roads edge with `region: 'rail'`) | — | v5 adds a lattice connector |
| shopalley | 가게 골목 | Y | 23.3 … 24.3 | −18 … −9 | footpath (walk only, trodden snow) | `sidewalk` | — |
| homes | 집 앞길 | X | 17 … 30 | −18 … −17 | footpath | `sidewalk` | — |
| apts | 아파트 앞길 | X | 34 … 47 | −18 … −17 | footpath | `sidewalk` | — |
| alley_t | 역 골목 | Y | 33 … 34 | −3 … −0.75 | footpath | `sidewalk` | — |
| platform_e | 승강장 끝길 | X | 30.5 … 34 | 0.75 … 1.75 | footpath | — | — |
| xing_ours / xing_town | 건널목 | — | 8 … 9 / 33 … 34 | −0.75 … 1 | `rail_x_crossing` tiles | — | crossing barrier (v5) |

- **Walk links to the v2 graph** (`WORLD.roads`): new nodes `v_link_w` L(−6.5, −1) = (2640, 1139) and `v_link_e` L(2, −1) = (3184, 1411). New edges `e_east–v_link_w` and `v_link_w–v_link_e`, with `region: 'rail'`. RoadNet generates every other node (§10).
- People leave our platform at its east end (i ≈ 5), walk to the k = 8 crossing, cross into the square, and take 역 가는 길 west to `e_east` and on to the plaza: about 2700 ground px, roughly 25 s for a customer.

### 3.5 Reveal sequence

1. **tower_east site starts** (paid): `Neighbours.prefetch(gs)` (a static call; no instance yet) fetches the v4 manifests (`town`, `roads`, `ui3`), then `town_rails` and the station page of `town_civic`.
2. **tower_east lit**: `Territory.reveal('east')` → `reveal('rail')` in the same frame. The existing pan and banner play. Then `Neighbours` is constructed and, after 1.4 s, focuses the camera on the ruin (3410, 1330) for 2.5 s with banner `railFound` / `railFoundSub`.
3. **Ruin state**: the plot `r_station` (`{ x: 3410, y: 1330, size: 'XL', region: 'rail', only: 'station' }`) shows `train_station` tinted 0x9aa6b4 at alpha 0.85 instead of the plot sprite, three `decal_snow_drift_*` on the platform, label "서리역 고치기", no lamp. The XL site uses two `site_*_L` stage sprites ±1.8 m along X during construction, and its material drop pad is at the `rank_pad` spot (3200, 1441). Drifts cover the rails (baked) from k −1 to the fog.
4. **Repair finished** (`built` event `station`): the tint clears over 0.6 s, `fx_build_done`, one strike of `sfx_bell_hall`, the drifts pop (rail tiles are re-baked through `ground.invalidate(railRect)`), and the first train arrives 3 s later.
5. **Invitation** (`progress.flags.townInvite`): the mayor arrives on the next train and walks to the chief (emote_wave + `mayor_invite`). The fog over `town` clears. The camera rides the track east to the town station for 3 s and comes back.
6. **Visit**: flag `townVisit` when the chief comes within 400 px of the fountain. Banner `townWelcome`.

**Saves** (§12): a v3.5 save with east open loads with `rail` open, the ruin, and the one-time pan + banner 2 s after the first frame (`progress.seen.railFound`).

### 3.6 Camera

- Bounds stay "bbox of the open regions + fog peek" (unchanged code).
- The overview frames the chief's area (§3.1).
- `Game.viewRect()` drives ground baking, residency and doll materialisation, all three.

### 3.7 Collision and occlusion (BUILD-A)

- Every town building / founded shop adds 2–4 collision circles along its footprint's long axis (`addFootprint(def, x, y)` in Collision.js; no API change).
- The train is not an obstacle. It stops for obstacles instead (§4.4).
- `Occlusion` treats train cars and doll rigs as subjects (bounds from `DollSprite.getBounds()`), so row A shops fade when the train or a person is behind them.

### 3.8 Forward compatibility (no v4 code beyond the seams)

- **v5 vehicles**: the 6-cell main-street corridor and the 4-cell 중앙로 are reserved. RoadNet already has classes, lanes, junctions and crossings (§10). Bus and sleigh stops go on the +j sidewalk of 역앞 거리 and 솔방울 큰길. Truck route: plaza → 역 가는 길 (v5 connector) → main street.
- **v6 갈매기 항구**: the j = 0 line continues east past the buffer stop at k = 46. The coast keeps its 0.5 slope, so a harbour station on the same line is still ~378 px inland. The world widens then; Ground's tile pool and the rect regions already cope.
- **v7 햇살 해변 and living water** (the designer's request "바닷물도 진짜처럼… 출렁 파도치고… 해수욕장… 상가와 호텔… NPC"):
  - v4 keeps the strip between the track and the sea free, except the two stations and the 파출소.
  - The sea stays the plain `water_sea` tileSprite, created only in `Ground.makeSea()`, and the shoreline stays the single `shoreY()` function. Swapping in `Water.js` (shore type `snowbank` along our coasts, `sand` at the v7 beach) is then a one-method change.
  - 8 MiB of the core texture budget is held for the water textures (§11.2).
  - The townsfolk runtime (pages, DollSprite, schedules as data) is what beachfolk will reuse; beachfolk follows the same compact atlas format.
  - Recommendation to the orchestrator: integrate the living water as its own step right after v4 ships (it touches only `Ground.makeSea()` and the ambience), so the designer sees the new sea soon. **Not** part of BUILD-A or BUILD-B.

---

## 4. The snow train (BUILD-A: `src/systems/Rail.js`, `src/entities/Train.js`)

### 4.1 Geometry and consist

- **Position** is a scalar `m` (metres along the track from the buffer stop at i = −1); screen = `L(−1 + m/√2, 0)`.
- **Stops**: car_a at i = 2.5 (ours) and i = 28.0 (town). The leg is 25.5 cells = 36.1 m.
- **Consist** (`trainConsist`): engine, car_a, car_b, spaced 2.34 m and 2.24 m anchor to anchor. At 읍 a second `train_car_a` goes between car_a and car_b (2.24 m).
- **Push-pull, engine on the NW end**: toward our station the engine leads, heading NW (NE frames mirrored, `shadow_NW`). Toward the town it pushes from the back: still drawn heading NW, playing a reversed anim key `train_engine:move_rev:NW` built once from the reversed frames. The cars play `move` forward or reversed to match.
- **Only NW-heading frames and shadows are needed.** The asset compiler (§11.3) keeps just those: 16.6 → ~5 MiB.

### 4.2 Kinematics and timetable (balance `v4.train`)

- vmax 2.6 m/s (166 ground px/s; anim fps = 12 × v / vmax), accel 0.6 m/s², brake 0.8 m/s². One leg: 4.3 s accelerating + 10.1 s cruising + 3.3 s braking ≈ 17.7 s.
- Dwell 14 s at ours, 10 s in town. **Cycle ≈ 59 s.**
- Phases `toOurs → atOurs → toTown → atTown`, each `{t, dur}`, pure functions of a phase clock (testable in Node).
- Always simulated (~0.02 ms). Sprites exist only while the train is within 900 px of the view.
- Before the station is repaired the train does not run. Before the town opens, it disappears into, and comes out of, the town fog. The fog's depth is above world objects, so that just works.

### 4.3 Feedback

| Moment | Sound | Visual | Text |
|---|---|---|---|
| 2.5 s before arrival | `sfx_steam_whistle`, positional (audible within 900 px) | `fx_smoke_puff` at `smokePoint` every 0.35 s while moving | — |
| last 4.2 m (braking) | `sfx_brakes` | 3 puffs at the wheels | — |
| doors | `sfx_door` (throttled to 1 per 0.3 s) | people fade in at the station's `boardPoints` (stagger 0.25 s) | — |
| arrivals 1–3 | — | camera focus 2.5 s on the first only | toast `trainArrive` `솔방울 기차 도착 · 손님 {n}명` |
| later arrivals | — | train edge icon in the HUD when the chief is in the `neighbours` area and the train is off screen | — |
| blocked track | whistle ×2, then every 3 s | stops 1.5 m before the obstacle | `obj_off_track` "기찻길에서 비켜 주세요!" after 2 s |
| night | — | lamp glow at `lampPoint`, lit windows (car glow) | — |

The goods wagon (car_b) shows loaded crates at its `cargoPoint`, and items fly from the cargo pad into it while it stands.

### 4.4 Safety

- The train never pushes anyone. Obstacles are the chief, the dog and any walker whose position is within ±0.9 m of the centre line and within 1.5 m ahead.
- Citizens and visitors only cross at crossings: `Roads.edgeBlocked(e)` returns true for a crossing edge while any car is within ±6 m of it or will reach it within 3 s. Walkers wait at the crossing stop point, 1.2 m from the rail.
- The dog's roam excludes |j| < 1 cells.
- A blocked timetable just waits; the chief is the only possible lasting blocker.

### 4.5 Hooks

`__FV.v4.train(phase, t)` jumps the timetable. `__FV.state().v4.train = { phase, t, m, riders, cars }`.

---

## 5. Townsfolk: simulation, LOD and composition

### 5.1 Paper-doll runtime (BUILD-A: `src/core/Townfolk.js`, `src/entities/DollSprite.js`)

- **Port** of `tools/townfolk_compose.js`. The generator (presets, conflicts, palettes, tint table) and the layer rules (mirror dirs, round-base `scaleX`, head offsets, z / zFront / follow) stay **byte-identical**. `tools/test/townfolk_runtime.mjs` checks parity: 1000 seeded people, every anim, dir and frame give the same draw lists as the tools copy.
- **Frame resolution goes through one function**, `TF.frame(layer, frameName)`:
  - before BUILD-B's pages land, it uses the raw compact atlases, installed per sheet as each image arrives (`townfolkInstall` logic, per sheet);
  - once `assets/_packed/index.json` exists, it uses the packed pages (§11.3).
  - A missing frame means "draw nothing" for that layer.
- **Caches**: a frame-object cache `Map(layer|anim|dir|i → Phaser.Frame)` and a per-person layer plan (layer, tint, z rule, sheen computed once). A refresh allocates nothing and happens only on a frame change.
- **Anims in v4**: idle, walk (5 dirs) and talk, wave, happy (S/SE/E). `carry_walk` is **not loaded**: carrying uses walk/idle plus the village's head carry (`Character.carryOffset` 'head'). From townfolk2 only the 6 head override frames are used (they fix the black `hat_cap.visor/up_*` and `hat_headband.main/soc_*` frames), merged by pack_pages. Until they land, `hat_cap` and `hat_headband` are excluded from generation. The tf2 merge code is ported but disabled (`TOWNFOLK2 = false`) for v5.
- **DollSprite** is a duck-typed stand-in for `Phaser.GameObjects.Sprite`, implementing what Character, Customer, Bubbles, tweens and Occlusion use:
  - `x`, `y`, `depth`, `alpha`, `visible` setters that reach every layer;
  - `setPosition`, `setDepth` (each layer at `depth + z·1e-4`), `setScale`, `setAlpha`, `setVisible`, `setFlipX`, `setOrigin` (no-op), `getBounds`, `destroy`;
  - `anims.play(key | {key, startFrame})`, `anims.currentFrame`, `anims.currentAnim`, `on(ANIMATION_UPDATE)` (fires its own frame events).

  It is a **proxy**: it borrows a rig (16 Images + 1 shadow) from `DollPool` only while it is materialised (§5.3), and returns it when it isn't. A rig is never destroyed while the town exists.
- **Character integration**:
  - `new Character(gs, 'tf:<base>', x, y, { person })` creates a DollSprite instead of a Phaser sprite.
  - `Assets.charDef('tf:<base>')` is a synthetic def built from the townfolk manifest: anims and dirs, anchor [0.5, 0.8125], `headTop` from the base's head offset (children are shorter), shadow from `bases[b].shadow`, `_dirs` filled.
  - `Character.play` skips the `anims.exists` check for dolls.
  - Nothing else in Character, Customer or Bubbles changes.
- **Lite rig**: base body, top, bottom, head, hair (5 layers). Used for rigs over the full-rig cap and for everyone below zoom 0.7.
- **Dots**: a 16×24 tinted capsule, used below zoom 0.4 (overview).

### 5.2 Population and data (BUILD-A: `src/systems/TownSim.js`)

- **100 town citizens**, generated deterministically from `BALANCE.v4.town.seed` (id → seeded rng → person look, name, age, kind). Plus **district citizens**: founders' households and house residents.
- One citizen (plain object, fixed fields):

```js
{ id, kind, person,            // person from Townfolk.generate / preset; regenerated from (seed, id), never saved
  name, age, home, work, fav,  // fav: favourite food (item key)
  act, place, wakeT,           // current activity, place id, next event time (clock seconds, absolute)
  route, t0, speed, lane,      // route cache index, start time, 60..90 px/s, ±10 px lateral offset
  lod, flags,                  // 3 dormant | 2 analytic | 1 near | 0 materialised; INDOORS | ON_TRAIN | IN_VILLAGE | DISTRICT
  body, visits }               // DollSprite-driving Character while materialised; visits to our village (단골 at ≥ 3)
```

| Kind | Count | Preset / look | Home | Work / day |
|---|---|---|---|---|
| student | 18 | `student` (child bases) | apartments | school |
| teen | 6 | random teen / `student` | apartments | school, then café or bookstore |
| shopkeeper | 7 | `barista` (café), `hairdresser` (salon), random (others) | above their shop | own shop `staffPoints` (outside; the shops are closed boxes) |
| civic | 13 | `teacher` ×3, `police` ×2, `postal` ×2, `doctor`, `nurse`, firefighter ×2 (`factory` + helmet colour), mayor, `station` attendant | apartments / hall / dorm / station house | their building |
| adult | 36 | random adult | apartments | errands + **village trips** |
| elder | 17 | random elder | apartments | benches, café, clinic, **village trips** (they love bread) |
| builder | 3 | `factory` + `hardhat` | apartments | idle at the hall until a founding calls them |

- **District citizens** are added by Growth (BUILD-B) through TownSim's API: each founder brings a household of 2, living above the shop; each house brings 4. They follow district templates (shopkeeper at their shop 08–19; residents do errands at the plaza and the district shops). They never ride the train.
- **Places** come from manifest points (`doorPoint`, `staffPoints`, `customerPoints`, `gatherPoints`, `playPoints`, `seatPoints`, `waitPoints`, `boardPoints`). Each place has a capacity and an occupied count, so nobody stacks. Shops-as-boxes rule: "inside" = at the door, faded out.

### 5.3 LOD (logic for all, sprites for few)

| Tier | When | Per-frame work | Visual |
|---|---|---|---|
| L3 dormant | indoors, on the train, visiting our village (they are a Visitor then) | none; woken by the event heap at `wakeT` | none |
| L2 analytic | outdoors, beyond view + 600 px | none; `pos(t) = route.at((t − t0)·speed)` (binary search on `cum`) when asked | none |
| L1 near | outdoors, within view + 600 px, off screen | integrate along the route, lane offset | none |
| L0 materialised | within view + 120 px, nearest first, up to the cap | anims, 64 px spatial-hash separation, bubbles, chats | full rig (cap `perf.maxRigs` 32, low tier 16), then lite rigs (cap `perf.maxLite` 40), dots below zoom 0.4 |

- Tiers are reassigned every 0.25 s with 60 px hysteresis.
- Materialising fades the rig in over 0.25 s, unless the person comes out of a door (fade at the door + `sfx_door` within 300 px).
- **Event heap**: a binary min-heap of `(wakeT, id)`, about 100 × 10 transitions per 600 s ≈ 1.7 pops/s.
- **Routes**: cached per (fromPlace, toPlace): door spur + RoadNet walk route + door spur, as `{pts: Float32Array, cum: Float32Array, len}`. Up to ~600 entries (~60 KB).
- Citizens are **never** in `gs.agents` (avoids the O(n²) separation). Visitors are, while in the village.
- **CPU budget** (fixed-step bench): heap + schedules ≤ 0.05 ms, L1/L0 movement + tiering ≤ 0.10 ms, rigs ≤ 0.15 ms, rail ≤ 0.03 ms. **Town sim ≤ 0.35 ms per frame.**

### 5.4 Schedules (`BALANCE.v4.townLife`, hours on the clock; each citizen ±0.4 h seeded jitter)

| Kind | Day |
|---|---|
| student | 07:30 leave home → 08:00 school gate (`gatherPoints`, bell) → inside; 10:30–10:50 recess in the yard (`playPoints`); 12:00–12:40 lunch in the yard; 15:00 bell → playground or fountain → 17:30 home |
| teen | like students; 15:30–17:30 café or bookstore `customerPoints` |
| shopkeeper | 07:40 → own `staffPoints`; 12:00–12:40 lunch at the restaurant or café; 18:30 home |
| civic | teachers at school 07:45–16:00; mayor + clerk at the hall; postal **route** (post office → 8 doors, loop); police **patrol** (main streets, one also at night); doctor/nurse at the clinic; firefighters at the station's `gatherPoints`; station attendant on the platform whenever a train dwells |
| adult | 08:00 home → errands (2–3 town shops, 6–15 min each) → **village trip** with probability `tripChance` (afternoon window 13–18) → home 19:00; 30% evening walk 19–20 |
| elder | 09:00 fountain or benches → 11:00 café → clinic (20%) → **village trip** (morning window 09–12 and afternoon 14–17) → home 18:00 |
| builder | idle at the hall square until called |

**Set pieces** (town; logged even off screen):
- 08:00: school bell (`sfx_school_bell`, school `anims.ring`), kids stream in;
- 10:30: recess (kids run, `emote_snowball`);
- 12:00: hall bell (`sfx_bell_hall`), lunch queue of up to 6 at the restaurant;
- 15:00: school out, kids run at 1.4× walk speed to the fountain/playground;
- 17:30: shops close, commuters to the platform (the dusk train is full);
- 19:00: streetlights come on one by one from the station outward (0.15 s apart);
- 21:00: most people are inside; 3 elders doze on benches (`emote_zzz`); the night police patrol continues.

**Density tricks** (camera-aware, the VillageLife.pickArea idea):
- the schedule fixes the activity, but the spot inside a place prefers camera-near points;
- `amb_town` volume = 0.15 + 0.5 × min(1, live/30);
- tap a citizen → name card bubble 2.5 s: `민지 · 9살 · 학교 가는 중 · 좋아하는 것: 빵`, `단골 ★` for regulars (polish backlog P1).

---

## 6. Day and night (BUILD-A: `src/systems/DayClock.js`)

- **Clock**: day length 600 s (1 game hour = 25 s), saved as `{t, day}`. It **starts at 08:00 with the first train**. Before that there is no clock, no tint and no visual change.
- **Phases**: dawn 06–08, day 08–17, dusk 17–20, night 20–06 (night = 140 s = 23%).
- **Overlay**: one camera-sized `Rectangle`, blend `MULTIPLY`, depth `DEPTH.FX − 30` (above world objects and flying items; below bubbles, labels, arrows; the UI scene is unaffected).
  - Colours (alpha = intensity): dawn `#ffd6b0` 0.15; day none; dusk `#ffb070` → `#7d88c8` 0.25; night `#5a6aa8` 0.35 (`darkness`).
  - Transitions lerp over 8 s.
  - Readability floor: every channel stays ≥ 65% brightness (night: 0.77 / 0.80 / 0.88).
  - Canvas renderer: the same rectangle with `globalCompositeOperation = 'multiply'`, or off if unsupported.
- **Glows**: a generated 96 px radial texture `fv_glow` (made like `fv_shadow`), ADD blend, alpha 0.7, pooled. At most 40 on screen, nearest first.
  - Points: `streetlight` `fxPoints.light`, `streetlight_double`, village `lamp_post` decor tops, campfires, the station clock (`fxPoints.clock`), train `lampPoint`, and town windows (house glows, `WORLD.v4.windowGlows`, polish P1).
  - Lights turn on at 19:00 and off at 06:30.
- **Economy is neutral**: stations, workers and porters never slow down at night. Only townsfolk demand moves (visitors ×0.3 at night, ×1.3 at dusk, ≈1.0 averaged over a day).
- **Settings → "낮과 밤"** (default on). Off = always day; the clock still runs, because schedules need it.
- **Audio**: `amb_night` fades in 20–06 at 0.35, `amb_town` follows live citizens.
- **Hooks**: `__FV.v4.clock(hour)` sets the hour; `state().v4.clock = {hour, phase, day}`.

---

## 7. Shoppers and demand (BUILD-A: Seller.js + `src/entities/Visitor.js`)

### 7.1 Anonymous customers look like neighbours

- Once the first train has arrived **and** the doll art is ready, `Market.pickLook()` returns `{key: 'tf:<base>', person}` for every new anonymous customer of the plaza market and the general store. The person is a real citizen: an adult, elder or teen whose schedule is errands or a trip right now, otherwise any adult.
- Spawn points, rates (`spawnEvery`, `spawnEveryLate`), wants, queue, register, `waitingPay` and payment are **exactly v3.5**.
- Their visits are counted, so regulars get the star (`단골`).
- `villager_a/b/c` are no longer used after that; residency evicts them (§11).

### 7.2 Train visitors (the real 100 riding in)

- **Riders per train** = `max(1, round(min(base + shops × perShop + (rank − 1) × perRank, seats) × phaseMult))`:
  - base 4, perShop 1, perRank 3;
  - seats 12 (+8 with the 읍 coach);
  - phaseMult: dawn 0.5, day 1.0, dusk 1.3, night 0.3.
- TownSim picks riders among awake, free adults/elders/teens. Off-screen ones are moved abstractly; on-screen ones must already be waiting at the platform. **The first train always brings 6.**
- **Alighting**: each rider becomes a `Visitor` (a `Customer` subclass with a doll body) at a `boardPoint` of our station. Each visitor gets a **shopping plan** of 1–2 targets, drawn only from what is actually on offer right now:
  - plaza market (foods on the shelf), weight 0.7;
  - general store (cans/tools; only if it is built), weight 0.25;
  - **a founded shop** with stock (`growth.shopTargets()`), chance `shopChance` 0.45.
- Wants: 2–4 items, weighted toward `citizen.fav`.
- **Walking**: RoadNet walk route platform → crossing → square → 역 가는 길 → v2 roads → target. Visitors are in `gs.agents` while in the village.
- **Market queue**: visitors join the normal queue (`maxQueue` 10). While ≥ 2 visitors wait to join, anonymous spawns pause, so the visible neighbours get served. If the queue is full, they browse nearby VillageLife areas and retry every 5 s, up to `patience` 60 s.
- **Founded shops**: the visitor queues at the shop's `customerPoints`. The owner (at `staffPoints`) hands over 1–3 items from the shop stock (1.2 s each, `emote_heart`). The coins go to the shop, not to us; we earn when we restock it (§8.4).
- **Done**: the visitor carries the goods on the head, walks back to our platform (`waitPoints`), boards the next train (fade at a `boardPoint`), returns to the town, and resumes its schedule (goes home). **People are conserved**: town + train + village = total, always (tested).
- **Satisfaction**, emitted as `gs.events.emit('v4:visitorDone', person, frac)`:
  - every item = 1.0;
  - part = 0.6;
  - queue never reached (patience out) = 0.3;
  - nothing in stock = 0.
- **Feedback**: want bubble as today; full = `emote_heart`; partial = `emote_dots`; nothing = `emote_tear` + `LINES.shopper_sad`. Regulars arrive with `LINES.regular` (1 in 3) and a star on the bubble.
- **Not saved**: visitors in the village vanish on reload ("went home"). Their unpaid items are already put back on the shelves by the existing `serialize()` queue logic.

### 7.3 Income rule

Customer arrivals = v3.5 anonymous rate + train visitors (+ shop sales that turn into wholesale). **Income can only go up.** Expected at ~40 min:
- visitors add 10–20% to retail;
- wholesale + card bonuses ≈ 150–300 coins/min while cards are open;
- rent at 5 shops = 145 coins/min.

The bots watch that v3 isn't trivialised (§16.3); `wholesale.rate` is the first knob.

---

## 8. Orders, founding, wholesale, rent, houses (BUILD-B: `src/systems/Growth.js`, `src/entities/Shop.js`)

### 8.1 The order board (주문판)

- Up to **3 cards**. Card = `{id, shop | null, need: {item: n}, got: {item: n}, idle}`. They are shown in the order panel and as the HUD order chip (the focus card).
- **Founding cards** come first, in this order. A card is offered only once its producer exists; otherwise the next one is offered.

| # | Shop (art) | Card ("…보내 주시면 …을 열게요") | Needs first | Lot | Rent |
|---|---|---|---|---|---|
| 1 | 역앞 카페 (`cafe`) | 빵 30 | `zone_farm` | A1 | 20/분 |
| 2 | 생선구이 식당 (`restaurant`) | 생선구이 40 + 훈제고기 15 | `zone_hunt` | A2 | 30/분 |
| 3 | 목공소 (`carpenter_workshop`) | 판자 50 | `zone_forest` | A3 | 25/분 |
| 4 | 철물점 (`hardware_store`) | 주괴 25 + 도끼 1 + 곡괭이 1 | `b:toolsmith` | B1 | 30/분 |
| 5 | 슈퍼마켓 (`supermarket`) | 통조림 30 + 빵 20 | `b:cannery` | B5 | 40/분 |

- After the 5 founding cards come **정기 납품** cards from `orders.standing`, in rotation: 빵 40, 생선구이 50, 판자 40, 주괴 25, 통조림 30, 훈제고기 25. They give coins only (bonus 0.3; 0.5 from 읍).
- A card with no progress for 180 s shows a free **다른 주문** swap button (the next eligible card takes its place).

### 8.2 The cargo pad (짐 싣는 곳) and wholesale

- It is a logistics sink at **`PRIO.WHOLESALE` 30** (below shelves 40, above the warehouse 10). It accepts any item an open card still needs, and only up to that need.
- **Paths that fill it**:
  1. **The chief** standing on it: carried items an open card needs fly in at `padItemInterval`.
  2. **역 짐꾼** StationPorters (§8.5).
  3. Nobody else: regular porters ignore remote sinks.
- **Payment**: every accepted item pays `price × wholesale.rate` (0.7) into **역 금고** (the station cash pad), with a coin pop. When a card completes, `bonus × Σ(need × price)` (0.5) is paid on top.
- **Visual**: each item flies into car_b's `cargoPoint` if the train is in, otherwise onto a crate stack on the pad, which is loaded at the next arrival. Crates show on the wagon as it leaves.
- **Logistics changes** (BUILD-B): `PRIO.SHOP = 35`, `PRIO.WHOLESALE = 30`, a `remote: true` flag on station sinks. `best()` skips remote sinks unless `opts.remote` is set, and the `bestAny` restock of WarehousePorter skips them too.

### 8.3 Founding sequence (about 90 s from card done to open)

1. **Card done**: `sfx_mission_done`, the card flips to `ui_mission_card_done`, coins fly. Banner `orderDone` / `{shop} 창업 준비 중`.
2. **Next train**: Growth asks `town.sendByTrain('founder', {shop})` and `sendByTrain('builder') ×2`. A founder household (2 people) and 2 builders alight. The founder walks to the lot with `emote_exclaim` and says `founder_ask`.
3. **Build**: plot sprite `site_plot_M/L` → `site_foundation_*` → `site_scaffold_*` at 50%, **25 s** in total. Builders hammer (`fx_build_dust`, `sfx_hammer`). No player cost.
4. **Built**: `fx_build_done`, the shop sprite, two `flower_stand`s (life2) at `doorPoint ± (40, 0)`, and a **ribbon pad** at `doorPoint + (0, 46)`.
5. **Ribbon**: the chief stands on it (1 s) → confetti, `sfx_fame_up`, banner `{shop} 개업!`. Residents within 600 px cheer, the owner waves. The shop opens: its stock sink starts, rent starts, the household moves in (district citizens +2). If the chief never comes, the shop opens by itself after **90 s** with a smaller banner.
6. **Invitation**: the first opening triggers the mayor (§3.5). Fallback: 8 min after the first train even with no shop.

### 8.4 Founded shops while open

- The owner stands at `staffPoints[0]` 08–19 (night: inside, door lit).
- **Stock**: one shelf per sold item, `shopShelf` 20 each, shown as an ItemStack at `inPoint`. Restocking is a remote logistics sink at `PRIO.SHOP` 35. Each restocked item pays **wholesale (0.7)** into 역 금고.

| Shop | Sells (= restocks) |
|---|---|
| 카페 | 빵 |
| 식당 | 생선구이, 훈제고기 |
| 목공소 | — (uses 판자 for houses, §8.6) |
| 철물점 | 도구 5종 |
| 슈퍼마켓 | 통조림, 빵 |

- **Demand**: train visitors (§7.2) and district residents' errands. Each shop also "sells inland" 1 item per 40 s while stocked (the town's own customers), so a shop never sits full forever.
- **Rent**: `rent/60` coins per second into 역 금고, uncollected rent capped at `rent.cap` 2000. The pad shows `+N/분`. From 읍 on, 역 금고 empties itself into the coin counter every 15 s (coins fly to the HUD).
- Passing chief: the owner gives `emote_thumbs` (cooldown 25 s).

### 8.5 역 짐꾼 (StationPorter, BUILD-B in `Worker.js`)

- Hire pads on the square: `stn_porter` 600 (after the first train), `stn_porter2` 1100 (after the 3rd shop opens). Same spot; step-off rule.
- `StationPorter extends WarehousePorter`: home at the square, capacity 12.
- **Sources**: the warehouse output, plus any station or workshop output that is ≥ `warehouse.overflowAt` (0.6) full. So it only takes surplus and never starves the plaza.
- **Sinks**: remote only (cargo pad, shop shelves, house sites).
- **Loop**: `L.bestAny(types, x, y, {onlyRemote: true})` → walk to the source → load → haul. Round trip ~4000 px ≈ 27 s → ≈ 25 items/min.

### 8.6 Houses (the carpenter's growth)

- When 목공소 is open, house lots H1–H3 show a `site_plot_S` with "목수가 집을 지어요 · 판자 20". The site is a remote sink at `PRIO.SITE`. Planks delivered there pay wholesale too.
- With 20 planks in, the carpenter + 1 builder build for 30 s → `townhouse_a..d` (seeded) → 4 district citizens move in (they walk in from the town gate with luggage). Banner `houseMoved` "새 이웃 4명이 이사 왔어요!".
- One house builds at a time. After 읍: H4, H5, B2 and B3 become house lots too (up to 7 houses, +28 people).

### 8.7 Happiness

`happy = base + (100 − base) × mean(last 40 satisfactions)` with base 50 (§7.2). It is shown as the third rank bar. The hint (§15.3) points at the empty shelf that causes most of the "nothing" visits.

### 8.8 Growth API (owned by BUILD-B, used by BUILD-A)

`growth.shopTargets()` → `[{id, x, y, customerPoints, staffPoint, stock, sells, serve(visitor, cb)}]`; `growth.openShopCount()`; `growth.serialize()`.

Growth listens to `v4:visitorDone`, `v4:train`, `built`.

---

## 9. Rank 마을 → 읍 (BUILD-B: `src/systems/Rank.js`)

### 9.1 Bars (rank chip + panel)

| Bar | Value | Need for 읍 |
|---|---|---|
| 인구 (people) | village residents (`life.people()`) + district citizens (founder households 2 each, house residents 4 each) | **45** |
| 가게 (shops) | founded shops open | **5** |
| 행복 (happiness) | §8.7 | **70** |

Expected at ~45 min: village ~28 + 10 founders + 2 houses × 4 = 46.

### 9.2 The pad

When all three bars are full, the **승격식** pad (3000 coins) appears at the station square (§3.3 `rank_pad`). It is Progression step `rank_eup` (type `rank`, flag `rankReady`). Goal text when unaffordable: `승격식 준비 {coins}`.

### 9.3 Ceremony (12 s; any joystick input after 3 s skips to the end state)

1. Camera to the station square. Residents and materialised citizens within 900 px gather in a ring (`town.gather(x, y, r, n)` + VillageLife party reuse).
2. `sfx_bell_hall` ×3, music ducks. Banner **"서리마을 → 서리읍!"** / `rankUpSub`. The badge flies from the square to the HUD chip (`ui_badge_rank_1` → `ui_badge_rank_2`).
3. Confetti + 10 star bursts (the `celebrate3` pattern).
4. **Repave wipe**: `roadNet.upgrade('main', 'cobble')` + sidewalk cells. `ground.invalidate()` runs tile by tile outward from the square every 0.25 s for ~3 s, with `fx_poof` at the wipe front.
5. New `streetlight`s pop along 역앞 거리 (every 4 cells, +j sidewalk). Toasts list the rewards.

### 9.4 Rewards

| Reward | Effect |
|---|---|
| Cobble roads + streetlights | Main street, 뒷길 and 중앙로 become cobble; footpaths become sidewalk; district lights at night |
| Auto rent | 역 금고 flies to the HUD every 15 s |
| Second passenger coach | seats 12 → 20, visitors per train up to 14 |
| Town grows | town people 100 → 120: 20 newcomers arrive on the next trains with luggage and move into the apartments |
| New lots | H4, H5, B2, B3 become house lots (+4 each) |
| Better orders | 정기 납품 bonus 0.3 → 0.5 |
| Title | "읍장" + `ui_badge_rank_2` in the HUD |

Rank 3 (도시) is v5. The panel's third row reads "도시는 다음 버전에서".

---

## 10. Road graph and road visuals (BUILD-B)

### 10.1 RoadNet (`src/systems/RoadNet.js`, pure JS, Node-testable)

```js
cells:   Map<key=(i+512)*1024+(j+512), { t: ROAD|WALK|SQUARE|RAIL|XING, street, cls: 0 dirt|1 cobble|2 asphalt, region }>
streets: [{ id, axis, i:[a,b], j:[a,b], cls, lanes (each way), walk, region, upgrade: { 2: 'cobble' } }]   // from WORLD.v4.streets
nodes:   [{ id, i, j, x, y, kind: 'junction'|'end'|'bend'|'xing'|'door'|'link' }]
edges:   [{ a, b, street, lenM, cls, lanesEach, walk, region, xing: idx|-1, laneOff: [+1, -1] cells (right-hand) }]
lanes:   (v5) directed lane edges + junction connectors { inLane, outLane, turn: S|L|R|U, polyline, conflicts[] }, node control 'none'|'yield'|'lights'
doors:   building door -> shortest spur to the nearest walk edge **on its front (−j) side**
```

- Junctions are generated where street cells intersect; T-ends and dead ends too. Pedestrians use street centre lines (one-lane) or the +j sidewalk line (two-lane corridors).
- `walkGraph()` emits nodes `g:<id>` and edges in the existing `{nodes, edges}` format (with `region`, `walk`, `xing`). They are merged into `Roads` with `roads.addGraph()` and joined to the v2 graph at `v_link_e`.
- Expected size: v2 47 nodes + ~110 grid nodes + ~45 door spurs ≈ 200.
- **Roads.js changes** (same API for every existing caller):
  - binary-heap A* (open list was a linear scan);
  - path cache key `a * 65536 + b`;
  - `nearestK` over a 256 px bucket grid;
  - `edgeBlocked(e)` hook for crossings (the walker waits at the stop point instead of re-routing);
  - region usability unchanged (cells in `town` are usable only when `town` is open).
- **API**:
  - `roads.route(ax, ay, bx, by, out)` (unchanged, now crossing-aware);
  - `roadNet.route(from, to, {mode: 'walk'|'drive', avoid, out})` → `{pts, cum, edges, xings, lenM}`;
  - `roadNet.laneCentre(edge, dir, t)`, `roadNet.stopLine(edge, dir)`, `roadNet.upgrade(streetId, cls)`.
- v4 ships `drive` mode with unit tests only; v5 adds `Vehicle.js` on top.

### 10.2 Ground hooks (`src/systems/Ground.js`, BUILD-B, landed in Phase 0)

- `ground.addBakeHook(fn(ctx, x0, y0, w, h), rect)` (hooks run after paths, before decals);
- `ground.invalidate(rect)` (drops baked tiles; they re-bake one per frame);
- `Ground.makeSea()` (the existing sea + fish tileSprites, moved unchanged).

### 10.3 RoadPaint (`src/systems/RoadPaint.js`, BUILD-B)

Bakes grid cells into ground tiles, a JS port of `tools/fx/gen_roads.py compose()` and the manifest's `roadKit` rules:
- **Textures** at **scale 1**, pattern origin at G: `road_dirt` (ruts along X), `road_dirt_y`, `road_dirt_cross` (junction squares), `road_cobble_wide`, `road_asphalt` (v5), `sidewalk`.
- **Edges and corners**: `snow_edge_*` between paved and snow; `curb_*` between carriageway and sidewalk (읍+). Corner pieces from the four cells around each lattice point.
- **Markings** (city class, v5 only): `lane_*`, `crosswalk_*`.
- **Rails**: `rail_x`, `rail_x_crossing`, `rail_x_end_n/p` as ground decals, plus snow drifts until the station is repaired.

The roads atlases are **bake-only**: loaded as `HTMLImageElement`s, never uploaded to the GPU, and released 10 s after the last bake. The v2 link path is drawn by the existing region road overlay for `rail`.

---

## 11. Texture memory: budget and strategy (BUILD-B)

### 11.1 Baseline (measured; Phaser source-sum `w·h·4` over all texture sources, the v3.5 reviewers' probe)

| What | MiB |
|---|---|
| Title | 88 |
| New game after the lazy gates | 368 |
| Full v3.5 village (peak) | 441–455 |
| … of which atlases | 369 (villagers + 2 + 3 = 198 for 38 atlases; characters 38; workers 37.5; buildings 35.3; props 15.7; ui2 10.5; fx 9.3; ground 8) |
| … of which canvases | ≈ 72–77 (12 ground tiles × 4 = 48, road overlays 18.5, zone floors 10.7); never freed |
| v4 art if loaded raw | town 56.6, townfolk 104.7, roads 11.7, ui3 1.5 (+ life2_wedding 1.6) = **+176** |

### 11.2 Budgets (source-sum MiB; the GL-level probe must agree within 10%)

| Scenario | **Must** (release blocker) | **Target** (planned) | Stretch |
|---|---|---|---|
| Title | ≤ 90 | 90 | 90 |
| New game, title → 20 min (peak) | ≤ 368 (= v3.5) | ≤ 240 | 210 |
| Full v4 save, any view, zoom 0.6–1.7, high tier | ≤ 455 (= v3.5 peak) | **≤ 300** | 256 |
| Transient (area change, zoom change), ≤ 10 s | ≤ 480 | ≤ 340 | 288 |
| Low tier, any view | — | ≤ 200 | 176 |
| Leak check (tour → back to start) | ≤ baseline + 5 | same | same |

- The core budget includes **8 MiB held for the v7 water** textures.
- "Must" means v4 is never heavier than v3.5 already is. "Target" is what the strategy below is sized for.
- The naive v4 load (+176) breaks even the must, so **§11.3 (a)–(c) are mandatory work**, scheduled first in BUILD-B.

### 11.3 Strategy (in priority order)

**(a) Asset compiler `tools/build/pack_pages.py` (Pillow + numpy; mandatory)**
- Reads the existing manifests and atlases and writes `assets/_packed/` + `index.json`. It never edits source folders.
- It exits 1 if any manifest frame would be dropped; `--check` resolves every frame.

| Output | Rule | Effect |
|---|---|---|
| Character pages | every villager / worker / character atlas → `@core` (idle, walk, sit, run; + carry_* for carriers; + work/operate/serve/give/chop/mine/harvest/pet/throw for job and player keys) and `@social` (everything else) | resident core ≈ 24% (residents) / 47% (job keys) of today's atlas |
| Townfolk pages | per age group × {loco, social} + heads {loco, social}; `carry_walk` dropped; the 6 tf2 head override frames merged into the head pages | loco ≈ 39 MiB, social 48.6 MiB on demand |
| Town pages | `town_civic` → `town_station` (+ rest); `town_shops` → `_a` (town-only shops) and `_b` (cafe, restaurant, carpenter, hardware, supermarket = the founded ones); train atlases → NW heading frames + `shadow_NW` only | the district needs only `town_station`, `_b`, rails and the train (~13 MiB) |
| Half tier | every `@core` at 0.5 scale, packed per fragment into shared sheets (target item, §11.3e) | ¼ memory below zoom 0.85 |
| Portraits | 55 PNGs → 1 atlas | −54 files |
| Frame index | one compact index per fragment (`[x, y, w, h, dx, dy]`) instead of a Phaser JSON per atlas | −100+ files; pages re-created without re-fetching |

- `Assets.js` uses `_packed/` when `index.json` exists and falls back to v3.5 behaviour otherwise, so dev runs from raw assets still work.
- Anims are built per page; a character's anim may take frames from two pages.
- `build_artifact.mjs` ships `_packed/` instead of the raw character, townfolk and town atlases.

**(b) Residency manager `src/core/Residency.js` (mandatory)**

```js
page = { key, bytes, cls, regions:Set, tier:'full'|'half', state:'absent'|'queued'|'loading'|'resident', refs, lastUse, pinned, ttl }
acquire(key, owner) / release(key, owner) / touch(key) / want(keys, prio) / ready(key) / tick(dt, view, zoom) / stats()
```

| Class | Holders | TTL after refs = 0 |
|---|---|---|
| `core` | pinned: player, ui, ui2 icons, fx, emotes, non-building props, ground patterns, 8 MiB water reserve (~58 MiB) | — |
| `char` | materialised characters (`@core`) | 20 s (0 when over soft) |
| `charSocial` | a character playing a social anim; **at most 5 resident**, LRU | 30 s |
| `doll` / `dollSocial` | DollPool rigs by age group; social only in the town area at zoom ≥ 0.9 | 30 s |
| `regionBld` | camera distance to an area: acquire < 900 px, release > 1800 px for 10 s (village buildings / district pages / town pages / train) | 10 s |
| `bake` | Ground while baking roads, rails, zone floors | 10 s |
| `transient` | one-shot fx sheets (`fx_build_*`, `fx_levelup`, `fx_unlock`, wake) | 15 s |

- **Enforcement every 0.5 s**:
  - over **soft** (target − 24 MiB): evict LRU pages with refs = 0, cheapest classes first;
  - over **hard** (target): refuse new social pages, shrink the materialise margin 120 → 40 px, switch characters smaller than 70 screen px to the half tier, and log a `budget` event (tests fail if it lasts > 2 s).
- **Eviction**:
  - `Assets.unbuild(page)` removes the page's anims and clears the caches;
  - images still pointing at the page are switched to `fv_blank` first and re-applied on arrival (the existing lazy-image path);
  - then `textures.remove(key)`;
  - a DEV assertion scans the display list first.
- **Loading**:
  - at most one page decode/upload starts per 100 ms (on screen > near > prefetch);
  - late art always shows a stand-in and reskins (`Assets.arrivals`, `Character.reskin`). Never a placeholder.
  - Social anims missing → `ANIM_FALLBACK` + an emote.

**(c) Ground canvases (`Ground.js`; mandatory)**
- Tiles become **512²** from a **fixed pool of reused `CanvasTexture`s** (Phaser's CanvasPool never frees removed canvases, so create/destroy would never return memory): ≤ 24 full-res tiles at zoom ≥ 0.85, LRU by distance to the view, re-bake ≤ 1 per frame.
- Zone floors and road overlays are baked lazily. They stay separate only during their 900 ms fade-in, then merge into the tiles (dirty tiles re-bake, the separate canvas is released): −29 MiB.
- Fog textures (`fog_bank*`, `fog_puff`) are destroyed when no hidden region borders open land.

**(d) Destroy what is unused**: `villager_a/b/c` (8.8) once dolls supply customers; `bld_sites` (3.9) when no site is active; fog; one-shot fx; road/ground bake patterns between bakes.

**(e) Half tier + low tier (target)**
- Half-res tiles (512² covering 1024 world px) and half-tier character sheets below zoom 0.85.
- **Low tier** applies when `Settings.gfx === 'low'`, or on `auto` when `navigator.deviceMemory ≤ 3`, `MAX_TEXTURE_SIZE < 4096`, or the weak-GPU fallback fires with fps < 24. It means: half tier always, no social pages, `maxRigs` 16, soft/hard 176/200.
- Settings → "그래픽: 자동 / 선명하게 / 가볍게".

**(f) Stretch (not in the base plan)**: a 1/8-scale overview canvas for a whole-map view; KTX2/Basis townfolk pages (v4.1 experiment, adopted only at SSIM ≥ 0.98 and < 30 ms transcode on a mid phone).

### 11.4 Estimated residency after (a)–(e) (tech plan's `budget.py`, from real atlas sizes; assumptions in that plan)

| Scenario | MiB | Main items |
|---|---|---|
| A New game at 20 min, village, zoom 1.2 | 202 | core 58, ground 18, props_buildings 11, v3 bld + sites 23.5, villager_a/b/c 8.8, residents' cores + 5 socials 40, job cores 25, workers 11, pets 6 |
| B Full v4, plaza view zoom 1.2 (visitors queued, train in) | 244 | core 58, ground 18, village bld 30.6, residents 40, jobs 31.8, workers 18.5, pets 6, town_shops_b 6.3, doll loco 31.2, train ~5 |
| C Full v4, town view zoom 1.2 | 220 | core 58, ground 18, town bld 40.7, roads bake (CPU), train ~5, doll loco 39, doll social ≤ 48.6 |
| D Full v4, zoom 0.6 | 193 | half tiles, half cores, buildings 42, boats 11.7 |
| Low tier, worst view | ≈ 159 | — |

If B measures over target, these levers apply in order:
1. resident social cap 5 → 3 (−7.7);
2. bake patterns evicted between bakes (−5);
3. `props_buildings` split by zone (−4);
4. carry frames dropped from operators who never carry (−6).

### 11.5 Measuring

- `__FV.texStats()` → `{totalMiB, byCls, byPage[], canvases, overSoft, overHard, loads, evictions}` (same formula as the v3.5 reviewers).
- `tools/test/texbudget.mjs` wraps `texImage2D`/`texStorage2D`/`deleteTexture` in an init script to track live GL bytes; they must agree within 10%.
- Scenarios (fixed-step, nohup + poll):
  - title;
  - new game, smart bot to minute 20 (sample every 5 game s);
  - fixtures through hooks: v3.5 complete, full v4 (town open, 5 shops, 50 people, rank 읍);
  - camera tour: plaza → east dock → our station → ride along the track → town square → zoom 0.6 → overview → back;
  - 20-min soak across both areas with day/night.
- **Fails** if any must is exceeded for > 2 s or the return-to-start total is above baseline + 5 MiB.
- `?debug=1` HUD on the designer's phone: `TEX 212/300 · DC 9 · FPS 58 · DOLL 18`.

### 11.6 v4 load schedule (who asks, when; Residency decides what stays)

| Trigger | Fetch |
|---|---|
| tower_east site starts | v4 manifests (`town`, `roads`, `ui3`), `town_rails`, `town_station` page |
| station site starts | `audio3` subset (`sfx_steam_whistle`, `sfx_brakes`, `sfx_door`, `sfx_school_bell`, `sfx_bell_hall`, `sfx_mission_done`, `sfx_fame_up`, `sfx_sleigh_bells`, `amb_town`, `amb_night`), train pages, townfolk manifest + head + adult + elder + child loco pages |
| first card done | `town_shops_b`, `life2_wedding` (ribbon flower stands) |
| town opens / camera within 900 px of the town | town pages (`town_civic` rest, `town_shops_a`, `town_homes`, `town_park`, `town_street`) |

- Never loaded in v4: vehicles, townfolk2 (except the 6 merged frames), life2 other atlases, `bgm_wedding/farewell`, vehicle loops, harbor, ships, anything v7.
- Late manifests arrive through `Assets.loadFragment(scene, name, {only})` (BUILD-B, Phase 0), never at boot.

---

## 12. Save v5 and migration (BUILD-B: `src/core/Save.js`)

```js
SAVE_VERSION = 5
MIGRATE[4] = (s) => Object.assign({}, s, { v: 5 })      // nothing else: v4 state starts fresh when rail opens
// sanitizeSave additions
REGIONS   += ['rail', 'town'];  s.territory.rail = s.territory.east === true || raw.territory.rail === true;
BUILDINGS += ['station'];       // the repaired station is a v3 site (plot r_station)
s.v4 = sanitizeV4(raw.v4);      // ALWAYS kept, even when Neighbours is not running (pass-through)
```

```js
v4: { v: 1,
  clock:  { t: 0..600, day: 0..1e6, on: bool },
  town:   { seed: uint32, open: bool, extra: [[id, kind, homeId]] ≤ 64,     // founders' households, newcomers, house residents
            regulars: [[id, visits]] ≤ 40 },
  orders: { cards: [{ id, shop|null, need: counts(ITEMS), got: counts(ITEMS), idle: 0..3600 }] ≤ 3,
            done: [shopKey] ≤ 5, standing: 0..1e6 },
  cargo:  counts(ITEMS),                                                   // crate stack waiting on the pad
  shops:  { <lotId>: { shop, st: 'wait'|'build'|'ribbon'|'open', t: 0..600, stock: counts(ITEMS) } },  // lot ids validated against WORLD.v4.lots
  houses: { <lotId>: { st: 'site'|'build'|'done', got: counts(['item_plank']), t: 0..600, look: 0..3 } },
  cash:   0..1e9,   rentAcc: 0..rent.cap,
  happy:  { n: 0..40, sum },
  rank:   1|2,
  porters: 0..2 }                     // (also mirrored as steps stn_porter / stn_porter2 in progress.done)
```

- **Flags stay in `progress.flags`**: `firstTrain`, `townInvite`, `townVisit`, `rankReady`, `rankEup`, and `progress.seen.railFound`.
- **Not saved**: train position (restarts dwelling at the town with 5 s left), riders, visitors in the village (they "went home"; unpaid items return to shelves as today), actors in transit (a founder on the way re-boards the next train), residency state, doll looks (regenerated from the seed).
- **Reload mid-anything**: shops restore by state (a `build` lot shows scaffolds with the builders working, `ribbon` shows the ribbon pad), orders and houses restore, the cargo crate stack restores, and wholesale counts are paid when accepted (no partial flight lost).
- **Old saves**:
  - pre-tower_east: v4 never appears until tower_east;
  - east open: `rail` opens on load with the ruin, plus the one-time pan + banner;
  - v3-complete: straight into v4, nothing lost;
  - unknown lots and shops are dropped, counts clamped;
  - a town-open save without the invite flag stays open.
- Expected size +0.8–1.6 KB, total ≤ 6 KB, write ≤ 2 ms.
- `Game.serialize()` writes `v4: this.v4 ? this.v4.serialize() : (this.saved && this.saved.v4)`.

---

## 13. Balance (`src/data/balance.js`; Korean comments; `balanceCheck.js` covers every key)

```js
// ── (v4) 이웃 마을 솔방울 마을과 눈썰매 기차 ──────────────────────
v4: {
  // ---- (v4-A) 세상·기차·주민·밤낮
  station: { coins: 500, item_plank: 14, item_ingot: 4, time: 12 },   // 서리역 고치기 (BALANCE.buildings.station 도 같은 값)
  train: { speed: 2.6, accel: 0.6, brake: 0.8,                       // m/s, m/s², m/s²
           dwellOurs: 14, dwellTown: 10, seats: 12, coachSeats: 8,    // 정차 시간(초), 좌석
           firstRide: 6, whistleBefore: 2.5, blockAhead: 1.5 },       // 첫 기차 손님, 기적 소리(초 전), 앞이 막히면 멈추는 거리(m)
  visitors: { base: 4, perShop: 1, perRank: 3,                        // 기차 한 대 손님 = base + 가게 수×perShop + (등급-1)×perRank
              dawn: 0.5, day: 1.0, dusk: 1.3, night: 0.3,             // 시간대별 배율
              wantMin: 2, wantMax: 4, patience: 60, shopChance: 0.45, regularAt: 3 },
  town: { people: 100, peopleRank2: 120, seed: 2611, walk: 70,        // 주민 수, 읍이 되면, 생성 씨앗, 걷는 속도(px/초)
          tripChance: 0.35, inviteAfter: 480 },                       // 하루에 우리 마을 나들이 확률, 첫 기차 뒤 초대가 오는 최대 시간(초)
  day: { on: true, length: 600, startHour: 8, darkness: 0.35, fade: 8,// 하루 길이(초), 밤 어둡기(0~1)
         dawn: 6, dayStart: 8, dusk: 17, night: 20, lightsOn: 19, lightsOff: 6.5 },
  perf: { maxRigs: 32, maxRigsLow: 16, maxLite: 40, margin: 120, near: 600, maxGlows: 40 },
  townLife: { /* §5.4 templates, hours as numbers */ },
  // ---- (v4-B) 주문·가게·등급·집·텍스처
  wholesale: { rate: 0.7 },                                           // 도매가 = 판매 가격 × rate
  orders: { cards: 3, swapAfter: 180, bonus: 0.5, standingBonus: 0.3, standingBonusRank2: 0.5,
            standing: [{ item_bread: 40 }, { item_fish_cooked: 50 }, { item_plank: 40 }, { item_ingot: 25 }, { item_can: 30 }, { item_meat_cooked: 25 }] },
  founding: { buildTime: 25, ribbonAuto: 90, household: 2,
              order: ['cafe', 'restaurant', 'carpenter_workshop', 'hardware_store', 'supermarket'],
              lots: { cafe: 'lotA1', restaurant: 'lotA2', carpenter_workshop: 'lotA3', hardware_store: 'lotB1', supermarket: 'lotB5' },
              shops: {
                cafe:               { need: { item_bread: 30 },                               rent: 20, sells: ['item_bread'],                       after: 'zone_farm' },
                restaurant:         { need: { item_fish_cooked: 40, item_meat_cooked: 15 },   rent: 30, sells: ['item_fish_cooked', 'item_meat_cooked'], after: 'zone_hunt' },
                carpenter_workshop: { need: { item_plank: 50 },                               rent: 25, sells: [],                                   after: 'zone_forest' },
                hardware_store:     { need: { item_ingot: 25, item_axe: 1, item_pickaxe: 1 }, rent: 30, sells: ['item_axe', 'item_pickaxe', 'item_rod', 'item_sickle', 'item_bow'], after: 'b:toolsmith' },
                supermarket:        { need: { item_can: 30, item_bread: 20 },                 rent: 40, sells: ['item_can', 'item_bread'],           after: 'b:cannery' },
              },
              shopShelf: 20, inlandEvery: 40 },
  stationPorter: [600, 1100], stationPorterCapacity: 12,
  houses: { item_plank: 20, time: 30, people: 4, lots: ['lotH1', 'lotH2', 'lotH3'], lotsRank2: ['lotH4', 'lotH5', 'lotB2', 'lotB3'] },
  rent: { cap: 2000, autoFromRank: 2, autoEvery: 15 },
  happiness: { window: 40, base: 50 },
  rank: { 2: { people: 45, shops: 5, happy: 70, coins: 3000 } },
  ceremony: { length: 12, skipAfter: 3 },
  tex: { mustMiB: 455, targetMiB: 300, lowMiB: 200, softGap: 24, uploadsPerSec: 10 },
},
```

`balanceCheck.js`:
- counts and coins are integers ≥ 1;
- times are clamped (e.g. `day.length` 60–3600, `train.speed` 0.5–6, `dwell*` 2–120);
- rates are 0–1 (`wholesale.rate` 0.1–1);
- `town.people` 20–192, `perf.maxRigs` 4–48;
- `founding.order` entries must exist in `shops`, and `lots` must exist in `WORLD.v4.lots`;
- hour fields are sorted;
- unknown items are dropped with a `[balance.js]` warning.

---

## 14. Strings (`src/data/strings.js`, ko + en; ~90 keys)

- **Banners**: `railFound` "오래된 기찻길을 찾았어요!", `railFoundSub` "기차역을 고치면 이웃 마을과 이어져요", `stationRepaired`, `firstTrain` "솔방울 마을 사람들이 장 보러 왔어요!", `orderDone`, `shopFounding` "{shop} 창업 준비 중", `shopFounded` "{shop} 개업!", `inviteTitle`, `townWelcome` "솔방울 마을에 오신 걸 환영해요 · 주민 {n}명", `houseMoved` "새 이웃 {n}명이 이사 왔어요!", `rankUp` "서리마을 → 서리읍!", `rankUpSub`, `newcomers`.
- **Region names**: `r_rail` "서리역 앞", `r_town` "솔방울 마을".
- **Pads / plots**: `plotOnly_station` "서리역 고치기", `b_station` "서리역", `hire_stn_porter` "역 짐꾼 고용", `ribbon` "테이프 자르기", `rank_pad` "승격식", `house_site` "목수가 집을 지어요".
- **Objectives**: `obj_station`, `obj_cargo` "{item}을(를) 짐 싣는 곳으로", `obj_ribbon`, `obj_visit_town`, `obj_feed_carpenter`, `obj_rank`, `obj_rank_save` "승격식 준비 {coins}", `obj_off_track` "기찻길에서 비켜 주세요!", `obj_happy_low` "손님들이 {item}이(가) 없어 아쉬워해요", `obj_order_focus` "솔방울 주문: {item} {got}/{need} → {shop}".
- **HUD / panels**: `rank_1..3` (마을/읍/도시), `bar_people`, `bar_shops`, `bar_happy`, `orders_title`, `order_to`, `order_swap` "다른 주문", `day`, `dusk`, `night`, `trainArrive` "솔방울 기차 도착 · 손님 {n}명", `set_daynight` "낮과 밤", `set_gfx` "그래픽", `gfx_auto/high/low`.
- **Shop names**: `shop_cafe` 역앞 카페 / Station Café, `shop_restaurant` 생선구이 식당 / Grill House, `shop_carpenter_workshop` 목공소 / Carpenter, `shop_hardware_store` 철물점 / Hardware, `shop_supermarket` 슈퍼마켓 / Supermarket.
- **`LINES.ko/en`**, 6–10 each: `rumor`, `town_kid`, `town_adult`, `town_elder`, `shopper_happy`, `shopper_sad`, `regular`, `mayor_invite`, `founder_ask`, `builder`, `newcomer`.
- **`TOWN_NAMES.ko`** (120 given names) and **`TOWN_NAMES.en`** (romanised), indexed by citizen id.

---

## 15. HUD, tutorial and progression (BUILD-B)

### 15.1 Goals (`Progression.js`)

- `GOALS_V3` = the 12 current entries, unchanged. They still drive `v3Complete` and `celebrate3`.
- `GOALS` (the merged walk for "next goal"):

```
east → station(build) → firstTrain(flag) → toolsmith → fedMiners → shops:1(passive) → hire2_lumberjack →
townVisit(flag) → boathouse → boat_rowboat → shops:3(passive) → south → warehouse → cannery → store → se →
boat_fishing → shops:5(passive) → people:45(passive) → rank:2(pad)
```

- New goal kinds: `shops:N`, `people:N` (read from `gs.v4`, null-safe) and `rank:N`.
- `nextGoal()` **skips passive goals that are in progress** when a later non-passive goal is pending, so a slow order never hides the next v3 pad.
- New steps (`STEPS`, `v4: true`, all `side: true` except `rank_eup`):
  - `stn_porter` (type `stationPorter`, after flag `firstTrain`);
  - `stn_porter2` (after flag `shops3`);
  - `rank_eup` (type `rank`, after flag `rankReady`).
- `after` gains `f:<flag>`.

### 15.2 HUD (`UI.js`; logical 720-wide UI, `top = 62 + safeTop`). All chips are hidden until the station opens.

| Element | Where | Shows | Tap |
|---|---|---|---|
| rank chip | (188, top+152), 150×50 | `ui_badge_rank_N` 40 px + 마을/읍 + 3 mini bars (people #6bbf59, shops #e8a33d, happy #e35d8c) | rank panel |
| order chip | (28, top+212), 260×56 | shop icon + item icon + `18/30` + 4 px progress line | order panel |
| clock | (W−62, top+92), 52 px | `ui_icon_day` / `ui_icon_night` + day arc | — |
| train edge icon | screen edge, 44 px | `ui_icon_delivery`, tinted | — |

- **Panels** are non-pausing overlays; a tap outside closes them.
  - Order panel: 3 `ui_mission_card` 9-slices (640×150, `contentInset` [34, 14, 16, 22]) with shop name, item rows, a `ui_progress_*` bar tinted #e8a33d, the reward, and `다른 주문` after 180 s.
  - Rank panel: 128 px badge, 3 rows with ✓, then the reward list.
- The dog bar's top-clearance rule (v3.5 L1) adds the new chips' bottom (top+268).
- **Settings** gain "낮과 밤" and "그래픽: 자동/선명하게/가볍게".

### 15.3 Arrow and hint priorities (added after the existing v3 hints; `cashes()` includes 역 금고)

1. Station plot affordable → arrow (existing site rule); materials → existing `v3Hint` site logic.
2. Ribbon pad present → arrow + `obj_ribbon` (free, ranked like an affordable pad).
3. Carrying goods an open card needs, the card is ≥ 1 short, **and** the matching shelf (plaza market or store) is ≥ 50% full → arrow to the cargo pad, `obj_cargo`. Selling stays first.
4. Invitation open, town not visited → arrow to the town gate, then the fountain (`obj_visit_town`).
5. Carpenter open, a house site waiting for planks, chief idle 3 s → `obj_feed_carpenter`.
6. Bars full → 승격식 pad arrow when affordable, otherwise goal text `obj_rank_save`.
7. Happiness < 70 and a shelf item is at 0 → `obj_happy_low` + arrow to that shelf (idle only).
8. Idle with nothing else to do → `obj_order_focus` for the focus card.

### 15.4 Anti-softlock rules (each one has a test case in `v4.mjs`)

| Risk | Rule |
|---|---|
| Card needs an item the player can't make | Cards are only offered once their producer exists (§8.1); re-checked on load |
| Card stuck | Free swap after 180 s without progress; hint 3; 역 짐꾼 |
| No lot for a founding | The 5 founding shops have reserved lots; post-읍 lots are houses only |
| Ribbon never cut | Opens alone after 90 s |
| Town never invited | Invitation fallback 480 s after the first train |
| Happiness stuck < 70 | Floor 50; the last 40 visits only; hint 7; the bar shows which bar is short |
| People < 45 | Founder households + carpenter houses + v3 houses; hint 5 |
| Train blocked | Waits and whistles, never pushes; `obj_off_track` |
| Visitor can't be served | Patience 60 s → goes home sad; anonymous spawns pause for waiting visitors |
| Register deadlock | Same `waitingPay` rule as v3.5 |
| Same-spot pads | `needsLeave` + step-off pill, unchanged |
| Reload mid-anything | §12 |

---

## 16. Tests, bots and gates

### 16.1 New tests (all fixed-step; Playwright under nohup + poll)

| Test | Owner | Asserts |
|---|---|---|
| `tools/test/v4_layout.mjs` (Node) | A | `world.js` v4 data against the town manifest with the `v4_layout_ref.py` rules: regions, sea clearance, overlaps, corridors, ballast, crossings vs 4-car stops; 0 problems |
| `tools/test/rail.mjs` | A | kinematics, dwell, car spacing, buffer stops, NW-only frames, crossings block and release, obstacle stop, boarding counts, the train through the fog |
| `tools/test/town.mjs` | A | one game day (600 s): every citizen reaches every scheduled place (none stuck > 20 s), set pieces at their hours, ≥ 80% at home 22–05, ≥ 90% of kids at school 08–15, live rigs ≤ cap, all 100 looks unique, people conserved, town sim ms logged |
| `tools/test/townfolk_runtime.mjs` | A | port parity (1000 people), zero missing frames on raw atlases and on pages, rig refresh bench |
| `tools/test/roadnet.test.mjs` (Node) | B | streets → cells → graph; every door reachable on its front side; A* = Dijkstra on 500 random pairs; lane sides and connectors; crossing `edgeBlocked`; upgrade invalidation |
| `tools/test/v4.mjs` | B | from `unlockAll` + `unlockV3` + tower_east:<br>1. rail opens with east, the ruin is present, repair with porter deliveries;<br>2. first train ≤ 6 s after repair with 6 visitors, a visitor buys at the plaza and pays only with someone at the register;<br>3. the cargo pad counts toward the café card and pays 70% into 역 금고;<br>4. card → founder on the next train → 25 s build → ribbon (and auto-open at 90 s) → rent ticks, shop restock pays wholesale;<br>5. invite → town open → visit flag; invite fallback;<br>6. carpenter house +4;<br>7. bars → pad → ceremony sets cobble cells, coach coupled, newcomers arrive;<br>8. every §15.4 rule;<br>0 page errors, 0 placeholders |
| `tools/test/save_v4.mjs --browser` | B | real v3.5 saves (from `save_v35` fixtures) at 0.5 / 12 / 21 / 38 min load into v4 with nothing lost (≥ tower_east ones get rail + ruin + pan); round trip of every `v4` field; 20 corrupted `v4` shapes boot; reload mid-founding, mid-train, mid-ceremony; pass-through of `v4` when Neighbours isn't constructed; income over 120 s idle within ±6% of v3.5 for migrated saves |
| `tools/test/texbudget.mjs` | B | §11.5 scenarios and gates |
| `tools/test/shots_v4.mjs` (390×844 + 360×640, ko + en) | B | the must-look set (§16.4) |

The extended `review_robust_soak.mjs --v4` (20 min, both areas, day/night) checks:
- 0 errors;
- heap after GC grows < 2 MB over the last 10 min;
- display objects, tweens and timers flat, pool size stable;
- textures back to baseline ± 5 MiB.

### 16.2 Existing suites (must stay green)

smoke 53/53, v3 18/18, labour 28/28, dog 15/15, life 14/14, zoom 11/11, save_v2 16, save_v3 26, save_v35 25, `test_deploy` pages + standalone (`--slow` on this machine).

### 16.3 Bots (`review_gameplay_sim.mjs` with a `--v4` policy: carry for cards, cut ribbons, visit the town, feed the carpenter, buy the 승격식)

| Metric | Smart | Think / arrow / pure arrow |
|---|---|---|
| Village complete | 20.2 ± 0.5 (unchanged) | v3.5 ± 5% |
| tower_east lit | ≤ 22.5 | ≤ 24 |
| Station repaired / first train | ≤ 24.5 / ≤ 25 | ≤ 27 |
| First shop open | ≤ 31 | ≤ 34 |
| Town visit | ≤ 33 | ≤ 36 |
| v3 complete | ≤ 47 | ≤ 52 |
| 5 shops | ≤ 45 | ≤ 50 |
| **Rank 읍** | **48–55** | **≤ 60** |
| Longest wait for something new | ≤ 2.0 min | ≤ 2.5 min |
| Stuck / errors / hungry miners | 0 / 0 / 0 | 0 / 0 / 0 |
| Early request log (until the tower_east site starts) | identical to v3.5 | identical |

Tuning order if v3 gets too fast or slow:
1. `wholesale.rate`;
2. card sizes;
3. `rank.2.coins`;
4. `visitors.base`.

### 16.4 Perf gates (fixed-step bench, same method as v3.5)

| Gate | Threshold |
|---|---|
| Logic per tick, plaza view, full v4 | ≤ 1.6 ms (v3.5 1.24) |
| Logic per tick, town view | ≤ 2.1 ms |
| Town sim | ≤ 0.35 ms (140 people incl. district) |
| Draw calls per frame (town at 12:00 and 21:00, plaza with visitors, overview) | ≤ 12 |
| Display objects (excluding pile items) | ≤ 1700 |
| Uploads | ≤ 1 page per 100 ms, none > 8 MiB |
| Save | ≤ 6 KB, ≤ 2 ms |

**Must-look screenshots** (`shots_v4.mjs`; look at each one):
1. ruin reveal;
2. station site;
3. first train arriving;
4. neighbours on 역 가는 길;
5. doll customers queued at the plaza;
6. order panel;
7. cargo loading into the wagon;
8. founder walking;
9. builders;
10. ribbon;
11. 역 금고 with `+N/분`;
12. town welcome;
13. school bell exodus;
14. dusk lamps;
15. night town;
16. rank ceremony + HUD chips;
17. cobble street after 읍;
18. zoom 0.6 lite rigs;
19. overview.

---

## 17. Build split

Two builders work in parallel. **File ownership is exclusive**: only the owner edits a file. Shared data files (`world.js`, `balance.js`, `balanceCheck.js`, `strings.js`, `Game.js`) use marked blocks, `// ---- (v4-A)` and `// ---- (v4-B)`, edited only with Edit on their own block, never rewritten whole.

### 17.1 Ownership

| BUILD-A owns: world, town, rails/train, townsfolk sim + rendering, day/night, shoppers | BUILD-B owns: growth/founding, rank, roads graph + visuals, texture memory, save, tutorial/progression, polish, tests, docs |
|---|---|
| NEW `src/systems/Neighbours.js` (v4 orchestrator: lifecycle, prefetch, events `v4:*`, `serialize()`, `state()`, `__FV.v4` base; constructs B's Growth/Rank in its slots) | NEW `src/systems/Growth.js`, `src/entities/Shop.js`, `src/systems/Rank.js` |
| NEW `src/systems/Rail.js`, `src/entities/Train.js`, `src/entities/RailStation.js` (ruin/site/open, platform, board/wait points) | NEW `src/systems/RoadNet.js`, `src/systems/RoadPaint.js`; `src/systems/Roads.js` |
| NEW `src/core/Townfolk.js`, `src/entities/DollSprite.js` (+ DollPool) | NEW `src/core/Residency.js`; `src/core/Assets.js` (packed index, `loadFragment`, `unbuild`, tiers, A's fragment list per §11.6) |
| NEW `src/systems/TownSim.js`, `src/entities/TownBuilding.js`, `src/entities/Visitor.js` | `src/systems/Ground.js` (pool, LRU, merge, hooks, `makeSea()`) |
| NEW `src/systems/DayClock.js` | `src/core/Save.js` (v5, `sanitizeV4`) |
| `src/systems/Territory.js`, `src/systems/Collision.js` (helper), `src/systems/Occlusion.js`, `src/systems/VillageLife.js` (rumours, cheers, gather), `src/systems/Bubbles.js` (caps) | `src/systems/Progression.js`, `src/systems/Tutorial.js` |
| `src/entities/Character.js` (`opts.person`), `src/entities/Seller.js` (`pickLook`, visitors, pause rule), `src/entities/Register.js` (only if needed), `src/entities/Site.js` (XL) | `src/scenes/UI.js` (chips, panels, edge icon, settings rows "낮과 밤" and "그래픽"; `Settings.data.daynight` / `.gfx` are persisted by `Save.js` `Settings`) |
| `src/data/world.js` (writes **all** v4 data from §3 in Phase 0, incl. streets, lots and the square for B) | `src/systems/Logistics.js` (PRIO, `remote`), `src/entities/Worker.js` (StationPorter) |
| `src/data/version.js` → `v4` at release | NEW `tools/build/pack_pages.py`; `tools/build/build_artifact.mjs`, `test_deploy.mjs` |
| Tests: `v4_layout.mjs`, `rail.mjs`, `town.mjs`, `townfolk_runtime.mjs` | Tests: `roadnet.test.mjs`, `v4.mjs`, `save_v4.mjs`, `texbudget.mjs`, `shots_v4.mjs`, bot policy, soak; existing suites |
| `Game.js` block (v4-A): import + construct/subscribe Neighbours, tick, serialize pass-through, `makeBuilding('station')`, doll customers, `__FV.v4` | `Game.js` block (v4-B): Residency init/tick, `texStats`, worker/porter LOD hide, overview area fit, ground pool wiring |
| | Docs: `docs/build_reports/v4_build.md`, `기획서_v4_이웃마을.md` §8 numbers kept true, `기획서.md` §4 note |

### 17.2 Phase 0: the handshake (first ~hour, both, before anything else)

- **BUILD-A lands**:
  - `world.js` v4 blocks (all §3 tables, Korean comments): `WORLD.v4 = { G, rail, stations, square, lots, streets, town: { buildings, props }, windowGlows }`, territory, borderTrees, regionTrees removal, plot `r_station`, link nodes/edges;
  - the marker blocks in `balance.js`, `balanceCheck.js`, `strings.js`, `Game.js`;
  - a `Neighbours.js` skeleton (constructed on rail open, empty update, `serialize()` returning the saved block);
  - `v4_layout.mjs` green.
- **BUILD-B lands**:
  - `Save.js` v5 + `sanitizeV4` pass-through + `MIGRATE[4]`;
  - `Assets.loadFragment()`;
  - skeleton `Growth.js`, `Rank.js` (constructors + the §8.8 / §17.3 API as no-ops), `RoadNet.js` (`walkGraph()` from `WORLD.v4.streets`), `Residency.js` (pass-through: `acquire` = load if missing);
  - `Ground.addBakeHook` / `invalidate` / `makeSea()`;
  - `Logistics` PRIO + `remote`.
- Both re-run smoke + v3 + save suites before continuing.

### 17.3 Interfaces (frozen at the end of Phase 0)

| From → to | Contract |
|---|---|
| A → B | `gs.v4` = Neighbours: `.rail` (`blocking(xing)`, `stops`), `.train` (`onNextArrival(stop, fn)`, `loadCargo(items)`, `addCoach()`), `.town` (`sendByTrain(kind, opts) → handle.onArrive(actor => …)`, `addDistrictHome(homeId, n, opts)`, `gather(x, y, r, n)`, `population()`, `districtPeople()`, `growTo(n)`), `.clock` (`hour()`, `phase()`), `.openTown()`. Actors are Characters with dolls: `walkTo(x, y, cb)`, `say(lineKey)`, `emote(key)`, `play(anim)`, `release()`. Events: `v4:train` (phase, stop), `v4:visitorDone` (person, frac), `v4:hour` (h), `v4:stationOpen`, `v4:townOpen` |
| B → A | `gs.v4.growth.shopTargets()`, `.openShopCount()`; `gs.v4.rank.people()`, `.level`; `gs.roadNet.route()`, `gs.roads.route()` (crossing-aware); `ground.addBakeHook` / `invalidate`; `Residency.acquire/release/want/ready`; `Assets.loadFragment`; `sv.v4` shape (§12) |

### 17.4 Milestones (each ends with a phone-playable artifact built by the lead)

| BUILD-A | BUILD-B |
|---|---|
| **A1** world + rail: regions, fog 4 sides, ruin, XL site, Train timetable, crossings, first train with placeholder riders. Rails are drawn by a throw-away stub bake hook until B2 lands; RoadPaint then owns them and the stub is deleted | **B1** texture P0 on v3.5 content: `pack_pages.py`, Residency, pooled ground tiles, floor/overlay merge, portrait atlas, `texbudget.mjs`. Gate: v3.5 new game ≤ 240, full v3.5 village ≤ 300, all existing tests green |
| **A2** dolls + shoppers: Townfolk port + parity, DollSprite/pool, doll customers at the plaza, train visitors with plans, people conservation | **B2** RoadNet + RoadPaint (+ rails, snow drifts) + Roads.js; `roadnet.test.mjs` |
| **A3** town: TownBuildings, TownSim schedules/LOD/set pieces, DayClock + glows, invite → town open, `town.mjs` | **B3** Growth: cards, cargo pad, StationPorter, founding with A's actors, ribbon, rent, shop restock, houses, happiness |
| **A4** polish of A's systems against B's integration findings | **B4** Rank + ceremony + rewards; UI chips/panels; Progression/Tutorial; save v5 complete |
| — | **B5** integration: `v4.mjs`, `save_v4.mjs`, bots + balance pass, `texbudget.mjs` on the full fixture, shots, polish backlog, docs, artifact |

**Definition of done**: §16 all green, §11.2 musts met (targets reported), bots within §16.3, every screenshot looked at, `docs/build_reports/v4_build.md` with known issues, the version string `v4`, and the artifact in ≤ 2 publishes with boot files (`game.js`, `lib/`, all manifests incl. `_packed/index.json`) in the last batch.

---

## 18. Polish backlog from `v35_build.md` known issues (BUILD-B, after B5 is green; in priority order)

1. **Small item loss on reload** when a pile is full (pile restore cap 40): restore up to the save cap and draw at most 40.
2. **The hire pad's label overlaps the chief's head** while he stands on it: lift the label while occupied.
3. **The 2nd/3rd hunters bunch at the meat rack**: own drop spots, as M3 did for the other lines.
4. **The fish barrel is partly hidden behind the trade-post sleigh; the log pile behind pines**: nudge the props, clear the pines.
5. **Faint horizontal line across the sea in the overview**: fix in `makeSea()` (tileSprite seam). Coordinate with the water step; don't touch `Water.js`.
6. **The whistle button sits over world labels**: auto-raise it when a pad label would sit under it.
7. **Shots 15/18 miss the ball/hearts; shots 21–23 come from a scratch script**: move them into `shots_v35.mjs`.
8. Remove the unused v3 `Smith` class from `Workshop.js`.
9. Pack the 55 portraits (done by `pack_pages.py`) and fewer files → 2 publishes.
10. Note the outdated cost table in `기획서.md` §4 (designer doc: add a pointer to `balance.js`, don't rewrite).
11. **Designer decision carried over**: `porterCapacity` 14 and `spawnEveryLate` 1.3 (v3 at 38–42 min). Re-measure with the v4 bots and report; change only if v3 falls under 36 min with v4 income.
12. P1 nice-to-haves if time allows: the chief rides the train (hide the chief, follow car_a, pop out); tap a citizen → name card; house window glows; the night police patrol at the district.

Won't fix in v4: the smoker's look and the canner's back (need new art); the GitHub Pages cache (the artifact is one bundle).

---

## 19. Risks

| Risk | Mitigation |
|---|---|
| Texture work slips and v4 breaks the must | B1 is first, lands on v3.5 content with every test as a net; v4 art stays gated until Residency exists; the musts are the release blocker |
| Evicting a page still in use → render crash | strict refs; images switched to `fv_blank` before removal; DEV display-list assertion; the tour runs with assertions on |
| Layered townsfolk too slow on old Android | rig caps, lite rigs, refresh on frame change only; drop `maxRigs` to 16 if `loop.actualFps < 40` for 5 s |
| Two agents editing shared files | exclusive ownership + marked blocks + Edit-only; Phase 0 freezes the interfaces |
| v4 makes v3 too easy (extra income from ~24 min) | income-only-rises rule plus the §16.3 tuning order; v3-complete bounds watched |
| Night hurts readability | darkness 0.35, readability floor, glows, the toggle, night is 23% of the day |
| The train hides behind row A shops | Occlusion fades shops in front of cars; stations have open squares in front |
| Push-pull looks odd | it's how real branch-line trains run; the engine always leads into our station |
| Parallel v7 water/beach work | never imported or loaded; the sea is one replaceable method; 8 MiB reserved |
| Artifact file limits (255 per publish, 511 per version) | frame-index merge (−100+), portrait atlas (−54) offset new pages; boot files last |

---

## Appendix A. What each proposal contributed (for the record)

- **From the player plan**: the reveal on tower_east and the ruined station; the compact 6144-wide map and lattice; order cards, the cargo pad, wholesale 70%, founding by train, ribbons, rent; the carpenter's houses; rank bars and the ceremony; day phases; the interleaved goals with passive skipping; the anti-softlock table; the HUD layout; the strings; the save shape.
- **From the tech plan**: the memory analysis and the whole residency/compiler/ground-pool strategy; RoadNet with lanes and crossings; the townsfolk LOD tiers, event heap and CPU budget; the byte-identical compositor port; DollSprite through Character; dropping `carry_walk`; single-heading train frames; hybrid customers at the existing sellers; founders as real citizens; the measurement method.
- **Rejected**:
  - the station's second market (it splits attention and contradicts the designer's "our sellers' customers are neighbours");
  - the run-around steam trick;
  - the 8704×5120 world and the woods corridor;
  - supply-meter founding;
  - the points formula for rank;
  - SoA arrays for 130 people;
  - a separate rent box (merged into 역 금고);
  - the player plan's ~600 MB memory projection.
- **Lead fixes**:
  - a 6-cell main-street corridor with even-line carriageway edges;
  - crossings at k 8 / 33, clear of the 4-car train;
  - the engine on the NW end;
  - region-safe rows;
  - fog on right/bottom edges;
  - musts vs targets for memory;
  - the invitation fallback;
  - remote sinks and the StationPorter rule (regular porters never walk 2400 px).
