# v4.3 「마을 새 단장」 — M0 baseline (engineering_plan §1.1)

Measured on the untouched main working line **`da1436f`** (v4.2.1 = shipped 4.2.0.2 + meat cans + L0 logistics, `SAVE_VERSION` 8, label v4.2.1), 2026-11-06 03:56–08:30 UTC. No game source was changed; the new files are `tools/test/v43_layout.mjs` and this folder. Every game number below is on the fixed-step 60 fps clock (checked once: 3,600 steps = 60.000 scene seconds, dt exactly 1/60 s), so it does not depend on machine load. The machine ran three agents on 4 CPUs (load 5–8); one browser of mine at a time, `nice -n 10`.

These are the numbers the v4.3 gates (plan §7.3) compare against. Re-run each with the command in §9 on the new code: same tool, same seeds, like with like. Times are bot minutes / seconds of a fresh game unless a save is named.

## 0. Every baseline number

| Measure (gate) | Baseline | Runs · spread | From |
|---|---|---|---|
| First sale, onboarding bot (G1) | **15.0 s** | 5 seeds · 14.9–15.3 s | `v43_layout.mjs --only firstsale` |
| First sale, smart bot (G1) | **20.78 s** | 5 seeds · 20.78–20.78 s (deterministic) | same |
| First coins in the pocket, onboarding / smart | 18.3 / 32.0 s | 16.8–18.7 / 31.5–33.2 s | same |
| Market clerk hired, onboarding / smart | 21.6 / 34.6 s | 20.1–22.0 / 34.1–35.8 s | same |
| Tutorial hand-over (Act 3), onboarding bot | 122.2 s | 120.3–127.8 s | same |
| Village complete, fresh25 census (G2) | **20.17 min** | 5 seeds · 19.83–20.33 | `review_gameplay_census.mjs --minutes 25 --seed 1..5` |
| Coins earned in the first 20 min (fresh25) | **10,798** (540 a min) | 5 seeds · 10,506–11,216 (525–561 a min) | same |
| Village complete, pacing bot (G2) | **20.00 min** | 3 seeds · 19.99–20.66 | `review_gameplay_sim.mjs --v4 --after 12 --seed 1..3` |
| Hall (town_hall) built, pacing (G2) | **43.07 min** | 3 seeds · 41.85–50.02 | `review_gameplay_sim.mjs --v4 --after 12 --seed 1..3` |
| Office (chief_office) built, pacing (G2) | **51.58 min** | 3 seeds · 50.98–52.29 | `review_gameplay_sim.mjs --v4 --after 12 --seed 1..3` |
| 읍 (rankEup), pacing (G2) | **44.30 min** | 3 seeds · 44.21–50.88 | `review_gameplay_sim.mjs --v4 --after 12 --seed 1..3` |
| L0 gates | **27/27 passed** | `--minutes 10 --fresh 5`, one run | `lgx_l0.mjs` |
| L0 throughput, probe L (46-min save, late setup, seed 7): raw porters away · smelter · cannery cans a min · any pile ≥ 90 % | 0 % · 56.1 a min (starved 0 %) · 25.9 · 99 % | one run | `econ/probe.mjs --late` |
| Merchant: items bought a min, 25-min save, smart bot (G4) | **48.0** | 3 runs · 47.8–48.2 | `v43_layout.mjs --only merchant` |
| Merchant: items bought a min, 46-min save, smart bot (G4) | **59.2** | 3 runs · 58.3–60.2 | `v43_layout.mjs --only merchant` |
| Merchant service ceiling, shelf kept full: clerk / chief on the register (G4) | **164 / 212 a min** | 2 saves · 164, 163 / 212, 212 | same |
| Merchant in a fresh game (seed 1): mean items a min, minutes 21–30 / 41–47 | 58.8 / 46.4 | one run, minute values 14–91 / 3–86 | same, `--fresh-min 47` |
| Stall shelf, fish: mean on the shelf · empty share (0–20 min from its first sale; 20–25 min) · max 0–20 | 12.0 · 35 %; 8.4 · 17 % · 40 of 40 | 5 seeds · mean 7.5–13.3; 1.7–16.3 | fresh25 census rows |
| Stall shelf, bread: mean on the shelf · empty share (0–20 min from its first sale; 20–25 min) · max 0–20 | 22.7 · 19 %; 32.3 · 0 % · 40 of 40 | 5 seeds · mean 16.0–29.3; 19.9–36.1 | fresh25 census rows |
| Stall shelf, smoked meat: mean on the shelf · empty share (0–20 min from its first sale; 20–25 min) · max 0–20 | — · — %; 4.1 · 60 % · 0 of 40 | 5 seeds · mean —; 2.1–7.1 | fresh25 census rows |
| padvis | **275 ok, 0 failed** | one run, fresh + 9 late saves + wait rules | `padvis.mjs` |
| Texture budget | 9/12 checks passed (the three misses are the long-standing soft targets); per view in §7 | one run, no `--bot` | `texbudget.mjs` |
| Walk, chief first walk: start → net gather point | **1.42 m** (direct) | route 1.42 · direct 1.42 · straight 1.42 m | `v43_layout.mjs` walks.csv |
| Walk, chief: food register → trade register | **15.18 m** (direct) | route 18.39 · direct 15.18 · straight 13.57 m | `v43_layout.mjs` walks.csv |
| Walk, oven → stall shelf (bread porter) | **13.27 m** (route) | route 13.27 · direct 12.58 · straight 12.58 m | `v43_layout.mjs` walks.csv |
| Walk, meat rack → cannery (cannery on w_m1) | **45.78 m** (route) | route 45.78 · direct 36.02 · straight 35.68 m | `v43_layout.mjs` walks.csv |
| Walk, meat rack → cannery (late save: e_m2) | **62.95 m** (route) | route 62.95 · direct 39.33 · straight 34.34 m | `v43_layout.mjs` walks.csv |
| Walk, cannery → store (w_m1 → w_m2) | **23.51 m** (route) | route 23.51 · direct 14.46 · straight 14.11 m | `v43_layout.mjs` walks.csv |
| Walk, cannery → store (late save: e_m2 → w_m2) | **73.11 m** (route) | route 73.11 · direct 56.66 · straight 55.62 m | `v43_layout.mjs` walks.csv |
| Walk, coin round (§4.6) | **409.36 m** (route) | route 409.36 · direct 274.69 · straight 254.32 m | `v43_layout.mjs` walks.csv |
| Walk, coin round without station cash | **212.55 m** (route) | route 212.55 · direct 156.91 · straight 140.29 m | `v43_layout.mjs` walks.csv |

