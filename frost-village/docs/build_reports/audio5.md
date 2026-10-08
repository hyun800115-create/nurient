# audio5 build report

AUDIO5 (CONTRACT_V7 §Z) is done: all 19 sounds for the living sea and the Sunny Beach are in `assets/audio5`, and `check_audio5.py` reports `RESULT: OK`. A second full rebuild gave byte-identical files. I can't listen to audio, so I judged everything by measurements, spectrograms, a check that the melody fits the chords, and decoding in headless Chromium. The designer should listen before release, especially to the new sea (`amb_sea_waves`), the steel pan and ukulele in `bgm_beach`, and the children in `amb_beach`.

**Fragment and keys**
- Manifest: `assets/audio5/manifest.json`, version 1. Every key lists `files: ["audio5/<key>.ogg", "audio5/<key>.mp3"]`, plus `volume`, `loop`, `kind` and `duration`. Loops also have `loopSamples`, `mp3StartPad: 1105`, `rotation` (and `bpm` for the music).
- 19 keys, 38 files. Payload is 3,443,231 bytes including the manifest (3.44 MB, limit 3.5 MB).
- Three groups:
  - `sfx_wave_crash` = `sfx_wave_crash_1`, `_2`, `_3`
  - `sfx_splash_beach` = `sfx_splash_1`, `_2`, `_3`
  - `sfx_sand_step` = `sfx_sand_step_1` … `_4`
- The splash group is deliberately not called `sfx_splash`. That is the v1 fish-splash key, and a group with the same name would take over every `Audio.play('sfx_splash')` call.
- No key or group name clashes with `audio` … `audio4`. The check also catches a group name that equals another fragment's key, and it scans any later `assets/audio*` folder automatically.

| key | kind / loop | volume | length | what it is |
|---|---|---|---|---|
| `bgm_beach` | music, loop, stereo | 0.376 | 47.99 s | Sunny island / calypso theme. F major, 120 bpm with swung eighths, 24 bars, form A1 B A2. The steel pan plays the bgm_village hook "A C D – C A C" (same notes) in a syncopated island rhythm. B is the village's own B melody on the village ocarina. A2 adds the marimba an octave below and the village glock counter-line. Ukulele strummed "down, down-up, up-down-up" with real uke chord shapes, calypso bass, congas, claves, shaker, soft kick, rim / claps, three water "bloops" and a slide whistle into the last A. Plays at -26.5 LUFS after volume, the same as bgm_village. |
| `amb_sea_waves` | ambience, loop, mono | 0.216 | 46.00 s | Real rolling sea for the village coast. Eight near breakers at uneven gaps (4.6–9.8 s) and sizes, each with its own approach, break type (a plunging "whump" or a spilling roll), churning white water, a rush up the shore, and a hissing, fizzing backwash with a little shingle rattle. Under them: a second line of waves further along the coast, far surf that swells with distant sets, a deep sea rumble, thin cold air and a few ice floes knocking. |
| `amb_beach` | ambience, loop, mono | 0.219 | 28.00 s | Gentle spilling surf on sand (long foam fizz, no shingle), distant children playing (chatter, "hi-hi-hi" laughs, squeals, "o-maa~" calls, "wheee"), gulls overhead and far away, far splashes, a warm breeze through palms, a faint holiday crowd. |
| `sfx_wave_crash_1` / `_2` / `_3` | sfx | 0.407 / 0.385 / 0.359 | 2.96 / 3.68 / 3.14 s | Water hitting rocks or the breakwater ("철썩!"). A 0.2 s surge, then the slap (cue `impact` 0.20 s): bright crack, low boom, spray burst, droplets raining back, water pouring off the stones, trickles. 1 = medium slap. 2 = big boom. 3 = double slap (`impact2` 0.54 s). |
| `sfx_wave_wash` | sfx | 0.302 | 3.87 s | One swash up a sand beach. Cues: `rush` 0, white-water `crest` 0.58, `upmost` 1.1, backwash `retreat` 1.9 s (long fizzing hiss, sucking gurgles). |
| `sfx_splash_1` / `_2` / `_3` | sfx | 0.447 / 0.335 / 0.343 | 0.88 / 1.29 / 1.85 s | 1 = hand splash "splish-splish" (`slap2` 0.13). 2 = jumping in feet-first "sploosh". 3 = cannonball "ka-bloomp" with a big spray falling back. |
| `sfx_pool_splash` | sfx | 0.347 | 1.93 s | Hotel pool dive: crisp slap and plunge, a slap-back off the hotel wall and tiled deck, then laps into the overflow gutter (`laps` 0.62). |
| `sfx_lifeguard_whistle` | sfx | 0.112 | 1.34 s | Pea whistle "tweet – tweeeet" on F7, with the pea's fast trill. Cues `tweet` 0, `tweeet` 0.27. |
| `sfx_icecream_bell` | sfx | 0.245 | 2.18 s | Ice-cream cart chime: bright bells play the village hook A5 C6 D6 and land on F6 (`last` 0.62), then a jingle shake (`jingle` 0.95). |
| `sfx_beachball_bounce` | sfx | 0.501 | 0.86 s | Vinyl beach ball "boing" (F4, springy pitch drop, skin slap, sand thud and grains) plus two little re-bounces (`bounce2` 0.30, `bounce3` 0.48). |
| `sfx_hotel_bell` | sfx | 0.211 | 1.97 s | Reception desk service bell: plunger tick and a bright dome-bell "DING" on C7 with a slow shimmer, in a lobby. |
| `sfx_sand_step_1` … `_4` | sfx | 0.676 / 0.741 / 0.550 / 0.841 | 0.25–0.32 s | Footsteps on sand: a soft heel thud and a short slide of grains, darker and softer than the snow crunch. 3 adds a toe scuff. 4 is damp, firm sand by the water ("thup"). |

