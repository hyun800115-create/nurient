# Critique: v4.4 plan (`docs/v44_plan.md`, `docs/기획서_v4_4_촌장성장.md`)

Adversarial review of the merged v4.3-extras / v4.4 / v4.5 / v4.6 / login plan, checked against the working tree on
2026-10-18 (v4.2 in final verification, 금방 module standalone). No source or test file was changed, nothing was
committed; the only file written is this report.

What was read: both plan documents and both drafts; `src/core/Save.js`, `src/scenes/{Game,UI,UIv4,UIv42}.js`,
`src/systems/{Progression,Tutorial,Navigator,Civic,Growth,Rank,Neighbours,V42}.js`, `src/systems/office/Office.js`,
`src/entities/{Player,Station,Seller,Register,Site,Warehouse}.js`, `src/systems/Economy.js`, `src/data/balance.js`,
`src/missions/**` (index, host, tuning, calendar, signals, catalog), `src/geumbang/model/GbModel.js` + `tuning.js`,
`src/core/Assets.js`, `tools/build/build_artifact.mjs`, `tools/apk/android/**`, `docs/build_reports/{v42_code1,v42_code2,
geumbang_module,apk}.md`. Checked live: `dist/artifact` file count (413), the Supabase org's projects (read-only
`list_projects`), the Supabase docs on deleting users. Arithmetic (level curve, SP totals, catch-up XP, reward shares) was
recomputed.

## Counts

| Severity | Count |
|---|---|
| Critical | 1 |
| High | 6 |
| Medium | 17 |
| Low | 14 |
| **Total** | **38** |

## Top findings (fix before anyone builds)

1. **C1 · 관리자 mode can delete the real village.** `Save.clear()` / `Save.quarantine()` / the title's save read use the
   `SAVE_KEY` constant; the plan routes only write / load / ChatSave through `Save.key()`. Pressing 설정 › 처음부터 inside
   admin mode, or a cheat state that throws on reload, removes the normal save. The test plan never exercises either path.
2. **H1 · The old-save catch-up stops at q109 for every existing player.** q109 ("스킬 창 열어 보기") is a `ui` state
   objective that no v4.2 save can satisfy, and §11.6 only treats counted quests and q206/q210 as "done if a later quest is
   done". A 읍 save would come out at Lv 3 instead of Lv 17, then replay ~40 quests one by one at full rates and have to
   redo the counted ones.
3. **H2 · Bag and boots now compete with four visible talents for the same scarce SP.** At q109 (≈ 3–4 min) the window
   shows only 손재주 · 넓은 손길 · 행운 · 설득력; the gear cards stay hidden until `hire_lumberjack`. D8's own numbers leave one
   spare SP by Lv 8. A human who spends early SP delays the bag by levels; the `bagfirst` bot cannot see this.
4. **H3 · The offline earnings budget only holds for one session a day.** The cap is per away-period. Three 10-minute
   sessions a day with ≥ 3 h gaps give 72 % extra income (150 % with the max 금고), against the 24 % / 50 % guardrail.
5. **H4 · The v5 parts of `missions_bank` switch on for every 읍 player in v4.4.** The board, request bubbles, events and
   fame are gated on `rank:2`. Kit-lite has no `people` / `places` ports, so the request code (`env.people.pick`) breaks,
   and weekly G1 ("요청 10개", `req_done`) can be drawn when it can't be done.
6. **H5 · One-shot 금방 events used as counted objectives can stall the chain for good.** `gb:letter`, `gb:open` and
   `gb:firstDone` fire once, and `gb:upgrade` has a finite supply. Each one can happen before its quest is active
   (q701–q705).
7. **H6 · The income meter `I` measures coins when they are collected, not when they are earned, and is empty after every
   load.** Attendance always pays its floor (the sheet opens at load, when I = 0). The migration's coin cap is 10 × 0. A
   hoarded till spikes every reward claimed in the next 5 minutes.

---

## Critical

### C1 — Admin isolation misses `Save.clear`, `Save.quarantine`, the title read and the backup keys

- **Plan**: §6.3 says "`Save.key()` returns the admin key while the mode flag is set. Every `Save.write` / `load` /
  `ChatSave` call goes through it". §18.1 point 5 and the Korean §2.3 tell the designer: "원래 마을 저장을 **절대 건드리지
  않아요**".
- **Code**: these all read or write the constant directly:
  - `Save.clear()` = `removeKey(SAVE_KEY); ChatSave.clear()` (`src/core/Save.js:532`);
  - `Save.quarantine()` moves `SAVE_KEY` → `BAD_KEY` and removes it (`:534`);
  - `keepCopy()` writes the shared `BACKUP_KEY` / `.backup.2` (`:497`);
  - `CHAT_KEY` is computed once at import (`:546`);
  - the title reads `readJSON(SAVE_KEY)` (`src/title/progress.js:55`).
- **Where those calls come from**: 설정 › 처음부터 › 네 → `Game.resetProgress()` → `Save.clear()` (`UI.js:1021`,
  `Game.js:2032`). A throw in `Game.build()` → `Save.quarantine()` (`Game.js:129`).
