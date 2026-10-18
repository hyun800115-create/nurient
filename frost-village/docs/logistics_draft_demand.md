# Logistics draft — demand (수요): new and wider consumers, staged with progression

Demand designer's draft for the designer's logistics direction (원자재 수요 · 짐꾼 · 물류창고 · 일꾼/짐꾼 관리창 · 산업별
현황창). It answers point (1) of the direction — **raise demand**: more workshops, businesses, shops and final customers
that use what the village makes — and checks every proposal against the measured economy in
`docs/logistics_flow_map.md` (run L, S25, S35, the CODE-2 census). Carrying (porters, 창고, 자재창고, crews, the 물류
게시판), the 일꾼·짐꾼 window with 이직 and the sector views are the sibling draft `docs/logistics_draft_carry.md` (its
DL1–DL9); this draft only names what it needs from there (§14) and how its consumers show in that hub (§10).

- Inputs: `docs/logistics_flow_map.md` (all rates below are its per-game-minute numbers unless marked *model*),
  `docs/build_reports/v42_code2.md` §8–§9, `docs/기획서_v4_2_촌장.md` §2.3, `docs/v42_plan.md` §4.5, `docs/v44_plan.md`
  (§2 guardrails, §15 주민 행복도, §16 지역 자원), `docs/v5_v8_plan.md` (§3.3 income ladder, §6.6 logistics),
  `docs/build_reports/logistics_runtime.md`, `docs/geumbang_plan.md` + `docs/build_reports/geumbang_module.md`,
  `src/data/balance.js`, `src/data/world.js`, `Workshop.js`, `Seller.js`, `Game.makeStore`, `Growth.js`, `House.js`,
  `RoadNet.js` / `RoadPaint.js`, the asset manifests.
- The v4.2 touch (큰 식당 back tables, porter 2 on more lines, a 창고 crew that grows with production) was still being
  built; `docs/build_reports/v42_touch.md` did not exist yet. Its restaurant demand is counted as an estimate.
- Nothing in `src/`, `tools/` or `assets/` was changed. Scratch: the model
  `/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/demand/model.py` and the plaza
  free-spot probe `/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/plaza_free2.mjs`.

## 0. 디자이너용 요약 (쉬운 말)

**대표님 말씀이 맞는 곳과 조금 다른 곳**
- "원자재가 안 줄어든다 = 사 갈 사람이 없다" — **생선과 빵은 맞아요.** 구운 생선과 빵은 판매대 선반이 늘 차 있고, 화덕과
  오븐이 출구가 꽉 차서 절반쯤 멈춰 있어요.
- **광석과 고기는 달라요.** 주괴는 교역소가 얼마든지 사 가고, 훈제 고기는 손님이 제일 좋아해서 오히려 모자라요. 이 둘은
  나르는 손과 가공소 속도가 모자라요. 나르는 쪽은 `logistics_draft_carry.md`에서 다뤄요.
- **통나무와 밀은 오히려 모자라요.** 판자는 하나도 안 남고 다 팔려요.

**새로 생기는 것 (생기는 순서대로, 모두 마을 완성 뒤에만)**
1. **눈꽃 포장마차** — 생선이 남기 시작하면(보통 30~35분) "생선이 남아요! 포장마차를 열어 볼까요?" 발판이 생겨요.
   광장 서쪽 게시판 옆에 서요. 남는 생선 3개로 **어묵꼬치 4개**를 만들어 그 자리에서 팔아요 (1개 2코인, 동네 값).
   저녁 5~10시에 손님이 제일 많아요. 만든 자리에서 파니까 물건을 나르는 짐꾼이 따로 필요 없어요. 1분에 생선 약 21개를 써요.
2. **주문판이 남는 물건을 먼저 찾아요** — 가게 5곳이 다 열린 뒤, 솔방울 정기 주문이 남는 생선구이·빵·통조림을 먼저 달라고 해요.
3. **마을 저녁 잔치** — 창고와 마을회관이 생긴 뒤, 매일 저녁 6시에 창고에 남은 생선구이·빵으로 마을 마당 모닥불에서 잔치를 해요.
   돈은 안 받아요. 주민이 모여 먹고 즐거워해요.
4. **대장간 2단 · 무쇠 난로** — 읍이 된 뒤, 대장간이 자주 쉬면 발판이 생겨요. 쉬는 동안 **주괴 2 + 판자 1**로 난로를 만들어요.
   집집마다 난로가 하나씩 들어가고(굴뚝 연기가 더 자주, 밤에 창문이 따뜻하게), 솔방울 철물점과 금방에서도 팔아요 (1개 30코인).
5. **용광로 · 훈제장 3단** — 읍이 된 뒤, 광석이나 고기가 계속 남는데 가공소가 쉬지 않고 일해도 모자랄 때만 발판이 생겨요.
- **나중에** (v5~v8): 가구 공방(나무꾼이 늘어난 뒤 판자 → 의자·탁자), 주민 장보기, 항구 수산시장·수출선, 해변 먹거리,
  가전 공장. 집은 **난로 → 가구 → 가전** 순서로 하나씩 좋아져요 (살림살이 1·2·3단계).

**"철광석으로 공구·집기를 더 만들면?"** — 좋아요, 그래서 난로를 넣었어요. 다만 주괴는 지금도 교역소가 다 사 가서, 난로를
만들어도 광석 더미는 줄지 않아요. 광석 더미를 비우는 건 ① 광석 짐꾼이 제련소만 채우기(나르기 쪽) ② 제련소가 더 빨라지기
(용광로)예요. 광부 2명은 1분에 광석 약 92개를 캐는데, 제련소(2단)는 76개까지만 녹여요.

**"판자는 공사장·수출로?"** — 판자는 지금 남지 않아요. 나무꾼이 먼 나무까지 걸어 다녀서 통나무가 모자라요. 노는 어부·사냥꾼을
나무꾼으로 옮기면(이직) 판자가 늘고, 그때 가구 공방이 판자를 써요 (v5).

**"고기 가게(정육점)는?"** — 지금 넣으면 판매대 훈제 고기가 더 비어요. 고기가 정말 남을 때(훈제장 3단 뒤에도) 넣어요.

**돈 (수입)** — 남던 것이 팔리면 돈이 늘어요. 그래서 새 손님을 셋으로 나눴어요: **팔기**(가게, 제값) · **쓰기**(잔치·집 난로처럼
마을에 쓰기, 돈은 적고 행복이 늘어요) · **보내기**(수출, 싸게). 1~4번만 하면 1분에 약 +84코인(+4.5점)이라 지금 +33%가 약
+38%가 돼요. 5번(3단)까지 하면 +9~+19점이 더 늘어요. 나르기 손질과 큰 식당 손질도 돈을 늘려서, 이번 물류 손질 전체로는
+30% 목표 안에 못 있어요. 그래서 **읍 전(20~50분)은 지금 목표 그대로, 읍 뒤는 수입이 늘어도 되게** 하기를 추천해요 (v5 계획도
읍 → 도시 사이에 수입이 두 배쯤 되는 걸 기대해요). 대신 "처음 20분 그대로 · 읍 시각 ±5%"는 꼭 지켜요 (7장). 처음 20분은
그대로이고, 읍이 빨라지는 것도 0.5분 안이에요.

