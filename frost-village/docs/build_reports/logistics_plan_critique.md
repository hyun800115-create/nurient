# Critique — logistics plan (`docs/logistics_plan.md`) and designer doc (`docs/기획서_물류수요개편.md`)

Status: **REVIEW** (2026-10-18). Adversarial read of both documents against the code in the tree and the measured numbers.
Nothing in `src/`, `tools/`, `assets/` or the tests was changed, and nothing was committed. `docs/build_reports/v42_touch.md`
still does not exist; the touch's code was read as it stands (`WarehouseCrew.js`, `LineUpgrades.js`, `BALANCE.warehouse.crew`).

**What was checked**
- Code: `Logistics.js` (`PRIO`, `best`), `Worker.js` (`RawPorter`, `Porter`, `WarehousePorter.think/rawJob/planDest`,
  `StationPorter`), `WarehouseCrew.js`, `LineUpgrades.js` (`hireP2`, `f4Due`, `afterRestore`), `Progression.js`
  (`STEPS`, `GOALS`, `BUILD_UNLOCK`), `Station.js` / `Workshop.js` (input sinks and priorities), `Seller.js`
  (`makeWant`, substitution), `StockLedger.js`, `Surplus.js`, `Warehouse.js` (`STORABLE`), `UI.js` (`popBox`),
  `UIv4.js` (rank / order chips), `Save.js` (`sanitizeSave`), `Game.js` (create order, hire functions, `refreshSites`),
  `Site.js`, `geumbang/ports_v4.js` + `geumbang/tuning.js`, `BALANCE` (prices, customers, stations, `v42.*`, `v4.founding`).
- Numbers: the flow map; the run-L probe output itself (`…/scratchpad/econ/auto10.json`: item flows, pile shares, the
  StockLedger rows sampled in the same run); `v42_code2.md` §8–§9 (census, display objects, logic, textures);
  `v44_plan.md` §19 (HUD, shell), D13, D29; `geumbang_plan.md` D4 / §12.4; the demand and carry drafts' models.
- Every gate number in §2.2 / §9 was recomputed from the plan's own cells and models (§2 below).

---

## 0. 디자이너용 요약 (쉬운 말)

- **"창 하나로 묶기"는 맞아요.** 마을 경영 한 창(현황 · 일꾼·짐꾼 · 물류)이 휴대폰에서 제일 나아요. 다만 인구 칸(👥 23/30)은
  "주민 수"라서, 누르면 일꾼 창이 열리는 걸 처음엔 모를 수 있어요. 처음 한 번은 알려 주는 안내가 필요해요. 그리고 그
  칸은 손가락으로 누르기에 조금 작아요.
- **숫자 목표 중 몇 개는 계획서 자신의 계산으로도 닿지 않아요.** 특히 "모아두는 곳 가득 50 % 이하"는 광석·고기 더미를
  각각 약 18 % 아래로 내려야 해서, 용광로·훈제장 3단을 둘 다 사야만 가능해요.
- **훈제 고기는 늦은 마을에서는 "나르는 손"보다 "판매대 손님 수"가 한계예요.** 판매대는 1분에 약 102개를 팔고, 손님의
  절반만 고기를 골라요. 고기를 더 날라도 1분에 약 7개만 더 팔리고, 그만큼 생선구이·빵이 덜 팔려요.
- **생선은 세 군데(통조림 · 포장마차 · 잔치)가 같은 남는 생선을 나눠 써요.** 그런데 계획의 시험은 어부 한 명을 숲으로
  옮겨요. 그러면 생선이 모자라서 포장마차가 쉬어요.
- **자재창고는 "손님"이 아니라 "큰 바구니"예요.** 처음 10~15분은 더미가 줄어 보이지만, 다 차면 다시 원래대로예요.
- **금방(v4.3)도 남는 원료를 사 가는 손님이에요.** 이 계획이 원료를 먼저 다 쓰면 금방 창고가 비어요. 두 계획이 같은
  원료를 두고 다투지 않게 순서를 정해야 해요.
- **짐꾼 2를 옮긴 줄에서 짐꾼 2를 또 사면, 지금 코드로는 돈만 내고 아무도 안 와요.** 만들기 전에 고쳐야 해요.
- 그 밖에: 밭으로 옮기면 빵이 더 남아요(숲으로만 옮기기), 값싼 어부를 사서 광산으로 옮기는 "값 빼먹기"가 돼요,
  수입 목표 폭(+30~65 %)이 너무 넓어서 문제를 못 잡아요.

---

## 1. Verdict

**37 findings: 0 critical · 8 high · 16 medium · 13 low.**

The diagnosis (half demand, half carrying; idle gatherers, busy porters; carrying fixes first) is sound and matches the
probe data. The one-window answer is right and the "no new HUD button" deviation from the task default is justified by
`v44_plan.md` D13 and the HUD code. The first 20 minutes are safe: new plots are hidden until their `after` step
(`Game.refreshSites`) and a plot adds collision only when building starts (`Site.js:204`).