- **Failure**: the designer is in admin mode and presses 처음부터 to get a fresh test village (a natural thing to try).
  The normal village and its chat record are deleted.
  - The `.normal` copy survives, but nothing restores it.
  - The next "켜기" (§18.1 step 2: "copy `SAVE_KEY` → `.normal`") overwrites it with the empty village. The loss is then
    permanent.
  - Admin cheat states (모든 땅 열기 at minute 0, 고용 전부) are also the states most likely to throw on reload, which takes
    the quarantine path. That path deletes the normal save as well.
- **Fix**:
  1. Derive every key from `Save.key()`: save, `.chat`, `.backup`, `.backup.2`, `.bad`, and the title progress read.
  2. Make the derived key the only export (no `SAVE_KEY` import outside `Save.js`), and grep-test it.
  3. Never overwrite `.normal` when it differs from `SAVE_KEY` without a third copy.
  4. Add `원래 마을 되살리기` (restore `.normal`) to the admin panel.
  5. Add to §22.2: 처음부터 in admin mode, a forced build throw in admin mode, and the title shown in admin mode. Each one
     must be followed by an exit + hash compare of the normal save.

## High

### H1 — Catch-up halts at q109 (and q603), so no existing save gets its catch-up

- **Plan**:
  - §11.1 lists `ui` (a panel was opened) as a *state* objective.
  - §11.6 step 1: "A counted quest counts as done when any later quest … is done. q206 / q210 count as done when the
    migrated rank is ≥ 1." Step 2: "every quest before the first not-done one completes".
- **Code fact**: no v4.2 save can have `ui:skills` (the window does not exist), and `ui:*` facts are not in any v7 slice.
- **Result for a 읍 save**:
  - Only q101–q108 auto-complete: (20+20+25+25+30+30+30+40) × 2 = **440 XP = Lv 3**. The plan claims Lv 17.
  - SP: 2 (levels) + 2 (gift) − 9 (base ranks), floored at 0 → **0 SP**. The plan's card says 18.
  - Opening the window then completes q109, and each later state quest completes 1.5 s after it becomes active.
    That is ≈ 40 × 1.5 s of chip pops at ×1 XP and **uncapped** normal coin rewards (the 10 × I cap only applies to the
    catch-up), auto-claimed into a 20-row mailbox.
  - Every counted quest must be replayed by hand, because `mig.cu` is already 0: logs, planks, plank trades, bread, ore,
    ingots, meat, cans ×20, a letter reply, 50 export crates.
  - q603 (`ui officeStock`) blocks Ch6 saves the same way.
- **Fix**:
  - In catch-up, every objective that is not a progress fact (counted, `ui`, `skill`, `tap`, `dogAct`, `letterReply`,
    `gb:*`) counts as done when a later *progress-state* quest is done.
  - Then run the "first not-done" scan.
  - Add v4.2 fixtures at Ch1/Ch2/Ch5/Ch6 to the catch-up audit. Its expected "≈ 11 / 14 / 17" would have caught this, so
    the fixtures must exist before the chain is written.

### H2 — Gear skills share SP with talents; the first skill-window visit shows only talents

- **Plan**: D8 gives the gear ranks 1 SP each, unlocked at `step:hire_lumberjack`, with level gates (bag 2/3/4/6/8/20,
  boots 2/4/5/7). D9: q109 "open the skill window" closes Ch1. §10.1 hides every card before its unlock.
- **What the player sees at q109** (≈ 3–4 human min, Lv 2–3, 1–2 SP and a red SP dot):
  - 손재주 (start, r1 at Lv 3), 넓은 손길 (start, Lv 4), 행운 (start, Lv 7);
  - 설득력 (`step:hire_clerk_market`, ≈ minute 1, Lv 3).
  - No bag or boots. Spending the SP is the obvious move.
- **The arithmetic**: D8 says bag 5 + boots 4 need 9 SP by Lv 8, and only 10 exist then (8 level SP + Ch1 + Ch2).
  - That leaves **1** spare SP for talents in the first ~18 min.
  - Every extra talent point pushes boots 4 / bag 5 back by one level (430–560 XP, ≈ 3–5 min).
- **The level gates bind as well**: bag 4 needs Lv 6, bag 5 Lv 8 (≈ 18 casual min). In v4.2 the smart bot buys bag 1–5 as
  soon as coins allow after `hire_lumberjack` (`review_gameplay_bot.js` `upg: 'greedy'` over `prog.upPads`).
- **So D8's claim is wrong**: "same earliest purchase and same coin flow as v4.2" does not hold.
- **Why the gate misses it**: the pacing gate (§22.4) runs only `--skills bagfirst`, which hoards SP for the bag.
- **v4.2's own data**: the guide said bag/boots take 18–30 % of first-15-minute spending. A delayed bag slows every haul
  before village complete.
