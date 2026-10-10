# beach_runtime (v7 햇살 해변): adversarial critique

Reviewer's scope: `src/beach/**`, `tools/test/beach_lab/**`, `docs/previews/beach_lab_*` and
`docs/build_reports/beach_runtime.md`, checked against `docs/v5_v8_plan.md` §4.4 / §5 / §6.5 / §8–§10, the designer's
`docs/기획서_v7_해변.md`, `docs/CONTRACT_V7.md` §W–Z, the sibling modules (`src/harbor`, `src/missions`, `src/story`) and the
real v4 code in `src/**` as it stands today (2026-10-10). The module's files were treated as read-only. Every probe,
runner copy and capture below lives in the scratch folder
`/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/later_beach_runtime/` (written `$S/` below).

## Verdict: **rework**

The pure model is good work:
- It is cheap (0.004–0.009 ms per tick on average), deterministic and seeded.
- The save slice is small (437 B) and survives fuzzing.
- It follows the beachfolk rules: `canPlay`, `pickAnim`, feet direction through `sunbatheDirFor`, and water anims only in the water.

The lab captures by day are charming and lively.

**But the module would not work in the game as integrated.** These are the critical/high problems:

- **The Integration block does not match v4.** It names APIs that don't exist, so the host throws in its constructor.
- **The art never appears.** The beach never asks for its main atlases and never retries once they arrive.
- **The sea would be frozen or missing.** Nothing in the game ticks the beach's Water regions.
- **The beachfront street is painted over by sand.**
- **Ferry tourists are counted five times.**
- **Every beach event and mission hook the designer asked for is dead in the game:**
  - 모래성 대회 (sandcastle contest) and the chief's pick;
  - 여름 불꽃놀이 (summer fireworks);
  - 북극곰 수영 대회 (polar-bear swim);
  - 잃어버린 튜브 (lost swim ring);
  - 해변 청소 (beach clean-up), 조개 (shells) and 꽃게 (crabs).
- **Nobody watches the fireworks.**

None of this shows in the lab. The lab:
- preloads every atlas;
- ticks the Water regions itself;
- holds the camera focus forever;
- has no snowfall and no collision;
- feeds events by hand.

**Count:** 2 critical, 10 high, 14 medium, 9 low.

| # | Sev | Finding (one line) |
|---|---|---|
| C1 | critical | Beach buildings, props and buoys never appear when their atlases arrive after construction, which is always the case in the game |
| C2 | critical | Integration port block names APIs v4 does not have; host constructor throws; story registration throws; asset port loads nothing |
| H1 | high | Nothing ticks the beach's Water regions in the game: frozen sea, async field never finishes |
| H2 | high | `blvd_b` (the beachfront street) is buried under the sand bake hook |
| H3 | high | One harbour ferry is counted 5× (22 rooms instead of 6, 33 tourists instead of 9) |
| H4 | high | Beach events and mission hooks are dead in the game (C11 / C12 / C13 / A20 / E8 / E9 / E11, P12 fame) |
| H5 | high | Fireworks: the watchers leave at once, and the bursts read as small rings low over the sea |
| H6 | high | Clean-up (E8) and walk-in (E7) have no guidance; the beach can stall before it opens |
| H7 | high | No collision: the chief walks through the hotel, shops, tower and pool |
| H8 | high | v4 snowfall keeps falling on the tropical beach (plan: "snowfall stops at the beach band's edge") |
| H9 | high | Economy ≈ 360 coins/min at ★3 (≈ 130 once Growth owns rent) against plan +2,500 |
| H10 | high | Draw calls 18–19.4 against the ≤ 12 gate (reproduced) |
| M1–M14 | medium | see §3 |
| L1–L9 | low | see §4 |

---

## 1. Critical

### C1. The beach's buildings, props and buoys never show in the game (late atlases, no retry)

**What happens.**
- `Beach.sync()` (`src/beach/view/Beach.js:28`) is the only place buildings, props and the buoy line are created. It runs:
  - at view construction;
  - on `beach:step`, `beach:shop {op:'open'}` and `beach:extras`;
  - when the sand signature changes.
- It calls `art.make/image/sprite`, which return `null` while `!Assets.has(key)` (`src/beach/view/art.js:15,20`).
  `addBuilding`/`addProp` then just `return` (`Beach.js:43,80`). Nothing retries when the atlas arrives.
- `addBuoys` stores an empty `buoys` entry even when no tile could be made (`Beach.js:102`), and `sync` never tries again
  (`!this.items.has('buoys')`, `Beach.js:35`).
- In the game the atlases are late fragments, and the module never asks for them:
  - `FRAGMENTS` (`src/beach/index.js:12`) is exported and used nowhere;
  - `prefetch` loads only `beach_nature`, decals and the sand;
  - `Night` asks only for `bbld_glow`.
