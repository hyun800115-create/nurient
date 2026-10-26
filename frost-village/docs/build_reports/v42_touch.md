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

**Integrated fixes (2026-10-26, §11):** the three designer bug fixes built in parallel (잡화점 store line / supply,
선착장 생선 짐꾼, 마을회관 board where-to-bring + 길 안내) are merged into this tree; one overlap with the touch (the growing
창고 crew emptying the forge's runs) was found by measurement and resolved (`WarehousePorter.leaveToOwnPorter`). The
full suite list, both save fixture sets, a new 60-min census and both pacing bots ran on the merged tree.

**Verify (2026-10-26, §13): ship with known issues.** All final-review repros pass on the final source; the exact
three-publish procedure (with the 125 stale paths as null in the first, capabilities `{ sample: {} }`) is in §13.9.

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
   load; shop lines, porter paths and pads near any building were a little tighter after every reload. (Merged: the
   parallel fixes were re-measured on the merged tree — §11.3.)
3. **「테이블 늘리기」 sells guests, not seats** (§2.2): with the server fixed, 8 seats are rarely full (3.3 busy on
   average); the level gains come from `seatsPull`. Designer decision: keep it as "a bigger restaurant draws more
   guests", or give the tables another effect.
4. **배 창고 짐꾼 2 needs the dock's goods porter** (`porter_dock`). (Merged: the 생선 짐꾼 now comes with the rowboat —
   §11.2 I3.)
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
11. 마을회관 explanation, 잡화점, 선착장 짐꾼 and the board: merged — §11.

## 11. Integrated fixes (2026-10-26)

The three designer bug fixes built in parallel against `3236722` (scratch `v42fixes/`: `store.diff`, `dock.diff`,
`hallboard.diff`) are merged into this tree on top of the finished touch. Nothing is committed. Designer text:
`docs/기획서_v4_2_촌장.md` §14 (+ `docs/기획서_v4_2_마을회관.md` from the board fix). Evidence:
`/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/integ/` (`suites/`, `node/`,
`probes/`, `census/`, `bots/`, `shots/`, `tools/`).

### 11.1 What was merged

| Patch | Designer report | Change (files) |
|---|---|---|
| `store.diff` | "잡화점 판매원있는데 판매를 안해 사람들도 거기로 못가는건지" | `Game.storeLine`: a line place on a pine / the fog edge moves to the nearest free spot after the place before it (6 places kept; w_m2 3, e_m1 2, e_m2 1 places were unreachable) · `Seller.slotPos` reads `cfg.slots` · store customers (line + leaving) are x-ray subjects (`Occlusion`) · `Workshop.pickTool`: for the shop the forge keeps forging the kind already on its pad while the shop has room, a new run starts at the kind after the last one (`lastRun`) · '판매대가 비었어요' over the shelf after `customers.emptyCueS` (4 s) of a customer waiting at an empty shelf (`Seller.emptyCue`, one lazily created label) · test `store42.mjs` |
| `dock.diff` | "위에 어선은 있는 선착장은 짐꾼이 없는건가 여기 생선이 그대로야" | `Progression.COMES_WITH = { boat_rowboat: ['porter_dock'] }`: buying the rowboat hires the 생선 짐꾼 (his 600-coin side pad, which no arrow pointed at, is gone; a part-payment is refunded); a save with the boat but not him gets him on load (one refund, none on reload) · banner sub / build-menu line · test `dockporter.mjs` |
| `hallboard.diff` | "마을회관 오늘의 부탁 … 통조림 내가 가져다 줘도 안 들어가지네" | `TownHall.whereOf` / `housePlot` / `guideTo`: every request row says where its goods go (`→ 서리역 짐 싣는 곳`, pantry, food box, empty house plot) and a tap starts the 길 안내 there (`Navigator.pin`: empty bag allowed; ends on arrival, when the request is met, on a long press, or after `v42.nav.pinMaxS` 240 s) · board rows in `UIv4.openBoard` · the hall itself accepts nothing (one receiving place per thing, no new save slot, nothing left lying at the hall) · `docs/기획서_v4_2_마을회관.md` (also answers "does the hall level up": no — the village rank rises at the 승격식: people 45, shops 5, happy 80, 11,000 coins) · test `hallboard.mjs` |

**Textual overlaps.** All three applied with plain `git apply` on the touched tree (offsets only, no rejects). The files
both sides edit — `Game.js` (touch: `noteMade`, `restTablesPad`; store: `storeLine`), `Workshop.js` (touch: `noteMade`
in `process`; store: `pickTool` runs, `lastRun`), `strings.js`, `balance.js`, `balanceCheck.js` — are touched in
different places. `balanceCheck` 0 warnings; ko / en string keys identical (no key only in one language, each new key
defined once per language); eslint (`no-undef`, `no-dupe-keys`, `no-redeclare`) 0 errors.

### 11.2 Semantic overlaps and how they were resolved

| # | Overlap | Finding | Resolution |
|---|---|---|---|
| I1 | **Store fix's forge runs × touch's growing 창고 crew** | Measured, not guessed: on the merged tree the 46-min save's tool porter carried **4.8 tools a trip** (store fix alone: 9.0) and the shop made **463 coins a minute** (store fix alone: 557). The crew's overflow rule (`WarehousePorter.think` rule 2: any output ≥ `warehouse.overflowAt` 60 % goes to the 창고) took half of each run into the 창고 before the porter came back (55 s round trip, 3,079 px); with the touch the crew grows to 5–6 and is free to do it. A runtime experiment that kept the crew off the forge's pad while the next tool still fits brought it back (9.1 a trip, 593 coins). | `WarehousePorter.leaveToOwnPorter(s)` (`src/entities/Worker.js`): the crew skips the forge's pad (`recipe.out === 'tool'`) while it has a porter of its own and the next tool still fits; a full forge (about to stop) or one without a porter is taken as before. Other outputs keep the touch's 60 % rule. Korean note on `warehouse.overflowAt` in `balance.js`. New `store42.mjs` check ("the 창고 crew leaves the forge's run to the 도구 짐꾼 unless the forge is full"; also wraps the crew's planner for 5 game minutes: 0 forge jobs while the pad had room). |
| I2 | Store fix's can supply × touch's 짐꾼 2 on the cannery / forge lines | Complementary: the store fix added no can porter on purpose and relied on the touch's 짐꾼 2. On the merged tree the crew also delivers cans straight to the shelf when it empties (40 cans in 8 min), so buying both 짐꾼 2 changes little on the 46-min save (591 vs 619 coins a minute — one 8-minute run each, ±5 % is noise). With two tool porters each takes ~4 a trip (they split the runs). | None needed. |
| I3 | Dock fix × touch's dock 짐꾼 2 | Touch open issue 4 ("the dock's 짐꾼 2 needs `porter_dock`") is closed by the merge: once the rowboat is bought the dock line always has its goods porter, so `LineUpgrades` can offer `p2_dock`. With the 생선 짐꾼 the pier rarely fills, so the offer stays rare. Bots: the 생선 짐꾼 arrives with the rowboat at 29.2 / 29.9 min (touch finish: bought at 29.4 / 30.0). | None needed. |
| I4 | Touch F1 (site circle after a load) × store fix's line places | `storeLine` runs inside `Site.finish → makeStore`, after `finish` turns the site circle off, in fresh play and on a load alike, so the places are computed against the real collision. Before F1 a load re-activated the circle afterwards and could cover line places in play; F1 removes that. | None needed; `store42` reload check (w_m2 keeps its 6 bent places) passes. |
| I5 | Board fix × touch's restaurant | The board's pantry row leads to `pantryPad`, which the tables upgrade does not move. No shared code. | None. |
| I6 | Saves | Neither fix adds a save field. The dock fix writes `progress.done.porter_dock` and clears `progress.paid/got.porter_dock` (existing fields). v7 unchanged. | — |

### 11.3 Numbers on the merged tree

**잡화점** (`storeprobe.mjs`, 46-min smart save s46, store on w_m2, 8 game minutes, chief parked; tools per trip =
tools carried ÷ trips over all 도구 짐꾼 trips; tools / cans a minute = delivered to the shelf by anyone):

