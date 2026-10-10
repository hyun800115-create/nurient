# logistics_runtime — 솔방울 물류센터 (v8) build report

A standalone, tested module for the v8 logistics centre and its cutaway. Nothing in the game imports it yet. It plugs
in through the ModuleHost and ports from `docs/v5_v8_plan.md` §5. The patches in §11 wire it into the v4 code.

- **Code:** `src/city/logistics/**`. It has a pure model, a host and a Phaser 3.90 view.
- **Tests and lab:** `tools/test/logistics_lab/**`
- **Captures:** `docs/previews/logistics_lab_*` (21 PNG, 5 GIF, `logistics_lab_numbers.json`)
- **Other files:** no other file was created or changed. No `assets/**` file was touched, and Blender was not run.

> **Read first (integration blocker, §3 "Map").** The art puts both dock bays on the centre's **east** face. At the
> plan's `c_logistics`, the docked vans stand at i 55.8–57.3. That is inside the v6 south sea (`i > 55, j < −12`),
> right where the harbour's trawler backs out. The module therefore defaults to **placement A**: the centre moves
> 5.6 cells west, and the police station moves behind it. Placement A passes the plan's layout checker with "no
> problems". It also needs one patch in the incidents module's layout (§11 P19b). The plan's own spot is still
> available as `place: 'plan'`.

---

## 0. 디자이너용 요약 (쉬운 말)

- 해변이 ★2가 되면 **은행장님 편지**가 와요: "가게들이 물건을 더 빨리 받고 싶어해요. 큰 물류센터를 지으면 어떨까요?" 새 시가지에 공사 자리가 열려요. 짓는 데 50,000 코인, 판자 150, 주괴 80, 30초가 들어요.
- 문을 여는 날 솔방울 마을이 **축하 선물**을 보내요. 빵, 판자, 주괴, 통조림, 도끼, 생선구이가 들어 있어서 선반이 비어 있지 않아요.
- 건물을 **누르면**(PC에서는 마우스를 올리면) 지붕과 벽이 0.35초 동안 스르르 투명해지고 안이 보여요. 처음에는 지붕 위에 노란 화살표가 통통 튀어요. 처음 안을 보면 "선반 위 물건 높이가 진짜 재고예요"라고 알려 줘요. 촌장님이 정문 앞에 서도 안이 보여요.
- **선반 높이가 진짜 재고예요.** 빵이 많으면 빵 상자가 높이 쌓이고, 다 팔리면 선반이 비어요. 아래 칸과 앞줄부터 채워져서 한눈에 읽혀요.
- **안에서 일하는 사람들:** 고르는 직원 3명, 포장하는 직원 2명, 정산 창구 직원, 하역장 직원이 있어요. 노란 **지게차**는 기사님을 태우고 한 바퀴씩 돌아요. 선반 → 하역장(밴에 싣기) → 하역장(트럭에서 내리기) → 공구 선반 순서예요. 후진할 때는 삐삐삐 소리가 나요. 할 일이 없으면 "재고 정리" 한 바퀴를 돌아요.
- **가게 주인들:** 선반이 비어 가면 가게가 물류센터에 주문해요. 물건이 준비되면 주인이 **밴을 몰고 오거나**(큰 주문), **걸어서**(작은 주문, 상자를 안고 가요) 와요. 창구에 줄을 서고 정산하면 **"쾅!"** 도장 소리가 나요. 동전이 금고로 톡톡 튀고 "고마워요!" 말풍선이 떠요.
- **돈:** 정산한 돈(도매가의 115%)은 정문 앞 **물류 금고**에 쌓여요. 15초마다 촌장님 지갑으로 들어와요. 지붕 위 칩에 "오늘 배송 수 · 금고 돈"이 보여요.
- **하역장 두 칸:** 밴과 트럭이 길에서 하역장 길로 꺾어 들어와 **후진으로** 대요. 셔터 문이 올라가요. 하역장 길에는 한 번에 한 대만 들어가요.
- **가구 공방 / 가전 공장:** 마을 M 터에 지어요. 판자 3개가 가구 1개(의자·탁자·소파·침대·옷장), 주괴 3개가 가전 1개(라디오·난로·세탁기·냉장고·TV)가 돼요. 쌓이면 물류센터 밴이 가지러 가요.
- **살림살이(집 3단계):** 물류센터가 집에 가구 3개와 가전 1개를 배달하면 그 집 행복이 +2가 돼요(모두 합쳐 최대 +16). "새 소파가 왔다!" 같은 일기 한 줄도 떠요. 이사 온 집에는 가구 2개와 가전 1개를 보내요.
- 밤 10시 반에 직원들이 퇴근해요. 하역장에 남은 차는 지게차가 마저 일을 끝내요.
- 숫자는 모두 `src/city/logistics/tuning.js` 한 곳에 한국어 설명과 함께 있어요. 숫자만 고치면 돼요.

---

## 1. What it does