- Contrary to report §11 ("The module asks for the files listed in FRAGMENTS … through `ports.assets.fragment`"), the
  module never requests `bbld_hotel`, `bbld_shops`, `bbld_civic`, `bbld_street`, `beach_play`, `beach_service`,
  `beach_shade`, `beach_tiles`, `beach_water`, `beach_crab`, the boat atlases, the beachfolk pages, the water fx sheets
  or `ship_yacht`.
- v4 already has the right pattern, and `art.*` bypasses it. While an atlas is pending, `Assets.sprite()` returns an
  invisible `fv_blank` stand-in, and `gs.lazyImage(img, key)` re-skins it on arrival (`src/core/Assets.js:688–697`,
  `src/scenes/Game.js:1013`).
- Result:
  - **First open:** buildings show only if the atlases happen to be loaded before the next step event.
  - **Every reload of a finished (★3) beach:** no step event ever fires again, so the beach stays empty forever.

**Repro.**
- Command: `nice -n 15 node $S/lab_late.mjs` (one Chromium, 12 s).
- Steps:
  1. Remove the nine `bbld_*`/`beach_*` building and prop atlases (keep nature and sand).
  2. `setup({stage:'full'})`.
  3. Load the atlases late with the lab's own `lateLoad`.
  4. Play 10 s.
- Output:
  - `before {items: 22, buoys: 0}`
  - `after {items: 22, buoys: 0, buildings: 0}`
  - `afterManualSync {items: 81, buildings: 17, buoys: 0}`: buoys never come back.

**Evidence.**
- `$S/shots/late_atlas_after_load.png`: a ★3 beach with no hotel, shops, parasols, loungers, tower or buoys. The doorman
  and receptionist stand on bare sand, and sunbathers lie on nothing.
- `$S/shots/late_atlas_after_manual_sync.png`: the same beach after one manual `sync()`.

**Fix.**
1. In `create`, or at `path`/`reveal`, request every `FRAGMENTS` entry through `ports.assets.fragment(name, { only },
   onReady)`.
2. Create pictures through `Assets.sprite()` (stand-in while pending) and register them with `gs.lazyImage`, behind a
   `ports.assets.lazy(img, key)` port.
3. Or keep a "wanted but missing" set in `Beach` and re-run `sync()` each second (cheap) until it is empty.
4. Never cache an empty `buoys` entry.
5. Add a lab group that starts with the beach atlases absent.

### C2. The Integration port block does not match the real v4 code (constructor crash, story crash, nothing loads)

Checked against `src/**` today:

| Port in report §11 | Reality in v4 | Effect |
|---|---|---|
| `clock.T: () => gs.clock.T`, `gs.clock.lightsOn/cur/addLight` | there is no `gs.clock`; DayClock is `gs.v4.clock` (`Neighbours.js:127`, `Game.js:591`) | `BeachHost` constructor calls `this.T()` → **TypeError, module never constructs** |
| `story.happenings: … gs.later.story.registerHappenings('beach', …)` | the story API (`story_runtime.md` §3) has no `registerHappenings`; `HappeningClock` has a fixed P1–P6 list | `host.js:48` calls it in the constructor → **TypeError whenever the story runs**. With the story present, `ownHappenings` is false, so P9–P12 never play |
| `stage: gs.later.stage // request/end/busy` | the kit does not exist; the story exposes `stage(kind, {venue, watch})` / `endStage(kind)` | `P.stage.request` is missing, so the host silently falls back to `LocalStage`: beach events can overlap a wedding (§5.7 rule broken) |
| `assets.fragment: (name, o) => Assets.mergeLate(gs, name, o)` | `mergeLate(f, j)` merges a **manifest**; loading is `Assets.loadFragment(scene, name, opts, onReady)` (`Assets.js:269,316`) | nothing is fetched (see C1); `Assets.fragments[gs]` is polluted |
| `view.focus: gs.cameraFocus(x, y, ms)` | `gs.focusCamera(x, y, ms)` (`Game.js:1333`) | TypeError at the reveal pan and the polar swim |
| `coins.add: gs.addCoins(...)` | `gs.economy.add(n, wx, wy, fly)` (`Economy.js:9`) | TypeError on the first payout |
| `water.village: () => gs.villageSea` | the village sea is `gs.ground.water` (`Ground.js:141–154`) | the polar swim has no swell or ripples |
| `sound.area/music: Audio.setAreaMusic` | does not exist yet (P15) | the reveal's crossfade calls undefined |
| `sites.offer: gs.addModuleSite`, `shops.restock: gs.growth.requestRestock` | do not exist (P29 / P32) | see M13 |
| `dollRig.layers(): d.rig.images.length` | the `DollSprite` rig has `imgs`, not `images` (`DollSprite.js:161`) | `host.objects()` throws once a doll is materialised |
| `dollRig.show` for `beachLooks = looksFrom(new Beachfolk(TF.T))` | `Beachfolk` lives in `tools/beachfolk_compose.js`; v4 `Townfolk.js` has no beach generator | see M12 |

