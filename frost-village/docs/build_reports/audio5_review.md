# audio5: build, critique, polish

## Polish (final)

# audio5 build report (v7.1, after the critic review)

All 19 contract sounds (CONTRACT_V7 §Z) and 9 new variants are built into `assets/audio5/`, and `check_audio5.py` reports RESULT: OK. A second full rebuild gave byte-identical files. I can't listen to audio, so everything was judged by measurements, spectrograms, a melody-against-chords check, decoding in headless Chromium and a Phaser 3.90 load test. The designer needs to listen before release, especially to the new sea, the steel pan and ukulele in the music, and the beach washes playing over the beach loop.

**What changed in this polish**
- **Waves in step with the screen:** `src/systems/Water.js` brings a wave crest to the shore every 6.0 s. Both background loops now put one near wave on each crest.
  - `amb_sea_waves` is now 42 s (7 crests); `amb_beach` is 24 s (4 crests).
  - Each loop is a whole number of 6 s periods to within 1 ms, so the waves stay on the beat every time the loop repeats.
  - The manifest now lists `swellPeriod`, `swellWaves`, `swellPhase` and `cues.waterline / breaks / upmost` for each loop.
- **New one-shot variants:** 2 more shore washes, 2 more hand splashes, a second damp-sand step, and 4 children's calls.
- **`amb_beach` has no recognisable events left:**
  - The children are a far babble; the two buried laughs are gone.
  - It keeps two far gulls, because the contract asks for gulls in this loop, and two far splashes.
  - Its near surf is about 8 dB lower, because the wash one-shots now carry the near surf.
- **Other sound fixes:**
  - Each group now holds only interchangeable sounds.
  - The beach ball is retuned to F5 with a vinyl "pock" so it carries on phone speakers.
  - The toe scuff on sand step 3 is over by 110 ms.
  - The lifeguard whistle has a deeper pea trill.
  - Every file now peaks at or below -1 dBTP (true peak).
  - The steel pan now plays the melody in the music's middle section, with the ocarina doubling it softly.
- **Fitting under 3.5 MB:**
  - Sound effects now end where their tail falls 40 dB below their loudest moment, with a 60 ms fade.
  - The loops and washes roll off above 15 kHz; the music and other effects above 16 kHz.
  - The manifest notes are shorter.

**Keys and groups**
- 28 keys in 56 files. The payload is 3,486,245 bytes including the 12.5 kB manifest (limit 3,500,000).
- Six groups (`Audio.play(group)` picks a random member):

  | group | members | notes |
  |---|---|---|
  | `sfx_wave_crash` | `_1`, `_2`, `_3` | |
  | `sfx_wave_wash` | `sfx_wave_wash`, `_2`, `_3` | Same name as the contract key on purpose: `Audio.play` checks groups first, so every call gets a random wash. |
  | `sfx_splash_beach` | `sfx_splash_1`, `_1b`, `_1c` | Hand splashes only. |
  | `sfx_sand_step` | `_1`, `_2`, `_3` | Dry sand. |
  | `sfx_sand_step_wet` | `_4`, `_5` | Damp sand. |
  | `sfx_beach_kids` | `_1` … `_4` | Children's calls. |

- `sfx_splash_2` (jumping in) and `sfx_splash_3` (cannonball) are played by key.
- No key or group name clashes with `audio` … `audio4` or `audio6`. Nothing is called `sfx_splash`, because that is the v1 fish splash.

| key | kind | volume | length | what it is |
|---|---|---|---|---|
| `bgm_beach` | music, loop, stereo | 0.376 | 47.99 s | Island / calypso theme in F, 120 bpm, 24 bars (A, B, A). The steel pan plays the village hook in A and the village's B melody in B (ocarina doubling it an octave below). Ukulele, calypso bass, congas, claves. Plays at the same loudness as bgm_village. |
| `amb_sea_waves` | ambience, loop, mono | 0.219 | 42.00 s | Real rolling sea for the cold village coast: 7 near breakers, one per 6 s crest, rising and falling in size (5.7 dB spread). Waves further along the coast, far surf, rumble, cold air, ice floes knocking. |
| `amb_beach` | ambience, loop, mono | 0.216 | 24.00 s | Low surf on the same 6 s beat, far children's babble, 2 far gulls, 2 far splashes, warm breeze, faint crowd. |
| `sfx_wave_crash_1/2/3` | sfx | 0.389 / 0.367 / 0.363 | 2.94 / 3.38 / 3.04 s | Waves on rocks ("철썩!"): medium slap / big boom / double slap. The slap lands at 0.20 s (cue `impact`); the second hit of the double slap at 0.54 s. |
| `sfx_wave_wash` / `_2` / `_3` | sfx | 0.288 / 0.432 / 0.299 | 2.98 / 2.59 / 3.32 s | One wave up the sand and back with a fizzing hiss: medium / small quick lap / big. The water reaches the shore at 0.725 / 0.676 / 0.774 s (cue `waterline`); furthest up at 1.888 / 1.691 / 2.132 s. |
| `sfx_splash_1` / `_1b` / `_1c` | sfx | 0.452 / 0.355 / 0.355 | 0.82 / 0.90 / 0.92 s | Hand splashes: both hands / one flat slap / three quick paddles. |
| `sfx_splash_2` / `_3` | sfx | 0.351 / 0.335 | 1.28 / 1.76 s | Jumping in feet-first / cannonball. |
| `sfx_pool_splash` | sfx | 0.385 | 1.90 s | Dive into the hotel pool, with wall echo and gutter laps. |
| `sfx_lifeguard_whistle` | sfx | 0.148 | 1.16 s | Pea whistle "tweet – tweeeet" (F7) with a deep pea trill. |
| `sfx_icecream_bell` | sfx | 0.245 | 1.82 s | Cart bells play the village hook, land on F, then a jingle. |
| `sfx_beachball_bounce` | sfx | 0.457 | 0.78 s | Ball "boing" (F5) with a vinyl "pock", plus re-bounces at 0.30 and 0.48 s. |
| `sfx_hotel_bell` | sfx | 0.207 | 1.68 s | Reception desk "ding" (C7). |
| `sfx_sand_step_1…3` | sfx | 0.684 / 0.759 / 0.631 | 0.31–0.32 s | Dry sand; 3 has a short toe scuff. |
| `sfx_sand_step_4` / `_5` | sfx | 0.832 / 0.708 | 0.24 s | Damp, firm sand at the waterline. |
| `sfx_beach_kids_1…4` | sfx | 0.226 / 0.186 / 0.216 / 0.162 | 0.60–0.74 s | Giggle / squeal / "o-maa~!" / "wheee~". |

