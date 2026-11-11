# v4.3 step B 「마을 새 단장 둘째 걸음」: decisions record

- **Date:** 2026-11-11.
- **Tree read:** `scratchpad/hud_wt/frost-village`, branch `local/v43-hud`, HEAD `12d598f` (`v4.3.0-a3.1`, `SAVE_VERSION` 8). Read only. No game, bot or browser was run.
- **Rule ("don't ask, just build"):**
  - Every open question takes its ★ answer.
  - A question with no ★ takes the safest default. Safest means: lossless for saves, the smallest visible change for players, and no gate loosened without a written record.
  - Each answer is recorded here with its source and what it changes in the build.
  - This record replaces the answers the v4.3 plan review would have given (roadmap §4.1 "Review stops": `기획서_마을새단장.md` §11, the C move, P1 contents and the survey notice).
  - The 대표 can still overturn any line at the step-B mid preview. §13 is the Korean list to show at that preview.
- **Companion maps in this folder:**
  - `map_scope.md` (scope). Its new choices are cited as **S-N1 … S-N11**.
  - `map_save.md` (save and migration). Its choices are cited as **V-N1 … V-N13** and its defects as **V-G-n**.
  - Where the two maps disagree, §12 picks one answer and says why.
- **Question IDs used here:**

  | IDs | Source |
  |---|---|
  | D1–D21 | `기획서_마을새단장.md` §11 = `redesign_v43/engineering_plan.md` §2 |
  | Q1–Q24 | roadmap designer questions (`기획서_시장취임_로드맵.md`, `engineering_roadmap.md` §10) |
  | Q25–Q41 | `기획서_돈과복지.md` ⑦ |
  | 광장 1–10 | `기획서_광장과축제.md` §8 |
  | 수산 1–14 | `기획서_수산업.md` |
  | E1–E13 | roadmap engineering questions |
  | PQ1–PQ7 | `engineering_plan.md` §13 |
  | X-n | new choices found while mapping step B (§11) |

---

## 0. Summary: what the decisions do to the build

1. **Scope:** `engineering_plan.md` §3 Step B, plus F0, F0s, R43, TX and P1.
   - Step C (ledger, toggles, labour office, 알바) is **not built**; it moves to v4.4 (Q2, Q3).
   - G3 and G7 stay v4.3 gates. Only G7's "ledger open on 물건별" part moves to v4.4.
2. **Chief's buildings (D2, D3, D16):**
   - The office upgrade becomes a side card after `zone_mine`, priced 400 + 8 (`hut.office`).
   - The hall moves to (180, 760) XL. It opens at village complete, priced 1,200 + 16 + 4.
   - All four office staff wait for 읍. Today only 총총이 does (`Office.js:137`).
3. **Plot table v2 (D6, D19, Q25, 광장 1):**
   - `d_school` grows to XL and `d_clinic` to L. The old hall footprint becomes the hidden `w_civic`. All three are hidden: no menu and no sign.
   - The 한마당 reserve moves to the village green. The ★ site south of the yard now holds the a3 bakery.
   - Because of that, the planned work strip (`d_wh`, `d_labour`) leaves the green, `d_store` moves east, and `h43_2` shifts to the reserve's edge.
   - Every position is a candidate until `v43_layout.mjs --probe` and `padvis` confirm it (X-2 … X-4).
4. **Shop stage 4:** three counters (자재 · 생선 · 고기), `shelfMax` 80, `spawnMul` 1.2, a second merchant spot, and no fourth counter. Bread now sells at the bakery (X-1).
5. **Station cash by train (D10):** the coins go to their own pile at the hall, `c1.hall.stn` (cap 2,000), not into the clamped tax box. Nothing is lost on reload (X-5).
6. **G1:** the onboarding bot is waived to a no-regression ratchet (5-seed median ≤ 16.1 s). The smart-bot gate stays hard (≤ 21.82 s). The grill does not move (§7).
7. **G2:** the baseline stays M0 (village complete ≤ 21.0 min pacing, ≤ 21.17 fresh25; 읍 42.1–46.5).
   - a3's ≈ 21.5 is fixed with knobs before step-B tuning.
   - The baseline is not re-based for the bakery (§8).
8. **TX:**
   - Split `bld_buildings` (10.7 MiB) into pages per district.
   - Area-evict `props_buildings` (7.5 MiB).
   - Exit: full-v4 GL ≤ 445 MiB on the default preset.
   - The hall page that moves earlier is ≈ 2.1 MiB packed, not 15.4 MiB (§10).
9. **P1 (Q14):**
   - Compiled into every build.
   - The build flag is on in every v4.3 build (v4.3 never reaches production, Q5). For the player it is off by default.
   - The fields are the roadmap's list, cut to what v4.3 has.
   - Data-safety check (E5) before the first Play upload that carries it.
   - Survey notice drafted (§9).
10. **Save:**
    - R43 runs keyed on the `v43.lay` marker. `lv` is 43.
    - `x` caps include `money` and `wk` (Q26), ≈ 6.3 KB in total.
    - The pre-B copy goes under the backup key namespace.
    - `CODE_FMT` goes to 2. Stage-4 half price is stored as a boolean flag.
    - Material deliveries survive reload (V-G-4 fix) (X-11).
11. **No step-B effect:** 수산 1–14; Q4, Q8–Q13, Q16–Q19, Q22–Q24; Q27, Q28, Q30–Q36, Q38–Q41; 광장 2–4 and 6–10. 광장 5 (the winter taste) is outside step B.
12. **Effort:** the roadmap's 19–22 builder-days becomes ≈ **21–25**, plus ≈ 0.75 for Q25 and 광장 1 (`map_scope.md` §9).

---

## 1. `기획서_마을새단장.md` §11: remaining choices D1–D21 (all ★A)

