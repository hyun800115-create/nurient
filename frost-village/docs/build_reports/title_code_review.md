# title_code: build, critique, polish

## Polish (final)

# title_code: the living title screen ("행복한 눈꽃마을 이야기"), polish pass

Every high and medium issue from the critic reproduced, and all of them are fixed. A full run of `node tools/test/title_lab.mjs` passes all 37 checks, including new ones for the leak, a low-memory phone, a late stage on a slow network, first-visit sound and the save → stage mapping. A quick re-check after my last code change also passes, and the previews in `docs/previews/` are refreshed from the final art. No existing src file was changed, and no git commands were run.

## 1. What the title does now

- **First visit:** an ~11 s intro on a snowy island grows 개척 → 마을 → 읍 → 도시 while morning turns to night.
  - The snow train pulls into its station with a whistle (5.9 s) and is docked before the city starts.
  - The ferry glides up below the lighthouse with its horn (9.4 s).
  - The 3D logo drops in letter by letter, then "터치하여 시작" appears.
- **Returning players:** the title shows their own stage. The camp and the village are at a warm dusk, the town and the city at night. It reads the save without changing it and plays the growth once when the save has moved on.
- **Sound on the first visit:** a tap on the loading screen turns sound on before the title starts. Otherwise the first tap during the intro turns sound on and starts the music, and the intro keeps playing. A second tap, or the new "건너뛰기 ▸▸" pill at the bottom right, skips.
- **Slow networks:** if a stage's pictures are late, the intro pauses at that stage for at most 2.5 s, but people, boats, sea, aurora and snow keep moving. Buildings a stage replaces leave only once their successors' pictures have arrived, so the island never shrinks.
- **Low-memory phones (≤ 2 GB):** the intro ends at 읍 with three stage chips, and nothing of the city is downloaded.

## 2. What you need to change to wire it in

- **main.js:** import `TitleScene` from `./title/TitleScene.js` as `Title`. The scene list stays the same.
- **Preload.js (needed for a good first frame and first-visit sound):**
  - `preload()`: add `TitleAssets.queueManifests(this.load)`.
  - `create()`: add `armAudioUnlock()` and, after `Assets.queueAssets(...)`, `TitleAssets.queueFirstPaint(this.load)`.
  - Optionally add a "탭하면 소리가 켜져요" line under the loading bar.

  Without these lines the title fetches the same files in its own preload. It still never shows placeholder art or a hard cut, but:
  - there is 1.7–4.1 s of blank screen on 4G (5.7 s on 3G) between the loading bar and the title;
  - sound stays off until the first tap on the title;
  - on 3G the intro waits 2 s for the city.
- **Shipping:** run `node tools/title/bake_title.mjs --out assets/title_bake`, set `bakeBase: 'assets/title_bake/'` in config, and add `'title', 'title_bake', 'audio4'` to `LATE_FRAGMENTS` in `Assets.js`. `audio4` holds the ferry horn and is missing from that list today.
- **Optional:**
  - Drop `ui_title_bg` and `portrait_player_512` via `Assets.isUnused`. That saves 478 KB at boot.
  - Let main.js's weak-GPU fallback watch the Title scene too.
- **v5:** `Save.js` clamps `v4.rank` to 1|2, so the city only appears on the idle title once v5 lets rank reach 3. Until then the city is only in the intro.

## 3. How it loads

`plan.js` decides once, from the save and the title's own prefs, what this player's first frame shows. Only that is fetched before the title appears:

| Player | First paint |
|---|---|
| First visit | ≈ 947 KB (stage 1, backdrop, snow, logo) |
| Returning camp | ≈ 1016 KB |
| Returning city | ≈ 2420 KB (the whole bake is needed to show their city) |

- **Intro:** the rest streams two packs at a time, island first: g2, g3, pop sparkle, g4, night sky, sounds, far city, logo pieces, shine.
- **Idle title:** it never fetches a stage, logo pieces or far city it does not show.
- **Game start:** downloads still running are aborted, and anything that lands later anyway is removed the moment it lands.

## 4. Save → stage mapping (read-only)

| Stage | When |
|---|---|
| 1 개척 | No save, or only the first steps |
| 2 마을 | Anything up to rank 1: v2/v3 complete, forest zone, territory opened, station repaired, town open, any building finished, or 10+ done steps |
| 3 읍 | `v4.rank >= 2` or `progress.flags.rankEup` (the 승격식 was held) |
| 4 도시 | `v4.rank >= 3` (or `v4.city.open`) |

The old `save.city` / `save.v5` keys are dropped from the contract; `sanitizeSave` would strip them anyway.

## 5. Measured

**Lab (SwiftShader, 390×844 @2x, shared box at load ≈ 25):**

| What | Value |
|---|---|
| Logic per frame | 0.11 ms avg / 0.2 ms p95, 280 objects (0.03 ms for the old title) |
| JS heap after 20 s of title updates | −72 KB, so no per-frame garbage |
| Textures, returning camp | 23.6 MB (was 55.5 MB) |
| Textures, all four stages + all art | 58.4 MB (budget 60 MB), and 0 MB after the game starts, also when files were still downloading |
| Extra download (bake + late sounds) | 1,412 KB (budget 1.5 MB) |
| GIF / MP4 | 7.27 MB / 5.7 MB (720×1558, 30 fps, 14 s) |

Draw calls (19 per frame) are from the previous pass; I didn't re-run `title_perf.mjs`.

**Network (`tools/test/title/title_net.mjs`: Chrome emulation, cache off, ko browser):**

| Run | Blank screen before the title | Intro waits |
|---|---|---|
| 4G, wired | 0 s | 0 s |
| 4G, not wired | 1.7 s | 0 s |
| 3G, wired | 0 s | 0 s |
| 3G, not wired | 5.7 s | 2.0 s |
| Returning camp, 4G, wired | 0 s | – |
| Returning city, 4G, wired | 0 s | – |
| Returning city, 4G, not wired | 4.1 s | – |

The waits are modelled at 60 fps from the network marks, because SwiftShader here drew at only 1–8 fps. Before the island-first stream order, the same 3G run waited 6.0 s; the critic measured 3.2–4.8 s of frozen screen before this pass.

