# 금방 온라인 마켓 — binding plan (v4.3)

Status: **binding**. It merges `docs/geumbang_plan_player.md` (player/designer angle) and `docs/geumbang_plan_tech.md`
(engineering/art angle, measured on HEAD 2bbbde6). Art contract: `docs/CONTRACT_GEUMBANG.md` (sections AO–AS). Designer
summary: `docs/기획서_금방마켓.md`. Where the two proposals disagreed, this file decides and says why. Numbers marked
*estimate* are starting values for the census bot. Nothing here changes v4.2 or the v5–v8 modules; every patch to an
existing file is listed in §12.4 and applied only after v4.2 publishes.

Designer idea (verbatim): "재고를 빨리 소진하기 위해 온라인 마켓도 만들까? 시민들이 온라인 마켓으로 주문하면 온라인 마켓
물류센터에서 배달차로 시민 집까지 배달? 어때? 배달 회사는 쿠팡이 아닌 금방 ㅋㅋ 금방 뭐가 왔지? ㅋㅋ 금방 대형 물류창고,
금방물류 배달 차량, 배달 기사, 물류창고 직원들 어때?"

> **대표님용 한눈에**
> - **금방**은 v4.3 에 열려요. v4.2 의 **서리 물류창고가 그대로 "금방 물류센터"** 가 되고 (간판 글자만 바뀜), 닫혀 있던
>   1번 하역장이 열려서 **꿀금색 금방 밴**이 드나들어요.
> - 시민이 폰으로 주문 → 직원이 선반에서 꺼내 → 컨베이어 → "찌익" 테이프 포장 → 밴이 솔방울 마을 길을 달려 → 기사님이 상자를
>   안고 "띵동~ 금방이에요!" → 하트 + 코인. **선반 높이가 진짜 재고라서, 팔릴수록 선반이 낮아지는 게 보여요.**
> - 차가 못 가는 **서리마을 옛 동네는 허스키 개썰매**가 배달해요 (이미 있는 그림 + 금방 깃발).
> - 금방은 **남는 물건만** 팔아요. 가게 판매대가 모자라면 그 물건은 "가게 먼저 · 잠깐 품절".
> - 새 그림: 금방 밴(8방향), 간판 글자, 배너·깃발·세움 간판·보관함, 금방 상자, 금방 옷 입은 직원·기사(새 동작 6개), 금방 앱
>   화면과 아이콘, 효과음 8가지. 이름·색·로고는 **모두 새로 만든 것**이고, 실제 회사(쿠팡 등)를 흉내 내지 않아요.

---

## 0. Decisions at a glance

| # | Topic | Binding decision | From | Why |
|---|---|---|---|---|
| D1 | Version | **v4.3**: G1 (vans, hub, app) + G1b (dog sled for the old village, 새벽배송, lockers, extras). G1b can slip to v4.4 without art changes | both | The overflow fix belongs now: v4.2's depot throughput is the limit (v4.2 §4.5 "raw pile ≥ 90 %" still 97 %) |
| D2 | Gate | Depot built, then **1 game day** (600 s) or racks ≥ 60 % for 120 s → 정 할머니's letter (or a banner if 소복이 is not hired) | player | Nothing changes before 읍; the first-20-min request log stays byte-identical |
| D3 | Hub | **The v4.2 서리 물류창고 becomes 금방 물류센터** (nameplate swap, dock 1 opens); no second building in v4.3 | both | Only free 11 × 8 m spot on the map (v4.2 occupancy search); a second identical hall would read as copy-paste |
| D4 | Stock | **Depot racks are the only source.** Placing an order **picks** (removes) the items; shelves, pantries, the food box and the v3 창고 are never touched | player (rule), tech (pick-on-place) | "Drain the surplus without starving the shops" by construction; nothing lost on reload |
| D5 | Customers | Town homes (apartments, shop households, lots, 마을회관, 소방서) by van; **old-village houses by dog sled** (G1b); `t_station` excluded (door across the rail) | both | Every household can order; the village is the heart of the game |
| D6 | Vans | Own `VanDriver` on the v4 drive graph + a 26 m data **spur** from dock 1; yields to walkers; analytic off screen; ≤ 3 vans in v4.3; v5 `tour()` takes over at G2 | tech | v4.2 depot lanes are not connected to the drive graph (measured); v5 dispatch is single-stop |
| D7 | Van art | Gold re-render of the existing van rig; **8 screen headings** = SE, NE + corner frames S, E, N, with SW, NW, W mirrored; no letters on the body; "금방" on a camera-facing **roof sign** | lead | Streets are axis-aligned, so drive frames stay 2+2; the corner frames remove the 0.25 s heading snap a sharp eye would see; 8 true renders would cost ≈ 4× (≈ 19 MiB) and still need the roof sign |
| D8 | No e-trike | **No cargo e-scooter or e-trike** | lead | Snowy roads, the v5 era table (읍 = sleigh era), mirrored lettering, the file wall; the existing dog sled is cuter and already fits the village |
| D9 | Era | The 금방 van is the one motor vehicle allowed before 도시 (`role: 'gb'` exempt from the v5 era table) | lead | The designer asked for 배달 차량 explicitly; the town side is "modern"; the village keeps sled-era vehicles |
| D10 | Crew | New small paper-doll fragment **geumbangfolk** (uniform parts + 6 anims), not cityfolk | lead | Cityfolk needs 28.3 MiB and townfolk2; geumbangfolk ≈ 6 MiB and works on townfolk alone |
| D11 | Money | Paid on delivery at `priceRate` 0.8 × shop price (raw goods fixed) into the existing **물류 금고**; 딸랑이 collects; 통장 bar `금방` | both | Reuses the v4.2 coin loop; the rate is the income dial (§8.2 gate ≤ +5 %) |
| D12 | Brand | Name 금방 (app 금방 마켓, delivery arm 금방물류, building 금방 물류센터); slogan **"금방 왔지?"**, tagline **"방금 시키면 금방 와요"**; honey gold + cream (navy accent); mark 금방이 | player + tech | Original; §7.4 lists what it must never resemble |
| D13 | Save | New slice `geumbang` v1, cap 1,400 B, no `SAVE_VERSION` bump | tech | v4.2 worst case ≈ 8 KB vs gate 10,240 B |
| D14 | Files | 15 source files, **10 shipped**, −2 by re-packing the logistics centre → **net +8**, +9 with `veh_dog_sled.png` (not shipped today) → **≈ 457** | lead | 387 today, ≈ 448 after v4.2 CODE-2, gate 480 |
| D15 | Depot sign fix | v4.3 also ships `seori_nameplate_ko/en` ("서리 물류창고" / "Frost Depot") for the time before 금방 opens | player finding | v4.2 shows the baked "솔방울 물류센터" while all UI says 서리 물류창고 |

Order of value if the lead must cut (top survives longest): hub + 1 van + doorstep + app 오늘/주문 → sled for the old village →
upgrades 밴 2/3, 포장대 2단 → 새벽배송 → lockers → backhaul, 기사님/후기 tab polish, unboxing and the cat → gifts / 촌장님 특급.

---

## 1. Guardrails

1. **After 읍 only.** No 금방 code path runs and no 금방 file loads before the depot exists (`reqlog_gb.mjs`).
2. **Shops first.** 금방 sells depot rack stock only; the guard in §5.3 pauses items whose shop is short. Gate: no shop
   empty-rate worse than v4.2 + 2 points.
3. **Read-only modules.** `src/{story,missions,bank,vehicles,harbor,beach,city}/**` are not edited; 금방 keeps its data in
   shapes those modules adopt (§12.5).
4. **Existing art is not edited.** New art lives in `assets/geumbang`, `assets/geumbangfolk`, `assets/ui6`,
   `assets/audio8`; every key has a code stand-in (§10.3).