| Area | Behaviour |
|---|---|
| The call | When the gate opens (beach ★2: `gs.later.beach.star() >= 2`), the bank manager's letter toast appears (5.2 s). The site `lgx_centre` is offered once (`ports.sites.offer`) at 50,000 coins + 150 planks + 80 ingots, 30 s. The host emits `lgx:call`. |
| Opening | `onFeed({ t: 'built', siteId: 'lgx_centre' })` opens the centre. A banner reads **솔방울 물류센터가 문을 열었어요!** / 가게 주인들이 물건을 받아 가고 정산해요. The opening gift goes on the racks: bread 24, planks 30, ingots 12, cans 16, axes 3, grilled fish 20. Then the tap / hover hint toast, a bobbing `ui_arrow` over the roof, and `lgx:open`. |
| Cutaway | Layers come from `logistics_center` in manifest `layerOrder` at building depth + `depthOffset`. A tap inside `revealPoly` (< 14 px, < 350 ms, so the joystick is untouched) fades the shell, nameplate and dock leaves over `fadeMs` 350 and fades in `shadow_open`. On a PC the reveal holds while the mouse hovers, with a 0.35 s grace; leaving the canvas also counts (`gameout`). The chief within 90 px of the door also opens it, and it closes at 170 px. The inside layers, conveyor and lamp exist only while revealed. |
| Racks | Real stock in 6 categories (materials, food, goods, tools, furniture, appliances). Each category has a cap (160 / 160 / 120 / 60 / 40 / 30); level = stock / cap. `rackFill` shares a category's 30 `rackSlots` among its rack art keys by largest remainder. Copies are filled level by level, then copy by copy, then front cells first, up to `round(level × units)`. Nothing is drawn beyond `itemFit` (tested). |
| Floor | **Pickers** (3) take items for the oldest pickable order at 0.9 s per item per picker. The **conveyor** runs while packing (2.2 s + 0.18 s per item). The **forklift** drives the manifest's 10-node loop: N0 pick at the food rack → spur to bay 2 (load the outbound pallet into the docked van) → spur to bay 1 (take a pallet off the docked truck) → N8 put away at the tools rack. Pallets hold 20 items. It reverses at 0.6× speed with `sfx_forklift_beep` every 1.26 s. After 5 s idle in a quiet moment it does a cosmetic 재고 정리 lap. The **clerk** stamps at 1.5 s of a 3 s settlement. The **dock hand** works between the bays. Staff are on duty 05:30–22:30. |
| Orders | Every 3 s (working hours) the centre polls the shops' shelves (`ports.shops.list()`). A shop needing ≥ 6 items (of what the racks can give) gets an order of up to 20 items. Orders of ≤ 6 items are **walk-ins**: the owner walks the sidewalk to the queue, settles, and carries a parcel (`carry_box`). Larger orders are **van** orders: the owner drives a delivery van (red / blue / mint by shop), hops out at the kerb by the door, queues and settles while the forklift loads the van, then gets picked up at the kerb on the way out. Nobody waits for goods: owners set off only when the order is packed. At most 12 orders are open; an order that waits 75 s for stock sends what it has, and an empty one cancels after 900 s. |
| Queue | Seven spots from the manifest (`customerPoints`): 4 inside the front band, 3 outside. The door corridor is between them. |
| Settlement | Shop and story orders pay **price × 0.7 × 1.15** (wholesale + 15 %), rounded once per order, into the 물류 금고 till. Home orders pay the price on delivery. The till pad (`ui_pad_cash` with a coin pile) empties into the coin counter every 15 s (`ports.coins.add`). A chip over the roof shows today's deliveries and the till. |
| Docks | Bay 1 (front) takes inbound trucks; bay 2 (back) takes outbound vans. A bay is borrowed when the other kind is not waiting. Vehicles come on at the stage edge on `lgx_st`, take the east lane, turn into the dock lane, stop beside the bay and back in. The roller door opens in 6 frames. The dock lane holds **one vehicle at a time** (zone mutex); on the street they follow 260 px apart. Inbound back-pressure: at most 3 trucks waiting. Headlamps glow at night. |
| Inbound | `veh:freight { to: 'lgx' }` (vehicles module / freight yard) becomes a `truck_cargo` at bay 1. Porters and the chief can use the **receiving pad** (`api.receive`, a v4 Logistics sink, §11). The producers' pickup van also comes in this way. Everything inbound counts against the caps, including goods still on their way. |
| Chains | 가구 공방 (planks 3 → chair / table / sofa / bed / wardrobe, 6 s) and 가전 공장 (ingots 3 → radio / stove / washer / fridge / TV, 8 s). These are village work buildings on M plots (Civic, P27). The next piece is the least stocked of the pipeline (racks + in transit), so a chain never makes only chairs. The output pile holds 8. At 7 pieces, or after 75 s idle, the centre's mint van fetches one shared round from all piles, taking only what the racks have room for; the rest waits on the pad. Producers work even before the centre opens, and their pile waits. The operator is a cityfolk doll (push / sweep), the station plays `anims.work`, and `fx_smoke_puff` rises from the chimney. |
| 살림살이 | Every 40 s the centre picks up to 2 homes without it (≥ level 2, or no level) and packs 3 furniture + 1 appliance each (sofa, bed, table first; fridge, stove first). The centre's van delivers them off stage. Each home gets level 3 (`lgx:house`) and happiness +2 (`api.happyBonus()`, capped at 16, at most 32 homes). One toast per round: "새 살림이 왔어요! 행복 +n" plus a diary line ("새 소파가 왔다!", …). **Move-ins** (`story:move in`) get 2 furniture + 1 appliance. |
| Story pick-ups | `story:shop { op: 'pickup', shop, owner, items, qty }` stages up to 3 at a time, with 6 more queued. The qty is spread over the requested items the racks hold, and the owner's look follows `ports.lookOf(owner)`. If the racks have none of the items, `lgx:storyMiss`. |
| Sound | `amb_warehouse` at 0.35 when near and 0.85 with the roof off. `sfx_stamp`, `sfx_coin_count`, `sfx_forklift_beep`, `sfx_box_drop_3` (rack drop) and `sfx_box_drop` (producer pile). |
| Far away | Beyond `nearPx − 700` px from the camera everything is hidden and only the model runs. A tap-reveal closes quietly after 5 s far, so the inside pages can leave memory. The producers keep their own on-screen check. |

Strings are Korean and English (`src/city/logistics/strings.js`, `lt(lang, key, vars)`). The English capture is
`logistics_lab_english.png`.

---

## 2. Files

| File | Lines | What |
|---|---:|---|
| `src/city/logistics/index.js` | 36 | `LOGISTICS_MODULE` {id, version, saveKey, capBytes, needs, gate, prefetch, create, sanitize, previews.open} |
| `src/city/logistics/host.js` | 272 | `LogisticsHost`: ports, call, site, feed, collect, toasts, `api` (= `gs.later.logistics`), headless in Node |
| `src/city/logistics/layout.js` | 172 | Placements (`PLACES.A` default, `PLACES.plan`), `layoutFor(place)`: streets (P19 format), lanes, stage, till, walks, vehicle routes, `makeGeo(man)` |
| `src/city/logistics/tuning.js` | 78 | Every number, with Korean comments → `BALANCE.v8.logistics` (P20) |
| `src/city/logistics/save.js` | 92 | `LOGISTICS_SLICE` (`logistics` v1, 2 KB), `sanitizeLogistics` (never throws), `fitLogistics` |
| `src/city/logistics/strings.js` | 52 | Korean + English strings, `lt`, `ltPick`, `catName` |
| `src/city/logistics/fragments.js` | 13 | Art and sound keys per need (shell, inside, vehicles, producers, cityfolk pages, audio6) |
| `src/city/logistics/model/LgxModel.js` | 673 | The model façade: day, polling, orders, prep, settlement, deliveries, homes, chains, events, `info()` for the view, save |
| `src/city/logistics/model/floor.js` | 490 | Forklift, Docks (bays, doors, routes, zone, car following), Queue (spots, walk-ins, kerb), Staff beats |
| `src/city/logistics/model/stock.js` | 137 | `Stock` (caps, room counting in-transit goods), `rackFill`, `rackUnits` |
| `src/city/logistics/model/orders.js` | 80 | `Order`, `Shipment`, `orderValue` |
| `src/city/logistics/model/chains.js` | 55 | `Producer` (3 → 1, pile, pickup due, `take(fits)`, refund in save) |
| `src/city/logistics/model/catalog.js` | 48 | Item → rack category + rack art key; furniture / appliance lists |
| `src/city/logistics/model/geom.js` | 118 | `Mover` (legs, dwell, reverse, stop-at, follow distance), `walkLegs`, `driveLegs`, `dir8` |
| `src/city/logistics/model/rng.js` | 24 | mulberry32 + `stream(seed, name)` |
| `src/city/logistics/view/LgxView.js` | 246 | Orchestrator: reveal + input, near / far, hint, events, ambience, Residency hints |
| `src/city/logistics/view/Centre.js` | 113 | Cutaway layers, patches, nameplate, doors, conveyor, lamp, outdoor props |
| `src/city/logistics/view/Racks.js` | 57 | Pooled stock images from `rackFill` |
| `src/city/logistics/view/Forklift.js` | 35 | Forklift (+ loaded variant, lift frames, beeps) with its driver doll |
| `src/city/logistics/view/Docks.js` | 53 | Vans and trucks (VehicleSprite), drivers, owner passenger, headlamps |
| `src/city/logistics/view/VehicleSprite.js` | 82 | Body + shadow + seats + lift frames for manifest characters |
| `src/city/logistics/view/People.js` | 62 | Staff and owner dolls (front band inside, outside depth rule) |
| `src/city/logistics/view/Settlement.js` | 129 | Till pad + coin pile, roof chip (counter-scaled), stamp "쾅!", coins, thanks bubble |
| `src/city/logistics/view/Producers.js` | 112 | Station sprite (work anim), operator doll, input stack, output pile, smoke, pickup hop |
| `src/city/logistics/view/art.js` | 83 | Frame lookup, shadow / glow textures, outside-depth rule, `inPoly`, `dirOf` |
| `tools/test/logistics_lab/logistics.test.mjs` | 490 | 18 Node tests (§9) |
| `tools/test/logistics_lab/purity.test.mjs` | 55 | 3 layer-rule tests |
| `tools/test/logistics_lab/fake_env.mjs` | 72 | Manifest from disk (read only), `makeEnv` (model + fake town), `makeHost` (headless host + fake ports) |
| `tools/test/logistics_lab/sim_env.js` | 64 | The fake town: 4 v4 shops selling, 12 homes, freight yard trucks, porters feeding producers |
| `tools/test/logistics_lab/lab.html`, `lab.js`, `lab_world.js` | 520 | The Phaser lab: v4 scale rules, real art, v4 `RoadPaint` streets, the south sea as a flat paint, pines, cityfolk dolls, `DayClock`, `Effects`, a HUD stand-in |
| `tools/test/logistics_lab/run_lab.mjs` | 392 | Playwright runner: scenarios, stills, GIFs, numbers |