| # | Choice | ★ adopted | State in a3.1 | Step-B consequence |
|---|---|---|---|---|
| D1 | 교역소 | (A) merged into the 자재 창구; exports only at the station; the old sled is decor | Done in step A: the `gs.trade` facade over `market.mat`; the save key is still `trade` | Keep the `trade` save key; do not rename it. The sled is hidden once the office scaffold goes up (`Seller.sledAway`, `Seller.js:1378`) "until 4.3 B parks it by the 자재 창구". Its planned spot waits on a grill move that §7 rejects → X-6 |
| D2 | Hall timing | (A) at village complete (`hire_hunter`) | `w_hall` (−780, 1880), `after: 'tower_east'`, 2,400 + 30 + 10 (`world.js:618`, `balance.js:272`) | Plot to (180, 760) XL, region `start`, `only: 'town_hall'`, new `drop` and `clear`. `BUILD_UNLOCK.town_hall = 'hire_hunter'`. `GOALS`: first after complete. Price 1,200 + 16 + 4. Clear the step-A leftovers on the site (X-4) |
| D3 | Chief's buildings | (A) hut → office on the same plot (≈ 16, side) → hall next door; staff after 읍 | Hut and replace mode exist. `v42_office.after` is `'b:town_hall'` (`world.js:993`). 셈이, 딸랑이 and 소복이 are hired before 읍 | Gate all four roles on rank ≥ 2 (`Office.nextRole`); the 직원 tab says 「읍이 되면 와요」. Run the G2 읍 ±5 % check (§8) |
| D4 | Stage-3 timing | (A) first bread sale | **Superseded by a3:** bread left the shop. `mkt_s3` now unlocks after `hire_hunter` + `firstMeatSale` (`Progression.js:71`) | Keep the a3 behaviour; not reopened. R43 does not grant stage 3: a3's `shop43()` / `bakery43()` already do, idempotently |
| D5 | Shop shape | (A) one straight counter row, lines side by side | Done (stages 1–3) | Stage 4 extends the row (X-1) |
| D6 | Workshop plots | (A) one fixed plot each | No `d_*` plot exists; no `types` field | Plot table v2 (X-2). Generic plots get a `types` allowlist, enforced by the build menu only (V-N5) |
| D7 | Resource zones | (A) unchanged | — | No zone moves. Ore and meat hand walks shrink only ≈ 10 % |
| D8 | Toggles start | (A) with the labour office | Step C → v4.4 (Q2); labour office at 읍 (Q3) | Nothing is built. Sanitize accepts `v43.toggles` booleans from v4.3 on |
| D9 | Ledger doors | (A) the desk + the always-visible popBox | → v4.4 (a deliberate, read-only pre-읍 change) | Nothing in v4.3. **Forward note:** a3 made the population chip open the 마을 주민 window, so the v4.4 plan must pick the ledger's second door again |
| D10 | Station cash | (A) the train carries it to the hall | Not built. The hall tax box is clamped to `taxCap` 1,500 on load (`Save.js:439`, `TownHall.js:219`) | Build it with its own hall pile (X-5) |
| D11 | Clothing | (A) bench → 옷·신발 공방 | Done in step A | None |
| D12 | Chief's fishing | (A) the rods fish; the chief reels once | Done in step A, plus the designer's 「바다 가까이」 landing | None. The landing is the cause of G1 (§7) |
| D13 | Release | (A) one v4.3 in three steps | Amended by Q2: step C → v4.4 | The step-B build is the first internal-track build. No partial migration reaches testers |
| D14 | Early clerk fix | (A) M1 first | Done (stage-1 stall: 「눈꽃 노점」 signboard, low counter, adult clerk) | None |
| D15 | Customers per stage | (A) `spawnMul` [1, 1, 1.1, 1.2] | The first three are in `market43` | Add stage 4: `spawnMul` 1.2, `shelfMax` 80 |
| D16 | First houses + office | (A) side goals; office 400 + 8 | Houses done (`h43_1`, `h43_2`). `hut.office` (`balance.js:713`) exists but nothing reads it | Office side card. `buildCost('chief_office')` reads `hut.office`. The smart bot must not buy it ahead of the next main goal |
| D17 | Drained porters | (A) straight to a need, else the yard | → v4.4 | None |
| D18 | 알바 marker | (A) yellow vest + 3 s tag | → v4.4 | None |
| D19 | Old saves' workshops | (A) move to the district plots, keeping state | — | R43 move table: toolsmith → `d_tool`, warehouse → `d_wh`, cannery → `d_cannery`, store → `d_store`. If the target is occupied, the building stays and is logged (V-N3). One letter line |
| D20 | Depot | (A) stays; its move goes with L1a (v4.6) | — | R43 never touches `v42_depot` or `v42.depot.{hires, fork, hp}` |
| D21 | Hall/office finished at the old price | (A) kept, no refund, thank-you letter | — | REPRICE only unfinished sites, with frozen old prices (V-G-12: hall 2,400 / 30 / 10; office 1,800 / 20 / 6). The letter thanks the player |

---

## 2. Roadmap decision record Q1–Q24 (★ accepted by the 대표 on 2026-11-07)

Only the questions that change something in step B:

| Q | ★ answer | Step-B consequence |
|---|---|---|
| Q1 | Renumbering: v4.3 = steps A + B; v4.3.1–v4.3.4 retired; hotfixes use the 4th digit | Release label `4.3.0`; hotfixes `4.3.0.x`. Step-B previews continue the preview series as `v4.3.0-b1 …` (X-14) |
| Q2 | Step C → v4.4 | Not built: `LedgerPanel`, `Toggles`, `LabourOffice`, `Jobs`, 알바, crew yard. G3 and G7 stay in v4.3 |
| Q3 | Labour office at 읍 | `d_labour` is a hidden plot id with `after: 'f:rankEup'`: no menu and no pad. Its coordinates are provisional; the v4.4 plan fixes them, and nothing can stand there in v4.3 (X-2). `labour_office` is added to `BUILDINGS` / `UNIQ` |
| Q5 | (A) public launch at v4.5 | v4.3 is internal / closed / preview only, so P1's build flag is on in every v4.3 build (§9) |
| Q6 | Start the Play closed-test clock now | AAB 4313 (a3, `ed04b7d`) is on the closed track, so testers' Play villages include v8 a3 villages. R43 needs an a3 fixture (X-13) |
| Q7 | 금방 in v4.6 | The depot stays untouched. F0 keeps the `geumbang` slice (≤ 1,400 B) verbatim |
| Q14 | Opt-in play log from v4.3, off in production; data safety stays 「수집 안 함」 | §9 |
| Q15 | The four staff become the v4.4 inauguration gift | v4.3 only hides the four hire pads before 읍. Staff already hired stay |
| Q20 | Name prompt at game start (v4.4) | Not in v4.3. Step B adds nothing to the pre-읍 change list |
| Q21 | (A) no staff refund, a thank-you letter (v4.4) | Same precedent as D21 |

- **No step-B effect:** Q4, Q8–Q13, Q16–Q19, Q22–Q24.
- **One note on Q8 / E13:** v4.6's 「시청 공사 시작」 scaffold will stand at the hall that step B moves to (180, 760). Keep the hall's front `clear` square generous.

---

## 3. `기획서_돈과복지.md` (still under the 대표's review; ★ adopted by the rule)

| Q | ★ answer | Step-B consequence |
|---|---|---|
| **Q25** (urgent, gates the plot table) | Yes: school plot largest, clinic plot large; keep the plot the hall vacates, hidden; 동네 가게 and 어린이집 can use M plots | `d_school` M → **XL** at (−930, 640). `d_clinic` M → **L** at (−1160, 870). The old `w_hall` XL footprint (−780, 1880) is kept as the hidden **`w_civic`**. The M/L `types` allowlist stays data, so `br` and `care_*` are one entry each later. All three plots are hidden: no menu, no pad, **no sign**. Q25 says 보이지 않게, and a sign would promise v5.0 content to testers, so the plan's "reserved, sign only" is dropped. Clear the decor inside: one pine and a crate in `d_school`; two pines and two stumps in `d_clinic`. Probe `d_clinic`'s west edge, 59 px inside `WORLD.left` (econ addendum §12). ≈ 0.25 d inside step B |
| Q26 | (A) money counting + coin card in v4.5; the full view + weekly report in v4.6 | F0's `x` caps accept `money` 896 B and `wk` 1,024 B from v4.3 on; nothing writes them until v4.5 / v4.6. The `x` total is ≈ 6.3 KB. The whole save at caps is ≈ 22–23 KB by v4.6: under the 24 KB fail line, over the 16 KB warning (addendum §10) |
| Q29, Q37 | (A) 동네 가게 in v5.2, on generic plots | Plot table v2 must not use the branch-shop candidates `s_m1` / `s_l1`, `se_m1` / `se_l1`, `w_civic`. The addendum's `ws_x*` are not in today's `world.js` |
| Q27, Q28, Q30–Q36, Q38–Q41 | ★ as written | No v4.3 effect |

---

## 4. `기획서_광장과축제.md`

| # | ★ answer | Step-B consequence |
|---|---|---|
| **광장 1** (urgent) | Yes: reserve the 한마당 ground now. No new tree, decor or house plot there; it looks like snow | See the rows below the table |
| 광장 2 | (A) 「눈꽃 한마당」 | Internal id and comments only; no player text in v4.3 |
| 광장 3 | (B) its own v4.7 | The reserve must last at least until v4.7 |
| 광장 5 | (A) a small Christmas / New Year taste in a December tester build | Not step B: a separate teammate, and only if v4.4 does not slip. If it rides a `4.3.0.x` build, its state is ≤ 256 B in `x.fest` (`last` day key, `got` years), under F0's unknown-key rule (X-12). The doc's full `fest` + `plaza` (≈ 3 KB, §6) is **not** budgeted in v4.3; the v4.7 plan decides (side key or a higher gate) |
| 광장 4, 6–10 | ★ as written | No v4.3 effect |