What does not hold:
1. **The end gates are not reached by the plan's own numbers** (G1 ≤ 50 % needs ore and meat ≤ ≈ 18 % each and D5 on
   both stations; the L1b row's "45–65 %" is 58–68 % from its own cells; v4.2.1's ore ≤ 40 % needs ≈ 2× the ingot
   carrying §5.7 budgets).
2. **Two "demand" fixes move the pile instead of draining it**: extra smoked meat at the 판매대 displaces fish and bread
   (guest share + substitution in `Seller.js`), and the 자재창고 is a buffer that fills.
3. **Fish is allocated three times** while the acceptance test moves a fisherman away.
4. **G4 cannot be measured with the stated tool**, and the measuring tool itself lives in a session scratchpad.
5. **Cross-plan**: 금방 is the raw-surplus buyer this plan drains; its gates are re-based on v4.2.1 but not on v4.3.2.
6. **One code-contract gap** that will lose coins (`LineUpgrades.hireP2` dedupes by line).

### The designer's question: one window or separate?

**One window — agree**, with four changes (findings 16, 17, 20, 21):
- Open on **현황** every time (not "일꾼·짐꾼 unless nobody waits"): a door that lands on different tabs reads as random.
- The popBox counts residents, and workers do not count as residents: show a one-time banner at village complete
  (`인구 칸을 누르면 마을 경영 창이 열려요`) and keep the 💤 pip inside the 150 px chip.
- Rows of idle people who cannot be moved (🔒) need their own wording, or the designer's core ask reads as "no".
- The 상업 card needs a source before the office exists (≈ 20–45 min).

