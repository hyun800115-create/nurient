# story_runtime (v5) — build report (after the polish pass)

Module: `src/story/**` (runtime, view) · tests and lab: `tools/test/story_lab/**` · captures: `docs/previews/story_lab_*`
· this report. Built standalone while the v4 workflow kept the live tree: **no file outside these paths was changed**
(nothing in `src/` outside `src/story/`, no `assets/**`, no `tools/story/**`, no `index.html`, no `tools/build/**`).
Plan: `docs/v5_v8_plan.md` §6.1 (story_runtime), §5 (kit), §10 (patch table P1–P34), §11.1 (M1).

Status (2026-10-10, polish pass against `story_runtime_critique.md`: 0 critical · 11 high · 15 medium · 11 low):
**every high and medium is fixed** — in the module where the module owns it, and as an exact kit / v4 patch in §11 where
the game owns it (TownSim persistence, VillageLife whereabouts, the settings row, the hall's props); 10 of 11 lows are
fixed in code, L1 is an Integration rename. **67 / 67 Node tests green** (49 s with `nice -n 15`; 15 new regression
tests in `polish.test.mjs`, one of them a contract test against the real `MissionModel`). All the critic's repro scripts
re-run clean (§0.1). The lab was re-shot after the fixes: 48 captures in `docs/previews/story_lab_*` (45 refreshed, 3
new for the designer's preview menu), each looked at.

---

## 0. 디자이너용 요약 (쉬운 말)

- **주민들이 진짜로 살아요.** 마을 사람과 이웃 마을 사람(약 140명, 150명 이상도 괜찮아요)이 모두 이야기 속 사람이
  돼요. 가까이 있는 두 사람이 화면에 보이면 말풍선으로 수다를 떨고, 눈꽃말 목소리로 말해요. 멀리 줌아웃해도 말풍선
  글씨가 작아지지 않아요.
- **인생 이야기:** 읍이 되면 마을회관 앞에서 **첫 청혼** ("결혼해 줄래요?" → "네!") → 다음 날 아침 10시 카드
  ("보러 가기" 버튼) → **오전 11시 결혼식** (꽃 아치, 빨간 길, 의자, 케이크, 웨딩 음악) → 얼마 뒤 **기쁜 소식** → 저녁 6시 병원에 가서 하룻밤 → **새벽 6시
  반, 유모차를 밀고 나와요** → 촌장님이 **이름 짓기** → 4살 혼자 걷기 → 7살 **첫 등교** → 82살 **소원** → 86살 이후
  **따뜻한 이별**: 전날 오후 3시 "그동안 고마웠어요" → 아침 9시 카드(보러 가기 버튼) → 10시 **기억의 정원 배웅식**.
  비석에는 이름이 또렷하게 새겨지고, 게임을 껐다 켜도 정원에 그대로 있어요. 일곱 번째 이름부터는 가장 오래된 비석
  자리를 이어받고, 그 이름은 정원 입구 꽃밭이 기억해요.
- **이번에 고친 것 (평가 결과 반영):**
  1. 게임을 껐다 켜도 **결혼식이 두 번 열리지 않고**, 약속된 **이별 카드·배웅식·마지막 하루·첫 등교**가 사라지지 않아요.
  2. "첫 아기 소식"과 "이별은 3시간 뒤부터" 시계가 **처음부터 다시 돌지 않아요** (짧게 자주 해도 볼 수 있어요).
  3. 하늘나라로 떠난 분은 **다음 날 마을을 걸어 다니지 않아요.** 이사 간 가족도 다시 나타나지 않아요.
  4. 할머니 할아버지 **소원이 계속 이어져요** (한 번만 나오고 멈추던 문제). 같은 분이 같은 소원을 3일마다 반복하지도 않아요.
  5. 다른 장면이 있어도 **결혼식·배웅이 취소되지 않고** 기다렸다가 열려요 (생일 파티는 살짝 양보해요). 결혼식과 배웅은
     같은 날 겹치지 않아요.
  6. **이야기 미리보기 메뉴**가 이제 모두 나와요 (청혼·결혼식·아기·등교·소원·이별). 미리보기 이별은 "눈송이 할머니"라는
     연습용 이름을 쓰고, 끝나면 **아무것도 남기지 않아요.**
  7. 결혼식 때 옷 그림을 **필요한 나이대만** 불러서 메모리 한도(455MB)를 넘지 않아요.
  8. 신문: 첫 신문은 **"창간호"**, 기사 글자 위 줄(취소선처럼 보이던 것) 없음, 영어 신문에 한국어 한마디가 끼지 않아요.
     은행이 아직 없으면 은행 소식 줄도 없어요 (생기면 촌장님 은행의 이자율이 나와요).
  9. 결혼식 하객이 **앞줄부터** 앉아요. 우리 마을회관의 게시판·발판은 결혼식 동안 잠깐 비켜요.
- **설정:** 한 줄 **"생애 이벤트 — 끄면 노년까지만, 이별 없음"** (대표님이 쓰신 말 그대로). v4.2의 설정 탭에 세 번째 탭
  "이야기"로 들어가요 (§11 S9).
- **숫자 바꾸는 곳:** `src/story/tuning.js` (주석이 한국어예요). 결혼식 시각, 아기 확률, 이별 간격, 소원 기다리는 날 수
  (`wishTimeoutDays: 3`), 신문 시각 등.
- **사진:** `docs/previews/story_lab_*` (§8). 미리보기 메뉴 사진: `story_lab_preview_menu_*.jpg`.

---

## 0.1 Polish pass — the critic's findings

Repro scripts: the critic's own (`e1_replay … e11_farewell_reload`, `pw_previews`), copied to
`$S/polish/exp/` (`S=/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/later_story_runtime`)
and re-run after the fixes; the regression tests are in `tools/test/story_lab/polish.test.mjs` (named after the finding).

| # | Finding | Status | What changed · evidence |
|---|---|---|---|
| H1 | Stale side record replays beats; worker save lands only on a frame | **fixed** | (a) `WorkerTransport.onmessage` writes a `saved` reply at once (`onsaved`), no frame needed; (b) the slice carries `T` and `booked`; a side record older than the slice (`side.T < slice.T − 30`) makes the restored engine replay **quietly** (`quietUntil`: no beats, cards, banners, emits, no past bookings; only bodies / departures / config), and a promised wedding the stale engine does not know is re-made silently (`arrange('propose', { day, silent })`); (c) forced side saves after every staged ceremony and every booking (`saveSoon`). E1: "B life ops after reload: (none)"; E9: written while hidden. Tests `H1 ×2`. |
| H2 | `t0` dropped by the sanitizer | **fixed** | `t0` (and `T`) in `makeSlice` / `sanitizeSlice`. E3: `t0 1425` kept over 9 sessions, farewells stay from day 21. Test `H2`. |
| H3 | Slice sids point at other people after a re-adoption | **fixed** | Slice v2 speaks **pids** only (`firstCouple`, `wishes`, `wishDone`, `wishActive`, `wishLast`, `booked`, `names`); `MIGRATE_SLICE[1]` drops v1 sids, keeps milestones / names / garden; a first couple whose bodies are gone is let go; the engine's `arrange('expect')` now requires a married man and woman, both 19–49. E2b: `arrange expect → null` for strangers. Test `H3`. |
| H4 | A departed elder keeps walking | **fixed** | The director's `farewell` (and `move out`) end with a `leave` action → `ports.town.leave(pid, why)`, `registry.unbind`, the view lets go of the body, a pending wish is freed; scene casting skips unbound pids. The game keeps the body gone after a reload (S6 `retire`, `nb.gone`). E5: `leave called: true`, `bound: false`. Test `H4 + H11`. |
| H5 | Wishes / school never reach missions_bank; the wish system locks | **fixed** | Emits `story:life { op: 'wish', who, whoPid, wish, place, ko, en }` (+ `story:wish` kept), `{ op: 'school', who, whoPid, day, at, venue, family }`, `{ op: 'wishEnd', whoPid, why }`; accepts missions_bank's `mission:done { wish, who | key 's<sid>' }` (a granted stage) and `mission:done` / `mission:expire { code: 'C7', key }` (the whole C7 ended); a wish nobody grants ends after `wishTimeoutDays` (3); a tried wish is never offered to the same elder again and the next wish goes to another elder first (a granted elder first, so C7's three stages follow). Contract test with the **real** `MissionModel` (C7 spawned, staged, expired; C4 once). E5: wishes rotate over 6 elders in 30 days. Test `H5`. |
| H6 | Busy slot drops a wedding / farewell after 0.7 s | **fixed** | Pending beats wait by **game time** until their window (`until`: wedding 12:00, farewell 12:00, school 09:00, others 60 s); a wedding / farewell cuts a birthday party, housewarming, first job or a later proposal short (`view.cancel`); the engine never books a wedding on a farewell / memorial day and never picks a farewell on a wedding day (`avoidClash`). E4: the wedding plays when the slot frees. Test `H6`. |
| H7 | Story children collide with later `t:` ids; families come back | **fixed** (module) + S6 patch | Story children get pid `'k:<sid>'` (never a TownSim id) via `addCitizen({ pid, townKind: 'toddler' })`; on restore a roster row with `sid` re-binds its body, a lost body is made again; the game persists story bodies and retired people (S6). Test `H7` (child keeps its body over a reload, movers stay away, lost body re-made). |
| H8 | Every beat asks for all 9 townfolk2 pages (+79 MiB) | **fixed** (module) + S3/S4 patch | `beatPlan(kind, { ages, budgetMiB })`: only the age groups a set piece dresses, most important first, within the headroom (default 40 MiB = plan's transient cap): proposal 36.1 MiB, wedding 38.1 (adult; +child at 58, +elder at 80), farewell 36.6, wish / last day 28.4, birth 38.5. New port `dressAges(kind)`: people of other ages play in their everyday look with plain anims (sit → idle, clap → happy, push → walk) and stand instead of sitting. Test `H8 + M1`. |
| H9 | Named villagers have no whereabouts in the game | **fixed** (module) + S7 patch | Village areas are story places (`{ id: 'va:<area>', key: 'village_area' }` → plaza); S7 adds a whereabouts row per VillageLife resident. The stand-in's `villagers: 'village'` mode (villagers only in our village) proves it: villagers talk among themselves, the chat bridge gets their diaries. Test `H9`. |
| H10 | The preview menu plays nothing; leaves a nameless stone | **fixed** | `StoryLife.preview(kind)` finds its own cast near the camera (widening to the next streets), takes the ceremony slot (`preview:<kind>`, never over a real beat; a toast when busy / nobody around), focuses the camera, plays in preview mode (a stand-in name 눈송이 할머니, no stone or name kept, no cards, emits or saves) and resolves `true` / `false`. Playwright (`pw_previews2.mjs`, `MODULE.previews.*` with no cast): all 6 entries play; texts / stones left behind: 0. |
| H11 | A reload loses every timed beat except weddings | **fixed** | Promised beats are in the slice (`booked`: `w` wedding, `s` first school day, `l` last day, `f` farewell card + garden) and re-armed by `LifeDirector.restore(T)` until played or their window passes; slot-less beats (the last day) are crossed off when they end. E11: card 09:00 + garden beat after the reload. Tests `H4 + H11`, `H11`. |
| M1 | Stroller / cradle art missing from FRAGMENTS | **fixed** | `birth` / `stroller` request `l2_baby_stroller(_pink)`; `goodnews` / `school` / `outdoor` request `life2_decor`. (A lab mode that loads only `beatAssets(kind)` was not added; the lists are unit-tested.) |
| M2 | Stone names hidden, slots overwritten, garden lost on reload | **fixed** | Stone depth from the garden's own row (small offsets), the given name engraved on the plaque just above the stone (15 px ko / 12 px en) and the full name on a soft 18 px label during the ceremony; one slot per stone (the 7th takes the oldest's slot, that name joins the gate's flower bed); `StoryLife.drawGarden()` draws every stone from the slice on attach and after each ceremony. Capture `story_lab_farewell_after.jpg`: "복순" readable. Test `M2 + L2 + L8`. |
| M3 | Newspaper strike-through, clipped titles, EN duplicate, "No. 3" | **fixed** | Body starts under the column's rule (58 px), titles fit the 36 px band (18 → 15 → two lines at 14), the first edition is **창간호 / First issue** and numbers count from it, EN wedding lead deduped. Also fixed here: a quote is printed only in the language it was said in (an English paper showed a Korean pun). Captures `story_lab_news_ko/en.jpg`. |
| M4 | Wedding guests behind the arch; our hall's props collide | **fixed** (module) + S7b patch | Chairs fill front rows first, both blocks of a row before the next; guests without their townfolk2 page stand at the sides; `world.stage(hallId, on)` asks our 마을회관 to clear its notice board and pad during the wedding (`TownHall.stage`, §11). Capture `story_lab_wedding_vows.jpg`. |
| M5 | Toast / banner port shapes vs v4 UI | **fixed** | The port contract is `ui.toast(text, holdSec)` and `ui.banner({ ko, en, subKo, subEn })`; the kit converts (`gs.ui.toast(text, sec * 1000)`, `gs.ui.banner(title, sub)`), §11.2. |
| M6 | "≤ 2 chats / ≤ 3 emotes" not enforced | **fixed** | StoryLife counts its own bubbles (`room()`: ≤ 2 chats, ≤ 3 emotes, then the emote fallback); the kit's `say` / `emote` return false at the Bubbles cap instead of evicting a village bubble (§11.2). |
| M7 | 인생 이야기 off still makes the first baby | **fixed** | The scripted good news is guarded by `lifeOn()`. A wedding already booked when the switch goes off still happens (it was announced). Test `M7`. |
| M8 | First proposal not retried; may pick a busy body; 단골 unused | **fixed** | Retried every `proposalRetrySec` (10 s) until it plays; only bodies the town owns and no scene holds; on-screen pairs and regulars first; `singles` when no sweethearts yet; `registry.served` seeded from the roster's `visits` (v4 `c.visits`). E7 / test `M8`. |
| M9 | First wedding easily missed; no 보러 가기 | **fixed** | The first wedding and the first farewell wait until 11:00 for the camera to come near; the first wedding's morning gets a card at 10:00 ("오늘 11시, 마을회관에서 첫 결혼식이 열려요!", re-armed after a reload), and every engaged and farewell card carries `watch` → 보러 가기 → `host.watch(card)` (staged wherever it is, `view.focus` pans there). Capture `story_lab_farewell_card.jpg`; test `H1` checks the morning card. |
| M10 | 수다 떨기 does nothing; world vs screen anchor | **fixed** | `talkWith(pid)`: a named villager opens the resident chat (`ports.chat.offer`), a townsperson has a short talk with the chief through `ports.say`; `openPerson(pid)` converts the body's world point itself (`screenOf`). Capture `story_lab_person_card.jpg`. |
| M11 | S7 walk speed / face semantics | **fixed** (Integration) | §11.4 S7: `walk(pid, x, y, { speed })` → `r.goTo(x, y, { speed: r.walkSpeed * speed })`; `face(pid, dir)` → `r.faceTo(r.x + DX[dir], r.y + DY[dir])`. |
| M12 | Settings rows overflow; wording differs | **fixed** | One row with the designer's words, 생애 이벤트 / 끄면 노년까지만, 이별 없음 (`setLifeEvents*`), on `Settings.data.lifeFarewell`; `lifeEvents` stays an advanced switch. S9 now targets v4.2's tabbed panel (a third tab 이야기). |
| M13 | Settlers are invisible "known" ghosts | **fixed** | A settler row is adopted only with `body: true`; `s:` pids are no longer "known" by prefix. |
| M14 | Main-thread budget missed, not flagged | **fixed** | Happenings ask the ports only when one is due (`HappeningClock.peek`); budget stated in §7: worker mode 0.076 ms per frame average in Node (budget 0.10) ✔; lab numbers under a loaded machine are not comparable (§7.2). |
| M15 | Paper's bank rate contradicts the bank | **fixed** | The paper prints the chief's bank rate (`ports.bank.rate()`, re-sent when the bank is built); no bank, no line. Test `M15`. |
| L1 | S6 `place` name clash | **fixed** (Integration) | S6 uses `placeAt(c, x, y, dir)`. |
| L2 | `wishDone` not in the slice | **fixed** | Kept (capped). |
| L3 | Happening RNG per session; toasts ignored | **fixed** | Seeded from `ports.seed() ^ day`; `{ toast: true }` shows the toast. |
| L4 | "어머, 내 빵!" for men | **fixed** | "어이쿠, 내 빵!" for a male keeper. |
| L5 | Engaged card without the day | **fixed** | 내일 / 모레 / n일 뒤 11시. |
| L6 | Out of the clinic "at dawn" at 18:00 | **fixed** | Birth at dusk (into the clinic, warm window); a `birthdawn` beat at 06:30 brings the parents out with the stroller. Capture `story_lab_birth_stroller.jpg` (06:34). |
| L7 | Previews share no slot | **fixed** | With H10. |
| L8 | No migration hook | **fixed** | `MIGRATE_SLICE` (v1 → v2 in use). |
| L9 | Registry snapshot vs engine pack time | **fixed** | The registry and life state are copied when the save is asked for (`saveReqs`). |
| L10 | "아장아장" at 4 | **fixed** | "이제 유모차 대신 혼자 걸어요!" |
| L11 | Tiny bubbles at zoom 0.6; skip claim | **fixed** | The lab's bubbles counter-scale below zoom 0.9 (`story_lab_town_z06.jpg` readable) and §11 gives the same 1-line patch for v4 `Bubbles.update`; the "skippable" claim was dropped from `Proposal.js`. |

---

## 1. What it does

| Area | What the player sees / what runs |
|---|---|
| Engine | The finished `tools/story` engine, copied to `src/story/engine/**` with extensions E1–E9 behind config flags (the original 30 engine tests pass against the copy): external plans, live add / remove residents, leases, compaction, two-speed aging + freeze, `arrange()` (propose with a fixed day and `silent`, expect for a married couple only, nameBaby), wedding timing, farewell gates (+ `avoidClash`), last day, memorial hour, the paper's bank rate (`paperRateBp`). Seeded RNG; 600 s day, 25 s hour. |
| Core off the main thread | `StoryCore` in a Web Worker (module worker in dev, Blob / classic worker in the build), inline fallback with an 8 s catch-up cap; identical event streams (digest test). Side saves are written the moment the packed engine arrives. |
| People | `PersonRegistry` maps game pids (`v:npc_aunt`, `t:12`, `k:<sid>` story children, `s:3` settlers with a body) to engine sids with owners `town` / `gameplay` / `story`. `adoptRoster` turns the roster into households; v4 visit counts seed 단골. |
| Events in | `onFeed`: taps, sales, buildings, shops, trains, rank, dog play, snowballs, missions done / expired, settlers, language, settings (§4.1). |
| Beats out | Talks → bubbles (`ports.say`, VillageVoice), ≤ 2 story chats / ≤ 3 emotes, rumour ears. Set pieces on the StageDirector (ceremony / happening / incident slots, near the view; waiting by game time; small beats give way to weddings and farewells): proposal, wedding, good news, birth (dusk) + dawn stroller, naming, first steps, school day, outdoor class, wish, last day, farewell, birthday, housewarming, first job; ambient hearts and dates. Cards (보러 가기 for promised beats), banners after the "네!", the morning paper. |
| Life cycle | §0. `lifeFarewell` off (설정 생애 이벤트) → old age only, elders freeze at 85, no farewell; `lifeEvents` off (advanced) → no romance / weddings / babies / farewells (an announced wedding still happens). |
| Newspaper | 솔방울 신문: masthead (baked logo), 창간호 / 제 n호 from the first edition the chief gets, headline + photo, ≤ 3 columns (titles in the band, bodies under the rule), sidebar (weather, prices, the chief's bank once it exists, a quote in the paper's language). |
| Memorial garden | Six stones with engraved given names drawn from the slice (they survive reloads), a flower bed for older names; the garden picture itself is the game's building. |
| Person card | Name, age, job, home, family, likes, a memory of the chief, 단골 ★; 수다 떨기 = the chat (villagers) or a little talk (townsfolk). |
| Designer previews | `MODULE.previews.{proposal, wedding, baby, school, wish, farewell}(host)` — own cast, own slot, nothing kept. |
| Chat memory bridge | `createChatBridge(StoryBridge, host, village)` — the chat's `StoryBridge` reads headline, weather, day and yesterday's diary of the named villagers (who now live in the story too, H9). |
| Saves | Slice `story` v2 ≤ 1 KB; side record `frostVillage.save.v1.story` v1 (§5). |

## 2. Files

```
src/story/
  index.js            MODULE (id 'story', version 2, gate 읍, create, sanitize, prefetch, beatAssets, beatPlan, previews),
                      FRAGMENTS, TF2_PAGES / TF2_MIB / BEAT_AGES (per-age townfolk2 pages)
  host.js             StoryHost: transports, adoption / restore / reconcile, quiet replay, registry, feed, director, stage
                      (pending by game time, pre-emption), cards, paper, wishes, bodies, leaving, saves, api
  ports.js            the Ports surface the story calls (documented) + nullPorts()
  tuning.js           STORY_TUNING (Korean comments; becomes BALANCE.v5.story) + engineConfig()
  save.js             slice v2 (make / cap / sanitize / MIGRATE_SLICE) + StorySideStore (side record)
  mirror.js · chatBridge.js · strings.js · layout.js
  engine/**           engine copy + E1–E9 (+ avoidClash, paperRateBp, stricter expect, silent / day proposals)
  model/              protocol, core, worker, registry, adopt, places, chronicle, lifeRules (LifeDirector: beats,
                      cards, bookings, restore, quiet replay, wishes), stage, happenings
  view/               StoryLife (talks, beats, garden, cards, paper, person card, previews), stagehand (leases, walks,
                      props, venues, dress-age fallback, watchdog), scenes/*, happenings/*, ui/*
tools/test/story_lab/
  engine/*.test.mjs   the 7 original engine test files (30 tests) · engine_ext.test.mjs (10) · host.test.mjs (12)
  polish.test.mjs     15 regressions of the critique (H1–H11, M1/M2/M7/M8/M15, L2/L8; missions_bank contract)
  fakePorts.mjs, standin.mjs (stand-in town: story children's bodies, retired people, villagers in our village),
  node_worker.mjs / nodeTransport.mjs (worker_threads parity, save-on-arrival like the browser worker)
  lab.html, lab/      Phaser 3.90 lab (art, world, LabTown bodies, bubbles with zoom counter-scale, tint, lab, shots)
  lab.mjs, smoke_lab.mjs
```

Sizes: runtime + view 4,520 lines, engine copy 45 files / 10.6 K lines, tests + lab 3,300 lines.

**Path note.** Plan §11.1 lists `tools/test/later/story*`, `docs/previews/later_story/**`, `docs/build_reports/later_story.md`;
the task's paths were used. **Kit note.** `src/kit` does not exist yet; the module ships `ports.js` and `model/stage.js`.

## 3. Public API

### 3.1 `src/story/index.js`

| Entry | Meaning |
|---|---|
| `MODULE.id / version / saveKey / capBytes` | `'story'`, **2**, `'story'`, 1024 |
| `MODULE.gate(gs)` | `gs.v4.rank.level >= 2` (읍) |
| `MODULE.create(ports, saved, opts)` | → `StoryHost` (starts async; `opts.view(host)` → a `StoryLife`; `opts.balance.story`; `opts.transport`; `opts.workerUrl` + `opts.classicWorker` or `opts.workerSrc`) |
| `MODULE.sanitize(raw)` | slice sanitizer (migrates v1; 300 fuzzed slices: never throw, ≤ 1 KB, stable) |
| `MODULE.prefetch(gs, assets)` | `FRAGMENTS.gate` near 읍 (fx_city story UI, life2 items, a few sounds) |
| `MODULE.beatAssets(kind, opts?)` / `MODULE.beatPlan(kind, { ages, budgetMiB })` | the late files of a set piece; `beatPlan` also returns the granted `ages` and the RGBA `mib` |
| `MODULE.previews.*(host)` | designer preview menu entries → `Promise<boolean>` |

### 3.2 `StoryHost`

`start()` → `{ mode, restored, people }` · `update(dt)` · `onFeed(ev)` · `serialize()` → slice · `saveSide(force)` →
Promise (unforced ≤ once a game day; the host forces its own after ceremonies / bookings) · `attachView(view)` ·
`on(name, fn)` (`ready`, `error`, `beatEnd`, `ui:card`, `ui:banner`, `ui:toast`, every `story:*`) · `perf()` · `state()`
(`quiet`, `booked`, slots …) · `destroy()`.

`host.api` (= `gs.later.story`): `facade`, `talkTo(pid, lang)`, `card(pid)`, `passbook(pid)`, `pidOf(body)`,
`bodyOf(pid)`, `known(pid)`, `sidOf(pid)`, `report(kind, data)`, `arrange(op, data)`, `toggles(t)`, `stage(kind, data)` /
`endStage(kind)`, `nameBaby(sid, name)`, `board()`, `paper(lang)`, `watch(card)` (보러 가기), `booked()` (promised beats),
`mode()`, `perf()`.

### 3.3 `StoryLife`

`new StoryLife(ctx)`, `ctx = { scene, ui, art, ports, lang, screen, cardLayout?, chipLayout?, chief?, dog?, onError,
onWatch?, happen }`. Public: `talk`, `play(beat, decision, onEnd)`, `cancel(kind)`, `card`, `paper`, `openNews`,
`openPerson(pid, at?)` (anchor computed from the body when omitted), `talkWith(pid)`, `happening`, `preview(kind, data?)`,
`drawGarden()`, `releaseBody(pid)`, `isHeld(pid)`, `update`, `destroy`. `ctx.art`: `image`, `nine`, `def`, `layout`,
`play`, `sheet` (the lab's `LabArt` is the reference).

### 3.4 Ports (`src/story/ports.js`)

Every member optional. Additions in this pass: `town.leave(pid, why)` (gone for good — not the train),
`town.addCitizen({ pid: 'k:<sid>', townKind, … })`, `town.ageGroup(pid)`, `world.stage(buildingId, on, by)`,
`dressAges(kind)`, `chat.offer(pid) → bool`, `bank.rate()`; `ui.toast(text, holdSec)` and `ui.banner({ ko, en, subKo,
subEn })` are the contract (the kit converts); `say` / `emote` return false at the town's bubble cap. Game mapping: §11.2.

## 4. Events

### 4.1 In: `host.onFeed({ t, … })`

| `t` | Fields | Effect |
|---|---|---|
| `tap` | `pid` | known after 3 taps; card refreshed |
| `sold`, `visitorDone` | `pid?`, `n?` | 단골 counting; 20 sales a day → the chief's market day is talk |
| `built` | `key`, `siteId`, `x`, `y` | chief fact; memorial garden / town hall / school / clinic / bank become places (garden unlocks farewells; bank → the paper's rate) |
| `shopOpen` | `shop`/`id`, `kind`, `name`, `x`, `y`, `founder` | a story shop + chief fact |
| `train` | `ev: 'arrive'`, `passengers` | hourly train news |
| `rank` | `level` | level 2 arms the scripted first proposal (12 s, retried every 10 s) |
| `dogLove`, `snowball` (`a`, `b` pids), `fame:title` | — | facts / gossip |
| `mission:done` | `wish?`, `who?` (sid) / `key` (`'s<sid>'`), `code`, `target` | chief helped someone; a C7 stage with `wish` = one wish granted; C7 done = the elder's wishes end |
| `mission:expire` | `code: 'C7'`, `key` | the elder's wish ends (tried) |
| `settlers` | `pids`, `rows` (rows with `body: true` only) | adopted as a new household → `story:move { op: 'in' }` |
| `lang`, `settings` | — | language; re-reads `lifeEvents` / `lifeFarewell` |

### 4.2 Out (`ports.events.emit` and `host.on`)

Payloads with `a` / `b` / `who` / `baby` sids carry `aPid` / `bPid` / `whoPid` / `babyPid` (`members` → `membersPid`).

| Name | Payload |
|---|---|
| `story:life` | `op`: `sweetheart`, `engaged` (`day`, `hour`, `at`, `prepAt`, `venue`, `ours`), `wedding` (`venue`, `guests`, `ours`), `goodnews`, `baby` (`venue`, `ours`), `named` (`ko`, `en`), `birthday` (`age`, `family`), **`school`** (`day`, `at`, `venue`, `family`), `grownup`, `lastday` (`day`), `farewell` (`day`, `at`, `venue`), **`wish`** (`wish`, `place`, `ko`, `en`), **`wishEnd`** (`why`) |
| `story:wish` | `{ who, wish, place, ko, en }` (kept for compatibility; missions_bank dedupes) · `story:wisher` `{ who }` (turned 82) |
| `story:news` | `{ day, first, no }` · `story:read` `{ day }` |
| `story:day`, `story:move` (`in` / `out` / `within`), `story:happening` (`id`, `key`, `where`, `watched`), `story:bank`, `story:shop`, `story:build`, `story:incident` | as before |

## 5. Save slice and side record

- **Main save:** slice `story` **v2**, ≤ 1024 chars: `{ v: 2, day, T, t0, ok, chars, life: { seen, firstCouple
  [pids], names [[pid, ko, en]], garden [{ ko, en, day, s }], gardenOld, wishes {pid: n}, wishDone {pid: [ids]},
  wishActive, wishAt, wishId, wishLast, wishLastOk, paperFrom, paperDay, paperNo, booked [[kind, day, pid, extra, n]] },
  happen: { last } }`. People are pids only. Capped by dropping the oldest names, old garden names, done wishes, wishes,
  then old stones; promised beats, the first couple and milestones always stay. `MIGRATE_SLICE[1]` turns v1 into v2
  (v1 sids dropped). Fuzzed: 300 slices (v1 / v2 / junk) never throw, ≤ 1 KB, `sanitize(sanitize(x)) === sanitize(x)`.
- **Side record:** `frostVillage.save.v1.story` `{ v: 1, cid, T, day, reg, eng, life }`: packed engine (pack15), the
  registry and a copy of the life state, both snapshotted when the save is asked for. Written: unforced at the first
  autosave of a game day; forced by the host after a staged wedding / farewell / proposal / last day / school day, after
  a booking, a new child body, a name, a wish; forced by the game on `pagehide` / `visibilitychange: hidden` — in worker
  mode the record is written in the worker's `onmessage`, no frame needed. Cap 450 K chars (compaction), hard 600 K.
- **Restore:** a side record newer than the slice wins for the life state; an older one replays quietly up to the
  slice's `T` (no beat, card, banner or module event twice; bodies, departures and config still happen). Promised beats
  come back from `booked`. A lost / corrupt record → the town is adopted again from the roster, story children find their
  bodies by `sid`, one gentle card "주민들이 오늘 일을 조금 잊어버렸어요".

## 6. Tuning (`src/story/tuning.js` → `BALANCE.v5.story`)

As before (`yearDaysKid 1.5`, `yearDaysAdult 4`, `weddingInDays 2`, `weddingHour 11`, `weddingGapDays 6`,
`firstWeddingInDays 1`, `firstBabyAfterMin 23`, `birthAfterNews 2.5`, `birthHour 18`, `babyRate 0.012`, `schoolAge 7`,
`walkAge 4`, `firstJobAge 16`, `wishAge 82`, `wishes 3`, `farewellMinAge 86`, `farewellFirstAfterMin 180`,
`farewellGapDays 15`, `farewellBirthGapDays 5`, `freezeAgeWhenOff 85`, `memorialHour 10`, `lastDayHour 15`, `stones 6`,
`cardsQueue 3`, `knownServed 3`, `firstProposalAfterSec 12`; talk `maxDist 220`, `chatCap 2`, `emoteCap 3`; paper
`hour 7`; happenings `gapMin 150`, `every 300`; save `capChars 450000`, `hardChars 600000`) plus, new:
`wishTimeoutDays 3`, `proposalRetrySec 10`, `stage: { waitSec 60, firstWatchHour 11 }`; engine `avoidClash: true`,
`paperRateBp` (from the chief's bank; −1 = no bank line). Director defaults (not tuned): birth dawn 06:30, wedding window
until 12:00, farewell until 12:00, last day until 18:00.

## 7. Numbers

### 7.1 Node (fixed seeds, `nice -n 15`, 4-core container shared with the v4.2 workflow)

| Measure | After polish | Before (build report) |
|---|---|---|
| Tests | **67 / 67**, 49 s | 52 / 52, 41 s |
| Main thread per frame, 3 game days (budget 0.10 ms) | worker **0.076 ms** avg (max 8.4), 0 long tasks; inline 0.082 ms (max 21.7) | worker 0.047–0.055, inline 0.067–0.074 |
| Worker ↔ inline parity | 636 events, identical digest | same |
| Host + core, 30 game days, 137 → 176 residents | core 0.031 ms per 0.25 s tick (max 24.3, the day change, in the worker), 0.125 ms per game second (budget 2) | 0.027–0.033 / 0.11–0.13 |
| Side record after 30 days | 117,650 chars, 12 ms to pack | 117,320 chars |
| Slice | ≤ 1 KB always | same |

### 7.2 Phaser lab (Chromium SwiftShader, phone 390 × 844 DPR 3, 137 people)

The machine ran the v4.2 workflow at the same time (load average 10.6 on 4 cores; the lab drew 2.7 fps against 4.8
before), so these per-frame numbers are inflated and not comparable with the first report: worker mode 0.56 ms avg
(p50 0.0, p95 3.4) over 78 frames, inline 2.0 ms avg. The meaningful ones: **draw calls** 4.4 avg / 8 max (worker),
5.0 / 8 (inline) — unchanged; display objects 1,448; 0 console errors, 0 × 404, no missing art. The plan's 0.10 ms budget
is met by the host in Node (§7.1); StoryLife's own share must be measured in the game (§11.6).

Texture memory: the lab loads every page (275.7 MiB). In the game the story now adds at most its `beatPlan`: proposal
36.1 MiB, wedding 38.1 (adult pages) at the default 40 MiB headroom — at the v4 plaza peak 386.9 + 38.1 = 425 MiB < 455.

## 8. Lab shots

`nice -n 15 node tools/test/story_lab/lab.mjs <group> [--desktop] [--inline]`, groups `town talks proposal wedding baby
ui previews stroller school wish farewell farewell_off perf`. Shots now wait for the story core to catch up after a
clock jump (`caughtUp`), so day-by-day searches (the last day) no longer miss their event on a busy machine. Designer
menu check: `$S/polish/exp/pw_previews2.mjs <outdir> [entries]`.

| File (`docs/previews/`) | Shows |
|---|---|
| `story_lab_town_z06.jpg`, `_z09.jpg` | the square at zoom 0.6 / 0.9 — the bubble keeps its phone size at 0.6 |
| `story_lab_talks_ko.jpg`, `_en.jpg`, `story_lab_talks.gif` | everyday talks, both languages |
| `story_lab_proposal_ask / _yes / _banner.jpg`, `story_lab_proposal.gif` | the first proposal; banner after "네!" |
| `story_lab_wedding_guests / aisle / vows / hearts / cake / dance.jpg` (+ `_desktop`), `story_lab_wedding.gif` | guests in the front rows by the aisle |
| `story_lab_goodnews.jpg`, `story_lab_naming_card.jpg`, `story_lab_naming_sheet.jpg`, `story_lab_birth_stroller.jpg` | cradle by the door; naming; **06:34** out of the clinic with the pink stroller |
| `story_lab_stroller.jpg/.gif`, `story_lab_school_wave / _lookback.jpg`, `story_lab_outdoor_class.jpg`, `story_lab_wish_walk / _bench.jpg` | preview-cast beats |
| `story_lab_news_chip.jpg`, `story_lab_news_ko.jpg`, `_en.jpg` | 창간호 / First issue; titles in the band, bodies under the rule, no bank line yet |
| `story_lab_person_card.jpg` | the person card above the tapped person (15:00 square) |
| `story_lab_lastday_thanks / _bench.jpg`, `story_lab_farewell_card / _gather / _flowers / _after.jpg`, `story_lab_farewell.gif` | last day; 09:00 card with 보러 가기; mourners in black, the name label; the stone with "복순" engraved, kept after |
| `story_lab_farewell_off.jpg` | farewells off: oldest 85, no last day, no farewell (51 days) |
| `story_lab_preview_menu_farewell.jpg`, `_after.jpg`, `story_lab_preview_menu_wish.jpg` | `MODULE.previews.*` with no cast: the stand-in 눈송이 할머니 farewell, the garden clean afterwards |

## 9. Decisions and deviations

- **Engine copy, not import**; P26 / S14 re-exports `tools/story` from the copy. `tools/story` itself was not changed
  (its EN wedding lead still has the duplicate; the copy is fixed).
- **External plans**: the game decides where every body is (TownSim and now VillageLife rows); words only on screen.
- **Promised beats live in the slice**, not the engine's schedule: they survive a lost side record, a stale one and a
  re-adoption, and are keyed by pid.
- **Quiet replay instead of rewinding**: a stale engine is simulated forward to the slice's time without showing
  anything twice; the story it produces may differ in small talk from what was lost, never in the milestones.
- **Stage**: one ceremony at a time near the camera; waiting by game time; birthdays the only beats allowed to give way
  silently. Weddings / farewells pause farewell scheduling (`farewellHold`) and never share a day.
- **Farewell gates**: memorial garden built, v5 + 180 min (from the saved `t0`), ≥ 15 days apart, not within 5 days of
  a birth, not on a wedding day, never a named villager, none when switched off.
- **Per-age townfolk2**: a set piece never forces a page in; without the page a person wears their everyday clothes.

## 10. Known issues and limits

1. **townfolk2 in the game is untested**: the module now asks per age within a headroom; real paging, release ~60 s
   after the beat and the 455 MiB peak must be measured once S3–S5 are wired (§11.6).
2. **No kneel animation**: the proposal uses a bow, hearts and `happy`.
3. **Happenings P2, P4–P6** are toasts until their props / vehicles exist.
4. **A quiet replay re-rolls small talk** after a stale side record (milestones and promised beats are exact).
5. **A wish preview may borrow an elder from far away** in a quiet town: the elder is placed a few steps from the bench.
6. **Desktop** shows the game's portrait canvas pillarboxed; **SwiftShader** fps are not meaningful.
7. **Lab stand-ins**: positions and bodies (`LabTown`) are the lab's own; in the game TownSim / VillageLife provide them
   through §11.

## 11. Integration

Anchors are **function names** (and quoted lines), checked against the tree at `77db647` plus the uncommitted v4.2
CODE-1 work in progress (`Game.js` now builds `buildV42(this, sv)` and serializes `...this.v42.serialize()`; `UI.js`
has the two-tab settings panel; `Save.js` has the v4.2 `Settings.data` keys). No patch below has been applied; none is
needed for v4 / v4.2 to keep working (without the module the slice and side record are simply absent).

### 11.1 Order

1. Kit (lead): ModuleHost, Ports (11.2), GameFeed (11.3), the art adapter (§3.3).
2. S2 Save, S12 balance / strings, S3 Assets, S4 Residency, S5 Townfolk2.
3. S6 TownSim, S7 VillageLife / Resident / TownHall / Bubbles.
4. S1 Game. 5. S8 emits, S9 settings, S10 chat, S11 cards, S13 build, S14 tools/story. 6. Checks 11.6.

### 11.2 Ports → game

| Port | Game |
|---|---|
| `seed()`, `cid()`, `T()`, `lang()` | `gs.v4.seed`, `gs.cid`, `gs.v4.clock.T` (assert `gs.v4.clock.hourLen === 25`: the story's hour), `getLang()` |
| `storage`, `sideKey` | `localStorage`, `SAVE_KEY + '.story'` |
| `settings.get(k)` | `Settings.data[k]` (`lifeFarewell`, `lifeEvents`, `missionToasts`) |
| `world.buildings()` | town buildings `{ id, key, role, x, y }` + ours (`gs.civic.hall` → `{ id: 'v_hall', key: 'town_hall', ours: true, x, y }`; school / clinic / memorial garden / bank when built; shops from Growth `locked`, `name`) + **village areas**: for each unlocked `gs.life.areas[id]` → `{ id: 'va:' + id, key: 'village_area', role: 'plaza', x: a.x, y: a.y, ours: true }` (H9) |
| `world.spot(id, kind)`, `has(key)`, `names(key)` | `doorPoint` / `gatherPoints[0]` of `Assets.def(key)` + the building's x, y (`dir` = `doorDir`); any building with the key; `Assets.def(key).name` |
| `world.stage(id, on, by)` | `id === 'v_hall' && gs.civic.hall.stage(on)` (S7b) |
| `people.roster()` | TownSim citizens `{ pid: c.pid \|\| 't:' + c.id, kind: 'citizen', townKind: c.kind, role, name, nameEn, age, home, work, sex: lookSex(c.person), visits: c.visits, sid: c.storySid }`; VillageLife residents `{ pid: 'v:' + r.key, kind: 'villager', key, persona: PERSONAS[r.key], home }`; settlers only when they have a body (`body: true`) |
| `people.relations()`, `chronicle()`, `prices()` | chat `RELATIONS`; `{ flags: gs.progress.flags, rank: gs.v4.rank.level, built, shops }`; `BALANCE` prices |
| `town.*` | dispatched on the pid prefix: `t:` / `k:` → TownSim (S6), `v:` → VillageLife (S7); `bodyOf` → the body; `ageGroup(pid)` → `TF.age(c.person.base)` or the villager's group |
| `say(pid, text, emote, dur, opts)` | `const B = gs.life.bubbles; if (B.active.filter((b) => b.kind === 'chat').length >= 4) return false; return !!B.chat(bodyOf(pid), text, emote, dur, opts);` (M6: never evict a village bubble) |
| `emote(pid, key, dur)` | same with `kind === 'emote'` and the emote cap |
| `ui.toast(text, sec)` / `ui.banner(spec)` | `gs.ui.toast(text, Math.round(sec * 1000))` / `gs.ui.banner(en ? spec.en : spec.ko, en ? spec.subEn : spec.subKo)` (M5) |
| `sound.*` | `Audio.play`, `gs.sfxAt`, `Audio.playMusic(key)` / area music on `null`, `gs.voice.duck` |
| `view.rect()` | `const r = gs.viewRect(); return { x: r.x, y: r.y, w: r.right - r.x, h: r.bottom - r.y };` |
| `view.onScreen / focus / zoomPulse` | `gs.isOnScreen(x, y, m)`; `gs.camFocus = { x, y, until: gs.time.now + ms }` (or the v4.2 camera director); a tween of `gs.zoomTarget` |
| `dressAges(kind)` | `STORY.beatPlan(kind, { budgetMiB: Residency.budget().must - 40 - Residency.total }).ages` (H8; ≥ 0) |
| `chat.offer(pid)` | `const r = villager(pid); if (!gs.residentChat \|\| !gs.residentChat.canChat(r)) return false; gs.residentChat.offer(r); return true;` (M10) |
| `bank.rate()` | the chief's bank daily rate: `gs.later.bank ? gs.later.bank.rate() : null` (missions_bank, 0.01) — or v4.2's office bank once it exists; `null` = no bank line |
| `open()`, `happenSpots()` | `{ bus, wagon, harbor, beach, sugar }`; market / plaza / house / chief points near the camera |
| `events.emit` | GameFeed bus |

### 11.3 GameFeed (game emits → feed objects)

| Game emit | Feed | Patch |
|---|---|---|
| `'v4:rank' (level)` / `'v4:rankUp'` | `{ t: 'rank', level }` | — |
| `'v4:train' (ev, stop)` | `{ t: 'train', ev, stop, passengers }` | — |
| `'built' (building, site)` | `{ t: 'built', key, siteId, x, y }` | — |
| `'v4:shopOpen' (shop)` | `{ t: 'shopOpen', shop, kind, name, x, y, founder }` | — |
| `'sold'`, `'v4:visitorDone' (citizen)` | `{ t: 'sold', n, pid }`, `{ t: 'visitorDone', pid }` | P8 |
| `'dogLove'` | `{ t: 'dogLove' }` | — |
| — | `{ t: 'snowball', a: 'v:' + th.key, b: 'v:' + tg.key }` | S8a |
| `'settlers' (n)` | rows only for settlers with a body (P27); otherwise `{ t: 'settlers', n }` (counted, not adopted) | M13 |
| — | `{ t: 'tap', pid }` | P11 |
| missions_bank `mission:done`, `mission:stage` → its host's `mission:done { wish, who, key }`, `mission:expire`, `fame:title` | as is | — |
| settings / language | `{ t: 'settings' }`, `{ t: 'lang', lang }` | S9 |

### 11.4 Patches by file

**S1 `src/scenes/Game.js` (P1).**
```js
// imports
import { MODULE as STORY } from '../story/index.js';
import { StoryLife } from '../story/view/StoryLife.js';
// create(), after `this.residentChat = new ResidentChat(this);`
this.later = this.later || {}; this.story = null;
// update(), after `if (this.v4) this.v4.update(dt);` (and the v4.2 `if (this.v42) this.v42.update(dt);`)
if (!this.story && this.v4 && STORY.gate(this)) this.startStory();
if (this.story) this.story.update(dt);
// new method
startStory() {
  const ports = makeStoryPorts(this), art = makeStoryArt(this);           // kit: 11.2, §3.3
  this.story = STORY.create(ports, this.saved && this.saved.story, {
    balance: BALANCE.v5, workerUrl: window.__FV_BUILD ? 'story_worker.js' : undefined, classicWorker: !!window.__FV_BUILD,
    view: () => new StoryLife({ scene: this, ui: this.ui, art, ports, lang: getLang(), screen: () => ({ w: View.W, h: View.H }),
      onError: (e) => console.warn('[story]', e), happen: () => storyHappen(this) }),
  });
  this.later.story = this.story.api;
  STORY.prefetch(this, { fragment: (name, o) => Assets.loadFragment(this, name, o) });
  // late art per promised beat (hours ahead of its scene), within the headroom
  this.story.on('story:life', (d) => {
    const kind = { engaged: 'wedding', lastday: 'farewell', goodnews: 'birth', school: 'school', wish: 'wish' }[d.op];
    if (!kind) return;
    const plan = STORY.beatPlan(kind, { budgetMiB: Math.max(0, Residency.budget().must - 40 - Residency.total) });
    for (const [name, o] of plan.list) Assets.loadFragment(this, name, o);
  });
  this.events.once('shutdown', () => { if (this.story) { this.story.destroy(); this.story = null; } });
}
// serialize(), after `cid: this.cid,`
story: this.story ? this.story.serialize() : (this.saved && this.saved.story) || undefined,
// save(force), after `const ok = Save.write(this.serialize());`
if (this.story && ok) this.story.saveSide(!!force);
```
`onVis` / `onHide` already call `this.save(true)` → a forced side save (written from the worker's reply at once).

**S2 `src/core/Save.js` (P2).** In `sanitizeSave`, before `return s;`: `const st = sanitizeSlice(raw.story); if (st)
s.story = st;` (import `sanitizeSlice` from `../story/save.js`, pure; it migrates v1 slices). `Save.clear()`: also
`removeKey(SAVE_KEY + '.story')`. `Settings.data` gains `lifeFarewell: true, lifeEvents: true`; `Settings.load()`:
`this.data.lifeFarewell = s.lifeFarewell !== false; this.data.lifeEvents = s.lifeEvents !== false;`. In
`sanitizeV4(raw)`, the rebuilt `o.town = { seed, open, extra, regulars }` gains the story bodies and the retired ids (S6):
```js
story: Array.isArray(tw.story) ? tw.story.filter((e) => Array.isArray(e) && typeof e[0] === 'string' && /^k:\d{1,6}(\.\d{1,2})?$/.test(e[0])
  && (e[1] === 'toddler' || e[1] === 'student')).slice(-160).map((e) => [e[0], e[1], typeof e[2] === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(e[2]) ? e[2] : null,
  count(e[3], 1e6), count(e[4], 120)]) : [],
gone: Array.isArray(tw.gone) ? tw.gone.filter((n) => Number.isInteger(n) && n >= 0).slice(-400).map((n) => count(n, 1e5)) : [],
```

**S3 `src/core/Assets.js` (P3).** `LATE_FRAGMENTS` += `'fx_city', 'audio6', 'townfolk2'`. In `mergeLate(f, j)` keep the
layouts (the wedding / farewell layouts live in the late life2 manifest): after the `audioGroups` line add
`if (j.layouts && typeof j.layouts === 'object') for (const k in j.layouts) if (!this.layouts[k]) this.layouts[k] = j.layouts[k];`.
townfolk2: merge its manifest into townfolk's before `TF.init` (`mergeTownfolkManifests` from `tools/townfolk2_compose.js`).

**S4 `src/core/Residency.js` (P4).** No new class is needed: story pages go through `demand(keys)` like `wantTf` does,
and the gate is the same (`this.total + need > budget().must - 30` → refuse); `dressAges` (11.2) grants only what fits
under `must − 40`. Release: on `host.on('beatEnd')` mark the beat's `tf2_*` / `life2_wedding` / `life2_memorial`
pages old (`this.use[page] = 0`) so `evictLRU` takes them first after ~60 s.

**S5 `src/core/Townfolk.js` (P5).** `TOWNFOLK2 = true` and port from `tools/townfolk2_compose.js`: anims `clap`,
`sit`, `sad`, `push`, the wedding / mourning parts, `AGE_SHEETS` covering `tf2_`; `TF.dress(person, preset, { add,
remove })` (= `LabTown.dressLook`); presets `bride`, `groom`, `wedding_guest`, `mourner`, `mourner_family`, parts
`held_bouquet`, `acc_backpack`.

**S6 `src/systems/TownSim.js` (P6).** Leases, story bodies, retirement (H4, H7):
```js
// constructor: this.held = new Set(); this.reserved = new Map(); this.gone = new Set(nb.gone || []);
hold(c, owner = 'story') {
  if (!c || c.gone || (c.flags & (F.ON_TRAIN | F.IN_VILLAGE | F.WAITING))) return false;
  if (c.held && c.held !== owner) return false;
  if (!c.held) { const p = this.pos(c); c.x = p.x; c.y = p.y; if (c.placeObj) { c.placeObj.occ = Math.max(0, c.placeObj.occ - 1); c.placeObj = null; }
    c.route = null; c.state = 'out'; c.wakeT = -1; this.held.add(c); }
  c.held = owner; return true;
}
release(c) { if (!c || !c.held) return; const w = c.hw; c.held = null; c.hw = null; c.anim = null; this.held.delete(c); if (w && w.cb) w.cb(); this.settle(c, this.T, { x: c.x, y: c.y, bld: null }); }
walk(c, x, y, opts = {}, cb = null) {                       // opts.speed is a multiplier of the citizen's own speed
  if (!c || !c.held) { if (cb) cb(); return; }
  if (c.hw && c.hw.cb) { const f = c.hw.cb; c.hw = null; f(); }
  c.hw = { r: this.route(c.x, c.y, null, x, y, null), t0: this.T, spd: c.speed * (opts.speed || 1) * (c.kind === 'elder' ? 0.8 : 1), cb };
}
placeAt(c, x, y, dir) { if (!c || !c.held) return; c.hw = null; c.x = x; c.y = y; if (c.body) { c.body.x = x; c.body.y = y; if (dir) c.body.dir = DIR_INDEX[dir]; } }   // (L1: not `place`, which is the place lookup)
anim(c, name) { c.anim = name; if (c.body) c.body.play(name, true); }
face(c, dir) { if (c.body) { const d = typeof dir === 'string' ? DIR_INDEX[dir] : null; if (d !== undefined && d !== null) c.body.dir = d; c.body.play(c.body.animName || 'idle', true, true); } }
dress(c, preset, opts = {}) { c.look0 = c.look0 || c.person; c.person = preset || opts.add || opts.remove ? TF.dress(c.look0, preset, opts) : c.look0; if (c.body) c.body.sprite.setPerson(c.person, 'tf:' + c.person.base); }
reserve(id, rect) { if (rect) this.reserved.set(id, rect); else this.reserved.delete(id); }
/** gone for good (moved away, a gentle farewell): never the train, never back after a reload */
retire(c) {
  if (!c || c.gone) return;
  if (c.held) this.release(c);
  if (c.body) { const b = c.body; c.body = null; b.park(); this.free.push(b); }
  if (c.placeObj) { c.placeObj.occ = Math.max(0, c.placeObj.occ - 1); c.placeObj = null; }
  c.gone = true; c.state = 'away'; c.route = null; c.plan = null;
  this.gone.add(c.id); this.nb.gone = Array.from(this.gone).slice(-400);
}
/** a story child's body (pid 'k:<sid>'): a toddler (4–6) or a student (7+), kept across reloads */
addStoryChild(spec, home) {
  const c = this.addCitizen(spec.townKind === 'toddler' ? 'toddler' : 'student', home);
  c.pid = spec.pid; c.storySid = spec.sid; c.age = spec.age;
  (this.nb.story = this.nb.story || []).push([spec.pid, c.kind, c.home, spec.sid, spec.age]);
  return c;
}
```
and in the existing code:
- `KINDS` (`export const KINDS = [...]`): add `'toddler'`; `addCitizen`: `want = kind === 'student' || kind === 'toddler' ? 'child' : …`, `c.person = TF.person(cr, kind === 'student' || kind === 'toddler' ? 'student' : null)`, toddler age 4–6 and a plan of home → playground → home (segment shape as the students').
- `populate(n, extra)`: after the `extra` loop, `for (const e of this.nb.story || []) { const c = this.addCitizen(e[1], e[2]); c.pid = e[0]; c.storySid = e[3]; c.age = e[4]; }`; then `for (const id of this.gone) if (this.citizens[id]) { const c = this.citizens[id]; c.gone = true; c.state = 'away'; }`.
- `pos(c, out)`: first: `if (c.hw) return this.along(c.hw.r, (this.T - c.hw.t0) * c.hw.spd, out);`
- `update(dt, T)`: after the heap loop: `for (const c of this.held) if (c.hw && (T - c.hw.t0) * c.hw.spd >= c.hw.r.len) { const r = c.hw.r, k = r.n - 1, f = c.hw.cb; c.x = r.pts[k * 2]; c.y = r.pts[k * 2 + 1]; c.hw = null; if (f) f(); }`
- `wake(c, T)`: first line `if (c.held || c.gone) return;` · `retier()`: in the citizen loop `if (c.gone) continue; if (c.held) { c.lod = 0; c._d = -1; want.push(c); continue; }`
- `drive(b, dt)`: first lines `if (b.c.held) { const c = b.c, p = this.pos(c); b.x = p.x; b.y = p.y; if (c.hw) { b.face(p.dx, p.dy); b.play('walk'); } else if (b.animName === 'walk') b.play(c.anim || 'idle'); b.sync(dt); return; }`
- `chatter(dt)`: `if (this.nb.storyBusy && this.nb.storyBusy()) return;` first; skip held bodies.
- `go(c, sg, T, from)`: after `takeSpot`, a spot inside a `this.reserved` rect moves 40 px past its nearest edge.
- `census()`: `if (c.gone) continue;` (retired people count nowhere; the conservation test compares `total − gone`).
- whereabouts for the story: `for (const c of this.citizens) if (!c.gone) out.push([c.pid || 't:' + c.id, c.placeObj ? c.placeObj.bld : null, c.act, c.state, c.held === 'gameplay' || (c.flags & F.IN_VILLAGE) ? 'gameplay' : null]);`
- Stroller (`attach(pid, 'stroller')`): a life2 `baby_stroller(_pink)` Character aligned each frame from the manifest's `handlePoint` / `pushOffset` / `depthVsPusher` (as `LabTown.attachStroller`).

`src/systems/Neighbours.js` (TownSim's `nb`): its constructor reads `this.story = Array.isArray(s.town && s.town.story) ?
s.town.story.slice(-160) : []; this.gone = Array.isArray(s.town && s.town.gone) ? s.town.gone.filter(Number.isInteger).slice(-400) : [];`
next to `this.extra`, and `serialize()`'s `town: { seed, open, extra, regulars }` gains `story: (this.story || []).slice(-160),
gone: (this.gone || []).slice(-400)` (plain values; S2 lets them through `sanitizeV4`, which rebuilds `town` today).

**S7 `src/systems/VillageLife.js` + `src/entities/Resident.js` (H9, M11).**
- `hold(r, owner)`: `if (r.isPet || (r.held && r.held !== owner)) return false; if (r.event) r.event.drop(r); r.job = null; r.unsit(); r.stand(); r.held = owner; return true;` · `release(r)`: `r.held = null;`
- `update(dt)`: `if (r.job && !r.held) this.jobUpdate(r, dt);` · `think(dt)`: `if (!r.job && !r.event && !r.held) this.assignJob(r);` · `candidates()`: `if (r.held) continue;`
- walk: `r.goTo(x, y, { speed: r.walkSpeed * (opts.speed || 1), tol: 10 })`, the callback when `r.arrived` (M11; `Resident.goTo` treats `speed` as px/s) · face: `r.faceTo(r.x + DX[dir] * 40, r.y + DY[dir] * 40)` for a direction string, `r.faceTo(p.x, p.y)` for a point · anim `r.act(name, -1)` · placeAt `r.x = x; r.y = y; r.stand();`
- whereabouts (H9): `for (const r of this.residents) if (!r.isPet) out.push(['v:' + r.key, r.area ? 'va:' + r.area.id : null, r.event ? 'bench' : r.job && r.job.kind === 'stay' ? 'bench' : 'home', r.state === 'move' ? 'walk' : 'out', r.held === 'gameplay' ? 'gameplay' : null]);`
- **S8a snowball** (`SnowballEvent` constructor, after `super(...)`): `if (!isReturn) life.gs.events.emit('snowball', 'v:' + thrower.key, 'v:' + target.key);`
- **P11 tap**: `react(r)` first line `this.gs.events.emit('tap', 'v:' + r.key, r.x, r.y);`; `Neighbours.tap(wx, wy)` before the name card: `gs.events.emit('tap', c.pid || 't:' + c.id, w.x, w.y);`

**S7b `src/entities/TownHall.js` (M4).** `stage(on) { const v = !on; this.board.setVisible(v); this.boardPad.setVisible(v);
this.boardLabel.c.setVisible(v); if (this.boardOb) this.boardOb.off = on; this.staged = on; }` and in the board-pad check
of `update`: `if (this.staged) return;` before `this.boardPad.contains(...)`. (The rank ceremony's `venue` is a spot,
not a prop: no change.)

**S7c `src/systems/Bubbles.js` (L11).** In `update(dt)`, `b.c.setScale(sc)` → `b.c.setScale(sc * Math.max(1, 0.9 / (gs.zoomCur || 1)));`
(bubbles keep their phone size when zoomed out; the lab does the same).

**S8 other emits.** `DayClock` day change → `'day'` (the chat bridge). `Civic.settlersArrive(n)` keeps `gs.events.emit('settlers', n)`;
the kit adopts settlers only once P27 gives them bodies (M13).

**S9 `src/scenes/UI.js` (P12, M12) — v4.2's tabbed settings panel.** In `buildPanelContent`, the tab row has two
buttons (`tabBtn(cx - 122, 'set_tab_av', 'av')`, `tabBtn(cx + 122, 'set_tab_play', 'play')`, 236 wide). When the story
runs (`this.gs.story`): `const tab = ['play', 'story'].includes(this.settingsTab) ? this.settingsTab : 'av';`, give
`tabBtn` a width argument and make three 156-wide buttons at `cx - 164 / cx / cx + 164`, the third
`tabBtn(cx + 164, 'set_tab_story', 'story', 156)` (add `set_tab_story: '이야기'` / `'Story'` to `src/data/strings.js`, =
the story's `setTabStory`), and `if (tab === 'story') { this.buildStoryTab(row, Y, add); this.panelFooter(add, cx, cy); return; }`:
```js
buildStoryTab(row, Y, add) {
  const S = Settings.data, cx = this.W / 2, L = this.gs.story && this.gs.story.view;
  const redo = () => { Settings.save(); this.buildPanelContent(false); this.gs.events.emit('settings'); };
  row(Y(0), str(getLang(), 'setLifeEvents'), S.lifeFarewell !== false ? t('on') : t('off'), S.lifeFarewell !== false ? 'green' : 'gray',
    () => { S.lifeFarewell = S.lifeFarewell === false; redo(); }, Assets.pick('ui_icon_memory', 'ui_icon_heart', 'ui_icon_settings'));
  add(this.add.text(cx, Y(0) + 52, str(getLang(), 'setLifeEventsSub'), Object.assign(TXT(20, '#5b6676', '#ffffff', 0, '700'), { align: 'center' })).setOrigin(0.5));
  // the designer's preview menu (이야기 미리보기): one button per MODULE.previews entry, closing the panel first
  ['proposal', 'wedding', 'baby', 'school', 'wish', 'farewell'].forEach((k, i) => add(this.makeButton(cx - 160 + (i % 3) * 160, Y(2) + Math.floor(i / 3) * 84, 150, 66, 'blue',
    str(getLang(), 'preview_' + k), () => { this.closeSettings(); STORY.previews[k](this.gs.story); }, 22)));
}
```
(`str` from `src/story/strings.js` — `setTabStory`, `setLifeEvents(Sub)`, `preview_*`, `previewTitle` are there — and
moved into `src/data/strings.js` by S12. If the designer prefers the version-label 5-tap entry of §5.8 for the
previews, drop the buttons.)

**S10 `src/systems/ResidentChat.js` (P21).** In `ensure()`, after `this.village = v;`: `const st = this.gs.story; if (st
&& !this.bridge) this.bridge = createChatBridge(M.StoryBridge, st, v);` (`createChatBridge` from `../story/chatBridge.js`);
in `syncWorld(first)` once per game day `if (this.bridge) this.bridge.syncWorld();`; when a chat opens with `key`:
`if (this.bridge) this.bridge.syncMemories(key);`. If the story starts after the village exists, do the same from
`Game.startStory()`.

**S11 name card (P34, M10).** `Neighbours.tap` and `VillageLife.react`: when `gs.story && gs.story.view`, open the
story's card instead of the bubble card: `gs.story.view.openPerson(pid)` (the view computes the screen anchor; its 수다
떨기 calls `ports.chat.offer` for villagers or a little talk for townsfolk).

**S12 `src/data/balance.js`, `strings.js` (P20).** `STORY_TUNING` → `BALANCE.v5.story` verbatim (Korean comments); `STR`
of `src/story/strings.js` into the game strings.

**S13 `tools/build/build_artifact.mjs` (P25).** Bundle `src/story/model/worker.js` (esbuild `iife`) as
`story_worker.js`; pass `workerUrl`, `classicWorker: true` (S1); add it to the file gate.

**S14 `tools/story/index.js` (P26).** Re-export from `src/story/engine/index.js` (the 30 engine tests run against the
copy in `tools/test/story_lab/engine/`).

### 11.5 Other modules

- **missions_bank** (`src/missions/**`, read): the contract is now tested against its real `MissionModel` — `story:life`
  `wish` → C7 keyed `'s' + sid`, its stages and expiry; `school` → C4 keyed `'k' + sid` (once, not again from the
  7th birthday); `engaged` / `wedding` / `baby` / `named` / `farewell` as before. Its host's `mission:stage` →
  `mission:done { wish, who, key }` (host.js `case 'mission:stage'`) is what the story consumes; `mission:expire` with
  `key` frees the elder's wish. Nothing to change on the missions side.
- **vehicles_runtime**: `ports.open()` should report `bus` / `wagon` (P4 / P5 happenings, the 썰매버스 wish).
- **v4.2 news / letters** (`docs/v42_plan_tech.md` §8.3): `story:news` / the mirror's `newspaper(lang)` can replace
  `VillageNews` as the source behind `{ papers(), letters(), markRead() }` once both exist.

### 11.6 After wiring, check

`nice -n 15 node --test tools/test/story_lab/engine/*.test.mjs tools/test/story_lab/engine_ext.test.mjs
tools/test/story_lab/host.test.mjs tools/test/story_lab/polish.test.mjs` (67 green); the v4 suites (TownSim census with
`gone`); a v4 / v4.2 save loads with the module off and on; worker blocked → inline; a reload during each promised beat
(wedding morning, last day, farewell morning, the night before a school day) — nothing twice, nothing lost; a story
child and a departed elder after two reloads; in-game captures matching §8 at zoom 0.6–1.2; `perf` in the game (story
main-thread ms per frame ≤ 0.10 avg in worker mode, draw calls unchanged outside set pieces); texture memory during a
wedding at the plaza with townfolk2 paged (≤ 455 MiB).
