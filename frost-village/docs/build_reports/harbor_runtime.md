# harbor_runtime — 갈매기 항구 (v6) build report

A standalone, tested module for the v6 harbour district east of the village. Nothing in the game imports it yet. It
plugs in through the ModuleHost and ports from `docs/v5_v8_plan.md` §5, and the patches in the Integration section
at the end wire it into the v4 code once v4 ships.

- **Code:** `src/harbor/**`. It has a pure model, a host, and a Phaser 3.90 view.
- **Tests and lab:** `tools/test/harbor_lab/**`
- **Captures:** `docs/previews/harbor_lab_*`
- **Other files:** no other file was created or changed. No `assets/**` file was touched.

---

## 0. 디자이너용 요약 (쉬운 말)

- 도시(3단계)가 되고 1분 뒤 동쪽 바다 끝에서 **뱃고동**이 울려요. 갈매기 소리와 함께 "동쪽 바다 끝에 옛 항구가 있대!" 소문이 돌아요. 철길 끝 표지판이 반짝여요.
- **동쪽 철길 잇기**를 지으면 안개가 걷혀요. 카메라가 철길을 따라가면서 **눈에 덮인 잠든 항구**를 보여 줘요. 회색 건물, 꺼진 등대, 마을 배 두 척, 계선주 위 갈매기가 보여요.
- 항구는 7단계로 살아나요.
  1. 철길
  2. 항구역과 해안선 기차
  3. 수산물 경매장
  4. 등대
  5. 여객선 터미널
  6. 크레인과 세관
  7. 조선소

  하나를 지으면 다음 현장이 열려요. 다 지으면 원양어선을 최대 3척까지 주문할 수 있어요.
- **여객선:** 하루 네 번(06:30 · 10:30 · 14:30 · 18:30) 들어와요. 등대를 켜면 22:30 밤배가 하나 더 생겨요. 손님 8~20명이 내려서 시장과 식당에서 돈을 쓰고, 60%는 해안선 기차를 타고 솔방울 마을로 놀러 가요. 손님은 배 두 번 뒤에 돌아가요.
- **화물선:** 매일 11시쯤 예인선이 옆으로 밀어서 부두에 대요. 수출 주문을 가져오는데, 물건을 **수출 부두**에 놓으면 값의 2배를 줘요. 배마다 수입 상자도 하나씩 열려요: 설탕 → 천 → 유리 → 향신료. 크레인이 상자를 옮기고, 일꾼이 창고 옆에 쌓아요.
- **원양어선:** 오후에 바다 멀리서 그물을 올려요. 15:50쯤 돌아와 참치 상자를 내리고, **16:45 큰 경매**에서 팔려요. 낮 동안에는 2시간마다 작은 경매가 열려요. 촌장님이 경매 발판에 놓은 생선은 1.5배 값이에요.
- **밤:** 등대 불빛 두 줄기가 바다를 천천히 돌아요. 부표 불이 깜빡이고, 해안선 기차는 불을 켜고 달려요.
- **귀여운 일 두 가지:** 갈매기가 관광객 생선구이를 낚아채고(P7), 크레인 상자가 흔들흔들해요(P8).
- 숫자는 모두 `src/harbor/tuning.js` 한 곳에 한국어 설명과 함께 있어요. 숫자만 고치면 돼요.

---

## 1. What it does

| Area | Behaviour |
|---|---|
| The call | At rank 3 (도시) + 60 s game time the host plays a far `sfx_ship_horn_big` (0.25, panned right). Gulls follow at +1.6 s. A toast says "동쪽 바다 끝에서 뱃고동 소리가 들려요…", and two rumour toasts follow at +6 / +14 s (skipped once the harbour is open). Sparkles appear at the rail-end sign. The first site is offered: **동쪽 철길 잇기**. |
| Reveal | Building `railExt` emits `harbor:open`. The world port opens region `harbor` (+ `harbor_w`). The banner reads **갈매기 항구를 찾았어요!** / 항구를 살리면 바다 너머 사람과 물건이 와요. The camera runs rail end → L(66,0) → basin L(70,−14) at 0 / 0.8 / 2.2 s. The harbour is asleep: buildings carry the v4 ruin tint `0x9aa6b4` and snow drifts. Two village boats bob in the basin, gulls sit on bollards, and the streets are drifted. |
| Revive steps | Seven sites in order (costs in §3). Each one wakes its buildings with a pop tween, a poof, a star burst and `sfx_unlock`. The station step clears the street drifts and lights the harbour lamps. |
| Ships | All ships share one deterministic day timetable on the lattice axes: forward, astern, sideways (tug) and turn in place. Hull rectangles are booked so that no two hulls ever meet and no hull ever touches land, breakwater or slipway. Ships are layered sprites (base → cargo slots → foam → anim). They bob on `Water.heightAt/slopeAt`, register hull contacts, and leave V-wakes, rings and funnel smoke. Deck passengers wave near arrival and departure, and night lights glow on deck. At most 6 ships are drawn, nearest first. |
| Ferry | 06:30 / 10:30 / 14:30 / 18:30, plus 22:30 once the lighthouse is lit. Dwell is 34 s. 8–20 tourists come down the gangway, shop at the market or restaurant (2–5 items × 11 coins), stroll, or ride the coast train toward town (60 %). Each tourist leaves on the 2nd ferry after arrival and boards 8 s before departure. Guests (25 %) bring a toast and a bonus. Settlers (35 %, up to 20) move into the sailor lodge as `h:<n>` residents. |
| Cargo ship | Arrives about 11:24 daily: the tug pushes it sideways through the 16-cell mouth. Dwell is 150 s (to 18:21). It brings an **export contract** due one game day later, paid at 2.0 × price per item on delivery. One **import** opens per ship in the order sugar → cloth → glass → spice; later ships restock. The crane unloads the import crates (6–10 lifts, 3.2 s each), then loads one crate per 10 exported items. A dock worker carries each crate to the import pile, which shows a chip such as "설탕 6". |
| Trawlers | Ordered from the trawler pad behind the shipyard (≤ 3). Each takes 60 s on the slipway with sparks, then slides down with a splash. Trawlers come in from the open sea in the afternoon and haul the net in sight (14:30, heading NW, gulls circling). They berth at the basin's west wall at about 15:50. Crew carry 8 boxes (10 tuna each) to the auction hall. Rare fish chance is 8 % per trawler. |
| Auction | Small auctions every 2 game hours 08–18. Fish the chief drops on the **auction pad** sells at 1.5 × (raw fish 6, tuna 30). The **big auction is at 16:45** and sells the trawlers' boxes (10 × 30 = 300 coins per box). The bell plays, the auctioneer calls (`auctionCall` lines), buyers wave, and a "낙찰! +n" float rises. |
| Coast line | A second train on the v4 rail: 솔방울 동쪽 halt (carA i 37.5) ↔ 항구역 (carA i 62), with a v7 hook for 해변역 (carA i 94). Legs are 17.1 s and 21.2 s, dwell 10 s. The cycle is 54.2 s, or ≈ 117 s with the beach. It never stands on a crossing at a stop and never meets the main line (both tested). It is drawn by the unchanged v4 `Train` view (duck-typed `B`, `consist()`, `iAt()`, `m`, `v`, `running`, `blocking(k)`). |
| Lighthouse | After step 3, at night the lantern turns at 90°/s through the manifest's 8 light frames. Two ADD beam wedges (1300 px, alpha 0.55 × dusk fade) sweep the ground plane from the lens in step with the frame. The lens glows and the keeper waves from the door. |
| Gulls | At most 6. They perch on bollards and roof ridges, follow the ferry and trawler sterns, wander, and squawk at most every 4 s. They cast shadows. |
| People | Paper dolls through `ports.dolls`, at most 24 near the camera. Present: tourists, auctioneer, buyers, signalman, dock workers, trawler crew, shipwrights, lodge sitter, harbour master and the lighthouse keeper. They walk along the lanes: quay lane j −8.4, boulevard sidewalk j −3.6, the crossing alley at i 65.5, and the platform at j 1.25. |
| Pads | **수출 부두** (export pad, after the crane). Its chip shows what is left plus the departure time, e.g. "주괴 30 · 도구 2 · 18:21 출항". **경매 발판** (auction pad, after the auction hall). Its chip shows fish waiting and "다음 경매 N초". The chief standing on a pad gives one item per 0.12 s, like v4 input pads. |
| Stars | ★1 at opening. ★2 needs 20 ships + 200 exports + 150 tourists + all steps; it brings the harbour festival and the tug helps out. ★3 needs 60 / 800 / 600; it brings sailboats and yachts on the outer lanes. Stars never go down. |
| Happenings | P7 갈매기의 생선구이 습격: a gull dives on a tourist at the restaurant terrace, "내 생선구이!". P8 크레인 상자 흔들흔들: the crate wobbles during a lift and a worker says "어어, 조심조심!". The model's scheduler offers them every 300 s, with a gap of at least 150 s. P8 is offered only during a lift and P7 only when a tourist is outdoors. `host.happening(id)` returns `false` when the scene is not possible. |
| Music | `bgm_harbor` + `amb_harbor` while the chief is inside the harbour area `{x 5300–10752, y 2900–5000}` and the harbour is open (`ports.sound.music('harbor' | null)`). |
| Designer previews | `HARBOR_MODULE.previews.ferry` / `.crane` focus the camera and jump the clock to the next ferry arrival − 30 s, or the cargo arrival − 4 s. |

