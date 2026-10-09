# v4 review:visual

**v4 visual and feel review (phone, 390×844 and 360×640)**

Overall the town, train and crowds look charming on a phone, but two issues will clearly disappoint the designer. The station-front shops she founded keep turning see-through, and the 읍 ceremony looks empty when the town hall exists. There is no critical issue: no page errors or placeholder art in any run, and townsfolk are always drawn in the right order.

I took about 120 screenshots in 8 runs on the current code (after C1/C2), with the fixed-step clock. Fixed steps don't move the camera, so I re-checked every see-through measurement with rendered frames (run g).

### HIGH 1 — Founded shops and 서리역 go see-through most of the time
- **What happens:** 역앞 카페 and the 생선구이 식당 sit beside the level crossing and the platform path. Every visitor walking to or from the crossing, and every founder or builder waiting there, makes them fade to 32 % opacity. You see the train and coins through them.
- **Measured (chief standing on the station street at 13:00):**

  | Shop | Faded, 150 s fixed-step | Faded, 30 s rendered frames |
  |---|---|---|
  | cafe | 58 % | 43 % |
  | restaurant | 100 % | 100 % |
  | 목공소 | 13 % | 13 % |

- **Who causes it (40 rendered samples):** walking visitors 48 times, founder actors 44, builder actors 41, the train a few times.
- **The station too:** 서리역 also ghosts whenever people wait on its platform (b11_ceremony_3_6 to 8).
- **Repro:** `unlockV3()`, `v4.repair()`, `invite()`/`openTown()`, `foundAll()`. Stand at cafe (3616,1685) + (60,160), set `v4.clock(13)`, step 30 s with rendered frames, and read each shop's occluder alpha.
- **Cause:**
  - `Occlusion.js:107` lets anyone with `xrayMain` fade a town building.
  - `Neighbours.js:672-673` sets `xrayMain` on every visitor and actor.
  - The lots `world.js:603` (lotA1/A2) sit beside the crossing (i=8.5) and the platform path `world.js:631`.
- **Suggested fix:** for founded shops and stations, only fade for the chief or the train cars, or require most of the person to be covered.
- **Evidence:**
  - b/b03_cafe_ghost_1.jpg, b/b03_cafe_ghost_2.jpg, b/b04_station_street_default.jpg
  - a/16c_shop_carpenter_workshop.jpg (fully see-through, train visible), a/09e_cafe_open_default.jpg, a/10_till.jpg
  - c/c10_station_street_after_hall_ceremony.jpg

### HIGH 2 — With the 마을회관 built, the 읍 ceremony is empty and its big change happens off screen
- **What happens:** Once the hall exists, the ceremony moves to the west strip (pad at -930,2076). Then:
  - **No townsfolk:** they are only called within 900 px of the hall (`Rank.js:83`), and the town is 5000+ px away, so 0 townsfolk come.
  - **Few residents:** 0, 1, 2, then 5 village residents in view at 1, 3.6, 6 and 9 s.
  - **Camera on a forest:** the bottom half of the screen is pine trees.
  - **Pad hidden:** the 승격식 price is hidden behind the pines (c08).
  - **Repave and lamps unseen:** the cobble repave and the new streetlights run at the station square, off screen (`Rank.js:147`, `addLights`).
- **Why it matters:** C1's bots build the hall well before 읍, so this is the normal path. The ceremony at the station square looks good by comparison (crowd, train, banner, badge; b/b11_ceremony_*).
- **Repro:** `unlockV3()`, build `w_hall` town_hall, then `foundAll()` + 3 houses + `happy()`, then step on the `rank_eup` pad.
- **Evidence:** c/c08_rank_pad_at_hall.jpg, c/c09_hall_ceremony_1/3_6/6/9.jpg; crowd counts in c/probes.json.