**광장 1 in detail.**
- **The ★ site is taken.** The ★ site is "마을 마당 남쪽, 첫 집 두 채 사이". The a3 bakery cottage (1316, 1144), its stall (1176, 1169) and its queue now stand there. About 7 × 4 m is left, against the 16–20 × 12–14 m the doc gives as an example (`map_scope.md` §0 item 3).
- **Adopted:** the ★'s intent (a big, central, empty site reserved now) on the nearest central ground that fits, **the village green** (S-N2).
  - A hidden reserve region `p47_plaza`. Candidate shape: plaza metres X 13–24, Y −22 … −11 (a diamond centred near (1080, 1590) px). That is ≈ 11 × 11 m, ≈ 3.6 × an XL footprint (the doc's "2–3 × the largest plot").
  - Inside it, `v43_layout` refuses any new tree, decor, plot or pad.
- **What stays inside the reserve:**
  - **The green's props:** the campfire and its three log seats, the picnic table, the swing and the rink. They are the 한마당's 「평소」 life. As a result the plan's conflict #4 ("move the concert to the hall square") disappears, and the residents window's `green_fire` homes stay.
  - **The x = 990 walk road** (`cross_n` → `green` (990, 1700) → `cross_s`). It crosses the reserve and stays: people walk through a plaza.
- **Kept outside:** the zone-gate pads `zone_mine` (760, 1760), `zone_hunt` (1160, 1800) and `hire2_miner` (835, 1800). `zone_hunt` sits on the candidate's edge; the probe sets the final shape.
- **Consequences:**
  - The work strip leaves the green (X-2).
  - `h43_2` (1110, 1600) keeps its id and shifts only as far as the reserve's east edge (probe), so the two first houses frame the plaza as the ★ text pictures. A built house moves with its id: no save change, one letter line.
  - Old villages: nothing is removed. v4.7 handles occupied ground (doc §1 「예전 마을은요」).
- **Effort:** ≈ 0.5 d (outside 19–22), plus the plot re-solve in X-2.

---

## 5. `기획서_수산업.md` (수산 1–14)

No step-B dependency. The harbour content is v6, and the 「바다 친구들」 taste is v4.6. 수산 7 (the grilled-fish icon) already shipped in a3.

---

## 6. Engineering open questions

| Item | Resolution |
|---|---|
| E1 slice homes | Resolved in the roadmap: `x` plus top-level keep-rules plus `lv` |
| E2 preview storage | Closed: the separate package holds v8 step-A villages, so the remap runs on them (fixture `v43a2_bread.json`; add a3, X-13) |
| E3 G1 | §7 |
| E4 village-complete regression | §8 |
| E5 data-safety wording | A precondition of P1 on the Play tracks (§9) |
| E6–E13 | Later versions. E13 (the 시청 scaffold spot) now sits by the hall's new site |
| PQ1 | = D1–D21 (§1) |
| PQ2 renumbering; L1a `Jobs` inside v4.3 | Superseded by roadmap §1 (Q1). `Jobs` and the hub go with step C to v4.4 |
| PQ3 금방 owner | Nothing changes under the depot (D20) |
| PQ4 the designer's village code | Not received yet (`map_save.md` §0 item 10). Ask once more with the step-B mid preview; it is the 대표's own to-do #3. **Not release-blocking:** the failure path keeps any stored save byte-identical. The release review states whether that village was tested |
| PQ5 M1 | Done |
| PQ6 names | As written: 눈꽃 노점 / 눈꽃 가게 / 눈꽃 시장 / **눈꽃마을 시장** (stage 4), 자재 창구, 옷·신발 공방. 인력 사무소 and 마을 장부 are v4.4 names. Q30 keeps 「눈꽃마을 시장」 |
| PQ7 preview hosting | The separate preview package (APK), per E2 |

---

## 7. G1 (E3): waive, or move the grill pads?

**Data.**
- **Gate:** first sale ≤ baseline × 1.05. M0 (`docs/build_reports/v43_baseline/report.md`):
  - onboarding bot 15.0 s → limit **15.75 s**;
  - smart bot 20.78 s → limit **21.82 s**.
- **a3-era runs** (5 seeds each, 2026-11-07; `scratchpad/v43/{bakery/code, watch/logs, goals, residents, grilledfish}/g1/firstsale.csv`):
  - onboarding per seed 15.7–16.2 s; 5-seed medians **15.8–16.1 s**;
  - smart **21.53 s** in every seed (passes).
- **Cause:** the designer-requested shore landing (「바다 가까이」).
  - The walk from the spot to the grill is 1.4–1.5 s, against 0.85 s from the old spot.
  - The `move` / `still` cards stay ≥ 1.5 s each and the `coming` card 2.8 s, so no start point fixes it (`engineering_plan.md` §4.1).
  - Moving the 서서 굽기 pad 0.6 m measured 15.8 s / 21.5 s: not enough alone.
- **No ★ exists.** The Korean roadmap offers 「그냥 둘지, 화덕 발판을 옮길지」 with "leave it" first.

**Decision (safest default): waive for the onboarding bot only, as a ratchet.**
- G1 for the smart bot stays hard: ≤ 21.82 s.
- G1 for the onboarding bot becomes a no-regression gate:
  - 5-seed median ≤ **16.1 s** (today's worst median);
  - every seed ≤ **16.3 s** (today's worst seed + 0.1).
- The step-B report records the waiver and its cause.
- **The grill does not move in step B** (S-N6). The plan's (1000, 520) predates the deck crate (1000, 440) and the landing (1100, 380). A move risks the fishers' lane, `beach_n`, the tutorial views and `padvis`.

**Consequences.**
- The plan's conflict #2 (grill on `beach_n`) is dropped; `STATION_PADS.grill` stays where it is.
- The sled needs another parking spot (X-6).
- Re-run G1 after any step-B change within ≈ 6 m of the deck, grill or stall (큰길 paint, the sled spot).

**Revisit when:** the designer says the first sale feels slow at the mid preview. Then try the 서서 굽기 pad move first (−0.1 s measured). A grill redesign would be its own task.

---

## 8. G2 baseline and the village-complete regression (E4)

**Gate:**
- Village complete ≤ baseline + 1.0 min.
- 읍 within ±5 % of its bot target.
- Office ≈ 16 and hall reported.

**M0 baseline** (`docs/build_reports/v43_baseline/pacing.csv`, `report.md`):

| Measure | Baseline | Gate |
|---|---|---|
| Village complete, pacing | 20.00 (seeds 19.99 / 20.0 / 20.66) | ≤ **21.0** |
| Village complete, fresh25 | 20.17 | ≤ **21.17** |
| 읍 | 44.30 (44.21–50.88) | **42.1–46.5** |

**a3:** the smart bot (seed 1) completes the village at **21.5 min**. That is after the bakery's stall `spawnEvery` went from 3.6 to 3.2; at 3.6 it was 22.2 (`scratchpad/v43/bakery/code_report.md` §4). It is ≈ 0.3–0.5 over.

**Decision (no ★; no silent loosening): the baseline stays M0.**
- The bakery split's two new main steps (`bld_bakery` 150 + 4, `hire_clerk_bakery` 80) are not a reason to re-base.
- The promise to the designer is 「마을 완성은 지금보다 1분 넘게 늦지 않고」 (`기획서_마을새단장.md` §14).
- **Fix first,** before step-B tuning (roadmap order, item 1):
  - Measure 3 pacing seeds and 5 fresh25 seeds on a3.1.
  - Then turn the knobs in order: the bakery stall's `spawnEvery`; the `bld_bakery` price; the first-house prices / the smart bot's side-goal policy.
  - The hall is now after village complete and is no longer a knob.
- If it is still over at the release review, the review shows the number. The release review reports every gate result anyway.

**읍 ±5 %:** four changes move 읍:
- staff after 읍 (D3), and no courier before 읍;
- the hall ≈ 22 min earlier (+8 happiness, +6 beds, the tax box);
- ≈ 2,100 coins of staff not spent;
- train cash (D10).

The knobs are the hall's tax per person and the office price. Note: the plan's "hall ≈ 20.5" now reads "the first goal after village complete" ≈ 22 min (village complete 21.x + build time).

---

## 9. P1 opt-in play log (Q14 ★; cut line → v4.4)

**Fields: what P1 records in v4.3, and what it never records** (roadmap §6, cut to what v4.3 has):

| Field | v4.3 source | Note |
|---|---|---|
| Day *n* since install | An install day index kept on the phone; the code carries only *n* | No calendar dates in the code |
| Session minutes | Last 8 sessions plus a total | Oldest trimmed first |
| Stage reached and play minutes at each milestone | First sale, village complete, hall, office, 읍 | Play minutes, not clock times |
| 읍 ceremony seen | Yes/no plus the play minute | 「취임식 다시 보기」 arrives with v4.4 CU |
| Control time | Joystick seconds, 관망 seconds, idle | "Map time" arrives with v4.4's manage mode |
| Cards and alerts: shown / acted / ignored, seconds to act | Goal-window opens and goal taps (tap-to-walk); side cards (office upgrade, houses, stage 3 / 4 offers); the 「새 단장」 letter and 3-tap tour (opened, finished, skipped) | Counts and medians only |
| Migration result | `none` / `ok` / `ok+refunds` (counts) / `failed:<reason code>`, plus the source `v` / `lv` | The one thing only P1 can report from testers' phones |
| Build | `VERSION` string | Needed to read the log |
| **Never** | Chat text; names (residents, chief, village); the flag design; device model or any device ID; coins or item lists | — |

**Storage.**
- `x.log` within F0's 512 B cap.
- When the player has P1 off, nothing is recorded, not even locally.
- [기록 지우기] clears it.

**Export.**
- A text code like 마을 옮기기, with its own tag (e.g. `SNOWLOG1`). A pasted log code is refused by 마을 옮기기, and the other way round.
- The export screen shows the decoded fields in plain Korean above the [복사] button, so testers see what they paste.
- The app sends nothing.

**Where:** 설정 › 「놀이 기록 (테스터용)」: [켜기 / 끄기], [기록 코드 복사], [기록 지우기]. Off by default.

**Build flag.**
- A build-time constant in `src/data/version.js` (e.g. `FLAGS.playlog`), set by the build script.
- **On in every v4.3 build:** preview APK, internal and closed AABs, web preview. v4.3 never goes to production (Q5 ★A: launch at v4.5).
- The production profile sets it off. A release test asserts that with the production flag the row is hidden and nothing is recorded. The production-flag test exists from v4.3, so v4.5 inherits it.

**E5 precondition.**
- Before the first Play-track upload (internal or closed) that carries P1, check Play's help wording: a code the user pastes by hand is not "collection" (`store/console_answers_ko.md` §7: 수집 = sent off the phone). The form stays 「수집 안 함」. Add a privacy-policy line only if the check asks for one.
- **Until the check is done,** Play-track AABs ship with the P1 flag off. The sideloaded preview APK may carry it on.

**Tests.**
- Export → import round trip.
- The APK boot test still sees no outbound request.
- The production-flag release test.
- `x.log` over its cap is trimmed, never the save.

**Cut rule.** P1 is built last. If the rest of step B passes its gates first, step B ships without it and P1 moves to v4.4 (roadmap cut line).

**Survey notice** (the 대표 makes the survey; this goes at its top):

> 이 설문에 붙여 넣는 「놀이 기록」 코드에는 이것만 들어 있어요: 설치하고 며칠째인지(날짜는 없어요), 한 번에 논 시간,
> 어디까지 갔는지(첫 판매·마을 완성·읍 같은 단계와 그때까지 논 분), 조이스틱과 관망을 쓴 시간, 목표 창·편지·안내 카드를
> 보고 누른 횟수와 걸린 초, 예전 마을 옮기기 결과, 게임 판 번호. 수다 내용, 이름(주민·촌장님·마을), 기기 정보는 들어 있지
> 않아요. 게임은 아무것도 보내지 않아요. 코드를 직접 붙여 넣으실 때만 저희가 받아요. 붙여 넣기 전에 게임의 설정 › 놀이 기록에서
> 코드에 든 내용을 먼저 보실 수 있어요. 기록은 직접 켜신 분만 남아요. 만 14세 이상만 참여해 주세요. 이메일은 묻지 않아요.

Survey body (unchanged from the roadmap):
- the same 3 questions, scored 1–5 (키우는 느낌, 다음 할 일, 지루함↔바쁨 with 3 as the target);
- one comment box;
- the v4.3 ask: 「예전 마을을 열어 보세요. 빠진 게 있나요?」

---

## 10. TX: texture choices

| # | Choice | Adopted | Consequence |
|---|---|---|---|
| TX-1 | Gate metric and preset | Roadmap (decided): GL total (textures + render targets), transients included, ≤ 455 MiB in every view. v4.3 exit: **full-v4 GL ≤ 445**. Measured on the **default** preset; the a3 low preset does not count | Latest run (`scratchpad/v43/a3/s1/texbudget_.log`, 2026-11-11): full-v4 GL **451.8** (textures 413.8, render targets 33.8); plaza +5 s 444.9; 관망 tour 448.4. TX must find ≥ 7 MiB at the peak |
| TX-2 | Which 8–11 MiB v3 atlas to split | **`bld_buildings`** (1776 × 1584, 10.7 MiB). Its frames are warehouse ×5, toolsmith ×5, cannery ×5 and `shop_general`. Split it into district pages that follow plot table v2: a work-strip page (warehouse + toolsmith) and an east page (cannery + store). Each becomes its own Residency area | Step B pins exactly these four buildings to known plots (D6 / D19), so per-district residency becomes exact for the first time. Today the page belongs to the whole `village` rect (x ≤ 3000, `Residency.js:36`): with `RELEASE` 1200 px it may never drop at the town square, where the peak is. **Not chosen:** `bld_buildings_2` (8.9 MiB: watchtower, boathouse, houses); houses stand everywhere, so less of it can be evicted. Gain is an estimate; measure |
| TX-3 | `props_buildings` area eviction | Add `props_buildings` (1600 × 1224, 7.5 MiB: hut `chief_lodge` 14 %, worker hut, mine entrance, pier, smokehouse / smelter / grill frames) to a village-side area. Today it is in no Residency area. The area honours `LOOK_TTL` (관망 free pan) | The station and town views drop it. Re-run `watchpan.mjs` with the texture tour |
| TX-4 | The hall page moving earlier | Proceed. **Correction to the roadmap:** the packed `town_civic@hall` page is 1024 × 544 ≈ **2.1 MiB** (`assets/_packed/index.json`: 2,228,224 bytes; only that page is loaded, `Assets.js:324`), not the raw atlas's 15.4 MiB | Mid-game views (≈ 22–45 min) rise ≈ 2.1 MiB. The full-v4 peak already includes the hall. TX still lands first (roadmap order); the urgency is headroom plus stage 4, not the hall |
| TX-5 | Stage-4 art | Its own lazy page `market_s4`. Estimate ≈ 1.3–1.8 MiB (s3 is 836 × 388 ≈ 1.24 MiB). Release the s3 page once stage 4 stands, as "no s2 at stage 3" does. Copy the old sled's frame onto the s4 page (today it rides on the s3 page) | Net change at the full-v4 peak ≈ +0.1–0.6 MiB |
| TX-6 | Stale Residency `office` rect | Re-anchor `office` (`Residency.js:51`, `[-140, 480, 360, 960]` = the pre-step-A office spot) on `HUT` (600, 640) | The new hall site (180, 760) sits inside the old rect. Small effect; tidy it in the same pass |
| TX-7 | Soft targets | Stay missed in v4.3 (roadmap): plaza ≤ 300, tour ≤ 300, title ≤ 90 (126.1), return-to-start + 5 | Reported, not gated |
| TX-8 | Measurement | Texture tour at 0, 12, ≈ 22 (hall), 26 and 45 min; full v4; 관망 look-around and pan tours; each on the default preset, GL total recorded | First an a3.1 run as the TX baseline (none exists yet) |
| TX-9 | The full v3 atlas split (≈ −40 MiB) | Art pipeline, in parallel | Needed before F2 is enabled anywhere (v4.4). Not a v4.3 gate |

---

## 11. New choices found while mapping (no ★ in any doc): defaults adopted

| # | Choice | Default adopted | Why |
|---|---|---|---|
| X-1 | Stage-4 counters now that bread left the shop (S-N1) | **Three counters: 자재 (with the second merchant spot), 생선, 고기.** `shelfMax` 80, `spawnMul` 1.2, open roof. `mkt_s4` costs 2,000 + 20 planks + 8 ingots, after `f:rankEup`, offered at the ceremony; half price for villages already at 읍 | Less art and no fourth clerk. Bread's capacity upgrade already exists (빵집 2단). The plan's "mat · fish · bread · meat" row is void |
| X-2 | Plot table v2 positions (S-N2, `map_scope.md` §6) | `w_hall` (180, 760); `w_civic` hidden at (−780, 1880); `d_wh` → (380, 1560) (the plan's `d_tool` spot); `d_tool` further west (≈ 60–120, 1580); `d_labour` hidden, provisional west spot; `d_cannery` (1560, 580) nudged ≈ 40 px east (or move the snow fort); `d_store` per X-3; `h43_2` to the reserve's east edge; the `p47_plaza` reserve (§4). **All are candidates** until `v43_layout.mjs --probe` and `padvis` pass | The plan's `d_wh` sits on the green's campfire and seats; `d_labour` sits on `h43_2` and the picnic table. Measure the cost to 창고 walks (≈ +4–7 m, estimate) with `lgx_l0.mjs` (G4) |
| X-3 | `d_store` spot (S-N3) | Move it to ≈ (1700, 1030): east of the bakery's P2, south of the east road | At (1480, 940) it covers the shop's clerk / `mkt_s3` / `hire_clerk_s3` pad spot (1525, 900) and the dog house, and pushes the 큰길 into the bakery's yard |
| X-4 | Leftovers on the hall site (S-N4) | Keep the hall at (180, 760) (D3's story: next to the office). Move out of its footprint and from behind its picture: the trash pad + fire (150, 700), the beach campfire / bard stage (52, 506) and the fisher hut (300, 470). Run `padvis` on the office hire pad (490, 745) against the hall's east wall. Call the existing `'hall'` decor keys when the hall is built | Step A moved all of these onto the site after the plan was written |
| X-5 | Where the train-carried station cash lives (S-N5 vs V-G-6) | A **separate hall pile `c1.hall.stn`** (its own pile and label at the hall; cap = `v4.rent.cap` 2,000, `balance.js:467`), kept by `sanitizeC1`. Each `arrive ours` moves `min(till, cap − stn)`; any rest stays in the station till (V-G-6's lossless rule). Live from the hall until 읍 | Lossless, and it keeps D10's walk saving (170 → 87 m) even when the tax box is full. The plan's "no new save data" was wrong: the 1,500 clamp would eat coins. v4.4's F12a (세금 날) can merge the two cleanly |
| X-6 | The old trade sled (D1 decor) | Park it at a probe-found decor spot west of the 자재 창구: outside `reserve4`, not on the grill line, no pads. If no spot passes, it stays hidden after the office (today's behaviour) | Its planned spot waited on the grill move that §7 rejects. Decor only: no gameplay effect |
| X-7 | What the office does before 읍 (S-N11) | Keep the ★ side goal at ≈ 16. Card copy: 「촌장님 사무실 (직원은 읍이 되면 와요)」. The hut / office desk becomes the 관망 pilot's office spot. Letters and news wait for 소복이 | Without staff the 400-coin buy is looks only, so the card must say so |
| X-8 | The name 큰길 (S-N7) | The x = 990 customer road (called 「큰길」 in the bakery spec) becomes the south branch of 「눈꽃 큰길」. The street's east half is paint only, on the existing node route | One name for one road network |
| X-9 | Vehicle anchors (S-N10) | Edit `src/vehicles/layout.js`: `p:hall` → `hall_front`, and `p:mail_east` if `east_link` moves. Record it as an exception to the plan's read-only guardrail; the bakery split already set the precedent | `p:hall` still points at the old hall front (−880, 2110) |
| X-10 | Swapped XL buildings in old saves (V-N2) | R43 puts `town_hall` on `w_hall` and `big_restaurant` on `w_rest` (a swap if needed). **`w_civic` never holds a building in v4.3** | Keeps Q25's reserve clean. Both XL plots are in region `west` with `after: 'tower_east'` (`world.js:617-618`), so no fog problem. `map_scope.md` allowed parking a restaurant on `w_civic`; not taken |
| X-11 | Save details (`map_save.md` §3.2, §1.6) | All adopted (each is lossless or a defect fix): see the list below the table | — |
| X-12 | `x` budget against `fest` / `plaza` (S-N8), and unknown `x` keys | The F0 caps are data-driven: the roadmap's list (mgmt 256 B, needs 1 KB, daily 512, rewards 512, book 1 KB, mail 512, log 512) plus `money` 896 and `wk` 1,024. **An unknown `x` key passes through verbatim when it is ≤ 512 B and the container stays within its total; otherwise it is trimmed or dropped with a warning, never throwing.** `fest` / `plaza` (≈ 3 KB) are not budgeted | Same-level pass-through (roadmap gate) without opening the 24 KB fail line |
| X-13 | Fixtures (S-N9) | Add `v43a3_village.json` (a3.1 export at ≈ 30 min: bakery built, flag set, `h43_*` built, hut), the three 4.2.0.2 fixtures (after the tutorial with `onb`; ≈ 25 min; ≈ 46 min with `adminUses` / `adminInf`), a 4.2.1 meat-can save, the XL-swap and reprice cases, an `lv` 46 newer code, a same-level `x` / slices save, and forced failures | a3 is on Play and in the preview app. The roadmap requires the 4.2.0.2 fixtures |
| X-14 | Preview label | `v4.3.0-b1`, `-b2`, … for step-B previews; the release is `4.3.0` | Tells B villages from a-villages in bug reports. Version codes follow the existing 43xx scheme |
| X-15 | Effort | ≈ **21–25** builder-days (`map_scope.md` §9: +2–3 for the a3 interactions), plus ≈ 0.75 for Q25 and 광장 1 | Within the roadmap's ±30 % |

**X-11 in detail** (each item is lossless or a defect fix):
- **V-N1:** the pre-B copy key is `frostVillage.save.backup.pre43`, written once. It is already excluded from codes and never deleted by `applyVillage`.
- **V-N3:** a mover whose target plot is occupied stays where it is, and this is logged.
- **V-N4:** extra materials from a reprice go to the 창고 if it has room; otherwise they become coins at `priceOf`.
- **V-N5:** `types` is enforced by the build menu only, never by sanitize.
- **V-N6:** `migrateSaveEx`; the null contract of `migrateSave` is kept.
- **V-N7:** `CODE_FMT` 1 → 2, so a1–a3.1 builds answer "newer" instead of truncating a B village.
- **V-N8:** a save is newer when `v > 8 || lv > 43`. A missing `lv` counts as ≤ 43.
- **V-N9:** old villages restart at the hut door, or at the shop front while the office is a site. `player.stack` is kept.
- **V-N10:** an over-cap module slice is dropped with a warning.
- **V-N11:** writes are held until restore finishes with no skipped site; a skip becomes the failure card.
- **V-N12:** test-only failure switch for G8.
- **V-N13:** stage-4 half price is stored as `progress.flags.s4half = true`.
- **V-G-4:** `progress.got` keeps every `ITEMS` key, so planks delivered to the `mkt_s3` / `bld_bakery` / `mkt_s4` pads survive reload.
- **V-G-5:** keep `v42.seen.boost`.
- **V-G-10:** `MovePanel` uses the shared save stamp.
- **V-G-11:** 「처음부터」 while a save is held makes a copy first.
- **Not added:** `chief_hut` is not added to `BUILDINGS`. The hut is not a site (plan §6.3 is out of date).

---

## 12. Where `map_scope.md` and `map_save.md` disagree: resolved

| Topic | `map_scope.md` | `map_save.md` | Adopted |
|---|---|---|---|
| Station cash save | S-N5: additive `c1.hall.stn` | V-G-6: move only up to the tax box's room; the rest stays in `v4.cash`; no new field | **Both:** a separate `stn` pile, capped, with the rest staying in the till (X-5). Keeps D10's purpose and loses nothing |
| Stage-4 half-price marker | `v43.seen` holds it (from the plan's `seen.mkt_s4 = 'half'`) | V-N13: `progress.flags.s4half` | **V-N13.** `progress.seen` and the new `v43.seen` keep booleans only |
| Restaurant on `w_hall` | May park on `w_civic` | V-N2: to `w_rest`; `w_civic` stays empty | **V-N2** (X-10) |
| 한마당 reserve | S-N2: the village green, after the bakery took the sketch site | Records the ★ sketch site and adds no plot id | **S-N2 site**, with V's "no plot id in v4.3": a hidden reserve region, nothing saved (§4) |

---

## 13. 대표님께 남길 기록 (중간 미리보기 때 함께 보여 드려요)

대표님 말씀대로 하나하나 여쭙지 않고 ★추천대로 정해서 둘째 걸음을 만들어요. 바꾸고 싶은 줄만 말씀해 주시면 그 줄만 고쳐요.

- **마을 새 단장 11장 남은 선택 21가지:** 모두 ★(A)예요.
  - 3단 「눈꽃 시장」이 열리는 때(4번)는 빵집이 따로 생기면서 이미 "마을 완성 + 첫 고기 판매 뒤"로 바뀌었어요. 그대로 둬요.
- **4단 「눈꽃마을 시장」:** 빵은 이제 빵집에서 팔아서, 창구 셋(자재·생선·고기)을 크게 짓고 상인 자리를 둘로 늘려요. 읍이 될 때 회관 앞에서 권해요.
- **학교·진료소 자리 (질문 25):**
  - 학교는 가장 큰 자리, 진료소는 큰 자리로 잡아 둬요.
  - 옛 마을회관 자리도 공공 건물 자리로 남겨요.
  - 셋 다 아직은 보이지 않게 둬요(팻말 없음).
- **한마당 자리 (광장 1):**
  - 그려 주신 자리(마을 마당 남쪽, 첫 집 사이)에는 빵집이 들어섰어요.
  - 그래서 바로 아래 마을 잔디밭(모닥불·소풍 탁자·그네·스케이트장이 있는 곳)을 약 11 × 11 m로 비워 둬요.
  - 잔디밭의 소품과 가운데 길은 그대로예요.
  - 창고·대장간 자리는 서쪽으로, 둘째 첫 집은 한마당 동쪽 가장자리로 살짝 옮겨요.
- **잡화점 자리:** 가게 점원 발판과 개집을 덮어서 조금 동쪽(빵집 뒤 동쪽 길 아래)으로 옮겨요.
- **첫 판매 시간:** 바다 가까이 낚시 때문에 0.05–0.35초 늦어요.
  - 화덕은 옮기지 않고 그냥 둬요.
  - 더 늦어지지 않게는 지켜요.
- **마을 완성 시간:** 빵집 때문에 지금 약 0.5분 늦어요. 예전(20분)보다 1분 넘게 늦지 않게 다시 맞춰요.
- **역 동전:** 마을회관이 서면 기차가 회관 앞 「역에서 온 동전」 더미로 실어 와요. 세금 상자가 가득 차도 동전이 사라지지 않아요.
- **놀이 기록:**
  - v4.3 테스트 판에 넣어요. 기본은 꺼져 있어요.
  - 적는 것과 안 적는 것, 설문 맨 위 안내 글은 위 9장 그대로예요.
  - 플레이 스토어 테스트 판에 넣기 전에 데이터 보안 「수집 안 함」이 맞는지 Play 도움말로 먼저 확인해요. 확인 전에는 플레이 판에서 꺼 둬요.
- **그림 메모리:**
  - 한도 455 중 452쯤이라, 4단 그림을 넣기 전에 창고·대장간·통조림 공장 그림을 동네별로 나눠서 멀리 있을 때 내려요.
  - 목표는 445 이하예요.
  - 회관 그림은 생각보다 작아서(약 2) 일찍 서도 괜찮아요.
- **대표님 마을 코드:**
  - 아직 못 받았어요. 받으면 옮기기 전과 뒤를 하나하나 맞춰 봐요.
  - 못 받아도, 옮기다 문제가 생기면 원래 마을은 그대로 남아요.

---

## 14. Not verified

- **Positions:** every placement in §4 and §11 is coordinate arithmetic on `world.js` anchors and footprint diamonds, taken from `map_scope.md` and re-checked only for the reserve's corners and the walk road. None of it was run through `v43_layout.mjs` or `padvis`.
- **G1 and G2 numbers:** they come from the 2026-11-07 branch runs and the bakery report (seed 1). No a3.1 run exists.
- **TX:**
  - The hall page size (≈ 2.1 MiB) comes from `_packed/index.json` bytes and the page's 1024 × 544 size, not from a GL measurement.
  - The TX-2 and TX-3 gains are estimates.
  - The latest texture run is a3's (2026-11-11).
- **P1:** E5 (Play's data-safety wording) was not checked. The P1 field list goes beyond the roadmap's list only by `VERSION`.
- **Status of the source docs:** `기획서_돈과복지.md` and `기획서_광장과축제.md` are still under the 대표's review; their ★ answers are adopted here by the rule. Their roadmap patches were not applied.
- **Play testers:** whether testers actually installed AAB 4313 was not checked.