**더미(모아두는 곳)** — 1~4번 + 나르기 손질이면 생선·밀 더미는 거의 안 차요. 광석·고기 더미는 3단이나 금방 썰매·자재창고가
있어야 줄어요 (6장).

**그림** — 새 그림은 **포장마차 건물 1개 + 어묵 아이콘 1개**뿐이에요. 나머지(난로, 연기, 모닥불, 의자, 음식 아이콘, 주민 인형)는
다 있어요. 파일은 1개 늘어요 (금방 뒤 457 → 458, 한도 480).

**창 하나? 따로?** — 흐름 지도·나르기 문서와 같아요: **마을 경영 창 하나** (탭: 현황 · 일꾼·짐꾼 · 물류). 새 가게·공방은
그 창의 산업 카드에 한 줄씩 들어가요 (포장마차 → 상업, 난로 → 공업, 잔치 → 물류, v4.6부터는 행복 탭에도). 카드가 파란색
"살 사람이 모자라요"이면 **가 보기**가 이 문서의 발판(포장마차 열기 등)으로 데려가요. 새 창은 만들지 않아요.

### Key numbers (English)

| Measure (late village, per game minute) | Value | Source |
|---|---|---|
| Gatherer potential when the pile never fills: fish · log · wheat · ore · meat | ≈ 97 · 50 · 53 · 92 · 80–92 | run L idle shares; ore = `flow_drain`; meat range = animal-limited (`flow_drain` 80) vs idle-based 92 |
| Pile out-take today (all takers) | 61 · 50 (everything caught; the sawmill could take 91) · 51 · 62 · 74 | run L §4.1 |
| Processing caps with 가공소 2단 | grill 114 · sawmill 91 · oven 83 · smelter 76 · smokehouse 76 · cannery 69 fish | flow map §3.1 |
| Real demand limits today | cooked fish ≈ 40 (+13.5 into the 창고) · bread ≈ 48 · cans ≈ 33 at the 잡화점 + exports · planks / ingots no limit (교역소) · smoked meat ≈ 69 at the 판매대 + ≈ 15 elsewhere | flow map §3.4, §4.2 |
| This draft's new sinks (late) | 어묵 20.7 fish · cards +3 cooked fish · feast 6–9 foods · stoves 6–8 ingots + 3–4 planks · 3단 +16 ore and +4–16 meat | §3 |
| New coins (created) | D1 +55 · D2 +11 · D3 0 · D4 +17 · D5 +162 (ore) / +50–194 (meat) | §7 |
| New art | 1 building (`stall_eomuk`) + 1 item icon (`item_eomuk`): +1 file, ≈ +1.0 MiB near the plaza | §8 |

---

## 1. What demand can fix, and what it cannot (per raw, from the flow map)

