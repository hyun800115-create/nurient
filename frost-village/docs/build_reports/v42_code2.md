# v4.2 CODE-2 — the new art wired in, the late-village raw routing, tests and numbers

CODE-2 swaps CODE-1's stand-ins for the finished v4.2 art (`CONTRACT_V42.md`, `docs/v42_plan.md` §16.2), adds the
designer's default for the late village's raw surplus, and runs the suites, bots, budgets, screenshots and the artifact
build. The art folders (`assets/chief_fx`, `chief2`, `office`, `officefolk`, `train2`, `ui5`, `audio7`) are read-only
here; what they would need is listed in §7. Nothing is committed; the lead commits.

Evidence (scratch): `/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/`
- `v42code2_census/` — census runs (`b60`, `d60`, `fresh25`), the pile-flow probes (`flow_*.json`), the crash repro;
- `v42code2_probe/` — texture views (`tv41_*`, `tv42_*`), the audio7 probe, the office / train probes;
- `v42code2_suites/` — every suite log, `summary.txt`, the artifact build logs;
- `v42code2_perf/` — the v4.1 / v4.2 draw-call and logic-time comparison (`perf_cmp.json`).

The machine was shared with other art and code agents the whole time (load average 7 to 18 on 4 cores), so wall times
and ms numbers are relative only.

## 1. What is wired

### A. `chief_fx` + `ui5` → one `v42_core` page
- `tools/build/pack_pages.py` packs the halo / glow / sparkle / pin / notch / navigator art and the ui5 HUD icons and
  status dots into `_packed/v42_core.png` (3.14 MiB); ui5's panel frames go to the on-demand page `ui5_icons@panels`
  (1.03 MiB, loaded only while the 촌장 사무실 panel is open). The lean `chief_fx` and `ui5` manifests ride inside
  `_packed/index.json` (`manifests`), so **after the first sale the game fetches exactly one new file**
  (`v42_core.png`; `reqlog42` checks it). The page's frame list is embedded too.
- `src/systems/v42/art.js` (new) asks for the page 3 s after the first sale (or at once in a save past the first hire), and
  for `chief2`'s manifest once the village is complete or the office stands.
- `ChiefAura` builds on the generated rings of minute 0 and re-skins to the art when it arrives: the calm ring, the
  gold ring while he works, the back glow, sparkles, the 별 pin and the 읍 notch (all NORMAL blend, one page); at night
  DayClock adds an ADD `fv_glow` lamp behind him so the glow reads through the night tint. `Navigator`: chevron, dots, destination ring, badge and the edge arrow on the ui5 chip plate. HUD chips
  (`UIv42`), the settings tab icons, the train card's car icons and the office panel (tabs, icons, the 재고 rows on the
  chalkboard with glossy status dots, the letter paper) use ui5.
- Canvas mode (review L4): with the art in, the tab and chip tints are no longer needed (the plates carry the colour);
  only the count chip keeps a light tint that Canvas drops.

### B. `train2` cars, loop decals and props
- Coach 솔방울호, box car (door opens at the stop, crates on its floor) and flat car (crates at `cargoSlots`): pages
  4.35 / 4.68 / 3.05 MiB by the manifest's `pageRule` (`pack_pages.py` TRAIN rule `v42-dirs-2`); the engine keeps its
  5-dir page (5.51 MiB with fine widths). Train pages in all: **17.59 MiB** (plan 17.6; gate: v4.1 + 14).
- `couplerOverride`: the engine's back coupler is 1.375 m (was 1.22): every car behind it sits 0.155 m further back
  (`Rail.js`, `rail42.test.mjs` 58/58, plan §5.2 updated).
- `curvePlacement`: each car at the midpoint of its bogie chord (± 0.4 × length), headings from the chord with
  hysteresis — on the R 1.75-cell loops the cars no longer push apart; `rail.mjs` checks the chord midpoint (≤ 4 px).
