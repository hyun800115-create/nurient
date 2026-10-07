Frost Village v3 is in place in `/home/user/nurient/frost-village`, built on top of v1/v2. All browser tests pass (smoke 46/46, v3 18/18, save v2 and v3, life 14/14, zoom). The final bot run finished v3 with 0 stuck events and 0 errors. I ran no git commands that change state.

**What was built (items 1–10)**
1. **Assets:**
   - The buildings art loads after the title screen.
   - Porters carry on their backs and the chief on his head.
   - Clerks ring the register on the hand-over frame of their serve animation.
   - The trade-post clerk stands behind the stall and the merchant in front.
   - The store clerk is drawn between the shop and its counter (d / d+0.5 / d+1).
2. **New land:**
   - There are three fog-walled lands: east, south and southeast.
   - Each watchtower pad takes coins. Porters then bring the planks and ingots, builders put the tower up and it lights.
   - The fog then rolls back and the camera pans in.
   - Walking and camera limits follow the open land.
3. **Plots and building:**
   - There are 14 plots: small, medium, large and the boathouse's shore plot.
   - Standing on a plot opens a build menu of cards showing picture, cost, materials, purpose and why a card is locked.
   - Building goes foundation (porters deliver) → scaffold with hammering builders → done.
   - Big plots are kept for big buildings until all of them stand, which stops a player blocking the store with houses.
4. **Production chains:**
   - The toolsmith only forges tools a hire pad is waiting for, or that the store will sell.
   - Second workers and the fishing boat need a tool delivered to the pad.
   - Miners eat from a food box.
   - The cannery turns 3 fish and 1 ingot into 3 cans.
   - The general store has a register, a clerk and porters.
   - The warehouse stores overflow and restocks shelves that run low.
5. **Houses:** the population limit is 19 plus each house's capacity. People wait past the limit, then walk in to a new house.
6. **Boats:** the rowboat rows out with a wake and brings back 6 fish. The fishing boat costs 1500 coins plus a rod and brings back tuna. There is a horn and a porter for the dock.
7. **Progression:** 12 main goals with arrows and goal text, and the v3 progression table is in `docs/기획서_v2.md`.
8. **Save:** v2 saves migrate to v3 (progress kept, `VERSION 'v3.0'`). Damaged v3 fields are cleaned up on load.
9. **Performance:** ground tiles are baked only when the camera comes near, and off-screen effects and sounds are skipped.
10. **Tests and screenshots:** see below.

**Fixed while testing:**
- A build menu opened and closed in the same frame left the village paused for good.
- Porters circled forever when a road point sat inside a prop; they now skip it after 3 s.
- Some pads and unload spots were blocked or unreachable on some plots. An audit of every building on every plot now passes.
- Several layout clashes in the new lands were fixed.
- The objective text on a plot or tool pad showed "{name}".
- The smoke test's reset button tap had been off since the Reload button was added.

**Progression (bot-measured)**

| # | Goal | Unlocks after | Coins | Materials |
|---|---|---|---|---|
| 1 | East watchtower | Hire hunter | 300 | 10 planks |
| 2 | Toolsmith | East land | 400 | 8 planks, 4 ingots |
| 3 | Feed the miners | Toolsmith | – | bread or smoked meat |
| 4 | Lumberjack 2 | Toolsmith | 600 + axe | – |
| 5 | Boathouse | Toolsmith | 700 | 12 planks, 2 ingots |
| 6 | Rowboat | Boathouse | 700 | – |
| 7 | South watchtower | Rowboat | 1100 | 16 planks, 4 ingots |
| 8 | Warehouse | South land | 600 | 14 planks, 4 ingots |
| 9 | Cannery | Rowboat | 1000 | 12 planks, 6 ingots |
| 10 | Store | Cannery | 1300 | 16 planks, 6 ingots |
| 11 | Southeast watchtower | Store | 2200 | 24 planks, 10 ingots |
| 12 | Fishing boat | Cannery and rowboat | 1500 + rod | – |

