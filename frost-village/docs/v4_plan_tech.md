# v4 technical + gameplay plan — engineering & performance first

Version 4 "솔방울 마을" (neighbour town): ~100 townsfolk with daily routines, a snow train between two stations,
townsfolk shopping at our stations, shops founded around our station quarter, village rank 마을 → 읍, and a
vehicle-ready road structure for v5. Design sources: `docs/기획서_v4_이웃마을.md`, `docs/기획서_v5_생활과미션.md`
§1 + §5, `docs/CONTRACT_V4.md` §J–K, asset reports `town / townfolk / townfolk2 / roads_ui / vehicles / life2`.

This plan changes no code. Every number is either **measured** (current repo, scripts in my scratchpad
`.../scratchpad/v4_tech/{texmem,budget,layout}.py`) or marked **estimate**.

---

## 0. Summary

1. **Memory comes first.** v3.5 already holds 368–455 MiB of textures (Phaser source-sum, the same probe the
   v3.5 reviewers used). Adding the town naively adds about 175 MiB: town 56.6 + townfolk 104.7 + roads 11.7.
   **Hard budget for a full v4 save: 256 MiB in any view on high tier, 176 MiB on low tier, 210 MiB for a new
   game's first 20 minutes, transient peak 288 MiB for at most 10 s.** Five changes get there: an asset
   compiler that splits atlases into pages, a texture **residency manager** (reference counts, region
   residency, LRU eviction, half-res tier), a pooled ground canvas, region hysteresis, and destroying textures
   nobody uses. Estimated residency after these changes: village view 244, town view 220, zoomed out 193,
   new game 202 (§8.4).
2. **The world grows east, parallel to the coast.** World size goes from 3000×3450 to **8704×5120**. Three
   regions are added: `woods`, `town` and `wild_s`. The snow train runs on **one straight line along world X**
   (no curved rail art exists). Track equation: `y = 0.5·x − 75`. It runs parallel to the sloping east coast,
   about 8.5 cells (≈12 m) inland. The village station is at (3329, 1460); the town station at (6977, 3284).
   The same line extends later to the v6 harbour and the v7 beach.
3. **One road lattice for everything new.** Grid origin G = (6592, 3221), with the roads-kit lattice
   P(i,j) = G + (64(i+j), 32(i−j)). A new `RoadNet` holds street cells by class (dirt/cobble/asphalt),
   lanes, sidewalks, intersections and level crossings. It exports a walk graph that merges into the existing
   `Roads.js` A*, and a right-hand lane graph with turn connectors for v5 vehicles (unit-tested in v4).
4. **Townsfolk simulation with logic for everyone and sprites only near the camera.** People are stored as
   struct-of-arrays and woken by an event heap on a 600 s day clock. Walkers far from the camera follow their
   route analytically (no per-frame work). Up to 32 pooled paper-doll rigs are used on screen (16 on low
   tier), with a 4-layer "lite" rig and overview dots. Target town-sim logic cost: ≤ 0.35 ms per frame on the
   bench machine.
5. **Paper-doll runtime.** `tools/townfolk_compose.js` is ported to `src/core/Townfolk.js`. A duck-typed
   `DollSprite` lets the existing `Character`, `Customer` and `Bubbles` code drive dolls unchanged. Frame
   objects are cached and refreshes allocate nothing. From townfolk2 only the 6 head override frames are
   loaded; the merge path is kept behind a flag for v5.
6. **Customers stay hybrid.** Real simulated townsfolk ride the train in groups of 8–16. On top of that,
   anonymous doll-look customers keep v3.5's market throughput, so no v3.5 player loses income. After the town
   opens, most customers look like townsfolk, as the designer asked.
7. **Save v5** (from save v4): new `clock`, `town` (people stored as seeds, not looks), `shops`, `rank`.
   Regions `woods` and `town` are added and `station_v` becomes a site building. The migration only adds
   blocks. People in transit at save time wake up at home.
8. **Early game unchanged.** The town gate defaults to `b:toolsmith` (after the village is complete). Before
   the gate no v4 system ticks, apart from a dormant clock with no visuals. The bots' timings must stay within
   ±5 % of v3.5.
9. **Reserved for the designer's beach and sea request (v7).** 8 MiB of the core budget is set aside for the
   new `Water.js` textures. The coast geometry stays a single parallel line so shore foam and shore types can
   be added later. `Water.js` and the v7 folders are not touched or imported.

---

## 1. Baseline (measured, current repo)

| What | Value | Source |
|---|---|---|
| Textures at title | 88 MiB | v35_build robust review (firstvisit) |
| Textures, new game after lazy load gate | 368 MiB | v35_build fix table |
| Textures, full v3.5 village | 441–455 MiB | soak_step.json (`texMB` 447/455) |
| of which file textures (atlases) | 369.4 MiB | `/tmp/fv_review_v35/robust/texmem.py` on current assets |
| of which canvases | ≈ 72 MiB measured gap (441 − 369); up to 77 MiB when everything is baked: ground tiles 12×4 MiB = 48, zone floors 10.7, road overlays 18.5 (the se overlay alone is 10.7) | computed from world.js (`fv_ground_*`, `fv_floor_*`, `fv_roads_*`) |
| Villager atlases (villagers + 2 + 3) | 198 MiB for 38 atlases, 4.6–8.3 MiB each, 91 % packed | texmem + fill analysis |
| Share of a villager atlas by anim | idle+walk+sit 17–27 %, carry 11–16 %, the rest are social anims (talk/laugh/wave/angry…) | per-frame area analysis |
| Worker atlases | 3.5–4.6 MiB each (loco 36 %, carry 36 %, work 28 %) | same |
| v4 art not loaded yet | town 56.6, townfolk 104.7, townfolk2 72.6, roads 11.7, ui3 1.5, vehicles 140.4 (v5), life2 4.5 (v5) MiB | texmem |
| Townfolk area by anim | walk 20.6 %, carry_walk 20.5 %, talk 12.8 %, idle 10.0 %, happy 9.7 %, wave 9.7 %, head poses 16.8 % (loco 4.9 %) | tf JSON analysis |
| Logic per frame (bench, full village) | v3 1.14 ms, v3.5 1.24 ms; bench p50 1.1–2 ms on the loaded machine | v35 robust review |
| Draw calls per frame | 4–6 (plaza, overview) | `/tmp/fv_review/robust/drawcalls.json` |
| Display list | 990 → 1816 objects (849 are pile item images) | soak_step |
| Save size | ≈ 3.5 KB, 0.07–1.3 ms to write | soak |
| Artifact | 338 files (2 publishes), 32.2 MB | dist/artifact_files.json |

---

## 2. World extension and the town region

### 2.1 World and regions (`src/data/world.js`)

```
WORLD.width  = 8704      // was 3000   (17 ground tiles of 512)
WORLD.height = 5120      // was 3450   (10 tiles; max depth y 5120 << DEPTH.FLY 30000)
territory: {
  start: [0, 0, 1800, 2620],  east: [1800, 0, 3000, 1500],             // unchanged
  south: [0, 2620, 1800, 3450], se: [1800, 1500, 3000, 3450],          // unchanged
  woods:  { rect: [3000, 0, 4600, 3450], open: 'rail_open', name: 'r_woods', center: [3500, 1650] },   // 철길 숲
  town:   { rect: [4600, 0, 8704, 5120], open: 'b:station_v', name: 'r_town', center: [6700, 3600] },  // 솔방울 마을
  wild_s: { rect: [0, 3450, 4600, 5120] },     // stays fogged in v4 (reserved; covers the map so regionAt() never falls back to 'start')
}
```
- **Shared edges become walkable bridges.** `woods`/`east` share x = 3000 for y 0–1500; `woods`/`se` for
  y 1500–3450; `woods`/`town` share x = 4600. `Territory.walkRects()` already turns shared edges into
  bridges, so no new code is needed.
- **No watchtowers for these regions.** `woods` opens with the `rail_open` pad and `town` opens when the
  village station is finished (§7.1). `Territory.reveal(id)` is reused unchanged: the clearing, the camera
  pan, the banner, and the region's `objs` popping in.