| Run | sales/min | coins/min | shelf empty | front stalled | tool shelves empty | tools/min | tools a trip | cans/min |
|---|---|---|---|---|---|---|---|---|
| v4.2 (`3236722`) | 8.63 | 402 | 56 % | 77 % | 85 % | 4.8 | 3.0 | 15.3 |
| store fix alone (on `3236722`) | 9.63 | 557 | 50 % | 71 % | 55 % | 9.4 | 9.0 | 13.8 |
| merged, before I1 | 9.25 | 463 | 63 % | 76 % | 87 % | 6.4 | 4.8 | 15.8 |
| **merged, final** | **11.25** | **619** | **45 %** | **65 %** | 84 % | **9.1** | **8.3** | **19.4** |
| merged, final + 짐꾼 2 (cannery, forge) | 11.13 | 591 | 44 % | 66 % | 67 % | 9.0 | 4.1 | 16.4 |
| s46 without 생선 짐꾼: v4.2 | 4.00 | 249 | 89 % | 93 % | 93 % | 4.5 | 3.1 | 4.9 |
| s46 without 생선 짐꾼: store + dock fixes alone | 8.75 | 495 | 66 % | 78 % | 81 % | 7.9 | 7.8 | 12.3 |
| **s46 without 생선 짐꾼: merged, final** | **10.25** | **525** | 48 % | 69 % | 76 % | 7.5 | 6.8 | 16.4 |

The tool shelves still read empty most of the time at this sampling (5 s) because tools sell as they land (≈ 9 a
minute delivered, ≈ 9 sold); more tools need more ingots / planks — the demand plan's job.

