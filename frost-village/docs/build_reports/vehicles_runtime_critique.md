# vehicles_runtime (v5): adversarial review

This review covers `src/vehicles/**`, `tools/test/vehicles_lab/**`, `docs/previews/vehicles_lab_*` and
`docs/build_reports/vehicles_runtime.md`. I checked them against:

- the plan: `docs/v5_v8_plan.md` §6.3, §4, §7 and §9;
- the designer's wishes: `docs/기획서_v5_생활과미션.md` §1 and `docs/기획서_v5_v8_개발계획.md`;
- `docs/CONTRACT_V5.md` (L, M, N, R) and the vehicles manifest;
- the real v4 code in `src/**` as it stands on 2026-10-10.

I treated the module's files as read-only and did not change any file outside this one. All probes ran in
`/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/later_vehicles_runtime/` (called `$S` below):

- Node probes are in `$S/probes/`.
- Browser probes are `$S/probe_lab_art.mjs` and `$S/probe_lab_flow.mjs`. They load the real lab page.
  - `probe_lab_art.mjs` serves a modified `lab.js` through Playwright `page.route`, so no repo file changes.
  - `probe_lab_flow.mjs` uses the unmodified lab.
- `$S/run_lab_copy.mjs` is a copy of the lab runner that writes its output to `$S/previews/`.

Every command ran with `nice -n 15`, one Chromium at a time, each run under 2 minutes.

**Verdict: rework.**

The pure model is good work and it reproduces exactly:

- lanes, car following, connector reservation, rail crossings, traffic lights;
- freight conservation, save sanitising, determinism;
- 25/25 Node tests pass, and every lab group re-runs with 0 errors and 0 placeholders.

The art direction also lands. The sleigh buses, the seated passengers, the horses' breath and the transit chip all
have the charm the designer wants. But the module would harm the game once it is wired in:

- **Gridlock after a delivery.** The first finished delivery run leaves the chief's vehicle parked in a lane forever.
  The bus network jams behind it, and the 도시 rider bar falls to 0.
- **Drive mode is not integrated.** The player is not frozen, the camera does not follow, and a run cannot be
  abandoned.
- **Art that arrives late is never shown.**
  - After a reload, the stops, depots and traffic lights are invisible.
  - The 도시 ceremony never asks for the asphalt or the 도시 sounds.
- **Several promises depend on things that do not exist in v5 or in the real village.**
  - No house reaches level 2 in v5, so 도시 has no cars.
  - The 120 riders a day only appear with a fake rider supply.
  - The village decor and the SE watchtower sit on the new streets and stops.

Most fixes are local: a few lines in `chiefDrive.js`, `host.js`, `Statics.js` and `layout.js`, plus additions to
the Integration section.

| Severity | Count |
|---|---|
| critical | 1 |
| high | 8 |
| medium | 9 |
| low | 8 |

---

## 0. 디자이너용 요약 (쉬운 말)

- **좋은 점**
  - 말썰매 버스가 정말 예뻐요.
    - 말이 입김을 내뿜고, 창문으로 손님이 보여요.
    - 정류장에 줄 선 사람들이 차례로 타요.
    - 촌장님이 창가에 앉아 하트를 띄우는 장면도 귀여워요.
  - "어디로 갈까요?" 목록, 버스 타기, 버스를 따라가는 카메라가 자연스러워요.
  - 계산은 꼼꼼해요. 차끼리 부딪히지 않고, 짐 개수가 정확히 맞고, 저장도 잘 돼요.
    - 테스트 25개가 모두 통과했어요.
    - 실험실 화면을 처음부터 다시 만들어 봤는데 오류가 하나도 없었어요.
- **꼭 고쳐야 할 점 1: 배달을 한 번 하면 버스가 멈춰요.**
  - 촌장님 트럭(또는 개썰매)이 배달을 끝내면 마지막 가게 앞 찻길에 그대로 서 있어요. 계속이요.
  - 뒤에 오던 버스가 그 뒤에서 15분 내내 꼼짝 못 해요.
    - 15분 동안 버스가 정류장에 서는 횟수가 77번에서 3번으로 줄어요.
    - 오늘 버스 손님이 0명이 돼요.
  - 도시가 되려면 버스 손님이 하루 120명 필요한데, 배달 한 번이면 길이 막혀요.
- **꼭 고쳐야 할 점 2: 운전할 때 촌장님이 둘이 돼요.**
  - 트럭 운전석에도 촌장님이 있고, 원래 서 있던 자리에도 촌장님이 그대로 서 있어요.
  - 게임에 붙이면 조이스틱이 트럭과 서 있는 촌장님을 같이 움직여요.
  - 카메라는 서 있는 촌장님을 따라가서 트럭이 화면 밖으로 사라져요.
  - 운전을 그만두는 버튼이 없어요. 길을 잃으면 끝낼 방법이 없어요.
- **게임을 다시 켜면 정류장 건물이 안 보여요.**
  - 정류장 지붕, 차고지, 신호등 그림이 늦게 도착하면 다시 그리지 않아요.
  - 이름표("서리역")만 공중에 떠 있어요.
  - 도시에서는 신호등이 안 보이는데 차들은 보이지 않는 빨간불에 서요.
- **도시 승격식 때 아스팔트가 안 깔려요.**
  - 아스팔트 그림을 아무도 불러오지 않아서 길이 밋밋한 베이지색으로 칠해져요.
  - 버스 경적과 자동차 소리도 안 나요. 게임을 다시 켜야 나와요.
- **서리역 정류장이 망루와 겹쳐요.**
  - 새 큰길 한가운데에 가로등 2개, 표지판, 장작더미, 그루터기가 서 있어요.
  - 실험실에서는 마을 장식을 그리지 않아서 보이지 않았어요.
