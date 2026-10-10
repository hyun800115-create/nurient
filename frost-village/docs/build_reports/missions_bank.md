# missions_bank (v5) — build report

촌장 미션 · 명성과 칭호 · 서리 은행 for 행복한 눈꽃마을 이야기 (서리마을), Phaser 3.90.
Built as a **standalone module** (`src/missions/**`, `src/bank/**`), fully tested in Node and in a Phaser lab with the
real art. Nothing in the game imports it yet: it is wired in after v4 ships, with the patches in §11.

Status (2026-10-10): model + views + hosts done; 37 Node tests green (missions 23, bank 11, import hygiene 3);
30 lab captures at phone 390 × 844 DPR 3 and desktop 1280 × 800, 0 console errors, 0 placeholder textures.

---

## 0. 디자이너용 요약 (쉬운 말)

- **미션이 생기는 곳**: 광장 게시판 카드 3장, 주민 머리 위 하트 말풍선(부탁), 이야기 속 행사(결혼식, 아기, 생일 …),
  오늘의 미션 3개(새벽 5시에 바뀜), 이번 주 목표 1개(월요일 새벽 5시), 연속 달성.
- **받는 법**: 말풍선을 누르거나, 그 주민 곁에 0.5초 서 있으면 카드가 떠요 → 받기 / 나중에.
  게시판 카드는 받지 않아도 마을 일을 하다 보면 저절로 채워져요. 2분 동안 진행이 없으면 '다른 미션'으로 바꿀 수 있고,
  하던 것은 보관함에 그대로 남아요.
- **전해 주기**: 필요한 물건을 들고 받는 사람 곁에 가면 물건이 날아가고, 고맙다는 말과 함께 코인이 튀어나와요.
  받는 사람이 걸어 다니면 화면 가장자리에 분홍 동그라미가 그 사람 쪽을 가리켜요.
- **보상**: 코인(= 지금 1분 수입의 몇 배, 최소 100 × 시대) + 명성. 재료는 절대 보상으로 주지 않아요.
- **칭호 5단계**: 새내기(0) → 믿음직한(150, 마을 악단 + 은행 터) → 존경받는(400, 눈꽃 아치) → 명예로운(900, 랜턴 거리)
  → 전설의(2,000, 도시 입구 문 + 금 왕관). 칭호가 오르면 큰 배지와 리본이 뜨고, 상이 마을에 실제로 놓여요.
- **막히는 일 없음**: 지금 마을에서 만들 수 없는 물건·없는 건물·없는 차가 필요한 미션은 아예 나오지 않아요.
  받는 사람이 이사 가면 미션은 조용히 끝나요(벌칙 없음).
- **서리 은행**: 저금하면 매일 아침 6시에 1 % 이자(5만 코인까지). 건설 패드에서 코인이 모자라면 "은행에서 빌릴까요?"
  (지금 수입의 15분어치까지, 수수료 5 %). 갚는 건 버는 돈의 10 %씩 저절로, 코인이 마이너스가 되는 일은 없어요.
  주민들도 번호표를 뽑고 줄을 서고, 통장을 볼 수 있어요. (v8) 화재 보험.
- 숫자는 `src/missions/tuning.js`, `src/bank/tuning.js` (한국어 주석) 에서 바꿔요. 미션 목록은
  `src/missions/data/catalog.js` (한 줄 = 미션 하나).

---

## 1. What it does

### 1.1 Missions (98 templates, docs/v5_v8_plan.md §7)

| Group | n | Source | How it reaches the chief |
|---|---|---|---|
| A 부탁 (requests) | 22 | request bubbles over residents / pets | ≤ 4 bubbles world-wide, ≤ 2 on screen, one every 45–90 s, untouched bubbles pop after 6 min; accept by tap or by standing ≤ 90 px still for 0.5 s; ≤ 3 accepted |
| B 배달 운전 (drives) | 12 | board | stars ★/★★/★★★ scale coins 0.6 / 0.85 / 1.0, ★★★ +5 fame; steps come from vehicles_runtime (`veh:driveDone`) |
| C 행사 (events) | 16 | story / districts | wedding prep + speech, baby gift, school day escort, three wishes, farewell bouquet, birthday cake, welcome party, festivals, the first newspaper |
| D 생산 목표 (goals) | 14 | board | counted from feed signals (`sold:*`, `made:*`, `catch:*`, `traded:*`, riders, customers, tax …) |
| E 탐험 (explore) | 13 | board | stand / find (a sparkle appears) / return / lead steps at places and people |
| F 오늘의 미션 | 12 | daily pool, 3 drawn | local date with a 05:00 reset (setting `daily.clock: 'real' / 'game'`) |
| G 이번 주 목표 | 6 | weekly | three stages, decor of the week in rotation |
| H 연속 달성 | 3 | rules | daily streak with 눈사람 방패, kind-chief combo, three-star drive streak |

- **Instances** move board → active (or bubble → accepted) → done; **park** keeps progress; the focus rule for the chip:
  an event due within 75 s of game time (3 game hours) → an accepted request → the board card with most progress.
- **Rewards**: `coins = max(payFloor × era, round10(pay × I))`, `I` = income per minute (module payouts and loans
  excluded), `era = max(1, rank − 1)`; fame fixed per template. Payouts go through `ports.coins.add(…, 'mission')`.
- **Mission items** (꽃다발, 케이크, 선물 상자, 편지) live in a 12-slot mission bag in the missions slice, made at craft
  pads (flower bed ≤ 6 bouquets a day, bakery cake = 12 bread + 20 s, gift wrap = 3 goods). v4 items are untouched.
- **Never a dead end**: every template's requirements = unlock + need + what its objectives imply (items producible,
  places, signal sources, vehicle for drive steps). A static closure test proves every implied requirement is covered by
  the declared unlock; at offer time `facts.has()` is checked again; every 5 s active missions are revalidated and end
  gently (`expire 'gone'`, no coins taken, letters leave the bag) when the recipient left.
