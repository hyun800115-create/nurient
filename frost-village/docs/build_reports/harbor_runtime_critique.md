# harbor_runtime (v6) — adversarial review

Reviewer pass on `src/harbor/**`, `tools/test/harbor_lab/**`, `docs/previews/harbor_lab_*` and
`docs/build_reports/harbor_runtime.md`. I checked it against:

- `docs/v5_v8_plan.md` (§3, §4.1, §4.3, §5, §6.4, §8–§10)
- `docs/기획서_v6_항구도시.md` and `docs/기획서_v5_v8_개발계획.md` §4
- `docs/CONTRACT_V6.md`
- the real v4 code in `src/**`, read on 2026-10-10 while the v4 workflow is running

The module's files were treated as read-only. Nothing under `src/**`, `assets/**` or `docs/previews/**` was changed.
All probes ran from the scratch folder
`/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/later_harbor_runtime/` (called `$S`
below), with `nice -n 15` and one Chromium at a time. The lab ran from a private copy of the runner, `$S/run_lab_copy.mjs`.
That copy writes its captures to `$S/lab_out/`, never to `docs/previews`.

**Verdict: polish (but fix both criticals before any integration).**

**What holds up**

- The pure model is careful and robust:
  - the hull-booking scheduler
  - analytic ship poses
  - seeded streams
  - the never-throwing sanitizer
- I drove the real flow, not the idealised one the shipped test uses, through 53 reloads. The steps were built at random
  times, with trawlers launched and stars raised mid-day. No two hulls ever met and no hull touched land.
- The art direction in the lab is charming.

**What is wrong**

- **Integration section (§11).** If it is applied as written, the harbour arrives without ships, music or most sounds.
  Every revive step costs 100 coins. A half-built step is lost on reload.
- **Promises the game does not keep.** Several in-game texts, events and imports promise things that never happen.
- **Event payloads.** They are misread by the sibling modules (beach, missions) in ways that inflate or auto-complete
  their counters.

Most fixes are local.

| Severity | Count |
|---|---|
| critical | 2 |
| high | 6 |
| medium | 14 |
| low | 12 |

---

## 0. 디자이너용 요약 (쉬운 말)

- **좋은 점**
  - 항구 그림이 정말 예뻐요. 여객선 갑판의 손님, 크레인 상자, 경매사, 눈 덮인 잠든 항구가 잘 보여요.
  - 배끼리 부딪히거나 배가 땅에 올라가는 일은 한 번도 없었어요. 저장을 53번 다시 불러와도 그랬어요.
- **꼭 고쳐야 할 점 1: 게임에 붙이는 설명서대로 하면 배가 안 보여요.**
  - 설명서대로 하면 여객선·화물선·원양어선 그림을 아무도 불러오지 않아요. 바다에 배가 한 척도 안 나타나요.
  - 항구 음악, 경매 종, 크레인 소리도 안 나요.
- **꼭 고쳐야 할 점 2: 공사 현장이 거의 공짜예요.**
  - 설명서대로 하면 항구 7단계 공사가 모두 100코인과 판자 6개로 끝나요. 원래는 12,000코인부터예요.
  - 첫 현장 "동쪽 철길 잇기"는 솔방울 식당 건물 위에 깔려요.
  - 짓는 도중에 저장하고 다시 켜면 낸 돈과 판자가 사라져요.
- **약속만 하고 안 되는 것들**
  - 수입품이 있어도 아무것도 바뀌지 않아요. 설탕이 와도 케이크를 못 만들고, 유리가 와도 창문 집이 안 생겨요.
    "빵집에서 케이크를 만들 수 있어요"라는 배너만 떠요.
  - "큰 상인이 왔어요: **item_can** 30개를 비싸게 사 간대요"처럼 프로그램 이름이 그대로 나와요. 사 가지도 않아요.
  - 사진사가 오면 "명성 +5"라고 하는데, 명성은 오르지 않아요.
- **다른 부품과 숫자가 안 맞아요**
  - 해변 쪽이 여객선 손님을 약 4.6배로 세요.
  - "경매 한 번 참여하기" 미션이 아무것도 안 해도 저절로 끝나요.
  - 수출 계약은 내일까지인데, 미션은 오늘 저녁 6시 21분에 끝나 버려요.
- **수출 짐은 촌장님이 직접 다 날라야 해요.**
  - 트럭이나 짐꾼이 수출 부두로 가는 길이 아직 어디에도 없어요.
- **화면에서 보이는 문제**
  - 경매 발판은 경매장 건물 뒤에 숨어 있어요. 지붕 위 글자만 보여요.
  - 화물선이 떠나는 순간 상자 더미가 2개에서 6개로 갑자기 늘어나요.
  - 등대 불빛이 바다만이 아니라 마을 지붕과 나무 위도 쓸고 지나가요. 등대 몸통 위에도 그려져요.
  - 사람들이 두 배 속도로 걸어요. 게임용 인형을 붙이는 설명서 코드가 걸음을 두 번씩 세서 그래요.