## 1. Time to first sale (G1: ≤ baseline × 1.05)

Gate values: onboarding **≤ 15.75 s**, smart **≤ 21.82 s** (median × 1.05).

| Bot · seed | first sale | first coins | clerk hired | Act 2 | fisherman hired | hand-over | at the register (step) | walked |
|---|---|---|---|---|---|---|---|---|
| onboarding · 1 | 15.3 s | 18.7 s | 22 s | 29.1 s | 112.1 s | 122.2 s | 15 s | 209.2 m |
| onboarding · 2 | 15.2 s | 18.6 s | 22 s | 29.1 s | 115.7 s | 125.8 s | 14.9 s | 213.3 m |
| onboarding · 3 | 14.9 s | 16.8 s | 20.1 s | 27.2 s | 110.2 s | 120.3 s | 14.6 s | 209.2 m |
| onboarding · 4 | 14.9 s | 18.3 s | 21.6 s | 28.7 s | 111.7 s | 121.8 s | 14.6 s | 209.2 m |
| onboarding · 5 | 15 s | 16.9 s | 20.2 s | 27.3 s | 117.7 s | 127.8 s | 14.7 s | 225.8 m |
| smart · 1 | 20.78 s | 32.22 s | 34.77 s | — | — | — | — | — |
| smart · 2 | 20.78 s | 32.02 s | 34.57 s | — | — | — | — | — |
| smart · 3 | 20.78 s | 31.52 s | 34.07 s | — | — | — | — | — |
| smart · 4 | 20.78 s | 32.03 s | 34.58 s | — | — | — | — | — |
| smart · 5 | 20.78 s | 33.2 s | 35.75 s | — | — | — | — | — |

