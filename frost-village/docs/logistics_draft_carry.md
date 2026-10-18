# Logistics draft — the carrying side (창고 · 물류 직원 · 물류 게시판 · 일꾼·짐꾼 관리 · 산업 현황)

Logistics designer's draft for the designer's direction (원자재 수요 · 짐꾼 · 물류창고 · 일꾼/짐꾼 관리창 · 산업별 현황창).
It covers **points 2–7** of the brief: carrying capacity, warehouses that exist early, a logistics crew that grows with
production, a real source → sink system, the 일꾼·짐꾼 management window with 이직, and the sector status views, plus the
answer to the designer's question "같은 항목으로 묶어야 될까? 따로해야 할까?". Point 1 (more demand: new factories,
workshops, shops and customers) is in the parallel demand draft (`docs/logistics_draft_demand.md`). Where the two drafts
meet, this one only says how the carriers serve the new consumers.

- Inputs: `docs/logistics_flow_map.md` (measured flows, run L / S25 / S35, all numbers below without a source are from
  it), `docs/build_reports/v42_code2.md` §3 / §9 (pacing, perf, textures, files), `docs/v44_plan.md` §16 / §19 (HUD,
  shell panel, 마을 panel, D13), `docs/geumbang_plan.md` + `docs/build_reports/geumbang_module.md` (금방 집하),
  `docs/기획서_v4_2_촌장.md` §2.3, and the code: `src/systems/Logistics.js`, `src/entities/Worker.js` (`Hauler`,
  `Porter`, `RawPorter`, `WarehousePorter`, `StationPorter`), `src/entities/Warehouse.js`, `src/systems/Surplus.js`,
  `src/systems/LineUpgrades.js`, `src/systems/StockLedger.js`, `src/systems/Progression.js`, `src/scenes/Game.js`
  (`hireWorker` / `hirePorter` / `hireRawPorter`, `noteMade`), `src/scenes/OfficePanel.js`, `src/data/balance.js`.
- The v4.2 touch is being built in the same tree. This draft reads its working state (`WarehouseCrew.js`:
  crew = 2 + made a minute ÷ 100, cap 6, free, never leaving; 짐꾼 2 on 8 lines, `fullForS` 45). `v42_touch.md` did not
  exist when this was written: re-check §4.4 against it.
- Nothing in `src/` or `tests` was changed. Scratch: `/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/carry_calc.mjs`
  (rate model, distances).

---

## 0. 디자이너용 요약 (쉬운 말)

**먼저 한 줄로:** 나르는 쪽은 **규칙 세 개만 고쳐도** 남는 원료 47개(1분) 중 약 40개가 가공되어 팔려요. 그다음에
창고를 일찍 주고, 자재창고를 새로 짓고, 물류 직원이 "일이 밀릴 때" 늘어나게 해요. 사람 관리와 산업 현황은
**한 창(마을 경영)** 에 묶어요.

1. **짐꾼은 자기 일을 먼저 해요.** 지금은 재료 짐꾼이 꽉 찬 더미의 원료를 멀리 있는 짐 싣는 곳(2,000~2,900걸음)까지
   걸어가요. 그동안 자기 가공소는 굶어요 (제련소 15 %). → 재료 짐꾼은 **자기 줄을 떠나지 않아요.** 남는 시간에는
   가까운(900걸음 안) 일만 해요.
2. **생선 통 → 통조림 공장 길을 이어요.** 통조림 공장은 생선 통이 72 % 차 있는데도 39 % 굶어요. 물류 직원이 생선을
   통조림 공장으로 날라요. 통조림 1분에 약 12개 더.
3. **창고를 일찍 줘요.** 지금은 남쪽 망루 뒤(약 32분)에야 지을 수 있어요. → **마을 완성(약 20분) 때부터** 지을 수 있어요.
   창고가 있어야 "짐꾼 2" 발판이 나오니까, 훈제 고기가 판매대에서 떨어지던 25~35분 문제(빈 시간 32~42 %)도 같이 풀려요.
   처음 20분은 그대로예요.
4. **자재창고를 새로 지어요** (마을 남쪽 갈림길, 광산과 사냥터 사이). 넘치는 원료(광석·고기·통나무·밀)와 공사 자재
   (판자 40개·주괴 20개까지 비축)를 보관해요. 공사장이 여러 곳이어도 자재창고에서 바로 가져가요. 가공소 입구가 비면
   자재창고에서 원료를 다시 채워 줘요. 그림은 지금 창고 그림 + 팔레트(판자·주괴·광석 더미) 그대로 써요.
5. **물류 직원은 만드는 양에 맞춰 "자리"가 생기고, 일이 밀릴 때만 와요.** 자리 수 = 2 + (1분에 만드는 양 ÷ 100),
   최대 6명 (지금 손질과 같아요) + 자재창고 2명. 다만 직원이 80 % 넘게 바쁘고 일이 밀려 있을 때만 한 명씩 걸어와요.
   지금 손질 규칙은 늦은 마을에서 바로 6명이 되는데, 실제로 필요한 건 4명쯤이에요. 한 번 온 직원은 떠나지 않아요.
   창고 직원과 자재창고 직원은 **한 팀**이라 서로 일을 나눠요. 집은 필요 없어요.
6. **물류 게시판:** "어디에 남는지"와 "어디에 필요한지"를 1초마다 한 장에 적고, 손이 빈 짐꾼이 가장 급하고 가까운 일을
   가져가요. 같은 물건이 창고 ↔ 자재창고를 왔다 갔다 하지 않게, 물건은 **앞으로만** 가요 (만든 곳 → 보관 → 쓰는 곳 → 수출).
7. **일꾼·짐꾼 관리 (이직):** 일꾼마다 "일해요 / 쉬어요(이유)"가 보여요. **두 번째·세 번째 채집 일꾼과 짐꾼 2는 다른 줄로
   옮길 수 있어요** (옮기기는 공짜, 한 번 옮기면 1분은 그대로). 각 줄의 첫 일꾼·재료 짐꾼·첫 상품 짐꾼·기술자는 줄을 지키는
   사람이라 고정이에요. 사냥꾼 1명 + 어부 1명을 숲·밭으로 옮기면 통나무·밀이 1분에 약 30개 늘어요. 한 줄에 채집 일꾼은
   최대 5명. "알아서 배치"를 켜면 1분에 한 명씩 노는 사람을 바쁜 줄로 옮겨 줘요 (처음엔 꺼져 있어요).
8. **산업 현황:** 어업 · 임업 · 농업 · 광업 · 사냥 · 공업 · 상업 · 물류, 카드 8장. 카드마다 잡기/팔림(1분), 사람 수와
   노는 사람, 막힌 곳 한 줄("살 사람이 모자라요", "짐꾼이 모자라요")과 **가 보기** 버튼.
9. **질문의 답: 같은 항목으로 묶어요.** 한 창 **"마을 경영"**, 탭 3개 **[현황] [일꾼·짐꾼] [물류]**. 빨간 카드의 원인은
   언제나 그 줄의 사람이라서, 카드를 누르면 바로 그 줄의 사람들이 보여야 해요. 따로 만들면 같은 줄이 두 창에 두 번 나와요.
   v4.6의 마을 판(등급 · 행복)도 이 창에 탭으로 들어가요 (창이 늘지 않아요).
   **화면 위에 새 버튼은 만들지 않아요** (360×640에서 왼쪽 칸이 이미 꽉 찼어요). 지금 있는 **인구 칸을 누르면** 열려요
   (노는 사람이 있으면 💤 숫자가 붙어요). 사무실 재고·직원 탭과 편지에서도 열려요.
10. **새 그림은 없어도 돼요.** 창고 그림, 팔레트, 일꾼 얼굴(이미 있는 128px 초상), 사무실 판·칩·상태 점을 다시 써요.
    네 번째·다섯 번째 채집 일꾼은 지금 모습을 다시 써요 (원하시면 직업마다 2명분 새 모습을 그릴 수 있어요 — 선택).

**정해 주실 것** (§13): ① 4~5번째 일꾼이 같은 모습이어도 괜찮은지 ② 창고가 일찍 나오면 돈이 조금 빨리 모여요 (읍이 몇 분
빨라질 수 있어요) ③ 수입이 지금도 목표보다 3 %p 높은데 고친 뒤 약 +15~22 % 더 올라요 (값을 같이 볼지) ④ 이름 "자재창고"
⑤ "알아서 배치"를 처음부터 켤지.

---

## 1. Decisions (this draft)