Strings are Korean and English throughout (`src/harbor/strings.js`, `ht(lang, key, vars)`). The English capture is `harbor_lab_english.png`.

---

## 2. Files

```
src/harbor/
  index.js            HARBOR_MODULE (ModuleHost entry: id, saveKey, gate rank 3, prefetch, create, sanitize, previews), FRAGMENTS
  host.js             HarborHost: ports -> model -> view; sites, pads, feed, api (gs.later.harbor), HARBOR_HAPPENINGS
  layout.js           map data (Korean comments): lattice L/W, sea, breakwater, buildings, rail/coast, streets, pads, berths,
                      routes, colliders(), worldV6()  -> WORLD.v6 (P19)
  tuning.js           every number (Korean comments) -> BALANCE.v6.harbor (P20); harborTuning(BALANCE) merge
  strings.js          ko + en strings, ht(), itemName()
  save.js             slice `harbor` v1 (cap 2 KB): sanitizeHarbor (never throws), fitHarbor
  model/              PURE (no Phaser / window / Math.random; seeded streams)
    HarborModel.js    the day: steps, timetable replans, crane jobs, trade, auction, tourists, stars, happenings, events
    schedule.js       ship missions + booked hull rects per time slice (ferry, cargo + tug push, trawlers, launch, sail/yacht)
    ships.js          hull rects, route expansion (fwd / astern / sideways / turn), overlap tests
    trade.js          export contracts, delivery pay, imports (order, crates, stock)
    auction.js        small bells, big auction, premium, boxes
    tourists.js       ferry passengers (seeded, transient): spots, walks, shops, coast-train riders, boarding
    coastLine.js      coast train kinematics on the v4 rail (Train-compatible surface) + crossing blocking
    revive.js         the 7 steps: site placement, which buildings wake, what starts
    fleet.js, stars.js, rng.js, time.js
  view/               Phaser only (v4 entities / systems / core used as libraries)
    HarborView.js     parts + ports helpers, model event routing, music area, previews, info()
    Quays.js          Ground bake hook (sea cut, cobble apron, quay walls, rocky point) + Water region options
    Statics.js        buildings (ruin -> revive), props, breakwater sprites, buoys, village boats, lamps, colliders
    Ship.js           ShipSprite + Fleet (budget, depth order, wakes, smoke, deck people, lights)
    Crane.js          crane frames, jib-over-deck copy, crew, import pile + chips
    Lighthouse.js     beams, lantern frames, lens glow, keeper
    Gulls.js, People.js, Pads.js, Reveal.js, art.js
tools/test/harbor_lab/
  harbor.test.mjs     17 Node tests (§9)       purity.test.mjs   2 layer-rule tests
  fake_env.mjs        a tiny fake game behind the ports (headless host)
  lab.html, lab.js, lab_world.js   the Phaser lab (real v4 RoadNet/RoadPaint/DayClock/Train/Effects + real art)
  run_lab.mjs         Playwright runner: scenarios, PNG/GIF captures, numbers
docs/previews/harbor_lab_*.png|gif, harbor_lab_numbers.json
```

Layer rules are enforced by `purity.test.mjs`:

- Model and data files import no `scenes/entities/systems/core` and no other module. They do not use Phaser, `window`, `document`, `localStorage` or `Math.random`.
- `host.js` imports only its own files and `src/data`.
- Views import no other module (`story / missions / bank / vehicles / beach / city`).

---

## 3. Numbers that drive it (`tuning.js`, → `BALANCE.v6.harbor`)

| Step | Cost | Build | Starts |
|---|---|---|---|
| 0 동쪽 철길 잇기 `railExt` | 12,000 + 80 planks + 40 ingots | 25 s | region `harbor` opens, reveal |
| 1 항구역 고치기 `station` | 8,000 + 40 + 20 | 14 s | coast train; wakes station, sailor lodge, harbour office; harbour lamps |
| 2 수산물 경매장 `auction` | 6,000 + 30 planks | 12 s | small auctions 08–18 every 50 s (2 h), auction pad |
| 3 등대 불 밝히기 `lighthouse` | 3,000 + 10 ingots | 8 s | beams at night, 22:30 night ferry |
| 4 여객선 터미널 `terminal` | 15,000 + 60 + 30 | 18 s | ferries, tourists; wakes market + restaurant |
| 5 크레인 + 세관 `crane` | 20,000 + 40 + 40 | 18 s | cargo ship, exports, imports, export pad; wakes customs + warehouse |
| 6 조선소 `shipyard` | 25,000 + 60 + 30 | 20 s | trawler orders (30,000 + 80 + 40, 60 s on the slip, max 3) |

Other values:

- Ferry: dwell 34 s, tourists 8–20, want 2–5 items, spend 11 per item, stay 2 ferries, town chance 0.6, guest 0.25, settler 0.35 (max 20), board 8 s before departure.
- Cargo: at 11.2 h, dwell 150 s, exportMult 2.0, liftEvery 3.2 s.
- Imports: sugar 6 crates (cake = bread 2 + sugar 1, 2.4 s, price 18), cloth 8, glass 10 (house level 2, happiness cap 12), spice 6 (cooked fish × 1.25).
- Trawler: haul 25 s, unload 20 s, catch 8 boxes, rare 0.08.
- Auction: base raw 4 / tuna 20, premium 1.5, tunaPrice 30, tunaPerBox 10, bigAt 16.75.
- Exports by star level:
  - ★1 rotation: cans 60 + planks 120 · bread 80 + grilled fish 60 · ingots 50 + tools 3.
  - ★2: cans 120 + planks 200 + ingots 60 · tuna 20 + cans 80.
  - ★3: two ★1/★2 orders merged × 1.5.
- Coast line: dwell 10 s, 3 cars, speed 2.6.
- Ships: sidle 64 px/s, turn 1.2 s, accel 3 s, astern × 0.6, basin × 1.5 slower, sea × 2.2, maxDelay 300 s.
- Budget: ships 6, people 24.

Representative day (seed 7, all steps, 2 trawlers; `T` = game seconds, day = 600 s):

