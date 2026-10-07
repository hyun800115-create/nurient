AUDIO2 (CONTRACT_V3 §G): DONE. check_audio2 passes (`RESULT: OK`) and a second full rebuild came out byte-identical. I can't listen to audio, so I checked everything by measurement, spectrograms and decoding in headless Chromium. The designer still needs to listen, especially to the babble voices.

FRAGMENT: `assets/audio2/manifest.json`. Every file path is relative to `assets/` and listed as `["audio2/<key>.ogg", "audio2/<key>.mp3"]`. 26 keys, 52 files, payload 2.51 MiB (limit 3 MB). No key or group name collides with `assets/audio`.

LOOPS
- **bgm_spring**
  - Fields: kind music, loop, stereo, vol 0.376, duration 62.617 s, loopSamples 2761408, bpm 92, bars 24, F major, mp3StartPad 1105.
  - Same key as bgm_village. Its hook "A4 C5 D5 - C5 A4 C5 -" is quoted note for note at the start of both A sections (confirmed by pitch tracking). The end of the B section quotes bgm_village's B cadence.
  - Form is A1 B A2. A1: flute an octave up with grace-note flicks, harp arpeggios, pizzicato bass. B: ocarina, off-beat nylon guitar, woodblock. A2: warm flute, music-box octave, glockenspiel counter-melody. Throughout: shaker, soft kick, finger snaps, triangle, birdsong chirps tuned to the scale. No sleigh bells.
  - Plays at -26.5 LUFS after its volume, the same as bgm_village.
- **sfx_lute**
  - Fields: kind ambience, loop, mono, vol 0.452, duration 9.600 s, loopSamples 423360, bpm 100, bars 4, F major.
  - Bard jig over F | Dm | Bb | C. Play it with `Audio.setAmbience('sfx_lute', 0..1)` scaled by distance to the bard.
- **Seam checks, both loops:** OGG end padding 0. Headless Chromium 141 `decodeAudioData` returns exactly loopSamples for both the OGG and MP3. Seam ratios are 0.036 (spring) and 0.006 (lute), against a fail threshold of 1.

SFX (all mono). Format is key: volume, length. Cues are seconds from the start of the file.
- sfx_hammer_1 / _2 / _3: 0.668 / 0.881 / 0.759, about 0.21 s each. Group `sfx_hammer`.
- sfx_build_done: 0.432, 2.37 s. Cues: thunk 0.26, fanfare 0.58.
- sfx_saw_short: 0.355, 0.56 s.
- sfx_boat_horn: 0.432, 2.03 s. Cues: toot1 0, toot2 0.34.
- sfx_row: 0.335, 0.99 s. Cue: catch 0.1. Play once per row cycle.
- sfx_register: 0.327, 1.10 s. Cue: bell 0.29.
- sfx_tower_fire: 0.422, 1.96 s. Cue: ignite 0.07. One-shot only; use `audio/amb_fire` for the burning loop.
- sfx_fog_clear: 0.363, 3.26 s. Cues: whooshPeak 0.9, reveal 0.95.
- sfx_chatter_1..6: 0.22–0.33, 0.50–0.57 s each. Field `voice`: 1–3 are "high" (kid), 4–6 are "low" (adult). Groups: `sfx_chatter` (all six) plus optional `sfx_chatter_hi` and `sfx_chatter_lo`.
- sfx_laugh_1: 0.214, 0.70 s (high). sfx_laugh_2: 0.295, 0.80 s (low). Group `sfx_laugh`.
- sfx_snowball_throw: 0.457, 0.31 s. Cue: swish 0.12.
- sfx_snowball_hit: 0.741, 0.29 s.
- sfx_dog_bark: 0.432, 0.46 s.
- sfx_cat_meow: 0.207, 0.73 s.
- sfx_penguin: 0.257, 0.64 s.
- sfx_cheer: 0.412, 2.01 s.

Loudness uses the same targets and the same -2 dB headroom as `assets/audio`. After volume, sound effects land between -17 and -22 LUFS; for comparison, v1 chop is -18 and customer_happy is -19. Files peak at -1.1 dBFS or lower. Musical sounds are in F major.

FILES
- `tools/audio/sfx2.py`: all one-shots, plus the syllable sequencer for the babble voices.
- `tools/audio/music2.py`: bgm_spring and sfx_lute.
- `tools/audio/build_audio2.py`: build pipeline. It imports `fit_loop`, `_encode_one`, `volume_for` and the loudness tables from build_audio and points them at audio2 inside its own process. Run `python3 tools/audio/build_audio2.py`; it takes about 1.5 min on 2 cores.
- `tools/audio/check_audio2.py`: QA, including the Chromium decode test and the demo mix.
- Previews in `docs/previews/`: `audio2_waveforms.png`, `audio2_demo.mp3` (46 s: village sounds, then tower → fog clears → crossfade to spring), `audio2_report.txt` (table of length, peak, LUFS, volume and effective level), and `audio2_preview.html` (listening page; open it through the game server).
- Cache: `tools/audio/_cache/audio2/` (gitignored).

PROTECTED FILES: All 238 files in the existing asset folders and the existing audio scripts and previews have the same checksums as before; no files were added or removed. Nothing was written to the v1 cache.

DEVIATIONS
- sfx_lute uses kind "ambience" (a positional mono loop) rather than "sfx".
- bgm_spring is 24 bars rather than 32, to stay inside the payload and memory budget. Decoded it is still about 22 MB of PCM, so keep it unloaded until the ending; `Assets.isUnusedAudio` already does this.
- Extra fields the game ignores: `voice`, `cues`, `notes`, `tonality`, `bars`. There are also two extra groups (`sfx_chatter_hi`, `sfx_chatter_lo`) and the extra preview HTML and report files.

KNOWN ISSUES
- The lute shares bgm_village's key and tempo but is not beat-synced to it. Consider turning the music down to about 0.6 near the bard.
- `build_audio2` changes build_audio's module tables in its own process. Don't run build_audio's `main` in that same process.
- The exact OGG loop lengths depend on the libvorbis build. On another machine, rebuild and run the check.