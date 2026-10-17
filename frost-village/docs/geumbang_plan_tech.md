# 금방 온라인 마켓 — engineering + art plan (tech proposal)

Status: **proposal** (tech / art-planning angle). A lead plan merges it with the other 금방 proposals. No game code,
asset or tool was changed for it; every number marked *measured* was read from the repo on 2026-10-17 (HEAD 2bbbde6,
v4.2 CODE-2 in progress). The node probes are in the scratchpad (`geumbang_tech/curb.mjs`, `streets.mjs`, `houses.mjs`).

Designer idea (verbatim): "재고를 빨리 소진하기 위해 온라인 마켓도 만들까? 시민들이 온라인 마켓으로 주문하면 온라인 마켓
물류센터에서 배달차로 시민 집까지 배달? 어때? 배달 회사는 쿠팡이 아닌 금방 ㅋㅋ 금방 뭐가 왔지? ㅋㅋ 금방 대형 물류창고,
금방물류 배달 차량, 배달 기사, 물류창고 직원들 어때?"

> **한눈에 (디자이너용)**
> - 금방은 v4.2 의 **서리 물류창고 건물을 그대로 쓰는** 회사예요. 간판만 "금방 물류센터"로 바뀌고, 닫혀 있던 1번 도크가 열려서 금방 배달차가 드나들어요.
> - 시민(솔방울 마을 아파트·가게 위층·역 앞 집)이 주문하면 → 직원이 선반에서 꺼내 → 컨베이어로 포장 → 배달차가 도로를 달려 → 기사가 상자를 들고 현관까지 → "금방 왔지?" → 코인. 물류창고 선반의 재고가 그만큼 빨리 줄어요.
> - 마을(눈길) 집은 차가 못 가요. 그래서 2단계에서 **창고에서 걸어서 배달**하는 도보 기사를 붙여요.
> - 새로 그릴 그림은 **아주 적어요**: 금방 색 배달차 1종, 금방 간판 글자, 세움 간판 1개, 아이콘 1~3개, 효과음 2개. 사람(기사·직원)은 이미 있는 마을 사람 옷을 금색·남색으로 입혀요.
> - 파일 수 한계(버전당 511개)가 제일 큰 벽이라, 금방 그림은 **한 장(페이지)에 모두** 넣고, 물류창고 그림을 다시 묶어서 파일 2개를 아껴요. 결과: 파일 +1개.

---

## 0. Decisions at a glance

