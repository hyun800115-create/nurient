# review:robust

# v4.2 final review (merged tree): robustness and looks

**Verdict: the merged v4.2 tree is safe to publish on saves, budgets and performance. There are no High findings.**

- **Saves hold.** Coins, part-payments and helpers were never lost, with 0 page errors and no save moved aside, in all of these:
  - 14 old saves: v3.5, v4.1 (including v4.1 saves that have the 나룻배 but no 생선 짐꾼), and 6 real v4.2 saves made with the published code `3236722`;
  - 14 reloads in the middle of a purchase;
  - 2 reloads while a 창고 직원 was still walking in.
- **No duplicates after a reload.** No porter, 짐꾼 2, 창고 직원, 서빙 직원 or table is ever doubled.
- **Budgets hold.** Draw calls, display objects, texture memory and logic time are within budget. The texture tour peaks at 450.6 MiB, under the 455 MiB limit. The 10-minute soak and the artifact build are also clean.
- **Three Medium items are worth fixing before the designer opens the update:**
  - **#1:** on the first second after loading a busy v4.2 save, 2–3 offer banners fire together, so only the last one is seen. The 테이블 늘리기 banner is always one of the ones lost, and it never comes back.
  - **#2:** buying 테이블 늘리기 moves a lamp post onto a back-yard seat.
  - **#3:** the server is hidden behind the restaurant for half of his back-yard walk.
- **Counts:** High 0, Medium 3, Low 5, Info 3 (11 numbered findings).

## What was reviewed and how

- **Tree:** `/home/user/nurient/frost-village`.
  - HEAD is `ad855e7` plus the uncommitted integration changes: `src/entities/Worker.js` `leaveToOwnPorter`, a comment in `src/data/balance.js`, `tools/test/store42.mjs`, and docs. The newest of these is from 03:23.
  - No file under `src/`, `tools/` or `docs/` changed while I worked (checked with `find -newermt`).
- **Base for comparisons:** the published phone build `3236722`, copied into scratch (`base42/`). Each comparison ran in the same browser, at the same time as the merged tree.
- **Clock:** the fixed-step clock (`tools/test/fv_step.mjs`). Headless Chromium with SwiftShader WebGL.
- **Machine load:** other sessions shared the machine, and the load average was 27–30 on 4 cores. Timings are indicative only. Texture, draw-call, object and save results do not depend on load.
- **Repo:** the only repo file I wrote is this report. Nothing was committed. The save version stays 7.
- **Scratch folder:** `/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/frv/`. Every evidence path below is relative to it.

## Findings

### Medium

**1. After loading a busy v4.2 save, 2–3 offer banners fire in the same frame, so only the last one is seen. Each is shown once per save, so the hidden ones never come back.**
- **Cause:**
  - `LineUpgrades.update()` creates every due pad in one pass. `makePad()` calls `gs.ui.banner()` for each new pad and marks it seen in `v42.seen`.
  - `UI.banner()` (`src/scenes/UI.js:593`) replaces the text at once: there is no queue.
  - `offers()` puts 테이블 늘리기 first, so its banner is always the one overwritten.
  - On a loaded save, the restored `full` timers and `busyT` / `served` make several offers due in the very first pass.
- **Measured** (`firstload.mjs`): the 6 real v4.2 saves, loaded into the merged tree, with every banner and toast recorded for 3 game minutes.

| Save | Banners in the same frame (the last is the only one seen) |
|---|---|
| `v42_smart46_late` | "큰 식당에 손님이 많아요!" → "주괴가 쌓여요" → "훈제 고기가 쌓여요" |
| `v42_smart46_nodock_paid310` | "큰 식당에 손님이 많아요!" → "구운 생선이 쌓여요" → "빵이 쌓여요" |
| `v42_pure45_nodock` | "큰 식당에 손님이 많아요!" → "구운 생선이 쌓여요" → "판자가 쌓여요" |
| `v42_smart46_rich` | "큰 식당에 손님이 많아요!" → "주괴가 쌓여요" |
| `v42_smart35_nodock_paid250` | "구운 생선이 쌓여요" → "빵이 쌓여요" |
| `v42_smart25` | none (nothing due yet) |

  - "식당 뒤뜰에 테이블을 늘릴 수 있어요" is overwritten in all 4 saves where it fires. It is the one explanation of the touch's main new purchase.
  - Within the first minutes, 4–6 new pads stand in the village (for example `tables1`, `p2_grill`, `st2_grill`, `p2_sawmill`, `st2_sawmill`, `st2_bakery`).
