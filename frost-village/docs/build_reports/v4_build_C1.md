# v4 build:C1

BUILD-C1 is done: v4.1, save version 6. The designer's four requests are in. The last bot runs reach the hall and restaurant with 0 stuck, and the first 20 minutes run at the same speed as BUILD-B. The trade-off is that the town-rank promotion comes about 1–10 minutes later for the smart and arrow bots. Every suite I re-ran after the last code changes passes.

**What changed**

1. **Plots never dead-end** (`src/systems/Civic.js` new, `src/entities/Amenity.js` new, UI.js, Game.js, Progression.js, strings.js)
   - Houses can always be built (from the first miner hire). Empty rooms attract settlers who walk in along the roads: 1–2 every 45 s, slightly faster when the village is happier.
   - Houses pause only while more than 6 rooms stand empty. The card then reads "빈 방 {n}개에 이주민이 오는 중 · 들어오면 또 지어요". The town hall's rooms don't count toward that 6.
   - The plot menu has tabs (일터 / 집 / 꾸미기 / 마을), showing only the tabs that plot allows:
     - small plot: 3 houses + 4 decor
     - building plot: 4 workplaces + 3 houses + 3 decor
     - extra-large plot: town hall + big restaurant
   - 7 decor buildings that raise happiness. A repeat copy adds ½, then ¼. Decor plus hall happiness is capped at +24.
   - Every locked card says what unlocks it. Big plots hold houses and decor back only when the big workplaces not yet built would run out of room.
   - The v4 shops (cafe and the rest) still open in front of the station by themselves when their order card is filled, so they are not on the plot menu.
2. **West strip at the start**
   - The map grows 1400 px to the left using negative x (`WORLD.left = -1400`), so nothing already placed moves.
   - New area: forest, snowfield, groves, campfire, snow fort and 9 new plots (2 extra-large, 2 building, 5 small). The south end opens together with the south watchtower.
   - Updated to match: collision, ground baking, the region system and fog, camera bounds, roads and the bot's path grid. The opening still frames the plaza.
3. **마을회관 (town hall)** (`src/entities/TownHall.js` new)
   - One per village, on an extra-large plot.
   - Tax box: 1.2 coins per resident per minute, up to 1500, collected like any till.
   - Notice board: standing on its pad opens "오늘의 부탁 / 마을 소식", the placeholder for v5 missions.
   - +6 rooms and +8 happiness.
   - The rank ceremony is held in front of the hall once it exists; there is a hook for v5 weddings. The bell rings at noon.
4. **큰 식당 (big restaurant)** (`src/entities/BigRestaurant.js` new)
   - Town restaurant art at 1.3× size, plus 4 outdoor tables with 8 seats and string lights.
   - Flow: guests queue → order at the register → sit → kitchen cooks → plate flies to the table → they eat → pay onto the cash pad → leave.
   - After 70 s without being served, a guest leaves without paying and the uncooked food goes back to the pantry.
   - Prices: a single dish is ×1.3. The 정식 combo (grilled fish + bread + smoked meat) is ×1.6 = 37 coins, against 23 if sold separately.
   - The chief works the register and kitchen pads at first. Hiring automates it: 계산 점원 450 → 요리사 700 → 서빙 직원 900.
   - Goods and warehouse porters fill the pantry. A nearly empty pantry (under 25%) is filled before the market shelf. About 3 in 10 train visitors eat there.

**Progression and costs** (`src/data/balance.js`, Korean comments; `balanceCheck.js` covers the new keys)

| Building | Coins | Planks | Ingots | Build time | Happiness | Unlocks at |
|---|---|---|---|---|---|---|
| town_hall | 2400 | 30 | 10 | 14 s | +8 | east watchtower |
| big_restaurant | 1500 | 24 | 6 | 12 s | — | east watchtower |
| deco_snowman | 120 | 0 | 0 | 3 s | +2 | miner hire |
| deco_bench | 90 | 4 | 0 | 3 s | +1 | miner hire |
| deco_lamp | 80 | 0 | 1 | 3 s | +1 | miner hire |
| deco_flowers | 160 | 3 | 0 | 4 s | +2 | east watchtower |
| deco_rink | 400 | 0 | 0 | 5 s | +3 | hunting grounds |
| deco_playground | 550 | 12 | 0 | 6 s | +4 | east watchtower |
| deco_fountain | 750 | 0 | 4 | 6 s | +5 | east watchtower |