## 6. Still open

- The beach hotel, logistics centre and civic buildings aren't on the island yet. Add them to `OBJECTS` in `layout.js` and re-bake.
- A request that never answers would keep the title's preload waiting, the same as the game's own Preload.

## 7. Critic issues → what happened

All were reproduced first with the critic's harness before any change. The texture leak, for example, came out at 48.8 MB / 24 textures.

| # | Sev. | Issue | Result | What changed / evidence |
|---|---|---|---|---|
| 1 | high | Texture leak when the game starts during downloads (48.8 MB) | **fixed** | Downloads still running are aborted, and late arrivals are removed the moment they land. Lab: 16 held files, 0 MB after both the abort and late-landing variants |
| 2 | high | Idle title fetches every stage and all art (55 MB GPU, ~2.3 MB) | **fixed** | `plan.js` first paint + stream. Idle camp: no stage 2–4, logo pieces, far city or pop; 23.6 MB |
| 3 | high | Late stage freezes everything; low-memory intro plays an empty 도시 and the town shrinks; skip hard-codes stage 4 | **fixed** | Intro, skip and chips use the phone's cap. A wait pauses only the intro script, life keeps moving. Replaced buildings leave only when successors are loaded. Island-first stream. Lab: low memory ends at 읍 with 0 s waiting; late stage waits ≤ 2.5 s with all 43 town buildings kept |
| 4 | high | Stage ignores `v4.rank` | **fixed** | The game's rank decides 읍 / 도시. Critic's 11 cases now 1/1/2/2/2/2/2/3/4/2/2 (were 1/1/3/2/2/3/3/3/1/2/2) |
| 5 | high | First-run intro always silent | **fixed** | `armAudioUnlock()`; first tap = sound on and the intro continues; skip pill or second tap skips; music from the first frame if sound was already on |
| 6 | medium | 읍 train beat never happens | **fixed** | Train pulls in over 2.3 s; whistle 5.9 s, bus 8.6 s, ferry horn 9.4 s, logo 10.1 s (gaps ≥ 0.68 s) |
| 7 | medium | Without Preload wiring: placeholder sky with a hard cut, text logo never upgraded, replay drops the swap | **fixed** | Title preload fetches the first-frame art; late art cross-fades; text logo cross-fades to 3D; upgrades are event-driven, not timers |
| 8 | medium | Stage 4: oversized ferry cut off at the left, left corner cut, empty sea band | **fixed** | Ferry docks below the lighthouse at 0.85 size; city camera span 23.5 → 24.5 |
| 9 | medium | Idle always full night; dim camp over empty snow | **fixed** | Dusk for 개척 / 마을, night for 읍 / 도시; closer framing for camp and village |
| 10 | medium | Integration doc omits `audio4` | **fixed** | Shipping steps now include it |
| 11 | low | 3D logo soft on 390-px phones (stretched `_1x` logo) | **fixed** | `_1x` only when it isn't stretched |
| 12 | low | Hidden gear swallowed taps during the intro | **fixed** | Gear takes input only once shown |
| 13 | low | Possible double ferry horn | **fixed** | One horn per arrival |
| 14 | — (found in this pass) | English players' first paint fetched the Korean logo | **fixed** | Uses the game's language |
| 15 | — (found in this pass) | Making a second text logo destroyed the live one's texture (crash) | **fixed** | One cached texture per language |
| 16 | — (found in this pass) | Files added to a running loader stalled until the next frame | **fixed** | Handed to the loader immediately |
| 17 | — (found in this pass) | The Preload wiring started the boot loader itself | **fixed** | An idle loader is left to its owner |
| 18 | low | Stage-2 dirt lane ends square in the snow | **won't fix** | Needs a ground re-bake for a detail seen only on a village-stage title and for 2.4 s of the intro |

Everything is in `/home/user/nurient/frost-village/` (the scratch path is under `/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/`):
- Code: `src/title/` (`plan.js` and `audioUnlock.js` are new)
- Tests: `tools/test/title_lab.mjs`, `tools/test/title/title_net.mjs` (new) and `tools/test/title/title_perf.mjs`
- Full report with the wiring code snippets: `docs/build_reports/title_code.md`
- Korean note for the designer: `docs/기획서_타이틀.md`
- Previews: `docs/previews/title_intro.mp4` and `.gif`, `title_stage_1..4.png`, `title_idle_city_night.png`, `title_grow.png`, `title_idle_village.png`, `title_reduced.png` and the `*_360x640.png` stills
- Repro and measurement scratch: `title_title_code/` (`repro/`, `net/ko/`, `labfull/title_lab.json`)

## Critique

