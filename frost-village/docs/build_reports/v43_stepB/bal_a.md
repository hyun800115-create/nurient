# v4.3 step B — BAL-a: village complete back under the M0 line (build_plan §3.11, decisions §8)

- **Tree:** `local/v43-bal` = B0 (`429bf25`) + the BAL-a values below (uncommitted for the integrator). "Before" = W0, a3.1 at `e28089a` measured in the detached `b_w0_wt` (`scratchpad/v43/stepB/w0/w0_table.md`).
- **Tools and statistics (BP-28):** pacing = `review_gameplay_sim.mjs --policy smart --v4 --after 12 --minutes 25 --seed 1..3` (village complete = `hire_hunter` in `fin.events`), 3-seed median; fresh25 = `review_gameplay_census.mjs --minutes 25 --seed 1..5` (`celebrated` row, 10-s steps), 5-seed median. Knob trials passed their values with `--bal` / `--botopts`; the file now holds the same values (§4). Fixed-step clock, one browser under the shared lock.
- **Gate lines (G2, M0 `da1436f`):** village complete ≤ **21.0** (pacing) and ≤ **21.17** (fresh25). G1 must not regress.

## 1. Result

| | M0 | W0 a3.1 | **BAL-a** | gate |
|---|---|---|---|---|
| village complete, pacing (3-seed median) | 20.00 | 21.96 | **20.8 (20.89 · 20.71 · 20.8)** | ≤ 21.0 **pass** |
| the same, re-run from the file (3 seeds) | | | 20.97 (21.12 · 20.97 · 20.91) | ≤ 21.0 pass, thin |
| village complete, fresh25 (5-seed median) | 20.17 | 22.0 | **20.83 (20.83 · 20.67 · 20.83 · 21.5 · 20.67)** | ≤ 21.17 **pass** |
| coins earned by 20 min, fresh25 (median) | 10,798 | 8,769 | 9636 | — |
| G1 first sale, smart bot (5 seeds) | 20.78 s | 21.53 s every seed | **21.53 s every seed** | ≤ 21.82 s, unchanged |
| G1 first sale, onboarding bot (5 seeds) | 15.0 s | 16.4 s every seed | **16.4 s every seed** | unchanged vs W0 (see §5) |

## 2. What changed

| File | Change |
|---|---|
| `src/data/balance.js` `bakery43` | `spawnEvery` 3.2 → **2.2** (knob 1); `spawnEveryLate` 2.6 → **2.2** (kept ≤ the early value, so the stall never gets quieter at village complete); `build.coins` 150 → **70**, planks 4 kept (knob 2: 밀밭 150 + 빵집 70 + 판매원 80 = the old farm zone's 300); `wantMax` 3 → **4** (see §3, the stall's last value). Values and Korean comments only |
| `src/data/balanceCheck.js` | the four fallback defaults follow (2.2, 2.2, 70, 4); ranges unchanged |
| `tools/test/review_gameplay_bot.js` | knob 3, the smart bot's side-goal policy: `opts.side43 'hint'` (default) builds a first house (plots `side43`, `h43_1` / `h43_2`) only when the coins pay for it **without holding up the next main pad** — the game's own hint rule (`Tutorial.house43Hint`) — and reads the plot's own price (`houses43`); `--botopts '{"side43":"old"}'` gives the a3 rule (price + 100 in hand). Every smart-policy bot user (census, sim, `lgx_l0 --fresh`, `v43_layout`, `texbudget --bot`, `reqlog42`, `econ/probe`) gets it; `pilot` runs the arrow-only policy, which never reaches the house rule |
| `tools/test/review_gameplay_census.mjs` | `--bal JSON` (the previous engineer's change, reviewed: same deep merge as `review_gameplay_sim --bal`, applied at the title before the game builds anything, recorded in the output's `args`; values bypass `balanceCheck`, as in the sim) |
| `tools/test/bakery.mjs` | the 빵집 짓기 price check reads `balance.js bakery43.build` instead of a literal 150 |

No game code, layout, art, strings or save shape changed. Houses' prices (`houses43`), the clerk price and every other block are unchanged.

## 3. Knob trials (in the plan's order)

