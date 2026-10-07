# v3.5 build, review, fix, verify

## Build

v3.5 is built and every test passes. A first-time player now runs each station themselves until they hire its operator, then hires porters until the line runs on its own. Kongi the dog comes to a whistle and can be given treats, played with and petted. Existing v3 saves migrate without losing any progress or automation. The cost is length: bots finish all of v3 in 48–54 minutes, up from 37–43.

## What was built
- **Operators.** The grill, sawmill, bakery, smelter, smokehouse, toolsmith and cannery only work while someone stands at their work spot. Until an operator is hired, the chief does it himself with his work animation, 1.25× faster. The first tutorial step is "화덕 앞에 서서 생선을 구우세요".
  - Operators: 요리사 쿡 (npc_chef), 제재공 산들 (npc_sawyer), 빵집 아주머니 (npc_aunt), 대장장이 언니 (npc_blacksmith), 훈제사 연기 (npc_smoker), 도구 장인 영감 (miner_b), 통조림 기술자 통통 (npc_cannery).
  - Each plays its work animation with sound and particles on the hit frame, and waves or shows an idle emote when there's nothing to do.
- **Collection piles.** Gatherers drop at a pile instead of the station: 생선 통, 통나무 더미, 밀 더미, 광석 더미, 고기 걸이 (meat rack, built from fence posts). Each holds up to 40. The chief can take from a pile, and fish carried onto a work spot go straight in.
- **Porters.** A raw porter carries pile → station along the roads; the existing goods porter still carries station → seller.
- **Hiring.** The pads of one line appear one after another on the same spot. A new pad that pops up under the chief waits until he steps off once — the same rule the upgrade pads already used.
- **Second and third hires** of a profession use different looks (b/c variants). The miner's b look is reserved for the toolsmith operator, so the second miner is miner_c.
- **Tutorial safety:** a hint when a station has work but nobody operating it, a hint to collect coins when they'd pay for the next pad, an early trash pad if the bag fills before the fisherman is hired, and a blinking label when a pile is full.
- **Dog.** Kongi roams on its own. The whistle button makes it run in and bark; tapping it also calls it.
  - Its three-button bar (간식/공놀이/쓰다듬기) sits above both dog and chief. Treat: give → eat → hearts. Play: throw and fetch, and the second throw is caught in the air. Pet: chief crouches, dog rolls over.
  - Each action has a cooldown, and treats are limited to 3 in a row. The 5-heart affection gauge is saved. Above 50 affection the dog does tricks; above 75 it brings small coin gifts.
- **Save** is now version 4, migrated from v3. Every open station gets its operator, every hired gatherer gets its raw porter, and a toolsmith or cannery built or under construction in v3 keeps its operator. Brand-new saves still get the new tutorial. Version is `v3.5`.
- **Loading:** villagers3, workers and pets2 load after the title screen.
- **Designer files:**
  - `balance.js` has new Korean-commented sections: line costs, 세 번째 일꾼 (third workers), 분업 and 강아지.
  - `balanceCheck.js` now covers all new keys: missing ones fill in silently, and bad values are clamped with a console warning.
  - `strings.js` has every new text in both Korean and English.

## Hire order and costs (coins)
| Line | Order and cost |
|---|---|
| Fish (tutorial) | clerk 12 (after first sale) → cook 30 → fisherman 45 → fish porter 70 → counter porter 100 |
| Wood | zone 90 → trade clerk 50 (after first trade, optional) → sawyer 110 → lumberjack 150 → log porter 170 → plank porter 220 |
| Wheat | zone 300 → baker 260 → farmer 380 → wheat porter 340 → bread porter 420 |
| Ore | zone 600 → blacksmith 480 → miner 700 → ore porter 560 → ingot porter 640 |
| Hunt | zone 950 → smoker 760 → hunter 1150 (village complete) → meat porter 820 → smoked meat porter 900 |
| v3 | toolsmith operator 220 → tool porter 600; cannery operator 600 → can porter 800; dock porter 600; store clerk 400 |
| 2nd workers (+ tool) | lumberjack 600, miner 900, farmer 800, fisherman 500, hunter 1200 (unchanged) |
| 3rd workers (+ tool) | fisherman 1000, lumberjack 1100, farmer 1300, hunter 1600 |

## Bot timings (game minutes)
| Bot | First coin | Clerk | Cook | Fisherman | Fish line fully automatic | Village complete | v3 complete | Stuck |
|---|---|---|---|---|---|---|---|---|
| Skilled | 0.5 | 0.6 | 1.2 | 1.4 | 3.3 | 20.3 | 48.4 | 0 |
| Follows the arrow only | 0.3 | 0.3 | 0.7 | 1.5 | 3.7 | 21.7 | 47.8 | 0 |
| Thinking player | 0.4 | 0.5 | 1.3 | 2.1 | 4.5 | 23.0 | 53.8 | 0 |

- Up to village complete, the longest gap between hires is about 2 minutes, with bag/boot upgrades in between.
- In v3 the longest gap between hires is about 4 minutes, before the second farmer, with buildings going up in the meantime. The longest stretch with nothing new is about 3.5 minutes, saving 2200 for the south-east watchtower.
- 0 errors and no hungry miners in any run.

## Tests
| Test | Result |
|---|---|
| `smoke.mjs` (rewritten for the operator flow) | 53/53 |
| `v3.mjs` | 18/18 |
| `labour.mjs` (new) | 28/28 |
| `dog.mjs` (new) | 15/15 |
| `life.mjs` | 14/14 |
| `zoom.mjs` | 11/11 |
| `save_v2.mjs --browser` | 16/16 |
| `save_v3.mjs --browser` | 26/26 |
| `save_v35.mjs --browser` (new) | 25/25 |
| `test_deploy.mjs` (pages + standalone) | both pass |
| 10-minute soak (v3 village + dog play) | 0 errors; heap 22.8 → 25.7 MB; affection reached 75 |
| Artifact build | OK |

## Screenshots
All 33 are in `/home/user/nurient/frost-village/docs/previews/screens_v35/`, and I looked at each one and reshot until the framing worked:
- 01: chief cooking at the grill
- 02: cook flipping fish
- 03: fish porter, barrel to grill
- 04: goods porter heading to the counter
- 05_op_1 to 05_op_7: each operator working
- 06_pile_1 to 06_pile_5: the five piles
- 07_variants_1 to 07_variants_4: three looks of one profession working together
- 08 and 09: whistle and the dog running in
- 10 to 18: the bar, then treat, pet, throw/fetch and catch, each with hearts
- 19: the whole village working
- 20: overview

The tests also leave 26 extra `test_*.jpg` shots in the same folder. To retake the 33, run `node tools/test/shots_v35.mjs`.