**Repro.** Read the block in `beach_runtime.md` §11 next to the cited v4 lines. With `ports.clock` built as written,
`new BeachHost(ports, null)` throws `Cannot read properties of undefined (reading 'T')`.

**Fix.**
1. Rewrite the block against today's names: `gs.v4.clock`, `gs.focusCamera`, `gs.economy.add`, `gs.ground.water`,
   `Assets.loadFragment`.
2. Guard `P.story.happenings` with a `typeof` check, and agree the registration API with story_runtime. A second
   `HappeningClock` list, `addHappenings(list, start)`, is the smallest change.
3. Speak the story's `stage(kind, {venue, watch})` / `endStage(kind)` through an adapter.
4. Fix `layers()`.
5. Add a Node "port-shape" test that builds the ports from a stub `gs` with v4's real field names.

---

## 2. High

### H1. Nothing ticks the beach's Water regions in the game

- `Water.update(dt)` advances `t` and also finishes the async field build (`Water.js:1642–1656`).
- The beach creates two regions: the sea in `BeachView.makeSea` and the pool in `Beach.makePool`. It never calls their
  `update`.
- The lab's `ports.water.region` pushes them into `this.waters`, and `World.tick` updates them (`lab.js` `water()` /
  `tick()`). That masks the gap.
- In the game the only ticked Water is `Ground.water` (`Ground.js:818`).
- The proposed port, `new Water(gs, …)`, registers nothing.

**Effect:**
- With the async build: no sea at all.
- With a baked field: a frozen sea. Swimmers and buoys stop bobbing, and ripples never expand.
- This undoes the designer's first v7 wish ("바닷물도 진짜처럼 … 출렁 파도치고").

**Repro.** `grep -n "\.update(" src/beach/view/*.js` shows no Water update. Compare `lab.js` `tick()`.

**Fix.** In `BeachView.update`, call `this.sea.update(dt)` and each pool region's `update(dt)` when
`ports.water.owned`. Or make the port register regions with `Ground.update`. Either way, write it into P23.

### H2. The beachfront street `blvd_b` is buried under the sand

**Cause.**
- `Ground.bakeChunk` runs `bakePaths` and then the bake hooks in registration order (`Ground.js:546–547, 441`).
- RoadPaint registers its street hook at boot (`RoadPaint.js:65`). The beach registers its sand hook later.
- The sand hook fills every sand cell from j −20 to −1 (`Sand.js:118`), which includes `blvd_b` (i 86–116, j −8…−4)
  and the `PATH`.
- The layout comment says "the street and the boardwalk are painted over it". Only the boardwalk is.

**Evidence.** In the module's own captures, the cobble street stops dead at i ≈ 88 and the shop rows face a bare sand
plain:
- `docs/previews/beach_lab_day_z06.png`
- `beach_lab_reveal_after.png`
- `beach_lab_stage_open.png`
- `beach_lab_cleanup.png`

The lab's `LabGround` uses the same order as `Ground`, so the game will look the same. Bus line 4 would drive on sand.

**Fix.**
- Option 1: leave the street cells out of `sandCell`, skipping `STREETS` rects and `PATH` in `Sand.paint`, and paint the
  sand ↔ cobble edge kit along them.
- Option 2: add a hook priority to `Ground.addBakeHook(fn, rect, order)` so RoadPaint's streets paint after district
  ground.

Add a lab assertion that samples a pixel at `L(100, −6)` and finds cobble.

### H3. One harbour ferry is counted 5× (crowd and hotel inflated)

**Cause.**
- On every ferry arrival, harbor_runtime emits `harbor:tourists {op:'arrive', n}` **and**
  `harbor:ship {kind:'ferry', op:'arrive', n}` (`src/harbor/model/tourists.js:71`, `HarborModel.js:188`).
- Later it emits `harbor:tourists` with `op` `toTown`, `back` and `leave`.
- `BeachHost.onFeed` turns **every** `harbor:tourists` into `m.onFerry(n)` regardless of `op` (`host.js:197`).
- Report §11 tells the lead to feed both events.

**Repro.**
- Command: `nice -n 15 node $S/probe2.mjs`.
- Output: `oneFerry {onFerryCalls:1, rooms:6, beachTourists:9}` against
  `sameFerryAsHarborRuntimeEmitsIt {onFerryCalls:5, rooms:22, beachTourists:33}`.
- Departing tourists (`op:'leave'`) check into the hotel.
- The toast "호텔 손님 N팀이 체크인했어요" fires 5× per ferry.