- **Calendar**: day key = local date with 05:00 reset (DST-safe, built from local fields), week key Monday 05:00; a
  clock moved backward never rerolls or double counts; at most one rollover per launch (exception: 20 h uptime);
  streak with one 눈사람 방패 a week.
- **Fame**: points from missions + passive sources (+1 per 25 riders, +5 wedding / birth, +5 new shop / house / star,
  +2 happening watched); titles at 0 / 150 / 400 / 900 / 2000 with rewards (decor via `ports.rewards.decor`, effects
  `settlers40`, `bankSite`, `tourists20`, `goldCrown`), flairs (crown 24 h real time, best driver 1 game day).

### 1.2 서리 은행 (기획서_v8 §2)

- **Account** (chief): savings and loan never coexist (a deposit repays first, a quote uses savings first); interest
  1 %/game day at 06:00 on at most 50,000 (150,000 after the harbour, v6); loans up to 15 min of income (ceremonies:
  50 % of the cost), 5 % flat fee, repaid from 10 % of v4 earnings and never more than the wallet holds; after 6 game
  days the fee is waived (twice at most), then the automatic share pauses (deposits still repay). A loan never grows.
- **No money farming**: interest only on own coins (borrowed coins cannot be saved: deposits repay first), so any
  strategy over 60 days gains at most the interest on its own coins (tested).
- **Branch**: open 09–17, numbered tickets (wrap at 999), 3 windows, a queue of 3, bench of 2, ≤ 8 inside, served by
  arrival order; residents come from story `bank` events; the number display on the back wall, `sfx_ticket_chime`.
- **Views**: the civic `bank` cutaway (shell fades when the chief is near / taps it), tellers at `staffPoints`, the
  manager at his desk, customers walking in through the door, the vault door turns for deposits ≥ 5,000, coins fly to
  the window, the 창구 counter pad → counter sheet, the passbook (chief + 5 nearest residents), the loan sheet.
- **(v8) insurance**: premium 0.4 %/day of the build cost, a claim pays 100 % once per fire, never for a lapsed policy.
- **Site**: offered at title 2 (믿음직한 촌장) or 읍 + 20 min, 9,000 coins + 30 planks + 20 ingots, 14 s (v4 Site flow, P29).

---

## 2. Files

All under `/home/user/nurient/frost-village/`. Pure = no Phaser, DOM, timers or wall clock (enforced by a test).

| File | Layer | What |
|---|---|---|
| `src/missions/index.js` | entry | `MISSIONS_MODULE`, `BANK_MODULE`, `MODULES`, `FRAGMENTS` (plan §5.2 shape) |
| `src/missions/tuning.js` | data (pure) | `MISSIONS_TUNING` (Korean comments) → `BALANCE.v5.missions` |
| `src/missions/data/catalog.js` | data (pure) | the 98 templates, ko + en, one line each |
| `src/missions/data/caps.js` | data (pure) | requirements, closure, implied caps per objective |
| `src/missions/lib/rng.js`, `lib/calendarKeys.js` | pure | mulberry32 RNG (one uint32 saved), day / week keys |
| `src/missions/model/missions.js` | model (pure) | instances, offers, board, bubbles, events, steps, rewards, park / swap, focus, revalidation |
| `src/missions/model/calendar.js` | model (pure) | daily / weekly / streak / shield |
| `src/missions/model/fame.js` | model (pure) | points, titles, rewards, flairs |
| `src/missions/model/signals.js`, `model/units.js` | model (pure) | feed event → signals; objective units |
| `src/missions/save.js` | pure | `MISSIONS_SLICE`, `sanitizeMissions`, `fitCap` |
| `src/missions/strings.js` | pure | `MSTR` ko + en, `mt()` |
| `src/missions/host.js` | host | `MissionsHost`: ports → env, world interactions, event application, api |
| `src/missions/view/ui.js` | view | text styles, buttons, icons, bars (v4 `Panel` 9-slice) |
| `src/missions/view/Chips.js` | view | `MissionChip` (focus mission), `FameChip` (crown, stars, 명성) |
| `src/missions/view/MissionPanel.js` | view | panel tabs 진행 중 · 게시판 · 오늘 · 이번 주 · 칭호 (non-pausing) |
| `src/missions/view/RequestBubbles.js` | view | pooled heart bubbles + "for me" bubble + ring at the recipient |
| `src/missions/view/Overlays.js` | view | `AcceptCard`, `DoneStamp`, `TitleBanner`, `EdgeMarker` |
| `src/missions/view/CraftPads.js` | view | 꽃밭 bouquet, bakery cake, gift-wrap pads; find sparkles |
| `src/bank/tuning.js` | data (pure) | `BANK_TUNING` → `BALANCE.v5.bank` |
| `src/bank/model/account.js`, `model/branch.js` | model (pure) | `Account`, `Branch` |
| `src/bank/save.js` | pure | `BANK_SLICE`, `sanitizeBank`, `fitBank` |
| `src/bank/host.js` | host | `BankHost` |
| `src/bank/view/BankBuilding.js` | view | cutaway, tellers, queue, display, vault, counter pad, coin flights |
| `src/bank/view/BankPanels.js` | view | `CounterSheet`, `PassbookPanel`, `LoanSheet` |
| `tools/test/missions_lab/missions.test.mjs` | test | 23 tests |
| `tools/test/missions_lab/bank.test.mjs` | test | 11 tests |
| `tools/test/missions_lab/purity.test.mjs` | test | 3 import-hygiene tests |
| `tools/test/missions_lab/fake_world.mjs` | test | `FakeWorld` (clock, facts, people), `Wallet` |
| `tools/test/missions_lab/lab.html`, `lab.js`, `fake_ports.js`, `run_lab.mjs` | lab | Phaser lab + FakePorts + Playwright runner |
| `docs/previews/missions_lab_*.png|gif`, `missions_lab_numbers.json` | previews | §8 |

