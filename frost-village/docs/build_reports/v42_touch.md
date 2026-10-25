# v4.2 touch — 큰 식당 테이블 늘리기 + 서빙 fix, 짐꾼 2 on more lines, a 창고 crew that grows (2026-10-18, finished 2026-10-25)

The designer (relayed): raw materials sit because nobody carries them fast enough; there should be more porters, the
창고 early, and its crew should grow with what the village makes; and the 큰 식당's terrace is full of guests waiting.
This touch does **A** the restaurant (measured first, then tables + the real fix) and **B** the carry side (짐꾼 2 on the
lines that lacked it, a 창고 crew that grows with production). The demand side (more workshops, shops, building sites, a
자재창고) is a separate later version and is **not** here (`docs/logistics_plan.md`). Designer text:
`docs/기획서_v4_2_촌장.md` §13; plan: `docs/v42_plan.md` §19. Nothing is committed; the lead commits.

The first build (2026-10-18) was cut off by a usage limit before its last runs. The **finish (2026-10-25)** re-read that
work, found the real cause of the restaurant stalls (§0 F1), changed what the evidence asked for, and re-measured
everything on the final source. Numbers are from the final source unless marked "first build".

Evidence (scratch):
- first build: `/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v42touch/` — `before/`
  (restaurant on the base copy), `census/base60` + `base35_10` (base copy), `base/frost-village` (HEAD 3236722), `probe/`;
- finish: `/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/touch2/` — `reach/` (seat
  reach probe + geometry plots), `rest/` (restaurant after), `census/after60`, `bots2/`, `suites/`, `shots360/`.

The machine was shared with three other agents the whole time (load average 25–45 on 4 cores; the memory cgroup's OOM
killer took the first pair of bot renderers at 16:19): wall times are relative only; every game-time number is on the
fixed-step clock.

## 0. What the finish found and changed (2026-10-25)

| # | Found | Change | Proof |
|---|---|---|---|
| F1 | **A finished building's foundation circle came back on every load.** `Site.setShown(v)` set `obstacle.active = v && state !== 'plot'`. A loaded save restores every site as `done`, then `refreshSites` shows it, so the foundation circle (footprint × 0.36) is active again over the finished building. On the 큰 식당's XL plot that is **r 189 at the plot's centre — half the terrace** (seats 2, 3, 7 and the way round to the back yard). The 서빙 직원 walked into it and gave up after 7 s, guests to seat 7 pushed against it for 25 s before the walk-without-collision fallback, the back-yard path stalled. In fresh play (no reload) the circle stays off, which is why the first build's tests (restaurant built in-session) passed. The designer's phone reloads every session. | `src/entities/Site.js` `setShown`: the circle is never re-activated once the site is `done` (every building has its own collision; fresh play already worked this way). | `reach/` probe (46-min save, all staff, chief away, pantry full, 4 game min). **Before the fix:** seat 3 had 2 of 7 (8 seats) and 5 of 7 (16 seats + 2 servers) deliveries on the 7-s timeout, ending 223 px from the seat; guests reached seat 7 after 25.7 s, back-yard seats after 14–24 s; 28 of 54 back-path legs stalled. **After:** 0 timeouts, 0 stalls on all 16 seats, every leg ≤ 2.1 s, hand-off 81–100 px from the seat (the serve point), every guest seated in 2.1–7.5 s with no teleport, 48 / 48 back-path legs arrive; a staged rush (a guest every 2.6 s) serves **23.3 a minute** (was 16.8). |
| F2 | With the server reaching every seat, the line never waits for a seat: `frontNoSeat` is **0 %** in every state of §2.1, so the first build's only trigger (`busyT` ≥ 60 s) would almost never show 「테이블 늘리기」. | `LineUpgrades.offers`: the pad also appears once the restaurant has served `civic.restaurant.tables.meals[level]` meals in all (150 for level 1, 450 for level 2 — the cumulative `served`, already saved). Banner `큰 식당에 손님이 많아요!` (was `…자리가 모자라요!`). | `restaurant.mjs` 11 (new check: 150 meals bring the pad with `busyT` 0). The 46-min save has served 181, so its level-1 pad shows right after the load; level 2 comes ≈ 20 game min later (12–15 meals a minute). |
| F3 | Shot 34: the terrace's back lamp stood over the pad's price (`1,2…`). | `BigRestaurant.tablesPadPos`: the pad stands `L.padOff` (−0.9, +0.5 m) beyond the level's first table spot. | `34_tables_pad.jpg`; `restaurant.mjs` 11 (pad on open ground). |
| F4 | An older save's busy village calls several 창고 직원 one after another: four big banners in six minutes. | `WarehouseCrew.arrive`: one big banner, then a small toast (`crewToast`, `창고 직원이 {n}명이 되었어요`) for arrivals within `warehouse.crew.bannerGap` (300 s). | `porters42` 3 (new check: banners 1, toasts 1, arrivals 2). |
| F5 | The 서빙 직원 2 had no test. | `restaurant.mjs` 13: no pad before plates wait; the pad (1,000) on the staff spot; paying hires a second server who carries plates; a reload brings back exactly two servers and no pad. | 51/51. |
| F6 | Measuring: `probe_rest.mjs`'s "smart chief" (no staff) stood at the register while the register held (3 orders waiting for the kitchen): 5.4 meals a minute, 1.2 walk-outs. | `touch2/probe_rest2.mjs`: the smart chief also goes to the kitchen while the register holds — what the kitchen pad says (`주문 3개 · 여기 서세요`) and the arrow shows. Identical on the base copy (no hold there). Game unchanged. | §2.1: **12.0** meals a minute, 0 walk-outs. |
| F7 | Shot 32 (a staged rush) showed a line at the register and empty seats. A line probe (`touch2/probe_line.mjs`: 16 seats, 2 servers, a guest every 2.2 s, 3 game min) found the head of the line away from the register 88 % of the time (sampled every step; paying 12 %): it was still **walking** to the line (53 %) or stepping up to the register (35 %) — the queue is first come, first served by spawn order, and guests come from different road ends. Never a seat (0 %), never food. | `BigRestaurant` `walk` → `queue`: a guest who reaches the line steps in front of the guests still walking to it. | Same probe: **66 → 93 served in 3 min (22 → 31 a minute)**; head still walking 53 → 35 %; the rest is the step up to the register (49 %) and paying (16 %). The census and bots ran before F7 (it changes the restaurant only). |
| F8 | The 60-min census logged one page error: `WarehousePorter.update` read `outStack` of a job source that had none (the bigger crew made the rare path reachable). A throw there skipped the rest of that frame's village update. | `src/entities/Worker.js` `grab`: such a job is dropped (a raw job's reservation released) and the porter hauls what he holds or goes idle. | `restaurant.mjs` / `porters42.mjs` on the final source (§5); not reproduced on purpose (one in 60 min). |

