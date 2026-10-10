# story_runtime (v5) — build report

Module: `src/story/**` (runtime, view) · tests and lab: `tools/test/story_lab/**` · captures: `docs/previews/story_lab_*`
· this report. Built standalone while the v4 workflow kept the live tree; **nothing outside these paths was changed**
(no file in `src/` outside `src/story/`, no `assets/**`, no `tools/story/**`, no `index.html`, no `tools/build/**`).
Plan: `docs/v5_v8_plan.md` §6.1 (story_runtime), §5 (kit), §10 (patch table P1–P34), §11.1 (M1).

Status: **52 / 52 Node tests green** (≈ 41 s with `nice -n 15` on 4 cores); the Phaser 3.90 lab plays every beat with
the finished art at phone size (390 × 844, DPR 3) and on desktop; 45 captures (40 stills, 5 GIFs) looked at one by one.

---

## 0. 디자이너용 요약 (쉬운 말)

- **주민들이 진짜로 살아요.** 마을 사람과 이웃 마을 사람(약 140명, 150명 이상도 괜찮아요)이 모두 이야기 속 사람이
  돼요. 가까이 있는 두 사람이 화면에 보이면 말풍선으로 수다를 떨고, 눈꽃말 목소리로 말해요. 화면 밖 이야기는 신문과
  카드로 알려 줘요.
- **게임에서 한 일이 이야기가 돼요.** 건물 짓기, 물건 팔기, 기차 도착, 가게 열기, 읍 승격, 콩이와 놀기, 눈싸움,
  촌장님이 도와준 일 — 주민들이 그 이야기를 해요.
- **인생 이야기:** 읍이 되면 12초 뒤 마을회관 앞에서 **첫 청혼** ("결혼해 줄래요?" → "네!") → 다음 날 **오전 11시
  마을회관 결혼식** (꽃 아치, 빨간 길, 의자, 케이크, 웨딩 음악, 하객 박수, 하트) → 얼마 뒤 **기쁜 소식** → 이틀 반 뒤 저녁 6시
  병원에서 **아기 탄생** → 촌장님이 **이름 짓기** (부모님께 맡겨도 돼요) → 새벽 **유모차 산책** → 4살 **첫걸음** →
  7살 **첫 등교** → 16살 첫 일 → 어른 → 82살 **소원** 하나 (촌장님이 들어줄 수 있어요) → 86살 이후 **따뜻한 이별**:
  전날 오후 3시에 촌장님께 "그동안 고마웠어요" 인사하고 정원 벤치에 앉아요 → 아침 9시 카드 → 10시 **기억의 정원
  배웅식** (꽃, 촛불, 반짝임, 조용한 음악). 무섭거나 슬프게 그리지 않아요. 기억의 정원이 지어지기 전에는 이별이 없어요.
- **끄는 법:** 설정에 **인생 이야기**(연애·결혼·아기·이별)와 **따뜻한 이별** 두 줄이 생겨요. 이별을 끄면 주민들은
  할머니 할아버지(85살)까지만 나이 들고 떠나지 않아요.
- **솔방울 신문:** 첫 결혼식 다음 날부터 아침 7시에 신문 아이콘이 반짝여요. 눌러서 읽어요. 게임은 멈추지 않아요.
- **숫자 바꾸는 곳:** `src/story/tuning.js` (주석이 한국어예요). 결혼식 시각, 아기 확률, 이별 간격, 신문 시각 등.
- **사진:** `docs/previews/story_lab_*` (§8).

---

## 1. What it does

| Area | What the player sees / what runs |
|---|---|
| Engine | The finished `tools/story` engine, copied to `src/story/engine/**` with extensions E1–E9 (all off by default, so the original 30 engine tests pass unchanged against the copy): external plans (the game owns where people are), live add / remove residents, leases, compaction, two-speed aging + freeze, `arrange()` ops (propose, expect, nameBaby, …), wedding timing, farewell gates, last day, memorial hour, birthdays. Seeded sfc32 RNG; 600 s day, 25 s hour. |
| Core off the main thread | `StoryCore` runs in a Web Worker (module worker in dev, a Blob / classic worker in the build); if the worker cannot start, the same protocol runs inline with a catch-up cap of 8 s. Batched messages, one drain per frame. Worker and inline produce the identical event stream (digest test). |
| People | `PersonRegistry` maps game pids (`v:npc_aunt`, `t:12`, `s:3`, story children's bodies) to engine sids, with owners `town` / `gameplay` / `story` (leases): a body the game is using (train visitor shopping, customer) is never cast in a talk or a beat. `adoptRoster` turns the game's roster into households (couples, children with parents ≥ 18 years older, elders), keeps TownSim names, gives surnames, keeps the named villagers (never marry, age, leave). Old saves adopt the same way on their first v5 boot. |
| Events in | A feed of plain objects (§4.1): taps, sales, buildings, shops founded, trains, rank, dog play, snowball fights, missions done, settlers, language, settings. They become engine facts and chief memories, so residents talk about them. |
| Beats out | Talks → speech bubbles via `ports.say` (Bubbles → VillageVoice 눈꽃말), speakers face each other, line anims; caps 2 chats / 3 emotes on screen; rumour ears. Life set pieces on a `StageDirector` (slots ceremony / happening / incident, one at a time, near the view): proposal, wedding, good news, birth, naming, stroller, first steps, school day, outdoor class, wish, last day, farewell, birthday, housewarming, first job; ambient hearts, dates, gatherings. Cards (one at a time, queue 3, older ones go to the hall board), banners (held until the "네!"), the morning paper. Module events (§4.2). |
| Life cycle | §0. Timings in `tuning.js` (§6). `life` setting off → no romance / weddings / babies / farewells, elders freeze at 85; `farewell` off → same freeze, everything else stays. |
| Newspaper | 솔방울 신문 from the engine's `paperText(lang)`: masthead (baked logo ko / en), issue line, headline + photo slot, up to 3 columns, sidebar (weather, prices, bank, a quote); page height follows the stories; non-pausing; edge icon pulses at 07:00. |
| Person card | Tap a resident: name, age, job, home, spouse / sweetheart / best friend / kids, likes, what they remember about the chief, 단골 ★; 수다 떨기 hands over to the chat. |
| Happenings (v5) | P1–P6 cute happenings on the happening slot (spaced ≥ 150 s, ~300 s average); P1 (콩이 bread thief) and P3 (cat on the roof) are staged with bodies, the others are toasts until their props / vehicles exist. |
| Chat memory bridge | `createChatBridge(StoryBridge, host, village)`: the chat's unchanged `src/chat/storyBridge.js` reads the mirror (headline, weather, day, yesterday's diary of the named villagers) through the registry; gossip the chief told travels in story talks (`decorateTalk`). |
| Saves | Main-save slice `story` v1 ≤ 1 KB (milestones, first couple, chosen names, garden stones, wishes); side record `frostVillage.save.v1.story` v1 (packed engine, ≤ 450 K chars, hard 600 K, compaction). §5. |

