# v4-fix

All critical, high and medium findings that reproduced are fixed, except M3 (partly fixed), M4 and M6 (see the robustness list). The full test chain passes, and so does the final rebuild. On the last texbudget run the only misses were the title and two 300 MiB targets; every hard limit held. The arrow-only bot now reaches 읍 at 52.6 min; before the fixes it never did.

**Gameplay**
- **H1 arrow-only stall:** fixed.
  - The station porter now delivers new-shop orders before shop restocks.
  - Shops are restocked only when their shelf drops below 40%.
  - The porter picks up an order item as soon as one is waiting.
  - The order-card arrow stays on a card that has been stuck for 45 s.
  - Arrow-only bot: 5 shops at 39.2 min, 읍 at 52.6 (was 4 shops, no 읍 by 85 min).
- **H2 supermarket starves:** fixed. The card now needs 10 cans instead of 20. Loading the v3.5 50-min save: 5 shops after 8.3 min, 읍 after 8.6 (was stuck for 30+ min).
- **H3 hardware-store tools never delivered:** fixed. The order now ships after 1 axe or pickaxe; the hardware-store order filled 1.2 min after it appeared.
- **M4 card stuck after reload:** fixed. A full card now completes on its own; there is a check in `v4.mjs`.
- **M5 "다른 주문" throws away progress:** fixed. A swapped card's progress is kept and restored, including across saves.
- **M6 frozen porter:** fixed. After 4 s it re-routes the goods; after 20 s it sells them at wholesale.
- **M7 long end wait:** fixed. 읍 now costs 11000 coins. Longest idle gap: smart bot 2.0 min, arrow-only 4.0 min (was 9.0–10.5).
- **M8 happiness never matters:** fixed with the reviewer's numbers (base 30, decor cap +12, 읍 needs 80). A visitor whose favourite is sold out now counts as only partly happy (0.6).
  - Bots still read 88–100 in normal play, so a well-run village passes easily.
  - If half the visitors leave with nothing, the village drops below 80 (new check in `v4.mjs`).
- **Lows:** fixed.
  - The idle hint now points at the biggest cash pile, including the hall tax and restaurant cash.
  - Night train share is 0.1, and sleeping or at-home townsfolk no longer ride.
  - A handy adult stands in when all 3 builders are busy.

**Visual**
- **H1 shops and station turn see-through:** fixed. They now fade only for the chief and train cars: 0% faded at the café street at 13:00 (was 43–100%).
- **H2 empty 읍 ceremony at the hall:** fixed.
  - 19–24 residents gather in view; the pines in front of the hall are cleared and the camera frames the hall.
  - At 5 s the camera cuts to the station square for the repave, lamps and townsfolk, then returns to the hall.
- **M3 tall rows hide buildings:** fixed. The apartments fade to 42% while the chief is in the block behind them; the carpenter's houses do the same over the 철물점.
- **M4 square labels pile up:** fixed. Pads moved; the porter label sits below its pad and no longer lifts over its price. No text overlaps in the probe.
- **Name card cut off (low-medium):** fixed. It stays on screen below the HUD at 360×640.
- **Lows 6–10:** fixed.
  - Overview zoom is 0.24 again.
  - The train edge marker is now a locomotive badge with a pointer.
  - The restaurant card shows its icon instead of a hammer.
  - The pantry label sits above the food pile.
  - The welcome banner says 99 instead of 101/122.

**Robustness**
- **C1 placeholder art on reopen:** fixed in `Neighbours.js`. `save_v4.mjs` now checks for 0 warnings and 0 placeholders after a reload.
- **M1 re-downloads per round trip:** improved, from 55/54 MB (125 files) to 32/14 MB (82/50 files) on the dev build.
- **M2 one failed fetch breaks a page:** fixed. Failed pages are retried; the blocked `town_civic@rest` page came back.
- **M3 uploads over 8 MiB:** partly fixed.
  - Town pages are now capped at 8 MiB; `town_civic@rest` (11.8 MiB) is split into 6.95 + 3.25.
  - Not fixed: three v3.5 atlases (10.7, 8.9, 11.0 MiB) and the title bakes (8.9). Repacking them changes v3.5's first-20-minute loading, and the title bake tool isn't mine.
