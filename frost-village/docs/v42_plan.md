# v4.2 binding design: 촌장의 하루 (the chief's day)

Status: **binding** for the v4.2 build (CODE-1, then CODE-2). Supersedes `docs/v42_plan_player.md` and
`docs/v42_plan_tech.md` wherever they differ; both stay as background reading (their measurements are quoted here).
Art contract: `docs/CONTRACT_V42.md`. Designer summary (Korean): `docs/기획서_v4_2_촌장.md`.
Inputs: the designer's v4.1 feedback (5 requests), `docs/v4_plan.md`, `docs/build_reports/v4_*.md` + `v4_verify.md`,
`docs/v5_v8_plan*.md`, the manifests of `town`, `civic`, `logistics`, `vehicles`, `cityfolk`, `townfolk`, `fx_city`,
`characters`, and the v4.1 code (HEAD 56a97d1, save version 6).
Map picture: `docs/previews/v42_plan_player_map.png` (positions below differ by a few tens of px: §9 is binding).

Designer feedback (verbatim, condensed):
1. 촌장이 마을 사람과 비슷해서 잘 모를 때가 있네 → 버프? 광채? · 물건 있는 쪽으로 가면 무조건 잡던데 → 설정에 온/오프 ·
   어떤 물건 잡으면 어디로 가야 하는지 → 네비게이션.
2. 마을 물건 재고가 넘쳐나는 곳 → 회전율 체크, 남는 것은 거대 물류창고로.
3. 승객용 객차·화물칸이 없네 → 만들어서 달고, 들어오고 나갈 때 뒤로 나가던데 → 앞으로.
4. 촌장 사무실 (사무직 2, 수행비서 1, 세금·코인을 은행에 입금하는 직원 1), 사무실에서 재고·뉴스·편지, 안이 보이게, 일하는 모습.
5. 내가 조종 안 하면 촌장이 알아서 일·업무·수다·하고 싶은 것 → 관망 모드.

---

## 0. Decisions at a glance

