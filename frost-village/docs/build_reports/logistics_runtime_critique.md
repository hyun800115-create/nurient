# logistics_runtime — adversarial review (v8 솔방울 물류센터)

Reviewed: `src/city/logistics/**`, `tools/test/logistics_lab/**`, `docs/previews/logistics_lab_*`,
`docs/build_reports/logistics_runtime.md` (§11 Integration), against `docs/기획서_v8_살아있는도시.md` §1,
`docs/v5_v8_plan.md` §6.6, `assets/logistics` / `assets/cityfolk` manifests and the current v4 code under `src/**`.
The module's files were treated as read-only. All experiments ran from the scratch folder
`S=/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/later_logistics_runtime_critic`
(a symlinked copy of the lab in `$S/root/critic/`, Node scripts in `$S/node/`, captures in `$S/shots/`).
No repo file other than this report was written.

**Verdict: rework** (the view's art lifecycle and the §11 integration patches). The pure model is in good shape and
needs only small fixes. As written, the integration does three things. The centre is never drawn in the game. A save
that has a furniture workshop freezes on reload. A construction left half-way is lost on reload. The lab hides all
three because it preloads every atlas and passes a camera `Rectangle` where the game passes a different object.

| Severity | Count |
|---|---:|
| critical | 3 |
| high | 7 |
| medium | 10 |
| low | 10 |

---

## 디자이너용 요약 (쉬운 말)

- 실험실 화면은 예뻐요. 선반 높이가 진짜 재고이고, 지게차와 도장 "쾅!"도 잘 보여요.
- 그런데 지금 설명서대로 게임에 넣으면 문제가 생겨요.
  - **물류센터 건물이 아예 안 보여요.** (게임이 건네는 "화면 크기" 모양이 실험실과 달라요.)
  - 그림이 조금 늦게 도착하면 **건물이 영영 비어 있어요.** 눈 위에 직원과 상자만 둥둥 떠 있어요.
  - 가구 공방이 있는 저장을 다시 열면 **게임이 멈춰요.**
- 고쳐야 할 큰 것들:
  - 밴이 **길 한가운데에서 유령처럼 스르륵 나타나요.**
  - 촌장님이 **물류센터 벽을 그냥 통과해요.**
  - 가게가 물건을 못 받으면 물건은 선반으로 돌아오고 **돈은 그대로 받아요.** 돈이 무한으로 생길 수 있어요.
  - 가구 공방은 **의자만 8개씩** 줄지어 만들어요.
  - "큰 도시" 조건(하루 배송 150개)은 지금 가게 판매 속도로는 **닿기 어려워요.**
  - 은행장님 편지는 **화면보다 길고 1.5초 만에 사라져요.**
- 모두 고칠 수 있는 문제예요. 아래에 고치는 방법을 적었어요.

---

## What was re-run

| Check | Result |
|---|---|
| `nice -n 15 node --test tools/test/logistics_lab/logistics.test.mjs tools/test/logistics_lab/purity.test.mjs` | 21 / 21 pass, 3.0 s |
| Builder's lab: a private copy of `run_lab.mjs` writing to `$S/labcopy` (`--only=smoke,closed --no-gif`) | "no problems", 0 console errors, 6 draw calls, model ≈ 0.02 ms per tick |
| Critic lab: `$S/node/critic_run.mjs` with `--only=late`, `rect`, `ghost` and `chief` (one Chromium at a time, under 11 s each) | findings C1, C2, H5, M8 |
| Node experiments: `$S/node/exp1.mjs`, `exp2.mjs`, `exp3.mjs`, `p27_reload.mjs` | findings C3, H3, H6, M1, M7, L1–L3 |

What holds up:
- **Determinism and custody:** same seed gives the same events, view events and slice.
- **Save:** the slice is ≈ 0.9 KB, and `sanitizeLogistics` never throws.
- **CPU:** per-tick cost is tiny.
- **Draw calls:** 3–8.
- **Racks:** read well at 10 / 50 / 100 %.
- **Cutaway look in the lab:** charming. Bottom shelves and front cells fill first, the rack signs are clear, and the
  stamp and coins land well.

---

## Critical

### C1. The centre and the producers are never drawn with the documented `view.rect` port
- **Where:**
  - `view/LgxView.js:57-61`: `near()` uses `r.x + r.width` and `r.y + r.height`.
  - §11 P1 step 7 maps `view.rect: () => gs.viewRect()`.
  - `Game.viewRect()` (`src/scenes/Game.js:1336-1347`) returns `{ x, y, right, bottom }`, with no `width` or `height`.
  - Every comparison against `NaN` is false, so `near()` is always false. `LgxView.update` then calls
    `setShown(false)` every frame, and `Producers.update` hides every station.
  - The lab passes `cam().worldView`, a Phaser `Rectangle` that has both shapes, so the bug never shows there.
- **Repro:**
  ```
  PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers nice -n 15 node $S/node/critic_run.mjs --only=rect
  ```
  This sets `host.P.view.rect` to return `{x, y, right, bottom}` and gives `shown: false`, `shellVisible: false` and
  `producersVisible: [false, false]`.
- **Evidence:** `$S/shots/rect_viewRect_port.png` shows an empty lot with only the chief and the street.
- **Fix:** in `near()`, use `const R = r.right ?? r.x + r.width, B = r.bottom ?? r.y + r.height`. Or reuse the
  `view.onScreen` port that §11 already defines with `right` / `bottom`. Add a lab case that feeds a plain
  `{x, y, right, bottom}` object.

### C2. View parts are created once, before their pages exist, and never again: an invisible building and producers
- **Where:**
  - `view/Centre.js:20-35`: `put()` returns `null` while the atlas is missing. Every layer, patch, nameplate and outdoor
    prop is created once in the constructor.
  - `view/Producers.js:151-159`: `add()` returns before it creates the station or the operator, and `producerAdded` is
    never called again.
  - `view/Settlement.js:26-27`: the chip icons.
- **Why the game hits it:**
  - The view is built in `host.tryInit()` as soon as the manifest JSON exists.
  - In v4, `Assets.loadFragment(..., onReady)` fires `onReady` when the manifest is merged (`src/core/Assets.js:266-290`),
    long before the PNG pages load.
  - The module itself only asks for pages from `wantArt()`, which runs only after `near` is true.
  - On every reload with an open centre, `LOGISTICS_MODULE.create` runs on the first `update()`, before any late page
    has arrived.
  - P4 regions can bring pages back after eviction, but nothing re-creates the `null` layers.
  - `logistics_center_props` is drawn "always" but lives on `lgx_center_c`, an "inside" page. The producers'
    output-pile items live on `lgx_items`, a centre page, while the producers stand in the village.
- **Repro:**
  ```
  PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers nice -n 15 node $S/node/critic_run.mjs --only=late '--skip=^lgx_(center_|items|producers)'
  ```
  The lab boots without those six pages, then loads them with `LAB.loadLate()`.
  - Before: all 11 layers, 4 patches and the nameplate are `false`, and there are 0 producers.
  - After the pages arrive: still all `false`, with 0 producers.
- **Evidence:**
  - `$S/shots/late_open.png`: staff, the forklift and rack goods float on bare snow, and there is no building.
  - `$S/shots/late_producers.png`: the producer plots are empty, with no operator.
- **Fix:**
  - Make every part lazy. Create or re-skin on `Assets.arrivals` (Game already exposes `onAssetArrived` and
    `lazyImgs`), or keep a `pending` list that is retried every 0.5 s.
  - Keep the model's work independent of art.
  - Have the module request its own pages:
    - `logistics.always` plus `lgx_center_c` (for `props`) whenever the centre is open;
    - `lgx_producers` plus `lgx_items` while a producer is near.
  - Add a lab case that boots without the logistics pages, like `$S/root/critic/lab_late.js`.

### C3. §11 P27 freezes the game on reload of any save with a workshop or factory
- **Where:**
  - In the §11 `lgxProducerSink`, `api = gs.later.logistics` is captured when the sink is created.
  - On reload, `Game.build()` runs `restoreV3` → `Site.finish(true)` → `makeBuilding` (`src/scenes/Game.js:207-210`,
    `925-929`) before `update()` creates `gs.lgx`.
  - `gs.later` is `{}` there (P1 step 2), so `api` stays `undefined` forever.
  - The first porter carrying a plank or ingot asks `Logistics.want → sink.room()` and gets
    `TypeError: Cannot read properties of undefined (reading 'producers')`.
  - That throws out of `Game.update` and stops the Phaser loop.
  - The same reload also skips `if (this.lgx) this.lgx.api.addProducer(...)`, so the producer never gets its position
    and is never drawn (see also C2).
- **Repro:** `node $S/node/p27_reload.mjs`, which is the §11 sink verbatim with the v4 build order. It prints
  `THROWS: Cannot read properties of undefined (reading 'producers')` even after `gs.later.logistics` appears.
- **Fix:**
  - Resolve the API lazily: `const api = () => gs.later && gs.later.logistics`. Have `room` / `accepts` return 0 or
    false while it is missing.
  - Queue `addProducer(kind, id, x, y)` calls in Game until `gs.lgx` exists, or have the host re-announce from
    `gs.sites` when it is created.

---

## High

### H1. §11 P1 ports `assets.manifest: (n) => Assets.lateManifest(n)` throws when the gate opens
- **Where:** `Assets.lateManifest` is a plain object (`src/core/Assets.js:332-333`, `this.lateManifest[f] = j`), and it is
  `undefined` before the first late fragment.
- **What happens:** the host constructor calls `tryInit()` → `manifest()` → `TypeError: ... is not a function`. This
  happens inside `LOGISTICS_MODULE.create`, inside `Game.update`.
- **Note:** the report says "can be any accessor", but the snippet is offered as the exact patch.
- **Fix:** `manifest: (n) => (Assets.lateManifest && Assets.lateManifest[n]) || null`. Add a Node test that builds the
  host with a ports table copied from §11.

### H2. A module construction site left half-way is lost on reload; the letter repeats and the player pays again
- **Where:**
  - `serialize()` writes a slice with `open: 0` as soon as the model exists.
  - On reload, `restoreV3` skips `lgx_centre` because the site is not in `gs.sites` yet (`Game.js:925-929`:
    `if (!site) continue`).
  - The host's `offered` flag is not saved, so `update()` calls `call()` again. The letter is shown again (the
    condition is `!saved.open`), and `sites.offer` makes a fresh site.
  - The 50,000 coins paid in `tryBuild` and every plank and ingot the porters already delivered are gone.
  - Deliveries of 150 planks and 80 ingots take minutes, so a reload in between is likely.
