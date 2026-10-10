# vehicles_runtime (v5): build report

Standalone module, to be wired in after v4 ships. Nothing in the game imports it (a purity test checks this).
Code lives in `src/vehicles/**`, tests and lab in `tools/test/vehicles_lab/**`, captures in
`docs/previews/vehicles_lab_*`. No existing file was changed and no asset was touched.

---

## 0. 한눈에 (기획용 요약)

- **읍 시대**: 말썰매 버스 2개 노선이 다녀요. 1번 버스는 솔방울 분수 → 서리역 → 서리 광장 앞(종점). 2번 버스는 서리역 → 솔방울 학교 → 은행 앞.
  정류장에 사람들이 줄을 서 있다가 버스가 오면 타고, 버스 창문으로 승객이 보여요. 말은 입김을 내뿜어요.
  증기 짐차는 화물장에서 짐을 싣고, 서리역 짐 싣는 곳과 문을 연 가게(선반이 빈 곳 먼저)에 내려 줘요. 짐은 하나도 사라지지 않아요.
- **도시 시대**: 승격식 때 길이 중앙로부터 한 줄씩(0.6초마다) 아스팔트로 바뀌고, 신호등이 켜지고, "서리읍 → 서리시!" 배너가 떠요.
  말썰매 버스는 차고지로 돌아가고(화면 밖에 있던 버스는 바로 사라져요) 레트로 버스가 나와요. 증기 짐차는 트럭으로 바뀌어요.
  2단계 집 주민은 자동차를 갖게 되고(한 게임에 색 4가지까지), 주차장·길가 주차칸에 세워 둬요. 밤에는 전조등과 미등이 켜져요.
- **촌장이 버스 타기**: 정류장 근처에 서면 "다음 버스 12초 · 어디로 갈까요?" 칩이 떠요. 누르면 갈 곳 목록 → 고르면 기다렸다가 탑니다.
  카메라가 버스를 따라가고, 촌장은 창가 자리에 앉아 있어요. 가는 중에 조이스틱을 움직이면 다음 정류장에서 내려요.
- **촌장이 운전하는 배달 미션**: 읍에서는 개썰매, 도시에서는 촌장 트럭. 조이스틱(또는 키보드)을 가고 싶은 쪽으로 밀면 그 길로 꺾어요.
  손을 떼면 천천히 굴러가고, 뒤로 당기면 서요. **멈춘 채로 뒤로 0.5초 당기면 그 자리에서 빙 돌아요**(자리가 없으면 "여기선 못 돌아요 · 조금 더 가요").
  배달 장소를 지나가면 저절로 서서 짐이 날아가요. 시간 기준(par) 안이면 ★★★, 1.3배 안이면 ★★, 그 밖은 ★. **실패는 없어요.**
- **사람이 먼저예요**: 길에 사람이 서 있으면 차는 1.5 m 앞에서 서요. 2초 넘게 기다리면 썰매는 "딸랑딸랑", 도시 차는 "빵!" 한 번 울리고 사람이 서둘러 건너가요.
  운전 중에는 "빵빵" 버튼으로 앞사람을 재촉할 수 있어요.
- 숫자는 전부 `src/vehicles/tuning.js` (나중에 `BALANCE.v5.vehicles`) 에 한국어 설명과 함께 있어요. 자리(정류장·차고지·주차칸)는 `src/vehicles/layout.js`.

---

## 1. What it does

