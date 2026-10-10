# incidents_runtime (v8 사건·사고) — build report

Module: `src/city/incidents/**` · lab and tests: `tools/test/incidents_lab/**` · captures: `docs/previews/incidents_lab_*`
Plan: `docs/기획서_v8_살아있는도시.md` §4–6, `docs/v5_v8_plan.md` §6.7 (binding numbers) and §10 (patches P1–P34).
Status: standalone and fully tested. **Nothing in the game imports it.** It is wired in only after v4 ships (§12).

> **Before you integrate, decide one thing.** `logistics_runtime` placement A moves the police station to
> (51.17, −26.97), behind the logistics centre. This module now uses that spot by default
> (`layout.js` `POLICE_PLACES.A`). `setPolicePlacement('plan')` switches back to the plan's `c_police` (43.15, −32.17).
> Do this only if the logistics centre does not take that land.

---

## 0. 디자이너용 요약 (쉬운 말)

- **무엇이 생기나요?** 마을에 귀여운 사건이 가끔 일어나요. 아무도 다치지 않아요.
  - **좀도둑**: 가게에서 빵이나 통조림을 들고 도망쳐요. 경찰차가 사이렌을 울리며 오고, 경찰관이 호루라기를 불며 쫓아가요.
    "잡았다!" 하면 수갑 아이콘이 반짝이고, 도둑은 경찰차를 타고 경찰서 **반성실**로 가요. 나중에 가게 주인에게 "정말
    죄송해요" 하고 집에 가요.
  - 도둑을 못 잡으면 광장 **현상수배 게시판**에 얼굴 모를 포스터가 붙어요. 미션 E12 "현상수배범을 찾아라"를 하거나 주민이
    제보하면 얼굴이 나타나고 잡혀요. 게시판을 누르면 큰 포스터가 열려요.
  - **새치기**: 가게 줄에서 새치기했다가 "죄송해요, 뒤로 갈게요" 해요.
  - **눈덩이 유리창**: 아이가 던진 눈덩이가 창문에 철퍽! 아이는 "도망가자!" 하고, 다음 날 아침 엄마(아빠)와 와서 사과해요.
  - **티격태격**: 두 주민이 만화처럼 먼지구름 속에서 투닥거려요. 경찰관이 호루라기를 불면 "펑!" 떨어져서 화해하고 악수해요.
  - **불**: 창문에서 연기 → 가족이 "불이야!" 하며 나오고, 이웃이 화재경보기를 땡땡 울려요 → 소방차가 사이렌을 울리며 와요 →
    소방관 3명이 호스로 물을 뿌리면 불이 작아지고 김이 피어올라요 → 다 끄면 구경하던 주민들이 박수!
  - 늦으면 집이 **다 타요**. 그래도 가족은 모두 무사해요. 그 집은 울타리를 치고 굴착기와 덤프트럭이 철거해요 → 공사장 →
    새 집으로 다시 지어져요. 화재 보험이 있으면 **한 단계 더 좋은 집**이 돼요. 꽃 장식대와 잘린 리본으로 축하해요.
  - **이사**: 이삿짐 트럭이 오고, 일꾼 두 명이 상자를 날라요. 새 가족은 "여기가 우리 새 집이야!", 떠나는 가족은
    "그동안 고마웠어요!" 해요. 매물 / 팔림 표지판과 환영 매트도 있어요. 이사는 사건이 아니라서 사건·사고를 꺼도 계속돼요.
- **마을이 행복하면 사건이 줄어요.** 행복 0%이면 ×1.25, 100%이면 ×0.75예요.
- **불 예방**: 소방서 레벨 2·3 (각각 −10%), 소화전 (하나에 400코인, −5%, 최대 −40%). 불과 불 사이는 적어도 4일이에요.
  소방 훈련 미션 C14를 마치기 전에는 불이 나지 않아요.
- **안심 막대**: 최근 10일 동안 생긴 사건 가운데 하루 안에 해결되었고, 불은 다 타기 전에 꺼진 사건의 비율이에요.
  큰 도시(4단계)가 되려면 90%가 필요해요. 사건·사고를 끄면 100%로 보여요.
- **설정 "사건·사고: 켜기 / 끄기"**: 끄면 도둑·싸움·불이 생기지 않아요 (이사는 계속).
- 숫자는 모두 `src/city/incidents/tuning.js` (한국어 설명이 붙어 있어요)에서 고쳐요. 게임에 붙일 때는 `BALANCE.v8.incidents`로
  옮겨져요.
- 그림은 사건이 눈앞에서 벌어질 때만 불러오고, 끝나고 15초 뒤에 메모리에서 내려요.

---

## 1. What it does

The story engine (`story_runtime`, `src/story/engine/src/incidents.js`) **decides** what happens. It picks incidents
and their cast, phases and outcomes, and it remembers each incident as a story fact for gossip and the newspaper. This
module **shows** them and owns the city services around them:

| Part | Where | What |
|---|---|---|
| Director | `model/director.js` | Tracks every incident, stages at most **one** at a time near the view (`stageRange` 1200 px; unstaged past 1700 px). Acks the engine's waiting phases: staged ones when the view showed them (after `minShow`, else at `ackTimeout`), off-stage ones after the engine's natural length (`offAck`). The scene tail plays the arrest walk, the cheer or the collapse. Stale incidents end as `lost` (never a dead end). |
| Buildings | `model/buildings.js` | Per-building state `ok → smoking → burning → scorched → ok` or `→ ruin → demolition → site → rebuilt(+1 level) → ok`. Insurance (`bank:claim`) makes the rebuilt house one level better. |
| Safety | `model/safety.js` | The 안심 ring (10 days), fire gate (drill done, 4-day gap), the rates pushed to the engine (incidents × happy factor; fires × happy × hydrants × fire-station levels). |
| Wanted board | `model/wanted.js` | 3 poster slots: anonymous silhouette, tipped face, removed at the arrest. |
| Moving | `model/moving.js` | Moving in / out jobs, one per home, queued. For-sale and sold signs, welcome mats. Runs with incidents switched off. |
| Fallback source | `model/source.js` | `ScriptedSource` replays the engine's phase machine (same timers and ack rules) when there is no story engine (lab, previews, tests, and the game before `story_runtime`). |
| View | `view/**` (Phaser) | Fire, chase, scuffle, queue, window, apology and moving scenes. Persistent building FX (fires, soot, ruin, fence ring, excavator + dump truck demolition, site stages, rebuilt opening). Decor (hydrants, alarm posts, signs, mats), the wanted board with doll portraits, and the police-station cutaway with the cell. |
| Host | `host.js` | Ports, feeds, the UI (toasts, story cards), sites (police, fire levels, hydrants), designer previews on a throwaway copy, and the save slice. |

Every incident is a story event: with the story engine running, all incidents come from it (`story:incident`). The
`story:build`, `story:wanted` and `story:move` events drive the buildings, the board and the moves. Acks, rates and
tips go back to the engine.

---

## 2. Files

```
src/city/incidents/
  index.js            INCIDENTS_MODULE (ModuleHost descriptor), FRAGMENTS, ART, artKeys(art, cfPages)
  host.js             IncidentsHost: ports, onFeed, update, flush, ui, sites, previews, api, serialize
  tuning.js           INCIDENTS_TUNING (Korean comments) + incidentsTuning(BALANCE)
  layout.js           police (placements 'A' default / 'plan'), fire station + level pad, wanted board, 13+3 hydrant spots,
                      4 alarm posts, patrol path, frontOf(); setPolicePlacement(name)
  strings.js          ko + en lines (shouts, toasts, cards), Korean particles 이(가)/을(를)/은(는)/와(과), item names
  save.js             INCIDENTS_SLICE { key 'incidents', v1, cap 2048 }, sanitizeIncidents (never throws), fitIncidents
  model/              pure (no Phaser, no DOM; checked by purity.test.mjs)
    IncidentsModel.js director + buildings + safety + wanted + moves; feed(ev, T, env), update, drain, state, serialize
    director.js       staging, acks, tails, stale -> lost, art want/drop commands
    scripts.js        KIND table (stage / ack phases per kind), ART groups (pictures per scene type), GOOD_OUTCOMES
    rules.js          who may be a culprit (never elders, helpers, named villagers; window = kids; scuffles in one age band)
    buildings.js safety.js wanted.js moving.js source.js rng.js time.js
  view/               Phaser 3.90
    IncidentsView.js  orchestrator (scenes, art refcount, set pieces, tap, info)
    Scene.js          street geometry (FRONT / AXIS), onlookers, uniforms, game-time timers and tweens, the exit
    FireScene.js ChaseScene.js ScuffleScene.js QueueScene.js WindowScene.js ApologyScene.js MovingScene.js
    BuildingFx.js Decor.js WantedBoard.js PoliceStation.js Vehicle.js Cast.js art.js
tools/test/incidents_lab/
  incidents.test.mjs  17 tests   engine.test.mjs  2 tests (real StoryEngine)   purity.test.mjs  3 tests
  fake_env.mjs        roster / env / ports fakes
  lab.html lab.js lab_world.js lab_dolls.js lab_art.js   Phaser lab (stand-in world, real art)
  run_lab.mjs         Playwright runner (scenario groups, < 2 min each)
```

About 4,100 lines of module code and 1,900 lines of lab and tests.

---

## 3. Numbers (`tuning.js` → `BALANCE.v8.incidents`)

| Key | Value | Note |
|---|---|---|
| `incidentRate` / `fireRate` | 0.4 / 0.05 | Pushed to the engine (`setRates`), × happy factor (0 % → ×1.25, 100 % → ×0.75) |
| `fireGapDays` | 4 | Fire rate 0 for 4 days after a fire, and until the C14 drill is done (`drillFirst`) |
| Hydrant | 400 coins, −5 % each, ≤ −40 %, ≤ 24 | 13 town + 3 village spots offered as sites |
| Fire station | lv 2: 12000 + 40 planks + 30 ingots / 14 s; lv 3: 20000 + 60 + 40 / 18 s; −10 % each | Pad at `t_fire` front (49.9, −12.4) |
| Police | 15000 + 60 planks + 30 ingots / 16 s, 2 officers | Site `inc_police` |
| Stage | `stageRange` 1200, `unstageRange` 1700 px | |
| Acks | `ackTimeout` chase 45 / dispatch 40 / spray 45 / fight 25 s; `offAck` 27 / 12 / 20 / 10 s; `minShow` 12 / 3 / 10 / 6 s | The story never waits for the view |
| Tails | theft 11 (was 9: the arrest walk needs it), queue 5, window 6, scuffle 6, fire 10, drill 6, apology 7 s | |
| Memory | `transientMiB` 70, `transientMaxS` 90, `releaseAfter` 15 s | |
| Safety | 10 days, `resolveWithin` 600 s, **`prior` 0** | New knob, see §11.3 |
| Misc | `ruinCoolS` 120, `rebuiltShowS` 60, moving (unload 6, 4 boxes, …), crowd 3–6 | |

`incidentsTuning(BALANCE)` merges `BALANCE.v8.incidents` one level deep. **Bug fixed this session:** without a `v8`
block, every number used to come back `null`. That would have staged nothing in the game. A regression test now covers it.

