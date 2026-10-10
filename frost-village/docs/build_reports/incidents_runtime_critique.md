# incidents_runtime (v8 사건·사고) — adversarial review

This is a reviewer pass on:

- `src/city/incidents/**`
- `tools/test/incidents_lab/**`
- `docs/previews/incidents_lab_*`
- `docs/build_reports/incidents_runtime.md`

I checked it against:

- `docs/v5_v8_plan.md`: §5 (architecture, ports, StageDirector, preview menu), §6.7, §8–§10 and §12
- `docs/기획서_v8_살아있는도시.md` §4–§6
- `docs/CONTRACT_V8.md` and the civic, cityfolk, fx_city and audio6 build reports
- the real code, read on 2026-10-10 while the v4 workflow is running:
  - v4: `src/**`
  - the story engine and host: `src/story/**`
  - missions and bank: `src/missions/**`, `src/bank/**`

I treated the module's files as read-only. Nothing under `src/**`, `assets/**` or `docs/previews/**` was changed. I checked
that afterwards: no module file and no `incidents_lab_*` capture is newer than the build report.

All probes ran from my scratch folder
`/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/later_incidents_runtime/` (`$S` below).
They ran with `nice -n 15` and one Chromium at a time.

I ran the lab from two private copies of the builder's runner:

- `$S/run_lab_orig.mjs` replays the builder's own scenarios.
- `$S/run_lab_copy.mjs` adds my reviewer scenarios `rv_*`.

Both write only to `$S/lab_orig/` and `$S/lab_out/`, never to `docs/previews`.

**Verdict: polish. Fix the critical and the highs before any wiring.**

**What holds up**

- **The pure model is careful.**
  - The director never leaves an incident stuck: stale incidents end as `lost`, and acks are timed out.
  - Same seed and same feed give the same events, commands and save.
  - The sanitizer never throws.
  - The model costs about 0.003–0.01 ms per tick.
- **The lab art direction is charming.** I would show the designer the hoses with mist and steam, the comic dust cloud,
  the wanted board, the demolition with the excavator biting over the fence ring, and the rebuilt house with v4's
  opening stands.
- **The builder's numbers reproduce on a re-run.** All 22 Node tests pass. The lab groups smoke, fire, chase, ruin,
  drill, transient and toggle have 0 errors and 0 placeholders. Draw calls and MiB match the report.

**What is wrong**

- **One wiring line breaks v5.** Wiring the story's real `StageDirector` as §12 I-1 says blocks every wedding,
  ceremony and happening for good after the first staged incident.
- **Several things never show in the game, or show wrong.**
  - Every staged arrest after a tip, an E12 or a surrender plays a fake chase that never ends in an arrest.
  - Most incident sounds and the chase music never load.
  - The fire drill has no fire truck and no hoses.
  - E12 and A21 are offered, but the player can never finish them.
- **The designer preview menu rolls back real progress.** The designer is the one person who will use it.
- **The 안심 bar decides rank 4 by luck.** Switching incidents off is the only lever the player has.

Most fixes are local to the module. A few are exact patches to the Integration section.

| Severity | Count |
|---|---|
| critical | 1 |
| high | 7 |
| medium | 16 |
| low | 12 |

---

## 0. 디자이너용 요약 (쉬운 말)

- **좋은 점**
  - 불 끄는 장면이 정말 귀여워요. 소방관 3명이 호스로 물을 뿌리고 김이 피어올라요.
  - 먼지구름 티격태격, 현상수배 게시판, 굴착기 철거, 꽃 장식대가 있는 새 집도 예뻐요.
  - 사건이 어디서 멈춰 버리는 일은 없었어요. 30일, 40일을 돌려도 그랬어요.
- **꼭 고쳐야 할 점 1: 사건 하나가 지나가면 결혼식이 다시는 화면에 안 나와요.**
  - 게임에 붙이는 설명서대로 연결하면, 사건이 눈앞에서 한 번 벌어진 뒤로 결혼식·청혼·이별·승격식·귀여운 일들이 모두 막혀요.
  - 고치기는 쉬워요. 연결 코드 몇 줄이에요.
- **꼭 고쳐야 할 점 2: 제보로 잡히는 도둑은 "잡히는 장면"이 안 나와요.**
  - 미션 "현상수배범을 찾아라"를 끝내거나 이웃이 제보하면 도둑이 잡혀야 해요.
  - 그런데 화면에서는 도둑이 다시 도망치고 추격 음악이 나와요. 끝내 수갑을 차지 않아요.
- **꼭 고쳐야 할 점 3: 게임 안에서는 사이렌·호스·추격 음악이 안 들려요.**
  - 그림은 불러오는데 소리 파일은 호루라기, 경보 종, 놀람, 박수 4개만 불러와요.
- **꼭 고쳐야 할 점 4: 미션 두 개는 끝낼 방법이 없어요.**
  - "현상수배범을 찾아라"(E12)와 "이삿짐 상자 3개 날라 주기"(A21)가 나와요.
  - 그런데 촌장님이 할 수 있는 행동(누가 범인인지 고르기, 상자 들기)이 아직 없어요. 며칠 뒤 그냥 사라져요.
  - 이사 한 번에 A21이 두 번 떠요.
- **소방 훈련(C14)**
  - 훈련 장면에 소방차와 호스가 안 보여요. 소방관만 눈밭에 서 있어요.
  - 불이 없었는데도 "불 다 껐어요!"라고 말해요.
  - 훈련은 촌장님이 미션을 받는 순간 시작돼요. 그래서 훈련 장소에 가 보면 이미 끝나 있을 때가 많아요.