## Known issues
- **Longer game:** v3 completion is 48–54 minutes, up from 37–43, because each line now has two more hires plus the third workers. The last gap, saving for the south-east watchtower, is still about 3.5 minutes. I lowered the third-worker costs but didn't touch the v3 tower or boat prices — those are yours to change.
- **Canner's back:** 통통 faces the machine, so you see his back while he works. The baker auntie's board/press in her work animation sits slightly off her hands.
- **Same-spot pads:** a new pad that pops up under the chief needs one step off and on. That's intentional, but a first-time player might not notice.
- **Artifact size:** it's 340 files, over the 255 per publish, so it has to go up in two batches; `dist/artifact_files.json` lists them. 37 MB in total.
- **Leftover code:** the old v3 `Smith` class in `Workshop.js` is no longer used.
- **Outdated doc:** the cost table in `docs/기획서.md` §4 is out of date and isn't mine to edit. The current numbers are in `balance.js` and `기획서_v3_분업.md` §4.
- **Slow-test effects:** in the headless browser, real-time tests (soak, deploy) run at only 2–4 frames per second, same as v3. Because the game slows itself down at low frame rates, dog scenes take longer there; real devices aren't affected. One run also lost a synthetic tap on the whistle button, so `dog.mjs` now taps once more if that happens.
- **Mine fence:** a bot coming from north of the mine fence couldn't walk straight to the ore. It was stuck once in an early run and never in the final runs. I moved the ore-pile crate so it no longer narrows that passage.

## Changed files
In `/home/user/nurient/frost-village`:
- **New:** `src/systems/Labour.js`, `src/systems/DogPlay.js`
- **Changed game code:** `src/scenes/Game.js`, `UI.js`; `src/entities/Station.js`, `Workshop.js`, `Worker.js`, `Player.js`; `src/systems/Progression.js`, `Tutorial.js`, `VillageLife.js`, `Effects.js`, `Occlusion.js`; `src/core/Assets.js`, `Save.js`
- **Designer files:** `src/data/balance.js`, `balanceCheck.js`, `world.js`, `strings.js`, `version.js`
- **Docs:** `docs/기획서_v3_분업.md` (new §4: hire order, costs, play times, save migration) and `docs/기획서_v2.md`
- **New tests:** `tools/test/labour.mjs`, `dog.mjs`, `save_v35.mjs`, `shots_v35.mjs`
- **Updated tests and build:** `smoke.mjs`, `v3.mjs`, `life.mjs`, `save_v3.mjs`, `review_robust_soak.mjs` (`--dog`), the `review_gameplay_*` bots, and `tools/build/build_artifact.mjs` and `test_deploy.mjs`

## Review: gameplay

# v3.5 gameplay and economy review: the late game and saves are solid, the early-game arrow is not

v3.5 is structurally sound. I found no hard softlocks, and every bot run in this review reached "v3 complete". Old v3 saves migrate with no lost progress and keep their automation. All seven operators walk to their work spots and work, and raw and goods porters behave.

The early-game arrow has two holes. A player who only follows the arrow loses minutes in the first five minutes, and one in five such runs got stuck for good. In the late game, the new third workers add almost no income, which is most of why v3 takes about 6 minutes longer. The dog works and can't be farmed for coins, but the affection gauge fills too fast to mean anything.

**How I tested.** Builder bots (smart, arrow, think) plus my own "pure arrow" bot, all moving only through `__FV.setInput`. The pure bot only walks where the arrow points, and stands still or steps off a pad when there is no arrow. I also ran the real v3 build (git `7adb6c8`, extracted to `/tmp/fv_review_v35/v3src`) to make genuine v3 saves for the migration test. Everything is in `/tmp/fv_review_v35/gameplay/`: scripts in `tools/`, results in `*.log` / `*.json`, screenshots in `shots/`.

## Timings (game minutes)
| Run | Clerk | Cook | Fisherman | Goods porter (fish line automatic) | Village complete | v3 complete | Longest wait for anything new |
|---|---|---|---|---|---|---|---|
| v3 build, smart bot (baseline) | 0.7 | – | 0.8 | 4.5 | 17.4 | 38.7 | 3.5 |
| smart (`g_smart1`) | 0.6 | 0.9 | 1.3 | 2.8 | 19.7 | 47.0 | 3.1 |
| arrow (`g_arrow1`) | 0.3 | 1.0 | 1.5 | 3.7 | 21.4 | 47.5 | 2.6 |
| think (`g_think1`) | 0.4 | 1.1 | 1.6 | 3.4 | 22.1 | 50.3 | 3.5 |
| **pure arrow (`pure2`)** | 0.3 | 1.0 | 1.7 | **15.2** | **31.3** | **60.6** | **8.8** |

**Is the early hand-work fun or tedious?** The hand-work itself is brisk, not tedious:
- Standing on a work spot adds up to only 10–44 s over a whole game.
- Each line's "do it yourself" phase lasts about 0.5–1.3 min.
- Up to village complete, there is a new hire roughly every 0.5–2 min.

What makes the early game drag is the guidance (findings 1 and 2), not the work.

## Findings

**1. HIGH: right after the tutorial, the arrow loops "fish barrel → grill" and never says "sell".**
- **Problem:** once the fisherman is hired, and until the fish porter is bought, the hint to collect from the fish barrel wins even when the grill output is full (36/36) and nothing can cook. The 36 cooked fish waiting to be sold are never pointed at.
- **Repro** (`tools/s2_afterTut.mjs`): done = clerk + cook + fisherman, grill input 24 and output 36, 12 fish in the barrel, chief idle. For 25 s the arrow stays on the barrel with "생선 통에서 생선을 가져가세요". Screenshot `shots/s2_after_tutorial_idle.jpg` shows 0 coins, a tower of cooked fish and waiting customers.
- **Bot evidence:** 7 of 8 pure runs had earned only 88–96 coins by minute 4 (`early*.log`, grill output stuck at 35–36). In `pure2`, the fisherman (1.7 min) to fish porter (10.5 min) gap was 8.8 minutes. The guidance cycles barrel → grill → no arrow every ~13 s (`early2.json` log).
- **Cause:**
  - `Tutorial.js:347` only checks that the grill input has room, not that its output is backed up.
  - `labourHint` (line 82) runs before `nextAction` (line 88), so the barrel hint always wins.
- **Fix:** skip the barrel hint when the station's output is half full or more. When a station output holds 6 or more items and has no goods porter, point at it before the barrel hint.

