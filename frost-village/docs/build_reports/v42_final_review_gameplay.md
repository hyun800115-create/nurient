# review:gameplay

# v4.2 final review (merged tree): gameplay

**Verdict: four of the five designer complaints are gone when you play with a real finger on a phone-size screen.
The fifth, the 잡화점 line, is fixed in a new game, but it comes back after a reload on one plot (e_m1).
That is the only High finding. Nothing in the economy can be exploited, and both pacing bots finish without getting stuck.**

- **Counts:** Critical 0, High 1, Medium 4, Low 5 (10 numbered findings).
- **Top findings:**
  - **#1 (High):** with the 잡화점 on plot **e_m1**, any reload puts line places 5 and 6 inside the farm fence. Customers 5 and 6 then walk on the spot and never arrive.
  - **#2 (Medium):** the back-yard tables from 테이블 늘리기 stay empty: 1 serving in 8 minutes at level 1, 0 at level 2. The extra meals come from the higher seat count pulling in more customers, not from the new tables.
  - **#3 (Medium):** with cans in the bag, the bag arrow says "통조림 → 잡화점" while the board asks for them at the station. The 정기 납품 chip opens a panel with no 길 안내.
  - **#4 (Medium):** piles still look jammed ("짐들이 밀려"), but the crew is busy (2 % idle). The cause is now demand (nobody buys enough), not carrying. Tell the designer this.
  - **#5 (Medium):** the 잡화점 shelf is still empty 46–69 % of the time. Tool kinds are empty 73–100 % of the time.

## Designer complaints: gone or not