Run: `cd /home/user/nurient/frost-village && node --test tools/test/missions_lab/*.test.mjs` and
`nice -n 15 node tools/test/missions_lab/run_lab.mjs --only=bubbles,accept,delivery` (scenario groups ≤ 2 min each;
partial runs merge into the numbers file).

---

## 3. Public API

### 3.1 Module entries (`src/missions/index.js`)

```js
MISSIONS_MODULE = { id: 'missions', version: 1, saveKey: 'missions', capBytes: 3072, needs: ['story?', 'bank?', 'vehicles?'],
                    gate: (gs) => gs.v4.rank.level >= 2, prefetch, create: (ports, saved) => new MissionsHost(...), sanitize, previews }
BANK_MODULE     = { id: 'bank', version: 2, saveKey: 'bank', capBytes: 1024, needs: ['missions?', 'story?'], gate: same, ... }
MODULES = [BANK_MODULE, MISSIONS_MODULE]          // plan tick order: story → bank → missions → vehicles …
```

Host surface (both): `update(dt)`, `serialize()`, `state()`, `api`, `onFeed(ev)`, `tap(wx, wy) → bool`, `objects()`,
`destroy()`.

### 3.2 `gs.later.missions` (= `MissionsHost.api`)

| Call | Returns |
|---|---|
| `boardLines()` | `[{ icon, text }]` for the hall board (P13) |
| `active()` | `[{ id, code, f, due }]` accepted + board missions |
| `focus()` / `focusTarget()` | `{ id, code, f }` / `{ x, y, icon, id }` or null (P30 hints, edge marker) |
| `offer({ code, key, who, family, at, … })` | id (0 if not eligible): other modules' missions (harbour, beach, wanted posters) |
| `report({ how, code?, who?, n?, stars? })` | true when an active mission took a step another module owns (escort, choose, drive, identify, carry) |
| `fame()` | `{ pts, title, next }` |
| `open(tab)` | opens the panel (`'active' | 'board' | 'today' | 'week' | 'titles'`) |
| `bag()` | mission bag counts |

### 3.3 `gs.later.bank` (= `BankHost.api`)