- **v5 도시에는 자동차가 한 대도 없어요.**
  - "2단계 집"은 v6(항구의 유리 수입)부터 생겨요.
  - 그때 생겨도 집 앞이 아니라 은행 근처 주차칸에 세워져요.
- **버스 손님 120명 조건이 위험해요.**
  - 테스트는 정류장마다 사람이 꽉 차 있다고 가정했어요.
  - 정류장에 2명씩만 기다리면 하루 70명이에요.
  - 자정이 되면 0명으로 돌아가요.
- **마구간만 짓고 큰길을 안 지으면** 개썰매 배달 미션이 게시판에 뜨는데 시작이 안 돼요.
- **버스를 예약하고 멀리 걸어가도** 버스가 오면 촌장님이 그 자리에서 사라져요.
  - 화면이 갑자기 서리역으로 휙 바뀌어요.
- **말이 어색한 곳**: 약초나 케이크 배달인데도 "우체통을 지나가면 저절로 서요"라고 나와요.

---

## 1. What holds up (re-measured)

| Check | Builder | Re-run (this review) |
|---|---|---|
| Node tests | 25 / 25 pass | 25 / 25 pass, 5.5 s (`nice -n 15 node --test tools/test/vehicles_lab/*.test.mjs`) |
| Model perf (busy 도시, Node) | 0.054–0.059 ms per tick | 0.0566 ms; 0.042 → 0.083 → 0.105 → 0.125 ms with 0 / 30 / 60 / 100 walkers in view (`$S/probes/p5_misc.mjs`) |
| Lab `eup,ride` | 0 errors, 0 placeholders | 11 shots, 0 errors, 0 placeholders, 88 s; 읍 0.102 ms per tick, 7.5 draw calls, 46.19 MiB era textures; ride S2 → S1 arrived |
| Lab `sled,walker` / `city` / `ceremony,truck` / `english,desktop` | all clean | all clean (22 / 67 / 27 / 36 s); 도시 6.9 draw calls (day), 9.9 (night); busy 도시 minute 0.145 ms (logic + view; builder 0.115) |
| Ceremony + walker with GIFs | retro buses out; bus waits, one bell | identical: `['retro_bus' ×3]`, walker waited 12 frames, min gap 5.45 m, 1 bell |
| Freight conservation, determinism, save fuzz | pass | pass (and see L1) |

The re-run captures are in `$S/previews/vehicles_lab_*`. The builder's captures were not touched.

**Visual verdict on the captures:**

- `eup_bus_zoom12` and `ride_aboard` are the best frames. You can read the riders in the windows, the overlay frame
  sits right, and the horses' breath puffs look good. Zoom 0.6–1.2 reads well.
- `city_day` has believable asphalt with dashes and crosswalks.
- The weak spots:
  - The HUD panel covers the rank chip (L4).
  - Stop names vanish below zoom 0.7 (L3).
  - `eup_zoom06` is 60 % empty snow.

---

## 2. Findings

### C1 (critical): every finished delivery leaves the chief's vehicle parked in a lane forever and gridlocks the buses

**What happens.** `ChiefDrive.finish()` (`src/vehicles/model/chiefDrive.js:379-394`) does three things:

- sets `v.holdOn = true`;
- sets `role 'parked'`;
- leaves "the host sends it home (`home()`)" as a comment.

Nobody calls `chief.home()`: `grep -rn "home(" src/vehicles` finds only its definition at `chiefDrive.js:397`. The
vehicle dwells forever in the delivery lane. The last stop of most runs is on 중앙로 (`main`), which is bus line 1's
street.

The gridlock breaker (`VehicleSim.unjam`) cannot help. It only looks at vehicles in `state 'drive'`, and the parked
vehicle is in `'dwell'`.

**Repro (Node).** Run `cd $S/probes && nice -n 15 node p1_drive_leftover.mjs`. It is the module's own `makeModel`
with 2 + 1 buses and 1 wagon: one `cafe` / `mail` run with the test's steering bot, then 15 game minutes.

| Run | Bus arrivals / 15 min | Riders today | Behind the parked vehicle |
|---|---|---|---|
| 도시, no drive | 77 | 152 | — |
| 도시, truck `cafe` run (★★★ 22.5 s) | **3** | **0** | `retro_bus waits 890 s` |
| 읍, no drive | 65 | 128 | — |
| 읍, dog sled `cafe` | **3** | **0** | `horse_sleigh_bus waits 888 s` |
| 읍, dog sled `mail` | **2** | **0** | `horse_sleigh_bus waits 858 s` |

**Repro (browser, real lab).** `OUT=$S/previews node $S/probe_lab_flow.mjs` reports:

- `after2min.leftover = { key: 'truck_cargo_chief', state: 'dwell', holdOn: true }`;
- `behind: ['retro_bus waits 97s']`.

Capture: `$S/previews/probe_leftover_truck.png`. The truck stands outside the café with a retro bus queued behind it.
The chief is baked into the cab of `truck_cargo_chief`, so he also appears to sit in it forever.

**Why the tests miss it.** `driveBot` stops at `veh:driveDone`, and the lab's last truck capture is the result card.

**Consequences.**

- Bus 1 stops.
- `ridersToday()` drops to 0, so the rank-3 bar cannot fill.
- Every later drive adds another parked vehicle, because `start()` always spawns a new one.
- Only a reload clears it (vehicles are transient).

**Fix.**

- After the unload dwell, release the vehicle and send it home: `v.holdOn = false; this.home(v.id)`. Or have the host
  do it, e.g. on `veh:driveDone`: `this.later(2.5, () => m.chief.home(ev.id))`.
- Let the view put the chief down beside it: `ports.chief.place(v.x + door, v.y + door)`, then `hide(false)`.
- Add a test: after `driveDone` and 120 s, no vehicle has `role 'parked'` or `holdOn`, and line arrivals per minute
  are within 10 % of a control run.