- **미리보기 메뉴(이야기 미리보기)를 쓰는 동안 생긴 진짜 일이 없던 일이 돼요.**
  - 예를 들어 경찰서 공사가 끝나도 미리보기가 끝나면 "안 지은 것"으로 돌아가요. 돈은 이미 냈어요.
  - 소방 훈련, 불탄 집, 보험금, 이사 미션도 같이 사라져요.
- **안심 막대와 큰 도시 승격**
  - 진짜 이야기 엔진으로 40일씩 3번 돌려 봤어요. 안심 90% 이상인 날은 약 70%뿐이었어요.
  - 도둑이 한두 번만 도망쳐도 열흘 동안 90% 아래로 떨어져요.
  - 촌장님이 할 수 있는 일이 없어요. 경찰서(15,000코인)를 지어도 도둑이 덜 도망치지 않아요.
  - 반대로 "사건·사고 끄기"를 누르면 바로 100%가 돼요. 끄고 승격한 뒤 다시 켜면 돼요.
- **보험**
  - 진짜 엔진에서는 보험이 없어도 거의 모든 집이 "한 단계 더 좋게" 다시 지어져요.
  - 불탄 집 카드는 보험이 없어도 늘 "보험으로 다시 지어요"라고 말해요.
- **아파트**
  - 아파트 한 집에서 불이 나면 아파트 건물 전체(24가구)가 울타리 안에서 철거돼요.
  - 나머지 23가구는 그대로 "살고" 있어요.
- **이사**
  - 정착민 가족 하나가 오면 이삿짐 트럭 일이 두 번 생겨요.
  - "새 가족이 이사 왔어요!"와 "○○네가 이사 왔어요!" 카드도 두 장 떠요.
- **그 밖에**
  - 경찰서 그림 위로 촌장님이 걸어서 지나갈 수 있어요. 벽이 없어요.
  - 설정 화면의 "사건·사고" 줄이 "초기화 / 새로고침" 버튼과 겹쳐요.
  - "소방서 레벨 2! 소방차가 더 빨리 와요"라고 하지만, 실제로는 소방차가 더 빨리 오지 않아요.

---

## 1. What was re-run