The 서빙 직원 2 is now **not needed at the natural pace** (§2.3); it stays as an offer that only appears when plates
really wait on the pass.

## 1. Measured first: why the 큰 식당 jams (first build, base copy)

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
- The first build's server probe: 3 of 5 deliveries hit the 12 s timeout, ending 99–205 px from the table; it put this
  down to the four tables' collision circles (r 44) leaving no gap. The finish found the larger blocker underneath:
  the restaurant plot's own foundation circle, active again after the load (§0 F1; the base copy has the same bug).
- Without a server (cashier + cook, chief away) every order taken waits forever: 6 guests a minute sit 70 s and walk out.

## 2. A — restaurant

### 2.1 The fix

- **Site circle** (`src/entities/Site.js`, finish F1): the terrace is open again after a load.
- **Serve points** (`BigRestaurant.servePoint`): the server walks to a free spot beside the seat — ring search r 64 / 80 /
  96 px, 16 directions, not blocked at r 15, nearest to the approach — cached per seat; back-yard seats are reached
  round the terrace by `backPath` and the server comes back by its reverse. A leg ends when he arrives, after 7 s, or
  after 1.2 s stalled near the seat (with F1: never needed in the probe). Plates fly from the tray to the table.
- **Two at a time**: the server loads up to `serverCarry` (2) ready tickets for seats on the same side.
- **Kitchen hold**: with nobody in the kitchen (no cook or no server, and the chief not on the kitchen pad) the register
  takes no new order once `holdTickets` (3) wait; guests wait in the queue instead of at a table they would leave
  unpaid. The kitchen pad says `주문 {n}개 · 여기 서세요`.

After (final source, same probe and save; "no staff" with `probe_rest2.mjs`, F6):