- **돈 계산**
  - 항구 7단계와 원양어선 2척에 약 15만 코인이 들어요. 4시간까지 놀아도 번 돈은 약 11.6만이에요.
  - 원양어선은 한 척에 3만인데, 1분에 약 200코인을 벌어요. 본전을 찾는 데 2시간 반이 걸려요.

---

## 1. What was re-run

| What | Result | Evidence |
|---|---|---|
| `node --test harbor.test.mjs purity.test.mjs` | 19/19 pass, 3.3 s | `$S/probes/node_tests.out` |
| Lab `smoke` (private runner copy) | Reproduces the builder's numbers: 9 draw calls, 70 module display objects, no errors, no placeholders | `$S/lab_out/harbor_lab_numbers.json` |
| P1 real-flow collision stress: 6 seeds × 12 game days, random step times, trawler orders, ★ raised, 53 reloads | 0 hull overlaps, 0 hulls on land, 0 dropped trips | `$S/probes/p1_flow_collide.mjs` / `.out` |
| P2 reload, event contracts, economy (20 game days) | Findings H3, H4, M5, M9, L1, L2 | `$S/probes/p2_reload_events.mjs` / `.out` |
| P3 geometry: P7 sea margin, site spots against the v4 layout, 4-coach main line | Findings C1, M1, L8 | `$S/probes/p3_geom.mjs` / `.out` |
| P4 save: worst-case slice, reload duplicates, crafted fleet | Slice 1,215 B worst case (cap 2,048); findings L1, L10 | `$S/probes/p4_save.mjs` / `.out` |
| P5 the P6 doll adapter against the real `DollSprite` / `DollPool` | Animations run at 2× | `$S/probes/p5_doll_double.mjs` / `.out` |
| P6 pacing: steps at the plan's smart minutes, perfect exports | ★2 at 152.7 min (plan ≤ 152); think-bot 171.5 (plan ≤ 168) | `$S/probes/p6_pacing.mjs` / `.out` |
| P7 replan CPU in isolation | Median 3.2–4.0 ms at 05:00 with everything built | `$S/probes/p7c_replan.mjs` / `.out` |
| P8 tourists at night | Up to 21 tourists outdoors at midnight, 10 of them "shopping" | `$S/probes/p8_night.mjs` / `.out` |
| Lab reviewer scenarios: `cargodep`, `guests`, `zoom12`, `nightbeam`, `pads` | Captures listed per finding | `$S/lab_out/harbor_lab_rv_*.png`, `rv_*_pair.png`, `rv_beam_tile.png` |
| Builder captures and GIFs | Frames tiled | `$S/gif/night_tile.png`, `$S/gif/reveal_tile.png` |

---

## 2. Findings

### CRITICAL

#### C1 — §11 P29 "module site" does not work against the real `Site`

- **Effect.**
  - Every revive step costs 100 coins + 6 planks and takes 8 s.
  - The first site is a generic plot sitting on 솔方울 식당.
  - Half-built steps are lost on reload.
- **Cost, time and name are ignored.**
  - The patch passes `cost`, `time` and `name` inside `cfg`. `Site.start()` never reads them: it calls
    `buildCost(bkey, this.id)`, and the build menu does the same (`Civic.choices` → `buildCost(k)`).
  - `buildCost` looks up `BALANCE.buildings[key]`. The harbour keys `fish_auction`, `lighthouse`, `ferry_terminal`,
    `harbor_crane`, `shipyard`, `train_station` and `trawler_big` are not there.
  - So it falls back to `{ coins: 100, item_plank: 6, item_ingot: 0, time: 8 }`
    (`src/entities/Site.js:27–32`, `src/systems/Civic.js:131–150`).
  - The whole 89,000-coin revive chain, and each 30,000-coin trawler, would cost 100 coins.
- **The railExt site is a generic plot.**
  - It has `key: null`, because `EFFECTS.railExt.wakes` is empty (`src/harbor/model/revive.js` `site()`), so the patch
    makes `only: null`.
  - `Civic.choices` then offers the full M menu (houses, shops, decor). Picking any card pays that card's price.
  - `finish()` (module mode) then reports `built` for `h_step_railExt`, and the harbour opens. Nothing is built.
- **Labels show raw keys.** They are `t('plotOnly_fish_auction')` and `t('b_<key>')`. These keys do not exist in
  `src/data/strings.js`, so the raw key shows in the Korean UI.
- **In-progress module sites are lost on reload.**
  - `Game.restoreV3()` (`src/scenes/Game.js:919–931`) runs in `build()`. It skips any saved site id it cannot find in
    `this.sites` (`if (!site) continue;`).
  - The harbour host is created later, in `update()` (P1 step 3). Its sites do not exist yet at restore time.
  - The host then re-offers a fresh plot. The coins paid in `tryBuild` and the planks already delivered are gone, and the
    next save drops the record.
- **Repro.** Read `Site.start` and `Civic.choices` with `cfg.cost` set. Or, in a scratch copy, construct
  `new Site(gs, 'h_step_auction', { x, y, size: 'M', only: 'fish_auction', cost: {...} }, 'plot')` and call
  `gs.buildChoices(site)`: the only card costs 100.
