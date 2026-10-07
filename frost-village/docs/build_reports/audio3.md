# audio3 build report

AUDIO3 (CONTRACT_V5 §R) is done. `check_audio3` passes with `RESULT: OK`, and a second full rebuild from scratch produced byte-identical files. I can't listen to audio, so I judged everything from measurements, spectrograms and headless-Chromium decode tests. The designer still needs to listen, especially to `sfx_baby_giggle`, the owl in `amb_night`, and the bridal-chorus nod in `bgm_wedding`.

**Fragment:** `frost-village/assets/audio3/manifest.json`. Every entry lists `files: ["audio3/<key>.ogg", "audio3/<key>.mp3"]`. There are 18 keys (36 files) and one group, `sfx_car_honk: [sfx_car_honk_1, sfx_car_honk_2]`. No key or group name collides with `audio` or `audio2` (or `audio4`, if it appears). Payload is **2,943,073 bytes including the manifest** (2.94 MB, 2.81 MiB). That is under 3 MB whether MB means 1,000,000 or 1,048,576 bytes.

**Fields:** each entry has `volume`, `loop`, `kind`, `duration`. Loops also have `loopSamples` and `mp3StartPad: 1105`. Extra fields the game can ignore: `cues` (seconds from file start), `notes`, `bpm`, `bars`, `meter`, `tonality`, `voice`, `firingHz`, `rotation`.

**Loudness:** I used the same targets and the same −2 dB headroom as `audio` and `audio2`. Every key's level after `volume` lands exactly on its target. Sound effects come out between −16.5 and −20.5 LUFS (max momentary), and both music loops sit at the `bgm_village` level (−26.5 / −27.0 LUFS). Every file's sample peak is −0.7 dBFS or lower (most −1.2 or lower); DC offset is under 0.0001. Music is stereo; everything else is mono.

### Music loops (stereo, F major, `kind: "music"`)
| key | vol | length | what it is |
|---|---|---|---|
| `bgm_wedding` | 0.376 | 30.97 s, 124 bpm, 16 bars | Section A plays the `bgm_village` hook "A4 C5 D5 - C5 A4 C5 -" note for note as a march: marimba lead, oom-pah accompaniment, march snare, sleigh bells. Section B plays the first two bars of Wagner's Bridal Chorus (1850, public domain), moved into F, on glockenspiel, tubular bell and flute. Organ-like pad, guests clapping, a big F bell. |
| `bgm_farewell` | 0.355 | 30.98 s, 93 bpm, 3/4, 16 bars | The village hook slowed into a lullaby: music box with harp, then a warm flute rising to A5 for a hopeful lift. Rolling harp, string pad, soft bass, a few chimes. No drums, never dark. |

### Ambience and vehicle loops (mono, `kind: "ambience"`, all `loop: true`)
| key | vol | length | notes |
|---|---|---|---|
| `amb_night` | 0.180 | 17.01 s | Soft dark wind, a distant owl call answered by a second owl, faint wind chime, snow sliding off a branch. |
| `amb_town` | 0.216 | 14.00 s | Crowd murmur, passers-by chatting in the existing cute babble voices, two far laughs, footsteps in snow, two gentle distant car pass-bys, a shop-door bell. |
| `sfx_truck_engine` | 0.385 | 1.60 s | Toy "putt-putt" engine at 12.5 firings per second. Use sound `rate` 0.85 for idle, 1.0 cruise, 1.3 fast. |
| `sfx_sleigh_bells` | 0.376 | 2.40 s | Harness bells, 8 jingles per loop plus a soft shimmer. |
| `sfx_horse_trot` | 0.422 | 2.42 s | Two horses "clippety-clop" on snowy cobbles. |

### One-shot sound effects (mono, `kind: "sfx"`)
| key | vol | length | cues (s) |
|---|---|---|---|
| `sfx_bus_horn` | 0.376 | 1.02 s | toot1 0, toot2 0.21 (retro two-tone F4/A4) |
| `sfx_car_honk_1` | 0.442 | 0.48 s | pip1 0, pip2 0.15 ("meep-meep") |
| `sfx_car_honk_2` | 0.309 | 0.63 s | — (squeeze-bulb "hoonk") |
| `sfx_steam_whistle` | 0.248 | 1.70 s | toot1 0.05, toot2 0.34 (three-pipe F5/A5/C6 chord) |
| `sfx_brakes` | 0.295 | 1.16 s | squeal 0.12, stop 0.47, air 0.60 |
| `sfx_door` | 0.708 | 0.39 s | click 0, thunk 0.21 |
| `sfx_bell_hall` | 0.295 | 3.88 s | ding1 0, dong1 0.6, ding2 1.2, dong2 1.8 (C5 / F4 tower bells) |
| `sfx_school_bell` | 0.188 | 2.57 s | — (brass hand bell, rings out) |
| `sfx_baby_giggle` | 0.327 | 0.86 s | giggle 0.22 (rattle, short high giggle, coo) |
| `sfx_mission_done` | 0.412 | 1.73 s | stamp 0, jingle 0.13, land 0.37 (hook "A C D" then F) |
| `sfx_fame_up` | 0.473 | 2.39 s | fanfare 0.345, star 0.725 |