---

## 4. Architecture

```
story engine (worker) --story:incident/build/wanted/move--> story host --ports.emit--> IncidentsHost.onFeed
        ^  ack(id) · setRates · toggles · arrange('tip')                                   |
        +----------------------------------------------------- host.command <------ model.drain().cmds
                                                                                            |
game feeds (day, happy, built, tap, mission:*, bank:claim, settings, settlers) -----------> model.feed
model events (inc:*, stage:*) --> host.ui (toasts / cards) + view.onModel + ports.emit (missions, bank, rank, story)
model scene cmds (start / phase / end / drill) + art cmds (want / drop) --> IncidentsView
```

- **Determinism.** Every random choice uses seeded `Rng` streams (model) or `rng(seed)` (view). Same seed and feed give
  the same events, commands and save (tested).
- **Off-stage acks** follow the engine's natural phase lengths, because the engine's `ack` moves a phase on at once.
- **Previews** (§5.8 designer menu) run on a throwaway snapshot with ids ≥ 90000. Nothing reaches the game feed or the
  save. The model is restored afterwards (tested).
- **View timing.** Scene animation runs on game time: timers and `Scene.tween`, not Phaser tweens, which run on the wall clock.
  Only the UI poster pop and panel use Phaser tweens.
- **Art residency.** The director asks for art groups (`ART` in `scripts.js`) per staged scene type. `BuildingFx`,
  `PoliceStation` and moving add their own refcounted wants. The view drops a group only when no one holds it. A
  building's state change keeps its group (no evict + reload), and a ruin waits for the fire group to leave before it
  loads the rebuild group (§8).

### Ports (what the game provides; all optional, missing ones degrade)

| Port | Used for |
|---|---|
| `world.scene` | The world `Phaser.Scene` |
| `world.building(id)` → `{ id, key, x, y }` · `world.place(id)` · `world.hide(id, on)` · `world.tint(id, color \| null)` · `world.upgrade(id, lv)` · `world.name(id, lang)` · `world.storyPlaces()` | Buildings and places |
| `view.rect()` | Camera world view (stage range, near checks, off-screen truck starts) |
| `clock.T()` · `lang()` | Game seconds (day = 600) · 'ko' / 'en' |
| `people.look(pid)` · `person(ref)` → `{ pid, sid, age, home, role, named }` · `name(pid, lang)` · `roster()` | Cast looks, culprit rules, family names, move homes |
| `dolls.make(look)` → rig; optional `dolls.portrait(look, px)` | Rig contract: `play(anim, dir)`, `setFace`, `place(x, y, depth, alpha)`, `visible(on)`, `update(ms)`, `anim`, `frame`, `headTop`, `groundSpeed(anim, dir)`, `nozzle(dir, i)`, `layers()`, `release()` |
| `say(who, text, emote, dur)` · `emote(who, key, dur)` · `clearSay(who)` | Bubbles + VillageVoice (`who` = `{ alive, x, y, headTop, sprite }`) |
| `sound.play / at / loop(key, x, y, { volume, follow }) / music(key \| null)` | sfx, positional loops (sirens, hose, fire), `bgm_chase` |
| `fx.burst(kind, x, y, n)` | Confetti, hearts, coins (sheets used without it) |
| `roads.route(a, b, 'drive' \| 'walk')` → pts | Truck routes from the station, long walks |
| `residency.want(cls)` / `drop(cls)` | `incident:<art>` classes (P4); call `host.view.artReady(art)` when they arrive |
| `stage.free(slot)` or StageDirector `busy(slot)` + `ceremony()` · `request(slot, { venue })` · `end(slot)` | One incident slot; never during a wedding or farewell |
| `sites.offer(spec)` | Police, fire levels, hydrants (P29) |
| `ui.toast(text, ms)` · `ui.card(spec)` · `ui.banner(t, sub)` · `ui.scene()` | Toasts, story cards (P12), the big poster |
| `settings.get('incidents')` | The switch at start |
| `story.ack(id)` · `story.setRates(r)` · `story.toggles(t)` · `story.arrange(op, data)` | Back to the engine (§12 I-11) |
| `emit(ev)` | `gs.events.emit(ev.t, ev)` |

---

## 5. Public API (`gs.later.incidents` = `host.api`)

| Call | Returns |
|---|---|
| `active()` | `[{ id, kind, phase, staged, place, building }]` |
| `wanted()` | `[{ slot, inc, pid, reward, item, day, anon }]` |
| `buildingState(id)` | `{ state: 'ok'\|'smoking'\|'burning'\|'scorched'\|'ruin'\|'demolition'\|'site'\|'rebuilt', level, since }` |
| `safety()` | 0–100 (rank 4 needs 90; 100 when switched off) |
| `toggle(on)` / `on()` | Switch (cancels a staged scene; moving keeps running) / state |
| `rates()` | `{ incidents, incidentRate, fireRate }` currently pushed |
| `preview(kind, opts)` | Plays one incident on a throwaway copy (designer menu) |
| `state()` · `perf()` · `stats()` · `itemName(item)` | Debugging and lab |

Host: `onFeed(ev)`, `update(dt)`, `serialize()`, `destroy()`, `view.tap(x, y)` (wanted board → big poster; police
station → cutaway).

### Events out (`ports.emit`)

