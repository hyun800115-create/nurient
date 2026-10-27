# v4.4+ draft design: 촌장 성장 · 스킬 · 퀘스트 · 매일의 즐거움 · 주민 행복 · 지역 자원 · 관리자 모드

Status: **DRAFT** (game + economy design, 2026-10-18). It answers the designer's ten requests (verbatim at the end, §17).
No source or test file was changed. Every number here is a starting value for `balance.js`. Bots must check it after
the code exists (§15.4).

Read with: `src/systems/Progression.js`, `src/data/balance.js`, `src/missions/**` + `docs/build_reports/missions_bank.md`,
`src/systems/Rank.js`, `src/systems/Civic.js`, `src/systems/Growth.js` (happiness), `src/systems/StockLedger.js`,
`src/scenes/OfficePanel.js`, `src/systems/Tutorial.js`, `src/core/Save.js`, `docs/geumbang_plan.md`, `docs/v5_v8_plan.md`.

---

## 0. 디자이너께 (쉬운 말 요약)

**"어때? 괜찮을까?" → 네, 아주 좋아요.** 몇 가지만 다듬었어요.

- **호칭.** 게임 속 이름은 '촌장'이에요. 마을이 커지면 호칭도 커져요.
  - 마을일 때는 촌장, 읍이 되면 읍장, 서리시(v5)가 되면 시장이에요.
  - 처음 시작할 때 이름을 지어요. 예: **"눈송이 촌장님"**. 주민들은 계속 다정하게 "촌장님"이라고 불러요.
- **경험치와 레벨.** 물고기 잡기, 굽기, 손님 계산, 나르기, 짓기, 고용, 주민과 수다, 퀘스트, 미션, 출석에서 경험치가 쌓여요.
  - 하루 30분 노는 분 기준으로 이렇게 올라요.

    | 언제 | 레벨 |
    |---|---|
    | 첫날 | Lv 11 |
    | 일주일 | Lv 24 |
    | 한 달 | Lv 36 |
    | 두 달 | Lv 45 (스킬 거의 다 배움) |
    | 넉 달쯤 | Lv 60 (최고) |
- **스킬 창.** 스킬은 4갈래 14개예요: 일솜씨 · 건축 · 사람 · 지혜.
  - 가방과 신발(이동 속도)은 지도에서 빠지고 스킬 창으로 옮겨요.
  - 가방과 신발은 '장비 스킬'이에요. 예전처럼 코인이 조금 들어요(예전 발판 값 그대로). 그래야 초반 돈 흐름이 바뀌지 않아요.
  - 나머지 12개는 '재능 스킬'이에요. 스킬 포인트만 들고, 다시 배울 수도 있어요.
  - 이미 가방·신발을 산 촌장님은 그 단계 그대로 스킬 창에 들어가요. 하나도 잃지 않아요.
- **퀘스트(이야기).** 7장 67개예요. "물고기 5마리 잡기"에서 시작해 숲, 밭, 광산, 망루, 기차, 읍, 사무실, 금방까지 이어져요.
  - 지금 화면 위 화살표는 그대로 두어요. 퀘스트 칩은 '왜, 무엇을'을, 화살표는 '지금 어디로'를 알려 줘요.
  - 이미 멀리 간 저장은 지나간 퀘스트를 자동으로 끝내고 보상을 정리해 드려요. 코인은 10분 수입까지만 드려요.
- **오늘 · 이번 주 · 이달의 미션.** 이미 만들어 둔 미션 모듈에 '이달의 눈꽃 도장판'을 더해요.
  - 마을 초반부터 열려요. 지금은 읍이 된 뒤에야 열려요.
  - 새벽 5시에 바뀌어요.
- **출석 체크와 접속 보상.**
  - 출석은 7일 꾸러미와 28칸 도장판이에요. 하루 빠져도 처음으로 돌아가지 않고 그 자리에서 기다려요.
  - 접속 보상은 하루 5분, 15분, 30분 놀면 선물 상자예요.
  - 쉬는 동안 번 돈은 3시간까지, 수입의 4%만 쌓여요.
- **주민 행복도.** 주민 한 사람 한 사람이 7가지를 바라요: 먹거리, 집, 일, 가게, 꾸미기, 즐길 거리, 촌장님.
  - 행복하면 이주민이 더 오고, 세금과 일 속도가 조금 올라요.
  - 행복이 낮아도 벌은 없어요. 대신 무엇이 필요한지 말해 줘요.
- **지역 자원.** 구역마다 자원, 생산, 쓰임, 재고를 한눈에 보여 줘요. 맨 위에는 **"지금 부족한 것 3가지"**와 해결하러 가는 길 안내 버튼이 있어요.
- **관리자 모드.** 설정에서 버전 글자를 7번 누르면 열려요.
  - 지금 저장을 따로 보관하고, 관리자 마을은 따로 저장해요.
  - 화면에는 '관리자' 표시가 떠요.
  - 끝내면 원래 마을로 돌아가요.
- **추가 기능 추천.** 우편함(보상 보관함), 도감·업적, 마을 통계, 사진 모드, 저장 코드 옮기기를 추천해요.
- **버전 나누기.**

  | 버전 | 내용 |
  |---|---|
  | v4.3 | 금방 |
  | v4.4 | 촌장 성장 · 스킬 · 퀘스트 · 관리자 모드 |
  | v4.5 | 매일의 즐거움: 미션 · 출석 · 접속 보상 · 쉬는 동안 번 돈 |
  | v4.6 | 행복한 주민 · 지역 자원 · 통계 · 도감 |
  | 로그인 | 디자이너님 준비가 끝나는 대로 따로 |

---

## 1. Inputs and what was measured

### 1.1 Measured pacing (fresh game, fixed-step bots; first 20 min unchanged since v3.5 per `v42_code2.md` §3.2)

Bot runs of `review_gameplay_sim.mjs`, 2026-10-07 logs in `/tmp/fv_review/gameplay/*.json`:
- `smart5`: smart bot.
- `think2`: smart bot with 1.5 s think time and 0.8 joystick, the closest to a careful human.
- `arrow2`: arrow-only bot.

| Window (game min) | Income/min think2 · smart5 · arrow2 | Purchases per 5 min | Notes |
|---|---|---|---|
| 0–5 | 96 · 154 · 131 | 6–9 | clerk 0.3–0.6, cook 0.7–1.3, fisherman 1.4–2.1, forest 2.4–3.8 |
| 5–10 | 295 · 393 · 347 | 4–5 + **6 bench upgrades** | bag 1–3 + boots 1–2 bought here (4.7–8.7 min) |
| 10–15 | 488 · 681 · 621 | 5 + 2–3 upgrades | bag 5 at 13.0–15.5 min, boots 4 at 11.8–14.1 min |
| 15–20 | 793 · 889 · 751 | 5 + first houses | village complete 20.3–23.0 (v4.2 smart: 19.3–20.7) |
| 20–25 | 851 · 906 · 827 | 5–7 + 2–3 buildings | v3 frontier, station, first train |
| 25–35 | 806 · 893 · 918 | 8–9 | — |
| 35–50 | 762 · 709 · 858 | 6–9 | (v3.5 runs; v4 shops/rent push this to ≈ 1,800 at 읍) |

- The two map upgrades cost **1,890 coins** in all: bag 40/90/170/300/480 and boots 50/120/240/400.
- They are bought between minute 4.7 and 15.5. That is **18–30 %** of every coin earned by minute 15. Removing them as a coin sink would shift early pacing. This is why §4.3 keeps their coin price.
- Later income:

  | When | Income/min | Source |
  |---|---|---|
  | v4.2, 0–20 min | 572 | — |
  | v4.2, late village | 2,459–2,530 | `v42_code1.md` §3.3, `v42_code2.md` |
  | 읍 | ≈ 1,800 | `v5_v8_plan.md` §3.3 |
  | 도시 | ≈ 3,500 | `v5_v8_plan.md` §3.3 |
  | 큰 도시 | ≈ 11,000 | `v5_v8_plan.md` §3.3 |
- Pacing to 읍 (v4.2 smart bot):

  | Milestone | Minute |
  |---|---|
  | village complete | 20.7 |
  | station | 23.5 |
  | 5 shops | 37.4 |
  | 읍 | 46.5 |

  The longest wait was 3.8 min. The think and arrow bots run +6–12 % slower. A real casual player is ≈ ×1.4.

### 1.2 Modelled (scratch `xpmodel.mjs`, re-run when the code exists)

The XP model plays a casual player minute by minute:
- chief hand work: 60 → 45 → 30 → 22 XP/min as workers take over;
- purchases and buildings at the measured counts × 1.4 (human pace);
- quest XP spread over each chapter;
- the calendar (dailies, weekly, monthly, attendance, play gifts) at ≈ 430 XP per day of play.

Results are in §3.3.

### 1.3 Constraints that shaped the design

- **Single-player, mostly offline, cosy.**
  - No paid currency, no energy, no ads.
  - No FOMO punishment: a missed day never resets anything to zero.
  - No timer that takes things away.
- **Coins inflate.** Income goes ≈ 100/min → 2,500/min (v4.2) → 11,000/min (v8). Every coin reward is written as **minutes of current income** with a floor. This is the `missions_bank` rule: `coins = max(floor × era, round10(m × I))`. Materials are never a reward.
- **Reuse `missions_bank`.**
  - Its calendar (`src/missions/model/calendar.js`) already does dailies, weekly, streaks, forward-only day keys and the 05:00 reset.
  - This design extends it: an earlier gate, early templates, a monthly stamp card, a gentler streak.
  - It does not add a second mission system.
- **Phone first.**
  - Screens are 390×844 and 360×640, with logical UI 720 wide.
  - Panels follow `OfficePanel` (non-pausing, tap outside to close).
- **No new art needed for v4.4.** Icons come from the existing ui/ui2/ui3/ui4/ui5/pets2 atlases (§4.7). One small optional procedural page (`ui7`, ≤ 1 MiB, +2 files) can come later. The artifact is at 413 / 480 files.
- **The artifact page** may not reach Google or Supabase. Every system here works offline. Login is an add-on (§11).

---

## 2. Guardrails (apply to every section)

1. **One income meter `I`.**
   - `I` = coins earned per minute, 5-minute rolling average.
   - It counts tills, rent, tax, wholesale, exports, depot and 금방.
   - It excludes coins tagged `quest`, `mission`, `gift`, `attend`, `offline`, `loan`, `admin`.
   - `I_day` = the average over the last 30 minutes of play (used where pumping `I` before a payout would pay: offline earnings).
   - This is the kit `IncomeMeter` that `missions_bank` already expects (`ports.income.perMin()`).
2. **Era multiplier for floors.**
   - `eraMult = [0.3, 0.6, 1, 2, 3]` for: before village complete · village complete · 읍 · 도시 · 큰 도시.
   - `missions_bank`'s `payFloor 100 × era` becomes `100 × eraMult` (30 / 60 / 100 / 200 / 300).
3. **Reward budget.** Measured as a share of a 30-min/day player's play income once everything is live:

   | Source | Share |
   |---|---|
   | quests | ≤ 6 % per chapter |
   | calendar + attendance + play gifts | ≤ 22 % |
   | offline | ≤ 24 % (≤ 50 % with the max vault skill) |

   A 60-min/day player gets half these shares (most are per day, not per minute). Section 13 has the table.
4. **Skills never touch:** shelf prices, rent, tax per person, ceremony costs, quest or mission rewards. Every skill effect has a hard cap (§4.5).
5. **First-session pacing stays inside the v4.2 gates:**
   - village complete within ±5 %;
   - 읍 ≤ +5 %;
   - longest wait ≤ 3.8 min.

   Checked by the bots with a "bag first" skill policy (§15.4).
6. **Nothing is lost on migration.** Old bag/boots levels, partial payments, progress: all kept.
7. **Admin mode can never touch the normal save** unless the player explicitly keeps the admin village (§10).

---

## 3. 촌장 성장 (chief growth)

