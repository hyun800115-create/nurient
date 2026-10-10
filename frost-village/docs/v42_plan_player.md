# v4.2 design proposal: player and designer view

Status: **proposal** from the player/designer side, written for the lead's binding v4.2 plan. It changes no game code.
Inputs: the designer's v4.1 feedback (5 requests), `docs/v4_plan.md`, `docs/build_reports/v4_*.md` (+ `v4_verify.md`), `docs/기획서_v4_*.md`, `docs/v5_v8_plan*.md`, the manifests of `town`, `civic`, `logistics`, `cityfolk`, `vehicles`, `fx_city`, and `src/**` (v4.1, save version 6).
Map picture: `docs/previews/v42_plan_player_map.png`. It shows the new rail loops, the office, the bank, the 물류창고 and the cargo-sleigh lane.

All measurements below come from read-only runs on HEAD `65c39f3`, using the fixed-step clock and `nice -n 15`. The runs, saves and data are in the session scratchpad, `v42p/`:
- **Smart bot from a fresh save:** 읍 at 47.8 min, 0 stuck. It wrote snapshots at 25, 35, 42 and 46 min.
- **Stock probe, chief idle:** loads the 42-min save and runs 20 game minutes with nobody touching the chief.
- **Stock probe, chief played by the smart bot:** loads the 46-min save and runs 16 min.
- **Drain probe:** loads the 46-min save. It measures what the gatherers could produce if their piles never filled, and what the shelves would sell if they never ran empty.
- **Occupancy search:** checks every candidate building spot against the real collision grid of the 46-min save, plus the roads, plots, shoreline and v5 street corridors.

---

## 0. Decisions at a glance

| # | Request | Decision | Why |
|---|---|---|---|
| 1a | 촌장이 마을 사람과 비슷해요 → buff or glow | **촌장 후광**: an aurora-coloured ring under the chief's feet. It keeps the same size on screen at every zoom (≈ 45 CSS px wide on a 390-px phone). It turns gold and pulses while he works a station, which shows the work boost he already has (×1.25). A small star pip floats above him only when zoomed out (< 0.8) or in a crowd. | A ring at the feet reads at zoom 0.6, never covers anyone and never fights the head-carried stack. Unlike a rim glow it also works on the Canvas fallback. A crown or light beam looks tacky. A new costume is a big re-render and is still white-on-white. |
| 1b | Walking near things always picks them up → on/off in settings | Setting **자동 줍기: 켬 / 멈추면 / 끔**. "멈추면" takes items only after he has stood still on the spot for 0.35 s. "끔" shows a 손 (hand) button instead. The default stays 켬, and the first loop always uses 켬. | Fixes the accidental pickups without breaking the tutorial or the bots. |
| 1c | When I pick something up, show where to go | **길 안내** whenever the bag is not empty: a chevron at his feet, footprint dots along the real walking route, a beacon on the destination pad, an edge badge when it is off-screen, and a chip at the bottom: `구운 생선 8 → 광장 판매대 · 12m`. The destination is chosen by the **same priority list the porters use**. | The chief and his porters always agree. Distances are walking distances, so the arrow never points through a fence. |
| 2 | Village stock overflows / turnover | **Measured:** the goods do not move from where they are made to where they are sold. Five fixes: an empty shelf goes first; workshop inputs count as urgent only when they run low; warehouse porters deliver straight to the shelf; a 2nd goods porter per line appears when a line backs up; a 2nd processing level matches the gatherers. Then a real **서리 물류창고** (the finished 솔방울 물류센터 cutaway art) takes the true surplus and exports it by train. | §2 has the numbers: shelves empty 37–100 % of the time while their station's output sits full; the warehouse holds 1–6 of 300 items. |
| 3 | No coaches or wagons; the train backs out | **New consist:** engine + 객차 "솔방울호" + 화물칸 + 승무원칸, and a 2nd 객차 at 읍. **Balloon loops at both ends**, so the engine always leads: it stops, pulls forward round the loop by the sea, and leaves engine-first. | The loops fit between the track and the sea (checked). There is no shunting and no split train, and every heading the curves need already exists in the train art. |
| 4 | Chief's office with 2 clerks, an aide and a collector | **촌장 사무실** (new cutaway building) at the plaza's west gate (100, 780), with 4 named staff and a non-pausing office panel: 재고 · 소식 · 편지 · 직원 · 통장. **서리 은행** (finished civic bank) next to it at (−300, 580). The collector carries the coins from every cash pad to the bank. | The designer sees the whole cycle in one place, on the road he uses most. The bank is the v5 bank: same art, same save slice, and v5 takes its position through `BankHost({ at })`. |
| 5 | Chief lives on his own when I don't play → observer mode | **관망 모드**: a button, or automatic after 1 min idle (once the village is complete). The chief chooses among chores, chatting, office time, rest, lunch and watching the train, all driven by the day clock. The camera follows him and cuts to nearby events. **Any touch on the village** (not on a button) gives control back. By default he never spends coins. | It reuses the arrow-only bot's proven chore logic (that bot reaches 읍), so observer mode is useful and not just decoration. |

Order of work, if the lead must cut, from most to least important:
1. Train loops and consist (most visible).
2. Halo, pickup setting and navigation (cheap, every-minute value).
3. Overflow fixes F1–F5 (code only).
4. Office, its staff and the bank with the collector.
5. Observer mode.
6. 서리 물류창고 with the sleigh (largest).

---

## 1. Guardrails (v4.2)

1. **The first 20 minutes stay as they are.** Visual-only additions are allowed from minute 0: the halo is a generated texture, and navigation starts after the first loop. Before tower_east starts, the request log must be byte-identical to v4.1's. Bot "village complete" must stay within ±5 %.
2. **Do not edit** `src/{story,missions,bank,vehicles,harbor,beach,city}`. Wherever v4.2 owns something those modules will take over later, it writes **their own save-slice format** (§10) and keeps positions as data that the modules accept (`BankHost({ at })`, `LogisticsHost({ place })`).
3. **Keep every v4.1 rule:** the step-off rule on pads, `waitingPay`, the crash card and backup slots, `balanceCheck` clamping and the publish order.
4. **Designer-editable data:** numbers go in `balance.js` (Korean comments), positions in `world.js`, text in `strings.js` (ko + en).
5. **Budgets:** texture memory must stay ≤ 455 MiB; v4.2 adds about 25–35 MiB transient, only near the new buildings or the train. Logic per step ≤ +0.15 ms in total. Artifact: 492 of 511 files are used, so v4.2 needs packing into existing pages or a third publish (§12).

---

## 2. Request 2 first: why stock piles up (measured)

The designer guessed right: **turnover**. The village makes enough. Goods get stuck because one porter per line serves too many places.

### 2.1 What a 46-minute village looks like (smart bot's own village)

**Chief idle for 19.5 min (42-min save), 40 samples. Share of samples that were full or empty:**

| Line | Collection pile full | Station input full | Station output full | Its shelf **empty** |
|---|---|---|---|---|
| 생선 → 구운 생선 | 82 % | 0 % | 22 % | 0 % |
| 통나무 → 판자 | 90 % | 57 % | 67 % | **97 %** (교역소 판자) |
| 밀 → 빵 | 92 % | 60 % | 35 % | 0 % |
| 광석 → 주괴 | **100 %** | 100 % | 67 % | **100 %** (교역소 주괴) |
| 생고기 → 훈제 고기 | 80 % | 52 % | 42 % | **57 %** |
| 대장간 도구 | — | — | output 12/12 | **95–100 %** (잡화점 도구) |
| 통조림 | — | — | — | **67 %** |

- **창고** (warehouse) held an average of **6** items out of 300, and never more than 23.
- **Uncollected coins** piled up at **1,510 coins/min**:

| Cash pad | coins/min |
|---|---|
| market | 650 |
| store | 410 |
| station till | 267 |
| restaurant | 87 |
| trade | 72 |
| hall tax | 38 |

**Smart bot playing, 15.5 min (46-min save, through 읍):** the picture is the same. Piles were full 78–100 % of the time. Empty shelves: 빵 37 %, 훈제 고기 37 %, 판자 96 %, 주괴 90 %, 통조림 84 %. The warehouse averaged **1** item. Income was 1,889 coins/min.

**Where the smart bot's time goes**, over a fresh 47.8-min run to 읍:

| Task | Time | Share |
|---|---|---|
| Walking to cash pads | 953 s | **33 %** |
| Emptying station outputs | 506 s | 18 % |
| Selling | 331 s | 12 % |

**What the village could produce and sell** (drain probe, 46-min save, 6 game min, per game minute). The gatherer number is measured with the piles emptied every 5 s; the processing capacity comes from `BALANCE.stations` and is the hard limit per station.

| Line | Gatherers could bring | Station can process | Shelves could sell (always full) |
|---|---|---|---|
| 생선 | **87** | 75 (grill 0.8 s) | 구운 생선 32 |
| 통나무 | 27.5 | 60 | 판자: 교역소 merchant ≈ unlimited (he bought 162 주괴/min when both were stocked) |
| 밀 | 35.8 | 55 | 빵 23 |
| 광석 | **81.7** | **50** (smelter 1.2 s) | 주괴 162 (merchant) |
| 생고기 | **65** | **50** (smokehouse 1.2 s) | 훈제 고기 42 |