- **Fix (exact).**
  1. Add a module branch:
     - in `Site`: `this.cost = cfg.cost || null`
     - in `buildCost` callers: `site && site.cfg.cost ? Object.assign({ time: site.cfg.time }, site.cfg.cost) : buildCost(...)`,
       used in `Site.start`, `Civic.choices` and `UI.selectCard`
     - labels from `cfg.name`
     - a module site is not a menu: its pad pays directly, like `Game.makeTowerSite` / `site.start('watchtower')`, with
       `kind: 'tower'`-like handling.
  2. Give railExt a non-null `key` (`'rail_x'` or a dedicated `'h_rail'` marker) and `only` so no menu opens.
  3. Restore: keep module sites in a `pendingModuleSites` map during `restoreV3`. `addModuleSite` then restores
     `{ b, st, got, t }` from it when the host re-offers the same id. Never re-offer a step whose site record exists.
  4. Add an integration test that offers each step and asserts the card price equals `HARBOR_TUNING[step].coins`.

#### C2 — In the game nothing would ever request the ship atlases or most harbour sounds

- **Effect.** No ferries, cargo ships or trawlers appear. There is no `bgm_harbor` / `amb_harbor`, and no ferry bell,
  crane, auction bell or rope creak.
- **Ship atlases are only requested through a call that does not exist.**
  - The view asks for a ship's art only via `ports.assets.want([atlas])` (`view/HarborView.js` `wantArt`, used in
    `view/Ship.js` `Fleet.update`). Until the art is ready the ship is skipped (`continue`).
  - The §11 ports table maps that to `Assets.want ? Assets.want(keys) : null`. `Assets.want` does not exist in v4: the
    API is `Assets.loadFragment` / `lateWant` / `Residency.want` / `Residency.demand`. So the call is a no-op.
- **Late files only load when asked for.** They are gated by `Game.lazyAllowed` → `Assets.lateAllowed`
  (`src/scenes/Game.js:347–356`).
- **Prefetch covers almost nothing.**
  - `HARBOR_MODULE.prefetch` requests only the harbour pages, `ship_seagull` and 3 sounds. P3's `USED_ONLY` merely
    filters a fragment's file list; it does not request anything.
  - The harbour-only P1 form in §11 never calls `prefetch` at all. With that form even the harbour building pages never
    load: `put()` returns null and `Statics.late()` waits forever.
- **Water sheets are never asked for.** `fx_splash_big` (launch and haul) is never put through
  `WaterSheets.want('fx_splash_big')`, so it also never loads (`src/systems/Water.js` `WaterSheets.allowed`).
- **Why the lab hides it.** The lab preloads every manifest file, so it cannot show this.
- **Repro.** Grep `src/core/Assets.js` for `want(`: only `lateWant` (a Set) and `loadFragment`. Follow
  `Fleet.update → artReady false → wantArt → ports.assets.want → null`.
- **Fix.**
  - `assets.want: (keys) => Assets.loadFragment(gs, 'ships', { only: keys })` (it de-duplicates), or
    `gs.residency.demand(keys)` once P4 lands.
  - Call `HARBOR_MODULE.prefetch(gs, { fragment: (n, o) => Assets.loadFragment(gs, n, o) })` in the harbour-only P1 block.
  - Extend the prefetch audio list to all `FRAGMENTS.audio4` keys (they are small).
  - Call `WaterSheets.want('fx_splash_big')` before the first splash.
  - Add a lab mode that starts with only the prefetch files and asserts that ships appear.

### HIGH

#### H1 — The P6 doll adapter double-ticks every harbour person

- **Effect.** All harbour people (tourists, crews, auctioneer, deck passengers) animate at 2× speed and count twice
  against the rig caps.
- **Cause.**
  - `makeDollRig` (§11 P6) does `new DollSprite(...)` and then `DollPool.of(gs).add(d)`.
  - `DollSprite`'s constructor already calls `this.pool.add(this)` (`src/entities/DollSprite.js:79–80`).
  - So the doll sits in `pool.dolls` twice. `DollPool.update` ticks it twice per frame: a 10 fps walk plays at 20 fps.
  - `assign()` also gives each doll two list entries, so `maxRigs` / `maxLite` fill at half the real count. The doll can
    flip between a full and a lite rig.
- **Repro.** `node $S/probes/p5_doll_double.mjs` → "game's own dolls … 1 s = 2 frames" vs "with the adapter's extra
  add … 1 s = 4 frames".
- **Why the lab hides it.** The lab uses `TownfolkSprite2` rigs, so this cannot show there.
- **Fix.**
  - Delete `DollPool.of(gs).add(d);` from the adapter.
  - In `destroy()` call only `d.destroy()`: the constructor-registered entry is removed by `DollSprite.destroy`.

#### H2 — The site spots collide with buildings, streets and the track (§11 P29 places M plots at the `revive.js` spots)

- **Effect.** As soon as they become M plots, the sites overlap buildings, streets and the rail.