Imports: the model and data files import only each other. The views import `src/core/Assets.js` (as a library) and
their own files. The host imports its own model and data. This is checked by `purity.test.mjs`.

---

## 3. Numbers that drive it (`tuning.js` → `BALANCE.v8.logistics`)

| Key | Value | Meaning |
|---|---|---|
| `centre` | 50,000 coins + 150 planks + 80 ingots, 30 s | Site cost (plan §8 row 1) |
| `openGift` | bread 24, plank 30, ingot 12, can 16, axe 3, grilled fish 20 | The opening day's racks |
| `wholesaleRate`, `settleBonus`, `homeRate` | 0.7, 0.15, 1.0 | Settlement = price × 0.7 × 1.15; homes pay the price |
| `collectEvery` | 15 s | Till → coin counter |
| `hours` | 05:30–22:30 | Staff on duty, polling, new vehicles |
| `cap` | materials 160, food 160, goods 120, tools 60, furniture 40, appliances 30 | Full racks per category |
| `pallet`, `forklift` | 20; speed 125 px/s, reverse 0.6×, lift 0.6 s, check 0.5 s, tidy lap after 5 s | The forklift |
| `pickS`, `packBase`, `packPer` | 0.9 s, 2.2 s, 0.18 s | Pickers and packers |
| `settleS`, `stampAt` | 3.0 s, 1.5 s | The counter |
| `orders` | poll 3 s, minNeed 6, maxItems 20, walkInMax 6, max 12, waitStock 75 s, giveUp 900 s | Shop orders |
| `van`, `truck` | road 10–18 s / 12–20 s, 140 px/s, reverse 0.8×, turn 0.35 s | Vehicles |
| `inbound.maxWaiting` | 3 | Back-pressure for the yard and the producers |
| `furniture`, `appliance` | 9,000 + 30 planks / 12,000 + 30 ingots, 10 s; 3 → 1 in 6 s / 8 s; pile 8, pickup at 7 or after 75 s | Chains (plan §8 rows 2–3) |
| `prices` | chair 25, table 40, sofa 70, bed 80, wardrobe 90, radio 50, stove 90, washer 110, fridge 120, TV 140 | The new items |
| `houseLv3` | furniture 3 + appliance 1, happy +2 (cap 16), every 40 s, 2 rounds, 2 homes per van, ≤ 32 homes | 살림살이 |
| `moveIn` | furniture 2 + appliance 1 | New households |
| `days` | 10 | Delivery history kept (the 큰 도시 bar reads today) |

### Map and plan changes (vs `docs/v5_v8_plan.md` §4.5 / §6.6)

All of these were checked with a copy of the plan's checker (`scratchpad/later_tech/layout_v5v8.py` → scratch copies
`layout_variantA.py`, `layout_plan_apron.py`). The real tree was not touched.

1. **The dock apron is in the south sea at the plan's spot (blocker).** The manifest's `dockPoints` are on the east face (i 53.98). Its `dockVehiclePoints` put a docked van at i 55.78 and a truck at i 56.17; a 5.5 m truck's nose reaches E + 4.14 = 58.1. The v6 south sea is `i > 55, j < −12` (plan §4.1 "basin west wall"). The harbour's trawler leaves berth W along i 56.75 to its lane at j −30 (`src/harbor/layout.js` `BERTHS.W`, `LANES.trawler`). With the dock apron as an object, the plan checker reports `c_lgx_apron in south sea` at the plan's spot. A narrow land strip for the docks is not possible without moving the harbour's trawler route.
2. **Placement A (the default, `PLACES.A`).** West wall at i 40.6 (0.6 cells east of `ave_c`), front at j −33.8, so the anchor is L(44.49, −30.97) = (3985, 3730). The dock lane `lgx_dock` runs at i 52.53–54.53, j −36.3…−28.9: on the land between the bays and the quay wall, with its east kerb 0.47 cells inside the wall. Docked trucks (to E + 4.14 = 52.52) leave the lane free. The **police station** (incidents module) moves from `c_police` (40.6–45.69) to i 48.62–53.71, j −28.6…−25.35, i.e. L(51.17, −26.97), behind the centre. Its front faces the dock lane's north end, and its car leaves by the dock lane (`api.laneBusy()` tells it to wait while a van is turning). Checker result: **no problems**.
3. **`lgx_st` 1.9 cells south of the plan's.** It runs j −38.6…−35.9 (the plan has −36…−34) and i 37.5 → the dock lane's east kerb. At the plan's street, the front door, its mat and the 3 outside queue spots (`customerPoints` 4–6, art data at j −34.2…−35.7) were in a traffic lane. The 3 m forecourt of the art now sits between the façade and the sidewalk. `ave_c` runs down to the moved street (j −35.9).
4. **Producers are not near the centre.** They are buildable M-plot buildings (plan §4.7). The plan's M plots are in the old village (`se_m1` at x 2700, y 2640 and others), about 2,000 px from the centre, so their pickup is **off stage**: the van takes the pile at once and backs into bay 1 `roadS` later. A producer built beside `lgx_st` between the stage edge and the dock lane would get a kerb stop on the van's way in (`host.stageCurb`, tested). Kerb stops west of the stage edge are refused, because the van would have to drive the wrong way.
5. `PLACES.plan` still works (`opts.place: 'plan'`, tested in the stress test) but needs a dock lane at i 58.6–60.6 in the sea.

---

## 4. Architecture

```
game (v4 + kit)                         src/city/logistics
──────────────                          ──────────────────
ModuleHost / Game.js  ──ports──▶  LogisticsHost (host.js) ──▶ LgxModel (pure, seeded)
GameFeed events      ──onFeed──▶        │  api = gs.later.logistics       │  drain(): lgx:* events
                     ◀──emit────        │                                 │  drainView(): stamp, door, fork …
                                        └──▶ LgxView (Phaser) ◀── info(), rackFill()
```

- **LgxModel** is pure and deterministic: no Phaser, window, timers or `Math.random`. It uses named seeded streams (`orders`, `road`, `pick`, `homes`, `staff:k`), and its geometry comes from the manifest via `layoutFor(place).makeGeo(man)`. `update(dt, T, env)` takes `env = { shops, homes }`, a 1 s snapshot of the ports. It runs at any dt; the tests use 1/30.
- **LogisticsHost** creates the model as soon as the logistics manifest is there (`opts.man` or `ports.assets.manifest('logistics')`). It runs headless without a View. It offers the site, feeds the model, drains events to `ports.emit`, empties the till, and says the little words.
- **LgxView** reads `model.info()` and `rackFill()` every frame. It plays view events (stamp, doors, fork drops, pickups) and draws nothing when far.

### Ports (what the module needs from the game)

All are optional except `clock.T`. Missing ports just switch a feature off.