- **What is measured.** Game seconds from the moment the bot takes the joystick (after the title, the fixed clock on). *First sale* = the first customer pays (the game's `sold` event, which sets `flags.firstSale`); *first coins* = `economy.earned` > 0 (the chief picked up the cash pad). The onboarding run starts with `window.__FV_ONBOARD = true` at 412×915 (the tutorial is on); its pre-roll before the bot (scene time already run) was 0.24–0.66 s. The smart bot runs without the tutorial (an automated browser never gets it), 360×720, as the census does.
- **The onboarding bot** is `onboarding.mjs`'s bot (walk to the Act 1 arrow target, then to the shown yellow arrow, a sideways nudge when stuck) without its layout checks and without the one real touch drag; no nudges were needed in any seed. Its step times (`steps` column of `firstsale.csv`): still at the net 3.5–3.9 s, register 14.6–15.0 s, cash 16.1–18.0 s.
- **The smart bot is deterministic up to the first sale** (20.78 s in every seed): the seed does not reach the first loop (first coins and the clerk vary by ≈ 1.7 s). The pacing runs agree within ≈ 1.5 s (`first_coin` 0.56 min, clerk 0.60 min, sampled every 10 s from a slightly different start).
- The plan's econ probe (`econ/probe.mjs`) loads a save and cannot measure a fresh game's first sale; the census / pacing smart bot is the "smart bot" here. reqlog42 measures `earned > 0` at 2-s resolution; this tool measures both events at 0.1 s (onboarding) and 1/60 s (smart).

## 2. Village complete, hall, office, 읍 (G2, G3)

**fresh25** (census bot, smart policy, 25 game min, seeds 1–5; `celebrated` at 10-s resolution):

| seed | village complete | coins earned 0–20 min | a min | earned by 25 min |
|---|---|---|---|---|
| 1 | 19.83 min | 11,142 | 557 | 16,192 |
| 2 | 20.33 min | 10,506 | 525 | 15,623 |
| 3 | 20.33 min | 10,687 | 534 | 15,942 |
| 4 | 19.83 min | 11,216 | 561 | 17,016 |
| 5 | 20.17 min | 10,798 | 540 | 16,146 |
| **median** | **20.17** | **10,798** | **540** | 16,146 |

"Coins earned" = `economy.earned` at t = 1,200 s: every coin that reached the wallet (picked up from a cash pad by the chief), not coins still lying on a pad.

`econ/fresh_an.mjs` on the same files prints villageComplete 20.17, income20 540 (median) — the same as the v4.2.1 report's fresh40 medians (base 20.17 / 540, after L0 20.0 / 551, other runs): the first 20 minutes did not move between v4.2.1 and `da1436f`. The `lgx_l0 --fresh 5` games (same bot, its own seeds) completed the village at 20.33 · 20.17 · 19.83 · 19.67 · 19.83 min.

**Pacing bot** (`review_gameplay_sim.mjs --policy smart --v4 --after 12`, plays on 12 min past 읍; event times from `fin.events`):

| | smart_s1 | smart_s2 | smart_s3 | median |
|---|---|---|---|---|
| village complete | 19.99 | 20.0 | 20.66 | 20.00 |
| east tower | 20.25 | 20.36 | 20.98 | 20.36 |
| station | 22.45 | 22.37 | 22.67 | 22.45 |
| 창고 | 25.31 | 26.15 | 25.95 | 25.95 |
| 5 shops | 36.05 | 36.16 | 37.74 | 36.16 |
| hall started | 48.01 | 42.03 | 40.49 | 42.03 |
| hall built | 50.02 | 43.07 | 41.85 | 43.07 |
| office started | 50.22 | 51.28 | 50.5 | 50.50 |
| office built | 50.98 | 52.29 | 51.58 | 51.58 |
| 읍 ready | 50.65 | 43.71 | 37.75 | 43.71 |
| 읍 | 50.88 | 44.3 | 44.21 | 44.30 |
| bank | 56.95 | 54.27 | 53.56 | 54.27 |
| 물류창고 | 59.43 | — | — | 59.43 |
| stuck | 0 | 0 | 0 | 0.00 |
| errors | 0 | 0 | 0 | 0.00 |

**What holds 읍.** 읍 is the ceremony pad (`rank_eup`, 11,000 coins) once the people, shops and happiness bars are full; the bot pays it when it is the goal. Per seed (rank bars sampled every 30 s): smart_s1 shops 5/5 from 36.5, people short until 50.5 min (43/45), hall 50.02, bars full 50.65, 읍 50.88; smart_s2 shops 5/5 from 36.5, people short until 43.5 min (44/45), hall 43.07, bars full 43.71, 읍 44.3; smart_s3 shops 5/5 from 38.0, people short until 36.5 min (42/45), hall 41.85, bars full 37.75, 읍 44.21. Seeds 1 and 2: the people bar was the last one (43–44 of 45) until the hall's +6 homes (`civic.hall`), so 읍 came 0.9 / 1.2 min after the hall. Seed 3: the bars were full at 37.75 min (houses), but the goal list put the south-east tower and the hall first (`BUILD_UNLOCK.town_hall` = `tower_east`, hall 2,400 + 30 planks + 10 ingots) and then the 11,000 coins of the ceremony, so 읍 came at 44.2. The office can only start once the hall stands (`v42_office` after `b:town_hall`) and stood 1.0, 9.2, 9.7 min after it. For comparison the v4.2.1 report measured 읍 at 43.5 min (smart, seeds 1–3, the same tool, before the meat cans and 4.2.0.2); seed 1 here (51 min) waited for its hall. I did not bisect it. For v4.3 this matters twice: the plan moves the hall to village complete (D2, ≈ 20.5 min) and the office to a ≈ 16-min side goal, ≈ 20–35 min earlier than here, so the hall's +6 homes come early and 읍 should follow the coins instead. G2's "읍 within ±5 % of its bot target" needs that target set on purpose: this table is today's value, not the v4.3 target.

## 3. L0 throughput gates (G4)

`lgx_l0.mjs --minutes 10 --fresh 5`: **27/27 passed**, 0 page errors (one run, wall 57 min). The checks that carry numbers: raw porters never carried to the 창고 or the dock in 10 game minutes on the 46-min save (every pile at 40/40, no local job needed); the crew stays at 5 while use-busy is 0.26 (< busyAt 0.8) with a target of 6; town buyers every 40.1 s before 읍 and 20 s after; the 창고 card at village complete in all five fresh seeds (20.33 · 20.17 · 19.83 · 19.67 · 19.83 min), never before, with an M plot free; save v8 keeps the crew.

Throughput numbers (`econ/probe.mjs`, seed 7, chief parked — the runs of `logistics_plan.md`: L = 46-min save + late setup, warm 120 s + 10 min; S25 / S35 = the 25- / 35-min saves as they are, warm 60 s + 6 min):

| | probe_L | probe_S25 | probe_S35 |
|---|---|---|---|
| raw porters away (dock / 창고) · local | 0 % · 0 % | 0 % · 0 % | 0 % · 0 % |
| grill: processed a min · starved · blocked | 59.2 · 0 % · 47 % | 38.3 · 49 % · 0 % | 57 · 0 % · 24 % |
| sawmill: processed a min · starved · blocked | 43.2 · 51 % · 1 % | 48.3 · 19 % · 0 % | 43.2 · 28 % · 0 % |
| bakery: processed a min · starved · blocked | 44.2 · 29 % · 17 % | 36 · 0 % · 34 % | 41.5 · 0 % · 24 % |
| smelter: processed a min · starved · blocked | 56.1 · 0 % · 25 % | 34.8 · 0 % · 30 % | 39.8 · 0 % · 21 % |
| smokehouse: processed a min · starved · blocked | 55.4 · 0 % · 26 % | 25.3 · 0 % · 50 % | 34.8 · 0 % · 30 % |
| cannery: cans a min · starved · blocked | 25.9 · 38 % · 24 % | — | 0 · 0 % · 0 % |
| pile ≥ 90 %: fish · log · wheat · ore · meat · any | 64 · 0 · 0 · 79 · 86 · 99 % | 0 · 0 · 99 · 100 · 98 · 100 % | 73 · 0 · 54 · 90 · 88 · 100 % |
| stall shelf empty: fish · bread · meat | 0 · 0 · 12 % | 47 · 47 · 63 % | 1 · 5 · 61 % |
| raw to the dock a min (all) | 13.7 | 0 | 13 |
| 창고 crew first → last · busy · use-busy | 2 → 5 · 99 % · 90 % | — (no 창고) | 2 → 4 · 99 % · 99 % |
| trade post: items bought a min | 70.3 | 75.2 | 83.8 |
| coins created a min · collected | 2,421 · 407 | 1,208 · 0 | 1,615 · 0 |
| gatherers idle at a full pile | 20 % | 32 % | 24 % |

One run each; the v4.2.1 report measured run-to-run noise of a 10-minute probe at ±3–10 points on a pile share and ±3 % on coins.

## 4. Merchant ceiling at the trade post (G4)

The merchant buys one item every `trade.buyInterval` 0.28 s while someone stands at the register, × `register.clerkTradeSlow` 1.25 when a clerk serves. The countdown runs in whole 1/60-s frames: 0.35 s takes **22 frames → 163.6 a min** (not the 171.4 the formula gives), 0.28 s takes 17 frames → 211.8 a min. Measured with the shelf kept full (planks + ingots topped up every second, 5 s to settle, 60 s counted):

| Save | clerk serves | chief on the register (clerk stood aside) |
|---|---|---|
| v41_save_smart_25min.json | 164 a min | 212 a min |
| v41_save_smart_46min.json | 163 a min | 212 a min |

What the merchant really buys while the smart bot plays (warm 60 s + 6 min, seed 7, three runs of the same command — the real-time boot moments differ, so the runs are not identical):

| Save | items a min (3 runs) | coins a min | register staffed | trade shelf empty | mean trade stock |
|---|---|---|---|---|---|
| v41_save_smart_25min.json | 47.8 · 48.2 | 404 | 100 % | 0 % | 5.4 |
| v41_save_smart_46min.json | 58.3 · 60.2 | 433 | 100 % | 0 % | 5.8 |

A fresh game (seed 1, smart bot, 47 min, every minute in `merchant_fresh.csv`): the trade post opens at minute 3, the clerk at 4; items a minute swing with the plank / ingot supply (3–110); mean 58.8 a min over minutes 21–30 and 46.4 over 41–47 (minute 25: 43, minute 45: 86). The register is staffed 100 % of the time once the clerk is hired; the trade shelf is never empty while selling — supply, not service, sets today's rate (≈ 48–60 a min against a ceiling of 164). G4 should compare the ceiling (same rule on the 자재 창구) and the bot rates (same saves, same command).

(The first full run counted the 5-s settle into the ceiling and printed 177–178; that was the tool, fixed and re-run: the 163 / 164 / 212 above are from the re-run, and a separate 60-s check of the clerk case gave 163.)

## 5. Stall shelf per food kind (stage 1 must not shrink it; `customers.shelfMax` 40)

fresh25 census, 10-s samples, median over 5 seeds (min–max). "From first" = from the first sample the kind stood on the shelf (fish 0.33 min; bread 8.7–11.2 min; smoked meat first at 21.3–23.0 min, so it has no 0–20 value):

| Kind | mean on shelf 0–20 (from first) | empty 0–20 (from first) | ≥ 36 of 40 | max 0–20 | mean 20–25 | empty 20–25 | max 20–25 |
|---|---|---|---|---|---|---|---|
| fish | 12.0 (7.5–13.3) | 35 % (31–39) | 14 % | 40 | 8.4 (1.7–16.3) | 17 % (7–47) | 26 |
| bread | 22.7 (16.0–29.3) | 19 % (4–25) | 13 % | 40 | 32.3 (19.9–36.1) | 0 % (0–27) | 40 |
| smoked meat | — (—) | — % (—) | 0 % | 0 | 4.1 (2.1–7.1) | 60 % (40–77) | 24 |

The cap of 40 is reached for fish and bread in the first 20 minutes in every seed (bread 40, fish 38–40). On the saves with the bot (§4 runs, 1-Hz samples): 25-min save fish / bread / meat mean 9.1 / 22.5 / 8.4, empty 34 / 13 / 38 %; 46-min save mean 28.9 / 32.8 / 5.1, empty 0 / 0 / 39 %. The fresh merchant run has the same per minute (`merchant_fresh.csv` fishFill / breadFill / meatFill, …EmptyPct).

## 6. padvis (one paid pad per spot, G5)

`padvis.mjs --json padvis.json`: **275 ok, 0 failed** (one run, 0 page errors). `padvis.csv` is the list: 208 rows = every paid pad sampled (live, or still to come at the spot the game gives it, or 'place:' = a pad already bought, measured in the busier late world) in 10 scenes — the fresh game through the tutorial stages (점원 → 요리사 → 어부 → 숲 → 교역소 점원·짐꾼·제재공 → 작업대 가방·신발 → 교역소 점원 뒤) and the nine late saves (v3.5 21 / 38 min, v4.1 pure 25 / 45, smart 25 / 35 / 46, v4.2 office + 딸, v4.2 late village), 8 samples a pad. Worst floor cover by things that stay: 0.16 (limit 0.25); price and label covered: 0 / 0; mean cover with passers-by up to 0.295 (reported, not a failure). Live paid pads closer than 16 px to each other: 0 in every scene (the 4.2.0.1 one-paid-pad-per-spot rule); no label on another pad's label or price; the wait rules (a pad waiting for a spot, the office letters' camera jumps) pass. The plan asks for padvis per shop stage on the new layout: today there is one stage.

