# v4.2 CODE-1 (with the review fixes)

CODE-1 builds every phase of `docs/v42_plan.md` (P0 to P7) without new art. It uses placeholders: the stand-in office,
generated halo and navigation textures, the existing train cars scaled up as coach, box car and flat car, and
procedural loop rails. Two independent reviews then tested it: one on gameplay and economy, one on robustness, saves,
performance and visuals. This report covers:
- what CODE-1 delivers,
- each review finding and what happened to it,
- the numbers on the final code,
- what CODE-2 must do.

Nothing is committed; the lead commits.

Evidence is in the scratch folder `/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v42code_fix/`:
- the reviewers' repro scripts, re-run as `before_*`, `after_*` and `final_*` logs;
- the flow probes, in `m5/`;
- the census runs, in `census/`;
- the pacing bot, in `pace/`;
- the suite logs, in `suites/`.

The machine was shared with Blender renders (load average 4 to 20), so every timing is relative only. The perf gates
run in CODE-2.

## 1. What CODE-1 delivers

| Request | In the game now (placeholder art where noted) |
|---|---|
| 1 촌장 | 촌장 후광 (generated ring, gold while he works, back glow, motes, star pin; 읍 band) · 촌장 응원 ×1.1 · 자동 줍기 켬 / 멈추면 / 끔 + 줍기 button (tap = one load, hold = while held) · 길 안내 (chevron, dots on the walk route, ring + badge, edge badge, chip; steady per load) |
| 2 재고 | Bug fixes P0a/P0b · F1–F5 (빈 판매대 먼저, calm workshop inputs, distance, 창고 direct, 짐꾼 2, 가공소 2단) · F6 딸랑이 · F7 export on the freight cars · F8 서리 물류창고 (logistics art, cargo sleigh, buyers) · the late-village rules of §2 (M5) · StockLedger + 재고 tab |
| 3 기차 | Balloon loops at both ends (engine always leads), 마을 / 읍 consists (scaled existing cars), coach-door boarding, riders × ridersScale, crossings, labels, train card, label avoid rects |
| 4 사무실 | Office (stand-in house) + 4 staff (셈이, 딸랑이, 소복이, 총총이), panel tabs 재고 · 소식 · 편지 · 직원 · 통장, newspaper, 10 letter templates, 서리 은행 (civic cutaway, tellers + manager, vault), coin courier with passbook rows |
| 5 관망 | Button + automatic start after 1 min idle (3 s countdown), 9 activities, camera director, hand-back in the same frame, never spends (고용만 hires staff and porters) |
| Save | v7 (`v42` block, the v5 `bank` and v8 `logistics` slices), migration from v6, fuzz-safe sanitizer |
| Budgets | File diet (audio sprites, portrait atlas): 387 files before the new art; pile baking; Residency areas for the bank, depot and sleigh |

## 2. Review findings and what happened

### Gameplay review