| Step | Spot (i, j) | Problem |
|---|---|---|
| `railExt` | (46.4, −2.6) | Inside the footprint of v4 `t_rest` 솔방울 식당, anchored at (45.8, −1.9) with `footprintM` [3.2, 3.0] = i 44.7–46.9, j −2.96…−0.84 (`$S/probes/p3_geom.out`). The foundation sprite and the site's collision circle (r ≈ 98 px) sit in the restaurant's front. |
| `station` | (63.6, −0.2) | On the j 0 rail line (rail cells j −1…1). |
| `auction` (68.3, −8.6), `terminal` (62.6, −8.6) | M plot spans about ±1.5 cells | The plots overlap the fish-auction / terminal footprints (to j −9.17) and block the quay lane j −8.4 that the crews walk. |
| Trawler order | (59.9, −8.75) | Inside the shipyard's footprint j range (−12…−8.46). |

- **Why the tests miss it.** The module's layout tests check pads as points, not M plots, and never against the v4 town.
- **Fix.**
  - Give each step a real site rect clear of buildings, streets and rail. The railExt spot east of the sign is free:
    about (47.6, −2.4); check it with `tools/test/v4_layout.mjs`.
  - Or build module sites as `S` pads with no plot sprite.
  - Add these rects to the layout test.

#### H3 — Imports open nothing in the game, but the banners say they do

- **What the player sees.** `harbor:import` shows a banner, e.g. "첫 설탕 수입! / 빵집에서 케이크를 만들 수 있어요".
  Crates then pile up at the warehouse (`trade.stock`).
- **What is missing.**
  - No patch in §11 and no module implements the cake recipe, the cloth wholesale, level-2 glass houses or the spice
    price.
  - §11's "Import effects" table says "hooks only … for v6 feature work". It names files but gives no patch.
  - Plan §10 has no patch for them either (P27 / P32 cover other things).
- **Why it matters.** The 기획서 lists "새 생산 사슬이 열림" as one of the four things the harbour does. As shipped, v6's
  import half is a sign with nothing behind it.
- **Fix.**
  - Write exact patches. The pieces exist:
    - `Workshop` multi-input recipes and the `item_cake` art for sugar
    - `Growth` restock for `t_cloth`
    - `House` level 2 for glass
    - `Seller` price for spice
  - Assign them to this module's §11, or move the banner text to "곧 …" until they land.
  - Each consumer should call `api.takeImport`.

#### H4 — Guest toasts show a code key and promise effects that never happen

- **Merchant: a code key and no purchase.**
  - `guest_merchant` "큰 상인이 왔어요: {item} 30개를 비싸게 사 간대요" is filled with `ev.item`, the raw key
    (`host.js` `onModel` → `ht(lang, 'guest_' + ev.kind, { item: ev.item })`).
  - The game shows **"큰 상인이 왔어요: item_can 30개를 비싸게 사 간대요"** (`$S/lab_out/harbor_lab_rv_merchant_toast.png`).
  - In 20 game days there were 10 such toasts (`p2` D).
  - Nothing buys 30 items: `tourists.js` only adds a guest with `wants: 5`.
- **Photographer: fame that never arrives.** `guest_photographer` promises "(명성 +5)". The module has no fame port, and
  missions does not listen to `harbor:guest`.
- **Fix.**
  - Name the item with `itemName(lang, ev.item)` and a correct particle: "통조림 30개를 사 가요".
  - Implement the merchant: add a temporary third contract `{ [item]: 30 }` at 2.5× price, due the same day. The model
    already supports up to 3 contracts.
  - Either emit `harbor:guest` with `fame: 5` and add the missions mapping (`fameAdd`), or drop the "(명성 +5)".

#### H5 — Event payloads mislead the sibling modules

Evidence: `$S/probes/p2_reload_events.out` C and D.

- **(a) The beach counts harbour tourists about 4.6×.**
  - `src/beach/host.js:196–197` treats every `harbor:ship(ferry arrive).n` and every `harbor:tourists.n` as a ferry
    arrival, whatever the `op`.
  - The harbour emits both events for each arrival, plus `harbor:tourists` with `op` leave / toTown / back.
  - Over 20 days: 1,393 real arrivals, 6,378 counted.
- **(b) The F9 daily "경매 한 번 참여하기" completes by itself.**
  - `harbor:auction` is emitted at every bell, 7 a day, even with `{ coins: 0, fish: 0, boxes: 0 }`.
  - missions `signals.js` counts each one as `auction: 1`.
- **(c) The D10 / B7 deadline is the wrong day.**
  - missions `missions.js:320–322` spawns D10 / B7 with `due: ev.leaves` (today 18:21).
  - The harbour contract is due `leaves + DAY` (tomorrow 18:21). The D10 card expires while the contract still pays.
- **(d) G4 "수출 왕" gets +1 for every expired contract.** An expired contract emits `harbor:export { n: 0, expired: true }`,
  and missions `n1(0)` = 1. See L1 for the reload duplicate.
- **Fix (harbour side, so all listeners agree).**
  - Emit `harbor:tourists` with `op: 'arrive'` only on arrival, or rename the others to `harbor:touristsMove`.
  - Emit `harbor:auction` only when `fish + boxes > 0`, and add `chief: <fish the chief dropped>`.
  - Emit expiries as `harbor:exportExpired`.
  - Document `due` as the deadline and ask missions to use `ev.due`.