| What | Result | Evidence |
|---|---|---|
| `node tools/test/incidents_lab/{incidents,purity,engine}.test.mjs` | 22/22 pass; engine 30 days: 15 incidents (0.50/day), 1 fire | `$S/probes/node_tests.out` |
| Builder lab groups smoke, transient, toggle, fire, chase, ruin, drill (private copy, `--no-gif`) | Reproduce: 0 errors / 0 placeholders. Host ms per frame 0.15 idle / 0.30 fire smoke; draw calls 3 / 5 / 12 / 6; module MiB 31.7 → 96.8 (fire) / 87.4 (chase) | `$S/lab_orig/incidents_lab_numbers.json`, `$S/probes/lab_orig_{1,2}.out`, `$S/lab_orig/*.png` |
| P1 the story's real `StageDirector` as `ports.stage` | One staged incident leaves the **ceremony** slot held: wedding → `{ok:false, why:'busy'}` | `$S/probes/p1_stage.mjs` / `.out` |
| P2 the real engine's rebuild level; insurance across a reload | 15/18 rebuilds level up with no claim; a paid claim is lost by a reload | `$S/probes/p2_insurance.mjs` / `.out` |
| P3 real events during a designer preview | Police station, drill and a ruin are rolled back; nothing reaches the bus; a far real fire is staged | `$S/probes/p3_preview.mjs` / `.out` |
| P4 the 안심 bar with the real engine, 3 seeds × 40 days | ≥ 90 on 69 % of days (min 0); 0.75 rate 73 %; `prior` 2 70 % | `$S/probes/p4_safety.mjs` / `.out` |
| P5 the missions model fed this module's events | A21 ×2 per move-in; E12 spawned, no way to progress | `$S/probes/p5_missions.mjs` / `.out` |
| P6 save slice: worst case, cap, reload, settings | Worst case 2,235 B → 2,023 B after fit; insured set and happy factor lost on reload; settings/slice disagree | `$S/probes/p6_save.mjs` / `.out` |
| P7 one settler family (`settlers` + story's `story:move in`) | Two move-in jobs, two cards | `$S/probes/p7_settlers.mjs` / `.out` |
| Lab `rv_arrest` (theft first staged at `arrest`) | Scene plays a chase: thief `flee`, `music('chase')`, never `caught` | `$S/lab_out/rv_arrest_{a,b}.png`, `$S/probes/lab_rv_arrest.out` |
| Lab `rv_apt` (fire in flat `t_apt1#3` → ruin) | The whole apartment block is fenced and demolished | `$S/lab_out/rv_apt_demolition.png`, `$S/probes/lab_rv_apt_q.out` |
| Lab `rv_qscuffle` (queue → scuffle) | Apology, then the same two fight; the cloud on the asphalt | `$S/lab_out/rv_qscuffle_{a,b}.png` |
| Lab `rv_overlap` (staged chase + fire next door) | Module 31.7 → 117.9 MiB = **+86.2** transient | `$S/probes/lab_rv_overlap_shop.out` |
| Lab `rv_shop` (flower shop lost and rebuilt) | Card "꽃집을 더 멋지게 다시 지었어요!", key stays `flower_shop` | same |
| Lab `rv_chase06` (chase at zoom 0.6) | Readable but small; no bubbles mid-run | `$S/lab_out/rv_chase06_*.png` |

---

## 2. Findings

### CRITICAL

#### C1 — §12 I-1 wires `ports.stage` to the story's `StageDirector`, which takes a different call. After one staged incident, no wedding, ceremony or happening is ever staged again

- **Effect.**
  - After the first incident staged on screen, the story's **ceremony** slot stays taken until the page reloads.
  - Weddings, proposals, farewells, birthday parties, rank ceremonies and district reveals all get `busy`. The story
    retries 40 times and drops them.
  - Every cute happening gets `ceremony` and is cancelled.
- **Cause.**
  - The module calls `S.request('incident', { venue })` and `S.end('incident')` (`host.js:153–158`).
  - The real class is `request(beat, view)` with `beat = { kind, venue, watch }` (`src/story/model/stage.js:31–43`).
  - `SLOT_OF['incident'.kind]` is `undefined`, so the slot is `'ceremony'`. It is filled with `{ kind: undefined }`.
  - `end('incident')` clears the `incident` slot, which was never set.
  - The story host gives up on busy beats after 40 tries (`src/story/host.js:403–404`).
- **The module itself does not notice.** `slotFree()` reads `ceremony()` → kind `undefined` (not wedding/farewell) and
  `busy('incident')` → false, so incidents keep staging.
- **Repro.** Run `node $S/probes/p1_stage.mjs`:
  - After one scuffle: `{"ceremony":{"staged":false,"since":0},…}`.
  - Then `wedding → {"ok":false,"why":"busy"}` and `happening → {"ok":false,"why":"ceremony"}`.
- **Why the tests and the lab hide it.** They use `fakePorts.stage = { free, request(), end() }`, which ignores the arguments.
- **Fix (exact).**
  1. In `host.holdStage`, call the story's own contract:
     - `S.request({ kind: 'incident', venue: this.venuePos(...), T: this.T() }, this.viewWH())`
     - and `S.end('incident')`
     - where `viewWH()` = `{ x, y, w, h }` from `ports.view.rect()`.
     - Or wire `stage` in I-1 through `gs.later.story.api.stage('incident', { venue })` / `endStage('incident')`,
       which already build the view rect.
  2. In `makeEnv().slotFree`, keep `S.busy('incident')` + `S.ceremony()`. Drop the `S.free(slot)` branch, or define it
     in the adapter.
  3. Add a Node test that runs one staged incident against `new StageDirector()` from `src/story/model/stage.js`. It must
     assert `active.ceremony === null` afterwards and a wedding request `ok`.

### HIGH

#### H1 — An arrest first staged at `arrest` plays a never-ending chase: every tip, E12 and surrender arrest, and any chase the chief walks into late

- **Effect.**
  - The camera comes on a theft in its `arrest` phase. That always happens for tip, E12 and surrender arrests, because
    `tipped` is not stageable.
  - The thief then *flees* in loops, the police car comes with its siren, `bgm_chase` starts and the officer chases.
  - Nobody is ever cuffed. The scene fades out in the `station` tail.
  - The E12 payoff ("현상수배범을 찾았어요") is a chase that the thief wins on screen.
- **Cause.** `ChaseScene.start`: `if (ph === 'act') … else if (ph === 'chase') … else this.chase();`
  (`view/ChaseScene.js:28–30`).
  - For `arrest` it calls `chase()`, never `arrest()`.
  - `phase()` is not called for the phase a scene starts in.
- **Repro.** Lab `rv_arrest`: theft with the camera on the village plaza, then look at the fountain once the story is in
  `arrest`.
  - Result: `mid: { chasing: true, caught: false, thiefAnim: 'flee', music: ['chase'] }`.
  - After the story moved to `station`: still `caught: false, thiefAnim: 'flee'`, and no `sfx_cuffs_click`
    (`$S/probes/lab_rv_arrest.out`, `$S/lab_out/rv_arrest_b.png`).
- **Fix.**
  - Start at `arrest` with an arrest beat. Put the thief and the officer at the away spot, then call `arrest()`.
  - Do not call `music('chase')`. No car approach with a siren is needed; a walking officer is enough.
  - For `tipped` → `arrest` (tip, E12, surrender), use a gentle "찾았다!" beat at the culprit's place. The surrender case
    already has the line `shout.surrender`.
  - Add a lab scenario and a unit check: a scene started at `arrest` must reach `caught` and never call
    `music('chase')`.

#### H2 — The designer preview menu swallows real events and rolls back real progress

- **Effect.** While a preview (`이야기 미리보기`, §5.8) runs, the following happens:
  - **The real feed goes into the throwaway model.** `onFeed` keeps feeding real events in, and `endPreview` replaces
    that model with the pre-preview snapshot.
    - A police station, fire level or hydrant **built and paid for** during the preview is forgotten.
    - The site is not re-offered this session (`offerSites` runs once). On the next load the player pays 15,000 coins
      again.
    - A C14 drill completed meanwhile is lost (C14 is `repeat: 'once'`).
    - A real ruin disappears: the house is `ok` again while the story says ruin.
    - Real active incidents, their pending acks and moving jobs are dropped.
  - **Nothing reaches the game bus** (`host.js:149` `if (!this.preview && P.emit)`).
    - The bank never sees `inc:fire { op: 'ruin' }`, so no insurance claim.
    - Missions never see `inc:wanted` / `inc:move`.
    - Rank and story see nothing.
  - **Real incidents are staged wherever they are.** `inRange()` returns `true` for everything during a preview, and
    `far()` returns `false` (`host.js:78–79`). A real fire across town is staged and drawn, its truck and hoses too.
  - **The preview cannot end** while such a real incident holds the scene (`host.js:135` waits for
    `!director.scene`).
  - **Autosaves write the stale snapshot.** `serialize()` returns the snapshot for as long as the preview runs.
- **Repro.** Run `node $S/probes/p3_preview.mjs` (the camera far from everything):
  - During the preview: `7:fire STAGED`; after 120 s the preview is still running.
  - After it ends: `police false | drill false | lotH2 ok`.
  - Save: `"drill":0,"police":0`, buildings empty.
  - Game bus: `(nothing)`.
- **Fix.**
  - Run previews on a **second** `IncidentsModel` (+ its own `ScriptedSource`). Only ids ≥ 90000 go to it.
  - Keep `this.model` live for real feeds, its commands and `P.emit`.
  - Only previews use `inRange = true`.
  - End a preview on its own incident's end, or after 120 s at most.
  - `serialize()` always serializes the real model.
  - Add a test that feeds `built inc_police`, `mission:done C14`, `story:build ruin` and `story:move in` during a preview
    and asserts that they survive and are emitted.

#### H3 — In the game, most incident sounds and the chase music never load

- **Effect.**
  - In the game you only hear the whistle, the alarm bell, the gasp and the small cheer.
  - These never play: both sirens, the hose, steam, the fire bed, cuffs, the comic fight, the excavator, the crunch, the
    construction bed, the moving truck, box drops, the cell door, the newspaper pop, the collapse, and `bgm_chase`.
- **Cause.**
  - v4 loads a late sound only after a system asked for it: `Assets.loadFragment(scene, 'audio6', { audio: [...] })` →
    `lateAudio` (`src/core/Assets.js:269–280`).
  - `INCIDENTS_MODULE.prefetch` asks for `FRAGMENTS.audio6`, which is only 4 keys (`index.js:18`, `:45–49`).
  - The art groups list their sounds (`model/scripts.js` `ART[*].audio`), but nothing reads that field:
    - `artKeys()` returns textures only;
    - the I-4 Residency classes are texture classes.
  - The I-3 `USED_ONLY` merge only *filters* a fragment (`Assets.isUnused`, `Assets.js:506–514`). It never requests
    anything.
  - This is the same class of bug as harbor_runtime critique C2.
- **Why the lab hides it.** The lab's `sound` port only logs keys (`lab.js:187–191`).
- **Fix.**
  - In `prefetch`, ask for all 20 keys of the I-3 list: `assets.fragment('audio6', { audio: [...] })`. That is
    760 KB of ogg in total, measured.
  - Or, when an art group is wanted, ask for `ART[art].audio` through the plan's `ports.assets.fragment` (§5.3).
  - Loops must be loaded before `loop()` is called.
  - Add a lab mode that starts from prefetch only and fails when a played key is not loaded.

#### H4 — E12 and A21 are offered on every wanted poster and every move-in, but can never progress

- **Effect.**
  - "현상수배범을 찾아라" (E12) and "이삿짐 상자 3개 날라 주기" (A21) appear on the chip.
  - Then nothing the chief does moves them. They expire after their deadline or after `eventStale` (3 game days).
- **Cause.**
  - E12's objective is `{ t: 'step', how: 'identify' }` and A21's is `{ how: 'carry', n: 3 }`
    (`src/missions/data/catalog.js:84, 208–209`).
  - The missions report says these steps are **owned by incidents**, through `gs.later.missions.report({ how })`
    (`missions_bank.md` §11 item 4, `src/missions/host.js:293–299`).
  - incidents_runtime never calls `report`, and has no interaction for either step:
    - no "who is it?" choice on the poster;
    - no box the chief can pick up from the moving truck.
  - So the module's own E12 handler (`mission:done E12` → tip) can never fire in the game.
- **Repro.** Run `node $S/probes/p5_missions.mjs` → `E12(key 12, state a)` is created. No code path emits
  `mstep identify` or `report({how:'identify'})`. The same holds for `carry`.
- **Fix.**
  - **E12:** in the big poster (`WantedBoard.open`), offer 2–3 neighbour portraits. Include the culprit (the engine
    knows the witnesses who saw the face). A correct tap calls `missions.report({ how: 'identify', code: 'E12' })`.
  - **A21:** while a move-in set piece runs near the chief, put a `carry` pad at the truck ramp. Each box carried to the
    door reports `{ how: 'carry' }`.
  - Without these, gate E12 and A21 off in the catalog until v8.1.

#### H5 — The building sites the module offers (P29) would cost 100 coins, use the wrong plot size, and vanish on reload. The finished police station has no walls

- **Effect, if P29 is applied the way harbor/missions describe it** (`addModuleSite(id, …)` → `new Site(gs, id, cfg)`):
  - **Prices.** The police station, both fire-station levels and all 13 hydrants cost **100 coins + 6 planks, 8 s**:
    - `Site.start` → `buildCost(bkey)` → `BALANCE.buildings[key]` has no `police_station`, `fire_station` or
      `fire_hydrant` → fallback (`src/entities/Site.js:27–32`).
    - The `cost` and `time` in the module's spec are ignored.
  - **Plot sizes.** Every site is an **M** plot:
    - The police station's footprint is 534 × 267 (civic manifest), larger than v4's XL.
    - The `small: true` hydrants become 272 × 136 staked plots with a build pad and a label on the sidewalk.
  - **Fifteen pads at once.** All 15 are offered the moment the v8 gate opens (`host.offerSites`).
  - **Labels.** They show raw keys: `t('plotOnly_police_station')` does not exist.
  - **Reload.** A half-built site is dropped on reload: `Game.restoreV3` runs before modules exist. This is the root
    cause of harbor critique C1.
  - **No walls.** When finished, `makeBuilding('police_station')` builds nothing (b = null). The module draws the
    station itself, with **no collision and no occluder**. The chief and townsfolk walk through a 534-px building, and
    it hides the chief without x-ray. The module has no `collision` call anywhere.
- **Fix.**
  - P29 must honour `spec.cost`, `spec.time`, `spec.size` (police XL; hydrants a 1-tile pad with no staked plot) and
    `spec.name`.
  - Restore pending module sites (see harbor C1 fix 3).
  - Offer hydrants 3 at a time, nearest the chief, not 13 at once.
  - Add `ports.collision.footprint(def, x, y)` and an occluder registration for the police station when `police`
    turns true.

#### H6 — The fire drill (C14) plays without its art, says the fire is out, and starts before the chief is there

- **Effect.**
  - This is the player's first look at the firefighters (`incidents_lab_drill.png`, reproduced in
    `$S/lab_orig/incidents_lab_drill.png`):
    - **no fire truck and no hoses**;
    - three firefighters and a crowd stand on the snow behind the fire station;
    - one says "불 다 껐어요!" although there was never a fire.
  - In the game the firefighters may not even have their pages.
  - The drill starts on `mission:accept` (at the town hall board). The mission asks the chief to stand 5 s at
    `p:hydrant`. By the time the chief walks there, the 30-s drill is usually over.