- As a safety net, let `unjam` (or the 2 s bell rule) treat a non-bus vehicle that has dwelt for more than 20 s while
  someone waits behind it as releasable.

### H1 (high): drive mode is not integrated: the player is not frozen or hidden, the camera does not follow, pads stay live

**What happens.**

- `api.drive()` → `view.driveStarted()` (`src/vehicles/view/VehiclesView.js:304-308`) only shows a toast.
- The module calls `ports.chief.hide()` and `ports.view.follow()` only for bus rides (`followRide`, `VehiclesView.js:158-164`).
- The Integration patch P1b freezes the player only while `gs.chiefSeated`, which only `chief.hide(on)` sets.

So during a drive in the real game:

- `Game.tick` still runs `p.update(dt, inp)` (`src/scenes/Game.js:1591`) with the same joystick vector that steers
  the vehicle. The chief walks while the truck drives.
- `handlePlayerPads(dt)` (`Game.js:1596`) stays active. The walking chief can step onto build or pay pads mid-run.
- The camera target is still the player (`Game.js:1638-1648`), so the vehicle leaves the screen.
- The view also seats a chief doll on the sled (`chief: … SLED.has(v.key)`). For the truck the chief is baked into
  the art. Either way there are **two chiefs** on screen.

**Repro (browser).** `probe_lab_flow.mjs` reports `duringDrive = { standingChiefVisible: true, standingChief: [1814,1072],
truck: [2062,1042], apartPx: 255 }` four seconds into the run.

The lab hides the rest with its own `LAB.followVeh` camera and a static chief (`tools/test/vehicles_lab/lab.js:188-190`,
`run_lab.mjs` sets `L.followVeh`).

**Fix.**

- In the host (or view), on `veh:drive op:start`:
  - call `ports.chief.hide(true)`, which also sets `chiefSeated`, so input and pads freeze;
  - call `ports.view.follow(() => vehicle position)`;
  - fade the chief to the start point. The run starts at `p:yard`, not where the chief stands. Alternatively, start
    the run at the lane nearest the chief.
- On `driveDone` or `abort`: call `place` beside the vehicle, then `hide(false)` and `follow(null)`.
- Add these to Integration §11.2 P1b and to the lab, so the lab stops working around them.

### H2 (high): a run can never be abandoned, and the steering rules can trap the module's own driver

**What happens.**

- `DriveHUD` (`src/vehicles/view/DriveHUD.js`) has a timer, stars, the next stop, 빵빵 and the result card. It has
  **no "그만할래요" button**.
- `abortDrive()` exists only for the missions engine.
- A run never fails and has no time-out.

Once H1 is fixed (the player frozen during drives), a run the player cannot finish becomes a softlock.

The module's own steering bot, the one in `vehicles.test.mjs` `driveBot`, does not finish several v5 routes
(`$S/probes/p2_routes.mjs`, 600 s each):

| Route | Dog sled (읍) | Truck (도시) |
|---|---|---|
| `herbs` (B2) | not finished | done |
| `lunch` (B5) | not finished | done |
| `cake` (B6) | not finished | not finished |

The trace (`p2c_trace.mjs cake`) shows where it sticks.

1. The guide's next turn points back past the heading, so `thr < -0.85` means brake (`chiefDrive.js:124`).
2. Stopped with the stick back, `turnAround` fails 421 times with "no room", because the sled is inside a connector
   on a short track.
3. The HUD says "여기선 못 돌아요 · 조금 더 가요", but the arrow still points back. Following the arrow keeps the sled
   braked.

A bot that obeys the hint (pushes forward for 3 s) finishes everything except the **dog-sled herbs run (B2)**
(`p2d_smartbot.mjs`):

- 107 turn-rounds in 600 s;
- it oscillates at the 중앙로 × back street junctions, between (4877, 2641) and (4912, 2531) (`p2e_herbs.mjs`).

A human may do better, but this is the same input model a thumb uses. B2 is a repeatable board mission
(`src/missions/data/catalog.js:96`).

**Fix.**

- Add a small "그만할래요 / Stop" button to the HUD that calls `abortDrive()`. The mission stays on the board.
- Idle coasting should follow the guide route, not "straight first" (`chiefDrive.js:249`), so hands-off always
  arrives.
- When `turnAround` fails, coast instead of braking.
- Make the HUD arrow point along the guide's next turn, not straight at the stop.
- Add a test: hands-off (idle) finishes every v5 route at ★.

### H3 (high): stops, depots, the yard sign and the traffic lights stay invisible when their atlas arrives late

**What happens.**

- `Statics.build()` (`src/vehicles/view/Statics.js:24-67`) skips any key that `Assets.has()` does not have yet
  (`put`, line 28).
- It is rebuilt only on `built`, `veh:era` and the ceremony.
- The host asks for `veh_depots`, `veh_street` and `veh_signs` through `ports.assets.fragment` with no callback
  (`host.js:74-81`). Nothing listens to `Assets.arrivals` either.
- The labels are added unconditionally, so they float on their own.

In the game, the view is built the moment the module is created, and late atlases arrive seconds later. So on every
session start (a reload at 읍 or 도시):

- the sleigh or bus stop shelters, the stable or fuel depot, the bus depot and the traffic lights are missing until
  something is built;
- the lights still stop traffic (`VehicleSim.tryReserve`), so cars wait at invisible red lights.

**Repro (browser).** `OUT=$S/previews node $S/probe_lab_art.mjs` runs the real lab without the four building atlases
preloaded. The game never preloads them.

- `atConstruct: { images: 5, labels: 6, hasSleighStop: false }`;
- after 8 s and all late loads (`lateLoads: veh_depots, veh_street, veh_signs`): `images: 5` (only the yard's v4
  crates), `hasSleighStop: true`.
- Capture `$S/previews/probe_eup_reload_S2.png`: people queue on a bare curb under a floating "서리역".