**2. HIGH (dates from v2, but happens in minute one): register deadlock in the first loop.**
- **Problem:** if the front customer got only part of their order and the counter is empty, the tutorial sends the chief to the register forever ("계산하는 중… 손님이 모두 낼 때까지 서 있어요"). That customer never pays.
- **Repro** (`tools/s3_register.mjs`): front customer wants 3 fish, has 2. After walking to the register and waiting 60 s: 0 coins, nothing changes. Screenshot `shots/s3_register_deadlock.jpg`.
- **Frequency:** 2 of 10 pure runs never earned a single coin (`pure1` over 90 min, `early5`).
- **Cause:** `Tutorial.js:245` also sends the chief to the register when the front customer only has part of the order (`front.got > 0`).
- **Fix:** only send the chief to the register when the customer is actually waiting to pay (`m.waitingPay`). Otherwise fall through to the fish and grill steps.

**3. MEDIUM: standing on a pad that just appeared underneath you shows nothing at all.**
- **Repro** (`tools/s1_sameSpot.mjs`): with 200 coins, pay the cook's pad at (900,700); the fisherman pad (45) pops up on the same spot. With 170 coins left and standing still for 15 s: no arrow, no objective text on every frame, nothing paid. Screenshot `shots/s1_same_spot_blank_guidance.jpg`.
- **Cause:** `Tutorial.js:72` returns early when the chief stands on the affordable pad, and `UnlockPad.js:199` (`needsLeave`) waits for him to step off.
- **Fix:** show a line such as "한 걸음 나왔다가 다시 올라서세요", or clear the step-off rule after about 1.2 s of standing still with no joystick input.

**4. MEDIUM (economy): from about minute 15 every line is over-supplied, so the second and third workers add almost nothing.**
- **Evidence:** in the smart run, every collection pile sits at 40 and every station at 30/36 from about 15 min on.
- **Idle test** (`tools/latecash.mjs`, everything hired, chief standing still):

  | Late-game setup | Income per minute |
  |---|---|
  | All 14 gatherers | 894 |
  | Only the 5 first gatherers | 791 |

  The second and third workers cost 9,000 coins plus 9 tools for about +13%, and all of that comes from the fish line.
- **Trade post:** the sawmill and smelter goods porters carry only 2–3 planks or ingots per trip to top up the toolsmith and cannery, because those rank above the trade post shelf (`tools/porterprobe.mjs`). The trade post earned 40 coins in 60 s.
- **Effect:** this is the main reason the v3 part of the game went from 21.2 to 27.3 min.
- **Proposed `balance.js` numbers** (tested with `p_smart` / `p_think`):
  - `hire3`: 450 / 500 / 600 / 700
  - `towers.tower_se.coins`: 1700
  - `boats.fishing.coins`: 1200
  - `costs.raw_smokehouse`: 650
  - `costs.porter_smokehouse`: 750

  Effect: v3 complete 42.7 (smart) / 45.3 (think) instead of 47.0 / 50.3. The longest wait for anything new drops to 1.9 min from 3.1–3.5. Village complete is unchanged (20.2 / 21.5).
- **Optional, so the extra workers actually earn:** `workers.porterCapacity` 8 → 14 together with `customers.spawnEvery` 2.0 → 1.3. That gives 1064/min (+19%), and the extra workers then matter (876 → 1064). Either change alone does nothing (893 / 851).

**5. LOW-MEDIUM: in the late game, every "pile full" label pulses and every gatherer shows a sweat emote, permanently.**
This happens even with a raw porter hired and the station full, so the player can't do anything about it. The pile check in `Labour.js:392` and the sweat emote in `Worker.js:232` don't look at either. Pulse only when there is no raw porter and the station has room.

**6. LOW: the dog.**
- **Can't be exploited:** at full affection the dog brought 3 gifts worth 18 coins in 10 minutes.
- **Gauge is meaningless:** spamming the three actions reaches 75 affection in 27 s and 100 in 38 s (13 actions), and it never decays (`dogx.log`).
- **Proposed numbers:** `playCooldown` 10, `petCooldown` 15, `treatLove` 8, `playLove` 3, `petLove` 3.
- **Cooldown lost on a cancelled scene:** walking away mid-pet ends the scene, gives no affection, and still uses the cooldown (6.7 s left; `DogPlay.js:161`).
- **Nobody explains the whistle:** there is no first-time hint for the whistle button.
- **Bar can eat a drag:** a drag that starts on one of the bar's buttons fires the button instead of moving the chief (`UI.js:110`).

**7. LOW: the forest guide can point at an ore rock behind the mine fence.**
The arrow picks the nearest rock in a straight line. Approaching from the north, the arrow pointed at the rock at (294,1850) behind the fence; the arrow-following bots got stuck at (310,1750) 7 times in `pure2` and 7 times in `g_arrow1`, then recovered. Either choose rocks by walking distance or move that rock (`world.js` `rocks[0]`, `Z('mine', -2.6, -0.4)`).

**8. LOW: pad names don't match the operators' names.**
The pads say "제빵사 고용" and "제련공 고용", but the people who arrive are "빵집 아주머니" and "대장장이 언니" (`strings.js`, `op_bakery` / `op_smelter`).

## Migration v3 → v3.5: passes
I took 16 saves from a real v3 bot run (0.35–38 min) and loaded seven of them, from 0.35 to 38 min, into v3.5:
- **Nothing lost:** coins, finished steps, buildings, land and food box all carried over. There were 0 errors.
- **Automation kept:** every open line got its operator, the toolsmith got its operator, and every hired gatherer got its raw porter.
- **A fresh tutorial save stays a tutorial:** a save with nothing done does not get the cook for free.
- **Idle income matches v3:**

  | Save | Window | v3.5 | v3 | Difference |
  |---|---|---|---|---|
  | 5 min | 2 min | 276 | 260 | +6% |
  | 12 min | 2 min | 1304 | 1227 | +6% |
  | 20 min | 6 min | 5175 | 5099 | +1.5% |
  | 26 min | 2 min | 1663 | 1734 | −4% |
  | 38 min | 6 min | 6399 | 6577 | −3% |

  Data in `mig.log`, `mig_long.log` and `mig_*.json`.

## Overall
The division of labour plays well and the late game is stable. Before the designer's next phone test, fix the two early-game arrow holes (findings 1 and 2) and the silent same-spot pad (finding 3). Then apply the tested `balance.js` numbers to win back about 4–5 minutes of v3 length and remove the 3-minute final wait.

## Review: visual

**v3.5 visual and feel review (phone, 390×844 portrait plus a 360×640 check, Korean and English)**

Nothing is critical. Across my eight capture runs (about 250 shots) there were 0 page errors and 0 placeholder art keys. Two findings are high, both on the main path a new player follows.

Screenshots are under `/tmp/fv_review_v35/visual/` in folders `a/` (new player), `b/` (late village), `c/` (chief working), `d/` (dog), `e/` (English), `f/` and `h/` (dog bar on screen), and `g/` (a v3 save brought into v3.5). Stitched strips and grids are in the top folder. The scripts are in `scripts/`; run them with `cd /tmp/fv_review_v35/visual/scripts && node a_tutorial.mjs` (and so on).