- **Cause.**
  - `sceneCmd({ op: 'drill' })` builds a `FireScene` but never wants the `fire` art group (`view/IncidentsView.js:153–157`).
    So `veh_fire_truck`, `fx_hose_*` and the cityfolk `fire`/`rush` pages are not resident. The lab preloads none of
    them for the drill either.
  - The drill line reuses `sOut` (`FireScene.js:194`).
  - It does not open the stage slot. A real incident starting meanwhile `closeCur()`s it abruptly.
  - `p:hydrant` is not defined anywhere in this module's layout.
- **Fix.**
  - `want('fire')` and drop it 15 s after the drill.
  - Open and close the `incident` slot like any scene.
  - Use a drill line ("훈련 끝! 다들 잘했어요!").
  - Start the drill when the chief arrives at the drill spot: on the mission's progress for the stand step, or when
    the chief is within 300 px.
  - Export `DRILL_SPOT` from `layout.js` so missions map `p:hydrant` to it.

#### H7 — The 안심 bar makes rank 4 a matter of luck, and switching incidents off is the only lever

- **Effect.**
  - **Measured with the real engine** (`p4`, 3 seeds × 40 days, plan rates, drill done): the bar is ≥ 90 on **69 %**
    of sampled days, with a minimum of 0. With the report's suggested rate 0.75 it is 73 %; with `safety.prior` 2 it
    is 70 %.
  - **Escaped thefts drive it down.** About 40 % of thefts end BAD (escaped → tipped or surrendered more than a day
    later): 4 of 10 at the plan rate, 8 of 19 at 0.75. One escaped thief in a quiet week drops the bar below 90 for
    10 days.
  - **Nothing the player builds changes it.**
    - The 15,000-coin police station adds no officer to the engine and changes no catch rate. The engine's
      `officersOnDuty` reads roster jobs; `pCatch = 0.5 + 0.12 × officers …` (`incidents.js:236`).
    - Fire levels and hydrants only lower how often fires happen.
  - **The switch is an exploit.** Switching 사건·사고 off makes the bar read 100 at once (`safety.js` `percent`).
    Switch off, take the rank-4 ceremony, switch on.