5. **Cosy rules.** No failure states, no late penalties, no driver ratings that go down, only 4–5 star reviews, nobody
   works day and night (night crew is separate, breaks are visible), nothing spends coins without the player.
6. **Every number** is in `BALANCE.v43.gb` with a Korean comment (§8.1).

---

## 2. Phases and version placement

| Phase | Ships in | Scope | Depends on |
|---|---|---|---|
| **G1** | v4.3 | gate + letter + opening; hub loop (pick/pack/stage/load) in the cutaway; OrderBook over town addresses; 1–3 vans (VanDriver, spur, curb stops); doorstep (bell, handover, doorstep parcel, apartments); settlement; app (오늘 · 주문 · 상품); upgrades 포장대 2단, 밴 2, 밴 3; save slice; office/news/관망 hooks; `seori_nameplate` fix | v4.2 depot built (if the depot slips to v4.3, 금방 slips with it) |
| **G1b** | v4.3 late (cut line → v4.4) | 금방 개썰매 for the old village + the 역앞 handover stand; 새벽배송; lockers (plaza, apartments); backhaul; app 기사님 · 후기; unboxing + cat; 금방 집하 | G1 |
| **G2** | v5 integration | vans move to `VehicleSim` via one additive `tour()` API (VP-G1); era exemption (VP-G2); v5's 서리 큰길 lets vans reach the plaza gate, so more village houses switch from sled to van | v5 vehicles module + its critique fixes (C1, M2) |
| **G3** | v8 integration | OrderBook becomes a source of v8 `home` orders (`mode: 'centre'`, LP-G1); optional **금방 메가센터** at v8's new-town logistics site (a gold re-render of the centre shell); v8 furniture/appliances arrive in 금방 vans | v8 logistics + world growth |

Gifts (촌장님 선물하기) and 촌장님 특급 are **not** in v4.3 (designer question 7, default v4.4).

---

## 3. Unlock and opening

### 3.1 Gate and letter
- Trigger: depot built **and** (600 s = 1 game day since it opened **or** total rack fill ≥ 60 % for 120 s). One letter at
  the next free v4.2 letter slot (≤ 1 금방 letter per game day afterwards).
- Letter (소복이 brings it): from **솔방울 아파트 2동 정 할머니**: "촌장님, 요즘 역까지 장 보러 가기가 힘들어요. 물류창고에 물건이
  그렇게 많다던데, 집 앞까지 갖다 주면 안 될까요?" + 셈이's note "이름은 '금방' 어때요? 방금 시키면 금방 가니까요." Buttons
  `금방 시작하기 · 4,000` / `조금 더 생각해 볼게요`.
- Without 소복이: banner `물류창고에서 온라인 마켓을 열 수 있어요` + the tutorial arrow to the pad.
- Pad **금방 개업** at the depot front door: **4,000 coins + 20 판자 + 10 주괴, 15 s** (v4.2 site flow).

### 3.2 Opening ceremony (≈ 6 s, v4 ribbon flow)
Ribbon cut (`sfx_gb_jingle`, confetti) → old lettering fades out, `gb_nameplate_<lang>` fades in with a sparkle → `gb_banner`
unrolls beside dock 1 → dock 1 rolls up (`dock_door`), the gold van backs in, roof sign blinks → banner **금방 물류센터가 문을
열었어요!** / sub `방금 시키면 금방 와요` → the 3 v4.2 depot workers redress once (sparkle) into 금방 looks and walk to picker,
packer and dockhand spots; 방금순 팀장 appears at the counter.

### 3.3 첫 주문 따라가기 (≈ 60 s, any touch skips)
Forced first order: 정 할머니, `장작 4 · 빵 2`. The camera follows the parcel with a caption chip per step: 주문 받음 (toast,
`sfx_gb_chime`) → cutaway opens, "네~ 금방입니다!" → picker takes logs (the rack stack drops a step) → belt → packer: box pops,
items hop in, `tape_box` "찌익" (`sfx_gb_tape`) → staged by dock 1 → dockhand loads (`unload` reversed) → van drives
bank_st → ave_s → 중앙로 → 뒷길, stops at 아파트 2동 → driver `carry_parcel` to the entrance → `ring_doorbell`
(`sfx_gb_doorbell`, `fx_gb_bell`) → 정 할머니 steps out → `hand_parcel`, hearts, "아이고, 방금 시켰는데 벌써 왔네! 진짜
금방이구먼." `+22` → camera back; the 금방 chip bounces in with `첫 배달 완료! 왼쪽 위 금방 앱에서 주문을 볼 수 있어요`.

### 3.4 Old saves
A v4.2 save with the depot gets the letter after one game day; without the depot, after building it. The "새로워진 것" card
adds one line once: `물류창고에서 온라인 마켓 "금방"을 열 수 있어요`.

---

## 4. Map (lattice `L(i, j) = (3120 + 64(i + j), 1315 + 32(i − j))`; measured by the tech probes)

| Thing | Lattice | px | Note |
|---|---|---|---|
| hub `logistics_center` | (28.4, −27.4) | (3184, 3101) | unchanged v4.2 placement |
| **bay 1** (`dockVehiclePoints.delivery_van[0]`) | (34.1, −28.9) | (3453, 3331) | van front reaches y ≈ 3402: `v42_layout`'s apron gate y ≤ 3360 becomes **≤ 3420 for bay 1 only**; `lgx_dock` paint extends j −27.6 → −29.6. Fallback if refused: vans share bay 2 with the sleigh through a dock scheduler (≈ −10 % van throughput) |
| bay 2 | (34.1, −26.2) | (3623, 3246) | stays the cargo sleigh's |
| outbound pile (`dockPoints[0]`) | inside door 1 | (3338, 3273) | one baked image of `gb_parcel_*` (≤ 8 visible) |
| `gb_sign` | ≈ (23.0, −24.8) | ≈ (3005, 2845) | beside the 은행길 end of `lgx_walk`, outside the footprint and the 물류 금고 (30.0, −31.4) |
| **spur** (data, `WORLD.v43.gb.spur`) | out: bay1 → (35.55, −28.9) → (35.55, −23.3) → (30.75, −23.3) → (30.75, −19.0) ~> joins ave +j at (33, −18); in: reverse, then reverse-park into bay 1 facing SE | — | ≈ 26 m each way, axis-aligned except one S-jog (two quarter turns); deleted at G2 when v5 owns `ave_s`/`bank_st` |
| sled stand (G1b) | candidate ≈ (6.0, −6.5), layout-checked | — | ≥ 1.5 cells from the sleigh stop (5.0, −5.0), the 짐 싣는 곳 (4.1, −1.8) and the rail; `gb_flag` + a parked `dog_sled` with two panting huskies |
| lockers (G1b) | 서리 광장 south side; 솔방울 아파트 앞길 between `t_apt2` and `t_apt3` | — | candidates; `v43_layout.mjs` decides (not on a lane, not on a door path) |

Addresses (measured curb = nearest lane point to the door): apartments `t_apt1–4` curb → door 3.8–4.7 m; shop households
on `main` 2.0–2.1 m; lots A/B/H 1.2–4.0 m; `t_hall` 0.0, `t_fire` 4.1 m; `t_station` excluded. A 6-stop tour: p10 270 m,
**p50 328 m**, p90 381 m (estimate on node routes). No tour crosses the rail (all addresses are j < 0; asserted by a test).

---

## 5. Systems