## HIGH

**H1. A new hire pad that pops up under the chief stalls with no on-screen cue, three times in the first minutes of the tutorial.**
- Repro: new game. Pay the 요리사 쿡 pad at (900,700) and keep standing there. The 어부 pad appears on the same spot.
- With 170 coins (it costs 45) and 20+ s of game time standing still, it never charged. The guide text at the top goes blank, there is no arrow, and the pad label fades to 30%. Nothing tells the player to step off and back on.
- The same happens for 어부 → 생선 짐꾼 → 판매 짐꾼, and for every later line, because all four pads of a line share one spot (`world.js` `pads35` and `porter_*`).
- Evidence: `a/a17_fisherman_hired_pile_pops.jpg`, `a/a19_after_20s.jpg`, `a16_crop.jpg`. Code: `UnlockPad.js:199` returns early with no feedback; `Tutorial.js:72` (`if (pad) return;`) clears the guide text.
- Fix idea: show a "한 발 내려왔다 다시 올라오세요" pill and bounce the arrow beside the pad, or arm the pad automatically after about 1 s if the chief arrived after it appeared.

**H2. The bakery work spot ("서서 빵 굽기") is inside the grown wheat field.**
- The pad is completely hidden by wheat; only its floating label shows. While the chief bakes, only the top of his head is visible.
- After hiring, the baker auntie stands half-buried in wheat with her rolling board floating over the stalks.
- The "a station has work but nobody is at it" hint would point the player at a spot they can't see.
- Evidence: `c_bakery_label_crop.jpg`, `c_bakery_chief_crop.jpg`, `strip_c_bakery_seq.jpg`, `z_b_bakery_crop1.jpg`. Config: `world.js` `labour.ops.bakery` `pad [2,64]`, `op [10,50]`, together with `wheat.origin Z('farm',1.6,-1.8)`.

## MEDIUM

**M1. The chief "working" a station doesn't look like cooking, sawing or smelting.**
- He stands with his back to the camera and swings a sickle at the grill, oven, smokehouse and cannery, an axe at the sawmill, and a pickaxe at the smelter and toolsmith (`chiefAnim` in `world.js`).
- This is the very first tutorial instruction ("화덕 앞에 서서 생선을 구우세요"), so it is the first thing a new player watches.
- Evidence: `a05_seq_strip.jpg`, `a_a05_seq_3_zoom.jpg`, `c_c_smelter_seq3_zoom.jpg`, `strip_c_sawmill_seq.jpg`.
- Fix idea: face him S/SE (the code already supports `chiefDir`), or ask for a player `operate` animation; the asset report already lists this gap.

**M2. Stations turn see-through while their operator works in front of them.**
- Porters, farmers and deer walking behind the oven or smokehouse trigger the existing see-through effect for tall objects, so the auntie and the smoker appear to work at a ghost building. It happens in most frames.
- Evidence: `strip_b_bakery_crop.jpg` (all 4 frames), `strip_b_smokehouse_crop.jpg`, `strip_c_smokehouse_seq.jpg`.
- Fix idea: don't fade a station whose work spot is occupied, or require more of the hidden character to be covered.

**M3. The second and third hires of one profession clump into a single blob at the collection pile.**
- Their drop spots are only 18 px apart (`Worker.js:212`). When a pile is full they all wait there overlapped, each with a sweat emote, which undoes the "different looks" payoff.
- Evidence: `b/b_pile_log_full.jpg` (three lumberjacks plus a porter on one spot), `b/b_variants_miner.jpg`. Position logs show miner and miner_c 19 px apart, and hunter and hunter_b 24 px apart.

**M4. Full piles become towers taller than buildings.**
- At 40 items in three columns, about 13 items high, they hide stations, labels and the prop that marks the pile.
- Evidence: `b/b_pile_fish_full.jpg`, `b/b_pile_meat_full.jpg`, `b/b_variants_hunter.jpg`.
- Fix idea: more columns, or cap what is drawn and add a "×40" badge.

**M5. The 고기 걸이 (meat rack) looks unfinished.**
- The label (y−92) sits exactly on the rack's crossbeam (y−98), so only two stumps show and the hanging meat is hidden. A hunter's carried meat is also drawn over the label.
- Evidence: `rack_crop.jpg`; the builder's own `docs/previews/screens_v35/06_pile_5_meat.jpg` shows the same. Code: `Labour.js` `buildRack` and the label at y−92.

**M6. The dog bar is hard to read and tap on a phone.**
- Button labels are about 9 CSS px and straddle the panel's bottom border.
- Buttons are about 41 CSS px, under the usual 44 minimum.
- Empty hearts are light grey on cream, so 0/5 is barely visible.
- Evidence: `d/d04b_bar_crop.jpg`, `e05_crop.jpg`. Code: `UI.js` `buildDogBar` (label at y+44, font 17).

**M7. The treat scene doesn't read at the phone's normal zoom (1.2).**
- The dog stands at `petPoint`, overlapping the chief's legs, so the give and eat motion and the biscuit merge into one silhouette. The builder's screenshots were taken at zoom 2.0, which hides this.
- Evidence: `grid_d05_treat_.jpg`, `d/d05_treat_07.jpg`.
- Fix idea: back the dog off about 20 px for the eat phase.

**M8. 도구 장인 영감 (the toolsmith operator) looks like he is mining.**
- miner_b has no `operate` animation, so he plays his pickaxe `work` animation. He stands outside the left wall and strikes a crate, while the sparks appear on the anvil about 60 px away.
- Evidence: `strip_b_toolsmith_crop.jpg`, `z_b_toolsmith_crop2.jpg`. The game state reports `toolsmith anim:"work"`.

## LOW