The 360×640 / 390×844 check: no free slot for a new button at 360×640 (verified: popBox (28, top+152), rank chip
(188, top+152), order chip (28, top+212), joystick bottom third; v4.4's stack folds to 3 rows there). The shell body is
928 px at 390×844 and 888 px at 360×640 (`ph = min(H − 220 − insets, 1100)`); the eight cards fit, the header and the
footer note do not (finding 20).

---

## 2. Re-derived numbers

| Quantity | Plan says | Recomputed | How |
|---|---|---|---|
| "Any pile ≥ 90 %", run L baseline (fish .72 · ore .63 · meat .70 · wheat .11) | 93 % (census) | 97 % independent; census per-pile (53 · 57 · 76 · 11 · log 6) → 96 % vs measured 93 % | `1 − Π(1 − pᵢ)`: the independence model slightly overestimates, so it is a fair upper bound |
| After v4.2.1 (ore ≤ 40 · meat ≤ 60 · fish ≈ 65 · wheat 11) | ≈ 90 % | 93 % | same formula on the plan's cells |
| After L1a (≤ 30 · ≤ 40 · ≤ 50 · 11) | ≈ 80 % | 81 % | consistent |
| After L1b (≤ 30 · ≤ 40 · fish 0–15 · wheat 0–10) | **≈ 45–65 %** | **58–68 %** | the lower bound 45 is not reachable from the cells |
| G1 ≤ 50 % with fish 15, wheat 10 | "with D5 ≈ 20–50 %" | needs **ore = meat ≤ 18 %** (20 % → 51 %, 25 % → 57 %, 30 % → 63 %) | needs D5 offered **and bought** on both stations |
| Ore r = potential ÷ take after LD2 (demand draft potential 92) | ore ≤ 40 % | take ≈ 65 at today's ingot carrying (54 processed + 6 station-porter exports + ≈ 5 crew raw runs) → r ≈ 1.4 → **≈ 70 %** by the plan's own pile model; ≤ 40 % needs the smelter at its full 75.8 → **+22 ingots / min carried**, not +12 (§5.7) | `logistics_draft_demand.md` §6 model (≈ 70 % once r ≥ 1.2) |
| 판매대 food sold per minute (run L) | — | 102.2 (bread 28.8 · meat 44.1 · fish 29.3); meat share 43 % | `auto10.json` `shelf:market>use` |
| Smoked meat the 판매대 can still absorb | +16 / min (§5.7) | **+7 / min** (to the 50 % guest share), each displacing a fish / bread sale | `Seller.makeWant` (`foods[rand]`, then 25 % "newest"), `Seller.js:315` substitution |
| Per-porter rate `60·L ÷ (d/75 + 0.28·L)` | 25 (1,730 px) | 31 (L 14); 22 (2,209 px, L 12); 14.5 (2,885 px, L 10); **6.6** for a plaza 창고 crew ore run (≈ 6,600 px round, L 10) | §3.4 formula |
| Touch crew target `2 + ⌊(made − 300)/70⌋`, cap 6 | ≈ 4 at 35 min, 5–6 late | 3 at ≈ 380 made (≈ 22 min), 4 at 470–480, 6 at 590 | `WarehouseCrew.target()` |
| StockLedger flows vs probe (same run) | cards read ledger `inPm` / `outPm` | pile:fish in **27** vs 60 · out:sawmill in **29** vs 50 · shelf meat out **34** vs 44 | `auto10.json` `ledger` vs `flow` |
| 교역소 shelves at the display floor | — | planks 68 %, ingots 71 % of the time (`emptyAt` = `displayKeep` 2) | `auto10.json` `ledger` `emptyPct` |

---

## 3. Findings

Severity: **High** = a gate, number or contract in the plan is wrong in a way that changes what gets built or how it is
accepted · **Medium** = a real gameplay, readability, perf or schedule problem with a clear fix · **Low** = a detail
to fix in the build contract.

### A. Gates and flow numbers

**1. High — G1 / G2 are not reachable from the plan's own cells; the stated ranges are optimistic.**
- Evidence: §2 above. The L1b row says "≈ 45–65 %" but its cells give 58–68 %. G1 ≤ 50 % needs ore and meat each
  ≤ ≈ 18 % (with fish 15 and wheat 10). That requires D5 to be offered and bought on both the smelter and the smokehouse.
- The smokehouse offer is unlikely (finding 2: late meat is guest-limited, so the operator is not "busy ≥ 90 %").
- At v4.2.1 the ore cell (≤ 40 %) contradicts the plan's own pile model, which gives ≈ 70 % at r ≈ 1.4.
- Fix:
  - Restate §9 / G1 with the computed ranges (v4.2.1 ≈ 93 %, L1a ≈ 81 %, L1b ≈ 58–68 %, with D5 ≤ 45 % only when both 3단
    are bought).
  - Make G1 ≤ 50 % conditional on "both 3단 bought" or on an explicit 이직 (one hunter out of the hunt).
  - In B1, replace "ore ≤ 40 %" with "smelter processed ≥ 70 / min and ore ≤ 60 %".
  - Budget **+22** ingots / min of carrying (≈ 0.8–1 porter on the 1,730 px route) in §5.7.

**2. High — Late smoked meat is limited by the 판매대 guests, not by carrying; the extra meat moves the pile to fish and bread.**
- Evidence: the 판매대 sold 102.2 foods / min in run L. A guest picks meat with probability 0.25 + 0.75 × ⅓ = ½
  (`Seller.makeWant`, `Seller.js:220`), so meat tops out near 51 / min. Today it sells 44.1, which leaves ≈ +7.
- `Seller.js:315` switches a guest whose food is out to any food on the shelf. Today's fish and bread sales include
  meat-seekers, so every extra meat sale removes a fish or bread sale.
- Mid-game (S25 / S35, meat empty 42 / 32 %) that substitution is ≈ 3× larger. Fixing the meat gap there takes demand
  away from the grill and the oven and raises the fish / wheat piles at 25–40 min. It also raises income (12 vs 4–7 a
  food) inside the 읍 window.
- §5.7's "+16 smoked meat → 판매대", D5-smokehouse's "+50 to +194 coins" and LD18 ("smoked meat sells out once carried")
  do not hold late. The touch's restaurant may absorb part of it but is unmeasured.
- Fix:
  - Re-classify late meat as "demand-capped at the 판매대 (≈ 51 / min) + pantry + food box".
  - Count the displacement in §9 / §10 (net coins per extra meat ≈ 12 − 5.5).
  - Size the meat lever as **이직 (one hunter out)** or a meat buyer (D8 earlier, or 솔방울 restaurant demand —
    finding 22), not D5.
  - Add "fish / wheat pile at S35" to G7 / G8's side measures.

**3. High — The 자재창고 is a buffer; G2's L1a cells would be met only while it fills.**
- Evidence: raw share 240. The surplus potential after LD2 is ore 16–22 + meat 4–16 + wheat 2–7 ≈ 22–45 / min.
- Its only exits are the station porters (91 % busy today; their raw export is ≈ 24 / min) and the 금방 sled (≈ 6).
  It fills in ≈ 8–15 min whenever inflow beats ≈ 30 / min.
- K16's mitigation is "YARD stops at 95 %", which hands the surplus back to the piles. Raw porters' YARD runs (709 px for
  ore) also take the porter off the line ≈ 12–15 s each time the input is full: the starvation LD2 removes, smaller.
- Fix:
  - Measure G2 / G1 for L1a only after the yard has reached steady state (pre-fill it to its raw share in the probe
    setup, or report minutes 20–60 after it is built).
  - Add a gate "yard raw ≤ 80 % of its share after 30 min".
  - Size the yard's exits explicitly (an extra station porter, or the 금방 sled's first stop counted as capacity).
  - Say in the designer doc that it is a basket, not a buyer.

**4. High — Fish is allocated three times, and the B2 acceptance removes the supply; the stall ties with the cannery.**
- Evidence: the new fish sinks are the cannery link (+12, LD5), the stall (21 avg, 48 at the peak), D2 (+3) and D3 (+4–6).
  That is ≈ 40–42 / min against a surplus potential of ≈ 36–40 with **three** fishermen (demand draft §1).