- **Coast.** `shoreY(x) = 372 + 0.5·(x − 1990) + waves` for x > 2100, i.e. `0.5·x − 623 ± 26`. It keeps
  sloping across the new land: about y 1677 at x = 4600 and about y 3729 at x = 8704. The sea tileSprite
  grows to 8704×(maxShore + 240). It is still one quad, and the v7 `Water.js` replaces it later.
- **Collision grid:** 55×33 cells of 160 px, 1815 cells. **Shore cache:** 1089 floats. Both are trivial.

### 2.2 Road lattice, main line, coast (exact)

- **Lattice (roads kit, `assets/roads/manifest.json` roadKit):**
  `P(i, j) = G + (64·(i + j), 32·(i − j))` with **G = (6592, 3221)**. A cell is √2 m. Cell (i, j) has its min
  corner at P(i, j). For new roads, carriageway edges and centre lines sit on even lattice lines.
- **Main rail line = lattice line j = 0:** `y = 0.5·x − 75`. Rail tiles `rail_x` sit at P(i+0.5, 0), stepping
  (64, 32). Buffer stops are `rail_x_end_n` at i = −55.5, i.e. (3040, 1445), and `rail_x_end_p` at i = 27,
  i.e. (8320, 4085); in v6 the line is extended instead.
- **Coast clearance.** Moving one cell in +j shifts `y − 0.5x` by −64 px. The track is 548 px below the mean
  coast, so land is usable up to j = 6 (164 px from the shore line, more than the 46 px no-walk margin plus the
  26 px wave amplitude). This holds along the whole line because track and coast are parallel.

| Key point | lattice (i, j) | px | region |
|---|---|---|---|
| Village station track point | (−53, 0) | (3200, 1525) | woods |
| Village station anchor (`train_station`, trackPoint offset [−130, 65]) | (−53, 2.03) | (3329, 1460) | woods |
| Station-quarter level crossing (S1 × rail) | (−42, 0) | (3904, 1877) | woods |
| Town station track point | (4, 0) | (6848, 3349) | town |
| Town station anchor | (4, 2.03) | (6977, 3284) | town |
| Main-street level crossing (R1 × rail) | (12, 0) | (7360, 3605) | town |
| Grid corners left / right / bottom | (0,−30) / (26,2) / (26,−30) | (4672,4181) / (8384,3989) / (6336,5013) | town |

**Ride length:** 57 cells = 80.6 m from i = −53 to 4. At the art's 2.6 m/s (≈166 ground px/s; the `move`
loop covers 1.7 m) one leg takes about 35 s including acceleration and braking (§4).

### 2.3 Village side: link road + station quarter (founded shops)

The east region is fully used (plots e_m1/e_m2/e_dock, the se tower site at (2870, 1370), the east forest),
so the village station sits just across the border in `woods`.
- **Link road** (v2 polyline graph, dirt, drawn): `e_east (2560,1180)` → new node `rail_w (2960,1250)` →
  `stn_v (3190,1395)`, which is the village station's doorPoint area. It passes 136 px above the tower_se
  site, 272 px in ground distance, which is clear of its collision radius of about 62.
  - The road edge gets `region: 'woods'` and is drawn once woods opens.
  - The border trees `[2880,300,3000,1500,'east']` already skip drawn roads.
- **R0, the coastal track** (grid, dirt, 1 lane, 2 cells): ROAD j ∈ [4, 6), i from −56 to 1, running from
  the village station to the town station plaza. This is also the walking route for the chief.
- **Station quarter** (where shops are founded "around our village", plan §3). It sits south of the track,
  reached over a level crossing:

| Street | Definition | Class |
|---|---|---|
| S1 역전길 | along world Y, I = −42: ROAD i ∈ [−44, −40), j −10…6; crosses the rail at j ∈ [−1, 1) (`rail_x_crossing`); joins R0 | cobble (dirt until 읍) |
| S2 상가길 | along world X, J = −8: ROAD j ∈ [−10, −6), i −46…−30 | cobble (dirt until 읍) |

| Lot | Founded shop (art key) | lattice centre | px anchor |
|---|---|---|---|
| lot_1 | supermarket (canned goods) | (−46.4, −3.3) | (3411, 1841) |
| lot_2 | restaurant (cooked fish / smoked meat) | (−38.7, −3.5) | (3891, 2094) |
| lot_3 | hardware_store (ingots / tools) | (−36.2, −3.5) | (4051, 2174) |
| lot_4 | carpenter_workshop (planks) | (−33.5, −3.5) | (4224, 2261) |
| lot_5 | cafe (bread) | (−31.0, −3.5) | (4384, 2341) |

All shop sprites have their door on the −j face, so lots sit on the north side of X-streets. My layout
checker found no overlaps, no road cells under any lot, everything inside its region, and coast clearance
satisfied.

### 2.4 Town plan (lattice; every building verified by `layout.py`)

Streets (fed to RoadNet as `WORLD.grid.streets`):

| id | axis / line | cells | from…to | v4 class | sidewalks |
|---|---|---|---|---|---|
| rail | x, J = 0 | j ∈ [−1, 1) | i −55.5…27 | rail | — |
| R0 해안길 | x, centre j = 5 | j ∈ [4, 6) | i −56…1 | dirt, 1 lane | no |
| R1 솔방울 큰길 | y, I = 12 | ROAD i ∈ [10, 14), WALK i = 9, 14 | j −30…6 (crossing at rail) | cobble → asphalt in v5 | yes |
| R2 시장길 | x, J = −8 | ROAD j ∈ [−10, −6), WALK j = −11, −6 | i −8…26 | cobble | yes |
| R3 집길 | x, J = −18 | j ∈ [−20, −16) | i −8…26 | cobble | no |
| R4 남쪽길 | x, J = −28 | j ∈ [−30, −26) | i 0…26 | dirt | no |
| R5 서쪽길 | y, I = 2 | i ∈ [0, 4) | j −30…−2 | cobble | no |
| R6 동쪽길 | y, I = 24 | i ∈ [22, 26) | j −30…−2 | cobble | no |
| platform path | x | j ∈ [1, 2) | i 9…26 | walk only | — |

Buildings (anchor = footprint centre = P(ci, cj)):

| id | art key | (ci, cj) | px | role |
|---|---|---|---|---|
| t_station | train_station | (4, 2.03) | (6977, 3284) | station, 2 staff |
| t_police | police_box | (−0.3, 2.6) | (6739, 3128) | police (night shift visible) |
| t_fountain | park_fountain | (7.9, 3.6) | (7328, 3358) | station plaza / park |
| t_restaurant | restaurant | (16.4, 3.1) | (7840, 3646) | lunch, shop |
| t_hair | hair_salon | (18.9, 3.1) | (8000, 3726) | shop |
| t_clinic | clinic | (21.5, 3.15) | (8169, 3808) | doctor / nurse |
| t_fire | fire_station | (24.75, 3.3) | (8387, 3907) | firefighters (v5 truck) |
| t_cafe | cafe | (5.2, −3.5) | (6700, 3499) | barista, lunch |
| t_book | bookstore | (7.7, −3.5) | (6860, 3579) | shop |
| t_flower | flower_shop | (16.1, −3.5) | (7398, 3848) | shop |
| t_toy | toy_shop | (18.3, −3.5) | (7539, 3918) | shop |
| t_cloth | clothing_store | (20.54, −3.5) | (7682, 3990) | shop |
| t_school | school | (6.5, −13.4) | (6150, 3857) | teachers + all children |
| t_hall | town_hall | (17.2, −13.5) | (6828, 4203) | mayor / clerks (v5 weddings) |
| t_post | post_office | (20.6, −13.3) | (7059, 4305) | postal workers |
| t_play | playground | (−1.6, −13.6) | (5619, 3605) | kids after school |
| t_aptb2 | apartment_b | (−5.4, −13.9) | (5356, 3493) | 14 people |
| t_th_w1..3 | townhouse_b/c/d | (−6.4/−4.0/−1.6, −3.6) | (5952,3131) (6105,3208) (6259,3285) | 5 each |
| t_apta1 | apartment_a | (6.5, −24.7) | (5427, 4219) | 18 |
| t_th1, t_th2 | townhouse_a/b | (5.3/7.7, −21.6) | (5548,4081) (5702,4158) | 5 each |
| t_aptb1 | apartment_b | (16.6, −24.7) | (6073, 4542) | 14 |
| t_apta2 | apartment_a | (20.2, −24.7) | (6304, 4657) | 18 |
| t_th3..5 | townhouse_c/d/a | (16.1/18.5/20.9, −21.6) | (6240,4427) (6393,4504) (6547,4581) | 5 each |
| t_res1, t_res2 | reserve lots (carpenter growth) | (−1.6/−4.0, −22.4) | (5056,3887) (4902,3810) | +5 each |