## 2. Files

```
src/story/
  index.js            MODULE descriptor (id 'story', gate 읍, create, sanitize, prefetch, beatAssets, previews), FRAGMENTS
  host.js             StoryHost: transports, adoption / restore, registry, feed, director, stage, cards, paper, saves, api
  ports.js            the Ports surface the story calls (documented) + nullPorts()
  tuning.js           STORY_TUNING (Korean comments; becomes BALANCE.v5.story) + engineConfig()
  save.js             slice (make / cap / sanitize) + StorySideStore (side record)
  mirror.js           StoryMirror: the read-only facade (newspaper, diary, relationship, clock, weather, cards, on('talk'))
  chatBridge.js       createChatBridge (P21)
  strings.js          UI strings ko + en (move to src/data/strings.js, P20)
  layout.js           STORY_LAYOUT (memorial garden lot, card / chip slots; move to WORLD.v5, P19)
  engine/**           engine copy + E1–E9 (src/ext.js; small hooks in engine.js, life.js, people.js, …)
  model/              protocol, core (StoryCore), worker (entry), registry, adopt, places, chronicle, lifeRules
                      (LifeDirector: pure beats / cards / banners / emits / timers), stage (StageDirector), happenings
  view/               StoryLife (talks, ears, beats, cards, paper, person card, previews), stagehand (leases, walks,
                      props, watchdog), scenes/{Proposal,Wedding,Baby,School,Elder,Farewell,Small}, happenings/,
                      ui/{StoryCard,NewsPanel,NamingSheet,PersonCard,widgets}
tools/test/story_lab/
  engine/*.test.mjs   the 7 original engine test files, import path pointed at src/story/engine (30 tests)
  engine_ext.test.mjs E1–E9 (10 tests) · host.test.mjs (12 tests) · fakePorts.mjs · standin.mjs (stand-in town:
                      100 TownSim-like citizens + 20 named villagers + relations) · node_worker.mjs / nodeTransport.mjs
                      (worker_threads parity)
  lab.html, lab/      Phaser 3.90 lab: art.js (manifests → textures, nine-slices, chars, sheets), world.js (stand-in
                      town square with the real buildings / decor), bodies.js (LabTown: paper dolls with townfolk2,
                      villagers, pets, slots, leases — the reference ports.town), bubbles.js, tint.js (DayClock look),
                      lab.js (boot, ports, HUD, __LAB API), shots.js (scripted captures)
  lab.mjs             capture runner (Playwright + ffmpeg), smoke_lab.mjs (boot check)
```

Sizes: runtime + view 3,640 lines (dense), engine copy 45 files / 10.5 K lines, tests + lab 2,874 lines.

**Path note.** Plan §11.1 (M1) lists `tools/test/later/story*`, `docs/previews/later_story/**` and
`docs/build_reports/later_story.md`; the task gave `tools/test/story_lab/**`, `docs/previews/story_lab_*` and this file,
and the task paths were used. The lead may move them; nothing references them from outside.

**Kit note.** `src/kit` (ModuleHost, Ports, GameFeed — lead-owned) does not exist yet. The module ships its own
`ports.js` (surface + `nullPorts`) and `model/stage.js` (StageDirector) so it runs without the kit; §11 says what the
kit must provide.

## 3. Public API

### 3.1 `src/story/index.js`

| Entry | Meaning |
|---|---|
| `MODULE.id / version / saveKey / capBytes` | `'story'`, 1, `'story'`, 1024 |
| `MODULE.gate(gs)` | `gs.v4.rank.level >= 2` (읍) |
| `MODULE.create(ports, saved, opts)` | → `StoryHost` (starts async; `opts.view(host)` → a `StoryLife`; `opts.balance.story` overrides tuning; `opts.transport` `'inline'`; `opts.workerUrl` + `opts.classicWorker` or `opts.workerSrc` for the build) |
| `MODULE.sanitize(raw)` | slice sanitizer (fuzzed: 300 random slices never throw, stay < 1 KB) |
| `MODULE.prefetch(gs, assets)` | `assets.fragment(name, { only, audio })` for `FRAGMENTS.gate` |
| `MODULE.beatAssets(kind)` | the late files a set piece needs (`FRAGMENTS[kind]`: life2 pages, townfolk2 pages, bgm) |
| `MODULE.previews.{proposal,wedding,baby,school,wish,farewell}(host)` | designer preview menu: plays a beat with whoever is near, never saves |

### 3.2 `StoryHost` (game side)

`start()` → `{ mode, restored, people }` · `update(dt)` once per frame (drains replies, sends a tick every 0.25 s,
director timers, pending beats, happenings, cards, the first proposal; calls `view.update(dt)`) · `onFeed(ev)` (§4.1) ·
`serialize()` → slice · `saveSide(force)` → Promise (packs in the worker, writes the side record; unforced: at most
once per game day) · `attachView(view)` · `on(name, fn)` (`ready`, `error`, `beatEnd`, `ui:card`, `ui:banner`, `ui:toast`,
every `story:*`) · `perf()` · `state()` · `destroy()` · `facade` (StoryMirror).