**선착장** (`dockprobe.mjs`, s46 with `porter_dock` removed from the save, 6 game min, the pier's catch pad of 30):

| Run | pile avg / max | ≥ 90 % full | fish taken from the pier | fish reaching the cannery | boat waiting to unload |
|---|---|---|---|---|---|
| v4.2 | 20.5 / 30 | 32 % | 29 (창고 crew) | 0 | 11 % |
| dock fix alone | 1.1 / 4 | 0 % | 57 (생선 짐꾼) | 50 | 4 % |
| **merged** | **0.8 / 5** | **0 %** | **52** (생선 짐꾼) | **51** | **4 %** |

**Late village** (`review_gameplay_census.mjs`, the 46-min save, smart bot, fixed step, the final merged source;
compared with the touch finish's census `touch2/census/after60`; the store and pier columns are new in this census tool —
the touch's run has no store column). The first merged census was stopped at 44 min when I1 was found
(`integ/census/integ_pre40`: income 2,846 a minute, store 548 coins a minute) and re-run on the final source:

| 46-min save | touch finish, 41 min | **merged, 41 min** | touch finish, 60 min | **merged, 60 min** |
|---|---|---|---|---|
| income a minute | 2,754 | **2,864 (+4 %)** | 2,661 | **2,878 (+8 %)** |
| 큰 식당 served · coins · walk-outs a minute | 15.3 · 351 · 0 | 16.4 · 360 · 0 | 15.6 · 357 · 0 | 16.8 · 363 · 0 |
| 잡화점 sales · coins a minute | – | 10.8 · 554 | – | 10.7 · 567 |
| 잡화점 shelf empty · front stalled | – | 47 % · 42 % | – | 49 % · 44 % |
| pier catch pad avg · ≥ 90 % (the save has its 생선 짐꾼) | 1.8 · 0 % | 1.9 · 0 % | 1.9 · 0 % | 1.6 · 0 % |
| outputs ≥ 80 %: bakery · toolsmith · smelter · grill | 19 · 20 · 20 · 43 % | 9 · **3** · 16 · 48 % | 14 · 19 · 21 · 45 % | 8 · **2** · 15 · 48 % |
| any raw pile ≥ 90 % | 95 % | 92 % | 94 % | 93 % |
| made a minute (raw + goods) | 315 + 314 | 325 + 324 | 317 + 313 | 327 + 323 |
| 창고 crew first → last · idle | 2 → 6 · 6 % | 2 → 6 · 17 % | 2 → 6 · 5 % | 2 → 6 · 21 % |
| train surplus exported | 400 | 310 | 659 | 828 |
| page errors | – | – | 1 (before F8) | **0** |

The forge no longer stands full (toolsmith output ≥ 80 %: 19–20 → 2–3 %): its runs leave with the tool porter, and
the crew, kept off the forge's pad, idles more (5–6 → 17–21 %). Raw piles stay full as before (the demand plan).

**Pacing bots** (fresh game, fixed step, `review_gameplay_sim.mjs --v4 --upg greedy --after 20`; game minutes; the
gate is 읍 ≤ +3 % of the v4.2 verify). Both ran on the merged tree before I1 (it changes only who empties the forge's
pad after the 창고, 33 min in; the bots do not wait on the forge).

| Run | 5 shops | 읍 | longest wait after tower_east | 사무실 · 은행 · 물류창고 | stuck · errors |
|---|---|---|---|---|---|
| smart, v4.2 verify | 38.6 | 47.3 | 3.35 at 47.3 | 57.2 · 62.4 · 59.1 | 0 · 0 |
| smart, touch finish | 38.0 | 45.0 | 3.33 at 47.8 | 51.9 · 53.2 · 57.6 | 0 · 0 |
| **smart, merged** | **39.2** | **44.7 (−5.6 %)** | 4.46 at 44.8 | **50.5 · 52.1 · 56.1** | 0 · 0 |
| arrow-only, v4.2 verify | 40.9 | 51.5 | 6.52 at 59.8 | 53.2 · 56.1 · 59.8 | 0 · 0 |
| arrow-only, touch finish | 38.7 | 48.3 | 2.87 at 58.8 | 49.8 · 53.8 · 55.4 | 0 · 0 |
| **arrow-only, merged** | **38.5** | **47.7 (−7.4 %)** | 2.90 at 44.7 | **49.7 · 52.4 · 54.4** | 0 · 0 |

The smart bot's longest wait (4.46 min at 44.8) is the saving for the office right after 읍 (v4.1: 5.2); one run each.

### 11.4 Tests on the merged tree

Logs in `integ/suites/` (browser) and `integ/node/` (Node). The machine ran 3–6 browsers at once (load 8–23); the
suites ran with a test-only preload (`integ/slowshot.cjs`, Playwright's default timeout 30 → 180 s; no test or game
code changed). "Final" = the merged tree with I1; the rest ran on the merged tree before I1 (I1 changes only who
empties the forge's pad once the 창고 crew exists).

| Suite | Result | Source |
|---|---|---|
| `store42.mjs` (new) | **13/13** (12/12 before the I1 check was added, twice) | final |
| `dockporter.mjs` (new) | **11/11** (also 11/11 before I1) | final |
| `hallboard.mjs` (new, with screenshots) | **21/21** (also 21/21 before I1) | final |
| `porters42.mjs` | **21/21** (also 21/21 before I1) | final |
| `restaurant.mjs` | **51/51** (also 51/51 before I1) | final |
| `v4.mjs` · `smoke.mjs` · `plots.mjs` | **46/46 · 53/53 · 34/34** (same before I1) | final |
| `v3` · `labour` · `pickup` · `nav` · `rail` · `town` | 18/18 · 28/28 · 31/31 · 12/12 · 35/35 · 17/17 | final |
| `dog` · `life` · `zoom` · `c2` · `townfolk_runtime` · `voice_runtime` | 15/15 · 14/14 · PASS · 39/39 · 8/8 · 29/29 | final |
| `v42_guide.mjs` | 6/6 | final |
| `v42.mjs` | **35/35** on the final source; 34/35 before I1 — the miss was "총총이 follows the chief ≤ 300 px" at 321 px (the threshold flake of §9.2 of `v42_code2.md`: 292–318 there) | final |
| saves: `save_v2` · `save_v3` · `save_v35 --browser`, `save_v42` | PASS · PASS · PASS, all passed | final |
| `save_v4.mjs --browser` (v3.5 fixtures, 20 corrupted v4 blocks, reloads mid-founding / -train / -ceremony) | PASS, 52 checks | before I1 |
| v4.1 / v4.2 fixtures through the new code | v4.1 35-min and 46-min saves load, save as v7, reload with no second refund (`dockporter`); the 46-min save reloads with its bent store line and stock (`store42`) and the board (`hallboard`) | final |
| `pilot.mjs` | 30-min 관망 soak: 9/9 (income 66,820, 0 coins spent, 0 stuck); its 30-min arrow-only reference ran past my 2.5 h limit (killed by the runner, not a game error); `--minutes 10 --ref-minutes 10`: **10/10, 관망 income 90 % of arrow-only** | soak before I1, 10-min run final |
| `visitors42 --base` (v4.1 copy `git archive 56a97d1`) | 2/2 (93 %) | final |
| `reqlog42 --base` | 3/5 twice: boot and "up to the first sale" differ by timing, in opposite directions between the two runs (run 1: this build asked for the six water textures at boot and the v4.1 copy for more resident looks / voices before the first sale; run 2: the v4.1 copy asked for the water textures at boot and more voices); after the first sale ≤ 1 new file and nothing missing (both). No merged change asks for an asset | final |
| Node: `bank42` 18 · `depot` 26 · `depot_parity` 10 · `ledger` 20 · `letters` 23 · `pilot` 45 · `rail42` 58 · `roadnet` 32 · `walls42` 6 · chat 9 files · `v4_layout` · `v42_layout` | all pass | merged |
| `balanceCheck` · string parity · eslint (`no-undef`, `no-dupe-keys`, `no-redeclare`) | 0 warnings · ko = en keys · 0 errors | final |

Logic time (`v42fixes/tools/bench.mjs`: the 46-min save, store on w_m2, chief parked, 4 × 600 fixed steps a run, three
runs each, merged and a pre-merge source copy alternating, load 8–15): **merged 4.39 ms a step on average (p50 3.18),
pre-merge 4.15 (p50 3.20)** — no measurable difference.

### 11.5 Budgets

- **Textures / files:** no new art, no new asset file, no new pack page — the texture tour (peak 451.4 MiB < 455) and the
  artifact file count (413) are as in the v4.2 verify. The artifact was not rebuilt (the lead builds).
- **Display objects:** one lazily created label per store ('판매대가 비었어요', `floatLabel`), the board rows' tag and
  where-line while the board is open, the guide's existing pooled dots / chevron (no new pool).
- **Logic:** `storeLine` runs once per store creation; `emptyCue` is a few comparisons a frame; `leaveToOwnPorter` is
  one `some()` over the porters only for a forge pad already ≥ 60 % full when a crew member plans; the pin check
  runs twice a second while a pin is set. The store fix's own bench (600 fixed steps on s46): no measurable change.

### 11.6 Files changed by the merge (on top of §9)

| File | Change |
|---|---|
| `src/scenes/Game.js` | `storeLine` (store) |
| `src/entities/Seller.js` | `slotPos` reads `cfg.slots`; `emptyCue` label (store) |
| `src/entities/Workshop.js` | `pickTool` runs, `lastRun` (store) |
| `src/systems/Occlusion.js` | store customers x-ray (store) |
| `src/systems/Progression.js` | `COMES_WITH`, init / complete hooks (dock) |
| `src/entities/TownHall.js`, `src/scenes/UIv4.js`, `src/systems/Navigator.js` | where-to-bring rows, tap → `Navigator.pin` (board) |
| `src/entities/Worker.js` | **(merge, I1)** `WarehousePorter.leaveToOwnPorter` |
| `src/data/balance.js`, `balanceCheck.js`, `strings.js` | `customers.emptyCueS`, `v42.nav.pinMaxS` / `pinArrivePx` (ranged), 11 new string keys ko + en (+ `bsub_boathouse` reworded), `porter_dock` / `overflowAt` comments |
| `tools/test/store42.mjs` (new, + I1 check), `dockporter.mjs` (new), `hallboard.mjs` (new) | tests |
| `tools/test/review_gameplay_census.mjs` | store and pier columns (`store`, `pier` in the summary) |
| `docs/기획서_v4_2_마을회관.md` (new), `docs/기획서_v4_2_촌장.md` §14, `docs/v42_plan.md` §19.6, this section | docs |
| `docs/previews/screens_v42/37–40` (new, 390 × 844 at DPR 2) | store line + label, rowboat banner with the 생선 짐꾼, board rows, board guide |

### 11.7 Open issues after the merge

1. **잡화점 shelf still empty about half the time** (45–49 %): delivery now keeps up with what is made and the shop
   sells ~10–11 a minute as fast as goods land. More sales need more cans and tools made (fish, ingots, planks) — the
   demand plan. Young villages (38–45 min) are fish-limited (the cannery waits for fish 79–87 % of the time).
2. **I1 is narrow on purpose:** only the forge's pad is left to its own porter. Other outputs keep the touch's 60 % crew
   rule. A future producer that makes runs for one-kind-a-trip porters needs the same treatment.
3. **Store line places are computed when the store is created** (built or loaded); a building finished later right
   next to the store could block a place until the next load. `store42` audits every store plot with all land open, not
   with every neighbour built.
4. **The hall accepts nothing** (designer decision available; it would need a hall → station porter and a save slot).
5. The board's guide is hidden in the tutorial and in 관망, like the bag guide.
6. The rowboat now includes the 생선 짐꾼; `costs.porter_dock` (600) is unused (the rowboat costs 700). Raise
   `boats.rowboat.coins` if the designer wants the porter paid for.
7. `reqlog42 --base` stays timing-sensitive on a loaded machine (two runs, opposite differences); `pilot.mjs`'s 30-min
   reference needs > 2.5 h here — run it on a quiet machine.
8. The pacing bots ran before I1; the census, the store / dock probes and the suites marked "final" after it.
9. Previews 37–40 are 390 × 844 at DPR 2 (31–36 are DPR 3).
10. Nothing is committed and the artifact is not rebuilt: the phone APK (v4.2 = `3236722`) and the claude.ai artifact
    (v4.1) have none of §§0–11 yet.
11. Still open from §10: the tables upgrade sells guests, not seats (designer call); raw piles stay full (demand).

## 12. Final review fixes (2026-10-26)

The two final reviews of the merged tree (`docs/build_reports/v42_final_review_gameplay.md`: Critical 0, High 1,
Medium 4, Low 5; `docs/build_reports/v42_final_review_robust.md`: High 0, Medium 3, Low 5, Info 3) are worked through
here. Every High and Medium is fixed or answered with a measured reason; the Lows are fixed too (they were cheap); the
three Infos need no change (#9 harmless, #10 a note for later, #11 by design). Save stays v7 with no new field; no new
art; one new balance key, `civic.restaurant.backYardWait` (1, ranged 0–20 in `balanceCheck.js`), plus the restaurant
layout points in `BigRestaurant` (`L`). Nothing is committed. Evidence: `/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v42final/`
(`tools/`, `runs/`, `suites/`, `node/`, `census/`, `bots/`).

### 12.1 What was fixed

| # | Finding | Fix (files) | Check |
|---|---|---|---|
| G1 (High) | 잡화점 on plot **e_m1**: after any reload line places 5–6 lay inside the farm fence (the line was worked out while the zones were still off on a load) | `Game.refreshStoreLine()`: the store's line is worked out again when a zone opens (`revealZone`), once more after the whole load, and when another building is finished next to it; customers in line walk to their new places (`Customer.update` reads `slotPos`) | `store42` check 6 (new): the 46-min save with the 잡화점 on e_m1 loads with 6 bent, standable places and a full line all arrives; screenshot 44 |
| G2 (Med) | 테이블 늘리기's back-yard tables stayed empty (`freeSeat` took the first free seat; the terrace never filled) | `BigRestaurant.freeSeat()` picks a free seat at random; while more plates wait on the pass than `civic.restaurant.backYardWait` (1) a server, a new guest takes the terrace when it has room (the back yard is the server's long round: at random alone, level 2 with one server piled 6.2 plates on the pass) | `restaurant` (new checks: 400 picks in an empty house, back yard 120–280; with 5 plates waiting, 0 of 200); restaurant probe §12.2 |
| G3 (Med) | The bag guide sent cans to the 잡화점 while the board asked for them at 서리역 짐 싣는 곳; the 정기 납품 chip's panel had no 길 안내 | `Navigator.places()`: an open order that wants a bag item adds its place (서리역 짐 싣는 곳) — **first** after the player picked that order (board row or order card: `orderPick`) or when the arrow sends it there (`Tutorial.orderFirst`, the arrow's own rule 3, now shared), else as the chip's '+1곳' · each unfinished card on the 솔방울 주문판 has a '길 안내' tag (`HudV4.guideOrder`, the board row's pin) | `hallboard` 24/24 (3 new checks); screenshots 41, 42 |
| G4 (Med) | Piles look jammed but the crew is busy (2 % idle): a demand problem | No code (v4.4 demand plan). Told in easy words in `기획서_v4_2_촌장.md` §15 | — |
| G5 (Med) | 잡화점 shelf still empty 46–69 %, tool kinds 73–100 % | A new customer of the 잡화점 asks for a kind that is on the shelf, on its way or waiting at its workshop's door (`Market.makeWant`); bubbles for bows while only cans stood there read as a shop that cannot sell. Supply itself was measured (§12.2) and is left to the v4.4 demand plan | store probe §12.2; `store42`'s empty-shelf check now seats a customer who wants bows (with G5 a new customer asked for the can on its way and was served) |
| R1 (Med) | After a load 2–3 offer banners fired in one frame; only the last was seen (테이블 늘리기's never) | `V42.queueBanner` / `pumpBanners`: offer banners (and the 창고 직원's) show one at a time, after the banner on screen and a gap; each is marked seen when it really shows, dropped if its pad is gone | `porters42`, `restaurant`, `v42`; shots 34–36 (their banners came one picture late until `shots_v42_touch.mjs` cleared the queue before each picture) |
| R2 (Med) | Buying 테이블 늘리기 put the terrace's back lamp 7 px from a seat; its x-ray box and night light stayed at the old spot | `L.lampMoved` (−6.3, 4.4) → (−6.25, 5.5): 77 px from the nearest seat (geometry probe `runs/geo.json`); `setTables` moves the lamp's occluder box and its `DayClock` light with it | `restaurant` (new check: lamp ≥ 40 px from every seat, box moved) |
| R3 (Med) | Back-yard guests / the server were hidden behind the building (28.5 % / 47.2 % of their walk) | `BigRestaurant.occlusionSubjects()` (called from `Occlusion.collect`): back-yard guests and servers on their back-yard round fade the restaurant building (stand-ins with `xrayMain`; the staff keep `noXray` elsewhere) | x-ray probe §12.2 (hidden 45 / 40 % → 0 / 0 %); shots 32, 43 |
| G6 (Low) | The pin's 240 s clock ran during 관망 and a pin could end there silently | `Navigator.pinCheck`: the clock waits while 관망 drives and 관망's walking is not arriving; a pin whose request was met under 관망 says so 1.8 s after the hand-back ('부탁을 다 채웠어요 · … 길 안내 끝') | `hallboard`, `pilot` |
| G7 (Low) | '판매대가 비었어요' always showed the can | `Market.emptyCue`: the icon is the waiting customer's wanted item | `store42` |
| G8 (Low) | The server handed plates over from ~180 px (across the table, from the spot beside the table block) | `BigRestaurant.nearSeatSpot`: a breadth-first search on a 10-px grid round the tables finds the nearest free spot 36–80 px from the seat (≥ 36 px from the other seats, ≤ 200 px walk) and the straightened way there; the server walks in, hands over, and walks back out the same way (`updateServer` legs; the way in is skipped if the guest left). Measured once per seat and table level. While plates back up on the pass (`passBusy`: more than `backYardWait` a server, the rule of G2) he hands over from beside the table block as before — walking in every time more than doubled the plates waiting at level 2 with one server (2.1 → 5.2) | `restaurant` (new check: a spot ≤ 80 px for most seats, on free ground); restaurant probe §12.2 |
| G9 (Low) | One-time tips / "full" toasts used up during 관망 | `PickupPolicy.took`, `Player.warnFull`, `Game.fullToast` skip while 관망 drives (the tip is not marked seen) | `pilot` |
| G10 (Low) | 기획서 said "승격식 준비 11,000" always shows on the board | reworded: only while the 승격식 is the current goal | — |
| R4 (Low) | Pad prices covered on phones (테이블 늘리기 under a seated guest's bubble and the back lamp; a lamp on the 서빙 직원 2 price) | `L.padOff` (−0.9, 0.5) → (−1.7, 0): 146 px from the nearest seat; the 서빙 직원 2 pad at `server2PadPos()` (staff spot + (−0.3, −0.7) m): 98 px from the nearest lamp (`runs/geo2.json`) | `restaurant` (check 13 now asserts the lamp distance) |
| R5 (Low) | Two 창고 직원 shared one waiting spot | `WarehousePorter.homeFor` skips spots within 20 px of another crew member's home | `porters42` |
| R6 (Low) | English wording (짐꾼 2 banners/pads, news, `crewCame`, `navArrive`) | per-line names `p2Name_*` (ko unchanged: '생선 짐꾼 2'; en 'Porter 2 · Fish', 'Fish piling up'); `news_crew1` for one arrival; 'Another warehouse hand has arrived'; `navArrive` 'Arrived: {place}' / '도착했어요 · {place}' | string parity (861 = 861 keys) |
| R7 (Low) | A damaged save with 서빙 직원 2 but no first server lost him | `serialize` keeps `server2` while `wantServer2` waits | `save_v42` |
| R8 (Low) | A part-paid 짐꾼 2 pad could stay hidden behind unpaid ones | `LineUpgrades.update` places part-paid offers first | `porters42` |
| R9–R11 (Info) | Day counters not saved; `offerPaid` cap 8; duplicate porter looks | no change (harmless / a note for later / by design) | — |
| T1 (found by `nav`) | With G3 the 서리역 짐 싣는 곳 became a bag place; the guide kept a route planned from where the player stood earlier when he stood on it further along (not 80 px off it), so its length and chevron counted the way back to its start (`nav`: 3 of 40 bags, 2,971 vs 2,279 px) | `Navigator.update`: a new load, or the guide coming back (after 관망, an empty bag), plans the way again from where he stands | `nav` (re-run) |
| T2 (found by `store42`) | An item flying to a 잡화점 customer whose bubble had just gone (the test cleared the line mid-sale; in play a train visitor called away or a despawn) landed into the destroyed text: Phaser threw from `setText`. G5 made it likely in the test (customers now want what is on the shelf, so a sale is often under way) | `Customer.hideBubble` forgets the bubble's text and icon; `updateBubble` returns when there is no bubble | `store42` (re-run) |

### 12.2 Numbers

All on the 46-min smart save (s46), fixed step, chief parked away from what is measured; one run each unless said.

**잡화점 (G5)** (`v42final/tools/storeprobe.mjs`, store on w_m2, 8 game minutes; "tool kinds empty" = share of 5-s
samples with every tool kind at 0 on the shelf; tills = every coin the village takes a minute):

| Run | sales/min | coins/min | shelf empty | cans empty | tool kinds empty | front stalled | tools / cans delivered a min | all tills/min | 교역소/min | forge: work · no ingot · no plank · out full |
|---|---|---|---|---|---|---|---|---|---|---|
| before (merged tree) | 11.75 | 626 | 36 % | 53 % | 67 % | 61 % | 10.0 / 17.8 | 2,356 | 411 | 48 · 25 · 23 · 4 % |
| try: forge inputs urgent below 16 (not kept) | 11.13 | 580 | 42 % | 64 % | 58 % | 65 % | 9.4 / 14.9 | 2,372 | 389 | 77 · – · – · 9 % |
| try: tool porter first below 75 % (not kept) | 11.13 | 601 | 42 % | 59 % | 75 % | 65 % | 10.1 / 15.5 | 2,213 | 285 | 67 · – · – · 16 % |
| try: both (not kept) | 11.88 | 682 | 31 % | 56 % | 58 % | 51 % | 11.8 / 17.1 | 2,262 | 277 | 81 · – · – · 19 % |
| **final (wants follow the shelf)** | 10.88 | 573 | 35 % | 49 % | **50 %** | 60 % | 9.6 / 16.0 | 2,308 | 422 | 54 · 21 · 23 · 2 % |

Reading: the shop sells what lands (sales ≈ deliveries); more tools need the forge fed, and feeding it first takes
planks / ingots from the 교역소 (277–389 a minute instead of 411) — the village's tills do not rise (2,213–2,372 vs
2,356). So no balance change here; the wants now follow what is on the shelf or on its way (tool kinds empty 67 → 50 %),
and the supply is the v4.4 demand plan's (§12.5). Sales 10.9 vs 11.8 is within this probe's run-to-run noise (the
merged tree's own runs: 10.7–11.3, §11.3).

**큰 식당 (G2, G8)** (`v42final/tools/restprobe.mjs`, all three staff, the pantry fed as the porters do, 6 game minutes
a level; hand-over = ground distance from the server to the guest's seat when the plates leave his tray; plates on the
pass = ready orders waiting, sampled):

| Run | level · seats | served/min | coins/min | back-yard deliveries | plates on the pass | hand-over p50 / p90 |
|---|---|---|---|---|---|---|
| reviewer (first free seat) | 0 · 8 / 1 · 12 / 2 · 16 | 11.75 / 15.37 / 16.12 | – | 0 / 1 / 0 | 0.17 / 0.28 / 0.45 | 181 / 190 |
| random seat alone | 0 / 1 / 2 | 11.0 / 14.5 / 16.0 | 274 / 348 / 381 | 0 / 27 of 86 / 48 of 95 | 0.2 / 1.06 / **6.15** | 179 / 161 / 143 |
| random seat alone + 서빙 직원 2 | 2 | 16.5 | 396 | 45 of 100 | 0.3 | 168 |
| random, back seats weighted ½ (not kept) | 2 | 14.5 | 335 | 43 of 91 | 4.39 | 149 |
| `backYardWait` 0 | 1 / 2 | 13.5 / 18.33 | 272 / 438 | 18 of 83 / 25 of 110 | 0.65 / 2.98 | 168 / 155 |
| `backYardWait` 1 (kept) | 0 / 1 / 2 | 11.33 / 15.5 / 17.83 | 257 / 346 / 375 | 0 / 24 of 95 / 35 of 106 | 0.17 / 1.49 / 2.41 | 180 / 155 / 170 |
| try: walk in to every hand-over (not kept) | 0 / 1 / 2 | 11.17 / 15.33 / 15.67 | 256 / 344 / 366 | 0 / 16 of 92 / 30 of 95 | 0.31 / 1.45 / **5.15** | 94 / 95 / 92 |
| **final (`backYardWait` 1; walks in unless plates back up)** | 0 / 1 / 2 | **11.17 / 16.0 / 15.5** | 264 / 376 / 328 | 0 / 23 of 95 / 21 of 96 | 0.35 / 1.57 / 2.14 | **93** / 150 / 154 (p90 187 / 182 / 186) |
| level 2, 12 min, final | 2 | 16.5 | 363 | 51 of 199 | 2.13 | 171 / 182 |
| level 2, 12 min, final without the walk-in (same run length) | 2 | 16.42 | 370 | 72 of 200 | 1.65 | 176 / 185 |

Reading: the back yard is used now (a quarter of the deliveries at levels 1–2, none before) and the house serves as
before or a little more (level 2 in 6-min windows varies 15.5–18.3 a minute between runs; the 12-min runs 16.4–16.5 vs
the reviewer's 16.1). Plain random seats let one server pile 6 plates on the pass at level 2; `backYardWait` keeps it
at about 2. The hand-over beside the seat (G8) shows when the server has time — level 0 hands over from 93 px instead
of ~180; when plates back up (often at levels 1–2 with one server) he hands across the table as before, which keeps the
throughput (walking in every time: 5.2 plates waiting at level 2). Hand-over spots (`v42final/runs/geo3c.json`): 5 of 8
/ 8 of 12 / 12 of 16 seats get one 50–78 px from the seat (walk in 42–209 px); the rest have no way round within 200 px.

**X-ray of the back yard (R3)** (`v42final/tools/xray.mjs`: level 2 with both servers, camera on the restaurant at
zoom 1.2, 150 s, 0.25-s samples; hidden = at least 2 of 3 body points behind the building's solid pixels while it is
opaque; the same run with this x-ray switched off as the reference): back-yard guests walking hidden **45 % → 0 %**
(1 of 1,045 samples), servers on their back-yard round **40 % → 0 %** (3 of 650) on the final source (an earlier run:
48 / 39 % → 0 / 0 %; reviewer: 28.5 % / 47.2 %).

**Layout (R2, R4)** (`v42final/tools/geo.mjs`, `geo2.mjs`; ground px): the moved lamp 7 → **77** from the nearest seat
(161 from the nearest table, 202 from the back path); 테이블 늘리기 pad 89 → **146** from the nearest seat (157 / 259
from the moved lamp at level 0 / 1); 서빙 직원 2 pad 55 → **98** from the nearest lamp, 141 from the other pads.

**잡화점 on e_m1 (G1)** (`store42` check 6: the 46-min save with the 잡화점 moved to e_m1): after the load 6 places,
bent round the farm fence, all standable; a full line of 6 all reach their places (before: places 5–6 inside the fence
on every load).

**Late village and pacing bots** (same tools and settings as §11.3, on the final source):

| 46-min save, 60 game min (`review_gameplay_census.mjs`, smart bot) | merged (§11.3) | **final** |
|---|---|---|
| income a minute | 2,878 | **2,947 (+2 %)** |
| 큰 식당 (the bot buys both table levels) served · coins · walk-outs a minute · seat wait | 16.8 · 363 · 0 · 0.36 s | 16.9 · 380 · 0 · 0.70 s |
| 잡화점 sales · coins a minute · shelf empty · tool kinds empty | 10.7 · 567 · 49 % · 68 % | 11.2 · 607 · 49 % · 69 % |
| pier catch pad avg · ≥ 90 % | 1.6 · 0 % | 1.5 · 0 % |
| outputs ≥ 80 %: bakery · toolsmith · smelter · grill | 8 · 2 · 15 · 48 % | 21 · 1 · 14 · 46 % |
| any raw pile ≥ 90 % | 93 % | 91 % |
| made a minute (raw + goods) | 327 + 323 | 334 + 330 |
| 창고 crew first → last · idle | 2 → 6 · 21 % | 2 → 6 · 17 % |
| train surplus exported | 828 | 992 |
| page errors | 0 | **0** |

| Pacing bots (fresh game, as §11.3) | 5 shops | 읍 | longest wait after tower_east | 사무실 · 은행 · 물류창고 | stuck · errors |
|---|---|---|---|---|---|
| smart, v4.2 verify | 38.6 | 47.3 | 3.35 at 47.3 | 57.2 · 62.4 · 59.1 | 0 · 0 |
| smart, merged (§11.3) | 39.2 | 44.7 | 4.46 at 44.8 | 50.5 · 52.1 · 56.1 | 0 · 0 |
| **smart, final** | **37.6** | **43.7 (−7.7 % vs verify)** | 2.07 at 44.4 | **51.2 · 52.8 · 57.0** | 0 · 0 |
| arrow-only, v4.2 verify | 40.9 | 51.5 | 6.52 at 59.8 | 53.2 · 56.1 · 59.8 | 0 · 0 |
| arrow-only, merged (§11.3) | 38.5 | 47.7 | 2.90 at 44.7 | 49.7 · 52.4 · 54.4 | 0 · 0 |
| **arrow-only, final** | **38.9** | **48.0 (−6.8 % vs verify)** | 3.68 at 44.2 | **49.9 · 53.0 · 54.7** | 0 · 0 |

The gate (읍 ≤ +3 % of the v4.2 verify) holds for both bots; one run each. The census and the bots ran on the final
source except the T2 guard (the customer-bubble check, added while they ran; it changes nothing unless an item lands
on a customer whose bubble is gone).

### 12.3 Tests

Logs in `v42final/suites/` (browser) and `v42final/node/` (Node). As in §11.4 the machine ran 3–8 browsers at once
(4 cores, load 16–25) with the test-only preload `integ/slowshot.cjs`. "Final" = the final source; "before T1/T2/G8" =
the same tree before the last three changes (the guide's replan, the bubble guard, the walk-in hand-over), each
re-run where it touches the suite.

| Suite | Result | Source |
|---|---|---|
| `store42.mjs` (+ check 6: e_m1 after a load; + the empty label's icon) | **16/16** (15/15 before T2; 9/10 + a page exception in the run that found T2; 14/16 when G5 served the test's waiting customer the can on its way — the check now seats one who wants bows) | final |
| `hallboard.mjs` (+ 3 checks: the order's place in the bag guide, the card's 길 안내, the order first after picking it) | **24/24** | final |
| `restaurant.mjs` (+ checks: lamp ≥ 40 px from the seats and its box moved; random seats, terrace while plates wait; hand-over spots; 서빙 직원 2 pad off the lamp) | **55/55** | final |
| `nav.mjs` | **12/12** (11/12 twice before T1: the route-length check, 3 of 40 bags) | final |
| `porters42.mjs` · `v42.mjs` · `v4.mjs` · `plots.mjs` | **21/21** · **35/35** (three earlier runs at load 16–25 missed one or two wall-clock/threshold checks: "office panel < 100 ms" twice (1 s and 9 s while 7 browsers ran) and "총총이 follows the chief ≤ 300 px" twice at 317 px — the pre-existing flake, 281–321 across runs; the office and the dog are not touched here; both pass on the quieter machine) · **46/46** · **34/34** | final |
| `dockporter` · `smoke` · `save_v42` | 11/11 · 53/53 · all passed | before T1/T2/G8 (T1 and G8 do not touch them; T2 only guards the customer bubble) |
| `v3` · `labour` · `pickup` · `rail` · `town` · `dog` · `zoom` · `c2` · `townfolk_runtime` · `voice_runtime` | 18/18 · 28/28 · 31/31 · 35/35 · 17/17 · 15/15 · PASS · 39/39 · 8/8 · 29/29 | before T1/T2/G8 |
| `life.mjs` | **14/14** (13/14 once before: "tag among kids" found no two kids near enough — random positions; not touched here) | final |
| `v42_guide.mjs` | 6/6 | final |
| saves: `save_v2` · `save_v3` · `save_v35 --browser`, `save_v4 --browser` | PASS · PASS · PASS, PASS | final |
| `pilot.mjs --minutes 10 --ref-minutes 10` | **10/10**, 관망 income 89 % of arrow-only, 0 coins spent | final |
| Node: `bank42` 18 · `depot` 26 · `depot_parity` 10 · `ledger` 20 · `letters` 23 · `pilot` 45 · `rail42` 58 · `roadnet` 32 · `walls42` 6 · chat 11 files · `v4_layout` · `v42_layout` | all pass | final |
| `balanceCheck` · string parity · eslint (`no-undef`, `no-dupe-keys`, `no-redeclare`) | 0 warnings · 861 = 861 keys · 0 errors | final |

### 12.4 Screenshots (`docs/previews/screens_v42/`, 390 × 844, Korean; looked at)

| File | What it shows |
|---|---|
| `31`–`33` (re-taken, DPR 3) | 테이블 늘리기 levels 1 / 2 / night: back-yard guests seated and eating; the moved lamp in the yard's corner; in 32 the building turned see-through over the back-yard guests (R3) |
| `34` (re-taken) | the 테이블 늘리기 pad one table further out (1,200, clear of seats) with its banner |
| `35`, `36` (re-taken) | 통조림 짐꾼 2 pad + banner; a 창고 직원 walking in + banner (banners now one at a time) |
| `37` (re-taken, DPR 2) | 잡화점 with an empty shelf: the front customer wants bows x3 and the label shows the bow (G7) |
| `41` (new, DPR 2) | 솔방울 주문판: each unfinished card has its '길 안내' tag (G3) |
| `42` (new, DPR 2) | cans in the bag after picking the order: chip `통조림 6 → 서리역 짐 싣는 곳 · 10m +1곳` (G3) |
| `43` (new, DPR 2) | level 2: 4 guests in the back yard, 7 on the terrace (G2) |
| `44` (new, DPR 2) | 잡화점 on e_m1 after a load: the line bends round the farm fence, all six in place (G1) |

### 12.5 Open issues

1. **Supply, not delivery (G4, G5):** the 잡화점's tool kinds are still empty about half the time (50 %) and the raw
   piles look full; both need more made and more places that buy — the v4.4 demand plan (`docs/logistics_plan.md`).
   Feeding the forge first was measured and not kept (it takes planks / ingots from the 교역소; the village's tills do
   not rise, §12.2).
2. **Hand-over beside the seat only when the server has time (G8):** at levels 1–2 with one server plates often back
   up, and he then hands across the table as before (p50 150–171 vs 93 at level 0); 3 / 4 / 4 seats (levels 0 / 1 / 2) have no
   way round the tables within 200 px. 서빙 직원 2 makes the walk-in the usual case there.
3. **Level 2 with one server keeps about 2 plates waiting** (was 0.45 while the back yard stood empty); the 서빙 직원 2
   offer (more than 2 plates waiting for 60 s) still comes from that.
4. **§11.7 #3 is fixed by G1** (a building finished next to the 잡화점 re-plans its line).
5. `visitors42` / `reqlog42 --base` were not re-run (they need a v4.1 base copy; no change here loads or asks for an
   asset). `pilot.mjs`'s 30-min reference was not re-run (> 2.5 h on this machine); the 10-min form was.
6. Previews 37 and 41–44 are 390 × 844 at DPR 2; 31–36 DPR 3 (as before).
7. Nothing is committed by this pass (the session's WIP snapshot `7a7be4b`, made by the runner at 09:28, holds most of
   it; the rest is in the working tree) and the artifact is not rebuilt.

## 13. Verify (2026-10-26)

**Verdict: ship with known issues.** Every critical, high and medium repro from the two final reviews passes on the
final source; all suites pass or fail only on known timing flakes that passed on a rerun (or match the copy without
these fixes); saves from real v3.5 / v4.1 / v4.2 games migrate with nothing lost; both bots reach 읍 inside the gate
with 0 stuck and 0 errors; the soaks are clean; the texture tour peaks at 442.4 MiB (must ≤ 455); the artifact build
and `test_deploy standalone --quick` pass. The known issues (§13.8) are balance / timing items carried from earlier
passes, plus one small new look item. None is a crash, a save loss or a soft-lock.

Method: the source was fingerprinted at the start (`git diff 7a7be4b -- src` sha1 `429be4ee…`, src tree sha1
`da92ee44…`) and is unchanged at the end. Nothing in `src/`, `assets/`, `tools/` or the save format was changed by this
pass: save stays v7, no new art. The machine had 4 cores and a load of 11–16 the whole time, with 2–4 browsers at once
and the test-only preload `slowshot.cjs` (it only raises Playwright's default timeout to 180 s). Game-time numbers are
on the fixed-step clock; wall-clock checks are noisy. Evidence (logs and JSON, big files deleted):
`/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v42verify/` — `suites/`, `repro/`,
`node/`, `bots/`, `rtools/` (harnesses + `out/*.json`), `build/`.

### 13.1 Final-review repros (all on the final source)

| # | Repro | Result |
|---|---|---|
| G1 (High) | `efence`: 잡화점 on e_m1, reload | line places 5–6 at (1788, 1289), (1804, 1270): free ground; a full line of 6 all arrive; the re-plan after the load equals the loaded line. `reloadplots`: all 9 plots give the same line after a reload, 0 blocked places |
| G1b | `vrepro` (new): a solid object dropped on line place 3, then the `built` event | the line bends round it at once (every place standable); back when it is gone |
| G2 / G8 (Med / Low) | `rest.mjs` (reviewer's probe), 6 game min a level | level 0 / 1 / 2: served 11.62 / 15.87 / 16.25 a min, coins 281 / 371 / 383, 0 walk-outs, plates on the pass 0.29 / 1.7 / 1.97, hand-over p50 92 / 97 / 158 px. Back-yard deliveries 31 (level 1) and 38 (level 2); the reviewer saw 1 and 0. Part-pay + reload of 테이블 늘리기 2: coins kept, 2,000 total |
| G3 (Med) | `hallboard` 5b + `vshots` (new, 360 × 640 ko / en, 390 × 844 en) | the order card's '길 안내' tag pins 서리역 짐 싣는 곳; after picking the order the bag chip reads `통조림 4 → 서리역 짐 싣는 곳 · 37m +1곳` (dock first); the English "Show me" tag fits. (The reviewer's `hall.mjs` step ran after the pilot had already finished the cans order, so `→ 잡화점` was right there.) |
| G4 / G5 (Med) | `store.mjs`, 6 plots × 5 min (review: 5 plots × 4 min) | sales a min (review → now): w_m2 7.75 → 8.8, e_m1 11.5 → 12.2, e_m2 8.5 → 8.8, se_m1 11 → 10, s_l1 10 → 10.4, se_l1 – → 12. Shelf empty: 69 → 43, 60 → 50, 68 → 71, 47 → 51, 46 → 46, – → 55 %. Tool kinds still empty 75–100 % of the time: supply, left to v4.4 (as §12.5) |
| G6 / G9 (Low) | `pilot.mjs` (reviewer's harness) | the pin's age stays at 63 s while 관망 drives; a pin met under 관망 ends at 359 s; '부탁을 다 채웠어요 · 서리역 짐 싣는 곳 길 안내 끝' shows at 376 s, after '다시 조종해요' at 374 s; the pin is kept after the hand-back in run B; 0 coins paid while piloted; no pickup tip or "full" toast during 관망 |
| G7 (Low) | `store42` + screenshot 37 | the empty-shelf label shows the waiting customer's item (bow) |
| R1 (Med) | `firstload`, 6 real v4.2 saves | offer banners now come one after another (e.g. 130.1 / 131.8 / 133.7 s real time) instead of 2–3 in one frame; 0 errors |
| R2 (Med) | `looks3` + `vrepro` R2b (new) | the moved lamp at (−634, 614): 57 screen px / 77 ground px from the nearest seat (was 7). Buying 테이블 늘리기 in the session moves the lamp, its night light (light at new spot 1, at old spot 0, light count unchanged) and its x-ray box together |
| R3 (Med) | `vxray` (new; camera on the restaurant, zoom 1.2, level 2 with both servers, 150 s) | hidden while walking the back yard: guests **0.2 %**, servers **0.1 %**; with the x-ray switched off (reference) 26.8 % / 35 %. The reviewer's `looks2` keeps the camera on the chief 500 px away, so the yard is off screen and the x-ray (which works only on screen) never runs; it reproduces 28.7 / 35.9 % there, a harness artefact |
| R4 (Low) | `padprobe`, `labels` | 테이블 늘리기 pad 146 px from the nearest seat; 서빙 직원 2 pad clear of the lamp |
| R5 (Low) | `crew_r` | 창고 crew homes all distinct; a reload in the middle of a walk-in keeps the counts; 0 problems |
| R6 (Low) | `labels` (44 shots) + string parity | 'Porter 2 · Fish', 'Fish piling up', 'Arrived: …'; every banner and chip fits at 360 px; 861 = 861 keys |
| R7 (Low) | `save_v42` | passes (server 2 kept while `wantServer2` waits) |
| R8 (Low) | `vrepro` R8 / R8b (new) | with three 짐꾼 2 lines due, the part-paid `p2_dock` (last in line order, 150 paid) takes a slot before two unpaid ones, and is still up with its 150 after a save + reload |
| — | `fuzz` (reload in the middle of a purchase) | 14 trials (테이블 1 / 2, 서빙 직원 2, 짐꾼 2 at cannery / toolsmith / dock, 나룻배): 0 problems |
| — | `looks` | tables never overlap, serve points free, depth right; 잡화점 line x-ray 18 / 18 views with 0 covered-and-opaque customers |

### 13.2 Suites

| Suite | Result |
|---|---|
| `restaurant` · `hallboard` · `store42` · `porters42` · `dockporter` · `nav` | 55/55 · 24/24 · 16/16 · 21/21 · 11/11 · 12/12 |
| `v4` · `smoke` · `plots` · `v3` · `labour` · `pickup` · `rail` · `town` · `dog` | 46/46 · 53/53 · 34/34 · 18/18 · 28/28 · 31/31 · 35/35 · 17/17 · 15/15 |
| `c2` · `townfolk_runtime` · `voice_runtime` · `v42_guide` | 39/39 · 8/8 · 29/29 · 6/6 |
| `life` | 13/14 (campfire concert gathered 2 members, needs ≥ 3: random, not touched here), rerun **14/14** |
| `zoom` | first run: `page.goto` 120 s timeout under load (harness); rerun **PASS** |
| `pilot.mjs --minutes 10 --ref-minutes 10` | 9/10 (관망 income 79 % of arrow-only; long evening acts in the first 5 min), rerun **10/10 at 101 %** (21,322 vs 21,112); earlier passes 89–90 %: noise |
| `v42` | **32/35**. The 3 misses are timing: "office panel < 100 ms" (263 ms while 4 browsers ran; known), "총총이 follows ≤ 300 px" (318 px; known, 281–335 across runs), and "딸랑이 empties the 물류 금고 within 240 s" (new in the list, see below). All 32 other checks pass, 0 page errors |
| `visitors42` | 1/2: v4.2 85 % of the v4.1 copy's visitors a minute over minutes 3–20 (3.29 vs 3.88), the known pre-existing gap (86–95 % in the v4.2 verify); 0 page errors |
| `reqlog42 --base` | 4/5 (the first run missed the base copy's test files; rerun with them): boot asked for one resident look (`vil_npc_*.social`) more than v4.1, the documented lazy-load timing flake; up to the first sale the same; after it 1 new file, nothing missing; 0 errors |
| saves: `save_v42` · `save_v2` · `save_v3` · `save_v35 --browser` · `save_v4 --browser` | all passed · PASS · PASS · PASS · PASS |
| `test_deploy standalone --quick` | **PASS** 14/14: WebGL, title 5.0 s, 363 requests, no placeholder art, no failed requests, 0 errors |
| Node: `bank42` 18 · `depot` 26 · `depot_parity` 10 · `ledger` 20 · `letters` 23 · `pilot` 45 · `rail42` 58 · `roadnet` 32 · `walls42` 6; chat 9 files (bridge 2, ko 7, memory 12, offline 9, prompt 5, safety 11, sample 23, sanitize 7, size 2); `v4_layout`, `v42_layout` | all pass |
| `balanceCheck` · string parity · eslint (`no-undef`, `no-dupe-keys`, `no-redeclare`) · `sanfuzz` | 0 warnings · 861 = 861 · 0 errors · 3,000 mutated saves 0 problems, 15 fixtures idempotent, largest 7,372 B |

**The 딸랑이 check** (`rtools/vcourier.mjs`, the same steps as `v42.mjs`, then the courier logged every 0.5 s): a
round visits the tills nearest-first and takes about 130 game s (trade → market → rest → store → tax → station →
depot), then the bank. When the 640 coins land just after a round has started, the 물류 금고 waits for the next round
and is emptied at ~180 s in the trial, but can pass 240 s. The copy without the touch (`frv/base42`, 3236722) behaves
the same (182 s vs 179.5 s here). The 240-s window in the test is tight; the game is not wrong. Not changed here (no
test edits in a verify pass); widen it to ~400 s when the test is next touched.

### 13.3 Saves (`rtools/mig.mjs`: load → census A, play 60 s and save → B, reload → C, save at once and reload → D)

15 saves: 1 v3.5, 8 v4.1 (including the three 나룻배-without-생선-짐꾼 cases), 6 real v4.2 saves made by playing 3236722.

- Every save: saved version 7; coins B = C = D (e.g. 8298, 9647, 8608); 0 page errors at A, C and D; `saveLost` 0;
  each station's porter exactly once; no `porter_dock` pad left; restaurant at level 0 with ≤ 3 staff.
- Refunds once, exactly as expected: `v41_smart35_nodock_paid250` 250, `v41_pure45_nodock_paid599` 599,
  `v42_smart35_nodock_paid250` 250, `v42_smart46_nodock_paid310` 310; all others 0.
- `v42_smart46_rich`: part-payments `st2_sawmill` 77 and `p2_smelter` 123 survive both reloads.
- 창고 crew B / C / D: 3/3/3 in 11 saves, 0/0/0 in the three 25-min saves (no 창고 yet), 2/2/2 in
  `v42_smart35_nodock_paid250`. `v42_smart46_late` reads 2/3/3: the save had no measured rate yet, so in the first
  60 s the crew only measures (by design: `seen` after a minute); the save at B carries the rate (519 a min, target 5),
  and the reload trusts it and lets the due third member walk in. Growth, not a duplicate (crew 3 = base 2 + 1 extra).
- "dup looks" 5–13 in every census: by design (robust review Info #11, two looks a role).

### 13.4 Bots (fresh game until 읍, fixed step, final source)

| | 5 shops | 읍 | longest wait after tower_east | 사무실 · 은행 · 물류창고 | stuck · errors |
|---|---|---|---|---|---|
| smart | 36.5 | **43.8** (v4.2 verify 47.3; gate ≤ 48.7) | 2.26 at 44.3 | 51.8 · 54.2 · 57.0 | 0 · 0 |
| arrow-only | 38.8 | **49.0** (v4.2 verify 51.5; gate ≤ 53.0) | 4.16 at 44.7 | 50.4 · 52.7 · 54.7 | 0 · 0 |

### 13.5 Soaks and budgets

- **Late village, 10 min** (`rtools/soak.mjs 10 merged`: the 46-min save with tables level 2, 서빙 직원 2, crew 6; a
  tour every 30 s, 관망 one minute in five): 0 errors, `saveLost` 0; crew 6, porters 16, seats 16 constant; 354 meals
  (reviewer 356); Residency 370–434 MiB (must ≤ 455), 0 refusals until minute 6, 14 after (the residency cap working);
  display objects 1,320–1,661; JS heap 64.8 → 104 MB at minute 7, then flat (the browser's coarse heap steps; the
  reviewer saw 104 flat from minute 3); 54 DOM listeners, 1 interval, 3–10 Phaser timers, 6–22 tweens throughout;
  save 6.1–8.5 KB. GL texture bytes touched 471.7 MiB in one sample (minute 8) while a view settled — the known
  "GL bytes while a late view settles" item (CODE-2 §9.3 #5: up to ~466; the reviewer's soak 455.5); the source-sum
  must holds.
- **Fresh game, 10 min** (`tools/test/soak.mjs 600`): 0 errors; display children 693 → 820 and bounded (CODE-2: 695 →
  834); tweens 5–23.
- **Texture tour** (`rtools/tour.mjs`, the 43 designer shots): **peak 442.4 MiB** at
  `17_depot_revealed_390x844_ko` (must ≤ 455; reviewer 450.6, v4.2 verify 451.4); most display objects in a view 1,342.
- **`texbudget`** 9/12: every must passes (any view 411.1, GL total 448.1, GL vs source-sum 1 %, render targets 33.7,
  back to the start within 5 MiB, 0 page errors). The three misses are the long-standing soft targets: plaza 348.4 /
  300, tour 411.1 / 300, title 146.5 / 90 (123.8 in the review run: the title sample sums whatever has loaded, and on
  the loaded machine the title sat longer; no title code or art changed).
- **Draw calls, objects, logic** (`rtools/perf.mjs`, base 3236722 vs this tree, alternately in one browser): draws
  −1.2 to +1.0 a frame per view; display objects +15 to +95 (the tables, their props, the extra helpers); Residency
  +0 to +13 MiB; GL peak 409.9 + 33.7 render targets. Logic per fixed step, p50 of 4 interleaved rounds: plaza 2.4 →
  2.7 ms, restaurant 2.2 → 2.7 ms (load 11; the review run had the opposite sign); the V42 systems' own time 0.099 →
  0.126 ms. No budget is crossed.

### 13.6 Build, publish list, deploy test

`node tools/build/build_artifact.mjs --webp --mp3-only` on the final source (the source has not changed since):
**413 files** (412 + the page), 65.73 MB, largest `game.js` 1.28 MB (137 modules); OK in 106 s. Checked
`dist/artifact_files.json` against `tools/build/published_files.json` (the live v4.1 version, 491 files):

- `stale` = live − this build exactly: 125 paths (audio 36, audio2 24, audio3 9, villagers 17, villagers2 11,
  villagers3 6, workers 10, characters 9, `_packed` 3), all in the live list, none in the new build.
- 46 paths are new; the three batches cover the 412 files exactly once; every file exists under `dist/artifact/`.
- No asset change since the build the reviewers checked (`git diff 3236722 HEAD -- assets lib index.html` is empty).

| Publish | Files | Nulls | Paths named | Size | Version after (live 491) |
|---|---|---|---|---|---|
| 1 (`batches[0]`) | 125 | 125 (`stale`) | 250 + the page | 32.15 MB | 376 + page |
| 2 (`batches[1]`) | 245 | 0 | 245 + the page | 30.72 MB | 404 + page |
| 3 (`batches[2]`) | 42 | 0 | 42 + the page | 6.05 MB | 412 + page |

Every publish names ≤ 250 paths + the page and is < 64 MB; the version never holds more than 412 files + the page
(never > 511). Publish 3 holds `game.js`, `chat.js`, `lib/phaser.min.js`, `lib/PHASER_LICENSE.md`, all 36 manifests,
`_packed/index.json` and `title_bake.json`, so the link keeps running v4.1 code until the last publish.
`test_deploy standalone --quick`: PASS (§13.2).

### 13.7 Screenshots (looked at)

`screens_v42` 31–37 and 41–44 (§12.4), the 44 `labels` shots (360 × 640 / 390 × 844, ko / en), the 9 `vshots`
order-card and bag-chip shots, the `looks` / `looks3` restaurant and 잡화점 shots, the repro shots (`efence`, `hall`,
`rest`, `store`, `pilot`) and the 43 tour shots. All read correctly. Small
things: shot 41 was taken while the board panel was still fading in (the `vshots` English shot of the same panel is
opaque and clean); the afford sparkle sits over a price digit (by design); a back-yard lantern-string end post stands
about 46 px in front of the level-1 seat at (−682, 644) and hides that seated guest from the default camera (new, cosmetic
Low); the English bag chip writes the item lower-case ("can 4 → …", the chip's existing format). In the tour's
`01_whats_new_390x844_ko` the 새로워진 것 card shows its drawn stand-in icons (ring, circle, binoculars, house) instead of
the ui5 icons: the card opened before the `v42_core` page had arrived on the loaded machine (`UIv42.openCard` picks the
stand-ins then; not touched by this pass, and the committed shot and the reviewer's run show the real icons). The
banners in the `labels` shots sometimes belong to another pad (e.g. "The server is busy" over the 창고): R1's queue
shows them one at a time, wherever the camera is.

### 13.8 Known issues (shipping with them)

1. **Supply, not delivery (G4, G5):** tool kinds on the 잡화점 shelf empty 75–100 % of the time, raw piles look full —
   the v4.4 demand plan (§12.5 #1).
2. **`visitors42`: 85 %** of the v4.1 copy's visitors a minute (pre-existing, 86–95 % before; not touched here).
3. **Restaurant levels 1–2 with one server:** about 2 plates wait on the pass, so the server often hands across the
   table (hand-over p50 158 px at level 2 here) and the 서빙 직원 2 offer comes often (§12.5 #2–3).
4. **Lantern post in front of a level-1 back-yard seat** (§13.7): cosmetic; move the post or the seat in a later pass.
5. **Timing flakes on this loaded machine:** `v42` panel time / 총총이 distance / 딸랑이's 240-s window (§13.2),
   `life` concert, `pilot` 10-min income, `zoom` page load, `reqlog42` boot order. Each passed on a rerun or matches the
   copy without these fixes.
6. **새로워진 것 card on a slow first load** can show the drawn stand-in icons until `v42_core` is in (pre-existing,
   cosmetic, once per save; CODE-2 §9.3 #7 is the same late page for the train).
7. **Texture soft targets** (title, plaza, tour) and GL bytes up to ~472 MiB while a late view settles; the musts hold.
8. **The update window:** between publish 1 and publish 3 the live v4.1 code runs with the 125 stale files gone —
   publish the three back to back (CODE-2 §9.3 #9).

### 13.9 Publish procedure (exact)

From `/home/user/nurient` (the Artifact tool's working directory), with the build above (rebuild with
`node tools/build/build_artifact.mjs --webp --mp3-only` from `frost-village/` if anything changes first, then use the
new `dist/artifact_files.json`):

0. Find the designer's live link (the v4.1 artifact: `Artifact` `action: "list"`, or ask) and read it once
   (`Artifact` `action: "read"`, `url`), so the update is allowed.
1. **Publish 1:** `Artifact` publish with `url` = the live link, `file_path` = `frost-village/dist/artifact/index.html`,
   `root` = `frost-village/dist/artifact`, `capabilities` = `{ "sample": {} }`, and `files` = a map of the 125 paths in
   `batches[0]` to themselves plus the 125 `stale` paths to `null` (250 entries). The map, from `frost-village/`:
   `node -e 'const a=require("./dist/artifact_files.json"),i=+process.argv[1],m={};for(const p of a.batches[i])m[p]=p;if(i===0)for(const s of a.stale)m[s]=null;console.log(JSON.stringify(m))' 0`
2. **Publish 2:** same `url`, `file_path`, `root`; `files` = the 245 paths of `batches[1]` (same one-liner with `1`);
   `capabilities` left out (kept).
3. **Publish 3:** same; `files` = the 42 paths of `batches[2]` (one-liner with `2`). This one carries `game.js`,
   `chat.js`, `lib/` and every manifest.
4. Publish 1–3 back to back, nothing in between. If a publish is refused, fix and re-send that batch only; never
   re-send the nulls after publish 1 succeeded.
5. Open the link once: title, tap to start, the village runs (WebGL, no error card).
6. Record it: `cd frost-village && node tools/build/build_artifact.mjs --record-published`, then commit
   `tools/build/published_files.json` with the release commit.

### 13.10 State left for the commit

- Source unchanged by this pass (fingerprints above). The only repo file this pass edits is this report (§13).
- The runner's WIP snapshot `afb0880` (16:53, mid-run) captured preview images the test suites had just re-rendered
  (`smoke`, `life`, `v3`, `v35`, `v4`, `screens_v42`). The working tree puts those 133 files back to their bytes from
  before this pass (sha1-checked against the snapshot taken at the start), so `git status` shows them as modified
  against `afb0880` — that is intended; commit them as they are.
- `dist/` (gitignored) holds the verified build. No extra worktree (`git worktree list` shows only the main one), no
  background process left, big scratch files deleted.