The lab never shows this because `lab.js:36-38` preloads every `veh_*` atlas.

**Fix.**

- Rebuild Statics when one of their atlases arrives. Either:
  - `Assets.arrivals.push(k => /^veh_(depots|street|signs|lots)/.test(k) && this.statics.build())`, removed on
    destroy; or
  - in `Statics.update`, retry `put` for pending keys.
- Make the lab exercise it: drop the building atlases from `VEH_ATLASES`, as the game does.

### H4 (high): the 도시 ceremony never asks for `road_asphalt` or the 도시 sounds, so the streets get the flat fallback colour

**What happens.**

- Only `VEHICLES_MODULE.prefetch` mentions `road_asphalt` and the era-3 sounds (`src/vehicles/index.js:16-28`), and
  the ModuleHost calls it once, when the gate opens at 읍, with the era-2 list.
- On `onFeed({t:'rank', level:3})` the host only calls `wantArt()`, which asks for vehicle atlases from the
  `vehicles` fragment (`host.js:190-197`).
- v4 `RoadPaint` never wants `road_asphalt`:
  - `PAINT_FILES` and `EUP_FILES` at `src/systems/RoadPaint.js:20-21`, and the `need` at line 201, do not include it;
  - `onArrive` (line 71) does not re-bake when it arrives;
  - `pattern()` returns null, and the cells are filled with `rgba(190,176,162,0.9)`.

Integration P18 says "Asphalt itself already works", but that is not true in the game.

The same gap leaves `sfx_bus_horn` (the ceremony horn at 5.2 s), `sfx_car_honk_*` and `sfx_truck_engine` unloaded.
`Audio.play` silently skips missing keys (`src/core/Audio.js:51-62`).

**Repro (browser).** `probe_lab_art.mjs`, part 2, runs the ceremony with asphalt not preloaded:

- `asphaltCells: 491`, `hasRoadAsphalt: false`, and the module's `lateLoads` contain no `road_asphalt`.
- Compare `$S/previews/probe_city_after_ceremony_no_asphalt.png` (pale flat fill with dashes) with the builder's
  `docs/previews/vehicles_lab_city_day.png` (dark asphalt with snow dusting). The lab preloads `road_asphalt`
  (`lab.js:39`).

**Fix.**

- On the era change, call the module's own prefetch for the new era before the wipe:
  `P.assets.fragment('roads', { only: ['road_asphalt'] })` and the `audio3` keys.
- Start the wipe when `Assets.has('road_asphalt')` (time out after 3 s).
- P18 must add a `CITY_FILES = ['road_asphalt']` list to RoadPaint's `need` for rank ≥ 3, to `onArrive`'s
  invalidation keys and to `BAKE_ONLY`.

### H5 (high): `has('veh:sled')` says yes before any sled route can start, so the board shows dead drive missions

**What happens.**

- `api.has('veh:sled')` is `era >= 2 && built.depot` (`host.js:277`).
- Until 서리 큰길 (`road`, 5 000 coins + 40 planks + 10 ingots) is built, the village tracks do not connect to
  `conn_e` / `main`. `TRACK_LINK` joins `east_gate` to the west end of `conn_w`, which only exists with `road`.
- So `chief.start` refuses every v5 route except `cake`.

**Repro.** `cd $S/probes && nice -n 15 node p6_reach.mjs`:

| Built | `has('veh:sled')` | mail | herbs | cafe | shops | lunch | cake |
|---|---|---|---|---|---|---|---|
| depot | true | unreachable | unreachable | unreachable | unreachable | unreachable | ok |
| depot + yard | true | unreachable | unreachable | unreachable | unreachable | unreachable | ok |
| depot + yard + road | true | ok | ok | ok | ok | ok | ok |

The missions catalog offers B2 herbs on `rank:2` + `veh:sled` alone (`src/missions/data/catalog.js:96`), so the card
appears and `drive()` resolves `{ stars: 0, aborted: true, reason: 'unreachable' }`.

**Fix.**

- Either `has('veh:sled')` also requires `built.road`, or (better) expose `canDrive(route, vehicle)`, which runs the
  same reachability check `start()` does. The missions engine would then gate each template on it.
- Add a test: every route that `has()` / `canDrive()` advertises starts.

### H6 (high): the layout collides with the real village, which the lab never draws

The lab draws only `WORLD.v4` (town buildings, the station) plus its own pines. `WORLD.decor`, the v3 towers, the
plots and the VillageLife areas are missing. The report's §11.2 says "nothing overlaps in the lab check except S3".
A scan of every point in `WORLD` (`$S/probes/p4b_layout.mjs`) finds the following.

**S2 서리역 shelter on the SE watchtower.**

- S2 is at (2883, 1427) (`layout.js:47`) and `towers.tower_se` is at (2870, 1370).
- The footprints are `sleigh_stop` / `bus_stop` 208 × 104 and `watchtower` 181 × 91.
- With centres 13 px and 57 px apart, the diamond-overlap measure is |dx| / 194.5 + |dy| / 97.5 = 0.067 + 0.585 =
  **0.65 < 1, so they overlap**.
- When the player has built the SE watchtower (v3), it stands in the middle of the main v5 stop.
- S2 was moved from (3.2, −3.6) to (−0.1, −3.6) to avoid the rank pad. That move is what put it on the tower.

**Decor in the middle of the new carriageways.**

| Street | Item | Position (px) | Lattice |
|---|---|---|---|
| `conn_w` | lamp post `decor[65]` | (2010, 905) | (−15.1, −2.3) |
| `conn_w` | lamp post `decor[66]` | (2230, 1060) | (−10.9, −3.0) |
| `conn_w` | signpost `decor[64]` | (1880, 1005) | (−14.5, −4.8) |
| `conn_jog` | firewood pile `decor[73]` | (2440, 1310) | (−5.4, −5.2) |
| `conn_e` | tree stump `decor[75]` | (2580, 1400) | — |
| `conn_e` | snow pile `decor[77]` | (2440, 1440) | — |
| `conn_e` | tree stump `decor[74]` | (2700, 1360) | on the curb |