- **Repro (code path):** start the centre site, deliver some planks, save, reload. `host.call()` runs again (`host.js:75-83`).
- **Fix:**
  - Save `offered`.
  - Have `addModuleSite` restore its own entry from `sv.sites[def.id]` (`site.start(d.b, { instant, got, t })`) when it
    exists.
  - Do not toast the letter when the site is already offered or started.

### H3. Goods a shop cannot take return to the racks, but the money stays: an infinite money loop
- **Where:** `model/LgxModel.js:381-393`. Shop orders are paid at the counter (`settle`, wholesale × 1.15) before
  delivery. In `deliver()`, what the shop refuses goes back to the racks (`stock.add(k, goods[k] - took)`), and nothing
  is refunded.
- **When it happens in the game:**
  - the chief tops a shelf up at the v4 delivery pad (that pad uses `fullRoom`, which P32 leaves alone);
  - the v5 vehicles module restocks shops through `shopTargets`;
  - a shop burns down (v8 incidents);
  - a `gone` order is restored on reload before Growth is ready (`deliverFn` returns `{}`).
- **Repro:** `node $S/node/exp1.mjs`, section `A_refuse` (fake shops refuse). In 600 s, 105 items entered the centre,
  `acc.out` = 0, yet 312 items were settled for 1,766 coins. The same goods were sold three times. The builder's own
  stress test asserts "owners still settle".