**Also:**
- The harbour's `train` events carry no `n`, so `onTrain` never fires.
- The harbour exposes `addCoastStop('beach')` (`src/harbor/host.js:214`), which the beach never calls (see M6).

**Fix.**
- Count only `harbor:ship {kind:'ferry', op:'arrive'}`, deduped by `ev.id`.
- Ignore `harbor:tourists`, or accept only `op === 'arrive'` and never alongside the ship event.
- Add a test that replays harbor_runtime's real event sequence.

### H4. The beach events and mission hooks the designer asked for are dead in the game

The task names 모래성 대회 and 잃어버린 튜브 as required hooks. In the game:

**Events.**
- Contest and polar swim have no scheduler. `events.contest.gapDays` and `events.polar.gapDays` are never read.
  `request('contest'|'polar')` is reached only from `api.event`.
- Fireworks run only during the 7-day festival week.
- Repro: `nice -n 15 node $S/probe1.mjs`. Nine game days at ★3 with no API calls: `{week:1, fireworks:4}`, 0 contests,
  0 polar swims.
- missions_bank does not call `gs.later.beach.event(...)` either: no `mission:accept`/`done` glue on either side.

**C11 모래성 대회.**
- The banner says "제일 멋진 성을 골라 주세요". In the game the chief cannot choose.
- `pick` is only `api.pick` (`host.js:229`). The castles are not interactive, and there is no "stand by a castle" rule.
- The mission's `{how:'choose', at:'p:sandcastles'}` can never complete, and the auto-pick never reports.

**C12 여름 불꽃놀이.**
- The mission's only step is `{how:'pay', minutes:2}`. Nothing in missions or the beach implements a `pay` step
  (grep: the catalog line is the only `'pay'`), so the mission can never complete.
- Even if it did, nothing would start the fireworks.
- The beach is the natural owner. Offer a "불꽃놀이 열기" pad by the boardwalk that:
  - charges 2 minutes of income through `coins.spend`;
  - calls `event('fireworks')`;
  - reports `{how:'pay', code:'C12'}`.

**C13 북극곰 수영 대회.** It is the designer's own idea, and it never runs outside the hidden preview menu.

**A20 잃어버린 튜브 찾아 주기.** It asks for `findSpot('swim_ring')`, and the beach answers `null` (`host.js:237`). No
floating ring is ever spawned.

**E8 해변 청소 / E9 조개 10개.**
- missions calls `places.findSpot(what, near, id)` and expects **one** `{x, y}` (`missions/host.js:171–177`).
- The beach returns an **array** for `litter`, which becomes `{x: undefined}` and never completes.
- After the clean-up it returns `[]`, yet E8 repeats every 70.
- `shell` returns `null`.

**E11 꽃게 8마리 세기.**
- The crabs call `setInteractive()` but attach no handler (`Boats.js:153`).
- Nothing emits `tap {what:'crab'}`, so the beach's `report({how:'tap', what:'crab'})` never fires.

**P12 parasol catch.**
- The toast promises "명성 +2", but no fame is added.
- missions awards happening fame only for `story:happening {watched}` (`missions/model/missions.js:312`), and the beach
  emits `beach:happening {op:'catch'}`.

**Fix.**
1. A beach scheduler: contest every `gapDays` at 11–15 h, polar at 13 h when the swimwear shop is open.
2. Listen to `mission:accept|done` for C11/C13 and start the event. For C12, build the pay pad described above.
3. Choose by standing next to a castle for 1.5 s during judging, with number flags 1/2/3 (see M11).
4. `findSpot(what, near, id)` returning one spot for `litter` (nearest unpicked bit, or fresh driftwood after the
   clean-up), `shell` (`decal_shells` spots, starfish) and `swim_ring` (a bobbing `swim_ring_*` prop on the Water just
   past the buoys, drawn by the beach view).
5. A `pointerdown` handler on crabs that emits `tap {what:'crab'}`.
6. Emit fame through missions: `story:happening {watched:true}` or a `fame` port.

### H5. Fireworks: nobody watches, and the bursts barely read

**Nobody watches.**
- `watchers()` queues 8 `sunset` arrivals at 21:00, but `Crowd.nextAct` sends everyone home when `h >= 20.5`, sunset
  people included (`crowd.js:225`).
- Repro: `probe1.mjs`, `fireworks` series. At 21:08–21:43, `present` is 4–11 and `leaving` equals `present`;
  `gazing` stays 0 the whole time.

**Weak bursts.** Every frame of `docs/previews/beach_lab_fireworks.gif` shows a single small ring of sparks near the
waterline or one white blob, with an empty beach (contact sheet `$S/frames/beach_lab_fireworks_sheet.jpg`;
`beach_lab_fireworks.png`). Two causes:
- bursts start at j −27…−23.5 and rise only 150–260 px;
- particles are drawn at scale 0.66–0.85.