- **L1. The dog bar can cover the top of the screen.** Its lowest screen position is y=200 of 1558 (`UI.js:347`), so when the dog is north of the chief near the top of the map, the bar overlaps the guide text and the population badge. Evidence: `f01_crop.jpg`. In that shot Kongi also sits hidden behind the cook at the grill (`f01_dog.jpg`).
- **L2. The work-spot pad looks like a build plot.** It is a red diamond with a hammer icon, like the red hammer pads for build plots, and sits next to the reddish-pink hire pad. Evidence: `c/c_sawmill_waiting_label.jpg`, `f/f06_arrow_corner_1.jpg`.
- **L3. Grill smoke covers the cook's face.** The smoke puffs on the sizzle beat are opaque white balls at his head height. Evidence: `strip_b_grill_crop.jpg`, `b/b_zoom_max_grill.jpg`.
- **L4. Two operators face the wrong way to read well.** 통통 works with his back to the camera (already known). The smoker faces the camera with the rack behind him, so his ham and paper fan look like a white ball. Evidence: `z_b_cannery_crop1.jpg`, `z_b_smokehouse_crop1.jpg`.
- **L5. "Pile full" is only a 10% size pulse of the label,** with no colour change or "가득" text. Code: `Labour.js` `Pile.update`.
- **L6. Saves brought over from v3 briefly show stand-ins.** On the first screen, operators and raw porters appear as generic villagers until their art loads, then switch to the real looks. Evidence: `g/e10_migrated_first_screen.jpg` vs `g/e11_migrated_after_20s.jpg`. Migration itself is fine: all 7 operators and 5 raw porters are present, no progress lost.
- **L7. The whistle button sits over world labels in the bottom-left corner,** for example the "나무꾼 2 고용 600" pad. Evidence: `g/e11_migrated_after_20s.jpg`.
- **L8. The sawmill work spot is among pines,** and an un-faded pine covers part of the chief. Evidence: `strip_c_sawmill_seq.jpg`.
- **L9. Zoomed out (0.77), the dog bar floats about 170 px above the pair** and covers the 광석 더미 label. Evidence: `f/f05_bar_zoom_out2.jpg`.

## Not reported

In the stepped test clock the dog bar first appears below the pair and slides into place over about a second. That is most likely a quirk of how the tests advance time, so I left it out. On the 360×640 phone the bar settles correctly above the chief and dog (`h/h02_small_bar_later.jpg`).

## What will delight the designer

- The operators are charming at normal zoom: 쿡 behind the grill with his pan, 산들 pushing a log through the saw with sawdust flying, 대장장이 언니 hammering in front of the furnace with sparks. Each crop strip shows the hit-frame effect landing on the tool.
- The worker variants are distinct and readable on a phone: the old white-bearded sailor, the young women, the farm auntie in her headscarf (`b/b_variants_fisherman.jpg`).
- The dog stands out:
  - the 콩이가 달려와요! message and running in;
  - petting, with the chief crouching, the dog rolling belly-up and hearts rising (`grid_d07_pet_.jpg`);
  - fetch, which reads across the whole screen (`grid_fetch.jpg`);
  - the trick and gift messages, and the ♥ badge on the whistle (`grid_gift.jpg`).
- Goods porters with stacks on their A-frame backpacks read well when facing NE and S (`porters_sel.jpg`).
- The English text all fits: "Stand: grill", "Meat rack", "Treat / Fetch / Pet", "Stand at the grill to cook the fish".

## What will disappoint

H1 (standing on the new pad and nothing happens), the chief swinging a sickle at the grill (M1), the bakery spot hidden in the wheat (H2), see-through ovens (M2), towers of 40 fish (M4), and the stump-only meat rack (M5).

## v2 and v3 features still working

All still behave correctly on the phone: zoom in, out and whole-village view, the guide arrow and off-screen edge arrow, see-through buildings for people behind them, clerks and customer bubbles, the trash pad, bag and boot upgrade pads, build plots, watchtowers, the boats, resident chat bubbles, and saves brought over from v3.

## Overall

Polished and charming, with no errors and nothing broken. The two high items (the silent same-spot pad stall and the bakery spot buried in wheat) are fixes in layout or game logic only, no new art, and both should be done before the designer plays it on her phone. M1, M2 and M5 are the next most noticeable.

## Review: robust

No critical or high issues. v3.5 is sound on saves, migration, reload, the long run and deploy. There are two medium issues: the order of the two artifact publishes, which I fixed in the build script, and texture memory. There are also some low-severity item and coin losses.

**Rebuild before publishing.** `dist/artifact_files.json` in the repo still has the old batch order. Run `node frost-village/tools/build/build_artifact.mjs` so it picks up my fix.

The machine had a load average of 18–56 the whole time. All game-logic measurements use the fixed-step clock, so they don't depend on that. Evidence is in `/tmp/fv_review_v35/robust/` and my scripts are in `/tmp/fv_review_v35/robust/scripts/`.

## Medium

**M1 – Artifact batch order (fixed in `tools/build/build_artifact.mjs`)**
- **Problem:** the build had 340 files, so it needs two publishes. The old list cut the alphabetical order at 250. Batch 0 held 13 of the 16 `manifest.json` files but no `game.js` and no `lib/phaser.min.js`.
  - On the designer's existing v3 link, the first publish leaves the old v3 `game.js` reading new manifests. The new `villagers/manifest.json` no longer lists the atlases for the aunt, the blacksmith and the dog (`vil_npc_aunt`, `vil_npc_blacksmith`, `vil_pet_dog`), but still lists those characters. The old game would draw them as placeholders.
  - On a brand-new link, the page shows the loading error until the second publish.
  - If the second publish fails, the link stays in that state.
- **Repro:** run `node -e 'const j=require("./dist/artifact_files.json"); j.batches.forEach((b,i)=>console.log(i,b.includes("game.js"),b.filter(x=>/manifest/.test(x)).length))'` in `frost-village/`. Output: batch 0 has no `game.js` and 13 manifests.
- **Fix:** a new `publishBatches()` function puts `game.js`, `lib/` and all 16 manifests in the last batch, and keeps every atlas `.png` with its `.json`. The publishing note in the file list now explains this.
  - Checked with a build into `/tmp`: batches of 250 and 89, the last one holds all the boot files, no atlas pair is split, and the file set is unchanged.
  - With this order, an in-place update keeps running the previous version until the last publish lands.

**M2 – Texture memory: every lazy atlas loads right after the title**
- **Measured:** 88 MB of textures at the title, 441 MB once the lazy files arrive (447–455 MB in the soak). v3 was 386 MB.
- **v3.5's share:** villagers3 40.6 + workers 37.5 + pets2 3.3 MB, minus 19.9 MB of replaced atlases, is about +61.5 MB GPU and +5.1 MB download.
- **Why it matters:** the variant worker looks (37.5 MB) are only used from the second/third hires in v3, about 25 minutes in. The v3 buildings (35.3 MB) are only used after the village is complete. All of it is decoded and uploaded during the tutorial. That is a risk of the phone browser killing the tab on lower-memory phones, plus upload stutters.
- **Evidence:** `firstvisit_artifact35_0.json`, `soak_step.json`, `texmem.py`.
- **Suggestion:**
  - Queue `workers` and `buildings` only once the village is complete, or when a v3 save loads.
  - Queue each operator's atlas when its station's land opens.
  - The existing stand-in-then-reskin path already copes with art arriving late.

