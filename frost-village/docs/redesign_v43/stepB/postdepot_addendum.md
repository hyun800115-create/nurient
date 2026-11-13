# Step B addendum: after the depot — the post-depot goals, stage 4 as a main goal, and the 읍장 취임 맛보기

- **Date:** 2026-11-13.
- **Base read:** `scratchpad/b_int_wt/frost-village`, branch `local/v43-b` at `20ba14e` (v4.3.0-a3.2 + B0, BAL-a, L1, S1–S3). Wave 2 (L2, TX-a, S4–S5) is in flight elsewhere; P, H, M, N, BAL-b, TX-b and P1 have not started.
- **Plan amended:** `docs/redesign_v43/stepB/build_plan.md` (cited as "the plan", §n). New plan-level choices continue its numbering: **BP-35 … BP-50**.
- **Designer request (verbatim):** 「물류창고 다음에도 할 일은 있어요. 직원 채용, 지게차, 2단 업그레이드, 꾸미기, 첫 집, 이웃 마을 정기 납품, 기차, 가게 성장 먼저넣어주고 위에 말한거 넣어주고 맛보기 만들어줘」
  - Read as: (1) after the 물류창고, these eight activities first, as main goals, in this order; (2) then what was proposed before: the 4단 「눈꽃마을 시장」 as a **main** goal; (3) then a 「읍장 취임 맛보기」.
- **Rule:** build without asking; sensible defaults; lossless for saves; no gate loosened. Every default is listed in §2 and can be overturned at b1.
- **Nothing was built or run for this addendum.** The tree was read; code facts carry `file:line` on `20ba14e`.
- **Critiqued 2026-11-13** against the same tree (adversarial pass). The body below already carries the fixes; §9 「Critique applied」 lists every change and why. New plan-level choices: **BP-51 … BP-57**.

---

## 0. Summary

1. **Post-depot chain (new package G).** A data list `GOALS43` follows the v4.2 buildings on the main road: 물류창고 직원 2명 → 지게차 → 가공소 2단 하나 더 → 마을 꾸미기 2곳 더 → 첫 집 두 채 → 정기 납품 3번 → 기차로 짐 3번 → 가게 키우기 (3단 + 고기 점원). Each row has a state rule, a 가기 target, an objective line, a small coin reward (1,500 coins in all) and a done marker in `v43.seen`. The chain opens once **every** v4.2 building on the road (bank and depot) stands. Counters and two baselines live in the `x` drawer (`x.g43`). Rows a village has already done show ✓ with no reward; 2단 and 꾸미기 count what is added after the chain opens, so they are always something to do. A row pays only when this session sees it become true (no double pay after a reload or a trimmed key).
2. **Stage 4 becomes main row 9.** Its pad appears when the chain reaches it (`progress.flags.g43s4`), not at the ceremony. H's ceremony offer turns into an announcement. Prices are unchanged (full; half for `s4half` villages). One balance switch (`goals43.s4Early`) restores the old "pad at 읍" behaviour. If stage 4 is cut (plan tier 3), row 9 drops out by data.
3. **읍장 취임 맛보기 (new package T), main row 10.** A free stand-on pad at the hall's 승격식 spot opens a 9–21 s scene: bells, residents gather, confetti, a 「읍장」 card, then a teaser card (읍장 수업 1, 지도에서 돌보기, 「다음 업데이트에서 열려요」). While it runs the village holds as for the 승격식 (a ≈ 6-line `Rank.hold` seam in B0b: goal window, 관망, flag card, follow, carry pill all wait). It gives nothing and writes only `v43.seen.eup_taste`. v4.4's real inauguration and staff gift still run once for every 읍 village.
4. **Plan effect.**
   - A small serial contracts commit **B0b** (ids, seams incl. `GoalBook.sub` and `Rank.hold`, anchors, inert balance keys, the contracts test) lands before P is cut.
   - G and T merge after N, before b1. Merge order: … P → S → H → M → N → **G → T** → b1 → BAL-b → TX-b → P1.
   - Effort **≈ +4.5 builder-days**: ≈ 26 → **≈ 31 (28–33)**. Browser **+7 h** (≈ 61 → ≈ 67.5 h wall). **b1 ≈ day 8 → ≈ day 9.** Elapsed ≈ 12–12.5 → **≈ 13.5–14** working days.
   - G1 and G2 are untouched: everything starts after the bank and the depot, after 읍.

---

## 1. Today's game after the depot (facts read in the tree)