- **Fix (simplest; keeps "레벨이 오르면 배워요")**:
  1. Gear ranks cost **0 SP**: coin fee + level gate only, the same money flow as v4.2. SP are for talents only.
  2. Gate only bag r6 (Lv 20) by default (`gearLvGate` applies to r6 only).
  3. MIGRATE / catch-up then needs no "subtract 9 SP".
  4. Show the gear cards from minute 0 as locked ("나무꾼을 고용하면 배울 수 있어요").
  5. Add a `--skills eager` bot that spends each SP on the first visible card, and gate pacing on it too.

### H3 — Offline earnings: the per-away cap is not a daily budget

- **Plan**: §13.3: `coins = round10(min(away, cap) × rate × I_day)`, cap 3 h at 4 % (金庫 r2: 5 h at 5 %), one settlement
  per load. §2 guardrail 3: offline ≤ 24 % (≤ 50 % with the max vault), "for a casual player at 30 min a day".
- **Numbers at 읍** (I_day ≈ 2,400 / min, the v4.2 census at 40–60 min was 2,432):
  - one away period of ≥ 3 h = 3 × 60 × 0.04 = 7.2 min of income = 17,280 coins;
  - 30 min in 1 session/day: 7.2 / 30 = **24 %** (the plan's case);
  - 3 × 10 min/day with gaps ≥ 3 h (morning / lunch / evening, the normal mobile pattern): 21.6 / 30 = **72 %**;
  - vault r2 (5 h, 5 %; gaps 5 h, 8 h, 11 h): 3 × 15 = 45 / 30 = **150 %**.
- **With the calendar, attendance and gifts on top**, a 3-session player gets ≈ 0.9–1.7× their play income for free.
  That roughly doubles progress per minute played, the exact inflation the brief warns about.
- **Fix**:
  - Cap offline per real day: `capH` hours of credit per day key, shared across sessions. A simpler variant is a "기다림
    통장" that refills at most `capH` per 24 h.
  - Keep the vault effect to rate / cap within that daily credit.
  - Re-run the §22.4 reward-share bot with 1 × 30, 3 × 10 and 6 × 5 sessions.

### H4 — The v5 sub-modules of missions_bank turn on at 읍 in v4.4 without their ports

- **Plan**:
  - §4 table: "sub-gates: chain always · calendar `q:q211` · board / requests / events / fame / craft / followers `rank:2`
    (as built)".
  - §5.2: kit-lite Ports leave out "people, places, town, roads, water, sites.offer, residency".
  - §23: "v5 ports stubbed null in the new tests".
- **Code**:
  - `MissionsHost` maps `env.people = { pick: (r, c) => P.people.pick(r, c), … }` (`src/missions/host.js:47`).
  - `MissionModel.make()` calls `env.people` for every giver (`model/missions.js:136`).
  - Request A1 and the board templates unlock on `['rank:2']` (`data/catalog.js:29`).
  - Weekly G1 `wk_good_chief` counts `req_done` and unlocks on `['rank:2']` (`catalog.js:238`). The plan keeps G1–G3 on
    their old unlocks (§12.3).
- **Failure**: every player past 읍 (the designer included) meets `rank:2` in v4.4. Request offers then throw on
  `P.people` being undefined, or show half-wired bubbles. In v4.5, some weeks draw G1, which nobody can finish.
- **Fix**:
  - Add a hard `v5Parts: false` switch in `BALANCE.v44.missions` that removes these sub-modules entirely in v4.x.
  - Unlock G1 / G3 on `v5` / `life`.
  - Test with a real 읍 save in the real game, not with stubbed ports.

### H5 — One-shot module events used as counted objectives can be missed for good

- **Plan**: §11.1: counters start when a quest becomes active; module events (`gb:*`, letters) are counted. Ch7:
  - q701 `gb:letter`;
  - q702 `gb:open`;
  - q703 `gb:firstDone`;
  - q704 `gb:delivered` ×30;
  - q705 `gb:upgrade` ×1;
  - q706 `gb:deal`.
- **Code** (`src/geumbang/model/GbModel.js`):
  - `gb:letter` is emitted once (`seen |= SEEN.letter`, line 158), when a game day passes after the depot is built
    (q608) — possibly while q609 (50 export crates) is still active;
  - `gb:open` fires once (line 190);
  - `gb:firstDone` once (line 402);
  - upgrades are a finite list (`tuning.js:38`: pack2, van2, van3, sled2, lockers), so a rich player can buy them all
    while q704's 30 deliveries are still counting.
- **Failure**: if the event fired before its quest was active, the quest never completes. Ch7 is the last chain chapter
  in v4.x, so the chip sits on an impossible quest until v5, and Ch8 is blocked behind it.
- **Fix**:
  - Every one-time event becomes a **state** fact. 금방 already exposes `letterDue()`, the open state `gb`, `firstDone`,
    and the upgrade levels.
  - Add a chain test: each event-type objective must be repeatable without limit, or have a state fallback.
  - The §22.1 "closure" test does not catch this.

### H6 — The income meter `I`: collection-time, empty at load, spikeable

- **Plan**: §2 guardrail 1: `I` = coins earned per minute, rolling 5 min, sampled from `economy.earned` (§5.2). Every reward
  in the plan scales on it: quests, dailies, attendance, gifts, catch-up, respec.
- **Code**:
  - `Economy.earned` grows only inside `Economy.add()` (`src/systems/Economy.js`).
  - `add()` runs when someone collects a till:
    - the chief standing on a `CashPad` (`Seller.js:69`, **no cap** on `value`);
    - the station / rent till (`Growth.js:605`);
    - the depot till (`DepotSystem.js:107`);
    - 딸랑이's deposit (`Office.js:336`), who rests 21:00–07:00 game time.
  - Sales made between collections do not count until the till is emptied.
- **Failures**:
  - **Empty at load**: the meter has no samples for the first minutes after a load.
    - The 출석 sheet opens "on the first load of a new day key" (§13.1), so day 1/3/5/7 always pay the floor (30 × era)
      instead of 0.5–2 × I. At 읍: 30 instead of 1,200–4,800 coins.
    - The catch-up's "coins capped at 10 × I" evaluates to 10 × 0, while the card promises "코인 18,000".
    - Any quest claimed in the first 5 minutes after a load pays its floor.
  - **Spikeable**: leave the market till for 10 minutes and collect at once. The 5-min average jumps (e.g. +800 / min on
    I ≈ 900), and every reward claimed in that window is about +90 %. The mailbox (20 rows, `받기` later) lets a player
    time that, if a row's amount is computed at claim.
  - **Night dip**: rewards claimed during the courier's night are smaller and morning ones bigger, which makes no sense to
    a player.
  - **Refunds counted**: `Progression.syncPads` / `openBench` refunds and the debug key also go through `add()` without a
    tag, so they count as income.
- **Fix**:
  - Measure value **created** (register / merchant sales, rent and tax accrual, exports, depot sales, 금방 settle) through
    a feed event, not collection.
  - Persist the meter (5-min ring + `I_day`) in the `later` slice and seed it on load.
  - Clamp `I` to ≤ 1.5 × the 30-min average.
  - Fix every reward amount when it is granted (store it in the mail row).
  - Tag refunds `refund`.

## Medium

### M1 — v4.3 "시험 도구" is not file-disjoint from 금방

- D1 says "none of the three touches a 금방 file". The 금방 integration patches are exact old → new replacements that
  must match once (`geumbang_module.md` §8):
  - G-P1 edits `src/scenes/Game.js` (serialize fallback);
  - G-P5 edits `src/core/Save.js` (`keepGeumbang`, lines 236–237);
  - G-P13 edits `Save.js` Settings (line 578) and the `UI.js` 놀이 tab.
- The extras edit the same three files: `Save.key()` + `keepChief` in Save.js, `dt × spd` in `Game.update`, the 이름 /
  저장 코드 rows and the version-label door in UI.js.
- "금방 바로 열기" also goes through `geumbang/ports_v4.js`.
- **Fix**: land G-P1/5/13 first and rebase the extras on them, or give one builder ownership of Save.js / Game.js / UI.js.
  The cut line to v4.3.1 should be the default, not the fallback.

### M2 — The settings 놀이 tab has no room for the new rows

- Rows sit at `Y(i) = cy − 262 + i·84` (`UI.js:973`); the footer buttons are at `cy + 330`. The 놀이 tab already uses
  Y(0)…Y(5) plus the hint at Y(6) (`UI.js:1040–1050`), so a 7th row collides with 처음부터 / 다시 불러오기.
- Rows waiting to go in:
  - v4.3: 촌장 이름 ✎, 저장 코드 내보내기 / 가져오기, and G-P13's 금방 알림 row;
  - later: `xpFloat` (v4.4), `missionToasts` (v4.5), `shortageToast` (v4.6), `cloudAuto` (login).
- **Fix**: add a fourth tab ("촌장": 이름, 저장 코드, 알림, 경험치 숫자) in v4.3, or make the tab body scroll. Budget it in the
  v4.3 effort. The login track's "3 plates of 168" becomes 4 × 168.

### M3 — Office staff quests are out of the game's hiring order

- `Office.js:27`: `ROLES = ['sem', 'ttal', 'bok', 'chong']`, and the hire pad offers them in that order (`nextRole()`).
- Ch6 asks q602 셈이 → q604 **소복이** → q606 **딸랑이**. At q604 the pad offers 딸랑이, so the quest asks for something the
  map does not offer.
- **Fix**: reorder to sem → ttal → bok (q604 딸랑이, q606 소복이), or reorder ROLES. Check q605 (편지 답장) against
  소복이's role (`VillageNews.reporter`).

### M4 — Passive quests block the single quest slot and hide "다음 목표"

- These are waits, not tasks: q403 첫 기차, q406 가게 1, q409 솔방울 마을 (needs `f:townInvite`), q412 가게 3, q508 가게 5,
  q510 주민 45.
- `Progression.nextGoal()` skips passive goals in progress and shows the next workable one. The plan hides `obj_next`
  while `chainCovers()` (§11.4), so during each wait the only guidance is a chip saying "wait".
- **Fix**: `chainCovers()` returns false while the active quest is passive, or the chip shows "기다리는 동안: 대장간 짓기"
  from `nextGoal()`. Mark those quests `passive` in `data/chain.js`.

### M5 — Catch-up timing: `afterRestore` runs before the village life exists

- §5.1 places `this.later.afterRestore(sv)` after `restore(sv)` "…". In `Game.build()`:
  - `v42.afterRestore` is at line 232;
  - `this.life = new VillageLife(...)` at 254 and `DogPlay` at 256 come after it.
- `Rank.people()` = `gs.life ? gs.life.people() : 0` (`Rank.js:31`). A catch-up placed next to `v42.afterRestore` sees
  0 people, so q510 fails, and the scan stops there for every 읍 save.
- **Fix**: run the catch-up on the first `update()` tick after `build()` (`life`, `dog`, `civic`, `v4` and the `gb` system
  all exist then), and state that in §5.1.

### M6 — The daily-features gate depends on optional quests

- D5: 오늘의 미션, 출석 and 접속 선물 open only when **q211** is done. Reaching q211 needs:
  - q109 (open the window);
  - q206 (learn 큰 가방: SP + 40 coins);
  - q210 (learn 가벼운 발걸음).
- A player who ignores the skill window, or has no SP after spending on talents (H2), never gets dailies, attendance or
  gifts. The plan's own `--skills none` bot would never see them.
- **Fix**: gate on a progress fact (`step:hire_farmer`, ≈ the same minute) **or** q211, whichever comes first.

### M7 — 인기도 and the v4.6 `max()` undo the v4 happiness fix and can pull 읍 forward

- The rank-2 bar is `Growth.happiness()` = 30 + 70 × visitor mean + `Civic.happyBonus()` (capped by `civic.happyCap`
  = 12) + news bonus (≤ 5) (`Growth.js:491`). Rank 2 needs 80.
- The v4 review lowered `happyCap` 24 → 12 because decor alone made the bar meaningless (balance.js comment).
- 인기도 adds +6 to that cap, so it raises the 읍 bar directly. §10.3 lists it only as "settlers / visitors a little more
  often".
- v4.6 makes the bar `max(old, new)`, with resident happiness at "65–75 new, 85–95 cared-for". The 80 gate then passes for
  most villages.
- The pacing gate checks only "읍 ≤ +5 %" (not slower), so a much earlier 읍 would pass unnoticed.
- **Fix**:
  - 인기도's `happyCap` applies to settlers / visitors only, not the rank bar.
  - v4.6 keeps the rank bar on the old metric (or recalibrates `rank[2].happy` by bot).
  - Gate 읍 two-sided (±5 %).

### M8 — 뚝딱 건축 (the designer's "건축시간 단축") barely changes anything

- Build times are short: towers 7–10 s, buildings 6–14 s, depot 20 s, houses 30 s, shop founding 25 s
  (`balance.js` towers, buildings, v4.houses, v4.founding). The real wait is materials arriving.
- −10 % / rank saves 1–3 s per building.
- r3 "목수 2 → 3" has **no** effect: `Site.update` advances `buildT += dt × min(1, working / builders + 0.25)`
  (`Site.js:331`), so more builders never build faster.
- r2 (site porter capacity 10 → 14, `Worker.js:697`) is the only real effect.
- **Fix**: aim the skill at the waits players notice:
  - material delivery: site porter capacity, site priority for porters;
  - founding 25 s, the ribbon's 90 s auto-open, the 금방 opening pad;
  - or make r3 "목수가 공사장에 자재를 가지러 가요".
- Drop the no-op builder rank.

### M9 — Gift spots and the mailbox overflow, so earned decor gets lost

- **Gift decor arrives at about 5–6 a month**: weekly stage-3 decor (5 rotating), the monthly card decor, two per
  28-day attendance board, and streak vouchers.
- **Spots**: there are 12 gift spots, and nothing can be put away. They are full in about two months.
- **After that, rows pile up**:
  - placeable gifts then "stay in the mailbox";
  - the 20-row rule only auto-claims coins;
  - the `rewards` slice is capped at 1,536 B, and `fitCap` drops what does not fit.
- That breaks guardrail 8 ("nothing that was earned is ever taken away") and the Korean doc's "쿠폰은 절대 사라지지 않아요".
- **Fix**: store gifts and coupons as counts per kind (`{ igloo: 3 }`), add a 보관함 (put away / place again), add spots
  with rank, and define overflow for non-coin rows (a duplicate gift beyond N → XP).

### M10 — A stale tab or older build next to a v8 save

- `Save.load()` with an unknown version: `keepCopy` → `return null` → a fresh game, whose next autosave overwrites
  `SAVE_KEY` (`Save.js:506–523`). The player sees an empty village, and their v8 village sits in a backup slot with no way
  back.
- A v4.3 tab **already running** keeps autosaving its v7 state over the v8 save every 5 s.
  - The next v4.4 load migrates again (`MIGRATE[7]` sets `mig.cu = 1`).
  - It drops levels, skills and quests.
  - It re-grants the +2 SP gift and the catch-up.
- §22.3 claims a stale tab "cannot destroy a v8 village". The rule it relies on only protects the copy, not the player's
  view.
- **Fix, in v4.3 (the build that will become stale)**:
  - never write when the stored `v` > `SAVE_VERSION` (show "새 버전에서 저장된 마을이에요 · 새로 고침해 주세요");
  - single-writer guard via the `storage` event / BroadcastChannel;
  - a "보관된 마을 불러오기" row for `BACKUP_KEY`.
  - In v4.4: `mig.cu` only from a save that has no `chief.xp`.

### M11 — XP farm: the warehouse drop loop

- `chiefDrop` gives 1 XP per 3 items for drops to "station / shelf / site / order / shop / food / **warehouse**" (§7.2).
- The 창고 has an `inPad` and an `outPad` 1–2 m apart (`Warehouse.js:35–36`). Filling a 30-item bag at
  `padItemInterval 0.075 s`, then walking and dropping, takes ≈ 7 s a cycle → ≈ 10 XP every 7 s ≈ 85 XP / min.
- That is at least the casual XP rate (§9.4 implies ≈ 5,000 XP / h), so the loop about doubles levelling for anyone who
  finds it.
- **Fix**: no drop XP into the warehouse, nor into any sink the item was just taken from; or cap drop XP per day key.

### M12 — HUD: hit-area overlaps on row 1, and the 금방 chip is missing from the stack

- **Row 1** (§19.1): ribbon 343–453, 우편함 hit 446–534, 선물 상자 hit 524–612, so neighbouring hit areas overlap by 7 and
  10 logical px. That breaks the plan's own rule ("no two interactive objects overlap; ≥ 88 hit").
- **The stack**: 금방's chip sits at a fixed (28, 445), 172 × 50 (`geumbang/view/GbChip.js`). It is v4.3, so it exists
  before the stack manager, but the order list "quest → pop/rank → order → work → mission" leaves it out. The 4-row stack
  ends at ≈ 444, so the two collide.
- **Fix**: space row 1 at ≥ 92 px centres (ribbon 392, mail 488, gift 584, settings 658 still fit), and register
  `GbChip` in `Stack.js`.

### M13 — Admin time ×2 / ×4 by multiplying `dt`

- §18.2 multiplies `dt` in `Game.update` and sets `tweens.timeScale`.
  - At 408 px/s × 4, the chief moves 27 px per 60 fps frame, against a collision radius of 16. Porters, the train
    dwell, pad payment and `PickupPolicy` stillness timers all step coarser.
  - `gs.time.delayedCall` (pad syncs, move-ins, letters) keeps real time.
- **Fix**: run `update()` N times per frame (sub-steps) and set `this.time.timeScale`; test the ×4 run with the existing
  `pickup` / `nav` / `rail` suites.

### M14 — Name sheet: Korean IME on button tap, and input font size

- **Button tap mid-composition**: Android Korean keyboards (Gboard, Samsung) keep the last syllable composing until
  another key or blur. If 이걸로 할게요 reads `value` on `pointerdown`, the name loses its last syllable ("눈송" for
  "눈송이"). §9.1 handles Enter during composition only, and §22.2 tests only Enter.
- **Font size**: the field's font must be ≥ 16 **CSS** px, or iOS Safari zooms the page on focus. The existing chat input
  uses 16 px (`ChatPanel.js:645`). The plan states sizes only in logical px (22 logical ≈ 11–12 CSS px at 360–390 wide).
- **Fix**: the button `blur()`s the field, waits for `compositionend` (or one frame), then reads. Add a CDP test that taps
  the button mid-composition. Set the input font in CSS px.

### M15 — Daily F18 and other templates that a late village cannot do

- F18 "직접 계산하기" counts `served` (`sold` with `register.chief`). `Register` clears `chief` whenever a clerk exists
  (`Register.js:82`).
- By the time the calendar opens (q211) the market clerk is long hired. A 읍 village usually has clerks everywhere, so
  F18 cannot be done.
- F22 "새 꾸미기 하나" needs a free plot. Late villages may have none.
- **Fix**: add eligibility facts (a register without a clerk exists; a free decor plot exists) and test every template
  against fixture saves at each tier.

### M16 — The pacing gate cannot detect a 5 % change, and the arrow no longer leads to bag/boots

- **The gate is inside the noise**:
  - "village complete within ±5 % (v4.2 smart bot: 19.3–20.7 min)" — those are two different runs (CODE-1 final 19.3,
    CODE-2 20.7);
  - the v4.2 report gives the bot's run-to-run spread as about ±1 min;
  - so a ±5 % gate on one run is inside the noise.
- **The arrow loses the gear**:
  - v4.2 `Tutorial` points the arrow at an affordable upgrade pad again and again (`Tutorial.js:141, 156, 170` loop over
    `prog.upPads`);
  - v4.4 replaces that with a one-time `skillHint`;
  - arrow-following humans (and the arrow-only bot) will buy bag/boots later;
  - `--skills none` is allowed +25 %.
- **Fix**:
  - Gate on the median of ≥ 5 seeded runs per policy.
  - Point the UI arrow at the Lv ring whenever a gear rank is affordable, using the v4.2 condition.
  - Gate the arrow-only bot at ±5 % too.

### M17 — Effort is optimistic

- **v4.3 admin at 1.25 days** covers 15 switches. They reach Territory reveal partners, Neighbours attach, tower sites,
  `forceAll` across hire2/hire3 tool pads, every v4.2 site, Growth houses / shop founding, the ceremony, crowd ×3 and the
  금방 gate. On top of that come separate save keys, restart, promote and the byte-compare test.
- **v4.4 at 10 + 3** covers:
  - the kit (≈ 35 hooked emits);
  - ≈ 25 skill call sites across ~15 files plus `reprice()`;
  - 68 quests × 3 strings × 2 languages;
  - the catch-up;
  - a HUD stack manager that replaces two existing layouts;
  - a generalised shell panel, the mailbox / coupons / gift spots (+ layout test) and the save bump.
- v4.2 needed CODE-1, a fix round, CODE-2, a fix round and a verify round.
- **Fix**: make the fallback split (v4.4 = kit + chief + skills; v4.4.1 = chain) the default, and plan an explicit
  review + fix round per version (+30–50 %).

## Low

### L1 — The admin door is at the top of the panel, not the bottom
The version label is drawn at `cy − 408`, between the close button (`cy − 478`) and the tabs (`cy − 348`)
(`UI.panelFooter`, `UI.js:1032`). The Korean doc §2.1 ("맨 아래 작은 글씨") and the `BALANCE.v44.admin.taps` comment
("설정 맨 아래") say bottom. Correct both to "설정 창 맨 위, 제목 아래 작은 글씨".

### L2 — `put_save` first-insert race
Two devices pushing their first save at the same moment both find no row; the second insert fails on the primary key and
returns an error instead of `conflict`. Use `insert … on conflict (user_id, slot) do nothing`, then re-select. The rest of
the SQL checks out:
- RLS uses `(select auth.uid())`;
- `security invoker` + `search_path = ''` + qualified names;
- OUT-parameter names never collide in an expression;
- Supabase docs confirm a user can be deleted from `auth.users`. A deleted user's JWT stays valid until it expires, so
  sign out locally after `delete_me`.

### L3 — `CompressionStream('deflate-raw')`
Needs Chrome 103+ / Safari 16.4+. The APK's minSdk 24 allows older WebViews. Ship a fallback frame (`SV7u.` uncompressed
base64url) and test both.