| Event | Payload | Consumers |
|---|---|---|
| `inc:stage` | `{ id, kind, phase, place, building, promoted }` | Story camera / log |
| `inc:phase` | `{ id, kind, phase, prev, staged, place, building, outcome }` | Story memory |
| `inc:end` | `{ id, kind, outcome, ok, staged, everStaged, secs }` | Story, stats |
| `inc:fire` | `{ id, op, state, building, bld, level? }`, `op` ∈ smoking, burning, scorched, ruin, demolition, site, rebuilt, ok, repaired | **bank** (`op: 'ruin'` → claim), rank |
| `inc:wanted` | `{ op: 'post'\|'remove'\|'tip', id, slot, pid, reward, item, anon }` | **missions** (`post` → E12) |
| `inc:move` | `{ op: 'in'\|'out'\|'plan'\|'done', id, home, household, members, membersPid, who, whoPid }` | **missions** (`in` → A21, B12) |
| `inc:police` · `inc:fireLevel` · `inc:hydrant` · `inc:drill` · `inc:toggle` | Open / level / count / C14 done / switch | UI, rank, missions |
| `stage:open` / `stage:close` | `{ slot: 'incident', kind, id, why }` | StageDirector |

### Events in (`host.onFeed`)

`story:incident`, `story:build`, `story:wanted`, `story:move` (a missing `home` is filled from `people.person(whoPid).home`),
`settlers { n, house }`, `day`, `happy { h }`, `built { siteId, x, y }` (inc_police, inc_fire2/3, inc_hydrant_n),
`mission:accept { code: 'C14', at }` (the drill scene), `mission:done { code: 'C14' | 'E12', key }` (E12 without `key` tips the
oldest anonymous poster), `bank:claim { id }`, `settings { incidents }`, `veh:dispatch`, `tap { x, y }`.

---

## 6. Save slice (`incidents`, v1, cap 2 KB)

```
{ v: 1, on, buildings: [[id, state, t, lv?]] ≤ 16, wanted: [[slot, inc, pid, reward, item, day, anon]] ≤ 3,
  hydrants: [[x, y]] ≤ 24, fireLevel 1–3, safety: [[day, ok, n]] ≤ 10, drill, lastFire?, police, sale: [home] ≤ 8 }
```

Worst case 1,512 bytes; a typical slice is about 200 bytes. `sanitizeIncidents` never throws and is idempotent (fuzz-tested
200×). `fitIncidents` trims to the cap. Staged scenes, active incidents and moving trucks are not saved. On load they resolve
off stage, because the engine keeps its own incidents in its side record.

---

## 7. Behaviour checked in the lab (look at the captures)

- **Fire** (`fire_*`, `fire.gif`). The window fire and the family "불이야!" come out. A neighbour rings the alarm post
  ("땡땡땡!"), and onlookers gather on the next door's pavement. The truck arrives from the station with its siren. Three
  firefighters (cityfolk `firefighter`, khaki and red helmets) run to a fan of spots. The hoses are rope jets from each
  nozzle, with mist, steam and shrinking flames. Then "불 다 껐어요!", stars, applause and "고마워요!", and the truck leaves.
  At zoom 0.6 and 1.2 it stays readable.
- **Ruin** (`ruin_family`, `ruin`, `demolition*`, `site`, `rebuilt`). The family is safe ("우리 가족 다 괜찮아요"). The house
  stays charred while the crew is on stage, then the ruin and smoke appear behind the insurance sign. Next come the fence
  ring, the excavator dig over the fence, the dump truck loading, rubble, the site with two builders, and finally
  `house_a` → `house_b` with v4's opening look (two flower stands and a cut ribbon).
- **Chase** (`chase_*`, `chase.gif`). "앗, 내 통조림!" The thief flees to the fountain. The police car comes up the street
  from behind and the officer chases on foot. "잡았다!" and the cuffs pop. The car drives up to the pair, they get in, and it
  leaves. In the cell the culprit sits behind bars with tears and dots. The apology ("반성 많이 했어요…") happens at the
  station door.
- **Wanted** (`wanted_*`). The board has 3 posters with a neighbour reading. A tap opens the big poster (68 % of the phone
  width): "누굴까요?" with a silhouette, or the doll portrait once tipped.
- **Scuffle / queue / window / moving / drill / english / night / desktop.** All captured. Desktop is the portrait column,
  as in v4.

---

## 8. Measured numbers

**Logic per tick** (budget ≤ 0.10 ms)

| Where | avg | p99 / p95 | max |
|---|---|---|---|
| Node, busy town (12 incidents + 4 moves live), `incidents.test.mjs` | **0.0024 ms** | p99 0.0085 | 0.60 |
| Node, real StoryEngine 12 days (52 incidents, all kinds), our side per engine step | 0.0030 ms | — | — |
| Browser lab (model only), all scenarios | 0.0014–0.0101 ms | p95 ≤ 0.1 (timer resolution) | single spikes 2–6 ms in 3 long runs (GC; not in Node) |

**Per frame in the lab** (phone 390×844 DPR 3, fixed 60 Hz step)

| Scene | host total ms | view ms | draw calls | world objects | dolls | module MiB |
|---|---|---|---|---|---|---|
| Idle town (`smoke`) | 0.11 | 0.10 | 3 | 126 | 1 | 31.7 |
| Fire, smoke phase | 0.29 | 0.27 | 5 | 231 | 7 | 96.8 |
| Fire, 3 hoses (`fire_spray`) | 0.19 | 0.18 | 12 | 337 | 11 | 96.8 |
| Fire at zoom 0.6 / 1.2 | 0.16 / 0.16 | 0.15 / 0.15 | 12 / 12 | 341 / 330 | 11 / 10 | 96.8 / 90.8 |
| Chase | 0.19 | 0.16 | 6 | 243 | 7 | 87.4 |
| Scuffle / queue / window | 0.17 / 0.15 / 0.12 | 0.15 / 0.14 / 0.10 | 3 / 4 / 3 | 219 / 207 / 171 | 6 / 6 / 4 | 87.4 / 43.4 / 43.4 |
| Ruin / demolition / rebuilt | 0.12 / 0.09 / 0.02 | 0.10 / 0.08 / 0.04 | 3 / 4 / 4 | 304 / 318 / 309 | 0 / 1 / 0 | 77.7 / 77.7 / 25.7 |
| Station cutaway / moving / desktop fire | 0.13 / 0.09 / 0.18 | 0.11 / 0.08 / 0.17 | 4 / 5 / 12 | 268 / 269 / 335 | 2 / 7 / 11 | 87.4 / 55.8 / 96.8 |