- **Next-goal order:** the big restaurant comes after the first shop opens. Its staff are side pads (450 / 700 / 900).
- **Hall moved this session:** it now comes after the fishing boat, while the fifth shop is pending. Its rooms help toward the 45-resident goal. In the bot runs, placing it earlier (after the warehouse) held up the cannery and shop orders and pushed the rank back about 10 minutes.
- The designer docs have the full tables: `docs/기획서_v4_추가요청.md` §5.1–5.3 and §8.11 of `docs/기획서_v4_이웃마을.md`.

**Save migration (v5 → v6)**
- The migration only bumps the version number; because the west strip uses negative x, no saved position changes.
- Real v3.5 save files load (plots.mjs and the save_v35 test).
- The save loader cleans up the new data: settlers ≤ 500, hall tax ≤ its cap, pantry ≤ 30 per food. It also opens the west strip's south end when the south is already open.
- Regions that are always open are no longer saved.
- Finished building sites now save only their building and state, which brings the full v4 save to 5717 bytes (limit 6144).

**Tests**
- After the final changes:
  - plots 34/34, restaurant 30/30, v4 43/43, smoke 53/53, v3 18/18, labour 28/28, life 14/14, dog 15/15, town 17/17, rail 33/33.
  - save_v4 and save_v35 PASS in both node and browser mode.
  - Artifact build OK (472 files, 53.52 MB); standalone deploy test (--quick) PASS.
- Earlier this build, not re-run since: zoom PASS, v4a_perf 7/7, v4_layout ok, roadnet 32 passed, save_v2/save_v3 PASS. texbudget 10/12; the two failures are the 300 MiB targets, which BUILD-B also missed, and the 455 MiB hard limit holds.

**Bots** (90 min cap, v4 on)

| Bot | Stuck | First-20-min goal done | Restaurant | Hall | 5 shops | Rank |
|---|---|---|---|---|---|---|
| smart | 0 | 1180 s (BUILD-B 1160–1200) | 26.1 min | 43.1 min | 37.8 min | 49.8 min (BUILD-B 39–49) |
| arrow | 0 | 1270 s (BUILD-B 1220–1270) | 27.7 min | 44.9 min | 41.9 min | 52.3 min (BUILD-B 48.2) |
| think | 0 | 1320 s (BUILD-B 1250–1330) | 31.4 min | 45.4 min | 42.6 min | 53.8 min (BUILD-B 50–66) |

The bots hired all three restaurant staff each run.

**Last fixes this session**
- The toolsmith now also makes tools that open order cards need. One smart run stalled at 3 shops because the hardware store's card wanted a pickaxe.
- The smart bot now collects restaurant cash, hall tax and general store cash, as a player would.
- The bot's path grid now updates when a rock respawns. One smart run had a 3-second stall beside the mine's ore pile; BUILD-B's arrow run had the same stall. It was bot-only.
- The plots test waits for the start fade-in, after its start screenshot came out black once.

**Screenshots** (390×844, in `/home/user/nurient/frost-village/docs/previews/screens_v4/`)
- `c1_00_start.jpg`: the start still frames the plaza
- `c1_01_west_strip.jpg`: the west strip
- `c1_02_fountain.jpg`
- `c1_03_town_hall_tax.jpg`
- `c1_04_notice_board.jpg`
- `c1_05_plot_menu_houses.jpg`: buildable houses on a plot
- `c1_06_plot_menu_decor.jpg`
- `c1_rest_01_queue.jpg`
- `c1_rest_02_seated_diners.jpg`
- `c1_rest_03_staff.jpg`

**Known issues**
- Train-visitor guests have no sitting animation, so they stand behind the table; village guests do sit.
- Rank comes later than BUILD-B: about 1–10 minutes for smart, 4 for arrow; think is within BUILD-B's range.
- The west land is open from the start, but its plots only appear after the miner hire (about 15 min), to keep the first minutes uncluttered.
- The artifact has 472 files, over the 255-per-publish limit, so it needs several publishes. This predates C1.
- Running smoke, life, v3, labour, dog, town and rail re-wrote their own screenshot folders (`screens`, `screens_v2`, `screens_v3`, `screens_v35`, and the `rail_`, `town_` and `v4_` images in `screens_v4`).
- I touched no water or beach files. `tools/build/pack_pages.py` now packs the hall art, and it regenerated `assets/_packed` (a new hall atlas page and an updated restaurant page).

Files are in `/home/user/nurient/frost-village/`:
- `src/systems/Civic.js`
- `src/entities/TownHall.js`
- `src/entities/BigRestaurant.js`
- `src/entities/Amenity.js`
- `src/data/balance.js`
- `src/data/world.js`
- `src/systems/Progression.js`
- `src/core/Save.js`
- `tools/test/plots.mjs`
- `tools/test/restaurant.mjs`
- `docs/기획서_v4_추가요청.md`
- `docs/기획서_v4_이웃마을.md`