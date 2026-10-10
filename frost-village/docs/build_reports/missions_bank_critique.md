# missions_bank (v5) — adversarial review

Reviewer pass on `src/missions/**`, `src/bank/**`, `tools/test/missions_lab/**` and `docs/build_reports/missions_bank.md`,
against `docs/v5_v8_plan.md` (§6.2, §7), `docs/기획서_v5_생활과미션.md`, `docs/기획서_v8_살아있는도시.md` §2,
`docs/기획서_v5_v8_개발계획.md`, and the real v4 code in `src/**`. The module's files were treated as read-only.
All probes ran in the scratch folder
`/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/later_missions_bank/` (called `$S`
below). Commands were run with `nice -n 15`, one Chromium at a time.

**Verdict: rework.**
The pure model, the save sanitizers, the bank's money conservation and the art direction are solid. But four things
break the "never a dead end" promise and the game itself once the module is wired in:

- A save-path infinite loop.
- A board that fills up with cards nobody can finish.
- Event missions whose triggers or steps are never sent by the modules they rely on.
- Integration patches (P28, P31, P13) that would harm v4 as written.

Most fixes are local, but they touch the host, the catalog, the calendar and the integration section.

| Severity | Count |
|---|---|
| critical | 2 |
| high | 6 |
| medium | 11 |
| low | 9 |

---

## 0. 디자이너용 요약 (쉬운 말)

- **좋은 점**
  - 그림이 잘 나왔어요. 할머니께 빵 갖다 드리기 카드, 은행 안이 보이는 모습, 칭호가 오를 때 리본과 별이 예뻐요.
  - 은행 숫자는 꼼꼼해요. 돈을 '찍어 내는' 방법은 찾지 못했어요.
- **꼭 고쳐야 할 점 1: 게임이 멈출 수 있어요.**
  - 미션이 많이 쌓인 저장 파일을 저장하려고 하면 게임이 멈춰요.
  - 고치기는 한 줄이면 돼요.
- **꼭 고쳐야 할 점 2: 게시판이 '못 하는 미션'으로 꽉 차요.**
  - 그런 미션은 4가지예요.
    - 개썰매·트럭 배달: 운전을 시작하는 버튼이 어디에도 없어요.
    - 잃어버린 강아지·뽀삐 데려오기: 찾은 뒤에 데려갈 사람이 없어요.
    - 소문의 진실, 불꽃놀이: 아무도 진행을 알려 주지 않아요.
  - 실험해 보니 10분 만에 게시판 3칸이 전부 이런 카드가 됐어요.
- **'결혼식 준비' 미션이 바로 실패할 수 있어요.**
  - 대표님이 말씀하신 첫 미션이에요.
  - 결혼식은 내일인데 마감이 '오늘 10시 반'으로 잡혀서, 26초 뒤에 "다음에 또 도와줘요!"가 떠요.
- **오늘의 미션 중 '꽃 5송이 꺾기'는 할 수 없을 때가 많아요.**
  - 꽃밭 발판은 꽃다발이 필요한 미션이 있을 때만 나와서, 그렇지 않은 날에는 이 미션을 끝낼 수 없어요.
  - 휴대폰에서 게임을 끄지 않고 켜 둔 채 다음 날 들어오면, 오늘의 미션이 어제 것 그대로예요.
- **아기 이름 짓기 미션은 선물을 줘도 실패로 끝나요.**
  - 이야기 쪽은 '이름 지었어요'를 보내는데, 미션 쪽은 그 소식을 듣지 않아요.
- **은행에서 빌리기를 거절해도 창이 계속 다시 떠요.**
  - "은행에서 빌릴까요?"에서 '괜찮아요'를 눌러도 발판 위에 있는 동안 계속 다시 떠요.
- **말이 어색한 곳이 있어요.**
  - "순자 할머니 할머니의 소원": 할머니가 두 번 들어가요.
  - 할아버지에게도 "할머니의 소원"이라고 나와요.
  - 할머니가 부탁해도 "할아버지 난로에 장작"이라고 나와요.
  - 생일인 아이가 "곧 지호의 생일이에요!"라고 자기 생일을 남 얘기하듯 말해요.