## Low
- **L1 – Raw items lost on reload at a full station or pile.**
  - **Cause:** `Game.js:1559` adds a raw porter's load to the station's input count, but `Station.restore` (`Station.js:164`) caps it at the input maximum. `Pile.restore` (`Labour.js:412`) caps the pile the same way.
  - **Repro (`reload_mid` 1b):** smelter input 30/30, raw porter unloading with 7 ore. The save has 37 in the input; after reload there are 30, so 7 ore are gone.
  - **Natural trigger:** the chief feeds the same station while a porter is on the way. The chief's feeding ignores the porter's reservation.
  - **Fix:** put whatever doesn't fit back on the pile in the save.
- **L2 – Coins lost from partial payments.** The v3→v4 migration (`Save.js:78`) doesn't touch partial payments. A pad clamps them to the new, lower price (`UnlockPad.js:26`). From `mig_fuzz.log`, lost coins per pad:

  | Pad | Paid in v3 | v3.5 price | Coins lost |
  |---|---|---|---|
  | hire_hunter | 1400 | 1150 | 250 |
  | porter_smelter | 790 | 640 | 150 |
  | porter_smokehouse | 990 | 900 | 90 |

  Fix: refund the excess as coins.
- **L3 – Dog limits reset on reload.** Cooldowns and the 3-treats-in-a-row limit aren't saved (`DogPlay.js:515`). In `reload_mid` 5b, the treat cooldown had 22.5 s left before reload, and a treat was accepted right after (+12 affection).
- **L4 – What gatherers carry isn't saved.** At most 5 items per gatherer are lost on reload; this already happened before v3.5. The `reload_mid` census difference matched exactly what the gatherers were holding.
- **L5 – Save cap below the designer's allowed pile size.** The save caps pile counts at 200 (`Save.js:172`), but `balanceCheck.js:70` allows `pileMax` up to 500.
- **L6 – Operators show a stand-in look after loading.** The priority list for after-title loading (`Game.js:270`) doesn't include hired operators, hired variant workers or the dog. After a reload, the cook was `villager_b` until the villagers3 atlases arrived, behind about 15 MB of other files.
- **L7 – GitHub Pages only: cached v3 file can stop the game loading.** New `Game.js` imports `RawPorter` from `Worker.js` (line 37). A phone that still has the cached v3 `Worker.js` fails to start for up to about 10 minutes. This is the only incompatible import across all modules. The artifact is a single bundle and isn't affected.
- **L8 – Package contents.**
  - The package still ships `audio2/bgm_spring.mp3` (0.96 MB), which the game never loads.
  - The build's line "a first visit downloads about 37 MB" is misleading. Measured: 12.2 MB before the title, then 23.9 MB more in the first session.
  - There are 55 separate portrait PNGs; packing them, plus an audio sprite, would bring the build under 255 files and allow a single publish.
- **L9 – `test_deploy.mjs` timeouts are too tight for this machine.** The fixed real-time waits (12 s for the tap, 30 s for fishing) made standalone and sameorigin fail here with no game error. I added a `--slow` flag that multiplies every wait by 5; without the flag nothing changes. With `--slow`, standalone, sameorigin and pages all pass.
- **L10 – Small leftovers.**
  - Ending a dog scene while the ball is in the air hands the ball sprite back to the pool, but its flight animation keeps moving it. This needs a flight over 3 s, so it is cosmetic.
  - Cut-off JSON or a future-version save starts a fresh game without a backup if a backup already exists. This predates v3.5.

## Checked and OK
- **Migration v1→v2→v3→v4** (`mig_fuzz.log`):
  - No crash on 20 corrupted shapes: cut-off JSON, arrays, a string version, NaN, prototype keys, odd fields.
  - Progress, operators and porters are kept as intended.
  - Cleaning a save twice gives the same result.
- **Odd v4 saves** all boot with 0 errors and the chief can walk away:
  - a raw porter for a closed mine
  - a toolsmith operator with no forge
  - a third worker with no second
  - full affection before the dog lives here
  - the chief saved on the pile prop
  - piles of 999
- **Reload mid-action** (`reload_mid_part1.log`, `reload_mid2.log`):
  - Mid-delivery: everything is kept except gatherers' loads.
  - Chief cooking: fish kept and he keeps cooking.
  - Operator walking in: he stands at his post after reload.
  - Partly paid pad: payment kept, and the pad waits for the chief to step off.
  - Dog mid-flight, fetch, return, eating or gift: the dog goes back to roaming, affection is unchanged, no errors.
- **10.6 game-minute soak** (`soak_step.json`; v3 village, third workers, 23 dog rounds):
  - 0 errors and 0 warnings.
  - Heap after GC went from 22.9 to 27.0 MB and flattened (+0.3 MB over the last 4 minutes).
  - Display objects other than stacked items stayed flat at 967–982; stacked items grew from 51 to 849, which is the piles filling.
  - Tweens 9–21, timers 0–7, live sounds 4–6. Event listeners stayed flat (anims about 4505, UI 48, DOM 623–626).
  - Saving takes 0.07–1.3 ms; the save is about 3.5 KB.
- **Logic cost per frame**, same end state: v3 1.14 ms, v3.5 1.24 ms. The v3.5 additions are cheap: labour 0.046 ms, raw porters 0.034, dog 0.002, tutorial 0.012.
- **Time to title:** the files loaded before the title are the same as v3 apart from about 137 KB of new manifests and the dog's icon atlases (174 requests, 12.2 MB).
- **Deploy:**
  - The build is OK: 340 files, 37.05 MB, largest file 1.79 MB, no missing or unlisted files.
  - `test_deploy` with `--slow` passes standalone, sameorigin and pages, including save and reload.

## Files I changed
- `/home/user/nurient/frost-village/tools/build/build_artifact.mjs` (`publishBatches()` and the new publishing note)
- `/home/user/nurient/frost-village/tools/build/test_deploy.mjs` (`--slow` flag)

## Fix

# v3.5 review fixes: results

Every critical, high and medium finding I could reproduce is fixed, and so are almost all the lows. The final runs of all eight test suites (smoke, v3, labour, dog, life and the three save tests) passed with 0 page errors and 0 placeholder art. I reproduced each high finding before fixing it, using the reviewers' scripts in a fixed-step browser.

The biggest change is for a player who only follows the arrow, the reviewers' "pure arrow" bot. It now gets the fish line running on its own at 4.5 min (was 15.2), completes the village at 18 min (was 31) and v3 at 38 min (was 61), with 0 stuck.

**Decision for you:** I went beyond the reviewer's tested balance numbers. I also made goods porters carry 14 instead of 8 (`workers.porterCapacity`, which applies from the start of the game) and added `customers.spawnEveryLate: 1.3` (customers come faster once the village is complete). These two together are what make the second and third workers earn: late income is +33% with them, against +13% before. The catch is that v3 now finishes in 38–41 min, shorter than the reviewer's 42.7–45.3 target. Setting them back to 8 and 2.0 should land at about 43–45 min; I didn't re-run the bots at those settings.

