# story_runtime (v5) — adversarial critique

Reviewer: later-review job (critic of `src/story/**`, `tools/test/story_lab/**`, `docs/build_reports/story_runtime.md`).
Date: 2026-10-10. Tree: `65c39f3` + the uncommitted module files (v4 workflow still running; nothing outside this file
was changed; all experiments ran on scratch copies / read-only imports).

**Verdict: rework (targeted).** The engine copy, the Phaser view and the art direction are good, the Node suite is green
and the lab looks charming. But the save/restore model, two cross-module contracts and several integration patches
have high-severity gaps that only show in a real game: replayed or lost life beats after an ordinary reload, a
"first baby" and farewell gate that reset every session, departed elders who keep walking around town, a wish system
that stops after the first wish, beats silently dropped after 0.7 s, a texture peak over the 455 MiB "must", and a
designer preview menu that plays nothing. None of this needs a new architecture, but it is more than polish: the save
path, the `t:` body persistence and the Integration section (S1/S6/S7/S9/S11, ports table) need another pass before
the lead wires the module in.

Counts: **critical 0 · high 11 · medium 15 · low 11.**

---

## 0. 디자이너용 요약 (쉬운 말)

- **좋은 점:** 결혼식·청혼·이별 카드 그림과 말투가 따뜻하고 귀여워요. 주민 수다(한국어)도 자연스러워요. 테스트 52개 모두
  통과했고, 실험실 화면도 그대로 다시 만들어졌어요.
- **고쳐야 할 큰 문제 (게임에 붙이기 전에):**
  1. 게임을 껐다 켜면 **결혼식이 한 번 더** 열리거나, 반대로 **이별 카드와 기억의 정원 배웅이 사라져요.**
  2. 껐다 켤 때마다 "첫 아기 소식(23분 뒤)"과 "이별은 3시간 뒤부터" 시계가 **처음부터 다시** 돌아요. 짧게 자주 하는
     분은 첫 아기 소식과 이별을 **영영 못 봐요.**
  3. 하늘나라로 떠난 할머니가 **다음 날에도 마을을 걸어 다녀요.**
  4. 할머니 **소원은 딱 한 번**만 나오고 그 뒤로 영원히 안 나와요 (미션 모듈과 약속이 서로 달라요).
  5. 다른 장면(생일 파티 등)이 화면에 있으면 **결혼식·배웅이 조용히 취소**돼요.
  6. **이야기 미리보기 메뉴**에서 청혼·아기·입학·소원은 아무것도 안 나오고, 이별 미리보기는 정원에 **이름 없는 비석**을
     남겨요. (대표님이 이별 장면을 미리 보셔야 하는데, 지금은 볼 수 없어요.)
  7. 결혼식 때 그림 메모리가 한도(455MB)를 넘을 수 있어요.
- **작은 문제:** 신문 기사 글자 위로 줄이 그어져 보여요(취소선처럼). 비석 이름이 비석 뒤에 숨어 "지 … 니"만 보여요.
  결혼식 손님이 아치 뒤에 몰려 앞쪽 의자가 비어요. 우리 마을회관에서는 게시판·발판과 결혼식 의자가 겹쳐요.

---

## 1. What I ran

| Run | Result |
|---|---|
| `nice -n 15 node --test tools/test/story_lab/engine/*.test.mjs tools/test/story_lab/engine_ext.test.mjs tools/test/story_lab/host.test.mjs` | **52 / 52 pass**, 50.3 s wall (report: 41 s). Parity 636 events identical; 30 days → 174 residents, 117 320 chars side save |
| `smoke_lab.mjs` (Chromium SwiftShader, 390×844) | boots, 0 console errors, 0 × 404, no missing art |
| `lab.mjs farewell --out <scratch>` | re-creates the report's farewell stills/GIF deterministically (day 45/46, same frames) in 25 s |
| Own Node experiments (read-only imports of `src/story/**` + `tools/test/story_lab/fakePorts.mjs`) | E1–E11 below; scripts in `$S/exp/` (`S=/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/later_story_runtime_critique`) |
| Own Playwright run of the lab (`$S/exp/pw_previews.mjs`) | the designer preview entries exactly as `MODULE.previews` calls them |
| Visual review | all 40 stills looked at (downscaled + full-res crops of the farewell stone, wedding, newspaper) |
| Integration review | every patch S1–S14 and the ports table checked against the current `src/**` (Game, Save, Assets, Residency, TownSim, VillageLife, Resident, Civic, Neighbours, Bubbles, UI, ResidentChat, TownHall, DayClock) and against `src/missions/**` / `src/bank/**` |

Helper used by every Node repro (`$S/exp/common.mjs`):
```js
const R = '/home/user/nurient/frost-village';
export const { StoryHost } = await import(R + '/src/story/host.js');
export const { makeFakePorts, run, MemStorage, DAY, HOUR } = await import(R + '/tools/test/story_lab/fakePorts.mjs');
export async function boot(opts = {}) {
  const F = makeFakePorts(opts); if (opts.mutate) opts.mutate(F);
  const host = new StoryHost(F.ports, opts.saved, Object.assign({ transport: opts.transport || 'inline' }, opts.hostOpts || {}));
  return Object.assign(F, { host, start: await host.start() });
}
```