| # | Decision | Why (measured) |
|---|---|---|
| DL1 | **Raw porters never leave their line for export.** When their station input is full they may take a **local** job (≤ `raw.localPx` 900 px straight): raw into the 자재창고, or a workshop input that takes this raw. The CODE-1 spill (`RawPorter` load state: 창고 / dock) goes | The ore raw porter spends 21 % of its time walking ore 2,885 px to the dock while the smelter starves 15 %; the fish raw porter 20 % on 창고 runs; raw at the dock is worth 1–3 coins |
| DL2 | **The 창고 card unlocks at village complete** (`BUILD_UNLOCK.warehouse`: `r:south` → `hire_hunter`); the `warehouse` goal moves up in `GOALS` to right after `toolsmith`; a 창고 plot near the plaza appears at village complete | "창고는 초반에": the 창고 stands at ≈ 32 min today. 짐꾼 2 (F4) needs the 창고 (`LineUpgrades.f4Due`), so the 25–35 min smoked-meat gap (shelf empty 32–42 %, smokehouse blocked 24–42 %) is a carrying gap that only opens late because the 창고 is late |
| DL3 | **New 자재창고** (raw + building materials, 400) on a new M plot at the south crossroads (`cross_s`, between the mine and the hunting ground), card after the 창고 stands and a measured need. It keeps a **reserve** for sites (판자 40, 주괴 20) and **backfills** station inputs. Art: the `warehouse` sprite + `pallet_*` props | "자재창고 크게 지어서 그쪽으로 옮겨도": the 창고 refuses log / wheat / ore / raw meat (`Warehouse.STORABLE`), so the village has no raw buffer; ore and meat (the two largest surpluses, 12.3 and 16.5 a minute) are 400–750 px from `cross_s` instead of 1,850–2,900 px from the dock |
| DL4 | **Crew seats grow with production (the touch's rule), crew members arrive by need.** Seats = 2 + ⌊made a minute ÷ 100⌋ (cap 6) at the 창고, + 1 (cap 2) at the 자재창고; one walks in only while the crew is ≥ 80 % busy and jobs wait. Never leaves. **One pool** for both buildings | Production alone reaches the cap at once (late ≈ 580 made a minute → 7 → 6; S35 ≈ 456 → 6), but the measured work after DL1–DL3 needs ≈ 4 (§4.2). Sizing by production only spends 2 agents on nothing |
| DL5 | **One 물류 게시판 (`HaulBoard`)**, rebuilt once a second: every source with something to give × every sink that wants it (the `Logistics` sinks). Porters **pull** a job when idle. Items only move forward through tiers (make → buffer → use → exit); buffers never feed buffers | Destinations are pooled today (`Logistics.best`), sources are not; the two measured gaps (fish never reaches the cannery; raw walks to the dock while a station starves) are source gaps (flow map §10, row 5) |
| DL6 | **이직**: the 2nd / 3rd gatherer of a line (`hire2_*`, `hire3_*`) and every 짐꾼 2 (`v42.lines.p2`) can move; each line's first gatherer, its raw porter, its first goods porter, operators and station porters are fixed; the crew is a pool (no moving needed). Free, 60 s cooldown, ≤ 5 gatherers a line | The idle people are gatherers (fishermen 39 %, miners 35 %, hunters 46 %) while lumberjacks and farmers are short; porters are 97–99 % busy (flow map §7) |
| DL7 | **알아서 배치** (auto-assign): off by default; at most one move a minute; never hires; never touches a person the chief moved in the last 5 minutes; never changes crew seats | Hysteresis against thrashing; the chief's choices stay his |
| DL8 | **One window "마을 경영"** with tabs **현황 · 일꾼·짐꾼 · 물류**; in v4.6 it *becomes* the 마을 panel (+ 등급 · 행복 tabs). **No new HUD button**: the popBox (인구 칸) becomes its door, with a 💤 badge | Same rows seen from two sides (§8.1); `v44_plan.md` D13: the left column is full at 360×640 |
| DL9 | **No new art required.** Optional: 2 more looks per gathering profession (10 renders) if the designer does not want repeated looks | Every element has existing art (§10) |
| DL10 | **Save**: one additive slice `haul` v1 (≤ 600 B), no `SAVE_VERSION` bump; absent = today's binding | Same pattern as `geumbang`; older saves load unchanged |
| DL11 | **Versions**: **L0** (DL1, DL2, DL4's need gate) ships right after the touch or with v4.3; **L1** (DL3, DL5, DL6–DL8, the hub) is one version ("v4.3.2 물류") that brings `Shell.js` forward from v4.4; v4.6 adds its tabs to the hub | L0 is three small rules with measured effect; L1 needs the shell panel |

---

## 2. What the numbers say for carrying

Run L, late village, automation only, per game minute (flow map §4, §6).

| Raw | Caught | Processed | Station cap (2단) | Surplus | Why it is not processed | Carry fix | Raw absorbed after the fix |
|---|---|---|---|---|---|---|---|
| 광석 | 63.3 | 53.6 | 75.8 | 12.3 | the smelter starves 15 % while its raw porter walks ore to the dock | DL1 (raw porter stays) | **≈ 12** (caught < cap) |
| 생고기 | 74.4 | 57.5 | 75.8 | 16.5 | the smokehouse output is full 23 % (p1 + p2 carry 50 a minute on 1,300 px) | the pool carries the overflow straight to the 판매대 (F3 direct exists) | **≈ 16** (the 판매대 wants ≈ 69 smoked meat, sells 44) |
| 생선 | 59.3 | 46.5 | 113.6 | 12.8 | the grill output is full 54 % (cooked fish has no buyer); the cannery starves 39 % next to the fish pile | pool job fish pile → cannery input (INPUT 70) | **≈ 12** (cannery takes 69 fish a minute; ingots come first at INPUT 70) |
| 밀 | 52.1 | 45.5 | 82.6 | 5.5 | the bakery output is full 45 % (bread has no buyer) | — (demand draft) | 0 |
| 통나무 | 50.5 | 50.2 | 90.9 | 0 | short: the sawmill starves 45 % | 이직 (DL6): +≈ 30 logs / wheat a minute | — |
| **Total** | 299.6 | 253.3 | 438.7 | **47** | | | **≈ 40** |

So the carrying side alone turns ≈ 40 of the 47 surplus raw a minute into ingots, smoked meat and cans that sell
(교역소 no limit; 판매대 smoked-meat demand ≈ 69; 잡화점 ≈ 37 cans + tools, sells 19). The new goods need carrying too:

| New flow (a minute) | Route (walked) | Per porter (model §4.2) | Porters |
|---|---|---|---|
| +12 ingots smelter → 교역소 (2 porters already carry ≈ 50, the output then makes ≈ 66) | 1,730 px | 25 | 0.6 |
| +16 smoked meat smokehouse → 판매대 | 1,300 px | 31 | 0.5 |
| +12 fish fish pile → cannery input | ≈ 1,400 px (where the bots build it) | 29 | 0.4 |
| today's 창고 in / out (24–30) | 2,138 px | 19 (measured 12–15) | 1.4–2 |
| **Pool need** | | | **≈ 3–3.5 → 4 at 85 % utilisation** |

Income estimate from these (today's prices): +12 ingots × 10 + 16 smoked × 12 + 12 cans × 12 ≈ **+450 coins a minute
(+21 % over run L)**. The flow map's figure for its ranks 1–3 was +300–460. §13 Q3.

---

## 3. Warehouses

### 3.1 What each store is for

| Store | Where | Holds | Fed by | Feeds | Today | Proposed |
|---|---|---|---|---|---|---|
| 모아두는 곳 (5 piles) | beside each station (180–320 px) | 40 raw of its line | gatherers | its raw porter; the pool (§5) | the only raw buffer; full 63–72 % | unchanged size (§3.4); surplus leaves to the 자재창고 once it stands, not straight to the dock |
| **창고** (v3) | a plot near the plaza | 300 goods + raw fish (`STORABLE`) | the pool (outputs ≥ 60 %), the chief | shelves ≥ 45, sites, workshops, food box | ≈ 32 min | **village complete**; role unchanged (goods buffer) |
| **자재창고** (new) | south crossroads | 400: raw ≤ 60 % (log, wheat, ore, raw meat), 판자, 주괴 | raw porters (local), the pool | sites (SITE 100), workshops (INPUT 70), backfill (55), the reserve | — | §3.3 |
| 짐 싣는 곳 (dock) | station square (≈ 2,200–2,900 px from the piles) | train crates + surplus | station porters, the pool (exit jobs) | train, cargo sleigh, (v4.3) 금방 | the walk that costs 3 porters | exit only; raw reaches it from **one** source (the 자재창고) in bigger loads |
| 서리 물류창고 (v4.2) | rail district | 500 racks | cargo sleigh (60 a trip) | walk-in buyers 07–20 h, 금방's share | racks 14 / 500 | unchanged (§3.5) |
| 금방 hub (v4.3) | rail district | parcels | the racks | vans, dog sled | — | the sled's 집하 stops at the 자재창고 first (§5.7) |

### 3.2 창고 early

- **When**: the build card unlocks at village complete (`BUILD_UNLOCK.warehouse = 'hire_hunter'`; the first 20 minutes
  never see it). `GOALS`: `warehouse` moves from after `south` to right after `toolsmith`, so the arrow follows it after
  the 대장간 (the arrow-only player needs it; the smart bot builds it when it pays).
- **Where**: a new plot `v_wh` (M, region `start`, `after: 'hire_hunter'`, `only: 'warehouse'`) placed by the layout
  test (`tools/test/v42_layout.mjs` + a new check) ≤ 600 px from the 판매대 and the grill, off the market's customer
  path (`market.entry` x = 990). Any other M / L plot still works (saves that built it elsewhere keep it).
- **Cost**: unchanged (600 + 판자 14 + 주괴 4, 10 s). The 2 crew come with it, as today.
- **What changes with it**: the 짐꾼 2 offers (they need the 창고) can come from ≈ 22 min instead of ≈ 32 min; the pool
  exists for the 25–35 min carrying gap. Pacing risk: income earlier → re-run the pacing bot (gate: 읍 within ±5 % of
  v4.2's 46.5–47.3 min; if earlier by more, raise `v42.porter2.costs` for smelter / smokehouse first).

### 3.3 자재창고 (new)

| Item | Value (`BALANCE.logistics.material`, Korean comments in §4.1) |
|---|---|
| Card | after the 창고 stands **and** a measured need: a raw pile ≥ 90 % for 120 s in total, or a site waited 60 s for 판자 / 주괴 (one banner, once per save — the `LineUpgrades` offer pattern) |
| Plot | `v_mat` (M, region `start`, `only: 'material'`) beside `cross_s` (990, 2040) — candidates (1,090, 2,110) east or (880, 2,110) west of the crossroads; the layout test picks the first free one |
| Distances (straight) from (1,080, 2,060) | 고기 걸이 412 · 훈제장 358 · 제련소 502 · 광석 더미 709 · 밀 더미 904 · 오븐 908 · 제재소 945 · 통나무 더미 1,104 · 남쪽 부지 s_m1 848 · 짐 싣는 곳 2,209 |
| Cost | 900 + 판자 16 + 주괴 6, 10 s build |
| Holds | 400; raw ≤ 60 % (240), materials the rest; refuses goods (foods, cans, tools go to the 창고) |
| Reserve | 판자 40, 주괴 20 kept for sites: the sawmill / smelter porters fill it at `PRIO.RESERVE` 42 (after nearly empty shelves 45, before the 교역소 shelf 40) until the reserve is met; then nothing |
| Gives | sites and hire pads (SITE 100), workshop inputs (INPUT 70), **backfill** a station input below 50 % whose own pile is under 25 % (`PRIO.BACKFILL` 55), exits (raw over 60 % of its raw share: station porters / 금방 sled) |
| Takes | raw from a pile ≥ 85 % whose station input is full (`PRIO.YARD` 14, above SURPLUS 12): mostly the raw porters' local job (ore 709 px, meat 412 px); planks / ingots at RESERVE |
| Crew | 1 comes with it; pool seat +1 (cap 2) (§4) |
| Look | the `warehouse` sprite (resident with the 창고, `bld_buildings`), its label `자재창고 120/400`, three pallets beside the door from `lgx_items` (shipped): `pallet_planks`, `pallet_ingots`, `pallet_ore` (+ `pallet_logs` when it holds logs) — one baked pile like the 창고's |
| Save | contents in the `haul` slice (§11); the site in the existing sites / buildings save (a new building key `material`) |

Why one building for raw **and** materials: the designer's two wishes ("원자재를 창고로" and "판자는 공사현장이 한두 개가
아니잖아") meet at the same crossroads — the two biggest raw surpluses are next to it, and sites in the south / west / plaza
are 850–1,500 px away (closer than the sawmill → 교역소 → site chain). A second building would add a second crew and
display objects for little gain.

### 3.4 Not proposed: bigger piles

A "더미 넓히기" upgrade (pile 40 → 80) was considered: it lets gatherers work a little longer before they wait but stores
raw where nobody can use it. The 자재창고 holds the same raw where it can backfill a station and leave in one load. The
flow map's §2.3 option ③ stands: a full pile is a signal (the hub shows it as 💤 at the gatherers), not a failure.

### 3.5 서리 물류창고 (v4.2) role

Unchanged: the export market at the rail district (walk-in buyers, the cargo sleigh from the dock, 금방's share). Its
racks hold 14 / 500 and its buyers could sell ≈ 5× what arrives — the walk to the dock is the limit, not the depot.
Building it earlier was rejected: 6,000 coins + ≈ 23 MiB of `lgx_center_*` pages for no throughput gain.

### 3.6 Timeline (smart bot minutes)

| Minute | Today | Proposed |
|---|---|---|
| 0–20 | piles only | **same** |
| ≈ 20 (village complete) | — | 창고 card + `v_wh` plot |
| ≈ 22–28 | — | 짐꾼 2 offers (need the 창고); 자재창고 card (need + 창고) |
| ≈ 32 (south tower) | 창고 card | (already built) |
| ≈ 47 (읍) / ≈ 59 | 물류창고 site / built | unchanged |
| v4.3 | 금방 dog sled 집하 (piles ≥ 85 %) | first stop: the 자재창고 |

---

## 4. Logistics crew that grows with production

### 4.1 Rule and numbers

```
seats    = clamp(base + ⌊made a minute ÷ perMin⌋, base, cap)            (the touch's WarehouseCrew rule: production sets the seats)
           base 2 at the 창고 (+1 with the 자재창고), cap 6 (+ 2)
arrivals = how many have come (saved, never goes down)
one more walks in when arrivals < seats
                  and busy ≥ busyAt (share of the crew's time not idle, average over window s)
                  and backlog: a pool job waited unclaimed ≥ backlogShare of the last 120 s
                  and ≥ every s since the last arrival
```

```js
// ── (물류) 물류 게시판 · 물류 직원 · 자재창고 · 이직 (docs/logistics_draft_carry.md)
logistics: {
  // 물류 게시판: every = 몇 초마다 할 일을 다시 적을지, farPx = 이보다 먼 길은 minLoadFar 개 이상 모여야 나서요,
  //   batchPx = 같은 물건을 원하는 곳이 이만큼 안에 모여 있으면 한 번에 들러요,
  //   pileStart / pileKeep = 더미가 이만큼(0~1) 차면 남는 원료를 옮기기 시작하고, 이만큼까지만 줄여요,
  //   flapS = 보관한 곳에서 꺼낸 물건은 이 초 동안 다시 보관하지 않아요 (왔다 갔다 막기)
  board: { every: 1, farPx: 1200, minLoadFar: 6, batchPx: 300, pileStart: 0.85, pileKeep: 0.6, flapS: 60 },
  // 물류 직원: 자리는 만드는 양으로 (warehouse.crew), 사람은 일이 밀릴 때만 와요
  //   busyAt = 직원들이 이만큼(0~1) 넘게 바쁘고, backlogShare = 기다리는 일이 지난 2분 중 이만큼 넘게 있었을 때
  crew: { busyAt: 0.8, backlogShare: 0.5, window: 180 },
  // 재료 짐꾼: 자기 줄을 떠나지 않아요. 가공소 입구가 가득하면 localPx(px) 안의 가까운 일만 해요
  raw: { stayOnLine: true, localPx: 900 },
  // 자재창고: site = 짓는 값, cap = 넣을 수 있는 개수, rawShare = 원료가 차지할 수 있는 비율,
  //   reserve = 공사장을 위해 모아 두는 자재, crew = 같이 오는 직원 / 늘 수 있는 최대, needS = 더미 가득·공사장 기다림이 이만큼(초) 되면 짓기 카드
  material: { site: { coins: 900, item_plank: 16, item_ingot: 6, time: 10 }, cap: 400, rawShare: 0.6,
              reserve: { item_plank: 40, item_ingot: 20 }, crew: { base: 1, cap: 2 }, needS: 120, siteWaitS: 60 },
  // 이직: cooldownS = 한 번 옮긴 사람은 이 초 동안 그대로, perLineMax = 한 줄의 채집 일꾼 최대,
  //   알아서 배치: autoEvery = 몇 초마다 한 명, idleAt / idleForS = 이만큼 쉬는 사람을, stayS = 옮긴 뒤 이 초는 다시 안 옮겨요,
  //   respectS = 촌장님이 직접 옮긴 사람은 이 초 동안 건드리지 않아요
  jobs: { cooldownS: 60, perLineMax: 5, autoEvery: 60, idleAt: 0.5, idleForS: 180, stayS: 180, respectS: 300 },
},
```

(`warehouse.crew = { perMin: 100, cap: 6, window: 180, every: 60 }` from the touch stays where it is.)

### 4.2 How many porters a route needs

Per-porter rate, calibrated on the probe's trip records (one-way walked length `d`, load `L`, speed 150 px/s, 0.14 s an
item at each end): **R ≈ 60·L ÷ (d/75 + 0.28·L)** items a minute. Within 25 % of every measured carrier:

| Carrier | d walked | L | Model | Measured |
|---|---|---|---|---|
| raw porter, pile → station | 220 | 4 | 59 | 50–60 |
| goods, smokehouse → 판매대 | 1,300 | 10.5 | 31 | 25 |
| goods, smelter → 교역소 | 1,730 | 11 | 25 | 25 |
| 창고 crew | 2,138 | 10 | 19 | 12–15 (part loads) |
| station porter → dock | 2,569 | 8.4 | 14 | 14 |

Porters a flow needs = flow ÷ R. Example: the ore + meat surplus (28.8 a minute) walked to the dock (2,700 px) needs
**1.9 porters**; walked to the 자재창고 (≈ 700 px) **0.6**, and it leaves from there in one load. This is why the crew
should size itself by need (which already contains the distances), with production only setting the ceiling.

### 4.3 How they come, where they live, what they do

- **Arrive** as in the touch: from the nearest off-screen village entry, walking the roads, banner `물류 직원이 왔어요`
  (≤ 1 a minute) and a line in the next 서리 소식. The 자재창고's first one comes with the building (like the 창고's 2).
- **Home**: the building with the larger backlog when it arrives (`WarehousePorter.homeFor` rows; the 자재창고 gets the
  same row table). Home is only where it waits: **the pool works for both buildings** (`HaulBoard` jobs from either).
- **Housing**: none. Crew, gatherers and porters do not count toward `population3` (as today); no softlock where a full
  village blocks a needed porter. (v4.6 may count "일자리 있음" in resident happiness; out of scope.)
- **Leaving**: never (as the touch). A seat freed by 이직 is not re-filled (seats count arrivals, §6.6).

### 4.4 With the v4.2 touch

| Touch (being built) | Keep | Change in L0 |
|---|---|---|
| `WarehouseCrew.target()` = clamp(2 + ⌊rate ÷ 100⌋, 2, 6) | the seats formula, `noteMade` counting, the walk-in, the banner, `v42.crew` save | `update()`: arrive only when `busy ≥ busyAt` and the backlog test (§4.1) hold — `busy` = share of crew samples not in `idle` (the touch's `WarehousePorter.state`), EWMA over `crew.window`; backlog = `HaulBoard.unclaimed()` (L1) or, in L0 before the board, "an output ≥ `overflowAt` or a pile raw job had no free crew for ≥ 60 s" |
| 짐꾼 2 on 8 lines, `fullForS` 45 | yes; they are the movable porters of §6 | — |
| 큰 식당 back tables, server 2 | (demand side) | — |
| Saves made with the touch (crew already 6) | keep their 6 | — |

### 4.5 Perf budget

| Item | Now (late village, `v42_code2.md` §9.2) | Budget for L0 + L1 | How |
|---|---|---|---|
| Agents | touch: 창고 crew 6 | net **≤ +1** | need gate: ≈ 4 at the 창고 instead of 6, + 1–2 at the 자재창고 |
| Display objects | plaza 1,653, zoom 0.6 1,810 (gate 1,700; 금방 adds ≤ +120) | net **≤ +20** in any view | the 자재창고: building + label + 1 baked pile + 3 pallets ≈ 8; a porter = sprite + shadow + carried items; **porter bundle bake** (below) |
| Porter bundle bake (perf offset, L1) | a porter with 10 items draws 12 objects | carried stacks of ≥ 4 items draw as one baked image (`StackBaker` slot, the pile bake), drawn items capped at `drawMax` 8 while flying | −50 to −80 objects when 13+ goods porters are on screen |
| Logic | v4.2 systems 0.20–0.37 ms a tick (budget 0.25) | `HaulBoard` + `Jobs` ≤ **0.05 ms** a tick median (`sysprof`) | board rebuild 1 Hz (≤ 25 sources × ≤ 80 sinks × ≤ 3 types ≈ 6,000 checks ≈ 0.3 ms per rebuild → 0.005 ms a tick); idle sampler 1 Hz over ≤ 50 people; porters' own `think()` scans go away (they read the board) |
| Hub panel open | — | rows refresh 1 Hz, in place (missions_bank M-6 rule) | like the office panel (< 100 ms open) |
| Textures / files | tour peak 451.4 / 455 MiB; ≈ 457 files after 금방 (gate 480) | **+0 MiB resident, +0 files** | §10 |

---

## 5. The 물류 게시판 (source → sink)

### 5.1 Who decides

`HaulBoard` (new, `src/systems/haul/HaulBoard.js`, pure except reading the game objects) **proposes**, the porter
**accepts**. Once a second it writes two lists:

- **Supplies** — what may leave a place now, after its keep: station / workshop outputs (above `Porter.keepFor`),
  piles (≥ `pileStart` 85 % and the station input full, down to `pileKeep` 60 %), the 창고 and the 자재창고 (their
  counts, minus the reserve for non-site sinks), the boat catch, the dock (never: exit).
- **Needs** — every `Logistics` sink's `want(type)` with its `prio(type)` (sites, food box, workshop inputs, shelves,
  pantry, founding / wholesale, the dock's surplus sink, the 창고, the new RESERVE / BACKFILL / YARD sinks of the
  자재창고, and any sink the demand draft adds: 가전 공장 / 가구 공방 inputs register as INPUT like the cannery).

It matches them into **jobs** `{ src, type, n, sink, prio, d }`. An idle porter of the pool (or a station porter, or a
raw porter for a local job) asks `board.pick(porter)`; the job is **claimed** (`claimedBy`) and reserved at the sink
(`Logistics.reserve`) and at the source (`board.hold(src, type, n)`), so two porters never take the same job. A claimed
job drops after 120 s (as `StationPorter.tripT`).

Goods porters p1 / p2 keep their own rule (their output → `Logistics.best`), and raw porters keep their own line: the
board only adds the jobs nobody's own rule covers.

### 5.2 Tiers and priorities

| Tier | Places | Gives to | Takes from |
|---|---|---|---|
| 0 make | piles, station / workshop outputs, boat catch | any tier above | — |
| 1 keep | 창고, 자재창고 | tier 2 at prio ≥ 45 (as the 창고's `out` rule), SITE, INPUT, BACKFILL; tier 3 only for its own surplus (≥ 70 % / raw share ≥ 60 %) | tier 0 only |
| 2 use | station inputs, workshop inputs, sites, hire pads, shelves, pantry, food box, founded shops | — (sinks only) | tiers 0, 1 |
| 3 exit | 짐 싣는 곳 (train, sleigh → 물류창고), 금방 sled | — | tiers 0, 1 |

New `PRIO` values (the ladder in `Logistics.js`, unchanged otherwise):

| Name | Value | Sink |
|---|---|---|
| BACKFILL | 55 | a station input below 50 % whose own pile is under 25 %: raw from the 자재창고 (after GRILL 60, before FOOD 50) |
| RESERVE | 42 | the 자재창고's 판자 / 주괴 until `material.reserve` (after SHELF_LOW 45, before the 교역소 SHELF 40) |
| YARD | 14 | raw into the 자재창고 (after WHOLESALE 30, before SURPLUS 12: raw is kept before it is exported) |

### 5.3 Matching

```
every board.every s:
  needs    = for each sink, type: n = Logistics.want(sink, type) − held; prio = sink.prio(type)       (skip n ≤ 0)
  supplies = for each source, type: n = available(source, type) − held                               (skip n ≤ 0)
  sort needs by prio (urgent ≥ 46 first, as Logistics.best)
  for each need:
     src = the supply of that type with the lowest d(src, sink) that the tier table allows
     n   = min(need, supply, bag); if d > farPx and prio < 45 and not SITE: n must be ≥ minLoadFar (6)
     job = { src, type, n, sink, prio, d }; add sinks of the same type within batchPx of the sink (one trip, dropped place
           after place — Hauler.unload already re-plans to the next sink)
board.pick(porter):
  among unclaimed jobs the porter may do (§5.6):
     score = prio − (d(porter, src) + d(src, sink)) ÷ travelPxPerPoint (300)      (prio ≥ 46 keeps its full rank)
  the best score; a tie → the bigger load
```

### 5.4 No ping-pong

1. Items move up the tiers only; a keep place never gives to another keep place (창고 ↔ 자재창고 never).
2. A keep place does not take back a type it gave out in the last `flapS` 60 s.
3. Hysteresis: a pile starts giving at 85 % and stops at 60 %; a keep place stops taking at 95 % and starts again at 85 %;
   BACKFILL starts below 50 % and stops at 80 %.
4. Once loaded, a job's destination only changes when its sink went away or filled: then the next sink with prio ≥ the
   job's prio − 10, else the nearest keep place that takes it (as `WarehousePorter.planDest` today).
5. A dock item never comes back (exit tier). 금방's backhaul (dock → town) is 금방's own route.

### 5.5 Batching

- A job's load is what all the sinks of its type within `batchPx` 300 px of the first sink want (the v4.2 M5
  `totalWant` idea, generalised), up to the bag.
- Far trips (> `farPx` 1,200 px) wait for `minLoadFar` 6 unless the need is urgent (≥ 45) or a site.
- Raw for export leaves only from the 자재창고 once it stands (one source, full bags), not from five piles.

### 5.6 Who may take which jobs

| Carrier | Sources | Sinks | Zone | Change |
|---|---|---|---|---|
| Raw porter (1 a line) | its pile | its station input; **local jobs** within `raw.localPx` 900: the 자재창고 (YARD), a workshop input that takes its raw | its line | DL1: no export spill; a local job only while its station input has been full ≥ 4 s and the pile ≥ 85 % |
| Goods porter p1 / p2 | its output | `Logistics.best` (as today) | village | none (p2 movable, §6) |
| **Pool** (창고 + 자재창고 crew) | any tier 0–1 source | tiers 1–3, village sinks; the dock only from a keep place (until the 자재창고 stands: today's CODE-2 `whRaw` runs from full piles stay) | village + the dock | replaces `WarehousePorter.think()` / `rawJob()`; fish pile → cannery is an ordinary INPUT job |
| Station porter (역 짐꾼) | tiers 0–1 | remote sinks only (founding, shops, wholesale, the dock) | station district | `think()` reads the board's remote jobs; raw at `pilePrio` 33 only from the 자재창고 once it stands |
| Chief | anything | anything | — | the 길 안내 (`Navigator`) keeps its own rules; the board treats his reservations as today (`Logistics.chief`) |

### 5.7 Exports and 금방

- **Dock**: unchanged sink (`PRIO.SURPLUS`, the Surplus rules). Raw arrives in fewer, fuller loads from the 자재창고.
- **Cargo sleigh** dock → 물류창고: unchanged; "썰매 한 대 더" offer unchanged.
- **금방 dog sled 집하** (v4.3, piles ≥ 85 %, keeps 40 %, ≤ 24 crates a trip, ≈ 6 items a minute over a day):
  - its `piles` port lists the 자재창고 as one more pile-like source (its raw above 40 % of the raw share), **first in
    order**: one stop, a full basket;
  - while a sled is assigned to a source the board marks it `claimed: 'sled'` and porters skip **export** jobs from it
    (two carriers never chase the same surplus);
  - the sled is small (≈ 6 a minute): it is the bonus outlet, not the plan. After DL1–DL3 the raw left for export is
    small anyway (§2).
- **금방 hub** is not a village sink: its stock comes from the depot racks (its own rule).

### 5.8 Expected effect (targets to verify with `econ/probe.mjs` runs L / S25 / S35 and the census bot)

| Measure | Run L now | After L0 | After L1 |
|---|---|---|---|
| Raw porters' time on dock / 창고 runs | 7–21 % | **0** | 0 |
| Smelter starved | 15 % | ≤ 5 % | ≤ 5 % |
| Cannery starved | 39 % | 39 % | ≤ 15 % |
| Smokehouse output full | 23 % | ≤ 15 % | ≤ 10 % |
| Ore · meat · fish pile ≥ 90 % | 63 · 70 · 72 % | ≤ 40 · 60 · 72 % | ≤ 30 · 40 · 50 % |
| Raw walked to the dock a minute | 39 | ≤ 20 | ≤ 10, from one source |
| 판매대 smoked meat empty at 25–35 min (S25 / S35) | 42 / 32 % | ≤ 15 % | ≤ 10 % |
| Gatherers idle | 24 % of their time | 24 % | ≤ 15 % with 이직 |
| 창고 crew | 6 (touch) | ≈ 4 | ≈ 4 + 1 |
| First 20 minutes (fresh25: village complete, income 0–20, empty shelves) | 19.5–20.7 min | **unchanged** | unchanged |
| Income (automation) | ≈ 2,170 | +15–22 % | (+ the demand draft) |

---

## 6. 일꾼·짐꾼 management (이직)

### 6.1 Data model (`src/systems/Jobs.js`, new)

```
JobSlot {
  id        'hire2_fisherman' | 'p2:grill' | 'raw_smelter' | 'op_grill' | 'crew:3' | 'stn:2' …   (the hire step / offer that made the person)
  role      'gather' | 'raw' | 'goods' | 'crew' | 'station' | 'op' | 'clerk'
  home      the line now: 'fish' | 'log' | 'wheat' | 'ore' | 'meat' | 'grill' … | 'wh' | 'mat' | 'square'
  origin    the line the step made it for
  anchor    true for each line's first gatherer (hire_*), its raw porter, its first goods porter (porter_*), operators,
            clerks and station porters: never movable
  person    the live Worker / Porter / … (or null while it is not built yet)
  movedAt   game time of the last move (cooldown), byChief (manual or auto)
  idle      { share (EWMA over 180 s), reason, since }   (not saved)
}
moves = { slotId: line }   only the differences from origin — the saved part
```

- Built from what exists: `progress.done` (hire steps), `v42.lines.p2`, the crew (`WarehouseCrew`), `Growth.porters`,
  the office staff and clerks (shown, never movable).
- `Game.hireWorker / hirePorter / hireRawPorter` and `LineUpgrades.hireP2` ask `Jobs.lineOf(slotId)` before they place
  the person, so a reload rebuilds every moved person at its new line (no walk, `instant`).

### 6.2 Idle detection (1 Hz sampler; reasons shown in Korean)

| Role | Working | Waiting (counts as idle) | Reason text |
|---|---|---|---|
| Gatherer (`Worker`) | `goto`, `work`, `deliver`, `drop` with room | `drop` with `fullT > 0` (pile full) · `seek` with no node (`pickNode()` null) · `hungry` | `더미가 가득해서 기다려요` · `잡을 게 없어요` · `배고파요` |
| (walking share, not idle) | `goto` / `deliver` > 70 % of the window | — | `멀리 다녀요` (shown, it is busy) |
| Raw porter | `haul`, `unload`, `load` taking | `load` with `want ≤ 0` · pile empty | `가공소 입구가 가득해요` · `더미가 비었어요` |
| Goods porter | `haul`, `unload`, `load` taking | `load` with an empty output · no plan (nobody wants it) · `unload` with `waitT > 0` | `나를 물건이 없어요` · `갈 곳이 없어요` · `선반이 가득해요` |
| Pool / station porter | any job | `idle` (no job picked) | `할 일을 기다려요` |
| Operator (shown, fixed) | station working | input empty · output full | `재료가 없어요` · `출구가 가득해요` |
| Moving (이직) | — | walking to the new line | `이사 중 · 12초` |

Shown as the share of the last 3 minutes (EWMA, like `StockLedger`), never the current second. Dot: green < 25 %,
yellow 25–50 %, grey ≥ 50 % (`ui_status_3 / 1 / 2`; red `ui_status_0` is kept for "this line is short").

### 6.3 이직 rules

| Rule | Value |
|---|---|
| Who | movable slots only: gatherers from `hire2_*` / `hire3_*` (late: 9 people — miners have no 3rd), every 짐꾼 2 (up to 8). Anchors show a lock and `줄을 지켜요` |
| Where | a gatherer → any opened gathering line (its profession changes); a 짐꾼 2 → any goods line with a goods porter of its own (grill, sawmill, bakery, smelter, smokehouse, toolsmith, cannery, dock) |
| Caps | ≤ `perLineMax` 5 gatherers on a line; ≤ 3 goods porters on a line (p1 + 2) |
| Cost | free; cooldown `cooldownS` 60 s per person (`이사 준비 1분`); no refund |
| Hire pads | unchanged: every hire step stays done and offers appear once per save. A moved 짐꾼 2 does **not** re-open its old line's offer (no buy-move-buy loop) |
| The walk | the person finishes the load in hand (a gatherer drops its catch on the old pile; a porter delivers its load), then walks the roads to the new line's waiting spot (150 px/s: 10–25 s across the old village). The old line loses it at once, the new line counts it on arrival |
| Looks | a gatherer re-skins to the new profession's look: `gs.workerKey(type, idx)` with the first free index; 3 looks a profession (miners 2: `miner_b` is the 대장간's operator). The 4th / 5th of a line reuse looks 1–2 (§13 Q1; optional new art §10.2) |
| Lines that lose people | a line's status may go red: the hub warns once `○○ 줄에 사람이 줄어요` (no block) |
| Before village complete | nothing is movable (all movable slots are v3 steps after village complete) — the window still shows everyone |

Expected: 1 hunter + 1 fisherman → the forest or the fields ≈ +30 logs / wheat a minute (per-head 17; the hunters share
5 animals, two fishermen still catch more than the grill sells).

### 6.4 Code (L1)

| Where | What |
|---|---|
| `Worker.retrain(type, idx)` | `release()` the node; if carrying, `deliver` to the old pile first; then `type`, `station = STATION_OF[type]`, `pile = PILE_OF_WORKER[type]`, `home = Worker.homeFor(gs, type, idx)`, `oreLeft`, `hungry = false`; `reskin(gs.workerKey(type, idx))` (via `wantKey` while the look loads, as the constructor does; `keysInUse` add / delete); `walkTo(home)`; state `seek` |
| `Hauler.rebind(…)` | `RawPorter`: `pile`, `target`, `home`; `Porter`: `station`, `home`, `plan = null`, `keep` reset. Both: the load in hand finishes first (`dest` kept), `clearDest()` only for an empty bag; then `go(home)` |
| `Game.hire*` / `LineUpgrades.hireP2` | read `Jobs.lineOf(slotId)` before placing (instant on load) |
| `LineUpgrades.hasPorter(line)` | counts the line's goods porters now (p2 moved in counts) |
| `Labour` piles | `pile.shown` turns on when a moved gatherer arrives at a line whose pile was hidden (cannot happen after village complete; guard anyway) |
| Tests | node: slot table from fixtures, caps, cooldown, sanitize; browser: move each role, save, reload → same lines, no orphan reservations (`Logistics.res` totals back to 0 after 30 s idle) |

### 6.5 알아서 배치 (auto-assign)

```
every jobs.autoEvery (60) s, when on:
  candidates = movable slots with idle.share ≥ idleAt (0.5) for ≥ idleForS (180) s,
               not moved in the last stayS (180) s, not moved by the chief in the last respectS (300) s
  needs per line:
     gathering line  need = station starved share (input empty) over 180 s, if its pile is < 50 % full   (short of raw)
     goods line      need = output-full share over 180 s, if StockLedger.status is 'jam' or its shelf runs empty  (short of carriers)
  move ONE person: the most idle candidate → the same-role line with the highest need,
                   only if need(target) ≥ need(source line) + 0.2 and the target is under its caps
  log: a 서리 소식 line (`사냥꾼 하나가 숲으로 옮겼어요`), a toast at most once per 3 minutes
```

It never hires, never moves anchors, never changes crew seats, and stops for 5 minutes on a person the chief moved.

### 6.6 With the production-scaled crew

- **Seats count arrivals, not who is present.** Moving someone out of the pool (only possible for a station porter, if
  the designer allows it later) does not call a new arrival; moving someone in does not stop arrivals. No free porters.
- Auto-assign never changes the crew; the crew rule never counts moved line porters.
- The pool needs no 이직: it already works for both buildings (§4.3).

---

## 7. Sector status (산업 현황)

### 7.1 Sectors

| Card (ko) | Lines / places | Icon |
|---|---|---|
| 어업 | 어부, 생선 통, 화덕, 배 · 배 창고, 생선 짐꾼(배) | `item_fish_raw` |
| 임업 | 나무꾼, 통나무 더미, 제재소 | `item_log` |
| 농업 | 농부, 밀 더미, 오븐 | `item_wheat` |
| 광업 | 광부, 광석 더미, 제련소, 식량 상자 | `item_ore` |
| 사냥 | 사냥꾼, 고기 걸이, 훈제장 | `item_meat_raw` |
| 공업 | 대장간, 통조림 공장 (+ the demand draft's 가전 공장 · 가구 공방) | `ui_icon_tools` |
| 상업 | 판매대, 교역소, 잡화점, 큰 식당, the 5 town shops, (v4.3) 금방 | `ui_icon_coin` |
| 물류 | 창고, 자재창고, 짐 싣는 곳, 기차 수출, 물류창고, 썰매 | `ui_icon_route` |

"산업" (the designer's umbrella word) is the tab's name: **현황** = 산업 현황.

### 7.2 What a card shows (all read from existing systems, 1 Hz while open)

| Line on the card | Primary sectors | 공업 | 상업 | 물류 |
|---|---|---|---|---|
| 1 | `잡기 59 · 팔림 29` — pile `inPm`, shelf `outPm` (`StockLedger`) | `만들기 22 · 팔림 15` (workshop crafted, 잡화점) | `오늘 1,240코인` (`Office.income` market / trade / store / rest / shops) | `바쁨 82 % · 밀린 일 2` (pool) |
| 2 | people: `👷 6명 · 💤 1` (Jobs) | operators + porters | clerks + restaurant staff | crew + station porters |
| 3 (chip) | the cause, §7.3 | workshop state | `빈 선반 1곳` (`Surplus.emptyFor`) | `자재창고 가득` / `짐 싣는 곳 밀림` |

Card tap → the sector's detail (same tab, back arrow): its `StockLedger` rows (the office 재고 row renderer, shared:
`LedgerRows.js` per the v4.6 plan), the why-chain, and buttons **사람 보기** (→ 일꾼·짐꾼 filtered to the sector) and
**가 보기** (→ `Navigator.guideTo(place)`).

### 7.3 Status and cause (the why-chain, ordered)

| Status (dot) | Rule | First failing link → chip text | 가 보기 target |
|---|---|---|---|
| 부족 (red) | `StockLedger.status` 'short' (shelf empty ≥ 30 s, nothing in stock) | raw short: `통나무가 모자라요` (+ `나무꾼이 멀리 다녀요` if walking > 70 %) · a missing carrier step: `짐꾼이 없어요` · missing operator | the hire / offer pad, or the gatherers' pile |
| 길 막힘 (orange) | 'jam' (shelf empty while output / 창고 has it) | `짐꾼이 모자라요` | the 짐꾼 2 pad, or the output |
| 남음 (blue) | 'surplus' (pile / output full ≥ 60 s, shelf fine) | `살 사람이 모자라요` (goods) · `원료가 남아요 → 자재창고` (raw) | the 자재창고 (plot or door); the demand draft's new consumers when they exist |
| 적당 (green) | otherwise | `잘 돌아가요` | — |
| (people badge) | any movable person idle ≥ 50 % | `💤 쉬는 사람 1명 → 옮기기` | the 일꾼·짐꾼 tab |

---

## 8. One window or separate? → one hub, **마을 경영**

### 8.1 Recommendation

**Group them: one window, three tabs — [현황] [일꾼·짐꾼] [물류].**

1. **The same rows from two sides.** Every red card in the data is caused by a line's people: the wood line lacks
   gatherers, the ore line loses its raw porter to dock runs, smoked meat lacks carriers, the cannery lacks a carrier
   from the fish pile (flow map §6–§7). The card must lead to those people in one tap; a person's row must say which line
   it serves and why it waits. Two windows would repeat each line twice and make the player hop.
2. **Phone space.** There is no room for another HUD button at 360×640 (`v44_plan.md` D13); one window needs one door,
   and the door already exists (§8.2).
3. **One renderer, one art page.** The shell panel (`v44_plan.md` §19.2, a generalised `OfficePanel`), the ledger rows
   (`LedgerRows.js`) and the ui5 `@panels` page serve all tabs.
4. **Fewer windows in total.** v4.6 planned a 마을 panel (등급 · 행복 · 자원 · 통계). Its 자원 tab *is* 현황 and its rows are the
   same ledger rows: v4.6 adds 등급 and 행복 to this hub instead of opening a second window. The office keeps its 재고 tab
   (셈이's chalkboard, a summary with a link).
5. Separate windows would win only with very different interactions or > 100 rows; here it is ≈ 40 people grouped by 8
   sectors, all with the same two actions (look, move).

### 8.2 Doors (no new HUD button)

| Door | Opens | When |
|---|---|---|
| **인구 칸 (popBox)**, `UI.js` (28, top + 152), made interactive (drawn 150×50, hit 150×88 per the v4.4 HUD rule) | 일꾼·짐꾼 (or 현황 if nobody waits); a `💤 n` badge (`emote_zzz` 28 + count, `ui_chip`) appears when a movable person has been idle ≥ 50 % for 3 min | from `hire_miner` (the popBox's v4.6 rule) |
| 읍 chip (rank chip) | 등급 tab (v4.6); until then its own rank panel, unchanged | — |
| Office 재고 tab | top line `물류 직원 4명 · 바쁨 82 % · 밀린 일 2` + button `마을 경영 열기` → 현황 | office built |
| Office 직원 tab | top line `일꾼·짐꾼 41명 · 쉬는 사람 3` + button → 일꾼·짐꾼 | office built |
| 편지 / 서리 소식 | a letter `광부 두 명이 쉬고 있어요` with the button `보러 가기` → 일꾼·짐꾼 filtered | letters exist |
| v4.6 자원 지도 pins | 현황, the region's sector | v4.6 |
| v4.4 stack manager | nothing new: the pop / rank entry is already a stack row; the badge lives inside it | v4.4 |

### 8.3 Layout (logical 720 wide; 390×844 → 720×1558, 360×640 → 720×1280)

Shell: `pw = min(W − 24, 700)` = **696**; `ph = min(H − 220 − insets, 1100)` = **1100** at 390×844, **1060** at 360×640;
`top = max(96 + safeTop, (H − ph) / 2)` = 229 / 110. Title row 92 (icon `ui_icon_people` 46, `마을 경영` 32 px, the
`💤 3명` chip 150×56 that opens 일꾼·짐꾼 filtered to idle, close ⌀60). Tab row 72: three `ui_office_tab(_on)` plates
of 220×64, labels 24 px. **Body from top + 172**: 928 px at 390×844, 888 px at 360×640; it scrolls by drag.
Labels ≥ 22 px, body text ≥ 26 px (`v44_plan.md` §19.3), hit areas ≥ 88.

**현황**

```
┌───────────────────────────── 696 ─────────────────────────────┐
│ (👥) 마을 경영                       [💤 3명]            (✕)   │ 92
│ [  현황  ] [ 일꾼·짐꾼 ] [  물류  ]                            │ 72
│ ┌──────── 330 ────────┐  ┌─────────────────────┐              │ cards 330×200, gap 12 / 10
│ │(🐟) 어업        ●   │  │(🪵) 임업        ●   │  y+30  icon 44 · name 28 · dot 28
│ │ 잡기 59 · 팔림 29   │  │ 잡기 50 · 팔림 46   │  y+80  26 px
│ │ 👷 6명 · 💤 1       │  │ 👷 6명              │  y+120 26 px
│ │ [ 살 사람이 모자라요 ]│  │ [ 통나무가 모자라요 ]│  y+164 ui_chip 300×48, 22 px
│ └─────────────────────┘  └─────────────────────┘              │
│   농업 · 광업 / 사냥 · 공업 / 상업 · 물류  (4 rows)            │
│ 숫자는 1분에 몇 개예요                                         │ 22 px footer
└───────────────────────────────────────────────────────────────┘
```

4 rows × 210 = 840: fits both phones (928 / 888). Detail view (card tap): back arrow 60, the sector's ledger rows
640×128 (the 재고 row), the why-chain lines 26 px, buttons `사람 보기` 300×72 and `가 보기` 300×72.

**일꾼·짐꾼**

```
│ [전체 41][어업 7][임업 6][농업 6]                                │ chips 160×56 (ui_chip), 2 rows = 128
│ [광업 5][사냥 7][공업 4][물류 9]                                 │
│ 💤 쉬는 사람 3명                    [알아서 배치: 꺼짐]          │ 64; toggle 230×64
│ ── 어업 · 생선 → 구운 생선 ────────────────────────────────    │ header 44, 22 px
│ (얼굴) 어부 2            ● 더미가 가득해서 기다려요             │ row 640×96: face 72, name 26 px,
│        3분 중 40 % 쉬어요                         [ 옮기기 ]    │   reason 22 px, button 150×64
│ (얼굴) 생선 짐꾼         ● 일해요                  🔒 줄 지킴   │ anchor: lock 32 + 22 px
│ (얼굴) 요리사 쿡         ● 출구가 가득해요         🔒 기술자    │ operator (shown, fixed)
```

List height: 928 − 192 = 736 at 390×844 (≈ 7 rows), 696 at 360×640 (≈ 6.5 rows); one sector filtered is 5–9 rows.
Faces: the 128 px portraits (`portrait_<look>`, the portrait atlas pages the hire pads already use; porters
`portrait_npc_porter_b`; operators `portrait_<who>`), scaled to 72; fallback `ui_icon_worker` / `ui_icon_porter` while a
page loads.

**옮기기 sheet** (modal, pausing, like the v4.4 sheets): 640 × min(H − 300, 900), title `어부 2를 어디로 보낼까요?` 26 px;
one row per allowed line 640×88: icon 44, line name 26 px, need dot, reason 22 px (`통나무가 모자라요`), count
`나무꾼 3 / 5`; disabled rows grey with the reason (`자리가 다 찼어요`, `같은 일만 할 수 있어요`); `취소` 240×84. After the
pick the row reads `이사 중 · 12초`, then `1분 뒤에 다시 옮길 수 있어요` (grey button).

**물류**

```
│ 물류 직원 5명 (창고 4 · 자재창고 1)                              │ 26 px
│ 바쁨 ▮▮▮▮▮▮▮▮▯▯ 82 %   밀린 일 2                              │ bar 400×24
│ ── 보관 ────────────────────────────────────────────────      │
│ 창고          161 / 300  ▮▮▮▮▮▯▯▯                             │ rows 640×72
│ 자재창고      120 / 400  (원료 80 · 판자 30 · 주괴 10)          │
│ 짐 싣는 곳     70  · 다음 기차 14:20                            │
│ 물류창고       14 / 500                                        │
│ ── 바쁜 길 ─────────────────────────────────────────────      │
│ 훈제장 → 판매대        1분에 50개        [ 지도 ]               │ rows 640×88, button 150×64
│ 제련소 → 교역소        1분에 48개        [ 지도 ]               │
│ 광석 더미 → 자재창고   1분에 12개        [ 지도 ]               │
│ [ 지도에서 모두 보기 ]                                          │ 320×72
```

`지도` opens the overview with that route drawn (one `Graphics` path with the `v42_core` nav dots, the item icon at the
middle, `50/분`): ≤ 16 display objects, only while the overview is up; tap anywhere to clear.

### 8.4 Strings (ko; en keys follow the same shape)

| Key | 한국어 |
|---|---|
| `hub_title` | 마을 경영 |
| `hub_tab_status` · `hub_tab_people` · `hub_tab_lgx` | 현황 · 일꾼·짐꾼 · 물류 |
| `sec_fish` … `sec_lgx` | 어업 · 임업 · 농업 · 광업 · 사냥 · 공업 · 상업 · 물류 |
| `card_flow` | 잡기 {a} · 팔림 {b} |
| `card_make` | 만들기 {a} · 팔림 {b} |
| `card_people` | 👷 {n}명 · 💤 {i} |
| `cause_short_raw` · `cause_jam` · `cause_surplus_goods` · `cause_surplus_raw` · `cause_ok` | {item}가 모자라요 · 짐꾼이 모자라요 · 살 사람이 모자라요 · 원료가 남아요 → 자재창고 · 잘 돌아가요 |
| `btn_people` · `btn_go` · `btn_move` · `btn_back` | 사람 보기 · 가 보기 · 옮기기 · 뒤로 |
| `idle_pile_full` · `idle_no_node` · `idle_hungry` · `idle_far` | 더미가 가득해서 기다려요 · 잡을 게 없어요 · 배고파요 · 멀리 다녀요 |
| `idle_in_full` · `idle_pile_empty` · `idle_no_goods` · `idle_no_sink` · `idle_shelf_full` · `idle_wait_job` | 가공소 입구가 가득해요 · 더미가 비었어요 · 나를 물건이 없어요 · 갈 곳이 없어요 · 선반이 가득해요 · 할 일을 기다려요 |
| `op_starved` · `op_blocked` · `working` | 재료가 없어요 · 출구가 가득해요 · 일해요 |
| `idle_share` | 3분 중 {p}% 쉬어요 |
| `anchor_line` · `anchor_op` | 줄 지킴 · 기술자 |
| `move_title` · `move_full` · `move_same` · `move_walking` · `move_cooldown` | {who}를 어디로 보낼까요? · 자리가 다 찼어요 · 같은 일만 할 수 있어요 · 이사 중 · {s}초 · 1분 뒤에 다시 옮길 수 있어요 |
| `auto_on` · `auto_off` · `auto_help` | 알아서 배치: 켜짐 · 알아서 배치: 꺼짐 · 1분마다 한 명씩, 쉬는 사람을 바쁜 줄로 옮겨요 |
| `auto_news` | {who} 하나가 {line}(으)로 옮겼어요 |
| `crew_line` | 물류 직원 {n}명 · 바쁨 {p}% · 밀린 일 {b} |
| `crew_came` | 물류 직원이 왔어요 |
| `mat_name` · `mat_card` · `mat_offer` | 자재창고 · 원료와 공사 자재를 보관해요 · 자재창고를 지을 수 있어요 (남쪽 갈림길) |
| `idle_badge` | 💤 {n}명 |
| `per_minute_note` | 숫자는 1분에 몇 개예요 |

### 8.5 Versions of the hub

| Version | Tabs |
|---|---|
| L1 (v4.3.2 물류) | 현황 · 일꾼·짐꾼 · 물류 (builds `src/scenes/panels/Shell.js` early; v4.4 reuses it) |
| v4.4 | the stack manager registers the popBox row as today's pop / rank entry; the badge stays inside it |
| v4.6 | + 등급 · 행복 (5 tabs × 136 px plates, as the office's 5 tabs); 자원 = 현황 grouped by region with the TOP 3 and 해결하러 가기; the separate 마을 panel is not built |

---

## 9. What the player sees in the world

| Where | What | Art |
|---|---|---|
| 창고 / 자재창고 label | `창고 161/300`, `자재창고 120/400` (as the 창고 label today) | `ui_panel` |
| Crew arrival | walks in from the village edge, banner `물류 직원이 왔어요` (touch) | — |
| A raw porter on a local job | carries to the 자재창고 (it is on screen near the mine / hunt) | — |
| Idle gatherers | the existing `emote_sweat` / `emote_dots` at a full pile (`Worker.drop`), plus `emote_zzz` every 20 s for a person idle ≥ 50 % (on screen only) | `emotes` |
| 길 안내 to a bottleneck | `가 보기` from a card: `Navigator.guideTo(place)` — the planned v4.6 API brought forward: one destination, the same nav dots and edge badge, cleared on arrival or after 60 s | `v42_core` |
| 물류 지도 | §8.3 (overview, ≤ 16 objects while shown) | Graphics + item icons |
| Office | the chalkboard 재고 tab gains the crew line; 셈이's lamp rule unchanged | ui5 |

---

## 10. Art

### 10.1 Reused (required scope: **0 new files, 0 new MiB resident**)

| Use | Existing art | Page / state |
|---|---|---|
| 자재창고 building | `warehouse` | `bld_buildings` (resident with the 창고, 대장간, 통조림 공장, 잡화점) |
| 자재창고 pallets | `pallet_planks`, `pallet_ingots`, `pallet_ore`, `pallet_logs` | `lgx_items` (shipped, 0.3 MiB) |
| Hub plates | `ui_panel`, `ui_office_tab(_on)`, `ui_chalk_panel` (detail rows), `ui_chip` (filters, causes, badge), `ui_card` / `ui_card_selected` (sector cards), `ui_button_blue/green/gray` | ui, ui2, ui5 `@panels` (the office's on-demand page; the panel waits ≤ 1.2 s for it like `OfficePanel`) |
| Status dots | `ui_status_0–3` | ui5 |
| Icons | `ui_icon_people`, `ui_icon_worker`, `ui_icon_porter`, `ui_icon_staff`, `ui_icon_route`, `ui_icon_depot`, `ui_icon_tools`, `ui_icon_coin`, `ui_icon_inventory`, `ui_icon_lock`, `ui_icon_close`; item icons for sectors; `emote_zzz` | ui, ui2, ui5, emotes (all resident or on the core page) |
| Faces | `portrait_*` (128 px, the portrait atlas pages the hire pads use) | shipped |
| Route line | nav dots of `v42_core` | resident |

Not used: the ui6 (`ui_gb_*`) plates — they carry the 금방 brand and their page is only resident while 금방 is open.

### 10.2 Optional new art (only if the designer asks)

| Item | Why | Cost |
|---|---|---|
| 2 more looks per gathering profession (`*_d`, `*_e`: 10 workers) via `tools/wkr_*` (Blender) + 10 portraits | the 4th / 5th gatherer of a line would not repeat a look | ≈ +2–4 MiB in the `workers` pages (only the looks in use are loaded), +2–4 files after packing (≈ 461 of 480) |
| A small `자재창고` sign decal (procedural, in the v4.4 `ui7` page) | tells the two warehouses apart at zoom 0.6 | +0 files (inside `ui7`), < 0.1 MiB |
| Forklift for the crew (`forklift`, `forklift_loaded`, exist) | flavour at the 자재창고 | +3.8–7.6 MiB while on screen, +2–4 files — not recommended (porters already carry) |

---

## 11. Save

```
haul: { v: 1,
  mv:   { "hire2_hunter": "log", "p2:grill": "smokehouse" },   // slot id → line now; only differences (≤ 24 entries)
  auto: 0,                                                      // 알아서 배치 on / off
  mat:  { c: { "item_ore": 40, "item_plank": 22 } }             // 자재창고 contents (the site / building: the buildings save)
}
```

- ≤ 600 B. Additive: no `SAVE_VERSION` bump (7 today; v4.4's 7 → 8 migration copies unknown slices through, as it
  does for `geumbang`). Absent or bad → defaults (nobody moved, auto off, empty 자재창고).
- Sanitise: `mv` keys must be known slot ids of a done step or a bought p2; values a known line the role may take;
  anchors dropped; caps enforced (extra moves dropped, newest first); `mat.c` only accepted types, ≤ cap, raw ≤
  `rawShare`.
- Not saved: idle shares, cooldowns, board jobs (rebuilt in ≤ 1 s; claimed loads in hand come back as today's
  porters' stacks do).
- Restore order: Progression rebuilds the hires → `Jobs` reads `mv` before each person is placed (instant, at the new
  line); the 자재창고 restores after its building, before the porters' first tick.
- Older saves: a v4.2 save without a 창고 now sees the 창고 card (early unlock); a save with the touch's crew 6 keeps
  6; a save with a 창고 built anywhere keeps it.
- Tests: `save_v42` round trip with every role moved; fuzz (40 edits × restart) on the new slice; the `mig_real`
  fixtures load with the slice absent.

---

## 12. Versions, build order, files, gates

### 12.1 L0 — 물류 손질 (with v4.3, or as a v4.2.1 right after the touch). ≈ 1.5 build + 1 fix

| Step | Files |
|---|---|
| DL1: `RawPorter` local jobs; no export spill (`raw.stayOnLine`, `localPx`) | `src/entities/Worker.js`, `src/data/balance.js` |
| DL2: 창고 unlock at village complete, `v_wh` plot, `GOALS` order | `src/systems/Progression.js`, `src/data/world.js`, layout test |
| DL4 need gate on the touch's crew | `src/systems/WarehouseCrew.js` |
| Fish pile → cannery as a 창고-crew INPUT job (until the board exists) | `WarehousePorter.think()` |
| Gates | probe runs L / S25 / S35 (§5.8 L0 column), census bot 60 min, `fresh25` (first 20 min unchanged), pacing bot (읍 ±5 %), all suites |

### 12.2 L1 — 물류 · 마을 경영 (v4.3.2, before v4.4). ≈ 6 build + 2 fix

| Step | Files (new **bold**) |
|---|---|
| Board + tiers + PRIO | **`src/systems/haul/HaulBoard.js`**, `src/systems/Logistics.js`, `src/entities/Worker.js` (pool, station porters pull) |
| 자재창고 | **`src/entities/MaterialDepot.js`** (a `Warehouse` subclass: accepts, reserve, raw share), `src/systems/Civic.js` (card), `src/data/world.js` (`v_mat`), `src/systems/WarehouseCrew.js` (pool homes) |
| Jobs, idle, 이직, auto | **`src/systems/Jobs.js`**, `src/entities/Worker.js` (`retrain`, `rebind`), `src/scenes/Game.js` (hire* read slots), `src/systems/LineUpgrades.js` (`hireP2`, `hasPorter`) |
| Hub | **`src/scenes/panels/Shell.js`** (from `OfficePanel`), **`src/scenes/panels/VillageHub.js`** + **`StatusTab.js` / `PeopleTab.js` / `LogisticsTab.js`**, **`src/insight/model/sectors.js`** (pure), **`src/insight/view/LedgerRows.js`** (shared with the office 재고 tab), `src/scenes/UI.js` (popBox door + badge), `src/scenes/OfficePanel.js` (links), `src/systems/Navigator.js` (`guideTo`) |
| Perf offset | `src/entities/ItemStack.js` / `StackBaker` (carried bundle bake) |
| Save | `haul` slice (Save + sanitise) |
| Strings / balance | `src/data/strings.js`, `src/data/balance.js` (`logistics` block, §4.1) |
| Gates | §5.8 L1 column; node tests: board (10,000 random ticks: no item enters a keep place twice within `flapS`, items conserved, no claimed job without a porter after 120 s), jobs (caps, anchors, cooldown, sanitise); Playwright 390×844 DPR 3 + 360×640 DPR 2 ko / en: every tab, the move sheet, the HUD overlap checker (popBox hit 150×88); `sysprof` (≤ 0.05 ms); display objects (≤ +20 net); texbudget (+0); artifact files (+0) |

### 12.3 Together with the demand draft

New consumers (가전 공장, 가구 공방, …) register their inputs as `Logistics` sinks (INPUT) and their outputs as sources:
the board serves them with no special code. Their offer pads follow the same `LineUpgrades` pattern (`광석이 남아요 →
가전 공장을 지어 보세요`). The hub's 공업 card lists them.

---

## 13. Risks and questions for the designer

| # | Question / risk | Default in this draft |
|---|---|---|
| Q1 | The 4th / 5th gatherer of a line repeats a look | accept (cap 5); optional 10 new looks (§10.2) |
| Q2 | 창고 at village complete makes the mid game richer (짐꾼 2 earlier): 읍 may come a few minutes sooner | accept within ±5 %; else raise the smelter / smokehouse 짐꾼 2 costs |
| Q3 | Income: v4.2 is already +33 % over v4.1 (gate +15–30 %); L0 adds ≈ +15–22 % | measure with the demand draft's changes, then decide prices together |
| Q4 | Name: `자재창고` (raw + building materials) or `원료 창고` | 자재창고 (the designer's word) |
| Q5 | 알아서 배치 on from the start? | off; the hub's 💤 badge teaches it |
| Q6 | Should a station porter (역 짐꾼) be movable to the pool? | no (remote work; keeps the station district fed) |
| Q7 | Raw export priority for station porters (`pilePrio` 33, the designer's §2.3 choice) | unchanged; the source becomes the 자재창고 |
| R1 | The board replaces three `think()` methods: regressions in founding-card and restock rules | keep each role's filters as job filters (§5.6); the v4 / v42 suites and the census bot are the guard |
| R2 | Display objects already over the 1,700 gate late | bundle bake offset; the need gate removes 2 crew agents |
| R3 | The v4.2 touch changes the numbers this draft starts from | re-run `econ/probe.mjs` on the touch source before L0 and update §2 / §5.8 |