- Loop decals (`rail_loop_ours`, `rail_loop_town`) are baked into the ground with the rail tiles (`RoadPaint`,
  `train2_rails` is bake-only and lossless in the WebP build); `RailProps` (new): the low snow fence on our loop's
  straight (replaces CODE-1's log fence), the switch stands (green; yellow + 철컥 while a train trails through), the
  water towers that pour while the engine rounds their loop, the wheel squeal while a car on screen is on a curve, and
  the stands' lamps at night. Coach windows and lanterns light up at night (`lightPoints`), labels follow the cars.
- **Town loop tip (art M3): kept, documented.** A car rounding the town loop reaches x 6176, 32 px past
  `WORLD.width` 6144. In play the camera stops at 6144, so the tip is cut by the screen edge (the screenshot
  `05b_loop_town` now uses the bounded camera); only the free overview shows the void past the edge. Moving the loop
  is a plan / `world.js` / decal change (T2, turnout, stops, crossing 33) — see §7.

### C. 촌장 사무실 cutaway, officefolk staff, chief2
- `office_bld` is split into `@closed` (resident with the office's area) and `@inside` (on demand, loaded when you come
  near and the roof fades). `OfficeBuilding` is a full `Cutaway` (layers, slots, lift, the sheared sign, mailbox flag,
  the 재고판 bars on the back wall, desk lamps / stove / door lantern at night, typewriter and stove loops, the safe).
- `officefolk`: `installOfficefolkRuntime(TF)` after `TF.init` (`src/core/folk/*_compose.js` are the art's composers);
  `Staff.js` rewritten on `TF.pick` (seated desk routine per role, walk-ins, the aide, 딸랑이's `carry_sack` /
  `scoop` / `hand_over` and the flying sack). The tellers of 서리 은행 stand behind the counter at its lift, the
  manager sits.
- `chief2`: its anims merge into the chief (`extends`), loaded on demand while one plays: 관망's desk work at his own
  desk (sit_write / read / eat / doze by the hour), lunch at a terrace table, talk / wave / warm hands, 촌장 응원.
- Fix found by the census (§3): when the office's inside page left memory, its stove-fire anim stayed registered and a
  hidden stove sprite started it → a null frame crashed the game about 15 minutes into a 46-min save.
  `Residency.evict` now drops every anim made from the page and stops whatever plays one (also inside containers).
- Seated clerks: drawn in the office's `@behind` slot (`Cutaway.occupy` tests the floor under the chair) and with
  their heads (`Office.wantStaffPages` asks for the townsfolk heads' `@soc` pages, where officefolk's `soc` / `nod`
  head poses live). Both were found in the screenshots (§7).

### D. audio7
- One sprite (`audio7_sprite.mp3`) cut per key on arrival: typewriter (3 variants), switch clack, wheel squeal (a
  1.23 s loop, played as an ambience bed while a car is on a curve on screen), mailbox flag (when the flag springs up
  and for each letter while it is up), coin sack (3 variants, 딸랑이), and `amb_office` near the open office. Probe:
  all 10 keys in the audio cache after the office and the first train, 0 errors.

### Late village: raw surplus routed like goods surplus (the designer's default)
After village complete only (the first 20 minutes never change):
- a collection pile at ≥ `surplus.pileAt` 90 % for `pileForS` 10 s has surplus down to `pileKeep` 8;
- the **창고 짐꾼** take it to the 짐 싣는 곳 (`whRaw`; a pile full for twice `pileForS` comes before their overflow
  runs; at least `rawMinLoad` 6); the **역 짐꾼** take it at `pilePrio` 33 (over the 정기 납품 run 30, under the shops
  35 and founding cards 38); the line's raw porter still spills a full pile it cannot unload;
- from the dock the raw rides the freight cars (paid at the depot's low `rawPrice` × `exportRate`: 0.5–1.5 coins) or
  the sleigh to the 서리 물류창고, where raw may fill `rawRack` 50 % of a category's racks (the goods keep the rest) and
  its own buyers take `sell.rawPerMin` 40 a minute (the category buyers take goods first);
- all keys in `BALANCE.v42.surplus` / `.depot` with Korean comments and `balanceCheck` ranges.

## 2. Files

Changed since CODE-1 (`git diff 0dd4c32`), all under `frost-village/`:
- core: `src/core/Assets.js`, `Residency.js`, `Townfolk.js`, `Panel.js`, `src/core/folk/*_compose.js` (new copies);
- entities: `ChiefAura.js`, `Character.js`, `Player.js`, `Train.js`, `RailProps.js` (new), `Cutaway.js`,
  `OfficeBuilding.js`, `BankBuilding42.js`, `CargoSleigh.js`, `Worker.js`, `staff/Staff.js`;
- systems: `DayClock.js`, `Navigator.js`, `Neighbours.js`, `Rail.js`, `RoadPaint.js`, `Freight.js`,
  `depot/Depot.js`, `office/Office.js`, `pilot/ChiefPilot.js`, `v42/art.js` (new), `v42/index.js`;
- scenes: `UI.js`, `UIv42.js`, `OfficePanel.js`; data: `balance.js`, `balanceCheck.js`;
- tools: `tools/build/pack_pages.py`, `webp_assets.py`, `build_artifact.mjs`; `tools/test/rail.mjs`,
  `rail42.test.mjs`, `depot.test.mjs`, `shots_v42.mjs`;
- docs: `docs/v42_plan.md` (§5.2, §13, §16.2 tables), `docs/기획서_v4_2_촌장.md` (CODE-2 section), this report.
- Packed pages rebuilt (`assets/_packed`, generated by `pack_pages.py`).

## 3. Numbers

### 3.1 Late village: census bot, the v4.1 46-min save, 60 game minutes (`d60`)

Same census tool, save and smart bot as CODE-1's §3.3. v4.1 and CODE-1 columns are CODE-1's runs.

| Measure | v4.1 | CODE-1 final | **CODE-2** | Gate |
|---|---|---|---|---|
| Any raw pile ≥ 90 % (fish · log · wheat · ore · meat) | 100 % (95 · 77 · 99 · 100 · 100) | 97 % (57 · 4 · 16 · 73 · 86) | **95 %** (60 · 7 · 27 · 66 · 79) | ≤ 50 % ✗ |
| … minutes 20–60 (depot and raw routes running) | — | — | 93 % (60 · 0 · 0 · 51 · 69) | |
| Income per minute | 1,851 | 2,530 (+37 %) | **2,459 (+33 %)** | +15–30 % ✗ (3 points over) |
| Items exported by train | 0 | 625 | 733 (1,380 coins) | — |
| Market shelf empty: 빵 / 훈제 고기 / 구운 생선 | 21 / 55 / 5 % | 0 / 10 / 0 % | 8 / 12 / 0 % | ≤ 10 % each: meat just over |
| 교역소 empty: 판자 / 주괴 | 92 / 97 % | 0 / 0 % | 0 / 0 % | ≤ 40 % ✓ |
| Smelter / sawmill output ≥ 90 % | 65 / 59 % | 15 / 2 % | 18 / 2 % | ≤ 30 % ✓ |
| Grill / bakery / smokehouse output ≥ 90 % | 10 / 28 / 51 % | 40 / 21 / 24 % | 43 / 14 / 29 % | — |
| 창고 average | 4 | 168 | 161 | ≥ 40 ✓ |
| Dock, max / end | 3,385 at the end | 268 / 88 | 222 / 90 | bounded ✓ |
| Page errors | 0 | 0 | 0 | |

A second run with `pilePrio` 30 and `pileKeep` 12 (`b60`, 48.7 min, same save and bot): any pile 93 % (56 · 5 · 18 · 63 ·
78), minutes 15–48.7: 91 % (51 · 0 · 0 · 51 · 68), income 2,440 (+32 %), 466 exported. The two settings differ by less
than the run-to-run noise; 33 / 8 stays the default (it moves raw before the 정기 납품 run, and the wholesale backlog on
the dock was lower in `d60`: 40 crates on average against 53).

**Why the pile gate is still missed — the arithmetic.** With the five piles drained to ≤ 20 by a probe
(`flow_drain.json`), the gatherers bring per minute fish 99 · log 37 · wheat 47 · ore 92 · meat 80 and the stations
take 75 · 39 · 48 · 45 · 46: about **110 raw a minute more than the village uses** (fish +25, ore +49, meat +34). The
routes measured with the depot built (`flow_dep.json`) carry about **30 a minute** away (raw porters 13.6, 창고 porters
12.3, station porters ≈ 3): the porters walk with 8 at a time across the map. A drained pile is full again in 2–3
minutes. To get below 50 % the village needs about 80 a minute more out of the ore, meat and fish piles. The designer's
choices are listed in `기획서_v4_2_촌장.md` §2.3: one fewer ore and meat gatherer, a raw cart upgrade (30 a trip), or
accepting a full pile as the gatherers' rest (they wait; the raw would sell for 0.5–1.5 coins). Gatherers were not
slowed, and porter bags were not enlarged (the designer's decision stands; CODE-1's bag experiment showed no change).

**Income** is 3 points over the band (CODE-1 was 7 over). Exports pay 23 coins a minute (1 %) and the depot's sales about
50 (2 %); lowering both prices would remove at most 2 points. The rest comes from goods that now sell instead of waiting
in full outputs. No price was changed.

### 3.2 First 20 minutes unchanged (fresh game, smart bot, 25 min, `fresh25`)

| | CODE-1 as reviewed | CODE-1 final | **CODE-2** |
|---|---|---|---|
| Village complete (celebration) | 19.5 min | 20.0 min | **19.5 min** |
| Income, minutes 0–20 | 577 / min | 544 / min | **572 / min** |
| Market empty 0–20: 빵 / 고기 / 생선 | 57 / 100 / 32 % | 55 / 100 / 38 % | 55 / 100 / 28 % |
| Ore pile ≥ 90 %, 0–20 | 13 % | 15 % | 14 % |

The raw routing, the export price and the depot rules switch on only after village complete, and nothing of the new art
changes the early game's timing: the only new request before minute 20 is `v42_core.png`, asked for 3 s after the
first sale (`reqlog42`).

### 3.3 Pacing bot (fresh game until 읍)

`review_gameplay_sim.mjs --policy smart --upg greedy --v4` (fresh game, fixed 60 fps clock), game minutes:

| Milestone | v4.1 | CODE-1 final | **CODE-2** |
|---|---|---|---|
| Village complete | 19.8 | 19.3 | 20.7 |
| Station repaired / first train | 22.1 | 22.1 | 23.5 / 23.6 |
| 5 shops | 38.7 | 37.0 | 37.4 |
| **읍** | 48.2 | 44.8 | **46.5** |
| Longest wait for the next hire | 5.2 | 3.0 | 3.8 (before 2nd fisherman) |
| Stuck / money spent by mistake / errors | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

The bot's own run-to-run spread is about ±1 minute (the census bot's fresh run above completed the village at 19.5).
Nothing that CODE-2 changed acts before village complete; 읍 comes 1.7 min later than CODE-1's final run and 1.7 min
earlier than v4.1.

### 3.4 Textures

`texview.mjs` (scratch `v42code2_probe/`): a fresh boot of the 46-min save per view, 45 s settled with the loop awake,
Residency source-sum; v4.1 is the v4.1 copy on the same save and view.

| View | v4.1 | CODE-2 | Plan estimate |
|---|---|---|---|
| Plaza | 355.6 | **368.7 (+13.1)** | +8 |
| Station, train in | 369.6 | **384.4 (+14.8)** | ≤ +14 |
| Office revealed | — | 392.2 | |
| Depot revealed | — | 414.9 | |
| `shots_v42` tour peak (everything the tour left resident) | — | 439.2 MiB (fix pass: **452.4**, §8.2) | ≤ 455 hard limit ✓ |

- The plaza's +13.1: the train pages are resident in every view in v4.1 as well, and the new cars are bigger (+5.2:
  coach 4.35 + box car 4.68 + flat car 3.05 against car_a 3.78 + car_b 3.11); CODE-1's pile bake canvas `fv_stackbake`
  (+4.0); `v42_core` (+3.1); the generated stand-in rings kept as the fallback (+0.5).
- The station's +14.8 adds `train2_rails` (1.7 MiB). It is a bake-only page like `town_rails`: it stays while the view
  is within 800 px of the streets and leaves 10 s after the view goes farther. Train pages alone: **17.59 MiB** (plan
  17.6).
- Every view stays under the 455 MiB limit; the plaza and station are over the plan's per-view estimates by 5.1 and
  0.8 MiB (§7).

### 3.5 Draw calls, display objects, logic time (`perf_cmp.mjs`, v4.1 and CODE-2 pages alternately in one browser)

Draw calls per drawn frame / display objects (all, inside containers too), the 46-min save; "late" = office + bank +
4 staff + depot + 읍 + surplus on, against v4.1 at 읍 (scratch `v42code2_perf/perf_cmp.json`):

| View | v4.1 | CODE-2 | v4.1 at 읍 | CODE-2 late | CODE-1 review (v4.1 → v4.2) |
|---|---|---|---|---|---|
| Plaza | 14.8 / 1,680 | 18.8 / 1,247 | 17.9 / 2,011 | 19.8 / 1,661 | 15.8 → 18.6 |
| Plaza, zoom 0.6 | 19.0 / 1,876 | 22.0 / 1,422 | 20.8 / 2,151 | 24.6 / 1,820 | 21 → 25.8 (late) |
| Station, train in | 13.0 / 1,130 | 14.8 / 1,255 | 13.0 / 1,209 | 16.0 / 1,432 | 13 → 15.6 |
| Our loop, train on it | 12.0 | 14.0 | 11.0 | 15.0 | |
| West (office / bank) | 13.6 | 15.8 | 14.0 | 16.8 | |
| Depot corner | 9.0 | 12.0 | 9.0 | 13.0 | |
| Town | 12.0 | 13.0 | 11.0 | 13.0 | |

- **Draw calls (CODE-1 M4)**: with the real art in, v4.2 still draws 1–4 more batches a frame than v4.1 (the same as
  CODE-1's placeholders). `v42_core` replaced the generated `fv_*` halo / navigator canvases with one page, but the new
  pages that are on screen together (cars, office, staff, ui5) each start a batch when the depth order interleaves
  them. The aura is NORMAL blend; the only new ADD image is the chief's night lamp (DayClock, at night only). Not
  changed.
- **Display objects**: fewer than v4.1 everywhere in the village (the pile bake); the late village at zoom 0.6 is 1,820
  (top level 1,637), over the 1,700 plan gate by the same margin as CODE-1.
- **Logic** (fixed-step bench, 4 interleaved batches, median ms per tick on the loaded machine): v4.1 1.5–2.6, CODE-2
  plain 1.7–3.1, v4.1 at 읍 1.5–1.9, CODE-2 late 2.6–3.8. The late village costs about 1–1.5 ms a tick more than v4.1 at
  읍 (CODE-1 review: 2.0–2.3 against 1.4–1.7). The plan's 0.25 ms is for the v4.2 systems alone; the whole-tick bench
  also counts the extra agents (4 staff, tellers, depot crew, sleigh, raw runs). Noisy: load average 9–20 on 4 cores.
- Texture source-sum in this run (perf probe, after the scripted tour): v4.1 357–388, CODE-2 390–427 MiB; every view
  under 455.

### 3.6 Soak (20 game minutes, the 46-min save)

`soak.mjs 1200` (everything unlocked, 20 real minutes with the workers running): 0 errors; display objects
695 → 834, oscillating between 780 and 836 over the last five minutes (the item pool), tweens 2 → 7. Bounded.

### 3.7 Files

`build_artifact.mjs --webp` (`build3`, after every fix): **413 files** (412 + the page), **65.68 MB**, largest 1.23 MB (`game.js`, 136
modules). By type: .webp 171 (34.8 MB), .png 110 (16.5 MB), .mp3 34 (6.6 MB), .json 93 (5.2 MB), .js 3, .html 1, .md 1.
Plan §13.1 estimated 430–445; the CODE-1 gate is 480. CODE-2 added the art as pages: `v42_core` (chief_fx + ui5 icons,
one page, manifests embedded in `_packed/index.json`), `ui5_icons@panels`, `office_bld@closed` / `@inside` + office
items, officefolk's 4 pages, chief2's sheet, the train2 car pages and `train2_rails`, one `audio7` sprite.

## 4. Tests

All on the loaded machine (scratch `v42code2_suites/summary.txt`, `summary3.txt`):

| Suite | Result |
|---|---|
| `v42.mjs` | 34/34, before and after the §7 fixes. One rerun in between failed one check: "총총이 follows the chief" at 335 px against a 300 px limit. Across three runs her distance after 6 s was 74, 335 and 175 px, depending on the road route she picks. |
| `v4.mjs` | 46/46 |
| `rail.mjs` | 35/35 (the first run failed "every car on the route at its consist offset": the test now checks the bogie-chord midpoint the cars really use) |
| `town` 17/17 · `v3` 18/18 · `labour` 28/28 · `dog` 15/15 · `life` 14/14 · `zoom` PASS · `plots` 34/34 · `restaurant` 30/30 · `c2` 39/39 · `nav` 12/12 · `pickup` 31/31 · `townfolk_runtime` 8/8 · `voice_runtime` 29/29 | all pass |
| saves: `save_v2` · `save_v3` · `save_v35` · `save_v4` · `save_v42` (v4.1 and v3.5 saves → v7, 300 fuzzed blocks, ≤ 10 KB) | all pass |
| `smoke.mjs` | 53/53, 0 errors |
| `v42_layout.mjs` | no problems |
| `visitors42.mjs --base` (visitors per minute, v4.1 copy vs this build) | 2/2 |
| `reqlog42.mjs --base` | 4/5 — see below |
| chat (9 node test files) | 78 passed, 0 failed |
| node unit tests: `bank42` 18 · `depot` 26 · `depot_parity` 10 · `ledger` 20 · `letters` 23 · `pilot` 27 · `rail42` 58 · `roadnet` 32 | all pass |
| `test_deploy.mjs standalone --quick` (the built artifact) | PASS with `build2` and again with `build3`: WebGL, title 4.2 s, no placeholder art, no failed requests, 0 errors |

`reqlog42`: the first run counted `_packed/v42_core.png` before the first sale. The art loader asked for it in the same
frame as the sale, and the test's phase switch comes 1.5 s later. `v42/art.js` now asks 3 s after the first sale (at once
in a save past the first hire). In the next two runs the page is the one new file after the sale ("at most one new file
(1)", nothing missing, 0 errors). Both runs still differ up to the sale by one resident look (`vil_npc_*.social`) and a
voice file, on the v4.1 side. That is the lazy-load flake CODE-1 documented: the first sale lands at 32 s in v4.1 and 34
s here, and the v4.1 copy itself asked for 7, 11 and 10 first-loop files in three runs. Rerun it on a quiet machine.

## 5. Screenshots

`docs/previews/screens_v42/`: **40 shots**: 23 at 390×844 Korean (every scene), 13 at 360×640, 8 in English. All are
from today's runs on the v4.1 46-min save (`shots_v42.mjs`; the office, panel and bank scenes were re-shot after the
fixes in §7). Every one was looked at on a phone-size view.

| Shot | What it shows |
|---|---|
| `01_whats_new` | the 새로워진 것 card (ui5 icons) |
| `02_halo_plaza`, `02b_halo_night_z06` | the aura (ring, back glow, sparkles), the 별 pin at zoom 0.6 |
| `03_nav_carrying` | 길 안내: chevron, dotted path, destination ring, chip `판자 6 → 교역소 판매대 · 12m` |
| `04_settings_play` | 설정 › 놀이 (ko / en, 360×640 too) |
| `05_loop_curve`, `05b_loop_town` | the engine leading round our loop past the water tower, the town loop with the bounded camera |
| `06_consist_ours`, `07_freight_loading`, `08_consist_town_coach2`, `09_train_card` | coach 솔방울호, box car with crates, flat car, the 읍 two-coach train, the train card with the car icons |
| `10_office`, `10b_office_inside`, `10c_chief_desk` | the office closed / revealed with the clerks at their desks, the chief seated at his desk (chief2) |
| `11`–`15` panels | 재고 (chalkboard, status dots), 소식, 편지 (letter paper), 직원, 통장 |
| `16_bank_vault`, `17_depot_revealed`, `18_cargo_sleigh` | 서리 은행 cutaway, 서리 물류창고 cutaway, the sleigh on its lane |
| `19_observe` | 관망 with its caption (ko / en) |

Iterated on: the stock rows under the chalkboard frame, the empty office desks (depth fix), the headless clerks (head
pages), the panel shot taken before its page arrived, the town-loop overview past the world edge. `02b` shows the moon
icon, but the night tint is still faint 3 s after the clock is set to 21:00.

## 6. Publish

`dist/artifact_files.json` (from `build3`): the page + 412 files in **2 batches** — batch 1: 250 files, 52.2 MB;
batch 2: 162 files, 16.7 MB, holding `game.js`, `lib/` and every manifest, so the link keeps running the previous
version until the last batch is in. The live version (`tools/build/published_files.json`, the v4.1 list) holds 491
files, and **125 of them are gone from this build**. They are listed under `stale` and go as `null` in the **first**
publish. Version size after publish 1: 398 files + page; after publish 2: 412 + page. Both stay under the 511 limit,
and each publish is under 255 files and 64 MB. After publishing, run `node tools/build/build_artifact.mjs
--record-published`. One caveat carried over from CODE-1's design: while the two publishes are in flight, the old
version runs without its 125 stale files.

**Fix pass (robust L6):** the plan above put 250 files *and* the 125 null paths in the first publish (375 paths, over
the 255 a publish takes). `build_artifact.mjs` now sizes the first batch to 250 − stale, so the fix-pass build ships the
page + 412 files in **3 batches**: batch 1 = 125 files (32.1 MB) + the 125 `stale` paths as null (250 paths + the page);
batch 2 = 245 files (30.7 MB); batch 3 = 42 files (6.0 MB) holding `game.js`, `lib/` and every manifest. The build fails
if any publish would name more than 250 paths or 64 MB. The version never holds more than the 412 files + page.

## 7. Known issues and what the art would need

**Gates missed (numbers in §3):**
1. **Raw piles full ≤ 50 %**: 95 % over 60 minutes (93 % once the routes run), with ore 51–66 %, meat 69–79 % and fish
   about 60 %. The surplus is about 110 raw a minute, and the porter routes move about 30. (Fix pass, `g60`: 93 %.) The designer has three options
   (`기획서_v4_2_촌장.md` §2.3): one fewer ore and meat gatherer, a raw-cart upgrade, or accepting a full pile.
2. **Income +15–30 %**: +33 % (2,459 / min; fix pass 2,470). CODE-1 was +37 %. Changing the export and depot prices would move it by at
   most 2 points.
3. **Market shelf empty ≤ 10 %**: 훈제 고기 12 % over 60 minutes (빵 8 %; CODE-1 final: 10 / 0; fix pass 11 / 5, and 8.5 % for 훈제 고기 after the save's first 3 minutes). Raw meat now leaves
   full piles for export, so the smokehouse input is less often full. Watch it in the next balance pass.
4. **Per-view texture estimates**: plaza +13.1 MiB (estimate +8), station +14.8 (gate +14). Every view stays under the
   455 MiB limit (tour peak 439.2 MiB; 452.4 after the fix pass, which loads the pages that used to be refused — §8.2). The cheapest cut is to give the train pages an area (Residency region along
   the line). They are resident in every view, as in v4.1, which costs 17.6 MiB away from the rail. A second option is to
   halve `fv_stackbake` (4 MiB, CODE-1) if its slots allow.
5. **Draw calls**: still +1 to +4 per frame against v4.1 (CODE-1 M4: unchanged by the real art). Display objects at zoom
   0.6 in the late village: 1,820 (gate 1,700).

**Fixed during CODE-2's own review of its screenshots** (all in `src/`; in `build3`):
- Seated office clerks were drawn under the building. A seat point is 0.45 m up on the raised floor, so the back desks'
  seats fell outside the cutaway's footprint and got their y as depth (713) instead of the slot's (810.05).
  `Cutaway.occupy` now tests the floor under the chair for seated staff inside.
- Seated clerks had no heads. Officefolk's desk acts turn the head to the `soc` / `nod` poses, whose frames are on the
  townsfolk heads' `@soc` pages, and the town's social rule fetches those pages only in the town district.
  `Office.wantStaffPages` (near the office or bank, or while revealed) now also asks for `tf_head_*@soc`: about 12 MiB,
  tfatlas pages outside the social cap and budget-checked.
- `Residency.displayed` / `evict` looked only at the village scene. A page shown only by the UI (the office panel's
  `ui5_icons@panels`) counted as off screen. One screenshot run hit a `glTexture` null render error while the stock
  panel was open; it did not reproduce. Both now walk every running scene.
- `v42/art.js` asks for `v42_core` 3 s after the first sale (the `reqlog42` race above).
- `shots_v42.mjs`: the office scenes wait (`until`, ≤ 25 s real time) for the staff's desk pages and the chief's chief2
  sheet; the panel scenes wait for the panel page. 02b starts the day clock (the 46-min save is before it starts).
  Screenshot timeout 120 s (the machine was loaded).

**Kept / not done:**
- **Town loop tip (art M3)**: a car on the town loop reaches x 6176, 32 px past `WORLD.width` 6144. The camera stops at
  6144, so in play the screen edge cuts the tip off. The fix is a layout change, not a code tweak: shift the town loop
  ≥ 1 cell west (`world.js` loop centre, turnout T2, stops, crossing 33) and re-render `rail_loop_town` for the new centre
  (`assets/train2`, read-only here), or widen the world by 64 px.
- Engine page: 5.51 MiB (plan 4.6). It is the v4 engine's 5-direction page at the fine widths. Art could trim the curve
  directions to 4 frames like the new cars.
- CODE-1's generated rings (0.5 MiB) stay as the halo's fallback until `v42_core` arrives.
- Canvas mode: the HUD count chip keeps a light tint that Canvas drops. Everything else now uses the ui5 plates.
- Townsfolk outside the town district whose pose needs the `@soc` head pages (seated or social anims) still depend on
  the town's social rule. Near the office the new head request covers them, but the rest is v4.1 behaviour and was not
  audited.
- The office art polish (another agent's tasks 306–308) is still in progress. When it lands, re-run
  `tools/build/pack_pages.py` (office pages), check `deskPoints` / `chiefDeskPoint` against `OfficeBuilding.PTS`, and
  rebuild.

**What the art folders would need** (read-only here): `train2` — the town loop decal for a loop 1 cell west (or a
smaller radius), if the designer prefers that to widening the world; optional 4-frame curve dirs for the engine.
`office` / `officefolk` / `chief2` / `chief_fx` / `ui5` / `audio7` — nothing blocking.

## 8. Review fixes (the CODE-2 fix pass)

The three CODE-2 reviews (gameplay, look and feel, robustness) were reproduced first, then fixed in `src/` and checked
again with the reviewers' own scripts. Scratch: `/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v42code2_fix/`
(`base/` = the reviewed CODE-2 source for before / after runs; `gp/` the gameplay reviewer's experiments re-run; `vis/`
the look reviewer's driver with new commands; `suites/` the suite logs; `census/` the economy census).

### 8.1 Findings → outcome

**Gameplay review**

| Finding | Outcome | What changed / evidence |
|---|---|---|
| M1 the chief hidden behind the train at 서리역 | **fixed** | `ChiefAura.coveredBy`: a train car drawn over him (its own alpha mask decides, 3 body points) shows the star pin and a soft cream silhouette of his current frame over the car (`drawGhost`, ½ alpha). Re-run of the reviewer's spot (box car at `atOurs` 3, zoom 1.0): `covered: true, ghost: true, pin 0.88–0.99` (`vis/out/k1/004.json`, `vis/shots/crop_004.png`); shot `20_chief_behind_train` |
| M2 office / bank walls with gaps | **fixed** | `Collision.addSeg` / `addWalls`: capsule walls along every footprint edge (office, bank, depot), the door's opening cut out, pushed out along the wall's normal (a row of circles pushed him along the wall line, never back out). Office: the manifest circles stay (furniture). New `tools/test/walls42.test.mjs` 6/6 (fails 3/8 and 6/6 without the walls); the reviewer's `probe_walls`: from behind and from the east he stops 177 / 219 px short of the 책상 pad, the bank's front wall holds (152 px short), through the door he reaches the pad. Re-test when the office polish (task 307) changes the circles |
| M3 economy gates (piles, income, smoked meat) | **partly / designer** | see §8.2: the pile gate and the income band stay the designer's choice (기획서 §2.3); the fixes below that touch the economy (surplus share on the train, raw guide rule) were measured in a new 60-min census |
| M4 관망 hauls through the night, never watches the train or plays with 콩이 | **fixed** | `agenda.js`: evening 60 from 21:00 to 06:00 (beats every chore but an urgent one; 20:00–21:00 stays 30 so the day's work still wins), the day's first train watch +25 (from ≤ 2,600 px), 콩이 +20 after 10 min without a game (dog within 1,400 px then); an urgent chore that runs out twice on the same target rests 60 s. A watch or a game that began is judged as it began (starting it used to cancel its own bonus and range: 0 real watches in the first re-run). `pilot.test.mjs` +18 checks (45/45). Re-run of `exp_pilot 30 7`: night samples evening 66 / 69 (was work 56 / 69), 2 train watches, 1 game with 콩이; `pilot.mjs` 관망 income 85 % of the arrow-only bot (§8.2) |
| M5 길 안내: long low-value trips, mind changes | **fixed** | the guide holds the room for his load at its place (`Logistics.setChief`; porters see it as taken, his own resolver does not; released after 8 s standing still); a better place must lie ≤ 1.25 × the way left + 200 px and is never the export dock; a place left because it filled up is banned for 15 s for this load; raw items whose only place is the dock beyond `nav.rawDockPx` 1,600 px get `○○ 입구 가득 · 잠시 기다리거나 버려요`; crossing another kind's pad while guided does not grab it (멈추면 rule, 켬 only). Re-run of `exp_nav`: logs 1,018 px walked (was ≈ 3,000 to the dock), ore → 제련소 입구, bread 5,621 px (was 7,485), and 3,957 px after the ban rule (§8.2) |
| L1 pinch-zoom ends 관망 | **fixed** | `Input`: a finger on the village hands back after 110 ms (game time) unless a second finger lands (UI's pinch calls `release()`); a drag still hands back in the same frame; the pilot's steering pauses meanwhile |
| L2 all boarders at one coach door, vanishing short of it | **fixed** | `Neighbours`: each boarder keeps its door (the closure read the loop's last `k`); `Visitor.board` walks the last steps to the door while fading. `exp_doors`: 10 boarders over the 4 doors 3 · 4 · 1 · 2 (was 7 at one) |
| L3 재고 tab "적당" with pile and output full | **fixed** | the 교역소 shelf registers `emptyAt` = `trade.displayKeep` after village complete: its 2 display goods count as empty, so 부족 / 길 막힘 can show for planks and ingots |
| L4 관망 starts under the overview map | **fixed** | `gs.overview` counts as busy |
| L5 surplus never rides while card crates exceed a load | **fixed** | `freight.surplusShare` 0.25: surplus waiting at the dock keeps 14 of 56 places on each train (`Freight.cardRoom`) |
| L6 crate count 57 of 56 | **fixed** | no `loadCargo(1)` on top of `Freight.board` |
| L7 courier deposits at 02:32 | **fixed** | `courier.from` 7 / `courier.to` 21 (balance.js, balanceCheck) |
| L8 chip "통나무 8" for an order card taking 1 | **fixed** | the chip's count uses `room` 0 as 0, not as "the whole bag" |
| L9 "· 2000" | **fixed** | letter buttons format with `fmt` ("· 2,000"); English senders read "A letter from the old miner" |
| L10 padlocks on HUD chips while their atlas loads | **fixed** | `UIv4` icons stay invisible while only the padlock fallback is there |

**Look-and-feel review**

| Finding | Outcome | What changed / evidence |
|---|---|---|
| H1 the chief bleached white at night | **fixed** | his DayClock light is a flat pool at his boots (`sy` 0.42, alpha 0.6) instead of an ADD glow on his chest; `vis/shots/cmp_002.png` (22:00, halo on / off: the face keeps its colours); shot `21_night_chief_close` |
| H2 tower_se's bonfire over the train | **fixed** | the bonfire is its own occluder linked to the tower's (`Occlusion` `link`): it fades for its own pixels and with the tower; `vis/shots/cmp_003.png` (t 7.5 / 8.0: tower and flame both see-through) |
| H3 관망 seated poses fall back to standing | **fixed** | `Residency.makeRoom` (robust H1 below) + 관망 pins chief2's sheet (`Residency.pin`, asked every 2 s); a seat whose anim is not loaded shows him standing on the floor in front of it and asks again every second (`Player.update`). Night desk: seated, `doze` (`vis/shots/crop_night_desk.png`) |
| M1 lunch / evening with a load on his head | **fixed** | the leisure acts wait while his bag holds a load that has somewhere to go (업무 delivers first); 업무 between two loads is not held by its minimum time; lunch 12:00–13:00. `10c_chief_desk` clears the bag first |
| M2 재고판 bars 21 px low | **fixed** | shear about the board's centre (`(x − w/2) · shearY`); bars sit on the slate (`crop_night_desk.png`) |
| M3 tellers faceless behind the glass | **fixed** | `DollSprite.headDepth`: the tellers' head layers draw just under the `@front` slot (over `bank_front`), bodies stay behind the counter; `vis/shots/crop_k2bank.png` |
| M4 the office shell fades before its inside arrives | **fixed** | the reveal waits (≤ 6 s) until every inside layer has its picture and the seated staff's desk / head pages are in (`OfficeBuilding.insideReady`); staff show as soon as the shell starts to fade. Evicted-pages run: held 0.25 s, then opened with the pages in (`vis/out/k2/003.json`) |
| M5 the town loop behind a row of shops | **won't fix (layout)** | moving the loop is a `world.js` + decal change (`rail_loop_town`, `assets/train2`, read-only); same family as the 32 px loop tip (§7) |
| M6 English tab labels under their icons | **fixed** | settings and office-panel tab labels start right of the icon and shrink to the room left (`crop_k3set.png`, `crop_k3letters.png`) |
| L1 coach 90° to the engine on the S-curve | **fixed** | two coupled cars are never more than one heading apart (`Train.updateRoute`); headings over `toTown` 12.5–14.5: `SE,S,S,SE,SE` … `SE,SE,S,SW,S` |
| L2 nubs on 56 px buttons | **fixed** | `makeButton` builds a button lower than its 9-slice caps at the caps' height and scales it down |
| L3 engine as a red text chip | **fixed** | the train card shows the engine's own first frame next to the ui5 car icons (`crop_k3train.png`) |
| L4 navigator plate too big at 0.6, clipped at 0.8 | **fixed** | smaller below zoom 0.9; slid back inside the screen at its edge (`cmp_nav.png`) |
| L5 office panel jumps from the cream fallback | **fixed** | the panel waits ≤ 1.2 s invisible for its page; the page is also asked for while the chief is near the office |
| L6 업무 label over a clerk's head | **fixed** | the label sits under the 책상 pad |
| L7 (older) padlocks / grey chunks after a jump / mild night / depot under the zoom buttons | padlocks fixed (gameplay L10); the rest unchanged (pre-v4.2) | |

**Robustness review**

| Finding | Outcome | What changed / evidence |
|---|---|---|
| H1 late-village textures on the refusal line, headless clerks | **fixed** | `Residency.makeRoom`: a wanted page over the refusal line first evicts the pages of areas the view is beyond RELEASE from (farthest first, never a page a near area lists, not during a camera cut), then on-demand pages LRU (not on screen, unused ≥ 1 s, not pinned). `headcheck tour`: `tf_head_0@soc` in by +5 s (2 refusals, then room made) — before: refused 122 times, never in 30 s; seated clerks with heads (`headcheck_tour_5s.png`). With the heads and panels now loading, the screenshot tour peaked at 456.4 MiB, so an area coming back over the refusal line also makes room first, and over that line the far areas' pages go at once instead of after their TTL (tour peak 452.4, per-view peaks ≤ 428.4; §8.2) |
| M1 v4.2 logic over budget (office 0.18–0.20 ms) | **fixed for the v4.2 total; the office row still over** | the courier's `carry_sack` pick (TF.pick + groundSpeed every frame) only on a change; seated staff inside a closed building run only their timers; acts re-picked every 3 s when playing (0.5 s on a fallback); the courier and the aide skip the O(agents) separation; the courier reads the tills twice a second. v4.2 logic sum now 0.18–0.25 ms in every view (budget 0.25; was 0.28–0.39), office 0.05–0.10 (was 0.17–0.21); see §8.2 |
| M2 office ambience after 처음부터 | **fixed** | `Office.destroy` destroys the building and the bank; `Neighbours.destroy` the rail props; `Game.build` zeroes every ambience target. `stale_amb office`: after reset `amb_office` target 0, volume 0.03 at +10 s, 0 at +60 s (was 0.25) |
| L1 cutaways never built on an in-session restart | **fixed** | `build()` during create defers to the first update (`delayedCall(0)`) instead of returning; destroyed buildings never build |
| L2 stove loop missing on the first reveal | **fixed** | `Cutaway.replayLoops` (on arrival and once a second while open) starts a loop whose anim exists again |
| L3 courier stays the stand-in after a reload while carrying | **won't fix** | re-dressing a courier mid-round would move his sack to a new object; he is re-dressed when he settles (seconds later). Cosmetic |
| L4 draw calls / display objects | unchanged | still +1–4 draw calls a frame (§3.5); the new silhouette is one sprite, only behind a car |
| L5 duplicate `vil_npc_*@social` keys after restarts | **won't fix** | console noise from CODE-1's family, harmless |
| L6 first publish 250 files + 125 nulls | **fixed** | `build_artifact.mjs`: the first batch holds 250 − stale files, so every publish names ≤ 250 paths + the page; the build fails when one would not |
| L7 tour peak 432.7 vs 439.2 | **fixed** | one number in both docs: the fix-pass tour, 452.4 MiB (`docs/previews/screens_v42/textures.json`; §8.2) |
| info `office.bag` unclamped | **fixed** | clamped to 2,000,000 on load |


### 8.2 Numbers after the fixes

All on the same loaded machine as §3 (4 cores, other agents' jobs running; load 8–19). Scratch
`v42code2_fix/` (`census/g60.*`, `gp/` (`pilot_7_first.json` = first re-run, `pilot7b.log` / `pilot_7.json` = final, `nav2.log`), `officeprof_*_[bc].log`, `sysprof_*2.log`, `texview2_v42b.log` (final; `texview2_v42.log` before the last two Residency changes), `headcheck_final2.log`).

**Economy: census bot, the v4.1 46-min save, 60 game minutes (`g60`; same tool, save and bot as `d60` in §3.1)**

| Measure | CODE-2 (`d60`) | **after the fixes (`g60`)** | Gate |
|---|---|---|---|
| Any raw pile ≥ 90 % (fish · log · wheat · ore · meat) | 95 % (60 · 7 · 27 · 66 · 79) | **93 %** (53 · 6 · 11 · 57 · 76) | ≤ 50 % ✗ (designer, 기획서 §2.3) |
| Income per minute | 2,459 (+33 %) | **2,470 (+33 %)** | +15–30 % ✗ (designer) |
| Items exported by train | 733 | **830** (+13 %: the surplus keeps a quarter of each train, L5) | — |
| Market shelf empty: 빵 / 훈제 고기 / 구운 생선 | 8 / 12 / 0 % | **5 / 11 / 0 %** | ≤ 10 % each: meat 1 point over |
| 교역소 empty: 판자 / 주괴 | 0 / 0 % | 0 / 0 % | ≤ 40 % ✓ |
| Smelter / sawmill output ≥ 90 % | 18 / 2 % | 19 / 3 % | ≤ 30 % ✓ |
| Grill / bakery / smokehouse output ≥ 90 % | 43 / 14 / 29 % | 40 / 9 / 29 % | — |
| 창고 average | 161 | 172 | ≥ 40 ✓ |
| Dock, max / end | 222 / 90 | 295 / 94 | bounded ✓ |
| Page errors | 0 | 0 | |

훈제 고기: 39 of the 360 samples, 10 of them in the first 3 minutes (the save starts with that shelf empty); 8.5 % after.
In every empty sample the smokehouse output held 4–36 smoked meats (mostly 20+): the shelf waits for a porter's 27 m
walk, not for production. Left for the next balance pass. Nothing in the fixes changed a price, a gatherer or a bag.

**관망 30 game minutes** (the gameplay reviewer's `exp_pilot 30 7`, the 46-min save with the office and four staff, clock
from 07:00; 3 nights):

| | reviewed CODE-2 | after the fixes |
|---|---|---|
| samples between 21:00 and 06:00 (every 10 s) | work 56 · evening 6 · office 5 · chat 2 | **evening 66** · office 2 · work 1 |
| train watches · games with 콩이 | 0 · 0 | **2** (16 s and 37 s at the platform) · **1** |
| lunch (3 days) | 2 | 3 |
| stuck · coins spent · page errors | 0 · 0 · 0 | 0 · 0 · 0 |
| coins after 30 min | 64,580 | 56,627 (he rests at night) |

The first re-run after the night fix still had 0 real watches: starting the watch marked the day's watch as done, which
took away its own +25 and its 2,600 px range, and the act ended in the same second (the dog game the same way). Fixed in
`ChiefPilot.context()` (the running act is judged as it began; a watch also lasts while the train stands at the platform),
with 8 new checks in `pilot.test.mjs`. `pilot.mjs` (30 min soak + the arrow-only bot): 10/10, 관망 income **85 %** of the
arrow-only bot (gate ≥ 80 %), 9 kinds of activity, 0 stuck, 0 spent.

**길 안내** (the reviewer's `exp_nav`, same save and loads; walked px): logs from the pile 3,000 (to the dock) → 1,018 →
**760** (stops at `제재소 입구 가득 · 잠시 기다리거나 버려요`); ore → 제련소 입구 (24 px); bread from the bakery 7,485 →
5,621 → **3,957** (after the 15 s ban); planks 1,067 and smoked meat 2,736 unchanged; cooked fish 2,800 (the market
filled after 4, the rest went to the dock, the goods' export sink); mixed bag 3,593.

**Logic time** (fixed-step, 46-min save with office + bank + four staff + depot; `sysprof`, base = the reviewed CODE-2
source, alternated in the same session; ms per tick):

| View | v4.2 sum (budget ≤ 0.25) base → fix | office (budget ≤ 0.05) base → fix |
|---|---|---|
| plaza | 0.333 → **0.178** | 0.173 → **0.047** |
| office revealed | 0.387 → **0.246** | 0.209 → 0.098 |
| depot revealed | 0.299 → **0.189** | 0.169 → 0.064 |
| 관망 on | 0.277 → **0.196** | 0.170 → 0.096 |

`officeprof` (office update only, two pairs): plaza 0.139 / 0.134 → 0.097 / 0.089; office revealed 0.165 / 0.122 →
0.104 / 0.143. The v4.2 total is now inside its budget in every view; the office alone is still 1–2× its 0.05 where its
staff are on screen.

**Textures** (`texview2`, one boot of the 46-min save made into the late village, 90 s settled per view, Residency
source-sum MiB; the robustness reviewer's run of the reviewed source in brackets):

| View | settled | peak while settling |
|---|---|---|
| plaza | 371.1 (370.2) | 417.9 (421.8) |
| station, train in | 401.9 (401.9) | 428.4 (434.2) |
| office revealed | 381.3 (388.3) | **420.9 (451.0)** |
| office panel | 385.8 (380.1) | 391.2 (389.4) |
| bank revealed | 382.7 (380.6) | 394.1 (388.4) |
| depot revealed | 412.4 (406.1) | 425.1 (426.5) |
| town | 358.9 (358.9) | 415.8 (430.0) |
| plaza again | 393.8 (391.9) | 421.8 (424.8) |

Refusals over the whole tour **3**, all on the second plaza visit (reviewer: 10). The first run of this table, before the
two Residency changes below, peaked at 452.0 at the office.

`headcheck tour`: `tf_head_0@soc` resident by +5 s at the office (refused in the first second, then room made) —
reviewed source: refused 122 times, never in within 30 s.

**Found in the fix pass — tour peak over the must.** The first screenshot tour after `makeRoom` peaked at **456.4 MiB**
at the bank → depot jump (the heads and panel pages that used to be refused now load, and the depot's area pages came
back on top before the bank's and office's went after their TTL). Two changes in `Residency`: an area coming back over
the refusal line first makes room (`makeRoom(need, back)`, sizes remembered from the page's last residency), and over
the refusal line the pages of areas the view is beyond RELEASE from go at once instead of after their 10 s TTL. Tour
peak after the first change: 446.3; after both: **452.4** at `17_depot_revealed` (3 MiB under the must; the shot tool frames
each scene with a camera focus, during which far areas are kept on purpose — a 관망 cut comes back to them). The
per-view `texview2` peaks (no camera focus) are 415.8–428.4.

### 8.3 Tests

Scratch `v42code2_fix/suites/summary.txt` (every run, in order). Same loaded machine; where a suite failed and was run
again, both runs are listed.

| Suite | Result |
|---|---|
| `v42.mjs` | **35/35** (`v42d`, the final source). Earlier runs: 31/34 — the courier check ran into his new 07–21 hours (the test now sets 08:00 before the courier, bank and 물류 금고 rounds), the F7 check met a train already full from the sections before (it now waits for a fresh dwell and accepts surplus once the card crates filled their 3⁄4, L5), and "panel opens < 100 ms" read 113 / 1,447 ms on the loaded machine (42.6 / 31.7 ms in `v42d`; 25–45 ms in a separate probe at 451 MiB). New: "a quarter of the cars still takes surplus (L5)" |
| `pilot.test.mjs` (node) | **45/45** (+18: night, train watch, 콩이, bag first, running act keeps its bonus) |
| `walls42.test.mjs` (node, new) | **6/6** (3 fail without the walls) |
| `pilot.mjs` (30 min 관망 soak + arrow-only bot) | **10/10**, 85 % of the arrow-only bot (first run hit the 3,600 s queue timeout on the loaded machine; rerun with 7,000 s) |
| `v4` 46/46 · `smoke` 53/53, 0 errors · `v3` 18/18 · `pickup` 31/31 · `nav` 12/12 · `rail` 35/35 · `town` 17/17 · `labour` 28/28 · `dog` 15/15 · `zoom` PASS · `plots` 34/34 · `restaurant` 30/30 · `townfolk_runtime` 8/8 · `voice_runtime` 29/29 | all pass |
| `life.mjs` | 14/14 on the rerun; the first run missed "tag among kids" (the event needs idle kids; it failed the same way in 2 of 24 earlier runs, CODE-1 and v4) |
| `c2.mjs` | 39/39 on the rerun; the first run logged "Texture key already in use: water_waves_a…" in the late-water case (water files held back by the test, loaded twice under load); `--only late` and the full rerun were clean |
| saves: `save_v2` · `save_v3` · `save_v35` · `save_v4` · `save_v42` | all pass |
| chat (9 node files) | 78 passed, 0 failed |
| node: `bank42` 18 · `depot` 26 · `depot_parity` 10 · `ledger` 20 · `letters` 23 · `rail42` 58 · `roadnet` 32 | all pass |
| `v42_layout.mjs` | no problems |
| `visitors42 --base` | **2/2** on the rerun (95 %: v4.1 3.53, v4.2 3.35 visitors a minute over minutes 3–20). The first run read 85 %: the v4.1 copy's side varies 3.05–3.50 a minute over five runs, this build's 2.85–3.00 |
| `reqlog42 --base` | 4/5 on the rerun, as in CODE-2: boot identical, after the first sale one new file and nothing missing; up to the first sale one resident look (`vil_npc_*.social`) more than the v4.1 copy (the lazy-load timing flake documented in §4). The first run also differed at boot by the title's stage-4 pages (the title sat longer on the loaded machine) |
| `soak.mjs 1200` | 0 errors; display objects 709 → 796 (766–822 over the last 3 minutes), tweens 0 → 6. Bounded |
| `shots_v42.mjs` | 43 shots (25 at 390×844 Korean incl. the new `20_chief_behind_train`, `21_night_chief_close`), 0 errors; looked at every 390×844 shot: no placeholder art, heads on the clerks and tellers, the train card's engine picture, the English settings tabs |
| `build_artifact.mjs --webp` + `test_deploy.mjs standalone --quick` | build OK (412 files + page, 3 batches 125 / 245 / 42, 125 stale); deploy PASS: WebGL, title 1.8 s, no placeholder art, no failed requests, 0 errors |
| `balanceCheck` | 0 warnings |


## 9. Final verification (v4.2 verify)

An independent re-run of everything on the fix-pass source (`1d6fc8f`) on the same loaded 4-core machine (load 8–19),
plus three small fixes found on the way. Scratch `v42code2_verify/` (`suites/`, `repro/`, `bots/`, `perf/`, `build/`).

### 9.1 Found and fixed

| # | Found | Fix | Proof |
|---|---|---|---|
| V1 | **The 서리 은행 plot never appeared in a session where the office was finished after 읍** (the bots' and the designer's order). `v42_bank` is `after: f:rankEup, also: b:chief_office`; plots were refreshed on a `step` / `region` only, and after 읍 no step comes — the plot showed only after a reload. | `Game.js`: a finished building (`built`) refreshes the plots 0.8 s later, **show-only** (it never hides a plot or a site a test / hook put up). | `bank_plot.mjs` (46-min save, 읍, office finished): bank plot shown after 5 / 30 / 120 s **false → true**. Fresh smart bot: office 57.2 → bank built 62.4 min (the first smart run: office 53.2, bank never). |
| V2 | **Arrow-only: cash pads ↔ 물류창고 plot for 14 minutes with 30,000 coins** (the arrow-only bot, first run). After 읍 the cash hint (`lots`: ≥ 300 on the pads) won over the next v4.2 thing even when it was paid for. | `Tutorial.cashHint`: after 읍 (no v4 goal text) the next v4.2 thing on the arrow's list counts like `canBuild` once he can pay for it. | `v42_guide.mjs` "cash lead". |
| V3 | **Arrow-only: the office plot ↔ the coins for 20 minutes, never built** (found by the second arrow-only run, after V2). On the plot the v4.2 arrow is off and the gentle cash lead sent him away within 0.25 s — the plot's build menu needs 0.5 s standing still. The v3 plots hold the arrow on the plot (`v3Hint`); the v4.2 list did not. | `Tutorial`: standing on the v4.2 plot / pad he can pay for, no arrow elsewhere (the goal text stays) — unless the plot / pad wants him to step off once (its menu was closed, the pad appeared under him). | `plot_hold.mjs`: 60 s arrow-only, coins 2,500: without the hold 0 menus, not built (plot ↔ 4 cash pads every 0.25 s); with it **built at 1.75 s**. `v42_guide.mjs` "plot hold". |

New regression test **`tools/test/v42_guide.mjs`** (46-min save, 읍, fixed step): 읍 shows the office plot and holds the
bank's · coins in hand lead to the plot, not the cash pads · an arrow-only chief on the plot opens the menu and builds ·
the bank plot shows ≤ 3 s after the office finishes · a `built` event never hides a plot · 0 errors — **6/6**.

`shots_v42.mjs`: `09_train_card` and `20_chief_behind_train` now wait (`until`, ≤ 40 s real) for the train2 cars and
the ui5 icons, and 20 reads the box car only after the camera is at 서리역 (the cars are laid out near the camera only:
the first refresh, on the loaded machine, shot 20 at the town loop with no train and 09 en with the colour chips).

### 9.2 Results on the final source

**Bots** (fresh game, fixed step, `review_gameplay_sim.mjs --v4 --upg greedy --after 20`; minutes):

| Run | 5 shops | 읍 (v4.1 47.7, gate ≤ +5 % for smart) | longest wait after tower_east | 사무실 · 은행 · 물류창고 | stuck · errors |
|---|---|---|---|---|---|
| smart (V1 + V2; smart does not follow the arrow) | 38.6 | **47.3 (−0.8 %)** | 3.35 at 47.3 (the 읍 savings; gate 3.0, v4.1 5.2) | 57.2 · **62.4** · 59.1 | 0 · 0 |
| arrow (final) | 40.2 | 49.8 (+4.5 %) | 5.32 at 49.8 | 57.0 · 58.6 · 62.9 | 0 · 0 |
| arrow-only (final) | 40.9 | 51.5 (+8 %) | 6.52 at 59.8 | **53.2 · 56.1 · 59.8** | 0 · 0 |
| smart, fix-pass source | 38.8 | 45.8 | 3.56 at 49.0 | 53.2 · never · 57.7 | 0 · 0 |
| arrow-only, fix-pass source | 38.9 | 50.0 | 11.48 at 55.8 | 54.2 · never · never | 0 · 0 |
| arrow-only, V1 + V2 only | 39.0 | 50.2 | 8.88 at 52.4 | never · never · never | 0 · 0 |

**Suites** (final source unless noted): `v4` 46/46 · `smoke` 53/53 · `v3` 18/18 · `pickup` 31/31 · `nav` 12/12 · `rail` 35/35 ·
`town` 17/17 · `labour` 28/28 · `dog` 15/15 · `life` 14/14 · `zoom` PASS · `plots` 34/34 · `restaurant` 30/30 · `c2` 39/39 ·
`townfolk_runtime` 8/8 · `voice_runtime` 29/29 · saves `save_v2/v3/v35/v4 --browser` PASS, `save_v42` all passed · node
`bank42` 18 · `depot` 26 · `depot_parity` 10 · `ledger` 20 · `letters` 23 · `pilot` 45 · `rail42` 58 · `roadnet` 32 · `walls42` 6 ·
chat (9 files) all pass · layouts OK · `pilot.mjs` 10/10 (fix-pass source) · **`v42_guide.mjs` 6/6 (new)**.
`v42.mjs`: **34/35** — the miss is "총총이 ≤ 300 px from the chief after 6 s": 302 px (292 / 302 / 302 / 318 over four runs,
318 with V1's listener removed: a threshold flake). The other misses seen on the loaded machine passed on a rerun
(the 통장 / 재고 panel < 100 ms: 304 / 3,858 ms under load, 30 / 27 ms and the probe's 6–66 ms unloaded; 딸랑이 empties
the 물류 금고). `reqlog42 --base` 4/5 (before the first sale one `vil_npc_*.social` look and voice files more than the v4.1
copy: the lazy-load timing of §4). **`visitors42 --base` 0/1 twice: 89 % and 86 %** (v4.2 3.35 / 3.29 visitors a
game minute over minutes 3–20, v4.1 3.76 / 3.82; the fix pass read 85 % and 95 %): v4.2 sits at 86–95 %, at or below
the −10 % line.

**Repros of the CODE-2 review findings** (the reviewers' own scripts): the chief behind each car is covered + ghost +
pin by day and at 21:30, not in front, and stays covered while the train pulls out (M1) · walk tracks reach the office
and the bank's south and west doors (M2) · the night light pins at zoom 0.6 (look H1) · 길 안내: ore 24 px, logs 733 px
walked with the "입구 가득" chip, a mixed bag 2,910 px · riders alight at the doors · `tf_head_0/1@soc` resident at the
office by +5 s (robust H1) · the office ambience fades to 0 after a reset (robust M2) · 관망 30 min: all 69 night
samples "evening", a train watch, two games with 콩이, 0 stuck, 0 coins spent, 56,606 coins · save fuzz (40 edits ×
restart): 39 clean, one console "Texture key already in use: vil_npc_young_man@social" on a scene restart (the
CODE-1 robust low) · real fixtures (`mig_real`: five v4.1 saves + the v3.5 38-min save): migrate, reload, v4.2 slices
stable, 0 warnings, 0 errors.

**Soak:** `soak.mjs 600` (fresh, unlockAll): 0 errors, display objects 693 → 801 (761–810 over the last 6 minutes),
tweens 2 → 3. Late village (new `soak42.mjs`: the 46-min save after 읍 with office, bank, four staff and the depot, the
chief touring plaza → station → office → depot, 600 s, twice): 0 errors; display objects 1,290–1,920 by place; at the
plaza 1,593 → 1,719 → 1,822 / 1,629 → 1,916, the growth being townsfolk dolls (+33 heads), goods on the piles (+35) and
the evening lamps (+13) — the save's village keeps growing; tweens ≤ 27, timers ≤ 9; Residency peak 430 MiB.

**Textures** (source-sum, must ≤ 455): `texbudget` 9/12 — every must passes (any view 408.8, GL total 445.9, back to the
start, GL vs source-sum 0.9 %); the soft targets miss as before (plaza 337.5 / 300, tour 408.8 / 300, title).
`texview2` late village: settled 358.9–403.1, peaks 391.3–428.8; GL texture bytes incl. render targets peak 429.9–465.8
while a view settles. Screenshot tour peak **451.4** at `17_depot_revealed` (3.6 under the must).

**Draw calls / display objects** (`drawcalls`, `perf_cmp` v4.1 vs v4.2 at 읍 vs late v4.2): fresh plaza 8.2, everything
unlocked 10.8, paying a pad 12, overview 15; plaza 15–17.3 / 17 / 19.8, plaza z0.6 19.1–20 / 20.8 / 24.4, station 13 / 14.8 /
15.2, depot corner 9–10 / 12 / 13 — +1 to +4 a frame as before. Plaza display objects v4.1 1,678–1,997 · v4.2 1,219 ·
late 1,653; z0.6 late 1,810 (gate 1,700; v4.1 2,116).

**Logic** (`sysprof`, final source, ms per tick): v4.2 sum plaza 0.226 · office revealed 0.365 · depot 0.232 · 관망 0.204
(budget 0.25; the office view's sample also had v4's own share at 0.64 against 0.25–0.34 elsewhere: machine noise);
office alone 0.061 / 0.154 / 0.085 / 0.101 (budget 0.05, as §8.2).

**Build:** `build_artifact.mjs --webp --mp3-only` on the final source: **413 files** (412 + the page), 65.70 MB, largest
1.25 MB (`game.js`, 136 modules). `dist/artifact_files.json`: batch 1 = 125 files (32.1 MB) + the 125 `stale` paths as
null (250 paths + the page); batch 2 = 245 files (30.7 MB); batch 3 = 42 files (6.0 MB: `game.js`, `chat.js`, `lib/`,
every manifest, `_packed/index.json`, `title_bake.json`). From the live v4.1 version (491 files) the version holds
376 → 404 → 412 files + the page during the update. `test_deploy.mjs standalone --quick`: PASS 14/14, WebGL, title
3.2 s, no placeholder art, no failed requests, 0 errors.

**Screenshots** (`screens_v42/`, 43): looked at each; 09 and 20 re-shot after the tool fix. Small things seen: the 길
안내 edge label (`교역소 판매대`) can sit over the 마을 chip at 390 px (09 ko / en); the consist labels at 서리역 run over
the station sign (06); a coin flying to the counter passes over the 관망 banner (19 en 360).

### 9.3 Still open (none blocks the update)

1. Economy gates (designer, §7): raw piles 93 %, income +33 %, 훈제 고기 shelf 11 %.
2. `visitors42`: v4.2 86–95 % of v4.1's visitors a minute over minutes 3–20 (four runs), at or below the −10 % line.
3. Draw calls +1–4 a frame; display objects over 1,700 in the late village (as v4.1).
4. Logic: the office 1–3× its 0.05 ms; the v4.2 sum over 0.25 in the office view under load.
5. Textures: GL bytes up to ~466 MiB while a late-village view settles (the source-sum must holds); soft targets missed.
6. The arrow-only player reaches 읍 at 51.5 (+8 %) and the smart bot's longest wait is 3.35 min (gate 3.0) — both at the
   읍 savings; v4.1 was 5.2.
7. On a fresh boot the train stays hidden (and the train card shows colour chips) until the train2 pages and `v42_core`
   are in — seconds on a phone, longer on the loaded test machine.
8. Flaky checks: 총총이's 300 px, the panel timing under load, `reqlog42`, `fuzz42`'s texture-key console line, `life`'s
   "tag among kids".
9. The update window: between the first and the last publish the live v4.1 code runs with the 125 stale files gone and
   115 packed pages / sound files already replaced — publish the three batches back to back.