- **Fix:** settle only what the shop accepted. Either move shop settlement to delivery, or refund
  `orderValue(kind, returned)` from `cash` (and `tot.coins`) when goods come back. Add a test that asserts
  coins ≤ value of items out.

### H4. No collision or occluder: the chief walks straight through the 11 × 8 m warehouse and the workshops
- **Where:** nothing in the module, and no port, adds a collider or an occluder for the centre, the producer stations,
  the till, the bench or the pallets (`grep -rn "collision\|occluder" src/city/logistics` finds nothing).
- **Why it matters:** the plan's ports table has no `collision` entry (the harbour has `collision.add`). The designer's
  spec says "촌장이 들어가거나…", so the chief should walk in through the door, not through walls, racks and the
  forklift.
  - Inside the footprint the chief's depth (y) interleaves with the band depths (−0.45 … +0.01), so he flickers between
    layers.
  - Behind the building (north side) he is hidden by the opaque shell, because there is no occluder.
- **Fix:**
  - Add `collision: { add }` and `occluders: { add }` ports.
  - Register footprint colliders along the walls with a gap at `doorPoint`, plus the outdoor props.
  - Make the shell an occluder, or treat the chief inside `footprintPoly` as a front-band actor with the roof revealed.
  - Give producer stations a collider like v4 workshops.

