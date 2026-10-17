# fix:code1

All review findings are now handled: every high and medium that reproduced is fixed, along with most of the lows. Three things are still open. The late-village balance needs a designer decision. The `v42.mjs` panel-open time and `reqlog42` still fail on this loaded machine. M4 and L4 are deferred to CODE-2. Nothing is committed.

The report is at `/home/user/nurient/frost-village/docs/build_reports/v42_code1.md`. I also updated the measured tables in `docs/v42_plan.md` (§4.5, §15) and added a "리뷰 뒤" section and two new number rows to `docs/기획서_v4_2_촌장.md`.

**Gameplay review**
- **H1 (물류 금고 coins lost)**: fixed. The courier collected 256–697 per run (was 0). Coins survive a reload: 1,037 → 1,041 and 900 → 900 (was 1,293 → 4). Nothing created or lost.
- **H2 (길 안내 flipping)**: fixed. One place per load over 90 s (was 7 to 15 changes). Ingots changed once, when the cannery input filled.
- **M1, M2, M3**: fixed.
- **M4 (고용만 hires nobody)**: fixed. Reproducing it found a crash: paying a staff hire pad by standing on it threw an error that would show the crash card on the first staff hire. Fixed.
- **M5 (late-village overflow)**: fixed in part. Measured on the 46-min save over 60 game minutes, v4.1 → as reviewed → final:
  - market shelf empty (bread / meat / fish): 21/55/5 → 8/27/1 → 0/10/0 %
  - 교역소 empty: 92/97 → 71/76 → 0/0 % (the merchant now keeps 2 of each on display; stock is down to those 2 about 75 % of the time)
  - smelter / sawmill output full: 65/59 → 26/3 → 15/2 %
  - 창고 average: 4 → 174 → 168
- **M5, still missing**:
  - Raw piles are full 97 % of the time (gate ≤ 50 %): the ore and meat gatherers out-produce their stations.
  - The dock peaked at 268 crates. It no longer grows and ended at 88, but the gate is one train load.
  - Income is +29 to +37 % against the +30 % cap. The plan's first two levers can't close that: exports are about 1 % of income and 물류창고 sales 1.4 %. The third lever, 가공소 2단, would refill the outputs. I left all three unchanged; the designer should decide.
- **M6, L1–L5, L7**: fixed.
- **L6**: the caption is fixed; the target hopping stays by design.
- **L8**: left for CODE-2, which brings the real halo art.

**Robustness review**
- **H1 (publish over 511 files)**: fixed. The build now lists 125 stale paths to send as `null` and fails if a publish would go over 511.
- **H2 (depth inside cutaways)**: fixed. The chief is drawn on the bank floor and inside the depot; the courier is hidden by a closed bank.
- **H3 (textures never released)**: fixed. At the plaza after a depot visit: 364.6 MiB, was 424.
- **M1, M2**: fixed. While fixing M2 I found and fixed an older v3 bug: the food box lost stock on reload whenever it was more than half full.
- **M3**: fixed. Staff wear their own looks after a reload.
- **M4 (draw calls)**: deferred. The generated placeholder textures go away when CODE-2 adds the real art; measure then.
- **M5 (logic time)**: not re-measured; the machine load (4–20) makes it meaningless here.
- **L1, L3, L5, L6**: fixed. **L2**: sign moved; the building is CODE-2 art. **L4 (Canvas tints)**: not fixed; those pieces are placeholders.

**Test results**
- **Node tests**: all pass; layout check and balance check clean.
- **smoke, save, core suites**: smoke 53/53, v4 46/46, labour 28/28, pickup 31/31, nav 12/12; save_v2/v3/v35/v4 pass.
- **Other browser suites**: rail 35/35, town 17/17, restaurant 30/30, plots 34/34, dog 15/15, zoom pass, c2 39/39.
- **pilot**: 10/10 (30-min 관망 soak, 0 coins spent, income 87 % of the arrow bot).
- **visitors42**: 95 % of v4.1.
- **v3**: 18/18, but one of four runs was 17/18 (the warehouse check timed out). **life**: 14/14 on rerun after one 13/14.
- **`v42.mjs`**: 33/34. The failure is the panel-open time. A repeated-open probe shows the first opening stalls 1.3–3 s on this machine; the last committed snapshot (3c326a2, before the builder's final changes) stalls 1.8 s too, so it predates these fixes. Later openings take 6–30 ms.
- **`reqlog42`**: 3/5. I fixed a race in the test that caused 21 duplicate manifest requests at boot. One resident's look or voice still loads in a different phase from run to run. The same variation shows against the committed snapshot, so it isn't from these fixes. Both should be rerun on a quiet machine.
- **Pacing (fresh game, smart bot)**: village complete 19.3, 5 shops 37.0, 읍 44.8 min (v4.1: 19.8 / 38.7 / 48.2); all gates pass.

`shots_v42.mjs` produced 37 screenshots and I looked at them: halo, nav chip and edge badge, office sign, bank and depot cutaways with people inside, sleigh, panels, 관망 caption, 360×640. The older suites' screenshot folders, which these runs overwrite, are restored to their state before the runs.

Evidence logs are in `/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v42code_fix/`.