### L4 — 저장 코드 import overwrites `BACKUP_KEY`
That slot may already hold the `keepCopy` of an unreadable or future save. Use a dedicated `.import` slot (or keepCopy's
never-overwrite rule).

### L5 — An admin village can become the real one through 저장 코드
Export an admin village, exit, import it in normal mode: this skips the two confirms and `chief.adm`. Set `adm: 1` when the
admin village is created and show "관리자 마을" on the import preview.

### L6 — Skill icons from late fragments show placeholders
설득력 (`ui_icon_request`, ui3) is visible from about minute 1, but ui3 is fetched only when the tower_east site starts
(`Neighbours.prefetch`, ≈ 20 min). ui5 icons arrive with `v42_core` after the first sale. Load the few icons with the chief
module, or draw them on `ui7`.

### L7 — The missions module's prefetch at minute 0
D4 builds the missions module at minute 0, and its `prefetch` loads ui3 / life2 / audio3 (`missions/index.js` FRAGMENTS).
That puts texture memory and requests into the first minute. Sub-gate the prefetch with the sub-modules.

### L8 — The name sheet's trigger for v4.2 saves
"Old save: after the 새로워진 것 card, once": that card only exists for saves that came from v4.1 (`V42.js:49` `fromOld`,
`:107`). A v4.2 save never sees it. Define the trigger as `!chief.seen.name` after the first 3 s.