| trial | pacing seeds 1 · 2 · 3 | **pacing median** (≤ 21.0) | fresh25 seeds 1 · 2 · 3 · 4 · 5 | **fresh25 median** (≤ 21.17) | coins by 20 min (median) | stuck · errors |
|---|---|---|---|---|---|---|
| W0 a3.1 (3.2 s, 빵집 150, a3 house rule, wantMax 3) | 22.16 · 21.96 · 21.77 | **21.96** over | 22 · 21.67 · 22 · 22.17 · 21.33 | **22** over | 8769 | 0 · 0 |
| T1 knob 1: spawnEvery 2.2 (seed 1 only) | 21.48 | **21.48** (1 run) | — | **—** (0 runs) | — | 0 · 0 |
| T2 knobs 1 + 2: + 빵집 70 (stopped) | 21.74 · 21.64 | **21.69** (2 runs) | 21.17 | **21.17** (1 run) | 9613 | 0 · 0 |
| T3 knobs 1 + 2 + 3: + first houses wait (stopped) | 21.25 · 20.7 · 21.5 | **21.25** over | 21.33 · 21.17 · 21.17 | **21.17** (3 runs) | 9519 | 0 · 0 |
| **T4** T3 + wantMax 4 (adopted) | 20.89 · 20.71 · 20.8 | **20.8** pass | 20.83 · 20.67 · 20.83 · 21.5 · 20.67 | **20.83** pass | 9636 | 0 · 0 |
| BAL-a from the file (no --bal / --botopts) | 21.12 · 20.97 · 20.91 | **20.97** pass | 20.67 | **20.67** (1 run) | 9803 | 0 · 0 |

Single-seed screens (pacing seed 1, 25 min): 2.2 s → 21.48 · 2.0 s → 21.48 · 1.8 s → 22.16 · 2.0 s + 빵집 70 → 21.35. They were stopped early: a knob value changes how many `Math.random` draws the stall's spawn timer takes, so one seed under two values is as different as two seeds (±0.3 min). Only the full 3 + 5 trials decide.