The game's darker night will help the contrast, but not the size or the height.

**Fix.**
- During an event, exempt `kind:'sunset'`/watchers from the 20.5 h rule (until `a.until + 20`).
- Give watchers a "gaze" act along `BOARDWALK.j − 0.6` facing SW, with `emote_heart`/`happy` on big bursts.
- Raise bursts to 380–560 px above the sea, scale 1.2–1.6, add a short trail per rocket and a crackle tail. Fewer, bigger
  shells (12–16) read better at zoom 0.6.

### H6. Clean-up (E8) and walk-in (E7) give no guidance; the beach can stall

**Clean-up.**
- After the reveal banner the player is never told to pick anything up. `cleanupHint (n/12)` is toasted only **after**
  the first bit is picked (`host.js` `case 'beach:clean'`).
- The 12 bits are tiny ground decals: seaweed at 0.5×, driftwood at 0.62× (`Beach.syncBits`).
- They have no sparkle and no guide arrow. `ports.progress.goal` is never used.
- In `docs/previews/beach_lab_cleanup.png` (zoom 0.7) they read as faint squiggles.
- Pickup needs the chief within 56 × 34 px.

**Walk-in (E7).**
- After the path is built, nothing points east.
- The reveal happens at once only if the chief happens to stand at the path site (i 93).

**Fix.**
- On `beach:step reveal`: toast `cleanupHint` with 0/12.
- Put a `fx_sparkle_water` twinkle (or the missions find-sparkle) on each bit, and a guide arrow to the nearest bit
  through the Progression objective.
- After `path`: an objective arrow to `p:warm_coast`.

### H7. No collision for the beach's buildings and props

- `src/beach/**` never uses `ports.collision` (grep: no `collision`).
- harbor_runtime does register colliders (`src/harbor/view/Statics.js:35–37`), and v4 buildings block (`Game.js:450`).
- The chief walks through the hotel, the shops, the lifeguard tower, the volleyball net and the pool deck, and onto the
  pool water.
- Beachgoers are routed down aisles "so nobody walks through a parasol", but the chief is not.

**Fix.**
- `collision.footprint(def, x, y)` for `BUILDINGS`, `GATE` and solid props (tower, rental stand, cart, net, rack, corn
  stand).
- Circles for the parasol poles.
- The pool water polygon as blocked.

### H8. Snow keeps falling on the tropical beach