### L9 — Attendance and offline settle only "on load"
The APK keeps the WebView alive (`singleTask`, `onPause` / resume), so a phone that switches apps never "loads" again.
Also run attendance, offline and the gift day change on `visibilitychange` → visible, and on a day-key change in a running
tab.

### L10 — The minimum text size is small
22 logical px = 11 CSS px at 360 wide, and the new panels are text-heavy Korean. Use ≥ 26 logical for body text in new
panels.

### L11 — Supabase free-tier slots
`list_projects`: `nuripang` ACTIVE_HEALTHY, `gideon1-cell` and `idle-sword-master` INACTIVE. A new active project uses the
second free slot. Tell the designer that un-pausing either old project later would need one paused first (§25 item 1).
Also: Google's chooser will name `<ref>.supabase.co` as the app being signed into, unless a paid custom domain is used.

### L12 — Doc inconsistency on coupons
§9.4: "Lv 30, 40, 50 and 60 also give a decor coupon" vs `couponEvery: 10` (so Lv 10 and 20 too) and the Korean §4.3
"레벨 10, 20, 30… 마다". Pick one.

### L13 — 관망 and the play-time gifts
§13.2: "Active = a touch in the last 60 s, or a panel open. 관망 counts half." So does AFK 관망 count? As written, a phone
on a charger in 관망 earns all three boxes in 60 min. Say "관망 counts half only while touched within 60 s".