- **Fix (sibling side).** Beach: filter `ev.op === 'arrive'` and use only one of the two events.

#### H6 — There is no delivery path to the export quay except the chief on foot

- **The senders the report names do not exist.**
  - Integration and §1 say trucks (`veh:freight { to: 'h_export' }`), porters (`delivered { pad: 'h_export' }`) and B7
    drives fill contracts. Nothing in `src/**` sends either event.
  - The vehicles drive routes `export` / `auction` stop at `'h:warehouse'`, `'h:export'` and `'h:auction'`
    (`src/vehicles/layout.js:137–138`). `PLACES` has no `h:*` entries, so `ChiefDrive.start` returns
    `{ ok: false, reason: 'stops' }`.
  - The harbour does not register `extraPlaces`.
- **What that leaves.** ★2 needs 200 exports and ★3 needs 800. A single ★1 contract is 133–380 items. The bag holds at
  most 26, and the export pad is about 7,000 px from the village.
- **Feed deliveries lose goods silently.** `onFeed('delivered' | 'veh:freight')` drops `m.deliver`'s `took`. If a sender
  is ever added, over-deliveries vanish.
- **Fix.**
  - Publish `h:export`, `h:warehouse`, `h:auction` and `h:ferry` as `extraPlaces` (px from `PADS` / `BLD`) through the
    vehicles API.
  - Map `veh:driveDone { route: 'export' }` → `api.deliver`.
  - Return the leftover in an event (`harbor:exportLeft`) so the sender can keep the rest.

### MEDIUM

#### M1 — P7 sea margin has the wrong sign: the chief can walk 0.72 cells out over the water

- **Cause.** The patch blocks when `isSea(i, j + 0.72)`. The sea is j < −12, so the test passes only for j < −12.72.
- **Evidence.** At (70, −12.3), (70, −12.6) and (70, −12.7) the point is sea but not blocked (`$S/probes/p3_geom.out`).
  That is about 50 px of the chief's feet on the water in front of the quay wall.
- **Contrast.** The v4 north shore keeps 46 px inland (`Collision.js:55`).
- **Fix.** `isSea(q.i, q.j - 0.72) || isSea(q.i - 0.5, q.j)`. The second test adds a margin at the west wall.
- **Test.** Points 0.3 cells inside the quay are blocked; quay-lane points are not.

#### M2 — P19 rail `to: 98` connects the rail before 동쪽 철길 잇기, and street `region` is ignored

- **The rail is painted before it is built.**
  - `RoadPaint.paintRails` paints k `from…to` unconditionally, with the buffer stop at `to`. `RoadNet` fills rail cells
    the same way (`RoadPaint.js:156–165`, `RoadNet.js:174–178`).
  - At v6 install the buffer stop at k 46 disappears. The track runs on into the fog before the player "extends" it, so
    the railExt build changes nothing visible.
- **Street regions are by x.**
  - `RoadNet` assigns `region` by x only: `'town'` east of `townX` (`RoadNet.js:129, 169`). The new streets'
    `region: 'harbor'` is ignored.
  - So `blvd_h` and the quay lane are routable by Roads as soon as the town is open.
- **Fix (exact patches).**
  - `RoadPaint.paintRails`: `const to = gs.territory.isOpen('harbor') ? R.to : (R.toV4 || R.to)`. Invalidate `railRect` on
    `region harbor`, and paint `rail_x_end_p` at `to`.
  - The same cut in `RoadNet.buildCells` (rebuild on region open).
  - `region: s.region || (x >= townX ? 'town' : 'rail')` for street cells and edges.

#### M3 — P16 `areaOf(x, y)` is not passed `y` by existing callers

- **Where.** `Game.js:1691` (`T.areaOf(px)`, the overview frame) and `UIv4.js:181` (the train chip) pass only x.
- **Effect.**
  - In the harbour the overview frames the neighbours area (rail + town), not the harbour.
  - The v4 shuttle's chip shows while standing in the harbour.
- **Fix.** Add `this.player.y` / `gs.player.y` at both call sites. Add `'harbor'` to the overview's area list.

#### M4 — P23: the harbour and beach Water regions overlap

- **Overlap.** The harbour region is `{x 4400, y 3330, w 5600, h 1600}`; the beach `seaRegion()` is `{x 7100, y 4300, w 3800, h 1700}`.
  They overlap on x 7100–10000 × y 4300–4930.
- **Effect.** Two shader passes with different palettes stack on the outer sea east of the breakwater. The report says
  the two must not overlap and that the harbour "ends at x 10000", but the y overlap was missed.
- **Fix.** Split at one line both modules use, e.g. the rocky point i 88: harbour sea for i < 88, beach for i ≥ 88, as
  masks in the Water options. Or keep one shared Water instance (`ports.water.region`) with a per-area palette.

#### M5 — A reload replans the whole day with today's state: ghost ships

- **Cause.** `HarborModel` plans the current harbour day from −∞ with the current steps (`ensurePlan(T, true)`). In the
  live session, missions whose wish time was before the step's `replan(T)` were never placed.