| Ship | Appears | Near | Main event | Leaves | Gone |
|---|---|---|---|---|---|
| ferry 10:30 | 08:53 | 09:29 | arrive 10:30 | board 11:32, depart 11:51 | 13:43 |
| cargo | 09:54 | 10:46 | arrive 11:24 (tug push) | depart 18:21 | 19:53 |
| trawler 1 | 12:38 | 13:30 | haul 14:30, home 15:50, unloaded 16:38 | 16:38 | 19:18 |
| trawler 2 | 16:08 | 17:00 | haul 18:00, home 19:20, unloaded 20:08 | next day 05:00 | 07:39 |
| night ferry | 20:53 | 21:29 | arrive 22:30 | depart 23:51 | 01:43 |

### Map and plan changes (vs `docs/v5_v8_plan.md` §4.3 / §6.4)

| Plan | Now | Why |
|---|---|---|
| Breakwater i 57…80 | j −22, **i 59–70**, round head + green light; mouth i 70–86 | A 21 m cargo ship (14.9 cells) cannot turn in the 8.7-cell-deep basin, so it is pushed in sideways through a mouth wider than its length. The root starts at i 59 so the 14 m trawler fits its west-wall berth. |
| Ferry dwell 45 s | **34 s** | The previous ferry must clear the mouth before the next one comes in (berth booking test). |
| Night ferry 21:30 | **22:30** | The 18:30 ferry's departure path must be clear first. |
| Cargo at 09:00 | **11:12 (berths ≈ 11:24)** | Right after the 10:30 ferry has passed the mouth. |
| Big auction 15:30 | **16:45** | The first trawler is home at 15:50 and unloads until 16:38. At 15:30 nothing would be sold. |
| Imports sugar / cloth / glass | **+ spice** (6 crates, cooked fish × 1.25) | A 4th import keeps the cargo ship meaningful one more day. It can be dropped by removing it from `imports.order`. |
| 선원 숙소 (66.11, −2.14), 항구 사무소 (69.64, −2.14) | **(67.36, −2.14), (70.95, −2.14)** | The alley from crossing k 65 down to the boulevard (i 65–66) ran under the lodge's footprint (64.91–67.31). It now runs between the restaurant and the lodge, which is tested. |
| — | Auction pad (66.6, −8.6), export pad (83.0, −10.1), trawler order pad (59.9, −8.75) | Pads on the quay lane, visible, not covered by chips or buildings. |
| — | Village boats V1 (61.0, −13.45, SE, `boat_fishing`), V2 (66.8, −13.3, NW, `boat_rowboat`) | They bob in the basin outside every ship path. The 30-day test checks that no ship ever overlaps them. |
| — | Two harbour lamps moved from behind the quay row to the boulevard sidewalk (60.56 / 73.6, −3.85) | Behind the roofs, only their glow showed, as a disc floating over the warehouse roof at night. |
| Plan P24 "ships (SE/NW)" | Ships render **S, SE, NE**; the view uses **SE and NE** plus flipX mirrors (SW←SE, NW←NE) | S frames are never shown. A SE/NE page split saves ≈ 22 MiB (§10 P24). |

---

## 4. Architecture

```
game (v4)  --ports-->  HarborHost  --update(dt, T)-->  HarborModel (pure)  --events-->  host.onModel
   ^                      |  api (gs.later.harbor)                                         |
   |                      +--> HarborView (Phaser parts) <---------------------------------+
   +---- module events (P.emit: harbor:*, train) / feed in (host.onFeed)
```

- **Model** (`HarborModel`). It holds deterministic seeded streams per subsystem. It replans the day's timetable at day start and whenever something changes (step built, trawler launched). Ships are analytic: their pose is a pure function of time, so a reload mid-day puts every ship where it would be. `update(dt, T)` advances these:
  - crane jobs
  - tourists
  - auctions
  - the coast line
  - happenings
  - stars

  It queues events, which the host drains every frame.