### H5. Vans and trucks appear and vanish as ghosts in the middle of 물류길, right in front of the door
- **Where:**
  - `layout.js:65`: `STAGE.inI = W + 2.8`, so vehicles spawn and despawn mid-street, 516 px left of the anchor and
    238 px from the door.
  - `floor.js:255`: they fade in over 0.6 s while already driving.
- **Why it matters:** the chief stands at the door to open the roof (the designer's main interaction), so every arrival
  is in view.
- **Repro:**
  ```
  PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers nice -n 15 node $S/node/critic_run.mjs --only=ghost
  ```
  The first `veh in` starts at rel (−512, 191), with alpha 0.06.
- **Evidence:** `$S/shots/ghost_strip.png` (and `ghost_0..3.png`) shows a translucent red van materialising on the
  asphalt.
- **Known issue #2** only covers the off-stage trips, not this visible pop.
- **Fix:**
  - Start and end routes at the street's real ends: `ave_c` north at j −24.2, or `lgx_st` west at i 37.5 and beyond the
    view.
  - Fade only off-screen (`view.onScreen`).
  - Better: hand vehicles to and from the vehicles module's RoadNet at a junction.

### H6. The rank-4 bar "물류 150 deliveries per game day" is only reached with a fake town that sells about 3× faster than v4
- **The fake town:** `sim_env.js` sells one item every 1.5 s, about 400 per day. The soak's 175–204 per day comes
  from that rate.
- **v4 rates:** `BALANCE.v4.founding.inlandEvery` is 40 s, so 15 items per shop per day. Four founded shops sell, the
  carpenter sells nothing. Add train visitors (`shopChance` 0.45, 2–4 items) and the total is roughly 100–150 per day.
- **Repro:** `nice -n 15 node $S/node/exp2.mjs`. With `sellEvery 4.6` (≈ 130 sales per day), deliveries per day are
  130, 165, 101, 119, 95, 134, 76, 82, and 76–128 with no homes.
- **Why it matters:** rank 4 (큰 도시) would sit just out of reach for a normal player, which is a progression softlock.
  The report's P17 text ("150 is about 9 shop orders") misleads.
- **Fix:**
  - Re-baseline the bar on a v4-rate simulation: lower it, count settled orders instead of items, or include
    harbour / beach / story shops in the centre's flow.
  - Make the fake town's default rate match v4 (`sellEvery ≈ 4.6`) so the soak measures what players will see.

### H7. The §11 sinks reroute v4's porters: village porters walk to the new town, and producers outrank shops and founding
- **Receiving pad:** `lgxReceiveSink` has no `remote: true`. In `Logistics.best` (`src/systems/Logistics.js:60`) every
  regular village porter may pick it. At `PRIO.STORE + 5` it beats the warehouse (10), so every surplus item is
  walked ~2,000 px to the new town instead of the warehouse. v4 marks every far sink `remote`
  (`Growth.js:128`, `Shop.js:76`).
- **Producer pads:** they use `PRIO.INPUT` (70), above `FOUNDING` (38), `SHOP` (35) and `SHELF` (40–45).
  - A freshly built furniture workshop absorbs about 30 planks per minute.
  - Until the racks' furniture cap (40) and its own pile (8) are full, that is ≈ 174 planks.
  - The factory competes with the toolsmith for ingots on equal priority.
- **Fix:**
  - Mark the receiving pad `remote: true` (station porters only), or give it a priority below `STORE`.
  - Give the producer pads a priority below `FOUNDING` / `SHOP`, or a budget per minute.
  - Test both with v4's `tools/test` porter scenario.

---

## Medium

### M1. The workshop makes runs of 8 identical pieces; the report's "never makes only chairs" is false
- **Where:** `LgxModel.choose()` (`model/LgxModel.js:523-528`) counts racks and ships but not the producer's own pile
  or the piece in the making, so the same "least stocked" item wins until a pickup.
- **Repro:** `node $S/node/exp1.mjs`, section `B_piles` / `B_open`.
  - Before opening, the piles are 8 × `item_chair` and 8 × `item_radio`.
  - Running, the longest run of the same piece is 8 for both producers.
- **Evidence:** the builder's own `docs/previews/logistics_lab_producers.png` shows a row of identical red chairs.
- **Off-stage pickup:** for the real M-plot placement, the pile simply vanishes at once, with no van in the village
  (`updateChains` calls `loadPile` immediately).
- **Fix:**
  - Count `outQ` plus `making` of all producers in `inPipe`, and round-robin on ties.
  - Show a small van stop or a "물류센터로 출발!" hop when the pile leaves an on-screen producer.

### M2. Furniture and appliances dead-end; the producers never pay back
- **Who buys them:** only homes (≤ 32, once each, 3 furniture + 1 appliance) and move-ins. No v4 shop sells them,
  although the designer wrote "가구 → 물류센터 → 가게·새 집으로".
- **The numbers:** one 살림살이 set pays ≈ 310 coins (sofa 70 + bed 80 + table 40 + fridge 120). Twelve homes give
  ≈ 3,700 coins against 21,000 coins (plus 30 planks and 30 ingots) for the two buildings.
- **After that:** once the homes are done, the racks cap, the piles stop at 8, and both stations idle for good, with the
  operator sweeping forever.
- **Fix:**
  - Add a furniture / appliance shop line (a story shop, or a founding card) or periodic replacement demand.
  - Or make the 살림살이 value and happiness scale so the chain is worth its price, and say so in tuning.

### M3. The bank manager's letter is unreadable in the real UI
- **Width:** the letter (`strings.js:6`) is 968 px wide at the v4 toast font (28 px Pretendard ExtraBold, measured with
  PIL). The English one is 1,367 px. The logical view is 720 px wide.
- **UI toast:** v4's `UI.toast` neither wraps nor shrinks (`src/scenes/UI.js:567-575`), so both ends are cut off.
- **Proxy:** `UIProxy.toast(msg)` (`Game.js:90`) drops the `hold` argument, so the 5.2 s hold becomes 1.5 s. The same
  happens to every hint the module times.
- **Fix:**
  - Show the letter as a banner (title + sub) or a letter card, or split it into two toasts.
  - Pass `hold` through `UIProxy.toast`.

### M4. §11 P32 `deliverBatch` puts stock on the shelf without any shelf sprites; home ids are unspecified
- **No refresh functions:** v4 `Shop` has no `refreshShelf` or `refreshLabel` (only `HouseLot.refreshLabel`). The
  shelf `ItemStack` shows sprites only for items that flew in, so a shelf restocked by the centre looks empty with
  `stock` at 20.
- **Home ids:** v4 `House` objects have no `id` (`src/entities/House.js:7-20`, use `site.id`), so a naive
  `lgxHomes(gs)` returns ids of `undefined`, `pollHomes` filters them out, and 살림살이 never happens.
- **Fix:**
  - Push up to `SHOW_PER_TYPE` sprites per delivered type, for example with `gs.spawnItem` or a fly from the shop door.
  - Specify `id = h.site.id` for village houses and `lotId` for `HouseLot`.

### M5. The `veh:freight` contract does not match the vehicles module
- **What the vehicles module does:** it emits `veh:freight` after it has already delivered, to `shopTargets` or
  `cargo` (`src/vehicles/model/fleet.js:86-92`). It has no `to: 'lgx'` target and no `reply` callback, so nothing
  produces the event the host expects (`host.js:105-107`).
- **Consequences:** inbound trucks will only come from producers until a real patch exists. The vehicles module also
  keeps restocking shops directly, which feeds H3.
- **Fix:** write the vehicles-side patch: a `lgx` stop kind, back-pressure through `api.inbound` returning accepted
  items, and the truck despawned at the hand-over. Exclude shops the centre `serves()` from `shopTargets`.

### M6. The module site `size: 'X'` gives placeholder art and an M footprint
- **Where:** §11 P1 step 6 creates the site with `size: 'X'`. `Site` knows S / M / L / XL (`src/entities/Site.js:19-24`).
  - `sprite(stage)` gives `site_foundation_X` / `site_scaffold_X`, which `Assets.sprite` turns into a placeholder
    (`Assets.js:706-710`).
  - `def` falls back to M (272 × 136 footprint, M work points).
- **Why it matters:** the largest building in v8 would be built on a placeholder box with two carpenters crowded at the
  centre.
- **Fix:** use `size: 'XL'` with a `drop` point on the forecourt (XL draws two L stage pictures).

### M7. Night: the forklift keeps doing 재고 정리 laps all night, contradicting "직원들이 퇴근해요"
- **Where:** `Forklift.arrive` (`model/floor.js:103-110`) never checks `m.working()`, and the forklift view shows the
  driver whenever the inside is visible.
- **Repro:** `node $S/node/exp1.mjs`, section `C_night`: 9 tidy laps between 22:36 and 04:48 with `working: false`.
- **Clerk:** owners queued at closing are stamped "쾅!" while the clerk is hidden (`People.update` hides staff when
  `!info.working`).
- **Fix:**
  - Skip tidy laps when `!working()`. Park the forklift at N0 with the driver off-seat.
  - Keep the clerk visible while `queue.settling`.

### M8. With the chief at the door, a tap cannot close the roof
- **Where:** `LgxView.update:151` reopens it on the next frame (`d < 90 && !this.revealed`).
- **Repro:** `critic_run.mjs --only=chief` gives `afterTap: false`, then `nextFrame: true`.
- **Fix:** remember a manual close (`closedByTap` until the chief leaves 170 px), like the hover grace.

### M9. The roof chip shows two bare numbers ("18 · 101") with no words
- **Unused strings:** `today` ("오늘 배송 {n}") and `tillN` ("물류 금고 {n}") exist in `strings.js` but are never used.
- **The till pad:** it looks like v4's collectable cash pads, but standing on it does nothing (it empties itself every
  15 s).