**How the game should play them** (these are `src` changes for the code agent; each key's `notes` field repeats its usage)
- **Loading:**
  - Add `'audio5'` to `FRAGMENTS` in `src/core/Assets.js`.
  - Keep `bgm_beach` (about 18 MB decoded) and `amb_beach` out of Preload and out of the existing `^amb_` deferred rule, for example with `/^(bgm_village|amb_(?!beach)|sfx_lute)/`.
  - Load those two lazily with a rule like `/^(bgm_beach|amb_beach)$/` when the player first nears the beach.
  - Once `amb_sea_waves` replaces `amb_sea`, mark `amb_sea` unused so its 4.6 MB doesn't load.
- **Village sea:** drive `amb_sea_waves` with the same formula `amb_sea` uses now (`0.15 + sea*0.6`) and set `amb_sea` to 0. Keep it on the snowy side of the beach transition, because it has ice knocks.
- **Keeping the loops on the wave beat** (both loops):
  1. At the shore point nearest the camera, compute `cyc = fract((water.shore.w*water.t + water._nu(gx,gy) - π/2) / 2π)`. This is the shader's shore cycle: 0 means a crest is at the shore.
  2. Start the loop at `seek = (swellPhase + (cyc + k)*swellPeriod) mod duration`, for any whole number k.
  3. Re-seek whenever the loop restarts.
  4. Phaser's `play({ seek })` on a looping sound was tested and works.
- **Beach:** set `amb_beach` by distance to the sand, crossfaded against `amb_harbor`, and switch to `bgm_beach` with `playMusic`.
- **Shore washes:** play one `sfx_wave_wash` on every crest at the sand near the camera. Start it `cues.waterline` seconds before `cyc` wraps to 0 so its white water arrives with the crest. Volume 0.3–0.8 × `water._av(gx, gy, t)`, rate 0.95–1.05.
- **Wave crashes:**
  - Trigger them from `water.crashEvents(tPrev + 0.2, t + 0.2, (x, y, strength) => …)`. This looks ahead by the 0.2 s run-up, so the slap lands on frame 0 of `fx_wave_crash`.
  - Volume `clamp(0.25 + 0.55*strength, 0.3, 1)` × distance, rate 0.94–1.06.
  - Skip points off camera, and play at most 2 in any 0.5 s.
- **Footsteps:** on dry beach sand use `sfx_sand_step` instead of the snow steps; in the wet band at the waterline use `sfx_sand_step_wet`. Same call volume (about 0.32).
- **Splashes:**
  - `sfx_splash_beach` on the beachfolk splash-play frame.
  - `sfx_splash_2` (by key) when a swimmer enters the water.
  - `sfx_splash_3` (by key) for a cannonball or the banana boat tipping.
  - `sfx_pool_splash` for hotel pool dives.
- **Children:** one `sfx_beach_kids` at a time near families, every 6–15 s at random, volume 0.4–0.9 by distance. Add audio4's `sfx_seagull` now and then.
- **Whistle:** throttle to once per 8 s.
- **Ice-cream cart:** ring when customers arrive or every 20–40 s.
- **Beach ball:** play when the ball lands; for catches use volume 0.6, rate 1.15.
- **Hotel bell:** play at check-in.

**QA**
- **Levels:**
  - Every file's sample peak is at or below -1 dBFS, and its true peak at or below -1.0 dBTP (the highest is exactly -1.0, `sfx_beach_kids_1.ogg`).
  - In-game loudness hits its target exactly for every .ogg and within 0.5 dB for every .mp3.
  - Music plays at -26.5 LUFS like bgm_village; both loops at -33.5 like `amb_sea` and `amb_harbor`; sand steps at -19.5 like the snow steps.
- **Phone speakers:** with a 600 Hz high-pass standing in for a phone speaker, the beach ball loses 0.6 dB (was 10.5 dB). Every other key loses 0–2.8 dB (limit 4).
- **Pitch:** hotel bell C7 (-0.0 cents), ice-cream chime F6 (+0.1), ball F5 (-1.6), whistle F7 (-6.9).
- **Cues:** the crash impacts, ball bounces and pool slap are detected exactly where the manifest says.
- **Footsteps:** the dry steps have 0.9–1.8 % of their energy after 120 ms (step 3 was 24.7 %).
- **Wave timing:**

  | | `amb_sea_waves` | `amb_beach` |
  |---|---|---|
  | loop length | 41.9991 s (6.9998 periods) | 24.0007 s (4.0001 periods) |
  | average error against the 6 s beat, over 4 loop passes | 0.09 s (max 0.21) | 0.06 s (max 0.12) |
  | before this polish | 1.18 s (max 2.62) | 1.31 s (max 2.60) |
  | loudest moment of each wave vs its shore cue | 0.27 s on average | 0.21 s on average |

- **Loops:**
  - No click at the loop point for any loop in either format; all seam ratios are below 0.44, against a fail threshold of 1.
  - The .ogg files have no end padding.
  - Chromium 141 decodes the .ogg and .mp3 of every loop to exactly the right length (2,116,416 / 1,852,160 / 1,058,432 samples).
- **Phaser 3.90 load test** (headless Chromium; once with .ogg first, once with .mp3 only):
  - All 28 keys load and decode, and all 18 group members exist and play.
  - Loop lengths are exact.
  - Starting `amb_beach` with `play({ seek: 5.02 })` reads 6.02 one second later.
- **Repetition:** the critic's similarity score, with the intended 6 s wave beat taken out, is 0.14 for the sea and 0.10 for the beach (old `amb_sea`: 0.21). No noise is reused anywhere in either loop. The sea's breakers come 4.9–6.7 s apart.
- **Music:** the melody-against-chords check passes. The B section is now carried by the steel pan: the share of sound in the pan's range (700–1600 Hz) rose from -9.6 dB to -3.2 dB.
- **Size and rebuild:** 3,486,245 bytes. A second full rebuild produced byte-identical files (all 90 hashes match).
- **Preview page:** no console errors; all 5 scenes and 34 cards play; it fits a 390 px phone with no sideways scrolling.
- **Ownership:** no file outside my own was edited.

**Known issues**
- Everything was checked by measurement only; the designer needs to listen.
- **Shore-wave sprite period:** the water team's `fx_shore_wave` note says it cycles every 2.7 s, but Water.js uses 6.0 s. The audio follows Water.js, and the water team needs to settle on one period.
- **Small drift:** the loops drift from the wave beat by about 1 ms per pass, so re-seek whenever a loop restarts.
- **Short music loop:** the music stays 48 s. The 3.5 MB limit leaves only 13.8 kB of room, and a 32-bar version would add about 470 kB.
- **Trade-offs to fit the limit:** the treble roll-off and the shorter bell ring-outs are inaudible on phones and under the background loops, but someone on headphones in a quiet room may notice them.
- **One-shot .ogg length:** in Chromium the one-shot .ogg files decode up to 23 ms longer than their listed duration. The extra is silent, already-faded tail.
- **`sfx_wave_wash` by key:** because the group shares the key's name, `Audio.play('sfx_wave_wash')` always picks a random wash. The medium wash can't be requested on its own.
- **Mono loops:** both loops are mono to save phone memory; the "wide" feel comes from three distances of waves.
- **Reused generators:** the children use the town chatter voices, and the gulls use the harbour's gull generator.
- **Machine-dependent loops:** exact loop lengths and file sizes depend on the Vorbis encoder version, so rebuild and re-check on another machine.

**Critic issues → outcome**

| issue (severity) | outcome |
|---|---|
| Waves not timed to the 6 s Water.js swell (high) | Fixed: one near wave per crest, loops of 7 × 6 s and 4 × 6 s, beach near waves about 8 dB lower, timing fields in the manifest. Average error 0.09 / 0.06 s (was 1.18 / 1.31 s). |
| Mixed groups: cannonball with hand splashes, damp step with dry steps (medium) | Fixed: hand-splash-only group (1, 1b, 1c); separate dry and wet step groups with a second damp step; step 3's scuff ends by 110 ms. |
| Beach ball loses about 10 dB on phones (medium) | Fixed: retuned to F5 with a vinyl "pock"; the loss is now 0.6 dB. |
| Only one shore wash (medium) | Fixed: 3 washes in a `sfx_wave_wash` group, each with its own cues. |
| Recognisable children and gulls in the 28 s beach loop (medium) | Fixed: the calls are now `sfx_beach_kids_1..4`; the 24 s loop keeps only babble, far gulls (the contract asks for gulls) and far splashes. |
| Crash notes contradict the Water.js crash events and spray frames (medium) | Fixed: the notes now drive crashes from `crashEvents`, looking ahead 0.2 s, with volume from `strength`. |
| Loading and memory once audio5 is added (medium) | Fixed in the notes and the report (lazy rule, `amb_sea` marked unused). The `src` change itself belongs to the code agent. |
| Three files above -1 dBTP true peak (low) | Fixed: the encoder now enforces a -1 dBTP ceiling; the highest file is at -1.0. |
| Whistle sounds like a sine "beep" (low) | Fixed: deeper trill (strength 0.36, was 0.15), wider pitch wobble, stronger 2nd harmonic. |
| Music too short, ocarina leads the B section (low) | Lead fixed: the steel pan now leads B. Length won't fix: the 3.5 MB limit in the job leaves 13.8 kB. |
| Report and notes inaccurate (low) | Fixed: correct breaker spacing; the notes keep the icy sea loop off the beach. |

Rebuild with `python3 tools/audio/build_audio5.py` (about 5 minutes with 3 workers).

Files are in `/home/user/nurient/frost-village/`:
- `tools/audio/sfx5.py`
- `tools/audio/music5.py`
- `tools/audio/build_audio5.py`
- `tools/audio/check_audio5.py`
- `assets/audio5/manifest.json` (plus 56 .ogg/.mp3 files)
- `docs/previews/audio5_waveforms.png`
- `docs/previews/audio5_demo.mp3`
- `docs/previews/audio5_preview.html` (open through the game's local server)
- `docs/previews/audio5_report.txt`
- `docs/build_reports/audio5.md`

Test scripts and evidence are in `/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v7_audio5/polish/`:
- `verify.py`
- `phaser_load.mjs` (results in `phaser_p2.json`)
- `pv.mjs` (screenshot `preview_390.png`)
- `demo_spec.png`
- `build_p2.log`, `build_p3.log`
- `run_p2.sha1`, `run_p3.sha1`

## Critique

```json
{
 "verdict": "polish",
 "summary": "The audio5 sounds are technically clean and match the rest of the game, and I confirmed this with my own measurements. Every in-game level lands on the house targets: bgm_beach plays at -26.5 LUFS like bgm_village and bgm_harbor, both ambience loops at -33.5 like amb_sea and amb_harbor, and the sand steps at -19.5 momentary max like the snow steps. Loop seams are click-free in both .ogg and .mp3. Headless Chromium 141 decodes every loop to exactly loopSamples at 44.1 kHz, and I also tested 48 kHz, the rate most phones use: the seam ratio stays at 0.07–0.26. The new sea does not repeat itself: its band-envelope self-similarity is 0.16, against 0.63 for the old amb_sea, and I found no copied noise buffers (cross-correlation 0.22 or less). bgm_beach really is in the village melodic family: I checked music5.py and music.py, and it uses the same hook pitches and chords, and the B melody is copied note for note. Every key in CONTRACT_V7 §Z is present (19 keys).\n\nThe problems are in how the sounds fit the game, not in how they were made:\n1. The waves in the sea and beach loops are not timed to the Water.js swell, which reaches the shore every 6.0 s. The loops are 46 s and 28 s long, so the sound of the waves drifts against the waves the designer sees.\n2. Two sound groups mix the wrong sounds: a cannonball is in the hand-splash group, and the damp-sand step is in the dry-sand step group.\n3. The beach ball loses about 10 dB on a phone speaker.\n4. The shore wash has only one variant, and the beach loop already carries loud near waves.\n5. The 28 s amb_beach loop repeats recognisable children's calls and gulls.\n6. The manifest notes give timing instructions that contradict Water.js crash events and the fx_wave_crash frames.\n7. When the code agent adds audio5, about 14–33 MB of decoded audio will load before the player ever reaches the beach.\n\nEach of these can be fixed with a targeted re-render or a manifest change. None needs a rebuild of the toolkit.\n\nEvidence (all in /tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v7_audio5_critic/):\n- sync_vs_6s_swell.png\n- spec_amb.png\n- spec_steps.png\n- spec_whistle_bells.png\n- spec_music.png\n- scripts: meas.py, lufs.py, rep.py, seam.py, dec48.mjs, phone.py, phone2.py, steps.py, sync.py",
 "issues": [
  {
   "severity": "high",
   "area": "amb_sea_waves / amb_beach — timing against the visible waves (the designer's main request: '출렁 파도치고', '물결이 바뀌니 소리도 함께')",
   "problem": "The near waves in both beds are placed at irregular times, and neither loop length is a multiple of the water's swell period. In src/systems/Water.js, SWELL.shore.period is 6.0 s (line 82): crests reach the shore every 6 s, and crashEvents fire at those times. The sea's near breaks are 4.5–6.8 s apart in a 46.0 s loop, and the beach's are 4.6–7.4 s apart in a 28.0 s loop. So the loud surges in the sound drift against the crest lines on screen, by a different amount on each pass of the loop. A player will see a white crest hit the sand in silence and then hear a surge with no crest. The manifest has no swell period and no break times, so the code cannot line them up. The sfx_wave_wash note also says 'amb_beach already carries the far surf'. In fact the near layer is the loudest part of amb_beach (BEACH_LEVELS near -20 against surf -29, sfx5.py:338). Washes added on cue would therefore create a second, unrelated wave rhythm at the same loudness: sfx_wave_wash at call volume 0.3–0.8 peaks at -31.5 to -23 LUFS, and the bed's near waves at -26.4.",
   "evidence": "sync.py → sync_vs_6s_swell.png: against the best-fitting 6 s grid, the average timing error is 1.18 s for amb_sea_waves and 1.31 s for amb_beach, with a maximum of 2.6 s (the worst possible is 3.0 s). Designed near-break gaps: sea [6.8 5.6 6.2 6.7 5.5 5.3 4.5 5.4], beach [5.5 4.7 5.8 4.6 7.4]. The 28 s loop shifts its wave timing by 4 s each pass; 46 s shifts it by 4 s. The water team's fx_shore_wave note says it cycles every 2.7 s, which conflicts with the shader's 6.0 s, so the water team needs to settle on one period.",
   "fix": "First agree on the swell period with the water team (6.0 s per Water.js). Then re-render with near breaks on that grid, k·P plus ±0.25 s jitter, still varying size, plunge and noise; the mid and far layers can stay irregular. Use loop lengths that are multiples of P: amb_sea_waves 42 s (7×6) or 48 s, amb_beach 24 s or 30 s. Choosing 42 + 30 keeps the payload under budget. Add `swellPeriod: 6.0` and `cues.breaks: [...]` to the manifest, measured after rotation. Then the game can set the bed's start position (Phaser's `seek`) to the Water time at the shore nearest the camera, or the reverse. At the beach, lower the near layer of amb_beach by about 8 dB so that sfx_wave_wash, triggered by the code on crest events, carries the near swash, and correct the sfx_wave_wash note."
  },
  {
   "severity": "medium",
   "area": "audioGroups: sfx_splash_beach and sfx_sand_step",
   "problem": "Both groups mix sounds that are not interchangeable, and Audio.play(group) picks members at random. (1) The manifest notes and the report say to play sfx_splash_beach on the beachfolk splash_play frame. splash_play is a repeating 6-frame kids' hand-splash animation, and the group also holds splash_2 ('jumping in') and splash_3 ('KA-BLOOMP' cannonball, with a 0.6 s body thump). So a third of the hand splashes would sound like a cannonball. (2) sfx_sand_step holds three dry-sand steps and the damp 'thup' with a wet squelch (step 4). Walking on dry sand would play a wet step about one time in four. Step 4 also sounds different from the others: its low band is -8.5 dB of the total, against -23 dB for steps 1–3. In addition, step 3's toe scuff makes a second burst at 130–180 ms (24.7% of its energy comes after 120 ms). At full running speed a step plays every 0.225 s (Player.js stepT 0.27 / 1.2), so that scuff lands between steps and sounds like a gallop.",
   "evidence": "assets/audio5/manifest.json audioGroups. Notes on sfx_splash_1 ('Use for beachfolk splash_play') and sfx_sand_step_1 ('1-3 soft dry sand, 4 damp'). src/core/Audio.js play() picks group members at random. Envelope and spectrum figures from steps.py and meas.py; spec_steps.png.",
   "fix": "Make sfx_splash_beach contain hand splashes only: add 2–3 small variants such as sfx_splash_1b and _1c (about 12 kB .ogg each). Call sfx_splash_2 and sfx_splash_3 by key for entering the water and for cannonballs. Make sfx_sand_step = [1,2,3] and add a group sfx_sand_step_wet = [4] (ideally with a second damp variant) for the wet band at the waterline. Shorten step 3's scuff to finish within 110 ms, or move it to a separate occasional key."
  },
  {
   "severity": "medium",
   "area": "sfx_beachball_bounce on phone speakers",
   "problem": "The ball sits almost entirely below 400 Hz: an F4 tone at 349 Hz, a 0.5× sub-partial at 175 Hz, and a sand thud low-passed at 380 Hz. Its upper partials die out within 25–50 ms. Small phone speakers reproduce little below 400–600 Hz, so the ball comes out about 10 dB quieter than every other new sound. On a phone, under amb_beach and bgm_beach, the cute '통통' the design asks for will barely be heard. The only older sound this low is sfx_door.",
   "evidence": "Spectrum of the first 0.25 s: 10.4% of the energy is below 250 Hz, 85.3% between 250 and 400 Hz, and 0.5% between 600 and 1000 Hz. Using a 600 Hz high-pass (4th order) as a phone-speaker stand-in, the ball loses 10.5 dB, sfx_door 9.4 dB, and every other audio5 sound 0–1.4 dB (phone2.py). With a 400 Hz high-pass the ball still loses 4.3 dB (phone3.py). The spectrogram (spec_steps.png, bottom row) shows tones at 175, 350 and 550 Hz that run through the whole sound.",
   "fix": "In sfx5.ball_hit, raise the main 'boing' to about F5 (698 Hz) or C5. Drop the 0.5× partial or bring it down to 0.15. Lengthen the decay of the 1.59× and 2.14× partials to about 0.06–0.08 s, and add a short vinyl 'pock' resonance around 1.2–2 kHz. Re-target to the same -19.5 LUFS momentary max, and check that the phone-filter loss stays under 3 dB."
  },
  {
   "severity": "medium",
   "area": "sfx_wave_wash variety",
   "problem": "There is only one wash sample, 3.87 s long. If the code plays it on shore crests near the camera, as the notes suggest, the same wave plays every 6 s with only a ±8% rate change. In a minute at the beach the player hears it about 10 times. The contract names a single key, but Audio.play looks up groups first, so a group with the same name can hold variants without breaking the contract.",
   "evidence": "assets/audio5/manifest.json has a single sfx_wave_wash key and no group. src/core/Audio.js play() checks the group before the key. The Water.js shore period is 6.0 s.",
   "fix": "Render 2 more washes, sfx_wave_wash_2 and _3, with different sizes, run-up lengths and backwash times (about 30–40 kB .ogg each, or less if trimmed to 3 s). Add the group `sfx_wave_wash: [sfx_wave_wash, sfx_wave_wash_2, sfx_wave_wash_3]`, and give each variant its own crest, upmost and retreat cues."
  },
  {
   "severity": "medium",
   "area": "amb_beach — events too recognisable for a 28 s loop",
   "problem": "The 28 s bed contains 9 recognisable children's calls (4 laughs, 2 squeals, 2 'o-maa~' calls, 1 'wheee'), 5 gulls and 3 splashes, each always at the same point in the loop. In a 3-minute beach visit each one comes back about 6 times. The loudest gull at 20.4 s (closeness 0.7) and the single 'wheee' at 12.4 s will be noticed first, and this designer is picky about detail.",
   "evidence": "sfx5.py:332-337 (BEACH_KIDS, BEACH_GULLS). The pitch contours show clearly in spec_amb.png (third strip). Peaks in the momentary loudness of amb_beach (phone.py) fall at 1.0, 6.7, 11.2, 15.8, 18.3, 21.7 and 24.7 s.",
   "fix": "Leave only background babble, crowd murmur, breeze and surf in the bed, so the loop cannot be heard. Ship the recognisable children's calls as a group of one-shots, for example sfx_beach_kids_1..4 at about 10 kB .ogg each, for the code to play at random every 6–15 s near families. Use audio4's existing sfx_seagull group for gulls. This also frees bytes, so the bed can be 30 s (5×6) to match the swell grid in the high-severity issue."
  },
  {
   "severity": "medium",
   "area": "sfx_wave_crash usage notes against Water.js crash events and the fx_wave_crash frames",
   "problem": "The notes tell the code to fire crashes 'at random every 5-14 s per rocky shore segment', or to start the sound on frame 0 'because the fx needs ~0.2 s to burst'. But Water.js already sends crash events on a fixed schedule: crashEvents fires at each crest time, about every 6 s, and only for bigger waves (av ≥ 0.78). It passes the event to opts.onCrash, and fx_wave_crash frame 0 already shows the foam mound of the impact (10 frames at 20 fps). If the sound starts on frame 0, the slap at cue 0.20 s lands about 200 ms after the impact is on screen, which is noticeably late. Random timing would be out of step with the sprays as well.",
   "evidence": "src/systems/Water.js:1039-1073 (crashEvents is a pure function of time; onCrash). assets/water/manifest.json fx_wave_crash: frameCount 10, fps 20. assets/water/fx_wave_crash.png (frame 0 already shows the impact mound). The sfx_wave_crash_* notes in the manifest.",
   "fix": "Rewrite the notes. Trigger crash sounds from Water.opts.onCrash, using the strength value it passes (0.5–1.4) to set volume. To land the slap on the impact, have the code call water.crashEvents(t + cues.impact, t1 + cues.impact, fn) each frame and start the sound 0.2 s early, keeping the limit of two at once. Alternatively, ship crash variants whose impact is at 0 s and drop the run-up surge."
  },
  {
   "severity": "medium",
   "area": "Loading and memory once audio5 is added to FRAGMENTS (for the code agent)",
   "problem": "The 'load lazily like the harbour music' advice has no code to follow: audio3 and audio4 are not in FRAGMENTS, and src has no lazy-music mechanism. If audio5 is simply added: (a) bgm_beach is neither deferred nor marked unused, so it enters the Preload queue, adding a 646 kB download before the title screen and about 18.4 MB of decoded audio at boot; (b) the ^amb_ rule loads amb_sea_waves (8.8 MB) and amb_beach (5.4 MB) when the Game scene starts, even for players far from any beach; (c) the old amb_sea (4.6 MB) keeps loading even after amb_sea_waves replaces it. The game is mobile-first, so this matters.",
   "evidence": "src/core/Assets.js:10 (FRAGMENTS), :241 (isDeferredAudio /^(bgm_village|amb_|sfx_lute)/), :243 (isUnusedAudio). src/scenes/Preload.js:30 and Game.js:267 show how deferred audio is queued. Decoded sizes are float32 at 48 kHz, calculated from the manifest durations.",
   "fix": "In the manifest notes and report, ask the code agent for: a new lazy-audio rule (e.g. /^(bgm_beach|amb_beach)$/) loaded when the player first comes near the beach; amb_sea_waves in place of amb_sea, with amb_sea marked unused once the switch is made; and no automatic loading of amb_beach through the generic ^amb_ rule."
  },
  {
   "severity": "low",
   "area": "True peak",
   "problem": "Three files go above -1 dBTP when measured with 4× oversampling, although their sample peaks are at or below -1 dBFS as the contract requires: sfx_splash_2.ogg -0.8 dBTP, sfx_splash_3.ogg -0.9, and sfx_wave_crash_1.mp3 -0.7. The in-game volumes (0.34–0.41) leave headroom, but the report's 'every file peaks at -1.0 dBFS or below' does not hold for true peak.",
   "evidence": "ffmpeg ebur128 with peak=true+sample over all 38 files: only these three are above -1.0 dBTP.",
   "fix": "Normalise the sound effects to -1.5 dBTP with an oversampled peak check (or lower these three by 0.5 dB), then confirm the .mp3 decodes."
  },
  {
   "severity": "low",
   "area": "sfx_lifeguard_whistle character",
   "problem": "The pea-whistle trill is shallow. Measured over the long blast, the amplitude modulation is at 38 Hz with a depth of only about 0.16; in the code it is am = 1 - 0.38·(…), and the pitch wobble is ±0.32 semitone. The rest is an almost pure 2.79 kHz tone, with the 2nd harmonic 25 dB down. It may come across as a sine 'beep' rather than the rattling 'trrrreet' of a lifeguard's pea whistle. The level itself is fine: -20.1 LUFS momentary max, like the other bells and whistles.",
   "evidence": "spec_whistle_bells.png (top row: one line at 2.8 kHz with a weak 5.6 kHz harmonic). Hilbert-envelope measurement of the 0.35–0.85 s section.",
   "fix": "In pea_whistle, deepen the amplitude modulation to about 0.6–0.75, raise the frequency wobble to about ±0.6 semitone, and bring the 2nd harmonic up to about 0.15–0.2. Keep F7 and the -20 LUFS momentary target, then have the designer listen."
  },
  {
   "severity": "low",
   "area": "bgm_beach length and lead voice",
   "problem": "At 48 s, the loop is at the short end of the 45–90 s the contract allows. A third of it (B, 8 of 24 bars) has the village ocarina as lead, not a beach instrument, which weakens the 'ukulele / steel drum summer music' the designer asked for (기획서_v7 §6). The 3.5 MB folder cap behind the short length is not in CONTRACT_V7 §Z: it appears only as MAX_PAYLOAD in check_audio5.py, and it counts both formats, although a player downloads only one (.ogg 1.58 MB).",
   "evidence": "music5.py SECTIONS / B_MEL (the ocarina in the 'B' branch of _premix_beach). Sums of .ogg and .mp3 sizes per folder.",
   "fix": "Find out whether the 3.5 MB cap is a real requirement. If it is not, extend to 32 bars (64 s) with a steel-pan and ukulele C section. If it is, at least move the B lead to steel pan, with the ocarina only doubling it softly."
  },
  {
   "severity": "low",
   "area": "Report and notes accuracy",
   "problem": "The report says the sea has 'gaps of 4.6–9.8 s'. The score actually places near breaks 4.5–6.8 s apart (sfx5.py SEA_NEAR and its own comment); the 9.8 s gap comes from the detector missing the small breaker at 39.7 s. Also, amb_sea_waves contains ice floes knocking and thin cold air, yet the report suggests crossfading it into the warm Sunny Beach, so ice knocks would be heard next to the beach.",
   "evidence": "sfx5.py:263-268, report table 'gaps between breakers 4.6–9.8 s'. SEA_ICE events at 6.2, 20.1, 33.0 and 41.3 s.",
   "fix": "Correct the report: '8 near breakers 4.5–6.8 s apart, plus mid-distance waves between them'. In the beach notes, crossfade amb_beach against amb_harbor, or keep the overlap with amb_sea_waves on the snowy side of the transition."
  }
 ],
 "keep": [
  "Loudness staging exactly on house targets (my K-weighted measure reproduces the builder's): bgm_beach -26.5 effective LUFS = bgm_village/bgm_harbor/bgm_spring; amb_sea_waves -33.6 = amb_sea -33.6; amb_beach -33.5 = amb_harbor -33.5; splashes -18.5…-19.5 momentary max (v1 sfx_splash -19.0); sand steps -19.5 = snow steps -19.5; bells -19.5 (other bells -18.5…-19.5).",
  "Loop seams: clean in both formats; Chromium 141 decodes every loop to exactly loopSamples at 44.1 kHz, and at 48 kHz the lengths are correct with seam ratios 0.07–0.26; .ogg has no end padding; rotate_quiet places the seam in a natural quiet moment.",
  "amb_sea_waves construction: four independent noise layers with churn, no reused noise buffers (sample-level correlation ≤ 0.22), band-envelope self-similarity 0.16 against 0.63 for the old sea, and the wave contrast survives a phone-speaker filter (14 dB range, 11 peaks in the loop).",
  "Melodic family: same hook pitches (A C D C A C), same A and B chord progressions, B melody copied from the village tune, village counter-line in A2, consonance check passes; every pitched sound effect is in F major (bell C7, whistle F7, ice-cream chime on the village hook ending on F6, ball F4).",
  "bgm_beach mixes well to mono (L/R correlation 0.949, mono sum -0.2 LU), with no aliasing in the steel pan, ukulele or shaker (spec_music.png); its high-frequency balance matches bgm_village.",
  "The group name sfx_splash_beach avoids taking over the v1 sfx_splash key; no key or group name clashes with audio–audio4; manifest fields (files order ogg/mp3, volume/loop/kind/duration, loopSamples, mp3StartPad 1105, rotation, cues) match earlier fragments.",
  "Crashes, splashes, pool dive, washes, bells and steps hold up on a phone speaker (≤ 1.4 dB loss with a 600 Hz high-pass); the cue times for the crash impacts (0.20 and 0.54 s) and ball bounces (0, 0.30, 0.48 s) are where the manifest says.",
  "Mono ambience and stereo music, as in earlier fragments; deterministic, byte-identical rebuild; build and check scripts import the shared toolkit without editing it."
 ]
}
```

## Build

All 19 beach and sea sounds (CONTRACT_V7 §Z) are built into `assets/audio5/`, and `check_audio5.py` reports RESULT: OK. I can't listen to audio, so everything was judged by measurements, spectrograms and decoding in headless Chromium. The designer needs to listen before release, especially to the new sea, the steel pan and ukulele in the music, and the children on the beach.

**Keys and groups**
- Three groups: `sfx_wave_crash` (3 sounds), `sfx_splash_beach` (3) and `sfx_sand_step` (4). The splash group is deliberately not called `sfx_splash`: that name is the v1 fish splash, and a group with the same name would take over every call to it.
- No key or group name clashes with `audio`…`audio4`.

| key | kind | volume | length | what it is |
|---|---|---|---|---|
| `bgm_beach` | music, loop, stereo | 0.376 | 47.99 s | Island / calypso theme in F, 120 bpm, 24 bars (A, B, A). The steel pan plays the village hook; the B section is the village's own B melody on its ocarina. Ukulele strum, calypso bass, congas, claves. Same loudness as bgm_village. |
| `amb_sea_waves` | ambience, loop, mono | 0.216 | 46.00 s | Real rolling sea for the village coast: 8 near waves at uneven gaps and sizes that swell, break, rush up and hiss back. Waves further along the coast, distant surf, rumble, cold air, ice floes knocking. |
| `amb_beach` | ambience, loop, mono | 0.219 | 28.00 s | Gentle surf on sand, distant children playing, gulls, far splashes, warm breeze, faint crowd. |
| `sfx_wave_crash_1/2/3` | sfx | 0.407 / 0.385 / 0.359 | 2.96–3.68 s | Waves on rocks ("철썩!"): medium slap / big boom / double slap. The slap lands at 0.20 s (cue `impact`; the double slap's second hit at 0.54 s). |
| `sfx_wave_wash` | sfx | 0.302 | 3.87 s | One wave running up the sand and draining back. Cues: rush 0, crest 0.58, furthest up 1.1, retreat 1.9 s. |
| `sfx_splash_1/2/3` | sfx | 0.447 / 0.335 / 0.343 | 0.88–1.85 s | Hand splash / jumping in / cannonball. |
| `sfx_pool_splash` | sfx | 0.347 | 1.93 s | Dive into the hotel pool, with wall echo and gutter laps. |
| `sfx_lifeguard_whistle` | sfx | 0.112 | 1.34 s | Pea whistle "tweet – tweeeet". |
| `sfx_icecream_bell` | sfx | 0.245 | 2.18 s | Cart bells play the village hook and land on F, then a jingle. |
| `sfx_beachball_bounce` | sfx | 0.501 | 0.86 s | Vinyl ball "boing" plus two small re-bounces at 0.30 and 0.48 s. |
| `sfx_hotel_bell` | sfx | 0.211 | 1.97 s | Reception desk "ding". |
| `sfx_sand_step_1…4` | sfx | 0.68 / 0.74 / 0.55 / 0.84 | 0.25–0.32 s | Dry sand ×3 (3 has a toe scuff), damp sand ×1. |

**How the game should play them** (these are `src` changes for the code agent):
- **Loading:** add `'audio5'` to `FRAGMENTS` in `src/core/Assets.js`. Both ambience loops are already deferred by the existing `^amb_` rule. `bgm_beach` takes about 17 MB once decoded, so load it lazily like the harbour music.
- **Village sea:** in `Game.js`, set `amb_sea_waves` with the same formula `amb_sea` uses now (`0.15 + sea*0.6`) and set `amb_sea` to 0. The loudness targets match, so the mix stays the same.
- **Beach:** set `amb_beach` by distance to the sand, crossfaded against `amb_sea_waves`, and switch to `bgm_beach` with `playMusic`.
- **Wave crashes:** play `sfx_wave_crash` with the water team's spray animation, either 0.2 s before the spray frame or on frame 0. One every 5–14 s per rocky stretch in view, volume 0.35–1 by distance, at most two at once.
- **Shore washes:** play `sfx_wave_wash` with the shore-wave animation, every 4–9 s near the camera.
- **Footsteps:** on beach ground, use `sfx_sand_step` instead of the snow steps, at the same call volume (about 0.32).
- **Splashes:** `sfx_splash_beach` on the beachfolk splash-play frame; `sfx_pool_splash` for hotel pool dives.
- **Beach ball:** play `sfx_beachball_bounce` when the ball lands; for catches use volume 0.6, rate 1.15.
- **Whistle:** throttle to once per 8 s.
- **Ice-cream cart:** ring when customers arrive or every 20–40 s.
- **Hotel bell:** play at check-in.
- Each key's `notes` field in the manifest repeats its usage.

**QA**
- **Levels:**
  - Every file peaks at -1.0 dBFS or below.
  - In-game loudness hits its target exactly for the .ogg files and within 0.5 dB for the .mp3.
  - Pitched sounds are within 3 cents of their notes (bell C7, whistle F7, chime F6, ball F4).
  - The cue times in the manifest match where the sounds actually hit.
- **Loops:**
  - No click at the loop point for any loop, in either format.
  - The .ogg files have no end padding.
  - Chromium 141 decodes the .ogg and .mp3 of every loop to exactly the right length.
- **Sea:** the old `amb_sea` repeats the same wave pattern twice inside its 24 s (similarity score 0.93). The new sea scores 0.27, with gaps of 4.6–9.8 s and wave loudness varying by 5.8 dB. The check fails if the score reaches 0.6.
- **Size and rebuild:** the folder is 3,443,231 bytes (limit 3.5 MB). A second full rebuild produced byte-identical files. No existing audio file or script was changed.

**Known issues**
- **Mono sea:** the sea is mono, like every other ambience loop, to save phone memory (8 MB mono vs 16 MB stereo). The "wide" feel comes from three distances of waves, not stereo.
- **Short music loop:** the music loop is 48 s. The contract allows up to 90 s, but there is only about 57 kB of room left under the size limit, so nothing can get longer without dropping something else.
- **Reused voices:** the children use the same voices as the existing town chatter. The beach gulls use the harbour's gull generator at different pitches, so they may sound alike.
- **Whistle level:** the whistle is a bright pure tone; its base volume is set low (0.112).
- **Machine-dependent loop lengths:** exact loop lengths depend on the Vorbis encoder version, so rebuild and re-check on another machine.
- **Build cache:** intermediate files sit in `tools/audio/_cache/audio5/`, which git ignores.

Rebuild with `python3 tools/audio/build_audio5.py` (about 3 minutes).

Files are in `/home/user/nurient/frost-village/`:
- `tools/audio/sfx5.py`
- `tools/audio/music5.py`
- `tools/audio/build_audio5.py`
- `tools/audio/check_audio5.py`
- `assets/audio5/manifest.json` (plus 38 .ogg/.mp3 files)
- `docs/previews/audio5_waveforms.png`
- `docs/previews/audio5_demo.mp3` (64 s: village sea, beach day, pool, sunset)
- `docs/previews/audio5_preview.html` (open through the game's local server)
- `docs/previews/audio5_report.txt`
- `docs/build_reports/audio5.md`