Side goals: houses (80 / 160 / 320 coins for +2 / +3 / +4 people), the other second workers (500–1200 coins plus a tool), new porters and the store clerk.

**Timing from bot runs:**
- The village core finishes at 17–19 min and v3 completes at 37–43 min, so v3 itself takes 20–24 bot minutes.
- Using the bot-to-player ratio from v2 (about 1.3–1.5×), that is roughly 28–36 minutes for real players. That number is an estimate, not a measurement.
- The first watchtower pad appears right after the village core is done.
- Gaps between new goals: median about 0.5 min, 90% under 1.3 min. The longest is 2.9–3.6 min, spent saving up for the last tower or the fishing boat.

**Other test numbers**
- **Save tests:** `save_v2.mjs` and `save_v3.mjs`, Node and browser parts, both pass.
- **Clerk view:** ran with no errors.
- **Performance** (everything unlocked, 60 characters, about 1300 objects): game logic takes 0.5–1.1 ms per frame on average, at most 2.5 ms at the 95th percentile. Ground tiles baked: 4 at the start, 6 after unlocking, 12 of 12 only after visiting the whole map.
- **10-minute soak:** 0 errors and 0 warnings. Heap after garbage collection went from 19.6 to 23.0 MB. The display list grows only because item stacks fill up; with stacked items subtracted it stays flat at about 980 over 15 game minutes, so it is not a leak.
- **Artifact build:** works. It has 294 files, more than the 255 one publish allows, so it has to go up in two batches (the build script lists them). Total 32 MB.

**Screenshots**
I looked at each one and changed the camera and timing in the script where they were wrong. They are in `docs/previews/screens_v3/`:
- `01_fog_wall_tower_pad.jpg` to `21_v3_complete.jpg`: fog wall, porter carrying planks, tower scaffold, tower lit, fog clearing, new land, build menu, foundation, scaffold, building done, toolsmith working, tool-gated hire pad, hungry miner at the food box, house move-in, rowboat wake, cannery, store with clerk and queue, warehouse, fishing boat, overview, finale.
- `test_*.jpg`: shots taken by the v3 test.
- The smoke test's v3 shots (`19b`–`19l`) are in `docs/previews/screens/`.

**Known issues**
- Miners were never hungry in the bot runs, because porters fill the food box first. The hunger only shows if bread or meat delivery falls behind.
- The warehouse stays fairly empty while the economy flows well. Goods only go into it when no site, workshop, food box or nearly empty shelf needs them.
- No new residents arrive with the new lands. Houses are needed mainly for the last six people who arrive late in v2.
- There is a slight hard seam where two fog banks meet at the southeast corner, and the fog-clearing screenshot is still mostly fog.
- The store clerk shows only head and shoulders above the counter. That is the counter overlay working as designed, but the clerk reads small.
- `bgm_spring` is still in the build even though v3 doesn't play it.
- The operators/division-of-labour plan in `기획서_v3_분업.md` is not implemented (outside this brief), and the villagers3, pets2, workers and town art is not loaded.
- The slower bot settings sometimes pay into pads by accident while standing on them. That is a bot habit, not a game bug.

New files are `tools/test/v3.mjs`, `save_v3.mjs`, `shots_v3.mjs` and `dev_run.mjs`. Updated tests are `smoke.mjs`, `save_v2.mjs`, `perf_v2.mjs` (`--v3`), `review_robust_soak.mjs` (`--v3`), and the bot in `review_gameplay_bot.js` / `review_gameplay_sim.mjs`. Game changes are in `src/data/world.js`, `balance.js`, `strings.js`, `src/systems/Progression.js`, `Tutorial.js`, `Roads.js`, `src/entities/Worker.js`, `Site.js`, `src/scenes/UI.js` and `Game.js`; the docs changes are in `docs/기획서.md` and `docs/기획서_v2.md`.