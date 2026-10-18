# Logistics flow map — 서리마을 economy, v4.2 final source

Economy analyst's report for the designer's logistics direction (원자재 수요 · 짐꾼 · 물류창고 · 일꾼/짐꾼 관리창 ·
산업별 현황창). It maps every raw and good from the code and from measurements: who makes it and how fast, who carries
it and how far, where it is used or sold, where it waits and why. It separates the two causes the designer names
(**not enough demand** and **not enough carrying**). It also covers how workers are bound to jobs in the code (what
"이직" would have to change), what a sector status view can read today, and which existing art and prepared code new
consumers can reuse.

- Source measured: the verified v4.2 source (`3236722`, `src/` identical to HEAD), copied to a scratch snapshot so
  that the v4.2 touch being built in the tree could not change the numbers. The v4.2 touch (큰 식당 back tables, porter 2
  on more lines, a warehouse crew that grows with production) is **not** in these numbers.
- Nothing in `src/` or `tools/` was changed. Scratch (probe, analysers, raw outputs):
  `/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/econ/`.

## 0. 디자이너용 요약 (쉬운 말)

- **늦은 마을에서 일꾼 14명이 1분에 원자재 300개를 모아요. 가공소는 그중 253개만 써요.** 가공소 다섯 곳은
  2단 업그레이드 뒤 최대 1분에 439개를 할 수 있는데, 지금은 그 58 %만 일해요. 남는 47개 중 39개는 역 짐꾼과
  재료 짐꾼이 멀리 있는 짐 싣는 곳(2,000~2,900 px)까지 걸어서 날라요. 날것은 1개에 1~3코인이라 거의 돈이 안 돼요.
- **"수요가 없다"는 말은 반만 맞아요.**
  - 구운 생선과 빵은 정말 **살 사람이 모자라요**. 화덕은 54 %, 오븐은 45 %의 시간 동안 출구가 꽉 차서 멈춰요.
    판매대 선반도 늘 거의 가득이고, 창고에는 구운 생선이 쌓여요.
  - 광석과 훈제 고기는 **나르는 손이 모자라요**. 훈제 고기는 손님이 제일 좋아하는 음식이라 더 팔 수 있는데,
    훈제장이 23 % 멈춰 있어요. 25~35분 무렵에는 판매대에 훈제 고기가 없는 시간이 32~42 %인데, 같은 때
    훈제장은 출구가 꽉 차서 24~42 % 멈춰 있어요. 광석 짐꾼은 시간의 21 %를 광석을 짐 싣는 곳까지 나르는 데 써서,
    그동안 제련소가 15 % 굶어요. 주괴는 교역소가 얼마든지 사 가요.
  - 통나무와 밀은 오히려 **모자라요**. 나무꾼과 농부는 시간의 80 % 넘게 걸어 다녀요. 판자는 남지 않고 다 팔려요.
  - 통조림 공장은 바로 옆 생선 통이 72 % 차 있는데도 39 % 굶어요. 생선 통에서 통조림 공장으로 생선을 나르는 사람이
    없어서예요.
- **노는 사람은 짐꾼이 아니라 채집 일꾼과 가공소 기술자예요.** 어부(39 %), 광부(35 %), 사냥꾼(46 %)이 꽉 찬 더미
  앞에서 기다려요. 사냥꾼은 사냥감 5마리를 3명이 나눠 잡아서 기다리는 시간이 더 길어요. 상품 짐꾼·창고 짐꾼·역
  짐꾼은 97~99 % 일하고 있어요(재료 짐꾼은 84 %). 다만 쓸모가 적은 일(날것을 멀리 나르기)을 하는 시간이 많아요.
- **이직은 이렇게 하면 좋아요.** 채집 일꾼은 직업을 바꿔요(옷과 도구가 바뀌어요. 직업마다 모습이 3개씩 있어요).
  사냥꾼 1명과 어부 1명을 나무꾼이나 농부로 옮기면 1분에 통나무나 밀이 30개쯤 늘어요. 짐꾼은 모습이 같아서
  담당 줄만 바꾸면 돼요. 기술자는 가공소마다 한 명씩이라 옮기지 않아요. 고용비는 돌려주지 않고, 옮기기는
  공짜이되 한 번 옮기면 1분은 그대로 두어요. 저장은 "기본과 다른 자리"만 적어서 예전 저장도 그대로 열려요.
- **창 하나(마을 경영)로 묶는 걸 추천해요.** 빨간 산업 카드의 원인은 언제나 그 줄의 사람들이라서, 카드를 누르면
  바로 그 줄의 일꾼·짐꾼이 보여야 해요. v4.6에서 만들 **마을 판(등급 · 행복 · 자원 · 통계)**에 산업 카드와
  **일꾼·짐꾼** 탭을 넣고, 사무실 재고 탭과 같은 그림을 써요. 화면 왼쪽 위 칸은 360×640에서 이미 꽉 차서
  (v4.4 계획 D13) **새 HUD 버튼은 만들지 않고**, 지금 있는 인구·등급 칩과 사무실, 지도 핀에서 열어요.
- **새 그림은 필요 없어요.** 가전 공장·가구 공방(이미 그려져 있음), 난로·냉장고 같은 물건, 지게차, 창고, 일꾼
  모습이 모두 있어요. 가전 공장 그림을 쓰면 그 근처에 있을 때만 5.4 MiB를 불러오면 돼요.
- **효과가 큰 순서:** ① 재료 짐꾼이 날것을 멀리 나르지 않게 하기 ② 훈제 고기 짐꾼 늘리기 ③ 생선 통 → 통조림 공장
  연결 ④ 큰 식당 고치기(지금 하는 손질) ⑤ 노는 일꾼 이직 ⑥ 더미 옆 자재창고 ⑦ 가전 공장·가구 공방. 모두
  마을 완성(약 20분) 뒤에만 켜지게 해서 처음 20분은 그대로예요.

### Key numbers (English)

| Measure (late village, automation only, per game minute) | Value |
|---|---|
| Raw caught · processed · station capacity (with 2단) | 300 · 253 · 439 |
| Raw surplus at the piles · of it walked to the dock | 47 · 39 |
| Piles ≥ 90 %: fish · log · wheat · ore · meat | 72 · 0 · 11 · 63 · 70 % |
| Stations blocked (output full): grill · bakery · smokehouse | 54 · 45 · 23 % |
| Stations starved: sawmill · smelter · cannery | 45 · 15 · 39 % |
| Gatherers idle: fishermen · miners · hunters · farmers · lumberjacks | 39 · 35 · 46 · 2 · 0 % |
| Gatherers walking: lumberjacks · farmers | 82 · 81 % |
| Porters idle: raw (station full / pile empty) · p1 · p2 · 창고 · station | 11 / 5 · 3 · 1 · 1 · 2 % |
| Raw porters' time on dock / 창고 spill runs: fish · ore · meat | 20 · 21 · 7 % |
| Per-porter throughput: 150–300 px · 1,300–1,800 px · 2,100–2,600 px routes | ≈ 50–60 · 25 · 14 a minute |
| Station porter haul (walked, one way) · items a haul | 2,569 px · 8.4 |
| 물류창고 racks (avg / cap) · sold a minute · buyer capacity while open | 14 / 500 · 21 · ≈ 116 |
| Coins created: 판매대 · 교역소 · 잡화점 · wholesale · 큰 식당 · train · 물류창고 | 848 · 587 · 356 · 202 · 94 · 17 · 63 (≈ 2,170) |

---

## 1. Data and method