- **Host.** It handles:
  - the call
  - offering sites
  - `built(siteId)`
  - the pads (the chief's bag → `deliver` / `dropFish`)
  - toasts and banners
  - coins
  - region opening
  - forwarding coast-train events to `ports.rail.event`
  - module events out (`ports.emit`)
  - game-time timers that pause with the game

  It runs headless when no `View` is given (Node tests).
- **View** (`HarborView`). Its parts update only near the camera; Fleet and Gulls always update cheaply. The parts are:

  | Part | Role |
  |---|---|
  | Quays | ground bake + Water region |
  | Statics | buildings and props |
  | Fleet | ships |
  | Crane | crane and its crew |
  | Lighthouse | lantern and beams |
  | Gulls | gulls |
  | People | paper dolls |
  | Pads | export and auction pads |
  | Reveal | opening sequence |

  The view also keeps:
  - a glow pool of 24
  - a rig pool (free list of 12)
  - its own speech bubble (when `ports.say` is absent)
  - its own Water instance (when `ports.water.region` is absent)

**Depth rules** (all verified on captures):
- **Ground is baked, ~0 display objects.** The sea is cut out of the snow (destination-out), and the Water body shows through. The cobble apron, `quay_x` / `quay_y` wall tiles and the rocky point face with snowy boulders are drawn by one `Ground.addBakeHook` over `{4200, 3300, 7200 × 2200}`.
- **Breakwater tiles are sprites at one depth.** A ship sailing the inner lane behind the breakwater must pass *behind* the tetrapods. The fleet sorts ships against a breakwater pseudo-item; the breakwater keeps its depth and ships behind it are lowered.
- **Ships are ordered pairwise by `frontOf(a, b)`.** On the axis of the larger gap, the lower j or the higher i is in front. This takes 3 passes over at most 6 items.
- **The crane is drawn twice.** The main picture stays at its natural depth, behind a berthed ship. A cropped copy (untrimmed frame x < anchorX − 112 px) is drawn at shipDepth + 0.06, so the jib, hook and crate show over the deck while the tower stays behind the hull.
- **Wakes** are drawn at `DEPTH.GROUND + 6`. Smoke, rings and glows use the FX depths. Pad chips sit at `DEPTH.LABEL − 10`.

### Ports (what the module needs from the game)

| Port | Use | Required |
|---|---|---|
| `world.scene`, `world.open(id)` | the Phaser scene; open a region | scene for the view |
| `clock.T()`, `dark()`, `addLight(x,y,k)`, `jump(T)` | game seconds; night alpha 0..0.45; lamps; designer preview | `T` |
| `view.rect()`, `zoom()`, `focus(x,y,ms)` | camera | yes (view) |
| `ground.bakeHook(fn, rect)`, `removeHook(h)` | the baked quays | yes (view) |
| `water.region(opts)`, `water.quality()` | optional; else the view makes `new Water(scene, opts)` | no |
| `dolls.make(look)` → `{ play(anim,dir), place(x,y,depth,alpha), visible(on), update(dt), setLook(look), destroy() }` | paper dolls | no (no people without it) |
| `fx.sheet/loop/burst/floatText` | v4 `Effects` (same signatures) | no |
| `sound.play/at/music(area)` | Audio, `gs.sfxAt`, area music | no |
| `say(x,y,text,dur)` | the game's bubbles | no |
| `chief.x/y/count(item)/take(item,n,x,y)` | pads, music area | for pads |
| `coins.add(n,x,y,fly,tag)` | pay | yes |
| `ui.toast(msg,hold)`, `ui.banner(msg,sub)` | messages | no |
| `sites.offer(def)` | the 7 steps + trawler orders | yes |
| `rail.add(line)`, `rail.event(ev,stop,line)`, `rail.blockedAhead(line,nose,dir,ahead)` | coast train view + events + chief on track | no |
| `collision.add(x,y,r,tag)` | building circles (`layout.colliders`) | no |
| `occluders.add(img)` | x-ray behind buildings | no |
| `assets.want(keys)` | Residency demand | no |
| `emit(ev)`, `lang()`, `rank()` | module events out; ko/en; rank | `emit` optional |

---

## 5. Public API (`gs.later.harbor` = `host.api`)

```js
open() -> bool                       star() -> 0..3
nextShip(kind) -> { id, at } | null  // 'ferry' | 'cargo' | 'trawler': next arrival (trawler: next home), game s
exports() -> [{ id, items, got, due, done, expired }]
needs() -> { item: n }               // what the open contracts still want
imports() -> { unlocked: [kind], stock: { kind: n } }
hasImport(kind) -> bool              takeImport(kind, n) -> n taken   // sugar | cloth | glass | spice
touristsToday() -> n
auction() -> { next, today, waiting }
deliver(item, n) -> { took, coins, done[] }   // trucks / porters / freight to the export pad
dropFish(item, n)                    // to the auction pad
coastLine                            // the CoastLine object (Train-compatible)
addCoastStop('beach')                // v7: the coast line runs on to 해변역
residents() -> n                     // harbour settlers (h:<n> pids)
happening('P7' | 'P8') -> bool       happenings: HARBOR_HAPPENINGS (story HappeningClock format)
state() -> snapshot for HUD / tests
```

Host methods are `update(dt)`, `onFeed(ev)`, `built(siteId)`, `serialize()`, `happening(id)` and `destroy()`.

### Events out (`ports.emit`)

| Event | Payload |
|---|---|
| `harbor:call` | — |
| `harbor:open` | — |
| `harbor:site` | `{ step }` |
| `harbor:step` | `{ step, wakes[], starts[], n }` |
| `harbor:ship` | `{ kind: ferry\|cargo\|trawler, id, op: arrive\|depart\|haul\|home, leaves?, due?, items?, imp?, n? }` |
| `harbor:export` | `{ id, n, item, done }` or `{ id, n: 0, expired: true }` |
| `harbor:import` | `{ kind, first }` |
| `harbor:auction` | `{ coins, fish, boxes, big }` |
| `harbor:tourists` | `{ op: arrive\|leave\|toTown\|back, n, ferry? }` |
| `harbor:guest` | `{ kind, id, ferry, item? }` |
| `harbor:settler` | `{ pid: 'h:<n>', home: 'h2_sailor_lodge' }` |
| `harbor:rare` | `{ id }` (mission E10) |
| `harbor:star` | `{ n }` |
| `harbor:trawler` | `{ op: order\|built\|launch\|launched, n? }` |
| `harbor:happening` | `{ id }` (the model proposes; story or the view stages it) |
| `train` | `{ ev: whistle\|arrive\|depart, stop: halt\|harbor\|beach, line: 'coast' }` |

The view-only events `ship`, `crane`, `box` and `coins` stay inside the module.

### Events in (`host.onFeed(ev)`)

| Event | Effect |
|---|---|
| `built { siteId }` | Completes a step (`h_step_<step>`) or a trawler order (`h_trawler_<n>`). |
| `rank { level }` | Starts the call timer at level ≥ 3. |
| `delivered { pad: 'h_export'\|'h_auction', item, n }` | Delivery by porters. |
| `veh:freight { to: 'h_export', items }` | Delivery by trucks (vehicles B7). |

`day`, `hour`, `sold` and `region` are not needed: the host reads `clock.T()` every frame.

---

## 6. Save slice

- **Key:** `harbor`, version 1, cap **2048 bytes**.
- **Measured:** 302 B fresh; **778 B** after 5 days with all steps, ★3, 3 trawlers and 3 open contracts.
- `fitHarbor` drops the oldest contracts if the cap is ever reached.

```js
{ v: 1, open: 0|1, steps: ['railExt', ...],                 // leading run of STEPS only
  exports: [≤3 { id, items: {≤4}, got: {}, due, done, n }],
  imports: { unlocked: ['sugar', ...], stock: { sugar: n } },
  cs,                                                       // cargo ships served
  fleet: { trawlers: 0..3, building: s, ready: 0..3 },
  auction: { day, coins, raw, big, boxes },
  tourists: { day, today, total },
  stars: { ships, exports, tourists, n: 0..3 },
  res: 0..20, beachStop: 0|1 }
```

**Not saved:** ships at sea, passengers, gulls and crane lifts. The timetable is replanned from the day and time, so every ship reappears where it would be; this is tested by reloading mid-day.

`sanitizeHarbor` never throws (fuzzed), clamps every number, keeps only known items, imports and step order, and returns `null` for unusable input.

---

## 7. Measured numbers

**Logic per tick, Node.** One game day of updates at 30 Hz with the full harbour (all steps, 3 trawlers, ★3):

- **0.0017 ms average**, p99 0.004 ms
- max 1.06 ms, a single tick: the day replan
- A whole day plans in ≈ 2.2 ms; the largest single placement is 1.22 ms.

The test asserts avg < 0.10 ms (plan budget) and p99.9 < 4 ms.

**Lab** (Chromium with SwiftShader software GL on a shared, `nice`d machine; the browser timer is coarsened to 0.1 ms, so p95 values are quantised):

| Scenario | model ms/tick avg / p95 / max | view ms/frame | draw calls | module display objs | rigs | tex MiB total / module |
|---|---|---|---|---|---|---|
| smoke (all steps, 11:24, ferry + cargo + crane) | 0.0084 / 0.1 / 0.9 | 0.30 | 9 | 70 | 26 | 435.4 / 122.3 |
| sleepy (just revealed) | 0.0081 / 0.1 / 0.2 | 0.12 | 5 | 91 | 0 | 423.1 / 122.1 |
| ferry | 0.0087 / 0.1 / 0.6 | 0.25 | 7 | 70 | 15 | 407.2 / 122.3 |
| crane | 0.0103 / 0.1 / 0.8 | 0.28 | 7 | 64 | 12 | 415.2 / 122.3 |
| night (beams, lamps, night ferry) | 0.0276 / 0.2 / 0.3 | 0.64 | 11 | 70 | 16 | 423.6 / 122.5 |
| phone zoom 0.6 | 0.0118 / 0.1 / 0.3 | 0.33 | 8 | 68 | 11 | 435.4 / 122.3 |
| desktop 1280 × 800 | 0.0211 / 0.1 / 0.3 | 0.53 | 8 | 68 | 12 | 423.3 / 122.3 |

- **View cost by part** (smoke, earlier per-part probe):

  | Part | ms/frame |
  |---|---|
  | fleet | 0.056 |
  | people | 0.035 |
  | crane | 0.031 |
  | pads | 0.025 |
  | statics | 0.023 |
  | gulls | 0.023 |
  | lighthouse | 0.006 |
  | water | 0.005 |
  | lab doll rigs | ≈ 0.1 |

  These are SwiftShader numbers; expect them to be several times smaller on a phone GPU.
- **Texture MiB.** "Total" is the source sum of everything the lab loaded, including all v4 town and townfolk pages the stand-in world uses, so it is not a harbour-view number. In the game, Residency evicts the town pages away from the harbour. The **module-attributable** 122.3 MiB is:

  | Source | MiB |
  |---|---|
  | harbour pages | 45.5 |
  | ship pages (S + SE + NE) | 65.7 |
  | water / FX sheets | ≈ 11 |

  Splitting ship pages to SE / NE (P24) brings this to ≈ 100 MiB, under the plan's 120 MiB.
- **Static display objects:** 64–91 for the whole module, against the plan's ≤ 400. Quays, walls, apron and rocks are baked.
- **Console:** no errors and no placeholder warnings in any scenario.
- **Happenings:** both are staged in the smoke run (`P7: true, P8: true`) with their toasts.

All numbers are in `docs/previews/harbor_lab_numbers.json`.

---

## 8. Lab and captures

Run the lab with:

```bash
nice -n 15 node tools/test/harbor_lab/run_lab.mjs --only=smoke              # groups of < 2 min each:
#   sleepy,reveal | ferry | crane,export | trawler,launch | night,auction | zoom,desktop,english   [--no-gif]
```

The page `tools/test/harbor_lab/lab.html` runs a stand-in world. It uses these real v4 pieces, with `WORLD.v4` extended in memory exactly as P19 does:

- RoadNet and RoadPaint
- DayClock
- Train, which draws the coast line
- Effects
- Water
- the real harbour, ships, water, townfolk and audio art from the manifests as they are

The stand-in also has pines and snow away from the roads and rail, a chief, and townfolk2 dolls with the harbour presets merged. A fixed-step clock drives everything.

Phone captures are 390 × 844 at DPR 3; desktop is 1280 × 800. I looked at every capture and iterated until it read well at zoom 0.6–1.2:

| File | Shows |
|---|---|
| `harbor_lab_smoke.png` | Late morning, everything open: ferry at the terminal, cargo ship at the crane, auction pad chip, the second row and the station |
| `harbor_lab_sleepy.png` | Right after the reveal: grey ruins with drifts, village boats bobbing, buoys, the cobbled quay |
| `harbor_lab_reveal.gif` | The call and reveal: sign sparkle, rumour toast, banner, camera ride east and down to the basin |
| `harbor_lab_ferry.gif` / `.png` | Ferry berthing (fade-in at sea, wakes, turn), deck passengers waving, gulls following, tourists down the gangway |
| `harbor_lab_crane.gif` / `.png` | Crane lifting import crates off the deck (jib over the deck, tower behind the hull), signalman, worker carrying crates, "설탕 6" pile chip |
| `harbor_lab_export.png` | Chief on the 수출 부두 with the contract chip, first-sugar banner |
| `harbor_lab_trawler_haul.gif` | A trawler hauling its net at sea, gulls circling |
| `harbor_lab_trawler_home.png` | Trawler at the west wall; crew carrying fish boxes across the apron |
| `harbor_lab_launch.gif` | A new trawler sliding down the slipway with a splash |
| `harbor_lab_night.gif` / `.png` | Lighthouse beams sweeping, lens glow, keeper, harbour lamps, blinking buoys |
| `harbor_lab_night_train.png` | Coast train at night (lamp + windows) over the harbour, the 22:30 night ferry in |
| `harbor_lab_auction.png` | The 14:00 bell: auctioneer "자, 싱싱한 생선이요!", buyers waving, "낙찰! +114" |
| `harbor_lab_zoom06/10/12.png` | Zoom 0.6 / 1.0 / 1.2 |
| `harbor_lab_desktop.png`, `harbor_lab_desktop_10.png` | Desktop 1280 × 800 (the game's 720-wide portrait column) |
| `harbor_lab_english.png` | English: "Gull Harbour ★2!", "Auction pad / Next auction 8s" |

---

## 9. Tests

```bash
nice -n 15 node --test tools/test/harbor_lab/harbor.test.mjs tools/test/harbor_lab/purity.test.mjs   # 19/19 pass, ≈ 3 s
```

1. **Ships:** over 30 days, no two hulls ever meet; no hull is on land, breakwater or slipway; berths are never double-booked; the village boats are never overlapped.
2. **Timetable:** ferries keep their times; the cargo ship and trawlers come every day; a day plans in a few ms.
3. **Ferry berth from the art:** terminal gangway + ferry far gangway (ships.md formula). The trawler hauls only in its haul directions.
4. **Layout:**
   - buildings stand on land and apart from each other
   - quay-row fronts are on the quay
   - every art key exists
   - pads are on land
   - **the crossing, alley and platform never run under a building**
5. **Colliders:** every building is solid; the quay lane, sidewalk, station path, fish-quay walk and every pad stay walkable for the chief (radius 16 px).
6. **Coast line:** legs 17.1 / 21.2 s, cycle ≈ 117 s with the beach; never covers a crossing at a stop; never meets the main line.
7. **Exports (completable):** every contract is made of producible items, with at least one game day to fill it and spare time.
8. **Exports (payment):** delivery pays exportMult × price at once; a full contract is done; a late one expires.
9. **Imports:** sugar, cloth, glass and spice open once each, in order; later ships restock.
10. **Auction:** pays exactly 1.5 ×, conserves fish, bells every 2 h 08–18 plus the big one.
11. **Tourists:** conserved over 30 days (arrive = leave + present); each leaves on a later ferry.
12. **Stars:** ★1 at opening, ★2 / ★3 at the bars (all steps), never down.
13. **No dead ends:** the call at 도시, every step offered in order, the trawler order after the shipyard, a launch.
14. **Pads:** the chief fills the export contract and the auction pad from the bag.
15. **Determinism:** same seed → same events and slice; another seed → another day.
16. **Save:** round trip; reload mid-day puts ships where they were; fuzz never throws and stays under the cap.
17. **Perf:** logic per tick ≤ 0.10 ms average.
18. **Purity (model and data):** no Phaser / browser / `Math.random`, no scenes / entities / systems / core.
19. **Purity (host and views):** the host imports only its own files and `src/data`; views import no other module.

---

## 10. Known issues

- **Camera clamp at the bottom of the harbour.** The plan's region rect ends at y 4600, but the sea south of the lighthouse goes to the new world height 4864. v4 `Territory.bounds()` clamps the camera to open regions and only peeks into *fog*, so the open sea below 4600 cannot be framed. The lab uses world bounds. The fix is the `camBottom` patch in §11 (P16).
- **Coast train at the harbour stop is partly hidden.** At the 항구역 platform the train runs behind the second row. The station and lodge cover the coaches at some zooms. Registering the buildings as x-ray occluders (`ports.occluders.add` → `gs.addOccluder`) fixes this in the game; the lab has no x-ray.
- **Ship pages carry unused S frames** (≈ 22 MiB). Split them as SE / NE pages (P24; the plan text says SE/NW, but the view needs SE and NE).
- **Crane and ship interleave is an approximation.** The jib-over-deck copy uses a fixed crop (112 px left of the anchor) tuned for the berthed cargo ship. Another ship class at the crane berth would need its own value.
- **A launched trawler starts partly on the slip** and fades in over 2.5 s. The fade hides the overlap, but at zoom 1.2 the first frames show the hull on the slip edge.
- **Trawler 2 and 3 catches are sold at the next day's bells.** The big auction is at 16:45, and later trawlers are home at 19:20 or later; their boxes wait on the catch pile. This is intended, but the pad chip only says "생선 n".
- **Lab rigs are not the game's dolls.** The lab uses `TownfolkSprite2` rigs; the game will use `DollSprite` through the adapter (§11 P6). Animation names are the townfolk2 set (`idle`, `walk`, `wave`, `talk`, `sit`, `carry`, ...). A preset without a frame for a direction falls back the same way v4's `TownfolkSprite.play` does.
- **Rigs and paths that ignore collision.**
  - Tourists enter and leave through the ferry terminal's hall (gangway → door → back); this is designed.
  - Fish-box carriers walk from the hall's back to its catch pile through the open auction hall.
  - The chief cannot follow either path, because the buildings are solid.
- **Sea west of x 5200.** The harbour Water region starts at x 4400. Between 4400 and 5200 below the rail strip, the v4 village sea preset and the harbour region meet. The lab shows no seam, but the game should give the village preset its v6 width (P23).
- **v7 beach band.** The coast east of the rocky point (i ≥ 90, j −19) is snowbank in v6; v7 turns it into sand. The two modules' Water regions must not overlap (harbour region ends at x 10000).
- **View numbers come from software GL.** Draw calls and display objects carry over to devices; milliseconds do not.
- **Lab-only coin float.** In the export capture the coin float rises across the pad chip. In the game, `coins.add(..., fly = true)` flies coins to the HUD instead.

---

## 11. Integration (exact hooks into the current v4 code)

### Ground rules

- Anchors are given **by content**, not line numbers. v4 is still changing these files: v4.1 has shipped, but the v4 workflow owns `src/**` existing files, `index.html`, `tools/build/**` and `docs/v4*`.
- Patch numbers follow `docs/v5_v8_plan.md` §10.
- Every patch keeps v4 behaviour when the harbour is not running. Each is guarded by `gs.later` or `gs.later.harbor`, data presence, or rank.
- The harbour needs these patches, in this order:

  **P17 (rank 3) → P19 → P20 → P2/P3 → P4 → P1/P29 → P7 → P14 → P10 → P16 → P15 → P23 → P6/P5 → P22 → P24**

### P19 `src/data/world.js` — world size, regions, rail, streets, `WORLD.v6`

The data comes from `src/harbor/layout.js` (`worldV6()`).

- **Size.** Anchor `width: 6144,` / `height: 3450,` at the top of `WORLD`. Change to `width: 10752,` and `height: 4864,`. The village sea preset width must follow (P23). Check anything that assumes 6144: `Collision` grid size (`new Collision(W, H)` in Game), fog strips, the overview rect and the minimap if any.
- **Territory.** Anchor `town:  { rect: [4150, 0, 6144, 3450], ...` inside `territory: {`. Add after it:
  ```js
      // ---- (v6) 갈매기 항구: 동쪽 철길 잇기를 지으면 열려요 (harbor 모듈이 territory.reveal 을 불러요)
      harbor:   { rect: [6144, 0, 10752, 4600], name: 'r_harbor', center: [7400, 3700], camBottom: 4864 },
      harbor_w: { rect: [5200, 3450, 6144, 4600], name: 'r_harbor', openWith: 'harbor' },
  ```
- **Rail.** Anchor `rail: { j: 0, from: -1, to: 46, crossings: [8, 33], sign: { i: 46.6, j: -1.2 } },`. Replace it with:
  ```js
    rail: { j: 0, from: -1, to: 98, toV4: 46, crossings: [8, 33, 65, 97], sign: { i: 46.6, j: -1.2 } },
  ```
  The v4 `Rail` uses `to` for the buffer stop and drawn tiles. While the harbour is closed, rail tiles beyond k 46 must stay hidden under the `harbor` fog. They do if `RoadPaint` draws the rail tiles per region; otherwise gate tiles with `i > toV4` on `gs.territory.isOpen('harbor')`.
- **Streets.** Append `STREETS` from layout.js to `WORLD.v4.streets` (anchor: the closing `]` of the `streets:` array in the v4 block): `blvd_h`, `xing_h` (xing 65), `alley_h`, `platform_h`, `quay_h`, each with `region: 'harbor'`. At rank 3, merge `STREETS_EUP.blvd_h` into the existing eup upgrade table: asphalt, road j −8…−4, walk −4…−3.
- **The v6 block.** Add at the end of `WORLD`:
  ```js
    // ---- (v6) 갈매기 항구 지도 (src/harbor/layout.js 의 worldV6() 와 같아요)
    v6: worldV6(),        // import { worldV6 } from '../harbor/layout.js'  (pure data, no Phaser)
  ```

### P20 `src/data/balance.js`, `src/data/strings.js`

- **Balance.** Add `v6: { harbor: { ...HARBOR_TUNING } }` to `BALANCE`, copied verbatim with its Korean comments. `HarborHost` already reads `BALANCE.v6.harbor` first (`harborTuning(BALANCE)`), with its own defaults second.
- **Strings.** Optionally move `HSTR` into `strings.js`. The module keeps working with its own table.

### P3 `src/core/Assets.js` — late fragments, used keys, presets

- **Late fragments.** Anchor `export const LATE_FRAGMENTS = ['town', 'townfolk', 'roads', 'audio3', 'ui3', 'life2', 'voice', 'audio4', 'title', 'title_bake'];` → append `'harbor', 'ships'`.
- **Used audio keys.** Anchor `"audio4": ["sfx_ship_horn_big", "sfx_seagull_1"]` inside `USED_ONLY` → replace with the full list (`FRAGMENTS.audio4` in `src/harbor/index.js`):
  ```js
  "audio4": ["sfx_ship_horn_big", "sfx_ferry_bell", "sfx_seagull_1", "sfx_seagull_2", "sfx_seagull_3", "sfx_crane", "sfx_auction_bell", "sfx_rope_creak", "amb_harbor", "bgm_harbor"]
  ```
- **Used water keys.** In the same line, add `"fx_splash_big"` to `"water": [...]`. The harbour uses it for trawler launches and hauls.
- **Harbour presets.** After the townfolk manifest is merged and before the first `TF.person(...)` for a harbour preset, merge the presets:
  ```js
  // (v6) the harbour's townsfolk presets (dock_worker, sailor, auctioneer, lighthouse_keeper, tourist, ...)
  Object.assign(TF.T.generator.presets, harborPresetsJson.presets);   // assets/harbor/townfolk_presets.json
  ```
  The lab does exactly this on the manifest (`lab.js` Boot). In the game, load `assets/harbor/townfolk_presets.json` with the `harbor` fragment.

### P4 `src/core/Residency.js` — harbour area and ship class

Anchor: the `REGIONS` array (`{ id: 'village', rect: [...] ... }` is its last entry). Add:

```js
  // (v6) 갈매기 항구: harbour pages leave memory while the camera is far from the harbour
  { id: 'harbor', rect: [5200, 2300, 10752, 4864], pages: ['harbor_landmarks', 'harbor_landmarks_2', 'harbor_buildings', 'harbor_props', 'harbor_water'] },
```

Ship pages are a separate class. Load a ship page when a ship is within the view rect + 700 px; evict it 1200 px after the last ship leaves. The view calls `ports.assets.want(keys)` for the ship it is about to draw. Map that port to the Residency demand API (`Assets.demand` / `lateWant`) once P4's `addClass('ship', { ttl, maxMiB })` exists.

### P1 + P29 `src/scenes/Game.js` — host, ports, save, sites

Use the kit's `ModuleHost` (P1) if it lands first. The harbour-only form below is equivalent and self-contained.

1. **Imports.** Near the other imports:
   ```js
   import { HARBOR_MODULE } from '../harbor/index.js';
   import { makeHarborPorts } from '../kit/harborPorts.js';   // lead-owned file: the table below
   ```
2. **Create.** Anchor in `build()`: `Neighbours.attach(this, sv.v4);`. After it:
   ```js
       // ---- (v6) 갈매기 항구 (created at 도시, or at once when a harbour save exists)
       this.later = this.later || {};
       this.harborSaved = sv.harbor || null;
   ```
3. **Update.** Anchor in `update()`: `if (this.v4) this.v4.update(dt);`. After it:
   ```js
       if (!this.harbor && this.v4 && (this.harborSaved || HARBOR_MODULE.gate(this))) {
         this.harbor = HARBOR_MODULE.create(makeHarborPorts(this), this.harborSaved);
         this.later.harbor = this.harbor.api;
       }
       if (this.harbor) this.harbor.update(dt);
   ```
4. **Serialize.** Anchor in `serialize()`: `c1: this.civic ? this.civic.serialize() : undefined,`. After it:
   ```js
         harbor: this.harbor ? this.harbor.serialize() : (this.saved && this.saved.harbor) || undefined,
   ```
5. **Save.** In `src/core/Save.js` `sanitizeSave` (P2), keep the slice: `if (raw.harbor) { const h = sanitizeHarbor(raw.harbor); if (h) s.harbor = h; }`.
6. **Sites (P29).** `ports.sites.offer(def)` receives:

   | Field | Value |
   |---|---|
   | `id` | `h_step_<step>` or `h_trawler_<n>` |
   | `step` | step id |
   | `x`, `y` | site position |
   | `key` | building art key |
   | `at: {x, y}` | the ruin it revives |
   | `cost: { coins, item_plank, item_ingot }` | cost |
   | `time` | build seconds |
   | `name` | display name |

   Build it as a v4 `Site` in module mode. Porters deliver planks and ingots as for any site, and the scaffold and ribbon play as today. On completion it must **not** make a building, because the module's Statics revive the ruin. Anchor in `Site.finish(instant)`: `this.built = gs.makeBuilding(this.building, this, instant);`. Guard it:
   ```js
       this.built = this.cfg.module ? null : gs.makeBuilding(this.building, this, instant);
       if (this.cfg.module && gs.later && gs.later[this.cfg.module]) gs[this.cfg.module].onFeed({ t: 'built', siteId: this.id });
   ```
   Then `addModuleSite(def, 'harbor')` creates `new Site(gs, def.id, { x: def.x, y: def.y, size: 'M', only: def.key, module: 'harbor', cost: def.cost, time: def.time, name: def.name }, 'plot')`, registers it in `gs.sites`, and serialises it with the other sites. On reload the host re-offers the next step itself, so do not restore a done module site.
7. **Ports table** (`makeHarborPorts(gs)`). `gs.v4.addLine` / `lineOf` (P14), `gs.addModuleSite` (P29), `makeDollRig` (P6), `harborMusic` (P15) and `Assets.want` (P4) are added by the patches in this section; every other target exists in v4 today:

   ```js
   world:  { scene: gs, open: (id) => gs.territory.reveal(id, false, true) },
   clock:  { T: () => gs.v4.clock.T, dark: () => gs.v4.clock.cur.a,
             addLight: (x, y, k) => gs.v4.clock.addLight(x, y, k, 9800 + x), jump: (T) => { gs.v4.clock.T = T; } },
   view:   { rect: () => gs.viewRect(), zoom: () => gs.cameras.main.zoom, focus: (x, y, ms) => gs.focusCamera(x, y, ms) },
   ground: { bakeHook: (fn, r) => gs.ground.addBakeHook(fn, r), removeHook: (h) => gs.ground.removeBakeHook(h) },
   water:  { quality: () => (gs.gfxLow ? 'low' : 'high') },          // region(opts) optional (P23)
   fx:     { sheet: (k, x, y, o) => gs.effects.sheet(k, x, y, o), loop: (k, x, y, s, d) => gs.effects.loop(k, x, y, s, d),
             burst: (n, x, y, q) => gs.effects.burst(n, x, y, q), floatText: (x, y, t, c, s) => gs.effects.floatText(x, y, t, c, s) },
   sound:  { play: (k, o) => Audio.play(k, o), at: (k, x, y, o) => gs.sfxAt(k, x, y, o), music: (area) => harborMusic(area) },  // P15
   chief:  { x: () => gs.player.x, y: () => gs.player.y, count: (it) => gs.player.stack.countOf(it),
             take: (it, n, x, y) => { let q = 0; while (q < n) { const s = gs.player.stack.pop(it); if (!s) break; q++;
               gs.effects.fly(s.spr, s.spr.x, s.spr.y, { x, y }, { dur: 260, height: 70, scaleTo: 0.4, onDone: (sp) => gs.effects.releaseItem(sp) }); } return q; } },
   coins:  { add: (n, x, y, fly) => gs.economy.add(n, x, y, fly), spend: (n) => gs.economy.spend(n), value: () => gs.economy.coins },
   ui:     { toast: (m, hold) => gs.ui.toast(m, hold), banner: (m, s) => gs.ui.banner(m, s) },
   sites:  { offer: (def) => gs.addModuleSite(def, 'harbor') },
   rail:   { add: (line) => gs.v4.addLine(line), event: (ev, stop, line) => gs.events.emit('v4:train', ev, stop, line),
             blockedAhead: (line, nose, dir, ahead) => gs.v4.trackBlocked(nose, dir, ahead, gs.v4.lineOf(line)) },     // P14
   dolls:  { make: (look) => makeDollRig(gs, look) },                                                                     // P6
   collision: { add: (x, y, r, tag) => gs.collision.add(x, y, r, tag) },
   occluders: { add: (img) => gs.addOccluder(img) },
   assets: { want: (keys) => Assets.want ? Assets.want(keys) : null },                                                    // P4
   emit:   (ev) => gs.events.emit('later', ev),       // GameFeed bus (P1); missions / story / vehicles listen
   lang:   () => getLang(),                        // src/data/strings.js
   rank:   () => (gs.v4 && gs.v4.rank ? gs.v4.rank.level : 1),
   ```

   Also forward feed events: `gs.events.on('v4:rankUp', (lv) => gs.harbor && gs.harbor.onFeed({ t: 'rank', level: lv }))`, and the vehicles module's `veh:freight` to the export pad.

   **Rank 3 dependency.** v4 `Rank` stops at level 2 (읍): `src/systems/Rank.js` emits `'v4:rankUp', 2` only. The harbour's gate and the call need level 3 (도시), which arrives with P17 (levels from data, `BALANCE.v5.rank[3]`). Until then the harbour never opens in the game. For testing, `HARBOR_MODULE.gate` can be pointed at level ≥ 2.

### P7 `src/systems/Collision.js` — the south sea

Anchor in `blocked(x, y, rad, ignore)`: the first line, `if (x < this.ox + 40 || ... || !this.inWalk(x, y)) return true;`. After it:

```js
    // (v6) the warm south sea of the harbour (WORLD.v6): water south of the quay / rocky point, the breakwater is not walkable
    if (WORLD.v6 && x > 5200 && y > 3300) { const q = px2Lv6(x, y); if (isSeaV6(q.i, q.j + 0.72)) return true; }
```

`px2Lv6` / `isSeaV6` are `px2L` / `isSea` from `src/harbor/layout.js` (pure). The 0.72-cell margin keeps the chief's feet on the quay edge.

### P14 `src/systems/Neighbours.js` — the coast line beside the main line

1. **Rails list.** Anchor in the constructor: `this.rail = new Rail();`. After it: `this.rails = [this.rail]; this.trains = [];`.
2. **Crossings.** Anchor `gs.roads.edgeBlocked = (e) => !!(e && e.xing >= 0 && this.rail && this.rail.blocking(e.xing));`. Replace with:
   ```js
       gs.roads.edgeBlocked = (e) => !!(e && e.xing >= 0 && this.rails.some((r) => r.blocking(e.xing)));
   ```
3. **Trains list.** Anchor `this.train = new Train(gs, this.rail);`. After it: `this.trains.push(this.train);`.
4. **New methods** on Neighbours:
   ```js
     /** (v6) another line on the same rail (the harbour's coast line): drawn by the v4 Train view */
     addLine(line) { this.rails.push(line); const tr = new Train(this.gs, line); tr.line = line; this.trains.push(tr); this.lines = Object.assign(this.lines || {}, { coast: line }); return true; }
     lineOf(name) { return (this.lines && this.lines[name]) || this.rail; }
   ```
5. **Update.** Anchor in `update(dt)`: `if (this.train) this.train.update(dt);`. Replace with `for (const tr of this.trains) tr.update(dt);`.
6. **Blocking for any line.** Anchor in `trackBlocked(nose, dir, dist)`: `const m = this.rail.mAt(q.i);`. Change the signature to `trackBlocked(nose, dir, dist, rail = this.rail)` and use `rail.mAt(q.i)`. The coast line has `mAt`.
7. **Event payload.** Anchor in `onRail(ev, stop)`: `gs.events.emit('v4:train', ev, stop);`. Add `'main'` as a 3rd argument. The harbour emits `('v4:train', ev, stop, 'coast')` through its rail port. Listeners that check `stop === 'ours' | 'town'` are unaffected, because coast stops are `halt | harbor | beach`.
8. **Tourists to town.** In `ridersWanted()`, before `return Math.min(n, room);`:
   ```js
       const hb = this.gs.later && this.gs.later.harbor ? (this.harborRiders || 0) : 0;   // harbour tourists who rode the coast train to town
       if (hb) { this.harborRiders = 0; return Math.min(n + hb, room); }
   ```
   Fed by `gs.events.on('later', (e) => { if (e.t === 'harbor:tourists' && e.op === 'toTown') gs.v4.harborRiders = (gs.v4.harborRiders || 0) + Math.ceil(e.n * 0.4); })`. About 40 % of the coast riders come on to our village as visitors; the town's citizens stand in until v6 adds a `tourist` kind (P6 `registerKind`).

### P10 `src/systems/DayClock.js` — every train's lamps, and the `day` event

1. **Moving lights.** Anchor `if (nb && nb.train) { const lp = nb.train.lampPoint(); if (lp) pts.push({ x: lp.x, y: lp.y, k: 1.2 }); nb.train.coachPoints(pts); }`. Replace with:
   ```js
       for (const tr of (nb && nb.trains) || (nb && nb.train ? [nb.train] : [])) { const lp = tr.lampPoint(); if (lp) pts.push({ x: lp.x, y: lp.y, k: 1.2 }); tr.coachPoints(pts); }
   ```
2. **Day event.** Optionally emit `('day', this.day())` when the day changes. The harbour does not need it.

### P16 `src/systems/Territory.js` — the harbour area and the sea below it

1. **Area.** Anchor `areaOf(x) { return x >= ((WORLD.territory.rail && WORLD.territory.rail.rect[0]) || 1e9) ? 'neighbours' : 'village'; }`. Replace with:
   ```js
     areaOf(x, y) {
       const h = WORLD.territory.harbor, hw = WORLD.territory.harbor_w;
       if (h && y !== undefined && ((x >= h.rect[0] && y >= 2300) || (hw && x >= hw.rect[0] && y >= hw.rect[1]))) return 'harbor';
       return x >= ((WORLD.territory.rail && WORLD.territory.rail.rect[0]) || 1e9) ? 'neighbours' : 'village';
     }
   ```
   `areaRect(area)` calls `areaOf` with the rect centre; pass `(r.rect[1] + r.rect[3]) / 2` as `y`.
2. **Camera over the open sea.** Anchor in `bounds()`: `if (touches('l')) x0 -= CAM_PEEK;`. After it:
   ```js
       // (v6) a region may let the camera see below its land (the harbour's open sea down to the world edge)
       for (const id in this.regions) { const r = this.regions[id]; if (r.open && r.cfg.camBottom) y1 = Math.max(y1, r.cfg.camBottom); }
   ```

### P15 `src/core/Audio.js` / ports — area music

`harborMusic(area)`:

```js
const harborMusic = (area) => {
  Audio.playMusic(area === 'harbor' && Audio.exists('bgm_harbor') ? 'bgm_harbor' : 'bgm_village');   // v5+: setAreaMusic(area)
  Audio.setAmbience('amb_harbor', area === 'harbor' ? 0.55 : 0);
};
```

### P23 `src/systems/Ground.js` / `VillageSea.js` — water

The harbour makes its own `Water` region: `{ x 4400, y 3330, w 5600, h 1600 }`, palette `harbor`, land / breakwater / slipway masks and per-segment shore types (see `Quays.waterOpts`). It follows `docs/build_reports/water.md` and imports `src/systems/Water.js` read-only.

What the game must do:
- Give the village sea preset its v6 width, so the village shoreline field covers x ≤ 5200 and does not run under the harbour.
- Optionally give the harbour a `ports.water.region(opts)` that reuses one shared Water pipeline. Otherwise the view's own instance costs one shader pass and about 1 MiB of field.

### P6 / P5 — paper dolls in the game

`makeDollRig(gs, look)` is an adapter over the v4 `DollSprite` and `DollPool`:

```js
import { TF, mulberry32 } from '../core/Townfolk.js';
import { DollSprite, DollPool } from '../entities/DollSprite.js';
const FLIP = { SW: 'SE', W: 'E', NW: 'NE' };
export function makeDollRig(gs, look) {
  if (!TF.ok) return null;
  const mk = (l) => TF.person(mulberry32((l.seed >>> 0) || 1), l.preset || null);
  let p = mk(look);
  const d = new DollSprite(gs, 'tf:' + p.base, p, -9999, -9999);
  DollPool.of(gs).add(d);
  return {
    play(anim, dir) { const base = FLIP[dir] || dir; d.setFlipX(!!FLIP[dir]); d.setAnim(TF.T.anims[anim] ? anim : 'idle', base); },
    place(x, y, depth, alpha = 1) { d.setPosition(x, y).setDepth(depth).setAlpha(alpha); },
    visible(on) { d.setVisible(on); },
    update() {},                                        // the DollPool animates and draws
    setLook(l) { p = mk(l); d.setPerson(p, 'tf:' + p.base); },
    destroy() { DollPool.of(gs).remove(d); d.destroy(); },
  };
}
```

The harbour presets must be merged first (P3). Harbour residents as TownSim kinds (`registerKind('sailor', ...)`, homes `h2_sailor_lodge` / `h2_harbor_office`) belong to the story integration (P6). The harbour emits `harbor:settler { pid, home }` for it.

### P22 `src/voice/cast.js`

Map job to voice: `dock_worker` / `sailor` / `auctioneer` → `big_gruff`; `lighthouse_keeper` → `elder_m`; `tourist` → the default random adult.

### P24 `tools/build/pack_pages.py` (owned by v4 — patch only)

Pack ship atlases as two pages per ship: **SE** (base_SE, slot*_SE, foam SE, anims SE) and **NE**. Drop the `_S` frames: the view never shows S, because it mirrors SW←SE and NW←NE. This saves ≈ 22 MiB of the 65.7 MiB ship total. The harbour pages are packed as they are.

### Import effects (for v6 feature work, after the wiring above)

These read `gs.later.harbor`. They are hooks only: the harbour holds the stock and the game spends it.

| Import | Hook | Where in v4 |
|---|---|---|
| 설탕 sugar | A second bakery recipe: bread 2 + 1 sugar → `item_cake` (art in life2), 2.4 s, price 18. Each batch calls `takeImport('sugar', 1)`. | `src/entities/Workshop.js` (multi-input recipes already exist: `recipe.inputs`). Add the recipe when `hasImport('sugar')`. |
| 천 cloth | `t_cloth` (솔방울 옷가게, `WORLD.v4` town buildings) buys cloth wholesale while `hasImport('cloth')`. | `src/systems/Growth.js` founding / restock tables |
| 유리 glass | House level 2: lit windows at night, happiness +1 per house (cap 12). Each upgrade calls `takeImport('glass', 1)`. | `src/entities/House.js`, Growth happiness |
| 향신료 spice | Cooked fish sells × 1.25 while stock lasts; one spice per 10 sold. | `src/entities/Seller.js` price lookup (`BALANCE.prices.item_fish_cooked`) |

Missions and vehicles listen on the module events: `harbor:rare` → E10, `harbor:star n = 2` → C10 harbour festival, `harbor:export` → D10, `harbor:import sugar` → D11. Vehicles send trucks to the export pad (`veh:freight { to: 'h_export' }`) and run bus line 3 to 항구역.

### Already done inside the module (no game change needed)

- **Rumour toasts** are skipped once the harbour is open.
- **Crane on reload.** A cargo ship that berthed before a reload or session start is served by the crane (`resumeBerth`).
- **Late art.** Art arriving late (lazy fragments) is picked up by Statics every second.
- **Pacing.** Ship pages are wanted only for ships the fleet is about to draw.
