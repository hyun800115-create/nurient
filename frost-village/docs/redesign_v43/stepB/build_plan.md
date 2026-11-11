# v4.3 step B 「마을 새 단장 둘째 걸음」: build plan

- **Date:** 2026-11-11.
- **Base:** branch `local/v43-hud` at `e28089a` = `v4.3.0-a3.1` (`12d598f`) plus two commits that touch only `tools/test/flag.mjs` and the Play record. `SAVE_VERSION` 8. a3.1 is also on Play as AAB 4314 (built from `12d598f`; `e28089a` only records it in `tools/apk/play_release.json`), so a3.1 villages are tester villages too. **The Play closed track also got a2 (4310, 2026-11-08), a2.1 (4311), a2.2 (4312) and a3 (4313), and 4.2.1 was uploaded as 4022** (`play_release.json` `playCodes`). Play villages therefore come in four shapes (v7 4.2.0.x, v8 4.2.1, v8 a2–a2.2 without the bakery, v8 a3 / a3.1), plus the preview package's a1–a3.1 (BP-22).
- **Inputs (this folder):**
  - `map_scope.md`: the 19 items B1–B19, plot table v2 proposal, a3 impact. Its new choices are cited as S-N1 … S-N11.
  - `map_save.md`: save shape, R43 design, fixtures, tests. Cited as V-N1 … V-N13 and V-G-n.
  - `decisions.md`: every open question answered. Cited as D-n, Q-n, X-n, TX-n.
  - `map_tx.md`: texture budget and the T-1 … T-6 plan. Cited as T-n, TXD-n.
- **Rule:** the user said "don't ask, just build". Every open question takes its ★ answer. A question with no ★ takes the safest default (lossless for saves, the smallest visible change, no gate loosened without a written record). Each answer is listed in §1. The 대표 can overturn any line at the step-B mid preview (§4.4).
- **Nothing was built or run for this plan.** The tree was read, and the four maps were taken as given (§10).

---

## 0. Summary

1. **What gets built.**
   - Step B as in roadmap §4.1:
     - fixed workshop plots (plot table v2);
     - office ≈ 16 min as a side goal, with staff after 읍;
     - hall at village complete (1,200 + 16 + 4) at (180, 760);
     - 눈꽃 큰길;
     - shop stage 4 with three counters;
     - ceremony at the hall with the stage-4 offer;
     - station cash by train into its own hall pile;
     - meat-can re-tune.
   - The full save track: F0 (`x` + slice keep-rules + size gate), F0s (`lv` 43 + newer-save refusal), R43 (`remap43` / `keepPre43` / `check43` / failure card).
   - TX (T-1 … T-5), the 「마을 새 단장」 letter and tour, and P1 (cut line).
   - Q25: school, clinic and civic plots kept hidden. 광장 1: the 한마당 reserve on the village green.
2. **How it is built.**
   - One small serial commit first, **B0**: it fixes the shared ids, seams, inert keys and per-package string anchors.
   - Then nine packages, each in its own git worktree: **L, S, TX, P, H, M, N, BAL, P1**.
   - At most three builder worktrees run at once, plus one browser lane, because the machine has 4 CPUs and the browser lock allows one browser.
   - Each hot file (`world.js`, `Save.js`, `Progression.js`, `Game.js`, `balance.js`, `strings.js`) has one owner. Every other package touches it only in a named region and in a fixed merge order (§3.1).
3. **Order.**
   - B0 and the a3.1 baseline (W0) come first.
   - Then this merge order into `local/v43-b`: BAL-a → L1 → TX-a → L2 → P → S → H → M → N → BAL-b → TX-b → P1 (S after L2 and P: BP-13).
   - TX lands before stage 4 and before the hall-at-village-complete code, as the roadmap requires.
   - The save track lands once the plot ids, the cleared hall site and the new hall price are real (L1, L2, P).
4. **Effort.** ≈ **26 builder-days** (range 24–28). The package sizes sum to 26.4; the critique added 1.7 (§11). That is just above the maps' ≈ 21–25 + 0.75, and inside the roadmap's 19–22 + 30 % (≤ 28.6). With three builders the elapsed time is ≈ **12–12.5 working days**. The browser lane, not the builders, is the limit (≈ 61 browser-hours, §4.3).
5. **Gates.**
   - G1: hard for the smart bot; a no-regression ratchet for the onboarding bot.
   - G2 is measured against M0.
   - G3–G8 as in plan §7.3.
   - The TX exit is full-v4 GL ≤ 445 MiB.
   - The roadmap's extra save gates apply too.
   - Details in §5.
6. **Cut line.** P1 goes to v4.4 first. Note that **v4.3.1 no longer exists** (Q1 ★: hotfixes use the fourth digit). So a late item either rides a `4.3.0.x` build, and only if it changes no save shape, plot or layout, or it moves to v4.4 (§8).

---

## 1. Decisions adopted (★) and recorded

### 1.1 ★ answers (source docs)

| Question | ★ adopted | Where it lands |
|---|---|---|
| 마을새단장 D1 | 교역소 merged into the 자재 창구; the save key stays `trade`; the old sled is decor | M (sled spot, X-6) |
| D2 | Hall at village complete (`hire_hunter`), (180, 760) XL, 1,200 + 16 + 4 | L1 (plot), L2 (site clean-up), P (unlock, order, price), H (spots) |
| D3, D16 | Hut → office on the same plot (≈ 16, side, 400 + 8) → hall next door; all four staff after 읍 | L1 (`after`), P |
| D4 | **Superseded by a3**: stage 3 already opens after `hire_hunter` + first meat sale. Not reopened | — |
| D5, D11, D12, D14 | Done in step A / 4.2.0.2 | — |
| D6, D19 | One fixed plot per workshop; old saves' toolsmith / warehouse / cannery / store move there, keeping state | L1 (plots), S (remap) |
| D7 | Zones stay | — |
| D8, D9, D17, D18 | Step C, which moves to v4.4 (Q2). `v43.toggles` is accepted by sanitize, nothing writes it | S (keep-rule only) |
| D10 | Station cash goes by train to the hall (stored as X-5, below) | H, B0 |
| D13 | One v4.3, amended by Q2. No partial migration reaches testers | INT |
| D15 | `spawnMul` [1, 1, 1.1, 1.2]; stage 4 `shelfMax` 80 | B0 keys, M |
| D20 | Depot stays. R43 never touches `v42_depot` / `v42.depot.*` | S (test) |
| D21 | A hall or office finished at the old price is kept: no refund, a thank-you line | S (reprice only unfinished), N |
| 시장취임 Q1 | Release `4.3.0`; hotfixes `4.3.0.x`; previews `v4.3.0-b1 …` (X-14) | INT |
| Q2, Q3 | Step C → v4.4; the labour office opens at 읍: `d_labour` is a hidden plot (`after: 'f:rankEup'`); `labour_office` goes into `BUILDINGS` / `UNIQ` | L1, S |
| Q5 | Public launch at v4.5, so v4.3 never reaches production | P1 (flag on in v4.3 builds) |
| Q6 | Closed-test clock runs: a2 / a2.1 / a2.2 (AAB 4310–4312), a3 (4313) and a3.1 (4314) villages are on Play, and 4.2.1 went up as 4022 | S (a3.1, a2.2 and 4.2.1 fixtures, BP-22) |
| Q7 | 금방 in v4.6: F0 keeps the `geumbang` slice verbatim | S |
| Q14 | Opt-in play log from v4.3, off in production; data safety stays 「수집 안 함」 | P1 |
| Q15, Q21 | Staff become the v4.4 gift; v4.3 only hides the pads before 읍; no staff refund | P |
| 돈과복지 Q25 | `d_school` XL, `d_clinic` L, the old `w_hall` footprint kept as hidden `w_civic`; no menu, no pad, **no sign**; `types` stays data-driven | L1 |
| Q26 | `x` caps add `money` 896 B and `wk` 1,024 B (total `X_TOTAL` 6,400 B) | S |
| Q29, Q37 | The plot table keeps the branch-shop candidates (`s_m1`/`s_l1`, `se_m1`/`se_l1`, `w_civic`) free | L1 |
| 광장과축제 광장 1 | Reserve the 한마당 ground now. The ★ site now holds the a3 bakery (≈ 7 × 4 m left), so the reserve is the **village green** (`p47_plaza`, ≈ 11 × 11 m), keeping its props and the x = 990 road | L1 |
| 광장 3, 광장 5 | The reserve lasts to v4.7. The winter taste is outside step B; if it rides a `4.3.0.x`, its state is ≤ 256 B in `x.fest` through the unknown-key rule | S (rule) |
| 수산 1–14; other Q/광장 rows | No step-B effect | — |

### 1.2 Defaults adopted where no ★ exists (from the maps)