### 3.1 Name and title

- **Nickname (촌장 이름)**, asked once:
  - New game: Title → 새로 시작 → the name sheet → the village.
  - Old save: after the "새로워진 것" card. It can be skipped ("나중에" → shown as "촌장님").

  | Rule | Value |
  |---|---|
  | Length | 1–8 characters (a Hangul syllable = 1) |
  | Allowed | 한글, A–Z a–z, 0–9, inner space, `·` |
  | Trimmed | yes |
  | Blocked | a small blocklist (`src/data/nameBlock.js`, Korean + English slurs) → "다른 이름을 써 주세요" |
  | 추천 button | cycles 눈송이 · 솔방울 · 고드름 · 함박 · 포근 · 서리별 · 몽실 · 눈꽃 |
  | Rename | free, any time, from the skill window header (single-player: no reason to limit) |
  | Input | a DOM `<input>` overlay over the canvas, so phones open their keyboard (Phaser has no text input) |

- **Title by village rank** (`Rank.level`; `strings rank_title_n` already has 촌장 / 읍장):

  | Rank | Village | Title | Display |
  |---|---|---|---|
  | 1 | 서리마을 | 촌장 | 눈송이 촌장 |
  | 2 | 서리읍 | 읍장 | 눈송이 읍장 |
  | 3 | 서리시 (v5) | 시장 | 눈송이 시장 |
  | 4 | 큰 도시 (v8) | 시장 (gold badge) | 눈송이 시장 |

  Residents keep saying **"{이름} 촌장님!"** in greetings, letters and the paper (v5 plan: "그래도 다들 촌장님이라고 불러요"). Josa comes from `src/story/engine/lang/josa.js`.
- **Three ladders, three meanings** (the panels say this in one line each):

  | Ladder | Korean label | Meaning | What it unlocks |
  |---|---|---|---|
  | 촌장 레벨 (XP) | 촌장님 실력 | the chief's own skill | skill points |
  | 칭호 (fame, missions_bank) | 주민들의 믿음 | how much residents trust the chief | titles; rank 3 needs fame 400 |
  | 마을 등급 (Rank) | 마을의 크기 | the size of the village | ceremonies, the title |

  The skill window header shows all three: `Lv 12 · 눈송이 읍장 · ★★ 믿음직한` (the fame stars arrive with v5).

### 3.2 XP sources (chief only; workers never give XP)

Only the chief's own actions give XP. In 관망 (autopilot) mode all XP is **×0.25**. After 20 real minutes with no touch it is 0: the pilot naps (`촌장님이 꾸벅꾸벅 졸아요`). The village keeps earning coins either way.

| Group | Action | XP | Limit | Game event (new emit marked ✚) |
|---|---|---|---|---|
| 채집 | catch / chop / harvest / mine one item | 1 | — | ✚ `chiefGather {item, n}` from `Player` gather |
| 채집 | hunt an animal (2 meat) | 3 | — | ✚ same |
| 가공 | one product while the chief works a station spot | 1 | — | ✚ `chiefMade {station, item}` (Station when `operator` is the chief) |
| 판매 | serve one customer at a register (chief standing) | 2 | — | ✚ `sold … byChief` (P8 + flag) |
| 판매 | sell one item to the 교역소 merchant by hand | 1 | — | ✚ same |
| 판매 | a dish at the big restaurant kitchen / table | 2 | — | `restMeal` + flag |
| 나르기 | deliver items to a shelf / station input / site / order card / shop / food box | 1 per 3 items (min 1 a drop) | — | ✚ `chiefDrop {item, n, to}` |
| 나르기 | collect a till ≥ 50 coins | 2 | — | `collect` (E8) |
| 고용 | a hire / operator / porter / clerk step | 20 | — | `step` (exists) |
| 고용 | 2nd / 3rd worker, staff (restaurant, office, station porter) | 25 / 30 | — | `step`, office hire |
| 땅 | open a zone | 40 | — | `step zone_*` |
| 땅 | light a watchtower | 80 | — | `region` |
| 건축 | finish S decor | 15 | — | `built` |
| 건축 | finish a house | 30 | — | `built` |
| 건축 | finish a workshop / store / warehouse (M, L) | 60 | — | `built` |
| 건축 | finish the station | 80 | — | `built` |
| 건축 | finish a v4.2 site (office, bank, depot) | 100 | — | `built` |
| 건축 | finish the hall / big restaurant (XL), 금방 opening | 120 | — | `built` |
| 성장 | a line upgrade pad (짐꾼 2, 가공소 2단, 화물칸 크게 …) | 30 | — | v42 offers |
| 성장 | a shop opens (ribbon) | 50 | — | `v4:shopOpen` |
| 성장 | 승격식 (rank ceremony) | 500 + **2 SP** | — | `v4:rankUp` |
| 사람 | talk to a resident (chat message) | 10 | each resident once per day key, ≤ 10 a day | `chat` (E7) |
| 사람 | greet a resident (tap) | 5 | ≤ 10 a day | `tap` (P11) |
| 사람 | play with 누리 (treat / ball / pet) | 5 | ≤ 10 a day | `dogAct` (E6) |
| 사람 | answer a letter | 15 | — | letters |
| 사람 | read the morning paper | 10 | once a day | `paperRead` |
| 사람 | ride the train | 10 | ≤ 3 a day | `train ride` |
| 이야기 | quests | 20–500 | §5 | quest model |
| 미션 | daily mission | 40 | — | `daily:done` |
| 미션 | all 3 dailies | +60 | — | `daily:all` |
| 미션 | weekly stage 1 / 2 / 3 | 100 / 150 / 250 | — | `weekly:stage` |
| 미션 | monthly stamps 5 / 10 / 15 / 20 | 300 / 500 / 700 / 1,000 | — | §6.4 |
| 미션 | v5 board card / request / event | 50 / 30–60 / 80–150 | — | `mission:done` |
| 출석 | check-in days 1–7 | 30 / 30 / 40 / 40 / 50 / 60 / 100 | — | §7.1 |
| 출석 | play-time gifts 5 / 15 / 30 min | 20 / 30 / 50 | — | §7.2 |

All "a day" limits use the same day key as the dailies: the local date, with the day starting at 05:00.

### 3.3 Level curve

- XP from level L to L+1 = **`round10(180 + 10 × (L − 1)^1.65)`**.
- The cap is **Lv 60**: 192,450 XP in all.
- `BALANCE.chief.level` holds `base 180, k 10, p 1.65, max 60` with Korean comments. The curve is one formula, so the designer changes three numbers.

| Lv | XP to next | Total XP | SP so far | Casual player (30 min/day) reaches it… |
|---|---|---|---|---|
| 2 | 190 | 180 | 1 | play minute ≈ 3 |
| 3 | 210 | 370 | 2 | ≈ 5 min |
| 5 | 280 | 820 | 5 | ≈ 8 min |
| 8 | 430 | 1,790 | 8 | ≈ 18 min (village complete ≈ 28 human min) |
| 10 | 560 | 2,710 | 11 | ≈ 25 min |
| 11 | 630 | 3,270 | 12 | **end of day 1** |
| 15 | 960 | 6,250 | 17 | ≈ 55 min (읍 for a casual ≈ 65–80 min) |
| 20 | 1,470 | 12,020 | 23 | day 3–4 |
| 24 | 1,950 | 18,590 | 27 | **day 7** |
| 30 | 2,770 | 32,260 | 35 | day 16 |
| 36 | 3,710 | 51,160 | 42 | **day 30** |
| 40 | 4,400 | 67,020 | 47 | day 41 |
| 45 | 5,330 | 90,850 | 53 | **day 60**: every skill maxed with quest SP (§4.4) |
| 50 | 6,330 | 119,460 | 59 | day 75 |
| 60 | — | 192,450 | 71 | day ≈ 125 (60 min/day: day ≈ 65) |

The 60-min/day model: Lv 16 on day 1, 27 on day 7, 43 on day 30.

### 3.4 Skill points (SP)

| Source | SP | Notes |
|---|---|---|
| Each level-up | **+1** | every 5th level gives **+2** (5, 10, … 60). Lv 60 = 71 SP |
| Quest chapter ends | Ch1–Ch4 +1 each, Ch5 (읍) +2, Ch6, Ch7 +1 each | 8 by the end of 금방 |
| Rank ceremony | +2 | §3.2 |
| Monthly stamp card full (20) | +1 a month | §6.4 |
| 28-day attendance board | +1 per board | §7.1 |

Old saves get SP for their catch-up level (§5.6). Unspent SP shows as a small number badge on the Lv ring.

### 3.5 Level-up moment and HUD

- **Level-up:** `fx_levelup` + `sfx_levelup` (both exist) over the chief, then a banner `촌장 레벨 {n}!` / sub `스킬 포인트 +{sp}`. When a new skill or rank unlocks at this level, a second line follows: `새 스킬: {skill}`.
- **No coins on level-up** (inflation). Every 10 levels: a decor coupon (§12.1 우편함).
- **HUD:** the **Lv ring** sits at the left end of the coin pill.
  - Art: `ui_ring_bg` + `ui_ring_fill` (exist) show the XP progress, with "12" inside.
  - It is 56 px logical: fits 360×640 next to the coins.
  - The red SP dot shows when points are unspent. A tap opens the skill window.
  - XP floats from the chief as small `+3` numbers, at most one every 0.5 s merged, and only while the setting `경험치 숫자` is on (default on).

---

## 4. 스킬창 (skill window)

### 4.1 Shape

- **Four branches, 14 skills.**
- **2 equipment skills (장비)**: 큰 가방 and 가벼운 발걸음, the old map pads.
  - They cost SP **plus the old coin price**.
  - They are permanent: respec never touches them.
- **12 talent skills (재능)** cost SP only and can be respecced (§4.6).
- Every skill has an **unlock condition**: the system it changes must exist. Before that the card is grey with a line such as `광부를 고용하면 열려요`, so the window also teaches what comes later.
- Every rank has a **level gate** (`Lv {n}에 배울 수 있어요`), so nobody maxes one skill at Lv 5.
- Rank cost: ranks 1–3 cost 1 SP; ranks 4+ cost 2 SP. Exceptions are in the table.

### 4.2 The 14 skills (effects, exact code paths, cost)

`r` = the rank (0 = not learned). Multipliers apply at read time through one helper, `gs.chief.mod(key, base)`. BALANCE is never mutated (`balanceCheck.js` keeps checking the raw values).

#### A. 일솜씨 (the chief's own hands) — icon `ui_icon_hand`