- `Game.update` emits ambient snowfall across the whole camera view with no region check (`Game.js:1656`).
- Plan §6.5 says "snowfall stops at the beach band's edge".
- Neither the module nor its Integration section touches it. The lab has no snowfall, so the captures hide it.
- In the game, snow will fall on swimmers and palm trees. That contradicts the whole fantasy ("눈 나라와 대비되는 꿈의
  장소").

**Fix.** Add a patch line for `Game.js`: skip `emitParticleAt` when `territory.areaOf(x, y) === 'beach'` (P16 provides
`areaOf`), or expose a `weather.snowAt(x, y)` port the beach answers. Fade the rate over the west ramp (i 86–90) so the
snow "thins".

### H9. Economy is far below plan (and the report's figure is a cold start)

- The report's 273 coins/min is day 1, when the hotel starts empty.
- `probe1.mjs` `economy` over five ★3 days settles at **≈ 358–361 coins/min**:

  | Source | Coins/min |
  |---|---|
  | rent | 230 |
  | hotel | ≈ 104 (32 rooms full) |
  | wholesale | 23 |
  | tickets | 3.5 |

- In the game Growth owns the rent (P32), so the beach module itself adds **≈ 130 coins/min**.
- Plan §3.3 wants +2,500 at beach ★3. The shortfall pushes 큰 도시 (120,000 coins, income 11,000) out by roughly a
  third.
- The builder disclosed the gap.

**Fix.**
- Re-run the ladder bots with the builder's levers before choosing numbers.
- Note that with H3 fixed and the harbour's real ferry rate, the hotel fills only as fast as ferries come.

### H10. Draw calls 18–19.4 against the ≤ 12 gate (reproduced)

- My re-run (`$S/run_lab_copy.mjs --only=day --no-gif`, output `$S/lab_out/beach_lab_numbers.json`): 18 draw calls at
  zoom 1.0 and 19.4 at zoom 0.6, view 0.60 ms, model 0.014 ms, 1,243 world objects (module 1,043). It matches the
  builder.
- Night: 17.
- The lab lacks v4's Culler, but every object counted is on screen.
- The builder disclosed this, but the plan treats it as a gate.

**Fix (the builder's levers, in order):**
1. Packed pages.
2. Pool as the baked `hotel_pool_water` sprite.
3. Board texts baked into one canvas.

Measure again with the Culler before integration.

---

## 3. Medium

### M1. Sand and palms appear in the visible harbour band at harbour ★2, before the path or the reveal

- The sand hook and the `nature` props are created when the module constructs (harbour ★2).
- Sand cells with y < 4600 (for example j −1…−8 near i 89–100: y 4195–4600) and `palm_n1` (y 4198) lie in the open
  `harbor` region, not under the beach fog.
- This spoils the "눈이 점점 모래로 바뀌어요" reveal.
- **Fix:** gate `Sand.paint` and `nature` props on `steps.path` (or reveal the west ramp progressively as the chief
  walks).

### M2. Events have no hour gate

- `api.event('contest')` at 22:30 runs at 23:42: it spawns a family at midnight and 6 kids dig in the dark.
  Repro: `probe1.mjs` `contestAtNight`.
- Polar has no hour gate either.
- **Fix:** refuse `contest`/`polar` outside 10–17 h, or queue them to the next 11:00.

### M3. The polar swim is staged with a camera grab that does not hold in the game

- `BeachView.event` calls `focus(p.x, p.y − 40, 1500)`.
- v4 `focusCamera` expires after `ms`, so the 46 s swim is seen for 1.5 s and then plays off screen.
- The lab's `focus` port is sticky, which is why `beach_lab_polar.gif` shows it all.
- Plan §5.7: stage it only within 1200 px, or after the card's 보러 가기; camera grabs ≤ 3 s.
- `beach_lab_polar_end.png` shows the "으으 추워!" toast over the beach, not the village.
- **Fix:** start polar only when the chief stands at `p:polar` (the C13 stand step), or offer 보러 가기 through the story
  stage. Never hold the camera.

### M4. Happenings ignore distance

- `tuning.happenings.range` (900) is never read (`events.js` uses only `gapMin`/`every`).
- P12 ("바람에 파라솔이 날아가요! 길을 막아 주세요!") fires and toasts while the chief is in the village.
- **Fix:** start only when `ports.view.onScreen(venue, range)` or the chief is within `range`; otherwise skip the slot.

### M5. Teardown crash: the ice-cream bell timer outlives the view

- `Beach.ringCart` schedules `scene.time.delayedCall(1300, …)`, which calls `art.apply` on the cart image
  (`Beach.js:173`).
- If the view is destroyed inside that window (designer preview copy, module teardown, the lab's `setup`), Phaser throws
  `TypeError: Cannot read properties of undefined (reading 'sys')` from the scene clock.
- **Repro:** the module's own runner: `nice -n 15 node $S/run_lab_copy.mjs --only=happen,english --no-gif` fails every
  time (stack: `Beach.js:173 → art.js:29 → Assets.js:734`). Each group passes alone, which is how the builder ran them.
- **Fix:** keep the TimerEvent and `remove()` it in `destroy()`, and check `it.img.active` in the callback.

### M6. 해변역 never gets a train

- The harbour's coast line serves `beach` only after `addCoastStop('beach')`, and the beach never calls it.
- The report assigns the train to Neighbours (P14), but harbor_runtime owns the coast line.
- **Fix:** call `ports.harbor.addCoastStop('beach')` when `lifeguard` is built. Ask the harbour to add `n` to beach-stop
  `train` events, or drop `onTrain` and keep the ferry delay.

### M7. Who pays wholesale for beach restocks is undefined; before P32 the goods are free

- **Before P32:** the standalone porter takes goods with `warehouse.take`, and v4 `Warehouse` has no `take`
  (`entities/Warehouse.js`). The goods are conjured, yet wholesale × 1.3 is paid.
- **With P32 as described:** Growth's delivery path normally pays `payWholesale` (× 0.7) into the till, and the beach
  pays again on `delivered` (× 0.91). That is 1.61× the item price per item.
- **Fix:** one payer. Read from `Warehouse.counts` and pay 0 when nothing was taken; state in P32 that Growth does not pay
  for `bshop:` deliveries.

### M8. Standalone founding progress is lost on a save during the 25 s build

- `Resort.serialize` keeps neither `building` nor the delivered card.
- **Repro:** `probe1.mjs` `foundingSaveMidBuild`: 40 bread + 10 cake delivered, saved 5 s into the build. After reload
  the café is not open and the card asks for everything again.
- **Fix:** save `building: [id, at]`.

### M9. Nobody at the beach ever speaks; staff are not residents (P6 omitted)

- The designer's lines (`talk1–5`: "물이 정말 맑다!", "모래성 대회 나갈 거야", "구조요원 아저씨 멋있다" …) are never used
  (grep: 0 uses).
- Plan §6.5 lists P6 (TownSim kinds) for the beach, and §5.6 makes `b:<n>` staff and residents story people. The module
  draws staff as private rigs, so they cannot be tapped, chatted with or used as mission givers. The Integration section
  omits P6.
- **Fix:** `ports.say` at a low rate (≤ 2 bubbles on screen, the town cap) from the 4 Hz scripts, and P6
  `registerKind('beach_staff', …)` for the fixed staff.

### M10. Kites are never drawn

- The `kite` sprite exists with its flying anim (`assets/beach/manifest.json`).
- The `kite` act plays `idle` at the two kite spots and draws nothing, so "연날리기" is a person standing still.
- **Fix:** draw the kite on a 1-px string about 140 px up-wind from the flyer's hand, with its flying anim and a slow
  sway.

### M11. The contest and P11 are hard to read at phone zoom

- The winner banner says "2번 모래성이 1등이에요!", but the castles carry no numbers.
- The castle stages are small at zoom 0.6–0.9 (`beach_lab_contest.gif` sheet: `$S/frames/beach_lab_contest_sheet.jpg`).
- P11: the beach ball is drawn at 0.5× and is nearly invisible.
- The lifeguard simply swims; there is no `rescue_board` or tube, although report §1 says "paddles out on the
  rescue_board".
- **Fix:** small flags or number labels 1–3 by the castles during the contest; the ball sized from its `radiusPx`; the
  guard drawn on `rescue_board` (art exists).

### M12. The beach generator lives in `tools/`

- `looks.js` needs `preset(name, rng)`, `beachFamily`, `randomPerson`, `canPlay` and `pickAnim`. That is the beachfolk
  *generator* (beach slots, palettes, add-ons, bare-arm sleeves) in `tools/beachfolk_compose.js`.
- P5 asks only to port `animHideHead`, `animFallback` and `pickAnim` into `src/core/Townfolk.js`.
- As written, the game must import `tools/` (esbuild would bundle it, along with `TownfolkSprite2`), or port about 300
  more lines.
- **Fix:** state in P5 which functions are ported, or move the generator into `src/beach/looks.js`.

### M13. Site definitions do not fit v4 `Site` (P29 must say how)

- v4 `Site` reads its cost from `BALANCE.buildings[bkey]` and always ends in a building (`entities/Site.js:28–60`).
- The beach passes its own `cost`, `time` and `key`, with `key: null` for `path`, `up2` and `up3` (no building), and
  needs `crate_glass` deliveries.
- `up2`/`up3` plots would sit on the boardwalk in front of the hotel.
- **Fix:** specify `addModuleSite(def)`: explicit cost, time and items; a "no building" completion that just reports
  `built`; and an upgrade site that draws only a pad by the hotel door.

### M14. The sea's Water field is built at harbour ★2 and overlaps the harbour's region

- `makeSea` runs in the view constructor. The field is 475 × 425 cells, built at runtime in 288 ms on desktop (about
  1 s on a phone), long before the beach is revealed.
- The harbour region (x 4400–10000, y 3330–4930) and the beach region (x 7100–10900, y 4300–6000) both draw water in
  x 7100–10000, y 4300–4930. The harbour's `shoreAt(i ≥ 90)` is `snowbank`, so snow foam would run along the sand.
- **Fix:** create the sea at `reveal` (or `path`) with a baked field, and clip the harbour region at i 88 in v7.

## 4. Low

- **L1. Save sanitising.**
  - `sanitizeBeach` keeps `board`, `up2` and `up3` without their predecessors.
  - It accepts guest parties with `leaveDay` up to 1e7, which means a permanently full hotel that pays every day (`probe1`
    `sanitizeSkips`).
  - Fix: cap `leaveDay ≤ dayNow + stayDays + 1` and drop `up*` without `hotel`.
- **L2. The opening call is lost on reload.**
  - Any saved slice sets `calledAt = null`, so a save in the minute after harbour ★2 skips the "따뜻한 바다는
    어디예요?" exchange (`probe1` `callAfterReload`: no toasts, path offered).
  - Fix: save `called: 1`.
- **L3. Night sign texts draw over everything.** They are lifted to `DEPTH.FX − 28`, above everything including palms and
  the chief walking in front of the hotel. Lift them only above the glow image's depth, `y + 2`, and draw the glow
  under it.
- **L4. Missing or unused sounds.**
  - `sfx_pop` exists in no manifest. The clean-up pickup, photo flash and P12 catch are silent.
  - `sfx_pool_splash` (plan: pool) and the periodic `sfx_wave_wash*` are never played.
- **L5. Tick spikes on group arrivals.** 1–3.3 ms in Node on a desktop core (p99.9 0.85 ms; `probe1` `worstTicks`). The
  test run once showed 17.9 ms (warm-up). Spread look generation for queued arrivals over several ticks.
- **L6. Toast noise.** A check-in toast for every ferry (×5 with H3), and toasts for far happenings. Aggregate them, or
  toast only on screen.
- **L7. String nits.**
  - en `swimwear_shop: 'Swim Ring Shop'` against ko 수영복 가게.
  - p12 "길을 막아 주세요" is vague; "파라솔 앞에 서서 잡아 주세요!" is clearer.
  - `whistle`, `cold`, `yum` and `talk*` are unused.
- **L8. Report and code disagree.**
  - The report says the module asks for `FRAGMENTS`; it doesn't.
  - It says the shops list is "ignored once growth exists"; the `Resort` constructor always uses it.
  - It says the P11 rescue uses the `rescue_board`; it doesn't.
  - Determinism depends on update cadence (`floor(T)` streams at call time), so 30 fps and 60 fps play different days.
    The tests use a fixed dt.
- **L9. Water geometry.**
  - Surf lane 2 (j −22.75, i 99–115) runs through the swan loop's right edge and inside the kayak loop's band.
  - Swan boats on their loop sit on the buoy line visually (`beach_lab_swim_whistle.gif` sheet).

## 5. What I ran

| What | Command | Result |
|---|---|---|
| Module tests | `nice -n 15 node --test tools/test/beach_lab/beach.test.mjs` | 19/19 pass. perf avg 0.009 ms, p99 0.032, max 17.9 ms; economy 273/min (cold start) |
| Logic probes | `nice -n 15 node $S/probe1.mjs` → `$S/probe1.out.json` | fireworks watchers, 5-day economy, findSpot shapes, night contest, 9 days without API, founding save, sanitize, call on reload, worst ticks |
| Harbour feed | `nice -n 15 node $S/probe2.mjs` | 5 `onFerry` calls per ferry |
| View cost | `nice -n 15 node $S/probe3.mjs` | staff list 23 per frame, 0.018 ms per call |
| Late atlases | `nice -n 15 node $S/lab_late.mjs` | 0 buildings and 0 buoys after the atlases arrive (C1) |
| Lab re-run | `$S/run_lab_copy.mjs` (OUT → `$S/lab_out`) with `--only=day`, then `night,reveal,stages`, `polar,happen,english,swim,fun` (all `--no-gif`) | numbers reproduced; 0 placeholders and 0 console errors per group; `happen` followed by `english` crashes (M5) |
| GIF contact sheets | PIL → `$S/frames/*_sheet.jpg` | fireworks, polar, P11, swim/whistle, contest |

No file outside the scratch folder and this critique was written. `assets/**` and the module's files were only read.

## 6. 기획자용 요약 (쉬운 말)

- 해변 모델(사람들이 놀고, 호텔에 묵고, 가게가 물건을 사는 계산)은 튼튼하고 가벼워요. 실험실 화면의 낮 해변도 아주 예뻐요.
- 하지만 지금 설명서대로 게임에 넣으면 해변이 제대로 보이지 않아요. 고칠 것이 많아요.
  - 건물·파라솔·부표 그림을 불러오지 않아서 모래밭만 보여요.
  - 바다 물결이 멈춰 있어요.
  - 해변 큰길이 모래에 덮여요.
  - 해변에도 눈이 내려요.
  - 촌장님이 호텔과 가게를 그냥 통과해요.
- 기획서에 있는 행사와 미션이 게임 안에서는 시작되지 않아요.
  - 모래성 대회: 촌장님이 1등 성을 고를 방법이 없어요.
  - 불꽃놀이 미션은 돈을 낼 방법도, 불꽃을 터뜨리는 연결도 없어요.
  - 북극곰 수영 대회와 잃어버린 튜브·조개·꽃게 미션도 시작되지 않아요.
- 불꽃놀이 때 구경꾼이 오자마자 집에 가요. 불꽃도 바다 위에 작게 보여요.
- 해변 청소는 "미역을 주우세요"라는 안내가 첫 조각을 주운 뒤에야 나와요. 조각도 너무 작아요.
- 여객선 한 척의 손님이 다섯 번 세어져요.
- 해변이 버는 돈은 계획(1분에 +2,500)보다 훨씬 적어요. 실제로는 1분에 약 360코인이에요.
- 해변 사람들이 한마디도 하지 않아요. "물이 정말 맑다!" 같은 대사가 쓰이지 않아요. 연도 날지 않아요.
- 고치는 방향:
  - 그림을 미리 부르고, 늦게 와도 다시 그리기.
  - 물결 갱신, 큰길 위에는 모래를 칠하지 않기, 해변에서는 눈 멈추기, 충돌 추가.
  - 행사 일정과 미션 연결.
  - 구경꾼 머물게 하기와 더 크고 높은 불꽃.
  - 청소 안내와 반짝임.
  - 여객선 한 번만 세기.
