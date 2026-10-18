# 물류 · 수요 개편 — binding plan (v4.2.1 물류 손질 · v4.3.2 물류 · 마을 경영 · 새 손님)

Status: **PLAN r2** (2026-10-18). r1 merged three drafts; r2 applies every finding of
`docs/build_reports/logistics_plan_critique.md` (37 findings: 8 high, 16 medium, 13 low — all answered, §20).
- `docs/logistics_flow_map.md`: the measurements (probe runs L / S25 / S35, CODE-2 census, bots);
- `docs/logistics_draft_carry.md`: carrying, warehouses, crew, the 물류 게시판, 이직, the hub (its DL1–DL11);
- `docs/logistics_draft_demand.md`: new consumers (its D1–D12).

**What r2 changed, in one paragraph.** The gates are restated from the plan's own cells (any pile ≤ 65 % at the end of
the track, ≤ 50 % only once 용광로 3단 is bought; v4.2.1's ore gate is "smelter ≥ 70 a minute, ore ≤ 60 %"). Late smoked
meat is treated as capped by 판매대 guests, so the meat lever is 이직 (one hunter to the forest), not 훈제장 3단 (dropped).
The 자재창고 is sized as a basket with explicit exits and measured at steady state. 금방 (v4.3) gets its own column and a
priority rule (processing → 금방 → plain export). The new plaza plot `v_wh` is dropped (no free footprint; the 창고 uses
the M plots already open at village complete). `짐꾼 2` is tracked per slot, gatherer moves respect the per-line hire
prices, the crew gate counts only real-use jobs and raw runs come last. The hub keeps one window and no new HUD button but
always opens on 현황, reads event counters instead of ledger deltas, shows anchors as `대기 · 줄 지킴`, fits 360×640 and
leaves `LedgerRows` / `guideTo` in their own versions. A new zero-art lever (솔방울 손님 늘리기, D2b) answers the
designer's "상가 … 고객을 늘리면" literally. Income gates are per step; Q9 has no default.

§1 lists every decision. Build contracts are at the end (§B0–§B4). Designer document (Korean, easy words):
`docs/기획서_물류수요개편.md`.

Inputs also read: `docs/build_reports/v42_code2.md` §8–§9, `docs/v42_plan.md`, `docs/기획서_v4_2_촌장.md` §2.3,
`docs/geumbang_plan.md`, `docs/build_reports/geumbang_module.md`, `docs/v44_plan.md` (§3, §16, §19, D13, D29, B2–B6),
`docs/v5_v8_plan.md` §2, §3.3, §6.6, `docs/build_reports/logistics_runtime.md`, and the code (anchors by function name:
`Logistics.js` `PRIO` / `best`, `Worker.js` `RawPorter` / `Porter` / `WarehousePorter.think` / `StationPorter`,
`WarehouseCrew.js` `target` / `crew` / `afterRestore`, `Warehouse.js` `STORABLE`, `LineUpgrades.js` `f4Due` / `hireP2` /
`afterRestore`, `Progression.js` `BUILD_UNLOCK` / `GOALS`, `Station.js` (input sink), `Seller.js` `makeWant` and the
"wanted food is out" switch, `Shop.js` (inland buyers), `StockLedger.js` `status`, `UI.js` `setPopulation`, `UIv4.js`
`HudV4.layout`, `geumbang/ports_v4.js` `piles` / `takePile`, `geumbang/tuning.js` `catalog` / `collect`,
`BALANCE.warehouse.crew`, `BALANCE.hire2` / `hire3`, `BALANCE.v4.founding`, `BALANCE.v42.porters`). World data was read
with a scratch scan for plot room (§5.2).

The v4.2 touch (큰 식당 back tables, 짐꾼 2 on 8 lines, a 창고 crew that grows with production) is being built in the same
tree. `docs/build_reports/v42_touch.md` appeared while r2 was written, as a draft (its census, tests, bots and perf
sections are still placeholders). What it confirms: `BALANCE.warehouse.crew = { from: 300, perMin: 70, cap: 6, window:
180, every: 60 }`, `v42.porter2.fullForS` 45, 짐꾼 2 on 8 lines; the village makes ≈ 480 a minute when the 창고 is built
(35 min → crew 4) and ≈ 590 in the 46-min village (→ 6, the cap), and **611–654 a minute after the touch** — so the crew
sits at its cap late and the use-need gate (LD4) is what decides how many actually walk in. The fixed 큰 식당 earns
261–317 coins a minute with the chief away (≈ +7–9 % of village income) and serves 10–14 guests a minute, which also
absorbs some cooked fish, smoked meat and bread (LD18). §5.4 and the §9 baselines are re-checked against the finished
report's census before B1 starts (K1).

Nothing in `src/`, `tools/`, `assets/` or the tests was changed for this plan, and nothing was committed.

**The designer's direction** (verbatim):
"원자재들이 빨리소모가 안된다는건 그만큼 수요가 없는거잖아? 빨리 누가 사야하는건데... 그럼 그 원자재를 필요한 공자이나 사업체 상가
잡화점 최종은 고객인데 그것들 더 늘리면 되는거 아니야? 또다른 방법은 철광석은 통조림캔도 들어가지만 공구들 집기류등등 이런쪽도
있잖아 그런것들은 더 놀려서 해결하면되지않아? 그럼 짐꾼은 더 필요하잖아? 예로 나무판자는 공사현장도 가야하고 공사현장이 한두개가
아니잖아? 또한 다른목적 즉 수출하거나등 그러니까 짐꾼이 없어 밀리는것도 분명있어 또한 물류창고나 자재창고 크게 지어서 그쪽으로
옮겨도 되고 그래서 창고는 초반에 있어야 될듯해 각종창고로 옮기는 직원들은 원자재나 상품 만든는숫자와 비례해서 생겨야 될듯해.
물자들은 이런식으로 있는곳에서 남는곳에서 가져오고 가져다주고 이렇 이게 물류시스템 아닌가?"

**Follow-up** (verbatim): "참고로 일꾼 짐꾼들은 따로 관리하는창이 있으면 좋겠어 그래야 놀고 있는 일꾼짐꾼을 일이 많이
필요한곳으로 이직시키고..그러면 전반적인 상업 산업 공업 어업등 각각 현제 상태창도 있어야겠네 이것을 같은 항목으로 묶어야 될까?
따로해야할까?"

---

## 0. Summary

**Diagnosis (measured, late village).** 14 gatherers catch 300 raw a minute; the stations process 253 of a possible
439 with 가공소 2단. 47 raw a minute pile up and 39 of them are walked 2,000–2,900 px to the dock for 1–3 coins each.
The designer is half right:
- **cooked fish and bread** lack buyers;
- **ore** lacks carrying (the ore raw porter spends 21 % of its time walking ore to the dock while the smelter starves);
- **smoked meat** lacks carrying in mid-game (one goods porter caps the far lines at ≈ 33 a minute at 25–35 min), but
  late it is **capped by the 판매대's guests** (≈ 51 a minute can sell; 44 do), so extra meat there only replaces a
  fish or bread sale;
- **logs and wheat** are short, not surplus;
- **no carrier links the fish pile to the cannery** (starved 39 % beside a 72 %-full pile).
The idle people are gatherers (fishermen 39 %, miners 35 %, hunters 46 %), not porters (97–99 % busy, mostly walking).

**Who buys the surplus** (all of it is needed, in this order): the village's processing (stations, cannery, the new
stall, 용광로 3단) → **금방** (v4.3: households order raw fish, meat, logs and wheat; its sled collects full piles) →
plain export at the dock (1–3 coins). The 자재창고 is a basket between them, not a buyer.

**Answer to "같은 항목으로 묶어야 될까? 따로해야 할까?": one window.** **마을 경영** with tabs **현황 · 일꾼·짐꾼 · 물류**.
A red sector card is always caused by that line's people, so a card leads straight to them. There is **no new HUD
button**: the left column is full at 360×640 (`v44_plan.md` D13, checked against `UI.js` / `UIv4.js`). The population
box (popBox) becomes the door from village complete; it **always opens 현황**, carries a small 💤 pip, and a one-time
banner at village complete says the box opens the window. In v4.6 the same window gains 등급 · 행복 · 통계, so the
separately planned 마을 panel (지역 자원, 마을 통계) is not built.

| Version | Theme | Contents | Effort (build + review/fix days) |
|---|---|---|---|
| **step 0 (now)** | probe into the repo | copy the econ probe and its baseline outputs from the session scratchpad into the repo in the next WIP snapshot (§B0) | ≈ 0.1 |
| v4.2 (+ touch) | 촌장의 하루 | as built; the touch adds back tables, 짐꾼 2 on 8 lines, the production-scaled 창고 crew | as planned |
| **v4.2.1** | **물류 손질** (L0) | raw porters stay on their line · 창고 card at village complete (on the M plots already open) · the crew's raw runs come last and its arrivals count only real-use jobs · fish pile → cannery by the crew · standing orders ask for the surplus first (D2) · **솔방울 손님 늘리기** after 읍 (D2b). No new window, no new art, no new plot | **≈ 2.5 + 1** |
| v4.3 | 금방 | as `geumbang_plan.md`; tuned on v4.2 + touch, re-checked on v4.2.1 (it no longer waits for v4.2.1) | as planned |
| v4.3.1 | 시험 도구 | as `v44_plan.md` §3.1b (v4.3.2 adds 2 admin rows, §4.4) | as planned |
| **v4.3.2** | **물류 · 마을 경영 + 새 손님** (L1a + L1b) | L1a: 물류 게시판 · 자재창고 · 이직 (per-slot, price-fair) + 알아서 배치 · the 마을 경영 hub (brings `Shell.js` forward) · event counters for the hub · a bundle-bake prototype (measured, not counted). L1b: 눈꽃 포장마차 · 마을 저녁 잔치 · 대장간 2단 난로 (made to order) · 용광로 3단 (by need). Cut line: L1b → v4.3.3 | **L1a ≈ 8.5 + 2.5 · L1b ≈ 4 + 1.5** |
| art (parallel, now) | 포장마차 | `stall_eomuk` on one small page; `item_eomuk` merged into the resident items page | ≈ 1 + 0.5 |
| v4.4 → v4.6 | as planned | v4.4 reuses `Shell.js` and makes the popBox a stack row (hit 88); v4.4.1 adds `가 보기` through its `Navigator.guideTo`; v4.6 adds 등급 · 행복 · 통계 and its `LedgerRows` to the hub instead of a new 마을 panel | unchanged |
| v5 / v8 | later demand | 가구 공방 moves to v5 (D6); 가전 공장 stays in v8 (D12) | per their plans |

Everything new switches on only **after village complete (≈ 20 min)**, so the first 20 minutes stay as they are.

Expected after the whole track (model, §9; the independence model sits ≈ 4 points above the census): any raw pile ≥ 90 %
from 93 % to **≈ 52–63 %** (gate ≤ 65 %), **≈ 20–48 %** once 용광로 3단 is bought (gate ≤ 50 %); smoked-meat shelf empty
≤ 10 %; income per step inside its band (§10.3; Q9 has no default and is answered before B3).

---

## 1. Decisions

Each line: what was chosen · why. "Draft" = which draft it comes from; "settled" marks a conflict; **(r2)** marks a
decision changed by the critique (finding numbers in brackets).