Capacity: 2×18 + 2×14 + 8×5 = **104 beds**, rising to 114 with the reserve lots and 120 at rank 읍
(balance `town.maxPeople`). Street props are placed from `WORLD.town.props` ([key, i, j] in lattice units;
streetlight every 6 cells on R1/R2, bench_x/bench_y at the fountain and playground, sled_stop at the R1×R2
corner, `town_gate` on R1 at j = −30 and `town_gate_x` on R0 at i = −2).

### 2.5 New world.js blocks (Korean comments for the designer)

```js
// ── (v4) 길 격자: 새 길·철길·이웃 마을은 모두 이 격자 위에 놓여요 (한 칸 = √2 m = (64,32) px)
grid: { G: [6592, 3221],
  streets: [ { id: 'R1', name: 'st_main', axis: 'y', line: 12, from: -30, to: 6, cls: 'town', walk: true, region: 'town' }, … ] },
// ── (v4) 눈썰매 기차: 철길은 j=0 한 줄, 역은 칸 번호 i 로 적어요
rail: { j: 0, from: -55.5, to: 27, stations: { v: { i: -53, region: 'woods', site: 'v_station' }, t: { i: 4, region: 'town' } },
        crossings: [ { i: -42, street: 'S1' }, { i: 12, street: 'R1' } ] },
// ── (v4) 이웃 마을 건물: [이름, 그림, i, j, { people / jobs / role }]
town: { buildings: [ ['t_school', 'school', 6.5, -13.4, { role: 'school', jobs: { teacher: 3 } }], … ], props: [ … ] },
// ── (v4) 가게가 생기는 땅 (역 앞 상가)
shopLots: { lot_1: { i: -46.4, j: -3.3, kind: 'can', art: 'supermarket' }, … },
```
Plots: `v_station: { x: 3329, y: 1460, size: 'XL', region: 'woods', after: 'rail_open', only: 'station_v' }`.
`XL` is two `site_plot_L` stage sprites placed ±1.8 m along X; it is the only change in `Site.js`.

### 2.6 Territory, camera, overview

- **Fog** only needs its rect and exposed-edge logic. The wide `town` rect gets one fill Rectangle plus
  billows along its exposed left edge (x = 4600). No new art.
- **Overview ("전체 보기") frames the chief's cluster** instead of the whole map:
  - Clusters are village (start/east/south/se), rail (woods) and town.
  - The cluster fit zoom is about 0.25–0.37; a whole-map fit would be about 0.09.
  - A second tap shows the whole map from the overview canvas (§8.3c).
  - This keeps overview memory bounded (§8.4 D).
- **`Game.viewRect()` drives three things:** ground baking, residency (§8), and doll materialization.

### 2.7 Reserved for later versions (no code in v4)

- **v6 harbour.** The j = 0 line continues SE past `rail_x_end_p`, and the town station becomes a through
  station. The coast keeps its 0.5 slope, so a harbour station on the same line is still about 8.5 cells
  inland at x ≈ 9000+. The world width grows then.
