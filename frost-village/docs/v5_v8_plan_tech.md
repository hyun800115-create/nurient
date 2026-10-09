# v5–v8 technical plan — architecture: module boundaries, contracts, budgets, integration

Versions covered: **v5** 생활과 미션 (story life, missions + fame, bank, vehicles by era), **v6** 갈매기 항구 (harbour),
**v7** 햇살 해변 (beach + resort), **v8** 살아 있는 도시 (logistics, incidents, moving). Design sources:
`docs/기획서_v5_생활과미션.md`, `기획서_v6_항구도시.md`, `기획서_v7_해변.md`, `기획서_v8_살아있는도시.md`,
`docs/CONTRACT_V5.md … CONTRACT_V8.md`, every report in `docs/build_reports/` (their "how the game uses it" notes are
quoted where they bind), `docs/v4_plan.md` (binding v4 design) and the v4 code as it is today.

This plan changes no code. It is the blueprint for building eight **standalone modules now** (while the v4 workflow
still owns `src/**`) and wiring them in **after v4 ships**. Numbers are **measured** (method named) or marked
**estimate**. Scratch scripts used for the numbers: `scratchpad/later_tech/{texsum.py, storyperf.mjs, esb.cjs,
layout_v5v8.py}` (the layout checker prints `no problems` for every coordinate in §5).

---

## 한눈에 (대표님께)

- 새 기능 8가지를 **각자 따로 완성되는 부품**으로 먼저 만들고, v4가 끝나면 차례대로 게임에 끼워요: v5 → v6 → v7 → v8.
- 주민 이야기 엔진은 휴대폰이 버벅이지 않게 **보이지 않는 뒷방(워커)** 에서 돌아가요. 화면에는 말풍선·결혼식·신문만 보여요.
- 모든 새 건물은 그림처럼 **앞이 왼쪽 아래(바다 쪽)** 를 봐요. 그래서 항구와 해변은 철길 남쪽의 **따뜻한 바다** 쪽에 놓여요.
  지도는 동쪽(항구 → 해변)과 남쪽(새 시가지)으로 넓어지고, 기차는 **두 번째 바닷가 열차**가 생겨요 (지금 기차는 그대로).
- 휴대폰 메모리·속도·저장 크기에 **부품마다 한도**를 정해 두고, 넘으면 테스트가 실패하게 해요.
- 각 부품은 혼자 돌려 볼 수 있는 **시험 화면(랩)** 을 가져요. 대표님은 게임에 넣기 전에 그 화면으로 먼저 보실 수 있어요.

---

## 0. Summary (decisions)

1. **Three layers per module, one direction of dependency.** Every module splits into a **pure model** (plain JS, no
   Phaser, no DOM, seeded RNG, Node-testable), a **view** (Phaser objects only, reads the model, never decides), and a
   **host** (lifecycle, save slice, wiring to the game through *ports*). Views may import v4 code (TownBuilding,
   Character, DollSprite, Water, Assets); models import only `src/data/*` and `src/kit/*`.
2. **One contract with the game.** Modules see the game through a `Ports` facade (calls) and a `GameFeed` (normalized
   events). The game sees modules through a `ModuleHost` (construct at gate, `update(dt)`, `serialize()`, `state()`).
   Integration is **one marked block in `Game.js`** plus ~20 small, listed patches (§13).
3. **The story engine runs in a Web Worker.** Measured on a quiet core: 250 residents cost 0.41 ms per game second on
   average but p99 6.8 ms and max 17 ms per step; serialize 26 ms; the bundle is 827 KiB minified. On a phone (3–4×
   slower) that is a visible hitch. A `StoryHost` posts batched messages; a synchronous **mirror** keeps the chat
   bridge and UI working unchanged. Inline mode (same protocol) is the fallback.
4. **TownSim stays the body and movement layer for everyone; the story owns social state and story beats.** The
   engine gets an `externalPlans` mode: the game reports where people are, the engine picks meetings from real
   co-presence, and only story beats (wedding, date, farewell, chase, evacuation) **lease** a body from TownSim.
   One person = one record: a `PersonRegistry` maps game ids (`v:npc_aunt`, `t:42`) to story ids.
5. **The art decides the map.** Every new building faces −Y (screen down-left); harbour quay walls only show on −Y/+X
   faces; beach buildings face the sea on −Y. Our existing coast has the sea on **+Y**. So v6/v7 sit on a new
   **south coast (warm current)** carved east of the town, on the same lattice `L(i, j)`: harbour quay `j = −12`
   (i 55–86), beach waterline `j = −19` (i 90–120). v8's new city fills the land south of the town.
6. **A second train for the coast.** The v4 shuttle (ours ↔ town, ~59 s cycle) is untouched so v4's tuned visitor
   economy cannot regress. Line B runs town-east halt (i 37.5) ↔ 항구역 (i 62) ↔ 해변역 (i 94), cycle ≈ 117 s, built
   on `Rail.legProfile` and drawn by the existing `Train` view.