**Extra manifest fields** (the game ignores them): `cues` (seconds from the file start), `notes` (usage text for each key), `bars`, `meter`, `tonality`, `rotation`.

**How the game should use them**
- **Loading:** add `'audio5'` to `FRAGMENTS` in `src/core/Assets.js`.
- **Deferred loading:** both `amb_` loops already match the deferred `^amb_` pattern. bgm_beach is about 17 MB once decoded, so add it to the deferred / lazy audio pattern like bgm_harbor and load it when the player first reaches the beach.
- **Village sea:** in `Game.js`, where it calls `Audio.setAmbience('amb_sea', 0.15 + sea * 0.6)`, drive `amb_sea_waves` with the same formula instead and set `amb_sea` to 0. Both have the same target loudness, so the mix balance stays the same. It suits the harbour's open coast too, under `amb_harbor`.
- **Beach:** `Audio.setAmbience('amb_beach', near)` by distance to the sand, crossfaded against `amb_sea_waves` / `amb_harbor`. Then `Audio.playMusic('bgm_beach')` (crossfades from the village or harbour theme).
- **Wave crashes:** play the `sfx_wave_crash` group with water/`fx_wave_crash` on rocky shores, breakwaters and quays. Either start the sound `cues.impact` (0.2 s) before the spray frame or simply on frame 0. Use one every 5–14 s per rocky segment in view, volume 0.35–1 by distance, rate 0.9–1.08, at most two at once.
- **Shore washes:** play `sfx_wave_wash` with `fx_shore_wave` when a crest reaches the sand near the camera (every 4–9 s, volume 0.3–0.8, rate 0.92–1.08).
- **Splashes:** play the `sfx_splash_beach` group on the beachfolk `splash_play` impact frame and for kids in the shallows. Use 2 when a swimmer enters the water and 3 for a cannonball or the banana boat tipping. Play `sfx_pool_splash` for guests diving into the `hotel_pool`.
- **Footsteps:** on beach ground, use the `sfx_sand_step` group instead of `sfx_step_snow`, with the same call volume (~0.32) and walk-cycle frames.
- **Whistle:** play `sfx_lifeguard_whistle` when the lifeguard calls a swimmer back or starts a rescue. Throttle it to once per 8 s.
- **Ice-cream cart:** the vendor rings `sfx_icecream_bell` when customers arrive, or every 20–40 s while open, with volume by distance.
- **Beach ball:** play `sfx_beachball_bounce` when the ball lands after `ball_throw`. For `ball_catch`, use volume 0.6 and rate 1.15.
- **Hotel:** play `sfx_hotel_bell` at check-in (`resort_hotel`, `pension`). Optionally play `audio3/sfx_door` first.

**QA** (from `docs/previews/audio5_report.txt`)
- **Levels:** every file peaks at -1.0 dBFS or lower. DC offset is under 0.0001. Every key's in-game level lands exactly on its target for the OGG, and within 0.5 dB for the MP3. Targets are music -24.5, ambience -31.5, crashes -16.5, splashes -17.5 / -17 / -16.5, pool -17, whistle -18, bells / ball / steps -17.5, wash -19 (LUFS, before the -2 dB headroom).
- **Pitch:**

  | sound | measured note | error |
  |---|---|---|
  | hotel bell | C7 | -0.0 cents |
  | lifeguard whistle (centre) | F7 | +0.1 cents |
  | ice-cream chime, last bell | F6 | +0.1 cents |
  | beach ball | F4 | -2.7 cents |

