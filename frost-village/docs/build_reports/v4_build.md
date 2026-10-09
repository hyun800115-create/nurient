# v4 build (BUILD-B): the neighbours' order board, new shops, rank 읍, roads, texture memory

## Build

v4 (`v4.0`) is built on top of BUILD-A (rail, train, 솔방울 마을, townsfolk). BUILD-B adds the station-square economy (order board, loading dock, 역 금고, station porters), the five founded shops with their builders and ribbons, the carpenter's houses, the rank 마을 → 읍 with its ceremony, the road network and road painting, the texture-memory work (packed pages, residency, pooled ground tiles), save version 5, the tutorial/progression hooks and the §18 polish backlog. The first 20 minutes are v3.5 unchanged; nothing of v4 loads before `tower_east`.

**Status (2026-10-09): built and green.** Every suite passes (one `v3.mjs` check flaked once, green on 3 reruns). All musts hold: texture memory ≤ 455 MiB everywhere (peak 385; GL total 420), a new game at 191 MiB (≤ 368; the 240 target is met too), logic per tick, town sim, draw calls ≤ 12 (after the new view culling), save size, and a flat heap over a 10-minute v4 soak (after a leak fix). Missed: the 300 MiB texture target once the village is complete (275–385), ≤ 1700 display objects in a crowded town view (2257–2489), and no upload over 8 MiB (three v3 atlases reloaded after a town visit are 8.1–11.3 MiB). The three bots reach 읍 at 47.5–51.5 min (final-code smart run: 48.8), with 0 errors.

## What was built

- **Order board (주문판) and loading dock (짐 싣는 곳).** Up to 3 cards. The five founding cards come first, each offered only once its producer exists (카페 after the farm, 식당 after the hunt, 목공소 after the forest, 철물점 after the toolsmith, 슈퍼마켓 after the cannery); after all five, 정기 납품 cards rotate. Anything a card needs can be dropped on the dock: each item pays **70 % of its price** into **역 금고**, a finished card pays a bonus (50 % of its value; 정기 납품 30 %, 50 % after 읍). A card nobody touched for 180 s can be swapped. Crates fly into the goods wagon when the train stands at our station.
- **Founding.** A finished card reserves its lot; the next train brings the founder and two builders, who walk to the lot; 25 s build (scaffold, hammering), then a **ribbon** pad (free, 1 s; opens by itself after 90 s). Banner "역앞 카페 개업!", rent `+20/분` on the till. The founder's household (2) moves into the station district. The first opening brings the mayor's invitation (town opens; fallback 480 s after the first train).
- **Open shops.** Each sells our goods to visitors and to the town (one item per 40 s), and is restocked from our village at the wholesale price (station porters or the chief). Rent ticks into 역 금고 (cap 2000).
- **Station porters (역 짐꾼, 600 / 1100).** Carry surplus (outputs ≥ 60 % full, the warehouse) to the remote sinks: dock, shop shelves, house sites. Items an open *founding* card needs are taken from an output as soon as 4 are there (`v4.stationPorterFoundingMin`), so a 슈퍼마켓 card no longer waits behind the general store's can porter. Regular porters never walk to the station.
- **Carpenter's houses.** With the 목공소 open, house lots H1–H3 take 20 planks each → 30 s build → a townhouse and 4 new neighbours (4 more lots at 읍).
- **Happiness.** 50 + 50 × mean satisfaction of the last 40 visitors (never below 50).
- **Rank 마을 → 읍.** HUD rank chip with three bars (people 45, shops 5, happiness 70) and a panel; when all are full, the **승격식** pad appears on the station square (**14000** coins, was 3000 in the plan — see Balance). The 12 s ceremony (skippable after 3 s): bells, confetti, the badge flying to the HUD, the main street repaved to cobble tile by tile, three new streetlights, a second coach, 20 newcomers to the town (120), new house lots, auto-collect of 역 금고 every 15 s, title 읍장.
- **Roads.** `RoadNet` (cells, lanes, crossings, `walkGraph`, `route`) on the v4 lattice and `RoadPaint` (dirt → cobble at 읍, rails, snow drifts) baked into the ground tiles through bake hooks; `Roads.js` A* with bucketed nearest-node search.
- **Texture memory** (see Perf and memory): `tools/build/pack_pages.py` packs every atlas into pages (`assets/_packed/`, 93 pages + index), `Residency.js` loads/evicts pages by area and use (townsfolk social poses on demand, LRU + TTL, refuses past the must), `Ground.js` became a pool of 512 px tiles at 3 zoom levels around the camera instead of whole-world canvases, the sea and fish schools follow the view.
- **Save v5.** `MIGRATE[4]` + `sanitizeV4`; v3.5 saves load with nothing lost (real saves at 0.5 / 12 / 21 / 38 min in `tools/test/fixtures/`); saves past `tower_east` get the rail strip and the ruin; 20 corrupted v4 blocks all boot; the v4 block passes through a save where the neighbours aren't built yet.
- **Tutorial / progression.** Goals for the station repair, cards (`{item}을(를) 짐 싣는 곳으로`), the ribbon, the town visit, planks for the carpenter, the rank pad (`승격식 준비 {coins}`); the step-off hint and arrows as in v3.5.
- **UI.** Order chip + panel (cards, progress, swap), rank chip + panel, 역 금고 label `+N/분`, edge icons, settings rows 낮과 밤 / 그래픽 (자동 / 선명하게 / 가볍게).
- **Version** `v4.0` (`src/data/version.js`).