| Data set | What it is | Used for |
|---|---|---|
| **New flow probe** `econ/probe.mjs` (this report) | Loads a save, runs the game on the fixed 60 fps clock and records **every item move**: `gs.moveItem` (stack → stack), every logistics sink's `feed`, the 창고 in / out, the dock → train / sleigh, sleigh → 물류창고, the 물류창고 buyers, wholesale payments, every `pop` that consumes an item (processed, sold, eaten) and every `push` that makes one (caught, produced). Every second it classifies the state of every gatherer, operator (station), raw porter, goods porter, porter 2, 창고 porter and station porter, and records each porter trip (load, route length, destination). | Every per-minute number in §4–§7 |
| Probe run **L** (late) | `v41_save_smart_46min.json` + the late configuration that the census bot reaches after 13 min (읍, 가공소 2단 on all 5 lines, 짐꾼 2 on all 5 lines, 물류창고 built, 4 station porters); 2 min warm-up, then **10 game minutes = one full game day**. The chief is parked away from every pad and worker (438 px from the nearest), so the numbers are **the automation alone** | the late-village map |
| Probe runs **S25**, **S35** | the 25-min and 35-min saves as they are (no setup), 1 min warm-up, 6 game minutes, chief parked | the stage table §5 |
| CODE-2 census `g60` / `d60` / `b60` | the census bot playing the 46-min save for 60 game minutes (`v42code2_fix/census`, `v42code2_census`) | pile / station / shelf shares with the chief playing; minute 13–60 = the same late configuration as run L |
| CODE-2 flow probes `flow_drain` / `flow_dep` | gatherer feed and pile take with the piles drained; route throughput with the depot | gatherer capacity, the "110 more raw a minute" figure |
| Verify bots `smart2` | a fresh game played to 80 min (`v42code2_verify/bots`) | the hire timeline and station / gatherer states per stage |
| Code | `src/data/balance.js`, `systems/Logistics.js`, `entities/Worker.js`, `Station.js`, `Workshop.js`, `Warehouse.js`, `Seller.js`, `Shop.js`, `BigRestaurant.js`, `FoodBox.js`, `systems/Labour.js`, `Surplus.js`, `Freight.js`, `LineUpgrades.js`, `Growth.js`, `Progression.js`, `StockLedger.js`, `depot/*`, `scenes/OfficePanel.js` | capacities §3, binding §8 |

Caveats:
- One game day per run (the depot buyers work 07–20 h, the train runs all day). Run L ran from 22:48 to 22:48 the next day.
- The chief is parked in the probe runs, so the probe shows what the workers and porters do without him. The census
  rows show the same village with the bot chief carrying and selling (§4.5 compares the two).
- The big restaurant serves only ≈ 4 guests a minute without the chief in the base source (the server gets stuck
  between the tables: `v42touch/NOTES.md`); the v4.2 touch fixes this, so food demand at the restaurant will be
  higher after the touch than measured here.

---

## 2. The route map

### 2.1 Items, makers, carriers, places

```
 gatherers (14)          raw porter (1/line, 8)        station (operator)         goods porters (p1 + p2, 14)       places
 ───────────────         ──────────────────────        ──────────────────         ───────────────────────────       ──────
 어부 ×3 ─▶ 생선 통 ─────▶ 생선 짐꾼 ─────────────▶ 화덕 ──▶ 구운 생선 ─┐
 (boat) ───▶ 배 창고 ─▶ 생선 짐꾼(dock) ─▶ 통조림 공장 / 화덕            │
 나무꾼 ×3 ─▶ 통나무 더미 ─▶ 통나무 짐꾼 ──────────▶ 제재소 ─▶ 판자 ─────┤      ┌▶ 판매대 (food: 46 guests/min)
 농부 ×3 ─▶ 밀 더미 ────▶ 밀 짐꾼 ──────────────▶ 오븐 ──▶ 빵 ────────┼──────┼▶ 교역소 (planks, ingots: no limit)
 광부 ×2 ─▶ 광석 더미 ──▶ 광석 짐꾼 ─────────────▶ 제련소 ─▶ 주괴 ──────┤      ├▶ 잡화점 (cans, tools)
 사냥꾼 ×3 ─▶ 고기 걸이 ─▶ 고기 짐꾼 ─────────────▶ 훈제장 ─▶ 훈제 고기 ─┘      ├▶ 큰 식당 pantry
                                                판자 + 주괴 ─▶ 대장간 ─▶ 도구     ├▶ 광부 식량 상자
                                         생선 ×3 + 주괴 ─▶ 통조림 공장 ─▶ 통조림 ├▶ 대장간 / 통조림 공장 inputs
                                                                              ├▶ 공사장 (sites, hire pads)
 창고 porters ×2 (10): outputs ≥ 60 % → 창고 (300) → nearly empty shelves;     └▶ 창고 (buffer, STORE 10)
                      full piles → 짐 싣는 곳 (raw runs)
 station porters ×2–4 (12): 창고 / outputs ≥ 60 % / full piles ─▶ remote only: founding cards · 정기 납품 cards ·
                      the 5 founded shops · carpenter's house lots · 짐 싣는 곳 surplus
 짐 싣는 곳 (dock) ─▶ train freight cars (56 a train; order crates first, ≥ ¼ surplus) ─▶ export (price × 0.5)
                 └─▶ cargo sleigh (60 a trip) ─▶ 서리 물류창고 racks ─▶ walk-in buyers 07–20 h
```

| Item | Made by | Carried by | Used / sold at (Logistics priority) | Leaves the village by |
|---|---|---|---|---|
| 생선 (raw) | 어부 ×3 at sea (rod), boat catch | 생선 짐꾼 (pile → 화덕), 생선 짐꾼 dock (배 창고 → 통조림 공장 / 화덕), 창고 porters (raw run), station porters | 화덕 input (GRILL 60), 통조림 공장 input (INPUT 70 / calm 42) | dock surplus → train / 물류창고 (1 coin) |
| 통나무 | 나무꾼 ×3 | 통나무 짐꾼 | 제재소 input | dock (rarely: pile never full late) |
| 밀 | 농부 ×3 | 밀 짐꾼 | 오븐 input | dock (rarely) |
| 광석 | 광부 ×2 | 광석 짐꾼, 창고 porters (raw run), station porters (pile surplus at prio 33) | 제련소 input | dock (2 coins) |
| 생고기 | 사냥꾼 ×3 | 고기 짐꾼, 창고 / station porters | 훈제장 input | dock (3 coins) |
| 구운 생선 | 화덕 | 생선구이 짐꾼 p1 + p2, 창고 porters | 판매대 (SHELF 40 / LOW 45 / EMPTY 48), 큰 식당 pantry (PANTRY_LOW 46 / 40), 정기 납품 card (remote, 30), 레스토랑 shop (remote, 35) | train (order crates, surplus) |
| 판자 | 제재소 | 판자 짐꾼 p1 + p2 | 공사장 · 집터 (SITE 100), 대장간 input, 교역소, carpenter's houses (remote, SITE), cards | train, 물류창고 |
| 빵 | 오븐 | 빵 짐꾼 p1 + p2, 창고 porters | 판매대, pantry, 식량 상자 (FOOD 50 / FOOD_LOW 95), 카페 / 슈퍼 shops, cards | train, 물류창고 |
| 주괴 | 제련소 | 주괴 짐꾼 p1 + p2 | 공사장, 대장간 / 통조림 공장 inputs, 교역소, 철물점 card | train, 물류창고 |
| 훈제 고기 | 훈제장 | 훈제 고기 짐꾼 p1 + p2, 창고 porters | 판매대, pantry, 식량 상자 (SHELF_LOW after village complete), 레스토랑 shop, cards | train, 물류창고 |
| 도구 (5 kinds) | 대장간 (only what a hire pad or the 잡화점 lacks) | 도구 짐꾼, station porters | hire pads (SITE 100), 잡화점, 철물점 shop | train, 물류창고 |
| 통조림 | 통조림 공장 (3 per batch) | 통조림 짐꾼, station porters | 잡화점, 슈퍼 shop, cards | train, 물류창고 |

### 2.2 How a porter chooses (code)

- **Sources are fixed, destinations are free.** A raw porter takes only from its own pile and gives only to its own
  station's input (after village complete it may spill a full load to the 창고 (raw fish only) or to the dock). A goods
  porter takes only from its own station's output; where it goes is chosen by `Logistics.best(type, x, y)`: the
  highest priority sink that still has room, and after village complete `score = prio − distance / 300 px` for everyday
  sinks (urgent ones keep their full rank).
- The priority ladder (`Logistics.PRIO`): SITE 100 · FOOD_LOW 95 · INPUT 70 · GRILL 60 · FOOD 50 · SHELF_EMPTY 48 ·
  PANTRY_LOW 46 · SHELF_LOW 45 · SHELF 40 · FOUNDING 38 · SHOP 35 · (raw pile surplus 33) · WHOLESALE 30 · SURPLUS 12 ·
  STORE 10.
- Village porters never walk to the station district (`remote` sinks); only the station porters do, and they only
  take surplus (outputs ≥ 60 %, the 창고, piles the Surplus rules release) — except founding-card goods.
- A goods porter whose output is ≥ 70 % full and that nobody in the village wants takes it to the dock itself (`PRIO.SURPLUS`).

---

## 3. Capacities from the code

### 3.1 Stations (`BALANCE.stations`, `stations3`, `v42.station2`)