| State | Chief | Served / min | Coins / min | Walk-outs / min | Queue full % | Seated waiting | Seat wait avg / p90 s | Server busy % | Cook busy % |
|---|---|---|---|---|---|---|---|---|---|
| no staff | smart, follows the kitchen sign | 13.2 → **12.0** | 326 → 274 | 0 → 0 | 1 → 0 | 0.1 → 0.1 | 1.3 → 1.0 / 2.2 | – | 30 → 30 |
| no staff | smart, ignores the sign (old policy) | 13.2 → 5.4 | 326 → 130 | 0 → 1.2 (+0.4 leave the line) | 1 → 42 | 0.1 → 1.6 | 38.4 / 70 | – | 11 |
| cashier | kitchen | 12.0 → **12.4** | 322 → 291 | 0 → 0 | 4 → 0 | 0.1 → 0 | 0.9 → 0.8 / 1.7 | – | 30 → 32 |
| cashier + cook | kitchen | 12.0 → **11.2** | 265 → 278 | 0 → 0 | 2 → 0 | 0.1 → 0.1 | 1.5 → 1.3 / 2.7 | – | 36 → 35 |
| cashier + cook | away (no server) | 0 → 0 | 0 | 6.0 → **2.4** (+0.4 leave the line) | 58 → 86 | 6.9 → 2.8 | 70 | – | 15 → 8 |
| all three | away | 4.0 → **12.0** | 84 → **275** | 2.2 → **0** | 55 → **0** | 6.2 → **0.3** | 57.5 → **2.4 / 4.3** | 100 → 66 | 18 → 35 |
| **all three (designer's case)** | **away, natural** | **3.8 → 12.0** | **96 → 281** | **2.0 → 0** | 65 → **0** | 6.2 → **0.4** | **59.7 → 2.6 / 5.2** | **100 → 66** | 17 → 38 |

(The first build, without F1: designer's case 12.2 a minute, queue full 7 %, seat wait 11.6 / 18.7 s, server 90 %.)
The table was measured before F7 (line order). The designer's case again on the final source: **12.0 served a minute**,
243 coins (the dish / combo mix is random: 281 in the run above with the same 12.0 served), 0 walk-outs, queue full 0 %,
seated waiting 0.2, seat wait **1.7 / 4.5 s**, server 69 %, cook 35 %. Level 2 with one server on the final source:
**17.0 a minute**, 407 coins, 0 walk-outs, seat wait 3.4 / 5.7 s, server 87 %, 4.8 of 16 seats busy on average (§2.2).
The staffed restaurant now serves what arrives (≈ 12 guests a minute at 8 seats: `spawnEvery` 5 s plus visitors):
`frontNoSeat` 0 % — the line never waits for a seat. Differences of ±1 a minute between the staffed states are the
arrival noise of 5-minute runs.

### 2.2 테이블 늘리기 (2 levels)

- **When** (`LineUpgrades`, finish F2): `busyT` — seconds the head of the line waited for a seat while the kitchen
  worked (≤ 3,600, saved) — reaches `tables.offerS` (60), **or** the restaurant has served `tables.meals[level]` meals
  in all (150, then 450). A pad `tables1` / `tables2` (kind `upgrade`, label `테이블 늘리기`) appears just beyond where
  the next two tables go (`L.padOff`, F3), banner `큰 식당에 손님이 많아요!` / `식당 뒤뜰에 테이블을 늘릴 수 있어요`.
- Level 1 (1,200): tables at world (−799, 731), (−709, 685); level 2 (2,000): (−876, 692), (−786, 647) — behind the
  terrace (up the screen), off the roads (nearest road 525 px), on open ground. Lamp 1 moves to (−686, 638); a lantern
  string per level; tables pop in with a cheer, banner `테이블이 늘었어요! 자리 {n}개`, news `news_tables`.
  Existing art only (`picnic_table`, lantern string, lamp): no new texture, no new page.
- Seats in the back yard carry a path (via (−620, 880), (−590, 790), (−640, 715)); guests walk it with collision,
  sit, eat and leave by the reverse; the server uses the same way round. Seats fill front first.
- Guests come a little more often with more seats: interval × (8 / seats)^`seatsPull` (0.5) — 16 seats ≈ 1.41× guests.

| Designer's case (all three staff, chief away, natural pantry) | Seats | Served / min | Coins / min | Walk-outs / min | Seated waiting | Seat wait avg / p90 s | Server busy % |
|---|---|---|---|---|---|---|---|
| level 0 | 8 | 12.0 | 281 | 0 | 0.4 | 2.6 / 5.2 | 66 |
| level 1 | 12 | **15.4** | **360** | 0 | 0.7 | 3.7 / 6.9 | 77 |
| level 2, one server | 16 | **16.6** | **392** | 0 | 0.8 | 3.4 / 6.6 | 86 |
| level 2 + 서빙 직원 2 | 16 | 16.6 | 382 | 0 | 0.4 | 2.2 / 4.1 | 63 + 42 |

(First build, without F1: level 1 11.2, level 2 one server 10.2 with 0.4 walk-outs and a 26.6 s seat wait.)

**What the tables buy now.** With the server reaching every seat, seats are rarely the limit at the natural pace:
seats busy on average 3.3 of 8 (level 0), 4.3 of 12 (level 1), 4.7 of 16 (level 2); `frontNoSeat` 0 % in all three.
The +3.4 / +4.6 meals a minute come from `seatsPull` (more seats draw guests 1.22× / 1.41× as often), not from guests
who found no seat. The upgrade works as "a bigger restaurant draws more guests"; whether that is what the designer
wants from 「테이블 늘리기」 is open (§10). In a staged rush (a guest every 2.2 s) the line, not the seats, sets the pace:
it waits on its head walking up to the register (F7), and part of the 16 seats stays empty (shot 32).

### 2.3 서빙 직원 2 (re-measured: not needed at the natural pace)

The first build measured 16 seats with one server as the limit again (seat wait 26.6 s, walk-outs 0.4 a minute) and
added the hire pad. With F1 one server keeps up with 16 seats (86 % busy, 3.4 s wait, 0 walk-outs); a second one only
shortens the wait to 2.2 s and serves the same 16.6 a minute. The offer is kept as a safety valve because it is
self-limiting: `서빙 직원 2 고용` (1,000, kind `hire`, at the staff spot) appears only once tables ≥ 1, a server exists and
`serveWaitT` — seconds with ≥ 2 ready plates on the pass while the server is out — reaches `server2.offerS` (60).
In the natural runs the pass held 0.45 ready plates on average (level 2, one server), so it rarely or never appears;
a train-visitor rush can bring it. Post beside the pass, look seed 7331, restored after the first server on load.

### 2.4 Income

Restaurant, designer's case: **96 → 281 coins a minute** at level 0 (+185), **360** at level 1, **392** at level 2
(+296). The late village earns ≈ 2,400 a minute (base census), so the restaurant adds ≈ **+8 %** of village income at
level 0 and ≈ +12 % at level 2. Prices are unchanged; the knob if it is too much is `civic.restaurant.dishMult` (1.3).
Late-village census: §3.3.

## 3. B — porters

### 3.1 짐꾼 2 on the three lines that lacked it (`src/systems/LineUpgrades.js`)

- `P2_LINES` adds `toolsmith` (대장간 → `cat_tools`), `cannery` (통조림 공장 → `item_can`), `dock` (배 창고 →
  `item_fish_raw`); costs 700 / 700 / 500; the pad stands by the line's door (통조림: 88 px from the outPad, open ground).
  The dock's 짐꾼 2 needs the dock's own goods porter (`porter_dock`) — see §10 for the parallel dock fix.
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
  ≈ 480 a minute when the 창고 is built (35 min, `base35_10`) → 4; ≈ 590 in the 46-min village (`base60`) → 6, the cap.
  A K-only rule `rate / K` sat at the cap from the first minute, because the making saturates around 480–600.
- One arrives at a time, at most every `crew.every` (60 s), free: spawned at the nearest way into the village
  (`w_gate_n`, `w_gate_m`, `gate`, `v_link_w` once the rail is open) that is off screen, fades in, walks the roads to
  his place (`WarehousePorter.homeFor`: two rows beside the door; snapped home after 180 s if stuck). Banner
  `창고 직원이 한 명 더 왔어요` / `마을이 바빠져서 창고 직원이 {n}명이 되었어요` — at most one per `crew.bannerGap` (300 s),
  a toast `창고 직원이 {n}명이 되었어요` in between (F4) — a line in the next 서리 소식 (`news_crew`), event
  `crewArrived`, a save.
- Never removed (no flapping); restored at the 창고 at once after a load. An older save with no crew field starts at 2,
  a save with `crew.n` keeps that many, and both grow again from their own making.

### 3.3 Census: does it carry more? (late village)

`review_gameplay_census.mjs` from the v4.1 46-min save, the census bot (collects, sells, buys what it can), a sample
every 10 s. Base = HEAD 3236722 copy (`v42touch/census/base60`, ran 41 game min before the machine stopped it);
after = the final source minus F7 / F8 (`touch2/census/after60`, 60 game min). Same window, `cmp.mjs`:

| 46-min save | base, 0–41 min | after, 0–41 min | after, 0–60 min |
|---|---|---|---|
| income / min | 2,403 | **2,754** (+15 %) | 2,661 |
| income / min without the 큰 식당 | 2,318 | 2,403 (+4 %) | 2,304 |
| made / min (raw + goods) | 302 + 297 | 315 + 314 (+5 %) | 317 + 313 |
| 창고 crew | 2 | 3 at 1 min, 4 at 2, 5 at 3, **6 at 5.7 min** | 6 (idle 5 %) |
| output ≥ 80 % full: grill · sawmill · bakery · smelter · smokehouse · toolsmith · cannery | 61 · 5 · 53 · 29 · 48 · 43 · 7 % | **43 · 0 · 19 · 20 · 40 · 20 · 5 %** | 45 · 0 · 14 · 21 · 40 · 19 · 3 % |
| any raw pile ≥ 90 % (fish · log · wheat · ore · meat) | 98 % (60 · 7 · 15 · 64 · 88) | 95 % (46 · 11 · 9 · 63 · 83) | 94 % (46 · 8 · 6 · 64 · 78) |
| market shelf empty: bread · smoked meat · grilled fish | 0 · 19 · 0 % | 13 · 19 · 0 % | 13 · 18 · 0 % |
| 창고 stock avg | 150 | 143 | 162 |
| train surplus exported | 466 | 400 | 659 |
| building sites waiting for material (avg) | 0.14 | 0.14 | 0.10 |
| 큰 식당 served · coins · walk-outs / min | 3.9 · 85 · 2.2 | **15.3 · 351 · 0** | 15.6 · 357 · 0 |

- The bot bought 「테이블 늘리기」 level 1 at 8 min and level 2 at 20 min (the 46-min save has served 181 meals, so the
  level-1 pad is up at the load: F2).
- **Goods leave the lines**: the time an output stands ≥ 80 % full falls by a third to two thirds (bakery 53 → 19 %,
  toolsmith 43 → 20 %), and the village makes 5 % more. Three quarters of the income gain is the 큰 식당.
- **Exports fell 14 % in the 41-min window**: the train exports *surplus* — grilled fish, bread and smoked meat among it —
  and the 큰 식당 now uses ≈ 11 more dishes a minute of the same goods, at 1.3× (dish) / 1.6× (combo) of the sale
  price instead of `freight.exportRate`. In the first 30 minutes exports were higher (230 → 270); they follow the
  train's timetable, so a 41-min window is noisy.
- **Raw piles stay full** (94–95 % of the time some pile is ≥ 90 %): the stations cannot use more — the demand side,
  which is the next version (`docs/logistics_plan.md`), not carrying.
- One page error in the 60 minutes (`WarehousePorter.update` reading `outStack` of a job whose source had none) — the
  finish guards it (F8).

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

The finish adds no field (`tables.meals` reads the `served` count the save already keeps). Found by the first build's
tests: `sanitizeC1` / `sanitizeV42` (`src/core/Save.js`) dropped these fields on load; both keep them. v4.1 and v4.2
saves load unchanged (§5).

## 5. Tests

Final source (with F7 / F8) unless noted; logs in `touch2/final/` (earlier runs in `touch2/suites/`).

| Suite | Result | Notes |
|---|---|---|
| `restaurant.mjs` | **51/51** | steps 11 (meals trigger: 150 meals bring the pad with `busyT` 0; pad on open ground) and 13 (서빙 직원 2) new in the finish |
| `porters42.mjs` | **21/21** | step 3 new: one banner, a toast for the next arrival within 300 s |
| `v4.mjs` | **46/46** | re-run on the final source (also 46/46 before F7) |
| `smoke.mjs` | **53/53** | the first two tries stopped at their first `page.screenshot` (30 s timeout, load average ≈ 28 on 4 cores; the parallel agents' smoke runs failed the same way) |
| `v3.mjs` | **18/18** | same screenshot timeout on the first try |
| `plots.mjs` | **34/34** | (first try 3/4: screenshot timeout) |
| `v42_guide.mjs` | **6/6** | |
| `save_v42.mjs` | all passed | |
| `save_v2` · `save_v3` · `save_v35` · `save_v4` (Node part) | PASS ×4 | migration + sanitize |
| `save_v4.mjs --browser` | **PASS (52 checks)** | the four v3.5 fixtures (0.5 / 12 / 21 / 38 min) boot, keep coins / steps / residents, save again as v7; 20 corrupted v4 blocks boot; reloads mid-founding / mid-train / mid-ceremony; 67 min wall under load (a first try was stopped by me during the slow 20-boot step) |
| `v42.mjs` | 34 of 35 | the one failure is a wall-clock check, "office panel opens in < 100 ms": 104.4 ms at load average ≈ 28 (the touch changes nothing in the office or its panel); office, courier, bank, reveal, aide, depot, freight all pass |
| `labour.mjs` · `pickup.mjs` · `nav.mjs` | 28/28 · 31/31 · 12/12 | before F7 / F8 (neither touches them) |
| `pilot.mjs` | 9 of 10 | before F7 / F8: the 30-min 관망 soak passed every check; the arrow-only reference run's renderer closed at its start, so "관망 income ≥ 80 % of arrow-only" was not evaluated (pilot earned 61,134 in 30 min) |
| Node: `bank42` 18 · `depot` 26 · `depot_parity` 10 · `ledger` 20 · `letters` 23 · `pilot` 45 · `rail42` 58 · `roadnet` 32 · `walls42` 6 · chat 9 files (78) | all pass | final source |
| `balanceCheck` | 0 warnings | `tables.meals`, `crew.bannerGap` ranged |

Tests regenerate committed preview images (`docs/previews/screens_v3`, `screens_v35`, `screens_v4`, `screens`): those
were restored to HEAD; only `docs/previews/screens_v42/31–36` change.

## 6. Pacing bots (fresh game until 읍)

Fresh game, fixed step, `review_gameplay_sim.mjs --v4 --upg greedy --after 20` (as the v4.2 verify,
`docs/build_reports/v42_code2.md` §9.2); game minutes. Finish runs on the final source minus F7 / F8 (they touch the
restaurant line and a rare porter path; the bots do not wait on either), started 17:16 / 18:55 after the first pair
lost its renderers to the memory cgroup.

| Run | 5 shops | 읍 | longest wait after tower_east | 사무실 · 은행 · 물류창고 | stuck · errors |
|---|---|---|---|---|---|
| smart, v4.2 verify (no touch) | 38.6 | 47.3 | 3.35 at 47.3 | 57.2 · 62.4 · 59.1 | 0 · 0 |
| smart, first build | 38.6 | 44.8 | – (renderer lost after 읍) | – | 0 · 0 |
| **smart, finish** | **38.0** | **45.0 (−4.9 % vs verify)** | 3.33 at 47.8 | **51.9 · 53.2 · 57.6** | 0 · 0 |
| arrow-only, v4.2 verify (no touch) | 40.9 | 51.5 | 6.52 at 59.8 | 53.2 · 56.1 · 59.8 | 0 · 0 |
| arrow-only, first build | 39.1 | 48.0 | – (renderer lost after 읍) | – | 0 · 0 |
| **arrow-only, finish** | **38.7** | **48.3 (−6.2 % vs verify)** | 2.87 at 58.8 | **49.8 · 53.8 · 55.4** | 0 · 0 |

The gate (읍 ≤ +3 %) holds: 읍 comes no later than without the touch (one run each). The 큰 식당 opens at 29.7 min in the smart run, so its faster service counts for the last 15 minutes.

## 7. Performance

First build, `probe/probe_perf.mjs`: the 46-min save in one browser, 3 batches of 400 logic-only steps per view, first
with the crew of 2 and 8 seats, then crew 6, level 2 tables and the 서빙 직원 2 (loaded machine: only the component
times are worth reading).

| View | crew · seats | 창고 직원 update, ms a step (3 batches) | 큰 식당 update, ms a step | display objects |
|---|---|---|---|---|
| 창고 | 2 · 8 | 0.16 · 0.34 · 0.20 | (0.44 · 0.94 · 0.81) | 1,211–1,468 |
| 큰 식당 | 2 · 8 | (0.33 · 0.49 · 0.17) | 1.00 · 0.72 · 0.39 | 1,558–1,578 |
| 창고 | 6 · 16 | 0.61 · 0.26 · 0.48 | (0.78 · 0.67 · 0.43) | 1,657–1,690 |
| 큰 식당 | 6 · 16 + server 2 | (0.28 · 0.62 · 0.42) | 0.54 · 0.67 · 0.59 | 1,770–1,800 |

- 창고 crew: ≈ 0.1 ms a porter a step on that machine (2 → 6: +0.3 to +0.5 ms); the cap stays at 6.
- 큰 식당: no measurable change with 16 seats and two servers (serve points are cached per seat).
- Display objects: the new things are ≈ 35 (4 porters with shadow and stack, 4 tables, 2 lantern strings, a server).
- The finish adds no display object and no per-step work (F1 makes fewer collision circles active after a load; F4 is a
  toast instead of a banner; F7 scans the line of ≤ 6 guests once when a guest reaches it).
- **Textures: none new.** The back-yard tables, lanterns and lamp are the terrace's own props; the new 창고 직원 use the
  porter looks already resident; the 서빙 직원 2 uses `npc_clerk_b`, a clerk look the village loads at the start. No new
  pack page, no new file: the texture tour and the artifact file count are as in the v4.2 verify (tour peak 451.4 MiB,
  413 files). The artifact was **not** rebuilt in the finish (the lead's instruction).

## 8. Screenshots (`docs/previews/screens_v42/`, 390 × 844, DPR 3, Korean)

`tools/test/shots_v42_touch.mjs` on the final source (30 on the base copy, first build). 31–33 stage a rush (a guest
every 2.2–2.6 s, about twice the natural pace) in one run; 34–36 in a run of their own (`--only 34,35,36`: 31–33 leave
tables at level 2 and a bigger crew behind). Each picture was looked at; what was wrong was fixed and re-shot.

| Shot | Shows | Looked at / fixed |
|---|---|---|
| `30_restaurant_busy_before` | base copy: the terrace full, every guest waiting for food, a long line | (first build) |
| `31_restaurant_tables_lv1` | level 1 by day: 12 seats, 10 taken, 5 eating; the 서빙 직원 2 pad (1,000) at the staff spot after the rush | was a night shot like 33 (the save loads in the evening): `__day()` sets 10:00 |
| `32_restaurant_tables_lv2` | level 2 + 서빙 직원 2 by day: back-yard tables in use, part of the 16 seats free, the line full at the register | the earlier take showed the line with walkers ahead — F7; the rush still fills the line (the head walking up), seats stay free (§2.2) |
| `33_restaurant_tables_night` | night: lantern strings and lamps over the back yard, guests eating | now the only night shot |
| `34_tables_pad` | the 「테이블 늘리기」 pad (1,200) just behind the next tables' spot; banner `큰 식당에 손님이 많아요!` | lamp over the price (F3); the meals trigger had already shown the pad at the load, so the scene re-raises it; camera 50 px lower (360 × 640: the banner covered the label) |
| `35_porter2_cannery_pad` | the 통조림 짐꾼 2 pad (700) by the cannery door; banner `통조림이 쌓여요` | ok |
| `36_warehouse_crew_arrives` | a new 창고 직원 walking in from the west road to the 창고; banner `…창고 직원이 3명이 되었어요` | ok (the earlier combined run showed crew 5 from 31–33) |

360 × 640 (`touch2/shots_final/*_360x640.jpg`, `touch2/shots360/p2pad_*.jpg`, not committed): 34 — the banner's second
line covered the pad label, so the scene's camera moved down 50 px (both sizes re-shot; the price sits under the pad's
own "you can afford it" sparkle at that moment, as in the game); 36 ok; the 대장간 and 통조림 짐꾼 2 pads (`probe_p2pads`)
clear of the HUD.

## 9. Files

| File | Change |
|---|---|
| `src/entities/Site.js` | (finish F1) a `done` site's foundation circle stays off when the site is shown again (every load) |
| `src/entities/BigRestaurant.js` | serve points, back path, two-ticket server legs, kitchen hold + label, tables levels (layout `more`, lamp move, lanterns, seats with paths), `busyT`, server 2 (post, look, `serveWaitT`), seat pull, save fields, `state()` / `where()` additions; (finish F3) `padOff`; (finish F7) arrivals step in front of guests still walking to the line |
| `src/systems/LineUpgrades.js` | restaurant offers (`tables1/2`, `srv2`), 짐꾼 2 for 8 lines, `porterWaits`, `MAX_P2`, banners, done hooks; (finish F2) the meals trigger |
| `src/systems/WarehouseCrew.js` (new) | the 창고 crew system; (finish F4) `bannerGap` + toast |
| `src/systems/v42/index.js` | registers `crew` |
| `src/entities/Worker.js` | `WarehousePorter.homeFor`, the `arrive` state; (finish F8) the `grab` guard |
| `src/scenes/Game.js` | `noteMade`, test hook `restTablesPad` |
| `src/systems/Labour.js`, `src/entities/Station.js`, `Workshop.js`, `Boathouse.js` | count what is made |
| `src/systems/VillageNews.js` | `news_crew`, `news_tables` |
| `src/core/Save.js` | keeps the new `c1.rest` / `v42` fields |
| `src/data/balance.js`, `balanceCheck.js` | the numbers (Korean comments) and their ranges; (finish) `tables.meals`, `crew.bannerGap` |
| `src/data/strings.js` | 14 keys, ko + en; (finish) `crewToast`, `tablesBanner` reworded |
| `tools/test/restaurant.mjs` | steps 6b, 10, 11, 12; (finish) 11 meals trigger, 13 서빙 직원 2 |
| `tools/test/porters42.mjs` (new) | 짐꾼 2 lines, crew rule, arrival, no flapping, cap, save / reload; (finish) banner / toast |
| `tools/test/shots_v42_touch.mjs` (new) | screenshots 30–36 (`--repo` for the before shot); (finish) 31–32 by day (`__day`), 34 re-raises the pad the meals trigger already showed |
| `tools/test/review_gameplay_census.mjs`, `review_gameplay_sim.mjs` | made / crew / 짐꾼 2 / restaurant columns |
| docs | `기획서_v4_2_촌장.md` §13, `v42_plan.md` §19 (+ §19.5 finish), this report |

## 10. Open issues

1. **Raw piles stay full** (some pile ≥ 90 % in 94–95 % of the census): the stations cannot use more raw. Carrying is
   no longer the limit for goods (outputs ≥ 80 % full fell by a third to two thirds); raw needs demand — the next
   version (`docs/logistics_plan.md`), not this touch.
2. **F1 touches every building, not only the 큰 식당.** Every finished site re-activated its foundation circle after a
   load; shop lines, porter paths and pads near any building were a little tighter after every reload. The parallel
   fixes (잡화점 store, 선착장 dock porter, `wt42fix` / `dock_investigation/wtfix` / `v42fixes/wthall`) measured on
   trees without F1 may see different numbers once merged.
3. **「테이블 늘리기」 sells guests, not seats** (§2.2): with the server fixed, 8 seats are rarely full (3.3 busy on
   average); the level gains come from `seatsPull`. Designer decision: keep it as "a bigger restaurant draws more
   guests", or give the tables another effect.
4. **배 창고 짐꾼 2 needs the dock's goods porter** (`porter_dock`), which the parallel dock fix adds; without it the
   dock line never offers its 짐꾼 2.
5. **서빙 직원 2 is rarely offered** at the natural pace (0.45 plates on the pass on average); it appears in a rush
   (shot 31). It costs nothing to keep.
6. **Train exports fell 14 % in the 41-min census window** (466 → 400): the 큰 식당 now serves ≈ 11 more dishes a minute
   from the same goods at a better price. Income is +15 %.
7. **Rush pace**: with 16 seats and two servers the line, not the seats, sets the pace in a rush (≈ 31 a minute,
   F7); the head of the line walking up to the register is the remaining wait. Natural pace (12–17 a minute) is far
   below it.
8. An older save calls 창고 직원 one a minute up to 6 (one banner, then toasts); `warehouse.crew.every` if too fast.
   The 창고 is near the west gate, so a new hand's walk can be short (1–2 s) when the chief is away from it.
9. The 서빙 직원 2 pad label can sit under the zoom buttons when the restaurant is at the right screen edge (move the
   view).
10. Not re-run in the finish: the `pilot` reference (arrow-only income on the 46-min save: its renderer closed at the
    start; the 9 관망 checks passed), the artifact build, texture tour and `test_deploy` (no new texture or file; the
    lead rebuilds). The census ran before F7 / F8 (restaurant line order, porter guard).
11. 마을회관 explanation, 잡화점, 선착장 짐꾼 and the board are other agents' work in their worktrees (not here).