7. **Budgets are per district and enforced by tests.** Textures: every district view ≤ 300 MiB target / 455 must,
   with district-specific pages ≤ 120 MiB and incident transients ≤ +70 MiB for ≤ 90 s. Logic: any view ≤ 2.1 ms per
   tick (v4's town gate). Saves: main ≤ 16 KB, story side slice ≤ 450 K chars. **Files: ≤ 495 per artifact version**
   (today 491 of 511 — the hardest limit; §11 shows how audio sprites and page merging pay for v5–v8).
8. **Townsfolk fragments merge once, page by class.** `townfolk ← townfolk2 ← beachfolk ← cityfolk` through one
   generic merge; Residency loads `life` pages only during life events, `beach` pages only near the beach, and
   cityfolk **incident groups** only while an incident is staged.
9. **Saves stay small and versioned per slice.** `SAVE_VERSION` 6 → 7 (v5) → 8 (v6) → 9 (v7) → 10 (v8); each
   migration only bumps `v`; every slice has its own `v`, sanitizer and byte cap; the story lives in a side key
   (like the chat), packed 15 bits per UTF-16 char.
10. **Tests in three rings:** Node unit tests per module (now), a Phaser lab page per module with real atlases (now,
    also the designer's preview), and in-game integration suites per version (later).

---

## 1. Baseline and hard constraints (measured)

| What | Value | Source / method |
|---|---|---|
| Textures, v4 (source-sum `w·h·4`) | new game 191 MiB · v3.5 complete 322 (settles 275) · full v4 plaza 325 · tour peak 385 · **target 300, must 455** | `docs/build_reports/v4_build.md` |
| Logic per tick (fixed-step bench) | plaza 0.8–1.0 ms (gate 1.6) · town 1.1–1.8 ms (gate 2.1) · TownSim 0.10–0.24 ms (gate 0.35) | v4_build.md |
| Draw calls / display objects | 5–10 per frame (gate 12) · 1572–2489 objects (gate 1700, missed in crowds) | v4_build.md |
| Main save | 5.7 KB, 0.2 ms; chat side key ≤ 220 KB (`frostVillage.save.v1.chat`) | v4_build.md, `src/core/Save.js` |
| Artifact | **491 files** (limit 511 per version, 255 per publish), 62.6 MB downloaded set | `dist/artifact_files.json` today |
| Story engine, 150 residents, 2 game days | create 139 ms · step avg 0.29 ms, p99 4.3, max 11.3 ms · save 139 K chars · serialize 14.5 ms · load 56 ms | `storyperf.mjs`, Node 22, load avg 0.6 |
| Story engine, 250 residents, 2 game days | create 100 ms · step avg 0.41 ms, **p99 6.8, max 17.1 ms** · save 262 K chars · serialize 26 ms | same |
| Story save after 30 days / a year | ≈ 550 K chars / ≈ 700 K chars (base64) | `story.md` §7, §10 |
| Story bundle | **827 KiB minified, 209 KiB gzip** (43 modules; grammar is most of it) | esbuild 0.25.12 (`tools/build`), `esb.cjs` |
| Chat bundle (precedent for a lazy script) | 204 KiB min / 69 KiB gzip, shipped as `chat.js` | same |

Texture size of the finished later fragments (source-sum of every PNG, `texsum.py`):

| Fragment | MiB | Atlases | Notes for paging |
|---|---|---|---|
| vehicles | 140.4 | 27 | 2.8–13.3 MiB each; only keys on screen may be resident |
| townfolk2 | 72.6 | 9 | life events only (`sad/clap/sit/push`, wedding/mourning parts) |
| ships | 65.8 | 7 | 3 headings rendered (S, SE, NE); the basin needs SE only (§8) |
| beachfolk | 74.6 | 7 | report's classes: loco 17.3, social 22.2, beach 8.4, water 8.3, heads 7.7 |
| cityfolk | 88.2 | 10 | incident groups 36.7–67.0 MiB (`cfPages.incidents`) |
| logistics | 63.8 | 13 | centre layers 23.4, vans 14.4, moving truck 12.2, forklifts 7.6 |
| beach | 53.5 | 15 | `beach_nature` alone 15.4 |
| beach_bld | 50.5 | 7 | 32.3 eager; `bbld_x`, glows lazy |
| harbor | 45.5 | 5 | `harbor_water` tiles 3.4 are bake-only |
| fx_city | 41.9 | 37 | fire set ≈ 19 MiB; UI pieces 1.9 MiB (newspaper, passbook, story card, ui4 icons) |
| civic | 37.4 | 10 | demolition vehicles 17.2 |
| water / life2 / ui3 | 19.2 / 4.5 / 1.5 | | water and audio5 are already eager since C2 |

**Art orientation is a hard constraint** (manifests, `front`): all town, harbour, beach, civic and logistics buildings
face **−Y**; harbour quay walls render only their −Y and +X faces; beach buildings face the sea on −Y (`_x` variants
face +X); `fx_shore_wave_*` is turned 180° for a −Y sea; vehicles and ships render 2 axis headings + mirror (ships add
S). Conclusion: a waterfront needs the sea on the **−j side** of the lattice (§5).

---

## 2. Architecture

### 2.1 Layers

```
                       ┌──────────────────────── Game (v4 code, Phaser) ────────────────────────┐
                       │ Game.js · Neighbours · TownSim · RoadNet · DayClock · Residency · UI   │
                       └───────▲───────────────────────────────┬────────────────────────────────┘
          Ports (calls into the game)                          │  GameFeed (normalized events)
                       │                                       ▼
  ┌────────────────────┴──────────── src/kit (shared, integrator-owned) ─────────────────────────┐
  │ ModuleHost · Ports · GameFeed · lattice.js · slices.js · rng.js · stage.js (slot scheduler)    │
  └──────▲──────────────▲──────────────▲──────────────▲─────────────▲─────────────▲───────────────┘
         │host          │host          │host          │host         │host         │host
   src/story     src/missions    src/bank     src/vehicles   src/harbor   src/beach   src/city/logistics
                                                                                       src/city/incidents
   each module:  model/ (pure)  ←read─  view/ (Phaser)   host.js   tuning.js (Korean comments)   save.js
```

Import rules (checked by a Node test that greps import graphs):

| From | May import | Must not import |
|---|---|---|
| `*/model/*`, `src/kit/*` (except views) | `src/data/*` (pure data), `src/kit/*`, own module | Phaser, `window`, `document`, `src/scenes`, `src/entities`, `src/systems` |
| `*/view/*` | v4 entities/systems as libraries (`TownBuilding`, `Character`, `DollSprite`, `Water`, `Assets`, `Audio`, `Bubbles`), own model | other modules' views or models (go through events / ports) |
| `*/host.js` | own model + view, `src/kit` | other modules' internals |
| v4 code | `src/kit/ModuleHost.js` only (one block in Game.js) | any module file |

Cross-module talk goes through module events on the `GameFeed` bus (§3.4) or through a module's **public API object**
that the host publishes as `gs.later.<id>` (read-only queries).

### 2.2 Module map

| Module (path) | Version | Pure model | View (Phaser) | Owns |
|---|---|---|---|---|
| `src/story` | v5 | engine (vendored `tools/story`), registry, adopt, places, codec | StoryLife, StageDirector scenes, NewsPanel, PersonCard | the worker, the story side save |
| `src/missions` | v5 | catalog, generator, progress, fame/titles | MissionBoard panel, request bubbles, delivery pads, drive HUD | missions + fame slice |
| `src/bank` | v5 (v8 adds insurance) | chief account, loans, interest, insurance | bank cutaway + tellers + queue, passbook panel | bank slice |
| `src/vehicles` | v5 | lanes adapter, VehicleSim, fleet, eras, chief-drive input | VehicleSprite, depots, stops, traffic lights | vehicles slice |
| `src/harbor` | v6 | ship timetable/berths, exports/imports, auction, tourists, CoastLine | district, ships, crane, lighthouse, gulls, harbour water | harbor slice |
| `src/beach` | v7 | activities/slots, resort (hotel, shops), beach crowd | district, beachgoers, boats, beach + pool water | beach slice |
| `src/city/logistics` | v8 | stock/racks, orders, settlement, chains | cutaway centre, forklift, conveyor, vans at docks | logistics slice |
| `src/city/incidents` | v8 | incident director, building states, wanted board | fire, chase, scuffle, demolition, moving scenes | incidents slice |
| `src/kit` | v5 P0 (integrator) | lattice, slices, rng, stage scheduler, feed | ModuleHost, Ports | — |

### 2.3 The module shape (every module exports the same thing)

```js
// src/<mod>/index.js
export const MODULE = {
  id: 'missions', version: 1,
  saveKey: 'missions',                 // top-level key in the main save (§10)
  capBytes: 3072,                      // JSON length cap of the slice
  needs: ['story?'],                   // soft deps ('?' = optional); the host constructs in dependency order
  gate: (gs) => !!(gs.v4 && gs.v4.rank && gs.v4.rank.level >= 2),   // polled at 1 Hz until true (and on load)
  prefetch: (gs, assets) => {},        // asset fragments to fetch when the gate is near (§8.3)
  create: (ports, saved) => new MissionsHost(ports, saved),
  sanitize: sanitizeMissions,          // pure: raw slice -> clean slice | null (used by Save.js, §10)
};
// host instance: update(dt) · serialize() · state() · api (gs.later.missions) · destroy() · onFeed(ev)
```

`ModuleHost` (`src/kit/ModuleHost.js`) constructs each module when its gate opens, ticks them in a fixed order
(story → bank → missions → vehicles → harbor → beach → logistics → incidents), measures each one
(`ms` EWMA, exposed in `__FV.later.perf()` and the `?debug=1` HUD), passes saved slices through untouched while a
module is not constructed (v4's `v4` block rule), and destroys everything on scene shutdown.

---

## 3. The contract with the game

### 3.1 Ports (module → game)

`src/kit/Ports.js` wraps only what modules may call. Labs and Node tests use `FakePorts` with the same surface.

| Port | Backed by (v4) | Notes |
|---|---|---|
| `coins.add(n, x, y, fly)` / `coins.spend(n)` / `coins.value` | `gs.economy` | all money goes through here (missions, bank, harbour, beach) |
| `ui.toast(msg)`, `ui.banner(msg, sub)`, `ui.coinFly(x, y, n)`, `ui.openPanel(Panel, data)`, `ui.chip(id, spec)` | `gs.ui` (UI scene) | `openPanel`/`chip` are new UI hooks (§13 P12) |
| `say(body, text, emote, dur, opts)`, `emote(body, key, dur)` | `gs.life.bubbles` (Bubbles → VillageVoice) | respects the town caps: ≤ 2 chat bubbles, ≤ 3 emotes on screen |
| `sound.play(key, opts)`, `sound.at(key, x, y)`, `sound.ambience(key, vol)`, `sound.music(area)`, `sound.duck(level, hold)` | `Audio`, `gs.sfxAt`, `gs.voice.duck` | `music(area)` is new (area music crossfade, §13 P15) |
| `view.rect()`, `view.onScreen(x, y, m)`, `view.focus(x, y, ms)`, `view.zoom()` | `gs.viewRect`, `gs.isOnScreen`, `gs.camFocus` | camera grabs only for the reveal moments listed per module |
| `world.L(i, j)`, `world.px2L(x, y)`, `world.region(x, y)`, `world.isOpen(id)` | `world.js` `L4/px2L4`, `Territory` | |
| `ground.bakeHook(fn, rect)`, `ground.invalidate(rect)` | `Ground.addBakeHook/invalidate` | quays, piers, sand, boardwalks, asphalt markings are baked |
| `collision.add(x, y, r, tag)`, `collision.footprint(def, x, y)` | `Collision` | |
| `roads.route(a, b, mode)`, `roads.lanes()` | `RoadNet.route`, drive graph | vehicles read lanes; walkers keep `Roads` |
| `town.*` (`addCitizen`, `leave`, `registerKind`, `addPlaces`, `hold`, `walk`, `gather`, `bodyOf`) | `TownSim` (+ §13 P6 additions) | the only way to make or move townsfolk |
| `clock.T()`, `clock.hour()`, `clock.day()`, `clock.addLight(x, y, k)` | `DayClock` | |
| `assets.fragment(name, opts, onReady)`, `assets.sprite(key)`, `residency.want/acquire/release`, `residency.addArea(a)` | `Assets.loadFragment`, `Residency` | `addArea` is new (§13 P4) |
| `progress.flag(f)`, `progress.setFlag(f)`, `progress.goal(spec)` | `Progression` | |
| `water.region(opts)` | `new Water(gs, opts)` + view-intersection visibility | §7 |
| `settings.get(k)` | `Settings.data` | `lifeEvents`, `farewell`, `incidents` are new keys |

### 3.2 GameFeed (game → modules)

`src/kit/GameFeed.js` subscribes once to `gs.events` and re-emits **normalized** events
`{ t: type, ...fields, T: clockT }` to every module host. Existing events are used as they are; four new emits are
patched in (§13 P8–P11).

| Normalized `t` | Source today | Payload | Used by |
|---|---|---|---|
| `sold` | `'sold'` (Seller.complete) | `{ value, item, n, seller }` (**item/n new**) | missions (goals), story (`report('chief')` aggregates), beach/harbour shops |
| `storeSold`, `traded` | existing | `{ value }` | missions |
| `produced` | **new** in `Station` | `{ station, item, n }` | missions ("오늘 통조림 30개"), logistics inbound |
| `crafted` | `'crafted'` (Workshop) | `{ kind, item }` | missions, story |
| `built` | `'built'` (Site) | `{ key, siteId, x, y }` | story (`report('chief', built)`), missions, bank insurance |
| `step`, `flag` | Progression | `{ id }` / `{ flag }` | module gates |
| `region` | Territory | `{ id }` | module gates, prefetch |
| `hour` | `'v4:hour'` (TownSim set pieces) | `{ h, name }` | story (bells), beach crowd curve |
| `day` | **new** in `DayClock` | `{ day }` | story save, bank interest, missions daily refresh |
| `train` | `'v4:train'` | `{ ev, stop, line }` (`line` new: `'A'`/`'B'`) | story `report('train')`, harbour/beach tourists |
| `visitorDone` | `'v4:visitorDone'` | `{ pid, frac }` | story (memories of the visit), missions |
| `shopOpen`, `cardDone`, `rank` | `v4:*` | as today | missions, vehicles (era) |
| `restMeal`, `boatHome`, `dogLove`, `settlers` | existing | as today | missions, story `report('pet')` |
| `tap` | **new** in `VillageLife.react` / `Neighbours.tap` | `{ pid, x, y }` | story (`talkTo`), missions (accept requests) |
| `delivered` | module-owned pads (no v4 patch) | `{ pad, item, n }` | missions, logistics |

### 3.3 Time

One clock: `DayClock.T` (600 s day, 25 s per hour). Modules never keep their own wall clock; models receive `T`
(and `dt` in game seconds, which already respects pause). The story engine starts at 06:00 on day 0 and DayClock at
08:00; `StoryHost` ticks the difference once at creation (the integration plan in `story.md` §6 step 1).

### 3.4 Module events (module → module, on the same feed)

Namespaced, payloads plain: `story:talk|life|move|news|bank|shop|incident|day`, `mission:offer|accept|done|fail`,
`fame:{pts,total,title}`, `bank:deposit|loan|repaid|interest|claim`, `veh:arrive|stop|park`, `harbor:ship|export|auction`,
`beach:arrive|leave|event`, `lgx:stock|settle|dispatch`, `inc:stage|phase|end`. A module subscribes to what it needs
in `onFeed(ev)`; no module holds a reference to another module's objects.

### 3.5 People: one record per person

`src/story/registry.js` (pure) — `PersonRegistry`:

| pid | Who | Body owner | In the story |
|---|---|---|---|
| `v:<key>` | the village's named residents (`npc_aunt` …, from `VillageLife.moved`, pets excluded) | VillageLife `Resident` | yes, `kept` (age/job/home fixed; never culprits) |
| `t:<id>` | TownSim citizens (the 100–120 + station-district households) | TownSim body | yes |
| `s:<n>` | C1 settlers in village houses (anonymous today) | Civic walker | generated by the engine as village households |
| `h:<n>`, `b:<n>`, `c:<n>` | harbour / beach / new-city staff added in v6–v8 | TownSim (registered kinds) | yes (`addResident`) |
| — | tourists, ferry passengers, beachgoers, anonymous customers | Visitor / crowd | **no** (transient, seeded, never saved) |

```js
reg.add(pid, sid)  reg.sid(pid)  reg.pid(sid)  reg.bodyOf(pid)  reg.serialize() -> [[pid, sid], ...]   // ≤ 300 rows ≈ 3 KB
```

**Ownership leases.** At any moment a body is driven by exactly one owner: `town` (TownSim routine, default),
`gameplay` (v4 visitor trip, founder, builder, ceremony gather), or `story` (a beat: wedding, date, farewell, chase,
evacuation, moving). `town.hold(c, owner)` / `town.release(c)` (§13 P6); the story is told through `lease(sid, on)`
(engine extension E3) so it never schedules a leased resident into a conflicting beat.

**Adoption** (first v5 boot — the same path for new games and old saves): roster = named villagers + TownSim
citizens + district households; households inferred from shared homes (adult pairs within 12 years → couple,
students/teens with the first adults of their home → children, two elders → couple, others singles/roommates);
names: TownSim's given names are kept, a surname is drawn deterministically from the engine's pools (cards keep showing
the given name; dialogue uses full names and the engine's forms of address). Then
`createStory({ world: places(), residents: specs, population: 0, config: { externalPlans: true, ackWait: true, keepNamed: true } })`.

### 3.6 Places

`src/story/places.js` (pure) maps game buildings to engine place kinds (`data/places.js` of the engine): town
buildings by `role`/key (cafe→`cafe`, bookstore→`bookstore`, toy_shop→`toy_shop`, clothing_store→`clothing`,
flower_shop→`florist`, hair_salon→`salon`, restaurant→`restaurant`, school→`school`, town_hall→`town_hall`,
clinic→`clinic`, fire_station→`fire_station`, police_box→`police`, post_office→`post_office`,
train_station→`station`, playground→`playground`, park_fountain→`park`, apartment_*/townhouse_*→`home` with `cap`),
founded shops (Growth lots), village areas (plaza→`plaza`, beach campfire→`beach_fire`, forest/farm/mine→work places,
the C1 hall→`town_hall`, the big restaurant→`restaurant`, the general store→`general`), later districts as they
open (`bank`, `harbor`, `logistics`, `memorial`, beach shops). Places are added at runtime with `world.addPlace`
(exists). **The engine must tolerate missing kinds** (no logistics centre before v8: owners restock "at the
station"; extension E4).

### 3.7 How each module plugs into the v4 systems

| v4 system | Plug | Modules |
|---|---|---|
| `RoadNet` | new streets are appended to `WORLD.v4.streets` (RoadNet reads only that list; one lattice, one graph; `region` gates use); vehicles read `driveNodes/driveEdges/connectors`, `laneCentre`, `stopLine`; `upgrade(id, 'asphalt')` at rank 3 | vehicles, harbour, beach, newtown |
| `Roads` (walk A*) | walk lines of new streets arrive through `walkGraph()` → `roads.addGraph()`; `edgeBlocked` asks every rail line (P14) | all districts |
| `TownSim` | the body/movement layer for every non-village person: `registerKind` (dock_worker, sailor, lifeguard, hotel staff, warehouse worker…), `addPlaces` (district buildings' points), `hold/release` leases, `walk`, `onArrive` → story `at()` (P6) | story, harbour, beach, city |
| `Growth` | **authority for the founded shops** (stock, rent, restock); the story treats those places as game-owned (owner = founder's pid, `locked` owner, sales informational, E4); missions read `shopTargets()`/`openShopCount()` and add "restock" missions; vehicles' cargo jobs carry Growth restock crates and cargo-pad crates; the bank's loan offers count `openShopCount()` | story, missions, vehicles, bank |
| `Rank` | data-driven levels (P17); rank 3 bars include fame; ceremony rewards trigger era 3 and the asphalt repave | missions, vehicles |
| `DayClock` | the only clock (`T`, `hour`, `day`); `day` event (P10); `addLight` for lighthouse, hotel, street lamps; night factor for glows and `water.setLighting` | all |
| `Residency` | `addArea` (harbour, beach, newtown), classes `vehicle`, `ship`, `dollLife`, `dollBeach`, `incident:*` (P4); `want/acquire/release` from views | all views |
| `Culler` | district sprites are plain Images/Sprites/Containers in the world display list, so the camera-filter culling covers them; the "park off the list" rule (today only the boot `props` atlas) may extend to pinned district prop pages | all views |
| `Townfolk` / `DollSprite` / `DollPool` | merged TF (§6); every district person is a `Character` with `opts.person` → DollSprite; the pool's global caps (32 full / 40 lite / dots) arbitrate between districts by distance | story, harbour, beach, city |
| `Water` | extra regions with their own palettes and masks (§7); `heightAt/slopeAt/ripple/addHull` for floating things | harbour, beach |
| `VillageVoice` | free through `Bubbles.chat`; cast mappings for new jobs (P22); ducking during ceremonies | story |
| `src/chat` `StoryBridge` | the story mirror is the duck-typed `story`; registry gives `idOf/keyOf` (P21) | story |
| `Territory` / `Collision` | new regions and areas (P16), south-sea walkability (P7) | harbour, beach, newtown |
| `Save` | slice registry, side key, chain 6 → 10 (§10) | all |

### 3.8 Public APIs (`gs.later.<id>`, read-mostly; the only thing other code may touch)

| Module | API |
|---|---|
| story | `facade` (mirror: `clock`, `weather`, `newspaper()`, `relationship()`, `diary()`, `on()`), `talkTo(pid) → Promise<lines>`, `card(pid) → {name, age, job, mood, friends}`, `passbook(pid)`, `pidOf(body)`, `report(kind, data)`, `toggles(t)` |
| missions | `boardLines()`, `active()`, `offer(spec)` (other modules post story/export/event missions), `fame() → {pts, title}` |
| bank | `account() → {savings, loan}`, `canLend(n)`, `insured(bldId)` |
| vehicles | `era()`, `spawn(key, route, opts) → id`, `dispatch(kind, to) → Promise<arrive>` (fire truck, police car, moving truck, vans), `chiefDriving()` |
| harbor | `nextShip(kind)`, `exports()`, `touristsToday()`, `coastLine` (rail-like for `Train`/crossings) |
| beach | `hotel() → {level, occupancy}`, `crowd()`, `event(kind)` |
| logistics | `stock(cat)`, `order(shop, items) → id`, `settle(id)` |
| incidents | `active()`, `wanted()`, `buildingState(bldId)` |

---

## 4. Modules

### 4.1 `src/story` (v5) — the story network in a worker

**Files**

| File | Layer | Purpose |
|---|---|---|
| `engine/**` | model | `tools/story/{src,lang,data}` moved here (`tools/story/index.js` re-exports, so `sim.mjs` and its 30 tests keep running) + extensions E1–E6 |
| `protocol.js` | model | message types and batch shapes (shared by host and worker) |
| `worker.js` | model | worker entry: owns the engine, batches events, packs saves |
| `host.js` | host | `StoryHost`: transport (worker / inline), batching, request ids, mirror, side save |
| `registry.js`, `adopt.js`, `places.js`, `codec.js` | model | §3.5, §3.6, pack15 codec (2.5× fewer chars than base64) |
| `StoryLife.js` | view | events → bodies, bubbles, leases, banners |
| `StageDirector.js` | view (+ `src/kit/stage.js` pure scheduler) | set-piece slots and staging rules |
| `scenes/{Wedding,Farewell,Stroller,Housewarming}.js` | view | life set pieces (life2 + townfolk2) |
| `ui/{NewsPanel,PersonCard,Passbook}.js` | view | fx_city UI pieces (`ui_newspaper*`, `ui_story_card*`, `ui_passbook*`) |
| `tuning.js` | data | designer numbers with Korean comments (yearDays, rates, toggles, caps) |

**Engine extensions** (implemented in `src/story/engine`, each with a Node test):

| # | Extension | Why |
|---|---|---|
| E1 | `config.externalPlans` + `at(sid, placeIdx, act)` (batched) | TownSim keeps v4's tuned routines; meetings come from real co-presence; routine `goTo` is not emitted |
| E2 | `addResident(spec) → sid`, `removeResident(sid, why)`, per-resident `kept`, `hh` (household key) and `role` in `residents[]` | adoption, settlers, founders' households, 읍 newcomers, district staff |
| E3 | `lease(sid, on, placeIdx?)` | a body busy in gameplay is not cast into conflicting beats |
| E4 | missing-kind tolerance (logistics, bank); game-owned places (`place.locked`: the owner is fixed by the game — Growth's founded shops — and no takeover/dream may claim them; their sales are informational); `setRates({ fireRate, … })` | v5 runs without v8 places; Growth stays the shop authority; hydrants lower `fireRate` |
| E5 | `compact(level)` (memCap 40 → 24 → 16, prune weak facts and one-off acquaintances) | keep the side save under its cap |
| E6 | `serialize({ packed: true })` returning pack15 | the worker posts ~40 % of the characters |

**Message protocol** (batched; ≤ 8 messages per second each way):

```js
// main -> worker
{ t: 'init', seed, lang, dayLength: 600, world, residents, config, save? }
{ t: 'tick', dt, T, at: [[sid, placeIdx, actCode], ...] }        // every 0.25 s; co-presence reports since the last tick
{ t: 'visible', ids: Int32Array }                                // on change, ≤ 2 Hz (≤ 64 ids)
{ t: 'ack', id } | { t: 'report', kind, data } | { t: 'lease', sid, on, place }
{ t: 'add', spec, req } | { t: 'remove', sid, why } | { t: 'toggles', incidents, lifeEvents, farewell } | { t: 'prices', map } | { t: 'lang', lang }
{ t: 'talkTo', sid, lang, req } | { t: 'query', name, args, req } | { t: 'save', req }
// worker -> main
{ t: 'events', T, list: [{ e: 'talk'|'goTo'|'arrive'|'incident'|'build'|'move'|'life'|'bank'|'shop'|'wanted'|'news'|'day', ...payload }] }
{ t: 'mirror', clock, weather, paper?, wanted?, stats }          // on day change and when they change
{ t: 'reply', req, data } | { t: 'saved', req, data /* pack15 */, chars, ms } | { t: 'error', msg }
```

**Mirror** (synchronous facade, so `src/chat/storyBridge.js` works unchanged): `clock.day`, `weather.today.kind`,
`newspaper()`, `relationship(a, b)` (cached daily for the chat roster's pairs, 32×32), `diary(id, day)` (prefetched
for the roster at each `day`), `on('talk', fn)`. `talkTo` is asynchronous: a "…" bubble shows for the round trip
(≤ 50 ms on a phone, estimate).

**StoryLife rules (view)**
- **Talk:** render only when both bodies are materialised, ≤ 220 px apart and on screen. Turn them to face, then
  `ports.say(body, line.text, line.emote, line.dur)` per line (Bubbles → VillageVoice, so 눈꽃말 voices come for free).
  Cap reached → emote only. Chat bridge first: `bridge.decorateTalk(talk)` runs before rendering.
- **Story beats** (`goTo` with reason): lease the body, walk it (`town.walk`), report `arrive`, release when done.
- **Life:** wedding / baby / farewell → StageDirector; `grow` → TownSim kind change (student → teen → adult); `move`
  → `town.addCitizen` / `town.leave` + banner (the moving truck arrives in v8).
- **News:** NewsPanel each morning (`news` event): an edge icon pulses; tap to open. **Never** a modal.
- **Incidents** are switched **off** in v5–v7 (`toggles.incidents = false`); v8 turns them on with their scenes.

**StageDirector** (`src/kit/stage.js`, pure): at most **one ceremony** (wedding / farewell / housewarming) and **one
incident** staged at a time, each only if its venue is within 1200 px of the view or the chief accepts a toast
("결혼식이 곧 시작돼요! 보러 갈까요?" / "A wedding is about to start! Go and watch?"). Off-stage beats still happen
in the story; acks time out (engine safety timeout). No camera grab for farewells, ever.
- Wedding: venue = the C1 village hall if built (`TownHall.venue('wedding')`), else the town's `t_hall`; props from
  life2 `layouts.wedding_town_hall`; tf2 presets bride/groom/wedding_guest/flower_girl; `bgm_wedding`; 40–60 s;
  fame +3 when the chief attends (within 400 px).
- Farewell (only with `farewell` on): memorial garden (row D, §5.3), `mourner` presets, white bouquets, `bgm_farewell`,
  30–45 s, gentle `sad` faces; family remembers it in dialogue.
- Baby: stroller walks (`push` + `l2_baby_stroller*`, placement `pusher anchor + pushPoint − handlePoint`).

**Budgets:** main-thread StoryLife ≤ 0.10 ms per tick; worker ≤ 2 ms per game second on a phone (≈ 0.4 ms measured
on a desktop core × 4); 0 long tasks (> 50 ms) attributable to the story; population ≤ 260 residents by v8.
**Save:** side key (§10), written at `day` and on `pagehide`, never on the 5 s autosave.

### 4.2 `src/missions` (v5) — the chief's requests, fame and titles

**Model** (`model/missions.js`, `model/fame.js`, `data/catalog.js`):

```js
const m = new MissionModel(catalog, tuning, saved, rng);
m.offer(day, ctx)            // ctx: { rank, open regions, producers, residents by role, story hooks } -> new offers (≤ 3 daily + 1 weekly)
m.accept(id) · m.feed(ev) -> [{ id, prog }] · m.tick(T) -> [{ id, expired }] · m.claim(id) -> { coins, fame }
m.serialize() · m.state()
Mission = { id, tpl, kind: 'request'|'drive'|'event'|'goal'|'explore', giver: pid|null,
            target: { item, n } | { place } | { route, limitS } | { venue, items, atT },
            prog, due, reward: { coins, fame }, state: 'offered'|'active'|'done'|'failed'|'claimed', cadence: 'daily'|'weekly'|'story' }
// catalog entry (designer-editable; ko + en text)
{ id: 'bread_for_elder', kind: 'request', w: 1, gate: { rank: 2 }, giver: { role: 'elder' }, item: 'item_bread', n: [3, 6],
  where: 'giver.home', due: 0.5, reward: { coinsPerItem: 1.6, fame: 2 },
  text: { ko: '{giver} 할머니께 빵 {n}개를 가져다드려요', en: 'Bring {n} bread to {giver}' } }
```

- **Sources:** catalog (daily 3, weekly 1, never the same template within 3 days), story (`life:engaged` → "결혼식 준비"
  event mission: cake + bouquet to the venue before `atT`; `move:in` → "새 이웃 환영회"; a lost-pet fact → explore),
  harbour exports (v6), beach events (v7), wanted posters (v8).
- **Fame and titles:** thresholds `[0, 40, 120, 300, 700]` → 새내기 촌장 / 믿음직한 촌장 / 존경받는 촌장 / 사랑받는 촌장 /
  전설의 촌장 (Rookie / Trusted / Respected / Beloved / Legendary Chief) shown with `ui_icon_title`; `ui_badge_rank_*`
  stays for the village rank (v4 uses 1–2). Fame is the fourth bar of rank 3 (§4.4).
- **Views:** MissionBoard panel at the C1 hall's notice board (the "v5 mission board place" in `TownHall.js`); a
  plaza `notice_board` until the hall exists; request bubbles (`ui_icon_request`, ≤ 3 on screen); a delivery pad at
  the giver for item requests (emits `delivered`); a timer chip for drive missions.
- **Budget:** ≤ 0.02 ms per tick (event-driven, 1 Hz expiry check). **Slice** `missions` ≤ 3 KB.

### 4.3 `src/bank` (v5; insurance in v8)

- **Model:** chief account — `deposit(n)`, `withdraw(n)`, `dayEnd(day) → interest` (1 %/day, capped at 150/day),
  `loanOffer(ctx) → { max: 2000 + 1500·rank + 10·fame, rate: 0.04, days: 6 }`, `takeLoan(n)`, `repayDaily(sources)`
  (역 금고 → tax box → wallet; gentle misses like the engine: two restructures, then a pause), v8 `insure(bldId)` /
  `claim(bldId)`. Residents' money stays in the story engine (`bank.js`); the module mirrors `passbook(id)` for cards.
- **Views:** civic `bank` cutaway at row D (§5.3; reveal on tap/hover `revealPoly`), tellers at `staffPoints` (v5:
  townfolk presets; v8 swaps in cityfolk `banker`/`bank_teller` when `cfPages.incidents.bank` is resident), customers
  from story `bank` events queue at `customerPoints` during 09–17, vault anim on deposits, `amb_bank`, `sfx_coin_count`,
  `sfx_stamp` (audio6 subset loaded in v5), passbook panel (`ui_passbook*`).
- **Budget:** ≤ 0.01 ms per tick. **Slice** `bank` ≤ 1 KB.

### 4.4 `src/vehicles` (v5) — eras, buses, trucks, cars, the chief at the wheel

**Model**
- `lanes.js`: adapter over `RoadNet.driveNodes/driveEdges/connectors` (right-hand lanes, quarter-circle connectors,
  `conflicts` lists — already unit-tested in v4).
- `VehicleSim`: per lane an ordered list; each vehicle `{ id, key, kind, route, lane, s, v, len, state, dwell }`;
  following `gap ≥ 1.2 m + 0.9 s·v`; junction entry by connector reservation (no conflicting connector occupied);
  rail crossings via `xingBlocked(k)` (both lines); pedestrians: stop if a materialised walker is within 2 m ahead
  (`ports` query) — nobody is ever hit; speed by class: dirt 3, cobble 4, asphalt 5.5 m/s, horses 2.5.
  Off screen: analytic (route + speed profile, no interaction), like TownSim's L2.
- `fleet.js`: bus line (stops, headway 90 s, dwell 6 s), cargo jobs (station cargo pad → founded shops; v6 → quay),
  household cars (rich households from the story's savings, parked at curb stalls; ≤ 6 moving at once), v8 emergency.
- `eras.js`: rank 2 (읍) → `horse_sleigh_bus`, `steam_wagon`, `cargo_sleigh`, `dog_sled`, `stable_depot`,
  `sleigh_stop`; rank 3 (도시) → `retro_bus`, `truck_cargo`, cars (4 resident colourways), `bus_depot`, `bus_stop`,
  `fuel_depot`, `traffic_light`; v8 → `police_car`, `fire_truck`, `ambulance`, logistics vans.
- `chiefDrive.js`: lane-snapped driving — the stick's projection on the lane heading is throttle/brake; at a junction
  the stick picks the connector whose heading is closest (straight when idle); dead end → U-turn connector.

**Rank 3 (도시)** is a data generalisation of v4's `Rank.js` (§13 P17): bars people ≥ 90, founded/other shops ≥ 8,
happiness ≥ 85, **fame ≥ 120**, coins 30 000 (estimates for the player plan); ceremony at the hall; rewards: main
street and boulevard repaved to asphalt with lane markings and crosswalks (RoadPaint markings, §13 P18), era-3
fleet, the stable depot rebuilt as a fuel depot (in place), the bus depot, title 시장 (Mayor).

**Views:** `VehicleSprite` (soft shadow ellipse with the manifest angle, frame, passengers at `seats` in
`seatDrawOrder` playing `sit`, then the `over_*` frame; SW/NW mirrored with dx negated), depots with bay doors,
stops (shelters on the +j sidewalk for NW-bound buses; a sign pole for SE-bound), traffic lights at the ave × main
junction from rank 3. **Residency class `vehicle`:** one ref per materialised vehicle key, at most 8 keys resident,
TTL 20 s.

**Budgets:** ≤ 24 simulated, ≤ 12 materialised, ≤ 0.15 ms per tick. **Slice** `vehicles` ≤ 1.5 KB.

### 4.5 `src/harbor` (v6) — 갈매기 항구

**Model**
- `schedule.js`: ferry ×4 a day (06:30, 10:30, 14:30, 18:30; dwell 60 s), cargo ship ×1 (09:00, dwell 180 s while the
  crane works), trawlers out 05:00 / back 15:00 (auction 15:30), tug escorts big ships, ≤ 2 sail/yachts. **Berths
  never double-booked** (test): ferry at the terminal (i 58–68), cargo at the crane (i 71–86), trawler at the basin's
  west wall (i 55, j −13…−22, 14.1 m for a 14 m trawler).
- `trade.js`: export orders brought by the cargo ship ("통조림 100개, 3일 안에" → coins + fame), imports that unlock
  chains (sugar/cloth/glass/spice shown as `crate_stack`/container visuals — **no item icons exist for them**, so v6
  keeps imports as "수입 상자" crates until an art job adds icons).
- `auction.js`, `tourists.js` (8–20 ferry passengers, seeded, transient; they shop at the harbour, then ride line B to
  the town and line A to our sellers through the existing Visitor flow).
- `coastLine.js`: line B kinematics on `Rail.legProfile` with the duck-typed surface `Train` reads
  (`B`, `consist()`, `iAt()`, `m`, `running`, `v`) plus `blocking(k)`.

**Views:** buildings as `TownBuilding`s from the harbour manifest at §5.4 anchors; quays, piers, breakwater and pier
roots **baked** into ground tiles (`tileLayer: ground`; 0 display objects); lighthouse beam at night
(`clock.addLight` + `anims.light`); crane cycle synced with the cargo slots (`pickFrame`/`dropFrame`); layered ships
(base → slots → foam → anim; bob `y += bob.px·sin(2πt/periodS)` or `Water.heightAt`, plus `addHull` contacts);
≤ 6 gulls; `amb_harbor`, `bgm_harbor` as area music.
**People:** `dock_worker`, `sailor`, `auctioneer`, `lighthouse_keeper` presets (harbour `townfolk_presets.json`),
≈ 20 story residents homed in `sailor_lodge` and harbour rooms, TownSim kinds registered with day plans.
**Budgets:** ≤ 0.10 ms per tick; ≤ 6 ship sprites; ≤ 400 static display objects. **Slice** `harbor` ≤ 2 KB.

### 4.6 `src/beach` (v7) — 햇살 해변

**Model:** `activities.js` (slots from the manifests: `lyingPoints/lyingFeetDirs`, `seatPoints/seatDirs`,
`swimPoints`, `playPoints/ballDirs`, `workPoints/workDirs`; scripts: swim, float, sunbathe, dig, volleyball, splash,
surf, ice cream, kayak/swan rides; capacity per slot; busy 10–17), `resort.js` (hotel level 1–3 → rooms 12/20/32,
stays in nights, shops buying village goods wholesale: bread, fish, smoked meat, cans), `crowd.js` (≤ 60 present,
≤ 30 materialised, seeded per day; tourists from ferries and line B; townsfolk day-trippers).
**Views:** sand baked (`ground_sand`, wet band, `wetKit`/`sandKit` edges, decals) through a bake hook; props and
beach buildings with overlays at d+1, staff at `staffDepths`; night glows (`<key>_glow` ADD at `DEPTH.FX − 29`,
`clock.addLight` for `lightPoints`); beachgoers as DollSprites on the merged TF (swimmers at the water point,
`fx_swim_ripple` one depth below, `water.ripple(x, y, 0.55)` ≈ 1/s); boats as water-plane characters; tropical
Water region + hotel pool region (§7); `amb_beach`, `bgm_beach`.
**Budgets:** ≤ 0.15 ms per tick; beach pages ≤ 120 MiB (§8). **Slice** `beach` ≤ 2 KB.

### 4.7 `src/city/logistics` (v8)

**Model:** stock by category (materials, food, goods, furniture, tools, appliances) with rack fill levels from
`rackSlots`; inbound (porters, steam wagon / trucks from the station cargo pad), outbound (story `shop` pick-ups and
settlement → coins into a 물류 금고 pad), chains: planks → furniture (furniture workshop), ingots → appliances
(appliance factory) — both **buildable village work buildings** on M plots (3 × 3 m footprints; a `Civic.CATALOG`
entry each), not fixed city buildings. Vans deliver to shops via `src/vehicles`.
**Views:** cutaway (`_floor`, `_interior`, `_back`, `_shell`; tap/hover `revealPoly` fades the shell over `fadeMs`),
forklift on `forkliftPath`, conveyor, dock doors per bay, stock stacks per `cells`/`itemFit`/`stockScale`, staff from
cityfolk (`warehouse_worker`, `forklift_driver`) when the `logistics` cityfolk group is resident (36.7 MiB) else
townfolk stand-ins. **Budgets:** ≤ 0.08 ms per tick; inside layers skipped while the shell is opaque. **Slice**
`logistics` ≤ 2 KB.

### 4.8 `src/city/incidents` (v8)

**Model:** `IncidentDirector` maps story `incident` events (theft: act → chase → arrest → station → release |
wanted → tipped; fire: smoke → dispatch → spray → repair | ruin → demolish → construct → done; queue; window; scuffle)
to stage scripts; requests a StageDirector slot; acks staged phases (`ackWait`); keeps building visual states
`[bldId, state, t]` (ok, smoking, burning, ruin, demolition, site, rebuilt +1 level); hydrants and the fire-station
level lower `fireRate` (E4). Settings "사건·사고 끄기" → `toggles.incidents = false` and the director idles.
**Views:** FireScene (`fx_fire_bld_s/m/l` per the fireMount table, `fx_smoke_column`, embers; fire truck from
`t_fire` through `src/vehicles`; firefighters `spray_hose` with `nozzlePoint` → `fx_hose_*`; steam; crowd
`shocked/point/phone`), ChaseScene (`flee`/`run`/`arrested_walk`, `bgm_chase`), ScuffleScene (`fx_fight_cloud`,
simple mode when either side lacks `fight`), DemolitionScene (civic `demolitionLayout`, excavator `dig`,
dump truck `tip`, rubble → `_half` → site stages), MovingScene (`moving_truck` `unload`, `carry_box` movers),
WantedBoard (portraits rendered once per poster from the doll's head layers into a 64 px canvas). **Residency:**
cityfolk incident group + the fx set acquired at `stage`, released 15 s after `end`. **Budgets:** ≤ 0.10 ms per tick,
one staged incident, transient ≤ +70 MiB for ≤ 90 s. **Slice** `incidents` ≤ 2 KB.

---

## 5. World and map (lattice coordinates)

### 5.1 Frame

All new geometry is on the v4 lattice `L(i, j) = (3120 + 64·(i + j), 1315 + 32·(i − j))` (one cell = √2 m;
`world.js` `L4`/`px2L4`). Rail = line `j = 0`; north coast ≈ `j 5.9` (0.5 slope continues east); buildings face −j;
X-streets carry building rows on their +j side.

**South coast (new, warm current):** sea where `i > 55` and `j < southJ(i)`:

| i | southJ(i) | shore type | What |
|---|---|---|---|
| < 55 | — | — | land (town, new city) |
| 55 (wall) | j < −12 | `quay` (+X face shows) | basin west wall, trawler berth |
| 55 … 86 | −12 | `quay` (−Y face shows) | harbour quay |
| 86 … 90 | −12 → −19 | `rock` | rocky point (lighthouse) |
| ≥ 90 | −19 | `sand` | beach waterline |
| breakwater | j −22, i 57 … 80 | `breakwater` | shelters the basin; mouth i 80 … 86 |

Key points: quay (55, −12) = (5872, 3459) → (86, −12) = (7856, 4451); west wall bottom (55, −22) = (5232, 3779);
breakwater (57, −22) = (5360, 3843) → (80, −22) = (6832, 4579); beach waterline (90, −19) = (7664, 4803) →
(120, −19) = (9584, 5763).

### 5.2 Regions and world size (Territory rects; horizontal bands so rects can separate diagonal districts)

| Region | Rect [x0, y0, x1, y1] | Opens | Contents |
|---|---|---|---|
| rail, town (v4) | [3000, 0, 4150, 3450], [4150, 0, 6144, 3450] | v4 | + v5 row D (§5.3) |
| `harbor` (v6) | [6144, 0, 10752, 4600] | v6 gate | harbour, rail to k 98, the future beach station site |
| `harbor_w` (v6) | [5200, 3450, 6144, 4600] | `openWith: 'harbor'` | basin west wall |
| `beach` (v7) | [5200, 4600, 11264, 5888] | v7 gate | beach row, sand, the warm sea |
| `newtown` (v8) | [3000, 3450, 5200, 4600] | v8 gate | police station, logistics centre |

World: v6 `width` 6144 → **10752**, `height` 3450 → **4864**; v7 height → **5888**, width → **11264**. Content
that straddles a band edge is fine because district content is created by its module at its gate (the fog only
matters for static decor; none is placed across a band edge). `borderTrees` patches: the town's east band
`[6024, 300, 6144, 3450, …, 'town']` gets `until: 'harbor'`; the south bands of rail/town get `until: 'newtown'`
except where row D needs room in v5 (x 3046–4560).

### 5.3 v5: row D (inside today's rail/town regions, behind the homes/apts footpaths at j −18)

| Id | Art | Lattice (i, j) | px | Footprint cells i / j | Note |
|---|---|---|---|---|---|
| `v5_memorial` | `memorial_garden` | (23.95, −19.54) | (3402, 2707) | 22.25–25.64 / −20.77…−18.30 | 추모 정원 (farewells) |
| `v5_stable` | `stable_depot` | (27.66, −19.71) | (3629, 2831) | 25.89–29.43 / −21.13…−18.30 | era 2; `fuel_depot` rebuilt in place at 도시 |
| `v5_bank` | `bank` | (36.21, −19.93) | (4162, 3111) | 34.30–38.12 / −21.55…−18.30 | 은행 (cutaway) |
| `v5_busdepot` | `bus_depot` | (40.77, −20.14) | (4441, 3264) | 38.37–43.18 / −21.98…−18.30 | era 3, at 도시 |

Streets: `bank_st` 은행길 X, i 23.1–40.9, j −24.2…−22.2 (one lane; asphalt at 도시); `ave_s` 중앙로 extension Y,
i 30–34, j −22.2…−18. Stops: shelters only where the +j sidewalk (j −4…−3) has no shop door behind it — the town's
`t_sled` spot (i 31.7) and the square's east edge; the v5 binding plan places them with the checker (the square's
pads at j −3.4/−3.9 must move 0.5 cell south first).

### 5.4 v6: 갈매기 항구 (all checked: inside regions, off the ballast, out of both seas, no overlaps)

| Id | Art | (i, j) | px | Footprint i / j |
|---|---|---|---|---|
| `h_shipyard` | `shipyard` | (57.87, −10.23) | (6169, 3494) | 55.40–60.35 / −12.00…−8.46 |
| `h_ferry_terminal` | `ferry_terminal` | (62.91, −10.59) | (6469, 3667) | 60.65–65.18 / −12.00…−9.17 |
| `h_fish_auction` | `fish_auction` | (67.60, −10.59) | (6769, 3817) | 65.48–69.72 / −12.00…−9.17 |
| `h_customs_house` | `customs_house` | (71.57, −10.73) | (7014, 3949) | 70.02–73.13 / −12.00…−9.45 |
| `h_harbor_warehouse` | `harbor_warehouse` | (75.69, −10.37) | (7300, 4069) | 73.43–77.95 / −12.00…−8.75 |
| `h_harbor_crane` | `harbor_crane` | (79.39, −11.08) | (7492, 4210) | 78.25–80.52 / −12.00…−10.16 |
| `h2_harbor_market` | `harbor_market` | (57.98, −2.21) | (6689, 3241) | 56.00–59.96 / −3.20…−1.22 |
| `h2_seafood_restaurant` | `seafood_restaurant` | (62.43, −2.07) | (6983, 3379) | 61.16–63.71 / −3.20…−0.94 |
| `h2_sailor_lodge` | `sailor_lodge` | (66.11, −2.14) | (7214, 3499) | 64.91–67.31 / −3.20…−1.08 |
| `h2_harbor_office` | `harbor_office` | (69.64, −2.14) | (7440, 3612) | 68.51–70.77 / −3.20…−1.08 |
| `h_station` 항구역 | `train_station` | (62.00, 2.03) | (7218, 3234) | 59.45–64.55 / 0.47…3.59 |
| `h_lighthouse` | `lighthouse` | (88.40, −11.40) | (8048, 4509) | 87.13–89.67 / −12.46…−10.34 |

Second-row buildings must be ≤ 2.45 cells deep (front at j −3.2, ballast at −0.75): customs and the warehouse go to
the quay row. Coastal boulevard `blvd_h` 바닷가 큰길 X, i 49.5–86, j −8…−4 (continues the town's main-street
corridor; two lanes; asphalt). Berths: ferry far side to the terminal gangway
(`ferry anchor = terminal anchor + gangwayPoint − ferry.gangwayFarPoint[SE]`, per `ships.md`), cargo ship along the
quay at the crane, trawler along the west wall heading NE/SW.

**Rail and line B:** rail tiles k 46 → 98 (`rail_x_end_p` at k 98 = (9424, 4467)); crossings k 65 (harbour) and
k 97 (beach). Line B stops (3 cars, engine on the NW end like line A): town-east halt carA i 37.5 (5520, 2515),
train ends i 34.93–39.90 (clear of the k 33 crossing); 항구역 carA i 62; 해변역 carA i 94 (built in v7; a snowed-in
site in v6 like v4's ruin). Legs 34.6 m / 17.1 s and 45.3 m / 21.2 s; dwell 10 s; **cycle ≈ 117 s**.

### 5.5 v7: 햇살 해변 (front row on the boardwalk at j −12.4; sand j −12.9…−19)

| Id | Art | (i, j) | px |
|---|---|---|---|
| `b_beach_cafe` | `beach_cafe` | (92.16, −11.13) | (8306, 4620) |
| `b_icecream_shop` | `icecream_shop` | (95.21, −11.27) | (8492, 4722) |
| `b_resort_hotel` | `resort_hotel` | (99.54, −10.35) | (8828, 4832) |
| `b_hotel_pool` | `hotel_pool` | (104.94, −10.31) | (9176, 5003) |
| `b_seafood_bbq` | `seafood_bbq` | (108.91, −11.13) | (9378, 5156) |
| `b_surf_shop` | `surf_shop` | (111.90, −11.20) | (9565, 5254) |
| `b_convenience_store` | `convenience_store` | (114.89, −11.13) | (9761, 5347) |
| `b_mini_aquarium` | `mini_aquarium` | (118.23, −11.06) | (9979, 5452) |
| `b2_pension`, `b2_tourist_info`, `b2_souvenir_shop`, `b2_swimwear_shop`, `b2_beach_bar` | second row, front j −3.2 | (89.84 … 103.32, −2.0…−2.3) | (8742, 4254) … (9605, 4685) |
| `b_station` 해변역 | `train_station` | (94.00, 2.03) | (9266, 4258) |

Boulevard `blvd_b` i 86–116, j −8…−4. Boardwalk (`boardwalk_x`) along j −12.9. Props on the sand by slot tables;
lifeguard tower near (101, −16.5); swim buoy line along j −21.

### 5.6 v8: 새 시가지 (newtown)

| Id | Art | (i, j) | px | Footprint i / j |
|---|---|---|---|---|
| `c_police` | `police_station` | (43.15, −32.17) | (3822, 3725) | 40.60–45.69 / −33.80…−30.55 |
| `c_logistics` | `logistics_center` | (50.09, −30.97) | (4344, 3909) | 46.20–53.98 / −33.80…−28.14 |

Streets: `ave_c` Y, i 36–40, j −34…−24.2 (from 은행길 into the new city); `lgx_st` 물류길 X, i 35–54.2, j −36…−34.
The newtown is bounded by x ≥ 3046 (i + j ≥ −1.2), the band x ≤ 5154 and the basin (i ≤ 55): parking lots do not fit
— cars use curb stalls (`stall_lines`). Furniture workshop / appliance factory are village work buildings (§4.7).

### 5.7 Checker

`layout_v5v8.py` (scratch; to become `tools/test/v5_layout_ref.py` and `v5_layout.mjs` like v4's pair) checks every
row of §5.3–5.6 against the v4 layout (`v4_layout_ref.py --json`), both seas (north `shoreY + 60`, south `southJ`),
the ballast, region union with a 46 px world inset, streets, and prints **`no problems`** today.

---

## 6. Doll runtime: merging townfolk2, beachfolk, cityfolk

| Step | Rule (from the fragment reports) | Where |
|---|---|---|
| Merge | `townfolk ← townfolk2 ← (beachfolk) ← cityfolk` with one generic `mergeTownfolkFragments(man, ...frags)` (port of `tools/cityfolk_compose.js`); no redefinitions (throws); `frameAtlasExt` per page routes new frames for old layers (`frameAtlasAnim[anim][layer@base] ?? frameAtlas[layer@base]`, `frameAtlasPose`); shallow-merge `animItems`, `animFallback`, `fallbackFace`, `cfDrop`, `cfPages`, `cfParts`, `lowerShare`; `faceExprs` union; `headOffset` gains new anims | new `src/kit/townfolkMerge.js`, called from `Assets.mergeLate` |
| Generation | `TOWNFOLK2 = true` (unlocks `hat_cap`/`hat_headband` with the 6 override frames); presets merged (`bride`, `groom`, `mourner`, harbour presets, beach presets, city presets) | `src/core/Townfolk.js` |
| Draw rules | port `animParts`, `partPlays` (`parts[].anims` / `noAnims`), `animHideHead` with hair un-squash, timeline `hd`, `faceDirsByPose`, `followDz`, `cfCover`, `cfDrop`, `animItems`, `setFace()` overrides, `pickAnim(person, anim, { has })` with `animFallback` + `fallbackFace` | `TF.layersInto` |
| Age sheets | `AGE_SHEETS` regex covers `tf_`, `tf2_`, `bf_`, `cf_` + `bf_head_0`, `cf_head_*` | `Townfolk.js` |
| Pages | `pack_pages.py` `TF_FRAGS = ['townfolk', 'townfolk2', 'beachfolk', 'cityfolk']`; classes: `loco`, `social`, `life` (tf2 sad/clap/sit/push + wedding/mourning parts), `beach` (bf `pageClasses`: beach, water, swim/lie heads), cityfolk groups (`head`, `loco`, `rush`, `crowd`, `scuffle`, `work`, `fire`, `social`); `carry_walk` never shipped; half tier for loco pages | `tools/build/pack_pages.py` |
| Residency | `dollLife` (acquired by StageDirector, TTL 60 s), `dollBeach` (area class for the beach band), `incident:<name>` (acquired at `inc:stage`, released 15 s after `inc:end`); `has(anim, person)` = page resident, so `pickAnim` falls back instead of drawing holes | `Residency.js` |
| Parity | `tools/test/townfolk_runtime.mjs` (1000 people × 4 fragments) and `cityfolk_phaser.mjs --parity` against the ported runtime | tests |
| Known upstream issue | 2-px slivers in some `bot_longskirt.main@elder_slim` / tf2 frames (cityfolk report): clear rows 0–1 in `pack_pages` page build (no source asset change) | pack_pages |

Draw-call guard: more than 16 textures visible flushes the batch. Classes keep beach pages out of the town and
cityfolk groups out of everything but staged incidents; the gate stays ≤ 12 draw calls per view (§9).

**Voices:** story bubbles reach `VillageVoice` through `Bubbles.chat`; `voice/cast.js` gets job mappings
(dock_worker/sailor → `big_gruff`, lifeguard → `young_m`, vendors → `sweet`, firefighter/police → `adult_m`,
burglar → `squeaky`); StageDirector ducks voices during ceremonies (`voice.duck(0.35, 0.7)`).

---

## 7. Water

| Region | Palette | Mask | Shore types | When drawn |
|---|---|---|---|---|
| village sea (exists, C2) | `winter_sea` | `WaterPresets.village(WORLD.width, shoreY)` | snowbank | always near the north coast; field re-baked for width 10752 / 11264 |
| harbour basin | `harbor` | `{ water: [basin poly], land: [breakwater] }`, `waterPx` 30 | quay, breakwater, rock | view intersects its bbox |
| warm sea | `tropical` | `{ land: [{ poly: sand, waterPx: 0 }, { poly: breakwater, waterPx: 30 }] }` | sand, rock | v7 |
| hotel pool | `pool` | `hotel_pool.waterPoly` at the anchor, `openSea: false`, depth d − 0.5 | quay | v7, near the hotel |

- Programs and textures are shared; a region whose bbox misses the view is `setVisible(false)` (cost 0). At most two
  shader regions draw in any view.
- **Palette seam:** basin (`harbor`) and warm sea (`tropical`) meet only in the basin mouth (i 80–86 behind the
  breakwater end and the rocky point). If the seam reads, the fallback is one `tropical` region for the whole south
  sea (water report §6.6 allows any number of regions; it does not blend palettes).
- Static coasts are baked (`tools/fx/gen_water_field.mjs` `FIELDS` + a preset next to `WaterPresets.village`).
- Water-plane props and ships: `y − water.heightAt(x, y)`, tilt by `slopeAt`, `addContact`/`addHull`; night:
  `water.setLighting({ dark: dayClock.cur.a })`; ambience in step with crests via `bedSeek`/`syncPhase`.
- South-sea walkability: `Collision.blocked` gains `seaAt(x, y)` (north `shoreY` OR `southSea(px2L(x, y))` with a
  0.72-cell margin, §13 P7).

---

## 8. Textures and residency per district

### 8.1 Budget rule

Any view stays ≤ **300 MiB target** / **455 must** (v4's numbers, unchanged). Per district, its **own pages ≤ 120
MiB** resident; incidents and life events are **transients** (≤ +70 MiB for ≤ 90 s). Areas (Residency
`addArea`): `harbor` (harbour + ships), `beach` (beach, beach_bld, bf pages), `newtown` (civic police/bank layers,
logistics), with the v4 hysteresis (acquire 800 px, release 1200 px, TTL 10 s).

### 8.2 Estimated residency (MiB, source-sum; estimates from measured atlas sizes)

| View | Core + ground | Townsfolk | District pages | Vehicles / ships | Total | Levers if over |
|---|---|---|---|---|---|---|
| v5 town, wedding at the hall | 58 + 18 | loco 39 + social ≤ 25 + **life ≤ 40** | town bld 40.7, life2 4.5 | bus + 2 cars ≈ 15 | ≈ 240 (transient 280) | life pages for the couple's ages only |
| v5 station district, rank 3 | 58 + 18 | 39 + 25 | district bld ≈ 20, bank closed 5 | 8 keys cap ≈ 45 | ≈ 210 | 4 car colourways in one page |
| v6 harbour | 60 + 18 | 39 + 25 | harbour 42 (tiles bake-only) | ships SE-only ≈ 30, train 5, trucks 10 | ≈ 230 | ships out of view evicted (ship class) |
| v7 beach | 60 + 18 | tf loco 39 | beach 53.5 (nature split), bbld 32.3 (+glow 6.7 at dusk), bf loco 17.3 + social 22.2 + beach 8.4 + water 8.3 + heads 7.7 | boats 13, train 5 | ≈ 290 | bf half tier at zoom < 0.85; `beach_nature` split by co-visibility; water page only with swimmers in view |
| v8 newtown, fire staged | 60 + 18 | 39 + cf fire group 59.8 (−shared) | logistics closed 23, police 5 | fire truck 9.6, vans 10 | ≈ 230 (+fx fire set 19 transient) | incident groups only while staged |

**Ships:** the basin uses heading SE/NW only (arrivals from the open sea to the south-east head NW = mirrored SE),
so `pack_pages` keeps SE frames (+ the S frames of the ferry for its arrival shot if the player plan wants it):
65.8 → ≈ 30 MiB (estimate). **Vehicles:** both rendered headings are needed (X and Y streets).

### 8.3 Lazy loading (who asks, when)

| Trigger | Fetch |
|---|---|
| v5 gate (town open) | story worker script; `fx_city` UI subset (`ui4_icons`, `ui_newspaper*`, `ui_passbook*`, `ui_story_card*`, 1.9 MiB); audio6 bank/news subset |
| first wedding / farewell scheduled (≥ 60 game s ahead) | `townfolk2` life pages for the cast's ages, `life2` wedding or memorial atlas, `bgm_wedding` / `bgm_farewell` |
| rank 2 + stable depot site | era-2 vehicle pages; rank 3 ceremony → era-3 pages |
| v6 gate prefetch (tower/rail site started) | `harbor`, `ships` manifests, harbour building pages, `audio4` |
| ship scheduled within view distance | that ship's page |
| v7 gate prefetch | `beach`, `beach_bld` (eager atlases), `beachfolk` loco/social, `audio5` beach loops |
| v8 gate prefetch | `logistics`, `civic`, `cityfolk` head/loco, `audio6` rest; incident groups at `inc:stage` |

---

## 9. CPU, display objects, draw calls

| Part | Budget (avg ms per tick, fixed-step bench) |
|---|---|
| StoryHost + StoryLife (main thread) | ≤ 0.10 |
| Story worker | ≤ 2 ms per game second on a phone (off-thread; 0 long tasks on main) |
| Missions / bank | ≤ 0.02 / ≤ 0.01 |
| Vehicles (24 sim, 12 sprites) | ≤ 0.15 |
| Harbour (schedule, ≤ 6 ships, crane, gulls) | ≤ 0.10 |
| Beach (≤ 60 present, ≤ 30 rigs, activity scripts at 4 Hz) | ≤ 0.15 |
| Logistics / incidents | ≤ 0.08 / ≤ 0.10 |
| TownSim with ≤ 200 citizens (v4 measured 0.10–0.24 at ~130) | ≤ 0.35 |
| **Whole game, any view** | **≤ 2.1 ms** (v4 town gate) |

Display objects: district static ≤ 400 (quays, piers, sand, boardwalks and markings are baked); a district view
≤ 1700 total (v4's gate; the doll rig caps 32 full / 40 lite are global through `DollPool`). Draw calls ≤ 12.

Culling: v4's `Culler` already drops world pictures more than 300 px outside the view from the draw (camera filter)
and parks far boot-`props` pictures off the display list. District views follow its rules (plain Images, Sprites and
Containers in the world list; no off-screen RenderTextures), so a harbour 3000 px away costs nothing to draw. Water
regions are `Extern` objects and are switched by bbox instead (§7). Off-screen simulation stays analytic (TownSim L2,
vehicles' route profiles, ships' timetable positions), so a district far from the camera costs only its model tick.

---

## 10. Saves

### 10.1 Slices

| Key (main save) | Owner | Shape (abridged) | Cap |
|---|---|---|---|
| `story` | story | `{ v: 1, day, ok, chars }` (a pointer; the data is in the side key) | 64 B |
| `missions` | missions | `{ v, nextId, day, offered[≤6], active[≤4], streak:{n,last}, fame:{pts,title,log[≤12]}, seen:{tpl:day}[≤60] }` | 3 KB |
| `bank` | bank | `{ v, savings, loan:{amt,rate,perDay,missed,paused}|null, lastDay, insured[≤32] }` | 1 KB |
| `vehicles` | vehicles | `{ v, era, fleet[[id,key,home]] ≤24, cars[[pid,key]] ≤24, chief:{truck,best:{route:s}} }` | 1.5 KB |
| `harbor` | harbour | `{ v, open, exports[≤3], imports:{unlocked[],stock}, fleet:{trawlers}, auction:{day,coins}, tourists:{today,total} }` | 2 KB |
| `beach` | beach | `{ v, open, hotel:{level,occupancy}, facilities{}, sales{}, events{} }` | 2 KB |
| `logistics` | logistics | `{ v, stock: counts, orders[≤12], chains{}, cash }` | 2 KB |
| `incidents` | incidents | `{ v, buildings[[id,state,t]] ≤16, wanted[≤3] }` | 2 KB |

Main save total ≤ **16 KB**, write ≤ 3 ms (v4: 5.7 KB, 0.2 ms). Transients (ships at sea, tourists, beachgoers,
vehicles in motion, staged scenes) are **not saved**: on load ships restart at the next timetable slot, staged scenes
resolve off-stage.

### 10.2 Side keys (localStorage, all tied to the save by `cid` like the chat)

| Key | Content | Cap | Written |
|---|---|---|---|
| `frostVillage.save.v1` (+ `.backup`, `.backup.2`, `.bad`) | main save | 16 K chars each | autosave (5 s) |
| `frostVillage.save.v1.chat` | ChatVillage | 220 K | when a chat changed it (exists) |
| `frostVillage.save.v1.story` | `{ v: 1, cid, T, day, reg: [[pid, sid]], eng: <pack15> }` | **450 K chars** (hard 600 K) | at `day`, `pagehide`, `visibilitychange: hidden` |
| `frostVillage.settings.v1` | + `lifeEvents`, `farewell`, `incidents` | < 1 K | on change |

Worst case ≈ 64 K + 220 K + 450 K ≈ 0.75 M chars — under Safari's 5 MB (2.5 M UTF-16 chars). Over 450 K the host
calls `compact(1)`, then `compact(2)`; over 600 K it keeps the previous slice and shows one toast. The story slice
may lag the main save by ≤ 600 game seconds (a crash between two days): on load the registry reconciles (game people
missing in the story → `add`; story people without bodies → leased "away") and the worker fast-forwards at most one
game day.

### 10.3 Migration chain

`SAVE_VERSION` 6 → **7** (v5) → **8** (v6) → **9** (v7) → **10** (v8). Each `MIGRATE[n] = (s) => ({ ...s, v: n + 1 })`
— nothing is renamed or dropped; a module slice starts fresh the first time its module runs. `sanitizeSave` calls each
registered slice sanitizer (`src/kit/slices.js`: `[{ key, sanitize }]`) and **keeps a slice that its module is not
running yet** (pass-through, like `v4`). Old saves from v3.5/v4/v4.1 walk the chain unchanged; a newer save on an older
build is backed up and not loaded (today's behaviour). Tests: real fixtures for each step (v4.1 saves at 30/60/90 min),
200 fuzzed slices per module, idle income within ±6 % across the migration (v4's rule).

---

## 11. Artifact: files and bytes

Files are the binding limit (511 per version; today 491). Budget per version (**≤ 495**, gate in `build_artifact.mjs`):

| Step | Change | Files |
|---|---|---|
| v5 P0 | one-shot SFX packed into one audio sprite per fragment (`load.audioSprite`; loops and music stay files): audio 36 → 1, audio2 25 → 1, audio3 14 → 1 | −71 |
| v5 P0 | title backdrops/logo parts packed into pages (34 → ~12) | −22 |
| v5 | vehicles → ~12 pages (era 2, cars ×4 colourways per page, bus/trucks, emergency, buildings); townfolk2 → ~6 pages; audio3 loops; `story.js` + `story_worker.js` | +24 |
| v6 | ships ~4 pages (SE only), harbour ~4, audio4 (sprite + 2 loops + manifest) | +12 |
| v7 | beach ~6, beach_bld ~5, beachfolk ~5, audio5 rest (sprite + 3 loops) | +20 |
| v8 | logistics ~6, civic ~4, fx_city 37 → ~5 pages, cityfolk ~8, audio6 (sprite + 6 loops + manifest) | +31 |
| **Total after v8** | 491 − 93 + 87 | **≈ 485** |

Bytes: + ≈ 47 MB over v5–v8 (fragment payloads in §1 + 0.8 MB story) → ≈ 110 MB per version (limit 256 MB), 2–3
publish batches (≤ 64 MB each), boot files in the last batch (v4 rule). The story code ships like the chat:
`story.js` (classic script setting `__FV_STORY_MOD`, loaded at the v5 gate) and `story_worker.js` (worker entry); a
build check refuses either if it contains `import`/`export` (the `chat.js` check, extended).

---

## 12. Test strategy

### 12.1 Node unit tests (now; `node --test tools/test/later/<mod>.test.mjs`, `nice -n 15`)

| Module | Must prove |
|---|---|
| kit | import-graph rules of §2.1; `slices` sanitizers accept their own output; feed normalizer covers every event of §3.2 |
| story | E1–E6 (external plans give talks only between co-present residents; add/remove keep households valid; leased residents never cast; missing kinds tolerated; compact keeps the save under cap after 120 days; packed round trip identical); protocol round trip worker ↔ inline identical over 3 game days; adoption keeps every TownSim name; registry reconcile; v4's 30 engine tests still green |
| missions | 30 simulated days: ≥ 3 offers/day, no template twice in 3 days, every mission completable from producible items (anti-softlock), fame curve monotonic, sanitize fuzz |
| bank | money conservation (wallet + savings + loans), interest cap, no loan grows after two restructures, rounding |
| vehicles | 10 000 random routes on the v4 + v5 graphs: no two vehicles overlap on a lane, no conflicting connectors occupied, all stops reachable, chief-drive picks the expected connector for 8 stick directions, crossings respected |
| harbor | schedule never double-books a berth over 30 days; line B never covers a crossing at a stop; exports completable; tourists conserved |
| beach | slot capacity never exceeded; every activity's dirs have frames (reads manifests); hotel occupancy bounds |
| logistics | stock = in − out per category; settlement sums; racks never above capacity |
| incidents | one staged incident; every staged phase acked or timed out; ruin → rebuilt +1 level; toggle off cancels |
| layout | `v5_layout_ref.py` prints `no problems` (§5.7) |

### 12.2 Phaser lab per module (now; the designer's preview before integration)

`tools/test/later/<mod>_lab.html` + `<mod>_lab.mjs` (Playwright, Chromium from `PLAYWRIGHT_BROWSERS_PATH`, one browser
at a time, fixed-step clock, ≤ 2 min per run). A shared `lab_kit.js` boots Phaser 3.90 with `FakePorts`, loads real
manifests and atlases read-only, and reports **draw calls** (GL wrapper as in `review_robust_drawcalls.mjs`),
**display objects**, **texture MiB** (source-sum), **ms per tick**, 0 placeholders, 0 console errors. Captures go to
`docs/previews/later_<mod>_*.png|gif`.

| Lab | Scenes |
|---|---|
| story | 12 townsfolk at the fountain talking (Korean + English), a wedding at the town hall, a stroller walk, the newspaper panel, worker vs inline timing |
| missions | board panel with 4 cards, request bubbles, a delivery, title-up banner |
| bank | cutaway open/closed, queue of 6, vault, passbook |
| vehicles | the station district at 읍 (horse sleigh bus, steam wagon) and at 도시 (asphalt markings, bus, trucks, 6 cars, traffic light), chief driving |
| harbor | quay row, ferry berthing with passengers, crane cycle with the cargo ship, trawler at the wall, lighthouse at night, gulls, basin water |
| beach | sand + boardwalk + hotel + pool, 40 beachgoers (swim, sunbathe, dig, volleyball), boats, dusk glows |
| logistics | reveal tween, stocked racks, forklift loop, vans at docks |
| incidents | fire → spray → ruin → demolition → rebuild sequence, chase + arrest, scuffle cloud, wanted board |

### 12.3 In-game integration (later, per version)

`tools/test/v5.mjs`, `v6.mjs`, `v7.mjs`, `v8.mjs` (fixed-step, `__FV.later.*` hooks and fixtures), `save_v5.mjs …`
(real fixtures, migration chain, fuzz, reload mid-scene), `texbudget.mjs` tour extended with harbour, beach and newtown
stops, `v4a_perf.mjs` extended per view, bot policies in `review_gameplay_sim.mjs`, a 10-minute soak per version,
designer shot sets. Every existing suite stays green (v4's list: smoke, v3, labour, dog, life, zoom, town, rail,
v4, save_v2…save_v4, roadnet, texbudget, chat tests).

---

## 13. Integration patches (exact; anchors by content, applied by the lead after v4 ships)

| # | File | Change |
|---|---|---|
| P1 | `src/scenes/Game.js` | one block `// ---- (v5+) later modules`: `import { ModuleHost } from '../kit/ModuleHost.js'`; in `build()` after `Neighbours.attach(…)`: `this.later = new ModuleHost(this, sv, LATER_MODULES)`; in `tick()` after `if (this.v4) this.v4.update(dt);`: `if (this.later) this.later.update(dt);`; in `serialize()` spread `...(this.later ? this.later.serialize() : this.later_passThrough)`; in `save()`: `if (this.later) this.later.saveSide(force)`; `installHooks`: `__FV.later` |
| P2 | `src/core/Save.js` | `SAVE_VERSION = 7` and `MIGRATE[6] = (s) => Object.assign({}, s, { v: 7 })` (then 8, 9, 10 per version); in `sanitizeSave`: `for (const sl of LATER_SLICES) { const v = sl.sanitize(raw[sl.key]); if (v) s[sl.key] = v; }`; `StorySave` (copy of `ChatSave`, key `SAVE_KEY + '.story'`, record `v` 1, `cid` check); `Save.clear()` also clears it; `Settings`: `lifeEvents`, `farewell`, `incidents` (default true) |
| P3 | `src/core/Assets.js` | `LATE_FRAGMENTS += ['vehicles', 'townfolk2', 'fx_city', 'audio6', 'ships', 'harbor', 'beach', 'beach_bld', 'beachfolk', 'logistics', 'civic', 'cityfolk']`; `mergeLate` routes `townfolk2/beachfolk/cityfolk` through `mergeTownfolkFragments` before `TF.init`; audio sprite support (`queueLateAudio` loads `audioSprite` entries) |
| P4 | `src/core/Residency.js` | `export function addArea(area)` (push onto `REGIONS`), `addClass(name, { ttl, cap })` for `vehicle`, `ship`, `dollLife`, `dollBeach`, `incident:*`; `stats()` per class |
| P5 | `src/core/Townfolk.js` | `TOWNFOLK2 = true`; port the draw rules of §6 into `layersInto`; `AGE_SHEETS` regex; `TF.setFace(person, face)`; `TF.pickAnim(person, anim, has)` |
| P6 | `src/systems/TownSim.js` | `registerKind(kind, { plan, look, age })`, `addPlaces(blds)`, `hold(c, owner)` / `release(c)` (held citizens skip `wake`/`planDay`), `walk(c, x, y, opts, cb)`, `onArrive(fn)` (feeds story `at()`), `bodyOf(c)`; v4 kinds unchanged |
| P7 | `src/systems/Collision.js` | `seaAt(x, y)` = `y < shore(x) + 46` OR `WORLD.southSea && southSea(px2L(x, y))`; `blocked()` uses it |
| P8 | `src/entities/Seller.js` (`complete`) | `gs.events.emit(this.cfg.soldEvent \|\| 'sold', value, c.want.type, c.want.count);` |
| P9 | `src/entities/Station.js` | after `this.outStack.push(this.output, s);` add `gs.events.emit('produced', this.id, this.output, 1);` |
| P10 | `src/systems/DayClock.js` (`update`) | when `this.day()` changes: `this.gs.events.emit('day', this.day())` |
| P11 | `src/systems/VillageLife.js` (`react`), `src/systems/Neighbours.js` (`tap`) | emit `'tap'` with the person's pid before the existing reaction |
| P12 | `src/scenes/UI.js` | `openPanel(PanelClass, data)` host, `chip(id, spec)` slots (fame/title, missions, news edge icon), settings rows 생애 이벤트 / 이별 이벤트 / 사건·사고 (ko + en) |
| P13 | `src/entities/TownHall.js` | `boardLines()` appends `gs.later.missions.boardLines()`; `openBoard()` opens MissionBoard when missions run |
| P14 | `src/systems/Neighbours.js` | `this.rails = [this.rail]`; `gs.roads.edgeBlocked = (e) => !!(e && e.xing >= 0 && this.rails.some((r) => r.blocking(e.xing)))`; v6 pushes CoastLine; `'v4:train'` payload gains `line` |
| P15 | `src/core/Audio.js` | audio-sprite playback for packed SFX (`Audio.play(key)` resolves a marker); `setAreaMusic(area)` crossfade (village / town / harbour / beach / city) |
| P16 | `src/systems/Territory.js` | `areaOf(x, y)` → `village` / `neighbours` / `harbor` / `beach` / `newtown` (overview frames the chief's area) |
| P17 | `src/systems/Rank.js` | levels from data (`BALANCE.v4.rank[3]` with a `fame` bar), ceremony rewards as data, title 시장 / Mayor |
| P18 | `src/systems/RoadPaint.js` | lane markings (`lane_x/_y`), crosswalks, `intersection` for city class (the kit's rules; RoadPaint already paints asphalt and curbs) |
| P19 | `src/data/world.js` | new streets **appended to `WORLD.v4.streets`** (bank_st, ave_s, blvd_h, blvd_b, ave_c, lgx_st; RoadNet reads only that list) with `region`; building layouts as `WORLD.v5`/`v6`/`v7`/`v8` from the modules' `layout.js` (Korean comments, `L4` anchors); `WORLD.southSea` (the `southJ` table of §5.1); territory rects and sizes (§5.2); rail `to: 98` + crossings `[8, 33, 65, 97]`; `borderTrees` `until` fields |
| P20 | `src/data/balance.js`, `balanceCheck.js`, `strings.js` | `BALANCE.later = { story, missions, bank, vehicles, harbor, beach, logistics, incidents }` imported from each module's `tuning.js` (Korean comments stay there); ranges checked; strings ko + en per module |
| P21 | `src/systems/ResidentChat.js` | when `gs.later.story` exists: `new StoryBridge(story.facade, village, { idOf, keyOf })` from the registry; `syncWorld()` on `day`; `syncMemories(key)` on chat open; `facade.on('talk', bridge.decorateTalk)` ahead of StoryLife |
| P22 | `src/voice/cast.js` | job → voice mappings (§6) |
| P23 | `src/systems/Ground.js` / `VillageSea.js` | village sea preset width follows `WORLD.width`; `ports.water.region()` for the new regions |
| P24 | `tools/build/pack_pages.py` | `TF_FRAGS`, page classes (§6), vehicles/ships/harbour/beach/civic/logistics/fx_city pages (ships SE only), sliver fix |
| P25 | `tools/build/build_artifact.mjs` | bundle `story.js` + `story_worker.js` like `chat.js`; audio sprites; file gate ≤ 495 |
| P26 | `tools/story/index.js` | re-export from `src/story/engine/**` after the move |

Every patch keeps v4 behaviour when no later module runs (each guarded by `gs.later` or a data presence check).

---

## 14. Integration order (v5 → v6 → v7 → v8; each phase ends green)

| Phase | Work | Gate |
|---|---|---|
| **v5 P0** groundwork (can ship as v4.2) | P1–P5, P8–P11, P15 audio sprites, P24/P25 file budget, kit, ModuleHost with no modules | all v4 suites green; texbudget ±5 MiB; files ≤ 430; TF parity 1000 × 4 |
| v5 P1 story + bank | worker host, adoption, StoryLife talks, newspaper, chat bridge, bank site at row D, chief account | story main-thread ≤ 0.1 ms; 0 story long tasks; side save ≤ 450 K after a 30-day fast-forward; names unchanged |
| v5 P2 life | weddings, babies, aging, farewell (toggle), memorial garden | life pages only during scenes (≤ 60 s after); peak ≤ target + 40 |
| v5 P3 missions | board, bubbles, pads, story-driven missions, fame/titles | 30-day sim anti-softlock; bots reach title 3 in the player plan's band |
| v5 P4 vehicles + 도시 | era 2 at 읍, rank 3 ceremony, asphalt + markings, era 3 fleet, chief drive | vehicle tests; ≤ 0.15 ms; vehicles ≤ 8 keys resident |
| v5 P5 | bots, balance, soak, shots, artifact | all gates of §8–§11 |
| **v6** P0 world | sizes, regions, south sea (Collision, Water, fields), rail to k 98, line B, borderTrees | layout checker; v4 economy unchanged (line A untouched) |
| v6 P1–P3 | harbour static → ships + set pieces → trade, tourists, missions, harbour residents | berth tests; harbour view ≤ 300 MiB, ≤ 2.1 ms |
| **v7** P0 | beachfolk merge + `dollBeach` pages, tropical + pool water | parity; beach pages ≤ 120 MiB |
| v7 P1–P3 | beach static → beachgoers → resort economy, events, missions | beach view ≤ 300 MiB, ≤ 1700 objects |
| **v8** P0 | cityfolk merge + incident groups, fx_city pages, newtown region | parity; transients ≤ +70 MiB / 90 s |
| v8 P1–P4 | police + logistics (static, cutaway) → logistics model + vans → incidents on (scenes, wanted board, insurance) → moving trucks | incident tests; settings toggle; soak with incidents |

---

## 15. Risks

| Risk | Mitigation |
|---|---|
| Story hitches on phones (p99 6.8 ms, max 17 ms per step on a desktop core) | worker by default; inline fallback steps once per frame with sliced day changes; perf test fails on main-thread long tasks |
| Story and TownSim both move people | E1 external plans + leases; only beats lease bodies; a test asserts one owner per body at all times |
| Side save outgrows localStorage | pack15 (≈ 40 % chars), `compact()` levels, hard cap keeps the last good slice; main save never depends on it |
| Art orientation forces a south coast | §5 layout (checked); harbour/beach never on the north coast; ships use SE/NW in the basin |
| Rect regions vs diagonal districts | horizontal bands; district content created by modules at their gates; no static decor across a band edge |
| File limit (491 of 511 today) | audio sprites + title pages first (P0), page merging, hard gate ≤ 495 |
| Textures at the beach (tf + bf) | page classes, half tier, `beach_nature` split; lab measures before integration |
| > 16 textures in one view (batch flushes) | class gating; ≤ 12 draw-call gate per view in the labs and in-game |
| Water palette seam in the basin mouth | seam hidden behind breakwater/rock; fallback one tropical region |
| Incidents feel harsh | v5–v7 off; v8 staging is cartoonish (dust cloud, nobody hurt), toggle in settings, StageDirector one at a time |
| Second train reduces visitors | line A untouched; line B only adds tourists |
| v4 files keep changing until v4 ships | patches anchored by content; P0 lands first on the final v4 with every suite as the net |
| SwiftShader numbers ≠ phones | logic on the fixed-step clock, GPU by counts/bytes, the `?debug=1` HUD on the designer's phone |
| The designer's eye (charm, materials, motion) | every module has a lab with real art and GIF captures reviewed before integration; no placeholder may ship (lab check) |