| Area | Behaviour |
|---|---|
| Lanes | `LaneGraph` turns v4 `RoadNet` drive edges/connectors (right-hand lanes, turn S/L/R/U, conflict sets) plus village sled tracks into lanes + connectors. Dijkstra routing with U-turn and stub penalties. Rail crossings are marked on Y lanes that cross line j = 0. |
| Simulation | `VehicleSim`: 30 Hz substeps; car following (gap 1.2 m + 0.9 s × v, hard floor 0.5 m); connector chain reservation with conflict sets and out-lane space commits; 2-phase traffic lights (green 6, yellow 2) at 도시; rail crossings via `xingBlocked(k, line)`; vehicles stop 1.5 m before a walker in their lane and ring a bell once after 2 s; gridlock rings are found (wait-for DFS each 1 s) and one vehicle ghosts through for 3 s (off-screen ones first). Driveways (`D` pieces) for bays, depots and turn-rounds. |
| Transit | Lines are loops of stops with a terminal timetable (cycle = max(drive time, n × headway)). Buses are placed on their phase clock after a load, so a save restores a believable network. Riders board from the stop queue (`ports.town.board`), alight (`ports.town.alight`), riders per day over 10 game days. The chief books a ride, boards first even when the bus is full, can leave early. ETA per stop. |
| Freight | Steam wagon (읍) / cargo truck (도시) loops yard → founded shops that need restocking (nearest first) → station cargo pad. Porter cargo sleigh yard ↔ cargo pad (읍). Exact conservation: items out of the yard = items on shelves + cargo pad (+ handed back if a vehicle retires loaded). |
| Cars | At 도시 every level-2 home gets a car (palette ≤ 4 colourways per save, 2 on low tier), parked at its home spot, a curb bay or a lot stall. ≤ 6 drive at once (errand loops or trips), parking in bays via driveways. |
| Chief drive | Dog sled (읍) or the chief's truck (도시). Stick projected on the heading = throttle; at a junction the connector closest to the stick is taken (straight on ties, guide turn when there is no straight); dead ends turn round; idle coasts at 0.6× top speed; pull back = brake; **pull back while stopped (0.5 s) = turn round in the street** (wider U if a bus stands beside; "no room" hint otherwise); a hairpin stick rolls on instead of braking. Starts facing the first stop. Drops arm when a stop is within 3.4 m laterally and there is room to brake. Par = route length ÷ (0.6 × vmax) + 8 s per stop. Never fails; late runs give ★. Best times per mission template (≤ 12). |
| Eras | `eraOf(rank)`: 2 = 읍 (horse sleigh bus, steam wagon, cargo sleigh, dog sled, sleigh stops, stable depot), 3 = 도시 (retro bus, cargo truck, chief truck, cars, bus stops, fuel depot + bus depot, lights, markings). Old vehicles retire to the depot (or vanish when off-screen), new ones come out. |
| Markings (P18) | `markings(rn, {bays})` → crosswalks one cell outside junction boxes, centre dashes every 2 cells on 4-wide carriageways (never inside boxes/crosswalks), stall lines per bay; drawn by the roads-kit `markingRule` pieces. |
| View | Pooled `VehicleSprite`s (≤ 12 materialised, nearest first; the chief's bus/vehicle always), 8-direction art (SW/NW mirrored, shadow angle negated), people on seats (driver, chief by a window, ≤ 4 riders; sit for SE/SW, stand for NE/NW) with the `over_` overlay frame on top, lamps at night (ADD glows above the DayClock overlay), steam/breath/exhaust puffs and snow kicks, depot doors, freight items flying to shelves, honk/bell bubbles (constant screen size at any zoom), transit chip + where-to list, drive HUD (timer, par, stars, next stop, block hint, edge arrow with metres, 빵빵 button, result card), the 도시 ceremony part. Art for a vehicle is requested on first need and the vehicle is simply not drawn until it is there (never a placeholder). |

---

## 2. Files

| File | Lines | Role |
|---|---:|---|
| `src/vehicles/index.js` | 39 | `VEHICLES_MODULE` for the ModuleHost (id, version, saveKey, capBytes, needs, gate rank ≥ 2, prefetch, create, sanitize, previews), `FRAGMENTS` per era |
| `src/vehicles/host.js` | 286 | `VehiclesHost(ports, saved, { View, tuning, tier, seed })`: ports → model → view; `update(dt)`, `onFeed(ev)`, `serialize()`, `api`, `artKeys()/wantArt()`, ceremony wipe |
| `src/vehicles/layout.js` | 172 | streets (`V5_STREETS`, `V5_EUP`, `streetsFor`), `STOPS`, `LINES`, `BUILDINGS`, `LIGHTS`, `PARKING`, `PLACES` (+ cargo pad `curb`), `DRIVE_ROUTES`, `sledTracks`, `CITY_UPGRADE` (Korean comments) |
| `src/vehicles/tuning.js` | 66 | `VEHICLES_TUNING` → `BALANCE.v5.vehicles` (Korean comments), `vehiclesTuning(balance)` merge |
| `src/vehicles/save.js` | 63 | `VEHICLES_SLICE`, `sanitizeVehicles` (never throws), `fitVehicles` (cap 1536 B) |
| `src/vehicles/strings.js` | 66 | 49 ko + en strings, `vt(lang, key, vars)` |
| `src/vehicles/model/lanes.js` | 285 | `LaneGraph` (lanes, connectors, tracks, rail crossings, conflicts, `route`, `snap`, `fit`, `twin`) |
| `src/vehicles/model/VehicleSim.js` | 538 | the traffic simulation |
| `src/vehicles/model/transit.js` | 327 | lines, buses, stops, riders, bookings, ETA |
| `src/vehicles/model/fleet.js` | 307 | freight, porter, cars, parking, v8 `dispatch` |
| `src/vehicles/model/chiefDrive.js` | 432 | the chief's delivery drive |
| `src/vehicles/model/VehiclesModel.js` | 373 | the model facade (eras, building, depot logistics, save) |
| `src/vehicles/model/eras.js`, `geom.js`, `rng.js`, `markings.js` | 237 | roles per era, car palette, geometry, seeded RNG (mulberry32), P18 markings |
| `src/vehicles/view/*.js` | 909 | `VehiclesView`, `VehicleSprite`, `Statics`, `TransitChip`, `DriveHUD`, `art` |
| `tools/test/vehicles_lab/vehicles.test.mjs`, `purity.test.mjs` | 621 | 25 Node tests |
| `tools/test/vehicles_lab/world_stub.js`, `fake_env.mjs` | 123 | v4 RoadNet on the real world data + a fake game for Node |
| `tools/test/vehicles_lab/lab.html`, `lab.js`, `lab_ground.js`, `lab_town.js` | 756 | Phaser 3.90 lab: real art, real RoadNet/RoadPaint, real Effects, real townfolk2 dolls |
| `tools/test/vehicles_lab/run_lab.mjs` | 334 | Playwright runner (fixed step), captures + numbers |

Model files import only `src/data/**` and `src/vehicles/**` (no Phaser, window, timers, `Date.now`, `Math.random`).
Views import only `src/core/Assets.js`, `src/data/strings.js` (FONT), `src/systems/DepthSort.js` and the module.

---

## 3. Public API (`gs.later.vehicles` = `host.api`)

```js
era() -> 2 | 3
lines() -> [{ id, stops, buses, cycle, headway }]
eta(stopId) -> s (Infinity: no bus)            ridersToday() -> n
ride(fromStop, toStop) -> Promise<{ arrived, at } | { arrived:false, cancelled|reason }>
cancelRide() · riding() -> { bus, to, leave } | null
spawn(key, route[[x,y]...], { role, dwell }) -> id · despawn(id)          // set pieces
dispatch(kind, to, opts) -> Promise<{ arrived }>                           // v8 (fleet.dispatch)
drive(spec) -> Promise<{ stars, timeS, par, best, late } | { stars:0, aborted, reason }>
     spec = { tpl, mid, vehicle: 'dog_sled'|'truck_cargo_chief', route?: DRIVE_ROUTES key, stops?: [placeId|{x,y,name}],
              start?, cargo?, capSpeed? (0.7 = wedding cake), deadline? }
abortDrive() · chiefDriving() -> bool · driveState() -> HUD data
parkedNear(x, y, r) -> cars · stopNear(x, y, r = 170) -> stopId|null · destinations(stopId) -> [{ stop, line }]
build(what)   // 'depot' | 'road' | 'yard' | 'busDepot' | 'lot' | 'porter' | 'wagon' | 'stop:S1' ... (P29 sites call onFeed)
has('veh:sled' | 'veh:truck') -> bool          // missions engine: can a drive mission be offered
artKeys() -> late atlas keys this era needs now  // prefetch / Residency hints
state() -> { era, vehicles, moving, lines, riders, freight, cars, driving }
```

Refusal reasons for `drive`: `busy`, `era` (truck before 도시), `route` (unknown or later-version route), `stops`, `start`, `unreachable`.

## 4. Events

**In** (`host.onFeed(ev)`): `{ t:'rank', level, ceremony }` (era change; `ceremony:true` plays the wipe), `{ t:'built', siteId|key }`
(P29 site ids `v5_stable`, `v5_road`, `v5_yard`, `v5_busdepot`, `v5_lot`, `v5_stop_S1/S4/S5`), `{ t:'tap' }` (honk while driving),
`{ t:'region' }` / `{ t:'flag' }` (refresh). Day / hour need no events: the module reads `ports.clock`.

**Out** (`ports.emit`, plan §6.3 + extras): `veh:arrive { id, stop, line, riders, off }`, `veh:ride { line, n, chief?, op: board|alight, stop, arrived }`,
`veh:driveDone { tpl, mid, stars, s, par, best, late, id, x, y }`, `veh:freight { id, items, to, kind, at }`, `veh:era { n }`,
`veh:load { id, items, at:'yard' }`, `veh:built { what }`, `veh:drop { i, name, left, cargo, at }`, `veh:drive { op: start|abort|turn, tpl, mid, par }`.
Internal only (view/host): `veh:honk`, `veh:bell`, `veh:depot`, `veh:car`, `veh:dispatch`.

## 5. Save slice `vehicles` v1 (cap 1536 B)

```js
{ v: 1, era, built: { depot, road, stops: ['S1','S4','S5'], yard, wagons, busDepot, lot, porter },
  lines: { 1: n, 2: n, 3: n, 4: n }, riders: [10 game days], rd, cars: [[pid, key]] ≤ 24, pal: [car keys] ≤ 4,
  chief: { best: { tpl: s } ≤ 12 }, rs }
```
Typical 읍 save 240 B; worst case (24 cars + 12 best times) 982 B; `fitVehicles` drops cars, then best times, above the cap.
`sanitizeVehicles` never throws (200 fuzzed slices in the test). Transients (moving vehicles, riders on board, bookings) are not
saved: buses restart on their phase clocks, cars at their spots.

## 6. Tuning (`BALANCE.v5.vehicles`)

All plan §6.3 keys plus: `sleighBus.accel`, `dogSled.accel`, `chiefTruck.accel`, `cars.{speed, accel, tripEvery, parkMin, parkMax}`,
`traffic.bellAfter` (2 s), `turnSpeed`, `brake`, `drive.{parFactor, perStop, star2, unload, stopReach, turnHold}`, `ceremony.wipeStep`
(0.6 s per street), `riders.{days, villageCap}`, `budget.{simulated 24, materialised 12, passengersDrawn 4, liveMargin 900}`.
`vehiclesTuning(BALANCE)` merges one level deep, so a designer can override single numbers.

---

## 7. Numbers

### Node (`nice -n 15 node --test tools/test/vehicles_lab/*.test.mjs`, 25 / 25 pass, 5.6 s)

| Check | Result |
|---|---|
| Routes | 10,000 random lane routes continuous; every stop reachable from every stop |
| Overlap / conflicts | 0 overlaps, 0 conflicting connectors: 12 vehicles × 10 game min, 24 vehicles × 5 min (gridlock rings untied) |
| Walkers | vehicles stop 1.5 m short, nobody hit (random walkers) |
| Rails | both lines (main k ≤ 46, coast k 47–98) hold vehicles while a train is near |
| Lights | never green on both axes; red stops, green goes |
| Transit | 2 buses ⇒ ≥ 120 riders / day (184 with 3 buses in the smoke run); headways, dwell, ETA, booking, leaving early |
| Freight | conservation exact; shops first; the wagon waits for 서리 큰길 |
| Chief | 8 stick directions → expected connector; steering bot ★★–★★★ (cafe ★★★ 21 s, par 45.8; shop round; dog sled mail); idle never fails; cake cap 0.7×; starts facing the first stop; stick-back turn-round |
| Perf | busy 도시 (19 simulated, 20 cars, 4+4 buses, 3 trucks): **0.054–0.059 ms per 60 fps tick** (budget 0.15); p95 0.086 ms, p99 0.34 ms, max 2.5 ms (GC/JIT, not routing) |
| Save | round trip, phase-clock restore, cap, 200 fuzzed slices; serialize + sanitize 0.033 ms |
| Determinism | same seed ⇒ same events and positions |

### Lab (Chromium, SwiftShader, phone 390 × 844 @ DPR 3 unless noted; `docs/previews/vehicles_lab_numbers.json`)

| Scene | host.update ms/tick (model only) | draw calls / frame | era textures | world objects (module) |
|---|---|---|---|---|
| 읍 station district, busy minute | 0.107 (0.040) | 7.5 | **46.2 MiB** | 506 (106) |
| 도시 junction, busy minute | 0.115 (0.046) | 6.9 day / 9.8 night | **46.9 MiB** | 540 (76–103) |
| desktop 1280 × 800 도시 | 0.065 (0.049) | 6.7 | 46.9 MiB | 380 (57) |

- Era textures = what the module keeps resident in that era (raw RGBA, atlases as shipped; fill ratio ≈ 0.85–1.0, so packing won't save much):
  - 읍 vehicles 32.7 MiB (horse bus 13.3 + overlay 3.4, steam wagon 9.3, cargo sleigh 6.7) + buildings 13.3 (depots 8.9, street 3.8, signs 0.6) + FX 0.2; dog sled +3.4 during a drive.
  - 도시 vehicles 28.7 MiB (retro bus 9.3, truck 4.9, 4 car colourways ≈ 14.5) + buildings 17.1 (+ lots 3.8) + asphalt 1.0 + FX 0.2; chief truck +6.5 during a drive.
  - So the plan's vehicle budget (≤ 8 keys, ≤ 45 MiB) holds for the vehicles themselves (≤ 39 MiB with a drive); the vehicle **buildings** are 13–17 MiB against the plan's estimate of 6–10 MiB (`veh_depots` alone is 8.9 MiB because it holds stable, fuel and bus depot together).
- Max single tick 2.6–8.6 ms: the first materialisation (pooled sprites and doll rigs are created) and an atlas arriving (`buildCharacter`); steady state p95 0.2–0.3 ms.
- 0 placeholders, 0 console errors, 0 404s. Car atlases are loaded on demand (palette `veh_car_d_blue, veh_car_b_red, veh_car_c_orange, veh_car_a_yellow` in the 도시 run).
- Drives in the lab (autopilot = the Node bot): dog sled mail run ★★★ 66 s (par 175); truck shop round ★★★ 66.5 s (par 143). Ride S2 → S1 arrived; walker test: the bus waited 1.8 s, rang its bell once, nobody closer than 5.5 m (centre to person).

---

## 8. Lab captures (`docs/previews/vehicles_lab_*`, all looked at)

| Capture | Shows |
|---|---|
| `eup_station.png`, `eup_bus_stop.gif` | sleigh bus pulling into 서리역 (S2), people waiting at the shelter, boarding, horses' breath |
| `eup_bus_zoom12.png` | zoom 1.2: driver and riders in the windows, overlay frame |
| `eup_wagon.png` | steam wagon with its chimney smoke at the station cargo curb (its own curb east of the stop) |
| `eup_zoom06.png` | zoom 0.6 overview: bus, wagon, porter sleigh, stop labels |
| `ride_chip.png`, `ride_where.png`, `ride_wait.png`, `ride_aboard.png`, `ride_follow.gif`, `ride_arrived.png` | the transit chip, the where-to list (line colour dots), waiting, the chief aboard (heart emote), the camera on the bus, off at 서리 광장 앞 |
| `sled_hud.png`, `sled_drive.gif`, `sled_result.png` | dog sled mail run: HUD (timer, par, stars, next stop), joystick, pin, edge arrow with metres, result card ★★★ 새 기록! |
| `walker_yield.gif`, `walker_after.png` | a person stops in the lane: the bus waits, "딸랑딸랑", they hurry on, the bus goes |
| `city_ceremony.gif`, `city_after_ceremony.png`, `city_new_buses.png` | 서리읍 → 서리시: outward repave street by street, banner; later the retro buses are out |
| `city_day.png`, `city_lights.gif`, `city_zoom06.png`, `city_zoom12.png` | asphalt with centre dashes and crosswalks, retro bus at 솔방울 분수 with riders, queue, traffic lights cycling |
| `city_parking.png` | parking lot with stall lines and parked cars, fuel depot |
| `city_night.png` | night: headlights and tail lamps over the DayClock-style tint |
| `truck_hud.png`, `truck_drive.gif`, `truck_walker.png`, `truck_honk.gif`, `truck_result.png` | the chief's truck shop round, a person in the street, 빵빵, result card |
| `en_where.png`, `en_drive.png` | English: where-to list and HUD ("Letting traffic pass") |
| `desktop_city.png`, `desktop_eup.png` | desktop 1280 × 800 (portrait column, as the game) |

Lab notes: the ground is the real `RoadPaint` baked into 1024 px tiles by a stand-in `Ground` (`lab_ground.js`), the town buildings
and props come from `WORLD.v4`, people are the real townfolk2 paper dolls, puffs use the game's `Effects` presets. The v2 village
paths (sled tracks) are not painted in the lab, so the dog sled runs over plain snow there.

---

## 9. Decisions and deviations

1. **S2 moved** from (3.2, −3.6) to (−0.1, −3.6): at the old spot the shelter sat on v4's rank pad (4, −3.9) and the bus stop overlapped the station cargo drop, so the wagon blocked the bus. The cargo pad got its own curb `PLACES['p:cargo'].curb = (6.2, −4.6)`; checked for both eras (bus 6.1–14.0 m, wagon/truck 0.3–5.8 m on the same 15.6 m lane).
2. **Turn round in the street** (not in the plan): with brake on "stick back", a stop behind you was unreachable without a block detour. Stopped + stick back 0.5 s ⇒ a short U onto the opposite lane (once per pull; a wider U if a bus stands beside; "여기선 못 돌아요" otherwise); the run also starts facing its first stop.
3. **Bell for walkers**: NPC vehicles waiting > 2 s for a person ring once (`veh:bell`), and the host hurries the person (`town.hurry`). Gentle, and fixes "people stand in the street forever".
4. **Off-screen retirement**: on the era swap, vehicles nobody sees vanish at once; visible ones drive into the depot.
5. **Art on demand**: the host asks `ports.assets.fragment('vehicles', { only })` for its era/palette atlases; the view never draws a vehicle whose atlas has not arrived (no placeholder). `api.artKeys()` lists what is wanted now.
6. **Low tier**: `opts.tier === 'low'` or `ports.tier() === 'low'` ⇒ 2 car colourways, no passengers drawn (plan §6.3).
7. Blocked hints distinguish `light` (빨간 불이에요) from `junction` (차가 지나가요 · 잠깐만요).
8. Ceremony wipe step is 0.6 s per street (0.35 s read as instant on a phone).

## 10. Known issues / limits

- Vehicle buildings cost 13–17 MiB (see §7); splitting `veh_depots` per era would save ≈ 5 MiB but is an asset change (not done: assets are read-only for this module).
- Walkers do not look for vehicles: a person can walk into the *side* of a moving vehicle (the vehicle only yields to people ahead). Proposed TownSim hook: `api.laneClear(x, y)` (not written yet) so walkers wait at the curb.
- If a rank-up happens while the chief rides a bus, the ride ends with `arrived:false, at:null`; the host must place the chief at the bus (the ceremony is started from the town hall, so this should not happen in normal play).
- The headless sim keeps vehicles as `live` only near the view (`liveMargin` 900 px); far vehicles skip walker checks by design.
- First-materialisation spikes (2.6–8.6 ms in SwiftShader) come from creating pooled sprites/rigs; pre-warming 4 sprites + 4 rigs when the module starts would flatten them.
- `layout.BUILDINGS.yard.key` names `crate_stack`, which is harbour art (v6); the view draws the yard with the v4 `crate`/`barrel` props on a trodden pad instead.

---

## 11. Integration (exact hooks into the current v4 code)

The v4 workflow is still editing `src/**`, `index.html`, `tools/build/**`, the v4 tests and docs, so anchors are given by function
name and nearby code, not by line number. Everything below is written against the tree as it was on 2026-10-10.

### 11.1 Ports (what the game passes to `VEHICLES_MODULE.create(ports, saved)`)

| Port | Used for | v4 backing |
|---|---|---|
| `world.scene` | the Phaser scene for sprites | `gs` (Game) |
| `ui.scene`, `ui.toast(msg, ms)`, `ui.banner(title, sub)`, `ui.safeTop` | chip, HUD, toasts, banners | `gs.ui` (`UI.toast`, `UI.banner`), `View.safeTop` |
| `rank()`, `lang()`, `tier()` | era, strings, quality | `gs.v4.rank.level`, `Settings` language, quality setting |
| `clock.T()`, `clock.dayOf(T)`, `clock.night()` | timetable, riders/day, lamps | `gs.v4.clock.T`, `clock.day()`, a 0..1 night factor from `DayClock.target(hour()).a` |
| `emit(ev)` | module events out | ModuleHost bus (`gs.events.emit(ev.t, ev)`) |
| `assets.manifest(name)`, `assets.fragment(name, { only })` | vehicle specs (seats, points), late atlases | `Assets.lateManifest[name]`, `Assets.loadFragment(gs, name, { only })` |
| `roads.net()`, `roads.street(id)`, `roads.addStreet(s, eup, cls)`, `roads.upgrade(id, cls)`, `roads.tracks()` | lanes, new streets, class | `gs.roadNet`, `WORLD.v4.streets`, P19b `RoadNet.addStreet`, `RoadNet.upgrade`, village v2 road edges as sled tracks (`layout.sledTracks(WORLD.roads)`) |
| `town.walkers()`, `town.hurry(x, y, r)`, `town.board(stop, n, line, to)`, `town.alight(stop, riders, line)` | yield, bell/honk, riders | TownSim (P6): materialised bodies near the view; `hold`/`walk`/`release` riders to the door point; `Neighbours.sendByBus` (P14/P33) for neighbour visitors |
| `freight.take(n, role)`, `freight.deliver(to, items, kind)`, `freight.shopTargets()`, `freight.shelf(id)` | freight loop | P32: `Growth.shopTargets()` mapped to `{ id, x, y, name, need }` (front point of the shop); `deliver(shopId)` → the shop's restock, `deliver('cargo')` → the station cargo pad order; `take` from the village warehouse stock |
| `homes()` | cars | v4 houses `{ id, pid, level, x, y, park? }` |
| `flag(name)` | later-version routes (`v6`…) | `gs.later.flags` |
| `rail.blocking(k, line)` | level crossings | P14 `Neighbours.rails` |
| `view.rect()`, `view.zoom()`, `view.onScreen(x, y, m)`, `view.toScreen(x, y)`, `view.follow(fn)` | culling, HUD arrow, ride camera | `cameras.main.worldView`, `gs.zoom`, P1b camera follow below |
| `input.stick()` | driving, leaving a ride | `Input.vec` (joystick + WASD/arrows) |
| `chief.x()`, `chief.y()`, `chief.hide(on)`, `chief.place(x, y)` | boarding, seating, alighting | `gs.player`; `hide(on)` also sets `gs.chiefSeated` (P1b) |
| `dolls.make(look)`, `dolls.chief()` | seated people | v4 `DollSprite` pool (rig contract: `setLook`, `play(anim, dir)`, `place(x, y, depth, alpha)`, `visible(on)`, `update(dt)`, `destroy()`); the chief: a seat sprite of `player` |
| `fx.puff(x, y, size, depth)`, `fx.kick(x, y)` | smoke, breath, snow kicks | `gs.effects.burst(size >= 40 ? 'smoke' : 'steam', x, y, 1)`, `gs.effects.burst('snowhit', x, y, 2)` |
| `sound.play(key)`, `sound.at(key, x, y, opts)`, `sound.loop(key, vol)` | bells, horns, engine loops | `Audio.play`, positional play, audio3 loops (P15) |

### 11.2 Patches, file by file

**P1 `src/scenes/Game.js`** (ModuleHost block, plan §5): add `VEHICLES_MODULE` to `LATER_MODULES`. Plus two small hooks (**P1b**):
- in `tick(time, delta)`: `const inp = Input.update(time);` … `p.update(dt, inp);` becomes
  `p.update(dt, this.chiefSeated ? ZERO_INPUT : inp);` (`const ZERO_INPUT = { x: 0, y: 0, mag: 0 }`), and skip
  `handlePlayerPads(dt)` while `this.chiefSeated` (the chief is in a vehicle).
- in the `// camera target` block, before the `this.camFocus` line:
  `if (this.camFollowFn) { const q = this.camFollowFn(); if (q) { fx = q.x; fy = q.y - 50; } }` — `ports.view.follow(fn)` sets `gs.camFollowFn = fn` (null to stop).

**P3 `src/core/Assets.js`**: `LATE_FRAGMENTS += ['vehicles']`; `roads` and `audio3` are already late. The module only asks for files by key (`loadFragment(scene, 'vehicles', { only: [...] })`), so nothing loads before 읍.

**P4 `src/core/Residency.js`**: `addClass('vehicle', { ttl: 20, cap: 8, maxMiB: 45 })`; one ref per materialised vehicle key (the view's `active`/`parked` maps), the era's building atlases (`veh_depots`, `veh_street`, `veh_signs`, `veh_lots`) by area like v4 buildings. On era 3 the era-2 vehicle atlases can be released once the last sleigh bus is home (`veh:depot op:'in'|'gone'`).

**P6 `src/systems/TownSim.js`**: bus riders like train riders: `board(stop, n, line, to)` returns up to n `{ pid, look, to }` from the people queued at the stop (the lab queues 2–3 at `sleigh_stop`/`bus_stop` `waitPoints`), walks them to the bus door (`doorPoints[base][1]`, x negated when mirrored), then holds them as riders; `alight(stop, riders)` walks them from the door to their destination; `walkers()` = positions of materialised walkers within the view margin; `hurry(x, y, r)` = walkers within r speed up ×1.8 for 2.5 s and drop any pause.

**P12 `src/scenes/UI.js`**: chip slots `transit` (W/2, H − 318) and `driveHUD` (top, W/2, 196 + safeTop; 빵빵 button bottom-right at (W − 112, H − 300)); the module creates them on `ui.scene` itself, so P12 only needs to keep those areas free of v4 chips while `api.chiefDriving()` / a stop is near.

**P14 `src/systems/Neighbours.js`**: `this.rails = [this.rail]`; `ports.rail.blocking = (k, line) => this.rails.some((r) => r.blocking(k, line))`; `sendByBus(n, stopXY)` for neighbour visitors arriving by bus (Visitor P33 spawn point). Note: v2 road nodes `east_gate`, `e_mid`, `e_east` lie on the new conn_w carriageway (i −17…−5, j −5…−1): the village walk line there should move to the north sidewalk j ≈ −0.6, or walkers will cross the carriageway lengthwise.

**P17 `src/systems/Rank.js`**: rank 3 from data; in the 도시 ceremony (`ceremony()` → the step that today calls `rn.upgrade(...)` and `nb.paint.setRank(2, !instant)`), call `gs.later.vehicles` host `onFeed({ t: 'rank', level: 3, ceremony: !instant })` instead of upgrading the streets itself: the host repaves `CITY_UPGRADE.streets` outward from (32, −6) every `ceremony.wipeStep` s through `ports.roads.upgrade` and plays the banner, lamp pops, depot doors and horn. Without a ceremony (loading a 도시 save) the host upgrades everything at once. `riders` bar reader = `api.ridersToday()`.

**P18 `src/systems/RoadPaint.js`**: in `paintStreets(ctx, x0, y0, w, h)`, after the cell textures: draw `markings(this.rn, { bays: PARKING.bays })` from `src/vehicles/model/markings.js` with the roads-kit `piece()` rule (round(anchor) − anchorPx, flipX/flipY per entry), skipping entries outside the tile ± 200 px. Asphalt itself already works (`texOf` returns `road_asphalt` for class 2).

**P19 `src/data/world.js` + `src/systems/RoadNet.js`**:
- `WORLD.v5 = layout` (the module's `layout.js`; Korean comments kept).
- v5 streets are **added when built**, not present from the start (they are dirt roads nobody paid for otherwise): **P19b** `RoadNet.addStreet(s, eup, cls)` = push `s` onto `this.v4.streets`, `this.v4.eup[s.id] = eup`, `this.level[s.id] = CLS[cls]`, rebuild walk lines (`this.lines` from streets with `walk`, then `this.build(doors)`), `buildCells()`, `buildLanes()`, `version++`, notify listeners; Neighbours re-merges `walkGraph()` into `gs.roads` and TownSim rebuilds its `Roads` graph on that notification.
- **P19c (bug in v4, needed by v5)**: `RoadPaint` registers its street bake hook with the `streetRect` object of construction time; `onChange` assigns a *new* object (`this.streetRect = this.computeRect()`), so `Ground.runHooks` keeps culling with the old box and **a street outside it is never painted** (seen in the lab: conn_w west of the old box stayed snow). Fix in `RoadPaint` `onChange`: `const r = this.computeRect(); Object.assign(this.streetRect, r);` (keeps the hook's reference) before `gs.ground.invalidate(this.streetRect)`.
- v4's `main.walk` line (−4.5) lies inside the 읍 carriageway once main is widened; walkers on main should use −3.5 (sidewalk). Independent of v5, but it makes walkers block buses on main.
- Decor to remove/move for v5 statics: nothing overlaps in the lab check except S3, which deliberately *is* v4's `t_sled` stop (the module draws only a bus sign beside it at 도시). Re-run a layout check against the final v4 square pads before shipping (S2 now at (−0.1, −3.6), 3.0 cells from the `board` pad, 4.1 from the `rank` pad).

**P20 `src/data/balance.js`, `strings.js`**: copy `VEHICLES_TUNING` verbatim as `BALANCE.v5.vehicles` (Korean comments kept) and `VSTR` (49 keys, ko + en); `balanceCheck` ranges: speeds 1–8 m/s, seats 1–12, headway 20–200 s, colours 1–4, wipeStep 0.2–2.

**P29 `src/scenes/Game.js` sites**: `addModuleSite(id, cfg, kind)` for `v5_stable` (`depot`), `v5_road` (`road`), `v5_yard` (`freightYard`), `v5_stop_S1/S4/S5` (`stop`), `v5_busdepot` (도시), `v5_lot` (`parking_lot_s`); on completion `host.onFeed({ t: 'built', siteId })`. Buying buses / a wagon is a pad that calls `api.build('bus:1')` / `api.build('wagon')`.

**P32 `src/systems/Growth.js`**: `shopTargets()` exists and returns shop objects; the freight port maps them to `{ id, x, y, name, need }` (x, y = the shop's customer/front point; `need` = missing stock by item) and routes `deliver(shopId, items)` into the shop's restock. Items must come out of a real stock (`take`) so conservation holds in the game too.

**P33 `src/entities/Visitor.js`**: optional spawn point = the bus door at the stop (the module's `veh:arrive { stop, riders }` tells Neighbours how many came).

**Missions engine (missions_bank module)**: drive missions B1–B12 call `gs.later.vehicles.drive({ tpl, mid, vehicle, route | stops, cargo, capSpeed })` and complete on `veh:driveDone { mid, stars }`; offer them only when `api.has('veh:sled')` (읍, stable built) or `api.has('veh:truck')` (도시). `abortDrive()` when a mission is cancelled.

### 11.3 What to verify after wiring

1. `nice -n 15 node --test tools/test/vehicles_lab/*.test.mjs` (the purity test's "nothing imports the module" check will start failing by design once Game.js imports it: delete that one assertion then).
2. Lab groups (each < 2 min): `nice -n 15 node tools/test/vehicles_lab/run_lab.mjs --only=eup,ride`, `--only=sled,walker`, `--only=city`, `--only=ceremony,truck`, `--only=english,desktop`.
3. In game: texbudget at the station district (읍) and the 중앙로 junction (도시) with the module on; first-bus toast; a ride S2 → S1; a B1 dog sled mission; the 도시 ceremony from the town hall.