- **Why it matters:** a non-coder cannot tell what 18 means.
- **Fix:** add short labels, or show them on tap of the chip. Give the till a small "자동" hint, or make it collectable
  like v4 pads.

### M10. The v4 completion banner shows a raw key for the producers
- **Where:** `makeBuilding` calls `ui.banner(t('builtDone', …), t('bsub_' + bkey))` (`Game.js:1110-1113`). §11 P27 adds
  `b_furniture_workshop` / `b_appliance_factory` but no `bsub_*`, and `t()` returns the key when it is missing
  (`strings.js:563-570`).
- **What the designer sees:** "bsub_furniture_workshop" under "가구 공방 완성!".
- **Fix:** add `bsub_furniture_workshop`: "판자 3개로 가구를 만들어요", and `bsub_appliance_factory`:
  "주괴 3개로 가전을 만들어요" (plus English).

---

## Low

- **L1. Owner looks change across a reload.**
  - `restore` uses `look: { seed: hashStr(r[1]) }` (`LgxModel.js:662`), while live shop orders use the shop's own
    `look` (`exp1.mjs` `D_looks`: 4 of 4 changed).
  - Story owners lose their `lookOf` look and name.
  - Fix: re-derive from `env.shops` / `ports.lookOf` at the next poll, or save a small look id.