- **Who is affected:** a v4.1 save meets the same burst right after the "새로워진 것" card closes (`fromOld` gate). In normal play offers become due one at a time, so this is the update moment, the designer's first look.
- **Fix (either):**
  - Give `UI.banner()` a small queue: show the next after the current one fades, with the same once-per-save keys.
  - Or, in `LineUpgrades.update()`, show at most one banner per pass and mark the others seen only when shown. The crew banner already has `bannerGap` for the same reason.
- **Evidence:** `out/firstload.json`, `out/firstload.log`.

**2. 테이블 늘리기 (level 1) moves the terrace's back lamp onto a back-yard seat. The post then stands through the guest sitting there.**
- **Code:** `BigRestaurant.setTables()` moves `lampObs[1]` to `L.lampMoved` = (−6.3, 4.4) m, which is (−686, 638) px.
  - The level-1 table at (−5.5, 3.1) m has its right seat at (−682, 644): **7 px from the post**.
  - Every player who buys the first 테이블 늘리기 has this seat. It is 1 of 4 back-yard seats at level 1 and 1 of 8 at level 2.
- **What it looks like:** a guest seated there has depth 683 and the post has depth 638. The post rises out of the guest's head and shoulders, and the guest's food bubble sits on the lamp head.
  - Evidence: `shots/looks/lamp_seat_h10_z1.7.jpg` (day) and `lamp_seat_h22_z1.7.jpg` (night); numbers in `out/looks3.json`.
- **Two side effects of the same move:**
  - **Stale x-ray box.** `Game.addOccluder()` stored the lamp's x-ray box at creation, and `setTables` never updates it. The box stays at (−674, 717) while the post is at (−686, 638), so the lamp fades for people near its old spot, not its new one.
  - **Night light left behind.** The night light comes from `Neighbours.onTownManifest()`, which reads `gs.lamps` once at load. In the session where the tables are bought, the glow stays at the old spot until the next load. After a reload it is right, because the restore moves the lamp before the town manifest arrives.
- **Fix:**
  1. Choose a `lampMoved` spot at least 40 px from every level-1 and level-2 seat, for example the yard corner beyond the level-2 tables. Add a "distance to the nearest seat" assert to the restaurant test.
  2. In `setTables`, update the `gs.occluders` record whose `img` is `lm.im` (its `x`/`y`). Also move or re-add the matching `DayClock` light.

**3. Back-yard guests and the servers are hidden behind the opaque restaurant building for much of their back-yard trip.**
- **Cause:** `L.backPath` runs between the terrace and the building, behind the building's roof on screen. The restaurant occluder is a `TownBuilding` occluder with `mainOnly`. `Occlusion.js:118` fades it only for the chief or a character with `xrayMain`, and nobody in the restaurant sets that flag.
- **Measurement** (`looks2.mjs`; 46-min save; tables level 2; busy restaurant; 120 game s in 0.25 s samples). "Hidden" means the building, at alpha ≥ 0.9, is drawn over at least 2 of 3 body points.

| Who | Share of back-yard walking hidden | Samples |
|---|---|---|
| Guests going to a back-yard seat or leaving it | **28.5 %** | 125 of 439 |
| 서빙 직원 on the back leg | **47.2 %** | 161 of 341 |

  - Longest hidden stretches for one guest: 2.0, 2.0, 1.75, 1.75 and 1.75 s.
  - The server carries the plates that show the new 서빙 직원 2 purchase working. For half of that walk the player cannot see him.
  - Evidence: `out/looks2.json` (`vis`), `shots/looks/rest_backpath_z1.2.jpg`.
- **Fix (either):**
  - Set `xrayMain = true` on restaurant guests and servers while they are on `backPath`, the way train visitors fade buildings. The alpha-mask test already runs, so this costs nothing.
  - Or route `backPath` round the terrace's open (−X) side.

### Low