- **Cue timing:** onset detection finds every listed cue exactly where the manifest says: wave-crash impacts 0.20 / 0.54 s, ball bounces 0 / 0.30 / 0.48 s, pool slap 0 s.
- **Loop seams:** no click at the wrap for any loop. Seam ratios (fail threshold 1, OGG and MP3):

  | loop | hf | d2 |
  |---|---|---|
  | bgm_beach | 0.02–0.04 | 0.07–0.17 |
  | amb_sea_waves | 0.08 | 0.11 |
  | amb_beach | 0.16–0.17 | 0.09–0.10 |

- **OGG padding:** OGG end padding is 0 for all three loops.
- **Chromium (141) decode:** the OGG and the MP3 of every loop decode to exactly `loopSamples` frames (2,116,544 / 2,028,544 / 1,234,816), with seam ratios 0.07–0.17.
- **Sea realism:** measured on the momentary-loudness curve, the new sea is far less repetitive than the old one.

  | | `amb_sea_waves` (new) | v1 `amb_sea` (old) |
  |---|---|---|
  | length | 46 s | 24 s |
  | breakers detected | 7 | 4 |
  | gaps between breakers | 4.6–9.8 s | 5.6–6.2 s |
  | spread in breaker loudness | 5.8 dB | 1.9 dB |
  | dynamic range | 11.6 dB | 13.6 dB |
  | strongest self-repeat inside the loop (check fails at 0.6) | 0.27 | 0.93 at 11.8 s (the same pattern twice) |

- **Melody check:** `music5.check_consonance()` passes. Every melody note on a strong or pushed beat is a chord tone or a gentle colour tone; the one 13th, A over C7, is in the original bgm_village B melody.
- **Rebuild:** a second full rebuild produced byte-identical files (SHA-1 of all 39 files).
- **Preview page:** `audio5_preview.html` loads in headless Chromium with no console errors. All five scene buttons and the 25 key cards play, and the layout fits a 390 px phone width.

**Files**
- Scripts in `tools/audio/`: `sfx5.py`, `music5.py`, `build_audio5.py`, `check_audio5.py`. They import `synth`, `instruments`, `sfx`, `sfx2` (voice), `sfx3` (babble), `sfx4` (gull calls, hand bell, loop helpers), `music` / `music2`, `build_audio` (the fixed `fit_loop`, `_encode_one`, `volume_for`, `encode_all`), `check_audio.loop_metrics` and `check_audio2.chromium_decode`. No existing script or asset was edited.
- Rebuild: `python3 tools/audio/build_audio5.py` (about 3 min; `--only key,…`, `--skip-render`, `--no-check`).
- Cache: `tools/audio/_cache/audio5/` (git-ignored).
- Previews in `docs/previews/`:
  - `audio5_waveforms.png`
  - `audio5_demo.mp3` — 64 s:
    - village coast in winter: new sea, waves on the rocks, snow steps, ship horn
    - Sunny Beach day: sand steps, wash, kids splashing, beach ball, whistle, ice-cream cart, far breakwater crash, gulls
    - hotel: door, desk bell, pool dives, cheer
    - sunset: the music fades and the sea returns
  - `audio5_report.txt`: the QA table.
  - `audio5_preview.html`: a listening page with scenes Village sea / Beach day / Hotel pool / Sunset / Old vs new sea. Open it through the game server.

**Known issues**
- Everything was designed and checked by measurement only. The realism of the sea, the steel-pan tone, the ukulele strum and the calypso feel need a human listen.
- **Mono sea:** `amb_sea_waves` is mono, like every ambience bed (decoded loops cost phone memory: 8 MB mono vs 16 MB stereo). The "wide" feeling comes from three distances of waves, not from stereo.
- **Short music loop:** `bgm_beach` is 48 s (the contract allows 45–90 s). A 32-bar / 64 s version would push the folder over 3.5 MB. The payload has only about 57 kB of headroom, so nothing can get longer without dropping something else.
- **Reused voice and gull generators:** the children use the same cute formant voices as the town chatter (`sfx2` / `sfx3`). The beach gulls use the `sfx4` gull generator at shifted pitches, so they can resemble `audio4`'s `sfx_seagull` when both play.
- **Whistle level:** a pure F7 tone sounds bright. Its base volume is low (0.112), so keep call volumes ≤ 1 and throttle it.
- **Machine-dependent loop lengths:** exact OGG loop lengths depend on the libvorbis build. Rebuild and re-run the check on another machine.
- **Process-scoped rebinding:** `build_audio5` re-points `build_audio`'s tables at the audio5 set, and `check_audio5` points `check_audio2.CACHE` at the audio5 cache, both only inside their own process. Don't call `build_audio.main` in that same process.