- B2's acceptance moves one fisherman away: potential drops by ≈ 33. The grill (GRILL 60) is fed first, and the cannery
  link needs pile ≥ 60 %. The stall gets fish only from piles ≥ 85 % (raw porter local job and board supply), so it idles.
  D1's +55 coins and "fish ≈ 0–15 %" then come from a starved stall.
- The stall's `inPrio` 42 equals the cannery's calm input prio (`BALANCE.v42.porters.inputCalmPrio` 42,
  `Workshop.inputPrio`). A pool porter splits fish by distance between 2.7 coins a fish (skewers: 3 fish → 4 × 2) and
  ≈ 8.7 coins a fish (cans: 3 fish + 1 ingot → 3 × 12, minus the ingot).
- Fix:
  - Stall `inPrio` 40 (below the cannery's calm 42; `balanceCheck` range "< inputCalmPrio").
  - B2's probe moves **two people to the forest from hunters / miners**, not a fisherman (or re-measure D1 with the
    fisherman moved).
  - Size D1 against the fish left after the cannery link and say so in §6.2.

**5. High — G4 (smoked meat empty at 25–35 min ≤ 15 %) cannot be measured with the tool named.**
- Evidence: probe S25 / S35 are "the saves as they are, chief parked". In S25 there is no 창고 (built ≈ 32 min), and a
  parked chief builds nothing and buys no 짐꾼 2. In both saves the smelter and smokehouse are blocked by goods carrying
  (31 / 42 %), which LD2 does not touch.
- LD3's effect (창고 → 짐꾼 2 earlier) needs player purchases, so the S25 / S35 probe shows ≈ the baseline. B1 would fail
  or be waived.
- Fix: measure G4 on **fresh-game smart-bot runs to 40 min** (median of 5), the bot building the 창고 when offered and
  buying 짐꾼 2 pads. Keep S25 / S35 only as "no worse" checks.

**6. High — 금방 is the raw-surplus buyer this plan drains, and its gates are not re-based on v4.3.2.**
- Evidence: 금방's catalogue weights raw fish, raw meat and logs at 1.0 and wheat at 0.6 (`geumbang/tuning.js:17–18`).
  Its raw prices are 2–5, against the 물류창고's 1–3. Its stock is "depot racks only" (`geumbang_plan.md` D4), fed by
  the dock surplus via the sleigh.
- The plan cuts raw walked to the dock from 39 to ≤ 10 / min, keeps 144 raw in the yard (60 % of its raw share), and
  adds D5 / D1 to consume the rest.
- The demand draft's own table shows 금방 alone moves "any pile" 93 → 86 % (Lv1) / 64 % (2 sleds). Yet §9 / §10 skip
  v4.3 entirely and go from v4.2.1 straight to L1a. G16 says "same" for v4.3.2 without naming a re-run.
- Fix:
  - Put v4.3 (+ 금방) as its own column in §9 (the L1 baseline is v4.3.1, not v4.2.1).
  - Re-run `gb_drain` and 금방's income / stock gates after L1a and L1b.
  - Decide the priority between yard exports, D5 and 금방 (e.g. the yard keeps ≤ 40 % and gives the rest to the sled
    first).
  - Tell the designer in the doc that 금방 is one of the "customers".

### B. Code contracts

**7. High — Moving a 짐꾼 2 breaks `LineUpgrades`: a paid pad can hire nobody, and a porter vanishes on reload.**
- Evidence: `hireP2(line)` returns early when any `porters2` member already has `station.id === line`
  (`LineUpgrades.js:235`). After a p2 is moved grill → smokehouse, `f4Due('smokehouse')` still offers the smokehouse
  pad: `p2` holds only `'grill'`, and `hasPorter`, `fullT` and the 창고 all pass (`:91`). Paying it pushes `'smokehouse'`
  and then `hireP2` hires nobody.
- On reload, `afterRestore` (`:62–63`) calls `hireP2('grill')` (Jobs places it at the smokehouse) and then
  `hireP2('smokehouse')`, which is skipped. The bought porter is gone.
- The plan only changes `hasPorter`.
- Fix: key p2 by **slot** (`p2:<origin line>`) in `porters2`, dedupe by slot, and make `f4Due(line)` false while the line
  already has 2 + goods porters (or let the pad be the 3rd within the cap). Add a `jobs_live.mjs` case: "move a p2 in,
  buy that line's p2, reload → 3 porters".

**8. High — The measuring tool lives in this session's scratchpad.**
- Evidence: B1 says "Create `tools/test/econ/…` (from `/tmp/claude-0/…/scratchpad/econ/`)". The probe runs against a
  scratch snapshot of the game (`--repo …/econ/fv`). The touch builder may be another session or container, where that
  path does not exist. Every gate (LD24) depends on this probe.