- **v7 beach** (the designer's request "바다물도 진짜처럼… 해수욕장… 상가와 호텔"):
  - The beach goes further SE on the same coast.
  - `Ground.js` keeps the sea as one replaceable layer, and the shore stays a single `shoreY()` function,
    which is what the Water.js integration steps expect.
  - 8 MiB of the core texture budget is held for Water.js normal, foam and caustic maps.
  - The beachfolk paper-doll fragment will reuse this plan's doll runtime and residency pages unchanged
    (same compact atlas format).

---

## 3. Vehicle-ready road network (`src/systems/RoadNet.js`, new; pure JS, Node-testable)

### 3.1 Data model
```js
cells: Map<int key = (i+512)*1024 + (j+512), { t: ROAD|WALK|RAIL|XING, street: idx, cls: 0 dirt|1 cobble|2 asphalt }>
streets: [{ id, axis:'x'|'y', line, from, to, cls, lanes: 1|2 (each way), walk: bool, region, upgradeTo }]
nodes:   Float32Array x,y + meta [{ id, i, j, kind: 'junction'|'end'|'bend'|'xing'|'door', streets:[…] }]
edges:   [{ a, b, street, lenM, cls, lanesEach, walk, region, xing: crossingIdx|-1,
            laneOff: [+1.0, -1.0] cells (right-hand: travel +axis uses the lane right of the centre line),
            walkOff: walk ? ±(laneCells*lanes + 0.5) : ±(laneCells*lanes − 0.25) cells }]
lanes (v5): directed lane edges { from, to, edge, dir: +1|-1, offPx, speedLimit } + connectors at junction nodes
            { inLane, outLane, turn: 'S'|'L'|'R'|'U', polyline (quarter-circle on the lattice), conflicts: [connectorIdx] }
            traffic control per node: 'none' | 'yield' | 'lights' (traffic_light sprite + phase plan, v5)
doors:   building door → shortest spur to the nearest walk edge (precomputed, cached)
```
Junctions are generated where two streets' road cells intersect; T-ends and dead ends too.

### 3.2 Walk graph merged into `Roads.js`
`RoadNet.walkGraph()` emits nodes `g:<id>` and edges in the existing `{ nodes, edges }` format. The edges
carry `region`, `walk` and `xing`. Pedestrians walk sidewalks when `walk`, otherwise the carriageway edge.
Changes to `Roads.js`:
- `addGraph()` merges the walk graph into the existing village graph.
- A* switches from the linear-scan open list to a binary heap.
- Path cache key becomes `a * 65536 + b` (more than 4096 nodes possible later).
- `nearestK` uses a 256 px bucket grid instead of an O(N) scan.
- New `edgeBlocked(e)` hook: a level crossing returns true while the train is within ±6 m of it. Followers
  stop at the crossing's stop point and wait instead of re-routing.

Estimated graph size: village 45 nodes + grid ~140 junction and bend nodes + ~45 door spurs ≈ 230 nodes.

### 3.3 Pathfinding API (one entry point for pedestrians now and vehicles in v5)
```js
roads.route(ax, ay, bx, by, out, { mode: 'walk' })                    // existing signature, unchanged default
roadNet.route(from, to, { mode: 'walk'|'drive', vehicle, avoid: Set(edgeIds), out })
  -> { pts: Float32Array, cum: Float32Array, edges: Int32Array, xings: Int32Array, lenM }
roadNet.stopLine(edge, dir) / roadNet.laneCentre(edge, dir, t) / roadNet.connector(inLane, outLane)
```
Drive mode runs A* over lane edges plus connectors, with a cost of lenM / speedLimit plus turn penalties
(U-turns only at dead ends). v4 ships drive mode with unit tests only; v5 adds `Vehicle.js` on top.

### 3.4 Painting (`src/systems/RoadPaint.js`, new)
`Ground.bakeChunk()` calls `RoadPaint.paint(ctx, x0, y0, w, h)` for grid cells intersecting the tile:
- **Textures** per class, filled per cell with the pattern origin at G and scale 1 (roads kit rule):
  `road_dirt`, `road_dirt_y` and `road_dirt_cross`; `road_cobble_wide`; `road_asphalt`; `sidewalk`.
- **Decals**, following the kit's edge, corner and marking rules:
  - snow edges, curbs and corners;
  - `lane_*` and `crosswalk_*` markings (city class only);
  - rail tiles, which are ground decals and are baked too, not 160 sprites.

The algorithm is a JS port of `tools/fx/gen_roads.py compose()`. A rank-up upgrade (dirt → cobble) changes
`cls` and marks the affected tiles dirty, and they re-bake when next visible. The roads atlases are a
**bake-only** residency class (§8.3): loaded while a tile with grid roads bakes, evicted 10 s after.

---

## 4. Rails and the train (`src/systems/Rail.js`, new)

- **Geometry.** `RailLine { j: 0, m0, m1 }`. Position is metres `m` along world X from the village buffer
  stop; screen position = P(−55.5, 0) + m · (45.25, 22.63). Stations sit at `m_v` (track point i = −53 →
  m = 3.54) and `m_t` (i = 4 → m = 84.15).
- **Consist** (town manifest `trainConsist`): engine anchor at m_e, car_a at m_e − 2.34, car_b at
  m_e − 4.58. The engine is always on the SE end (**push-pull**: no turntable or curve art exists).
  - Village → town: engine leads, heading SE, `move` anim forward.
  - Town → village: the engine pushes, still drawn heading SE, with a reversed anim key
    `train_engine:move_rev:SE` built once from the reversed frames.
  - Both stations' `trainStops` (engine SE of car_a, car_b furthest NW) then match without mirroring.
- **Art needed: SE frames only.** A straight X track only ever shows heading SE, so the asset compiler keeps
  only the SE frames and the SE shadow of the 3 train atlases: 16.6 → about 4 MiB.
- **Kinematics** (balance `train`): v_max 2.6 m/s, accel 0.6 m/s², brake 0.8 m/s², dwell 10 s. One leg of
  80.6 m: 4.3 s accelerating (5.6 m) + 27.2 s cruising + 3.3 s braking (4.2 m) ≈ 35 s, so a round trip with
  two dwells is about 90 s. The anim runs at
  `timeScale = v / 2.6`. The SFX already exist in audio3 (`sfx_steam_whistle`, `sfx_brakes`,
  `sfx_sleigh_bells`); no new audio.
- **Boarding.**
  - Waiting townsfolk stand at `waitPoints`. On arrival, alighting passengers appear at `boardPoints`.
  - Boarding passengers walk to a boardPoint, fade out (0.25 s), and are flagged `ON_TRAIN`.
  - Seats are counted, not drawn: `train.seats` is 16 in car_a.
  - car_b, the goods wagon, shows founded-shop wholesale orders as item stacks at `cargoPoint`, so the player
    sees goods leaving.
- **Level crossings.** `Rail.blocking(xing)` is true while any car is within ±6 m of the crossing, or the
  train will reach it within 3 s. `Roads.edgeBlocked` reads it, and pedestrians wait at stop points 1.2 m from
  the rail.
- **Always simulated (cost ≈ 0.02 ms).** Sprites exist only while the camera is within 900 px of the train.
  The train pages are a `regionBld` residency class tagged with both stations.
- **Riding.**
  - The chief can stand on the platform while the train dwells: a "기차 타기" pad at the boardPoints.
  - While riding, the camera follows car_a and the chief is hidden "inside", like passengers.
  - Walking along R0 (≈ 16 s at 255 px/s) stays possible.

---

## 5. Townsfolk simulation (`src/systems/Town.js`, new)

### 5.1 Data (struct of arrays, MAX = 192)
```js
id Uint16, seed Uint32, preset Int8 (-1 random | index of manifest presets), role Uint8 (CHILD|WORKER|ELDER|HOMEMAKER),
home Int16, work Int16 (building idx / -1), act Uint8, actPlace Int16, wakeT Float32 (clock minutes, absolute),
route Int32 (index into the route cache, -1 none), t0 Float32, speed Float32 (px/s, 60..90), lane Float32 (±0.3 m lateral),
x Float32, y Float32 (valid only when L1/L0), lod Uint8 (3 dormant | 2 analytic | 1 near | 0 materialised),
flags Uint8 (INDOORS | ON_TRAIN | IN_VILLAGE | VISITOR | NIGHT_SHIFT)
person[] (Townfolk person object; built lazily the first time the agent is materialised; never saved)
rig[]    (DollSprite | null)
```
- **Routes** are a cache `Map(fromPlace * 1024 + toPlace → { pts: Float32Array, cum: Float32Array, lenPx })`,
  built from door spur + walk graph + door spur. There are at most about 600 routes, about 60 KB in total.
- **Analytic position:** `pos(t) = route.at((t − t0) · speed)`, using a binary search on `cum`.

### 5.2 Day clock (`src/systems/DayClock.js`, new)
- `dayLength 600 s` (balance), so 1 game hour = 25 s. State is `t ∈ [0, 1)` plus a day counter, both saved.
- Phases: dawn 05–07, day 07–17, dusk 17–19, night 19–05.
- **Night tint** is one camera-sized Rectangle with `MULTIPLY` blend below bubbles and labels, max darkness
  0.35 (balance `dayNight.nightDark`).
- Lights at night are pooled additive glow images at `lightPoints`, `fxPoints.light` and streetlights; at most
  40 on screen.
- **Visual night only after the town opens** (balance `dayNight.startAfter: 'b:station_v'`), so the tutorial
  and the v3.5 game look exactly as before. Village residents keep their v3.5 behaviour in v4.

### 5.3 Schedules (balance `town.schedule`, in hours)

| Role | Day plan |
|---|---|
| CHILD (~22) | 07:30 walk to school → class 08–15, indoors except recess 10:00–10:20 and 12–13 in the yard (school `playPoints`) → 15–17 playground or fountain → 17–19 near home → 19 home → 21 asleep |
| WORKER (~48) | 07:30 commute → work 08–12 → lunch 12–13 (restaurant, cafe or home) → work 13–17 → 17–19:30 errand: a town shop (`customerPoints`) or a **village trip** → home → 22 asleep |
| ELDER (~18) | 09–11 park, cafe or post office → 11–13 village trip or shop → 13–15 home → 15–17 fountain benches → 17 home |
| HOMEMAKER (~12) | 09–12 shops → 13–17 village trip (higher chance) → 18 home |

- **Shopkeepers and staff stand outside** at `staffPoints` (the shops are closed boxes per the town report).
  That is what makes the town visibly busy.
- Police box: night shift. Station attendants are on duty whenever the train dwells.

### 5.4 LOD tiers (all logic, few sprites)

| Tier | When | Per-frame work | Visual |
|---|---|---|---|
| L3 dormant | indoors, on the train | none; woken by the event heap at `wakeT` | none |
| L2 analytic | outdoors, beyond view + 600 px | none; position computed on demand | none |
| L1 near | outdoors, within view + 600 px, off screen | integrate along the route; lane offset | none |
| L0 materialised | within view + 120 px | anim, separation (64 px spatial hash), bubbles, chats | DollSprite rig from the pool |

- **Rig limits:** at most 32 rigs on high tier, 16 on low (balance `perf.maxDolls`), nearest first.
  - Overflow, and everyone when zoom is below 0.7, uses the "lite" layer set: base body, top, bottom, head,
    hair (4–5 layers).
  - Below zoom 0.35 people are drawn as dots: one 16×24 tinted capsule.
- **Every 0.25 s** the ~100 outdoor positions are evaluated and tiers reassigned, with 60 px hysteresis.
- The event heap is a binary min-heap of `(wakeT, idx)`. About 100 people × 10 transitions a day ÷ 600 s
  ≈ 1.7 pops per second.

### 5.5 Visitors: the train → our stations (hybrid customer model)

The v3.5 market alone serves about 46 customers a minute in the late game (`spawnEveryLate` 1.3 s). A
100-person town cannot plausibly supply that by train, and income must not drop when the town opens.
1. **Real visitors.**
   - In the afternoon window, `tripChance` (0.3) per person, about 30 a day, takes 2–3 trains with 8–16
     visitors each.
   - On arrival at the village station each visitor becomes a `Customer` with a doll body (§6.3) and a
     shopping list. Targets are the market (foods), the general store (store goods) and founded shops.
   - Visitors use the existing queues. The new `market.enqueueVisitor(person, from)` routes them over the
     roads from the station.
   - When done they walk back, board the next train, and go home: the agent returns to L3 at home.
   - Visitors who can't be served in 90 s browse the plaza areas and then leave.
2. **Anonymous doll customers.**
   - After the town opens, `Market.customerKeys()` returns "doll" looks drawn from a pool of 32 seeded
     persons (never saved). They keep the existing off-screen road-node spawns and v3.5 spawn rates.
   - The visible result is that most customers are townsfolk.
   - `villager_a/b/c` (8.8 MiB) stop being used and are evicted (§8).
3. **The rule:** customer rate = max(v3.5 local rate, local + visitor arrivals), and visitors buy
   `town.orderBonus` (+1) more items. Income can only rise.

### 5.6 Life in the town (cheap, only at L0)
Chats (pairs at the fountain, benches and station waitPoints), kids playing tag in the school yard at recess
(walk/run with the `walk` anim at 1.6× speed), shop queues at `customerPoints`, and greeting the chief. The
events reuse `Bubbles` and the strings `LINES` categories, plus new categories `town_*` in ko and en. No
memory or relations yet (v5).

### 5.7 CPU budget (fixed-step bench, same machine and method as v3.5)

| Part | Budget (avg ms/frame) |
|---|---|
| Event heap + schedules | ≤ 0.05 |
| L1/L0 movement + tier reassignment (0.25 s cadence) | ≤ 0.10 |
| Rigs (32): position, depth, anim frame, refresh on frame change | ≤ 0.15 |
| Rail + crossings | ≤ 0.03 |
| Town sim total | **≤ 0.35** (140 people) |
| Whole game, full v4 save, any view | ≤ 1.6 avg (v3.5 1.24), p95 ≤ v3.5 p95 + 3 ms |

---

## 6. Paper-doll runtime

### 6.1 `src/core/Townfolk.js` (port of `tools/townfolk_compose.js`, 352 lines)
- The generator (`Townfolk.generate`, presets, conflicts, palettes, tint table) and the layer rules (mirror
  dirs, round bases `scaleX`, head offset, z / zFront / follow) stay **byte-identical**. The parity test
  re-uses `tools/test/townfolk2_parity.mjs`'s approach against the tools copy: 1000 random people, every
  anim/dir/frame, identical draw lists.
- **New: pages.**
  - `frameAtlas[layer@base]` is replaced by `pageOf(layer, base, animGroup)`. Groups are `loco`
    (idle + walk + loco head pose) and `social` (talk / wave / happy + soc/nod/up/tilt poses).
  - `carry_walk` is **not loaded in v4**. Visitors carrying goods use `walk` plus the game's head-carry stack
    (`Character.carryOffset` 'head' mode), consistent with the village. That saves 20.5 % of the sheet area.
- **New: layer plan cache.** Per person, the static part of the draw list (layer, tint, z rule, sheen) is
  computed once. Per frame, only the frame refs change. Frame objects are cached in a
  `Map(layer|anim|dir|i → Phaser.Frame)`, so a refresh does no string concatenation and allocates nothing.
- **townfolk2: merge-ready, but only what is used is loaded.**
  - v4 copies just the 6 `overrides` head frames (`hat_cap.visor/up_{S,SE,E}` and
    `hat_headband.main/soc_{S,SE,E}`) into the v4 head pages at compile time. That fixes the black frames.
  - `mergeTownfolk()` from `tools/townfolk2_compose.js` is ported behind `TOWNFOLK2 = false`.
  - In v5 the compiler emits `tf2` pages, a `life` class loaded only during weddings, funerals and stroller
    walks.

### 6.2 `src/entities/DollSprite.js` (new) — a duck-typed `Phaser.Sprite`
It implements what `Character` / `Customer` / `Resident` / `Bubbles` / tweens / `Occlusion` use:
- `x`, `y`, `depth`, `alpha`, `visible` as setters that propagate to the layers;
- `setPosition`, `setDepth` (each layer gets `depth + z·1e-4`), `setScale`, `setAlpha`, `setVisible`,
  `setFlipX`, `setOrigin` (no-op);
- `anims.play(key | {key, startFrame})`, where `key = 'townfolk:<anim>:<dir>'` and the flip comes from
  `setFlipX`;
- `anims.pause` / `resume` / `isPlaying` / `currentFrame`, `on(ANIMATION_UPDATE)` (no-op), `getBounds()`,
  `destroy()` (returns layers to the pool).

`Character` gets `opts.person`. When it is set, `this.sprite = DollPool.acquire(person)`, the key becomes
`'townfolk'`, and `Assets.charDef('townfolk')` is a synthetic def built from the manifest: anims, dirs,
anchor [0.5, 0.8125], `headTop` −84, shadow [46, 18]. `Character.play` skips the `anims.exists` check for
dolls. Nothing else in `Character`, `Customer` or `Bubbles` changes.

`DollPool` keeps up to `perf.maxDolls` rigs of 16 Images plus 1 shadow, created on demand and never
destroyed while the town exists (no GC churn).

### 6.3 Cost of runtime composition (no baking)

| | Live layers (chosen) | Baked per person (rejected) |
|---|---|---|
| GPU memory | shared pages only: loco 39 MiB high tier, 9.8 MiB half tier; social +48.6 MiB on demand | 10 MB per person → 1 GB for 100 (townfolk report) |
| Spawn cost | 0 (pool) | 253 ms CPU + 1.7 s GPU per person |
| Images on screen | 32 rigs × 9–14 layers ≈ 300–450 (lite rigs 4–5) | 32 |
| Draw calls | same batch while textures ≤ 16 slots. Pages in a town view: head 2 + 3 ages ×(1–2) loco + ≤ 5 social + buildings ≈ 14–18 → **target ≤ 12 draw calls/frame** (v3.5: 4–6) | — |
| CPU | refresh only on frame change (≈ 5 refreshes per frame at 32 rigs and 10 fps anims) | — |

---

## 7. Gameplay systems built on top

### 7.1 Opening the town (progression)
New steps in `Progression.STEPS` (`v4: true`):

| id | type | after | what |
|---|---|---|---|
| `rail_open` | `rail` pad at `rail_w` (2960, 1250) | `BALANCE.town.unlockAfter` (default `b:toolsmith`) | pay 900 coins → "이웃 마을 사람들이 철길을 놓았어요!" → `Territory.reveal('woods')` |
| `station_v` | site (plot `v_station`, only `station_v`) | `rail_open` | 1200 coins + 20 planks + 8 ingots, 14 s (porters deliver as for v3 sites) → `reveal('town')`, first train arrives with 12 visitors, flag `firstTrain` |
| rank `eup` | automatic | rank points ≥ threshold | celebration; R0/S1/S2 dirt → cobble; +2 shop lots; `maxPeople` 120 |

`GOALS` gets `rail_open → station_v → firstTrain → firstTownShop → eup`, appended after the v3 goals, so the
v3 "next goal" text is unchanged until v3 goals run out. The gate is a balance key: setting `'v3'` delays the
town until v3 is complete.

### 7.2 Shop founding (`src/systems/ShopFounding.js`, new)
- **Supply meters.** Rolling 5-minute sales to townsfolk per category: food (cooked fish, smoked meat),
  bread, plank, ingot/tool, can. Sources are visitor purchases plus wholesale.
- **Founding.**
  - A lot is founded when its category's meter is at least `shops.found[cat]` (default 40 items per 5 min)
    and the lot is free.
  - A townsperson (a WORKER without a job, or a homemaker) becomes the owner and their schedule changes.
  - Construction reuses the `Site` stage visuals (foundation → scaffold → done) with the town art, no player
    cost, 20 s. Then "○○ 씨가 빵집을 열었어요!".
- **Running a shop.**
  - Each shop is a `Logistics` sink at its `inPoint` for its category (`PRIO.SHELF`). Porters and the chief
    deliver.
  - Delivered goods are bought at `shops.wholesale` (0.8× item price) into the shop's CashPad.
  - Rent `shops.rent` (25 coins per in-game day) accumulates in the same pad.
  - Visitors also shop there (`customerPoints`).
- **Effects.**
  - The carpenter raises the town's bed count via the reserve lots (+10 people).
  - The supermarket raises canned-goods demand: visitors add cans to their list.
  - The restaurant and cafe double the lunch traffic in the station quarter.

### 7.3 Village rank 마을 → 읍 (`src/systems/Rank.js`, new)
- **Points** = village residents + townsfolk ÷ 4 + founded shops × 10 + v3 buildings × 5 + daily visitor
  coins ÷ 100. Threshold `rank.eup` = 120 (balance).
- **On rank-up:** a banner with the `ui_badge_rank_2` badge (assets/ui3), the UI rank pill, road upgrades
  (§3.4), +2 lots, and `maxPeople` 120.
- 도시 (rank 3) is v5: asphalt, vehicles.

### 7.4 UI and strings
- **UI.js:**
  - a rank pill with the ui3 badge;
  - a clock chip (sun/moon icon from ui3 icons);
  - a train toast ("기차가 들어와요");
  - Settings → "그래픽: 자동 / 선명하게 / 가볍게" (`Settings.gfx`);
  - a debug HUD (`?debug=1`): `TEX 212/256 MiB · DC 9 · FPS 58 · DOLL 18`.
- **strings.js:** every new string in ko and en (≈ 70 keys: region names, street names, steps, toasts,
  shop-founded lines, rank, settings, `town_*` chat lines).

---

## 8. TEXTURE-MEMORY PLAN

### 8.1 Where memory goes today (full v3.5 village, 441–455 MiB)
Villager atlases 198, characters 38, buildings 35, workers 37.5, props 15.7, ui2 10.5, fx 9.3, ground 8,
other UI and emotes about 15. Canvases: ground tiles 48 (12 × 1024²), road overlays 18.5, zone floors 10.7.
Everything loaded stays loaded, and canvases are never released.

### 8.2 Hard budgets (Phaser source-sum `w·h·4` over all texture sources, so comparable to 368/441)

| Scenario | v3.5 | **v4 hard** | Soft (eviction starts) |
|---|---|---|---|
| Title screen | 88 | **90** | — |
| New game, title → 20 min (peak) | 368 | **210** | 190 |
| Full v4 save, any view at zoom 0.6–1.7, high tier | — | **256** | 232 |
| Transient peak (region change, zoom change), max 10 s above 256 | — | **288** | — |
| Low tier (auto or opt-in), any view | — | **176** | 160 |
| Cluster overview | 441–455 (everything resident) | **256** | 232 |
| Whole-map view (overview canvas + dots) | — | **128** | — |

GPU memory is ≈ source-sum (RGBA8, no mipmaps). The GL-level probe (§8.5) must agree within 10 %.

### 8.3 Strategy

**(a) Asset compiler — `tools/build/pack_pages.py` (new; Pillow and numpy are installed).**

It reads the existing manifests and atlases and writes `assets/_packed/` plus `index.json`. It never edits
the source folders.

| Output | Rule | Effect |
|---|---|---|
| Character pages | each villager/worker/character atlas → `@core` (idle, walk, sit, run; + carry_walk/carry_idle for carriers; + work/operate/serve/give/chop/mine/harvest for job and player keys) and `@social` (everything else) | resident page ≈ 24 % (resident) / 47 % (job) of today's atlas |
| Half tier | `@core` of every character at 0.5 scale, packed **per fragment into shared sheets** (5 sheets) | zoom < 0.85 and low tier: ¼ the memory, 5 files |
| Townfolk pages | per age group × {loco, social} + heads {loco, social}; carry_walk dropped; tf2 6 override frames merged into heads; half-tier loco sheets | loco 39 MiB, social 48.6 MiB on demand, half loco 9.8 MiB |
| Town buildings | `town_shops` → `_a` (clothing, hair, flower, book, toy) and `_b` (cafe, restaurant, supermarket, hardware, carpenter: the founded shops) | the village only needs `_b` (≈ 6 MiB) |
| Train | SE frames + SE shadow only | 16.6 → ≈ 4 MiB |
| Portraits | 55 PNGs → 1 atlas | −54 files |
| Frame index | one compact JSON per fragment (tfatlas-style `[x,y,w,h,dx,dy]`) instead of one Phaser JSON-hash per atlas | about 190 → 25 bytes per frame; −100+ files; pages can be (re)created without re-fetching JSON |
| `index.json` | page → { png, w, h, bytes, cls, regions, tier }, char → { core, social, half }, sprite → page | bytes are known before loading (budget decisions) |

- The compiler has a **guard**: it exits 1 if any manifest frame would be dropped. `--check` verifies that
  every frame resolves.
- `Assets.js` uses `_packed` when `index.json` exists; otherwise it keeps v3.5 behaviour, so dev runs from
  raw assets still work.
- `build_artifact.mjs` ships `_packed` instead of the raw character, townfolk and town atlases.

**(b) Residency manager — `src/core/Residency.js` (new).**
```js
page = { key, bytes, cls, regions:Set, tier:'full'|'half', state:'absent'|'queued'|'loading'|'resident',
         refs:0, lastUse, pinned, ttl }
acquire(key, owner) / release(key, owner) / touch(key) / want(keys, prio) / ready(key) / tick(dt, view, zoom) / stats()
```

| Class | Who holds refs | TTL after refs → 0 | Notes |
|---|---|---|---|
| `core` | pinned | — | player, ui, ui2 icons, fx, emotes, props (non-building), deer/boar, ground patterns; ≈ 58 MiB incl. 8 MiB water reserve |
| `char` (`@core`) | materialised characters (L0, plus Workers/Porters now LOD-hidden off screen) | 20 s (0 when over soft) | residents, operators, clerks, porters, workers, pets |
| `charSocial` | a character playing a social anim | 30 s; **at most 5 resident** (LRU) | until it arrives, the anim falls back via `ANIM_FALLBACK` + emote |
| `charHalf` | characters while zoom < 0.85 or low tier | 30 s | shared per-fragment sheets |
| `doll` / `dollSocial` / `dollHalf` | DollPool rigs by age group; visitor queue | 30 s | social only in the town cluster at zoom ≥ 0.9 |
| `regionBld` | camera distance to the region's cluster rect: acquire < 900 px, release > 1800 px for 10 s | 10 s | props_buildings + bld_* (village), town_* (town), town_shops_b (station quarter), train (both stations), boats (east dock, 700 px radius) |
| `bake` | Ground while baking tiles with grid roads / zone floors | 10 s | roads kit 11.7, ground_plaza/dirt/farm/rock/shallow |
| `transient` | one-shot fx sheets (`fx_build_*`, `fx_levelup`, `fx_unlock`, wake) | 15 s | |

- **Budget enforcement**, checked every 0.5 s:
  - Over **soft**: evict LRU pages with refs = 0, cheapest classes first.
  - Over **hard**:
    1. refuse new `charSocial` / `dollSocial` loads;
    2. shrink the materialise margin from 160 to 40 px;
    3. switch characters smaller than 70 screen px to the half tier;
    4. log a `budget` event (tests fail if it lasts more than 2 s).
- **Eviction:**
  - `Assets.unbuild(page)` removes the anims built from the page and clears `Assets.cache` / `built` /
    `queued`.
  - `textures.remove(key)` calls `gl.deleteTexture` and drops the image.
  - A DEV assertion scans the display list for objects still using the page.
- **Loading.**
  - At most one page decode/upload starts per 100 ms, in priority order: on screen > near > prefetch.
  - Pages are added from the in-memory frame index (`textures.addAtlasJSONHash`-style).
  - Phase 2, only if measured jank exceeds 8 ms per upload: an `ImageBitmap` path
    (`createImageBitmap(blob, {premultiplyAlpha:'premultiply'})`, Image fallback).
- **Late art keeps working.** The existing "stand-in then reskin" path (`Assets.arrivals`,
  `Game.onAssetArrived`, `Character.reskin`) handles every late page, so nothing ever shows a placeholder.

**(c) Ground canvases (`Ground.js`).**
- **Tiles.** Tiles are 512² (was 1024²) and come from a **fixed pool of reused `CanvasTexture`s**: up to 18
  full-res tiles (18 MiB) at zoom ≥ 0.85, and half-res tiles (512² covering 1024 world px) below 0.85.
  - Reusing canvases and re-uploading with `refresh()` matters because Phaser's `CanvasPool` keeps removed
    canvases alive, so create/destroy would never free memory.
- **Zone floors and road overlays** are baked lazily at unlock. They stay separate only during their 900 ms
  fade-in, then merge into the tiles: the dirty tiles re-bake and the separate canvas is destroyed. That
  frees 29 MiB.
- **Overview canvas.** The whole map at 1/8 scale (1088×640, 2.7 MiB) is updated per region whenever that
  region's pages are resident; building frames are drawn at 1/8. The whole-map view uses it plus dots, so its
  memory is about core + 3 MiB.
- **Fog** textures (fog_bank*, fog_puff: 1.2 MiB) are destroyed when no hidden region is adjacent to open land.

**(d) Region hysteresis.**
- Village cluster pages and town cluster pages never stay resident together for long. Acquire happens at
  900 px from a cluster and release at 1800 px.
- In the 1600 px woods corridor, only buildings and the train are resident; all characters there are
  dematerialised.
- Estimated corridor peak (§8.4 E): about 210 MiB.

**(e) Destroy what is no longer used.**
- villager_a/b/c (8.8) once the town supplies customers;
- `bld_sites` (3.9) when no site is active;
- fog;
- one-shot fx;
- `unusedAtlas` (already done in v3.5);
- roads/ground bake patterns between bakes.

**(f) Low tier.**
- **Selected when** `Settings.gfx === 'low'`, or on `auto` when `navigator.deviceMemory ≤ 3`,
  `MAX_TEXTURE_SIZE < 4096`, or the existing weak-GPU fallback (`View.forceK = 1`) fires with fps still below
  24.
- **What changes:**
  - every character and townsfolk uses the half tier at any zoom;
  - social pages are off: idle + emote is used instead;
  - at most 16 dolls;
  - soft/hard limits are 160/176.
- Low tier mostly hits k = 1 phones (720-px screens), where the art is magnified only 1.2× today, so half-res
  costs least there.

**(g) Stretch, not in the base budget: compressed textures.**
- KTX2/Basis UASTC transcoded to ASTC/ETC2 would cut GPU memory about 4×.
- **Costs:** Phaser 3.90 has no KTX2 loader, a wasm transcoder (~0.5 MB) would have to be shipped, PNG
  fallback is still needed for desktop/SwiftShader, and downloads would grow (8 bpp before supercompression vs
  ≈2 bpp PNG today).
- **Gate:** a v4.1 experiment on the townfolk pages only, adopted only if SSIM ≥ 0.98 against PNG and
  transcoding takes < 30 ms per page on a mid phone.

### 8.4 Estimated residency (from real atlas sizes; `budget.py`; counts are assumptions)

| Scenario | Estimate | Main items |
|---|---|---|
| A New game at 20 min, village, zoom 1.2 | **202** | core 58, ground 18, props_buildings 11, v3 bld + sites 23.5, villager_a/b/c 8.8, 14 resident cores 20.8, 5 resident socials 19.2, 6 job cores 19.2, 2 job socials 6.1, 3 workers 11.1, pets 6 |
| B Full v4, village view zoom 1.2 (visitors queued, train in station) | **244** (256 with the dock and boats in view, which the plaza view cannot show) | core 58, ground 18, village bld 30.6, residents 40, jobs 31.8, workers 18.5, pets 6, shops_b 6.3, townfolk loco adults/elders 31.2, train 4 |
| C Full v4, town view zoom 1.2 | **220** | core 58, ground 18, town bld 40.7, roads bake 11.7, train 4, townfolk loco 39, townfolk social 48.6 |
| D Full v4, zoom 0.6, village cluster | **193** | half tiles 24, all characters half-core 48.5, townfolk half 9.8, buildings 42.3, boats 11.7 |
| E Woods corridor (riding the train) | **≈ 210** | core, ground, village bld + town bld (both within hysteresis), train, prefetched doll loco |
| Low tier, village worst | **≈ 159** | half tier everywhere, no socials |

Scenario B sits close to the soft limit. If measurement shows it over, these levers apply in order:
1. resident social cap 5 → 3 (−7.7 MiB);
2. bake-class ground patterns evicted between bakes (−5);
3. `props_buildings` split by zone (−4);
4. job characters' `@core` without carry for operators who never carry (−6).

### 8.5 How memory is measured
1. **`window.__FV.texStats()`** returns `{ totalMiB, byCls, byPage[], canvases, texts, overSoft, overHard,
   loads, evictions, missesPerMin }`. It uses the same formula as the v3.5 reviewers (sum of `w·h·4` over all
   texture sources), so numbers stay comparable.
2. **GL truth (`tools/test/texbudget.mjs`, new).** An init script wraps
   `texImage2D` / `texStorage2D` / `compressedTexImage2D` / `deleteTexture` and tracks live bytes per GL
   texture (the same technique as `review_robust_drawcalls.mjs`). Source-sum and GL bytes must agree within
   10 %. Optional `--memdump`: a Chrome memory-infra trace (CDP `Tracing`) for the GPU-process total and
   decoded-image caches.
3. **Scenarios** (fixed-step clock `fv_step.mjs`; run under nohup and poll, 10 min limit per call):
   - title;
   - new game with the smart bot to minute 20, sampled every 5 game seconds;
   - fixtures built through `__FV` hooks: v3.5 complete, v4 full (town open, 5 shops, 120 people, rank 읍);
   - a camera tour: plaza → east dock → village station → ride the train → town square → zoom 0.6 →
     cluster overview → whole map → back;
   - a 20-minute soak across both clusters with day/night.

   Records: peak, time above soft/hard, uploads per frame, max upload ms, draw calls.
   **Fails if** any hard budget is exceeded for more than 2 s, a peak is above 288, or the total after
   returning to the start point is more than baseline + 5 MiB (leak).
4. **On the designer's phone:** the `?debug=1` HUD shows texture MiB against budget, draw calls, FPS and
   dolls. Remote DevTools on one low-end Android (3 GB) for `about:gpu` / tracing.

---

## 9. Save v5 and migration from save v4 (v3.5)

```js
SAVE_VERSION = 5
s.clock = { t: 0..1, day: int }
s.town  = { v: 1, open: bool, seed: uint32, next: int,
            people: [[id, seed, preset, role, home, work, flags], …]   // ≤ 192 rows; looks regenerate from seed
            stats: { trips, served, spent } }
s.shops = { lots: { lot_1: { b: 'supermarket', st: 'building'|'open', t, owner: id, stock: {item:n}, cash: n } },
            meters: { food, bread, plank, metal, can } }
s.rank  = { lv: 0|1, pts: n }
// territory gains 'woods' / 'town'; sites gain building 'station_v' (size XL)
```
- **Size:** about 120 people × ~30 bytes ≈ 3.6 KB, so the save stays at or below 10 KB and writes in
  ≤ 2 ms.
- **Looks:** stored as seed + preset, not as the generated look, so the save stays small and a manifest change
  only changes appearance. A look hash is not stored on purpose (drift is cosmetic).
- **`MIGRATE[4]`** (v3.5 → v4):
  `o = {...s, v: 5, clock: { t: 0.3, day: 1 }, town: { v: 1, open: false, seed: hash(s.t) }}`. Nothing is
  removed. A v3.5 player past the gate sees the `rail_open` pad right after loading, through `Progression.init`.
- **`sanitizeSave` additions:**
  - `REGIONS += ['woods', 'town']` and `BUILDINGS += ['station_v']`;
  - people rows are clamped (ints in range, home/work indices < building count, otherwise reassigned);
  - unknown shop keys are dropped and meters clamped to [0, 1e6].
- **Not saved:** train position (it restarts at dwell in the village), visitors in transit (they wake at
  home, and unpaid items already return to the shelf in `serialize()`), doll pages and the residency state.
- **Downgrade:** a v3.5 build reading a v5 save keeps its existing behaviour (backup slot, fresh start). The
  GitHub Pages stale-module caveat (v3.5 L7) applies to the new imports; the artifact bundle is not affected.

---

## 10. File-by-file changes

**New**

| File | Purpose |
|---|---|
| `src/core/Residency.js` | §8.3b texture residency, budgets, tiers, stats hook |
| `src/core/Townfolk.js` | §6.1 port of the compositor + pages + layer-plan cache |
| `src/entities/DollSprite.js` | §6.2 duck-typed doll sprite + `DollPool` |
| `src/systems/DayClock.js` | §5.2 clock, night tint, lights pool |
| `src/systems/RoadNet.js` | §3 grid network, walk/lane graphs, routing |
| `src/systems/RoadPaint.js` | §3.4 bake grid roads + rails into ground tiles |
| `src/systems/Rail.js` | §4 line, train, boarding, crossings, ride camera |
| `src/systems/Town.js` | §5 TownSim (SoA, heap, schedules, LOD, visitors bridge, town buildings registry) |
| `src/entities/TownBuilding.js` | static town building: points, occluder, lights, region/residency-aware reskin |
| `src/entities/RailStation.js` | station sprite + platform waitPoints / boardPoints, ride pad (named to avoid clashing with `Station.js`) |
| `src/systems/ShopFounding.js` | §7.2 |
| `src/systems/Rank.js` | §7.3 |
| `tools/build/pack_pages.py` | §8.3a asset compiler (+ `--check`) |
| `tools/test/texbudget.mjs` | §8.5 |
| `tools/test/town.mjs` | 2 game days: population, schedules, conservation, no stuck walker, visitors buy, 0 errors |
| `tools/test/rail.mjs` | kinematics, dwell, car spacing, buffer stops, crossings block and release, boarding counts |
| `tools/test/roadnet.test.mjs` | Node: grid → graph, all doors reachable, A* = Dijkstra on 500 random pairs, lane sides, connectors, upgrade invalidation |
| `tools/test/townfolk_runtime.mjs` | port parity (1000 people), zero missing frames on pages, rig refresh bench |
| `tools/test/save_v4.mjs` | migration from real v3.5 saves + fuzz + v5 round trip |
| `tools/test/shots_v4.mjs` | designer screenshot set |

**Changed**

| File | Change |
|---|---|
| `src/core/Assets.js` | `FRAGMENTS += town, townfolk, roads, ui3`, plus audio3 subset (`sfx_steam_whistle`, `sfx_brakes`, `sfx_sleigh_bells`, `sfx_school_bell`, `sfx_bell_hall`, `sfx_door`, `amb_town`, `amb_night`; no v5 music); `_packed/index.json` mode; per-page anim building / `unbuild()`; synthetic `charDef('townfolk')`; half-tier anim keys `key:anim:dir@h`; `lazyAllowed` / gates move to Residency |
| `src/core/Save.js` | §9 |
| `src/scenes/Game.js` | construct Residency / DayClock / RoadNet / Rail / Town / ShopFounding / Rank after `progress.init`, behind the gate; tick order; serialize/restore; `moveAgent` separation through a 64 px spatial hash; LOD hide for Workers/Porters off screen; hooks `__FV.town`, `texStats`, `setClock`, `trainTo`, `townFixture` |
| `src/systems/Ground.js` | 512² pooled tiles, LRU, half-res tiles, overview canvas, floor/overlay merge, RoadPaint hook, sea width to 8704 |
| `src/systems/Territory.js` | new regions, cluster overview rects, `region` events feed Residency, fog teardown |
| `src/systems/Roads.js` | §3.2 (`addGraph`, heap A*, bucket nearest, `edgeBlocked`, wider cache key) |
| `src/systems/VillageLife.js` | resident LOD acquires/releases `char` refs; social anims request `charSocial`; excludes doll visitors |
| `src/entities/Character.js` | optional doll body; half-tier `texScale`; residency refs on (de)materialise |
| `src/entities/Resident.js`, `Worker.js` | LOD integration (release refs after TTL) |
| `src/entities/Seller.js` | `enqueueVisitor`, doll customer looks, visitor exit to the station, `customerKeys()` after town open |
| `src/entities/Site.js` | size `XL` (two L stage sprites) |
| `src/systems/Progression.js` | steps `rail_open` / `station_v`, GOALS v4, rank hooks, `v4Complete` |
| `src/systems/Tutorial.js` | v4 arrows (rail pad, station site, "기차를 타 보세요"); no change before the gate |
| `src/systems/Occlusion.js` | town buildings as occluders; DollSprite bounds |
| `src/scenes/UI.js` | §7.4 |
| `src/data/balance.js` + `balanceCheck.js` | new sections `town`, `train`, `dayNight`, `shops`, `rank`, `perf`, `buildings.station_v`; all optional with ranges (e.g. `train.speed` 0.5–6, `town.maxPeople` 20–192, `dayNight.dayLength` 60–3600, `perf.maxDolls` 4–48) |
| `src/data/world.js` | §2 (width/height, territory, grid, rail, town, shopLots, plots, link road, moved regionTrees (2620,1290) (2720,1240) if the link needs it, woods decor and border trees) |
| `src/data/strings.js` | ≈ 70 keys ko + en |
| `src/data/version.js` | `v4` |
| `tools/build/build_artifact.mjs` | ship `_packed`; publish batches (boot files last); file count ≈ 395 (< 511, 2 publishes) |

---

## 11. Performance and quality gates (all on the fixed-step clock)

| Gate | Threshold |
|---|---|
| Early game unchanged | smoke 53/53, labour, dog, life, zoom, v3, save_v2/v3/v35 all pass; bot times to "village complete" within ±5 % of v3.5 (smart 19.6–20.2 min) |
| Texture budgets | §8.2 via `texbudget.mjs` |
| Logic | full v4 any view ≤ 1.6 ms avg; town sim ≤ 0.35 ms (140 people) |
| Draw calls | ≤ 12 per frame in town, village-with-visitors and overview views (`review_robust_drawcalls` extended) |
| Uploads | ≤ 1 page per 100 ms; no single upload > 8 MiB; max upload time logged |
| Soak 20 min (both clusters, day/night) | 0 errors; heap after GC growth < 2 MB over the last 10 min; textures back to baseline ± 5 MiB |
| Save | ≤ 10 KB, ≤ 2 ms; v3.5 → v5 migration keeps income (120 s idle) within ±6 % |
| Town | ≥ 80 % of people at home 22–05; ≥ 90 % of children at school 08–15; 0 walkers stuck > 30 s; people conserved (town + train + village = total) |

---

## 12. Implementation order (each phase ends with its gates green)

1. **P0 Memory first (no gameplay change; can ship as a v3.6 test link).** `pack_pages.py`, Residency,
   pooled ground tiles, floor/overlay merge, packed portraits, `texbudget.mjs`. Gate: v3.5 new game ≤ 210,
   full v3.5 village ≤ 230, every existing test passes.
2. **P1 World + roads + rail.** Regions, lattice, RoadNet (+ Node tests), RoadPaint, link road, `rail_open`,
   station site (XL), Rail with an empty train.
3. **P2 Dolls + town.** Townfolk.js, DollSprite / pool, TownBuilding, TownSim schedules / LOD, DayClock.
4. **P3 Economy.** Visitors + hybrid customers, ShopFounding, Rank, save v5 + migration.
5. **P4 Polish.** Tutorial, UI, strings, balance pass with bots, soak, budgets on the full fixture,
   screenshots, artifact.

---

## 13. Risks

| Risk | Mitigation |
|---|---|
| Evicting a texture still referenced by a GameObject → render crash | strict ref counts, DEV display-list assertion before `textures.remove`, stand-in reskin path; texbudget tour runs with assertions on |
| Phaser `CanvasPool` keeps removed canvases → ground memory never drops | fixed pool of reused CanvasTextures, never create/destroy per tile |
| Page reload stutter on low-end phones (decode + upload of 2–8 MiB) | ≤ 1 upload per 100 ms, prefetch at 600–900 px, half tier as stand-in; ImageBitmap path if > 8 ms measured |
| More than 16 textures on screen (town) → batch flushes | page grouping by co-visibility, lite rigs when zoomed out, gate ≤ 12 draw calls; devices reporting 8 units fall to low tier |
| Push-pull train looks odd (engine pushing back) | a toy-train convention; engine plays reversed wheels with steam; no curve art exists. v6 can add a turntable at the harbour |
| The town changes v3 pacing (more income from 22 min) | gate is a balance key (`b:toolsmith` → `'v3'`); income rule max(v3.5, …) only rises; bots re-timed in P4 |
| Fixed-orientation art: doors always face −j | layout puts every building row on the north side of an X-street (validated by `layout.py`; becomes a world.js check in `town.mjs`) |
| Residency adds complexity to every character path | P0 lands it on v3.5 content first, with every existing test as a regression net, before any town code |
| SwiftShader timings ≠ phones | all logic on the fixed-step clock; GPU numbers by byte counts, not ms; HUD on the designer's phone |
| Parallel v7 work (Water.js, beach folders) | not imported or loaded; sea stays one replaceable layer in Ground.js; 8 MiB reserved |
| Artifact file limits (255 per publish, 511 per version) | frame-index merge (−100+ files) and portrait atlas (−54) offset new pages; boot files in the last batch |