| Port | Used for |
|---|---|
| `clock.T()`, `clock.dark()` | Game time (600 s days, 25 s hours); night alpha for headlamps |
| `lang()` | `'ko'` / `'en'` |
| `coins.add(n, x, y, fly, 'lgx')` | Till → coin counter |
| `ui.toast(m, hold)`, `ui.banner(m, sub)` | Letter, opening, hints, first settlement, 살림살이, move-in |
| `sound.at(k, x, y, {volume})` / `sound.play(k, o)`, `sound.ambience(k, v)` | sfx, `amb_warehouse` |
| `sites.offer(def)` | `{ id: 'lgx_centre', key: 'logistics_center', x, y, at: {i, j}, cost: {coins, item_plank, item_ingot}, time, name, module: 'logistics' }` |
| `world.scene` | The Phaser scene for the view |
| `chief.x()`, `chief.y()` | Door reveal |
| `view.rect()`, `view.zoom()`, `view.focus(x, y, ms)`, `view.onScreen(x, y, m)` | Near / far, chip scale (zoom without the render scale `View.k`), designer preview, coin fly |
| `fx.sheet(k, x, y, o)`, `fx.floatText(x, y, t, color, size)` | Smoke puffs, "+644" |
| `dolls.make(look)` | Paper-doll rigs `{ play(anim, dir), place(x, y, depth, alpha), visible(on), update(dt), setLook(look), destroy() }` from cityfolk presets (`warehouse_worker`, `forklift_driver`, `delivery_driver`, `bank_teller`, `construction_worker`) or seeds |
| `assets.manifest('logistics')`, `assets.want(keys)` | The manifest; Residency hints (`FRAGMENTS`) |
| `shops.list()` | `[{ id, name, sells, need: { item: n }, look }]` (the shelves that want restocking) |
| `shops.deliver(id, items)` | Goods onto a shop's shelf → `{ item: accepted }`; the rest comes back to the racks |
| `homes.list()` | `[{ id, level?, name? }]` |
| `emit(ev)` | Module events onto the GameFeed |
| `say(x, y, text, sec)` (optional) | Thank-you bubble; otherwise the view draws its own |
| `lookOf(owner)`, `homeOf(who)` (optional) | Story residents' looks and homes |
| `place` (optional) | `'A'` (default) or `'plan'` |
| `balance` (optional) | The game's `BALANCE` (its `v8.logistics` overrides `tuning.js`) |

---

## 5. Public API (`gs.later.logistics` = `host.api`)

| Call | Returns / does |
|---|---|
| `open()` | The centre is open |
| `stock(catOrItem)` | Items of a rack category (`materials` … `appliances`) or of one item id |
| `stockItems()`, `level(cat)`, `room(item)` | Snapshot; 0–1 rack level; how many more fit (counting in-transit goods) |
| `order(shopId, items, o)` | An outbound order for a v4 shop (the centre also polls shops itself) → id or `null` |
| `serves(shopId, type)` | The centre looks after this shelf item, i.e. an open order wants it or the racks hold some (P32: porters leave it alone) |
| `settle(id)` | Settle an order once its goods are picked (pack / ready / gone) → coins. Mission A22: the chief carries a receipt. |
| `deliveriesToday()`, `deliveries()` | Today's delivered items; the last 10 days |
| `reveal(on)`, `revealed()` | See-through on / off |
| `receive(item, n)` | Porters / chief at the receiving pad → taken |
| `inbound(items, from)` | A truck with goods → accepted `{ item: n }` (`{}` when 3 are already waiting) |
| `addProducer(kind, id, x, y, { station })` | A workshop / factory was built (P27). `station: false` when the game draws the building itself. |
| `feedProducer(id, n)`, `producers()` | Planks / ingots onto its input pad (max 30); their state |
| `happyBonus()`, `homesFurnished()` | Happiness the 살림살이 homes add (≤ 16); their ids |
| `laneBusy()` | A vehicle is turning in the dock lane |
| `places()` | `{ logistics_office, receive, till, centre }` world px (missions `p:logistics_office`) |
| `state()` | Everything for panels and tests |
| `LOGISTICS_MODULE.previews.open(host)` | Designer preview 물류 센터 열기: opens it now, reveals, focuses |

### Events out (`ports.emit`)

| Event | Payload | Who listens |
|---|---|---|
| `lgx:call` | — | Tutorial / story (the letter) |
| `lgx:open` | — | Missions, story, newspaper |
| `lgx:order` | `{ id, to, kind: shop/story/home, mode: van/walk/centre, n }` | Panels |
| `lgx:inbound` | `{ from, n, items, id? }` | Vehicles (freight), panels |
| `lgx:dispatch` | `{ van, to, id, kind }` (a van left the stage with an order) | Vehicles (may draw it through town) |
| `lgx:settle` | `{ id, coins, shop, n, kind }` | Missions (`count 1`), bank, rank |
| `lgx:delivered` | `{ id, to, items, n, kind, tag: lv3/movein }` | Story (diary), newspaper |
| `lgx:house` | `{ id, level: 3, happy }` | Growth happiness, story |
| `lgx:produced` | `{ item, kind: furniture/appliance, n: 1, producer }` | Missions (`lgx:produced {kind, n}`) |
| `lgx:producer` | `{ id, kind }` | Panels |
| `lgx:stock` | `{ cat, n, level }` when a category's level crosses a tenth | Missions / UI |
| `lgx:day` | `{ day, yesterday }` | Rank bar, newspaper |
| `lgx:cancel` | `{ id, to }` | — |
| `lgx:storyMiss` | `{ shop }` (a story pick-up the racks cannot serve) | Story |
| `lgx:reveal` | `{ on, by: tap/hover/chief/api/preview }` | Tutorial |

### Events in (`host.onFeed(ev)`)

| Event | Effect |
|---|---|
| `{ t: 'built', siteId: 'lgx_centre' }` | Opens the centre |
| `{ t: 'built', key: 'furniture_workshop' / 'appliance_factory', siteId, x, y }` | `addProducer` |
| `{ t: 'veh:freight', to: 'lgx', items, from, reply }` | Inbound truck; `reply(accepted)` |
| `{ t: 'delivered', pad: 'lgx_in', item, n }` | Receiving pad |
| `{ t: 'delivered', pad: 'lgx_prod:<id>', n }` | A producer's input pad |
| `{ t: 'story:shop', op: 'pickup', shop, owner, items, qty }` | Story pick-up |
| `{ t: 'story:move', op: 'in', home / house / who, name }` | Move-in furniture |
| `{ t: 'tap', x, y }` | Reveal toggle (when the game owns the pointer) |

---

## 6. Save slice

`logistics`, version 1, cap **2,048 B** (`LOGISTICS_SLICE`):

```js
{ v: 1, open, gift, tut, day, seq,
  stock: { bread: 40, sofa: 3, … },                 // racks + goods on their way in (a reload puts them on the racks)
  orders: [≤ 12 [id, to, flags, got, missing]],     // flags = kind s|y|h + mode v|w|c + st p|k|r|g [+ s settled] [+ 3 lv3 | m move-in]
  cash,                                             // the till not yet collected
  chains: [{ id, k: 'f'|'a', in, out: ['sofa', …], m, r }],   // a piece in the making is refunded to `in`
  lv3: [≤ 32 home ids], days: [≤ 10], made: [furniture, appliance], tot: [settled, coins, deliveries] }
```

- Vehicles, the queue, the forklift lap and the staff are not saved. On reload, owners of ready orders set off again, a pallet on the forks is back with its order, and goods in trucks are on the racks.
- `sanitizeLogistics(raw)` never throws: it checks types, ids (`/^[A-Za-z0-9_:.-]{1,40}$/`), flags (`/^[syh][vwc][pkrg]s?[3m]?$/`), `to` kinds and output items, and clamps numbers. `fitLogistics` keeps it ≤ 2 KB by returning the oldest unsettled orders' goods to the racks, then shortening the day history and the lv3 list.
- Measured: **925–937 B** for a busy centre after 10 game days. The worst-case slice (12 orders × 24 items, 6 producers, 40 homes) is fitted to ≤ 2,048 B without losing an item (tested).
- `serialize(restore(slice)) === slice`, and custody is equal before and after a reload (tested).

---