| # | Decision | Why |
|---|---|---|
| LD1 | **Carrying fixes ship first, demand second.** | Per cost, the carry rules absorb most of the 47 surplus raw a minute (carry §2); new consumers only drain a pile once processing and carrying are fixed (demand §6: D1–D4 alone leave "any pile" at ≈ 93 %) |
| LD2 | **Raw porters never leave their line for export** (carry DL1). With their station input full ≥ 4 s, their pile ≥ 85 % **and the input holding ≥ 15 s of work** they may take a *local* job ≤ 900 px: a workshop or stall input that takes their raw, or (L1a) the 자재창고. The CODE-1 spill to the 창고 / dock goes **(r2 [3])** | Ore raw porter 21 % of its time on dock walks while the smelter starves 15 %; fish raw porter 20 % on 창고 runs; raw at the dock earns 1–3 coins. The work guard keeps a yard run (12–15 s away) from starving the station |
| LD3 | **The 창고 card unlocks at village complete** (`BUILD_UNLOCK.warehouse`: `r:south` → `hire_hunter`) and `GOALS` moves `warehouse` right after `toolsmith` (carry DL2). **No new plot (r2 [26])**: the card uses the M plots already open then (`w_m1` after `zone_hunt`, `w_m2` after `hire_hunter`; `e_m1` / `e_m2` once `tower_east` stands) | "창고는 초반에". 짐꾼 2 needs the 창고 (`LineUpgrades.f4Due`), so the 25–35 min smoked-meat gap closes with it. A scratch scan of `world.js` found no free M footprint within ≈ 600 px of both the 판매대 and the grill outside the plaza floor (zones, roads, pads, decor, trees, life areas, piles); a plaza plot would also add to the busiest view and stay dead in saves that built the 창고 elsewhere. Both 25-min fixtures (smart, arrow-only) still had `w_m1` and `w_m2` free; the smart bot builds its 창고 on `w_m1` by 35 min |
| LD4 | **Crew seats grow with production (the touch's rule, unchanged); a member walks in only when the crew is ≥ 80 % busy *on real-use jobs* and such a job waited ≥ 60 s** (carry DL4). Real use = a sink with prio ≥ 40 (not STORE 10 / SURPLUS 12). Keys live in `warehouse.crew` next to the touch's rule. Never leaves **(r2 [9], [35])** | The r1 gate counted overflow carrying as "busy" and any full output as "backlog", which are true almost all the time late. The crew size is measured, not promised (touch target: 3 at ≈ 380 made a minute, 4 at 470–480, 6 at 590). If the probe shows the gate still reaches 6 with little use work, `warehouse.crew.cap` drops to 5 |
| LD5 | **Fish pile → cannery is a 창고-crew INPUT job in v4.2.1** (when the cannery's fish input is < 50 % and the fish pile ≥ 60 %), and an ordinary board job from v4.3.2 | *Settled*: in L0; cannery starved ≤ 25 % after L0, ≤ 15 % after L1a |
| LD6 | **Standing orders ask for the surplus first** (demand D2) ships in v4.2.1 | One rule in `Growth.js`, no art; station porters then carry surplus cooked fish / bread / cans instead of planks / ingots the 교역소 buys anyway |
| LD7 | **One 물류 게시판** (`HaulBoard`), rebuilt one item type per tick (a full pass ≈ once a second): every source with something to give × every `Logistics` sink that wants it. Idle pool porters pull the best job by urgency and distance. Items move only forward (make → keep → use → exit); keep places never feed each other. New `PRIO`: RESERVE 42 · YARD 14 (carry DL5). **Backfill is a source rule, not a priority (r2 [12], [28])** | Destinations are already pooled (`Logistics.best`), sources are not: both measured gaps are source gaps. Station inputs have one fixed sink priority (`Station.js`: `PRIO.GRILL` 60 whatever the source), so "the yard may give raw to an input only when it is < 50 % and its own pile < 25 %" belongs to the board's source filter |
| LD8 | **New 자재창고** (raw + building materials, 400) on a new M plot `v_mat` by the south crossroads (`cross_s`); reserve 판자 40 + 주괴 20 for sites; backfills starved station inputs; **the one place raw is exported from, with exits sized to its inflow** (station porters read it first, the 금방 sled stops there first, its own crew exports above 80 % of the raw share). It is a basket: its gates are measured at steady state **(r2 [3])**. Art: the `warehouse` sprite + pallets | The 창고 refuses log / wheat / ore / raw meat (`STORABLE`), so there is no raw buffer; ore and meat (the two biggest surpluses) are 400–750 px from `cross_s` instead of 1,850–2,900 px from the dock. Its 240 raw slots fill in ≈ 8–15 min whenever inflow beats its exits, so exits are part of the design |
| LD9 | **이직**: movable = each line's 2nd / 3rd gatherer (`hire2_*`, `hire3_*`) and every 짐꾼 2. Fixed ("줄 지킴") = each line's first gatherer, its raw porter, its first goods porter, operators, clerks, station porters. Free, 60 s cooldown, ≤ 5 gatherers a line, ≤ 3 goods porters a line; offers never reopen after a move. **A person may move into a line only after that line's own `hire2` / `hire3` (or its own 짐꾼 2) was bought, so moves only add a 4th / 5th gatherer or a 3rd goods porter (r2 [15])** | The idle are gatherers while lumberjacks are short. The price rule keeps the per-line ladder (hunter 1,200 · miner 900 · farmer 800 / 600 · fisherman 500 / 450) meaningful: nobody buys cheap fishermen to staff the hunt |
| LD10 | **알아서 배치** off by default; at most one move a minute; never hires, never moves anchors, never changes crew seats, leaves a person the chief moved alone for 5 minutes; **takes people only from a line whose pile was ≥ 90 % for half of the last 3 minutes, and moves them only into lines that are starved or jammed (r2 [14])** | Hysteresis; the chief's choices stay his. The bakery is never starved, so auto never adds wheat |
| LD11 | **One window 마을 경영** with tabs **현황 · 일꾼·짐꾼 · 물류** (v4.3.2). In **v4.6** it gains **등급 · 행복 · 통계**; the 물류 tab folds into the 물류 card's detail, so v4.6 shows 5 tabs (the office's 5 × 136 plates). 지역 자원 = the 현황 tab grouped by region. The separate v4.6 마을 panel is not built | All three drafts agree on one window; the critique agrees. The hub comes first because the designer asked for it now |
| LD12 | **No new HUD button.** The popBox (`UI.js`, (28, top + 152)) becomes the door from village complete and **always opens 현황**; a 💤 **pip ≤ 28 px inside its first 150 px** shows when a *movable* person has been idle ≥ 50 % for 3 min; a **one-time tappable banner at village complete** (`인구 칸을 누르면 마을 경영 창이 열려요`) teaches the door. Other doors: the banner, letters / 서리 소식, the office 재고 / 직원 tabs (once the office stands), (v4.6) the 자원 지도 pins **(r2 [17])** | *Settled against the task's default* ("one HUD button"): `v44_plan.md` D13 measured the left column full at 360×640 (3 stack rows) and the bottom third belongs to the joystick. The popBox counts residents (workers are not residents), so it needs the banner; its hit area is 150 × 56 logical (28 CSS px at 360×640 DPR 2) until v4.4's stack row gives 88 — accepted, with four other doors |
| LD13 | **Brought forward into v4.3.2: `src/scenes/panels/Shell.js` only** (v4.4 B3). `LedgerRows.js` stays in v4.6 and `Navigator.guideTo` in v4.4.1 **(r2 [32])**; until then the hub's detail view uses simple rows from the event counters and a `지도` button (the overview with the place marked) | The hub needs a shell; the other two were what made L1a's estimate too small |
| LD14 | **Demand rules** (demand R1–R8): nothing before village complete; a new consumer's input sits below the line it borrows from; sell where it is made when possible; every consumer is tagged 팔기 · 쓰기 · 보내기; reuse art; one save slice; a sector tag; never the 읍 bar | Keeps the first 20 minutes, the shop-empty gates and the 읍 pacing |
| LD15 | **D1 눈꽃 포장마차** (생선 3 → 어묵꼬치 4, 2 coins, sold on the spot, busiest 17–22 h), offered when the fish pile was ≥ 90 % for 90 s in total; **input prio 40, below the cannery's calm 42 (r2 [4])**; sized on the fish left after the cannery link (§6.5: ≈ 15–20 a minute); new S plot ≈ (480, 990). Zero-art fallback: 생선구이 포장마차 from existing counter, tent and lanterns | Fish is the one raw that needs buyers; selling on the spot needs no porter. Cans earn ≈ 8.7 coins a fish, skewers ≈ 2.7, so the cannery comes first |
| LD16 | **D3 마을 저녁 잔치** (18:00, the 창고's unsellable food, 0 coins, happiness, the table pile baked to one image), **D4 대장간 2단 · 무쇠 난로** (주괴 2 + 판자 1, 30 coins; **made to order** for homes without a stove and the 철물점 shelf, never for the dock (r2 [23])), **D5 용광로 3단** (smelter ×0.5 time, only when processing-limited after 읍) | D3 drains the 창고's cooked fish; D4 answers "공구·집기류" as content (≈ 0 coins once every home has one); D5 is the lever that drains ore once carrying is fixed |
| LD17 | **No 가전 공장 / 가구 공방 in v4.x.** 가구 공방 → v5 (D6, once 이직 adds wood); 가전 공장 stays v8 (D12). Both reuse `src/city/logistics/model/chains.js` and `lgx_producers` | Planks are short until 이직 and ingots already sell without limit; +5.4 MiB and +2 files. The stove (D4) is the v4.x 집기류 |
| LD18 | **Late smoked meat is demand-capped at the 판매대 (≈ 51 a minute) (r2 [2]).** A guest wants meat with probability ½ (`Seller.makeWant`: a random food, then 25 % "newest"), and a guest whose food is out takes another (`Seller.js` serve loop), so each extra meat sale replaces a fish or bread sale (net ≈ 12 − 5.5 coins). **The meat lever is 이직 (one hunter to the forest), the 솔방울 restaurant's town buyers (D2b) and the touch's restaurant; 훈제장 3단 is not offered**; 정육점 / 소시지 (D8) is re-checked after L1b | r1's "+16 smoked meat to the 판매대" and "+50 to +194 coins from 훈제장 3단" do not hold late. Mid-game (25–40 min) the meat gap is real carrying and is fixed by LD3, with the side effect measured (G4) |
| LD19 | **Income gates per step with a tolerance (r2 [33])**: before 읍 the pacing guards (village complete ±5 %, 읍 ±5 %); after 읍, each step's census income must land in its band (§10.3: v4.2.1 +38–53 % over v4.1; L1a Δ +3–10 points over the measured v4.3.1; L1b Δ +1–6; 용광로 3단 Δ +5–12). **Q9 has no default; the designer answers before B3** | A 35-point band could not catch a regression, and its ceiling leaned on the v5 ladder that re-bases on this track |
| LD20 | **Balance** in one block `BALANCE.logistics` with Korean comments; the crew's need gate joins the touch's `warehouse.crew` (one place per system, r2 [35]); D2b's knob joins `v4.founding` | One place for the designer (the v4.4 D24 rule) |
| LD21 | **Saves**: two additive slices, `haul` (≤ 768 B, v4.3.2 L1a) and `demand` (≤ 1 KB, L1b), each kept by a local keep rule in `Save.js` (the G-P5 pattern), no `SAVE_VERSION` bump; v4.4's slice registry and `MIGRATE[7]` carry them. v4.2.1 adds no save field **(r2 [30])** | Older saves load unchanged; `sanitizeSave` drops unknown keys |
| LD22 | **Art**: carrying + hub = 0 new files, 0 MiB resident. D1 = the stall body on one paged page (+1 file, ≈ +1 MiB near the plaza) and `item_eomuk` merged into the resident items page `props_items` (0 files) **(r2 [29])**. Optional on request only: 10 more worker looks | File gate 480 (≈ 457 after 금방); tour peak ≈ 452 of 455 MiB after 금방. The skewer icon also shows in the 금방 app at the depot, where the tour peaks, so it must not page in a 1 MiB sheet there |
| LD23 | **Versions**: L0 = **v4.2.1**, right after the touch, in parallel with GB-CODE-1 (file-disjoint, §4.2). 금방's census tuning (GB-CODE-2) runs on v4.2 + touch and re-checks on v4.2.1 **(r2 [34])**. L1a + L1b = **v4.3.2**, after v4.3.1 (the one-owner rule on `Game.js` / `UI.js` / `Save.js`). Cut line: L1b → v4.3.3 | L0 is small, measured and touches the touch's own files; L1 needs the shell panel and the save / UI files that 금방 and v4.3.1 hold until they land; 금방 no longer waits on L0 |
| LD24 | **The econ probe moves into the repo now** (step 0, §B0: the next WIP snapshot), and v4.2.1 cleans it up. Every gate here is measured with it + the census bot + the pacing bots **(r2 [8])** | It is the only tool that sees every item move and every worker state; today it lives in a session scratchpad that another builder cannot reach |
| LD25 | Sector cards: **어업 · 임업 · 농업 · 광업 · 사냥 · 공업 · 상업 · 물류** (수출 is a line on the 물류 card). The tab is named 현황 and has **no header and no footer** at 360×640; cards 330 × 190 **(r2 [20])** | 8 cards in 4 rows = 790 px against an 888 px body at 360×640 (928 at 390×844), with room for Android insets |
| LD26 | **Surplus priority (r2 [6])**: processing (stations, cannery, stall, 용광로 3단) → **금방** (its sled takes from the 자재창고 above 40 % of the raw share before anyone exports; its racks are fed by the dock as today) → plain export (station porters / crew from the 자재창고 above 60 % of the raw share) | 금방 pays 2–5 coins for raw against the dock's 1–3 and is a final customer (households); this plan must not empty the source 금방 is tuned on |
| LD27 | **D2b 솔방울 손님 늘리기** (v4.2.1): after 읍 the founded shops' town buyers come twice as often (`v4.founding.inlandEveryRank2` 20 s instead of 40) **(r2 [22])** | Zero art, literal answer to "상가 … 고객을 늘리면": the cafe (bread), restaurant (cooked fish, smoked meat) and supermarket (cans, bread) sell exactly the demand-limited goods. ≈ +4.5 foods a minute; restocking is carried by station porters (checked in B1) |
| LD28 | **Hub numbers come from event counters** (`SectorFlow`: made, used, sold, coins, per item and sector, a 60 s ring), not from `StockLedger` count deltas; lines sold to an unlimited buyer (planks, ingots at the 교역소) take their status from output-full and pile shares **(r2 [18], [19], [21])** | The ledger's 1 Hz net deltas report about half the real flow (pile:fish in 27 vs 60 caught in the same run); the 교역소 shelves sit at their display floor 68–71 % of the time, which the ledger reads as short / jam; the office income exists only once the office stands (≈ 40–47 min) |

---

## 2. Goals and gates

### 2.1 Goals (the designer's points → what ships)

| # | Designer's point | What ships | Where |
|---|---|---|---|
| 1 | Raise demand: more factories, shops, customers | D2 surplus-first orders and **D2b 솔방울 손님 늘리기** (v4.2.1); D1 포장마차 (fish), D3 저녁 잔치 (창고 food), D4 난로 (ingots + planks as content), D5 용광로 3단 (ore by need); **금방** (v4.3) is also a customer for raw; v5–v8 ladder D6–D12 | §6, §5.6 |
| 1b | "철광석은 공구·집기류도" | D4 stoves now (살림살이 1단계, made to order), 가구 v5, 가전 v8 | §6.2, §6.3 |
| 2 | More porters: planks to many sites, exports | planks are short, not stuck (sites already SITE 100); the 자재창고 keeps 판자 40 / 주괴 20 for every site; exports leave from one place in full loads | §5.3, §5.5 |
| 3 | Big 물류창고 / 자재창고, early | 창고 at village complete; new 자재창고 by the piles (a basket with sized exits); the 서리 물류창고 (500 racks, 14 used) stays the export market | §5.2, §5.3 |
| 4 | Staff that grow with production | the touch's seats-by-production rule + arrivals by real-use need; one crew for both warehouses | §5.4 |
| 5 | "있는 곳에서 가져오고 필요한 곳에 가져다주고" | the 물류 게시판 | §5.5 |
| 6 | 일꾼·짐꾼 window, move idle people (이직) | 일꾼·짐꾼 tab, idle reasons, 옮기기 (price-fair), 알아서 배치; anchors shown as `대기 · 줄 지킴` and lent to nearby jobs | §7, §8 |
| 7 | 상업 · 산업 · 공업 · 어업 status | 현황 tab: 8 sector cards with made / used / sold, people, idle, the cause and a way to the people | §8 |
| Q | One window or separate? | one hub, three tabs, no new HUD button, always opens 현황 | §8.1 |

### 2.2 Gates (numeric)

Tools: **probe** = `tools/test/econ/probe.mjs` run L (the 46-min save + late setup, chief parked, one game day), S25,
S35 (6 game minutes); **census** = the CODE-2 census bot, the v4.1 46-min save, 60 game minutes (`g60` setup);
**fresh25** = fresh game, smart bot, 25 min; **fresh40** = fresh game, smart bot, 40 min, **median of 5 seeds**, the
bot building the 창고 when its card shows and buying 짐꾼 2 pads (r2 [5]); **pacing** = `review_gameplay_sim.mjs`
smart / arrow / arrow-only, median of 5 seeded runs each (the v4.4 D36 rule). Baselines are re-measured on v4.2 + touch
first. **Census configuration for v4.3.2** (r2 [1], [4]): 자재창고 built and at steady state (pre-filled to its raw share
in the setup), **one hunter moved to the forest** (`hire3_hunter` → lumberjack 4), D1–D4 on; the same run without moves
is reported beside it.

| # | Gate | Baseline (v4.2) | v4.2.1 | v4.3 (금방) | v4.3.2 (end of track) | Tool |
|---|---|---|---|---|---|---|
| G1 | Any raw pile ≥ 90 % (share of time) | census 93 % | ≤ baseline (model 93–95 %) | 금방's own gate ≤ 85 % at Lv1 (model 76–86 %) | **≤ 65 %** (model 52–63 %); **≤ 50 % once 용광로 3단 is bought** (model 20–48 %); without moves reported (model 64–72 %) | census |
| G2 | Each pile ≥ 90 %: ore · meat · fish · wheat | run L 63 · 70 · 72 · 11 % | **smelter processed ≥ 70 a minute and ore ≤ 60 %**, meat ≤ 60 % | reported by 금방's census | L1a (yard steady): ore ≤ 40, meat ≤ 20, fish ≤ 50; L1b: ore ≤ 40, meat ≤ 20, fish ≤ 15, wheat ≤ 10; + 3단: ore ≤ 15 | probe L + census |
| G3 | 판매대 empty, each food (all census samples) | 빵 5 · 훈제 11 · 생선 0 % | each ≤ 10 % | — | each ≤ 10 % | census |
| G4 | 판매대 smoked meat empty at 25–35 min | S25 42 · S35 32 % | **≤ 15 % (fresh40)**; S25 / S35 no worse; side: fish / wheat pile ≥ 90 % at 25–40 min ≤ +10 points, grill / oven blocked reported | — | ≤ 10 % (fresh40) | fresh40 + probe S25 / S35 |
| G5 | 교역소 empty (판자 / 주괴) · smelter / sawmill output ≥ 90 % | 0 / 0 · 19 / 3 % | ≤ 40 % · ≤ 30 % | — | same | census |
| G6 | Raw porters' time on dock / 창고 runs · smelter starved · cannery starved | 7–21 % · 15 % · 39 % | 0 · ≤ 5 % · ≤ 25 % | — | 0 · ≤ 5 % · ≤ 15 % | probe L |
| G7 | First 20 minutes | village complete 19.5–20.7 min; first-20 income 572 a min | village complete ±5 % (median); first-20 income ±5 %; request log identical up to village complete; first-20 shelf-empty and ore-pile shares ±3 points | — | same | fresh25, `reqlog42` |
| G8 | 읍 time | smart 47.3, arrow 49.8, arrow-only 51.5 min | smart and arrow ±5 %; arrow-only ≤ +8 % over v4.1 (as v4.2) | — | same | pacing |
| G9 | Income, census (vs v4.1's 1,851 a minute) | +33 % | **+38–53 %** (model +41–46) | 금방's own gate (≤ +5 points) | **L1a Δ +3–10 · L1b Δ +1–6 · 용광로 3단 Δ +5–12** over the measured step before (orientation: ≈ +46–61 / +50–65 / +56–75); never below the measured v4.2 + touch | census |
| G10 | Longest wait after tower_east (smart) | 3.35 min | ≤ 3.8 min (v4.4 guardrail) | — | same | pacing |
| G11 | Logic per tick, **absolute** (r2 [28]) | plaza 0.226 · office view 0.365 ms | plaza ≤ 0.24 · office view ≤ 0.375 ms | — | plaza ≤ 0.30 · office view ≤ 0.40 ms; no frame with a board rebuild > 0.1 ms (desktop) | `sysprof` |
| G12 | Display objects, any view (late plaza 1,653; z0.6 1,810; `soak42` ≤ 1,916) | — | net ≤ +5 | net ≤ +20 in every view, **measured on a fresh run with the feast at 18:00 and the stall's evening peak in view; no bake or crew saving counted unless measured** (r2 [9], [25], [27]) | — | `perf_cmp`, `soak42` |
| G13 | Textures (source-sum must ≤ 455 MiB) | tour peak 451.4 (≈ 452 after 금방) | +0 | — | +0 resident (≈ +0.01 MiB for `item_eomuk`); ≤ +1.0 MiB near the plaza (stall body page); tour peak ≤ 452.4 **including "hub open + 금방 app" at `17_depot_revealed`** | `texbudget`, `texview2`, `shots` tour |
| G14 | Artifact files (gate 480) | ≈ 412–413 (≈ 457 after 금방) | +0 | — | +1 (`v43_food` page) | `build_artifact` |
| G15 | Saves | — | no new field | — | `haul` ≤ 768 B, `demand` ≤ 1 KB; every older save loads unchanged; fuzz 40 edits × restart clean; worst-case `haul` in the slices fuzz | `save_v42`, fuzz, `mig_real` |
| G16 | 금방 gates (its §8.2: piles, income, stock, order waits) | — | re-check after v4.2.1 (it tunes on v4.2 + touch) | its own | **re-run `gb_drain` and the income / stock / order-wait gates after L1a and after L1b** | 금방 census |
| G17 | 자재창고 raw (share of its 240 raw slots) after 30 min (r2 [3]) | — | — | — | ≤ 80 % average from minute 30 after it is built | probe L, census |
| G18 | Hub numbers against the probe (r2 [18]) | — | — | — | each card's per-minute numbers within 10 % of the probe's event counts in the same run | `hub.mjs` + probe |

Numbers in the v4.2.1 / v4.3.2 columns for G1–G6 come from the drafts' rate models and the independence model (§9),
fitted to the flow-map measurements within 25 %. They are the gates the builder measures against, not results.

### 2.3 Guardrails

1. **Nothing new before village complete** (`progress.complete`). Every offer, rule and door checks it (D2b checks 읍).
2. **No new HUD button**, nothing in the bottom third, hit areas ≥ 88 for new elements (the popBox keeps 150 × 56 until
   the v4.4 stack manager, §8.4), labels ≥ 22 px, body text in the hub ≥ 26 px (v4.4 §19.3).
3. **Cosy**: nobody is fired or sent away; a move is free; nothing is lost; red cards never block; 알아서 배치 is off
   until the player turns it on; the feast never charges coins.
4. **Shops first**: a new consumer's input priority sits below the line it borrows from (stall fish **40** < the
   cannery's calm 42 < GRILL 60; feast 44 < SHELF_LOW 45; smoked meat at the feast only while the meat shelf is ≥ 50 %).
5. **Every number** lives in `BALANCE` (`logistics`, `warehouse.crew`, `v4.founding`) with a Korean comment;
   `balanceCheck.js` gets ranges.
6. **Read-only modules**: `src/{story,missions,bank,vehicles,harbor,beach,city}/**` are not edited. `src/city/logistics`
   is read for D6 / D12 later, not imported in v4.x. The only 금방 edit is the additive port change in §5.6 and two
   catalogue rows.

---

## 3. What the measurements say (summary of `logistics_flow_map.md`)

### 3.1 Per raw (run L, late village, per game minute)

| Raw → good | Caught · processed · cap (2단) | Pile ≥ 90 % | Verdict | Fix in this plan |
|---|---|---|---|---|
| 생선 → 구운 생선 / 통조림 | 59 · 47 · 114 | 72 % | **demand** (cooked fish) + a **missing link** to the cannery | LD5 link; D2, D2b; D1 stall; D3 feast |
| 통나무 → 판자 | 51 · 50 · 91 | 0 % | **short** (lumberjacks walk 82 %) | 이직 into the forest (LD9) |
| 밀 → 빵 | 52 · 46 · 83 | 11 % | **demand** (small) | D2, D2b, D3; the touch's restaurant |
| 광석 → 주괴 | 63 · 54 · 76 | 63 % | **carrying** (raw porter's dock walks; +22 ingots a minute to carry), then processing | LD2; LD3 → 짐꾼 2; D5 용광로 by need |
| 생고기 → 훈제 고기 | 74 · 58 · 76 | 70 % | mid-game **carrying**; late **guest-capped at the 판매대** (≈ 51 a minute sell, 44 do) | 창고 early (LD3) → 짐꾼 2 earlier; late: 이직 one hunter out, D2b, the touch's restaurant (LD18) |
| Everything → dock / 물류창고 | 39 walked a minute, 2,570 px a trip | — | **carrying** (the 물류창고 racks hold 14 of 500) | exports from the 자재창고 only, full loads, after 금방 (LD8, LD26) |

### 3.2 People

| Who | Idle | Walking | Note |
|---|---|---|---|
| Fishermen · miners · hunters | 39 · 35 · 46 % | 19–31 % | full piles; hunters also wait for animals (27 %: 5 animals for 3) |
| Lumberjacks · farmers | 0 · 2 % | 82 · 81 % | far trees and fields |
| Operators (7 stations) | blocked 27 %, starved 20 % | — | stay at their stations |
| Raw porters | 16 % | — | station full / pile empty; 7–21 % on spill runs |
| Goods, 창고, station porters | 1–3 % | 85–92 % | busy, partly on the wrong job (the crew carries 13.5 unsellable cooked fish a minute into the 창고) |
| 도구 짐꾼 (anchor) | 100 % at 25–35 min | — | nothing to carry; lent to nearby board jobs from L1a (§7.3) |

### 3.3 Stages

0–20 min: supply-limited, only the ore pile fills before the ore porter (16.6 min) → no change. 25–35 min: the far
goods routes cap smelter and smokehouse at ≈ 33 a minute (carrying). 35 min on: cooked fish and bread wait for buyers;
smoked meat is limited by the 판매대's guests. Late: stations at 58 % of their capacity.

### 3.4 Per-porter rate (model fitted to the probe's trips, within 25 % of every measured carrier)

`R ≈ 60·L ÷ (d/75 + 0.28·L)` items a minute, `d` = walked one-way px, `L` = load. ≈ 50–60 on 150–300 px; **31** on
1,730 px (L 14), **22** on 2,209 px (L 12), **14.5** on 2,885 px (L 10); a crew raw run from a far 창고 (≈ 6,600 px
round, L 10) ≈ 6.6. Porters a flow needs = flow ÷ R.

### 3.5 What sells, and who else buys (r2 [2], [6], [22])

| Buyer | Takes | Limit (late village) |
|---|---|---|
| 판매대 guests | bread 28.8 · smoked meat 44.1 · cooked fish 29.3 a minute (102.2 in all) | a guest's want is ½ meat, ¼ each other food; when the wanted food is out the guest takes another, so the foods trade sales. Meat can rise ≈ +7 a minute at most, and only by replacing fish / bread |
| 큰 식당 (touch) | cooked fish, smoked meat, bread at its tables | being measured by the touch |
| 솔방울 founded shops (town buyers) | cafe bread · restaurant cooked fish + smoked meat · supermarket cans + bread | one item per 40 s per shop (`Shop.js`, `v4.founding.inlandEvery`) → D2b doubles it after 읍 |
| 교역소 merchant | planks, ingots | unlimited (buys at once) |
| 금방 households (v4.3) | catalogue raw fish 1.0 · raw meat 1.0 · logs 1.0 · wheat 0.6 (no ore, no ingots), at 2–5 coins, from the depot racks; its sled collects full piles (≥ 85 %, keeps 40 %, ≈ 5–6 items a minute) to the dock | its own census (any pile 93 → 86 % at Lv1, 64 % with 2 sleds, measured without carry fixes) |
| Dock → 물류창고 | anything | 1–3 coins for raw |

---

## 4. Scope and version placement

### 4.0 Step 0 — now (r2 [8])

The econ probe and its outputs exist only in this session's scratchpad
(`/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/econ/`). Whoever makes the next WIP
snapshot copies them into the repo unchanged (§B0); B1 then cleans them rather than fetching them. This document step is
docs-only and did not copy them.

### 4.1 Order

| Step | What | Depends on | Owner (incl. the layout / census tools for that step, r2 [34]) |
|---|---|---|---|
| 0 | probe + baseline into the repo (§B0) | nothing | orchestrator, next WIP snapshot |
| 1 | v4.2 + touch publishes | the touch's report | touch builder |
| 2 | **v4.2.1 물류 손질 (L0)** | step 1; re-run the probe on the touch source first | touch builder (owns `tools/test/econ/**` and `lgx_l0.mjs`; does not edit `v42_layout.mjs`) |
| 2' | GB-CODE-1 P0 / P1 (금방 model, views, stand-ins) | step 1 | 금방 builder, **in parallel with 2** |
| 2'' | 포장마차 art (B4) | nothing | art pipeline, now |
| 3 | GB-CODE-2 (금방 census tuning, G1b sled) | step 1 (tunes on v4.2 + touch); **re-checks `gb_drain` and its gates once step 2 lands** | 금방 builder (owns `v42_layout.mjs` and the census tools in this step) |
| 4 | v4.3 publishes | 3 | |
| 5 | v4.3.1 시험 도구 | 금방 G-P1 / G-P5 / G-P13 | v4.3.1 builder (owns `Save.js`, `Game.js`, `UI.js`) |
| 6 | **v4.3.2 L1a** (board, 자재창고, 이직, hub) | 5 (the same three files) | logistics builder (owns `v42_layout.mjs` + census tools from here) |
| 7 | **v4.3.2 L1b** (D1, D3, D4, D5) | 6 (D3 needs the board; D1 the local job and the stall art); **Q9 answered** | logistics builder; cut line → v4.3.3 |
| 8 | v4.4 | 7 (or 6 if L1b is cut) | as planned; reuses `Shell.js` |

### 4.2 Why part of it ships earlier (v4.2.1), and why not inside v4.3

- **Measured value per cost**: the L0 rules are the flow map's ranks 1–3 (smelter and cannery fed, the 25–35 min
  smoked-meat gap closed) plus two cheap demand rules (D2, D2b), for ≈ 2.5 build days, with no art, no plot and no window.
- **File-disjoint from 금방**: L0 edits `Worker.js` (`RawPorter`, `WarehousePorter`), `WarehouseCrew.js`,
  `Progression.js` (`BUILD_UNLOCK`, `GOALS`), `Growth.js` (standing cards), `Shop.js` (D2b, one line),
  `balance.js` / `balanceCheck.js` (new keys), `tools/test/econ/**`, `tools/test/lgx_l0.mjs`, and the bot (buy pads).
  금방's patches G-P1–G-P15 edit `Game.js`, `Save.js`, `UI*.js`, `DepotSystem.js`, `DepotBuilding.js`, `TownSim.js`,
  `Residency.js`, `Assets.js`, `Townfolk.js`, `RoadPaint.js`, `OfficePanel.js`, `VillageNews.js`, pilot files, and
  `world.js` / `balance.js` / `strings.js` in their own blocks. The only shared file is `balance.js` (additive keys).
- **Same owner**: the touch builder is already in `Worker.js`, `WarehouseCrew.js` and `LineUpgrades.js`.
- **No schedule chain (r2 [34])**: 금방 tunes on v4.2 + touch and re-checks after v4.2.1 (it has to re-check after L1
  anyway, G16), so a late v4.2.1 does not push v4.3 or v4.4.
- If the touch has not published yet and the designer prefers one update, L0 can ride inside it (+≈ 2.5 days to the
  touch); the plan's default is a separate v4.2.1.

### 4.3 Why L1 comes after v4.3.1 and before v4.4

- L1a edits `Game.js` (hire functions read job slots, construct the board and `Jobs` after `buildV42`), `UI.js` (the
  popBox door) and `Save.js` (keep rules for `haul`). Those three belong to the 금방 builder and then to the v4.3.1
  builder (v4.4 B2: "one builder owns `Save.js`, `Game.js` and `UI.js`").
- v4.4 builds `Shell.js` and the stack manager. Building `Shell.js` in v4.3.2 means v4.4 reuses it; the stack manager
  then registers the popBox (with the hub door and pip) as the pop / rank row.
- The designer asked for the window now; v4.4 is ≈ 8 + 3 days, v4.4.1 ≈ 5 + 2. Putting L1 inside v4.4 would make the
  largest version larger.

### 4.4 What later versions inherit

| Version | Inherits / changes |
|---|---|
| v4.3.1 | two admin rows (`v44_plan.md` §18.2 grows with each version): `물류 발판 바로 열기` (자재창고, 포장마차, 대장간 2단, 용광로 3단 offers appear at once) and `알아서 배치 빠르게` (every 5 s instead of 60) — only once v4.3.2 code exists; the rows are added by the v4.3.2 builder through `src/admin/switches.js` |
| v4.4 | `Shell.js` exists (B3: reuse, do not re-create); the stack manager's pop / rank row is the hub door, hit 150 × 88, pip inside; `haul` and `demand` join the slice registry and `MIGRATE[7]` copies them through; the stall till joins the till registry (D29); `seedI` re-measured after v4.3.2 |
| v4.4.1 | `Navigator.guideTo` arrives (its own version): the hub's detail gains `가 보기`; quests may point at the hub ("마을 경영 창 열어 보기", "쉬는 일꾼 한 명 옮겨 보기") as state facts, never one-time events (D31) |
| v4.6 | the hub becomes the 마을 panel: + 등급 · 행복 · 통계 tabs, 물류 folds into the 물류 card (5 tabs × 136); `LedgerRows.js` (its own version) serves the 현황 detail and the office 재고 tab; 자원 = 현황 grouped by region (a `산업별 / 지역별` toggle) with TOP 3 and 해결하러 가기; the 자원 지도 pins open 현황; D3 and D4 count for the 즐길 거리 and 집 needs |
| v5 | D6 가구 공방 (from v8, at half v8's prices), D7 주민 장보기; the v5 ladder re-bases `I` on the income measured after this track |
| v6 / v7 / v8 | D9 수산시장 · 수출선, D10 케이크, D11 해변 먹거리, D12 가전 공장 (without the stove: §18) |

### 4.5 Not in scope (considered and not chosen)

| Idea | Why not |
|---|---|
| 가전 공장 / 가구 공방 in v4.x (flow map rank 7) | planks are short until 이직; ingots already sell without limit; +5.4 MiB and +2 files |
| Bigger piles (40 → 80) | stores raw where nobody can use it; the 자재창고 holds it where it can backfill and leave in one load |
| 서리 물류창고 earlier | 6,000 coins + ≈ 23 MiB of centre pages for no throughput gain (its racks are nearly empty) |
| Fewer gatherers (v4.2 §2.3 option ①) | "hired but vanished"; 이직 moves them to where work is instead |
| 원료 수레 upgrade (option ②) as a separate porter | the 자재창고 + crew do the same bulk carrying with existing art and one rule set |
| A 2nd smelter / smokehouse building | same effect as 3단 but needs a plot, an operator and more carrying |
| 훈제장 3단 (r2) | late meat is guest-capped (LD18): faster smoking would fill the 창고, not sell |
| More 판매대 guests / a 4th food at the 판매대 | the same guests split their wants: no new demand (the 솔방울 shops' own buyers are new demand: D2b) |
| 정육점 / 소시지 now | re-checked after L1b (D8) once the hunter move and D2b are measured |
| A 창고 plot near the plaza (r1 `v_wh`) | no free M footprint within ≈ 600 px of both the 판매대 and the grill; busiest view; dead plot in other saves |
| Tools wear out · 못 as a building material · 돌길 닦기 · 눈길 자갈 | penalty against the cosy rules · changes the first 20 minutes · the 읍 ceremony already cobbles the streets · a new speed system |
| Forklifts / delivery vans for the crew | +3.8–12 MiB while on screen; porters already carry; 금방 vans do home deliveries |
| Station porters movable by 이직 | remote work; keeps the station district fed (Q12) |

---

## 5. Carrying

### 5.1 Raw porters stay on their line (LD2, v4.2.1)

| Situation | Today (CODE-1/2) | v4.2.1 |
|---|---|---|
| Station input has room | pile → input | same |
| Input full, pile ≥ `pileStart` 85 % | a full load to the dock (any raw) or the 창고 (raw fish) | waits; after 4 s, **if the input holds ≥ `raw.workS` 15 s of work**, it may take a **local job** ≤ `raw.localPx` 900 px straight: a workshop / stall input that takes this raw (L1b's stall is 562 px from the fish pile), or (L1a) the 자재창고 (YARD 14) |
| Pile surplus for export | raw porters + 창고 porters (`whRaw`) + station porters (`pilePrio` 33) | the 창고 crew (raw runs **last**, §5.4) and station porters; (v4.3) the 금방 sled; the raw porter no longer |
| After the 자재창고 stands (L1a) | — | raw is exported only from the 자재창고 (one source, full loads), after 금방 (LD26) |

Code: the `RawPorter` load state drops the spill branch (`logistics.raw.stayOnLine: true`); local jobs come from a small
list (`localSinksFor(pile)`; the board's jobs from L1a).

### 5.2 창고 at village complete (LD3, v4.2.1)

- `BUILD_UNLOCK.warehouse = 'hire_hunter'` (village complete); `GOALS`: `warehouse` right after `toolsmith`.
- **No new plot.** The card uses any free M / L plot, as today. At village complete `w_m1` (after `zone_hunt`) and
  `w_m2` (after `hire_hunter`) are open, and `e_m1` / `e_m2` once `tower_east` stands; both 25-min fixtures (smart,
  arrow-only) had `w_m1` and `w_m2` free (the bots build the toolsmith on `e_m1`; the smart bot builds the 창고 on `w_m1`
  by 35 min). `lgx_l0.mjs` checks on fresh25 (5
  seeds) that an M plot is free when the card shows; if none is, the card says `빈 땅이 생기면 지을 수 있어요` (the
  existing locked-reason pattern).
- Cost unchanged (600 + 판자 14 + 주괴 4, 10 s); the 2 porters come with it.
- Consequence: 짐꾼 2 offers (`f4Due` needs the 창고) can come from ≈ 22 min instead of ≈ 32. The plaza view gets
  nothing new (r2 [26]).
- Pacing risk: more income at 25–35 min (smoked meat sells at 12 where fish / bread sold at 4–7, LD18). If 읍 moves
  earlier than −5 %, raise `v42.porter2.costs` for smelter and smokehouse first (800 / 900 → 1,100 / 1,200), then the
  창고 cost.

### 5.3 자재창고 (LD8, v4.3.2 L1a)

| Item | Value (`BALANCE.logistics.material`) |
|---|---|
| Offer | after the 창고 stands **and** a measured need: a raw pile ≥ 90 % for 120 s in total, or a site waited 60 s for 판자 / 주괴 (one banner, once per save, the `LineUpgrades` offer pattern) |
| Plot | `v_mat` (M, region `start`, `only: 'material'`) beside `cross_s` (990, 2040); candidates (1,090, 2,110) east or (880, 2,110) west; the layout test picks the first free one. Once a 자재창고 stands anywhere else, `v_mat` takes a house or decor (no dead plot) |
| Straight distances from (1,080, 2,060) | 고기 걸이 412 · 훈제장 358 · 제련소 502 · 광석 더미 709 · 밀 더미 904 · 오븐 908 · 제재소 945 · 통나무 더미 1,104 · 남쪽 부지 848 · 짐 싣는 곳 2,209 |
| Cost | 900 + 판자 16 + 주괴 6, 10 s |
| Holds | 400; raw ≤ 60 % (240); materials (판자, 주괴) the rest; refuses goods and raw fish (foods, cans, tools, raw fish go to the 창고) |
| Reserve | 판자 40, 주괴 20 for sites, filled at RESERVE 42 (after SHELF_LOW 45, before the 교역소 SHELF 40) |
| Gives | sites and hire pads (SITE 100); workshop inputs (INPUT 70); **backfill** (a board source rule, LD7): raw to a station input only when that input is < 50 % and its own pile < 25 %, until the input is 80 %; exits in the LD26 order: the 금방 sled first (raw above `sledFrom` 40 % of the raw share), then station porters and its own crew (above `exportFrom` 60 %) |
| Takes | raw from a pile ≥ 85 % whose station input is full (YARD 14), until 95 % of the raw share, again from 85 %; planks / ingots at RESERVE |
| Crew | 1 comes with it; pool seats +1 (cap 2); **when raw ≥ `crewExportAt` 80 % of the raw share, its crew takes full export loads to the dock** (2,209 px, ≈ 22 a minute a porter at L 12) |
| Look | the `warehouse` sprite (resident with the 창고 in `bld_buildings`), label `자재창고 120/400`, three pallets from `lgx_items` (`pallet_planks`, `pallet_ingots`, `pallet_ore`, + `pallet_logs` when it holds logs) as one baked pile |
| Save | contents in `haul.mat`; the building in the buildings save under a new key `material` (added to `sanitizeSave`'s building list and the `UNIQ` list) |

**It is a basket, not a buyer (r2 [3]).** Surplus inflow after LD2 ≈ ore 16–22 + meat 4–16 + wheat 2–7 ≈ 22–45 a
minute. Exits: station porters reading it first (≈ 24 a minute of raw export measured today from the piles), the 금방
sled (≈ 5–6), its own crew above 80 % (≈ 22 a porter) ⇒ ≈ 50 a minute, above the inflow's top. Without the crew export
it fills in ≈ 8–15 min whenever inflow beats ≈ 30 a minute, after which the piles fill again. Hence: the L1a pile gates
are measured **at steady state** (the probe setup pre-fills the yard to its raw share, or reports minutes 20–60 after it
is built), and **G17** checks it stays ≤ 80 % on average after 30 minutes.

One building for raw **and** materials: the two biggest raw surpluses are next to it and the southern / western sites
are 850–1,500 px away.

### 5.4 Logistics crew (LD4)

```
seats    = the touch's WarehouseCrew.target(): clamp(2 + ⌊max(0, made a minute − from) ÷ perMin⌋, 2, cap)
           (BALANCE.warehouse.crew: from 300, perMin 70, cap 6 → 3 at ≈ 380 made a minute, 4 at 470–480, 6 at 590)
           + material.crew (1, cap 2) once the 자재창고 stands
crew     = every pool member, at the 창고 and the 자재창고 (r2 [11]: crew() counts both buildings)
one more walks in when crew < seats
                  and useBusy ≥ warehouse.crew.busyAt 0.8   (share of crew samples on a job whose sink prio ≥ useFrom 40,
                                                              EWMA over warehouse.crew.window 180 s)
                  and a use job (prio ≥ 40) waited ≥ warehouse.crew.backlogS 60 s for a free member
                      (v4.2.1: the crew's own job scan; v4.3.2: HaulBoard.unclaimed(prio ≥ 40))
                  and ≥ warehouse.crew.every 60 s since the last arrival
```

- STORE 10 (overflow into the 창고), SURPLUS 12 (the dock) and YARD 14 never count as "busy" or "waiting" (r2 [9]).
- **Job order in v4.2.1 (r2 [10])**: `WarehousePorter.think()` today returns a long raw run (pile full ≥ 2 ×
  `pileForS`) before overflow / direct jobs (`Worker.js` raw.long branch). v4.2.1 orders: 1 out (prio ≥ 45) → 2
  overflow / direct → 3 the fish → cannery link (LD5) → 4 raw runs to the dock, only when 1–3 found nothing.
- Arrive as in the touch (walk in from the nearest village entry, banner `물류 직원이 왔어요`, a line in 서리 소식).
- **Home** = the building with the larger use backlog when it arrives; the pool works for both buildings. The homes are
  saved as counts (`haul.ch`), and `afterRestore` restores each building's count (r2 [11]).
- No housing; crew, gatherers and porters do not count toward `population3`.
- Saves made with the touch keep their crew (never below what was there).
- Expected: measured, not promised. Need from §5.7 ≈ 3.5–4.5 members late; the cap stays 6, or drops to 5 if the
  probe shows 6 with use-busy < 70 %.

### 5.5 물류 게시판 (`HaulBoard`, LD7, v4.3.2 L1a)

**Who decides.** The board proposes, the porter accepts. It rebuilds **one item type per tick** (a full pass ≈ once a
second, never a whole rebuild in one frame) and writes:
- **Supplies**: station / workshop outputs above `Porter.keepFor`; piles ≥ `pileStart` 85 % with the station input full,
  down to `pileKeep` 60 %; the 창고 and the 자재창고 (minus the reserve for non-site sinks; backfill only under the LD7
  source rule); the boat catch.
- **Needs**: every `Logistics` sink's `want(type)` with its `prio(type)` (sites, food box, workshop inputs, shelves,
  pantry, founding / wholesale, the dock's surplus sink, the 창고, the 자재창고's RESERVE / YARD, the stall, the feast
  table, homes' stove room — registered only while that home has an order, §6.2 D4, so the sink list does not grow by
  the number of houses).

It matches them into jobs `{ src, type, n, sink, prio, d }`. An idle pool porter (or a station porter for remote jobs,
a raw porter for a local job, or an idle anchor goods porter for a local job, §7.3) calls `board.pick(porter)`; the job
is claimed and reserved at the sink (`Logistics.reserve`) and the source (`board.hold`); a claimed job drops after
120 s. Goods porters p1 / p2 keep their own rule (their output → `Logistics.best`); raw porters keep their line. The
board adds only the jobs nobody's own rule covers.

**Tiers.**

| Tier | Places | Gives to | Takes from |
|---|---|---|---|
| 0 make | piles, station / workshop outputs, boat catch | tiers 1–3 | — |
| 1 keep | 창고, 자재창고 | tier 2 at prio ≥ 45, SITE, INPUT, backfill (source rule); tier 3 only its own surplus (창고 ≥ 70 %; 자재창고 above `sledFrom` for the sled, above `exportFrom` for the dock) | tier 0 only |
| 2 use | station and workshop inputs, sites, hire pads, shelves, pantry, food box, founded shops, stall, feast table, homes with a stove order | — | tiers 0, 1 |
| 3 exit | 금방 sled first, then 짐 싣는 곳 (train, sleigh → 물류창고) | — | tiers 0, 1 |

**New `PRIO`** (the rest of the ladder unchanged):

| Name | Value | Sink |
|---|---|---|
| RESERVE | 42 | the 자재창고's 판자 / 주괴 until the reserve (after SHELF_LOW 45, before SHELF 40) |
| (stall input) | **40** | D1, fish only (below the cannery's calm input 42 and GRILL 60) |
| (feast table) | 44 | D3, 17–19 h (below SHELF_LOW 45) |
| YARD | 14 | raw into the 자재창고 (after WHOLESALE 30, before SURPLUS 12: raw is kept before it is exported) |

**Matching**: needs sorted by prio (urgent ≥ 46 first, as `Logistics.best`); for each, the nearest supply of that type
the tiers and source rules allow; `n = min(need, supply, bag)`; a trip longer than `farPx` 1,200 px below prio 45 and
not a site waits for `minLoadFar` 6; sinks of the same type within `batchPx` 300 px join one trip.
`pick(porter)`: score = prio − (d(porter, src) + d(src, sink)) ÷ 300 (prio ≥ 46 keeps its full rank); ties → the
bigger load.

**No ping-pong**: items only move up the tiers; a keep place never gives to another keep place; a keep place does not
take back a type it gave out in the last `flapS` 60 s; hysteresis (pile gives 85 → 60 %, keep place takes until 95 %,
again from 85 %, backfill from < 50 % to 80 %); a loaded job only changes destination when its sink went away or filled
(then the next sink with prio ≥ job prio − 10, else the nearest keep place that takes it); a dock item never comes back.

**Who may take which jobs**

| Carrier | Sources | Sinks | Change |
|---|---|---|---|
| Raw porter | its pile | its station input; local jobs ≤ 900 px (자재창고 YARD, a workshop / stall input that takes its raw) with the work guard | LD2 |
| Goods porter p1 / p2 | its output | `Logistics.best` | none (p2 movable, §7); an idle **anchor** p1 may take one local job ≤ 900 px from its home (§7.3) |
| Pool (창고 + 자재창고 crew) | tiers 0–1 | tiers 1–3 village sinks; the dock only from a keep place (until the 자재창고 stands, the v4.2.1 raw runs stay, last in order) | replaces `WarehousePorter.think()` / `rawJob()` |
| Station porter | tiers 0–1 | remote sinks (founding, shops, wholesale, the dock) | `think()` reads the board's remote jobs; raw at `pilePrio` 33 only from the 자재창고 once it stands, above `exportFrom` |
| Chief | anything | anything | unchanged (`Navigator` rules; `Logistics.chief` reservations) |

### 5.6 Exports and 금방 (LD26, r2 [6])

- Dock, cargo sleigh, "썰매 한 대 더": unchanged. Raw arrives in fewer, fuller loads from the 자재창고.
- **금방 sled 집하** (v4.3 G1b; piles ≥ 85 %, keeps 40 %, ≈ 5–6 items a minute over a day; it takes any raw, ore
  included, to the dock): one additive change in `geumbang/ports_v4.js` `piles()` — the 자재창고 is listed **first** as a
  pile-like source (its raw above `sledFrom` 40 % of the raw share), and `takePile` takes from it like a pile. While a
  sled is assigned to a source the board marks it `claimed: 'sled'` and porters skip **export** jobs from it.
- **Order of claims on surplus raw**: processing first (stations, cannery, stall, 용광로 3단 — the board's use sinks
  outrank every exit), then the sled (above 40 % of the yard's raw share), then plain export (above 60 %). If 금방's
  racks run short of a raw item (its order-wait gate fails in G16), `material.exportFrom` for that item rises (the yard
  keeps more for the sled) before anything else is tuned.
- The 금방 hub is not a village sink; its stock comes from the depot racks (its own rule, fed by the dock). The fish
  pile is not in the yard; with the cannery link and the stall, the fish pile rarely reaches 85 %, so the sled carries
  little fish and 금방's fish orders lean on the racks. G16 re-runs `gb_drain` and 금방's income / stock / order-wait
  gates after L1a and after L1b.

### 5.7 Porter need after the fixes (model §3.4)

| New flow (a minute) | Walked | Per porter | Porters |
|---|---|---|---|
| **+22 ingots** smelter → 교역소 (the smelter at its full 76; r2 [1]) | 1,730 px | 25–31 | 0.7–0.9 (a 3rd carrier on that line: the pool's direct runs, or a moved 짐꾼 2 in L1a) |
| +7 smoked meat smokehouse → 판매대 (the guest cap, LD18) | 1,300 px | 31 | 0.25 |
| +12 fish, fish pile → cannery | ≈ 1,400–1,800 px (the cannery's plot) | 29–30 | 0.4 |
| today's 창고 in / out (24–30) | 2,138 px | 19 (measured 12–15) | 1.4–2 |
| **Pool need** | | | **≈ 3–3.5 → 3.5–4.5 members at 85 % busy** |

---

## 6. Demand

### 6.1 Rules

| # | Rule |
|---|---|
| R1 | Nothing before village complete (D2b: after 읍); offers use the `LineUpgrades` pad pattern (measured need, one banner, once per save) |
| R2 | Surplus-only inputs: a new consumer's input priority sits below the line it borrows from |
| R3 | Sell where it is made when possible (the stall cooks and sells on one spot: no goods porter) |
| R4 | Tags: **팔기** (shop price) · **쓰기** (the village uses it: feast, home stoves; few coins, happiness) · **보내기** (export at 0.5–0.7 × price) |
| R5 | Reuse art; new art only where the read needs it |
| R6 | One save slice `demand` |
| R7 | Every consumer reports to the hub's event counters with a sector tag (`SectorFlow`) and registers with `StockLedger` for the office |
| R8 | Never touches the 읍 bar (`Growth.happiness()`, v4.4 D34); happiness effects go to the v4.6 needs |
| R9 | **Every coin lands in a registered till** (r2 [24]): the stall's till joins `villageTills` (딸랑이, 관망) and v4.4's till registry (D29); stove payments go to the 철물점's till (from shops) or the 판매대 till (homes) |
| R10 | **No consumer moves the pile instead of draining it** (r2 [2]): a demand item is sized on the buyers it adds, not on what it takes from the shelf of another food |

### 6.2 The v4.x consumers

| # | Player name | What | When (trigger) | Input → output · price | Effect a minute (model) | Coins a minute | Version |
|---|---|---|---|---|---|---|---|
| D2 | **주문판이 남는 물건을 먼저** | a standing card picks the item with the highest surplus score (output ≥ 80 % for 60 s, + its 창고 stock); planks / ingots only when nothing else is; rotation as today when nothing is in surplus | with the standing cards (after the 5 founded shops, ≈ 38 min) | wholesale 0.7 × price + bonus | ≈ 3 cooked fish | +11 | **v4.2.1** |
| D2b | **솔방울 손님 늘리기** (new, r2 [22]) | after 읍, each founded shop's town buyers come every 20 s instead of 40 (`Shop.js` inland sale while stocked) | 읍 | the shops sell what they stock; restock as today (station porters, wholesale into the station till) | ≈ +4.5 foods (cooked fish ≈ 1.5, bread ≈ 1.5, cans ≈ 0.75, smoked meat ≈ 0.75) | ≈ +25 | **v4.2.1** |
| D1 | **눈꽃 포장마차 (어묵)** | a stall that turns surplus fish into hot fish-cake skewers sold on the spot to its own guests (town dolls; busiest 17–22 h ×1.6; 13.8 guests a minute on average, 32 at the peak; queue ≤ 6) | fish pile ≥ 90 % for 90 s in total after village complete (≈ 30–35 min); fallback offer at 읍; S plot `v43_stall` ≈ (480, 990) beside the 게시판; 1,200 + 판자 10 + 주괴 2, 8 s; the owner (어묵 할머니) comes with it | 생선 3 → 어묵꼬치 4, 2.4 s; 2 coins (동네 값); input pad 24 (the evening peak draws from it), shelf 40; fish by the fish raw porter's local job (562 px), the pool, the chief; **input prio 40** | **≈ 15–20 fish** on average (the fish left after the cannery link, §6.5) | **+40–53** | L1b |
| D3 | **마을 저녁 잔치** | daily 18:00–19:00 at the 마을 마당 모닥불 (`green_fire`), 70 % of residents come, 2 foods each, ≤ 90 a feast; cooked fish and bread first, smoked meat only while the meat shelf ≥ 50 %; **the table's food is one baked image** (r2 [25]) | after village complete + 창고 + 마을회관, when the 창고 holds ≥ 30 food | 0 coins (쓰기); feast-table sink prio 44, 17–19 h, fed by the pool | 5–9 foods (the 창고 stops filling with cooked fish → ≈ +4–6 fish and +2 wheat taken from the piles) | 0 | L1b |
| D4 | **대장간 2단 · 무쇠 난로** (살림살이 1단계) | the 대장간 casts a stove **only for an order** (r2 [23]): a home without a stove (each such home registers a stove sink, room 1, while it waits) or the 솔방울 철물점 shelf below 2 stoves; never for the dock; tools always first (`pickTool()`) | after 읍, the 대장간 idle ("no order") ≥ 60 % over 180 s → pad 1,500 | 주괴 2 + 판자 1 → stove, 6 s, 30 coins (homes pay into the 판매대 till, the 철물점 into its own); carried by the 도구 짐꾼 (idle 100 % mid-game) | ≈ 15–25 stoves over ≈ 10 minutes, then one per new house and the 철물점's ≈ 1.5 a minute | ≈ +17 while homes are furnished, ≈ 0 after (content, not income) | L1b |
| D5 | **용광로 3단** (smelter only; r2 [2]) | `timeMult` 0.66 → 0.5: cap 76 → 100 a minute. The extra output needs ≈ 1–1.5 more carriers on the far route (smelter → 교역소 1,730 px at 25–31 a porter): a moved 짐꾼 2 (the line may hold 3 once its own 짐꾼 2 is bought) or the pool's direct runs | after 읍, the ore pile ≥ 90 % for 120 s in total **while** the smelter input is full and the operator busy ≥ 90 % (processing-limited; never where carrying or the 자재창고 is the limit) | 2,400 | ore +16 | +162 | L1b |

Details from the demand draft stand (player texts, bubbles, VillageLife flavour, House stove puffs and window glow, the
금방 catalogue: `item_eomuk` weight 0.6, price 2; `item_stove_iron` weight 0.1, price 24 — 금방 stove orders count as
D4 orders). The 훈제장 3단 row of r1 is removed (LD18).

### 6.3 Later ladder (v5–v8)

| # | Consumer | Stage / trigger | Inputs → product → buyers | Art |
|---|---|---|---|---|
| D6 | 가구 공방 (살림살이 2단계) | v5, when planks reach the 교역소 ≥ 60 a minute for 5 min (after 이직) | `chains.js` Producer: 판자 3 → 의자 · 탁자 · 소파 · 침대 · 옷장 (least stocked next); homes, 목공소, 금방; prices at half v8's list | `lgx_producers` paged (+5.4 MiB near it, +1–2 files) |
| D7 | 주민 장보기 | v5 people records | residents buy 1–3 items at 판매대 / 포장마차 / 잡화점 (new buyers, so they drain rather than move) | none |
| D8 | 정육점 · 소시지 | re-checked after L1b: only if the meat pile stays ≥ 50 % with one hunter moved and D2b on | raw meat → homes, stall | `item_sausage` (new icon) |
| D9 | 수산시장 · 수출선 | v6 | auction ×1.5, crates by ship | v6 art |
| D10 | 케이크 | v6 (sugar) | 밀 + 설탕 → 카페, 큰 식당, weddings | `item_cake` (shipped) |
| D11 | 해변 먹거리 | v7 | beach BBQ and stalls | v7 art |
| D12 | 가전 공장 · 물류센터 (살림살이 3단계) | v8 as planned | 주괴 3 → radio · washer · fridge · TV | `lgx_producers`, centre layers |

Homes improve 난로 (v4.x) → 가구 (v5) → 가전 (v8): the long-running final customer.

### 6.4 Does every raw have a sink at every stage?

| Stage | 생선 | 통나무 / 판자 | 밀 / 빵 | 광석 / 주괴 | 생고기 / 훈제 |
|---|---|---|---|---|---|
| 0–20 min | supply-limited (no change) | supply | supply | the pile fills before the ore porter (no change) | supply |
| 20–35 min | grill starved 50 %: no demand needed | short | short | **carrying** → v4.2.1 | **carrying** → v4.2.1 (창고 early → 짐꾼 2); side effect: fish / bread sell less while meat sells more (G4 side measure) |
| 35–50 min | fish pile 77 %: the cannery link; D2; D1 offered | short → 이직 | D2, the touch's restaurant | carrying (+22 ingots) + 금방 sled | carrying + 금방 sled |
| 50–100 min | cannery + D1 + D3 + D2b | 이직 (forest) | D3 + D2b | D5 by need (or raw exported from the 자재창고 after 금방); D4 as content | **guest-capped**: one hunter to the forest, D2b, the touch's restaurant |
| v5+ | D7 | D6 | D7 | D4 for new homes | D7; D8 only if still surplus |

### 6.5 The fish budget (r2 [4])

Three fishermen give a surplus potential of ≈ 36–40 fish a minute above the grill. Claims, in priority order: the
cannery link +12 (cans ≈ 8.7 coins a fish) → D2 / D2b ≈ +3–5 cooked fish (frees grill output, so the grill takes more) →
D3 ≈ +4–6 → **the stall gets ≈ 15–20 a minute** on average (its 24-fish pad covers the evening peak). Moving a fisherman
away removes ≈ 33 a minute of potential and starves the stall, so: the acceptance runs move no fisherman; 알아서 배치
takes a gatherer only from a line whose pile was ≥ 90 % for half of the last 3 minutes (once the stall drains the fish
pile, fishermen stop qualifying); and the stall's offer follows the measured pile (a player who moved fishermen out
first never sees a stall that would starve).

---

## 7. 일꾼·짐꾼 management (이직, v4.3.2 L1a)

### 7.1 Job slots (`src/systems/Jobs.js`, new)

```
JobSlot {
  id      'hire2_fisherman' | 'p2:grill' | 'raw_smelter' | 'op_grill' | 'crew:3' | 'stn:2' …   (the step / offer that made the person)
  role    'gather' | 'raw' | 'goods' | 'crew' | 'station' | 'op' | 'clerk'
  home    the line now ('fish' | 'log' | 'wheat' | 'ore' | 'meat' | 'grill' … | 'wh' | 'mat' | 'square')
  origin  the line the step made it for
  anchor  true for each line's first gatherer (hire_*), its raw porter, its first goods porter (porter_*), operators,
          clerks and station porters
  person  the live Worker / Porter (null while not built)
  movedAt game time of the last move; byChief (manual or auto)
  idle    { share (EWMA 180 s), reason, since }     (not saved)
}
moves = { slotId: line }    only differences from origin — the saved part
```

Built from `progress.done`, `v42.lines.p2`, the crew, `Growth.porters`, office staff and clerks (shown, never movable).
`Game.hireWorker / hirePorter / hireRawPorter` and `LineUpgrades.hireP2` ask `Jobs.lineOf(slotId)` before placing the
person, so a reload rebuilds every moved person at its new line (instant, no walk). `Jobs` is constructed right after
`buildV42` and **before `progress.init()`**, because `progress.init()` re-hires the steps (r2 [13]).

### 7.2 Idle detection (1 Hz sampler, share of the last 3 minutes, never the current second)

| Role | Waiting (counts as idle) | Reason (ko) |
|---|---|---|
| Gatherer | `drop` with `fullT > 0` · `seek` with no node · `hungry` | 더미가 가득해서 기다려요 · 잡을 게 없어요 · 배고파요 |
| (gatherer, walking > 70 %: busy, shown) | — | 멀리 다녀요 |
| Raw porter (anchor) | `load` with `want ≤ 0` · pile empty | 가공소 입구가 가득해요 · 더미가 비었어요 |
| Goods porter | `load` with an empty output · no plan · `unload` with `waitT > 0` | 나를 물건이 없어요 · 갈 곳이 없어요 · 선반이 가득해요 |
| Pool / station porter | `idle` (no job picked) | 할 일을 기다려요 |
| Operator (shown, fixed) | input empty · output full | 재료가 없어요 · 출구가 가득해요 |
| Moving | walking to the new line | 이사 중 · 12초 |

Dots: green < 25 %, yellow 25–50 %, grey ≥ 50 % for **movable** people (`ui_status_3 / 1 / 2`); **anchors who wait show
blue `대기 · 줄 지킴`** (r2 [16]), never grey "쉬어요"; red `ui_status_0` is kept for "this line is short". The 💤 count
(pip, title chip, `쉬는 사람 n명`) counts movable people only.

### 7.3 Rules

| Rule | Value |
|---|---|
| Who | movable slots only: gatherers from `hire2_*` / `hire3_*` (late: 9 people; miners have no 3rd) and every 짐꾼 2 (up to 8). Anchors show a lock and `줄 지킴` |
| Where | a gatherer → any opened gathering line **whose own `hire2_*` and `hire3_*` were bought** (the mine: `hire2_miner`); a 짐꾼 2 → a goods line with its own goods porter **and its own 짐꾼 2 bought** (grill, sawmill, bakery, smelter, smokehouse, toolsmith, cannery, dock). So a move adds a 4th / 5th gatherer or a 3rd goods porter, never skips a price (r2 [15]). Rows that fail show `먼저 ○○ 2·3을 고용해요` |
| Advice | the move sheet orders target lines by need; **the forest is the line that needs people** (sawmill starved, lumberjacks walk 82 %); the fields row shows blue `빵이 이미 남아요` (allowed, not advised; r2 [14]) |
| Caps | ≤ 5 gatherers a line; ≤ 3 goods porters a line (p1 + 2) |
| Cost | free; 60 s cooldown per person (`이사 준비 1분`); no refund |
| Hire pads | every step stays done; offers appear once per save; a moved 짐꾼 2 does **not** re-open its old line's offer; a line that received a moved 짐꾼 2 can still buy its own (it becomes the 3rd, within the cap) |
| The walk | finish the load in hand (a gatherer drops its catch on the old pile; a porter delivers), then walk the roads to the new line's waiting spot (150 px/s: 10–25 s). The old line loses it at once; the new line counts it on arrival |
| Looks | a gatherer re-skins to the new profession's look `gs.workerKey(type, idx)` with the first free index; 3 looks a profession (miners 2 usable; `miner_c` exists, unused). A 4th / 5th of a line reuses looks 1–2 (Q5) |
| Spots for a 4th / 5th (r2 [13]) | today `workerHome` adds `index × (40, 20)`, `dropSpot` uses `D[index % 3]` (the 4th would share the 1st's spot) and the fisher stand is `fisherSpot.x − index × 78` (the 5th 312 px left): `world.js` gets explicit `drop4/5` and `stand4/5` offsets per line, checked in a `jobs_live` screenshot of 5 fishermen and 5 lumberjacks |
| Idle anchors (r2 [16]) | an anchor goods porter idle ≥ 30 s with an empty output may take **one** board job whose source and sink are both ≤ `localPx` 900 from its home, then returns (the raw porters already do this) |
| A line that loses people | may turn red; the hub warns once `○○ 줄에 사람이 줄어요` (no block) |
| Before village complete | nothing is movable (all movable slots are steps after village complete); the window is not open yet |

Code: `Worker.retrain(type, idx)` (release the node, deliver the catch, set `type`, `station`, `pile`, `home`,
`oreLeft`, `hungry = false`, `reskin` via `wantKey`, `walkTo(home)`, state `seek`); `Hauler.rebind(…)` (`RawPorter`:
`pile`, `target`, `home`; `Porter`: `station`, `home`, `plan = null`, `keep` reset; the load in hand finishes first,
`clearDest()` only for an empty bag; then `go(home)`); `LineUpgrades.hasPorter(line)` counts the porters there now.

### 7.4 알아서 배치

```
every jobs.autoEvery (60) s, when on:
  candidates = movable slots idle ≥ idleAt 0.5 for ≥ idleForS 180 s, not moved in the last stayS 180 s,
               not moved by the chief in the last respectS 300 s,
               whose line's pile was ≥ 90 % for ≥ srcFullShare 0.5 of the last 180 s          (real surplus, §6.5)
  need per line:
     gathering line   station starved share (input empty) over 180 s, if its pile is < 50 % full     (short of raw)
     goods line       output-full share over 180 s, if the line's status is 'jam' (for unlimited-buyer lines:
                      output-full share ≥ 0.3, §8.3) or its shelf runs empty
  move ONE person: the most idle candidate → the same-role line with the highest need that the price rule allows,
                   only if need(target) ≥ need(source) + 0.2 and the target is under its caps
  log: a 서리 소식 line (`사냥꾼 하나가 숲으로 옮겼어요`); a toast at most once per 3 minutes
```

Never hires, never moves anchors, never changes crew seats.

### 7.5 With the production-scaled crew

Seats count production and the use-need gate, not who is present: moving someone never calls a new crew member, and the
crew rule never counts moved line porters. Auto-assign never changes the crew. The crew needs no 이직: it already works
for both warehouses.

### 7.6 Code contracts that change (r2 [7], [11], [13])

- **짐꾼 2 per slot.** `LineUpgrades.p2` stays the saved list of *bought origin lines*; each hired p2 carries
  `slot = 'p2:<origin>'` in `porters2`. `hireP2(origin)` dedupes by **slot** (not by `station.id`, today's early return)
  and places the porter at `Jobs.lineOf('p2:' + origin)`. `afterRestore` therefore re-hires every bought p2, wherever
  it now works. `f4Due(line)` stays "the line's own p2 not bought" + `hasPorter` + `fullT` + the 창고, and adds "goods
  porters at the line now < `goodsPerLineMax` 3". Test (`jobs_live`): move a p2 grill → smokehouse after the
  smokehouse's own p2, reload → 3 porters at the smokehouse, 1 at the grill; buy order reversed → the same.
- **Crew across buildings.** `WarehouseCrew.crew()` = pool members at the 창고 + the 자재창고; `afterRestore` restores
  each building's saved count (`haul.ch`), never below the total that had come (`v42.crew`).
- **Hire order on load.** `Progression.js` hard-codes the index of `hire2` / `hire3` (1 / 2); it moves to `Jobs`
  (index = the slot's order at its line now). `Progression.js` joins the L1a file list.

---

## 8. The 마을 경영 hub (one window)

### 8.1 Recommendation: one window, three tabs — **[현황] [일꾼·짐꾼] [물류]**

1. **The same rows from two sides.** Every red card in the data is caused by a line's people: the wood line lacks
   gatherers, the ore line loses its raw porter to dock walks, smoked meat lacks carriers, the cannery lacks a carrier
   from the fish pile. A card must lead to those people in one tap, and a person's row must say which line it serves
   and why it waits. Two windows would show each line twice and make the player hop.
2. **Phone space.** No room for another HUD button at 360×640 (`v44_plan.md` D13: the stack shows 3 rows there, 4 at
   390×844; the bottom third is the joystick's; verified against the code: popBox (28, top + 152), rank chip
   (188, top + 152), order chip (28, top + 212)). One window needs one door, and the door exists (the popBox).
3. **One renderer, one art page.** `Shell.js` (a generalised `OfficePanel`) and the ui5 `@panels` page serve every tab.
4. **Fewer windows overall.** v4.6's planned 마을 panel (등급 · 행복 · 자원 · 통계) becomes tabs of this hub: its 자원
   tab is 현황 grouped by region, and 마을 통계 is its 통계 tab.
5. Separate windows would win only with very different interactions or > 100 rows. Here: ≈ 40 people in 8 sectors,
   two actions (look, move).

**Four things that make the one window work (r2 [16], [17], [21]):**
- the door **always opens 현황** (a door that lands on different tabs reads as random); the `💤 n명` chip in the title
  opens 일꾼·짐꾼 filtered to idle;
- the popBox counts residents, not workers: a **one-time tappable banner at village complete** teaches the door, and the
  💤 is a small pip inside the box;
- people who wait but cannot move read `대기 · 줄 지킴` (blue), so "놀고 있는 사람" means only people the chief can move;
- the 상업 card reads the event counters, so it has numbers from the first minute (the office income starts only at
  ≈ 40–47 min).

### 8.2 Sectors and their data (event counters, read 1 Hz while open; r2 [18], [21])

`SectorFlow` (`src/systems/SectorFlow.js`, new, ≈ 0.005 ms a tick) counts events into a 60 s ring per item: **made**
(`Game.noteMade`, the boat catch), **used** (deliveries into a use sink, by sink kind: station / workshop / stall input,
shop shelf, site, pantry, food box, feast), **sold** (`Seller` serve, `Shop` inland sale, the 교역소 merchant, 금방
orders, dock export) and **coins** (per till). `src/insight/model/sectors.js` (pure) maps items and places to sectors
and builds the card rows and the why-chain from `SectorFlow` + `Jobs` + the stations' states.

| Card | Lines / places | Line 1 | Line 2 (people, `Jobs`) | Line 3 (chip) | Icon |
|---|---|---|---|---|---|
| 어업 | 어부, 생선 통, 화덕, 배 · 배 창고, 생선 짐꾼(배) | `잡기 59 · 쓰임 55` (made vs used, all fish sinks; the detail splits 화덕 · 통조림 · 포장마차) | `👷 7명 · 💤 1` | the cause (§8.3) | `item_fish_raw` |
| 임업 | 나무꾼, 통나무 더미, 제재소 | `잡기 51 · 판자 50` | same | same | `item_log` |
| 농업 | 농부, 밀 더미, 오븐 | `잡기 52 · 빵 46` | same | same | `item_wheat` |
| 광업 | 광부, 광석 더미, 제련소, 식량 상자 | `캐기 63 · 주괴 54` | same | same | `item_ore` |
| 사냥 | 사냥꾼, 고기 걸이, 훈제장 | `잡기 74 · 훈제 58` | same | same | `item_meat_raw` |
| 공업 | 대장간, 통조림 공장 (+ v5 가구 공방, v8 가전 공장) | `만들기 22 · 팔림 15` | operators + their porters | workshop state | `ui_icon_tools` |
| 상업 | 판매대, 교역소, 잡화점, 큰 식당, the 5 town shops, 포장마차, (v4.3) 금방 | `팔림 1분 102개 · 640코인` (`SectorFlow` sold + coins) | clerks + restaurant staff | `빈 선반 1곳` (`Surplus.emptyFor`) | `ui_icon_coin` |
| 물류 | 창고, 자재창고, 짐 싣는 곳, 기차 수출, 물류창고, 썰매 | `바쁨 82 % · 밀린 일 2` (pool, use jobs only) | crew + station porters | `자재창고 가득` / `짐 싣는 곳 밀림`; a small line `수출 1분 14개` | `ui_icon_route` |

Card tap → the sector's detail (same tab, back arrow): simple rows (made / used / sold per item, per place, with the
footer note `숫자는 1분에 몇 개예요`), the why-chain, buttons **사람 보기** (→ 일꾼·짐꾼 filtered to the sector) and
**지도** (the overview with the place marked; v4.4.1 adds **가 보기** through `Navigator.guideTo`). G18 checks the rows
against the probe.

### 8.3 Status and cause

| Status (dot) | Rule | Chip text (first failing link) | Where it points |
|---|---|---|---|
| 부족 (red) | `StockLedger.status` 'short' (shelf empty ≥ 30 s, nothing in stock) | raw short: `통나무가 모자라요` (+ `나무꾼이 멀리 다녀요` if walking > 70 %) · a missing carrier: `짐꾼이 없어요` · a missing operator | the hire / offer pad, or the pile |
| 길 막힘 (orange) | 'jam' (shelf empty while output / 창고 has it) | `짐꾼이 모자라요` | the 짐꾼 2 pad, or the output |
| 남음 (blue) | 'surplus' (pile / output full ≥ 60 s, shelf fine) | `살 사람이 모자라요` (goods) · `원료가 남아요 → 자재창고` (raw) | the 자재창고 plot / door; the demand offer pads when they exist (fish → 포장마차 pad; idle 대장간 → 2단 pad; processing-limited ore → 3단 pad); meat → `사냥꾼 한 명을 숲으로 옮겨 보세요` |
| 적당 (green) | otherwise | `잘 돌아가요` | — |
| **Unlimited-buyer lines** (planks, ingots at the 교역소; r2 [19]) | status from the output-full share and the pile share only (the shelf sits at its display floor 68–71 % of the time because the merchant buys at once): output ≥ 90 % for ≥ 30 % of 3 min = orange; pile ≥ 90 % with the output fine = blue; else green | as above | as above |
| (people pip) | a movable person idle ≥ 50 % for 3 min | `💤 쉬는 사람 1명 → 옮기기` | the 일꾼·짐꾼 tab |

### 8.4 Doors (no new HUD button)

| Door | Opens | When |
|---|---|---|
| **popBox** (`UI.js` `setPopulation`; (28, top + 152), drawn 150 × 50) made interactive; hit area 150 × 56 until the v4.4 stack manager (it cannot reach the order chip at top + 212; 28 CSS px tall at 360×640 DPR 2 — accepted, with the other doors below), 150 × 88 in v4.4's stack row | **현황, always**. The 💤 is a pip ≤ 28 px (`emote_zzz` + count) drawn inside the box's first 150 px, never past the rank chip at x 188 | shows as today and always from **village complete** (v4.4's "from `hire_miner`" rule supersedes when v4.4 lands; the door itself is active from village complete) |
| **Village-complete banner** (once per save) | `인구 칸을 누르면 마을 경영 창이 열려요` — tap opens 현황 | village complete |
| rank chip | 등급 tab (v4.6); until then its own rank panel, unchanged | — |
| Office 재고 tab | top line `물류 직원 4명 · 바쁨 82 % · 밀린 일 2` + `마을 경영 열기` → 현황 | **only once the office stands** |
| Office 직원 tab | top line `일꾼·짐꾼 41명 · 쉬는 사람 3` + button → 일꾼·짐꾼 | only once the office stands |
| 편지 / 서리 소식 | `광부 두 명이 쉬고 있어요` + `보러 가기` → 일꾼·짐꾼 filtered | letters exist |
| v4.6 자원 지도 pins | 현황 on that region | v4.6 |

Panel flags: the hub sets `ui.v42PanelOpen` so the joystick, the chat pill, 관망 and the navigator wait (the v4.4 §19.1
rule).

### 8.5 Layouts (logical 720 wide; 390×844 → 720×1558, 360×640 → 720×1280)

Shell (`v44_plan.md` §19.2): `pw = min(W − 24, 700)` = **696**; `ph = min(H − 220 − insets, 1100)` = **1,100** at
390×844 and **1,060** at 360×640; `top = max(96 + safeTop, (H − ph) / 2)`. Title row 92 (icon `ui_icon_people` 46,
`마을 경영` 32 px, the `💤 3명` chip 150 × 56 that opens 일꾼·짐꾼 filtered to idle, close ⌀60). Tab row 72: three
`ui_office_tab(_on)` plates 220 × 64, labels 24 px. **Body from top + 172: 928 px at 390×844, 888 px at 360×640**; it
scrolls by drag. Labels ≥ 22 px, body ≥ 26 px, hit areas ≥ 88. Non-pausing; the 옮기기 sheet is a pausing modal.

**현황** — 8 cards **330 × 190** in 4 rows (gap 12 / 10), **no header, no footer** (r2 [20]): 4 × 190 + 3 × 10 + 12 top
= **802 px**, inside 888 with ≈ 86 px for Android insets (928 at 390×844).

```
┌───────────────────────────── 696 ─────────────────────────────┐
│ (👥) 마을 경영                       [💤 3명]            (✕)   │ 92
│ [  현황  ] [ 일꾼·짐꾼 ] [  물류  ]                            │ 72
│ ┌──────── 330 ────────┐  ┌─────────────────────┐              │ cards 330×190
│ │(🐟) 어업        ●   │  │(🪵) 임업        ●   │  y+12  icon 44 · name 28 · dot 28 (row 44)
│ │ 잡기 59 · 쓰임 55   │  │ 잡기 51 · 판자 50   │  y+66  26 px
│ │ 👷 7명 · 💤 1       │  │ 👷 6명              │  y+102 26 px
│ │ [ 살 사람이 모자라요 ]│  │ [ 통나무가 모자라요 ]│  y+140 ui_chip 300×44, 22 px
│ └─────────────────────┘  └─────────────────────┘              │
│   농업 · 광업 / 사냥 · 공업 / 상업 · 물류                       │ 3 more rows
└───────────────────────────────────────────────────────────────┘
```

Detail (card tap): back arrow 60, rows 640 × 96 (item icon 44, three numbers 26 px), why-chain lines 26 px, the footer
note `숫자는 1분에 몇 개예요` 22 px, `사람 보기` and `지도` 300 × 72.

**일꾼·짐꾼**

```
│ [전체 41][어업 7][임업 6][농업 6]                                │ filter chips 160×56, 2 rows = 128
│ [광업 5][사냥 7][공업 4][물류 9]                                 │
│ 💤 쉬는 사람 3명                    [알아서 배치: 꺼짐]          │ 64; toggle 230×64
│ ── 어업 · 생선 → 구운 생선 ────────────────────────────────    │ header 44, 22 px
│ (얼굴) 어부 2            ● 더미가 가득해서 기다려요             │ row 640×96: face 72, name 26,
│        3분 중 40 % 쉬어요                         [ 옮기기 ]    │   reason 22, button 150×64
│ (얼굴) 생선 짐꾼         ● 대기 · 줄 지킴           🔒          │ anchor waiting: blue dot, lock 32
│ (얼굴) 요리사 쿡         ● 출구가 가득해요         🔒 기술자    │ operator (shown, fixed)
```

List height 928 − 192 = 736 at 390×844 (≈ 7 rows), 696 at 360×640 (≈ 6.5 rows); one sector filtered is 5–9 rows.
Faces: the 128 px portraits the hire pads use (`portrait_<look>`), scaled to 72; fallback `ui_icon_worker` /
`ui_icon_porter` while a page loads, and **always in the rail district** if `Residency` reports no room there (the tour
peaks at the depot; r2 [29]).

**옮기기 sheet** (pausing modal, like the v4.4 sheets): 640 × min(H − 300, 900); title `어부 2를 어디로 보낼까요?` 26 px;
one row per allowed line 640 × 88 (icon 44, line name 26 px, need dot, reason 22 px `통나무가 모자라요`, count
`나무꾼 3 / 5`), ordered by need; disabled rows grey with the reason (`자리가 다 찼어요`, `같은 일만 할 수 있어요`,
`먼저 사냥꾼 2·3을 고용해요`); the fields row blue `빵이 이미 남아요`; `취소` 240 × 84. After the pick the row reads
`이사 중 · 12초`, then `1분 뒤에 다시 옮길 수 있어요` (grey button).

**물류**

```
│ 물류 직원 5명 (창고 4 · 자재창고 1)                              │ 26 px
│ 바쁨 ▮▮▮▮▮▮▮▮▯▯ 82 %   밀린 일 2                              │ bar 400×24 (use jobs only)
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
middle, `50/분`): ≤ 16 display objects, only while the overview is up; a tap anywhere clears it.

### 8.6 Strings (ko; en keys follow the same shape)

| Key | 한국어 |
|---|---|
| `hub_title` | 마을 경영 |
| `hub_tab_status` · `hub_tab_people` · `hub_tab_lgx` | 현황 · 일꾼·짐꾼 · 물류 |
| `hub_door_banner` | 인구 칸을 누르면 마을 경영 창이 열려요 |
| `sec_fish` … `sec_lgx` | 어업 · 임업 · 농업 · 광업 · 사냥 · 공업 · 상업 · 물류 |
| `card_catch` · `card_use` · `card_make` · `card_sold` · `card_coins` · `card_people` · `card_export` | 잡기 {a} · 쓰임 {b} · 만들기 {a} · 팔림 {b} · {c}코인 · 👷 {n}명 · 💤 {i} · 수출 1분 {n}개 |
| `cause_short_raw` · `cause_jam` · `cause_surplus_goods` · `cause_surplus_raw` · `cause_meat_move` · `cause_ok` | {item}가 모자라요 · 짐꾼이 모자라요 · 살 사람이 모자라요 · 원료가 남아요 → 자재창고 · 사냥꾼 한 명을 숲으로 옮겨 보세요 · 잘 돌아가요 |
| `btn_people` · `btn_map` · `btn_go` (v4.4.1) · `btn_move` · `btn_back` | 사람 보기 · 지도 · 가 보기 · 옮기기 · 뒤로 |
| `idle_*` | 더미가 가득해서 기다려요 · 잡을 게 없어요 · 배고파요 · 멀리 다녀요 · 가공소 입구가 가득해요 · 더미가 비었어요 · 나를 물건이 없어요 · 갈 곳이 없어요 · 선반이 가득해요 · 할 일을 기다려요 |
| `op_starved` · `op_blocked` · `working` | 재료가 없어요 · 출구가 가득해요 · 일해요 |
| `idle_share` · `anchor_wait` · `anchor_line` · `anchor_op` | 3분 중 {p}% 쉬어요 · 대기 · 줄 지킴 · 줄 지킴 · 기술자 |
| `move_title` · `move_full` · `move_same` · `move_price` · `move_bread` · `move_walking` · `move_cooldown` · `move_line_less` | {who}를 어디로 보낼까요? · 자리가 다 찼어요 · 같은 일만 할 수 있어요 · 먼저 {job} 2·3을 고용해요 · 빵이 이미 남아요 · 이사 중 · {s}초 · 1분 뒤에 다시 옮길 수 있어요 · {line} 줄에 사람이 줄어요 |
| `auto_on` · `auto_off` · `auto_help` · `auto_news` | 알아서 배치: 켜짐 · 알아서 배치: 꺼짐 · 1분마다 한 명씩, 쉬는 사람을 바쁜 줄로 옮겨요 · {who} 하나가 {line}(으)로 옮겼어요 |
| `crew_line` · `crew_came` | 물류 직원 {n}명 · 바쁨 {p}% · 밀린 일 {b} · 물류 직원이 왔어요 |
| `mat_name` · `mat_card` · `mat_offer` | 자재창고 · 원료와 공사 자재를 잠깐 맡아 둬요 · 자재창고를 지을 수 있어요 (남쪽 갈림길) |
| `wh_noplot` | 빈 땅이 생기면 지을 수 있어요 |
| `idle_badge` · `per_minute_note` | 💤 {n}명 · 숫자는 1분에 몇 개예요 |
| `stall_*`, `feast_*`, `stove_*`, `s3_*` | the demand draft §3 player texts (offer banners, toasts, bubbles, news lines); the 훈제장 3단 texts are dropped |

### 8.7 The hub across versions

| Version | Tabs / doors |
|---|---|
| v4.3.2 | 현황 · 일꾼·짐꾼 · 물류 (3 × 220); door = popBox (hit 150 × 56, opens 현황) + the village-complete banner + letters + office (once built); detail: rows + 사람 보기 + 지도 |
| v4.4 | the stack manager registers the popBox as the pop / rank row (hit 150 × 88); the pip lives inside it; nothing else changes |
| v4.4.1 | the detail gains `가 보기` (`Navigator.guideTo`) |
| v4.6 | 현황 · 일꾼·짐꾼 · 등급 · 행복 · 통계 (5 × 136, the office's plates); 물류 = the 물류 card's detail; `LedgerRows` in the details and the office 재고 tab; 현황 gets `산업별 / 지역별` (지역별 = v4.6's 자원 with TOP 3 and 해결하러 가기); the rank chip opens 등급; the 자원 지도 pins open 현황 |

---

## 9. Expected effect (targets for the probe and census; model)

"Any pile" uses `1 − Π(1 − pᵢ)` over ore, meat, fish, wheat (logs ≈ 0). The independence model overestimates: at the
baseline it gives 97 % (run L cells) and 96 % (census cells) against a measured 93 %, so it is a fair upper bound.

| Measure | v4.2 (run L / census) | after v4.2.1 | after v4.3 (금방 Lv1) | after L1a (yard steady, 1 hunter moved) | after L1b (D1–D4, D2b) | + 용광로 3단 |
|---|---|---|---|---|---|---|
| Raw porters on dock / 창고 runs | 7–21 % | **0** | 0 | 0 | 0 | 0 |
| Smelter processed a minute · starved | 54 · 15 % | ≥ 70 · ≤ 5 % | same | same | same | ≈ 92 (cap 100) |
| Cannery starved | 39 % | ≤ 25 % | same | ≤ 15 % | same | same |
| Smokehouse output full | 23 % | ≤ 15 % | same | ≤ 10 % | ≤ 10 % | ≤ 10 % |
| Pile ≥ 90 %: ore · meat · fish · wheat | 63 · 70 · 72 · 11 % | ≤ 60 · ≤ 60 · ≈ 65 · 11 | ≈ 25–35 · 40–50 · ≈ 30 · 11 (금방's census) | ≤ 40 · ≤ 20 · ≤ 50 · 11 | ≤ 40 · ≤ 20 · ≈ 0–15 · ≈ 0–10 | ≈ 0–15 · ≤ 20 · ≈ 0–15 · ≈ 0–10 |
| Any pile ≥ 90 % (model, upper bound) | 97 % run L / 93 % census | ≈ 93–95 % | ≈ 76–86 % | ≈ 70–79 % | **≈ 52–63 %** (no moves: 64–72 %) | **≈ 20–48 %** |
| 자재창고 raw (share of 240) | — | — | — | ≤ 80 % (G17) | same | same |
| Raw walked to the dock a minute | 39 | ≤ 20 | ≤ 20 (+ sled) | ≤ 10, one source, after the sled | ≤ 10 | ≤ 10 |
| 판매대 smoked meat empty, 25–35 min (fresh40) | S25 42 / S35 32 % | ≤ 15 % | same | ≤ 10 % | ≤ 10 % | ≤ 10 % |
| Gatherers idle | 24 % | 24 % | ≈ 20 % | ≤ 15 % (이직) | ≤ 15 % | ≤ 15 % |
| 창고 crew late | touch 5–6 | measured (need ≈ 3.5–4.5) | same | + 1 at the 자재창고 | same | same |
| First 20 minutes | 19.5–20.7 min | **unchanged** | unchanged | unchanged | unchanged | unchanged |
| Income, census vs v4.1 (model) | +33 % | ≈ +41–46 % | ≈ +41–51 % | ≈ +47–58 % | ≈ +50–61 % | ≈ +59–70 % |

Sources: carry draft §5.8, demand draft §6 (pile model: a pile's ≥ 90 % share ≈ 70 % once gatherer potential ÷ take ≥
1.2, ≈ 0–15 % once ≤ 1.0), §7 (coins), the critique §2 (recomputed cells), 금방's own census for the v4.3 column. The
G1 end gate (≤ 65 %) sits above the model's top (63 %); ≤ 50 % needs ore and meat each at ≈ 18 % or less with fish 15
and wheat 10, i.e. 용광로 3단 bought **and** the meat lever (one hunter moved). The touch's restaurant is not in these
rows (not measured yet). All are estimates until measured.

How the income rows are built (points over v4.1; 1 point = 18.5 coins a minute): v4.2.1 = the carry draft's
automation-only +325–475 coins (run L) **minus the meat that cannot sell** (§5.7 counted +16 smoked meat × 12 = 192; only
≈ +7 sell, at a net ≈ 6.5 each = ≈ 45), converted to the census at ≈ 60 % (+5.8–10.6 points), + D2 0.6 + D2b ≈ 1.4;
v4.3 = 금방's own gate (≤ +5); L1a = 이직 one hunter → forest (+≈ 17 logs → planks ≈ +85 coins, +4.6) + board / yard
(+1–3); L1b = D1 +2.2–2.9, D4 +0–0.9 while homes are furnished, D3 0; 용광로 3단 +8.8.

---

## 10. Income

### 10.1 Coins per piece (late village, created coins a minute; 1 point = 18.5 coins of v4.1's 1,851)

| Piece | Coins a minute | Points |
|---|---|---|
| v4.2.1 carry rules (run L, automation only, meat corrected) | +178 to +328 | +9.6 to +17.7 (census ≈ 60 % of it) |
| D2 surplus-first cards | +11 | +0.6 |
| D2b 솔방울 손님 늘리기 | ≈ +25 | ≈ +1.4 |
| 이직 (one hunter → forest: +≈ 17 logs → planks) | ≈ +85 | ≈ +4.6 |
| D1 포장마차 (≈ 15–20 fish) | +40 to +53 | +2.2 to +2.9 |
| D3 저녁 잔치 | 0 | 0 |
| D4 무쇠 난로 (made to order) | ≈ +17 while homes are furnished, ≈ 0 after | 0 to +0.9 |
| D5 용광로 3단 | +162 | +8.8 |
| (r1's 훈제장 3단, removed) | (r1: +50 to +194; late meat cannot sell) | — |

### 10.2 Why the +15–30 % band cannot hold

The band was set while the surplus *waited*. Every raw that now sells instead of waiting creates 4–12 coins. v4.2 is
already at +33 % (3 points over), and the carry fixes alone add ≈ +8–13. The pile gate and the band pull in opposite
directions once the surplus moves. The v4.2 levers (`freight.exportRate`, `depot.sell.rate`) move income by 1–2 points.

### 10.3 Per-step bands (Q9 — **no default**, answered before B3; r2 [33])

1. **Before 읍**: keep the pacing guards (G7, G8, G10). The earlier 창고 and the mid-game smoked meat act there; 읍 may
   come ≈ 0.5–2 min sooner, inside ±5 % (±2.4 min). If it comes sooner than −5 %: raise the smelter / smokehouse 짐꾼 2
   costs, then the 창고 cost.
2. **After 읍**, each step must land in its band in the census (model ± tolerance), measured against the step before:

| Step | Band (gate) | Model | Orientation (absolute over v4.1) |
|---|---|---|---|
| v4.2.1 | **+38–53 %** absolute (Δ +5–20 over the measured v4.2 + touch) | +41–46 | — |
| v4.3 (금방) | 금방's own gate (≤ +5 points) | — | ≈ +41–51 |
| L1a | **Δ +3–10 points** over the measured v4.3.1 | +5.6–7.6 | ≈ +46–61 |
| L1b | **Δ +1–6 points** over L1a | +2.2–3.8 | ≈ +50–65 |
| 용광로 3단 | **Δ +5–12 points** over L1b | +8.8 | ≈ +56–75 |

   A step below its lower bound is a regression to explain before it ships; above its upper bound the §10.4 levers apply.
   No step may end below the measured v4.2 + touch.
3. **If the designer keeps +15–30 %**: v4.2 already fails it (+33 %); the §10.4 levers bring the end of the track to
   ≈ +33–40 % and the piles stay fuller (G1 then ≈ 65–75 %). B1 and B2 still measure and report their bands; B3 waits
   for the answer (cut line → v4.3.3).

### 10.4 Levers if a step is over its band (in this order)

D4 stoves given by the village (쓰기) −0 to −0.9 · skewer 2 → 1 coin −1.1 to −1.5 · D2b back to 40 s −1.4 · D2 off −0.6 ·
`depot.sell.rate` and raw prices −1 to −2 · then 용광로 3단 not offered (the leftover ore leaves raw from the 자재창고 and by
the 금방 sled at 1–3 coins) −8.8, which leaves G1 at ≈ 52–63 %.

---

## 11. Modules and files

### 11.1 v4.2.1 (L0)

| File | Change |
|---|---|
| `src/entities/Worker.js` | `RawPorter`: no export spill (`logistics.raw.stayOnLine`), local jobs ≤ `localPx` with the `workS` guard from `localSinksFor(pile)`; `WarehousePorter.think()`: job order out → overflow / direct → fish pile → cannery INPUT job (LD5) → raw runs last (r2 [10]) |
| `src/systems/WarehouseCrew.js` | need gate in `update()` (use-busy EWMA from `WarehousePorter` job prio, use-job wait ≥ `backlogS`) |
| `src/systems/Progression.js` | `BUILD_UNLOCK.warehouse = 'hire_hunter'`; `GOALS` order |
| `src/systems/Growth.js` | standing card pick by surplus score (D2) |
| `src/entities/Shop.js` | D2b: `inlandEveryRank2` after 읍 (one line) |
| `src/systems/Civic.js` (if the 창고 card's locked reason lives there) | `wh_noplot` reason when no M plot is free |
| `src/data/balance.js`, `src/data/balanceCheck.js` | `logistics.raw`, `logistics.link`, `logistics.cards`; `warehouse.crew.busyAt / useFrom / backlogS`; `v4.founding.inlandEveryRank2` (§12) + ranges |
| `tools/test/econ/{probe.mjs, an.js, lines.js, val.js, bot_an.js, census_an.js, geo.mjs}` | **cleaned** (copied in at step 0): repo-relative paths, `--late` flag = today's `--setup final`, a JSON summary with the §2.2 measures, `--prefill-yard` for L1a later |
| `tools/test/review_gameplay_bot.js` | the smart bot builds the 창고 when its card shows and buys 짐꾼 2 pads (fresh40, r2 [5]) — if it does not already |
| `tools/test/lgx_l0.mjs` | **new** browser suite (§15) |

No `world.js`, `Game.js`, `Save.js`, `UI*.js` or `v42_layout.mjs` edit in v4.2.1.

### 11.2 v4.3.2 L1a (new files **bold**)

| Area | Files |
|---|---|
| Board + tiers + PRIO | **`src/systems/haul/HaulBoard.js`** (pure except reading game objects; one item type per tick), `src/systems/Logistics.js` (RESERVE, YARD; sink registration), `src/entities/Worker.js` (pool pulls jobs; `StationPorter` reads remote jobs; idle anchor p1 local jobs) |
| 자재창고 | **`src/entities/MaterialDepot.js`** (a `Warehouse` subclass: accepts, reserve, raw share, exits), `src/systems/Civic.js` (card + offer), `src/data/world.js` (`v_mat`), `src/systems/WarehouseCrew.js` (pool across buildings, seats + 1, homes) |
| Jobs, idle, 이직, auto | **`src/systems/Jobs.js`**, `src/entities/Worker.js` (`retrain`, `rebind`), `src/scenes/Game.js` (hire functions read slots; construct board + jobs after `buildV42`, before `progress.init()`), `src/systems/LineUpgrades.js` (`hireP2` by slot, `f4Due` count, `hasPorter`), **`src/systems/Progression.js`** (hire index from `Jobs`, r2 [13]), `src/data/world.js` (`drop4/5`, `stand4/5` per line) |
| Hub | **`src/scenes/panels/Shell.js`** (from `OfficePanel`), **`src/scenes/panels/VillageHub.js`**, **`src/scenes/panels/hub/{StatusTab.js, PeopleTab.js, LogisticsTab.js, MoveSheet.js}`**, **`src/insight/model/sectors.js`** (pure: sector rows + why-chain), **`src/systems/SectorFlow.js`** (event counters; hooks in `Game.noteMade`, `Seller`, `Shop`, `Logistics` deliveries, `Freight` / `Depot` exports, tills), `src/scenes/UI.js` (popBox door + pip + banner), `src/scenes/OfficePanel.js` (재고 / 직원 top lines + links, no row refactor), `src/systems/VillageNews.js` + letters (idle letter, auto-assign lines) |
| Perf prototype | `src/systems/StackBaker.js` / `src/entities/ItemStack.js`: a switchable prototype (carried stacks ≥ 4 items bake to one image; `drawMax` 8 while flying), measured with `perf_cmp` + `soak42` and a slot-budget report; ships on only if it measurably saves (r2 [27]) |
| 금방 port | `src/geumbang/ports_v4.js` `piles()` / `takePile` (자재창고 first, above `sledFrom`; `claimed: 'sled'`) — additive |
| Save | `src/core/Save.js` (`keepHaul`, sanitise; `material` in the building list and `UNIQ`), `haul` slice |
| Admin | `src/admin/switches.js` (two rows, §4.4) |
| Data | `src/data/strings.js`, `src/data/balance.js` (`logistics.board`, `.material`, `.jobs`), `balanceCheck.js` |

### 11.3 v4.3.2 L1b

| Area | Files |
|---|---|
| D1 stall | **`src/entities/Stall.js`** (single-input station `item_fish_raw → item_eomuk` 3 → 4, input sink prio 40), `src/scenes/Game.js` `makeStall(site)` (a `Market` like `makeStore`: `goods: ['item_eomuk']`, hour table, `wantMax`, `maxQueue`, shelf = output, **its till registered in `villageTills`**), `src/data/world.js` (`v43_stall`), `src/data/items.js` (`item_eomuk`), `src/systems/V42.js` (`villageTills` lists the stall) |
| Offers | `src/systems/LineUpgrades.js` (stall, 대장간 2단, 용광로 3단: one banner each, once per save) |
| D3 feast | `src/systems/VillageLife.js` (`FeastEvent` = a `PartyEvent` at `green_fire`, 18–19 h; residents' `eat` act at the stall in the evening), `Logistics.js` (feast-table sink 44, 17–19 h), the table pile baked (`StackBaker` one slot) |
| D4 stove | `src/entities/Workshop.js` (toolsmith 2nd recipe for an open order when `pickTool()` is empty and `forge2` is bought), `src/entities/House.js` (`stove` flag: puffs ×2, warm window after `lightsOn`; a stove sink only while the house waits for one; save list), `hardware_store` `sells` + shelf order |
| D5 | `src/entities/Station.js` (`station3` time multiplier, smelter only) |
| Counters / ledger / news | `src/systems/SectorFlow.js` (stall, stoves, feast tags), `src/systems/StockLedger.js` (register for the office), `VillageNews.js`, `strings.js` |
| 금방 catalogue | `src/geumbang/tuning.js` (`item_eomuk`, `item_stove_iron`): additive rows, 금방 owner reviews |
| Save | `src/core/Save.js` (`keepDemand`; `stall` in the building list and `UNIQ`), `demand` slice |
| Art | `assets/v43_food/` (B4: the stall body only), `assets/props/props_items` (+`item_eomuk`, merge + guard), `src/core/Assets.js` / `Residency.js` (on-demand page `v43_food`, area `plaza`) |

---

## 12. Balance (Korean comments as in `balance.js`)

```js
  // =====================================================================
  //  (물류 개편) 남는 원료가 쓰이게: 나르기 · 창고 · 일꾼 옮기기 · 새 손님 (docs/logistics_plan.md)
  //  모두 '마을 완성' 뒤에만 켜져요 (처음 20분은 그대로예요)
  // =====================================================================
  logistics: {
    // ── 재료 짐꾼 (v4.2.1): 자기 줄을 떠나지 않아요. 가공소 입구가 가득하고 더미가 pileAt 넘게 차면
    //    localPx(px) 안의 가까운 일(공방·포장마차 입구, 자재창고)만 해요. waitS = 입구가 가득한 뒤 이만큼(초) 기다린 다음에,
    //    workS = 가공소 입구에 이만큼(초) 일할 재료가 있을 때만 (자리를 비워도 가공소가 쉬지 않게)
    raw: { stayOnLine: true, localPx: 900, pileAt: 0.85, waitS: 4, workS: 15 },
    // ── 생선 통 → 통조림 공장 (v4.2.1): 창고 직원이 날라요 (통조림 공장 입구가 canneryBelow 보다 비고 생선 통이 fishPileAt 넘게 찼을 때)
    link: { fishToCannery: true, canneryBelow: 0.5, fishPileAt: 0.6 },
    // ── 주문판 (v4.2.1): 정기 납품 주문을 고를 때 남는 물건을 먼저 (false 로 하면 예전처럼 차례대로)
    //    outAt = 가공소 출구가 이만큼(0~1) 넘게 60초 차 있으면 '남는 물건'
    cards: { surplusFirst: true, outAt: 0.8 },
    // ── 물류 게시판 (v4.3.2): every = 할 일 목록을 한 바퀴 다시 적는 시간(초, 물건 종류 하나씩 나눠서),
    //    farPx = 이보다 먼 길은 minLoadFar 개 이상 모여야 나서요, batchPx = 같은 물건을 원하는 곳이 이만큼 안에 모여 있으면 한 번에 들러요,
    //    pileStart / pileKeep = 더미가 이만큼(0~1) 차면 남는 원료를 옮기기 시작하고, 이만큼까지만 줄여요,
    //    backfillBelow / backfillPileBelow / backfillTo = 가공소 입구가 이만큼 아래이고 그 더미도 이만큼 아래일 때만 자재창고가 채워 줘요 (이만큼까지),
    //    flapS = 보관한 곳에서 꺼낸 물건은 이 초 동안 다시 보관하지 않아요 (왔다 갔다 막기), claimS = 맡은 일을 이 초 안에 못 하면 놓아요
    board: { every: 1, farPx: 1200, minLoadFar: 6, batchPx: 300, pileStart: 0.85, pileKeep: 0.6,
             backfillBelow: 0.5, backfillPileBelow: 0.25, backfillTo: 0.8, flapS: 60, claimS: 120 },
    // ── 자재창고 (v4.3.2): site = 짓는 값, cap = 넣을 수 있는 개수, rawShare = 원료가 차지할 수 있는 비율,
    //    reserve = 공사장을 위해 모아 두는 자재, crew = 같이 오는 직원 / 늘 수 있는 최대,
    //    sledFrom = 원료가 원료 칸의 이만큼 넘으면 금방 썰매가 먼저 가져가요, exportFrom = 이만큼 넘으면 역으로 내보내요,
    //    crewExportAt = 이만큼 넘으면 자재창고 직원도 역으로 날라요, takeUntil / takeAgain = 이만큼까지 받고, 이만큼 아래로 내려가면 다시 받아요,
    //    needS = 더미가 가득 찬 시간이 모두 이만큼(초)이면 짓기 카드, siteWaitS = 공사장이 자재를 이만큼(초) 기다려도 카드
    material: { site: { coins: 900, item_plank: 16, item_ingot: 6, time: 10 }, cap: 400, rawShare: 0.6,
                reserve: { item_plank: 40, item_ingot: 20 }, crew: { base: 1, cap: 2 },
                sledFrom: 0.4, exportFrom: 0.6, crewExportAt: 0.8, takeUntil: 0.95, takeAgain: 0.85, needS: 120, siteWaitS: 60 },
    // ── 이직 (v4.3.2): cooldownS = 한 번 옮긴 사람은 이 초 동안 그대로, perLineMax = 한 줄의 채집 일꾼 최대,
    //    goodsPerLineMax = 한 줄의 상품 짐꾼 최대, ownHiresFirst = 그 줄의 2·3번째 일꾼(짐꾼 2)을 산 뒤에만 그 줄로 옮길 수 있어요,
    //    알아서 배치: autoEvery = 몇 초마다 한 명, idleAt / idleForS = 이만큼 쉬는 사람을, srcFullShare = 그 줄 더미가 이만큼 넘게 가득했을 때만,
    //    stayS = 옮긴 뒤 이 초는 다시 안 옮겨요, respectS = 촌장님이 직접 옮긴 사람은 이 초 동안 건드리지 않아요,
    //    needGap = 옮길 줄이 이만큼 더 바빠야 옮겨요, badgeIdleAt / badgeForS = 💤 표시: 이만큼 쉬는 사람이 이 초 넘게 있으면,
    //    anchorLendS / anchorLendPx = 줄 지킴 짐꾼이 이 초 넘게 쉬면 이만큼(px) 안의 일 하나를 도와줘요
    jobs: { cooldownS: 60, perLineMax: 5, goodsPerLineMax: 3, ownHiresFirst: true, autoEvery: 60, idleAt: 0.5, idleForS: 180,
            srcFullShare: 0.5, stayS: 180, respectS: 300, needGap: 0.2, badgeIdleAt: 0.5, badgeForS: 180,
            anchorLendS: 30, anchorLendPx: 900 },
    // ── 눈꽃 포장마차 (v4.3.2): 남는 생선으로 어묵꼬치를 만들어 그 자리에서 팔아요
    //    site = 짓는 값, offerFullS = 생선 더미가 90% 넘게 찬 시간이 모두 이만큼(초)이면 발판이 생겨요
    //    fishIn → out = 생선 몇 개로 어묵꼬치 몇 개, time = 한 번 만드는 시간(초), inputMax / outputMax = 생선 발판 · 선반 최대
    //    price = 어묵꼬치 1개 값 (동네 값: 싸게), inPrio = 생선을 받는 급한 정도 (통조림 공장 42, 화덕 60 보다 낮게: 그쪽이 먼저)
    //    guestEvery = 손님이 오는 간격(초), hours = [시작 시, 끝 시, 손님 배율] (저녁에 제일 많이), wantMax / maxQueue = 사는 개수 · 줄
    stall: { site: { coins: 1200, item_plank: 10, item_ingot: 2, time: 8 }, offerFullS: 90,
             fishIn: 3, out: 4, time: 2.4, inputMax: 24, outputMax: 40, price: 2, inPrio: 40,
             guestEvery: 3.0, wantMax: 3, maxQueue: 6,
             hours: [[7, 11, 0.6], [11, 14, 0.9], [14, 17, 0.7], [17, 22, 1.6], [22, 7, 0.15]] },
    // ── 마을 저녁 잔치 (v4.3.2): 창고에 남은 음식으로 매일 저녁
    //    hour = 시작 시각, minFood = 창고 음식이 이만큼 넘을 때만, perGuest = 한 사람이 먹는 개수, attend = 오는 주민 비율,
    //    maxFood = 한 번에 쓰는 최대 개수, meatShelfAt = 판매대 훈제 고기가 이만큼(0~1) 넘게 있을 때만 훈제 고기도 내요, prio = 나르는 급한 정도
    feast: { hour: 18, minFood: 30, perGuest: 2, attend: 0.7, maxFood: 90, meatShelfAt: 0.5, prio: 44 },
    // ── 대장간 2단 · 무쇠 난로 (v4.3.2, 읍 뒤): 주문이 있을 때만 (난로 없는 집, 철물점 선반) 주괴 2 + 판자 1 → 난로 1. 역으로는 안 보내요
    //    cost = 발판 값, offerIdleS = 대장간이 쉰 시간이 모두 이만큼(초)이면 발판이 생겨요, time = 한 개 만드는 시간(초),
    //    price = 난로 값, gift = true 면 집에는 공짜로 (마을 선물), shopKeep = 철물점 선반에 이만큼 아래면 하나 더, homeHappy = 난로가 들어간 집 주민의 '집' 행복 + (v4.6)
    stove: { cost: 1500, offerIdleS: 180, ingot: 2, plank: 1, time: 6, price: 30, gift: false, shopKeep: 2, homeHappy: 10 },
    // ── 용광로 3단 (v4.3.2, 읍 뒤): 광석이 계속 남는데 제련소가 쉬지 않고 일해도 모자랄 때만
    //    timeMult = 한 개 만드는 시간 배율 (0.5 = 2배 빨리; 2단은 0.66), offerFullS = 더미가 가득 찬 시간이 모두 이만큼(초),
    //    busyAt = 기술자가 이만큼(0~1) 넘게 바쁠 때만, costs = 발판 값 (훈제장 3단은 없어요: 훈제 고기는 판매대 손님 수가 한계예요)
    station3: { timeMult: 0.5, offerFullS: 120, busyAt: 0.9, costs: { smelter: 2400 } },
  },
```

Next to the touch's rule (`BALANCE.warehouse.crew`, one place for the crew):

```js
    //  (물류 개편 v4.2.1) busyAt = 직원들이 '정말 쓰는 곳'으로 나르는 일(급한 정도 useFrom 이상)에 이만큼(0~1) 넘게 바쁘고,
    //  그런 일이 backlogS 초 넘게 기다릴 때만 한 명 더 와요 (창고에 쌓아 두기·역으로 내보내기는 바쁜 것으로 안 쳐요)
    crew: { from: 300, perMin: 70, cap: 6, window: 180, every: 60, busyAt: 0.8, useFrom: 40, backlogS: 60 },
```

And in `v4.founding` (D2b):

```js
    //  inlandEveryRank2 = (물류 개편 v4.2.1) 읍이 된 뒤에는 솔방울 마을 손님이 이만큼(초)마다 하나씩 사 가요 (손님이 두 배)
    inlandEveryRank2: 20,
```

Unchanged and read from where they are: `v42.porter2`, `v42.surplus`, `v42.depot`, `v42.porters.inputCalmPrio`.
`balanceCheck.js` ranges: coins and prices integers ≥ 1; shares 0–1; `timeMult` 0.3–1; `hours` multipliers 0–3;
priorities 1–99, **`stall.inPrio` < `v42.porters.inputCalmPrio` (42)** and `feast.prio` < `PRIO.SHELF_LOW` (45);
`perLineMax` 3–8; `localPx` 300–1,500; `workS` 0–60; `sledFrom` < `exportFrom` < `crewExportAt` ≤ 1; `takeAgain` <
`takeUntil`; `inlandEveryRank2` 5 – `inlandEvery`.

---

## 13. Art and budgets

### 13.1 New art (precise)

| Key | What | Size / layers / points | Pipeline | Files / texture |
|---|---|---|---|---|
| `stall_eomuk` | 포장마차 for an S plot: orange-red tarp roof on poles, clear plastic side curtains rolled up, wooden counter with a square steaming pot of skewers, a paper lantern, 3 round stools; front −Y (customers down-left, like `market_counter`); snow on the tarp edge | footprint 2.0 × 1.4 m (≈ 180 × 90 px diamond), frame ≈ 300 × 300; layers body + `_glow` (lantern + pot light, NORMAL blend, from `lightsOn`); points `inPoint` (fish pad, back-right), `shelfPoint`, `cashPoint`, `staffPoints` ×1, `customerPoints` ×3, `workSpot`, `fxPoints.steam`, `footprintPoly` | the props Blender pipeline in `tools/` (as `market_counter` / `tent_a`), judged at phone zoom 0.8–1.2, day and night | alone on one page **`v43_food`** (≤ 512 × 512, ≈ 1.0 MiB), on demand once the stall is offered, then with the plaza area: **+1 file** |
| `item_eomuk` | item icon: a paper cup with two fish-cake skewers, a wisp of steam | the size of `item_fish_cooked`; one frame (shelf stack, carry stack, want bubble, 금방 app row) | same | **merged into the resident `assets/props/props_items` page** (merge + guard, old frames byte-identical): 0 files, < 0.01 MiB. It shows in the 금방 app at the depot, where the tour peaks, so it must not live on the paged stall sheet (r2 [29]) |

Zero-art fallback for D1 (Q6): `market_counter` + `tent_a` + `lantern_string` as 생선구이 포장마차 selling
`item_fish_cooked` at 3 coins (drains the grill's over-supply instead of raw fish).

### 13.2 Reused (no new art)

| Use | Existing art |
|---|---|
| 자재창고 | `warehouse` (`bld_buildings`, resident with the 창고); `pallet_planks / _ingots / _ore / _logs` (`lgx_items`, shipped, 0.3 MiB) |
| Hub plates, chips, dots | `ui_panel`, `ui_office_tab(_on)`, `ui_chalk_panel`, `ui_chip`, `ui_card(_selected)`, `ui_button_blue/green/gray`, `ui_status_0–3` (ui, ui2, ui5 `@panels` — the office's on-demand page; the hub waits ≤ 1.2 s for it like `OfficePanel`) |
| Icons | `ui_icon_people`, `ui_icon_worker`, `ui_icon_porter`, `ui_icon_staff`, `ui_icon_route`, `ui_icon_depot`, `ui_icon_tools`, `ui_icon_coin`, `ui_icon_inventory`, `ui_icon_lock`, `ui_icon_close`; item icons as sector icons; `emote_zzz` (the pip) |
| Faces | `portrait_*` 128 px (the pages the hire pads use; icons instead when `Residency` has no room, e.g. in the rail district) |
| Route line | `v42_core` nav dots |
| D1 | `fx_smoke_puff` (white steam), `sfx_sizzle`; town dolls (`townfolk`, `townfolk2`); owner = a townfolk elder doll |
| D3 | `log_seat*`, the green's campfire, `picnic_table`, food icons baked into one table image, `PartyEvent` hearts, notice board |
| D4 | `item_stove_iron` (`lgx_items`; resident once the pad is bought), `House.smoke`, the night glow sprite |
| D5 | the 2단 station look + `fx_smoke_puff` |

Not used: ui6 (`ui_gb_*`, the 금방 brand, resident only while 금방 is open); forklifts and vans (§4.5).

### 13.3 Optional (only on the designer's request, Q5)

| Item | Cost |
|---|---|
| 2 more looks per gathering profession (`*_d`, `*_e`: 10 workers, `tools/wkr_*`) + 10 portraits | ≈ +2–4 MiB in the `workers` pages (only looks in use load), +2–4 files after packing |
| A `자재창고` sign decal (procedural, in v4.4's `ui7` page) | +0 files, < 0.1 MiB |

### 13.4 Budgets

| Budget | Now | This track | How |
|---|---|---|---|
| Files (gate 480) | ≈ 412–413; ≈ 457 after 금방; ≈ 459 after v4.3.1 | **+1** (v4.3.2) → ≈ 460; v4.4 (+2 `ui7`) ≈ 462 | one small page |
| Textures (must 455 MiB) | tour peak 451.4 (depot), ≈ 452 after 금방; plaza peaks 417.9–421.8 | +0 resident (L0, L1a); +≈ 1.0 MiB near the plaza (stall page), +0.3 MiB `lgx_items` resident with D4, < 0.01 MiB `item_eomuk` | the stall body is by the plaza, far from the depot; the tour adds "hub open + 금방 app" at `17_depot_revealed` |
| Display objects (late plaza 1,653; z0.6 1,810; `soak42` ≤ 1,916; gate 1,700) | over the gate late | net ≤ +20 any view, **no savings counted until measured** | stall ≤ 15 (building, glow, baked shelf / pad stacks, owner, ≤ 6 queue dolls); feast table 1 baked image + 2–3 props (its guests are residents already in the scene); 자재창고 ≈ 8 (outside the plaza views); the bundle bake and the crew gate are reported, not credited |
| Logic (absolute, r2 [28]) | plaza 0.226 ms; office view 0.365 ms (v4.2 budget 0.25) | v4.2.1 plaza ≤ 0.24, office ≤ 0.375; v4.3.2 plaza ≤ 0.30, office ≤ 0.40; no board frame > 0.1 ms (desktop ≈ 0.3–0.5 ms on a phone) | board one item type per tick (≤ 25 sources × ≤ 80 sinks per type); idle sampler 1 Hz over ≤ 50 people; `SectorFlow` counters O(1) per event; home stove sinks only while ordered; "pool porters stop scanning" counted only once measured |
| Hub panel | — | opens < 100 ms unloaded; rows refresh 1 Hz in place (the missions_bank M-6 rule) | like `OfficePanel` |

---

## 14. Save

```
haul: { v: 1,                                                     // v4.3.2 L1a, ≤ 768 B
  mv:   { "hire3_hunter": "log", "p2:grill": "smokehouse" },       // slot id → line now; only differences (≤ 17 movable slots)
  auto: 0,                                                         // 알아서 배치 on / off
  ch:   { wh: 4, mat: 1 },                                         // pool members per building (homes)
  mat:  { c: { "item_ore": 40, "item_plank": 22 } }                // 자재창고 contents
}
demand: { v: 1,                                                   // v4.3.2 L1b, ≤ 1 KB
  off: { stall: 1, forge2: 0, smelter3: 0 },                       // offers shown (once per save)
  stall: { b: 1, fish: 12, sk: 30, q: 3 },                         // built, fish on the pad, skewers on the shelf, queue
  forge2: 1, s3: { smelter: 0 },                                   // bought upgrades
  stove: ["house_3", "lotH1"],                                     // homes with a stove (≤ 64 ids)
  feast: 12,                                                       // last game day with a feast
  tot: [skewers, stoves, feastFood] }                              // for 서리 소식 and the hub
```

- **Additive, no `SAVE_VERSION` bump** (7 today). `Save.js` gets local keep rules `keepHaul` / `keepDemand` (the
  `geumbang` G-P5 pattern: `sanitizeSave` builds a new object and drops unknown keys). v4.4's slice registry registers
  both and `MIGRATE[7]` copies them through.
- **Size**: 17 movable slots × ≈ 28 B + `ch` + `mat` (6 types) + header ≈ 640 B worst case → cap **768 B**; the worst
  case is a fixture in the `slices` fuzz (r2 [30]).
- **Sanitise**: `mv` keys must be known slot ids of a done step or a bought 짐꾼 2; values a line the role may take **and
  the price rule allows**; anchors dropped; caps enforced (extra moves dropped, newest first); `ch` totals clamped to the
  crew that came (`v42.crew`); `mat.c` only accepted types, ≤ cap, raw ≤ `rawShare`; `demand.stove` only known house ids;
  counts clamped.
- **Not saved**: idle shares, cooldowns, board jobs (rebuilt in ≤ 1 s; loads in hand come back as today's porters'
  stacks do), `SectorFlow` counters (start empty; the hub shows `재는 중…` for the first minute).
- **Restore order**: `buildV42` → `Jobs` (reads `mv`) → `progress.init()` re-hires, each person placed at `Jobs.lineOf`
  (instant, at the new line) → `LineUpgrades.afterRestore` re-hires every bought p2 by slot → `WarehouseCrew.afterRestore`
  restores `ch` → the 자재창고 restores after its building, before the porters' first tick; the stall after its building.
- **Buildings**: new building keys `material` and `stall` in the buildings / sites save (added to the sanitiser's list
  and `UNIQ`); a stall saved where the art is missing falls back to the zero-art counter.
- **Older saves**: a v4.2 save without a 창고 now sees the 창고 card (early unlock); a save with the touch's crew keeps it;
  a save with a 창고 anywhere keeps it; absent slices = nobody moved, auto off, everyone at the 창고, empty 자재창고, nothing
  offered or built.
- v4.2.1 adds no field (the crew already saves in `v42.crew`; D2b and the order fix are rules).

---

## 15. Tests

### 15.1 Node (fixed step, seeded)

| Suite | Checks |
|---|---|
| `haul_board.test.mjs` | 10,000 random ticks on fixture places: items conserved; no item enters a keep place twice within `flapS`; keep → keep never; backfill only under its source rule; the yard's exits in the LD26 order (sled before export); no claimed job without a porter after `claimS`; urgent (≥ 46) first; batching within `batchPx`; far trips wait for `minLoadFar`; one item type rebuilt per tick |
| `jobs.test.mjs` | slot table from fixtures (`progress.done`, p2, crew); anchors never movable; caps; **price rule** (no move into a line without its own hire2 / hire3 / p2); cooldown; offers never reopen; **p2 by slot** (move then buy, buy then move, reload → the right count at each line); sanitise (bad ids, anchors, over-cap, unknown lines, price-rule violations); auto-assign hysteresis (no move back within `stayS`, respects the chief's moves, never above caps, one move a tick, sources only with `srcFullShare`) |
| `sectors.test.mjs` | sector rows and causes from fixture counters + job states; why-chain order (carrier → operator → raw → not built); unlimited-buyer lines never 'short' from a shelf at its display floor; anchors never counted in 💤 |
| `sector_flow.test.mjs` | counters equal the fixture's event stream (made / used / sold / coins) per minute; ring wraps; no allocation per event |
| `demand.test.mjs` | stall recipe 3 → 4; stall input never fed while the cannery's or the grill's input has room (prio 40 < 42 < 60); offers only after village complete and by the measured condition; tools before stoves; stoves only for an open order, never for the dock; one stove per home; feast only at 18:00 with ≥ 30 food, no meat below a 50 % meat shelf; 용광로 3단 offered only when processing-limited (never on the S25 / S35 fixtures); no 훈제장 3단 offer exists |
| `slices` (extended) | `haul` and `demand` round trip, ≤ 768 B / 1 KB, the worst-case `haul` fixture, 300 fuzzed slices never throw |
| `balance` | `balanceCheck` 0 warnings with the new keys |

### 15.2 Browser (Playwright, `nohup` + `nice -n 10`, one browser at a time)

| Suite | Version | Checks |
|---|---|---|
| `lgx_l0.mjs` | v4.2.1 | on the 46-min save: raw porters never reach the dock / 창고 in 10 game minutes; a yard-less raw porter never leaves while its input holds < 15 s of work; the 창고 card appears at village complete on a fresh 20-min run and never before, **with an M plot free (5 seeds)**; the crew's first job after a full output is overflow / direct, not a raw run; the crew carries fish to the cannery; the crew does not grow while use-busy < 80 %; standing cards pick the surplus item; after 읍 the founded shops sell every 20 s; 0 errors |
| `hub.mjs` | v4.3.2 | 390×844 DPR 3 and 360×640 DPR 2, ko + en: the popBox door (hit, pip inside 150 px, **always 현황**), the village-complete banner (once, tappable), every tab, 8 cards without scrolling at 360×640, card → detail → 사람 보기 / 지도, anchors as `대기 · 줄 지킴`, the move sheet (allowed, disabled, price rule, fields advice, cooldown), auto toggle, office links only once the office stands; the HUD overlap checker (0 overlaps; the popBox's 150 × 56 hit never meets the rank / order chips); hub opens < 100 ms unloaded; **G18: card numbers within 10 % of the probe's counts** |
| `material.mjs` | v4.3.2 | offer by need; build; reserve filled; a site served from it; backfill only of a starved station with an empty pile; exits in order (sled above 40 %, export above 60 %, crew export above 80 %); **G17 over 40 game minutes**; the 금방 sled stops there first (with 금방 on) |
| `jobs_live.mjs` | v4.3.2 | move each movable role; the walk; save mid-walk and reload → the person at the new line, no orphan reservations (`Logistics.res` totals back to 0 after 30 s idle); **p2: move in, buy that line's own p2, reload → 3 porters**; screenshot of 5 fishermen and 5 lumberjacks on their own drop / stand spots; an idle anchor p1 takes one local job and returns |
| `stall.mjs` · `feast.mjs` · `stove.mjs` | v4.3.2 L1b | offer, build, sell / eat / deliver, coins in a registered till (the courier collects the stall), save round trip, guests despawn off screen, 0 errors |
| Existing | each | `v4` · `v42` · `smoke` · `v3` · `pickup` · `nav` · `rail` · `town` · `labour` · `dog` · `life` · `zoom` · `plots` · `restaurant` · `c2` · saves `save_v2/v3/v35/v4/v42` · `v42_guide` · `pilot` · `v42_layout` (+ `v_mat`, `v43_stall` checks, in L1) · 금방's `gb.mjs` / `gb_drain.mjs` once 금방 is in |

### 15.3 Probes, census, bots (the gates of §2.2)

Order (each step's numbers reported against the previous one):
1. **Before v4.2.1**: probe L / S25 / S35, fresh40 and the census on v4.2 + touch (new baseline; the touch's restaurant
   and crew change the numbers).
2. v4.2.1: probe L / S25 / S35, **fresh40 (G4)**, census `g60`, fresh25 + `reqlog42` (first 20 min), pacing medians
   (5 seeds × smart, arrow, arrow-only), `visitors42 --base`, `sysprof` (plaza + office view).
3. 금방 GB-CODE-2: tuned on step 1's numbers; `gb_drain.mjs` and its gates re-run once v4.2.1 lands.
4. v4.3.2 L1a (census configuration of §2.2, yard pre-filled; also the no-moves run), then L1b, then L1b with D5 offered:
   the same set + `gb_drain` and 금방's gates (G16) + `soak42` (600 s × 2, with the feast at 18:00 and the stall's
   evening peak in view), `sysprof`, `perf_cmp` (bundle-bake prototype on / off, slot-budget report), `texbudget`,
   `texview2`, the screenshot tour (+ "hub open + 금방 app" at `17_depot_revealed`), `build_artifact` +
   `test_deploy standalone --quick`.

Report per step: each pile's ≥ 90 % share and "any pile", the 자재창고 raw share, the 판매대 empty shares, fish / wheat
piles at 25–40 min, the 창고 average, crew size and use-busy share, gatherers' idle share, income against v4.1's 1,851
and against the step before.

---

## 16. Risks

| # | Risk | Mitigation |
|---|---|---|
| K1 | The touch changes the numbers this plan starts from | step 1 of §15.3; §5.4 and §9 updated from `v42_touch.md` before B1 |
| K2 | The board replaces three `think()` methods: regressions in founding-card, restock and wholesale rules | each role's filters become job filters (§5.5 table); the v4 / v42 suites and the census bot guard them; ≈ 3 days budgeted (§17) |
| K3 | A step lands above its income band | the §10.4 lever order; D5 is the largest single lever and is by need |
| K4 | G1 ≤ 65 % missed | the yard exits (G17), the hunter move, D2b; then the designer's Q3 / Q9 choice |
| K5 | The early 창고 makes 읍 earlier than −5 % | raise smelter / smokehouse 짐꾼 2 costs, then the 창고 cost (§5.2) |
| K6 | The arrow-only player meets the 창고 goal at ≈ 20 min and slows down | G8 (arrow-only ≤ +8 %); if the arrow-only median slows, `GOALS` puts `warehouse` back after `south` (the arrow only) while the card stays at village complete |
| K7 | Display objects already over 1,700 late | nothing new in the plaza from L0; stall ≤ 15, feast baked; G12 measured without credits; the bake ships only if it measures |
| K8 | HUD overlap and a small door before the v4.4 stack manager | popBox hit 150 × 56; the overlap checker in `hub.mjs`; the banner, letters and office as other doors |
| K9 | 4th / 5th gatherer repeats a look | accepted (Q5); optional new looks |
| K10 | Players never discover 이직 | the village-complete banner, the 💤 pip, the idle letter, (v4.4.1) a quest as a state fact |
| K11 | 금방 and the board chase the same surplus | LD26 order; `claimed: 'sled'`; G16 re-runs; `exportFrom` per item rises if 금방's racks run short |
| K12 | Save compatibility across v4.4's 7 → 8 | slices registered; `MIGRATE[7]` copies them; the `mig_real` fixtures + a v4.3.2 fixture with every role moved |
| K13 | The model estimates (§9) are off by more than 25 % | every gate is re-measured; levers per gate are named; the order (L0 → 금방 re-check → L1a → L1b) lets each step be read alone |
| K14 | The stall art is late | the zero-art fallback (생선구이 포장마차) ships; the art swaps in later |
| K15 | 용광로 3단 moves the limit back to carrying (≈ 92 made a minute, its two goods porters carry ≈ 50) | D5's offer text suggests moving a 짐꾼 2 there (the 3rd); the pool takes the overflow direct to the 교역소 (`warehouse.direct`, prio ≥ 40); measured in B3 |
| K16 | The 자재창고 fills (raw share 240) | exits sized ≈ 50 a minute (§5.3); G17; the 물류 card turns blue `자재창고 가득` |
| K17 | Mid-game smoked meat now sells and takes fish / bread sales (substitution) | G4 side measure (fish / wheat piles, grill / oven blocked at 25–40 min); D2 / D2b absorb cooked fish and bread; the pacing guard (G8) |
| K18 | The probe is lost before step 0 | step 0 is the first action; the flow map documents the probe's method so it can be rebuilt (≈ 1 day) |

---

## 17. Effort

| Job | Build | Review + fix | Notes |
|---|---|---|---|
| step 0 (probe into the repo) | ≈ 0.1 | — | copy only |
| v4.2.1 L0 | ≈ 2.5 | ≈ 1 | carry rules + crew order ≈ 1.5, crew gate 0.25, D2 0.25, D2b 0.1, probe cleanup + bot pads 0.4; measurements on a loaded 4-core machine take most of the review day |
| 포장마차 art (B4) | ≈ 1 | ≈ 0.5 | look-dev, render, pack, merge the icon, check, Phaser page; parallel, now |
| v4.3.2 L1a | ≈ 8.5 | ≈ 2.5 | board ≈ 3, 자재창고 ≈ 1, jobs + 이직 + auto + slot contracts + 4th / 5th spots ≈ 2, hub (Shell, 3 tabs, move sheet, doors, `SectorFlow`) ≈ 2, bake prototype ≈ 0.5 (r2 [32]: `LedgerRows` and `guideTo` stay in their versions) |
| v4.3.2 L1b | ≈ 4 | ≈ 1.5 | D1 ≈ 1.5, D3 ≈ 1, D4 (to order) ≈ 1, D5 (smelter) ≈ 0.5 |
| **Total** | **≈ 16** | **≈ 5.5** | |

---

## 18. Changes this plan asks of other plans (owners decide; nothing edited here)

| Plan | Change |
|---|---|
| `v44_plan.md` | B3: `Shell.js` already exists (reuse); the stack manager's pop / rank row carries the hub door (opens 현황) + 💤 pip (hit 150 × 88); slice registry + `MIGRATE[7]`: `haul`, `demand`; the stall's till joins the till registry (D29). **D13 / popBox**: v4.3.2 shows the popBox as today and always from village complete; v4.4's "from `hire_miner`" rule supersedes when v4.4 lands; the hub door is active from village complete either way (one rule per version, r2 [31]). **`seedI[era]` and the reward floors are re-measured after v4.3.2** (they were set on v4.2 income). §3.4 / §16.3 / B6: the 마을 panel is the 마을 경영 hub (+ 등급 · 행복 · 통계; 자원 = 현황 by region). §18.2: two admin rows. B4: `Navigator.guideTo` stays in v4.4.1 and adds the hub's `가 보기` |
| `geumbang_plan.md` | GB-CODE-2 tunes on v4.2 + touch and re-checks `gb_drain` + its gates after v4.2.1; G1b sled 집하: the 자재창고 first (above 40 % of its raw share) + `claimed: 'sled'` (§5.6); its income / stock / order-wait gates re-run after L1a and L1b (G16); catalogue rows for `item_eomuk`, `item_stove_iron` (stove orders count as D4 orders) |
| `v5_v8_plan.md` | D6 가구 공방 moves from v8 step 2 to v5 (half of v8's prices); v8 `logistics/tuning.js` prices `item_stove_iron` 90 as a 가전 product: proposal — the stove stays a 대장간 product at 30, the 가전 list keeps radio · washer · fridge · TV; §3.3 re-bases `I` on the income measured after this track |
| `v42_plan.md` / `기획서_v4_2_촌장.md` §2.3 | the three options are answered: ① replaced by 이직, ② by the 자재창고 + crew, ③ kept as a signal (the 💤 at the gatherers); `v42.surplus` sources change once the 자재창고 stands |

---

## 19. Questions for the designer (asked in Korean in `docs/기획서_물류수요개편.md`)

The default ships if there is no answer, **except Q9, which has no default** and is answered before B3.

| # | Question | Default |
|---|---|---|
| Q1 | One window **마을 경영** (현황 · 일꾼·짐꾼 · 물류), opened by tapping the 인구 칸 (always on 현황, a one-time banner teaches it), no new button — OK? | yes |
| Q2 | 창고 from village complete (≈ 20 min), on any free plot. Earlier? | village complete |
| Q3 | 용광로 3단 only (no 훈제장 3단): offer after 읍 only when the smelter is the limit (ore drains; income Δ +5–12 points), or never (ore leaves cheaply; piles ≈ 52–63 % full)? For meat the window suggests moving one hunter to the forest | offer by need |
| Q4 | Name: 자재창고 (the designer's word) or 원료 창고 (says what it holds; 창고 · 자재창고 · 물류창고 read alike on a phone)? | 자재창고, with the "which storage holds what" picture |
| Q5 | 4th / 5th gatherer of a line may look like an earlier one; or draw 10 new looks? | same look |
| Q6 | 포장마차: 어묵 (2 new pictures) or 생선구이 (existing pictures)? | 어묵 |
| Q7 | Skewer price 2 coins? | 2 |
| Q8 | 알아서 배치 on from the start? | off |
| Q9 | Income after 읍: per-step bands (v4.2.1 +38–53 % over v4.1; then +3–10, +1–6, +5–12 points per step), or keep +15–30 % (v4.2 is already +33 %; piles stay fuller)? | **none — answer before B3** |
| Q10 | Feast at 18:00 at the 마을 마당 fire? | yes |
| Q11 | Stoves: residents buy them (30) or a village gift (0)? Either way only made when a home or the 철물점 asks | residents buy |
| Q12 | Station porters (역 짐꾼) movable too? | no |
| Q13 | The small rules first as v4.2.1 (금방 does not wait for it), the window in v4.3.2? | yes |
| Q14 | 솔방울 shops' town buyers twice as often after 읍 (D2b)? | yes |
| Q15 | 이직 price rule: a person may move into a line only after that line's own 2nd / 3rd (or 짐꾼 2) was bought — or pay the price difference on the first move? | only after its own hires |

---

## 20. Critique answers (`docs/build_reports/logistics_plan_critique.md`)

| # | Sev. | Finding | Answer | Where |
|---|---|---|---|---|
| 1 | High | G1 / G2 not reachable from the plan's cells | Restated from the cells: v4.2.1 ≈ 93–95 %, L1a ≈ 70–79 %, L1b ≈ 52–63 %; G1 ≤ 65 % hard, ≤ 50 % only once 용광로 3단 is bought (with the hunter move in the census config); B1's ore gate = smelter ≥ 70 a minute and ore ≤ 60 %; +22 ingots budgeted | §2.2, §5.7, §9, B1 |
| 2 | High | Late smoked meat is guest-capped; extra meat moves the pile | LD18; §3.5; 훈제장 3단 dropped; meat lever = one hunter to the forest + D2b; net coins counted; fish / wheat at 25–40 min as a G4 side measure (K17) | §1, §3, §6, §9, §10 |
| 3 | High | The 자재창고 is a buffer | exits sized (station porters first, sled, crew export above 80 %) ≈ 50 a minute; L1a gates at steady state (pre-filled); G17; "basket" in the designer doc | §5.3, §2.2, §15 |
| 4 | High | Fish allocated three times; stall ties with the cannery | stall `inPrio` 40 (< 42, checked); B2 moves a hunter, no fisherman; D1 sized ≈ 15–20 (§6.5); auto takes only from full-pile lines | §6.2, §6.5, §12, B2 |
| 5 | High | G4 cannot be measured with S25 / S35 | fresh40: median of 5 smart-bot runs to 40 min, the bot building the 창고 and buying 짐꾼 2; S25 / S35 "no worse" | §2.2, §11.1, B1 |
| 6 | High | 금방 drains the same surplus; not re-based on v4.3.2 | v4.3 column; LD26 priority (processing → 금방 → export); G16 re-runs after v4.2.1, L1a, L1b; the designer doc names 금방 as a customer | §1, §5.6, §9, §18 |
| 7 | High | Moving a 짐꾼 2 breaks `LineUpgrades` | p2 tracked by slot, dedupe by slot, `f4Due` by count within the cap; `jobs_live` case | §7.6, §15 |
| 8 | High | The probe lives in the scratchpad | step 0 / §B0: copy now in the next WIP snapshot (files listed); B1 cleans. Not done in this docs-only step | §4.0, B0 |
| 9 | Medium | The crew gate never blocks | busy / backlog on use jobs (prio ≥ 40) only; keys in `warehouse.crew`; cap 5 fallback; the "≈ 4" and display claims removed | LD4, §5.4, §12 |
| 10 | Medium | Early crew prefers ore → dock | v4.2.1 job order: out → overflow / direct → cannery link → raw runs last | §5.4, §11.1 |
| 11 | Low | `crew()` counts only the 창고 | pool count across both buildings; homes saved as counts (`haul.ch`) | §5.4, §7.6, §14 |
| 12 | Low | BACKFILL cannot be a sink priority | a board source rule; removed from `PRIO` | LD7, §5.5, §12 |
| 13 | Low | 4th / 5th placement and restore path | `Progression.js` in L1a; `drop4/5`, `stand4/5` in `world.js`; `Jobs` before `progress.init()`; screenshot check | §7.3, §7.6, §11.2 |
| 14 | Medium | 이직 to the fields makes bread worse | forest only in advice, acceptance and income; the fields row says `빵이 이미 남아요`; auto never adds wheat | §7.3, §7.4, §10 |
| 15 | Medium | Hire prices can be skipped | a move only into a line whose own hire2 / hire3 (or p2) was bought; Q15 offers the price-difference variant | LD9, §7.3 |
| 16 | Medium | Most visibly idle people are locked anchors | `대기 · 줄 지킴` (blue) not idle; 💤 counts movable only; idle anchor p1 lends to one local job; the designer doc says who stays and why | §7.2, §7.3, §8 |
| 17 | Medium | The popBox as a door | always 현황; pip ≤ 28 px inside 150 px; one-time tappable banner; 150 × 56 accepted until v4.4 with other doors | LD12, §8.4 |
| 18 | Medium | Ledger reports ≈ half the flow | `SectorFlow` event counters; 어업 `잡기 · 쓰임` with a breakdown; G18 | LD28, §8.2 |
| 19 | Medium | Unlimited-buyer lines look red / orange | status from output-full and pile shares | §8.3 |
| 20 | Low | 360×640 does not fit | no header / footer; cards 330 × 190 (802 px of 888) | §8.5 |
| 21 | Low | 상업 card has no source before the office | `SectorFlow` sold + coins; office doors only once built | §8.2, §8.4 |
| 22 | Medium | Missed lever: 솔방울 shops' customers | D2b in v4.2.1 (`inlandEveryRank2` 20) | LD27, §6.2 |
| 23 | Medium | Stoves at a loss | made to order, never for the dock; ≈ 0 coins after homes are furnished | LD16, §6.2 |
| 24 | Low | Stall and stove coins need a till | R9: stall till in `villageTills` + v4.4 registry; stoves into the 철물점 / 판매대 till | §6.1, §11.3 |
| 25 | Low | Feast in the evening peak | table baked to one image; feast + stall peak in G12 views | §6.2, §13.4, §15.3 |
| 26 | Medium | Plaza plot `v_wh` | dropped: no free footprint (scan), busiest view, dead plot; the card uses the open M plots; free-plot check in `lgx_l0` | LD3, §5.2 |
| 27 | Medium | Bundle bake unmeasured | a prototype in L1a, measured, credited only if it saves | §11.2, §13.4, G12 |
| 28 | Medium | Logic budget already spent | absolute targets; one item type per tick; savings not counted until measured | G11, §13.4 |
| 29 | Low | Skewer icon and hub at the depot | `item_eomuk` merged into resident `props_items`; the stall page holds only the body; tour case at `17_depot_revealed`; portraits fall back to icons without room | §13.1, §8.5, G13 |
| 30 | Low | `haul` ≤ 600 B tight | 768 B cap; worst case in the fuzz | §14, G15 |
| 31 | Low | v4.4 calibration | `seedI` re-measured after v4.3.2; one popBox rule per version | §18 |
| 32 | Medium | Effort underestimated | `LedgerRows` → v4.6, `guideTo` → v4.4.1; L1a ≈ 8.5 + 2.5; total ≈ 16 + 5.5 | LD13, §17 |
| 33 | Medium | Income gates cannot catch a regression | per-step bands with tolerance; Q9 no default, answered before B3 | LD19, §10.3, §19 |
| 34 | Medium | The schedule links three plans | 금방 tunes on v4.2 + touch, re-checks after v4.2.1; one owner per step for layout / census tools | LD23, §4.1 |
| 35 | Low | Crew numbers in two blocks | the need gate lives in `warehouse.crew` | LD20, §12 |
| 36 | Low | Designer-doc wording and claims | `%p` gone; forest only; the 360×640 claim and the pile range corrected; a storage picture; Q4 offers 원료 창고 plainly | `기획서_물류수요개편.md` |
| 37 | Low | 금방 missing from the designer's story | one line in §2 and §6 of the designer doc | `기획서_물류수요개편.md` |

---

## B0. Step 0 — the econ probe into the repo (now)

- **Owner**: whoever makes the next WIP snapshot (the orchestrating session). Not a builder task; no game code changes.
- **Copy unchanged** from `/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/econ/`:
  - into `tools/test/econ/`: `probe.mjs`, `an.js`, `lines.js`, `val.js`, `bot_an.js`, `census_an.js`, `geo.mjs`;
  - into `docs/build_reports/econ_baseline/`: `auto10.json` + `auto10.log` (run L), `s25.json` + `s25.log`,
    `s35.json` + `s35.log`, `smoke.json` + `smoke.log`.
  - Not the `fv/` folder (a scratch copy of the game the runs used so the touch's in-flight edits would not mix in).
- **Note in the snapshot**: the probe's defaults point at the repo (`--repo`), and run L used `--setup final` with the
  46-min fixture; B1 cleans paths and flags.

## B1. v4.2.1 — 물류 손질 (L0)

- **Owner**: the v4.2 touch builder, after the touch publishes and `v42_touch.md` exists. Runs in parallel with
  GB-CODE-1 P0 / P1; 금방's GB-CODE-2 does not wait for it (it re-checks once B1 lands).
- **Read**: §1 (LD2–LD6, LD18, LD24, LD27), §2.2, §5.1, §5.2, §5.4, §6.2 D2 / D2b, §9, §11.1, §12, §15; `v42_touch.md`;
  `logistics_flow_map.md` §1, §4, §7; `Worker.js` (`RawPorter` load / spill states, `WarehousePorter.think()` /
  `rawJob()`), `WarehouseCrew.js`, `Progression.js` (`BUILD_UNLOCK`, `GOALS`), `LineUpgrades.f4Due`, `Growth.js`
  (standing cards), `Shop.js` (inland buyers), `Surplus.js`, `Logistics.js`, `Warehouse.js`, the census and smart bots.
- **Clean**: `tools/test/econ/**` (copied in at step 0): repo-relative paths, `--late` flag, a JSON summary with the §2.2
  measures; then **create** `tools/test/lgx_l0.mjs`.
- **Edit**: §11.1. No `Game.js`, `Save.js`, `UI*.js`, `world.js` or `v42_layout.mjs` edit.
- **Tests**: `lgx_l0.mjs`; every existing suite; `balanceCheck`.
- **Acceptance (numbers)**:
  - probe L (late setup, one game day): raw porters' dock / 창고 time **0 %**; smelter **processed ≥ 70 a minute**,
    starved **≤ 5 %**; cannery starved **≤ 25 %**; ore pile ≥ 90 % **≤ 60 %**, meat **≤ 60 %**;
  - **fresh40** (median of 5, the bot builds the 창고 and buys 짐꾼 2 pads): 판매대 smoked meat empty at 25–35 min
    **≤ 15 %**; fish / wheat pile ≥ 90 % at 25–40 min no more than +10 points over the step-1 baseline (reported with
    grill / oven blocked); probe S25 / S35 no worse than the baseline;
  - census `g60`: every 판매대 food empty **≤ 10 %**; any pile ≤ the step-1 baseline; income **+38–53 %** over v4.1;
    창고 crew late ≤ 6 and never below the base, its use-busy share reported (cap → 5 if it reaches 6 with use-busy
    < 70 %);
  - fresh25: village complete within ±5 % (median of 5 seeds), first-20 income ±5 %, `reqlog42` identical up to
    village complete; the 창고 card never before village complete, with an M plot free when it shows;
  - pacing medians (5 seeds): smart and arrow 읍 ±5 % of the step-1 baseline; arrow-only ≤ +8 % over v4.1; longest
    wait ≤ 3.8 min;
  - `sysprof`: plaza ≤ 0.24 ms, office view ≤ 0.375 ms a tick; display objects net ≤ +5; files +0; textures +0; 0 page
    errors.
- **Screenshots** (390×844 and 360×640, ko): the 창고 card at village complete (and the `빈 땅이 생기면` reason in a
  forced no-plot case); a raw porter waiting at a full station (not walking away); the crew carrying fish to the
  cannery; the crew arrival banner; a 솔방울 shop selling after 읍.

## B2. v4.3.2 L1a — 물류 게시판 · 자재창고 · 이직 · 마을 경영

- **Owner**: the logistics builder, after v4.3.1 is merged (`Game.js`, `UI.js`, `Save.js` pass on).
- **Read**: §1 (LD7–LD13, LD21–LD28), §2.2, §5.3–§5.7, §7, §8, §11.2, §12, §13, §14, §15; `v44_plan.md` §19.1–19.3
  (HUD, shell, sizes), D13, B3 (Shell), §16 (why-chain); `OfficePanel.js` (tabs, `@panels` wait), `UI.js`
  (`setPopulation`), `UIv4.js` (`HudV4.layout`), `Logistics.js` (`best`, `reserve`, sinks), `Station.js` (input sink),
  `Worker.js` (all hauler classes), `Warehouse.js`, `WarehouseCrew.js`, `LineUpgrades.js` (`hireP2`, `f4Due`,
  `afterRestore`), `Progression.js` (hire indices), `Game.js` (`hireWorker`, `hirePorter`, `hireRawPorter`, `noteMade`,
  `buildV42`), `Seller.js`, `Shop.js`, `StockLedger.js`, `StackBaker.js`, `Navigator.js`, `geumbang/ports_v4.js`
  (`piles`, `takePile`), `Save.js` (`sanitizeSave`, the `geumbang` keep rule).
- **Create / edit**: §11.2.
- **Hooks**: `Game.update` (board one item type per tick, jobs sampler 1 Hz, `SectorFlow` after the v4.2 block),
  `Game.serialize` (`haul`), the hire functions, `Civic` offers, the popBox pointer, the village-complete banner,
  `OfficePanel` top lines, `VillageNews` (idle letter, auto lines), `ui.v42PanelOpen`.
- **Tests**: `haul_board`, `jobs`, `sectors`, `sector_flow`, `slices` node suites; `hub.mjs`, `material.mjs`,
  `jobs_live.mjs`; every existing suite; save fuzz (40 edits × restart) with the `haul` slice; `mig_real` fixtures; a
  v4.3.2 fixture with every movable role moved; the worst-case `haul` fixture.
- **Acceptance (numbers)** — census configuration of §2.2 (자재창고 at steady state, one hunter moved to the forest; no
  fisherman moved):
  - probe L: ore ≤ 40 %, meat ≤ 20 %, fish ≤ 50 % ≥ 90 %; cannery starved ≤ 15 %; raw walked to the dock ≤ 10 a minute,
    from the 자재창고 only, after the sled; gatherers idle ≤ 15 %; **자재창고 raw ≤ 80 % of its share on average after
    30 min (G17)**; crew size and use-busy reported;
  - census `g60` (bot with the same moves): 판매대 each ≤ 10 % empty; any pile ≤ the measured v4.3.1 (target ≈ 70–79 %
    by model); income **Δ +3–10 points** over the measured v4.3.1; the no-moves run reported beside it;
  - 금방: `gb_drain` and its income / stock / order-wait gates pass (G16);
  - fresh25, fresh40 and pacing as B1;
  - `sysprof`: plaza ≤ 0.30 ms, office view ≤ 0.40 ms, no board frame > 0.1 ms; display objects net ≤ +20 in every view
    (no credits); the bundle-bake prototype measured and reported (on / off, slot budget); textures +0; files +0; the hub
    opens < 100 ms unloaded and builds 0 rows per tick while open;
  - HUD overlap checker 0 overlaps at 360×640 and 390×844; the 8 cards fit without scrolling at 360×640; every new hit
    area ≥ 88 except the popBox (150 × 56 until v4.4); labels ≥ 22 px, body ≥ 26 px; card numbers within 10 % of the
    probe (G18);
  - save: `haul` ≤ 768 B; reload after any move → same lines; p2 move-then-buy → 3 porters after reload; no orphan
    reservations after 30 s.
- **Screenshots** (390×844 and 360×640, ko + en): the village-complete banner; popBox with the 💤 pip; 현황 (8 cards,
  one red, one blue, one green unlimited-buyer line); a card's detail; 일꾼·짐꾼 (전체, one sector filtered, an anchor
  row `대기 · 줄 지킴`); the move sheet (allowed, disabled by price, fields advice, cooldown); 알아서 배치 on; 물류 tab;
  the route drawn on the overview; the 자재창고 with pallets day and night; the office 재고 tab with the crew line; 5
  fishermen and 5 lumberjacks on their spots.

## B3. v4.3.2 L1b — 새 손님 (cut line → v4.3.3)

- **Owner**: the logistics builder, after B2 is green **and Q9 is answered**.
- **Read**: §6, §10, §11.3, §12 (`stall`, `feast`, `stove`, `station3`), §13.1, §14 (`demand`); the demand draft §3
  (player texts) and §8; `Workshop.js` (`pickTool`), `Game.makeStore`, `VillageLife.js` (`PartyEvent`), `House.js`,
  `Station.js`, `Growth.js`, `V42.js` (`villageTills`), `geumbang/tuning.js`.
- **Create / edit**: §11.3; the art from B4 (or the zero-art fallback).
- **Tests**: `demand` node suite; `stall.mjs`, `feast.mjs`, `stove.mjs`; every existing suite; save fuzz with `demand`.
- **Acceptance (numbers)** — census configuration of §2.2:
  - census `g60` with D1–D4: fish ≥ 90 % ≤ 15 %, wheat ≤ 10 %, ore ≤ 40 %, meat ≤ 20 %; **any pile ≤ 65 %**; with
    용광로 3단 bought: **any pile ≤ 50 %**; 판매대 each ≤ 10 % empty; 창고 average 80–120 (from 161–172); income
    **Δ +1–6 points** over L1a, **Δ +5–12** more with 용광로 3단 (else the §10.4 levers, reported);
  - the stall gets ≥ 12 fish a minute on average with three fishermen and the cannery link on; its input never takes
    fish while the cannery's or the grill's input has room; the stall's coins reach a registered till;
  - stoves only for open orders, none to the dock; 용광로 3단 never offered on the S25 / S35 saves; no 훈제장 3단 offer;
  - 금방: `gb_drain` and its gates pass again (G16);
  - fresh25 and pacing as B1 (읍 no more than 0.5 min sooner from D1 / D2b);
  - `sysprof` totals as B2; display objects net ≤ +20 with the feast at 18:00 and the stall's evening peak in view;
    plaza texture peak + ≤ 1.0 MiB; the tour peak ≤ 452.4 MiB including "hub open + 금방 app" at `17_depot_revealed`;
    files +1; `demand` ≤ 1 KB.
- **Screenshots**: the stall offer banner; the stall by day and at night with guests; the feast at 18:00; a house with a
  stove (chimney + warm window); the 대장간 2단 and 용광로 3단 pads; the 현황 card rows for each.

## B4. Art — 포장마차 (`stall_eomuk`, `item_eomuk`)

- **Owner**: the props art pipeline (`tools/`, Blender), now, in parallel; nothing in `src/`.
- **Deliver**: `assets/v43_food/` one packed page with the stall body + `_glow` only (≤ 512 × 512, ≈ 1.0 MiB) +
  manifest with the §13.1 points; `item_eomuk` appended to `assets/props/props_items` with the merge + guard (old frames
  byte-identical) and its manifest row; a check script (points inside the footprint, glow aligned, sizes, the guard); a
  Phaser test page at phone zoom 0.8–1.2, day and night, beside `market_counter` and `tent_a` for scale; previews; a
  build report.
- **Acceptance**: reads as a Korean street stall at zoom 0.8 on a 360-wide phone; the icon is distinct from
  `item_fish_cooked` at 28 px; +1 file; no existing frame changed.