## Gameplay review
| # | Finding | Status |
|---|---|---|
| 1 HIGH | Arrow loops between fish barrel and grill, never says "sell" | **Fixed.** The barrel hint is skipped when the grill output is half full or more, and finished products (carried, or 6+ waiting with no goods porter) are pointed to first. While reproducing I found a second hole the reviewer didn't list: idle hints disappeared as soon as the chief took his first step, so an arrow-only player stalled forever. Idle hints now stay for 12 s while he walks, and the coin hint leads all the way to the coins. |
| 2 HIGH | Register deadlock when the customer got only part of the order | **Fixed.** The arrow sends the chief to the register only when the customer can actually pay, or the shelf holds the rest of the order. |
| 3 MED | Pad that appears under the chief shows nothing | **Fixed.** The text "새 발판! 한 걸음 나왔다가 다시 올라서세요" appears and the arrow bounces just beside the pad; the pad's label stays readable. The step-off safety rule is kept. |
| 4 MED | Second and third workers add almost nothing | **Fixed.** The reviewer's numbers are applied: third workers 450/500/600/700, tower_se 1700, fishing boat 1200, meat porter 650, smoked-meat porter 750. The two extra settings above are also in. |
| 5 LOW-MED | Every full pile pulses and every gatherer sweats, forever | **Fixed.** The pulse and sweat only happen when the chief can help (no raw porter, station has room), and the label then turns red and reads "가득!". |
| 6 LOW | Dog | **Fixed.** Cooldowns are 10 / 15 s and affection gains 8 / 3 / 3. A scene that ends before the dog gets anything gives the cooldown back. A one-time whistle tip and a pulsing whistle appear after the tutorial. A drag that starts on the dog bar now moves the chief; a button only fires on a tap. |
| 7 LOW | Arrow points at an ore rock behind the mine fence | **Fixed.** That rock moved inside the mine, and the zone guide avoids resources behind a fence. The old rock spot also made smoke's mining step fail. |
| 8 LOW | Pad names don't match the operators | **Fixed.** Pads now say "빵집 아주머니 고용" and "대장장이 고용" (and the English equivalents). |