### MEDIUM 3 — Tall rows hide the buildings behind them
- **School and town hall:**
  - The apartments (row j=-15.3) are drawn in front of the civic row (j=-10.5), whose fronts face toward them.
  - Behind apartment pixels: 9 of 10 school yard/door points, 50 % of the school picture, all 8 hall points, and 41 % of the post office.
  - At recess, with the chief on the main street, 8 of 20 kids in view are hidden.
  - The apartments only fade when the chief walks into the yard, so the bell, recess and school-out moments are mostly invisible.
- **철물점:** the three carpenter houses H1–H3 cover the 철물점 (lotB1) storefront.
- **Evidence:**
  - a/12_school_morning_default.jpg, a/13_school_out_default.jpg
  - b/b05_recess_from_main_street.jpg, b/b06_school_out_from_main_street.jpg, b/b07_school_out_from_school_lane.jpg
  - a/16c_shop_hardware_store.jpg; numbers in b/meas.json "cover" and the run g log

### MEDIUM 4 — Station square labels and pads pile up
- **Rank pad price hidden:** the 승격식 price "14,000" is completely covered by the 짐 싣는 곳 label (65 % overlap), and its label sits on the order board.
- **Porter price covered:** the "역 짐꾼" label (`labelAt [150,6]`, `Progression.js:306`) covers up to 71 % of its own "600" price and sits on the cafe's facade.
- **Lamp pole:** the double streetlight pole runs through the "600".
- **Where:** pads in `world.js:596-599`.
- **Evidence:** crops/b10_rankpad.png, b/b10_rank_pad_default.jpg, a/08_station_square_default.jpg, b/b11_ceremony_14.jpg

### LOW-MEDIUM 5 — Townsperson name card is cut off
The name card that appears when you tap a townsperson is not kept on screen, and HUD chips cover it. At 360×640 the name and age line is lost under the order chip. Evidence: d/d07_name_card.jpg, crops/d07_card.png.

### LOW 6 to 10
6. **Overview is tiny:** the west strip makes the village overview zoom 0.16 instead of about 0.24. The village is tiny, labels are specks, and a blank band remains below (b/b18 vs v3.5 20_overview).
7. **Train edge icon looks like a truck:** the off-screen train marker is a frameless delivery-truck icon (`UIv4.js:57`) that reads like a stray prop (crops/a11b_truck2.png).
8. **Restaurant card placeholder:** in the extra-large plot menu, the 큰 식당 card shows a hammer until the town art loads, while 마을회관 shows its picture (d/d04_plot_menu_xl.jpg).
9. **Pantry label covered:** the food pile is drawn over the "식재료 칸" label (c/c04_big_restaurant_default.jpg, c/c12_restaurant_night.jpg).
10. **Welcome banner count:** the banner counts station-district residents as the town's people, so it says 101 or 122 instead of about 100 (a/11_town_welcome.jpg, b/b08_train_at_town_station.jpg).

### What works and should delight the designer
- The living sea.
- The first train with 6 neighbours and its banner.
- Varied doll crowds at the fountain and the shops.
- Busy shopper queues at our counters.
- The founding sequence: founder, builders, ribbon, 개업 banner.
- Carpenter houses.
- The cobble street after 읍.
- Readable night (darkness 0.45) with lamp glows.
- The big restaurant terrace with string lights and "정식!" bubbles.
- The station-square ceremony.

**Other checks:**
- Depth sorting: 0 mismatches.
- Labels in the town: no overlaps.
- Walking townsfolk stay on road cells: 22 of 24 at the welcome view, 24 of 25 after 읍, 23 of 23 in the overview.
- The order and rank panels fit at 360×640.

**Harness notes:**
- In run a, the order board panel stayed open in shots 17a to 19c because my teleports never touched the screen; run b re-shot those scenes.
- My first chief-behind-house shot looked like a missing see-through effect. Rendered frames showed it works (house at 32 % opacity), so it is not reported.

Everything is in `/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v4_review_visual/`:
- shots/{a,b,c,d,f,g,h}/ (each with probes.json; b, e, g and h also have meas.json)
- crops/
- sheets/ (contact sheets)
- v4vis*.mjs (scenario scripts)