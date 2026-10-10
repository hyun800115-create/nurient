# v4-verify

**Verdict: ship-with-known-issues.** The critical and high findings are fixed and I re-checked each one myself. Every suite passes, the artifact builds and passes `test_deploy standalone --quick`, and the first 20 minutes play the same as v3.5. What remains are soft targets, the parts the fixer left unfixed or only partly fixed, and two visual leftovers.

Tested on HEAD 8f02ede. No tracked source changed while I was testing (other agents only added untracked `src/story`, `src/missions` and docs, which the game does not import). I made no code changes. After the container restart I restarted the killed jobs (c2, the save tests, texbudget, the arrow bot and the ceremony visual runs), then did the build, deploy test and screenshots.

**Critical and high repros**
- **C1 placeholder art on reopen:** fixed. A reopened v3.5-station save and a fuzzed save show 0 placeholder buildings, 0 warnings and all 5 shops staffed. In the town, 31 of 31 buildings show real art.
- **H1 arrow-only stall:** fixed. The arrow-only bot gets 5 shops at 40.2 min and 읍 at 52.5 (before the fixes it never reached 읍).
- **H2 supermarket starves:** fixed. From the v3.5 50-min save: 5 shops at 11.3 min, 읍 at 11.7 (was stuck for 30+ min).
- **H3 hardware-store tools:** fixed. In scenario A the porter took 1 axe and the card was done within 81 s.
- **M4 card stuck after reload:** fixed. In scenario H a full café card completes on reload.
- **M5 "다른 주문" throws away progress:** fixed. In scenario B the restaurant card came back with 40/10 progress kept.
- **M6 frozen porter:** fixed. In scenario C the ingots were re-routed to the toolsmith and the porter went idle.
- **Visual H1, shops see-through:** fixed. Shops fade 0% of the time on the fixed-step clock. On rendered frames the café, restaurant and carpenter fade 12–13% of the time, only while the train sits behind them.
- **Visual H2, empty ceremony at the hall:** fixed. 22–23 residents are in view, the camera cuts to the station square at 5 s and returns to the chief afterwards. Skipping during the white cut leaves no white screen.
- **Visual M4, square labels:** fixed. 0 text overlaps on the street, on the square (8 labels) and at the 승격식 pad (11,000).
- **Robust M2, failed fetch:** fixed. The blocked page recovers after the network comes back.
- **Saves (L3):** fuzz run of 33 variants, 0 bad.

**Suites:** all pass, 0 errors.
- Node: roadnet 32/32, v4_layout, voice_runtime 29/29, chat 78/78, townfolk_runtime 8/8, balanceCheck 0 warnings.
- Browser: smoke 53/53, v3 18/18, labour 28/28, dog 15/15, life 14/14, zoom, rail 33/33, town 17/17, v4 46/46, plots 34/34, restaurant 30/30, c2 39/39.
- Save migration with `--browser`: save_v2, save_v3, save_v35 and save_v4 all PASS.

**Bots on fresh saves (game minutes):** 0 errors and 0 stuck events in every run.

| Bot | tower_east | first shop | 5 shops | 읍 | longest gap after tower_east |
|---|---|---|---|---|---|
| smart | 20.5 | 24.9 | 37.8 | 47.7 | 3.0 |
| arrow | 21.1 | 25.6 | 40.8 | 50.3 | 2.0 |
| think | 22.2 | 26.0 | 41.1 | 50.5 | 4.2 |
| arrow-only | 18.1 | 27.8 | 40.2 | 52.5 | 2.9 |
| from v3.5 22-min save (arrow-only) | — | 8.6 | 20.9 | 31.2 | 4.8 |

Happiness reads 85–100 in every run.

**10-min soak:** 0 errors; heap stays at 36–38 MB, texture peak 383 MiB, GL at most 383 MiB.

**Texture memory (texbudget 8/12):** every hard limit holds: full v4 381 MiB against 455, GL 418 against 455, new game 197 against 368. Four checks miss:
- The title uses 151 MiB against a 90 MiB target.
- The plaza uses 323 MiB against a 300 MiB target.
- The tour peak is 381 MiB against a 300 MiB target.
- "Return to start" ended 333 MiB against 328 allowed. This one is flaky: the fixer's second run passed it, and the soak shows no growth.

**Artifact:** build OK in 67 s, and `test_deploy standalone --quick` passes with 0 errors and 0 placeholders. 492 files (491 plus the page), 59.69 MB, in 2 batches:

| Batch | Files | Size | Contents |
|---|---|---|---|
| 0 | 250 + page | 42.97 MB | art and audio |
| 1 | 241 | 16.71 MB | `game.js`, `chat.js`, `lib/`, every manifest (published last) |

Publish with `capabilities: { sample: {} }`, as `dist/artifact_files.json` says.

**Screenshots:** the designer set in `docs/previews/screens_v4/` is refreshed and I looked at every one: 01–19, the four 360×640 English HUD shots (they were stale, so I re-shot them), c1_* and c2_*. No errors or placeholders.

**Remaining issues**
1. Logic per step at the plaza is 1.9 ms against a 1.6 ms gate, and in town 2.1 against 2.1, measured on a loaded machine.
2. Display objects at the plaza: 1950 by day and 2044 at night, against a 1700 gate (was 2710; the fixer claimed 1771).
3. The longest idle gap is 2.0–4.8 min against a 2.0 min target.
4. Founded shops still go see-through about 13% of the time while the train is in. This is the behaviour the reviewer suggested, but it is still visible.
5. Tall rows (M3) are only partly fixed. The apartments fade only when the chief walks into the school block. Seen from the street, the school yard is still hidden, as `13_school_out` shows.
6. Some uploads are still over 8 MiB: `props_buildings` (11 MiB), `bld_buildings` (10.7), `bld_buildings_2` (8.9) and the title bakes.
7. Only 19 files of headroom remain against the 511-files-per-version limit. Size is not the problem; v5 just needs a third publish.
8. Repeat downloads are smaller (22.9 / 19.8 MB per round trip, was 55 / 54), but not as small as the fixer reported (32 / 14 MB).
9. Low: with one porter, a card one plank short (49/50) waited about 4 min while the porter served the other cards first. The café shelf sat at 0 during that time.
10. Not re-run by me: `test_deploy --slow` (weak-GPU title, L1), the M3 split of `town_civic@rest`, and the 360×640 name card. I am relying on the fixer's runs for those.

Files are in `/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v4_final/`:
- `tests/summary.txt` and each suite's `*.log`
- `bots/{pure,smart,arrow,think,mig22,mig50}.{log,json}`
- `scen/` (scenarios A, H, I, B, C)
- `robust/` (C1 repro, `misc_robust.json`, `perf_c.json`, `fuzz_c1.json`, `soak_c.json`)
- `vis/{b,skip,sq}/` (screenshots and `meas.json`)
- `sheets/`

Build output: `/home/user/nurient/frost-village/dist/artifact` and `/home/user/nurient/frost-village/dist/artifact_files.json`.