# v4 build (BUILD-B): the neighbours' order board, new shops, rank 읍, roads, texture memory

## Build

v4 (`v4.0`) is built on top of BUILD-A (rail, train, 솔방울 마을, townsfolk). BUILD-B adds the station-square economy (order board, loading dock, 역 금고, station porters), the five founded shops with their builders and ribbons, the carpenter's houses, the rank 마을 → 읍 with its ceremony, the road network and road painting, the texture-memory work (packed pages, residency, pooled ground tiles), save version 5, the tutorial/progression hooks and the §18 polish backlog. The first 20 minutes are v3.5 unchanged; nothing of v4 loads before `tower_east`.

@@STATUS@@

## What was built

- **Order board (주문판) and loading dock (짐 싣는 곳).** Up to 3 cards. The five founding cards come first, each offered only once its producer exists (카페 after the farm, 식당 after the hunt, 목공소 after the forest, 철물점 after the toolsmith, 슈퍼마켓 after the cannery); after all five, 정기 납품 cards rotate. Anything a card needs can be dropped on the dock: each item pays **70 % of its price** into **역 금고**, a finished card pays a bonus (50 % of its value; 정기 납품 30 %, 50 % after 읍). A card nobody touched for 180 s can be swapped. Crates fly into the goods wagon when the train stands at our station.
- **Founding.** A finished card reserves its lot; the next train brings the founder and two builders, who walk to the lot; 25 s build (scaffold, hammering), then a **ribbon** pad (free, 1 s; opens by itself after 90 s). Banner "역앞 카페 개업!", rent `+20/분` on the till. The founder's household (2) moves into the station district. The first opening brings the mayor's invitation (town opens; fallback 480 s after the first train).
- **Open shops.** Each sells our goods to visitors and to the town (one item per 40 s), and is restocked from our village at the wholesale price (station porters or the chief). Rent ticks into 역 금고 (cap 2000).
- **Station porters (역 짐꾼, 600 / 1100).** Carry surplus (outputs ≥ 60 % full, the warehouse) to the remote sinks: dock, shop shelves, house sites. Items an open *founding* card needs are taken from an output as soon as 4 are there (`v4.stationPorterFoundingMin`), so a 슈퍼마켓 card no longer waits behind the general store's can porter. Regular porters never walk to the station.
- **Carpenter's houses.** With the 목공소 open, house lots H1–H3 take 20 planks each → 30 s build → a townhouse and 4 new neighbours (4 more lots at 읍).
- **Happiness.** 50 + 50 × mean satisfaction of the last 40 visitors (never below 50).
- **Rank 마을 → 읍.** HUD rank chip with three bars (people 45, shops 5, happiness 70) and a panel; when all are full, the **승격식** pad appears on the station square (now **10000** coins, was 3000 — see Balance). The 12 s ceremony (skippable after 3 s): bells, confetti, the badge flying to the HUD, the main street repaved to cobble tile by tile, three new streetlights, a second coach, 20 newcomers to the town (120), new house lots, auto-collect of 역 금고 every 15 s, title 읍장.
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
4. Fish barrel / log pile nudged clear of the sleigh and the pines — fixed.
5. Faint line across the sea in the overview — @@SEA@@
6. The whistle button steps up (110 / 220 px, glides) when a pad or plot label would sit under it, never into the HUD chips — fixed (`v4.mjs` §9 checks it).
7. Shots 21–23 now come from `shots_v35.mjs` (21 a pad under the chief, 22 a full pile, 23 the meat rack) — @@SHOTS35@@
8. Unused v3 `Smith` class removed from `Workshop.js` — done.
9. Portraits packed by `pack_pages.py` — done (artifact: @@ARTIFACT_BATCHES@@).
10. `기획서.md` §4 points to `balance.js` and the v3/v4 tables — done.
11. `porterCapacity` 14 / `spawnEveryLate` 1.3: v3 complete measured at @@V3TIMES@@ with v4 income — not under 36 min, so **unchanged**.
12. P1 nice-to-haves (chief rides the train, citizen name card, house window glows, night patrol) — not done.

Also fixed on the way: the loading-dock and 역 금고 labels overlapped (moved apart, `world.js` `v4.square.labels`); a visitor crashed when a founded shop was its first target; ground tiles left a sea-coloured strip in fixed-step screenshots (test helper now bakes for the real camera before a shot).

@@REST@@