- **Fix (pick a design, then tune).**
  1. Count only fires lost as ruins and thefts still unsolved at the 10-day mark. A wanted thief who is later tipped
     and arrested counts as resolved.
  2. Let the player raise it:
     - police station built → `story.setRates({ catchBonus })` (an engine knob: +0.15 catch, or 2 more officers in
       the roster);
     - E12 done → resolved immediately.
  3. Freeze the bar while the switch is off: show "꺼짐", keep the last value, and let Rank refuse rank 4 while off.
     Or let rank 4 pass with incidents off, by the designer's choice — but say so in the rank panel.

### MEDIUM

#### M1 — Insurance does not decide the "one level better" rebuild; the claim is lost on reload; the card always mentions insurance

- **The engine levels up anyway.**
  - It sets `I.data = 1` for every ruin with a living owner (`incidents.js:744`), so `build:done` carries `level ≥ 2`
    (`:710–711`).
  - The module levels up on `insured || level > 1` (`model/IncidentsModel.js:98`).
  - Probe: 15 of 18 rebuilds levelled up with **no** claim fed (`$S/probes/p2_insurance.out`).
- **A reload loses the claim.** `insured` is not in the slice: a claim paid at the ruin is gone after a reload
  (`p2b`: final level 0).
- **Nobody insures anything yet.** Nothing calls `bank.insure(id, cost)` today; only the API exists
  (`src/bank/host.js:202`).
- **The card always mentions insurance.** The ruin card says "…보험으로 다시 지어요" for every ruin (`host.js:201`).
- **Fix.**
  - Decide who owns the rule.
    - If insurance decides: ignore `ev.level`, save `insured` (≤ 16 ids) in the slice, and send the engine the outcome
      (`arrange('rebuild', { better })`).
    - If the engine decides: drop the insurance claim from the level rule and from the designer summary.
  - Pick the ruin card text by `bank.insured(id)`.

#### M2 — A fire in one flat demolishes the whole apartment block

- **Effect.**
  - Story homes are `t_apt1#3`. `bldOf()` maps them to the 24-home building `t_apt1`.
  - The whole block becomes a ruin, gets fenced, demolished and rebuilt. The card reads "아파트가 다 탔어요".
  - The other 23 households are not evacuated in the story. They walk into a fenced lot for 1.5+ days.
  - Window and fire incidents can still target those flats: a scorched or `smoking` state on a hidden site.
- **Repro.** Lab `rv_apt` → `buildingState('t_apt1') = demolition`, `$S/lab_out/rv_apt_demolition.png`.
- **Fix.**
  - For multi-home buildings (`#n` ids, homes > 1), cap the visual at `scorched` (window fire, soot, repair).
  - Never ruin the block. Or ask the engine to pick only single-home places for ruins.

#### M3 — A burnt shop keeps trading while its picture is hidden

- **Effect.** `world.hide(id, true)` (I-1) only hides the sprite. A v4 shop or restaurant that is `ruin`, `demolition`
  or `site` for 1.5+ game days keeps its Seller, customer queue, clerk, porters and rent. Customers queue at an
  invisible shop inside a fence ring.