## 7. Texture budget per view (G5)

`texbudget.mjs --out texbudget.json` (no `--bot`, see §10): **9/12 passed**. Every must holds: new game 200.7 MiB (must 368, target 240), v3.5 village complete 322.7 (455), full v4 any view 411.7 (455), GL total 448.8 (455), render targets 33.7 (40), GL vs source-sum 1 %, back at the plaza after the tour +0.3 MiB (≤ 5). The three misses are the same soft targets every report since v4 records: title 151.9 (target 90), full v4 plaza 341.3 and tour peak 411.7 (targets 300).

| view | MiB (source-sum) max · last | GL total max | atlas · page · ground · social · canvas (last) |
|---|---|---|---|
| title | 151.9 · 151.9 | — | — · — · — · — · — |
| new game | 200.7 · 198.7 | 240.4 | 107.3 · 65.3 · 9 · 4.2 · 13 |
| v3.5 village complete | 322.7 · 315.7 | 360.7 | 196.6 · 82.3 · 21 · 8.5 · 7.2 |
| full v4 plaza | 411.7 · 341.3 | 448.8 | 183.1 · 129.9 · 12 · 15.2 · 1.1 |
| east dock | 377.8 · 370.4 | 414.9 | 206.6 · 129.9 · 18 · 14.8 · 1.1 |
| our station | 402.9 · 386.4 | 440.2 | 195.2 · 149.1 · 28 · 13 · 1.1 |
| along the track | 406.8 · 394.2 | 444.1 | 195.2 · 149.1 · 28 · 20.8 · 1.1 |
| town square | 407 · 360 | 444.7 | 163.8 · 149.1 · 28 · 18 · 1.1 |
| town zoom 0.6 | 366.8 · 346.6 | 404.5 | 163.8 · 149.1 · 28 · 4.6 · 1.1 |
| overview | 386.9 · 386.9 | 424.5 | 195.2 · 149.1 · 28 · 13.4 · 1.1 |
| back at the plaza | 404 · 341.6 | 441.7 | 183.1 · 129.9 · 14 · 13.4 · 1.1 |