The lab's whole texture set is 354–432 MiB (the lab loads raw atlases, not the game's packed pages). The module baseline is
31.7 MiB: cityfolk head + loco 16.8 (shared with logistics), `civ_police` 5.1, the station's police car 6.0, `civ_props`
1.1, `ui4_icons` 1.0, and small fx sheets.

**Transients** (budget ≤ +70 MiB, ≤ 90 s). Measured with `L.texMiB()`, art log in `incidents_lab_numbers.json`:

| Group | + MiB | held | Note |
|---|---|---|---|
| `fire` | **+65.1** | 54 s (stage → +15 s) | Was +72.2. The elder-only `cf_rush_2` (7.2 MiB) is now skipped (`cfSkip`), so elders hurry at a walk |
| `crime` | +55.7 | 47 s | rush ×3, crowd, scuffle, police car, fight clouds |
| `rebuild` | +46.0 | While a ruin / demolition / site is within 1500 px of the view | See §11.4 |
| `moving` | +24.1 | Set piece + 15 s | Skipped while an incident group is in |
| `crowd` / `station` / `opening` | +0–11.7 / +6.0 / +1.6 | — | |

A fire that ends as a ruin never holds `fire` and `rebuild` together: the charred house stands in until `fire` is out.
After every scene the module texture set returns to the 31.7 MiB baseline, and nothing is freed while it is still shown
(the lab flags any freed texture still in use as an error; none were flagged).

**Rates with the real engine** (`engine.test.mjs`, 220 people). 30 game days gave 15 incidents (**0.50/day**) and 1 fire,
with safety at 100 %. Switching off stops new incidents. The stress run had all 5 kinds: 23 staged, 54/54 acks, 0 timeouts,
9 ruins. The fallback planner matches the plan's ≈ 0.95/day.

**Sizes.** The module is about 4.1 k lines. Previews are 17 MB (43 files, PNGs quantized to 780 px wide).

---

## 9. Lab and captures

Run one group at a time, each under 2 minutes:

```
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers nice -n 15 node tools/test/incidents_lab/run_lab.mjs --only=<group>
groups: smoke · fire · ruin · chase · wanted,station · scuffle,queue,window · moving · zoom,desktop,english,night · transient,drill,toggle
```

The lab (`tools/test/incidents_lab/lab.html`) uses Phaser 3.90 with the real finished art. The stand-in world is v4's town
buildings, the H/B lots, a cottage lane by the plaza and v4 roads (RoadNet + RoadPaint). The real `Bubbles`, cityfolk
`CityfolkSprite` dolls and `LabArt` residency load and free the art groups like Residency classes do. Incidents come from the
module's `ScriptedSource`.

Captures in `docs/previews/`: `incidents_lab_` + `smoke`, `fire_smoke`, `fire_truck`, `fire_spray`, `fire_out`,
`fire.gif`, `ruin_family`, `ruin`, `demolition`, `demolition.gif`, `demolition_rubble`, `site`, `rebuilt`, `chase_act`,
`chase_run`, `chase_arrest`, `chase_arrest2`, `chase.gif`, `wanted_board`, `wanted_poster`, `wanted_poster_face`,
`station_cell`, `station_apology`, `scuffle_cloud`, `scuffle_separate`, `scuffle_shake`, `scuffle.gif`, `queue_argue`,
`queue_sorry`, `window_throw`, `window_who`, `window_apology`, `moving_out`, `moving_in`, `moving_in_welcome`,
`moving.gif`, `zoom06`, `zoom12`, `desktop`, `english`, `night`, `drill`, plus `numbers.json` (every number in §8,
event logs and toasts).

**Fixed after looking at the captures:**
- The crowd was hidden behind buildings across the street. It now stands on the next door's pavement.
- Firefighters and officers wore residents' clothes. Duty roles now always wear their uniform preset.
- The chase car met the thief head-on and the stage closed before the arrest walk. The car now comes from behind and picks
  the pair up, and the tail is not unstaged by the station venue.
- Wanted portraits showed only a hat. The framing is fixed, they are 128 px, and the chase, cell and poster share one look.
- The big poster was small.
- The ruin showed nothing while its art loaded. The charred house now stands in.
- The rebuilt house had the wedding garland. It now has v4's opening stands and ribbon.
- The station car disappeared when its atlas was freed. A `station` group now holds it.
- Stale animations crashed after an atlas reload. The lab now drops the anims with their textures, like `Residency.evictArea`.
- Scene tweens ran on the wall clock. They now run on game time.

---

## 10. Tests

| File | What |
|---|---|
| `incidents.test.mjs` (17) | One staged at a time; acks (shown, timeout, off); no dead ends in 30 days; stale → lost; ruin → rebuilt +1 with insurance, same level without; switch; culprit rules; fire drill, gap, hydrants, levels and happy; fallback rates; moving households; wanted board; determinism; save round trip, 2 KB worst case and fuzz; perf; headless host (api, sites, acks, rates, cards, preview restore, home-less story move, fallback); strings and particles; tuning merge without a v8 block |
| `engine.test.mjs` (2) | Real `StoryEngine` + model: stress run with every kind and phase, and game rates over 30 days with the switch |
| `purity.test.mjs` (3) | Model and data are pure (no Phaser, `window`, `document` or storage); host imports; nothing outside the module imports it |