### Polish backlog (§18)
1. Pile restore keeps items over the cap (up to max + 8) — fixed.
2. A hire pad's label lifts over the chief's head while he stands on it — fixed.
3. 2nd/3rd hunters have their own drop spots at the meat rack — fixed.
4. The fish pile (pad, barrel, label) moved 22 px north, clear of the trade-post sleigh's awning (`world.js` `labour.piles.fish`, its label 12 px lower so it covers less of the fisherman); no pine stands on or in front of a pile any more (`hidesPile` in `Game.js` keeps forest trees and the extra pines out of an 80 px ring and a 150 px band below each pile) — fixed.
5. Faint line across the sea in the overview — fixed: ground tiles are cropped to their 510 px cell (`setCrop`, `Ground.js`), so neighbouring tiles no longer overlap their 1 px gutters (the overlap drew the sea's see-through edge twice); `19_overview` shows no line.
6. The whistle button steps up (110 / 220 px, glides) when a pad or plot label would sit under it, never into the HUD chips — fixed (`v4.mjs` §9 checks it).
7. Shots 21–23 now come from `shots_v35.mjs` (21 a pad under the chief, 22 a full pile, 23 the meat rack) — done (`screens_v35/21_step_off_new_pad.jpg`, `22_pile_full_label.jpg`, `23_meat_rack.jpg`; the run re-took 01–20 with the moved fish pile).
8. Unused v3 `Smith` class removed from `Workshop.js` — done.
9. Portraits packed by `pack_pages.py` — done (artifact: 471 files in 2 publishes (250 + 220), 53.46 MB).
10. `기획서.md` §4 points to `balance.js` and the v3/v4 tables — done.
11. `porterCapacity` 14 / `spawnEveryLate` 1.3: v3 complete measured at 38.2 / 42.3 / 40.0 min (smart / think / arrow; 39.5 in the final-code smart run) with v4 income — not under 36 min, so **unchanged**.
12. P1 nice-to-haves (chief rides the train, citizen name card, house window glows, night patrol) — not done.

Also fixed on the way:
- the loading-dock and 역 금고 labels overlapped (moved apart, `world.js` `v4.square.labels`), and the 역 금고 label now sits above the spinning coin of a full coin pile;
- a visitor crashed when a founded shop was its first target;
- the ribbon's flower stands showed a placeholder when a shop was founded before the life2 manifest had arrived (they are placed once it arrives);
- snowball fights and tag only started while a kid's social page happened to be in memory (`Resident.can` now counts anims on on-demand pages; `play()` fetches the page), and tag gave up when the first kid had wandered off (any kid can start it);
- the residency leak and the draw calls (Perf and memory below);
- ground tiles left a sea-coloured strip in fixed-step screenshots (the test helper bakes for the real camera before a shot), and `shots_v4` took the town welcome too far from the fountain to trigger it.

## Progression and costs (game minutes from the smart / think / arrow bots)

| Step | Cost | Time | Smart / think / arrow (min) |
|---|---|---|---|
| Village complete (v3.5, unchanged) | — | — | 19.3 / 22.2 / 20.5 |
| `tower_east`: the rail strip and the ruined station appear | (v3 tower) | — | 19.6 / 22.3 / 20.6 |
| Repair the station | 500 coins + 14 planks + 4 ingots | 12 s build | 22.0 / 23.6 / 23.1 |
| First train (6 neighbours, the clock starts at 08:00) | — | 3 s after the repair | 22.1 / 23.7 / 23.2 |
| Station porters | 600, then 1100 | — | — |
| 1st founding card done → 역앞 카페 opens (bread 30) | goods at 70 % wholesale + 50 % bonus | founder by train + 25 s build + ribbon | 23.8 / 26.3 / 24.8 |
| Town visit (the mayor's invitation) | — | walk ≈ 7 s | 25.0 / 27.3 / 26.3 |
| 식당 (fish 40 + meat 15), 목공소 (plank 50), 철물점 (ingot 25 + axe + pickaxe), 슈퍼마켓 (can 20 + bread 20) | as above | as above | 5 shops at 34.9 / 40.6 / 39.7 |
| Carpenter houses H1–H3 | 20 planks each | 30 s, +4 people | — |
| v3 complete | (v3) | — | 38.2 / 42.3 / 40.0 |
| Rank bars full (people 45, shops 5, happiness 70) | — | — | 34.9 / 40.6 / 40.8 |
| 승격식 → 읍 | 14000 coins | 12 s ceremony | 47.5 / 51.5 / 48.2 |

| Shop | Card | Card value | Paid on delivery (70 %) | Card bonus (50 %) | Rent / min | Offered after |
|---|---|---|---|---|---|---|
| 역앞 카페 | bread 30 | 210 | 147 | 105 | 20 | zone_farm |
| 생선구이 식당 | fish 40 + smoked meat 15 | 340 | 238 | 170 | 30 | zone_hunt |
| 목공소 | plank 50 | 250 | 175 | 125 | 25 | zone_forest |
| 철물점 | ingot 25 + axe + pickaxe | 330 | 231 | 165 | 30 | toolsmith |
| 슈퍼마켓 | can 20 + bread 20 | 380 | 266 | 190 | 40 | cannery |

Standing orders after the five (bonus 30 %, 50 % at 읍): bread 40, fish 50, plank 40, ingot 25, can 30, smoked meat 25. Rent goes into 역 금고 (cap 2000); at 읍 it is collected by itself every 15 s.

## Balance changes made while measuring
- **Rank coins 3000 → 14000.** With 3000 the bots held the coins the moment the three bars filled, so 읍 came at 35–41 min, under the 48–55 band; 10000 gave 45.7 (smart). At 14000 the smart bot reaches 읍 at 47.5, the think bot at 51.5, the arrow bot at 48.2.
- **슈퍼마켓 card: cans 30 → 20.** With 30 the card waited behind the general store's can porter for minutes.
- **`v4.stationPorterFoundingMin` 4 (new).** The station porters now take what an open founding card needs as soon as 4 are in an output, not only surplus (≥ 60 % full); goods porters keep 6 back for their own sellers while a founding card needs the type. Without it the 슈퍼마켓 card stalled in every arrow run.
- §18 #11: `porterCapacity` 14 / `spawnEveryLate` 1.3 unchanged (v3 at 38.2 / 42.3 / 40.0 with v4 income, never under 36).

## Bot timings (fresh save, fixed-step clock, `review_gameplay_sim.mjs --v4`, game minutes)
| Milestone | smart (final code) | smart | think | arrow |
|---|---|---|---|---|
| Village complete | 20.0 | 19.3 | 22.2 | 20.5 |
| tower_east | 20.12 | 19.55 | 22.34 | 20.61 |
| Station built | 22.86 | 21.99 | 23.56 | 23.06 |
| First train | 22.96 | 22.09 | 23.66 | 23.16 |
| First shop open | 24.58 | 23.83 | 26.26 | 24.77 |
| Town visit | 25.68 | 25.0 | 27.33 | 26.27 |
| 5 shops | 37.89 | 34.87 | 40.60 | 39.71 |
| v3 complete | 39.5 | 38.2 | 42.3 | 40.0 |
| Rank bars full | 37.91 | 34.88 | 40.6 | 40.75 |
| **Rank 읍** | **48.83** | 47.50 | 51.50 | 48.17 |
| Longest gap after tower_east (min) | 2.30 | 2.19 | 1.90 | 7.07 |
| Stuck / errors | 0 / 0 | 0 / 0 | 0 / 0 | 1 / 0 |

- "smart (final code)" is a last run with everything in this report (fish pile, flower stands, the residency leak fix, view culling); the other three ran with the final balance before those polish changes, which do not touch the economy.
- The arrow bot's one stuck event is at 16.7 min, before v4 (behind an obstacle on its way to the hunt zone pad); it moved on.
- The longest gaps (smart 2.2–2.3 min, arrow 7.1 min) are the wait for the 14000 coins after the bars are full; the arrow bot does few standing orders.

## Tests
| Suite | Result |
|---|---|
| `smoke.mjs` | 53/53 |
| `v3.mjs` | 18/18 (one run of five failed "warehouse takes overflow" — 0 items in 150 s; 3 reruns green; the check now prints what the warehouse porters were doing) |
| `labour.mjs` | 28/28 |
| `dog.mjs` | 15/15 |
| `life.mjs` | 14/14 (7 runs after the snowball / tag fix below: 7 green) |
| `zoom.mjs` | 11/11 |
| `town.mjs` | 17/17 |
| `rail.mjs` | 33/33 |
| **`v4.mjs`** (new) | **40/40**: rail strip + ruin, porter deliveries to the station site, first train, visitors buy, order board, cargo pays 70 % into 역 금고, founding (founder by train, 25 s build, ribbon, auto-open after 90 s), rent, restock, invitation + visit flag, carpenter house +4, rank bars → pad → ceremony → cobble / coach / newcomers, anti-softlock rules, the whistle steps up over labels, a full v4 save ≤ 6 KB / ≤ 2 ms (5.7 KB, 0.2 ms), reload mid-game |
| **`save_v4.mjs --browser --v35 <v3.5 build>`** (new) | **51/51**: real v3.5 saves at 0.5 / 12 / 21 / 38 min load with nothing lost (past `tower_east` they get the rail strip and the ruin), saved again as v5; 20 corrupted v4 blocks boot; reload mid-founding / mid-train / mid-ceremony; idle income over 120 s within ±6 % of the v3.5 build (2459 vs 2401) |
| `save_v2.mjs` / `save_v3.mjs` / `save_v35.mjs` `--browser` | 16/16, 26/26, 25/25 |
| **`roadnet.test.mjs`** (new, node) | 32/32 |
| `v4_layout.mjs` | ok (40 objects, 12 streets, 79 walk nodes) |
| `balanceCheck` on the shipped balance | 0 warnings |
| **`texbudget.mjs`** (new) | 10/12 — the two misses are the 300 MiB targets (see below); every must passes |
| `v4a_perf.mjs` | 7/7 (draw calls now a real gate) |
| **`shots_v4.mjs`** (new) | 20 Korean shots + 4 English HUD shots, 0 errors, 0 placeholders |
| `shots_v35.mjs` | 36 shots, 0 errors, 0 placeholders |
| `review_robust_soak.mjs 600 --v4 --norender` | see Soak |
| `test_deploy.mjs standalone --quick` | PASS |

## Perf and memory

### Texture memory (`tools/test/texbudget.mjs`, source-sum MiB; GL probe agrees within 1.4 %)
| Scene | Before (v3.5 way) | v4 | Must | Target |
|---|---|---|---|---|
| Title | 88 | 88.5 | — | 90 |
| New game | 425 | **191** | 368 | 240 |
| v3.5 village complete | 517 | **322** (settles at 275) | 455 | 300 |
| Full v4, plaza | 698 | **325** | 455 | 300 |
| Full v4, heaviest moment of the tour | 719 | **385** | 455 | 300 |
| Back at the plaza after the tour | — | 327 (start 325: no growth) | start + 5 | — |

- What got it there: atlases packed into pages (`tools/build/pack_pages.py`, `assets/_packed/`, 93 pages), loaded by area and evicted when the camera is far (`Residency.js`, area TTL 10 s); residents' social pages on demand (cap 5, TTL 30 s); townsfolk social poses on demand; the ground as a pool of 512 px tiles at three zoom levels instead of whole-world canvases; `disablePreFX` (Phaser's FX pipeline kept 72 render targets, ≈ 75 MiB).
- Render targets left: 30 MiB (the renderer's own screen buffers). GL total peak 420 MiB (must 455).
- **The 300 MiB target is missed after the village is complete** (322 at v3.5 complete, settling at 275; 325 on the plaza with all of v4; 385 at the heaviest moment). The must (455) holds everywhere, with ≥ 34 MiB to spare. Next candidates: the always-resident v3 building atlases (`props_buildings` 2.9 MPx, `bld_buildings` 2.8, `bld_buildings_2` 2.3, `boat_fishing` 2.0 — about 40 MiB) by area too, and townsfolk loco pages per age group.

### Perf gates (`tools/test/v4a_perf.mjs`, fixed-step bench, SwiftShader)
| Gate | Threshold | Result |
|---|---|---|
| Logic per tick, plaza, full v4 (median) | ≤ 1.6 ms | 0.8–1.0 ms |
| Logic per tick, town at noon (median) | ≤ 2.1 ms | 1.1–1.8 ms (1.8 with other suites running) |
| Town sim | ≤ 0.35 ms | 0.10–0.24 ms |
| Draw calls per frame (plaza with visitors, town morning / noon / dusk / night, crowd, zoom 0.6, overview) | ≤ 12 | **5–10** (13–22 before view culling) |
| Full frame at town noon (median, SwiftShader) | — | 11.3–14.0 ms with culling, 16.3 ms without |
| Display objects (excluding pile items) | ≤ 1700 | plaza 1572, town night 1740, overview 1789, **noon 2257, crowd 2401, zoom 0.6 2489** |
| Uploads | ≤ 1 page / 100 ms, none > 8 MiB | rate met (≤ 0.25 per frame; `v4.tex.uploadsPerSec` 10). Social and town pages are ≤ 1.3 MPx (5 MiB), but **three v3 atlases reloaded when the chief comes back from the town are 8.1–11.3 MiB** (`bld_buildings`, `bld_buildings_2`, `boat_fishing`): not met |
| Save | ≤ 6 KB, ≤ 2 ms | 5.7 KB, 0.2 ms |

- **View culling (new, `src/systems/Culler.js`).** Phaser draws everything on the display list wherever it is; with the v3 village, the rail strip and the town in one list a frame touched ≈ 100 textures and flushed the batch every 16 (17–22 draw calls). Right before each drawn frame, pictures and labels more than 300 px outside the view (and the zoom the camera is gliding to) are taken out of the draw through their camera filter; the game's `visible` flags are never touched. Draw calls are now 5–10, texture binds per frame about halved, and a whole frame in the town got faster (the pass costs 0.2–0.9 ms; Phaser no longer transforms and batches ~1000 off-screen quads). The decision runs in the scene's PRE_RENDER, so a pooled picture that moves into view (a flying item, an effect, a ground tile) is never a frame late.
- **Display objects are over the 1700 asked for in the town** (2257 at noon, 2489 at zoom 0.6): about 60 paper dolls on screen at once, 8–12 images each. Logic per tick still passes with margin (town 1.2 ms median vs 2.1), so it is logged, not fixed.

### Soak (`review_robust_soak.mjs 600 --v4 --norender`: 5 shops, 3 houses, 읍, 10 min of game time at ~59 fps)
- **A leak found and fixed:** Phaser's `anims.remove()` only unlists an animation; its `pauseall` / `resumeall` listeners and frames stayed. Every resident social page evicted and loaded again (≈ 20 a minute in a busy village, cap 5 pages) left about 30 animations behind: +2300 listeners and +2.8 MB heap a minute (37 → 65 MB in 10 min). `Residency` now destroys the animations it drops.
- After the fix, 10 game minutes: heap after GC 31.9 → 35.2 MB (flat from minute 4: 34.9–35.5), animation listeners 2800 ± 30, JS listeners 760–920 with no trend, display list 1900–2580 (plateau ≈ 2450, it follows the visitors), timers 0–13, tweens 13–33, live sounds 6–20, 11 trains, 0 errors, 0 warnings.
- The same soak with rendering (SwiftShader at 1.4 fps under load) only covered ≈ 40 game seconds; it showed the flower-stand placeholder warning (fixed, see above) and nothing else.

## Artifact
- `node tools/build/build_artifact.mjs --webp --mp3-only`: **471 files, 53.46 MB, 2 publishes (250 + 220)**; the boot files are in the last batch. 50 small page frame lists (690 KB) travel inside `_packed/index.json` instead of as files (521 → 471: the limit is 511 per version).
- `node tools/build/test_deploy.mjs standalone --quick`: PASS — title in 1.9 s (WebGL), village, music and ambience after the title, audio unlocked, no placeholder art, fishing at the net, reload keeps progress, no errors, no failed requests (509 requests).

## Screenshots
- `docs/previews/screens_v4/` 01–19 + 16a (390 × 844, Korean): ruin, station site, first train, neighbours on 역 가는 길, doll customers, order panel, cargo into the wagon, founder, builders, ribbon, 역 금고 `+N/분`, the town welcome (banner), school out, dusk lamps, night town, rank panel, ceremony + chips, cobble street, zoom 0.6, overview. Looked at each one.
- English HUD set at 360 × 640: `06_orders_panel_360x640_en.jpg`, `11_till_360x640_en.jpg`, `16a_rank_panel_360x640_en.jpg`, `16_ceremony_chips_360x640_en.jpg`.
- `docs/previews/screens_v35/` 01–23 re-taken (fish pile moved; 21–23 new).
- `docs/previews/screens_v4/a_*.jpg` and `a_perf.json` from `v4a_perf.mjs`.

## Known issues
- **Texture target 300 MiB** missed after the village is complete (275–385 MiB; must 455 kept everywhere). See above.
- **Display objects** over 1700 in a crowded town view (2257–2489). Logic time and draw calls are within their gates.
- **Upload size:** coming back from the town reloads three v3 atlases of 8.1–11.3 MiB each (`bld_buildings` 2.8 MPx, `bld_buildings_2` 2.3, `boat_fishing` 2.0; gate: none > 8 MiB). They need splitting into smaller pages in `pack_pages.py` (the same split would also help the 300 MiB target).
- **Rank timing / gaps:** 읍 at 47.5–51.5 min across the bots (one smart run half a minute under the 48–55 band, the final one at 48.8); the smart bot's longest gap after `tower_east` is 2.2–2.3 min (gate 2.0) and the arrow bot's 7.1 min, both while saving the 14000 coins.
- **Title screen with a v4 save** (`src/title`, not this build): about 30 placeholder warnings while it shows a 읍 village (its diorama asks for v4 keys before they load). Reported, not touched.
- **Early request log** differs from v3.5 by design: the same pictures now come as packed pages (§11), so the first 20 minutes request page files instead of whole atlases. Gameplay and timings of the first 20 minutes are unchanged (bots: village complete 19.3 / 22.2 / 20.5 vs 20.3 / 23.0 / 21.7 in v3.5).
- **Social page churn:** with 24 residents chatting, about 20 social pages a minute are evicted and loaded again (cap 5). Each is one ≈ 1 MPx upload, within the uploads gate, but a looser cap would trade memory for fewer uploads.
- 16a: the "새 이웃 … 이사 왔어요" banner can sit over the open rank panel for a moment. The orange edge arrow can overlap the population badge (v3.5 behaviour).
- P1 nice-to-haves (§18 #12) not done.

## Changed files (BUILD-B)
- New: `src/systems/{Growth,Rank,RoadNet,RoadPaint,Culler}.js`, `src/core/Residency.js`, `src/entities/Shop.js`, `src/scenes/UIv4.js`, `tools/build/pack_pages.py`, `tools/test/{v4,save_v4,texbudget,shots_v4,roadnet.test}.mjs`, `tools/test/fixtures/v35_save_*.json`.
- Changed: `src/core/{Assets,Save,Townfolk}.js`, `src/data/{balance,balanceCheck,strings,world,version}.js`, `src/entities/{Character,Resident,Train,UnlockPad,Visitor,Worker}.js`, `src/main.js`, `src/scenes/{Game,UI}.js`, `src/systems/{Ground,Labour,Neighbours,Progression,Roads,TownSim,Tutorial,VillageLife}.js`, `tools/build/{build_artifact.mjs,webp_assets.py}`, `tools/test/{fv_step,pw,serve,review_gameplay_bot.js,review_gameplay_sim,review_robust_lib,review_robust_soak,shots_v35,smoke,v3,v4a_perf}.mjs`.
- Docs: `docs/기획서_v4_이웃마을.md` §8 (tables kept to the code), `docs/기획서.md` §4 (pointer), this report, `docs/build_reports/texbudget_v4.json`.