- **L2. `fitLogistics` can drop paid orders and trim homes.**
  - It drops paid (`s`), not-yet-gone orders and returns their goods to the racks (`save.js:84`), which duplicates
    them. In `exp1.mjs` `E_fit`, 4 paid orders were dropped and bread went from 50 to 86.
  - Trimming `lv3` to 8 (`save.js:90`) silently loses happiness, and those homes get re-furnished and pay again.
  - Fix: never drop settled orders; shorten ids instead. Store `lv3` as a count plus a compact id hash if needed.
- **L3. A lagging `day` floods `lgx:day`.**
  - A save whose `day` lags the clock emits one `lgx:day` per missing day in one frame (`LgxModel.js:83`). In
    `exp1.mjs` `F_days`: 5,000 events, to the newspaper / rank listeners.
  - Fix: clamp the catch-up to `tune.days` and emit one summary event.
- **L4. The diary line ignores what was delivered.**
  - The 살림살이 toast always starts with "새 소파가 왔다!" and then cycles "텔레비전에서 노래가 나와!" and so on
    (`host.js:166`), even when no sofa or TV was delivered.
  - The quote is glued to a system message with two spaces and nobody saying it.
  - Fix: pick the line from `ev.items`, and attribute it ("○○네: …") or move it to the story diary.
