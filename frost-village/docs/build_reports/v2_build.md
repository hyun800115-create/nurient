v2 is implemented and every test passes: smoke 33/33, life 14/14, zoom 11/11, save migration 16/16, 0 page errors. Gameplay sims finish the village in 17–24 minutes with no softlocks. In the last session I fixed four bugs:
- **Clerk looks were never configured.** Clerks always used the npc_aunt fallback, duplicating a resident. Fixed in world.js.
- **X-ray did nothing for flipped pictures.** About half the decor pines and the flipped tent never faded, so residents vanished behind them. The colliders of those pictures also sat about 90 px from the visible trunk; they now sit under the trunk.
- **Asset placeholders.** The new buildings manifest added two boat characters whose pictures aren't loaded yet, which created placeholders.
- **Bard hidden at the beach.** He played behind the woodpile and the trade clerk. He now has his own spot at that fire, and dancers keep clear of him.

**What was built (items 1–10)**
1. **Asset loading:** 13 fragments are read and missing ones are skipped silently. Social anims that only exist facing S/SE/E turn the character to the nearest available direction. Villager pictures load after the title, and residents appear as their pictures arrive. From the buildings fragment only the clerk staff points are used. Asset keys only needed for v3 are never loaded.
2. **Village life:** chats, snowball fights, tag, campfire concerts, elders dozing on seats, the snowman, pets, shivering, waving at the chief, cheering on unlocks, the village-complete party, and tapping residents or pets. There are 140 lines in 37 categories, Korean and English. Life props are placed in world.js away from pads and paths.
3. **Population:** 4 residents plus the dog at the start, 28 more move in over the unlocks (list in world.js). They walk in from the gate with a banner, are saved, and market customers never repeat the same look twice in a row.
4. **Zoom:** pinch (a second finger turns the joystick into a pinch), mouse wheel, +/− buttons, and an overview button that toggles back. Zoom is clamped to 0.6–1.7.
5. **Clerks:** register pads at the market and trade post; customers and the merchant only pay when someone is staffing them. Clerks cost 25 and 60 and appear after the first sale and first trade, with a tutorial arrow to the register.
6. **Roads and porters:** a road graph that grows as zones unlock, with route finding. Porters cost 150/300/500/800/1000. Old v1 couriers are migrated to porters.
7. **X-ray:** trees and tall props fade when they cover any visible character, using each picture's real pixels.
8. **Balance:** porter costs were raised; docs/기획서.md §4 is updated.
9. **Performance:** 24 active residents at most; off-screen residents update 4 times a second without animation; bubbles and snowballs are pooled; event updates no longer allocate per frame.
10. **Tests:** the smoke test now runs on a fixed-step game clock, so machine load no longer affects it. New: life.mjs, zoom.mjs, save_v2.mjs, perf_v2.mjs and clerk_view.mjs. The gameplay bot now picks up coin piles it walks past, like a person would.

**Test results**
- **Smoke:** PASS 33/33, 0 errors, 0 placeholder keys.
- **Life:** PASS 14/14, 24 residents, 28 moved in, 0 errors.
- **Zoom:** PASS 11/11. Pinch out 1.2→1.7, pinch in clamped at 0.6, buttons work, overview 0.4 and back, wheel 1.2→1.344→1.07.
- **Save migration:** PASS 16/16. Couriers become porters, partial payments are kept, progress flags are set, 28 residents move in on load, and the save is rewritten as v2.

**Gameplay sims (minutes to finish the village)**

| Player type | Finish time | Longest gap between unlocks |
|---|---|---|
| Fast | 17.2 | 1.45 |
| Casual | 20.3 (two runs) | 1.7 |
| Slow | 23.6 | 1.9 |

All runs had 0 stuck, 0 idle and 0 errors.

**Performance and soak**
- **Performance** (everything unlocked, 24 residents): game logic averages 0.42–0.60 ms per frame (95th percentile 1.0 ms, occasional single frames 9–20 ms). A full frame including drawing takes 4.7–6.8 ms in software rendering.
- **10-minute soak** (627 s of game time, about 60 fps):
  - Logic averaged 1.6–2.2 ms per frame.
  - Heap after garbage collection went 18.9→21.0 MB; the last 10 samples stayed between 20.6 and 21.0.
  - Object count levelled off at 1024–1035.
  - Tweens, timers, sounds and pools stayed bounded.
  - There were 0 errors.

The soak ran before the last two fixes (array reuse and flipped pictures); the smoke and life tests and the casual sim were rerun after them.

**Screenshots** in /home/user/nurient/frost-village/docs/previews/screens_v2/: v2_01_start_village through v2_18_overview (chat, snowball throw/hit/reaction, tag, snowman building/done, concert, elders, shiver, wave, tap resident, tap pet, cheer, move-in, party, overview), plus v2_20_clerk_market and v2_21_clerk_trade. Smoke screenshots (01–25, including 06b_register_wait, 11b_porter and 11c_clerk) are in /home/user/nurient/frost-village/docs/previews/screens/.

**Keys that don't exist yet:** none right now; everything v2 uses is present. Fallbacks stay in the code:

| Key | Fallback |
|---|---|
| ui_pad_register | tinted ui_pad_unlock with an icon |
| ui_icon_zoom_in / zoom_out / map | drawn buttons |
| ground_road | soft trodden path |
| npc_clerk_a / b | npc_aunt / npc_merchant, swapped when the real art loads |
| npc_porter_a / b | other villagers, carrying in front |
| market_counter_staff / trade_post_staff | world.js offsets |
| sfx_register | sfx_cash |
| sfx_chatter_*, sfx_lute | silent |
| serve, bow, laugh and other social anims | a table of similar anims (serve→talk) |
| batch-2 residents | skipped |

**Known issues**
- The trade post's staff point from the buildings manifest overlaps the merchant, so the trade clerk stands at the register at the left end of the stall instead.
- The artifact package has 282 files against the 255-per-publish limit, so it goes up in two publishes. It also includes about 1 MB of music (bgm_spring) only v3 uses.
- Smoke screenshots still go to docs/previews/screens/, the existing location; that folder isn't in the list of folders I own.
- Bread and ingot output stacks can grow very tall. This was already the case before v2.

Main code changes are in /home/user/nurient/frost-village/src (data/world.js, data/balance.js, data/strings.js, systems/VillageLife.js, systems/Occlusion.js, systems/Roads.js, systems/Bubbles.js, entities/Resident.js, entities/Register.js, entities/Worker.js, core/Assets.js, core/Save.js, scenes/Game.js, scenes/UI.js) and in /home/user/nurient/frost-village/tools/test.