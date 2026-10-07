# audio4 build report

AUDIO4 (CONTRACT_V6 §U) is done: all 10 harbour sounds are in `assets/audio4`, and `check_audio4.py` reports `RESULT: OK`. A clean rebuild from an empty cache gave byte-identical files. I can't listen to audio, so I judged everything by measurements, spectrograms, a check that the melody notes fit the chords, and decoding in headless Chromium. The designer should listen before release, especially to the gulls and the accordion in the music.

**Fragment and keys**
- Manifest: `assets/audio4/manifest.json`, version 1. Every key lists `files: ["audio4/<key>.ogg", "audio4/<key>.mp3"]`, plus `volume`, `loop`, `kind` and `duration`.
- 10 keys, 20 files. Payload is 2,591,638 bytes (2.59 MB, limit 3 MB).
- One group: `sfx_seagull = [sfx_seagull_1, sfx_seagull_2, sfx_seagull_3]`.
- No key or group name clashes with `audio`, `audio2` or `audio3`.

| key | kind / loop | volume | length | what it is |
|---|---|---|---|---|
| `bgm_harbor` | music, loop, stereo | 0.376 | 61.27 s | Cheerful sea-shanty theme in 6/8 (`bpm` 94 = dotted-quarter beats), 48 bars, F major. Form A1 A2 B A3 C A4. Opens with the bgm_village melody's opening phrase (same notes) in a rocking shanty rhythm; the B section has the same chord progression as the village B section and ends on its closing figure. Instruments: marimba, accordion, tin whistle, music box, glock, plucked bass, foot stomps, claps, frame drum, ship's-bell dings. Plays at -26.5 LUFS after volume, the same as bgm_village. |
| `amb_harbor` | ambience, loop, mono | 0.216 | 22.01 s | Water lapping on the pier, gulls near and far, a bell buoy and a far ship's bell, rigging tinks, creaking moored boats, a light breeze. |
| `sfx_ship_horn_big` | sfx | 0.351 | 3.82 s | Deep, warm single long blast (two horn voices on F2 + C3) with an echo off the harbour. |
| `sfx_ferry_bell` | sfx | 0.380 | 2.36 s | Brass ship's bell (A5), rung "ding-ding … ding-ding". |
| `sfx_seagull_1` / `_2` / `_3` | sfx | 0.193 / 0.243 / 0.272 | 0.85 / 1.36 / 1.02 s | A long "kyaaow"; a long call "kee-aaa kyow ×4"; a cheeky "kek-kek-kek kew?". Natural-ish but a bit higher and rounder than real gulls. |
| `sfx_crane` | sfx | 0.403 | 1.96 s | Winch + clank: one full 2.0 s crane work cycle. |
| `sfx_auction_bell` | sfx | 0.211 | 2.16 s | Brass hand bell (F5) shaken hard in two bursts. |
| `sfx_rope_creak` | sfx | 0.282 | 1.36 s | Hull bump, then a long rope creak, then a short slack "crk". |

**Extra manifest fields** (the game ignores them): `cues` (seconds from file start), `notes` (usage text), `loopSamples`, `mp3StartPad`, `rotation`, `bars`, `meter`, `tonality`, and `syncAnim` on the crane.

**How the game should use them**
- **Loading:** add `'audio4'` to `FRAGMENTS` in `src/core/Assets.js`.
- **Load the music lazily:** bgm_harbor is about 21.6 MB once decoded. Add `bgm_harbor` to the deferred or unused audio pattern there and load it when the player first reaches the harbour.
- **Music:** `Audio.playMusic('bgm_harbor')` crossfades from the village theme.
- **Ambience:** `Audio.setAmbience('amb_harbor', 0..1)` by distance to the quay, instead of `amb_sea` there or crossfaded with it.
- **Gulls:** play the `sfx_seagull` group every 4–12 s near the water, with rate 0.9–1.12 and volume by distance. Also play it when a gull sprite lands or takes off.
- **Ship horn:** play when a ship arrives or departs. **Ferry bell:** play at boarding/departure.
- **Crane:** play `sfx_crane` once on frame 0 of every cycle of `harbor_crane` `anims.work` (8 frames at 4 fps). Its `drop` cue at 1.25 s lines up with drop frame 5. Use volume 0.4–0.7 in the background, and at most one per cycle per crane.
- **Auction bell:** play when a trawler's catch reaches the fish auction.
- **Rope creak:** play every 6–15 s near moored ships, with rate 0.85–1.15.

**QA**
- **Levels:** every file peaks at -1.2 dBFS or lower, DC offset under 0.0002, and each sound's in-game level lands on its target (within ±0.5 dB).
- **Pitch:** ferry bell measures A5 (-0.6 cents), auction bell F5 (-1.9 cents), ship horn F2 (-0.7 cents).
- **Loop seams:** no click at the wrap for either loop. Seam ratios are 0.09–0.27 against a fail threshold of 1, for both OGG and MP3.
- **OGG padding:** OGG end padding is 0 for both loops.
- **Chromium (141) decode:** the OGG and MP3 of each loop decode to exactly the loop length (2,702,080 and 970,432 frames).

**Files**
- Scripts in `tools/audio/`: `sfx4.py`, `music4.py`, `build_audio4.py` (imports `fit_loop`, `_encode_one`, `volume_for` and `encode_all` from `build_audio.py`), `check_audio4.py` (imports `check_audio.loop_metrics` and `check_audio2.chromium_decode`). No existing script was edited.
- Rebuild: `python3 tools/audio/build_audio4.py` (about 1 min).
- Previews in `docs/previews/`:
  - `audio4_waveforms.png`
  - `audio4_demo.mp3`: 48 s — the train reaches the harbour, the ferry docks, the crane works in time with its animation, the fish auction opens, the ferry leaves.
  - `audio4_report.txt`: the QA table.
  - `audio4_preview.html`: a listening page with three scene buttons; open it through the game server.

**Known issues**
- The 6/8 feel and the accordion tone were designed on paper and checked by measurement only; I couldn't hear them.
- The gulls in `amb_harbor` use the same generator as the `sfx_seagull` calls (shifted in pitch and pushed into the distance), so the two can sound alike when both play.
- `sfx_crane` assumes the crane animation runs at 4 fps. If the art changes speed, the sound needs re-timing.
- Exact OGG loop lengths depend on the libvorbis build; rebuild and re-run the check on another machine.