**4. At phone size the prices of the new restaurant pads are covered, and so is the 테이블 늘리기 label.** This happens at 360×640 and 390×844, in Korean and English.
- **테이블 늘리기 pad** at (−817, 699):
  - Its label (depth 2699) lies under the food bubble of the guest at the terrace seat (−749, 728).
  - Its price is drawn on the ground (depth −11800), as on every pad. That spot is under that guest and the terrace's back lamp.
  - The pad appears only when the line waits for seats (`busyT` ≥ 60 s), so that seat is almost always taken while the pad shows.
- **서빙 직원 2 pad** at the staff spot (−523, 1072): a lamp post stands on its price. "1,000" reads "1,00".
- **Evidence:**
  - `shots/labels/360x640_ko_4_tables_pad.jpg`, `360x640_en_4_tables_pad.jpg`, `390x844_ko_4_tables_pad.jpg`;
  - `shots/labels/*_5_srv2_pad.jpg`;
  - depths in `out/padprobe.json`.
- **Fix:** move `L.padOff` about 0.6 m further into the open yard, and move the 서빙 직원 2 pad half a metre off the lamp.

**5. With 3 or more 창고 직원, two of them share one waiting spot. Idle, they stand inside each other.**
- **Cause:**
  - The two who come with the 창고 get the v3 spots in the `WarehousePorter` constructor: outPad +40,+48 and **+74,+48**.
  - `WarehouseCrew.spawn()` then sets the third one's home with `WarehousePorter.homeFor(gs, W, 2)`, and `row[2]` is **+74,+48** too.
- **Measured** (`crew.mjs`): homes (−133, 1487), **(−99, 1487), (−99, 1487)**, (−247, 1493), (−133, 1521). This is already so before any reload, in every village whose crew has grown to 3: that is 9 of the 12 saves I loaded.
- **Fix:** have `homeFor` skip spots within 20 px of another crew member's `homePt`, or start the row after the v3 spots.

**6. English (and one Korean) wording of the new strings.**
- **짐꾼 2 banners and pads** (`strings.js:720`) use the lower-case item name with "is". The rendered banners, by line:
  - "grilled fish is piling up"
  - "planks is piling up"
  - "ingots is piling up"
  - "can is piling up" / "can porter 2"
  - "fish is piling up" / "fish porter 2"
  - "Tools is piling up" / "Tools porter 2"

  The banner starts in lower case, the verb does not agree with plural items, and the capitals are mixed (`shots/labels/360x640_en_6_p2_dock.jpg`, `360x640_en_6_p2_toolsmith.jpg`). Fix: use a separate English label per line, for example "Fish is piling up" and "Fish porter 2".
- **`news_crew`:** "{a} new warehouse hands came" prints "1 new warehouse hands came" on a day with one arrival. That is the usual case, because the crew grows by at most one a minute.
- **`crewCame`:** "One more warehouse hand came" reads better as "Another warehouse hand has arrived".
- **`navArrive`:**
  - English: "You are at the {place}" gives "You are at the Loading dock at Frost Station".
  - Korean: '{place}에 왔어요' gives "빈 부지 (집 짓기)에 왔어요".

**7. A save that has the 서빙 직원 2 but not the first server loses the second server. The 1,000 coins paid for him are lost.**
- **How it happens:** `restore()` only sets `wantServer2`. `update()` hires him once `this.server` exists. But `serialize()` writes `server2` only when `this.server2` exists.
- **Reach:** only a damaged or edited save. The pad is offered only when a server exists, so normal play cannot get there. My sanitizer fuzz found it.
- **Fix:** `server2: (this.server2 || this.wantServer2) ? 1 : undefined`.

**8. After a reload, a part-paid 짐꾼 2 pad can stay hidden behind unpaid ones.** I found this by reading the code and did not reproduce it.
- **How it happens:** `LineUpgrades.update()` fills the two `MAX_P2` slots in `P2_LINES` order. If three or more lines are due, two unpaid pads earlier in the order can take both slots, and the paid pad (for example `p2_dock`, the last line) is not shown.
- **What is kept:** the coins are safe in `this.paid` and saved in `offerPaid`.
- **Effect:** the player sees the half-paid pad vanish until a slot frees.
- **Fix:** before placing pads, sort the due offers so that ids with `this.paid[id] > 0` come first.

### Info

**9. The day's new counters are not saved.** `VillageNews.today` has never been saved; that was already the case for visitors and sales. So `today.crew` and `today.tables` are lost on a reload, and that evening's paper leaves out the arrivals and the new tables. In the same way, `Workshop.lastRun` (the tool rotation) restarts at the first kind after a load. Both are harmless.

