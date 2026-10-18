# v4.2 touch — 큰 식당 테이블 늘리기 + 서빙 fix, 짐꾼 2 on more lines, a 창고 crew that grows (2026-10-18)

The designer (relayed): raw materials sit because nobody carries them fast enough; there should be more porters, the
창고 early, and its crew should grow with what the village makes; and the 큰 식당's terrace is full of guests waiting.
This touch does **A** the restaurant (measured first, then tables + the real fix) and **B** the carry side (짐꾼 2 on the
lines that lacked it, a 창고 crew that grows with production). The demand side (more workshops, shops, building sites, a
자재창고) is a separate later version and is **not** here (`docs/logistics_plan.md`). Designer text:
`docs/기획서_v4_2_촌장.md` §13; plan: `docs/v42_plan.md` §19. Nothing is committed; the lead commits.

Evidence (scratch): `/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v42touch/`
- `before/`, `after1/`, `after2/` — restaurant pipeline runs (`probe_rest.mjs`, 5 game minutes per state);
- `probe/` — the server trip probe (`server_base.json`, `server_new.json`), `probe_crew.mjs`, `probe_perf.mjs` + `perf.json`;
- `census/` — late-village census runs (`base35_10`, `base60` on the base copy, `after60` on the touched source);
- `bots/` — fresh-game pacing bots (`smart.log`, `arrowonly.log`);
- `suites/` — suite logs and `summary.txt`; `base/frost-village` — the untouched v4.2 copy (HEAD 3236722).

The machine was shared with other agents the whole time (load average 18 to 36 on 4 cores): wall times and ms numbers
are relative only; every game-time number is on the fixed-step clock.

## 1. Measured first: why the 큰 식당 jams

v4.1 46-min save (all three restaurant staff hired), chief away unless noted, pantry kept full unless "natural",
5 game minutes after a 60 s warm-up (`probe_rest.mjs` on the base copy):

