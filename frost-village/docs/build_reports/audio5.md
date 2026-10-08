# audio5 build report (v7.1, after the critic review)

AUDIO5 (CONTRACT_V7 §Z) is done and polished: all 19 contract sounds plus 9 variants for the living sea and the Sunny Beach are in `assets/audio5`, and `check_audio5.py` reports `RESULT: OK`. A second full rebuild gave byte-identical files. I can't listen to audio, so everything was judged by measurements, spectrograms, a melody-against-chords check, decoding in headless Chromium and a Phaser 3.90 load test. The designer should listen before release, especially to the new sea (`amb_sea_waves`), the steel pan and ukulele in `bgm_beach`, and the beach washes with `amb_beach`.

**What changed in this polish**
- **Sea in step with the waves on screen.** `src/systems/Water.js` brings a shore-swell crest to the waterline every 6.0 s. Both beds now have one near wave per crest:
  - `amb_sea_waves`: 42 s = 7 crests.
  - `amb_beach`: 24 s = 4 crests.
  - Each loop is a whole number of swell periods (to 1 ms), so the waves stay on the grid every time the loop repeats.
  - The manifest lists `swellPeriod`, `swellWaves`, `swellPhase` and `cues.waterline / breaks / upmost`, so the game can seek the bed into step with the Water time.
- **New one-shot variants:**
  - 3 washes (group `sfx_wave_wash`).
  - 3 hand splashes (`sfx_splash_beach`).
  - 2 damp steps (`sfx_sand_step_wet`).
  - 4 children's calls (`sfx_beach_kids`).
- **`amb_beach` holds no recognisable events.** It keeps only a far babble, two far gulls (the contract asks for gulls), two far splashes, breeze and crowd. Its near surf is about 8 dB lower, so the `sfx_wave_wash` one-shots carry the near surf.
- **Other sound fixes:**
  - Groups hold only interchangeable sounds.
  - The beach ball is retuned to F5 with a vinyl "pock", so it carries on phone speakers.
  - The toe scuff in `sfx_sand_step_3` is over within 110 ms.
  - The lifeguard whistle has a deeper pea trill.
  - Every file is at or below -1 dBTP (true peak).
  - The B section of `bgm_beach` is led by the steel pan, with the ocarina doubling it softly.
- **Fitting under 3.5 MB:**
  - One-shots end where their tail falls 40 dB under their loudest 20 ms, then fade out over 60 ms.
  - The beds and washes roll off above 15 kHz; the music and other one-shots roll off above 16 kHz.
  - The manifest notes are shorter.

**Fragment and keys**
- Manifest: `assets/audio5/manifest.json`, version 1. Every key lists `files: ["audio5/<key>.ogg", "audio5/<key>.mp3"]`, plus `volume`, `loop`, `kind` and `duration`.
  - Loops also have `loopSamples`, `mp3StartPad: 1105` and `rotation`.
  - The beds add `swellPeriod`, `swellWaves`, `swellPhase` and `cues`.
  - The music has `bpm`.
- 28 keys (19 contract keys + 9 variants), 56 files. Payload is 3,486,245 bytes including the 12.5 kB manifest (limit 3,500,000).
- Six groups (`Audio.play(group)` picks a random member):

  | group | members | notes |
  |---|---|---|
  | `sfx_wave_crash` | `_1`, `_2`, `_3` | |
  | `sfx_wave_wash` | `sfx_wave_wash`, `_2`, `_3` | Same name as the contract key on purpose: `Audio.play` looks up groups first, so every `play('sfx_wave_wash')` call gets a random variant. |
  | `sfx_splash_beach` | `sfx_splash_1`, `_1b`, `_1c` | Hand splashes only. |
  | `sfx_sand_step` | `_1`, `_2`, `_3` | Dry sand. |
  | `sfx_sand_step_wet` | `_4`, `_5` | Damp sand. |
  | `sfx_beach_kids` | `_1` … `_4` | Children's calls. |

  `sfx_splash_2` (jump in) and `sfx_splash_3` (cannonball) are played by key.