| Call | Returns |
|---|---|
| `account()` | `{ savings, loan: { left, fee } | null, interestToday }` |
| `maxLoan(kind, cost)` | coins |
| `offerFor(short, padId, kind = 'build', cost = 0)` | `Promise<boolean>`: true when the coins are now in the wallet (P28) |
| `deposit(n)`, `withdraw(n)` | `{ repaid, saved }` / n |
| `insured(id)`, `insure(id, cost)`, `claim(id, fireId)` | v8 insurance |
| `passbookRows(pids)` | `[{ pid, rows: [[day, op, amount, balance]] }]` |
| `open()`, `isOpen()` | the branch (P29 calls `open` from the site's onBuilt) |

---

## 4. Events

### 4.1 In (feed objects `{ t, ... }`; the GameFeed re-emits v4's positional events with names, plan §5.4)

| `t` | Payload the model reads | Counts as | v4 source today |
|---|---|---|---|
| `sold`, `storeSold` | `{ value, item, n }` | `cust`, `sold:<item>` | `Seller.complete` (P8 adds item, n) |
| `shopSold` | `{ item, n }` | `sold:<item>` | founded shops: `Shop.takeOut` (new E1) |
| `traded` | `{ value, item, n }` | `traded:<item>` | `Seller` trade loop (E2 adds item) |
| `restMeal` | `{ price, combo }` | `cust`, `combo` | `BigRestaurant` (as is) |
| `produced`, `crafted` | `{ item, n }` | `made:<item>` | `Station` (P9), `Workshop` (as is: `kind, outType`) |
| `boatHome` | `{ catch: { item_fish_raw, item_fish_big } }` | `catch:<item>` | `Boathouse` (E3 adds the catch) |
| `visitorDone` | — | `visitor` | `'v4:visitorDone'` |
| `train` | `{ ev: 'arrive', n, line }`, `{ ev: 'ride', chief, line }` | `riders`, `chief_ride` | `Neighbours.arriveOurs` (E4) |
| `wholesale` | `{ n }` | `wholesale` | `Growth.payWholesale` (E5) |
| `dogAct` | `{ kind: 'treat' | 'play' | 'pet' }` | `dog:<kind>` | `DogPlay.start` (E6) |
| `tap` | `{ pid, x, y, talk }` | `chat` when `talk` | `VillageLife.react`, `Neighbours.tap` (P11 + talk flag) |
| `chat` | — | `chat` | ResidentChat message sent (E7) |
| `collect` | `{ pad: 'tax', n }` | `tax` | `CashPad` collect in `TownHall` (E8) |
| `built` | `{ key }` | unlocks, A8 | `Site` `'built'` |
| `houseDone`, `shopOpen` | — | A8, fame | `'v4:houseDone'`, `'v4:shopOpen'` |
| `settlers` | `{ n }` | C5 welcome party | `Civic` `'settlers'` |
| `day` | `{ day }` | calendar check | `DayClock` (P10) |
| `story:life` | `{ op, a, b, who, baby, aPid, bPid, whoPid, babyPid }` | C1/B6, C2, C3, C4, C7, C8, C9/A12 + fame | story_runtime |
| `story:move` | `{ op: 'in', whoPid, home }` | A8, A21, B12 | story_runtime |
| `story:news`, `story:happening` | `{ first }`, `{ watched }` | C15 once, fame | story_runtime |
| `story:bank` (bank) | `{ op, who, whoPid, amount }` | branch arrivals | story_runtime |
| `veh:arrive`, `veh:ride`, `veh:driveDone` | `{ riders }`, `{ chief, line }`, `{ mid, stars }` | riders, chief_ride, drive steps | vehicles_runtime |
| `harbor:*`, `beach:*`, `lgx:*`, `inc:*` | see `model/signals.js` | v6–v8 goals | later modules |
| `inc:fire` (bank) | `{ op: 'ruin', building, id }` | insurance claim | incidents (v8) |
| `region` (bank) | `{ id: 'harbor' }` | deposit cap 150,000 | `Territory` |

Story payloads are normalised in the model (`storyIds`): game pids are taken from `*Pid`, a person the game cannot
show gives no mission (escorts require the person). Tested with the story_runtime shapes.

### 4.2 Out (`ports.emit`, plan §5.4 namespaces)

Missions host (every model event, after the host applied it): `mission:offer|accept|progress|delivered|stage|done|
expire|park|resume|later|flag`, `daily:new|progress|done|all`, `weekly:new|progress|stage`, `streak:day|shield`,
`combo`, `fame:pts|title`, `reward { kind: decor|voucher|effect|flair, key, why }`, `bag`.
Bank host: `bank:deposit|withdraw|interest|loan|repaid|restructure|pause|premium|lapsed|insure|claim`. The branch's
`branch:ticket|call|move|served` stay inside the bank (they drive the building view only).

---

## 5. Save slices

| Slice | Version | Cap | Measured |
|---|---|---|---|
| `missions` | 1 | 3,072 B | 1,346 B after 30 simulated game days; `fitCap` trims fame log, bubbles, parked, cooldowns in that order |
| `bank` | 2 (v1 → v2 migrates: insurance added) | 1,024 B | worst case 1,012 B with 10 policies + 8 rows; `fitBank` trims rows |

`missions`: `{ v, sd, rs (rng state), n, t5, bt, rq, b[] / a[] / p[] / o[] (instances { i, c, t0, g?, tp?, d?, gv?,
w?, nm?, k?, sg? }), c (cooldowns in catalog order), bag, dy (daily { d, ids, g, k, a }), wk (weekly { w, c, g, s }),
st (streak { n, last, sw }), cb (combo), ds, fm (fame { p, r, fl, lg ≤ 12 }), fl (once flags), st2 (settlers today) }`.
`bank`: `{ v (1, or 2 once a policy exists), open, sv, ld, tk, so, t5, v6, ln: { a, l, f, t0, d0, rs, ps, k }?, rw[≤ 8],
ins: [[id, cost/100 (negative = lapsed), fireHash]]? }`.
`sanitize*` are pure, idempotent and never throw (200 fuzzed slices each in the tests).

---

## 6. Tuning (`BALANCE.v5.missions`, `BALANCE.v5.bank`)

Defaults live in `src/missions/tuning.js` and `src/bank/tuning.js` (Korean comments for the designer); the hosts merge
`BALANCE.v5.*` one level deep over them (`missionsTuning`, `bankTuning`). Values follow plan §6.2 plus: `acceptStill`
0.5, `focusDeadline` 75, `revalidate` 5, `streak.crownHours` 24, `streak.driverFlair` 600, `craft.bagMax` 12,
`goalLastHour` 18, `maxParked` 6, `eventStale` 1800, `weekly.decor` rotation, `bank.minLoan` 100, `bank.branch` (hours, windows, queue,
seats, serve times), `bank.vaultAt` 5,000.

---

## 7. Numbers

### 7.1 Node (fixed seeds)

| Check | Result |
|---|---|
| missions model, 36,000 ticks at 60 fps with feed events | **0.0003–0.0005 ms / tick** over runs (budget 0.02) |
| bank (clock + income share + branch) | **0.0006 ms / tick** (budget 0.01) |
| 30 game days, oracle player (completes everything it is offered) | offers/day min 14 · avg 22.4 · max 32; 679 completions (22.6/day: goal 253, request 205, drive 113, event 58, explore 50); 66 distinct templates; bubbles ≤ 2, accepted ≤ 3; titles 2→5 in order |
| every offer completable (oracle) | 0 problems; static closure covers every implied requirement |
| determinism + reload mid-run | identical event streams and slices |
| conservation (bank) | wallet + savings − loan moves only by income, spending, interest, fees, waivers, premiums, claims |

### 7.2 Phaser lab (Chromium, SwiftShader GL, phone 390 × 844 DPR 3)

| Measure | Value |
|---|---|
| host update incl. views, busy minute (bubbles, board, bank queue) | missions **0.012–0.022 ms**, bank **0.002–0.006 ms** per frame across runs (browser timer granularity 0.1 ms; p95 reads 0.1) |
| draw calls per frame | 5 (plaza + bubbles), 7 (bank open + queue), 8 (desktop panel) |
| display objects | world 104–136, UI 52–136 (panel open); module-owned 26–41 |
| textures the module adds | **9.65 MiB**: civ_bank 5.02, life2_wedding 1.63, ui3_icons 1.17, ui4_icons 1.02, life2_decor 0.30, ui_passbook 0.15, ui_mission_board 0.14, cards 0.16, rest < 0.1 (lab total 183.7 MiB, mostly v4 art the lab loads to look like the game) |
| console errors / 404s / placeholder textures | 0 / 0 / 0 |

All numbers: `/home/user/nurient/frost-village/docs/previews/missions_lab_numbers.json`.

---

## 8. Lab shots

Phone 390 × 844 at DPR 3 (stored at 780 px wide), GIFs at 390 px. Inspected one by one; fixes made after inspection are
listed in §9.3.

| File | Shows |
|---|---|
| `docs/previews/missions_lab_plaza_bubbles.png` | 4 request bubbles (bread ×5 at the bakery aunt, grilled fish ×3 at 나비, the kid's heart, fish ×3 at 뽀삐), mission chip, fame chip |
| `docs/previews/missions_lab_accept_card.png` | standing next to the aunt: portrait card, her line, task, +540 / +5, 나중에 / 받기 |
| `docs/previews/missions_lab_accepted.png` | after 받기: her speech bubble, chip now "할머니께 빵 5개 갖다 드리기 0/5", grandma's "for me" bubble + pink ring |
| `docs/previews/missions_lab_delivery.gif`, `missions_lab_delivery_done.png` | bread from the bakery to grandma's bench: bread flies, thanks bubble, coins fly to the counter, the green stamp |
| `docs/previews/missions_lab_edge_marker.png`, `missions_lab_moving_recipient.gif`, `missions_lab_moving_done.png` | a letter for 목수 김씨 who walks a loop off screen: the pink edge marker, camera follows the chief, hand-over on the move |
| `docs/previews/missions_lab_panel_active.png`, `_board.png`, `_today.png`, `_week.png`, `_titles.png`, `_active_en.png` | the five tabs (board with 다른 미션 and the "no need to accept" note; today with streak strip and 눈사람 방패; week with stages and the igloo; titles with badges and reward art); English |
| `docs/previews/missions_lab_chip_focus.png` | focus switching: board goal → accepted request → an event about to start (red deadline) |
| `docs/previews/missions_lab_title_up.gif`, `missions_lab_title_up.png`, `missions_lab_band.png` | 믿음직한 촌장: rays, badge pop, ribbon, star burst, badge flies to the fame chip; the bard plays at the new music stand |
| `docs/previews/missions_lab_zoom06.png`, `missions_lab_zoom12.png` | bubbles stay the same size on screen at zoom 0.6 and 1.2 |
| `docs/previews/missions_lab_bank_closed.png` | the bank shell, 은행 창구 label, counter pad |
| `docs/previews/missions_lab_bank_queue.gif`, `missions_lab_bank_open_queue.png` | six residents walk in, tickets 1–6 called one per second, windows serve, number display |
| `docs/previews/missions_lab_bank_counter.png` | counter sheet: piggy, savings, interest and cap, loan state, 저금하기 1,000 / 전부 / 꺼내기 / 통장 |
| `docs/previews/missions_lab_bank_vault.gif` | 6,000 deposit: coins fly in, the vault door turns |
| `docs/previews/missions_lab_bank_passbook.png`, `missions_lab_bank_passbook_resident.png` | the chief's book (stamped rows, 저금 5,560 pill) and 순자 할머니's (loan, repayments, 대출 430), neighbours' tabs |
| `docs/previews/missions_lab_bank_loan.png` | "은행에서 빌릴까요? 1,800 빌리기 (수수료 5 %)" on a short pad |
| `docs/previews/missions_lab_desktop_plaza.png`, `missions_lab_desktop_panel.png` | 1280 × 800 (the game is a pillarboxed portrait column, as v4's main.js) |

---

## 9. Decisions and deviations

### 9.1 Interpretations of the plan
- Bank site at **title 2** (the plan's bank table says "title 1", but title 1 is where everyone starts; the titles
  table gives the bank site to 믿음직한 촌장) or 읍 + 20 min.
- Restructure = fee waived after 6 game days (twice), then the automatic share pauses; deposits still repay.
- "At most one rollover per launch" taken literally, with a 20 h uptime exception so a tablet left running still rolls.
- One lab for missions and bank (`tools/test/missions_lab`, as the task names) instead of the plan's two labs.
- View files are grouped (Chips, Overlays, CraftPads, BankBuilding, BankPanels) instead of one per class; the plaza /
  hall / station boards are hooks (P13) and hints are `focusTarget()` for P30, not separate files.
- Slices use compact keys (shapes in §5) instead of the plan's illustrative names; caps kept.

### 9.2 Catalog fixes (found by the closure test)
A8 needs `b:store` (gift box); C8 needs `b:memorial`; B1/B2 need `veh:sled`, B3+ `veh:truck`; E2 needs `towers:3`;
B8 deadline 25 s → 75 s (not drivable in 25 s); C7 split in 3 stages (0.3 pay / 15 fame each = plan totals).

### 9.3 Fixes made after inspecting captures
Cards opening by proximity in shots (chief placed beside givers) → scenario positions; speech bubbles clipped at the
screen edge → clamped; board tab had no explanation → one easy line + 다른 미션 shown; week card overflow and missing
"what counts" → `wk_*` line, tighter card, decor art centred; title 1 row empty → "모든 촌장님은 여기서 시작해요";
fame chip counting down from a stale value → snaps; bank customers invisible (walk tween killed the fade-in) → fixed,
they now enter through the door; ticket pills stacked → one call per second; counter-sheet buttons overlapping →
laid out to fit; passbook "촌장님 님" → "촌장님의 통장", header in the title box, close button on the corner,
summary pill, height follows the rows; counter sheet hidden under the passbook / loan sheet.

---

## 10. Known issues and limits

1. **Pacing measured only with the oracle** (completes every offer): titles 2→5 within ~7 game days. Real pacing must
   be checked with the kit's honest bots after wiring; knobs: `fame.titles`, template fame, `requestEvery`.
2. **Bank interior crowding**: the cutaway is 5.4 × 4.6 m; with 6 people inside, figures (villager sprites in the lab,
   104 px dolls in the game) overlap at the windows. Lowering the inside cap from 8 to 6 is one tuning line if wanted.
3. **Resident passbooks** show current savings and loans ("모은 돈", "대출") because the story engine keeps no per-person
   ledger; dated rows need story_runtime to keep the last 8 bank ops per person (its `lifelog` already records them).
4. Escort / choose / identify / carry / drive steps progress only when their owner module reports them
   (`api.report` or a `mstep` feed event). Without those modules the missions are not offered (requirements `life`,
   `veh:*`, `v8`); if a module runs but never reports, the mission ends gently at its deadline or, for events without
   one (C7 three wishes), after `eventStale` = 3 game days without progress (tested), so nothing stays stuck.
5. On board cards that can be swapped, the 다른 미션 button covers the fame line.
6. GIF sizes: `missions_lab_moving_recipient.gif` 3.1 MB (camera follow changes every frame); others 0.3–1.1 MB.
7. Browser timings have 0.1 ms granularity; the Node figures are the reliable per-tick costs.
8. A snapshot of the early model files (catalog, caps, lib, model, save, tuning) was swept into commit `65c39f3`
   ("v4.1 published") by the lead's publish; the working tree has newer `calendar.js`, `missions.js`, `save.js` and the
   untracked views, hosts and tests. This job did not commit anything.

---

## 11. Integration

Line numbers are from the tree at 2026-10-10 01:20 UTC (after `65c39f3`). The v4 workflow owns `src/**` (outside these
two folders), `index.html`, `tools/build/**` and the existing tests and was still allowed to change them; the v4 game
files below had not changed for four hours when this was written, but **anchor on the function names**, not the
numbers. No patch below has been applied; none is needed for v4 to keep working.

### 11.1 Order

1. Kit (lead, plan §5.9): `ModuleHost`, `Ports` (table 11.2), `GameFeed` (table 11.3), `IncomeMeter`, facts (11.4).
2. P20 balance blocks, P2 save slices + setting, P3 fragments.
3. P1 construct `MODULES` from `src/missions/index.js` (after story_runtime's entry).
4. Feed patches P8–P11, E1–E8; UI patches P12, P31; P13 hall board; P28 pads; P29 site; P30 hints; P17 fame bar.
5. Run `node --test tools/test/missions_lab/*.test.mjs`, the v4 suites, a save round trip with and without the module,
   then compare in-game captures with §8.

### 11.2 Ports the hosts use (the lab's `tools/test/missions_lab/fake_ports.js` is the reference implementation)

| Port | Used for | Backed by in the game |
|---|---|---|
| `world.scene` | world objects (bubbles, pads, bank) | `gs` (Game scene) |
| `ui.scene`, `ui.safeTop`, `ui.safeBottom`, `ui.toast`, `ui.banner`, `ui.overview()`, `ui.panelOpened(on)` | chips, panels, banners | UI scene (`scenes/UI.js`), `View.safeTop/safeBottom`, `gs.overview` |
| `coins.value()`, `coins.add(n, x, y, fly, tag)`, `coins.spend(n)` | payouts (`tag` 'mission' / 'bank' so the IncomeMeter skips them) | `gs.economy.coins/add/spend` |
| `income.perMin()`, `income.takeEarned()` | reward size, loan size; the bank's 10 % share of new v4 earnings | kit IncomeMeter (`takeEarned` = untagged earnings since the last call) |
| `clock.T()`, `hour()`, `day()`, `wall()`, `uptime()`, `localDate()` | game time; the daily/weekly real-date keys | `gs.v4.clock` (DayClock), `Date.now()`, `performance.now()`, local `{ y, m, d, h }` |
| `lang()`, `rank()` | strings, era | `Settings.data.lang`, `gs.v4.rank.level` |
| `facts.has(cap)`, `facts.count(k)` | eligibility (11.4) | kit facts |
| `people.pick(role, ctx)`, `has`, `onScreen`, `name`, `pos → { x, y, headTop }`, `portrait`, `react(pid, anim, emote)`, `figure(who, idx)`, `nearby(x, y, n)` | givers, recipients, bubbles, bank customers | VillageLife residents + pets, TownSim / story registry (`figure` = a doll the bank owns, not a TownSim body) |
| `places.pos(id)`, `name(id, lang)`, `findSpot(what, near, id)`, `sourceOf(item)?`, `list(kind)` | place steps, finds, hint targets | `WORLD.v5` places (`p:feast`, `p:officiant`, `p:bank` …) |
| `chief.x()`, `y()`, `moving()`, `count(item)`, `take(item, n, tx, ty)`, `flyBag(item, n, tx, ty)` | hand-offs | `gs.player`, its stack |
| `say(pid, text, emote, dur)` | thanks / offer lines | `gs.life.bubbles.chat` (VillageVoice) |
| `sound.play(key, opts)`, `sound.at(key, x, y, opts)` | sfx | `Audio.play`, `gs.sfxAt` |
| `view.k()`, `view.toScreen(x, y)`, `view.onScreen(x, y, m)` | bubble scale, edge marker | `View.k`, camera, `gs.isOnScreen` |
| `settings.get('missionToasts')` | toasts on/off | `Settings.data` (P2) |
| `rewards.decor(key, why)`, `voucher`, `effect` | title / streak / weekly rewards | kit: free decor at `WORLD.v5.rewardSpots[key]`; effects `settlers40` → Civic settler interval, `tourists20`, `goldCrown`, `bankSite` |
| `later(id)` | bank ↔ missions (title for the bank site) | ModuleHost |
| `sites.offer(def)` | the bank site | P29 |
| `progress.setFlag(f)` | mission flags | `gs.progress.setFlag` |
| `story.passbook(pid)` | resident books (sync `{ rows }` or a Promise of `{ wallet, savings, loans }`) | story_runtime `host.api.passbook` |
| `emit(ev)` | module events out | GameFeed bus |

### 11.3 GameFeed mapping (v4 positional events → feed objects)

| v4 emit (current) | Feed object | Patch |
|---|---|---|
| `'sold' (value)` / `'storeSold' (value)` | `{ t, value, item, n }` | **P8** `src/entities/Seller.js` `complete()` (line ~355): `gs.events.emit(this.cfg.soldEvent || 'sold', value, c.want.type, c.want.count);` |
| `'traded' (price)` | `{ t: 'traded', value, item, n: 1 }` | **E2** `Seller.js` trade loop `onDone` (line ~654): `gs.events.emit('traded', priceOf(it.type), it.type, 1);` |
| — | `{ t: 'produced', station, item, n }` | **P9** `src/entities/Station.js` fly `onDone` after `this.outStack.push(this.output, s);` (line ~140): `gs.events.emit('produced', this.id, this.output, 1);` |
| `'crafted' (kind, outType)` | `{ t: 'crafted', kind, item: outType, n: 1 }` | — (feed names the args) |
| `'restMeal' (price, combo)` | `{ t, price, combo }` | — |
| `'boatHome' ()` | `{ t: 'boatHome', catch }` | **E3** `src/entities/Boathouse.js` `back` state (line ~203): `gs.events.emit('boatHome', { item_fish_raw: this.cargo.countOf('item_fish_raw'), item_fish_big: this.cargo.countOf('item_fish_big') });` |
| `'v4:train' (ev, stop)` | `{ t: 'train', ev, stop, line }` | P14 adds `line` |
| — | `{ t: 'train', ev: 'arrive', n, line }` | **E4** `src/systems/Neighbours.js` `arriveOurs()` after `this.onBoard = [];` and the first-ride fallback (line ~423): `gs.events.emit('v4:trainRiders', riders.length, 'main');` → feed maps to `{ t: 'train', ev: 'arrive', n, line }`; when the chief rides (P14): `{ t: 'train', ev: 'ride', chief: true, line }` |
| — | `{ t: 'wholesale', n }` | **E5** `src/systems/Growth.js` `payWholesale(ty, n, …)` (line ~290): first line `this.gs.events.emit('wholesale', n, ty);` |
| — | `{ t: 'shopSold', item, n: 1 }` | **E1** `src/entities/Shop.js` `takeOut(ty)` (line ~322) after `this.stock[ty]--;`: `gs.events.emit('shopSold', ty, 1);` |
| `'dogLove' (love)` | — | **E6** `src/systems/DogPlay.js` `start(kind)` after the cooldown is set (line ~169): `gs.events.emit('dogAct', kind);` → `{ t: 'dogAct', kind }` |
| — | `{ t: 'tap', pid, x, y, talk }` | **P11** `src/systems/VillageLife.js` `react(r)` first line and `src/systems/Neighbours.js` `tap()` before the reaction: `gs.events.emit('tap', pid, wx, wy, opensChat)` |
| — | `{ t: 'chat' }` | **E7** `src/systems/ResidentChat.js`: when the chief sends a message, `gs.events.emit('chat', pid)` |
| — | `{ t: 'collect', pad: 'tax', n }` | **E8** `src/entities/Seller.js` `CashPad.update` collect branch (line ~64): `if (this.tag) this.gs.events.emit('collect', this.tag, v);` and in `src/entities/TownHall.js` constructor after `this.tax = new CashPad(gs, tp.x, tp.y);` (line ~32): `this.tax.tag = 'tax';` |
| `'built' (building, site)` | `{ t: 'built', key: building.key || building, siteId, x, y }` | — |
| `'v4:visitorDone'`, `'v4:shopOpen'`, `'v4:houseDone'` | `visitorDone`, `shopOpen`, `houseDone` | — |
| `'settlers' (n)` | `{ t: 'settlers', n, house }` | P27 adds house |
| — | `{ t: 'day', day }` | **P10** `src/systems/DayClock.js` `update(dt)` after `this.T += dt;` (line ~76): `const d = this.day(); if (d !== this._d) { this._d = d; this.gs.events.emit('day', d); }` |
| `'region' (id, instant)` | `{ t: 'region', id }` | — |

Every module event (`story:*`, `veh:*`, `harbor:*`, `beach:*`, `lgx:*`, `inc:*`) is already an object and passes as is.
`SIGNAL_EVENTS` in `src/missions/model/signals.js` lists every `t` the counters listen to (for a kit test that each one
is emitted somewhere).

### 11.4 Facts (`facts.has(cap)`)

| Cap | True when |
|---|---|
| `rank:2`, `rank:3` | `gs.v4.rank.level >= n` |
| `b:<key>` | that building exists (store, depot, yard, town_hall, big_restaurant, boat_fishing, school, clinic, memorial, deco_flowers, deco_rink, mini_aquarium, swimwear_shop) |
| `item:<item>` | the item can be produced or bought now (a station / workshop / shop for it is built) |
| `craft:bouquet`, `craft:cake`, `craft:gift` | 꽃밭 (deco_flowers), bakery + bread, 잡화점 exist (the craft pads appear there) |
| `p:<place>` | the place exists (`WORLD.v5` places; `p:old_sign`, `p:towers` …) |
| `veh:sled`, `veh:truck` | vehicles_runtime gives the chief that vehicle (dynamic) |
| `life`, `paper` | story_runtime runs / its newspaper exists |
| `toggle:farewell`, `toggle:incidents` | `Settings.data.lifeFarewell` / `incidents` (P2) |
| `v6`, `v7`, `v8`, `v6:star2`, `v7:star2` | district open / its second star |
| `dog`, `pet:pet_penguin` | 콩이 adopted / the penguin lives in the village |
| `towers:3`, `shops:3`, `fame:400` | counts (`facts.count`) reach the number (dynamic) |
| `import:sugar`, `site:memorial` | v6 import / memorial site offered |

### 11.5 Patches by file

**P1 `src/scenes/Game.js`** (plan text) with `import { MODULES as MISSIONS_BANK } from '../missions/index.js';` and
`LATER_MODULES = [...STORY_MODULES, ...MISSIONS_BANK, ...]`. Tap routing: `src/scenes/UI.js` pointer-up handler (line ~153; it goes on to the pinch code, so no `return`):
replace `this.gs.life.tap(wp.x, wp.y);` with
`if (!(this.gs.later && this.gs.later.tap(wp.x, wp.y))) this.gs.life.tap(wp.x, wp.y);` where `ModuleHost.tap` calls
`host.tap(x, y)` of missions, then bank, and returns the first true (the bank always returns false so residents still
react).

**P2 `src/core/Save.js`**: register the slices (`{ key: 'missions', sanitize: sanitizeMissions }`,
`{ key: 'bank', sanitize: sanitizeBank }` from `src/missions/save.js`, `src/bank/save.js`); `Settings.data` (line ~389)
gains `missionToasts: true`, validated like `daynight` (line ~398): `this.data.missionToasts = s.missionToasts !== false;`.

**P3 `src/core/Assets.js`**: late fragments needed: `ui3` (already late in v4), `life2` (`life2_items`, `life2_decor`,
`life2_wedding`), `civic` (`civ_bank` only), `fx_city` (`ui4_icons`, `ui_passbook`, `ui_passbook_row`), `audio3`
(`sfx_mission_done`, `sfx_fame_up`), `audio6` (`sfx_coin_count`, `sfx_stamp`, `sfx_ticket_chime`, `sfx_vault_door`,
`amb_bank`). The exact lists are `FRAGMENTS` in `src/missions/index.js`; `prefetch` asks `assets.fragment(name,
{ only, audio })`.

**P12 `src/scenes/UI.js`**: the module creates its chips and panels itself in the UI scene (`ports.ui.scene`) at the
v4 positions (mission chip at (28, top + 212), fame chip right-aligned at (W − 24, top + 162)); it needs
`ports.ui.panelOpened(on)` so v4 dims / blocks input like its own panels, and a settings row 미션 알림 bound to
`missionToasts`.

**P13 `src/entities/TownHall.js`**: `boardLines()` (line ~132): `if (gs.later && gs.later.missions) out.requests.push(...gs.later.missions.boardLines().slice(0, 3));`
before `return out`; `openBoard()` (line ~124): `if (gs.later && gs.later.missions) { gs.later.missions.open('board'); Audio.play('sfx_click', { volume: 0.5 }); return; }`.
The plaza notice board prop (v4 decor) gets the same tap → `open('board')` through the ModuleHost tap routing.

**P17 `src/systems/Rank.js`**: bar reader `fame` = `gs.later.missions.fame().pts` for ranks 3 (400) and 4 (900).

**P20 `src/data/balance.js`**: copy `MISSIONS_TUNING` and `BANK_TUNING` verbatim as `BALANCE.v5.missions` and
`BALANCE.v5.bank` (Korean comments kept); ranges into `balanceCheck.js`. `src/missions/index.js` already reads them.

**P28 `src/entities/UnlockPad.js`** `update` (line ~245, the `eco.coins <= 0` branch, before the 'notEnoughCoins'
toast): 
```js
const bank = gs.later && gs.later.bank;
if (bank && bank.isOpen() && !this._asked) {
  this._asked = true;
  bank.offerFor(this.remaining, this.id, 'build', this.cost)
    .then((ok) => { if (!ok) this._asked = false; });   // on true the coins are in the wallet; the pad pays as usual
  return true;
}
```
Reset `_asked` when the chief steps off the pad (where `_warned` is reset, line ~201). The same lines go into the
rank ceremony pad (`src/systems/Rank.js`, P17) with `kind 'ceremony'` (loan ≤ 50 % of the ceremony cost).

**P29 `src/scenes/Game.js`**: `addModuleSite(id, cfg, kind)`; the bank calls `ports.sites.offer({ id: 'v5_bank', key:
'bank', cost: { coins, item_plank, item_ingot, time }, onBuilt })` once; the kit maps it to `new Site(gs, id, cfg,
kind)` on the row D lot (`WORLD.v5.places['p:bank']`), `onBuilt` → `bank.api.open()`.

**P30 `src/systems/Tutorial.js`**: `v5Hint(set, dt, idle)` after `v4Hint`: `const t = gs.later && gs.later.missions &&
gs.later.missions.focusTarget(); if (t) set(t.x, t.y, t.icon);`.

**P31 `src/scenes/UIv4.js`** (line ~93): `const showOrder = open && !(ui.gs.later && ui.gs.later.missions) && …` so
the mission chip takes the order chip's slot; v4 standing orders still reach the chief as 생산 목표 board cards.

### 11.6 Other modules

- **story_runtime** (`src/story/**`, another workflow, in progress): events already match (`story:life` with `aPid` /
  `bPid` / `whoPid`, `story:bank` with `whoPid`, `story:news`, `story:happening`). Needed: `story:move { op: 'in',
  whoPid }` (one adult of the household) for A8 / A21 / B12; `watched: true` on happenings the chief saw; its escort
  and choose scenes call `gs.later.missions.report({ how: 'escort', who: pid })`; `ports.story.passbook(pid)` =
  its `api.passbook` (Promise accepted).
- **vehicles_runtime**: `veh:arrive { riders }`, `veh:ride { chief, line }`, and after a mission drive
  `veh:driveDone { mid, stars }` (or `missions.report({ how: 'drive', stars })`); the facts `veh:sled`, `veh:truck`.
- **incidents (v8)**: `inc:fire { op: 'ruin', building, id }` for insurance; `inc:wanted { op: 'post', id }` (mission E12),
  `inc:move { op: 'in' }` (missions A21 / B12).

### 11.7 After wiring, check

`node --test tools/test/missions_lab/*.test.mjs` (the purity test's third case will then list the game files that
import the module: update its expectation to the patched files); v4 suites; a v4 save loads with the module off and
on (slices pass through untouched while not constructed); the kit's GameFeed test that every `SIGNAL_EVENTS` entry is
emitted; in-game captures matching §8 at zoom 0.6–1.2.