(5-s samples per view; 'page' = the residency pages loaded on demand — the hall's art is on the `town_civic@hall` page, which v4.3 loads at village complete instead of at the east tower: compare the `new game` and `v3.5 village complete` rows.)

## 8. Layout and walks (`tools/test/v43_layout.mjs`)

### 8.1 Walks (walks.csv)

Measured with the game's own path finder in two scenes: `fresh` (a new game) and `late` (`fixtures/v42_village_late.json`: everything built, every land open; cannery on `e_m2`, store on `w_m2`, office, bank, hall, restaurant). Metres = ground px / 64. **route** = `gs.roads.route` with the walker's own "straight when near" (chief pilot / courier 220 px, porters 360 px): roads, off-road legs round what stands there, walled buildings through their doors — what porters and the courier walk. **direct** = a joystick walk: the straight line when nothing stands on it at the chief's radius 16 (sea and fog edge included), else the shortest way round on a 20-px ground grid (`Paths.gridPath`), roads ignored — what a player walks. **m** = the one that walker uses (chief rows direct; porters and the courier route).

| Walk | scene | m | route | direct | straight | plan §4.6 (old) |
|---|---|---|---|---|---|---|
| chief_first_walk | fresh | **1.42** | 1.42 | 1.42 | 1.42 | 1.5 m |
| food_reg_to_trade_reg | fresh | **13.73** | 18.39 | 13.73 | 13.57 | 13.6 m measured |
| first_loop:net_to_grill_work | fresh | **5.06** | 10.07 | 5.06 | 4.49 |  |
| first_loop:grill_out_to_shelf | fresh | **7.55** | 10.17 | 7.55 | 6.97 |  |
| first_loop:shelf_to_register | fresh | **1.75** | 1.75 | 1.75 | 1.75 |  |
| first_loop:register_to_cash | fresh | **3.36** | 3.36 | 3.36 | 3.36 |  |
| food_reg_to_trade_reg | late | **15.18** | 18.39 | 15.18 | 13.57 | 13.6 m measured |
| oven_to_shop | late | **13.27** | 13.27 | 12.58 | 12.58 | 13.3 m |
| meat_rack_to_cannery | late | **62.95** | 62.95 | 39.33 | 34.34 |  |
| cannery_to_store | late | **73.11** | 73.11 | 56.66 | 55.62 | 68.6 m (judge) |
| cannery_to_store [bots w_m1 → w_m2] | late | **23.51** | 23.51 | 14.46 | 14.11 | 18.7 m measured |
| meat_rack_to_cannery [bots w_m1] | late | **45.78** | 45.78 | 36.02 | 35.68 | 45 m |
| coin_round | late | **409.36** | 409.36 | 274.69 | 254.32 | 322 m measured (research) / 293 m rule |
| coin_round [no station cash] | late | **212.55** | 212.55 | 156.91 | 140.29 | — |
| fish_pile_to_grill | late | **2.32** | 2.32 | 2.32 | 2.32 |  |
| plank_porter_to_trade | late | **16.95** | 16.95 | 16.3 | 16.1 |  |
| ingot_porter_to_trade | late | **47.37** | 47.37 | 37.62 | 36.7 |  |

Notes:
- The chief's first walk is 1.42 m (start (935, 520) → net gather (880, 484)), the plan's 1.5 m. The first-loop legs a player walks (direct): net → grill work 5.06 m, grill out → shelf 7.55 m, shelf → register 1.75 m, register → cash 3.36 m (the pilot's road route would be 10.07 / 10.17 m).
- food ↔ trade register: 13.73 m direct in a new game (the plan's 13.6), 15.18 m in the late village (more props on the line), 18.39 m by road.
- The coin round on the late save is 409.4 m by the courier's route (direct 274.7 m), longer than the research's 322 m: this save's store is on `w_m2` (far west) and the station cash box is on the station square (3421, 1568); the station leg pair alone is 236.9 m of route. Without the station cash it is 212.6 m (direct 156.9). Compare the new layout with the same rows.
- `alt` rows move the place with its building to another plot (the offset from its plot), as the bots build: cannery on `w_m1`, store on `w_m2`.
- The new layout's names are looked up first (`reel` / `deckReel` before `net`, `matRegister` before `tradeRegister`, `fishShelf` / `breadShelf` before `shelf`, `crate` before `pile:fish`); a row whose place does not exist prints `missing`, it never guesses. Builders: expose the new places through `window.__FV.where()` under those names (or edit the `WALKS` table at the top of the tool).

### 8.2 Footprints (footprints.csv, footprint_summary.csv)

Every footprint (plots and towers at their size diamond — S 181×91, M 272×136, L 362×181, XL 525×262 px —, the five stations, the stall, the trade post, the bench, the net, the v4 lots / buildings) against other footprints, decor (static images, trees, rocks, wheat, ground decals, decor / village-life colliders), the walk graph (nodes inside; edges with > 20 ground px inside), painted streets, pads (live paid, still to come at the game's own spot, work pads), the sea (corners and edge middles vs `shoreY`) and the fog (part of the footprint in land that opens at another time). Scenes as §8.1: fresh 70 footprints · 711 decor · 58 nodes / 66 edges · 92 pads; late 73 · 720 · 136 / 146 · 56. **Overlaps in the first village (x < 3000) on today's map:**

| scene | footprint | with | measure |
|---|---|---|---|
| fresh | plot:s_l1 | decor: lamp_post | 1 (inside by px) |
| fresh | plot:w_hall | decor: decal:decal_puddle_ice | 44 (ground decal; inside by px) |
| fresh | plot:w_s2 | road_edge: w_gate_m→w_hall | 104 (ground px of the edge inside) |
| fresh | station:grill (station_grill) | road_edge: plaza_c→gap_n | 79 (ground px of the edge inside) |
| fresh | trade (trade_post) | road_edge: beach_w→plaza_w | 39 (ground px of the edge inside) |
| fresh | bench (upgrade_bench) | road_edge: plaza_c→plaza_s | 71 (ground px of the edge inside) |
| late | plot:s_l1 | decor: lamp_post | 1 (inside by px) |
| late | plot:w_hall (town_hall) | decor: decal:decal_puddle_ice | 44 (ground decal; inside by px) |
| late | plot:w_s2 (house_a) | road_edge: w_gate_m→w_hall | 104 (ground px of the edge inside) |
| late | tower:tower_south (watchtower) | decor: bush_snow | 7 (inside by px) |
| late | station:grill (station_grill) | road_edge: plaza_c→gap_n | 79 (ground px of the edge inside) |
| late | trade (trade_post) | road_edge: beach_w→plaza_w | 39 (ground px of the edge inside) |
| late | bench (upgrade_bench) | road_edge: plaza_c→plaza_s | 71 (ground px of the edge inside) |
| fresh | plot:e_dock | sea (by design) | -22 px |
| fresh | net | sea (by design) | -6 px |
| late | plot:e_dock | sea (by design) | -22 px |
| late | net | sea (by design) | -6 px |

All of these are today's shipped layout (the grill, the trade post and the bench stand over a road-graph edge that walkers route round; `w_s2` over the `w_gate_m → w_hall` edge). No footprint overlaps another, no pad lies under a footprint, nothing is in the fog. In the station town (x ≥ 3000) the tool also lists the v4 street-grid nodes / edges that run into lots and buildings (12 overlaps, by design of the v4 grid) and the town gate across the rail / town border.

### 8.3 The plan's proposed plots checked against today's map (`--probe`, footprints_plan_probe.csv)

The §4.5.1 positions as probe footprints (the grill moved to (1000, 520) as an M diamond; the deck is not probed, its footprint is not decided). Late scene; "touch" = within the margin, "overlap" = inside:

| probe | conflicts found | plan §4.5.2 expected |
|---|---|---|
| hut_v42_office | touch decor log_seat_x @(615, 561) 6; touch road node beach_w @(690, 610) 10; touch road edge beach_w→beach_n @(1000, 500) 10; overlap road edge beach_w→plaza_w @(600, 830) 126; touch road edge beach_w→plaza_c @(1000, 770) 9; overlap pad trade:register (work) @(614, 691) 14; touch pad trash (work) @(560, 700) 2728 | 1: trash pad (560, 700), campfire (520, 590) |
| grill_moved | overlaps station:grill (4033 px²); overlap road node beach_n @(1000, 500) 68; touch road node gap_n @(1078, 556) 10; overlap road edge beach_w→beach_n @(1000, 500) 127; overlap road edge beach_n→beach_e @(1300, 572) 127; touch road edge plaza_c→gap_n @(1078, 556) 10; overlap road edge gap_n→beach_n @(1000, 500) 129; touch road edge gap_n→beach_e @(1300, 572) 10; overlap pad grill:in (work) @(907, 541) 1 | 2: node beach_n (1000, 500), next to gap_n |
| hall_w_hall | overlaps plot:v42_office (31038 px²); touch road edge w_b2→w_gate_n @(-60, 640) 12 | 3: trees (190, 860) (260, 720) (300, 930), signpost (−40, 720) |
| d_wh | overlap decor campfire @(740, 1575) 75; overlap decor log_seat @(740, 1521) 41; overlap decor log_seat_y @(645, 1546) 9; overlap decor log_seat_x @(835, 1546) 9; overlap decor decal:decal_snow_drift_a @(760, 1580) 54 | 4: the concert campfire (740, 1575) |
| d_store | overlap decor snow_pile_b @(1393, 934) 26; overlap decor dog_house @(1490, 1000) 4; touch road node east_link @(1600, 930) 3; overlap road edge plaza_e→east_link @(1600, 930) 198; touch road edge east_link→east_gate @(1830, 950) 3 | 5: node east_link (1600, 930) |
| d_labour | overlap decor picnic_table @(1235, 1555) 40; touch decor kids_swing @(1440, 1610) 7; overlap decor decal:decal_snow_drift_b @(1220, 1590) 100 | 6: bush (1052, 1660), lamp (1040, 1500) at the edge |
| d_cannery | overlap decor bush_snow @(1620, 545) 4; touch decor tree_pine_snow @(1626, 536) 14; touch decor tree_pine_b @(1691, 597) 2; overlap decor snow_fort @(1530, 612) 30 | 7: bush (1620, 545) |
| h43_1 | touch road edge plaza_sw→forest_link @(772, 1148) 3 | 8: edge plaza_sw → forest_link |
| h43_2 | touch road edge plaza_se→farm_link @(1196, 1158) 16 | — |
| d_tool | overlap decor igloo @(330, 1565) 54 | — |
| d_school | overlap decor tree:tree_pine_snow @(-1010, 640) 40; overlap pad tables1 (paid) @(-887, 621) 39 | — |
| d_clinic | overlap decor tree_stump @(-1200, 900) 25; overlap decor tree_stump @(-1120, 860) 54; touch decor tree_pine_snow @(-1301, 861) 6; overlap decor tree:tree_pine_a @(-1110, 840) 18; overlap decor tree:tree_pine_snow @(-1180, 920) 11 | — |

So, against the plan's first-pass list: **confirmed** — 2 (beach_n, plus three beach edges), 4 (the concert campfire, with its three log seats), 5 (the plaza_e → east_link edge runs 198 px through the store; the node itself is 3 px outside), 7 (the bush, 4 px, plus a snow fort and two pines at the edge), 8 (3 px from the edge; h43_2 is 16 px from plaza_se → farm_link). **Not as written** — 1: the trash pad's floor lies under the hut (2,728 px²) but the campfire (520, 590) is outside the M diamond; the hut also covers today's trade-register pad (614, 691; it goes with the trade post) and 126 px of the beach_w → plaza_w edge. 3: no tree or signpost under the hall: the three office-site pines are not planted in 4.2.x (Game.blockedForDecor keeps 250 px round the `v42_office` plot clear) and the signpost (−40, 720) is outside; the hall overlaps the old `v42_office` plot, which moves to the hut anyway. 6: the bush (1052, 1660) and the lamp (1040, 1500) are outside the L diamond; the labour office covers a village-life picnic table (40 px) and touches a swing. **New**: d_tool covers an igloo (village life, 54 px); d_store a snow pile and the dog house; d_school a pine and, in the late village, the big restaurant's tables pad; d_clinic two stumps and two pines. Village-life props (igloo, picnic table, swing, dog house, snow fort, log seats) are `WORLD.life` props (world.js ≈ :536–553, most with an `after` step), not `WORLD.decor`: they move there.

## 9. How to repeat (from `frost-village/`, one browser at a time, `nice -n 10`)

| # | Measure | Command | Output read |
|---|---|---|---|
| 1 | first sale, onboarding bot + smart bot (seeds 1–5); merchant ceiling / bot / fresh; walks; footprints | `nice -n 10 node tools/test/v43_layout.mjs --out <dir> --only layout,walks,firstsale,merchant --seeds 5 --fresh-min 47 -v` | `firstsale.csv`, `merchant.csv`, `merchant_fresh.csv`, `walks.csv`, `footprints.csv`, `footprint_summary.csv`, `v43_layout.json` (wall ≈ 30 min; `layout,walks` alone ≈ 1 min) |
| 2 | the plan's proposed plots checked against today's map | `nice -n 10 node tools/test/v43_layout.mjs --out <dir> --only layout --probe 'hut_v42_office:600,640,M;hall_w_hall:180,760,XL;d_tool:380,1560,M;d_wh:740,1560,M;d_labour:1220,1610,L;d_cannery:1560,580,M;d_store:1480,940,M;d_school:-930,640,M;d_clinic:-1160,870,M;h43_1:640,1040,S;h43_2:1340,1050,S;grill_moved:1000,520,M'` | `footprints.csv` rows `probe:*` |
| 3 | fresh25 (village complete, coins 0–20 min, shelf per food) | `for s in 1 2 3 4 5; do nice -n 10 node tools/test/review_gameplay_census.mjs --name fresh25_s$s --minutes 25 --seed $s --out <dir>; done` then `node tools/test/econ/fresh_an.mjs <dir>/fresh25_s*.census.json` | census rows (10 s): `celebrated`, `earned` at t = 1200, `market.{fish_cooked,bread,meat_cooked}` |
| 4 | pacing (village complete, hall, office, 읍) | `for s in 1 2 3; do nice -n 10 node tools/test/review_gameplay_sim.mjs --name smart_s$s --policy smart --v4 --after 12 --minutes 80 --seed $s --out <dir>; done` | `<dir>/smart_s*.json` `fin.events`: `hire_hunter`, `build:/built:town_hall`, `build:/built:chief_office`, `flag:rankEup` |
| 5 | L0 gates | `nice -n 10 node tools/test/lgx_l0.mjs --minutes 10 --fresh 5` | pass / fail lines |
| 6 | L0 throughput numbers | `nice -n 10 node tools/test/econ/probe.mjs --late --warm 120 --minutes 10 --seed 7 --out probe_L.json` (and `--load v41_save_smart_25min.json --warm 60 --minutes 6 --seed 7`, `--load v41_save_smart_35min.json …`) | `SUMMARY` line / `summary` in the JSON |
| 7 | padvis | `nice -n 10 node tools/test/padvis.mjs --json padvis.json` | `padvis: N ok, M failed` |
| 8 | texture budget | `nice -n 10 node tools/test/texbudget.mjs --out texbudget.json` (not `--bot`: §10) | samples per view, checks |

## 10. Not run, changed, caveats

- **Not run:** the 60-min census `g60` (replaced by the merchant `bot` / `fresh` runs and the probes, which give the trade post's rate at
  25 and 45 min directly); arrow / arrow-only pacing; pacing with 5 seeds (3 run); `onboarding.mjs` itself (its bot is reimplemented in
  `v43_layout.mjs` to time it; the suite's layout checks were not run here); `texbudget --bot 20`: it stops with
  `TypeError … window.__BAL.prices` (texbudget.mjs's `--bot` path does not load `window.__BAL`, which `review_gameplay_bot.js` needs
  since v4.2) — a pre-existing tool bug, not fixed here (read-only tree); the run without `--bot` is the one every earlier report used.
- **Re-runs:** my queue runner hit its 2-h background limit once and killed pacing seed 2 at game minute 20; it was re-run from the
  start. The first full `v43_layout` run counted the 5-s settle into the merchant ceiling (177–178 a min); the tool was fixed and the
  merchant section re-run (§4); its other sections were not affected — `--only layout,walks` with the final tool file reproduced
  `walks.csv`, `footprints.csv` and `footprint_summary.csv` byte for byte.
- **Noise:** fixed-step runs of the same seed are not bit-identical because the boot (title → village) runs on real time for a moment
  (the merchant `bot` rows: 47.8 / 48.2 / 50.0 a min on the same command). The smart bot's first sale is the exception (20.78 s every time).
- **Walk rows depend on the scene.** The late fixture is one real village (cannery `e_m2`, store `w_m2`); the `alt` rows give the bots'
  placement. On the new layout run the same command and compare row by row; the coin round's points are looked up live (office desk pad,
  stall cash, store cash, station till, hall tax box, restaurant cash, bank deposit point).
- `v43_layout.mjs`'s decor list is the scene's static images + trees / rocks / wheat + ground decals + decor / village-life colliders;
  building colliders are not decor. A probe footprint is a plain size diamond; a real building's own footprint (its manifest
  `footprintM`) can differ.

## 11. Files (this folder)

| File | What |
|---|---|
| `report.md` | this report |
| `firstsale.csv` | first sale per bot and seed (§1) |
| `fresh25.csv` | per seed: village complete, coins 0–20 / 25, shelf per food (mean, empty share, ≥ 36, max), trade stock (§2, §5) |
| `pacing.csv` | per seed: every milestone minute of the pacing bot (§2) |
| `merchant.csv` | merchant ceiling (clerk / chief) and smart-bot rates on the 25- / 46-min saves, stall shelf per food (§4) |
| `merchant_fresh.csv` | fresh game seed 1, per minute: items bought, trade coins, staffed, shelf per food, coins (§4, §5) |
| `walks.csv` | every walk row, both scenes: m, route, direct, straight, the places with coordinates (§8.1) |
| `footprints.csv` · `footprint_summary.csv` | every conflict row (scene, area, footprint, type, level, other, where, measure) · per footprint counts (§8.2) |
| `footprints_plan_probe.csv` | the plan's proposed plots checked against today's map (§8.3) |
| `padvis.csv` | every paid pad sampled by padvis, worst covers (§6) |
| `texbudget.csv` | per view: source-sum, GL, residency classes (§7) |
| `probes.json` | the three econ probe summaries (§3) |
| `v43_layout.json` | the tool's full output (walk legs with waypoints, footprints, merchant fresh minutes); kept out of the repo, re-create it with run 1 |
| `baseline_runs.json` | the collected numbers of the census / pacing / probe / padvis / texbudget runs |

Raw runs (scratch, not committed): `/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v43/m0/runs/`.