## 7. Measured numbers

**Model (Node 22, `nice -n 15`, 4 shared cores; `logistics.test.mjs`):**

| | Value |
|---|---|
| Per 30 Hz tick, busy centre + both producers (18,000 ticks) | **avg 0.0034–0.0052 ms**, p99 0.013–0.026 ms, max 1.2–2.4 ms (GC). Budget 0.08 ms. |
| 10-day soak (seed 11, placement A) | Deliveries per day 175, 178, 199, 204, 194, 190, 195, 199. Max docked 39 s, max on stage 64 s, max owner on stage 46 s. ≈ 90 ms of CPU per game day. |
| Forklift | ≈ 83 laps per 1,200 s (19 of them tidy laps), pallets out / in ≈ 1 : 1.3 |
| Save slice | 925–937 B |

**Lab (Chromium + SwiftShader, `nice -n 15`; `docs/previews/logistics_lab_numbers.json`):**

| Scenario | Model ms/tick (avg / p95) | View ms/frame | Draw calls | Display objects (visible) | Dolls |
|---|---|---|---:|---|---:|
| smoke (roof off, zoom 0.7) | 0.022 / 0.1 | 0.72 | 6 | 479 (429) | 16 |
| closed (roof on, zoom 0.8) | 0.029 / 0.1 | 0.74 | 6 | 456 (411) | 15 |
| stock 100 % (zoom 1.2) | 0.040 / 0.1 | 0.23 | 4 | 355 (344) | 8 |
| settle (stamp, zoom 1.2) | 0.027 / 0.1 | 0.27 | 5 | 472 (416) | 15 |
| zoom 1.2 | 0.036 / 0.1 | 0.68 | 5 | 451 (377) | 14 |
| desktop 1280 × 800 | 0.013 / 0.1 | 0.64 | 8 | 455 (412) | 14 |
| night 20:48 | 0.022 / 0.1 | 0.91 | 7 | 413 (358) | 13 |
| producers only (centre far) | 0.021 / 0.1 | 0.13 | 3 | 184 (116) | 3 |

The browser timer has 0.1 ms resolution, so p95 reads 0.1. The browser's max tick (up to 22 ms once) is screenshot
and GC stalls under SwiftShader at nice 15; Node's max is 1.2–2.4 ms. Draw calls are counted with a WebGL
`drawElements` / `drawArrays` probe over 20 frames, lab HUD included.

**Texture memory (RGBA, MiB) the module brings:**

| Group | MiB | Resident when |
|---|---:|---|
| `lgx_center_a` + `lgx_center_d` (shell, nameplates, dock leaves, apron, outdoor props) + `lgx_items` | 6.6 + 5.2 + 0.3 = 12.1 | The centre near the camera |
| `lgx_center_b` + `lgx_center_c` (interior, racks, conveyor, lamp, back, floor, props) | 4.9 + 6.7 = 11.6 | Roof off |
| 3 delivery vans + 2 forklifts | 14.5 + 7.5 = 22.0 | Vehicles on the stage (the forklift with the inside) |
| `veh_truck_cargo` (vehicles fragment) | 4.9 | A truck on the stage |
| `lgx_producers` | 5.4 | A producer on screen |
| `ui4_icons` (fx_city: box, coin, settle icons) | 1.0 | Shared |
| Cityfolk pages for the staff / owners: head 3.9, loco 12.9, work 11.5, social 8.4, crowd 11.7 | 48.4 | Shared with incidents (`cfPages`) |
| **Module total** | ≈ 57 own + 48 shared cityfolk | |

`lgx_moving_truck` (12.2) and `lgx_pallet_jack` (0.4) are not used by this module. The lab's whole-page total (364 MiB)
includes every townfolk / cityfolk page and the lab's ground, so it is not a game number.

---

## 8. Lab and captures

`tools/test/logistics_lab/lab.html` + `run_lab.mjs` run the real host and view on a stand-in new town: the v4
`RoadPaint` streets with this module's streets added in memory (P19 style), the south sea as a flat paint, pines,
cityfolk dolls, the v4 `DayClock` and `Effects`, and the game's 720-wide logical view with render scale `View.k`.
A fake town plays the shops, homes, freight yard and porters. Every capture was looked at. Changes made after
looking: the hint arrow moved off the chip; the stamp pop moved above the heads; the roof chip is counter-scaled
when zoomed out; the cosmetic forklift tidy lap; the dawn tint removed from the rack shots; the producers moved to
their M-plot stand-ins; and the placement change (§3).

| Capture | Shows |
|---|---|
| `logistics_lab_closed.png` | Roof on, first visit: snow roof, nameplate, dock awnings, the bobbing arrow, vans and truck at the docks (phone DPR 3, zoom 0.8) |
| `logistics_lab_reveal.gif`, `_reveal_half.png`, `_reveal_open.png` | A real touch tap opens the roof (350 ms fade), a second tap closes it; first-reveal toast |
| `logistics_lab_stock_10/50/100.png`, `logistics_lab_stock_levels.png` | Racks at 10 / 50 / 100 % (zoom 1.2), bottom shelves and front cells first |
| `logistics_lab_forklift.gif`, `.png` | One real job: pick at the food rack → load the van in bay 2 → back to the racks, driver aboard, reversing beep |
| `logistics_lab_docks.gif`, `.png` | A van turns into the dock lane by the quay, backs into bay 2 next to the truck in bay 1, the truck is unloaded and leaves |
| `logistics_lab_settle_stamp.png`, `logistics_lab_settle.gif` | The owner at the counter, "쾅!" + receipt icon, +coins, "고마워요!", coins to the till |
| `logistics_lab_producers.png`, `.gif`, `logistics_lab_producers_van.png` | 가구 공방 + 가전 공장 at their M-plot stand-ins (operators, smoke, planks / ingots in, chairs / radios out); the pickup van docking at the centre |
| `logistics_lab_zoom_06/10/12.png` | Readability at zoom 0.6 / 1.0 / 1.2 (chip × 1.4 at 0.6) |
| `logistics_lab_desktop.png`, `_desktop_closed.png` | Desktop: mouse hover opens, leaving closes |
| `logistics_lab_english.png` | English strings |
| `logistics_lab_night.png` | 20:48, still open: night tint, headlamps |
| `logistics_lab_smoke.png`, `logistics_lab_wide.png` | Everything at once; the whole stage with the quay and the sea |

---

## 9. Tests

```
nice -n 15 node --test tools/test/logistics_lab/logistics.test.mjs tools/test/logistics_lab/purity.test.mjs   # 21 tests, ≈ 2.5 s
```