- **v4의 '주문 칩'이 사라져요.** 연결 설명서대로 하면 가게 창업 주문을 안내하던 칩이 없어지고, 대신 보여 줄 것이 없어요.

---

## 1. What was re-run

| Check | Result |
|---|---|
| `nice -n 15 node --test tools/test/missions_lab/*.test.mjs` | 37 / 37 pass (3.6 s) |
| Lab: private copy of `run_lab.mjs` (output redirected to `$S/lab_out`), groups bubbles, accept, delivery, panel, bank | 16 shots, 0 console errors, 0 placeholders, 86 s. Missions 0.013 ms per frame, bank 0.0035 ms per frame, module textures 9.65 MiB |
| Lab probes added to the private copy (`$S/lab/run_lab.mjs`, groups `probe`, `probe2`, `probe3`) | numbers in `$S/lab_out/missions_lab_numbers.json`; quoted below |
| Headless host harness (`$S/harness.mjs` + `$S/phaser_stub.mjs`: the real `MissionsHost` and `BankHost` over the module's own `FakeWorld`, views off) | repros below |

**Why the tests did not catch the critical and high findings**

- The anti-softlock "oracle" (`missions.test.mjs` `finish()`) calls `m.step(id, how)` directly. It never goes through
  `MissionsHost.world()`, so a step that no code path in the host or any sibling module ever triggers still counts
  as "completable".
- Story events in the tests carry `at:`, a field story_runtime never sends.

---

## 2. Findings

### CRITICAL

#### C-1 · `fitCap` can loop forever, and the game freezes on autosave
- **Where:** `src/missions/save.js:90`. The fame-log step is:
  ```js
  s.fm.lg = s.fm.lg.slice(-Math.floor(s.fm.lg.length / 2))
  ```
  When the log length is 1, this is `slice(-0)` = `slice(0)`. The log never shrinks below 1 entry, and the step keeps
  returning `true`. So `while (sizeOf(s) > cap && st())` never ends whenever the slice is still over 3,072 B after the
  log is down to one entry. Steps 2–4 (bubbles, parked cards, cooldowns) are never reached.
- **Impact:** `MissionsHost.serialize()` calls `fitCap()` on every save (v4 autosaves every 5 s). The main thread
  spins forever.
- **Is it reachable?** A legal, plausible slice already measures 3,005 B (`$S/t_fitcap2.mjs`). It holds:
  - 3 accepted requests and 5 running event missions (a wedding week);
  - 6 parked cards and 4 bubbles;
  - 49 cooldowns and a full fame log.

  Three things push it past 3.3 KB, where trimming the log no longer helps:
  - `model.serialize()` is not capped by `MAX` (live `a` can exceed 8);
  - v6–v8 add templates;
  - more cooldowns.
- **Repro:** `timeout 8 node $S/t_fitcap.mjs` exits 124 (killed). Run on its own:
  ```js
  fitCap({ v: 1, fm: { p: 10, lg: [[1, 2, 'x'], [3, 4, 'y']] }, pad: 'x'.repeat(3100) })   // never returns
  ```
- **Fix:**
  - Change the step to:
    ```js
    const keep = Math.floor(s.fm.lg.length / 2);
    if (keep) s.fm.lg = s.fm.lg.slice(-keep); else delete s.fm.lg;
    return true;
    ```
  - Give every step a "did it shrink?" guard.
  - Add a final hard fallback that drops the oldest `a`/`p` and non-once cooldowns, so the function always returns.
  - Add a test with an untrimmable 3.2 KB slice.

#### C-2 · The board fills with cards that can never be finished, contrary to "never a dead end"
- **Where:**
  - `src/missions/host.js:160-181` (`world()` handles only `stand` / `speech` / `find` / `return` / `lead`);
  - `src/missions/data/catalog.js` (B1–B12, E1, E3, E13, C12);
  - `src/missions/model/missions.js:226` (`fillBoard`).
- **Root causes (each verified):**
  1. **No drive starter.** Nothing in `src/missions/**` calls `gs.later.vehicles.drive({ tpl, mid, … })`, and nothing in
     `src/vehicles/**` asks the missions module for drive missions. `docs/build_reports/vehicles_runtime.md:275` says
     "drive missions B1–B12 call `gs.later.vehicles.drive(...)`", so each side expects the other.
     - Board cards B1/B2 (읍, `veh:sled`), B3/B4/B5/B9/B11 sit at 0/1 forever.
     - Event drives B6/B7/B8/B10/B12 always expire with "— 다음에 또 도와줘요!".
     - `targetOf()` returns `null` for drive steps, so there is no hint either.
  2. **E1 (lost puppy) and E3 (lost Ppoppi) have no `giver`.** Their 2nd step `lead` completes only near `i.gv`
     (`host.js:178-180`), so it can never complete. Repro `node $S/t_lead.mjs`:
     - E1 and E3 reach g=[1,0] and stay there through 1,800 s of walking past every person and place, with
       `targetOf → null`.
     - A9 (which has a giver) completes.
  3. **E13 `ask` and C12 `pay` have no handler anywhere.** E13 is unlocked by `paper`, so it appears in v5. Neither has
     a deadline, and board cards never go stale (`eventStale` only covers `s === 'a' && src === 'event'`).
- **Measured** (`node $S/t_clog.mjs`, 읍 with stable, depot, paper and a penguin; a player who finishes every
  finishable board card within a minute):
  - A player who never swaps: from minute 10 to minute 120 the board is `B2✗ B1✗ E13✗`.
  - A player who taps 다른 미션 whenever allowed: 123 swaps in 2 h, and most 10-minute samples still show 2–3 dead
    cards. Parked dead cards come back through `fillBoard`'s 50 % resume.
- **Fix:**
  - **(a)** Own the drive start in the missions host. Either:
    - add a 출발 button on the drive card and the chip, plus a start pad at the route's first stop, calling
      `ports.vehicles.drive({ tpl: code, mid: id, vehicle, route, stops, cargo, capSpeed })`; or
    - write the opposite contract into both reports.
  - **(b)** Give E1/E3 a home place for `lead` (`to: 'p:kennel'` / pet home, or "back to the board"), and make
    `world()` use `u.to`/`u.at` when there is no giver.
  - **(c)** Implement `ask`: feed `tap` with `talk` while E13 is active → `step('ask')`, distinct residents only.
  - **(d)** Implement `pay`: a 불꽃놀이 후원 button on the C12 card that spends `minutes × I`.
  - **(e)** Safety net: board cards with no progress for `eventStale` leave quietly. `stepCaps()` should require a
    `step:<how>` fact that the host answers only for owners that are actually wired (e.g. `step:drive` true only
    when `ports.vehicles.drive` exists).
  - **(f)** Change the oracle test to drive missions through `MissionsHost` with a fake chief, not through `m.step`.

### HIGH

#### H-1 · Daily F7 "꽃밭에서 꽃 5송이 꺾기" usually cannot be done, so "all three" and the streak break
- **Where:** `src/missions/view/CraftPads.js:60`. The flower-bed pad exists only while
  `need[item_bouquet] > 0`, i.e. while A5, C1 or C8 is running.
  - The `flower` signal comes only from `craft('item_bouquet')` (`missions.js:499`).
  - No v4 code emits a `flower` event (`grep "emit('flower'" src` → none).
- **How often:** F7 is drawn whenever `b:deco_flowers` exists. With about 8 eligible dailies at 읍, that is about 3 days
  in 8.
- **Lab-confirmed** (`probe` (b)): F7 drawn, chief standing on the flowerbed spot for 6 s → `bedPadShown: false`,
  progress 0.
- **Fix:** show the bed pads while F7 is in today's dailies and not done. Let picks above the bag cap still count for
  F7 (or remove the cap check from the `flower` signal).

#### H-2 · Real-clock dailies stop rolling in a tab that stays open (mobile resume)
- **Where:** `src/missions/model/calendar.js:48-57`.
  - A launch that rolls a stale save (the usual case) sets `rolled = true`.
  - Every later date change in the same page life is ignored until `uptime` passes 20 h.
  - `uptime` is `performance.now()`, which on phones usually does not advance while the device sleeps.
- **Repro** `node $S/t_daily.mjs`:
  - Open at 20:00 with a 3-day-old save → rolled.
  - Phone sleeps; next morning 08:10 → `dy.d 20735`, today `20736`: "STILL YESTERDAY'S" dailies.
  - Even with honest 12 h of uptime the dailies stay stale.
- **Impact:**
  - "오늘의 미션" shows yesterday's (often already finished) set for most of the day.
  - Completing yesterday's set credits the streak to yesterday (`streakDay(dy.d)`), so streaks break.
- **Fix:**
  - Always allow the natural step `key === dy.d + 1`. Block only jumps of more than one day inside one page life, or
    drop the per-launch rule: keys only move forward, and a reload bypasses the rule anyway.
  - Use wall-clock deltas, not `performance.now()`, for any uptime logic.

#### H-3 · C1 결혼식 준비 deadline ignores the story's wedding date (the designer's headline "first mission")
- **Where:** `missions.js:161-176` (`dueOf`) together with `src/story/model/lifeRules.js:101`.
  - story_runtime emits `story:life { op: 'engaged', a, b, day, hour: 11, venue }`, where `day` is the wedding day and
    there is no `at`.
  - `dueOf` falls back to "the next 10:30".
- **Repro** `node $S/t_c1.mjs`:

  | Engaged at | Wedding | C1 due | Wedding prep beat |
  |---|---|---|---|
  | 09:30 | next day | in **26 s** | in 25 game h |
  | 09:30 | 2 days later | in 26 s | in 49 game h |
  | 14:00 | 2 days later | in 20.5 game h | 44.5 game h — a day early |

  B6 (wedding cake drive) has the same bug.
- **Impact:**
  - The mission needs 20 bread, 20 grilled fish, 10 meat, 6 bouquets and a cake, so it is impossible.
  - It fails with "— 다음에 또 도와줘요!" while the wedding happens later unprepared.
- **Fix:**
  - In `storyIds()`, convert `day/hour` to game T (`at = (day - engineDayOffset) * 600 + (hour - 8) * 25`, using the
    host's day mapping), or ask story_runtime to send `at`.
  - Test with the real payload shape.

#### H-4 · Event missions whose triggers or steps are never sent by the real sibling modules
All verified against the sibling source:

| Mission | Problem | Evidence |
|---|---|---|
| C3 아기 이름 짓기 | `choose` is never reported. story_runtime emits `story:life { op: 'named', who }` instead. After the chief delivers the gift box, C3 still ends "late" at 600 s with "다음에 또 도와줘요!" | `src/story/host.js:697` |
| C4 첫 등교 | No `school` op is emitted by story_runtime | ops emitted: baby, birthday, engaged, farewell, goodnews, grownup, lastday, named, sweetheart, wedding |
| C7 소원 / C7a age80 | The story uses `story:wisher` and its own wish cards, closing them with `mission:done { wish }`. The missions trigger `story:life op 'wish'` / `'age80'` never fires | `lifeRules.js:168, 224-234` |
| A21 이삿짐 (from incidents) | `inc:move` carries numeric `who` + `whoPid`, but `storyIds()` runs only for `story:*`. `gv = 3` (a number) → no bubble position → revalidate expires it as `gone` within 5 s | `node $S/t_a21.mjs`: "expired after 4 s: gone" |
| D10 수출 계약 | `contract` is never stepped. The harbour signals a full contract with `harbor:export { id, done: true }`, which missions ignore. Every cargo ship spawns a D10 that always fails | `src/harbor/model/HarborModel.js:108`, `trade.js:5` |
| G4 수출 왕 | `harbor:export { n: 0, expired: true }` counts +1 export (`n1()` turns 0 into 1) | `signals.js:34` vs `HarborModel.js:148` |
| C2 축사 | The story's Wedding scene places the chief itself at the arch-relative officiant point and speaks the line. `p:officiant` must be that same point, or the stand step and the scene will fight | `src/story/view/scenes/Wedding.js:43,70,93` |

- **Fix:**
  - Normalize ids for every `{ who, whoPid }` payload, not only `story:*`.
  - Map:
    - `story:life named` → `report({ how: 'choose', code: 'C3' })`, matched on the family;
    - `story:wisher` → C7;
    - `harbor:export done` → `step(D10 with k === id, 'contract')`.
  - Fix `n1` for explicit zeros.
  - Correct §11.6 ("events already match" is not true).

#### H-5 · Patch P28 (loan offer on a short pad) nags in a loop, hides "코인이 모자라요", and churns a Promise per frame
- **Where:** `docs/build_reports/missions_bank.md` §11.5 P28 against `src/entities/UnlockPad.js:245-248`.
  - The patch resets `_asked = false` when the chief declines (`.then((ok) => { if (!ok) this._asked = false; })`).
  - The next frame, the chief is still on the pad with 0 coins, so `LoanSheet.ask()` reopens at once. "괜찮아요" can
    never be accepted.
- **When `offerFor` resolves `false` without UI** (loan already open, `quote` null): the block runs every frame and
  `return true`s before `notEnoughCoins`. The player gets neither the toast nor a loan, and 60 Promises are created per
  second.
- **Fix:**
  - Reset `_asked` only where `_warned` is reset (stepping off).
  - When `quote()` is null, fall through to the v4 toast.
  - Call `ports.ui.panelOpened(true/false)` around the loan sheet so v4 input is blocked the same way as for the other
    panels.

#### H-6 · Patch P31 hides v4's order chip, and the promised replacement does not exist
- **Where:** §11.5 P31 (`src/scenes/UIv4.js:93`) and §6.2 of the plan ("v4 standing orders appear as 생산 목표").
  `grep focusCard|standing src/missions` finds nothing that turns `Growth.cards` into board cards.
- **Impact:** after wiring, the chip that guides v4's shop-founding orders (the 읍 → 도시 growth loop) disappears.
  The mission chip shows unrelated goals in its place.
- **Fix:** either add a "standing order" mission source that mirrors `growth.focusCard()` (count = `got/need`, done when
  the v4 card completes, with no extra reward beyond v4's), or drop P31 and place the mission chip under the order chip.

### MEDIUM

#### M-1 · Patch P13 contradicts itself
- **Where:** `TownHall.openBoard()` and `TownHall.boardLines()`. `boardLines` is only used by
  `UIv4.js:381` (the hall board panel).
- **Problem:**
  - P13 short-circuits `openBoard()` to the missions panel, so v4's hall board (requests, village numbers, settlers,
    restaurant special) is no longer reachable.
  - P13 also pushes mission lines into `boardLines()`, which now no one shows.
- **Fix:** keep v4's board and add a "촌장 미션 보기" button in it, or move v4's news into a missions tab.

#### M-2 · The gift-wrap pad takes goods without making a gift
- **Where:** `CraftPads.js:99-106`. It takes up to 3 goods one by one, and crafts only if `got >= 3`. With 1–2 goods,
  they are simply consumed, again every 0.6 s.
- **Lab-confirmed** (`probe` (a)): 2 bread → 0 bread, 0 gift boxes.
- **Fix:** check `sum(count) >= giftItems` before taking anything. Show "물건 3개가 필요해요" otherwise.

#### M-3 · Up to 4 request bubbles on screen at once (plan: ≤ 2)
- **Where:**
  - `RequestBubbles.update` draws every offered bubble.
  - The model honours `bubblesOnScreen` only when choosing a giver, by testing the camera at spawn time.
  - `spawnEvent` (A8/A12/A21 bubbles) ignores `bubblesWorld` entirely.
- **Evidence:**
  - Lab `probe` (c): `onScreen: 4`.
  - Visible in `docs/previews/missions_lab_plaza_bubbles.png` and `missions_lab_zoom06.png`.
  - At zoom 0.6 the bubbles are scaled up ×1.29, so four of them dominate the plaza.
- **Fix:** show at most 2 by distance to the chief and fade the rest to a small heart dot. Count event bubbles against
  the world cap.

#### M-4 · The proximity accept card nags while the chief works next to a giver
- **Where:** `host.js:136-149`.
  - The bakery operator is `npc_aunt` (`src/data/world.js:462`, operator spot about 14 px from the bakery pad), and A1
    (weight 3, the most common request) uses her as giver.
  - Standing still on the bakery pad for 0.5 s opens the card. "나중에" suppresses it for only 20 s.
  - The card's background is interactive and covers the lower third of the screen (`Overlays.js:30-31`), where the
    thumb steers. v4's UI ignores pointer-downs over interactive objects (`UI.js:122`), so a drag starting on the card
    does not move the chief.
- **Fix:**
  - No proximity accept while the chief is on a v4 pad, or require walking up to the giver.
  - Lengthen the "나중에" pause per bubble (e.g. until it pops).
  - Make the card shorter, or let drags pass through except on its buttons.

#### M-5 · Korean text quality
- **Elder titles:**
  - C7 `'{name} 할머니의 소원'`: story elder names already carry the title (`lifeRules.js:63-69`), and elders can be
    male.
  - `node $S/t_misc.mjs` shows "순자 할머니 할머니의 소원 (3가지)" and "만복 할머니의 소원".
- **A6:** the title is fixed as "할아버지 난로에 장작 10개", but the giver is `role:elder` (`npc_grandma` and 순자 할머니
  are elders). Her thank-you line is old-man speech ("고마우이!").
- **A11:** the title says "목수 아저씨" for any `owner:carpenter_workshop`.
- **A12:** the giver is `ev:family`, but story `birthday` sends only `who` (the birthday person). The child says
  "곧 지호의 생일이에요! 훈제고기 10개만 도와주실래요?" about their own party.
- **Weekly explanation lines:**
  - `wk_settle` "도시에 새 주민 모시기" is wrong: G6 counts logistics settlements (물류 정산).
  - `wk_celebrate` says "돌잔치", but C3 is the newborn welcome.
- **Fix:**
  - Use `{elder}` filled from the story's `elderName()` with the gender.
  - Make giver-dependent titles neutral ("어르신 난로에 장작 10개") or pick the line by gender.
  - Have A12's giver be a parent (ask story_runtime for `family` on birthday).
  - Rewrite `wk_settle` as "물류 센터 정산하기" and `wk_celebrate` as "결혼식·아기 축하·생일 잔치 함께하기".

#### M-6 · Non-pausing panels rebuild everything on a timer
- **MissionPanel:**
  - `contentKey()` includes `floor(T / 5)`, so the whole panel is destroyed and re-created every 5 game seconds,
    plus on any progress change.
  - Each rebuild re-creates 25–38 `Text` objects (one canvas and one texture upload each) and 36–107 display objects.
  - Measured in the lab (SwiftShader, niced): 8.5–17 ms per tab (`probe2`) and 10–21 ms per timed rebuild
    (`probe3`). That is a periodic frame hitch above the 16.7 ms frame budget while the village runs behind.
- **CounterSheet:**
  - Its key includes `coins.value()`, so it rebuilds on every coin change.
  - Lab `probe` (d): 300 rebuilds in 300 frames, 2.6 ms each (about 15 % of a 60 fps frame budget) while v4 income
    ticks.
- **Fix:** build once per tab and `setText`/`set()` the changing fields. Drop `T/5` from the key; update the deadline
  label in place.

#### M-7 · Chief titles reuse the village-rank badge art
- **Where:**
  - `MissionPanel.fameStrip` uses `ui_badge_rank_N`;
  - the title-up banner shows the same orange shield (`missions_lab_title_up.png`).
- **Problem:** the 읍 rank chip right above shows that same shield. The plan says: "`ui_badge_rank_*` stays for the
  village rank; fame titles use `ui_icon_title` + 1–5 small stars". The designer will read 믿음직한 촌장 as a village
  rank-up.
- **Fix:** use `ui_icon_title` + N stars (as the fame chip already does).

#### M-8 · `civ_bank` (5.02 MiB) is resident from 읍 on for everyone
- **Where:** `BANK_MODULE.prefetch` loads every `FRAGMENTS.bank` file at gate time (rank 2), long before the bank site is
  even offered. The plan asks for "bank cutaway layers only near row D (area class)".
- **Fix:** load `civ_bank` when the site is offered or built, and register it as an area residency class. Keep only
  `ui4_icons` / `ui_passbook` with the module.

#### M-9 · The integration contract for places and people is underspecified
- **Places:** the module needs about 30 place ids, plus a `list('flowerbed')`, `p:gift`, `p:bakery`, `findSpot(what, near, id)`
  and `sourceOf(item)`:
  `p:snowman, p:feast, p:officiant, p:statue, p:festival, p:picnic, p:carpenter, p:school_gate, p:towers, p:reporter, p:rink, p:depot, p:school, p:clinic, p:memorial, p:old_sign, p:bank, …`
  - §11.4 lists only facts; positions exist only in `tools/test/missions_lab/lab.js`.
  - `src/vehicles/layout.js:124` already defines `p:bakery` as a drive stop, at an offset that is not a cake pad spot.
- **People:** `people.pick` role semantics are defined only by `FakeWorld.pick`:
  - roles `role:kid|elder|adult|settler`, `owner:<shop>`, `friend`, `crush`;
  - `ctx.exclude`, `offScreen`, `of`, `rng`.
- **Also needed:**
  - `people.has()` must mean "exists in the registry", not "has a body now". Otherwise LOD or train trips expire
    missions as `gone`.
  - Pids must be strings.
- **Fix:** add a §11.4b table of every place id with its source (a world anchor or a story/vehicles point) and a
  `pick` contract.

#### M-10 · A 'once' card pushed out of the parked list is gone for good
- **Where:** `missions.js:413`: `remove(old); setCooldown(tplOf(old.c))`. For `repeat: 'once'`, this writes `-1`.
- **Affected:**
  - E4 (the harbour sign story beat);
  - B3 (the first-truck tutorial);
  - E2, E5, E6, E7, C14.
- **When:** after any 6 later swaps (by inspection; swaps are frequent because of C-2).
- **Fix:** never drop 'once' templates from parked (cap the others), or drop them without a cooldown.

#### M-11 · v8 fire insurance cannot be bought
- **Where:** nothing calls `bank.api.insure()` (`grep insure src` outside `src/bank`: none). The bank UI has no
  insurance button.
  - Meanwhile `src/city/incidents/strings.js:37` announces "보험으로 다시 지어요" on every ruin.
  - `insure()` silently refuses ids over 10 characters.
  - With 32 policies the slice can exceed 1 KB, since `fitBank` only trims rows (see L-8).
- **Fix:**
  - Add 보험 들기 on the counter sheet (list the chief's buildings, premium per day).
  - Make incidents' line depend on `bank.api.insured(id)`.
  - Hash long ids.

### LOW

| # | Finding | Evidence | Suggested fix |
|---|---|---|---|
| L-1 | "3 watchtowers" (E2) and "3 snowman statues" (C6) are three 3 s stands at one point (`places.pos('p:towers')`). E10 "donate a rare fish" needs no fish | `catalog.js:133,189,205`, `host.js:160-167` | Per-step `at` lists (`p:tower1..3`); carry the rare fish |
| L-2 | Craft state is not saved: a cake in the oven (12 bread taken) and the per-bed daily pick count reset on reload | `CraftPads.js:21-23` | Put `cake.t` / `picked` into the slice (a few bytes) |
| L-3 | Labels: hard-coded Korean in English mode (`'내일 또 피어요'`, `'초'`, `'빵 '` in `CraftPads.js:77,87,93`). "괜찮아요" as a loan decline is ambiguous (use "안 빌릴래요"). 15 text styles at 14–16 logical px (≈ 7.6–8.7 CSS px on a 390 px phone; v4's smallest is 17): shield line, week rewards, loan note, passbook | `strings.js:31`, `grep TXT(1[4-6]` | Move to `MSTR`; floor the sizes at 17 |
| L-4 | Passbook signs read oddly: "대출 +600" makes the balance −630; repayments show green "+100" | `missions_lab_bank_passbook_resident.png` | Two columns (맡긴 돈 / 찾은 돈) or signed amounts that move the balance the same way |
| L-5 | F5 "주민 3명과 수다 떨기" counts taps and messages, not distinct people; a talk tap followed by a sent message counts twice | `signals.js:28-29` | Count distinct `pid` per day |
| L-6 | Plan beats not built: the banker arriving at the bank opening and its first mission "첫 저금"; buying a bouquet at the 꽃집 for 25; hint "idle with nothing doable → nearest request bubble" | plan §6.2, §7 | Add, or list under deviations in the build report |
| L-7 | Passive "+5 per wedding or birth in our village" counts every wedding (story payloads have no `ours`) | `missions.js:296-297` | Ask story_runtime for `ours`, or check the venue |
| L-8 | Bank slice: 32 policies with 10-character ids exceed 1,024 B even with no rows; `fitBank` returns oversize (8-character ids fit: 1,010 B) | `$S/t_bank_size.mjs` | Cap policies at about 24, or store ids as hashes |
| L-9 | Known issue #5 is still open: 다른 미션 covers the fame reward on swappable cards | `missions_lab_panel_board.png` | Move the button under the reward column |

---

## 3. Balance, exploits and money

- **No money farming found.** Checks done:
  - Deposits repay a loan first, and interest needs `!loan`.
  - Loans are offered only on a short pad.
  - A fee waiver never creates coins.
  - Insurance pays only for its declared cost, and cannot be bought at all today (M-11).
- **Interest makes saving a dominant, risk-free move:**
  - 1 % per game day = 1 % per 10 real minutes. Coins must sit in the bank only at 06:00, and P28 spends savings on
    pads automatically.
  - The bonus is +500 coins per 10 min at the 50 k cap, and +1,500 at the v6 cap.
  - Acceptable, but tell the designer it is a passive bonus, not a decision.
- **Mission coins scale with the 5-minute income average** (`I`). Selling a stockpile just before finishing C10
  (4 min), D10 (4 min) or a weekly stage (5 min) inflates the payout, and also the loan limit (15 × I). This is
  minor. Fix it by computing `I` as the larger of 5-minute and 30-minute averages.
- **Real-week goals and casual players:** G2 "교통 왕" (200/500/1000 riders per real week) and G1 (10/20/35 requests)
  were not paced against casual sessions. The build report's pacing is oracle-only (its own §10.1). Re-check with the
  honest bots after C-2 is fixed: today the board contributes little.

---

## 4. Integration section (§11) against the real v4 code (`src/**`, read 2026-10-10)

| Patch | Anchor still matches? | Works as described? |
|---|---|---|
| P8 `Seller.complete` (`:355`), E2 trade loop (`:654`), P9 `Station` (`:140`), E1 `Shop.takeOut` (`:322`), E5 `Growth.payWholesale` (`:290`), E6 `DogPlay.start` (kinds treat/play/pet), P10 `DayClock` (`:76`), E3 `Boathouse` back state (`:203`) | yes | yes. `takeOut` is called only for sales, so counts are honest |
| P1 tap routing `UI.js:153` | yes | yes |
| P2 Settings `missionToasts` (`Save.js:389/398`) | yes | yes |
| P3 late fragments | `civic`, `fx_city` and `audio6` are not in `LATE_FRAGMENTS` (`Assets.js:39`) | the patch must add them (it says so); see M-8 for residency |
| P13 TownHall | yes | **no** (M-1) |
| P28 UnlockPad | yes (`:245-248`) | **no** (H-5) |
| P31 UIv4 order chip | yes (`:93`) | **no** (H-6) |
| P17 Rank fame bar | v4 `Rank` only has level 1 → 2; levels 3–4 are new work | out of scope here |
| §11.6 story / vehicles / incidents / harbour | — | **no**: H-3, H-4, C-2(1) |

---

## 5. What is good (keep it)

- **Pure, seeded model and saves.**
  - 0.0003–0.0005 ms per model tick; host 0.01–0.02 ms per frame (re-measured: 0.013–0.022).
  - Sanitizers never throw and are idempotent.
  - Calendar keys are DST-safe.
  - Money conservation is tested.
- **Real art used with care:**
  - the accept card with the giver's portrait and quote;
  - the bank cutaway with tellers, the ticket display and vault;
  - the passbook styling;
  - the title-up rays, ribbon and stars;
  - the 마을 악단 reward actually placed.
- **Most Korean lines are warm and natural** (A1, A4, A9, A13, A15, the bank strings). Board-card guidance text is
  in easy Korean.
- **Clean lab:** 0 console errors, 0 placeholders. The draw calls (5–8) and module display objects (26–41) are modest.

## 6. Suggested order of fixes

1. **C-1:** a one-line fix plus a test.
2. **C-2:** a drive starter, `lead` without a giver, `ask`, `pay`, a stale-board rule, and a host-level oracle.
3. **H-1 to H-4:** the F7 bed, the calendar rule, the C1 deadline, and event contracts with story / harbour /
   incidents. Agree each one with the owning module's report.
4. **H-5, H-6, M-1:** rewrite P28 / P31 / P13.
5. **M-2 to M-11**, then the lows. Re-shoot `missions_lab_*`, including a C7 card with a real elder name and an
   English panel.