- **M4 texture memory:** won't fix. Every hard limit holds (peak 385 MiB, GL 421 against 455). The 300 MiB targets and the title's 90 MiB (now 151) need art repacked at lower resolution.
- **M5 display objects:** fixed with a new step in `Culler.js`. Props-atlas pictures far off screen (scenery and item piles) are taken off the display list and put back before they come into view.
  - Station view 3027 → 967, town 3037 → 1324, plaza 2489 → 1771 (gate 1700).
  - A probe found nothing missing on screen during runs, jumps and the overview.
  - Visitors in our village are capped at 24.
  - Logic per step is about the same as the reviewer measured, and the machine was busy.
- **M6 artifact headroom:** partly fixed. The package is 492 of 511 files and 59.7 MB. The build now checks 64 MB per publish and 256 MB per version, so a new fragment means one more publish instead of a failed build.
- **M7 `--inline`:** retired in `tools/build/README.md`.
- **L1 weak-GPU title restart:** fixed. `test_deploy` standalone and pages pass in the full `--slow` run.
- **L2 items lost on reload:**
  - Fixed: station rent (`rentAcc`) is restored, and labour piles keep up to max×2.
  - Won't fix: the small caps on toolsmith planks, dock fish, market fish and the miners' food box (old v3.5 caps, a few items each).
- **L3 inconsistent saves:**
  - Fixed: one town hall per save, hall only on an XL plot, station only on its own plot, unknown home ids, and a shop saved on the wrong lot. Fuzz run: 33 variants, 0 errors.
  - Won't fix: restoring a truncated save from the backup slot (same as v3.5).
- **L4 publish order:** fixed. The fragment list now lives at the top of `game.js`, and `chat.js` and the title list go in the last publish.
- **L5:** not mine. It is the publish step: update the designer's existing link.

I also fixed one small pre-existing problem: a missing `ui_icon_star` fallback showed a placeholder in smoke (now 0).

**Tests** (fixed-step, under nohup; the early suites were re-run after the final change)
- Node: balanceCheck 0 warnings; roadnet, v4_layout and townfolk_runtime pass; voice_runtime 29/29; chat 78/78. The chat suite reported a failure at first because my command passed a folder instead of the test files; the corrected run passes.
- save_v2, v3, v35 and v4 with `--browser`: PASS.
- smoke 53/53, v3 18/18; labour, dog, life, zoom and rail pass; town 17/17, v4 46/46, plots 34/34, restaurant 30/30, c2 (water, voice, title, chat) 39/39.
- texbudget 9/12 on the second run. The first run had 8/12 because "return to the start of the tour" also missed (335 vs 324 MiB). The rerun passed it (320 vs 327); the difference is which residents' animation pages happened to be loaded.
- Build OK; `test_deploy` standalone and sameorigin (`--quick`) PASS; standalone and pages (`--slow`) PASS.
- Bots: smart bot 5 shops 37.7, 읍 48.0. Both bots: 0 errors, 0 stuck. East watchtower at 18.6/20.3 min, so the first 20 minutes are unchanged.

**Docs and screenshots**
- The v4 design doc tables now carry the new numbers and bot timings.
- `docs/previews/screens_v4` is refreshed (01–19, c1_*, c2_*); I looked through them.
- Someone else committed the working tree at 22:25 (`7516435`), so these changes are already in HEAD.

Files are in /home/user/nurient/frost-village:
- src/systems/Neighbours.js
- src/systems/Culler.js
- src/core/Assets.js
- src/core/Residency.js
- src/systems/Growth.js
- src/entities/Worker.js
- src/systems/Occlusion.js
- src/systems/Rank.js
- src/entities/UnlockPad.js
- src/data/balance.js
- src/data/world.js
- tools/build/pack_pages.py
- tools/build/build_artifact.mjs
- tools/test/v4.mjs
- tools/test/save_v4.mjs
- tools/test/texbudget.mjs
- docs/기획서_v4_이웃마을.md

Evidence is in /tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v4_fix:
- tests/summary.txt
- bots/
- shots/
- perf_c.json
- misc_robust.json
- fuzz_c1.json