- Fix: copy `probe.mjs`, `an.js`, `lines.js`, `val.js` and the run-L / S25 / S35 outputs into the repo now (e.g.
  `tools/test/econ/` plus `docs/build_reports/econ_baseline/`) in the next WIP snapshot. B1 then cleans them up rather
  than fetching them.

**9. Medium — The crew need gate (LD4) does nothing; the crew still grows to the touch's 6.**
- Evidence: "busy" = share of crew samples not `idle`. Today the crew is 92 % walking, much of it carrying unsellable
  overflow (13.5 cooked fish / min into the 창고).
- "Backlog" in v4.2.1 = "an output ≥ `overflowAt`", which is true about half the time on the demand-blocked grill and
  oven (blocked 54 / 45 %). Both tests are almost always true late.
- The "≈ 4 instead of 5–6" claim, and the display-object and agent saving built on it (G12, §13.4), are unsupported.
- Fix: count backlog only for jobs whose sink is a use (prio ≥ 40), not STORE 10 / SURPLUS 12; count busy only on such
  jobs. Or simply lower `warehouse.crew.cap` to 5 and keep the touch rule.

**10. Medium — The early 창고's crew will walk ore to the dock before carrying smoked meat.**
- Evidence: `WarehousePorter.think()` returns a long raw run (`raw.long`, pile full ≥ 2 × `pileForS`) before the
  overflow / direct jobs (`Worker.js:748–749`). At 22–35 min the ore pile is 85–89 % full.
- The crew LD3 brings earlier will spend its time on ore → dock runs: ≈ 6,600 px per load from a plaza 창고, ≈ 6.6 ore /
  min a porter, ≈ 1 coin each. It does not touch the smoked-meat / ingot gap LD3 is meant to close.
- Fix: in v4.2.1 put raw runs after overflow / direct until 읍 (or until the 자재창고 stands), and drop raw runs whose
  walk exceeds `localPx` from a 창고 at `v_wh`.

**11. Low — `WarehouseCrew.crew()` counts only the 창고's porters.**
- Evidence: `crew()` = `gs.warehouse.porters.length` (`WarehouseCrew.js:43`) and arrivals fire while
  `crew() < target()` (`:76`). A member homed at the 자재창고 would leave `crew()` short for good: one arrival every
  60 s, forever. `afterRestore` respawns everyone at the 창고.
- Fix: the B2 contract states that `crew()` and `afterRestore` count and restore the pool across both buildings, with
  each member's home saved.

**12. Low — Station inputs have one fixed priority; BACKFILL 55 cannot be a sink priority.**
- Evidence: every station `inSink.prio` returns `PRIO.GRILL` 60 whatever the source (`Station.js:48`).
- Fix: write BACKFILL as a source rule of the board (the yard gives raw to an input only when input < 50 % and pile
  < 25 %), not as a new `PRIO` entry.

**13. Low — 4th / 5th gatherer placement and the restore path.**
- Evidence:
  - `workerHome` adds `index × (40, 20)`.
  - `dropSpot` uses `D[index % 3]`, so the 4th shares the 1st's spot — the hunter collision v4-B fixed.
  - The fisher stand is `fisherSpot.x − index × 78`, which puts the 5th 312 px left of the spot.
  - `Progression.js:356–357` hard-code index 1 / 2 for `hire2` / `hire3`, but `Progression.js` is not in the L1a file
    list. Jobs must be constructed right after `buildV42` and before `progress.init()`.
- Fix:
  - Add `Progression.js` to §11.2.
  - Give lines 4–5 their own drop and stand offsets in `world.js`.
  - Add a `jobs_live` screenshot check of 5 fishermen and 5 lumberjacks.

### C. 이직 rules

**14. Medium — 이직 to the fields makes bread surplus worse; B2 and the designer doc both say "숲·밭".**
- Evidence: the oven is blocked 45 % on demand. +17 wheat / min gives a wheat r ≈ 1.3, so the wheat pile goes from 11 %
  to ≈ 70 % ≥ 90 % (the plan's own model), and G1 gets worse.
- §10.1 counts "+30 logs / wheat → planks / bread ≈ +150 coins". The bread part does not sell.
- Fix: forest only, in B2, §2.1, §10.1 and the designer doc §7. Auto-assign already moves only into starved lines, and the
  bakery is never starved.

**15. Medium — Hire prices can be skipped.**
- Evidence: all `hire2_*` except the lumberjack's, and all `hire3_*`, are `side` (optional) steps. They are priced per
  line: hunter 1,200, miner 900, farmer 800 / 600, fisherman 500 / 450 (`BALANCE.hire2`, `hire3`).
- Free moves with ≤ 5 a line let a player buy the cheap fishermen and move them to the mine or the hunt. The per-line
  ladder ("keep hire costs fair" in the task) stops meaning anything.
- Fix: a gatherer may move into a line only after that line's own `hire2` / `hire3` are bought (so moves only add a
  4th / 5th), or charge the price difference (차액) on the first move.