| Fact | Where |
|---|---|
| The main road is `MAIN_STEPS` (17) → `GOALS` (22, ends `town_hall`, `people:45`, `rank:2`) → `V42_BUILDS` (office, bank, depot). Nothing follows the depot. P removes the office from `V42_BUILDS` | `GoalBook.js:22-24, 167-200`; `Progression.js:153-182` |
| After 읍 the objective comes from `Tutorial.v42Goal`: office plot → office hire pad → bank plot → depot plot → the first standing line offer | `Tutorial.js:326-344`, `:119-135` |
| `nextGoal()` returns `null` once every `GOALS` row is done, so post-읍 the objective is v42Goal only | `Progression.js:258-271` |
| Depot staff: `hires` 0–3, prices `[1200, 2000, 3000]`; forklift `fork` 0/1, 3,500. Pads `depot_staff` / `depot_fork` on the forecourt (`B.padSpot`). They are **not** in `gs.paidPads()`, so the goal window never lists them | `DepotSystem.js:42-43, 53-89`; `balance.js:661`; `Game.js:1459-1465` |
| 가공소 2단 (`st2_<line>`, 900–1,600) is offered only when the line has its third gatherer (`hire3_*`; miners `hire2_miner`), at most 3 line offers at a time; bought lines in `lines.up` | `LineUpgrades.js:41, 81-87, 128-170, 294-330`; `balance.js:629` |
| Decor: `deco_*` on S plots (and on M/L plots once L1's `types` land); built counts in `gs.built[key]` | `Civic.js:67-72`; `Game.js:1221-1225`; `balance.js:280-286` |
| First houses `h43_1` / `h43_2` (side43 plots after `zone_forest`, 80 + 4 and 160 + 6 planks). Most post-depot villages have them | `world.js:612-617`; `balance.js:720` |
| 정기 납품: standing cards come after the five founding shops. A completed card emits `v4:cardDone` (`c.shop` null for a standing card). **No saved counter of completed standing cards exists** (`orders.standing` is a rotation index, bumped on pick) | `Growth.js:173-200, 392-410, 692-707` |
| Trains: `v4:train` `depart`/`ours` makes Freight pay exports; after that, `F.cardAboard` > 0 means our goods rode. Freight's listener is registered first (at V42 build) | `Freight.js:52, 165-193` |
| Shop growth: `mkt_s3` (400 + 8 planks, after `hire_hunter` + `firstMeatSale`, side) and `hire_clerk_s3` (side). The five founding shops have no levels | `Progression.js:71-72`; `balance.js:219-224, 451-459` |
| 읍 ceremony: 12 s, skip after 3 s, hall framing `focusCamera(cx + 60, cy − 160)`, `life.party`, `gatherVisitors`, confetti, the `rewardTitle` toast 「칭호: 읍장」; `Rank.bakeView` is static | `Rank.js:63-160`; `strings.js:238-251` |
| Hall spots: `rankPad` (−186, 208) from the plot centre; free after 읍 (the `rank_eup` pad is gone) | `TownHall.js:26, 75-77`; `Game.js:1559-1562` |
| HUD rank chip already shows 「읍」 after 읍; `UI.rankBadgeFly` is public | `UIv4.js:34-130`; `UI.js:262` |
| `v43.seen` keeps ≤ 32 keys matching `/^[a-z0-9_]{1,24}$/` (lower-case only). `x` keeps named keys under `X_CAPS` (sum 6,272) and unknown keys ≤ 512 B within `X_TOTAL` 6,400. `gs.v43`, `gs.x43` exist | `Save.js:490-524, 531-540, 625-640`; `Game.js:207-210` |
| B0 seams: `onAfterLoad` / bus `emit` / `on`; `src/systems/v43/index.js` registers hooks "one line per package" | `hooks.js`; `index.js` |
| Goal-window words live in `src/systems/goals/strings.js` (`gt`), objective words in `src/data/strings.js` (`t`, anchors `v43B:<pkg>`) | `goals/strings.js`; `strings.js:526-567, 1045-1086` |
| Bot timings (M0, a3.1): 읍 44.3, bank 54.3, depot 59.4 bot-min (smart_s1: bank → depot, 6,000 coins, in 2.5 min) | `docs/build_reports/v43_baseline/report.md` §2 |
| **(critique)** The depot plot needs `f:rankEup`, the 창고 and `r:se`, **not** the bank: a player can build the depot first while the bank row is still 「지금 할 일」 | `world.js:1077-1080` |
| **(critique)** Nineteen reads in twelve files pause for `gs.v4.rank.ceremonyOn` (goal window, residents panel and follow, 관망 pilot and camera director, navigator line, carry pill, GoalWalk, flag maker / card, 금방 ports, `Game.focusCamera`). A scene that does not set it is interrupted by all of them. `Rank.update` runs `tickCeremony` whenever it is true | `grep ceremonyOn src`; `Rank.js:57, 128-134` |
| **(critique)** `gs.ui` is a `UIProxy`, not a scene: no `add`, and `toast(msg)` drops its hold argument | `Game.js:102-120` |
| **(critique)** A house card is locked while vacant beds ≥ `maxVacant` (`lockVacant`); the first-house plots obey it | `Civic.js:154, 191-205` |
| **(critique)** Line offers show at most 3 at a time (`MAX_OFFERS`), and a `sp3` / 화물칸 / 썰매 offer is due right after the depot: a due 가공소 2단 can stay hidden behind them | `LineUpgrades.js:41, 145-170, 219-247` |
| **(critique)** The chief himself may drop surplus on the dock (`feedSurplus`), so trains can carry without station porters | `Growth.js:308-319` |
| **(critique)** The goal window's line under a row comes only from `GoalBook.sub(r)`; it knows no per-row text for `why: 'wait'` | `GoalBook.js:254-264`; `GoalPanel.js:298, 356` |
| **(critique)** `sanitizeV43` keeps the first 32 `seen` keys and silently drops the rest | `Save.js:505-513` |
| **(critique)** `v43_contracts.test.mjs` asserts exactly 8 `EV43` names and exactly the anchor pairs L, S, P, H, M, N, P1 | `v43_contracts.test.mjs:173, 250-262` |
| **(critique)** The bot fixtures have no decor (`v42_village_late`: 0 decor, `lines.up` empty, all third workers hired, no `mkt_s3`) | `tools/test/fixtures/v42_village_late.json` |

---

## 2. Decisions adopted (defaults; the 대표 can overturn any line at b1)

| # | Decision | Why |
|---|---|---|
| BP-35 | The chain is a **new list `GOALS43`** after `V42_BUILDS`, evaluated by a new module, **not** rows appended to `GOALS` | `GOALS` feeds `nextGoal()`, which would put the rows before the bank and depot, and every `GOALS.every(goalDone)` gate (GoalBook §3) would break |
| BP-36 | Targets: staff **2** (of 3), forklift, 가공소 2단 **1 more** (capped at the 5 lines), decor **2 more**, both first houses, standing deliveries **3**, train runs **3**, shop = `mkt_s3` + `hire_clerk_s3` | Each row is a few minutes of post-읍 income or play, never a grind (§3.1 costs). (critique) "More" for 2단 and decor: the designer listed activities to do after the depot; an absolute count would tick silently in any village that decorated or upgraded before 읍 |
| BP-37 | Counter rows (deliveries, trains) count **from the moment the chain opens**; 2단 and decor count against a **baseline taken at opening**; the other rows read what the village already has | No completed-delivery counter exists in any save (§1); no event fires on a 2단 purchase, so a baseline is the only way G sees one without editing `LineUpgrades.js` |
| BP-38 | **Chain opening** = the first 1-Hz tick with **every `V42_BUILDS` building built** (after P: bank and depot), v42 running and rank ≥ 2. At that tick every row already true is marked done **with no reward and no banner**, and the baselines are written | "Count as done, no double rewards". (critique) The depot alone is not enough: it can stand before the bank (§1), and the chain would open, count and pay while the bank is still the current goal |
| BP-39 | Rewards: coins only, 100–300 a row, 1,500 in all (balance keys). **A row pays only when this session saw its rule false and then true** (live transition); a rule already true at the first tick after a load is marked silently. Banner when the row was the current one; toast when done out of order. The stage-4 and taste rows pay nothing | There is no fame stat in v4.3; 1,500 is under a minute of post-depot income (bank → depot 6,000 in 2.5 min on smart_s1). (critique) Without the live-transition rule a marker lost to the 32-key `seen` cap, a crash before the save, or a hand-edited save pays the row again |
| BP-40 | The trains row is **passive** (never "now" while counting, like `firstTrain`) and **never gates rows 9–10**. **Soft** rows wait without blocking later rows: 가공소 2단 with no standing offer and no gate pad (incl. an offer hidden by `MAX_OFFERS`), decor with no free plot, a first house whose card is locked (`lockVacant`), the shop row before the first meat sale | Same as `waitPlot` today (`Progression.js:258-271`); no row can dead-end the chain. (critique) A village whose trains carry nothing (no station porters, no deliveries) would otherwise never reach the taste |
| BP-41 | **Stage 4 is main row 9.** The `mkt_s4` STEPS row gets `flag: 'g43s4'` and `also: 'mkt_s3'`; G sets `progress.flags.g43s4` when row 9 becomes current. `goals43.s4Early: false` by default; `true` sets the flag at 읍 (the old plan's offer pad) | The designer asked for a main goal, not a side pad. `also` keeps 4단 behind 3단 (setStage would otherwise jump 2 → 4) |
| BP-42 | H's post-ceremony banner becomes an **announcement** (same once-key `s4offer`): no pad, no navigator pin | With BP-41 there is nothing to buy yet at 읍 |
| BP-43 | The taste is **main row 10**: a free stand-on pad at `hall.rankPadPos()`, shown when rows 1–9 are **settled** (done, or waiting with no path; the trains row may still be counting; row 9 counts as settled only when `mkt_s4` is done or `mkt_s3` itself is out of reach). **Once shown (`seen.g43ready`) the pad stays**, even if a soft row later gets a path back. The scene runs 9–21 s and is skippable after 3 s | The player starts it; it never interrupts. (critique) Without the sticky rule the pad would pop in and vanish when, say, a plot frees up for decor; without the row-9 rule a pad blocked for a moment by `paidPadNear` would open the taste before stage 4 |
| BP-44 | The taste **gives nothing and changes nothing** (no coins, staff, rank, flags, `x.mgmt`). It writes **only** `v43.seen.eup_taste` | v4.4 still runs its full ceremony and gift once (§5.6) |
| BP-45 | The teaser shows 읍장 수업 1 (마을 경영 창) and 지도에서 마을 돌보기, tagged 「다음 업데이트에서 열려요」. **No staff-gift promise, no version number in player text** | v4.3 already sells the four staff after 읍 (D3); some players will have bought them, and v4.4 sends those players a thank-you letter, not a gift (Q21). (critique) The roadmap is still under the 대표's review and versions can be renumbered: 「v4.4」 in a 4.3.x village could become wrong |
| BP-46 | Seen key is spelled **`eup_taste`** (not `eupTaste`) | `sanitizeV43` drops keys with capitals (`Save.js:509-511`): the marker would vanish on reload and the taste would replay |
| BP-47 | Counters and baselines are stored in `x.g43 = { d, t, k, u }` (deliveries, trains, decor baseline, 2단 baseline; ≈ 30 B). S adds the named cap **`X_CAPS.g43 = 48`** (table 6,320 of `X_TOTAL` 6,400). The key already passes today as an unknown key (≤ 512 B; S1–S3 merged the drawer) | The drawer is the only extensible save space; a named cap stops an unknown key being trimmed first when v4.4 fills the drawer. (critique) 128 would have used the drawer's last 128 B of headroom for a 30-B value |
| BP-48 | G's one-time "chain opened" banner waits until N's letter is closed (`v43.seen.letter43`, or the bus `letter {state:'close'}`), the flag card is closed (`VillageFlags.busy()` null) and no panel is open | N's load order is letter → flag card; G comes third, never on top |
| BP-49 | **B0b contracts commit** (INT, 0.35 d, serial, before P is cut): ids, seams in `GoalBook` (rows, `sub`, side de-duplication) / `Tutorial` / `Rank` (`hold`) / `v43/index.js`, stubs, string anchors, inert balance keys, and the contracts test update. G and T then edit only their own new files and anchor regions | P owns `GoalBook.js` / `Tutorial.js`, H owns `Rank.js` (§3.1). Neither has started, so the seams cost them nothing |
| BP-50 | The `market_s4` lazy-page rule reads `pr.isDone('mkt_s4') \|\| pr.flags.g43s4` (not `flags.rankEup`). **TX-a takes it if it has not merged when B0b lands** (a one-token change, inert until G); otherwise TX-b | Stage 4 now comes ≈ 20 bot-min after 읍; preloading its page from 읍 would waste ≈ 0.8–2 MiB of GL room through the chain, in b1 too if left to TX-b |
| BP-51 | **`Rank.hold` seam (B0b, H's file):** `ceremonyOn` becomes an accessor `get ceremonyOn() { return this.cerOn \|\| !!this.hold; }` / `set ceremonyOn(v) { this.cerOn = !!v; }`; `update` ticks and `endCeremony` guards on `cerOn`; `state()` reports `ceremony: this.cerOn, hold: this.hold \|\| null`. Plus `static hallFrame(venue)` = `{ x: venue.x + 60, y: venue.y − 200 }`, the hall framing H tunes. T sets `rank.hold = 'taste'` for its scene and clears it at the end and on shutdown | The nineteen `ceremonyOn` reads (§1) then hold the village for the taste as for the 승격식, with no edit to their files, and Rank's own clock never runs for it. One framing helper instead of T copying H's numbers |
| BP-52 | **Goal-window seams (B0b, P's file):** `GoalBook.sub(r)` asks `gs.goals43.sub(r)` first for `kind: 'g43'` rows; `sideRows` skips every pad or plot that a not-done G row uses as its place (`gs.goals43.refs()`), not only the current one | The window's line under a row comes only from `sub` (§1); without the de-duplication the forklift pad, a 2단 pad, a first-house plot or the `mkt_s4` pad shows twice (as a G row in 「다음」 and as a side row) |
| BP-53 | **Rows by data:** row 9 exists only when `STEPS` has `mkt_s4`; row 10 only when `EupTaste.enabled` (the B0b stub says `false`; T sets `true`; v4.4 sets `false`). Without row 9, row 10's gate is rows 1–8 | Plan §8 tier 3 may cut stage 4 and T is tier 2: neither cut may leave a dead row on the main road |
| BP-54 | When rows 1–8 are all marked, G writes `seen.g43all` and removes the eight row keys (`g43_staff` … `g43_shop`) | `seen` is capped at 32 keys for the whole game's life (§1); the chain then holds 4 (`g43open`, `g43all`, `g43ready`, `eup_taste`) instead of 11 |
| BP-55 | **The objective order after the v4.2 buildings:** a G row with a place → the line offers (as today) → a G row's text only. Row 6 (deliveries) points at the dock when the bag holds an item a standing card needs, else at the focus card's source output pad (`Tutorial.sourceOf`), else the dock | A passive / waiting G row no longer hides the line-offer arrow that guides post-depot play today. An empty-handed walk to the dock did nothing |
| BP-56 | G removes its `gs.events` listeners (`v4:train`, `v4:cardDone`, `update`) and its v43-bus listeners on the scene's `shutdown` | The scene's emitter outlives a 「처음부터」 / reload restart (as `Game.js:293-295` notes for `step`): a kept listener would count every train twice and call into a dead G |
| BP-57 | The taste scene keeps the camera at the hall: no white cuts (the chief is standing on the hall's pad); `focusCamera(Rank.hallFrame(venue))` in, `camFocus = null` out | Rank's white cuts exist because the 승격식 jumps to the station square halfway; the taste never leaves the hall, and a skip during a white fade is one edge less |

---

## 3. Design 1: the post-depot chain (`GOALS43`, package G)

### 3.1 The rows

`GOALS43` is plain data in the new file `src/systems/goals/Goals43.js`. Targets and rewards come from `BALANCE.goals43` (§6.1). Costs are today's balance values.

| # | id | 목표 창 name (ko / en) | Done when | Typical cost | 가기 target (`row.place`) | Objective line (ko) | Icon (`pick` order) | Reward | Flags |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `g43_staff` | 물류창고 직원 {n}명 뽑기 / Hire {n} depot hands | `gs.v42.depot.hires ≥ need.staff` (2) | 1,200 + 2,000 | `depot.pads.staff` (forecourt) | 물류창고 직원 뽑기 {have}/{n} ({cost} 코인) | `ui_icon_staff`, `ui_icon_worker` | 300 | — |
| 2 | `g43_fork` | 물류창고에 지게차 들이기 / Get the depot a forklift | `depot.fork === 1` | 3,500 | `depot.pads.fork` | 지게차 들이기 ({cost} 코인) | `ui_icon_forklift`, `ui_icon_delivery` | 300 | — |
| 3 | `g43_st2` | 가공소 2단 하나 더 / One more workshop at level 2 | `Object.keys(lines.up).length ≥ min(5, x.g43.u + need.st2)` (`u` = the count at opening; 1 more) | 900–1,600 | the cheapest standing `lines.pads['st2_<line>']`; else the cheapest standing **gate pad** among `hire2_miner`, `hire3_lumberjack`, `hire3_fisherman`, `hire3_farmer`, `hire3_hunter` for a line not yet at 2단; else none (soft: `why 'wait'`, sub `g43_st2Wait` when a gate is missing, `g43_st2Slot` when an offer is due but hidden behind `MAX_OFFERS` — `lines.state().due` lists it with no pad) | {st} 2단 놓기 ({cost} 코인) · gate: `{name|을/를}` 뽑으면 2단을 놓을 수 있어요 ({cost} 코인) | `ui_icon_speed`, `ui_icon_tools` | 150 | soft |
| 4 | `g43_deco` | 마을 꾸미기 {n}곳 더 / Decorate {n} more spots | `Σ gs.built[deco_*] − x.g43.k ≥ need.deco` (2; `k` = the count at opening) | 80–160 (+ a few planks / 1 ingot) each | the nearest free plot whose build menu offers the cheapest unlocked decor (`Tutorial.plotFor` over `bench, lamp, snowman, flowers, rink, playground, fountain`), its drop pad; the plot's menu opens as the chief stands still there (existing plot rule) | 마을 꾸미기 {have}/{n} · 빈 땅에 꾸밈 짓기 | `ui_icon_flower`, `ui_icon_house` | 100 | soft (`noplot`) |
| 5 | `g43_house` | 첫 집 두 채 짓기 / Build both first houses | sites `h43_1` and `h43_2` both `state === 'done'` (any building there counts); **a missing site counts as done** | 80 + 4 planks, 160 + 6 planks | the first shown side43 plot: in `plot` state its drop pad when its card is open; in `foundation` state its drop pad (materials, sub `g_building`); in `scaffold` state none (passive) | 첫 집 짓기 ({cost} 코인) | `ui_icon_move_in`, `ui_icon_house` | 100 | soft (`lockVacant`: sub `g43_houseWait` 「빈 방이 차면 지을 수 있어요」) |
| 6 | `g43_dlv` | 이웃 마을 정기 납품 {n}번 / Regular deliveries ×{n} | counter `x.g43.d ≥ need.dlv` (3) | goods only | the station's 짐 싣는 곳 (`v4.growth.dockPad`) when the bag holds an item a standing card needs; else the focus card's missing item's source output pad (`Tutorial.sourceOf`, `ref` = the Pad); else the dock (BP-55) | 정기 납품 {have}/{n} · {item} {got}/{need} (the focus standing card) | `ui_icon_mission`, `ui_icon_request` | 200 | — |
| 7 | `g43_train` | 기차로 짐 {n}번 보내기 / Send goods by train ×{n} | counter `x.g43.t ≥ need.train` (3) | — | **none** (passive: GoalWalk answers `g_passive`) | 기차가 짐을 실어 가요 {have}/{n} | `ui_icon_boxcar`, `ui_icon_delivery` | 200 | passive; never gates rows 9–10 |
| 8 | `g43_shop` | 가게 키우기: 3단 「눈꽃 시장」과 고기 점원 / Grow the shop: stage 3 and its meat clerk | `isDone('mkt_s3') && isDone('hire_clerk_s3')` | 400 + 8 planks; clerk 150 | pad `mkt_s3`, else pad `hire_clerk_s3`; none before the first meat sale (sub 「고기가 처음 팔리면 열려요」) | 가게 키우기: {name} ({cost} 코인) | `ui_icon_stock`, `ui_icon_hammer` | 150 | soft |
| 9 | `mkt_s4` | 가게 4단 「눈꽃마을 시장」 / Shop stage 4 | `isDone('mkt_s4')` | 2,000 + 20 planks + 8 ingots (× 0.5 with `s4half`) | `progress.pads.mkt_s4` (shown from `flags.g43s4`) | 가게 4단 「눈꽃마을 시장」 ({cost} 코인) | `ui_icon_hammer` | 0 (M's `shop4Up` banner) | §4; present only when `STEPS` has `mkt_s4` (BP-53) |
| 10 | `g43_taste` | 읍장 취임 맛보기 / A taste of the inauguration | `v43.seen.eup_taste` | free | T's pad at `hall.rankPadPos()` | 마을회관 앞 발판에 서 보세요 · 읍장 취임 맛보기 | `ui_badge_rank_2`, `ui_icon_title` | 0 | §5; present only when `EupTaste.enabled` (BP-53) |

Row 9's 목표 창 sub-line adds 「반값」 when `progress.flags.s4half`. Its coins read the pad once it stands (half for `s4half`); before that, P's price helper (not the bare `stepCost`, which knows no half price).

Where the villages are on opening (fixture facts, §1): the bot-made late village has 0 decor, no 2단 and every third worker, so rows 3 and 4 are live there; its `mkt_s3` and 고기 점원 come free at load through `Progression.shop43()` (bread already sells), so row 8 is ✓ there, as in most villages that reach the depot. A village that decorated or upgraded before 읍 still gets rows 3 and 4 as "more".

### 3.2 States, the current row and opening

- **Before opening** (any `V42_BUILDS` building missing): every row is `done` (when its rule already holds; markers come later) or `next` (locked; 「앞의 목표를 먼저 해요」). Rows 3 and 4 have no baseline yet and show `next`.
- **Opening** (BP-38): `seen.g43open = 1`; the baselines `x.g43.k` (decor built) and `x.g43.u` (2단 lines) are written; rows already true get their markers with no reward; the bus gets `goal43 {id, state:'pre'}` for each. If at least one row is left, the banner 「물류창고 다음 목표가 생겼어요」 / 「목표 창에서 차례대로 볼 수 있어요」 is queued once, after the letter, the flag card and any open panel (BP-48).
- **`active`** = the window's own condition for the v4.2 rows (`pr.complete`, every `GOALS` row done, `gs.v42`) and opened. While a `GOALS` row has regressed (a dip below 45 people), G pauses: no `g43s4`, no taste pad, no banners; counters still count.
- **`current()`** mirrors `nextGoal()`:
  - walk the rows in order; skip done rows;
  - a passive row in progress, or a soft row with no path, is remembered as the fallback and skipped;
  - the first other row is current;
  - if none, the remembered fallback.
  - A soft row that gets its path back (a plot frees up, a 2단 offer appears) becomes current again ahead of later rows, as `waitPlot` does today.
- **Row 9** is current only when rows 1–8 are done, passive in progress, or soft without a path. When it first becomes current, G calls `progress.setFlag('g43s4')` (sticky: a saved flag). The pad appears through `syncPads` (`Progression.js:291-297`).
- **Row 10** needs rows 1–9 settled (BP-43: done, or waiting with no path; the trains row may still count; row 9 settled = `mkt_s4` done, or `mkt_s3` not done while row 8 waits with no path). T's pad shows from that moment, with a once-banner (`seen.g43ready`): 「마을회관 앞에서 작은 축하가 기다려요」 / 「회관 앞 발판에 서 보세요」. **From `seen.g43ready` on, the pad stays** until the taste is seen.
- **Markers.** A row's marker (`v43.seen.<id>`, rows 1–8) is written the first tick its rule holds; it pays only on a live transition (BP-39). A marked row stays done even if its state later regresses. When rows 1–8 are all marked, `seen.g43all` replaces the eight keys (BP-54). Rows 9–10 are derived (`mkt_s4` done; `eup_taste`).

### 3.3 Counters (`x.g43`)

- **`d` (deliveries):** `gs.events.on('v4:cardDone', c => !c.shop && …)`. It counts only while the chain is open and `g43_dlv` is unmarked, and caps at `need.dlv`.
- **`t` (trains):** `gs.events.on('v4:train', (ev, stop) => ev === 'depart' && stop === 'ours' && F.cardAboard > 0 && …)`.
  - G registers at after-load, so it runs after Freight's own listener: `buildV42` (`Game.js:267`) makes Freight before `runAfterLoad` (`Game.js:286`), in every build, so the order also holds after a restart. `payExports` has therefore already moved the surplus into `cardAboard` (`Freight.js:179-193`).
  - Card crates aboard count too. Surplus the chief drops on the dock himself counts (`Growth.feedSurplus`).
- **`k`, `u` (baselines):** written once at opening (decor built, 2단 lines); never changed after.
- **Listeners** (`v4:train`, `v4:cardDone`, the scene `update`, the v43 bus) are removed on the scene's `shutdown` (BP-56).
- **Storage:** written through `gs.x43.set('g43', { d, t, k, u })`. Once rows 3, 4, 6 and 7 are all marked, the key is removed (`set('g43', undefined)`).
- **Reload:** counters and baselines come back from `x.g43`. A missing or trimmed key restarts the counters at 0 and re-takes the baselines at the current counts, for unmarked rows only; markers are never lost.

### 3.4 Rewards and banners

- On a marker written after opening **for a live transition** (this session saw the rule false, then true; BP-39): `gs.economy.add(reward, p.x, p.y − 60, true)`. A rule already true at the first tick after a load is marked with no coins and no banner.
- If the row was current, a banner through `v42.queueBanner('g43:' + id, …)`: 「목표 달성: {name}」 / 「+{n} 코인 · 다음: {next}」. It queues behind the action's own banner (the depot's 「직원이 왔어요」, M's `shop4Up` …): `UI.banner` and `queueBanner` both wait for the banner on screen.
- Done out of order: a toast 「목표 달성: {name} +{n}」 (through the UI scene, `gs.scene.get('UI').toast(msg, 2200)`: `gs.ui.toast` drops the hold).
- The bus gets `goal43 {id, state:'done'}`.
- The marker is written **before** the coins are paid, then `gs.save(true)`. A second evaluation can never pay twice; a crash before the save loses both together.
- Reward total 1,500 coins (`balanceCheck`: each 0–500, total ≤ 2,000).

### 3.5 Objective panel and 목표 창 (through B0b seams; G never edits P's files)

- **`GoalBook.mainRows` (after section 3, `GoalBook.js:191-200`):**
  ```js
  // 4. (v4.3 step B, G/T — BP-49) after the 물류창고: GOALS43 (src/systems/goals/Goals43.js)
  const G43 = gs.goals43;
  if (G43) for (const r of G43.rows(after && !cur, this)) { if (r.state === 'now' && !cur) cur = r; rows.push(r); }
  ```
  - `rows(active, book)` returns rows in the GoalBook shape `{ id, kind:'g43', name, icon, coins, items, have, need, state, place, why }`.
  - States: done / now / wait (passive, soft) / next.
  - `why`: `'passive'` (trains), `'noplot'` (decor), `'wait'` (2단, house or shop with no path).
  - Row 9 is built with `book.stepRow(STEPS mkt_s4)`; row 10 with T's pad.
  - Cheap at the window's 1–2 Hz read: no per-call `buildChoices` over every plot beyond what `Tutorial.plotFor` already does.
- **`GoalBook.sub(r)` (BP-52):** first line `if (r.kind === 'g43' && this.gs.goals43) { const s = this.gs.goals43.sub(r); if (s != null) return s; }`. G returns its own lines (`g43_st2Wait`, `g43_st2Slot`, `g43_houseWait`, `g43_shopWait`, 「반값」 on row 9, `{have}/{need}` on counters) and `null` to fall through to the generic ones.
- **`GoalBook.sideRows` (BP-52):**
  - one seam line appends `G43.sideRows(cur, coins)`: the depot pads that are standing and **not the place of any not-done G row** (the third staff hire after row 1, for example). They are not in `paidPads()` today;
  - the `paidPads()` loop and the side43 plot loop skip every ref in `G43.refs()` (the places of not-done G rows: the forklift pad while row 2 waits in 「다음」, a 2단 pad, a first-house plot, the `mkt_s4` pad), not only `cur.place.ref`.
- **`Tutorial.v42Goal` (`Tutorial.js:339-342`, BP-55):**
  ```js
  let c = /* office hire (P) */ … || plot('v42_bank', 'bank42') || plot('v42_depot', 'depot42') || (G43 ? G43.objective(this, 'place') : null);
  if (!c && v.lines) /* the line offers, as today */ …;
  if (!c && G43) c = G43.objective(this, 'text');
  ```
  - `objective(T, 'place')` returns v42Goal's shape `{ x, y, h, key, text, cost, pay, pad, hold }` for a current row with a place, else null; `objective(T, 'text')` returns `{ key, text }` for a current row without one (counters, waits).
  - Keys `obj_g43:<id>:<have>:<cost>` keep the 0.6-s readable-objective rule (`Tutorial.js:964-986`).
  - The taste pad uses `pay: true, cost: 0`, so the arrow shows.
  - The idle hints that run before `v42Goal` (`v4Hint` step 8: the focus order card's source; `house43Hint`) are unchanged and agree with rows 5 and 6.
- **Walks.** All targets are `UnlockPad`s, `Pad`s, station output pads or plot drop pads, which GoalWalk already handles.
  - The far ones (the depot forecourt, the station dock) are within the existing nav net, and `postdepot.mjs` walks them.
  - Passive and soft rows with no place answer with GoalWalk's existing lines (`g_passive`, `g_noPlot`, `g_locked`): a `why: 'wait'` row says `g_passive` (「기다리면 저절로 이뤄져요」), which is true for each wait (offers appear, beds fill, meat sells).
  - Carry pill row 2: a walk's pin on the dock names it while the bag holds a card's goods (`CarryPill.pinTakes`); a pin on an output pad or a plot shows no row 2. Nothing to change.
- **Progress line:** 「큰 목표 {done} / {all}」 grows by 10 rows (8 or 9 when rows 9 / 10 are absent, BP-53).

### 3.6 Villages that are past some rows on load

| Village | What it sees |
|---|---|
| New game | Nothing changes until the bank and the depot both stand; then the chain opens. Typically the houses and the shop row are ✓ on opening, with no coins; 2단 and decor count from there |
| Depot built before the bank | The chain stays closed (rows `next`) until the bank stands; a staff hire or the forklift bought meanwhile is ✓ at opening with no coins |
| Step-B village past the depot (b1 testers after G lands) | Opens at the first load: ✓ on what it has; counters from 0, baselines from now; one open banner |
| Remapped a2.2 / a3 / 4.2.x village past the depot (e.g. `v43a22_late`, which has a depot crew) | Letter (N) → flag card → G's open banner. Staff ✓ if `hires ≥ 2`; 4.2.x villages have `hires` 0, so row 1 is live. A 4.1-born village whose 「새로워진 것」 card is unseen gets no line offers until it is (`LineUpgrades.js:208`): row 3 waits meanwhile |
| `s4half` village (already 읍 at remap) | Same chain. Row 9 shows 「반값」. N's letter line is reworded (§4.3). No pad before its turn |
| Village not yet at the depot | The rows show as `next` after the bank and depot; nothing opens early |
| A village that already bought stage 4 (only possible with `s4Early` on) | Row 9 ✓ |
| A village whose `x.g43` was trimmed, or whose markers were dropped by the 32-key `seen` cap | Counters restart and baselines re-take for unmarked rows; rows whose rule holds are re-marked silently (BP-39): never paid twice |

### 3.7 Strings (anchors from B0b)

- **`goals/strings.js` (`gt`, anchor `v43B:G`), ko / en:**
  - row names (§3.1);
  - `g43_openBanner` 「물류창고 다음 목표가 생겼어요」 / "New goals after the depot", with `g43_openSub` 「목표 창에서 차례대로 볼 수 있어요」 / "See them in order in the goal window";
  - `g43_doneBanner` 「목표 달성: {name}」 / "Goal done: {name}", with `g43_doneSub` 「+{n} 코인 · 다음: {next}」 / "+{n} coins · next: {next}";
  - `g43_doneToast` 「목표 달성: {name} +{n}」 / "Goal done: {name} +{n}";
  - `g43_half` 「반값」 / "half price";
  - `g43_st2Wait` 「셋째 일꾼을 뽑으면 2단이 열려요」 / "Hire a third worker to unlock level 2";
  - `g43_st2Slot` 「다른 제안을 먼저 정하면 2단 발판이 나와요」 / "The level-2 pad shows once another offer is taken";
  - `g43_houseWait` 「빈 방이 차면 지을 수 있어요」 / "You can build once the empty rooms fill";
  - `g43_shopWait` 「고기가 처음 팔리면 열려요」 / "Opens after your first meat sale";
  - `g43_readyBanner` 「마을회관 앞에서 작은 축하가 기다려요」 / "A small celebration waits at the town hall", with `g43_readySub` 「회관 앞 발판에 서 보세요」 / "Stand on the pad in front of the hall".
- **`strings.js` (`t`, anchor `v43B:G`), ko / en:**
  - `obj_g43_staff`, `obj_g43_fork`, `obj_g43_st2`, `obj_g43_st2gate`, `obj_g43_deco`, `obj_g43_house`, `obj_g43_dlv`, `obj_g43_dlvTake` (「정기 납품: {item} 가지러 가요 {got}/{need}」, empty-handed, BP-55), `obj_g43_train`, `obj_g43_shop`, `obj_g43_s4`, `obj_g43_taste` (the other ko texts are in §3.1);
  - en, for example: "Hire depot hands {have}/{n} ({cost} coins)", "Regular delivery {have}/{n} · {item} {got}/{need}", "Regular delivery: fetch {item} {got}/{need}", "The trains carry goods {have}/{n}", "Stand on the pad by the town hall · inauguration preview".
- `goals.test.mjs` already checks that ko and en have the same keys and `{slots}`, so new keys are covered automatically.

### 3.8 What G never does

- No edit to `DepotSystem.js` / `DepotBuilding.js` (D20 stands), `LineUpgrades.js`, `Growth.js`, `Freight.js`, `Rail.js`, `Progression.js` or `Save.js`. It only reads their state and listens to `gs.events`.
- No new pad: every 가기 target already exists. No layout or plot change (BP-14 freeze safe). No effect before the bank and the depot, so G1 and G2 are unchanged.
- It never caches `gs.v43` or `gs.v43.seen` across ticks (S's remap may replace the holder at load); it creates `seen` when a loaded save has none (`{ lay: 0 }`).

---

## 4. Design 2: stage 4 as a main goal

### 4.1 Rule

- **P's `mkt_s4` STEPS row** (plan §3.7 item 4) becomes:
  ```js
  { id: 'mkt_s4', type: 'shop', level: 4, after: 'f:rankEup', flag: 'g43s4', also: 'mkt_s3', side: true }
  ```
  - `side: true` stays: it keeps the row out of `MAIN_STEPS` (`GoalBook.js:22`) and out of `nextPad()`. The main-road presence comes from `GOALS43` row 9.
- **G sets `progress.flags.g43s4`:**
  - when row 9 first becomes current; or
  - at 읍 (`v4:rank` 2), when `BALANCE.goals43.s4Early` is true.
- The flag is saved in `progress.flags` (`Save.js:89` keeps any `true` key).

### 4.2 Price

- Unchanged: `market43.stage4` 2,000 + 20 planks + 8 ingots.
- × `stage4Old` 0.5 when `progress.flags.s4half` (P's price hook).
- No reward for row 9; M's `shop4Up` banner and camera look are the payoff.

### 4.3 Package scope changes

| Package | Change | Size |
|---|---|---|
| **P** | `mkt_s4` row as above (`flag`, `also`). **Item 6 (BP-16) shrinks:** no `mkt_s4` special case in `Tutorial.v42Goal` and no early side row (row 9 shows it in turn). `chief43.mjs`: "an `s4half` village shows the half-price `mkt_s4` side row" → "an `s4half` village has no `mkt_s4` pad without `g43s4`; with the flag, the pad is at half price; no banner" | −0.1 d |
| **H** | Item 4: the post-ceremony banner (once, `s4offer`) becomes 「가게 4단 「눈꽃마을 시장」도 곧 지을 수 있어요」 / 「물류창고 다음 목표들을 마치면 열려요」 (en: "Shop stage 4 is coming too" / "It opens after the goals that follow the depot"). **No navigator pin, no goal-window pointer.** With `s4Early` true, the old offer text and pointer come back. `hall43.mjs` "offer banner once" unchanged. H also keeps the `rankPad` spot free after 읍 (T uses it), and keeps B0b's `Rank.hold` accessor and `Rank.hallFrame` (BP-51) when it reworks the `atHall` framing: its own framing numbers go into `hallFrame` | −0.05 d |
| **M** | No code change. `market43.mjs` sets `progress.flags.g43s4` (one line) before buying stage 4 in its fixtures. The stage-4 transition, half price, three lines and second merchant spot are as planned | 0 |
| **N** | The `s4half` letter line becomes 「4단 「눈꽃마을 시장」은 반값에 지어요 · 차례가 오면 목표 창에 나와요」 (en: "Shop stage 4 is half price for you · it appears in the goal window in turn"). String only | 0 |
| **TX** | The `market_s4` lazy rule becomes `pr.isDone('mkt_s4') \|\| pr.flags.g43s4` (BP-50): in TX-a if it is still open when B0b lands, else TX-b. TX-b: new view, the taste scene (§5) | +0.1 d |
| **BAL** | BAL-b item 2 "teach the bots stage 4" becomes "the smart bot follows the chain (`goals43.current()`), stage 4 included; report each row's minute". New `balanceCheck` ranges for `goals43` | +0.25 d |

The plan's §2 "Step ids" row for `mkt_s4` is amended to `flag: 'g43s4'`, `also: 'mkt_s3'`, plus "main road: `GOALS43` row 9".

Between P's merge (#5) and G's (#10) nothing sets `g43s4`: stage 4 is reachable in those builds only by hook (M's and H's suites set the flag). b1 carries G, so no player build has this gap.

---

## 5. Design 3: 읍장 취임 맛보기 (package T)

### 5.1 Pad, gate, start

- **Gate:** §3.2 row 10 (sticky from `seen.g43ready`), `EupTaste.enabled`, a `gs.v4.rank` at level 2, and `!gs.v43.seen.eup_taste`.
- **Pad:**
  - a `Pad` (`entities/Pad.js`) at `gs.civic.hall.rankPadPos()`, size 2.1 m like the 승격식 pad, gold tint, icon `ui_badge_rank_2`;
  - a `floatLabel` 「읍장 취임 맛보기」;
  - it pops in with `gs.popIn`;
  - fallback with no hall (an edge case of old villages): `WORLD.v4.square.rank`, as `Game.padSpot` does (`Game.js:1559-1562`).
- **Start:** the chief stands on it for `goals43.taste.standS` (0.6 s) with zero velocity, using the TownHall board-pad pattern (`TownHall.js:121-127`), polled from T's own scene-`update` tick (no `Game.handlePlayerPads` edit). All of these must also hold:
  - no UI panel open (`ui.panelOpen`, `buildOpen`, `v4PanelOpen`, `v42PanelOpen`, `adminOpen`);
  - `rank.ceremonyOn` false (no 승격식 and no other hold);
  - no onboarding;
  - no letter card open (`v43.seen.letter43` set or no remap at this load);
  - 관망 not driving (`v42.pilot.on` false) and no free look (`gs.camPan` false). GoalWalk already turns 관망 off when it walks.
- **Hold (BP-51):** at start T sets `gs.v4.rank.hold = 'taste'`. Every `ceremonyOn` reader then waits as for the 승격식: the goal window does not open, GoalWalk holds, the 관망 countdown and camera director stop, the navigator line and the carry pill hide, residents' follow and the flag card wait, `focusCamera` re-attaches a free camera. Rank's own `tickCeremony` does not run for it. T clears `hold` at End / Skip and on the scene's `shutdown`.
- Leaving and coming back re-arms the pad (`leave` flag).

### 5.2 Script (T = seconds from start; `goals43.taste`: `len` 21, `skipAfter` 3, `cardAuto` 20)

| T | Beat | Code reused |
|---|---|---|
| 0.0 | `rank.hold = 'taste'`. The pad poofs (`fx_poof`). Music ducks. The camera glides (no white cut, BP-57: the chief already stands at the hall) to `Rank.hallFrame(venue)` = Rank's `cx + 60, cy − 160` with `cy = venue.y − 40`: `focusCamera(f.x, f.y, len × 1000)`. The joystick held at start is ignored, as in Rank | `Rank.js:77-92`; `Rank.duck` pattern |
| 0.3, 1.5 | 회관 종 (`sfx_bell_hall`, else `sfx_unlock`) | Rank |
| 0.5 | Residents gather: `gs.life.party({ pull: 700 })` (the ring round the chief); visitors in our village: `nb.gatherVisitors(venue.x, venue.y + 40, len, 12)`. No town gather (it is far off) | `VillageLife.js:943`; Rank |
| 1.2 | Banner 「읍장 취임 맛보기」 / 「서리읍 주민들이 모였어요」 (`opts.step` so onboarding never holds it) | `UI.banner` |
| 2.0–4.5 | Confetti + stars, 6 bursts over the hall front, every 0.5 s | Rank's burst loop |
| 3.0 | **Title card** (top slot): `ui_badge_rank_2` at 96 px, 「읍장」 (`rank_title_2`), 「서리읍의 읍장님, 축하드려요!」. The badge flies to the HUD rank chip (`ui.rankBadgeFly(venue.x, venue.y − 60)`), which pops | `UI.js:262`; `UIv4.js:468-476` |
| 4.0 | Residents cheer (`gs.life.cheer()`) | `VillageLife.js:816` |
| 8.0 | **Teaser card** replaces the title card (same frame): header 「다음 업데이트에서 열려요」; two locked rows with the tag 「곧 열려요」 — `ui_icon_office` 「읍장 수업 1 · 마을 경영 창」 and `ui_icon_map` 「지도에서 마을 돌보기」; footer 「진짜 취임식은 다음 업데이트에서 열려요」; button [좋아요] (BP-45: no version number) | new card (§5.3) |
| 8.0–20.0 | Waits for [좋아요]; auto-closes at `cardAuto` (20 s) | — |
| End | Cards close. `camFocus = null` (the camera glides back to the chief, a few metres). Music back over 1.2 s. `rank.hold = null`. `gs.v43.seen.eup_taste = 1`. Bus `taste {state:'end'}`. `gs.save(true)` | `Rank.js:137-158` pattern, without the white cut |
| Skip | After `skipAfter` (3 s), a joystick drag that was not held at start jumps straight to End: cards close, the marker is written. Only a skip **before the teaser card showed** adds the toast 「진짜 취임식은 다음 업데이트에서 열려요」 (through the UI scene, 1.8 s); a normal end does not repeat what the card's footer said | `Rank.tickCeremony` pattern |

- **Length:** ≈ 9 s if [좋아요] is tapped at once; 21 s at most.
- **Killed mid-scene:** the marker is not written, so the pad is there next time. Harmless: it gives nothing; `hold` lives in memory only (a new Rank starts with none).
- **Something else wants the camera meanwhile** (a site finishing calls `focusCamera` for 1.6 s): it may pan away for that moment, as during the 승격식; the next beat's `focusCamera` brings it back. Accepted, not fixed (it would need `Game.js`).

### 5.3 Cards (`src/scenes/EupTasteCard.js`, built lazily in the UI scene)

- `EupTaste` creates the card on first use in the **UI scene itself**: `const ui = gs.scene.get('UI'); ui.eupTaste = ui.eupTaste || new EupTasteCard(ui)`. (`gs.ui` is the Game scene's `UIProxy`, not a scene: it has no `add`, `Game.js:102-120`.) The card destroys itself on the UI scene's `shutdown` and re-lays itself on `resize`. **No `UI.js` edit** (plan §3.1: UI.js is B0 / P1 only).
- **Frame:**
  - `panel(ui, …, 'ui_panel', min(W − 48, 600), 300 | 380)`, top slot under the objective panel;
  - it clears the right HUD column at 360×640 (G6), using the same measure-and-fit as `OnboardOverlay.fitCard`;
  - if N exports its letter frame helper, T uses it; otherwise T copies its ≈ 20 lines.
- **Input:** only the [좋아요] button is interactive. Taps elsewhere fall through to the village. The joystick can still skip.
- **Strings (`strings.js` anchor `v43B:T`), ko / en:**

| key | ko | en |
|---|---|---|
| `taste_pad` | 읍장 취임 맛보기 | Inauguration preview |
| `taste_banner` / `taste_bannerSub` | 읍장 취임 맛보기 / 서리읍 주민들이 모였어요 | A taste of the inauguration / Frost Town has gathered |
| `taste_cheer` | 서리읍의 읍장님, 축하드려요! | Congratulations, Mayor of Frost Town! |
| `taste_next` | 다음 업데이트에서 열려요 | Coming in the next update |
| `taste_l1` | 읍장 수업 1 · 마을 경영 창 | Mayor lesson 1 · the village desk |
| `taste_l2` | 지도에서 마을 돌보기 | Look after the village from the map |
| `taste_tag` | 곧 열려요 | Coming soon |
| `taste_foot` | 진짜 취임식은 다음 업데이트에서 열려요 | The real inauguration comes in the next update |
| `taste_ok` | 좋아요 | OK |
| `taste_end` | 진짜 취임식은 다음 업데이트에서 열려요 (skip before the teaser only) | The real inauguration comes in the next update |

(「읍장」 itself is `rank_title_2`, already in both languages.)

### 5.4 What the taste never does

- No coins, items, staff, hires, rank change, repave, coach or town growth.
- No `progress.flags` change and no `x.mgmt`.
- No map building, no manage mode, no 세금 날, no pilot change.
- It does not replay the v4.3 ceremony's `v4:rankUp` / `v4:rank` events, and never calls `Rank.ceremony` / `endCeremony` (`hold` is not `cerOn`; `Rank.state().ceremony` stays false, BP-51).
- Only these are written: `v43.seen.eup_taste`, and `v43.seen.g43ready` (G, when the pad first shows).

### 5.5 Save marker

| Key | Writer | Meaning |
|---|---|---|
| `v43.seen.eup_taste` = 1 | T, at End or Skip | The taste was seen. The pad and row 10 are done |
| `v43.seen.g43ready` = 1 | G | The "small celebration" banner was shown once |
| `v43.seen.g43open`, `g43_staff` … `g43_shop` = 1 | G | The chain opened; the row markers |
| `v43.seen.g43all` = 1 | G | Rows 1–8 all done; replaces the eight row keys (BP-54) |
| `progress.flags.g43s4` = true | G | The stage-4 pad may show |
| `x.g43 = { d, t, k, u }` | G | Counters and baselines (removed when rows 3, 4, 6, 7 are done) |

`v43.seen` then holds at most 3 (letter43, tour43, s4offer) + 11 = 14 keys during the chain and 3 + 4 = 7 after it (cap 32, first 32 kept, `Save.js:505-513`). The size cost is ≈ 200 B, against the < 24,576 B gate.

### 5.6 The v4.4 contract (goes into the v4.4 plan review as a checklist)

1. **CU predicate unchanged:** the catch-up ceremony runs for every save with rank ≥ 2 and no `x.mgmt` (`engineering_roadmap.md` §4.2). `v43.seen.eup_taste` is **not** part of it, and must never skip the ceremony or the four-staff gift.
2. **Gift rules unchanged:** staff already hired get the thank-you letter (Q21); the rest come as the gift, once. The taste neither gave nor promised staff (BP-45).
3. **Retire the taste:** from `lv` 44, `EupTaste` does nothing (`EupTaste.enabled = LV < 44`, or the module is removed); `GOALS43` row 10 then drops out by data (BP-53) and v4.4's own ceremony or lesson rows follow the chain. Optional one-line variant in v4.4's first ceremony card when `eup_taste` is set: 「맛보기로 보셨던 취임식, 이제 진짜예요!」.
4. **Play log:** P1 records `eup_taste` as "taste seen", never as "ceremony seen". "Minutes after the ceremony" starts at the real one. A play log that reads `rank.ceremonyOn` (none does today) must read `Rank.state().ceremony` instead: `hold` is not a ceremony.
5. **Keep the keys:**
   - `v43.seen.*` passes `sanitizeV43` unchanged; v4.4 keeps the 32-key cap or raises it (the chain needs 4 keys after it ends, BP-54);
   - v4.4's `X_CAPS` keeps `g43: 48`, or drops `x.g43` once rows 3, 4, 6 and 7 are marked;
   - `progress.flags.g43s4` keeps its meaning (v4.4 must not re-hide the stage-4 pad);
   - `Rank.hold` stays an in-memory seam: v4.4's real ceremony uses `cerOn`, and any v4.4 scene that holds the village uses `hold`.
6. **v4.4 fixture:** a v4.3 village with `eup_taste` = 1, staff 0, rank 2 → v4.4 load: ceremony once, four staff once, coins equal; second load: nothing. The same with `eup_taste` absent: the same outcome (the taste changes nothing v4.4 reads).

### 5.7 Reuse list

- **Rank:**
  - `Rank.hallFrame` and the `hold` seam (BP-51, B0b); beat runner (`at` / `tick`, ≈ 25 lines copied, since `Rank.js` is H's), `duck`. No white cuts (BP-57).
- **TownHall:** `rankPadPos()`, `venue('rank')`, and the board pad's stand-to-open rule.
- **VillageLife / Neighbours:** `party`, `cheer`, `gatherVisitors`.
- **UI:**
  - `UI.banner` / `toast` / `rankBadgeFly` (through `gs.ui` for banner / badge; the UI scene for a toast with a hold);
  - `v42.queueBanner` for G's banners;
  - `core/Panel.panel` and the `OnboardOverlay` TXT style and fit logic.
  - The OnboardOverlay coach card itself is **not** reused: it is driven by Onboarding's act state and has no button.
- **v43 bus:** `emit('taste', …)`, `emit('goal43', …)`; P1 only listens.

---

## 6. Plan changes

### 6.1 B0b: contracts and seams (INT, serial, 0.35 d, before P's worktree is cut)

| Kind | Contract |
|---|---|
| `src/data/ids43.js` | `G43 = { staff:'g43_staff', fork:'g43_fork', st2:'g43_st2', deco:'g43_deco', house:'g43_house', dlv:'g43_dlv', train:'g43_train', shop:'g43_shop', s4:'mkt_s4', taste:'g43_taste' }`; `SEEN43` += `g43open`, `g43all`, `g43ready`, `taste: 'eup_taste'`; `FLAG43` += `g43s4`; `X43KEY = { goals: 'g43' }`; `EV43` += `goal43` (`{ id, state: 'pre'\|'now'\|'done'\|'open' }`), `taste` (`{ state: 'pad'\|'start'\|'title'\|'teaser'\|'end'\|'skip' }`) |
| Stubs | `src/systems/goals/Goals43.js`: `GOALS43` (data), `Goals43.attach(gs, info)` no-op, a class whose `rows()` returns `[]`, `sideRows()` `[]`, `refs()` an empty `Set`, `sub()` `null`, `objective()` `null`. `src/systems/v43/EupTaste.js`: `EupTaste.attach` no-op, **`EupTaste.enabled = false`**. `src/scenes/EupTasteCard.js`: an empty class |
| `src/systems/v43/index.js` | Two lines after N's and before P1's: `onAfterLoad((gs, i) => Goals43.attach(gs, i)); onAfterLoad((gs, i) => EupTaste.attach(gs, i));`. Attach creates `gs.goals43` and ticks from the scene's `update` event; every listener is removed on `shutdown` (BP-56; no `Game.js` edit) |
| `GoalBook.js` | The section-4 call in `mainRows`, the `sub` first line, the `sideRows` append, and the `G43.refs()` skip in both side loops (§3.5, BP-52): ≈ 8 lines |
| `Tutorial.js` | The `v42Goal` place / line offers / text order (§3.5, BP-55): 2 lines |
| `Rank.js` (H's file) | The `ceremonyOn` accessor over `cerOn` + `hold`, `update` / `endCeremony` on `cerOn`, `state()` fields, `static hallFrame(venue)` (BP-51): ≈ 6 lines, behaviour unchanged while `hold` is null |
| `strings.js` | Anchor pairs `v43B:G` and `v43B:T` after P1's, in ko and en |
| `goals/strings.js` | Anchor pair `v43B:G` in ko and en |
| `balance.js` / `balanceCheck.js` | `goals43: { need: { staff: 2, st2: 1, deco: 2, dlv: 3, train: 3 }, reward: { staff: 300, fork: 300, st2: 150, deco: 100, house: 100, dlv: 200, train: 200, shop: 150 }, s4Early: false, taste: { standS: 0.6, len: 21, skipAfter: 3, cardAuto: 20 } }`, with ranges (need ints: staff 1..3, st2 1..5, deco 1..6, dlv 1..10, train 1..10; rewards 0..500, sum ≤ 2,000; `len` 8..30, `skipAfter` 1..5 and < `len`, `cardAuto` ≤ `len`). Inert until G / T |
| `tools/test/v43_contracts.test.mjs` (B0's) | `EV43` names 8 → 10; the anchor list `PK` gains `G`, `T` after `P1`; `G43` ids distinct and save-safe (`/^[a-z0-9_]{1,24}$/`, the `seen` key rule); `X43KEY.goals` passes the `x` key rule; the `Rank` accessor reads `hold`. Without this the commit fails its own acceptance (§1) |
| `Save.js` (S, not B0b) | S adds `g43: 48` to `X_CAPS` in its own remaining work (S6), with a `save_v43 --node` check that `x.g43` round-trips (BP-47) |

**Acceptance:** all Node tests (the contracts test updated as above); `goals`, `smoke`, `onboarding`, `hall43`'s current rows unchanged (the stubs return nothing; `hold` is null).
**Rebase note:** S4–S5 may also touch `v43_contracts.test.mjs` (the B0-only rows) and `strings.js` (anchor S); L2 the L anchor; TX-a the lazy region of `Game.js` (not touched here). Each is a different region; rebase is mechanical.

### 6.2 Ownership additions (plan §3.1)

| File | B0b | G | T | Others |
|---|---|---|---|---|
| `src/systems/goals/Goals43.js` (new) | stub | **O** | — | — |
| `src/systems/v43/EupTaste.js`, `src/scenes/EupTasteCard.js` (new) | stub | — | **O** | — |
| `src/systems/goals/GoalBook.js`, `src/systems/Tutorial.js` | c (seams, §6.1) | — (through the seams only) | — | P **O** (unchanged) |
| `src/systems/goals/strings.js` | c (anchor) | c (anchor G) | — | P **O** |
| `src/systems/v43/index.js`, `src/data/ids43.js` | c | — | — | B0 **O** |
| `src/data/strings.js` | c (anchors) | c (G) | c (T) | per anchor |
| `balance.js` / `balanceCheck.js` | c (keys) | — | — | BAL **O** (values) |
| `src/core/Save.js` | — | — | — | S **O** (+ `X_CAPS.g43`) |
| `src/systems/Rank.js` | c (`hold` / `hallFrame` seam, BP-51) | — | — (sets `rank.hold` only) | H **O** (keeps the seam) |
| `tools/test/v43_contracts.test.mjs` | c (EV43, anchors, G43, accessor) | — | — | B0 / INT **O** |
| `tools/test/postdepot.test.mjs`, `tools/test/postdepot.mjs` (new) | — | **O** | c (`--only taste` section) | — |
| `tools/test/taste43.mjs` (new) | — | — | **O** | — |
| `tools/test/goals.test.mjs` | — | c (a post-depot section: `GOALS43` order and names) | — | P **O** |
| `padvis` | — | — | c (the taste pad row in H's hall section) | L **O**, H c |
| `texbudget` | — | — | c (view hook) | TX **O** |
| Read only by G / T | `DepotSystem.js`, `LineUpgrades.js`, `Growth.js`, `Freight.js`, `Rail.js`, `Progression.js`, `Rank.js`, `TownHall.js`, `VillageLife.js` | | | Owners unchanged; D20 holds |

### 6.3 WP-G: post-depot goals

- **Goal:** §3 and the stage-4 main row (§4.1, G's half).
- **Owns:** `Goals43.js`, the G anchors, `postdepot.test.mjs`, `postdepot.mjs`.
- **Work:**
  1. `GOALS43` rows and per-kind rules.
  2. `current()`, `rows()`, `sideRows()`, `objective()`.
  3. Opening, markers, counters, rewards, banners (BP-38 … BP-40, BP-48).
  4. The `g43s4` flag (and `s4Early`).
  5. Bus events.
  6. Strings.
- **Depends on:**
  - P (`V42_BUILDS` without the office, the `mkt_s4` row, `plotRules` in `Tutorial.plotFor`);
  - M (a real stage 4 for the end-to-end check; until then `progress.done.mkt_s4` is set by hook);
  - S (`X_CAPS.g43`; until then the unknown-key rule).
- **Merges after N.**
- **Acceptance (Node, `postdepot.test.mjs`, mock village as in `goals.test.mjs`):**
  - `GOALS43` order is exactly the 10 ids; 9 without a `mkt_s4` step; 9 / 8 with `EupTaste.enabled` false (BP-53);
  - every row has ko / en names and objective lines with the same slots; `sub()` lines too;
  - closed before the depot; **closed with the depot but no bank**; opens when every `V42_BUILDS` building stands;
  - pre-done rows are marked with 0 coins; later rows pay `reward[k]` once, even when evaluated twice;
  - **live transition:** a row whose rule is true at the first tick after a load and whose marker is missing (dropped key, crash before the save) is marked with 0 coins;
  - out of order gives a toast, not a banner;
  - `d` counts standing cards only and `t` departures with `cardAboard > 0` only; both stop at `need`; `x.g43` is removed when rows 3, 4, 6, 7 are done;
  - **baselines:** decor counts only what is built after opening; 2단 needs one more line than at opening and is ✓ at opening when all 5 lines are 2단; a trimmed `x.g43` re-takes them for unmarked rows only;
  - passive trains never become current while counting **and never hold back rows 9–10**;
  - soft rows with no path (decor no plot, 2단 no gate / hidden by `MAX_OFFERS`, house `lockVacant`, shop before meat) never block row 9 or 10, and become current again when their path comes back;
  - a missing `h43_*` site counts as built; a `foundation` first house leads to its drop pad;
  - row 9 sets `g43s4` exactly once; `s4Early` sets it at 읍;
  - row 10 needs rows 1–9 settled; **a `mkt_s4` pad held back by `paidPadNear` does not count as settled**; the taste pad stays once `g43ready` is set;
  - a marked row stays done after its state regresses; `g43all` replaces the eight row keys;
  - `GoalBook.sideRows` never lists a pad or plot that a not-done G row uses as its place (forklift, 2단, first house, `mkt_s4`), and lists the third staff pad after row 1;
  - `v42Goal` order: a place row, else a line offer, else the text row;
  - row 6's place: the dock with card goods in the bag, the source output pad without;
  - after a simulated scene `shutdown`, emitting `v4:train` / `v4:cardDone` changes nothing (BP-56);
  - `sanitizeV43` keeps every new seen key (and drops `eupTaste`, proving BP-46); the chain's keys plus today's stay ≤ 32;
  - `keepX` keeps `g43` within `X_CAPS.g43` (48).
- **Acceptance (browser, `postdepot.mjs` via `lane_b.sh`):**
  1. `v4202_46min_admin` through the real remap:
     - bank and depot by admin hook;
     - the open banner shows once, after the letter;
     - the window's 「지금 할 일」 is row 1 with its 가기 on the depot staff pad; a real tap walks there (arrives ≤ 8 px);
     - paying by hook gives +300 coins exactly once (coin census);
     - rows 2–8 driven by hooks: `depot({hire})`, `lines({up})`, admin decor build, house plots, the `v4` deliver hook on standing cards, the train timetable jump; the objective line follows each row;
     - `g43s4` → the `mkt_s4` pad appears at full price; bought → row 10 current; T's pad present (stub or real).
  2. `v43a22_late` (has a depot crew): rows pre-done with coins unchanged over 5 s; second load: no open banner.
  3. Reload mid-chain keeps `d` = 2, `t` = 1 and the baselines.
  4. **Restart:** 「처음부터」-style scene restart into the same save, then one train departure with cargo: `t` goes up by exactly 1 (no doubled listener).
  5. Row 6 with empty hands: 가기 walks to the focus card's source output pad; with the goods, to the dock (carry pill row 2 names the dock).
  6. Depot built by hook before the bank: no open banner and no row 「지금」 until the bank is built by hook.
  7. 360×640 ko / en: the goal window with the chain fits, no raw keys, and no row id listed twice.
  8. 0 page errors.
- **Must pass:** `goals`, `goals.test`, `onboarding`, `v42`, `v42_guide`, `depot.test` / `depot_parity.test` (D20), `lgx_l0`, `pilot` / `pilot.test` (관망 with a chain row current), `carry`, `smoke`, `review_robust_restart`, `chief43` (P), `market43` (M).
- **Size:** ≈ 2.25 d (module 1.15, strings 0.1, Node 0.4, browser 0.5, `goals.test` section 0.1). Browser ≈ 3.5 h.

### 6.4 WP-T: 읍장 취임 맛보기

- **Goal:** §5.
- **Owns:** `EupTaste.js`, `EupTasteCard.js`, the T anchors, `taste43.mjs`.
- **Work:**
  1. The pad and the gate (reads `gs.goals43`).
  2. The start rules.
  3. The beat runner and script.
  4. The two cards.
  5. Skip and end, the marker, the bus.
  6. The padvis row (reuses the `rankPad` spot).
  7. A `texbudget` view hook (`__FV43.taste.play()`).
- **Depends on:** H (ceremony framing at the new hall site in `Rank.hallFrame`, `rankPad` free after 읍, the `hold` seam kept), G (gate), M (stage 4 done in the fixture). **Merges after G.**
- **Acceptance (`taste43.mjs`):**
  - pad absent until the gate, present after; it stays when a soft row gets its path back (sticky); the padvis row passes (≥ 1.4 m from other pads, not under a roof);
  - standing 0.6 s starts the scene; at 5 s ≥ 6 residents are within 400 px of the venue (party active);
  - **while it runs** (`rank.hold === 'taste'`): the 목표 button does not open the window, `goals.go('cur')` answers busy, the 관망 countdown does not start, the carry pill and the navigator line are hidden, the flag card waits; `rank.state().ceremony` stays false and Rank's ceremony steps never run;
  - the title card is visible at 3–8 s and the teaser at ≥ 8 s; [좋아요] ends the scene;
  - after the end: `rank.hold` null, `seen.eup_taste` = 1 and the pad is gone; reload → no pad, row 10 done;
  - a joystick drag at 4 s skips with the same end state (and the toast); a drag held from the start does not skip;
  - a scene restart mid-taste leaves no hold and the pad back;
  - coins, office hires, depot hires, rank level and `progress.flags` are equal before and after; `x.mgmt` is absent;
  - shots at 360×640 and 412×915, ko / en, show the cards clear of the right HUD column (G6), with no version number in the text;
  - 0 page errors.
- **Must pass:** `hall43`, `hallboard`, `padvis`, `flag` (the hall pole beside the pad), `residents`, `pilot`, `carry`, `onboarding`, `smoke`.
- **Size:** ≈ 1.4 d (runtime 0.5 — no white cuts, the hold replaces per-system guards —, cards 0.35, test and shots 0.4, padvis / texbudget hooks 0.15). Browser ≈ 2.5 h.

### 6.5 Changes to other packages (beyond §4.3)

- **S:** `X_CAPS.g43 = 48` plus one Node check (≈ 0.05 d, absorbed in S6).
- **INT:**
  - two more merges and the B0b commit;
  - the `요약.md` refresh before b1 lists the chain, row 9 and the taste;
  - the release text gains one line: 「물류창고 다음 목표와 읍장 취임 맛보기가 생겼어요」 (+0.25 d).
- **TX-b:** the new view "taste scene at the hall through its 21 s, stage-4 shop already built" (the hall page and the stage-4 page may both be resident: ≈ 1,350 px apart) (+0.1 d, inside §4.3).
- **BAL-b:**
  - one smart-bot seed to 90 min reports the chain minutes and the taste minute;
  - G2 and G3 lines up to 읍 are unaffected;
  - chain rewards are report-only in G3 (+0.25 d, inside §4.3).

### 6.6 Merge order (replaces plan §4.1 rows 9–13)

| # | Merge | Why here |
|---|---|---|
| 0b | **B0b** (now, during wave 2; before P is cut) | Seams in P's files before P starts. Touches nothing that L2, TX-a or S4–S5 edit (S rebases trivially over the anchors) |
| 5 | P | As planned; carries the `mkt_s4` row with `flag` / `also` |
| 6 | S | As planned; carries `X_CAPS.g43` |
| 7 | H | As planned; announcement text |
| 8 | M | As planned |
| 9 | N | As planned (≈ 7.75); reworded `s4half` line |
| 10 | **G** | Needs P, M (stage 4), S (`X_CAPS`); after N so its open banner can be tested behind a real letter |
| 11 | **T** | Needs G (gate), H (hall framing), M → **preview `v4.3.0-b1`** |
| 12 | BAL-b | Tunes on the full set; the bot follows the chain |
| 13 | TX-b | Final texture gate, incl. the taste view and the `g43s4` page rule |
| 14 | P1 | Cut line (subscribes to `goal43` / `taste` too: no extra work) |
| 15 | Final run → `v4.3.0-b2` → release review → `4.3.0` | |

Swaps: T may merge into b2 instead of b1 if late (it changes no save shape: `v43.seen` already accepts new keys), and so is also eligible for a `4.3.0.x` (BP-8).

### 6.7 Calendar and the b1 date

| Days | A | B | C | Browser lane |
|---|---|---|---|---|
| (wave 2, now) | L2 | S4–S5 | TX-a (+ the `g43s4` page rule if still open, BP-50) → P | + **B0b** by INT (0.35 d) |
| 4.5–6 | M code | S6 → S merge (≈ 5.75) | P merge (≈ 5) → H | P suites, S suites |
| 6–7 | M merge (≈ 7) | N | H merge (≈ 6.5) → **G** | M suites, N, G Node work |
| 7–9 | **T** (≈ 7–8.6, against G's stub and a hook gate) | N merge (≈ 7.75) → G8 dry run on the fixtures | **G** to ≈ 8.75, merge ≈ 8.75 | `postdepot`, `taste43`, shots |
| ≈ 9 | T merge (≈ 9) → **b1** | INT b1 build | — | b1 smoke |
| 9–11.5 | BAL-b (incl. the chain bot) | G8 + fixes | TX-b (9–10.5) | bots, TX-b runs |
| 11.5–14 | P1 (or cut) | final-run fixes | release pack | G5 full, texbudget ×2, soak |

- **b1: ≈ day 8 → ≈ day 9.** Release candidate ≈ day 12.5 → ≈ day 14.
- **Checkpoints:**
  - if T is not merged by ≈ day 9.25, b1 ships without it and T goes into b2;
  - if BAL-b and TX-b cannot finish by ≈ day 11.5, cut P1 (tier 1, unchanged).
- **Effort:** package sizes 26.4 + B0b 0.35 + G 2.25 + T 1.4 − P 0.1 − H 0.05 + INT 0.25 + BAL-b 0.25 + TX-b 0.1 = **≈ 30.9 builder-days (range 28–33)**.
  - Above the roadmap's 19–22 + 30 %: like the 11월 7일 (Nov 7) requests, this request is outside the roadmap's number; the designer doc already says so for those.

### 6.8 Browser budget (plan §4.3)

| Item | Hours |
|---|---|
| G (`postdepot` ×2 fixtures, walks, restart, bank-after-depot) | +3.5 |
| T (`taste43`, hold checks, shots ×4) | +2 |
| TX-b taste view | +0.5 |
| BAL-b chain bot seed (90 min) | +1 |
| **Total** | **+7 h** → ≈ 83 h listed, ≈ 67.5 h wall |

### 6.9 Gates, final verification, cut line, risks

- **Gates (plan §5):**
  - G1 and G2 unchanged; nothing runs before the bank and the depot.
  - G3: chain row minutes and rewards reported, no pass line.
  - G5 adds `postdepot.test`, `postdepot`, `taste43`.
  - G6 adds the taste cards (360×640, 412×915, ko / en).
  - TX adds the taste view.
  - Roadmap extras add "the taste writes only `v43.seen.eup_taste`".
- **Final verification (plan §6):**
  - item 9 (old villages) adds: `v43a22_late` opens the chain with pre-done rows, no coins, one banner after the letter;
  - item 10 (new game) adds: after the bank and the depot, rows 1–8 in order, the `mkt_s4` pad only at row 9, the taste once (the village holds while it runs), and nothing after a reload.
- **Cut line (plan §8):**
  - **Never cut:** G (the designer's first ask: rows 1–8, and row 9 while stage 4 ships).
  - **Tier 2 (polish, `4.3.0.x` or b2):** T as a whole if late (row 10 then drops out by data, BP-53); the teaser's second row and the badge fly first, if only part is late.
  - **Tier 2:** G's open banner (the window still lists the rows).
  - **Plan tier 3 (stage 4 cut with M / H late):** row 9 drops out by data (no `mkt_s4` step), H's announcement goes with the offer banner, and the taste gates on rows 1–8. Nothing in G is rebuilt.
- **Risks:**

| # | Risk | Mitigation | Owner |
|---|---|---|---|
| R21 | A row dead-ends the chain (no 2단 offer, no free plot, no meat sale) | Soft rows never block (BP-40); the Node test covers every soft case | G |
| R22 | Players read the taste as the real ceremony and expect the v4.4 gift now, or think they got it | Teaser wording (「다음 업데이트에서 열려요」, 「진짜 취임식은 다음 업데이트에서」); no staff promise and no version number (BP-45); the v4.4 contract (§5.6) | T, v4.4 |
| R23 | Suites that build the depot by hook (`v42`, `lgx_l0`, `depot.test`) now see G's open banner or objective lines | Must-pass list in §6.3; the banner is queued, never modal; suites that count banners ignore the `g43:` keys | G |
| R24 | Counters lost if `x` is trimmed (v4.4 fills the drawer); row markers lost to the 32-key `seen` cap | Named cap (BP-47); counters only matter for unmarked rows; `g43all` compaction (BP-54); the live-transition rule never pays a re-marked row (BP-39) | S, G |
| R25 | b1 slips past day 9 | T is separable (b2 / `4.3.0.x`); G is small and starts right after H | INT |
| R26 | Stage 4 later than before (≈ 66 vs ≈ 45 bot-min) changes how G4's stage-4 merchant number is measured | G4's stage-4 run sets `g43s4` by hook (as M's suite does); nothing in G4 depends on when stage 4 comes | M, BAL |
| R27 | The taste runs while systems that pause for the 승격식 keep going (goal window, 관망, camera, flag card, carry pill …) | `Rank.hold` seam (BP-51): the nineteen reads pause with no edit to their files; `taste43` checks each | T, H |
| R28 | A G listener survives a scene restart and counts twice | Removed on `shutdown` (BP-56); restart check in `postdepot` | G |
| R29 | B0b's seams in P's and H's files drift when P / H rework them | They are ≈ 16 lines, tested by `v43_contracts` and `postdepot.test`; P and H keep them (§4.3) | P, H, INT |

### 6.10 Step-B items (plan §9)

| Item | Package(s) |
|---|---|
| B20 post-depot goals (`GOALS43` rows 1–8, opening, counters, rewards) | B0b (seams), G |
| B21 stage 4 as a main goal (row 9, `g43s4`, announcement) | P (row), G (flag), H (text), N (text), TX-a or TX-b (page rule) |
| B22 읍장 취임 맛보기 (row 10, pad, scene, cards, v4.4 contract) | T (+ G gate, B0b `Rank.hold`) |

---

## 7. Estimated timings (bots; to be measured by BAL-b)

| Point | Bot-min (estimate) | Basis |
|---|---|---|
| 읍 | 42.1–46.5 (G2 band) | plan §5 |
| Office staff ×4 (P: after 읍), bank, depot | ≈ 47, ≈ 51, ≈ 56 | M0 bank 54.3 / depot 59.4, minus the office (P moves it to ≈ 16) |
| Rows 1–2 (3,200 + 3,500 coins) | ≈ 59–62 | ≈ 2,400 coins/min after the depot (smart_s1) |
| Rows 3–5 | ≈ 63–64 | one more 2단 (900–1,600, or a third worker first) and 2 more decor (≈ 200 + a few planks); the houses usually ✓ |
| Rows 6–7 | counting since the chain opens (≈ 56) | standing cards ≈ 2–4 min each; a train every 1.5–3 min; row 7 never holds back rows 9–10 |
| Row 9 (stage 4) | ≈ 64–67 | 2,000 + 20 + 8 |
| Row 10 (taste) | ≈ 66–69 | + walk to the hall |

Humans ≈ × 1.4–1.5 → the taste at ≈ 95–100 min. The roadmap's v4.3 window (bot 0–45, humans 0–65) gains this post-읍 tail; v4.4 keeps the chain and replaces row 10.

## 8. Not verified

- Nothing built or run. Costs and minutes are balance values plus M0 arithmetic.
- GoalWalk's reach to the depot forecourt and the station dock pad at the step-B layout is assumed (both are on the nav net today); `postdepot.mjs` checks it.
- That `life.party` gathers ≥ 6 residents at the hall within 5 s at the new site is assumed from the 승격식; `taste43.mjs` measures it.
- `v43a22_late`'s exact `hires` value is not known; the test reads it and asserts on pre-done rows, whatever they are.
- (critique) How many free S / M / L plots a human village has after the depot is not known (bot fixtures have none built as decor); with none, row 4 waits as `noplot` and the chain goes on. BAL-b's chain bot reports it.
- (critique) That `Rank.hold` covers every reader that should pause is checked by grep on `20ba14e` (nineteen reads in twelve files); a package that adds a new `ceremonyOn` reader gets the taste for free, one that adds its own `rank.ceremonyOn = …` write must go through the setter (it does: the accessor).

---

## 9. Critique applied (2026-11-13)

An adversarial pass over every row's counter, the economy, the 목표 창 / objective flow, saves, ownership and tests, against `20ba14e`. The body above already carries each change; this list says what changed and why.

### 9.1 Counters and reachability (can a row get stuck?)

1. **Opening needs the bank too** (BP-38, §3.2, §3.6). The depot plot does not need the bank (`world.js:1077-1080`): opening on the depot alone would open, count and pay while the bank row is still 「지금」. Now: every `V42_BUILDS` building.
2. **Trains never gate rows 9–10** (BP-40, BP-43, §3.1 row 7). A village with no station porters and no deliveries sends empty trains; the old rule ("row 10 needs the trains row") could hold the taste back for good. Row 7 also lost its contradictory 가기 target (it was both "passive" and "dock pad"): it is passive with no place.
3. **First houses are soft on `lockVacant`** (§3.1 row 5). A house card is locked while vacant beds ≥ `maxVacant` (`Civic.js:154`): the walk led to a locked card. Also: a missing `h43_*` site counts as built; a `foundation` house leads to its drop pad, a `scaffold` one waits.
4. **2단 hidden behind `MAX_OFFERS`** (§3.1 row 3). `sp3` / 화물칸 / 썰매 offers come right after the depot and can fill the three slots (`LineUpgrades.js:41, 219-247`): a due 2단 had no pad and the sub wrongly said "hire a third worker". New wait reason `g43_st2Slot`.
5. **Row 9 "settled" tightened** (BP-43). A `mkt_s4` pad held back for a moment by `paidPadNear` would have counted as "soft with no path" and opened the taste before stage 4. Now row 9 is settled only when bought, or when `mkt_s3` itself is out of reach.
6. **Taste pad is sticky** (BP-43). Soft rows can get their path back (a plot frees up); the pad would have appeared and vanished. From `seen.g43ready` on it stays.
7. **Rows exist by data** (BP-53). Plan tier 3 may cut stage 4 and T is tier 2; either cut would have left a dead row on the main road. Row 9 needs the `mkt_s4` step, row 10 `EupTaste.enabled` (stub `false`).

### 9.2 Designer intent and the economy

8. **2단 and 꾸미기 count "more" from opening** (BP-36, BP-37, `x.g43.k/u`). The designer listed them as things to do after the depot; an absolute count ticks silently in any village that decorated or upgraded before 읍, so there would be nothing to do. 2단 is capped at the 5 lines (✓ at opening when all five are done). Bot fixtures have 0 decor and no 2단, so bot timings barely move (+≈ 1 min).
9. **Live-transition reward rule** (BP-39). A marker lost to the 32-key `seen` cap (`Save.js:505-513`), a crash before the save or a hand edit would have paid the row again. Only a false → true seen in this session pays; rewards stay 1,500 coins in all (unchanged; under a minute of post-depot income).
10. **Row 6 leads to the goods** (BP-55). An empty-handed 가기 to the dock did nothing; now the dock only with card goods in the bag, else the focus card's source output pad (`obj_g43_dlvTake`). The chief can also drop surplus himself (`Growth.feedSurplus`), which row 7 counts.

### 9.3 목표 창, objective and tutorial flow

11. **`GoalBook.sub` seam** (BP-52). The window's line under a row comes only from `sub` (`GoalBook.js:254-264`); the addendum's custom lines (2단 wait, shop wait, 「반값」) had no way in.
12. **No duplicate rows** (BP-52). The forklift pad, a 2단 pad, a first-house plot or the `mkt_s4` pad showed both as a G row in 「다음」 and as a side row (same `mkt_s4` id twice). `sideRows` now skips every place a not-done G row uses.
13. **Objective order** (BP-55). A waiting / counter G row returned text and hid the line-offer arrow that guides post-depot play today. Now: G place row → line offers → G text.
14. **Done banners queue behind the action's own** (§3.4): the depot's 「직원이 왔어요」, M's `shop4Up`. Toasts go through the UI scene (`gs.ui` is a `UIProxy` whose `toast` drops the hold).
15. **Carry pill row 2** checked: unchanged behaviour (dock pin names the dock with card goods; output-pad and plot pins show no row 2).

### 9.4 The taste

16. **`Rank.hold` seam** (BP-51, §5.1). Nineteen reads in twelve files pause for `rank.ceremonyOn`; the taste set nothing, so the goal window, 관망 countdown and camera director, navigator line, carry pill, follow, flag card and 금방 ports all ran on top of it. Setting `ceremonyOn` directly would run Rank's `tickCeremony` / `endCeremony`. The accessor makes every reader pause with no edit to their files; Rank's clock runs on `cerOn` only; `state().ceremony` stays false (v4.4's "ceremony seen" is never confused).
17. **Card lives in the UI scene** (§5.3): `gs.ui` cannot `add`.
18. **No white cuts; `Rank.hallFrame`** (BP-57). The chief already stands at the hall; Rank's cuts exist only for the station half of the 승격식. One framing helper instead of T copying H's numbers.
19. **No version number in player text** (BP-45): 「다음 업데이트에서 열려요」, tag 「곧 열려요」. The end toast only after a skip that came before the teaser (it repeated the footer).
20. **v4.4 contract** (§5.6): keep the 32-key cap or raise it; `x.g43` cap 48; `hold` is not a ceremony; the fixture also runs with `eup_taste` absent.

### 9.5 Saves

21. **`X_CAPS.g43 = 48`, not 128** (BP-47): the value is ≈ 30 B; 128 used the drawer's last headroom. The drawer already exists (S1–S3), so the key works today as an unknown key.
22. **`g43all` compaction** (BP-54): 11 `seen` keys during the chain, 4 after it.
23. **Never cache `gs.v43` / `seen`**; create `seen` on a `{ lay: 0 }` holder (§3.8).

### 9.6 Ownership, merge order, tests

24. **B0b grows to 0.35 d** (§6.1): the `sub` and side-skip seams, the `Rank.hold` / `hallFrame` seam in H's file (H has not started), `EupTaste.enabled`, wider `balanceCheck` ranges, and the **`v43_contracts.test.mjs` update** — it asserts exactly 8 `EV43` names and the anchor list L…P1, so B0b would have failed its own "all Node tests" acceptance.
25. **Listeners removed on `shutdown`** (BP-56): the scene emitter outlives a restart; a kept `v4:train` listener would count every train twice. `review_robust_restart` joins G's must-pass list; a restart check joins `postdepot`.
26. **TX-a takes the `g43s4` page rule if still open** (BP-50), so b1 does not preload the stage-4 page from 읍.
27. **The P → G window** (§4.3): between P's and G's merges stage 4 is reachable only by hook; b1 carries G, so no player build has the gap.
28. **Tests added** (§6.3, §6.4): bank-after-depot, live transition, baselines, every soft case incl. `lockVacant` and `MAX_OFFERS`, row-9 settled rule, sticky pad, de-duplication, objective order, row-6 place, listener removal, `seen` ≤ 32, `X_CAPS.g43`; for T, the hold checks (goal window, 관망, carry pill, navigator, flag card), restart mid-taste, no version number on the cards. `pilot` and `carry` join T's must-pass list.

### 9.7 Plan numbers

29. Effort ≈ 30.6 → **≈ 30.9 builder-days** (B0b +0.1, G +0.25, T −0.1). Browser +6.5 → **+7 h** (≈ 67.5 h wall). G merge ≈ 8.5 → ≈ 8.75, T ≈ 8.75 → ≈ 9: **b1 stays ≈ day 9**; the T checkpoint (day 9.25) is unchanged.
30. Risks R27 (taste without a hold), R28 (listener after restart), R29 (seams drifting in P's / H's files) added; R22 and R24 updated.
31. Editorial: row 3's `{name|을/를}` sat bare in a table cell and split the row; it is in code now.
