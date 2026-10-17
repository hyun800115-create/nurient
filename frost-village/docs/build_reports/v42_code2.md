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
- `src/systems/v42/art.js` (new) asks for the page after the first sale (or at once in a save past the first hire), and
  for `chief2`'s manifest once the village is complete or the office stands.
- `ChiefAura` builds on the generated rings of minute 0 and re-skins to the art when it arrives: the calm ring, the
  gold ring while he works, the back glow (ADD, `fv_glow`), sparkles, the 별 pin and the 읍 notch; DayClock lights it
  at night. `Navigator`: chevron, dots, destination ring, badge and the edge arrow on the ui5 chip plate. HUD chips
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
| Market shelf empty: 빵 / 훈제 고기 / 구운 생선 | 21 / 55 / 5 % | 0 / 10 / 0 % | 8 / 12 / 0 % | ≤ 10 % each: meat and bread just over |
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

{{PACING}}

### 3.4 Textures

`texview.mjs` (scratch `v42code2_probe/`): a fresh boot of the 46-min save per view, 45 s settled with the loop awake,
Residency source-sum; v4.1 is the v4.1 copy on the same save and view.

| View | v4.1 | CODE-2 | Plan estimate |
|---|---|---|---|
| Plaza | 355.6 | **368.7 (+13.1)** | +8 |
| Station, train in | 369.6 | **384.4 (+14.8)** | ≤ +14 |
| Office revealed | — | 392.2 | |
| Depot revealed | — | 414.9 | |
| `shots_v42` tour peak (everything the tour left resident) | — | {{TOURPEAK}} | ≤ 455 hard limit ✓ |

- The plaza's +13.1: the train pages are resident in every view in v4.1 as well, and the new cars are bigger (+5.2:
  coach 4.35 + box car 4.68 + flat car 3.05 against car_a 3.78 + car_b 3.11); CODE-1's pile bake canvas `fv_stackbake`
  (+4.0); `v42_core` (+3.1); the generated stand-in rings kept as the fallback (+0.5).
- The station's +14.8 adds `train2_rails` (1.7 MiB). It is a bake-only page like `town_rails`: it stays while the view
  is within 800 px of the streets and leaves 10 s after the view goes farther. Train pages alone: **17.59 MiB** (plan
  17.6).
- Every view stays under the 455 MiB limit; the plaza and station are over the plan's per-view estimates by 5.1 and
  0.8 MiB (§7).

### 3.5 Draw calls, display objects, logic time (`perf_cmp.mjs`, v4.1 and CODE-2 pages alternately in one browser)

{{PERF}}

### 3.6 Soak (20 game minutes, the 46-min save)

{{SOAK}}

### 3.7 Files

{{FILES}}

## 4. Tests

{{TESTS}}

## 5. Screenshots

{{SHOTS}}

## 6. Publish

{{PUBLISH}}

## 7. Known issues and what the art would need

{{KNOWN}}