Buses drive through them, and the ground paints asphalt or cobble under them.

**Other collisions.**

- The curb bay at (1.6, −9.7), px (2602, 1677), sits on the v3 building plot `se_s3` at (2560, 1700), 62 px away
  (ground ≈ 1 m). A car will park inside whatever the player builds there.
- S1 (2131, 849) is 64 px from the centre of the VillageLife `east_dock` gathering ring (r 140) and 138 px from its
  campfire. Villagers sit and chat inside the shelter.

**Fix.**

- Add a Node test that checks every module footprint (stops, depots, yard, lot, bays, carriageway cells) against
  `WORLD.decor`, `WORLD.towers`, `WORLD.plots`, `WORLD.life.areas`, `WORLD.pads*` and the v4 objects.
- Move S2 east of the tower: around (1.5…2.0, −3.6), still clear of the rank pad at (4, −3.9). Check both
  footprints.
- Put the decor list into P19 "decor removal" explicitly: `decor[64]`, `[65]`, `[66]`, `[73]`, `[74]`, `[75]`, `[77]`.
- Drop the (1.6, −9.7) bay, or skip it while `se_s3` is built.
- Move S1 out of the `east_dock` ring, or move the ring.

### H7 (high): v5 도시 has no private cars, and cars later park at curb bays far from the houses

**What happens.**

- Cars come only from `homes()` entries with `level >= 2` (`fleet.js:157, 171-183`).
- v4 houses (`House.js`, `HouseLot` in `Shop.js`) have no level.
- The plan creates house level 2 through the **v6** glass import (`v5_v8_plan.md:914`: "유리 → house level 2: lit
  windows at night, a parked car at the door after 도시").

So in v5, 도시 has buses and trucks but **zero cars**. The buildable parking lot (1 500 coins + 4 ingots) stays empty,
and the car palette is never used. The report's 한눈에 promises "2단계 집 주민은 자동차를 가져요", and the designer
asked for "집 레벨이 오르면 집 앞에 자동차 (잘사는 마을의 표시)".

Even once level-2 houses exist, a home spot needs `h.park` (`fleet.js:157`), which no v4 house provides. Cars would
then go to the 4 curb bays near the bank and the station, or the lot, not "집 앞". House spots also have
`pos = null` (`fleet.js:158`), so cars parked there never drive.

**Fix.**

- Decide a v5 car source. For example: at 도시, every finished district house (`HouseLot st 'done'`) and every
  village house with 2+ residents counts as level 2 for cars.
- Give `homes()` a `park` point at each house's street-facing door: a curb spot on the nearest lane, so the car can
  also leave.
- Update the 한눈에 text.
- The lab's `CITY_HOMES` (`run_lab.mjs`) fakes level-2 homes at (0, 0). Make the lab use real house positions.

### H8 (high): the rank-3 "버스 승객 120 per game day" bar is only met with a fake rider supply, and it drops to 0 at midnight

**What happens.**

- The plan's rank 3 needs 120 riders per game day ("rolling", `v5_v8_plan.md:104`).
- The module's proof (`vehicles.test.mjs` "2 buses ⇒ ≥ 120") uses `fakeEnv.board`, which fills every free seat at
  every stop, including the village stop S1.
- The lab's `board` adds 1–3 invented riders on every call (`lab.js:296-297`).
- P6 only says board "returns up to n from the people queued at the stop". TownSim has no bus trips today: only train
  trips with `tripChance 0.35` a day (`src/systems/TownSim.js:606-618`).

**Repro.** `$S/probes/p3_ride_riders.mjs` runs line 1 × 2 buses and line 2 × 1, 3 game days:

| `board()` supply | Riders per day | Need |
|---|---|---|
| fake (module tests) | 240 / 240 / 224 | 120 |
| ≤ 2 queued per call, none at S1 | **70 / 70 / 74** | 120 |
| ≤ 1 queued per call, none at S1 | **35 / 35 / 37** | 120 |

`ridersToday()` (`VehiclesModel.js:293`) returns the calendar day's count: 232 just before the day turns, **0 right
after**. So the HUD bar empties every morning; it is not "rolling".

v4's `main.walk` line (j −4.5) lies 0.7 m from the westbound lane centre (j −5) inside the widened carriageway
(`WORLD.v4.streets.main`, `eup.main.road [-8,-4]`). TownSim walkers stream along bus 1's lane at S3. The report
lists this as optional (§11.2 P19, last bullet). Each walker costs a bus a stop plus a 2 s bell, which lowers riders
further.

**Fix.**

- Write the P6 contract down:
  - a rider source per town stop, e.g. TownSim trip wishes plus `pickRiders(n, { any: true })` top-up, abstract
    when off screen;
  - riders back from the village at S1 (Visitors going home by bus).
- Add a model test with a queue-limited board that still reaches 120.
- Otherwise retune: the 3rd sleigh bus, a shorter line-2 headway, or a lower bar.
- Make `ridersToday()` a rolling 600 s window (sum of 60 s buckets).
- Make "move `main.walk` to −3.5 at 읍" a required patch.

### M1 (medium): creating the module at 읍 repaves v4's streets immediately and spoils v4's own cobble wipe

**What happens.**

- The constructor runs `applyClass(false)` (`host.js:50`).
- Its filter `this.model.era >= 3 || ['main','back','ave'].indexOf(id) < 0 || true` (`host.js:99`) is always true.
  The `|| true` looks like a debugging leftover.
- So `main`, `back` and `ave` are upgraded to cobble on the spot.
- The gate is `rank.level >= 2`, which v4's `Rank.ceremony()` sets at the **start** of the 12 s ceremony
  (`src/systems/Rank.js:65`).
- With a 1 Hz gate poll, the module is built 0–1 s into the ceremony. That is before v4's animated repave at 3.0 s,
  or 5.8 s at the hall.
- RoadPaint re-bakes the whole street box at once (`RoadPaint.js:76`, not `wiping` yet), in the cobble fallback grey,
  because `setRank(2)` has not asked for `road_cobble_wide` yet. The tile-by-tile wipe is lost.

**Repro.** `$S/probes/p5_misc.mjs` P6 output, with a fresh RoadNet:

- `v4StreetClassBefore: {main:0, back:0, ave:0}` → after `new VehiclesHost(...)`: `{1, 1, 1}`;
- `roadNetChangeEvents: ['main→cobble', 'ave→cobble', 'back→cobble']`.

**Fix.**

- At era 2, only upgrade the module's own streets (remove `|| true`).
- Or gate the module on `rank.level >= 2 && !rank.ceremonyOn`.

### M2 (medium): who the vehicles yield to

`town.walkers()` is TownSim bodies only (§11.1). Village residents (`VillageLife`), Visitors, workers, porters and
the dog are `gs.agents`, not TownSim. The dog sled and the chief's truck use the village snow paths (`sledTracks`,
`CHIEF_KEYS` → `allowFor` allows every lane), and they never slow for any of them.