- **Repro.**
  - Build the crane at 12:00 and reload at 13:00. A cargo ship `c3` now lies at the quay; it never arrived and has no
    contract. The crane works on it (`resumeBerth`), while the export chip says "화물선이 떠났어요".
  - Terminal at 10:54, reload: a ferry that never arrived sits at the berth and departs.
  - Evidence: `p2` A and B, and `$S/lab_out/rv_cargo_pair.png`, where the lab's own `setup()` at 17:30 already shows it.
- **Fix.** Save `planFrom: T` of the last replan per harbour day in the slice (+12 B). Use it as `from` when replanning
  that day on load.

#### M6 — Lighthouse beams sweep the town and paint over the tower

- **What the captures show.**
  - The two ADD wedges rotate the full 360° at `DEPTH.FX − 28`.
  - Half of each turn crosses the boulevard, trees, rail and quay roofs.
  - The near wedge is drawn over the tower body and the keeper's house.
  - Evidence: `$S/lab_out/rv_beam_tile.png` (frames 2 and 4), `$S/gif/night_tile.png` (frame 5).
- **Design intent.** "두 줄기가 바다를 쓸어요".
- **Fix.**
  - Fade each wedge by its angle: alpha × smoothstep over the sea sector, screen angles about 100°–260°, so the beam
    dims to 0 over land.
  - Draw the wedge that points up-screen below the tower (`depth = tower.depth − 1`) and the other above it.
  - Start the beam at the lens radius, not its centre.

#### M7 — The auction pad and the trawler-order spot are hidden behind their buildings

- **What happens.**
  - The 경매 발판 at (66.6, −8.6) is 0.6 cells behind the fish-auction footprint. From the iso camera the hall's roof
    covers it, and the chief standing on it is invisible (`$S/lab_out/rv_pads_pair.png`, left).
  - Only the chip floats above the roof.
  - The same happens at the trawler-order spot behind the shipyard (right).
- **How far x-ray helps.** In the game, v4 x-ray will fade the hall once the chief is behind it. But the player has to
  find the pad first.
- **"낙찰! +n" covers the chip.** The float rises at (hall x + 40, y − 150) straight through the pad chip
  (`docs/previews/harbor_lab_auction.png`). Unlike the coin fly, this float is a real game float.
- **Fix.**
  - Move the auction pad onto the open apron west or east of the hall, e.g. (64.9, −8.5) between the terminal and the
    hall, or onto the quay in front (j −11.6).
  - Do the same for the trawler-order spot (e.g. (61.0, −8.4), clear of the shipyard).
  - Raise the sold float above the chip, or offset it sideways.

#### M8 — The cargo ship's deck refills at the moment it leaves

- **Cause.**
  - `Fleet.opts` shows `C.loaded` only while `crane.ship === M.id`. Otherwise it shows 6 (`o.loaded = … ? 6 : 6`).
  - At `depart` the model clears `crane.ship`.
- **Effect.** The ship pops from 2 stacks to 6 as it pulls away (`$S/lab_out/rv_cargo_pair.png`, 18:18 → 18:25).
- **Fix.** Keep the last loaded count on the mission (`M.loaded`, set at depart) and show it until `gone`.

#### M9 — Balance: the harbour is a money sink and trawlers are a poor buy

Evidence: `p2` D and E, `p6`.

- **Tourists.** About 3,080 coins per game day, i.e. about 308 coins / real min (all steps, no trawlers, no exports).
- **Trawlers.** About 199 coins / min each, against 30,000 coins + 80 planks + 40 ingots. Payback is about 150 min.
- **Pacing run (perfect instant exports, 2 trawlers).**
  - The harbour earns 115,868 coins between minutes 106 and 240, about 860 / min.
  - It cost 89,000 for the steps + 60,000 for the trawlers, so it is still in the red at minute 240.
  - Plan §3.3 expects the harbour to lift income from about 3,500 to 5,500 / min by ★2.
- **Raw fish beats grilled fish.** On the auction pad raw fish sells for 6 (base 4 × 1.5). The v1 grilled fish sells for
  4 at the market, so carrying raw fish beats processing it.
- **Fix (in `tuning.js` only).** Tune in plan order:
  - `trawler.catch` 8 → 12 and `tunaPrice` 30 → 45, or trawler cost 30,000 → 15,000
  - `ferry.spendPerItem` 11 → 20
  - `auction.base.item_fish_raw` 4 → 2 (raw fish 3 at the pad)

  Re-run `p6`.

#### M10 — Happenings are staged off-screen and outside the StageDirector

- **What happens.**
  - The model proposes P7 / P8 about every 5 min; `HarborView.onModel` stages them at once.
  - P8 toasts "크레인 상자가 흔들흔들~" even when the camera is in the village.
  - P7's gull raid freezes while the view is far, because Gulls do not update off-view. It completes, with its toast,
    minutes later when the player returns.
  - It also emits `harbor:happening` to story, which may stage the same beat again.
- **What the plan says.** §5.7: one happening at a time; staged only within 1,200 px of the view.
- **Fix.**
  - Stage in the view only when `near(venue, 1200)` and no `ports.stage` exists.
  - Otherwise only emit, and let story's HappeningClock call `host.happening(id)`.
  - Drop a raid that is still pending when the view goes far.

