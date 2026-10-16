# missions_bank (v5) — build report

촌장 미션 · 명성과 칭호 · 서리 은행 for 행복한 눈꽃마을 이야기 (서리마을), Phaser 3.90.
Built as a **standalone module** (`src/missions/**`, `src/bank/**`), tested in Node and in a Phaser lab with the
real art. Nothing in the game imports it yet: it is wired in after v4 ships, with the patches in §12.

Status (2026-10-10, after the polish pass on `missions_bank_critique.md`): all 2 critical, 6 high and 11 medium
findings fixed, 9 of 9 lows fixed or answered (§10). **56 Node tests green** (missions 31, host level 9, bank 13,
import hygiene 3). Lab: 43 captures (PNG + GIF) at phone 390 × 844 DPR 3 and desktop 1280 × 800, 0 console errors,
0 placeholder textures, every critique probe re-run as a lab check (§7.3).

---

## 0. 디자이너용 요약 (쉬운 말)

- **미션이 생기는 곳**: 광장 게시판 카드 3장, 주민 머리 위 하트 말풍선(부탁), 이야기 속 행사(결혼식, 아기, 생일,
  첫 등교, 어르신 소원 …), 오늘의 미션 3개(새벽 5시에 바뀜), 이번 주 목표 1개(월요일 새벽 5시), 연속 달성.
- **받는 법**: 말풍선을 누르거나, 그 주민에게 **걸어가서 멈추면** 카드가 떠요 → 받기 / 나중에.
  - 빵집 발판처럼 일하는 자리에 서 있을 때는 카드가 뜨지 않아요.
  - '나중에'를 누르면 그 말풍선이 없어질 때까지 다시 뜨지 않아요.
  - 카드는 작아졌고, 카드 위에서 손가락을 끌어도 촌장님이 걸어가요.
- **게시판 카드**: 받지 않아도 마을 일을 하다 보면 저절로 채워져요.
  - 2분 동안 진행이 없으면 '다른 미션'으로 바꿀 수 있어요. 그 버튼은 보상 아래에 있어서 명성을 가리지 않아요.
  - 게임 2.5일 동안 아무도 못 움직인 카드는 조용히 내려가고 새 카드가 걸려요. **게시판이 못 하는 미션으로 막히는 일은 없어요.**
- **운전 미션 (개썰매·트럭)**: 화물장의 '출발' 발판에 서 있거나 카드의 '출발' 버튼을 누르면 떠나요.
  운전 기능이 아직 없는 마을에는 운전 미션이 아예 나오지 않아요.
- **잃어버린 강아지·뽀삐**: 반짝이는 곳에서 찾으면 촌장님 뒤를 졸졸 따라와요. 강아지는 광장 게시판, 뽀삐는 농장으로 데려가면 끝.
- **소문의 진실**: 서로 다른 주민 3명과 이야기하면 돼요. **불꽃놀이**: 카드의 '후원' 버튼으로 코인을 내요.
- **결혼식 준비**: 마감이 결혼식 날 오전 10시 반이에요(이제 26초 만에 실패하지 않아요). 결혼식까지 시간이
  너무 없으면 이 미션은 아예 나오지 않아요.
- **아기 이름 짓기**: 선물을 드리고, 이야기 창에서 이름을 지으면 끝. 부모님이 이름을 지어도 선물만으로 끝나요.
- **어르신의 소원**: "순자 할머니의 소원", 할아버지는 "만복 어르신의 소원"처럼 자연스럽게 나와요.
  소원 하나마다 어르신과 함께 그 장소에 가요.
- **오늘의 미션 '꽃 5송이 꺾기'**: 그날 이 미션이 있으면 꽃밭 발판이 꼭 나와요. 가방이 꽉 차도 꺾은 건 세어져요.
  휴대폰을 켜 둔 채 다음 날이 되어도 오늘의 미션이 제대로 바뀌어요.
- **말풍선**: 화면에는 큰 말풍선이 2개까지만, 나머지는 작은 하트 점으로 보여요.
- **보상**: 코인(= 지금 1분 수입의 몇 배, 최소 100 × 시대) + 명성. 재료는 절대 보상으로 주지 않아요.
- **칭호 5단계**: 새내기(0) → 믿음직한(150, 마을 악단 + 은행 터) → 존경받는(400, 눈꽃 아치) → 명예로운(900, 랜턴 거리)
  → 전설의(2,000, 도시 입구 문 + 금 왕관).
  - 칭호 그림은 **왕관 + 별**이에요. 마을 등급(읍·도시)의 방패 그림과 헷갈리지 않아요.
- **서리 은행**
  - 저금하면 매일 아침 6시에 1 % 이자(5만 코인까지).
  - 건설 발판에서 코인이 모자라면 "은행에서 빌릴까요?" 창이 떠요(지금 수입의 15분어치까지, 수수료 5 %).
    '안 빌릴래요'를 누르면 발판에서 내려올 때까지 다시 묻지 않아요.
  - 갚는 건 버는 돈의 10 %씩 저절로 갚아요. 코인이 마이너스가 되는 일은 없어요.
  - 은행이 문을 열면 직원들이 하나씩 들어와 자리에 서고, 첫 미션 "서리 은행 첫 저금"이 생겨요.
  - 주민들도 번호표를 뽑고 줄을 서요. 통장에서 빌린 돈은 빨간 −, 갚은 돈은 초록 +로 보여요.
  - (v8) 창구에서 '화재 보험'을 누르면 내 건물 목록이 나오고, 하루 보험료를 보고 가입할 수 있어요.
- 숫자는 `src/missions/tuning.js`, `src/bank/tuning.js`(한국어 주석)에서 바꿔요.
  미션 목록은 `src/missions/data/catalog.js`(한 줄 = 미션 하나)에 있어요.
- **확인할 점**: 부지런한 봇은 2시간(게임 12일)에 명성 900(명예로운 촌장)까지 갔어요.
  너무 빠르면 `fame.titles` 숫자를 올리면 돼요(§11).

---

## 1. What it does

### 1.1 Missions (99 templates: docs/v5_v8_plan.md §7's 98 + C16 "첫 저금" from §6.2)