The plaza approaches (`plaza_e`, `east_link`, `farm_link`) are exactly where porters walk all day. Together with the
known side-collision gap (§10 of the report) and v4's `main.walk` line in the bus lane (H8), "사람이 먼저" holds only
for townsfolk ahead of a vehicle.

**Fix.**

- `walkers()` should include `gs.agents` within the view margin: residents, Visitors, workers, porters, the dog and
  the player.
- Walkers on a vehicle's lane should wait at the curb (the report's own `laneClear` proposal).
- Restrict the truck to roads, as the plan says ("촌장 트럭: any drive lane"). That also stops a cargo truck driving
  through the plaza paths.

### M3 (medium): a booked ride boards the chief wherever he has walked to

**What happens.**

- `Transit.arrive()` boards any `waiting` booking whose `from` is this stop (`transit.js:223`), without checking where
  the chief is.
- `TransitChip` keeps "버스를 기다려요 · N초 / 안 탈래요" on screen anywhere on the map (`TransitChip.js:44-52`).
- When the bus arrives, `followRide` hides the chief and jumps the camera to the bus.

**Repro.**

- Node, `p3_ride_riders.mjs` P3a: booked at S2, chief moved to (600, 1300), 2 297 px away. The model boards at S2.
- Browser, `probe_lab_flow.mjs`:
  - `chipWhileAway = { state: 'waiting', t1: '버스를 기다려요 · 32초' }`;
  - then `boarded = { riding: true, chiefHidden: true, chiefAt: [1700, 1500], cameraFollows: true }`.
  - Captures: `$S/previews/probe_remote_booking_chip.png` and `probe_remote_boarded.png`.
- `api.ride()` while a booking is waiting resolves the old promise with `{ replaced: true }`, but the old booking stays
  `waiting` in the model (`transit.js:315-320`).

**Fix.**

- Cancel the booking when the chief leaves `stopNear(…, 1.5 × r)` or after one missed bus, with a toast
  ("버스를 놓쳤어요").
- `book()` should cancel earlier waiting bookings.

### M4 (medium): the 도시 texture numbers leave out vehicles that are really resident, and the ceremony overlaps two eras

Atlas sizes are from the vehicles manifest PNG headers, raw RGBA.

**The 도시 numbers are short.**

- The 도시 numbers (28.7 MiB vehicles) leave out the porter `cargo_sleigh`. It stays at 도시 (`eras.js:8`), at
  6.7 MiB.
- With a porter and a drive: retro bus 9.3 + truck 4.9 + 4 cars 14.5 + cargo sleigh 6.7 + chief truck 6.5 =
  **41.9 MiB on 8 keys**.
- A dog-sled run at 도시 is still offered (`has('veh:sled')` stays true): **45.3 MiB on 9 keys**, over the plan's
  ≤ 8 keys / ≤ 45 MiB.

**During the ceremony both eras are resident.**

- The sleigh buses, wagon and porter keep driving home (32.7 MiB) while retro buses, trucks and cars load (28.7).
- Add buildings (17.1) and asphalt (1.0): **≈ 80 MiB of module textures for ~40 s**.
- v4 already measures the plaza at 323 MiB against a 300 target, and the tour peak at 381 against 455
  (`docs/build_reports/v4_verify.md:40-43`).

**The other levers are unused.**

- The plan's lever "4 car colourways in one page" (§9.1) is not used: 4 separate atlases of 2.8–4.5 MiB each.
- `veh_depots` (8.9 MiB) is resident at both eras for one depot picture.

**Fix.**

- Count the porter in the 도시 numbers.
- Retire era-2 atlases as soon as their vehicles leave the view (vanish instead of driving home when the ceremony
  camera is elsewhere).
- Hide the dog sled at 도시, or count it.
- Ask the art side for one car page per palette and a per-era depot split (an asset request, not done here).

### M5 (medium): the freight ports do not match v4's shops

**What happens.**

- P32 maps `freight.shopTargets()` to v4 `Growth.shopTargets()`. That returns open shops **with stock > 0**
  (`src/systems/Growth.js:490-493`, "train visitors' targets"), so an empty shop, the one that most needs a delivery,
  is never a target.
- v4 shops are already logistics sinks restocked by `StationPorter`s (`Shop.room(type)`, `feed`, `take`,
  `src/entities/Shop.js:281-320`). The wagon becomes a second restock channel competing with v4's porters.
- `freight.take(n, role)` ("from the village warehouse stock") has no definition of surplus. Taken literally, the
  wagon empties planks and ingots, which the player needs for the module's own depot and road, at 30 items a trip.