- No splash group is called `sfx_splash`, because that is the v1 fish-splash key. No key or group clashes with `audio` … `audio4` or `audio6`. The check also catches a group named like another fragment's key.

| key | kind | volume | length | what it is |
|---|---|---|---|---|
| `bgm_beach` | music, loop, stereo | 0.376 | 47.99 s | Sunny island / calypso theme. F major, 120 bpm with swung eighths, 24 bars, form A1 B A2. The steel pan plays the bgm_village hook "A C D – C A C" in A and the village's own B melody in B (rolled long notes, ocarina doubling an octave below). A2 adds the marimba and the village glock counter-line. Ukulele "down, down-up, up-down-up", calypso bass, congas, claves, shaker, water "bloops", slide whistle. Plays at -26.5 LUFS after volume, the same as bgm_village. |
| `amb_sea_waves` | ambience, loop, mono | 0.219 | 42.00 s | Real rolling sea for the cold village coast. 7 near breakers, one per 6 s swell crest, in a set that rises and falls (5.7 dB spread). Each breaker has its own approach, break type (plunging "whump" or spilling roll), white-water churn, rush up the shore, and a hissing, fizzing shingle backwash. Under them: irregular waves further along the coast, far surf that swells with distant sets, a deep rumble, cold air and a few ice floes knocking. |
| `amb_beach` | ambience, loop, mono | 0.216 | 24.00 s | Sunny Beach bed: low spilling surf on the same 6 s grid, a far babble of children, two far gulls, two far splashes, a warm breeze through palms and a faint holiday crowd. |
| `sfx_wave_crash_1` / `_2` / `_3` | sfx | 0.389 / 0.367 / 0.363 | 2.94 / 3.38 / 3.04 s | Water hitting rocks or the breakwater ("철썩!"): a 0.2 s surge, then the slap (cue `impact` 0.20 s), with spray, droplets raining back and water pouring off the stones. 1 = medium slap, 2 = big boom, 3 = double slap (`impact2` 0.54 s). |
| `sfx_wave_wash` / `_2` / `_3` | sfx | 0.288 / 0.432 / 0.299 | 2.98 / 2.59 / 3.32 s | One swash up the sand and back with a fizzing hiss. 1 = medium, 2 = small quick lap, 3 = big with a long backwash. Cues `break` 0.10, `waterline` 0.725 / 0.676 / 0.774, `upmost` 1.888 / 1.691 / 2.132 s. |
| `sfx_splash_1` / `_1b` / `_1c` | sfx | 0.452 / 0.355 / 0.355 | 0.82 / 0.90 / 0.92 s | Hand splashes: "splish-splish" with both hands (`slap2` 0.13), one flat slap with a flick of spray, three quick paddles. |
| `sfx_splash_2` / `_3` | sfx | 0.351 / 0.335 | 1.28 / 1.76 s | Jumping in feet-first "sploosh"; cannonball "ka-bloomp" with a big spray. |
| `sfx_pool_splash` | sfx | 0.385 | 1.90 s | Hotel pool dive: slap and plunge, slap-back off the hotel wall and tiled deck, laps into the gutter (`laps` 0.62). |
| `sfx_lifeguard_whistle` | sfx | 0.148 | 1.16 s | Pea whistle "tweet – tweeeet" on F7 with a deep pea trill (40 Hz, AM index 0.36, was 0.15). Cues `tweet` 0, `tweeet` 0.27. |
| `sfx_icecream_bell` | sfx | 0.245 | 1.82 s | Cart bells play the village hook A5 C6 D6, land on F6 (`last` 0.62), then a jingle (`jingle` 0.95). |
| `sfx_beachball_bounce` | sfx | 0.457 | 0.78 s | Vinyl beach ball "boing" on F5 with a vinyl "pock" around 1.6 kHz and a light sand thud, plus two re-bounces (`bounce2` 0.30, `bounce3` 0.48). |
| `sfx_hotel_bell` | sfx | 0.207 | 1.68 s | Reception desk bell: plunger tick and a bright "DING" on C7. |
| `sfx_sand_step_1` … `_3` | sfx | 0.684 / 0.759 / 0.631 | 0.31–0.32 s | Dry sand: soft heel thud and a short slide of grains. 3 has a quick toe scuff. Each step is over within 120 ms. |
| `sfx_sand_step_4` / `_5` | sfx | 0.832 / 0.708 | 0.24 s | Damp, firm sand at the waterline ("thup", "thup-p"). |
| `sfx_beach_kids_1` … `_4` | sfx | 0.226 / 0.186 / 0.216 / 0.162 | 0.60–0.74 s | Children nearby: giggle "hi-hi-hi", squeal "ee-YAA!", call "o-maa~!", "wheee~". |