**16. Medium — Most of the visibly idle people are locked anchors.**
- Evidence: after LD2 the raw porters wait at full inputs more. The 도구 짐꾼 is 100 % idle from 25 to 35 min, and
  operators are blocked 27 %. All of them are anchors (🔒).
- The 일꾼·짐꾼 tab will show many grey "쉬어요" rows that cannot move. The designer's core ask ("놀고 있는 일꾼짐꾼을 …
  이직") reads as "no".
- Fix:
  - Show anchors as `대기 · 줄 지킴` (blue, not grey idle).
  - Let an idle anchor porter take board jobs ≤ `localPx` while idle (raw porters already get local jobs).
  - Say plainly in the designer doc which idle people stay and why.

### D. Hub and phone readability

**17. Medium — The popBox as a door: what it means and how big it is.**
- Evidence:
  - The popBox shows residents (`n / cap`), and gatherers and porters do not count toward `population3` (§5.4).
  - Its drawn width is variable: `max(110, w)`, ≈ 210 with "+n waiting" (`UI.js:663`). The 💤 chip "on a `ui_chip`"
    appended to it reaches the rank chip at x 188.
  - The hit area of 150 × 56 logical is 28 CSS px tall at 360×640 DPR 2, below a 44 pt touch target, and it is the main
    door.
- Fix:
  - The 💤 count as a ≤ 28 px pip on the icon, inside the first 150 px.
  - A one-time banner at village complete.
  - The door always opens **현황**.
  - Keep office and letter doors; in v4.4 the stack row gives 88.

**18. Medium — The cards' numbers come from a ledger that reports about half the real flow.**
- Evidence: `StockLedger` computes flows from 1 Hz net count deltas (`StockLedger.js:71`). In the same run-L sample:
  pile:fish in 27 vs 60 caught, out:sawmill 29 vs 50 made, meat shelf out 34 vs 44 sold. The mock-up's `잡기 59 · 팔림 29`
  would read about `잡기 27`.
- For 어업 the card also compares raw caught with one product's sales, although fish feeds the grill, the cannery and the
  stall.
- Fix: count events (`noteMade` per line, `sold` / `use` per item) into per-sector per-minute counters for the hub. On 어업
  show `잡기 59 · 쓰임 55` with a breakdown in the detail.

**19. Medium — Lines sold to an unlimited buyer (planks and ingots at the 교역소) look red or orange most of the time.**
- Evidence: the 교역소 shelf sits at its display floor 68 % (planks) and 71 % (ingots) of the time. The merchant buys at
  once, and `emptyAt` = `displayKeep`.
- `StockLedger.status` turns that into `short` / `jam` (`StockLedger.js:94–96`). 임업 and 광업 will rarely be green, and
  auto-assign's goods need ("status 'jam'") will keep pulling 짐꾼 2 toward the smelter.
- Fix: for shelves with `unlimited` buyers, base the status on output-full share and pile share, not shelf-empty time.

**20. Low — 360×640 does not quite fit "산업 현황".**
- Evidence: 4 × 200 + 3 × 10 = 830 px of cards, plus the `산업 현황` header and the `숫자는 1분에 몇 개예요` footer, comes
  to ≈ 910–920 px against an 888 px body (less with Android insets). The designer doc says all 8 cards fit.
- Fix: drop the header (the tab already says 현황) and move the footer note into the detail view, or use 190-px cards.

**21. Low — The 상업 card and the office doors have no source between ≈ 20 and ≈ 45 min.**
- Evidence: `Office.income` exists only once the office is built (plot `after: 'b:town_hall'`, ≈ 40–47 min). The hub opens
  at village complete.
- Fix: read the tills directly (`villageTills`) for the card; show the office doors only when the office stands.

### E. Demand items

**22. Medium — A zero-art demand lever was missed: the 솔방울 shops' own customers.**
- Evidence: the founded cafe (bread), restaurant (cooked fish + smoked meat) and supermarket (cans + bread) each sell one
  item per 40 s to town buyers (`v4.founding.inlandEvery` 40). These are exactly the demand-limited goods.
- §4.5 dismisses "more guests" only for the 판매대. The catch is carrying: these are remote sinks (station porters,
  2,569 px).
- Fix: add an option "솔방울 손님 늘리기" (`inlandEvery` 40 → 20 after 읍) with a station-porter check. It answers the
  designer's "상가 … 고객을 늘리면" literally, with existing art.

**23. Medium — D4 stoves run at a loss once every home has one.**
- Evidence: one stove per home, ever. After that, stoves go to the 철물점 (≈ 1.5 / min across shops), 금방 (weight 0.1)
  or the dock at 30 × 0.5 = 15 coins. They are made from 2 ingots + 1 plank, worth 25 at the 교역소.
- The toolsmith casts whenever `pickTool()` is empty (idle 38 % late), so this never stops.
- Fix: make to order (homes without a stove + 철물점 shelf < n), never for the dock. State D4 as content, with
  ≈ 0 coins after saturation.