| State | Chief | Served / min | Coins / min | Walk-outs / min | Queue full % | Seats busy (of 8) | Seated waiting | Seat wait avg s | Server busy % | Cook busy % |
|---|---|---|---|---|---|---|---|---|---|---|
| no staff | smart (register + kitchen) | 13.2 | 326 | 0 | 1 | 3.3 | 0.1 | 1.3 | – | 30 |
| cashier | kitchen | 12.0 | 322 | 0 | 4 | 3.2 | 0.1 | 0.9 | – | 30 |
| cashier + cook | kitchen | 12.0 | 265 | 0 | 2 | 3.1 | 0.1 | 1.5 | – | 36 |
| cashier + cook | away | 0 | 0 | 6.0 | 58 | 7.6 | 6.9 | 70 | – | 15 |
| all three | away | 4.0 | 84 | 2.2 | 55 | 7.7 | 6.2 | 57.5 | 100 | 18 |
| **all three (designer's case)** | **away, natural pantry** | **3.8** | **96** | **2.0** | 65 | 7.7 | 6.2 | **59.7** | **100** | **17** |

- Not the seats and not the kitchen: with the chief at register + kitchen 8 seats serve 13 a minute; with all three
  staff the cook idles (17 %) and the 서빙 직원 is 100 % busy.
- The server trip probe (`probe/server_base.json`): 3 of 5 deliveries hit the 12 s timeout and ended 99–205 px from
  the table. The destination `(seat.x + 34, table.y + 40)` of an inner seat lies inside the neighbour table's collision
  circle (r 44), and the four tables leave no 24 px gap: for an agent with collision the terrace is one solid block.
- Without a server (cashier + cook, chief away) every order taken waits forever: 6 guests a minute sit 70 s and walk out.

## 2. A — restaurant

### 2.1 The fix (`src/entities/BigRestaurant.js`)

- **Serve points**: the server walks to a free spot beside the seat — ring search r 64 / 80 / 96 px, 16 directions,
  not blocked at r 15, nearest to the approach — cached per seat; back-yard seats are reached round the terrace by
  `backPath` and the server comes back by its reverse. Each leg ends when it arrives, after 7 s, or after 1.2 s stalled
  near the seat. Plates fly from the tray to the table.
- **Two at a time**: the server loads up to `serverCarry` (2) ready tickets for seats on the same side.
- **Kitchen hold**: with nobody in the kitchen (no cook or no server, and the chief not on the kitchen pad) the register
  takes no new order once `holdTickets` (3) wait; guests wait in the queue instead of at a table. The kitchen pad says
  `주문 {n}개 · 여기 서세요`.

After (same probe, touched source):

| State | Served / min | Coins / min | Walk-outs / min | Queue full % | Seated waiting | Seat wait avg / p90 s | Server busy % | Cook busy % |
|---|---|---|---|---|---|---|---|---|
| all three, away, pantry full | 4.0 → **10.4** | 84 → **232** | 2.2 → **0** | 55 → 18 | 6.2 → 2.4 | 57.5 → 13.8 / 23.6 | 100 → 87 | 18 → 33 |
| all three, away, natural | 3.8 → **12.2** | 96 → **261** | 2.0 → **0** | 65 → 7 | 6.2 → 2.1 | 59.7 → 11.6 / 18.7 | 100 → 90 | 17 → 34 |
| cashier + cook, away (no server) | 0 → 0 | 0 | 6.0 → **2.4** (+0.4 leave the queue) | 58 → 81 | 6.9 → 2.8 | 70 | – | 15 → 7 |

Server trips (`probe/server_new.json`): 2–4 s for one ticket, ≈ 7 s for two, all ending 9–14 px from the serve point;
none at 12 s.

### 2.2 테이블 늘리기 (2 levels)

- `busyT` = seconds the head of the line waited for a seat while the kitchen was working (capped 3,600 s, saved).
  At `tables.offerS` (60 s) a LineUpgrades pad `tables1` (kind `upgrade`, label `테이블 늘리기`) appears where the next
  two tables go, with the banner `큰 식당에 자리가 모자라요!` / `식당 뒤뜰에 테이블을 늘릴 수 있어요`.
- Level 1 (1,200): tables at world (−799, 731), (−709, 685); level 2 (2,000): (−876, 692), (−786, 647) — behind the
  terrace (up the screen), off the roads (nearest road 525 px), on open ground. Lamp 1 moves to (−686, 638); a lantern
  string per level; tables pop in with a cheer, banner `테이블이 늘었어요! 자리 {n}개`, news `news_tables`.
  Existing art only (`picnic_table`, lantern string, lamp): no new texture, no new page.
- Seats in the back yard carry a path (via (−620, 880), (−590, 790), (−640, 715)); guests walk it with collision
  (teleport only after 50 s stuck), sit, eat and leave by the reverse; the server uses the same way round.
- Guests come a little more often with more seats: interval × (8 / seats)^`seatsPull` (0.5) — 16 seats ≈ 1.41× guests.

| Chief away, all three staff, natural pantry | Seats | Served / min | Coins / min | Walk-outs / min | Seated waiting | Seat wait avg / p90 s | Server busy % |
|---|---|---|---|---|---|---|---|
| level 0 (after the fix) | 8 | 12.2 | 261 | 0 | 2.1 | 11.6 / 18.7 | 90 |
| level 1 | 12 | 11.2 | 241 | 0 | 2.8 | 16.7 / 30.3 | 96 |
| level 2, one server | 16 | 10.2 | 211 | 0.4 | 4.5 | 26.6 / 50.3 | 95 |
| **level 2 + 서빙 직원 2** | 16 | **13.8** | **317** | **0** | **0.9** | **4.8 / 8.3** | 65 + 57 |

### 2.3 서빙 직원 2 (measured: needed)

With 16 seats one server is the limit again (seat wait 26.6 s, walk-outs 0.4 a minute). The hire pad `서빙 직원 2 고용`
(1,000, kind `hire`, at the staff spot) is offered once tables ≥ 1, a server exists and `serveWaitT` — seconds with
≥ 2 ready plates while the server is out — reaches `server2.offerS` (60); banner `서빙 직원이 바빠요`. The second server
has his own post beside the pass and look (seed 7331); after a load he comes back once the first server is back.

### 2.4 Income

Restaurant, chief away: **96 → 261 coins a minute** from the fix, **317** with level 2 + 서빙 직원 2 (+165 / +221). The
late village earns ≈ 2,470 a minute (v4.2 verify census), so the restaurant adds ≈ **+7 % / +9 %** of village income.
Prices are unchanged; the one knob if it is too much is `civic.restaurant.dishMult` (1.3). Late-village census income:
§3.4.

## 3. B — porters

### 3.1 짐꾼 2 on the three lines that lacked it (`src/systems/LineUpgrades.js`)

- `P2_LINES` adds `toolsmith` (대장간 → `cat_tools`), `cannery` (통조림 공장 → `item_can`), `dock` (배 창고 →
  `item_fish_raw`); costs 700 / 700 / 500; the pad stands by the line's door (통조림: 88 px from the outPad, open ground).
- `porter2.fullForS` 90 → **45**. Measured (`census/base35_10`): in a busy village each line's output is ≥ 80 % full
  20–60 % of the time (grill 52, sawmill 37, bakery 40, smelter 60, smokehouse 53, toolsmith 32, cannery 20 %), so
  90 s of accumulated "full" took 2.5–7.5 game minutes; 45 s halves it.
- The full-time counter pauses while the line's porter has stood in `load` with ≥ 4 goods for > 4 s (nobody wants them:
  a second porter would not help). 짐꾼 2 pads get their own 2 slots (`MAX_P2`); before, three unbought 가공소 2단 pads
  filled `MAX_OFFERS` and hid them.

### 3.2 창고 직원 grow with production (`src/systems/WarehouseCrew.js`)

- `Game.noteMade(n)`: raw landing on a collection pile (`Labour`), a station's product (`Station`), a workshop's output
  (`Workshop`, `outN`), the boat's catch (`Boathouse`). The crew system samples it every 5 s into a per-minute EWMA
  over `crew.window` (180 s; for the first minute after a load a cumulative average, and no arrival before that).