| Test | Checks |
|---|---|
| Determinism | Same seed → identical module events, view events and save slice after 900 s; another seed differs; named streams are independent |
| 10-day soak | **Custody** every second: racks + in transit + forks + open orders = items in − items out. Dock lane ≤ 1 vehicle, queue ≤ 7, docked < 90 s, on stage < 300 s, owners < 300 s. Every order ends (delivered / cancelled) within give-up + 120 s; > 100 deliveries every day; forklift and chains busy |
| Caps | No category ever passes its cap (producer piles wait when there is no room) |
| Settlement | Every `lgx:settle` = round(Σ price × n × 0.7 × 1.15) (homes: × 1.0); the sum = `tot.coins` |
| 살림살이 | A home reaches level 3 only after its delivery, which held ≥ 3 furniture + 1 appliance per home; never twice; `happyBonus` matches |
| Stress | A truck every 5 s with shops selling 5× faster; shops refusing every delivery (goods return, custody holds, owners still settle); the `plan` placement. Each is bounded (≤ 12 vehicles, ≤ 16 orders, ≤ 3 waiting) and unstuck. |
| Chains | 30 planks → exactly 10 pieces; a full pile (8) stops the machine; a piece in the making is refunded in the save. In the model: fed = 3 × made + pad + making, every piece accounted for (racks, pile, in transit, on orders, delivered), one `lgx:produced` per piece. A workshop built before the centre opens works, and its pile waits. |
| Racks | 300 random stocks: `rackFill` never exceeds `itemFit` or `rackUnits`; empty → nothing drawn, stock → something drawn; monotonic in the level |
| Save | Mid-day round trip: sanitize is identity on a fresh slice, `serialize(restore(s)) === s`, custody equal, every restored order finishes. The busy-centre slice is fitted ≤ 2 KB without losing goods. 400 fuzz inputs: never throws, ≤ 2 KB, idempotent, a model runs 60 s on it with custody intact. |
| Host | Call: letter, one site with the plan cost. Opening: banner, gift on the racks. Module events (call, open, producer, inbound, order, stock, settle, dispatch, delivered, produced); till → coins exactly; one first-settle toast; `places()`; slice ≤ 2 KB. Story pick-up and move-in become orders; `serves`; `settle` only after picking, and only once; move-in toast; MODULE gate / save key; no manifest → no model, nothing throws; Korean and English for every string |
| Layout | Routes start and end on the new streets, and kerb stops are on streets. Producers on M plots get no kerb stop, a producer beside the street gets one, and none west of the stage or past the dock lane. Placement A is dry; the plan spot touches the sea. |
| Perf | avg < 0.08 ms and p99 < 0.5 ms per tick |
| Purity | Model / data: no Phaser, window, document, timers, `Math.random`, scenes / entities / systems / core. Host imports only its own files; views import no other module; the lab never writes under `assets/` |

---

## 10. Known issues