**Fix.**

- Define `take` as warehouse stock above a reserve, per item, e.g. Logistics' surplus rule.
- Map `need` from `Shop.room(type)` over all open shops, not `shopTargets()`.
- Route `deliver(shopId)` into `Shop.take` so the wholesale accounting stays in v4.
- Decide whether StationPorters stop restocking shops once a wagon runs.

### M6 (medium): drive and ride lifecycles leak

- A run is not saved (by design), but nothing tells the missions engine.
  - After a reload mid-drive, the mission waits for `veh:driveDone` forever.
  - Add `veh:drive op:'lost'` on load, or document that missions must re-offer "start" after a reload.
- `chief.start()` does not check for a ride or a waiting booking.
  - `p5_misc.mjs` P8: `ridingABus: true, driveStartedAnyway: true, both: true`.
  - The camera follows the bus while a vehicle drives itself, and the bus later "alights" the chief at a stop
    mid-drive.
  - Refuse with `reason: 'riding'`, or cancel the booking first.
- The previews entry `busRide` (`index.js:33`) books from the nearest stop with r 9 999, so the remote boarding of M3
  happens in the designer's preview menu too.

### M7 (medium): drive timing does not line up with the missions catalog, and the HUD mixes units

- **B5 lunch rush window.**
  - B5 (`catalog.js:101-103`): `hours: [11.5, 12.67]`, `due: { hour: 12.67 }`. At 25 s per game hour, the window is
    **29 s**.
  - The module's par for `lunch` is **89 s** with the truck (`p2d_smartbot.mjs`).
  - The run cannot finish inside the window. Pass the due time as `deadline` (it makes the run ★, "late") and widen
    the window, or drop the window.
- **Stale par values.** The catalog's `par` values are ignored by `drive()`: 70 / 60 / 90 / 95 against the module's
  175 / 91 / 46 / 100 s. Remove them, or pass them as `parOverride`.
- **Mixed units on the HUD.** The timer shows `0:03` (m:ss) next to `기준 175초` (seconds) in
  `vehicles_lab_sled_hud.png`. A player cannot compare 2:55 with 175. Show par as m:ss too.

### M8 (medium): the ceremony choreography is not specified against v4's ceremony

**Timing and camera.**

- The wipe starts the moment `onFeed({t:'rank', level:3})` arrives, and finishes 8 × 0.6 = 4.8 s later. The light pop
  is at +2.6 s.
- The rank-3 venue is the town hall (west land) or row D (`v5_v8_plan.md:104`).
- v4's hall ceremony cuts the camera to the **station square** (`Rank.js:90-101`), 28 cells from the wipe centre
  (32, −6) where the lights pop.
- Unless P17 calls `onFeed` at the camera cut and points the camera at (32, −6), the best moment happens off screen.

**Double banner.** v4 shows `t('rankUp')` at 0.6 s; the module shows "서리읍 → 서리시!" at 0.8 s
(`VehiclesView.js:322`).

**Sleigh buses retire to the wrong depot.** They go to the **bus depot**, because `depotPos` picks `p:busDepot` at
era 3 (`VehiclesModel.js:134-137`). The plan says "sleigh buses roll into the stable".

**Fix.** In P17, give the exact step (at the camera cut), the camera target and "Rank shows no banner of its own at
level 3". Retire sleigh buses to `p:stable`.

### M9 (medium): the start toast names the wrong place on most runs

- `driveStart` reads "배달 시작! 우체통을 지나가면 저절로 서요" (`strings.js:21`). It is used for **every** dog-sled
  run: herbs to the clinic, cake to the town hall, lunch to the restaurants.
- `driveStartT` reads "가게 앞을 지나가면" and is used for the clinic and the town hall too.
- **Suggested text**: "배달 시작! 배달할 곳을 지나가면 저절로 서요". Or name the first stop: "{name} 앞을 지나가면 …".
- The English versions are ungrammatical: "Pass a drop-off and you stop by itself". Use "Drive past a drop-off and
  you'll stop there".

### L1 (low): save edges

- The worst case with realistic 24-character pids and template ids is **1 653 B**, against the report's 982 B.
  - `fitVehicles` then drops 3 cars → 1 523 B (`p5_misc.mjs` P5).
  - On load those owners get a re-rolled colour.
- `sanitizeVehicles` ignores `v`, so a future v2 slice would load as v1. Reject or migrate on `v !== 1`.
- Best times keep the first 12 templates forever (`chiefDrive.js:387`).
  - A 13th template is never stored, so its result card says "새 기록!" every run.
  - 12 board drives (B1–B12) plus the designer preview's `tpl: 'preview'` make 13.

### L2 (low): prepared feedback never reaches the player

`firstBus` ("말썰매 버스가 이웃 손님을 태우고 와요!"), `eraTown`, `freightOut`, `truckOut` and `shopFilled` are
defined but never used. The 읍 era starts without a welcome moment, and the wagon's work is silent.

`sfx_steam_whistle` is in `FRAGMENTS` but never played. The steam wagon has no sound at all: no loop, no whistle.

Use them: first bus out, wagon leaving loaded (with the whistle), a shelf filled.

### L3 (low): stop names disappear at phone zoom

Labels show only at zoom ≥ 0.7 (`Statics.js:95`). The designer's phone range is 0.6–1.2, and the report says
`eup_zoom06` shows stop labels; it does not.

Show them down to 0.6 at a constant screen size, as the bubbles do.

### L4 (low): HUD placement

The DriveHUD panel at (W/2, 196), 392 wide, covers the right end of the v4 rank chip at (28…184, ≈214). See
`vehicles_lab_sled_hud.png` and `truck_hud.png`.

Move the HUD down about 40 px, or hide the rank chip while driving (P12).

### L5 (low): track rules

