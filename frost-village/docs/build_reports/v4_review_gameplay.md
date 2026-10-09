# v4 review:gameplay

The v4.1 build plays end-to-end without errors for players who carry goods themselves, but a player who mostly follows the arrow never reaches 읍. I found 3 high and 5 medium gameplay/economy issues; several have balance.js fixes I tested in bot runs.

All runs used the fixed-step clock on the current code, moving only through `__FV.setInput`. Every run had 0 page errors and 0 stuck events.

**Bot runs (game minutes)**

| Milestone | smart | arrow | think (1.5 s) | arrow-only | arrow-only + porter fix |
|---|---|---|---|---|---|
| Village complete | 19.6 | 21.3 | 22.1 | 18.2 | 18.8 |
| tower_east | 19.9 | 21.5 | 22.5 | 18.7 | 19.0 |
| Station built / first train | 22.2 / 22.3 | 23.3 / 23.4 | 24.4 / 24.5 | 20.5 / 20.6 | 21.4 / 21.5 |
| First shop / town visit | 24.0 / 24.9 | 25.1 / 26.3 | 26.2 / 27.3 | 27.3 / 30.3 | 28.1 / 29.7 |
| 5 shops | 38.2 | 42.0 | 48.3 | never (4th shop at 75.7) | 40.3 |
| v3 complete / town hall | 41.3 / 42.9 | 43.8 / 46.0 | 48.9 / 50.9 | 46.2 / 48.7 | 44.0 / 46.6 |
| 읍 | 48.8 | 52.0 | 57.1 | never (85 min) | 55.5 |
| Longest gap after tower_east | 5.4 | 5.2 | 3.7 | 10.5 | 9.0 |

- The arrow-only bot goes only where the arrow points and stands still otherwise.
- "Porter fix" means the station porter puts founding cards above shop restocks, and its founding threshold goes from 4 to 1. I applied it in memory only (`--fixv4`); nothing in the repo was changed.
- BUILD-B had 읍 at 47.5 / 51.5 / 48.2. The v4.1 restaurant and town hall push v3 completion back 3–6 min, and the think bot (57.1) is now outside the 48–55 band.

**High**

1. **An arrow-only player stalls on the order board once the station porter is hired** (and the arrow itself sends players to hire it, as the cheapest pad).
   - The porter always prefers restocking open shops (prio 35, `Logistics.js:23`) and house lots (100) over the loading dock (30). It only takes founding goods when 4 or more sit in an output (`Worker.js:836-844`).
   - The café sells one item every 40 s (`Shop.js:400`), so it always has room. Scenario I (`scen2.mjs I`): with the café open, the porter made 40 s round trips carrying 1–2 bread for 4 minutes. Meanwhile the carpenter card sat at 49/50 with the logistics "want" at 1 plank and 26 planks waiting at the sawmill.
   - The tutorial drops its focus-card arrow as soon as any station porter exists (`Tutorial.js:249`).
   - Arrow-only run: the carpenter card sat at 49/50 for about 19 min. At 84.5 min the bot held 48k coins with the goal text "가게 5곳 열기". The supermarket card (cans) never filled, so 읍 never came.
   - With the porter fix: 5 shops at 40.3 and 읍 at 55.5.
   - Suggested fixes:
     - Give founding needs a dock priority of 38 (above SHOP 35).
     - Only restock a shop when its stock is under 40%, in batches.
     - Use `min(foundingMin, need)` as the founding threshold.
     - Keep the card arrow when the focus founding card has been idle for 60 s or more.
2. **The 슈퍼마켓 card starves whenever the general store already exists**, for example on a real v3.5 save. This is likely the designer's own phone save.
   - Loading the real v3.5 50-min save: 4 shops in 6 min, then cans stayed at 0/20 for 19 min and reached only 6/20 by 30 min. No 읍.
   - The store's can porter wins the trickle of cans (about 6 a minute). The cannery itself behaves the same in the v3.5 build, so this is not a migration bug (`cannery.mjs`).
   - The porter fix alone did not help (`mig50fix`: still 4 shops after 25 min).
   - With the card at cans 10 (`mig50can10`): the card filled at 10.3, the shop opened at 11.9 and 읍 came at 12.2.
3. **The 철물점 tools never reach the dock without the chief.** The C1 forge fix works: the forge now makes the axe and pickaxe.
   - But the card needs only 1 of each, below the porter's threshold of 4. Nothing guides the player: the arrow pointed at `obj_boat`.
   - In scenario A2 the forge was full (12/12, including 3 axes and 3 pickaxes) and the card still showed axe 0/1 and pickaxe 0/1 ten minutes after the general store was built.