---

## 2. Findings

### HIGH

#### H1 · A stale side record replays life beats after an ordinary reload (and in worker mode the "forced" save rarely lands)
- **What.** The slice (milestones) travels with every 5 s autosave; the engine side record is written unforced once per
  game day (first autosave after 00:00) and "forced" on `visibilitychange:hidden` / `pagehide`. On load nothing compares
  the side record's `T` with the slice/DayClock: the restored engine re-books what it had booked and catches up through
  events the player already saw. `host.start()` re-dispatches booked weddings with `restored: true`, whose timer is
  already in the past, so the wedding plays again immediately, and the engine then fires its own `wedding` life event a
  second time.
- **Repro (E1, `$S/exp/e1_replay.mjs`).** boot rank 2 at d2 09:00 → autosave every 5 s with `host.saveSide(false)` →
  stop at d3 14:00 (after the d3 11:00 wedding) → `host.destroy()` (tab killed, no forced save) → new host with the same
  storage + slice at the same T → `run 120 s`. Output:
  `side record written at: d2 09:12, d3 00:00` · `A life ops: d2 09:13 engaged | d3 11:00 wedding` ·
  `B beats after reload: d3 14:00 wedding` · `B life ops after reload: d3 14:21 wedding 94 135`.
  Missions spawn C2 again and add wedding fame again on the second `story:life wedding` (farmable by killing the tab).
- **Why it is common, not rare (E9, `$S/exp/e9_worker_hidden.mjs`).** In worker mode the `saved` reply is only drained
  by `host.update()` (`WorkerTransport.onwake` drains only before `ready`, `host.js:126`). A hidden page has no rAF
  frames, so the forced save on `visibilitychange:hidden` is not written while hidden: `2 s after the forced save, no
  frames: written? false | resolved? false | replies waiting 1` → `after one frame: written? true`. Mobile OSes kill
  hidden tabs, so in the shipped (worker) mode the side record is typically up to one game day (≈ 10 min) behind.
- **Fix.** (a) In worker mode write the side record from the `onmessage` handler (call `onSaved` directly when
  `m.t === 'saved'`), not from the frame loop. (b) Store `sideT` (engine `T` of the last good side record) in the slice
  and on restore, when `sideT < slice.T - 30`, do not re-dispatch booked beats whose time is before `slice`'s
  `T`, and let the director drop life events with `at < sliceT` (no beats, cards, banners, emits during catch-up;
  keep the engine state). (c) Write the side record also right after each staged ceremony ends (`beatEnd` of wedding /
  birth / farewell), not only once a day.

#### H2 · `t0` (when v5 began) never survives a save: "first good news at v5 + 23 min" and "farewells from v5 + 180 min" restart every session
- **What.** `serialize()` adds `o.t0` after `makeSlice` (`host.js:706`) but `sanitizeSlice` (`save.js:38–45`) builds a
  new object without `t0`, and the host sanitizes even the raw slice in its constructor (`host.js:107`). S2 runs the same
  sanitizer in `Save.js`. So `t0` is always "now" after a load; `farewellFromDay()` and the expect timer move forward
  every session.
- **Repro (E3, `$S/exp/e3_t0.mjs`).** `raw slice t0 1425 | after sanitizeSlice t0 undefined`; nine 20-minute sessions
  with a perfect side save each time: `session 1: t0 1485, farewellFromDay 21` … `session 9: t0 11085,
  farewellFromDay 37, first good news due at d20 18:36`; after 3 h of play `seen.expect` never set (only a random
  engine baby happened).
- **Impact.** The designer's timeline (`기획서_v5_v8_개발계획.md`: 84 min "아기 탄생! 촌장님이 이름을 골라 줘요") and every
  farewell need one uninterrupted session of 23 / 180 game minutes. Phone players who play in short sessions never see
  the scripted first baby or any farewell.
- **Fix.** Keep `t0` in `sanitizeSlice` (`t0: Number.isFinite(raw.t0) ? Math.max(0, Math.round(raw.t0)) : undefined`)
  and in `makeSlice`; add `t0` to the fuzz test and a reload test ("t0 identical after round trip").

#### H3 · A lost side record leaves engine sids in the slice that now point at other people (good news for two unrelated elders)
- **What.** The slice stores `firstCouple`, `wishActive` and `wishes` as engine sids. After a lost/corrupt side record the
  town is re-adopted; sids follow roster order (homes sorted alphabetically), so any growth since the first adoption
  (읍 newcomers, district households, settlers) shifts them. `arrange('expect')` (`ext.js:283`) has no check that the
  two are spouses, adults or of different sexes.