| Station | Input → output | s per item | Max per min | With 가공소 2단 (× 0.66) | In / out pad max |
|---|---|---|---|---|---|
| 화덕 grill | 생선 → 구운 생선 | 0.8 | 75 | **113.6** | 30 / 36 |
| 제재소 sawmill | 통나무 → 판자 | 1.0 | 60 | **90.9** | 30 / 36 |
| 오븐 bakery | 밀 → 빵 | 1.1 | 54.5 | **82.6** | 30 / 36 |
| 제련소 smelter | 광석 → 주괴 | 1.2 | 50 | **75.8** | 30 / 36 |
| 훈제장 smokehouse | 생고기 → 훈제 고기 | 1.2 | 50 | **75.8** | 30 / 36 |
| 대장간 toolsmith | 판자 1 + 주괴 1 → 도구 1 (only when a hire pad or the 잡화점 lacks one) | 3.0 | 20 tools | — | 8 per input / 12 |
| 통조림 공장 cannery | 생선 3 (참치 1 = 3) + 주괴 1 → 통조림 3 | 2.6 | 69 cans (69 fish + 23 ingots) | — | 18 per input / 30 |

A station works only while operated (its operator, or the chief on the spot), while its input has an item and its
output has room. The 촌장 응원 makes it ×1.1 while he stands near (not in the probe: he is parked).

### 3.2 Carriers

| Carrier | Late count | Bag | Speed | Takes from | Brings to | Hired by (cost) |
|---|---|---|---|---|---|---|
| 촌장 | 1 | 6 → 26 (upgrades) | 255 px/s × 1.0–1.6 | anything | anything | — |
| Gatherer (어부 · 나무꾼 · 농부 · 광부 · 사냥꾼) | 14 (3 · 3 · 3 · 2 · 3) | 5 | 150 px/s | resource nodes of its profession | its line's pile only | `hire_*` 45–1,150 · `hire2_*` 500–1,200 + tool · `hire3_*` 450–700 + tool |
| Raw porter (재료 짐꾼) | 5 (1 per line) | **8** | 150 | its pile | its station's input (spill: 창고 raw fish / dock) | `raw_*` 70–650 |
| Goods porter p1 (상품 짐꾼) | 8 (5 lines + 도구 + 생선 dock + 통조림) | **14** | 150 | its station's output | any village sink (§2.2); the dock when nobody wants it | `porter_*` 100–800 |
| Goods porter p2 (짐꾼 2, F4) | 5 | 14 | 150 | same | same | offer when the output was ≥ 80 % for 90 s: 500–900 |
| 창고 porter | 2 (fixed) | **10** | 150 | 창고, outputs ≥ 60 %, full piles (raw fish into the 창고; any raw to the dock) | urgent sinks (≥ 45; direct ≥ 40), the 창고, the dock | comes with the 창고 |
| Station porter (역 짐꾼) | 2 → 4 | **12** | 150 | 창고 types, outputs ≥ 60 %, piles the Surplus rules release | remote sinks only | 600 · 1,100 · (물류창고) 1,000 · 1,500 |
| Boat | 1 | rowboat 6 / 어선 4 + 4 참치 | — | the sea | 배 창고 catch pad | 700 / 1,200 + 낚싯대 |
| Cargo sleigh | 1 (2nd: 2,500) | 60 | 2.5 m/s | dock surplus | 물류창고 racks | with the 물류창고 |
| Train freight cars | 1 train | 56 (88 after 화물칸 크게, 2,000) | — | order crates, then surplus (≥ ¼) | the town (export) | — |
| (v4.3) 금방 dog sled | 1–2 | crates | — | piles ≥ 85 % (keeps 40 %) | dock | 금방 |

### 3.3 Distances (straight line, px; porters walk the roads, which are longer)

| From → to | px | | From → to | px |
|---|---|---|---|---|
| 생선 통 → 화덕 | 245 | | 화덕 → 판매대 | 279 |
| 통나무 더미 → 제재소 | 317 | | 오븐 → 판매대 | 464 |
| 밀 더미 → 오븐 | 204 | | 훈제장 → 판매대 | **1,116** |
| 광석 더미 → 제련소 | 210 | | 제재소 → 교역소 | 510 |
| 고기 걸이 → 훈제장 | 179 | | 제련소 → 교역소 | **1,170** |
| 광석 더미 → 짐 싣는 곳 | **2,885** | | 판매대 → 짐 싣는 곳 | 2,183 |
| 생선 통 → 짐 싣는 곳 | **2,686** | | 훈제장 → 짐 싣는 곳 | 1,914 |
| 고기 걸이 → 짐 싣는 곳 | **1,853** | | 짐 싣는 곳 → 물류창고 | ≈ 1,600 |

The piles sit 180–320 px from their stations: the raw porters' trips are short. Everything that leaves the village
crosses 1,850–2,900 px to the station dock: that walk is where carrying is expensive.

### 3.4 Demand the code allows (maximum, per game minute)

| Place | Rule (code) | Most it takes per minute |
|---|---|---|
| 판매대 (market) | a guest every 1.3 s after village complete (×0.8–1.2), queue ≤ 10; each wants one food (1–5, avg 3); the newest food (훈제 고기) is chosen ≈ 50 %, the others ≈ 25 % each | ≈ 46 guests → ≈ 138 foods (≈ 69 훈제 고기 · 35 생선 · 35 빵) |
| 교역소 (trade post) | the merchant buys one item every 0.35 s (clerk); keeps 2 of each on display | ≈ 170 planks + ingots — **no practical limit** |
| 잡화점 (general store) | a guest every 3.2 s, wants 1–3 | ≈ 19 guests → ≈ 37 cans + tools |
| 큰 식당 (big restaurant) | a guest every 5 s; a dish (1 food) or a 정식 (3 foods, 40 % when all three are in) | ≈ 12 guests → ≈ 22 foods (measured ≈ 4 guests without the chief, §1) |
| 광부 식량 상자 | a miner eats one bread / 훈제 고기 per 5 ore | ore rate ÷ 5 (≈ 13–18 foods at late rates) |
| Founded shops (5) | the town buys one item per 40 s per shop + train visitors (12 a train, 2–4 items) | ≈ 6 + visitors (small) |
| 정기 납품 cards | 3 cards at a time, 25–50 items each, wholesale 0.7 × price + bonus | limited by the station porters (§4) |
| Sites, hire pads, house lots | per build: e.g. house 20 planks, depot 40 planks + 20 ingots | one-off |
| 서리 물류창고 buyers | 07–20 h: materials 20, food 30, goods 20, tools 6, raw 40 a minute (goods first) | ≈ 116 / min while open = ≈ 63 / min over a day |
| Train | 56 crates a train (order crates first; surplus keeps ¼) | ≈ 15 surplus items a minute measured (census) |

Demand is effectively unlimited for 판자 and 주괴 (교역소) and large for the three foods at the 판매대. The raw items
have **no** buyer inside the village except their own station; their only other exits are the dock and the 물류창고's
raw buyers at 1–3 coins.

---

## 4. Measured flows — the late village (run L, automation only, per game minute)

### 4.1 Raw → station, per line

| Line | Gatherers | Caught | Into the pile | Pile avg · time ≥ 90 % | Out of the pile: raw porter / 창고 porter / station porter | Into the station | Processed | Station busy / starved / blocked | Station cap (2단) |
|---|---|---|---|---|---|---|---|---|---|
| 생선 → 화덕 | 3 | 59.3 | 60.1 | 37 · **72 %** | 53.7 / 0 / 7.6 | 47.3 | **46.5** | 41 / 6 / **54 %** | 113.6 |
| 통나무 → 제재소 | 3 | 50.5 | 50.4 | 1 · 0 % | 49.8 / 0 / 0 | 50.2 | 50.2 | 56 / **45 %** / 0 | 90.9 |
| 밀 → 오븐 | 3 | 52.1 | 51.0 | 20 · 11 % | 49.5 / 0 / 1.2 | 45.5 | 45.5 | 55 / 0 / **45 %** | 82.6 |
| 광석 → 제련소 | 2 | 63.3 | 63.1 | 35 · **63 %** | 54.8 / 0.6 / 6.2 | 50.8 | 53.6 | 71 / **15 %** / 14 | 75.8 |
| 생고기 → 훈제장 | 3 | 74.4 | 73.9 | 37 · **70 %** | 63.9 / 1.0 / 9.4 | 57.4 | 57.5 | 77 / 0 / **23 %** | 75.8 |
| **Total** | 14 | **299.6** | 298.5 | | | 251.2 | **253.3** | | 438.7 |