**24. Low — The stall's coins and the stove payments need a till.**
- Evidence: a new `CashPad` that is not in `villageTills` is never collected by 딸랑이 or in 관망. v4.4's income meter
  (D29) counts only registered tills. "Stove pays on delivery" names no till.
- Fix: register the stall's till with the office courier and with v4.4's till registry (§18 of the plan). Pay stoves into
  the 철물점 or the market till.

**25. Low — The feast lands in the evening peak.**
- Evidence: the feast at 18:00 meets the stall's ×1.6 evening peak and the evening lamps (+13 at the plaza in `soak42`).
  The green is ≈ 930 px from the plaza, so both are in view at z 0.6. G12 counts the stall (≈ 25) but not the feast's
  food sprites and guests.
- Fix: bake the feast table pile (one image) and add the feast to the G12 views.

### F. Performance and budgets

**26. Medium — The plaza 창고 plot (`v_wh`) adds to the busiest view and is never measured there.**
- Evidence: `v_wh` sits ≤ 600 px from the 판매대. It brings the 창고 sprite, label, pads, the baked pile and up to six
  crew waiting in two rows (`WarehousePorter.homeFor`).
- The plaza is already over the 1,700 gate: late 1,653, z 0.6 1,810, `soak42` up to 1,916. G12 is measured on the v4.1
  46-min save, whose 창고 stands elsewhere.
- No coordinate is given ("the layout test picks it"). A reserved `only: 'warehouse'` plot stays dead in every save that
  built the 창고 elsewhere (the v4 "no dead-end plots" rule).
- Fix:
  - Give a coordinate, checked for an M footprint off the customer path.
  - Measure G12 on a fresh run with the 창고 at `v_wh`.
  - Let `v_wh` take a house or decor once a 창고 exists elsewhere.

**27. Medium — The porter bundle bake is an unmeasured offset.**
- Evidence: G12 for L1a / L1b leans on "bundle bake −50 to −80". `StackBaker` packs slots into one shared 1024² texture
  and flushes at 15 Hz (`StackBaker.js`).
- Moving carried stacks that change item by item would churn slots and re-bakes, or overflow to per-item sprites. The
  plan also leaves it out of the effort table (§17) and the tests (§15).
- Fix: prototype first. `perf_cmp` + `soak42` with 13+ goods porters on screen and a slot-budget report. Until then G12
  counts no offset.

**28. Medium — The logic budget is already spent.**
- Evidence: the v4.2 sum is 0.226 ms at the plaza and 0.365 ms in the office view (budget 0.25, `v42_code2.md` §9.2).
  +0.05 (board, jobs) + 0.02 (demand) gives ≈ 0.30 / 0.44.
- The board rebuild is one 0.3 ms (desktop) spike a second, ≈ 1–1.5 ms on a phone. With stove homes as sinks the sink
  list grows by the number of houses.
- Fix: rebuild one item type per tick (spread over frames). Give an absolute target (sum ≤ 0.30 ms plaza), not a delta.
  Count the "pool porters stop scanning" saving before relying on it.

**29. Low — Texture budget: the skewer icon and the hub at the depot.**
- Evidence: `item_eomuk` shares the paged `v43_food` sheet with the stall. It also shows in the 금방 app, which is opened
  at the depot, where the tour peaks (451.4 + 금방 ≈ 452). That pages 1 MiB in there. The hub's `ui5_icons@panels` and
  portraits can also be opened at the depot.
- Fix: put `item_eomuk` on a resident items page (merge + guard, 0 files) and page only the stall body. Add "hub open +
  금방 app" at `17_depot_revealed` to the screenshot tour.

### G. Saves

**30. Low — `haul` ≤ 600 B is tight.**
- Evidence: 17 movable slots × ≈ 28 B (`"hire2_lumberjack":"fish",`) + `mat` (6 types) + header ≈ 610 B in the worst case.
- Fix: a 768 B cap or short slot codes. Add the worst case to the `slices` fuzz test.

**31. Low — v4.4 calibration.**
- Evidence: v4.4 rewards are `m × I` and scale with the new income. That is fine, but v4.4's `seedI[era]` for v7 saves
  and its reward floors are set on v4.2 income. Its D13 shows the popBox "from `hire_miner`", while this plan shows it
  "from village complete".
- Fix: list both in §18 (re-measure `seedI` after v4.3.2; one rule for when the popBox shows).

### H. Process and schedule

**32. Medium — The effort is underestimated.**
- Evidence: the hub is costed at ≈ 1.5 days for `Shell.js`, 3 tabs, the move sheet, doors, the `LedgerRows` refactor of
  the office 재고 tab, `Navigator.guideTo`, letters and two-size ko + en overlap tests. The board gets 2 days to replace
  three `think()` methods (K2). The bundle bake is not costed.
- Fix: L1a ≈ 9–10 + 3, or move `LedgerRows` / `guideTo` back to their own versions and keep the hub's detail view simple.