| # | Finding | Result |
|---|---|---|
| H1 | 물류 금고 coins never collected after 읍, deleted on reload | **Fixed.** The courier's round keeps the 물류 금고 after 읍 (only the 역 금고 empties itself). Before 딸랑이 is hired it flies into the counter every 15 s. Its coins are saved as the `logistics` slice's `cash` and restored. Repro (`exp_coins`): the courier took 256 to 697 from the depot per run (was 0), max till 256 to 438 (was 477 and growing); mid-round save → reload kept 1,037 → 1,041 and 900 → 900 (was 1,293 → 4). Conservation 0. `v42.mjs` checks both (saved, and on the round). The census rows now also log the coins still in the tills (`v42.tills`, the 물류 금고 included). |
| H2 | 길 안내 flips between far-apart places | **Fixed.** The place chosen for a load stays while its own sink still takes some of that load; another place must take ≥ 2 more items for 4 s in a row; a new load or a chip tap chooses afresh. Repro (`exp_nav3`): 1 place for each of the four bags over 90 s (was 15 / 7 / every 10–40 s); on the final rerun the ingots changed once, when the cannery input filled. New `nav.mjs` check: 90 s standing with 6 bread + 6 smoked meat, ≤ 2 changes. The chip counts what the place takes (`빵 3`), not the whole bag. |
| M1 | Surplus destination dead code; 'stuck' trips to the trash pad | **Fixed.** `Tutorial.v42Dest` uses `Freight.sink` and the station square's 짐 싣는 곳 pad, and the chief can drop surplus there (only what nothing in the village takes now, so crossing the pad never exports bread the plaza wants). Ore with a full smelter input now guides to 짐 싣는 곳 · 33m. The pilot no longer makes 'stuck' trips (nowhere takes it: no chore), and only fetches outputs / piles whose product has somewhere to go. |
| M2 | "Nobody takes this" chip never shown | **Fixed.** The guide hides its world pieces but keeps the chip: `광장 판매대 가득 · 잠시 기다리거나 버려요`, the trash pad pulses. `nav.mjs` checks it. |
| M3 | 관망 never sets the halo's 관망 state | **Fixed.** Start / stop set `aura.observing`: pin on (1 after 3 s), ring alpha 0.6, slower motes. |
| M4 | 관망 중 돈 쓰기 = 고용만 does nothing | **Fixed.** With 고용만 an affordable staff / porter hire pad (never a building, upgrade, boat or tool pad) is an urgent chore; the pad lets him pay only those. Repro: 3 staff hired, 2,100 spent in 300 s (was 0). This found a **crash**: a staff hire pad paid by standing on it was read back after it had hired and vanished (`Office.update`), which would have shown the crash card to the designer on her first staff hire. Fixed; `v42.mjs` now pays 셈이's pad by standing on it. |
| M5 | Overflow still there at 60+ min; the 창고 becomes the new overflow | **Fixed in part** — see §3.3 for the measurements. New rules, all after village complete: a goods porter at a backing-up output loads what all the village's places want and drops it place after place; an output nobody wants goes with its own porter to the export dock; raw porters spill a full pile to the 창고 only if it stores that raw good and is under 70 %, else to the export dock; the 창고 takes overflow only up to 70 %; the merchant leaves 2 of each good on display; the food box tops up with bread before meat. Shelves, 교역소, smelter / sawmill and 창고 now meet their gates. Still open: raw piles, the dock peak, and income (+29 to +37 % against +30 %; §3.3 shows why the plan's cheap levers cannot fix it). |
| M6 | Newspaper sales headline uses the wrong count | **Fixed.** The 'sold' event carries the customer; the paper counts items per kind and names the kind sold most with its own count. |
| L1 | `{st}` placeholder in the 관망 caption | **Fixed** (the place's `lp` parameters are passed). |
| L2 | 끔 mode: tap and hold behave the same | **Fixed.** Tap (< 0.3 s) = one load up to the bag's room; hold = while held, letting go stops. `pickup.mjs` checks the stop. |
| L3 | Navigation to an input ignores porters' reservations | **Fixed** after village complete (the export dock is the better answer when porters will fill the input); before it the input as in v4.1. |
| L4 | Dock label names the depot before it exists | **Fixed** (`수출 · 기차에 실을 것 N` until the depot stands). |
| L5 | 재고 total counts the 창고 twice | **Fixed** (493 → 633 in the repro, now without the double count). |
| L6 | Urgent targets hop; the caption doesn't say what | **Caption fixed** (계산대에서 손님 돈을 받는 중, 개업 테이프를 자르러 가는 중, …). The target still follows the tutorial arrow by design. |
| L7 | Idle clock ignores HUD taps | **Fixed.** Any touch in the UI scene restarts the idle clock; only a touch on the village hands control back. |
| L8 | Chief hard to spot at zoom 1 with the stand-in halo | **CODE-2** (real `chief_fx` art). The pin above a 14-plank tower is correct: it marks the top of what he carries. |

### Robustness review

| # | Finding | Result |
|---|---|---|
| H1 | The update would pass 511 files a version | **Fixed.** `tools/build/published_files.json` records what the designer's link holds (the v4.1 list, rebuilt from 65c39f3 with `--webp`, 491 files). `build_artifact.mjs` lists the paths this build no longer has as `stale` in `artifact_files.json` (125 today), says in the publish note to send them as `null` in the first publish, and fails the build if any publish of the update would hold more than 511 files. `--record-published` updates the record after a publish. |
| H2 | Depth order inside the cutaways | **Fixed.** `Cutaway.occupy(ch)`, asked by `Character.sync` through `gs.interiors`, puts whoever stands on the floor (`footprintPoly`) into its slot: staff `@behind` (or their `slot`: the manager `@front`), everyone else `@front`. The y term stays inside the slot's band, and walkers are lifted `floorLiftPx`. A closed shell therefore covers the courier and his sack and number; someone in front of the front walls draws over the building. The depot uses the logistics manifest's bands and `frontTest`. The halo ring and glow follow him onto the raised floor. Repro (`cutaway.mjs`): chief in the bank's back half at depth 570.06 (was 525, under the floor); in the depot at 3101.11 (was 2981); the courier at a closed bank is under the shell. `v42.mjs` checks it. CODE-2's office gets this by being a `Cutaway`. |
| H3 | Bank / depot / sleigh textures never released | **Fixed.** Residency areas `bank42` (civ_bank), `depot` (lgx_center_a–d, lgx_items) and `sleigh` (veh_cargo_sleigh along its lanes); the sleigh rebuilds its anims when its page returns. Probe (camera following the chief; the test camera hook holds a permanent focus, during which Residency never evicts — that is why the review's probe kept everything): after a depot visit and 90 s at the plaza the depot pages (23.4 MiB) and the sleigh (6.7) are gone; the plaza reads 364 MiB (was 424). civ_bank stays while the plaza is near the bank (by design). |
| M1 | Partial hire-pad payment lost on reload | **Fixed** (`office.hirePaid` saved and sanitized). Repro: 168 paid → 168 after reload (was 0). |
| M2 | Porters' loads lost on reload | **Fixed.** `Game.serialize` places every carried item at its destination while that place has room at the restore, else at the next place that takes it (shelf, pantry, food box, 창고 only for what it stores, the station's input / output / pile, the boathouse, last the export dock); shelves and the food box over their caps pass the excess on. A **v3 bug** made the food box restore lose items whenever it was more than half full (its bound shrank while it filled: 16 bread + 8 meat came back as 10 + 5); fixed. The 창고 porters no longer carry log / wheat / ore / raw meat to the 창고 (it refuses them). |
| M3 | Staff all wear the same stand-in look after a reload | **Fixed.** Staff made before the townsfolk manifest arrived are redressed in their own seeded look the next time they stand still (office staff, tellers, manager, depot workers; the courier between rounds). Repro (`looks_probe`): after 45 s every office and bank staff member is a paper doll (was the village stand-in). |
| M4 | More draw calls than v4.1 | **Not fixed in CODE-1.** The likely cause is the ~13 generated `fv_*` canvas textures; CODE-2's `v42_core` page replaces them. Re-measure then. |
| M5 | Logic time probably over budget (noisy) | **Not re-measured** (machine load 10–20). Re-measure on a quiet machine in CODE-2. `V42.update` itself stays small. |
| L1 | Nav edge badge on the left HUD chips | **Fixed** (on the left half it stays below the chip column). |
| L2 | Office stand-in reads as broken | **Sign lowered onto the roof**; the building itself is CODE-2's art. |
| L3 | Counters reset on every reload | **Fixed**: depot daily sales (same day), office income bars, the bank's first day (`letters.bk`), the letters' trigger timers (`letters.tg`). |
| L4 | Canvas mode loses tints | **Not fixed** (low): the tinted pieces are placeholders that CODE-2 replaces. |
| L5 | No per-system try/catch in `V42.update` | **Fixed** (a failing system is reported with `console.error` — the suites count it — and the others go on). |
| L6 | English "I'll keep watching" | **Fixed** ("Let's wait and see"). |

## 3. Numbers (final code)

The machine was shared with Blender renders the whole time (load average 4 to 20). Bot runs use the fixed-step clock,
so their game numbers do not depend on the load; real-time numbers (panel open time, request timing) do.

### 3.1 Test suites (final code)

| Suite | Result |
|---|---|
| Node: `pilot.test` 27 · `ledger.test` 20 · `letters.test` 23 · `depot.test` 23 · `depot_parity.test` 10 · `bank42.test` 18 · `rail42.test` 58 · `save_v42.mjs --node` | all pass |
| `v42_layout.mjs` · `balanceCheck` | no problems · 0 warnings |
| `smoke.mjs` | 53/53, 0 errors (twice, the second time after the last source change) |
| `save_v2` · `save_v3` · `save_v35` · `save_v4` | PASS |
| `v3.mjs` · `v4.mjs` · `labour.mjs` | 18/18 · 46/46 · 28/28. One of four `v3` runs was 17/18: "warehouse takes overflow" waited 150 s while both 창고 porters carried the toolsmith and bakery outputs elsewhere. The other three runs passed (planks, bread) |
| `pickup.mjs` · `nav.mjs` | 31/31 · 12/12 |
| `rail.mjs` · `town.mjs` · `restaurant.mjs` · `plots.mjs` · `dog.mjs` · `zoom.mjs` · `c2.mjs` | 35/35 · 17/17 · 30/30 · 34/34 · 15/15 · PASS · 39/39 |
| `life.mjs` | 14/14 (one earlier run 13/14: "tag among kids" found no two free kids right after the snowball fight; it passed on the rerun and in every earlier run — the code it uses is untouched) |
| `v42.mjs` | 33/34, including the new checks (paying a hire pad by standing on it, the 물류 금고 saved and on the round, the chief and a teller inside the bank cutaway). The failure is the panel-open time; see below |
| `pilot.mjs` (30-min 관망 soak, 46-min save) | 10/10: 0 errors, longest no-progress 12.6 s, 0 coins spent, 0 payments, 32 / 35 / 28 starts per 10 min over 8 kinds, hand-back in the same frame, income 87 % of the arrow-only bot |
| `visitors42.mjs --base` | 2/2: 3.29 neighbours per game minute vs v4.1 3.47 (95 %) |
| `reqlog42.mjs --base` | 3/5 — see below |
| `shots_v42.mjs` | 37 screenshots, 0 errors; looked at (halo, nav chip and edge badge, office, bank and depot cutaways with people inside, sleigh, panels, 관망 caption and pin, 360×640) |

`reqlog42`: the first run counted 21 extra manifest requests in the v4.2 boot. That was a race in the test: the first
page's boot fetches were still in flight when the log started. The test now waits for the first page to finish booting,
and runs the village's first 3 s on the same fixed clock in both builds. With that, the boot requests are the same.
Up to the first sale, the builds still differ by one resident's look (an atlas pair) or voice, in either direction, and
the first sale lands at 32 or 34 s. The same difference shows between the git HEAD snapshot (3c326a2, CODE-1 before its last builder fixes) and the final code,
and it flips between runs of the same build. Cause: async lazy loads and a loaded machine, not the fixes. After the
first sale: 0 new files, none missing, 0 errors. CODE-2 should rerun it on a quiet machine.

`v42.mjs` panel time: the gate is under 100 ms. This run measured 통장 96.7 ms and 재고 1,776 ms; the run before
measured 139.8 ms. A probe opened both tabs 8 times in a row, in this build and in the git HEAD snapshot (`panel/`):
- after the first opening, both builds take 6–15 ms (통장) and 13–30 ms (재고);
- both builds stall on the first opening: 1.3 / 3.0 s here, 0.2 / 1.8 s in the snapshot;
- both have an occasional 0.3–1.0 s spike on this loaded machine.

So the stall was there before the review fixes. CODE-2 should measure on a quiet machine, and if the first opening still
stalls, build the panel ahead of time (for example, while the office is being built).

The old suites write their screenshots into `docs/previews/screens*`. Those folders were restored to their state before
these runs.

### 3.2 The reviewers' repros on the final code (`final_*` logs)

| Repro | Before the fixes | Final |
|---|---|---|
| `exp_coins` (H1) | the courier took 0 from the 물류 금고; it grew without limit; 1,293 → 4 after a reload | took 697 in the run, max 438; mid-round reload 900 → 900; Σ taken = Σ deposited (conservation 0); 0 errors |
| `exp_nav3` (H2) | 15 / 7 / every 10–40 s place changes per bag | planks, raw fish, bread + meat: 1 place each over 90 s; ingots: 2 (the cannery input filled at 38 s, then the 교역소) |
| `exp_auto` (M3, M4, L7) | 관망 pin off; 고용만 hired nobody; crash on a staff pad paid by standing | 3 staff hired for 2,100; the button toggles; a village tap hands back; 0 errors |
| `reload42` (robust M1, M2) | hire pad 168 → 0; food box 16 + 8 → 10 + 5; carried loads lost | 168 → 168; the food box keeps its stock; loads placed; sleigh loads return to the dock (by design); 0 errors in any of the 11 reloads |
| `cutaway` (robust H2) | the chief inside the bank at depth 525 (under the floor), in the depot 2981 | 570.06 inside the bank, 3101.11 in the depot; the courier at a closed bank is under the shell |
| `looks_probe` (robust M3) | every staff member in the village stand-in look | after 45 s every office and bank staff member is a paper doll |
| `tex_probe2` (robust H3) | the plaza read 424 MiB after a depot visit | plaza 371.9 → depot 412.8 → back at the plaza 364.6 MiB: the depot pages and the sleigh are gone, `civ_bank` stays (near the plaza) |

`tex_probe2` is the reviewer's probe with the camera following the chief. The original probe uses the test camera hook,
which holds a permanent focus, and Residency never evicts during a focus; run that way it still reads 424.

### 3.3 Late village (gameplay M5): census bot, 46-min v4.1 save, 60 game minutes

Same census tool and smart bot in all three runs. v4.1 is the HEAD-of-v4.1 copy with its own bot. "As reviewed" is the
gameplay reviewer's run of CODE-1. "Final" is the final code. The 0–25 min window of a second final run is in brackets.

| Measure | v4.1 | As reviewed | Final | Gate |
|---|---|---|---|---|
| Market shelf empty: 빵 / 훈제 고기 / 구운 생선 | 21 / 55 / 5 % | 8 / 27 / 1 % | **0 / 10 / 0 %** (0 / 27 / 0) | ≤ 10 % each: ✓, meat borderline |
| 교역소 empty: 판자 / 주괴 | 92 / 97 % | 71 / 76 % | **0 / 0 %**; at most the 2 display items: 75 / 74 % | ≤ 40 % ✓ (display rule) |
| Smelter / sawmill output ≥ 90 % | 65 / 59 % | 26 / 3 % | **15 / 2 %** | ≤ 30 % ✓ |
| Grill / bakery / smokehouse output ≥ 90 % | 10 / 28 / 51 % | 41 / 11 / 40 % | 40 / 21 / 24 % | — |
| Any raw pile ≥ 90 % (fish · log · wheat · ore · meat) | 100 % (95 · 77 · 99 · 100 · 100) | 97 % (58 · 2 · 4 · 85 · 76) | **97 %** (57 · 4 · 16 · 73 · 86) | ≤ 50 % ✗ |
| 창고 average | 4 | 174 | 168 | ≥ 40 ✓ |
| Dock: card crates + surplus, max / end | 3,385 at the end, +50 per min | 138 / 39 | 268 / 88 | ≤ one train load ✗ (bounded) |
| Income per minute | 1,851 | 2,380 (+29 %) | **2,530 (+37 %)** (2,395: +32 %) | +15–30 % ✗ |
| Items exported by train | 0 | 599 | 625 | — |

What the numbers mean:
- **교역소 0 %** comes from `trade.displayKeep`: after village complete the merchant leaves 2 of each good on the
  shelf. The shelf is still sold down to those 2 about three quarters of the time. The merchant buys one every 0.28 s,
  faster than the village makes planks and ingots, so the goods sell out; they no longer wait in full outputs.
- **Raw piles**: the ore and meat gatherers bring more than their stations use, even with 가공소 2단. Full piles now
  spill to the 창고 (raw fish only, while it is under 70 %) and otherwise to the export dock, but they refill within
  minutes. The levers are in the plan §4.5 (`surplus.pileAt` / `pileKeep`, fewer ore and meat gatherers).
- **Dock**: the crates waiting there stay bounded. Their room is the next train plus the depot's free space, so with
  the depot built about one big-train load (88) of surplus waits for the sleigh. The 268 peak was mostly order-card
  crates (up to 180) in the first 18 minutes, before the trains caught up with them.
- **Income** is +29 to +37 % depending on the run and window (same-window v4.1 = 1,814 for 0–25 min). The cap is +30 %.
  The rise comes from the shops: goods that used to sit in full outputs are now sold. The plan's first two levers barely
  touch income: train exports pay 20–30 coins per minute (about 1 %), and the 물류창고's sales pay 34 per minute once it
  stands (1.4 %; measured with the new `dep` field of the census rows). Lowering both would remove about 1–2 points,
  not 7. The third lever, F5 (가공소 2단), works directly against the output and pile gates above. So neither was
  changed; this is a designer decision (§4).

Fresh game, 75 min (census `fresh75`), as reviewed → final. The first 20 minutes match (income 577 → 545, village
complete at 19.5 → 20.0 min). Minutes 40–60:
- market empty 13 / 42 / 5 → 6 / 33 / 1 %;
- 교역소 empty 83 / 80 → 0 / 0 %;
- smelter output ≥ 90 %: 37 → 23 %;
- income 2,157 → 2,432.

The meat shelf still misses on a fresh game.

### 3.4 Pacing (fresh game, smart bot, fixed step)

| | Village complete | tower_east | Station | 5 shops | 읍 | Longest gap |
|---|---|---|---|---|---|---|
| v4.1 | 19.8 | 20.1 | 22.1 | 38.7 | 48.2 | 5.2 |
| Final v4.2 | 19.3 (−2.5 %) | 19.7 | 22.1 | 37.0 (−4.3 %) | 44.8 (−6.9 %) | 3.0 |

Gates: village complete ±5 % ✓, 5 shops ±5 % ✓, 읍 ≤ +5 % ✓. 0 stuck, 0 accidental payments, 0 errors.

## 4. Open items for CODE-2

- Swap the placeholders by key (plan §16.2): `chief_fx` + `ui5` into the `v42_core` page (this should also bring the
  draw calls back, robust M4), `train2` cars and loop decals, the `office` cutaway (it gets slotting, lift and the
  closed-shell cover from `Cutaway` for free; add a Residency area `office` / `officeInside`), `officefolk` anims (the
  tellers' counter-height anims), `chief2`, `audio7`.
- Re-measure on a quiet machine: draw calls (M4), logic ms/tick (M5), texbudget per view, the 20-min soak.
- Publish: send the `stale` paths of `artifact_files.json` as `null` in the first publish, then run
  `node tools/build/build_artifact.mjs --record-published`.
- Late-village balance still open (§3.3), for the designer to decide:
  - the raw piles of the ore, meat and fish lines stay full most of the time (their gatherers out-bring their
    stations);
  - the meat shelf misses ≤ 10 % on a fresh game;
  - income is +29 to +37 % against a +30 % cap. Exports and the 물류창고's sales are only 2–3 % of income, so the
    plan's first two levers cannot close the gap; F5 can, at the cost of the output gates.
  The measures and levers are in the plan §4.5.
- Rerun on a quiet machine: `reqlog42.mjs` (the first-loop resident look varies run to run under load) and the
  `v42.mjs` panel-open time (the first opening stalls 1–3 s here in both builds; later openings take 6–30 ms).
- The census rows now carry the 물류창고's daily sales (`v42.dep`) and the uncollected till coins (`v42.tills`), so
  income can be split by source.
