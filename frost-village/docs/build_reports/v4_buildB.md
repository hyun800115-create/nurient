# v4 BUILD-B 보고서

I finished BUILD-B. All required suites pass; one `v3.mjs` check failed once and passed on three reruns. Every hard limit holds except one: three v3 atlases are reloaded at 8.1–11.3 MiB when the chief comes back from the town, over the 8 MiB per-upload cap. Three softer targets are also missed (below).

**What was built (v4.0, save version 5)**
- **Station square:** an order board with up to 3 cards and a loading dock that pays 70 % of the price into 역 금고. Station porters cost 600 / 1100.
- **Five founded shops:** the founder and two builders arrive by train, the build takes 25 s, then a ribbon (opens by itself after 90 s). Shops pay rent and are restocked from our village.
- **Carpenter houses** add 4 people each.
- **Rank 마을 → 읍:** three bars, a 12 s ceremony, cobble street, a second coach, 20 newcomers.
- **Roads, memory, saves, tutorial:** `RoadNet` / `RoadPaint` road visuals; packed atlas pages, residency and a pooled ground; save migration from real v3.5 saves; tutorial goals and arrows.
- **§18 backlog:** done except P1. The fish pile moved 22 px clear of the sleigh, and the sea line is fixed by cropping ground tiles.
- **Fixes made in this last stretch:**
  - **Memory leak:** every time a resident's social poses were unloaded and reloaded, about 30 animations were left behind (+2.8 MB heap per minute). Fixed in `Residency.js`; the heap is now flat.
  - **New view culling** (`src/systems/Culler.js`): pictures far off screen are no longer drawn. Draw calls went from 17–22 to 5–10 (limit 12).
  - Snowball fights and tag now start even when a kid's poses aren't loaded, and any kid can start tag.
  - The ribbon's flower stands no longer show a placeholder.
  - The 역 금고 label sits above the spinning coin.
  - The town-welcome screenshot now triggers its banner.

**Progression (cost → smart / think / arrow bot, game minutes)**

| Step | Cost | Smart / think / arrow |
|---|---|---|
| Village complete | — | 19.3 / 22.2 / 20.5 |
| Repair the station | 500 coins + 14 planks + 4 ingots, 12 s | 22.0 / 23.6 / 23.1 |
| First train | — | 22.1 / 23.7 / 23.2 |
| First shop (카페) | bread 30 | 23.8 / 26.3 / 24.8 |
| Town visit | — | 25.0 / 27.3 / 26.3 |
| 5 shops | 식당 fish 40 + meat 15, 목공소 planks 50, 철물점 ingots 25 + axe + pickaxe, 슈퍼마켓 cans 20 + bread 20 | 34.9 / 40.6 / 39.7 |
| v3 complete | — | 38.2 / 42.3 / 40.0 |
| Rank 읍 | 45 people, 5 shops, happiness 70, 14000 coins | 47.5 / 51.5 / 48.2 |

- A last smart-bot run with the final code reached 읍 at 48.8 min, with 0 stuck and 0 errors.
- The longest gaps were 2.2–2.3 min (smart) and 7.1 min (arrow), both while saving the 14000 coins. The arrow bot got stuck once, at 16.7 min, before any v4 content.
- Balance changes I made while measuring:
  - rank cost 3000 → 14000;
  - 슈퍼마켓 cans 30 → 20;
  - new `v4.stationPorterFoundingMin` = 4.

**Texture memory (MiB, measured)**

| Scene | Before | Now | Hard limit |
|---|---|---|---|
| Title | 88 | 88.5 | — |
| New game | 425 | 191 | 368 |
| v3.5 village complete | 517 | 322 (settles at 275) | 455 |
| Full v4, plaza | 698 | 325 | 455 |
| Full v4, peak | 719 | 385 | 455 |

GPU total peaks at 420, of which 30 is the renderer's own screen buffers.

**Performance**
- Logic per tick: plaza 0.8–1.0 ms, town 1.1–1.8 ms (limits 1.6 / 2.1).
- Town simulation: 0.10–0.24 ms.
- A full frame in the town at noon: 11–14 ms with culling, 16.3 ms without.
- A full v4 save is 5.7 KB and takes 0.2 ms.
- 10-minute v4 soak: heap after GC stays at about 35 MB, listeners and timers stay flat, 0 errors.

**Tests**
- New suites: `v4.mjs` 40/40, `save_v4` 51/51, `roadnet.test.mjs` 32/32, `v4a_perf.mjs` 7/7, `texbudget.mjs` 10/12 (the two misses are the 300 MiB targets).
- Existing suites:
  - smoke 53/53, v3 18/18 (after the one flake), labour 28/28, dog 15/15;
  - life 14/14 (7 of 7 runs after the fix), zoom 11/11, town 17/17, rail 33/33;
  - save_v2 16/16, save_v3 26/26, save_v35 25/25.
- Artifact: 471 files, 53.46 MB, 2 publishes (250 + 220). `test_deploy standalone --quick` passes.

**Screenshots** — I looked at each one: 20 Korean shots plus 4 English HUD shots at 360 × 640, the v3.5 set 01–23, and the `a_*` perf shots.

**Known issues**
- The 300 MiB texture target is missed once the village is complete (275–385 MiB).
- More than 1700 display objects in a crowded town view (2257–2489): about 60 townsfolk on screen at once, 8–12 images each.
- After a town visit, three v3 atlases of 8.1–11.3 MiB each are reloaded (the cap is 8 MiB per upload). They need splitting in `pack_pages.py`, which would also help the 300 MiB target.
- With many residents chatting, about 20 social pose pages a minute are unloaded and reloaded.
- Smart bot pacing: one run reached 읍 at 47.5 min, half a minute under the 48–55 band, and its longest gap is 2.2–2.3 min (limit 2.0).
- The title screen shows about 30 placeholder warnings with a v4 save. That code is in `src/title`, which belongs to another agent, so I left it.
- The early asset requests differ from v3.5 by design: files now load as packed pages.
- The "새 이웃" banner can briefly cover the rank panel.
- P1 nice-to-haves (§18 #12) are not done.

Files are in /home/user/nurient/frost-village:
- docs/build_reports/v4_build.md
- docs/build_reports/texbudget_v4.json
- docs/기획서_v4_이웃마을.md
- docs/previews/screens_v4/
- docs/previews/screens_v35/
- src/systems/Culler.js
- dist/artifact/
- dist/artifact_files.json