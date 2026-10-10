# v5–v8 binding plan — 서리마을 grows into a city whose people live whole lives

Status: **binding** for every v5–v8 module job and for the integration after v4 ships. It replaces
`docs/v5_v8_plan_player.md` (design proposal) and `docs/v5_v8_plan_tech.md` (architecture proposal) wherever they
differ; both stay in the repo as background. Designer summary in easy Korean: `docs/기획서_v5_v8_개발계획.md`.

Inputs: `docs/기획서*.md` (v5–v8 wishes: 생활과미션, 항구도시, 해변, 살아있는도시), `docs/CONTRACT_V5.md … V8.md`,
`docs/v4_plan.md` (§3.8 seams), the two proposals, `docs/build_reports/*` (story, chat, vehicles, roads_ui, life2,
townfolk2, ships, harbor, beach, beach_bld, beachfolk, water, logistics, civic, cityfolk, fx_city, audio3–6, v4 builds
and reviews), the manifests of every later fragment (read, not changed) and the v4 code as it is on 2026-10-09.
Scratch checks: `scratchpad/later_lead/final_check.mjs` (v5 layout, prints `no problems` / `px: no problems`) and
`scratchpad/later_tech/layout_v5v8.py` (v6–v8 layout, prints `no problems`). No game file was changed.

---

## 0. Decisions at a glance (what was picked, from where, and why)