**Extra manifest fields** (the game ignores them): `cues` (seconds from the file start, or loop times for the beds), `notes` (usage text for each key), `swellPeriod`, `swellWaves`, `swellPhase`, `bars`, `meter`, `tonality`, `rotation`.

**How the game should use them** (src changes for the code agent; each key's `notes` repeats this)
- **Loading:**
  - Add `'audio5'` to `FRAGMENTS` in `src/core/Assets.js`.
  - Keep `bgm_beach` (about 18 MB decoded) and `amb_beach` (4.6 MB) out of Preload and out of the generic `^amb_` deferred rule. For example, use `/^(bgm_village|amb_(?!beach)|sfx_lute)/`, plus a lazy rule `/^(bgm_beach|amb_beach)$/` that is queued when the player first nears the beach.
  - `amb_sea_waves` (8 MB) loads deferred with the other `amb_` loops.
  - Once `amb_sea_waves` replaces `amb_sea`, mark `amb_sea` unused so its 4.6 MB decode is skipped.
- **Village sea:** in `Game.js`, where it calls `Audio.setAmbience('amb_sea', 0.15 + sea * 0.6)`, drive `amb_sea_waves` with the same formula and set `amb_sea` to 0. The loudness targets are the same, so the mix stays the same. `amb_sea_waves` is the cold coast (it has ice knocks), so keep it on the snowy side of the beach transition.
- **Swell sync (both beds):**
  1. At the shore point nearest the camera, compute `cyc = fract((water.shore.w * water.t + water._nu(gx, gy) - PI/2) / (2 PI))`. This is the shader's shore cycle: 0 means a crest is at the waterline.
  2. Start the bed with `seek = (swellPhase + (cyc + k) * swellPeriod) mod duration`, for any integer k.
  3. Re-seek whenever the bed restarts.
  4. Phaser 3.90 `sound.play({ seek })` on a looping sound starts there and then loops from 0 (tested in headless Chromium).
- **Beach:** set `Audio.setAmbience('amb_beach', near)` by distance to the sand, crossfaded against `amb_harbor`; fade `amb_sea_waves` out before the sand. Then call `Audio.playMusic('bgm_beach')`.
- **Shore washes:** play one `sfx_wave_wash` on every crest at the sand near the camera, every 6 s. Start it `cues.waterline` seconds before `cyc` wraps to 0, so its white water arrives with the crest line. Use volume 0.3–0.8 × `water._av(gx, gy, t)` and rate 0.95–1.05. These washes are the near surf; the bed carries only a low surf.
- **Wave crashes:** drive them from the Water.js crash events: big crests (`av ≥ 0.78`) at rock or breakwater points, about every 6 s, where Water also starts `water/fx_wave_crash`, whose frame 0 is the impact.
  - `crashEvents(t0, t1, fn)` is a pure function of time, so call `water.crashEvents(tPrev + 0.2, t + 0.2, (x, y, strength) => …)` and start `sfx_wave_crash` then. The slap at `cues.impact` then lands on frame 0.
  - Volume `clamp(0.25 + 0.55 * strength, 0.3, 1)` × distance falloff, rate 0.94–1.06.
  - Skip off-camera points, and play at most 2 in any 0.5 s.
- **Footsteps:** on beach sand, use `sfx_sand_step` instead of `sfx_step_snow`. Use `sfx_sand_step_wet` in the wet band at the waterline. Call volume is about 0.32, the same walk-cycle frames as now.
- **Splashes:**
  - `sfx_splash_beach` on the beachfolk `splash_play` impact frame.
  - `sfx_splash_2` by key when a swimmer enters the water.
  - `sfx_splash_3` by key for a cannonball or the banana boat tipping.
  - `sfx_pool_splash` for hotel-pool dives.
- **Children:** play one `sfx_beach_kids` at a time near families, at random every 6–15 s, volume 0.4–0.9 by distance, rate 0.95–1.08. Add audio4's `sfx_seagull` now and then.
- **Whistle:** throttle to once per 8 s.
- **Ice-cream cart:** ring when customers arrive, or every 20–40 s while open.
- **Beach ball:** play `sfx_beachball_bounce` when the ball lands. For a catch, use volume 0.6, rate 1.15.
- **Hotel bell:** play at check-in (`resort_hotel`, `pension`).

**QA** (from `docs/previews/audio5_report.txt` and the extra tests)
- **Levels:**
  - Every file has a sample peak ≤ -1.0 dBFS and a true peak ≤ -1.0 dBTP (ffmpeg ebur128, 4× oversampled; the highest is -1.0, `sfx_beach_kids_1.ogg`).
  - DC offset is under 0.0003.
  - The in-game level hits its target exactly for every .ogg, and within 0.5 dB for every .mp3.
  - bgm_beach plays at -26.5 LUFS effective, like bgm_village. The beds play at -33.5, like amb_sea and amb_harbor. Steps play at -19.5, like the snow steps.
- **Phone speakers** (loss through a 600 Hz 4th-order high-pass): beach ball 0.6 dB (was 10.5); every other key 0–2.8 dB (limit 4).
- **Pitch:**

  | sound | note | error |
  |---|---|---|
  | hotel bell | C7 | -0.0 cents |
  | ice-cream chime, last bell | F6 | +0.1 cents |
  | beach ball | F5 | -1.6 cents |
  | lifeguard whistle (centroid of the trilled tone) | F7 | -6.9 cents |

- **Cues:** onset detection finds the crash impacts at 0.20 / 0.54 s, the ball bounces at 0 / 0.30 / 0.48 s and the pool slap at 0 s, exactly where the manifest says.
- **Footsteps:** dry steps have 0.9–1.8 % of their energy after 120 ms (step 3 was 24.7 %), so running steps 0.225 s apart never overlap.
- **Swell sync:**

  | | `amb_sea_waves` | `amb_beach` |
  |---|---|---|
  | loop length | 41.9991 s = 6.9998 periods | 24.0007 s = 4.0001 periods |
  | designed breaks vs the best-fit 6 s grid, over 4 loop passes | mean 0.09 s, max 0.21 s | mean 0.06 s, max 0.12 s |
  | the same, v7.0 | mean 1.18 s, max 2.62 s | mean 1.31 s, max 2.60 s |
  | loudest surge in each swell period vs its waterline cue | mean 0.27 s | mean 0.21 s (in the 2.5–8 kHz foam band) |

- **Loop seams:**

  | loop | .ogg hf / d2 | .mp3 hf / d2 |
  |---|---|---|
  | bgm_beach | 0.02 / 0.04 | 0.15 / 0.44 |
  | amb_sea_waves | 0.09 / 0.09 | 0.09 / 0.08 |
  | amb_beach | 0.19 / 0.06 | 0.18 / 0.11 |

  - The fail threshold is 1 for both ratios.
  - .ogg end padding is 0 for all three loops.
- **Chromium 141 decode:** `decodeAudioData` returns exactly `loopSamples` frames (2,116,416 / 1,852,160 / 1,058,432) for the .ogg and the .mp3 of every loop.
- **Phaser 3.90 load test** (headless Chromium, `this.load.audio` for every key, once with [ogg, mp3] and once with mp3 only):
  - All 28 keys load and decode. All 18 group members exist and play.
  - Loop buffers have exactly `loopSamples` frames.
  - A looping `amb_beach` started with `play({ seek: 5.02 })` reads `seek` 6.02 one second later.
- **Sea and bed repetition** (16-band spectral envelope, strongest circular self-similarity at lags of 3 s to the loop length minus 3 s; "de-periodised" means with the 6 s swell profile removed, because a beat on the swell is intended):

  | | length | raw | de-periodised | v7.0 de-periodised |
  |---|---|---|---|---|
  | `amb_sea_waves` | 42 s | 0.37 at 36.1 s | 0.14 | 0.09 |
  | `amb_beach` | 24 s | 0.19 | 0.10 | 0.15 |
  | v1 `amb_sea` | 24 s | 0.63 | 0.21 | |

  - No noise buffer is reused (sample-level |ncc| ≤ 0.28).
  - The check fails at 0.6.
  - The sea's 7 breakers come 4.9–6.7 s apart (mean 5.9) and vary by 5.7 dB in loudness. The old sea's breakers vary by 1.9 dB.
- **Music:**
  - `music5.check_consonance()` passes; the notes are unchanged.
  - Section loudness A1 / B / A2 is -18.3 / -18.2 / -17.6 LUFS.
  - In B, the 700–1600 Hz band (the pan's register) went from -9.6 dB to -3.2 dB of the total, which confirms that the steel pan now carries the melody.
- **Rebuild:** a second full rebuild produced byte-identical files (SHA-1 of all 57 asset files, the 4 previews and the render cache).
- **Preview page:** `audio5_preview.html` loads in headless Chromium with no console errors. All five scene buttons and the 34 cards play, and the beach scene's crest beats land on the bed's waterline cues. The layout fits a 390 px phone width with no horizontal scroll.

**Files**
- Scripts in `tools/audio/`: `sfx5.py`, `music5.py`, `build_audio5.py`, `check_audio5.py`.
  - They import `synth`, `instruments`, `sfx`, `sfx2` (voice), `sfx3` (babble), `sfx4` (gull calls, hand bell, loop helpers), `music` / `music2`, `build_audio` (the fixed `fit_loop`, `volume_for`, `encode_all`), `check_audio.loop_metrics` and `check_audio2.chromium_decode`.
  - No existing script or asset was edited.
- Rebuild: `python3 tools/audio/build_audio5.py` (about 5 min with 3 workers on busy cores; `--only key,…`, `--skip-render`, `--no-check`).
- Cache: `tools/audio/_cache/audio5/` (git-ignored).
- Previews in `docs/previews/`:
  - `audio5_waveforms.png`: every key's waveform, loop spectrograms, one-shot spectrograms.
  - `audio5_demo.mp3` (64 s). The washes and rock crashes are placed on the beds' crest cues, the way the game should do it:
    - village coast in winter: sea, crashes on the rocks, snow steps, ship horn
    - Sunny Beach day: dry and wet sand steps, washes on every crest, hand splashes, kids, ball, whistle, ice-cream cart
    - hotel: desk bell, pool dives
    - sunset
  - `audio5_report.txt`: the QA table.
  - `audio5_preview.html`: scenes Village sea / Beach day / Hotel pool / Sunset / Old vs new sea, with a "swell beat" indicator. Open it through the game server.

**Known issues**
- Everything was designed and checked by measurement only. The sea's realism, the steel-pan tone, the ukulele and the calypso feel need a human listen.
- **Shore-wave period:** the water team's `fx_shore_wave_x/_y` note says "2.7 s cycle", but the Water.js shader swell is 6.0 s. The audio follows Water.js (6.0 s). If the sprites keep a 2.7 s cycle, play washes on the shader crests, not on the sprite frames. The water team should settle on one period.
- **Small swell drift:** the beds' swell period is 5.99987 / 6.00018 s, a 1 ms shift per pass (about 0.1 s after 10 minutes). Re-seek when a bed restarts.
- **Measured surge vs cue:** the loudest moment of each near wave is the break or the rush, so it lies 0.2–0.5 s around its `waterline` cue. That spread is part of the sound, not drift.
- **Mono beds:** the beds are mono, like every ambience loop, to save phone memory. The width comes from three distances of waves.
- **Short music loop:** `bgm_beach` stays 48 s. The 3.5 MB cap is in the job, not in CONTRACT_V7 §Z, and 13.8 kB of headroom is left; a 32-bar version would add about 470 kB.
- **High-frequency roll-off and short tails:** they were needed to fit the cap. They are inaudible on phones and under the beds in the game, but a headphone listener in a quiet room may notice slightly shorter bell ring-outs.
- **One-shot .ogg length in Chromium:** Chromium ignores the Vorbis end-trim, so one-shot .ogg files decode up to 23 ms longer than `duration`. That extra is the already-faded silent tail. Loops are block-fitted, so they are exact.
- **Variant 1 by key:** because the group `sfx_wave_wash` shares the contract key's name, `Audio.play('sfx_wave_wash')` always plays a random wash. Use `_2` / `_3` by key if one specific wash is needed; variant 1 alone cannot be requested through `Audio.play`.
- **Reused generators:** the children use the town-chatter voice generator (`sfx2` / `sfx3`), and the two far gulls in `amb_beach` use the `sfx4` gull generator.
- **Machine-dependent loop lengths:** exact .ogg loop lengths and file sizes depend on the libvorbis build. Rebuild and re-run the check on another machine.
- **Process-scoped rebinding:** `build_audio5` re-points `build_audio`'s tables at the audio5 set, and `check_audio5` points `check_audio2.CACHE` at the audio5 cache, both only inside their own process.

**Critic review → outcome**

| issue (severity) | outcome |
|---|---|
| Waves not timed to the Water.js 6 s swell (high) | Fixed. One near wave per crest, loops of 7 × 6 s and 4 × 6 s, beach near layer about 8 dB lower, swell fields and cues in the manifest, seek recipe in the notes. Grid error is now 0.09 / 0.06 s mean (was 1.18 / 1.31 s). |
| Mixed groups: cannonball in hand splashes, damp step in dry steps (medium) | Fixed. Hand-splash-only group (1, 1b, 1c), new dry and wet step groups with a second damp step, step 3's scuff ends by 110 ms. |
| Beach ball loses about 10 dB on phones (medium) | Fixed. F5 boing with a vinyl pock; phone loss 0.6 dB. |
| One wash only (medium) | Fixed. 3 washes in group `sfx_wave_wash`, each with its own cues. |
| amb_beach has recognisable calls and gulls in a 28 s loop (medium) | Fixed. Calls moved to `sfx_beach_kids_1..4`; the 24 s bed keeps only a far babble, far gulls (required by the contract) and far splashes. |
| Crash notes contradict Water.js crash events and the fx frames (medium) | Fixed. Notes now drive crashes from `crashEvents`, looking ahead by `cues.impact`, with volume from `strength`. |
| Loading and memory once audio5 is added (medium) | Fixed in the notes and this report: lazy rule for bgm_beach and amb_beach, `amb_sea` marked unused. The `src` change belongs to the code agent. |
| Three files above -1 dBTP (low) | Fixed. The encoder loop now enforces a -1 dBTP ceiling; highest is -1.0. |
| Shallow whistle trill (low) | Fixed. Deeper pea gate, ±0.42 st wobble plus a dip on each block, 2nd harmonic about 0.2; AM index 0.36 (was 0.15). |
| bgm_beach: short length, ocarina lead in B (low) | Lead fixed: the steel pan leads B, with the ocarina doubling softly. Length won't fix: the 3.5 MB cap in the job leaves 13.8 kB. |
| Report and notes accuracy (low) | Fixed. Correct breaker spacing, and the ice knocks are kept off the sand: crossfade amb_beach against amb_harbor. |