### 2.2 Diagnosis, in the designer's words

1. **Raw materials really are left over.** Fishermen, miners and hunters bring more than their station can process (87 > 75, 82 > 50, 65 > 50). The fish barrel, ore pile and meat rack therefore stay full and the gatherers stand idle.
2. **Finished goods get stuck at the station door.** Each line has one goods porter, and it serves five kinds of places: the shelf, the far workshops (toolsmith, cannery), sites, the restaurant pantry (which pays more, so it outranks the shelf) and the miners' food box. The plank and ingot porters spend their trips walking to the toolsmith at `e_m1` (2040, 1190), which is about 1,600 px from the sawmill. That is why the 교역소 is empty 90–100 % of the time while the sawmill and smelter outputs sit full.
3. **The 창고 does not store; it is a detour.** Its 2 porters carry a full output into the warehouse, then carry the same items straight back out to an empty shelf. In the bot's village the warehouse is in the west strip (`w_m1` (−250, 1360)), so every item walks twice as far.
4. **Coins lie around.** A third of the chief's time is spent walking to coin piles.

### 2.3 The fix, in layers (all numbers in `balance.js`)

| # | Fix | Player sees | Numbers |
|---|---|---|---|
| F1 | **An empty shelf goes first.** A shelf with 0 of an item outranks the pantry and the "shelf low" level, but not the miners' food box. | 빵 and 훈제 고기 no longer vanish from the counter while the oven is full. | new `PRIO.SHELF_EMPTY` 48 (food box 50, pantry low 46, shelf low 45, shelf 40) |
| F2 | **Workshop inputs are urgent only when nearly empty.** | Planks and ingots reach the 교역소 again. | `INPUT` 70 only while that input is < 25 % full, otherwise 42 |
| F3 | **Warehouse porters deliver straight to the shelf.** A full output whose item any shelf, pantry or food box wants (prio ≥ 40) goes there directly. The 창고 keeps only what nobody wants. | The 창고 label shows a stock that rises and falls; the warehouse becomes a real buffer. | `warehouse.direct: true` |
| F4 | **짐꾼 2**: a second goods porter for a line, offered when that line's output has been ≥ 80 % full for 90 s in total (and the 창고 exists). | A pad appears next to the line's first porter pad. Banner `판자가 쌓여요 → 판자 짐꾼 2를 부를 수 있어요`. | grill 500 · sawmill 600 · bakery 700 · smelter 800 · smokehouse 900 |
| F5 | **가공소 2단**: the station works faster. | A pad on each station once its line has 3 gatherers. The station animates faster, with a ×1.5 badge. | time ×0.66 (grill 75 → 113/min, smelter and smokehouse 50 → 75/min); costs 900 · 1,000 · 1,100 · 1,400 · 1,600 |
| F6 | **Coins come in by themselves:** the 수금원 (§5.5). | Pads are emptied about once a minute. | — |
| F7 | **True surplus goes to the 서리 물류창고 and leaves by train** (§2.4). | Crates in the racks, a pony sleigh and a loaded boxcar. | export pays 0.5 × price |

**Targets** for the build team's bots, on the same 46-min save with the smart policy for 15 min:

| Measure | v4.1 | v4.2 target |
|---|---|---|
| Shelf empty: 빵, 훈제 고기, 구운 생선 | 37 % / 37 % / 9 % | ≤ 10 % each |
| Shelf empty: 판자, 주괴 (the merchant takes everything) | 96 % / 90 % | ≤ 40 % |
| Samples with a station output ≥ 90 % full | 12–65 % | ≤ 15 % |
| Samples with a raw pile full (after F5) | 78–100 % | ≤ 40 % |
| 창고 average stock | 1 | ≥ 40 |
| Income | 1,889 /min | +15–30 %. If higher, lower `export.rate` first, then the F5 speed. |

### 2.4 서리 물류창고: the "giant logistics warehouse"

The designer already has this building in mind (기획서 v8: "물류창고를 크게 하나… 안이 보이게"). The art is finished: 솔방울 물류센터, 11 × 8 m, with a cutaway, racks whose fill shows the real stock, a forklift loop and two docks. v4.2 builds it **now** as the village's surplus hub. v8 later takes it over unchanged.

**Where.** It sits at `L(28.4, −27.4)` = **(3180, 3100)**: the footprint covers i 24.5–32.3 and j −30.2…−24.6, in the bottom-left corner of the rail region where it meets the se region.
- **Front:** the −Y face looks south-west; the docks are on the +X face.
- **Search result:** it is the only spot for 11 × 8 m inside the current map that touches no collider, road, plot, shoreline or v5 corridor. It stays 0.4 cell clear of v5's 은행길 (j −24.2…−22.2).
- **Clearance:** the bottom corner is at y 3315, under the 3380 border-tree band.
- **Opening:** the se region opens with tower_se, at about 41 min.

**How it is reached.** A new **화물길** (cargo lane) follows streets v5 will pave later; v4.2 paints them as trodden-snow footpaths plus a sleigh lane:
1. From the station square along 역앞 거리 (j −5).
2. Down the 중앙로 (i 31).
3. Through v5's `ave_s` corridor.
4. Along the 은행길 corridor (j −23.2).
5. Down a dock lane (i 33.5) to the dock apron (j −27.5).

That is about 56 cells (79 m) one way.

**Unlock and cost.**
- **When:** after 읍, once the v3 창고 exists.
- **Site:** "서리 물류창고 터", with a fenced sign.
- **Cost:** 6,000 coins + 40 판자 + 20 주괴, 20 s. The scaffold uses two `site_*_L` stages, as the station's XL plot does.

**What happens.**

| Step | Who | What the designer sees |
|---|---|---|
| Surplus collected | 역 짐꾼 (existing) + 물류 직원 ×2 (new hire pads, 800 / 1,100) | They take only items no shelf or order wants: outputs ≥ 70 %, piles ≥ 90 % after F5, the 창고 above 50 %. They carry it to the station's 짐 싣는 곳. |
| Pad → 물류창고 | **화물 썰매** (cargo-sleigh pad 1,500). Uses the finished `cargo_sleigh` art: dapple pony, bells, crates on the bed; SE/NE frames + mirrors, lattice streets only. | The pony trots the 화물길 with up to **60 items** (12 crates). ≈ 32 s each way, ≈ 48 items/min. |
| Racks | forklift driver (comes with the building), 2 workers inside | Tap the building, or come within 300 px: the roof and front wall fade. Rack height = real stock (food 300, materials 200, tools and cans 100, capacity 600). The forklift beeps round `forkliftPath`. |
| District shops | 물류창고 → the 5 founded shops | The station-district shops restock from here first. The walk is short, so 카페 빵 runs out less. |
| Export | each train: the sleigh brings crates back to the 짐 싣는 곳, and the **화물칸** loads up to 40 items | The boxcar door slides open and crates hop in. Pays 0.5 × price into the **물류 금고** pad at the docks, (3606, 3171). The collector takes it; from 읍 on it flies to the HUD every 15 s, like rent. |
| Racks full | — | Label `가득 · 수출을 늘려요` → upgrade **화물칸 크게** (2,000): 40 → 70 items per train. |

The 물류창고 panel (stand on its front-door pad) shows: stock per category, today's exports (`오늘 수출 312개 · +1,040코인`), the racks' fill as bars, and a link to the office's 재고 tab.

**Hand-off to v8.**
- v4.2 writes the `logistics` slice in v8's own format: `{ v:1, open:1, stock:{ fish_cooked:n, bread:n, … }, orders:[], cash, chains:[], lv3:[], days:[…], made:[0,0], tot:[…] }`. `sanitizeLogistics` accepts it.
- The building's spot is passed as `LogisticsHost({ place: 'v42' })`. That is one new `PLACES` entry in v8's `layout.js` (data only), added by the v8 integrator.
- The racks then open in v8 exactly as the player left them, and v8 adds vans, settlement and furniture chains on top.
- **Alternative**, if the lead prefers v8's own spot: grow the world south (3450 → ~4050) and build at v8's `PLACES.A`, (3984, 3731). That spot is farther from our village, and growing the map is a C1-sized change.

---

## 3. Request 3: the train

### 3.1 What the designer sees today

- **Cars too small to read:** the consist is engine (2.6 m) + `train_car_a` (a 2.25 m coach with three tiny windows) + `train_car_b` (a 2.25 m open wagon). At zoom 0.6 the whole train is about 110 CSS px long and the cars read as part of the engine.
- **It backs out:** the line is push-pull with the engine always on the NW end. Toward the town the engine pushes, and its wheels play the reversed loop (`move_rev`). That is the "뒤로 나가던데".

### 3.2 New consist (art job "train2", Blender town pipeline)