**10. The sanitizer keeps 8 `offerPaid` entries** (`Save.js:304`). At most 7 pads can hold part-payments at once: 3 line offers, 2 짐꾼 2 and 2 restaurant pads. Nothing can be lost today. If `MAX_OFFERS` or `MAX_P2` grows, raise the cap too.

**11. "Duplicate porter looks" (5–13 in every save) is by design.** `Porter.pickKey` draws from two looks per role. No helper is duplicated: the per-station porter counts are exactly 1 everywhere, as #12 shows.

## What passed (numbers)

**12. Save migration and reloads (`mig.mjs`).**
- **Method:**
  - Load each save into the merged tree and census it (A).
  - Play 60 s and save (B).
  - Reload (C); save again at once and reload (D), as a phone reopened quickly would; play 5 s.
  - Each census counts every helper kind, the 창고 crew, the restaurant (tables, seats, server 2, staff), coins, part-payments, page errors and `saveLost`.

| Save | Refund expected → got | Coins saved → after reload | 생선 짐꾼 | 창고 crew B/C/D | Notes |
|---|---|---|---|---|---|
| `v35_save_38min` | 0 → 0 | 1345 → 1345 | 1 | 3/3/3 | |
| `v41_save_smart_25min` | 0 → 0 | 619 → 619 | 0 (no boat yet) | 0 | |
| `v41_save_smart_46min` | 0 → 0 | 8298 → 8298 | 1 | 3/3/3 | |
| `v41_smart35_nodock_paid250` | **250 → 250** | 2603 → 2603 | **1** | 3/3/3 | 나룻배 without 생선 짐꾼; refund once |
| `v41_smart46_nodock` | 0 → 0 | 8298 → 8298 | **1** | 3/3/3 | nothing paid |
| `v41_pure45_nodock_paid599` | **599 → 599** | 2562 → 2562 | **1** | 3/3/3 | |
| `v42_smart25` | 0 → 0 | 619 → 619 | 0 (no boat yet) | 0 | real v4.2 save |
| `v42_smart35_nodock_paid250` | **250 → 250** | 2603 → 2603 | **1** | 2/2/2 | real v4.2 save |
| `v42_pure45_nodock` | 0 → 0 | 1963 → 1963 | **1** | 3/3/3 | real v4.2 save |
| `v42_smart46_nodock_paid310` | **310 → 310** | 8608 → 8608 | **1** | 3/3/3 | real v4.2 save |
| `v42_smart46_late` | 0 → 0 | 9566 → 9566 | 1 | 3/3/3 | real v4.2 save |
| `v42_smart46_rich` | 0 → 0 | 8298 → 8298 | 1 | 3/3/3 | 짐꾼 2 at 굽는 곳 + 빵집 stay single; part-payments `st2_sawmill` 77 and `p2_smelter` 123 survive both reloads |

- **Every save:**
  - each station's porter exactly 1, and the porter counts B = C = D;
  - restaurant tables 4 at level 0 and staff ≤ 3;
  - no `porter_dock` pad left behind;
  - 0 page errors, `saveLost` 0, saved version 7.
- **Two more saves on the earlier harness:** `v41_save_pure_25min` and `v41_save_pure_45min` passed the porter, coin and refund checks on a census that did not yet count the crew (`out/mig_old_partial.log`).
- **The real v4.2 saves** were made by playing `3236722` (`gen42.mjs`; 0 page errors, `saveLost` 0, 4,452–7,818 bytes).

**13. Sanitizer fuzz (`sanfuzz.mjs`).**
- 3,000 mutated saves went through `Save.js` sanitize, then serialize and sanitize again: 0 problems.
- All 12 fixtures and the generated v4.2 saves are idempotent.
- Largest save: 7,372 bytes.

**14. Reload in the middle of a purchase (`fuzz.mjs`, 14 trials, 0 problems).**
- Each trial stands the chief on a new pad for a random 0.37–3.17 s, saves, and reloads the page with localStorage kept.
- Scenarios: 테이블 늘리기 1 and 2, 서빙 직원 2, 짐꾼 2 at 통조림 / 대장간 / 배 창고, and the 나룻배 (its 생선 짐꾼).
- Cut points covered: before paying, part-paid (167–453 coins), and just after completion.
- Every trial kept coins plus all part-payments to the coin, and bought each thing exactly once (tables = 4 + 2 × level). Helper counts were unchanged and there were 0 page errors.