`node tools/test/incidents_lab/<file>`: all 22 pass.

---

## 11. Known issues

1. **Engine rate.** The real engine played 0.50 incidents/day at `incidentRate` 0.4, against the plan's ≈ 0.95/day for
   220 people (the engine's mood factor and start conditions). Re-measure in the game, then raise `incidentRate` to about
   0.75 if needed.
2. **Fire gap.** The gap and the drill gate work through `setRates({ fireRate: 0 })`. A fire the engine had already
   scheduled before the gap could still start (none did in 30 days). Exact enforcement needs an engine hook
   (`cfg.fireGapDays`).
3. **안심 after one ruin.** With the plan's formula, one ruin in a quiet 10 days reads 0 %. The `safety.prior` knob
   (default 0, as in the plan) adds virtual good incidents: at 2, one bad incident out of one reads 67 %. Designer decision.
4. **Rebuild art is place-bound.** +46 MiB is held while a ruin, demolition or site is within 1500 px of the view, which can
   be longer than 90 s (a rebuild takes about 1.5 game days). It drops when the camera leaves. To hold the letter of the
   budget, the static ruin and site could come from the packed pages of the civic area (P24).
5. **Set-piece overlap.** A moving set piece does not start while an incident group is resident. If an incident is staged
   during a move, the truck leaves, but the moving group stays up to `releaseAfter` (15 s), giving up to about +89 MiB.
6. **Curbs.** The lab parks trucks with `front()` street geometry. Its RoadNet has few drive lanes, so the moving truck
   sometimes stands on the snow by the road. In the game, prefer `roads.curb(p)` (§12 I-1).
7. **Cell readability.** At zoom < 1.0 the bars hide most of the culprit. Tears and dots emotes every 5.5 s help. The
   captures use zoom 1.2.
8. **Browser spikes.** Three long lab runs had one model tick of 2–6 ms (GC or JIT; Node max 0.6 ms).
9. **Without the story engine** (fallback), incidents are not remembered in story memory. With the story running, every
   incident is an engine fact.
10. **E12 key.** Missions' `mission:done` does not carry the event key yet (§12 I-12). Until then the oldest anonymous poster
    is tipped.
11. **Lab only.** The night look is the lab's own approximation. The desktop shot is the portrait column (like v4). The lab
    plaza floor is a stand-in.

---

## 12. Integration (file-by-file, exact hooks into the current v4 code)

### Ground rules

- Anchors are given **by content**, not line numbers. The v4 workflow still owns and edits `src/**` existing files,
  `index.html`, `tools/build/**`, existing `tools/test/**` and `docs/v4*`. In this session these files were still changing
  under it: `Game.js`, `UI.js`, `Save.js`, `Assets.js`, `Residency.js`, `world.js`, `balance.js`, `Townfolk.js`,
  `TownSim.js` and `Rank.js`. Re-check every anchor before applying.
- Patch numbers follow `docs/v5_v8_plan.md` §10. Every hook is guarded by `gs.later && gs.later.incidents`, so v4 to v7
  behave exactly as today.
- Order: **I-10 (P20) → I-9 (P19) → I-3 (P3) → I-5 (P5) → I-4 (P4) → I-2 (P2) → I-1 (P1 / P29) → I-11 story → I-12 missions →
  I-7 (P12) → I-8 (P17) → I-6 (P6) → I-13 (P22, P24, P15)**.
- `logistics_runtime` §11 P19b (police placement A) **is already applied** in `src/city/incidents/layout.js`.

### I-1 (P1 + P29) `src/scenes/Game.js` — module, ports, feeds

1. Register `INCIDENTS_MODULE` from `src/city/incidents/index.js` in `LATER_MODULES` (the kit's `ModuleHost`). Its gate is
   `gs.later.logistics` or the `newtown` region opening (v8). Its `needs` are optional: story, vehicles, missions, bank,
   logistics. It is created with `create(ports, saved)`; call `host.update(dt)` every frame after `this.v4.update(dt)` and
   use `host.serialize()` as the `incidents` slice.
2. **Ports** (pass to `create`), using the names in §4:
   - `world`: `scene: this`, plus `building(id)`, `place(id)`, `hide(id, on)`, `tint(id, c)`, `upgrade(id, lv)`,
     `name(id, lang)` and `storyPlaces()` on top of the town buildings (`gs.town` / `Civic` / `Growth` shops and houses).
     `upgrade` swaps the house key one level (`house_a → house_b → house_c`, townhouse a → b).
   - `view.rect()`: `this.cameras.main.worldView`. `clock.T()`: `DayClock` game seconds. `lang()`: `getLang()`.
   - `people`: the story registry and `TownSim` (`look(pid)`, `person(ref)` with `home`, `name(pid, lang)`, `roster()`).
   - `dolls.make(look)`: the v4 `DollSprite` pool wrapped to the rig contract in §4. `look = { preset, seed, pid, age }`;
     `preset` is a cityfolk preset (`firefighter`, `police_officer`, `burglar`, `mover`, `construction_worker`,
     `demolition_worker`). It needs `layers()` (portraits), `nozzle(dir, i)` (`tf.nozzlePoint`) and
     `groundSpeed(anim, dir)`.
   - `say / emote / clearSay`: `this.life.bubbles.chat / emote / clear` (VillageLife's `Bubbles`, + `gs.voice` speak).
   - `sound`: `Audio.play`, `gs.sfxAt`, a positional loop helper (`{ stop, volume }`), `Audio.playMusic` (P15).
   - `fx.burst`: `this.effects.burst`. `roads.route(a, b, mode)`: `this.v4.roadNet.route(a, b, { mode }).pts`. Optional
     `roads.curb(p)`: the nearest drive-lane point for parking (Known issue 6).
   - `residency`: I-4. `stage`: the story host's `StageDirector` (`busy`, `ceremony`, `request`, `end`), or a one-slot
     stand-in before `story_runtime`.
   - `sites.offer(spec)`: `addModuleSite(spec.id, …)` (P29). Completion emits `built { siteId, x, y }`.
   - `ui`: `toast`, `card` (P12), `banner`, `scene: () => this.scene.get('UI')`. `settings.get(k)`: `Settings.data[k]`.
   - `story`: the story host api (I-11). `emit: (ev) => this.events.emit(ev.t, ev)`.
3. **Feeds** into `host.onFeed`:
   - `day` (P10)
   - `happy { h: this.v4.growth.happiness() }` (once a game hour)
   - `built` (module sites)
   - `settlers { n, house }` (P27, `Civic.settlersArrive`)
   - `tap { x, y }` (world tap, before v4's own tap handling: return when it is consumed)
   - from the event bus: `story:incident`, `story:build`, `story:wanted`, `story:move`, `mission:accept`,
     `mission:done`, `bank:claim`, `veh:dispatch`
   - `settings { incidents }` on change
4. **Art ready:** when Residency finishes loading an `incident:<art>` class, call `gs.later.incidents.host.view.artReady(art)`.

### I-2 (P2) `src/core/Save.js`

- `Settings.data.incidents: true` (validated like `daynight`).
- In `sanitizeSave`, the later-slices loop gets `sanitizeIncidents` from `src/city/incidents/save.js` (key `incidents`,
  cap 2048).

### I-3 (P3) `src/core/Assets.js`

- Anchor `export const LATE_FRAGMENTS = ['town', 'townfolk', 'roads', 'audio3', 'ui3', 'life2', 'voice', 'audio4', 'title', 'title_bake'];`.
  Append `'civic', 'fx_city', 'audio6', 'cityfolk', 'vehicles', 'logistics'` (union with the other modules' patches).
  `life2` is already there (`life2_wedding` for the opening stands).
- Anchor `export const USED_ONLY = { "audio5": …`. Merge in
  `"audio6": ["sfx_police_whistle", "sfx_siren_police", "sfx_siren_fire", "sfx_fire_alarm_bell", "sfx_hose_spray", "sfx_steam_hiss", "sfx_crowd_gasp", "sfx_crowd_cheer_small", "sfx_cuffs_click", "sfx_comic_fight", "sfx_collapse_soft", "sfx_excavator", "sfx_demolish_crunch", "sfx_moving_truck", "sfx_box_drop", "sfx_vault_door", "sfx_newspaper", "amb_fire_big", "amb_construction", "bgm_chase"]`,
  taking the union with logistics.

### I-4 (P4) `src/core/Residency.js` — `incident:*` classes

- Add `addClass(name, { keys, ttl })`. Per art group: `keys = artKeys(art, Assets.m … cityfolk.cfPages)` from `index.js`
  (it applies `cfSkip`), with `ttl` 0, because the module itself delays drops by `releaseAfter`. Classes are `crime`,
  `crowd`, `fire`, `rebuild`, `moving`, `station` and `opening`.
- `ports.residency.want('incident:fire')` → `this.demand(keys)` and pin. `drop` → unpin, then evict through the
  **`evictArea` path** (it collects anims whose frames use those textures, `dropAnim`s them, removes the textures, sets
  `Assets.held`). The module never drops a group while a sprite of it is shown, but shared keys (`civ_props`,
  `veh_police_car`, `cf_crowd_0`, `life2_wedding`) must be refcounted across classes and other modules (logistics also
  uses cityfolk pages).
- When the files of a class complete, call `view.artReady(art)` (I-1 step 4).

### I-5 (P5) `src/core/Townfolk.js` — cityfolk merge

- Merge `cityfolk` like `tools/cityfolk_compose.js` `mergeTownfolkFragments(tf1, tf2, cf)` (shared with logistics).
- **New requirement:** the `{ has }` predicate in `pickAnim` checks page residency **per body base**. `cfPages.groups[p].bases`
  maps atlas → bases. With `cf_rush_2` skipped in the fire group, elders must fall back from `run` / `flee` to `walk`,
  while adults and children keep running. The lab does this in `lab_art.js` `groupLoaded(page, base)` and
  `lab_dolls.js` `has(anim, person)`.

### I-6 (P6) `src/systems/TownSim.js` (optional, for life between incidents)

- `registerKind('police', { plan: patrol over layout.PATROL, look: { preset: 'police_officer' } })` once `inc:police`
  opens. `registerKind('firefighter', …)` idles at `t_fire`. Hold them (`hold(c, 'incidents')`) while a scene uses a
  roster officer; the module currently spawns its own scene actors.

### I-7 (P12) `src/scenes/UI.js` — settings row and cards

- Anchor: the `row(Y(3), t('set_daynight'), …)` line in `buildPanelContent`. After the voice row, add (v8 only,
  `this.gs.later && this.gs.later.incidents`):
  ```js
  row(Y(7), t('set_incidents'), S.incidents !== false ? t('on') : t('off'), S.incidents !== false ? 'green' : 'gray', () => {
    S.incidents = S.incidents === false; Settings.save();
    this.gs.later.incidents.api.toggle(S.incidents !== false);
    this.buildPanelContent(false);
  }, Assets.pick('ui_icon_fire_alert', 'ui_icon_settings'));
  ```
  Strings `set_incidents: '사건·사고'` / `'Incidents & accidents'` go in `src/data/strings.js` (P20).
- `card(spec)` (P12 story card, bottom-left 520 × 120). `spec` is `{ kind, icon, text, sub?, pid?, pids?, big?, at? }`; the
  icons are `ui4_icons` keys.

### I-8 (P17) `src/systems/Rank.js`

- Bar reader `safety: () => gs.later.incidents ? gs.later.incidents.api.safety() : 100`. The rank 4 row is `safety ≥ 90`.

### I-9 (P19) `src/data/world.js`

- Add `WORLD.v8.incidents` from `src/city/incidents/layout.js`: `POLICE` (placement A: i 51.17, j −26.97, footprint i
  48.62–53.71, j −28.6…−25.35, front −Y onto the dock lane's north end), `FIRE_STATION` / `FIRE_PAD` (49.9, −12.4),
  `WANTED_BOARD` (plaza Z(6.3, −1.4), beside the notice board), `HYDRANT_SPOTS` (13 town + 3 village), `ALARM_POSTS` (4),
  `PATROL`.
- Run the plan's v5–v8 layout checker (§4.6 `tools/test/later/layout.mjs`, the lead's kit, not in the tree yet) on the
  wanted board, hydrants and alarm posts. They avoid v4 props but have not been through that checker.
- If the lead keeps the plan's `c_police`, call `setPolicePlacement('plan')` before the host is created. It also moves the
  "경찰서 앞" hydrant and the patrol exit.

### I-10 (P20) `src/data/balance.js`

- `BALANCE.v8 = Object.assign(BALANCE.v8 || {}, { incidents: { ...INCIDENTS_TUNING } })`. Copy the block verbatim with its
  Korean comments. The host reads it through `incidentsTuning(BALANCE)`; the null bug is fixed and tested.

### I-11 `src/story/host.js` and `src/story/engine/src/ext.js` (story_runtime files)

1. **Forward the board.** Anchor `case 'wanted': return;` in `dispatch(ev)` → `case 'wanted': this.out('story:wanted', ev); return;`.
2. **Pids for the cast.** Anchor in `out(name, data)`:
   `for (const k of ['a', 'b', 'who', 'baby']) if (Number.isInteger(d[k])) d[k + 'Pid'] = this.registry.pidOf(d[k]);`.
   Add after it:
   ```js
   for (const k of ['culprit', 'victim']) if (Number.isInteger(d[k]) && d[k] >= 0) d[k + 'Pid'] = this.registry.pidOf(d[k]);
   for (const k of ['officers', 'crew', 'witnesses']) if (Array.isArray(d[k])) d[k + 'Pid'] = d[k].map((sid) => this.registry.pidOf(sid) || null);
   ```
3. **Api** (the object with `report / arrange / toggles / stage / endStage`) gains:
   ```js
   ack(id) { host.post({ t: M.ACK, id }); },
   setRates(r) { host.post({ t: M.CONFIG, config: r || {} }); },      // core.js CONFIG -> e.setRates(config)
   ```
4. **Toggles.** Two anchors post `incidents: false` or leave it out: `this.post({ t: M.TOGGLES, toggles: { lifeEvents: this.lifeOn(), farewell: farewellOn, incidents: false } });`
   and the `settings` re-read. At v8 (`gs.later.incidents`), send `incidents: Settings.data.incidents !== false`. The
   module also pushes `toggles({ incidents })` with its rates.
5. **Engine `arrange('tip')`** for the chief's E12. Anchor `if (op === 'expect') {` in `P.arrange`; add before
   `return null;`:
   ```js
   if (op === 'tip') {          // (v8) the chief found the wanted thief: the police act soon (outcome 'tip')
     const I = this.incidents.active.find((x) => x.id === data.incident && x.kind === 'theft' && x.phase === 'wanted');
     if (!I) return null;
     I.crew = []; I.outcome = 'tip';
     this.incidents.phase(I, 'tipped', Math.max(1, Math.round(this.cfg.dayLength / 24)));
     return { id: I.id };
   }
   ```
6. Rates: the story tuning has fire and incidents at 0 in v5. The module's `setRates` raises them at v8.

### I-12 `src/missions/model/missions.js` (missions_bank files)

- Anchor `this.emit({ t: 'mission:done', id: i.id, code: i.c, kind: t.kind, coins, fame, stars: st, gv: i.gv, w: i.w, nm: i.nm });`.
  Add `key: i.k` so E12 tips the right poster.
- C14 accept: include `at` (the drill spot, e.g. `FIRE_PAD` + (260, 40)) in `mission:accept`, or let the module use its
  default.
- The bank needs no change: `src/bank/host.js` already claims on `inc:fire { op: 'ruin', building, id }` and emits
  `bank:claim { id: building }`, which the module reads.

### I-13 Other

- **P22** `src/voice/cast.js`: firefighter and police use `adult_m`, burglar uses `squeaky`.
- **P24** `tools/build/pack_pages.py`: page classes per art group. `cf_rush_2` is its own page so that it stays out of the fire
  class.
- **P15** music: `bgm_chase` while a chase is on stage; `music(null)` returns to the area music.
- **Vehicles** (optional): staged scenes drive their own scene-local trucks, so the timing stays tied to the acks. For
  off-stage fires, `gs.later.vehicles.api.dispatch('fire_truck', place, { siren: true, stay: 20, id })` can send a truck
  through town for flavour.

---

Files: `/home/user/nurient/frost-village/src/city/incidents/`, `/home/user/nurient/frost-village/tools/test/incidents_lab/`,
`/home/user/nurient/frost-village/docs/previews/incidents_lab_*`, this report.
