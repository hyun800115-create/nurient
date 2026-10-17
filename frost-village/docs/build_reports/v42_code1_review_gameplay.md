# review:gameplay

# v4.2 CODE-1 independent review: gameplay and economy (all code treated as read-only)

I tested the current working tree, including the builder's uncommitted changes, which were all last edited before 01:16. Everything ran on a 390×844 phone viewport with the fixed-step clock. The machine was heavily loaded (load average 23–34), so only relative timings mean anything. My scripts, logs, census JSON and screenshots are in `/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v42code_review_gameplay/`. I wrote nothing in the repo.

**Overall:** no critical findings. The train, the pickup modes, the courier and bank coin handling, and 관망 safety (no spending, no getting stuck, instant hand-back) all work. These must be fixed before CODE-2 ships to the designer:
- **H1:** coins at the logistics depot (물류 금고) are lost and nobody collects them.
- **H2:** navigation (길 안내) flickers between far-apart destinations.
- **M1 and M2:** the surplus destination path and the "nobody takes this" chip are both dead code.
- **M3 and M4:** two 관망 settings or states do nothing.
- **M5:** several overflow targets are still missed at 60+ game minutes, and the plain warehouse (창고) itself starts to fill up.

## HIGH

**H1 — Depot till coins are never collected after 읍 and are deleted on every reload.**
- **Repro** (`exp_coins.mjs`):
  1. Load the 46-min v4.1 save and run `rank.ceremony(true)` to reach 읍.
  2. Run `__FV.v42.office({build:'all', hire:['sem','ttal','bok','chong']})` and `__FV.v42.depot({build:true, stock:{…}})`.
  3. Park the chief at (−1500, 600) and run 6 game minutes.
  4. Save while the courier is mid-round, then reload.
- **What happened during the 6 minutes:**
  - The courier (딸랑이) collected 8,619 coins from the market, trade post, store, restaurant and tax box, and 0 from the depot.
  - The depot till grew from 4 to 477.
- **What happened on reload:**
  - Depot till: 1,293 before the save, 4 after the reload.
  - The courier's sack (285 coins) came back correctly.
- **Causes:**
  - `src/systems/office/Office.js:190` drops the `'depot'` till once rank ≥ 2. The depot can only be built after 읍, so the courier never visits it.
  - Unlike the station till (역 금고), the depot till has no automatic 15-second flush.
  - `DepotSystem.serializeInto` (`DepotSystem.js:129`) does not save `till.value`.
  - `Depot.cash` is never incremented, so the saved `logistics.cash` is always 0.
  - 관망's coin collecting (수금) switches off once 딸랑이 is hired, so in 관망 nobody collects it either.
- **Side effects:**
  - The census bot's `cashTotal()` skips this till, so the reported income leaves out depot sales.
  - The designer doc (§2.x) promises "코인은 물류 금고로 → 딸랑이가 가져가요". The code does not do this.

**H2 — The navigation destination flips back and forth between far-apart places.**
- **Repro** (`exp_nav3.mjs`, 46-min save, chief standing still with a bag for 90 s):

| Bag | Switches between | Switches in 90 s |
|---|---|---|
| 6 bread + 6 smoked meat | 광장 판매대 ↔ 광부 식량 상자 (about 1,050 px apart) | 15, every 1.5–7 s |
| 12 raw fish | 통조림 공장 ↔ 화덕 입구 | 7 (one gap was 2.5 s) |
| planks / ingots | 교역소 ↔ 대장간 | every 10–40 s |

- While walking (`exp_nav2`), a bag of planks switched from the toolsmith to the trade post after 1.1 s, and the chip text changed 5 times.
- **Cause:**
  - `Tutorial.destination` returns a single sink per item type via `Logistics.best` with `minPrio: 50`.
  - The food box (priority 50 only while it has room) and workshop inputs (70 below 25 %, otherwise 42) keep crossing that threshold as porters top them up.
  - `Navigator.js:108` only applies hysteresis when the previous place is still in the list, so a vanished place is replaced at once.
- **Also:** the chip count is the whole bag, not what the place takes. For example "빵 3 → 광부 식량 상자" was shown while the box only takes 2 (`Navigator.js` builds `n` from the full bag counts).

## MEDIUM