**Medium**

4. **A card can become permanently stuck after a reload.**
   - The last item's card completion is delayed 350 ms (`Growth.js:254`). A save in that window, then a reload, leaves the card at 30/30 forever. It cannot be swapped, its shop never opens, and 읍 becomes impossible.
   - Reproduced in scenario H. On phones the trigger is locking the screen at that moment (the game saves on hide) and the tab later being killed.
   - Fix: complete any finished card in `onReady` / `update`.
5. **"다른 주문" throws away a card's progress.**
   - A 생선구이 식당 card at 50/55 came back later at 0/55 (scenario B). The button is one tap with no warning.
   - It appears exactly when a card has been stuck for 180 s, which is the situation in finding 1.
   - Fix: keep `got` for skipped founding cards.
6. **A station porter can freeze holding goods nobody wants.**
   - Scenario C: after the chief finished the 철물점 card himself, the porter carrying 12 ingots for it stood at the dock in "unload" for 7.5+ min.
   - It stays there until standing orders start, which only happens after all 5 shops (`Worker.js:438`).
7. **The end of the game is a long wait for 14000 coins.**
   - Dead gaps: smart 5.4 min, arrow 5.2, porter-fix arrow-only 9.0, and 9.5 after loading the real v3.5 22-min save.
   - The design target is 2.0 min or less.
8. **The happiness bar never matters.**
   - It read 92–100 in every run, because visitors only ask for food that is on the shelf (`Visitor.js:170`).
   - Decor plus the town hall add up to +24, so even 0 satisfaction gives 74, which is above the 70 needed.

**Low**
- An arrow-only player never collects the big restaurant's cash or the hall's tax box (12,287 and 1,405 left lying at 82 min). The idle hint always picks the market's cash first (`Tutorial.js:680-687`).
- Night trains take riders who are asleep or at home (`TownSim.js:831`): of 88 riders, 15 were "sleep" and 29 "home". Between 01:00 and 05:00 there were still 12–25 neighbours in our village. Suggest night 0.3 → 0.1 and skipping those people.
- When 3 founding cards finish at once, only 3 builders exist, so the third shop gets its founder and no builder (scenario E). Cosmetic.

**Checked and fine**
- The first 20 minutes are unchanged.
- The reveal sequence (ruin → station → train → first shop → invitation → visit) unfolds within about 5 min for the smart and arrow bots.
- Real v3.5 saves at 22 and 50 min migrate cleanly: coins, the 45 done steps, buildings, 25 residents and 3 pets are kept. The west strip, rail and ruin appear. A tower_east still under construction is handled. 0 errors.
- Townsfolk over one full game day:
  - The head count always adds up (town + train + village = 122).
  - The school day is believable: walking to school, class, recess, lunch and after-school play.
  - Adults run errands from 08:00 to 19:00.
  - At night about 90 people are asleep, with 1 police patrol and 2 people dozing on benches.
  - At most 5 overlapping pairs per sample, and no visitor stuck.
- No exploit breaks the economy. The dock pays 120% (founding cards) and 100% (standing orders) of the price, and the restaurant 1.3–1.6×, but all are rate-limited, and there is no duplication path.

**Proposed balance.js numbers**

| Key | Now | Proposed | Evidence |
|---|---|---|---|
| `v4.stationPorterFoundingMin` | 4 | 1 | Arrow-only: never → 5 shops at 40.3, 읍 at 55.5. Also needs the code change in finding 1 |
| `v4.founding.shops.supermarket.need.item_can` | 20 | 10 | Migrated save: stuck 30+ min → 읍 at 12.2 |
| `v4.rank[2].coins` | 14000 | 11000 | Estimated 읍: smart 46.7, arrow 50.0, think 55.8; dead gaps about 1.8 min shorter. Re-measure after the porter fix |
| `civic.happyCap`, `v4.happiness.base`, `v4.rank[2].happy` | 24 / 50 / 70 | 12 / 30 / 80 | Only meaningful if visitors can also want food that is out of stock |
| `v4.visitors.night` | 0.3 | 0.1 | Believability |

Everything is in `/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v4_review_gameplay/r2/`:
- Scripts: `sim.mjs`, `bot.js`, `scen2.mjs`, `census.mjs`, `cannery.mjs`, `platform.mjs`, `analyze.py`
- Bot runs: `out/{smart,arrow,think,pure,purefix}.json`
- Migrated v3.5 saves: `out/{mig22,mig50,mig50fix,mig50can10}.json`
- Scenarios: `out/scen_{A,A2,B,C,E,H,I}.log`
- Townsfolk census: `census/census.json` and `census/town_*.jpg`