- Every station runs far below its 2단 capacity (253 of 439 a minute, 58 %). The raw piles still fill: 47 raw a minute
  more come in than the stations take (fish 12.8, ore 12.3, meat 16.5, wheat 5.5). About 39 a minute of it walks to the
  dock (station porters 24.4, the raw porters' own spill runs 13.8, 창고 porters 1.6).
- The raw porters' "spill" (CODE-1 rule: a full pile's load goes to the dock or, for fish, the 창고 when the station is
  full) makes them leave their line: the 광석 짐꾼 spends **21 %** of its time carrying ore 2,885 px to the dock, and
  the smelter is **starved 15 %** of the time while the ore pile is 63 % full. The 생선 짐꾼 spends 20 % carrying fish
  to the 창고.

### 4.2 Where the goods go

| Product | Made | Carried out by p1 / p2 / 창고 / station porters | Delivered to (per minute) | Sold / used (per minute) |
|---|---|---|---|---|
| 구운 생선 | 46.6 | 18.6 / 22.9 / 4.0 / – | 판매대 28.6 · **창고 13.5** · cards 4.6 · pantry 4.5 · 레스토랑 shop 1.2 | 판매대 29.3 · pantry 4.5 |
| 판자 | 50.3 | 26.6 / 24.0 / – / – | 교역소 45.8 · 대장간 7.1 · house lot 1.1 | 교역소 45.8 · 도구 7.7 |
| 빵 | 45.5 | 19.5 / 17.0 / 3.0 / 6.0 | 판매대 28.7 · 식량 상자 7.3 · cards 4.8 · pantry 3.9 · 카페 / 슈퍼 2.9 | 판매대 28.8 · 광부 6.9 · pantry 4.3 |
| 주괴 | 53.5 | 25.9 / 24.2 / 1.0 / 2.5 | 교역소 36.3 · 통조림 공장 7.7 · 대장간 7.1 | 교역소 35.8 · workshops 15.2 |
| 훈제 고기 | 57.5 | 25.7 / 24.8 / 3.0 / 3.7 | **판매대 44.4** · 식량 상자 5.7 · pantry 3.6 · cards 1.3 · shop 1.2 | 판매대 44.1 · 광부 5.9 · pantry 4.7 |
| 통조림 | 22.5 | 14.0 / – / 1.0 / 6.9 | 잡화점 15.0 · cards 2.5 · dock 2.0 · 슈퍼 1.2 | 잡화점 14.7 |
| 도구 | 7.7 | 3.2 / – / 1.2 / 3.0 | 잡화점 4.5 · 철물점 1.9 · dock 1.2 | 잡화점 4.5 |

### 4.3 Exits: sold, exported, stored

| Exit | Items / min | Coins / min | Notes |
|---|---|---|---|
| 판매대 (3 foods) | 102.2 (fish 29.3 · bread 28.8 · meat 44.1) | 848 | 훈제 고기 shelf empty 8 % of the time; fish and bread shelves ~34 / 40 (full) |
| 교역소 (planks, ingots) | 81.6 | 587 | takes all it gets |
| 잡화점 (cans, tools) | 19.2 | 356 | |
| Wholesale (order cards, founded shops) | ≈ 28 | 202 | carried only by the 4 station porters |
| 큰 식당 | 4 guests | 94 | the serving bug (§1); pantry stays ~ full (fish 28 · bread 28 · meat 18 of 30) |
| Train export | 14.0 (all raw: ore 5.9 · meat 5.1 · wheat 1.6 · fish 1.3) | 17 | raw at 0.5–1.5 coins |
| 물류창고 (sleigh 23.2 a minute in) | 20.8 sold (raw 19.2) | 63 | racks hold 14 of 500 on average: **the 물류창고 waits for goods**; its buyers could take ≈ 116 a minute while open |
| **All** | | **≈ 2,170** | automation only; the census bot (chief collecting, selling, carrying to the dock) reads 2,470 |

Raw leaving by train or 물류창고 ≈ 33 a minute earns ≈ 60–70 coins a minute (3 % of income) and costs ≈ 3 porters'
full time (39 raw a minute walked to the dock at ≈ 14 a minute per porter, §7.5).

### 4.4 Buffers

| Buffer | Average | Capacity | Reading |
|---|---|---|---|
| Raw piles | fish 37 · log 1 · wheat 20 · ore 35 · meat 37 | 40 each | full (fish, ore, meat) or empty (log) — never a buffer |
| Station outputs | grill 32 · saw 3 · bakery 32 · smelter 22 · smokehouse 29 | 36 | the grill and bakery outputs are full half the time |
| 창고 | 47 (cooked fish 33, bread 11, raw fish 2) | 300 | refuses 통나무 · 밀 · 광석 · 생고기 by rule (`STORABLE`): it **cannot buffer the raw surplus** |
| 짐 싣는 곳 (dock) | 70 | train 56 + 물류창고 room | |
| 물류창고 racks | 14 | 500 (raw ≤ 50 % of a category) | nearly empty |
| 식량 상자 | 18.5 | 20 | full |

### 4.5 The same village with the chief playing (census bot, minutes 13–60 of `g60`)

| | Run L (chief parked) | `g60` (bot chief) |
|---|---|---|
| Pile ≥ 90 %: fish · ore · meat | 72 · 63 · 70 % | 49 · 49 · 69 % |
| Station blocked: grill · bakery · smokehouse | 54 · 45 · 23 % | 29 · 5 · 21 % |
| Station starved: sawmill · smelter | 45 · 15 % | 45 · 12 % |
| 훈제 고기 shelf empty | 8 % | 10 % |
| Coins / min | ≈ 2,170 (created) | 2,576 (collected) |

The bot chief spends 27 % of his late game carrying order goods to the dock: that drains the grill and bakery outputs.
The automation alone leaves them blocked.

---

## 5. Stages of the game

| | Fresh game 0–20 min (verify bot `smart2`) | S25 (25-min save) | S35 (35-min save) | L (46-min save + late configuration) |
|---|---|---|---|---|
| Gatherers (fish · log · wheat · ore · meat) | 1 each, one line every 4–5 min | 1 · 2 · 1 · 2 · 1 | 2 · 3 · 2 · 2 · 1 | 3 · 3 · 3 · 2 · 3 |
| Porters | raw + goods per line, hired by the chief | 6 goods (p1), 1 station | + 창고 2, dock porter, 2 station | + p2 × 5, cannery, 4 station |
| Raw caught / min | (not probed) | 202 | 237 | 300 |
| Processed / min | | 181 | 219 | 253 |
| Pile ≥ 90 %: fish · log · wheat · ore · meat | 0 · 0 · 0 · 50 · 0 % (10–20 min) | 0 · 0 · 1 · **89** · **83** | **77** · 0 · 42 · **85** · **67** | **72** · 0 · 11 · **63** · **70** |
| Stations blocked (output full): grill · bakery · smelter · smokehouse | ≈ 0 | 0 · 18 · **31** · **42** | 30 · 24 · 26 · 24 | **54** · **45** · 14 · 23 |
| Stations starved (no input): grill · sawmill | 47 · 54 % (0–10 min) | 50 · 44 | 4 · 11 | 6 · 45 |
| 판매대 empty: fish · bread · meat | 28 · 55 · 100 % (no meat yet; census `fresh25`) | 28 · 16 · **42** % | 1 · 2 · **32** % | 0 · 0 · 8 % |
| Coins / min | 272 → 815 (bot, collected) | ≈ 1,265 | ≈ 1,479 | ≈ 2,170 |

What changes from stage to stage:
1. **0–20 min** (village building): the lines are supply-limited (one gatherer, the chief carries); only the ore pile
   fills, before the ore porter is hired (16.6 min in the bot). This is the pacing the designer wants kept: nothing
   below acts before village complete.
2. **25–35 min**: the far goods routes cap two lines. One goods porter carries 14 per trip on a 1,730 px haul, and walks it back
   (smelter → 교역소), or 1,210–1,360 px (smokehouse → 판매대): **≈ 33 a minute**, below the stations' 50. The stations
   block (31–42 %), the raw porters wait, the piles fill (ore 85–89 %, meat 67–83 %), the miners stand at the pile
   (62–70 %) — and **at the same time the 판매대 has no 훈제 고기 32–42 % of the time**. That is carrying, not demand.
   The fix (짐꾼 2, F4) exists but is offered only after the 창고 stands (≈ 32 min) and the output was ≥ 80 % for 90 s.
3. **35 min on**: more gatherers, a second cooked-fish and bread supply than the 판매대 sells: the grill and the oven
   block on **demand**; the raw porters start their dock spill runs; the 창고 fills with cooked fish.