**33. Medium — The income gates cannot catch a regression.**
- Evidence:
  - G9 for v4.2.1 is +30–65 %, a 35-point band. v4.2.1 passes even if it loses 3 points; the model predicts +43–48.
  - The ceiling is justified by the v5 ladder, which §4.4 says v5 will re-base on this track's income. That is circular.
  - Q9's default "yes" approves the widening if the designer does not answer.
- Fix: per-step targets with a tolerance (v4.2.1: +38–53; L1a: +46–61; L1b: +50–65) plus the pacing guards. Q9 should
  have no default: the designer decides before B3.

**34. Medium — The schedule links three plans.**
- Evidence: GB-CODE-2 waits for v4.2.1 to land. v4.3.2 (≈ 14 + days) pushes v4.4. Both L0 and 금방 G-P15 edit
  `tools/test/v42_layout.mjs` and the census tools.
- Fix: let 금방 tune on v4.2 + touch with a re-check after v4.2.1 (finding 6 needs a re-check after L1 anyway). Name one
  owner for the layout and census tools per step.

**35. Low — One place for every number (LD20).**
- Evidence: the crew's numbers now live in two blocks (`warehouse.crew` and `logistics.crew`; `window` 180 appears in
  both).
- Fix: put the need gate in `warehouse.crew` (`busyAt`, `backlogShare`) next to the touch's rule.

### I. Designer document (Korean)

**36. Low — Wording and claims.**
- `%p` (Q3) is jargon; write `수입이 조금 더 늘어요 (약 9~19)`.
- §7's "숲·밭으로" contradicts §1's "빵은 살 사람이 모자라요" (finding 14).
- §3 claims all 8 cards fit at 360×640 (finding 20).
- §8's "약 45~65 %" is 58–68 % (finding 1).
- The four storage names (창고 · 자재창고 · 물류창고 · 짐 싣는 곳) read alike on a phone. Add a one-line picture of which
  holds what, and offer "원료 창고" more strongly in Q4.

**37. Low — The doc leaves 금방 out of the "who buys the surplus" story.**
- Evidence: §2 and §6 present the 금방 sled only as a stop at the 자재창고. The designer will read the logistics track as
  the whole answer.
- Fix: one line: "금방(v4.3)도 남는 원료를 사 가요. 두 가지가 같은 원료를 두고 다투지 않게 순서를 정해요 (계획서 §5.6)."

---

## 4. What holds up

- The split diagnosis (cooked fish / bread = demand; ore and mid-game meat = carrying; logs = supply) is backed by the
  probe's item-level flows. The raw-porter spill (`RawPorter` spill branch) really is the smelter's 15 % starvation.
- Carrying first, demand second; a zero-art fallback for D1; one new art page, with exact keys and points.
- One hub window, no new HUD button (verified against `UI.js` / `UIv4.js` positions and `v44_plan.md` D13), and v4.6's
  마을 panel folded in.
- First 20 minutes: the new plot is hidden until `hire_hunter` (`Game.refreshSites`); hidden plots add no collision
  (`Site.js:204`); raw spill and Surplus already run only after `frules`.
- Additive save slices with local keep rules (the G-P5 pattern) and no version bump; `sanitizeSave` drops unknown
  building keys, so `material` / `stall` must join `BUILDINGS` and the `UNIQ` list — the plan says so.

---

## 5. Changes to make before B1 / B2 (in order)

1. Copy the econ probe and its baseline outputs into the repo now (8).
2. Re-state §9 / G1 / G2 / G4 with the recomputed numbers. Measure G4 with fresh smart-bot runs, and the L1a gates at
   yard steady state (1, 3, 5).
3. Re-classify late meat as guest-capped and count the substitution. Size meat by 이직 (one hunter out) or a meat buyer
   (2).
4. Fish:
   - stall `inPrio` 40;
   - B2 moves hunters / miners to the forest, not a fisherman;
   - D1 sized on the fish left after the cannery link (4).
5. Add v4.3 as a column. Re-run 금방's gates after L1a / L1b and fix the priority between the yard, D5 and the sled (6).
6. Make the contracts slot-based: `LineUpgrades.p2` and the dedupe; a crew pool count across both buildings; Jobs before
   `progress.init()` with `Progression.js` in the file list (7, 11, 13).
7. Make the crew gate count only real-use jobs, and order raw runs after overflow until 읍 (9, 10).
8. Hub:
   - event counters instead of ledger flows;
   - unlimited-buyer status;
   - door opens 현황, with a pip and a first-time banner;
   - anchors shown as 대기 (16–21).
9. Price fairness for 이직, forest-only advice, stoves made to order (14, 15, 23).
10. Perf: prototype the bundle bake, use an absolute logic budget, add a `v_wh` coordinate, and measure G12 on a fresh run
    with the plaza 창고 (26, 27, 28).
11. Income gates per step, and Q9 without a default (33).