| ID | Default | Owner |
|---|---|---|
| G1 (decisions §7) | Grill does **not** move. Smart bot first sale ≤ 21.82 s stays hard. Onboarding bot becomes a ratchet: 5-seed median ≤ 16.1 s, every seed ≤ 16.3 s. The waiver is written into the step-B report | BAL |
| G2 (decisions §8) | Baseline stays M0: village complete ≤ 21.0 (pacing) / ≤ 21.17 (fresh25); 읍 42.1–46.5 min. a3's ≈ 21.5 is fixed with bakery knobs **first** (BAL-a), never re-based | BAL |
| X-1 | Stage 4 = three counters (자재 with a second merchant spot, 생선, 고기), `shelfMax` 80, `spawnMul` 1.2, open roof, 2,000 + 20 + 8 after `f:rankEup`, offered at the ceremony; half price (`stage4Old` 0.5) for villages already 읍 | M, P, H |
| X-2 | Plot candidates: `w_hall` (180, 760); `w_civic` (−780, 1880) hidden; `d_wh` (380, 1560); `d_tool` ≈ (60–120, 1580); `d_labour` hidden, provisional west spot; `d_cannery` ≈ (1600, 580) or snow fort moved; `h43_2` to the reserve's east edge | L1 (probe-confirmed) |
| X-3 | `d_store` ≈ (1700, 1030) | L1 |
| X-4 | Hall site cleared: trash pad + fire, beach campfire / bard stage, fisher hut move out; office hire pad (490, 745) padvis-checked; `'hall'` decor keys called on hall build | L2 |
| X-5 | Station cash by train goes into a separate hall pile `c1.hall.stn` (cap = `v4.rent.cap` 2,000). Each `arrive ours` moves `min(till, cap − stn)`; the rest stays in the station till. Live from the hall until 읍 | H, B0 (keep-rule) |
| X-6 | Old trade sled parked at a probe-found decor spot west of the 자재 창구; if none passes it stays hidden after the office (today) | M |
| X-7 | Office card copy 「촌장님 사무실 (직원은 읍이 되면 와요)」; the hut / office desk is the 관망 office spot (optional) | P |
| X-8, S-N7 | The x = 990 customer road becomes the south branch of 「눈꽃 큰길」; the east half is paint only on the existing node route | L2 |
| X-9, S-N10 | `src/vehicles/layout.js`: `p:hall` → `hall_front`, `p:mail_east` if `east_link` moves. Recorded exception to the plan's read-only guardrail | L2 |
| X-10, V-N2 | R43 puts `town_hall` on `w_hall` and `big_restaurant` on `w_rest` (swap if needed); `w_civic` never holds a building in v4.3 | S |
| X-11 (V-N1 … V-N13, V-G-4/5/10/11) | `frostVillage.save.backup.pre43`; occupied target → building stays, logged; reprice extras → 창고 else coins; `types` enforced by menu only; `migrateSaveEx`; `CODE_FMT` 2; newer = `v > 8 ‖ lv > 43`; old villages restart at `WORLD.v43.oldStart`; over-cap slice dropped with a warning; writes held until restore has no skipped site; test-only `__FV_TEST_FAIL43`; `progress.flags.s4half`; `progress.got` keeps every `ITEMS` key; keep `v42.seen.boost`; MovePanel uses `stamp()`; 「처음부터」 while held copies first | S |
| X-12, S-N8 | `x` caps data-driven; unknown `x` key ≤ 512 B passes through within `X_TOTAL`; `fest` / `plaza` (≈ 3 KB) not budgeted | S |
| X-13, S-N9 | Fixtures: a3.1 village(s), 4.2.0.2 ×3, 4.2.1 meat-can, XL swap, reprice, `lv` 46 newer, same-level `x`, forced failures | S |
| X-14 | Preview labels `v4.3.0-b1`, `-b2`, … | INT |
| decisions §4 | The green's props (campfire + 3 seats, picnic table, swing, rink) stay inside the reserve. So the plan's "concert → hall square" (conflict #4) and the residents' `green_fire` home changes are **dropped** | L |
| decisions §6 PQ6 | Stage-4 sign name 「눈꽃마을 시장」 | M |
| TX-1 … TX-9, T-1 … T-5, TXD-1 … TXD-5 | Gate = GL total incl. transients ≤ 455 on the default preset; exit full-v4 GL ≤ 445. Split `bld_buildings` into `bld_work` + `bld_east`; area-evict `props_buildings` after moving its 3 outside-used frames to `props_decor`; core-district area; swap-don't-stack (T-2); GL-aware Residency line (T-1); stage-page drop (T-4); `deck43_ch` stays unmanaged; **큰길 painted by Ground's village road painter, never RoadPaint in the village (TXD-3)**; no preset change for big screens (TXD-4); T-6 is a stretch | TX, L2 |
| decisions §9 | P1 fields, storage (`x.log` ≤ 512 B), `SNOWLOG1` export, settings row, build flag on in every v4.3 build and off in production, Play-track AABs ship with it off until E5 is checked, survey notice text | P1 |

### 1.3 New plan-level choices made here (BP-1 … BP-12)

| # | Choice | Why |
|---|---|---|
| BP-1 | Integration branch `local/v43-b` (worktree `scratchpad/b_int_wt`), package branches `local/v43b-<pkg>` (worktrees `scratchpad/b_<pkg>_wt`), all cut from `local/v43-b` after B0 (tag `v43b-base`). `git merge --no-ff`, after the package is rebased on the current `local/v43-b` and its acceptance subset re-run | One integration point, as step A and the a3 requests did |
| BP-2 | **B0 contracts commit** before any fan-out: ids, seams, inert balance keys, string anchors, two tiny save keep-rules, the test helper and the lane script | Parallel packages then never need to edit the same lines |
| BP-3 | Hot-file ownership and merge order as in §3.1. Generated files (`assets/_packed/**`, webp outputs, `ghostsweep_art.json`) are **regenerated after a rebase, never hand-merged** | Minimises conflicts |
| BP-4 | The train-cash notice is a coin float at the hall pile plus the pile's label, **not** a 서리 소식 headline | The 소식 / 편지 tabs need 소복이 (`OfficePanel.js:24`), and D3 moves 소복이 after 읍, while the feature lives only before 읍 |
| BP-5 | The 「마을 새 단장」 letter is a **standalone card** (`src/systems/v43/Renewal43.js`), not a `VillageNews` letter | Same reason: most pre-읍 villages have no 소복이, so a mailbox letter would never be read |
| BP-6 | The hall tax pad collects `tax + stn` together. `V42.js` `villageTills` gets one `stn` line, so 딸랑이 empties both after 읍 | No new pad; nothing left stranded at 읍 |
| BP-7 | `types` reaches the call sites through a new seam `src/systems/plotRules.js` (`plotAccepts(plot, kind)`, `menuKinds(plot)`). B0 writes it with today's semantics (`only` or size); L1 adds `types`; P switches `Tutorial.plotFor` and `Progression.freePlotFor` to it | `types` logic lives in one place, owned by L, without L editing P's files |
| BP-8 | Late items go to `4.3.0.x` only if they change no save shape, plot id/position or layout, and pass the G5 subset; otherwise to v4.4 | Q1 ★ retired 4.3.1–4.3.4 |
| BP-9 | **W0:** measure a3.1 (G1, G2, G4, texbudget incl. the 관망 seated case, walks, padvis) before any step-B code. The pass lines stay as decided (G1 ratchet, G2 M0); W0 is the "before" number for regressions and for TX | No a3.1 run exists; TX-8 asks for one |
| BP-10 | The a3 fixtures are exported from a3.1 HEAD. They stand for AAB 4313 (a3) and 4314 (a3.1) villages; a3 and a3.1 write the same save shape (map_save §2.1) | a3.1 went to Play as well |
| BP-11 | Preview `v4.3.0-b1` = mid preview, all features merged (after N), before tuning. `-b2` = after the gates. Release `4.3.0` after the release review | Roadmap review stops |
| BP-12 | Results are kept: the lane script skips `docs/build_reports/texbudget_v43.json` and `docs/build_reports/v43_stepB/**` when it restores `docs/build_reports`; logs go to `scratchpad/v43/stepB/<pkg>/` | The a3 lane runner threw away every texture result |

### 1.4 Choices added by the critique (BP-13 … BP-34)

Each row fixes a gap found when the plan was checked against the code, the docs and `tools/apk/play_release.json`. Same rule as above: lossless for saves, smallest visible change, no gate loosened.

| # | Choice | Why |
|---|---|---|
| BP-13 | **Merge order: S after L2 and P** (§4.1). | `remap43`'s `NEW43` hall price is `BALANCE.buildings.town_hall`, which P changes; S's exact-refund checks (+1,200 per unfinished hall) and browser B1 (hall on the cleared site) need P and L2. The old order (S before L2 and P) also contradicted the old calendar, which merged P at ≈ 5 and S at ≈ 5.5 |
| BP-14 | **Layout freeze from `v4.3.0-b1`.** Plot ids, `only`, `size`, `types`, `hidden` and `MOVE43` are frozen from b1; positions may still move (they live in `world.js`). A structural change after b1 ships with `LAY` 3 and a `REMAP_BY_LAY[2]` step (map_save O9). BAL-b turns hall tax per person first; it lowers the hall or office price after b1 only together with a lay-3 reprice. New fixture `v43b1_village` (exported from the b1 build) must load in b2 and 4.3.0 with no remap and an equal census | The 대표's b1 village carries `lay: 2`, so later builds never remap it. `Site.start` caps `got` at a lower price without refunding (map_save G-3) |
| BP-15 | The failure card's 「코드 복사」 exports the **current stored keys** (on a failure `SAVE_KEY` is the untouched pre-B village), never `PRE43_KEY`. The Settings 「새 단장 전 마을」 entry lists each `pre43` slot with its save time | `PRE43_KEY` is written once and may hold an earlier village; a code imported later lands in `.pre43.2` or nowhere (`applyVillage` writes raw keys, `Transfer.js:238-276`) |
| BP-16 | Villages already at 읍 when remapped (`progress.flags.s4half`) get the half-price stage-4 offer as a letter line (N) and as the `mkt_s4` side row in the goal window and in `Tutorial.v42Goal` (P). No banner | They never see a ceremony again, so the H banner would never reach them. `기획서_마을새단장.md` §12 item 7 promises 「읍이면 4단을 반값에 제안해요」 |
| BP-17 | `refreshSites` never hides a site that holds a building. S's browser B1 asserts that every restored site is shown | `refreshSites` (`Game.js:1040-1055`) calls `setShown(false)` on any plot site whose region / `after` is not met, built or not |
| BP-18 | The `'hall'` decor and the step-A leftovers are cleared when `w_hall` **shows** and on every hall build, including the instant restore of an old village's finished hall | Same pattern as the office and bank (`Office.js:84, 93, 432-433`). A clear only on a live build leaves an old village's moved hall standing on trees and the trash pad |
| BP-19 | Hidden plots get **no `Site` at all**: B0 adds `plotRules.isHidden` and the skip in `Game.buildV3`. `v43_layout` reads hidden plots from `WORLD.plots`. New `v43_layout` rule: no new plot's footprint overlaps an existing plot that can hold a building | `Game.buildV3` (`Game.js:1015-1023`) makes a `Site` for every `WORLD.plots` id and `refreshSites` shows it once its `after` is met: without the skip, `d_labour` (`after: 'f:rankEup'`) would appear at 읍. The overlap rule is map_save §2.3's |
| BP-20 | Every `d_*` workshop plot gets `pads` offsets (`line`, `p2`; `d_cannery` also `mcan`) set from padvis. The store's customer line at `d_store` faces east and clears the bakery's LINE / P2 and the 큰길 | Hire pads come from the plot's `pads` (`Game.plotPad`, `Game.js:1445`; today on `e_m2`, `s_m1`, `w_m2`, `world.js:603-622`). The store line is rebuilt from the store's plot (`refreshStoreLine`, `Game.js:278`); plan §4.2 wants it facing east |
| BP-21 | **Injected-save audit in B0.** On a3.1, 58 suites write a save into storage and 37 load fixtures. B0 commits the list; each suite is tagged `asStepB` (non-layout semantics), `remap` (must load through `remap43`: `lgx_l0` / G4, `meatcan`, `porters42`, `dockporter`, `ghostcoins_matrix`, `store42`, `bakery`) or `rewrite` (layout suites) | map_save §6.2 lists 12 suites. `save_v3` (`:122-125`) and `save_v35` (`:116`) assert `sites.e_m1` / `e_m2` after a browser boot, so they fail once S lands. `asStepB` on a G4 or meat-can suite would measure the old generic-plot layout |
| BP-22 | Fixtures for every Play population: `v43a22_late.json` (a real a2.2 village from `920ddf1`: `shop43`, no `bakery43`, bread on the shop rack, depot crew) and `v421_meatcan.json` (v8 from `977f02e`: cannery on `w_m2` with its `mcan` pad, no `shop43`). `make_v43.mjs` refuses to write a pre-B fixture that carries `v43` or `lv` | Play codes 4310–4312 and 4022 (`play_release.json`). `v43a2_bread` is hand-made (no hall, no store, no depot). A fixture exported from `local/v43-b` after B0 carries `lay: 2` and never remaps |
| BP-23 | `remap43` also writes `v43.src = { v, lv }` beside `refunds43`. P1's export reads both from the save when the player turns logging on | The remap runs at the first launch, before anyone can turn P1 on, and P1 records nothing while off (decisions §9). Without this the migration result, which the roadmap calls the one thing only P1 can report, is never recorded |
| BP-24 | **Outbound-request check.** `playlog.mjs` records every request over boot + 2 min of play + the P1 export screen and asserts each URL is same-origin, `data:` or `blob:`. The APK build's `remote_refs` host list (`build_apk.py:210`) goes into the release pack | `review_robust_netcheck.mjs` only prints failed and ≥ 400 requests. No `apkboot` tool exists (§6 item 13 named one) |
| BP-25 | B0's `src/systems/v43/hooks.js` carries an event bus (`emit(name, data)`, `on(name, fn)`). P, H, M and N emit their card, goal-window, offer and letter events in their own files while they build. P1 only subscribes, and polls joystick / 관망 seconds from its own update | P1 otherwise edits `GoalBook`, `Renewal43`, `OnboardOverlay` and `Rank` at the very end, after their owners have finished |
| BP-26 | B0 mounts the new cards in `UI.js` as stubs: `SaveHoldCard` (S) and the `Renewal43` card (N) | Panels are mounted in `UI.create` (`UI.js:131-136`); otherwise S and N would both edit `UI.js`, which the ownership table gives to P1 only |
| BP-27 | W0 and every pre-B fixture export run in a detached worktree at `e28089a` (`scratchpad/b_w0_wt`) | W0 was planned in `b_int_wt` while B0 is being written there |
| BP-28 | **Gate statistics** as M0 measured them (`docs/build_reports/v43_baseline/report.md` §1): G1 smart = 5-seed median; G2 village complete = 3-seed median (pacing) and 5-seed median (fresh25); 읍 = 3-seed median in 42.1–46.5, every seed reported. TX exit = worst view over **two** full `texbudget` runs | M0's own 읍 seeds span 44.21–50.88, so a per-seed band would fail M0 itself. Texture runs spread 3–4 MiB (map_tx §0) |
| BP-29 | **TX checkpoints before TX-b:** P's merge runs `texbudget` at the ≈ 16-min office and ≈ 22-min hall views; M's merge runs full-v4 and the stage-4 plaza. TX-b adds three views: the first boot of a remapped 46-min village, the 「새 지도 보기」 3-tap tour, and the 16-min office | Stage 4 and the early hall were first measured at TX-b (≈ day 9). The two new views are new peaks: every page is queued at once on a late boot, and the tour moves the camera across areas fast |
| BP-30 | **Release:** `4.3.0` goes internal track → 대표's phone → closed track, with the ask 「예전 마을을 열어 보세요. 빠진 게 있나요?」. Preview codes ≥ 4307, AAB codes ≥ 4315 (`play_codes.py check-*`). The Play 「새로운 기능」 text and the tester notice are rewritten for the v4.3 scope, plus 「마을 코드를 쓰기 전에 업데이트해 주세요」 (R9) | Roadmap §7 item 2; `기획서_시장취임_로드맵.md` line 412. The draft in `기획서_마을새단장.md` §13 still lists step-C items (인력 사무소, 알바, 마을 장부, 열고 닫기) and must not ship as written |
| BP-31 | The hall's front `clear` square is sized for v4.6's 「시청 공사 시작」 scaffold. `v43_layout` keeps it free of new decor and pads | decisions §2 note on Q8 / E13 |
| BP-32 | **Shared test suites have owners:** `padvis` (L; M adds the stage-4 rows, H the hall SPOT rows), `v43_layout` (L; M edits only its `merchant` section), `carry` (L; H and M add place-name rows), `smoke` (L; S adds `asStepB` lines only), `goals` / `goals.test` (P), `residents` (L), `market43` (M), `texbudget` (TX), `transfer` / `save_*` (S), `econ/**` (BAL; P keeps it running), `ghostcoins*` (H adds `stn`) | Several packages edit these suites; the §3.1 table covered only `src/` |
| BP-33 | `c1.hall.stn` is a coin place: H adds it to the `ghostcoins` / `ghostsweep` coin census and S to the `save_v43` census | Otherwise those suites report the train's move as lost coins |
| BP-34 | The Settings 「새 단장 전 마을」 entry moves from cut tier 2 to never-cut (≈ 0.1 d) | `기획서_마을새단장.md` §12 item 1 promises it to the designer |

---

## 2. Contracts fixed in B0 (shared by all packages)

| Kind | Contract | Writer → readers |
|---|---|---|
| Plot ids (never re-used) | `w_hall` (moves to (180, 760), XL, region `start`, `only: 'town_hall'`, `after: 'hire_hunter'`); `w_rest` (unchanged; hall no longer offered); `w_civic` (XL, hidden, old `w_hall` footprint); `d_tool`, `d_wh`, `d_cannery`, `d_store` (M, `only` their kind; `d_cannery.pads = { line, p2, mcan }`); `d_labour` (L, hidden, `only: 'labour_office'`, `after: 'f:rankEup'`); `d_school` (XL, hidden), `d_clinic` (L, hidden); `h43_1`, `h43_2` (ids kept; `h43_2` shifts); `v42_office` (`after: 'zone_mine'`, side) | L1 → S, P, H, TX, N |
| Hidden plot rule | `hidden: true`: no `Site` object at all (B0: `Game.buildV3` skips it through `plotRules.isHidden`), so no sprite, pad, sign or menu; an `only` that is not a v4.3 building except `d_labour`, so `Save.js:215` drops anything saved there. `v43_layout` reads hidden plots from `WORLD.plots` (BP-19) | B0 (skip), L1 (rows) → S |
| Reserve | `WORLD.reserves.p47_plaza` (polygon, not a plot). Nothing new (tree, decor, plot, pad) may be placed inside; `v43_layout --only layout` checks it | L1 |
| Old-village start | `WORLD.v43 = { oldStart, shopFront }` (hut door; the shop front while `v42_office` holds an unfinished site) | B0 (values), L1 (final) → S |
| Step ids | `mkt_s4` (`type: 'shop', level: 4`, `after: 'f:rankEup'`, side; price from `market43.stage4`, × `stage4Old` when `progress.flags.s4half`); `town_hall` first in `GOALS` after complete; `BUILD_UNLOCK.town_hall = 'hire_hunter'` | P → M, H, BAL |
| Pad row | `WORLD.pads.mkt_s4` at the `mkt_s3` spot (1525, 900) (inert until P adds the step) | B0 → M (may re-place) |
| Flags / seen keys | `progress.flags.s4half` (remap), `v43.seen.letter43`, `tour43` (N), `s4offer` (H); all values `1` / `true` | S, N, H |
| Save | `lv: 43` after `v`; `v43 = { lay: 2, toggles, seen, refunds43, src }` (`src = { v, lv }` of the remapped save, BP-23); `c1.hall.stn`; `x.*` caps (§S); PRE43 key `frostVillage.save.backup.pre43`; `CODE_FMT` 2 | S (B0 for `stn` and a minimal `v43`) |
| Balance keys | `market43.stage4 { coins 2000, item_plank 20, item_ingot 8 }`, `market43.stage4Old 0.5`, 4th entries of `market43.shelfMax` (80) and `spawnMul` (1.2); ranges in `balanceCheck.js`. `buildings.town_hall` stays 2,400 until P changes it. `hut.office` already exists | B0 → M, P, BAL |
| Art keys | `market_s4` page (back + front; sled frame on it); `bld_work`, `bld_east` (split of `bld_buildings`); `props_decor` gains `mine_entrance`, `boat_small`, `campfire` | M, TX |
| Seams | `src/systems/plotRules.js` (BP-7). `src/systems/v43/hooks.js` (`onAfterLoad(fn)`, `runAfterLoad(gs, info)`; `info = { fresh, remapped, refunds43 }`), `src/systems/v43/index.js` importing stubs `Renewal43.js` (N) and `PlayLog.js` (P1). `Game.build` calls `runAfterLoad` once, after `unstickChief` (`Game.js:269`). `hooks.js` also carries the event bus `emit` / `on` (BP-25); `UI.js` mounts the `SaveHoldCard` and `Renewal43` card stubs (BP-26) | B0 → S (wiring), N, P1; P, H, M, N emit on the bus |
| Game holder | `gs.v43`: the saved block, else `{ lay: 2, seen: { letter43: 1, tour43: 1 } }` for a new game and `{ lay: 0 }` for a loaded save without one (so a dev village made before S lands still remaps later); serialized as `v43` | B0 → S (full rules), H, N |
| Test helper | `tools/test/v43_helpers.mjs`: `asStepB(save)` adds `v43: { lay: 2 }` for tests that want post-B semantics without a remap | B0 → all suites |
| Lane script | `scratchpad/v43/stepB/lane_b.sh WT OUT LANE suite[:args] …`: `flock scratchpad/v43/browser.lock`, `nice -n 10`, worktree-aware, restores `docs/previews` / `docs/build_reports` except the BP-12 paths | B0 → all |

---

## 3. Work packages

### 3.0 Machine and lane rules (all packages)

- One browser at a time through `flock …/v43/browser.lock`; `nice -n 10`; small viewports. Node checks (`*.test.mjs`, `save_v43.mjs --node`, `balanceCheck`) run freely.
- At most three builder worktrees active; the art pipeline (Blender, low samples) runs only when no bot run holds the browser.
- Every package keeps its logs in `scratchpad/v43/stepB/<pkg>/` and ends with a short report: what changed, acceptance results, open items.
- Guardrails: no edits under `src/{story,missions,bank,harbor,beach,city}/**`. `src/vehicles/layout.js` only as X-9. `DepotSystem.js` / `DepotBuilding.js` untouched (D20). `Bakery43.js` only re-checked.
- W0 and every pre-B fixture export run in a detached worktree at `e28089a` (`scratchpad/b_w0_wt`), never in `b_int_wt` (BP-27).
- Shared test suites follow the owners in BP-32. The B0 audit (BP-21) says which suites take `asStepB` and which must load through the real remap.

### 3.1 File ownership and merge order

O = owner, c = may touch with care in the named region only, — = not touched.

| File | B0 | L | S | TX | P | H | M | N | BAL | P1 | Merge order on this file |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `src/data/world.js` | c (`pads.mkt_s4`, `WORLD.v43`) | **O** | — | — | — | — | c (`market` + `trade` blocks, `:143-216`; `pads.mkt_s4`) | — | — | — | B0 → L1 → L2 → M |
| `src/core/Save.js` | c (`sanitizeC1` `stn`; minimal `v43`) | — | **O** | — | — | — | — | — | — | — | B0 → S |
| `src/systems/Progression.js` | — | — | — | — | **O** | — | — | — | — | — | P only |
| `src/scenes/Game.js` | c (seam call, `gs.v43` holder, `buildV3` hidden skip `:1015-1023`) | c (L1: tree clear spots `:740-770` gain the reserve, `refreshSites` `:1040-1055` never hides a built site; L2: `unlockV3` plan `:2831`) | **O** (load / build / catch / serialize / restore) | c (lazy region `:405-470`) | — | — | — | — | — | — | B0 → L1 → TX-a → L2 → S |
| `src/data/balance.js`, `balanceCheck.js` | c (new keys) | — | — | — | c (`buildings.town_hall` line) | — | — | — | **O** (tuning) | — | B0 → BAL-a → P → BAL-b |
| `src/data/strings.js` | **O** (anchors) | c (anchor L) | c (S) | — | c (P) | c (H) | c (M) | c (N) | — | c (P1) | any order: each package inserts only between its own start/end anchor pair (ko and en) |
| `src/scenes/UI.js` | c (mount stubs for `SaveHoldCard` and the `Renewal43` card, BP-26) | — | — | — | — | — | — | — | — | c (settings row) | B0 → P1; no other package edits it (new cards live in new files) |
| `src/systems/Civic.js` | — | **O** | — | — | — | — | — | — | — | — | |
| `src/core/Residency.js`, `src/core/Assets.js`, `src/systems/RoadPaint.js` | — | — | — | **O** | — | — | — | — | — | — | |
| `src/core/Transfer.js`, `src/scenes/MovePanel.js`, new `src/core/Remap43.js`, new `src/scenes/SaveHoldCard.js` | — | — | **O** | — | — | — | — | — | — | c (`MovePanel` refuses `SNOWLOG1`) | S → P1 |
| `src/systems/Tutorial.js`, `goals/GoalBook.js`, `src/entities/Site.js`, `office/Office.js`, `src/scenes/OfficePanel.js` | — | c (L2: `Office.js:432-433`, the `'hall'` clear when `w_hall` shows, BP-18) | — | — | **O** | — | — | — | — | — (subscribes on the B0 bus, BP-25) | L2 → P |
| `src/entities/TownHall.js`, `src/systems/Rank.js`, `src/systems/Growth.js` | — | — | — | — | — | **O** | — | — | — | — | |
| `src/systems/V42.js` | — | — | — | — | — | c (`villageTills` `stn` line) | — | — | — | — | |
| `src/entities/Seller.js`, `Register.js`, `assets/market/**` | — | — | — | — | — | — | **O** | — | — | — | |
| `src/systems/v43/Renewal43.js`, `src/scenes/OnboardOverlay.js` | c (stub) | — | — | — | — | — | — | **O** | — | — (bus) | B0 → N |
| `src/flag/VillageFlags.js` | — | — | — | — | — | — | — | c (flag card waits for the letter) | — | — | |
| `Ground.js`, `RoadNet.js`, `Roads.js`, `Territory.js`, `VillageLife.js`, `residents/data.js`, `vehicles/layout.js` | — | **O** | — | — | — | — | — | — | — | — | |
| `src/systems/pilot/ChiefPilot.js` | — | — | — | — | c (hut-desk office spot, optional) | — | — | — | — | — | |
| `src/data/version.js`, `tools/apk/**`, `tools/build/build_artifact.mjs` | — | — | — | — | — | — | — | — | — | **O** (flag) | INT bumps `VERSION` labels |
| `assets/_packed/**`, `ghostsweep_art.json` | — | — | — | O (regen) | — | — | c (regen) | — | — | — | TX-a → M (regenerate, BP-3) |
| `tools/test/econ/**`, `review_gameplay_sim.mjs`, `review_gameplay_census.mjs` | — | — | — | — | c (keep the bot running only) | — | — | — | **O** | — | P → BAL |
| Shared suites (`padvis`, `v43_layout`, `carry`, `smoke`, `residents`, `goals*`, `ghostcoins*`) | c (audit list) | O (`padvis`, `v43_layout`, `carry`, `smoke`, `residents`) | c (`asStepB` lines; `save_v43` census) | — | O (`goals*`) | c (hall rows in `padvis` / `carry`; `stn` in `ghostcoins*`) | c (stage-4 rows in `padvis`; `merchant` in `v43_layout`; counters in `carry`) | — | — | — | BP-32; the package merge order |

### 3.2 B0: contracts and seams (serial, first)

- **Goal:** fix every shared name before anyone fans out, with no gameplay change.
- **Owns:** new `src/data/ids43.js` (plot / step / flag / seen-key constants), new `src/systems/plotRules.js` (incl. `isHidden`), new `src/systems/v43/{hooks,index,Renewal43,PlayLog}.js` (stubs; `hooks.js` with the event bus, BP-25), new `src/scenes/SaveHoldCard.js` (stub; S takes it over), new `tools/test/v43_helpers.mjs`, `scratchpad/v43/stepB/lane_b.sh`, and the injected-save audit list `scratchpad/v43/stepB/b0/suites_audit.md` (BP-21).
- **With care:**
  - `Game.js`: one import, the `runAfterLoad` call after `:269`, the `gs.v43` holder and `serialize` line, and the `buildV3` skip for `hidden` plots (no plot is hidden until L1, BP-19).
  - `UI.js`: two mount lines for the card stubs (BP-26).
  - `Save.js`: `sanitizeC1` keeps `hall.stn` (count ≤ `v4.rent.cap`); a minimal `v43` keep-rule (`lay` int 0..9, `seen` keys → 1, `refunds43` ≤ 512 B JSON). S replaces it.
  - `balance.js` / `balanceCheck.js`: the new keys of §2, inert while `SHOP_STAGE_MAX` is 3.
  - `strings.js`: start/end anchor pairs for L, S, P, H, M, N, P1 in `ko` and `en`.
  - `world.js`: `pads.mkt_s4` (inert), `WORLD.v43`.
- **Depends on:** nothing. Runs in parallel with W0.
- **Acceptance:** all Node tests; `smoke`, `save_v42`, `bakery`, `goals` unchanged; `padvis` and `v43_layout --only layout` unchanged (the inert `pads.mkt_s4` shares the `mkt_s3` spot); a reload keeps `v43` and `c1.hall.stn` (Node round trip through `sanitizeSave`).
- **Size:** 0.75 d (the bus, the card mounts, the hidden-plot skip and the suite audit add 0.25).

### 3.3 W0: a3.1 baseline (browser lane only, no code)

- **Goal:** the "before" numbers on a3.1 (BP-9, TX-8).
- **Runs** (commands from `docs/build_reports/v43_baseline/report.md` §9, in the detached worktree `scratchpad/b_w0_wt` at `e28089a`, BP-27):
  - `v43_layout --only layout,walks,firstsale,merchant --seeds 5`;
  - pacing ×3 (`review_gameplay_sim.mjs --policy smart --v4 --after 12 --minutes 80`);
  - fresh25 ×5;
  - `lgx_l0`;
  - `padvis`;
  - `texbudget` (full, run to the end of the 관망 seated case) and `watchpan`.
- **Output:** `scratchpad/v43/stepB/w0/` with a one-page table.
- **Size:** ≈ 7 browser-hours; 0.25 d of attention.

### 3.4 WP-L: layout, plots and roads (L1, then L2)

- **Goal:** plot table v2 (B1), roads, 큰길, decor and conflicts (B2), the layout half of B5 and B9, the 한마당 reserve, Q25.
- **Owns:**
  - `src/data/world.js` (all except the M carve-out), `src/systems/Civic.js`, `src/systems/plotRules.js` (fills in `types`);
  - `src/systems/Ground.js` (큰길 village paint, TXD-3), `RoadNet.js`, `Roads.js`, `Territory.js`, `VillageLife.js`, `src/systems/residents/data.js`, `src/vehicles/layout.js` (X-9 only);
  - `tools/test/v43_layout.mjs`, `plots.mjs`, `store42.mjs`, `walls42.test.mjs`, `roadnet.test.mjs`.
- **With care:**
  - `Game.js` `unlockV3` plan (`:2831`): `e_m1` / `e_m2` / `s_m1` / `s_m2` → the `d_*` plots;
  - strings anchor L (place names for the carry pill, 큰길, moved home lines);
  - `smoke.mjs`, `labour.mjs`, `v4.mjs`, `restaurant.mjs`: their injected layouts.
- **L1, plot table (≈ 1.75 d, first):**
  1. Probe every v2 row with `v43_layout --only layout --probe …` and `padvis`, before writing rows. Fallbacks are in S-N2 / S-N3.
     - `w_hall` (180, 760);
     - `w_civic` (−780, 1880);
     - `d_wh` (380, 1560);
     - `d_tool` ≈ (60–120, 1580);
     - `d_cannery` (snow fort or +40 px);
     - `d_store` ≈ (1700, 1030);
     - `d_school` XL (−930, 640), clearing one pine and the crate;
     - `d_clinic` L (−1160, 870), clearing two pines and two stumps; its west edge is 59 px inside `WORLD.left`;
     - `d_labour` hidden (provisional west spot);
     - `h43_2` to the reserve's east edge;
     - `p47_plaza` against `zone_hunt` (1160, 1800).
  2. Write the rows, the hidden-plot rule and `WORLD.reserves`. Set `v42_office.after = 'zone_mine'` (side) and `w_hall` per §2. `d_cannery.pads`.
  3. `types: ['house_*', 'deco_*']` on the generic M/L plots. `plotRules` reads it; `Civic.MENU` offers by `types`; the big-plot reservation stops reserving generic plots for workshops. The `w_rest` menu offers the restaurant only.
  4. `v43_layout` gains the reserve check (no new tree / decor / plot / pad inside) and the Q29/Q37 rule (branch-shop candidates stay free).
  5. Suites re-written for fixed plots: `plots`, `store42` ("an old store on `w_m2` moves to `d_store`" waits for S; until then `asStepB`), `restaurant`, `v4`, `smoke`, `labour`.
  6. `pads` offsets (`line`, `p2`) on every `d_*` workshop plot, from padvis; the store's customer line at `d_store` faces east, clear of the bakery's LINE / P2 and the 큰길 (BP-20).
  7. Game.js carve-outs: `refreshSites` never hides a built site (BP-17); the tree generator's clear spots include the reserve polygon.
  8. `v43_layout`: hidden plots read from `WORLD.plots`; no new plot overlaps an existing buildable plot (BP-19); the hall's front `clear` square stays free (BP-31).
  9. `treeGaps` for the new plots (plan §4.5.2 regenerate list).
- **L2, roads and decor (≈ 2.25 d, after L1):**
  1. 큰길 nodes `hut_door`, `hall_front`, `deck_head`. Remove `w_office` and its three edges (`world.js:968-971`). The x = 990 road is the south branch (X-8). Paint the village part with `Ground.drawRoads` (`ground_road`, 0 MiB). RoadPaint only where the street meets its existing rects (TXD-3).
  2. Hall-site clean-up (X-4): trash pad + fire, beach campfire (140, 590) / bard stage, fisher hut. Clear the `'hall'` decor when `w_hall` **shows** and on every hall build, including the instant restore of an old village's finished hall (`Office.js:432-433` pattern, BP-18).
  3. `d_store` / `east_link` route; `vehicles/layout.js` `p:hall`, `p:mail_east`.
  4. Residents' home flavour lines (준 in `h43_2`, "대장간 뒤") re-read. `green_fire` stays (decisions §4).
  5. `unlockV3` plan → `d_*`.
- **Depends on:** B0. L2's Game.js edit merges after S.
- **Acceptance (new / updated):**
  - `v43_layout --only layout` with all v2 probes and the reserve check (0 overlaps);
  - `padvis` (all pads, plus the office hire pad vs the hall's east wall);
  - `plots.mjs` (fixed plots, `types` menu, hidden plots never shown);
  - `store42.mjs` (incl. the store line at `d_store`), `walls42.test`, `roadnet.test` (new nodes, no `w_office`);
  - `v43_layout`: no plot-vs-plot overlap, hidden plots probed from `WORLD.plots`, the hall's front square free.
- **Must pass:** `smoke`, `stuck`, `nav`, `goals` (tap-to-walk routes), `carry` (place names and distances), `residents` / `residents.test`, `bakery --only layout` (≥ 75 px from x = 990, pads ≥ 1.4 m, no pad under a roof), `deck`, `onboarding` (views unchanged), `v42`, `v42_guide`, `restaurant`, `v4`, `labour`. Plus G1 `firstsale` 5 seeds if anything moved within ≈ 6 m of the deck, grill or stall.
- **Size:** ≈ 4.25 d (incl. Q25 0.25, 광장 1 0.5 and BP-17 … BP-20 0.25). Browser ≈ 6 h.

### 3.5 WP-S: save track (F0, F0s, R43, failure path, fixtures)

- **Goal:** B11–B14 and G8, plus the roadmap's extra save gates (map_save §4–§7).
- **Owns:**
  - `src/core/Save.js`, new `src/core/Remap43.js` (`LAY`, `MOVE43`, `OLD43` frozen constants, `needsRemap`, `remap43`, `check43`, `check43b`);
  - `src/core/Transfer.js`, `src/scenes/MovePanel.js`, new `src/scenes/SaveHoldCard.js` (failure card, newer card, stale banner text);
  - `tools/test/save_v43.mjs`, `tools/test/fixtures/make_v43.mjs` and the new fixtures, `transfer.mjs`, `save_v42.mjs`, `review_robust_save.mjs`, `review_robust_save_fast.mjs`.
- **With care:**
  - `Game.js` load / build / catch / serialize / restore regions: `Save.held` → hold; `restoreSkipped` (`:1065`); `Save.pending43` → `confirm43` / `failWith`; no quarantine on a remapped crash (`:133-142`); serialize `x`, `missions`, `geumbang`, `haul`, `demand` pass-through; `Game.js:2621` 「처음부터」.
  - `index.html` crash card (only to respect a hold).
  - Strings anchor S (card texts ko/en).
- **Sub-steps** (map_save §7):
  - S1 `LV`, `isNewerSave`, `stamp`, `PRE43_KEY`; G-4 (`progress.got` keeps every `ITEMS` key), G-5; `CODE_FMT` 2 + `lv` in codes; `MovePanel` uses `stamp`. 0.5 d.
  - S2 `sanitizeV43`, `keepX` (caps: log 512, mgmt 256, needs 1024, daily 512, rewards 512, money 896, book 1024, mail 512, wk 1024, unknown ≤ 512; total 6,400), `SLICES43` (missions 3072, geumbang 1400, haul 768, demand 1024), `gs.x43` holder. 1.25 d.
  - S3 F0s load hold, S1 write guard (head regex), cards, `Save.clear` guard. 0.75 d.
  - S4 `remap43` (movers two-phase incl. XL swap; reprice with `OLD43`; 창고-or-coins; `s4half`; `oldStart`; marker + `refunds43` + `src`, BP-23), `check43` (a–g) + `check43b`, `keepPre43`, `migrateSaveEx`, load wiring, failure card (its 「코드 복사」 exports the current stored keys, BP-15), `migrateFail`, 「새 단장 전 마을」 export listing each `pre43` slot. A Node check keeps `NEW43(b)` equal to `Site.buildCost(b)` for the hall and the office. 1.5 d.
  - S5 fixtures (1 d):
    - 4.2.0.2 ×3 from a worktree at `38c233c` (browser runs: after the tutorial, ≈ 25 min, ≈ 46 min with admin);
    - `v43a3_late` and `v43a3_fresh25` from a3.1 HEAD (BP-10), in `b_w0_wt`, never from `local/v43-b`;
    - `v43a22_late` (a real a2.2 village, worktree at `920ddf1`) and `v421_meatcan` (v8, worktree at `977f02e`, cannery on `w_m2` with `mcan`) for the Play populations 4312 and 4022 (BP-22);
    - `v43b1_village`, exported from the b1 build, for the b1 → b2 → 4.3.0 check (BP-14);
    - `v43a1_village`, XL-swap ×4, reprice ×3, `v43_newer_lv46` (+ `v` 9 variants), `v43_samelv_x`, all from `make_v43.mjs`;
    - every fixture gets a `_note`; `make_v43.mjs` refuses a pre-B fixture that carries `v43` or `lv` (BP-22).
    - 1.25 d (was 1).
  - S6 `save_v43.mjs` (11 Node checks, 5 browser checks B1–B5; B1 also asserts every restored site is shown, BP-17) and the suite updates from the B0 audit (BP-21): map_save §6.2 plus the `save_v3` / `save_v35` browser parts, `lgx_l0`, `meatcan`, `porters42`, `dockporter`, `ghostcoins_matrix`, `pickup`, `visitors42` and the rest of the list. 1.5 d.
- **Depends on:** B0. S1–S3 need nothing else. S4's `check43b` and browser B1 need L1's real plots (Node work can use a stub `WORLD` until L1 merges). **Merges after L2 and P** (BP-13): the exact-refund checks need P's hall price, and browser B1 needs L2's cleared hall site.
- **Acceptance:** `save_v43.mjs --node` (all 11) and browser B1–B5 on every fixture:
  - census equal after refunds;
  - remap once, then a no-op;
  - `SAVE_KEY` byte-identical for 60 s under a forced failure (incl. `visibilitychange` / `pagehide`);
  - `lv` 46 refused and the stored value untouched;
  - second-tab stale guard;
  - the failure card's code reads back to the stored village, never an older `pre43` (BP-15);
  - the b1 fixture loads in later builds with no remap and an equal census (BP-14);
  - `SNOWBLOOM2` read, `SNOWBLOOM3` → newer;
  - size at caps < 24,576 B (warns > 16,384).
- **Must pass:** `transfer`, `save_v2/v3/v35/v4/v42`, `admin`, `review_robust_save(_fast)`, `review_robust_restart`, `bakery` (its 창고 moves to `d_wh`), `flag` (maker shut while held), `smoke`, `depot.test` / `depot_parity.test` (D20 untouched).
- **Size:** ≈ 5.75–6.25 d. Browser ≈ 10 h (most of it the 4.2.0.2, a2.2 and 4.2.1 fixture runs).

### 3.6 WP-TX: textures (TX-a early, TX-b at the end)

- **Goal:** B15. TX-a removes the 451.8 MiB peak before stage 4 and the early hall land; TX-b measures the finished step B.
- **Owns:**
  - `src/core/Residency.js`, `src/core/Assets.js`, `src/systems/RoadPaint.js` (T-2 hook only);
  - `assets/buildings/**` and `assets/props/**` (repacks, manifests), `tools/build/pack_pages.py` runs, `tools/blender/prop_repack.py`;
  - `tools/test/texbudget.mjs`, new `tools/test/residency.test.mjs`.
- **With care:**
  - `Game.js` lazy region (`:405-470`): `bld_buildings` → `bld_work` / `bld_east` in both priority lists; add `market_s4`; rule `market_s4` allowed once `pr.isDone('mkt_s4') || pr.flags.rankEup`;
  - `Effects.js` (T-6 only).
- **TX-a (≈ 1.2 d):**
  - T-1 GL-aware `line()`.
  - T-2 swap-don't-stack, plus `RoadPaint.releaseIfFar` using Residency's view source.
  - T-3f boot pages re-queued.
  - T-3a `bld_buildings` split.
  - T-3b three outside-used frames to `props_decor`.
  - T-3c–e `core` area (`props_buildings`, `deck43`, `bakery43`, current `market_s*`, hall page as extra), rects from live users, tight hysteresis.
  - T-3g `office` rect re-anchored on (600, 640).
  - T-4 earlier stage pages dropped.
  - A guard: `evictArea` skips a page a UI scene shows.
- **TX-b (≈ 0.35 d, after M and P):**
  - T-5 scenario on step B (uses L2's `unlockV3`): hall at complete, stage 4, forklift bought, 큰길.
  - New views: ceremony through its 12 s, stage-4 plaza, real depot at zoom 1.2, the station from both sides, 관망 seated to the end, the first boot of a remapped 46-min village, the 「새 지도 보기」 3-tap tour, and the office at ≈ 16 min (BP-29).
  - Tour at 0 / 12 / 16 / ≈ 22 / 26 / 45 min.
  - `--bot` fix (`balance.js` import, as `bakery.mjs:50`); return-to-start check minus the ground pool.
  - Report-only `--vp 412x915x2.625` (high, mid).
  - Results committed as `docs/build_reports/texbudget_v43.json` (BP-12).
- **Depends on:** W0's texbudget. TX-a is independent of L / S / P (rects come from live users). TX-b needs L2, P, M merged; it starts at M's merge, in parallel with BAL-b.
- **Acceptance:**
  - `residency.test.mjs` (line math per viewport; swap order; no area evicted while it is near or under `camFocus`);
  - TX-a: `texbudget` on the a3.1 layout, every must passing and the worst view ≤ 440;
  - TX-b: all musts incl. the new views, and the exit **full-v4 GL ≤ 445** as the worst view over two full runs (BP-28);
  - checkpoints before TX-b (BP-29): the ≈ 16 and ≈ 22-min views at P's merge; full-v4 and the stage-4 plaza at M's merge. A view above 445 there opens T-6 or a reserve lever at once.
- **Must pass:**
  - `watchpan` (the free camera crosses the core edge; `LOOK_TTL` honoured);
  - `deck`, `bakery`, `market43` after a core → station → core round trip (stand-ins re-skinned, work loops replayed, sled present);
  - `ghostsweep`, `padvis`, `smoke`, `perf_presets`;
  - a 10-min soak with `Residency.loads` / `evictions` counted (no loop).
- **Size:** ≈ 1.6 d (+ 0.25 for T-6 if a T-5 view lands above 440, TXD-5). Browser ≈ 9 h (the second full run and the checkpoints add 3).

### 3.7 WP-P: progression and the chief's buildings

- **Goal:** B3, B4, the progression half of B5, and the `mkt_s4` step row.
- **Owns:** `src/systems/Progression.js`, `src/systems/Tutorial.js`, `src/systems/goals/GoalBook.js`, `src/entities/Site.js`, `src/systems/office/Office.js`, `src/scenes/OfficePanel.js`, new `tools/test/chief43.mjs`, `goals.test.mjs`.
- **With care:**
  - `balance.js` `buildings.town_hall` → 1,200 + 16 + 4 (time 14);
  - `ChiefPilot.js` (hut-desk office spot; optional, cut tier 3);
  - strings anchor P;
  - `tools/test/econ/**` and the pacing bot, only to keep them running (tuning is BAL).
- **Work:**
  1. Office side card after `zone_mine`, reusing the first-house side logic (`Tutorial.js:430`, `GoalBook.js:225`). `Site.buildCost('chief_office')` reads `hut.office`. Card copy per X-7. `['v42_office', 'chief_office']` leaves `V42_BUILDS` (`GoalBook.js:24`). `Tutorial.v42Goal` drops the office as the first after-읍 goal. Bank guard: `chief_office` before `v42_bank` when the plot is still a hut at 읍.
  2. Staff: `Office.nextRole()` gates all four roles on rank ≥ 2. The 직원 tab says 「읍이 되면 와요」. `v42Goal`'s hire branch only after 읍. Staff already hired stay.
  3. Hall: `BUILD_UNLOCK.town_hall = 'hire_hunter'`; `GOALS` puts `town_hall` first after complete; price as above.
  4. `mkt_s4` row: `type: 'shop', level: 4, after: 'f:rankEup', side: true`. The price hook multiplies by `stage4Old` when `progress.flags.s4half`. `applyStep` calls `market.setStage(4)` the way stage 2/3 do.
  5. `freePlotFor` (`:272`) and `Tutorial.plotFor` (`:414`) go through `plotRules` (BP-7).
  6. Villages with `progress.flags.s4half` get the `mkt_s4` side row in the goal window and in `Tutorial.v42Goal`'s after-읍 branch, with no banner (BP-16).
  7. The office card, side rows and goal-window events go out on the B0 bus (BP-25).
- **Depends on:** L1 (plot `after` values, `w_hall` site), L2 (hall site cleared), TX-a (roadmap: TX before the hall comes early). Merges after L2.
- **Acceptance:** new `chief43.mjs`:
  - office card at `zone_mine`, price 400 + 8, hut replaced;
  - staff pads hidden until `f:rankEup`, then shown at today's prices;
  - 직원 tab text;
  - hall pad at `hire_hunter` and 1,200 + 16 + 4;
  - `GOALS` order;
  - bank guard;
  - `mkt_s4` priced at full and at half;
  - an `s4half` village shows the half-price `mkt_s4` side row and no banner;
  - `Tutorial.plotFor` honouring `types`.

  Updated `goals.test.mjs` (17 main steps; the v4.2 building-name list without the office) and `goals.mjs`.
- **Must pass:** `onboarding`, `goals`, `v42`, `v42_guide`, `pilot` / `pilot.test`, `residents` (`hall_clerk` earlier), `ledger.test`, `smoke`, `admin`; G1 `firstsale` 5 seeds; one pacing seed to 80 min as a smoke (hall and 읍 reached); `texbudget` at the ≈ 16 and ≈ 22-min views (BP-29).
- **Size:** ≈ 2.4 d. Browser ≈ 6 h.

### 3.8 WP-H: hall operations (train cash, ceremony at the hall, stage-4 offer)

- **Goal:** B7 and B8, plus the hall's front spots at the new site.
- **Owns:** `src/entities/TownHall.js`, `src/systems/Rank.js`, `src/systems/Growth.js`, new `tools/test/hall43.mjs`, `hallboard.mjs`.
- **With care:** `src/systems/V42.js` `villageTills` (`:29`: one `stn` line, BP-6); strings anchor H.
- **Work:**
  1. `c1.hall.stn` pile and label at the hall (X-5). A Rail `arrive ours` listener: with the hall built and rank < 2, move `min(till, cap − stn)`. Coin float, not a news line (BP-4). The tax pad collects `tax + stn` (BP-6). `TownHall.restore` clamps `stn` to `v4.rent.cap`, never to `taxCap`.
  2. `SPOT` offsets re-checked at (180, 760) with `padvis`: tax, board, boardPad, venue, wedding, rankPad.
  3. Ceremony framing at the new site (`atHall` branch in `Rank.js`) at 360×640 and 412×915.
  4. After the ceremony: a banner offering 「눈꽃마을 시장」 (stage 4) once (`v43.seen.s4offer`). The `mkt_s4` side pad shows (P), and the goal window and navigator point at it.
  5. The carry-pill place name for the pile.
  6. `c1.hall.stn` joins the `ghostcoins` / `ghostsweep` coin census (BP-33).
  7. The offer banner is for live ceremonies only; `s4half` villages get the letter line (N) and the side row (P) instead (BP-16). The offer events go out on the B0 bus.
- **Depends on:** L1 (hall plot), P (hall at complete, `mkt_s4` row). It can be built against an admin-built hall from L1 on. Merges after S in the §4.1 order, or before S if S is late (disjoint files).
- **Acceptance:** new `hall43.mjs`:
  - train cash moves only with the hall built and rank < 2;
  - at the cap the rest stays in the station till;
  - save → reload keeps `stn` above 1,500;
  - from 읍 on the station empties itself as today;
  - 딸랑이 empties `tax + stn`;
  - offer banner once;
  - ceremony shot.

  Updated `hallboard.mjs` (hall position).
- **Must pass:** `v4`, `v42`, `padvis`, `flag` / `flag.test` (the hall pole flag at the new site), `residents`, `carry`, `smoke`, `ghostcoins_matrix` (the `stn` pile counted).
- **Size:** ≈ 1.4 d. Browser ≈ 3 h.

### 3.9 WP-M: shop stage 4

- **Goal:** B6 with X-1, and the sled (X-6).
- **Owns:**
  - `src/entities/Seller.js`, `src/entities/Register.js`;
  - `assets/market/**` (`market_s4` back / front, manifest; sled frame copied onto the s4 page, TX-5);
  - `tools/blender/market_assets.py`, `market_pack.py`;
  - `tools/test/market43.mjs`, `clerk_view.mjs`, new `tools/test/shots_v43.mjs`.
- **With care:** `world.js` `market` and `trade` blocks (`:143-216`) and `pads.mkt_s4`; strings anchor M (「눈꽃마을 시장」, counter names); `ghostsweep_art.json` and `assets/_packed/**` (regenerate after rebasing on TX-a).
- **Work:**
  1. Art first, in the background, from day 1. Low Blender samples; never while a bot run holds the browser.
  2. Code:
     - `SHOP_STAGE_MAX` 4;
     - `SHOP_COUNTERS[4]` = 자재 · 생선 · 고기;
     - a second merchant spot at 자재 (open only while two people stand at 자재 registers);
     - `shelfMax` 80, `spawnMul` 1.2;
     - rack stacks re-sized (`Seller.js:1017, :1148`);
     - stage-4 layout inside `reserve4`.
  3. Sled parked per X-6, or hidden.
- **Depends on:** B0 keys, P's `mkt_s4` row (until then an admin `setStage(4)` hook), TX-a (page rule, `_packed` regen). Merges after H.
- **Acceptance:**
  - `market43.mjs` stage-4 rows: transition, three lines, second merchant spot, `spawnMul`, half price;
  - `clerk_view` (clerk ≥ 75 % visible with the front customer);
  - `padvis` per stage 1–4;
  - `shots_v43.mjs` (G6: 360×640 and 412×915, day / night, ko / en, stages 1–4, bakery stall and right HUD column in frame);
  - `review_robust_drawcalls` (G7) on the stage-4 plaza;
  - `v43_layout --only merchant` incl. the second spot (G4, reported separately);
  - a reload at stage 4 keeps 80 per kind (`restore` runs after `progress.init` has set stage 4);
  - `texbudget` full-v4 and the stage-4 plaza view (BP-29).
- **Must pass:** `ghostsweep`, `bakery`, `deck` (sled), `carry` (counter names), `smoke`, G1 `firstsale` if the sled spot is within ≈ 6 m of the deck or stall.
- **Size:** ≈ 2.5 d (art 0.75 in the pipeline). Browser ≈ 6 h.

### 3.10 WP-N: 「마을 새 단장」 letter and tour

- **Goal:** B17.
- **Owns:** `src/systems/v43/Renewal43.js`, `src/scenes/OnboardOverlay.js` (3-tap tour), new `tools/test/renewal43.mjs`.
- **With care:** `src/flag/VillageFlags.js` (its one-time card waits while the letter is open); strings anchor N.
- **Work:**
  1. A standalone card (BP-5) on a remapped load only (`info.remapped`, `!v43.seen.letter43`). It is built from `refunds43`:
     - moved workshops;
     - coins and materials back;
     - the `h43_2` shift;
     - the D21 thank-you for a finished hall / office;
     - for `s4half` villages, 「4단 「눈꽃마을 시장」을 반값에 지을 수 있어요」 (BP-16);
     - the bakery note folded in, by clearing `progress.bakeryMovedNow` in the hook so the banner at `Game.js:281` does not fire.
  2. 「새 지도 보기」: three taps (hall and office → work district → 한마당 green and shop) with the finger overlay.
  3. Order on load: letter → flag card → nothing else. A new game shows nothing.
- **Depends on:** S (`refunds43`, `seen`, `remapped`), L2 (place names), P (office copy). Merges after M.
- **Acceptance:** `renewal43.mjs` on `v43a3_late` and `v4202_46min_admin`:
  - the letter shows once (not after a second reload);
  - its numbers equal `refunds43`;
  - an `s4half` village's letter carries the half-price line;
  - the letter and tour events reach the B0 bus;
  - the tour finishes and can be skipped;
  - the flag card comes after it;
  - no letter in a new game;
  - a 360×640 shot that clears the right HUD column.
- **Must pass:** `onboarding`, `flag`, `bakery` (banner), `smoke`.
- **Size:** ≈ 1 d. Browser ≈ 2 h.

### 3.11 WP-BAL: balance, pacing and the bot gates (BAL-a early, BAL-b late)

- **Goal:** B9 (re-tune), B18, G1–G4 and G2's regression fix.
- **Owns:** `balance.js` / `balanceCheck.js` values (after B0); `tools/test/econ/**`, `review_gameplay_sim.mjs`, `review_gameplay_census.mjs`; `meatcan.mjs`, `cans.test.mjs`, `lgx_l0.mjs` thresholds; `docs/build_reports/v43_stepB/` (gate tables).
- **BAL-a (≈ 0.5 d, right after W0):** bring a3.1's village complete back to ≤ 21.0 / 21.17. Knobs, in order:
  1. the bakery stall's `spawnEvery`;
  2. `bld_bakery`'s price;
  3. the first-house prices or the smart bot's side-goal policy.

  Values only, in the bakery and houses blocks. Measure 3 pacing seeds and 5 fresh25 seeds. Merges first, so every later bot number is measured on fixed pacing. Each knob trial costs ≈ 3 browser-hours; if BAL-a needs more than two, L1 merges first (disjoint files).
- **BAL-b (≈ 2–2.5 d, after M):**
  1. Re-measure every walk on the merged tree, with the bakery till in the coin round.
  2. Teach the bots the hall goal, the office side policy (never ahead of `zone_mine` / `zone_hunt` main goals) and stage 4.
  3. 읍 ±5 % with D3, the early hall and train cash. Knobs: hall tax per person, then the office price.
  4. Meat-can `padMax`, `farPx`, `farAt`, `loadMin`, `jamExport` on the `d_cannery` → `d_store` distance.
  5. Stage-4 numbers.
  6. G1–G4 runs.
- **Depends on:** W0 (BAL-a); L, P, H, M merged (BAL-b).
- **Acceptance:** G1–G4 at the §5 lines with the BP-28 statistics; `balanceCheck` ranges; per-step income bands (`econ/fresh_an.mjs`). G4 and the meat-can numbers come from fixtures loaded through the real remap, never `asStepB` (BP-21). The walk table (measured on both layouts: the coin round incl. the bakery till, oven → shop, meat rack → cannery, cannery → store, the chief's ore / meat loops; plan §4.6) goes into the release pack.
- **Must pass:** `meatcan`, `cans.test`, `lgx_l0`, `market43`, `goals`, `onboarding`.
- **Size:** ≈ 3 d. Browser ≈ 14 h (bots).

### 3.12 WP-P1: opt-in play log (cut line → v4.4)

- **Goal:** B16 per decisions §9.
- **Owns:** `src/systems/v43/PlayLog.js`, `src/data/version.js` (`FLAGS.playlog`), `tools/apk/**` and `tools/build/build_artifact.mjs` (flag per profile), new `tools/test/playlog.mjs`.
- **With care** (all after the other merges):
  - `UI.js` settings row 「놀이 기록 (테스터용)」;
  - `MovePanel.js` (refuses `SNOWLOG1`; the log screen refuses `SNOWBLOOM`);
  - no edits in other packages' files: P1 subscribes to the B0 bus and polls joystick / 관망 seconds from its own update (BP-25).
- **Work:**
  - Records to `x.log` (≤ 512 B, trimmed oldest first), only when the player turned it on.
  - The migration result is read at export time from `v43.src` and `refunds43` in the save (BP-23), so a village migrated before P1 was turned on still reports it.
  - Fields: day *n*, session minutes, milestone play-minutes, 읍 seen, control seconds, card / goal-window counts, migration result, `VERSION`.
  - Never: chat, names, flag design, device data, coins, item lists.
  - The export screen shows the decoded fields in Korean.
- **Depends on:** everything else merged (it is last by design).
- **Acceptance:** `playlog.mjs`:
  - export → import round trip;
  - each code kind refused by the other screen;
  - off by default;
  - with the production flag the row is hidden and nothing is recorded;
  - `x.log` over its cap is trimmed, never the save.

  A request recorder in `playlog.mjs` (boot, 2 min of play, the export screen): every URL same-origin, `data:` or `blob:`. `review_robust_netcheck` still shows no failed request. The APK's `remote_refs` host list goes into the release pack (BP-24).
- **Must pass:** `save_v43 --node` (`x` rules), `smoke`, `admin`.
- **Size:** ≈ 1.75 d. Browser ≈ 2 h. E5 (Play's data-safety wording) is checked before any Play-track AAB carries the flag on (decisions §9).

### 3.13 INT: integration, previews, release pack

- **Owns:** `local/v43-b`, merges, `VERSION` labels (b1, b2, 4.3.0), preview APK / AAB builds, the release-review pack (`docs/build_reports/v43_stepB/`).
- **Merge checklist (every merge):**
  1. The package is rebased on `local/v43-b`, with generated files regenerated (BP-3).
  2. All Node tests pass.
  3. The package's acceptance set passes.
  4. Merge smoke: `smoke`, `padvis`, `onboarding` (seed 1), `goals`; `save_v43 --node` once S is in.
  5. Logs go to `scratchpad/v43/stepB/merge/<n>_<pkg>/`.
  6. `git merge --no-ff`; tag `v43b-m<n>`.
- **Release (BP-30):** internal track → 대표's phone → closed track. Preview codes ≥ 4307, AAB codes ≥ 4315. The Play 「새로운 기능」 text and the tester notice are rewritten for the v4.3 scope (no step C), with the 「예전 마을을 열어 보세요」 ask and the update-before-codes line.
- **Korean summary:** refresh `scratchpad/v43/stepB/요약.md` with the critique's player-visible changes (the half-price line for 읍 villages, BP-16) before b1.
- **Size:** ≈ 1.5 d spread over the merges, plus the final run (§6) and the BP-30 texts.

---

## 4. Integration order and schedule

### 4.1 Merge order

| # | Merge | Why here |
|---|---|---|
| 0 | B0 (+ W0 numbers) | Contracts; the baseline is measured on the untouched a3.1 tree |
| 1 | BAL-a | Every later bot number then measures on the fixed pacing |
| 2 | L1 | Plot ids become real for S, P, H, TX |
| 3 | TX-a | Roadmap: TX before stage 4 and before the hall comes early. Its Game.js region (`:405-470`) follows L1's carve-outs |
| 4 | L2 | Hall site cleared before P; Game.js `unlockV3` after TX-a |
| 5 | P | Needs L1, L2 and TX-a |
| 6 | S | Needs L1's plots (`check43b`), L2's cleared hall site (browser B1) and P's hall price (exact refunds); the last Game.js edit (BP-13) |
| 7 | H | Needs the hall at complete and `mkt_s4` (P) |
| 8 | M | Needs TX-a, P's row and H's offer |
| 9 | N | Needs S, L2 and P's copy. → **preview `v4.3.0-b1`** (BP-11) |
| 10 | BAL-b | Tunes on the full feature set |
| 11 | TX-b | Final texture gate on the finished scenario |
| 12 | P1 | Cut line: only if 0–11 pass their gates in time |
| 13 | Final run (§6) → **`v4.3.0-b2`** → release review → `4.3.0` | |

Swaps are allowed only between packages whose files are disjoint after the carve-outs (for example H before S if S is late, or L1 before BAL-a if the knob runs take longer). The rebase-and-re-run rule still applies.

### 4.2 Calendar sketch (working days; three builders A / B / C plus the browser lane)

| Days | A | B | C | Browser lane |
|---|---|---|---|---|
| 0–0.75 | B0 | set up `b_save_wt`, read maps | set up `b_tx_wt` and `b_w0_wt` | W0 in `b_w0_wt` (≈ 7 h) |
| 0.75–2.25 | L1 (merge ≈ 2.25) | S1–S3 (Node) | BAL-a (knobs) → TX-a | W0 end, BAL-a pacing, L1 probes / padvis |
| 2.25–4.5 | L2 (merge ≈ 4.5) | S4–S5 (remap on real ids; fixtures from `38c233c`, `920ddf1`, `977f02e` and a3.1) | TX-a merge (≈ 2.75) → P | S fixture runs, TX-a checks, L2 suites |
| 4.5–6 | M code (art in the background since day 1) | S6 tests + the audit's suite updates → S merge (≈ 5.75, after P) | P merge (≈ 5) → H | P suites + the 16 / 22-min texbudget, S suites |
| 6–8 | M merge (≈ 7) | N (≈ 6.5–7.75) | H merge (≈ 6.5) → TX-b (from ≈ 7) | M suites + the stage-4 texbudget, G6 / G7, N |
| 8–10 | BAL-b tuning and bots | INT b1 build (≈ 8); G8 + fixes | TX-b (to ≈ 9.5, two full runs) | bots (≈ 14 h), TX-b runs |
| 10–12.5 | P1 (or cut) | final-run fixes | release pack, BP-30 texts | G5 full, texbudget ×2, soak |

**Checkpoint at ≈ day 8 (b1, after N):**
- If BAL-b and TX-b cannot finish by ≈ day 10.5, cut P1 (§8 tier 1).
- If M is not merged by ≈ day 8.5, open the tier-3 talk with the 대표.

### 4.3 Browser budget (≈ 61 h)

| Item | Hours |
|---|---|
| W0 | 7 |
| L | 6 |
| S | 10 |
| TX | 9 |
| P | 6 |
| H | 3 |
| M | 6 |
| N | 2 |
| BAL | 14 |
| P1 | 2.5 |
| Final G5 / G8 / TX run | ≈ 10 |
| **Total** | **≈ 76 h listed** |

Overlap with Node-only work, and the final run reusing BAL-b's bot runs, bring the wall time to ≈ 61 h.

Long bot runs (pacing 80 min × 3, fresh25 × 5) are queued for the hours when the builders do Node work.

### 4.4 Review stops

- **Mid preview** (`v4.3.0-b1`, separate preview package, on the 대표's phone) with `decisions.md` §13 and the refreshed `요약.md` (the Korean 쉬운 계획서 of roadmap principle 4).
- From b1 on, the layout is frozen (BP-14).
- At that preview, ask once more for the 대표's Play village code (PQ4). It is not release-blocking, because the failure path keeps any stored save byte-identical.
- An overturned line reopens only its owner package (§1 tables).
- **Release review:** every gate's number (including the G1 waiver and G2's result), phone shots, what changed against `engineering_plan.md` §3 Step B and against this plan.

---

## 5. Gates

| Gate | Pass line (adopted) | Tool | Owner / when |
|---|---|---|---|
| G1 | Smart bot first sale, 5-seed median ≤ **21.82 s** (hard; M0 was a median, BP-28). Onboarding bot: 5-seed median ≤ **16.1 s**, every seed ≤ **16.3 s** (ratchet; waiver recorded) | `v43_layout.mjs --only firstsale --seeds 5` | BAL; L / M / P whenever they touch within ≈ 6 m of deck, grill or stall; final |
| G2 | Village complete, median ≤ **21.0** (pacing, 3 seeds) and ≤ **21.17** (fresh25, 5 seeds). 읍 3-seed median in **42.1–46.5** min, every seed reported (BP-28). Office ≈ 16 (when bought) and hall (≈ 22) reported | `review_gameplay_sim.mjs`, `review_gameplay_census.mjs` | BAL-a (complete), BAL-b (all) |
| G3 | fresh25 and pacing bots green; per-step income bands hold, with the hall ≈ 22 min earlier and 1,200 cheaper, staff after 읍, train cash and the bakery stream | census + `econ/fresh_an.mjs` | BAL-b |
| G4 | `lgx_l0` 27/27; merchant ≥ **48.0** (25-min save) / **59.2** (46-min save) items a min; ceiling ≥ **164 / 212**; stage-4 second spot measured and reported | `lgx_l0.mjs`, `v43_layout --only merchant` | M, BAL-b |
| G5 | Suites: `padvis` per stage 1–4, `onboarding`, `save_v43`, `stuck`, `nav`, `smoke`, `v42`, `plots`, `restaurant`, `transfer`, `meatcan`, `cans.test`, `ledger.test`, depot tests, `ghostsweep`, `texbudget`; plus the a3 suites `bakery`, `goals` / `goals.test`, `residents` / `residents.test`, `flag` / `flag.test`, `carry`, `watchpan`, `perf_presets`, `pilot` / `pilot.test`, `market43`, `deck`; plus `v43_layout --only layout` (v2 probes, reserve) and the new `chief43`, `hall43`, `renewal43`, `residency.test`, `playlog`. The final run also takes every suite named in any package's acceptance or must-pass list (`save_v2/v3/v35/v4/v42`, `review_robust_save(_fast)`, `review_robust_restart`, `admin`, `v4`, `v42_guide`, `labour`, `store42`, `hallboard`, `clerk_view`, `walls42.test`, `roadnet.test`, `porters42`, `dockporter`, `ghostcoins_matrix`) | `lane_b.sh` | each package (subset); INT (full) |
| G6 | 360×640 and 412×915 plaza shots, day / night, ko / en, stages 1–4: three lines, labels, signboards, pads, no overlap; clerk ≥ 75 % visible with the front customer; bakery stall, queue and right HUD column in frame; letter, failure card and offer banner clear the HUD | `shots_v43.mjs` + package shots | M, N, S; INT |
| G7 | Plaza draw calls and display objects with three lines, two merchants, the bakery queue and flag poles; 10-min soak without growth (`Residency.loads` / `evictions` steady) | `review_robust_drawcalls.mjs`, `review_robust_soak.mjs` | M, TX; INT |
| G8 | Forced throw and failed `check43` on **every** fixture (4.2.0.2 ×3, 4.2.1, a1, a2, a2.2, a3.1 ×2, v35, v41, v42, swap, reprice): `SAVE_KEY` byte-identical for 60 s, the card shows, `Transfer` rejects with `migrateFail` | `save_v43.mjs` B2 / B3 | S; INT |
| TX | Every texbudget must ≤ 455 GL incl. transients, all views incl. the new ones; **exit full-v4 GL ≤ 445**, worst view over two full runs (BP-28); checkpoints at P and M (BP-29); full-HD runs reported only | `texbudget.mjs`, `watchpan.mjs` | TX-a, TX-b |
| Roadmap extras | 4.2.0.2 fixtures load; the a2 / a3 fixture remaps once and the second load is a no-op; `lv` 46 / `v` 9 refused and stored value untouched; F0 fuzz byte-identical; size at caps < 24 KB (warn > 16 KB); same-level pass-through; P1 round trip, no outbound request (same-origin recorder, BP-24), off in production; b1 villages load in b2 / 4.3.0 with no remap (BP-14) | `save_v43.mjs`, `playlog.mjs` (request recorder), `review_robust_netcheck.mjs` | S, P1 |

---

## 6. Final verification list (on `local/v43-b` after merge 12, before `b2`)

1. All Node checks:
   - every `*.test.mjs`;
   - `save_v43.mjs --node`;
   - `balanceCheck`;
   - `residency.test`.
2. G8, the `save_v43.mjs` browser B1–B5 on every fixture. B1 asserts every restored site is shown (BP-17); the failure card's code reads back to the stored village (BP-15). Include a manual look at the failure card and the newer card at 360×640.
3. Roadmap extra save gates (§5 last row), with the size printout at caps.
4. G5 full suite list through `lane_b.sh`, one browser, logs in `scratchpad/v43/stepB/final/`.
5. G1, 5 seeds × 2 bots. G2, pacing ×3 + fresh25 ×5. G3 bands. G4 (`lgx_l0`, merchant, the second spot).
6. TX:
   - full `texbudget` with every new view;
   - `watchpan`;
   - report-only full-HD runs;
   - `texbudget_v43.json` committed.
7. G6 shots, G7 draw calls and the 10-min soak.
8. Layout: `v43_layout --only layout` (0 overlaps, reserve empty, branch-shop candidates free) and `padvis` per stage.
9. Old villages end to end:
   - boot each fixture;
   - buildings on `d_*`, hall on `w_hall`, restaurant on `w_rest`, nothing on `w_civic` / `d_school` / `d_clinic` / `d_labour`;
   - letter once, then the flag card;
   - coin and item census equal after refunds;
   - `pre43` present and never in a code;
   - `s4half` villages: the letter's half-price line and the `mkt_s4` side row (BP-16);
   - the b1 fixture loads with no remap (BP-14).
10. New game: no letter; office card at `zone_mine`; staff pads hidden until 읍; hall pad at `hire_hunter`; train cash into the pile; ceremony at the hall; offer banner; stage 4 buys and opens.
11. Codes:
    - a3.1 build (`hud_wt` tree) refuses a step-B code as 'newer' (`CODE_FMT` 2);
    - a step-B build reads a3.1 and 4.2.0.2 codes;
    - `SNOWLOG1` and `SNOWBLOOM` codes are kept apart.
12. Guardrail diff: no edits under `src/{story,missions,bank,harbor,beach,city}/**`; `vehicles/layout.js` only `p:hall` / `p:mail_east`; depot files untouched.
13. Builds:
    - the preview APK (separate package) boots with no outbound request (the BP-24 recorder on the built artifact; no tool named `apkboot` exists);
    - P1 flag on in the preview APK;
    - Play-track AABs built with P1 off until E5 is checked;
    - version label `v4.3.0-b2`; preview code ≥ 4307, AAB code ≥ 4315 (BP-30).
14. Release pack in `docs/build_reports/v43_stepB/`:
    - gate table;
    - G1 waiver note;
    - G2 result;
    - TX table;
    - fixture list (and whether the 대표's village was tested);
    - what changed against the plan;
   - the walk table (BAL-b) and the APK `remote_refs` host list (BP-24);
   - the v4.3 「새로운 기능」 text and tester notice (BP-30).

---

## 7. Risks

| # | Risk | Mitigation | Owner |
|---|---|---|---|
| R1 | The remap damages tester villages: 63 Play testers on 4.2.0.2, AAB 4313 / 4314 testers, preview villages | `pre43` copy; `check43` / `check43b`; writes held until restore has no skip; failure card instead of quarantine; G8 on every fixture; ask again for the 대표's village code | S |
| R2 | Plot candidates fail the probes: `d_store` ≈ (1700, 1030), `d_tool` west, the reserve's edge at `zone_hunt`, the `h43_2` shift, hall-site leftovers | L1 probes on day 1, before rows are written; fallbacks in S-N2 / S-N3; ids are fixed, so S never waits on positions | L |
| R3 | TX side effects: T-2 swap pop-in or upload churn; an evicted core page blanks a user outside its rect; a boot page is never fetched again | T-3b moves the outside frames; T-3f re-queue; UI-shown pages guarded; soak counts loads; `watchpan` and the round-trip suites | TX |
| R4 | G2 regression not fixed by the bakery knobs; 읍 drifts outside ±5 % with D3, the early hall and train cash | BAL-a first; knobs in a fixed order; if still over at the release review, the review shows the number (no silent re-base) | BAL |
| R5 | The single browser lane is the bottleneck (4 CPUs) | Node-first tests; per-package browser budgets (§4.3); long bot runs during Node work; the art pipeline never during bot runs | INT |
| R6 | Merge conflicts in hot files | B0 anchors and contracts; one owner per hot file; fixed merge order; regenerate generated files | INT |
| R7 | Test churn: every suite that injects a markerless save is now remapped | `asStepB()` helper from B0; S updates the map_save §6.2 list; L rewrites the layout suites | S, L |
| R8 | Save size headroom ≈ 0.8 KB at caps | Size gate in `save_v43`; trim `x.log` and `x.mail` first; plaza `fest` not budgeted (X-12) | S |
| R9 | a3 / a3.1 (Play) and older previews cannot be patched; a step-B code pasted into them | `CODE_FMT` 2 makes them answer 'newer'; a release note tells testers to update before using codes | S, INT |
| R10 | Full-HD phones on 고사양 sit above 455 GL (≈ 482 at the station today, estimated) | T-1 trims to the real render-target size; report-only runs; no preset change in v4.3 (TXD-4) | TX |
| R11 | Stage-4 art (Blender) competes with bot runs for CPU | Art from day 1 at low samples, scheduled outside bot runs; three-counter art is smaller than the old plan | M |
| R12 | The 대표 overturns a line at b1 (for example the G1 waiver, wanting the grill moved) | Each ★ / default row names its owner package; a grill move reopens L2 and G1 only | INT |
| R13 | P1 and Play data safety (E5) not checked in time | Play-track AABs ship with the flag off; P1 is the tier-1 cut | P1 |
| R14 | The reserve and hidden plots get built on later by accident | `v43_layout` reserve check in G5; hidden plots carry a non-building `only` | L |
| R15 | The 큰길 pulls RoadPaint's 13.05 MiB set into the village | TXD-3: Ground painter in the village; `texbudget` village views would show +13 at once | L, TX |
| R16 | Play villages come in more shapes than the maps listed: a2–a2.2 (4310–4312) and 4.2.1 (4022) | Real a2.2 and 4.2.1 fixtures; G8 on both (BP-22) | S |
| R17 | The 대표's b1 village has `lay: 2`, so later builds never remap it | Layout freeze from b1; a lay-3 step for any structural change; the `v43b1_village` check (BP-14) | S, L, BAL |
| R18 | A suite measures the wrong layout: `asStepB` on a G4 or meat-can suite keeps the workshops on the old plots | B0 audit tags each suite; G4 and meat cans only through the real remap (BP-21) | S, BAL |
| R19 | The roadmap's "no outbound request" test does not exist (`review_robust_netcheck` lists failed requests only) | Same-origin request recorder in `playlog.mjs` (BP-24) | P1 |
| R20 | Texture surprises found late: stage 4 and the early hall were first measured at TX-b (≈ day 9) | Checkpoints at P and M; two full runs at the exit (BP-28, BP-29) | TX |

---

## 8. Cut line

v4.3.1 is retired (Q1 ★). A cut item goes to a `4.3.0.x` build **only** if it changes no save shape, no plot id or position and no layout, and passes the G5 subset; otherwise it goes to v4.4 (BP-8). A cut never removes a save key that step B writes, so v4.4 needs no second remap.

| Tier | When | What moves | Where | Note |
|---|---|---|---|---|
| 1 (planned) | At the day-7 checkpoint, if BAL-b + TX-b cannot finish by ≈ day 10 | P1 play log | v4.4 | Roadmap cut line. `x.log` stays in the cap table, so v4.4 adds P1 with no save change |
| 2 (polish) | Any time after b1 | T-6 effects on demand; report-only full-HD runs; ChiefPilot hut-desk office spot; sled re-park (stays hidden); the 3-tap tour (the letter stays) | `4.3.0.x` or v4.4 | No save or layout change |
| 3 (scope; only with the 대표's OK at b1) | If M or H is not merged by ≈ day 8 | (a) station cash by train: the `c1.hall.stn` keep-rule stays and v4.4's F12a 세금 날 replaces the capped tax box anyway; (b) shop stage 4 (`mkt_s4`, art, offer banner): the remap still writes `s4half`, so v4.4 honours the half price; this also frees ≈ 0.8–2 MiB of texture room | v4.4 | Both are post-hall / post-읍 features; v4.4 is the 읍 version |
| Never cut | — | F0, F0s, R43, the failure path and fixtures (G8); plot table v2 and the remap (D6 / D19, Q25, 광장 1); the hall move, unlock and price (D2); office side + staff after 읍 (D3 / D16); TX-a; the G2 fix; the meat-can re-measure; the 「마을 새 단장」 letter (without it, old villages see buildings move with no word); the Settings 「새 단장 전 마을」 entry (designer doc §12 item 1, BP-34) | — | Without these, step B is not step B |

---

## 9. Step-B items → packages

| Item (map_scope §2) | Package(s) |
|---|---|
| B1 fixed plots, plot table v2, Q25, 광장 1, labour plot | L1 (+ P call sites through `plotRules`) |
| B2 roads, 큰길, decor, conflicts | L2 |
| B3 office side goal | L1 (`after`), P |
| B4 staff after 읍 | P |
| B5 hall at village complete | L1 (plot), L2 (site, decor call), P (unlock, order, price), H (spots) |
| B6 stage 4 | M (+ P row, TX page rule, B0 keys) |
| B7 ceremony at the hall + offer | H |
| B8 station cash by train | H (+ B0 keep-rule) |
| B9 meat-can re-tune | L1 (`d_cannery.pads`), BAL-b |
| B10 depot stays | S (never touched; tested) |
| B11 save shape | S (+ B0 minimal `v43`) |
| B12 R43, `keepPre43`, `check43`, failure card, Transfer | S |
| B13 F0 | S |
| B14 F0s | S |
| B15 TX | TX-a, TX-b |
| B16 P1 | P1 |
| B17 letter, tour, strings | N (+ each package's string anchor) |
| B18 walk targets and balance | BAL-a, BAL-b |
| B19 gates | BAL, INT |

---

## 10. Not verified

- **Nothing was built or run for this plan.** Every number comes from the four maps:
  - positions are coordinate arithmetic until `v43_layout --probe` and `padvis` pass;
  - G1 / G2 numbers are from the 2026-11-07 runs and the bakery report;
  - texture numbers are from the a3 run of 2026-11-11 plus page arithmetic.
- **Code facts checked only for this plan:**
  - `OfficePanel.js:24` gates the 소식 / 편지 tabs on 소복이 (basis of BP-4, BP-5);
  - `V42.js:29` lists the hall tax as a till (BP-6);
  - `Rail.js:142, :324` emit `arrive ours`;
  - `Progression.js:27, :440` read the shop step price from `market43['stage' + level]`, so `mkt_s4` needs only the half-price hook;
  - `Game.js:415, :466` list `bld_buildings` and the market pages in the lazy priority lists, and `:428-433` gate `market_s[2-9]`;
  - `TownHall.js:26` `SPOT` values are offsets from the plot centre.
- **Checked by the critique:** `Assets.queueLazy` (`Assets.js:505-513`) only filters manifest entries by key, so a `market_s4` key with no art yet queues nothing and does not throw. The `mkt_s4` / `rankEup` rule stays as a guard. The other facts the critique checked are listed in §11.
- **Effort and browser hours** are estimates (± 30 %, as in the roadmap). The calendar assumes three builders and one browser on the shared 4-CPU machine.

---

## 11. Critique applied (2026-11-11)

A completeness pass over this plan against roadmap §4.1 / §5–§7, `engineering_plan.md` §3–§8, `기획서_마을새단장.md` §12–§14, the four input maps, and the a3.1 code (`hud_wt`, read only). The new choices are BP-13 … BP-34 (§1.4). The edits to the plan body are listed here by section.

### 11.1 What was wrong or missing, and what changed

| # | Finding | Change (where) |
|---|---|---|
| C1 | **Merge order contradicted the calendar and a real dependency.** §4.1 merged S before L2 and P, but the calendar merged P (≈ 5) before S (≈ 5.5). S's exact-refund checks need P's new hall price (`NEW43` reads `BALANCE.buildings.town_hall`). | Order is now BAL-a → L1 → TX-a → L2 → P → S → H → M → N → BAL-b → TX-b → P1 (BP-13). Changed in §0, §3.1 Game.js row, §3.5, §3.8, §4.1 and §4.2 |
| C2 | **Save populations undercounted.** `play_release.json` shows a2 (4310), a2.1 (4311) and a2.2 (4312) on Play's closed track, and 4.2.1 uploaded as 4022. The plan named only a3 / a3.1. Also, AAB 4314 was built from `12d598f`, not `e28089a`. | Header and §1.1 Q6 corrected. New fixtures: a real a2.2 village and a 4.2.1 meat-can village. Both are added to G8 (BP-22, §3.5, §5, R16) |
| C3 | **The designer's b1 village would never be remapped again.** It carries `lay: 2`, so any change after b1 to plot ids, `only` or prices is silently skipped for it. | Layout freeze from b1, a lay-3 step for any structural change, and a `v43b1_village` continuity fixture (BP-14, §4.4, §5, R17) |
| C4 | **The failure card could export the wrong village.** `PRE43_KEY` is write-once, so after an import it may hold an older village. | 「코드 복사」 exports the current stored keys; the Settings entry lists each `pre43` slot (BP-15) |
| C5 | **Old villages already at 읍 never got the stage-4 offer.** The only path was the ceremony banner, but `s4half` villages never see a ceremony again (designer doc §12 item 7). | A letter line (N) and a `mkt_s4` side row (P), with no banner (BP-16; §3.7, §3.8, §3.10, §6) |
| C6 | **A restored building can be hidden.** `refreshSites` calls `setShown(false)` on any plot site whose `after` / region is not met. **Hidden plots would also appear:** `buildV3` makes a `Site` for every `WORLD.plots` id, so `d_labour` would show at 읍. | B0 skips hidden plots in `buildV3`. L1 makes `refreshSites` never hide a built site. S's B1 asserts that every restored site is shown (BP-17, BP-19) |
| C7 | **Hall-site clean-up ran only on a live build.** A finished hall in an old village is restored instantly, so it would stand on trees and the trash pad. | Clear when `w_hall` shows and on every build, including the instant restore (BP-18; L2 carve-out in `Office.js:432-433`) |
| C8 | **Only `d_cannery` had `pads` offsets,** but hire pads come from the plot's `pads` (`Game.plotPad`). The store's customer line at `d_store` was not planned either. | `pads` on every `d_*` plot; the store line faces east, clear of the bakery and the 큰길 (BP-20, L1 item 6) |
| C9 | **Test churn underestimated.** 58 suites inject saves and 37 load fixtures. The `save_v3` / `save_v35` browser parts assert `e_m1` / `e_m2`. `asStepB` on `lgx_l0` / `meatcan` would measure G4 on the old layout. | B0 suite audit with `asStepB` / `remap` / `rewrite` tags. G4 and meat cans only through the real remap (BP-21; §3.5 S6, §3.11, R18) |
| C10 | **Fixture contamination.** A fixture exported from `local/v43-b` after B0 carries `lay: 2`. W0 was also planned in the worktree that B0 is editing. | Fixtures and W0 run in a detached `b_w0_wt` at `e28089a`. `make_v43.mjs` refuses `v43` / `lv` in pre-B fixtures (BP-22, BP-27) |
| C11 | **P1 could never report the migration result.** The remap runs at first launch, and P1 records nothing while off. | `v43.src` is stored beside `refunds43`; P1 reads both at export time (BP-23; §2 Save row, §3.12) |
| C12 | **The "no outbound request" gate had no tool.** `review_robust_netcheck` lists only failed and ≥ 400 requests, and `apkboot` does not exist. | Same-origin request recorder in `playlog.mjs`, plus the APK `remote_refs` list in the release pack (BP-24; §3.12, §5, §6, R19) |
| C13 | **Hot-file conflicts not covered by the table:** P1's emits in four other packages' files; card mounting in `UI.js` (S, N); shared test suites edited by L, H, M and S. | B0 adds an event bus and the `UI.js` card stubs. Test-suite owners are listed. New §3.1 row (BP-25, BP-26, BP-32) |
| C14 | **Gate statistics undefined.** M0 baselines are medians, and M0's own 읍 seeds (44.21–50.88) would fail a per-seed ±5 % band. TX exit used one run despite a 3–4 MiB run-to-run spread. | Medians for G1 smart and G2; 읍 as the 3-seed median with every seed reported; TX exit as the worst view of two full runs (BP-28, §5) |
| C15 | **Texture risk measured too late.** Stage 4 and the early hall first met `texbudget` at TX-b (≈ day 9). The new peak views were missing: a remapped late-village first boot, the 3-tap tour, and the 16-min office. | Checkpoints at P's and M's merges; three more TX-b views; a 16-min tour point (BP-29, §3.6, §3.7, §3.9, R20) |
| C16 | **The train-cash pile was not in the coin census,** so `ghostcoins` / `ghostsweep` would report coins as lost. | H adds `stn` to the census (BP-33) |
| C17 | **Release items missing:** the internal → 대표 → closed sequence (roadmap §7), version codes, and the store text. The designer doc's draft 「새로운 기능」 still advertises step C. | INT release bullet; §6 item 13 and 14 (BP-30) |
| C18 | **Designer promise in a cut tier.** The Settings 「새 단장 전 마을」 entry (doc §12 item 1) was cut tier 2. | Moved to never-cut (BP-34, §8) |
| C19 | **Hall front square for v4.6's 시청 scaffold** (decisions §2, E13) was not carried into L1. | BP-31, L1 item 8 |
| C20 | **The roadmap's Korean 쉬운 계획서** was not tied to any review stop. | `요약.md`, refreshed, goes with b1 (§4.4, §3.13) |
| C21 | **`Assets.queueLazy` tolerance** was "not checked". | Checked (§10): an unknown key queues nothing and does not throw |

### 11.2 Numbers that moved

- **Effort:** ≈ 24 (22–26) → **≈ 26 (24–28)** builder-days. The package sizes summed to 24.7 before and 26.4 now. The additions are B0 +0.25, L +0.25, S +0.75 (midpoint), TX +0.05, P +0.15, INT +0.25 = +1.7; N, H and M add rows only.
- **Elapsed:** 11–12 → **12–12.5** working days.
- **Browser:** ≈ 55 → **≈ 61 h** wall (≈ 76 h listed: S +2, TX +3, P +1, M +1, P1 +0.5).
- **b1:** day 7 → **≈ day 8** (b1 follows N, which ends ≈ 7.75).

### 11.3 Facts the critique checked in the a3.1 tree (read only)

- `Progression.js:186` `BUILD_UNLOCK`: toolsmith `r:east`, warehouse `hire_hunter`, cannery `boat_rowboat`, store `b:cannery`. These match the plot `after` values, so no `d_*` plot dead-ends a goal.
- `Progression.js:153-183` `GOALS`: `town_hall` currently sits after `shops:5`.
- `Game.js:1015-1023` `buildV3`: one `Site` per `WORLD.plots` id.
- `Game.js:1040-1055` `refreshSites`: hides built plot sites too.
- `Game.js:1058-1071` `restoreV3`: skips a site silently.
- `Game.js:740-770`: the tree clear spots iterate the plots.
- `Game.js:278` `refreshStoreLine`.
- `Game.js:281`: the bakery banner runs after `:269`, so the N hook can clear `bakeryMovedNow`.
- `Game.plotPad` (`Game.js:1445`). Plot `pads` exist on `e_m2`, `s_m1` and `w_m2` (`world.js:603-622`).
- `Site.js:28-42` `buildCost`: `chief_office` still reads `v42.office.site`.
- `Site.start`: only materials are in `need`, so coins are paid up front and the remap's coin refund is `OLD − NEW`.
- `Office.js:84, 93, 432-433`: the decor clear runs on build, instant restore, and when the plot is shown.
- `UI.js:131-136`: panels are mounted in `UI.create`.
- `Transfer.applyVillage` (`:238-276`) writes the raw code keys and keeps backup-namespace keys.
- `Admin.adminBackup` calls `migrateSave` only in memory.
- `tools/apk/play_release.json`: Play codes 4022 / 4023 / 4024 / 4310–4314; preview codes 4301–4306.
- `review_robust_netcheck.mjs` prints only failed and ≥ 400 requests. No `apkboot` tool exists. `build_apk.py:210` `remote_refs` is a static host scan.
- `docs/build_reports/v43_baseline/report.md`: G1 and G2 baselines are medians.
- `tools/test`: 58 suites call `localStorage.setItem` / write the save key; 37 load fixtures. `save_v3.mjs:122-125` and `save_v35.mjs:116` assert `e_m1` / `e_m2` sites after a browser boot.

### 11.4 Still open after the critique

- Nothing new needs the 대표. Every addition follows the plan's rule (lossless, smallest visible change, no gate loosened).
- `요약.md` was not edited here; it is outside this pass's write scope. INT refreshes it before b1 (§3.13).
- Whether any Play tester still holds a 4.2.1 (4022) or a2.x village was not checked. The fixtures cover the shapes anyway.