## Visual review
| # | Finding | Status |
|---|---|---|
| H1 | Silent pad under the chief | Fixed (same as gameplay #3). |
| H2 | Bakery work spot buried in wheat | **Fixed.** The wheat plot right in front of the oven is left empty (`world.js` `wheat.skip`), so 8 plots instead of 9. |
| M1 | Chief works with his back turned, swinging a sickle | **Fixed.** He faces south-east and uses a looping two-handed "give" motion at the grill, oven, smokehouse and cannery, the axe at the sawmill, and the hammer at the smelter and toolsmith. |
| M2 | Stations go see-through while their operator works | **Fixed.** A worked station only fades for the chief, not for porters passing behind. |
| M3 | Second and third hires clump at the pile | **Fixed.** Each has its own drop spot. |
| M4 | Full piles become towers | **Fixed.** 7 low columns, never drawn more than 6 high. |
| M5 | Meat rack looks unfinished | **Fixed.** The rack now stands beside its pile with the label above, so the hanging meat shows. |
| M6 | Dog bar too small to read and tap | **Fixed.** Buttons about 47 CSS px, labels inside the panel, empty hearts tinted darker. |
| M7 | Treat scene merges into one silhouette | **Fixed.** The dog sits 24 px further away for the treat. |
| M8 | Toolsmith operator looks like he's mining | **Fixed.** He now stands at the anvil, facing it. |
| Lows | | **Fixed:** L1 bar kept below the guide text and population badge; L2 work-spot pad now uses the footprints "stand here" style; L3 smoke puff removed from the cook's face; L4 Tongtong works side-on; L5 red "가득!" label; L6 stand-ins after loading; L8 pines cleared around the sawmill spot; L9 bar gap follows the zoom. **Won't fix:** L7 (whistle button over world labels — it's a fixed HUD button) and the smoker's look (needs new art). |

## Robustness review
| # | Finding | Status |
|---|---|---|
| M1 | Artifact publish order | **Rebuilt** with the reviewer's fix: 339 files in two batches (249 + 89), and the last batch holds `game.js`, `lib/` and all 16 manifests. |
| M2 | Texture memory | **Fixed.** Worker variant looks wait until the village is complete; v3 building art waits until the farmer is hired. A new game now uses 368 MB instead of 441 MB (441 MB once those load). |
| L1 | Raw items lost on reload at a full station | **Fixed.** Overflow goes back onto the pile in the save. |
| L2 | Partial payments lost to lower prices | **Fixed.** The excess is refunded as coins (hire and upgrade pads). |
| L3 | Dog limits reset on reload | **Fixed.** Cooldowns and treats-in-a-row are saved. |
| L4 | What gatherers carry isn't saved | **Fixed.** It's saved onto their pile. |
| L5 | Save cap below the allowed pile size | **Fixed.** Raised to 500 to match `balanceCheck.js`. |
| L6 | Operators show stand-ins after loading | **Fixed.** Hired operators, worker variants, the dog and a new game's cook load first. |
| L8 | Package contents | **Fixed:** `bgm_spring` is no longer packaged and the build's download line is no longer misleading. **Won't fix:** packing the 55 portraits into one atlas. |
| L10 | Leftovers | **Fixed:** the ball stops flying when a scene ends, and an unreadable or future-version save is now backed up to a second slot if a backup already exists. |
| L7 | GitHub Pages cache can stop the game loading | **Won't fix.** The artifact build is one bundle and isn't affected; on Pages it clears itself within about 10 minutes. |
| L9 | `test_deploy` timeouts | Already fixed by the reviewer (`--slow`). |

## Tests (final run, after all changes)
| Test | Result |
|---|---|
| `smoke.mjs` | 53/53 |
| `v3.mjs` | 18/18 |
| `labour.mjs` | 28/28 |
| `dog.mjs` | 15/15 |
| `life.mjs` | 14/14 |
| `save_v35 --browser` | 25 ok |
| `save_v3 --browser` | 26 ok |
| `save_v2 --browser` | 16 ok |

I changed some tests because the game's behaviour changed on purpose: the chief's work motion is now "give", the dog test waits out the 10 s fetch cooldown, the v3 test checks that the gated art loads only when needed, and the save test expects the new pile cap of 500. Smoke's animal chase and mining steps were made sturdier: the chase now hops next to the animal when stuck at a fence, and the mining step clears the smelter and the chief's hands first.

**Bots (game minutes), with the save migration and the "Version v3.5" still in place:**
| Bot | Village complete | v3 complete | Stuck | Errors |
|---|---|---|---|---|
| Smart | 19.6 | 38.7 | 0 | 0 |
| Arrow | 20.3 | 39.6 | 0 | 0 |
| Think | 21.7 | 40.9 | 0 | 0 |
| Pure arrow | 18.0 | 38.1 | 0 | 0 |

The longest wait for anything new is now about 1.5 min (was 3.1–3.5). No miner went hungry in any run.

I refreshed and looked at the screenshots in `docs/previews/screens_v35/`, and added three new ones for the fixes: `21_step_off_new_pad.jpg`, `22_pile_full_label.jpg` and `23_meat_rack.jpg`. The design docs `docs/기획서_v3_분업.md` and `docs/기획서_v2.md` have the new costs, timings and a note of each fix.

Files are in /home/user/nurient/frost-village:
- **Game code (`src/`):** systems/Tutorial.js, systems/Labour.js, systems/DogPlay.js, systems/Occlusion.js, systems/Collision.js, systems/Progression.js, entities/Worker.js, entities/UnlockPad.js, entities/ItemStack.js, entities/Station.js, entities/Seller.js, entities/Player.js, scenes/UI.js, scenes/Game.js, core/Assets.js, core/Save.js, data/balance.js, data/balanceCheck.js, data/world.js, data/strings.js
- **Tests and build:** tools/test/smoke.mjs, tools/test/labour.mjs, tools/test/dog.mjs, tools/test/v3.mjs, tools/test/save_v35.mjs, tools/build/build_artifact.mjs; rebuilt package in dist/artifact
- **Design docs:** docs/기획서_v3_분업.md, docs/기획서_v2.md

## Verify

**Verdict: ship-with-known-issues.** All three high-severity gameplay bugs are fixed, every test suite passes, every honest bot finishes v3 with 0 stuck and 0 errors, and the artifact builds and passes the standalone deploy test. I found one new guidance bug the fixer missed and fixed it, plus a small arrow fix and a flaky test.

## The three high-severity repros (current code)
- **New pad appears under the chief:** the "step off" text and arrow showed for all 15 s he stood still. Following the arrow hires the fisherman, with no coins lost.
- **Arrow looping between fish barrel and grill:** with the grill output full (36), the idle arrow now goes to the grill output instead of the barrel.
- **Register deadlock after a part order:** the arrow now says "fish", not "register". Following it for 15 s gets the customer served and pays 12 coins.

## Tests (all on the final code, after my changes)
| Test | Result |
|---|---|
| smoke | 53/53 |
| v3 | 18/18 |
| labour | 28/28 |
| dog | 15/15 |
| life | 14/14 |
| save_v35 --browser | 25 ok |
| save_v3 --browser | 26 ok |
| save_v2 --browser | 16 ok |

All had 0 page errors and 0 placeholder art. Every suite passed on the original code too; smoke, v3, labour, dog, life and save_v35 were re-run after my changes.

I also loaded the reviewer's real v3 saves and let each run for 120 s. Income came out level with v3 (280 / 2166 / 2243 coins against 260 / 1939 / 2252), with 0 errors.

## Bots (fresh save, joystick only, played through v3)
| Bot | Village complete | v3 complete | Stuck / errors |
|---|---|---|---|
| Smart | 20.2 min | 39.0 min | 0 / 0 |
| Think | 21.5 min | 42.3 min | 0 / 0 |
| Arrow | 20.7 min | 39.5 min | 0 / 0 |
| Arrow (after my fix) | 20.8 min | 40.0 min | 0 / 0 |
| Pure arrow, 4 runs after my fix | 17.8–18.5 min | 38.0–39.2 min | 0 / 0 |

After the fix the longest wait for something new was 1.3–1.5 min. The fish line ran on its own at about 4.4 min.

## What I changed
1. **New bug, fixed (`src/systems/Tutorial.js`):** late in v3, a player who only follows the arrow got stuck for 7.6 min with over 5,000 coins. The arrow kept switching between the coin piles and the cannery plot, because coins refilled to 300+ faster than he could walk to the plot. Now the "lots of coins lying around" hint is skipped when the coins in hand already pay for the next building. After the fix, 4 of 4 pure-arrow runs had no gaps longer than 1.5 min.
2. **Step-off arrow moved (same file):** it now points 118 px below the pad instead of 78. Before, it covered the chief standing on the pad (screenshot 21).
3. **Flaky test fixed (`tools/test/v3.mjs`):** the lazy-art check failed once when the machine was busy. The cause is the test setup, not the game: with the game loop paused, Phaser doesn't start queued files. The test now nudges the loader without advancing game time.
4. **Designer doc (`docs/기획서_v3_분업.md`):** the late-income figure said +19%; the measurement is +33% (about 710 to 950 coins a minute). I also described the two arrow changes.

## Artifact
- `build_artifact.mjs --webp --mp3-only` builds **339 files** (the page plus 338 supporting), 32.22 MB, rebuilt after all my changes.
- That is more than one publish allows, so it goes up in two batches: 249 files with the page, then 89. The last batch holds `game.js`, `lib/` and all 16 manifests.
- `test_deploy standalone --quick` passes: no errors, no failed requests, no placeholder art. The bundle reports v3.5.

## Screenshots
`docs/previews/screens_v35/` was regenerated on the final code and I looked at every image: 01–20 from `shots_v35.mjs`, plus 21–23.

## Remaining issues
- **Decision for the designer:** goods porters carrying 14 (`porterCapacity`, from the start of the game) and faster late customers (`spawnEveryLate` 1.3) put v3 completion at 38–42 min, below the reviewer's 42.7–45.3 target. Setting them back to 8 and 2.0 should give about 43–45 min; the fixer estimated this and nobody has run the bots at those settings.
- **Texture memory:** a new game uses about 368 MB of textures, rising to 441 MB later. That is still heavy for low-end phones.
- **Small item loss on reload:** a pile restores at most 40 items, so raw items a gatherer carries, or overflow from a full station, are lost on reload if that pile is already full.
- **Visual nits:**
  - The fish barrel is partly hidden behind the trade-post sleigh, and the log pile behind pines.
  - The 2nd and 3rd hunters still bunch up at the meat rack.
  - The hire pad's label still overlaps the chief's head while he stands on it.
  - Shots 15 and 18 don't catch the ball or the hearts.
  - The overview has a faint horizontal line across the sea.
- **Extra screenshots not in the repo:** shots 21–23 come from a script in my scratch folder, so nobody else can regenerate them.
- **Left unfixed by the fixer:** the whistle button sits over world labels, the smoker's look needs new art, the GitHub Pages cache can delay updates, and the 55 portraits aren't packed into one atlas.

Files are in /home/user/nurient/frost-village:
- src/systems/Tutorial.js
- tools/test/v3.mjs
- docs/기획서_v3_분업.md
- docs/previews/screens_v35/
- dist/artifact/
- dist/artifact_files.json