`host.api` (= `gs.later.story`): `facade`, `talkTo(pid, lang)` → Promise of a talk with the chief, `card(pid)` (person
card fields + `known`, `regular`), `passbook(pid)` → Promise `{ wallet, savings, loans }`, `pidOf(body)`, `bodyOf(pid)`,
`known(pid)`, `sidOf(pid)`, `report(kind, data)` (a fact into the engine: `chief`, `train`, `pet`, `fact`), `arrange(op,
data)`, `toggles({ lifeEvents, farewell, … })`, `stage(kind, { venue, watch })` / `endStage(kind)` (other modules ask for
the shared stage), `nameBaby(sid, { ko, en })`, `board()` (older cards for the hall's 마을 소식), `paper(lang)`, `mode()`,
`perf()`.

### 3.3 `StoryLife` (view)

`new StoryLife(ctx)`, `ctx = { scene (world), ui (screen scene), art, ports, lang, screen: () => ({ w, h }), chief?,
dog?, onError, happen: () => ({ spots, pets, kids, keeper }) }`. Draws in the 720-wide logical UI space (`View.k`
scaling like the game). Public: `talk`, `play(beat, decision, onEnd)`, `card(c, lang)`, `paper(a)`, `openNews()`,
`openPerson(pid, at)`, `happening(h, done)`, `preview(kind)`, `update(dt)`, `destroy()`. Watchdogs: every set piece
has a max length (`SCENE_MAX`, wedding 180 s, farewell 150 s …) and is cancelled cleanly (bodies released, props
removed) if a walk never ends; one stagehand per body (`ctx.holders`).

`ctx.art` surface (the lab's `LabArt` is the reference): `image(scene, x, y, key)` (sprite when the key has anims),
`nine(scene, x, y, key, w, h)`, `def(key)` (sprites + characters), `layout(name)` (manifest `layouts`), `play(img, key,
anim)` (`spr:<key>:<anim>`), `sheet(scene, x, y, key, { scale, loop })`.

### 3.4 Ports (`src/story/ports.js`)

Every member optional. `seed() cid() lang() T()` · `storage` + `sideKey` · `settings.get(k)` · `world.{buildings,
spots, spot(id, kind), has(key), names(key)}` · `people.{roster, relations, chronicle, prices}` · `town.{whereabouts,
visible, bodyOf, pidOfBody, hold, release, walk, face, anim, dress, place, addCitizen, leave, attach, reserve}` + view
extras `hide, nearby, spawn, despawn` · `say(pid, text, emote, dur, opts)` · `emote(pid, key, dur)` · `ui.{card, banner,
toast, openPanel, chip}` · `sound.{play, at, music, duck}` · `view.{rect, onScreen, focus, zoomPulse}` · `open()` ·
`happenSpots()` · `events.emit(name, payload)`. The game mapping is §11.2.

## 4. Events

### 4.1 In: `host.onFeed({ t, … })`

| `t` | Fields | Effect |
|---|---|---|
| `tap` | `pid` | the person knows the chief better (`known` after 3), card refreshed |
| `sold`, `visitorDone` | `pid?`, `n?` | `served` count (단골 after 3); 20 sales a day → the chief's market day becomes talk |
| `built` | `key`, `siteId`, `x`, `y` | chief fact "built X"; memorial garden / town hall / school / clinic / bank become story places (garden unlocks farewells) |
| `shopOpen` | `shop` / `id`, `kind`, `name`, `x`, `y`, `founder` | a story shop (locked, owner = the founder's sid) + chief fact |
| `train` | `ev: 'arrive'`, `passengers` | once per game hour: train news (who came, what they said) |
| `rank` | `level` | chief fact; level 2 arms the scripted first proposal 12 s later |
| `dogLove` | `antic?`, `place?` | 콩이 anecdote facts |
| `snowball` | `a`, `b` (pids) | a prank fact between the two (gossip) |
| `mission:done` | `target {ko,en}`, `wish?`, `who?` (sid) | chief helped someone; a granted elder wish closes it |
| `fame:title` | `title {ko,en}` | chief fact |
| `settlers` | `pids`, `rows` (roster rows) | adopted as a new household → `story:move { op: 'in' }` |
| `lang` | `lang` | engine + mirror language |
| `settings` | — | re-reads `lifeEvents` / `lifeFarewell`; life back on at 읍 re-arms the first proposal |

### 4.2 Out: `ports.events.emit(name, payload)` (also `host.on`)

Every payload with `a` / `b` / `who` / `baby` sids also carries `aPid` / `bPid` / `whoPid` / `babyPid`; `members` →
`membersPid`.

| Name | Payload |
|---|---|
| `story:life` | `op`: `sweetheart`, `propose`, `engaged` (`day`, `hour`), `wedding`, `goodnews`, `baby`, `named` (`ko`, `en`), `birthday` (`age`), `child`, `grownup`, `within` (a couple's new home), `lastday` (`day`), `farewell` |
| `story:news` | `{ day, first }` (paper out at 07:00) · `story:read` `{ day }` (the chief opened it) |
| `story:day` | `{ day, weather }` |
| `story:wish` `{ who, wish, place, ko, en }` · `story:wisher` `{ who }` (turned 82) |
| `story:move` | `{ op: 'in' \| 'out' \| 'within', who, members }` |
| `story:happening` | `{ id, key, where, watched }` |
| `story:bank`, `story:shop`, `story:build`, `story:incident` | engine economy / incident events as they are (incidents are off in v5) |

## 5. Save slice and side record

- **Main save:** `story` slice v1, JSON ≤ 1024 chars, capped by dropping the oldest chosen names, then old garden
  names: `{ v, day, ok, chars, t0, life: { seen, firstCouple, names, garden, gardenOld, wishes, wishActive, paperFrom },
  happen: { last } }`. Travels with the 5 s autosave. `sanitizeSlice` accepts its own output and rejects junk.
- **Side record:** `SAVE_KEY + '.story'` = `frostVillage.save.v1.story`, `{ v: 1, cid, T, day, reg, eng }` with the
  packed engine (pack15 varints) and the registry. Written by `saveSide()`: unforced at most once per game day (call it
  from the autosave: it writes at the first autosave of a new day), forced on `pagehide` / `visibilitychange: hidden`.
  Cap 450 K chars (compaction trims old memories / facts / weak ties), hard 600 K (refused → toast 이야기 저장 공간이 꽉
  찼어요, the last good record stays). `cid` ties it to the main save.
- **Lost or corrupt side record:** the town is adopted again; the slice keeps the milestones (no second first wedding,
  names kept); one card "주민들이 오늘 일을 조금 잊어버렸어요".
- **Restore:** weddings booked before a reload get their timed beats back; an old save already at 읍 plays the first
  proposal 5 s after load.

## 6. Tuning (`src/story/tuning.js` → `BALANCE.v5.story`, P20)

`worker: true`, `tickEvery 0.25`, `maxResidents 400`, `inlineCatch 8`; life: `yearDaysKid 1.5`, `yearDaysAdult 4`,
`weddingInDays 2`, `weddingHour 11`, `weddingGapDays 6`, `firstWeddingInDays 1`, `babyAfterWedding [3, 5]`,
`firstBabyAfterMin 23`, `birthAfterNews 2.5`, `birthHour 18`, `babyRate 0.012`, `schoolAge 7`, `walkAge 4`,
`firstJobAge 16`, `wishAge 82`, `wishes 3`, `farewellMinAge 86`, `farewellFirstAfterMin 180`, `farewellGapDays 15`,
`farewellBirthGapDays 5`, `freezeAgeWhenOff 85`, `memorialHour 10`, `lastDayHour 15`, `stones 6`, `cardsQueue 3`,
`knownServed 3`, `firstProposalAfterSec 12`; talk `maxDist 220`, `chatCap 2`, `emoteCap 3`; paper `hour 7`; happenings
`gapMin 150`, `every 300`; save `capChars 450000`, `hardChars 600000`; rates: fire / incidents 0, moveIn 0 (the game
decides), moveOut 0.0015, talk 0.045. The lab takes `?tune=key:value,…` for staging.

## 7. Numbers

### 7.1 Node (fixed seeds, `nice -n 15`, 4-core container)

| Measure | Result |
|---|---|
| Tests | 52 / 52 pass, 38–41 s for the whole set |
| Engine, 250 residents, visible text | 0.33–0.38 ms CPU per game second (budget 2 ms) |
| Host + core, 30 game days, 137 → 174 residents (rank 2, scale 1.25) | core 0.027–0.033 ms per 0.25 s tick (max 18–26 ms at the day change, in the worker), 0.11–0.13 ms per game second |
| Main thread per frame, 3 game days | worker mode 0.047–0.055 ms avg (max 0.9–4.1 ms), 0 long tasks; inline 0.067–0.074 ms avg (max 13.7–17 ms) |
| Worker ↔ inline parity | 636 events, identical digest |
| Side record after 30 days | 117,320 chars packed, 18–21 ms to pack (in the worker); no compaction needed |
| Compaction (E5, 120 days) | 139,479 → 113,599 → 83,757 chars |
| Heap (inline, everything in one heap) | +6.5 MiB after boot (137 people), +17.5 MiB after 30 game days (174 people) |
| Slice | ≤ 1 KB always (300 fuzzed slices) |

### 7.2 Phaser lab (Chromium SwiftShader, phone 390 × 844 DPR 3, 137 people, 90 doll rigs, 25 s real time at 15:00)

| Measure | Worker | Inline |
|---|---|---|
| Boot (adopt + core ready) | 197 ms | 64 ms |
| Host on the main thread per frame | avg 0.23 ms, p50 0.10, p95 0.90, max 5.8 | avg 1.05 ms, p50 0.20, p95 3.9, max 19.2 |
| Core per tick | 1.40 ms avg (worker thread) | 2.07 ms avg (main thread) |
| WebGL draw calls per frame | 4.6 avg, 8 max | 5.0 avg, 8 max |
| Display objects | 1,448 | 1,461 |

Texture memory (RGBA, everything the lab loads): 275.7 MiB — townfolk 104.7, townfolk2 72.6, town 39.4, villagers
29.0, characters 6.3, props 4.6, life2 4.5, pets2 3.1, emotes 2.5, fx_city 2.4, ui 2.0, fx 2.0, ground 1.4, ui3 1.2. The
story's own additions over v4 are **townfolk2 (72.6 MiB if all 9 pages are resident), life2 4.5, fx_city 2.4**:
townfolk2 must be paged per beat (§11, S3–S4). SwiftShader renders at 1170 × 2532 px in software, so the lab's 4.8 fps
says nothing about phones; draw calls and per-frame ms are the meaningful numbers.

## 8. Lab shots

Run (one browser, each group < 2 min): `nice -n 15 node tools/test/story_lab/lab.mjs <group> [--desktop] [--inline]`
with groups `town talks proposal wedding baby ui previews stroller school wish farewell farewell_off perf`; frames are
stepped deterministically (`__LAB.advance`), GIFs assembled with ffmpeg. Boot check: `smoke_lab.mjs`. Page:
`tools/test/story_lab/lab.html` (`?lang=en`, `?inline=1`, `?tint=0`, `?hud=0`, `?rank=2`, `?tune=…`, `?farewell=0`).

| File (`docs/previews/`) | Shows |
|---|---|
| `story_lab_town_z06.jpg`, `_z09.jpg` | the stand-in square at zoom 0.6 / 0.9: hall, fountain, school, café, townsfolk + villagers |
| `story_lab_talks_ko.jpg`, `_en.jpg`, `story_lab_talks.gif` | everyday talks, facing pairs, caps, both languages |
| `story_lab_proposal_ask.jpg`, `_yes.jpg`, `_banner.jpg`, `story_lab_proposal.gif` | first proposal in the 읍 crowd; banner only after "네!" |
| `story_lab_wedding_guests / aisle / vows / hearts / cake / dance.jpg` (+ `_desktop`), `story_lab_wedding.gif` | wedding at the hall with the life2 layout, townfolk2 outfits, bgm_wedding |
| `story_lab_goodnews.jpg`, `story_lab_naming_card.jpg`, `story_lab_naming_sheet.jpg`, `story_lab_birth_stroller.jpg` | good news, the naming card and sheet, birth + stroller |
| `story_lab_stroller.jpg`, `story_lab_stroller.gif` | a parent pushing the stroller (close-up) |
| `story_lab_school_wave.jpg`, `_lookback.jpg`, `story_lab_outdoor_class.jpg` | first school day, outdoor class |
| `story_lab_news_chip.jpg`, `story_lab_news_ko.jpg`, `_en.jpg` | the morning paper icon and the 솔방울 신문 page |
| `story_lab_person_card.jpg` | person card |
| `story_lab_wish_walk.jpg`, `_bench.jpg` | an elder's wish |
| `story_lab_lastday_thanks.jpg`, `_bench.jpg`, `story_lab_farewell_card.jpg`, `_gather.jpg`, `_flowers.jpg`, `_after.jpg`, `story_lab_farewell.gif` | last day (thanks the chief side by side, garden bench), the 09:00 card, the 10:00 memorial-garden gathering (flowers, candles, soft glow, bgm_farewell), the garden after |
| `story_lab_farewell_off.jpg` | life switch off: the elder is 85, no farewell |

Iterations made after looking at captures (all re-shot): banners deferred until the "네!"; everyday chatter suppressed
during set pieces; crowds placed in rings / fans / benches instead of clumps; ambient walkers kept out of the stage
(`reserve`); the proposal crowd a half ring behind the couple; the wedding framed between hall and cake; the farewell
glow softened from a white fog to a pink-gold haze with small rising flakes; the last day moved from 00:00 to 15:00 so
somebody sees it, with the elder beside (not behind) the chief; Korean particles (`보검이가`, not `보검가`); the news chip
no longer grows each day; the paper's height follows its stories; the naming sheet opaque and on top of the card;
bubbles kept 130 px inside the screen edges.

## 9. Decisions and deviations

- **Engine copy, not import.** `src/story/engine/**` is a copy of `tools/story/**` plus E1–E9 behind config flags whose
  defaults keep the old behaviour; the 30 original tests run against the copy (only their import path differs). P26
  (re-export `tools/story/index.js` from the copy) is safe to apply later; `tools/story` was not touched.
- **External plans.** In the game, TownSim / VillageLife decide where people are; the engine only receives
  `[sid, place, act]` deltas (`whereabouts`) and never walks people itself. Talks happen only between people the game put
  together; words are generated only for people on screen (≤ 64, 2 Hz).
- **Determinism.** Same seed + same message stream → same story (worker or inline). In the live lab the worker's
  replies arrive a frame later than inline, so the day of e.g. the first farewell can differ between the two modes; each
  mode is deterministic for its own stream.
- **Stage.** One ceremony at a time near the camera; a busy slot defers a beat (up to 40 retries) instead of dropping
  it; birthdays are the only beats allowed to be skipped. Weddings / farewells pause farewell scheduling
  (`farewellHold`).
- **Farewell gates.** Not before the memorial garden exists, not before v5 + 180 min, ≥ 15 days apart, not within 5
  days of a birth, never a named villager, none when switched off. The last day happens the day before at 15:00.
- **New this pass.** `story:move { op: 'in' }` when settlers are adopted and `{ op: 'out' }` before a family leaves
  (missions_bank asked for both), `watched` / `where` on `story:happening`, the `lifeEvents` setting (인생 이야기) next to
  `lifeFarewell`, `FRAGMENTS` / `beatAssets` in the module descriptor, setting labels in `strings.js`.

## 10. Known issues and limits

1. **townfolk2 is 72.6 MiB** when all 9 pages are resident (the lab loads them all). In the game it must be acquired
   per beat (`MODULE.beatAssets`) and released ~60 s after (Residency class, P4), or packed into loco / social pages by
   `pack_pages.py` (P24). Untested in the game: the view assumes the pages for wedding / farewell outfits are resident
   while the beat plays; without them `dress()` falls back to the everyday look.
2. **No kneel animation** in townfolk2; the proposal uses `happy` + hearts + a bow.
3. **Happenings P2, P4, P5, P6** are toasts until their props / vehicles (sleigh bus, steam wagon, penguin) exist.
4. **Named villagers without a persona name** (title-only rows) introduce themselves with the title; harmless, but the
   chat personas should give every villager a `name`.
5. **Side save on pagehide in worker mode** is asynchronous (pack in the worker, then write); if the page is killed
   before the reply arrives that save is lost. The once-a-day save and the slice cover it (the town re-adopts gently).
   Inline mode writes synchronously.
6. **Desktop** shows the same portrait canvas as the game (pillarboxed), so desktop shots are the phone layout at DPR 1.
7. **SwiftShader** frame rates are not meaningful; real-device numbers need the integrated game.
8. **Lab stand-ins**: positions, the square and the bodies (`LabTown`) are the lab's own; in the game TownSim and
   VillageLife provide them through the patches below (not run in the game yet).

## 11. Integration

Line numbers are from the tree at `65c39f3` (2026-10-10 00:13 UTC, "v4.1 published"); at the time of writing the working
tree had no uncommitted v4 changes in `src/` outside `src/story` and `src/missions`. The v4 workflow still owns `src/**`,
`index.html`, `tools/build/**` and the existing tests and may change them: **anchor on function names**. No patch
below has been applied; none is needed for v4 to keep working (without the module the slice and the side record are
simply absent).

### 11.1 Order

1. Kit (lead): ModuleHost (construct at the gate, update, serialize, pass slices through when not constructed),
   Ports (table 11.2), GameFeed (table 11.3), the art adapter (§3.3).
2. S2 (Save), S12 (balance / strings), S3 (Assets), S4 (Residency), S5 (Townfolk2).
3. S6 (TownSim), S7 (VillageLife / Resident).
4. S1 (Game: construct, update, serialize, save, view).
5. Feed emits S8, UI S9, chat S10, person card S11, build S13, tools/story S14.
6. Check (11.6).

### 11.2 Ports → game

| Port | Game |
|---|---|
| `seed()`, `cid()`, `T()`, `lang()` | `gs.v4.seed` (TownSim seed), `gs.cid`, `gs.v4.clock.T` (DayClock), `getLang()` (`src/data/strings.js`) |
| `storage`, `sideKey` | `localStorage` (through Save.js `getStore`), `SAVE_KEY + '.story'` |
| `settings.get(k)` | `Settings.data[k]` (`lifeEvents`, `lifeFarewell`, `missionToasts`) |
| `world.buildings()` | `gs.v4.buildings` (town: `{ id, key, role, x, y }`) + our village's civic buildings (`gs.civic.hall` as `{ id: 'v_hall', key: 'town_hall', ours: true }`, school / clinic / memorial garden sites when built), shops from Growth (`locked`, `name`) |
| `world.spot(id, kind)` | `doorPoint` / `gatherPoints[0]` of `Assets.def(key)` offset by the building's x, y; `dir` from `doorDir` |
| `world.has(key)`, `world.names(key)` | any building with that key exists; `Assets.def(key).name` or `t(key)` |
| `people.roster()` | TownSim citizens → `{ pid: 't:' + c.id, kind: 'citizen', townKind: c.kind, role: c.role, name: c.name, nameEn, age: c.age, home: c.home, work: c.work, sex: lookSex(c.person) }`; VillageLife residents → `{ pid: 'v:' + r.key, kind: 'villager', key: r.key, persona: PERSONAS[r.key], home }`; settlers → `{ pid: 's:' + n, kind: 'settler', home, age, sex, name }` (format in `model/adopt.js`) |
| `people.relations()`, `chronicle()`, `prices()` | chat `RELATIONS`; `{ flags: gs.progress.flags, rank: gs.v4.rank.level, built, shops }`; `BALANCE` item prices |
| `town.*` | S6 (TownSim, `t:` pids) and S7 (VillageLife, `v:` pids) dispatched on the pid prefix; `bodyOf` returns the Character (TownBody / Resident) |
| `say`, `emote` | `gs.life.bubbles.chat(body, text, emote, dur, opts)` (already voiced by VillageVoice), `gs.life.bubbles.emote(body, key, dur)` |
| `ui.toast`, `ui.banner` | `gs.ui.toast(text, hold)`, `gs.ui.banner(title, sub)` (the view draws its own card / news icon in the UI scene) |
| `sound.play/at/music/duck` | `Audio.play`, `gs.sfxAt`, `Audio.playMusic(key)` / back to the area music on `null` (`Audio.stopMusic` + P15), `gs.voice.duck` |
| `view.rect/onScreen/focus/zoomPulse` | `gs.viewRect()`, `gs.isOnScreen(x, y, m)`, a temporary `gs.camFocus = { x, y, until }`, a short tween of `gs.zoomTarget` |
| `open()`, `happenSpots()` | `{ bus, wagon, harbor, beach, sugar }` from vehicles / regions; market / plaza / house / chief points near the camera (or `null`) |
| `events.emit` | GameFeed bus (`gs.events.emit(name, payload)`) |

### 11.3 GameFeed (v4 emits → story feed objects)

| v4 emit today | Feed object | Patch |
|---|---|---|
| `'v4:rank' (2)` (`Rank.js` ~222), `'v4:rankUp' (2)` (~121) | `{ t: 'rank', level }` | — |
| `'v4:train' (ev, stop)` (`Neighbours.onRail` ~358) | `{ t: 'train', ev, stop, passengers }` (`ev === 'arrive'`) | passengers optional (E4 of missions_bank adds `v4:trainRiders`) |
| `'built' (building, site)` (`Site.js` ~375) | `{ t: 'built', key: building.key \|\| building, siteId: site.id, x: site.x, y: site.y }` | — |
| `'v4:shopOpen' (shop)` (`Shop.js` ~278) | `{ t: 'shopOpen', shop: shop.id, kind: shop.kind, name: shop.name, x, y, founder: 't:' + founderId }` | founder id if Growth knows it |
| `'sold' (value)` (`Seller.complete` ~355) | `{ t: 'sold', n: 1, pid }` | P8 adds item / count; pid `'t:' + c.citizen.id` when the customer is a citizen |
| `'v4:visitorDone' (citizen, frac)` (`Visitor.js` ~253) | `{ t: 'visitorDone', pid: 't:' + citizen.id }` | — |
| `'dogLove' (love)` (`DogPlay.js` ~188) | `{ t: 'dogLove' }` | — |
| — | `{ t: 'snowball', a: 'v:' + th.key, b: 'v:' + tg.key }` | **S8a** below |
| `'settlers' (n)` (`Civic.settlersArrive` ~226) | `{ t: 'settlers', pids, rows }` (the kit makes `n` settler rows) | P27 adds the house id |
| — | `{ t: 'tap', pid }` | P11 |
| missions_bank `mission:done`, `fame:title` | as is | — |
| Settings language / rows changed | `{ t: 'lang', lang }`, `{ t: 'settings' }` | S9 |

### 11.4 Patches by file

**S1 `src/scenes/Game.js` (P1).** With the kit: `LATER_MODULES = [STORY, ...]` and ModuleHost does the rest. Without it
(direct wiring, same effect):
```js
// imports
import { MODULE as STORY } from '../story/index.js';
import { StoryLife } from '../story/view/StoryLife.js';
// create(), after `this.residentChat = new ResidentChat(this);` (line ~247)
this.later = this.later || {};
this.story = null;
// tick(), after `if (this.v4) this.v4.update(dt);` (line ~1626)
if (!this.story && this.v4 && STORY.gate(this)) this.startStory();
if (this.story) this.story.update(dt);
// new method
startStory() {
  const ports = makeStoryPorts(this);             // kit, table 11.2
  const art = makeStoryArt(this);                 // kit, §3.3 over Assets (image, nine, def, layout, play, sheet)
  this.story = STORY.create(ports, this.saved && this.saved.story, {
    balance: BALANCE.v5, workerUrl: window.__FV_BUILD ? 'story_worker.js' : undefined, classicWorker: !!window.__FV_BUILD,
    view: () => new StoryLife({ scene: this, ui: this.ui, art, ports, lang: getLang(),
      screen: () => ({ w: View.W, h: View.H }), onError: (e) => console.warn('[story]', e),
      happen: () => storyHappen(this) }),        // kit: { spots: { market, plaza, house, chief }, pets: { dog, cat }, kids, keeper }
  });
  this.later.story = this.story.api;
  STORY.prefetch(this, { fragment: (name, o) => Assets.loadFragment(this, name, o) });
  this.events.once('shutdown', () => { if (this.story) { this.story.destroy(); this.story = null; } });
}
// serialize(), after the `c1:` line (~1908)
story: this.story ? this.story.serialize() : (this.saved && this.saved.story) || undefined,
// save(force), after `Save.write(...)` (~1915): unforced = at most once per game day
if (this.story) this.story.saveSide(!!force);
```
`onVis` / `onHide` (~295) already call `this.save(true)`. When a beat is booked the kit calls
`Assets.loadFragment(gs, name, o)` for each entry of `STORY.beatAssets(kind)` (listen to `host.on('story:life')` ops
`engaged`, `goodnews`, `lastday`: those come hours or a day before their scene, which leaves time for the pages to
arrive; a scene that starts without them plays in the everyday look).

**S2 `src/core/Save.js` (P2).** In `sanitizeSave` (before `return s;`, line ~211):
`const st = sanitizeSlice(raw.story); if (st) s.story = st;` (import from `../story/save.js`; it is pure). `Save.clear()`
(line ~345): also `removeKey(SAVE_KEY + '.story')`. `Settings.data` (line ~389) gains `lifeEvents: true,
lifeFarewell: true`, validated like `daynight` in `load()`: `this.data.lifeEvents = s.lifeEvents !== false;
this.data.lifeFarewell = s.lifeFarewell !== false;`.

**S3 `src/core/Assets.js` (P3).** `LATE_FRAGMENTS` (line 39) += `'fx_city', 'audio6', 'townfolk2'` (life2 and audio3
are already late). In `mergeLate` (line ~316) keep layouts like `mergeManifests` does (line ~141) — the wedding /
farewell layouts live in the late life2 manifest and are dropped today:
`if (j.layouts && typeof j.layouts === 'object') for (const k in j.layouts) if (!this.layouts[k]) this.layouts[k] = j.layouts[k];`.
townfolk2: merge its manifest into the townfolk one before `TF.init` with `mergeTownfolkManifests(tf1, tf2)` from
`tools/townfolk2_compose.js` (copy into `src/core/Townfolk.js`, S5); its `tfatlas` pages install through `tfInstall`
unchanged.

**S4 `src/core/Residency.js` (P4).** A class for the story's pages: `addClass('dollLife', { ttl: 60, maxMiB: 80 })`
for `tf2_*` and `life2_wedding` / `life2_memorial`; acquire on `beatAssets`, release on `host.on('beatEnd')`.

**S5 `src/core/Townfolk.js` (P5).** `TOWNFOLK2 = true` (line 246) and port from `tools/townfolk2_compose.js` (the
lab's `TownfolkSprite2` is the reference): the extra anims `clap`, `sit`, `sad`, `push`, `setFace(person, face)`, the
wedding / mourning parts, `AGE_SHEETS` covering `tf2_`; `DollSprite` draws the extra layers through `layersInto`. Add
`TF.dress(person, preset, { add, remove })` = `LabTown.dressLook` (`tools/test/story_lab/lab/bodies.js`): a preset
keeps the person's base, face and hair and swaps the clothes. Presets the scenes use: `bride`, `groom`,
`wedding_guest`, `mourner`, `mourner_family`; parts added / removed: `held_bouquet`, `acc_backpack`.

**S6 `src/systems/TownSim.js` (P6).** Leases for `t:` pids (constructor: `this.held = new Set(); this.reserved = new
Map();`):
```js
/** owner 'story' | 'gameplay': the citizen leaves its schedule where it stands */
hold(c, owner = 'story') {
  if (!c || (c.flags & (F.ON_TRAIN | F.IN_VILLAGE | F.WAITING)) || c.gone) return false;
  if (c.held && c.held !== owner) return false;
  if (!c.held) {
    const p = this.pos(c); c.x = p.x; c.y = p.y;
    if (c.placeObj) { c.placeObj.occ = Math.max(0, c.placeObj.occ - 1); c.placeObj = null; }
    c.route = null; c.state = 'out'; c.wakeT = -1;          // its heap entry goes stale (wake() checks wakeT)
    this.held.add(c);
  }
  c.held = owner;
  return true;
}
release(c) {
  if (!c || !c.held) return;
  const w = c.hw; c.held = null; c.hw = null; c.anim = null; this.held.delete(c);
  if (w && w.cb) w.cb();
  this.settle(c, this.T, { x: c.x, y: c.y, bld: null });     // walks back into its day
}
/** a held citizen walks to x, y over the walk graph; cb() always fires (arrival, a new walk, release) */
walk(c, x, y, opts = {}, cb = null) {
  if (!c || !c.held) { if (cb) cb(); return; }
  if (c.hw && c.hw.cb) { const f = c.hw.cb; c.hw = null; f(); }
  c.hw = { r: this.route(c.x, c.y, null, x, y, null), t0: this.T, spd: c.speed * (opts.speed || 1) * (c.kind === 'elder' ? 0.8 : 1), cb };
}
place(c, x, y, dir) { if (!c || !c.held) return; c.hw = null; c.x = x; c.y = y; if (c.body) { c.body.x = x; c.body.y = y; if (dir) c.body.dir = DIR_INDEX[dir]; } }
anim(c, name) { c.anim = name; if (c.body) c.body.play(name, true); }
face(c, dir) { if (c.body) { const d = typeof dir === 'string' ? DIR_INDEX[dir] : null; if (d !== undefined && d !== null) c.body.dir = d; c.body.play(c.body.animName || 'idle', true, true); } }
dress(c, preset, opts = {}) { c.look0 = c.look0 || c.person; c.person = preset || opts.add || opts.remove ? TF.dress(c.look0, preset, opts) : c.look0; if (c.body) c.body.sprite.setPerson(c.person, 'tf:' + c.person.base); }
reserve(id, rect) { if (rect) this.reserved.set(id, rect); else this.reserved.delete(id); }
retire(c) { this.leave(c); c.gone = true; }                    // moved away for good (story:move out)
```
and in the existing code:
- `pos(c, out)`: after `out = out || …`: `if (c.hw) return this.along(c.hw.r, (this.T - c.hw.t0) * c.hw.spd, out);`
- `update(dt, T)`: after the heap loop:
  `for (const c of this.held) if (c.hw && (T - c.hw.t0) * c.hw.spd >= c.hw.r.len) { const r = c.hw.r, k = r.n - 1, f = c.hw.cb; c.x = r.pts[k * 2]; c.y = r.pts[k * 2 + 1]; c.hw = null; if (f) f(); }`
- `wake(c, T)`: first line `if (c.held) return;`
- `retier()`: first thing in the citizen loop: `if (c.held) { c.lod = 0; c._d = -1; want.push(c); continue; }` (held
  bodies always stay materialised and sort first under the cap).
- `drive(b, dt)`: first lines `if (b.c.held) { const c = b.c, p = this.pos(c); b.x = p.x; b.y = p.y; if (c.hw) { b.face(p.dx, p.dy); b.play('walk'); } else if (b.animName === 'walk') b.play(c.anim || 'idle'); b.sync(dt); return; }`
- `chatter(dt)`: skip held bodies (`b.c && !b.c.held && …`) and return early while a story set piece runs
  (`if (this.nb.storyBusy && this.nb.storyBusy()) return;`, the kit sets `nb.storyBusy = () => !!(host.view && host.view.active.size)`).
- `go(c, sg, T, from)`: after `takeSpot`, if the spot lies in a `this.reserved` rect, move it 40 px past the nearest
  edge (everyday walkers stay out of the wedding).
- `addCitizen` (line ~209): accept `'toddler'` (story children 4–6: plan = home, the playground, home; same segment
  shape `{ s, e, place, act, mode }`); at 7 the kit switches the citizen to `'student'` (`story:life` op `child` / the
  birthday events give the age). Story children are added by `ports.town.addCitizen({ kind: 'child', age, parents,
  home: { like: parentPid } })` → `addCitizen(age < 7 ? 'toddler' : 'student', homeOfParent)` → returns `'t:' + c.id`.
- `whereabouts(out)` for the story: one row per citizen `['t:' + c.id, c.placeObj ? c.placeObj.bld : null, c.act,
  c.state, c.held === 'gameplay' || (c.flags & F.IN_VILLAGE) ? 'gameplay' : null]`; `visible(out, max)`: held or
  materialised bodies on screen.
- Stroller (`attach(pid, 'stroller')`): a `Character(gs, 'baby_stroller' | 'baby_stroller_pink', …)` (life2
  character) placed each frame in front of the parent from the manifest's `handlePoint`, `pushOffset` and
  `depthVsPusher` (as `LabTown.attachStroller`), destroyed on release; the parent plays `push`.

**S7 `src/systems/VillageLife.js` + `src/entities/Resident.js`.** Named villagers (`v:` pids) can be wedding guests and
are the farewell / wish crowd at our hall and garden:
- `hold(r, owner)`: `if (r.isPet || (r.held && r.held !== owner)) return false; if (r.event) r.event.drop(r); r.job = null; r.unsit(); r.stand(); r.held = owner; return true;` · `release(r)`: `r.held = null;` (the next `think()` gives a job).
- `update()` loop (line ~447): `if (r.job && !r.held) this.jobUpdate(r, dt);` · `think()` (line ~464): `if (!r.job && !r.event && !r.held) this.assignJob(r);` · `candidates()` (line ~823): `if (r.held) continue;`
- story walk: `r.goTo(x, y, { speed })` and fire the callback when `r.arrived`; anim: `r.act(name, -1)`; face: `r.faceTo`; place: `r.x = x; r.y = y; r.stand();`.
- **S8a snowball** (`SnowballEvent` constructor, line ~1195, after `super(...)`): `if (!isReturn) life.gs.events.emit('snowball', 'v:' + thrower.key, 'v:' + target.key);`
- **P11 tap** (`react(r)`, line ~779, first line): `this.gs.events.emit('tap', 'v:' + r.key, r.x, r.y);`; `Neighbours.tap` (line ~698, before the name card): `gs.events.emit('tap', 't:' + c.id, w.x, w.y);`.

**S8 other emits.** `DayClock.update` (P10): `'day'` when the day changes (the story does not need it; the chat bridge
does, S10). `Civic.settlersArrive` (P27): `gs.events.emit('settlers', n, house && house.id)`.

**S9 `src/scenes/UI.js` (P12).** The view draws its story card (bottom-left 520 × 120), the news edge icon and its
panels in the UI scene itself (`ctx.ui = gs.ui`), so the UI needs no card host for the story. Settings panel
(`buildPanelContent`, after the 낮과 밤 row, line ~948): two rows with the labels `setLife` / `setFarewell` from
`src/story/strings.js` (ko + en), toggling `S.lifeEvents` / `S.lifeFarewell`, `Settings.save()`, then
`gs.events.emit('settings')` (GameFeed → `{ t: 'settings' }`); the farewell row is greyed while 인생 이야기 is off. The
language row emits `'lang'`. Designer preview menu (version label 5-tap): entries from `MODULE.previews`.

**S10 `src/systems/ResidentChat.js` (P21).** Import `createChatBridge` from `../story/chatBridge.js` (tiny, no
dependencies). In `ensure()`, where the village is created (line ~126, after `this.village = v;`) — the lazily loaded
chat module already exports `StoryBridge` (`src/chat/index.js` line 24), so the story never imports chat code:
```js
const st = this.gs.story;
if (st && !this.bridge) this.bridge = createChatBridge(M.StoryBridge, st, v);
```
If the story starts after the chat village exists, do the same from `Game.startStory()` (`if (this.residentChat &&
this.residentChat.village && this.residentChat.mod) …`).
`syncWorld(first)` (line ~162): `if (this.bridge) this.bridge.syncWorld();` once per game day; when a chat opens with
resident `key`: `if (this.bridge) this.bridge.syncMemories(key);`. Tested in `host.test.mjs` with the real
`StoryBridge` (weather, day, diary lines → `saw` memories, once per day, id mapping both ways).

**S11 name card (P34).** `Neighbours.tap` (line ~703) and `VillageLife.react`: when `gs.later.story` runs, open the
story's person card instead of the bubble card: `gs.story.view.openPerson(pid, { x: w.x, y: w.y })` (its 수다 떨기
button calls `gs.residentChat.offer(r)` for villagers).

**S12 `src/data/balance.js`, `strings.js` (P20).** Copy `STORY_TUNING` verbatim as `BALANCE.v5.story` (Korean comments
kept); `MODULE.create` reads `opts.balance.story` first. Copy `STR` of `src/story/strings.js` into the game strings
under the same keys.

**S13 `tools/build/build_artifact.mjs` (P25).** Bundle `src/story/model/worker.js` with esbuild `format: 'iife'` as
`story_worker.js` (like `chat.js`); pass `workerUrl: 'story_worker.js', classicWorker: true` (S1). In the iife game
bundle `new URL(…, import.meta.url)` throws inside `makeWorker`'s try and falls back to `workerUrl` / `workerSrc` /
inline, so a missing worker file degrades to inline instead of failing. Add `story_worker.js` to the file gate.

**S14 `tools/story/index.js` (P26).** Re-export from `src/story/engine/index.js`; `sim.mjs` and the 30 engine tests
keep running (proved by `tools/test/story_lab/engine/*.test.mjs`, which are those tests pointed at the copy).

### 11.5 Other modules

- **missions_bank**: its asks are met — `story:life` / `story:bank` carry `aPid` / `bPid` / `whoPid`; `story:move`
  `{ op: 'in', whoPid, membersPid }`; `watched` on `story:happening`; `api.passbook(pid)` returns a Promise; feed
  `mission:done { wish, who }` closes an elder's wish. Escort / choose scenes report through
  `gs.later.missions.report(...)` once that API exists.
- **vehicles_runtime**: `ports.open()` should report `bus` / `wagon` so P4 / P5 happenings and the 썰매버스 wish can play.

### 11.6 After wiring, check

`nice -n 15 node --test tools/test/story_lab/engine/*.test.mjs tools/test/story_lab/engine_ext.test.mjs
tools/test/story_lab/host.test.mjs` (52 green); the v4 suites (TownSim conservation: retired citizens count as away);
a v4 save loads with the module off and on (slice and side record absent / present); worker blocked → inline; then
in-game captures matching §8 at zoom 0.6–1.2, a `perf` run in the game (main-thread story ms per frame < 0.3 in worker
mode, draw calls unchanged outside set pieces), and texture memory with townfolk2 paged (S3–S4).