| Complaint | Verdict | Key numbers (this review) |
|---|---|---|
| 큰 식당 busy: slow service, walk-outs, plates waiting | **Gone** | Served per minute: **11.75** at level 0, **15.37** at level 1, **16.12** at level 2. Before the touch it was 3.9, with 2.2 walk-outs a minute. Walk-outs are now 0. Plates on the pass: 0.17 / 0.28 / 0.45 on average. The server reached the seats with 0 timeouts. The 테이블 pad shows up and works; see #2 for the empty back yard. |
| 짐꾼 / piles ("2명정도 이상채용될듯해 짐들이 밀려") | **Carrying fixed; piles still visible (#4)** | The 창고 crew grew 2 → 3 → 4 → 5 at 60 / 120 / 180 s, and the new crew is busy (idle 2 % of samples). The 짐꾼 2 pads appeared (smelter at 61 s, smokehouse at 121 s). A 짐꾼 2 bought with a real finger carried 19 loads. A raw pile was still ≥ 90 % full in 100 % of samples. |
| 잡화점: "판매원있는데 판매를 안해 · 사람들도 거기로 못가는건지" | **Fixed in a new game; back after a reload on e_m1 (#1); shelf still often empty (#5)** | 7.75–11.5 sales a minute on all 5 plots. On 4 plots every customer reaches their place. e_m1 after a load: 2 of 6 never arrive. |
| 선착장: "생선이 그대로야" | **Gone** | Buying the 나룻배 (700) brings the 생선 짐꾼, and no 600 pad appears. Pier pile: 1.2 / 30 on average (max 9), never ≥ 90 % full. On the old 46-min save he joins at load and the 450 part-payment comes back once. |
| 마을회관 board: say where; tap guides there | **Gone** | The row reads "정기 납품: 통조림 23/30 → 서리역 짐 싣는 곳 · 길 안내". A real tap pins the route; I followed it with the joystick in 15.4 s and got the "왔어요" toast. 4 cans were delivered there (need 7 → 3). |

## What was reviewed and how

- **Tree:** `/home/user/nurient/frost-village`, HEAD `ad855e7` plus the uncommitted integration changes.
  - The `src/` diff fingerprint was `8b11cc19…` at the start and is the same at the end, so no source changed while I worked.
  - I only read `src/`. The only file I wrote in the repo is this report. Nothing was committed, and the save version stays 7.
- **Phone:** 390 × 844 CSS px at dpr 2 (720 logical wide). Headless Chromium.
- **Input:** real touch through CDP `Input.dispatchTouchEvent`.
  - The chief is walked with a finger on the floating joystick, kept inside its 42 CSS px radius and slowed on the last stretch.
  - Board rows and pads are pressed with real taps after a moment of real frames.
- **Clock:** the fixed-step test clock (`tools/test/fv_step.mjs`). All rates are per game minute.
- **Saves:** `tools/test/fixtures/v41_save_smart_46min.json` (181 meals served, 8,298 coins) and `v41_save_smart_35min.json` (dock A).
  - For the 잡화점, the same 46-min save was used with the store moved onto each plot (e_m1, e_m2, se_m1, s_l1, plus its own w_m2).
- **What the probes did:** read the game through the `__FV` hooks and wrapped functions in the page only to count (`toast`, `banner`, `economy.spend`). Game logic was never changed, with one exception: for the part-pay test I set `R.served = 450` to bring up the level-2 tables pad (logged).
- **Bots:** `review_gameplay_sim.mjs` smart (58 min) and arrow-only (60 min), on a new game.
- **Machine load:** other reviewers ran beside me, with a load average of 20+ on 4 cores. Wall times are not meaningful; the fixed clock makes game results independent of load.

## Findings

### High

**1. 잡화점 on plot e_m1: after any reload, line places 5 and 6 sit inside the farm fence. Customers 5 and 6 never reach them.**
- **Repro:**
  1. Take the 46-min save and put the 잡화점 on e_m1 (`sites.e_m1 = {b:'store', st:'done'}`, with the toolsmith moved to w_m2).
  2. Load it.
  3. Fill the line to 6 with the shelf held empty and watch for 40 s.
- **Evidence:**
  - `efence.json`, places after load: (1940,1243) (1899,1263) (1859,1284) (1818,1304) **(1777,1284) X (1736,1263) X**. The line is not bent (`cfg.slots` unset).
  - After 40 s, customers 0–3 had arrived. Customers 4 and 5 were still in `arrive` at (1784,1284) and (1717,1252), pushing against the fence.
  - `slotwhy.json`: the obstacles over places 5 and 6 are `fence_post` + `fence_log_y` and `fence_log_x` + `fence_log_y`. That is the farm-zone fence, and the result is the same in all three site orders I tried.
  - Store run (4 game min per plot): e_m1 is the only plot with walk-on-the-spot samples (6; every other plot had 0). It also has the lowest share of the line arrived (0.36 against 0.46–0.54).
  - Screens: `efence/e_m1_line_after_load.jpg`.
- **Proof of cause:** on the same loaded game, I cleared `cfg.slots`, set `maxQueue` to 6 and ran `gs.storeLine(store, cfg)` again.
  - The line now bends: places 5 and 6 move to (1788,1289) and (1804,1270).
  - All 6 customers arrived within 20 s (`efence/e_m1_line_recomputed.jpg`).
- **Cause:** the order of steps in `Game.create`.
  1. `buildFences()` puts the farm fence into `zoneObjs.farm`.
  2. Line 223 disables every zone that is not unlocked yet. On a load every zone still counts as locked here, so the fence obstacles are inactive.
  3. `restoreV3(sv)` rebuilds the sites. The store's `Site` finishes, then `makeStore` runs, then `storeLine` (line 1200) finds no fence there.
  4. Only after that does `restore(sv)` reveal the farm zone and switch the fence obstacles on.
- **Only e_m1 is affected:** I loaded the 46-min save with the 잡화점 on each of the 9 plots it can stand on, then re-ran `storeLine` with every zone on (`reloadplots.json`). The places match the loaded ones on 8 plots. Only e_m1 differs, with 2 places blocked at load and 0 after the re-run.
- **Why the fresh-game check missed it:** in a new game the farm opens long before the east plots, so the integration's fresh-game line audit bent e_m1 correctly. The bend is not saved; `cfg.slots` is recomputed on every load. So a player whose 잡화점 is on e_m1 gets the broken line in every session after the first.
- **Fix idea:**
  - Run `storeLine` again after `restore(sv)`, or in `revealZone()` for a store near that zone. Clear `cfg.slots`, reset `cfg.maxQueue` to 6, and send customers already in line to their new places.
  - Or make `storeLine` count gated-zone fence obstacles as blocked whether they are active or not.
  - Add an e_m1 save-and-reload case to `store42.mjs`.

### Medium

**2. 테이블 늘리기: the new back-yard tables stay empty. The extra meals come from the higher seat count pulling in more customers.**
- **Repro:**
  1. Load the 46-min save and park the chief away. The tables pad is up 13 s after the load (181 meals ≥ 150).
  2. Watch 8 game min at level 0.
  3. Walk onto the pad with a real finger and buy level 1 (1,200). Watch 8 min.
  4. Bring up level 2 (served = 450), buy it (2,000) and watch 8 min.
- **Evidence (`rest_s46*/rest.json`):**

  | Level | Seats | Busy seats (avg) | Seats all full | Served / min | Coins / min | Front deliveries | Back-yard deliveries |
  |---|---|---|---|---|---|---|---|
  | 0 | 8 | 3.08 | 0 % | 11.75 | 261 | 95 | 0 |
  | 1 | 12 | 4.12 | 0 % | 15.37 (+31 %) | 366 | 123 | **1** |
  | 2 | 16 | 4.47 | 0 % | 16.12 (+37 %) | 393 | 130 | **0** |

  - Screens: `rest_s46/lvl1_view.jpg` and `rest_s46b/lvl2_view.jpg` show the new tables empty.
- **Cause:**
  - `BigRestaurant.freeSeat()` returns `this.seats.find((s) => !s.by)`, the first free seat, and the terrace seats come first.
  - The terrace is never full (at most 4–5 of its 8 seats are busy), so no back-yard seat is ever the first free one.
  - The gain is real, but it comes from `seatsPull` (more seats draw more customers), not from the new tables.
- **Player view and cost:**
  - The player pays for tables and sees them stay empty.
  - Level 2 adds +27 coins/min for 2,000, about **74 min to pay back**. Level 1 adds +105/min for 1,200, about 11 min.
  - The level-2 offer can only come from meals (450). `busyT` stays 0 because the seats are never full, so it needs about 18 game min after level 1.
- **Fix idea:**
  - Choose among free seats evenly: round-robin or random, or prefer the newest tables for a while after a purchase.
  - Once the back yard gets used, robust review #1 (lamp post on a back-yard seat) and #2 (server hidden behind the building) become visible. Fix them together.

**3. The cans guide disagrees with the board, and the 정기 납품 chip cannot guide.**
- **Repro (`hall_s46`):**
  1. Follow the board pin to 서리역 짐 싣는 곳 and arrive.
  2. Pick up cans until the bag holds 6.
- **Evidence:**
  - The bag chip says **"통조림 6 → 잡화점 판매대 · 78m"**. Meanwhile the board's only request is "정기 납품: 통조림 23/30 → 서리역 짐 싣는 곳" (`hall_s46.log`, `bagGuideCans`).
  - The HUD chip "23/30 정기 납품" opens the 솔방울 주문판 (`UIv4.openOrders`). That panel shows the items, progress and reward, but has no "길 안내" row or button.
  - So the only way to be guided to the order is to walk to the 마을회관 board first.
- **Fix idea:**
  - When an open order wants the bag's item, have the bag guide point to the order's place first, or show it as the "+1곳" alternative.
  - Add a 길 안내 row to each order card, reusing `TownHall.whereOf('order', k)`.

**4. "짐들이 밀려" is still what the designer will see. The crew now keeps up; the jam is a demand problem.**
- **Evidence (`crew/crew.json`, 46-min save, 12 game min, chief parked):**
  - The crew grew 2 → 5 in 3 min.
  - What the crew was doing: idle **2 %**, taking goods out 12 %, carrying in 74 %, raw 12 %.
  - A raw pile was ≥ 90 % full in **100 %** of samples.
  - Outputs ≥ 80 % full: bakery 54 %, smelter 47 %, smokehouse 40 %, grill 22 %, cannery 15 %.
  - After I bought the smelter 짐꾼 2 (800) with a real finger, he made 19 trips of 1–14 items.
  - Screen: `crew/crew_t4.jpg`.
- **Judgement:**
  - Nobody stands idle next to a full pile, so the carrying complaint is answered.
  - The piles stay tall because nothing buys raw fish, ore and meat fast enough. That is the v4.4 demand work (`docs/logistics_plan.md`), not a porter bug.
- **Fix idea:** no code change for v4.2. Give the designer one line in easy words: "짐꾼은 바빠요. 쌓이는 건 팔 곳이 모자라서예요 (v4.4에서 고쳐요)". Otherwise it will come back as a new porter report.

**5. The 잡화점 sells now, but its shelf is empty most of the time, especially for tools.**
- **Evidence (`store/store.json`, 4 game min per plot):**

  | Plot | Sales / min | Shelf empty | Empty-shelf label shown | Front customer stalled |
  |---|---|---|---|---|
  | w_m2 | 7.75 | 69 % | 50 % | 70 % |
  | e_m1 | 11.5 | 60 % | 25 % | 58 % |
  | e_m2 | 8.5 | 68 % | 37 % | 67 % |
  | se_m1 | 11 | 47 % | 36 % | 51 % |
  | s_l1 | 10 | 46 % | 36 % | 51 % |

  - How often each kind was empty: bow 100 % on every plot, sickle 98–100 %, pickaxe 88–99 %, rod 88–100 %, axe 73–89 %, can 58–83 %.
- **Cause:** one toolsmith makes 6 kinds. `Workshop.pickTool` now keeps a run going while the shop has room, but supply is still below what customers ask for.
- **Fix idea (balance):**
  - Customers ask only for kinds that are on the shelf or in the forge's run.
  - Or start the shop with 2–3 tool kinds and add the rest with a second smith.
  - Or point the toolsmith's next run at the kind that has waited longest.

### Low

**6. 관망 and 길 안내: the pin's 240 s clock keeps running during 관망, and a pin can end under the pilot without a word.**
- **Evidence (`pilot/pilot.json`, real taps):**
  - **Run A:**
    - I pinned the board row; 관망 started by itself at t 79 (pin age 65).
    - The pin ended at about t 184 while the pilot drove, because the pilot's run filled that order ("정기 납품 완료! +108" at 180).
    - After a real touch handed control back, there was no pin and no word why.
  - **Run B:** 60 s of 관망, then hand back. The pin was still there, with age **62** (the clock had kept running).
  - With `pinMaxS` 240, a 관망 of about 3–4 min drops a fresh pin.
- **Fix idea:**
  - Pause the pin's age while `pilot.on`.
  - On hand-back, if the pin ended during 관망, say why ("주문이 끝났어요").

**7. The empty-shelf label "판매대가 비었어요" always shows the can icon.**
- `Seller.emptyCue` uses `goods[0]` (the can), even when the waiting customer wants a tool (`store/*.jpg`).
- **Fix idea:** use the front customer's wanted item.

**8. The server hands plates over from about 1.5 m on 38–43 % of deliveries.**
- **Evidence:** "near" legs were 36 / 95 at level 0, 53 / 124 at level 1 and 50 / 130 at level 2. Hand-over distance was p50 181–182 and p90 190–191 iso px. There were 0 timeouts and 0 snaps.
- It works, but on a phone it looks like serving from a distance.
- **Fix idea:** a smaller stall-near radius, or let the leg go on a little longer before it counts as near.

**9. A one-time hint is used up during 관망.**
- At t 318 the pilot's auto-pickup showed "지나가다 주웠어요 · 설정 › 놀이 › 자동 줍기에서 바꿀 수 있어요" (`PickupPolicy` `seen.pickupTip`). "가득 찼어요!" followed at t 326, while the player was not driving.
- The hint is shown once per save, so the player never sees it.
- **Fix idea:** skip tips (and "full" toasts) while `pilot.on`, and do not mark them seen.

**10. Doc nit: the 기획서 says the board always shows "승격식 준비 11,000".**
- `docs/기획서_v4_2_촌장.md` line 903 says this row is always on the board's 마을 소식.
- In code, that row is `tutorial.goalText()` (`TownHall.boardLines`), so it shows only while 승격식 is the current goal.
- **Fix idea:** reword to "승격식이 지금 목표일 때 게시판에도 보여요".

## What passed (numbers)

**큰 식당 (46-min save, chief away, 8 game min per phase):**
- Walk-outs were 0 at every level. Queue full: 0 % / 2 % / 9 %. Pantry empty: 0 %.
- Plates on the pass: avg 0.17 / 0.28 / 0.45, max 2 / 2 / 3. Two or more plates waiting: 0 / 2 / 6 % of the time.
- Seated diners waiting for food: 0.26 / 0.49 / 0.63 on average. 0 diners took too long to reach a seat, and 0 server timeouts.
- After the purchase the chief is not blocked on the pad (`chiefBlocked: false`). The level-2 pads (st2_* and p2_*) keep appearing as before.

**Exploits:**
- **Tables part-pay plus reload:**
  - I stood on the level-2 pad (2,000) and stepped off after 1,187.
  - The autosave caught 1,374 paid; on reload the coins were 5,819 (5,819 + 1,374 = 7,193, the coins before).
  - Finishing cost 626, for **2,000 in total**. Coins went from 7,193 to 5,193, giving level 2 with 16 seats. Nothing was duplicated or lost.
- **Crew after a reload:**
  - 5 before and 5 after the load. In 150 s after the load: 0 new arrivals and 0 banners. 16 porters both before and after.
  - The saved `v42.crew` brings back `extra 3` / `target 5`.
- **Dock refund:** 450 comes back once at the first load. A save and reload after that gives +0 coins and still 1 porter.
- **관망 spending:** 0 coins paid into any pad while the pilot drove (`economy.spend` wrapped, 2 runs, about 6 game min of 관망).

**선착장:**
- **A (35-min save without the boat):**
  - Paying 700 on the 나룻배 pad gave `done: {boat, porter}`, 1 dock porter and no 600 pad.
  - Over the next 6 min the pier pile averaged 1.2 / 30 (max 9). The porter took 48 loads and 18 fish reached the cannery.
- **B (46-min save, no porter, 450 part-paid):**
  - He joins at load, and the 450 comes back.
  - Pier avg 0.7 (max 4). The porter took 52 loads and 71 fish reached the cannery.

**마을회관 board:**
- I walked onto the board pad with the joystick (12.6 s from the cannery). The panel opened with the row "→ 서리역 짐 싣는 곳 · 길 안내".
- A real tap pinned the route: toast "길 안내: 서리역 짐 싣는 곳", chip "→ 서리역 짐 싣는 곳 · 85m", route 5,450 px.
- Following it with the joystick took 15.4 s and ended with the toast "서리역 짐 싣는 곳에 왔어요". The order need went 7 → 3.
- Screens: `hall_s46/h1_board.jpg`, `h2_guide.jpg`, `h3_following.jpg`, `h4_arrived.jpg`.

**관망 hand-back:** a real touch ends 관망 ("다시 조종해요"). The pin and chip come back as they were (run B), apart from #6.

**Pacing bots (new game, fixed clock, 0 stuck, 0 page errors in both):**

| Bot | First shop | 5 shops | 승격식 ready | 서리읍 | Longest wait between hires | Reference (integration run) |
|---|---|---|---|---|---|---|
| smart (58 min) | 24.32 | 38.40 | 40.42 | **45.00** | 4.71 min | 44.67 |
| arrow-only (60 min) | 28.12 | 39.61 | 39.63 | **49.00** | 4.99 min | 47.67 |

- Both are within +3 % of the integration run, and both are faster than the v4.2 verify run (51.5 arrow-only).
- Arrow-only waits 9.4 min for the 11,000 coins after it is otherwise ready. That is the planned 승격식 coin goal.

## Not done or limited

- I did not play a fresh game up to e_m1 to see the bend before a reload. I rely on the integration's fresh-game line audit (e_m1 bent) and on the cause above.
- I measured sales and the shelf on 5 plots (4 game min each). I checked the line places after a load on all 9 store plots (#1).
- My "behind a pine" counter for store customers is unreliable, so I did not use it. Visibility was judged from screens.
- Day/night and zoom looks belong to the robust review (`v42_final_review_robust.md`).

## Evidence (scratch, `/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/frg/`)

- `tools/`: `lib.mjs` (touch harness), `rest.mjs`, `crew.mjs`, `store.mjs`, `storeblock.mjs`, `slotwhy.mjs`, `efence.mjs`, `reloadplots.mjs`, `dock.mjs`, `hall.mjs`, `pilot.mjs`.
- `runs/rest_s46/`, `runs/rest_s46b/` (restaurant levels 0/1/2, part-pay, `part2.save.json`).
- `runs/crew/` (crew, 짐꾼 2, reload), `runs/store/` (5 plots + screens), `runs/storeblock/`, `runs/slotwhy/`, `runs/efence/` (#1 with both screens), `runs/reloadplots/` (#1, all 9 plots).
- `runs/dock/`, `runs/hall_s46/`, `runs/pilot/`, and a `*.log` next to each.
- `bots/smart.log`, `bots/arrowonly.log` (+ `.json`), `bots/source_at_start.txt` (the source fingerprint).

## 디자이너용 짧은 요약

- 큰 식당: 손님이 그냥 가 버리는 일이 없어졌어요. 1분에 12~16명 먹어요. 그런데 새로 산 뒤뜰 테이블에는 아무도 안 앉아요(#2).
- 짐꾼: 창고 직원이 2명에서 5명으로 늘고, 다들 바빠요. 짐이 쌓여 보이는 건 팔 곳이 모자라서예요(#4, v4.4에서 고쳐요).
- 잡화점: 이제 잘 팔아요. 다만 가게가 e_m1 땅에 있으면, 게임을 다시 켰을 때 줄 끝 두 자리가 울타리 안에 생겨서 손님 두 명이 못 와요(#1). 선반은 아직 자주 비어요(#5).
- 선착장: 나룻배를 사면 생선 짐꾼이 같이 와요. 생선이 쌓이지 않아요.
- 마을회관 게시판: "어디로 가져가요"가 보이고, 누르면 길 안내가 돼요. 다만 가방 화살표는 통조림을 잡화점으로 안내해요(#3).