### L14 — APK file saves need a JS bridge
Photo mode and 저장 코드 "파일로 저장" produce `blob:` URLs. Android's `DownloadListener` cannot read `blob:` (and
`shouldOverrideUrlLoading` returns false for `blob:` / `data:`, `MainActivity.java:243`). §17.3 says "No JS bridge", but a
`@JavascriptInterface` `saveFile(name, base64)` is the standard fix. Budget it in v4.6 (and v4.3 if 파일로 저장 is offered in
the APK).

---

## Claims checked and found correct

- **Hook points**: the named hook points exist. They are:
  - `Game.moveItem`, `Player.impact` / `n.lastYield`, `Station` `outStack.push`, `Seller` `CashPad`, `Register.chief`;
  - `VillageLife.react`, `Neighbours.tap`, `ResidentChat` `onChange`, `DogPlay.start`, `DayClock.T += dt`;
  - `Growth.payWholesale`, `Shop.takeOut`, `VillageNews.answer`, `Office.hire`, `LineUpgrades.done`, `Freight.payExports`;
  - `ChiefPilot.start` / `stop`, `OfficePanel.show`, `HudV4.openRank` / `openOrders`;
  - `Site.start` / `buildCost` / `finish`, `Territory.reveal(id, instant, quiet)`, `Civic.choices` / `happyBonus`,
    `Growth.happiness`, `UI.panelFooter`, `Rank.ceremony`, `Tutorial.upgradeHint` / `v42Goal` / `goalText`,
    `Navigator.wanted`, `Game.showBench`;
  - and the 금방 events `gb:letter`, `open`, `firstDone`, `delivered`, `upgrade`, `deal`.
  - **Exception**: `Game.chooseBuild` (§14) does not exist. The build path is `Game.tryBuild(site, bkey)`
    (`Game.js:1287`), so put the coupon hook there.