#### M11 — The designer preview jumps the real game clock

- **What it does.** `HarborView.preview()` calls `ports.clock.jump(at)`, i.e. `gs.v4.clock.T = T`, up to 20 game hours
  forward.
  - This fires every bell, contract and ship event in between.
  - It advances TownSim, rent and the day.
  - The jump persists in the next autosave.
- **What the plan says.** §5.8: previews run on a throwaway copy and never save.
- **Fix.** Run the preview on a cloned model (`new HarborModel({ saved: m.serialize(), T: at })`) with a private clock.
  Restore the camera afterwards.

#### M12 — The coast train stays hidden behind the harbour station and lodge

- **Why.** P14 never adds the coast `Train` to `Neighbours.occlusionSubjects`, which iterates `this.train` only
  (`Neighbours.js:718–722`).
- **Why the report's fix falls short.** Registering the buildings as occluders (the report's suggested fix) does
  nothing without a subject.
- **Fix.** In P14 #4 iterate `this.trains` in `occlusionSubjects`.

#### M13 — Replan spikes are bigger than reported

- **Measured.** A full early-morning replan costs a median 3.2–4.0 ms on this desktop core (`p7c`). Under machine load a
  single tick hit 12–23 ms (`p7`, `p7b`).
- **When it happens.** A launch or step at 05:00, or a ★ change in the morning. On a phone that means a 10–15 ms hitch
  at a celebration moment.
- **Reported.** The report says 1.06 ms max.
- **Fix.** Reuse `planDayGen` for `replan()` (one mission per tick, as is already done for tomorrow). Keep the
  synchronous path only for load.

#### M14 — Export chip and deadline mislead

- **The chip shows the wrong deadline.**
  - The chip reads "… · 18:21 출항", but the contract is due tomorrow at 18:21.
  - After the ship leaves at 18:21, the chip still lists the order with the same time and no day, and no ship is at the
    quay.
- **"The ship left" before any ship came.** With no open contract, for example right after the crane is built and before
  the first ship, the chip says "화물선이 떠났어요".
- **Unfriendly bell countdown.** "다음 경매 342초" at night.
- **Fix.**
  - One rule (see H5c). Show "내일 18:21까지" or "오늘 18:21까지".
  - "11시쯤 첫 화물선이 와요" before the first ship.
  - "다음 경매 08:00" when the wait is more than 60 s.

### LOW

| # | Finding | Evidence | Fix |
|---|---|---|---|
| L1 | Expired contracts re-emit `harbor:export {expired}` on every reload, because `expired` is not saved. That gives 10 duplicates over 5 reloads with no time passing, and G4 can be farmed by reloading. | `p4` | Save `x: 1` per contract, or skip `due < loadT` on load. |
| L2 | 20 settlers are all homed at `h2_sailor_lodge`, which has 12 beds. With the office's 4 there are still only 16 beds. | `p2` D | Cap at 16 and split the homes. |
| L3 | Tourists "shop" at 00:00 (10 at midnight) and stand on the quay or platform at 03:00–05:00. | `p8` | Between 22:00 and 06:00, send tourists to the lodge or the terminal hall, out of view. |
| L4 | Text. The trawler-order site name reuses `trawlerOrder` "원양어선 주문 · 조선소에서 만들고 있어요" ("being built" before ordering). "크레인 + 세관" uses "+" in a site name; use "크레인과 세관". | `host.js` `offerNext`, `strings.js` | Add an `s_trawler` "원양어선 주문하기". |
| L5 | Audio. `Audio.play` ignores `pan`, so the "panned right" far horn is centred. TownSim keeps `amb_town` (camera-x based `nearTown`) and DayClock keeps `amb_night` 0.35 in the harbour. The music rectangle includes the town's SE corner (x 5300–6144, y 2900–3450). | `Audio.js:51–77`, `TownSim.js:758`, `DayClock.js:95` | Gate `nearTown()` on `areaOf(...) !== 'harbor'` (P16). Use the region rects for music. |
| L6 | The call. The railExt site is offered at once at rank 3, before the horn (the 기획서 order is horn → sign → site). The horn and rumours repeat after every reload until the harbour opens, because `callT` is not saved. | `host.js` | Offer the site from `call()`. Save `called: 1`. |
| L7 | Lab realism. There is no fog in the "reveal" (frame 1 already shows the whole harbour), no x-ray, no Site flow, and the rigs are `TownfolkSprite2`. That is why C1, C2, H1, H2 and M12 are invisible in the lab. | `$S/gif/reveal_tile.png` | Add a fog rectangle, a "prefetch-only assets" mode and a fake Site to the lab. |
| L8 | Future (v8). With the main line's 4th coach at 큰 도시, its tail at the town stop reaches i 35.15. The coast train's nose at the halt is at i 34.93, so the trains overlap. | `p3` | Move the halt to carA 38.0, or keep the 4th coach for the coast line. |
| L9 | ★3 "부두 랜턴" is not implemented. `lantern_string` exists in `life_props` and appears only in a comment. The plan's `npc_captain` on the ferry deck is replaced by a generic sailor doll, although `vil_npc_captain` exists. The cast reads as generic townsfolk (no sailor cap or breton; `townfolk_presets.json` `missingParts`). | `layout.js:147`, `Ship.js` `looks()` | Add a lantern string along j −11.9 at ★3. Use the captain sprite at `deckPoints[0]`. |
| L10 | A crafted slice with `trawlers 3 + ready 3 + building` plays 4 extra launches; `n` stays 3. | `p4` | Clamp `trawlers + ready + (building > 0)` ≤ max in `sanitizeHarbor`. |
| L11 | Fixed seed. Every player's harbour uses seed 20261010, so every save gets the same contracts, guests and rare-fish days. | `index.js` `create` | Seed from the save (`gs.v4.seed`) and store `seed` in the slice. |
| L12 | Budgets. The module's textures are 122.3 MiB against the 120 MiB budget until P24, which is a v4-owned tool. Lab totals are 407–435 MiB, near the 455 hard cap. Draw calls are 9–11 against a cap of 12, measured without fog or a real HUD. | `harbor_lab_numbers.json` | Re-measure after C2 with Residency on. Treat ≤ 10 calls as the lab gate. |