- `target = clamp(2 + floor(max(0, rate − 300) / 70), 2, 6)` (`warehouse.crew.from / perMin / cap`). Measured making:
  ≈ 480 a minute when the 창고 is built (35 min, `base35_10`) → 4; ≈ 590 in the 46-min village (`base60`, 576–598 per
  10-minute block) → 6, the cap — and once the crew carries more the village makes more (611–654 a minute in `after60`).
  A K-only rule `rate / K` sat at the cap from the first minute, because the making saturates around 480–600.
- One arrives at a time, at most every `crew.every` (60 s), free: spawned at the nearest way into the village
  (`w_gate_n`, `w_gate_m`, `gate`, `v_link_w` once the rail is open) that is off screen (+4,000 px penalty for an
  on-screen gate), fades in, walks the roads to his place (`WarehousePorter.homeFor`: two rows beside the door; snapped
  home after 180 s if stuck), banner `창고 직원이 한 명 더 왔어요` / `마을이 바빠져서 창고 직원이 {n}명이 되었어요`,
  a line in the next 서리 소식 (`news_crew`), event `crewArrived`, a save.
- Never removed (no flapping); restored at the 창고 at once after a load. An older save with no crew field starts at 2,
  a save with `crew.n` keeps that many, and both grow again from their own making.

### 3.3 Census: does it carry more? (late village, 60 game min)

{{CENSUS_TABLE}}

## 4. Save v7 (additive)

| Block | Field | Range / default |
|---|---|---|
| `c1.rest` | `tables` | 0–2 (count of `tables.costs`), absent = 0 |
| `c1.rest` | `busyT`, `serveWaitT` | 0–3,600 s, absent = 0 |
| `c1.rest` | `server2` | 1 or absent |
| `v42` | `crew` | `{ n: 0–12, rate, since: 0–600 }`, absent = base crew |
| `v42` | `p2`, `full` | now the 8 lines (5 stations + toolsmith, cannery, dock) |
| `v42` | `seen.tb` | banner flags for the restaurant pads |
| `v42` | `offerPaid` | part payments (`tables1`, `tables2`, `srv2`, `p2_*`) as before |

Found by the tests: the first build wrote these fields but `sanitizeC1` / `sanitizeV42` (`src/core/Save.js`) dropped them
on load (level 2 came back as 8 seats, the crew as 2, 통조림 짐꾼 2 lost). Both now keep them. v4.1 and v4.2 saves load
unchanged (`save_v42`, `save_v2/v3/v35/v4 --browser`, `porters42` 5, `restaurant` 9/11/12).

## 5. Tests

{{TESTS}}

## 6. Pacing bots (fresh game until 읍)

{{BOTS}}

## 7. Performance

{{PERF}}

## 8. Screenshots (`docs/previews/screens_v42/`, 390 × 844, DPR 3, Korean)

{{SHOTS}}

## 9. Files

| File | Change |
|---|---|
| `src/entities/BigRestaurant.js` | serve points, back path, two-ticket server legs, kitchen hold + label, tables levels (layout `more`, lamp move, lanterns, seats with paths), `busyT`, server 2 (post, look, `serveWaitT`), seat pull, save fields, `state()` / `where()` additions |
| `src/systems/LineUpgrades.js` | restaurant offers (`tables1/2`, `srv2`), 짐꾼 2 for 8 lines, `porterWaits`, `MAX_P2`, banners, done hooks |
| `src/systems/WarehouseCrew.js` (new) | the 창고 crew system |
| `src/systems/v42/index.js` | registers `crew` |
| `src/entities/Worker.js` | `WarehousePorter.homeFor`, the `arrive` state |
| `src/scenes/Game.js` | `noteMade`, test hook `restTablesPad` |
| `src/systems/Labour.js`, `src/entities/Station.js`, `Workshop.js`, `Boathouse.js` | count what is made |
| `src/systems/VillageNews.js` | `news_crew`, `news_tables` |
| `src/core/Save.js` | keeps the new `c1.rest` / `v42` fields |
| `src/data/balance.js`, `balanceCheck.js` | the numbers (Korean comments) and their ranges |
| `src/data/strings.js` | 13 keys, ko + en |
| `tools/test/restaurant.mjs` | steps 6b, 10, 11, 12; step 9 compares with what the save wrote |
| `tools/test/porters42.mjs` (new) | 짐꾼 2 lines, crew rule, arrival, no flapping, cap, save / reload |
| `tools/test/shots_v42_touch.mjs` (new) | screenshots 30–36 (`--repo` for the before shot) |
| `tools/test/review_gameplay_census.mjs`, `review_gameplay_sim.mjs` | made / crew / 짐꾼 2 / restaurant columns |
| docs | `기획서_v4_2_촌장.md` §13, `v42_plan.md` §19, this report |

## 10. Open issues

{{OPEN}}