### How the game should use them (the `src` change is for the code agents)
- **Register the fragment:** add `'audio3'` to `FRAGMENTS` in `src/core/Assets.js`.
- **Delay loading the music:** treat `bgm_wedding` and `bgm_farewell` like `bgm_spring` and load them only when the event starts. Each is about 11 MB once decoded to raw audio in memory.
- **Delay loading the ambience:** `amb_night` and `amb_town` already match the deferred-audio pattern `^amb_`. Add the three vehicle loops to `isDeferredAudio`.
- **Music:** `Audio.playMusic('bgm_wedding')` when the ceremony starts. Fire `Audio.play('sfx_bell_hall')` first and start the march around the `dong2` cue (1.8 s). Use `Audio.playMusic('bgm_farewell')` for the memorial-garden flower farewell, then return to `bgm_village`.
- **Night and town beds:** crossfade `setAmbience('amb_night', night)` against `setAmbience('amb_wind', 1 - night)`. Scale `setAmbience('amb_town', crowd)` by how many townsfolk are on screen.
- **Vehicle loops:** use `setAmbience(key, 0..1)` by distance to the nearest vehicle, or `sm.add(key, {loop: true})` per vehicle with a `rate` (engine 0.85–1.3, horse about 0.8–1.2). Play the sleigh bells with the horse trot for the horse sleigh bus.
- **One-shots:**
  - Bus arrives: `sfx_bus_horn`, then `sfx_brakes` when it stops, then `sfx_door` about 0.5 s later.
  - `sfx_car_honk` (the group) with a throttle; `sfx_steam_whistle` for the steam wagon.
  - `sfx_school_bell` when school starts and ends; `sfx_bell_hall` hourly, at weddings and festivals.
  - `sfx_baby_giggle` for births and stroller interactions.
  - `sfx_mission_done` when a mission completes: sync the stamp animation to cue 0.
  - `sfx_fame_up` when fame points arrive or the rank rises: sync the star to cue 0.725.

### QA results
- **Loops:** every `.ogg` has zero end padding. Headless Chromium 141 decodes every loop, in both `.ogg` and `.mp3`, to exactly `loopSamples` frames.
- **Loop seams:** the click score at the wrap is 0.00–0.51 for `.ogg` and 0.00–0.97 for `.mp3`; the pass threshold is under 1. The highest is the `bgm_farewell` `.mp3` at 0.97, which passes but with little margin; it is reported, not gated.
- **Engine loop fix:** the engine's loop point clicked at first. Each mono loop now starts at its quietest zero crossing, and `build_audio3` tries render variants until both formats are smooth. That made the `.mp3` seams clean too, which matters on iPhone if Safari falls back to MP3.
- **Cues:** onset detection puts every cue within about 6 ms of its manifest time, except `land` (detected at 0.335 s against 0.37) and `star` (0.686 s against 0.725), where neighbouring glock notes mask the onset; the cues themselves are the times written in the code.
- **Untouched files:** all 161 existing files in `assets/audio`, `assets/audio2`, the existing audio scripts, the earlier previews and the v1/v2 caches have the same checksums as before.

### Files
- **Scripts (new):** `tools/audio/sfx3.py`, `tools/audio/music3.py`, `tools/audio/build_audio3.py`, `tools/audio/check_audio3.py`. They import `synth`, `instruments`, `sfx`, `sfx2`, `music`, `music2`, `build_audio` (including the fixed `fit_loop`), `check_audio` and `check_audio2`; none of those were edited.
- **Rebuild:** `python3 tools/audio/build_audio3.py` takes about 2.5 min.
- **Cache:** `tools/audio/_cache/audio3/`.
- **Previews in `frost-village/docs/previews/`:**
  - `audio3_waveforms.png`
  - `audio3_demo.mp3` — 46 s: town day, bus arrives, honks, mission and fame, horse sleigh, steam whistle, school bell, then town-hall bells, cheering and the wedding, a baby giggle, then night and the farewell theme.
  - `audio3_report.txt` — the duration, peak, LUFS and seam table.
  - `audio3_preview.html` — listening page with scenario buttons; open it through the game's local web server.

### Known issues
- The three vehicle loops use `kind: "ambience"` (positional mono loops), following `audio2`'s `sfx_lute`. The contract named them `sfx_*` without saying which kind.
- Both music loops are about 31 s (the contract allows 30–45). I chose that length so the folder would fit under 3 MB; tempos are 124 and 93 bpm.
- Fitting the loop lengths to the Ogg encoder's block boundaries left the horse trot at 2.42 s and the bells at 2.40 s. They share a tempo but are not locked to each other.
- Exact loop lengths depend on the `libvorbis` build. On another machine, rebuild and run the check.
- `build_audio3` points `build_audio`'s tables at the audio3 files, and `check_audio3` points `check_audio2.CACHE` at the audio3 cache, both only inside their own process. Don't run `build_audio.main` in that same process.