- **L5. The integration notes for the police station are stale.**
  - §11 P19b is out of date: `src/city/incidents/layout.js:18-23` already defaults to placement A
    (`POLICE_PLACES.A`). Applying P19b as written would edit `POLICE_PLACES.plan`.
  - The incidents police car never calls `api.laneBusy()`, so it can share the dock lane with a reversing van (its
    patrol exit runs down i 53.5).
- **L6. Vehicle sprites stay up when the view goes far.**
  - `Docks.setVisible` only sets a flag (`view/Docks.js:148`), so vehicle bodies, shadows and overlays stay visible
    (frozen) in the display list when the view goes far.
  - Fix: hide them like `Forklift.setVisible`.
- **L7. The language is fixed when the view is built.**
  - `LgxView` caches `lang` at construction (`LgxView.js:29`), and the nameplate (ko / en art) is chosen once.
  - A language switch in settings leaves Korean toasts and a Korean sign.
- **L8. Korean and unused strings.**
  - "싶어해요" should be "싶어 해요" (보조용언 띄어쓰기).
  - "이사 온 집에 가구를 보냈어요" also sends an appliance: say "가구와 가전을 보냈어요".
  - `site`, `stockLow`, `producerOpen`, `pickupVan` and `waiting` are never shown. `producerOpen` would be a nice
    first-work toast.
- **L9. People pop in and stack up.**
  - Two van owners wait on the exact same kerb pixel (`walks.pick` / `wait`; `exp3.mjs`: max 2 stacked).
  - Walk-in owners pop in and out at the sidewalk end with no fade.
  - Fix: offset kerb waiters by 18 px each, and fade walkers at the edge of the view.
- **L10. Residency accounting and anim notes.**
  - P4's region list makes the inside pages (11.6 MiB) resident whenever the camera is near, not only while revealed
    as the report states.
  - The dockhand uses `wave` and `happy`, which are on-demand social pages. The report lists the rig anims without them.
  - With cityfolk (≈ 37–48 MiB) and the vans, a busy new-town view adds ≈ 100 MiB to v4's ≈ 200 MiB village baseline
    against the 300 MiB target (`BALANCE.v4.tex`). Measure in the real game.

---

## Integration verdict per §11 patch (against current `src/**`)

| Patch | Works as written? | Notes |
|---|---|---|
| P20 balance | yes | `lgxTuning` shallow merge is fine |
| P19 streets / WORLD.v8 | yes | the plan checker copy (`later_logistics_runtime/layout_variantA.py`) re-run: "no problems" |
| P19b incidents | stale | already applied in incidents (L5) |
| P3 / P5 | yes | anchors exist |
| P4 Residency | partly | the region keeps inside pages resident; C2 still needs lazy re-creation |
| P1 / P29 Game | **no** | `view.rect` shape (C1); `lateManifest` call (H1); in-progress site lost (H2); `size: 'X'` (M6); `UIProxy.toast` drops `hold` (M3) |
| P27 Civic / makeBuilding | **no** | reload crash and missing producer position (C3); missing `bsub_*` (M10); no collider (H4) |
| Sinks | **no** | receiving pad not `remote`; priorities (H7) |
| P32 Shop / Growth | partly | the `serves` guard is fine; `deliverBatch` shows no shelf sprites and home ids are unspecified (M4); the bounce exploit (H3) |
| P17 Rank | risky | the bar is reachable only at inflated sales (H6) |
| Feeds: vehicles | **no** | the contract does not exist on the vehicles side (M5) |

## Evidence index

- `$S/shots/late_closed.png`, `late_open.png`, `late_producers.png` (C2)
- `$S/shots/rect_viewRect_port.png` (C1)
- `$S/shots/ghost_0..3.png`, `ghost_strip.png` (H5)
- `$S/node/exp1.mjs` (H3, M1, M7, L1–L3), `exp2.mjs` (H6), `exp3.mjs` (L9), `p27_reload.mjs` (C3)
- `$S/node/critic_run.mjs` (browser scenarios `late`, `rect`, `ghost`, `chief`), `$S/root/critic/lab_late.js` (lab copy with
  late pages), `$S/node/run_lab_copy.mjs` + `$S/labcopy/` (builder's lab re-run)
- Builder's captures: `docs/previews/logistics_lab_producers.png` (identical chairs), `logistics_lab_closed.png`
  (left-edge van at the stage edge)