- **T1 (knob 1).** Not run as a full trial: seed 1 gave 21.48 at 2.2 s and at 2.0 s and 22.16 at 1.8 s, so knob 1 has no more to give below ≈ 2.2 s and T2 / T3 already carry it.
- **T2 (knobs 1 + 2)** stopped after pacing seeds 1 and 2 (21.74, 21.64): the 3-seed median could no longer reach 21.0.
- **T3 (knobs 1 + 2 + 3)** stopped after pacing seed 3: median 21.25 > 21.0. Its fresh25 seeds 1–3 were 21.33 · 21.17 · 21.17. The listed knobs are then used up: 빵집 짓기 at 1 coin instead of 70 is worth ≈ 0.07 min, and the first-house prices matter little once the houses wait for spare coins (`h43_2`, 160 coins, is built after village complete in every T3 / T4 / from-file run; `h43_1`, 80 coins, before it in 7 of 9).
- **T4 = T3 + `bakery43.wantMax` 3 → 4** passes both lines. This is a fourth value in the same bakery block (the plan's rule "values only, in the bakery and houses blocks"), the stall's own demand like knob 1: once more customers stop helping (§4), a customer who may buy up to 4 loaves instead of 3 is the stall value left that raises sales. A shop customer already buys up to 3 + zones / 2 (cap 5), so 4 is inside the game's range. **Deviation from the knob list, recorded for the 대표's mid-preview review.** Not measured: whether `wantMax` 4 with knob 1 alone would pass; from the trials it would not (T4 − T3 ≈ −0.45 min pacing, T2 pacing 21.64–21.74).

## 4. Why these values (seed 1, minutes 13–21, `pace/*.json` samples)

| run | bread on the stall (of 24) · empty | rack (of 36) | coins earned min 13 → 21 |
|---|---|---|---|
| W0 (3.2 s) | 22.7 · 0 % | 24.8 | 5,641 (705 a min) |
| knob 1 (2.2 s) | 22.6 · 0 % | 23.3 | 6,460 (808 a min) |
| screen 2.0 s | 21.6 · 0 % | 22.7 | 6,369 (796 a min) |
| T3 (knobs 1 + 2 + 3) | 21.4 · 0 % | 21.0 | 6,561 (820 a min) |
| T4 (+ wantMax 4) | 22.0 · 0 % | 22.0 | 7,025 (878 a min) |

- The stall was never short of bread in a3.1: from minute 13 the case is full and the rack holds 25 of 36, so it was short of **customers** (demand-limited). More customers (3.2 → 2.2 s) is +100 coins a minute. Faster than 2.2 s added nothing measurable (2.0 s: 796 a min), which points at the line (`maxQueue` 5, not measured directly) as the limit; the next stall lever is then the loaves per customer (`wantMax` 4: +58 a min over T3).
- The bakery stands idle from 빵집 짓기 (≈ 7 min) until the farmer brings wheat (≈ 12.5 min). A cheaper 빵집 brings the baker and the farmer a little earlier; the effect (80 coins at minute 7) is within the run-to-run noise (seed 1: 2.0 s 21.48 → 2.0 s + 70 21.35; T1 21.48 vs T2 21.74).
- a3.1 also earns less than M0 **before** the bakery exists (fresh25 seed 1: 1,456 vs 2,011 coins at 8 min; the step-A shop / deck era). That is not a bakery knob and was not touched.
- **From the file** (no `--bal` / `--botopts`: the values now in `balance.js` and the bot's default), pacing seeds 1–3 and fresh25 seed 1: pacing s1 21.12 · s2 20.97 · s3 20.91 (median 20.97); fresh25 s1 20.67. Same values as T4; the spread (seed 1: 21.12 here, 20.89 in T4) is the run-to-run noise of the boot's real-time moment, so **the pacing margin is thin** (0.03–0.2 min). BAL-b re-measures on the merged tree anyway.
- **Which runs used the final code** (verification, 2026-11-12): the bot file was last changed at 08:10 and `balance.js` at 10:25. T4 pacing s1 / s2 (05:46, 07:45) ran on the earlier bot file (same `--botopts` 'hint'); every other T4 run and all from-file runs came after 08:10, and `--bal` covered all four changed keys. On the final code: pacing 21.12 · 20.97 · 20.91 (from file) and 20.8 (T4 s3), median 20.97 of the from-file three; fresh25 20.67 (file) · 20.67 · 20.83 · 21.5 · 20.67 (T4 s2–s5), median **20.67**.

## 5. G1 and the other checks on BAL-a

- **G1** (`v43_layout.mjs --only firstsale --seeds 5`): smart bot 21.53 s, onboarding bot 16.4 s, **identical to W0 seed by seed** (BAL-a changes nothing before the bakery at ≈ 7 min). Note for the integrator: a3.1's onboarding bot already stands at **16.4 s** in every seed, above the step-B ratchet (5-seed median ≤ 16.1 s, every seed ≤ 16.3 s; decisions §7). That is a W0 finding (a3.1 vs the a3-era 15.8–16.1 s), not a BAL-a regression. (This G1 run, at 09:11, came before the last `balance.js` edit at 10:25; nothing before the bakery at ≈ 7 min reads the changed values.)
- **The onboarding 16.4 s is mostly where the clock starts, not a slower game** (verification): `firstsale.csv` `preroll_s` (the onboarding's own clock when the bot takes the joystick) is **0.03 s in every a3.1 seed**, against 0.24–0.66 s in M0 and 0.25–0.49 s in the a3-era runs. On the onboarding's own clock (`first_sale_s + preroll_s`) a3.1 is 16.43 s every seed; the a3-era runs were 16.15–16.45 s (medians 16.21–16.22, e.g. `scratchpad/v43/{watch/logs,goals,residents/g1b,bakery/code}/g1`); M0 15.52–15.56. So a3.1 always lands on the slow end of the a3 spread, and about 0.3 s of the ratchet miss is the shorter pre-roll. The cause is the a3.1 flag maker: the harness taps through it first (log: "pre-roll 0.03 s, flag maker: 1 tap"), and the onboarding clock does not run behind it, while before it the clock ran ≈ 0.3 s during the boot (log: "pre-roll 0.34 s"). For BAL-b (G1 owner): compare G1 onboarding on `first_sale_s + preroll_s`, or record the pre-roll change with the ratchet.
- `bakery.mjs`: 121 ok, 0 failed (빵집 짓기 70 + 4 planks, stall flow at the new values). Node: all 17 `*.test.mjs` pass; `checkBalance()` gives no warning.
- Verification on the final tree (2026-11-12, `lane_b.sh`): `onboarding` 80 passed, 0 failed; `goals` 54 passed, 0 failed; `market43` 63 ok, 0 failed; the 17 Node tests again all pass.
- Not run on BAL-a (left for BAL-b's must-pass list): `lgx_l0` (the bot default changes only when a first house is built, on its `S` plot; the `--fresh` checks are about the 창고 card and a free `M` plot; W0 a3.1: 27/27), `meatcan`, 80-minute pacing (읍).

## 6. For BAL-b

- 읍 was not tuned here. W0 a3.1: 읍 46.42 (48.15 · 46.42 · 46.18), hall 45.36, office 52.71. BAL-a raises bread income before and after village complete (`spawnEveryLate` 2.6 → 2.2 and `wantMax` 4 also apply after it), so 읍 should come earlier; the bot's first-house rule moves `h43_2`'s move-in ≈ 1 min later.
- If the 대표 rejects `wantMax` 4 at the mid preview, BAL-a falls back to T3 (pacing 21.25, over by 0.25) and the release review shows the number (decisions §8).
- Trial data: `scratchpad/v43/stepB/bal/` (`t1_se22`, `t2_se22b70`, `t3_se22b70hint`, `t4_se22b70w4hint`, `screen`, `final`, `g1`, `suites`; `gates.mjs` prints this table).