- **Fix.** Define the I-1 port as `world.disable(id, on)` (or extend `hide`) to pause the building's function. That
  means `TownBuilding`/`Shop` customers, the logistics sink, the TownSim home and the work place. Resume at `rebuilt`.

#### M4 — The level-up contract is ambiguous: applied twice, never on load, and a lie for shops

- **Effect.**
  - **Applied twice.** `BuildingFx.enter('rebuilt')` calls `world.upgrade(id, lv)` with the cumulative count
    (`BuildingFx.js:94`). The report defines `upgrade` as "swaps the house key one level". That happens again whenever
    the item is re-entered: after a preview's `view.reset()`, or after a reload inside the 60-s `rebuilt` window. The
    house goes up two levels (the lab's `upgrade(id)` steps once per call).
  - **Never on load.** For `ok` buildings with `lv > 0` it is never applied again on load. Unless v4 saves the new key,
    the house falls back after a reload.
  - **Shops.** Shops have no next key. Lab `rv_shop`: "꽃집을 더 멋지게 다시 지었어요!" and the key stays
    `flower_shop`.
- **Fix.**
  - Make the port absolute and idempotent: `world.setLevel(id, lv)`.
  - Call it on every `sync` for records with `lv > 0`.
  - Use the "더 멋지게" card only when the key actually changed.

#### M5 — One move-in becomes two (settlers) and the missions double up

- **Two jobs, two cards.**
  - v4 emits `settlers { n, house }` (P27), which the module turns into a move-in.
  - story_runtime's `addPeople` then emits `story:move { op: 'in', who, members }` for the same family
    (`src/story/host.js:605–619`). The module fills its home `house_3#1`.
  - The ids differ (`house_3` / `house_3#1`), so two jobs run at the same house, with two cards:
    "새 가족이 이사 왔어요!" and "김하늘네가 이사 왔어요!" (`$S/probes/p7_settlers.out`).
- **Missions double up.** Missions spawn A21/B12 from both `story:move` (key = who/home) and this module's `inc:move`
  (key `mv<n>`), so A21 comes twice per move-in (`p5`).
- **Job ids restart.** Job ids restart at `mv1` on every load.
- **Fix.**
  - Ignore `settlers` when the story module runs (story owns move-ins).
  - Normalize homes with `bldOf` + household.
  - Either stop re-emitting `inc:move in` for story moves, or have missions listen to only one of the two (tell
    missions_bank).
  - Key jobs by `household`.

#### M6 — Two incidents near the view break the +70 MiB transient budget

- **Measured.** Lab `rv_overlap`: a staged chase plus an off-stage fire next door gives module textures
  31.7 → 117.9 MiB (**+86.2**).
- **Cause.** `BuildingFx` wants `fire` for any burning building within 1500 px, whatever is staged. The same holds for
  `rebuild` (no wait unless `fire` is held).
- **Also.** The report's own known issues 4 and 5 add up to +89 MiB.
- **Fix.**
  - One transient group at a time. A burning building outside the staged scene draws only the smoke column (one small
    sheet) until the stage is free.
  - Add a `transientMiB` guard in `IncidentsView.art()` that refuses a second big group.

#### M7 — Draw calls during a fire: +9 over idle

- **Measured.** Lab: idle 3 → fire with hoses 12. The rope jets, the ADD-blend glow and siren sheets, and the many fx
  textures interleaved by depth all break batches.
- **In the game.** v4 views measure 5–10 after culling (limit 12; `v4_buildB.md:14`), so a fire would draw 14–19.
- **Fix.**
  - Put the fire, smoke, mist, steam and hose sheets in one or two atlases (pack fx_city "fire set" pages, P24).
  - Draw the ADD glows in one pass at the end of the scene's depth band.
  - Re-measure in the game's `?debug=1` HUD.

#### M8 — Per-frame cost: 0.15 ms idle, 0.30 ms in a fire (budget 0.10)

- **Measured.** `ModuleHost` measures `host.update`, which includes `view.update` (`host.js:122–137`). Lab re-run:
  0.154 ms idle, 0.304 ms during fire smoke (desktop core). That is ≈ 3–4× more on a phone.
- **Fix.**
  - Throttle `Decor.update` and the `BuildingFx` near-checks to 4 Hz.
  - Skip `station`/`board` work when off screen.
  - Report model and view separately in `perf()`.

#### M9 — The chase music key does not exist, and with v4's Audio the area music never comes back

- **Effect.**
  - The view calls `music('chase')` (`ChaseScene.js:58`); the asset is `bgm_chase`.
  - With today's `Audio.playMusic(key)`, `'chase'` stops the area music and plays nothing.
  - `music(null)` stops everything: `playMusic(null)` (`src/core/Audio.js:79–84`). After the first chase the town is
    silent until something else starts music.
- **Fix.**
  - Pass `'bgm_chase'`.
  - In I-1, map `music(null)` to P15 `setAreaMusic(currentArea)`. Until P15, map it to the area key that was playing
    before.

#### M10 — Off-stage incidents give the player no sign at all; the plan's "보러 가기" card is missing

- **Effect.**
  - Only staged incidents toast. A minor fire, a caught thief or a scuffle beyond 1200 px leaves no card and no toast;
    only a ruin and a wanted poster do.
  - Fires come about once per 20 game days (≈ 3.3 h of play). A player can play v8 for hours and never see the fire
    truck the designer asked for.
  - Plan §5.7 says a beat is staged when near **or when the chief accepts the card's 보러 가기**.
- **Fix.**
  - For fires and thefts out of range, show a story card with 보러 가기. Accepting it moves the camera or uses the bus;
    the director then stages the incident at its current phase (the promote path already exists).

#### M11 — The I-7 settings row covers the reset and reload buttons

- **Where it lands.** In `buildPanelContent`, `Y(i) = cy − 330 + 90·i`. `Y(7) = cy + 300`, and the row's button sits at
  `cx + 130` (76 px tall).
- **What is already there.** "새로고침" is at `(cx + 130, cy + 330)` (80 px tall) and "초기화" at `cx − 130`
  (`src/scenes/UI.js:970–977`). The two buttons overlap.
- **More rows are coming.** v5 adds rows too (생애 이벤트, 미션 알림).
- **Fix.** Re-flow the panel (a smaller row pitch or a second page), then add the row.

#### M12 — The Residency patch (I-4) would evict v4's own construction-site pictures, and some art the module draws outside any group is never requested

- **Shared v4 atlas.**
  - `ART.rebuild.atlases` contains `bld_sites`, the v3/v4 atlas every v4 `Site` uses.
  - I-4's list of keys to refcount across classes names `civ_props`, `veh_police_car`, `cf_crowd_0` and `life2_wedding`,
    but not `bld_sites`.
  - Dropping `incident:rebuild` would evict v4's plot, foundation and scaffold pictures.
- **Art drawn outside any group.**
  - The police-station desk officer and the culprit in the cell are cityfolk presets, but the `station` group has no
    cityfolk pages. The tipped wanted portrait is a cityfolk preset too.
  - In the game these depend on `cf_head_0`/`cf_loco_0` being resident. `FRAGMENTS.cityfolk` lists them, but
    `prefetch` never asks for them.
  - `WantedBoard.portrait()` caches a `null` texture forever when the layers were empty, so the tipped face can stay
    blank.
- **Fix.**
  - Keep `bld_sites` out of `artKeys` (it is base).
  - Prefetch the cityfolk head + loco pages as the module baseline (the report already counts them in the 31.7 MiB).
  - Do not cache a `null` portrait.

#### M13 — No ruin pictures for buildings missing from civic `ruinFor`

- **The fallback has no ruin.** `ruinOf(key)` falls back to `R['*']`. In the civic manifest that is
  `{ note: '…' }` with no `ruin`, `ring` or `scorch` (`view/art.js:140`).
- **Which buildings.** `fireMount` covers harbour, beach and newtown shops (souvenir_shop, harbor_market, pension,
  furniture_workshop …), which are story shops from v6–v8. `ruinFor` covers only v3/v4 keys.
- **What the player sees.** A lost harbour or beach shop stays charred, then vanishes. There is no fence ring, no
  excavator, no rubble and no scorch decal; then a v4 M site.
- **Fix.** Map `'*'` by the building's footprint to `ruin_s` / `ruin_m` / `ruin_l` + ring S/M/L. That is the note's own
  rule.

#### M14 — The police station: no gameplay effect, and the story's thief is somewhere else

- **The thief is in two places.** The engine sends arrested thieves to `W.first('police')`, which in the game is v4's
  역전 파출소 (`police_box`, story places map it to `police`). The module draws them in the **v8** station's cell.
- **The apology has no building.** The theft apology is staged at the v8 station door (`venuePos` → `POLICE`) even
  before the station is built.
- **A false promise.** "경찰관 두 명이 순찰을 돌아요" promises a patrol that exists only if the optional P6 is done.
- **No gameplay effect.** See H7.
- **Fix.**
  - Once built, add `police_station` as a story place (`places.js` kind `police`) and make it `first('police')`.
  - Before it is built, stage the apology at the police box.
  - Make P6 patrol part of I-6, or drop the line.

#### M15 — Fire-station levels promise a faster truck that never comes; the prices are out of line

- **The promise.** "소방서 레벨 {n}! 소방차가 더 빨리 와요" is not true:
  - the engine's travel time uses the story place `fire_station.level`, which the module never raises;
  - the staged truck's speed is fixed.
  - The 기획서 §5 says "소화전 설치 → 빨리 끔"; here hydrants only make fires rarer.
- **The prices.** 12,000 + 20,000 coins buy −10 % each on an already rare event, against 400 coins for −5 % per hydrant.
- **Fix.**
  - Raise the story place level through `arrange('placeLevel', { place: 't_fire', level })`, so the engine's travel is
    ×0.8 and ruins become rarer.
  - Let hydrants within 600 px shorten `fire:spray`.
  - Re-price the levels, or give them something visible (a second truck, a ladder for the cat rescue).

#### M16 — The real bodies of the cast are never held or hidden

- **Effect.**
  - Scenes spawn their own actors for culprit, victim, officers and family, and dress the culprit as a burglar.
  - The resident's real TownSim body keeps its routine (`F_XPLAN` people are moved by the game, `plans.js:234`), and
    nothing holds it.
  - So the same neighbour can be on screen twice. For example, shopping in their own clothes while "they" run from the
    police in stripes, or sit in the cell.
  - Plan §5.6 requires one owner per body (`town.hold` / leases).
- **Status.** Inferred from the code; verify it in the game.
- **Fix.**
  - While a scene is staged, `town.hold(c, 'incident')` and hide the real bodies of the cast's pids. Release them at
    the tail.
  - Or drive the real bodies (`town.walk`) instead of spawning look-alikes.

### LOW

| # | Finding | Evidence | Fix |
|---|---|---|---|
| L1 | `Settings.data.incidents` and the slice's `on` can disagree. The host applies only `settings === false`, so settings ON + slice OFF keeps the module off while the row shows 켜기 | `p6` | Settings is the truth: `if (on !== undefined && on !== model.safety.on) toggle(on)` |
| L2 | The report's "worst case 1,512 bytes" is wrong. With 40-char ids the slice is 2,235 B before `fitIncidents` (2,023 after, sale signs dropped). Harmless | `p6` | Correct the report; fit before the main-save cap test |
| L3 | I-1 says "return when it is consumed" for `tap`, but `onFeed` returns nothing | `host.js:113` | Call `host.view.tap(x, y)` directly in the tap patch |
| L4 | The rebuilt card uses the cumulative `lv > 0`. A house rebuilt better once and later rebuilt the same still says "더 멋지게" | `host.js:203` | Pass the level change of this rebuild |
| L5 | The for-sale sign before a move-out never shows: story_runtime does not forward the engine's `move { op: 'plan' }` (`lifeRules.move`) | `src/story/model/lifeRules.js:211–216` | Forward `plan`, or drop "매물 표지판" from the summary |
| L6 | The window apology "parent" is a random seeded doll of any age (`look({ sid: 700 + … })`). The engine knows the real parent (fact `c`) | `ApologyScene.js:33` | Pass the parent pid in `story:incident` (I-11 step 2) and use `people.look` |
| L7 | Text nits: '물 대포 발사!' (물대포 suggests riot police; use "물 뿌려요!"); "이제 불이 나도 걱정 없어요" (the drill *unlocks* fires); English "The {name} family" with a full name; `wantedItem` unused (the poster never says what was stolen); "보상 50" with a coin icon although the chief gets nothing | `strings.js` | Small string pass |
| L8 | The cell shows tears every 5.5 s. The engine's cell is "cosy, cocoa"; tears fight the "nobody is hurt, all cute" tone | `PoliceStation.js:140` | Cocoa cup / dots / a sheepish face instead of `emote_tear` |
| L9 | With I-11's `tip` patch the engine narrates the chief's E12 as a **surrender**: it empties `crew`, so `theftNext('tipped')` takes the surrender branch with `shout.surrender` | `incidents.js` `tipped` case | Set `I.crew = [chiefProxy]`, or add a `chief` branch with its own line |
| L10 | A wanted theft older than 14 days ends here as `lost` (BAD). The engine's later tip creates a new record that ends `released`, so one theft counts twice in 안심 | `director.js` `STALE.wanted` | Never stale a `wanted` incident while its poster is up |
| L11 | Queue → scuffle: the queue scene plays the cutter's apology, then the same two scuffle. The scuffle stands on the asphalt (`front(p, 120)`), in the traffic lane once vehicles run | `rv_qscuffle_{a,b}.png` | Skip `sorry()` when `outcome === 'scuffle'`; stage scuffles on the pavement (`roads.curb`) |
| L12 | Moving job ids restart at `mv1` on every load; mission keys and `inc:move` ids repeat across sessions | `moving.js` `next = 1` | Key by household + day |

---

## 3. The Integration section (§12) against the real code

| Item | Works as written? | Notes |
|---|---|---|
| I-1 ports, `stage` | **No** | C1 |
| I-1 `sound.music` | No | M9 (`'chase'` vs `bgm_chase`; v4 `playMusic(null)`) |
| I-1 `roads.route` | Yes | `RoadNet.route(from, to, { mode }) → { pts }` exists |
| I-1 `world.hide/tint/upgrade` | Under-specified | M3, M4 |
| I-1 `sites.offer` → P29 | **No** (P29 does not exist; v4 `Site` ignores cost/size) | H5 |
| I-1 `dolls.make` (`DollSprite` wrapped) | Unverified | Watch harbor critique H1 (double `DollPool.add`); needs P5 cityfolk anims (`spray_hose`, `arrested_walk`, `fight`, `flee`, `carry_box`) |
| I-1 feeds: `tap` | Partly | L3 |
| I-2 Save / Settings | Yes, with L1 | |
| I-3 Assets `LATE_FRAGMENTS` / `USED_ONLY` | Anchors exist; **sounds never requested** | H3 |
| I-4 Residency `addClass` | Needs care | M12 (`bld_sites`) |
| I-5 Townfolk per-base `has` | Plausible | Large; shared with logistics |
| I-7 UI settings row | **Overlaps buttons** | M11 |
| I-8 Rank `safety` | Works | H7 (exploit/luck) |
| I-9 world.js / I-10 balance | Yes | The tuning-null fix is real and tested |
| I-11 story host + ext.js | Mostly | `ack` → `M.ACK` and `setRates` → `M.CONFIG` (core calls `configure` + `setRates`) are right; `setToggles` merges keys, so the story's own `settings` re-post does not clear `incidents`; `tip` → surrender (L9); `wanted` forwarding is needed |
| I-12 missions | **No** | H4 (`identify`/`carry` never reported), M5 (double A21/B12), H6 (`p:hydrant` / drill timing) |
| Bank "needs no change" | Claims work | Nothing calls `insure` yet; the level rule ignores insurance (M1) |

---

## 4. Checked and fine

- **The director's dead-end guard.**
  - 30- and 40-day real-engine runs: 0 stuck incidents.
  - Stale → `lost` for every phase.
  - Acks always come: shown, timed out, or off stage.
- **The switch.** It cancels the staged scene, sends `incidents: false` and fire rate 0, keeps moving jobs and reads 100 %.
  Re-checked in the lab (`toggle`).
- **The fire gate.** 0 until the drill is done, and 0 for 4 days after a fire. The happy factor works.
- **The save slice.**
  - The sanitizer survives the module's fuzz and my hand-made worst cases.
  - `fitIncidents` keeps it under 2,048 B.
  - A realistic full slice is 941 B.
- **Determinism and game time.** No `Math.random` or `Date.now` in the module. Scenes run on game time; only the poster
  pop and panel use Phaser tweens.
- **Korean particles.** `이(가)`/`을(를)`/`은(는)`/`와(과)` are correct for the names tested (꽃집, 아파트, 김하늘네).
- **Story protocol.** The story-side protocol for `ack` and rates exists exactly as I-11 describes.

Files: `/home/user/nurient/frost-village/docs/build_reports/incidents_runtime_critique.md` (this file). The probes and
captures are under `$S/probes/`, `$S/lab_out/` and `$S/lab_orig/`.