| # | Topic | Binding choice | Source | Why |
|---|---|---|---|---|
| D1 | Version order | v5 생활과 미션 (story life, missions, fame, bank, vehicles; 읍 → 도시) → v6 갈매기 항구 → v7 햇살 해변 → v8 살아 있는 도시 (logistics, police, fire, moving, rank 4) | both, 기획서 v8 §7 | The designer fixed it: "이야기 엔진과 은행은 v5, 물류센터·경찰·소방·이사는 v8". v6 and v7 may be published together as one test link if the designer prefers (기획서 v7 §8 says the beach comes "with the harbour"); the modules stay separate |
| D2 | Progression after 읍 | One ladder: 읍 (≈49 min) → **도시 서리시** (≈100–104) → harbour ★2 (≈150) → beach ★3 (≈215) → **큰 도시** (≈265–275) → endless loops | player | Something new every ≤ 2 min, each version ≈ 1 h of guided play; numbers in §3 |
| D3 | Module architecture | Pure model + Phaser view + host per module; `Ports` facade in, `GameFeed` events out; one `ModuleHost` block in `Game.js`; save slice per module | tech | Lets every module be built and tested now without touching v4 files; v4 behaves exactly as today when no module runs |
| D4 | Story engine runtime | Runs in a **Web Worker** behind `StoryHost` with a synchronous mirror (chat bridge unchanged); inline mode with the same protocol as fallback | tech | Measured p99 6.8 ms / max 17 ms per step on a desktop core (≈ 3–4× on a phone); serialize 26 ms |
| D5 | Who moves people | TownSim stays the body layer; the engine gets **external plans** and only story beats **lease** a body; one `PersonRegistry` | tech | Two movers on one body is the classic bug; v4's tuned routines stay |
| D6 | Life beats | The player plan's full arc and staging (proposal → wedding → good news → birth + naming → stroller → school → teen → elder's three wishes → farewell), two-speed aging, gentleness rules | player | This is the designer's heart ("주민의 일생"); the tech plan only sketched it |
| D7 | Geography of v6/v7 | **South coast (warm current)** east of the town: harbour quay `j −12` (i 55–86), breakwater `j −22`, lighthouse on the rocky point, beach waterline `j −19` (i 90–120); v8 newtown south of the town | tech | Every coordinate passes the checker; harbour and beach share one warm sea and one land strip (no bridge for trucks, which the player's north-sea mole needed); ships sit in front of the buildings (lower on screen), so they never hide them. Grafted from the player: the sleepy-harbour reveal, the revive steps, the lighthouse beam over the open sea, the snow-to-sand walk |
| D8 | Coastal train | A second line `coast` (town-east halt ↔ 항구역 ↔ 해변역, cycle ≈ 117 s); the v4 shuttle untouched | tech (player agreed) | v4's tuned visitor economy cannot regress |
| D9 | v5 map | Player's **서리 큰길** (plaza east gate ↔ station) + stops + **서리 화물장**; tech's **row D** (memorial garden, stable depot, bank, bus depot) + 은행길; 3 village XL plots in `west_s` (school / clinic / apartments, re-spaced so they no longer overlap) | both, re-checked | The bus must reach our plaza (기획서: "이웃 마을 사람을 우리 마을로 태워 옴"); civic buildings that town citizens walk to belong in the station district |
| D10 | Missions | Player's **98 templates** (ko + en), coins as **minutes of current income**, five chief titles with visible rewards, passive fame; tech's model API and 3 KB slice | player + tech | Rewards stay meaningful from v5 to v8 without retuning; arrow-only players still reach titles |
| D11 | Bank | In v5: deposit (1 %/game day), **construction loans up to 15 min of income**, 5 % fee, auto-repaid from 10 % of income, ceremony share 50 %; v8 adds fire insurance | player numbers, tech model | Removes v4's 5–9 min saving gaps |
| D12 | Vehicles | Tech's lane simulation (car following, connector reservation, crossings, pedestrian yield, analytic off screen) + player's era content, riding as fast travel, dog-sled and truck driving missions | both | |
| D13 | Newspaper | **v5** (first edition the morning after the first wedding); v8 adds incident headlines | tech, task scope | The paper is part of the story network and needs only 1.9 MiB of UI art |
| D14 | Incidents | v8 only; engine `incidentRate 0.4`, `fireRate 0.05`, fire gap ≥ 4 game days, hydrants −5 % each (≤ −40 %), fire station levels at the town's `t_fire`; "사건·사고" switch | player rates, tech director, 기획서 "소방서 레벨, 소화전" | Rare, comic, nobody hurt |
| D15 | Cute happenings | Player's 12 harmless happenings (v5–v7), one at a time, ≈ every 5 min | player | Fills "dead time" with charm before incidents exist |
| D16 | Saves | Main save typical ≤ 16 KB (hard ≤ 24 KB = v4 + every slice cap); story in side key `frostVillage.save.v1.story` (pack15, ≤ 450 K chars); `SAVE_VERSION` 6 → 7 → 8 → 9 → 10 | tech | Same pattern as the chat record |
| D17 | Files | Gate ≤ 495 files per version; v5 P0 reclaims 93 files (audio sprites, title pages) before any v5 art ships | tech | Files, not MiB, are the binding limit (491 of 511 today) |
| D18 | Numbers for the designer | Each module ships `tuning.js` (Korean comments) now; at integration the text moves verbatim into `balance.js` as `BALANCE.v5 … v8` | both | Standalone now, one file for the designer later |
| D19 | No new art | Only finished art/audio; gaps are worked around (Appendix B) | player | Art is finished and reviewed |
| D20 | Designer preview | Hidden "이야기 미리보기" menu (tap the version label 5×) plays any beat on a throwaway copy | player | The designer reviews weddings, farewells, fires on the phone without waiting hours |

Appendix A lists every smaller pick.

---

## 1. Baseline and hard constraints

| What | Value today | Source |
|---|---|---|
| Lattice | `L(i, j) = (3120 + 64·(i + j), 1315 + 32·(i − j))`; one cell = √2 m; rail = `j 0`; north coast ≈ `j 5.9` east of x 2100; buildings face −Y (screen down-left) | `world.js` `L4` |
| World | width 6144, height 3450, `left` −1400; regions start/east/south/se/rail/town/west/west_s | `world.js` |
| Day | 600 s (1 game hour = 25 s), `DayClock.T`, starts 08:00 | `balance.js v4.day` |
| v4 pacing (bots) | 읍 at 48.8 smart / 52.0 arrow / 57.1 think | `v4_review_gameplay.md` |
| Textures | must 455 MiB, target 300; busy v4 views measured 311–385 MiB | `v4_build.md`, `texbudget_v4.json` (re-measure after the v4 fix pass) |
| Logic per tick | plaza 0.8–1.0 ms (gate 1.6), town 1.1–1.8 ms (gate 2.1), TownSim 0.10–0.24 ms | `v4_build.md` |
| Draw calls / objects | ≤ 12 per frame; ≤ 1700 display objects | v4 gates |
| Main save | 5.7 KB, 0.2 ms; chat side key ≤ 220 KB | `Save.js`, C2 |
| Artifact | **491 files** (limit 511 per version, 255 per publish), ≈ 62.6 MB | `dist/artifact_files.json` (2026-10-09 22:26; C2 reported 501 before the fix pass) |
| Story engine | 250 residents: step avg 0.41 ms per game second, p99 6.8 ms, max 17 ms (quiet desktop core); 400 residents no text 0.23–0.26 ms; save 549 KB after 30 days, ≈ 700 KB after a year; serialize 13–35 ms; bundle 827 KiB min / 209 KiB gzip | `story.md` §7, tech plan §1 |
| Later art (source-sum MiB) | vehicles 140.4 · townfolk2 72.6 · ships 65.8 · beachfolk 74.6 · cityfolk 88.2 · logistics 63.8 · beach 53.5 · beach_bld 50.5 · harbor 45.5 · fx_city 41.9 · civic 37.4 · water 19.2 · life2 4.5 · ui3 1.5 | `texsum.py` (tech) |
| Art orientation | all town/harbour/beach/civic/logistics buildings face −Y; quay walls show only −Y/+X faces; vehicles and ships render 2 axis headings + mirror (ships add S) | manifests, `harbor.md`, `ships.md` |

**Hard rules for every later job** (now and at integration): never modify v4 files outside the listed patches; never
touch `assets/**`; never run Blender; `nice -n 15` for heavy commands; one browser at a time; runs ≤ 2 min; no git
commits by module jobs.

---

## 2. Versions: what goes where

| Version | Theme | In | Not in (moved later) |
|---|---|---|---|
| **v5 생활과 미션** (읍 → 도시) | "my people live real lives, and my village gets wheels" | kit; `story_runtime` (worker engine, adoption, talks, life arc, farewell switch, newspaper, person card, chat bridge, v5 happenings); `missions_bank` (board, request bubbles, fame and titles, daily/weekly/streaks, bank savings + loans, passbook); `vehicles_runtime` (era 2 sleigh bus / steam wagon / dog sled / cargo sleigh, era 3 retro bus / trucks / cars / chief truck, stops, depots, freight yard, riding, driving missions, traffic lights); rank 3 **도시 (서리시)** ceremony; village XL plots (school, clinic, apartments); 서리 큰길; row D; file-budget groundwork | incidents, police, logistics, insurance, moving trucks (moves happen as banners) |
| **v6 갈매기 항구** | "the world beyond the sea trades with me" | `harbor_runtime`; south coast + harbour Water region; coast train; 항구역; ferries, cargo ships, trawlers, tug, gulls, crane, lighthouse, auction, exports, imports (sugar, cloth, glass), tourists, harbour ★1–3, bus line 3, harbour missions and happenings, harbour story residents | beach shops, hotel |
| **v7 햇살 해변** | "a dream holiday spot at the edge of a snow country" | `beach_runtime`; beachfolk merge; tropical sea + hotel pool regions; 해변역; lifeguard, beach founding board (7 shops), resort hotel + pool, aquarium, beach crowd, boats, night lights; events (모래성 대회, 불꽃놀이, 북극곰 수영 대회); beach ★1–3; bus line 4 | — |
| **v8 살아 있는 도시** | "a city that lives without me and tells me its stories every morning" | `logistics_runtime` (cutaway centre, racks = real stock, forklift, vans, settlement, furniture/appliance chains, house level 3); `incidents_runtime` (police + petty crime, quarrels, fire + firefighters, ruins → demolition → rebuild, moving trucks, wanted board, toggle); bank insurance; cityfolk merge; v8 vehicles; rank 4 **큰 도시** | — |
| endless | — | daily/weekly missions, weddings, babies, ships, beach days, the paper, rare incidents; rank 5 "전설의 도시" stays a P2 idea | — |

---

## 3. Progression after 읍 (numbers)

### 3.1 The ladder (smart bot, game minutes from a new game; think bot +6–12 %)

| Milestone | Smart | Think / arrow | Pure arrow | What unlocks it |
|---|---|---|---|---|
| 읍 (v4, unchanged) | 47.5–52 | ≤ 57 | ≤ 60 | v4 bars |
| proposal + v5 HUD | 읍 + 0.2 | | | scripted once |
| bus reaches our plaza | ≤ 57 | ≤ 62 | ≤ 64 | depot → 서리 큰길 → stop S1 |
| first wedding | ≤ 59 | ≤ 64 | ≤ 66 | next game day 11:00 |
| first newspaper | ≤ 62 | | | morning after the wedding |
| first baby | ≤ 86 | ≤ 94 | ≤ 98 | first couple, scripted timing |
| **도시 (서리시)** | **98–106** | ≤ 118 | ≤ 125 | people 100 · fame 400 · bus riders 120/day · 24,000 coins |
| harbour open / first ferry | ≤ 110 / ≤ 124 | ≤ 122 / ≤ 138 | — | 동쪽 철길 잇기 |
| harbour ★2 | ≤ 152 | ≤ 168 | — | 20 ships · 200 exports · 150 tourists |
| beach open / hotel | ≤ 170 / ≤ 192 | ≤ 186 / ≤ 210 | — | harbour ★2 |
| beach ★3 | ≤ 215 | ≤ 235 | — | 7 shops · pool · aquarium |
| **큰 도시** | **260–275** | ≤ 300 | ≤ 320 | people 220 · deliveries 150/day · safety 90 % · fame 900 · 120,000 coins |
| longest wait for something new | ≤ 2.0 min | ≤ 2.5 | ≤ 3.0 | measured by bots |

### 3.2 Rank bars

| Rank | Name | Bars | Ceremony | Venue | Rewards |
|---|---|---|---|---|---|
| 3 | 도시 "서리시" (chief title 시장; residents keep saying 촌장님) | 인구 100 (village + district + settlers + babies) · 명성 400 (= title 존경받는 촌장) · 버스 승객 120 per game day (rolling) | 24,000 coins (bank may lend 50 %); 14 s, skippable after 3 s | our 마을회관 square if built, else the empty bus-depot lot in row D (never the station square, where stop S2 stands) | asphalt wipe with lanes, crosswalks, traffic lights; sleigh buses → retro buses; steam wagon → truck; stable depot → fuel depot; bus depot; cars at level-2 houses; the chief's truck + driving missions; parking lots buildable; 3rd passenger coach |
| 4 | 큰 도시 | 인구 220 (village + district + harbour + beach residents) · 물류 150 deliveries settled per game day · 안심 90 % (incidents resolved within a game day and fires out before a ruin, rolling 10 game days; 100 % when 사건·사고 is off) · 명성 900 | 120,000 coins (bank may lend 50 %) | our hall square | `bgm_city` by day in the station district, 4th coach, bus headways halved, window glows everywhere at night, `ui_badge_rank_4` |

Happiness leaves the bars (v4 finding 8) and stays on the rank panel as information. `Rank.js` becomes data-driven
(patch P17); bars read the module APIs.

### 3.3 Income model and pricing rule

| Milestone | Income I (coins/min, 5-min average, excluding mission and loan money) | New sources |
|---|---|---|
| 읍 (49) | ≈ 1,800 | v3 lines, plaza + visitors, rent, restaurant, hall tax, wholesale |
| 도시 (≈100) | ≈ 3,500 | bus riders at the plaza (+20–30 % retail), freight to shops, interest, more rent |
| harbour ★2 (≈150) | ≈ 5,500 | ferry tourists, auction ×1.5, exports ×2.0 |
| beach ★3 (≈215) | ≈ 8,000 | hotel stays, 7 beach shops, aquarium |
| 큰 도시 (≈270) | ≈ 11,000 | settlement +15 %, furniture and appliances |

Every guided purchase costs 0.8–4 minutes of the income at its moment; ceremonies 7–11 minutes (the bank lends up to
half). Mission coins follow `I` automatically. Bots measure `I`; if a milestone runs fast or slow, tune in this order:
rank bars → ceremony coins and the bank's ceremony share → `requestEvery` → build costs → age speeds.

---

## 4. Map

### 4.1 World growth and regions

| Version | `WORLD.width` | `WORLD.height` | New regions (rects `[x0, y0, x1, y1]`) |
|---|---|---|---|
| v5 | 6144 | 3450 | none (row D lies in `rail`/`town`; XL plots in `west_s`; 서리 큰길 in `start`/`east`) |
| v6 | **10752** | **4864** | `harbor` `[6144, 0, 10752, 4600]` (opens at the 동쪽 철길 잇기 site), `harbor_w` `[5200, 3450, 6144, 4600]` (`openWith: 'harbor'`) |
| v7 | **11264** | **5888** | `beach` `[5200, 4600, 11264, 5888]` |
| v8 | same | same | `newtown` `[3000, 3450, 5200, 4600]` |

Regions are horizontal bands so axis-aligned rects can separate the diagonal districts; district content is created by
its module at its gate, so nothing static straddles a band edge. Border trees: the town's east band
`[6024, 300, 6144, 3450]` gets `until: 'harbor'`; the south bands of rail/town get `until: 'newtown'` except x
3046–4560 where row D needs the room in v5.

**South sea (v6, warm current):** sea where `i > 55` and `j < southJ(i)`:

| i | southJ(i) | shore type |
|---|---|---|
| 55 (basin west wall) | j < −12 | `quay` (+X face) |
| 55 … 86 | −12 | `quay` (−Y face) |
| 86 … 90 | −12 → −19 | `rock` (lighthouse point) |
| ≥ 90 | −19 | `sand` |
| breakwater | j −22, i 57 … 80 (mouth i 80 … 86) | `breakwater` |

Key points: quay (55, −12) = (5872, 3459) → (86, −12) = (7856, 4451); west wall bottom (55, −22) = (5232, 3779);
breakwater (57, −22) = (5360, 3843) → (80, −22) = (6832, 4579); beach waterline (90, −19) = (7664, 4803) →
(120, −19) = (9584, 5763).

### 4.2 v5 additions (all checked: `final_check.mjs` → `no problems`, `px: no problems`)

| Id | What (art) | Lattice / px | px anchor | Notes |
|---|---|---|---|---|
| `conn_w` | 서리 큰길 west, X, 2 lanes + sidewalks | i −17…−5, j −5…−1 | centre (2224, 1059) | from the plaza's `east_gate` node (1830, 950); replaces v4's `link` footpath (the only overlap, intended) |
| `conn_jog` | 큰길 jog, Y | i −7…−3, j −8…−1 | (2512, 1299) | clears `tower_se` by 1.2 cells |
| `conn_e` | 큰길 east, X | i −3…8, j −8…−4 | (2896, 1587) | same lanes as `main` (j −8…−4), so buses run plaza → town without a jog |
| decor cleared | 4 east pines (2620, 1290) (2690, 1360) (2590, 1420) (2780, 1420); stumps (2700, 1360) (2580, 1400); (2440, 1310) (2440, 1440); signpost (1880, 1005) moved; lamps (2010, 905) (2230, 1060) moved to the sidewalk | — | — | the pines are choppable region trees; re-run the trees check after the patch |
| `S1` | stop 서리 광장 앞 (`sleigh_stop` → `bus_stop` at 도시) | L(−15, −0.45) | (2131, 849) | +j sidewalk, ≈ 7 s walk from the market |
| `S2` | stop 서리역 | L(3.2, −3.6) | (3094, 1533) | south edge of the station square (the 읍 pad is gone after 읍) |
| `S3` | stop 솔방울 분수 | the town's `t_sled` (31.7, −1.9) | (5027, 2390) | existing sled stop; a `bus_stop` sign is added beside it at 도시 |
| `S4` | stop 솔방울 학교 (pole `road_sign_round`) | L(41.6, −11.85) | (5024, 3025) | +j curb of the back street, east of the school (L(37.6, −11.85) falls inside `t_school`) |
| `S5` | stop 은행 앞 (pole) | L(34.15, −22.05) | (3894, 3113) | +j curb of 은행길 |
| `yard` | 서리 화물장 (pad + `crate_stack`) | px (1814, 1072) | — | 120 px south of `east_gate`; clear of plot `e_m1` |
| `board_plaza` | 광장 게시판 (`notice_board`) | `Z('plaza', 4.6, −2.6)` | (1080, 963) | the 기획서's "미션 게시판(광장 게시판)"; verify against plaza props in P0 |
| `v5_memorial` | 기억의 정원 (`memorial_garden`) | L(23.95, −19.54) | (3402, 2707) | quiet west end of row D, behind the homes |
| `v5_stable` | 마구간 차고지 (`stable_depot`) → `fuel_depot` at 도시 (in place) | L(27.66, −19.71) | (3629, 2831) | |
| `v5_bank` | 서리 은행 (civic `bank` cutaway) | L(36.21, −19.93) | (4162, 3111) | |
| `v5_busdepot` | 버스 차고지 (`bus_depot`) | L(40.77, −20.14) | (4441, 3264) | built by the 도시 ceremony |
| `bank_st` | 은행길, X, cobble → asphalt | i 23.1–40.9, j −24.2…−22.2 | (3683, 3081) | |
| `ave_s` | 중앙로 south, Y | i 30–34, j −22.2…−18 | (3882, 2982) | joins `ave` |
| `ws_x1` | XL plot (school / clinic / apartment A / apartment B) | px (−900, 2800) | — | `west_s`; a walk spur from `w_s` (−420, 2120) is added |
| `ws_x2` | XL plot | px (−554, 2973) | — | 0.3 cell from ws_x1 |
| `ws_x3` | XL plot | px (−899, 3145) | — | |

### 4.3 v6 갈매기 항구 (tech layout, checked)

| Id | Art | (i, j) | px | Footprint i / j |
|---|---|---|---|---|
| `h_shipyard` | `shipyard` | (57.87, −10.23) | (6169, 3494) | 55.40–60.35 / −12.00…−8.46 |
| `h_ferry_terminal` | `ferry_terminal` | (62.91, −10.59) | (6469, 3667) | 60.65–65.18 / −12.00…−9.17 |
| `h_fish_auction` | `fish_auction` | (67.60, −10.59) | (6769, 3817) | 65.48–69.72 / −12.00…−9.17 |
| `h_customs_house` | `customs_house` | (71.57, −10.73) | (7014, 3949) | 70.02–73.13 / −12.00…−9.45 |
| `h_harbor_warehouse` | `harbor_warehouse` | (75.69, −10.37) | (7300, 4069) | 73.43–77.95 / −12.00…−8.75 |
| `h_harbor_crane` | `harbor_crane` | (79.39, −11.08) | (7492, 4210) | 78.25–80.52 / −12.00…−10.16 |
| `h2_harbor_market` | `harbor_market` | (57.98, −2.21) | (6689, 3241) | second row, front j −3.2 |
| `h2_seafood_restaurant` | `seafood_restaurant` | (62.43, −2.07) | (6983, 3379) | |
| `h2_sailor_lodge` | `sailor_lodge` | (66.11, −2.14) | (7214, 3499) | |
| `h2_harbor_office` | `harbor_office` | (69.64, −2.14) | (7440, 3612) | |
| `h_station` | 항구역 (`train_station`, starts as a snowed-in ruin) | (62.00, 2.03) | (7218, 3234) | |
| `h_lighthouse` | `lighthouse` | (88.40, −11.40) | (8048, 4509) | rocky point between basin and beach |
| `blvd_h` | 바닷가 큰길, X, 2 lanes, asphalt | i 49.5–86, j −8…−4 | — | continues the main-street corridor |

Rail tiles k 46 → 98 (`rail_x_end_p` at k 98), crossings `[8, 33, 65, 97]`. Coast-line stops (3 cars, engine NW end):
town-east halt carA i 37.5 (train ends 34.93–39.90, clear of the k 33 crossing); 항구역 carA i 62; 해변역 carA i 94
(snowed-in site in v6). Legs 34.6 m / 17.1 s and 45.3 m / 21.2 s, dwell 10 s, cycle ≈ 117 s. Berths: ferry at the
terminal (far side to the gangway: `ferry anchor = terminal anchor + gangwayPoint − ferry.gangwayFarPoint[SE]`), cargo
ship along the quay at the crane (i 71–86), trawlers along the west wall heading NE/SW. Basin ships use SE/NW headings
(plus the ferry's S frames for its arrival shot).

### 4.4 v7 햇살 해변 (tech layout, checked)

| Id | Art | (i, j) | px |
|---|---|---|---|
| `b_beach_cafe` | `beach_cafe` | (92.16, −11.13) | (8306, 4620) |
| `b_icecream_shop` | `icecream_shop` | (95.21, −11.27) | (8492, 4722) |
| `b_resort_hotel` | `resort_hotel` | (99.54, −10.35) | (8828, 4832) |
| `b_hotel_pool` | `hotel_pool` | (104.94, −10.31) | (9176, 5003) |
| `b_seafood_bbq` | `seafood_bbq` | (108.91, −11.13) | (9378, 5156) |
| `b_surf_shop` | `surf_shop` | (111.90, −11.20) | (9565, 5254) |
| `b_convenience_store` | `convenience_store` | (114.89, −11.13) | (9761, 5347) |
| `b_mini_aquarium` | `mini_aquarium` | (118.23, −11.06) | (9979, 5452) |
| `b2_pension`, `b2_tourist_info`, `b2_souvenir_shop`, `b2_swimwear_shop`, `b2_beach_bar` | second row, front j −3.2 | (89.84 … 103.32, −2.0…−2.3) | (8742, 4254) … (9605, 4685) |
| `b_station` 해변역 | `train_station` | (94.00, 2.03) | (9266, 4258) |
| `blvd_b` | X i 86–116, j −8…−4 | — | — |

Boardwalk (`boardwalk_x`) along j −12.9; sand j −12.9…−19 (`ground_sand`, wet band by Water, `sandKit`/`wetKit`
edges); lifeguard tower near (101, −16.5); swim buoy line along j −21. The snow-to-sand transition runs along
`blvd_b` between i 86 and 90 (`ground_sand_snow_edge_*`).

### 4.5 v8 새 시가지 (tech layout, checked)

| Id | Art | (i, j) | px | Footprint |
|---|---|---|---|---|
| `c_police` | `police_station` (cutaway) | (43.15, −32.17) | (3822, 3725) | 40.60–45.69 / −33.80…−30.55 |
| `c_logistics` | `logistics_center` (cutaway) | (50.09, −30.97) | (4344, 3909) | 46.20–53.98 / −33.80…−28.14 |
| `ave_c` | Y, i 36–40, j −34…−24.2 | — | — | from 은행길 into the newtown |
| `lgx_st` | 물류길 X, i 35–54.2, j −36…−34 | — | — | |

Parking lots do not fit in the newtown: cars use curb stalls (`stall_lines`). The furniture workshop and appliance
factory are buildable village work buildings on M plots.

### 4.6 Checker

`tools/test/later/layout_ref.py` + `layout.mjs` (module-owned copies of the two scratch checkers, merged) check every row
of §4.2–4.5 against the v4 layout (`v4_layout_ref.py --json`), both seas (north `shoreY + 60`, south `southJ`), the
ballast, region union with a 46 px inset, streets, plots, towers, zones, region trees and decor. It must print
`no problems` before any layout patch lands (P19).

---

## 5. Architecture (shared by all modules)

### 5.1 Layers and import rules

```
          Game (v4 code, Phaser): Game.js · Neighbours · TownSim · RoadNet · DayClock · Residency · UI
                ▲ Ports (calls)                               │ GameFeed (normalized events)
  ┌─────────────┴────────────── src/kit (lead-owned, built first) ─────▼────────────────────────────┐
  │ ModuleHost · Ports · FakePorts · GameFeed · lattice · slices · rng · stage (StageDirector) ·     │
  │ income (IncomeMeter) · townfolkMerge · preview (designer menu registry)                         │
  └──▲─────────▲──────────▲──────────▲──────────▲──────────▲──────────────▲──────────────▲───────────┘
   story   missions    bank     vehicles    harbor      beach    city/logistics   city/incidents
   each:  model/ (pure, seeded)  view/ (Phaser only)  host.js  tuning.js  strings.js  save.js  index.js
```

| From | May import | Must not import |
|---|---|---|
| `*/model/*`, `src/kit/*` (non-view) | `src/data/*`, `src/kit/*`, own module | Phaser, `window`, `document`, `src/scenes`, `src/entities`, `src/systems` |
| `*/view/*` | v4 entities/systems as libraries (`TownBuilding`, `Character`, `DollSprite`, `Water`, `Assets`, `Audio`, `Bubbles`, `Panel`), own model | another module's model or view |
| `*/host.js` | own model + view, `src/kit` | another module's internals |
| v4 code | `src/kit/ModuleHost.js` only, through the P1 block | any module file |

A Node test greps the import graph (kit test). Modules talk only through feed events (§5.4) and each other's public API
(`gs.later.<id>`, read-mostly).

### 5.2 Module shape

```js
// src/<mod>/index.js
export const MODULE = {
  id: 'missions', version: 1,
  saveKey: 'missions', capBytes: 3072,          // slice key in the main save + JSON length cap
  needs: ['story?'],                            // soft deps ('?' = optional); constructed in dependency order
  gate: (gs) => !!(gs.v4 && gs.v4.rank && gs.v4.rank.level >= 2),   // polled at 1 Hz (and on load)
  prefetch: (gs, assets) => {},                 // fragments to fetch when the gate is near
  create: (ports, saved) => new Host(ports, saved),
  sanitize: (raw) => clean | null,              // pure; used by Save.js through the slice registry
  previews: { wedding: (host) => {...} },       // designer preview menu entries (§5.8)
};
// host: update(dt) · serialize() · state() · api (published as gs.later.<id>) · onFeed(ev) · destroy() · saveSide?(force)
```

`ModuleHost` constructs modules when their gate opens, ticks them in a fixed order (story → bank → missions → vehicles →
harbor → beach → logistics → incidents), measures each (EWMA ms, `__FV.later.perf()`, the `?debug=1` HUD), passes saved
slices through untouched while a module is not constructed (the v4 `v4` block rule) and destroys everything on shutdown.

### 5.3 Ports (module → game)

| Port | Backed by (v4, verified names) | Notes |
|---|---|---|
| `coins.add(n, x, y, fly)`, `coins.spend(n)`, `coins.value` | `gs.economy.add/spend/coins` | every module payout goes through here; the IncomeMeter subtracts module payouts |
| `income.perMin()` | kit `IncomeMeter`: samples `gs.economy.earned` every 5 s, rolling 300 s, minus module payouts and loans | no v4 patch |
| `ui.toast(msg, hold)`, `ui.banner(msg, sub)`, `ui.coinFly(x, y, n)` | `gs.ui` (UI scene) | exist |
| `ui.openPanel(Panel, data)`, `ui.chip(id, spec)`, `ui.card(spec)` | new UI hooks (P12) | non-pausing panels; one story card at a time |
| `say(body, text, emote, dur, opts)`, `emote(body, key, dur)` | `gs.life.bubbles.chat/emote` (Bubbles → VillageVoice) | town caps: ≤ 2 chat bubbles, ≤ 3 emotes on screen |
| `sound.play(key, opts)`, `sound.at(key, x, y)`, `sound.music(area)`, `sound.duck(level, hold)` | `Audio`, `gs.sfxAt`, `gs.voice.duck`; `music(area)` new (P15) | |
| `view.rect()`, `view.onScreen(x, y, m)`, `view.focus(x, y, ms)` | `gs.viewRect`, `gs.isOnScreen`, `gs.focusCamera` | camera grabs only where a module section allows it |
| `world.L(i, j)`, `world.px2L(x, y)`, `world.region(x, y)`, `world.isOpen(id)` | `L4/px2L4`, `Territory` | |
| `ground.bakeHook(fn, rect)`, `ground.invalidate(rect)` | `Ground` bake hooks | quays, piers, sand, boardwalks, markings are baked |
| `collision.add(x, y, r, tag)`, `collision.footprint(def, x, y)` | `Collision` | |
| `roads.route(a, b, mode)`, `roads.lanes()`, `roads.upgrade(id, cls)` | `RoadNet.route/driveNodes/driveEdges/connectors/upgrade` | |
| `town.*`: `addCitizen`, `leave`, `registerKind`, `addPlaces`, `hold`, `release`, `walk`, `gather`, `bodyOf`, `pickRiders` | `TownSim` (+ P6) | the only way to make or move townsfolk |
| `clock.T()`, `clock.hour()`, `clock.day()`, `clock.addLight(x, y, k)` | `DayClock` | |
| `assets.fragment(name, opts, onReady)`, `assets.has(key)`, `residency.want(page)`, `residency.demand(keys)`, `residency.addArea(a)`, `residency.addClass(name, cfg)` | `Assets.loadFragment`, `Residency.want/demand` (+ P4) | |
| `progress.flag(f)`, `progress.setFlag(f)`, `progress.goal(spec)` | `Progression` | |
| `sites.offer(def)` | `new Site(gs, id, cfg, kind)` + its UnlockPad (P29) | module buildings use v4's build-site flow (porters deliver, scaffold, ribbon) |
| `water.region(opts)` | `new Water(gs, opts)` (`heightAt`, `slopeAt`, `ripple`, `addContact`, `addHull`, `setPalette`, `setLighting`, `setQuality`) | |
| `settings.get(k)` | `Settings.data` (+ `lifeFarewell`, `incidents`, `missionToasts`) | |

`FakePorts` (kit) implements the same surface for Node tests and labs.

### 5.4 GameFeed (game → modules) and module events

The feed subscribes once to `gs.events` and re-emits `{ t, ...fields, T }`.

| `t` | Source | Payload | Patch |
|---|---|---|---|
| `sold` | `Seller.complete` | `{ value, item, n }` | P8 adds item, n |
| `storeSold`, `traded`, `restMeal`, `boatHome`, `dogLove`, `crafted`, `step`, `flag`, `region` | existing | as today | — |
| `built` | `Site` | `{ key, siteId, x, y }` | — |
| `produced` | `Station` | `{ station, item, n }` | P9 |
| `day` | `DayClock` | `{ day }` | P10 |
| `hour` | `'v4:hour'` | `{ h, name }` | — |
| `train` | `'v4:train'` | `{ ev, stop, line }` | P14 adds line |
| `visitorDone`, `shopOpen`, `cardDone`, `houseDone` | `v4:*` | as today | — |
| `rank` | `'v4:rankUp'` / `'v4:rank'` | `{ level, ceremony }` | P17 (levels 3, 4) |
| `settlers` | `Civic.settlersArrive` | `{ n, house }` | P27 adds house |
| `tap` | `VillageLife.react`, `Neighbours.tap` | `{ pid, x, y }` | P11 |
| `delivered` | module-owned pads | `{ pad, item, n }` | — |

Module events (same bus, namespaced, plain payloads): `story:talk|life|move|news|bank|shop|card|day|wish|incident`,
`mission:offer|accept|progress|done|expire|park`, `fame:pts|title`, `bank:deposit|withdraw|interest|loan|repaid|insure|claim`,
`veh:arrive|ride|driveDone|freight|era`, `harbor:ship|export|import|auction|tourists|star`,
`beach:arrive|leave|checkin|shop|event|star`, `lgx:stock|settle|dispatch|produced`,
`inc:stage|phase|end|wanted|fire|move`, `stage:open|close`.

### 5.5 Time

One clock: `DayClock.T` (600 s day, 25 s per game hour). Modules never keep a wall clock (except the daily/weekly
mission calendar, which uses the device date by design, §6.2). Models receive `T` and `dt` in game seconds (respects
pause). The engine starts at 06:00 on day 0, DayClock at 08:00: StoryHost ticks the difference once at creation.

### 5.6 People: one record per person

`src/story/model/registry.js` maps game ids to story ids.

| pid | Who | Body owner | In the story |
|---|---|---|---|
| `v:<key>` | named villagers (`npc_aunt` …, from `VillageLife`) | `Resident` | yes, `kept` (never marry, age, leave or bid farewell) |
| `t:<id>` | TownSim citizens (town + station-district households) | TownSim | yes |
| `s:<n>` | settler households in village houses (individuals from v5) | Civic walker → village house | yes |
| `h:<n>`, `b:<n>`, `c:<n>` | harbour / beach / newtown staff and residents | TownSim registered kinds | yes |
| — | train/bus visitors, ferry tourists, beachgoers, anonymous customers | Visitor / crowd | no (transient, seeded, never saved) |

**Leases.** A body is driven by exactly one owner at a time: `town` (routine), `gameplay` (v4 visitor trip, founder,
builder, ceremony gather) or `story` (wedding, date, farewell, chase, evacuation, moving). `town.hold(c, owner)` /
`town.release(c)` (P6); the engine is told through `lease(sid, on)` (E3). A test asserts one owner per body at all times.

**Adoption** (first v5 boot, same path for new games and old saves): roster = named villagers + TownSim citizens +
district households + settlers (old saves: generated up to the bed count, seeded). Households are inferred from shared
homes (adult pairs within 12 years → couple; students/teens with the first adults of their home → children; two
elders → couple; others singles). TownSim given names are kept; a surname is drawn deterministically. A **chronicle**
of the chief's deeds since the first train (station repaired, shops opened, the 읍 ceremony; from `progress.flags`)
is seeded as facts, so residents can say "촌장님이 역을 고쳐 주셔서 기차가 다니잖아요" on day one.

### 5.7 StageDirector (kit `stage.js`, pure scheduler)

Slots: `ceremony` (proposal, wedding, farewell, birthday party, rank ceremony, district reveal), `happening` (cute
happenings), `incident` (v8). Rules: at most one per slot; no happening during a ceremony or a drive; no incident during
a wedding or farewell; a beat is staged on screen only if its venue is within 1200 px of the view or the chief accepts
the card's **보러 가기** (a bus or train ride there); otherwise it plays off stage in the story only. Camera grabs (≤ 3 s,
skippable) only for the proposal, district reveals, ceremonies and a wedding the player chose to watch — **never for a
farewell**. Ceremonies skip to their end state on any joystick input after 3 s.

### 5.8 Designer preview menu ("이야기 미리보기")

Tapping the version label in settings 5× opens a list. Each module registers entries (`MODULE.previews`): 청혼, 결혼식,
아기 탄생, 첫 등교, 할머니의 소원, 이별 (with a confirm line), 버스 타기, 개썰매 배달, 도시 승격식, 여객선 도착, 화물선 크레인,
해변 하루, 북극곰 수영, 물류 센터 열기, 도둑 추격, 불 끄기. A preview runs on a throwaway copy of the module state, never
saves, and restores the camera afterwards.

### 5.9 Shared kit (`src/kit/**`, lead-owned, built first — L0)

| File | Content |
|---|---|
| `ModuleHost.js` | gates, order, perf EWMA, slice pass-through, `__FV.later` hooks |
| `Ports.js` / `FakePorts.js` | §5.3 |
| `GameFeed.js` | §5.4 normalizer |
| `lattice.js` | `L`, `px2L`, rects, `southJ`, `seaAt` helper (pure) |
| `slices.js` | slice registry `[{ key, version, cap, sanitize }]`, JSON-length cap check |
| `rng.js` | mulberry32 + named seeded streams |
| `stage.js` | §5.7 |
| `income.js` | `IncomeMeter` |
| `townfolkMerge.js` | generic `mergeTownfolkFragments(man, ...frags)` (port of `tools/cityfolk_compose.js`), throws on redefinitions |
| `preview.js` | preview registry + throwaway state helper |
| `tools/test/later/lab_kit.js` | boots Phaser 3.90 with FakePorts, loads real manifests and atlases read-only, reports draw calls, display objects, texture MiB, ms per tick, placeholders, console errors |

---

## 6. Modules

Every module job writes only: `src/<module path>/**`, `tools/test/later/<mod>*`, `docs/previews/later_<mod>/**`,
`docs/build_reports/later_<mod>.md`. It reads anything. Strings are Korean + English; engineering notes English;
`tuning.js` comments Korean (house style).

---

### 6.1 story_runtime — `src/story/**` (v5; v6–v8 add places, residents and incident staging hooks)

**Purpose.** Run the finished story engine (`tools/story`) in the browser, give every townsperson one story record,
turn story events into what the player sees (talks, life beats, cards, the paper), stage the whole life arc gently,
keep the chat's memory bridge working, and run the v5 cute happenings.

**Files**

| File | Layer | Purpose |
|---|---|---|
| `engine/**` | model | **copy** of `tools/story/{src,lang,data}` (tools/story stays untouched until P26) + extensions E1–E9, each with a Node test |
| `model/protocol.js` | model | message types and batch shapes (host and worker share it) |
| `model/worker.js` | model | worker entry: owns the engine, batches events, packs saves |
| `model/registry.js`, `model/adopt.js`, `model/places.js`, `model/chronicle.js`, `model/codec.js` | model | §5.6; place-kind mapping; chief chronicle; pack15 codec (≈ 40 % of base64 chars) |
| `model/lifeRules.js` | model | gates and caps for staged beats (§ tables below), "known people" rule, wish picker |
| `host.js` | host | `StoryHost`: transport (worker / Blob worker / inline), batching, request ids, mirror, side save |
| `mirror.js` | host | synchronous facade for chat and UI |
| `view/StoryLife.js` | view | talks → bubbles (face each other, anims), leases, `goTo`/`arrive` walks, rumour ears (`ui_icon_rumor`) |
| `view/scenes/{Proposal,Wedding,GoodNews,Birth,Stroller,FirstSteps,SchoolDay,OutdoorClass,ElderWish,Farewell,Birthday,Housewarming}.js` | view | life set pieces |
| `view/happenings/Happenings.js` + `happenings.js` (data) | view/data | v5 happenings P1–P6 (§6.1.6); v6/v7 entries are registered by harbour/beach |
| `view/ui/{StoryCard,NewsPanel,PersonCard,NamingSheet}.js` | view | `ui_story_card*`, `ui_newspaper*` (fx_city UI subset), name card extension, baby-naming bottom sheet |
| `chatBridge.js` | host | builds `new StoryBridge(mirror, village, { idOf, keyOf })` (src/chat/storyBridge.js unchanged) |
| `tuning.js`, `strings.js`, `layout.js` (memorial garden lot), `index.js` | data | |

**Engine extensions** (in the copy; the 30 original tests must still pass on it)

| # | Extension | Why |
|---|---|---|
| E1 | `config.externalPlans` + batched `at(sid, placeIdx, act)` | TownSim keeps v4 routines; meetings come from real co-presence; routine `goTo` is not emitted |
| E2 | `addResident(spec) → sid`, `removeResident(sid, why)`, per-resident `kept`, `hh`, `role` | adoption, settlers, founders, district staff |
| E3 | `lease(sid, on, placeIdx?)` | a body busy in gameplay is never cast into a conflicting beat |
| E4 | missing-kind tolerance (no bank/logistics yet), game-owned places (`place.locked`: Growth's founded shops), `setRates({ fireRate, incidentRate, babyRate })` | v5 runs without v8 places; Growth stays the shop authority; hydrants lower fires |
| E5 | `compact(level)` (memCap 40 → 24 → 16; prune weak facts and one-off acquaintances) | side save under its cap |
| E6 | `serialize({ packed: true })` → pack15 | the worker posts ≈ 40 % of the characters |
| E7 | two-speed aging: `yearDaysKid`, `yearDaysAdult`, `freezeAge` (player §14.3 patch: `daysForAge`, `ageFromDays`, `ageOf`, `makeResident`, `world.js` grown test); `DEFAULTS` gain the keys with 0 = use `yearDays` | "한 번 플레이에 한 세대" |
| E8 | `arrange(op, data)`: `propose { a, b, inDays, hour }` (sweethearts if needed, then engaged), `nameBaby { sid, name: { ko, en } }`; wishes via the existing `report('fact', …)` | scripted first proposal, the chief names babies |
| E9 | wedding timing and place: `weddingInDays` (default 2), `weddingHour` (11), `weddingGapDays` (6, global spacing), hall `world.first('town_hall', { prefer: 'ours' })` | weddings at our hall when built, never two prep missions at once |

**Message protocol** (batched, ≤ 8 messages per second each way):

```js
// main -> worker
{ t: 'init', seed, lang, dayLength: 600, world, residents, config, save? }
{ t: 'tick', dt, T, at: [[sid, placeIdx, actCode], ...] }      // every 0.25 s
{ t: 'visible', ids: Int32Array }                              // on change, ≤ 2 Hz, ≤ 64 ids
{ t: 'ack', id } | { t: 'report', kind, data } | { t: 'lease', sid, on, place }
{ t: 'add', spec, req } | { t: 'remove', sid, why } | { t: 'toggles', incidents, lifeEvents, farewell } | { t: 'prices', map } | { t: 'lang', lang }
{ t: 'arrange', op, data, req } | { t: 'talkTo', sid, lang, req } | { t: 'query', name, args, req } | { t: 'save', req, packed: true }
// worker -> main
{ t: 'events', T, list: [{ e: 'talk'|'goTo'|'arrive'|'life'|'move'|'bank'|'shop'|'news'|'day'|'incident'|'build'|'wanted', ... }] }
{ t: 'mirror', clock, weather, paper?, rel?, diaries?, cards?, stats }   // on day change and when changed
{ t: 'reply', req, data } | { t: 'saved', req, data, chars, ms } | { t: 'error', msg }
```

Worker start order: `new Worker('story_worker.js')` → Blob-URL worker from the same script text → inline (same
protocol; day changes sliced over frames). `test_deploy` verifies which mode runs in the published artifact.

**Public API** (`gs.later.story`)

```js
facade                         // mirror: clock {day, minute, dow}, weather.today {kind, temp}, newspaper(lang),
                               //   relationship(a, b), diary(id, day, lang), name(id, lang), on('talk', fn)
talkTo(pid, lang) -> Promise<{ lines }>          // the chief taps someone ("…" bubble during the round trip)
card(pid) -> { name, age, job, home, mood, best, spouse, kids, likes, chiefMemory } | null   // ≤ 1 game day old
passbook(pid) -> Promise<{ wallet, savings, loans }>
pidOf(body) / bodyOf(pid) / known(pid)
report(kind, data)                               // 'chief' | 'pet' | 'train' | 'fact' (v8: 'fire', 'theft')
arrange(op, data) -> Promise                     // E8
toggles({ farewell, incidents })                 // from settings
stage(kind, data)                                // other modules ask for a ceremony slot (harbour festival, beach events)
```

**Events.** In: `day`, `hour`, `tap`, `built`, `sold`, `train`, `visitorDone`, `settlers`, `rank`, `region`, `dogLove`,
`mission:done` (→ `report('chief', …)`, so residents thank the chief for real deeds), `fame:title`, `veh:ride`,
`harbor:ship`, `beach:checkin`, `lgx:settle`, `inc:phase` (acks). Out: `story:talk`, `story:life { op, a, b, who,
venue, atT }`, `story:move { op, household, members, home }`, `story:news { day }`, `story:bank`, `story:shop`,
`story:card`, `story:wish`, `story:day`, `story:incident` (v8; consumed by incidents).

**Life arc (binding staging)**

| Beat | When | On screen (art, anim, audio) | Chief's part / mission |
|---|---|---|---|
| Friends, 단짝, spats | ambient | warmer talk lines, `emote_wave` / `emote_heart`, walking side by side (lane offset 0.3 m); spats `emote_anger` and turning away, making up next day | A4 letters raise affinity |
| Sweethearts | ≈ 1 per real hour | benches together (`sit`, seat 0.45 m), evening walks 19–20 h, `emote_love`; card for known people | A5 secret bouquet |
| **First proposal** (scripted once) | 읍 + 12 s, in the crowd still gathered after the ceremony (old saves at 읍: 5 s after load, once) | a young townsperson who is our 단골 (≥ 3 visits) kneels to their sweetheart: "결혼해 줄래요?" → "네!", `emote_love` + `fx_heart`, crowd `clap` (`happy` + `emote_star` fallback); banner **"첫 결혼식이 열려요!"** / "내일 11시 · 마을회관"; 8 s, skippable after 3 s | opens C1 결혼식 준비 |
| Proposal (later) | engine `engaged` | pretty spot (fountain, plaza at dusk; lighthouse v6; beach at sunset v7), hearts, onlookers clap | C1 with a 2-game-day deadline |
| **Wedding** | 11:00 on the day; our 마을회관 (`TownHall.venue('wedding')`) if built, else 솔방울 `t_hall` | life2 `layouts.wedding_town_hall`: carpet, arch, 4 chair rows appearing as prep items land, cake table, `ribbon_garland`; 10:30 guests change into `wedding_guest` (door fade + sparkle), kids `flower_crown`; 11:00 `sfx_bell_hall` ×2, flower girl petals; bride (`bride`) walks the aisle, groom (`groom`) waits with `emote_sweat`; `bgm_wedding`; vows, hearts, everyone `clap`; photo flash (`fx_glow`, zoom ×1.25 for 2 s if the chief is there); kids stuck to the cake; first dance in the snow; props vanish at 18:00 with `fx_poof`. 60–90 s | C2 speech pad (+10 fame), C1 prep (+30), B6 cake drive (도시); fallback without prep: one chair row, no cake, warm line "케이크는 없었지만 둘은 정말 행복해 보였대요" |
| Good news | 3–5 game days after the wedding (first couple: v5 + 23 min) | rocking `cradle` by the door (4 fps), neighbours `emote_heart`; card "○○ 씨네 집에 기쁜 소식!" (no pregnancy art) | — |
| **Birth** | 2–3 game days later (first couple: 1), walk to the clinic at dusk (ours if built, else the town's), window glows all night, out at dawn pushing `baby_stroller` / `_pink` (`push`; placed at pusher anchor + `pushPoint` − `handlePoint`), `sfx_baby_giggle`; banner "아기 탄생!" | C3: the **naming sheet** (3 names from the engine's pool for the parents' generation + "부모님이 정할게요") and a gift box |
| Stroller walks | daily 14–16 h | plaza, fountain, garden; giggle when the chief is within 150 px (≤ 1 per 30 s); kids peek | — |
| First steps | age 4 | stroller gone, small child doll (hair from one parent, skin from the other, seeded), walks at 0.6 speed beside a parent | card |
| **First school day** | age 7, 07:00 | `acc_backpack` appears; 07:30 walk (or bus 2) to our school if built, else 솔방울 학교; at the gate the child waves, walks in, looks back once (face S, `emote_star`); bell | C4 walk them there |
| School life, outdoor class | daily | 08:00 bell, 10:30 recess, 12:00 lunch, 15:00 out; clear days 10:00 outdoor class with `school_desk_row` + `_front`, kids `sit`, teacher at the front | A15 school lunch |
| Teen, first job | 13–18; at 16 | café/bookstore after school; "첫 아르바이트!" — stands beside a shop owner one afternoon | — |
| Elders | 65+ | benches, café, clinic visits, walks with grandchildren, memory talks from the chronicle, naps after 14:00 (`emote_zzz`) | — |
| **Three wishes** | from 82, ≤ 1 elder at a time | an escort: the elder follows the chief slowly onto a bus/train to the place and sits there 20 s with `emote_heart`. Wishes from likes: sleigh bus to the fountain, the sea from the dock, cake at the café (v6 sugar), the lighthouse beam (v6), feet in the warm sea (v7), the grandchild's school | C7 (+15 fame each); granted wishes are remembered by the whole family |
| **Farewell** ("하늘나라 여행"; only when 생애 이벤트 is on) | engine: age ≥ 86, daily chance 0.004 × (age − 85); game gates below | last day: favourite places, gentle lines ("촌장님, 그동안 고마웠어요. 마을이 참 따뜻해졌어요."), sunset on the garden bench; that night one warm window; 09:00 card with a white flower: **"○○ 할머니가 하늘나라로 여행을 떠났어요."** / "가족과 이웃들이 기억의 정원에서 배웅해요 · 10시"; 10:00 family in `mourner_family`, friends `mourner` with white `held_bouquet`, a new `memorial_stone` + `flower_wreath` at the next `stonePoints` slot with the name; one by one they lay flowers (`sad`, bouquet becomes `item_bouquet` at the stone); 콩이 sits beside the chief; light snow drifting **upward**; garden tree glow; `bgm_farewell`; faces `sad` until evening; the next 3 days family visit the stone and remember the wishes | C8 lay a bouquet (+10 fame) |

**Gentleness rules.** No illness, hospital or death words anywhere — only "하늘나라 여행", "배웅", "기억". Farewell
gates: the garden exists; ≥ v5 + 180 min; ≥ 15 game days since the last; not within 5 game days of a birth in the same
family; never a named villager; never during another ceremony. Six stone slots; the seventh name goes to the garden's
"기억하는 사람들" panel and the oldest stone becomes a flower bed. **Setting "생애 이벤트: 켜기 / 끄기"** (designer's words:
"끄면 노년까지만, 이별 없음"): 끄기 sets `farewell: false`, cancels any queued farewell and freezes elders at 85; romance,
weddings, babies and growing up stay. Existing stones stay (open question Q2).

**Beat rates and caps** (≈ 200 simulated people; tuned in the lab with the engine's rates)

| Beat | Target per real hour | Hard caps |
|---|---|---|
| Sweethearts | ≈ 1 | — |
| Wedding | 0.7–1 | `weddingGapDays` 6; one prep mission at a time |
| Baby | ≈ 1 after the first | ≥ 3 game days after that couple's wedding |
| First school day | 0.3–0.5 | ≤ 1 per game day |
| Birthday party (known people) | ≤ 6 | ≤ 1 per game day |
| Elder wishes | ≈ 0.5 | ≤ 1 elder at a time |
| Farewell (on) | ≤ 0.4 | gates above |

**Known people** get story cards: district and village people, townsfolk the chief tapped or served ≥ 3 times (단골 ★),
families of anyone in an active mission. Everyone else appears only through talk, rumours and the paper. One card at a
time, queue 3, older cards go to the hall board's "마을 소식".

**Talks.** Rendered only when both bodies are materialised, ≤ 220 px apart and on screen; speakers turn to face, lines
go through `ports.say` (VillageVoice voices them); caps reached → emote only; the chat bridge's `decorateTalk` runs
first. TownSim's random `chatter()` is replaced by story talks on screen; `strings.js` lines remain the fallback.

**Newspaper (솔방울 신문).** First edition the morning after the first wedding; every game day at 07:00 an edge icon
pulses (`ui_icon_newspaper`, `sfx_newspaper`); tap opens the non-pausing NewsPanel (`ui_newspaper` masthead, headline,
3 articles, sidebar) from `story.newspaper(lang)`. Never modal. C15 (first interview) and F11 (read the paper).

**Person card.** v4's name card gains: age, job, home, 단짝, spouse, children, likes, the last thing they remember about
the chief, and the existing **수다 떨기** button.

**6.1.6 Cute happenings (v5 set; harbour and beach register theirs).** At most one active, ≥ 150 s apart, ≈ every 300 s,
never during driving, ceremonies, weddings or farewells; only within 900 px of the chief or announced by a small toast
with 보러 가기.

| # | Name | What happens | Chief's part |
|---|---|---|---|
| P1 | 콩이의 빵 도둑질 | 콩이 snatches a loaf from the market shelf, kids chase laughing, the shopkeeper `emote_anger` then laughs | whistle: 콩이 comes back head low (`emote_sweat`), +2 fame |
| P2 | 날아간 눈사람 모자 | wind blows a snowman's hat off, a kid runs after it | watch (+2 fame watched) |
| P3 | 지붕 위 고양이 | 나비 stuck by a chimney (`emote_question`), kids gather | stand 3 s: it jumps into the chief's arms, +3 fame |
| P4 | 배고픈 말 | sleigh-bus horses nuzzle a passenger's bag at a stop | wheat 2 (A13 shortcut) |
| P5 | 증기 짐차 김 빠짐 | the wagon stops with a big `sfx_steam_whistle` hiss; kids push; it chugs on | — |
| P6 | 길 잃은 펭귄 | 뽀삐 waddles onto the bus | lead it home (E3 shortcut) |

**Save slice** `story` v1, cap **1 KB** (main save): `{ v, day, ok, chars, life: { seen: { proposal, wedding, baby,
school, wish, farewell }, firstCouple: [sid, sid], names: [[sid, ko, en]] ≤ 40, garden: [{ ko, en, day }] ≤ 6,
gardenOld, wishes: { sid: n } ≤ 8 }, happen: { last } }`. Side key `frostVillage.save.v1.story` (= `SAVE_KEY + '.story'`):
`{ v: 1, cid, T, day, reg: [[pid, sid]], eng: <pack15> }`, cap **450 K chars** (hard 600 K); written at `day`,
`pagehide` and `visibilitychange: hidden`, never on the 5 s autosave. Over 450 K → `compact(1)`, then `compact(2)`;
over 600 K → keep the previous record and toast once. Missing or corrupt side record → regenerate from the seed and the
chronicle (people keep looks, homes, names; memories reset) with the gentle card "주민들이 오늘 일을 조금 잊어버렸어요".
The registry reconciles on load (game people missing in the story → `add`; story people without bodies → leased
"away"); the worker fast-forwards at most one game day.

**Data tables** (`tuning.js` → `BALANCE.v5.story`)

```js
story: {
  worker: true,                       // 이야기 엔진을 뒷방(워커)에서 돌려요 (안 되면 저절로 같은 방에서)
  tickEvery: 0.25,                    // 엔진에 시간을 보내는 간격(초)
  maxResidents: 400,                  // 이야기 속 주민 최대 수
  life: { yearDaysKid: 1.5, yearDaysAdult: 4,      // 1살 먹는 데 걸리는 게임 날 수 (아이 / 어른)
          weddingInDays: 2, weddingHour: 11, weddingGapDays: 6, firstWeddingInDays: 1,
          babyAfterWedding: [3, 5], firstBabyAfterMin: 23, clinicNight: true,
          schoolAge: 7, walkAge: 4, firstJobAge: 16, birthdaysPerDay: 1,
          wishAge: 82, wishes: 3, farewellMinAge: 86, farewellFirstAfterMin: 180, farewellGapDays: 15,
          farewellBirthGapDays: 5, freezeAgeWhenOff: 85, stones: 6, cardsQueue: 3, knownServed: 3 },
  talk: { maxDist: 220, chatCap: 2, emoteCap: 3 },
  paper: { hour: 7, firstAfterWedding: true },
  happenings: { gapMin: 150, every: 300, maxActive: 1, range: 900 },
  save: { capChars: 450000, hardChars: 600000 },
}
```

**Budgets.** Main thread (StoryHost + StoryLife + scenes) ≤ 0.10 ms per tick average, 0 long tasks (> 50 ms) from the
story; worker ≤ 2 ms per game second on a phone (≈ 0.4 ms measured on a desktop core); ≤ 400 residents. Textures:
townfolk2 life pages only for the cast's ages, acquired 1 game hour before a wedding/farewell and released 60 s after
(transient ≤ +40 MiB); `life2` ≤ 3 MiB resident (wedding or memorial atlas near its venue; strollers in view); UI subset
(ui4 icons, newspaper, story card) 1.9 MiB. Draw calls ≤ 14 during a wedding only (townfolk + townfolk2 exceed 16
texture units), else ≤ 12.

**Tests** (`tools/test/later/story.test.mjs`, Node): E1–E9 each (external plans give talks only between co-present
residents; add/remove keep households valid; leased residents never cast; missing kinds tolerated; compact keeps the
save under cap after 120 game days; packed round trip identical; aging milestones at the configured days, freeze when
farewell is off, old engine saves keep their ages; `propose` → wedding at 11:00 the next day at the preferred hall;
`weddingGapDays` respected over 60 days); worker ↔ inline protocol parity over 3 game days (identical event streams);
adoption keeps every TownSim name; registry reconcile after a lost side record; life gates (no farewell before the
garden, before v5 + 180 min, within the gaps, for named villagers, or with the switch off); the original 30 engine
tests run against the copy.

**Lab** (`tools/test/later/story_lab.html` + `.mjs`; captures to `docs/previews/later_story/`): 12 townsfolk talking
at the fountain (ko + en); the proposal in a crowd; a full wedding at a `town_hall` with life2 props and townfolk2
outfits; good news cradle; stroller walk; first school day at the town school; an elder's wish escort; the farewell
(and the same moment with the switch off: no card); newspaper panel; naming sheet; person card; worker vs inline
timing; each with draw calls, objects, MiB, ms.

**Integration hooks:** P1, P2 (side key, settings), P3 (townfolk2, life2, fx_city UI subset, audio3 `bgm_wedding/
farewell`), P4, P5 (townfolk2 runtime), P6 (TownSim leases/walk/registerKind/onArrive), P10, P11, P12 (cards, panels,
settings row, preview menu), P13 (`TownHall.venue('wedding')` exists), P19 (memorial lot), P21 (chat bridge), P22
(voices), P25/P26 (bundles), P27 (settlers carry their house), P34 (person card).

---

### 6.2 missions_bank — `src/missions/**` + `src/bank/**` (v5; bank insurance v8)

**Purpose.** Give the chief a heartbeat of things to do that come from residents' mouths: the mission board, request
bubbles, event missions from the story, daily and weekly goals, streaks, fame and five chief titles with visible
rewards; and the 서리 은행: savings with interest, construction loans that remove saving gaps, residents' passbooks, and
(v8) fire insurance.

**Files**

| File | Layer | Purpose |
|---|---|---|
| `missions/data/catalog.js` | data | the 98 templates (§7), designer-editable, one line per mission, ko + en |
| `missions/model/missions.js` | model | eligibility (unlock, cooldown, weights), instances, objective progress from feed events, park/resume (keeps progress), focus rule, reward formula |
| `missions/model/calendar.js` | model | daily/weekly rollover by local date string (05:00 reset), streak + 눈사람 방패, at most one rollover per launch, no double count on clock rollback |
| `missions/model/fame.js` | model | points, passive sources, titles, rewards, flairs |
| `missions/view/{MissionChip,MissionPanel,Boards,RequestBubbles,EventPads,FameChip,TitleRewards,Hints}.js` | view | chip (replaces v4's order chip), panel tabs 진행 중 · 게시판 · 오늘 · 이번 주 · 칭호, plaza/hall/station boards, bubbles, pads (잔치 상, 축사, 꽃밭 picking, cake order at the bakery, gift wrap at the 잡화점, delivery pads), Tutorial hints |
| `bank/model/account.js` | model | deposit, withdraw, interest, loan offer/take/repay, restructure, ceremony share, v8 insurance |
| `bank/view/{BankBuilding,Tellers,Queue,Vault,PassbookPanel,LoanSheet}.js` | view | civic `bank` cutaway at row D, tellers, queue, vault anim, passbook, loan sheet |
| `missions/tuning.js`, `bank/tuning.js`, `strings.js`, `index.js` (two MODULE entries) | data | |

**Sources and slots**

| Source | Where | Slots | Refresh |
|---|---|---|---|
| Board cards | 광장 게시판, our 마을회관 board (`TownHall.boardLines/openBoard`, "the place v5's missions will go"), the station 주문판 (v4 standing orders appear as 생산 목표) | 3 | new card 20 s after a completion; "다른 미션" after 120 s without progress **parks** the card with its progress |
| Request bubbles (부탁) | `ui_icon_request` + item icon over a resident | ≤ 2 on screen, ≤ 4 world-wide, ≤ 3 accepted | one every 45–90 s; untouched bubble pops after 6 min |
| Events (행사) | story cards (wedding, baby, school, festivals, ships) | as they happen | story / districts |
| Daily (오늘의 미션) | panel 오늘 tab | 3 | local date, 05:00 (switch `daily.clock: 'real' | 'game'`, Q3) |
| Weekly (이번 주 목표) | 이번 주 tab | 1 (3 stages) | Monday 05:00 local |
| Streaks | 오늘 tab | — | §7 H |
| Other modules | `api.offer(spec)` | — | harbour exports, beach events, wanted posters |

Accepting: tap a bubble, or stand within 90 px still for 0.5 s → card with 받기 / 나중에. Board cards are active at once.
**Focus rule** (chip): an event with a deadline under 3 game hours → an accepted request → the board card with the
most progress. **Hints** (after v4's list, P30): event needing the chief within 1 game hour → arrow to its pad;
carrying what an accepted request needs → arrow to the recipient (live position, edge marker off screen); the focus
mission's next physical step; idle with nothing doable → nearest request bubble.

**Rewards.** `coins = max(payFloor × era, round10(pay × I))` with `I` = IncomeMeter (§5.3); fame fixed per template;
driving stars multiply coins (★ 0.6, ★★ 0.85, ★★★ 1.0) and ★★★ adds +5 fame; **materials are never a reward**.
Passive fame (so arrow-only players reach titles): +1 per 25 bus/train riders, +5 per wedding or birth in our
village (even unattended), +5 per new shop, house level or district star, +2 per happening watched (≈ 3–4 per minute).

**Titles**

| Title | Fame | Reward (existing art) | Also |
|---|---|---|---|
| 새내기 촌장 | 0 | — | — |
| 믿음직한 촌장 | 150 | **마을 악단**: `music_stand` + `bench_seats` at the plaza; the bard plays at 18:00, residents sit and dance | settlers every 45 s → 40 s; the bank site appears |
| 존경받는 촌장 | 400 | **눈꽃 아치**: permanent `wedding_arch` + 2 `flower_stand` at the hall (photo spot) | needed for 도시 |
| 명예로운 촌장 | 900 | **랜턴 거리**: `lantern_string` along the plaza and 서리 큰길, lit at night | ferry tourists +20 %; needed for 큰 도시 |
| 전설의 촌장 | 2,000 | **도시 입구 문**: `town_gate_x` reading "서리시" at the 큰길 west end; gold crown flair | rank 5 idea (P2) |

`ui_badge_rank_*` stays for the village rank; fame titles use `ui_icon_title` + 1–5 small stars.

**Bank**

| For | What | Numbers |
|---|---|---|
| Opening | site at row D when title 1 is reached or 읍 + 20 min; 9,000 + 30 planks + 20 ingots, 14 s; a banker arrives (townfolk `top_blazer` + `det_tie`; cityfolk `banker`/`bank_teller` from v8); ribbon; "서리 은행 개업!"; first mission "첫 저금" | |
| 저금 | stand on the 창구 pad, coins fly in; passbook (`ui_passbook`) | 1.0 % per game day at 06:00; cap 50,000 (v6: 150,000) |
| 대출 | offered on any build/ceremony pad when coins are short (P28): "은행에서 빌릴까요? 1,800 (수수료 5 %)" | up to 15 min of current income; 5 % flat fee; auto-repaid from 10 % of income; one loan at a time; ceremonies: up to 50 % of the cost |
| Gentle misses | never negative coins: repayment only takes from income; a loan older than 6 game days is restructured (fee waived) twice, then paused | |
| Residents | savings and loans in the story engine; passbook panel lists the chief + 5 nearest residents | |
| Cute details | tellers at `staffPoints`, queue at `customerPoints` 09–17 from story `bank` events, vault door (`bank_vault`) turns when the chief deposits ≥ 5,000, `sfx_coin_count`, `sfx_stamp`, `sfx_ticket_chime`, `amb_bank`; the shell fades when the chief walks in or taps `revealPoly` | civic bank pages + 4 audio6 sounds load with the bank |
| v8 insurance | 보험: per building, premium 0.4 % of its build cost per game day; a fire ruin pays 100 % of the rebuild; the rebuild comes back one level better (insurance + a bank loan) | |

**Public API**

```js
gs.later.missions: boardLines() · active() · focus() · focusTarget() -> { x, y, label } | null
                   offer(spec) -> id · fame() -> { pts, title, next } · open(tab)
gs.later.bank:     account() -> { savings, loan: { left, fee } | null, interestToday }
                   maxLoan() · offerFor(short, padId) -> Promise<boolean> · deposit(n) · withdraw(n)
                   insured(bldId) · insure(bldId) · claim(bldId) -> coins        // v8
                   passbookRows(pids) -> rows
```

**Events.** Missions in: `sold`, `storeSold`, `traded`, `produced`, `crafted`, `built`, `delivered`, `restMeal`,
`visitorDone`, `veh:ride`, `veh:driveDone`, `story:life` (engaged → C1, baby → C3, school → C4, wish → C7, farewell
→ C8, birthday → C9/A12), `story:move` (in → A8/C5), `story:card`, `harbor:ship|export`, `beach:*`, `lgx:settle`,
`inc:wanted`, `day`, `hour`, `tap`, `rank`. Out: `mission:*`, `fame:pts`, `fame:title`. Bank in: `day`, `hour`,
`rank`, `inc:fire`, `story:bank`; out: `bank:*`.

**Save slices.** `missions` v1, cap **3 KB**: `{ v, nextId, board[≤3], active[≤6], parked[≤6], bubbles[≤4],
cool: { tpl: tUntil } ≤ 98, daily: { date, ids[3], got[3], done[3] }, weekly: { week, id, stage, got },
streak: { n, last, shieldWeek }, combo: { n, t }, fame: { pts, title, flair: { crown, driver }, log[≤12] } }`.
Instance: `{ id, tpl, st: 'offered'|'active'|'parked'|'done'|'expired', got, t0, due, stars, who: [sid] }`.
`bank` v1, cap **1 KB**: `{ v, open, savings, loan: { left, fee, t0, restructured, paused } | null, lastDay }`;
v2 (v8) adds `insured: [bldId] ≤ 32`.

**Data tables** (`tuning.js` → `BALANCE.v5.missions`, `BALANCE.v5.bank`)

```js
missions: { board: 3, refresh: 20, swapAfter: 120, bubblesOnScreen: 2, bubblesWorld: 4, acceptedMax: 3,
            requestEvery: [45, 90], bubbleLife: 360, acceptRange: 90, payFloor: 100, income: { window: 300 },
            daily:  { count: 3, pay: 0.5, fame: 5, allPay: 1.0, allFame: 15, resetHour: 5, clock: 'real' },
            weekly: { pay: [2, 3, 5], fame: [20, 30, 50], resetDay: 1, resetHour: 5 },
            streak: { rewards: { 2: { fame: 10 }, 3: { decor: 'deco_flowers' }, 5: { pay: 3 }, 7: { fame: 50, flair: 'crown' } },
                      shieldPerWeek: 1, comboRequests: 5, comboWindow: 900, comboFame: 5, driveStars: 3, driveFame: 20 },
            drive:  { par: { slackPerStop: 8, vmaxShare: 0.6 }, stars: [1.0, 1.3, 2.0], payByStars: [0.6, 0.85, 1.0], bonusFame3: 5 },
            fame:   { titles: [0, 150, 400, 900, 2000], riders: 25, lifeBeat: 5, newThing: 5, happening: 2,
                      settlerBoost: [0, 0.1, 0.1, 0.2, 0.3], touristBoost: [0, 0, 0, 0.2, 0.3] },
            craft:  { bouquetStand: 3, bouquetsPerBed: 6, bouquetBuy: 25, cakeBread: 12, cakeTime: 20, giftItems: 3 } },
bank:     { site: { coins: 9000, item_plank: 30, item_ingot: 20, time: 14, afterMin: 20 },
            interestPerDay: 0.01, interestHour: 6, depositCap: 50000, depositCapV6: 150000,
            loanMinutes: 15, loanFee: 0.05, repayShare: 0.1, ceremonyShare: 0.5, restructureDays: 6, restructures: 2,
            insurance: { premiumPerDay: 0.004, cover: 1.0, rebuildLevelUp: 1 } },
```

**Budgets.** Missions ≤ 0.02 ms per tick (event-driven, 1 Hz expiry check); bank ≤ 0.01 ms. Textures: ui3 1.5 MiB
(already late-loaded in v4), ui4 subset shared with story; bank cutaway layers only near row D (area class).

**Tests** (`missions.test.mjs`, `bank.test.mjs`, Node): all 98 templates load and validate; every objective type
progresses from synthetic feed events; 30 simulated game days give ≥ 3 offers/day, no template twice within its
cooldown, every offered mission completable from items producible at its unlock (anti-softlock); rollover across
midnight, DST and a clock moved backward; shield once per week; swap keeps progress; reward = max(floor, pay × I);
fame monotonic; sanitize fuzz (200 slices). Bank: money conservation (wallet + savings + loan), interest at 06:00 and
the cap, loan limit (15 min of income), repayment share never makes coins negative, two restructures then pause,
ceremony share, insurance claim pays once per ruin.

**Lab** (`missions_lab`, `bank_lab`): board panel with 4 cards; chip focus switching; request bubbles over dolls;
a delivery to a moving recipient with the edge marker; title-up banner and the 마을 악단 reward; the bank cutaway
open/closed, a queue of 6, the vault turn, passbook, loan sheet on a short pad.

**Integration hooks:** P1, P2, P12 (chip slots, panels), P13 (hall board), P17 (fame bar for ranks 3–4), P20, P28
(pad shortfall → loan), P29 (bank site), P30 (Tutorial hints), P31 (order chip hidden when missions run), P8/P9
(sold/produced detail for goals).

---

### 6.3 vehicles_runtime — `src/vehicles/**` (v5; v6/v7 add bus lines 3–4; v8 adds emergency, vans, moving trucks, demolition)

**Purpose.** Vehicles that change with the era and actually do work: sleigh buses that bring neighbours to our plaza,
a steam wagon (then trucks) carrying our goods to the neighbours' shops, residents' cars, the chief's dog sled and
truck for delivery missions, buses and trains as fast travel, traffic lights, and the 도시 asphalt wipe.

**Files**

| File | Layer | Purpose |
|---|---|---|
| `model/lanes.js` | model | adapter over `RoadNet.driveNodes/driveEdges/connectors/laneCentre/stopLine` (right-hand, unit-tested in v4) |
| `model/VehicleSim.js` | model | per-lane ordered lists; `{ id, key, kind, route, lane, s, v, len, state, dwell }`; following gap ≥ 1.2 m + 0.9 s·v; junction entry by connector reservation (no conflicting connector occupied); rail crossings via `xingBlocked(k)` (both rail lines); stop 1.5 m before any materialised walker on the lane (nobody is ever hit); traffic lights; off screen analytic (route + speed profile) |
| `model/transit.js` | model | bus lines, stops, per-bus phase clocks, riders per game day (10-day ring), fast-travel booking |
| `model/fleet.js` | model | buses per line; freight jobs (yard → station cargo pad → founded shops' restock; v6 → quay); household cars (level-2 houses, parked at garages / curb stalls / lots; ≤ 6 moving); v8 dispatch (fire truck, police car, ambulance, delivery vans, moving truck, excavator, dump truck) |
| `model/eras.js` | model | manifest `eras` table: era 2 at 읍, era 3 at 도시; depot/stop swaps |
| `model/chiefDrive.js` | model | lane-snapped driving: stick projected on the lane heading = throttle/brake; at a junction the connector closest to the stick (straight when idle); dead end → U-turn; coast to 0.6× on release; par and stars; a run never fails |
| `view/VehicleSprite.js` | view | soft shadow ellipse (manifest `shadow`), axis heading frames with mirror (dx negated), passengers at `seats` in `seatDrawOrder` playing `sit` (townfolk2) or `idle` at `seatsStand`, then the `overlay` frame; driver doll always present; `lightPoints` glows at night; horse breath / steam puffs (`fx_smoke` at `steamPoint`); horn ≤ once per 3 s |
| `view/{Stops,Depots,FreightYard,TrafficLights,TransitChip,DriveHUD,EraWipe}.js` | view | stops (`sleigh_stop` → `bus_stop`, pole signs), depots (`stable_depot` → `fuel_depot`, `bus_depot` doors), yard pad + `crate_stack`, lights 6/2/6 s, "다음 버스 12초 · 어디로?" chip + destination list with thumbnails, timer + stars + next-stop arrow + **빵빵** button, the 도시 ceremony wipe |
| `layout.js`, `tuning.js`, `strings.js`, `index.js` | data | streets (`conn_w`, `conn_jog`, `conn_e`, `bank_st`, `ave_s`; later `blvd_h`, `blvd_b`, `ave_c`, `lgx_st`), stops, depots, yard |

**What moves where**

| Era | Vehicle | Job | Route | Numbers |
|---|---|---|---|---|
| 읍 | 말썰매 버스 `horse_sleigh_bus` (8 seats + coachman `driverSeat`) | brings townsfolk to our plaza, takes ours to the town; fast travel | **bus 1**: S1 서리 광장 앞 ↔ S2 서리역 ↔ S3 솔방울 분수 (S2 ↔ S3 only until 서리 큰길 is built); **bus 2**: S2 → S4 솔방울 학교 → S5 은행 앞 → S2 | 3.0 m/s, dwell 8 s, headway 70 s |
| 읍 | 증기 짐차 `steam_wagon` | carries yard surplus to the station cargo pad (wholesale 70 %, v4 rule), founded shops' shelves, house sites | yard → 큰길 → station → shop rows → back | 3.4 m/s, 30 items, load 4 s, unload 0.12 s per item (items fly from `cargoPoint` to the shelf) |
| 읍 | 개썰매 `dog_sled` | the chief's timed mail runs | drivable cells + `sled` snow paths | 5.5 m/s; the chief at `seatsStand`, hull overlay over his legs |
| 읍 | 짐수레 썰매 `cargo_sleigh` | station porters' upgrade | square ↔ yard | capacity 12 → 20 |
| 도시 | 레트로 버스 `retro_bus` | buses 1–2; v6 bus 3 (S3 → harbour market → ferry terminal); v7 bus 4 (harbour → beach gate) | | 5.0 m/s, 9 seats, dwell 6 s, headway 50 s |
| 도시 | 운송트럭 `truck_cargo` | replaces the steam wagon; inter-district freight, v6 export loads | | 5.5 m/s, 40 items, load 3 s |
| 도시 | 촌장 트럭 `truck_cargo_chief` | delivery missions | any drive lane | 6.0 m/s max |
| 도시 | cars `car_a/b/c/d_*` (12 colourways) | residents' life and traffic | home ↔ shops/work; park at `garage_small`, lots, curb stalls | ≤ 6 moving, ≤ 24 parked, ≤ 4 colourways resident |
| v8 | `police_car`, `fire_truck`, `ambulance`, `delivery_van_*`, `moving_truck`, `forklift`, `excavator`, `dump_truck` | incidents, logistics, moving, rebuilding | dispatch API | — |

Traffic density on screen (nearest first): village gate / 큰길 ≤ 2 cars, station district ≤ 3, town ≤ 4,
harbour/beach ≤ 3; buses per line; trucks 1–2.

**Riders and visitors.** Each bus 1 arrival at S1 brings up to its seats in neighbours picked by `town.pickRiders`
(TownSim trip wish), who become v4 Visitors walking from the stop (P14: `sendByBus`); v4's `maxInVillage` cap stays.
Settlers arrive by bus with luggage while beds are empty. Riders per game day feed the rank-3 bar.

**Riding (fast travel).** Standing at a stop shows the transit chip; pick a stop; the chief fades at the door,
appears at a window seat waving, the camera follows; any joystick input leaves at the next stop. Trains work the same
at stations (closes v4's P1 "chief rides the train").

**The 도시 ceremony (vehicles' part, inside Rank's 14 s):** `roads.upgrade(conn_*, main, back, ave, ave_s, bank_st,
'asphalt')` as an outward wipe, curbs, `lane_x/_y`, `crosswalk_x/_y`, then two `traffic_light`s pop at the main × 중앙로
junction; sleigh buses roll into the stable, `stable_depot` swaps to `fuel_depot`, retro buses roll out of the new
`bus_depot` (`sfx_bus_horn`); the steam wagon becomes a truck; cars appear at level-2 houses. Banner **"서리읍 →
서리시!"** / "이제 시장님이에요 · 그래도 다들 촌장님이라고 불러요".

**Public API** (`gs.later.vehicles`)

```js
era() -> 2 | 3 · lines() -> [{ id, stops, buses }] · eta(stopId) -> s · ridersToday() -> n
ride(fromStop, toStop) -> Promise                 // the chief (buses and, through P14, trains)
spawn(key, route, opts) -> id · despawn(id)
dispatch(kind, to, opts) -> Promise<{ arrived }>  // v8 emergency, vans, moving, demolition
drive(spec) -> Promise<{ stars, timeS }>          // spec: { tpl, vehicle: 'dog_sled'|'truck_cargo_chief', stops, cargo, capSpeed? }
chiefDriving() -> bool · parkedNear(x, y, r) -> cars
```

**Events.** In: `rank` (era 3), `built` (depots, stops, road), `day`, `hour` (lights, headlights), `story:move` (v8
moving truck), `inc:stage` (dispatch), `lgx:dispatch`, `harbor:export` (truck loads), `tap` (honk at a blocked car).
Out: `veh:arrive { id, stop }`, `veh:ride { line, n }`, `veh:driveDone { tpl, stars, s }`, `veh:freight { items, to }`,
`veh:era { n }`.

**Save slice** `vehicles` v1, cap **1.5 KB**: `{ v, era, built: { depot, road, stops: [], yard, wagons, busDepot },
lines: { 1: n, 2: n, 3: n, 4: n }, riders: [10 game days], cars: [[pid, key]] ≤ 24, chief: { best: { tpl: s } ≤ 12 } }`.
Transients (moving vehicles, passengers) are not saved: buses restart on their phase clocks.

**Data tables** (`tuning.js` → `BALANCE.v5.vehicles`)

```js
vehicles: {
  depot:       { coins: 3000, item_plank: 30, item_ingot: 6, time: 10 },   // 마구간 차고지 (도시가 되면 연료 창고)
  road:        { coins: 5000, item_plank: 40, item_ingot: 10, time: 20 },  // 서리 큰길 (광장 동문 ↔ 서리역)
  stop:        { coins: 600, time: 3 },                                     // 정류장 하나 (S2·S3 는 무료)
  freightYard: { coins: 1200, time: 4 },                                    // 서리 화물장
  sleighBus:   { coins: 3500, speed: 3.0, seats: 8, dwell: 8, headway: 70 },
  steamWagon:  { coins: 4000, item_ingot: 20, speed: 3.4, capacity: 30, loadTime: 4, unloadPerItem: 0.12 },
  cargoSleigh: { capacity: 20 },
  dogSled:     { speed: 5.5 },
  retroBus:    { coins: 6000, speed: 5.0, seats: 9, dwell: 6, headway: 50 },
  truck:       { coins: 7000, speed: 5.5, capacity: 40, loadTime: 3 },
  chiefTruck:  { speed: 6.0, coast: 0.6 },
  cars:        { maxMoving: 6, maxParked: 24, colours: 4 },
  traffic:     { green: 6, yellow: 2, red: 6, blockAhead: 1.5, honkEvery: 3, gap: 1.2, headwayS: 0.9 },
  speedByClass: { dirt: 3, cobble: 4, asphalt: 5.5, horses: 2.5 },
  parking_lot_s: { coins: 1500, item_ingot: 4, time: 5, happy: 2 },
  residency:   { maxKeys: 8, ttl: 20, maxMiB: 45 },
}
```

**Budgets.** ≤ 24 simulated, ≤ 12 materialised, ≤ 4 passenger dolls drawn per bus (lite rigs); ≤ 0.15 ms per tick.
Textures: Residency class `vehicle`, one ref per materialised key, ≤ 8 keys and ≤ 45 MiB resident, TTL 20 s; vehicle
buildings by area (≈ 6–10 MiB); low tier: 2 car colourways, no passengers.

**Tests** (`vehicles.test.mjs`, Node): 10,000 random routes on the v4 + v5 (+ v6–v8) graphs: no two vehicles overlap
on a lane, no conflicting connectors occupied, all stops reachable, crossings respected for both rail lines; chief
drive picks the expected connector for 8 stick directions; par/stars and "never fails"; transit headways, dwell, ETA,
booking, riders count (2 buses ⇒ ≥ 120 riders/day); freight conservation (items out of the yard = items onto shelves +
cargo pad).

**Lab** (`vehicles_lab`): the station district at 읍 (sleigh bus with seated passengers and breath puffs, steam wagon
unloading into a shop, dog sled) and at 도시 (asphalt markings, retro buses, trucks, 6 cars, traffic lights, night
headlights), the chief driving a delivery with the HUD, a bus ride with the camera following, a walker blocking a lane.

**Integration hooks:** P1, P3 (vehicles fragment, roads markings, audio3 loops), P4 (`vehicle` class), P6 (riders,
`pickRiders`), P14 (rails list, `sendByBus`, chief rides trains), P17 (riders bar; ceremony feed), P18 (lane
markings), P19 (streets appended to `WORLD.v4.streets`, stops, depots, yard, decor removal), P29 (sites), P32 (Growth
restock targets for freight).

---

### 6.4 harbor_runtime — `src/harbor/**` (v6)

**Purpose.** Open and revive 갈매기 항구 on the warm south coast: ships that really bob on the living water, a crane
that swings crates, an auction with a bell, the lighthouse beam at night, tourists from the ferry, export contracts and
imports that open new production chains, a shipyard building deep-sea trawlers, and the coast train.

**Files**

| File | Layer | Purpose |
|---|---|---|
| `model/schedule.js` | model | ferry, cargo, trawler, tug, sail/yacht timetables; berths never double-booked |
| `model/trade.js` | model | export contracts per cargo ship, payment, imports and what they unlock |
| `model/auction.js` | model | daily big auction after the trawlers; small auctions for the chief's fish |
| `model/tourists.js` | model | ferry passengers (seeded, transient), what they buy, where they go (harbour shops, coast train → town → bus/train → our village), stay 2 ferries |
| `model/coastLine.js` | model | coast train kinematics on `Rail.legProfile`, duck-typed surface for the existing `Train` view (`B`, `consist()`, `iAt()`, `m`, `running`, `v`) + `blocking(k)` |
| `model/stars.js` | model | harbour ★1–3 counters |
| `view/{Harbor,Quays,Ship,Crane,Lighthouse,Gulls,AuctionScene,ExportPad,Reveal}.js` | view | buildings as `TownBuilding`s from the harbour manifest at §4.3 anchors; quays, piers, breakwater **baked** into ground tiles; layered ships (base → cargo slots → foam → anim) bobbing with `water.heightAt/slopeAt` and `addHull` contacts, V-wakes (`fx_wake_v2*`), deck passengers at `deckPoints`; crane cycle on `pickFrame`/`dropFrame` with the cargo slots; lighthouse `anims.light` + `clock.addLight`; ≤ 6 gulls (`perchPoints`, follow ferries) |
| `layout.js`, `tuning.js`, `strings.js`, `index.js` | data | §4.3 rows, water region, region rects, rail extension |

**How it opens** (graft of the player's reveal on the tech geography): at 도시 + 1 min a deep far horn
(`sfx_ship_horn_big` at 0.25, panned right) and gulls; rumours "동쪽 바다 끝에 옛 항구가 있대!"; the rail-end signpost
sparkles (E4). **동쪽 철길 잇기** site at the buffer stop (k 46): trucks bring materials along 바닷가 큰길, builders lay rail
tiles into the fog. The fog over `harbor` clears; the camera rides the new rails east for 3 s and shows a **sleepy,
snowed-in harbour**: a grey 항구역 ruin, an old auction hall with three crates, a dark lighthouse on the rocky point, two
village boats bobbing in the basin, gulls on bollards, the ferry terminal tinted as a ruin. Banner **"갈매기 항구를
찾았어요!"** / "항구를 살리면 바다 너머 사람과 물건이 와요". `bgm_harbor` + `amb_harbor` play while the chief is in the
harbour area (`sound.music('harbor')`).

**Revive steps**

| # | Step | Cost / build | What starts | Smart t |
|---|---|---|---|---|
| 0 | 동쪽 철길 잇기 | 12,000 + 80 planks + 40 ingots, 25 s | rail to k 98, region opens | 106 |
| 1 | 항구역 + town-east halt | 8,000 + 40 planks + 20 ingots, 14 s | the coast train (cycle ≈ 117 s); first harbour folk ride to our village; E5 | 110 |
| 2 | 수산물 경매장 | 6,000 + 30 planks, 12 s | small auctions every 2 game hours 08–18 (bell, auctioneer calls "자, 싱싱한 참치 열 마리!", buyers `wave`); fish on the auction pad sell at 1.5× (tuna 30) | 115 |
| 3 | 등대 불 밝히기 | 3,000 + 10 ingots, 8 s | two beams sweep the open sea at night; the keeper waves; a night ferry 21:30; E6 | 118 |
| 4 | 여객선 터미널 | 15,000 + 60 planks + 30 ingots, 18 s | ferries 06:30 / 10:30 / 14:30 / 18:30 (+ 21:30), dwell 45 s, 8–20 tourists down the gangway | 122 |
| 5 | 크레인 + 세관 | 20,000 + 40 planks + 40 ingots, 18 s | cargo ship 09:00 daily, dwell 150 s; crane cycles; export contract + imports; customs stamp | 130 |
| 6 | 조선소 | 25,000 + 60 planks + 30 ingots, 20 s | builds 원양어선 (30,000 + 80 planks + 40 ingots, 60 s on the slip with sparks, ≤ 3); out 05:00, back 15:00 with 8 tuna each (`haul` near the basin mouth, heading NE); big auction 15:30 | 140 |
| 7 | ★2 → ★3 | ★2: 20 ships + 200 exports + 150 tourists; ★3: 60 ships + 800 exports + 600 tourists | ★2: C10 항구 축제, bus 3, the tug nudges the cargo ship; ★3: sailboats and yachts, lantern string along the quay | 150 / 165 |

**Exports and imports.** A contract arrives with each cargo ship, due before the next one; goods go to the export pad
by trucks (B7), station porters or the chief; pay 2.0 × price per item plus D10. ★1 rotation: cans 60 + planks 120 ·
bread 80 + fish_cooked 60 · ingots 50 + tools 3; ★2: cans 120 + planks 200 + ingots 60 · tuna 20 + cans 80; ★3:
furniture (v8) or any two above × 1.5. Imports (no new item icons; labelled crates):

| Import | Art | Unlocks |
|---|---|---|
| 설탕 | `crate_stack` on the quay, `item_crate_produce` + text chip when carried | bakery's 2nd recipe bread 2 + sugar 1 → `item_cake` (price 18, 2.4 s); cafés sell cakes; weddings get real cakes; the cake wish; D11 |
| 천 | `item_cloth_rolls` (logistics art) | 솔방울 옷가게 (`t_cloth`) buys our cloth goods wholesale; v7 swimwear shop founding |
| 유리 | `crate_stack` / `cardboard_box_m` + chip | **house level 2**: lit windows at night, a parked car at the door after 도시, happiness +1 per house (cap 12); mission "유리창 달기" |

**People.** `dock_worker`, `sailor`, `auctioneer`, `lighthouse_keeper`, `tourist` (harbour `townfolk_presets.json`);
`npc_captain` on the ferry deck; ≈ 20 story residents homed in `sailor_lodge` and harbour rooms (TownSim kinds with day
plans, `h:<n>` pids). v6 happenings P7 갈매기의 생선구이 습격, P8 크레인 상자 흔들흔들.

**Public API** (`gs.later.harbor`): `open()`, `star()`, `nextShip(kind)`, `exports()`, `imports()`,
`touristsToday()`, `auction()`, `coastLine`. **Events** out: `harbor:ship { kind, op }`, `harbor:export { id, done }`,
`harbor:import { kind }`, `harbor:auction { coins }`, `harbor:tourists { n }`, `harbor:star { n }`; in: `day`, `hour`,
`built`, `sold`, `veh:freight`, `delivered`, `region`, `train`.

**Save slice** `harbor` v1, cap **2 KB**: `{ v, open, steps: {}, exports: [≤3], imports: { unlocked: [], stock: {} },
fleet: { trawlers: n, building: t }, auction: { day, coins }, tourists: { today, total }, stars: { ships, exports,
tourists, n } }`. Ships at sea, passengers and gulls are not saved (ships restart at the next slot).

**Data tables** (`tuning.js` → `BALANCE.v6.harbor`)

```js
harbor: {
  railExt:   { coins: 12000, item_plank: 80, item_ingot: 40, time: 25 },  // 동쪽 철길 잇기
  station:   { coins: 8000,  item_plank: 40, item_ingot: 20, time: 14 },  // 항구역 (+ 솔방울 동쪽 정거장)
  auction:   { coins: 6000,  item_plank: 30, time: 12, smallEvery: 50, smallFrom: 8, smallTo: 18, bigAt: 15.5, premium: 1.5, tunaPrice: 30 },
  lighthouse:{ coins: 3000,  item_ingot: 10, time: 8, nightFerry: 21.5 },
  terminal:  { coins: 15000, item_plank: 60, item_ingot: 30, time: 18 },
  ferry:     { at: [6.5, 10.5, 14.5, 18.5], dwell: 45, tourists: [8, 20], wantMin: 2, wantMax: 5, stayFerries: 2 },
  crane:     { coins: 20000, item_plank: 40, item_ingot: 40, time: 18 },
  cargo:     { at: 9, dwell: 150, exportMult: 2.0, deadlineShips: 1 },
  imports:   { sugar: { crates: 6, cake: { item_bread: 2, sugar: 1, time: 2.4, price: 18 } }, cloth: { crates: 8 }, glass: { crates: 10, houseLv2: true, happyCap: 12 } },
  shipyard:  { coins: 25000, item_plank: 60, item_ingot: 30, time: 20 },
  trawler:   { coins: 30000, item_plank: 80, item_ingot: 40, build: 60, out: 5, back: 15, catch: 8, max: 3 },
  stars:     { 2: { ships: 20, exports: 200, tourists: 150 }, 3: { ships: 60, exports: 800, tourists: 600 } },
  coast:     { dwell: 10, cars: 3 },
  gulls: 6,
}
```

**Budgets.** ≤ 0.10 ms per tick; ≤ 6 ship sprites; ≤ 400 static display objects (quays, piers, breakwater baked);
harbour own pages ≤ 120 MiB (harbour ≈ 42 + ships SE/NW only ≈ 30, ship pages evicted when out of view); view ≤ 300 MiB
target; `water.heightAt/slopeAt` once per ship per frame.

**Tests** (`harbor.test.mjs`): berths never double-booked over 30 game days; the coast train never covers a crossing at
a stop and never blocks line `main`; every export contract completable from producible items with ≥ 1 game day slack;
tourists conserved (arrive = leave); auction pays 1.5× exactly; stars counters; imports unlock once.

**Lab** (`harbor_lab`): quay row and second row; the ferry berthing with waving passengers and gulls; crane cycle with
the cargo ship; trawler launch from the shipyard and the haul; lighthouse at night with the coast train's lamp; basin
water (`harbor` palette) and the breakwater spray; the sleepy-harbour reveal pan.

**Integration hooks:** P3 (ships, harbor, audio4 sprite), P4 (area `harbor`, class `ship`), P6 (kinds), P7 (south
sea), P14 (coast line in the rails list, `line` on `'v4:train'`), P15 (area music), P16 (areas, regions), P19 (world
size, regions, rail to k 98, crossings, border trees), P23 (water regions), P24 (ship pages SE/NW).

---

### 6.5 beach_runtime — `src/beach/**` (v7)

**Purpose.** 햇살 해변 on the warm coast east of the lighthouse: snow melting into white sand, turquoise water with
caustics, a lively beach crowd (swimming, sunbathing, sandcastles, volleyball, boats), the lifeguard, beach shops
founded by ferry tourists, the resort hotel with its pool, the aquarium, night lights and summer events — and the
designer's own idea, the 북극곰 수영 대회 back at our snowy coast.

**Files**

| File | Layer | Purpose |
|---|---|---|
| `model/activities.js` | model | slots from the manifests (`lyingPoints/lyingFeetDirs`, `seatPoints/seatDirs`, `swimPoints`, `playPoints/ballDirs`, `workPoints/workDirs`), scripts (swim, float, sunbathe, dig, volleyball, splash, surf, ice cream, kayak/swan rides), capacity per slot, busy 10–17 h |
| `model/resort.js` | model | hotel level 1–3 (rooms 12/20/32), stays (2 game days), spend per day, shops buying village goods wholesale |
| `model/crowd.js` | model | ≤ 60 present, ≤ 30 materialised, seeded per day; tourists from ferries and the coast train; townsfolk day-trippers |
| `model/events.js` | model | sandcastle contest, fireworks, polar swim, beach week |
| `view/{Beach,Sand,Beachgoers,Boats,Lifeguard,Night,Reveal,PolarSwim}.js` | view | sand baked through a bake hook (`ground_sand`, wet band, `sandKit`/`wetKit`, decals); props and beach buildings with overlays at d+1, staff at `staffDepths`; night glows (`<key>_glow` ADD, `clock.addLight` at `lightPoints`); beachgoers as DollSprites on the merged townfolk (swimmers at the water point, `fx_swim_ripple` one depth below, `water.ripple(x, y, 0.55)` ≈ 1/s); boats as water-plane characters |
| `layout.js`, `tuning.js`, `strings.js`, `index.js` | data | §4.4 rows, slot tables, tropical + pool water regions |

**How it opens.** Harbour ★2 + v7: ferry tourists ask "따뜻한 바다는 어디예요?"; the harbour master shows an old map:
"등대 너머 동쪽엔 따뜻한 해류가 흘러서 눈이 안 쌓인대요". **해변 가는 길** site (`blvd_b`, 5,000 + 30 planks, 15 s). E7:
walking east past the lighthouse point the snow thins (`ground_sand_snow_edge_*`), pines turn into `beach_pine`, then
swaying palms; snowfall stops at the beach band's edge; `bgm_harbor` crossfades to `bgm_beach` over 6 s; the fog over
`beach` clears and the camera pans along the shore (tropical palette, caustics, foam lace rolling up the sand and the
darker wet band, crabs). Banner **"햇살 해변을 찾았어요!"** / "따뜻한 해류 덕분에 눈이 녹은 바닷가예요". E8 beach clean-up
(12 bits of seaweed and driftwood), then the `beach_gate` ("햇살 해변") pops up.

**Building the resort**

| # | Step | Cost / build | What starts | Smart t |
|---|---|---|---|---|
| 1 | 인명구조대 (`lifeguard_station` + `lifeguard_tower`) | 6,000 + 30 planks + 6 ingots, 12 s | swim buoy lines; **"해수욕장 개장!"**; tourists by ferry → coast train / bus 4, or on foot | 172 |
| 2 | 해변 주문판 (v4 founding flow, second board, P32) | free | 7 founding cards; founders are ferry tourists who move in (story `addResident`); 25 s builds; ribbons | 174 |
| 3 | beach shops, one card at a time (≈ 3 min each) | goods at 70 % wholesale + bonus | see below | 176–200 |
| 4 | 리조트 호텔 | 40,000 + 120 planks + 60 ingots + 20 glass crates, 30 s | tourists stay 2 game days and spend daily; doorman, bellhop, receptionist, housekeeper at `staffPoints`; guests wave from balconies at night | 190 |
| 5 | 호텔 ★2: 수영장 (`hotel_pool` + Water `pool` region from `waterPoly`) | 20,000 + 40 ingots, 18 s | pool swimmers, deck sunbathers, `sfx_pool_splash` | 205 |
| 6 | 작은 수족관 | 18,000 + 30 planks + 20 ingots, 14 s | rare-fish donations (E10), kids at the glass | 210 |
| 7 | hotel ★3 + beach ★3 | rooms 12 → 20 → 32 (15,000 and 25,000) | C12 fireworks; the 햇살 해변 축제 week | 215 |

| Shop | Card ("…보내 주시면 …을 열게요") | Rent / min | Sells |
|---|---|---|---|
| 파도 카페 `beach_cafe` | 빵 40 + 케이크 10 | 30 | bread, cake |
| 구름 아이스크림 `icecream_shop` | 설탕 상자 6 + 빵 20 | 35 | ice cream (no item art: buyers leave with `emote_star`, coins pop) |
| 조개구이집 `seafood_bbq` | 생선구이 40 + 훈제고기 20 | 35 | fish, meat (grill smoke at `fxPoints.smoke`) |
| 바닷가 편의점 `convenience_store` | 통조림 40 + 빵 30 | 40 | cans, bread |
| 기념품 가게 `souvenir_shop` | 판자 40 + 주괴 15 | 30 | souvenirs |
| 수영복 가게 `swimwear_shop` | 천 상자 8 | 30 | swimwear for our residents (C13) |
| 서핑 가게 `surf_shop` | 판자 60 | 30 | surfers appear (`surf`, `surfboard_rack`) |

After hotel ★2 three free extras appear: `beach_bar` (night glow), `pension` (family tourists), `beach_arcade`.

**Beach life** (live caps): swimmers ≤ 12 inside the buoy lines (`swim` waterline cut + ripple); sunbathers ≤ 16 on
towels and loungers under fluttering parasols; kids `dig` at `sandcastle_build_0..3` (a stage every 20 s), `splash_play`,
`float`; volleyball 4 players (`ball_throw`/`ball_catch`, `impactFrame`, `sfx_beachball_bounce`); lifeguard on the tower
whistles (≤ 1 per 40 s) when someone swims past the buoys; ≤ 4 boats (`swan_pedal_boat`, `kayak_crew`, `banana_boat_crew`
towed by a `yacht`); ice-cream cart with bell and a queue of kids; ≤ 6 crabs, kites, gulls; `amb_beach`,
`sfx_wave_wash*`, `sfx_wave_crash_*` on the rocks, `sfx_beach_kids_*`, `sfx_sand_step_*` for the chief on sand; night
string lights, glows, couples on the boardwalk at sunset. v7 happenings: P9 꽃게에 물린 발가락, P10 파도에 무너진 모래성,
P11 날아간 비치볼 (the lifeguard paddles a `rescue_board`), P12 바람에 날아간 파라솔 (stand in its path, +2 fame).
**C13 북극곰 수영 대회** at our village coast: residents in swimsuits run into the winter sea (`swim` + `emote_cold`),
splash out shivering, the crowd cheers.

**Public API** (`gs.later.beach`): `open()`, `star()`, `hotel() → { level, rooms, occupancy }`, `crowd() → { present,
swimmers }`, `event(kind) → Promise`. **Events** out: `beach:arrive|leave { n }`, `beach:checkin { n }`, `beach:shop
{ id, op }`, `beach:event { kind, op }`, `beach:star { n }`; in: `day`, `hour`, `harbor:tourists`, `train`, `sold`,
`built`, `cardDone`, `shopOpen`, `region`.

**Save slice** `beach` v1, cap **2 KB**: `{ v, open, steps: {}, hotel: { level, guests: [[n, leaveDay]] ≤ 8 },
facilities: {}, events: { last: {} }, stars: { n } }` (beach shops are Growth shops and save there).

**Data tables** (`tuning.js` → `BALANCE.v7.beach`)

```js
beach: {
  path:      { coins: 5000, item_plank: 30, time: 15 },
  cleanup:   { pieces: 12 },
  lifeguard: { coins: 6000, item_plank: 30, item_ingot: 6, time: 12, whistleGap: 40 },
  founding:  { order: ['beach_cafe', 'icecream_shop', 'seafood_bbq', 'convenience_store', 'souvenir_shop', 'swimwear_shop', 'surf_shop'],
               rent: { beach_cafe: 30, icecream_shop: 35, seafood_bbq: 35, convenience_store: 40, souvenir_shop: 30, swimwear_shop: 30, surf_shop: 30 } },
  hotel:     { coins: 40000, item_plank: 120, item_ingot: 60, glassCrates: 20, time: 30, rooms: [12, 20, 32], stayDays: 2, spendPerDay: [20, 45], up: [15000, 25000] },
  pool:      { coins: 20000, item_ingot: 40, time: 18 },
  aquarium:  { coins: 18000, item_plank: 30, item_ingot: 20, time: 14, rareChance: 0.04 },
  live:      { present: 60, rigs: 30, swimmers: 12, sunbathers: 16, boats: 4, crabs: 6, busyFrom: 10, busyTo: 17 },
  stars:     { 2: { shops: 5, hotel: 1 }, 3: { shops: 7, pool: 1, aquarium: 1 } },
}
```

**Budgets.** ≤ 0.15 ms per tick (activity scripts at 4 Hz); view ≤ 2.1 ms (2.3 ms tolerated at peak crowd, measured in
the lab first); ≤ 1700 objects; beach own pages ≤ 120 MiB: `beach` 53.5 (nature split by co-visibility), `beach_bld`
32.3 eager (+6.7 glow at dusk), beachfolk loco 17.3 + social 22.2 + beach 8.4 + water 8.3 + heads 7.7 with the half tier
at zoom < 0.85, water page only with swimmers in view; view ≤ 320 MiB target.

**Tests** (`beach.test.mjs`): slot capacity never exceeded; every activity's dirs have frames (reads the manifests);
hotel occupancy and stays bounded; crowd conserved; founding board order; events never overlap a ceremony slot.

**Lab** (`beach_lab`): sand + boardwalk + hotel + pool; 40 beachgoers (swim, sunbathe, dig, volleyball); boats; the
lifeguard whistle; ice-cream queue; dusk glows and night; the snow-to-sand reveal; polar swim at a snowbank coast.

**Integration hooks:** P3 (beach, beach_bld, beachfolk, audio5 rest), P4 (area `beach`, class `dollBeach`), P5
(beachfolk merge + draw rules), P6 (kinds), P7, P14 (해변역), P15, P16, P19 (width/height, `beach` region), P23 (tropical
+ pool regions), P24 (beachfolk page classes), P32 (second founding board).

---

### 6.6 logistics_runtime — `src/city/logistics/**` (v8)

**Purpose.** The big 물류 센터 whose roof and front wall fade when tapped (or hovered on PC) to show tall racks whose
stock height is the real stock, pickers, a packer at the conveyor, a forklift on its loop and the settlement desk; vans
and trucks at the docks; shop owners settling up with a stamp; and the furniture/appliance chains (2nd → 3rd industry)
that furnish homes.

**Files**

| File | Layer | Purpose |
|---|---|---|
| `model/stock.js` | model | stock by category (materials, food, goods, furniture, tools, appliances) mapped to `rackSlots` fill levels (`cells`, `itemFit`, `stockScale`) |
| `model/orders.js` | model | inbound (freight trucks from the yard/station, export overflow), outbound (Growth shops' restock orders, story `shop` pick-ups), settlement (wholesale + 15 % into a 물류 금고 pad, auto-collected from rank 2 like rent) |
| `model/chains.js` | model | furniture workshop (planks 3 → 1 furniture) and appliance factory (ingots 3 → 1 appliance) as Civic M-plot work buildings; house level 3 "살림살이" |
| `view/{Centre,Cutaway,Racks,Forklift,Conveyor,Docks,Settlement,Producers}.js` | view | layers `_floor`, `_interior` (+ racks, front), `_back`, `_shell` (+ `_shell_cut`), `fadeMs`; dock doors per bay; forklift on `forkliftPath` (`lift`, `_loaded`), conveyor 8 f, staff at `staffPoints`, customers at `customerPoints`, nameplate ko/en; inside layers skipped while the shell is opaque |
| `layout.js`, `tuning.js`, `strings.js`, `index.js` | data | §4.5 rows, streets `ave_c`, `lgx_st` |

**How it opens.** After beach ★2: the bank manager's letter (`item_letter` mission) "가게들이 물건을 더 빨리 받고
싶어해요. 큰 물류 센터를 지으면 어떨까요?". Site at `c_logistics` (50,000 + 150 planks + 80 ingots, 30 s). Tutorial
"건물을 눌러 보세요!": a tap inside `revealPoly` fades the shell; shop owners arrive by `delivery_van` (3 colours) or bus,
queue, settle (`sfx_stamp`, `sfx_coin_count`), drive off loaded.

| # | Step | Cost / build | Effect | Smart t |
|---|---|---|---|---|
| 1 | 물류 센터 | above | trucks and vans route via the centre; deliveries/day counter (rank 4 bar) | 222 |
| 2 | 가구 공방 (`furniture_workshop`, M plot) | 9,000 + 30 planks, 10 s | planks 3 → chair 25 / table 40 / sofa 70 / bed 80 / wardrobe 90, 6 s | 225 |
| 3 | 가전 공장 (`appliance_factory`, M plot) | 12,000 + 30 ingots, 10 s | ingots 3 → radio 50 / stove 90 / washer 110 / fridge 120 / TV 140, 8 s | 228 |
| 4 | House level 3 "살림살이" | furniture 3 + appliance 1 per house (B12) | happiness +2 per house (cap 16); diaries "새 소파가 왔다!" | 230+ |

**Public API** (`gs.later.logistics`): `stock(cat)`, `order(shopId, items) → id`, `settle(id)`, `deliveriesToday()`,
`reveal(on)`. **Events** out: `lgx:stock`, `lgx:settle { coins, shop }`, `lgx:dispatch { van, to }`, `lgx:produced
{ item }`; in: `produced`, `crafted`, `veh:freight`, `story:shop`, `shopOpen`, `day`, `tap` (reveal).

**Save slice** `logistics` v1, cap **2 KB**: `{ v, open, stock: { cat: n }, orders: [≤12], cash, chains: { furniture,
appliance }, houseLv3: [houseId] ≤ 32, deliveries: [10 game days] }`.

**Data tables** (`tuning.js` → `BALANCE.v8.logistics`)

```js
logistics: { coins: 50000, item_plank: 150, item_ingot: 80, time: 30, settleBonus: 0.15, vans: 3, fadeMs: 400,
             furniture: { coins: 9000, item_plank: 30, time: 10, recipe: { item_plank: 3 }, make: 6 },
             appliance: { coins: 12000, item_ingot: 30, time: 10, recipe: { item_ingot: 3 }, make: 8 },
             prices: { item_chair: 25, item_table: 40, item_sofa: 70, item_bed: 80, item_wardrobe: 90,
                       item_radio: 50, item_stove_iron: 90, item_washer: 110, item_fridge: 120, item_tv_retro: 140 },
             houseLv3: { furniture: 3, appliance: 1, happy: 2, happyCap: 16 } },
```

**Budgets.** ≤ 0.08 ms per tick; textures: shell + apron always near (≈ 10 MiB), inside layers (≈ 23 MiB) only while
revealed, vans/forklifts by view (`vehicle` class); staff from cityfolk `warehouse_worker` / `forklift_driver` when the
`work` group is resident, else townfolk stand-ins.

**Tests** (`logistics.test.mjs`): stock = in − out per category; settlement sums (wholesale + 15 %); racks never above
capacity; every Growth shop's restock order served or queued; chains convert exactly; house level 3 only with the items
delivered.

**Lab** (`logistics_lab`): reveal tween in and out; stocked racks at 10 / 50 / 100 %; forklift loop with beeps; vans at
the docks; a settlement queue with the stamp; the furniture workshop working.

**Integration hooks:** P3 (logistics, civic, cityfolk work group, audio6), P4 (area `newtown`), P16, P19 (newtown
region, streets), P27 (Civic catalog: furniture workshop, appliance factory on M plots), P29, P32 (Growth restock orders
routed through the centre).

---

### 6.7 incidents_runtime — `src/city/incidents/**` (v8)

**Purpose.** Stage the story engine's incidents gently and comically — petty theft and chases, queue-jumping, snowball
windows, cartoon scuffles, fires with firefighters, ruins, demolition and rebuilding (one level better), moving trucks
for move-ins and move-outs, the wanted board — all behind the **"사건·사고: 켜기 / 끄기"** switch, and nobody is ever
hurt.

**Files**

| File | Layer | Purpose |
|---|---|---|
| `model/director.js` | model | maps story `incident`/`build`/`move` events to stage scripts; requests the StageDirector `incident` slot; acks staged phases (`ackWait`); one staged incident at a time |
| `model/buildings.js` | model | building visual states `[bldId, state, t]`: ok, smoking, burning, ruin, demolition, site, rebuilt (+1 level); `ruinFor` table from the civic manifest |
| `model/safety.js` | model | the 안심 bar (rolling 10 game days); hydrants and fire-station level lower `fireRate` (E4 `setRates`) |
| `view/{FireScene,ChaseScene,ScuffleScene,QueueScene,WindowScene,DemolitionScene,RebuildScene,MovingScene,WantedBoard,PoliceStation}.js` | view | below |
| `layout.js`, `tuning.js`, `strings.js`, `index.js` | data | police station, wanted board at the plaza beside the mission board, hydrant spots |

**Incidents** (engine defaults × the game's rates; ≈ 220 people)

| Incident | Engine /day | Game /day | Staging (art, anim, audio) | Rules |
|---|---|---|---|---|
| 좀도둑 | 0.6 | 0.24 | act → **chase** (`bgm_chase`, `run`/`flee`, officer's whistle) → arrest (`arrested_walk`, `sfx_cuffs_click`) → cell (door anim) → apology and release next morning; not caught → wanted poster (`ui_wanted_poster`, portrait rendered once from the doll's head layers into a 64 px canvas) → tip → arrest | culprits teens or adults, never elders, police, firefighters, bank staff or named villagers |
| 새치기 | 0.7 | 0.28 | `argue` in a queue → apology (`emote_sweat`) | — |
| 눈덩이 유리창 | 0.4 | 0.16 | `fx_snowball` + `sfx_collapse_soft` at 0.3 (no glass sfx) → next-day apology with a parent | kids only |
| 티격태격 | 0.3 | 0.12 | `fx_fight_cloud` (`fight` inside; simple mode if a side lacks `fight`) → whistle → separate → reconcile next day | same age band; never elders |
| 화재 | 0.18 | 0.05 (−5 % per hydrant, ≤ −40 %; fire-station levels −10 % each) | smoke (`fx_smoke_column`) → a resident pulls the alarm (`fire_alarm_post`, `sfx_fire_alarm_bell`) → **everyone walks out and watches** (`shocked`/`point`/`phone`) → fire truck from `t_fire` (`sfx_siren_fire`) → hose (`spray_hose`, `nozzlePoint` → `fx_hose_stream`, `fx_water_mist`, `fx_steam_puff`) → out, applause (`sfx_crowd_cheer_small`); late → ruin (`ruin_*`, scorch decal, `insurance_sign`) → excavator `dig` + dump truck `tip` (civic `demolitionLayout`) → site → rebuilt one level better | ≥ 4 game days apart; the first fire only after the fire drill (C14); a happy city has fewer; nobody hurt |
| 고양이 구조 | engine | 0.1 | firefighters bring a ladder (`point`), the cat comes down | +3 fame if watched |

City-wide ≈ 0.95 visible-or-reported incidents per game day, fires ≈ 1 per 20 game days. **Moving** (story `move`):
in — `moving_truck` (`unload`), movers (`carry_box`) with `cardboard_box_*` to the door, a `welcome_mat`, card
"○○네가 이사 왔어요!" (A21, B12); out — `for_sale_sign`, the family waves at the bus stop, `sold_sign`. Our population
moves both ways; the rank bar never drops below the last rank's requirement. **Police**: `police_station` (cutaway with
a cosy cell) at `c_police` (15,000 + 60 planks + 30 ingots, 16 s), 2 officers patrol by car and on foot. **Fire**: the
town's `t_fire` gains levels (기획서 "소방서 레벨"): level 2 12,000 + 40 planks + 30 ingots; level 3 20,000 + 60 + 40;
hydrants 400 each. **Switch off**: `toggles.incidents = false` cancels scheduled incidents, the director idles, the
안심 bar reads 100 %; moving trucks still run (moves are not incidents).

**Public API** (`gs.later.incidents`): `active()`, `wanted()`, `buildingState(bldId)`, `safety() → %`, `toggle(on)`.
**Events** out: `inc:stage { id, kind }`, `inc:phase { id, phase }`, `inc:end { id, outcome }`, `inc:wanted { op }`,
`inc:fire { bld, state }`, `inc:move { op, household }`; in: `story:incident`, `story:build`, `story:move`,
`veh:arrive` (truck parked → ack), `bank:claim`, `day`, `built` (hydrants).

**Save slice** `incidents` v1, cap **2 KB**: `{ v, on, buildings: [[id, state, t]] ≤ 16, wanted: [≤3], hydrants: [[x, y]]
≤ 24, fireLevel, safety: [10 game days], drill: bool }`. Staged scenes are not saved; on load they resolve off stage.

**Data tables** (`tuning.js` → `BALANCE.v8.incidents`)

```js
incidents: { on: true, incidentRate: 0.4, fireRate: 0.05, fireGapDays: 4,
             hydrant: { coins: 400, fireCut: 0.05, cutMax: 0.4 },
             fireStation: { 2: { coins: 12000, item_plank: 40, item_ingot: 30, time: 14, fireCut: 0.1 },
                            3: { coins: 20000, item_plank: 60, item_ingot: 40, time: 18, fireCut: 0.1 } },
             police: { coins: 15000, item_plank: 60, item_ingot: 30, time: 16, officers: 2 },
             stageRange: 1200, transientMiB: 70, transientMaxS: 90, releaseAfter: 15 },
rank4:     { people: 220, deliveries: 150, safety: 90, fame: 900, coins: 120000 },
```

**Budgets.** ≤ 0.10 ms per tick; one staged incident; textures: cityfolk incident groups (`rush` 30 MiB, `scuffle` 8.5,
`crowd` 11.7, fire set ≈ 19 + fx) acquired at `inc:stage` and released 15 s after `inc:end`; transient ≤ +70 MiB for
≤ 90 s and never over 455 MiB.

**Tests** (`incidents.test.mjs`): one staged incident at a time; every staged phase acked or timed out; ruin → rebuilt
+1 level with insurance; toggle off cancels and the safety bar reads 100 %; culprit rules; fire gap and hydrant cut;
moving in/out keeps households valid.

**Lab** (`incidents_lab`): fire → spray → out, and fire → ruin → demolition → rebuild sequence; chase + arrest +
apology; scuffle cloud; queue argument; wanted board with rendered portraits; moving truck unloading; transient MiB
measured.

**Integration hooks:** P3 (civic, fx_city fire set, cityfolk incident groups, audio6 rest), P4 (`incident:*` classes),
P5 (cityfolk merge + draw rules), P6 (leases), P12 (settings row 사건·사고), P16, P19, P22 (voices: firefighter/police
`adult_m`, burglar `squeaky`), P24 (cityfolk groups).

---

## 7. Mission templates (98, binding; `src/missions/data/catalog.js`)

Notation: **pay** = minutes of current income (never below `payFloor` × era); **fame** fixed; **Unlock**: `읍` = v5
start, `도시` = rank 3, `v6/v7/v8` = district or system open, `b:key` = built, `life` = needs the story event,
`toggle` = needs a setting on, `paper` = the newspaper has started; **Repeat** = cooldown in game minutes ("once" =
one-off). Crafted pickups from existing art: `item_bouquet` (stand 3 s at a 꽃밭, ≤ 6 per bed per game day, or buy for
25 at the 솔방울 꽃집), `item_cake` (the 빵집 아주머니 bakes one from 12 bread in 20 s; from v6 sugar makes cakes a
product), `item_gift_box` (any 3 goods on the 잡화점's 선물 포장 pad), `item_letter` (handed over by the giver). People
are named by the story engine (`{name}`).

### A. 부탁 (requests) — 22

| # | id | 한국어 | English | Need / how | Unlock | pay | fame | Repeat |
|---|---|---|---|---|---|---|---|---|
| A1 | `req_bread_grandma` | 할머니께 빵 5개 갖다 드리기 | Bring Grandma 5 loaves | bread 5 → `npc_grandma` | 읍 | 0.3 | 5 | 20 |
| A2 | `req_fish_cat` | 고양이 나비에게 생선구이 3개 | Grilled fish for Nabi the cat | fish_cooked 3 → `pet_cat` (purrs, `emote_heart`) | 읍 | 0.2 | 4 | 25 |
| A3 | `req_snowman_kids` | 아이들 눈사람 만들기 도와주기 | Help the kids build a snowman | stand at the snowman spot 20 s; it grows a stage at a time | 읍 | 0.2 | 6 | 30 |
| A4 | `req_letter` | {name}에게 편지 전해 주기 | Deliver a letter to {name} | `item_letter` giver → friend; affinity rises (`report('chief')`) | 읍 | 0.3 | 6 | 15 |
| A5 | `req_bouquet_secret` | 몰래 꽃다발 전해 주기 | A secret bouquet | `item_bouquet` → the giver's crush; romance rises | 읍, life | 0.3 | 8 | 30 |
| A6 | `req_firewood_elder` | 할아버지 난로에 장작 10개 | Firewood for Grandpa's stove | log 10 → an elder's door | 읍 | 0.3 | 5 | 20 |
| A7 | `req_tools_newcomer` | 새 이웃에게 도구 선물하기 | A tool for the new neighbour | 1 of axe/pickaxe/sickle/rod → a settler's door | 읍 | 0.4 | 6 | 30 |
| A8 | `req_housewarming` | 집들이 선물 가져가기 | Housewarming gift | `item_gift_box` → a new house | 읍 | 0.4 | 8 | per new house |
| A9 | `req_lost_mitten` | 잃어버린 벙어리장갑 찾기 | Find the lost mitten | a sparkle in the snow within 600 px (`fx_spark` + `decal_footprints`) → the kid | 읍 | 0.2 | 5 | 30 |
| A10 | `req_bread_skaters` | 스케이트장 손님에게 빵 8개 | Bread for the skaters | bread 8 → the rink | b:deco_rink | 0.3 | 5 | 30 |
| A11 | `req_planks_carpenter` | 목수 아저씨에게 판자 30장 | 30 planks for the carpenter | plank 30 → 목공소 | 읍 | 0.6 | 6 | 20 |
| A12 | `req_birthday_meat` | {name} 생일 잔치에 훈제고기 10개 | Smoked meat for {name}'s birthday | meat_cooked 10 → the family's door (joins C9) | life | 0.5 | 10 | per birthday |
| A13 | `req_horse_wheat` | 말들에게 밀 한 줌 (6개) | Wheat for the horses | wheat 6 → the stable depot; the horses nuzzle the chief | b:depot | 0.2 | 5 | 30 |
| A14 | `req_penguin_fish` | 뽀삐가 생선이 먹고 싶대요 | Ppoppi wants a fish | fish_raw 3 → `pet_penguin` (flaps, `emote_fish`) | 읍 | 0.2 | 4 | 25 |
| A15 | `req_school_lunch` | 학교 점심 빵 20개 (12시 전) | School lunch before noon | bread 20 → our school door before 12:00 | b:school | 0.5 | 8 | 1 game day |
| A16 | `req_clinic_fish` | 병원 환자분들께 생선구이 15개 | Fish for the clinic | fish_cooked 15 → the clinic | b:clinic | 0.4 | 6 | 30 |
| A17 | `req_sailor_cans` | 선원들에게 통조림 12개 | Cans for the sailors | can 12 → `sailor_lodge` | v6 | 0.5 | 6 | 30 |
| A18 | `req_keeper_bread` | 등대지기에게 따뜻한 빵 6개 (저녁) | Warm bread for the lighthouse keeper | bread 6 → the lighthouse at 17–20 h | v6 | 0.3 | 8 | 1 game day |
| A19 | `req_tourist_photo` | 관광객 기념사진 같이 찍기 | Pose for a tourist photo | stand 5 s at the beach gate with a tourist (flash `fx_glow`) | v7 | 0.2 | 6 | 20 |
| A20 | `req_lost_ring` | 잃어버린 튜브 찾아 주기 | Find the lost swim ring | a `swim_ring_*` drifting at the shore → the crying kid (`emote_tear` → `emote_star`) | v7 | 0.3 | 8 | 30 |
| A21 | `req_moving_boxes` | 이삿짐 상자 3개 날라 주기 | Help carry 3 moving boxes | `cardboard_box_*` from the `moving_truck` to the door | v8 | 0.4 | 8 | per move-in |
| A22 | `req_owner_settle` | 가게 주인 정산 심부름 | Settle a shop's bill | walk the receipt to the logistics office pad (`sfx_stamp`) | v8 | 0.3 | 5 | 20 |

### B. 배달 운전 (driving) — 12

Par = route length ÷ (0.6 × vmax) + 8 s per stop. ★★★ ≤ par, ★★ ≤ 1.3 × par, ★ otherwise; a run never fails.

| # | id | 한국어 | English | Route | Unlock | pay | fame ★/★★/★★★ | Repeat |
|---|---|---|---|---|---|---|---|---|
| B1 | `drv_sled_mail` | 개썰매 편지 배달 | Dog-sled mail run | 4 mailboxes (village doors + district), par ≈ 70 s | b:yard | 0.8 | 8/12/18 | 15 |
| B2 | `drv_sled_herbs` | 약초꾼 약초 배달 | Herbs for the clinic | 서쪽 숲마을 → clinic (ours or the town's), par ≈ 60 s | 읍 | 0.6 | 8/12/18 | 20 |
| B3 | `drv_first_truck` | 첫 운전: 카페에 빵 배달 | First drive: bread to the café | yard → 역앞 카페, generous par (tutorial) | 도시 | 0.5 | 15 | once |
| B4 | `drv_shop_round` | 가게 한 바퀴 배달 | Shop round | 3–5 founded shops; owners run out, items fly from the bed, "감사합니다!" | 도시 | 1.2 | 10/15/22 | 10 |
| B5 | `drv_lunch_rush` | 점심 러시: 식당 두 곳에 생선구이 20 | Lunch rush | 큰 식당 + 솔방울 식당 between 11:30 and 12:40 | 도시 | 1.2 | 10/15/22 | 1 game day |
| B6 | `drv_wedding_cake` | 웨딩 케이크 조심조심 배달 | Wedding-cake delivery | bakery → hall before 10:30; speed capped 0.7×, the cake wobbles ("천천히!"), no damage | 도시, life | 0.8 | 15/20/28 | per wedding |
| B7 | `drv_export_load` | 수출 화물선에 짐 싣기 | Load the export ship | 3 trips cannery/warehouse → export pad before the ship leaves | v6 | 2.0 | 15/20/30 | per cargo ship |
| B8 | `drv_auction_fresh` | 경매장에 싱싱한 생선 배달 | Fresh fish to the auction | fish 30 within 1 game hour of a trawler's return | v6 | 1.2 | 10/14/20 | per trawler trip |
| B9 | `drv_icecream_supply` | 해변 아이스크림 수레 보급 | Restock the ice-cream cart | sugar crate + bread 20 → `icecream_cart` | v7 | 1.0 | 10/14/20 | 15 |
| B10 | `drv_hotel_luggage` | 호텔 손님 짐 배달 | Hotel luggage run | ferry terminal → `resort_hotel` door (bellhop waves) | v7 | 1.0 | 10/14/20 | per ferry |
| B11 | `drv_logistics_round` | 물류 센터 배송 | Logistics run | load at a dock bay (forklift loads the bed), 4 shop stops, stamp | v8 | 1.5 | 12/18/25 | 10 |
| B12 | `drv_furniture_home` | 새 집에 가구 배달 | Furniture for a new home | sofa + bed + fridge → a moving-in family | v8 | 1.2 | 12/18/25 | per move-in |

### C. 행사 (events) — 16

| # | id | 한국어 | English | Need / how | Unlock | pay | fame | Repeat |
|---|---|---|---|---|---|---|---|---|
| C1 | `evt_wedding_prep` | 결혼식 준비: 잔치 음식 · 꽃 · 케이크 | Get the wedding ready | bread 20 + fish_cooked 20 + meat_cooked 10 on the 잔치 상 pad, 6 bouquets, 1 cake, before 10:30 | 읍, life | 2.0 | 30 | per wedding |
| C2 | `evt_wedding_speech` | 촌장님 축사 | The chief's speech | stand on the officiant pad when the couple reaches the arch | life | — | 10 | per wedding |
| C3 | `evt_baby_welcome` | 아기 탄생 축하 · 이름 지어 주기 | Welcome and name the baby | a gift box to the family + pick 1 of 3 names | life | 0.5 | 15 | per baby |
| C4 | `evt_school_day` | 첫 등교 함께 가기 | Walk a child to school | child (and parent) follow the chief to the school gate before 08:00 | life | 0.3 | 15 | per child |
| C5 | `evt_welcome_party` | 새 이웃 환영회 | Welcome party | ≥ 6 settlers today: picnic-table pad + bread 15 at the plaza by 18:00; the bard plays | 읍 | 1.0 | 20 | 1 game day |
| C6 | `evt_snow_festival` | 눈꽃 축제 준비 | Snow festival | 3 snowman statues (free decor), bread 40, fish_cooked 40; lanterns and music at night | fame 400 | 3.0 | 40 | 7 game days |
| C7a | `evt_elder_garden` | 어르신들의 정원 만들기 | A quiet garden for the elders | build 기억의 정원 (row D) | an elder turns 80, or 읍 + 40 min | 0.5 | 15 | once |
| C7 | `evt_elder_wish` | {name} 할머니의 소원 (3가지) | Grandma {name}'s three wishes | escort by bus or train to the wished place | life, age ≥ 82 | 0.3 each | 15 each | per elder |
| C8 | `evt_farewell` | 함께 배웅하기 | Saying goodbye together | optional: lay a white bouquet at the new stone | life, toggle | — | 10 | per farewell |
| C9 | `evt_birthday` | {name}의 생일 잔치 | {name}'s birthday party | a cake to the family; kids sing (`emote_music`) | life | 0.4 | 10 | ≤ 1 per game day |
| C10 | `evt_harbour_festival` | 항구 축제 | Harbour festival | fish_cooked 60 + can 30 to the harbour market; all ships horn at 20:00, the lighthouse beams | v6 ★2 | 4.0 | 50 | 7 game days |
| C11 | `evt_sandcastle_contest` | 모래성 대회 | Sandcastle contest | 6 kids build (`sandcastle_build_0..3`); the chief picks the winner | v7 | 1.0 | 20 | 5 game days |
| C12 | `evt_fireworks` | 여름 불꽃놀이 | Summer fireworks | hotel ★2 + 2 min of income; 21:00 bursts over the warm sea (`fx_spark`/`fx_star`/`fx_glow`, ADD) | v7 ★2 | — | 40 | 7 game days |
| C13 | `evt_polar_swim` | 북극곰 수영 대회 | Polar-bear swim | at our snowy coast: swimsuits, a run into the sea, shivering cheers; bread 20 after | v7 (swimwear shop open) | 1.0 | 30 | 10 game days |
| C14 | `evt_fire_drill` | 소방 훈련 | Fire drill | the fire station's level-2 morning: practice smoke + hose at a hydrant | v8 | 0.5 | 20 | once |
| C15 | `evt_first_paper` | 솔방울 신문 창간 인터뷰 | The paper's first interview | stand by the reporter at the plaza 5 s; tomorrow's front page quotes the chief | paper | 0.5 | 15 | once |

### D. 생산 목표 (production goals) — 14

| # | id | 한국어 | English | Need | Unlock | pay | fame | Repeat |
|---|---|---|---|---|---|---|---|---|
| D1 | `goal_cans_today` | 오늘 통조림 30개 만들기 | Make 30 cans today | 30 produced within the game day | 읍 | 1.0 | 10 | 1 game day |
| D2 | `goal_planks_trade` | 판자 50장 교역소에 납품 | 50 planks to the trade post | 50 sold at the trade post | 읍 | 0.8 | 8 | 10 |
| D3 | `goal_bread_town` | 이웃에게 빵 60개 팔기 | Sell 60 loaves to the neighbours | visitors + founded shops | 읍 | 1.0 | 10 | 10 |
| D4 | `goal_combo_meals` | 큰 식당 정식 20그릇 | Serve 20 set meals | restaurant combos | b:big_restaurant | 1.2 | 12 | 15 |
| D5 | `goal_ingots` | 주괴 40개 | 40 ingots | produced | 읍 | 0.8 | 8 | 10 |
| D6 | `goal_meat` | 훈제고기 30개 | 30 smoked meat | produced | 읍 | 0.8 | 8 | 10 |
| D7 | `goal_tuna` | 참치 10마리 잡기 | Catch 10 tuna | `item_fish_big` from boats/trawlers | b:boat_fishing | 1.0 | 10 | 15 |
| D8 | `goal_wholesale` | 도매로 300개 보내기 | Send 300 items wholesale | dock + shops + yard | 읍 | 1.5 | 12 | 20 |
| D9 | `goal_riders` | 오늘 버스 승객 80명 | 80 bus riders today | transit count | b:depot | 1.0 | 10 | 1 game day |
| D10 | `goal_export_contract` | 수출 계약 | Export contract | the cargo ship's contract, loaded before it leaves | v6 | 4.0 | 30 | per cargo ship |
| D11 | `goal_cakes` | 케이크 20개 (설탕 수입) | 20 cakes | baked from sugar | v6 import | 1.2 | 10 | 15 |
| D12 | `goal_hotel_guests` | 호텔 손님 40명 | 40 hotel guests | check-ins | v7 | 2.0 | 15 | 20 |
| D13 | `goal_furniture` | 가구 15개 | 15 pieces of furniture | furniture workshop output | v8 | 1.5 | 12 | 15 |
| D14 | `goal_appliances` | 가전 10개 | 10 appliances | appliance factory output | v8 | 1.8 | 14 | 15 |

### E. 탐험 (exploration) — 13

| # | id | 한국어 | English | How | Unlock | pay | fame | Repeat |
|---|---|---|---|---|---|---|---|---|
| E1 | `exp_lost_puppy` | 잃어버린 강아지 찾기 | Find the lost puppy | a puppy (`pet_dog` 0.8 scale, own tint) hides in a region; barks louder nearer; kids point (`emote_exclaim`); it follows the chief home | 읍 | 0.5 | 15 | 40 |
| E2 | `exp_tower_stars` | 망루에 올라 별 보기 | Stargazing from the watchtowers | 3 watchtowers at night; a shooting star (`fx_star` streak + `fx_glow`) at each | 읍 | 0.3 | 10 | once |
| E3 | `exp_lost_penguin` | 길 잃은 뽀삐 데려오기 | Bring Ppoppi home | the penguin wandered to the station or town; lead it back | 읍 | 0.3 | 10 | 40 |
| E4 | `exp_old_sign` | "갈매기 항구 방면" 표지판 조사 | The old harbour sign | walk to the rail-end signpost; a far horn and gulls; opens the v6 chain | 도시 | — | 10 | once |
| E5 | `exp_first_harbour_train` | 첫 기차 타고 항구로 | First train to the harbour | ride the first coast train | v6 | 0.5 | 20 | once |
| E6 | `exp_lighthouse_top` | 등대에서 밤바다 보기 | Night sea from the lighthouse | stand at the lighthouse on the rocky point at night; the camera follows the beam 4 s | v6 | 0.3 | 10 | once |
| E7 | `exp_warm_coast` | 따뜻한 바닷가 탐험 | Explore the warm coast | walk east past the lighthouse point; snow thins into sand (§6.5) | v7 | 0.5 | 25 | once |
| E8 | `exp_beach_cleanup` | 해변 청소 (12개) | Beach clean-up | collect 12 seaweed and driftwood bits | v7 | 0.6 | 15 | once, then 7 game days |
| E9 | `exp_shells` | 조개껍데기 10개 모으기 | Collect 10 shells | `decal_shells` sparkles; give them to a kid or the aquarium | v7 | 0.3 | 8 | 15 |
| E10 | `exp_rare_fish` | 희귀 물고기 기증 | Donate a rare fish | a rare catch (1 in 25 boat trips) → `mini_aquarium` | b:mini_aquarium | 1.0 | 20 | per fish |
| E11 | `exp_crab_count` | 꽃게 8마리 세기 | Count 8 crabs | tap walking `crab`s | v7 | 0.2 | 6 | 20 |
| E12 | `exp_wanted` | 현상수배범을 찾아라 | Find the wanted thief | rumours name where they were seen; tap the right townsperson | v8, toggle | 1.0 | 20 | per poster |
| E13 | `exp_rumour_truth` | 소문의 진실 | The truth behind a rumour | ask 3 residents; the card shows how the rumour grew ("쿠키 두 개가 여섯 개가 됐대요!") | paper | 0.3 | 10 | 20 |

### F. 오늘의 미션 (daily pool) — 12 (3 drawn per day; each 0.5 pay + 5 fame; all three +1.0 and +15 fame and count for the streak)

| # | id | 한국어 | English | Need | Unlock |
|---|---|---|---|---|---|
| F1 | `day_customers` | 손님 60명 맞이하기 | Serve 60 customers | any seller | 읍 |
| F2 | `day_bread` | 빵 40개 팔기 | Sell 40 loaves | market / shops | 읍 |
| F3 | `day_ride` | 버스나 기차 한 번 타기 | Take one ride | transit | b:depot |
| F4 | `day_dog` | 콩이와 놀아 주기 (간식·공·쓰다듬기) | Play with Kongi | all three dog actions | 읍 |
| F5 | `day_chat` | 주민 3명과 수다 떨기 | Chat with 3 residents | chat or tap-talk | 읍 |
| F6 | `day_tax` | 세금 상자 비우기 | Empty the tax box | hall tax pad | b:town_hall |
| F7 | `day_flowers` | 꽃밭에서 꽃 5송이 꺾기 | Pick 5 flowers | 꽃밭 | b:deco_flowers |
| F8 | `day_train_guests` | 기차 손님 30명 맞이하기 | Welcome 30 train visitors | visitors | 읍 |
| F9 | `day_auction` | 경매 한 번 참여하기 | Join an auction | auction pad | v6 |
| F10 | `day_swimmers` | 해변 손님 20명 | 20 beachgoers | beach count | v7 |
| F11 | `day_paper` | 아침 신문 읽기 | Read the morning paper | open the newspaper | paper |
| F12 | `day_settle` | 물류 센터 정산 한 번 | One settlement | stamp pad | v8 |

### G. 이번 주 목표 (weekly) — 6 (stages pay 2 / 3 / 5 and fame 20 / 30 / 50; all three give that week's decor in rotation: 눈꽃 아치, 랜턴 거리 segment, 이글루 쉼터, 눈 요새 놀이터, 그네)

| # | id | 한국어 | English | Stages |
|---|---|---|---|---|
| G1 | `wk_good_chief` | 착한 촌장 주간 | Kind-chief week | requests done 10 / 20 / 35 |
| G2 | `wk_transit` | 교통 왕 | Transit king | bus + train riders 200 / 500 / 1000 |
| G3 | `wk_celebrations` | 축하의 주간 | Week of celebrations | weddings, births or birthdays attended 1 / 3 / 5 |
| G4 | `wk_exports` | 수출 왕 | Export king (v6) | items exported 100 / 300 / 600 |
| G5 | `wk_beach` | 해변 지킴이 | Beach keeper (v7) | beach guests 100 / 300 / 600 |
| G6 | `wk_city` | 살아 있는 도시 | Living city (v8) | deliveries settled 30 / 80 / 150 |

### H. 연속 달성 (streaks) — 3

| # | id | 한국어 | English | Rule | Reward |
|---|---|---|---|---|---|
| H1 | `streak_daily` | 오늘의 미션 연속 달성 | Daily streak | all 3 dailies on consecutive days; a 눈사람 방패 forgives 1 missed day per week | day 2 +10 fame · day 3 a free 꽃밭 · day 5 3 min of income · day 7 +50 fame and a crown flair for 24 h; repeats |
| H2 | `streak_requests` | 착한 촌장 콤보 | Kind-chief combo | 5 requests within 15 game minutes | +5 fame per further request in the combo |
| H3 | `streak_drive` | 별 세 개 운전 연속 | Three-star streak | 3 ★★★ drives in a row | +20 fame and the "베스트 드라이버" flair for 1 game day |

Catalogue line shape:

```js
// 미션 목록 — 한 줄이 미션 하나예요. pay = '지금 1분 수입'의 몇 배, fame = 명성
{ id: 'req_bread_grandma', kind: 'request',               // request|drive|event|goal|explore|daily|weekly|streak
  title: { ko: '할머니께 빵 5개 갖다 드리기', en: 'Bring Grandma 5 loaves' },
  giver: 'v:npc_aunt', obj: [{ t: 'deliver', items: { item_bread: 5 }, to: 'v:npc_grandma' }],
  unlock: 'rank:2', repeat: 20, pay: 0.3, fame: 5, weight: 3, icon: 'ui_icon_request',
  lines: { offer: 'm_bread_offer', thanks: 'm_bread_thanks' } },
// obj types: deliver{items,to} · produce{item,n,window} · sell{item,n,where} · drive{route,stops,par} · visit{place|region,stand}
//            find{kind,area,n} · host{event} · ride{line|any} · build{key} · stat{key,delta}
```

---

## 8. Saves and settings

| Main-save key | Owner | Version | Cap |
|---|---|---|---|
| `later` | ModuleHost (gates seen, preview flags) | 1 | 128 B |
| `story` | story | 1 | 1 KB (+ side key ≤ 450 K chars) |
| `missions` | missions | 1 | 3 KB |
| `bank` | bank | 1 (2 in v8) | 1 KB |
| `vehicles` | vehicles | 1 | 1.5 KB |
| `harbor` | harbour | 1 | 2 KB |
| `beach` | beach | 1 | 2 KB |
| `logistics` | logistics | 1 | 2 KB |
| `incidents` | incidents | 1 | 2 KB |

Main save typical ≤ **16 KB**, hard ceiling **24 KB** (v4's 5.7 KB + the sum of the slice caps, 14.6 KB, + headroom), write ≤ 3 ms; the save test fails above 24 KB and warns above 16 KB. `SAVE_VERSION` 6 → **7** (v5) → **8** (v6) → **9** (v7) → **10** (v8); each
`MIGRATE[n] = (s) => ({ ...s, v: n + 1 })`; a slice starts fresh the first time its module runs; `sanitizeSave` calls
each registered sanitizer and **keeps a slice whose module is not running yet** (pass-through). A v4 save already at 읍
constructs v5 on load and plays the proposal once (`story.life.seen.proposal`). Settlers saved as a number become
settler households on load (seeded, up to the bed count). Worst-case local storage ≈ 24 K + 220 K + 450 K chars per save
set, under Safari's ≈ 2.5 M UTF-16 chars.

**Settings** (`frostVillage.settings.v1`, P2/P12):

| Key | Label | Default | Effect |
|---|---|---|---|
| `lifeFarewell` | 생애 이벤트: 켜기 / 끄기 (끄면 노년까지만, 이별 없음) | 켜기 (Q1) | off → no farewells, elders freeze at 85 |
| `incidents` | 사건·사고: 켜기 / 끄기 | 켜기 (Q7) | off → no theft, scuffles, fires (v8) |
| `missionToasts` | 미션 알림: 켜기 / 끄기 | 켜기 | off → story cards and mission toasts muted; the chip stays |

---

## 9. Budgets

### 9.1 Texture memory (source-sum MiB; must ≤ 455 in every view, transients included)

| View | Steady target | Transient | Levers if over |
|---|---|---|---|
| v5 plaza / town (re-measure v4 first) | ≤ 340 | wedding ≤ +40 for ≤ 60 s after | life pages for the cast's ages only; vehicle keys cap |
| v5 station district at 도시 | ≤ 340 | — | 4 car colourways in one page |
| v6 harbour | ≤ 300 | — | ship pages by view, SE/NW only |
| v7 beach | ≤ 320 | dusk glow +7 | half tier, nature split, water page with swimmers only |
| v8 newtown | ≤ 320 | incident ≤ +70 for ≤ 90 s | incident groups only while staged |

Per district, its own pages ≤ 120 MiB (harbour, beach, newtown). Areas (Residency `addArea`) use v4's hysteresis
(acquire 800 px, release 1200 px, TTL 10 s). Prerequisite in P0: re-measure v4 after its fix pass; if busy views stay
above 340, split the 8–11 MiB v3 atlases and evict `props_buildings`/`bld_*` by area (≈ −40 MiB) before v5 art ships.

### 9.2 CPU (fixed-step bench, avg ms per tick)

| Part | Budget |
|---|---|
| Story main thread / worker | ≤ 0.10 / ≤ 2 ms per game second on a phone (0 long tasks on main) |
| Missions / bank | ≤ 0.02 / ≤ 0.01 |
| Vehicles (24 sim, 12 sprites) | ≤ 0.15 |
| Harbour / beach | ≤ 0.10 / ≤ 0.15 |
| Logistics / incidents | ≤ 0.08 / ≤ 0.10 |
| TownSim with ≤ 200 citizens | ≤ 0.35 |
| **Whole game, any view** | **≤ 2.1 ms** (beach peak 2.3 tolerated if the lab shows it is needed) |

Display objects ≤ 1700 per view (district statics ≤ 400, baked ground for quays, piers, sand, boardwalks, markings);
draw calls ≤ 12 (≤ 14 during a wedding). Off-screen simulation stays analytic (TownSim L2, vehicle route profiles, ship
timetables), so a far district costs only its model tick.

### 9.3 Files and bytes

| Step | Change | Files |
|---|---|---|
| v5 P0 | one-shot SFX packed into one audio sprite per fragment (loops and music stay files): audio 36 → 1, audio2 25 → 1, audio3 14 → 1 | −71 |
| v5 P0 | title backdrops/logo parts packed into pages (34 → ~12) | −22 |
| v5 | vehicles ~12 pages, townfolk2 ~6 pages, audio3 loops, civic bank pages ~2, fx_city UI subset ~1, `story.js` + `story_worker.js` | +26 |
| v6 | ships ~4 pages (SE/NW), harbour ~4, audio4 (sprite + 2 loops + manifest) | +12 |
| v7 | beach ~6, beach_bld ~5, beachfolk ~5, audio5 rest (sprite + 3 loops) | +20 |
| v8 | logistics ~6, civic rest ~2, fx_city 37 → ~4 pages, cityfolk ~8, audio6 (sprite + 6 loops + manifest) | +29 |
| **After v8** | 491 − 93 + 87 | **≈ 485** (gate ≤ 495 in `build_artifact.mjs`) |

Bytes: + ≈ 47 MB over v5–v8 → ≈ 110 MB per version (limit 256 MB), 2–3 publish batches (≤ 64 MB, ≤ 255 files each),
boot files in the last batch (v4 rule). `story.js` (classic script setting `__FV_STORY_MOD`) and `story_worker.js` ship
like `chat.js`; the build refuses either if it contains `import`/`export`.

---

## 10. Integration patches (exact; anchors by content; applied by the lead after v4 ships)

Every patch keeps v4 behaviour when no later module runs (guarded by `gs.later`, a module API or data presence).

| # | File | Change | Ver |
|---|---|---|---|
| P1 | `src/scenes/Game.js` | one block `// ---- (v5+) later modules`: `import { ModuleHost } from '../kit/ModuleHost.js'`; in `build()` after `Neighbours.attach(this, sv.v4)`: `this.later = new ModuleHost(this, sv, LATER_MODULES)`; in `update()` after `if (this.v4) this.v4.update(dt);`: `if (this.later) this.later.update(dt);`; in `serialize()` after the `c1:` line: `...(this.later ? this.later.serialize() : passThroughSlices(this.saved))`; in `save()`: `if (this.later) this.later.saveSide(force)`; `installHooks()`: `hooks.later = …` | v5 |
| P2 | `src/core/Save.js` | `SAVE_VERSION = 7` + `MIGRATE[6]` (8, 9, 10 per version); in `sanitizeSave`: `for (const sl of LATER_SLICES) { const v = sl.sanitize(raw[sl.key]); if (v) s[sl.key] = v; }`; `StorySave` (copy of `ChatSave`, key `SAVE_KEY + '.story'`, record v 1, `cid` check); `Save.clear()` also clears it; `Settings.data` gains `lifeFarewell: true, incidents: true, missionToasts: true` (validated like `daynight`) | v5 |
| P3 | `src/core/Assets.js` | `LATE_FRAGMENTS += ['vehicles', 'civic', 'fx_city', 'audio6', 'ships', 'harbor', 'beach', 'beach_bld', 'beachfolk', 'logistics', 'cityfolk']` (townfolk2 fully, life2 rest); `mergeLate` routes `townfolk2/beachfolk/cityfolk` through `mergeTownfolkFragments` before `TF.init`; audio-sprite entries load through `load.audioSprite` | v5 (+ per version) |
| P4 | `src/core/Residency.js` | `export function addArea(area)` (push onto `REGIONS`), `addClass(name, { ttl, cap, maxMiB })` for `vehicle`, `ship`, `dollLife`, `dollBeach`, `incident:*`; `stats()` per class | v5 |
| P5 | `src/core/Townfolk.js` | `TOWNFOLK2 = true`; port `animParts`, `partPlays`, `animHideHead` (+ hair un-squash), timeline `hd`, `faceDirsByPose`, `followDz`, `cfCover`, `cfDrop`, `animItems`, `setFace(person, face)`, `pickAnim(person, anim, { has })` with `animFallback` + `fallbackFace`; `AGE_SHEETS` regex covers `tf_`, `tf2_`, `bf_`, `cf_` | v5, v7, v8 |
| P6 | `src/systems/TownSim.js` | `registerKind(kind, { plan, look, age })`, `addPlaces(blds)`, `hold(c, owner)` / `release(c)` (held citizens skip `wake`/`planDay`), `walk(c, x, y, opts, cb)`, `onArrive(fn)`, `bodyOf(c)`; bus riders like train riders; story talks replace `chatter()` on screen when `gs.later.story` runs | v5 |
| P7 | `src/systems/Collision.js` | `seaAt(x, y)` = `y < shoreY(x) + 46` OR (`WORLD.southSea` && `southSea(px2L(x, y))` with a 0.72-cell margin); `blocked()` uses it | v6 |
| P8 | `src/entities/Seller.js` (`complete`) | `gs.events.emit(this.cfg.soldEvent || 'sold', value, c.want.type, c.want.count)` | v5 |
| P9 | `src/entities/Station.js` | after the output is pushed: `gs.events.emit('produced', this.id, this.output, 1)` | v5 |
| P10 | `src/systems/DayClock.js` (`update`) | when `this.day()` changes: `this.gs.events.emit('day', this.day())` | v5 |
| P11 | `src/systems/VillageLife.js` (`react`), `src/systems/Neighbours.js` (`tap`) | emit `'tap'` with the person's pid before the existing reaction | v5 |
| P12 | `src/scenes/UI.js` | `openPanel(PanelClass, data)` host, `chip(id, spec)` slots (mission, fame, news edge icon, transit, drive HUD), `card(spec)` (story card, bottom-left 520 × 120), settings rows 생애 이벤트 / 미션 알림 / (v8) 사건·사고, version-label 5-tap → preview menu | v5 |
| P13 | `src/entities/TownHall.js` | `boardLines()` appends `gs.later.missions.boardLines()`; `openBoard()` opens the mission panel when missions run; `venue('wedding')` used as is | v5 |
| P14 | `src/systems/Neighbours.js` | `this.rails = [this.rail]`; `gs.roads.edgeBlocked = (e) => !!(e && e.xing >= 0 && this.rails.some((r) => r.blocking(e.xing)))`; `'v4:train'` payload gains `line`; `sendByBus(n, stopXY)` = `sendByTrain` with a stop spawn point (Visitor P33); chief boards trains (`ride`) | v5, v6 |
| P15 | `src/core/Audio.js` | audio-sprite playback (`Audio.play(key)` resolves a marker); `setAreaMusic(area)` crossfade (village / town / harbour / beach / city) | v5 |
| P16 | `src/systems/Territory.js` | `areaOf(x, y)` → `village` / `neighbours` / `harbor` / `beach` / `newtown` (overview frames the chief's area); new regions | v6–v8 |
| P17 | `src/systems/Rank.js` | levels from data (`BALANCE.v5.rank[3]`, `BALANCE.v8.rank[4]`) with bar readers `people`, `fame`, `riders`, `deliveries`, `safety`; ceremony emits `v4:rankUp` level so modules play their parts; title 시장; the panel's "도시는 다음 버전에서" row becomes rank 3 | v5, v8 |
| P18 | `src/systems/RoadPaint.js` | lane markings (`lane_x/_y`), crosswalks, `intersection` for the asphalt class | v5 |
| P19 | `src/data/world.js` | streets **appended to `WORLD.v4.streets`** (conn_w, conn_jog, conn_e, bank_st, ave_s; v6 blvd_h; v7 blvd_b; v8 ave_c, lgx_st) with `region`; `WORLD.v5 … v8` from the modules' `layout.js` (Korean comments, `L4` anchors); `removeDecor`/`moveDecor` (§4.2); plots `ws_x1–3` + a west_s walk spur; `WORLD.southSea` (§4.1); territory rects and sizes; rail `to: 98`, crossings `[8, 33, 65, 97]`; `borderTrees` `until` fields | v5–v8 |
| P20 | `src/data/balance.js`, `balanceCheck.js`, `strings.js` | each module's `tuning.js` block copied verbatim as `BALANCE.v5 … v8` (Korean comments kept; modules read `BALANCE` first, their defaults second); ranges in `balanceCheck`; ko + en strings | v5–v8 |
| P21 | `src/systems/ResidentChat.js` | when `gs.later.story` exists: `new StoryBridge(story.facade, village, { idOf, keyOf })` from the registry; `syncWorld()` on `day`; `syncMemories(key)` on chat open; `facade.on('talk', bridge.decorateTalk)` ahead of StoryLife | v5 |
| P22 | `src/voice/cast.js` | job → voice: dock_worker/sailor → `big_gruff`, lifeguard → `young_m`, vendors → `sweet`, firefighter/police → `adult_m`, burglar → `squeaky` | v6–v8 |
| P23 | `src/systems/Ground.js` / `VillageSea.js` | village sea preset width follows `WORLD.width` (field re-baked for 10752 / 11264); `ports.water.region()` regions (harbour basin `harbor`, warm sea `tropical`, hotel pool `pool`) | v6, v7 |
| P24 | `tools/build/pack_pages.py` | `TF_FRAGS = ['townfolk', 'townfolk2', 'beachfolk', 'cityfolk']`; page classes (`loco`, `social`, `life`, `beach`, cityfolk groups); vehicles, ships (SE/NW), harbour, beach, civic, logistics, fx_city pages; clear rows 0–1 of the 2-px sliver frames | v5–v8 |
| P25 | `tools/build/build_artifact.mjs` | bundle `story.js` + `story_worker.js` like `chat.js`; audio sprites; title pages; file gate ≤ 495 | v5 |
| P26 | `tools/story/index.js` | re-export from `src/story/engine/**` (one copy; `sim.mjs` and the 30 tests keep running) | v5 |
| P27 | `src/systems/Civic.js` | catalog entries on XL plots: school, clinic, apartment_a (+24 beds), apartment_b (+18 beds); on M plots (v8): furniture_workshop, appliance_factory; `settlersArrive` emits `('settlers', n, house.id)` | v5, v8 |
| P28 | `src/entities/UnlockPad.js` / `Site.js` pads | coins short and `gs.later.bank` open → `gs.later.bank.offerFor(short, this.id)`; on true the pad pays as usual | v5 |
| P29 | `src/scenes/Game.js` sites | `addModuleSite(id, cfg, kind)` → `new Site(gs, id, cfg, kind)` registered in `gs.sites` (porters, scaffold, ribbon as today) | v5 |
| P30 | `src/systems/Tutorial.js` | `v5Hint(set, dt, idle)` after `v4Hint` using `gs.later.missions.focusTarget()` | v5 |
| P31 | `src/scenes/UIv4.js` | hide the order chip when `gs.later.missions` runs (the mission chip takes its spot at (28, top + 212)); rank chip shows 3/4 bars | v5 |
| P32 | `src/systems/Growth.js` | a second founding board (`board: 'beach'`, order/lots from `BALANCE.v7.beach.founding`); restock targets exposed to freight (`shopTargets()` exists) and routed through logistics in v8 | v5, v7, v8 |
| P33 | `src/entities/Visitor.js` | optional spawn point (bus stop) instead of the station | v5 |
| P34 | `src/systems/TownSim.js` `card()` / `ResidentChat` name card | story card fields from `gs.later.story.card(pid)` | v5 |

---

## 11. Build order

### 11.1 Now (while v4 finishes) — standalone modules

| Step | Job | Own paths | Done when |
|---|---|---|---|
| L0 | **kit** (lead) | `src/kit/**`, `tools/test/later/kit*`, `tools/test/later/lab_kit.js`, `tools/test/later/layout*` | import-graph test, FakePorts, slices, stage, income, townfolkMerge parity with `tools/cityfolk_compose.js`, layout checker prints `no problems` |
| M1 | story_runtime | `src/story/**`, `tools/test/later/story*`, `docs/previews/later_story/**`, `docs/build_reports/later_story.md` | §6.1 tests + lab; worker and inline both green |
| M2 | missions_bank | `src/missions/**`, `src/bank/**`, `tools/test/later/{missions,bank}*`, `docs/previews/later_missions/**`, report | §6.2 |
| M3 | vehicles_runtime | `src/vehicles/**`, … | §6.3 |
| M4 | harbor_runtime | `src/harbor/**`, … | §6.4 |
| M5 | beach_runtime | `src/beach/**`, … | §6.5 |
| M6 | logistics_runtime | `src/city/logistics/**`, … | §6.6 |
| M7 | incidents_runtime | `src/city/incidents/**`, … | §6.7 |

M1–M3 first (v5), M4–M7 may run in parallel after L0. A job that needs a v4 change writes it as an exact patch in its
report's "Integration" section, or tries it on a private copy (`cp -r src "$S/game_copy"`) — never in the real tree.

### 11.2 After v4 ships — integration phases (each ends with every suite green)

| Phase | Work | Gate |
|---|---|---|
| **v5 P0** (can ship as v4.2) | P1–P5, P8–P11, P15, P24/P25 (files), ModuleHost with no modules, texture re-measure | all v4 suites green; texbudget ±5 MiB; files ≤ 430; TF parity 1000 people × 4 fragments |
| v5 P1 story + bank | worker host, adoption, talks, paper, chat bridge, bank at row D, chief account, loans on pads | story main thread ≤ 0.1 ms; 0 story long tasks; side save ≤ 450 K after a 30-day fast-forward; every name unchanged |
| v5 P2 life | proposal, weddings, babies, aging, school, wishes, farewell + switch, memorial garden, happenings | life pages only during scenes; peak ≤ target + 40 |
| v5 P3 missions | board, bubbles, pads, story missions, fame/titles, dailies | 30-day sim anti-softlock; bots reach title 2 by ≈ 90 min |
| v5 P4 vehicles + 도시 | era 2 at 읍, 서리 큰길, stops, freight, rank 3 ceremony, asphalt, era 3, chief driving | vehicle tests; ≤ 0.15 ms; ≤ 8 keys |
| v5 P5 | bots, balance, 20-min soak, designer shots, artifact | §3 targets, §9 gates |
| **v6** | P0 world (size, regions, south sea, Collision, Water fields, rail to k 98, coast line, border trees) → harbour static → ships and set pieces → trade, tourists, missions, residents | layout checker; v4 economy unchanged; harbour view ≤ 300 MiB, ≤ 2.1 ms; berth tests |
| **v7** | beachfolk merge + `dollBeach` → tropical + pool water → beach static → beachgoers → resort economy, events, missions | parity; beach pages ≤ 120 MiB; ≤ 1700 objects |
| **v8** | cityfolk merge + incident groups → police + logistics static/cutaway → logistics model + vans → incidents on → moving trucks → rank 4 | transients ≤ +70 MiB / 90 s; toggle; soak with incidents |

---

## 12. Tests and acceptance (summary)

- **Ring 1 — Node** (`nice -n 15 node --test tools/test/later/<mod>.test.mjs`): §6.x lists, plus kit (import rules,
  slices accept their own output, feed covers every §5.4 event) and layout.
- **Ring 2 — labs** (`tools/test/later/<mod>_lab.html` + `.mjs`, Playwright with Chromium from
  `PLAYWRIGHT_BROWSERS_PATH`, one browser, fixed-step clock, ≤ 2 min): real art, FakePorts; report draw calls, display
  objects, texture MiB, ms per tick, 0 placeholders, 0 console errors; captures to `docs/previews/later_<mod>/`. The labs
  are the designer's first look — no module is integrated before the designer has seen its lab shots.
- **Ring 3 — in game** (per version): `tools/test/v5.mjs … v8.mjs` (fixed-step, `__FV.later.*` hooks), `save_v5.mjs …`
  (real fixtures before 읍 / at 읍 / mid-founding / mid-wedding / mid-drive / mid-ride; story key missing or corrupt;
  200 fuzzed slices per module; idle income within ±6 % across the migration), `texbudget.mjs` tour extended with a
  wedding, a chase, a fire, the harbour, the beach and the newtown, `v4a_perf.mjs` per view, bots in
  `review_gameplay_sim.mjs --v5..--v8` (accept requests, carry for missions, attend weddings, ride buses, drive at ≥ ★★,
  build the offered buildings, take a loan when bars are full), a soak per version (heap flat after GC, listeners,
  tweens and timers flat, story save bounded), and every existing suite green.
- **Must-look screenshots** (390 × 844 and 360 × 640, ko + en, look at each): v5 — proposal, mission panel, request
  bubbles, sleigh bus at the plaza, steam wagon unloading, guests changing clothes, vows, cake crowd, cradle, stroller,
  naming sheet, first school day, outdoor class, grandma on the bus, farewell (and with the switch off), newspaper, 도시
  asphalt wipe, truck drive HUD, night traffic; v6 — sleepy harbour reveal, auction, lighthouse at night, ferry with deck
  passengers, tourists at the market, crane, export pad, trawler launch, festival; v7 — snow into sand, beach reveal,
  swimmers + whistle, sandcastles, volleyball, ice-cream queue, shop ribbon, hotel, pool, polar swim, fireworks, night
  beach; v8 — cutaway, forklift, settlement, furniture workshop, moving truck, rumour ear, chase + apology, fire with
  the crowd, demolition, rebuilt house, 큰 도시 ceremony.

---

## 13. Risks

| Risk | Mitigation |
|---|---|
| Story hitches on phones | worker by default (Blob fallback, then inline with sliced day changes); perf test fails on story long tasks |
| Workers blocked in the published artifact | `test_deploy` checks the mode; inline fallback is the same protocol and tested for parity |
| Story and TownSim both move a body | E1 external plans + leases; one-owner assertion test |
| Side save outgrows storage | pack15, `compact()` levels, hard cap keeps the last good record; the main save never depends on it |
| The farewell upsets players | very old only, gates, no death words, hopeful music, 콩이 beside the chief, wishes first, the switch; **the designer reviews it in the preview menu before v5 ships** |
| Texture memory (vehicles + townfolk2 + ships + beachfolk + cityfolk) | pages per class, event-only loading, key caps, district page caps; v4 re-measure first |
| File limit | P0 reclaims 93 files before any v5 art; hard gate ≤ 495 |
| Map: south sea and rect regions | checker for every coordinate; horizontal bands; module-created content; palette seam hidden behind the breakwater and rocky point (fallback: one `tropical` region) |
| Mission overload on a small screen | caps (2 bubbles, 1 card), focus rule, 미션 알림 switch; bots measure bubbles on screen |
| Arrow-only players stall on fame | passive fame, hints, the board always offers a doable card |
| Incidents feel harsh | v8 only, comic staging, rare, nobody hurt, switch |
| v4 files keep moving until v4 ships | patches anchored by content; P0 lands first with every suite as the net |
| SwiftShader numbers ≠ phones | logic on the fixed-step clock; GPU by counts/bytes; `?debug=1` HUD on the designer's phone |

---

## 14. Open questions for the designer (asked in Korean in the designer document)

| # | Question | Default in this plan |
|---|---|---|
| Q1 | "생애 이벤트" starts 켜기 or 끄기? | 켜기 (as the 기획서 says) |
| Q2 | After switching farewells off, do existing memorial stones stay? | stay |
| Q3 | 오늘의 미션 by the real day (05:00) or every game day (10 min)? | real day |
| Q4 | May the chief name babies (3 choices + "부모님이 정할게요")? | yes |
| Q5 | Names "서리시" (rank 3) and "큰 도시" (rank 4)? | yes |
| Q6 | Harbour and beach on one warm south coast east of the town (this plan) — OK? | yes |
| Q7 | "사건·사고" starts 켜기? | 켜기 |
| Q8 | Publish v6 (harbour) and v7 (beach) separately or together as one test link? | separately, either works |

---

## Appendix A. Pick list (smaller decisions)

| Topic | Picked | From | Note |
|---|---|---|---|
| Module paths | `src/story`, `src/missions`, `src/bank`, `src/vehicles`, `src/harbor`, `src/beach`, `src/city/logistics`, `src/city/incidents` | task, tech | the player's `src/systems/v5/*` layout dropped: v4 owns `src/systems` |
| Mission catalog location | `src/missions/data/catalog.js` | tech path, player content | not `src/data/missions.js` (v4-owned folder) |
| Orchestrators | `ModuleHost` instead of `V5.js … V8.js` | tech | one block in Game.js for all versions |
| Bus/train naming | trains `main` + `coast`; buses 1–4 | lead | avoids "line B" meaning both a bus and a train |
| Fame thresholds and names | [0, 150, 400, 900, 2000], 새내기 / 믿음직한 / 존경받는 / 명예로운 / 전설의 | player | the 기획서 names three of them; tech's [0, 40, 120, 300, 700] was too fast for the income-scaled missions |
| Rank-3 bars | people 100 / fame 400 / riders 120 / 24,000 | player | tech's shops/happiness bars dropped (finding 8) |
| Bank interest cap | deposit cap 50,000 (≤ 500 per game day) | player | tech's 150/day cap unnecessary with a deposit cap |
| Loan size | 15 min of income | player | scales across versions; tech's formula did not |
| Memorial garden | row D (quiet west end) | tech | town citizens walk there; the player's far south-west corner was a 60 s walk from the town |
| Village civic buildings | 3 XL plots in `west_s` (re-spaced) | player | the player's three positions overlapped each other |
| School/bank stops | poles at L(41.6, −11.85) and L(34.15, −22.05) | lead | the player's S4 overlapped `t_apt1` |
| Fire brigade | levels at the town's `t_fire` + hydrants | 기획서 | the player's extra village fire station dropped |
| Imports | cloth uses `item_cloth_rolls` (exists in logistics art); sugar and glass labelled crates | lead | the player assumed no cloth art |
| Cloth effect | 솔방울 옷가게 buys our cloth goods; v7 swimwear shop | lead | the player's harbour lot HL1 does not fit the south-coast layout |
| Ferry timetable | 06:30 / 10:30 / 14:30 / 18:30 (+ 21:30 with the lighthouse), dwell 45 s | tech + player | player's night ships kept |
| Auctions | big auction 15:30 after the trawlers + small auctions every 2 game hours for the chief's fish | both | |
| Newspaper | v5 | tech | the player had it in v8 |
| Rumour ears and E13 | v5 after the first paper | lead | cheap (ui4 icon), shows the story network early |
| Settings keys | `lifeFarewell`, `incidents`, `missionToasts` | both | one switch per designer wish |
| Engine copy | `src/story/engine` is a copy until P26 | lead | module jobs may not edit `tools/story` |
| Population | ≤ 400 story residents | lead | rank 4 needs 220 non-town residents + 120 townsfolk; measured cost at 400 is 0.23–0.26 ms per game second |
| Texture targets | per-view targets 300–340 (v4 already measures 311–385) | player | the 455 must is unchanged |
| Preview menu | version label 5× | player | |
| Happenings | 12, split by district module | player | |

## Appendix B. Art and audio per version (no new art) and known gaps

| Version | Art | Audio |
|---|---|---|
| v5 | vehicles (era 2 + 3 + buildings), roads (lanes, crosswalks, curbs), ui3, civic (`bank` layers + vault only), fx_city UI subset (ui4 icons, `ui_newspaper*`, `ui_story_card*`, `ui_passbook*`), life2, townfolk2 (wedding/mourning parts, `sit`/`clap`/`sad`/`push`), town (school, clinic, apartments), life_props (notice_board, music_stand, bench_seats, picnic_table, lantern_string, igloo, snow_fort, kids_swing), fx, emotes | audio3 (all 18) + audio6 `sfx_coin_count`, `sfx_stamp`, `sfx_ticket_chime`, `sfx_newspaper`, `amb_bank` |
| v6 | ships, harbor, water (`harbor` palette, wakes, splashes), harbour townsfolk presets, logistics `item_cloth_rolls` | audio4 |
| v7 | beach, beach_bld (+ glows), beachfolk, water (`tropical`, pool) | audio5 rest |
| v8 | logistics, civic rest, fx_city rest, cityfolk, vehicles (`police_car`, `fire_truck`, `ambulance`) | audio6 rest |

Known gaps worked around: no sugar or glass icons (labelled crates); no `sit` anim for the chief (`idle` at `seatsStand`
+ overlay); no glass-break sound (`sfx_collapse_soft` quiet); no ice-cream item (`emote_star`); no fireworks sheet
(`fx_spark`/`fx_star`/`fx_glow` bursts, ADD); drivers and bankers use townfolk presets until cityfolk loads in v8.