- **Repro (E2, `$S/exp/e2b.mjs`).** Run to the first wedding (d3 14:00), keep the slice, reload with empty storage and
  three new roster rows in home `lot_a1` (sorted first). `A first couple 신온유(33) + 노채은(37)` → after reload the same
  sids are `임금순(79) + 박미숙(74)`; at d5 21:12 `arrange expect {a:94,b:135}` → `goodnews 임금순 80 + 박미숙 74 spouses:
  false (a's spouse is sid 93)` → a baby follows.
- **Fix.** Store pids, not sids, in the slice (`firstCouple: ['t:86','t:39']`, `wishActive` / `wishes` keyed by pid) and
  map through the registry on load; in `arrange('expect')` require `a.spouse === b.id`, both adults < 50, and skip
  otherwise. On a re-adoption, clear `firstCouple` unless both pids are still bound.

#### H4 · A departed elder's body stays in the town (and can be cast in later scenes)
- **What.** On `farewell` the engine removes the resident (`life.js:380`, `remove(r, F_DEAD)`), but the host never calls
  `ports.town.leave(pid)` nor `registry.unbind(pid)`; only `move out` banners do (`host.js:367`). The TownSim body keeps
  its routine; `api.card(pid)` returns null (the v4 tap card falls back to a name card of a person who "went on a journey
  to the sky"); `nearbyPids()` for the farewell friends only excludes `family`, so the departed can even be picked for
  her own garden crowd or a later wedding.
- **Repro (E5, `$S/exp/e5_farewell.mjs`, 30 game days, `farewellFirstAfterMin: 0`).** `farewell d30 00:03 t:54` →
  `still bound in the registry: true, owner town` · `ports.town.leave called for it: false` · `api.card(pid): null` ·
  engine card `송태민 92 alive:false`.
- **Fix.** On the `farewell` life event (after the 10:00 garden beat, so the elder is not visible at the ceremony):
  `ports.town.leave(pid)` + `registry.unbind(pid)` + exclude dead sids in `StoryLife.nearbyPids` and in `sendTick`
  (`whereabouts` rows for unbound pids are skipped already). TownSim must persist it (see H7).

#### H5 · Wishes and the first-school-day escort never reach missions_bank; the wish system locks after one wish
- **What.** (a) The story emits wishes as `story:wish { who, wish, place }` (`host.js:499`) and never emits a
  `story:life` op `school`; missions_bank spawns C7 only on `story:life { op: 'wish' }` and C4 only on `story:life
  { op: 'school' }` (`src/missions/model/missions.js:298–299`). (b) missions_bank's `mission:done` is `{ id, code,
  kind, coins, fame, stars, gv, w, nm }` (`missions.js:520`), but the story only clears a wish on `mission:done` with
  `ev.wish` and an integer `ev.who` (`host.js:591`). `wishActive` is cleared nowhere else: not on expiry, not when the
  wisher leaves or bids farewell.
- **Repro (E5).** 30 game days: one wish card `d3 00:17 55 park_bench`, then `wishActive 55` for the remaining 27 days,
  no second wish. With the real missions code C7 is never even offered.
- **Fix.** Emit `story:life { op: 'wish', who, whoPid, wish, place, ko, en }` and `story:life { op: 'school', who,
  whoPid, venue }` (keep `story:wish` for compatibility); accept `mission:done { code: 'C7', w: pid }` (map pid →
  sid) and `mission:expire { code: 'C7' }` to clear `wishActive`; clear it on the wisher's `farewell` / `move out` and
  after `wishTimeoutDays` (3). Add a cross-module contract test that feeds the real `MissionModel` the story's events.

#### H6 · A busy ceremony slot drops a timed wedding or farewell after 40 frames (≈ 0.7 s), not "deferred"
- **What.** `playBeat` pushes a busy beat to `pending` with `tries < 40` (`host.js:404`) and `retryPending()` runs every
  frame (`host.js:280`). A staged birthday party (≤ 60 s), proposal (≤ 60 s), school day or a farewell (≤ 150 s ≈ 6 game
  hours) in the ceremony slot makes a 10:30 wedding or a 10:00 farewell vanish silently. Nothing prevents a farewell day
  from being a wedding day (weddings are booked 2 days ahead; the engine's farewell gates do not look at bookings).
- **Repro (E4, `$S/exp/e4_pending.mjs`).** stage a birthday at the hall, then request the wedding: `pending after
  request: [wedding tries 1]` → after 60 frames `pending 0, wedding plays 0` → after the birthday ends `wedding plays 0`.
- **Fix.** Retry by game time, not frames (keep a pending beat until its window ends: wedding until 12:00, farewell until
  12:00), let weddings/farewells pre-empt birthday parties and later proposals (cancel the smaller beat), and make the
  engine skip a farewell on a day with a booked wedding (and vice versa).

#### H7 · Story bodies are not persisted in TownSim: story children collide with later `t:` ids; moved-away families come back
- **What.** TownSim regenerates its 100 citizens from the seed on every load and re-adds only `nb.extra` rows
  (`TownSim.populate`, `addDistrictHome`, `growTo`). S6 adds `addCitizen('toddler')` for story children and
  `retire(c)` for families that move away, but neither writes to `nb.extra` / a save field: after a reload (1) the
  story child's body is gone, `reconcile()` leases its sid "away", and the next `addCitizen` (district household, 읍
  newcomer) gets the same `t:<id>` → `registry.has(pid)` is true, so a new adult shopkeeper is driven as the 5-year-old
  story child (wrong lines, wrong card); (2) a retired family's citizens are rebuilt from the seed, `reconcile()` sees
  them as missing and adopts them again as a new household. `addCitizen` also maps an unknown kind to `'adult'`
  (`KINDS.indexOf(kind) >= 0 ? kind : 'adult'`) and picks an adult doll for `'toddler'`.
- **Fix (patch S6).** Persist story bodies explicitly: `nb.extra.push([c.id, 'toddler'|'student', home, { sid, look }])`
  with the look derived from the parents, add `'toddler'` to `KINDS` and its doll age; persist retired ids
  (`nb.gone = [ids]`, skipped by `populate`/`retier`/`census`). Never reuse a pid: the registry should key children as
  `k:<sid>` and map to the TownSim id through a table saved in the side record.

#### H8 · Texture peak: every life beat asks for all 9 townfolk2 pages (72.6 MiB); a wedding at the v4 peak view exceeds the 455 MiB "must"
- **What.** `FRAGMENTS.proposal/wedding/farewell/lastday/birth/stroller` request `TF2` = all nine pages
  (`index.js:9–27`), i.e. head 4.9 + child 12.8 + adult 31.2 + elder 23.5 = 72.6 MiB, plus life2 4.5 and fx_city 2.4.
  `texbudget_v4.json` measured 386.9 MiB at "full v4 plaza +5 s" (GL total 421.9). Our hall is in the plaza:
  386.9 + 79.5 ≈ **466 MiB > 455**. The plan's budget is "life pages only for the cast's ages … transient ≤ +40 MiB".
- **Fix.** Request pages per cast age (`beatAssets(kind, ages)` → only the ages present; a proposal needs adult only:
  36 MiB), evict social pages first (Residency), and gate staging on `Residency.total + need < must - 10` (else play
  the scene in everyday clothes). Re-measure with townfolk2 actually paged before shipping.

#### H9 · Named villagers have no whereabouts in the Integration: in the game they never talk in the story, so the chat memory bridge gets nothing
- **What.** E1 external plans mean talks happen only between people the game reports together. The stand-in town
  reports every `v:` villager at the town fountain / café / hall all day (`standin.mjs:87`), which is how the host test
  "chat memory bridge" passes. In the game, `ports.town.whereabouts` is specified only for TownSim (`S6`: one row per
  citizen); S7 (VillageLife) has hold/release/walk/anim but no rows, and the ports table's `world.buildings()` lists the
  town + civic buildings but not the village market / workshops / houses where villagers spend the day. Result: the 14
  named villagers (the residents you can chat with) are nowhere, never talk, keep empty diaries, and `syncMemories()`
  returns 0 — the designer's "주민들은 … 나눈 이야기를 서로 기억함" is lost for exactly the people who chat.
- **Fix.** Add to S7: `whereabouts` rows `['v:' + r.key, villageBuildingId(r), act, r.arrived ? 'out' : 'walk', busy]`
  (job / event location → `market`, `big_restaurant`, `ice_rink`, `campfire`, house ids — `places.js KIND_BY_KEY`
  already knows these keys) and add those village buildings to `world.buildings()`. Test it in the host test with a
  stand-in that keeps villagers in the village and away from the townsfolk.

#### H10 · The designer preview menu (MODULE.previews) plays nothing, and the farewell preview leaves a nameless stone in the real garden
- **What.** `MODULE.previews.*(host)` call `host.view.preview(kind)` with no cast; `preview()` builds `{ data:
  { fast: false }, sids: [] }` (`StoryLife.js:316`) and the scenes return at once when `hold(undefined)` fails. The
  farewell preview still places a `memorial_stone`, a nameplate and runs `bgm_farewell`; `keepStone` keeps the stone and
  the nameplate text is never destroyed. Previews also do not take the stage slot, so they overlap real beats.
- **Repro (Playwright, `$S/exp/pw_previews.mjs`, lab `?rank=2`).** `preview_proposal / birth / school / wish:
  gameSecs 0` (nothing shown); farewell: `active: ['preview:farewell', 'proposal']` (overlaps the real first proposal),
  after it `stonesKept 1, textsAdded 1`; a second farewell preview: `stoneImagesInWorld 2` (the first image leaked).
  Screenshot: `$S/lab/previews/preview_farewell_twice.jpg` (nameless stone at slot 0).
- **Why high.** `기획서_v5_v8_개발계획.md` asks the designer to watch the farewell in the preview menu before v5 ships; the
  lab's nice captures come from `shots.js`, which passes a hand-picked cast that the in-game menu never passes.
- **Fix.** Let `preview(kind)` pick a cast itself (nearest free adults / elder / child via `ports.town.nearby`, the
  chief and 콩이), request the ceremony slot, play with `data.preview = true` (no `keepStone`, destroy the nameplate,
  no cards/emits), and focus the camera on the venue for the designer.

#### H11 · A reload loses every timed beat except weddings: the farewell card, the 10:00 memorial-garden ceremony, the last day and the first school day
- **What.** Director timers are not saved ("rebuilt from the engine's events after a load"), but `start()` re-books only
  `kind === 'wedding'` from `engine.booked()` (`host.js:159`), although `booked()` also returns `memorial`, `birth`
  and `lastday`. The school day (scheduled for tomorrow 07:00 on the 7th birthday) has no engine booking at all.
- **Repro (E11, `$S/exp/e11_farewell_reload.mjs`).** farewell event `d30 00:03 t:54`, a perfect forced side save at
  06:00, reload: `booked in engine: [{kind:'memorial', at:18250}]` → `after reload (restored true): (no farewell card,
  no garden beat)`. The elder disappears from the story with no goodbye; her name stays in the slice's garden list.
- **Fix.** Re-dispatch `memorial` (card at 09:00 + beat at 10:00, using the saved name from the engine card), `lastday`
  (15:00 the day before) and add a `school` booking (or recompute "turned 7 yesterday" on load). Add a reload test for
  each timed beat.

### MEDIUM

#### M1 · Late art the scenes need is not in FRAGMENTS (stroller, cradle)
`FRAGMENTS.birth` / `stroller` never request the stroller atlases `l2_baby_stroller` / `l2_baby_stroller_pink`
(life2 `characters.baby_stroller*`), and `goodnews`, `firststeps`, `wish`, `outdoor`, `birthday` fall back to
`FRAGMENTS.small = []`, so the cradle (`life2_decor`) is missing for the first good news. The lab preloads every
atlas (`lab.js` `CHARS` includes `baby_stroller`), which hides this. **Fix:** add `['life2', { only:
['l2_baby_stroller', 'l2_baby_stroller_pink'] }]` to birth/stroller, `life2_decor` to `goodnews`/`outdoor`, and a lab
mode that loads only `MODULE.beatAssets(kind)` to prove each scene.

#### M2 · Memorial stones: the name is hidden behind the stone, slots are overwritten, nothing survives a reload
- The stone's depth is `gdepth + 1 + st.y * 0.001` (`Farewell.js:20`); with world `y` ≈ 1000–3000 that is +2…+4, above
  the nameplate at `gdepth + 2` (`Farewell.js:23`), so only the outer letters peek out ("지 … 니"). Evidence:
  `docs/previews/story_lab_farewell_after.jpg` (crop x 250–560, y 1180–1380) and my re-run `$S/lab/run/crop_after.jpg`.
  The 11 px font is ~8 CSS px on a phone even when visible.
- `slot = g.length - 1` caps at 5: from the 7th farewell every new stone and nameplate is drawn on slot 5 on top of the
  old ones; slots 0–4 keep stale nameplates though `garden` shifted. `keepStone` overwrites `stones[slot]` without
  destroying the old image.
- `StoryLife` never draws the slice's `garden` on boot: after a reload the garden is empty again (plan: "Existing stones
  stay").
- **Fix:** nameplate depth `stoneDepth + 0.01`, 16–18 px on a plaque using `plaquePoint`; rebuild all stones from
  `slice.life.garden` on `attachView` and on every farewell (destroy and redraw); turn the oldest into a flower bed as
  the plan says.

#### M3 · Newspaper: article bodies are struck through, titles truncated, English lead repeats itself, the first issue is "No. 3"
- Body text starts at `t.y + t.height + 8` ≈ 44 px into a column whose nine-slice header band is 54 px (`fx_city`
  `ui_newspaper_column.top = 54`), so the header's bottom rule runs through the first body line — it reads as a
  strike-through (`docs/previews/story_lab_news_ko.jpg`, crop y 1190–1360; `_en.jpg` too). Titles are clipped at 30
  chars ("Kongi ate the snowman's carro…").
- English lead: "The couple shared their first dance under falling snow. Guests threw snowflake confetti, and the couple
  had their first dance in the snow." (duplicate idea; engine `lang/en/news.js`).
- The first edition the player sees (morning after the first wedding) is "제 3호 / No. 3" because the engine numbers
  papers it printed before; the plan calls it the 창간호 and missions C15 is the "창간 인터뷰".
- **Fix:** body `y = colTop + 54 + 6` (read `nineSlice.top`), wrap titles to two lines, renumber issues from
  `paperFrom` (show "창간호" for the first), dedupe the EN lead template.

#### M4 · Wedding composition: front chairs empty, guests hidden behind the arch; at OUR hall the layout collides with v4-C props
- `seats.sort((p, q) => p.y - q.y)` (`Wedding.js:38`) seats guests back-row-first, i.e. in the left block behind the
  arch; with 12–14 guests and 18 seats the front-right block stays empty in every still
  (`story_lab_wedding_guests/vows/cake.jpg`). Fill front rows first and alternate blocks.
- Our village 마을회관 (`TownHall.js:21`) has the notice board at (−268, 64), the board pad at (−200, 128) and the
  ceremony pad at (−150, 196) relative to the same `town_hall` anchor the life2 layout uses: chairs at (−285, 63) and
  (−238, 40) stand in the notice board, the carpet (−215, 107) covers the board pad, the cake table (−138, 218) sits on
  the ceremony pad. The lab's stand-in hall has none of these props. **Fix:** hide/disable board, board pad and venue
  pad during the wedding (TownHall API), or a venue-specific layout using `TownHall.venue('wedding')` (P13).

#### M5 · Toast and banner port shapes do not match v4 UI
`host.ui('toast')` calls `U.toast(text, 2.5)` (`host.js:466`) and the view does the same (`StoryLife.js:307`), but
`UI.toast(msg, hold)` takes **milliseconds** (`delay: hold || 1500`, e.g. `this.toast(t('dogWhistleHint'), 4000)`), so
every story toast fades after 2.5 ms (≈ 0.35 s visible) — including the "save full" warning. `U.banner(spec)` passes an
object; `UI.banner(msg, sub)` wants two strings. **Fix:** ports table: `ui.toast(text, holdSec) → gs.ui.toast(text,
holdSec * 1000)`, `ui.banner(spec) → gs.ui.banner(lang ? spec.en : spec.ko, lang ? spec.subEn : spec.subKo)`.

#### M6 · The "≤ 2 chats / ≤ 3 emotes" town cap is not enforced by the mapped port
The ports table maps `say` to `gs.life.bubbles.chat(...)`. v4 `Bubbles.chat` allows 5 chats and evicts the oldest
instead of refusing, and returns the bubble object (`Bubbles.js:10, 39–72`); the caps 2/3 live in TownSim's caller
(`TownSim.js:25, 793–799`). So `say()` is always truthy, the story's emote fallback never runs, and story bubbles evict
village/TownSim bubbles. **Fix:** the kit's `say` counts active chats like `TownSim.chatter` and returns false at the cap.

#### M7 · "인생 이야기" off does not stop the scripted first good news / baby
`host.update` arranges `expect` for the first couple whenever `seen.wedding && !seen.expect` (`host.js:286`), ignoring
`lifeOn()`. **Repro (E6, `$S/exp/e6_lifeoff.mjs`):** switched off at d3 11:24 → `d4 16:13 goodnews | d5 18:00 baby`.
**Fix:** guard with `this.lifeOn()`; also cancel the booked wedding beat and pending births when switched off (or say in
the setting's sub-label that already planned weddings still happen).

#### M8 · The scripted first proposal ("우리 단골 손님이 무릎을 꿇어요") is fragile
- Not retried: `proposalAt` is cleared before the async query; if no eligible pair exists at that moment
  `firstProposal()` returns null and nothing re-arms it until a reload or a settings change. **Repro (E7,
  `$S/exp/e7_sweet.mjs`):** the stand-in has only **2** eligible sweetheart pairs at 읍; with one empty answer →
  `after a game day: seen.proposal false, proposalAt null`.
- Candidates are not filtered by leases: a citizen riding the train / visiting our village (`gameplay`) can be picked;
  the scene's `hold()` fails and returns, but the "첫 결혼식이 열려요!" banner still shows after it.
- "단골" never applies: v4 already tracks regulars (`Neighbours.regulars`, `c.visits`, `c.regular`), but the roster
  mapping does not pass them, so the registry starts at 0 served at 읍.
- **Fix:** retry every 10 s until it plays; filter `R.owner(pid) === 'town'` and on-screen first; seed
  `registry.served` from `c.visits` (roster row `visits`).

#### M9 · The first wedding is easily missed: staging is decided once at 10:30 and no card offers 보러 가기
`stage.request` is evaluated once when the beat fires; if the camera is > 1200 px away at 10:30 the wedding "plays off
stage" (`endBeat` at once) even if the player walks there at 10:35. No card sets `watch`, so the StoryCard's 보러 가기
button (`StoryCard.js:29`) never appears. **Fix:** for the first wedding and the first farewell, keep the beat pending
until 11:00 / 11:00 and re-check staging every second; put `watch: true` on the engaged / farewell cards and wire
`ctx.onWatch` to a camera pan or the guide arrow.

#### M10 · Person card: "수다 떨기" does nothing; S11 passes world coordinates as the screen anchor
`onTalk: () => this.host.api.talkTo(pid)` (`StoryLife.js:301`) discards the returned talk; no bubble, no chat, the card
stays open. S11's `openPerson(pid, { x: w.x, y: w.y })` passes world px; `PersonCard` clamps a *screen* anchor, so the
card always lands at a screen edge instead of above the person. **Fix:** villagers → `gs.residentChat.offer(r)` (as
S11 text says, but code does not); townsfolk → play the returned lines through `ports.say` with the chief; convert with
`camera.worldToScreen`-style math in the kit.

#### M11 · S7 walk/face semantics are wrong for Residents
Scenes pass speed multipliers (`{ speed: 0.4 … 1.1 }`); `Resident.goTo(x, y, { speed })` treats `speed` as absolute
px/s (`Resident.js:79`), so named villagers would crawl at < 1 px/s and every walk would end only by the scene watchdog.
`r.faceTo(x, y)` takes a point, the story passes a direction string. **Fix:** `speed: r.walkSpeed * (opts.speed || 1)`;
map directions to a point (`r.x + DX[dir]`, `r.y + DY[dir]`).

#### M12 · S9 settings rows do not fit, and the wording differs from the designer's
The settings panel already has 7 rows on a 90 px pitch from `cy − 330` to `cy + 210` and buttons at `cy + 330` /
`cy + 428` (`UI.js:916–975`); two more rows land at `cy + 300` and `cy + 390`, on top of 처음부터 / 새로고침 / 닫기.
The designer's own words are "생애 이벤트: 켜기/끄기 (끄면 노년까지만, 이별 없음)" (`기획서_v5_생활과미션.md`); the module
shows "인생 이야기" + "따뜻한 이별" and `farewellOffNote` still says "생애 이벤트". **Fix:** a second settings page (or a
"이야기" sub-panel) and one consistent label the designer chose.

#### M13 · v4 settlers are a count, not people: the `s:` story residents are invisible "known" ghosts
`Civic.settlersArrive(n)` only adds to `this.settlers` and plays a walk-in (`Civic.js:219–233`); there is no body,
house or identity to persist. The kit would have to invent `n` rows on every load (S8/P27 only add the house id).
Because `registry.known()` treats every `s:` pid as known (`registry.js:55`), their life events produce story cards about
people the player can never see or tap, and their children get a body at 4 via `addCitizen({ home: { like: 's:3' } })`
with no home to copy. **Fix:** either give settlers TownSim/VillageLife bodies (P27 as a real feature) or keep them out
of the story (no adoption) until they exist.

#### M14 · Main-thread budget missed and not flagged
Plan §6.1: "StoryHost + StoryLife + scenes ≤ 0.10 ms per tick average". The report's own lab numbers are 0.23 ms avg
(p95 0.9, max 5.8) in worker mode and 1.05 ms avg (max 19.2) inline; the report does not compare them to the budget.
`happenings()` calls `ports.happenSpots()` and `ports.open()` every frame before checking whether a happening is due
(`host.js:426–428`); the kit's `happenSpots` searches the map. **Fix:** call them only when `HappeningClock` says due;
measure in-game; state the budget result in the report.

#### M15 · The paper's bank line contradicts the bank
The engine sidebar prints "은행 소식: 하루 0.08%의 이자" (`engine/src/bank.js:21` `depositBp = 8`) while the chief's bank
pays 1 % a day (`src/bank/tuning.js:9`). **Fix:** feed the bank module's rate into the engine (`setRates`) or drop the
bank line in v5.

### LOW

| # | Finding | Evidence | Fix |
|---|---|---|---|
| L1 | S6 adds `place(c, x, y, dir)` to TownSim, which already has `place(id)` (`TownSim.js:128`); the later definition silently replaces the lookup | `TownSim.js:128`; report §11.4 S6 | name it `placeAt` |
| L2 | `makeSlice` omits `wishDone` (sanitizer reads it) → after a reload the same elder can get the same wish | `save.js:17–24` | include `wishDone` (capped) |
| L3 | Happening RNG is re-seeded `0x5eed` every session (same first happening each session); P2/P4–P6 return `{ toast: true }` but `StoryLife.happening` ignores the result, so with a view no toast appears; with the kit's spots (no snowman / bus_stop / road) they are filtered out anyway — the report's "only toasts" is not what happens | `happenings.js:27`; `Happenings.js:48`; `StoryLife.js:311` | seed from `ports.seed() ^ day`; show the toast on `{ toast: true }` |
| L4 | P1's shopkeeper always says "어머, 내 빵!" — the engine's own Korean rule is "no man says 어머" | `Happenings.js:16` | pick by sex ("어이쿠, 내 빵!") |
| L5 | Engaged card "결혼식은 11시 · 마을회관" without the day (the wedding is 2 days later); the scripted banner says 내일 correctly | `lifeRules.js:106` | "모레 11시" / "{n}일 뒤 11시" |
| L6 | Birth: "night at the clinic, out at dawn" is 5 game seconds at 18:00; the parents come out "at dawn" in the evening | `Baby.js:31–38` | hold until 06:30 (or show the card at dawn and the stroller walk then) |
| L7 | Previews and real beats share no slot: a preview farewell ran together with the real first proposal (`active: ['preview:farewell','proposal']`) | Playwright run | previews take the ceremony slot |
| L8 | `sanitizeSlice` returns null for any other `v`: a v6 slice bump without a migration resets `seen` → a second "첫 결혼식이 열려요!" | `save.js:40` | `MIGRATE_SLICE[v]` hook now |
| L9 | Worker mode: the registry is snapshotted when the `saved` reply arrives, the engine when the request was handled; an `addPeople` in between writes pids whose sids are not in the engine record | `host.js:725` | send the registry with the save request and store that copy |
| L10 | "아장아장 걷기 시작했어요!" for a 4-year-old (walkAge 4) reads odd | `lifeRules.js:157` | "이제 유모차 대신 혼자 걸어요!" |
| L11 | Talk bubbles are world-space (v4 Bubbles): at zoom 0.6 the text is ≈ 6 CSS px (`story_lab_town_z06.jpg`); the plan's "skip after 3 s on joystick input" is only a comment | `Proposal.js:4` | counter-scale bubbles below zoom 0.9; implement the skip or drop the claim |

---

## 3. Integration section vs the real v4 code

| Patch | Verdict | Notes |
|---|---|---|
| S1 Game.js | works with changes | anchors exist (`residentChat = new ResidentChat` l.247, `this.v4.update(dt)` l.1626, `c1:` l.1908, `save()` l.1913, `gs.cid` l.162). `STORY.gate` on `gs.v4.rank.level` is right. `saveSide` after `Save.write` must respect `window.__FV_NO_SAVE` / `Save.lastWriteOk`. The worker-mode side save is effectively lost on hide (H1/E9). |
| S2 Save.js | broken as written | `sanitizeSlice` drops `t0` (H2); add `sideT`. `Settings.data` + `load()` lines are right. |
| S3 Assets.js | partly | `mergeLate` does drop `layouts` (correct diagnosis); FRAGMENTS miss the stroller atlases (M1) and over-ask townfolk2 (H8). |
| S4 Residency.js | missing API | `addClass` does not exist yet; the budget math is not done (H8). |
| S5 Townfolk.js | plausible | not checked in a running game. |
| S6 TownSim.js | needs work | `hold/release/walk/pos/update/retier/drive` hooks fit the code; `wake()` stale-heap logic is right. Missing: persistence of story children and retired citizens (H7), `'toddler'` in `KINDS` + doll age, `place` name clash (L1), farewell bodies (H4). |
| S7 VillageLife/Resident | broken | no whereabouts for villagers (H9), speed/face semantics (M11). |
| S8 emits | partly | snowball / tap anchors exist; `settlers` carries only `n` and there are no settler people (M13). |
| S9 UI | needs layout | rows overflow the panel (M12); toast/banner shapes (M5). |
| S10 ResidentChat | works | `ensure()` / `this.village = v` / `M.StoryBridge` exist; value depends on H9. |
| S11 name card | needs work | world vs screen anchor; 수다 떨기 does nothing (M10). |
| S12–S14 | fine | — |
| Ports table | gaps | `say` cap (M6), `ui.toast` units (M5), `town.*` for pets (`ctx.happen().pets`) not dispatched by `t:`/`v:` prefixes, `T()` should be `clock.simT()` if the day length is ever tuned (story `HOUR = 25` is hard-coded). |
| missions_bank contract | broken | `story:wish` vs `story:life op wish`, no `op: 'school'`, `mission:done` payload (H5). |

---

## 4. What is good (keep it)

- Engine copy behind config flags with the 30 original tests running against it; worker ↔ inline parity holds.
- Korean talk lines sampled from 1.5 game days (3 304 lines) read naturally (반말/존댓말, 임자/여보, puns); the
  farewell vocabulary stays within 하늘나라 여행 / 배웅 / 기억.
- The farewell card, the proposal banner after the "네!", the naming sheet and the person card are clear at phone size.
- The slice cap and fuzzing, the side store's `blocked` rule for newer records, pack15 without surrogates.
- Stagehand cancel/watchdog design: bodies always released, props cleared.

## 5. Re-running the repros

All scripts are in `$S/exp/` (see §1 for `$S`): `e1_replay.mjs`, `e2b.mjs`, `e3_t0.mjs`, `e4_pending.mjs`,
`e5_farewell.mjs`, `e6_lifeoff.mjs`, `e7_sweet.mjs`, `e9_worker_hidden.mjs`, `e10_talks.mjs`,
`e11_farewell_reload.mjs` (`cd $S/exp && nice -n 15 node <file>`), and `pw_previews.mjs <outdir>` (Playwright, one
browser, < 1 min, `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`). Each prints the lines quoted above. They import the
module read-only; none writes into the repository.