| Unit | Length | Look (must read at zoom 0.6) | Anims, dirs | Game points |
|---|---|---|---|---|
| 기관차 (existing) | 2.6 m | red and black, gold bands, smoke | idle 4, move 8; **all 5 rendered dirs**, no longer only NW | smokePoint, lampPoint |
| **객차 "솔방울호"** (new, ×1 then ×2) | 3.0 m | sky-blue body, cream window band; **4 big lit windows per side with seated silhouettes in 3 fills** (empty / half / full, chosen by riders); red-brown roof with snow; end platforms; name plate | idle 1, move 8, 5 dirs | boardPoint ×2 per side, windowPoints (night glow) |
| **화물칸** (new) | 2.6 m | barn red, white X-brace, crate pictogram, roof walkway; **sliding door both sides** with crates visible inside | idle 1, move 8, `door_open` 4 frames, 5 dirs | cargoPoint (inside the door), doorPoints |
| **승무원칸** (new) | 2.0 m | bright red, yellow cupola, red tail lamps (glow at night), rear balcony with the conductor | idle 1, move 8, `flag` 6 frames (green flag on departure), 5 dirs | lampPoint (tail) |

- **Spacing:** anchors are half-length + half-length + 0.15 m apart, so a dark coupler gap shows between cars.
- **Retired from the consist:** `train_car_a` and `train_car_b` stay in the atlas for v6 harbour freight.

**Consist stages.** The crossing rule (§3.4) caps the train at **5 units**.