- **Bag / boots**: `BALANCE.upgrades` really are bag `[6,10,14,18,22,26]` / fees 40–480 and boots `[1.0…1.6]` / 50–400.
  The old pads appear at `BENCH_AFTER = 'hire_lumberjack'`.
- **Gear readers**: every reader of the gear state goes through `Progression.capacity()` / `speedMult()`. The exceptions
  are the bots and `__FV` hooks, which read `progress.up` / `upPads`.
- **The level curve** in §9.4 recomputes exactly:
  - 180 / 370 / 820 / … / 192,450 XP;
  - SP 71 at Lv 60;
  - 57 SP / 46 ranks for all 14 skills;
  - a 읍 catch-up of 8,950 XP = Lv 17, once H1 is fixed.
- **Save**: `sanitizeSave` rebuilds field by field and drops unknown keys, so a version step is needed (D15).
  `MIGRATE[6]` → `[7]` chains from v4.1 saves.
- **APK**:
  - The manifest is a text template linked by **aapt2** (`build_apk.py`), so the intent filter and `<queries>` are
    ordinary XML, not hand-encoded binary.
  - `shouldInterceptRequest` only serves the virtual origin, so `fetch` to `*.supabase.co` goes to the network.
  - `shouldOverrideUrlLoading` already hands other links to the system browser.
  - `singleTask` gives the `onNewIntent` path the plan needs.
- **Files**: `dist/artifact` holds 413 files. `ui4_icons` is in `fx_city`, which is in neither `FRAGMENTS` nor
  `LATE_FRAGMENTS`, so the artifact never ships it (D23).
- **The catch-up's facts**: `gs.v4` (with `growth` / `rank`) is built synchronously when the rail strip is open
  (`Neighbours.attach`), so those facts exist at load. The village life does not (M5).
- **Coupons**: decor cards unlock at `hire_miner` / `tower_east` (`BUILD_UNLOCK`), so the Ch1 / Ch2 coupons become usable
  at Ch3, as the chain expects.

## Suggested order of plan edits

1. **C1, M10** (save safety) into v4.3's scope, before any admin code is written.
2. **H2, M6, M16** (gear skills off SP, the daily-features gate, the pacing method) and **H1, M5** (the catch-up rule and
   when it runs), before the chain data is written.
3. **H6** (the income meter), the foundation of every reward number. Then **H3** (the offline daily cap).
4. **H4, H5, M15** (missions sub-gates, state facts, template eligibility), before the missions refactor.
5. **M1, M2, M17** (scheduling, settings space, effort) in the version table and the Korean §13 / §14.