```json
{
 "verdict": "polish",
 "summary": "The living title is a real step up and worth keeping. The four stages read clearly in about 10 seconds. Ending on the night city with the per-letter 3D logo drop is charming at phone size, and the core engineering is clean: no per-frame allocations, a read-only save adapter, and three cameras. I re-ran the builder's lab into my scratch folder at 390x844 and 360x640, and it passes. I also ran adversarial scenarios the lab never exercises: a returning player who taps quickly while files are still streaming, a phone reporting 2 GB of memory, a late stage 4, a skip followed by a double tap, crafted saves at each stage, English, PC, three phone sizes, an audio-cue timeline, and throttled 4G/3G loads with and without the Preload wiring. These found real defects:\n- **Texture leak:** about 49 MB of title textures stay resident in the Game scene when the player starts before downloads finish.\n- **Over-fetching on the idle title:** it always downloads and holds every stage plus all title art (55 MB on the GPU, about 2.3 MB of downloads), even for a player who is still at the camp.\n- **Freezes and missing city:** a late stage freezes the whole scene for up to 2.5 s. On low-memory phones the intro still plays a picture-less 도시 stage in which the town loses buildings.\n- **Wrong stage from the save:** the stage mapping ignores the game's own `v4.rank`, so a v3-complete save shows 읍 and a rank-3 save never shows 도시.\n- **Silent first run:** the first tap both unlocks audio and skips the intro, so the intro's music and sound cues are never heard on a first visit.\n- **Broken train beat:** the 읍 train beat does not happen; the train is still on the bridge when the intro ends.\n- **Preload wiring is not optional:** without it, stand-in art shows first and swaps in with a hard cut, and slow phones keep the plain text logo.\n- **Composition:** at stage 4 the ferry is oversized and cut off at the left edge.\n- **Integration doc:** it omits audio4 from the artifact build.\n\nAll evidence is in /tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/title_title_code_critic/ (lab copy outputs in prev/ and out/, adversarial runs in adv/, network timings in payload_*.json). None of this needs a rework: every fix is local to src/title/** or the integration notes.",
 "issues": [
  {
   "severity": "high",
   "area": "memory / TitleAssets.release",
   "problem": "Title textures leak into the Game scene. If the player starts while title files are still downloading, `TitleAssets.release()` runs at shutdown, but files already being downloaded are still added to `game.textures` afterwards. Phaser's `LoaderPlugin.shutdown()` only clears its lists; `nextFile` / `fileProcessComplete` still call `addToCache`. Nothing ever removes them, so the '0 MB after the game starts' claim fails on any slow network or with a quick tapper.",
   "evidence": "/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/title_title_code_critic/adv/adv_leak_saves_en_pc_small.json → leak. Setup: stage-1 save; stage 2–4 bake and all title art held in flight; taps at t=1.2 s and t=2.0 s; Game started. Title textures were 0 MB right after release, then 48.7 MB (24 `ttl_*` textures) once the held files arrived. The builder's lab never sees this because it waits for every group before tapping (tools/test/title_lab.mjs open()).",
   "fix": "In `TitleAssets.release()`, keep a tombstone set of every `ttl_*` key that was queued but not yet in the texture manager. Add a one-shot `game.textures.on('addtexture', k => { if (tomb.has(k)) { game.textures.remove(k); tomb.delete(k); } })` that runs until the set is empty, and do the same for `cache.json`. Also call `load.off` for the title listeners and remove the title files still in `load.list`/`load.inflight` before shutdown. Add a lab check that holds files with page.route, starts the game, releases the files, and expects 0 MB."
  },
  {
   "severity": "high",
   "area": "loading / idle title",
   "problem": "The idle title over-fetches. `TitleScreen.loadRest()` queues groups 1..cap plus the full title art in both modes, so a returning stage-1 or stage-2 player downloads about 2.3 MB and holds 55.5 MB of GPU textures to show a camp that needs about 26 MB (group 1 at 6.5 MB plus the art). This also widens the leak window above. The art includes `ttl_city_far` / `ttl_city_lights` and the 2.2 MB `ttl_logo_parts` atlas even below stage 4.",
   "evidence": "In the leak run, the held URLs for a stage-1 save include ttl_2_0, ttl_3_0, ttl_4_0 and ground s2–s4 (adv_leak_saves_en_pc_small.json leak.heldUrls). /tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/title_title_code_critic/out/title_lab.json memory.titleTextures = 55.5 MB. Per-file texture sizes: ttl_3_0 and ttl_4_0 are 8.9 MB each, ground_base 5.4 MB.",
   "fix": "In idle mode, queue only groups `1..min(cap, idleStage)` and art filtered by stage (skip the city strips below stage 4). Queue groups 2–4 only from `startIntro()` / `replayIntro()`. In the intro, queue group N+1 while stage N plays."
  },
  {
   "severity": "high",
   "area": "intro director / low-memory phones",
   "problem": "The intro misbehaves when a stage is late or missing. The 'hold' sets dt=0 for the whole update, so people, the aurora, the sea and the camera freeze for up to 2.5 s; only Phaser's snow keeps moving. On phones reporting 2 GB of memory (cap=3), the intro still runs stage 4 and waits 2.5 s for a group that will never come. It then lights the 도시 chip, and the u:4 removals take away the bookstore, flower shop, townhouse_c and house_b with nothing replacing them, so 도시 shows fewer buildings than 읍. Skip and the intro end also hard-code `idleStage=4`. Throttled runs show real holds even on normal phones: about 4.8 s frozen on 3G without the Preload wiring and about 3.2 s with it.",
   "evidence": "adv/sheet_lowmem.jpg: frames at game time 8.0 / 9.0 / 10.0 s are identical, and the town shrinks at 11–14 s. adv/adv_batch1.json lowmem.trace: t stays at 7.5 for 2.45 s and the chief's mx is constant at 1.882. adv/sheet_late.jpg shows the same freeze on a normal phone when ttl_4_0 is late. payload_raw_3g.json: group 2 is ready at +4.2 s, group 3 at +10.9 s, group 4 at +12.3 s after the title is created, against stage starts of 2.6 / 5.0 / 7.5 s.",
   "fix": "(a) Loop stages to `this.cap`, set `idleStage = Math.min(this.cap, 4)` after the intro and on skip, and hide chips above cap. (b) During a hold, freeze only the director (stage schedule, camera keys, time of day); keep calling `dio.update`, `sky.update` and `ui.update` with the real dt. (c) In `grow(to)`, postpone the `outs` removals until `stageReady(to)`, so the town never shrinks while waiting. (d) Optionally keep the Preload loading bar up until group 2 has arrived (about 150 KB)."
  },
  {
   "severity": "high",
   "area": "progress.js (progress-aware idle)",
   "problem": "`stageFromSave` ignores the game's own rank field. The v4 plan saves `v4.rank: 1|2`, and strings.js already has rank_1..3 = 마을/읍/도시. Effects:\n- Stage 3 (읍) triggers on `celebrated3`, `town.open`, a finished station or `territory.town`, so a v3-complete or just-repaired-station player sees the cobbled main street, town hall and train. In the game those appear only at the 승격식 ceremony (v4_plan §9: 'the main street repaved to cobble, streetlights').\n- A save with `v4.rank: 3` maps to stage 3, so 도시 is never shown.\n- The documented v5 hook (`save.city` / `save.v5`) would be stripped by `sanitizeSave` on the next autosave unless v5 also edits Save.js.",
   "evidence": "/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/title_title_code_critic/stage_unit.mjs output: 'v3 complete (celebrated3)' → 3, 'station repaired, rank 1' → 3, 'rank 3' → 1. adv/save_v3done.png shows the 읍 town for a v3-complete save. adv_leak_saves_en_pc_small.json saves.rank3.stage = 3. src/core/Save.js sanitizeSave copies only known top-level keys; `v4.*` passes through plainJSON, so `v4.rank` survives.",
   "fix": "Read the rank first: `const rk = typeof v4.rank === 'number' ? v4.rank : (isObj(v4.rank) ? v4.rank.level : 0)`. Then: stage 4 if rk ≥ 3 (keep `v4.city.open` as an alias); stage 3 if rk ≥ 2 or `progress.flags.rankEup`; otherwise the current stage-2 rules, treating station/town-open/celebrated3 as 2. Optionally add a 'stage 2.5' that shows only the station and train. Update the build report and 기획서 §4 tables, and drop `save.city` / `save.v5` from the contract."
  },
  {
   "severity": "high",
   "area": "game feel / audio",
   "problem": "The first-run intro is always silent, and its sound design is effectively never heard. Audio can only be unlocked by a tap, but every tap during the intro also skips it. A first-time player either watches 11.6 s in silence or taps and loses the intro. `bgm_title` starts only on the skip/start tap and is faded straight into the Game. The cue timeline (hero pops, bus horn, whistle, logo `sfx_levelup`) only plays on a settings-card replay.",
   "evidence": "src/title/TitleScreen.js `tap()`: `Audio.start()` and then `skipIntro()` in the same tap. `cue()` returns early when `!Audio.started`. adv/adv_cues.json, with Audio forced on, shows a full 19-cue timeline that a real first run never plays. docs/기획서_타이틀.md §3 acknowledges the silence.",
   "fix": "(1) In Preload, add a document-level one-shot pointerdown/keydown listener that calls `Audio.start()`, and show '탭하면 소리가 켜져요' on the loading bar, so any tap during the 12–60 s boot turns sound on for the intro. (2) Make the first intro tap 'sound on': start `bgm_title`, keep the intro running, and show a visible '건너뛰기 ▸▸' pill. Skip only on that pill or on a second tap. (3) If audio was unlocked before the title, start `bgm_title` when the title is created."
  },
  {
   "severity": "medium",
   "area": "intro choreography / train",
   "problem": "The 읍 train beat never happens. `trainArrive()` is called at stage 3 (t=5.0) while `this.train` is still null, because `spawnLife` runs about 0.7 s later via `lifeAt`, so the call does nothing. The train then spawns at mx −30 and needs 14.7 s to dock: (stopMx − fromMx) / speed × 1.6 = 23.9 / 2.6 × 1.6. At the end of the intro it is still about 9 m out on the bridge. Its whistle fires at 9.78 s, in the city stage, 0.3 s before the logo cue and next to the bus horn at 8.7 s.",
   "evidence": "adv/adv_cues.json train trace: head = null until t=6.5, −28.6 at 6.5, −14.8 at 11.5, stop at −6.06. Cues: sfx_bus_horn at 8.70, sfx_steam_whistle at 9.78, sfx_levelup at 10.10. In the lab frames (sheet_intro_390.jpg), no train is near the station during 5.0–7.5 s.",
   "fix": "Create the train directly in `grow(3)` (or have `trainArrive()` call `addTrain()` when it is null). For the intro, start it about 8 m before the stop with a ~2 s ease-in, and play the whistle at stage 3 + 0.4 s. Keep the long loop (−30 → stop) for the idle title only. Space the bus horn at least 0.6 s away from the whistle and the logo cue."
  },
  {
   "severity": "medium",
   "area": "integration / late title art",
   "problem": "The Preload wiring is presented as an optimisation, but the title needs it to look right. Without it, the title is created before the title art arrives, so it draws procedural stand-ins (flat mountains, no forest or clouds) and `swapArt()` replaces them with a hard cut seconds later. A returning player whose art is not in within 1.25 s gets the canvas text logo, and it is never swapped for the 3D logo. `replayIntro()` also wipes `this.timers`, which can drop a pending `swapArt` (it happened in my harness). The wiring itself costs first paint: +1.3 s on 4G and +6.3 s on 3G versus when the old title would show; the raw path costs +0.8 s and +1.8 s.",
   "evidence": "payload_raw_4g.json: title art settled 3.0 s after the title was created; payload_raw_3g.json: 12.8 s. payload_wired_4g.json / payload_wired_3g.json: title start at 14.7 s vs 13.4 s, and 73.1 s vs 66.8 s. adv/sheet_late.jpg: the backdrop jumps from stand-in to painted between game time 11.6 and 12.0. adv/leak_after_tap_textlogo.png: text logo and stand-in sky for a returning player.",
   "fix": "Have `TitleScene.preload` itself queue the art the first frame needs (sky/day strips, mountains, forest, clouds, and the one-piece logo for this language and scale, about 0.6 MB). Stream the aurora, stars, city strips, logo parts and pop effect. Crossfade `swapArt` (build the new sky at alpha 0 and tween over 0.6 s), and also swap a fallback logo for the art logo when it lands. Keep pending `swapArt` across `replayIntro()`. Document that the Preload lines are required, not optional, and say which files they cover."
  },
  {
   "severity": "medium",
   "area": "composition at stage 4 / idle city",
   "problem": "In the idle city shot:\n- The ferry is about 330 logical px wide (46% of the screen), cut off by the left screen edge, and parked over the quay, where it hides the crane and containers.\n- The island's left corner and town hall are cut off, while the right side shows empty sea.\n- The city takes only a ~30% band of the screen, with a large empty sea band under it.\nThe centrepiece looks off-balance.",
   "evidence": "/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/title_title_code_critic/ferry_clip_crop.png; prev/title_idle_city_night.png and prev/title_stage_4.png (390x844); adv/en_idle.png; adv/sheet_viewports.jpg at t=13 on all three phone sizes.",
   "fix": "In layout.js, move the ferry stop in front of the terminal and inside the frame (about mx 14, my −19.5), or draw ships at 0.8× on the title. Shift `CAMERA[4]` by about (+0.8, +0.8) m or set span to about 24.5 so both corners are balanced. Raise `TITLE_LAYOUT.focusY` slightly for stage 4 (0.615 → about 0.6) so the city sits higher and the pill area is less empty. Re-bake afterwards."
  },
  {
   "severity": "medium",
   "area": "idle look for most players",
   "problem": "The idle title is always full night (`idleTime: 'night'`). Stages 1–2 are what every returning player will see until v4's rank 읍, and at night they are a dim blue camp with about 60% empty snow. The warm dusk the intro shows is never used at rest, and the stage-1 camera (span 11) keeps the chief and his fish tower tiny.",
   "evidence": "adv/sheet_tod_stage1.jpg compares the default night with tod 1.15 and tod 0.6 for a stage-1 save. prev/title_idle_village.png and prev/title_reduced.png show the same.",
   "fix": "Set `idleTime: 'auto'` (it already exists), with dusk around 1.0–1.15 for stages 1–2 and night for stages 3–4. Use an idle-only camera for stage 1 at about span 8.5, focused on the grill and chief. Let the designer pick from a dusk/night pair."
  },
  {
   "severity": "medium",
   "area": "intro composition (top of screen)",
   "problem": "For the first 9.9 s of the intro, the top 35–40% of the screen is empty sky; the logo arrives only at the end. The config already defines `TITLE_NAME.tagline` ('작은 캠프가 눈꽃 도시가 되기까지') and `TITLE_TEXT.stageLong` ('작은 개척지' … '반짝이는 도시'), but no module uses them.",
   "evidence": "/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/title_title_code_critic/sheet_intro_390.jpg (frames t = 0.5–9.5 s); prev/title_stage_1.png, prev/title_stage_2.png. `grep tagline|stageLong src/title/*.js` finds only config.js.",
   "fix": "Show the tagline in the sky band from about 0.4 s, then a large soft `stageLong` caption per stage, cross-fading at each stage start, under the chips' colour. Fade it out as the logo drops. Text comes from config, so the rename still costs one re-run."
  },
  {
   "severity": "medium",
   "area": "skip / input",
   "problem": "Skipping arms the start button immediately. `skipIntro()` calls `ui.showTap()` (so `tapOn = true`) while the logo letters are still dropping. An impatient double tap skips and then starts the Game within about 120 ms, so the player never sees the finished title.",
   "evidence": "adv/adv_batch1.json skip.doubleTapStarted = true (taps 0.12 s apart). adv/sheet_skip.jpg: the pill is fully active at +0.4 s while the logo is half-dropped.",
   "fix": "After a skip, ignore taps until the logo lands (about 0.6 s), or call `showTap()` from the logo's `onLand` callback. Apply the same guard after the idle first-tap reveal."
  },
  {
   "severity": "medium",
   "area": "progress prefs (grow moment)",
   "problem": "The 'village grew' moment can be lost for good. `startIdle()` saves `shown = saveStage` when the title is created, but the growth plays at t=1.0 s. A returning player who double-taps within about 1 s never sees '마을이 자랐어요!' and won't on later visits. And if a new or reset save is lower than `shown`, `shown` stays high, so a second playthrough never gets growth moments.",
   "evidence": "src/title/TitleScreen.js `startIdle()`: `TitlePrefs.data.shown = Math.max(...)` and `TitlePrefs.save()` run before `growAt = 1.0` fires in `update()`. The builder's lab returning-player check steps 2.2 s before looking, so it never taps early.",
   "fix": "Write `shown` in the `growAt` branch after `dio.grow()`. If the player starts before that, leave `shown` unchanged so the growth plays next time. When `saveStage < shown`, reset `shown = saveStage`."
  },
  {
   "severity": "medium",
   "area": "GPU cost",
   "problem": "The title costs about 2.8× the old title's GPU time. Stacked full-width layers (night sky, 720x900 stars, two large additive auroras, mountain/forest/cloud strips, a half-screen sea tileSprite, a 1582x903 ground) give roughly 3–3.5 screens of overdraw at up to k=2 (about 4.6 MP per layer). main.js only drops weak phones to 1× while the Game scene is active, and the title has no frame cap even when idle.",
   "evidence": "Build report §7 (GPU time 883 vs 317 ms). Layer sizes from src/title/TitleSky.js `build()` and the texture list in out/title_lab.json. main.js perf check: `!game.scene.isActive('Game')`.",
   "fix": "Add `|| game.scene.isActive('Title')` to main.js's weak-GPU check, as the builder already suggests. Throttle the idle title to about 30 fps, since motion there is slow. Skip drawing aurora2 and the stars when k ≥ 1.8 on low-end devices, or draw the sky strips at half resolution."
  },
  {
   "severity": "medium",
   "area": "integration doc / build + tests",
   "problem": "(a) The title fetches assets/audio4/manifest.json (ship horn, gulls), but audio4 is in neither FRAGMENTS nor LATE_FRAGMENTS, so the artifact build won't ship it: a 404 on every title start and silent ferry/gull cues. (b) Existing test helpers assume one tap starts the game. With fresh profiles the title now plays the intro, where the first tap only skips; tapStart and test_deploy's startGame still pass but each costs a 3 s retry. (c) The title's gear at about (662,58) is where smoke.mjs taps the in-game gear (658,62).",
   "evidence": "src/core/Assets.js FRAGMENTS and LATE_FRAGMENTS (currently ['town','townfolk','roads','audio3','ui3','life2'], recently edited by another agent). src/title/config.js `lateCues.audio4`. tools/test/pw.mjs `tapStart` (6 retries × 3 s). tools/build/test_deploy.mjs `startGame`. tools/test/smoke.mjs lines 457–500.",
   "fix": "Add 'audio4' to the step-3 list in title_code.md §2, next to 'title' and 'title_bake', or drop those two cues. In pw.mjs `openPage` and test_deploy, add `?intro=0` or seed `frostVillage.title.v1 = {introSeen:true}`. Mention the gear overlap so tests tap the in-game gear only once the Game scene is active."
  },
  {
   "severity": "low",
   "area": "logo sharpness",
   "problem": "On phones with render scale k < 1.5 (for example 390 css px at dpr 2, k = 1.08), `queueArt` picks the 450 px `ttl_logo_main_1x`, which is drawn at about 546 device px (upscaled 1.21×). At the end of the drop, the crisp @2x per-letter parts switch to that softer one-piece logo, so the logo visibly softens.",
   "evidence": "/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/title_title_code_critic/logo_swap_crops.jpg (t=10.9 parts vs t=11.2 one-piece); logo_crop_k1.08.png. src/title/TitleAssets.js `queueArt`: `hi = !(o.k < 1.5)`.",
   "fix": "Choose @2x when `k × displayed logo width (about 504 logical) > 450`, i.e. for any k ≥ 0.9. That costs +1.5 MB of GPU memory and +67 KB of download."
  },
  {
   "severity": "low",
   "area": "FX (bokeh snow)",
   "problem": "The large bokeh flakes (`ttl_fx_snow_bokeh`, scale up to 1.6, alpha 0.75, on the UI camera in front of everything) read as smudges or a second moon in the sky and logo band at phone size.",
   "evidence": "prev/title_stage_3.png (a pale disc at about (320,385) next to the moon); adv/save_v3done.png (about (290,540)); prev/title_idle_city_night.png (about (100,290)).",
   "fix": "Keep bokeh below the horizon (y from 0.45H to 0.95H), cap alpha at 0.4 and scale at 1.2, or move it to the sky camera behind the logo."
  },
  {
   "severity": "low",
   "area": "layout.js ground (stage 2)",
   "problem": "The stage-2 dirt path cells (`GROUND[2]`, i 2..4, j 1..4) end in open snow as a grey rectangle with a dark rim, a road to nowhere in the 마을 shots.",
   "evidence": "/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/title_title_code_critic/stage2_dirt_lane_crop.png; prev/title_stage_2.png at about (230–330, 1090–1160); prev/title_stage_2_360x640.png.",
   "fix": "Remove the j 1..4 stub at stage 2, or end it at the bakery/sawmill pad with a trodden-snow decal, then re-bake."
  },
  {
   "severity": "low",
   "area": "rename pipeline / docs",
   "problem": "(a) `apply_name.mjs` edits only the title/subtitle strings, yet 기획서 §6 says it renames '게임 안 글자까지 한 번에'. The in-world name 서리마을 / 서리역 / 서리읍 appears about 17 times in strings.js, including the rank banner '서리마을 → 서리읍!', so the designer will see 눈꽃마을 on the title and 서리마을 in the game. (b) 기획서 says title_stage_2 is '낮 마을', but it is dusk. (c) The report's 'extra download 1,412 KB' leaves out about 1.1 MB of title art; a first run actually downloads about 2.35 MB more than before. (d) The designer asked for a city arc with a beach resort and a logistics centre, but neither is in the diorama, and assets/beach and assets/logistics manifests now exist.",
   "evidence": "`grep -o '서리[가-힣]*' src/data/strings.js`; `node tools/title/apply_name.mjs` dry run; prev/title_stage_2.png; payload_raw_4g.json titleKB = 2274; `ls assets/beach/manifest.json assets/logistics/manifest.json`.",
   "fix": "Make the in-world village name a separate parameter (`TITLE_NAME.village`) and ask the designer whether 서리마을 becomes 눈꽃마을; correct the doc lines. Report the full download total. Add a beach strip and the logistics centre to stage 4 (or a stage 5 '리조트') once those packs are final, then re-bake."
  },
  {
   "severity": "low",
   "area": "resize handling",
   "problem": "Phaser's `ScaleManager.refresh()` always emits RESIZE, and main.js calls `refresh()` on every window resize or orientation event. Each one restarts the title, which kills the first-run intro (`fromResize` sets `intro=false`) and releases then re-decodes up to 55 MB of textures (with a backdrop pop if the art is late). This happens even when the logical size did not change, for example on mobile toolbar resizes.",
   "evidence": "src/title/TitleScene.js `onResize` → `scene.restart` → shutdown → `release()`. Phaser 3.90 ScaleManager.js line ~993: `refresh` emits RESIZE unconditionally.",
   "fix": "Restart only when View.W, View.H or View.k actually changed. On a resize restart, skip `release()` and keep the textures, and resume the intro at the same time `t` instead of dropping it."
  }
 ],
 "keep": [
  "The core concept: a 4-stage island diorama (개척 → 마을 → 읍 → 도시) built from the game's real sprites, with morning → dusk → night. It reads clearly in about 10 s, and the night city with warm windows, lamps, the lighthouse beam and the aurora is charming at phone size (prev/title_idle_city_night.png).",
  "The pop language: an ordered ripple outward from the hero object, squash-and-stretch with backOut, snow puffs plus the title_art pop, and window glows lighting house by house.",
  "The per-letter 3D logo drop (emblem pop, top slide, sign swing), followed by the masked shine sweep and twinkles; the canvas text logo built from TITLE_NAME as a fallback, so a rename never breaks the title.",
  "The baking strategy: per-stage webp atlases at title scale, live pictures from the core atlases (no extra bytes), half-resolution window-glow pieces, and the bake tool driven by the game's real loader.",
  "Engineering hygiene: no per-frame allocations (heap −69 KB over 20 s in my run), about 0.1 ms of logic per frame, glows on NORMAL blend so draw calls batch (about 19), and a time-of-day tint applied only on change.",
  "The read-only save adapter, which never writes, migrates or backs up (the lab's 'save string unchanged' check), and the title's own prefs key frostVillage.title.v1.",
  "The three-camera split (sky / world / ui), with the sea texture locked to the world camera and gentle parallax on the backdrop strips.",
  "The reduced-motion path (no intro, static life, fades only), intro mode first/always/never with the ?intro= override, the settings card with '오프닝 다시 보기', and the skip flash to the city with the logo drop.",
  "config.js as the single source for the name, texts, timings and layout, plus apply_name.mjs's dry-run diff.",
  "Late cues loaded into the real audio cache under their real keys without touching the asset registry (Assets.queueLateAudio skips keys already cached).",
  "Safe-area-aware layout that holds up at 360x640, 375x667, 390x844 and 412x915, on PC with the hint, and in English (adv/sheet_viewports.jpg, adv/pc_idle.png, adv/en_idle.png).",
  "The deterministic fixed-step lab (title_lab.mjs) as a base. Extend it with route-held 'late/leak/low-memory' scenarios instead of waiting for every file to load."
 ]
}
```

## Build

# title_code — the living title screen ("행복한 눈꽃마을 이야기")

The new title is finished as standalone modules in `src/title/` and passes all lab checks. No existing src file was changed; the lead wires it in with about 10 lines (§2).

The title is built around a TitleDiorama: a snowy island in the sea made from the game's real sprites. It grows through 개척 → 마을 → 읍 → 도시 while the camera pulls back and morning turns to dusk and then night. Windows and streetlights come on, the lighthouse beam sweeps and the aurora rises. Then the title_art 3D logo drops in letter by letter and "터치하여 시작" appears. After the first run the title shows the player's own stage, read from the save without changing it, and plays the growth once when the save has moved on.

`node tools/test/title_lab.mjs` passes all 18 checks: the real Boot + Preload + Assets.js in headless Chromium on a fixed-step clock. A follow-up `--quick` run also passes all 17 of its checks, including the stricter "save string unchanged" check.

Report: `/home/user/nurient/frost-village/docs/build_reports/title_code.md`
Designer note: `/home/user/nurient/frost-village/docs/기획서_타이틀.md`

## 1. Files (all under `/home/user/nurient/frost-village/`)

| Path | What |
|---|---|
| `src/title/config.js` | The one place for the name (`TITLE_NAME`), plus ko/en texts, intro timings (`TITLE_CFG.intro`), intro mode, idle time of day, sound cues and screen layout (`TITLE_LAYOUT`) |
| `src/title/layout.js` | The diorama: island shape, which objects appear (`s`) or are replaced (`u`) at each stage, roads, rail, piers, people, vehicles, train, ships, gulls, camera per stage |
| `src/title/TitleScene.js` | Drop-in replacement for `src/scenes/Title.js`, same key `'Title'`. Keeps every old behaviour (details below) and frees all title textures when the game starts |
| `src/title/TitleScreen.js` | `mountTitle(scene, hooks)`: three cameras (sky / world / ui), intro timeline, idle title, skip, start, sound cues, snow, swapping in late title art, `replayIntro()`, `state()` |
| `src/title/TitleDiorama.js` | The island: ground layers, buildings popping in with snow puffs, night window glows, lamps, fires, lighthouse beam, smoke, people, 콩이, vehicles, train, ships, gulls |
| `src/title/TitleSky.js` | Sky, stars, moon, aurora, clouds, mountains, forest, far city lights; the sea moves with the island camera, the backdrop with gentle parallax |
| `src/title/TitleLogo.js` | Per-letter drop of the title_art logo, then swap to the one-piece logo, a shine sweep and twinkles. Falls back to a canvas text logo built from `TITLE_NAME` |
| `src/title/TitleUI.js` | Start pill, PC hint, version label, settings gear, skip hint, stage chips 개척›마을›읍›도시, "마을이 자랐어요!" ribbon |
| `src/title/TitleSettings.js` | Small settings card for the gear: sound, music, language, opening once / always / never, "오프닝 다시 보기" |
| `src/title/TitleAssets.js` | Loading (bake groups, title art, late sounds), readiness, animations from baked frames, `release()` |
| `src/title/TitleFx.js` | Procedural stand-ins, made only when the title art is missing |
| `src/title/prefs.js` | The title's own localStorage key `frostVillage.title.v1` (never the save), reduced-motion and low-memory detection |
| `src/title/progress.js` | Read-only save adapter: `readProgress()` → `{ exists, stage }`, and `stageFromSave(raw)` |
| `src/title/bake/` | Baked pictures: `ttl_<stage>_0.webp/.json` atlases, `ttl_ground_*.webp`, `title_bake.json` |
| `tools/title/bake_title.mjs`, `bake_page.js`, `title_pack.py` | The bake: the game's real loader in Playwright → trimmed pieces → one webp atlas per stage, plus window-glow pieces. `--preview` renders layout composites |
| `tools/title/apply_name.mjs` | Copies `TITLE_NAME` into index.html, manifest.webmanifest and strings.js. Dry run by default, `--write` applies |
| `tools/test/title_lab.mjs` | The lab: video, stills, checks, performance, memory, payload |
| `tools/test/title/title_perf.mjs` | Old title vs new title in the same browser |
| `docs/previews/title_*` | `title_intro.mp4` / `.gif`, `title_stage_1..4.png`, `title_idle_city_night.png`, `title_grow.png`, `title_idle_village.png`, `title_reduced.png`, `*_360x640.png` |

TitleScene keeps all of the old title's behaviour:
- The first tap unlocks audio, then plays sfx_click, bgm_title and sfx_whoosh, fades, and starts the Game scene.
- A resize restarts the title (without replaying the intro).
- `window.__FV.title` still points at the scene.

## 2. Wiring it in (the lead's changes)

**main.js** (the scene list stays `[Boot, Preload, Title, Game, UI]`):
```diff
-import { Title } from './scenes/Title.js';
+import { TitleScene as Title } from './title/TitleScene.js';
```

**Preload.js** — load stage 1 and the title art together with the game's own boot files, so the title never waits:
```diff
+import { TitleAssets } from '../title/TitleAssets.js';
+import { getLang } from '../data/strings.js';
   preload() { ...; Assets.queueManifests(this.load);
+    TitleAssets.queueEarly(this.load);            // title_bake.json + assets/title/manifest.json
   }
   ... Assets.queueAssets(this.load, {...});
+    TitleAssets.queueGroup(this.load, 1);         // island ground + camp (stage 1, ~205 KB)
+    TitleAssets.queueArt(this.load, { lang: getLang(), k: View.k });   // logo, backdrop, fx
```
Without these lines, `TitleScene.preload()` loads the same files itself and the first frame waits for about 205 KB plus the art.

**Boot.js** — no change needed.

**Title.js** — no longer used; keep it as a fallback or delete it. To keep your own scene instead, mount the title inside it:
```js
create() {
  this.screen = mountTitle(this, { version: VERSION, onStart: () => this.scene.start('Game') });
  this.events.once('shutdown', () => { this.screen.destroy(); TitleAssets.release(this.sys.game); });
}
update(t, d) { this.screen.update(d / 1000); }
```

**Optional, saves 478 KB at boot:** `ui_title_bg` (358 KB) and `portrait_player_512` (120 KB) were only used by the old title. Add them to `Assets.isUnused`, e.g. `/^(ui_title_bg|portrait_player_512)$/`.

**Shipping the bake (claude.ai artifact build):** `build_artifact.mjs` only copies `assets/` folders, so the bake in `src/title/bake/` is not shipped as it stands.
1. Run `node tools/title/bake_title.mjs --out assets/title_bake` (it also writes a stub manifest.json).
2. Set `bakeBase: 'assets/title_bake/'` in `src/title/config.js`.
3. Add `'title', 'title_bake'` to `LATE_FRAGMENTS` in `src/core/Assets.js`. Only the build reads that list, so both get packaged but are never loaded at boot.

**Settings gear:** it opens the title's own card. To open the game's settings panel instead, set `window.__FV_TITLE_HOOKS = { onSettings }`; `{ settings: false }` hides the gear.

**Name:** edit `TITLE_NAME`, then run `node tools/title/apply_name.mjs --write`. The dry run shows index.html, manifest.webmanifest and strings.js still say 서리마을 개척기 / Frost Village. The 3D logo is re-rendered from `tools/blender/ttl_config.py`.

## 3. Bake or runtime?

I baked what the game doesn't already load, and drew the rest live from the game's own atlases.
- **Runtime only** would need the full town, harbour, vehicles, ships, buildings, roads and pets2 atlases (several MB, over 100 MB GPU) before the city could appear.
- **Flat per-stage layers** couldn't pop buildings one by one, light windows separately, change with the time of day, or animate.
- **The bake** stores every picture from those late fragments, trimmed, at the scale it is seen on the title (0.62–1.0), packed into one webp atlas per growth stage. It also stores the island ground (a base plus one overlay per stage) and a half-resolution warm window-glow piece per building for the night.
- **Live from the game's atlases** (0 extra bytes): core props, the chief, villagers, fx. Only their night glow is baked.
- **First frame:** stage 1 (≈205 KB) is ready at once; stages 2–4 stream in during the intro. If a stage is late, the intro clock waits at most 2.5 s, then its pictures fade in when they arrive.

## 4. Save adapter (read-only)

`progress.js` reads the raw `frostVillage.save.v1` and never migrates, writes or backs it up. The lab checks the stored save string is unchanged.

| Stage | When |
|---|---|
| 1 개척 | No save, or only the first steps |
| 2 마을 | `celebrated`, `zone_forest` done, territory east/south open, any finished site, or 10+ done steps |
| 3 읍 | `v4.town.open`, `territory.town`, a finished station site, or `celebrated3` |
| 4 도시 | `save.city`, `save.v5` or `v4.city.open` — **v5 must set one of these**; until then the city only appears in the intro |

You can override the stage with `__FV_TITLE_HOOKS = { stage }` or `scene.start('Title', { title: { stage } })`.

## 5. Audio cues

| Event | Sound |
|---|---|
| Building pops | `sfx_build_done`, or `sfx_build` until the game has loaded it |
| Hero building | `sfx_unlock` |
| Train arrives | `sfx_steam_whistle` |
| Bus | `sfx_bus_horn` |
| Ferry | `sfx_ship_horn_big` |
| Logo lands | `sfx_levelup` |
| Skip | `sfx_whoosh` |

- The title fetches the audio3/audio4 sounds itself (about 80 KB) under their real keys; they stay cached for the game, and the game's asset registry is untouched.
- Browsers keep sound off until the first tap, so the first-run intro is silent. Tapping to skip starts `bgm_title`.

## 6. Intro settings and accessibility

- `introMode` in config: `'first'` (default), `'always'` or `'never'`. The player's choice in the settings card wins over it; `?intro=1` / `?intro=0` in the address wins over both. `replayIntro()` plays it again.
- Reduced motion (`prefers-reduced-motion` or `?motion=0`): no intro, no camera motion or pops, people hold one pose, the logo fades in.
- Phones reporting 2 GB of memory or less never load stage 4.

## 7. Measured (SwiftShader, 390×844 @2x)

| What | New title | Old title |
|---|---|---|
| Logic per frame | 0.11 ms avg / 0.2 ms p95 (273 objects) | 0.03 ms |
| Draw calls per frame | 19 (72 texture binds) | 1 |
| GPU time per frame (busy shared box; only the ratio means anything) | 883 ms | 317 ms → **about 2.8×** |
| Heap after 20 s of updates | −81 KB (nothing allocated per frame) | – |
| Title texture memory | 55.5 MB with everything loaded (bake 35.3, art ≈20) → 0 MB after the game starts | – |
| Extra download | 1,412 KB (bake 1,332 + late sounds 80) | – |
| title_art files fetched (title_art's own budget) | 1,096 KB | – |

- To cut draw calls from 90 to 19, the window, lamp and headlight glows use normal blending so they batch with the buildings. Only fires and the lighthouse are additive.
- The GIF is 6.95 MB; the MP4 is 14 s at 720×1558, 30 fps.

## 8. Known issues and follow-ups

- **GPU cost:** the title draws about 2.8× what the old one did. main.js only drops weak phones to 1× resolution while the Game scene runs; adding `|| game.scene.isActive('Title')` to that check would cover the title too.
- **The city (stage 4)** only appears on the idle title once v5 writes one of the save fields in §4.
- **Missing buildings:** the beach hotel, logistics centre and civic buildings aren't in the diorama because their art wasn't packed yet when I baked. Add them to `layout.js` and re-bake. Any change to `layout.js` or to the game art it uses needs a re-bake; title_art pictures are read at runtime and need nothing.
- **Old line-up gone:** the old title's line-up of characters is replaced. The chief with his fish tower, 콩이, villagers and workers now walk around the diorama.