**15. 창고 직원 reload while he walks in (`crew.mjs`).**
- Two trials:
  - 3 → 4 crew, saved 3.7 s into the walk;
  - 3 → 5 crew, saved 1.0 s into the walk.
- In both, after the reload and again after a second immediate reload:
  - the count is unchanged (4 → 4 → 4 and 5 → 5 → 5);
  - nobody is still "arriving", and everyone is within 4 px of home;
  - the 창고's list matches the porters list, and there were 0 page errors.
- The only flag was the shared spot in #5, which is not reload-related.
- A third trial hit a 30 s page-reload timeout in the harness under machine load and is not counted.

**16. Tables: collision and depth (`looks.mjs`).**
- The 4 back-yard tables overlap no collision shape. All 8 seats and their serve points are inside the walkable area.
- No serve point is blocked, and the back path is clear.
- Depth is right for every table, seat and guest (`depthBad` 0). Gaps between tables are 20–22 ground px.

**17. 잡화점 line x-ray at zoom 0.6 / 1.2 / 1.7, day (10:00) and night (22:00).**
- With 6 waiting at the western spot (`w_m2`), all 6 covered customers fade to 0.32 and none stays opaque. The "판매대가 비었어요" label shows, above the line (depth 3118).
- The other two layouts: `e_m1` 5 of 6 covered and all faded; `se_l1` 3 of 6 covered and all faded.
- Evidence: `out/looks.json`, `out/looks2.json`, `shots/looks/store*.jpg`.

**18. New labels at 360×640 and 390×844, Korean and English (`labels.mjs`; 44 screenshots in `shots/labels/`).**
- Cases covered:
  - the board's "where to bring" rows and the 길 안내 button;
  - the pinned chip ("→ 서리역 짐 싣는 곳 · 87m" / "→ Loading dock at Frost Station · 87 m");
  - "판매대가 비었어요" / "Shelf empty";
  - the 테이블 늘리기, 서빙 직원 2 and three 짐꾼 2 pads with their banners;
  - the 창고 직원 banner and toast, and the 나룻배 banner with "생선 짐꾼도 함께 와서 잡은 생선을 날라요".
- Every banner, subtitle, toast and chip fits on screen at 360 px wide. The 나룻배 subtitle needed no shrinking (scale 1); I checked the others by eye in the screenshots.
- The only problems are #4 and #6. 0 page errors.

**19. Draw calls, display objects and textures (`perf.mjs`).**
- **Setup:** the same 46-min save in base and merged, measured alternately in one browser. Draws are per frame, averaged over 20 frames. "Res" is the Residency source-sum in MiB.
- **Touched village:** the merged village with tables level 2, 서빙 직원 2, a 창고 crew of 6 and a busy restaurant, against base with the same rush.

| View | Base: draws / objects / res | Merged: draws / objects / res | Base busy | Merged touched |
|---|---|---|---|---|
| plaza | 15.8 / 1161 / 370.7 | 15.4 / 1194 / 374.7 | 18.8 / 1415 / 394.6 | 18.6 / 1456 / 390.5 |
| plaza z0.6 | 20.8 / 1334 / 391.3 | 22.0 / 1380 / 400.0 | 23.8 / 1692 / 403.9 | 23.0 / 1741 / 405.9 |
| restaurant | 13.0 / 1163 / 398.9 | 13.0 / 1236 / 403.7 | 15.3 / 1586 / 402.7 | 15.4 / 1598 / 403.5 |
| restaurant z0.6 | 16.6 / 1268 / 398.9 | 16.6 / 1322 / 403.7 | 17.6 / 1666 / 402.7 | 17.2 / 1661 / 403.5 |
| 창고 | 16.0 / 1254 / 398.9 | 16.0 / 1336 / 403.7 | 16.8 / 1420 / 403.0 | 16.2 / 1462 / 403.5 |
| 잡화점 | 16.0 / 1205 / 399.0 | 16.0 / 1285 / 403.7 | 16.0 / 1524 / 403.0 | 15.0 / 1504 / 403.5 |