**M1 — The surplus destination (dock / depot) for the chief is dead code.**
- `Tutorial.js:566-568` reads `F.surplusSink` and calls `F.dockPad()`. Neither exists on `Freight` (its sink is `this.sink`; the dock pad belongs to Growth), so `v42Dest()` always returns null.
- **Effects:**
  - Goods with a full shelf and no open order card get no guide at all.
  - In 관망, `workTarget` returns `kind: 'stuck'` and sends the chief to the trash pad, which ignores him while piloted (`TrashPad.js:53`).
  - In the 15-minute office soak he spent 20 s on 'stuck' trips and carried one load for 104 s.
  - `work.js:51` also takes the fullest station output without checking that its product has anywhere to go (`Tutorial.productHint` does check).

**M2 — The "nobody takes this" chip is never shown.**
- `Navigator.js:120` calls `hide()`, which sets `active = false`, so `chip()` returns null (`Navigator.js:240`).
- **Evidence** (`exp_nav`): with the trade shelf full and 8 planks in the bag, and with the smelter input full and 8 ore, the result was `dest.none = true`, `chip = null`.
- The strings `navFull` and `navNone` ("판매대가 가득 · 잠시 기다리거나 버려요") never appear; the guide just disappears.

**M3 — 관망 never switches the halo into its 관망 state.**
- `ChiefAura.observing` is only ever assigned in its constructor (`ChiefAura.js:34`).
- **Evidence** (`exp_auto`): after auto-start, `aura.observing` was false, and the star pin went from 1 to 0 within 3 s.
- So the plan's "pin always on in 관망", alpha 0.6 and slower spin never happen. That makes the chief harder to find again after a camera cut.

**M4 — The setting "관망 중 돈 쓰기: 고용만" has no effect.**
- **Repro** (`exp_auto`): `observeSpend = 'hire'`, 20,000+ coins, the 셈이 hire pad (500) open, 300 s in 관망.
- **Result:** 0 coins spent, 0 hires. The pilot only did coin collecting, work and chat.
- **Cause:** `isPayTarget` (`work.js:14`) excludes every pad, and `urgentTarget` drops the `obj_unlock` / `obj_clerk` / `obj_porter` keys. The pilot never walks to a hire pad, so `blocksPay('hire')` only matters if he happens to cross one.

**M5 — Overflow is still there at 60+ game minutes (census, same bot and tool as the builder).**

| Measure | Gate | 46-min save, 60 min | Fresh game, t ≥ 40 min |
|---|---|---|---|
| Market shelf empty: bread / smoked meat / grilled fish | ≤ 10 % each | 8 / **27** / 1 % (per 20-min window, meat: 39 → 25 → 17 %) | 8 / **36** / 3 % |
| 교역소 empty: plank / ingot | ≤ 40 % | **71 / 76 %** | **80 / 77 %** |
| Any raw pile ≥ 90 % | ≤ 50 % | **98 %** (ore 85, meat 76, fish 58) | **99 %** |
| Smelter / sawmill output ≥ 90 % | ≤ 30 % | 26 / 3 % ✓ | **31** / 2 % |
| 창고 average stock | ≥ 40 | 174 ✓ | **36** |
| Income | +15–30 % | 2,377/min, +26 % vs the plan's 1,889 | — |

- The overflow has moved to the food outputs (≥ 90 % full):

| Output | 46-min save | Fresh game |
|---|---|---|
| Grill | 41 % | 35 % |
| Smokehouse | 40 % | 41 % |
| Bakery | — | 38 % |

- The 창고 keeps filling on the 46-min save (71 → 158 → 188 → 213 → 278, peak 293 of 300) and is becoming the new overflow spot.
- Income drifts upward: the last 20 minutes of the 46-min run reached 2,486/min (+32 %, above the +30 % cap). The fresh run's last 15 minutes reached 2,634/min.

**M6 — The newspaper's sales headline uses the wrong count.**
- `VillageNews.js:76` uses `T.sold`, which counts every 'sold' event from the market (all foods), but names a single item.
- **Evidence** (`panel_text.json`): "어제 구운 생선 167개가 팔렸어요", where 167 is all foods sold.

## LOW