| # | Topic | Binding choice | Taken from | Why |
|---|---|---|---|---|
| 1a | Chief look | **촌장 후광**: an aurora ring on the ground under his feet that keeps the same size on screen at every zoom (≈ 45 CSS px on a 390 px phone), turns **gold and pulses while he works a station** (his existing ×1.25 work speed made visible), a soft **back glow (광채)** behind him, sparkle motes, and a **star pin** above him only when zoomed out (< 0.8), in a crowd or in 관망. 읍 adds a gold outer band. | player (ring, pin, gold state), tech (rank tiers, motes, NORMAL-blend only) | Reads at zoom 0.6, never covers anyone, works in Canvas mode, 0 extra draw calls. Rejected: shader glow (+2–3 draw calls, no Canvas), rim-glow runtime bake (weak at 0.6, CPU bake), crown/beam (tacky), costume re-render (still white on snow) |
| 1a′ | Real buff | **촌장 응원**: standing still ≥ 2 s within 200 px of working gatherers / operators makes them work ×1.1, ♪ notes rise. Only after "village complete". | player | The designer asked for a 버프; it is small, visible and cannot touch the first 20 minutes |
| 1b | Auto pickup | Setting **자동 줍기: 켬 / 멈추면 / 끔**, one `PickupPolicy` for all five take paths. 멈추면 = only after standing still 0.35 s (speed < 20 px/s); 끔 = a **줍기** hand button (tap = one load, hold = stream). Tutorial forces 켬 until the fisherman is hired; bots use 켬. | both (tech's single policy object, player's 0.35 s and labels) | The chief walks at 255 px/s, so crossing a 1.5 m pad takes ≈ 0.27 s: 멈추면 never grabs in passing |
| 1c | Navigation | **길 안내** while the bag is not empty: chevron at his feet, footprint dots along the real walking route, a pulsing ring + item badge on the destination, an edge badge when off screen, and a bottom chip `구운 생선 8 → 광장 판매대 · 12m`. Destination = **`Tutorial.destination()`** (which itself asks `Logistics.best`), so the arrow, the navigator and the porters never disagree. Mixed bag: the destination that takes the most bag items wins. | both | One source of truth; walking distance, not straight line |
| 2 | Overflow | Measured (both proposals agree): **turnover, not production**. P0 bug fixes (dock crates load only while the station is on screen; boathouse restored over its cap), porter rules F1–F3, **짐꾼 2** (F4), **가공소 2단** (F5), the coin **수금원** (F6), **direct export on the freight cars** (F7), then the **서리 물류창고** for the true surplus (F8). | both | Shelves are empty while their station outputs sit full; the warehouse holds 1–6 of 300 items; 1,540 dock crates pile up from a bug |
| 2′ | 물류창고 site | The finished 솔방울 물류센터 cutaway at **L(28.4, −27.4) = (3184, 3101)**, the only in-map 11 × 8 m spot (south of 은행길, rail/se corner), fed by a **pony cargo sleigh** from the station's 짐 싣는 곳. No world growth. Writes v8's `logistics` save slice. | player | v8's own spot needs `WORLD.height` 3450 → 4600, a new region and four streets: a C1-sized change for one building. The v8 integrator adds one placement (§17) |
| 3 | Train | **Balloon loops at both ends** (spring turnouts T1/T2, R = 1.75 cells): the engine always leads; it stops, pulls forward round the loop by the sea and leaves engine-first. New cars: **객차 솔방울호** (3.0 m, people in lit windows), **화물칸** (box car 2.6 m, sliding door), **무개화차** (flat car 2.4 m, crates). 마을: E + 객차 + 화물칸 + 무개화차 (10.6 m); 읍: + 2nd 객차 (13.6 m). | player (loops), task (flat car), tech (coach colour must not continue the red engine) | Top-and-tail still shows a backwards engine at the tail to a sharp eye; loops are a delight ("기차가 빙글") and every heading already exists in the train art (S, SE, E, NE, N + mirrors) |
| 4 | Office | New cutaway **촌장 사무실** (5.6 × 4.4 m, art job `office`) at **(110, 810)** on the 바닷가 길 between the plaza and the west village; four named staff: **셈이** (stock clerk), **소복이** (news & letters clerk), **총총이** (aide), **딸랑이** (coin courier). Panel tabs **재고 · 소식 · 편지 · 직원 · 통장**. | player (place, staff, letters), tech (StockLedger, VillageNews, panel data sources) | On the road the chief walks most; cutaway shows the work; panels read systems that exist or this plan adds |
| 4′ | Bank | **서리 은행** = the finished civic `bank` cutaway at **(−340, 570)**, next to the office (관청 거리). Deposits go to the spendable coins and a passbook row (no savings in v4.2). Writes v5's `bank` slice with `open: 1`; v5 passes `BankHost(…, { at })`. | player (place, semantics), tech (slice contract test) | The designer sees the whole coin loop in one place; tech's autopay changes ~10 affordability checks for a feature v5 owns anyway |
| 5 | 관망 모드 | Button (binoculars) or **automatic after 60 s idle** (끔/30초/1분/2분) once the village is complete. A seeded chooser (urgent chores from the tutorial's own targets, chores, lunch, chat, office, rest, train watching, dog, evening) drives the chief through the joystick channel; pay/hire pads ignore him; any touch on the village hands control back in the same frame; camera director cuts to events ≤ 1 per 45 s. | player (activities, auto 60 s, never spends), tech (input channel, determinism, director) | 8 s idle (tech) fires while the designer is just looking; reusing the arrow logic (the arrow-only bot reaches 읍) makes 관망 useful |
| — | Save | `SAVE_VERSION` 6 → **7**; block `v42`; module slices `bank` (v5 format) and `logistics` (v8 format) checked against the modules' own sanitizers. **v5–v8 renumber to 8–11.** Save gate 6 KB → 10 KB. | both | Additive migration |
| — | Budgets | Files: **P0 file diet** (audio sprites, portrait atlas, ui4 pack) before any new art: the 511-files-per-version limit is a hard wall (a third publish adds to the same version). Textures per view ≤ v4.1 + 8 MiB except the station square (+14) and the depot view (≤ 340). Logic ≤ +0.25 ms/tick. Plaza display objects: pile baking first. | tech | 491 of 511 files are used today |
| — | Split | **CODE-1** = everything without new art (placeholders: generated halo/nav textures, existing icons, scaled existing train cars, procedural loop rails, a stand-in office building); **CODE-2** = wire in the new art, then tests, screenshots, docs, publish. | task | Code never waits for art |

Order of value if the lead must cut (most → least): train loops + cars · halo/pickup/nav · overflow fixes F1–F7 ·
office + staff + bank + courier · 관망 · 물류창고 (F8; may slip to v4.3 without hurting the rest, §16.4).

---

## 1. Guardrails

1. **First 20 minutes.** Until the first sale the boot request log is byte-identical to v4.1; after it exactly **one**
   extra page (`v42_core`: chief FX + nav + ui5 icons) may load before tower_east. The halo is a generated texture from
   minute 0 (no request). Smart / arrow / think bots reach "village complete" within ±5 % of v4.1.
2. **Do not edit** `src/{story,missions,bank,vehicles,harbor,beach,city}/**`, and do not import module code at
   runtime. Tests may import the modules' save sanitizers and v8's pure `catalog.js`/`stock.js` read-only (contract and
   parity tests). Where v4.2 owns something a module takes over later it writes **that module's save-slice format** and
   keeps positions as data the module accepts (`BankHost({ at })`, a v8 `PLACES` entry).
3. **Do not edit existing assets.** New art lands only in new folders (`CONTRACT_V42.md`). Re-packing existing atlases
   into pages (`tools/build/pack_pages.py`) is allowed; source PNGs stay.
4. **Keep every v4.1 rule**: pad step-off, `waitingPay`, crash card + backup slots, `balanceCheck` clamping, publish
   batch order, the crossing rule (`BLOCK_NEAR` 1.6 m), Residency hysteresis.
5. **Designer-editable data**: numbers in `src/data/balance.js` (`v42` block, Korean comments, every key covered by
   `balanceCheck.js`), positions in `src/data/world.js` (`WORLD.v42`, Korean comments), text in `src/data/strings.js`
   (ko + en).
6. **Every v4.1 suite stays green** (smoke 53, v3 18, labour 28, dog 15, life 14, zoom, rail 33 (rewritten for loops,
   §15), town 17, v4 46, plots 34, restaurant 30, c2 39, save_v2–v4, roadnet 32, voice 29, chat 78, townfolk_runtime 8).
7. **Process**: fixed-step clock (`tools/test/fv_step.mjs`) for every logic measurement; Playwright under `nohup` + poll;
   `nice -n 15`; scratch only in the session scratchpad.

---

## 2. The arc (smart-bot game minutes; v4.1 reference in brackets)

| t | Event | Cost | Notes |
|---|---|---|---|
| 0 | 촌장 후광 (generated ring) | — | visual only |
| ~1.3 | first loop done → 길 안내 and the 자동 줍기 setting become active; `v42_core` page loads | — | tutorial used 켬 until here |
| ~20 | village complete → 관망 button appears; 촌장 응원 active | — | |
| 21.7 [21.7] | station repaired: drifts pop off the **main line and both loops**; first train = **마을 consist** | — | camera holds 2.5 s longer so the first departure round the loop is in shot |
| ~30–40 | **짐꾼 2** pads appear on lines that back up (F4) | 500–900 | needs the 창고 |
| ~38+ | **가공소 2단** pads (F5) after each line's 3rd gatherer | 900–1,600 | |
| ~43 [43.1] | hall built → **촌장 사무실 터** | 1,800 + 20 판자 + 6 주괴 | |
| 44–47 | **셈이** (500) → **딸랑이** (900, deposits at the office safe until the bank) → **소복이** (700) | | one hire pad at a time |
| ~49 [47.7] | **읍** ceremony → **읍 consist** (2nd 객차) | 11,000 | gate: 읍 ≤ +5 % of v4.1 |
| ~50 | **서리 은행 터** | 3,000 + 24 판자 + 12 주괴 | 2 tellers + manager come with it |
| ~51 | **총총이** (900) | | after 소복이 + 읍 |
| ~53 | **서리 물류창고 터** (needs 읍, the 창고 and the se land) | 6,000 + 40 판자 + 20 주괴 | sleigh + 3 workers + forklift come with it |
| ~55–60 | 역 짐꾼 3 / 4 (1,000 / 1,500), 화물칸 크게 (2,000), 썰매 한 대 더 (2,500) when offered | | offered by measured need |

Longest wait after tower_east ≤ 3 min (v4.1: 2.0–4.2). A v4.1 save at 읍 (the designer's) gets every v4.2 site on load,
one after another with a banner + arrow, after a **"새로워진 것"** card (§8.4).

---

## 3. Request 1 — the chief

### 3.1 촌장 후광 · 광채 (`src/entities/ChiefAura.js`)

| Layer | Object | Depth | CODE-1 (placeholder) | CODE-2 (art, `CONTRACT_V42` AG) |
|---|---|---|---|---|
| Ring | 1 Sprite | `DEPTH.PAD + 2` (over pads and decals, under shadows and every character) | generated `fv_halo` (CanvasTexture 192×96: 3 px ring mint `#43E0C6` → sky `#7FB2FF` → lilac `#B79CFF`, 6 px outer glow 25 %, 1 px gold inner line `#FFD36A` 60 %) | `chief_halo` 12 f loop |
| Work ring | same sprite, other frames | same | generated `fv_halo_gold` (`#FFC84A`) | `chief_halo_gold` 8 f pulse |
| 광채 (back glow) | 1 Image | chief depth − 0.5 | generated radial gradient 160×192, gold-aurora | `chief_glow_back` 8 f shimmer |
| Motes | ≤ 6 pooled Images | chief depth + 1 | `fx_sparkle` (existing fx atlas) | `chief_sparkle` 6 f |
| Star pin | 1 Image | `DEPTH.LABEL − 30` | `ui_icon_fame` (ui3) at 0.45 | `chief_marker` 4 f bob |
| 읍 band | 2nd ring sprite | ring − 0.01 | generated thin gold ring ×1.12 | `chief_halo_rank2` 1 f |

- **Size.** Ring width = `aura.ringPx` 70 world px × min(2, 1.2 / zoom) for zoom < 1.2 → ≈ 45 CSS px on a 390 px phone
  at every zoom (CSS per world px = zoom × 390/720). Pin = 22 CSS px, 14 px above the head or the top of the carried stack.
- **Motion.** Ring alpha breathes 0.75 ↔ 0.95 every 2.4 s; motes ride the ring (one turn / 6 s). Back glow alpha
  `aura.glowDay` 0.35, `aura.glowNight` 0.6 (DayClock darkness), always NORMAL blend.
- **States.** normal (aurora) · **working a station work spot** → gold ring that pulses on each work stroke + one
  `×1.25` sparkle label the first 3 times (the existing `labour.chiefSpeed` 1.25 becomes the visible 촌장 버프) ·
  carrying with nav on → a small notch on the ring points along the route · 관망 → ring alpha 0.6, slower spin, pin on.
- **Pin rule**: zoom < `aura.pinZoom` 0.8, or ≥ `aura.crowdN` 4 characters within `aura.crowdR` 160 px, or 관망; fade 0.2 s.
- **Setting** `촌장 후광: 켬/끔` (default 켬) hides ring, glow, motes and pin.
- **Cost**: ≤ 9 display objects, 0 draw calls (same NORMAL blend, multi-texture batch), ≤ 0.01 ms/tick.
- Acceptance: at zoom 0.6, 13:00 station square, 20+ dolls on screen, an independent reviewer finds the chief in < 1 s in
  5 of 5 screenshots; the ring never draws over a character.

### 3.2 촌장 응원 (real buff)

- When the chief has been still (< 20 px/s) for `cheer.still` 2 s, every gatherer, operator and porter whose work
  spot is within `cheer.radius` 200 px works ×`cheer.mult` 1.1 (station time ÷ 1.1, gather stroke ÷ 1.1) while he stays.
  ♪ (`fx_music_notes`, emotes atlas) rise from the gold ring every 1.2 s.
- Gated by "village complete" (`progress.celebrated`, the v3.5 party at ≈ 20 min); `cheer.mult = 1.0` turns it off. The smart bot never stands still for 2 s,
  so pacing is unaffected; `labour.mjs` checks the multiplier stays 1.0 before the gate.

### 3.3 PickupPolicy (`src/systems/PickupPolicy.js`)

```js
PickupPolicy.mode                         // Settings.data.pickup: 'auto' | 'still' | 'off'   (default 'auto')
PickupPolicy.mayTake(src, chief, dt)      // per-source dwell timer; src = station | workshop | boathouse | pile
PickupPolicy.mayGather(node, chief)       // trees, rocks, wheat, net, animals
PickupPolicy.held                         // the 줍기 button is held (mode 'off')
PickupPolicy.offer()                      // { icon, n, label } while a takeable source or node is within reach (HUD button)
```

| Mode (Korean) | Output pads, piles, boathouse | Gathering | Drop-offs |
|---|---|---|---|
| `auto` 켬 (default) | v4.1: on contact, one item per `padItemInterval` 0.075 s | `stillDelay` 0.08 s | unchanged (instant) |
| `still` 멈추면 | only after his speed has stayed < `pickup.stillSpeed` 20 px/s on the pad for `pickup.stillS` 0.35 s | after 0.35 s still | unchanged |
| `off` 끔 | never automatic; **줍기** button: tap = one load up to bag room, hold = stream at 0.075 s | only while 줍기 is held | unchanged |

- **Call sites** (all five): `Game.handlePlayerPads` (station outputs, workshop outputs, boathouse catch),
  `Game.updateLabour` (collection piles), `Player.update` (gathering). Deliveries are never gated.
- **Tutorial**: `auto` is forced until `hire_fisherman` is done (the first loop teaches by walking onto pads).
- **One-time tip** (auto only): the first time he grabs while crossing a pad above 60 % speed → toast
  `지나가다 주웠어요 · 설정 › 놀이 › 자동 줍기에서 바꿀 수 있어요`.
- Bots and every existing suite run `auto` (byte-identical behaviour, `labour.mjs` + `pads` reviews unchanged).

### 3.4 Navigator (`src/systems/Navigator.js`)

**When**: bag not empty, `Settings.data.nav` (default on), first loop done, not in 관망, no panel open, not in a ceremony.

**Destination.** `Tutorial.destination(type)` is extended to return `{ pad, key, label, sink, room }` and to know the
v4.2 sinks (empty shelf F1, depot dock F8). It already orders sites / hire pads / food box / workshop inputs
(`Logistics.best` with `minPrio: 50`), then the loading dock for open cards, then shelves, store, warehouse, station input.
- **Mixed bag**: evaluate every item type in the bag; the destination that takes the **most items** (capped by its room)
  wins; ties → shorter route. Chip shows `+1곳` when another type goes elsewhere; tap the chip = next destination.
- **Nothing takes it**: no path; chip `판매대가 가득 · 잠시 기다리거나 버려요` (trash pad gets a soft pulse).
- **Raw items** go to their station's work spot when nobody works it (the chief cooks), else the input pad (existing rule).

**Route.** `gs.roads.route(p.x, p.y, pad.x, pad.y)` (v2/v4 walk graph + RoadNet, cached A*); straight line under
`nav.straightUnder` 360 px. Replan when the destination changes, when he strays > `nav.strayPx` 80 px, at most once per
`nav.replanEvery` 1.0 s.

**Drawing** (pooled, 0 textures in CODE-1, `chief_fx` frames in CODE-2):
| Piece | Rule |
|---|---|
| Chevron | flat ground chevron 56 px ahead of his boots, pointing at the **next route waypoint** |
| Dots | footprint dots every `nav.dotEvery` 48 px along the route, ≤ `nav.maxDots` 16 (≈ 770 px), hidden within 90 px of him; a light wave runs toward the target every 1.2 s |
| Destination | pulsing ground ring (`nav_ring`) + badge 90 px above it with the item icon and a short name (`광장 판매대`) |
| Off screen | edge badge (`nav_edge`) with the item icon and route metres (`28m` = route px / 64) |
| Chip | bottom centre `[icon] 구운 생선 8 → 광장 판매대 · 12m`; hold = hide for this load |

- **With the tutorial arrow**: same pad → only the gold tutorial arrow + the dots show; different targets → both, the
  navigator smaller and teal.
- **Cost**: ≤ 20 display objects while carrying, ≤ 0.02 ms/tick averaged, route ≤ 0.15 ms per replan.

---

## 4. Request 2 — stock and turnover

### 4.1 What both proposals measured (read-only bot runs on v4.1, fixed step)

| Measure | Result | Source |
|---|---|---|
| Collection piles ≥ 90 % full (late game) | 78–100 % of samples, every line | both |
| Station inputs full (bakery, smelter, smokehouse) | 100 % | tech `late45` |
| Station outputs ≥ 90 %: smelter / sawmill / smokehouse | 74 / 64 / 44 % | tech |
| 교역소 shelf empty: 판자 / 주괴 | 96 / 90–100 % (merchant would buy 162 주괴/min) | player |
| Market shelf empty: 빵 / 훈제 고기 | 37 / 37–57 % | player |
| v3 창고 average stock | 1–6 of 300 (2 %) | both |
| Gatherer capacity vs station capacity (/min) | fish 87–99 vs 75 · ore 82–94 vs 50 · meat 65–79 vs 50 | both |
| Food made vs sold locally | ≈ 140 vs ≈ 98 /min | tech |
| **Dock crates** (`v4.growth.cargo`) | 255 → 1,540, +37/min, saved; drains to 0 in 6 min with the fix | tech (bug) |
| Boathouse catch | restored to 103 % of its 30 cap | tech (bug) |
| Uncollected coins | 1,510 /min over 6 cash pads; smart bot spends **33 %** of its time walking to them | player |

### 4.2 Causes (in the designer's words, see the 기획서)

1. Raw materials really are left over: gatherers out-bring their station (fish, ore, meat).
2. Finished goods get stuck at the station door: one goods porter per line serves the shelf, far workshops, sites,
   the restaurant pantry and the food box, and workshop inputs (prio 70) always beat the shelf (40) however far away.
3. The 창고 is a detour, not a store: its porters carry a full output in and straight back out.
4. Two bugs make it look worse (dock crates only load while the station is on screen; boathouse over cap).
5. Local demand for food tops out below production.

### 4.3 Fixes (numbers in `BALANCE.v42`)

| # | Fix | Code | Numbers |
|---|---|---|---|
| P0a | **Dock crates load with the camera anywhere.** `Growth.trainIn()` = `rail.running && rail.phase === 'atOurs'`; the fly-to-wagon effect only when `cargoPoint()` exists, else `train.loadCargo(1)` directly. Per-dwell load capped by freight capacity (F7). | `Growth.js` | — |
| P0b | Boathouse restore clamps to `outStack.max`; pile label shows `가득` instead of `48/40` | `Boathouse.js`, `Pile` | — |
| F1 | **Empty shelf first**: a shelf at 0 of an item for `porters.shelfEmptyAfter` 10 s gets `PRIO.SHELF_EMPTY` 48 (above PANTRY_LOW 46 and SHELF_LOW 45, below FOOD 50) | `Logistics.js` | 48 |
| F2 | **Workshop inputs urgent only when nearly empty**: INPUT 70 only while the input is < `porters.inputUrgentBelow` 25 %, else `porters.inputCalmPrio` 42 | `Logistics.js`, `Workshop` sink | 70 / 42 |
| F2′ | **Distance counts**: `score = prio − groundDist / porters.travelPxPerPoint` (300 px = 1 point) inside `Logistics.best`; reservations unchanged | `Logistics.js` | 300 |
| F3 | **Warehouse porters deliver straight to the shelf**: a full output (≥ `warehouse.overflowAt` 0.6) whose item a sink with prio ≥ 40 wants goes there directly; the 창고 keeps only what nobody wants | `Worker.js` (WarehousePorter) | `warehouse.direct: true` |
| F4 | **짐꾼 2**: a second goods porter for a line, offered when its output has been ≥ 80 % full for 90 s in total and the 창고 exists; pad on the line's porter spot (step-off rule). Banner `판자가 쌓여요 → 판자 짐꾼 2를 부를 수 있어요` | `Labour.js`, pads | grill 500 · sawmill 600 · bakery 700 · smelter 800 · smokehouse 900 |
| F5 | **가공소 2단**: station time × 0.66 (grill 75 → 113/min, smelter and smokehouse 50 → 76/min); pad on the station once its line has the 3rd gatherer; ×1.5 badge, faster anim | `Station.js` | 900 · 1,000 · 1,100 · 1,400 · 1,600 |
| F6 | **딸랑이** (coin courier, §6.5): pads emptied about once a minute | office | — |
| F7 | **Direct export**: every train's freight cars take up to `freight.perTrain` 56 items (box car 32 + flat car 24; 88 after 화물칸 크게): first the order-card crates (paid as today at the dock), then **surplus** waiting at the 짐 싣는 곳, paid `freight.exportRate` 0.5 × price into the 역 금고 on departure | `Growth.js` | 56 / 88, 0.5 |
| F8 | **서리 물류창고** takes the surplus the train cannot (§4.4) | `src/systems/depot/*` | — |

**Surplus** (`Surplus.js`, one rule set used by station porters, the dock and the depot):
| Source | Surplus when | Keeps |
|---|---|---|
| station / workshop output | ≥ `surplus.outAt` 70 % for 20 s **and** no sink with prio ≥ 40 wants that item within 1,500 px | 30 % for the goods porter |
| collection pile | ≥ `surplus.pileAt` 95 % for 30 s (raw goes only after F5 had a chance) | 20 items |
| v3 창고 | > 70 % full | 50 % |
| boathouse catch | ≥ 90 % | — |

Carried by the existing **역 짐꾼** (2) and, once the 물류창고 stands, **역 짐꾼 3 / 4** (1,000 / 1,500, same pad
spot) to the 짐 싣는 곳, which accepts surplus as a new sink `PRIO.SURPLUS` 12 (above `STORE` 10: the 창고 stays the
local buffer, the dock takes what the village cannot use) — room = freight room of the next train + depot room.

### 4.4 서리 물류창고 (`src/systems/depot/*`, `src/entities/DepotBuilding.js`, `src/entities/CargoSleigh.js`)

**Place** (player's occupancy search on a 46-min save; `v42_layout.mjs` must print `no problems`):
| Thing | Lattice | px | Note |
|---|---|---|---|
| building (`logistics_center`, 11 × 8 m) | centre (28.4, −27.4); footprint i 24.51–32.29, j −30.23…−24.57 | (3184, 3101) | front (−Y) faces SW; docks on +X; bottom corner y 3316 |
| front door (manifest `doorPoint`) | (27.3, −30.6) | (2906, 3168) | walk-in buyers |
| dock bay used by the sleigh (bay 2) | (34.1, −26.2) | (3623, 3246) | bay 1 (y 3331) stays shut in v4.2 |
| 물류 금고 (CashPad) | (30.0, −31.4) | (3030, 3280) | sales coins, on the forecourt 1.2 cells in front of the door side |
| sleigh stop at the station | (5.0, −5.0) | (3120, 1635) | 2 cells from the 짐 싣는 곳 (4.1, −1.8) |

**Lanes** (painted as one-lane dirt + footpath in v4.2, **with the v5/v8 street ids** so later patches upgrade by id
instead of appending; appended to `WORLD.v4.streets` with `region` and `v42: true`):
| id | axis | cells | v4.2 paint | later owner |
|---|---|---|---|---|
| `ave_s` | Y | i 30–34, j −22.2…−18 | `road_dirt_y` i 30–31.5 | v5 |
| `bank_st` | X | i 23.1–40.9, j −24.2…−22.2 | `road_dirt` j −24.0…−22.6, i 23.1–37.0 | v5 |
| `lgx_dock` | Y | i 34.8–36.8, j −27.6…−24.2 | `road_dirt_y`, turnaround apron i 32.3–36.8, j −27.6…−25.0 | v8 (renamed by placement) |
| `lgx_walk` | footpath | i 23.8 from j −24.2 to −31.0, then j −31.0 from i 23.8 to 27.3 | trodden snow | v8 |

Sleigh route: stop (5, −5) → 역앞 거리 (j −5) to i 31 → 중앙로 (i 31) to j −22.2 → `ave_s` → `bank_st` east to i 35.8 →
`lgx_dock` to j −26.2 → bay 2 → U-turn on the apron (3 heading steps SW → SE → NE over 2 s) → back. ≈ 56 cells = 79 m one
way. Decor to clear and border trees: §9.

**Unlock**: after 읍 **and** the v3 창고 exists **and** region `se` is open. Site `서리 물류창고 터` (fenced sign, the
XL two-stage scaffold of the station plot ×1.5). Cost 6,000 + 40 판자 + 20 주괴, 20 s. Comes with: the cargo sleigh
(pony `cargo_sleigh`, assets/vehicles), 1 forklift (`lgx_forklift`), 3 workers (townfolk preset `depot_worker`:
`top_parka` + `det_hivis` + `hat_beanie`).

**Flow**
| Step | Who | What the designer sees |
|---|---|---|
| surplus → 짐 싣는 곳 | 역 짐꾼 1–4 | crates stack on the dock; label `수출 · 물류창고로 갈 것 23` |
| freight first (F7) | train dwell | box car door slides open, crates hop in, flat car fills |
| the rest → depot | **화물 썰매** (cap `depot.sleigh.cap` 60, 2.5 m/s, 8 s to load) | the pony trots the lanes with a crate stack (`cargoPoint`), bells |
| docks → racks | forklift (decorative loop on `forkliftPath`), workers | tap or come within the reveal polygon: shell fades, rack fill = real stock |
| racks → buyers | **솔방울 상인** (transient townsfolk walkers, seeded looks) every `depot.sell.every` 8 s, 07:00–20:00 | a buyer walks the footpath to the door, queues at `customerPoints`, leaves with a parcel; coins `price × 0.6` to the 물류 금고 |
| racks full | — | label `가득 · 썰매 한 대 더 / 화물칸 크게` offers (by measured need) |

- **Model** (`Depot.js`, pure): stock by item; categories and rack art from a **copy** of v8's `catalog.js` + `rackFill`
  (`src/systems/depot/rack.js`, header names the source file + git sha; `depot_parity.test.mjs` compares with the module
  on 300 random stocks). Caps: materials 160, food 160, goods 120, tools 60 (v8 tuning). Sales throughput per minute:
  materials 20, food 30, goods 20, tools 6. Raw items are accepted (materials / food) at `depot.rawPrice`.
- **View**: layers in manifest `layerOrder` at building depth + `bandDepth`; `alwaysDrawn` layers always; inside layers,
  stock, forklift and inside actors only while revealed (manifest fill-rate rule). Reveal: tap inside `revealPoly` or the
  chief inside it → `reveal.states.open` (350 ms); leaving / second tap reverses. Racks redraw only when `stock.ver`
  changes (≤ 2 Hz). Residency area `depot` (closed look ≈ 18.5 MiB within 800/1200 px; inside pages + forklift only
  while revealed).
- **Panel** (stand on the door pad 0.4 s, or the office 재고 tab's 물류창고 row): stock bars per category, today's
  inflow / sales / exports (`오늘 판매 312개 · +1,040코인`), the sleigh's state.
- **Save**: the `logistics` slice in v8 format (§10). Goods on the sleigh return to the dock pile on reload.

### 4.5 Targets (census bot = `review_gameplay_census.mjs`, the 46-min and 45-min v4.1 saves, 15–35 min each)

| Measure | v4.1 | v4.2 gate |
|---|---|---|
| Market shelf empty: 빵 / 훈제 고기 / 구운 생선 | 37 / 37–57 / 9 % | ≤ 10 % each |
| 교역소 empty: 판자 / 주괴 | 96 / 90 % | ≤ 40 % |
| Smelter / sawmill output ≥ 90 % | 74 / 64 % | ≤ 30 % |
| Any raw pile ≥ 90 % (after F5, depot open) | 78–100 % | ≤ 50 % |
| 창고 average stock | 1–6 | ≥ 40 |
| Dock backlog | 1,540, +37/min | ≤ one train load |
| Boathouse catch | 103 % of cap | ≤ 100 % |
| Income | 1,889 /min | +15–30 %; if higher lower `freight.exportRate`, then `depot.sell.rate`, then F5 |
| Pacing to 5 shops / 읍 | 37.8 / 47.7 min | ≤ +5 % |

---

## 5. Request 3 — the train

### 5.1 Topology: balloon loops (`WORLD.v42.rail`)

Lattice `L(i, j) = (3120 + 64(i + j), 1315 + 32(i − j))`; track = j 0; +j = sea side. Every curve R = 1.75 cells
(2.47 m). T1 / T2 are **spring turnouts**: trains enter the loop on the straight route and leave over the curved route
trailing through the switch, so there is no switching logic (the lever lamp flips green/yellow, `철컥`, visual only).

**Our end (서리역)** replaces the buffer stop. Straight main-line tiles now run from k −6 (rail tiles k −6…−2 added).
| Point | Lattice | px | Segment |
|---|---|---|---|
| T1 spring turnout | (−1, 0) | (3056, 1283) | main line splits |
| A | (−6, 0) | (2736, 1123) | end of the straight route T1 → A (5 cells) |
| leftmost | (−7.75, 1.75) | (2736, 1011) | semicircle, centre (−6, 1.75), clockwise |
| B | (−6, 3.5) | (2960, 1011) | straight B → C, 1.5 cells |
| C | (−4.5, 3.5) | (3056, 1059) | quarter, centre (−4.5, 1.75), clockwise |
| D | (−2.75, 1.75) | (3056, 1171) | quarter, centre (−1, 1.75), counter-clockwise, back into T1 heading +i |

**Town end (솔방울역)**, the world mirror in i (a separate render, not a screen flip). Main-line tiles end at k 41;
k 42–46 and `rail_x_end_p` are removed; the `갈매기 항구 방면 (공사 중)` sign moves to (44.6, −1.2).
| Point | Lattice | px |
|---|---|---|
| T2 | (37, 0) | (5488, 2499) |
| A′ | (42, 0) | (5808, 2659) |
| rightmost | (43.75, 1.75) | (6032, 2659) |
| B′ / C′ / D′ | (42, 3.5) / (40.5, 3.5) / (38.75, 1.75) | (6032, 2547) / (5936, 2499) / (5712, 2499) |

- **Loop length** T1 → round → T1 = 5 + 12.50 = 17.5 cells = **24.7 m** (15.6 m of it curved); longer than the 읍
  train (13.6 m), so the nose returns to T1 after the tail has left the main line (never meets itself).
- **Clearances** (checked by `v42_layout.mjs`): loop ballast edge (±0.61 cell) ≥ 0.12 cell from the cannery plot `e_m2`
  (i −9.9, j 0.55), ≥ 60 px from `shoreY` (loop top is ≈ 115 px from the waterline), ≥ 0.39 cell from the 역 가는 길
  (j −1); town loop clear of the 역전 파출소 (31.6, 2.6), `platform_e` (i 30.5–34) and row A (land side), ballast x ≤ 6075 < 6144.
- **Ground**: remove region trees (2950, 1150) and (2930, 1010); the town east border-tree band splits around
  y 2450–2850. A low snow fence (`rail_fence_x`, j −0.75, i −6…−1.5) keeps the 역 가는 길 walkers off the new straight.
- Before the station is repaired both loops lie under the same snow-drift decals as the main line.

**Why not top-and-tail (tech)**: it needs no track art, but the trailing engine still runs backwards and the designer
asked for the train to leave forwards; the loop costs one curved-rail art job and is the visible delight of v4.2.
`Rail` keeps `face` support so a later run-around (v6 through-station) stays a data change.

### 5.2 Consist, lengths and stops

| Unit | lengthM (over couplers) | couplerM front / back | Art | Placeholder (CODE-1) |
|---|---|---|---|---|
| 기관차 `train_engine` | 2.6 | −1.38 / 1.22 | existing, **all 5 rendered dirs now packed** | — |
| 객차 `train_coach` 솔방울호 | 3.0 | −1.5 / 1.5 | new (`CONTRACT_V42` AK) | `train_car_a` × 1.33, light sky tint |
| 화물칸 `train_boxcar` | 2.6 | −1.3 / 1.3 | new, `door_open` 4 f | `train_car_b` × 1.15 + code crate stack |
| 무개화차 `train_flatcar` | 2.4 | −1.2 / 1.2 | new, game draws crates at `cargoSlots` | `train_car_b` × 1.07 |

Consist (engine first = the leading end; anchor spacing = back coupler of the car in front + front coupler of the next):
| Stage | When | Units | Nose → tail | Seats |
|---|---|---|---|---|
| **마을** | first train | E + 객차 + 화물칸 + 무개화차 | 10.6 m (7.50 cells) | 16 |
| **읍** | 읍 ceremony (replaces v4.1's "second coach") | E + 객차 + 객차 + 화물칸 + 무개화차 | 13.6 m (9.62 cells) | 32 |
`train_car_a` / `train_car_b` stay in the atlas for v6's coast line.

Stops (nose of the leading engine; i on the main line):
| | 마을 at ours (heading NW) | 읍 at ours | at town (heading SE), both |
|---|---|---|---|
| nose | i −0.8 | i −2.9 | i 31.6 |
| 객차 at the platform | [1.04, 3.16] (서리역 platform i −0.05…5.05) | 객차 2 [1.06, 3.18], 객차 1 [−1.06, 1.06] | 객차 [27.64, 29.76] (+ 객차 2 [25.52, 27.64]) — platform 25.45…30.55 |
| 화물칸 | [3.16, 5.00] = **opposite the 짐 싣는 곳 (4.1, −1.8)** | [3.18, 5.02] | — |
| tail | 6.70 | 6.72 | 24.10 / 21.98 |
| crossing | k 8 open: tail 1.80 cells (2.5 m) from its centre | open (2.5 m) | k 33 open (1.9 cells) |

Visitors board at the **coach doors** (manifest `doorPoints`, projected to the platform edge j ≈ 1.0), not the station's
`boardPoints`.

### 5.3 Kinematics and timetable (`BALANCE.v42.train`)

- `speed` 3.4 m/s straight, `curve` 2.2 m/s while **any** car is on a curve, `accel` 0.7, `brake` 0.8, dwell
  12 s ours / 8 s town; wheel anim fps = 12 × v / 2.6.
- Legs (forward/backward speed-limit profile, scratch `v42lead/legs3.py`):
| | toTown | toOurs | cycle |
|---|---|---|---|
| 마을 | 71.1 m, 30.4 s | 85.8 m, 34.9 s | **85.3 s** |
| 읍 | 68.2 m, 29.7 s | 88.8 m, 36.3 s | **86.0 s** |
| v4.1 | 36.1 m, 17.7 s | 36.1 m, 17.7 s | 59.3 s |
- Bigger rather than more frequent: riders per train × `ridersScale` = `rail.cycle() / 59.3` (≈ 1.44, computed at
  runtime), capped by seats; `maxInVillage` stays 24 → visitors per minute within ±10 % of v4.1.

**How a train runs (the designer's view).** Ours: whistle 2.5 s ahead → engine-first heading NW → stops (coach at the
platform, box car facing the 짐 싣는 곳) → doors, neighbours step down, crates hop in → after 12 s the station master's
flag + whistle → it **pulls forward** into the loop, curves along the sea (NW → N → NE → E → SE → S → SW → S → SE),
smoke trailing back, a soft wheel squeal → passes the platform **engine-first** heading SE, passengers waving → crosses
k 8 → town. Town: arrives heading SE, 8 s dwell, pulls forward round the town loop, passes the town station heading NW.

### 5.4 `RailPath` (pure, `src/systems/RailPath.js`) and `Rail.js`

- `RailPath(def)` builds the closed **route** from `WORLD.v42.rail`: our stop → straight → our loop → main line SE →
  town stop → straight → town loop → main line NW → our stop. Segments are lines and circular arcs; `at(s) → { x, y, ang,
  curve }` (px, heading radians, on-curve flag), `length`, `sOfMain(i, dir)`.
- Speed profile per leg precomputed on a 0.25 m grid (forward accel pass, backward brake pass, curve limit extended by
  the train length) → `t ↔ s` tables; pure, Node-testable.
- `Rail` keeps its public surface (Neighbours, Growth, DayClock, Occlusion, the v6 coast line rely on it): `phase`
  (`toOurs | atOurs | toTown | atTown`), `t`, `running`, `v` (signed, + = toward the town on the main line), `m` (= route
  s), `consist()` (now `{ key, off, face }` along the route), `span()`, `blocking(k)` (crossings map to two route
  intervals, out and back), `cycle()`, `untilArrival()`, events `arrive | depart | whistle`, `state()`.
- A rail model **without** `path` (the v6 coast line) is drawn exactly as today by `Train` (legacy branch kept).
- Blocking: the chief / dog / walker check samples the route 1.5 m + braking distance ahead of the nose (works on
  curves). The dog's roam excludes both loop rectangles.

### 5.5 Train view (`src/entities/Train.js`)

- Each car: anchor at `at(s_nose − off)`; heading from the chord between its two bogie points (± 0.4 × length) →
  nearest of 8 headings → frame dir (S, SE, E, NE, N rendered; SW, W, NW mirrored); `move` while moving (fps by speed),
  `idle` when stopped; shadows per heading (`shadowFrames`, not mirrored).
- Smoke (`smokePoint[dir]`), headlamp (`lampPoint[dir]`) from the engine only; coach window glow (`windowPoints[dir]`)
  at night; box-car `door_open` during the dwell at both stations; flat-car crates at `cargoSlots[dir]` (lgx crate icons,
  stack height = load).
- **Readability extras**: for the first 3 arrivals after the update a label pops over each car for 4 s (`객차 · 손님
  14명`, `화물칸 · 상자 6개`, `무개화차`); tapping the train opens a **열차 카드** (consist icons, riders, crates, next stop
  and time).
- Station-square float labels get an `avoidRect` for the dwelling train (v4 review: labels sat on the coach).
- Pages: `pack_pages.py` keeps the engine's 5 dirs (curve dirs S/E/N at 4 move frames), the new cars likewise; loaded
  within view + 900 px, evicted 30 s after. Low graphics tier: straight dirs + 1 frame per curve dir.

### 5.6 Freight on the train (F7)

- Capacity per train `freight.perTrain` 56 items (box car 32 = 8 crate icons × 4, flat car 24 = 6 × 4); 화물칸 크게
  (2,000, offered when surplus waited ≥ 60 items for 2 min) → 88. Loading one crate icon per `freight.loadEvery` 0.14 s
  during the dwell, camera-independent (P0a).
- Order-card crates first (wholesale paid at acceptance, as v4.1), then surplus (paid 0.5 × price into the 역 금고 on
  departure). Crates aboard ride to the town and vanish into the town station (no town-side logistics in v4.2).
- Saved: `v42.freight.dock` (surplus waiting) and `v42.freight.cars` (aboard); card cargo stays in `v4.growth.cargo`.

### 5.7 v6 notes (cannot be edited from v4.2; §17)

The coast line (`src/harbor/model/coastLine.js`) is its own push-pull train drawn by `Train`'s legacy branch; its
"town-east halt" (carA i 37.5) overlaps T2 → move it to i ≥ 44 with a turnout at A′ (42, 0) for the line east; the far
terminals need their own loops if v6 wants engine-first there too.

---

## 6. Request 4 — 촌장 사무실, its staff, and 서리 은행

### 6.1 Places (`WORLD.v42.office`, `WORLD.v42.bank`; checked by `v42_layout.mjs`, nudge ≤ 60 px allowed)

| Building | Anchor px | Footprint | Door / paths | Clear |
|---|---|---|---|---|
| **촌장 사무실** (`chief_office`, 5.6 × 4.4 m) | **(110, 810)** | poly ≈ (−117, 797) (137, 923) (337, 823) (83, 697) | door on the SW face at ≈ (−62, 824); new road node `w_office` (−120, 880) with edges `plaza_w → w_office` (via (380, 930), (130, 985)) and `w_office → w_gate_n` (via (−170, 760)) | extraTrees (190, 860), (260, 720), (300, 930) |
| **서리 은행** (civic `bank`, 5.4 × 4.6 m) | **(−340, 570)** | poly (−566, 561) (−322, 683) (−114, 579) (−358, 457) | door (−458, 629); footpath spur (−458, 640) → (−200, 760) | extraTree (−180, 560); snow pile (−140, 500); lamp (−190, 690) → (−230, 720) |
| staff hire pad | (−150, 905) | 1.4 m pad | in front of the office door | — |

Both buildings get **wall collision** (small circles along the back and side walls, a gap at the door) instead of a
footprint circle, so the chief walks in. The signpost (−40, 720) moves to (−20, 600).

### 6.2 Unlocks and costs (`BALANCE.v42.office`, `.bank`)

| Step | Appears when | Cost | Comes with |
|---|---|---|---|
| 촌장 사무실 터 | the 마을회관 is built (or v3 complete if no hall) | 1,800 + 20 판자 + 6 주괴, 10 s | ribbon, empty office (stove, map, 4 desks) |
| 셈이 (장부 담당) | office built | 500 | 재고 tab, wall stock board |
| 딸랑이 (수금원) | 셈이 | 900 | coin rounds; deposits at the office safe until the bank stands |
| 소복이 (소식·편지 담당) | 딸랑이 | 700 | 소식 + 편지 tabs, the morning paper |
| 서리 은행 터 | 읍 + office | 3,000 + 24 판자 + 12 주괴, 12 s | 2 tellers + manager, vault, passbook (통장 tab) |
| 총총이 (수행비서) | 소복이 + 읍 | 900 | follows the chief; **업무 chip** (office panel anywhere); 관망 day plan |

Pads appear one at a time on the hire pad (step-off rule). New staff walk in from the plaza with a prop (ledger, coin
sack, mail bag, notepad), bow (`bow`, CODE-2) and take their place; banner `새 직원: 장부 담당 셈이 씨가 출근했어요!`.

### 6.3 The building (`src/entities/OfficeBuilding.js`)

- **Exterior**: cream plaster, teal roof (the hall's family) with a pinecone finial and a chimney, sign `촌장 사무실`,
  red mailbox whose flag pops up when mail arrives, door lamp, small flag (art: `CONTRACT_V42` AI).
- **Cutaway**: the logistics/civic layer contract (`floor`, `back`, `interior`, `interior_front`, `shell_cut`, `shell`,
  `props`, `glow` + animated overlays) with `drawOrder` slots `@behind` (people at desks) and `@front` (visitors).
- **Reveal** (shell → `openAlpha`, `shell_cut` on): the chief within `office.revealPx` 260 px of the door (60 px
  hysteresis), an office panel open, the 관망 camera framing it, or a tap inside `revealPoly` (toggle). Inside layers and
  inside staff exist only while revealed (fill rate); the closed look is shell + props only.
- **Live wall board**: the back-wall chalkboard (`boardRect` quad with `shearY`) gets 5 coloured bars (one per goods
  line, colour = 재고 status) drawn by a Graphics at 1 Hz while revealed.
- **CODE-1 stand-in**: the town `post_office` frame (closed look only, tinted cream) at the anchor; staff stand at
  "desk spots" in front of it with code props; the panel and every system work. Never shipped to the designer.

### 6.4 Staff (`src/entities/staff/*`; looks = code presets in `src/data/staffLooks.js`, merged by `TF.addPresets()`)

| Name | Role | Look (townfolk parts) | Routine (CODE-2 anims; CODE-1 fallback in brackets) |
|---|---|---|---|
| **셈이** | stock clerk, desk 1 | `top_cardigan` + `acc_glasses_sq` + `det_lanyard`, adult_round | sits and writes (`desk_write` [idle]); every 30 s walks to the board and points (`point_board` [talk]); when a shelf has been empty > 30 s her desk lamp turns red and she says `훈제 고기가 바닥이에요!` |
| **소복이** | news & letters clerk, desk 2 | `top_sweater` + `acc_scarf`, adult_slim | 06:00: takes the bundle from the village postman, types 20 s (`desk_type` + typewriter overlay [idle]); on a new letter: fetches it from the mailbox, sorts it into the pigeonholes (`file` [idle facing NE]), calls `편지 왔어요~`; phone (`desk_phone` + ring overlay [talk]) |
| **총총이** | aide | `top_blazer` + `det_bow` + `hair_bun`, adult_slim | follows the chief's breadcrumb trail 1.6–2.4 m behind and to the side, never in his way; takes notes when he chats (`note` [idle]); waits at doors of buildings he enters; walks up with news (`hand_over` [talk] + letter bubble → tap opens the panel); stays home when he is > 2,000 px from the office; sits at her desk when he is in |
| **딸랑이** | coin courier | `top_duffle` + `hat_beanie` + `acc_satchel` + bell pin (officefolk), adult_round | the round in §6.5: walks with the **coin sack over the shoulder** (`carry_sack` [walk + `item_coin_sack_s/m/l` head-carried, size by value]), `scoop` at pads [happy], `hand_over` at the bank counter [talk]; between rounds sits in the courier corner counting (`desk_count` [idle]) |
| 2 tellers + 은행장 | bank staff | `top_vest` + `det_bow` / elder `top_blazer` + `det_tie` + `acc_glasses` | behind the counter (`stamp_stand`, `hand_over` for the receipt [idle/talk]); the manager seated at `deskPoint` (`desk_write` [idle]) |
| 3 depot workers | 물류창고 | `top_parka` + `det_hivis` + `hat_beanie` | at manifest `staffPoints` (idle/talk; forklift is a vehicle sprite) |

Staff are saved as seeds (looks regenerate) and are not simulated off-screen except the courier's round (analytic
position + sack value) and the aide (teleports to the chief's last door when he is far and off screen).
Lunch 12:00 (walk to the big restaurant if built), home 18:00, back 08:00 (clerks only; the courier works 07–21).

### 6.5 Courier and the coin loop (`src/entities/staff/Courier.js`, `CashPad.takeAll`)

- `CashPad` instances register in `gs.tills` (market, 교역소, 잡화점, 큰 식당, 마을회관 세금 상자, 역 금고, 물류 금고).
- **Round**: every `courier.every` 60 s, or sooner when ≥ `courier.rushAt` 1,000 coins wait; visits every till with
  ≥ `courier.minPad` 100 by nearest neighbour along `Roads` routes; before 읍 also the 역 금고 and 물류 금고 (after 읍
  they already fly in every 15 s). At each pad `CashPad.takeAll(courier)`: coins hop into the sack over ≈ 1 s, the sack
  sprite grows (3 sizes), `딸랑딸랑`.
- **Deposit**: at the bank (or the office safe before the bank): the courier walks to `counterPoints[0]`, the teller
  counts (`sfx_coin_count` 1.2 s) and stamps (`sfx_stamp`); a deposit ≥ `courier.vaultAt` 5,000 spins the vault
  (`bank_vault` overlay); the coins fly from the bank to the HUD counter as `+6,240` with a passbook icon.
- **Rules**: coins in the sack are saved (`v42.office.bag`) and restored into the sack; a round never takes coins from
  the chief; if the chief steps on a pad first he collects it as today. **Conservation test**: pads + sack + wallet is
  constant across a round and across a reload mid-round.
- Measured target: no pad above ≈ 1,500 coins between visits; the smart bot's time on cash pads falls from 33 % to
  ≤ 10 % once 딸랑이 is hired.

### 6.6 Bank (`src/systems/Bank42.js`, `src/entities/BankBuilding42.js`)

- **v4.2 semantics**: a deposit goes to the spendable coins (the HUD counter) and writes a passbook row. The bank is
  where the money is counted and recorded; **no savings, interest or loans in v4.2** (v5 adds 저금 1 %/day and 대출 to
  the same passbook). No `Economy` change.
- Cutaway from `assets/civic` `bank` (layers, `vault` overlay, `revealPoly`, `floorLiftPx` 18, `pointSlots`).
  Up to 2 village residents drop by 09:00–17:00 (`customerPoints`, decorative). Reveal rules as the office.
- The chief on the 창구 pad (counterPoints[1]) opens the 통장 tab.
- Writes the `bank` slice in v5 format `{ v: 1, open: 1, sv: 0, ld: −1, tk: 1 }` so v5's `BankHost` opens with the bank
  already built and skips its site; the courier's rows live in `v42.office.log` (v5's sanitizer keeps only its own
  operations).

### 6.7 Office panel (`src/scenes/OfficePanel.js`, non-pausing, 720 × 1100 logical)

Opens by standing on the **책상 pad** in front of the chief's desk for 0.4 s, tapping the revealed building, the
aide's letter bubble, or the **업무 chip** (after 총총이). Tabs appear with their staff; locked tabs name who to hire.
Art: ui4 panels (`ui_newspaper*`, `ui_passbook*`, `ui_story_card*`) packed into one transient page + ui5 (`CONTRACT_V42` AL).

**재고** (`src/systems/StockLedger.js`): every stock registers `{ id, nameKey, item, get(), cap, place }` (piles, station
in/out, shelves, pantry, food box, workshops, boathouse, 창고, dock, founded shops, depot); 1 Hz samples, 5-min EWMA in/out
per minute, % time full / empty. One row per goods line + 창고 + 물류창고:
| Status | Rule (`BALANCE.v42.ledger`) | Fix buttons |
|---|---|---|
| **부족** (red) | shelf at 0 for > 30 s **and** its source is empty | `가공소 2단`, `일꾼 더` (camera hop + arrow) |
| **길 막힘** (orange) | shelf at 0 for > 30 s **while** its source holds stock | `짐꾼 2` |
| **남음** (blue) | pile or output full for > 60 s **and** the shelf ≥ 50 % | `물류창고로 보내요` (shows the dock) |
| **적당** (green) | otherwise | — |
Top line `마을 물건 1,214개 · 창고 17/300 · 물류창고 212/500`. Buttons move the camera to the pad (panel half-transparent)
and set the tutorial arrow. The same statuses colour the wall board.

**소식** (`src/systems/VillageNews.js`): one paper per game day, printed at 06:00 from counters that already exist
(visitors, sales by item, move-ins, buildings, exports, coins, rank, records): masthead `서리 소식 · 12일째 아침 · 맑고 추움`,
3–5 headlines from ko/en templates (`news_*`), "어제의 숫자", weather line, one ad, `편지함 새 편지 2통 →`. Photo slot:
a 256 × 160 render-texture snapshot of yesterday's top event place (falls back to `ui_newspaper_photo`). Last 3 papers
kept (titles only in the save). Interface `{ papers(), letters(), markRead(id) }` so v5's story newspaper can replace it.

**편지** (`Letters` in the same file): ≤ 6 unread; a new letter every 2–4 game hours (50–100 s) plus event letters;
answering gives happiness +1; unanswered letters archive after 2 game days. Initial templates (trigger → buttons):
| From | Trigger | Buttons → effect |
|---|---|---|
| 빵집 아주머니 | 빵 row 길 막힘 > 60 s | `빵 짐꾼 2 부르기 · 700` (pad appears, camera hop) / `조금 더 볼게요` |
| 솔방울 마을 민지 (9살) | first ride after the update | `답장 보내기` → 민지 counts one extra visit toward 단골 ★ |
| 광부 영감 | ore pile 남음 > 2 min | `제련소 2단 보기` (1,400) / `나중에` |
| 큰 식당 요리사 | pantry 훈제 고기 empty > 20 % of the day | `재고 보기` (opens 재고 on that row) |
| 이주민 가족 | free plot + vacant rooms < 2 | `어서 오세요!` (arrow to a free S plot) / `다음에요` |
| 솔방울역 역무원 | surplus waited ≥ 60 for 2 min | `화물칸 크게 · 2,000` / `알겠어요` |
| 솔방울 카페 사장 | 읍 and no 물류창고 | `물류창고 터 보기` / `고마워요` |
| 장난꾸러기 | any day after the hall, once | `좋아, 열자! · 120` (kids build snowmen on the plaza 2 min, happiness +2) / `다음에` |
| 할머니 | halo on, day ≥ 2 | `답장 보내기` |
| 서리 은행장 | bank built + 3 days | `고마워요` (v5 teaser: 저금·대출 곧) |

**직원**: one line per person and what they do now (`딸랑이 · 교역소에서 수금 중 (1,240코인)`); locked roles show
cost and the hire pad. **통장** (bank built): `ui_passbook` + the last 8 rows (`12일 09:20 · 수금 입금 · +6,240`) and
today's income by source as bars (판매대 · 교역소 · 잡화점 · 식당 · 세금 · 역 금고 · 수출 · 물류창고).

---

## 7. Request 5 — 관망 모드 (`src/systems/pilot/*`)

### 7.1 Start, stop, input

- **In**: the 관망 button (binoculars, right column) once the village is complete (`progress.celebrated`); or **automatically** after
  `Settings.data.observeAfter` (끔 / 30 / **60** / 120 s) with no touch, not while a panel, ceremony, tutorial focus or
  the first loop is active; a 3 s countdown chip `관망 모드로 바꿀게요 · 3` (any touch cancels).
- **Input hand-off** (`src/core/Input.js`): `Input.override` (bots/tests) > human joystick/keys (magnitude > 0.05 →
  `pilot.yield()` in the same frame, toast `다시 조종해요`) > `pilot.vector()` when observing. Buttons (zoom, overview,
  settings, 업무 chip) do **not** end 관망; a tap on the village does.
- **While on**: top caption `관망 중 · 촌장님은 지금: 광장 판매대에 생선을 채우는 중`, small line `화면을 만지면 다시
  조종해요`; tutorial arrow and objective text hidden; navigation off; the halo shows its 관망 state.
- Not saved; always off after a reload.

### 7.2 What he does (chooser every 0.5 s, `pilot/ChiefPilot.js`, `agenda.js`, `work.js`)

Highest score wins (± `pilot.jitter` 10 % from a seeded RNG), the current activity is locked for its minimum time,
20 % hysteresis.
| Activity | Score | Conditions | Duration | Seen |
|---|---|---|---|---|
| 급한 일 | 100 | the tutorial's own `evaluate()` target (the logic the arrow-only bot reaches 읍 with) **minus every pay/hire/upgrade target**: unstaffed register with guests > 9 s, a ribbon, a station with ≥ 8 items and no operator, a site missing what he carries, empty food box | until done | runs, gold halo while working |
| 점심 | 50 at 12:00–12:40 | big restaurant open | 40 s | sits at a free outdoor table, eats a 정식 (free) |
| 업무 | 40 | bag has room and a v4 hint target exists | 20–60 s | carries, sells, fills the pantry, follows his own navigator |
| 저녁 | 40 from 20:00 | — | until 06:00 or higher score | office with the lamp on, or the campfire; dozes by the office stove from 22:00 |
| 수금 | 35 | no courier and ≥ 300 coins on one pad | one pad | — |
| 기차 구경 | 30 | a train arrives at ours within 20 s and he is ≤ 1,500 px away | arrival + loop | walks to the platform, waves |
| 수다 | 25 (+15 if none for 3 min) | an idle or seated resident/townsperson within 600 px, not chatted with in 5 min | 20–30 s | both face each other, 2–4 bubbles from `ResidentChat`/`VillageLife` lines (no AI calls), 눈꽃말 voices, hearts; 총총이 takes notes |
| 사무실 | 20 (+30 08–10 h with a new paper, +30 with ≥ 2 unread letters) | office built, **bag empty** | 30–60 s | walks in (shell fades), sits (`sit_idle`), reads the paper (`sit_read`), stamps a letter (`sit_write`) |
| 쉬기 | 20 | — | 20–40 s | bench, campfire (`warm_hands`), looks at the sea |
| 콩이 | 15 | dog within 800 px | 15 s | `DogPlay` pet / throw |
Agenda weights by hour (`pilot.agenda`, editable): 07–09 office ×1.5, 09–12 chores ×1.3, 12–13 lunch, 13–17 chores +
one train watch, 17–20 social ×1.5, 20–07 evening. Before the day clock starts (no station) the agenda cycles by game minutes.

### 7.3 Movement and safety

- Long legs `Roads.route`, the last 200 px the existing collision steering; steering writes the joystick vector, so
  speed, collisions and pad rules are the player's.
- **Never spends by default**: while the pilot drives, `UnlockPad`, `Site` pay pads, hire pads and the trash pad
  **ignore the chief** (and the route treats them as high-cost cells). Setting `관망 중 돈 쓰기: 안 써요 / 고용만` —
  `고용만` lets him hire staff and porters he can afford, never buildings or upgrades.
- Stuck: no progress 3 s → side-step; 8 s → drop the task, mark the target unreachable for 60 s.
- Determinism: decisions are a pure function of (state snapshot, seed, decision index); RNG
  `mulberry32(hash(saveSeed, day, index))`, never `Math.random`.

### 7.4 Camera director (`pilot/CameraDirector.js`)

Follows the chief (lerp 0.08); zoom kept ≥ `pilot.minZoom` 0.7, restored on hand-back. **볼거리 cuts** (setting, default
on): at most one every 45–90 s, 6–8 s each, to events within 2,500 px: train arriving at ours (when he is > 900 px away),
a ribbon, a move-in, the courier's deposit (vault spin), a letter at the mailbox, the sleigh loading. No cut within 20 s
of the last, none while a panel is open; a caption chip names the event.

---

## 8. HUD and settings (phone 390 × 844 CSS; logical = CSS × 720/390)

### 8.1 New HUD elements
| Element | Where (CSS → logical) | Size | When |
|---|---|---|---|
| 관망 button (`ui_icon_binoculars`) | (359, 610) → (663, 1126) | 56 round | after village complete; lit while on |
| 줍기 button (`ui_icon_hand` + item icon + count) | (296, 706) → (546, 1303) | 60 round | 자동 줍기 = 끔 and something is takeable |
| Navigation chip | (195, 795) → (360, 1468) | 240 × 44 | carrying, nav on |
| 업무 chip (`ui_icon_office` + red badge count) | (60, 222) → (111, 410) | 120 × 44 | after 총총이 |
| 관망 caption | (195, 200) → (360, 369) | ≤ 300 × 40 | 관망 |
| "새로워진 것" card | centre | 320 × 300 | once per save |
| 열차 카드 | centre bottom | 320 × 220 | tap the train |

### 8.2 Settings (two tabs; the panel already holds 7 rows)
Tab **소리·화면** = the 7 v4.1 rows. Tab **놀이**:
| Row | Values | Default | `Settings.data` key |
|---|---|---|---|
| 자동 줍기 | 켬 / 멈추면 / 끔 | 켬 | `pickup: 'auto'\|'still'\|'off'` |
| 길 안내 | 켬 / 끔 | 켬 | `nav: true` |
| 촌장 후광 | 켬 / 끔 | 켬 | `halo: true` |
| 관망 자동 | 끔 / 30초 / 1분 / 2분 | 1분 | `observeAfter: 0\|30\|60\|120` |
| 관망 볼거리 | 켬 / 끔 | 켬 | `observeEvents: true` |
| 관망 중 돈 쓰기 | 안 써요 / 고용만 | 안 써요 | `observeSpend: 'none'\|'hire'` |
Validated in `Settings.load()` like `gfx`.

### 8.3 Tutorial and hints
v4.2 hints are appended after the v4 list: office site → staff pads → bank site → depot site → offered upgrades (짐꾼 2,
가공소 2단, 화물칸 크게, 썰매 한 대 더), each with a banner once. Anti-softlock: every v4.2 cost is producible by lines the
player already has; nothing in v4.2 gates 읍.

### 8.4 "새로워진 것" card (a save from v4.1, once)
Three lines with icons, then `좋아요`: `촌장님 발밑의 반짝이는 후광` · `물건을 들면 갈 곳을 알려 줘요` · `가만히 두면 촌장님이
알아서 지내요 (관망 모드)`; a fourth line `기차가 이제 앞으로 달려요` when the station is repaired.

---

## 9. Map data (`WORLD.v42`, Korean comments; `tools/test/v42_layout.mjs` must print `no problems`)

| Key | Value |
|---|---|
| `rail` | `{ j: 0, from: −6, to: 41, crossings: [8, 33], loops: { ours: { t: −1, a: −6, r: 1.75, bc: 1.5, side: 1 }, town: { t: 37, a: 42, r: 1.75, bc: 1.5, side: 1 } }, sign: { i: 44.6, j: −1.2 }, fence: [[−6, −0.75, −1.5, −0.75]] }` (replaces `WORLD.v4.rail` when v42 runs) |
| `stops` | `{ ours: { 1: −0.8, 2: −2.9 }, town: 31.6 }` (leading nose i by consist stage) |
| `office` | `{ x: 110, y: 810, key: 'chief_office', hire: [−150, 905], node: 'w_office' }` |
| `bank` | `{ x: −340, y: 570, key: 'bank' }` |
| `depot` | `{ i: 28.4, j: −27.4, key: 'logistics_center', bay: 2, till: [30.0, −31.4], sleighStop: [5.0, −5.0] }` |
| `streets` | `ave_s`, `bank_st`, `lgx_dock`, `lgx_walk` (§4.4) appended to `WORLD.v4.streets` with `v42: true` |
| `roads` | node `w_office` (−120, 880); edges `plaza_w–w_office` (via (380, 930), (130, 985)), `w_office–w_gate_n` (via (−170, 760)); bank door spur (−458, 640) → (−200, 760) |
| `removeDecor` | extraTrees (190, 860), (260, 720), (300, 930), (−180, 560); regionTrees (2950, 1150), (2930, 1010); decor snow pile (−140, 500); `rail_x_end_n`, `rail_x_end_p` |
| `moveDecor` | lamp (−190, 690) → (−230, 720); signpost (−40, 720) → (−20, 600); rail sign → (44.6, −1.2) |
| `borderTrees` | town east band split: `[6024, 300, 6144, 2450, 100, 'town']`, `[6024, 2850, 6144, 3450, 100, 'town']`; rail south band gets a gap x 3300–3700 (dock apron) |

---

## 10. Save v7 (`src/core/Save.js`)

```js
SAVE_VERSION = 7
MIGRATE[6] = (s) => Object.assign({}, s, { v: 7 })      // additive: every v4.2 system starts empty
s.v42 = {
  v: 1,
  office:  { st: 0|1|2, site?, staff: [sem, ttal, bok, chong] (0 | uint32 seed), bag: n, safe: n,
             log: [[day, src, n] ≤ 8] },
  news:    { day, papers: [[day, [hid, a1, a2] ≤ 5] ≤ 3] },
  letters: { seq, inbox: [[id, tpl, state, day] ≤ 6], once: [tpl ≤ 16] },
  up:      { grill|sawmill|bakery|smelter|smokehouse: 1 },   // 가공소 2단
  p2:      [stationId ≤ 5],                                    // 짐꾼 2
  train:   { stage: 1|2, big: 0|1, labels: n },
  freight: { dock: { item: n }, cars: { item: n } },          // surplus waiting / aboard (card cargo stays in v4.growth)
  depot:   { st: 0|1|2, site?, sleighs: 1|2, load: { item: n }, porters34: 0..2, sales: [day, n, coins] },
  ledger:  { full: { stockId: s } ≤ 40 },                      // for the letters' "stuck" rules
  seen:    { whatsNew: 1, pickupTip: 1, cheer: n },
}
s.bank      = { v: 1, open: 1, sv: 0, ld: −1, tk: 1 }                                   // v5 format (src/bank/save.js)
s.logistics = { v: 1, open: 1, gift: 1, tut: 1, day, seq: 0, stock: { bread: 12, ore: 80, … },
                orders: [], cash, chains: [], lv3: [], days: [≤ 10], made: [0, 0], tot: [0, coins, deliveries] }   // v8 format
```

- `sanitizeV42` in `Save.js`: ints clamped, unknown item ids dropped (items.js + the v8 catalogue keys), seeds uint32,
  arrays capped, never throws. `sanitizeSave` keeps `bank` / `logistics` through **local copies** of the module keep-rules
  (no runtime import); `save_v42.mjs` runs both slices through the modules' `sanitizeBank` / `sanitizeLogistics` and
  requires them unchanged (contract test). `logistics.stock` keys have no `item_` prefix (v8 KEY rule); `gift: 1` so v8
  never hands out its opening gift again; `open: 1` so v8 skips its own site.
- **Migration from v6**: nothing removed. The dock backlog `v4.growth.cargo` (each crate was paid when accepted) is capped
  to 2 train loads; the rest is dropped (it was only a picture). Boathouse catch and pile overfill clamp.
- **Size**: + ≈ 2.2 KB worst case → ≤ 8 KB. Gates: `v4.mjs` and `c2.mjs` raise the save limit 6,144 → **10,240** B,
  write ≤ 1.5 ms.
- **v5–v8**: their `SAVE_VERSION` steps become 8, 9, 10, 11 (all their `MIGRATE` steps are pass-through, so the change is
  mechanical); their sanitizers already keep slices of modules that are not running.

---

## 11. Balance (`src/data/balance.js` → `BALANCE.v42`, Korean comments, `balanceCheck.js` ranges)

```js
v42: {
  aura:    { ringPx: 70, fullZoom: 1.2, maxScale: 2, pinZoom: 0.8, crowdN: 4, crowdR: 160, glowDay: 0.35, glowNight: 0.6 },
  cheer:   { mult: 1.1, still: 2, radius: 200 },
  pickup:  { stillS: 0.35, stillSpeed: 20, gatherStillS: 0.35, tipSpeed: 0.6 },
  nav:     { dotEvery: 48, maxDots: 16, hideNear: 90, replanEvery: 1.0, strayPx: 80, straightUnder: 360 },
  porters: { shelfEmptyPrio: 48, shelfEmptyAfter: 10, inputUrgentBelow: 0.25, inputCalmPrio: 42, travelPxPerPoint: 300 },
  warehouse: { direct: true, directMinPrio: 40 },
  porter2: { fullAt: 0.8, fullForS: 90, costs: { grill: 500, sawmill: 600, bakery: 700, smelter: 800, smokehouse: 900 } },
  station2: { timeMult: 0.66, costs: { grill: 900, sawmill: 1000, bakery: 1100, smelter: 1400, smokehouse: 1600 } },
  surplus: { outAt: 0.7, outForS: 20, localPx: 1500, pileAt: 0.95, pileForS: 30, pileKeep: 20, whAt: 0.7, whKeep: 0.5, boatAt: 0.9 },
  stationPorter34: [1000, 1500],
  freight: { perTrain: 56, big: 88, bigCost: 2000, bigOfferWait: 60, bigOfferS: 120, exportRate: 0.5, loadEvery: 0.14 },
  depot:   { site: { coins: 6000, item_plank: 40, item_ingot: 20, time: 20 },
             caps: { materials: 160, food: 160, goods: 120, tools: 60 },
             sleigh: { cap: 60, speed: 2.5, loadS: 8, secondCost: 2500 },
             sell: { every: 8, rate: 0.6, open: 7, close: 20, perMin: { materials: 20, food: 30, goods: 20, tools: 6 } },
             rawPrice: { item_fish_raw: 1, item_log: 1, item_wheat: 1, item_ore: 2, item_meat_raw: 3 } },   // 추정 — 봇으로 맞춰요
  office:  { site: { coins: 1800, item_plank: 20, item_ingot: 6, time: 10 },
             hire: { sem: 500, ttal: 900, bok: 700, chong: 900 }, revealPx: 260, revealHyst: 60, deskPadS: 0.4 },
  courier: { every: 60, rushAt: 1000, minPad: 100, speed: 150, vaultAt: 5000 },
  bank:    { site: { coins: 3000, item_plank: 24, item_ingot: 12, time: 12 } },
  ledger:  { window: 300, emptyS: 30, fullS: 60 },
  news:    { hour: 6, keep: 3 },
  letters: { minH: 2, maxH: 4, maxUnread: 6, archiveDays: 2 },
  pilot:   { decideEvery: 0.5, jitter: 0.1, hysteresis: 0.2, minZoom: 0.7, camLerp: 0.08, cutEvery: [45, 90], cutHold: [6, 8],
             cutRange: 2500, stuckSide: 3, stuckDrop: 8, agenda: { … } },
  train:   { speed: 3.4, curve: 2.2, accel: 0.7, brake: 0.8, dwellOurs: 12, dwellTown: 8, coachSeats: 16, labels: 3 },
}
```

## 12. Strings (`strings.js`, ko + en, ≈ 190 keys)

Groups: settings tab + rows (12), pickup (6), nav chip templates (8), halo/cheer (4), train labels + card (12), overflow
banners and upgrade pads (20), depot (24), office + staff names/lines (30), panel tabs + statuses + buttons (24), news
templates (20), letters (10 templates × body + 2 buttons), 관망 captions per activity (16), what's-new card (5).

---

## 13. Budgets

### 13.1 Files (the first wall) — **P0 file diet before any new art**
| Step | Files |
|---|---|
| today (`dist/artifact_files.json`) | 491 + page |
| audio sprites: one-shot sfx of `audio` (42 files incl. loops), `audio2` (26), `audio3` (19) → one sprite mp3 + JSON per fragment (`tools/build/audio_sprite.py`, ffmpeg concat, 50 ms gaps; `Audio.js` plays `playAudioSprite`; loops and music stay files) | ≈ −65 |
| portrait atlas (`tools/build/portrait_atlas.py`; measure the real count at P0) | ≈ −40…−52 |
| ui4 (13 PNG + atlas) shipped as 1 page + JSON | −12 vs naive |
| v4.2 new art (`CONTRACT_V42`: 33 shipped files after `chief_fx` + `ui5` pack into `v42_core`) + reused art (civic bank 3, logistics 15, cargo sleigh 3, ui4 page 3, audio6 subset 5) | ≈ +62 |
| **result** | **≈ 430–445** (gate: build fails above 480; v5 keeps ≥ 60 headroom) |

### 13.2 Textures (Phaser source-sum, the v4 probe; must ≤ 455 MiB everywhere)
| View | v4.1 | v4.2 adds (estimate) | Gate |
|---|---|---|---|
| plaza | 323 | `v42_core` 2 + halo 0.1 + office closed look 2.5 (insides load on reveal only) + courier `of_sack_0` 1.5 | ≤ 331 |
| office revealed (west of plaza) | ≈ hall view | office inside 3 + officefolk desk/office pages ≈ 8 + chief2 3 + civic bank 5 + panel page 1.6 (transient) | ≤ 345 |
| station square, train in | v4.1 + 3.7 (train) | train pages ≈ 17.6 (engine 5 dirs 4.6, coach 4.8, box car 5.1, flat car 3.1) − old cars 3.7 | ≤ v4.1 + 14 |
| depot revealed | new | lgx closed 18.5 + inside 4.9 + forklift 7.6 + items 0.3 + sleigh ≈ 3; village pages out by hysteresis | ≤ 340 |
| full tour peak | 381 | never all at once (area classes 800/1200 px) | ≤ 400 |
`Residency.REGIONS` += `office`, `bank`, `depot` (+ `officeInside`, `depotInside` acquired only by a reveal), transient
`ui4@office`.

### 13.3 Logic, objects, draw calls
| Item | Budget (fixed-step bench, average ms/tick) |
|---|---|
| aura + pickup + navigator | ≤ 0.03 |
| StockLedger (1 Hz, ≈ 45 rows) + news/letters (event-driven) | ≤ 0.02 |
| office staff, courier, aide, tellers (sprites only near view) | ≤ 0.05 |
| RailPath (table lookups) + Train view | ≤ +0.02 over v4.1 |
| depot sim + sleigh + buyers (analytic when far) | ≤ 0.08 near, ≤ 0.01 far |
| pilot (when on) | ≤ 0.05 (route requests reuse the navigator cache) |
| **v4.2 total** | **≤ 0.25** |
Display objects: the plaza already misses its 1,700 gate (1,950 day); **P0 bakes each pile's items into one image** (v3.5
measured 849 pile item images) and v4.2 may add ≤ 60 in the plaza → gate ≤ 1,700 again. Draw calls ≤ 12 (no new blend
modes; the depot interior adds ≤ 3 pages in one view).

---

## 14. File-by-file changes

**New**
| File | Purpose |
|---|---|
| `src/entities/ChiefAura.js` | §3.1–3.2 ring, glow, motes, pin, rank band, cheer |
| `src/systems/PickupPolicy.js` | §3.3 |
| `src/systems/Navigator.js` | §3.4 |
| `src/systems/Surplus.js` | §4.3 surplus rules shared by porters, dock and depot |
| `src/systems/StockLedger.js` | §6.7 registry, sampling, statuses; census hook for tests |
| `src/systems/VillageNews.js` | §6.7 papers + letters |
| `src/systems/RailPath.js` | §5.4 route geometry + speed tables (pure) |
| `src/systems/depot/Depot.js`, `rack.js` | §4.4 model; parity copy of v8 catalog + rackFill |
| `src/entities/DepotBuilding.js`, `CargoSleigh.js`, `DepotBuyer.js` | §4.4 view, sleigh, walk-in buyers |
| `src/systems/office/Office.js` | site, hire pads, staff orchestration, panel entry |
| `src/entities/OfficeBuilding.js` | §6.3 cutaway + wall board (+ CODE-1 stand-in) |
| `src/entities/staff/OfficeClerk.js`, `Secretary.js`, `Courier.js`, `Teller.js` | §6.4–6.5 |
| `src/systems/Bank42.js`, `src/entities/BankBuilding42.js` | §6.6 |
| `src/scenes/OfficePanel.js` | §6.7 tabs |
| `src/data/staffLooks.js` | code presets (`office_a`, `office_b`, `secretary`, `courier`, `teller_a/b`, `bank_manager`, `depot_worker`) |
| `src/systems/pilot/ChiefPilot.js`, `agenda.js`, `work.js`, `CameraDirector.js` | §7 |
| `tools/build/audio_sprite.py`, `tools/build/portrait_atlas.py` | §13.1 |
| `tools/test/review_gameplay_census.mjs` | promoted census bot (stock census + flows, `--patch` hooks) |
| `tools/test/v42_layout.mjs`, `rail42.test.mjs`, `pickup.mjs`, `nav.mjs`, `ledger.test.mjs`, `letters.test.mjs`, `depot.test.mjs`, `depot_parity.test.mjs`, `bank42.test.mjs`, `save_v42.mjs`, `pilot.test.mjs`, `pilot.mjs`, `v42.mjs`, `shots_v42.mjs` | §15 |

**Changed**
| File | Change |
|---|---|
| `src/scenes/Game.js` | construct the v4.2 systems behind their gates; PickupPolicy at the 4 take sites; `gs.tills`; serialize/restore `v42`, `bank`, `logistics`; `__FV.v42` hooks (`state`, `ledger`, `pilot(on)`, `office(build)`, `depot(stock)`, `freight`, `train(stage)`) |
| `src/entities/Player.js` | `PickupPolicy.mayGather`; aura sync; seated/office anims when present |
| `src/core/Input.js` | pilot channel + same-frame hand-off |
| `src/core/Save.js` | v7, `MIGRATE[6]`, `sanitizeV42`, slice keep-rules, Settings keys |
| `src/systems/Rail.js` | route model through `RailPath`, consist stages with `face`, stops by leading nose, legacy branch kept |
| `src/entities/Train.js` | per-car heading on curves, all 5 dirs, box-car door, flat-car crates, labels, train card, avoid rect |
| `src/systems/RoadPaint.js` | rail tiles k −6…41, loop decals (procedural in CODE-1), fences, v4.2 lanes |
| `src/systems/Neighbours.js` | coach doors as board points, `ridersScale`, consist swap at 읍, labels |
| `src/systems/Growth.js` | P0a `trainIn` fix, freight capacity, direct export, `PRIO.SURPLUS` dock sink, `v42.freight` |
| `src/systems/Logistics.js` | `PRIO.SHELF_EMPTY` 48, `PRIO.SURPLUS` 12, distance term, calm INPUT |
| `src/entities/Worker.js` | warehouse direct delivery; station porters take surplus; 역 짐꾼 3/4; 짐꾼 2 |
| `src/entities/Station.js`, `Labour.js` | 가공소 2단 multiplier; 촌장 응원 multiplier |
| `src/entities/Seller.js` (`CashPad`) | registry + `takeAll(ch)` |
| `src/entities/Boathouse.js`, pile code | restore clamp, `가득` label |
| `src/entities/UnlockPad.js`, `Site.js` | ignore the chief while the pilot drives (unless `observeSpend: 'hire'` for hire pads) |
| `src/core/Townfolk.js` | `TF.addPresets(obj)` (merge-only); `TF.mergeFragment(officefolk)` (CODE-2) |
| `src/core/Residency.js` | areas `office`, `bank`, `depot`, `officeInside`, `depotInside`, transient `ui4@office` |
| `src/scenes/UI.js`, `UIv4.js` | settings tabs, 줍기/관망 buttons, nav chip, 업무 chip, caption, what's-new card, train card, generalised edge badges |
| `src/systems/Tutorial.js` | `destination()` returns `{ pad, key, label, sink, room }`; v4.2 hints; arrow hidden in 관망 |
| `src/data/world.js` | `WORLD.v42` (§9) |
| `src/data/balance.js` + `balanceCheck.js` | `BALANCE.v42` (§11) |
| `src/data/strings.js` | §12 |
| `src/core/Audio.js` | audio-sprite playback, same API |
| `tools/build/pack_pages.py`, `build_artifact.mjs` | engine/car all dirs, `v42_core` page, new fragments, sprite audio, batch order |
| `tools/test/review_gameplay_bot.js` | `--pickup`, `--observer`; `auto` + no observer by default |
| `tools/test/rail.mjs` | rewritten for routes/loops (§15) |

---

## 15. Tests and bot targets

**Node**
| Test | Checks |
|---|---|
| `rail42.test.mjs` | route closed and C1-continuous; loop 24.7 m; headings sequence; engine leads in 100 % of moving samples; the nose returns to T1 after the tail left the main line; stops/crossing spans (§5.2); cycle 85 ± 3 s (both stages); legacy coast-line model still drawn by the legacy branch |
| `v42_layout.mjs` | every §9 rect vs RoadNet cells, v4 buildings, lots, plots, coast (≥ 60 px), the v5/v8 tables (`docs/v5_v8_plan.md` §4.2–4.5) with a 0.12-cell margin; loop ballast; sleigh lanes and the dock apron inside y ≤ 3360 |
| `ledger.test.mjs` | statuses on fixtures (부족 / 길 막힘 / 남음 / 적당), EWMA, caps |
| `letters.test.mjs` | all 10 templates trigger on fixtures, ≤ 1 per 2 game hours, effects, archive |
| `depot.test.mjs` | stock = in − out per category; caps; surplus rules; sales ≤ perMin; sleigh conservation (dock → sleigh → racks) |
| `depot_parity.test.mjs` | `rack.js` vs `src/city/logistics/model/stock.js` `rackFill` on 300 random stocks |
| `bank42.test.mjs` | courier conservation; slice passes `src/bank/save.js` `sanitizeBank` unchanged |
| `save_v42.mjs --node` | v6 → v7 on real v4.1 saves (`v4_final/bots/*`), fuzz 300 variants, round trip, `logistics` passes `sanitizeLogistics`, size ≤ 10 KB |
| `pilot.test.mjs` | determinism over 200 snapshots; never picks a pay/hire target with spend off |

**Browser (fixed step)**
| Test | Checks |
|---|---|
| `pickup.mjs` | each mode × each path (output, workshop, boathouse, pile, gather): crossing at full speed takes 0 in 멈추면/끔; standing 0.35 s takes; 줍기 tap/hold; tutorial forces 켬; `auto` byte-identical to v4.1 (labour) |
| `nav.mjs` | destination = `Tutorial.destination` for 40 bag states (mixed-bag rule); route length within 10 % of A*; ≤ 20 objects; one arrow when the tutorial targets the same pad; off in 관망 and the first loop |
| `rail.mjs` (rewritten) | consist swap at 읍; visitors board at coach doors; crossings open as §5.2; chief on the loop stops the train; dock crates load with the camera at the plaza |
| `v42.mjs` | office build → hires in order → courier round deposits every till ≥ 100 within 180 s → bank → passbook rows; aide never > 4 m behind after 2 s; panel opens < 100 ms; reveal hysteresis (no flicker at 260 px); depot site → sleigh round trip → racks equal stock → buyers pay; freight: cards first, surplus next, capacity respected |
| `pilot.mjs` | 30-min soak in 관망 from the 46-min save: 0 errors, 0 stuck > 20 s, **0 coins spent / 0 accidental payments**, ≥ 6 activities per 10 min, hand-back latency 1 frame, income ≥ 80 % of the arrow bot's |
| `texbudget.mjs`, `review_robust_drawcalls.mjs` | §13 gates |
| `shots_v42.mjs` | halo day/night/zoom 0.6 crowd; nav path + edge badge; settings 놀이 tab; both loops with the train mid-curve; consist at each platform; freight loading; office cutaway with staff; 5 panel tabs; bank vault; depot revealed + sleigh; 관망 caption — phone 390×844 and 360×640, ko + en |

**Bots** (`review_gameplay_census.mjs` + `review_gameplay_bot.js`, smart / arrow / arrow-only, fresh and the v4.1 45/46-min saves)
| Target | v4.1 | v4.2 gate |
|---|---|---|
| first-20-min request log | — | identical up to the first sale, one extra page after |
| village complete / 5 shops / 읍 | 20.2 / 37.8 / 47.7 (smart) | ±5 % / ±5 % / ≤ +5 % |
| longest wait after tower_east | 3.0 | ≤ 3.0 |
| §4.5 stock targets | — | all |
| visitors per game minute | v4.1 | ±10 % |
| errors / stuck | 0 / 0 | 0 / 0 |
| 10-min soak (heap, textures) | 36–38 MB, 383 MiB | no growth, ≤ 400 |

---

## 16. Build split

### 16.1 CODE-1 — everything that needs no new art (one builder or two in parallel by phase)
| Phase | Work | Ends with |
|---|---|---|
| **C1-P0** foundations | P0a/P0b bug fixes; file diet (audio sprites, portrait atlas, ui4 page); `pack_pages` keeps engine/car_a/car_b all dirs; pile baking; StockLedger + census bot; Settings keys + tabs; save v7 skeleton + migration + contract tests; `v42_layout.mjs`; `__FV.v42` hooks | all v4.1 suites green, files ≤ 440, plaza objects ≤ 1,700 |
| **C1-P1** chief | ChiefAura (generated `fv_halo*`, glow, pin from `ui_icon_fame`), 촌장 응원, PickupPolicy + 줍기 button (`ui_icon_backpack`), Navigator (generated dots/ring/chevron, `ui_arrow` edge badge) | `pickup.mjs`, `nav.mjs`, bots ±5 % |
| **C1-P2** train | `RailPath`, `Rail` route model, `Train` per-car headings with the **existing** cars as placeholders (car_a ×1.33 = coach, car_b ×1.15 = box car + code crates, car_b ×1.07 = flat car), procedural loop rails + fence in RoadPaint, stops/crossings, coach-door boarding, `ridersScale`, freight capacity + direct export (F7), labels + train card | `rail42.test`, `rail.mjs`, visitors ±10 % |
| **C1-P3** overflow | F1–F5, warehouse direct, Surplus, `PRIO.SURPLUS` dock, 역 짐꾼 3/4 offers | census targets except the depot ones |
| **C1-P4** office + bank | Office system with the `post_office` stand-in, staff (townfolk presets, idle/walk/talk + code props), courier + `gs.tills` + `takeAll`, Bank42 + civic bank cutaway + tellers + vault, OfficePanel (ui4 art + existing icons: `ui_icon_stock`, `ui_icon_newspaper`, `ui_icon_story`, `ui_icon_worker`, `ui_icon_passbook`), letters, news | `v42.mjs` office/bank part, `bank42`, `letters`, `ledger` |
| **C1-P5** depot | site, Depot model, DepotBuilding (assets/logistics), forklift, workers, CargoSleigh (assets/vehicles `cargo_sleigh`) on the v4.2 lanes, buyers, 물류 금고, `logistics` slice | `depot*.test`, `v42.mjs` depot part |
| **C1-P6** 관망 | pilot (activities with existing anims: idle/walk/carry, `pet`, `give`), camera director, HUD (`ui_icon_explore` as the button) | `pilot.test`, `pilot.mjs` |
| **C1-P7** balance | census + bots on fresh and late saves; tune in the order of §4.5 | all §15 bot gates |

CODE-1 is an internal milestone (the designer gets the build after CODE-2), unless art is more than two weeks late:
then CODE-1 + whatever art has landed may be published as "v4.2a" with the stand-in office hidden (office site offered
only when its art exists).

### 16.2 CODE-2 — wire in the new art (`CONTRACT_V42.md`), then tests, screenshots, docs
| Phase | Art (contract §) | Swap |
|---|---|---|
| C2-A | AG `chief_fx` (halo, gold ring, rank band, glow, sparkles, pin, nav chevron/dots/ring/badge/edge) + AL `ui5` (18 icons + 6 panel frames) | generated textures and stand-in icons → `v42_core` page |
| C2-B | AK `train2` (coach, box car + door, flat car, loop decals ours/town, switch stand, fence tile, optional water tower) | placeholders → new cars; procedural arcs → loop decals; texbudget station view |
| C2-C | AI `office` (cutaway building, overlays, `office_mailbox`, items `item_coin_sack_s/m/l` etc.) + AJ `officefolk` (14 staff anims incl. `carry_sack`, parts, presets) + AH `chief2` (sit/read/write/eat/doze/talk/wave/warm_hands/cheer) | stand-in office → cutaway; staff fallbacks → officefolk anims (`TF.mergeFragment`); code presets → manifest presets; 관망/office chief anims |
| C2-D | AM audio (typewriter, switch clack, wheel squeal, mailbox flag, coin sack jingle, `amb_office`) into the audio sprite | fallbacks `sfx_stamp`, `amb_bank`, none |
| C2-E | — | full suites, bots, 20-min soak, texbudget, `shots_v42.mjs`, `docs/build_reports/v42_build.md`, update `기획서_v4_2_촌장.md` with real screenshots, artifact build + `test_deploy`, publish order unchanged |

### 16.3 Interfaces frozen at the end of C1-P0
`PickupPolicy`, `Tutorial.destination()` return shape, `StockLedger.register/rows/status`, `Rail` public surface +
`RailPath.at`, `gs.tills` + `CashPad.takeAll`, `Office` events (`office:hire`, `office:letter`, `office:paper`,
`courier:deposit`), `Depot` API (`wants(ty)`, `room()`, `take(load)`, `stock`), the `v42` save block.

### 16.4 Cut line
If the schedule slips, the **물류창고 (C1-P5 + its art)** moves to v4.3 as one piece: F1–F7 still fix the shelves and the
dock, and the freight cars still carry surplus. Nothing else depends on the depot (the 재고 tab hides its row).

---

## 17. What v5–v8 integration must know

- `SAVE_VERSION`: v4.2 = 7; v5 = 8, v6 = 9, v7 = 10, v8 = 11.
- **Bank**: a `bank` slice may already exist with `open: 1`; v5 constructs `BankHost(ports, saved, { at: WORLD.v42.bank })`
  so the building stays at (−340, 570), never offers its own site, and adopts v4.2's tellers (or removes
  `BankBuilding42` — the adapter is one line in `Game.js`). Row D's `v5_bank` lot (36.21, −19.93) is freed for another
  v5 use; stop S5 `은행 앞` is renamed by the v5 integrator. The courier's rows stay in `v42.office.log`; v5 may show
  them in its passbook as `deposit` rows of the wallet.
- **Logistics**: a `logistics` slice may exist with `open: 1, gift: 1, tut: 1` and stock. The v8 integrator adds
  `PLACES.v42 = { i: 24.51, j: −30.23, … }` to `src/city/logistics/layout.js` and makes `AVE_C` / `ST_WEST_I` / the dock
  lane per-placement (v4.2's lanes: `lgx_dock` i 34.8–36.8, `lgx_walk`), then `LogisticsHost(…, { place: 'v42' })`; the
  racks open exactly as the player left them; `src/systems/depot/*`, `DepotBuilding`, `CargoSleigh` and `DepotBuyer` are
  removed at v8 integration (`rack.js` is only a parity copy). v8's van flows replace the sleigh; the sleigh can stay as
  the era-2 vehicle for v5's `fleet`.
- **Streets** `ave_s`, `bank_st`, `lgx_dock`, `lgx_walk` already exist as dirt with `v42: true`: upgrade by id (P19),
  do not append.
- **Train**: the main line is a route with loops; `Train` draws routes and keeps the legacy push-pull branch for the
  coast line. The coast line's town-east halt must move to i ≥ 44 with a turnout at A′ (42, 0); its terminals need
  loops for engine-first. `rail.coaches` is replaced by `rail.stage` (1 마을, 2 읍); v5's "3rd coach at 도시" becomes
  stage 3 (a 6th unit, +3.0 m, fits: our stop nose moves to i −4.9, still on the straight route before A at −6, and the
  tail stays at 6.87 so crossing 8 stays open).
- **Office**: `VillageNews`/`Letters` sit behind `{ papers(), letters(), markRead() }`; v5's story newspaper and missions
  can replace the source and reuse the panel. `TF.addPresets()` exists for code presets; officefolk merges after
  townfolk2 (rules in its manifest).
- **Economy** is unchanged in v4.2 (no `spendable()`); v5 adds savings and loans on top of the same passbook.

---

## 18. Risks

| Risk | Mitigation |
|---|---|
| Loop curves look stiff with 8 headings on R 1.75 cells | chord-based heading, curve speed 2.2 m/s, 4-frame curve dirs; the contract asks for curve-friendly car proportions; fallback = top-and-tail is a data change (`face`) |
| Depot corner is cramped (bay 2 apron down to y ≈ 3330) | only bay 2 used, U-turn on the apron, border-tree gap; layout gate y ≤ 3360; cut line §16.4 |
| File limit | P0 diet first; build fails above 480 |
| Texture memory near the station (+14 MiB) | curve dirs at 4 frames, low tier at 1; old car pages dropped; gate ≤ v4.1 + 14 |
| Office purchases delay 읍 | gate ≤ +5 %; if over, the office site waits until 읍 |
| 관망 surprises the designer (auto-start) | 60 s default with a 3 s countdown, setting 끔, any touch hands back in the same frame, never spends |
| Officefolk render job is large (13 anims × 4 bases × office wardrobe) | CODE-1 fallbacks for every anim; the wardrobe is restricted to the cover list; desk anims first |
| Income inflation from exports + depot sales | capped by freight and sales throughput; tune `exportRate`, `sell.rate`, then F5 |
| Bank moved out of v5's row D | lead decision recorded here; v5 needs only `{ at }` and a stop rename |

---

## Appendix A. What each proposal contributed

- **Player proposal**: the measured shelf/output picture and the coin-walking share (33 %); F1–F5 and the 짐꾼 2 /
  가공소 2단 upgrades; the halo ring with constant screen size, gold work state and star pin; the pickup modes and 0.35 s;
  navigation by the porters' priority and the mixed-bag rule; **balloon loops** with exact lattice points; the S1/S2
  consist idea and riders-per-train scaling; office place, the four named staff and their routines, letters with real
  effects; bank next to the office with deposits as spendable coins; 관망 activity table, 60 s auto start, never
  spending; the in-map 물류창고 site and the cargo sleigh; HUD layout and the settings tab.
- **Tech proposal**: the dock-loading bug and the boathouse clamp; the one-policy pickup design over five call sites;
  `Tutorial.destination` as the single resolver; distance in porter scoring; Surplus rules; freight on the train and
  camera-independent loading; NORMAL-blend-only aura and rank tiers; StockLedger / VillageNews data sources and the panel
  interface for v5; Input hand-off channel, determinism and the camera director; save v7 with module-format slices and
  contract tests; the file diet and per-view texture gates; v5–v8 renumbering; the coach colour rule (no red roof
  continuing the engine).
- **Lead changes**: loop points moved to integer lattice ends (A −6, A′ 42) so straight tiles join cleanly; consist
  lengths over couplers and stops recomputed (box car opposite the 짐 싣는 곳 at both stages); timetable 3.4/2.2 m/s →
  85–86 s; flat car instead of caboose (task); direct export before the depot (no sleigh round trip for exports); depot
  sells to walk-in town buyers (v8-compatible) instead of a return-trip export; bank deposits without savings (v5 owns
  them); office and bank nudged off the paths ((110, 810), (−340, 570)); staff hire order puts the courier second;
  관망 urgent chores from the tutorial's targets minus every pay target; pads ignore the chief while piloted.