---

## 3. Balance, exploits and money (summary)

- **No coin printing found.**
  - Delivery pays only for items a contract still needs (`trade.deliver`). Expired contracts pay nothing.
  - Auction fish is conserved (the module's own test, and `p2`).
- **Cheap exploits.**
  - Reload-farming G4 (L1).
  - F9 completing itself (H5b).
  - Raw fish at the auction pad paying more than the grill line (M9).
- **★2 timing is on plan with perfect play.** 152.7 min against ≤ 152 for the smart bot; 171.5 against ≤ 168 for the
  think bot. The binding bar is "20 ships". Once H6 is real (the chief hauling everything), exports will lag.
- **Income is well below plan** (M9).

## 4. Integration section (§11) against the real v4 code

| Patch | Verdict | Notes |
|---|---|---|
| P17 dependency | correct | v4 `Rank` stops at level 2; the harbour never gates without P17. |
| P19 world / rail / streets | broken in parts | M2: the rail is painted to k 98 before railExt, and street `region` is ignored. World height 4864 leaves the strip x < 5200, y > 3450 fog-less and region-less (visible when the camera peeks 260 px below the town). |
| P20 | OK | |
| P3 | OK, but loads nothing by itself | See C2. `TF.T.generator.presets` exists. |
| P4 | incomplete | `Assets.want` does not exist (C2). |
| P1 harbour-only form | broken | No prefetch (C2). The ports table maps `assets.want` to a no-op. `coins.add` drops the tag, so the kit IncomeMeter cannot tell harbour pay apart. |
| P29 sites | **broken** | C1 and H2. |
| P7 | wrong sign | M1. |
| P14 | mostly OK | Anchors exist. `trackBlocked(…, rail)` works with `CoastLine.mAt`. Growth ignores coast stops. `occlusionSubjects` is missing (M12). |
| P10 | OK | The anchor exists verbatim. |
| P16 | incomplete | M3. The `camBottom` loop is fine. |
| P15 | OK as a fallback | `Audio.exists` and `setAmbience` exist. `amb_town` and `amb_night` leak (L5). |
| P23 | conflicts with beach | M4. |
| P6 / P5 adapter | **broken** | H1. |
| P22, P24 | OK as notes | |
| Cross-module | broken | H5 (beach, missions payloads), H6 (vehicles places and freight). |

## 5. What is good (keep it)

- **The scheduler.** Booked hull rectangles, sideways tug pushes, berths as bookings and analytic poses. I could not make
  two hulls meet through random replans, launches, star changes and 53 reloads (`p1`).
- **The save slice.** It is small (worst case 1,215 B), clamps everything, keeps the leading run of steps, and sanitizes
  without throwing.
- **The view.**
  - Layered ships on the live water, with wakes, deck passengers and funnel smoke.
  - The crane drawn twice so the jib passes over the deck.
  - Breakwater depth sorting.
  - Ruin tint → revive pop.
  - The auctioneer's bubble.

  The smoke, ferry, auction and trawler captures are genuinely charming.
- **The layout data.** Readable, with Korean comments, every number in one `tuning.js`, and a clear purity rule
  (`purity.test.mjs`).

## 6. Suggested order of fixes

1. **C2 asset requests, then C1 module sites with H2 site rects.** Without these, v6 cannot be judged in the game at all.
2. **H1** (delete one line), **H4** (strings + merchant contract), **H5** (event payloads), **M1**, **M5**, **M8**.
3. **H3 / H6 ownership.** Decide with the lead who writes the import effects and the export delivery paths, and add the
   exact patches to §11.
4. **Look and feel:** M6 beams, M7 pads, M10 happenings, M14 chip text, L3 tourists at night.
5. **Balance (M9).** Re-run `$S/probes/p6_pacing.mjs` after each change; it takes about 10 s.
6. **Lab.** Add fog, a prefetch-only mode and a fake Site (L7), so these classes of bug show up before integration.