- Draws change by −1.0 to +1.2. Display objects go up by 33–82 (the tables, their props and the extra helpers). Residency goes up by 4–9 MiB.
- GL textures peak at 408.9 MiB plus 33.7 MiB of render targets.

**20. Logic time (`perf.mjs`).**
- Four interleaved rounds of 300 fixed steps each, with base and merged alternating.
- Per-step medians: base 10.9 / 7.1 ms, merged 7.3 / 6.2 ms (plaza / restaurant view). The round averages are dominated by machine-load spikes.
- The V42 systems' own time with everything touched: 0.54 ms per step against 0.36 in base.
- No measurable cost.

**21. 10-minute soak, merged, late village** (`soak.mjs 10 merged`).
- **Setup:** the 46-min save with tables level 2, 서빙 직원 2 and a crew of 6. A tour runs every 30 s (plaza, restaurant, 창고, 잡화점, board with a pinned 길 안내, dock, station, office), with 관망 one minute in five.
- **Results:**
  - 0 page errors, 0 warnings, `saveLost` 0;
  - Residency 369–418 MiB, 0 page refusals;
  - JS heap flat at 104 MB from minute 3 to 10;
  - 54 DOM listeners throughout, 1 JS interval and no pending JS timeouts, 4–12 Phaser timers, 9–23 tweens;
  - scene events 229–230;
  - crew 6, porters 16 and seats 16 constant;
  - 356 meals served, save size 7.6–8.5 KB.
- Evidence: `out/soak_merged.json`, `out/soak.log`.

**22. Texture tour (`tour.mjs`, the designer screenshot tour, 43 shots).**
- **Peak 450.6 MiB** at `17_depot_revealed_390x844_ko` (the verify run had 451.4), under the 455 MiB limit. Most display objects in one view: 1,430 (`19_observe`).
- `texbudget.mjs` passed 9/12 checks. Every hard limit holds: any view 411.7, GL total 448.7.
- The three misses are the long-standing soft targets, unchanged from CODE-2: title 123.8 / 90, plaza 353.4 / 300, tour 411.7 / 300.
- Evidence: `tour/textures.json`, `out/texbudget.json`.

**23. Artifact build dry run** (`tools/build/build_artifact.mjs --webp` into `build/`).
- **Files:** 413 (412 plus the page), 65.72 MB in total. The largest is `game.js` at 1.27 MB (137 modules).
- **Batches:**

| Batch | Files | Size | Also carries |
|---|---|---|---|
| 0 | 125 | 30.66 MB | the page and 125 stale `null`s, so 251 entries |
| 1 | 245 | 29.29 MB | — |
| 2 | 42 | 5.76 MB | `game.js`, lib and the manifests |

- Every batch is within 255 entries and 64 MB.
- The version stays under 511 files throughout: 491 live, 125 leave in batch 0, and 46 paths are new.
- The stale list and the file set are identical to the v4.2 verify build.

## Not done or limited

- **Timings:** the machine was shared and loaded throughout, so they are medians of interleaved runs.
- **Real devices:** I did not test on a phone. All rendering here is SwiftShader.
- **#8:** found by reading the code; not reproduced in a browser.
- **The 창고 직원 reload probe:** 2 good trials of 3.

## Evidence (scratch, `/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/frv/`)

- **Harnesses:**
  - `lib.mjs` (boot and census), `gen42.mjs` (real v4.2 saves in `saves42/`), `mig.mjs`, `fuzz.mjs`, `crew.mjs`, `sanfuzz.mjs`, `firstload.mjs`;
  - `looks.mjs`, `looks2.mjs`, `looks3.mjs`, `padprobe.mjs`, `labels.mjs`;
  - `perf.mjs`, `soak.mjs`, `tour.mjs`.
- **Results:**
  - `out/mig_*.json`, `out/fuzz_all.json`, `out/crew.json`, `out/sanfuzz.json`, `out/firstload.json`;
  - `out/looks*.json`, `out/padprobe.json`, `out/labels.json`;
  - `out/perf.json`, `out/soak_merged.json`, `out/texbudget.json`, `tour/textures.json`;
  - `out/build.log`.
- **Screenshots:** `shots/looks/` (lamp on the seat, back path, store x-ray), `shots/labels/` (44 phone screenshots), `tour/` (43 tour shots).
