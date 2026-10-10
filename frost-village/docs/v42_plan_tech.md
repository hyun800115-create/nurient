# v4.2 technical plan — engineering first (proposal)

Status: **proposal** (engineering angle). Input: the designer's v4.1 feedback (5 points, Korean, verbatim in the task),
`docs/v4_plan.md` (binding v4), `docs/v4_plan_tech.md`, `docs/build_reports/v4_*.md`, `docs/v5_v8_plan*.md`, the asset
manifests (`town`, `civic`, `logistics`, `cityfolk`, `fx_city`, `townfolk`, `villagers2`, `fx`) and the v4.1 code
(HEAD 65c39f3, save version 6). This plan changes no game code. Every number below is **measured** (scripts and runs
listed in §1.1) or marked **estimate**.

Scratch evidence (my scratchpad, `…/scratchpad/v42t/`): `census.mjs` (the gameplay bot plus a full stock census every
10 game-seconds), `analyze.py`, `occupancy.mjs` (world occupancy dump), `bots/{fresh,late45,late45_pile}.census.json`,
`bots/occ.json`, `bots/free_L.json`, `scan_big.py`.

---

## 0. Summary of decisions

| # | Designer ask | Decision | Why |
|---|---|---|---|
| 1a | 촌장 광채/버프 | **ChiefAura**: a ground halo + a rim-glow sprite baked at runtime from the chief's own atlas (half resolution, CanvasTexture) + a few sparkles; tiers by village rank. WebGL `preFX.addGlow` kept only as an opt-in quality mode | Same NORMAL blend and batch as everything else: 0 extra draw calls, works in Canvas, deterministic in screenshots, ≈ 2 MiB, no new asset files |
| 1b | 자동 줍기 on/off | **PickupPolicy** in one place for every "take" path (station outputs, workshop outputs, boathouse catch, collection piles, gathering). Modes `auto` (v4.1), `still` (only after standing 0.45 s), `button` (a 줍기 hold button). Settings row on a new "놀이 도움" tab | Today the "take" logic is spread over 5 places (4 in `Game.js`, 1 in `Player.js`); one policy object is the only way to make the setting reliable |
| 1c | 네비게이션 | **Navigator**: destination from the same resolver the tutorial arrow uses (`Tutorial.destination` → `Logistics.best`), a dotted path on the ground from `Roads.route`, a destination ring with the item icon, an off-screen edge arrow. 4 Hz replans, ≤ 28 pooled images | Reuses the one source of truth for "where does this item go", so the navigator, the arrow and the porters never disagree |
| 2 | 재고 넘침 | Measured: **all five collection piles are full 89–100 % of the late game**, station inputs 100 %, outputs 44–74 %. Causes: gatherers out-produce stations ≈ 2× (≈ 200 raw items/min unused), goods porters starve the trade post while serving far INPUT sinks, local demand ceiling, and **a bug** that loads loading-dock crates only while the station is on screen (backlog 1 540 crates). Fix = the **솔방울 물류센터 (Depot)** as the surplus sink, fed by the train's new freight cars, plus porter scoring and two bug fixes | The designer's intent ("남는 것들은 거대 물류창고로") becomes the visible turnover loop: piles → porters → our loading dock → freight wagons → town → van → racks → sold to the town |
| 3 | 객차·화물칸, 앞으로 출발 | **Top-and-tail consist**: an engine at each end (one faces NW, one SE); the leading engine always runs forward, the trailing one idles. New, longer art: `train_coach` 3.1 m, `train_boxcar` 2.9 m, `train_flatcar` 2.9 m. Rank 1: E+coach+boxcar+E (11.2 m); 읍: E+coach+boxcar+flatcar+coach+E (17.2 m) | No curve, turnout or turntable art exists and the station is a terminus; top-and-tail is the only engine-first option with zero track work. The engine's SE frames already exist (only the packer drops them) |
| 4 | 촌장 사무실 + 직원 4명 | **Chief office** (new cutaway art in the civic style, L plot next to the 마을회관), 2 clerks, a 수행비서 who follows the chief, a 수금원 who empties every cash pad and deposits at a **bank** (the existing civic `bank` cutaway, built at v5's `v5_bank` spot). Office panels: 재고 (live stock ledger), 소식 (daily paper), 편지 (letters), 통장, 직원 | Every panel reads a system that already exists or that this plan adds (StockLedger, VillageNews, Bank42); the bank and depot write **v5/v8 save slices** so those modules adopt them without adapters |
| 5 | 관망 모드 | **ChiefPilot**: when observer mode is on and the player has not touched for 8 s, an autopilot drives the chief through the same virtual-joystick channel the bots use (all game rules apply), with a daily agenda (office, chores, lunch, chats, dog, train trip, home at night), a seeded RNG, never spends coins unless allowed, and a camera director with short event cuts. Any touch hands control back in the same frame | The bot (`review_gameplay_bot.js`) already proves a joystick-only autopilot can play the whole game; the pilot ports its work layer and adds life |
| — | Save | `SAVE_VERSION 7`: block `v42` + top-level slices `bank` (v5 format) and `logistics` (v8 format); v5–v8 renumber their versions by +1 | Additive migration; module slices pass their own sanitizers unchanged (contract test) |
| — | Budgets | Textures: no existing view above its v4.1 measurement + 8 MiB; depot view ≤ 300 MiB. Logic ≤ +0.25 ms/tick. **Files: 19 left of 511** → a "file diet" (audio sprites, portrait atlas, ui4 pack) frees ≈ 117 files before any v4.2 art lands (≈ 104 left after v4.2) | The artifact file limit, not MiB, is the first wall v4.2 hits |

---

## 1. Investigation (measured)

### 1.1 Method

- **Census bot** (`v42t/census.mjs`): the unchanged `tools/test/review_gameplay_bot.js` (policy `smart`) on the
  fixed-step clock, plus every 10 game-s a census of every stock: station in/out, the five collection piles, market /
  trade / store shelves per item, warehouse, workshops, food box, boathouse catch, big-restaurant pantry, founded
  shops' stock, loading-dock crates, every till, the chief's bag, what every porter carries and where to; flow
  counters wrap `outStack.push` (production), `stock.pop` (sales) and pile pushes (gathering).
- Runs (all `nice -n 15`, 0 errors):

| Run | Start | Sim | Wall | Notes |
|---|---|---|---|---|
| `fresh` | new game | 66 min | 678 s | first shop 23.2 min, 5 shops 42.5 min (rank not logged by this script) |
| `late45` | `v4_final/bots/pure_save_45min.json` (v4.1, all hires, 5 shops) | 35 min | 561 s | steady late game |
| `late45_pile` | same save, **piles unbounded** + **dock-loading fix** monkey-patched in page | 12 min | 209 s | measures true gatherer capacity and the dock bug |

### 1.2 Where stocks overflow (late45, minutes 10–35, 151 samples)

| Stock | Cap | Time at ≥ 90 % | Mean level |
|---|---|---|---|
| Piles wheat / ore / meat | 40 | **100 %** | 99–100 % |
| Pile fish / log | 40 | 93 % / 89 % | 97 % / 96 % |
| Station input bakery / smelter / smokehouse | 30 | **100 %** | 95–99 % |
| Station input sawmill | 30 | 68 % | 92 % |
| Station output smelter / sawmill / smokehouse | 36 | **74 % / 64 % / 44 %** | 93 / 87 / 83 % |
| Station output bakery / grill | 36 | 25 % / 24 % | 62 / 67 % |
| Toolsmith output | 12 | 67 % | 91 % |
| Boathouse catch | 30 | 69 % | **103 %** (restored above its cap after reloads) |
| Miners' food box | 20 | 94 % | 96 % |
| Market shelf fish / bread / meat | 40 | 12 / 1 / 0 % | 58 / 46 / **21 %** |
| **Trade shelf plank / ingot** | 40 | 0 % | **13 % / 11 %** — starved while sawmill and smelter outputs are full |
| General store cans | 40 | 0 % | 8 % |
| Warehouse (v3) | 300 | 0 % | **2 %** — empty all late game |
| Loading-dock crates (`growth.cargo`) | — | — | **255 → 1 540**, +37 per minute, never drains |

Fresh game: the ore pile fills at ≈ 18 min (miner hired at 15.7), meat ≈ 24, wheat ≈ 27, fish ≈ 33, log ≈ 39 min;
the dock backlog starts with the first train (≈ 23 min) and reaches 806 by 57 min. So the designer sees full piles
from the mid game on, everywhere.

Flows, late game (items per minute):

| Line | Gathered (= processed, throttled) | **Gatherer capacity** (piles unbounded) | Unused | Processed | Sold locally |
|---|---|---|---|---|---|
| fish → grill | 64 | **99.5** | 35 | 64 | market 48.5 + restaurant 4.5 + shops |
| wheat → bakery | 44 | **54.9** | 11 | 44 | market 26.8 + restaurant 4.0 + café/supermarket |
| meat → smokehouse | 33 | **79.1** | 46 | 33 | market 22.4 + restaurant 4.2 |
| ore → smelter | 20 | **93.8** | 74 | 20 | trade **1.2**, toolsmith 7.7, cannery 5.6 |
| log → sawmill | 31 | **43.1** | 12 | 31 | trade **13.2**, toolsmith 7.7, cards/houses |

(`late45_pile`: piles grew fish +26, log +12, wheat +29, ore +76, meat +56 per minute.)

### 1.3 Why (four causes)

1. **Gatherer over-capacity.** v3.5 added 2nd and 3rd gatherers per line (hire2/hire3) but one station per line with a
   fixed `time`. Gatherers can deliver ≈ 370 raw items/min; stations take ≈ 190. The surplus (≈ 180–200/min, mostly
   ore and meat) has no sink: raw items are not `STORABLE` in the warehouse (`Warehouse.js`), and nobody carries a
   pile anywhere but its station. Gatherers stand idle next to a 40/40 pile.
2. **Haul throughput and priorities.** Each station has one goods porter (capacity 14). `Porter.pickPlan` takes the
   highest `PRIO` sink: workshop INPUT (70) and SITE (100) beat SHELF (40) regardless of distance. The ingot porter
   walks mine → toolsmith (east plot) → cannery (west plot) and the trade post, where the merchant would buy every
   ingot at once, gets 1.2 ingots/min. The output backs up to 36, the smelter stalls (runs at 40 % of its 50/min), the
   input fills to 30, the pile fills to 40.
3. **Local demand ceiling.** Customers spawn every 1.3 s (≈ 33 customers/min), ≈ 98 food items/min at the market.
   Food production is ≈ 140/min. The 40-item shelves fill, then outputs, then inputs.
4. **Two bugs that look like overflow.**
   - `Growth.trainIn()` requires `train.cargoPoint()`, which is `null` while the goods-wagon sprite is hidden (camera
     more than 900 px away, `Train.FAR`). So crates on the loading dock are loaded only while the chief stands near
     the station. With the check patched to the rail state alone, the backlog of 255 drained to 0 within 6 min and
     stayed at 0–14 (`late45_pile`). The backlog is also saved (`v4.growth.cargo`), so it survives reloads.
   - The boathouse catch is restored above its `max: 30` (mean 103 %).

Also: the v3 warehouse is useless late (2 %): its porters only take outputs ≥ 60 % full and spend their time
restocking shelves, and the station porters drain it toward cards and shops.

### 1.4 How auto-pickup works today

Every "take" is unconditional once the chief's circle overlaps the pad, throttled by `padItemInterval` 0.075 s:

| Path | Code | Trigger |
|---|---|---|
| Station output pads | `Game.handlePlayerPads` → `Station.takeTo(p, cap)` | `outPad.contains(p)` |
| Workshop output pads | same function → `Workshop.takeTo` | same |
| Boathouse catch | same function → `Boathouse.takeTo` | same |
| Collection piles | `Game.updateLabour` → `Pile.takeTo` | `pile.update()` (on its pad) |
| Gathering (trees, rocks, wheat, net, animals) | `Player.update` → `findGatherable` | standing still `stillDelay` **0.08 s** within `gatherRange` 78 px |

Walking across a pad therefore grabs; walking past a tree and pausing a frame starts chopping.

### 1.5 Train and rail today

- `Rail.js` (pure): position `m` of car_a along j = 0, phases `toOurs → atOurs → toTown → atTown`, trapezoid
  `legProfile` (2.6 m/s, 0.6 / 0.8 m/s²), leg 36.1 m ≈ 17.7 s, dwell 14 / 10 s, cycle ≈ 59 s. `consist()` = engine
  (−2.34 m), car_a (0), [extra coach], car_b. `span()` adds 1.3 / 1.15 m. `blocking(k)` closes crossings 8 and 33.
  The track runs i = −1 (buffer `rail_x_end_n`, right next to 서리역) to 46 (`rail_x_end_p`, reserved for v6).
- `Train.js` (view): every car drawn heading NW (NE frames, flipped); toward the town the whole consist plays
  `move_rev` — **push-pull, engine always at the village end**, so it leaves our station backwards and runs
  cab-first toward the town. The packer keeps only NE frames (`train_engine@ne` 1.84 MiB, `car_a@ne` 0.98,
  `car_b@ne` 0.86); the source atlases have S/SE/E/NE/N.
- Size: engine 2.6 m (212×224 frame), coach 2.25 m (164×152), goods wagon 2.25 m (164×128). The coach's red roof
  continues the engine's red cab roof, and the station-square labels ("역앞 카페 0/30") sit on the coach
  (`docs/previews/screens_v4/07_cargo_wagon.jpg`): at phone zoom it reads as one vehicle.
- Coupled systems: `Neighbours` (visitors board at the station manifest's `boardPoints`, walk to the platform over
  crossing 8), `Growth` (dock crates fly to `train.cargoPoint()`), `DayClock` (lamp / coach glows), `Occlusion`
  (cars as subjects). The v6 coast line (`src/harbor/model/coastLine.js`) is duck-typed to the same `Train` view
  (`B`, `consist()`, `iAt()`, `m`, `running`, `v`), so any view change must keep those defaults.

### 1.6 How the chief is drawn

`Player extends Character` with atlas `char_player` (2036×816, 6.34 MiB, 128×128 frames, 10 anims), the same
frame size, anchor, scale and soft `fv_shadow` as every resident. Nothing marks him; the only difference is the item
tower on his head, which porters and residents also carry.

### 1.7 Baseline budgets (v4.1, from `v4_verify.md`, `v4_build.md`)

| Budget | Now | Gate |
|---|---|---|
| Textures, full v4 save, tour peak | 381 MiB (GL 418) | must ≤ 455, target 300 |
| Plaza view | 323 MiB | target 300 |
| Logic per tick, plaza / town | 1.9 / 2.1 ms (loaded machine) | 1.6 / 2.1 |
| Display objects, plaza | 1950 day / 2044 night | 1700 |
| Draw calls | ≤ 12 | ≤ 12 |
| Artifact | 491 files + page, 59.7 MB | **511 files per version** (19 left), 255 per publish |
| Main save | 5.7 KB | ≤ 10 KB (v5–v8 plan: ≤ 16 KB) |

---

## 2. Guardrails

1. **Nothing changes before the systems that need it exist.** Aura, pickup policy and navigator are global; the bank
   appears with the town, the depot with its gate, the office with its plot. A v4.1 save loads into the same picture
   plus the aura.
2. **Never edit** `src/story`, `src/missions`, `src/bank`, `src/vehicles`, `src/harbor`, `src/beach`, `src/city/**`,
   `assets/**` (new art goes through the art jobs in §12.3, which write new folders only), and never import module code
   at runtime. Tests may import module **save sanitizers** read-only (contract tests).
3. Every v4.1 suite stays green; bots keep their pacing ±5 % (pickup `auto`, observer off in bots).
4. Designer data stays in `balance.js` (Korean comments, `balanceCheck.js` covers every new key), `world.js`, `strings.js`.
5. Fixed-step clock for every logic measurement; Playwright under `nohup` + poll; `nice -n 15`.

---

## 3. Chief aura (`src/entities/ChiefAura.js`, `src/core/GlowBake.js`)

### 3.1 Layers

| Layer | Object | Depth | Look |
|---|---|---|---|
| Halo | 1 Image, texture `fv_chief_halo` (CanvasTexture 160×80 baked at boot: radial gold gradient + thin ring) | `DEPTH.SHADOW + 1` | pulses alpha 0.55 → 0.8 and scale 1.0 → 1.06 at 0.8 Hz; replaces nothing (the soft shadow stays on top) |
| Rim glow | 1 Sprite on the baked glow page, `setFrame(glowFrameOf(chief.sprite.frame.name))`, `flipX` mirrored, scale 2 | `chief.y − 0.02` (just behind him) | gold silhouette 3 px (half-res) wide, alpha 0.5 day / 0.8 at night (`DayClock.darkness`) |
| Motes | 2 pooled Images (`fx_sparkle` / `fx_star`, the `fx_particles` atlas) | `chief.y + 1` | one rises from the halo every 0.7 s, 0.9 s life |
| Find-me pip | 1 Image (`Assets.pick('ui_icon_star', 'fx_star')`) over the head | `DEPTH.LABEL − 30` | only when zoom < 0.8, in observer mode, or ≥ 4 characters within 120 px of him |

Tiers (`BALANCE.v42.aura.tiers`): 마을 — white-gold halo + rim; 읍 — gold halo + ring + motes. The halo grows
+10 % for a few seconds after a level-up / ceremony (the "버프" moment). Optional gameplay buff `aura.workBoost`
(workers within 3 m work faster) ships **0** (off): it would change bot pacing.

### 3.2 Runtime glow bake (`GlowBake.bake(scene, atlasKey, opts) → textureKey`)

- When `char_player` is resident, create a CanvasTexture `fv_glow_player` at half size plus a 4 px gutter per frame
  (≈ 1100×460 → **≈ 2.0 MiB**).
- For each frame (chunked: one anim per game frame, ≈ 10 frames of work, no jank): draw the frame's silhouette
  12 times at offsets on a 1.5 px / 3 px circle (`globalAlpha` 0.35), then `source-in` fill gold (`#ffd86b`), then one
  `destination-out` draw of the original to hollow the centre (a rim, not a blob). `ctx.filter = 'blur()'` is not used
  (Safari < 18 lacks it).
- Add frames to the texture with the same names (`idle_S_0` …) and the same trimmed offsets halved.
- Cost (estimate): 330 frames (measured, mean trimmed area 4 507 px², i.e. ≈ 34×34 px at half size) × 13 draws
  ≈ 15–30 ms on a mid phone, spread over ≈ 10 game frames (one anim each).
- Residency class `core` (pinned while the chief exists); rebaked if the atlas is evicted and re-loaded (never, today).

### 3.3 WebGL `preFX` / `postFX` (rejected as default, kept as `aura.mode: 'fx'`)

| | Baked sheet (chosen) | `sprite.preFX.addGlow()` |
|---|---|---|
| Draw calls | 0 extra (same NORMAL blend, multi-texture batch) | +2–3: the sprite renders through its own framebuffer and the batch flushes before and after |
| GPU | 1 extra 64×64 quad | per frame a padded FBO (~200×200) and a glow shader with `quality × distance` taps per pixel; heavy on SwiftShader and low GPUs |
| Canvas renderer | works | not available |
| Tests | deterministic pixels | shader output differs by GPU |
| Memory | ≈ 2 MiB | ≈ 0.2 MiB FBO |

`mode: 'fx'` only when `renderer.type === Phaser.WEBGL && gfx === 'high'`; `'ring'` (halo only) on low tier.

### 3.4 Cost

4–5 display objects, 0 draw calls, ≈ 2.1 MiB, ≤ 0.01 ms per tick (sync position, one `setFrame` on frame change).

---

## 4. PickupPolicy (`src/systems/PickupPolicy.js`)

```js
PickupPolicy.mode            // Settings.data.pickup: 'auto' | 'still' | 'button'  (default 'auto')
PickupPolicy.mayTake(src, p, dt) -> bool     // src: station | workshop | boathouse | pile; per-source dwell timers
PickupPolicy.mayGather(node, p) -> bool      // trees/rocks/wheat/net/animals
PickupPolicy.held                              // the HUD 줍기 button is pressed (button mode)
```

| Mode | Pads (outputs, piles) | Gathering |
|---|---|---|
| `auto` (켜기) | v4.1: on contact | `stillDelay` 0.08 s |
| `still` (멈추면) | only after the chief's speed has stayed < 20 px/s on the pad for `pickup.stillS` 0.45 s; walking across never grabs | `stillDelay` → `pickup.gatherStillS` 0.35 s |
| `button` (끄기) | never automatically; a round **줍기** button (UI, above the joystick corner) appears while the chief stands on a takeable pad; press = one batch up to capacity, hold = stream | only while 줍기 is held |

- One call site per path: `Game.handlePlayerPads` (stations, workshops, boathouse), `Game.updateLabour` (piles),
  `Player.update` (gathering). Deliveries (feeding inputs, shelves, sites, the warehouse, the dock) are unchanged:
  putting down is never the problem the designer described.
- The tutorial forces `auto` until `firstSale` + `hire_fisherman` (the opening teaches by walking onto pads); a
  toast explains the setting the first time the chief walks over a full output in `still`/`button` mode.
- Settings: the panel already has 7 rows at a 90 px pitch with two buttons below; v4.2 splits it into two tabs —
  **소리·화면** (the 7 existing rows) and **놀이 도움** (물건 줍기 · 길 안내 · 관망 모드 · 촌장 광채 표시). `Settings.data`
  gains `pickup: 'auto'`, `nav: true`, `observer: false`, `observerIdleS: 8`, `pilotSpends: false`, `aura: true`
  (validated in `Settings.load()` like `gfx`).
- Bots and tests run with `auto` (no behaviour change, ±0 % pacing).

---

## 5. Navigator (`src/systems/Navigator.js`)

### 5.1 Destination

- Item = the most numerous type in the chief's bag (ties: the top of the tower).
- `dest = tutorial.destination(type)` — already ordered: sites / hire pads / food box / workshops (PRIO ≥ 50), the
  loading dock when shelves are full or a card is stuck, the store, the warehouse, shelves, the station input.
  v4.2 extends it: the Depot's inbound (our loading dock) as the last resort for surplus (§6), and returns
  `{ pad, key, label, sink }`.
- Mixed bag: the navigator shows the destination of the first type that has one; the destination chip shows
  "2곳" when two types go to different places (tap the chip to cycle).
- Nothing takes it: no path; the chip says where it will be possible ("판매대가 가득 · 잠시 후") — the same
  `stationBlocked` / shelf-room checks the tutorial uses.

### 5.2 Path and rendering

- Route: `gs.roads.route(p.x, p.y, pad.x, pad.y, out)` (the v2/v4 walk graph with RoadNet merged; A* on ≈ 250 nodes,
  ≈ 0.1 ms) — straight line when the destination is closer than 360 px.
- Replan when the destination changes, every 0.5 s, or when the chief is > 96 px from the path; never more than
  4 times per second.
- Draw: up to 28 pooled Images (`fx_dust` from the core `fx_particles` atlas, tinted `#ffd86b`) every 44 px along the
  route at `DEPTH.GROUND_DECAL + 10`; a marching phase (dots slide toward the target at 60 px/s), alpha 0 within 60 px
  of the chief and fading in over the next 120 px. Destination: a pulsing `fx_ring` ellipse, the item icon bobbing over
  it, a float label "판매대 · 18 m" (metres = route length / 64).
- Off screen: the UI's edge arrow is generalised (`UI.edgeArrows[]`): the tutorial arrow stays orange, the navigator's
  is gold with a small item icon. If `tutorial.target` already points at the same pad, the navigator hides its ring and
  edge arrow (one arrow, never two) and keeps the dots.
- Off when: `Settings.data.nav === false`, the bag is empty, a panel is open, the ceremony runs, or the tutorial's
  first-sale lesson is active.

### 5.3 Cost

≤ 32 display objects only while carrying, 0 extra draw calls, ≤ 0.02 ms per tick averaged (route ≤ 0.15 ms per
replan), no textures.

---

## 6. Surplus and the 솔방울 물류센터 (Depot)

### 6.1 The loop

```
gatherers → piles ─┐                       (raw surplus: pile ≥ 95 % for 30 s)
stations → outputs ┼─ station porters (역 짐꾼 ×2 → ×4) ─→ our loading dock (짐 싣는 곳)
warehouse (> 70 %) ┘                       (finished surplus: output ≥ 60 % for 20 s, PRIO.DEPOT 12)
our loading dock ─→ boxcar / flatcar at every dwell (≤ 48 items rank 1, 80 at 읍)
town station freight pad ─→ FreightVan (40 items) ─→ depot docks ─→ forklift ─→ racks
racks ─→ (1) town founded shops restock (van)  (2) standing order cards  (3) town buyers at the counter (export coins)
depot till (물류 금고) ─→ 수금원 / chief ─→ bank
```

The train becomes the visible pipe (designer asks 2 and 3 meet here): the freight cars show what leaves; their
capacity is the honest bottleneck for surplus, upgraded by the 읍 consist.

### 6.2 Location (forward compatible with v8)

- Building: the v8 site **`c_logistics`** L(50.09, −30.97) = (4344, 3909), footprint i 46.20–53.98, j −33.80…−28.14,
  art `logistics_center` (cutaway, 11 × 8 m). Measured (`occupancy.mjs` dump of a late v4.1 save + `scan_big.py`):
  inside the v4.1 world an 11 × 8 m footprint (+0.8 m margin) fits only on land other plans already hold — `west_s`
  around (−700, 3000) (v5's XL plots `ws_x1–3`) and the rail/town south band around (3500, 2500–3000) (v4 house lots
  H1–H5, v5 row D).
- Region: v4.2 opens v8's region **`newtown` `[3000, 3450, 5200, 4600]`** early (`openFlag: 'depotLand'`) and sets
  `WORLD.height` 3450 → **4600** (v6 later sets 4864 as planned). v8 then finds the region open.
- Streets (dirt in v4.2, appended to `WORLD.v4.streets` with the **v5/v8 ids** so later patches upgrade instead of
  duplicating): `ave_s` (Y, i 30–34, j −22.2…−18), `bank_st` (X, i 23.1–40.9, j −24.2…−22.2), `ave_c` (Y, i 36–40,
  j −34…−24.2), `lgx_st` (X, i 35–54.2, j −36…−34). They also give the bank its street.
- Border trees along the new region's outer south and west edges like every region (kept off the four streets);
  fog only while closed.
- Layout gate: `tools/test/v42_layout.mjs` (Node) checks every new rect against RoadNet cells, v4 buildings, lots, the
  coast, and the v5/v8 tables (`docs/v5_v8_plan.md` §4.2/§4.5) with a 0.12-cell margin.

### 6.3 Model (`src/systems/depot/Depot.js`, pure; `src/systems/depot/rack.js`)

- Stock by item, grouped into v8's six categories (`materials`, `food`, `goods`, `tools`, `furniture`, `appliances`);
  caps from v8's tuning (`materials 160, food 160, goods 120, tools 60, furniture 40, appliances 30`). v4.2 fills only
  the first four.
- `rack.js` is a **copy** of v8's pure `catalog.js` + `rackFill()` (header names the source file and git sha);
  `tools/test/depot_parity.test.mjs` imports both (test-only) and asserts identical rack output for 300 random stocks.
  At v8 integration the copy is deleted (the adapter calls the module).
- Inbound: crates from the freight pad (by van); outbound: shop restock orders, standing cards, counter sales.
- Sinks (`Logistics`): a remote sink at **`PRIO.DEPOT = 12`** (above the v3 warehouse's STORE 10: the warehouse stays
  the local buffer for restocking, the depot takes what the village cannot use) at our loading dock — the dock's
  `accepts(ty)` becomes `needOf(ty) > 0 || depot.wants(ty)`; `prio` FOUNDING 38 / WHOLESALE 30 / DEPOT 12.
- Raw items are accepted (category `materials` / `food`), with export prices from `BALANCE.v42.depot.rawPrice`
  (fish_raw 1, log 1, wheat 1, ore 2, meat_raw 3 — **estimate**, to tune with bots).

### 6.4 Surplus rules (`Depot.surplusOf(source)`)

| Source | Surplus when | Taken by | Keeps |
|---|---|---|---|
| Station / workshop output | ≥ 60 % (`warehouse.overflowAt`) for 20 s and no sink ≥ SHELF wants it within its local radius | station porters | 30 % for the goods porter |
| Collection pile | ≥ 95 % for 30 s (`v42.depot.pileSurplusAt`, `pileSurplusS`) | station porters | 20 items (the station input is fed first) |
| v3 warehouse | > 70 % full | station porters (already source today) | 50 % |
| Boathouse catch | ≥ 90 % | dock porter / station porters | — |

Station porters: 2 today (`stationPorter: [600, 1100]`); v4.2 adds `[1600, 2200]` when the depot opens (hire pads at
the office forecourt), capacity 12 → 16 at 읍. Estimate: a plaza → station trip ≈ 2 400 px each way at 150 px/s plus
loading ≈ 40 s for 12 items → ≈ 18 items/min per porter, ≈ 72/min for four: above the freight capacity (48–80/min),
so the train, not the porters, is the visible bottleneck (to confirm with the census bot).

### 6.5 Freight on the train (ties into §10)

- At every `atOurs` dwell, `Growth.loadFreight()` moves crates from the dock to the cars that have `cargo` slots
  (`train_boxcar` 12 crate icons, `train_flatcar` 8; **1 crate icon = 4 items**, `v42.freight.itemsPerCrate`), one
  crate per 0.14 s, **independent of the camera** (the `trainIn()` fix).
- Card crates (founding / standing) keep today's payment (wholesale on acceptance at the dock); surplus crates are
  unpaid until sold at the depot.
- At `atTown`: a town station porter (townfolk `station` preset, 12 per trip) carries crates from the freight cars to
  the **town freight pad** at the alley mouth on 큰길, ≈ L(33.5, −3.4) (south end of `alley_t`; final spot by the
  layout checker — the strip between the rails and the shop row at j −1.9 is too thin for a pad). The dwell never
  waits for him: crates still aboard ride back and forth until unloaded. The van stops in its lane beside the pad and
  loads 40 items per trip.
- Saved: crates on the dock, in the cars and on the town pad (`v42.freight = { dock: {item: n}, cars: {...}, town: {...} }`),
  so nothing vanishes on reload (today's rule for porters).

### 6.6 Vans, forklift, staff (view + light sim)

- **FreightVan** (`src/entities/FreightVan.js`): the first road vehicle. Route = `RoadNet.route(freightPad, dock1,
  { mode: 'drive' })` (the v4 lane graph, unit-tested in v4, never driven). Lattice streets only (art has SE/NE +
  mirrors). Stops 1.5 m before any materialised walker on its lane (v5's rule), waits at crossings via
  `rail.blocking(k)`. Analytic position while off screen (TownSim style), sprite only within view + 600 px.
  One van (`lgx_delivery_van_blue`, 4.8 MiB) in v4.2; v5's VehicleSim adopts it later (`fleet.adopt('freight', van)`).
- **Forklift** (`lgx_forklift` / `_loaded`): loops `forkliftPath` from the manifest, picks at dock 1, drops at the rack
  of the item's category, `lift` anim; only simulated while the depot is revealed or on screen.
- **Staff**: townfolk paper dolls (presets `factory` / `station` exist; v4.2 adds `depot_clerk` in code, §8.2) at the
  manifest's `staffPoints` / `staffBands` (`mid` behind the counter). v8 swaps in cityfolk `warehouse_worker` /
  `forklift_driver` when its `work` page is resident (the v8 plan's own rule).
- **Counter sales** (exports): every `v42.depot.sellEvery` 8 s while open (05:30–22:30, v8 hours) a town buyer (a
  transient walker with a seeded townsfolk look, like v4's anonymous customers — not a TownSim citizen, so v5's
  `TownSim.hold()` is not needed) walks from the street to `customerPoints`, buys
  up to 6 items of one category at `price × wholesale 0.7` (raw: `rawPrice`), coins to the depot till
  (`CashPad` at the door). Throughput cap `sellPerMin` per category (`materials 20, food 30, goods 20, tools 6`).
- Restock of town founded shops: when a shop's shelf < 40 % (`founding.restockBelow`), the van delivers from depot
  stock (the v4 station porters still deliver from the village; whichever arrives first).
- Standing cards: `depot.fillsStanding: true` → once a standing card is open, the depot moves matching stock to it at
  `cardFillPerMin` 20 (the goods are already in the town). Founding cards are never auto-filled (they are the
  player's goals).

### 6.7 Cutaway view (`src/entities/DepotBuilding.js`)

- Layers and depths straight from the manifest (`layerOrder`, `depthOffset`, `bandDepth`): `alwaysDrawn` layers
  (apron, props, dock doors, nameplate, outdoor props) always; the shell (with the dock doors and nameplate) fades on
  reveal while `shadow_open` fades in; inside layers (`back`, `floor`, `interior`, `interior_racks`,
  `interior_front`, `conveyor`, `stub`, stock, actors) exist only while revealed (the manifest's fill-rate rule).
- Reveal: tap inside `revealPoly` or the chief walks into it → `reveal.states.open` with `fadeMs` 350; second tap or
  leaving reverses. Racks drawn from `rackFill()` with `stockScale` 0.85 using `lgx_items` frames; redraw only when
  `stock.ver` changes (≤ 2 Hz).
- Residency (`Residency.REGIONS` += `depot`): the closed look needs `lgx_center_a` (shell, nameplate, dock doors),
  `_c` (the `props` layer) and `_d` (apron, outdoor props) ≈ 18.5 MiB within 800/1200 px; `_b` (interior, racks,
  conveyor, lamp) ≈ 4.9 MiB and the forklift pages only while revealed; the van page by view.

### 6.8 Porter scoring fix (`Logistics.best`, `Porter.pickPlan`)

```
score = prio + min(30, starve(sink, type) / 4) − travelS / 6
starve = seconds the sink has wanted `type` without receiving it
travelS = route length / porter speed (cached per (from, sink) pair, 0.5 s refresh)
```

- A SHELF sink empty for > 30 s gets `PRIO.SHELF_EMPTY = 75` (above INPUT 70).
- A station's goods porter serves sinks within `v42.porters.localRadius` 1500 px (ground metric) first; farther
  sinks (workshops on far plots, the dock) only when no local sink wants the item for 5 s.
- Target (bots): trade shelf mean ≥ 30 % (now 11–13 %), smelter/sawmill outputs full ≤ 30 % of the time (now 64–74 %).

### 6.9 Bug fixes that ship first (P0)

- `Growth.trainIn()` → rail state only (`running && phase === 'atOurs'`); the fly-to-wagon effect only when
  `cargoPoint()` exists, else `train.loadCargo(1)` directly. Saves with a backlog drain at the next dwells (cap the
  per-dwell load at the car capacity once §6.5 lands).
- `Boathouse.restore` clamps to `outStack.max`.
- Piles keep their "over max + 8" restore rule (v4 review L2) but the label shows "가득" not "48/40".

### 6.10 Save (`logistics` slice in v8 format + `v42.depot`)

```js
s.logistics = { v: 1, open: 1, gift: 1, tut: 1, day, seq: 0, stock: { bread: 12, ore: 80, … },   // no item_ prefix, v8 KEY rule
                orders: [], cash, chains: [], lv3: [], days: [deliveries per game day ≤ 10], made: [0, 0], tot: [settled, coins, deliveries] }
s.v42.depot = { built: 1, site: {…while building…}, van: { load: {item: n} }, porters: 2, sales: { day, n } }
```

`gift: 1` so v8 does not hand out its opening gift again; `open: 1` makes v8 skip its site. Contract test: v4.2's
slice passes `sanitizeLogistics()` from `src/city/logistics/save.js` unchanged.

---

## 7. Bank (`src/systems/Bank42.js`, `src/entities/BankBuilding42.js`)

### 7.1 Place and building

- Site at v5's `v5_bank` L(36.21, −19.93) = (4162, 3111), `town` region, XL plot (`only: 'bank'`), door on 은행길
  (`bank_st`, laid in §6.2). Art: civic `bank` cutaway (`civ_bank`, 5.0 MiB, area class within 800/1200 px), vault
  overlay anims `vault` / `vault_close`, `revealPoly`, `floorLiftPx` 18, `pointSlots` behind/front.
- Gate and cost: `v42.bank.site = { coins: 4000, item_plank: 20, item_ingot: 10, time: 14 }`, offered when the town
  is open and the office stands (balance keys; pacing is the player plan's call).
- Staff: 2 tellers (townfolk presets `teller_a/b`, §8.2) at `staffPoints[0..1]` behind the counter, a manager at
  `deskPoint`. Customers: TownSim adults with an errand at 09–17 occasionally queue at `customerPoints` (decorative,
  ≤ 3).

### 7.2 Account (v5 slice subset)

```js
s.bank = { v: 1, open: 1, sv: savings, ld: lastInterestDay, tk: nextTicket, rw: [[day, op, amount, balance], ≤ 8] }
```

- Exactly v5's `sanitizeBank` keys (no `ln`, `ins`, `so`, `t5`, `v6`). Contract test: passes `sanitizeBank()` from
  `src/bank/save.js` unchanged; v5's `BankHost` then sees `open` and never offers its own site.
- Interest: v5 numbers (`interestPerDay` 1 % at 06:00 on ≤ `depositCap` 50 000, one day per call). Over the cap a
  deposit goes to the wallet (passbook row `deposit` shows only the saved part; a toast "통장 한도 — 지갑으로").
- `Economy` (+20 lines): `spendable()` = wallet + savings when `Settings.data.bankAutoPay` (default on); `spend(n)`
  takes the wallet first, then withdraws from savings (passbook row `withdraw`). The ≈ 10 affordability checks
  (`grep economy.coins`: `UnlockPad` afford, two in the build menu, the `Game` build check, six in `Tutorial`) switch
  from `economy.coins` to `economy.spendable()`. `credit(n, 'bank')` counts income (`earned`) without touching the wallet — the courier path.
  v5's loans (P28) then run after savings are used, which is exactly v5's `quote()` order.
- HUD coin chip shows `spendable()`; a small passbook icon appears when savings > 0; tapping the chip toasts
  "지갑 1,200 · 통장 45,000".

### 7.3 Deposit visual

The courier walks to `counterPoints[0]`, coins fly to the teller, `sfx_stamp`, a passbook row; deposits ≥ 5 000 spin
the vault (`vault`, `sfx_vault` from audio6 if loaded, else `sfx_coins_many`).

---

## 8. Chief office (`src/systems/office/*`)

### 8.1 Building

- New art job **`office`** (civic pipeline, `tools/blender/civ_*`, new folder `assets/office/`): 촌장 집무실, ≈ 4.4 ×
  4.0 m, faces −Y, cutaway layers `_floor`, `_back`, `_interior`, `_front`, `_shell_cut`, `_shell` exactly like
  `bank`; props in `_interior`: the chief's big desk with a stamp and a lamp, two clerk desks with typewriters and
  ledgers, the secretary's desk with a telephone, a filing cabinet, a mail tray, a newspaper rack, a stove, a coat
  rack; on the back wall a **blank stock board** (the game draws live bars on it). Points: `staffPoints`
  (clerk 1, clerk 2, secretary), `chiefDeskPoint` + `chiefDeskPad`, `cabinetPoint`, `mailTrayPoint`, `boardRect`
  (screen-space quad with `shearY` like the depot's `nameBoard`), `doorPoint`, `mailboxPoint` (outside), `revealPoly`,
  `floorLiftPx`. Overlays: typewriter (4 frames), phone ring (2 frames). Budget ≤ 5.5 MiB, 1 atlas.
- Plot: new `w_office` (size L) next to the 마을회관 — measured free L spots at ≈ (−830, 1440) (440 px north of the
  hall plot); alternative near the plaza's west beach at ≈ (−370, 620). Both from `free_L.json`; final position after
  `v42_layout.mjs` (this scan does not include RoadNet cells, which do not reach the west strip).
- Until the art lands: the `bank` cutaway is **not** reused (a bank must read as a bank); the plot shows the v3
  scaffold stand-in, and the late-art path (`Assets.arrivals` → reskin) swaps it in.

### 8.2 Staff (paper dolls; looks from code presets)

`src/data/staffLooks.js` defines presets in the townfolk manifest's own preset format (`bases`, `tops`, `bottoms`,
`hats`, `extra`, `colors` …) and `TF.addPresets()` merges them once at init (names never collide with manifest
presets): `office_a` (top_blazer + det_tie + acc_glasses_sq), `office_b` (top_cardigan + det_lanyard), `secretary`
(top_blazer + det_lanyard + hair bun), `courier` = manifest `postal` (hat_postal + acc_mailbag), `teller_a/b`
(top_vest + det_bow), `bank_manager` (elder, top_blazer + det_tie + hat_fedora), `depot_clerk` (top_work… → `factory`).
Each staff member is saved as a seed (looks regenerate), like townsfolk.

| Who | Class | Behaviour | Anims used |
|---|---|---|---|
| 2 clerks | `OfficeClerk` (FSM) | at desk (`mid` band: the desk hides the legs) cycling `type` (idle + typewriter overlay + paper motes, 6–12 s), `phone` (talk + ring overlay), `file` (walk to the cabinet, back), `post` (walk to the outside mailbox at 16:00), lunch at 12 (walk out to the big restaurant if built, else home), go home 18:00, back 08:00 | idle, walk, talk, wave, happy |
| 수행비서 | `Secretary` (follower) | follows the chief's recorded trail 1.6–2.4 m behind (breadcrumbs every 24 px, so she never gets stuck where he walked), stops and faces him when he stops, inside buildings waits at the door; delivers letters and the morning paper (walks up, talk bubble with a letter icon → tap opens the panel); in the office sits at her desk while the chief is there | idle, walk, talk, wave |
| 수금원 | `Courier` (Hauler) | every `v42.courier.every` 90 s (or when any till ≥ 300): plans a round over till pads with value ≥ 50 (tax box, market / trade / store / restaurant / station / depot tills) by nearest-neighbour, walks `Roads` routes, `CashPad.takeAll(courier)` (coins fly into his mail bag; a coin pile on the bag), then the bank door, deposit (§7.3), back to the office; hands coins to the wallet instead when the bank is not built | walk, carry (head stack of `item_coin`), happy |

- Coins in the courier's bag are saved (`v42.office.courierBag`) and restored into his bag; on a fresh office load
  he deposits first. Conservation test: coins on pads + bag + wallet + savings is constant across a round.
- CashPad gains `takeAll(ch)` (value → caller, pile sprites fly to `ch`) next to the existing chief-only `update()`.
- Hiring: four pads in front of the office (`hire_office_a`, `hire_office_b`, `hire_secretary`, `hire_courier`;
  `v42.office.hire` costs), appearing once the office stands; the courier pad shows "은행이 생기면 입금해요" until then.

### 8.3 Panels (`src/scenes/OfficePanel.js`; ui4 art)

Opened by the chief standing on `chiefDeskPad` (or tapping the building while revealed, or the secretary's letter
bubble). Tabs, each fed by one data source:

| Tab | Source (new unless noted) | Shows |
|---|---|---|
| 재고 | **`StockLedger`** (`src/systems/StockLedger.js`): every stock of §1.2 registered with `{ id, nameKey, item, get(), cap }`; samples at 1 Hz; per-stock EWMA in/out per minute, % of time ≥ 90 % (last 5 min), "stuck full" flag (> 2 min) | bars by place (piles · 가공소 · 판매대 · 창고 · 물류센터 · 가게), colour by fill, ↑/↓ turnover per minute, a red "가득 · 일꾼이 쉬어요" tag on stuck-full stocks; the same bars are drawn on the office wall board (Graphics, 1 Hz) |
| 소식 | **`VillageNews`** (`src/systems/VillageNews.js`): an event log (`built`, `v4:train`, `v4:cardDone`, shop opened, rank, records from the ledger, visitors served, depot exports, bank interest) → one paper per game day at 06:00 with 3–5 headlines from ko/en templates (`strings.js` `news_*`) | `ui_newspaper` + masthead / column / photo / divider; the last 7 papers |
| 편지 | **`Letters`** (same file): condition rules → a letter from a named resident / townsperson (`life.residents`, `TownSim` names): thanks (new house, shop), requests ("빵이 자주 떨어져요" when the market's bread is empty > 20 % of the day), worries ("광석 더미가 넘쳐요" from a stuck-full ledger row), invitations (train trip, ceremony); ≤ 1 per game hour, ≤ 12 kept | `ui_story_card` list, read/unread, the sender's portrait |
| 통장 | `Bank42` | `ui_passbook` + rows, savings, today's interest |
| 직원 | the staff objects | where each is and what they do ("수금원: 세금 상자 → 은행"), hire / not hired |

The ui4 images (13 PNGs) and `ui4_icons` are packed into **one page** (`ui4@office`, ≈ 1.6 MiB, transient class:
loaded when the panel opens, evicted 30 s after it closes).

v5 hand-over: the story engine's `story:news` / letters can replace `VillageNews` as the source (`OfficePanel` reads an
interface `{ papers(), letters(), markRead(id) }`), and v5's missions use the same `Letters` card art.

---

## 9. Observer mode (`src/systems/pilot/*`)

### 9.1 Input hand-off (`src/core/Input.js`)

```
human = joystick or keys (Input.update as today)
if (Input.override)          -> override (bots / tests; pilot disabled)
else if (human.mag > 0.05)   -> human; pilot.yield(now)          // same frame
else if (observer && now - lastActivity > observerIdleS) -> pilot.vector()
```

- `Input.pilot` is a separate channel; nothing else in the game knows who drives.
- HUD pill "관망 중 👁" (top centre) while the pilot drives; tap = stop observer mode; the joystick always works.

### 9.2 Pilot (`ChiefPilot.js`, `agenda.js`, `work.js`, `NavGrid.js`, `CameraDirector.js`)

- **Agenda** by `DayClock` hour (`v42.pilot.agenda`, editable): 07–09 office (desk, read paper), 09–12 chores,
  12–13 lunch (big restaurant table, else campfire), 13–17 chores + one town visit by train (board at ours, ride, walk
  the town, ride back), 17–20 social (residents' chat spots, the dog, benches, campfires), 20–07 home (the
  `chief_lodge` decor at (960, 2400): walks in, fades out, `zzz` emote at the door). Without the day clock (before the
  first train) the agenda cycles by game minutes.
- **Work layer** (`work.js`): a port of the bot's `smart` policy (`chores`, `sellTask`, `cashTask`, `decide`) as pure
  functions over `gs`, minus anything that spends coins unless `Settings.pilotSpends`; tasks: collect tills, carry
  outputs to shelves / dock, operate a station whose operator is not hired, feed sites, deliver to cards. The bot keeps
  its own copy; `pilot_parity.mjs` checks both pick the same task class on 50 snapshots.
- **Life layer**: chat (`ResidentChat` canned lines with a nearby resident, both face each other, bubbles), pet the
  dog (`DogPlay` pet action), sit/warm (idle facing a fire), wave at townsfolk, read the notice board, check the depot
  (walk in → reveal), watch the train arrive.
- **Utility pick** every 0.5 s of game time: `score = need(task) × agendaWeight × (1 − fatigue(kind)) − travelS / 40`,
  hysteresis 20 %, a task runs to completion or 60 s; seeded RNG `mulberry32(hash(saveSeed, day, decisionIndex))` for
  ties and idle variety — never `Math.random`.
- **Movement**: `Roads.route` for long legs, then `NavGrid` (the bot's 20×10 px collision grid A*, moved to `src`,
  time-sliced to ≤ 3 000 expansions per frame) for the last 200 px; steering writes the joystick vector (so speed,
  collision and pad rules are the player's). **Pay pads, hire pads and the trash pad are high-cost cells**; with
  `pilotSpends` off the pilot never stops on one (the bot's `accidentalPay` counter must stay 0).
- **Stuck handling**: no progress for 3 s → side-step; 8 s → drop the task, mark the target unreachable for 60 s.

### 9.3 Camera director

Follows the chief; cuts (`camFocus`) to at most one event per 45 s, ≤ 4 s each: the train arriving at ours (when the
chief is > 900 px away), a shop opening, the vault spin, freight loading, a letter arriving (to the secretary). A
caption chip names the event. Zoom drifts to 1.0 while observing and returns to the player's zoom on hand-back.
Disabled inside panels and the ceremony.

### 9.4 Determinism and tests

The pilot's decisions are a pure function of (a state snapshot, seed, decision index); `tools/test/pilot.test.mjs`
(Node) replays 200 recorded snapshots and checks identical choices; `tools/test/pilot.mjs` (browser, fixed step,
60 game minutes from the late save): 0 coins spent (spends off), 0 stuck events > 10 s, ≥ 6 distinct activities per
game day, hand-back latency 1 frame, income ≥ 60 % of the smart bot's (it does chores, not optimisation).

### 9.5 Cost

Decision ≤ 0.05 ms amortised; A* slices ≤ 1.5 ms in the worst frame; camera director ≤ 0.01 ms.

---

## 10. Train: topology, longer consist, engine-first

### 10.1 Topology decision

| Option | Engine-first both ways | Track / art work | Dwell | Verdict |
|---|---|---|---|---|
| Push-pull (v4.1) | no | none | 14 / 10 s | the complaint |
| Run-around loop + turntables at both ends | yes | siding, turnouts, turntable art (none exists); 25–30 s shunting per end | +50 s per cycle | too slow, art-heavy |
| Balloon loop / wye at both ends | yes | curved rails (none), ≥ 6 m radius, no room at the buffer end (coast + link road) | — | no room |
| **Top-and-tail** (an engine at each end) | **yes** | none; the engine's SE frames already exist | unchanged | **chosen** |

### 10.2 Consist (`Rail.consist()` returns `{ key, off, face, lead }`, NW → SE)

| Rank | Order (NW → SE) | Length nose-to-nose |
|---|---|---|
| 마을 | E(face NW) · coach · boxcar · E(face SE) | **11.20 m** |
| 읍 | E · coach A · boxcar · flatcar · coach B · E | **17.20 m** |

Anchor spacing = back coupler of the front car + front coupler of the rear car (manifest rule): engine front 1.38 /
back 1.22, coach ±1.55, boxcar / flatcar ±1.45 (art contract §12.3). Coaches sit at both ends of the freight so each
station's platform has a coach: coach A at ours, coach B at the town.

### 10.3 Stops (by the leading nose, not by car_a)

| | Rank 1 at ours | Rank 1 at town | 읍 at ours | 읍 at town |
|---|---|---|---|---|
| NW nose / SE nose (i) | −0.75 / 7.17 | 23.68 / 31.60 | −0.75 / 11.41 | 19.44 / 31.60 |
| Coach at platform (i) | 2.18 (서리역 2.5) | 26.61 (솔방울역 28) | A 2.18 | B 28.67 |
| Boxcar (i) | 4.31 (짐 싣는 곳 4.1) | 28.74 | 4.31 | 24.49 |
| Crossing 8 / 33 | open, 1.88 m / — | — / open, 2.69 m | **covered** / — | — / open, 2.69 m |
| Leg / cycle | 34.55 m, 17.1 s / **58.2 s** (v4.1: 36.06 m, 17.7 s / 59.3 s) | | 28.55 m, 14.8 s / 53.5 s | |

- 읍 covers crossing 8 during the dwell at ours. Crossing 8 only connects the station square to the platform
  (`xing_ours` + `walkExtra ['x', 1.0, 0.8, 8.5]`), so v4.2 adds a **buffer-end walkway** around `rail_x_end_n`
  (`walkExtra ['y', −1.7, −1.6, 1.0]` + `['x', 1.0, −1.7, 0.8]`) that never crosses the rails; `Neighbours.platformRoute()`
  prefers it while the train dwells at ours. Visitors are never cut off from a dwelling train. The layout checker
  verifies the walkway against the station's collision circles (j 2.7–2.9) and the buffer.
- Town: the SE nose stops at i 31.6 so crossing 33 stays open (≥ 1.6 m `BLOCK_NEAR`).
- `rail.mjs` gains: lead engine faces the direction of travel in 100 % of moving frames; the coach is within the
  platform polygon at each stop; no crossing covered at the town; covered at ours only when the walkway exists.

### 10.4 View (`Train.js`)

- Each car has `face` (−1 NW: NE frames flipped; +1 SE: SE frames) and plays `move` when moving toward its face,
  `move_rev` otherwise (cars are symmetric, drawn NW).
- Smoke, whistle and headlamp from the **leading** engine (`lead = face === sign(v)`); the trailing engine plays
  `idle` with a small steam puff every 2.5 s and a red tail lamp glow at night.
- Shadows `shadow_NW` / `shadow_SE` per face. Labels: station-square float labels gain a `avoidRect` for the train's
  span while it dwells (the coach is no longer covered by "역앞 카페 0/30").
- Backward compatible: a consist without `face` (the v6 coast line) is drawn exactly as today.

### 10.5 Pages and memory

| Page | MiB | Note |
|---|---|---|
| `train_engine@ne` (existing) | 1.84 | |
| `train_engine@se` (pack_pages keeps SE frames + `shadow_SE`) | ≈ 1.9 | no new render |
| `train_coach@ne` (new art) | ≈ 1.5 (estimate: 1.4 × car_a area) | |
| `train_boxcar@ne`, `train_flatcar@ne` (new art) | ≈ 1.3 + 1.2 | |
| `train_car_a`, `train_car_b` | dropped from the consist (kept for v6's coast line) | −1.84 when v6 is not running |
| Total near the train | ≈ 7.7 vs 3.7 today | regionBld class, both stations |

---

## 11. Save v7 and migration

```js
SAVE_VERSION = 7
MIGRATE[6] = (s) => ({ ...s, v: 7 })            // additive: every v4.2 system starts empty
s.v42 = {
  v: 1,
  office:  { built, site, staff: { a: seed|0, b: seed|0, sec: seed|0, cour: seed|0 }, courierBag: n, read: [letterId ≤ 32] },
  news:    { day, papers: [[day, [headlineId, args…] ≤ 5] ≤ 7], letters: [[id, kind, from, day, read] ≤ 12], seq },
  freight: { dock: { item: n }, cars: { item: n }, town: { item: n } },
  depot:   { built, site, van: { item: n }, porters, sales: { day, n } },
  train:   { cons: 1|2 },                       // consist rank (derived from rank anyway; kept for the 읍 swap moment)
  ledger:  { full: { stockId: secondsFull } },  // ≤ 40 entries, for the letters' "stuck" rules
  pilot:   { seed },
}
s.bank       = { v: 1, open, sv, ld, tk, rw }   // v5 format (src/bank/save.js)
s.logistics  = { v: 1, open, gift: 1, tut: 1, day, seq, stock, orders: [], cash, chains: [], lv3: [], days, made, tot }   // v8 format
```

- `sanitizeV42` (new, in `Save.js`): ints clamped, unknown items dropped (items.js + the v8 catalogue keys), seeds
  uint32, arrays capped. `sanitizeSave` keeps `bank` / `logistics` through local copies of the module rules (no
  runtime import); the contract tests (§14) compare against the module sanitizers.
- Migration from v6 (v4.1): nothing removed; the dock backlog in `v4.growth.cargo` moves into `v42.freight.dock`
  (capped to 3 train loads; the rest is dropped — every one of those crates was paid at the wholesale rate when the
  dock accepted it, so they are only a picture); the boathouse catch clamps; `WORLD.height` change moves nothing (the new strip is south of everything).
- Size: +≈ 2.2 KB worst case (papers 0.9, letters 0.6, slices 0.5) → ≤ 8 KB total, write ≤ 1 ms.
- **v5–v8 impact**: their P2 patches must use 8, 9, 10, 11 (all their `MIGRATE` steps are pass-through, so the change
  is mechanical); their sanitizers already keep slices of modules that are not running.
- Settings (not in the save): `pickup`, `nav`, `observer`, `observerIdleS`, `pilotSpends`, `aura`, `bankAutoPay`.

---

## 12. Budgets

### 12.1 Textures (Phaser source-sum, the v4 probe)

| View | v4.1 measured | v4.2 adds | v4.2 gate |
|---|---|---|---|
| Plaza (village) | 323 | aura glow page 2.0 + halo 0.03; staff dolls use resident townfolk pages | ≤ 331 (v4.1 + 8) |
| West strip with hall + office | — (hall view) | office page ≈ 5.5, office panel ui4 page 1.6 (transient) | ≤ hall view + 8 |
| Station square, train in | — | train pages +4.0, freight crates (items atlas, resident) | ≤ v4.1 + 8 |
| Town south (bank) | — | `civ_bank` 5.0 | ≤ town view + 8 |
| **Depot, revealed** | new | lgx closed 18.5 + inside 4.9 + forklift 7.6 + van 4.8 + items 0.3 ≈ 36; village and town pages out by hysteresis | **≤ 300** |
| Full tour peak | 381 | the above, never together (area classes 800/1200 px) | must ≤ 455; ≤ 395 |

`Residency.REGIONS` gains `office`, `bank`, `depot` (and `depotInside` acquired only by the reveal).

### 12.2 Logic, objects, draw calls

| Item | Budget (fixed-step bench, avg ms per tick) |
|---|---|
| Aura + navigator + pickup | ≤ 0.03 |
| StockLedger (1 Hz, ≈ 40 rows) + news/letters (event-driven) | ≤ 0.02 |
| Courier, secretary, 2 clerks, 2 tellers (LOD: sprites only near view) | ≤ 0.05 |
| Depot sim + van + forklift (analytic when far) | ≤ 0.08 near, ≤ 0.01 far |
| Pilot (when on) | ≤ 0.05 (+ A* slices ≤ 1.5 ms worst frame) |
| **v4.2 total** | **≤ 0.25 ms** |

Display objects: plaza +5 (aura) +≤ 32 (navigator while carrying) +≈ 16 (secretary rig) → the 1700 gate is already
missed (1950); v4.2 must not add more than 60 there and should land the v4 backlog item "pile items as one baked
image per pile" (in v3.5, 849 of 1816 display objects were pile item images; re-measure at P0) — §15 P0.

Draw calls: 0 new blend modes; the depot interior adds up to 3 pages in one view → ≤ 12 still holds (gate).

### 12.3 Files (the real wall) and art jobs

- Today: 491 files + page; limit **511 per version**. v4.2 needs (estimate): office 2, bank 2, depot 16 (8 atlases ×
  png + json: center a–d, items, forklift, forklift loaded, one van), train 4 pages × 2 = 8, ui4 pack 2, manifests 3
  (civic, logistics, office) → **≈ 33 files**.
- **File diet (P0)**, before any art (counted from `dist/artifact_files.json`):
  - Audio sprites: one-shot sfx of `assets/audio` (36), `audio2` (25, minus the `sfx_lute` loop), `audio3` (14, minus
    the trot / engine loops) → one sprite mp3 + one JSON per fragment (`tools/build/audio_sprite.py`, ffmpeg concat
    with 50 ms gaps; `Audio.js` maps a key to `sm.playAudioSprite(fragment, key, cfg)` — Phaser's own API; loops and
    music stay separate files): **≈ −65 files**.
  - Portraits: **54** files today → one portrait atlas + JSON (the v4 plan's unfinished item): **−52 files**.
  - ui4 (not shipped yet): ship as 1 page + 1 JSON instead of 14 files (v5 gets them packed too).
  - Result ≈ 491 − 117 + 33 ≈ **407 files**: ≈ 104 headroom for v5.
- Art jobs (Blender at `/tmp/bvenv`, new folders only):
  - `train2`: `train_coach` (3.1 m, cream-and-forest-green body, dark green roof — not red; 4 lit windows per side
    with passenger heads; end doors and buffers), `train_boxcar` (2.9 m, brown planks, pinecone emblem, sliding
    door), `train_flatcar` (2.9 m, low stake deck, `cargoGrid` 4×2 crate cells); NE heading only + `shadow_NW`,
    `idle` 1 frame + `move` 8 frames at 12 fps (the engine's wheel rule), `couplerM`, `cargoPoint(s)`,
    `lampPoint` (window glow), `boardPoint`.
  - `office`: §8.1.

---

## 13. File-by-file changes

**New**

| File | Purpose |
|---|---|
| `src/entities/ChiefAura.js` | §3 halo, rim glow, motes, pip, tiers |
| `src/core/GlowBake.js` | §3.2 chunked silhouette-glow bake into a CanvasTexture |
| `src/systems/PickupPolicy.js` | §4 |
| `src/systems/Navigator.js` | §5 |
| `src/systems/StockLedger.js` | §8.3 registry, 1 Hz sampling, EWMA flows, stuck-full flags; also the census hook for tests |
| `src/systems/VillageNews.js` | §8.3 event log → papers, letters rules |
| `src/systems/Bank42.js` | §7 account (v5 slice), interest, autopay, credit |
| `src/entities/BankBuilding42.js` | civic bank cutaway, tellers, vault, deposit visual |
| `src/systems/depot/Depot.js` | §6.3–6.6 model + light sim (stock, surplus rules, sales, cards, restock) |
| `src/systems/depot/rack.js` | §6.3 copy of v8 `catalog` + `rackFill` (parity-tested) |
| `src/entities/DepotBuilding.js` | §6.7 cutaway view, racks, forklift, staff |
| `src/entities/FreightVan.js` | §6.6 lattice-street van on RoadNet drive routes, analytic off screen |
| `src/systems/office/Office.js` | plot/site, building, hire pads, staff orchestration, panel entry |
| `src/entities/OfficeBuilding.js` | office cutaway + live wall board |
| `src/entities/staff/OfficeClerk.js`, `Secretary.js`, `Courier.js` | §8.2 |
| `src/scenes/OfficePanel.js` | §8.3 tabs |
| `src/data/staffLooks.js` | §8.2 code presets |
| `src/systems/pilot/ChiefPilot.js`, `agenda.js`, `work.js`, `NavGrid.js`, `CameraDirector.js` | §9 |
| `tools/build/audio_sprite.py`, `tools/build/portrait_atlas.py` | §12.3 file diet |
| `tools/test/review_gameplay_census.mjs` | promoted `census.mjs` (stock census + flows, `--patch` hooks) |
| `tools/test/v42_layout.mjs`, `v42.mjs`, `pickup.mjs`, `nav.mjs`, `pilot.mjs`, `pilot.test.mjs`, `depot.test.mjs`, `depot_parity.test.mjs`, `bank42.test.mjs`, `save_v42.mjs`, `shots_v42.mjs` | §14 |

**Changed**

| File | Change |
|---|---|
| `src/scenes/Game.js` | construct Aura (with the player), PickupPolicy, Navigator, StockLedger, VillageNews, Office, Bank42, Depot, Pilot behind their gates; `handlePlayerPads` / `updateLabour` call `PickupPolicy.mayTake`; serialize / restore `v42`, `bank`, `logistics`; `__FV.v42` hooks (`state`, `ledger`, `pilot(on)`, `depot(stock)`, `office(build)`) |
| `src/entities/Player.js` | `PickupPolicy.mayGather`; aura sync |
| `src/core/Input.js` | pilot channel + hand-off (§9.1) |
| `src/core/Save.js` | `SAVE_VERSION 7`, `MIGRATE[6]`, `sanitizeV42`, slice keep-rules, Settings keys |
| `src/systems/Economy.js` | `spendable()`, `credit()`, savings fallback in `spend()` |
| `src/entities/UnlockPad.js`, `src/scenes/UI.js`, `src/systems/Tutorial.js` | affordability via `spendable()`; UI: settings tabs, 줍기 button, generalised edge arrows, observer pill, coin chip breakdown |
| `src/systems/Tutorial.js` | `destination()` returns `{ pad, key, label, sink }` and knows the depot dock |
| `src/systems/Logistics.js` | `PRIO.DEPOT 12`, `PRIO.SHELF_EMPTY 75`, scoring with starvation and travel (§6.8) |
| `src/entities/Worker.js` | `Porter.pickPlan` local-first; `StationPorter.think` sources += piles (raw surplus) and the depot dock; more station porters |
| `src/systems/Growth.js` | `trainIn()` fix; dock accepts depot surplus; `loadFreight()` per car capacity; town freight pad; `v42.freight` |
| `src/entities/Seller.js` (`CashPad`) | `takeAll(ch)` |
| `src/entities/Boathouse.js` | restore clamp |
| `src/systems/Rail.js` | consist with `face`/`lead`, stops by leading nose, `legFor(consist)` |
| `src/entities/Train.js` | per-car face, lead engine effects, SE pages, label avoid rect |
| `src/systems/Neighbours.js` | buffer-end walkway routing, coach doors as board points, consist swap at 읍, freight unload event |
| `src/core/Townfolk.js` | `TF.addPresets(obj)` (merge-only) |
| `src/core/Residency.js` | areas `office`, `bank`, `depot`, `depotInside`, transient `ui4@office` |
| `src/systems/Territory.js` | region `newtown` with `openFlag: 'depotLand'` |
| `src/data/world.js` | `height` 4600, territory `newtown`, plots `w_office` (L), `v5_bank` (XL, only bank), `c_logistics` (XXL, only depot), streets `ave_s`, `bank_st`, `ave_c`, `lgx_st`, walkway `walkExtra`, rail `stops: { ours: { nose: −0.75 }, town: { nose: 31.6 } }`, town freight pad |
| `src/entities/Site.js` | size `XXL` (2×2 L stage sprites) |
| `src/data/balance.js` + `balanceCheck.js` | `v42: { aura, pickup, nav, depot, freight, porters, bank, office, courier, pilot, train: { consist: { 1: […], 2: […] } } }` with ranges |
| `src/data/strings.js` | ≈ 160 keys ko + en (settings, panels, news / letters templates, staff, depot, bank) |
| `src/core/Audio.js` | audio-sprite playback (offset/duration), same API |
| `tools/build/pack_pages.py` | keep `train_engine` SE frames; new train cars; ui4 page; portrait atlas |
| `tools/build/build_artifact.mjs` | new fragments, sprite audio, batch order |
| `tools/test/review_gameplay_bot.js` | `--pickup` / `--observer` options; stays `auto` by default |

---

## 14. Tests and bot targets

**Node**

| Test | Checks |
|---|---|
| `depot.test.mjs` | stock = in − out per category; caps; surplus rules (fixtures); sales ≤ `sellPerMin`; cards filled only standing |
| `depot_parity.test.mjs` | `rack.js` vs `src/city/logistics/model/stock.js` `rackFill`: identical on 300 random stocks |
| `bank42.test.mjs` | conservation (wallet + savings), interest once per day at 06:00 on ≤ cap, overflow to wallet, autopay order; slice passes `src/bank/save.js` `sanitizeBank` unchanged |
| `pilot.test.mjs` | determinism over 200 snapshots; never chooses a pay pad with `pilotSpends` off |
| `v42_layout.mjs` | §6.2 / §8.1 / §10.3 geometry: no overlaps with RoadNet cells, lots, buildings, coast; walkway clear |
| `save_v42.mjs --node` | v6 → v7 on real v4.1 saves (`v4_final/bots/*`), fuzz 300 variants, round trip, `logistics` slice passes `sanitizeLogistics` |

**Browser (fixed step)**

| Test | Checks |
|---|---|
| `pickup.mjs` | each mode × each path (output, workshop, boathouse, pile, gather): walking across takes 0 in `still`/`button`; standing 0.45 s takes; tutorial forces `auto` |
| `nav.mjs` | destination equals `Logistics.best` for 40 bag states; path length within 15 % of A* optimum; ≤ 32 objects; one arrow when the tutorial points at the same pad |
| `rail.mjs` (extended) | §10.3 assertions; cycle 58 ± 1 s (rank 1); visitors reach the platform during a dwell at 읍 |
| `v42.mjs` | office build → hire → courier round deposits every till ≥ 50 within 180 s; secretary never > 4 m behind after 2 s; letters ≤ 1/hour; depot reveal shows racks equal to stock; van round trip completes; crates conserved dock → cars → town pad → depot |
| `pilot.mjs` | §9.4 |
| `texbudget.mjs` + `review_robust_drawcalls.mjs` | §12 gates |
| `shots_v42.mjs` | aura day/night/zoom 0.6; navigator path + edge arrow; settings tabs; both engines at each station; freight loading; office cutaway with staff; panels (5 tabs); bank vault; depot revealed; observer pill — phone 390×844 and 360×640 en |

**Bots** (`review_gameplay_census.mjs`, smart / arrow / arrow-only, fresh and the v4.1 45-min save):

| Target | v4.1 measured | v4.2 gate |
|---|---|---|
| Collection piles at ≥ 90 % (late game, depot open) | 89–100 % of the time | ≤ 60 % (train capacity bounds what can leave) |
| Smelter / sawmill output at ≥ 90 % | 74 / 64 % | ≤ 30 % |
| Trade shelf mean (plank / ingot) | 13 / 11 % | ≥ 30 % |
| Loading-dock backlog | 1 540 crates, +37/min | ≤ one train load |
| Boathouse catch | 103 % of cap | ≤ 100 % |
| Pacing to 5 shops / 읍 | 37.8 / 47.7 min (smart, `v4_verify.md`) | ±5 % |
| Errors, stuck events | 0 / 0 | 0 / 0 |
| Pilot 60 min from the late save | — | 0 spent, 0 stuck > 10 s, ≥ 6 activities/day |

---

## 15. Implementation order (each phase ends green)

1. **P0 Foundations (no visible feature):** dock-loading and boathouse fixes; file diet (audio sprites, portrait
   atlas, ui4 page); StockLedger + census bot in `tools/test`; pile items baked to one image per pile (display
   objects); `Settings` keys and the two-tab settings panel.
2. **P1 Chief:** ChiefAura, PickupPolicy, Navigator (+ tests, shots).
3. **P2 Train:** pack the engine's SE page; `Rail`/`Train` faces and stops with the **existing** car art (engine ·
   car_a · car_b · engine works today); walkway; then swap in the new car art when the `train2` art job lands.
4. **P3 Office + bank + courier:** office plot with stand-in art, staff, panels; Bank42 + building; Economy autopay;
   save v7 (bank slice).
5. **P4 Depot:** newtown region and streets, site, model, freight on the train, van, cutaway view, porter scoring,
   logistics slice.
6. **P5 Observer:** pilot work layer, life layer, camera director.
7. **P6 Polish:** balance pass with the census bots, soak 20 min, budgets, artifact, designer screenshots, report.

---

## 16. Risks

| Risk | Mitigation |
|---|---|
| Top-and-tail reads as "an engine at the back" to a sharp eye | the trailing engine idles (no smoke, tail lamp), the lead one steams; if rejected, P2 already isolates `face` so a later run-around (v6 harbour through-station) is a data change |
| Opening `newtown` early collides with v8's plan | v4.2 uses v8's exact rect, site and street ids; v8 finds them open/laid (documented in §17) |
| Depot exports raise income | throughput is capped by freight capacity (48–80 items/min) and `sellPerMin`; raw prices low; bots gate pacing ±5 % |
| Autopay surprises ("my savings went to a pad") | passbook row + toast on every withdrawal; setting `bankAutoPay` |
| Pilot spends or blocks the player | spending off by default, pay pads high-cost, hand-back in the same frame, pilot disabled while `Input.override` (bots) |
| Runtime glow bake cost on weak phones | chunked per anim; skipped on low tier (`aura.mode 'ring'`) |
| File limit | P0 diet before any art; build fails above 480 files |
| New art late | every feature has a stand-in: existing train cars, scaffold for the office, townfolk staff |
| Freight van is the first road vehicle | RoadNet drive mode exists and is unit-tested; one van, lattice streets only, stops for walkers; v5 VehicleSim adopts it |
| Display objects over gate already | P0 pile baking (v3.5: 849 pile item images) before v4.2 adds any |

---

## 17. What v5–v8 integration must know

- `SAVE_VERSION`: v4.2 = 7; v5 = 8, v6 = 9, v7 = 10, v8 = 11 (P2 renumber).
- `bank` slice may already exist with `open: 1` (built by v4.2 at `v5_bank`): `BankHost` skips `siteCheck`; its
  `BankBuilding` should adopt v4.2's tellers (or remove `BankBuilding42` at integration — the adapter is one line in
  `Game.js`).
- `logistics` slice may exist with `open: 1`, `gift: 1`, `tut: 1` and stock: the v8 module shows the centre at
  `c_logistics` immediately; `src/systems/depot/*` is removed at v8 integration (its `rack.js` is the parity copy).
- Region `newtown` may already be open; streets `ave_s`, `bank_st`, `ave_c`, `lgx_st` already exist as dirt (P19:
  upgrade by id, do not append).
- `Train` view understands `face`; the coast line keeps working without it.
- `Economy.spendable()` / `credit()` exist; v5 P28 loan offers run after savings (same order as `Account.quote`).
- `VillageNews` / `Letters` sit behind `{ papers(), letters(), markRead() }`; the story engine can replace the source.
- `TF.addPresets()` exists for code-side presets.