- **L1 — Raw placeholder in the 관망 caption.** `ChiefPilot.js:199` calls `t(tg.place)` without its `{st}` parameter. Rendering the caption string in Node gives "통나무를 {st} 입구로 나르는 중". The same happens for `place_op`. This shows whenever the pilot carries raw goods.
- **L2 — In 'off' (끔) pickup mode, holding and tapping 줍기 behave the same.** `press()` sets both `held` and `oneLoad` (`PickupPolicy.js:88`). In `exp_pickup`, a 0.5 s hold took 3 items and kept streaming to 15 after release, so releasing a hold never stops pickup. It works for players, but the plan's tap/hold split isn't really there.
- **L3 — Navigation to a station input ignores porter reservations.** `Tutorial.js:559` uses `inStack.room`. In `exp_nav`, logs were sent to the sawmill input with `room = 1` and `Logistics.want = 0`, so the chief arrives and cannot drop anything.
- **L4 — The dock label promises the depot before it exists.** "수출 · 물류창고로 갈 것 N" (`strings.js:318`) shows on the pre-읍 46-min save (shots `train_s1_toTown_loop_b` and `_c`).
- **L5 — The 재고 tab's top-line total double-counts the 창고.** `StockLedger.total()` sums both the `'wh'` total row and the `'wh:<product>'` rows, so "마을 물건 N개" is inflated (560 in my run).
- **L6 — 관망 urgent targets hop across the map, and the caption doesn't say what the job is.** Within 96 s the urgent target went (1216,900) → (771,815) → (3421,1568) → (−1152,1242) → (1216,900) → (1216,900) → (−1152,1242), then was dropped for 업무 1 s later. The caption only says "급한 일을 하는 중" (`act_urgent` with an empty `what`).
- **L7 — 관망's auto-start idle clock ignores taps on HUD buttons.** `Input.lastTouch` only updates when a joystick starts. A player using only zoom, overview or 줍기 for 60 s still gets the 3-second countdown.
- **L8 — The chief is hard to spot in a crowd at zoom 1 with the CODE-1 halo.** The stand-in ring is faint, and the star pin floats about 150 px up when he carries 14 planks (`shots/halo_plaza_carry_z10.jpg`). At zoom 0.6 the pin finds him (`halo_station_z06.jpg`). Recheck with the CODE-2 art.

## Verified OK
- **Pickup modes** (`exp_pickup`):

| Mode | Crossing at full speed | Standing on the pad |
|---|---|---|
| 켬 (auto) | takes 3 items, same as v4.1 | 14 in 1 s |
| 멈추면 (still) | 0 | 6 after 1 s |
| 끔 (off) | 0 | 0; 줍기 button appears, tap = full load (26) |

  - Station outputs, piles and the boathouse are all gated; gathering follows the mode.
  - The tutorial forces 켬 until the fisherman is hired.
- **Navigation:** destinations for all 17 item types are valid apart from L3. Mixed bags cycle through 3 places with "+2곳" and arrive.
- **Train** (`exp_train`, stage 1, 85.4 s cycle, 672 moving samples):
  - 0 cars drawn backwards.
  - The engine was never behind car 2.
  - 0 position jumps over 80 px.
  - 0 animation direction fallbacks.
  - 0 reverse moves.
  - The loop shots look right, and the door points are on the platform side.
- **Courier and bank coins:**
  - Coins taken by the courier exactly equal coins deposited (8,619 = 8,619).
  - The sack survives a reload mid-round.
  - The fullest till between rounds was 1,442 (target about 1,500).
  - The courier was never stuck.
- **관망, 15-minute soak with office, bank and all 4 staff:**
  - 0 coins spent, 0 stuck, 0 panels popped open by pads.
  - 35 activity starts over 7 kinds.
  - 11 camera cuts (about one every 82 s).
  - A real touch on the village hands control back in the same frame.
  - The 관망 button toggles on and off.
  - Auto-start runs a 3-second countdown, and a touch cancels it.
- **Pacing** (fresh census): village complete at 19.5 min, 읍 at 46.2 min (v4.1: 48.2).
- **Bigger porter bags (the designer's question):** I confirm the builder's "no".

| First 40 min, fresh game | v4.2 as shipped (raw 8 / goods 14) | Bigger bags (raw 12 / goods 18) |
|---|---|---|
| Any raw pile ≥ 90 % | 56 % | 56 % |
| Outputs ≥ 90 % (grill / sawmill / bakery / smelter / smokehouse) | 5 / 3 / 26 / 32 / 40 % | 5 / 4 / 26 / 29 / 35 % |
| Bread shelf empty | 49 % | 35 % |
| Meat shelf empty | 78 % | 74 % |

  - The builder only measured raw piles; the goods-output and shelf rows above are new.
  - Each case is a single run, so the numbers are noisy.