### 5.1 AddressBook (`model/addresses.js`, pure)
Per address: `aid`, door px, curb (edge id, dir, s, x, y), `walkM`, `zone` (`van` if a curb ≤ 12 m and a drive route from
r6 exist; `sled` for old-village houses with a village-road point ≤ 6 m from the door, G1b; else `none`), households
(TownSim `c.home`; settlers by house), favourite foods (`c.fav`), a seeded **taste** per household (할머니네, 아이 있는 집,
신혼집, 광부네, 가게 집, 어부네; weights in `tuning.js`). Rebuilt on `RoadNet.onChange`, `built`, `houseDone` (≤ once per
2 s); a curb distance matrix (≤ 16 nodes) is cached with it.

### 5.2 OrderBook (`model/orders.js`, pure, seeded)
- **Rate**: each household orders about once per `everyDays` 1.2 game days (12 min), × the hour curve (07–09 ×1.2, 12–13
  ×1.0, 18–22 ×1.6, 22–02 ×0.8, 02–06 ×0.2, else ×0.9), × snow day 1.3, × the stock factor of its basket. ≈ 60 households
  (*estimate*) → about **one order every 12 s**, waves in the evening.
- **Caps**: `maxOpen` 24 open orders, `perAddressOpen` 2. Hours 07–21 (later orders show `내일 아침 도착` unless 새벽배송).
- **Basket**: one parcel, 1–3 lines, 2–6 items. Item weight = `catalog[item]` × taste × (`favW` 2 if a resident's fav) ×
  stock factor (rack category ≥ 60 % → **오늘의 특가** ×1.5; < 25 % ×0.5; the free 특가 button ×2 for one game day) × 0 if
  paused (§5.3) or if the racks hold fewer than the line + `keepFloor` 4.
- **Placing picks**: `source.pick({ item: n })` removes the items at once, so an order is never unfillable and walk-in
  솔방울 상인 can never sell the same crates. The walk-in buyers are otherwise unchanged.
- **Order shape** = v8 `Order` (`id`, `to: 'home:<aid>'`, `kind 'home'`, `mode 'centre'` for vans, `'sled'` for the dog
  sled, `want`, `got`, `st: pick | pack | ready | gone | done`) + `by` (pid) + `t0`.
- **Box size** from item count: 2–3 → `gb_parcel_s`, 4–5 → `_m`, 6 or a tool → `_l`.

**Catalogue** (existing items only; labels in `strings.js`):

| Item | Shop price | **금방 price** | App name | Note |
|---|---|---|---|---|
| `item_bread` | 7 | 6 | 갓 구운 빵 | |
| `item_meat_cooked` | 12 | 10 | 훈제 고기 한 팩 | stricter guard (§5.3) |
| `item_fish_cooked` | 4 | 3 | 생선구이 | |
| `item_can` | 12 | 10 | 통조림 세트 | |
| `item_plank` | 5 | 4 | DIY 판자 | |
| tools `item_axe`, `_rod`, `_sickle`, `_bow`, `_pickaxe` | 40 | 32 | 새 도끼 … | rare (weight 0.1–0.15), ≤ 1 per order |
| `item_fish_raw` | raw 1 | 2 | 오늘 잡은 생선 | raw surplus |
| `item_meat_raw` | raw 3 | 5 | 집에서 굽는 생고기 | raw surplus |
| `item_log` | raw 1 | 2 | 장작 한 묶음 | raw surplus |
| `item_wheat` | raw 1 | 2 | 밀 한 자루 | raw surplus |
| `item_ore`, `item_ingot` | — | not sold | — | no household use; ore drains through trains and 가공소 2단 (tell the designer) |

Later versions' items (cake, cocoa, toys, furniture…) join automatically through the depot catalogue copy.

### 5.3 Shops first (`model/guard.js`)
| Rule | Detail |
|---|---|
| Source | depot racks only (+ the station dock's surplus crates once backhaul is bought, G1b) |
| Never | shop shelves, 교역소, 큰 식당 pantry, miners' food box, workshop inputs, v3 창고 |
| 가게 먼저 | an item pauses while any shelf selling it is **부족** or **길 막힘** in the v4.2 ledger or under 50 %; resumes after 60 s at 적당/남음. App chip `가게 먼저 · 잠깐 품절` |
| 훈제 고기 | sells only while its shelf has been ≥ 75 % for 60 s |
| Floor | racks keep 4 of each item (the cutaway never looks bare) |

### 5.4 Hub loop (`model/fulfil.js` + `view/GbHub.js`)
Roles on the manifest `staffPoints` (7): clerk = **방금순 팀장** (`gb_dispatcher`, `scan`/talk at the counter), pickers
(`gb_picker`: 쏙쏙이 at opening; +2 with 포장대 2단), packers (`gb_packer`: 척척이; +1 with 포장대 2단), dockhand (`gb_sorter`:
영차). Capacity: picker 4 s per line (incl. the walk), packer 3 s per parcel, dockhand 0.6 s per parcel to the van.

| Beat | Visual (only while revealed) | Sound |
|---|---|---|
| order in | clerk "네~ 금방입니다!"; a slip appears on the back-wall board (code-drawn, ≤ 12: white 고르는 중, gold 포장 중, navy 배달 중) | `sfx_gb_chime` (revealed only) |
| pick | picker walks to the item's `rackSlots` slot, `sort_parcel`; **that stack drops one step** (real stock) | steps |
| belt | `logistics_center_conveyor` plays while packing | belt |
| pack | a box pops (s/m/l), items hop in, `tape_box`, the box becomes `gb_parcel_*` | `sfx_gb_tape` |
| stage | boxes stack on the outbound pile by dock 1; label `출고 대기 6` | `sfx_gb_thump` |
| load | dock 1 opens, van `unload` open, dockhand `carry_parcel` → `rearDoorPoint` | `sfx_gb_scan` per box |

Off screen the same steps run on timers. Shift change at 21:00 at dock 1 ("수고하셨어요!" / "다녀오겠습니다!"); a driver takes a
10 s break by the office-corner heater after every 3 runs.

### 5.5 Vans (`model/dispatch.js`, `model/path.js`, `view/VanDriver.js`)
- **Departure**: at `cap` 8 parcels or when the oldest ready parcel has waited `waitS` 50 s (2 game hours). Tour ≤ 6 stops,
  all parcels of one address in one stop, nearest-neighbour + 2-opt on the cached matrix.
- **States**: `bay` (load 6 s, door 1 open, `unload` patch) → `spurOut` → `drive` → `curb` (dwell = doorstep time) → … →
  `spurIn` → `pivot` (0.5 s) → `reverse` (2.4 m into bay 1, 0.6× speed) → `bay`. **Every tour ends in the bay**; a watchdog
  returns any van unchanged for 60 s (v5 critique C1 lesson).
- **Headings**: drive frames SE/NE (+ mirrors) on axis streets; at a corner the van shows the `gb_van_turn` frame of the
  45° heading for 0.3 s (S, E, N, or W = mirrored E). The roof sign rides `roofSignPoint` + bobPx, never flipped.
- **Speed**: dirt 3.5 · cobble 4.5 · asphalt 5.5 m/s, accel 1.5 m/s². Route weight `main` × 1.3 (fewer walkers on `back`).
- **Manners**: a walker (TownSim bodies, agents, the chief, visitors) in a 0.9 m corridor 0.6–2.5 m ahead → brake to 0;
  after 6 s one `sfx_gb_horn` (≤ once per 6 s); never overlaps anybody. Blocked > 20 s → skip the stop, retry at the end,
  then restock.
- **Apron token**: `lgx_dock` + the apron are one lane shared with the sleigh; the sleigh has priority, vans wait at the
  bank_st corner (35.55, −23.3) with `idle` + exhaust puffs.
- **Far**: analytic `s(t)` on an event heap; a van entering the view (≤ 1,200 px) is materialised from a pool.
- **Count**: 1 at opening, 3 max in v4.3 (`밴 2`, `밴 3`). Drivers 쌩쌩이, 부릉이, 씽씽이 sit at seat 0 (`idle` at `seatsStand`).

### 5.6 Doorstep (`view/Courier.js`)
| Beat | t | Courier | Resident | Sound / FX |
|---|---|---|---|---|
| park | 0 s | stops at the curb, hazards blink (`tailPoints`), `door` patch, steps out at `doorPoints[0]` | — | brakes |
| take | 1 s | to `rearDoorPoint`, `unload` patch, the parcel appears at `boxPoint` | — | `sfx_gb_scan` |
| walk | 2–4 s | `carry_parcel` to the door (≤ 4.7 m measured) | — | snow steps |
| ring | 4.5 s | `ring_doorbell` (impact f2) | — | `sfx_gb_doorbell`, `fx_gb_bell` |
| door | 5.5 s | "택배요~ 금방이에요!" | steps out (fade), faces the courier | door |
| hand | 6.5 s | `hand_parcel` (parcel flies from `handPoint`) | receives | — |
| joy | 7–9 s | `wave` | `happy` + hearts, one line (§7.1) | coin pop `+18` |
| back | 9 s | walks back, drives on | goes in, or unboxes (G1b) | — |

- **Nobody home** (resident out, or 21:00–08:00): the box goes on the step (`gb_parcel_doorstep` f0, `sfx_gb_thump`), the
  courier says "문 앞에 두고 갈게요~"; the app keeps a 128 × 80 render-texture **photo** (last 3 only, not saved). After 4
  game hours outside → f1 (snow cap). Picked up when a household member passes ≤ 200 px, at their evening return or at
  07:00 (never longer than one game day). Cap 16 doorstep boxes, then "옆집에 맡겼어요". 누리 may sniff a box within 300 px.
- **Apartments**: ring at the entrance, the courier goes in (fade) 4 s and comes out empty-handed; 2–3 boxes per block in one walk.
- **Off screen**: dwell = `2 × walkM / 1.4 + doorS 3`; coins, reviews and doorstep boxes appear as if watched.

### 5.7 금방 개썰매 (G1b, old village)
- `dog_sled` (existing art, rider `gb_rider` 뽀득이, pennant `gb_pennant` at `sledPennant`, parcels stacked at `cargoPoint`).
- **Handover**: vans whose tour passes `main`'s west end r0 (8, −5) drop the village parcels at the sled stand (boxes hop
  into the basket, huskies wag). If village parcels wait 180 s and no van passes, one van makes a short trip just for them.
- **Run**: ≤ 4 parcels, village roads (`Roads.route`, nearest drawn heading), stop at the road point nearest each door,
  the rider walks `carry_parcel` the last bit. `sfx_sleigh_bells`, sometimes `sfx_dog_bark`; 누리 may run alongside.
- If G1b slips: village houses are zone `none` and the app says `서리마을은 곧 개썰매로 갈게요`.

### 5.8 Money
- Coins on delivery = Σ 금방 price (§5.2) — `round(shop × priceRate)`, raw at `rawPrice` — paid into the **물류 금고**
  (`DepotSystem.till`), source tag `gb`; 딸랑이's round collects it; 통장 bar **금방**; the morning paper prints yesterday's
  numbers.
- Happiness: `Growth.addSatisfaction(onTime ? 0.95 : 0.8)` with `promiseS` 150 s order → door (gentle, never punishing).
- Typical parcel 15–25 coins; ≈ 80–120 coins/min at the evening peak → **+3–5 %** of a late village's income (*estimate*).

### 5.9 Upgrades (offered one at a time by measured need, as pads at the depot + a card in the app's 기사님 tab)
| Upgrade | Offered when | Cost | Effect |
|---|---|---|---|
| **포장대 2단** | ≥ 6 orders waiting in pick/pack for 60 s | 1,200 | +2 pickers, +1 packer (all 7 staff spots filled) |
| **금방 밴 2** | ≥ 10 ready parcels waiting for 90 s (by day) | 2,500 | +1 van (부릉이) |
| **금방 밴 3** | the same, after van 2 | 4,000 | +1 van (씽씽이) |
| 개썰매 2 (G1b) | ≥ 6 village parcels waiting for 90 s | 1,500 | +1 sled team |
| 광장 보관함 (G1b) | sled + 2 game days, or a village letter | 1,800 + 6 주괴 | one-stop fill for the village; residents pick up |
| 아파트 보관함 (G1b) | van 2 bought | 1,500 + 6 주괴 | one-stop fill for the apartments |
| 새벽배송 (G1b) | 3 game days with ≥ 8 orders waiting overnight | 5,000 | night crew (`gb_night` 반짝이, 살금이) 21:00–07:00 |
| 돌아오는 길 짐 싣기 (G1b) | ≥ 2 vans and station dock surplus ≥ 60 for 120 s | 800 | returning vans bring ≤ 16 surplus crates to the depot (the train still loads first) |
| 오늘의 특가 (tool) | always (app 상품, office 재고 tab's 남음 rows) | free | ×2 orders for one item for one game day |

Anti-softlock: every price is producible by lines the player has; nothing here gates anything else.

### 5.10 Night and 새벽배송 (G1b)
Without it, vans and sleds stop at 21:00 and open orders leave at 07:00. With it, the night crew drives with head/tail
lights and the lit roof sign (`gb_roofsign_*_1`); **no doorbell 21:00–08:00**: every parcel is a doorstep parcel + photo
("문 앞에 두었어요"); couriers walk, never run. 06:00–08:00 residents find boxes: "어? 자는 사이에 금방이 다녀갔네!".

### 5.11 Failure handling (all tested)
| Case | Rule |
|---|---|
| address gone / route lost | parcel returns: `source.restock(got)`, no coins |
| van blocked > 20 s | skip, retry at the end, then restock |
| save mid-tour | `gone` orders saved as `ready`; vans restart from bay 1 (the v4.2 sleigh rule) |
| racks over cap after a restock | `Depot.take` keeps what fits; the rest goes to the dock surplus |
| 금방 closed at night | open orders finish; no new ones (unless 새벽배송) |

---

## 6. UI (phone 390 × 844 CSS; logical = CSS × 720/390)

| Element | Where | Size | Content |
|---|---|---|---|
| **금방 chip** (`ui_gb_chip`, `ui_icon_gb`) | under the 업무 chip: CSS (60, 270) → logical (111, 499); if it collides with the v4 order chip it becomes a gold badge on the 업무 chip | 120 × 44 CSS | `배달 중 3` (or `주문 5`), a gold dot when something is new; tap opens the app |
| toast (`ui_gb_toast`) | top centre under the clock row | ≤ 300 × 48 CSS | `띵동! 새 주문 · 민지네 · 빵 3`; only the first order of a day, named village residents, offered upgrades, the first dawn; else ≤ 1 per 30 s; never over a panel or ceremony |
| order bubble | over the orderer if on screen, 2 s | constant screen size | `ui_emote_bubble` + `ui_icon_gb_cart` + the main item icon; their taste line in the speech bubble |
| **금방 앱** | non-pausing panel 720 × 1100 logical drawn as the chief's phone (`ui_gb_phone`, `ui_gb_header`, mascot runs in) | — | tabs below |

Tabs (`ui_gb_tab`): **오늘** (주문 · 배달 · 줄어든 재고 · 코인; rack bars per category with yesterday's level; up to 4 특가
items; newest review line) · **주문** (cards `ui_gb_card`, ≤ 12 open + 6 done; tracker 주문 → 고르기 → 포장 → 배달 중 → 도착 with
icons **and** words; ETA; doorstep photo `ui_gb_photo`; `따라가기` follows the parcel, any touch on the village hands the
camera back) · **상품** (stock, 금방 price, status chip 특가 / 판매 중 / 가게 먼저 / 품절; 팔기·쉬기 toggle; 특가 button) ·
**기사님** (G1b: vehicles, driver heads, state, offered upgrade cards that hop the camera to the pad) · **후기** (G1b: last 12
reviews, 4–5 stars). The app also opens from a van/sled tap, the `출고 대기` label, the office 재고 row and toasts.

Settings tab 놀이 (after the v4.2 rows): `금방 알림` 켬 / 조용히 / 끔 (default 켬); `금방 문 앞 장면` 켬 / 끔 (default 켬).
Office: 재고 tab row `금방 마켓 · 오늘 주문 42 · 배달 38 · 선반 −214`; 직원 tab lists the crew; 통장 bar 금방. 서리 소식:
`금방, 어제 {n}집에 배달`, `물류창고 선반이 어제보다 {p}% 가벼워졌어요`, ad slot `금방 마켓 · 금방 뭐가 왔지? 금방이 왔지!`.
관망: activity **금방 구경** (score 20, +20 when the first van of the day leaves within 1,500 px); director cuts `첫 배달 출발`,
`새벽배송 출발`, `보관함이 열렸어요`, `고양이가 상자에 쏙` (≤ 1 per 45 s, v4.2 rules).

Tap targets ≥ 44 CSS px, body text ≥ 15 CSS px; statuses never by colour alone. ≈ 70 ko + en string keys (copy book in
`geumbang_plan_player.md` §13 is adopted as written).

---

## 7. Brand

### 7.1 Names and jokes
- **금방** = "right away". The designer's own joke is the core: **"금방 뭐가 왔지?" → "금방이 왔지!"** (kids at the door, the
  newspaper ad). **방금 ↔ 금방**: tagline **"방금 시키면 금방 와요"**. Founder **방금순 팀장** ("네~ 금방입니다!", kids call her 금방
  언니). Late delivery: kid "오늘은 금방이 아니라 조금방이네~" / driver "죄송해요, 눈길이 미끄러워서요!".
- Family: **금방 마켓** (app), **금방물류** (delivery arm), **금방 물류센터** (building), **금방 보관함**, **금방 기사님**.
- Crew (designer question 6): 방금순 팀장 (dispatcher), 쏙쏙이 (picker), 척척이 (packer), 영차 (dockhand), 쌩쌩이 / 부릉이 /
  씽씽이 (drivers; "이름만 쌩쌩, 운전은 천천히"), 뽀득이 (sled rider), 반짝이 / 살금이 (night crew).
- Lines at the door: "방금 시켰는데 벌써요? 진짜 금방이네!", elder "아이고, 무거운 걸 여기까지. 고마워요, 기사님.", snow day
  "눈길을 뚫고 왔네! 대단해요!", chief nearby "촌장님 덕분에 이렇게 편해졌어요!", cat "고양이는 상자가 더 좋대요."

### 7.2 Slogans
Main **"금방 왔지?"** (banner, app splash, ad) + tagline **"방금 시키면 금방 와요"** (app header, opening banner). Spare lines:
"눈길도 금방" (sled), "안전하게, 그래도 금방" (drivers). English uses "Geumbang" as a proper name: "Here already, right?" /
"Order now, here in a moment".

### 7.3 Palette and mark
| Token | Hex | Use |
|---|---|---|
| gold | `#F2B33D` | van body, jackets, vests, header, tape, flag |
| goldDark | `#D9962A` | rims, shading, night crew |
| cream | `#F4EDE0` | roof band, collars, cards, the mark's parcel |
| navy | `#2B4F7E` | lettering (the existing nameplate navy), caps, belt line — accent only, ≤ 15 % of a sprite |
| charcoal | `#3B3F52` | trousers |

**Mark 금방이**: gold disc, goldDark rim, a face-on cream parcel with navy dot eyes, pink cheeks and a small "o" mouth, a
cream 4-point sparkle above; symmetric (mirror-safe), readable at 24 px. The UI mascot is the same parcel running on stubby
legs with a navy scarf (UI only, never mirrored). The art jobs show 3 mark thumbnails (96 and 24 px) to the designer first.

### 7.4 Brand safety (review + `gb_check.py`)
- Never use real names or their service words: 쿠팡, 쿠팡이츠, 배달의민족/배민, 컬리, 요기요, 쓱/SSG, G마켓, 11번가, 네이버, 우체국,
  CJ대한통운, 한진, 롯데택배, Amazon, DHL, FedEx, UPS; 로켓배송/로켓프레시/와우, 샛별배송, 쓱배송, 스마일배송, 오늘도착,
  쿠팡맨/쿠팡친구. Generic words are fine: 택배, 새벽배송, 당일배송, 무료배송, 문 앞 배송.
- Never: a rocket, a rainbow wordmark, mint-and-white riders, purple-and-white, a red/orange swallow or any bird, a brown
  box with an arrow-smile, wings on parcels, lightning, a black cat; no real jingle; no copy of any app's layout.
- **Colour-pair check.** A single honey gold is unavoidably close to UPS gold (ΔE2000 3.9), Yamato yellow (6.1), DHL
  yellow (9.2) and Amazon orange (9.8) (measured), so the rule is on **pairs**. Our dominant pair is **gold + cream**. A
  sprite fails when its two largest colour areas are both within ΔE2000 15 of a brand's primary pair:
  - UPS brown `#351C15` + gold `#FFB500`
  - DHL yellow `#FFCC00` + red `#D40511`
  - Coupang `#E52528` / `#346AFF` + rainbow
  - 배민 mint `#2AC1BC` + white
  - Kurly `#5F0080` + white
  - 우체국 `#E60012` + orange
  - Yamato `#FFC20E` + black
  - IKEA-like `#FFDA1A` + `#0058A3`

  Navy may never be a large block next to gold (navy vs IKEA blue is ΔE 5.7). Gold is never paired with red, brown or
  black.
- No letters on mirrored sprites (vans SW/NW/W, dolls SW/W/NW, pennant); letters live on the nameplates, roof sign,
  banner, logos and runtime UI text only.
- Gold stays exclusive to 금방 in later versions (v8 shop vans are red/blue/mint); avoid mint for anything delivery-branded.

---

## 8. Numbers

### 8.1 `BALANCE.v43.gb` (Korean comments in the real file; `balanceCheck.js` ranges)
```js
gb: {
  gate:   { dayS: 600, fullAt: 0.6, fullForS: 120 },                 // 물류창고 후 하루, 또는 선반 60 % 이상 120초 → 편지
  open:   { coins: 4000, item_plank: 20, item_ingot: 10, time: 15 },  // 금방 개업 값
  hours:  { open: 7, close: 21 },
  orders: { everyDays: 1.2, itemsMin: 2, itemsMax: 6, linesMax: 3, maxOpen: 24, perAddressOpen: 2, keepFloor: 4,
            hot: 0.6, hotMult: 1.5, low: 0.25, lowMult: 0.5, snowMult: 1.3, dealMult: 2, favW: 2,
            hourMult: [[7, 9, 1.2], [12, 13, 1.0], [18, 22, 1.6], [22, 26, 0.8], [26, 30, 0.2]], otherMult: 0.9 },
  catalog:{ item_bread: 1, item_meat_cooked: 0.8, item_fish_cooked: 1, item_can: 0.8, item_plank: 0.5,
            item_fish_raw: 1, item_meat_raw: 1, item_log: 1, item_wheat: 0.6,
            item_axe: 0.1, item_rod: 0.15, item_sickle: 0.1, item_bow: 0.1, item_pickaxe: 0.1 },
  guard:  { shelfMin: 0.5, resumeS: 60, meatShelf: 0.75, meatForS: 60 },
  hub:    { pickLineS: 4, packS: 3, loadEachS: 0.6, pickers: 1, packers: 1 },
  pay:    { priceRate: 0.8, rawPrice: { item_fish_raw: 2, item_meat_raw: 5, item_log: 2, item_wheat: 2 },
            promiseS: 150, happyOnTime: 0.95, happyLate: 0.8 },
  van:    { cap: 8, maxStops: 6, waitS: 50, loadS: 6, doorS: 3, accel: 1.5, speed: { dirt: 3.5, cobble: 4.5, asphalt: 5.5 },
            curbMaxM: 12, yieldAheadM: 2.5, honkAfterS: 6, skipAfterS: 20, mainWeight: 1.3, turnS: 0.3, max: 3,
            breakEvery: 3, breakS: 10, watchdogS: 60 },
  sled:   { cap: 4, speed: 2.6, waitS: 180, doorMaxM: 6 },            // G1b
  door:   { maxDoorstep: 16, snowCapH: 4, pickupPx: 200, unboxChance: 0.3, quietFrom: 21, quietTo: 8, photos: 3 },
  up:     { pack2: 1200, van2: 2500, van3: 4000, sled2: 1500, lockerPlaza: [1800, 6], lockerApt: [1500, 6],
            dawn: 5000, backhaul: 800, packQueue: 6, packS: 60, vanWait: 10, vanS: 90, sledWait: 6, sledS: 90,
            dawnNights: 3, dawnWaiting: 8, backhaulDock: 60, backhaulS: 120 },
  locker: { cap: 12 },
  toast:  { minGapS: 30 },
}
```

### 8.2 Targets (census bot `--patch geumbang`: the 46-min v4.1 save + depot, 30 game min, fixed step; fresh 90-min game)
| Measure | v4.2 final | Gate with 금방 |
|---|---|---|
| any raw pile ≥ 90 % of the time | 97 % | ≤ 85 % (Lv1), ≤ 70 % (all upgrades) |
| depot fill (mean) / full | racks fill, then the dock backs up | ≤ 60 % (Lv1), ≤ 40 % (all); never 100 % for > 2 min |
| shop empty-rates (빵, 훈제 고기, 구운 생선, 판자, 주괴) | v4.2 | ≤ v4.2 + 2 points |
| deliveries per game day | — | 40–80 at opening; 100–150 with all upgrades |
| order → door, median | — | ≤ 75 s (Lv1), ≤ 45 s (3 vans) |
| income vs v4.2 final | +37 % over v4.1 | **≤ +5 %**; if over, lower `priceRate` 0.8 → 0.7 → 0.6 before shipping |
| van blocked time | — | ≤ 5 % of tour time |
| doorstep boxes | — | ≤ 16, none older than 1 game day |
| conservation | — | items (racks + orders + delivered) and coins (delivered = till + collected) across reloads |
| pacing | — | unchanged up to 읍; first-20-min request log byte-identical |

Throughput sanity (*estimates*): demand ≈ 5 orders/min × 4 items ≈ 20 items/min (30 with 특가); a van ≈ 13–17 items/min
(tour ≈ 2.3 min); the sled ≈ 5 items/min; the sleigh brings up to ≈ 48/min. With 3 vans the sleigh, not 금방, limits how
fast the village piles empty: "썰매 한 대 더" (v4.2) and backhaul remain the levers.

---

## 9. Save — slice `geumbang` v1 (cap 1,400 B, no `SAVE_VERSION` bump)
```js
s.geumbang = {
  v: 1, st: 0 | 1 | 2,                 // 0 letter offered · 1 paid, opening · 2 open
  lv: { van: 1..3, pack: 0|1, sled: 0..2, dawn: 0|1, back: 0|1, lockP: 0|1, lockA: 0|1 },
  seq, seed: uint32, day,
  ord:  [[id, to, flags, got, t0] ≤ 24], // to 'a:t_apt2' | 'l:lotH3' | 'h:<houseId>'; flags = st (p|k|r) + mode (c|s);
                                         // got 'bread3,can2' (v8 KEY rule, no item_ prefix); 'gone' saved as 'r'
  door: [[aid, size, ageH] ≤ 16],        // doorstep boxes (G1b lockers: lock: [nPlaza, nApt])
  staff:[uint32 ≤ 12],                    // seeded looks (the v4.2 workers keep theirs)
  days: [[orders, delivered, coins] ≤ 7], tot: [orders, delivered, coins, units],
  rev:  [[tpl, aid, stars] ≤ 12],          // review templates, 4|5
  seen: n                                  // bits: letter, first delivery, app tip, new-card line
}
```
- `sanitizeGeumbang(raw)`: ints clamped, unknown items dropped, unknown addresses restocked on load, arrays capped, JSON
  ≤ 1,400 B (oldest `days`, then `rev` dropped first), never throws. `Save.js` keeps it through a local copy of the keep
  rule (the v4.2 `bank`/`logistics` pattern).
- Main save worst case ≈ 9.4 KB < 10,240 B. A downgrade to v4.2 drops the slice and loses ≤ 24 orders' items (documented).
- G3: `ord` rows convert 1:1 to v8 `logistics.orders` home rows; the slice then keeps only brand state.

---

## 10. Art

### 10.1 New (contract `CONTRACT_GEUMBANG.md`)
| Job | Folder | Keys (summary) |
|---|---|---|
| **vehicles_bld** (AO) | `assets/geumbang/` | `gb_van` (SE/NE rig of `delivery_van_red`; idle, move, door, unload) + `gb_van_turn` (S, E, N; W mirrored) = 8 headings; `gb_roofsign_*`; `gb_nameplate_ko/en`, `seori_nameplate_ko/en`, `gb_banner_*` on the logistics frame; props `gb_sign`, `gb_flag`, `gb_locker_a/b`; items `gb_parcel_s/m/l`, `gb_parcel_doorstep`, `gb_parcel_open`, `gb_parcel_cat`; `gb_pennant_*` + `sledPennant` |
| **people** (AP) | `assets/geumbangfolk/` | parts `top_gb_jacket`, `det_gb_vest`, `hat_gb_cap`, held items; anims `carry_parcel`, `ring_doorbell`, `hand_parcel`, `scan`, `sort_parcel`, `tape_box`; presets `gb_driver`, `gb_picker`, `gb_packer`, `gb_sorter`, `gb_dispatcher`, `gb_rider`, `gb_night` |
| **ui_audio** (AQ, AR) | `assets/ui6/`, `assets/audio8/` | 14 icons, tracker, stars, logos, mascot, phone/header/tab/card/chip/toast/ribbon frames, photo frame, `fx_gb_bell`; 8 sounds (+ variants) in one sprite |

### 10.2 Reused (no new files)
The logistics centre and all its layers, `rackSlots`, `staffPoints`, `dock1` door anim, conveyor; `cardboard_box_*` as the
unpacked box; `dog_sled` (`assets/vehicles`); townfolk bases, `wave`, `happy`, `talk`, `idle`, `walk`; residents' villager
anims for reactions; `pet_cat`; emotes (`ui_emote_bubble`, `emote_heart`); ui5 `ui_chip` rules; sounds `sfx_brakes`,
`sfx_door`, `sfx_truck_engine` (near only), `sfx_sleigh_bells`, `sfx_dog_bark`, `sfx_coin`, `sfx_customer_happy`.

### 10.3 Code stand-ins (CODE-1 runs without new art; each job lands alone)
| Key | Stand-in |
|---|---|
| `gb_van` / `gb_van_turn` | `lgx_delivery_van_blue` (not red, not mint) without corner frames; a code-drawn roof board with the text "금방" |
| `gb_nameplate_*`, `seori_nameplate_*` | runtime text on the manifest `nameBoard` (137 × 43, shear 0.5, `#2B4F7E`) |
| `gb_banner`, `gb_sign`, `gb_flag`, `gb_pennant` | absent |
| `gb_locker_*` | the locker upgrades stay hidden |
| `gb_parcel_*` | `cardboard_box_s/m/l`; doorstep = `cardboard_box_m` + a code ellipse shadow |
| geumbangfolk | townfolk code presets (gold `top_puffer`, navy `hat_cap`, `bot_pants`, `acc_mailbag`, `det_hivis`) via `TF.addPresets`; the parcel rides the v4 head stack; `ring_doorbell`/`hand_parcel` → `talk` |
| ui6 | `ui_icon_depot`, `ui_icon_box`, `ui_icon_delivery`, ui5 `ui_chip`/`ui_letter` frames, text tracker |
| audio8 | `sfx_ticket_chime` (chime/bell), `sfx_coin`, `sfx_car_honk_1`, `sfx_box_drop` if shipped |

### 10.4 Pages and residency
- `gb_van_0` (≤ 8 MiB): class `gbVan`, acquired when a van is materialised ≤ 1,200 px from the view, released after a
  20 s TTL.
- `gb_core` (built from `gb_bld_0` + the resident part of `ui6_gb`, ≤ 4 MiB): area `gb` (depot rect) + wherever a
  doorstep box, locker or sled is in view.
- `ui6` panel frames: only while the app is open.
- `gbf_road_0` (≤ 3.5 MiB): wherever a courier or crew member is drawn.
- `gbf_hub_0` (≤ 2.5 MiB): only while the depot is revealed.
- `veh_dog_sled` (3.4 MiB): near the sled.
- Not loaded in v4.3: `lgx_delivery_van_*` (after the art lands), cityfolk pages.

---

## 11. Budgets

| Budget | Gate |
|---|---|
| **Files** | 15 source (AO 5, AP 5, AQ 3, AR 2); **shipped 10** (atlas JSON is embedded in manifests; the build packs `gb_bld_0` with ui6's resident icons into `gb_core`, and ui6's panel frames ship as their own transient page). Logistics centre re-pack: `lgx_center_a+d` → closed page, `b+c` → inside page, **−2**. `veh_dog_sled.png` +1 (not shipped today). **Net ≤ +9 → ≈ 457** (build gate 480). |
| v5 file headroom | v4.2 already used most of v5's planned reclaim; recommend the lead's lever: pack the small one-sheet fragments (`fx` 10, `emotes` 6, `ui2` 8, `water` 8) via `addSpriteSheetFromAtlas` ≈ −25 files |
| **Textures** | absolute ≤ 455 MiB in every view (v4 probe). Increments: town/district with 3 vans and couriers ≤ +16 MiB; depot revealed ≤ +16 MiB (v4.2 CODE-1 peak 412); old village with the sled ≤ +11 MiB; closed depot with the re-pack ≤ v4.2 (−12.9 MiB inside page) |
| CPU (fixed-step bench) | model ≤ 0.02 ms/tick; VanDriver + yield ≤ 0.02; couriers/hub/bubbles ≤ 0.02; total ≤ 0.06 near, ≤ 0.015 far; AddressBook rebuild ≤ 2 ms, ≤ once per 2 s |
| Display objects | ≤ +120 in the busiest view (per van ≤ 12, courier ≤ 14, bubbles ≤ 2 × 3, hub pile 1, sign 1, nameplate 1, 4 extra staff while revealed); stays under the 1,700 gate |
| Draw calls | ≤ +2 (two new pages in view); NORMAL blend only; Canvas mode works |
| Bytes | ≈ 2.5–3.5 MB added (webp pages, mp3 sprite, manifests last in the publish batch) |
| Save | slice ≤ 1,400 B; main save ≤ 9.4 KB |

---

## 12. Code split (for the GB-CODE builder; shaped so v5's ModuleHost adopts it with a port shim)

### 12.1 Files
| File | Layer | Purpose |
|---|---|---|
| `src/geumbang/model/{addresses,orders,guard,fulfil,dispatch,path,settle,upgrades,GbModel,rng}.js` | pure (no Phaser, no `window`) | §5; `GbModel.tick(dt, T, hour)`; events out; one seeded stream per subsystem (`mulberry32(seed ^ day)`) |
| `src/geumbang/view/{GbHub,Van,VanDriver,Courier,Sled,Doorstep,OrderBubbles,GbChip,GbApp}.js` | Phaser | nameplate swap, dock 1, outbound pile, staff; vans + turn frames + roof sign; doorstep; sled (G1b); bubbles; chip + app |
| `src/geumbang/host.js` | glue | construct model + view; `update(dt)`, `serialize()`, `state()`, `api`, `destroy()` |
| `src/geumbang/ports_v4.js` | glue | the kit-Port subset over v4.2 objects (coins, ui, sound, view, world, roads, town, clock, assets, residency, depot, ledger, growth, letters, news, office, events); replaced by kit `Ports` at v5 |
| `src/geumbang/{tuning,strings,save,index}.js` | data | `BALANCE.v43.gb` defaults, ko + en strings, sanitizer, `MODULE` descriptor |
| `src/data/gbLooks.js` | data | code presets until geumbangfolk lands |

### 12.2 Public API (`gs.v43.gb`, later `gs.later.geumbang`)
`open()`, `isOpen()`, `stats()`, `orders()`, `vans()`, `address(aid)`, `upgrade(kind)`, `deal(item)`, `follow(orderId)`,
`reveal()`.

### 12.3 Frozen at the end of GB-CODE-1 P0
`source.pick/restock`, `AddressBook.list()`, event names (`gb:open`, `gb:order`, `gb:ready`, `gb:dispatch`, `gb:arrive`,
`gb:delivered { id, aid, n, coins, onTime }`, `gb:doorstep`), the save slice, the order shape.

### 12.4 Integration patches (all additive, after v4.2 publishes)
| # | File | Change |
|---|---|---|
| G-P1 | `src/scenes/Game.js` | construct `GeumbangHost` behind its gate after the v4.2 block; `update`, `serialize`, `__FV.gb` hooks |
| G-P2 | `src/systems/depot/DepotSystem.js` | `pick(items) → got`, `restock(items) → refused`, `dockDoor(1, open)`, till source tag |
| G-P3 | `src/entities/DepotBuilding.js` | `setNameplate(key | text | null)` (+ the `seori` plate before opening), outbound pile anchor, `staffSlots(roles)` |
| G-P4 | `src/systems/TownSim.js` | read-only `homes()`; `bodiesNear(x, y, r)` for yield |
| G-P5 | `src/core/Save.js` | `geumbang` keep rule (local copy) |
| G-P6 | `src/core/Residency.js`, `src/core/Assets.js` | area `gb`, class `gbVan`, late fragments `geumbang`, `geumbangfolk`, `ui6`, `audio8` |
| G-P7 | `src/core/Townfolk.js` | merge geumbangfolk (`installGeumbangfolkRuntime` if its report needs one, as officefolk) |
| G-P8 | `src/data/world.js` | `WORLD.v43.gb = { bay: 1, spur: { out, in }, sign, sledStand, lockers, lgxDockTo: −29.6 }` |
| G-P9 | `src/systems/RoadPaint.js` | paint the `lgx_dock` extension and the spur jog |
| G-P10 | `src/data/balance.js`, `balanceCheck.js`, `strings.js` | `BALANCE.v43.gb`, ranges, ≈ 70 ko + en keys |
| G-P11 | `src/scenes/OfficePanel.js`, `src/systems/VillageNews.js`, letters | 재고 row, 통장 source, letter templates, news lines |
| G-P12 | `src/systems/pilot/CameraDirector.js`, `agenda.js` | `gb:arrive` cut candidate, 금방 구경 |
| G-P13 | `src/scenes/UI*.js`, `Settings` | chip, toast, two settings rows |
| G-P14 | `tools/build/pack_pages.py`, `build_artifact.mjs` | logistics re-pack (−2), `gb_core`, new fragments; gate 480 unchanged |
| G-P15 | `tools/test/v42_layout.mjs` (+ new `v43_layout.mjs`) | bay-1 apron y ≤ 3420, sign, sled stand, lockers, spur cells |

### 12.5 Later owners
- VP-G1 (G2) `src/vehicles/model/fleet.js` + `host.js`: `tour(key, stops[{ x, y, dwell, tag }], { from: bay, back: bay })`
  → id; events `veh:tourStop`, `veh:tourDone`; always ends in the bay.
- VP-G2: `role: 'gb'` exempt from `eras.js`; tuning row `gbVan`.
- LP-G1 (G3) `src/city/logistics/model/LgxModel.js`: `order('home:<aid>', items, { mode: 'centre', tag: 'gb', van: 'gb_van' })`.
- v5 GameFeed maps `gb:delivered` → `delivered` (missions "금방 배송 10건", story "주문했더니 진짜 금방 왔어!"); a v5 driving
  mission "금방 아르바이트" (the chief drives one round, par stars, never fails).

---

## 13. Tests and acceptance
**Node** (`tools/test/gb_*.mjs`, new files, fixed step, seeded):
- `gb_model`: determinism (2 game hours), conservation of items and coins, no order to a `none` address, caps, never an
  unfillable order, shops-first guard (paused items never ordered), every van back in its bay (watchdog), throughput ≥ 13
  items/min per van with fake inflow, ≤ 0.02 ms/tick.
- `gb_routes`: every `van` address has a curb ≤ 12 m and a route r6 → curb → r6; spur on painted cells; headings within
  the 8 drawn ones; no rail crossing; bay-1 footprint inside the apron.
- `gb_save`: 300 fuzzed slices (never throws, ≤ 1,400 B); round trip; mid-tour save → no loss, no duplicate; v4.2 saves
  load clean; slice → v8 conversion.
- `gb_parity`: order shape and states = `src/city/logistics/model/orders.js`.

**Browser** (Playwright with `nohup` and `nice -n 10`, one browser at a time; preinstalled Chromium):
- `gb.mjs`: letter → pad → ribbon → first order follow → pick/pack visible → dock 1 opens → van drives (turn frames,
  yields to a placed walker, no overlap) → courier rings at an apartment → coins in the 물류 금고 → app numbers. Camera far:
  analytic timings within 2 % of near. 0 errors.
- `gb_drain.mjs` (census): the §8.2 gates, 금방 on vs off, Lv1 and all upgrades.
- `reqlog_gb.mjs`: first 20 minutes identical to v4.2.
- `texbudget.mjs` + draw calls: the §11 gates in the depot, town and village views.
- `shots_gb.mjs`: hub day and night with both nameplates, van at bay 1, van turning on 중앙로 at zoom 0.6, courier at a
  door, doorstep box with snow cap, sled (G1b), the app tabs. Phones 390 × 844 and 360 × 640, ko + en.

**Soak**: 30 game minutes in 관망 with all upgrades: 0 errors, 0 stuck vans, heap flat, textures within §11.

---

## 14. Build order and cut list

| Job | When | Work | Ends with |
|---|---|---|---|
| **GB-ART vehicles_bld** | now (own paths; Blender queue shared with people) | AO: mark thumbnails → van look-dev SE/NE on snow + cobble → full van + turn → hub layers → props/items/pennant → pack, `gb_check`, Phaser page, report, critique, polish | `assets/geumbang` |
| **GB-ART people** | now (Blender after vehicles_bld's look-dev frees it) | AP: parts + `carry_parcel` look-dev → all anims → pages, compositors, parity, Phaser page, report, critique | `assets/geumbangfolk` |
| **GB-ART ui_audio** | now (no Blender) | AQ + AR | `assets/ui6`, `assets/audio8` |
| GB-CODE-1 P0 | after v4.2 publishes | model, guard, save, AddressBook, spur data, Node tests | `gb_model`, `gb_routes`, `gb_save` green |
| GB-CODE-1 P1 | — | views with stand-ins, letter, app, office/news/관망 hooks | `gb.mjs` green |
| GB-CODE-2 | art landed | swap art, logistics re-pack, G1b, census tuning (`priceRate`), budgets, soak, shots, `docs/기획서_금방마켓.md` update | artifact ≤ 480 files, every v4.2 suite green |

Cut list:
- Corner frames over budget → drop `gb_van_turn` (heading snap as the sleigh).
- G1b late → ship in v4.4 (village shows the "곧 개썰매로" line).
- Cutaway loop too heavy on phones → keep belt, box pop and dock; pickers stand (items hop by tween).
- geumbangfolk late → code presets (§10.3).

---

## 15. Risks
| Risk | Mitigation |
|---|---|
| Bay 1 needs the apron gate raised to 3420 | bay-1-only exception; fallback shared bay 2 (−10 %) |
| Townsfolk walk in the `main` lane → vans stop often | `main` × 1.3, `bodiesNear`, blocked ≤ 5 %; else a TownSim side-step patch |
| Sleigh, not 금방, limits draining the village piles | "썰매 한 대 더" + backhaul; census decides |
| Income inflation (v4.2 already +37 %) | `priceRate` lowered stepwise until ≤ +5 %; designer can trade coins for happiness |
| Motor van before 도시 | VP-G2 exemption; designer question 8 |
| Texture peaks in the town view | residency TTL, turn frames first cut, `gb_core` packing |
| Files near the gate | net ≤ +9 (≈ 457 of 480); the −25 small-sheet pack is the lead's lever for v5–v8 |
| Look-alike brand | §7.4 + mark sign-off by the designer before full renders |
| 금방 depends on the depot | slips with it; nothing else depends on 금방 |

---

## 16. Designer questions (asked in Korean in `docs/기획서_금방마켓.md`; the default ships if no answer)
| # | Question | Default |
|---|---|---|
| 1 | Change the sign to **금방 물류센터** after opening? (before opening it reads 서리 물류창고) | yes |
| 2 | New honey-gold van? | yes |
| 3 | Slogan "금방 왔지?" + tagline "방금 시키면 금방 와요"? | yes |
| 4 | Price rate 0.8, or 0.5 (only clearing stock), or part as happiness? | 0.8, lowered automatically if income > +5 % |
| 5 | Old village: dog sled, or only a plaza locker? | dog sled (+ locker as an upgrade) |
| 6 | Crew names (방금순 팀장, 쏙쏙이, 척척이, 영차, 쌩쌩이, 부릉이, 씽씽이, 뽀득이, 반짝이, 살금이)? | keep |
| 7 | 촌장님 선물하기 / 촌장님 특급 now? | v4.4 |
| 8 | A motor van at 읍, before the city era? | yes, 금방 is the exception |
| 9 | Which of the 3 mark sketches? | the art job's first pick |

---

## 17. Side findings (for the v4.2 and v8 owners; nothing changed here)
1. The v4.2 depot draws the baked "솔방울 물류센터" nameplate while every v4.2 string says 서리 물류창고. v4.3 fixes it with
   `seori_nameplate_ko/en`; v4.2 could already switch to the manifest's `nameBoard` text.
2. All vehicles are SE/NE + flipX mirrors: any future vehicle lettering (bus lines, shop vans) needs camera-facing sprites.
3. The existing mint van reads as 배민 to Korean players; keep mint off anything delivery-branded.
4. v8's shop vans are red/blue/mint; keep gold exclusive to 금방.
5. A single gold colour cannot pass a colour-distance test against UPS/DHL/Yamato; brand checks must be on colour pairs
   (§7.4).
