# v4.3.1 · v4.4 – v4.6 · login track — binding plan (촌장 성장 · 이야기 · 매일의 즐거움 · 행복한 주민 · 지역 자원 · 관리자 · 계정)

Status: **PLAN, revision 2** (2026-10-18). Merges `docs/v44_draft_design.md` (game and economy) and `docs/v44_draft_systems.md`
(systems, mobile UX, tech) after checking the code where they disagree. Section 1 lists every conflict and how it was settled.
Revision 2 applies all 38 findings of `docs/build_reports/v44_plan_critique.md` (1 critical, 6 high, 17 medium, 14 low);
§27 says how each one was answered. The build contracts for each version are at the end of this file (§B1–§B7).
Designer document (Korean, easy words): `docs/기획서_v4_4_촌장성장.md`.
No source or test file was changed for this plan.

Read with:
- `src/core/Save.js`, `src/scenes/Game.js`, `UI.js`, `UIv4.js`, `UIv42.js`, `OfficePanel.js`, `src/title/*`;
- `src/systems/Progression.js`, `Tutorial.js`, `Navigator.js`, `StockLedger.js`, `Growth.js`, `Civic.js`, `Rank.js`, `V42.js`;
- `src/entities/Site.js` (`buildCost`), `Player.js`, `Seller.js`, `Station.js`, `UnlockPad.js`;
- `src/missions/**` and `docs/build_reports/missions_bank.md` §12;
- `docs/geumbang_plan.md` and `docs/build_reports/geumbang_module.md` §8;
- `docs/v5_v8_plan.md` §5 (the kit);
- `tools/apk/**` and `docs/build_reports/apk.md`.

Line numbers move. Anchor on function names.

The designer's request is quoted verbatim in the Korean document. Section 26 maps each of her 10 points to a section here.

---

## 0. Summary