1. **Placement needs a decision (blocker for P19).** Placement A moves the incidents module's police station (§11 P19b). Without that patch the centre overlaps `c_police`. Keeping the plan's spot instead needs land in the sea at i 55–58.2, j −27…−33, which the harbour's trawler route crosses. I recommend A.
2. **Off-stage trips.** Shop deliveries, home deliveries and producer pickups happen off stage (`roadS` 10–18 s). The vans leave the stage at the street's west end. The vehicles module may draw them through town from `lgx:dispatch` / `lgx:inbound` (`from: 'producer:…'`). Until then the pile on a producer's pad simply goes.
3. **v4 houses have no level.** Level 3 is the module's own set (`homesFurnished()`), and its happiness reaches the game through `api.happyBonus()` (P32). Nothing on the house sprite changes yet.
4. **Two systems could restock a shop.** With P32 applied, the v4 station porters skip a shelf item the centre `serves()`; without it, both restock. This is harmless, but the wholesale money would then go to both tills.
5. **Night:** staff leave at 22:30, the forklift driver stays to finish docked vehicles, and new vehicles wait for 05:30. An owner queued at closing still settles.
6. **Cityfolk pages are large** (48 MiB, shared with incidents). If memory is short, `dolls.make` can fall back to townfolk looks (seeds without presets): every rig only uses `walk / idle / carry_box / talk / think / point / phone / push / sweep / sit`, which townfolk has.
7. Story pick-ups for items the racks do not hold are dropped with `lgx:storyMiss` (the story engine should let the owner shrug).
8. GIFs are 0.57–1.03 MB each.
9. The lab's sea is a flat paint, not the v6 Water shader; the quay wall line is i = 55.
10. **Mission B11 `drv_logistics_round`** (the chief's truck loaded at a bay, 4 shop stops, stamp) has no hook yet. The
    model's bays only take its own vehicles. Suggested addition: `api.chiefLoad(n)` reserves a bay, shows a forklift
    load, takes the items out of custody and returns them to the vehicles module; `api.settle` then stamps at the end.

---

## 11. Integration (exact hooks into the current v4 code)

### Ground rules

- Anchors are given **by content**, not line numbers. The v4 workflow still owns and edits `src/**` existing files, `index.html`, `tools/build/**`, existing `tools/test/**` and `docs/v4*`. In this session `Game.js`, `Growth.js`, `Shop.js`, `Civic.js`, `Assets.js`, `Save.js` and `world.js` matched the anchors below; check them again before applying.
- Patch numbers follow `docs/v5_v8_plan.md` §10. Every patch keeps v4 behaviour when the centre is not running: each is guarded by `gs.later && gs.later.logistics`, `gs.lgx`, or the module's open state.
- **Name clash:** `gs.logistics` is v4's porter sink router (`src/systems/Logistics.js`). Keep the host at **`gs.lgx`** and the api at `gs.later.logistics`.
- Order: **P20 → P19 (+ P19b incidents layout) → P3 / P5 → P4 → P1 / P29 → P27 → sinks → P32 → P17 → P6 → P15 → P24**, then the feeds from missions, story and vehicles.

### P20 `src/data/balance.js`

Add `v8: { logistics: { ...LGX_TUNING } }` to `BALANCE` (copy `src/city/logistics/tuning.js` with its Korean
comments, or `import { LGX_TUNING }`). The host reads `BALANCE.v8.logistics` first via `lgxTuning(BALANCE)`: pass the game's
`BALANCE` as the `balance` port (`LOGISTICS_MODULE.create` hands it to the host). Add the new item prices to `src/data/items.js`
(`priceOf`): chair 25, table 40, sofa 70, bed 80, wardrobe 90, radio 50, stove_iron 90, washer 110, fridge 120,
tv_retro 140. The host prefers `tune.prices`, then `ports.price(k)`.

### P19 `src/data/world.js` — streets and `WORLD.v8.logistics`

- **Streets.** Anchor: the closing `]` of `streets: [` in the `v4:` block. Append `layoutFor('A').STREETS`: `ave_c` (i 36–40, j −35.9…−24.2), `lgx_st` (i 37.5–54.53, j −38.6…−35.9) and `lgx_dock` (i 52.53–54.53, j −36.3…−28.9), each with `region: 'newtown'`. These replace the plan's `ave_c` / `lgx_st` rows. At rank ≥ 3, merge `STREETS_EUP` (asphalt; `lgx_st` road j −38.6…−36.3 with a sidewalk to −35.9) into the eup table.
- **The v8 block.** At the end of `WORLD`:
  ```js
    // ---- (v8) 솔방울 물류센터 자리·길 (src/city/logistics/layout.js 의 worldV8Logistics() 와 같아요)
    v8: Object.assign(WORLD.v8 || {}, { logistics: worldV8Logistics('A') }),   // import { worldV8Logistics } from '../city/logistics/layout.js'
  ```
- **Checker.** Add the dock apron to the v5–v8 checker as an object, so the next layout change catches it: `add('c_lgx_apron', 'apron', 48.38 + 0.25 + 1.89, -31.13, 'newtown', 'v8', X=3.78*√2, Y=3.70*√2)`.

### P19b `src/city/incidents/layout.js` (incidents module, placement A)

- `POLICE`: `i: 43.15, j: -32.17` → **`i: 51.17, j: -26.97`**. The footprint becomes i 48.62–53.71, j −28.6…−25.35, front −Y onto the dock lane's north end.
- `HYDRANT_SPOTS`: the "경찰서 앞" entry `[41.8, -33.6]` → `[49.3, -28.85]`.
- `PATROL`: replace the first and last point `[40.2, -33.0]` with the exit `[51.2, -29.2], [53.5, -29.2], [53.5, -37.4], [38.0, -37.4]`, which joins the existing `[38.0, -26.0]` (and the same in reverse at the end). Before the car pulls out, wait while `gs.later.logistics.laneBusy()`.

### P3 `src/core/Assets.js` — late fragments, used keys

- Anchor `export const LATE_FRAGMENTS = ['town', 'townfolk', …, 'title', 'title_bake'];`. Append `'logistics'`, plus `'vehicles'` (`veh_truck_cargo`), `'cityfolk'`, `'fx_city'` and `'audio6'` if the vehicles or incidents patches have not added them.
- Anchor `export const USED_ONLY = { "audio5": …` (one line, read by `build_artifact.mjs`). Add or merge `"audio6": ["amb_warehouse", "sfx_forklift_beep", "sfx_stamp", "sfx_coin_count", "sfx_box_drop", "sfx_box_drop_2", "sfx_box_drop_3"]`, taking the union with the incidents list. For `fx_city`, only `ui4_icons` is used here.

### P5 cityfolk merge (shared with incidents)

The staff and owners use the cityfolk presets `warehouse_worker`, `forklift_driver`, `delivery_driver`,
`bank_teller` and `construction_worker`. In `src/core/Townfolk.js`, where `townfolk` and `townfolk2` are merged,
merge the cityfolk manifest the same way as `tools/cityfolk_compose.js` `mergeTownfolkFragments(tf1, tf2, cf)`
(parts, presets, `pickAnim` fallbacks). The lab does exactly this in `lab.js` Boot.

### P4 `src/core/Residency.js` — the new-town area

Anchor: the `REGIONS` array (its `{ id: 'village', … }` entry). Add:

```js
  // (v8) 솔방울 물류센터: its pages leave memory while the camera is far from the new town
  { id: 'newtown_lgx', rect: [3300, 3300, 5200, 4600], pages: ['lgx_center_a', 'lgx_center_d', 'lgx_items', 'lgx_center_b', 'lgx_center_c',
    'lgx_forklift', 'lgx_forklift_loaded', 'lgx_delivery_van_red', 'lgx_delivery_van_blue', 'lgx_delivery_van_mint'] },
```

Map `ports.assets.want(keys)` to the Residency demand API (`Assets.want` / `lateWant`). The view asks for the inside
pages only while the roof is off and for the vehicle pages only while vehicles are on the stage. `lgx_producers` is
wanted by the producer plots (they are in the old village).

### P1 + P29 `src/scenes/Game.js` — host, ports, save, site

Use the kit's `ModuleHost` (P1) if it lands first. The logistics-only form below is equivalent.

1. **Imports.**
   ```js
   import { LOGISTICS_MODULE } from '../city/logistics/index.js';
   import { sanitizeLogistics } from '../city/logistics/save.js';      // Save.js
   import { makeLgxPorts } from '../kit/lgxPorts.js';                    // lead-owned file: the table below
   ```
2. **Create.** Anchor in `build()`: `Neighbours.attach(this, sv.v4);`. After it:
   ```js
       // ---- (v8) 솔방울 물류센터 (created at the gate, or at once when a logistics save exists)
       this.later = this.later || {};
       this.lgxSaved = sv.logistics || null;
   ```
3. **Update.** Anchor in `update()`: `if (this.v4) this.v4.update(dt);`. After it:
   ```js
       if (!this.lgx && this.v4 && (this.lgxSaved || LOGISTICS_MODULE.gate(this))) {
         this.lgx = LOGISTICS_MODULE.create(makeLgxPorts(this), this.lgxSaved);
         this.later.logistics = this.lgx.api;
       }
       if (this.lgx) this.lgx.update(dt);
   ```
4. **Serialize.** Anchor in `serialize()`: `c1: this.civic ? this.civic.serialize() : undefined,`. After it:
   ```js
         logistics: this.lgx ? this.lgx.serialize() : (this.lgxSaved || undefined),
   ```
5. **Save.** In `src/core/Save.js` `sanitizeSave`, anchor `const c1 = sanitizeC1(raw.c1);` / `if (c1) s.c1 = c1;`. After it: `if (raw.logistics) { const l = sanitizeLogistics(raw.logistics); if (l) s.logistics = l; }`.
6. **Site (P29).** Add `gs.addModuleSite(def, 'logistics')`, shared with the harbour report: a v4 `Site` in module mode at `def.x, def.y` with `size: 'X'`, `only: 'logistics_center'`, `module: 'logistics'`, `cost`, `time` and `name`. Guard `Site.finish` (anchor `this.built = gs.makeBuilding(this.building, this, instant);`):
   ```js
       this.built = this.cfg.module ? null : gs.makeBuilding(this.building, this, instant);
       if (this.cfg.module === 'logistics' && gs.lgx) gs.lgx.onFeed({ t: 'built', siteId: this.id });
   ```
   The module draws the building (cutaway layers); the site gives the scaffold, porters and ribbon. Do not restore a done module site on reload: the slice's `open: 1` is enough.
7. **Ports table** (`makeLgxPorts(gs)`). Every target exists in v4 today except `addModuleSite` (P29), `makeDollRig` (P6, as in the harbour report) and `Assets.want` (P4):
   ```js
   world:  { scene: gs },
   clock:  { T: () => gs.v4.clock.T, dark: () => gs.v4.clock.cur.a, addLight: (x, y, k) => gs.v4.clock.addLight(x, y, k, 9800 + x) },
   lang:   () => getLang(),
   coins:  { add: (n, x, y, fly) => gs.economy.add(n, x, y, fly) },
   ui:     { toast: (m, hold) => gs.ui.toast(m, hold), banner: (m, s) => gs.ui.banner(m, s) },
   sound:  { play: (k, o) => Audio.play(k, o), at: (k, x, y, o) => gs.sfxAt(k, x, y, o), ambience: (k, v) => Audio.setAmbience(k, v) },
   sites:  { offer: (def) => gs.addModuleSite(def, 'logistics') },
   chief:  { x: () => gs.player.x, y: () => gs.player.y },
   view:   { rect: () => gs.viewRect(), zoom: () => gs.cameras.main.zoom / View.k, focus: (x, y, ms) => gs.focusCamera(x, y, ms),
             onScreen: (x, y, m = 0) => { const r = gs.viewRect(); return x > r.x - m && x < r.right + m && y > r.y - m && y < r.bottom + m; } },
   fx:     { sheet: (k, x, y, o) => gs.effects.sheet(k, x, y, o), floatText: (x, y, t, c, s) => gs.effects.floatText(x, y, t, c, s) },
   dolls:  { make: (look) => makeDollRig(gs, look) },                                                 // P6
   assets: { want: (keys) => (Assets.want ? Assets.want(keys) : null), manifest: (n) => Assets.lateManifest(n) },   // lateManifest: the merged late manifest
   shops:  { list: () => lgxShops(gs), deliver: (id, items) => lgxDeliver(gs, id, items) },          // P32
   homes:  { list: () => lgxHomes(gs) },
   emit:   (ev) => gs.events.emit('later', ev),
   place:  'A',
   balance: BALANCE,
   ```
   `Assets.lateManifest(n)` can be any accessor to the merged `logistics` manifest; the host only needs `man.sprites` and `man.characters`.

### P27 `src/systems/Civic.js` + `Game.makeBuilding` — the workshop and the factory

1. **Catalog.** Anchor `store: { cat: 'work', sizes: 'ML', unique: true, thumb: 'shop_general' },`. After it:
   ```js
     // (v8) 2차 → 3차 산업: 물류센터가 문을 연 뒤 (src/city/logistics; the module draws the building)
     furniture_workshop: { cat: 'work', sizes: 'ML', unique: true, thumb: 'furniture_workshop', art: ['furniture_workshop'], module: 'logistics' },
     appliance_factory: { cat: 'work', sizes: 'ML', unique: true, thumb: 'appliance_factory', art: ['appliance_factory'], module: 'logistics' },
   ```
   Append both keys to `MENU.M` and `MENU.L`. In `choices(site)`, before the `out.push`, add: `if (CATALOG[k] && CATALOG[k].module === 'logistics' && !(gs.later && gs.later.logistics && gs.later.logistics.open())) reason = 'lock_lgx';`. Add the strings `lock_lgx` ("물류센터를 열면 지을 수 있어요" / "Opens with the logistics centre"), `b_furniture_workshop` ("가구 공방") and `b_appliance_factory` ("가전 공장"). Costs go in `BALANCE.buildings`: `furniture_workshop: { coins: 9000, item_plank: 30, item_ingot: 0, time: 10 }`, `appliance_factory: { coins: 12000, item_plank: 0, item_ingot: 30, time: 10 }`. Add `ART_SRC` entries: `['logistics', 'lgx_producers']`.
2. **Build.** In `makeBuilding(bkey, site, instant)`, before `} else if (isDecor(bkey)) {`:
   ```js
       } else if (bkey === 'furniture_workshop' || bkey === 'appliance_factory') {
         // (v8) the logistics module draws the station, its operator, pads and smoke; porters feed its input pad
         const kind = bkey === 'furniture_workshop' ? 'furniture' : 'appliance';
         if (this.lgx) this.lgx.api.addProducer(kind, site.id, site.x, site.y);
         b = { key: bkey, x: site.x, y: site.y, site, revealObjects: () => [] };
         this.logistics.add(lgxProducerSink(this, site.id, kind));                                     // below
   ```
   On reload, done plots run `Site.finish(true)` → `makeBuilding(…, true)` (Game.js, `if (d.st === 'done') site.finish(true);`), so the producers are re-announced with their positions; the slice keeps their pads and piles.

### v4 Logistics sinks (`src/systems/Logistics.js` interface; no change to that file)

Register two kinds of sink through `gs.logistics.add(sink)` (the v4 porter router):

```js
// the centre's receiving pad: porters bring village goods to the racks (low priority: after shops and sites)
function lgxReceiveSink(gs) {
  const api = gs.later.logistics, p = api.places().receive;
  return { id: 'lgx_in', x: p.x, y: p.y, enabled: true, prio: () => PRIO.STORE + 5,
    accepts: (ty) => api.open() && api.room(ty) > 0, room: (ty) => api.room(ty),
    feed: (ch) => { for (let i = ch.stack.items.length - 1; i >= 0; i--) { const ty = ch.stack.items[i].type; if (api.room(ty) <= 0) continue;
      const it = ch.stack.pop(ty); if (!it) return false; api.receive(ty, 1);
      gs.effects.fly(it.spr, it.spr.x, it.spr.y, { x: p.x, y: p.y - 10 }, { dur: 260, height: 70, scaleTo: 0.4, onDone: (sp) => gs.effects.releaseItem(sp) }); return true; } return false; } };
}
// a producer's input pad: planks / ingots (INPUT priority, like the toolsmith)
function lgxProducerSink(gs, id, kind) {
  const ty = kind === 'furniture' ? 'item_plank' : 'item_ingot', api = gs.later.logistics;
  const P = () => (api.producers().find((q) => q.id === id) || { room: 0 });
  return { id: 'lgx_prod:' + id, x: gs.sites[id].x - 40, y: gs.sites[id].y + 30, enabled: true, prio: () => PRIO.INPUT,
    accepts: (t) => t === ty, room: (t) => (t === ty ? P().room : 0),
    feed: (ch) => { const it = ch.stack.pop(ty); if (!it) return false; api.feedProducer(id, 1); gs.effects.releaseItem(it.spr); return true; } };
}
```

Add the receiving-pad sink once the centre opens (`lgx:open` on the `later` bus, or at create when
`api.open()`). The chief's own delivery to these pads can reuse the v4 pad pattern: `onFeed({ t: 'delivered', pad,
item, n })`.

### P32 `src/systems/Growth.js` / `src/entities/Shop.js` — shops restock through the centre

1. **Shop room.** Anchor in `Shop.room(type)`: `const n = this.fullRoom(type);`. Before it:
   ```js
       // (v8) the logistics centre looks after this shelf item: the station porters leave it alone
       if (this.gs.later && this.gs.later.logistics && this.gs.later.logistics.serves(this.id, type)) return 0;
   ```
   `fullRoom` is unchanged, so the chief's delivery pad still works.
2. **Deliveries.** A new `Shop` method, used by `lgxDeliver(gs, id, items)` → `gs.v4.growth.shops[id].deliverBatch(items)`:
   ```js
     /** (v8) goods from the logistics centre: onto the shelf, already paid at the centre's counter (no wholesale here) */
     deliverBatch(items) {
       const ok = {};
       for (const ty in items) { const n = Math.min(items[ty], this.fullRoom(ty)); if (n > 0) { ok[ty] = n; this.stock[ty] = (this.stock[ty] || 0) + n; } }
       if (Object.keys(ok).length) { this.refreshShelf && this.refreshShelf(); this.refreshLabel && this.refreshLabel(); }
       return ok;
     }
   ```
   Use the shop's existing shelf and label refresh, whatever they are called after v4's last edits.
3. **Shop list.** `lgxShops(gs)` → for each `growth.shops[id]` with `st === 'open'`: `{ id, name: t('shop_' + id), sells: s.sells, need, look: { seed: hash(id) } }`. Here `need[ty] = shelfMax − stock` for each sold item below `restockBelow × shelfMax` (the same rule as `Shop.room`, without the `serves` guard).
4. **Homes.** `lgxHomes(gs)` → the village `gs.houses` plus the town `growth.houses` with `st === 'done'`, as `{ id, name }`.
5. **Happiness.** Anchor in `Growth.happiness()`: `const bonus = this.gs.civic ? this.gs.civic.happyBonus() : 0;`. Change it to:
   ```js
       const bonus = (this.gs.civic ? this.gs.civic.happyBonus() : 0) + (this.gs.later && this.gs.later.logistics ? this.gs.later.logistics.happyBonus() : 0);
   ```

### P17 `src/systems/Rank.js` — the 큰 도시 bar

The plan's rank-4 bar (`rank4.deliveries: 150`, "물류 150 deliveries settled per game day") reads
`gs.later.logistics.deliveriesToday()`. It counts **items** settled today, so 150 is about 9 shop orders plus a few
homes. The soak delivers 175–204 per day with the fake town's 4 shops and 12 homes; the real number depends on how
many shops and homes there are. If the bar should count settled orders instead, use the number of `lgx:settle`
events per day.

### P6 dolls, P15 sound, P24 packing

- **P6:** `makeDollRig(gs, look)` exactly as in the harbour report. The looks this module passes are `{ preset, seed }` or `{ seed }` / `{ sid }`.
- **P15:** `Audio.setAmbience('amb_warehouse', v)` is driven by the view through `ports.sound.ambience`; no area music change.
- **P24:** pack the logistics atlases as they are. If pages are merged, keep `lgx_center_a + lgx_center_d + lgx_items` (shell) apart from `lgx_center_b + lgx_center_c` (inside), so the inside page can leave memory with the roof on.

### Feeds from the other modules

| From | Event → `gs.lgx.onFeed(ev)` |
|---|---|
| vehicles (`src/vehicles`) | `veh:freight { to: 'lgx', items, from, reply }`: the yard truck is handed over at the stage edge. The vehicles module should despawn its own truck there, because the centre draws `truck_cargo`. |
| story (`src/story`) | `story:shop { op: 'pickup', … }`, `story:move { op: 'in', home / who, name }`; `ports.lookOf(owner)` = the resident's doll look; `ports.homeOf(who)` = their home id |
| missions (`src/missions`) | They listen to `lgx:settle` (count 1) and `lgx:produced { kind, n }`. A22 uses `places().logistics_office`; the chief's receipt calls `api.settle(id)`. |
| tap | If the game owns the pointer, forward `{ t: 'tap', x, y }` (world px); otherwise the view listens to the scene's own pointer (tap < 14 px, < 350 ms) |