4. **Late (L)**: with 2단 and p2 everywhere the stations still run at 58 % of capacity: fish and bread wait for buyers,
   smoked meat waits for carriers, the smelter waits for its own raw porter, the sawmill waits for logs.

---

## 6. Diagnosis per raw: not enough demand, or not enough carrying?

| Raw → good | Late verdict | Evidence (run L unless noted) | Mid-game verdict (S25 / S35) |
|---|---|---|---|
| 생선 → 구운 생선 | **Demand** (cooked fish) + a missing link to the cannery | grill blocked 54 %; the 판매대's fish shelf ~34 / 40 and it sells only 29 a minute (guests pick fish ≈ 25 %); 13.5 a minute of cooked fish goes **into the 창고** and waits; the 통조림 공장 is **starved 39 %** while the fish pile is 72 % full — no carrier links the fish pile to the cannery (the fish raw porter serves only the grill; the cannery gets the boat's catch and raw fish the 창고 porters bring back from the 창고, 5.9 a minute) | S25: supply (1 fisherman, grill starved 50 %); S35: demand (grill blocked 30 %) |
| 통나무 → 판자 | **Neither: supply is short** | log pile empty (avg 1), sawmill starved 45 %; 3 lumberjacks make 50 logs a minute and walk 82 % of their time (the near forest is cut); every plank is sold (교역소 45.8, 대장간 7.7) — there is no plank surplus to carry to more sites | same at every stage |
| 밀 → 빵 | **Demand** (bread) | bakery blocked 45 %; bread shelf ~34 / 40; sold 28.8 at the 판매대 + 6.9 to miners + 4.3 pantry | S35: demand (24 %) |
| 광석 → 주괴 | **Carrying (a rule)**, then processing | ingot demand is unlimited (교역소); the smelter is starved 15 % while the ore pile is 63 % full because its raw porter walks ore to the dock 21 % of the time; caught 63 < cap 75.8, so the smelter could take all the ore if it were fed | **Carrying**: one ingot porter, 33 a minute on a 1,730 px trip; smelter blocked 26–31 % |
| 생고기 → 훈제 고기 | **Carrying** (smoked meat) at the processing cap | caught 74 ≈ cap 75.8; the smokehouse is blocked 23 % while the 판매대 wants more (meat is the guests' favourite: ≈ 69 a minute possible, 44 sold, shelf empty 8 %); p1 + p2 carry 50 a minute on 1,270–1,430 px trips | **Carrying**: shelf empty 32–42 % while the smokehouse is blocked 24–42 % |
| Everything → dock / 물류창고 | **Carrying** | the 물류창고 racks hold 14 of 500 and its buyers could sell ≈ 5× what arrives; each station porter trip is 2,570 px for 8.4 items | — |

**Answer to "원자재가 빨리 소모가 안 되면 수요가 없는 것"**: half right. Cooked fish and bread pile up because nobody
buys more of them (demand). Ore and smoked meat pile up because they are not carried fast enough (carrying, made worse
by the raw porters' dock spill). Logs and wheat do not pile up at all — the village is short of them. The raw items
themselves have no buyer inside the village except their own station, so "more demand for raw" means **more
stations or factories that take raw** (a 2nd smelter or smokehouse, the cannery fed from the fish pile), not more shops.

---

## 7. Idle time: who waits, and why (run L; S25 / S35 in brackets)

### 7.1 Gatherers (share of time)

| Profession | Working | Walking (to node + to pile) | **Idle** | Why idle |
|---|---|---|---|---|
| 어부 ×3 | 36 % | 19 % | **39 %** (0 / 37) | pile full |
| 나무꾼 ×3 | 13 % | **82 %** | 0 % | never; they walk to far trees |
| 농부 ×3 | 11 % | **81 %** | 2 % (0 / 19) | fields far from the pile |
| 광부 ×2 | 25 % | 31 % | **35 %** (70 / 62) | pile full |
| 사냥꾼 ×3 | 24 % | 22 % | **46 %** (25 / 14) | pile full 19 % + **no animal ready 27 %** (5 animals, 6 s respawn, 3 hunters) |

Per head: a miner catches 32 ore a minute, a hunter 25, a fisherman 20, a farmer 17, a lumberjack 17.

### 7.2 Operators (stations)

| Station | Busy | Starved | Blocked | Idle reason |
|---|---|---|---|---|
| 화덕 | 41 % | 6 % | **54 %** | cooked fish has no buyer |
| 제재소 | 56 % | **45 %** | 0 | no logs |
| 오븐 | 55 % | 0 | **45 %** | bread has no buyer |
| 제련소 | 71 % | 15 % | 14 % | its raw porter is away |
| 훈제장 | 77 % | 0 | 23 % | smoked meat not carried |
| 대장간 | 38 % | 38 % | 24 % | makes only what is wanted (S25 / S35: 100 % "no order") |
| 통조림 공장 | 33 % | **39 %** | 28 % | no fish link from the pile |
| All 7 | 53 % | 20 % | 27 % | |

### 7.3 Raw porters (8 per trip)

Route = the walked length of one haul (one way, along the roads), from the probe's trip records.

| Line | Idle: station full | Idle: pile empty | Away on dock / 창고 runs | Trips / min · load · route |
|---|---|---|---|---|
| 생선 | 9 % | 0 | **20 %** (to the 창고) | 9.3 · 5.8 · 295 px |
| 통나무 | 0 | **26 %** | 0 | 8.7 · 5.7 · 219 px |
| 밀 | **29 %** | 1 % | 3 % | 16.9 · 2.9 · 150 px |
| 광석 | 5 % | 0 | **21 %** (to the dock) | 22.0 · 2.5 · 137 px |
| 생고기 | 9 % | 0 | 7 % | 15.8 · 4.0 · 209 px |

They top the station input up in small loads (2.5–5.8 of 8) on short routes: one raw porter can move 50–64 a minute,
more than any line catches. They are never short of carrying on their own line; their idle time is the station being
full or the pile empty, and their lost time is the dock spill.

### 7.4 Goods porters (14 per trip)

| | Idle (nothing to carry / nowhere to go) | Walking (carrying + back) | Load / trip | Route / trip |
|---|---|---|---|---|
| p1 (8) | **3 %** (S25 19 %, S35 14 %: the 도구 짐꾼 idle 100 %) | 85 % | 2.4–14 | 760–4,170 px |
| p2 (5) | 1 % | 85 % | 5.5–11 | 780–1,780 px |

Goods porters are almost never idle late: they are walking. Their loads are small where the sink has little room
(the 판매대 and 교역소 shelves are nearly full: 5–7 of 14 a trip) and full on the long routes (smelter 11, smokehouse
10–11). Measured throughput per porter (items taken from the output): ≈ 25 a minute on the long full-load routes
(smelter 1,700 px, smokehouse 1,300 px), 17–27 on the shorter half-load routes (grill, oven, sawmill).

### 7.5 창고 and station porters

| Crew | Idle | Walking | Items / min (crew) | Route / trip | Jobs |
|---|---|---|---|---|---|
| 창고 ×2 (10) | 1 % | 92 % | ≈ 24–30 | 2,138 px | out 48 % · in 46 % · raw 6 % |
| Station ×4 (12) | 2 % (S35 20 %) | 91 % | 55 (≈ 14 per porter) | **2,569 px** | dock surplus 51 % · order cards 30 % · shops 18 % |

### 7.6 What this means for 이직 (moving people)

- **The idle people are gatherers and operators, not porters.** About 3.3 of the 14 gatherers' time (24 %) is idle:
  the fishermen (39 %), miners (35 %) and hunters (46 %) wait at full piles while the log and wheat lines are short.
  Moving 1 hunter + 1 fisherman to the forest or the fields would add ≈ 30 logs or wheat a minute (the per-head rates
  of §7.1) and cost their old lines almost nothing: the hunters share 5 animals, and two fishermen still catch more
  than the grill sells (≈ 33 a head when not blocked, `flow_drain`). The miners should stay: the smelter needs them
  once its raw porter stops the dock runs.
- **Porters are busy but often on the wrong job**: 20–21 % of the fish and ore raw porters' time goes to dock / 창고
  spill runs worth 1–2 coins an item, while their stations starve; 51 % of the station porters' jobs carry raw to the
  dock. Re-targeting (not more porters) is the first win.
- The only truly idle porters are the 도구 짐꾼 before the 잡화점 / hire pads need tools (100 % idle at 25–35 min) and
  the 생선 dock porter between boat landings (9 %).

---

## 8. How workers are bound to jobs (code), and what 이직 would change

### 8.1 Today's binding

| Role | Class | Created by | Bound in the constructor | Home | Look | Saved as |
|---|---|---|---|---|---|---|
| Gatherer | `Worker` (`entities/Worker.js`) | Progression steps `hire_<type>`, `hire2_<type>`, `hire3_<type>` → `Game.hireWorker(type, index)` | `type` → `station = STATION_OF[type]`, `pile = PILE_OF_WORKER[type]`; it picks nodes of its own kind only (`gs.trees / wheat / rocks / animals / net`) | `WORLD.workerHome[type] + index × (40, 20)` | the profession's look by index (`fisherman`, `fisherman_b`, `fisherman_c` …): the `work` animation is the profession's tool (rod, axe, sickle, pickaxe, bow) | **not saved**: rebuilt from `progress.done` on load |
| Operator | `Operator` via `OperatorSpot.hire` (`systems/Labour.js`) | `op_<station>` → `Game.hireOperator` | its station's one spot (`world.js labour.ops`) | the spot | one fixed character per station (`npc_chef`, `npc_sawyer`, `npc_aunt`, `npc_blacksmith`, `npc_smoker`, `miner_b`, `npc_cannery`) with that station's `operate` animation | rebuilt from `progress.done` |
| Raw porter | `RawPorter` | `raw_<station>` → `Game.hireRawPorter` | `pile` + `target` station | beside the pile | `npc_porter_a / _b` (generic) | rebuilt from `progress.done` |
| Goods porter p1 | `Porter` | `porter_<station>` (incl. 도구, dock, 통조림) → `Game.hirePorter(id)` | `station` (its output) — destinations are free | `Porter.homeFor(station)` | generic | rebuilt from `progress.done` |
| Goods porter p2 | `Porter` (`p2`) | `LineUpgrades` F4 pad → `hireP2(line)` | same | home + (40, 22) | generic | `v42.lines.p2` |
| 창고 porter | `WarehousePorter` | the 창고 building (`BALANCE.warehouse.porters` = 2) | the 창고; `think()` picks out / in / raw jobs | by the 창고 door | generic | constant count |
| Station porter | `StationPorter` | `stn_porter`, `stn_porter2`, the 3rd / 4th pad → `Growth.hireStationPorter` | the station district (remote sinks) | the station square | generic | `progress.done` + `v42.depot.porters34` |
| Clerks, 큰 식당 staff, office staff | `Register`, `BigRestaurant`, `Office` | their pads | their counter / kitchen / desk | — | their own | `progress.done` / office slice |

Every job is implied by a hire step id. There is no "person" object that outlives its job: a gatherer **is** "the
2nd fisherman". The only flexible part of the system is the porters' **destination** (`Logistics.best`); their **source**
is fixed for raw and goods porters, and only the 창고 and station porters choose their sources.

### 8.2 What "이직" means in code

| Question | What the code needs |
|---|---|
| A job slot | A small registry `jobs` (new, e.g. `src/systems/Jobs.js`): one slot per hire step and per p2 / station porter, `{ id, role: gather \| raw \| goods \| wh \| station, line }`. The hire steps keep creating the person; the slot says where the person works now. |
| Moving a porter | Generic look, so it is a re-bind: `RawPorter.pile / target / home`, `Porter.station / home`, then `clearDest()` / `dropJob()` so the reservations are released, finish the current load first (it is already planned to a sink), then walk to the new home along the roads (`go()`); 150 px/s → 10–25 s across the old village. |
| Moving a gatherer | The work animation belongs to the profession, so a move is a profession change: re-skin to the new profession's look (`gs.workerKey(type, index)`, 3 looks per profession; `miner_c` exists and is unused), re-set `type`, `station`, `pile`, `home`, `oreLeft`, and walk. With 3 looks per profession a line holds at most 3 distinct-looking gatherers (a 4th needs a tint or a cap of 3 per line). |
| Operators | One spot per station, and a station does not work without its operator: operators should **not** move (or only swap with the chief standing on the spot, as today). |
| Hire costs | The step stays done (no refund, the next pads keep their order); moving is free or a small 이사비 with a cooldown (e.g. one move per person per 60 s) so that auto-assign and the player cannot thrash. The pads of the line that lost a worker do **not** come back (the step is done); the slot can be moved back. |
| Save | A new slice, only the differences from the default binding: `jobs: { "hire2_fisherman": "smelter", "raw_grill": "smokehouse", … }` (≤ 30 entries, < 1 KB). Absent = today's binding, so every older save loads unchanged. `Game.hireWorker / hirePorter / hireRawPorter` read the slot when they rebuild from `progress.done`. |
| Idle detection | Per role, from the states the probe already reads (§7): gatherer `drop` with `fullT > 0` (pile full) or `seek` with no ready node; operator: station input empty (starved) or output full (blocked); raw porter: `load` with nothing wanted (station input full) or an empty pile; goods porter: `load` with an empty output (nothing to carry) or no plan (nowhere to go); 창고 / station porter: `idle` (`think()` found nothing); any porter: `unload` with `waitT > 0` (destination full). Show it as a share of the last 2–5 minutes (an EWMA like `StockLedger`), not the current second. |
| Auto-assign (알아서 배치) | A slow controller (every 30–60 s): for each line, demand = the line's red / orange status (`StockLedger.status`: short, jam) or a pile / output full share above a threshold; supply = porters whose idle share is above a threshold. Move one person per tick from the most idle line to the most needy line, with hysteresis (a person stays ≥ 2 min). It must only re-target people, never hire. |
| With the production-scaled crew (v4.2 touch) | The touch draft (`BALANCE.warehouse.crew`, being built while this was measured) makes the 창고 crew `2 + floor(raw + goods made a minute ÷ 100)`, cap 6, free, never leaving. At the measured production (≈ 580 a minute late, ≈ 460 at S35) it reaches its cap of 6: 4 more porters ≈ +50–60 items a minute of 창고 carrying at the measured 12–15 per porter on 2,100 px trips. Auto-assign should treat that crew as one pool whose **size** is set by production (the touch's rule) and whose **targets** auto-assign may change; the line porters (p1 / p2 / raw) are the slots auto-assign may move. The two never fight if the crew rule never counts moved line porters and auto-assign never changes the crew size. |

---

## 9. Sector status views: what the data allows, and one window or two

### 9.1 Sectors and where their numbers already are

| Sector (designer's word) | Lines / places | Production | Stock | Demand / sold | Bottleneck | People |
|---|---|---|---|---|---|---|
| 어업 | 어부, 생선 통, 화덕, boat, 배 창고 | `StockLedger` `pile:fish.inPm`, `out:grill.inPm` | pile, in / out, shelf, 창고 | `shelf:item_fish_cooked.outPm` | `StockLedger.status('grill')` (short / jam / surplus / ok) + the v4.6 why-chain | gatherers, raw, p1 / p2 (states §7) |
| 임업 | 나무꾼, 통나무 더미, 제재소 | same (`log`, `sawmill`) | same | 교역소 / sites (`shelf:item_plank`) | status `sawmill` | same |
| 농업 | 농부, 밀 더미, 오븐 | same | same | 판매대 / pantry / 식량 상자 | status `bakery` | same |
| 광업 | 광부, 광석 더미, 제련소, 식량 상자 | same | same | 교역소, workshops | status `smelter` + hungry miners | same |
| 사냥 (축산) | 사냥꾼, 고기 걸이, 훈제장 | same | same | 판매대 / pantry | status `smokehouse` | same |
| 공업 | 대장간, 통조림 공장 (+ new factories) | `crafted` events | workshop in / out | 잡화점, hire pads | workshop state (starved / blocked / no order) | operators, 도구 / 통조림 짐꾼 |
| 상업 | 판매대, 교역소, 잡화점, 큰 식당, 5 shops | — | shelves, pantry | `Office.income` by source (market, trade, store, rest, tax, station, export, depot) | empty-shelf clocks (`Surplus.emptyT`) | clerks, restaurant staff |
| 물류 | 창고, dock, 물류창고, sleighs, all porters | — | 창고 300, dock, racks | — | dock backlog, `sleighWaitT`, porter states | all porters |
| 수출 | train, 물류창고 buyers, (금방) | — | dock | `Freight.stats`, `Depot.today` | `Freight.stats.waitT` | station porters |

Every number but the people column exists today (`StockLedger.rows()` / `stocks()`, `Office.income`, `Freight.stats`,
`Depot.today`). The people column needs one small read-only function per role (the predicates of §8.2), sampled once a
second like the ledger.

### 9.2 One hub (recommended), checked against the v4.4 HUD plan

The data says the two views are the same rows seen from two sides: a red 산업 card is caused by a line's people
(§6–§7: the wood line lacks lumberjacks, the ore line loses its raw porter to dock runs, smoked meat lacks carriers,
the fish line lacks buyers and a carrier to the cannery), so the card has to lead straight to that line's people, and
a person's row has to say which line it serves and why it waits. Two windows would repeat the same per-line rows twice and make the player hop between them.

- **Recommended: one 마을 경영 hub = the v4.6 마을 panel** (`docs/v44_plan.md` §16.3, §19.2: a shell panel, tabs
  등급 · 행복 · 자원 · 통계) with the 자원 tab grouped into the sector cards of §9.1, and one more tab **일꾼·짐꾼**
  (people by line, idle share, 이직 / 알아서 배치). A card's button opens the 일꾼·짐꾼 tab filtered to that sector.
  The office 재고 tab and this panel share one renderer, as the plan already says (`LedgerRows.js`).
- **No new HUD button.** `v44_plan.md` D13: the left column is full at 360×640 (the stack manager shows 3 rows there,
  4 at 390×844) and the bottom third belongs to the joystick. The 마을 panel opens from the existing popBox / rank chip,
  the office (재고 → 산업, 직원 → 일꾼·짐꾼) and the overview's 자원 지도 pins. If the designer wants a direct way in,
  it should be a stack-manager row (it folds into "+n" when crowded), not a free button. (The task's default said
  "one HUD button"; the v4.4 plan's measurements say there is no room for one.)
- Phone fit: the shell panel is `min(W − 24, 700)` × `min(H − 220 − insets, 1100)` logical = 700 × 1,100 at
  390×844 and 700 × 1,060 at 360×640; rows of 640 × 88 with ≥ 88 hit areas give 9–10 people rows per screen and the
  body scrolls. 14 gatherers + 5 raw + 13 goods + 2–6 crew + 4 station porters ≈ 40 rows: the tab must group by sector
  (one sector open at a time, ≈ 6–8 rows each) to stay readable.

---

## 10. The designer's seven points against the numbers

| # | Designer's idea | What the data says | Size (from the measured rates) |
|---|---|---|---|
| 1 | Raise demand: more factories, workshops, shops, customers | Right for **cooked fish and bread** (grill / oven blocked 45–54 %, shelves full, 창고 filling with cooked fish). Right for **raw fish** if the buyer is the **통조림 공장** (starved 39 % next to a 72 % full fish pile; 3 fish → 3 cans = 36 coins vs 12 as cooked fish; the 잡화점 can sell ≈ 37 cans + tools a minute and sells 19, 15 of them cans). **Not** the cause for ore (ingots sell without limit) or smoked meat (the 판매대 wants more). Logs and wheat have no surplus at all. New 집기류 / 가전 (ingots) and 가구 (planks) consumers are good **content** and a final customer (homes, 살림살이 happiness) but only drain a pile if the station before them is fed and carried | fish: +12 a minute to the cannery ≈ +12 cans (+144 coins / min); food: the big-restaurant fix (touch) and the 물류창고 food racks (≈ 16 a minute of idle buyers over a day) |
| 2 | More carrying (planks to many sites, exports) | Planks are **short**, not stuck: every plank is sold, sites already outrank the 교역소 (SITE 100). Carrying is short on **smoked meat** (1,300 px), the **ore raw porter** (its dock runs) and **everything to the dock** (2,600 px) | smoked meat: up to +18 a minute (smokehouse 57.5 of 75.8) ≈ +216 coins / min; ore: up to +10 ingots (≈ 100 coins) / min |
| 3 | Big 물류창고 / 자재창고, early | The 물류창고 already has room (14 of 500) and idle buyers; what is missing is the walk to it. A raw yard / 자재창고 **beside the piles** turns a 2,600 px porter walk (≈ 14 items a minute per porter) into a 250 px one (≈ 50–60) and lets one vehicle do the long haul in bulk (sleigh 60 a trip). The 창고 cannot do it today: it refuses log, wheat, ore and raw meat. "Early" in the data = at village complete (≈ 20 min): before that the piles are empty except ore (no ore porter until 16.6 min) | one yard porter instead of ≈ 3 station porters for the measured 39 raw a minute |
| 4 | Logistics staff that grow with production | Crew needed on a route = items a minute ÷ per-porter rate. Measured per-porter rates: ≈ 50–60 on 150–300 px, ≈ 25 on 1,300–1,800 px, ≈ 14 on 2,100–2,600 px. A production-scaled crew should size itself by **route length**, not only by production (the touch draft counts production only): 30 items a minute need 0.5 porter next door and 2 porters to the dock | e.g. the late raw surplus 39 / min → 2.8 station porters today |
| 5 | A real logistics system (take from surplus, bring to need) | Destinations are already pooled (`Logistics.best`: any village sink by priority and distance); **sources are not**: a raw porter serves one pile → one station, a goods porter one output. The two measured gaps — fish never reaches the cannery directly; raw porters walk raw to the dock while their station starves — are both source-binding gaps. A shared job board (any free porter takes "12 fish at the pile → the cannery wants 18", like the 창고 / station porters' `think()`) closes them | cannery +39 % busy; smelter +15 % busy |
| 6 | 일꾼 · 짐꾼 window with 이직 | The idle ones are **gatherers** (≈ 3.3 of 14: fishermen 39 %, miners 35 %, hunters 46 %) and **operators** (blocked 27 %, starved 20 %); goods, 창고 and station porters are 97–99 % busy (walking), raw porters 84 %. So 이직 is most useful for gatherers (between professions) and for **re-targeting** porters, not for finding idle porters | 1 hunter + 1 fisherman → wood / wheat ≈ +30 a minute |
| 7 | Sector status views | All the numbers but "people" exist today (§9.1) | — |

### 10.1 Ranked by measured effect per cost (all after village complete, so the first 20 minutes stay as they are)

| Rank | Change | Expected (from the measured rates) | New art | Code size |
|---|---|---|---|---|
| 1 | Raw porters stop the dock / 창고 spill runs; the station porters (and in v4.3 the 금방 sled) take the pile surplus | smelter starved 15 % → ≈ 0: up to +10 ingots / min; the fish raw porter back on its line | none | small (one rule in `RawPorter.update`) |
| 2 | Smoked meat: a 3rd carrier, or 짐꾼 2 offered before the 창고 stands (the S25 / S35 stage) | 판매대 meat empty 32–42 % → low at mid game; up to +18 smoked meat / min late | none | small (`LineUpgrades.f4Due`) |
| 3 | Fish pile → 통조림 공장 link (the raw porter or a pooled porter may serve either input) | cannery starved 39 % → low; + ≈ 12 cans / min, uses 4 more ingots / min | none | small–medium |
| 4 | Food demand: the big restaurant fix (v4.2 touch) + cooked fish / bread to the 물류창고 food racks | grill / oven blocked 54 / 45 % → lower | none | touch + small |
| 5 | 이직 of idle gatherers to the short lines | ≈ +30 logs or wheat / min → planks for sites, ≈ +150 coins / min | none (3 looks per profession) | medium (§8.2: job slots, save slice) |
| 6 | 자재창고 / raw yard beside the piles that accepts raw, with a crew sized by route | export carrying ×3–4 per porter; piles stop being the only buffer | none (`warehouse` or pallets) | medium |
| 7 | 가전 공장 (주괴 3 → 난로 · 냉장고 · 세탁기 …) and 가구 공방 (판자 3 → 가구) with 살림살이 for homes, using `src/city/logistics/model/chains.js` | 22.5 ingots / min per factory; 30 planks / min (only with more wood, rank 5) | `lgx_producers` (paged, +2 files) | medium–large |

Income note: ranks 1–3 alone add up to ≈ 300–460 coins a minute at today's prices (+14–21 % over run L). The v4.2 income
gate (+15–30 % vs v4.1) is already 3 points over, so the designer may want prices or the 2단 speed revisited with them.

---

## 11. Reusable art and prepared code

### 11.1 Art that already exists (sizes are the atlas textures in memory)

| Use | Existing art | Atlas | Texture | In the artifact today |
|---|---|---|---|---|
| **Ingot / ore consumer (집기류)**: 가전 공장 | `appliance_factory` (3 × 3 m, brick factory, press, `work` anim, `workSpot`, in / out points) | `logistics/lgx_producers` (with the furniture workshop) | 2016×700 = 5.4 MiB (153 KB png) | **no** (+1 atlas) |
| **Plank consumer**: 가구 공방 | `furniture_workshop` (3 × 3 m, table saw, `work` anim) | same atlas | (same) | no |
| Their products / crates | `item_stove_iron` (난로), `item_fridge`, `item_washer`, `item_radio`, `item_tv_retro`, `item_toolbox`, `item_crate_tools`, `item_chair`, `item_table`, `item_sofa`, `item_bed`, `item_wardrobe`, `item_crate_smoked`, `item_crate_cans`, `item_crate_food`, `item_crate_bread`, `item_crate_produce`, `item_crate_jam`, `item_cloth_rolls`, `pallet_planks / ingots / logs / ore / boxes`, `cardboard_box_s/m/l` | `logistics/lgx_items` | 1320×68 = 0.3 MiB | **yes** (the 물류창고 racks) |
| Big 물류창고 / 자재창고 | the 서리 물류창고 itself: `logistics_center` layers | `lgx_center_a–d` | 6.6 + 4.9 + 6.7 + 5.2 MiB | yes |
| Small early 창고 | `warehouse` (v3 창고) | `buildings/bld_buildings` | 10.7 MiB (shared with 대장간, 통조림 공장, 잡화점) | yes |
| Warehouse crew vehicles | `forklift`, `forklift_loaded`, `pallet_jack` | `lgx_forklift(_loaded)`, `lgx_pallet_jack` | 3.8 + 3.8 + 0.4 MiB | no |
| Delivery to shops / homes | `delivery_van_red / blue / mint`, `moving_truck` | `lgx_delivery_van_*`, `lgx_moving_truck` | 4.8 each, 12.2 MiB | no |
| 2nd smelter / smokehouse / grill / oven | `station_smelter`, `station_smokehouse`, `station_grill`, `station_bakery`, `station_sawmill` | `props` (resident) | already resident | yes — **zero new texture** |
| 2nd 대장간 / 통조림 공장 | `station_toolsmith`, `station_cannery` | `bld_buildings` (resident once built) | already resident | yes |
| Village-side consumer shops | 솔방울 town shops: `bookstore`, `clothing_store`, `flower_shop`, `hair_salon`, `toy_shop`, `hardware_store`, `restaurant`, `cafe`, `supermarket`, `carpenter_workshop`; `post_office`, `clinic` | `town_shops` (packed `town_shops.a/.b`), `town_civic` | 12.0 / 15.4 MiB (packed pages shipped) | yes (as pages) |
| People | porters `npc_porter_a / _b`; workers 5 professions × 3 looks (`miner_c` unused); townfolk paper dolls (customers); cityfolk dolls with push / sweep (the logistics module's producer operators); officefolk (office) | `characters`, `workers`, `townfolk*`, `cityfolk`, `officefolk` | — | yes |
| Hub icons | `ui_icon_worker`, `ui_icon_porter`, `ui_icon_staff`, `ui_icon_inventory`, `ui_icon_stock`, `ui_icon_depot`, `ui_icon_forklift`, `ui_icon_route`, `ui_icon_delivery`, `ui_icon_tools`, `ui_icon_food`, the item icons as sector icons, `emote_zzz` for idle, `ui_status_0–3` dots | `ui`, `ui2`, `ui3`, `ui5`, `fx_city`, `emotes` | — | yes |

### 11.2 Prepared code

| Module | What it has that new consumers can use | State |
|---|---|---|
| `src/city/logistics/**` (v8 logistics runtime, `docs/build_reports/logistics_runtime.md`) | `model/chains.js` **Producer** (3 in → 1 out, pile of 8, pickup when 7 or 75 s idle, "least stocked next piece" so a chain never makes only one kind) for 가구 공방 (판자 3 → 가구, 6 s) and 가전 공장 (주괴 3 → 가전, 8 s); `model/stock.js` caps by category (furniture 40, appliances 30); 살림살이 (집 3단계: 3 furniture + 1 appliance per home, +2 happiness each, capped); `view/Producers.js` (station + cityfolk operator + smoke); `view/Forklift.js` + `model/floor.js` (forklift loop, docks, pickers) | standalone, tested, not imported by the game; its centre is the v8 솔방울 centre (50,000 coins), but the **chains and the 살림살이 rule do not depend on it** |
| `src/geumbang/**` (v4.3) | households order goods delivered by van; the dog sled's **금방 집하** takes piles ≥ 85 % (keeps 40 %) to the dock | finished, wiring in v4.3. Its own volume is small (≈ 30 units a day); 집하 moves the same surplus sooner (any pile ≥ 90 %: 99 → 86 %; 2 sleds 64 %) |
| `src/systems/StockLedger.js` | every stock with in / out per minute, full / empty timers, line statuses | in the game (office 재고 tab) |
| `src/systems/Surplus.js` | one rule set for "what the village cannot use" (outputs, piles, 창고, boat) | in the game |
| `LineUpgrades.js` | the offer-pad pattern (appears when the measured need is there, one banner, once per save) | in the game — the right pattern for new consumers ("광석이 남아요 → 가전 공장을 지어 보세요") |

### 11.3 New art: what the options in §10 would need

| Option | New art | Texture / files |
|---|---|---|
| 마을 경영 hub (산업 cards + 일꾼·짐꾼 tab) | **none**: shell plates `ui_office_tab(_on)`, `ui_chalk_panel`, `ui_status_0–3`, the icons of §11.1, item icons as sector icons, `emote_zzz` as the idle mark | 0 (the ui5 `@panels` page is already on demand) |
| 2nd 제련소 / 2nd 훈제장 (more processing) | **none**: `station_smelter`, `station_smokehouse` (props, resident). Operator looks: `miner_c` (rendered, never used: no `hire3_miner`) for the smelter, a cityfolk doll (push) for the smokehouse | 0 MiB, 0 files |
| 가전 공장 · 가구 공방 (new final consumers of 주괴 / 판자) | **none to render**: `lgx_producers` exists (both buildings, `work` anims, in / out points, work spots); products in `lgx_items` (shipped) | +5.4 MiB **only while a factory is on screen** (page it with the area: load near, release beyond RELEASE), +2 files (png + json, or 1 packed page): 457 → 459 of 480 |
| 자재창고 / 원자재 야적장 near the mines and the hunting ground (early raw buffer) | **none**: `warehouse` (resident with the 창고) or a yard of `pallet_ore` / `pallet_logs` / `item_crate_smoked` (lgx_items) beside the pile | 0 |
| Forklift for the 창고 crew (optional look) | **none to render**: `forklift`, `forklift_loaded`, `pallet_jack` | +3.8–7.6 MiB while the 창고 is on screen, +2–4 files — optional; porters already carry |
| Delivery vans to homes (살림살이, optional) | **none to render**: `delivery_van_*` | +4.8 MiB each, +2 files each — the 금방 vans (v4.3) can do this job instead (0 extra) |

Nothing in §10 needs a new Blender render. Every option that adds texture must be paged (the screenshot tour already
peaks at 451–452 MiB of the 455 must, `v42_code2.md` §9.2), and the artifact has ≈ 23 files of headroom after 금방.

---

## 12. Open questions and limits of this map

- Each probe run is one seed and one game day (run L) or 0.6 day (S25, S35). Run-to-run noise in the census bot was
  ±2–5 points on the pile shares (`v42_code2.md` §3.1); treat single numbers below ±3 a minute as noise.
- The probe parks the chief, so his carrying, selling, cheering (×1.1) and order-card runs are missing; the census bot's
  chief spends his late game collecting coins (47 % of samples), carrying to the dock (27 %) and fetching (20 %).
- The big restaurant's serving bug (fixed by the v4.2 touch) holds its food demand down in every run; the touch's
  porter 2 on more lines and its production-scaled 창고 crew are not in these numbers. Re-run `econ/probe.mjs` on the
  touch source for the after picture (same command lines, §1).
- 금방 (v4.3) is not wired yet: its 집하 numbers are from its own flow model (`geumbang_module.md` §5.3), not this probe.
- The probe counts deliveries to a founded shop twice-safe (a shop either shows the item on its shelf or stores it
  uncounted; both paths are added once) and does not see the shops' inland / visitor sales (they are counters, not
  stacks); those are small (§3.4).
- Gatherer rates depend on the map: the lumberjacks walk further as the forest near the pile is cut (their work share
  falls from ≈ 45 % early to ≈ 13 % late), so a late per-head rate is not an early one.