| # | Topic | Proposal | Why (measured facts) |
|---|---|---|---|
| D1 | Version | **G1 = v4.3** (after v4.2 ships, before v5 integration), built on v4.2 systems in the v4.2 style; the model is written in v5-module shape so v5/v8 adopt it (G2, G3) | v4.2's depot is the only sink for the overflow and its throughput is the limit (§4.5 of `v42_plan.md`: "any raw pile ≥ 90 %" still 97 %); waiting for v5–v8 delays the fix by four versions |
| D2 | Hub | **금방 moves into the 서리 물류창고** (`logistics_center` at L(28.4, −27.4) = (3184, 3101)): nameplate swap, **dock 1 (van bay) opens**, the 7 manifest staff points are filled | v4.2's occupancy search found this the only in-map 11 × 8 m spot; a second big hub needs v8's world growth (G3) |
| D3 | Stock | One source of truth: the depot racks (`Depot.stock`, saved in the v8 `logistics` slice). An order **picks** (removes) items when placed; they live in the order until delivered. G1b adds the v3 창고 above 50 % for village walk orders | Same rule as v8 `orders.js` ("picked items left the stock"); conservation is testable |
| D4 | Who orders | **Addresses** (a building door) with residents: TownSim homes (`t_apt1–4`, shop households, `t_hall`, `t_fire`, district lots A/B/H) in G1; village houses in G1b; story residents (v5) name the orderer | TownSim already has `c.home` and a favourite food `c.fav` per citizen |
| D5 | Driving | G1: own **VanDriver** = lane polylines from `RoadNet.route(…, { mode: 'drive' })` + a data **spur** from dock 1 to the drive graph; yields to walkers; analytic off screen. G2 (v5): one additive `tour()` API in `src/vehicles` replaces it | The v4.2 depot lanes are **not connected** to the drive graph (measured, §3.2); `vehicles.dispatch()` is single-stop (depot → one point → back) |
| D6 | Doorstep | Van parks at the **curb** (nearest lane point), a courier doll walks to the door with the parcel (walk + item stack, as v4.2's `DepotBuyer`) | Curb → door walks are 0–4.7 m for every apartment, shop household and lot (measured) |
| D7 | People | **Townfolk paper dolls with code presets** (gold/navy tints) in G1 — 0 new pages; cityfolk `delivery_driver` + `carry_box` in G3 when v8 merges cityfolk | Cityfolk needs head + loco + work pages = 28.3 MiB and +4 files; `top_delivery_polo` cannot play townfolk anims |
| D8 | New art | One page `assets/geumbang/` (≤ 2048 × 1024, ≈ 8 MiB): 금방 livery van (same rig as `delivery_van`), nameplate ko/en, a pole sign, 1–3 icons; + one 2-cue sfx sprite | Everything else is reused (§8) |
| D9 | Files | G1 ships **3 files** (manifest, page, sfx sprite) and re-packs the four logistics centre atlases into a closed page + an inside page (**−2**) → **net +1** | 387 files today (CODE-1 build), ≈ 448 after CODE-2, build gate 480, hard limit 511, v5 wants ≥ 60 headroom |
| D10 | Save | New main-save slice **`geumbang` v1, cap 1,280 B**, no `SAVE_VERSION` bump (additive key, sanitizer registered); v5–v8 numbering unchanged | v4.2 worst case ≈ 8 KB vs gate 10,240 B |
| D11 | Budgets | Logic ≤ 0.06 ms/tick near, ≤ 0.015 far; ≤ +120 display objects in the busiest view; ≤ +1 draw call; textures ≤ +9 MiB in any view | v4.2 measured 0.11–0.19 ms total, depot view 412 MiB peak (CODE-1) |
| D12 | Brand safety | Original mark, **no text on any mirrored sprite** (vans, dolls), palette and motif checklist against real brands (§9.5) | Vans render SE/NE only, SW/NW are flipX mirrors: baked letters would read backwards |

Order of value if the lead must cut: vans + hub (G1 core) · order bubbles + panel · uniforms · 금방 sign/nameplate art ·
walk delivery (G1b) · rear-door frames · night delivery.

---

## 1. What exists today (read-only inputs)

| Thing | Where | What 금방 uses |
|---|---|---|
| 서리 물류창고 (v4.2 F8) | `src/systems/depot/{Depot,DepotSystem,rack}.js`, `src/entities/DepotBuilding.js`, `CargoSleigh.js` | stock model (caps materials 160 · food 160 · goods 120 · tools 60), walk-in buyers (perMin 20/30/20/6, price × 0.6), 물류 금고 till, sleigh inbound at **bay 2**, Residency area `depot` rect [2700, 2850, 3700, 3420] |
| v4.2 frozen interfaces | `v42_plan.md` §16.3 | `Depot` API (`wants(ty)`, `room()`, `take(load)`, `stock`), `gs.tills` + `CashPad.takeAll`, `StockLedger.register/rows/status`, Office events |
| Drive lanes | `src/systems/RoadNet.js` (`driveNodes`, `driveEdges`, `laneCentre`, `route(…, { mode: 'drive' })`, `onChange`) | right-hand lanes on `main` (역앞 거리), `back`, `ave` (중앙로); **12 nodes / 9 edges** with the v4.2 streets appended (measured) |
| Logistics art | `assets/logistics` | cutaway centre (13 layers, separate `nameplate_ko/en` layers, `nameBoard` for a custom name), `dock1/dock2` door anims, conveyor anim, 30 rack slots + `itemFit`, 7 `staffPoints` (clerk, 2 packers, 3 pickers, dockhand), `dockVehiclePoints.delivery_van` [[269, 230], [439, 145]], vans red/blue/mint (1988 × 636 = 4.82 MiB each), forklift, `cardboard_box_s/m/l` (in `lgx_items`, 0.34 MiB) |
| People | `assets/townfolk` (+ v4.2 `staffLooks.js`, `TF.addPresets`) | `top_puffer`, `top_parka`, `hat_cap`, `hat_beanie`, `acc_mailbag`, `det_hivis`, `bot_pants`; anims idle/walk/talk/wave/happy; tint any colour (`tintModel`) |
| cityfolk | `assets/cityfolk` | `delivery_driver`, `warehouse_worker`, `forklift_driver` presets, `carry_box` + `boxPoint` — **G3 only** (pages head 3.9 + loco 12.9 + work 11.5 MiB) |
| v5 vehicles | `src/vehicles/**` (module, not integrated) | `VehicleSim` (car following, junction reservation, yield, analytic), `fleet.dispatch(key, to)` = one destination, `spawn(key, route)` = first/last point only |
| v8 logistics | `src/city/logistics/**` (module, not integrated) | `orders.js` already has `kind 'home'`, `mode 'centre'` (the centre's own van, paid on delivery at `homeRate`), states pick → pack → ready → gone → done |
| Sounds | shipped: `audio3` (`sfx_truck_engine` loop, sprite with `sfx_door`, `sfx_brakes`, `sfx_car_honk_1`), `audio` sprite (`sfx_coin`, `sfx_cash`); not yet shipped: `audio6` (`sfx_box_drop*`, `sfx_ticket_chime`, `amb_warehouse`, `sfx_forklift_beep`, `sfx_stamp`) | engine, brakes, door, coins; parcel thud and chime if v4.2 CODE-2 ships them |
| Icons | `ui5` (`ui_icon_depot`, `ui_icon_route`, `ui_icon_staff`), `fx_city` ui4 (`ui_icon_box`, `ui_icon_settle`, `ui_icon_stock`, `ui_icon_forklift`), `ui3` (`ui_icon_delivery`), emotes (`ui_emote_bubble`, `emote_heart`, `emote_exclaim`) | all panel/bubble icons except the brand mark |

Ownership while v4.2 finishes: `src/**`, `index.html`, `tools/build/**`, `tools/test/**` belong to the v4.2 workflow.
The G1 build starts after v4.2 publishes; its patches to v4.2 files are listed in §10 and are all additive.

---

## 2. Phases

| Phase | When | Scope | Depends on |
|---|---|---|---|
| **G1** | v4.3 | hub takeover, OrderBook over town/district addresses, picking/packing, VanDriver (1–4 vans), courier at the door, settlement, panel, save slice, new art page | v4.2 depot built (cut line: if the depot slips to v4.3, 금방 rides with it) |
| **G1b** | v4.3 (late) or v4.4 | **walk delivery** in the village: a 금방 walking courier picks from the 창고 (only above 50 %) and walks to village houses ≤ 45 m away | G1; `Warehouse.giveTo` |
| **G2** | v5 integration | vans move to `VehicleSim` through one new API `tour()`; traffic lights, car following, connector reservations; era exemption for `role: 'gb'`; v5 서리 큰길 lets vans reach the plaza gate, so more village houses get van delivery | v5 vehicles module + its critique fixes (C1 parked-forever, M2 yield list) |
| **G3** | v8 integration | OrderBook becomes a source of v8 `home` orders (`mode: 'centre'`); cityfolk drivers with `carry_box`; optional second **금방 메가센터** at v8's `c_logistics` site in the new town | v8 logistics + cityfolk merge + half-res cityfolk tier |

Gate for G1: depot built **and** 30 game minutes after it (or the v4.2 letter system's next free slot). The offer
arrives as a v4.2 letter ("금방이라는 회사에서 편지가 왔어요" — the "금방 뭐가 왔지?" joke), then a pay pad at the depot door
(`open.coins` 4,000). Nothing about 금방 loads before that gate (request-log guardrail, §11).

---

## 3. Places (measured)

### 3.1 Hub

| Thing | Lattice | px | Note |
|---|---|---|---|
| building | (28.4, −27.4) | (3184, 3101) | unchanged v4.2 placement |
| **dock 1 (van bay)** — `dockVehiclePoints.delivery_van[0]` | (34.1, −28.9) | (3453, 3331) | shut in v4.2; van footprint reaches y ≈ 3402 → v4.2's layout gate "apron y ≤ 3360" must allow ≤ 3420 for this bay, and `lgx_dock` paint extends j −27.6 → −29.6 |
| dock 2 (truck bay) | (34.1, −26.2) | (3623, 3246) | stays the sleigh's (inbound) |
| outbound pile | `dockPoints[0]` [154, 172] inside door 1 | (3338, 3273) | one `StackBaker` image of `cardboard_box_*` |
| dockhand | `staffPoints[6]` [272, 147] (`outside`) | (3456, 3248) | loads parcels into the van's `rearDoorPoint` |
| 금방 sign (new prop) | ≈ (23.0, −24.8), beside the 은행길 end of the footpath `lgx_walk` | ≈ (3005, 2845) | outside the footprint (i 24.51–32.29) and clear of the 물류 금고 (30.0, −31.4); must pass `v42_layout.mjs` |

If the lead refuses bay 1 (y-gate), **fallback**: vans share bay 2 with the sleigh through a dock scheduler (sleigh
has priority; a van waits on the apron). Costs ≈ 10 % van throughput.

### 3.2 The drive graph (measured with `RoadNet` on `WORLD.v4` + `WORLD.v42.streets`)

- Connected: `main` (i 8–49.5, j −6…−4), `back` (i 13–50, j −14…−12), `ave` (i 30–34, j −18…−4): 8 nodes, junctions
  r1 (32, −5) and r4 (32, −13), ave's south end **r6 (32, −18)**.
- **Not connected:** `ave_s` (lane at i 30.75, ends at (30.75, −18) — 1.25 cells off r6, and y–y streets never join),
  `bank_st` (lane j −23.3, misses `ave_s`'s end −22.2 by 1.1 cells), `lgx_dock` (no lane: `paved()` is null). The v4.2
  sleigh drives its own lattice polyline (`WORLD.v42.sleighRoute`), not lanes.
- The village (west of `main`'s end r0 at (8, −5), x 3312) has **no drive lanes at all**; village plots lie at x −1150
  … 2700.

So G1 adds a data **spur** (`WORLD.v43.gb.spur`, two lattice polylines, axis-aligned except one S-jog):

```
out: bay1 (34.1,-28.9) -> (35.55,-28.9) -> (35.55,-23.3) -> (30.75,-23.3) -> (30.75,-19.0) ~> (33.0,-17.6) -> joins ave:4 lane +j at (33,-18)
in : ave lane -j at (31,-18) -> (30.75,-19.0) -> (30.75,-23.3) -> (35.55,-23.3) -> (35.55,-28.9) -> reverse into bay1 facing SE
```
≈ 18.7 cells = **26 m** each way. All legs are axis-aligned, so the van's SE/NE (+ mirrors) frames cover them; the S-jog
is two quarter-turns. At G2, v5's street table already owns `ave_s` and `bank_st` (P19 "upgrade by id"), so the spur
becomes real lanes and the data spur is deleted.

### 3.3 Addresses (measured: curb = nearest lane point to the door; drive = from r6 over the drive graph)

| Address | Curb street | Curb → door (m) | r6 → curb (m) |
|---|---|---|---|
| `t_apt1` / `t_apt2` / `t_apt3` / `t_apt4` (apartments) | ave / back / back / back | 3.8 / 4.5 / 4.7 / 4.5 | 2 / 16 / 44 / 40 |
| shop households `t_cafe`, `t_book`, `t_toy`, `t_cloth`, `t_flower`, `t_hair`, `t_rest` | main | 2.0–2.1 | 24–55 |
| district lots `lotA1–3` / `lotB1–5` / `lotH1–5` | main / back / back | 1.9 / 1.2–1.4 / 4.0 | 13–62 |
| `t_hall`, `t_fire` (civic homes) | back / back | 0.0 / 4.1 | 42 / 33 |
| `t_station` | main | 8.4, but the door is on the platform side (j ≈ +1.5): the walk would cross the rail | zone `none` |
| village houses (`House.js`, settlers) | — | no lane | G1b walk zone |

A 6-stop tour (greedy nearest-neighbour, 200 random baskets, spur both ways): **p10 270 m, p50 328 m, p90 381 m**
(estimate on node routes).

---

## 4. Data flow

```
 TownSim homes / lots / (G1b) village houses
        │  AddressBook: { aid, door, curb, walkM, zone: drive|walk|none, residents[], favs }
        ▼
 OrderBook ──(demand: seeded, hour curve, fav + 남음 promo weights, open-order target)──┐
        │ placeOrder(aid) → picks items NOW from the source stock                         │
        ▼                                                                                 │
 Source stock:  depot racks (zone drive)   |   창고 above keep (zone walk, G1b)           │ StockLedger statuses
        │                                                                                 │ ('surplus' → promo)
        ▼                                                                                 │
 Fulfil (analytic, visual when revealed):  pick → pack (conveyor) → ready (outbound pile) ◄┘
        │
        ▼
 Dispatch: tour builder (≤ 6 stops, cap 8 parcels, batch per address) ── van at dock 1 (door anim, dockhand loads)
        │
        ▼
 VanDriver (G1) / vehicles.tour (G2): spur → drive graph → curb … → back to bay 1   (analytic when far)
        │
        ▼
 Doorstep: courier doll curb → door → "금방 왔지?" → parcel in → back (analytic when far)
        │
        ▼
 Settlement: coins = Σ price × rate → 물류 금고 (depot till, collected by 딸랑이) · town happiness sample ·
             ledger + office income 'geumbang' · events gb:delivered (v5 missions/story later)
```

### 4.1 AddressBook (`model/addresses.js`, pure)
- Built from: `WORLD.v4.town.buildings` with a home role (`role === 'home'`, shops with a household, `t_hall`,
  `t_fire`), `WORLD.v4.lots` with a founded household, and (G1b) `gs.houses` with occupied beds. An address whose
  curb → door walk route has a rail crossing (`route.xings` not empty: `t_station` today) is zone `none`.
- Per address: door px (manifest `doorPoint`, or the lot formula `Neighbours` already uses), **curb** = projection onto
  the nearest lane (edge id, dir, s, x, y), `walkM`, `zone` (`drive` if a curb ≤ 12 m and a route from r6 exists; `walk`
  if a village house ≤ `walk.maxM` 45 m from the 창고 door on the walk graph; else `none`), residents (TownSim ids by
  `c.home`, settlers by house), favourite foods (`c.fav`).
- Rebuilt on `RoadNet.onChange`, on `built`/`houseDone`, at most once per 2 s. A distance matrix between curb nodes
  (≤ 12 nodes → Floyd–Warshall 1,728 steps) is cached with it.

### 4.2 OrderBook (`model/orders.js`, pure, seeded)
- Open hours `hours.open`–`hours.close` (07–21; night delivery is an upgrade).
- **Demand controller** instead of free Poisson, so the book never floods: keep
  `open ≈ ceil(demand.targetPerVan × vans × van.cap)`; while below it, the next order comes after a seeded gap
  `demand.gapS` [6, 14] s × hour curve (lunch and evening peaks). Address chosen by residents (weight ∝ residents,
  ≤ `perAddressOpen` 2 open orders each).
- Basket: 1–`linesMax` 3 lines. Item weight = `catalog[item]` × (`favW` 2 if a resident's `fav`) × (`promoW` 2.5 if
  the StockLedger status of its line is `surplus` or the rack category is ≥ 80 % full) × (0 if the source has fewer than
  the line's units). Units per line from `demand.units[item]` (e.g. bread 2–6, 장작 = `item_log` 5–10).
- **Placing picks**: `source.pick({ item: n })` removes the items immediately (an order is never placed that cannot be
  filled, so there are no stock-out cancellations; walk-in buyers can never sell picked items).
- Order shape = v8 `Order` (`id`, `to: 'home:<aid>'`, `kind: 'home'`, `mode: 'centre'` for vans or `'foot'` for G1b
  walk delivery — not v8's `'walk'`, which means a walk-in owner —, `want`, `got`, `st: pick | pack | ready | gone |
  done`) + `by` (TownSim pid for names) + `t0` (game s).

Catalogue (data, `tuning.js`; labels in `strings.js`): food `item_bread`, `item_fish_cooked`, `item_meat_cooked`,
`item_can`, **산지직송** `item_fish_raw`, `item_meat_raw`, `item_fish_big` (rare); home **장작** `item_log`, **밀 포대**
`item_wheat`, DIY `item_plank`; tools `item_rod`, `item_sickle`, `item_axe` (rare). Not sold: `item_ore`, `item_ingot`
(no household use: ore drains only through the train export and 가공소 2단 — say so to the designer).

### 4.3 Fulfil (`model/fulfil.js`)
- Capacities per second: pickers `pick.lineS` 4 s per line each (1–3 pickers), packers `pick.packS` 3 s per parcel
  (1–2). Bottleneck is normally the vans (§7.1), not the hub.
- Visual only when the cutaway is revealed (`DepotBuilding.revealed`): a picker plays a short reach at its rack slot,
  the `conveyor` patch already carries parcels, the outbound pile grows. Never simulated per frame otherwise.
- Parcel size class from units: s ≤ 3, m ≤ 8, l > 8 (`cardboard_box_s/m/l`).

### 4.4 Dispatch (`model/dispatch.js`)
- A van leaves when it holds `van.cap` 8 parcels **or** the oldest ready parcel has waited `waitFullS` 20 s.
- Tour = ≤ `maxStops` 6 addresses, all parcels for one address in one stop; order by nearest-neighbour + 2-opt on the
  cached matrix (≤ 100 steps). Returns to bay 1 when empty.
- Van states: `bay` (loading `loadS` 6 s, door 1 opens, dockhand trips) → `spurOut` → `drive` → `curb` (dwell =
  courier time) → … → `spurIn` → `pivot` (SW → SE in place over 0.5 s, the sleigh's U-turn trick) → `reverse` (2.4 m
  backwards into bay 1) → `bay`. **Every tour ends in `bay`** (the v5 critique C1 lesson: a van may
  never dwell in a lane forever; a watchdog sends any van that has not changed state for 60 s back, test-checked).

### 4.5 VanDriver (G1, `view/VanDriver.js` + pure `model/path.js`)
- Path = spur polyline + `RoadNet.route` lane polylines + partial edge to the curb s; corners on axis streets become a
  0.25 s heading swap (the 2-heading art cannot show diagonals; same trick as `CargoSleigh`).
- Speed by street class: dirt 3.5 · cobble 4.5 · asphalt 5.5 m/s (at 읍 the streets are cobble), accel 1.5 m/s².
- **Yield** (near the view only): a walker (TownSim bodies, `gs.agents`, the chief, visitors) inside a 0.9 m corridor
  0.6–2.5 m ahead → brake to 0; after 6 s a soft `sfx_car_honk_1` (≤ once per 6 s). Never overlaps anybody. Route weight
  `main` × 1.3 so tours prefer `back` where fewer townsfolk walk the lane (risk §13).
- **Analytic far**: the model keeps `s(t)` per van from the path length and the speed table; events are scheduled on a
  small heap (TownSim pattern). A van coming into view is materialised at `s(t)` (pooled sprite).
- Rail: no tour crosses the rail (all addresses are j < 0) — asserted by a test so a later address cannot sneak a
  crossing in without the `BLOCK_NEAR` rule.
- **One-lane spur**: `lgx_dock` and the apron are one dirt lane shared with the v4.2 cargo sleigh (which is not a lane
  vehicle). A token covers `lgx_dock` + apron: the sleigh has priority; a van waits at the `bank_st` corner (35.55,
  −23.3) until the token is free. Tested (no two vehicles in the token zone).

### 4.6 Doorstep (`view/Courier.js`)
- The driver doll steps out at the van's `doorPoints[dir][0]`, walks to `rearDoorPoint`, takes the parcel (item stack,
  `ch.stack.push('cardboard_box_m')`), walks the RoadNet walk route to the door, plays `talk` 1 s with a bubble
  "금방 왔지?" (ko) / "Here already!" (en), `sfx_door` + chime, `emote_heart` above the door, coin text, walks back.
  Walks are ≤ 4.7 m for every `drive` address (measured).
- Far from the view: dwell = `2 × walkM / 1.4 + van.doorS` seconds, nothing drawn.

### 4.7 Settlement (`model/settle.js`)
- Coins on delivery = round(Σ `priceOf(item)` × `pay.rate` 0.8), raw items at `depot.rawPrice` × `pay.rawRate` 2.0;
  paid into the **물류 금고** (`DepotSystem.till`) so 딸랑이's round and `gs.tills` already handle them; office income
  source `geumbang`.
- Town happiness: `Growth.addSatisfaction(onTime ? 0.95 : 0.8)` (`pay.promiseS` 150 s from order to door) — gentle,
  never punishing.
- Day stats (`days`), totals, StockLedger rows (`gb_open`, `gb_out`), events `gb:order`, `gb:ready`, `gb:dispatch`,
  `gb:arrive`, `gb:delivered { id, aid, n, coins, onTime }`, `gb:open`. v5's GameFeed maps `gb:delivered` to its
  `delivered` event (missions "금방 배송 10건", story lines "주문했더니 진짜 금방 왔어!").

### 4.8 Failure handling (all tested)
| Case | Rule |
|---|---|
| address disappears / route lost (a street repaved, a building moved) | the parcel goes back: `source.restock(got)` (depot; 창고 for walk orders); no coins |
| van blocked > 20 s in a row | skip that stop, retry at the end of the tour, then restock |
| save during a tour | orders in `gone` are saved as `ready`; vans restart from bay 1 (the v4.2 sleigh rule: nothing on a vehicle is lost) |
| racks over cap after a restock | `Depot.take` accepts what fits; the rest goes to the dock surplus (Freight `addSurplus`) |
| 금방 closed at night | open orders still finish; no new ones |

---

## 5. Code shape (for the G1 builder)

New files (module shape of `v5_v8_plan.md` §5.2 so v5's `ModuleHost` can adopt it with a port shim):

| File | Layer | Purpose |
|---|---|---|
| `src/geumbang/model/{addresses,orders,fulfil,dispatch,path,settle,GbModel,rng}.js` | pure (no Phaser, no `window`) | §4; `GbModel.tick(dt, T, hour)`; events out |
| `src/geumbang/view/{GbHub,Van,VanDriver,Courier,OrderBubbles,GbPanel}.js` | Phaser | nameplate swap + dock 1 + outbound pile + dockhand; van sprites; doorstep; ≤ 2 order bubbles on screen; panel (주문 · 재고 · 배송 · 정산) |
| `src/geumbang/host.js` | glue | constructs model + view; `update(dt)`, `serialize()`, `state()`, `api`, `destroy()` |
| `src/geumbang/ports_v4.js` | glue | the subset of kit Ports over v4.2 objects (coins, ui, sound, view, world, roads, town, clock, assets, residency, depot, warehouse, ledger, growth, events); replaced by kit `Ports` at v5 |
| `src/geumbang/{tuning,strings,save,index}.js` | data | `BALANCE.v43.gb` defaults (Korean comments), ko + en strings, sanitizer, `MODULE` descriptor |

Public API (`gs.v43.gb`, later `gs.later.geumbang`): `open()`, `isOpen()`, `stats()`, `orders()`, `vans()`,
`address(aid)`, `upgrade(kind)`, `reveal()`. Interfaces frozen at the end of GB-CODE-1 P0: `source.pick/restock`,
`AddressBook.list()`, the event names above, the save slice.

Determinism: one seeded stream (`mulberry32(seed ^ day)`) per subsystem; Node tests run the model with the fixed step.

---

## 6. Save slice `geumbang` (v1, cap 1,280 B)

```js
s.geumbang = {
  v: 1,
  st: 0 | 1 | 2,                       // 0 letter offered · 1 paid, opening ribbon · 2 open
  lv: { van: 1..4, pick: 1..3, walk: 0|1, night: 0|1 },
  seq: n, seed: uint32, day: n,
  ord: [[id, to, flags, got] ≤ 24],    // to 'a:t_apt2' | 'l:lotH3' | 'h:<houseId>'; flags = st (p|k|r) + mode (c|f);
                                       // got 'bread3,can2' (v8 KEY rule: no item_ prefix); 'gone' is saved as 'r'
  staff: [uint32 ≤ 10],                // seeded looks (drivers, pickers, packers, dockhand, walker)
  days: [[orders, delivered, coins] ≤ 7],
  tot: [orders, delivered, coins, units],
  seen: n                              // bit flags: letter, first delivery card, panel tip
}
```
- `sanitizeGeumbang(raw)`: ints clamped, unknown items dropped (`ITEMS`), unknown addresses kept as text but restocked
  on load if they no longer exist, arrays capped, JSON ≤ 1,280 B (oldest `days` rows dropped first), never throws.
- `Save.js` keeps the slice through a **local copy** of the keep-rule (the v4.2 pattern for `bank`/`logistics`); a
  contract test runs the module sanitizer on real saves. No `SAVE_VERSION` bump: the key is additive and every v4.2
  sanitizer step is pass-through. A downgrade to v4.2 drops the key and loses ≤ 24 orders' items (documented).
- Conservation invariant (test): `depot stock + 창고 + Σ order.got + delivered units = start + inflow − walk-in sales`.
- Size: worst case ≈ 1.1 KB → main save ≤ 9.3 KB < the 10,240 B gate; write ≤ +0.1 ms.
- G3: `ord` rows convert 1:1 into v8 `logistics.orders` home rows (`h` kind, `c` mode); the `geumbang` slice keeps
  only brand state (`lv`, `staff`, `days`, `tot`).

---

## 7. Budgets

### 7.1 Throughput (estimates; the census bot sets the final numbers)
Tour ≈ 330 m at 4.5 m/s ≈ 73 s + 6 stops × ≈ 9 s door time + 6 s load ≈ **2.3 min**, ≈ 8 parcels × ≈ 5 units ≈ 40
units → **≈ 17 units/min per van**; 4 vans ≈ 70 units/min. The walk-in buyers sell ≤ 76/min, the sleigh brings ≈ 48
units/min per sleigh (60 per ≈ 75 s round). So with 3–4 vans the **sleigh becomes the bottleneck** for draining the
village piles: the plan keeps "썰매 한 대 더" (v4.2) and adds an optional G1 upgrade **금방 집하** (one van also does
station-dock pickups at `main`'s west end r0 (8, −5), 3 cells from the 짐 싣는 곳, on its way back).

| Gate (census bot, 46-min v4.1 save + depot built, 30 game min, fixed step) | v4.2 final | 금방 Lv1 / Lv3 |
|---|---|---|
| any raw pile ≥ 90 % of the time | 97 % | ≤ 80 % / ≤ 60 % |
| depot fill (mean) | — (racks fill, then the dock backs up) | 30–80 %, never 100 % for > 2 min |
| units leaving the depot per min | walk-in ≤ 76 | + ≥ 15 / + ≥ 45 |
| income vs v4.2 final | +37 % over v4.1 (already over its +30 % gate) | ≤ +5 % more (`pay.rate` is the lever; designer decision) |
| van blocked time | — | ≤ 5 % of tour time |

### 7.2 CPU (fixed-step bench, ms per tick)
| Part | Budget |
|---|---|
| model (orders, fulfil, dispatch, settle; ≤ 24 orders, ≤ 4 vans, event heap) | ≤ 0.02 |
| VanDriver + yield (≤ 4 vans × ≤ 80 walkers distance checks, only near the view) | ≤ 0.02 |
| couriers, bubbles, hub visuals (only near / revealed) | ≤ 0.02 |
| **total near / far** | **≤ 0.06 / ≤ 0.015** (v4.2 measured 0.11–0.19 for all of v4.2) |
| AddressBook rebuild + distance matrix (event-driven) | ≤ 2 ms once, never in a frame twice within 2 s |

### 7.3 Display objects and draw calls
Per van: body + shadow + overlay + driver lite rig + ≤ 3 parcels ≤ 12; per courier (full rig near) ≤ 14; bubbles ≤ 2 × 3;
hub: outbound pile 1 baked image, sign 1, nameplate 1, 4 extra staff only while revealed. Worst case in the town view
(4 vans + 2 couriers + 2 bubbles) ≈ **+82**, depot view revealed ≈ +110 → stays under the 1,700 gate if v4.2's plaza
fix holds (re-measure the town view, where v4.2 never measured). Draw calls: one new page in view = **≤ +1**; NORMAL
blend only, no shader, Canvas mode works.

### 7.4 Textures (Phaser source-sum, gate ≤ 455 MiB in every view)
| View | Adds | Gate |
|---|---|---|
| depot revealed (CODE-1 peak 412 MiB with placeholders) | `gb_page_0` 8.0 (the van colour, nameplate, sign, icons) | ≤ v4.2 + 9 |
| town / district with vans | `gb_page_0` 8.0 + `lgx_items` 0.34 (parcels) | ≤ v4.2 + 9 |
| G3 cityfolk drivers | + head 3.9 + loco 12.9 + work 11.5 (half tier: ÷ 4) | only with the half tier |
**Not loaded in G1**: `lgx_delivery_van_*` (4.82 each; the 금방 van replaces them), cityfolk pages, `lgx_forklift_loaded`.
Residency: area `gb` = the depot rect plus a class `gbVan` (acquire when any van is materialised ≤ 1,200 px from the
view, release after TTL 20 s) — the page stays out of the plaza and village views.

### 7.5 Files (the wall)
| Step | Files | Note |
|---|---|---|
| today (`dist/artifact_files.json`, CODE-1 build, 2026-10-17) | **387** | batches 250 + 137 |
| v4.2 CODE-2 new art (plan) | ≈ 448 | build gate 480; v5 wants ≥ 60 headroom to 511 |
| 금방 G1: `assets/geumbang/manifest.json`, `gb_page_0.webp`, `gb_sfx_sprite.mp3` | **+3** | frames embedded in the manifest (the reused-atlas pattern); no other fragment |
| re-pack logistics centre by what is on screen: **closed page** = `lgx_center_a` (shell, dock doors, nameplates) + `lgx_center_d` (apron, outdoor props, shadow_open) → 2048 × 1588; **inside page** = `lgx_center_b` (interior, conveyor, rack fronts) + `lgx_center_c` (back, floor, stub, shell_cut) → 2048 × 1652; `lgx_items` stays alone (vans need the parcels in town without the centre) | **−2** | today all four load together in Residency area `depot`; page padding costs ≈ +1.9 MiB, and the split lets the inside page load only while revealed (−12.9 MiB when closed, the v4.2 plan's intent). Source PNGs stay (`pack_pages.py` rule) |
| **net G1** | **+1 → ≈ 449** | G1b and G2 add 0 files; G3's cityfolk pages are v8's own budget |

Recommendation for the lead, beyond 금방 (the v5–v8 plan's own reclaim is mostly spent: v4.2 already did the audio
sprites and the portrait atlas): pack small one-sheet fragments into shared pages — `fx` 10 sheets, `emotes` 6 fx
sheets, `ui2` 8 fx/fog sheets, `water` 8 fx sheets — ≈ **−25 files**, via `textures.addSpriteSheetFromAtlas` (tile
textures such as `ground_*`, `road_*`, `water_waves_*` must stay separate files).

### 7.6 Bytes
Page ≈ 300–450 KB (webp), sfx sprite ≈ 25 KB, manifest ≈ 15 KB: ≈ 0.5 MB, inside the last publish batch rule (manifests
last).

---

## 8. Reuse map (what is not drawn again)

| Need | Reused key(s) | Where from | Notes |
|---|---|---|---|
| Hub building, reveal, racks, stock stacks | `logistics_center` + all layers, `rackSlots`, `itemFit`, `reveal` | assets/logistics | v4.2 `DepotBuilding` already draws them |
| Dock door 1 open/close | `logistics_center_dock1` `anims.dock_door` (6 f) | assets/logistics | v4.2 keeps it closed; G1 plays it per van |
| Conveyor with parcels | `logistics_center_conveyor` (8 f) | assets/logistics | already animates |
| Parcels (racks, pile, hands, van) | `cardboard_box_s/m/l` | `lgx_items` | `carryScale` 0.65; size class by units |
| Staff inside | `staffPoints` roles clerk / packer ×2 / picker ×3 / dockhand + bands | logistics manifest | v4.2 fills 3; 금방 fills all 7 |
| Forklift (decor loop) | `lgx_forklift` | assets/logistics | only if v4.2 ships it; else skip (no new file for 금방) |
| Van geometry | every point of `delivery_van_red` (seats, doorPoints, rearDoorPoint, cargoPoint, lightPoints, tailPoints, exhaustPoint, shadow, footprintPoly, wheels) | logistics manifest | the 금방 van copies them 1:1 (same rig) |
| Van docking | `dockVehiclePoints.delivery_van[0]` | logistics manifest | bay 1 |
| Drivers, couriers, pickers, packers, dockhand | townfolk parts + `tintModel`, anims idle/walk/talk/wave/happy | assets/townfolk | code presets `gb_driver`, `gb_courier`, `gb_picker`, `gb_packer`, `gb_dockhand` (`top_puffer`/`top_parka` gold, `hat_cap`/`hat_beanie` navy, `bot_pants` navy, `acc_mailbag` for couriers, `det_hivis` for the dockhand) via `TF.addPresets` |
| Carrying | walk + `ch.stack` item stack | v4.2 `DepotBuyer` pattern | townfolk `carry_walk` frames are dropped by `pack_pages` (cityfolk report), so never ask for it |
| Order bubble | `ui_emote_bubble` + item icon (items are icons) + `emote_exclaim` | emotes, item atlases | brand mark badge from the new page |
| Delivered moment | `emote_heart`, coin float text | emotes, effects | — |
| Panel | `Panel.js`, ui4/ui5 frames; icons `ui_icon_depot`, `ui_icon_route`, `ui_icon_staff`, `ui_icon_box`, `ui_icon_settle`, `ui_icon_stock`, `ui_icon_delivery` | ui5, fx_city, ui3 | only `ui_icon_gb` is new |
| Sounds | `sfx_truck_engine` (loop, near only), `sfx_brakes`, `sfx_door`, `sfx_car_honk_1`, `sfx_coin` | audio3, audio (shipped) | `sfx_box_drop`, `sfx_ticket_chime`, `amb_warehouse` if v4.2 CODE-2 ships audio6; otherwise their cues are cut into `gb_sfx_sprite` at build time (copy, not a change) |
| Office integration | 재고 tab row, 통장 income bars, letters | v4.2 OfficePanel / VillageNews | one letter template, one income source |
| 관망 | CameraDirector event candidates, agenda | v4.2 pilot | `gb:arrive` on screen = a cut candidate; activity "금방 구경" |
| G3 | `delivery_driver`, `warehouse_worker`, `forklift_driver` presets recoloured; `carry_box` + `boxPoint` | assets/cityfolk | needs v8's cityfolk merge + half tier |

---

## 9. New art (what must be made)

### 9.1 List (contract sections continue after v4.2's AG–AM)

| § | Key | Pipeline | Size / frames | Required? | Code stand-in until it lands |
|---|---|---|---|---|---|
| AN-1 | **`gb_van`** (character, family `delivery_van`) | Blender: the existing delivery-van builder imported read-only (`veh_models` / `lgx_render`), livery material override only, `bl_common` camera/light | frameSize 284 × 252, anchor (0.50352, 0.75); dirs SE, NE (SW/NW mirrored); `idle` 2 f, `move` 4 f, `over_*` overlays as `delivery_van_red`; ≈ 1990 × 640 packed | yes | `lgx_delivery_van_red` (+4.82 MiB, +1 file while it is used) |
| AN-2 | `gb_van` `rear_open` | same | 2 f per dir (half, open) + overlays | nice-to-have | parcel pops at the closed rear |
| AN-3 | **`gb_nameplate_ko`**, **`gb_nameplate_en`** (layers `of: logistics_center`, `replaces: nameplate_<lang>`) | Blender, the logistics nameplate path (raised navy letters lit like the shell; Jua "금방 물류센터" / Fredoka "Geumbang Logistics") with the brand mark at the left | trimmed ≈ 150 × 90 each, same anchor/frameSize as the centre | yes | runtime `nameBoard` text (manifest point, 137 × 43 px, shear 0.5; system font) |
| AN-4 | **`gb_sign`** (prop, baked soft shadow) | Blender, `prop_lib` conventions | pole sign ≈ 0.9 × 3.2 m, the mark only (no letters: language-neutral) ≈ 140 × 330 px | yes | none (simply absent) |
| AN-5 | `gb_banner` (patch on the shell, fades with `withShell`) | Blender | ≈ 200 × 120 | optional | none |
| AN-6 | `gb_locker` (금방 보관함, 1.2 × 0.6 m) | Blender | ≈ 150 × 200 | G1b/G2 only | — |
| AO-1 | **`ui_icon_gb`** (the brand mark, 96 px, ui4 style) | procedural (`gen_gb_ui.py`, ui house style) | 96 × 96 | yes | `ui_icon_depot` |
| AO-2 | `ui_icon_gb_order` (phone + parcel), `ui_icon_gb_van` | procedural | 96 × 96 each | optional | `ui_icon_box`, `ui_icon_delivery` |
| AP-1 | **`sfx_gb_jingle`** (2–3 rising marimba notes, "금-방!", ≤ 0.8 s), **`sfx_doorbell`** (딩동, ≤ 0.9 s) | procedural, audio1–7 loudness rules, one sprite `gb_sfx_sprite.mp3` (+ ogg if the build keeps both) | 2 cues | yes | `sfx_ticket_chime` / `sfx_coin` |

Everything goes into **one page** `gb_page_0` (≤ 2048 × 1024, RGBA, trimmed, `sourceSize` kept) ≈ 8.0 MiB: van ≈ 1990 ×
640, a 2048 × 380 strip for nameplates, sign, icons, optional rear-door frames. If AN-2 does not fit, it is dropped (not
a second page). The manifest carries a `brand` block (`gold`, `goldDark`, `cream`, `navy`) that the code presets read,
so dolls, UI chips and the van share one palette.

### 9.2 Art rules
1. **No letters, numbers or asymmetric marks on anything mirrored** (vans, dolls). The van's side emblem and the roof
   badge must be left–right symmetric; `gb_check.py` diffs each emblem region against its own mirror (≤ 6 % pixels).
   Letters live only on the nameplate layers (never mirrored) and in runtime UI text.
2. Same rig as `delivery_van`: every manifest point of `gb_van` must equal `delivery_van_red`'s (0 px tolerance) so
   VanDriver, VehicleSim (G2) and the dock points work unchanged; `gb_check.py` asserts it.
3. Reads at phone zoom 0.6 on snow, cobble, dirt and the night overlay: a body colour well apart from the town cars
   (`car_*` red/blue/yellow/mint/orange/cream) and from the three existing vans; the emblem ≥ 22 px at zoom 0.6.
4. House style: soft toy materials, snow on the roof, `bl_common` light; nameplate letters lit like the shell.
5. Tools only in new paths (`tools/blender/gb_*.py`, `tools/geumbang/*`), importing existing builders read-only;
   Blender under `/tmp/bvenv` with `nice -n 10`, one Blender at a time, scratch in `scratchpad/geumbang_art`.

### 9.3 Palette (proposal; the player/brand proposal may refine it)
| Token | Hex | Use |
|---|---|---|
| gold (금) | `#F2B33D` | van body, courier jacket, sign disc |
| goldDark | `#D9962A` | trim, shading reference |
| cream | `#F4EDE0` | van roof band, mark parcel, badge |
| navy | `#2B4F7E` | lettering (the same navy as the 솔방울 nameplate), belt line, caps, trousers |
Not police navy `#22305A` (cityfolk police), not the hi-vis yellow `#D8F040`.

### 9.4 Mark (concept for the designer to choose; the art job makes 3 thumbnails first)
A gold disc with a cream parcel whose tape crosses in a little 4-point sparkle (금 = gold, "반짝 금방"), symmetric,
two flat colours + outline. Slogan only in UI/speech: **"금방 왔지?"**.

### 9.5 Brand-safety checklist (`gb_check.py` palette part + review)
Must not resemble: Coupang (multicolour wordmark, rocket / 로켓배송 truck look), 배달의민족 (mint `#2AC1BC`), Kurly
(purple), CJ대한통운 (blue/orange/red mark), 우체국 (red/orange, swallow), 한진 (blue), 롯데 (red), DHL (yellow + red),
UPS (brown + gold shield), FedEx (purple + orange), Amazon (smile arrow), Yamato (black cat). Rules: no rocket, no
swallow, no cat, no arrow-smile; gold must never be paired with red or brown; primary pair ΔE (CIEDE2000) ≥ 15 from each
listed brand's primary pair. The van keeps a toy, round, retro body (the existing rig), which no real fleet uses.

### 9.6 Art production order (one Blender at a time)
1. Mark: 3 procedural thumbnails at 96 px and 24 px → designer picks (no Blender).
2. Van look-dev: SE and NE `move_0` on snow and cobble at zoom 0.6 / 1.0, next to the red van and a town car.
3. Full van render (12 frames + overlays; then optional `rear_open`).
4. Nameplates ko/en (+ mark), sign, optional banner.
5. Icons (procedural), sfx (procedural).
6. Pack `gb_page_0`, manifest (`characters.gb_van` with the copied points, layers, props, ui, audio markers, `brand`).
7. `gb_check.py` (frames, dirs, points = delivery_van, mirror-symmetry, palette distances, page ≤ 2048 × 1024, MiB line),
   Phaser test page (phone 390 × 844 and 360 × 640, zoom 0.6 / 1.0 / 1.6, day/night), previews + GIFs, report, critique.

---

## 10. Integration patches (all additive; applied by the G1 builder after v4.2 ships)

| # | File | Change |
|---|---|---|
| G-P1 | `src/scenes/Game.js` | construct `GeumbangHost` behind its gate after the v4.2 block; `update`, `serialize` (`geumbang` slice), `__FV.gb` hooks (`open`, `order(aid)`, `state`, `tour`) |
| G-P2 | `src/systems/depot/DepotSystem.js` | `pick(items) → got`, `restock(items) → refused`, `dockDoor(1, open)`; `logistics.slice()` unchanged |
| G-P3 | `src/entities/DepotBuilding.js` | `setNameplate(spec)` (a layer key, a text, or null for the default), outbound pile anchor, `staffSlots(roles)` for the extra staff |
| G-P4 | `src/entities/Warehouse.js` (G1b) | `takeSurplus(type, n, keepFrac)` over `counts` (respects `whKeep`) |
| G-P5 | `src/systems/TownSim.js` | read-only `homes()` → `[{ id, residents: [pid], favs }]`; `bodiesNear(x, y, r)` for yield |
| G-P6 | `src/core/Save.js` | `geumbang` keep-rule (local copy of the sanitizer); no version bump |
| G-P7 | `src/core/Residency.js`, `src/core/Assets.js` | area `gb`, class `gbVan`; late fragment `geumbang` |
| G-P8 | `src/data/world.js` | `WORLD.v43.gb = { bay: 1, spur: { out, in }, sign: [i, j], lgxDockTo: −29.6, walkFrom: 'warehouse' }` (Korean comments) |
| G-P9 | `src/systems/RoadPaint.js` | paint the `lgx_dock` extension and the spur jog (dirt / cobble by class) |
| G-P10 | `src/data/balance.js`, `balanceCheck.js`, `strings.js` | `BALANCE.v43.gb` (below), ranges, ≈ 60 ko + en keys |
| G-P11 | `src/scenes/OfficePanel.js`, `src/systems/VillageNews.js` | 재고 row "금방", income source, the offer letter template |
| G-P12 | `src/systems/pilot/CameraDirector.js`, `agenda.js` | `gb:arrive` cut candidate; "금방 구경" activity |
| G-P13 | `src/systems/Growth.js` | none (uses `addSatisfaction`) |
| G-P14 | `tools/build/pack_pages.py`, `build_artifact.mjs` | logistics re-pack (−2), the `geumbang` fragment, file gate unchanged (480) |
| G-P15 | `tools/test/v42_layout.mjs` | bay 1 apron y ≤ 3420, the sign, the spur cells |
| VP-G1 (G2) | `src/vehicles/model/fleet.js`, `host.js` | `tour(key, stops[{ x, y, dwell, tag }], { from: bay, back: bay })` → id; events `veh:tourStop`, `veh:tourDone`; ends in the bay (C1 rule) |
| VP-G2 (G2) | `src/vehicles/model/eras.js`, `tuning.js` | `role: 'gb'` exempt from the era table; tuning row `gbVan` |
| LP-G1 (G3) | `src/city/logistics/model/LgxModel.js` | `order('home:<aid>', items, { mode: 'centre', tag: 'gb', van: 'gb_van' })` accepts external home orders |

```js
// BALANCE.v43.gb (defaults; Korean comments in the real file)
gb: {
  open:    { coins: 4000, afterDepotS: 1800 },
  hours:   { open: 7, close: 21 },
  demand:  { targetPerVan: 1.5, gapS: [6, 14], linesMax: 3, perAddressOpen: 2, maxOpen: 24, favW: 2, promoW: 2.5,
             units: { item_bread: [2, 6], item_fish_cooked: [2, 5], item_meat_cooked: [2, 4], item_can: [3, 6],
                      item_fish_raw: [3, 6], item_meat_raw: [2, 4], item_fish_big: [1, 1], item_log: [5, 10],
                      item_wheat: [3, 6], item_plank: [4, 8], item_rod: [1, 1], item_sickle: [1, 1], item_axe: [1, 1] } },
  catalog: { item_bread: 1, item_fish_cooked: 1, item_meat_cooked: 1, item_can: 0.8, item_fish_raw: 1, item_meat_raw: 1,
             item_fish_big: 0.2, item_log: 1, item_wheat: 0.6, item_plank: 0.5, item_rod: 0.15, item_sickle: 0.1, item_axe: 0.1 },
  pick:    { lineS: 4, packS: 3 },
  van:     { cap: 8, maxStops: 6, waitFullS: 20, loadS: 6, doorS: 3, accel: 1.5, speed: { dirt: 3.5, cobble: 4.5, asphalt: 5.5 },
             yieldAheadM: 2.5, honkAfterS: 6, skipAfterS: 20, mainWeight: 1.3 },
  walk:    { maxM: 45, keep: 0.5, speed: 95 },                 // G1b 도보 배송
  pay:     { rate: 0.8, rawRate: 2.0, promiseS: 150, happyOnTime: 0.95, happyLate: 0.8 },
  upgrades:{ van2: 2500, van3: 4000, van4: 6000, picker2: 1500, picker3: 2500, pickup: 3000, walk: 2000, night: 3000 },
}
```

---

## 11. Tests and gates

**Node** (`tools/test/gb_*.mjs`, fixed step, seeded)
| Test | Checks |
|---|---|
| `gb_model.test.mjs` | determinism over 2 game hours (same seed → same events); **conservation** (§6); no order to a `none` address; `maxOpen`, `perAddressOpen`; never an unfillable order; every van back in its bay (watchdog 60 s); throughput ≥ 15 units/min per van with fake inflow; ≤ 0.02 ms/tick |
| `gb_routes.test.mjs` | every `drive` address has a curb ≤ 12 m and a route r6 → curb → r6; spur cells on painted streets, axis-aligned except the jog; headings ∈ {SE, NE, SW, NW}; **no tour crosses the rail**; bay 1 footprint inside the world and the apron |
| `gb_save.test.mjs` | 300 fuzzed slices (never throws, ≤ 1,280 B); round trip; mid-tour save → no loss, no duplicate; v4.2 saves without the slice load clean; slice → v8 `sanitizeLogistics` conversion (G3 contract) |
| `gb_parity.test.mjs` | order shape and states match `src/city/logistics/model/orders.js` |

**Browser** (Playwright under `nohup`, `nice -n 10`, one browser at a time; Chromium preinstalled)
| Test | Checks |
|---|---|
| `gb.mjs` | letter → pay pad → ribbon → first order bubble → pick/pack visible when revealed → dock 1 door opens → van drives (headings, yields to a placed walker, never overlaps) → courier at an apartment door → coins in the 물류 금고 → panel numbers; camera far: analytic timings within 2 % of near; 0 errors |
| `gb_drain.mjs` (census bot `--patch geumbang`) | §7.1 gates, 금방 on vs off, Lv1 and Lv3 |
| `reqlog_gb.mjs` | first 20 minutes: request log identical to v4.2 (nothing 금방 loads before the gate) |
| `texbudget.mjs`, `review_robust_drawcalls.mjs` | §7.3–7.4 gates in the depot and town views |
| `shots_gb.mjs` | hub day/night with the 금방 nameplate, van at bay 1, van on 중앙로 at zoom 0.6, courier at a door, order bubbles, panel — phone 390 × 844 and 360 × 640, ko + en |

Soak: 30 game minutes in 관망 with 금방 Lv3: 0 errors, 0 stuck vans, heap flat, textures ≤ v4.2 + 9 MiB.

---

## 12. Build split

| Job | Work | Ends with |
|---|---|---|
| **GB-CODE-1 P0** | model (§4.1–4.4, 4.7, 4.8), save slice, AddressBook + spur data, Node tests | `gb_model`, `gb_routes`, `gb_save` green |
| **GB-CODE-1 P1** | VanDriver + yield + analytic far, couriers, hub visuals (runtime nameplate text, `delivery_van_red` stand-in), bubbles, panel, letter, office row, 관망 hooks | `gb.mjs` green with stand-ins |
| **GB-ART** (parallel, own paths) | §9 AN/AO/AP + check + Phaser page + previews + report + critique/polish | page + manifest + sfx sprite |
| **GB-CODE-2** | swap stand-ins → `gb_page_0`; logistics re-pack (−2); census tuning; texbudget, drawcalls, soak, shots; designer summary in Korean | artifact ≤ 480 files, every v4.2 suite green |
| G1b | 창고 walk delivery (+ `gb_locker` only if the designer wants pickup) | walk zone tests |
| G2 / G3 | VP-G1/G2 at v5 integration; LP-G1 + cityfolk at v8 | — |

---

## 13. Risks

| Risk | Mitigation |
|---|---|
| Bay 1 sits low (van front y ≈ 3402, v4.2 layout gate 3360) | relax the gate to 3420 for bay 1 only; fallback: share bay 2 with a dock scheduler (−10 % throughput) |
| Townsfolk walk inside the `main` lane → vans stop often | route weight `main` × 1.3; G-P5 `bodiesNear`; measure blocked time ≤ 5 %; if over, TownSim side-step patch (`c.lane` offset when a van is behind) |
| The sleigh, not the vans, limits draining the village piles | "썰매 한 대 더" + the 금방 집하 upgrade; census decides |
| Income inflation (v4.2 is already +37 %) | `pay.rate` lever; happiness instead of coins for on-time; designer decision |
| Village houses get nothing in G1 ("왜 우리 마을은 안 와?") | G1b walk delivery from the 창고; G2 서리 큰길 brings vans to the plaza gate |
| Era clash at v5 (motor vans while v5 says 읍 = horse era) | VP-G2 exemption, or the designer prefers a 금방 썰매 until 도시 (open question) |
| Mirrored van frames show reversed letters | rule §9.2-1 + automatic mirror check |
| Real-brand look-alike | §9.5 checklist + palette ΔE check + designer sign-off on the mark |
| Files over 480 | net +1 only after the −2 re-pack; the −25 small-sheet pack is the lead's lever for v5–v8 |
| 금방 depends on the depot (v4.2 cut line §16.4) | if the depot slips, 금방 slips with it; nothing else in v4.2 depends on 금방 |

---

## 14. Open questions for the designer (Korean, short)

1. 물류창고 이름: "금방 물류센터"로 바꿀까요, 아니면 "서리 물류창고" 그대로 두고 금방 간판만 따로 세울까요?
2. 배달차는 읍 단계부터 바로 자동차로 할까요? (v5 계획은 읍 = 말·썰매 시대, 도시 = 자동차 시대예요. 금방만 예외로 둘 수 있어요.)
3. 마을(눈길) 집은 처음엔 배달이 안 돼요. 창고에서 걸어서 가는 도보 기사(2단계)를 원하세요, 아니면 마을 입구에 금방 보관함을 둘까요?
4. 금방 판매로 버는 코인을 줄이고(재고만 빨리 빠지게) 행복도를 올리는 쪽이 좋을까요?
5. 로고: 금색 동그라미 안에 반짝이는 상자 — 이 방향이 괜찮으면 시안 3개를 먼저 보여 드릴게요.