| Group | n | Source | How it reaches the chief |
|---|---|---|---|
| A 부탁 (requests) | 22 | request bubbles over residents / pets | ≤ 4 bubbles world-wide (event bubbles included), ≤ 2 full bubbles on screen (the rest a small heart dot), one every 45–90 s, untouched bubbles pop after 6 min; accept by tap, or by walking up to the giver and stopping for 0.5 s; ≤ 3 accepted |
| B 배달 운전 (drives) | 12 | board / events | the missions host starts the drive (yard 출발 pad, or the card's 출발 button) through `vehicles.drive(spec)`; ★/★★/★★★ scale coins 0.6 / 0.85 / 1.0, ★★★ +5 fame; offered only while the vehicles module runs (`step:drive`) |
| C 행사 (events) | 17 | story / districts / bank | wedding prep + speech, baby gift + naming, first school day escort, three wishes (one escort per wish), farewell bouquet, birthday cake, welcome party, festivals, the first newspaper, the bank's first deposit |
| D 생산 목표 (goals) | 14 | board | counted from feed signals (`sold:*`, `made:*`, `catch:*`, `traded:*`, riders, customers, tax …) |
| E 탐험 (explore) | 13 | board | stand (one spot, or each of three: towers, statues) / find (a sparkle) / return / lead (the found animal follows the chief home) / ask (talk to 3 different residents) |
| F 오늘의 미션 | 12 | daily pool, 3 drawn | local date with a 05:00 reset (setting `daily.clock: 'real' / 'game'`) |
| G 이번 주 목표 | 6 | weekly | three stages, decor of the week in rotation |
| H 연속 달성 | 3 | rules | daily streak with 눈사람 방패, kind-chief combo, three-star drive streak |

- **Instances** move board → active (or bubble → accepted) → done; **park** keeps progress. The focus rule for the chip:
  an event due within 75 s of game time (life events first) → an accepted request → the board card with most progress.
  With nothing doable at the focus mission, the hint goes to the nearest request bubble.
- **Rewards**: `coins = max(payFloor × era, round10(pay × I))`, `I` = income per minute (module payouts and loans
  excluded), `era = max(1, rank − 1)`; fame fixed per template. Payouts go through `ports.coins.add(…, 'mission')`.
- **Mission items** (꽃다발, 케이크, 선물 상자, 편지) live in a 12-slot mission bag in the missions slice, made at craft
  pads: the flower bed (≤ 12 picks a day per bed; shown while a bouquet is needed **or today's F7 is open**), the
  bakery cake (12 bread + 20 s), the gift wrap (needs 3 goods in hand before it takes any), the 솔방울 꽃집 (a bouquet
  for 25 coins). The bed picks and a cake in the oven are saved. v4 items are untouched.
- **Never a dead end** (four layers):
  1. a static closure test proves every implied requirement is covered by the declared unlock;
  2. at offer time `facts.has()` is checked again, and steps another module performs need `step:<how>`, which the
     host answers from the modules that actually run (drive → vehicles, contract → harbour, choose / tap → beach);
  3. an event with a deadline is not offered when the time left is under its `minLead` (C1 200 s, B6 110 s);
  4. every 5 s active missions are revalidated and end gently (`expire 'gone'`, no coins taken) when the recipient
     left; a board card or an accepted mission with no progress for 2.5 / 3 game days leaves quietly (`stale`).
  A host-level honest bot (it walks, stands, carries, taps 받기 / 출발 / 후원, never calls `model.step`) finishes every
  kind of board card through the world (§7.1).
- **Calendar**: day key = local date with 05:00 reset (DST-safe, built from local fields), week key Monday 05:00.
  Keys only move forward: the natural next day always rolls (also in a tab left open overnight); a clock moved
  backward never rerolls or double counts. Streak with one 눈사람 방패 a week.
- **Fame**: points from missions + passive sources (+1 per 25 riders, +5 wedding / birth **of our village**, +5 new
  shop / house / star, +2 happening watched); titles at 0 / 150 / 400 / 900 / 2000 with rewards (decor via
  `ports.rewards.decor`, effects `settlers40`, `bankSite`, `tourists20`, `goldCrown`), flairs (crown 24 h real time,
  best driver 1 game day). The title art is `ui_icon_title`-style crown + 1–5 stars, never the village rank shield.

### 1.2 서리 은행 (기획서_v8 §2)

- **Account** (chief): savings and loan never coexist (a deposit repays first, a quote uses savings first); interest
  1 %/game day at 06:00 on at most 50,000 (150,000 after the harbour, v6); loans up to 15 min of income (ceremonies:
  50 % of the cost), 5 % flat fee, repaid from 10 % of v4 earnings and never more than the wallet holds; after 6 game
  days the fee is waived (twice at most), then the automatic share pauses (deposits still repay). A loan never grows.
- **Courier income** (`credit(n)`, for v4.2's 수금원): coins delivered straight to the bank repay a loan first, are
  saved up to the cap, the rest goes to the wallet.
- **No money farming**: interest only on own coins (borrowed coins cannot be saved: deposits repay first), so any
  strategy over 60 days gains at most the interest on its own coins (tested).
- **Branch**: open 09–17, numbered tickets (wrap at 999), 3 windows, a queue of 3, bench of 2, ≤ 8 inside, served by
  arrival order; residents come from story `bank` events; the number display on the back wall, `sfx_ticket_chime`.
- **Opening**: banner, cheer, the tellers and the manager walk in from the back room one after another (the manager
  waves), `bank:open` → missions offers C16 "서리 은행 첫 저금 (500코인)".
- **Views**: the civic `bank` cutaway (shell fades when the chief is near / taps it), tellers at `staffPoints`, the
  manager at his desk, customers walking in through the door, the vault door turns for deposits ≥ 5,000, coins fly to
  the window, the 창구 counter pad → counter sheet (updated in place), the passbook (chief + 5 nearest residents;
  amounts signed so the balance column moves the same way), the loan sheet (빌리기 / 안 빌릴래요; it blocks v4
  input like v4's own panels), the insurance sheet.
- **(v8) insurance**: 보험 들기 on the counter sheet lists the chief's buildings (`ports.buildings.list()`) with the
  premium per day (0.4 % of the build cost); a claim pays 100 % once per fire, never for a lapsed policy; ≤ 24
  policies; game ids longer than 10 characters are hashed (`policyId`).
- **Site**: offered at title 2 (믿음직한 촌장) or 읍 + 20 min, 9,000 coins + 30 planks + 20 ingots, 14 s (v4 Site flow,
  P29). A bank slice that is already `open` (v4.2's Bank42 builds the bank at the same `v5_bank` plot) skips the site.
  The 5 MiB cutaway art is loaded only once the site is offered or the bank is open.

---

## 2. Files

All under `/home/user/nurient/frost-village/`. Pure = no Phaser, DOM, timers or wall clock (enforced by a test).

| File | Layer | What |
|---|---|---|
| `src/missions/index.js` | entry | `MISSIONS_MODULE`, `BANK_MODULE`, `MODULES`, `FRAGMENTS` (incl. `bankArea`) |
| `src/missions/tuning.js` | data (pure) | `MISSIONS_TUNING` (Korean comments) → `BALANCE.v5.missions` |
| `src/missions/data/catalog.js` | data (pure) | the 99 templates, ko + en, one line each |
| `src/missions/data/caps.js` | data (pure) | requirements, closure, implied caps per objective, `step:<how>`, `HOST_STEPS` |
| `src/missions/lib/rng.js`, `lib/calendarKeys.js` | pure | mulberry32 RNG (one uint32 saved) + `hashStr`, day / week keys |
| `src/missions/model/missions.js` | model (pure) | instances, offers, board, bubbles, events (id normalisation for every module event), steps, ask / identify / named / wish, rewards, park / swap, stale rules, focus, revalidation |
| `src/missions/model/calendar.js` | model (pure) | daily / weekly / streak / shield |
| `src/missions/model/fame.js` | model (pure) | points, titles, rewards, flairs |
| `src/missions/model/signals.js`, `model/units.js` | model (pure) | feed event → signals; objective units |
| `src/missions/save.js` | pure | `MISSIONS_SLICE`, `sanitizeMissions`, `fitCap` (always returns), `MAX` |
| `src/missions/strings.js` | pure | `MSTR` ko + en, `mt()`, `titleOf()`, `elderName()` |
| `src/missions/host.js` | host | `MissionsHost`: ports → env, world interactions (accept, hand-offs, stand / find / lead / escort / carry / identify, drive start, funding), event application, api |
| `src/missions/view/ui.js` | view | text styles (≥ 17 px), buttons (`face` for short labels), icons, bars, title badge (crown + stars) |
| `src/missions/view/Chips.js` | view | `MissionChip` (focus mission; sits under v4's order chip while it shows), `FameChip` |
| `src/missions/view/MissionPanel.js` | view | tabs 진행 중 · 게시판 · 오늘 · 이번 주 · 칭호 (non-pausing; built once per tab, live fields updated in place); 출발 / 후원 / 다른 미션 buttons; the station's standing order shown read-only |
| `src/missions/view/RequestBubbles.js` | view | pooled heart bubbles (≤ 2 full on screen, the rest a heart dot) + "for me" bubble + ring at the recipient |
| `src/missions/view/Overlays.js` | view | `AcceptCard` (compact, touches pass through except its buttons), `DoneStamp`, `TitleBanner`, `EdgeMarker` |
| `src/missions/view/CraftPads.js` | view | 꽃밭 picks, 꽃집 buy, bakery cake, gift wrap, drive start pads, find sparkles; saves its state |
| `src/missions/view/Followers.js` | view | the found puppy / penguin trotting behind the chief, sent home |
| `src/bank/tuning.js` | data (pure) | `BANK_TUNING` → `BALANCE.v5.bank` |
| `src/bank/model/account.js`, `model/branch.js` | model (pure) | `Account` (incl. `credit`, `MAX_POLICIES`, `policyId`), `Branch` |
| `src/bank/save.js` | pure | `BANK_SLICE`, `sanitizeBank`, `fitBank` |
| `src/bank/host.js` | host | `BankHost`, `BANK_AREA_ART` |
| `src/bank/view/BankBuilding.js` | view | cutaway, tellers (opening walk-in), queue, display, vault, counter pad, coin flights |
| `src/bank/view/BankPanels.js` | view | `CounterSheet` (in place), `PassbookPanel`, `LoanSheet`, `InsureSheet` |
| `tools/test/missions_lab/missions.test.mjs` | test | 31 model tests |
| `tools/test/missions_lab/host.test.mjs` | test | 9 host-level tests (honest bot through the real `MissionsHost` / `BankHost`) |
| `tools/test/missions_lab/bank.test.mjs` | test | 13 bank tests |
| `tools/test/missions_lab/purity.test.mjs` | test | 3 import-hygiene tests |
| `tools/test/missions_lab/fake_world.mjs`, `headless.mjs` | test | `FakeWorld` (clock, facts, people), `Wallet`; the headless village + honest bot |
| `tools/test/missions_lab/lab.html`, `lab.js`, `fake_ports.js`, `run_lab.mjs` | lab | Phaser lab + FakePorts (the reference Ports, incl. a GameFeed stand-in for `bank:*`) + Playwright runner |
| `docs/previews/missions_lab_*.png|gif`, `missions_lab_numbers.json` | previews | §8 |

Run: `cd /home/user/nurient/frost-village && nice -n 15 node --test tools/test/missions_lab/*.test.mjs` and
`nice -n 15 node tools/test/missions_lab/run_lab.mjs --only=bubbles,accept,delivery` (groups: bubbles accept delivery
moving chip drive lead escort flowers title zoom panel bank checks desktop; partial runs merge into the numbers file;
`checks` fails the run on a regression of the critique probes).

---

## 3. Public API

### 3.1 Module entries (`src/missions/index.js`)

```js
MISSIONS_MODULE = { id: 'missions', version: 1, saveKey: 'missions', capBytes: 3072, needs: ['story?', 'bank?', 'vehicles?'],
                    gate: (gs) => gs.v4.rank.level >= 2, prefetch, create: (ports, saved) => new MissionsHost(...), sanitize, previews }
BANK_MODULE     = { id: 'bank', version: 2, saveKey: 'bank', capBytes: 1024, needs: ['missions?', 'story?'], gate: same, ... }
MODULES = [BANK_MODULE, MISSIONS_MODULE]          // plan tick order: story → bank → missions → vehicles …
FRAGMENTS = { missions: {...}, bank: {...}, bankArea: { civic: ['civ_bank'] } }   // bankArea = an area residency class
```

Host surface (both): `update(dt)`, `serialize()`, `state()`, `api`, `onFeed(ev)`, `tap(wx, wy) → bool`, `objects()`,
`destroy()`.

### 3.2 `gs.later.missions` (= `MissionsHost.api`)

| Call | Returns |
|---|---|
| `boardLines()` | `[{ icon, text }]` of the missions in progress (for any summary view) |
| `hallButton()` | the label "촌장 미션 보기" / "Chief's missions" for the hall board button (P13) |
| `active()` | `[{ id, code, f, due }]` accepted + board missions |
| `focus()` / `focusTarget()` | `{ id, code, f }` / `{ x, y, icon, id }` or null (P30 hints, edge marker) |
| `offer({ code, key, who, family, at, due, … })` | id (0 if not eligible): other modules' missions |
| `report({ how, code?, who?, n?, stars? })` | true when an active mission took a step another module owns (speech, choose, tap, contract, stand …) |
| `startDrive(id)` | true when the vehicles module took the drive (the panel's 출발 button calls it) |
| `fame()` | `{ pts, title, next }` |
| `open(tab)` | opens the panel (`'active' | 'board' | 'today' | 'week' | 'titles'`) |
| `chipShown()`, `bag()` | the mission chip is on screen; mission bag counts |

### 3.3 `gs.later.bank` (= `BankHost.api`)

| Call | Returns |
|---|---|
| `account()` | `{ savings, loan: { left, fee } | null, interestToday }` |
| `maxLoan(kind, cost)` | coins |
| `quote(short, kind = 'build', cost = 0)` | what the bank would offer for a shortfall now, or **null** (nothing to offer → the pad keeps v4's "코인이 모자라요") |
| `offerFor(short, padId, kind = 'build', cost = 0)` | `Promise<boolean>`: true when the coins are now in the wallet (P28) |
| `deposit(n)`, `withdraw(n)` | `{ repaid, saved }` / n |
| `credit(n)` | `{ repaid, saved, wallet }`: income delivered straight to the bank (v4.2 courier) |
| `insured(id)`, `insure(id, cost)`, `claim(id, fireId)` | v8 insurance (ids hashed when long) |
| `passbookRows(pids)` | `[{ pid, rows: [[day, op, amount, balance]] }]` |
| `artKeys()` | `['civ_bank']` once the site is offered or the bank is open, else `[]` (Residency) |
| `open()`, `isOpen()` | the branch (P29 calls `open` from the site's onBuilt) |

---

## 4. Events

### 4.1 In (feed objects `{ t, ... }`; the GameFeed re-emits v4's positional events with names, plan §5.4)

| `t` | Payload the model reads | Counts as / does | Source |
|---|---|---|---|
| `sold`, `storeSold` | `{ value, item, n }` | `cust`, `sold:<item>` | `Seller.complete` (P8) |
| `shopSold` | `{ item, n }` | `sold:<item>` | `Shop.takeOut` (E1) |
| `traded` | `{ value, item, n }` | `traded:<item>` | `Seller` trade loop (E2) |
| `restMeal` | `{ price, combo }` | `cust`, `combo` | `BigRestaurant` (as is) |
| `produced`, `crafted` | `{ item, n }` | `made:<item>` | `Station` (P9), `Workshop` (as is) |
| `boatHome` | `{ catch: { item_fish_raw, item_fish_big } }` | `catch:<item>` | `Boathouse` (E3) |
| `visitorDone` | — | `visitor` | `'v4:visitorDone'` |
| `train` | `{ ev: 'arrive', n, line }`, `{ ev: 'ride', chief, line }` | `riders`, `chief_ride` | `Neighbours.arriveOurs` (E4) |
| `wholesale` | `{ n }` | `wholesale` | `Growth.payWholesale` (E5) |
| `dogAct` | `{ kind }` | `dog:<kind>` | `DogPlay.start` (E6) |
| `tap` | `{ pid, x, y, talk }` | `chat` once per resident a day when `talk`; E13 `ask` (distinct residents); E12 `identify` | P11 |
| `chat` | `{ pid }` | same as a talk tap (a tap + the message after it count once) | `ResidentChat` (E7) |
| `collect` | `{ pad: 'tax', n }` | `tax` | `CashPad` in `TownHall` (E8) |
| `built` | `{ key }` | unlocks, A8 | `Site` |
| `houseDone`, `shopOpen` | — | A8, fame | v4 |
| `settlers` | `{ n }` | C5 welcome party | `Civic` |
| `day` | `{ day }` | calendar check | `DayClock` (P10) |
| `story:life` | `{ op, a, b, who, baby, family, day, hour, at, prepAt, ours, aPid, bPid, whoPid, babyPid, familyPid }` | `engaged` → C1 + B6 (due = the wedding day at the template hour), `wedding` → C2, `baby` → C3 (keyed by the baby), `named` → C3's choose, `school` / `birthday` at `schoolAge` → C4, `birthday` → C9 + A12, `wish` → C7, `farewell` → C8; passive fame only when `ours` | story_runtime |
| `story:wish` | `{ who, whoPid, wish, place, ko, en }` | C7 (a twin of `story:life wish`: the second copy changes nothing); the wish text for the chip | story_runtime |
| `story:wisher` | `{ who }` | arms C7a (the elders' garden) | story_runtime |
| `story:move`, `inc:move` | `{ op: 'in', who, whoPid, home, id }` | A8 (story only), A21, B12 | story_runtime, incidents |
| `story:news`, `story:happening` | `{ first }`, `{ watched }` | C15 once, fame | story_runtime |
| `veh:driveDone` | `{ mid, stars }` | the drive step | vehicles_runtime |
| `veh:drive` | `{ op: 'abort', mid }` | the host stops waiting | vehicles_runtime |
| `harbor:ship` | `{ kind, op, id, leaves, due }` | B7, D10 (keyed by ship id), B8, B10 | harbour |
| `harbor:export` | `{ id, n, done }` / `{ id, n: 0, expired }` | D10's contract step / D10 ends; an expired contract is not an export (G4) | harbour |
| `harbor:rare`, `harbor:star`, `beach:star` | — | E10, fame | harbour, beach |
| `inc:wanted` | `{ op: 'post', id, pid }` | E12 | incidents |
| `bank:open`, `bank:deposit` | `{}` / `{ saved }` | C16 offer / its `deposit` count | bank (this module) |
| `mstep` | `{ mid, how, n }` | a step for a known mission id | any module |
| `story:bank` (bank) | `{ op, who, whoPid, amount }` | branch arrivals | story_runtime |
| `inc:fire` (bank) | `{ op: 'ruin', building, id }` | insurance claim | incidents (v8) |
| `region` (bank) | `{ id: 'harbor' }` | deposit cap 150,000 | `Territory` |

Every event that names people is normalised (`normIds`): game pids come from `*Pid`; a person the game cannot show
gives no mission; ids are always strings.

### 4.2 Out (`ports.emit`, plan §5.4 namespaces)

- Missions host (every model event, after the host applied it): `mission:offer|accept|progress|delivered|stage|done|
  expire|park|resume|later|flag`, `daily:new|progress|done|all`, `weekly:new|progress|stage`, `streak:day|shield`,
  `combo`, `fame:pts|title`, `reward { kind: decor|voucher|effect|flair, key, why }`, `bag`.
  - `mission:done` and `mission:expire` carry `key` (the event key: the incident id for E12, `s<sid>` for C7).
  - A C7 stage also emits `mission:done { code: 'C7', stage, wish, who: <engine id>, key }`, so story_runtime closes
    that wish card. The whole C7 done / expired frees the elder.
  - C14 emits `mission:accept { code: 'C14', at }` when offered (incidents stages its drill).
  - `mission:done` carries `target { ko, en }` (story: "the chief helped …").
- Bank host: `bank:open|deposit|withdraw|interest|loan|repaid|restructure|pause|premium|lapsed|insure|claim`
  (`bank:deposit { by: 'courier' }` for `credit`). The branch's `branch:*` stay inside the bank.

---

## 5. Save slices

| Slice | Version | Cap | Measured |
|---|---|---|---|
| `missions` | 1 | 3,072 B | 1,346 B after 30 simulated game days; worst legal case 7,467 B sanitized → `fitCap` 3,001 B (6 accepted, 3 board kept); a 3.1 KB untrimmable slice returns in 1 ms |
| `bank` | 2 (v1 → v2 migrates: insurance added) | 1,024 B | worst case 24 policies + 8 rows 870 B; `fitBank` trims rows |

- `missions`: `{ v, sd, rs (rng state), n, t5, bt, rq, b[] / a[] / p[] / o[] (instances { i, c, t0, g?, tp?, d?, gv?,
  w?, nm?, k?, sg?, pl? (a destination: the wish place, the new home), wi? (the story's wish id) }), c (cooldowns),
  bag, dy (daily { d, ids, g, k, a }), wk (weekly { w, c, g, s }), st (streak { n, last, sw }), cb (combo), ds,
  fm (fame { p, r, fl, lg ≤ 12 }), fl (once flags), st2 (settlers today), cr (craft pads { d, p: [[bed, picks]], k: cake
  seconds }) }`.
- `fitCap` trims, least valuable first: fame log, untouched bubbles, parked cards ('once' story cards last), timed
  cooldowns, small memories (combo, craft, settlers, flairs); as a last resort (no real game gets there) running
  missions without progress. Every step must shrink the slice, so it always returns.
- `bank`: `{ v (1, or 2 once a policy exists), open, sv, ld, tk, so, t5, v6, ln: { a, l, f, t0, d0, rs, ps, k }?,
  rw[≤ 8], ins: [[id ≤ 10 chars, cost/100 (negative = lapsed), fireHash]] ≤ 24 }`. v4.2's `keepBank`
  (`src/core/Save.js:303`) is a local copy of these rules: 400 real account slices (every op, hashed ids, courier rows)
  give identical output through `keepBank` and `sanitizeBank`.
- `sanitize*` are pure, idempotent and never throw (200 fuzzed slices each in the tests).

---

## 6. Tuning (`BALANCE.v5.missions`, `BALANCE.v5.bank`)

Defaults live in `src/missions/tuning.js` and `src/bank/tuning.js` (Korean comments for the designer); the hosts merge
`BALANCE.v5.*` one level deep over them (`missionsTuning`, `bankTuning`). Values follow plan §6.2 plus: `acceptStill`
0.5 (after a walk-up), `focusDeadline` 75, `revalidate` 5, `streak.crownHours` 24, `streak.driverFlair` 600,
`craft.bagMax` 12, `craft.bouquetsPerBed` 12, `drive.startStand` 0.6, `escort { near: 110, along: 12 }`,
`goalLastHour` 18, `maxParked` 6, `eventStale` 1800, `boardStale` 1500, `schoolAge` 7 (= story_runtime's),
`weekly.decor` rotation; bank `minLoan` 100, `branch` (hours, windows, queue, seats, serve times), `vaultAt` 5,000,
`insurance { premiumPerDay 0.004, cover 1.0 }`.

---

## 7. Numbers (after the polish pass)

### 7.1 Node (fixed seeds)

| Check | Result |
|---|---|
| missions model, 36,000 ticks at 60 fps with feed events | **0.0006 ms / tick** (budget 0.02) |
| bank (clock + income share + branch) | **0.0006 ms / tick** (budget 0.01) |
| 30 game days, model oracle (completes everything offered) | offers/day min 14 · avg 22.4 · max 32; 679 completions (goal 253, request 205, drive 113, event 58, explore 50); 66 distinct templates; bubbles ≤ 2, accepted ≤ 3; titles 2→5 in order |
| host-level honest bot, 1 h (`host.test.mjs` oracle) | 75 done across 25 templates, every board kind finished through the world; worst idle card 359 s; 0 stale / expired |
| honest bot 2 h at 읍 (stable, sled, depot, paper, penguin), vehicles wired | 75 done (55 requests, 10 goals, 6 explore, 3 drives B1/B2, 1 event); 0 expired; **0 of 12** ten-minute board samples hold a card idle > 10 min (critique: from minute 10 to 120 the board was `B2✗ B1✗ E13✗`) |
| same, no vehicles module | no drive card offered; 0 expired; 0 of 12 samples with an idle card |
| critique repros (`$S/t_*.mjs`) | `fitCap` returns in 1 ms; C1 due on the wedding day 10:30 (26 s before); dailies roll at 08:10 after a sleep; A21 runs (was "gone" in 4 s); E4 kept in parked; "순자 할머니의 소원", "만복 어르신의 소원", "어르신 난로에 장작 10개" |
| determinism + reload mid-run | identical event streams and slices |
| conservation (bank, 20,000 random ops; credit) | wallet + savings − loan moves only by income, spending, interest, fees, waivers, premiums, claims |

### 7.2 Phaser lab (Chromium, SwiftShader GL, phone 390 × 844 DPR 3)

| Measure | Value |
|---|---|
| host update incl. views, busy minute | missions **0.017–0.033 ms**, bank **0.0025–0.005 ms** per frame across runs (timer granularity 0.1 ms) |
| draw calls per frame | 5 (bank open + queue), 8 (desktop panel) |
| display objects | world 108–139, UI 69–142 (panel open); module-owned 23–29 |
| textures resident with the module from 읍 | **3.0 MiB** (ui3_icons 1.17, ui4_icons 1.02, life2_decor 0.30, ui_passbook 0.17, board / cards / bars 0.33, life2_items 0.03); `civ_bank` 5.02 MiB only once the bank site is offered (area class). Before: 9.65 MiB from 읍 |
| console errors / 404s / placeholder textures | 0 / 0 / 0 |

### 7.3 Critique probes as lab checks (`--only=checks`, fail on regression)

| Probe | Before | After |
|---|---|---|
| gift wrap with 2 bread (M-2) | 2 bread → 0 bread, 0 boxes | 2 bread kept, 0 boxes, "물건 3개가 필요해요" |
| F7 drawn, chief on the flower bed (H-1) | pad hidden, progress 0 | pad shown, progress 1 (5 picks → done) |
| bubbles on screen (M-3) | 4 full | 2 full + 2 heart dots |
| counter sheet while coins tick, 300 frames (M-6) | 300 rebuilds, 2.6 ms each | 0 rebuilds |
| board panel open 60 s with sales ticking (M-6) | one rebuild every 5 s + every change | 3 rebuilds (card set changes only) |
| drive / lead / escort / bank opening | — | B1 started from the yard pad and done ★★★; puppy led home; C7 stage with the wish text; `bank:open` → C16 offered |

All numbers: `/home/user/nurient/frost-village/docs/previews/missions_lab_numbers.json`.

---

## 8. Lab shots

Phone 390 × 844 at DPR 3 (stored at 780 px wide), GIFs at 390 px. Re-shot after the polish and inspected one by one.

| File | Shows |
|---|---|
| `missions_lab_plaza_bubbles.png` | request bubbles: 2 full (grilled fish ×3 at 나비, the kid's heart), the others as small heart dots; mission chip, fame chip |
| `missions_lab_accept_card.png` | walking up to the aunt: the compact portrait card, her line, task, +540 / +5, 나중에 / 받기 |
| `missions_lab_accepted.png` | after 받기: her speech bubble, the chip, grandma's "for me" bubble + pink ring |
| `missions_lab_delivery.gif`, `_delivery_done.png` | bread from the bakery to grandma's bench: bread flies, thanks bubble, coins, the green stamp |
| `missions_lab_edge_marker.png`, `_moving_recipient.gif`, `_moving_done.png` | a letter for 목수 김씨 walking off screen: the pink edge marker, hand-over on the move |
| `missions_lab_drive_pad.png`, `_drive_done.png` | B1 개썰매 편지 배달: the "개썰매 출발" pad at the yard, the chip; the ★★★ stamp after the drive |
| `missions_lab_lead_find.png`, `_lead_puppy.gif`, `_lead_home.png` | E1: the sparkle, the puppy trotting behind the chief, home at the notice board |
| `missions_lab_escort_wish.png`, `_escort_walk.gif`, `_escort_done.png` | C7 "순자 할머니의 소원 (3가지)": "같이 가 줘요? 고마워요, 촌장님!", walking together, the stage stamp |
| `missions_lab_f7_bed.png` | today's F7 with no bouquet mission: the flower-bed pad is out, picks counted with a full bag |
| `missions_lab_panel_active.png`, `_board.png`, `_today.png`, `_week.png`, `_titles.png`, `_active_en.png` | the five tabs: board with the 출발 button in the reward column, the station order card (read only) and the note; titles with crown + stars; English |
| `missions_lab_chip_focus.png` | focus switching: board goal → accepted request → an event about to start |
| `missions_lab_title_up.gif`, `_title_up.png`, `_band.png` | 믿음직한 촌장: rays, crown + 2 stars, ribbon, star burst; the bard plays at the new music stand |
| `missions_lab_zoom06.png`, `_zoom12.png` | bubbles at zoom 0.6 and 1.2 (≤ 2 full) |
| `missions_lab_bank_opening.gif`, `_bank_opening.png` | the opening: staff walk in one by one, the manager waves; C16 appears on the chip count |
| `missions_lab_bank_closed.png`, `_bank_queue.gif`, `_bank_open_queue.png` | the shell, 은행 창구 label, counter pad; six residents walk in, tickets called, windows serve |
| `missions_lab_bank_counter.png`, `_bank_counter_v8.png` | counter sheet: piggy, savings, interest and cap, loan state, 저금하기 1,000 / 전부 / 꺼내기 / 통장; (v8) 화재 보험 · 1 |
| `missions_lab_bank_insurance.png` | 화재 보험 들기: four buildings with the premium per day, 빵집 보험 가입됨 |
| `missions_lab_bank_vault.gif` | 6,000 deposit: coins fly in, the vault door turns |
| `missions_lab_bank_passbook.png`, `_bank_passbook_resident.png` | the chief's book; 순자 할머니's: 대출 −630 (balance −630), 갚음 +100 → −530 → −430 |
| `missions_lab_bank_loan.png` | "은행에서 빌릴까요?" with 빌리기 / 안 빌릴래요 |
| `missions_lab_desktop_plaza.png`, `_desktop_panel.png` | 1280 × 800 (pillarboxed portrait column, as v4's main.js) |

(All under `/home/user/nurient/frost-village/docs/previews/`.)

---

## 9. Decisions and deviations

### 9.1 Interpretations of the plan
- Bank site at **title 2** (the titles table gives the bank site to 믿음직한 촌장) or 읍 + 20 min.
- Restructure = fee waived after 6 game days (twice), then the automatic share pauses; deposits still repay.
- The calendar keeps keys moving forward only (the critique showed the "one rollover per launch" rule froze dailies
  on phones); a reload or a clock moved back can never re-roll the same day.
- One lab for missions and bank (`tools/test/missions_lab`, as the task names).
- View files are grouped (Chips, Overlays, CraftPads, Followers, BankBuilding, BankPanels).
- Slices use compact keys (§5); caps kept.
- **The missions host owns the drive start** (the yard 출발 pad and the card's 출발 button call `vehicles.drive`),
  as vehicles_runtime's report expects; drive cards are offered only while the vehicles module runs.
- **v4's order chip stays** (P31 dropped). The mission chip moves 78 px down while the order chip shows; the board tab
  shows the station's standing order read-only (v4 still pays it).
- C16 "서리 은행 첫 저금" added (plan §6.2 "first mission 첫 저금"): catalog 99.

### 9.2 Catalog changes
- From the closure test: A8 needs `b:store`; C8 `b:memorial`; B1/B2 `veh:sled`, B3+ `veh:truck`; E2 `towers:3`;
  B8 deadline 75 s; C7 in 3 stages.
- From the critique:
  - drive steps carry `from` (yard / ferry / logistics office);
  - E1 / E3 `lead` go to `p:board` / `p:farm`;
  - E2 and C6 stand at three spots (`each`);
  - E10 carries the rare fish from the auction to the aquarium;
  - C1 `minLead` 200, B6 110;
  - C3 naming is `soft` (the gift alone finishes it when the parents chose the name);
  - C7 title `{elder}의 소원 (3가지)`, A6 "어르신 난로에 장작 10개", A11 "목공소에 판자 30장", A12 `offerSelf` line;
  - weekly lines `wk_settle` "물류 센터 정산하기", `wk_celebrate` "결혼식·아기 축하·생일 잔치 함께하기".

### 9.3 Fixes made after inspecting captures (both passes)
- First pass:
  - cards opening by proximity in shots, speech bubbles clipped at the screen edge, board tab without explanation;
  - week card overflow, title 1 row empty, fame chip counting from a stale value;
  - bank customers invisible, ticket pills stacked, counter buttons overlapping;
  - passbook "촌장님 님", counter sheet hidden under the passbook.
- Polish pass:
  - insurance rows: the name and premium on two lines, the 가입 button inside the card;
  - insurance button nudged under the loan note;
  - short button labels use the `face` helper (no stretched 9-slice);
  - title stars and the card's button position nudged;
  - the yard props moved off the 출발 pad;
  - the stamp moved clear of the chip.

---

## 10. Polish pass: critique findings (docs/build_reports/missions_bank_critique.md)

Each finding was reproduced first (the critic's scripts in the scratch folder, the lab probes), then fixed inside
`src/missions/**`, `src/bank/**`, `tools/test/missions_lab/**`, or answered in §12.

| # | Finding | Status | What changed / proof |
|---|---|---|---|
| C-1 | `fitCap` loops forever | **fixed** | every step must shrink the slice, the fame log goes to nothing, 6 more steps incl. a last resort; test with an untrimmable 3.1 KB slice (returns in 1 ms) and a legal 3,018 B slice |
| C-2 | board fills with cards nobody can finish | **fixed** | (a) the host starts drives (yard pad + 출발 button, `vehicles.drive(spec)`, abort on cancel); (b) E1/E3 lead to `p:board` / `p:farm`, the animal follows the chief; (c) `ask` = talk to distinct residents; (d) C12 후원 button; (e) `step:<how>` caps answered by the wired modules + `boardStale` 1500 s; (f) host-level honest-bot oracle (`host.test.mjs`). Bot: 0 idle cards in 12 samples |
| H-1 | F7 flowers usually impossible | **fixed** | bed pads show while F7 is open; picks count with a full bag (lab check) |
| H-2 | dailies stop rolling in an open tab | **fixed** | keys move forward on every natural step; no uptime rule (test: tab left open overnight) |
| H-3 | C1 deadline ignores the wedding date | **fixed** | due = the wedding day at the template hour (10:30) from `{ day }`, also when the story sends `at` / `prepAt`; `minLead` |
| H-4 | events never sent by the sibling modules | **fixed** | ids normalised for every event; `named` → C3, `story:wish` / `story:life wish` → C7 stages (with `mission:done { wish }` back), `story:wisher` → C7a, `school` → C4, `harbor:export done/expired` → D10, `n: 0` exports not counted, A21 from `inc:move`; C2 contract in §12.8 |
| H-5 | P28 nags, hides the toast, a Promise per frame | **fixed** (patch rewritten, §12.6 P28) | `_asked` resets only when stepping off; `api.quote()` null → v4 toast; the loan sheet calls `ui.panelOpened` |
| H-6 | P31 hides v4's order chip | **fixed** (P31 dropped) | the chip moves under the order chip (`ui.orderChip()`); the board tab shows the standing order read-only (`orders.focus()`) |
| M-1 | P13 contradicts itself | **fixed** (patch rewritten) | v4's hall board stays; its "마을 임무는 곧 찾아와요!" line becomes a "촌장 미션 보기" button |
| M-2 | gift wrap eats goods | **fixed** | checks ≥ 3 goods before taking any; message otherwise (lab check) |
| M-3 | up to 4 bubbles on screen | **fixed** | ≤ 2 full by distance, the rest heart dots; event bubbles count against the world cap |
| M-4 | proximity card nags | **fixed** | needs a walk-up; never on a v4 pad (`chief.onPad()`); 나중에 lasts until the bubble pops; compact card, drags pass through (host test) |
| M-5 | Korean text | **fixed** | `{elder}` from the story name, "어르신" for grandfathers; A6, A11 neutral; A12 self line + parent giver via `familyPid`; weekly lines |
| M-6 | panels rebuild on a timer | **fixed** | panel built once per tab and set in place; counter sheet in place (0 rebuilds / 300 frames) |
| M-7 | titles reuse the rank shield | **fixed** | crown + 1–5 stars everywhere (panel, banner, chip) |
| M-8 | `civ_bank` resident from 읍 | **fixed** | area class `BANK_AREA_ART`, asked for when the site is offered; module-resident art 3.0 MiB |
| M-9 | places / people contract unspecified | **fixed** (§12.4, §12.5) | place table with sources, `people.pick` contract, `has` = registry, string pids |
| M-10 | 'once' cards lost from parked | **fixed** | an everyday card leaves instead; a dropped card never writes a 'once' cooldown (test) |
| M-11 | insurance cannot be bought | **fixed** | 화재 보험 on the counter sheet + `InsureSheet` over `ports.buildings.list()`; hashed ids; incidents line patch in §12.8 |
| L-1 | towers / statues one spot; rare fish not carried | **fixed** | `each` lists; E10 carries the fish from the auction |
| L-2 | craft state not saved | **fixed** | `cr` in the slice (bed picks, cake seconds) |
| L-3 | labels / sizes / "괜찮아요" | **fixed** | all labels in `MSTR`; text styles ≥ 17 px; "안 빌릴래요" |
| L-4 | passbook signs | **fixed** | amounts signed the way the balance moves (loan −, repay +) |
| L-5 | F5 counts taps, not people | **fixed** | distinct residents per day; tap + message count once |
| L-6 | banker arrival, 첫 저금, 꽃집, idle hint | **fixed** | opening walk-in, C16, the 꽃집 pad (25 coins), hint → nearest bubble |
| L-7 | passive fame for every wedding | **fixed** | only with `ours` (story sends it) or a couple member living here |
| L-8 | bank slice over 1 KB with 32 policies | **fixed** | ≤ 24 policies (870 B worst case) |
| L-9 | 다른 미션 covers the fame line | **fixed** | the button sits in the reward column under the fame line |
| §3 | `I` from a 5-min average can be pumped before a payout | **won't fix now** | minor (critic's words); a designer knob later (`income.window`) |

Found while resuming (fixed in this pass): story_runtime now sends `engaged { at: 11:00, prepAt }` — the deadline
now takes the template hour on the wedding day first; each wish arrives twice (`story:life wish` + `story:wish`) —
the twin is ignored; birthdays carry `family` — `familyPid` is used for A12's giver; a drive whose mission ends now
calls `vehicles.abortDrive()`; the lab's ports forward `bank:*` to missions like the GameFeed (C16 visible).

---

## 11. Known issues and limits

1. **Pacing**: the diligent honest bot (it takes every request bubble) reached 978 fame — title 4 — in 2 real hours (12
   game days). A real player takes fewer requests; knobs: `fame.titles`, template fame, `requestEvery`. Check with the
   kit's honest bots after wiring.
2. **Bank interior crowding**: with 6 people inside, figures overlap at the windows. Lowering the inside cap from 8 to 6
   is one tuning line if wanted.
3. **Resident passbooks** show current savings and loans because the story engine keeps no per-person ledger.
   Dated rows need story_runtime to keep the last 8 bank ops per person.
4. **Story beats that need the story's own report**: C2's speech completes by standing 2 s at `p:officiant`; the
   one-line `report({ how: 'speech', code: 'C2' })` in the Wedding scene (§12.8) makes it exact.
5. **A12's giver** is the birthday child until story_runtime adds `family` to its `out()` pid list (§12.8); the child
   then uses the self line "곧 제 생일이에요!".
6. `missions_lab_moving_recipient.gif` is 3.1 MB and `missions_lab_escort_walk.gif` 2.3 MB (camera follow); the
   others are 0.3–1.2 MB.
7. Browser timings have 0.1 ms granularity; the Node figures are the reliable per-tick costs.

---

## 12. Integration

Anchors are from the tree at commit `d4f61a6` (2026-10-10 13:13 UTC: v4.1 + v4.2 P0 in `Save.js`). The v4 workflow
owns `src/**` outside these two folders and is building v4.2. **Anchor on the function names**; the numbers move. No
patch below has been applied; none is needed for v4 to keep working.

### 12.1 Order

1. Kit (lead, plan §5.9): `ModuleHost`, `Ports` (12.2), `GameFeed` (12.3), `IncomeMeter`, facts (12.4), places (12.5).
2. P20 balance blocks, P2 save, P3 fragments and the bank area class.
3. P1 construct `MODULES` from `src/missions/index.js` (after story_runtime's entry).
4. Feed patches P8–P11, E1–E8. UI patches: P12, P13 hall board button, P28 pads, P29 site, P30 hints, P17 fame
   bar. **P31 is dropped.**
5. Sibling one-liners (12.8). v4.2 overlaps (12.7).
6. Checks (12.9).

### 12.2 Ports the hosts use (`tools/test/missions_lab/fake_ports.js` and `headless.mjs` are reference implementations)

| Port | Used for | Backed by in the game |
|---|---|---|
| `world.scene` | world objects (bubbles, pads, bank, followers) | `gs` (Game scene) |
| `ui.scene`, `ui.safeTop`, `ui.safeBottom`, `ui.toast`, `ui.banner`, `ui.overview()`, `ui.panelOpened(on)` | chips, panels, banners; panels block v4 input | UI scene, `View.safeTop/safeBottom`, `gs.overview` |
| `ui.orderChip()` | is v4's order chip on screen (the mission chip moves under it) | `gs.scene.get('UI').hud4.orderChip.visible` (`HudV4`, `src/scenes/UI.js:110`, `src/scenes/UIv4.js:41`) |
| `orders.focus()` | the station's standing order, read only: `{ id, item, got, need, shop: { ko, en } | null, reward }` | `Growth.focusCard()` (`src/systems/Growth.js:217`): first item with `got < need`, `reward = cardReward(c)`, `shop` from `t('shop_' + c.shop)` |
| `coins.value()`, `coins.add(n, x, y, fly, tag)`, `coins.spend(n)` | payouts (`tag` 'mission' / 'bank': the IncomeMeter skips them), 후원, 꽃집 | `gs.economy.coins/add/spend` |
| `income.perMin()`, `income.takeEarned()` | reward size, loan size, the bank's 10 % share | kit IncomeMeter |
| `clock.T()`, `hour()`, `day()`, `wall()`, `uptime()`, `localDate()` | game time; real-date keys | `gs.v4.clock` (DayClock, `HOUR` 25 s, same base as story_runtime's `at`), `Date.now()`, local `{ y, m, d, h }` |
| `lang()`, `rank()` | strings, era | `Settings.data.lang`, `gs.v4.rank.level` |
| `facts.has(cap)`, `facts.count(k)` | eligibility (12.4); `step:*` never reaches the game (the host answers it) | kit facts |
| `people.pick(role, ctx)`, `has`, `onScreen`, `name`, `pos → { x, y, headTop }`, `portrait`, `react(pid, anim, emote)`, `figure(who, idx)`, `nearby(x, y, n)`, `follow(pid, on)` | givers, recipients, bubbles, bank customers, escorts (`follow`: the resident walks behind the chief until released) | VillageLife residents + pets, TownSim / story registry (12.5) |
| `places.pos(id)`, `name(id, lang)`, `findSpot(what, near, id)`, `sourceOf(item)?`, `list(kind)` | place steps, finds, craft pads (`list('flowerbed')`), hint targets | 12.5 |
| `chief.x()`, `y()`, `moving()`, `onPad()`, `count(item)`, `take(item, n, tx, ty)`, `flyBag(item, n, tx, ty)`, `flyIn(item, x, y)` | hand-offs; no accept card on a v4 pad | `gs.player`, its stack; `onPad` = any v4 pad `contains(p.x, p.y)` |
| `say(pid, text, emote, dur)` | lines | `gs.life.bubbles.chat` (VillageVoice) |
| `sound.play(key, opts)`, `sound.at(key, x, y, opts)` | sfx | `Audio.play`, `gs.sfxAt` |
| `view.k()`, `view.toScreen(x, y)`, `view.onScreen(x, y, m)` | bubble scale, edge marker, on-screen cap | `View.k`, camera, `gs.isOnScreen` |
| `settings.get('missionToasts')` | toasts on/off | `Settings.data` (P2) |
| `rewards.decor(key, why)`, `voucher`, `effect` | title / streak / weekly rewards | kit (free decor at reward spots; `settlers40`, `tourists20`, `goldCrown`, `bankSite`) |
| `later(id)` | `missions` ↔ `bank`; `vehicles` (`drive(spec)`, `abortDrive()`, `chiefDriving()`); `harbor`, `beach` (wired checks) | ModuleHost |
| `sites.offer(def)` | the bank site | P29 |
| `buildings.list()` | (v8) insurable buildings `[{ id, name: { ko, en }, cost }]` | founded shops (`Growth`), houses, civic buildings with their build cost |
| `assets.fragment(name, { only, audio })` | late art; the bank area art | kit / `Assets` late fragments |
| `progress.setFlag(f)` | mission flags | `gs.progress.setFlag` |
| `story.passbook(pid)` | resident books (`{ rows }` or a Promise of `{ wallet, savings, loans }`) | story_runtime `api.passbook` |
| `emit(ev)` | module events out | GameFeed bus (every module's `onFeed`) |

### 12.3 GameFeed mapping (v4 positional events → feed objects)

| v4 emit (current) | Feed object | Patch |
|---|---|---|
| `'sold' (value)` / `'storeSold'` | `{ t, value, item, n }` | **P8** `src/entities/Seller.js:355` `complete()`: `gs.events.emit(this.cfg.soldEvent || 'sold', value, c.want.type, c.want.count);` |
| `'traded' (price)` | `{ t: 'traded', value, item, n: 1 }` | **E2** `Seller.js:654` trade loop: `gs.events.emit('traded', priceOf(it.type), it.type, 1);` |
| — | `{ t: 'produced', station, item, n }` | **P9** `src/entities/Station.js:140` after `this.outStack.push(this.output, s);`: `gs.events.emit('produced', this.id, this.output, 1);` |
| `'crafted' (kind, outType)` | `{ t: 'crafted', kind, item: outType, n: 1 }` | — |
| `'restMeal' (price, combo)` | `{ t, price, combo }` | — |
| `'boatHome' ()` | `{ t: 'boatHome', catch }` | **E3** `src/entities/Boathouse.js:203`: `gs.events.emit('boatHome', { item_fish_raw: this.cargo.countOf('item_fish_raw'), item_fish_big: this.cargo.countOf('item_fish_big') });` |
| — | `{ t: 'train', ev: 'arrive', n, line }` | **E4** `src/systems/Neighbours.js` `arriveOurs()` (`:411`), after `this.onBoard = [];` and the first-ride fallback (`:421–423`): `gs.events.emit('v4:trainRiders', riders.length, 'main');`; the chief's ride (P14): `{ t: 'train', ev: 'ride', chief: true, line }` |
| — | `{ t: 'wholesale', n }` | **E5** `src/systems/Growth.js:303` `payWholesale(ty, n, …)` first line: `this.gs.events.emit('wholesale', n, ty);` |
| — | `{ t: 'shopSold', item, n: 1 }` | **E1** `src/entities/Shop.js:322` `takeOut(ty)` after `this.stock[ty]--;`: `gs.events.emit('shopSold', ty, 1);` |
| — | `{ t: 'dogAct', kind }` | **E6** `src/systems/DogPlay.js` `start(kind)` (`:150`) after the cooldown is set (`:169`): `gs.events.emit('dogAct', kind);` |
| — | `{ t: 'tap', pid, x, y, talk }` | **P11** `src/systems/VillageLife.js` `react(r)` (`:780`) first line `this.gs.events.emit('tap', 'v:' + r.key, r.x, r.y, false)` and `src/systems/Neighbours.js` `tap()` (`:683`) before the reaction (`'t:' + id`); talking itself arrives as `chat` (E7) |
| — | `{ t: 'chat', pid }` | **E7** `src/systems/ResidentChat.js:227` `onChange: (what, key) => { if (what === 'message') { this.dirty = true; this.gs.events.emit('chat', 'v:' + key); } }` (ChatPanel calls `onChange('message', key, out)`) |
| — | `{ t: 'collect', pad: 'tax', n }` | **E8** `src/entities/Seller.js` `CashPad.update` collect branch (`:63–66`), before `this.gs.economy.add(v, …)`: `if (this.tag) this.gs.events.emit('collect', this.tag, v);`; `src/entities/TownHall.js:32` after `this.tax = new CashPad(gs, tp.x, tp.y);`: `this.tax.tag = 'tax';` |
| `'built' (building, site)` | `{ t: 'built', key, siteId, x, y }` | — |
| `'v4:visitorDone'`, `'v4:shopOpen'`, `'v4:houseDone'` | `visitorDone`, `shopOpen`, `houseDone` | — |
| `'settlers' (n)` | `{ t: 'settlers', n, house }` | P27 adds house |
| — | `{ t: 'day', day }` | **P10** `src/systems/DayClock.js:76` after `this.T += dt;`: `const d = this.day(); if (d !== this._d) { this._d = d; this.gs.events.emit('day', d); }` |
| `'region' (id, instant)` | `{ t: 'region', id }` | — |

Module events (`story:*`, `veh:*`, `harbor:*`, `beach:*`, `lgx:*`, `inc:*`, `bank:*`, `mission:*`) are objects and
pass as they are to every module. `SIGNAL_EVENTS` (`src/missions/model/signals.js`) lists every `t` the counters
listen to (for a kit test that each one is emitted somewhere).

### 12.4 Facts (`facts.has(cap)`)

| Cap | True when |
|---|---|
| `rank:2`, `rank:3` | `gs.v4.rank.level >= n` |
| `b:<key>` | that building exists (store, depot, yard, town_hall, big_restaurant, boat_fishing, school, clinic, memorial, deco_flowers, deco_rink, mini_aquarium, swimwear_shop, **bank**) |
| `item:<item>` | the item can be produced or bought now |
| `craft:bouquet`, `craft:cake`, `craft:gift` | 꽃밭 (deco_flowers), bakery + bread, 잡화점 exist |
| `p:<place>` | the place exists (12.5) |
| `veh:sled`, `veh:truck` | `gs.later.vehicles.has('veh:sled' / 'veh:truck')` |
| `life`, `paper` | story_runtime runs / its newspaper exists |
| `toggle:farewell`, `toggle:incidents` | `Settings.data.lifeFarewell` / `incidents` |
| `v6`, `v7`, `v8`, `v6:star2`, `v7:star2` | district open / its second star |
| `dog`, `pet:pet_penguin` | 콩이 adopted / the penguin lives in the village |
| `towers:3`, `shops:3`, `fame:400` | counts (`facts.count`) reach the number |
| `import:sugar`, `site:memorial` | v6 import / memorial site offered |
| `step:<how>` | **never asked of the game**: the missions host answers from the modules that run |

### 12.5 Places and people (critique M-9)

`places.pos(id)` is one registry for all modules (vehicles_runtime's `src/vehicles/layout.js` already defines some of
the same ids, e.g. `p:bakery`; one id = one spot). A place that does not exist returns null and the missions that
need it are not offered (its `p:*` fact is false).

| Id | Spot | Used by |
|---|---|---|
| `p:plaza`, `p:festival` | plaza centre `WORLD.zones.plaza.center` (990, 800) | C6 delivery, fallbacks |
| `p:board` | the plaza notice board decor (`src/data/world.js:491`, `notice_board`) | E1 (the puppy's owner waits there) |
| `p:snowman` | the plaza snowman decor | A3 |
| `p:farm` | the penguin's pen / farm gate | E3 |
| `p:feast` | the feast tables at the hall (the wedding venue) | C1 deliveries |
| `p:officiant` | the venue's `wedding_arch` `officiantPoint` (`sh.point('wedding_arch', arch.x, arch.y, 'officiantPoint')`, `src/story/view/scenes/Wedding.js:47`) | C2 speech |
| `p:statue1..3` (`p:statue`) | three snow-statue spots around the plaza | C6 |
| `p:tower1..3` (`p:towers`) | the three watchtowers `WORLD.towers` tower_east / tower_south / tower_se (`world.js:377`) | E2 (night) |
| `p:picnic` | the picnic table | C5 |
| `p:carpenter` | the carpenter workshop's door | A11 |
| `p:school_gate`, `p:school` | the town school `t_school` (`world.js:660`) | C4 |
| `p:clinic` | `t_clinic` (`world.js:662`) | A-group delivery |
| `p:memorial` | the memorial garden (life2) | C8 |
| `p:reporter` | the newspaper office / reporter spot | C15 |
| `p:rink`, `p:depot`, `p:old_sign` | skating rink, the vehicles depot, the old sign prop | requests, E4 |
| `p:yard` | the vehicles yard (B1–B9 출발 pad) | drives |
| `p:ferry`, `p:auction`, `p:aquarium`, `p:sailor_lodge`, `p:lighthouse`, `p:harbor_market` | v6 harbour spots | B10, E10, requests |
| `p:beach_gate`, `p:warm_coast`, `p:polar`, `p:sandcastles` | v7 beach spots | requests, explore, C11 |
| `p:logistics_office`, `p:hydrant`, `p:wanted` | v8 logistics office, a hydrant (C14 drill), the wanted board | B11/B12, C14, E12 |
| `p:bank` | the `v5_bank` plot (v4.2 world: L(36.21, −19.93) = (4162, 3111)) | the bank building |
| `p:bakery` | vehicles' `p:bakery` (bakery station − (118, −60)): the cake pad and the B6 stop | cake pad |
| `p:gift`, `p:florist` | in front of the 잡화점 / the 솔방울 꽃집 | gift wrap, bouquet buy |

- `places.list('flowerbed')` → `[{ id, x, y }]` of the 꽃밭 decor.
- `places.findSpot(what, near, id)` → a walkable spot 150–300 px from `near`, stable per `id`.
- `places.sourceOf(item)` → where the item is made / sold.

**`people.pick(role, ctx)`** returns a pid string or null.

- Roles:
  - `role:kid|elder|adult|settler`;
  - `owner:<shopKey>` (the shop's operator);
  - `v:<npcKey>` or `pet:<key>` (that one, if present);
  - `friend` / `crush` (an adult; the story's relation when known).
- `ctx`:
  - `exclude` (Set of pids);
  - `of` (the giver: never pick them as their own recipient);
  - `offScreen` (prefer people off screen);
  - `rng` (`int(n)`, use it for the choice so runs stay deterministic).
- `people.has(pid)` means "is in the registry" (a resident on a train or in LOD still counts); only leaving the
  village makes it false.
- Pids are strings everywhere: `v:<key>` villagers, `pet:<key>`, `t:<id>` townsfolk, `s:<n>` story people.

### 12.6 Patches by file

**P1 `src/scenes/Game.js`**: `import { MODULES as MISSIONS_BANK } from '../missions/index.js';` and
`LATER_MODULES = [...STORY_MODULES, ...MISSIONS_BANK, ...]`. Tap routing in `src/scenes/UI.js:153` (the pointer-up
handler goes on to the pinch code, so no `return`): replace `this.gs.life.tap(wp.x, wp.y);` with
`if (!(this.gs.later && this.gs.later.tap(wp.x, wp.y))) this.gs.life.tap(wp.x, wp.y);`. `ModuleHost.tap` calls
missions, then bank, and returns the first true (the bank always returns false so residents still react).

**P2 `src/core/Save.js`**:
- `SAVE_VERSION` 7 → 8 (v4.2 plan §17: v4.2 = 7, v5 = 8) with a pass-through `MIGRATE[7]`.
- In `sanitizeSave` next to the v4.2 block (`:229–235`): keep `missions` with
  `const ms = sanitizeMissions(raw.missions); if (ms) s.missions = ms;`.
- `bank` is already kept by `keepBank` (`:303`), with the same output as `sanitizeBank` (§5). Replace it by the import
  when the module ships, or keep it and its parity test.
- `Settings.data` (`:567`) gains `missionToasts: true`; validate it like `daynight` (`:578`):
  `this.data.missionToasts = s.missionToasts !== false;`.

**P3 `src/core/Assets.js:39`**: add `'civic'`, `'fx_city'`, `'audio6'` to `LATE_FRAGMENTS` (`ui3`, `life2`, `audio3`
are already there). Register `FRAGMENTS.bankArea` (`civ_bank`) as an area residency class near `p:bank` (within the
800 / 1200 px area-class radii v4.2 uses for the same art); `BankHost` asks for it through `ports.assets.fragment`
once the site is offered or the bank is open, and builds its view only when `civ_bank` is resident.

**P12 `src/scenes/UI.js`**: the module creates its chips and panels on `ports.ui.scene` at v4's positions (mission chip
(28, top + 212), 78 px lower while v4's order chip shows; fame chip right-aligned at (W − 24, top + 162)). It needs
`ports.ui.panelOpened(on)` so v4 dims / blocks input as for its own panels, and a settings row 미션 알림 bound to
`missionToasts`.

**P13 `src/scenes/UIv4.js`** (hall board panel, `:368–404`), replacing P13 of the first report:
- v4's board stays as it is: requests, news, standing order.
- The footer line `t('board_soon')` "마을 임무는 곧 찾아와요!" (`:378`) becomes a button while the module runs:
  ```js
  const M = ui.gs.later && ui.gs.later.missions;
  if (M) p.c.add(ui.makeButton(W / 2, top + ph - 46, 300, 60, 'green', M.hallButton(), () => { this.closePanel(); M.open('board'); }, 24));
  else p.c.add(ui.add.text(W / 2, top + ph - 46, t('board_soon'), TXT(18, '#5d4632', '#ffffff', 0, '800')).setOrigin(0.5));
  ```
- `TownHall.openBoard()` and `boardLines()` are untouched.
- The plaza notice board prop (decor `notice`) opens `open('board')` through the ModuleHost tap routing.

**P17 `src/systems/Rank.js`**: bar reader `fame` = `gs.later.missions.fame().pts` for ranks 3 (400) and 4 (900).

**P20 `src/data/balance.js`**: copy `MISSIONS_TUNING` and `BANK_TUNING` verbatim as `BALANCE.v5.missions` and
`BALANCE.v5.bank` (Korean comments kept); ranges into `balanceCheck.js`.

**P28 `src/entities/UnlockPad.js`** `update`, the shortfall branch (`:245`, `else if (this.remaining > 0 &&
eco.coins <= 0 && … && !this._warned)`), replacing P28 of the first report:
```js
} else if (this.remaining > 0 && eco.coins <= 0 && this.standT > BALANCE.player.padDelay + 0.05 && !this._warned) {
  this._warned = true;                                   // asked / warned once per visit to the pad
  const bank = gs.later && gs.later.bank;
  if (bank && bank.quote(this.remaining, 'build', this.cost)) {
    bank.offerFor(this.remaining, this.id, 'build', this.cost);   // the sheet; on 빌리기 the coins land and the pad pays as usual
  } else {
    gs.ui.toast(t('notEnoughCoins'));
    Audio.play('sfx_error', { volume: 0.5 });
  }
}
```
- `_warned` is already reset when the chief steps off (`:201`), so "안 빌릴래요" is respected until the next visit.
- No Promise per frame.
- `quote()` null → v4's toast as today.
- The loan sheet calls `ports.ui.panelOpened(true/false)`.
- The rank ceremony pad (P17) uses the same lines with `'ceremony'` (loan ≤ 50 % of the cost).
- With v4.2's `Economy.spendable()`: test `spendable() < remaining` instead of `coins <= 0`.
  `Account.quote` takes savings before a loan, which is the same order as v4.2's autopay.

**P29 `src/scenes/Game.js`**: `addModuleSite(id, cfg, kind)`; the bank calls `ports.sites.offer({ id: 'v5_bank',
key: 'bank', cost: { coins, item_plank, item_ingot, time }, onBuilt })` once; the kit maps it to `new Site(gs, id, cfg,
kind)` on the `v5_bank` plot, `onBuilt` → `bank.api.open()` (banner, staff walk-in, `bank:open`). Skipped when the
slice is already `open` (v4.2).

**P30 `src/systems/Tutorial.js`**: in the hint chain after `v4Hint` (`:102`, `if (this.v4Hint(set, dt, idle)) return;`):
`const ft = gs.later && gs.later.missions && gs.later.missions.focusTarget(); if (ft) { set(ft.x, ft.y, ft.icon); return; }`.

**P31**: dropped (v4's order chip stays; §9.1).

### 12.7 v4.2 overlaps (docs/v42_plan_tech.md §7, §17)

- **Bank slice**: v4.2's Bank42 writes `{ v: 1, open, sv, ld, tk, rw }` at the same `v5_bank` plot.
  - `sanitizeBank` keeps it unchanged (bank test).
  - `BankHost` then skips the site; its `BankBuilding` replaces `BankBuilding42` (one line in `Game.js`, v4.2 §17).
- **One owner for savings**: when the module runs, v4.2's Bank42 account logic must hand over to `gs.later.bank`.
  - `Economy.spendable()` = wallet + `bank.account().savings`.
  - `Economy.spend(n)` past the wallet calls `bank.withdraw(short)` first.
  - The 수금원's deposit calls `bank.credit(n)`: a loan is repaid first, the rest saved up to the cap, the overflow
    goes to the wallet. The courier's coins still count as income through `Economy.credit`.
- **Save numbering**: v5 = 8 (P2).
- **Letters**: v4.2's `Letters` card art can host the mission toasts later. Nothing is needed for v5.

### 12.8 Other modules (one-liners each owner adds)

| Module | What | Where |
|---|---|---|
| story_runtime | add `'family'` to the pid list of `out()` so birthdays / school carry `familyPid` (A12's giver = a parent) | `src/story/host.js:490` `for (const k of ['a', 'b', 'who', 'baby', 'family'])` |
| story_runtime | the C2 speech counts when the chief's line plays: `if (P.missions && P.missions.report) P.missions.report({ how: 'speech', code: 'C2' });`. Without it, standing 2 s at `p:officiant` (the same point) also completes it | `src/story/view/scenes/Wedding.js:62` |
| story_runtime | already matches: `engaged { day, hour, at, prepAt, ours }`, `baby`, `named { who }`, `school`, `wish` (+ `story:wish`), `story:wisher`, `story:bank`, `story:move { op: 'in', whoPid }`, `mission:done { wish }` / `mission:expire` for C7 | — |
| vehicles_runtime | already matches: `drive(spec)` with `{ tpl, mid, vehicle, route, cargo, capSpeed, deadline }`, `abortDrive()`, `chiefDriving()`, `has('veh:*')`, `veh:driveDone { mid, stars }` | — |
| harbour | already matches: `harbor:ship` (cargo id = contract id), `harbor:export { id, done }` / `{ expired }`, `harbor:rare`, `harbor:star` | — |
| beach | already matches: `missions.report({ how: 'stand', code: 'E7' })`, `{ how: 'choose', code: 'C11' }`, `{ how: 'tap', what: 'crab' }` | `src/beach/host.js:154,168,205` |
| incidents | the ruin card says "보험으로 다시 지어요" only for insured buildings: `const ins = P.later && P.later('bank'); const key = ins && ins.insured(ev.building) ? 'fireRuin' : 'fireRuinNoIns';` (+ a `fireRuinNoIns` line "… 모두 무사해요! 다시 지어요") | `src/city/incidents/host.js:201`, `strings.js:37` |
| incidents | already matches: `inc:fire { op: 'ruin', building, id }`, `inc:wanted { op: 'post', id, pid }`, `inc:move`, `mission:done { key }` for E12, C14's `mission:accept { at }` | — |

### 12.9 After wiring, check

- `nice -n 15 node --test tools/test/missions_lab/*.test.mjs`. The purity test's third case will then list the game
  files that import the module: update its expectation to the patched files.
- The v4 suites, and v4.2's `save_v42.mjs` / `bank42.test.mjs` parity with `sanitizeBank`.
- A v4.1 / v4.2 save loads with the module off and on: slices pass through untouched while not constructed.
- The kit's GameFeed test that every `SIGNAL_EVENTS` entry is emitted.
- The honest-bot pacing run (§11.1).
- In-game captures matching §8 at zoom 0.6–1.2.