| Raw → good | Measured verdict (flow map §6) | Who already buys (today) | The gap at full gatherer potential (*model*) | Lever | This draft |
|---|---|---|---|---|---|
| 생선 → 구운 생선 / 통조림 | **Demand** (cooked fish) + a missing fish → cannery link | 판매대 29, pantry 5, cards 5, 레스토랑 1 (+13.5 a minute parked in the 창고); cannery 22.5 (boat + 창고) | potential ≈ 97 into the pile vs ≈ 61 taken: **≈ 36–40 a minute** | demand **and** carry (the link) | **D1** 어묵 (−21), **D2** cards (−3), **D3** feast (−4 to −6); the link and can exports are carry |
| 통나무 → 판자 | **Supply short** | 교역소 46 (no limit), 대장간 7, sites | none: logs 50 vs sawmill 91 | supply (이직 → lumberjacks, carry draft DL6) | none now; **D6** 가구 공방 once wood grows (v5) |
| 밀 → 빵 | **Demand** (small) | 판매대 29, miners 7, pantry 4, cards 5, 카페 / 슈퍼 3 | ≈ 2–7 | demand | **D2**, **D3** (bread at the feast); the touch's restaurant; miners eat more once ore flows (1 food per 5 ore) |
| 광석 → 주괴 | **Carrying** (raw porter's dock runs), then **processing cap** | 교역소 36 (no limit), workshops 15 | potential 92 vs smelter 76: **≈ 16** even when fully fed | carry first, then processing | **D5** 용광로 (by need); **D4** stoves are content, they do not drain ore |
| 생고기 → 훈제 고기 | **Carrying** at the processing cap; smoked meat is **short** at the 판매대 | 판매대 44, miners 6, pantry 5, cards / shop 2.5 | potential 80–92 vs smokehouse 76: **≈ 4–16** | carry first, then processing | **D5** 훈제장 3단 (by need); no new meat buyer now (§4, D8) |
| Everything → 짐 싣는 곳 / 물류창고 | **Carrying** (2,600 px walks) | train (no limit, 0.5 × price), 물류창고 buyers ≈ 116 a minute while open (racks hold 14 of 500) | — | carry | nothing: these sinks already have room |

Two consequences shape the whole draft:
1. **Real demand is missing only for fish and (a little) bread.** For ore and meat the buyers exist; more buyers would not
   empty those piles. What empties them is carrying (sibling draft) and, at the late stage, processing speed (D5).
2. **A sink only drains a pile when its total take reaches the gatherers' potential.** Today a pile is full 60–75 % of
   the time once the gatherers can bring ≥ 20 % more than is taken, and ≈ 11 % when they bring 5 % more (wheat). So a
   new consumer is sized against the *potential* (gatherers that stop waiting catch more), not against today's catch.

---

## 2. Design rules for every new consumer

| # | Rule | Why |
|---|---|---|
| R1 | **Nothing before 마을 완성 (≈ 20 min).** Every trigger needs `progress.complete`; offers use the `LineUpgrades` pad pattern (appears on measured need, one banner, once per save). | first 20 minutes stay as they are (gate `fresh25`) |
| R2 | **Surplus-only inputs.** A new consumer's input sink sits *below* the line it borrows from (e.g. fish at calm 42 < GRILL 60), so it only gets what the old line cannot take. | never empties a shelf the gates watch (판매대 ≤ 10 % empty) |
| R3 | **Sell where it is made** when possible (the 포장마차 cooks and sells on one spot). | no goods porter, no 2,000 px walk: the measured bottleneck is carrying |
| R4 | **팔기 · 쓰기 · 보내기** (sell · use · ship). Each consumer is tagged: *sell* = shop price; *use* = the village uses it (feast, home stoves) for happiness and looks, few coins; *ship* = export at 0.5–0.7 × price. Volume sinks are *use* or cheap *sell* (동네 값). | piles drain without blowing the income band (§7) |
| R5 | **Reuse art.** New art only where the read needs it (one building + one icon). | file gate 480, texture must 455 MiB |
| R6 | **One save slice** `demand` (absent = nothing built or offered). | every older save loads unchanged |
| R7 | **Sector tag** for the 마을 경영 hub (산업 cards) and the 지역 자원 rows. | no new window (§10) |
| R8 | Never touches the 읍 bar (`Growth.happiness()`, D34 of the v4.4 plan); happiness effects go to the v4.6 resident needs. | 읍 pacing ±5 % |

---

## 3. The v4.x consumers

### D1 · 눈꽃 포장마차 (어묵) — a stall that turns surplus fish into hot fish-cake skewers and sells them on the spot

| | |
|---|---|
| Player reads | Sign **"어묵 2"**, a steaming pot, three stools, paper lantern lit at dusk. Banner on offer: **"생선이 남아요! 광장 옆에 포장마차를 열어 볼까요?"**. Opening toast: **"눈꽃 포장마차가 문을 열었어요! 남는 생선이 따끈한 어묵이 돼요"**. Guest bubbles: "따끈한 어묵 하나 주세요!", "국물도 주세요~". Owner (어묵 할머니): "추운데 어서 와요!" |
| Tag | **팔기 (동네 값)** · sector 상업 (input from 어업) |
| Recipe | **생선 3 → 어묵꼬치 4** (`item_fish_raw` only; the boat's 참치 stays with the cannery), 2.4 s a batch → cap 100 skewers / 75 fish a minute. Fish only, no wheat: wheat is not in surplus once the touch and the miners eat more bread (§1), and a two-input stall would stall when wheat is short |
| Pads | input pad 24 fish; shelf 40 skewers (the shelf *is* the output: R3) |
| Customers | its own guest stream (a `Market` like the 잡화점: `Game.makeStore` pattern), town-doll looks (`gs.v4.pickLook`) = 동네 사람들. Base one guest every 3.0 s × the hour: 07–11 ×0.6 · 11–14 ×0.9 · 14–17 ×0.7 · **17–22 ×1.6** · 22–07 ×0.15 → **13.8 guests a minute on average, 32 at the evening peak**; want 1–3 (avg 2); queue ≤ 6. In the evening a few real residents (VillageLife) stand at the stall with an `eat` act for flavour (no economy) |
| Expected take | **27.6 skewers = 20.7 fish a minute** (day average; 48 fish at the peak) |
| Price | **2 coins a skewer** (동네 값: 4 skewers from 3 fish = 8 coins, below the 12 the same fish make as cooked fish — fair because it only gets fish nobody else takes, R2) → **+55 coins a minute** (+3.0 points) |
| Unlock | after 마을 완성, when the fish pile was ≥ 90 % for a total of `offerFullS` 90 s (S35 shows 77 % full: offered ≈ 30–35 min in the bots); fallback: offered at 읍 if never needed. Plot `v43_stall` appears (S, `only: 'stall'`, like the v4.2 office / bank plots) |
| Build | 1,200 coins + 판자 10 + 주괴 2, 8 s; the owner comes with it (like the 창고's porters). The chief can stand on the work spot (×1.25 as at the stations) |
| Place | a new S plot **≈ (480, 990)**: just outside the plaza's south-west edge on the forest side, 120 px south of the 게시판 gathering spot (`life.areas.notice` (520, 870)). A probe of `world.js` (stations, pads, the upgrade bench pads, the market queue, decor, life props, plots, piles, walk lines; ≥ 100 px clear, ≥ 130 px from walk lines) found the plaza itself full; this is the nearest clear spot to the fish pile (562 px straight). The builder confirms it with the layout checker |
| Carriers | fish: the fish raw porter, under the carry draft's DL1 (a raw porter whose station input is full may take a local job ≤ 900 px straight — "a workshop input that takes this raw"; the stall is 562 px from the fish pile), the 물류 게시판 pool (DL5), and the chief. Input sink priority **42** (calm), below GRILL 60, so the grill always eats first (R2). No goods porter (R3) |
| Pile effect | fish pile take +20.7 of the ≈ 97 potential (§6) |
| Happiness | v4.6: the stall counts as a food place for the 먹거리 need ("favourite on a shelf" → or 어묵 at the stall). Before v4.6: scene + bubbles only |
| 금방 | `item_eomuk` joins the catalogue (weight 0.6; kids 1.4, grandma 1.2), 금방 price 2 |
| Art | **new**: `stall_eomuk` + `item_eomuk` (§8). Steam = the stations' existing `fx_smoke_puff`, white; sound = `sfx_sizzle` at low volume |
| Zero-art fallback | `market_counter` + `tent_a` + the plaza's `lantern_string` (all resident) as **생선구이 포장마차**, selling `item_fish_cooked` from the grill's output at 3 coins with the same evening guests. It drains the over-supplied cooked fish (the grill has 114 of capacity) instead of raw fish; reads less distinct (the 판매대 uses the same counter) |

### D2 · 주문판이 남는 물건을 먼저 — surplus-first standing orders

| | |
|---|---|
| Player reads | The order board's standing card says **"솔방울 정기 주문 · 남는 생선구이 50개"** with a small "남는 물건" ribbon; toast on the first one: **"솔방울이 우리 마을에 남는 걸 알고 먼저 사 가요"** |
| Tag | **보내기** (wholesale 0.7 × price + the standing bonus 0.3 / 0.5) · sector 물류 |
| Rule | Today `Growth` draws standing cards in a fixed rotation (`orders.standing`: bread 40 · cooked fish 50 · planks 40 · ingots 25 · cans 30 · smoked meat 25). New: when a standing card is drawn, pick the list item with the highest surplus score — `StockLedger.status` 남음 (blue), or its output ≥ `outAt` 80 % for 60 s, plus its 창고 stock — and fall back to the rotation when nothing is in surplus. Planks and ingots only when nothing else is (the 교역소 takes those without limit anyway) |
| Unlock | with the standing cards (after the 5 founded shops, ≈ 38 min) |
| Effect | the station porters' card runs carry surplus cooked fish / bread / cans instead of planks / ingots that the 교역소 would buy anyway: ≈ +3 cooked fish a minute out of the 창고 and the grill (carrying-limited: 4 station porters) |
| Coins | ≈ +11 a minute (+0.6 points) |
| Art | none (cards, item icons) |

### D3 · 마을 저녁 잔치 — the village eats the 창고's unsellable food together

| | |
|---|---|
| Player reads | Morning notice on the 마을회관 board and in 서리 소식: **"오늘 저녁 6시, 마을 마당에서 잔치해요! (창고에 남은 음식으로)"**. At 18:00 residents walk to the fire, sit, eat (food icons pop, hearts). Next morning: **"어제 잔치에서 생선구이 46개, 빵 20개를 나눠 먹었어요"** |
| Tag | **쓰기** (0 coins) · sector 물류 (창고 food row); v4.6: the 행복 tab |
| When | every game day at `hour` 18:00 if the 창고 holds ≥ `minFood` 30 food; ends at 19:00 (one game hour = 25 s) |
| Where | **마을 마당 모닥불** (`life.areas.green_fire` (740, 1610), fire (740, 1575)), its log seats and the picnic table (all existing) |
| Food | ≤ `maxFood` 90 a feast, 2 per guest, 70 % of the residents come: ≈ 45–90 foods a day (45 → 60 residents) = **≈ 5–9 a minute** on average. Order: 구운 생선 and 빵 first; 훈제 고기 only while the 판매대's meat shelf is ≥ 50 % (R2: smoked meat is short) |
| Carriers | the logistics crew pool (v4.2 touch; carry draft DL4 / DL5: a feast-table sink on the 물류 게시판, fed from the 창고 tier) — priority 44, open 17:00–19:00, below SHELF_LOW 45 so empty shelves still come first |
| Pile effect | the 창고 stops filling with cooked fish (13.5 a minute go in today; census average 161–172 of 300), so the grill and oven outputs keep draining into it: indirectly ≈ +4–6 fish and +2 wheat a minute from the piles |
| Happiness | v4.6: counts as an event for the 즐길 거리 need (+15 each attendee that day). Never the 읍 bar (R8) |
| Unlock | after 마을 완성 + 창고 + 마을회관 (the board announces it) |
| Art | none: log seats, campfire, picnic table, food icons, `PartyEvent`'s gathering and hearts (`VillageLife`) |

### D4 · 대장간 2단 · 무쇠 난로 (살림살이 1단계) — the toolsmith casts stoves while it waits for tool orders

| | |
|---|---|
| Player reads | Pad **"대장간 2단 · 난로 틀"** with sub-line **"대장간이 쉬는 동안 무쇠 난로를 만들어요"**. Delivery toast: **"○○네 집에 난로가 들어왔어요! 따뜻해요"**. That house's chimney puffs twice as often and its window glows warm after 18:00. News: "난로를 들인 집 12채" |
| Tag | **팔기** (homes, 철물점, 금방) + **보내기** (overflow to the 물류창고) · sector 공업 |
| Recipe | **주괴 2 + 판자 1 → 무쇠 난로 1** (`item_stove_iron`), 6 s, only when `pickTool()` finds no tool wanted (tools keep priority). The 대장간 is busy 38 % late (S25 / S35: 0 %, "no order") → ≈ 6 stoves a minute of free capacity |
| Buyers (priority) | ① **homes without a stove** — each house is a sink (SHOP 35, room 1), the house pays on delivery like a 금방 home order; ② **솔방울 철물점** (`hardware_store`) adds the stove to `sells` (inland buy every 40 s + visitors; station porters restock as today); ③ **금방** (weight 0.1, ≤ 1 per order, 금방 price 24); ④ overflow: output ≥ 70 % and nobody wants it → dock surplus → 물류창고 goods racks (0.6 × 30) |
| Expected rate | homes ≈ 15–25 one-off over ≈ 10 minutes, then each new house; 철물점 ≈ 1.5; 금방 ≈ 0.3; overflow the rest → **≈ 3–4 stoves a minute = 6–8 ingots + 3–4 planks** |
| Price | **30** (inputs at the 교역소: 2 × 10 + 5 = 25) → ≈ **+17 a minute** (+0.9 points) |
| Unlock | after 읍, when the 대장간 was idle ("no order") ≥ 60 % over `offerIdleS` 180 s → pad, `cost` 1,500 |
| Carriers | the 도구 짐꾼 (p1, idle 100 % at mid-game) and the touch's 도구 짐꾼 2 → homes; station porters → 철물점 / dock |
| Happiness | v4.6: the 집 need +10 for that house's residents (capped at 100, like 돌집 +10) |
| Art | `item_stove_iron` exists (`lgx_items`, shipped, 0.3 MiB; make it resident once the pad is bought); chimney puffs = `House.smoke` (existing); window glow = the existing night glow sprite, NORMAL blend |
| What it does **not** do | drain the ore pile: ingots already sell without limit at the 교역소. It turns 7 of the ≈ 76 ingots a minute into something residents use |
| Plan conflict | v8 `logistics/tuning.js` prices `item_stove_iron` 90 as a 가전 공장 product (주괴 3). Proposal: the stove stays a 대장간 product at 30; v8's 가전 공장 list keeps radio · washer · fridge · TV (the v8 owner decides) |

### D5 · 가공소 3단 (용광로 · 훈제장 3단) — only where processing, not carrying, is the limit

| | |
|---|---|
| Player reads | Pad **"제련소 3단 · 용광로"** / **"훈제장 3단"**; banner **"광석이 계속 남아요 → 제련소를 용광로로!"** |
| Tag | **팔기** (ingots → 교역소; smoked meat → 판매대, then 물류창고 food) · sector 광업 / 사냥 |
| Trigger | after 읍, the line's pile ≥ 90 % for a total of `offerFullS` 120 s **while** its station's input is full and its operator busy ≥ 90 % — i.e. processing-limited. It never appears where carrying is the problem (S25 / S35, or before the carry fixes) |
| Effect | `timeMult` 0.66 → **0.5**: smelter / smokehouse cap 76 → 100 a minute |
| Cost | 용광로 2,400 · 훈제장 3단 2,600 |
| Drain | ore +16 a minute (potential 92); meat +4–16 (potential 80–92) |
| Coins | 용광로 **+162** (+8.8 points); 훈제장 3단 **+50 to +194** (+2.7 to +10.5) |
| Art | none (the 2단 look; one more `fx_smoke_puff` and a brighter fire glow) |
| Band-safe alternative | skip 3단: the ore / meat the stations cannot take leaves raw through 금방 집하 (v4.3 sled, piles ≥ 85 %) and the carry draft's 자재창고 / raw yard at 1–3 coins (`depot.rawPrice`) |

---

## 4. Later stages (v5–v8): the final-customer ladder

These keep every raw sunk as later versions add supply and people. Each reuses an existing plan's art and module.

| # | Consumer (player name) | Stage / trigger | Inputs → product → buyers | Why then, not now | Art |
|---|---|---|---|---|---|
| D6 | **가구 공방** (살림살이 2단계) | v5 (도시 ladder), when wood grows: planks reach the 교역소 ≥ 60 a minute for 5 min (after 이직 moves idle fishermen / hunters to the forest) | `chains.js` Producer (`src/city/logistics/model/chains.js`): 판자 3 → 의자 · 탁자 · 소파 · 침대 · 옷장 (least-stocked next). Homes get 탁자 + 의자 first (v4.6 집 need +10 more), the 솔방울 **목공소** gets a furniture shelf, 금방. Prices for v5 at half of v8's list (의자 12 · 탁자 20 · 소파 35 · 침대 40 · 옷장 45 ≈ 9.4 a plank vs 5 at the 교역소); v8 may raise them | planks are short today (sawmill starved 45 %): a furniture line would only take planks from the 교역소 | `lgx_producers` (`furniture_workshop`, 5.4 MiB, paged near the workshop, +1–2 files); items in `lgx_items` (shipped) |
| D7 | **주민 장보기** | v5 (`story_runtime` people records) | residents' daily errand buys 1–3 items at the 판매대 / 포장마차 / 잡화점 (real residents, not doll guests) | needs v5's one-record-per-person | none |
| D8 | **정육점 · 소시지** | only if the meat pile stays ≥ 50 % after 훈제장 3단 (more hunters / a 2nd hunting ground in v5+) | raw meat to households and the 포장마차 (소시지: 생고기 2 → 3) | smoked meat sells out today (판매대 meat empty 8–42 %); a new meat buyer would empty it more | `item_sausage` would be new (1 icon) |
| D9 | **수산시장 · 수출선** | v6 갈매기 항구 (planned: auction ×1.5, exports ×2) | raw / cooked fish at the auction; can and smoked-meat crates (`item_crate_cans`, `item_crate_smoked`) by ship | the harbour plan already has it | `fish_auction`, `harbor_market` (v6 art), crates in `lgx_items` |
| D10 | **케이크** (빵집) | v6 (sugar imports) | 밀 + 설탕 → 케이크 for the 카페, the 큰 식당 and weddings | no sugar before v6 | `item_cake` (`life2_items`, shipped) |
| D11 | **해변 먹거리** | v7 햇살 해변 (7 beach shops) | fish / meat / bread at the beach BBQ and stalls | the beach plan | `seafood_bbq`, `corn_stand` (v7 art) |
| D12 | **가전 공장 · 물류센터** (살림살이 3단계) | v8 as planned (`docs/v5_v8_plan.md` §6.6) | 주괴 3 → radio · washer · fridge · TV; `houseLv3`; the centre's vans take over home deliveries | the plan's own stage | `lgx_producers`, centre layers |

The **살림살이 ladder** is the long-running final customer: every home goes 난로 (v4.x, ingots + planks) → 가구 (v5,
planks) → 가전 (v8, ingots). New homes (settlers, babies, apartments) keep it going after each wave.

---

## 5. Does every raw have a sink at every stage?

"≥ potential" = the sinks can take what the gatherers bring when they never wait (the pile stops filling).

| Stage | 생선 | 통나무 / 판자 | 밀 / 빵 | 광석 / 주괴 | 생고기 / 훈제 고기 |
|---|---|---|---|---|---|
| 0–20 min (village building) | supply-limited (1 fisherman, grill starved 47 %) — **no change** | supply-limited — no change | supply-limited — no change | the pile fills before the ore porter (16.6 min) — no change (R1) | supply-limited — no change |
| 20–35 min (S25) | grill starved 50 %: no demand needed | short | short | **carrying**: one ingot porter, ≈ 33 a minute (carry draft) | **carrying**: 판매대 meat empty 42 % (carry draft) |
| 35–50 min (S35, → 읍) | fish pile 77 %: **D1** offered; the link + can exports (carry); **D2** from 5 shops | short → 이직 (carry draft DL6) | oven blocked 24 %: **D2**, the touch's restaurant | carrying + 금방 집하 (v4.3) | carrying + 금방 집하 |
| 50–100 min (읍 → 도시) | D1 + **D3** feast + cans: **≥ potential** | short until 이직 | D3 bread + miners eat more: **≥ potential** | **D5** 용광로 by need (or raw export); **D4** stoves as content | **D5** 훈제장 3단 by need |
| v5 도시 (100+) | D7 주민 장보기 | **D6** 가구 공방 | D7 | D4 stoves for new homes | D8 only if surplus |
| v6 항구 | D9 auction, cans by ship | exports ×2 | D10 케이크 | exports ×2 | smoked crates by ship |
| v7 / v8 | D11 beach | furniture → 물류센터 | — | D12 가전 공장 | D11 beach BBQ |

---

## 6. Census effect: the piles (estimates to be measured)

Model: a pile's ≥ 90 % share follows the ratio r = gatherer potential ÷ total take, fitted to run L (wheat r 1.05 →
11 %, meat 1.24 → 70 %, ore 1.58 → 63 %, fish 1.59 → 72 %, log 0.56 → 0 %): it is ≈ 70 % once r ≥ 1.2 and drops to the
≈ 0–15 % band once r ≤ 1.0. The "≈ 0–15" cells below are that band (porter timing keeps some spikes); "any" assumes the
piles are independent. The carry rows are the sibling draft's own targets (`docs/logistics_draft_carry.md` §5.8: L0 =
raw porters stay on their line, L1 = + 자재창고, 물류 게시판, 이직); the demand rows add this draft's take on top.

| Scenario | fish | log | wheat | ore | meat (P 80 / 92) | any pile ≥ 90 % |
|---|---|---|---|---|---|---|
| v4.2 measured: run L / census `g60` | 72 / 53 | 0 / 6 | 11 / 11 | 63 / 57 | 70 / 76 | 97 / 93 |
| v4.3 금방 alone (its own census with the real `Depot.js` rules, no carry fixes; from 60 · 68 · 79) | 24 | — | — | 31 | 57 | 86 (Lv1) · 64 (2 sleds) |
| carry draft L0 / L1 (its targets) | 72 / ≤ 50 | 0 | ≈ 11 | ≤ 40 / ≤ 30 | ≤ 60 / ≤ 40 | not given |
| L1 + D1–D4 (*model*: +28–30 fish a minute of take, wheat take +2) | **≈ 0–15** | 0 | **≈ 0–10** | ≤ 30 | ≤ 40 | ≈ 55–65 |
| L1 + D1–D4 + D5 where offered (*model*) | ≈ 0–15 | 0 | ≈ 0–10 | **≈ 0–15** | **≈ 0–15** | **≈ 20–50** |
| D1–D4 alone, no carry fixes (*model*) | ≈ 20 | 0 | ≈ 2 | ≈ 70 | ≈ 69 | ≈ 93 |

Reading: **demand alone does not move the gate** (last row): ore and meat need carrying first. With carrying fixed,
D1–D4 empty the fish and wheat piles (the carry draft leaves fish at ≤ 50 %: fish is the one raw that needs buyers);
the ore and meat piles need the carry draft's 자재창고 / 금방 sled, and 3단 where processing is the limit. The ≤ 50 %
"any pile" gate is reachable with all three.

Other census rows (estimates): 판매대 empty — bread unchanged or slightly up (the touch and the miners eat more bread;
D1 takes no wheat by design), smoked meat down with the carry fixes (D3 takes meat only above a 50 % shelf); 창고
average down from 161–172 to ≈ 80–120 (D3); grill / oven outputs ≥ 90 % down (D1–D3 + the touch).

---

## 7. Income: the band, and what to do about it

### 7.1 Coins per consumer (late village, created coins a minute; 1 point = 18.5 coins of v4.1's 1,851)

| Consumer | Tag | Coins a minute | Points | Notes |
|---|---|---|---|---|
| D1 포장마차 | 팔기, 동네 값 | +55 | +3.0 | 27.6 skewers × 2 |
| D2 surplus-first cards | 보내기 | +11 | +0.6 | 3 cooked fish × 0.7 × 4 × 1.3 |
| D3 저녁 잔치 | 쓰기 | 0 | 0 | food the 창고 could not sell |
| D4 무쇠 난로 | 팔기 + 보내기 | +17 | +0.9 | 3.5 × 30 − 7 ingots × 10 − 3.5 planks × 5 |
| **D1–D4** | | **+84** | **+4.5** | census 2,470 → ≈ 2,555 (**+33 % → ≈ +38 %**) |
| D5 용광로 | 팔기 | +162 | +8.8 | +16 ingots × 10 |
| D5 훈제장 3단 | 팔기 | +50 to +194 | +2.7 to +10.5 | +4–16 smoked × 12 |
| **D1–D5** | | **+296 to +440** | **+16 to +24** | ≈ +49 % to +57 % |

For the whole logistics update add the sibling drafts: the carry draft's L0 ≈ +15–22 % on the automation-only run
(`logistics_draft_carry.md` §5.8; ≈ +325–475 a minute = +18–26 points of v4.1; less in the census, where the bot chief
already carries) and the touch's restaurant (not yet measured). The carry draft's Q3 asks to decide prices with this
draft's numbers: §7.3 is that joint proposal.

### 7.2 Why the band cannot hold as it is

The +15–30 % band was set when the surplus *waited*. Every raw that now sells instead of waiting creates coins (4–12
per raw processed and sold); draining the piles at today's prices is worth +35–40 points on its own. The pile gate
(≤ 50 %) and the income band pull in opposite directions once the surplus moves, and the v4.2 census is already 3
points over. The v4.2 plan's own levers (`freight.exportRate`, `depot.sell.rate`) move income by 1–2 points.

### 7.3 Recommendation (designer's decision)

1. **Before 읍 (20–50 min): keep the band.** Only D1 (by need, ≈ 30–35 min) and D2 (≈ 38 min) can be on: +55 to +66
   a minute for ≈ 10–15 minutes = ≈ 600–1,000 coins before the ceremony. If coins are the 읍 bar that finishes last
   (11,000), 읍 comes ≈ 0.3–0.5 min sooner, inside ±5 % (±2.4 min). The first 20 minutes do not change (R1).
2. **After 읍: let income grow, as the v5 ladder already expects** (`docs/v5_v8_plan.md` §3.3: 읍 ≈ 1,800 → 도시
   ≈ 3,500 at ≈ 100 min, ≈ +33 a minute per minute of play). v4.2 already runs ≈ 33 % above the ladder's 읍 point;
   with this update the late village runs ≈ 50–60 % above it (census basis, before the carry fixes' share). The v5
   plan says bots measure `I` and, when a milestone runs fast, tune rank bars → ceremony coins → `requestEvery` → build
   costs: so re-base v5's numbers on the `I` measured after this update instead of cutting the update back.
3. **Keep the hard guards** instead of the band after 읍: village complete ±5 %, 읍 ±5 % (the v4.4 pacing gates),
   longest wait ≤ 3.8 min.

If the designer keeps +30 % strictly, these levers belong to this draft (largest first):

| Lever | Points |
|---|---|
| D5 not offered; ore / meat surplus leaves raw (금방 sled, 자재창고, 1–3 coins) — piles then depend on carrying | −9 to −19 |
| D4 home stoves given by the village (쓰기, the house pays 0; the 철물점 / 금방 still pay 30) | −1 to −3 while homes are being furnished |
| D1 skewer 2 → 1 coin | −1.5 |
| D2 off (rotation as today) | −0.6 |

Even with all four, the carry fixes' gain remains: the band then needs re-basing anyway.

---

## 8. Art and budgets

### 8.1 New art (precise)

| Key | What | Size / layers | Pipeline | Files / texture |
|---|---|---|---|---|
| `stall_eomuk` | 포장마차 building for an S plot: orange-red tarp roof on poles, clear plastic side curtains rolled up, wooden counter with a square steaming pot of skewers, a paper lantern, 3 round stools; front −Y (customer side down-left, like `market_counter`); snow on the tarp edge | footprint 2.0 × 1.4 m (≈ 180 × 90 px diamond), frame ≈ 300 × 300; layers: body + `_glow` (lantern + pot light, NORMAL blend, shown from `lightsOn`) ; points: `inPoint` (fish pad, back-right), `shelfPoint`, `cashPoint`, `staffPoints` ×1, `customerPoints` ×3, `workSpot`, `fxPoints.steam`, `footprintPoly` | the props Blender pipeline (`tools/`, as `market_counter` / `tent_a`), judged at phone zoom 0.8–1.2, day and night | packed with the icon below in one small page `v43_food` (≈ 512 × 512, ≈ 1.0 MiB), on demand once the stall is offered (and with the plaza area afterwards): **+1 file** (artifact 457 → 458 of 480). Alternative: append both frames to `props_buildings` / `props_items` with the merge + guard (old frames byte-identical): 0 files |
| `item_eomuk` | item icon: a paper cup with two fish-cake skewers, a wisp of steam | the size of `item_fish_cooked`; one frame (shelf stack, carry stack, want bubble, 금방 app row) | same | (in the page above) |

### 8.2 Reused (no new art)

| Use | Existing art |
|---|---|
| D1 steam, sound, guests, owner | `fx_smoke_puff` (white), `sfx_sizzle`; town paper dolls (`townfolk` / `townfolk2`, shipped packed); owner = a townfolk elder doll with the `talk` / idle acts |
| D1 zero-art fallback | `market_counter`, `tent_a`, `lantern_string` |
| D2 | order cards, item icons |
| D3 | `log_seat*`, the green's campfire, `picnic_table`, food icons, `PartyEvent` hearts, notice board, 서리 소식 |
| D4 | `item_stove_iron` (`lgx_items`, shipped, 0.3 MiB), `House.smoke` chimney puffs, the night glow sprite, the 대장간 / 철물점 / 금방 as they are |
| D5 | the 2단 station look + `fx_smoke_puff` |
| Later | `lgx_producers` (가구 공방 / 가전 공장, 5.4 MiB paged), `lgx_items` furniture / appliances / crates, `item_cake`, harbour and beach buildings of v6 / v7 |

### 8.3 Budget check

- Files: +1 (or 0) for v4.x; D6 (v5) +1–2 for `lgx_producers` (the v5 lead's budget).
- Textures: +≈ 1.0 MiB near the plaza (plaza peaks 417.9–421.8 MiB in `texview2`; the tour peak 452.4 is at the depot,
  far from the stall), +0.3 MiB for `lgx_items` made resident with D4. Both stay under the 455 MiB must.
- CPU: one more `Market` with ≤ 6 queued guests and one station; the feast is a `PartyEvent` once a day. Guests reuse
  the doll pool and despawn off screen (as the 판매대's).

---

## 9. BALANCE and save (draft for the builder; Korean comments as in `balance.js`)

```js
  // =====================================================================
  //  (물류 손질) 새 손님 · 새 쓰임 — 남는 원료를 쓰는 곳 (docs/logistics_draft_demand.md)
  //  모두 '마을 완성' 뒤에만 켜져요 (처음 20분은 그대로예요)
  // =====================================================================
  demand: {
    // ── 눈꽃 포장마차: 남는 생선으로 어묵꼬치를 만들어 그 자리에서 팔아요
    //    site = 짓는 값 (코인 + 자재, 짓는 시간 초), offerFullS = 생선 더미가 90% 넘게 찬 시간이 모두 이만큼(초)이면 발판이 생겨요
    //    fishIn → out = 생선 몇 개로 어묵꼬치 몇 개, time = 한 번 만드는 시간(초), inputMax / outputMax = 생선 발판 · 선반 최대
    //    price = 어묵꼬치 1개 값 (동네 값: 싸게 — 수입이 너무 늘지 않게), inPrio = 생선을 받는 급한 정도 (화덕 60 보다 낮게: 화덕이 먼저)
    //    guestEvery = 손님이 오는 간격(초), hours = [시작 시, 끝 시, 손님 배율] (저녁에 제일 많이), wantMax / maxQueue = 사는 개수 · 줄
    stall: { site: { coins: 1200, item_plank: 10, item_ingot: 2, time: 8 }, offerFullS: 90,
             fishIn: 3, out: 4, time: 2.4, inputMax: 24, outputMax: 40, price: 2, inPrio: 42,
             guestEvery: 3.0, wantMax: 3, maxQueue: 6,
             hours: [[7, 11, 0.6], [11, 14, 0.9], [14, 17, 0.7], [17, 22, 1.6], [22, 7, 0.15]] },
    // ── 주문판: 정기 납품 주문을 고를 때 남는 물건을 먼저 (false 로 하면 예전처럼 차례대로)
    //    outAt = 가공소 출구가 이만큼(0~1) 넘게 60초 차 있으면 '남는 물건'
    cards: { surplusFirst: true, outAt: 0.8 },
    // ── 마을 저녁 잔치: 창고에 남은 음식으로 매일 저녁
    //    hour = 시작 시각, minFood = 창고 음식이 이만큼 넘을 때만, perGuest = 한 사람이 먹는 개수, attend = 오는 주민 비율,
    //    maxFood = 한 번에 쓰는 최대 개수, meatShelfAt = 판매대 훈제 고기가 이만큼(0~1) 넘게 있을 때만 훈제 고기도 내요
    feast: { hour: 18, minFood: 30, perGuest: 2, attend: 0.7, maxFood: 90, meatShelfAt: 0.5 },
    // ── 대장간 2단 · 무쇠 난로: 대장간이 쉬는 동안 주괴 2 + 판자 1 → 난로 1
    //    cost = 발판 값, offerIdleS = 대장간이 쉰 시간이 모두 이만큼(초)이면 발판이 생겨요 (읍 뒤), time = 한 개 만드는 시간(초),
    //    price = 난로 값, homeHappy = 난로가 들어간 집 주민의 '집' 행복 + (v4.6 주민 행복도)
    stove: { cost: 1500, offerIdleS: 180, ingot: 2, plank: 1, time: 6, price: 30, homeHappy: 10 },
    // ── 가공소 3단 (용광로 · 훈제장 3단): 원료가 계속 남는데 가공소가 쉬지 않고 일해도 모자랄 때만 (읍 뒤)
    //    timeMult = 한 개 만드는 시간 배율 (0.5 = 2배 빨리; 2단은 0.66), offerFullS = 더미가 가득 찬 시간이 모두 이만큼(초)
    station3: { timeMult: 0.5, offerFullS: 120, busyAt: 0.9, costs: { smelter: 2400, smokehouse: 2600 } },
  },
```

`balanceCheck.js` ranges: prices and costs integers ≥ 1; `timeMult` 0.3–1; `hours` multipliers 0–3; `inPrio` 1–99.
New item `item_eomuk` in `items.js` `ITEMS` (save) and its price via `BALANCE.demand.stall.price`; 금방 `tuning.catalog`
/ `shopPrice` / tastes get `item_eomuk` and `item_stove_iron`.

**Save slice `demand` v1** (≤ 1 KB, no `SAVE_VERSION` bump, like 금방's slice; registered in the v4.4 slice registry if
that lands first):

```js
demand: { v: 1,
  off: { stall: 1, forge2: 0, smelter3: 0, smokehouse3: 0 },   // offers shown (once per save)
  stall: { b: 1, fish: 12, sk: 30, q: 3 },                      // built, fish on the pad, skewers on the shelf, queue
  forge2: 1, s3: { smelter: 0, smokehouse: 0 },                  // bought upgrades
  stove: ['house_3', 'lotH1'],                                  // homes with a stove (≤ 64 ids)
  feast: 12,                                                    // last game day with a feast
  tot: [skewers, stoves, feastFood] }                           // for 서리 소식 and the hub
```

Absent slice = nothing built or offered; a stall built in a save that later loses the art falls back to the zero-art
counter. Items on the stall's pads are saved like a station's stacks.

---

## 10. How these show in the 마을 경영 hub (one window)

Agrees with the flow map §9 and the carry draft §7–§8: **one hub "마을 경영" (tabs 현황 · 일꾼·짐꾼 · 물류; in v4.6 it
becomes the 마을 panel with 등급 · 행복), no new window, no new HUD button.** Each consumer is a row in one of the carry
draft's eight sector cards (`StockLedger.register` with a sector tag), read by the same `LedgerRows` renderer as the
office 재고 tab. The cards' blue 남음 chip ("살 사람이 모자라요") points its 가 보기 at this draft's offer pads when they
exist (fish surplus → the 포장마차 pad; idle 대장간 → the 2단 pad; processing-limited pile → the 3단 pad).

| Consumer | Sector card | Row shows | Status chip | 일꾼·짐꾼 filter |
|---|---|---|---|---|
| D1 포장마차 | 상업 (input row on 어업) | guests a minute, skewers sold, shelf n / 40, fish in | red when the shelf is empty ≥ 30 s while the fish pile has fish → "생선이 안 와요 ← 생선 짐꾼" | fish raw porter, the owner |
| D2 cards | 물류 (exports and orders) | the current card, "남는 물건" ribbon | — | station porters |
| D3 잔치 | 물류 (창고 food row); v4.6: 행복 tab | next feast, last feast's food, 창고 food | yellow (never red) when 창고 food < 30 at 17:00 → "잔치 음식이 모자라요" | crew pool |
| D4 난로 | 공업 (대장간: tools · stoves); v4.6: homes n / N in the 행복 tab | stoves made, homes with a stove | — | 대장간 operator, 도구 짐꾼 |
| D5 3단 | 광업 / 사냥 | station busy %, pile ≥ 90 % | blue: "광석이 계속 남아요 → 용광로" (the offer condition) | — |

The carry draft's 공업 card names "가전 공장 · 가구 공방": in v4.x it lists the 대장간 (tools, stoves) and the 통조림 공장;
the 가구 공방 joins in v5 (D6) and the 가전 공장 in v8 (D12).

---

## 11. Code touch points (for the builder; nothing changed here)

| Area | Change |
|---|---|
| `src/entities/Workshop.js` / a small `Stall` station | single-input station `fish → item_eomuk` (3 → 4), input sink priority `demand.stall.inPrio`; toolsmith: a second recipe `stove` when `pickTool()` returns nothing and `forge2` is bought |
| `src/scenes/Game.js` | `makeStall(site)` = a `Market` like `makeStore` (`goods: ['item_eomuk']`, `spawnEvery` × the hour table, `wantMax`, `maxQueue`, shelf = the stall's output) |
| `src/systems/LineUpgrades.js` | three offers: stall (fish pile full), 대장간 2단 (idle), 3단 (processing-limited); one banner each, once per save |
| `src/systems/Growth.js` | standing-card pick by surplus score (`StockLedger.status`, outputs, 창고) when `demand.cards.surplusFirst` |
| `src/systems/VillageLife.js` | `FeastEvent` (a `PartyEvent` at `green_fire`, 18:00–19:00); residents' `eat` act at the stall in the evening |
| `src/systems/Logistics.js` (sinks only, no rule change) | stall input (42), feast table (44, 17–19 h), each home's stove room (SHOP 35) |
| `src/entities/House.js` | `stove` flag: puff twice as often, warm window glow after `lightsOn`; save list |
| `src/entities/Station.js` | `station3` time multiplier for smelter / smokehouse |
| `src/data/world.js` | plot `v43_stall` ≈ (480, 990), S, `only: 'stall'`, shown by the offer |
| `src/systems/StockLedger.js` | register the stall (pad, shelf), stoves, feast with sector tags |
| `src/systems/VillageNews.js`, `strings.js` | feast / stove / stall lines (Korean + English) |
| `src/geumbang/tuning.js` (v4.3 owner) | catalogue + tastes for `item_eomuk`, `item_stove_iron` |

Tests to add: stall offer only after 마을 완성 with a full fish pile; the stall never takes fish while the grill input
has room; it sells and saves; feast at 18:00 only with ≥ 30 food, no meat below a 50 % meat shelf; tools before
stoves, one stove per home, save round-trip; 3단 offered only when processing-limited (never at S25 / S35); `fresh25`
(first 20 min unchanged), the census `g60` and run L probe with touch + carry + D1–D4, then + D5; the pacing bots
(읍 ±5 %).

---

## 12. Ideas considered and not chosen

| Idea | Why not |
|---|---|
| 돌길 닦기 (pave streets with ore) | the 읍 ceremony already turns the streets to cobble for free (`RoadPaint` 읍 cobble, `RoadNet.upgrade`), and v5 to asphalt |
| 눈길 자갈 (ore as winter grit, porters walk faster) | a new speed system that changes every carrying number; maybe later with the carry draft |
| Tools wear out (recurring tool demand) | a gatherer without a tool stops: a penalty, against the cosy rules |
| 못 (nails) as a building material | changes every site's cost, including the first 20 minutes |
| More 판매대 guests or a 4th food on the 판매대 | the same guests split their wants: no new demand, or coins without draining raws |
| A 2nd smelter / smokehouse building | same effect as 3단 but needs a plot, an operator and more carrying |
| 정육점 / 소시지 now | smoked meat sells out once carried |
| v8 가구 · 가전 chains in v4.x | planks are short until 이직; v8 prices would need re-tuning; +5.4 MiB art |
| 어묵 with wheat (생선 3 + 밀 1) | wheat is not in surplus after the touch; a two-input stall would stall when wheat is short |

---

## 13. Questions for the designer (asked in Korean; the default ships if no answer)

1. 포장마차: **어묵**(새 그림 2개)으로 할까요, 있는 그림으로 **생선구이 포장마차**로 할까요? — 기본: 어묵.
2. 어묵 값: **2코인**(동네 값)이 괜찮을까요? — 기본: 2.
3. **가공소 3단**(용광로 · 훈제장 3단): 수입이 +9~+19점 더 늘어도 괜찮을까요, 아니면 남는 광석·고기는 그냥 싸게 내보낼까요? — 기본: 읍 뒤에 "정말 필요할 때만" 발판.
4. **수입 목표**: 읍 전(20~50분)은 +15~30% 그대로, 읍 뒤는 수입이 늘어도 되고 대신 "처음 20분 · 읍 시각 ±5%"를 지키는 걸로 바꿔도 될까요? (v5 숫자는 바뀐 수입에 맞춰 다시 재요) — 기본: 그렇게.
5. 잔치 시간 **저녁 6시**, 장소 **마을 마당 모닥불**이 괜찮을까요? — 기본: 그대로.
6. 집 난로를 **주민이 사요**(30코인) 아니면 **마을 선물**(0코인)? — 기본: 주민이 사요.

---

## 14. Dependencies and measurement plan

| Needs | From | For |
|---|---|---|
| raw porters stay on their line and may take a local job ≤ 900 px (fish → grill · cannery · stall) | carry draft DL1 | D1's fish; the ore and meat piles |
| 창고 at village complete → 짐꾼 2 earlier (smoked meat at 25–35 min) | carry draft DL2 | the meat shelf before D3 / D5; D3's 창고 |
| fish → cannery by the pool; can exports reach the train / 물류창고 | carry draft DL5, §5.7 | the fish pile |
| 자재창고 (raw buffer, `cross_s`), crew by need | carry draft DL3, DL4 | the band-safe alternative to D5; D3's carriers |
| 이직 of idle fishermen / hunters to the forest | carry draft DL6 | D6 (v5) and the plank supply |
| sector cards, why-chain, 가 보기 to offer pads | carry draft §7 | §10 |
| 큰 식당 demand | v4.2 touch | cooked fish / bread numbers (§1, §6) |
| 금방 집하 and catalogue | v4.3 | ore / meat piles, D1 / D4 extra buyers |

Measure, in this order, with the flow map's tools (`econ/probe.mjs` run L, census `g60`, `fresh25`, the pacing bots):
the touch → + carry → + D1–D4 → + D5. Report each pile's ≥ 90 % share, "any pile", the 판매대 empty shares, the 창고
average and income against v4.1's 1,851.