| Stage | When | Consist | Length | Seats |
|---|---|---|---|---|
| S1 | first train | engine + 객차 + 화물칸 + 승무원칸 | 10.65 m (7.5 cells) | 12 |
| S2 | 읍 (replaces v4.1's "second coach" reward) | + 2nd 객차 | 13.8 m (9.8 cells) | 24 |

**Readability extras.**
- **Car labels:** for the first 3 arrivals after updating, a small label pops over each car for 4 s: `객차 · 손님 14명`, `화물칸 · 상자 6개`, `승무원칸`.
- **Tap the train:** opens a **열차 카드** with the consist icons, riders aboard, crates aboard and the next stop with its time.

### 3.3 Track topology: balloon loops (sketch on the lattice)

Coordinates are lattice (u = i, along the track toward the town; v = j, toward the sea). Screen: +u is down-right, +v is up-right. Every curve has radius **R = 1.75 cells (2.47 m)**. T1 and T2 are **spring turnouts**: trains always enter the loop on the straight route and leave over the curved route, trailing through the switch, so no switching logic is needed. The lever lamp flips green/yellow with a soft "철컥" (visual only).

**Our end (서리역).** It replaces the buffer stop at k = −1. The loop is on the sea side, up-left of the station on screen.

```
 v
3.5        B ━━━━━ C                              (sea starts at v ≈ 5.9; loop top 154 px from the waterline)
         ╱           ╲
1.75    (   infield   )  D                ┌──────────── 서리역 house (u −0.05…5.05, v 0.47…3.59) ────────┐
         ╲    (water     ╲                │                 platform along v ≈ 0.5                         │
0         A ━━ tower) ━━━━ T1 ━━━━━━━━━━━━┷━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━→ to the town
     u: −7.5  −5.75   −4.5  −2.75 −1    0          2.5          5         6.87  8 ═ 9 (crossing k 8)
                                  ▲ nose of the stopped train at u −2.9 (engine just past T1)
```

| Point | Lattice | px | Note |
|---|---|---|---|
| T1 spring turnout | (−1, 0) | (3056, 1283) | where the buffer stop was |
| A | (−5.75, 0) | (2752, 1131) | end of the straight route; the semicircle (centre (−5.75, 1.75)) starts here |
| leftmost point | (−7.5, 1.75) | (2752, 1019) | 0.5 cell clear of the cannery plot `e_m2` |
| B | (−5.75, 3.5) | (2976, 1019) | top straight B → C, 1.25 cells |
| C | (−4.5, 3.5) | (3056, 1059) | corner arc, centre (−4.5, 1.75) |
| D | (−2.75, 1.75) | (3056, 1171) | curved route of T1, centre (−1, 1.75) |

- **Loop length:** 17.0 cells = **24.0 m**, longer than the S2 train (13.8 m), so the train never meets its own tail.
- **Ground to clear:** remove two east-coast pines, (2950, 1150) and (2930, 1010). The infield is about 3.5 × 2.3 cells. It can hold an optional **급수탑** (water tower: the engine "drinks" with a steam puff on each lap) or stay snow and pines.
- **Clear of v5:** conn_w (j −5…−1) and conn_jog lie on the land side; the ballast edge at j −0.61 keeps 0.39 cell from conn_w.
- **Fence:** a low snow fence along j −0.75 from u −6 to −1 keeps the 역 가는 길 walkers off the loop.

**Town end (솔방울역).** The same shape mirrored, on the sea side past the town crossing.

| Point | Lattice | px |
|---|---|---|
| T2 | (37, 0) | (5488, 2499) |
| A′ | (41.75, 0) | (5792, 2651) |
| rightmost | (43.5, 1.75) | (6016, 2651), 128 px inside the 6144 world edge |
| B′, C′, D′ | (41.75, 3.5), (40.5, 3.5), (38.75, 1.75) | — |

- **Clear of:** the 역전 파출소 (31.6, 2.6), the platform path (u 30.5–34) and the row-A shops (land side).
- **Removed:** the track beyond A′ (k 42–46, plus its buffer stop). The "갈매기 항구 방면 (공사 중)" signpost moves to (44.5, −1.2).

### 3.4 How a train now runs (the designer's view)

**At 서리역, arriving from the town:**
1. Whistle 2.5 s ahead. The engine leads in heading NW, as in v4.1, and brakes in.
2. It stops with its **nose at u −2.9**: the engine stands just past T1, the coaches line the platform and the boxcar faces the 짐 싣는 곳.
3. Doors open. Neighbours step down and others climb aboard; crates hop into the boxcar.
4. After a 12 s dwell, the conductor waves the green flag and the whistle blows.
5. The train **pulls forward** into the loop, curves along the sea behind the station (headings NW → N → NE → E → S, with a soft wheel squeal and smoke trailing back), and comes down the curved route past T1 heading SE.
6. It runs the length of the platform **engine-first** without stopping, passengers waving from the windows, crosses k 8 and heads for the town.

**At 솔방울역:** it arrives heading SE engine-first and stops with its **nose at u 31.6**, coaches on the town platform. After a 9 s dwell it pulls forward to T2, runs round the town loop and passes the town station heading NW on its way home.

**Crossings.**
- At ours, the S2 tail stands at u 6.87, which is 1.63 cells (2.3 m) before the k 8 crossing's centre. It never blocks the square, and the v4.1 `BLOCK_NEAR` 1.6 m rule holds.
- At the town, the nose stands 1.9 cells before k 33.
- This crossing rule is why the train stops at 5 units.

**Timetable.**

| Leg | Distance |
|---|---|
| Ours → town | 15.1 cells of loop + 32.6 cells of main line = **67.5 m** |
| Town → ours | 62.3 cells = **88.1 m** |

| Setting | v4.1 | v4.2 |
|---|---|---|
| top speed | 2.6 m/s | **3.0 m/s** (wheel anim 13.8 fps) |
| speed on curves | — | ≤ 1.8 m/s |
| dwell at ours / town | 14 s / 10 s | **12 s / 9 s** |
| full cycle | 59 s | **≈ 90–95 s** |

Each arrival is bigger rather than more frequent. Riders per train scale by `cycle / 59` (≈ 1.55): base 4 → 6.2, per shop 1 → 1.55, per rank 3 → 4.7, capped by seats (12 / 24). Visitors per minute therefore stay at v4.1's level, and `maxInVillage` stays 24.

**First-train moment.** The arrival is unchanged. The camera holds 2.5 s longer, so the first departure round the loop is in shot.

**Memory.**
- The train now needs all 8 headings: 5 rendered dirs per car. The target is **≤ +12 MiB**, loaded only while the train is within view + 900 px (as now) and evicted 30 s after it leaves.
- On the low tier, cars show only the four axis headings and snap at the middle of each curve.

**v6 notes for the harbour team** (cannot be edited from v4.2):
- `harbor_runtime` assumes push-pull with the engine on the NW end. It must switch to engine-leads (data in its coastLine model).
- The far terminal (해변역, k 98) needs its own seaside loop.
- The planned "town-east halt" (car_a at i 37.5) overlaps T2. Move it to i ≥ 44, past A′, where v6 adds a turnout for the line east.

---

## 4. Request 1: the chief

### 4.1 What the designer sees today

- **Same size and colours as everyone:** at zoom 0.6 the chief is about **42 CSS px** tall (sprite ≈ 130 world px × 0.6 × 390/720), the same height and silhouette as 30-plus residents and townsfolk.
- **No colour contrast:** his white fur parka and brown hair sit on white snow and grey cobbles (see `screens_v4/18_zoom06_lite.jpg`, where he is the white figure mid-street).
- **Nothing marks him:** no light, outline or follower.

### 4.2 Options compared

| Option | Readable at 0.6 | Clutter | Conflicts | Tacky risk | Cost | Verdict |
|---|---|---|---|---|---|---|
| A. **Ring at the feet**, same size on screen at every zoom | yes, ≈ 45 CSS px | low (under the feet) | could be mistaken for a pad → it is hollow, round and animated; pads are filled diamonds with icons | low if thin and soft | generated texture + 6 sparkles | **chosen** |
| B. Rim glow or outline (preFX) | weak: a 2–3 px glow on a 42-px figure washes into the snow | none | no Canvas fallback; the carried stack (separate sprites) would not glow | medium (looks like a selection bug) | a shader pass every frame | no |
| C. Crown or badge above the head | yes | high: the carried stack (up to 26 items) sits on his head, so a badge floats 200+ px up | covers speech bubbles | high ("VIP") | small | only as a small **star pip** that appears when needed |
| D. Costume accent (red scarf or sash) | moderate: about 6 CSS px of red at 0.6 | none | re-render all 10 chief anims × 5 dirs | none | large art job | later, as a v5 title reward (`촌장 목도리`) |
| E. Light beam from the sky | yes | high | covers buildings | high | — | no |
| F. Sparkle footsteps | only while walking | medium | fights the snow-dust puffs | medium | small | no |
| G. A follower (the 수행비서 walking behind him) | yes, once hired | low | — | none | comes with request 4 | bonus (§5.4) |

### 4.3 Chosen: 촌장 후광 (aurora halo)

**Shape and size.**
- A 2:1 ellipse ring under his feet, 70 world px wide at zoom ≥ 1.2 (≈ 45 CSS px).
- Below zoom 1.2 it scales by `1.2 / zoom` (at most ×2), so it stays about 45 CSS px wide. At zoom 0.6 it is 140 world px, a little larger than a pad, but hollow.

**Look.** A texture `fv_halo` generated at load time, the same way `fv_shadow` and `fv_glow` are, so no art job:
- a 3 px ring shading mint `#43E0C6` → sky `#7FB2FF` → lilac `#B79CFF`, the title's aurora colours;
- a soft 6 px outer glow at 25 %;
- a 1 px warm gold inner line `#FFD36A` at 60 %.

**Motion.** Six tiny 4-point stars ride the ring, one turn every 6 s. The ring breathes (alpha 0.75 ↔ 0.95) every 2.4 s.

**Depth.** `DEPTH.PAD + 2`: above pads and ground decals, below shadows and every character. It never covers anyone, and on a pad it sits on top, showing he is standing there.

**Night.** A second copy with ADD blend at 0.5 makes a small pool of lantern light. It reads even better at night.

**States.**

| State | Ring | Meaning |
|---|---|---|
| normal | aurora, calm | — |
| **working a station** (on its work spot) | warm gold `#FFC84A`, pulses on every work stroke, one "×1.25" sparkle | the chief's existing work boost (`labour.chiefSpeed` 1.25), made visible: the "촌장 버프" the designer asked about |
| carrying, with navigation on | a small notch on the ring points along the route | joins the navigation chevron (§4.5) |
| observer mode | 60 % alpha, slower spin | "he is on his own" |

**Star pip.** A 22 CSS px gold star in a teal circle, floating 14 px above his head or above the top of the carried stack, bobbing 3 px.
- It shows only when zoom < 0.8, or when 4 or more people stand within 160 px. It fades in and out over 0.2 s.
- In the 13:00 station-square crowd at zoom 0.6, the designer finds him in under a second.

**Optional real boost (designer's choice).** **촌장 응원**: when the chief stands still for 2 s or more within 200 px of working gatherers or operators, they work ×1.1, and ♪ notes rise from the gold ring.
- It switches on only after the village is complete, to protect the first 20 minutes.
- `chief.cheerMult` 1.1; set it to 1.0 to turn it off.

**Setting:** `촌장 후광: 켬 / 끔` (default 켬). It hides both the ring and the pip.

**Cost:** 1 image + 6 sprites + 1 pip, about 0.01 ms.

### 4.4 Pickup setting: 자동 줍기

**Today:**
- Stepping onto any output pad, collection pile or boathouse pad pulls an item into the bag every 0.075 s, even while just walking across.
- Standing still for 0.08 s near a tree, rock, wheat, the net or an animal starts gathering.
- The plaza is full of such pads, so walking through it fills the bag by accident.

**New setting** (settings → 놀이 tab, §8):

| Value | Output pads and piles | Gathering resources | Drop-offs |
|---|---|---|---|
| **켬** (default; v4.1 behaviour) | as now | as now | instant (unchanged) |
| **멈추면** | only after standing still on the pad for **0.35 s**; walking across takes nothing | starts after 0.35 s standing still (was 0.08) | instant |
| **끔** | nothing automatic; a round **손 button** appears (§8) | the same 손 button: tap = one stroke, hold = keep gathering | instant |

**How the 손 button works (끔 mode).**
- It shows the item and how many are there (`생선 ×12`) only while he stands on a pickup spot or within reach of a resource.
- **Tap** takes one load, up to the free room in the bag.
- **Hold** keeps taking or gathering.
- It never moves the joystick.

**Safety rules.**
- The first loop (until the fisherman is hired) always uses **켬**, because the tutorial text expects it.
- The bots use 켬.
- **One-time tip** (켬 mode only): the first time he picks something up while crossing a pad at more than 60 % speed, a toast appears: `지나가다 주웠어요 · 설정 › 놀이 › 자동 줍기에서 바꿀 수 있어요`.

### 4.5 Navigation: 길 안내

**When it shows:** the bag is not empty, 길 안내 is on (the default), the first loop is done, observer mode is off and no panel is open.

**What the designer sees on the phone.**
1. **Chevron at the feet:** a flat 40 × 20 world-px chevron in the halo colours, 56 px ahead of his boots, pointing at the **next waypoint of the walking route** (not the straight line).
2. **Path dots:** small footprint dots every 56 px along the route, at most 9 of them (≈ 500 px), with a light wave travelling toward the target every 1.2 s. Dots within 90 px of the chief are hidden.
3. **Destination beacon:** the target pad pulses every 1.5 s (`Pad.pulse`). A badge floats 90 px above it with the item icon and a short name: `광장 판매대`.
4. **Off-screen:** an edge badge in the train-badge style, with the item icon and the distance in metres along the route: `28m`.
5. **Chip** at the bottom centre: `[icon] 구운 생선 8 → 광장 판매대 · 12m` (+ `+1곳` when other carried items go elsewhere).
   - Tap: show the next destination.
   - Hold: hide navigation for this load.

**Which destination, and why.** Navigation asks `Logistics.best(type, chief)`, with the station district included. The chief therefore goes exactly where a porter would: the same rule, so he never competes with them.

| Priority | Destination |
|---|---|
| 100 | a site that needs it; a hire pad waiting for this tool |
| 95 | the miners' food box, when low |
| 70 | a workshop input, when < 25 % (F2) |
| 60 | the grill, for boat fish |
| 50 | the food box |
| **48** | **an empty shelf (F1)** |
| 46 | the restaurant pantry, when low |
| 45 | a shelf, when low |
| 40 | a shelf |
| 38 | the founding dock |
| 35 | a founded shop |
| 30 | the 짐 싣는 곳 / export, once the 물류창고 is open |
| 10 | the 창고 / 물류창고 |

Special cases:
- **Raw items** go to their station's work spot when nobody works it (the chief cooks), otherwise to the input pad. If the station is full both ways, the chip reads `화덕이 가득 · 잠시 기다리거나 버려요` and points at the trash pad.
- **Mixed bag:** the destination that takes the **most items in the bag** (capped by its room) wins. On a tie, the shorter walk wins.
- **Route:** the A* walking route (`Roads.route`, already cached). It is recomputed when he strays more than 80 px from it, at most once per second.
- **With the tutorial arrow:**
  - If both point at the same pad, only the gold bouncing tutorial arrow shows.
  - If they point at different things (say a ribbon), both show. Navigation is smaller and teal; the arrow means "what to do next", navigation means "where your load goes".

**Example (a real 46-min case).**
- He carries 8 구운 생선 + 3 빵. The market shelf has fish 38/40 and bread 12/40; the restaurant pantry has fish 4/30 (low).
- The market would take 2 + 3 = 5 items; the pantry takes 8 + 3 = 11.
- Chip: `구운 생선 8 · 빵 3 → 큰 식당 식재료 칸 · 41m  +1곳`.

**Setting:** `길 안내: 켬 / 끔`.

**Cost:** ≤ 12 pooled dot sprites, at most one A* per second, ≤ 0.04 ms.

---

## 5. Request 4: 촌장 사무실, the staff, and 서리 은행

### 5.1 Where (checked on the 46-min save)

| Building | px anchor | Footprint | Region | Neighbours / clearing |
|---|---|---|---|---|
| **촌장 사무실** | **(100, 780)** | 5.0 × 4.0 m | start / west border | on the 바닷가 길 between the plaza (≈ 900 ground-px away) and the west strip; move the signpost (−40, 720) to the `w_gate_n` junction; check the canopy of the pine at (190, 860) |
| **서리 은행** | **(−300, 580)** | 5.4 × 4.6 m (civic `bank`) | west | by the west-strip gate; remove the pine at (−180, 560) and the snow pile at (−140, 500); move the lamp post (−190, 690) to the road |

- **Search result:** both spots are free of colliders, roads, plots, v5 corridors and the shore (≥ 90 px). They form a small **관청 거리** (civic lane) with the plaza.
- **Door paths:** the office door faces south-west (−Y); a 250 px trodden path joins it to the 바닷가 길 at `w_gate_n`. The bank's door path joins the west road at (−200, 760).
- **Inside walls:** both buildings get wall collision instead of a footprint circle (a chain of small circles along the back and side walls, with a gap at the door), so the chief can walk in.

### 5.2 Unlock, cost and order

| Step | When it unlocks | Cost |
|---|---|---|
| 촌장 사무실 터 | the hall is built (or, with no hall, v3 complete) | 1,800 + 20 판자 + 6 주괴, 10 s; ribbon on opening |
| 장부 담당 **셈이** | office | 500 |
| 소식·편지 담당 **소복이** | 셈이 | 700 |
| 서리 은행 터 | 읍 + office | 3,000 + 24 판자 + 12 주괴, 12 s; 2 tellers + manager come with it |
| 수금원 **딸랑이** | bank | 1,200 |
| 수행비서 **총총이** | 소복이 + 읍 | 900 |

- **Hire spot:** staff are hired on one **직원 뽑기** spot on the snow in front of the office door, (20, 900). The pads appear one at a time on the same spot (step-off rule), as the restaurant's staff pads do.
- **On arrival:** each person walks in from the plaza with a prop (ledger, mail bag, notepad, empty coin sack), bows and takes their desk.
- **Banner:** `새 직원: 장부 담당 셈이 씨가 출근했어요!` / `사무실 재고판에서 마을 물건을 한눈에 봐요`.

### 5.3 The building (art job "chief_office", civic framework)

**Exterior.**
- Cream plaster with a **teal roof** (the hall's family) and a pinecone finial.
- Sign `촌장 사무실`.
- A red **mailbox** whose flag pops up when mail arrives; a door lamp; a small flag.

**Cutaway.** The same layer contract as the bank: `floor`, `back`, `interior`, `front`, `shell_cut`, `shell` + `revealPoly` + reveal states.
- **The shell fades when:**
  - the chief is within 260 px (60 px hysteresis);
  - an office panel is open;
  - the observer camera frames it;
  - the player taps it (toggle).
- **So the designer sees inside** whenever he is near and whenever he watches.

**Interior.** The front wall is cut away, so the view is from the south-west.

| Spot | Contents | Who works there |
|---|---|---|
| back centre, on a raised rug | the **chief's desk**: nameplate `촌장`, stamp, a stack of letters, a little globe | the chief, in observer mode, or when the player sends him (§6) |
| back wall | a **village map** with pins, and the **재고판** chalkboard; the game draws 5 live coloured bars on it, visible through the cutaway | 셈이 walks over and points at it |
| left | **2 clerk desks**: abacus, ledgers, typewriter, desk lamps (glow at night) | 셈이, 소복이 |
| right front, by the door | the **secretary's desk**: appointment book, bell, flowers | 총총이 |
| front corner | the **collector's corner**: a small safe with a dial, coin sacks, a key board | 딸랑이 |
| side wall | pigeonhole **mail shelf**, newspaper rack, stove with a steaming kettle, coat rack, plant, visitor bench | — |

**Manifest points:** staffPoints (5), seatPoints, doorPoint, mailboxPoint, boardRect (where the bars are drawn), safePoint, deskPad.

### 5.4 The four staff: what they do and what the designer sees

All four use **townfolk** presets, so no cityfolk pages need to load: cardigan + glasses; sweater + scarf; blazer; parka + cap. The props are held items or head-carried items that already exist (`item_letter`, `item_coin`).

| Name | Role | Work loop on screen | What it unlocks |
|---|---|---|---|
| **셈이** (장부 담당) | ledger clerk | sits at desk 1 and writes; every 30 s walks to the 재고판, points (`point` gesture, or `talk` until the cityfolk crowd page loads) and updates the bars. When a shelf has been empty for over 30 s her desk lamp turns red and she says `훈제 고기가 바닥이에요!` | the **재고** tab; shortage and overflow alerts |
| **소복이** (소식·편지 담당) | news and letters clerk | at 06:00 (day clock) collects the bundle the postman (`npc_postman`, a village resident) brings, then sits and types for 20 s. When a letter arrives, the postman walks to the mailbox (`item_letter` on his head) and the flag pops up; 소복이 fetches it, sorts it into the pigeonholes and calls `편지 왔어요~` | the **소식** and **편지** tabs |
| **총총이** (수행비서) | personal aide | **walks with the chief**, 70–110 px behind and to one side, never in his way, with a notepad; takes notes while he chats. If he goes more than 2,000 px from the office she stays; when something new arrives she walks out to him: `촌장님, 편지 왔어요!` She is also a second way to find him. | the **업무** HUD chip (open the office panel anywhere); the observer-mode day plan |
| **딸랑이** (수금원) | collector | the round in §5.5 | coins arrive by themselves; the **통장** tab |

### 5.5 Collector and bank: the coin loop

**One round** of 딸랑이:
1. She leaves the office every 60 s, or sooner when 1,000+ coins are waiting on pads.
2. She visits every cash pad holding ≥ 100 coins, nearest first: market, 교역소, 잡화점, 큰 식당, 마을회관 세금. Before 읍 she also visits the 역 금고 and the 물류 금고; after 읍 those already fly in every 15 s by themselves.
3. At each pad the coins hop into her sack over about 1 s. The sack on her head grows (`item_coin` ×1–6) and jingles (`딸랑딸랑`).
4. At the bank she goes in. The teller counts (`sfx_coin_count`, 1.2 s) and stamps (`sfx_stamp`). The **vault door turns** for any deposit of 5,000 or more (`bank_vault` anim, `vaultAt` from the v5 tuning).
5. The coins fly from the bank to the HUD coin counter as **`+6,240` with a passbook icon**.

**Timing:** about 45–60 s per round in a typical village layout.

**Rules.**
- Coins in her sack are **saved** (`v42.office.bag`), so a reload never loses them.
- If the chief steps on a pad he collects it himself, as now; she skips empty pads.
- She never takes coins from the chief.

**Why it matters (measured):**
- With nobody collecting, about **1,510 coins/min** pile up on 6 pads.
- The smart bot spends **33 %** of its time walking to them.
- With 딸랑이, no pad should exceed about 1,500 coins between visits.

**Inside the bank** (civic `bank` cutaway): 2 tellers and the manager, the red velvet bench, the ATM and the piggy statue. Two village residents at most drop by between 09:00 and 17:00.
- The chief stands on the **창구** pad → **통장** panel.
- **Semantics in v4.2:** deposits go straight to the spendable coins. The bank is where the money is counted and recorded; it is not a savings account yet.
- **v5 later:** adds 저금 (1 %/day) and 대출 to the same passbook.

**Hand-off to v5.**
- `BankHost(ports, saved, { at: { x: −300, y: 580 } })`.
- v4.2 writes the `bank` slice in v5's format: `{ v:1, open:1, sv:0, ld:−1, tk:1 }`. v5 then opens with the bank already open and skips its own site.
- The collector's rows live in `v42.office.log`, because v5's sanitizer keeps only its own operations.
- The v5 integrator frees row D's `v5_bank` lot (4162, 3111) for another use. **This is a v5 plan change; the lead must approve it.**

### 5.6 The office panel (non-pausing, 720 × 1100 logical)

**How it opens:**
- stand on the **책상 pad** in front of the chief's desk for 0.4 s;
- or, once 총총이 is hired, tap the **업무 chip** anywhere.

**Tabs:** `재고 · 소식 · 편지 · 직원 · 통장`. Each appears with its staff member; the others are shown locked, with the name of the person to hire.

#### 재고 (inventory) tab

One row per goods line. Status: **부족** (red), **길 막힘** (orange), **남음** (blue), **적당** (green).

Example: the bot's 42-min village before the v4.2 fixes, at t = 630 s:

| 물건 | 모아둔 곳 | 가공소 (입구 · 출구) | 판매대 | 창고 | 흐름 (5분 평균) | 상태 · 바로가기 |
|---|---|---|---|---|---|---|
| 생선 | 40/40 | 24/30 · 36/36 | 구운 생선 26/40 | 0 | 잡기 87 → 굽기 75 → 팔기 32 /분 | **남음** · `물류창고로 보내요` / `화덕 2단 (900)` |
| 판자 | 40/40 | 30/30 · 36/36 | 교역소 0/40 | 0 | 만들기 28 → 팔기 0 /분 | **길 막힘** · `판자 짐꾼 2 (600)` |
| 빵 | 40/40 | 30/30 · 36/36 | 29/40 | 0 | 만들기 36 → 팔기 23 /분 | **적당** |
| 주괴 | 40/40 | 30/30 · 31/36 | 교역소 0/40 | 0 | 만들기 50 → 팔기 0 /분 | **길 막힘** · `주괴 짐꾼 2 (800)` |
| 훈제 고기 | 39/40 | 28/30 · 26/36 | 21/40 (zero 57 % of the time) | 0 | 만들기 50 → 팔기 42 /분 | **부족** · `훈제장 2단 (1,600)` |
| 통조림 · 도구 | — | 9/30 · 12/12 | 잡화점 0 | 0 | — | **길 막힘** · `도구 짐꾼 위치 보기` |

- **Top line:** `마을 물건 1,214개 · 창고 17/300 · 물류창고 —`.
- **Buttons:** each one moves the camera to that pad or building (the panel stays open, half-transparent) and the tutorial arrow points to it.
- **The rules behind each status** live in `balance.js`:
  - **부족**: the shelf has been at 0 for > 30 s **and** its source is empty.
  - **길 막힘**: the shelf has been at 0 for > 30 s **while** its source holds stock.
  - **남음**: the pile or output has been full for > 60 s **and** the shelf is ≥ 50 %.

#### 소식 (news) tab: one newspaper per game day, printed at 06:00

The panel uses the finished `ui_newspaper*` pieces (masthead, columns, photo frame, divider). Example front page:

> **서리 소식** · 12일째 아침 · 맑고 추움 −4°C
> **기차가 빙글! 서리역에 '도는 선로' 생겨** — "이제 기관차가 늘 앞에서 끌어요" *(사진: 바닷가 고리 선로를 도는 기차)*
> **어제의 숫자** 손님 214명 · 기차 38번 · 제일 많이 팔린 것: 구운 생선 612개 · 마을 수입 41,230코인
> **마을 소식** 새 이웃 4명이 뾰족집에 이사 왔어요 · 큰 식당 정식이 87그릇 팔렸어요
> **물류창고** 생선 상자 12개가 솔방울 마을로 떠났어요 (+360코인)
> **날씨** 오후에 함박눈 — 썰매 타기 좋은 날
> **광고** 목공소: 판자 20개면 집 한 채 뚝딱!
> **편지함** 새 편지 2통 →

- **Data:** counters reset at the 06:00 day change from events that already exist: visitors, sales by item, move-ins, buildings, exports, coins, rank.
- **Photo:** a 256 × 160 snapshot (render texture) of yesterday's top event location, kept until the next edition; falls back to the frame art.
- **Old editions:** the last 3 are kept (titles only in the save).
- **v5:** the story engine's newspaper replaces the generator inside the same panel.

#### 편지 (letters) tab: citizens write in

- **Delivery:** up to 6 unread. A new letter comes every 2–4 game hours, plus one for certain events.
- **Card:** the sender's portrait (villager face, or the townsfolk doll's head layers), the text and 1–2 answer buttons.
- **Rewards:** answering always gives happiness +1; some letters also start a small action. Unanswered letters are archived after 2 game days.

| From | Letter | Buttons → effect |
|---|---|---|
| 빵집 아주머니 | "촌장님, 오븐은 쉬지 않고 구워요. 그런데 빵 짐꾼이 혼자라 빵이 오븐 앞에 산더미예요. 일손을 하나 더 주시면 판매대가 텅 비는 일은 없을 거예요!" | `빵 짐꾼 2 부르기 · 700` (the pad appears at once; camera hops there) / `조금 더 볼게요` |
| 솔방울 마을 민지 (9살) | "촌장님 안녕하세요! 새 객차 창가에 앉아서 서리마을 바다를 봤어요. 기차가 빙글 돌 때 제일 신나요. 다음에 또 놀러 갈게요 ♥" | `답장 보내기` → 민지 counts one extra visit toward 단골 ★ |
| 광부 영감 | "광석은 산더미인데 제련소가 따라오질 못하네. 불을 더 세게 때든지… 촌장 생각은 어떠신가?" | `제련소 2단 보기` (camera, 1,400) / `나중에` |
| 큰 식당 요리사 | "정식 손님이 날마다 늘어요. 그런데 훈제 고기가 자꾸 떨어져서 '오늘은 정식이 안 돼요' 하고 말씀드리는 게 마음이 아파요." | `재고 보기` (opens 재고 on the 훈제 고기 row) |
| 이주민 가족 | "서리마을에 빈 방이 있다는 소문을 들었어요. 아이 둘과 강아지 한 마리인데, 받아 주실 수 있을까요?" | `어서 오세요!` (points at a free small plot with the house card) / `다음에요` |
| 솔방울역 역무원 | "요즘 기차가 빙글 돌아서 들어오니 손님들이 박수를 쳐요! 그런데 화물칸이 꽉 차서 상자를 다 못 싣는 날이 많아요." | `화물칸 크게 · 2,000` (only once the 물류창고 exists) / `알겠어요` |
| 솔방울 카페 사장 | "카페 빵이 오후만 되면 바닥나요. 물류창고가 생기면 거기서 바로 받아 올 수 있을 텐데요!" | `물류창고 터 보기` / `고마워요` |
| 장난꾸러기 | "촌장님! 눈사람 대회 열어 주세요!! 상품은 사탕이면 돼요. 저는 벌써 연습했어요 ㅎㅎ" | `좋아, 열자! · 120` (kids build snowmen on the plaza for 2 min, happiness +2) / `다음에` |
| 할머니 | "촌장님 발밑에 반짝이는 빛 덕분에 멀리서도 금방 알아본다오. 오늘도 수고 많았어요. 따뜻한 차 한 잔 하고 가요." | `답장 보내기` |
| 서리 은행장 | "촌장님 통장이 두툼해졌습니다. 곧 저금과 대출 창구도 열 예정이에요. 기대해 주세요!" | `고마워요` (a v5 teaser) |

#### 직원 (staff) tab

One line per person with their current activity:
- `셈이 · 재고판 고치는 중`
- `딸랑이 · 교역소에서 수금 중 (1,240코인)`
- `총총이 · 촌장님 곁`

Locked roles show the hire cost and where the hire spot is.

#### 통장 (passbook) tab (bank built)

- **Panel art:** `ui_passbook` + `ui_passbook_row`.
- **Rows:** the last 8 deposits (`12일 09:20 · 수금 입금 · +6,240`).
- **Today's income by source**, drawn as bars: 판매대 · 교역소 · 잡화점 · 식당 · 세금 · 역 금고 · 물류 수출.
- This is the economy explained in one picture, which also helps the turnover conversation.

---

## 6. Request 5: 관망 모드 (observer mode)

### 6.1 Starting and stopping

**Ways in.**
- **관망 button** (binoculars) in the right-hand column, above zoom+ (§8). Available once the village is complete (v3.5 hunter hired).
- **Automatic** after `관망 자동` seconds with no touch (default **1 분**; 끔 / 30초 / 1분 / 2분). Not while a panel, ceremony or tutorial focus is active.
- Before it starts, a 3-second chip counts down, `관망 모드로 바꿀게요 · 3`; any touch cancels it.

**While it runs.**
- **Top-centre caption** (changes with each activity): `관망 중 · 촌장님은 지금: 광장 판매대에 생선을 채우는 중`.
- **Small line below it:** `화면을 만지면 다시 조종해요`.
- The rest of the HUD stays as it is.

**Ways out.**
- **Any touch on the village** (the joystick) returns control **at once**. The same drag moves the chief. A toast reads `다시 조종해요`.
- He keeps what is in his bag, and navigation shows where it goes.
- A chat in progress ends with the resident's line. Nothing teleports and the camera simply keeps following.
- **Buttons do not end it:** zoom, overview, settings and the 업무 chip all work during 관망.

**What he never does by default.**
- He never steps on purchase, hire or upgrade pads; observer mode makes those pads ignore him.
- He never builds, never pays and never uses the trash.
- Setting `관망 중 돈 쓰기: 안 써요 / 고용만`: with 고용만 he may hire staff and porters he can afford, never buildings or upgrades.

**Saving:** observer mode is not saved; it always starts off after a reload.

### 6.2 What the chief does (behaviour script)

A small "what next" chooser runs twice a second. The current activity is locked for its minimum time; the highest score wins, with ±10 % random jitter so he does not loop.

| Activity | Score | Conditions | Duration | What the designer sees |
|---|---|---|---|---|
| **급한 일** (urgent chores) | 100 | guests waiting > 9 s at a register nobody staffs; a ribbon to cut; a station with ≥ 8 items waiting and no operator; a site missing materials he carries; the miners' food box empty | until done | He hurries (run speed); the halo turns gold while he works. Uses the tutorial's own `evaluate()` targets, the logic with which the arrow-only bot reaches 읍. |
| **업무** (chores) | 40 | bag has room, any v4 hint target exists (cards, the carpenter's planks, empty shelves) | 20–60 s | Carries, sells, fills the pantry, follows his own navigation. |
| **수금** | 35 | no collector yet, ≥ 300 coins on one pad | one pad | — |
| **기차 구경** | 30 | a train arrives within 20 s and he is within 1,500 px of our station | arrival + departure loop | He walks to the platform and waves at the windows (`wave` anim). |
| **수다** (chat) | 25 (+15 if not done for 3 min) | a resident or townsperson idle or sitting within 600 px; not one he chatted with in the last 5 min | 20–30 s | Both face each other, 2–4 alternating bubbles from `ResidentChat` / `VillageLife` lines (no AI calls), 눈꽃말 voices, hearts at the end; 총총이 takes notes. |
| **사무실** | 20 (+30 from 08:00–10:00 when a new paper is out; +30 when 2+ letters are unread) | office built | 30–60 s | He walks in (the shell fades), sits at his desk (`sit`), reads the paper (`read`), stamps a letter; staff work around him; the camera frames the cutaway. |
| **쉬기** | 20 | — | 20–40 s | Sits on a bench, warms his hands at the campfire (`warm_hands`), throws a ball for 콩이 (`DogPlay` throw / pet), snowball fight with kids (`VillageLife`), looks at the sea. |
| **점심** | 50 at 12:00–12:40 | big restaurant open | 40 s | Sits at a free outdoor table and eats a 정식 (free; the kitchen plates it). |
| **저녁** | 40 from 20:00 | — | until 06:00 or a higher score | Office with the lamp on, or the campfire; from 22:00 dozes by the office stove (`emote_zzz`). |

**A typical 3 minutes (day clock 11:30 → 13:00).**
1. He walks from the office to the plaza; the caption reads `광장으로 가는 중`.
2. At the grill nobody is working and 9 fish are waiting, so he cooks (gold halo, sizzle) until the fish are done.
3. He carries 8 구운 생선 to the restaurant pantry.
4. 12:00, the hall bell: he sits at table 3 and eats a 정식.
5. A train whistles. He walks to the station and waves; the camera eases out to show the train circling the loop.
6. He chats with 민지's grandmother on the bench: two bubbles, two hearts.
7. 총총이 hurries up: `편지 왔어요!`. He walks back to the office and reads at his desk.

### 6.3 Camera

**Following him.**
- The camera follows the chief with a softer lag (0.08 instead of the play value).
- Zoom eases to `max(0.85, player's zoom − 0.2)` and goes back to the player's own zoom when control returns.

**볼거리 cuts** (setting `관망 볼거리: 켬 / 끔`, default 켬).
- At most once every 45–90 s, when an event happens within 2,500 px, the camera pans to it for 6–8 s, then returns.
- **Events:** a train arriving at ours; a ribbon; a move-in; the collector's deposit (vault spin); a letter at the mailbox; the cargo sleigh loading.
- **When it does not cut:** in the 20 s after a cut, and while the office panel is open.

**Cost:** the chooser is ≤ 0.05 ms per frame on average, and route requests reuse the navigation cache.

---

## 7. Progression, costs and timing

### 7.1 A new game (smart-bot game minutes; v4.1 reference times in brackets)

| Time | What happens | Cost | Notes |
|---|---|---|---|
| 0 | halo visible from minute 0 (visual only) | — | first 20 minutes unchanged |
| ~1.3 | navigation and the pickup setting active (after the first loop) | — | tutorial always uses 켬 |
| 21.7 | station repaired; first train with the **S1 consist**; on departure it pulls forward round the loop | — | [21.7] |
| ~30–40 | **짐꾼 2** pads appear on lines that back up (F4) | 500–900 | after the 창고 (~32) |
| ~38+ | **가공소 2단** pads (F5) | 900–1,600 | after each line's 3rd gatherer |
| 43 | hall [43.1] → **촌장 사무실 터** | 1,800 + 20 판자 + 6 주괴 | — |
| 44–46 | 셈이 → 소복이 | 500, 700 | — |
| **~49.5** | **읍** ceremony; S2 consist (2nd 객차) | 11,000 | [47.7]; ≈ +1.8 min from the office spending, but the 5-minute saving gap before 읍 now has things to do |
| 51 | **서리 은행** | 3,000 + 24 판자 + 12 주괴 | — |
| 52 | 딸랑이 → 총총이 | 1,200, 900 | — |
| 55 | **서리 물류창고** | 6,000 + 40 판자 + 20 주괴 | — |
| 56–58 | 물류 직원 ×2 → 화물 썰매 | 800, 1,100, 1,500 | — |
| ~60 | **화물칸 크게** (offered when the racks have been ≥ 80 % for 2 min) | 2,000 | — |

The longest wait after tower_east should stay ≤ 3 min. The v4.1 measure was 2.96–5.15 min, and the office now fills the 42–48 min gap.

### 7.2 The designer's first session on his v4.1 save (already 읍, plenty of coins)

All v4.2 sites appear on load, with a banner and the tutorial arrow, one after another.

1. **0:00** — Title as before → village at the plaza.
2. **0:02** — A **"새로워진 것"** card with 3 lines and icons, then `좋아요`:
   - `촌장님 발밑의 반짝이는 후광`
   - `물건을 들면 갈 곳을 알려 줘요`
   - `가만히 두면 촌장님이 알아서 지내요 (관망 모드)`
3. **0:05** — The chief stands on the plaza inside a calm mint ring; at zoom 0.6 the ring and star pip pick him out of the crowd at once.
4. **0:10** — He walks onto the grill output. With 켬, fish fly in. A teal chevron appears at his boots, 6 dots run toward the market, and the chip reads `구운 생선 8 → 광장 판매대 · 12m`. He drops them and navigation clears.
5. **0:30** — Banner `촌장 사무실을 지을 수 있어요`; the arrow points to (100, 780) on the 바닷가 길.
6. **0:40–1:30** — He chooses 촌장 사무실 on the plot card and pays; builders and porters come. Ribbon, confetti. As he walks up, the roof fades: an empty room with 4 desks, a stove and a map.
7. **2:00** — He hires 셈이. She walks in with a ledger, bows and sits; the 재고판 fills with 5 bars. He steps on the desk pad → the 재고 tab shows `판자 · 길 막힘 → 판자 짐꾼 2 (600)`. He taps it; the camera hops to the sawmill; he walks there and hires.
8. **3:00** — 소복이 arrives. The village postman walks up with a letter on his head; the mailbox flag pops up; `편지 2통`.
9. **4:00** — A train arrives: engine, blue 객차 ×2, red 화물칸, red 승무원칸, each car briefly labelled. It stops; neighbours step off; the conductor waves; the train **pulls forward round the new loop by the sea** and glides past the platform engine-first toward the town. *(Request 3, solved where he will look first.)*
10. **5:00–6:30** — 서리 은행 site next to the office; built, `서리 은행 개업!`. He hires 딸랑이: the coin sack fills at the market, 교역소, 잡화점 and 식당; the vault turns; **`+6,240`** rises to the HUD.
11. **7:00** — 총총이 arrives and walks behind him with a notepad. The **업무** chip appears with badges.
12. **8:00** — Settings › 놀이 › 자동 줍기 → **멈추면**. He crosses the grill pad without picking anything up; he stops on it and the fish come.
13. **10:00–12:00** — 서리 물류창고 site south of the station district; built, ribbon. Tapping it shows empty racks; he hires the crew and the sleigh. A pony trots up the 화물길 with 12 crates; the next train's boxcar loads them.
14. **13:00** — He puts the phone down. After 1 min the countdown chip, then **관망**: the chief walks to the office and reads the paper, chats with 할머니, cooks at the grill during a rush (gold halo), and watches the train circle the loop (camera cut).
15. **20:00** — He touches the screen → `다시 조종해요`; the chief is wherever he was, and navigation shows where his bag goes.

---

## 8. Phone layout (390 × 844 CSS) and settings

**Existing HUD (measured on `screens_v4`).**
- **Top-left:** coin counter (y 34), people chip (y 116), rank chip (y 116), order chip (y 147), train badge (y 180).
- **Top-right:** settings (y 34), clock (y 82).
- **Bottom-left:** whistle (y 752).
- **Bottom-right:** zoom+ (y 667), zoom− (y 706), overview (y 752).

**New elements.**

| Element | Where (CSS px) | Size | When |
|---|---|---|---|
| **관망 button** (binoculars; `ui_icon_explore` or a new `ui5` icon) | right column, centre (359, 610) | 56 round | after the village is complete; highlighted while 관망 is on |
| **손 button** | (296, 706), left of the zoom column | 60 round, item icon + count | only when 자동 줍기 = 끔 and something can be picked up |
| **Navigation chip** | bottom centre (195, 795) | 240 × 44 | bag not empty, navigation on |
| **업무 chip** (office) | left column (60, 222), under the train badge | 120 × 44 + badges | once 총총이 is hired |
| **관망 caption** | top centre (195, 200) | up to 300 × 40 | observer mode |
| **"새로워진 것" card** | centre | 320 × 300 | once |

**Settings.** The panel already holds 7 rows, so it gains **two tabs**: `소리·화면` (the existing 7 rows) and **`놀이`**:

| Row | Values | Default |
|---|---|---|
| 자동 줍기 | 켬 / 멈추면 / 끔 | 켬 |
| 길 안내 | 켬 / 끔 | 켬 |
| 촌장 후광 | 켬 / 끔 | 켬 |
| 관망 자동 | 끔 / 30초 / 1분 / 2분 | 1분 |
| 관망 볼거리 | 켬 / 끔 | 켬 |
| 관망 중 돈 쓰기 | 안 써요 / 고용만 | 안 써요 |

---

## 9. Where everything is (data for `world.js`)

| Thing | px | Lattice | Note |
|---|---|---|---|
| 촌장 사무실 | (100, 780) | — | 5.0 × 4.0 m; door path to `w_gate_n`; hire spot (20, 900) |
| 서리 은행 | (−300, 580) | — | civic `bank` 5.4 × 4.6 m; door path to (−200, 760) |
| 서리 물류창고 | (3180, 3100) | (28.4, −27.4) | 11 × 8 m; docks on +X; 물류 금고 (3606, 3171) |
| cargo-sleigh stop (station) | (3120, 1635) | (5.0, −5.0) | on 역앞 거리, 2 cells from the 짐 싣는 곳 |
| 화물길 | — | (5, −5) → (31, −5) → (31, −23.2) → (33.5, −23.2) → (33.5, −27.5) | footpath + sleigh lane in v5 corridors (`main`, `ave`, `ave_s`, `bank_st`) |
| T1 / our loop | (3056, 1283) | (−1, 0); loop u −7.5…−1, v 0…3.5 | replaces the buffer stop |
| T2 / town loop | (5488, 2499) | (37, 0); loop u 37…43.5, v 0…3.5 | track k 42–46 removed |
| our stop, nose | (2934, 1222) | (−2.9, 0), heading NW | tail of the S2 train at u 6.87 |
| town stop, nose | (5142, 2326) | (31.6, 0), heading SE | — |

**Ground to clear** (decor patch):
- the pines at (2950, 1150) and (2930, 1010);
- the pine at (−180, 560) and the snow pile at (−140, 500);
- move the lamp post (−190, 690) and the signpost (−40, 720).

**Check:** re-run `v4_layout`-style checks plus a new `v42_layout` check over these footprints.

---

## 10. Save and settings data

**Save version.** `SAVE_VERSION` 6 → **7** (v4.2). The v5–v8 plan's numbers shift by one (7 → 8 …); its migration chain does nothing, so only the labels change.

**Size.** The v4.1 save is 5,717 B against a **6,144 B** cap. v4.2 needs the cap raised to **≥ 9 KB**. The v5 plan already lifts it to 24 KB.

**New main-save keys.**

`v42` (≤ 1 KB):

| Field | Contents |
|---|---|
| `office.st` | 0 none / 1 site / 2 built |
| `office.staff` | `[셈, 소복, 총총, 딸랑]`, 0/1 each |
| `office.bag` | coins in the collector's sack |
| `office.log` | ≤ 8 rows of `[day, src, n]` |
| `office.letters` | `{ seq, inbox: [[id, tpl, state, day]] ≤ 6 }` |
| `office.news` | `{ day }` |
| `up` | `{ grill: 1, … }` (가공소 2단) |
| `p2` | `[lineIds]` (짐꾼 2) |
| `train` | `{ stage: 1|2, big: 0|1 }` |
| `depot` | `{ st, crew: 0–2, sleigh: 0|1 }` |

**Module slices** (v4.2 writes them; the modules pass them through untouched until they take over):
- `bank`: v5 format, `{ v:1, open:1, sv:0, ld:−1, tk:1 }` (§5.5).
- `logistics`: v8 format, `{ v:1, open:1, stock:{…}, orders:[], cash, chains:[], lv3:[], days:[], made:[0,0], tot:[…] }` (§2.4).

**Not saved:** visitors in the village, observer mode, the navigation route, the sleigh's cargo (it is back on the racks after a reload), staff positions.

**Settings** (`frostVillage.settings.v1`):
- `pickup`: `'on' | 'still' | 'off'`
- `nav`: bool
- `halo`: bool
- `observeAfter`: `0 | 30 | 60 | 120`
- `observeEvents`: bool
- `observeSpend`: `'none' | 'hire'`

---

## 11. Art and audio asks

| # | Ask | Pipeline | Must / nice | Fallback if late |
|---|---|---|---|---|
| A1 | `chief_office` cutaway building + interior props + manifest points (§5.3) | civic (`civ_lib`, `civ_render`) | must | none (it is the request) |
| A2 | Train: `train_coach_long`, `train_boxcar` (+ door anim), `train_caboose` (+ flag anim), 5 dirs each | town (`town_render`) | must | a tinted `car_a` / `car_b` at 1.25× + car labels |
| A3 | Rails v2: `rail_arc_q0…q3` (R 1.75 cells, partition-of-unity shadows), `rail_turnout_*`, `rail_switch_stand` (2-frame lamp) | town | must | arcs drawn procedurally by RoadPaint (ballast + sleepers + 2 rails); it will look flatter |
| A4 | Chief anims `sit`, `talk`, `wave`, `read` (newspaper prop), `warm_hands`, `happy` (S / SE / E + mirrors) | workers / player rig (as for pet / give / throw) | must for 관망 | `idle` + a prop sprite, which looks stiff |
| A5 | Optional: `rail_water_tower` for the loop infield | town | nice | snow and pines |
| A6 | `ui5` icons: binoculars (관망), hand (줍기), route (길 안내), office (업무), letter; a chalkboard overlay frame | ui | must | existing `ui_icon_explore`, `item_letter` |
| A7 | Audio: switch "철컥", wheel squeal on curves, `amb_office` (typewriter, pages, kettle) | audio | nice | reuse `sfx_hammer` (soft), none, `amb_bank` |
| — | Reuse: `bank` (civic), `logistics_center` + forklift (logistics), `cargo_sleigh` (vehicles), `ui_newspaper*` / `ui_passbook*` (fx_city), `sfx_coin_count`, `sfx_stamp`, `sfx_newspaper`, `amb_bank` and warehouse beeps (audio6), sleigh bells (audio3) | — | — | — |

---

## 12. Acceptance checks (for the build and verify teams)

1. **First 20 minutes.**
   - The request log until tower_east starts is identical to v4.1's.
   - Smart, arrow and think bots reach village complete within ±5 %.
2. **Halo.**
   - At zoom 0.6, 13:00, station square, with 20+ dolls on screen, the chief must be found in a screenshot by an independent reviewer in under 1 s (5 shots).
   - The ring never draws over a character.
   - The gold state shows while he works a station.
3. **Pickup.**
   - In 멈추면 and 끔, walking across the grill output at full speed picks up **0** items.
   - 켬 behaves byte-identically to v4.1 (labour test).
   - The tutorial still passes with the setting on 끔.
4. **Navigation.**
   - For 20 random bags, the chosen destination equals `Logistics.best` (or the documented raw / trash exceptions).
   - The route length is within 10 % of A*.
   - Navigation never shows in observer mode or during the first loop.
5. **Train.**
   - In 100 % of moving frames the engine faces the direction of travel.
   - The train never meets its own tail.
   - The k 8 and k 33 crossings open as in v4.1.
   - Cycle 85–100 s; visitors per minute within ±10 % of v4.1 on the same save.
   - The first-train moment is unchanged apart from the extra 2.5 s.
   - The S2 tail clears the k 8 crossing.
6. **Overflow.** The §2.3 targets on the 46-min save.
7. **Office, bank and collector.**
   - Coins are conserved: pads + sack + wallet before and after every round, and across a reload mid-round.
   - All 10 letter templates and their effects work.
   - Panels open in < 100 ms.
   - The shell fade has hysteresis (no flicker at 260 px).
8. **Observer mode.** A 30-min soak in 관망 from the 46-min save must show:
   - 0 errors and 0 stuck > 20 s;
   - **accidental payments = 0**;
   - income ≥ 80 % of the arrow bot's;
   - ≥ 6 different activities per 10 min;
   - coins spent = 0 with the default setting.
9. **Performance.**
   - Halo + navigation ≤ 0.05 ms; observer chooser ≤ 0.05 ms; office with 4 staff + cutaway ≤ 0.3 ms.
   - Texture memory ≤ 455 MiB (must) in every v4.2 scenario.
   - Display objects in the station view ≤ 1,700.
10. **Saves.**
    - v2, v3, v3.5, v4 and v4.1 saves load.
    - A v4.1 save at 읍 gets every v4.2 site in order.
    - Fuzzed `v42`, `bank` and `logistics` blocks never crash.
    - Size ≤ the new cap.
11. **Artifact.** ≤ 511 files per version (pack the new art into pages, or add a third publish).

---

## 13. Risks and open questions for the lead

1. **물류창고 location.** (3180, 3100) is the only in-map spot. It is about 1,800 px from the station square, so it relies on the cargo sleigh. The alternative is v8's `PLACES.A` with a south map extension (a C1-sized change, and farther from the village).
2. **Bank location.** Placing it at the plaza's west gate changes the v5 plan, which put it in row D. The designer then sees the collector's whole cycle; v5's story residents walk farther to the bank.
3. **Train and v6.**
   - `harbor_runtime` assumes push-pull with the engine on the NW end.
   - The planned town-east halt overlaps T2.
   - Both are data changes for the v6 integrator; the far terminal needs its own loop.
4. **Save numbering and the 6 KB cap.** Both must change in v4.2.
5. **Art load.** A1–A4 are the critical path. Without A2 / A3 the train still works (tinted cars, procedural arcs) but looks weaker.
6. **Economy.** F4 and F5 plus exports raise late income by about 15–30 %. If the bots show more, lower `export.rate` (0.5) first, then F5's speed.
7. **Memory and files.**
   - About +25–35 MiB transient: train headings, office, bank and logistics pages near those buildings.
   - Only 19 files of headroom: a third publish is likely.
8. **Observer auto-start.** It does not affect the bots (their input never idles for 60 s). An arrow-only player who waits 60 s gets 관망, which then does the same chores the arrows would have shown.