| # | Skill (ko) | Icon | Ranks | Effect per rank (value at max) | Code path | SP per rank | Coin fee per rank | Lv gate per rank | Unlock |
|---|---|---|---|---|---|---|---|---|---|
| A1 | **큰 가방** (장비) | `ui_icon_backpack` | 6 | bag size 6 → 10 / 14 / 18 / 22 / 26 / **30** | `Progression.capacity()` reads `BALANCE.chief.skills.bag.values[r]` (ranks 1–5 = today's `BALANCE.upgrades.capacity.values`) | 1,1,1,2,2,2 (9) | 40, 90, 170, 300, 480, 2,000 | 2, 3, 4, 6, 8, 20 | start |
| A2 | **가벼운 발걸음** (장비) | `ui_icon_speed` | 4 | move speed ×1.0 → 1.15 / 1.3 / 1.45 / **1.6** | `Progression.speedMult()` reads `skills.speed.values[r]` (= `upgrades.speed.values`) | 1,1,1,2 (5) | 50, 120, 240, 400 | 2, 4, 5, 7 | start |
| A3 | **손재주** | `ui_icon_tools` | 3 | chief station speed ×(1 + 0.1r) → `labour.chiefSpeed` 1.25 → **1.625**; register pay time ×(1 − 0.1r) → `register.chiefPayTime` 0.35 → **0.245** s; gather swing interval ×(1 − 0.08r) | `Station` operate-by-chief path, `Register` chief branch, `Player` gather timer | 1,1,2 (4) | — | 3, 6, 10 | start |
| A4 | **넓은 손길** | `ui_icon_halo` | 3 | gather reach `player.gatherRange` 78 → 92 / 106 / **120** px; '멈추면' pickup wait `v42.pickup.stillS` 0.35 → **0.2** s | `Player`, `PickupPolicy` | 1,1,1 (3) | — | 4, 8, 14 | start |

Notes:
- Bag rank 6 (30) needs a visual check of the head stack (`StackBaker`, `carryScale 0.62`). If 30 looks too tall, rank 6 becomes "+4 per trip into the bag pocket": items above 26 are drawn as a small sack on the back.
- Speed stops at ×1.6 (408 px/s). The Navigator, collision steering and pad dwell timers were tuned up to this value.

#### B. 건축 (builder) — icon `ui_icon_hammer`

| # | Skill | Icon | Ranks | Effect per rank (max) | Code path | SP | Lv gate | Unlock |
|---|---|---|---|---|---|---|---|---|
| B1 | **뚝딱 건축** | `ui_icon_hammer` | 3 | build time ×(1 − 0.1r) (**−30 %**) for: plots, towers, station, v4.2 sites, carpenter houses `v4.houses.time`, shop founding `v4.founding.buildTime`, 금방 opening. r2: site porters carry `build.porterCapacity` 10 → **14**. r3: `build.builders` 2 → **3** carpenters | `Site.start` (`buildTime`), `Growth` houses / founding, Logistics site load | 1,1,2 (4) | 6, 10, 16 | first plot offered (`hire_miner`) |
| B2 | **알뜰 건축** | `ui_icon_piggy` | 4 | the **coins** of every building ×(1 − 0.05r) (**−20 %**): `BALANCE.buildings.*`, `towers.*`, `v4.station`, `v42.office/bank/depot.site`, 금방 opening pad, carpenter houses (planks only, so none) | `buildCost()` callers: `Civic.choices` (card price), the build menu, `Site` payment, tower pads | 1,1,1,2 (5) | 6, 9, 13, 18 | first plot offered |
| B3 | **꼼꼼한 설계** | `ui_icon_tools` | 2 | the **materials** (판자, 주괴) of the same sites ×(1 − 0.1r) (**−20 %**), rounded down, never below 1 where it was ≥ 1; carpenter houses `v4.houses.item_plank` 20 → 18 → **16** | `Site.start` (`need`), `Growth` houses | 1,2 (3) | 10, 18 | toolsmith built |

The ceremony (승격식) and the 금방 upgrades are never discounted. Pads and cards show the discounted price with a small `−10 %` tag.

#### C. 사람 (people) — icon `ui_icon_people`

| # | Skill | Icon | Ranks | Effect per rank (max) | Code path | SP | Lv gate | Unlock |
|---|---|---|---|---|---|---|---|---|
| C1 | **설득력** | `ui_icon_request` | 4 | hire prices ×(1 − 0.05r) (**−20 %**) for every hire / operator / raw / porter / clerk step, `hire2`, `hire3`, `costs3`, `v4.stationPorter`, `v42.stationPorter34`, `civic.restaurant.staff`, `v42.office.hire`, `v42.porter2.costs`. r3: shop-founding orders ask 10 % less (`v4.founding.shops.*.need`, ceil). r4: the order board's `v4.orders.swapAfter` 180 → 120 s and missions `swapAfter` 120 → 90 s. **Not** zones (land) or the ceremony | `stepCost()` (a lowered price refunds overpaid partials via the existing `sanePrice` / `paidBefore > price` code in `syncPads`), `Growth` cards | 1,1,1,2 (5) | 3, 7, 12, 18 | first hire done |
| C2 | **인기도** | `ui_icon_happy` | 3 | `civic.happyCap` 12 → 14 / 16 / **18**; settlers `civic.settlers.every` ÷(1 + 0.1r); fame gains (v5 missions) ×(1 + 0.05r); train visitors `v4.visitors.base` 4 → **7**; the per-resident 촌장 need +5r (§8) | `Civic.happyBonus`, `updateSettlers`, `Neighbours` riders, missions `Fame.add` | 1,1,2 (4) | 8, 12, 18 | `hire_miner` (settlers exist) |
| C3 | **리더십** | `ui_icon_cheer` | 3 | worker / porter walk speed ×(1 + 0.03r) (**+9 %**: `workers.speed`, warehouse / station porters); cheer `v42.cheer.mult` 1.1 → **1.19**, `radius` 200 → **320**, `still` 2 → 1.5 s at r2 | `Worker`, `StationPorter`, `ChiefAura` cheer | 1,1,2 (4) | 9, 14, 20 | 3 workers hired |
| C4 | **협상** | `ui_icon_delivery` | 3 | `v4.wholesale.rate` 0.7 → **0.79**; `v42.freight.exportRate` 0.5 → **0.65**; `v42.depot.sell.rate` 0.6 → **0.72**; 금방 parcel price ×(1 + 0.03r); 교역소 clerk `register.clerkTradeSlow` 1.25 → **1.1** | `Growth.payWholesale`, `Freight`, `DepotSystem`, geumbang `settle`, `Seller` trade loop | 1,1,2 (4) | 12, 16, 22 | first train arrived |

#### D. 지혜 (insight) — icon `ui_icon_binoculars`

| # | Skill | Icon | Ranks | Effect per rank | Code path | SP | Lv gate | Unlock |
|---|---|---|---|---|---|---|---|---|
| D1 | **관찰력** | `ui_icon_binoculars` | 3 | the 지역 자원 panel (§9). Without the skill it shows status dots + counts. r1: flows per minute and *why* (`빵 부족 ← 빵 짐꾼이 없어요`). r2: forecasts (`약 6분 뒤 바닥나요`) and the **해결하러 가기** button (Navigator to the fix pad / plot). r3: shortage toasts (≤ 1 per 3 min, setting-controlled) and the panel's "곧 부족" row | `RegionPanel` reading `StockLedger` | 1,1,1 (3) | 5, 10, 15 | `zone_forest` |
| D2 | **행운** | `ui_icon_heart_full` | 3 | each item the **chief** gathers has a 3r % chance (**9 %**) of +1 (a twinkle); 누리 gift chance ×(1 + 0.25r) (`dog.giftEvery` ÷); r3: the first daily mission done each day pays +50 % (`행운의 아침`) | `Player` gather, `DogPlay`, calendar host | 1,1,2 (4) | 7, 13, 20 | start |
| D3 | **든든한 금고** | `ui_icon_bank` | 2 | offline earnings cap 3 h → 4 / **5** h; rate 4 % → 5 % at r2 (§7.3); till caps ×(1 + 0.25r): `v4.rent.cap` 2,000 → 3,000, `civic.hall.taxCap` 1,500 → 2,250 | offline host, `Growth` rent, `TownHall` tax | 1,2 (3) | 15, 25 | village complete |

**Totals:**
- 46 ranks for **60 SP**.
- Level SP reaches 50 at Lv 43 and 53 at Lv 45; with the 8 quest SP and the ceremony / monthly SP, every skill is maxed around Lv 43–45 (≈ day 50–60 at 30 min a day).
- After that, levels still give +1 SP (nothing left to buy). Each extra point turns into a **명예 별** on the name plate (★ per 5 points, cosmetic).

### 4.3 Why the bag and boots keep a coin price

- The two pads are **18–30 % of all coins spent before minute 15** (§1.1).
- With SP only:
  - the first-session player keeps 1,890 coins;
  - those coins buy the next hires sooner;
  - village complete moves ≈ 1.5–2.5 min earlier (≈ −10 %): outside the ±5 % gate.
- With the old price kept as a fee (`수련비`), the early coin flow is **identical to v4.2**. The only change is that the ranks also wait for levels.
- The rank gates (Lv 2/3/4/6/8 for the bag) are set so a casual player's level arrives at about the minute the think bot bought each rank: bag 1 at 6.2, bag 3 at 8.7, bag 5 at 15.5.
- A balance switch `skills.feeOn: true` lets the designer drop the fees later.

### 4.4 Old saves: equal value

On the first load of v4.4, `MIGRATE[7]` and the chief slice init do this:
1. `progress.up.capacity = c` (0–5) → `skills.bag = c`; `progress.up.speed = s` (0–4) → `skills.speed = s`. They are marked **base ranks**: already paid in coins, so no fee is ever asked again.
2. Partial payments `progress.paid.up_capacity / up_speed` come back as coins (a toast `작업대에 냈던 코인 {n}개를 돌려드려요`).
3. The catch-up level (§5.6) gives its SP. The SP value of the base ranks (bag 1,1,1,2,2 · boots 1,1,1,2 → up to 12 SP) is **counted as already spent** from it, floored at 0.
   - The result is the same skill state a new player with the same choices would have.
   - Ranks are never taken away, even when the catch-up SP is smaller.
   - On top, a thank-you gift: **+2 SP** and a decor coupon (`개척 촌장님께 드리는 선물`).
4. The bench art (`upgrade_bench`, `WORLD.bench`) stays on the plaza as **촌장 수련대**: standing on its pad for 0.4 s opens the skill window.
   - The two upgrade pads are not created any more (`Progression.openBench` makes the diegetic pad instead).
   - `Tutorial.upgradeHint` becomes `skillHint`: once, when SP ≥ 1 and the bag is rank 0 after `hire_lumberjack`, the arrow goes to the 수련대 and the Lv ring pulses.

### 4.5 Caps that keep the economy sane

| Effect | Cap at max ranks | Expected late-game effect |
|---|---|---|
| building coins / materials | −20 % / −20 % | ≈ −8 % of all coins spent after the village is complete |
| hire prices | −20 % (never land or ceremonies) | ≈ −10 % of spend in v3–v4 |
| worker walk speed | +9 % (and with the happy-worker bonus §8.4 at most **+15 %** in all) | +3–6 % income (most lines are supply-limited, `v42_code1` §3.3) |
| wholesale / export / depot rates | +9 / +15 / +12 points | ≈ +1–2 % income (exports ≈ 1 %, depot ≈ 2 % of income) |
| luck | 9 %, chief-gathered items only | negligible after the village is complete |
| happiness cap | +6 points | settlers / visitors a little more often |
| offline | 5 h · 5 % | §7.3 |

Together, a maxed chief earns ≈ +5–9 % and spends ≈ 10–15 % less, so he progresses ≈ 15–25 % faster per minute than a Lv 1 chief at the same place. Prices from v5 on follow `I` (the v5 pricing rule: 0.8–4 min of income per purchase), so this never turns into a runaway.

### 4.6 Respec (재능 다시 배우기)

- Only talent skills (A3–A4, B, C, D). All their SP come back. Equipment (bag, boots) is never respecced.
- **The first respec is free.** After that it costs `max(300, round10(5 × I))` coins, once per day key.
- A free respec is also granted when `BALANCE.chief.skills.version` changes (a balance patch moved numbers), with the toast `스킬이 바뀌어서 한 번 무료로 다시 배울 수 있어요`.
- Not during a ceremony or the tutorial.

### 4.7 Window layout (phone, logical 720 wide; same shell as `OfficePanel`)

```
┌──────────────────────────────────────────┐
│ (Lv 12)  눈송이 읍장  ✎      스킬 포인트 3 │  ← tap ✎ = rename; ★ fame stars (v5)
│ ▓▓▓▓▓▓▓▓▓▓░░░░  다음 레벨까지 230        │
│ [일솜씨] [건축] [사람] [지혜]              │  ← ui_office_tab plates
│ ┌──────────────────────────────────────┐ │
│ │ 🎒 큰 가방      ●●●○○○  장비          │ │
│ │ 한 번에 18개 → 22개                    │ │
│ │                [배우기 · ✦2 · 300코인] │ │
│ ├──────────────────────────────────────┤ │
│ │ 👟 가벼운 발걸음 ●●●●  최고 단계        │ │
│ ├──────────────────────────────────────┤ │
│ │ ✋ 손재주       ○○○   Lv 3에 열려요     │ │
│ └──────────────────────────────────────┘ │
│        [재능 다시 배우기 (처음 1번 무료)]   │
└──────────────────────────────────────────┘
```

- Cards are 640 × 150 logical, three to four per screen, and scroll.
- Text is ≥ 22 px (the missions_bank rule is ≥ 17 px).
- A tap on 배우기 asks once: `큰 가방 4단계를 배울까요? (스킬 포인트 2 · 300코인)`. Then `fx_levelup` on the chief and a banner `큰 가방 4단계! 한 번에 22개`.

### 4.8 Strings (ko / en)

| Key | ko | en |
|---|---|---|
| `sk_title` | 촌장 스킬 | Chief skills |
| `sk_points` | 스킬 포인트 {n} | Skill points {n} |
| `sk_next` | 다음 레벨까지 {n} | {n} XP to next level |
| `sk_branch_hand` | 일솜씨 | Hands |
| `sk_branch_build` | 건축 | Building |
| `sk_branch_people` | 사람 | People |
| `sk_branch_wise` | 지혜 | Insight |
| `sk_learn` | 배우기 | Learn |
| `sk_max` | 최고 단계 | Maxed |
| `sk_gate` | Lv {n}에 배울 수 있어요 | Unlocks at Lv {n} |
| `sk_equip` | 장비 | Gear |
| `sk_respec` | 재능 다시 배우기 | Reset talents |
| `sk_respec_free` | 처음 1번 무료 | First one free |
| `sk_confirm` | {skill} {n}단계를 배울까요? | Learn {skill} rank {n}? |
| `lv_up` | 촌장 레벨 {n}! | Chief level {n}! |
| `lv_sp` | 스킬 포인트 +{n} | +{n} skill points |
| `sk_new` | 새 스킬: {skill} | New skill: {skill} |
| `name_title` | 촌장님의 이름을 지어 주세요 | Name your chief |
| `name_hint` | 1~8글자 | 1–8 characters |
| `name_suggest` | 추천 이름 | Suggest |
| `name_ok` | 이걸로 할게요 | That's me |
| `name_later` | 나중에 | Later |
| `name_bad` | 다른 이름을 써 주세요 | Please pick another name |
| `bench_name` | 촌장 수련대 | Chief's training bench |
| `sk_lock_miner` | 광부를 고용하면 열려요 | Unlocks when you hire a miner |
| `sk_lock_plot` | 첫 집터가 생기면 열려요 | Unlocks with the first plot |
| `sk_lock_train` | 첫 기차가 오면 열려요 | Unlocks with the first train |
| `sk_lock_complete` | 마을이 완성되면 열려요 | Unlocks when the village is complete |

---

## 5. 퀘스트 (main story chain)

### 5.1 Model

- **One active main quest at a time**, in a fixed order.
- A quest's objective is one of:
  - `gather` (chief) / `made` / `sold` / `traded` / `served`, from feed signals;
  - `step` (a Progression step id);
  - `built` (a building key or a family such as `house_*`);
  - `region`;
  - `flag`;
  - `count` (shops, people, happiness, rank);
  - `skill` (rank ≥ n);
  - `ui` (a panel was opened);
  - a module event (`gb:*`, `bank:*`, letters …).
- **Counters start when the quest becomes active.** Exception: state objectives (built, step, count) are checked at once, so a quest whose state already holds completes on arrival with a short delay (1.5 s, to read it).
- **Claiming:** a done quest shows ✓ and `받기` on the chip. Tapping claims the reward with a small coin / XP fly. After 20 s it auto-claims into the **우편함** (§12.1), so nothing is lost. The next quest appears at once (the claim never blocks the chain).
- **A quest whose system the build does not have yet** (`needs: 'v45'`, `'gb'`, `'v5'`) is skipped and inserted later as a side quest when that system arrives.
- **Side quests (곁가지)**: a small pool of optional quests shown under the main one in the panel: 관망 구경, 기차 타 보기, 은행 첫 저금, 사진 한 장. They never block.

### 5.2 Rewards

- **Coins** = `max(F, round10(m × I))`, with `F` and `m` per chapter (table below). On top, a **chapter bonus** from Ch5 on of `round10(1 × I)`.
- Ch1–Ch4 pay their chapter end in **SP + a decor coupon**, not coins: early coins move the first-session pacing gates.
- **XP** is fixed per quest (the lists). **SP** comes at chapter ends.
- **Decor coupons**: a free build card for that decor. The coin price is waived; materials are still needed, so no material is ever given. Coupons sit in the 우편함 until used on a plot.

| Chapter | Smart-bot minutes (human ×1.4) | Typical `I` | F | m | Coins per quest | Quest coins in the chapter ÷ income in the window |
|---|---|---|---|---|---|---|
| 1 첫 장사 | 0–3 (0–4) | 100 | 5 | 0.05 | 5 | ≈ 45 ÷ ≈ 400 = **11 %** (the first fisherman ≈ 10 s sooner) |
| 2 숲과 밭 | 3–13 (4–18) | 300–500 | 10 | 0.05 | 10–20 | ≈ 150 ÷ 5,000 = **3 %** |
| 3 광산과 사냥터 | 13–21 (18–29) | 650–900 | 20 | 0.05 | 30–40 | ≈ 330 ÷ 8,500 = **4 %** |
| 4 망루와 기찻길 | 20–30 (29–42) | 900 | 40 | 0.05 | 40–50 | ≈ 550 ÷ 11,700 = **5 %** |
| 5 서리읍으로 | 29–47 (42–66) | 900–1,800 | 60 | 0.05 | 60–90 + bonus 1 × I | ≈ 2,600 ÷ 32,000 = **8 %** |
| 6 촌장의 하루 | 읍 + 0–40 | 1,800–2,500 | 150 | 0.1 | 180–250 + bonus | ≈ 4,000 ÷ 80,000 = **5 %** |
| 7 금방 배달 | depot + 1 game day | ≈ 2,500 | 200 | 0.1 | 250 + bonus | ≈ 4,000 ÷ 75,000 = **5 %** |

### 5.3 Quest list (67 main quests; one per line)

Format: `id · 제목 — 할 일 (signal) · 몇 개 · XP · extra`. Coins follow the chapter formula in §5.2.

#### Ch1 첫 장사 — *"서리마을의 첫 가게"*
- `q101 · 바다의 선물` — 그물에서 물고기 잡기 (`chiefGather item_fish_raw`) · 5 · 20 XP
- `q102 · 지글지글 화덕` — 화덕에서 생선 굽기, 촌장님이 직접 (`chiefMade item_fish_cooked`) · 5 · 20 XP
- `q103 · 첫 손님` — 계산대에서 손님 계산해 주기 (`served`) · 3 · 25 XP
- `q104 · 첫 직원` — 판매대 점원 고용하기 (`step hire_clerk_market`) · 1 · 25 XP
- `q105 · 요리사 쿡` — 요리사 고용하기 (`step op_grill`) · 1 · 30 XP
- `q106 · 바다 사나이` — 어부 고용하기 (`step hire_fisherman`) · 1 · 30 XP
- `q107 · 생선 나르미` — 생선 짐꾼 고용하기 (`step raw_grill`) · 1 · 30 XP
- `q108 · 장사가 잘 돼요` — 구운 생선 팔기 (`sold item_fish_cooked`) · 40 · 40 XP
- `q109 · 촌장 수련` — 스킬 창에서 '큰 가방' 배우기 (`skill bag ≥ 1`; the arrow goes to the 촌장 수련대) · 1 · 40 XP · **chapter: +1 SP, 꾸미기 쿠폰 '눈사람 동상'**

#### Ch2 숲과 밭 — *"나무 냄새, 빵 냄새"*
- `q201 · 소나무 숲` — 벌목장 열기 (`step zone_forest`) · 1 · 40 XP
- `q202 · 나무꾼 촌장` — 통나무 베기, 직접 (`chiefGather item_log`) · 10 · 40 XP
- `q203 · 판자 장인` — 판자 만들기 (`made item_plank`) · 10 · 40 XP
- `q204 · 교역소 첫 거래` — 교역소에서 판자 팔기 (`traded item_plank`) · 10 · 45 XP
- `q205 · 든든한 나무꾼` — 나무꾼 고용하기 (`step hire_lumberjack`) · 1 · 50 XP
- `q206 · 가벼운 발걸음` — '가벼운 발걸음' 배우기 (`skill speed ≥ 1`) · 1 · 40 XP
- `q207 · 황금 밀밭` — 농장 열기 (`step zone_farm`) · 1 · 50 XP
- `q208 · 갓 구운 빵` — 빵 굽기 (`made item_bread`) · 15 · 50 XP
- `q209 · 밀밭 지기` — 농부 고용하기 (`step hire_farmer`) · 1 · 60 XP
- `q210 · 반가운 이웃` — 주민에게 인사하기, 서로 다른 3명 (`tap` distinct) · 3 · 50 XP · **chapter: +1 SP, 꾸미기 쿠폰 '쉼터 의자'**

#### Ch3 광산과 사냥터 — *"마을 완성!"*
- `q301 · 반짝이는 광산` — 광산 열기 (`step zone_mine`) · 1 · 60 XP
- `q302 · 광부 촌장` — 광석 캐기, 직접 (`chiefGather item_ore`) · 12 · 60 XP
- `q303 · 뜨거운 제련소` — 주괴 만들기 (`made item_ingot`) · 10 · 60 XP
- `q304 · 광산의 일꾼` — 광부 고용하기 (`step hire_miner`) · 1 · 70 XP
- `q305 · 우리 동네 첫 집` — 집 한 채 짓기 (`built house_*`) · 1 · 80 XP
- `q306 · 예쁜 마을` — 꾸미기 하나 짓기, 쿠폰도 돼요 (`built deco_*`) · 1 · 60 XP
- `q307 · 누리랑 놀기` — 누리에게 간식·공·쓰다듬기 (`dogAct`) · 1 · 50 XP
- `q308 · 사냥터` — 사냥터 열기 (`step zone_hunt`) · 1 · 70 XP
- `q309 · 훈제 향기` — 훈제 고기 만들기 (`made item_meat_cooked`) · 10 · 70 XP
- `q310 · 마을 완성!` — 사냥꾼 고용하기 (`step hire_hunter`, the existing celebration plays) · 1 · 150 XP · **chapter: +1 SP, 꾸미기 쿠폰 '가로등 한 쌍'**

#### Ch4 망루와 기찻길 — *"눈안개 너머 이웃"* (follows `GOALS` order)
- `q401 · 동쪽 망루` — 동쪽 망루에 불 켜기 (`region east`) · 1 · 90 XP
- `q402 · 서리역 고치기` — 옛 역 고치기 (`built station`) · 1 · 100 XP
- `q403 · 칙칙폭폭` — 첫 기차 맞이하기 (`flag firstTrain`) · 1 · 80 XP
- `q404 · 대장간` — 대장간 짓기 (`built toolsmith`) · 1 · 100 XP
- `q405 · 배고픈 광부` — 광부 식량 상자 채우기 (`flag fedMiners`) · 1 · 90 XP
- `q406 · 첫 가게` — 이웃 가게 하나 열기 (`count shops ≥ 1`) · 1 · 100 XP
- `q407 · 큰 식당` — 큰 식당 짓기 (`built big_restaurant`) · 1 · 120 XP
- `q408 · 도끼 든 나무꾼` — 두 번째 나무꾼 (`step hire2_lumberjack`) · 1 · 100 XP
- `q409 · 솔방울 마을 나들이` — 이웃 촌장님 초대에 가 보기 (`flag townVisit`) · 1 · 100 XP
- `q410 · 보트 창고` — 보트 창고 짓기 (`built boathouse`) · 1 · 100 XP
- `q411 · 노 젓는 배` — 나룻배 사기 (`step boat_rowboat`) · 1 · 100 XP
- `q412 · 가게 거리` — 이웃 가게 3곳 (`count shops ≥ 3`) · 3 · 120 XP · **chapter: +1 SP, 큰 꾸미기 쿠폰 '놀이터'**

#### Ch5 서리읍으로 — *"마을에서 읍으로"*
- `q501 · 남쪽 망루` — 남쪽 들판 열기 (`region south`) · 1 · 120 XP
- `q502 · 창고` — 창고 짓기 (`built warehouse`) · 1 · 120 XP
- `q503 · 통조림 공장` — 통조림 공장 짓기 (`built cannery`) · 1 · 130 XP
- `q504 · 반짝 통조림` — 통조림 만들기 (`made item_can`) · 20 · 120 XP
- `q505 · 잡화점` — 잡화점 열기 (`built store`) · 1 · 140 XP
- `q506 · 동남쪽 언덕` — 동남쪽 망루 (`region se`) · 1 · 150 XP
- `q507 · 큰 배` — 어선 띄우기 (`step boat_fishing`) · 1 · 150 XP
- `q508 · 가게 다섯` — 이웃 가게 5곳 (`count shops ≥ 5`) · 5 · 160 XP
- `q509 · 마을회관` — 마을회관 짓기 (`built town_hall`) · 1 · 180 XP
- `q510 · 북적북적` — 주민 45명 (`count people ≥ 45`; the panel also shows 행복 80) · 45 · 180 XP
- `q511 · 서리읍!` — 승격식 (`count rank ≥ 2`) · 1 · 300 XP · **chapter: +2 SP, 큰 꾸미기 쿠폰 '분수 공원', coins 1 × I, title 읍장**

#### Ch6 촌장의 하루 — *"사무실과 은행"* (v4.2, `Tutorial.v42Goal` order)
- `q601 · 촌장 사무실` — 사무실 짓기 (`built chief_office`) · 1 · 160 XP
- `q602 · 셈이` — 재고 담당 셈이 고용 (`office hire sem`) · 1 · 160 XP
- `q603 · 재고판` — 사무실 재고판 열어 보기 (`ui officeStock`) · 1 · 120 XP
- `q604 · 소복이` — 소식 담당 소복이 고용 (`office hire bok`) · 1 · 160 XP
- `q605 · 답장` — 편지에 답장하기 (`letter reply`) · 1 · 140 XP
- `q606 · 딸랑이` — 수금원 딸랑이 고용 (`office hire ttal`) · 1 · 180 XP
- `q607 · 서리 은행` — 은행 짓기 (`built bank42`) · 1 · 200 XP
- `q608 · 서리 물류창고` — 물류창고 짓기 (`built depot42`) · 1 · 220 XP
- `q609 · 기차 수출` — 기차로 상자 보내기 (`freight exported`) · 50 · 200 XP · **chapter: +1 SP, coins 1 × I, decor coupon '랜턴 줄'**

#### Ch7 금방 배달 — *"방금 시키면 금방"* (`needs: gb`)
- `q701 · 정 할머니의 편지` — 금방 편지 읽기 (`gb:letter`) · 1 · 200 XP
- `q702 · 금방 개업` — 금방 문 열기 (`gb:open`) · 1 · 300 XP
- `q703 · 첫 배달` — 첫 배달 따라가 보기 (`gb:firstDone`) · 1 · 200 XP
- `q704 · 진짜 금방이네` — 금방 배달 (`gb:delivered`) · 30 · 250 XP
- `q705 · 더 빨리` — 금방 업그레이드 하나 (포장대 2단·밴 2 …) (`gb:upgrade`) · 1 · 250 XP
- `q706 · 오늘의 특가` — 특가 한 번 걸기 (`gb:deal`) · 1 · 200 XP · **chapter: +1 SP, coins 1 × I**

#### Later chapters (placeholders; written when each version ships)
- **Ch8 생활과 미션 (v5):** 첫 게시판 미션 · 첫 부탁 · 버스가 온다 · 첫 결혼식 · 신문 1면 · 아기 이름 · 명성 400 · **서리시 승격식 (시장)**.
- **Ch9 갈매기 항구 (v6):** 동쪽 철길 잇기 · 첫 여객선 · 경매 · 수출 200 · 항구 ★2.
- **Ch10 햇살 해변 (v7):** 해변역 · 해변 가게 7곳 · 호텔 · 수영장 · 해변 ★3.
- **Ch11 살아 있는 도시 (v8):** 물류 센터 · 가구 · 소방서 · 안심 90 % · **큰 도시**.

**Side quests (not counted in the 67):**

| Id | Title | What to do |
|---|---|---|
| s01 | 관망 구경 | watch 관망 for a game hour |
| s02 | 기차 여행 | ride the train once |
| s03 | 첫 저금 | deposit 500 at the bank |
| s04 | 누리 단짝 | 누리 affection 75 |
| s05 | 단골손님 | 3 regulars ★ |
| s06 | 사진 한 장 | photo mode, v4.6 |
| s07 | 오늘의 미션 | finish a daily, v4.5 (it becomes main `q311` when v4.5 ships) |
| s08 | 출석 체크 | check in once, v4.5 |

### 5.4 How quests guide new players (merge with the tutorial)

The `Tutorial` arrow engine stays exactly as it is. The bots (`arrowonly`, `pure-arrow`) prove a player who only follows it finishes every chapter. Quests add *why* and *what next*, and replace the "다음 목표" text.

| Element | Before (v4.2) | After (v4.4) |
|---|---|---|
| Arrow + edge marker | `Tutorial.evaluate` priority chain | unchanged |
| Hint text (immediate action: `가방이 꽉 찼어요 → 화덕으로`) | `Tutorial.textKey` | unchanged |
| "다음 목표" text (`obj_next`, `goalText()`, `v42Goal`) | hint bar | **hidden**: the quest chip says it |
| Quest chip | — | **new**, top-left under the coin pill (same slot rules as the missions chip: 78 px lower while v4's order chip shows): `[ui_icon_goal] 바다의 선물 · 물고기 3/5` + a 4 px bar; it pulses on progress |
| Tap on the chip | — | opens the quest panel (tabs 이야기 · 오늘 · 이번 주 · 이달 · 출석, the last three from v4.5); a long-press or the panel's `길 안내` button shows Navigator dots to the quest target for 15 s |

- **First loop (Ch1):** the quest texts mirror the first-loop objectives one to one (`obj_fish` ↔ q101, `obj_grill` ↔ q102 …). The hint text is suppressed while it says the same as the chip, so the phone never shows the same sentence twice.
- **Idle hint (3 s still):** after the existing idle hints, a new last fallback points at the quest target (`quest.focusTarget()`), the same way P30 adds the missions focus.
- **Reward moment:** ✓ stamp, chip flips to `받기`, coins and XP fly to the HUD, `sfx_unlock`. A chapter end gets a full banner `1장 '첫 장사' 끝!` with its SP and coupon, then the next chapter's title card (2 s, skippable).

### 5.5 Quest panel (이야기 tab)

- Chapter ribbon at the top.
- Then the current quest card: picture icon, title, the line spoken by a resident, progress, reward.
- Then the finished quests of the chapter, folded.
- Then side quests.
- The previous chapters can be read as a short "story so far" (the quest titles in order).

### 5.6 Existing saves already far along (catch-up)

On the first v4.4 load:
1. Evaluate every quest's **state condition** against the save (steps done, buildings, regions, flags, shop / people / rank counts).
   - A quest with a counted objective (`gather`, `made`, `sold` …) counts as done when **any later quest of the same chapter, or any later chapter, is done**.
   - Skill quests (q109, q206) count as done when the migrated rank is ≥ 1.
2. Every quest before the first not-done one auto-completes, silently.
3. **Rewards:**

   | Reward | Rule |
   |---|---|
   | XP | quest XP × **2**. The ×2 stands for the work XP those minutes would have given: a 읍 save gets ≈ 9,000 XP = **Lv 17**; a new player reaches 읍 at Lv ≈ 15–17 |
   | Chapter SP | 100 % |
   | Coupons | 100 %, sent to the 우편함 |
   | Coins | Σ of their formulas at today's `I`, **capped at 10 × I** (≈ 18,000 at 읍, ≈ 25,000 late v4.2) |
4. One summary card, `그동안의 이야기`: `퀘스트 50개 완료 · 촌장 Lv 17 · 스킬 포인트 9 (+2 선물) · 코인 18,000 · 꾸미기 쿠폰 5장 — 우편함에 넣어 두었어요`. Then the skill window opens on the SP.
5. The chain continues from the first not-done quest (for most v4.2 saves somewhere in Ch5 or Ch6).

---

## 6. 일일 · 주간 · 월간 임무 (extend `missions_bank`)

### 6.1 What changes in `missions_bank`

- **Split the gate.** Today `MISSIONS_MODULE.gate` = 읍 for the whole module.
  - New gate for the calendar part (오늘 / 이번 주 / 이달 / streak): **quest q210 done** (end of Ch2, ≈ 13–18 human minutes).
  - The board, the request bubbles, events and fame keep 읍 / v5.
  - Implementation: `calendarGate` in the module entry; `Calendar` already lives apart from `Missions`.
- **Early templates.** `unlock` uses progress facts (`step:zone_forest`, `b:toolsmith`, `f:firstTrain`, `gb`), not only `rank:2`.
- **Tiered counts.** A template's `n` may be `[t0, t1, t2, t3]` for the tiers: before complete · complete → 읍 · 읍 · 도시+. The existing F1–F12 keep their single `n` as the 읍 value.
- **Pay floors** use `eraMult` (§2).
- **Gentler streak.** A missed day **halves** the streak (`n → ceil(n / 2)`) instead of resetting it to 1. The weekly 눈사람 방패 stays. The 7-day reward loop runs on `((n − 1) % 7) + 1` as now.
- **Monthly stamp card**, `이달의 눈꽃 도장판` (§6.4): a new `mo` block in the missions slice (+≈ 40 B).

### 6.2 Counts, resets, rewards

| | 오늘의 미션 (daily) | 이번 주 목표 (weekly) | 이달의 눈꽃 도장판 (monthly) |
|---|---|---|---|
| How many | 3 drawn per day (seeded by save seed + day key, the same 3 after a reload) | 1 goal with 3 stages | 1 card, 20 stamps, milestones 5 / 10 / 15 / 20 |
| Reset | **05:00 local**, forward-only keys (`calendarKeys.dayKey`) | Monday 05:00 | the 1st of the month 05:00 (`monthKey` = y × 12 + m from the day key) |
| Coins | each `0.5 × I`; all three +`1.0 × I` (floor 100 × eraMult) | stages `2 / 3 / 5 × I` | milestones `2 / 3 / 4 / 6 × I` |
| XP | 40 each, all +60 | 100 / 150 / 250 | 300 / 500 / 700 / 1,000 |
| Extra | streak rewards (missions_bank H1, softened) | stage 3: that week's decor (rotation exists) | 10: decor coupon of the month; 20: **+1 SP**, badge `이달의 촌장` (1 month) |
| Missed | nothing lost; tomorrow draws new ones | progress stays all week | stamps stay all month; a new card starts on the 1st |

One reroll a day (`다른 미션`) per daily slot that has had no progress for 2 min (missions_bank `swapAfter`). With 행운 r3, the first daily of the day pays +50 %.

### 6.3 Templates (26 daily + 11 weekly; 14 + 5 new)

**New daily templates (F13–F26):**

| Code | 제목 | Signal | n by tier [0, 1, 2, 3] | Unlock |
|---|---|---|---|---|
| F13 | 그물 한가득: 촌장님이 물고기 잡기 | `chiefGather:item_fish_raw` | 20 / 30 / 40 / 50 | start (calendar gate) |
| F14 | 나무꾼의 하루: 통나무 베기 | `chiefGather:item_log` | 15 / 25 / 35 / 45 | `step:zone_forest` |
| F15 | 생선구이 장사 | `sold:item_fish_cooked` | 40 / 80 / 150 / 250 | start |
| F16 | 빵 굽는 날 | `made:item_bread` | 20 / 40 / 80 / 120 | `step:zone_farm` |
| F17 | 교역의 날: 교역소에서 팔기 | `traded:*` | 20 / 40 / 80 / 120 | `step:zone_forest` |
| F18 | 계산대 지킴이: 직접 계산하기 | `served` | 10 / 20 / 30 / 40 | start |
| F19 | 든든한 광부: 식량 상자 채우기 | `food:*` | 10 / 20 / 30 / 40 | `b:toolsmith` (food box on) |
| F20 | 통조림 공장 | `made:item_can` | — / 20 / 40 / 60 | `b:cannery` |
| F21 | 일꾼 응원하기 | `cheer` | — / 3 / 5 / 8 | village complete |
| F22 | 새 꾸미기 하나 | `built:deco_*` | 1 / 1 / 1 / 1 (weight 1) | `step:hire_miner` |
| F23 | 큰 식당 정식 | `combo` | — / 5 / 8 / 12 | `b:big_restaurant` |
| F24 | 편지 답장 | `letterReply` | — / — / 1 / 1 | office 소복이 |
| F25 | 금방 배달 | `gb:delivered` | — / — / 15 / 30 | `gb` |
| F26 | 관망 구경: 게임 시간 2시간 | `pilotWatch` (50 s) | — / 1 / 1 / 1 (weight 1) | village complete |

**Existing daily templates (F1–F12, missions_bank)** now take tiered `n`:
- F1 손님 [30, 60, 60, 120];
- F8 기차 손님 [—, 15, 30, 50] (unlock `f:firstTrain` instead of `rank:2`);
- F5 수다 3 and F4 누리 open at the calendar gate;
- the rest unchanged (F3, F6, F7, F9–F12).

**New weekly templates (G7–G11):**

| Code | 제목 | Signal | Stages (× tier factor 1 / 1.5 / 2 / 3) | Unlock |
|---|---|---|---|---|
| G7 | 부지런한 촌장 | `chiefGather:*` | 150 / 300 / 600 | calendar gate |
| G8 | 장사의 신 | `cust` | 300 / 800 / 1,500 | village complete |
| G9 | 마을 건축가 | `built` | 2 / 4 / 7 | `step:hire_miner` |
| G10 | 단골 손님 | `visitor` | 60 / 150 / 300 | `f:firstTrain` |
| G11 | 금방 주간 | `gb:delivered` | 40 / 100 / 200 | `gb` |

The existing G1–G6 keep their unlocks (G1–G3 at 읍 / life, G4–G6 at v6–v8). The week's goal rotates over the eligible list (`calendar.check`).

New signals needed (the GameFeed map in `signals.js` gets one line each):
- `chiefGather`, `served`, `food`, `cheer`, `letterReply`, `pilotWatch`, `gb:delivered`;
- the `built` family `built:deco_*` / `built:*`.

### 6.4 이달의 눈꽃 도장판 (monthly stamp card)

| Stamp source | Stamps |
|---|---|
| all three dailies done | 1 a day |
| a weekly stage | 1 each (≤ 3 a week) |
| attendance day 7 of a loop | 1 |
| a quest chapter finished | 1 |

- A month can give up to ≈ 30 + 12 + 4 + 1. **20 stamps take about 12 active days** (3–4 days a week) for a casual player.
- Panel: a 4 × 5 grid of snowflake stamps (`ui_icon_calendar` / ui3 card art). Milestone rewards hang on the right, and the month's decor is previewed.
- Decor rotation (existing art only): igloo · lantern_string · kids_swing · snow_fort · wedding_arch · flower_stand, then repeat.

### 6.5 Catch-up rules

- Missing days costs nothing except that day's three dailies.
- The streak halves instead of resetting (§6.1).
- A phone clock moved backward never re-rolls or double-counts (missions_bank's forward-only keys). A clock moved forward only plays future days early: those days are then used up.
- An open tab rolls over at 05:00 on its own (missions_bank H-2 fix).

---

## 7. 출석 체크 · 접속 보상 · 오프라인 정산

### 7.1 출석 체크 (attendance)

- **When:** the first time the game runs on a new day key (05:00 reset), after the title. A small sheet `출석 체크` shows the 7-day strip and the 28-day board, with one big `받기` button. It is never forced: closing it keeps the check-in in the 우편함.
- **What counts:** check-in days, **not consecutive days**. Missing a day pauses the strip; nothing resets.
- **7-day strip (repeats):**

  | Day | Gift | XP |
  |---|---|---|
  | 1 | coins `0.5 × I` (floor 30 × eraMult) | 30 |
  | 2 | 누리 간식 ×3 (`dog.treats`, cap 3) | 30 |
  | 3 | coins `1 × I` | 40 |
  | 4 | 작은 꾸미기 쿠폰 (snowman / bench / lamp, rotating) | 40 |
  | 5 | coins `1 × I` | 50 |
  | 6 | 반짝 후광: the gold halo variant of `ChiefAura` for one real day (cosmetic) | 60 |
  | 7 | coins `2 × I` + a monthly stamp | 100 |

  Per week: 4.5 min of income, 350 XP, 2 cosmetic / decor gifts.
- **28-day board** (cumulative check-ins; boards cycle with new decor):

  | Check-ins | Board 1 | Board 2 | Board 3 |
  |---|---|---|---|
  | 7 | coupon igloo | coupon kids_swing | coupon flower_stand |
  | 14 | `3 × I` + 200 XP | same | same |
  | 21 | coupon lantern_string | coupon snow_fort | coupon wedding_arch |
  | 28 | **+1 SP**, 500 XP, badge `개근 촌장` (the name plate shows a small stamp for 28 days) | same | same |

- **Anti-abuse (single-player, so gentle):**
  - One check-in per day key; keys only move forward (the stored `last` is the highest key seen).
  - A clock moved backward gives nothing. A clock moved ahead plays those days early; when the real calendar reaches them, they are already used.
  - When signed in (§11), the check-in uses the server's date when it is reachable (`select now()`). Otherwise the device date.
  - Admin saves keep their own attendance (§10).

### 7.2 접속 보상 (play-time gifts)

- Three gift boxes a day for **active** play time today: 5, 15 and 30 minutes.
  - Active means a touch in the last 60 s, or a panel open.
  - 관망 time counts half.
- Rewards:

  | Minute | Coins | XP |
  |---|---|---|
  | 5 | `0.25 × I` | 20 |
  | 15 | `0.5 × I` + a small surprise (누리 간식 or 꽃 1송이 for F7) | 30 |
  | 30 | `0.75 × I` | 50 |

  Floors: 10 / 20 / 30 × eraMult.
- The box sits on the HUD as `ui_icon_box` with a ring timer. When ready it wiggles; a tap opens it. Unopened boxes go to the 우편함 at the day change.
- Total: 1.5 min of income a day.

### 7.3 오프라인 정산 (what the village earned while away)

- **When:** on load, after the village is complete. Before that the village needs its chief, and the sheet says so kindly: `촌장님이 안 계시니 마을이 조용히 기다렸어요`.
- **Formula:** `coins = round10(min(away, cap) × rate × I_day)`.

  | Rank of 든든한 금고 | Rate | Cap | Max (minutes of income) |
  |---|---|---|---|
  | 0 | 4 % | 3 h | 7.2 |
  | 1 | 4 % | 4 h | 9.6 |
  | 2 | 5 % | 5 h | 15 |

  - `away` counts only when ≥ 10 min.
  - `I_day` = the 30-min play average stored at the last save, so `I` pumped just before quitting does not pay.
- **Sheet:** `촌장님이 없는 동안` · `마을 사람들이 {h}시간 {m}분 동안 일했어요` · `+{coins}` · `받기`.
  - With the office built, 소복이 hands it over: `장부 정리했어요!`.
  - The coins are tagged `offline`: they never count in `I`, missions or quests.
- **Anti-abuse:**
  - `away = now − lastSeen`, where `lastSeen` is the highest wall time ever seen (saved every autosave).
  - A negative value gives 0.
  - A jump ahead is capped by `cap`; afterwards `lastSeen` is in the future, so later loads see 0 until real time passes it. No double pay.
  - Not in admin mode.
- No goods, stock or story move while away. Only coins: simple, safe, cheap.

---

## 8. 주민 행복도 (per-resident happiness)

### 8.1 Who

- **Our village's residents:** the named villagers in `VillageLife.moved` (pets excluded) + settlers (`Civic.settlers`).
- Workers and staff count when they live in the village.
- The ≈ 100–120 솔방울 townsfolk are **neighbours**: their mood stays the existing visitor satisfaction (`Growth.happyList`).

### 8.2 Needs and weights (each need 0–100; a resident's 행복 = weighted sum)

| Need | Weight | 100 when | Floor | Reads |
|---|---|---|---|---|
| 먹거리 food | 20 | their favourite food (fish / bread / meat, from a hash of the key) was on a market shelf or at the big restaurant ≥ 90 % of the last game hour | 30 | `StockLedger` shelf `emptyT` |
| 집 home | 20 | housed (not `life.waiting`); 돌집 +10 | 40 while waiting | `VillageLife`, houses |
| 일·배움 work / school | 15 | adult with a job (worker, clerk, staff, shop); kid with 놀이터 or school; elder with a bench / fountain within 700 px | 60 | roles, Civic amenities |
| 가게 shops | 10 | `40 + 12 × kinds open` (잡화점, 5 founded shops, big restaurant); +20 if 금방 delivered to their door today | 40 | `Growth.openShopCount`, `gb` |
| 꾸미기 decor | 10 | `40 + 10 × Σ happy of decor within 700 px of their home` | 40 | `Civic.amenities` (+ house position) |
| 즐길 거리 fun | 10 | `50 + 15 × events they took part in today` (concert, snowball fight, snowman, rink, festivals, weddings, 누리 tricks) | 50 | `VillageLife` events |
| 촌장 the chief | 15 | `50 + 25` if the chief talked to / helped them in the last 2 game days, `+5 × 인기도 rank` | 50 | `chat` / `tap` / missions |

- The floors keep a neglected village around **45**, never 0.
- A new village with food and homes sits at **65–75**. A cared-for one sits at **85–95**.

### 8.3 Village number and the existing bar

- **주민 행복** = the mean over residents, recomputed every 5 s, cheap (≤ 60 residents × 7 reads).
- The HUD "마을" bar shows 주민 행복. The rank panel shows both rows: `주민 행복 82` and `손님 만족 76` (the old metric).
- **Rank 2 bar = `max(old, new)`**, so 읍 can only come sooner, never later. Check: 읍 ≤ +5 % gate.
  - The old metric = base 30 + 70 × visitor mean + civic bonus ≤ 12 + news ≤ 5.
  - From rank 3 (v5), happiness is information on the rank panel (v5 plan §3.2).

### 8.4 Effects (bonuses only)

| Village 행복 | Effect | Code path |
|---|---|---|
| ≥ 60 | settlers come `every ÷ (1 + (H − 50) / 50)` (×2 at 100; replaces today's `happyBonus / 40`) | `Civic.updateSettlers` |
| any | hall tax per person × `(1 + 0.3 × max(0, H − 60) / 40)` → ×1.3 at 100 | `TownHall` tax |
| resident ≥ 80 | that worker works +5 % (sparkle emote now and then); total worker bonus with 리더십 capped at +15 % | `Worker` |
| ≥ 80 / ≥ 90 | train visitors `base` +1 / +2 ("소문 듣고 놀러 와요") | `Neighbours` riders |
| resident < 45 | **no penalty**: a sad emote now and then, and their bubble says what they miss | `VillageLife` bubbles |

What a resident says about their lowest need:

| Need | Line |
|---|---|
| food | `빵이 먹고 싶어요…` |
| home | `우리 집은 언제 생겨요?` |
| decor | `집 앞이 좀 썰렁해요` |
| chief | `촌장님 얼굴 본 지 오래됐어요` |

The person card (tap on a resident) shows a face (5 steps), the score and the 2 lowest needs as icon chips. A letter template `lt_happy_low` points at the most common low need.

---

## 9. 지역 자원 (region resources: "무엇이 부족한지")

### 9.1 Regions

| Region | Korean name | Contains |
|---|---|---|
| `start` | 서리 광장 | 시장 판매대, 화덕, 바다 그물, 생선 통 |
| `zone forest` | 소나무 숲 | 나무, 통나무 더미, 제재소, 교역소 |
| `zone farm` | 밀밭 | 밀밭, 밀 더미, 빵 오븐 |
| `zone mine` | 광산 | 광석 바위, 광석 더미, 제련소, 식량 상자 |
| `zone hunt` | 사냥터 | 사슴·멧돼지, 고기 걸이, 훈제장 |
| `west` | 서쪽 숲마을 | 마을회관, 큰 식당, 부지 |
| `east` | 동쪽 해안 | 대장간, 보트 창고, 부두 |
| `south` | 남쪽 들판 | 창고, 통조림 공장 |
| `se` | 동남쪽 언덕 | 잡화점 부지 |
| `rail` | 역앞 거리 | 역, 가게 5곳, 사무실, 은행, 물류창고, 금방 |
| `town` | 솔방울 마을 | neighbours, read-only |

A stock's region comes from its `place` (`StockLedger.register`) through `Territory`.

### 9.2 Resources per region (rows)

1. **자연** (natural): trees standing / regrowing, ore rocks, wheat plots ready, fish in the net, animals; boat catch for the dock.
2. **원료 → 가공 → 상품** (the `StockLedger.LINES` rows): pile · station in / out · shelf, with in / out per minute (EWMA).
3. **보관**: 창고 (n / 300), 물류창고 shelves by kind, 식량 상자.
4. **사람**: workers per line (and missing ones: operator, raw porter, goods porter), residents / beds / waiting.
5. **수요**: customers queueing, order cards, shop orders, site materials still needed.

### 9.3 Shortage rules (status per row; StockLedger already has short / jam / surplus / ok)

| Status | Rule | Example line (ko) |
|---|---|---|
| 부족 (red) | a consumer (shelf, station input, site, food box, shop) empty ≥ `ledger.emptyS` 30 s | `빵이 부족해요 ← 빵 짐꾼이 없어요` |
| 곧 부족 (yellow, 관찰력 2) | `stock / (out − in) < 5 min` while `out > in` | `약 6분 뒤 판자가 바닥나요` |
| 길 막힘 (orange) | output full ≥ 60 s while its consumer is empty (a carrier is missing) | `제련소 출구가 꽉 찼어요 ← 주괴 짐꾼이 필요해요` |
| 남음 (blue) | full ≥ `fullS` 60 s and nobody has room | `광석이 남아요 → 창고·수출로` |
| 적당 (green) | otherwise | — |

**Why-chain.** For a red row, the cause is the first upstream link that fails, checked in this order:
1. missing carrier (the hire step exists and is not done);
2. missing operator;
3. raw supply (`in < out`: `농부 1명 47/분 < 오븐 66/분`);
4. the line is not built.

The fix target is the pad, plot or station of that link.

**People rows:**
- `집이 부족해요: 이사 기다리는 주민 {n}명` → the nearest free plot;
- `빈 방 {n}개 · 이주민을 기다려요`;
- `광부가 배고파요` → the food box.

**`지금 부족한 것 TOP 3`** (top of the panel):
- Sorted by impact:
  - lost sales per minute (customers who left × price);
  - a site waiting for materials;
  - people waiting for homes.
- Each row has `해결하러 가기` (관찰력 2, or free once a day without the skill): the Navigator route to the fix.

### 9.4 Where it lives

- A HUD button `ui_icon_map` → **지역 자원** panel, from the start. Tabs: regions present, plus `전체` (TOP 3 + all red rows).
- Without 관찰력: dots and counts only. With 셈이 hired, or 관찰력 1: flows and reasons. The office 재고 tab and this panel share one renderer.
- Cost: reads `StockLedger.rows()` once a second while open. No new simulation.

---

## 10. 관리자 모드 (admin / cheat mode)

### 10.1 Entry and rules

- **Entry:** settings → the version label `v4.4` at the bottom → tap **7 times** (`관리자 모드까지 {n}번`). A row `관리자 모드` appears. The confirm sheet says: `관리자 모드는 시험해 보는 곳이에요. 지금 마을은 따로 보관하고, 관리자 마을에서 마음껏 놀 수 있어요.` → `켜기` / `취소`.
- **Two saves:**
  - The normal save `frostVillage.save.v1` is copied to `frostVillage.save.normal` and **not written while admin is on**.
  - The admin village plays from a copy in `frostVillage.save.admin`.
  - The chat record follows the save id (`cid`), so the admin copy gets its own `cid`.
- **Visible:** a red-gold ribbon `관리자` at the top centre while admin is on. It hides only in 사진 모드 (§12).
- **Exit** (the admin panel's last row):
  - `원래 마을로 돌아가기` (default): reloads the normal save. The admin save is kept for next time; `관리자 마을 지우기` deletes it.
  - `이 마을로 계속하기`: confirm twice. The admin village becomes the normal save, marked `adm: 1` (harmless; used only to keep it out of any future shared lists). The old normal save goes to `frostVillage.save.backup`.
- **Isolation:**
  - Attendance, play gifts, offline and calendar keys in the admin save never touch the normal save's slices.
  - Cloud saving (§11) never uploads an admin save automatically.
- **Admin panel:** a scrolling list of buttons, ≥ 64 px tall. It never pauses the game.

### 10.2 Features

| Button (ko) | What it does | How |
|---|---|---|
| 돈 무제한 (켬/끔) | coins show 9,999,999 and paying never lowers them | `Economy.spend` returns n without subtracting while on |
| 코인 +10만 | add 100,000 coins | `economy.add(…, 'admin')` |
| 모든 땅 열기 | every region + zone open, towers lit, fog gone | `Territory` open all; Progression zones + towers done (`applyStep` instant) |
| 모든 건물 열기 | build menu: every card unlocked (uniques still one each); v4.2 sites offered | `BUILD_UNLOCK` ignored while on |
| 짓기 바로 완공 (켬/끔) | a site finishes the moment it is chosen; no materials | `Site.start` → `finish(false)` |
| 지금 짓는 것 모두 완공 | finish every site now | each `Site.finish` |
| 고용 전부 | every Progression step done | `completeStep`-like, instant |
| 주민 행복 가득 | every resident 100; rank bar happy full | happiness override |
| 레벨 +1 / +5 | add XP to the next level(s) | chief model |
| 스킬 포인트 +10 | + SP | chief model |
| 스킬 무료 초기화 | respec everything incl. equipment, no cost | chief model |
| 시간 ×1 / ×2 / ×4 | game speed | scene `timeScale` + `DayClock` |
| 다음 날 아침으로 | game clock to 06:00 next game day (paper, letters) | `DayClock` |
| 실제 하루 넘기기 | the **calendar day key +1** in this admin save (dailies, attendance, gifts) | calendar `keyOf` offset |
| 아이템 넣기 | pick an item + count (10 / 50 / 200) → the 창고, or the bag when no 창고 | warehouse / player stack |
| 퀘스트 다음으로 / 모두 완료 / 처음부터 | quest chain control | quest model |
| 미션 새로 뽑기 | re-draw today's dailies | calendar `draw` |
| 승격식 바로 | rank +1 (when the next rank exists) | `Rank.ceremony` |
| 손님·기차 더 많이 (켬/끔) | customer and visitor spawn ×3 | spawn timers |
| 관리자 표시 잠깐 숨기기 | hides the ribbon for 30 s (screenshots) | UI |

---

## 11. 로그인과 클라우드 저장 (game-side rules only; the tech plan is separate)

- **Guest by default.** Nothing changes for a player who never signs in: the save stays in `localStorage` as today.
- **Sign-in is optional:**
  - from settings (`구글로 로그인 · 저장 지키기`);
  - from the title (a small `구글 로그인` text button under 새로 시작 / 이어하기).
- **What syncs:**
  - the game save (≈ 6–9 KB with the new slices);
  - the chat record (when ≤ 200 KB);
  - settings.

  Never the admin save.
- **Conflict sheet** (`어느 마을로 할까요?`): two cards, `이 기기` and `클라우드`. Each shows nickname, Lv, rank, coins, quests done and last save time. Choosing one never deletes the other: it goes to the backup slot.
- **Nickname** = the cloud profile's display name (not unique, not searchable).
- **Attendance** uses server time when signed in and online (§7.1).
- **A one-time `첫 로그인 선물`:** a decor coupon, as a reason to back up. Guests are never pushed or nagged, and never lose features.
- **No backend yet?** The **저장 코드 내보내기 / 불러오기** extra (§12) gives a manual backup that works inside the artifact and the APK with no network.

---

## 12. 추가 기능 (extras): value vs cost

| Idea | Player value | Cost (us) | Art | Verdict |
|---|---|---|---|---|
| **우편함 (보상 보관함)** | every reward has a safe home (unclaimed quests, offline, coupons, gifts): no lost rewards, no nagging | S (list panel + slice ≤ 20 rows) | `ui_icon_letter` | **pick (v4.4, needed by quests)** |
| **도감 · 업적** | collect residents met, items made, fish caught, buildings, events; stamps per page give XP and a badge | M | ui3 cards, portraits | **pick (v4.6)** |
| **마을 통계** | graphs: income / day (by source), people, happiness, deliveries; "a week ago vs now" | S–M (reuses office income bars, StockLedger, VillageNews stats) | — | **pick (v4.6)** |
| **사진 모드** | hide UI, free camera, frame (polaroid), save PNG; cosy share moment | S–M (artifact: download via an anchor; APK: WebView download → the share sheet needs a wrapper hook) | a frame drawn in code | **pick (v4.6)** |
| **저장 코드 내보내기 / 불러오기** | backup / move without login (copy text or QR) | S (gzip + base64 of the save, checksum) | — | **pick (v4.4)** |
| 마을 이름 짓기 | name the village like the chief | XS | — | add with the nickname (default 서리마을) |
| 주크박스 (BGM 고르기) | choose music among the 8 tracks | XS | — | nice later |
| 계절 축제 달력 | monthly festivals in the plaza | L (content) | some | after v5 story events |
| 촌장 옷장 | outfits / hats | L | needs new chief art | later |
| 친구 마을 놀러 가기 | read-only visit of a friend's village | XL (backend) | — | after login is proven |
| 알림 (APK push) | "출석 선물이 기다려요" | M (Android wrapper + permission) | — | skip (cosy, no nagging) |
| 낚시 미니게임 | timing mini-game at the pier | M | some | later |

**Recommended five:** 우편함, 저장 코드, 도감 · 업적, 마을 통계, 사진 모드 (+ 마을 이름 for free).

### 12.1 우편함 details

- HUD mail icon with a count.
- Rows: icon · `퀘스트 '바다의 선물' 보상` · reward · `받기`; `모두 받기` at the top.
- At most 20 rows. The oldest coins-only rows auto-claim when full. Coupons never expire.

---

## 13. Economy summary (all rewards together)

Shares of play income for a casual player playing 30 min a day at 읍 (`I ≈ 2,000`). A 60-min player gets about half these shares.

| Source | Per active day (minutes of income) | Share of a 30-min session's income |
|---|---|---|
| quests (Ch6–7 pace) | ≈ 1.5 | 5 % |
| dailies (3 × 0.5 + 1.0) | 2.5 | 8 % |
| weekly (10 per week) | 1.4 | 5 % |
| monthly stamp card (15 per month) | 0.5 | 2 % |
| attendance (4.5 per week) | 0.65 | 2 % |
| play-time gifts | 1.5 | 5 % |
| **calendar + gifts subtotal** | **6.5** | **22 %** |
| offline (3 h × 4 %; max skill 5 h × 5 %) | 7.2 (max 15) | 24 % (max 50 %) |
| level-ups | 0 | 0 % (SP, coupons) |

- Everything scales with `I`, so the shares hold at every era: no late-game inflation from rewards.
- The first session (village complete) only sees quest coins (≤ 11 % in Ch1, 3–5 % after) and three dailies from minute ≈ 15. The v4.2 pacing gates hold.
- The designer's knobs: `BALANCE.chief.*` (levels, skills, quests, offline, attendance, gifts) and `BALANCE.v5.missions` (daily / weekly / monthly), with Korean comments in `balance.js` and ranges in `balanceCheck.js`.

---

## 14. Data: save slice, balance block, events

### 14.1 Save: new slice `chief` (v1, cap 1,600 B; `SAVE_VERSION` +1 in v4.4 with `MIGRATE[7]`)

```
chief: {
  v: 1,
  nm: '눈송이', vn: '서리마을',          // nickname, village name
  xp: 12345,                             // total XP (level is derived)
  sp: 3,                                 // unspent skill points
  sk: { bag: 4, speed: 4, hands: 1 },    // learned ranks
  base: { bag: 4, speed: 4 },            // migrated ranks (paid in coins before)
  rs: [count, lastDayKey],               // respecs
  q: { i: 'q503', p: [7], d: 'b36…', cl: ['q502'], side: {...} },   // active quest, its progress, done bitset, unclaimed
  mail: [[id, kind, payload, dayKey]],   // ≤ 20
  att: { n, loop, board, bi, last },     // check-ins, 7-day position, 28-board position, board index, last day key
  gift: { d, s, got },                   // play-time gifts: day key, active seconds, claimed bits
  off: { seen, iday },                   // highest wall time seen, I_day at save
  hx: { …per-resident needs cache… },    // optional, rebuilt if missing (not saved in v4.4)
  adm: 0
}
```

- `missions` slice gains `mo: { m, s, got }` for the monthly card.
- `sanitizeChief` is pure, idempotent, never throws, and clamps every number (the `sanitizeV42` pattern), with a fuzz test.
- `MIGRATE[7]` moves `progress.up` into `chief.sk` / `chief.base` and refunds `paid.up_*`.
  - `progress.up` is still written for one version, so a downgrade to v4.3 keeps the bag.
- Save numbering: v4.3's 금방 adds a slice without a bump (`geumbang_plan.md` §9). v4.4 takes **8**, so v5's planned 7 → 8 becomes 8 → 9.

### 14.2 Balance block (sketch)

```js
// ── (v4.4) 촌장 성장 · 스킬 · 퀘스트 (docs/v44_draft_design.md)
chief: {
  level: { base: 180, k: 10, p: 1.65, max: 60 },         // 레벨 L → L+1 경험치 = 180 + 10 × (L−1)^1.65 (10 단위 반올림)
  spPerLevel: 1, spEvery5: 2,                             // 레벨마다 스킬 포인트 1, 5의 배수 레벨은 2
  pilotXp: 0.25, pilotNapAfter: 1200,                     // 관망 모드 경험치 배율, 이만큼(초) 손을 안 대면 경험치 0
  skills: {
    version: 1, feeOn: true,                              // version 을 올리면 재능 스킬을 한 번 무료로 다시 배울 수 있어요
    bag:   { values: [6, 10, 14, 18, 22, 26, 30], sp: [1,1,1,2,2,2], fee: [40, 90, 170, 300, 480, 2000], lv: [2,3,4,6,8,20] },
    speed: { values: [1.0, 1.15, 1.3, 1.45, 1.6],  sp: [1,1,1,2],     fee: [50, 120, 240, 400],             lv: [2,4,5,7] },
    hands: { per: 0.1, pay: 0.1, swing: 0.08, sp: [1,1,2], lv: [3,6,10] },
    // … reach, buildFast, buildCheap, buildLean, persuade, popular, lead, trade, insight, luck, vault (§4.2)
  },
  respec: { minCoins: 300, incomeMin: 5 },
  quests: { ch: [[5,0.05],[10,0.05],[20,0.05],[40,0.05],[60,0.05],[150,0.1],[200,0.1]], catchupXp: 2, catchupCoinsMin: 10 },
  attend: { strip: [0.5, 'treat', 1, 'coupon', 1, 'halo', 2], xp: [30,30,40,40,50,60,100] },
  gifts:  { at: [300, 900, 1800], pay: [0.25, 0.5, 0.75], xp: [20, 30, 50] },
  offline: { rate: 0.04, capH: 3, minAwayMin: 10 },
  eraMult: [0.3, 0.6, 1, 2, 3],
},
```

### 14.3 Events

- The kit pieces `missions_bank` needs anyway are pulled forward into v4.4:
  - **GameFeed** (patches P8–P11, E1–E8);
  - **IncomeMeter**.
- New emits:
  - `chiefGather`, `chiefMade`, `served` (flag on `sold`), `chiefDrop`;
  - `skill:learn`, `level:up`;
  - `quest:done|claim|chapter`;
  - `attend`, `gift`, `offline`.
- The chief model is pure (no Phaser), like `src/missions/model/*`, under `src/chief/**`. In v4.4 it is wired through a `V44` orchestrator (the `V42.js` pattern); in v5 it moves into the ModuleHost as a module with a port shim.

---

## 15. Version split proposal

Each version ships alone, is testable on a phone, and keeps every existing suite green.

| Version | Theme | In | Effort (build + review/fix) | Depends on |
|---|---|---|---|---|
| **v4.3** | 금방 | as planned (`geumbang_plan.md` G1 + G1b if it fits) | in progress | v4.2 ships |
| **v4.4** | 촌장 성장 | nickname + village name; level, XP, Lv ring; skill window (14 skills; bag and boots migrated; 수련대); quest chain Ch1–Ch7 + catch-up + quest chip/panel + tutorial merge; 우편함; 관리자 모드; 저장 코드; GameFeed + IncomeMeter kit pieces; save 8 | **L**: ≈ 8 build days + 3 review/fix | v4.3 (Ch7 quests skip if 금방 is not in) |
| **v4.5** | 매일의 즐거움 | missions_bank calendar wired early (dailies F1–F26, weekly G1–G11, monthly stamp card, gentler streak) + its panel tabs; 출석 체크 (7 + 28); 접속 선물; 오프라인 정산; quests q311 / s08 | **L**: ≈ 6 + 2 | v4.4 (XP, 우편함, IncomeMeter) |
| **v4.6** | 행복한 주민 | per-resident happiness (§8) + person card faces; 지역 자원 panel + shortage rules + TOP 3 (§9); 마을 통계; 도감 · 업적; 사진 모드 | **M–L**: ≈ 6 + 2 | v4.4 (관찰력, 인기도 hooks) |
| **로그인 (parallel)** | 저장 지키기 | Google sign-in via Supabase Auth; guest default; APK Custom Tab + deep link; cloud slots + conflict sheet | **M**: ≈ 4 + 2, after the designer's two setup tasks (new free Supabase project OK, Google OAuth client) | v4.4 (nickname, save code); ships as v4.5.x or v4.7 when ready |
| **v5** | 생활과 미션 | as `v5_v8_plan.md`: board, requests, fame, bank module, vehicles, 서리시 (시장); quest Ch8 | per plan | v4.6 |

### 15.1 v4.4 phone checklist (390×844 and 360×640, ko + en)

- Name sheet with the phone keyboard open; the field must not be hidden.
- Lv ring and SP dot next to the coins at 360 px.
- Skill window scroll with a thumb.
- Quest chip under the coin pill, and with v4's order chip showing.
- 수련대 pad.
- Old v4.2 save:
  1. 새로워진 것 card;
  2. name sheet;
  3. summary card;
  4. the bag stays the same size;
  5. coins refunded.
- 관리자 mode in and out; the normal save untouched (hash compare).

### 15.2 v4.5 checklist

- The device clock moved back / ahead: no double check-in or gifts, no negative offline.
- An overnight tab rolls the day at 05:00.
- The streak halves after a missed day.
- The stamp card resets on the 1st.

### 15.3 v4.6 checklist

- The happiness panel at 60 residents costs ≤ 0.05 ms per tick.
- The region panel open for 5 min: 0 rebuilds per tick (the missions_bank M-6 rule).
- TOP 3 fix buttons route correctly (Navigator).

### 15.4 Bot gates (new policies for `review_gameplay_sim.mjs`)

- `--skills bagfirst`: spend SP on bag → boots → 손재주. Then village complete within ±5 % of v4.2 (19.3–20.7), 읍 ≤ +5 % (≤ 48.8), longest wait ≤ 3.8 min.
- `--skills none`: never opens the skill window. It must still reach 읍 (≤ +25 %; the bag stays 6). Guidance must still lead there: q109 / q206 and the skill hint.
- Quest audit: the arrow-only bot finishes Ch1–Ch5 with 0 stuck quests. Every quest completes within its chapter window × 2.
- XP audit: logged XP per minute by source against §3.2 / §1.2. Lv at 30 min of play in 9–13 (target 11).
- Catch-up audit: the fixtures `v41_save_smart_25/35/46min.json`, `v35_save_*` load → expected chapter and Lv (≈ 11 / 14 / 16), coins ≤ 10 × I, bag / boots unchanged.

---

## 16. Open questions for the designer (defaults ship when unanswered)

| # | Question | Default |
|---|---|---|
| 1 | Bag and boots keep their old coin price as a training fee (§4.3)? | yes (balance safety); switch `feeOn` |
| 2 | Bag rank 6 (30 items) at Lv 20? | yes, if the head stack looks fine; else a back sack |
| 3 | Admin entry = tap the version label 7 times? | yes |
| 4 | Offline earnings 4 % for up to 3 h (≈ 7 min of income)? | yes |
| 5 | Dailies open after chapter 2 (≈ 15 min of play) instead of at 읍? | yes |
| 6 | Nickname length 1–8, Korean / English / digits? | yes |
| 7 | Rank-2 happiness bar = max(old, new)? | yes |
| 8 | Village name (서리마을) editable too? | yes, default 서리마을 |
| 9 | The 28-day board's SP: 1 per board? | yes |
| 10 | Which extra first in v4.6: 도감 or 사진 모드? | 도감 |

---

## 17. The designer's request (verbatim)

1. 게임 퀘스트가 있으면 좋겠어. 예을들어 첫번째 퀘스트는 물고기를 몇마리 잡기 등등 게임전반을 알아가는 퀘스트로 시작해서 점점 레벨마다 퀘스트 진행
2. 하루임무 주간임무 월간임무도
3. 출석체크보상 및 접속보상
4. 주민행복도 있으면 좋겠고.
5. 지역에 자원이 얼마나 있는지..무엇이 부족한지 알수 있으면.
6. 구굴로그인및 로그인없이 사용 단 로그인하면 저장및 불로오기 가능하게
7. 처음시작시 시장이름 등록하기(닉네임)
8. 시장스킬창이 있으면 좋겠어 마을에 있는 가방늘리기 이동속도를 마을지도에서 삭제하고 따로 스킬창만들어줘 시장이 행동을 할수록 경험치가 생기고 레벨올라고 레벌올라가면 스킬을 등록하게 가방 이동 말고도 시장님 필요한 스킬을 몇개 더 추가해줘. 예로 건축시간 단축 건축요금 단축 설득력 인기도등등 이런종류 스킬이 오르면 게임에 영향을 받게..어때? 괜찮을까?
9. 관리자모드?(치트) 만들어줘. 돈문제한 지역완전 개방 건물완전개방 건물 한번에 완공 주민행복도가득
10. 추가기능 더 넣을수 있는거 넣어주고

| # | Answered in |
|---|---|
| 1 | §5 |
| 2 | §6 |
| 3 | §7 |
| 4 | §8 |
| 5 | §9 |
| 6 | §11 (+ the tech plan) |
| 7 | §3.1 |
| 8 | §3, §4 |
| 9 | §10 |
| 10 | §12 |