| Version | Theme | Contents | Effort (build + review/fix days) |
|---|---|---|---|
| **v4.2** | 촌장의 하루 | in final verification, then the restaurant back tables + porters touch | as planned |
| **v4.3** | 금방 | 금방 integration (G-P1 … G-P17, as planned) **+ S1 save write guard** (never write over a save from a newer version; owned by the 금방 builder, landed after G-P5) | 금방 as planned; S1 ≈ 0.25 + 0.25 |
| **v4.3.1** | 시험 도구 | one derived save-key family (`Save.key(kind)`, C1) · 관리자 모드 (v4.2 / 금방 switches, restore row) · 촌장 이름 · 저장 코드 · settings tab **촌장** · single-writer guard + 보관된 마을 불러오기 (M10) | ≈ 3.5 + 1.5; starts when 금방's G-P1 / G-P5 / G-P13 have landed (M1) |
| **v4.4** | 촌장 성장 | kit-lite (GameFeed, the created-value income meter, Ports subset, ModuleHost, slice registry) · chief (XP, Lv ring, skill window: **2 gear skills bought with coins + 10 talents bought with SP**) · gear migration · HUD stack manager + shell panel · admin chief rows · save 7 → 8 | ≈ 8 + 3 |
| **v4.4.1** | 이야기 | quest chain (68 quests) inside `missions_bank` + catch-up · 수첩 · 우편함 + 보관함 (coupons, gift decor, gift spots) · `Navigator.guideTo` · missions sub-gates with `v5Parts: false` · admin quest rows | ≈ 5 + 2 |
| **v4.5** | 매일의 즐거움 | 오늘 · 이번 주 · 이달의 미션 (missions calendar, earlier gate, tiers, eligibility facts, monthly card, gentler streak) · 출석 체크 · 접속 선물 · 쉬는 동안 번 돈 (a **daily** credit) · skill 든든한 금고 | ≈ 9 + 3 |
| **v4.6** | 행복한 주민 · 지역 자원 | per-resident happiness (information + bonuses; the 읍 bar keeps today's metric) · 마을 panel (등급 · 행복 · 자원 · 통계) · region rows + 지금 부족한 것 TOP 3 + 해결하러 가기 · skill 관찰력 · 도감 · 업적 · 사진 모드 (+ APK file bridge) | ≈ 10 + 3 |
| **login track** | 저장 지키기 | runs in parallel once the designer has done her setup steps: new Supabase project, Google OAuth client, APK deep link, GitHub Pages redirect, cloud save + conflict sheet | ≈ 8 + 3; ships as the current v4.x.y |
| v5 | 생활과 미션 | as `v5_v8_plan.md`; save 8 → 9 (was 7 → 8); quest chapter 8; `v5Parts: true` | per plan |

Every "+ n" includes one review round and one fix round (the v4.2 rhythm: build, review, fix, verify). The numbers are 30–50 %
above revision 1 (M17).

---

## 1. Decisions (conflicts between the drafts, and with the code)

Each line: what was chosen · why.

| # | Decision | Why (one line) |
|---|---|---|
| D1 | **관리자 모드, 촌장 이름 and 저장 코드 ship as v4.3.1, right after 금방 (v4.3)**, by the builder who owns `Save.js` / `Game.js` / `UI.js` after 금방's G-P1 / G-P5 / G-P13 patches have landed. Both drafts put them in v4.4; revision 1 put them inside v4.3 | The designer tests on her phone now, and admin mode gets her to 금방 (depot + 읍, 50+ min of play) in seconds. They are **not** file-disjoint from 금방 (critique M1): G-P1 edits `Game.js`, G-P5 and G-P13 edit `Save.js`, G-P13 edits the `UI.js` 놀이 tab, and 금방 바로 열기 goes through `geumbang/ports_v4.js`. Rebasing on landed patches is cheaper than racing them |
| D2 | **Kit-lite** (`src/kit/`: GameFeed, IncomeMeter, Ports subset, ModuleHost, slice registry) in v4.4; no temporary `V44` orchestrator (systems D1 over design §14.3) | `missions_bank` is already a ModuleHost module and v4.5 must host it; building `V44` first means building and migrating twice |
| D3 | **One mission system**: the quest chain is a new model inside `missions_bank` (`src/missions/model/chain.js`, data `src/missions/data/chain.js`), state in `missions.qc`; the monthly card is `missions.mo` (systems D2 over design `chief.q`) | The brief says extend `missions_bank`; the chain reuses `signals.js` / `units.js` counting, the pay formula, the chip and the panel |
| D4 | The missions module gets **sub-gates**: chain from minute 0; calendar after the D5 gate; board, request bubbles, events, fame, craft pads and followers are **removed in v4.x** by a hard switch `BALANCE.v44.missions.v5Parts: false` (they come back with v5 and their ports) | The chain must run at minute 0. A `rank:2` gate alone is not enough: every 읍 player meets it in v4.x, and the request code calls `env.people.pick`, which kit-lite does not provide (critique H4) |
| D5 | **One gate for every daily thing** (오늘의 미션, 출석, 접속 선물): **`step:hire_farmer` or quest q211 done, whichever comes first** (≈ 13–15 human min). The design showed 출석 right after the title; systems showed it after chapter 1; revision 1 used q211 alone | One rule the designer can explain in a sentence, and the first 13 minutes stay a clean tutorial. q211 alone depended on the optional skill-window quests (critique M6); the farmer is hired by every player, bots included |
| D6 | Rewards (출석, 접속 선물, 오프라인, 우편함, coupons) are one module `src/rewards/`, slice `rewards` (systems D4 over design `chief.att/gift/off/mail`) | Separate owner, cap and tests; the chief slice stays ≤ 512 B |
| D7 | **The bag and boots pads leave the map entirely. There is no 수련대 pad.** The bench prop stays as plain plaza furniture with no pad and no label. Both drafts kept a 수련대 pad that opens the skill window | The designer asked to delete them from the village map; the Lv ring, quests q206 / q210 and a one-time HUD pointer teach the window instead |
| D8 | **Gear skills** (큰 가방, 가벼운 발걸음) are bought with **coins only** (the old pad prices), cost **0 SP**, and have **no level gate** except the new bag rank 6 (30 items, Lv 20). They unlock at `step:hire_lumberjack` (the old bench condition), and their cards are visible from minute 0 as locked (`나무꾼을 고용하면 배울 수 있어요`). SP are for talents only. Revision 1 charged 1 SP per gear rank plus level gates | Only coins + the unlock gives exactly v4.2's earliest purchase and coin flow. With SP, the four talents visible at q109 compete for the same points and the level gates bind (bag 4 needs Lv 6, bag 5 Lv 8 ≈ 18 casual min), so the bag would come later than in v4.2 (critique H2) |
| D9 | q109 becomes **"스킬 창 열어 보기"**. The two gear quests move into chapter 2 right after hire_lumberjack (q206, q210). The chain has **68** quests (design 67) | The bag cannot be learned before hire_lumberjack (D8) |
| D10 | **Skills ship with their system**: 2 gear + 10 talents in v4.4, 든든한 금고 in v4.5 (offline), 관찰력 in v4.6 (the panel). Each addition bumps `skills.version` → one free respec. The design showed all 14 from v4.4 | A skill card that does nothing yet confuses; grey "coming later" cards are noise |
| D11 | **행운 r3 "first daily pays +50 %" is dropped** (design §4.2 D2) | It breaks the design's own guardrail: skills never touch quest or mission rewards |
| D12 | Lv ring, mailbox, gift box and quest chip follow the **systems HUD measurements** (Lv ring ⌀72 at (62, top), coin pill shifted +78; left-column stack manager). The design had a 56 px ring inside the pill | ≥ 88 logical hit areas and no overlap at 360×640 were measured in the systems draft |
| D13 | **No new HUD button for 지역 자원.** 행복 and 자원 live in the 마을 panel, opened from the existing popBox / rank chip and from the overview's 자원 지도 toggle. The popBox shows from `hire_miner` on. The design had a `ui_icon_map` HUD button | The left column is full at 360×640 and the bottom third belongs to the joystick (`UI.js` pointer handler returns early on `over.length`) |
| D14 | **One hidden door**: 7 taps on the version label opens 관리자. The v5 "이야기 미리보기" (planned on 5 taps, `v5_v8_plan.md` D20) becomes a row inside it (systems D5) | Two tap counts on one label collide |
| D15 | Save numbering: v4.3 adds the `geumbang` slice and v4.3.1 the `chief` slice (name, `seen`, `adm`) **without** a bump, through local keep rules (the G-P5 pattern). v4.4 bumps **7 → 8** with `MIGRATE[7]`. v5's planned 7 → 8 becomes **8 → 9** | `sanitizeSave` builds a new object field by field and drops unknown keys (`Save.js sanitizeSave()`); the migration of bag/boots needs a version step |
| D16 | `progress.up` stays only as a **read-only mirror** of the gear ranks (written on each gear learn), not as a downgrade path (systems D8 over design §14.1) | `Save.load()` backs up and refuses any save whose version it cannot migrate (`v !== SAVE_VERSION` → `keepCopy`, return null); a v4.2 build never reads a v8 save |
| D17 | `MIGRATE[7]` **keeps the v4.3.1 nickname** (`chief.nm`) and `adm` when it builds the v4.4 chief slice (the systems sketch overwrote `chief`) | v4.3.1 writes `chief.nm` first (D1) |
| D18 | Nickname default is empty and is shown as `촌장님` (systems). The design's "눈송이" is only a suggestion chip | The player is never named by us; 나중에 stays a real choice |
| D19 | **The village name stays 서리마을** (not editable; design §12 recommended editable) | "서리" is baked into building and place names and ~100 strings (서리역, 서리 은행, 서리 소식, 서리읍, 서리시) |
| D20 | **저장 코드 is text only** (copy / paste; a file where the platform allows), no QR (systems D7) | The save is ≈ 10–14 KB JSON → ≈ 6–7 KB compressed base64; a phone-scannable QR holds ≈ 2.9 KB |
| D21 | Account and cloud are a **platform service** `src/account/`, outside the game save, guest by default. Login works in the APK (Custom Tab + deep link) and on GitHub Pages (redirect). The artifact stays guest-only with 저장 코드 (systems D9) | Google refuses OAuth inside embedded WebViews (`disallowed_useragent`); the artifact frame cannot navigate away and likely cannot reach Supabase |
| D22 | Supabase: a **new free project** (needs the designer's OK), the **publishable key**, RLS on one `saves` table, writes through one compare-and-swap RPC; never `nuripang`, never a secret key in a client (systems D10) | The legacy anon keys work only until the end of 2026 |
| D23 | **Art: one new `ui7` page** (≤ 1024², +2 files), loaded with the boot UI. v4.4 can ship on stand-ins. `ui_icon_piggy` and `ui_icon_box` are redrawn, and the **14 skill icons are drawn on `ui7`** (`ui7_sk_*`) instead of borrowing ui3 / ui5 icons that arrive late (critique L6) (systems D11–D12; the design assumed ui4 icons are loaded) | `ui4_icons` lives in `assets/fx_city`, which the artifact build does not ship (checked `tools/build/build_artifact.mjs`); ui3 arrives with the tower_east site (≈ 20 min) and ui5 with `v42_core`, so a card visible at minute 1 would show a placeholder. The artifact has 413 files today, ≈ 457 after 금방, gate 480 |
| D24 | **Every new number lives in one block, `BALANCE.v44`** (§8). The drafts spread them over `BALANCE.chief`, `.rewards`, `.insight` and `.v5.missions`. The missions host reads `BALANCE.v44.missions` on top of `missions/tuning.js` | One place, with Korean comments, for the designer |
| D25 | Two kinds of decor gift: **꾸미기 쿠폰** (a build-menu decor `deco_*`: the coin price is waived, materials are still needed) and **선물 꾸미기** (a `life_props` / `life2` prop such as the igloo or lantern string: placed free on a fixed gift spot, no plot). The design called both "coupon" | `igloo`, `lantern_string`, `kids_swing`, `snow_fort`, `wedding_arch`, `flower_stand` are not build cards (`BUILD_UNLOCK`, `BALANCE.buildings`) |
| D26 | No chief train ride in v4.x: the design's "ride the train" XP line and side quest s02 are replaced (s02 = 기차 구경: be at the station when a train arrives) | The chief cannot board a train before v5 (P14); no such code exists in `Neighbours` / `Train` |
| D27 | Effort: the split **v4.4 (kit + chief + skills, ≈ 8 + 3) then v4.4.1 (chain + 수첩 + 우편함, ≈ 5 + 2)** is the default, not a fallback; every version has an explicit review + fix round (critique M17) | v4.2 needed CODE-1, a fix round, CODE-2, a fix round and a verify round; revision 1's 10 + 3 for kit + chief + 68 quests + HUD manager + mailbox was optimistic |

**Decisions added in revision 2** (from the critique; §27 lists every finding):

| # | Decision | Why (one line) |
|---|---|---|
| D28 | **One derived save-key family.** `Save.key(kind)` (kind = `main`, `chat`, `backup`, `backup2`, `bad`, `later`, `import`, `story`) is the only way to name a save key; `SAVE_KEY` / `BACKUP_KEY` / `BAD_KEY` / `CHAT_KEY` stop being exported; the title reads through `Save.peek()` | `Save.clear()`, `Save.quarantine()`, `keepCopy()`, `CHAT_KEY` and `title/progress.js` all use the constants, so 처음부터 in admin mode would delete the normal village (critique C1) |
| D29 | **The income meter `I` measures value created, not coins collected**: every 5 s, `created = Δ(coins + Σ tills) + Δspent − Δtagged`. It is saved in the `later` slice and seeded on load, clamped to 0.5–1.5 × the 30-min average, and every reward amount is fixed when it is granted | `Economy.earned` grows only when a till is emptied and is 0 after a load: attendance would always pay its floor, and a hoarded till spikes rewards (critique H6) |
| D30 | **Offline earnings are a daily credit**: at most `capH` hours of away time are paid per day key, shared by all sessions of that day | A per-absence cap pays 3 × for three short sessions a day (72 % of play income instead of 24 %; critique H3) |
| D31 | **One-time events are never quest objectives.** 금방's letter / open / first delivery / upgrades, office hires and letter replies become **state facts** (`gb:letter`, `gb:open`, `gb:delivered ≥ n`, `gb:upgrades ≥ n`, `staff:<role>`, `news:answered ≥ n`); counted objectives use only repeatable signals | An event that fired before its quest was active would stall the chain for good (critique H5) |
| D32 | **Catch-up uses a frontier.** The frontier is the last quest whose *progress-state* objective holds; every quest up to it counts as done, whatever its objective type. The catch-up runs on the first `update()` tick, when the village life exists | Revision 1's rule stopped at q109 (`ui skills`) and q603 for every old save, and ran before `VillageLife` existed, so `people` read 0 (critique H1, M5) |
| D33 | **Rewards that are things go to a 보관함 (inventory), not the 우편함.** Coupons and gift decor are counts per kind; gift decor can be put away and placed again; gift spots grow with the rank (12 → 16 → 20); more than 9 of one kind turn into XP. The 우편함 holds only claimable rows, and its overflow auto-claims the oldest row of any kind | Gift decor arrives at 5–6 a month and 12 spots fill in two months; rows that "stay in the mailbox" would be dropped by the 1,536 B slice cap (critique M9) |
| D34 | **The 읍 bar keeps today's metric** (`Growth.happiness()`). 인기도 no longer raises `civic.happyCap`; per-resident happiness (v4.6) is information and bonuses only | 인기도's +6 and v4.6's `max(old, new)` would make the 읍 gate nearly automatic (critique M7) |
| D35 | **뚝딱 건축 aims at the waits players notice**: build timers (incl. founding 25 s and the 금방 opening), site-porter load and the ribbon's auto-open; the no-op "carpenters 2 → 3" rank is dropped | Build times are 3–30 s and `Site.update` does not build faster with more builders (critique M8) |
| D36 | **Pacing is gated on the median of 5 seeded runs per bot policy** (`eager`, `bagfirst`, `arrow`), two-sided for village complete and 읍 | One run is inside the bot's ±1 min noise, and a much earlier 읍 would have passed a one-sided gate (critique M16, M7) |

Kept as the design wrote them (both drafts agree or the systems draft adds no conflict): the level curve, the XP sources, the
title by rank, the quest reward formula, the dailies / weekly / monthly numbers, the gentler streak, 출석 7 + 28 with
pause-not-reset, 접속 선물 5 / 15 / 30 min, offline 4 % (now per day, D30) after the village is complete, the happiness model
with bonuses only, the shortage rules, the admin feature list, the extras ranking, and the systems draft's whole account spec.

---

## 2. Goals and guardrails

**Goals** (the designer's ten requests, in this order of shipping):
1. A chief who grows: a name, a title that grows with the village, levels from the chief's own actions, a skill window that
   replaces the bag and boots pads.
2. A quest chain that teaches the whole game from "물고기 5마리 잡기" and keeps going with every chapter.
3. Daily, weekly and monthly missions, attendance, play-time gifts, offline earnings.
4. Resident happiness and a region panel that says what is short and why.
5. Optional Google login with cloud save; full play without it.
6. An admin (cheat) mode that never harms the real village.

**Guardrails** (each one is checked in §22):
1. **One income meter `I`** (D29, `src/kit/income.js`). It measures value **created**, not coins collected.
   - Every 5 s: `created = Δ(coins + Σ tills) + Δspent − Δtagged`, where `tills` = every till that fills before someone
     empties it (market / register `CashPad`s, the station till, the hall tax box, the depot till), `spent` =
     `Economy.spentTotal`, and `tagged` = coins added with a tag (`quest`, `mission`, `gift`, `attend`, `offline`,
     `loan`, `bank`, `refund`, `admin`). Collecting a till moves value from a till to the purse: net 0.
   - `I` = the rolling 5-minute average of `created` per minute, clamped to `[0.5, 1.5] × I30` once `I30` exists.
   - `I30` = the 30-minute play average (the offline rate uses it).
   - The meter is saved in the `later` slice (`inc: [i5, i30]`, two numbers) and the ring is refilled with `i5` on load,
     so `I` is never 0 after a load.
     A save that never had a meter (v7) is seeded from `seedI[era]` (§8).
   - **Every reward amount is fixed when it is granted** and stored in its mail row; `받기` later pays the stored amount.
2. **Rewards are minutes of income**:
   - coins = `max(floor × eraMult, round10(m × I))`;
   - `eraMult = [0.3, 0.6, 1, 2, 3]` for: before village complete · complete · 읍 · 도시 · 큰 도시;
   - materials are never a reward.
3. **Reward budget**, for a casual player at 30 min a day, **whatever the number of sessions** (1 × 30, 3 × 10, 6 × 5):
   - quests ≤ 6 % of play income per chapter;
   - calendar + attendance + gifts ≤ 22 %;
   - offline ≤ 24 % (≤ 50 % with the max vault skill), because the offline credit is per day (D30).
4. **Skills never touch**:
   - shelf prices, rent, tax per person, ceremony costs, quest or mission rewards;
   - the 읍 bar (`Growth.happiness()`) and every rank condition (D34);
   - every effect has a hard cap, clamped in `balanceCheck` and in `mod()`.
5. **First-session pacing stays inside the v4.2 gates** (bots, §22.4), measured as the **median of 5 seeded runs** per
   policy (D36):
   - village complete within ±5 % of the v4.2 median (re-measured with 5 seeded v4.2 runs before v4.4 starts; the two
     single runs of revision 1, 19.3 and 20.7 min, are not a baseline);
   - 읍 within ±5 % (two-sided);
   - longest wait ≤ 3.8 min;
   - policies: `eager` (spends each SP on the first visible card), `bagfirst`, and the arrow-only bot.
6. **Nothing is lost on migration**: bag and boots ranks, partial payments, every flag.
7. **Admin mode never writes, removes or renames a normal-mode key** (save, chat, backups, `.bad`, `.later`, `.import`)
   unless the player promotes the admin village (two confirms). Every key comes from `Save.key(kind)` (D28).
8. **Cosy rules**: no paid currency, no energy, no ads, no push nagging, no FOMO.
   - A missed day pauses things or halves a streak; it never resets anything to zero.
   - Nothing that was earned is ever taken away (the 보관함 never drops a thing; D33).
9. **Offline-first**: every system works with no network. Login is an add-on.
10. **Phone first**: 390×844 and 360×640 portrait.
    - Hit areas ≥ 88 logical (≥ 47 css px at 390); no two interactive objects overlap.
    - Text ≥ 22 px logical for labels; **body text in the new panels ≥ 26 px logical** (critique L10).
    - DOM inputs use ≥ 16 **CSS** px (iOS zooms below that).
    - Nothing new goes in the bottom third.

---

## 3. Version scope

### 3.1 v4.3 = 금방 (+ S1 save write guard)

**금방**: exactly `docs/build_reports/geumbang_module.md` §8.
- Ship G-P1 + G-P5 + G-P6 + G-P8 + G-P9 together; the rest one at a time.
- `geumbang_plan.md` G1, and G1b if it fits.

**S1 save write guard** (≈ 10 lines in `Save.js`, by the 금방 builder after G-P5, because G-P5 edits the same function;
critique M10): `Save.write` reads the first 16 characters of the stored value and refuses to write when it holds
`{"v":N` with `N > SAVE_VERSION`. It then calls `gs.ui.staleSave()` once: a banner `새 버전에서 저장된 마을이에요 · 새로 고침해
주세요` with a `새로 고침` button. JSON.stringify keeps `v` first because the save object starts as `{ v, t, … }`.
v4.3 is the build that will be stale when v4.4 ships, so the guard must be in it.

- **Ship gate**: the 금방 gates; S1's unit test (a stored `{"v":8…}` is never overwritten); artifact ≤ 480 files.

### 3.1b v4.3.1 = 시험 도구 (one builder owns `Save.js`, `Game.js`, `UI.js`; starts after G-P1 / G-P5 / G-P13)

| Piece | Scope | Files |
|---|---|---|
| save keys (C1) | `Save.key(kind)`; every read / write / remove goes through it (§6.3); `SAVE_KEY` & co. are no longer exported; `Save.peek()` for the title; a grep test | `src/core/Save.js`, `src/title/progress.js`, `src/systems/ResidentChat.js` (comment only) |
| 관리자 모드 | door (7 taps on the version label), enter / exit / promote / **restore the normal village**, separate save keys, ribbon, the switches of §18.2 marked v4.3.1 (incl. `금방 바로 열기`) | `src/admin/store.js` (pure), `src/admin/switches.js`, `src/admin/view/AdminPanel.js`; `UI.panelFooter`, `Economy.spend`, `Site.start`, `Civic.choices`, `Progression.forceStep/forceAll` (new), `Growth.happiness`, `Game.update` (sub-steps, §18.2) |
| 촌장 이름 | name sheet (DOM, IME-safe, §9.1) on a new game and once on old saves; rename in settings › 촌장; the name shown in letters, greetings, the ceremony banner, the office panel title, the 금방 letter and the chat prompt | `src/chief/view/NameSheet.js`, `src/chief/name.js` (pure validate / display), `src/data/nameBlock.js`; slice `chief: { v: 1, nm, seen, adm }` kept by a local `keepChief` in `Save.js` (no bump) |
| 저장 코드 | settings › 촌장 › `저장 코드 내보내기 / 가져오기` (§17.6); the APK offers `복사` only until the v4.6 file bridge | `src/account/code.js` (pure), `src/account/view/CodeSheet.js` |
| settings tab 촌장 (M2) | a third tab `[소리·화면] [놀이] [촌장]` (plates of 236 → 3 × 200); rows Y(0)–Y(6): 촌장 이름 ✎ · 저장 코드 내보내기 · 저장 코드 가져오기 · 보관된 마을 불러오기 · (v4.4) 경험치 숫자 · (v4.5) 미션 알림 · (v4.6) 부족 알림 | `UI.js` (`settingsTabs`, `buildChiefTab`), `Save.js` Settings |
| single writer (M10) | one writer per browser: a `frostVillage.lock` record `{ id, t }` refreshed every 5 s + `storage` events / `BroadcastChannel('fv')`; a second tab that takes over makes the first stop saving and show `다른 창에서 마을을 열었어요 · 이 창은 쉬어요` with `여기서 계속하기` | `src/core/SaveLock.js` (pure over a storage + channel), `Save.js`, `UI.js` |
| 보관된 마을 불러오기 (M10) | settings › 촌장: lists `backup` / `backup2` / `import` copies that parse (name, version, play time) and loads one after a confirm; the current village goes to `import` first | `UI.js`, `Save.js` |

- **Ship gate**: the C1 tests (§22.2: 처음부터, a forced build throw and the title, each in admin mode, then exit + hash
  compare); the key grep test; admin byte-compare; the name sheet IME runs (Enter and button mid-composition); the 저장 코드
  round trip (both frame kinds); the stale-tab and two-tab tests; the 촌장 tab at 360×640; artifact ≤ 480 files.

### 3.2 v4.4 = 촌장 성장

- **kit-lite** (§5.2): GameFeed + the normalizer table, the created-value IncomeMeter, Ports subset, ModuleHost (built
  right after `buildV42`), slice registry, `rng`.
- **chief module**:
  - XP and levels, the Lv ring, level-up FX;
  - the skill window (2 gear skills for coins + 10 talents for SP, §10);
  - the read-time hooks (§7.3);
  - gear migration and refunds;
  - `Progression.reprice()`;
  - the name sheet moves under the module (same view).
- **HUD**: the stack manager `src/scenes/hud/Stack.js` (incl. 금방's `GbChip`), the shell panel `src/scenes/panels/Shell.js` (§19).
- **Tutorial**: the arrow points at the Lv ring whenever a gear rank is affordable (the v4.2 pad condition, §10.5).
- **admin rows**: level, SP, skill reset.
- **Save 7 → 8** (§6). The `ui7` page (incl. the 14 skill icons), or stand-ins (§20).
- Without the chain, levels come ≈ 40 % slower in v4.4 than the §9.4 table (quests give about half the XP up to 읍).
  Talents only (gear is not on SP), so pacing cannot get slower; v4.4.1's catch-up credits the quests already done.
- **Ship gate**: §22.1–22.4 green for v4.4; the pacing medians inside the v4.2 gates for `eager`, `bagfirst` and the
  arrow-only bot; the HUD overlap checker; artifact ≤ 480.

### 3.2b v4.4.1 = 이야기

- **chain** (§11):
  - 68 quests in chapters 1–7, the frontier catch-up for every save that starts the chain (§11.6);
  - the quest chip, the 수첩 panel (이야기 tab);
  - the tutorial merge (passive quests keep "다음 목표" visible, §11.4);
  - `Navigator.guideTo`.
- **missions sub-gates**: `v5Parts: false` removes the board, request bubbles, events, fame, craft pads, followers and
  their prefetch (D4).
- **rewards module, part 1**: 우편함, 보관함 (꾸미기 쿠폰, 선물 꾸미기), gift spots (§14).
- **admin rows**: quest controls, mailbox test.
- **Ship gate**: the chain tests (closure + the repeatable-or-state rule, §22.1); the catch-up fixtures at Ch1 / Ch2 / Ch5 /
  Ch6 land on their expected frontier, level and SP (§22.3); the arrow-only bot finishes Ch1–Ch5 with 0 stuck quests;
  artifact ≤ 480.

### 3.3 v4.5 = 매일의 즐거움

- **missions calendar** (§12):
  - the early gate (`step:hire_farmer` or q211);
  - tiered counts, 14 new daily templates and 5 new weekly ones, with eligibility facts;
  - the monthly stamp card;
  - the streak halves on a missed day;
  - 수첩 tabs 오늘 · 이번 주 · 이달 · 출석, and the "오늘 n/3" mini-pill on the quest chip.
- **rewards module, part 2** (§13): 출석 sheet and tab, 접속 선물 box on the HUD, 오프라인 정산 sheet (daily credit); all
  three also run on `visibilitychange` → visible and on a day-key change in a running tab.
- **skill 든든한 금고** (D10).
- **admin rows**: 실제 하루 넘기기, 미션 다시 뽑기, 출석 / 선물 / 오프라인 test rows.
- **Ship gate**: the clock tests (§22.1 rewards), 05:00 rollover in an open tab, the reward-share bot with 1 × 30, 3 × 10
  and 6 × 5 sessions (§22.4), every template eligible or hidden at each tier fixture.

### 3.4 v4.6 = 행복한 주민 · 지역 자원

- **insight module**:
  - per-resident happiness (§15), shown beside today's 읍 bar, never replacing it (D34);
  - the 마을 panel (tabs 등급 · 행복 · 자원 · 통계);
  - the resident card strip;
  - region rows + TOP 3 + why-chain + 해결하러 가기 (§16);
  - the overview 자원 지도 pins.
- **skill 관찰력**.
- **album module**: 도감 · 업적.
- **사진 모드**:
  - artifact: `downloads` capability;
  - APK: a `@JavascriptInterface saveFile(name, base64)` bridge (MediaStore), because `blob:` URLs never reach a
    `DownloadListener` (critique L14). 저장 코드's `파일로 저장` uses the same bridge in the APK from then on.
- **Ship gate**: panel cost ≤ 0.05 ms per tick at 60 residents, 0 rebuilds per tick while open, the Navigator routes of
  TOP 3, the 읍 median unchanged (±5 %).

### 3.5 Login track (parallel, after the designer's steps in §25)

- Supabase project + schema + RLS + RPC + advisors (§17.5).
- `src/account/*` (auth, rest, sync, outbox); the settings 계정 tab (the 4th plate: 4 × 168), the conflict sheet, the
  title link.
- APK deep link + Custom Tab (§17.3), GitHub Pages redirect, `privacy.html`.
- Tests: mock Supabase, Java `DeepLink` tests, SQL two-user test (incl. the first-insert race), the designer's on-phone
  checklist (§22.5).
- It touches no gameplay file except settings and the title. It ships as the current v4.x.y.

---

## 4. Module layout

```
src/core/SaveLock.js (v4.3.1)  single-writer lock (pure over storage + channel)
src/kit/            (v4.4)  GameFeed.js · income.js · Ports.js · FakePorts.js · ModuleHost.js · slices.js · rng.js
src/chief/          (v4.3.1 name · v4.4 rest)  index.js · model/{xp.js, levels.js, skills.js} · data/xp.js · name.js ·
                     save.js · tuning.js · strings.js · host.js · view/{NameSheet.js, SkillWindow.js, LvRing.js, LevelUp.js}
src/missions/       (+v4.4.1)  model/chain.js · data/chain.js · view/ChainTab.js · view/QuestChip.js · host sub-gates + v5Parts
                    (+v4.5)  model/calendar.js (+monthly, streak halves, tiers, eligibility) · data/catalog.js (F13–F26, G7–G11) · view tabs
src/rewards/        (v4.4.1 mail/inventory/coupons/gift spots · v4.5 attend/gifts/offline)
                     model/{mail.js, inventory.js, attend.js, gifts.js, offline.js} · save.js · host.js ·
                     view/{Mailbox.js, Inventory.js, AttendSheet.js, GiftBox.js, OfflineSheet.js, GiftSpots.js}
src/admin/          (v4.3.1)  store.js (pure, storage injected) · switches.js · view/AdminPanel.js · view/Ribbon.js
src/insight/        (v4.6)  model/{happiness.js, regions.js, shortage.js} · view/{VillagePanel.js, LedgerRows.js, Pins.js, ResidentStrip.js}
src/album/          (v4.6)  model/album.js · data/entries.js · view/AlbumTab.js · view/PhotoMode.js
src/account/        (v4.3.1 code.js · login track rest)  config.js · platform.js · pkce.js · auth.js · rest.js · sync.js ·
                     outbox.js · code.js · view/{AccountTab.js, ConflictSheet.js, TitleLink.js, CodeSheet.js}
src/scenes/hud/Stack.js · src/scenes/panels/Shell.js   (v4.4)
```

Module shape and import rules follow `v5_v8_plan.md` §5.1–5.2:
- each module has `index.js`, a pure `model/` (no Phaser, window, document or Date), `view/`, `host.js`, `save.js`, `tuning.js` and `strings.js`;
- v4 code may import only `src/kit/ModuleHost.js` and the frozen read-time facade `gs.chief`;
- a purity test greps the import graph.

| Module | Gate | Slice (cap) | Public API (`gs.later.<id>`) |
|---|---|---|---|
| chief | always | `chief` (512 B) | `name()`, `title()`, `display()`, `level()`, `xp()`, `sp()`, `rank(k)`, `canLearn(k)`, `learn(k)`, `respec()`, `addXp(n, why)`, `openSkills()`, `rename(nm)`; facade `gs.chief.mod(key, base)` / `value(key)` |
| missions (+chain, +monthly) | module always (v4.4.1); sub-gates: chain always · calendar `any(step:hire_farmer, q:q211)` (v4.5) · board / requests / events / fame / craft / followers **only when `BALANCE.v44.missions.v5Parts`** (false in v4.x) | `missions` (3,072 → **3,584 B**: + `qc` ≤ 380 B, + `mo` ≤ 40 B) | existing api + `chain()` → `{ id, title, done, n, need, target, passive }`, `chainFocus()`, `chainCovers()`, `claim(id)`, `openNotebook(tab)` |
| rewards | always (each sheet waits for its own condition) | `rewards` (1,536 B) | `mail(kind, amount, why)` (amount fixed now), `mailCount()`, `give(kind, key, why)` → 보관함, `coupon(bkey)`, `useCoupon(bkey)`, `place(key, spot)`, `putAway(spot)`, `attendDue()`, `giftState()`, `offlinePending()` |
| admin | built only while admin mode is on | none in the normal save | `on()`, `flags`, `open()`, `exit(kind)`, `restoreNormal()` |
| insight (v4.6) | `step:hire_miner` | `insight` (≤ 256 B) | `happiness()`, `resident(pid)`, `regions()`, `shortTop3()`, `guideTo(rowId)` |
| album (v4.6) | always | `album` (≤ 768 B) | counters, stamps, `photo()` |
| account (service) | started in `main.js` before Title | outside the save | `state()`, `signIn()`, `signOut()`, `syncNow()`, `export()`, `import(code)` |

`BANK_MODULE` (in `src/missions/index.js`) is **not** registered in v4.x: v4.2's own `Bank42` + `keepBank` stay until v5.

**Facts** (`ports.facts.has(cap)`, `ports.facts.count(k)`):
- the `Progression.met()` grammar: `step:<id>`, `b:<key>`, `r:<region>`, `f:<flag>`;
- counts: `rank:n`, `shops:n`, `people:n`;
- `complete` (= `step:hire_hunter`), `skill:<key>:<r>`, `q:<questId>`, `ui:<panel>` (panel seen), `any(a, b, …)`;
- `v42:office` / `v42:bank` / `v42:depot`;
- **state facts that replace one-time events** (D31):
  - `gb:letter` (`seen & SEEN.letter` or `st ≥ 1`), `gb:open` (`st === 2`, also written `gb`);
  - counts `gbDelivered` (`settle.tot[1]`), `gbUpgrades` (number of upgrade kinds owned, `up.ok.size`), `gbDeals`
    (deals started; repeatable, counted by the chain on the `gb:deal` event as well);
  - `staff:<role>` (`Office.hired(role)`), `newsAnswered` (letters answered, from `VillageNews` inbox states + `happy`);
- **eligibility facts** for the calendar (critique M15, v4.5): `reg:self` (an enabled register without a clerk exists),
  `plot:free` (a free decor plot exists), `letter:due` (an unanswered letter is in the inbox or a template is still due).

---

## 5. Construction, tick order, the kit

### 5.1 Order (`Game.js`)

```
Game.build():
  … Player, Economy, Progression, Tutorial
  buildV42(this, sv)                                   (v4.2 + the 금방 V42 system 'gb')
  this.later = new ModuleHost(this, sv, LATER_MODULES) ← v4.4: chief (+ missions, rewards in v4.4.1; insight, album in v4.6; admin when on)
  Neighbours.attach · restoreV3 · progress.init · restore(sv) · v42.afterRestore · … VillageLife · DogPlay · …
Game.update(dt):
  first tick only: this.later.afterBuild()            ← catch-up (v4.4.1, once), offline check (v4.5): life, dog, civic, v4, gb exist now
  admin speed: run the body below N times (N = 1 / 2 / 4) with the real dt (sub-steps, §18.2)
  … v4.update → v42.update → later.update (chief → missions → rewards → insight → album)
Game.serialize(): …, ...(this.later ? this.later.serialize() : passThroughSlices(this.saved))
```

- The ModuleHost sits **right after `buildV42`**, one line earlier than `v5_v8_plan.md` P1 placed it.
  - The chief must exist before `restore(sv)`, because the bag contents are restored up to `player.capacity`.
  - Modules with an always-true gate are built synchronously inside the ModuleHost constructor.
- **Anything that reads live facts runs on the first `update()` tick, not in `build()`** (critique M5). In `Game.build()`,
  `v42.afterRestore` runs before `this.life = new VillageLife(…)` and `DogPlay`, and `Rank.people()` returns 0 while
  `gs.life` is missing. `afterBuild()` runs once, after `build()` has finished, so `life`, `dog`, `civic`, `v4` and the
  `gb` system all exist.
- `progress.init()` no longer creates the bench pads (D7). `upPads` stays `{}`, so the old loops in `Tutorial` and in `where()` (`Game.installHooks`) become no-ops; §10.5 says what replaces the arrow's gear loop.

### 5.2 kit-lite (v4.4)

| File | v4.4 scope | Left for v5 |
|---|---|---|
| `GameFeed.js` | one bus; subscribes once to the legacy positional `gs.events` (§7.1) and turns each into `{ t, …, T }`; new hook points call `gs.feed.emit({ t, … })`; FIFO queue (≤ 200 per drain), consumers in fixed order (chief → missions → rewards → album → insight → v5), each in `try/catch` with 3 logs per name; `__FV.feed.log(n)` ring of 400, `__FV.feed.emit` | module events of story / vehicles / harbor |
| `income.js` | `IncomeMeter` (D29): every 5 s `created = Δ(coins + Σ tills) + Δspent − Δtagged`; ring of 60 samples (300 s); `perMin()` clamped to `[0.5, 1.5] × i30`; `dayAvg()` (`i30`, 30 min of play); `serialize()` → `[i5, i30]`; `seed(saved, era)` refills the ring; ignores samples while paused, in a ceremony or in admin mode | — |
| `Ports.js` / `FakePorts.js` | `coins` (with tag), `income`, `ui` (toast, banner, safeTop/Bottom, panelOpened, scene), `clock` (T, hour, day, wall, localDate, + admin `dk`), `lang`, `rank`, `facts.has/count`, `progress.setFlag`, `settings.get`, `sound`, `view`, `emit`, `later`, `rewards.decor/voucher/effect` (backed by the rewards module) | people, places, town, roads, water, sites.offer, residency |
| `ModuleHost.js` | gates polled at 1 Hz and on load, construction in `needs` order, fixed tick order, perf EWMA, slice pass-through while a module is not built, `gs.later.<id>`, `__FV.later` | previews (now an admin row, D14) |
| `slices.js` | registry `[{ key, version, cap, sanitize }]`, `fitCap`, used by `sanitizeSave` | — |
| `rng.js` | mulberry32 + named streams (`luck`, `draw`) | — |

`Economy` gains three small things (v4.4):
- `add(n, x, y, fly, tag)` takes an optional `tag`; tagged coins go to `taggedTotal` and never count in `I`; the ports
  always pass a tag;
- `spend(n)` adds to `spentTotal`;
- refunds pass `tag: 'refund'`: `Progression.syncPads` / `openBench` refunds, the `MIGRATE[7]` refund toast, `reprice()`
  refunds, and the debug key (`'admin'`).

**Till registry** (v4.4): `gs.tills()` returns the live till values: every `CashPad.value` (`Seller.js`), the station till
(`Growth.till.value`), the hall tax box (`TownHall.tax.value`), the depot till (`DepotSystem`). 딸랑이's deposit and the
chief standing on a pad move value from a till to the purse, so they net to 0 in `created`.

---

## 6. Save

### 6.1 Slices

```
chief:    { v:1, nm:'', xp:12345, sp:3,
            sk:{ bag:4, speed:4, hands:1, … },                              // gear ranks are coin-bought (D8); talents use SP
            rs:[respecs, lastDayKey, freeLeft], star:0, seen:{ name:1, skillTip:1 },
            mig:{ refund:120, gift:1 }, adm:0, dx:[dayKey, dropXp] }       // mig set by MIGRATE[7]; adm = an admin-born village; dx = today's drop XP (M11)
missions: { …existing…,
            qc:{ i:23, p:[7], d:'<base64 bitset>', cl:['q502'], sd:{ s01:[0] }, cu:0 },   // (v4.4.1) active quest index, units, done bits, unclaimed ≤ 3, side ≤ 3, cu = catch-up done
            mo:{ m:24322, s:12, got:3 } }                                  // (v4.5) month key, stamps, milestone bits
rewards:  { v:1, mail:[[id, kind, amount, why, dayKey]] (≤ 20),            // (v4.4.1) amounts fixed at grant (D29)
            inv:{ cp:{ deco_snowman:1 }, gf:{ igloo:2 } } (≤ 9 each),      // 보관함 (D33)
            gs:{ spot:key } (≤ 20),
            att:{ n, loop, board, bi, last }, gift:{ d, s, got }, off:{ seen, d, used }, first:{ cloud:0 } }   // att/gift/off from v4.5; off.used = away seconds paid today
insight:  { v:1, seen:{…}, top:[…] }          (v4.6)
album:    { v:1, c:{…}, st:'<bits>' }         (v4.6)
later:    { v:1, g:{…gates seen…}, inc:[i5, i30] }   (kit, 128 B; inc = the income meter, D29)
```

- v4.3.1 writes only `chief: { v:1, nm, seen, adm }`, kept by a local `keepChief` copy in `Save.js`. `adm: 1` is set when
  the admin store creates the admin village, so an exported admin village carries it (critique L5).
- v4.4 replaces the local copy with the slice registry, and a parity test checks that both keep the same fields.
- Every `sanitize*` is pure, idempotent and never throws (500 fuzzed blobs each); every number is clamped (the `sanitizeV42` pattern).
- Worst case with every slice: ≤ 16 KB (today ≤ 10 KB, `save_v42.mjs`).

### 6.2 `SAVE_VERSION` 7 → 8 (v4.4), `MIGRATE[7]` (pure, JSON only)

```js
7: (s) => {
  const o = Object.assign({}, s, { v: 8 });
  const pr = isObj(s.progress) ? s.progress : {}, up = isObj(pr.up) ? pr.up : {}, paid = isObj(pr.paid) ? pr.paid : {};
  const c = clampInt(up.capacity, 0, 5), sp = clampInt(up.speed, 0, 4);
  const refund = count(paid.up_capacity) + count(paid.up_speed);           // partial payments on the old pads come back
  const p2 = Object.assign({}, paid); delete p2.up_capacity; delete p2.up_speed;
  o.progress = Object.assign({}, pr, { paid: p2 });                         // `up` stays as a read-only mirror (D16)
  o.coins = count(s.coins, 1e12) + refund;
  const old = isObj(s.chief) ? s.chief : {};                                // (D17) the v4.3.1 slice: keep the name
  o.chief = { v: 1, nm: typeof old.nm === 'string' ? old.nm : '', seen: isObj(old.seen) ? old.seen : {}, adm: old.adm === 1 ? 1 : 0,
              xp: 0, sp: 2, sk: { bag: c, speed: sp }, mig: { refund, gift: 1 } };   // +2 SP thank-you gift, once
  return o;
}
```

**Equal value for old saves**:
- The old bag and boots levels become the gear ranks **as they are**:
  - already paid in coins, so never charged again;
  - gear is never respecced;
  - `capacity()` and `speedMult()` stay identical;
  - gear costs no SP (D8), so nothing is subtracted.
- Partial payments come back as coins (tagged `refund`), with the toast `작업대에 냈던 코인 {n}개를 돌려드려요`.
- **+2 SP** thank-you gift, once (`mig.gift`).
- The quest catch-up is **not** part of the migration. It runs in v4.4.1, once per save, when the chain starts on a save
  that has no `missions.qc` (§11.6). It runs on the first `update()` tick (§5.1).

**Re-attach after a stale writer** (critique M10, v4.4): the published v4.2 build has no write guard, so an old v4.2 tab can
still write a v7 save over a v8 one. Each v8 write also writes the small side record `Save.key('later')` =
`{ cid, t, chief, missions.qc, missions.mo, rewards }` (≤ 6 KB). When a v7 save loads whose `cid` equals the side record's
`cid`, `MIGRATE[7]` keeps the side record's slices instead of building fresh ones and skips the gift and the catch-up
(`mig.gift = 0`, `qc.cu = 1`). The village itself comes from the v7 save, which is the newest.
A stale build that opens *after* a v8 save exists cannot read it: it keeps the v8 save in `backup` and starts a fresh
village with a new `cid` (today's rule). 설정 › 촌장 › `보관된 마을 불러오기` (v4.3.1) lists that copy and brings it back.

- Other version notes:
  - a cloud or 저장 코드 save with a higher version is never loaded: `앱을 새 버전으로 바꿔 주세요`;
  - v5's planned bump becomes 8 → 9.

### 6.3 localStorage keys (every access in try/catch, as today)

**One derived key family (D28, v4.3.1).** `Save.key(kind)` returns `base + suffix[kind]`, where `base` is
`frostVillage.save.v1` in normal mode and `frostVillage.save.admin` while the mode flag is set:

| kind | Normal mode | Admin mode | Holds | Synced |
|---|---|---|---|---|
| `main` | `frostVillage.save.v1` | `frostVillage.save.admin` | the village | normal only (slot 0) |
| `chat` | `….v1.chat` | `….admin.chat` | chat record (`cid`) | phase 2 only |
| `backup`, `backup2` | `frostVillage.save.backup`, `.backup.2` (unchanged names) | `….admin.backup`, `….admin.backup.2` | `keepCopy` safety copies | no |
| `bad` | `….v1.bad` | `….admin.bad` | `quarantine()` copy | no |
| `later` | `….v1.later` | `….admin.later` | the v8 side record (§6.2, v4.4) | no |
| `import` | `….v1.import` (+ `.import.2`) | `….admin.import` | the village that was there before a 저장 코드 import (L4) | no |
| `story` | `….v1.story` | `….admin.story` | v5's story side record (its `sideKey` comes from here when v5 wires it) | no |

- **Rules**:
  - every read, write and remove in `Save.js` (`load`, `write`, `clear`, `quarantine`, `keepCopy`, `ChatSave.*`) calls
    `Save.key(kind)` at call time; `CHAT_KEY` is no longer computed at import;
  - `SAVE_KEY`, `BACKUP_KEY`, `BAD_KEY` and `CHAT_KEY` are no longer exported. `src/title/progress.js` reads through
    `Save.peek()` (the current mode's `main`), so the title of an admin session shows the admin village;
  - a node test greps `src/` for `frostVillage.save` and for `getItem(` / `setItem(` / `removeItem(` outside `Save.js`,
    `SaveLock.js`, `admin/store.js`, `title/prefs.js` and `account/*` and fails on any hit.
- **Other keys**:

| Key | Holds | Synced |
|---|---|---|
| `frostVillage.save.normal` (+ `.chat`, `.prev`) | copy of the normal save taken when admin mode starts (v4.3.1); `.prev` = the copy it replaced (§18.1) | no |
| `frostVillage.mode` | `{ admin: 1, since }` (v4.3.1) | no |
| `frostVillage.lock` | `{ id, t }` single-writer lock (v4.3.1) | no |
| `frostVillage.settings.v1` | settings (+ `xpFloat`, `shortageToast`, `missionToasts`, `cloudAuto`) | language and sound only, in the cloud row's summary |
| `frostVillage.auth.v1` | `{ at, rt, exp, uid }` (no email, no name) | no |
| `frostVillage.auth.pkce` | `{ verifier, t }` (10 min) | no |
| `frostVillage.cloud.v1` | `{ uid, baseRev, baseHash, dirty, lastPush, lastPull, paused, backoff }` | no |

So 설정 › 처음부터 in admin mode clears only the admin village, and a throw in `Game.build()` in admin mode quarantines
only the admin village (critique C1). §22.2 tests both.

---

## 7. Event bus and hook list

### 7.1 Existing emits → feed (normalize only; payload patches are the missions report's P/E numbers)

| Feed `t` | Today's emit (file · function) | Payload after the patch |
|---|---|---|
| `sold`, `storeSold` | `Seller.js` `complete(c)` | `{ value, item, n, chief }` (P8 + `chief: !!this.register.chief`) |
| `traded` | `Seller.js` trade loop | `{ value, item, n: 1, chief }` (E2 + chief) |
| `crafted` | `Workshop.js` | `{ kind, item, n: 1, chief }` |
| `restMeal` | `BigRestaurant.js` | `{ price, combo, chief }` |
| `built` | `Site.js` `finish()` | `{ key, siteId, x, y }` |
| `step` | `Progression.completeStep()` | `{ id }` |
| `flag` | `Progression.setFlag()` | `{ id }` |
| `region` | `Territory.reveal()` | `{ id, instant }` |
| `settlers` | `Civic.js` settlers | `{ n }` |
| `shopOpen`, `shopBuilt` | `Shop.js` | `{ shop, lot }` |
| `houseDone`, `cardDone` | `Growth.js` | as today |
| `visitorDone` | `Visitor.js` | as today |
| `rank` | `Rank.ceremony()` → `'v4:rankUp'`, `'v4:rank'` | `{ level, ceremony }` |
| `train` | `Neighbours.js` `'v4:train'` | `{ ev, stop, line }` |
| `hour` | `TownSim.js` `'v4:hour'` | `{ h, name }` |
| `dogLove` | `DogPlay.js` | `{ love }` |
| `boatHome` | `Boathouse.js` | E3 `{ catch }` |
| `fedMiners`, `minersHungry`, `waitingHouse` | `FoodBox.js`, `Worker.js`, `VillageLife.js` | as today |
| `letter`, `courier` | `Office.js` | `{}` / `{ n }` |
| `gb:*` | 금방 adapter `gs.events.emit('gb', e)` (`geumbang/ports_v4.js`) | `e` as is (`gb:open`, `gb:delivered`, `gb:upgrade`, `gb:firstDone`, `gb:letter`, `gb:deal`) |

### 7.2 New emits (one line each)

| Feed `t` | Payload | Where (file · function) | Consumers |
|---|---|---|---|
| `chiefGather` | `{ item, n, node, animal }` | `Player.js` `impact()`, after `const item = n.hit(this)` (count = `n.lastYield`) | XP, chain, F13/F14, G7, album, luck roll |
| `produced` | `{ station, item, n, chief }` | `Station.js` after `outStack.push` (P9); `chief = this.op && this.op.chief && !this.op.operator` | XP, chain `made`, dailies, album |
| `chiefDrop` | `{ item, to, src }` | `Game.js` `moveItem(from, to, …)` when `from === player.stack` and the move succeeded; `to` = station / shelf / site / order / shop / food / warehouse; `src` = the sink the item was last picked up from (stack items carry `from` id, set on pickup) | XP (1 per 3 items via an accumulator), **none** when `to` is the warehouse or `to === src`; ≤ `limits.drop` XP a day (critique M11) |
| `collect` | `{ pad, n }` | `Seller.js` `CashPad` collect branch (E8, + tag) | XP (≥ 50 coins), F6 |
| `tap` | `{ pid, x, y }` | `VillageLife.react(r)`, `Neighbours.tap()` (P11) | XP, q211, insight chief need |
| `chat` | `{ pid }` | `ResidentChat.js` `onChange` (E7) | XP, F5, insight |
| `dogAct` | `{ kind }` | `DogPlay.start(kind)` (E6) | XP, q307, F4 |
| `day` | `{ day }` | `DayClock.js` after `this.T += dt` (P10) | rewards, calendar game-clock option |
| `wholesale`, `shopSold` | `{ n, item }` | `Growth.payWholesale()` (E5), `Shop.takeOut()` (E1) | missions |
| `letterReply` | `{ tpl, choice }` | `VillageNews.answer(id, bi)` | XP, F24 (the chain uses the state fact `newsAnswered`) |
| `officeHire` | `{ role }` | `Office.hire(role, pad)` | XP (the chain uses the state fact `staff:<role>`) |
| `lineUp` | `{ line, kind }` | `LineUpgrades.done(o, pad)` | XP |
| `exported` | `{ n, coins }` | `Freight.payExports()` | q609 |
| `cheer` | `{ n }` | `ChiefAura` cheer fired | F21 |
| `pilot` | `{ on, reason }` | `ChiefPilot.start()` / `stop()` | XP multiplier, gift time, s01 |
| `ui` | `{ panel, tab }` | `OfficePanel.show(tab)`, the shell panels, `HudV4.openRank/openOrders`, the skill window | q109 (`ui skills`), q603 (`ui officeStock`), album; each sets the fact `ui:<panel>` (saved in `later.g`) |
| `build` | `{ siteId, bkey }` | `Game.tryBuild(site, bkey)` (`Game.js`; revision 1 named a `Game.chooseBuild` that does not exist) | coupons (`rewards.useCoupon`), admin 짓기 바로 완공 |
| `paperRead` | `{ day }` | `OfficePanel` news tab, first open of a paper | XP once a day |
| `skill:learn`, `level:up`, `xp` | `{ skill, r }` / `{ lv, sp }` / `{ n, why }` | chief host | chain (`skill` objectives), album, UI |
| `quest:done`, `quest:claim`, `quest:chapter` | `{ id, ch }` | missions host (chain) | chief (XP / SP), rewards (mail, coupons), monthly stamps |
| `daily:*`, `weekly:*`, `monthly:*`, `streak:*` | as missions report §4.2 (+ monthly) | missions host | chief (XP), rewards |
| `attend`, `gift`, `offline`, `mail` | `{ day, loop }` … | rewards host | chief (XP), monthly stamps |
| `admin` | `{ op }` | admin | consumers ignore admin-sourced XP |

- **XP is data**: `src/chief/data/xp.js` maps feed `t` (+ field filters) to XP and daily limits, from `BALANCE.v44.chief.xp`. A new XP source is one table line.
- **Signals**: the chain and the calendar reuse `src/missions/model/signals.js` and `units.js`. New signal ids, in its naming style:
  - `gather:<item>` (chief only), `made:<item>` (from `produced`), `served` (`sold` with `chief`), `traded:<item>`;
  - `food`, `cheer`, `letter_reply`, `pilot_watch` (50 s of 관망 = 1);
  - `gb_delivered`, `built:<key>`, `built:deco_*`.
- **State objectives** (`step`, `built`, `region`, `flag`, `count`, `skill`, `ui`, `gb:*`, `staff:*`, `newsAnswered`) are
  checked against facts when a quest becomes active and then every 1 s.
- **Counted objectives use only repeatable signals** (D31). A chain test lists every counted signal and fails unless the
  signal has no supply limit in the game (fish, logs, sales, deliveries, exports, deals …).
- A kit test checks that every listened-to `t` is emitted somewhere in `src/` (`SIGNAL_EVENTS ∪ XP_EVENTS`).

### 7.3 Skill hooks (read-time; `BALANCE` is never mutated)

- `gs.chief.mod(key, base)` returns `base` unchanged when the chief module is missing.
- Values are clamped by `BALANCE.v44.skills.caps`.
- `buildCost()` returns a **modified copy**, never the `BALANCE` object.

| Skill | Key | Call site (file · function) | What changes |
|---|---|---|---|
| 큰 가방 | `bag` | `Progression.capacity()` | `gs.chief.value('bag')`; fallback `BALANCE.upgrades.capacity.values[up.capacity]` |
| 가벼운 발걸음 | `speed` | `Progression.speedMult()` | same with `speed` |
| 손재주 | `hands` | `Station` chief-operated speed (`labour.chiefSpeed`), `Register` chief pay time (`register.chiefPayTime`), `Player` gather swing timer | multipliers |
| 넓은 손길 | `reach`, `stillS` | `Player.update` (`BALANCE.player.gatherRange` reads), `PickupPolicy` still wait (`v42.pickup.stillS`) | radius, seconds |
| 뚝딱 건축 | `buildTime`, `porterCap`, `ribbon` | `buildCost()` `time`; `Growth` houses `v4.houses.time` / founding `v4.founding.buildTime`; the v4.2 sites' times; the depot 20 s; 금방 opening timer (through its ports); site porter load `build.porterCapacity` (`Worker.js` site porter constructor); ribbon auto-open `v4.founding.ribbonAuto` | the builder count is **not** touched: `Site.update` advances `buildT` by `dt × min(1, working / builders + 0.25)`, so more builders never build faster (D35) |
| 알뜰 건축 | `buildCoins` | `buildCost()` `coins` (build menu, `Site` payment, tower pads, `Civic.choices` card price) | ceremony and 금방 upgrades never |
| 꼼꼼한 설계 | `buildMats` | `buildCost()` `item_plank` / `item_ingot` (floor, never below 1 where it was ≥ 1); `Growth` houses `v4.houses.item_plank` | — |
| 설득력 | `hire`, `orderNeed`, `swap` | `stepCost(s)` for `hire / hire2 / hire3 / operator / raw / porter / clerk / stationPorter / restStaff` (not `zone / tower / rank / boat`); `Office` hire price; `LineUpgrades` porter2 costs; r3 `Growth` founding `need` (ceil); r4 `v4.orders.swapAfter`, missions `swapAfter` | after a learn: `Progression.reprice()` (new) re-reads every live pad and refunds overpaid partials (the `syncPads` / `sanePrice` code) |
| 인기도 | `settlers`, `visitors`, `fame`, `chiefNeed` | `Civic` settlers interval; `Neighbours` riders base; missions `Fame.add` (v5); insight chief need (v4.6) | **never** `Civic.happyBonus()` / `civic.happyCap` or anything else that feeds the 읍 bar (D34) |
| 리더십 | `workerSpeed`, `cheer` | `Worker` speed (`workers.speed`), `StationPorter`, warehouse porters; `ChiefAura` cheer mult / radius / still | worker total with the happy-worker bonus ≤ +15 % |
| 협상 | `rates` | `Growth.payWholesale()`, `Freight.payExports()`, `DepotSystem` sell rate, `Seller` trade slowness (`register.clerkTradeSlow`), 금방 `settle` (ports) | — |
| 행운 | `luck` | `Player.impact()` after `n.hit(this)`: +1 roll (seeded stream `luck`); `DogPlay` gift interval | — |
| 든든한 금고 (v4.5) | `vault` | rewards offline cap / rate; `Growth` rent cap (`v4.rent.cap`); `TownHall` tax cap (`civic.hall.taxCap`) | — |
| 관찰력 (v4.6) | `insight` | insight panel detail level | — |

---

## 8. Tuning: `BALANCE.v44` (every new number, Korean comments for the designer)

`balanceCheck.js`:
- gets a `V44_SPEC` table `[min, max, default, whole?]` through `fixSpec` (the v4.2 pattern);
- the `isOptional` regex grows by `v44`;
- per skill: lengths match the ranks, `lv` ascending, `bag.values` strictly increasing 6..40, `speed.values` 1.0..1.8;
- gear skills (`bag`, `speed`) have no `sp` array (D8); a talent without `sp` is repaired to all-1;
- per-rank effects stay ≤ `caps`;
- `popular` may not carry a `happyCap` key (D34): it is deleted with a warning;
- it warns when the talent SP needed exceed the SP available at `level.max`.

```js
// ══ (v4.3.1–v4.6) 촌장 성장 · 이야기 · 매일의 즐거움 · 행복 · 자원 · 관리자 · 계정 (docs/v44_plan.md, 기획서_v4_4_촌장성장.md)
//   코인 보상은 '지금 1분 수입(I)'의 몇 배로 적어요. 마을이 커져도 보상이 알맞게 따라 커져요.
//   floor = 가장 적은 보상 (× 시대 배율 eraMult). 시간은 초, 따로 적은 곳만 분/시간.
v44: {
  eraMult: [0.3, 0.6, 1, 2, 3],          // 시대 배율: 마을 완성 전 · 완성 · 읍 · 도시 · 큰 도시

  // ── 1분 수입 재기 (v4.4). 보상 코인은 모두 이 '1분 수입'으로 정해요
  income: { sampleS: 5, windowS: 300, dayS: 1800,   // 5초마다 재서 5분 평균, 30분 평균
    clamp: [0.5, 1.5],                   // 5분 평균은 30분 평균의 0.5~1.5배 안에서만 (금고를 모았다 한꺼번에 받아도 보상이 튀지 않게)
    seedI: [150, 900, 2000, 4000, 6000] },   // 예전 저장을 처음 열 때 쓰는 1분 수입 (시대마다). 봇이 다시 재서 고쳐요

  // ── 촌장 이름 (v4.3.1)
  name: { max: 8,                        // 이름 글자 수 최대 (한글 한 글자 = 1)
    suggest: ['눈송이', '솔방울', '고드름', '함박', '포근', '서리별', '몽실', '눈꽃'] },   // '추천 이름' 버튼이 돌아가며 보여 줘요

  // ── 관리자 모드 (v4.3.1)
  admin: { taps: 7,                      // 설정 창 위쪽(탭 바로 위) 작은 버전 글씨를 이만큼 누르면 열려요
    coins: 100000,                       // '코인 +10만' 버튼이 넣는 코인
    speeds: [1, 2, 4],                   // 시간 빠르기 버튼 (한 화면에 게임을 이만큼 여러 번 돌려요)
    items: [10, 50, 200],                // '아이템 넣기' 개수 버튼
    crowd: 3 },                          // '손님·기차 더 많이' 켜면 손님이 이만큼 배로 와요

  // ── 촌장 레벨 (v4.4)
  chief: {
    level: { base: 180, k: 10, p: 1.65, max: 60 },   // 레벨 L → L+1 경험치 = 180 + 10 × (L−1)^1.65 (10 단위). 최고 60
    sp: { perLevel: 1, every5: 2, ceremony: 2, migrateGift: 2 },   // 레벨마다 스킬 포인트 1, 5의 배수 레벨은 2, 승격식 +2, 예전 촌장님 선물 +2
    pilotXp: 0.25,                       // 관망 중에는 경험치가 이만큼만 (0.25 = 4분의 1)
    napAfter: 1200,                      // 관망 중 이만큼(초) 화면을 안 만지면 경험치 0 (촌장님이 꾸벅꾸벅)
    couponEvery: 10,                     // (v4.4.1부터) 레벨 10, 20, 30 … 마다 꾸미기 쿠폰 한 장
    xp: {                                // 경험치 (촌장님이 직접 한 일만. 일꾼이 한 일은 0)
      gather: 1, hunt: 3, made: 1, served: 2, traded: 1, restMeal: 2, dropPer: 3, collect: 2, collectMin: 50,
      hire: 20, hire2: 25, hire3: 30, staff: 25, zone: 40, tower: 80,
      built: { S: 15, house: 30, M: 60, L: 60, station: 80, v42: 100, XL: 120, gbOpen: 120 },
      lineUp: 30, shopOpen: 50, ceremony: 500,
      chat: 10, tap: 5, dog: 5, letter: 15, paper: 10,
      daily: 40, dailyAll: 60, weekly: [100, 150, 250], monthly: [300, 500, 700, 1000],   // (v4.5)
      attend: [30, 30, 40, 40, 50, 60, 100], gifts: [20, 30, 50],                        // (v4.5)
    },
    limits: { chat: 10, tap: 10, dog: 10, paper: 1,   // 하루에 경험치를 주는 횟수 (새벽 5시에 다시 세요)
      drop: 1500 },                      // 물건 나르기 경험치는 하루 1,500까지 (보통 하루 30분이면 600쯤). 창고에 넣기, 집어 온 곳에 도로 넣기는 0
  },

  // ── 스킬 (v4.4; vault v4.5, insight v4.6)
  //   장비(가방·신발) = 코인만 내요. 스킬 포인트는 안 들어요. lv = 그 단계를 배울 수 있는 레벨 (0 = 제한 없음)
  //   재능(나머지) = 스킬 포인트(sp)로 배워요. 마지막 단계가 조금 비싸요
  skills: {
    version: 1,                          // 숫자를 바꾸면 재능 스킬을 한 번 무료로 다시 배울 수 있어요
    bag:   { values: [6, 10, 14, 18, 22, 26, 30], fee: [40, 90, 170, 300, 480, 2000], lv: [0, 0, 0, 0, 0, 20], unlock: 'step:hire_lumberjack' },   // 큰 가방: 한 번에 드는 개수 (예전 작업대 값 그대로, 6단계만 Lv 20)
    speed: { values: [1.0, 1.15, 1.3, 1.45, 1.6], fee: [50, 120, 240, 400], lv: [0, 0, 0, 0], unlock: 'step:hire_lumberjack' },                // 가벼운 발걸음: 걷는 빠르기 배율 (예전 값 그대로)
    hands: { station: 0.1, pay: 0.1, swing: 0.08, sp: [1, 1, 3], lv: [3, 6, 10] },          // 손재주: 단계마다 직접 굽기 +10 %, 계산 −10 %, 캐기 −8 %
    reach: { range: [78, 92, 106, 120], still: [0.35, 0.3, 0.25, 0.2], sp: [1, 1, 2], lv: [4, 8, 14] },   // 넓은 손길: 캐는 거리(px), '멈추면' 줍기 기다림(초)
    buildFast:  { time: [0.15, 0.25, 0.35], porterCap: [12, 14, 16], ribbonAuto: [90, 60, 60], sp: [1, 1, 3], lv: [6, 10, 16], unlock: 'step:hire_miner' },   // 뚝딱 건축: 짓는 시간 −15 / −25 / −35 %, 공사 짐꾼이 12 / 14 / 16개씩, 2단계부터 가게 리본이 60초 뒤 저절로
    buildCheap: { coins: 0.05, sp: [1, 1, 1, 3], lv: [6, 9, 13, 18], unlock: 'step:hire_miner' },                       // 알뜰 건축: 단계마다 건물 코인 −5 %
    buildLean:  { mats: 0.1, sp: [1, 3], lv: [10, 18], unlock: 'b:toolsmith' },                                         // 꼼꼼한 설계: 단계마다 판자·주괴 −10 %
    persuade: { hire: 0.05, orderNeed: 0.1, ordersSwap: 120, missionSwap: 90, sp: [1, 1, 1, 3], lv: [3, 7, 12, 18], unlock: 'step:hire_clerk_market' },   // 설득력: 단계마다 고용 값 −5 %
    popular:  { settlers: 0.15, visitors: 1, fame: 0.05, chiefNeed: 5, sp: [1, 1, 3], lv: [8, 12, 18], unlock: 'step:hire_miner' },          // 인기도: 이주민이 더 자주, 기차 손님 +1명씩 (승격식 막대는 안 건드려요)
    lead:     { worker: 0.03, cheer: 0.03, radius: [200, 240, 280, 320], still: [2, 2, 1.5, 1.5], sp: [1, 1, 3], lv: [9, 14, 20], unlock: 'step:hire_farmer' },   // 리더십
    trade:    { wholesale: 0.03, export: 0.05, depot: 0.04, gb: 0.03, clerkSlow: [1.25, 1.2, 1.15, 1.1], sp: [1, 1, 3], lv: [12, 16, 22], unlock: 'f:firstTrain' }, // 협상
    luck:     { extra: 0.03, dog: 0.25, sp: [1, 1, 3], lv: [7, 13, 20] },                                                // 행운: 단계마다 직접 캔 물건 3 % 확률로 하나 더
    vault:    { capH: [3, 4, 5], rate: [0.04, 0.04, 0.05], till: 0.25, sp: [1, 3], lv: [15, 25], unlock: 'complete' },   // (v4.5) 든든한 금고: 하루에 쳐 주는 쉬는 시간·비율
    insight:  { sp: [1, 1, 2], lv: [5, 10, 15], unlock: 'step:hire_miner' },                                             // (v4.6) 관찰력
    caps: { buildCoins: 0.3, buildMats: 0.3, buildTime: 0.4, hire: 0.25, workerSpeed: 0.15, settlers: 0.5, luck: 0.12, rateAdd: 0.2 },   // 안전 한도 (오타가 있어도 이 이상은 안 바뀌어요)
  },
  respec: { minCoins: 300, incomeMin: 5 },   // 재능 다시 배우기: 처음 한 번 무료, 그다음은 max(300, 5분 수입), 하루 한 번

  // ── 이야기 (퀘스트, v4.4.1). ch = [가장 적은 코인, 몇 분 수입] (1장 ~ 7장)
  quests: { ch: [[5, 0.05], [10, 0.05], [20, 0.05], [40, 0.05], [60, 0.05], [150, 0.1], [200, 0.1]],
    chapterBonusFrom: 5, chapterBonusMin: 1,   // 5장부터 장이 끝날 때 1분 수입만큼 더
    arriveDelay: 1.5,                    // 이미 해 둔 퀘스트는 이만큼(초) 보여 준 뒤 끝나요
    autoClaim: 20,                       // '받기'를 안 누르면 이만큼(초) 뒤 우편함으로 가요
    guideTtl: 15,                        // 퀘스트 '길 안내' 점이 보이는 시간(초)
    catchupXp: 2,                        // 예전(v4.3.1까지) 저장: 지나간 퀘스트 경험치 2배 (v4.4에서 시작한 마을은 1배)
    catchupCoinsMin: 10 },               // 지나간 퀘스트 코인은 10분 수입까지

  // ── 오늘 · 이번 주 · 이달 (v4.5; 나머지 숫자는 src/missions/tuning.js)
  missions: { calendarGate: ['step:hire_farmer', 'q:q211'],   // 둘 중 하나가 먼저 되면 오늘의 미션 · 출석 · 접속 선물이 열려요
    v5Parts: false,                      // 게시판·부탁 말풍선·행사·명성은 v5에서 켜요 (v4에서는 꼭 false)
    tiers: true,                         // 미션 개수가 시대마다 커져요
    streakMissHalves: true,              // 하루 빠지면 연속 기록이 반으로 (0으로 안 돌아가요)
    monthly: { stamps: 20, at: [5, 10, 15, 20], pay: [2, 3, 4, 6], sp20: 1 } },   // 이달의 눈꽃 도장판

  // ── 출석 · 접속 선물 · 쉬는 동안 번 돈 · 우편함 · 보관함 (v4.4.1 우편함·보관함, 나머지 v4.5)
  attend: { strip: [['coins', 0.5], ['treats', 3], ['coins', 1], ['coupon', 'small'], ['coins', 1], ['halo', 24], ['coins', 2, 'stamp']],   // 7일 꾸러미 (halo = 반짝 후광 24시간)
    floor: 30,                           // 출석 코인 가장 적은 값 (× 시대 배율)
    board: { at: [7, 14, 21, 28], pay14: 3, xp14: 200, xp28: 500, sp28: 1 },   // 28칸 도장판
    boardGifts: [['igloo', 'lantern_string'], ['kids_swing', 'snow_fort'], ['flower_stand', 'wedding_arch']] },   // 판마다 7칸·21칸 선물 꾸미기
  gifts: { at: [300, 900, 1800], pay: [0.25, 0.5, 0.75], floor: [10, 20, 30], activeS: 60, pilotHalf: true },     // 접속 선물: 오늘 논 시간(초). 관망은 1분 안에 화면을 만졌을 때만 반으로 쳐요
  offline: { rate: 0.04, capH: 3, minAwayMin: 10, afterComplete: true, perDay: true },   // 쉬는 동안: 30분 평균 수입의 4 %, 하루에 모두 합쳐 3시간 몫까지
  mail: { max: 20 },                     // 우편함 칸 수 (넘치면 가장 오래된 것부터 저절로 받아요. 잃는 건 없어요)
  inv: { max: 9, extraXp: 50 },          // 보관함: 같은 꾸미기는 9개까지, 더 오면 하나에 경험치 50
  giftSpots: [12, 16, 20],               // 선물 꾸미기 놓는 자리 수: 마을 · 읍 · 도시 (WORLD.v44.giftSpots)

  // ── 주민 행복 (v4.6). w = 비중(합 100), floor = 아무리 낮아도 이만큼
  insight: { recompute: 5,
    needs: { food: { w: 20, floor: 30 }, home: { w: 20, floor: 40 }, work: { w: 15, floor: 60 }, shops: { w: 10, floor: 40 },
             decor: { w: 10, floor: 40 }, fun: { w: 10, floor: 50 }, chief: { w: 15, floor: 50 } },
    near: 700,                           // 집 둘레 이만큼(px) 안의 꾸미기·벤치를 세요
    settlersFrom: 60, taxMax: 0.3, happyWorker: { at: 80, mult: 0.05 }, visitors: [[80, 1], [90, 2]] },   // 승격식 막대는 지금 그대로 (주민 행복은 보너스만)
  region: { emptyS: 30, fullS: 60, soonMin: 5, toastEvery: 180, top: 3 },   // 지역 자원: 비어 있으면 '부족' 30초, 가득 '남음' 60초, '곧 부족' 5분

  // ── 계정 (login track)
  account: { pushEvery: 120, backoff: [30, 120, 600, 1800], timeout: 8, maxSaveKB: 64, codePrefix: 'SV' },
},
```

---

## 9. Chief: name, title, XP, levels

### 9.1 Name (v4.3.1)

**Flow**:
- New game: Title → tap (no save) → **name sheet** → the village.
- Old save: once, when `chief.seen.name` is not set, 3 s after the village is on screen (not during a ceremony, a sheet or
  the tutorial bar's first step). Revision 1 waited for the 새로워진 것 card, which only v4.1 saves see (`V42.js` `fromOld`;
  critique L8). `나중에` shows `촌장님` and sets `seen.name`.
- Rename:
  - v4.3.1: settings › **촌장** › `촌장 이름 ✎` (the 놀이 tab is full, critique M2);
  - from v4.4 also the skill window header.
  - Free, any time.

**Rules**:
- 1–8 characters, a Hangul syllable = 1.
- Allowed: 한글, A–Z a–z, 0–9, inner space, `·`. Trimmed.
- The blocklist `src/data/nameBlock.js` (Korean + English slurs) gives `다른 이름을 써 주세요`.
- A lone jamo gives `글자를 끝까지 적어 주세요`.
- The 추천 이름 chip cycles `BALANCE.v44.name.suggest`.

**Sheet**: DOM over the canvas (`ChatPanel` pattern), 640×520 logical, top at 14 % of the visual viewport.
- **Keyboard and focus**:
  - `game.input.keyboard.enabled = false` while open (the `ResidentChat.pauseGame` pattern);
  - `inert` on the game container;
  - follows `visualViewport` resize and scroll;
  - the Game scene is paused (modal).
- **Korean IME rules**:
  1. `<input type="text" lang="ko" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="done">`, with no tight `maxlength` (a guard of 24 only).
  2. While composing (`compositionstart` → `compositionend`), never rewrite `value`.
  3. Count with `Array.from(value.normalize('NFC')).length`; trim to 8 only after `compositionend`.
  4. Submit on the form's `submit` or the button. Ignore Enter when `e.isComposing || e.keyCode === 229`.
  5. **The button never reads `value` on `pointerdown`** (critique M14). Android Korean keyboards (Gboard, Samsung) keep the
     last syllable composing until blur, so a tap on `이걸로 할게요` mid-composition would save "눈송" for "눈송이". The
     button calls `input.blur()`, then reads `value` on the `compositionend` that follows, or after two animation frames
     when no composition was open.
  6. **No autofocus** when the sheet opens by itself (a pulsing plate `여기를 눌러 이름을 적어요`); focus synchronously when it is opened by a tap.
  7. The field's font is set in **CSS px**: `max(16px, 26 × cssScale px)`, where `cssScale` = canvas CSS width / 720.
     Below 16 CSS px iOS Safari zooms the page on focus (the chat input already uses 16 px, `ChatPanel.js`).
- **Where it shows**:

  | Version | Places |
  |---|---|
  | v4.3.1 | letters (`{nm} 촌장님께`), resident greetings (`{nm} 촌장님!`), the ceremony banner, the office panel title, the 금방 letter, the chat prompt's chief name, a small line under the title pill (`눈송이 촌장님, 어서 오세요`) |
  | v4.4 | + the skill window header, the Lv ring long-press tooltip |
  | login track | + the cloud conflict cards |

  Josa come from `src/story/engine/lang/josa.js`.

### 9.2 Title by village rank

| `Rank.level` | Village | Title | Display |
|---|---|---|---|
| 1 | 서리마을 | 촌장 | 눈송이 촌장 |
| 2 | 서리읍 | 읍장 | 눈송이 읍장 |
| 3 (v5) | 서리시 | 시장 | 눈송이 시장 |
| 4 (v8) | 큰 도시 | 시장 (gold badge) | 눈송이 시장 |

- `strings.rank_title_n` already holds 촌장 / 읍장.
- Residents keep saying `{이름} 촌장님` (v5 plan: "그래도 다들 촌장님이라고 불러요").
- The skill window header shows the three ladders in one line:

  | Ladder | Korean label | Example | From |
  |---|---|---|---|
  | level | 촌장님 실력 | Lv 12 | v4.4 |
  | title | 마을의 크기 | 눈송이 읍장 | v4.4 |
  | fame | 주민들의 믿음 | ★★ | v5 |

### 9.3 XP sources (only the chief's own actions; workers never give XP)

- 관망 mode: all XP is ×0.25. After `napAfter` (1,200 s) with no touch it is 0, with the line `촌장님이 꾸벅꾸벅 졸아요`.
- Day limits use the missions day key (local date, the day starts at 05:00).
- XP from `admin`-sourced events is ignored.

| Group | Action | XP | Limit | Feed |
|---|---|---|---|---|
| 채집 | catch / chop / harvest / mine one item | 1 | — | `chiefGather` |
| 채집 | hunt an animal | 3 | — | `chiefGather` (`animal`) |
| 가공 | one product while the chief works a station spot | 1 | — | `produced` (`chief`) |
| 판매 | serve one customer at a register | 2 | — | `sold` (`chief`) |
| 판매 | sell one item to the 교역소 merchant by hand | 1 | — | `traded` (`chief`) |
| 판매 | a dish at the big restaurant, chief working | 2 | — | `restMeal` (`chief`) |
| 나르기 | deliver to a shelf / station / site / order / shop / food box (not the 창고, not back where it was picked up) | 1 per 3 items (min 1 a drop) | ≤ 1,500 XP a day (a 30-min day earns ≈ 600; the cap only stops loops) | `chiefDrop` |
| 나르기 | collect a till ≥ 50 coins | 2 | — | `collect` |
| 고용 | hire / operator / raw / porter / clerk step | 20 | — | `step` |
| 고용 | hire2 / hire3 / staff (restaurant, office, station porter) | 25 / 30 / 25 | — | `step`, `officeHire` |
| 땅 | open a zone / light a watchtower | 40 / 80 | — | `step zone_*`, `region` |
| 건축 | finish S decor / house / M–L building / station / v4.2 site / XL or 금방 opening | 15 / 30 / 60 / 80 / 100 / 120 | — | `built`, `gb:open` |
| 성장 | line upgrade / shop opens / 승격식 | 30 / 50 / 500 + 2 SP | — | `lineUp`, `shopOpen`, `rank` |
| 사람 | talk to a resident (chat) | 10 | each resident once a day, ≤ 10 a day | `chat` |
| 사람 | greet a resident (tap) | 5 | ≤ 10 a day | `tap` |
| 사람 | play with 콩이 | 5 | ≤ 10 a day | `dogAct` |
| 사람 | answer a letter / read the morning paper | 15 / 10 | paper once a day | `letterReply`, `paperRead` |
| 이야기 | quests | per quest (§11.3) | — | `quest:done` |
| 미션 (v4.5) | daily / all three / weekly stage / monthly milestone | 40 / +60 / 100–250 / 300–1,000 | — | calendar |
| 출석 (v4.5) | check-in day 1–7 / play gifts | 30–100 / 20–50 | — | rewards |

### 9.4 Level curve

- XP to the next level: **XP(L → L+1) = round10(180 + 10 × (L − 1)^1.65)**, cap Lv 60 (192,450 XP in all; numbers re-computed for this plan).
- The "casual" column is the design's XP model (30 min a day) **with the quest chain** (v4.4.1); bots re-check it once the
  code exists (§22.4). Quests give about half the XP up to 읍, so in v4.4 alone the levels come ≈ 40 % later (Lv ≈ 6–9 at
  30 min instead of 9–13); v4.4.1's catch-up then credits the quests already done.
- Every 10th level (Lv 10, 20, 30 … 60) gives a decor coupon (`couponEvery` 10), from v4.4.1 on. A chief already past
  Lv 10 or 20 when v4.4.1 arrives gets those coupons then. (Revision 1 said "Lv 30, 40, 50 and 60" here; critique L12.)

| Lv | XP to next | Total XP | Level SP so far | Casual player reaches it |
|---|---|---|---|---|
| 2 | 190 | 180 | 1 | play minute ≈ 3 |
| 3 | 210 | 370 | 2 | ≈ 5 min |
| 5 | 280 | 820 | 5 | ≈ 8 min |
| 8 | 430 | 1,790 | 8 | ≈ 18 min |
| 10 | 560 | 2,710 | 11 | ≈ 25 min |
| 11 | 630 | 3,270 | 12 | end of day 1 |
| 15 | 960 | 6,250 | 17 | ≈ 55 min (읍 ≈ 65–80 casual min) |
| 20 | 1,470 | 12,020 | 23 | day 3–4 |
| 24 | 1,950 | 18,590 | 27 | day 7 |
| 30 | 2,770 | 32,260 | 35 | day 16 |
| 36 | 3,710 | 51,160 | 42 | day 30 |
| 40 | 4,400 | 67,020 | 47 | day 41: every talent maxed with quest, ceremony, monthly and board SP |
| 50 | 6,330 | 119,460 | 59 | day 75 |
| 60 | — | 192,450 | 71 | day ≈ 125 (60 min a day: ≈ 65) |

### 9.5 Skill points

| Source | SP | Version |
|---|---|---|
| each level | +1; every 5th level +2 (Lv 60 = 71) | v4.4 |
| quest chapter ends | Ch1–Ch4 +1, Ch5 +2, Ch6 +1, Ch7 +1 (= 8) | v4.4.1 |
| 승격식 | +2 | v4.4 |
| old save thank-you | +2 | v4.4 |
| monthly stamp card full | +1 a month | v4.5 |
| 28-day attendance board | +1 a board | v4.5 |

- SP buy **talents only**; the two gear skills cost coins (D8).
- All 12 talents need **58 SP** (36 ranks; the last rank of most talents costs 3, §10.2). With the 8 chapter SP, the 2
  ceremony SP and ≈ 3 monthly / board SP in the first six weeks, that is reached at about **Lv 40 (day ≈ 41 at 30 min a day)**,
  the same point as revision 1. The 10 talents of v4.4 need 50 SP.
- Early check (Lv 8, ≈ 18 casual min): 8 level SP + Ch1 + Ch2 = 10 SP. By their level gates, 7 talent ranks are open then
  (hands 2, reach 2, persuade 2, luck 1), and 10 once the miner is hired (+ buildFast 1, buildCheap 1, popular 1). The
  effect of spending them all on the first session is measured by the `eager` bot (§22.4); the knobs are the talents' `lv`.
- Later points become 명예 별 on the name plate: one ★ per 5 points, cosmetic.

### 9.6 Level-up and the Lv ring

- **Level-up moment**:
  - `fx_levelup` + `sfx_levelup` (both exist);
  - banner `촌장 레벨 {n}!` / `스킬 포인트 +{sp}`;
  - when something new unlocks, a second line `새 스킬: {skill}`;
  - a `스킬 보기` button on the banner.
- **No coins on a level-up** (inflation).
- **Lv ring** at (62, top), ⌀72 drawn ring, hit ⌀88:
  - level number 30 px, XP arc 6 px;
  - a red SP dot ⌀18 when points are unspent, **and a small coin dot** when a gear rank is unlocked and affordable (the
    v4.2 pad condition: `remaining ≤ coins`);
  - tap → skill window; long-press → name, title, XP numbers.
- **XP floats** `+3` from the chief: at most one every 0.5 s (merged), setting `경험치 숫자` (default on).

---

## 10. Skills (14; 2 gear + 10 talents in v4.4)

### 10.1 Rules

- **Two gear skills** (장비): 큰 가방 and 가벼운 발걸음 (D8).
  - Cost: **coins only**, the old pad prices (`fee`). No SP.
  - No level gate, except the new bag rank 6 (30 items) at Lv 20.
  - Unlock at `step:hire_lumberjack` (the old bench condition), exactly when the v4.2 pads appeared.
  - Never respecced.
  - Their cards are **visible from minute 0** as locked cards: `나무꾼을 고용하면 배울 수 있어요`. The player learns early
    that the bag lives here.
- **Twelve talent skills** (재능): SP only, can be respecced.
- **Gates**:
  - every talent has an unlock fact (`unlock`); before it the card is hidden, so the window never shows something the
    village cannot have yet (gear is the exception above);
  - every talent rank has a level gate (`lv`), shown as `Lv {n}에 배울 수 있어요`.
- **Learn flow**:
  1. confirm: gear `큰 가방 4단계를 배울까요? (300코인)`; talent `손재주 2단계를 배울까요? (스킬 포인트 1)`;
  2. `chief.learn(k)`: the SP (talents) or the fee through `ports.coins.spend` (gear), refused politely when short
     (`코인이 {n}개 모자라요`);
  3. feed `skill:learn`;
  4. `fx_levelup` and the banner `큰 가방 4단계! 한 번에 22개`;
  5. `Progression.reprice()` when a price skill changed.
- Prices on pads and cards show the discounted value with a small `−10 %` tag.

### 10.2 The list

`r` = rank. Effect values are at each rank → the max. "Ships" = the version in which the card appears.

| # | Skill (ko) | Branch | Icon (`ui7`, D23) | Ranks | Effect (max) | SP per rank | Coin fee | Lv gates | Unlock | Ships |
|---|---|---|---|---|---|---|---|---|---|---|
| A1 | **큰 가방** (장비) | 일솜씨 | `ui7_sk_bag` | 6 | bag 6 → 10 / 14 / 18 / 22 / 26 / **30** | — (coins) | 40, 90, 170, 300, 480, 2,000 | —, —, —, —, —, 20 | `step:hire_lumberjack` | v4.4 |
| A2 | **가벼운 발걸음** (장비) | 일솜씨 | `ui7_sk_speed` | 4 | move ×1.0 → 1.15 / 1.3 / 1.45 / **1.6** | — (coins) | 50, 120, 240, 400 | — | `step:hire_lumberjack` | v4.4 |
| A3 | **손재주** | 일솜씨 | `ui7_sk_hands` | 3 | chief station speed `labour.chiefSpeed` 1.25 × (1 + 0.1r) → **1.625**; register pay time 0.35 × (1 − 0.1r) → **0.245 s**; gather swing ×(1 − 0.08r) | 1,1,3 (5) | — | 3, 6, 10 | start | v4.4 |
| A4 | **넓은 손길** | 일솜씨 | `ui7_sk_reach` | 3 | gather reach 78 → 92 / 106 / **120 px**; '멈추면' pickup wait 0.35 → 0.3 / 0.25 / **0.2 s** | 1,1,2 (4) | — | 4, 8, 14 | start | v4.4 |
| B1 | **뚝딱 건축** | 건축 | `ui7_sk_build` | 3 | every build timer −15 / −25 / **−35 %** (plots, towers, station, v4.2 sites, the depot, carpenter houses, shop founding 25 s, 금방 opening); site porters carry 10 → 12 / 14 / **16**; from r2 the shop ribbon opens by itself after 60 s instead of 90 s (D35) | 1,1,3 (5) | — | 6, 10, 16 | `step:hire_miner` | v4.4 |
| B2 | **알뜰 건축** | 건축 | `ui7_icon_piggy` | 4 | building **coins** ×(1 − 0.05r) → **−20 %** (buildings, towers, station, v4.2 sites, 금방 opening pad; not the ceremony or 금방 upgrades) | 1,1,1,3 (6) | — | 6, 9, 13, 18 | `step:hire_miner` | v4.4 |
| B3 | **꼼꼼한 설계** | 건축 | `ui7_sk_lean` | 2 | building **materials** (판자, 주괴) ×(1 − 0.1r) → **−20 %**, floor, never below 1 where it was ≥ 1; carpenter houses 20 → 18 → **16** planks | 1,3 (4) | — | 10, 18 | `b:toolsmith` | v4.4 |
| C1 | **설득력** | 사람 | `ui7_sk_persuade` | 4 | hire prices ×(1 − 0.05r) → **−20 %** (every hire / operator / raw / porter / clerk / hire2 / hire3 / station porter / restaurant staff / office staff / porter 2; never land, boats, towers or the ceremony); r3 shop-founding orders ask **−10 %**; r4 order board swap 180 → **120 s**, mission swap 120 → **90 s** | 1,1,1,3 (6) | — | 3, 7, 12, 18 | `step:hire_clerk_market` | v4.4 |
| C2 | **인기도** | 사람 | `ui7_sk_popular` | 3 | settlers come more often: interval ÷(1 + 0.15r) → **÷1.45**; train visitors base 4 → **7**; (v5) fame ×(1 + 0.05r); (v4.6) the per-resident 촌장 need +5r. **Never** the 읍 bar or `civic.happyCap` (D34) | 1,1,3 (5) | — | 8, 12, 18 | `step:hire_miner` | v4.4 |
| C3 | **리더십** | 사람 | `ui7_sk_lead` | 3 | worker / porter walk speed ×(1 + 0.03r) → **+9 %**; cheer mult 1.1 → **1.19**, radius 200 → **320**, still 2 → **1.5 s** (r2+) | 1,1,3 (5) | — | 9, 14, 20 | `step:hire_farmer` | v4.4 |
| C4 | **협상** | 사람 | `ui7_sk_trade` | 3 | wholesale 0.7 → **0.79**; export 0.5 → **0.65**; depot sell 0.6 → **0.72**; 금방 parcel price ×(1 + 0.03r); 교역소 clerk slowness 1.25 → **1.1** | 1,1,3 (5) | — | 12, 16, 22 | `f:firstTrain` | v4.4 |
| D1 | **관찰력** | 지혜 | `ui7_sk_insight` | 3 | 지역 자원 panel detail: r0 status dots + counts · r1 flows per minute + *why* · r2 forecasts `약 6분 뒤 바닥나요` + **해결하러 가기** · r3 shortage toasts (≤ 1 per 3 min) + the 곧 부족 row | 1,1,2 (4) | — | 5, 10, 15 | `step:hire_miner` | **v4.6** |
| D2 | **행운** | 지혜 | `ui7_sk_luck` | 3 | each item the **chief** gathers: 3r % chance of +1 → **9 %** (a twinkle); 콩이 gift interval ÷(1 + 0.25r) | 1,1,3 (5) | — | 7, 13, 20 | start | v4.4 |
| D3 | **든든한 금고** | 지혜 | `ui7_sk_vault` | 2 | the **daily** offline credit 3 → 4 / **5 h**, rate 4 % → **5 %** at r2 (D30); till caps ×(1 + 0.25r): rent cap 2,000 → **3,000**, hall tax cap 1,500 → **2,250** | 1,3 (4) | — | 15, 25 | `complete` | **v4.5** |

Talent totals: 36 ranks, **58 SP** (v4.4's ten talents: 50 SP).

Notes:
- Bag rank 6 (30 items) needs a visual check of the head stack (`StackBaker`, `carryScale 0.62`). If 30 looks too tall, rank 6 becomes a small sack on the back for items above 26.
- Speed stops at ×1.6 (408 px/s): the Navigator, steering and pad dwell timers are tuned up to it.
- 뚝딱 건축 r3 is the only rank that makes a 30-s house about 10 s shorter; most of the felt gain is the site porters'
  bigger loads (material delivery is the real wait) and the earlier ribbon.

### 10.3 Caps (economy sanity)

| Effect | Cap at max | Expected late effect |
|---|---|---|
| building coins / materials | −20 % / −20 % | ≈ −8 % of all coins spent after the village is complete |
| build timers | −35 % (cap 40 %) | a few seconds per building; deliveries arrive ≈ 1.6 × faster per porter trip |
| hire prices | −20 % (never land or ceremonies) | ≈ −10 % of spend in v3–v4 |
| worker walk | +9 % (with the happy-worker bonus at most +15 %) | +3–6 % income (lines are mostly supply-limited) |
| wholesale / export / depot | +9 / +15 / +12 points | ≈ +1–2 % income |
| luck | 9 %, chief-gathered items only | negligible after the village is complete |
| settlers | ÷1.45 interval (cap ÷1.5) | the houses fill a little sooner; the 읍 bar is not touched (D34) |
| offline (v4.5) | 5 h · 5 % **per day** | §13.3 |

A maxed chief earns ≈ +5–9 % and spends ≈ 10–15 % less: ≈ 15–25 % faster per minute than a Lv 1 chief at the same place.
From v5, prices follow `I`, so this never runs away.

### 10.4 Respec (재능 다시 배우기)

- **What resets**: talent skills only; every SP comes back. Gear ranks never reset (they were bought with coins).
- **Cost**:
  - the first respec is free;
  - after that `max(300, round10(5 × I))` coins, once per day key;
  - free again when `skills.version` changes (toast `스킬이 바뀌어서 한 번 무료로 다시 배울 수 있어요`).
- Not during a ceremony or the tutorial.

### 10.5 What happens to the map pads (D7)

- **Pads**:
  - `Progression.openBench` no longer makes the two `UnlockPad`s;
  - `upgrade()` stays only for the admin's gear reset and for old tools.
- **Bench prop** (`WORLD.bench`, `showBench`): stays as plaza furniture, no pad, no label.
- **Tutorial** (the arrow keeps leading to the gear, critique M16):
  - v4.2's `Tutorial` points the arrow at an affordable upgrade pad again and again (the loops over `prog.upPads` in
    `Tutorial.evaluate`, the pad stand-still check and `nextAffordable`). v4.4 keeps that behaviour with the same
    condition, aimed at the Lv ring instead of a pad: **whenever a gear rank is unlocked and `fee ≤ coins`** (and no
    higher-priority target is active), the UI-scene arrow sprite points at the Lv ring and the ring shows its coin dot;
  - `Tutorial.upgradeHint` becomes `skillHint`: the hint bar says `왼쪽 위 레벨 동그라미를 눌러 '큰 가방'을 배워요` the
    first two times; later times only the arrow and the dot;
  - the arrow never covers the ring's hit area (it sits below-right of it, 90 px away).
- **Arrow-only bots**: when the arrow points at a UI target, the bot taps it (`__FV.ui.tapTarget()`), then learns the
  first learnable gear card. So the arrow-only bot buys the bag as it bought pads in v4.2.
- **Bots** use `__FV.chief.learn(k)` / `__FV.chief.state()`.

---

## 11. Quests (이야기)

### 11.1 Model (`src/missions/model/chain.js`, pure; v4.4.1)

- **One active main quest at a time**, in a fixed order.
- **Objective types**, in two classes that the catch-up (§11.6) and the tests use:
  - **progress-state** (a fact about the village that only grows): `step`, `built` (key or family `house_*`, `deco_*`),
    `region`, `flag`, `count` (shops, people, rank), `gb:letter`, `gb:open`, `gbDelivered ≥ n`, `gbUpgrades ≥ n`,
    `staff:<role>`, `newsAnswered ≥ n`;
  - **non-progress** (something the player does or looks at): counted `gather` (chief) / `made` / `sold` / `traded` /
    `served` / `exported` / `gbDeals` / `tap` (distinct residents) / `dogAct`, `skill` (rank ≥ n), `ui` (a panel was opened).
- **No one-time event is an objective** (D31): 금방's letter, opening, first delivery and upgrades, the office hires and
  letter replies are read as state facts. Counted objectives use only signals with no supply limit (a chain test checks it).
- **Passive quests** (`passive: true` in `data/chain.js`) are waits, not tasks: q403 첫 기차, q406 가게 1, q409 솔방울 마을,
  q412 가게 3, q508 가게 5, q510 주민 45. While one is active the chip says so and "다음 목표" stays visible (§11.4).
- **Counting**: counters start when the quest becomes active. State objectives are checked at once: a quest whose state already holds completes after `arriveDelay` 1.5 s.
- **Claiming**:
  - a done quest shows ✓ and `받기` on the chip; a tap claims it, with a coin and XP fly and `sfx_unlock`;
  - after `autoClaim` 20 s it goes to the 우편함, so nothing is lost;
  - the next quest appears at once (a claim never blocks the chain).
- **Version gaps**: a quest whose system is missing in this build (`needs: 'gb' | 'v45' | 'v5'`) is skipped and offered later as a side quest when the system arrives.
- **Side quests** (곁가지): optional, shown under the main quest, never blocking.

### 11.2 Rewards

- **Coins** = `max(F × eraMult, round10(m × I))` per chapter (`quests.ch`). From Ch5, each chapter end adds `round10(1 × I)`.
- **Ch1–Ch4 chapter ends** pay SP + a coupon, not coins: early coins would move the pacing gates.
- **XP** is fixed per quest (list below). **SP** comes at chapter ends (§9.5).

| Chapter | Smart-bot minutes (human ×1.4) | Typical I | F | m | Coins per quest | Quest coins ÷ income in the window |
|---|---|---|---|---|---|---|
| 1 첫 장사 | 0–3 (0–4) | 100 | 5 | 0.05 | 5 | ≈ 11 % (the first fisherman ≈ 10 s sooner) |
| 2 숲과 밭 | 3–13 (4–18) | 300–500 | 10 | 0.05 | 10–20 | ≈ 3 % |
| 3 광산과 사냥터 | 13–21 (18–29) | 650–900 | 20 | 0.05 | 30–40 | ≈ 4 % |
| 4 망루와 기찻길 | 20–30 (29–42) | 900 | 40 | 0.05 | 40–50 | ≈ 5 % |
| 5 서리읍으로 | 29–47 (42–66) | 900–1,800 | 60 | 0.05 | 60–90 + bonus | ≈ 8 % |
| 6 촌장의 하루 | 읍 + 0–40 | 1,800–2,500 | 150 | 0.1 | 180–250 + bonus | ≈ 5 % |
| 7 금방 배달 | depot + 1 game day | ≈ 2,500 | 200 | 0.1 | 250 + bonus | ≈ 5 % |

### 11.3 The main chain (68)

Format: `id · 제목 — 할 일 (objective) · 몇 · XP`. The chapter-end reward sits on the last line of each chapter.

**Ch1 첫 장사** — *서리마을의 첫 가게*
- `q101 · 바다의 선물` — 그물에서 물고기 잡기 (`gather item_fish_raw`) · 5 · 20
- `q102 · 지글지글 화덕` — 촌장님이 직접 생선 굽기 (`made item_fish_cooked`, chief) · 5 · 20
- `q103 · 첫 손님` — 계산대에서 손님 계산해 주기 (`served`) · 3 · 25
- `q104 · 첫 직원` — 판매대 점원 고용 (`step hire_clerk_market`) · 1 · 25
- `q105 · 요리사 쿡` — 요리사 고용 (`step op_grill`) · 1 · 30
- `q106 · 바다 사나이` — 어부 고용 (`step hire_fisherman`) · 1 · 30
- `q107 · 생선 나르미` — 생선 짐꾼 고용 (`step raw_grill`) · 1 · 30
- `q108 · 장사가 잘 돼요` — 구운 생선 팔기 (`sold item_fish_cooked`) · 40 · 40
- `q109 · 촌장님 수첩` — 레벨 동그라미를 눌러 스킬 창 열어 보기 (`ui skills`) · 1 · 30 · **chapter: +1 SP, 꾸미기 쿠폰 눈사람 동상**

**Ch2 숲과 밭** — *나무 냄새, 빵 냄새*
- `q201 · 소나무 숲` — 벌목장 열기 (`step zone_forest`) · 1 · 40
- `q202 · 나무꾼 촌장` — 통나무 베기, 직접 (`gather item_log`) · 10 · 40
- `q203 · 판자 장인` — 판자 만들기 (`made item_plank`) · 10 · 40
- `q204 · 교역소 첫 거래` — 교역소에서 판자 팔기 (`traded item_plank`) · 10 · 45
- `q205 · 든든한 나무꾼` — 나무꾼 고용 (`step hire_lumberjack`) · 1 · 50
- `q206 · 큰 가방` — 스킬 창에서 큰 가방 배우기 (`skill bag ≥ 1`) · 1 · 40
- `q207 · 황금 밀밭` — 농장 열기 (`step zone_farm`) · 1 · 50
- `q208 · 갓 구운 빵` — 빵 굽기 (`made item_bread`) · 15 · 50
- `q209 · 밀밭 지기` — 농부 고용 (`step hire_farmer`) · 1 · 60
- `q210 · 가벼운 발걸음` — 가벼운 발걸음 배우기 (`skill speed ≥ 1`) · 1 · 40
- `q211 · 반가운 이웃` — 서로 다른 주민 3명에게 인사 (`tap` distinct) · 3 · 50 · **chapter: +1 SP, 꾸미기 쿠폰 쉼터 의자** (the calendar has already opened at q209's farmer, D5)

**Ch3 광산과 사냥터** — *마을 완성!*
- `q301 · 반짝이는 광산` — 광산 열기 (`step zone_mine`) · 1 · 60
- `q302 · 광부 촌장` — 광석 캐기, 직접 (`gather item_ore`) · 12 · 60
- `q303 · 뜨거운 제련소` — 주괴 만들기 (`made item_ingot`) · 10 · 60
- `q304 · 광산의 일꾼` — 광부 고용 (`step hire_miner`) · 1 · 70
- `q305 · 우리 동네 첫 집` — 집 한 채 짓기 (`built house_*`) · 1 · 80
- `q306 · 예쁜 마을` — 꾸미기 하나 짓기, 쿠폰도 돼요 (`built deco_*`) · 1 · 60
- `q307 · 콩이랑 놀기` — 콩이에게 간식·공·쓰다듬기 (`dogAct`) · 1 · 50
- `q308 · 사냥터` — 사냥터 열기 (`step zone_hunt`) · 1 · 70
- `q309 · 훈제 향기` — 훈제 고기 만들기 (`made item_meat_cooked`) · 10 · 70
- `q310 · 마을 완성!` — 사냥꾼 고용 (`step hire_hunter`; the existing celebration plays) · 1 · 150 · **chapter: +1 SP, 꾸미기 쿠폰 가로등**

**Ch4 망루와 기찻길** — *눈안개 너머 이웃* (follows `GOALS` order)
- `q401 · 동쪽 망루` — 동쪽 망루에 불 켜기 (`region east`) · 1 · 90
- `q402 · 서리역 고치기` — 옛 역 고치기 (`built station`) · 1 · 100
- `q403 · 칙칙폭폭` — 첫 기차 맞이하기 (`flag firstTrain`, passive) · 1 · 80
- `q404 · 대장간` — 대장간 짓기 (`built toolsmith`) · 1 · 100
- `q405 · 배고픈 광부` — 광부 식량 상자 채우기 (`flag fedMiners`) · 1 · 90
- `q406 · 첫 가게` — 이웃 가게 하나 열기 (`count shops ≥ 1`, passive) · 1 · 100
- `q407 · 큰 식당` — 큰 식당 짓기 (`built big_restaurant`) · 1 · 120
- `q408 · 도끼 든 나무꾼` — 두 번째 나무꾼 (`step hire2_lumberjack`) · 1 · 100
- `q409 · 솔방울 마을 나들이` — 이웃 촌장님 초대에 가 보기 (`flag townVisit`, passive until `f:townInvite`) · 1 · 100
- `q410 · 보트 창고` — 보트 창고 짓기 (`built boathouse`) · 1 · 100
- `q411 · 노 젓는 배` — 나룻배 사기 (`step boat_rowboat`) · 1 · 100
- `q412 · 가게 거리` — 이웃 가게 3곳 (`count shops ≥ 3`, passive) · 3 · 120 · **chapter: +1 SP, 꾸미기 쿠폰 놀이터**

**Ch5 서리읍으로** — *마을에서 읍으로*
- `q501 · 남쪽 망루` — 남쪽 들판 열기 (`region south`) · 1 · 120
- `q502 · 창고` — 창고 짓기 (`built warehouse`) · 1 · 120
- `q503 · 통조림 공장` — 통조림 공장 짓기 (`built cannery`) · 1 · 130
- `q504 · 반짝 통조림` — 통조림 만들기 (`made item_can`) · 20 · 120
- `q505 · 잡화점` — 잡화점 열기 (`built store`) · 1 · 140
- `q506 · 동남쪽 언덕` — 동남쪽 망루 (`region se`) · 1 · 150
- `q507 · 큰 배` — 어선 띄우기 (`step boat_fishing`) · 1 · 150
- `q508 · 가게 다섯` — 이웃 가게 5곳 (`count shops ≥ 5`, passive) · 5 · 160
- `q509 · 마을회관` — 마을회관 짓기 (`built town_hall`) · 1 · 180
- `q510 · 북적북적` — 주민 45명 (`count people ≥ 45`, passive; the panel also shows 행복 80) · 45 · 180
- `q511 · 서리읍!` — 승격식 (`count rank ≥ 2`) · 1 · 300 · **chapter: +2 SP, 꾸미기 쿠폰 분수 공원, coins 1 × I, title 읍장**

**Ch6 촌장의 하루** — *사무실과 은행* (`Tutorial.v42Goal` order; staff in the hire pad's order `sem → ttal → bok`, `Office.js` `ROLES`)
- `q601 · 촌장 사무실` — 사무실 짓기 (`built chief_office`) · 1 · 160
- `q602 · 셈이` — 재고 담당 셈이 고용 (`staff:sem`) · 1 · 160
- `q603 · 재고판` — 사무실 재고판 열어 보기 (`ui officeStock`) · 1 · 120
- `q604 · 딸랑이` — 수금원 딸랑이 고용 (`staff:ttal`) · 1 · 180
- `q605 · 소복이` — 소식 담당 소복이 고용 (`staff:bok`; the 소식 / 편지 tabs open with her, `VillageNews.reporter`) · 1 · 160
- `q606 · 답장` — 편지에 답장하기 (`newsAnswered ≥ 1`) · 1 · 140
- `q607 · 서리 은행` — 은행 짓기 (`built bank42`) · 1 · 200
- `q608 · 서리 물류창고` — 물류창고 짓기 (`built depot42`) · 1 · 220
- `q609 · 기차 수출` — 기차로 상자 보내기 (`exported`) · 50 · 200 · **chapter: +1 SP, coins 1 × I, 선물 꾸미기 랜턴 줄**

**Ch7 금방 배달** — *방금 시키면 금방* (`needs: gb`; every objective is a state fact or a repeatable count, D31)
- `q701 · 정 할머니의 편지` — 금방 편지 받기 (`gb:letter`: the letter has come, or 금방 is already paid / open) · 1 · 200
- `q702 · 금방 개업` — 금방 문 열기 (`gb:open`) · 1 · 300
- `q703 · 첫 배달` — 첫 배달 끝내기 (`gbDelivered ≥ 1`) · 1 · 200
- `q704 · 진짜 금방이네` — 금방 배달 (`gb:delivered`, counted from activation; repeatable) · 30 · 250
- `q705 · 더 빨리` — 금방 업그레이드 하나 (`gbUpgrades ≥ 1`) · 1 · 250
- `q706 · 오늘의 특가` — 특가 한 번 걸기 (`gb:deal`, counted; deals can be started again and again) · 1 · 200 · **chapter: +1 SP, coins 1 × I**

**Later chapters** (placeholders, written with each version):
- **Ch8 생활과 미션 (v5)**: 첫 게시판 미션 · 첫 부탁 · 버스 · 첫 결혼식 · 신문 1면 · 아기 이름 · 명성 400 · 서리시 승격식 (시장).
- **Ch9 갈매기 항구 (v6)**: 철길 잇기 · 첫 여객선 · 경매 · 수출 200 · 항구 ★2.
- **Ch10 햇살 해변 (v7)**: 해변역 · 해변 가게 7곳 · 호텔 · 수영장 · 해변 ★3.
- **Ch11 살아 있는 도시 (v8)**: 물류 센터 · 가구 · 소방서 · 안심 90 % · 큰 도시.

**Side quests** (not counted in the 68):

| Id | Title | What to do | Ships |
|---|---|---|---|
| s01 | 관망 구경 | watch 관망 for a game hour | v4.4.1 |
| s02 | 기차 구경 | be within 300 px of the station when a train arrives (D26) | v4.4.1 |
| s03 | 첫 저금 | deposit 500 at the bank (state: the bank balance ≥ 500, so an earlier deposit counts) | v4.4.1 (bank42) |
| s04 | 콩이 단짝 | 콩이 affection ≥ 75 (state) | v4.4.1 |
| s05 | 단골손님 | 3 regulars ★ | v4.4.1 |
| s06 | 오늘의 미션 | finish a daily | v4.5 |
| s07 | 출석 체크 | check in once | v4.5 |
| s08 | 사진 한 장 | photo mode | v4.6 |

### 11.4 Tutorial merge

| Element | v4.2 | v4.4 |
|---|---|---|
| arrow + edge marker (`Tutorial.evaluate`) | priority chain | unchanged; the arrow-only bots must still finish every chapter |
| hint text (immediate action) | `Tutorial.textKey` | unchanged; suppressed while it says the same as the chip |
| "다음 목표" text (`obj_next`, `goalText()`, `v42Goal`) | hint bar | hidden while `missions.chainCovers()`; `chainCovers()` is **false while the active quest is passive**, so `Progression.nextGoal()` (which already skips passive goals) shows the next workable goal (critique M4) |
| quest chip | — | stack slot 1: `[ui7_icon_quest] 바다의 선물 · 물고기 3/5` + 4 px bar, pulses on progress; for a passive quest: `[⏳] 첫 기차 기다리는 중 · 그동안: 대장간 짓기` (the second half from `nextGoal()`) |
| tap / long-press on the chip | — | tap = 수첩 이야기 tab; long-press (0.5 s) or the panel's `길 안내` = `Navigator.guideTo(target, { ttl: 15 })` |
| idle (3 s still) | existing idle hints | + last fallback `missions.chainFocus()` (the P30 pattern) |
| chapter end | — | banner `1장 '첫 장사' 끝!` with SP + coupon, then the next chapter card (2 s, skippable) |

`Navigator.guideTo({ x, y, label, icon, ttl, src })` (new):
- a pinned destination that makes `wanted()` true with an empty bag (same exclusions: tutorial, 관망, panel, ceremony);
- it clears on arrival (≤ 140 px), after `ttl`, or on a second tap;
- with a bag, the pin wins and the chip shows `+가방` (tap cycles, as `next()`).

### 11.5 수첩 panel (이야기 tab)

Built in the shell panel (§19.2), from top to bottom:
1. the chapter ribbon;
2. the current quest card: icon, title, the line spoken by a resident (portrait 64), progress, reward, `길 안내`;
3. `끝낸 이야기` (folded);
4. `곁가지 이야기`;
5. `지난 이야기 다시 보기`.

### 11.6 Catch-up when the chain starts on a save (v4.4.1; once per save, `missions.qc.cu`)

**When**: the first time v4.4.1 (or later) runs a save that has no `missions.qc`: every pre-v4.4 save and every save born
in v4.4. It runs in `later.afterBuild()` on the **first `update()` tick** (§5.1), when `life`, `dog`, `civic`, `v4` and
`gb` exist, so `people`, `shops` and `rank` read true values (critique M5).

1. **Frontier** (D32): scan all 68 quests and find the **last quest whose progress-state objective holds** (§11.1 classes).
   Quests with only non-progress objectives (counted, `ui`, `skill`, `tap`, `dogAct`, `exported`, `gbDeals`) never set the
   frontier but never stop it either.
2. **Auto-complete**: every quest up to and including the frontier counts as done, **whatever its objective type**: q109
   (`ui skills`), q206 / q210 (`skill`), q603 (`ui officeStock`) and every counted quest before the frontier are done.
   Revision 1 stopped at q109 for every old save (critique H1).
3. **After the frontier**: the next quest becomes active as usual. A state quest after the frontier that already holds
   completes after `arriveDelay` and pays normal rewards; a counted one counts from activation.
4. **Rewards**:
   - XP: Σ quest XP × `catchupXp` (2) for saves with `chief.mig` (born before v4.4: they never got action XP for that
     play), × 1 for saves born in v4.4 (they already earned action XP);
   - chapter SP 100 %, + the 승격식 +2 SP when the save is already at rank ≥ 2;
   - coupons and gift decor 100 %, into the 보관함 (D33); level coupons for Lv 10 / 20 already passed;
   - coins = Σ quest coin formulas at today's `I` (seeded, D29), capped at `catchupCoinsMin` (10) × `I`, as **one** mail row.
5. **Card** `그동안의 이야기`, then the skill window opens on the SP. Example for a 읍 save from v4.2 (frontier q511):
   `퀘스트 53개 · 촌장 Lv 17 · 스킬 포인트 27 (+2 선물) · 코인 약 7,300 · 쿠폰 5장 — 우편함과 보관함에 넣어 두었어요`.
6. `qc.cu = 1` is written in the same save as the new `qc`, so a reload never runs it twice.

**Expected results** (recomputed from §9.4 and §11.3; the fixtures are made from the v4.2 bots **before** the chain data is
written, §22.3):

| Fixture (v4.2 save) | Frontier | Quests done | XP (× 2) | Lv | SP (levels + chapters + ceremony + gift) |
|---|---|---|---|---|---|
| Ch1, ≈ 5 min (fish porter hired) | q107 | 7 | 360 | 2 | 1 + 0 + 0 + 2 = 3 |
| Ch2, ≈ 12 min (farmer hired) | q209 | 18 | 1,330 | 6 | 6 + 1 + 0 + 2 = 9 |
| Ch5, 읍 (≈ 46 bot min) | q511 | 53 | 8,870 | 17 | 19 + 6 + 2 + 2 = 29 |
| Ch6, office + bank + depot (≈ 90 bot min) | q608 | 61 | 11,550 | 19 | 21 + 6 + 2 + 2 = 31 |

At Lv 17 the talent level gates leave exactly 29 SP of ranks open, so the 읍 player can spend everything at once.

## 12. Daily · weekly · monthly (v4.5, extends `missions_bank`)

### 12.1 Changes in the missions module

- **Gate split** (D4–D5):
  - `calendarGate` = `any(step:hire_farmer, q:q211)`: a player who never opens the skill window still gets dailies,
    attendance and gifts (critique M6);
  - the board, request bubbles, events, fame, craft pads and followers are **not built at all** while
    `BALANCE.v44.missions.v5Parts` is false (all of v4.x). `rank:2` is not a safe gate: every 읍 player meets it, and the
    request code calls `env.people.pick`, which kit-lite does not provide (critique H4);
  - weekly G1 (`req_done`) and G2 (`riders`) unlock on `['v5']` instead of `['rank:2']`, and G3 keeps `['life']` (false in
    v4.x), so no week can draw a goal nobody can finish.
- **Unlocks**: progress facts (`step:zone_forest`, `b:toolsmith`, `f:firstTrain`, `gb`, `complete`), not only `rank:2`.
- **Eligibility** (critique M15): a template may list `need` facts that must hold **at draw time** and are re-checked
  every minute; a drawn daily whose `need` stops holding is swapped for free (no reroll used):
  - F18 직접 계산하기: `reg:self` (an enabled register without a clerk exists; `Register` clears `chief` whenever a clerk
    exists);
  - F22 새 꾸미기 하나: `plot:free`;
  - F24 편지 답장: `letter:due` (letters are finite templates, "once each");
  - a node test draws every template against the tier fixtures (§22.3) and fails if a drawn template is not doable there.
- **Tiered counts**: a template's `n` may be `[t0, t1, t2, t3]` = before complete · complete → 읍 · 읍 · 도시+. F1–F12 keep their single `n` as the 읍 value unless listed.
- **Pay floors**: `payFloor 100 × eraMult` (30 / 60 / 100 / 200 / 300).
- **Streak**:
  - a missed day **halves** it (`n → ceil(n / 2)`), instead of the `st.n = 1` reset in `Calendar.streakDay()`;
  - the weekly 눈사람 방패 stays;
  - the 7-day loop runs on `((n − 1) % 7) + 1`.
- **Monthly**: the stamp card (§12.4), slice `mo` (+≈ 40 B).
- **Reroll**: one a day per daily slot that has had no progress for `swapAfter` 120 s.

### 12.2 Counts, resets, rewards

| | 오늘의 미션 | 이번 주 목표 | 이달의 눈꽃 도장판 |
|---|---|---|---|
| How many | 3 a day, drawn from (save seed, day key): the same 3 after a reload | 1 goal, 3 stages | 1 card, 20 stamps, milestones 5 / 10 / 15 / 20 |
| Reset | 05:00 local, forward-only keys (`calendarKeys.dayKey`) | Monday 05:00 | the 1st of the month 05:00 (`monthKey` = y × 12 + m from the day key) |
| Coins | each `0.5 × I`; all three + `1.0 × I` | stages `2 / 3 / 5 × I` | milestones `2 / 3 / 4 / 6 × I` |
| XP | 40 each; all three +60 | 100 / 150 / 250 | 300 / 500 / 700 / 1,000 |
| Extra | streak rewards (existing, softened) | stage 3: the week's decor (rotation exists) | 10: the month's decor (선물 꾸미기); 20: +1 SP, badge `이달의 촌장` (one month) |
| Missed | nothing lost; tomorrow draws new ones | progress stays all week | stamps stay all month |

### 12.3 Templates

**New dailies F13–F26**:

| Code | 제목 | Signal | n [t0, t1, t2, t3] | Unlock |
|---|---|---|---|---|
| F13 | 그물 한가득: 촌장님이 물고기 잡기 | `gather:item_fish_raw` | 20 / 30 / 40 / 50 | calendar gate |
| F14 | 나무꾼의 하루: 통나무 베기 | `gather:item_log` | 15 / 25 / 35 / 45 | `step:zone_forest` |
| F15 | 생선구이 장사 | `sold:item_fish_cooked` | 40 / 80 / 150 / 250 | calendar gate |
| F16 | 빵 굽는 날 | `made:item_bread` | 20 / 40 / 80 / 120 | `step:zone_farm` |
| F17 | 교역의 날: 교역소에서 팔기 | `traded:*` | 20 / 40 / 80 / 120 | `step:zone_forest` |
| F18 | 계산대 지킴이: 직접 계산하기 | `served` | 10 / 20 / 30 / 40 | calendar gate + `reg:self` |
| F19 | 든든한 광부: 식량 상자 채우기 | `food` | 10 / 20 / 30 / 40 | `b:toolsmith` |
| F20 | 통조림 공장 | `made:item_can` | — / 20 / 40 / 60 | `b:cannery` |
| F21 | 일꾼 응원하기 | `cheer` | — / 3 / 5 / 8 | `complete` |
| F22 | 새 꾸미기 하나 | `built:deco_*` | 1 / 1 / 1 / 1 (weight 1) | `step:hire_miner` + `plot:free` |
| F23 | 큰 식당 정식 | `combo` | — / 5 / 8 / 12 | `b:big_restaurant` |
| F24 | 편지 답장 | `letter_reply` | — / — / 1 / 1 | `staff:bok` + `letter:due` |
| F25 | 금방 배달 | `gb_delivered` | — / — / 15 / 30 | `gb` |
| F26 | 관망 구경: 게임 시간 2시간 | `pilot_watch` | — / 1 / 1 / 1 (weight 1) | `complete` |

**Existing F1–F12** (`src/missions/data/catalog.js`):
- F1 손님 → `[30, 60, 60, 120]`, unlock calendar gate.
- F4 콩이 and F5 수다 → unlock calendar gate.
- F6 세금 → unlock `b:town_hall`.
- F8 기차 손님 → `[—, 15, 30, 50]`, unlock `f:firstTrain`.
- F11 신문 → unlock `v42:office` (v4.2 morning paper, signal `paper_read` from `paperRead`).
- F3 (ride, v5 bus depot), F7, F9, F10, F12 → unchanged (their later unlocks).

**New weeklies G7–G11** (stages × tier factor 1 / 1.5 / 2 / 3):

| Code | 제목 | Signal | Stages | Unlock |
|---|---|---|---|---|
| G7 | 부지런한 촌장 | `gather:*` | 150 / 300 / 600 | calendar gate |
| G8 | 장사의 신 | `cust` | 300 / 800 / 1,500 | `complete` |
| G9 | 마을 건축가 | `built` | 2 / 4 / 7 | `step:hire_miner` |
| G10 | 단골 손님 | `visitor` | 60 / 150 / 300 | `f:firstTrain` |
| G11 | 금방 주간 | `gb_delivered` | 40 / 100 / 200 | `gb` |

G1 (`req_done`, requests) and G2 (`riders`, the v5 bus) move from `rank:2` to `v5`; G3 keeps `life` (the v5 story module answers that fact; kit-lite answers false); G4–G6 stay at v6–v8.

### 12.4 이달의 눈꽃 도장판

- **Stamp sources**:

  | Source | Stamps |
  |---|---|
  | all three dailies of a day | 1 a day |
  | a weekly stage | 1 each (≤ 3 a week) |
  | check-in day 7 of a loop | 1 |
  | a quest chapter finished | 1 |

- 20 stamps take ≈ 12 active days (3–4 days a week) for a casual player.
- **Panel**: a 4 × 5 grid of `ui7_cal_cell`, the milestones on the right, a preview of the month's decor.
- **Decor rotation** (existing `life_props` / `life2` art): igloo · lantern_string · kids_swing · snow_fort · wedding_arch · flower_stand.

---

## 13. 출석 · 접속 선물 · 오프라인 (v4.5, `src/rewards/`)

### 13.1 출석 체크

- **When** (a "day check" runs on load, on `visibilitychange` → visible, and when the day key changes in a running tab; the
  APK keeps its WebView alive across app switches, so a phone may never "load" again; critique L9):
  - the first day check of a new day key, after the calendar gate (D5);
  - after the name sheet and the 새로워진 것 card;
  - never during a ceremony, the tutorial or admin mode (it waits for the next day check).
- **Amounts**: every coin amount is computed from the seeded `I` (D29) **when the sheet opens** and stored; `받기` and the
  mailbox pay that stored amount. So day 1 / 3 / 5 / 7 pay 0.5–2 × I, not the floor (critique H6).
- **Never forced**: closing the sheet without 받기 sends the check-in to the 우편함.
- **What counts**: check-in days, not consecutive days. A missed day pauses the strip; nothing resets.
- **7-day strip** (repeats), per week ≈ 4.5 min of income + 350 XP:

  | Day | Gift | XP |
  |---|---|---|
  | 1 | coins `0.5 × I` (floor 30 × eraMult) | 30 |
  | 2 | 콩이 간식 refilled to 3 (already full: +30 XP instead) | 30 |
  | 3 | coins `1 × I` | 40 |
  | 4 | 작은 꾸미기 쿠폰 (snowman / bench / lamp, rotating) | 40 |
  | 5 | coins `1 × I` | 50 |
  | 6 | 반짝 후광: the `chief_halo_gold` variant for 24 real hours (cosmetic) | 60 |
  | 7 | coins `2 × I` + a monthly stamp | 100 |

- **28-day board** (cumulative check-ins; three boards cycle, then repeat):

  | Check-ins | Board 1 | Board 2 | Board 3 |
  |---|---|---|---|
  | 7 | 선물 꾸미기 igloo | kids_swing | flower_stand |
  | 14 | `3 × I` + 200 XP | same | same |
  | 21 | 선물 꾸미기 lantern_string | snow_fort | wedding_arch |
  | 28 | **+1 SP**, 500 XP, badge `개근 촌장` (28 days) | same | same |

- **Clock rules**:
  - one check-in per day key;
  - `last` = the highest key ever seen, so a clock moved back gives nothing;
  - a clock moved ahead plays those days early, and they are then used up;
  - signed in and online: the server `Date` header decides the day;
  - admin saves keep their own attendance.

### 13.2 접속 선물 (play-time gifts)

- **Three boxes a day** at 5, 15 and 30 minutes of active play today.
  - Active = a touch in the last 60 s, or a panel open. 관망 counts half, **and only while the screen was touched in the
    last 60 s**: a phone on a charger in 관망 earns nothing (critique L13).
  - Kept in `rewards.gift.s`, saved every autosave.

  | Minute | Coins (floor × eraMult) | XP |
  |---|---|---|
  | 5 | `0.25 × I` (10) | 20 |
  | 15 | `0.5 × I` (20) + a small surprise (콩이 간식 or a flower for F7) | 30 |
  | 30 | `0.75 × I` (30) | 50 |

- **HUD box**: ⌀64 at (524, top), hit ⌀88, with a ring timer (§19.1). When ready it wiggles; a tap opens it.
- **Amounts** are fixed when a box becomes ready (D29).
- **Day change** (the same day check as 13.1): unopened boxes go to the 우편함. Total ≈ 1.5 min of income a day.

### 13.3 오프라인 정산 (a daily credit, D30)

- **When**: on load and on `visibilitychange` → visible (the hidden time is the away time), only after the village is
  complete. Before that the sheet says `촌장님이 안 계시니 마을이 조용히 기다렸어요`.
- **Daily credit** (critique H3): each day key has a credit of `capH` hours of away time. Every settlement uses up part of
  it, whatever the number of sessions; it refills at the next day key. Revision 1 capped each absence, so three 10-minute
  sessions a day with 3-hour gaps were paid three times (72 % of play income instead of 24 %).
- **Formula**: `paid = min(away, capH × 3600 − off.used)` seconds; `coins = round10(paid / 60 × rate × I30)`;
  `off.used += paid`.
  - `away` counts only when ≥ 10 min.
  - `I30` is the 30-minute play average from the saved meter (D29).
  - An away period that crosses 05:00 is split at the day key: the part before 05:00 uses yesterday's remaining credit,
    the rest today's.

  | 든든한 금고 | Rate | Credit per day | Max a day (min of income) | Share at 30 min a day |
  |---|---|---|---|---|
  | 0 | 4 % | 3 h | 7.2 | 24 % |
  | 1 | 4 % | 4 h | 9.6 | 32 % |
  | 2 | 5 % | 5 h | 15 | 50 % |

  The share is the same for 1 × 30, 3 × 10 and 6 × 5 sessions, because the credit is per day.
- **Sheet**: `촌장님이 없는 동안` · `마을 사람들이 {h}시간 {m}분 동안 일했어요` · `+{coins}` · `받기`.
  - With the office built, 소복이 hands it over (`장부 정리했어요!`).
  - The coins are tagged `offline`: they never count in `I`, missions or quests.
  - When today's credit is used up: `오늘 몫은 다 받았어요 · 내일 새벽 5시에 다시 쌓여요` (no coins, no nag).
- **Clock rules**:
  - `away = now − lastSeen`, where `lastSeen` = the highest wall time ever seen;
  - a negative value gives 0;
  - a jump ahead is capped by the daily credit, and later loads see 0 until real time passes `lastSeen`;
  - never in admin mode.
- Only coins move while away: no goods, stock or story.

---

## 14. 우편함 · 보관함 · 쿠폰 · 선물 꾸미기 (v4.4.1)

- **우편함** (claimable rows only): the HUD mail icon at (420, top), shown with a count badge when there is ≥ 1 row.
  - The panel (shell, one tab) has rows `icon · why · reward · 받기` and `모두 받기` at the top.
  - Row kinds: `coins`, `xp`, `sp`, `treats`, `halo`. Every amount is fixed when the row is made (D29).
  - At most 20 rows. When a 21st arrives, the **oldest row of any kind** is claimed automatically (coins, XP and SP are
    added; treats fill to 3 and the rest become XP; a halo extends its time). Nothing is lost.
- **보관함** (things, D33): the 우편함 panel's second tab `보관함`.
  - Coupons and gift decor are **counts per kind**: `inv.cp` (build coupons), `inv.gf` (gift decor). A new one goes
    straight here with a `새로 받음` badge; it never takes a mail row.
  - At most `inv.max` (9) of one kind; a 10th of the same kind becomes `inv.extraXp` (50) XP with a toast.
  - Coupons and gift decor never expire. (Revision 1 kept them as mail rows, and the 1,536 B slice cap would have dropped
    them once 12 gift spots were full; critique M9.)
- **꾸미기 쿠폰**:
  - the build menu shows `쿠폰 1장` on that decor card;
  - on build the coin price is waived: `Game.tryBuild(site, bkey)` → `rewards.useCoupon(bkey)` (revision 1 named a
    `Game.chooseBuild` that does not exist); materials are still needed.
- **선물 꾸미기**:
  - `놓기` opens a small picker of free gift spots: 12 in the village, 16 at 읍, 20 at 도시
    (`WORLD.v44.giftSpots` with a `rank` per spot; on the plaza, the green, the hall square; checked by `v44_layout.mjs`
    for overlap and walkability);
  - the prop appears at once with `fx_unlock`; it is saved in `rewards.gs`;
  - a placed gift can be **put away** (long-press → `치우기`): it goes back to the 보관함, so spots can be rearranged;
  - with no free spot the gift simply waits in the 보관함;
  - the missions ports `rewards.decor / voucher` route here, so streak and weekly decor work the same way.
- **Budget check**: ≈ 5–6 gift decor a month arrive (weekly stage 3, the monthly card, two per attendance board, streak
  vouchers); with put-away and 9 per kind, nothing overflows in a year of play (a test simulates 365 days of maximum gifts).

---

## 15. 주민 행복도 (v4.6, `src/insight/`)

### 15.1 Who

- **Residents**: the named villagers in `VillageLife.moved` (pets excluded) + settlers (`Civic.settlers`). Workers and staff count when they live in the village.
- The ≈ 100–120 솔방울 townsfolk are neighbours: their mood stays the visitor satisfaction (`Growth.happyList`).

### 15.2 Needs (each 0–100; a resident's 행복 = the weighted sum)

| Need | Weight | 100 when | Floor | Reads |
|---|---|---|---|---|
| 먹거리 | 20 | their favourite (fish / bread / meat, by a hash of the key) was on a market shelf or at the big restaurant ≥ 90 % of the last game hour | 30 | `StockLedger` shelf `emptyT` |
| 집 | 20 | housed (not `life.waiting`); 돌집 +10 | 40 while waiting | `VillageLife`, houses |
| 일·배움 | 15 | adult with a job; kid with 놀이터 or school; elder with a bench / fountain within 700 px | 60 | roles, `Civic.amenities` |
| 가게 | 10 | `40 + 12 × kinds open`; +20 if 금방 delivered to their door today | 40 | `Growth.openShopCount`, `gb` |
| 꾸미기 | 10 | `40 + 10 × Σ happy of decor within 700 px of home` | 40 | `Civic.amenities` |
| 즐길 거리 | 10 | `50 + 15 × events they took part in today` | 50 | `VillageLife` events |
| 촌장 | 15 | `50 + 25` if the chief talked to or greeted them in the last 2 game days, `+5 × 인기도 rank` | 50 | `chat` / `tap` |

- The floors keep a neglected village around 45, never 0.
- A new village with food and homes sits at 65–75; a cared-for one at 85–95.
- **주민 행복** = the mean over residents, recomputed every 5 s (≤ 60 residents × 7 reads).

### 15.3 The existing bar and the rank

- The HUD 마을 bar keeps showing today's metric (`Growth.happiness()`, labelled `손님 만족`). The 마을 panel's 행복 tab and the
  rank panel show both: `손님 만족 76 (승격식에 써요)` and `주민 행복 82`.
- **The rank-2 bar stays on today's metric** (D34). Revision 1 used `max(old, new)`: with residents at 65–75 when new and
  85–95 when cared for, the 80 gate would have passed for most villages (critique M7). The v4 review lowered `happyCap`
  24 → 12 for the same reason.
- The settler bonus below brings people sooner, which also moves the `people:45` part of the 읍 gate; the 읍 median gate
  (±5 %, two-sided, §22.4) catches that, and `insight.settlersFrom` is the knob.
- From rank 3 (v5) happiness is shown as information only.

### 15.4 Effects (bonuses only)

| Village 행복 | Effect | Code path |
|---|---|---|
| ≥ 60 | settlers `every ÷ (1 + (H − 50) / 50)` (replaces today's `happyBonus / 40`) | `Civic` settlers |
| any | hall tax per person × `(1 + 0.3 × max(0, H − 60) / 40)` (×1.3 at 100) | `TownHall` |
| resident ≥ 80 | that worker works +5 % (with 리더십 ≤ +15 %); a sparkle now and then | `Worker` |
| ≥ 80 / ≥ 90 | train visitors +1 / +2 | `Neighbours` riders |
| resident < 45 | **no penalty**: a sad emote now and then; their bubble names the lowest need (`빵이 먹고 싶어요…`, `우리 집은 언제 생겨요?`, `집 앞이 좀 썰렁해요`, `촌장님 얼굴 본 지 오래됐어요`) | `VillageLife` bubbles |

- **Resident card** (the existing tap card): a face (5 steps, `ui7_face_0..4`), the score, the two lowest needs as icon chips, one line.
- **Letter** `lt_happy_low` points at the most common low need.

---

## 16. 지역 자원 (v4.6)

### 16.1 Regions and rows

- **Regions**: 서리 광장 (start), 소나무 숲, 밀밭, 광산, 사냥터, 서쪽 숲마을, 동쪽 해안, 남쪽 들판, 동남쪽 언덕, 역앞 거리, 솔방울 마을 (read-only).
  - A stock's region comes from its `place` (`StockLedger.register`) through `Territory`.
- **Rows per region**:
  1. 자연: trees standing / regrowing, ore rocks, wheat ready, fish in the net, animals, boat catch;
  2. 원료 → 가공 → 상품: the `StockLedger.LINES` rows, with in / out per minute (EWMA);
  3. 보관: 창고 n / 300, 물류창고 shelves, 식량 상자;
  4. 사람: workers per line, missing ones, residents / beds / waiting;
  5. 수요: queues, order cards, shop orders, site materials still needed.

### 16.2 Status and the why-chain

| Status | Rule | Example (ko) |
|---|---|---|
| 부족 (red) | a consumer empty ≥ 30 s | `빵이 부족해요 ← 빵 짐꾼이 없어요` |
| 곧 부족 (yellow, 관찰력 2) | `stock / (out − in) < 5 min` while `out > in` | `약 6분 뒤 판자가 바닥나요` |
| 길 막힘 (orange) | output full ≥ 60 s while its consumer is empty | `제련소 출구가 꽉 찼어요 ← 주괴 짐꾼이 필요해요` |
| 남음 (blue) | full ≥ 60 s and nobody has room | `광석이 남아요 → 창고·수출로` |
| 적당 (green) | otherwise | — |

- **Why-chain**: for a red row, the cause is the first upstream link that fails, in this order:
  1. a missing carrier (its hire step exists and is not done);
  2. a missing operator;
  3. raw supply (`농부 1명 47/분 < 오븐 66/분`);
  4. the line is not built.

  The fix target is that link's pad, plot or station.
- **People rows**:
  - `집이 부족해요: 이사 기다리는 주민 {n}명` → the nearest free plot;
  - `빈 방 {n}개`;
  - `광부가 배고파요` → the food box.
- **지금 부족한 것 TOP 3**:
  - sorted by impact: lost sales per minute, then a waiting site, then people waiting for homes;
  - each row has `해결하러 가기` (관찰력 2, or free once a day) = `Navigator.guideTo` to the fix.

### 16.3 Where it lives (D13)

- **마을 panel**: opened by the popBox (shown from `hire_miner` on) and the rank chip. Tabs 등급 (today's rank panel) · 행복 · 자원 · 통계.
- **Overview overlay**: the map button's overview replaces the hint bar with `[마을 보기 | 자원 지도]`.
  - 자원 지도 places ≤ 12 world-space pins (`ui7_pin`, tinted by the worst status, red-count badge), scaled by 1/zoom.
  - A tap on a pin opens the 자원 tab on that region.
- **One renderer** `src/insight/view/LedgerRows.js` for this tab and the office 재고 tab.
- **Cost**: reads `StockLedger.rows()` once a second while open; no new simulation.

---

## 17. Account and cloud save (login track; 저장 코드 in v4.3.1)

### 17.1 Where login works (`src/account/platform.js`, decided once at boot)

| Build | Origin | Supabase reachable | Can leave the page | Login | Cloud |
|---|---|---|---|---|---|
| APK | `https://appassets.androidplatform.net` | yes (INTERNET) | yes, Custom Tab / browser | Google (PKCE + deep link) | Supabase |
| GitHub Pages | `hyun800115-create.github.io/nurient/frost-village/` | yes | yes (redirect) | Google (PKCE + redirect) | Supabase |
| claude.ai artifact | sandboxed frame | likely blocked; probed 3 s | no | none | 저장 코드 (+ optional artifact `db` later) |
| localhost | `http://localhost:8000` | yes | yes | Google (dev redirect) | Supabase |

- **Detection**:
  - `apk` when the UA contains `SnowbloomVillageApp/`;
  - `artifact` when in a cross-origin frame or `window.claude` exists;
  - `pages` on `github.io`; `local` on localhost.
- Each platform has a capability record `{ login, cloud, artifactDb, download, clipboard }`. The settings tab and the title link read only that record.

### 17.2 Flows

**APK** (Supabase PKCE through a Custom Tab, back by deep link):
1. In the WebView: a verifier (64 random bytes, base64url) → `frostVillage.auth.pkce`; challenge = base64url(SHA-256) via `crypto.subtle`.
2. `location.href = https://<ref>.supabase.co/auth/v1/authorize?provider=google&redirect_to=com.snowbloom.village://auth/callback&code_challenge=…&code_challenge_method=s256`.
3. `shouldOverrideUrlLoading` sees host `<ref>.supabase.co` + path `/auth/v1/authorize` → opens a Custom Tab.
4. Google chooser → Supabase callback → 302 to `com.snowbloom.village://auth/callback?code=…`.
5. The intent filter matches; `onNewIntent` (or `onCreate` on a cold start) → `DeepLink.parse` (strict) → `evaluateJavascript("window.__fvAuthReturn(" + JSONObject.quote(url) + ")")`, retried every 500 ms for up to 20 s until the page answers.
6. `__fvAuthReturn`: `POST /auth/v1/token?grant_type=pkce { auth_code, code_verifier }` → `{ at, rt, exp, uid }` (the email is dropped) → toast `로그인했어요!` → sync.

**GitHub Pages**: the same PKCE with a full-page redirect.
- The game saves on `pagehide` (exists).
- `main.js` reads `?code=` before booting Phaser, strips it with `history.replaceState`, and exchanges it in the background.

**Artifact**: guest only; 저장 코드 always. The artifact `db` capability is optional and later. It needs the `artifact-capabilities` skill at implementation, and only Contributor-level viewers can write.

### 17.3 APK wrapper changes (`tools/apk/`)

| File | Change |
|---|---|
| `android/AndroidManifest.xml` | a second `<intent-filter>` in `MainActivity`: `VIEW` + `DEFAULT` + `BROWSABLE`, `<data android:scheme="com.snowbloom.village" android:host="auth"/>`; `<queries>` for `android.support.customtabs.action.CustomTabsService`; no new permission |
| `android/java/…/DeepLink.java` (new, pure, desktop-JVM testable) | `parse(uri)`: scheme `com.snowbloom.village`, host `auth`, path `/callback` only; `code` ≤ 512 chars `[A-Za-z0-9._~-]`, or `error` / `error_description` (≤ 300 printable, no `<>"'\`); else null. `toJs(result)` quotes safely |
| `android/java/…/MainActivity.java` | `onNewIntent` + the `getIntent()` check in `onCreate` → `deliver(uri)` with a pending retry; `GameClient.shouldOverrideUrlLoading`: `*.supabase.co/auth/v1/authorize` → `openCustomTab(url)` (VIEW intent + `android.support.customtabs.extra.SESSION` via reflection, toolbar `0xFF2A64A8`); other links unchanged. No JS bridge for login (v4.6 adds one `@JavascriptInterface saveFile(name, base64)` for photos and 저장 코드 files, §3.4) |
| `build_apk.py` | `--supabase-ref` → `www/account_config.json` (URL + publishable key are public values) |
| `test/validate_apk.py` | assert the filter, the scheme and `<queries>`; permissions still only VIBRATE + INTERNET |

Fallback, ready but off: if Chrome on her phone asks or refuses to hand the redirect to the app, `redirect_to` becomes
`frost-village/auth.html` on Pages, with a `앱으로 돌아가기` button (an `intent://auth/callback?code=…#Intent;scheme=com.snowbloom.village;package=com.snowbloom.village;end` link).

### 17.4 Client modules (`src/account/`; no supabase-js: ≈ 200 lines of `fetch`)

| File | Pure | Does |
|---|---|---|
| `config.js` | yes | project URL, publishable key, redirects; `enabled` when filled |
| `platform.js` | no | §17.1 |
| `pkce.js` | yes (WebCrypto injected) | verifier / challenge; RFC 7636 test vector |
| `auth.js` | no | `signIn()`, `onReturn(url)`, `refresh()` (60 s before `exp`), `signOut()`; never stores email or profile |
| `rest.js` | no | `apikey` + `Bearer`, 8 s timeout; errors → `offline` / `asleep` (5xx, paused) / `auth` (401 → refresh once) / `conflict` / `tooOld` |
| `sync.js` | **yes** | the §17.7 decision table |
| `outbox.js` | no | dirty flag, backoff 30 s → 2 → 10 → 30 min; triggers `online`, visible, every 120 s while dirty, `pagehide` (`keepalive`, ≤ 64 KB) |
| `code.js` | yes (stream injected) | 저장 코드 encode / decode / crc32, both frames (v4.3.1) |
| `view/AccountTab.js`, `ConflictSheet.js`, `TitleLink.js`, `CodeSheet.js` | no | §19 |

### 17.5 Supabase schema (one migration with `apply_migration`, after the designer's OK; then `get_advisors`)

```sql
-- 행복한 눈꽃마을 이야기: cloud saves. One row per (player, slot): 0 = 마을, 1 = 예전 마을 보관함.
create table public.saves (
  user_id        uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  slot           smallint    not null default 0 check (slot in (0, 1)),
  rev            integer     not null default 1,
  save_version   smallint    not null check (save_version between 1 and 99),
  game_version   text        not null check (char_length(game_version) <= 16),
  device         text        not null check (device in ('apk', 'web', 'artifact')),
  summary        jsonb       not null default '{}'::jsonb check (octet_length(summary::text) <= 1024),  -- nm, title, lv, rank, coins, q, pt
  save           jsonb       not null check (octet_length(save::text) <= 65536),
  client_saved_at timestamptz,
  updated_at     timestamptz not null default now(),
  primary key (user_id, slot)
);
alter table public.saves enable row level security;
revoke all on public.saves from anon;
grant select, insert, update, delete on public.saves to authenticated;
create policy saves_select on public.saves for select to authenticated using (user_id = (select auth.uid()));
create policy saves_insert on public.saves for insert to authenticated with check (user_id = (select auth.uid()));
create policy saves_update on public.saves for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy saves_delete on public.saves for delete to authenticated using (user_id = (select auth.uid()));

-- compare-and-swap write: 'ok' | 'conflict' | 'tooOld' | 'gone'
create or replace function public.put_save(p_slot smallint, p_base_rev integer, p_save jsonb, p_save_version smallint,
  p_game_version text, p_device text, p_summary jsonb, p_client_saved_at timestamptz)
returns table (status text, rev integer, updated_at timestamptz)
language plpgsql security invoker set search_path = '' as $$
declare cur public.saves%rowtype;
begin
  select * into cur from public.saves s where s.user_id = auth.uid() and s.slot = p_slot for update;
  if not found then
    if p_base_rev <> 0 then return query select 'gone'::text, 0, now(); return; end if;
    -- two devices may push their first save at the same moment: the loser must see 'conflict', not an error (critique L2)
    insert into public.saves (user_id, slot, rev, save_version, game_version, device, summary, save, client_saved_at)
      values (auth.uid(), p_slot, 1, p_save_version, p_game_version, p_device, p_summary, p_save, p_client_saved_at)
      on conflict (user_id, slot) do nothing;
    if found then return query select 'ok'::text, 1, now(); return; end if;
    select * into cur from public.saves s where s.user_id = auth.uid() and s.slot = p_slot;
    return query select 'conflict'::text, cur.rev, cur.updated_at; return;
  end if;
  if cur.save_version > p_save_version then return query select 'tooOld'::text, cur.rev, cur.updated_at; return; end if;
  if cur.rev <> p_base_rev then return query select 'conflict'::text, cur.rev, cur.updated_at; return; end if;
  update public.saves s set rev = cur.rev + 1, save = p_save, save_version = p_save_version, game_version = p_game_version,
    device = p_device, summary = p_summary, client_saved_at = p_client_saved_at, updated_at = now()
    where s.user_id = auth.uid() and s.slot = p_slot;
  return query select 'ok'::text, cur.rev + 1, now();
end $$;
revoke execute on function public.put_save from public, anon;
grant execute on function public.put_save to authenticated;

-- 계정과 클라우드 저장 지우기 (cascades to saves)
create or replace function public.delete_me() returns void
language sql security definer set search_path = '' as $$ delete from auth.users where id = auth.uid(); $$;
revoke execute on function public.delete_me from public, anon;
grant execute on function public.delete_me to authenticated;
```

- **Reads**: `GET /rest/v1/saves?slot=eq.0&select=rev,save_version,device,summary,updated_at` (≈ 300 B). The full `save` is fetched only when pulling.
- **Server time**: the `Date` header of any response.
- **Auth settings**:
  - Google only (Email provider off);
  - refresh-token rotation on;
  - exact redirect URLs only.
- **Free plan** (checked with `list_projects`: `nuripang` ACTIVE_HEALTHY, `gideon1-cell` and `idle-sword-master` INACTIVE):
  - projects pause after about a week idle; the game treats the cloud as optional;
  - the org would then have 2 active free projects (`nuripang` + this), the free maximum. Un-pausing either old project
    later would need one of the two paused first (critique L11);
  - Google's account chooser names `<ref>.supabase.co` as the app being signed into, unless a paid custom domain is used.
- **Account deletion**: `delete_me` removes the `auth.users` row; the JWT already issued stays valid until it expires, so
  the client signs out locally right after the call.

### 17.6 저장 코드 (v4.3.1)

- **Export**: `JSON` → `CompressionStream('deflate-raw')` → base64url, framed `SV<version>.<crc32>.<data>`.
  - Without `CompressionStream` (Chrome < 103, Safari < 16.4; the APK's minSdk 24 allows older WebViews) the frame is
    `SV<version>u.<crc32>.<data>`: uncompressed base64url (≈ 14–19 KB of text). Import reads both (critique L3).
  - Copy with `navigator.clipboard.writeText` inside the tap.
  - Fallback: a selected read-only textarea.
  - In the artifact, optionally `파일로 저장` via the `downloads` capability. In the APK only `복사` until the v4.6 file
    bridge (§3.4); `blob:` URLs never reach the wrapper's `DownloadListener` (critique L14).
- **Import**: paste → checksum, version and sanitize → a preview card (name, title, coins, play time; an admin-born village
  shows `관리자 마을`) → confirm.
  - The current village goes to `Save.key('import')` (never-overwrite rule: `.import.2` when `.import` holds a different
    copy), then the code loads. Revision 1 used `BACKUP_KEY`, which may already hold the `keepCopy` of an unreadable or
    future save (critique L4).
  - A village with `chief.adm = 1` asks the same two confirms as 이 마을로 계속하기 before it becomes the real village
    (critique L5).
  - A future version is refused: `앱을 새 버전으로 바꿔 주세요`.
- **What it carries**: the village only; the chat record is not included.

### 17.7 Sync rules (`sync.js`, exhaustively unit-tested)

`local` = `{ exists, dirty, baseRev, hash, t, version, summary }`; `remote` = the row head or none.

| # | Situation | Action |
|---|---|---|
| 1 | not signed in / admin mode / `paused` / no cloud on this platform | nothing |
| 2 | remote none, local exists | first login sheet `이 마을을 클라우드에 보관할게요` → push (`baseRev 0`) |
| 3 | remote none, local none | nothing |
| 4 | remote exists, local none (reinstall, new device) | pull → write `SAVE_KEY` → start |
| 5 | `remote.rev == baseRev`, local dirty | push (CAS) |
| 6 | `remote.rev == baseRev`, local clean | nothing |
| 7 | `remote.rev > baseRev`, local clean | at boot: pull + toast `다른 기기에서 저장한 마을을 불러왔어요`; in play: ask `다른 기기에서 더 최근에 저장했어요. 불러올까요?` |
| 8 | `remote.rev > baseRev`, local dirty | **conflict sheet**; `더 최근` badge is a suggestion; the losing village goes to slot 1 or `BACKUP_KEY`; nothing is deleted |
| 9 | local never synced, remote exists | conflict sheet |
| 10 | `remote.save_version > SAVE_VERSION` | never pull (`acc_newer`); pushes refused server-side (`tooOld`) |
| 11 | push → `conflict` | re-read the head → row 8 |
| 12 | network error / 5xx / paused | outbox backoff; `acc_offline` / `acc_asleep`; play never blocks |

- `처음부터 하기` clears `baseRev`, so row 9 catches a fresh village instead of overwriting the cloud.
- The chat record syncs in phase 2 (a separate `chats` row ≤ 256 KB, at most every 10 min).
- A promoted admin village (`chief.adm = 1`) uploads only after its own confirm.
- **First login gift**: one decor coupon (`첫 로그인 선물`), never a nag.

### 17.8 Privacy

- **The game stores**: the nickname, the village save, a coarse device kind and timestamps.
- **Supabase Auth keeps** the Google email, name and picture URL in `auth.users`. The game never selects them; the privacy page says so.
- **Privacy page**: `frost-village/privacy.html` (ko + en) on Pages. Google's consent screen needs it when the app leaves Testing.
- **Secrets**: never a secret / `service_role` key in the game, the APK or the repo. The Google client secret is pasted only into the Supabase dashboard.

---

## 18. 관리자 모드 (v4.3.1; rows grow with each version)

### 18.1 Door, backup, isolation (`src/admin/store.js`, pure over a storage interface)

1. **Door**: settings → the small version label (`UI.panelFooter`, made interactive). It sits **near the top of the
   settings panel, just above the tabs** (`cy − 408`, between the close button at `cy − 478` and the tabs at `cy − 348`),
   not at the bottom as revision 1 said (critique L1).
   - Taps 3–6 toast `관리자 모드까지 {n}번`.
   - Tap 7 opens the sheet: `관리자 모드는 시험해 보는 곳이에요. 지금 마을은 따로 보관하고, 연습용 마을에서 마음껏 놀 수 있어요.` `켜기 · 취소`.
2. **Enter**:
   1. `gs.save(true)`;
   2. copy the normal `main` → `.normal` (+ chat). **Never overwrite a `.normal` that differs from the current normal
      save without keeping it**: the old `.normal` moves to `.normal.prev` first (critique C1);
   3. if `.admin` is missing, copy the normal save there with a new `cid` and `chief.adm = 1`;
   4. `frostVillage.mode = { admin: 1, since }`;
   5. `scene.restart()`.
3. **While on**:
   - `Save.key(kind)` returns the admin family for **every** kind (§6.3): save, chat, backups, `.bad`, `.later`,
     `.import`. So 처음부터 (`Game.resetProgress` → `Save.clear()`) clears only the admin village, and a throw in
     `Game.build()` (`Save.quarantine()`) quarantines only the admin village;
   - a red-gold ribbon `관리자` at (524, top), in the gift box's slot (the gift box is hidden in admin mode) (stand-in pill
     until `ui7_admin_ribbon`);
   - the title shows `관리자 마을` (it reads `Save.peek()`);
   - a reload stays in admin mode.
4. **Exit**:
   - `원래 마을로 돌아가기` (default): save the admin village, clear the flag, restart → the normal save loads byte-identical;
   - `관리자 마을 지우기`;
   - `이 마을로 계속하기` (two confirms): normal → `Save.key('import')` of the normal family (never-overwrite rule), admin →
     the normal `main` with `chief.adm = 1`.
5. **Restore** (critique C1): `원래 마을 되살리기` in the admin panel (two confirms) copies `.normal` (or `.normal.prev`,
   chosen from a list showing name, coins and save time) back to the normal `main` + chat. It exists for the case where
   something outside the game removed the normal save; it is never needed in normal use.
6. **Isolation**:
   - no cloud upload while the flag is set;
   - no 출석 / 선물 / 오프라인 (the gift box hides);
   - the admin save's calendar can be offset (`dk`) without touching the normal save;
   - the income meter ignores admin time, and admin-tagged coins never count.

### 18.2 Switches

The panel is a shell panel, never pausing, with rows ≥ 88 tall. Every switch emits feed `admin { op }`.

| Button (ko) | What it does | How | Version |
|---|---|---|---|
| 돈 무제한 (켬/끔) | coins never go down; the pill shows `∞` | `Economy.unlimited`: `spend(n)` returns n and keeps `coins ≥ 9,999,999`; added coins tagged `admin` | v4.3.1 |
| 코인 +10만 | + 100,000 | `economy.add(…, 'admin')` | v4.3.1 |
| 모든 땅 열기 | every region and zone open, towers lit, fog gone | `Territory.reveal(id, true, true)` for each closed region (rail and `west_s` open with partners); `Progression.forceStep()` (new) for `zone_*` and `tower_*`; tower sites `Site.finish(true)`; `Neighbours.attach` when rail opens | v4.3.1 |
| 모든 건물 열기 (켬/끔) | every build card unlocked (uniques stay unique); v4.2 sites and the 금방 pad offered | flag read by `Civic.choices` / the build menu (`BUILD_UNLOCK` and rank conditions ignored) and by the v4.2 `offer()` gates | v4.3.1 |
| 짓기 바로 완공 (켬/끔) | a site finishes the moment it is chosen; no materials | flag at the end of `Site.start()`: fill `stock`, `finish(false)` | v4.3.1 |
| 지금 짓는 것 모두 완공 | finish every running site | loop `gs.sites` + v4.2 sites + `Growth` houses / shop builds | v4.3.1 |
| 고용 전부 | every Progression step done | `Progression.forceAll()`: passes over `STEPS` in order until a pass completes nothing; then `LineUpgrades` offers | v4.3.1 |
| 주민 행복 가득 (켬/끔) | happiness 100; rank bar full (v4.6: every resident 100) | `Growth.happiness()` returns 100 (insight too) | v4.3.1 |
| 시간 ×1 / ×2 / ×4 | game speed | **sub-steps**: `Game.update` runs its body N times per frame with the real `dt`, so the chief (408 px/s × 4) never jumps past a 16 px collision radius and the porters, train dwell, pad payment and `PickupPolicy` timers keep their step; `this.time.timeScale = N` so `delayedCall`s (pad syncs, move-ins, letters) speed up too; `tweens.timeScale = N` (critique M13). Tested by running the `pickup`, `nav` and `rail` suites at ×4 | v4.3.1 |
| 다음 날 아침으로 | game clock to 06:00 next game day (paper, letters) | `DayClock.T` | v4.3.1 |
| 아이템 넣기 | item + 10 / 50 / 200 → the 창고, or the bag | warehouse / player stack | v4.3.1 |
| 승격식 바로 | rank +1 when the next rank exists | `Rank.ceremony()` | v4.3.1 |
| 손님·기차 더 많이 (켬/끔) | customer and visitor spawn ×3 | spawn timers | v4.3.1 |
| 금방 바로 열기 | the 금방 letter and pad now (the depot is built first if missing) | 금방 gate skip through its ports | v4.3.1 |
| 관리자 표시 잠깐 숨기기 | hides the ribbon 30 s | UI | v4.3.1 |
| 레벨 +1 / +5 · 스킬 포인트 +10 · 스킬 무료 초기화 | chief state (the reset includes gear, admin only) | chief api | v4.4 |
| 퀘스트 다음 · 모두 완료 · 처음부터 · 우편함 시험 | chain and mailbox control | missions / rewards api | v4.4.1 |
| 실제 하루 넘기기 · 미션 다시 뽑기 · 출석 / 선물 / 오프라인 시험 | calendar key +1 (admin save only), re-draw, simulate 2 h away | `localDate` port `dk`, calendar `draw` | v4.5 |
| 부족 만들기 (빵 판매대 비우기) | test the region panel | StockLedger | v4.6 |
| 이야기 미리보기 ▸ | the v5 preview menu (D14) | `MODULE.previews` | v5 |
| 원래 마을로 돌아가기 · 이 마을로 계속하기 · 관리자 마을 지우기 | exit | store | v4.3.1 |
| 원래 마을 되살리기 | copy `.normal` / `.normal.prev` back to the normal save (two confirms) | store | v4.3.1 |

---

## 19. HUD and screens (logical 720 wide; 390×844 → 720×1558, 360×640 → 720×1280)

### 19.1 HUD (`top = 62 + safeTop`)

```
 row1  (Lv)[🪙 8,298 ]          [✉3]    [🎁|관리자]      (⚙)      y = top
 row2                 [──────── hint bar ────────]     (◷)       y = top+88 (unchanged)
 stack [📜 바다의 선물 · 물고기 3/5 ▮▮▯ | 오늘 2/3]                y = top+128… (stack manager)
       [👥 23/30] [▲ 마을 ▬▬▬]
       [📋 정기 납품 23/30]
       [🏢 업무 ●]
       [금방 배달 중 3]        (more rows fold into "+n": 4 rows at 390×844, 3 at 360×640)
                         … village …            (관망)(＋)(－)(🗺)   right column unchanged
   (🐶)                  [nav chip]             (줍기)            bottom third unchanged
```

**Row 1** (logical x, hit areas; critique M12 measured overlaps of 7 and 10 px in revision 1's row):

| Element | Centre x | Drawn | Hit area (x range) | Shown when | Tap | Version |
|---|---|---|---|---|---|---|
| Lv ring | 62 | ⌀72 | ⌀88 (18–106) | always | skill window | v4.4 |
| coin pill | 104–334 (moved +78) | as today | **not interactive** | always | — | v4.4 |
| 우편함 | 420 | ⌀64 + badge | ⌀88 (376–464) | ≥ 1 row or a new 보관함 item | mailbox | v4.4.1 |
| 선물 상자 | 524 | ⌀64 + ring | ⌀88 (480–568) | after the calendar gate, until 3 boxes are claimed; never in admin mode | open the ready box | v4.5 |
| 관리자 ribbon | 524 (the gift box's slot) | 110×40 | 110×88 (469–579) | admin mode only | admin panel | v4.3.1 |
| settings | 658 (`W − 62`, unchanged) | 84 | 84 (616–700) | always | settings | — |

Gaps between hit areas: 464 → 469 (5 px), 579 → 616 (37 px); centres ≥ 104 px apart. The overlap checker (§22.2) enforces
"no two interactive objects overlap" on every frame of the HUD audit.

**Other elements**:

| Element | Where | Size | Shown when | Tap | Version |
|---|---|---|---|---|---|
| quest chip | stack slot 1 | 300×64 (+ 96×48 오늘 mini-pill in v4.5) | an active quest | 수첩 이야기 (mini-pill → 오늘) | v4.4.1 |
| 자원 지도 toggle | (360, top+88) in overview only | 360×56 | overview on | pins on / off | v4.6 |

**Stack manager** (`src/scenes/hud/Stack.js`, v4.4): one place decides the left column. It replaces the fixed y values in
`HudV4.layout()`, `HudV42.layout()`, **금방's `GbChip` (fixed at (28, 445), 172 × 50, hit 172 × 88)** and the planned
missions P12.
- Entries register `{ id, order, h, hitH, visible() }`. Visible ones stack from `top+128` with a 10 px gap between hit areas.
- At most 4 rows when H ≥ 1400 (390×844) and 3 below (360×640). The rest fold into a `＋n` pill that opens for 6 s.
- Order: quest → pop/rank → order → work → **금방 chip** → (v5) mission.
- The 관망 caption moves to `stack.bottom() + 48`. The left nav badge clamp (G-P13: 480, or 550 + safeTop with 금방 open)
  becomes `max(480, stack.bottom() + 16)`.

**Panel flags**:
- every new panel sets `ui.v42PanelOpen` (or a new `v44PanelOpen` added to the four checks: `UI.js` pointer handler, `showChatButton`, `Navigator.wanted`, `UIProxy`);
- so the joystick, the chat pill, 관망 and the navigator wait.

### 19.2 Shell panel (`src/scenes/panels/Shell.js`, generalized `OfficePanel`)

- Non-pausing. Size `pw = min(W−24, 700)`, `ph = min(H − 220 − insets, 1100)`.
- Dim 35 % (a tap closes). Title row 92; tab row on `ui_office_tab(_on)`.
- The body scrolls by drag (masked container); a close button ⌀60.
- A tab builds once per open and updates its live fields in place (the missions_bank M-6 rule).
- **Sheets** (pausing, modal): the name sheet, 출석, the conflict sheet, confirm sheets.

### 19.3 Screens (layouts in `v44_draft_systems.md` §5; labels ≥ 22 px, body text in new panels ≥ 26 px)

| Screen | Shape | Version |
|---|---|---|
| name sheet | DOM 640×520, portrait, field (≥ 16 CSS px), 추천 이름 chips, `나중에` / `이걸로 할게요` 240×84 | v4.3.1 |
| admin panel | shell, rows 640×88, buttons 200×72 | v4.3.1 |
| 저장 코드 sheet | export (code + 복사 + 파일로 저장 where possible) / import (paste + preview + 불러오기) | v4.3.1 |
| settings 촌장 tab | `[소리·화면] [놀이] [촌장]` (3 plates of 200); rows Y(0)–Y(6) at the existing `Y(i) = cy − 262 + i·84`: 촌장 이름 ✎ · 저장 코드 내보내기 · 저장 코드 가져오기 · 보관된 마을 불러오기 · 경험치 숫자 (v4.4) · 미션 알림 (v4.5) · 부족 알림 (v4.6). The 놀이 tab keeps its six rows + G-P13's 금방 row at Y(6) (critique M2) | v4.3.1 (+ rows later) |
| stale / second-tab banner | full-width banner under row 1: `새 버전에서 저장된 마을이에요 · 새로 고침해 주세요` / `다른 창에서 마을을 열었어요 · 이 창은 쉬어요` + one button | v4.3 (S1) / v4.3.1 |
| skill window | shell, header (ring ⌀96, name ✎, SP), XP bar, 4 tabs 일솜씨 · 건축 · 사람 · 지혜, cards 640×150 (node ⌀96, pips, effect line `18 → 22개`, button 260×72: gear `300코인`, talent `포인트 1`), `재능 다시 배우기` footer | v4.4 |
| 수첩 | shell, tabs 이야기 (v4.4.1) · 오늘 · 이번 주 · 이달 · 출석 (v4.5); providers `{ id, label, icon, badge(), locked(), build(), update(), destroy() }` | v4.4.1 / v4.5 |
| 우편함 + 보관함 | shell, two tabs; mail rows 640×96; 보관함 grid of cards 200×200 with a count badge and `놓기` / `쿠폰 쓰러 가기` | v4.4.1 |
| 출석 sheet | 660×760, 7 plates 80×104, 28 cells 64, `받기` | v4.5 |
| 오프라인 sheet | small sheet, coins count-up | v4.5 |
| 마을 panel | shell, tabs 등급 · 행복 · 자원 · 통계 | v4.6 |
| settings 계정 tab | `[소리·화면] [놀이] [촌장] [계정]` (4 plates of 168) | login track |
| conflict sheet | two cards 620×250 (nickname/title, Lv, coins, quests, play time, last save + device) | login track |

---

## 20. Art

### 20.1 Reused (no new art)

| Need | Keys (fragment) |
|---|---|
| panels, buttons | `ui_panel`, `ui_button_{blue,green,gray}` (ui) |
| tabs, chips, chalk, letter paper, status dots | `ui_office_tab(_on)`, `ui_chip`, `ui_chalk_panel`, `ui_letter`, `ui_status_0..3` (ui5 / `v42_core`) |
| cards, progress, board, calendar, goal, rank badges | `ui_card(_selected)` (ui2), `ui_mission_card(_done)`, `ui_progress_bg/fill`, `ui_mission_board`, `ui_icon_calendar`, `ui_icon_goal`, `ui_badge_rank_1..5` (ui3) |
| skill icons | `ui_icon_backpack`, `ui_icon_speed` (ui); `ui_icon_tools`, `ui_icon_hammer`, `ui_icon_happy`, `ui_icon_people` (ui2); `ui_icon_request`, `ui_icon_delivery` (ui3); `ui_icon_hand`, `ui_icon_halo`, `ui_icon_cheer`, `ui_icon_binoculars`, `ui_icon_bank` (ui5); `ui_icon_heart_full` (pets2) |
| rings, mail, FX, sounds | `ui_ring_bg/fill` (ui), `ui_icon_letter` (ui5), `fx_levelup`, `fx_unlock`, `sfx_levelup`, `sfx_unlock` |
| gift decor, gold halo | `life_props` (igloo, lantern_string, kids_swing, snow_fort), `life2` (wedding_arch, flower_stand), `chief_halo_gold_*` (`v42_core`) |

Not reused: `ui6` (the 금방 brand), and `ui4_icons` (`fx_city`, not shipped).

### 20.2 New: `ui7` (one packed page ≤ 1024², +2 files, `tools/gen_ui7.py`, procedural like ui5)

Source px = 2× the logical display size.

| Key | Display (logical) | States | Version | Stand-in |
|---|---|---|---|---|
| `ui7_admin_ribbon` | 110×40 | — | v4.3.1 (art lands with the page in v4.4) | red Graphics pill |
| `ui7_lv_frame`, `ui7_lv_glow` | ⌀88 / ⌀104 | normal · gold (Lv 60) | v4.4 | Graphics |
| `ui7_xpbar_bg/_fill/_shine` | 560×24 9-slice | — | v4.4 | rounded rect |
| `ui7_node` | ⌀96 | locked · gated · learnable · learned · maxed · gear | v4.4 | ring + tint |
| `ui7_pip_on/_off` | 16 | — | v4.4 | dots |
| `ui7_br_hand/_build/_people/_wise` | 40 | — | v4.4 | ui5 / ui2 icons |
| `ui7_icon_piggy` | 48 | — | v4.4 | `ui_icon_coin` |
| `ui7_sk_bag/_speed/_hands/_reach/_build/_lean/_persuade/_popular/_lead/_trade/_luck/_vault/_insight` | 48 | — | v4.4 (vault v4.5, insight v4.6 drawn now) | `ui_icon_backpack`, `ui_icon_speed` (ui, boot) for gear; a tinted circle + letter for the rest (critique L6: ui3 / ui5 icons arrive 1–20 min late) |
| `ui7_ribbon` | 640×56 9-slice | — | v4.4 | `ui_button_blue` |
| `ui7_stamp_done` | ⌀96 | — | v4.4 | `ui_icon_check` |
| `ui7_icon_quest` | 40 | — | v4.4 | `ui_icon_goal` |
| `ui7_icon_code` | 40 | — | v4.4 | `ui_icon_letter` |
| `ui7_icon_box` | 40 | — | v4.4.1 (보관함 tab) | `ui_icon_house` |
| `ui7_cal_cell` | 64–112 | empty · today · stamped · reward · locked | v4.5 | Graphics + `emote_sparkle` |
| `ui7_day_plate`, `_7` | 80×104 | past · today · next | v4.5 | `ui_card` |
| `ui7_stamp_snow` | 56 | — | v4.5 | `fx_snowflake` |
| `ui7_chest_closed/_open/_shake0..2` | ⌀64 | 5 frames | v4.5 | `ui_icon_coin` |
| `ui7_face_0..4` | 40 | 5 moods | v4.6 | emotes |
| `ui7_pin` | 64×80 | tinted per status | v4.6 | `ui_status_*` |
| `ui7_icon_cloud` | 40 | synced · syncing ×2 · offline · conflict | login | text |

- **Budget**: ≈ 75 frames, ≤ 4 MiB GPU, +2 files. Loaded with the boot UI, since the Lv ring is on screen in minute 1.
- **No new world sprites.** Decor, halo, FX and characters all exist.
- **Not ours to draw**: Google's official "Sign in with Google" mark. One small file, shipped only in the APK and Pages builds.
- **Files**: 413 today → ≈ 457 after 금방 → ≈ 459 with `ui7` → ≤ 461 if an optional `ui7b` is needed in v4.5 / v4.6. The gate is 480.

---

## 21. Strings

- Every new key goes in `src/data/strings.js`, ko + en, with module `strings.js` files for module text.
- **Key families**:
  - `save_stale`, `save_otherTab`, `save_reload` (v4.3, S1);
  - `name_*`, `adm_*`, `code_*`, `set_tab_chief`, `set_chief_*`, `keep_*` (보관된 마을) (v4.3.1);
  - `sk_*`, `lv_*` (v4.4);
  - `q_<id>_t` (title), `q_<id>_d` (task), `q_<id>_l` (the resident's line), `q_wait` (passive chip), `ch_<n>` (v4.4.1);
  - `mail_*`, `inv_*`, `cp_*` (v4.4.1);
  - `att_*`, `gift_*`, `off_*` (v4.5);
  - `hp_*`, `rs_*` (v4.6);
  - `acc_*`, `cf_*`, `title_cloud`, `priv_line` (login).
- **Existing tables to copy**: the drafts' tables hold the exact ko / en text — design §4.8 (skills, name), systems §5.11 (account, conflict, code).
- **English check**: long labels must fit, using the `setScale` shrink rule.

---

## 22. Test plan

### 22.1 Node (pure, seeded, `node --test`)

Paths are under `tools/test/` (new suites in `tools/test/v44/`, the missions ones in `tools/test/missions_lab/`, next to
the existing `*.test.mjs`).

| Suite | Version | Checks |
|---|---|---|
| `save/write_guard.test.mjs` | v4.3 (S1) | a stored `{"v":8…}` (and `{"v":99…}`) is never overwritten by a v7 build; the stale callback fires once; a stored v7 or a missing key writes normally |
| `save/keys.test.mjs` | v4.3.1 | `Save.key(kind)` for every kind in both modes; `clear()`, `quarantine()`, `keepCopy()`, `ChatSave.*` touch only the current mode's family (fake storage, key-by-key diff); a **grep test**: no `frostVillage.save` literal and no `getItem(`/`setItem(`/`removeItem(` outside the allowed files (§6.3); `SAVE_KEY` & co. are not exported |
| `save/lock.test.mjs` | v4.3.1 | `SaveLock`: second writer takes over, the first stops writing; a stale lock (> 15 s) is taken; lock writes never touch save keys |
| `admin/store.test.mjs` | v4.3.1 | enter / exit / promote / restore over a fake storage: the normal family **byte-identical** after any admin session, including 처음부터 (`clear`) and `quarantine` inside it; entering twice never loses a differing `.normal` (`.normal.prev`); chat keys follow the mode |
| `account/code.test.mjs` | v4.3.1 | round trip with and without `CompressionStream` (both frames), CRC catches a 1-char edit, future version refused, `adm` shown in the preview model, the import slot's never-overwrite rule, size of a 14 KB save |
| `chief/name.test.mjs` | v4.3.1 | name validation (graphemes, NFC, jamo, blocklist, 8 max) |
| `kit/feed.test.mjs` | v4.4 | normalizer table (every `t` has a producer: grep), FIFO with re-entrant emits, 200-event guard, error isolation |
| `kit/income.test.mjs` | v4.4 | `created` = Δ(coins + tills) + Δspent − Δtagged: a till filled for 10 min and collected at once gives **the same** `I` as one collected every 30 s (± 2 %); tagged coins (incl. `refund`) excluded; bank deposit / withdrawal net 0; seeding from `[i5, i30]` gives `I > 0` on the first tick; a v7 save seeds from `seedI[era]`; clamp to `[0.5, 1.5] × i30` |
| `chief/chief.test.mjs` | v4.4 | level curve exact (§9.4), SP grants, gear costs coins only and no SP, talent gates / SP, gear never respecced, `mod()` caps, 관망 multiplier and nap, day limits incl. `drop`, no drop XP into the warehouse or back into the source sink |
| `chief/migrate.test.mjs` | v4.4 | `MIGRATE[7]`: ranks kept, refund tagged, +2 SP once, name and `adm` kept; the side-record re-attach (same `cid` → slices kept, no gift; other `cid` → fresh) |
| `missions_lab/chain.test.mjs` | v4.4.1 | 68 quests reachable in order (closure: every objective's facts are produced by an earlier step); **every counted signal is repeatable without limit, every one-time event is read as a state fact** (D31); passive quests make `chainCovers()` false; counters start on activation; state objectives on arrival; claim / auto-claim → mail with a fixed amount; chapter SP / coupons; `needs` skips |
| `missions_lab/catchup.test.mjs` | v4.4.1 | the frontier rule on the four fixtures of §11.6 (frontier, quests done, XP, Lv, SP exactly as the table); × 2 only with `chief.mig`; coins ≤ 10 × I; idempotent (`qc.cu`) |
| `missions_lab/missions.test.mjs` (+) | v4.4.1 / v4.5 | the existing 56 tests green; with `v5Parts: false` no board / request / event / fame object is built and `env.people` is never called; G1 / G2 never drawn in v4.x; calendar gate `any(step:hire_farmer, q:q211)`; tiers; eligibility (`reg:self`, `plot:free`, `letter:due`) with a free swap when it stops holding; monthly keys (rollover at 05:00 on the 1st); streak halves |
| `rewards/inventory.test.mjs` | v4.4.1 | mailbox overflow claims the oldest row of any kind and loses nothing; 보관함 counts, 9 per kind then XP; place / put away / place again; 365 simulated days of maximum gifts never drop a thing; slice ≤ 1,536 B |
| `rewards/rewards.test.mjs` | v4.5 | attendance one per key, keys forward only, clock back → 0, clock ahead uses days up, the day check also on visibility / day-key change; gifts (active time, 관망 half only when touched); offline: **daily credit** shared by 1 × 30 / 3 × 10 / 6 × 5 sessions, split at 05:00, `lastSeen` max-only, negative → 0 |
| `account/pkce.test.mjs` | login | RFC 7636 vector (`dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk` → `E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM`) |
| `account/sync.test.mjs` | login | the §17.7 table exhaustively; reset clears `baseRev`; admin never pushes |
| `slices.test.mjs` | v4.3.1 / v4.4 | `keepChief` (v4.3.1) = `sanitizeChief` (v4.4) on the name fields; `sanitizeChief`, `sanitizeRewards`, extended `sanitizeMissions`, `later.inc`: 500 fuzzed blobs, never throw, idempotent, cap |
| `balance.test.mjs` | v4.4 | `balanceCheck` repairs a bad `BALANCE.v44` (lengths, order, caps, a stray `popular.happyCap`, gear `sp`) |
| `purity.test.mjs` (+) | all | `src/{chief,rewards,admin,insight,album}/model/**`, `src/admin/store.js`, `src/core/SaveLock.js`, `src/account/{sync,pkce,code}.js`: no Phaser, window, document or Date |

### 22.2 Playwright phone runs (`tools/test/v43*.mjs`, `v44*.mjs`; the `pw.mjs` harness)

- **Viewports**: 390×844 DPR 3 and 360×640 DPR 2, touch, ko-KR and en.
- **Stale tab (v4.3)**: write a `{"v":8,…}` save under the key, run the game 10 s: the key is unchanged and the banner shows.
- **Two tabs (v4.3.1)**: open the game in two pages of one context; only the newer one writes; the older shows its banner.
- **Name sheet (v4.3.1)**:
  - IME via CDP `Input.imeSetComposition` `ㄴ → 누 → 눈`, then `insertText('송이')`;
  - an Enter during composition must not submit;
  - **the button tapped mid-composition** (`ㅇ → 이` still composing) saves `눈송이`, not `눈송` (critique M14);
  - the input's computed font size ≥ 16 CSS px at 360 and 390 wide;
  - the visual viewport is shrunk to 420 high: the field and the button stay visible.
- **Admin (v4.3.1)**, each run ends with exit + a hash compare of **every** normal-family key (`frostVillage.save.v1*`,
  `.backup*`):
  - enter → 돈 무제한 → 모든 땅 열기 → 모든 건물 열기 → 짓기 바로 완공 → 금방 바로 열기 → exit;
  - enter → 설정 › 처음부터 › 네 → exit (critique C1);
  - enter → a forced throw in `Game.build()` (test hook `__FV.test.throwOnBuild`) → reload → exit;
  - enter → back to the title → the title shows `관리자 마을` and the admin progress → exit;
  - enter → exit → enter again after changing the normal village: `.normal.prev` holds the older copy;
  - ×4 speed for 3 game minutes with the `pickup`, `nav` and `rail` checks running: no wall crossing, no stuck porter.
- **저장 코드 (v4.3.1)**: export in one browser profile, import in another → the same village; with `CompressionStream`
  deleted → the `u` frame round-trips; the pre-import village sits in `.import`.
- **Settings 촌장 tab (v4.3.1)**: three tabs at 360 and 390 wide, seven rows, no row under the footer buttons.
- **Chapter 1 by touch (v4.4.1)**: joystick (the `boot_test` CDP touch helpers), chip progress, claim, Lv-up banner, the
  arrow on the Lv ring when the bag is affordable, learn 큰 가방 for coins.
- **HUD overlap checker** (bounding boxes from `__FV`), v4.4 on:
  - no two interactive objects overlap (row 1 as §19.1; the stack incl. the 금방 chip);
  - every one ≥ 64 drawn and ≥ 88 hit;
  - nothing new in the bottom third;
  - a late save folds to 3 rows at 360×640 and 4 at 390×844.
- **Screenshots**: listed per version in the build contracts (§B1–§B7).
- **Existing suites stay green**: `smoke`, `v42`, `v4`, `rail`, `town`, `v3`, `labour`, `dog`, `life`, `plots`, `restaurant`, `c2`, `nav`, `pickup`, saves, chat, unit tests, `texbudget`, `soak`, the 금방 suites; artifact ≤ 480 files.

### 22.3 Save migration fuzz

- **Fixtures**, made **before** the chain data is written (critique H1):
  - existing `tools/test/fixtures/v35_save_*`, `v41_save_*`;
  - new v4.2 fixtures from the bots: Ch1 (≈ 5 min, fish porter hired), Ch2 (≈ 12 min, farmer hired), 25 min (village
    complete), Ch5 (읍, ≈ 46 bot min), Ch6 (office + bank + depot, ≈ 90 bot min); bag / boots at 0, mid and max; partial
    payments on the old pads;
  - v4.3 / v4.3.1 fixtures: a nickname, an open 금방, an admin-born village (`adm: 1`);
  - tier fixtures for the calendar eligibility test (before complete · complete · 읍 · late 읍 with every register clerked
    and no free plot).
- **For each** (v4.4 load, then v4.4.1 load):
  - `capacity()` and `speedMult()` are identical;
  - coins = before + refunds;
  - the nickname and `adm` are kept;
  - v4.4.1: the catch-up frontier, Lv and SP equal the §11.6 table;
  - catch-up coins ≤ 10 × I and > the floor (the meter is seeded);
  - the 그동안의 이야기 card shows once;
  - a reload runs no second catch-up.
- **1,000 fuzzed v7 saves** through `MIGRATE[7]` + `sanitizeSave`: never throws; load → save → load is stable; ≤ 16 KB.
- **Stale builds next to a v8 save**:
  - the v4.3 build (S1) never overwrites it;
  - the published v4.2 build starts a fresh village and keeps the v8 save in `backup`; v4.3.1+ lists it under
    보관된 마을 불러오기 and brings it back;
  - a v4.2 tab that was already open writes a v7 save over it; the next v4.4 load re-attaches the side record (same `cid`):
    level, skills, quests and rewards are kept, no second gift.

### 22.4 Bots (`review_gameplay_sim.mjs` policies)

- **Baseline first**: 5 seeded v4.2 runs per policy give the reference medians (village complete, 읍, longest wait). The
  revision-1 numbers (two single runs, 19.3 and 20.7 min) are not used (critique M16).
- **Pacing gates** (median of 5 seeded runs each, D36), for `--skills eager` (each SP on the first visible card),
  `--skills bagfirst` and the arrow-only bot:
  - village complete within ±5 % of the v4.2 median;
  - 읍 within ±5 % (two-sided: an earlier 읍 fails too);
  - longest wait ≤ 3.8 min.
  - If it fails, the knobs are the talent `lv` gates, `quests.ch`, `skills.bag.lv` (r6 only) and `insight.settlersFrom`.
- **`--skills none`**: never opens the window; must still reach 읍 (≤ +25 %, the bag stays 6); dailies still open (D5).
- **Quest audit** (v4.4.1): the arrow-only bot finishes Ch1–Ch5 with 0 stuck quests; every quest completes within its
  chapter window × 2; no passive quest hides "다음 목표".
- **XP audit**: XP per minute by source against §9.3; Lv at 30 min of play 6–9 in v4.4 and 9–13 in v4.4.1; the warehouse
  loop (fill, walk, drop, repeat) earns ≤ 5 XP / min.
- **Catch-up audit** (v4.4.1): the §22.3 fixtures load to the §11.6 table.
- **Reward share audit (v4.5)**: 7-day sims with **1 × 30, 3 × 10 and 6 × 5 sessions a day** (gaps ≥ 3 h): every source
  within the §2 budget in all three; offline ≤ 24 % (≤ 50 % with 금고 r2).
- **HUD audit**: the bot logs each frame's row-1 hit boxes, stack rows and edge badges, and fails on overlap.

### 22.5 Login without a real phone (login track)

- **Mock Supabase** (`tools/test/account/mock_supabase.mjs`):
  - `authorize` (302), `token` (PKCE check, refresh), `rest/v1/saves`, `rpc/put_save` (same CAS rules), `logout`;
  - switches: paused (503), slow, offline.
- **Pages mode**: a redirect round trip on localhost; first push; a second profile → conflict sheet; offline → outbox → online.
- **APK mode** (`boot_test.mjs` + AssetServer):
  - intercept `/auth/v1/authorize`;
  - call `window.__fvAuthReturn('com.snowbloom.village://auth/callback?code=…')`;
  - assert session, push and pull, and that a reused code is refused.
- **Java**: `DeepLink` unit tests with hostile inputs (`'`, `"`, `\`, `</script>`, a 600-char code, an HTML `error`, a fragment token).
- **SQL**: two fake users (`set local role authenticated; set local request.jwt.claims …`).
  - User B cannot read or write user A's rows.
  - `put_save` returns `conflict` / `tooOld` correctly; two first pushes in parallel give one `ok` and one `conflict`
    (no error); `delete_me` cascades, and the client signs out locally after it.
  - Then `get_advisors`.
- **On-phone checklist for the designer** (Korean, in the build report):
  1. install over the old APK;
  2. 설정 › 계정 › Google 로그인 → Chrome sheet → back: `로그인했어요!`;
  3. play 3 min → `클라우드 저장 · 방금`;
  4. uninstall + install → `다른 기기의 마을 불러오기` → the same village;
  5. airplane mode → play → online → saved;
  6. close the app during the Chrome sheet → reopen → login works.

### 22.6 Per-version phone checklists (designer)

| Version | Checklist |
|---|---|
| v4.3 | 금방 as its own checklist; open an old tab of the game after the new one has saved: the old tab shows `새로 고침해 주세요` and the village is safe |
| v4.3.1 | name sheet with the keyboard open (field visible), type a name and tap the button **without** closing the keyboard: the whole name is kept; rename in 설정 › 촌장; 관리자 in / out; **처음부터 inside 관리자, then out: the real village is still there**; each switch; 저장 코드 from the APK (복사) into the artifact and back; two tabs open at once |
| v4.4 | Lv ring + SP dot + coin dot next to the coins at 360 px; the arrow points at the ring when the bag is affordable; skill window scroll; the 금방 chip in the left stack; an old v4.2 save: (name) → the bag the same size → coins refunded → +2 SP |
| v4.4.1 | the quest chip under the coins, also with the order chip; a waiting quest still shows "다음 목표"; an old 읍 save: 그동안의 이야기 → Lv 17 → skill window; 보관함: place a gift, put it away, place it again |
| v4.5 | phone clock back / ahead: no double check-in or gifts, no negative offline; three short sessions in one day: the offline coins stop after 3 h of credit; an overnight tab rolls at 05:00; switching apps and back runs the day check; the streak halves after a missed day; the stamp card resets on the 1st |
| v4.6 | the 마을 panel with 60 residents; TOP 3 해결하러 가기 leads to the right pad; photo saves on both platforms (APK through the new file bridge) |

---

## 23. Risks

| Risk | Mitigation |
|---|---|
| The 시험 도구 delay 금방 | they are v4.3.1, after 금방's G-P1 / G-P5 / G-P13 have landed, by the builder who owns `Save.js` / `Game.js` / `UI.js` (D1) |
| Admin mode touches the real village | one key family (D28), restore row, `.normal.prev`, and the §22.2 runs that press 처음부터, force a build throw and show the title in admin mode |
| The missions sub-gate refactor breaks the polished v5 module | keep its 56 tests green; the v5 parts are removed by `v5Parts: false` in v4.x and tested with a real 읍 save in the real game, not with stubbed ports |
| Talents speed up the first session past ±5 % | the `eager` bot median gate; knobs: talent `lv`, `quests.ch` |
| The income meter is wrong somewhere (a till not registered, an untagged payout) | `kit/income.test.mjs` (hoarded vs collected tills give the same `I`), the clamp, and a `__FV.income.audit()` that lists `created` by source for the bots |
| Left-column crowding at 360×640 late in v4 | stack manager with fold (금방 chip included) + the HUD audit bot |
| Korean IME glitches in the WebView (cut or doubled syllables) | no tight maxlength, composition tracking, blur-then-read on the button, the CDP IME tests, the designer's phone check in v4.3.1 |
| Chrome refuses the app-scheme redirect on her phone | the `auth.html` bounce page, ready but off |
| Supabase free project pauses after a week idle | cloud optional; `acc_asleep`; the designer restores from the dashboard |
| A stale build meets a v8 save in the same browser | S1 in v4.3, the single-writer lock in v4.3.1, the side-record re-attach and 보관된 마을 불러오기 for the published v4.2 build (§22.3) |
| ui3 / ui5 / ui7 art arrives late | the skill icons are on `ui7` (boot); Graphics or base-atlas stand-ins + `reskin()` swaps |
| Phaser's keyboard eats typing in DOM fields | one helper sets `keyboard.enabled = false` for every DOM sheet (name, code, later fields) |
| A v4.3.1 save opened in an old v4.2 tab drops the nickname on its next autosave | harmless (rename); noted in the v4.3.1 build report |
| Admin mode found by players | harmless (single-player, separate save), a clear ribbon, nothing leaves the device |
| Levels feel slow in v4.4 before the chain | the chain follows in v4.4.1 with its catch-up; talents only (gear is coins), so pacing cannot suffer |

---

## 24. Effort per version (agent build days + review/fix days)

Revision 2 adds 30–50 % and an explicit review + fix round to every version (critique M17).

| Version | Breakdown | Total |
|---|---|---|
| v4.3 S1 | write guard + banner + test | ≈ 0.25 + 0.25 (inside the 금방 schedule) |
| v4.3.1 | save keys + title + grep test 0.75 · admin 1.5 (15 switches, restore, sub-steps) · nickname 0.5 · 저장 코드 0.5 · settings 촌장 tab 0.25 · single writer + 보관된 마을 0.5 | ≈ 3.5 + 1.5 |
| v4.4 | kit-lite incl. the income meter + till registry 2 · chief + migration + side record 2 · skill hooks + `reprice()` 1.5 · skill window + Lv ring + arrow 1.5 · HUD stack (+ 금방 chip) + shell 0.75 · admin rows 0.25 | ≈ 8 + 3 |
| v4.4.1 | chain model + data (68 × 3 strings × 2 languages) 2 · catch-up + fixtures 1 · 수첩 + chip + guideTo 0.75 · 우편함 + 보관함 + gift spots 1 · missions sub-gates / `v5Parts` 0.25 | ≈ 5 + 2 |
| v4.5 | calendar refactor + eligibility 2.5 · templates 1 · monthly 0.75 · 출석 1.25 · 접속 선물 0.75 · offline daily credit 1 · day checks on visibility 0.25 · tabs / sheets 0.5 · reward-share bot (3 session patterns) 1 | ≈ 9 + 3 |
| v4.6 | happiness 2.5 · region rows + why-chain 2.5 · 마을 panel + pins 1.5 · 도감 · 업적 1.5 · 사진 + APK file bridge 1.5 | ≈ 10 + 3 |
| login track | APK wrapper 2 · client + sync 2.5 · UI (계정 tab, conflict sheet) 1.25 · schema 0.5 · tests 1.75 | ≈ 8 + 3 |
| optional artifact `db` saves | §17.2 | ≈ 1 + 0.5 |

---

## 25. What the designer must decide or do

1. **Supabase**: OK to create one new free project `snowbloom-village` (Seoul, $0)? Only needed for login. Default: wait.
   It takes the org's second free active slot (`nuripang` is the first); waking `gideon1-cell` or `idle-sword-master`
   later would need one of the two paused first.
2. **Google Cloud**: make the OAuth client (≈ 10 min, steps in the 기획서 §11). Paste the client ID and secret **only into Supabase**, never into chat. Then switch on Google and switch off Email in Supabase (≈ 5 min).
3. **GitHub Pages** (only if she wants web login): repo Settings › Pages › `main` / root (`tools/build/README.md` §2).
4. **After the login APK**: the 6-step on-phone checklist (§22.5).
5. **Game choices** (each ships with its default if unanswered):
   - a. bag and boots cost **coins only** (the old pad prices, no skill points), and skill points are for the other
     skills — **yes**;
   - b. 오늘의 미션 · 출석 · 접속 선물 open when the farmer is hired or chapter 2 ends (≈ 13–15 min) — **yes**;
   - c. offline earnings 4 %, **3 h of credit per day** in total — **yes**;
   - d. admin door = 7 taps on the version label — **yes**;
   - e. the first v4.6 extra: 도감 or 사진 모드 — **도감**;
   - f. 금방 ships first as v4.3, the test tools right after as v4.3.1 — **yes**;
   - g. every skill learned after ≈ 40 days at 30 min a day — **yes** (faster or slower is one number per skill);
   - h. 인기도 brings settlers and train visitors, but never fills the 읍 happiness bar — **yes**.

---

## 26. The request → where it is answered

| # | Request | Here | Version |
|---|---|---|---|
| 1 | 퀘스트 (물고기부터, 레벨마다) | §11 | v4.4.1 |
| 2 | 하루 · 주간 · 월간 임무 | §12 | v4.5 |
| 3 | 출석 · 접속 보상 | §13 | v4.5 |
| 4 | 주민 행복도 | §15 | v4.6 |
| 5 | 지역 자원 · 무엇이 부족한지 | §16 | v4.6 |
| 6 | 구글 로그인 / 로그인 없이 · 저장 / 불러오기 | §17 (저장 코드 v4.3.1) | login track |
| 7 | 시장 이름 (닉네임) | §9.1–9.2 | v4.3.1 |
| 8 | 스킬창 (가방 · 이동 → 스킬, + 더 많은 스킬) | §9–§10 | v4.4 |
| 9 | 관리자 모드 | §18 | v4.3.1 |
| 10 | 추가 기능 | 우편함 · 보관함 §14, 저장 코드 §17.6, 보관된 마을 불러오기 §3.1b, 도감 · 업적 / 사진 / 통계 §3.4 | v4.3.1–v4.6 |

---

## 27. Critique answers (`docs/build_reports/v44_plan_critique.md`)

Every finding was accepted unless the row says otherwise. "Where" names the section of this plan that now holds the fix.

| # | Finding | Answer | Where |
|---|---|---|---|
| C1 | Admin isolation misses `clear` / `quarantine` / title / backups | **Fixed**: one derived key family `Save.key(kind)` for every key incl. chat, backups, `.bad`, `.later`, `.import`, `.story`; constants no longer exported; `Save.peek()` for the title; grep test; `.normal.prev` instead of overwriting `.normal`; `원래 마을 되살리기` row; §22.2 runs 처음부터, a forced build throw and the title in admin mode, each followed by an exit and a hash compare of every normal key | D28, §6.3, §18.1, §22.1–22.2, §B2 |
| H1 | Catch-up stops at q109 / q603 | **Fixed**: frontier rule (last progress-state quest that holds; everything up to it is done whatever the objective type); fixtures at Ch1 / Ch2 / Ch5 / Ch6 made before the chain data, with an exact expected table | D32, §11.1, §11.6, §22.3 |
| H2 | Gear competes with talents for SP | **Fixed as suggested**: gear costs coins only, no SP, no level gate except bag r6 (Lv 20); gear cards visible from minute 0 as locked; `eager` bot added to the pacing gate. Talent last ranks now cost 3 SP so "every talent maxed at ≈ Lv 40" still holds (58 SP) | D8, §10.1–10.2, §9.5, §22.4 |
| H3 | Offline cap per absence, not per day | **Fixed**: a daily credit of `capH` hours shared by all sessions; split at 05:00; reward-share bot runs 1 × 30, 3 × 10, 6 × 5 | D30, §13.3, §22.4 |
| H4 | v5 parts of missions switch on at 읍 | **Fixed**: `BALANCE.v44.missions.v5Parts: false` removes board, requests, events, fame, craft, followers and their prefetch in v4.x; G1 / G2 move to `v5`, G3 stays `life`; tested with a real 읍 save | D4, §4, §12.1, §22.1 |
| H5 | One-shot 금방 events as counted objectives | **Fixed**: one-time events are state facts (`gb:letter`, `gb:open`, `gbDelivered`, `gbUpgrades`, `staff:*`, `newsAnswered`); chain test requires every counted signal to be repeatable | D31, §4 facts, §11.1, §11.3 Ch6–Ch7, §22.1 |
| H6 | Income meter: collection-time, empty at load, spikeable | **Fixed**: created-value meter (Δ coins + Δ tills + Δ spent − Δ tagged), saved and seeded (`seedI` for v7 saves), clamped to 0.5–1.5 × the 30-min average, amounts fixed at grant, refunds tagged | D29, §2.1, §5.2, §6.1, §13 |
| M1 | v4.3 extras not file-disjoint from 금방 | **Fixed**: the extras are v4.3.1 by default, by the owner of `Save.js` / `Game.js` / `UI.js`, after G-P1 / G-P5 / G-P13; only S1 (a 10-line write guard) rides in v4.3, by the 금방 builder | D1, §0, §3.1–3.1b |
| M2 | The 놀이 tab is full | **Fixed**: a third settings tab `촌장` with exactly seven rows (name, code ×2, 보관된 마을, XP floats, mission toasts, shortage toasts); the login 계정 tab makes four plates of 168 | §3.1b, §19.3 |
| M3 | Office hire order | **Fixed**: Ch6 follows the pad's order 셈이 → 딸랑이 → 소복이, and the letter reply comes after 소복이 (the 편지 tab opens with her) | §11.3 Ch6 |
| M4 | Passive quests hide "다음 목표" | **Fixed**: `passive` flag on six quests; `chainCovers()` is false while one is active; the chip shows `그동안: …` from `nextGoal()` | §11.1, §11.4 |
| M5 | Catch-up runs before `VillageLife` exists | **Fixed**: `later.afterBuild()` on the first `update()` tick | §5.1, §11.6 |
| M6 | Daily features gated on optional quests | **Fixed**: `any(step:hire_farmer, q:q211)` | D5, §12.1 |
| M7 | 인기도 and `max()` pull 읍 forward | **Fixed**: 인기도 never touches `happyCap` or the 읍 bar; the bar keeps today's metric; 읍 gated two-sided | D34, §10.2, §15.3, §22.4 |
| M8 | 뚝딱 건축 does almost nothing | **Fixed**: timers −15 / −25 / −35 % incl. founding and 금방 opening; site porters 12 / 14 / 16; ribbon 90 → 60 s; the no-op builder rank is dropped. (The critique's "porters fetch from the warehouse" idea was declined: new porter behaviour is more risk than this skill is worth) | D35, §7.3, §10.2 |
| M9 | Gift spots and mailbox overflow | **Fixed**: 보관함 with counts per kind, put away / place again, spots 12 / 16 / 20 by rank, > 9 of a kind → XP, mailbox overflow auto-claims any kind; a 365-day test | D33, §14, §22.1 |
| M10 | Stale tab or older build next to a v8 save | **Fixed**: S1 write guard in v4.3; single-writer lock and 보관된 마을 불러오기 in v4.3.1; the v8 side record re-attaches slices if the published v4.2 build overwrites the save; catch-up keyed on `qc` absence, gift on `mig` | §3.1, §3.1b, §6.2, §22.3 |
| M11 | XP farm through the warehouse | **Fixed**: no drop XP into the warehouse or back into the source sink; daily drop cap 1,500 | §7.2, §8, §9.3 |
| M12 | HUD row-1 overlaps; 금방 chip missing from the stack | **Fixed**: row 1 re-measured (mail 420, gift / ribbon 524, centres ≥ 104 apart, coin pill not interactive); `GbChip` registered in `Stack.js` | §19.1 |
| M13 | Admin ×4 by multiplying `dt` | **Fixed**: sub-steps + `time.timeScale` + `tweens.timeScale`; ×4 tested with the pickup / nav / rail checks | §5.1, §18.2, §22.2 |
| M14 | Name sheet: button mid-composition, input font | **Fixed**: blur, then read on `compositionend` or after two frames; font ≥ 16 CSS px; CDP test of the button mid-composition | §9.1, §22.2 |
| M15 | Dailies a late village cannot do | **Fixed**: eligibility facts (`reg:self`, `plot:free`, `letter:due`) with a free swap; every template tested against tier fixtures | §4, §12.1, §12.3, §22.3 |
| M16 | Pacing gate inside the noise; arrow no longer leads to gear | **Fixed**: medians of 5 seeded runs (re-measured v4.2 baseline), `eager` + `bagfirst` + arrow-only all gated; the arrow points at the Lv ring whenever a gear rank is affordable (the v4.2 condition) | D36, §2.5, §10.5, §22.4 |
| M17 | Effort optimistic | **Fixed**: the split is the default (v4.4 / v4.4.1), every version has a review + fix round, numbers +30–50 % | D27, §0, §24 |
| L1 | Admin door is near the top | **Fixed**: text says "near the top of the settings panel, above the tabs"; the balance comment too | §8, §18.1 |
| L2 | `put_save` first-insert race | **Fixed**: `on conflict do nothing` + re-select → `conflict`; local sign-out after `delete_me` | §17.5, §22.5 |
| L3 | `CompressionStream` support | **Fixed**: `SV<v>u.` uncompressed frame, both tested | §17.6, §22.1 |
| L4 | Import overwrites `BACKUP_KEY` | **Fixed**: dedicated `import` slot with the never-overwrite rule | §6.3, §17.6 |
| L5 | Admin village becomes real through 저장 코드 | **Fixed**: `adm: 1` from creation; preview shows `관리자 마을`; the same two confirms | §6.1, §17.6 |
| L6 | Skill icons from late fragments | **Fixed**: 13 `ui7_sk_*` icons on the boot `ui7` page | D23, §10.2, §20.2 |
| L7 | Missions prefetch at minute 0 | **Fixed**: the prefetch is sub-gated with the parts it serves (`v5Parts`) | §3.2b, §B4 |
| L8 | Name-sheet trigger for v4.2 saves | **Fixed**: `!chief.seen.name`, 3 s after the village is on screen | §9.1 |
| L9 | Attendance / offline only on load | **Fixed**: a day check also on `visibilitychange` → visible and on a day-key change | §13.1–13.3 |
| L10 | Minimum text size | **Fixed**: body text in new panels ≥ 26 logical | §2.10, §19.3 |
| L11 | Supabase free slots, chooser domain | **Fixed** (told): in §17.5 and §25 item 1 | §17.5, §25 |
| L12 | Coupon levels inconsistent | **Fixed**: every 10th level (10, 20, … 60), from v4.4.1 | §8, §9.4 |
| L13 | AFK 관망 earns gifts | **Fixed**: 관망 counts half only when touched in the last 60 s | §8, §13.2 |
| L14 | APK file saves need a JS bridge | **Fixed**: `saveFile(name, base64)` bridge in v4.6; until then the APK's 저장 코드 offers 복사 only | §3.4, §17.3, §17.6 |

Nothing was declined outright; one suggested variant (M8's carpenters-fetch) was replaced by a cheaper effect.

## Appendix A. What each draft contributed

| From the design draft | From the systems draft |
|---|---|
| the measured pacing and the XP model | the code facts table (save, upgrades, costs, panels, DOM input, Navigator, APK) |
| the level curve, XP sources, SP sources | kit-lite, module shapes, gates, construction order |
| the 14 skills, caps, respec | the slice registry, `MIGRATE[7]`, localStorage keys |
| the quest chain, rewards, catch-up | the GameFeed normalizer and new-emit tables, the skill hook sites |
| daily / weekly / monthly templates and the stamp card | the HUD measurements, stack manager, shell panel, IME rules |
| 출석 / 접속 선물 / offline numbers and anti-abuse | the admin store, `Save.key()` and switch implementations |
| the happiness model and the shortage rules | the account platforms, PKCE flows, APK changes, SQL, sync table, privacy, designer clicks |
| the admin feature list, extras ranking | the `ui7` list and file budget, the test plan |

---

# Build contracts

One contract per version, for the build agent. Each one lists what to create and edit, the hook points, the tests, the
acceptance checks with numbers, and the screenshots. The plan sections above are the specification; a contract never
overrides them. Line numbers move: anchor on the function names given.

**Rules for every contract**:
- Read the plan sections named in the contract and the code they name before writing anything.
- Every new number goes in `BALANCE.v44` (§8) with a Korean comment, and through `balanceCheck.js` `V44_SPEC`.
- Every new string goes in `src/data/strings.js` (ko + en) or the module's `strings.js`; English must fit (the `setScale`
  shrink rule).
- Every `localStorage` access goes through `Save.key(kind)` or the files allowed in §6.3; every access is in try/catch.
- Pure files (`model/**`, `store.js`, `SaveLock.js`, `account/{sync,pkce,code}.js`) import no Phaser, window, document or
  Date; the purity test is extended.
- Existing suites stay green (§22.2 list); `dist/artifact` ≤ 480 files; `texbudget` and `soak` inside their v4.2 limits.
- Write the build report `docs/build_reports/<version>_build.md`: what was built, every test with its numbers, every
  screenshot path, open issues, and the designer's Korean phone checklist (§22.6).
- Screenshots go to `docs/previews/screens_<version>/` (for example `screens_v431/`); each is looked at before it is
  listed. Sizes: 390×844 DPR 3 and 360×640 DPR 2; Korean unless "en" is written.
- After the build: one review round and one fix round (§24) before the version ships.

## B1. v4.3 — S1 save write guard (inside the 금방 integration)

- **Owner**: the 금방 builder, after G-P5 has landed (same function).
- **Read**: §3.1, `src/core/Save.js` (`Save.write`, `keepCopy`, `load`), `geumbang_module.md` §8 G-P5.
- **Edit**:
  - `src/core/Save.js` `write()`: before writing, read `st.getItem(key)`; if it starts with `{"v":` and the number after it
    is greater than `SAVE_VERSION`, do not write, set `Save.stale = true`, call `onStale()` once; return false.
  - `src/scenes/UI.js`: `staleSave()` shows the banner `save_stale` + button `save_reload` (reloads the page); the banner sits
    under HUD row 1, full width, 88 tall, above everything but sheets.
  - `src/data/strings.js`: `save_stale`, `save_reload` (ko + en).
- **Tests**: `tools/test/v44/save_write_guard.test.mjs` (§22.1); Playwright stale-tab run (§22.2).
- **Acceptance**:
  - a stored `{"v":8,…}` value is byte-identical after 10 s of play and 3 autosaves;
  - a stored v7 save and an empty key behave as before (the existing save suites pass unchanged);
  - the banner appears within 6 s.
- **Screenshots**: `screens_v43/stale_banner_390.png`, `stale_banner_360.png`.

## B2. v4.3.1 — 시험 도구 (save keys, 관리자, 이름, 저장 코드, 촌장 tab, single writer)

- **Owner**: one builder owns `Save.js`, `Game.js` and `UI.js` for this version. Start only when 금방's G-P1, G-P5 and
  G-P13 are merged.
- **Read**: §3.1b, §6.1, §6.3, §9.1–9.2, §17.6, §18, §19.3, §21, §22.1–22.2; `Save.js` whole; `title/progress.js`;
  `UI.js` settings (`buildPanelContent`, `buildPlayTab`, `panelFooter`); `Game.js` `build()` (the quarantine catch),
  `resetProgress()`, `update()`; `ChatPanel.js` (DOM pattern); `ResidentChat.pauseGame`.
- **Create**:
  - `src/core/SaveLock.js` (pure: storage + channel injected): `claim(id)`, `tick(now)`, `owner()`, events `lost`;
  - `src/admin/store.js` (pure): `enter()`, `exit('back' | 'delete' | 'promote')`, `restoreNormal(which)`, `isOn()`;
  - `src/admin/switches.js` (the v4.3.1 rows of §18.2), `src/admin/view/AdminPanel.js`, `src/admin/view/Ribbon.js`;
  - `src/chief/name.js` (pure validate / display / josa), `src/chief/view/NameSheet.js`, `src/data/nameBlock.js`;
  - `src/account/code.js` (pure; stream injected; both frames), `src/account/view/CodeSheet.js`.
- **Edit**:
  - `src/core/Save.js`: `Save.key(kind)` and `Save.peek()`; every `getItem` / `setItem` / `removeItem` through them
    (`load`, `write`, `clear`, `quarantine`, `keepCopy`, `ChatSave.*`); stop exporting `SAVE_KEY`, `BACKUP_KEY`,
    `BAD_KEY`, `CHAT_KEY`; local `keepChief` (`{ v, nm, seen, adm }`); Settings gains `xpFloat`, `missionToasts`,
    `shortageToast` (defaults on) for the later rows; the S1 guard keeps working per kind;
  - `src/title/progress.js`: `readProgress()` reads `Save.peek()`; the title shows `관리자 마을` in admin mode;
  - `src/scenes/UI.js`: settings tabs `[소리·화면] [놀이] [촌장]` (3 × 200), `buildChiefTab(row, Y, add)` with rows
    Y(0)–Y(3) now and Y(4)–Y(6) reserved; the version label becomes interactive (7 taps); the second-tab banner;
  - `src/scenes/Game.js`: `update()` runs its body N times for admin speed (sub-steps) and sets `time.timeScale` /
    `tweens.timeScale`; the admin flags read in `Site.start`, `Civic.choices`, `Growth.happiness`, `Economy.spend`;
  - `src/systems/Progression.js`: `forceStep(id)`, `forceAll()` (admin only);
  - letters, greetings, the ceremony banner, the office panel title, the 금방 letter and the chat prompt read
    `chief.display()` (§9.1 table) — through `src/chief/name.js`, no new globals;
  - `src/data/strings.js`, `src/data/balance.js` (`v44.name`, `v44.admin`), `src/data/balanceCheck.js`.
- **Hooks**: `UI.panelFooter` (door), `Game.resetProgress` → `Save.clear()` (now mode-safe), `Game.build` catch →
  `Save.quarantine()` (now mode-safe), `Game.update` (sub-steps), `Territory.reveal(id, true, true)`,
  `Neighbours.attach`, `Site.finish`, `Rank.ceremony`, the 금방 gate through `geumbang/ports_v4.js`.
- **Tests**: `save_keys`, `save_lock`, `admin_store`, `account_code`, `chief_name`, `slices` (`keepChief`) node suites;
  Playwright `tools/test/v43_admin.mjs`, `v43_name.mjs`, `v43_code.mjs`, `v43_tabs.mjs` (§22.2 lists every run).
- **Acceptance (numbers)**:
  - every normal-family key is byte-identical (SHA-256) after each of the 5 admin runs of §22.2, incl. 처음부터 and the
    forced build throw;
  - the grep test finds 0 save-key literals and 0 storage calls outside the allowed files;
  - name: the button tapped mid-composition keeps 3 of 3 syllables (`눈송이`); input font ≥ 16 CSS px at 360 and 390;
    the field and the button stay inside a 420-px visual viewport;
  - ×4 speed: 3 game minutes with 0 wall crossings and 0 stuck porters in the `pickup` / `nav` / `rail` checks;
  - 저장 코드: a 14 KB save round-trips with both frames; the compressed code is ≤ 8,000 characters;
  - two tabs: only one writer within 6 s; the other shows its banner;
  - settings 촌장 tab: 7 row slots, the lowest row's bottom ≥ 20 px above the footer buttons at 360×640;
  - artifact files ≤ 480 (expected ≈ 459).
- **Screenshots**: name sheet (empty, typing with the keyboard open, error), settings 촌장 tab, admin door toast, admin
  panel (top and scrolled), ribbon on the HUD, the title in admin mode, 저장 코드 export and import preview (incl. an
  `관리자 마을` preview), 보관된 마을 list, second-tab banner — each at 390×844 and 360×640, plus the admin panel and the
  name sheet in en.

## B3. v4.4 — 촌장 성장 (kit-lite, chief, skills, HUD stack, save 8)

- **Read**: D2, D7–D10, D12, D23, D28–D29, D34–D36; §2, §3.2, §4, §5, §6.1–6.2, §7, §8, §9, §10, §19.1–19.3, §20.2, §22;
  `missions_bank.md` §12 (ModuleHost), `v5_v8_plan.md` §5; `Progression.js` (`capacity`, `speedMult`, `openBench`,
  `upgrade`, `syncPads`, `stepCost`), `Tutorial.js` (the `upPads` loops), `Economy.js`, `Seller.js` (`CashPad`),
  `Growth.js` (till, rent), `TownHall`, `DepotSystem.js` (till), `Player.js` (`impact`), `Station.js`, `Register.js`,
  `Site.js` (`buildCost`, `update`), `Worker.js` (site porter capacity), `UIv4.js` (`HudV4.layout`), `UIv42.js`
  (`HudV42.layout`), `geumbang/view/GbChip.js`.
- **Create**:
  - `src/kit/{GameFeed.js, income.js, Ports.js, FakePorts.js, ModuleHost.js, slices.js, rng.js}`;
  - `src/chief/{index.js, host.js, save.js, tuning.js, strings.js}`, `src/chief/model/{xp.js, levels.js, skills.js}`,
    `src/chief/data/xp.js`, `src/chief/view/{SkillWindow.js, LvRing.js, LevelUp.js}` (NameSheet moves in);
  - `src/scenes/hud/Stack.js`, `src/scenes/panels/Shell.js`;
  - `tools/gen_ui7.py` → `assets/ui7/` (one page + json; the §20.2 v4.4 frames incl. the 13 `ui7_sk_*` icons).
- **Edit**:
  - `src/core/Save.js`: `SAVE_VERSION = 8`, `MIGRATE[7]` (§6.2), slice registry in `sanitizeSave`, the `later` side record
    on each write, the re-attach in the migration path;
  - `src/systems/Economy.js`: `tag`, `spentTotal`, `taggedTotal`; refunds tagged (`Progression.syncPads`, `openBench`,
    the debug key);
  - `gs.tills()` (in `Game.js`, reading `CashPad`s, `Growth.till`, `TownHall.tax`, `DepotSystem.till`);
  - `src/scenes/Game.js`: `this.later = new ModuleHost(…)` right after `buildV42`; `later.afterBuild()` on the first
    `update()` tick; `later.update()` after `v42.update`; `serialize()` pass-through; `moveItem` emits `chiefDrop` with
    `src`;
  - `src/systems/Progression.js`: `capacity()` / `speedMult()` read `gs.chief.value`; `openBench` makes no pads;
    `reprice()` (new);
  - `src/systems/Tutorial.js`: the gear arrow aims at the Lv ring with the v4.2 condition; `skillHint`;
  - the §7.3 call sites for the 10 talents (`Station`, `Register`, `Player`, `PickupPolicy`, `buildCost`, `Growth`
    houses / founding / ribbon, `Worker` site porter, `stepCost`, `Office` hire price, `LineUpgrades`, `Civic`
    settlers, `Neighbours` riders, `Worker` speed, `ChiefAura`, `payWholesale`, `Freight.payExports`, `DepotSystem`
    sell rate, 금방 `settle` via ports, `DogPlay` gift interval);
  - the §7.1 / §7.2 emits for XP (`Player.impact`, `Station` output, `Seller` `CashPad` collect, `VillageLife.react`,
    `Neighbours.tap`, `ResidentChat`, `DogPlay.start`, `VillageNews.answer`, `Office.hire`, `LineUpgrades.done`,
    `Freight.payExports`, `ChiefPilot.start/stop`, `OfficePanel.show`, `HudV4.openRank/openOrders`);
  - `UIv4.js` / `UIv42.js` / `GbChip.js`: positions come from `Stack.js`; `UI.js` row 1 per §19.1 (coin pill +78);
  - settings 촌장 tab row Y(4) `경험치 숫자`;
  - `src/data/balance.js` (`v44.income`, `v44.chief`, `v44.skills`, `v44.respec`), `balanceCheck.js`, `strings.js`;
  - `tools/build/build_artifact.mjs`: ship `assets/ui7`.
- **Tests**: `kit_feed`, `kit_income`, `chief`, `chief_migrate`, `slices`, `balance`, `purity` node suites;
  Playwright `v44_chief.mjs` (Lv ring, skill window, learn gear for coins, learn a talent, respec, the arrow), the HUD
  overlap checker; bots §22.4 with the v4.2 baseline re-measured first; save fuzz §22.3 (v4.4 part).
- **Acceptance (numbers)**:
  - `capacity()` / `speedMult()` identical for every fixture and 1,000 fuzzed v7 saves; coins = before + refunds;
    +2 SP exactly once;
  - income meter: hoarded vs collected till → same `I` within 2 %; `I > 0` on the first tick after any load;
  - pacing medians (5 seeded runs each) for `eager`, `bagfirst` and arrow-only: village complete and 읍 within ±5 % of the
    v4.2 medians; longest wait ≤ 3.8 min; `none` reaches 읍 ≤ +25 %;
  - the arrow-only bot buys bag rank 1 within 30 s of the v4.2 arrow-only bot's median;
  - XP audit: Lv at 30 min of play 6–9; the warehouse loop ≤ 5 XP / min;
  - HUD: 0 overlaps on every audited frame at 360×640 and 390×844; every hit area ≥ 88; stack folds to 3 / 4 rows;
  - the side record re-attaches: a v7 overwrite of a v8 save with the same `cid` keeps level, SP and skills;
  - frame time: `later.update` ≤ 0.15 ms median at 60 residents; artifact ≤ 480 (expected ≈ 461).
- **Screenshots**: HUD at minute 1 (Lv ring + coin pill), the arrow on the ring, the skill window (each of the 4 tabs, a
  locked gear card, a learnable card, a maxed card), the learn confirm, the level-up banner, the respec sheet, the left
  stack with 금방 chip and the `＋n` fold at 360×640, an old v4.2 save after migration (refund toast) — both sizes; the
  skill window in en.

## B4. v4.4.1 — 이야기 (chain, catch-up, 수첩, 우편함 + 보관함)

- **Read**: D3–D4, D31–D33; §4 facts, §11, §14, §19.1–19.3, §22; `src/missions/**` (host, index, model, data, view),
  `missions_bank.md` §4 and §12, `Progression.nextGoal`, `Navigator.js` (`wanted`, `next`), `Game.tryBuild`,
  `VillageNews.js`, `Office.js` (`ROLES`, `hired`), `geumbang/model/GbModel.js` (`state()`, `serialize()`).
- **First**: make the §22.3 v4.2 fixtures (Ch1, Ch2, 25 min, Ch5, Ch6) with the bots and commit them **before** writing
  `data/chain.js`.
- **Create**:
  - `src/missions/model/chain.js`, `src/missions/data/chain.js` (68 quests + 8 side quests, `passive`, classes),
    `src/missions/view/{ChainTab.js, QuestChip.js}`;
  - `src/rewards/{index.js, host.js, save.js, tuning.js, strings.js}`, `src/rewards/model/{mail.js, inventory.js}`,
    `src/rewards/view/{Mailbox.js, Inventory.js, GiftSpots.js}`;
  - `WORLD.v44.giftSpots` in `src/data/world.js` (20 spots with a `rank` each) + `tools/test/v44_layout.mjs`.
- **Edit**:
  - `src/missions/host.js` / `index.js`: sub-gates; `v5Parts` removes board, requests, events, fame, craft, followers and
    their `prefetch`; facts `gb:*`, `gbDelivered`, `gbUpgrades`, `staff:*`, `newsAnswered`, `any(…)`;
  - `src/missions/data/catalog.js`: G1 / G2 unlock `['v5']`;
  - `src/systems/Navigator.js`: `guideTo({ x, y, label, icon, ttl, src })`;
  - `src/systems/Tutorial.js`: `chainCovers()` hides "다음 목표" except for passive quests; idle fallback `chainFocus()`;
  - `src/scenes/Game.js` `tryBuild(site, bkey)`: `rewards.useCoupon(bkey)`;
  - `src/chief/*`: level coupons every 10 levels; quest XP / SP;
  - `UI.js` row 1: 우편함 at 420; `Stack.js`: the quest chip in slot 1;
  - `src/data/strings.js` (`q_*`, `ch_*`, `mail_*`, `inv_*`, `cp_*`, `q_wait`), `balance.js` (`v44.quests`,
    `v44.mail`, `v44.inv`, `v44.giftSpots`).
- **Tests**: `chain`, `catchup`, `missions` (+), `inventory` node suites; Playwright `v44_chain.mjs` (Chapter 1 by touch,
  claim, auto-claim to mail, 보관함 place / put away), the quest audit and catch-up audit bots.
- **Acceptance (numbers)**:
  - the four catch-up fixtures give exactly the §11.6 table (frontier, quests, XP, Lv, SP); a reload runs no second
    catch-up;
  - every counted signal in `data/chain.js` passes the repeatable check; 0 objectives on one-time events;
  - the arrow-only bot: Ch1–Ch5 with 0 stuck quests; every quest within its chapter window × 2; "다음 목표" visible during
    each of the six passive quests;
  - with `v5Parts: false` and a real 읍 save in the real game: 0 board / request objects, 0 calls to `env.people`, 0
    errors in 30 game minutes, G1 / G2 never drawn in 500 seeded draws;
  - mailbox: 25 rows pushed → 20 kept, 5 auto-claimed, sums equal; 보관함: 365 simulated days of maximum gifts drop 0
    items; `rewards` slice ≤ 1,536 B;
  - pacing medians still inside the B3 gates (quest coins included);
  - XP audit: Lv at 30 min of play 9–13; artifact ≤ 480.
- **Screenshots**: the quest chip (normal, progress, ✓ 받기, passive `그동안: …`), the chapter-end banner, 수첩 이야기 tab
  (current card with the resident line, 끝낸 이야기 folded, 곁가지), the 길 안내 dot, the 그동안의 이야기 card for the 읍
  fixture, 우편함 and 보관함 tabs, the gift-spot picker, a placed gift and its 치우기 — both sizes; 수첩 in en.

## B5. v4.5 — 매일의 즐거움 (calendar, 출석, 접속 선물, 쉬는 동안, 금고)

- **Read**: D5, D29–D30; §12, §13, §8 (`v44.missions`, `attend`, `gifts`, `offline`), §22.1 `rewards`, §22.4 reward share;
  `src/missions/model/calendar.js` (`streakDay`, keys), `catalog.js`, `Register.js` (`chief`), the 금방 / office facts.
- **Create**: `src/rewards/model/{attend.js, gifts.js, offline.js}`, `src/rewards/view/{AttendSheet.js, GiftBox.js,
  OfflineSheet.js}`; the 수첩 tabs 오늘 · 이번 주 · 이달 · 출석; the `ui7` v4.5 frames.
- **Edit**:
  - `src/missions/model/calendar.js`: gate `any(step:hire_farmer, q:q211)`, tiers, eligibility (`need` re-checked each
    minute, free swap), monthly key + stamp card (`mo`), streak halves, reroll;
  - `src/missions/data/catalog.js`: F13–F26, G7–G11, the F1–F12 changes (§12.3);
  - facts `reg:self`, `plot:free`, `letter:due`;
  - the day check (load, `visibilitychange` → visible, day-key change) in the rewards host;
  - the skill 든든한 금고 (`skills.version` → 2: one free respec);
  - settings 촌장 tab row Y(5) `미션 알림`; HUD gift box at 524;
  - `balance.js` (`v44.missions`, `attend`, `gifts`, `offline`, `skills.vault`), `strings.js` (`att_*`, `gift_*`, `off_*`).
- **Tests**: `rewards`, `missions` (+) node suites (clock back / ahead, 05:00 rollover, daily credit across 1 × 30 /
  3 × 10 / 6 × 5, split at 05:00, eligibility on tier fixtures); Playwright `v45_daily.mjs` (sheet, box, offline sheet,
  visibility day check with a mocked clock); reward-share bot.
- **Acceptance (numbers)**:
  - reward shares at 30 min a day for 1 × 30, 3 × 10 and 6 × 5 sessions: calendar + attendance + gifts ≤ 22 %, offline
    ≤ 24 % (≤ 50 % with 금고 r2), quests ≤ 6 % per chapter;
  - clock back 3 days → 0 check-ins and 0 offline coins; clock ahead 2 days then back → those days used up, no double;
  - an open tab across 05:00 rolls dailies, attendance and gifts within 60 s;
  - every template drawn at each tier fixture is doable (0 failures in 1,000 draws per tier);
  - day-1 attendance after a load pays `0.5 × I` (not the floor) when `I > floor`;
  - `--skills none` bot sees dailies by `hire_farmer`; artifact ≤ 480.
- **Screenshots**: 출석 sheet (day 1, day 7, board at 7 / 28), the gift box (filling, ready, open), the offline sheet
  (normal, `오늘 몫은 다 받았어요`, 소복이 variant), 수첩 오늘 · 이번 주 · 이달 tabs, the `오늘 2/3` mini-pill — both sizes;
  출석 sheet in en.

## B6. v4.6 — 행복한 주민 · 지역 자원 (+ 관찰력, 도감, 업적, 사진)

- **Read**: D13, D34; §15, §16, §3.4, §20.2 (v4.6 frames), §22; `StockLedger.js`, `OfficePanel.js` (재고 tab),
  `VillageLife.js`, `Civic.js`, `Growth.happiness`, `Navigator.js`, `tools/apk/android/**` (`MainActivity.java`),
  `docs/build_reports/apk.md`.
- **Create**: `src/insight/**` (§4), `src/album/**`, `src/insight/view/LedgerRows.js` (shared with the office 재고 tab);
  APK `saveFile(name, base64)` `@JavascriptInterface` (MediaStore) + its Java test.
- **Edit**: the popBox / rank chip open the 마을 panel; the overview `[마을 보기 | 자원 지도]` toggle; resident card face +
  needs; `Civic` settlers formula (§15.4) with `insight.settlersFrom`; `TownHall` tax factor; `Worker` happy bonus;
  `Neighbours` riders; settings 촌장 tab row Y(6) `부족 알림`; skill 관찰력 (`skills.version` → 3); `balance.js`
  (`v44.insight`, `region`), `strings.js` (`hp_*`, `rs_*`). **Do not** change `Growth.happiness()` or `rank[2]`.
- **Tests**: `insight` (needs, floors, why-chain order, TOP 3 sort), `album`, purity; Playwright `v46_village.mjs`
  (panel tabs, pins, 해결하러 가기 routes, photo mode); APK `validate_apk.py` (bridge present, permissions unchanged).
- **Acceptance (numbers)**:
  - panel cost ≤ 0.05 ms per tick at 60 residents; 0 rebuilds per tick while open;
  - TOP 3 `해결하러 가기` reaches the fix target in ≤ 60 s of bot walking in 10 of 10 seeded shortages;
  - the 읍 median (5 seeded runs) within ±5 % of B3's; the 읍 bar value equals `Growth.happiness()` on every audited frame;
  - a neglected village's resident mean stays ≥ 45; a new village with food and homes 65–75;
  - photo saved in the artifact (`downloads`) and in the APK (file appears in the gallery); artifact ≤ 480.
- **Screenshots**: 마을 panel (등급 · 행복 · 자원 · 통계), TOP 3 with 해결하러 가기, 자원 지도 pins, a resident card (happy
  and sad), a sad bubble, 도감 page, photo mode with the polaroid frame — both sizes; the 자원 tab in en.

## B7. Login track (parallel; starts after the designer's §25 steps 1–2)

- **Read**: D21–D22; §17 whole; §22.5; `tools/apk/**`, `docs/build_reports/apk.md`, `tools/build/README.md` §2.
- **Create**: `src/account/{config.js, platform.js, pkce.js, auth.js, rest.js, sync.js, outbox.js}`,
  `src/account/view/{AccountTab.js, ConflictSheet.js, TitleLink.js}`; `tools/apk/android/java/…/DeepLink.java` + test;
  `frost-village/privacy.html` (ko + en), `frost-village/auth.html` (the off-by-default bounce page);
  `tools/test/account/mock_supabase.mjs`; the Supabase migration (§17.5) applied with `apply_migration` after the
  designer's OK, then `get_advisors`.
- **Edit**: `AndroidManifest.xml` (intent filter + `<queries>`), `MainActivity.java` (`onNewIntent`, `deliver`, Custom Tab
  for `*.supabase.co/auth/v1/authorize`), `build_apk.py` (`--supabase-ref`), `validate_apk.py`; settings tab 4 `계정`
  (4 × 168) with `cloudAuto`; the title link; `main.js` (`?code=` before Phaser boots).
- **Tests**: `pkce`, `sync` (the §17.7 table exhaustively), mock Supabase runs (Pages, APK mode), Java `DeepLink` hostile
  inputs, SQL two-user test incl. the first-insert race, `get_advisors` clean.
- **Acceptance (numbers)**:
  - every §17.7 row has a passing test; admin mode never pushes (0 requests while the flag is set);
  - two parallel first pushes → exactly one `ok` and one `conflict`, 0 errors;
  - user B reads 0 rows of user A; `delete_me` removes the user's rows and signs out locally;
  - offline play for 10 min then online → one push within 30 s; play never blocks on the network;
  - APK permissions are still only VIBRATE + INTERNET; no secret key anywhere in the repo, the APK or the artifact (grep);
  - the designer's 6-step phone checklist (§22.5) passes on her phone.
- **Screenshots**: settings 계정 tab (signed out, signed in, offline, asleep), the first-login sheet, the conflict sheet,
  the title link — both sizes; the conflict sheet in en.