- `ports.roads.tracks()` is documented as `sledTracks(WORLD.roads)` with no `open` filter (§11.1). The sled can route
  through regions that are still fogged. Pass `Territory`'s open test.
- The 도시 truck may use village footpaths (M2).

### L6 (low): code hygiene

- `|| true` in `host.js:99` (M1) and `host.js:180`, and in `allowFor` (`VehiclesModel.js:110`).
- `parkedNear` uses a doubled radius compared with `stopNear` (`host.js`).
- `vehicleSpec()` caches fallback specs if the late manifest arrives after construction. The car fallback length is
  3.8 m against 3.5 m in the art.

### L7 (low): perf headroom

The model stays under 0.15 ms, but the cost triples with walkers in view: 0.042 → 0.125 ms at 100 walkers
(`p5_misc.mjs` P9).

`walkerAhead` projects every walker in a box onto every piece ahead. A 도시 plaza with 60–100 townsfolk plus village
agents (M2) will use most of the budget.

The 2.6–8.6 ms first-materialisation spike is real: max 6.2 ms in the `city` re-run, 8.1 ms on desktop. Pre-warm as
the report suggests.

### L8 (low): report claims that do not hold

- **P19b `RoadNet.addStreet` is not needed.** Pushing the street onto `v4.streets` + `eup` and calling `rn.upgrade()`
  already rebuilds cells and lanes; the lab and the tests do exactly that. V5 streets have no `walk`, so the
  walk-line rebuild is moot. (P19c is real: `RoadPaint.js:65` registers the hook with the old `streetRect` object,
  and line 76 replaces it.)
- "nothing overlaps in the lab check except S3" (H6), the 982 B worst-case save (L1), and the zoom-0.6 labels (L3)
  are wrong.
- The 도시 texture total omits the porter (M4).

---

## 3. Integration section, checked against `src/**` today

| Patch | Verdict |
|---|---|
| P1 / P1b (`Game.js`) | The anchors exist (`Input.update(time)` :1580, `p.update(dt, inp)` :1591, `handlePlayerPads(dt)` :1596, the camera block :1637-1648). It covers rides only. **Drives need the same freeze, hide and follow (H1).** |
| P3 (`Assets.js`) | Fine for loading by key, but the era change must request roads and audio3 too (H4). `onReady` fires on manifest merge, not file arrival, so use `Assets.arrivals` (H3). |
| P4 (`Residency`) | The ≤ 8 keys / 45 MiB cap is broken at 도시 with porter + drive (+ sled), and during the ceremony (M4). |
| P6 (`TownSim`) | `board()` supply unspecified (H8). `walkers()` must include village agents (M2). The `main.walk` move must be required (H8). |
| P12 (`UI.js`) | Name the rank chip as an overlap (L4). Add the abort button area (H2). |
| P17 (`Rank.js`) | Rank has no level-3 path today (`Rank.js:62-67` stops at 2). The patch needs the step time, camera target and banner rule (M8), plus the riders bar's rolling window (H8). |
| P18 (`RoadPaint.js`) | "Asphalt already works" is false: add `road_asphalt` to need, onArrive and BAKE_ONLY (H4). |
| P19 (`world.js`, `RoadNet.js`) | P19b is not needed (L8). P19c is valid. The decor removal list is missing (H6). |
| P29 (sites) | OK. Note that the depot alone advertises sled missions that cannot start (H5). |
| P32 (`Growth.js`) | The `shopTargets()` semantics are the opposite of what freight needs. It doubles the porters (M5). |
| Missions | Nobody starts a drive. The sibling critique found no start button in `missions_bank`, and §11.2 says the engine "calls drive". One of them must own the "start the drive" moment: walk or fade to the yard, or start at the chief. Gate on `canDrive` (H5); fix the B5 window and the par values (M7); handle a reload mid-drive (M6). |

---

## 4. How to reproduce everything

```sh
S=/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/later_vehicles_runtime
cd /home/user/nurient/frost-village
nice -n 15 node --test tools/test/vehicles_lab/*.test.mjs                       # 25/25
cd $S/probes
nice -n 15 node p1_drive_leftover.mjs     # C1: parked chief vehicle, bus arrivals 77 -> 3
nice -n 15 node p2_routes.mjs             # H2: the module's bot on every v5 route
nice -n 15 node p2c_trace.mjs cake        # H2: brake + "no room" trap
nice -n 15 node p2d_smartbot.mjs          # H2: hint-following bot, herbs still oscillates
nice -n 15 node p2e_herbs.mjs             # H2: where it oscillates
nice -n 15 node p3_ride_riders.mjs        # M3 remote boarding, H8 riders/day + midnight reset
nice -n 15 node p4b_layout.mjs            # H6: collisions with WORLD decor / towers / plots / areas
nice -n 15 node p5_misc.mjs               # L1 save size, M1 early repave, M6 drive during ride, L7 walkers
nice -n 15 node p6_reach.mjs              # H5: routes before 서리 큰길
cd /home/user/nurient/frost-village
export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
OUT=$S/previews nice -n 15 node $S/probe_lab_art.mjs    # H3 invisible statics, H4 asphalt never requested (≈ 60 s)
OUT=$S/previews nice -n 15 node $S/probe_lab_flow.mjs   # H1 two chiefs, C1 in the lab, M3 remote boarding (≈ 70 s)
nice -n 15 node $S/run_lab_copy.mjs --only=eup,ride     # the module's lab, captures into $S/previews
```

Evidence captures:

- `$S/previews/probe_eup_reload_S2.png`: H3.
- `$S/previews/probe_city_after_ceremony_no_asphalt.png`: H4.
- `$S/previews/probe_leftover_truck.png`: C1.
- `$S/previews/probe_remote_booking_chip.png` and `probe_remote_boarded.png`: M3.
- The re-run lab set: `$S/previews/vehicles_lab_*`.
- GIF contact sheets: `$S/gifframes/*_sheet.png`.
