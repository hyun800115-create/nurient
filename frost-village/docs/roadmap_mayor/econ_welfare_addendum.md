# Engineering addendum: money flow, weekly report, neighbourhood shops, care (final for review, 2026-11-07)

Companion to the Korean designer doc `기획서_돈과복지.md` (same folder). Same version names, minutes, effort convention and question numbers (25–41; renumbered from the draft, see §17). It extends `docs/roadmap_mayor/engineering_roadmap.md`; the exact text edits for both roadmap docs are in `roadmap_patch.md`.

- **Status:** final draft for the 대표's plan review. Nothing under the repo was changed, and nothing is built until the review.
- **Base:** HEAD `96bbe89` (only the AAB build script changed since `b14f0a4`; no cited file moved), `SAVE_VERSION` 8 (`src/core/Save.js:39`).
- **Sources:** the scout notes `scout_money.md` and `scout_city.md`; both roadmap docs; the fun/scope and feasibility critiques of the draft (dispositions in §17); spot checks of the anchors below at HEAD; the critique's size/pack scripts in `crit/` plus `crit/size2.py` (positional save estimate).
- **Minutes** are pacing-bot minutes from a new game; humans take × 1.3–1.5.
- **Effort** is builder-days for one builder, art in parallel. Each range is the planned sum × 1.08–1.26 (the roadmap's overrun factor). Uncertainty ±30 % (v5.1 onwards ±40 %).
- **Designer request (verbatim):** 「마을이 커지면 시장도 몇 개 더 생겨야 하고 잡화점도 더 생겨야 되는 거 아냐? 주민들이 이동거리가 길어지잖아? 또한 주간별 보고서를 만들고 나에게 보고해줘: 게임상 수익과 지출, 세금, 이민 주민(들어온), 이주 주민(나간), 기타 마을 사건사고 등등 가능하지? 상단 코인을 누르면 돈이 어떤 식으로 굴러가는지 보여주고... 세금, 공적자금이 들어오면 복지사업도 있어야 될 듯하고.. 요양원, 요양병원, 유치원, 어린이집, 실버타워, 간병인, 병원, 건강관리 시스템까지」. All four parts are in-game features.

## 0. Summary

| ID | Piece | Version | Needs | Save | Texture | Planned d |
|---|---|---|---|---|---|---|
| — | Step-B plot-table edit (`d_school` XL, `d_clinic` L, hidden `w_civic`) | v4.3 | step B | — | 0 | absorbed (≈ 0.25) |
| F15 | MoneyBook: value counted once at creation into any balance; transfers count nothing; expense categories incl. negative refunds; day ring + week accumulator; arrivals and news tallies; the 통장 bars read it | v4.5 | F8 (Economy tags), F12a | `x.money` ≤ 896 B | 0 | 2.25 |
| F16a | Coin door + read-only 「오늘의 돈」 card (pre-읍 card; after 읍 [오늘] [이번 주] tabs) | v4.5 | F15 | — | 0 | 1.5 |
| — | Money tests and gates (invariant incl. sacks/savedCash, D10, admin, door) | v4.5 | — | — | — | 0.75 |
| F16b | Full 돈의 흐름 view (flow circle with node numbers + return arrow, per-source bars with build badges, 7-day bars, row tips, office 통장 tab → 돈, pooled text) | v4.6 | F15, F16a, C | — | 0 MiB resident; transient gate ≤ +3 MiB | 1.5 |
| F17 | Weekly report from 셈이: one screen (3 numbers, ≤ 3 wins, 1–3 actionable rows, next-week goal pick), taste report, 4 kept, 08:00 delivery | v4.6 (cut → v4.6.1) | F15, F16b, weekly goal, v4.4 staff gift | `x.wk` ≤ 1,024 B | 0 | 2.5 |
| — | Report lines (금방 incl. its direct till write, L1b, 먼 집 배달), 금방 far-home weighting, goal pick from the report | v4.6 | F17, G1, L1b | — | 0 | 0.75 |
| — | Report tests | v4.6 | — | — | — | 0.5 |
| — | 마을 곳간 line in the prototype sandbox + survey item | proto | F18 sketch | proto keys | 0 | 1.0 |
| F18 | 마을 곳간: automatic second balance from the rank-3 ceremony; tax + rent in; upkeep + wages out; overflow above a hold → wallet at payday; public builds fund-first with automatic wallet remainder; no donate/withdraw | v5.0 | F12a, F12b, F4, F15, P17 | `x.fund` ≤ 96 B | 0 | 1.5 + upkeep 0.5 + job slots 0.75 + balance 0.5 + tests 0.5 |
| F19 | 튼튼 수첩: 건강 need = clinic coverage (roadmap rule); an internal bonus-only score shown as 3 stickers; v1 weekly check-up; v2 visits, 체조, 건강 주간 | v1 v5.0, v2 v5.2 | F9, households; v2 F13 | none in v1 (derived); v2 `vs` in the story side store | 0 | 1.0 + 1.0 |
| — | Report departures + life news; warm-only move-out in both branches | v5.1 | F13 | side key | 0 | 1.0 |
| F20 | 동네 가게: one kind with two levels (food; + goods), main-thread household-basket demand (no story worker), candidate-plot card, porter folded into the price, multi-shelf ledger | **v5.2 돌봄 마을 (new)** | households (v5.0), L1a, F4, coverage overlay | `shops` ≤ 512 B | 0–0.55 MiB | 10.5 |
| F21 | Care: 어린이집 (2단 = 유치원 look + ages 4–6), 햇살 쉼터, 돌봄 선생님 visits, care jobs; cut line 실버타워 (쉼터 2단) and 돌봄 병원 (clinic 2단: elder coverage + check-up capacity); 건강/배움 extended to elders and ages 0–6; cards gated on first users | **v5.2 돌봄 마을 (new)** | F13, F18, F19, F4, F9 | `x.care` ≤ 256 B | `village_care` ≤ 3.62 MiB (2.0 without 실버타워; ≈ 0.6 if tint-shared with v5.0 apartment frames) | 15.5 + card gating 0.25 |
| — | Report incidents section | v5.4 (was v5.3) | F14 | — | 0 | 0.25 (inside the range) |

**Version slots:** v4.3 plot table · v4.5 counting + coin card · v4.6 full view + weekly report · prototype fund line · v5.0 곳간 + check-ups + facility jobs · v5.1 departures · **new v5.2 「돌봄 마을」:** shops + care · 탈것 → v5.3, 안심 → v5.4 (designer question 28).

**Totals**

| Span | Before | After |
|---|---|---|
| launch candidate (v4.3–v4.5) | 95–111 | **100–117** |
| 읍장 stage (v4.4–v4.6) | 109–127 | **119–140** |
| to 시장 취임 (v4.3 … v5.0 incl. prototype) | 172–202 | **188–222** |
| to 안심 마을 | 224–272 (… v5.3) | **270–327** (… v5.4) |
| v6–v8 | 75–103 | 75–103 |
| whole roadmap | 299–375 | **345–430** |

Net **+46 to +55** builder-days (43.75 planned, plus 0.25 inside v5.4's range).

### Decisions (each goes to the plan review)

| # | Decision | Why |
|---|---|---|
| AD1 | Value is counted **once, where it is created into any balance** (a till, the wallet, the fund) through `gs.money.inc(src, n)`. Moves between balances (till → sack → wallet, till → till, fund → wallet) count nothing | Collection only moves coins; counting at the wallet loses the source and timing. Counting "at the till" alone (the draft) misses wallet-direct and fund-direct creation and double-counts till-to-till moves (§2.3) |
| AD2 | The coin counter becomes a **door**; no new HUD button. Its open state reuses `UI.panelOpen` | D9 rejected a new HUD button; `panelOpen` already sits in every guard (`UI.js:142, 171, 187, 196, 345, 385`) |
| AD3 | **Launch gets counting + the card; the full view and the report go to v4.6** (question 26 A) | v4.5 is the launch build; the first real report lands at bot ≈ 110, after v4.5's 50–80 window; the report pairs with v4.6's weekly goal |
| AD4 | A report week is **7 game days**, the accounting day is `DayClock.day()` (midnight boundary), delivery at **08:00** on day 7k, plus **one taste report** | The story paper is at 07:00 from v5.1 (`story/tuning.js:23`); the 06:00 payday stays inside its day |
| AD5 | The report is **one screen**; every problem row carries one action; tables live only in the 돈의 흐름 「이번 주」 tab | Phone readability; no line without a decision |
| AD6 | Words: **새로 온 주민 / 이사 간 주민**; the public fund is **마을 곳간** (shop tills keep 금고) | 이주민 already means incoming settlers; 금고 already names tills (물류 금고, 역 금고) |
| AD7 | 곳간 is **automatic** (no donate, no withdraw); overflow above `hold = 7 × daily due + price(next public offer)` moves to the wallet at each payday | Two-wallet finance UI was a chore; donate → fame was an exploit against v8's fame 900 bar |
| AD8 | **No new need.** 건강 is clinic coverage (roadmap rule); the 튼튼 score only adds bonuses and never drops below its base | Removes the weekly on/off flicker and the "tired elder" default |
| AD9 | Neighbourhood shops get buyers from a **main-thread household-basket model**, not story errands; story walkers are visuals only when F13 runs | The story engine may wait on low-end phones (`engineering_roadmap.md:214`) and runs its own shop economy (`econ.js:69-140`) |
| AD10 | Civic and care art on **two pages**: `village_civic` (clinic + school ≈ 2.45 MiB, v5.0) and `village_care` (≤ 3.62 MiB, v5.2), or care tint-shares the v5.0 apartment frames (≈ +0.6) | 1536 × 960 cannot hold the three large frames; one page makes a clinic-only village pay for everything (`crit/pack2.py`) |
| AD11 | New version **v5.2 「돌봄 마을」** right after v5.1; vehicles and safety shift one slot; v5.2 cards gate on real users | Care users exist only from v5.1; pacing spreads to bot ≈ 130–180 |

## 1. Ground truth that shapes the design (anchors at HEAD)

**Wallet and creation sites outside tills**
- `Economy` (`src/systems/Economy.js:3-25`): `add(n, wx, wy, fly)` and `spend(n)`, no tag, no spent total; `earned` is session-only. In admin 「코인 무제한」 `spend` returns `n` but coins do not fall (`:21`). Admin grants write `E.coins` directly (`src/systems/Admin.js:128-134`).
- Untagged debug adds: the keyboard `M` cheat (`src/scenes/Game.js:354`, behind `__FV_DEBUG`) and the test hook `give()` (`Game.js:2538`).
- Dog gift goes straight to the wallet (`DogPlay.js:541`). Refunds: `Progression.js:304, 404, 467, 543`.
- One-time migration credit: `settleShopOver` → `market.cash.addQuiet` (`Game.js:2447-2460`).

**Tills, sacks and other holders**
- Tills are listed by `villageTills()` (`src/systems/V42.js:18-31`), exposed as `gs.tills`.
- 딸랑이's round: `Office.takeTill` empties a till into his sack and bumps `Office.income` (`src/systems/office/Office.js:335-341`); `Staff.js:579` adds to `this.bag`; `:592-595` deposits later. Coins in a sack are in no till and not in the wallet.
- `Growth.payTill` credits `savedCash` when the station till does not exist yet (`Growth.js:386-389`), restored at `:138`.
- 금방 writes `b.till.value += n` directly and also writes `O.income` (`src/geumbang/ports_v4.js:383-386`); its upgrade spend is at `:406`.
- Step B's D10 (`docs/redesign_v43/engineering_plan.md:301`): the train carries station cash into the hall tax box, a till-to-till move.

**통장 bars (`Office.income`)**: fed only by 딸랑이's collections (`Office.js:340`); depot coins counted twice (`DepotSystem.js:94` + `Office.js:340`); export bar is a session total (`OfficePanel.js:262`); the station bar reads 0 after 읍 (`Office.js:326-330`).

**Expense sites**: `UnlockPad.js:253` (pad drain), `Game.js:1503` (build menu), `Office.js:150` (office hires), `Office.js:397` (letters), missions `src/missions/host.js:229` and `src/missions/view/CraftPads.js:137`, 금방 upgrade `ports_v4.js:406`, F4 `payRemote` (v4.4). Nothing recurs today: no wages, no upkeep.

**Clock**: `DayClock.dayLen()` 600 s, `day() = floor(T / dayLen)` (`DayClock.js:34, 40`), so the day turns at midnight; the clock starts at the first train (`Neighbours.js:446-452`). No week exists. With E10's dawns near bot 49 and 59, the clock starts near bot 39.8; day 7 at 08:00 is near bot **110**; week 1 (day 0 from 08:00) holds only 6 paydays.

**Residents arriving and leaving**: settlers emit `'settlers'` before the instant check (`Civic.js:227`); named move-ins have no event (`VillageLife.js:227-251, 273-285`). Departures: none in v4. The story engine's move-out (`src/story/engine/src/life.js:492`) has an unhappiness branch (`hh.unhappy >= 10 && rng.chance(0.12)`) and a random `moveOutRate` branch (0.0015, `story/tuning.js:27`); **both** pick 'job'/'lonely' when `hh.unhappy >= 5`.

**News sources**: `'region'` also fires on load with `instant = true` (`Territory.js:300, 323`); `'v4:shopOpen'` at `Shop.js:291`; letters inbox keeps 6 rows (`Save.js:286`).

**Nobody shops from home**: plaza guests spawn off screen (`Seller.js:396-415`), store guests on a far road node (`:397-401`), visitors at the platform (`Neighbours.js:503-519`), TownSim errands buy nothing (`TownSim.js:358-509`). Story people buy food at a random open shop when `hunger > 55` (`plans.js:162-165`) inside the story's own economy: own stock and till (`econ.js:69-90`), restock/settlement (`:106-140`), hunger +26 a night (`:185`). The story host's `'sold'` bridge only feeds a report counter (`story/host.js:722-728`), so story purchases create no game coins.

**Store singleton**: `UNIQUE_BUILDINGS` (`Progression.js:188`), `CATALOG.store.unique` (`Civic.js:40`), one `v.store` restore (`Game.js:1029-1033`). `gs.market` has 75 references, `gs.store` 38 in 9 files. `StockLedger.LINES` maps one line to one shelf (`StockLedger.js:13`). Shelf priorities: SHELF 40, SHELF_LOW 45, SHELF_EMPTY 48, FOUNDING 38 (`Logistics.js:18-26`).

**Care building blocks**: story `JOBS` has doctor 48, nurse 34, teacher 36 and **already a `cook`** (restaurant, 34) (`places.js:66-80`); aging kid 1.5 game days/year, adult 4 (`tuning.js:9`); `babyRate` 0.012/couple/day (`:18`); elders visit the clinic at 7 % (`plans.js:172-175`); `ageGroupOf` (`people.js:30`).

**Gentleness rule**: 「no illness, hospital or death words」 (`docs/v5_v8_plan.md:512`), applied loosely: 「병원 가는 중」 ships (`strings.js:227`).

**Texture**: full-v4 peak 452.7–452.9 of 455 MiB GL; TX → ≤ 445 (v4.3); the v3 atlas split ≈ −40 before F2 (v4.4). Office panel text uses `resolution: 2` per label (`OfficePanel.js:22`), so each label is its own texture.

**Plots**: step B reserves `d_school` (-930, 640) and `d_clinic` (-1160, 870) as **M** (`engineering_plan.md:329`); footprints need XL (480 × 240) and L (308 × 154). Branch sites before v6: 남쪽 `s_m1`/`s_l1`, 동남쪽 `se_m1`/`se_l1`, 서쪽 `w_civic`/`ws_x*` (`scout_city.md:27, 127-137`).

## 2. F15 MoneyBook (v4.5)

**Files:** new `src/systems/money/MoneyBook.js` and `src/systems/money/sources.js` (ordered registry; the order is the save layout). Build on F8's branch right after F8: both edit `Economy.js` and `CashPad`, and F12a touches the same payday path.

### 2.1 API
- `gs.money.inc(src, n)`: value created (counts).
- `gs.money.exp(cat, n)`: value leaves the system (counts; `n < 0` for a refund).
- Balances call these; nothing else counts.
- **Economy** (owned by F8): `add(n, wx, wy, fly, tag)` and `spend(n, cat)`. `tag` is either a creation source (`gift`, `att`, `away`, `req`, `quest`, `tax` when payday pays the wallet, `admin`, `debug`) → `inc`, or a transfer tag (`collect`, `deposit`, `fund_over`, `refund`) → no `inc`. `refund` instead calls `exp(cat, −n)` with the pad's category. An untagged `add` fails a dev assert in tests (catches `Game.js:354` and `:2538`, which get `debug`). `spend` records only coins that actually leave; with `unlimited` on it records nothing.
- **CashPad**: `add(n, x, y, src)` and `addQuiet(n, src)` call `inc(src || this.src, n)`; each till has a default `src` (market `mkt`, store `store`, restaurant `rest`, hall `tax`, depot `depot`, branch `br`; the station till has none and callers pass one). New `moveFrom(other, n)` for till-to-till moves (D10) counts nothing. `takeAll` (collection) counts nothing.
- **Fund** (v5.0): `fund.add(n, src)` → `inc`; `fund.pay(n, cat)` → `exp('f:' + cat, n)`; `fund.toWallet(n)` → transfer.

### 2.2 Hooks

| Source key | Where | Change |
|---|---|---|
| `mkt` | plaza sale `Seller.js:1657-1658` | till default |
| `mat` | 자재 창구 merchant `Seller.js:1099-1100` | pass `'mat'` |
| `trade` | old TradePost `Seller.js:868-869` | pass `'trade'` |
| `store` | 잡화점 `Seller.js:544-545` | till default |
| `rest` | 큰 식당 `BigRestaurant.js:921-923` | till default |
| `whl` / `bonus` / `rent` / `exp` | `Growth.payTill(n, fx, fy, src)` (`Growth.js:386`; callers `:383`, `:398`, `:656`; `Freight.js:190`) | new `src` arg; the `savedCash` branch also calls `inc(src, n)` |
| `tax` | `TownHall.js:93-99` accrual; F12a payday (hall till → till default; wallet-direct → tag `tax`); D10 station-cash transfer → `moveFrom` | one payday record `[n, people, mult×100]` |
| `depot` | `DepotSystem.js:89-92` | till default; delete the `O.income.depot` write at `:94` |
| `gb` (v4.6) | 금방 `ports_v4.js:383-386` | `b.till.addQuiet(n, 'gb')` instead of `value +=`; fallback `economy.add(n, …, 'gb')`; delete the `O.income` write |
| `gift` | `DogPlay.js:541` | tag |
| `att` / `away` / `req` / `quest` | v4.5 attendance, away credit, request and quest rewards | tags (F8 ports always pass one) |
| `mig` | `settleShopOver` `Game.js:2459` | excluded; the day baseline is taken after it |
| `admin` / `debug` | `Admin.js:128-134` (route through `add(…, 'admin')`), `Game.js:354, 2538` | counted, hidden in panel and report (E23) |

| Expense category | Where |
|---|---|
| `hire`, `build`, `up`, `rank` | pad drain `UnlockPad.js:253` and F4 `payRemote`; `catOf(pad)` from `pad.kind` plus a step-id table (`Progression.js:432`; 승격식 → `rank`; shop stages, upgrades, `LineUpgrades.js:260` → `up`; zones, towers, boats → `build`; hires → `hire`) |
| `hire` | office hires `Office.js:150` |
| `build` / `deco` | build menu `Game.js:1503` (`deco_` prefix → `deco`) |
| `letter` | `Office.js:397` |
| `quest` / `craft` | missions `host.js:229`; `CraftPads.js:137` |
| `gb_up` (v4.6) | `ports_v4.js:406` |
| refunds | `Progression.js:304, 404, 467, 543` → `exp(cat, −n)` in the pad's category |
| `f:upkeep`, `f:wage`, `f:build` (v5.0) | fund pays |
| v5.3 bank | deposits/withdrawals and loans are transfers; Δbank and −Δloan join the invariant |

### 2.3 Invariant
Per game day, integers, admin on or off:

`Δwallet + Δfund + ΔΣtills + ΔΣsacks + ΔsavedCash (+ Δbank − Δloan from v5.3) == Σ inc − Σ exp`

- Σsacks = Σ `bag` over couriers; Σtills = Σ `gs.tills()`, which from v5.2 includes branches.
- The baseline is taken after the one-time `settleShopOver`.
- Gate cases: a depot sale + its collection = one record; an export once; D10 station cash counted once (as its original source, never again as `tax`); a sack in transit across midnight; a 금방 order; a refund; admin grant visible as `admin`.
- **IncomeMeter:** F8's meter reads MoneyBook's running created total (agreement by construction). D29's formula is kept once as a cross-check, now with `+ ΔΣsacks + ΔsavedCash`, within 1 % over 30 min.

### 2.4 Data (positional; `sources.js` order)
```
x.money = [
  today: [day, i[20], e[10], pay[n, ppl, m100], arr[named, settlers, town], ev[16]],
  ring:  [[day, inc, exp, tax, rent, arr, dep, walletEnd, holdersEnd] × ≤ 7],
  week:  [k, d0, wallet0, ppl0, i[20], e[10], pay[sum, n], arr[3], ev[16], holders0]
]
```
- `holders` = Σtills + Σsacks + savedCash (needed so the report's start/end lines add up).
- Estimate ≈ 740 B at late-v4.6 magnitudes (`crit/size2.py`); cap **896 B**; the ring trims oldest first.
- **No seeding** from `v42.office.inc` (it holds courier collections incl. the depot double count). The first v4.5 day starts empty: 「오늘 기록은 지금부터」. The `inc` keep-rule stays for old saves; nothing writes it.

### 2.5 Roll-over, arrivals, news
- `DayClock` emits `'clock:day'` when `day()` increments. MoneyBook closes `today` into `ring` and `week`. Before `clock.on` the day is 0.
- Arrivals: `ppl0` at week start; `'settlers'` n (skip when its new `instant` argument is true); one `'life:moveIn'` emit in VillageLife's move-in path. Neighbour-town newcomers (`TownSim.js:256-306`) count as `town`, hidden.
- Departures: 0 until v5.1 (story fact `move_out`); the line is hidden until the first real one.
- News tally `ev[16]`: `'built'` (`Site.js:407`), `'v4:shopOpen'` (`Shop.js:291`), `'v4:houseDone'` (`Growth.js:537`), `'v4:cardDone'` (`:406`), `'v4:rankUp'` (`Rank.js:121`), `'crewArrived'` (`WarehouseCrew.js:161`), `'settlers'` (non-instant), `'restMeal'`, `'boatHome'` (`Boathouse.js:234`), dog gifts, `'office:letter'` (`Office.js:312`), `'region'` (only when the second arg is `false`), `BigRestaurant.lost` (`:933`) and shelf-empty episodes from `StockLedger` at close, a `'life:happening'` emit with its kind (`VillageLife.js:850-946`), v4.6 far-home 금방 deliveries.

### 2.6 Fixing the existing counters (v4.5)
- The office 통장 tab keeps its place in v4.5 but its bars read MoneyBook's `today` grouped by source (fixes the double count, the session export bar and the station 0). `Office.income` is no longer written (`Office.js:340`, `DepotSystem.js:94`, `ports_v4.js:385-386`). v4.6 turns the tab into 돈 (§3).
- `office.log` passbook rows (`Save.js:281`) stay as 딸랑이's deposit record.

### 2.7 Perf, effort
- Event-driven; a day close is O(sources) < 0.1 ms; target ≤ 0.01 ms/tick mean on the low preset.
- **Effort 2.25:** API + tags at ≈ 20 sites 1.25; invariant holders (sacks, savedCash, `moveFrom`, refunds) 0.5; roll-over/events/positional save 0.5.

## 3. F16 coin door, card (v4.5) and full view (v4.6)

**Door (v4.5)**
- `coinBar.setInteractive()` (`UI.js:48-53`); opens on `pointerup` after a tap (< 12 px, < 350 ms); a drag that starts on the coin does nothing; no joystick start and no `onHuman`.
- Open state = `UI.panelOpen` (already in the guards at `UI.js:142, 171, 187, 196, 345, 385`); no new flag.
- Disabled during the onboarding overlay, ceremonies and while another panel is open. The hit area follows the bar's live width (`UI.js:1198-1208`) and must not overlap the population chip or the admin chip (`AdminPanel.js:371, 386`) at 360 × 640 / 412 × 915 after the v4.3 HUD relayout.

**Card (v4.5, `src/scenes/MoneyPanel.js`, works before the office exists)**
- Rank < 2: wallet; today in/out (top 3 sources with icons + 그 밖에); 가게 금고에서 기다리는 돈 (Σtills + Σsacks); [가까운 금고로 걸어가기] (Navigator to the fullest till, the autopilot's pick `pilot/work.js:93-101`). Before `clock.on` it says 「지금까지」.
- Rank ≥ 2: tabs [오늘] [이번 주] (week accumulator; top 5 sources).
- Deliberate pre-읍 addition (read-only, no purchase); added to principle 1's list; re-runs `onboarding.mjs`, G1, 읍 ±5 % (already in v4.5's gates).
- **Effort 1.5** (door 0.5, card + tabs 1.0).

**Full view (v4.6)**
- Opened by the door from rank ≥ 2; tabs [오늘] [이번 주] [보고서].
- Static flow circle with numbers on each node: 손님·주민 → 가게 금고 n (waiting) → 딸랑이 → 지갑 → 짓기·키우기·고용 → 손님·주민 늘어요 (return arrow); 주민 → 세금 날 (next payday estimate from F12a × happiness multiplier) → 지갑; from v5.0 a 곳간 node.
- Per-source and per-category bars; a badge on a source bar when that source's building was built or upgraded this week (from the `'built'`/upgrade tally); 7-day bars from `ring`; `perMin()` only as small text; units per day / per week.
- Row tips from a rule table, each with one action (`rest.lost > 0` → table tip with the F4 buy card; empty shelf → [알바 보내기]).
- Office: TABS `['bank','tab_bank','bank']` (`OfficePanel.js:24`) → `['money','tab_money',null]` rendering the same view; the passbook rows become a section under it (E17).
- **Text pooling:** ≤ 24 reusable Text objects (`setText`), `resolution: 2` kept; gate: GL transient ≤ +3 MiB while open (60–80 unpooled labels would be ≈ 4–9 MiB).
- Low end: no tweens, no particles; icons from existing UI atlases.
- **Effort 1.5.**

## 4. F17 weekly report (v4.6; cut → v4.6.1)

**Cadence**
- Week `k` = game days `7(k−1)` … `7k−1`; the record closes at midnight; delivery at **08:00 on day 7k** (after the 06:00 payday and the 07:00 paper from v5.1).
- Week 1 has 6 paydays and is labelled 「첫 주」. A save that first meets the report after an update gets 「첫 보고서예요」 instead of week-over-week deltas.

**Taste report (once)**
- At 08:00 on the first day that is ≥ 1 game day after 셈이 is present, ≥ 3 min after the **last finished 읍장 lesson** (lesson 6 ≈ bot 65), and not a scene day (`청혼` or any ceremony). Expected near bot 70 (else 80). Flag in `x.wk`.

**Layout (one screen)**
- 셈이 portrait + title; three big numbers (번 돈 = Σ inc excl. admin/debug/mig, 쓴 돈 = Σ exp, 새 이웃 = arrivals) with ▲▼ vs last week.
- 「이번 주 잘한 일」: ≤ 3 rows from a ranked praise table (new source opened, payday growth, goal done, …), at most one praise-only row.
- 「다음 주에 해 볼까요?」: 1–3 rows from a tip rule table; each row = problem + expected gain + one button ([여기서 짓기] F4 buy card, [알바 보내기] F6, [게시판 보기], [자리 보기] coverage layer). A rule without an action is not eligible.
- v4.6 weekly goal: 3 candidate goals; picking one sets next week's goal (replaces the separate picker).
- [숫자 자세히] opens the full view's 「이번 주」 tab; [지난 보고서] lists ≤ 4.
- Empty sections hidden (departures until the first v5.1 move-out; incidents unless v5.4 and the switch on).

**Record (positional; headlines and tips are not stored)**
```
[k, d0, wallet0, wallet1, ppl0, ppl1, holders1, i[20], e[10], pay[sum, n], arr[named, settlers], dep, ev[16]]
```
- Headlines and tips are regenerated from the numbers with seed `k`. ≈ 240 B per record; 4 kept → ≈ 960 B; `x.wk` cap **1,024 B** (oldest trimmed). If v4.6's whole-save gate fails, the archive drops to 2 or moves to a side key (E24).

**Delivery**
- Needs 셈이 (`office.staff.sem`); without him the latest record waits.
- Banner 「셈이가 이번 주 보고서를 가져왔어요 [보기]」, never auto-opened.
- Letter row tpl `wk_report` in the VillageNews inbox (6 rows, `Save.js:286`): the new row **replaces** the previous `wk_report` row; bypasses `once`; numbers live in `x.wk`.

**Copy:** weighted templates `[key, a1, a2]` as `VillageNews.js:72-99`; ko/en in 셈이's voice. Tax share = (tax + rent) / 번 돈 (one definition; the v4.5 ≥ 12 % and v5.0 ≥ 20 % gates read the same MoneyBook total).

**Later sections:** v4.6 sources `gb`, `eom`, `feast`, far-home deliveries; v5.0 곳간 line + table; v5.1 `move_in`/`move_out`, births, weddings, first school days; v5.2 care and shops; v5.4 incidents from `inc:end` (`src/city/incidents/model/director.js:186`) only with the switch on.

**Other:** P1 logs report shown/opened and seconds to open in the existing alert counters. **Effort 2.5** (layout + rule tables 1.25, news tally 0.5, ko/en copy 0.5, inbox/taste/first-report rules 0.25).

## 5. F18 마을 곳간 (v5.0)

**Opening:** at the rank-3 ceremony (P17) as part of its gift, after the 24,000 시청 is paid **from the wallet** (the fund does not exist before the ceremony; question 27 C is the alternative). Until rank 3, taxes keep going to the wallet.

**State:** `x.fund = [bal, inTot, outTot, shortDays, overTot, flags]`, ≤ 96 B.

**In:** the F12a payday → `fund.add(n, 'tax')`; rent (`Growth.js:645-657`) → `fund.add(n, 'rent')` at accrual instead of the station till (the till keeps its other sources and its 15 s self-empty).

**Out (daily at 06:00, after payday):** `due = Σ upkeep[kind][level] + Σ wages of staffed seats`. Wages come from **one table**: the story `JOBS` wages (§8), so 돌봄 선생님 cost 34/day everywhere. Pays `min(bal, due)`; a short day → `shortDays++`, facilities show 「아껴 쓰는 중」, their need bonus × 0.8 until a fully paid day, and a 셈이 tip is always attached (population, rate). Never negative; no closure, no debt.

**Overflow:** after upkeep, `hold = 7 × due + price(next public offer)` (the top public card, else 0). If `bal > hold`, `fund.toWallet(bal − hold)` (transfer) and a report line. When `bal ≥ price(next public offer)`, 셈이 says so.

**Public builds:** catalog flag `public` on clinic, school and care kinds (not 시청, not apartments, E22). F4's buy card shows one split price 「곳간 a + 지갑 b」 (fund first, wallet remainder, automatic). The `UnlockPad` drain loop (`UnlockPad.js:245-256`) takes the source pair.

**Guarantee (balance gate):** for every facility kind and level, upkeep < Σ tax of the households it covers at the bot-150 median coverage. Target: total upkeep ≈ 20–35 % of tax + rent at bot 150.

**Accounting:** invariant gains Δfund (§2.3); panel 곳간 node; report line and table.

**Job slots:** clinic doctor + nurse, school three teachers; filled from households; shown on the resident window's 직장 / 월급 rows.

**Prototype:** fund line (tax → 곳간 → one upkeep row) + survey item 「세금이 어디로 가는지 알았나요」, +1 d.

**Effort:** F18 1.5, upkeep 0.5, job slots 0.75, balance 0.5, tests 0.5.

## 6. F19 튼튼 수첩 (v1 v5.0, v2 v5.2)

- **Need:** F9's 건강 is met by clinic coverage, as the roadmap says. The score never decides the need.
- **Score (internal, derived, not stored):** `75 + check 5 + food 5` in v1; v2 adds `visit 3` (elders, 2 game days after a 돌봄 선생님 visit), `체조 2` (days the 쉼터 holds 체조), `hospital 3` (elders covered by 돌봄 병원). Same base for elders. Range 75–93; it never goes below its base, so no tired state exists.
- **Check-up:** game day `day % 7 == 6` (the week's last day), 09:00–11:00; the effect is flat for the whole next 7 game days (no decay, no weekly flicker). A household counts as checked if it is in clinic coverage at the check-up (derived; no `ck` field). ≤ 6 visible walkers near the clinic (generic townsfolk in v5.0; story residents with a boosted `A_CLINIC` from v5.1, `plans.js:172-175`).
- **Display:** stickers on the resident card: < 85 튼튼, 85–89 아주 튼튼, ≥ 90 반짝반짝 튼튼; the number appears only as the village mean in the report.
- **Effects:** ≥ 85 adds +2 happiness (bonus only); village mean ≥ 85 → settlers +5 %. No payday effect beyond the happiness multiplier.
- **No negative bubble.** Elders show the positive wish 「쉼터에 놀러 가고 싶어요」 once a 쉼터 is buildable.
- **Farewell scheduling (v5.1 sub-gate, hidden):** no farewell within 3 game days of that resident's clinic or 돌봄 병원 visit. The picker never reads health. Nothing on screen says this.
- **v2 (v5.2):** visits (`vs` in the story side store), 체조 at 08:30 on the plaza, the 7-day village-mean ring in `x.care`, the 건강 주간 card (fund 300, everyone +1 sticker band for 7 days, ≤ once per 4 game weeks).
- **Effort:** v1 1.0, v2 1.0 (the draft's rest stays and `A_REST` are dropped: with a base-75 floor they could never fire).

## 7. F20 동네 가게 (v5.2)

**Entity**
- `BranchShop` on `Market` (the 잡화점 proves a plot-built `Market`: `Game.makeStore` `Game.js:1247-1271`, `storeLine` `:1280`, own till, clerk pad, sink). One kind `br`, two levels: L1 food (fish / meat / bread on one mixed line), L2 + `STORE_GOODS`.
- Not in `UNIQUE_BUILDINGS`; `gs.branches[]`; till `src` `br`.
- Plots: generic M plots through step B's data-driven `types` allowlist (`engineering_plan.md:333-337`), `br` added in v5.2.
- Art: `shop_general` + sign variant (on `bld_buildings`, village-resident today, `Residency.js:35`); L2 adds shelf props. Re-check residency after the v3 split; fallback L1 art `market_s1` (≤ 0.5 MiB) (E27).

**Offer (1 Hz)**
- Homes are v9 household homes. `far` = homes with no open shop selling food within `nearM` = 45 m (2,880 world px in `hypot(dx, 2·dy) / 64`; never shown in game, only circles and 「걸어서 멀어요」).
- When `far ≥ 3`: a card lists up to 3 free allowed plots ranked by far homes covered, each with 「닿는 집 n채」; the player picks.
- Cap `min(5, 2 + floor(max(0, people − 100) / 40))`; the current map has 2–3 sites (남쪽, 동남쪽, 서쪽).
- Price includes the shop's own porter seat (no separate 600 hire).

**Demand: household basket (main thread)**
- Once per game hour (25 s), for each household whose home is within `nearM` of an open branch: accrue `tripRate / 24` trips (target `tripRate` = 1 extra trip per game day). A trip buys 1 item from the basket (L1 food; L2 food or goods) from the nearest stocked branch; if out of stock, no sale and nothing lost.
- This is **added** demand (the "하루 2번 vs 1번" framing: the baseline trip is the existing plaza flow). Plaza and train demand are untouched; `Neighbours.planFor` gets no branch targets.
- Sales: `CashPad.add(v, x, y, 'br')`.
- **Supply cap:** total branch draw ≤ 15 % of goods-line output at bot 150 (gate); `tripRate` is the tuning knob (story-scale hunger would be 0.6–1 item per resident per day, ≈ the plaza's whole throughput at 300 residents, so the basket is deliberately smaller).
- Cost: O(households) per game hour, ≈ 100–150 households, < 0.05 ms averaged.
- **Visuals:** when F13 runs, ≤ 3 story errand walkers near the camera are re-targeted to the nearest branch as visuals only (story stock/till untouched); without F13, a basket pulse on the shop. Low preset 1 walker.
- Positive wish bubble 「가까운 가게가 있으면 좋겠어요」 for a household beyond reach of any shop: chance 0.15/day, cooldown 1 game day per household, inside the ≤ 2 bubble budget.
- 먹거리 bonus: +10 when a branch with the resident's favourite is within `nearM`; bonus only, ramp 1 game day.

**Restock**
- Branch shelves are `Logistics` sinks at BR_SHELF 36 / BR_LOW 41 / BR_EMPTY 44, strictly below the same state at the plaza (40 / 45 / 48): a plaza shelf that is low or empty always outranks any branch.
- The built-in porter fetches from the nearest of 창고 / 자재창고 through the L1a HaulBoard pool (12-item loads ≈ 15 items/min over ≈ 50 m; warehouse supply, not porters, is the limit).
- `StockLedger.LINES` (`:13`) becomes line → shelves[]: status sums over shelves; the wall board, letter rules and census tests get a row per shelf (E18).

**Registration**
- `villageTills()` includes branches (딸랑이's round, the autopilot, the invariant).
- Audit the 9 files that use `gs.store` (38 refs) for singleton assumptions; `gs.market` (75 refs) keeps meaning the plaza.
- MoneyBook source `br`; report shops section; coverage overlay shop layer (one layer at a time).

**Save:** top-level `shops = {v: 1, b: [[id, level, plotId, stock[], cash, seat]]}`, ≤ 512 B, v9 keep-rule.

**Effort (10.5)**

| Part | d |
|---|---|
| entity, two levels, plot kind, candidate-plot card, offer rule | 2.25 |
| basket demand, supply cap, visuals hook | 2.5 |
| restock (built-in porter, priorities) + multi-shelf ledger | 2.0 |
| registration (`gs.store` audit, tills, money) | 0.75 |
| wish bubble + 먹거리 bonus | 0.5 |
| coverage layer | 0.5 |
| level 2 goods | 0.5 |
| slice | 0.25 |
| tests | 1.25 |

## 8. F21 care (v5.2)

**Buildings**
- `care_kids`: one building. L1 어린이집 (S/M plot) for ages 0–3; L2 adds the playground and the 「눈꽃 유치원」 sign and serves 4–6. L2 unlocks when L1 is ≥ 75 % used for 3 game days.
- `care_elder`: L1 햇살 쉼터 (L plot): day program 09–15 for 65+, base for 돌봄 선생님. L2 실버타워 (XL or `w_civic`): elder households may move in; a freed home draws a settler household. **Cut line.**
- `clinic` L2 돌봄 병원: elder coverage radius × 1.5, check-up capacity × 2, the `hospital 3` score term; annex with benches (visual). No rest stays. **Cut line.**

**Users and acts (story registry, `ageGroupOf`)**
- `A_CARE` (toddler at 어린이집 when covered, 08–16), `A_DAYCARE_ELDER` (09–15), `A_VISIT` (a 돌봄 선생님 walks from the 쉼터 to ≤ 6 elder homes a day, 20 game min each).
- **Child counts are small:** with kid aging 1.5 days/year and `babyRate` 0.012, steady state is roughly 3–4 under-4s and 2–3 aged 4–6 village-wide (estimate). Measure in the story lab at target pop 150 before the v5.2 plan review (E25); this is why kids get one building with two looks.
- New elders come almost only from arriving households (adults age 1 year per 4 days), so 쉼터 demand depends on the arrival roster's age mix (E25).

**Card gating:** 어린이집 card after the first birth fact; 쉼터 card when elders ≥ 6 (tuned); L2s by usage; the 돌봄 선생님 card computes `ceil(elder homes / 6)` and offers [한 분 더]. One coverage layer at a time.

**Jobs** (story `JOBS`, `places.js:66-80`): add `carer` 돌봄 선생님 34, `nursery` 보육 선생님 32, `kinder` 유치원 선생님 34, `elder_aide` 쉼터 선생님 32, `care_cook` 쉼터 요리사 28 (`cook` already exists for the restaurant at 34; do not overwrite it). Upkeep = building base + Σ wages of its seats; one table.

**Needs (AD8):** F9's 배움 counts for ages 0–6 only after the first `care_kids`; 건강 for elders gains the 쉼터 coverage term; ramp-in over 2 game days. Fixture: a v5.1 save loaded in v5.2 → no resident's happiness drops.

**If F13 waits:** care has no users (ages come from F13) and waits too; F20 and the fund do not.

**UI:** resident card rows (attendance, stickers); coverage layer per care kind; seats and levels through F4 remote pay; report and panel care sections.

**Save:** `x.care` ≤ 256 B (seat counts, level cache, next 건강 주간 day, 7-day mean ring); visit days `vs` in the story side store.

**Perf:** schedules in the story worker; near-camera sprites only: ≤ 4 kids in the yard (`life_props`), ≤ 3 elders on benches, ≤ 2 carers; low preset halves. Needs ≤ 0.05 ms/tick at 150 residents.

**Effort (15.5 + 0.25 card gating)**

| Part | d |
|---|---|
| `care_kids` (one building, two looks) | 2.0 |
| `care_elder` L1 쉼터 | 2.0 |
| 실버타워 (cut line) | 1.5 |
| 돌봄 병원 (cut line) | 1.0 |
| 돌봄 선생님 visits + seats + card maths | 2.0 |
| care job slots | 0.5 |
| needs extension + card rows | 1.25 |
| coverage + report / panel | 0.75 |
| art integration and Residency | 1.0 |
| balance + bots | 1.5 |
| tests / gates | 2.0 |

F19 v2 adds 1.0 → v5.2 planned 27.25.

## 9. Texture plan

| Building | Art | Plan | New MiB in the village view |
|---|---|---|---|
| 동네 가게 L1/L2 | `shop_general` (`bld_buildings` 10.7, village-resident) + sign/props | reuse; fallback `market_s1` 0.5 for L1 | 0–0.55 |
| 진료소, 학교 (v5.0) | `clinic` 460 × 464 (`town_civic@rest2`), school still frame 551 × 631 (`town_civic@rest`) | repack into **`village_civic`** ≈ 1016 × 633 | **2.45** (`crit/pack2.py`) |
| 햇살 쉼터, 실버타워, 돌봄 병원 annex, playground, signs (v5.2) | `apartment_b` 547 × 599, `apartment_a` 606 × 648, new annex ≈ 300 × 300, `playground` 242 × 267 | **`village_care`** ≈ 1460 × 650; without 실버타워 ≈ 560 × 936 | **3.62**; **2.0** without 실버타워 |
| alternative | if the v5.0 apartments already carry `apartment_a`/`_b` frames on a resident page | runtime tint + sign overlay on those frames; only annex, playground and signs repacked | **≈ 0.6** |
| 어린이집 | house (`bld_buildings_2`, resident) + `kids_swing` / `snow_fort` / `igloo` (`life_props` 3.30) + `cradle` (`life2_decor` 0.30) | reuse | 0–0.3 |
| care staff | townfolk presets `nurse` / `doctor` / `teacher`, recoloured | reuse | 0 |
| money panel | pooled text (§3) | — | 0 resident; ≤ +3 transient |
| avoid | `veh_ambulance` 7.46; `bbld_shops` 12.8; whole `town_homes` / `town_civic@rest` (≈ +23) | | |

- A single 1536 × 960 page cannot hold the school and both apartment frames; one page would make a clinic-only v5.0 village pay ≈ 6.25 MiB.
- Pages join Residency `village.extra` (`Residency.js:36-41`) only when one of their buildings stands.
- **Explicit village-view budget (steady GL, measured, never assumed):** post-split base (estimate ≈ 405, unmeasured) + v4.4 labour-office page + v4.6 금방 / 어묵 pages when in view + v5.0 `village_civic` 2.45 + v5.0 apartments page (E19) ≤ **415** at v5.0; v5.2 adds `village_care` (or the tint option) + 0–0.55 for shops and must still be ≤ 415 steady, ≤ 455 transient. If the v5.2 measurement fails, ship the tint option or cut 실버타워 (−1.6 MiB). The village region covers the plaza, so re-measure plaza ≤ 340 with the pages resident (E19).

## 10. Saves

| Ver | `SAVE_VERSION` | `lv` | New state from this addendum | Size | How |
|---|---|---|---|---|---|
| v4.3 | 8 | 43 | nothing written; F0 caps accept `x.money` (896 B) and `x.wk` (1,024 B) | — | F0 per-key caps |
| v4.5 | 8 | 45 | `x.money`; `v42.office.inc` no longer written (kept for old saves, not read) | ≈ 0.74 KB | `x` key |
| v4.6 | 8 | 46 | `x.wk` (report archive, taste flag); new source slots | ≈ 0.96 KB | `x` key |
| v5.0 | 9 | 50 | `x.fund` (≤ 96 B); no household fields | ≈ 0.1 KB | `x` key |
| v5.1 | 9 | 51 | move-out facts | story side key | — |
| v5.2 | 9 | **52** | top-level `shops` (≤ 512 B), `x.care` (≤ 256 B), `vs` in the story side store | ≈ 0.6 KB main | slice + v9 keep-rule |
| v5.3 탈것 | 9 | 53 (was 52) | `vehicles`, `bank` | — | unchanged |
| v5.4 안심 | 9 | 54 (was 53) | `incidents` | — | unchanged |

- The `x` container cap sum goes from ≈ 4.35 KB to ≈ **6.3 KB** (+ 896 + 1,024 B).
- Whole save at caps through v4.6: ≈ **22–23 KB** (was 20–21): under the 24 KB fail line with ≈ 1 KB headroom, over the 16 KB warning. If the v4.6 gate fails, `x.wk` keeps 2 records or moves to a side key (E24).
- Money and the report need **no v9**; `x.fund` would fit v8 and ships in v5.0 only because the 시장 stage starts there.
- The v5.0+ budget (E11) gains ≈ +0.9 KB (fund, shops, care); no per-household fields.

## 11. Performance on low-end phones (Android 11 and older)

- MoneyBook: event-driven, ≤ 0.01 ms/tick mean.
- Money card and full view: text and bars only, no tweens; ≤ 1 ms/frame while open on the low preset; pooled text.
- Basket demand: O(households) per game hour on the main thread, < 0.05 ms averaged.
- Care schedules: in the story worker; the main thread applies visits in batches (≤ 4 per tick).
- Visible sprites near the camera: errand walkers ≤ 3, check-up queue ≤ 6, kids ≤ 4, elders ≤ 3, carers ≤ 2; the low preset halves these or sets 1.
- Needs ≤ 0.05 ms/tick with 150 residents. Re-measure the v5.1 story gate (≤ 0.1 ms main thread, 0 long tasks) in v5.2.

## 12. Gates

**v4.3:** `v43_layout` passes with `d_school` XL, `d_clinic` L, hidden `w_civic` (the clinic's west edge sits 59 px inside `WORLD.left`); re-check against the bakery-branch plots.

**v4.5 (F15, F16a)**
- Invariant (§2.3) holds exactly per game day in fresh25, the pacing bots and a 10-day soak, **with admin on and off**.
- Cases: depot sale + collection = 1 record; export once; D10 station cash counted once; sack in transit at midnight; refund as negative expense; admin grant shown as `admin`; untagged `Economy.add` fails the dev assert.
- MoneyBook created vs D29 cross-check (with sacks and savedCash) ≤ 1 % over 30 min.
- Office 통장 bars equal MoneyBook today; no `Office.income` writes remain.
- Reload: `x.money` round-trips byte-identical; an old save with `v42.office.inc` starts today empty.
- Door: tap opens, drag does nothing, no joystick and no `onHuman`, hit area tracks the bar, no overlap at 360 × 640 / 412 × 915, disabled during onboarding and ceremonies.
- Pre-읍 re-runs (`onboarding.mjs`, G1, 읍 ±5 %). Whole-save size with `x` at caps.

**v4.6 (F16b, F17)**
- Week roll-over at days 7 and 14; week 1 labelled 「첫 주」 with 6 paydays; report numbers equal MoneyBook sums; start + 번 돈 − 쓴 돈 = end (wallet + holders).
- Taste report fires once, ≥ 3 min after the last lesson, never on a scene day; first report after update says 「첫 보고서예요」.
- Every tip row has an action; ≤ 3 wins; empty sections hidden.
- Inbox holds one `wk_report` row; archive ≤ 4; delivery only with 셈이; no auto-open.
- 금방 orders recorded once as `gb` (direct till write removed); far-home delivery counter.
- Panel text transient ≤ +3 MiB; G16 income gates unchanged; whole-save size gate with every slice at its cap.

**Prototype:** fund line shows; prototype keys only.

**v5.0**
- Fund invariant; never below 0; a shortage shows 「아껴 쓰는 중」 + a tip, no closure; overflow moves `bal − hold` at payday.
- 24,000 시청 from the wallet within ≤ 3 bot min after full bars (unchanged roadmap gate).
- Per-facility upkeep < covered tax at bot 150; total upkeep 20–35 % of tax + rent.
- tax + rent ≥ 20 % measured from MoneyBook; the weekly check-up fires; scores never below base.
- No-drop fixture: full v4.6 bars → v5.0 → the fund opens at the ceremony; nothing drops.

**v5.1:** zero departures with reason 'job'/'lonely' in a 30-day run (both branches); report in/out counts equal the story facts; a vacated home refills in a 30-day run; farewell never within 3 days of a clinic visit.

**v5.2**
- Shops: offer at 3 far homes with ≤ 3 ranked plots; nearest-shop grid unit test; branch draw ≤ 15 % of line output at bot 150; income Δ +2–6 points; plaza SHELF_EMPTY time ≤ baseline + 10 %; logistics G2 unchanged; ≤ 2 bubbles; shops still work with F13 off.
- Care: users come from ages; no-drop fixture v5.1 → v5.2; a fund shortfall never closes a facility; cards appear only after their first user.
- Perf and soak: needs ≤ 0.05 ms/tick at 150; story gate re-measured; texture budget §9; 30-day manage-mode soak.
- Re-run the content-rating questionnaire over the care wording.

**v5.4:** report incidents only with the switch on; zero in a 30-day run with it off.

## 13. Effort and totals

| Version | Before | Planned before | Added (planned) | Planned after | After |
|---|---|---|---|---|---|
| v4.3 | 19–22 | 17.75 | plot table, absorbed | 17.75 | 19–22 |
| v4.4 | 42–49 | 38.75 | — | 38.75 | 42–49 |
| v4.5 | 34–40 | 31.75 | F15 2.25, F16a 1.5, tests 0.75 = 4.5 | 36.25 | **39–46** |
| v4.6 | 33–38 | 30.25 | F16b 1.5, F17 2.5, report lines + far-home + goal pick 0.75, tests 0.5 = 5.25 | 35.5 | **38–45** |
| prototype | 10–13 | — | fund line 1.0 | — | **11–14** |
| v5.0 | 34–40 | ≈ 31.75 | F18 1.5, upkeep 0.5, job slots 0.75, F19 v1 1.0, balance 0.5, tests 0.5 = 4.75 | ≈ 36.5 | **39–46** |
| v5.1 | 20–28 | — | report + warm move-out 1.0 | — | **21–29** |
| **v5.2 돌봄 마을** | — | — | F20 10.5, F21 15.5, card gating 0.25, F19 v2 1.0 = 27.25 | 27.25 | **29–34** (±40 %) |
| v5.3 탈것 (was v5.2) | 18–24 | — | — | — | 18–24 |
| v5.4 안심 (was v5.3) | 14–18 | — | report section 0.25 (inside the range) | — | 14–18 |

**Alternatives priced for the designer:** question 26 B (everything in v4.5): v4.5 planned 40.75 → **44–51**. Question 29 B (shops in v5.1): v5.1 **31–41**.

**Cut lines**
- v4.5: the card's [이번 주] tab → v4.6 (−0.5).
- v4.6: F17 weekly report → v4.6.1 (−3 to −3.5), on top of the existing L1b + G1b cut.
- v5.0: F19 v1 check-up event → v5.2 (−1.1 to −1.3).
- v5.2: 실버타워, 돌봄 병원, 건강 주간 → v5.2.1 (−3 to −3.5).

**Calendar:** step A's pace (≈ 11 builder-days in 2–3 calendar days) holds only for parallel work. F15 edits the same hot spots as F8 and F12a, so it runs serially right after F8; v4.5's +5–6 builder-days should be read as ≈ 2–6 calendar days (estimate), plus the pre-읍 re-runs. Review stops and tester windows still dominate.

## 14. Roadmap doc edits
All edits are in `roadmap_patch.md` as exact old → new snippets for `docs/기획서_시장취임_로드맵.md` (K1–K41) and `docs/roadmap_mayor/engineering_roadmap.md` (E1–E58). Apply after the 대표 approves this addendum; each old snippet occurs exactly once in today's file (checked by `crit/check_patch.py`).

## 15. Open engineering questions

- **E14.** First week close: measure with a clock-aware bot (estimate bot ≈ 110; depends on E10's first-train minute and ceremony pauses).
- **E15.** Story move-out: disable the unhappiness branch at `life.js:492` and make both branches pick warm reasons; keep `moveOutRate` 0.0015 or lower it; refill vacated homes.
- **E16.** Count at the till add / balance credit, not at the `'sold'` emit (the till add runs 200 ms later, `Seller.js:1657`).
- **E17.** v4.6 office tab: TABS gating (`OfficePanel.js:24`, requirement `'bank'`) becomes `null`; check that the bank-building flow still shows its passbook.
- **E18.** `StockLedger.LINES` multi-shelf rows for up to 5 branches; re-run G7 with the ledger open on 물건별.
- **E19.** Which page the v5.0 apartments use (decides `village_care` vs the tint option); measure the village-view budget and plaza ≤ 340 with the pages resident.
- **E20.** Step-B plot edit: run `v43_layout` before step-B code; check against `local/v43-bakery`.
- **E21.** v5.0+ save budget (E11): ≈ +0.9 KB from `x.fund`, `shops`, `x.care`.
- **E22.** Public (fund-first) catalog: clinic, school, care kinds; 시청 and apartments wallet-paid. Question 27 C would open the fund at v4.6's 시청 공사 scene and re-tune the 24,000 gate.
- **E23.** Admin and debug adds routed through tagged `add` so the invariant tests run with admin on and the panel can hide them.
- **E24.** Report archive: 4 records in `x.wk` (≈ 960 B); if the v4.6 whole-save gate fails, keep 2 or move to a side key (not carried by 마을 옮기기).
- **E25.** Story-lab run at target pop 150 before the v5.2 plan review: under-4s, 4–6s and elders over 30 days; confirms the one-building kids design and the 쉼터 card threshold.
- **E26.** Basket `tripRate` and the 15 % supply cap tuned with bots (income Δ +2–6, plaza SHELF_EMPTY ≤ +10 %).
- **E27.** Does `shop_general` stay village-resident after the v3 atlas split? If not, L1 uses `market_s1`.
- **E28.** v5.3 bank: deposits, withdrawals and loans as transfers; add Δbank and −Δloan to the invariant.

## 16. Not verified

- The first week near bot 110 and the taste report near bot 70 are derived from `day.length` 600 s and E10, not measured.
- Every coin figure in the Korean doc (incomes, tax shares, upkeep, prices) is illustrative.
- Child and elder counts are estimates from story tuning, not a lab run (E25).
- Efforts are bottom-up estimates with the roadmap's × 1.08–1.26 factor; v5.2 is ±40 %.
- Page sizes come from frame sizes in `assets/town/*.json` packed by `crit/pack2.py`, not from the real packer; the ≈ 405 post-split base is unmeasured.
- Save sizes come from `crit/size.py` and `crit/size2.py` on synthetic records.
- Not checked: `market_s1` residency at the 시장 stage; townfolk preset pages in every village view.
- No code, bot or browser was run for this addendum.

## 17. Critique dispositions

Question numbers changed from the draft: draft 39 → 25 (plot table, now first); 25 → 26 (launch scope); 32 → 27 (fund); 33 → 28 (new version slot); 34 → 29 (shops timing); 37 → 30 (names); the rest became defaults 31–41.

**Fun / scope critique**

| # | Point | Disposition |
|---|---|---|
| 1 | Move the full money view and the report to v4.6 | **Accepted** (AD3, Q26 A). Disagree only on size: v4.5 grows +5–6, not +4, because F15 is 2.25 after the invariant fixes |
| 2 | Report is a spreadsheet; make it one screen with actions | **Accepted** (§4 layout) |
| 3 | Report numbers do not add up; missing v4.5 sources; wrong delta sum; first report | **Accepted**: holders (tills + sacks + savedCash) in the start/end lines; 부탁 보상, 쉬는 동안 번 돈, 출석 rows; deltas sum to +5,200; 「첫 보고서예요」 |
| 4 | 금고 means two things | **Accepted**: 마을 곳간 |
| 5 | Flow is a one-way pipe | **Accepted**: return arrow, node numbers, build badges, per-day/week units, top-3 icons, 「지금까지」 |
| 6 | Two health definitions; elders tired by default | **Accepted**: need = coverage; score bonus-only; base 75 for all; flat weekly check-up; stickers; one name 튼튼 수첩 |
| 7 | Farewell line contradicts itself | **Accepted**: hidden scheduling rule |
| 8 | More shops create no decision | **Accepted**: added-trip bonus; 2–3 candidate plots with 닿는 집; porter in the price; one 동네 가게 kind with two levels; no metres shown; cap wording fixed; 2–3 sites before v6 |
| 9 | Distance concern unanswered until v5.1 | **Accepted**: v4.6 금방 far-home weighting + report line |
| 10 | 곳간 is a finance app; donate → fame exploit | **Accepted**: automatic, overflow rule, no donate/withdraw, per-facility guarantee, tip with every shortage, upkeep flagged as the first recurring cost |
| 11 | Pacing: v5.0–v5.4 crowd bot 110–150 | **Accepted**: v5.2 cards gate on first users (bot ≈ 130–180); one coverage layer at a time |
| 12 | Renumbering touches approved text | **Accepted**: every touched line listed in the Korean doc ⑤ and in `roadmap_patch.md`; decided questions 8, 13, 24 get a note instead of edits |
| 13 | Hide always-0 lines | **Accepted** |
| 14 | Taste report timing; two 셈이 deliveries | **Accepted**: gate on the last lesson + no scene day (bot ≈ 70); names split; offline earnings as a report row |
| 15 | Tone fixes | **Accepted** as listed |
| 16 | v5.2 adds 9 things | **Accepted**: core first, L2s by usage, 실버타워 and 돌봄 병원 as the v5.2.1 cut; card does the carer maths |
| 17 | Document structure | **Accepted**: plot question first; 5 decisions + defaults; engineering detail cut to one line |
| 18 | Plain Korean | **Accepted** |

**Feasibility critique**

| # | Point | Disposition |
|---|---|---|
| 1 | Invariant not exact (sacks, savedCash, D10, 금방, payday/rent direct, debug adds, refunds, baseline) | **Accepted** (§2.1–2.3) |
| 2 | Save caps 2–3 × too small | **Accepted**: positional arrays, no stored headlines/tips; caps 896 B / 1,024 B; no `ck`; `vs` in the side store; `rs` dropped |
| 3 | 24,000 시청 cannot be fund-paid | **Accepted**: wallet-paid; Q27 C offers opening the fund at 시청 공사 |
| 4 | Shops rest on the story worker | **Accepted** (AD9 basket model). **Partly disagree** with pulling shops into v5.0/v5.1 by default: v5.0 is already 39–46 and v5.1 carries the most risk (±40 %), and the pacing critique asks for fewer things early in 시장. Shops now ship independently of F13, so Q29 B (v5.1) stays open |
| 5 | Demand too low; priorities could starve the plaza | **Accepted**: added-trip basket with a 15 % supply cap gate; priorities 36/41/44 |
| 6 | Civic page does not fit; budget path; panel text; `shop_general` after split | **Accepted**: two pages or tint option; explicit measured budget; text pooling gate; E27 |
| 7 | Score never below 70; rest mechanic dead | **Accepted**: `A_REST` and `rs` dropped; 돌봄 병원 = coverage + capacity |
| 8 | Few children | **Accepted**: one kids building with two looks; story-lab measurement (E25). Kept the 유치원 look because the 대표 named it |
| 9 | `cook` collides; two wage tables | **Accepted**: `care_cook`; one table from story `JOBS` |
| 10 | Warm move-outs need both branches | **Accepted** (E15, v5.1 gate) |
| 11 | Report timing, inbox, week 1, accounting day | **Accepted**: 08:00; replace the row; 「첫 주」; midnight day |
| 12 | News tally fixes | **Accepted** |
| 13 | Drop seeding from `v42.office.inc` | **Accepted** |
| 14 | Missing spend sites | **Accepted** (§2.2) |
| 15 | Effort re-estimates and serial build | **Accepted** with the new scope: F15 2.25, F17 2.5, F20 10.5 (11–12 for two kinds, minus the merge), F21 15.5 |
| 16 | Small items | **Accepted**: `UI.panelOpen`; "3 or more" everywhere; first report ≈ bot 110; 75 / 38 references |
