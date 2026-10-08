# audio6 build report

AUDIO6 (CONTRACT_V8 §AE, the living city) is done. All 27 contract sounds, plus two box-drop variants, are in `assets/audio6`, and `check_audio6.py` reports `RESULT: OK`. A full rebuild from an empty cache produced byte-identical audio files. I can't listen to audio, so I judged everything from measurements, spectrograms, a check that the melody notes fit the chords, and decoding in headless Chromium. The designer should listen before release, especially to the two sirens, the cartoon scuffle (`sfx_comic_fight`), the crowd voices and both music loops.

**Tone.** Everything is meant to stay cute and family-friendly:
- Both sirens are rounded retro toys. Nearly all their energy sits below 2.5 kHz (0.0 % above 4 kHz, about the same as the audio3 bus horn).
- The big fire is a warm cartoon blaze with no screaming highs (0.3 % above 4 kHz).
- The scuffle is a dust cloud of bonks, boings and tiny "hai!"s, with no pain sounds.
- The collapse tumbles down an F-major arpeggio ("donk-donk-donk") and ends with a comic "plink".

**Fragment and keys**
- Manifest: `assets/audio6/manifest.json`, version 1. Every key lists `files: ["audio6/<key>.ogg", "audio6/<key>.mp3"]`, plus `volume`, `loop`, `kind` and `duration`.
- Loops also have `loopSamples`, `mp3StartPad` (1105), `rotation`, and `bpm` (music), `cycles` (sirens) or `firingHz` (excavator).
- 29 keys, 58 files. Payload is **3,929,456 bytes** including the manifest (3.93 MB, limit 4 MB).
- One group: `sfx_box` = `sfx_box_drop`, `sfx_box_drop_2`, `sfx_box_drop_3`. It is not called `sfx_box_drop`, so it can't take over the contract key.
- No key or group name clashes with `audio` … `audio5`. The check scans every `assets/audio*` folder, and also catches a group name that equals another fragment's key.

### Music (stereo, F major, `kind: "music"`, loop)
| key | vol | length | what it is |
|---|---|---|---|
| `bgm_city` | 0.376 | 60.95 s, 126 bpm light shuffle, 32 bars | Busy, upbeat living-city theme, form A1 A2 B A3 like bgm_village. The bgm_village hook "A4 C5 D5 – C5 A4 C5 –" opens bars 1 and 5 note for note. The other A bars are the village shapes made busier (pickups, a syncopated F5, a reach up to A5, a perky "ta – da-da!" F-major answer). B is the village B melody note for note, on flute. A1: marimba lead, bouncing pizzicato bass, off-beat electric-piano "chk", kick / brushed snare / shaker. A2: muted trumpet takes the tune, glockenspiel counter-melody, brass "pap-pa!" stabs, a bicycle-bell fill. B: flute, plucked arpeggios, walking bass, woodblock; a trumpet calls back the hook, then a "beep-beep" car horn tuned F4 + A4. A3: tutti with a nod of sleigh bells (still a snowy town), and a tom fill back to the top. |
| `bgm_chase` | 0.376 | 22.86 s, 168 bpm, 16 bars | Comic chase gallop. A: the village hook as running xylophone eighths (A C D C A C D F), tuba "oom" + staccato "pah", clip-clop woodblocks, snare backbeat, a bulb-horn "honk-honk", a chromatic climb into an A7 "uh-oh". B: four bars of sneaky tiptoe pizzicato in D minor (tick-tock woodblocks, a cartoon "boing"), then the race (running scales, trumpet + flute, a C#6 on A7). A slide whistle swoops back to the top. Never dark or scary. |

Both play at **-26.5 LUFS effective**, the same as bgm_village.

### Ambience beds (mono, `kind: "ambience"`, loop)
| key | vol | length | what it is |
|---|---|---|---|
| `amb_fire_big` | 0.254 | 8.00 s | Burning building, cosy-cartoon: deep warm roar breathing slowly, flame flutter (5–20 Hz), dense wood crackle with a few snaps, logs shifting, two "fwoosh" licks per loop. Target -30 LUFS, 1 dB louder than v1 `amb_fire`. |
| `amb_construction` | 0.216 | 8.00 s | Building site across the street: three hammering bursts, a hand saw, a cordless drill, steel clanks, a far dump truck's reverse beeps, a worker calling out, gravel shovelled, distant engine rumble, breeze. |
| `amb_bank` | 0.193 | 8.00 s | Inside the bank: hushed marble-hall murmur, footsteps on polished stone, the note counter "brrrrt", the number-ticket chime "ding-dong" (C6 A5), a teller's stamp, paper shuffling, a coin, warm hall reverb, air-con hum. |
| `amb_warehouse` | 0.207 | 8.00 s | Inside the logistics centre: conveyor motor hum (G2) + roller rattle, boxes bumping over the roller joints, a forklift reversing far away ("beep … beep"), its motor passing, a tape gun, a pallet jack, a voice, big echoing hall. |

### Positional loops (mono, `kind: "ambience"`, loop)
The contract calls these `sfx_*`. Like audio3's `sfx_truck_engine`, they ship as positional ambience-type loops.

| key | vol | length | what it is |
|---|---|---|---|
| `sfx_siren_fire` | 0.575 | 1.99 s (2 cycles) | Fire engine: retro two-tone "nee-naw", D5 / A4 (a fourth, both in F major), 0.5 s each. Two slightly detuned horn voices with a nasal ~1.15 kHz formant, everything above ~2.5 kHz rolled off. 12 ms portamento, a small spin-up scoop, gentle vibrato, a little street slap. |
| `sfx_siren_police` | 0.531 | 2.41 s (4 cycles) | Police car: gliding toy "wee-oo", C5 → F5 → C5, 0.6 s per cycle. Lighter and rounder than the fire engine (triangle + soft square). |
| `sfx_hose_spray` | 0.422 | 2.40 s | Fire hose: airy jet "shhhh" swaying with the nozzle, water drumming on the wall (droplet splatter + gloops), low pump rumble. |
| `sfx_excavator` | 0.372 | 2.00 s | Toy excavator: chunky diesel chug at 9.5 Hz, the hydraulic whine rising and falling as the arm moves, two soft track / bucket clanks. |
| `sfx_comic_fight` | 0.589 | 2.40 s | Cartoon dust-cloud scuffle: shuffling feet, and on top "bonk, swish, pow, biff, squeak, bonk, hai!, swish, pow, boiing, biff, ya!, pow". |

Levels before the -2 dB headroom: sirens -23 / -23.5, hose -26, excavator -27 (= truck engine), fight -23 LUFS integrated.

### One-shots (mono, `kind: "sfx"`)
Cues are seconds from the start of the delivered file. The build subtracts the silence that mastering trims, and onset detection confirms the percussive cues (see QA).

| key | vol | length | cues | what it is |
|---|---|---|---|---|
| `sfx_fire_flare` | 0.372 | 1.50 s | flare 0 | "FWOOMP!": soft low thump, rising roar whoosh, a shower of crackles |
| `sfx_steam_hiss` | 0.221 | 2.19 s | hiss 0, pop 1.95 | The fire goes out: big soft "PSSSHHHhhh" sweeping down 5.5 → 2 kHz, sizzle fading, bubbles, a tiny last "pff-pop" |
| `sfx_collapse_soft` | 0.442 | 2.37 s | crack 0.359, donk1 0.539, donk2 0.779, donk3 0.999, flumph 1.159, plink 1.989 | Creak, woody crack, three beams "donk-donk-donk" tuned C4 A3 F3 with little bounces, a soft "flumph", rubble pour, dust "poof", then one late "plink" |
| `sfx_demolish_crunch` | 0.617 | 1.46 s | bite 0, pour 0.18 | Bucket bite: teeth clank, wood splinters, brick rubble pours down, low thud, dust |
| `sfx_coin_count` | 0.343 | 1.35 s | first 0, ching 0.72 | Eight coins stacked, quickening and rising, a slide, a bright F6 "ching" |
| `sfx_stamp` | 0.708 | 0.29 s | thunk 0 | Rubber stamp "ka-THUNK" on a ledger (desk knock, paper slap, rubber squash), a pen hops |
| `sfx_vault_door` | 0.562 | 2.69 s | spin 0, bolt1 0.777, bolt2 0.937, bolt3 1.097, swing 1.247, open 2.147, sparkle 2.197 | Wheel spin (ratchet speeding up), three bolts "clunk-clunk-CLUNK", heavy swing with a hinge groan and an air whoosh, a deep "dunn", a treasure "ting" |
| `sfx_forklift_beep` | 0.119 | 1.28 s | beep1 0, beep2 0.42, beep3 0.84 | Three friendly reverse beeps on C6 |
| `sfx_police_whistle` | 0.127 | 1.25 s | blast1 0, blast2 0.3 | Pea whistle "pweet! pweeeeet!" centred on C7 (lower and rounder than a referee's), with the pea's trill |
| `sfx_crowd_gasp` | 0.385 | 1.40 s | — | Six onlookers (kids + grown-ups) "h-oooh!", then a murmur. Surprised, not scared. |
| `sfx_crowd_cheer_small` | 0.288 | 2.29 s | — | "Hoo-ray!", "yay!", "woo!", a finger whistle "fweet-fweeoo", short warm applause (different from audio2 `sfx_cheer`) |
| `sfx_cuffs_click` | 0.794 | 0.39 s | ratchet 0, latch 0.19 | Toy cuffs: ratchet "tk-tk-tk-tk", latch "clack", tiny chain jingle |
| `sfx_fire_alarm_bell` | 0.182 | 2.40 s | ring1 0, ring2 1.15 | Electric bell (A5 gong, highs tamed) struck 17×/s in two bursts "brrrring … brrrring", then rings out |
| `sfx_moving_truck` | 0.767 | 2.50 s | brake 0.5, door 0.9, doorTop 1.6, ramp 1.8, rampDown 2.2 | The engine putters to a stop, air brake "pssht", roll-up door "rrrrrrr-clack", ramp slides out "shhhk" and lands "clang" |
| `sfx_box_drop` | 0.871 | 0.24 s | — | Cardboard box set down: hollow "thup", flaps flutter, contents rattle |
| `sfx_box_drop_2` | 0.851 | 0.24 s | — | Variant (group `sfx_box`): small box with tins / toys clinking |
| `sfx_box_drop_3` | 0.912 | 0.30 s | — | Variant (group `sfx_box`): big heavy box, deeper thump, short scrape |
| `sfx_newspaper` | 0.733 | 0.71 s | fwap 0.157 | Grab, a crisp "FWAP" as the paper is shaken open, crinkly rustle |

**Extra manifest fields** (the game ignores them): `cues`, `notes` (usage text for each key), `bars`, `meter`, `tonality`, `rotation`, `cycles`, `firingHz`.

### How the game should use them (the `src` change is for the code agents)
- **Loading:** add `'audio6'` to `FRAGMENTS` in `src/core/Assets.js`.
- **Deferred loading:**
  - Load both music loops lazily, like bgm_harbor. Decoded to raw audio, `bgm_city` is about 21.5 MB and `bgm_chase` about 8.1 MB. Load them when the player first reaches the city districts or the first chase starts.
  - The four `amb_` beds already match `^amb_`.
  - Add the five positional loops to `isDeferredAudio`: `sfx_siren_fire`, `sfx_siren_police`, `sfx_hose_spray`, `sfx_excavator`, `sfx_comic_fight`. Each is 0.35–0.42 MB decoded.
- **Music:**
  - `Audio.playMusic('bgm_city')` in the city districts during the day (crossfades from bgm_village / bgm_harbor).
  - Switch to `bgm_chase` while police chase a thief, or while the fire engine races to a fire if you like. Switch back with `playMusic` on the arrest or arrival.
- **Beds:**
  - `setAmbience('amb_bank', reveal)` / `setAmbience('amb_warehouse', reveal)`, using the cutaway reveal amount (0 → 1 while the shell fades) or camera proximity.
  - `setAmbience('amb_construction', near)` for any construction or rebuild site.
  - `setAmbience('amb_fire_big', near × fireSize)` while a building burns.
- **Fire sequence:**
  1. `sfx_fire_alarm_bell` when the fire is reported (fire_alarm_post or station), plus `sfx_crowd_gasp` for onlookers.
  2. `sfx_fire_flare` when flames burst out of a window (`fx_fire_window`), or when they flare up again after the hose stops.
  3. `sfx_siren_fire` loop from dispatch until about 1 s after arrival, fading by distance. A rate going 1.03 → 0.97 as it passes the camera is a cute Doppler.
  4. On arrival, audio3 `sfx_brakes` + `sfx_door`.
  5. `sfx_hose_spray` loop while `spray_hose` / `fx_hose_stream` play. One instance is enough for several hoses.
  6. `sfx_steam_hiss` when the fire goes out (`fx_steam_puff`). Fade `amb_fire_big` out over the hiss.
  7. `sfx_crowd_cheer_small`.
  8. If the building is lost, `sfx_collapse_soft`: swap to the `ruin_*` sprite on the `flumph` cue at 1.16 s.
- **Rebuild:**
  - `sfx_excavator` loop by distance: rate 0.85 driving / idle, 1.0 working, about 1.12 while `anims.dig` plays.
  - `sfx_demolish_crunch` on the bucket's contact frame, with `fx_demolish_dust`.
  - `amb_construction` while it rebuilds, then audio2 `sfx_build_done`.
- **Bank:**
  - `sfx_coin_count` for deposits, withdrawals and interest.
  - `sfx_stamp` when a loan is approved or a passbook entry is made.
  - `sfx_vault_door` on frame 0 of `anims.vault`. The door swings from 1.25 to 2.15 s, which fits frames 4–7 at about 4 fps.
- **Logistics:**
  - `sfx_forklift_beep` about every 1.3 s while a forklift reverses, volume by distance.
  - The group `sfx_box` (rate 0.92–1.1, throttle ~120 ms) when pickers, movers or the dock hand put boxes down.
  - `sfx_stamp` + audio `sfx_coins_many` / `sfx_cash` at the settlement counter.
  - `sfx_moving_truck` when a moving truck arrives (`anims.unload`), after driving in with audio3 `sfx_truck_engine`.
- **Police:**
  1. `sfx_police_whistle` when an officer spots a thief or stops a scuffle.
  2. `sfx_siren_police` loop during a chase.
  3. `sfx_comic_fight` loop while `fx_fight_cloud` is up (2–4 s).
  4. `sfx_cuffs_click` on the arrest: start `arrested_walk` on the `latch` cue.
  5. `sfx_crowd_cheer_small`.
- **Newspaper:** `sfx_newspaper` when `ui_newspaper` opens in the morning, or when a resident reads the paper.

### QA (from `docs/previews/audio6_report.txt`)
- **Levels:**
  - Every file peaks at -1.0 dBFS or lower. DC offset is under 0.0003.
  - Every key's in-game level lands exactly on its target for the OGG, and within 0.5 dB for the MP3.
  - Targets, in LUFS before the -2 dB headroom:

    | sounds | target | measured as |
    |---|---|---|
    | music | -24.5 | integrated |
    | beds | -30 / -31.5 / -32.5 / -32 | integrated |
    | positional loops | as listed above | integrated |
    | flare | -16.5 | max momentary |
    | collapse, crunch, vault, whistle, cheer | -17 | max momentary |
    | stamp | -17.5 | max momentary |
    | hiss, coins, gasp, alarm, truck | -18 | max momentary |
    | cuffs, boxes, newspaper | -18.5 | max momentary |
    | forklift beep (frequent background) | -20 | max momentary |
- **Pitch:**

  | sound | note | error |
  |---|---|---|
  | fire siren, low tone | A4 | +1.1 cents |
  | forklift beep | C6 | +1.8 cents |
  | alarm bell | A5 | +0.8 cents |
  | coin "ching" | F6 | +0.1 cents |
  | police whistle (band centre of the trill) | C7 | -1.7 cents |

- **Cue timing:** onset detection finds every percussive cue within 8 ms of the manifest time (collapse donks / flumph / plink, vault bolts, beeps, whistle blasts, cuffs, truck, coins, stamp, flare, crunch, hiss). The one exception is the collapse `crack` (0.359 s): the detector fires 23 ms earlier, on the creak's last loud slip just before it. `swing`, `ring2` and `fwap` are soft swells or overlapping bursts, so they are reported but not onset-checked.
- **Loop seams:** no click at the wrap for any loop (fail threshold 1, OGG / MP3).

  | loop | hf | d2 |
  |---|---|---|
  | bgm_city | 0.02 / 0.15 | 0.06 / 0.55 |
  | bgm_chase | 0.25 | 0.24 |
  | four beds | 0.02–0.21 | 0.01–0.17 |
  | excavator | 0.10–0.11 | 0.10–0.12 |
  | fight | 0.28 | 0.10–0.27 |
  | hose | 0.47–0.49 | 0.33–0.42 |
  | police siren | 0.52–0.55 | 0.04–0.56 |
  | fire siren | 0.63–0.65 | 0.18–0.43 |

  The fire siren already scores 0.65 before encoding. Its rendered wrap is sample-continuous (jump 0.000): the score only reflects that a steady, low-passed tone has little high-frequency energy anywhere, so the wrap is compared against very little. Every short loop was picked as the best of 16–32 render variants for the smoothest decoded seam in both codecs.
- **OGG padding:** 0 for all 11 loops.
- **Chromium 141 decode:** `decodeAudioData` returns exactly `loopSamples` frames for the OGG and the MP3 of every loop. Chromium seam ratios are 0.006–0.56.
- **Friendliness** (share of energy above 4 kHz / spectral centroid):

  | sound | above 4 kHz | centroid |
  |---|---|---|
  | fire siren | 0.0 % | 719 Hz |
  | police siren | 0.0 % | 643 Hz |
  | alarm bell | 0.0 % | 911 Hz |
  | forklift beep | 0.0 % | 1070 Hz |
  | police whistle | 0.6 % | 2093 Hz |
  | big fire | 0.3 % | 206 Hz |
  | hose | 16.4 % | 2543 Hz |
  | audio3 bus horn (reference) | 0.0 % | 667 Hz |

- **Melody check:** every melody note on a strong beat is a chord tone. The single exception is A4 over C7 in the B section, which is in the original bgm_village B melody.
- **Rebuild:** a full rebuild into an empty cache produced byte-identical audio files (SHA-1 of all 58).
- **Preview page:** in headless Chromium at 390 × 844, all six scene buttons start the right loops, all 36 card sounds decode, there are no console errors, and there is no horizontal scroll.

### Files
- **Scripts (new):** `tools/audio/sfx6.py`, `tools/audio/music6.py`, `tools/audio/build_audio6.py`, `tools/audio/check_audio6.py`.
  - They import `synth`, `instruments`, `ambience`, `sfx`, `sfx2`, `sfx3`, `sfx4`, `music`, `music2`, `build_audio` (`fit_loop`, `_encode_one`, `volume_for`, `encode_all`), `check_audio` and `check_audio2`. None of those were edited.
  - `fit_loop_seam` is a copy of build_audio3's. Importing build_audio3 would re-bind build_audio to the audio3 set.
- **Rebuild:** `python3 tools/audio/build_audio6.py` (about 4–6 min on 2 busy cores). Also `--only k1,k2`, `--skip-render`, `--no-check`. QA alone: `python3 tools/audio/check_audio6.py`.
- **Cache:** `/tmp/fv_cache/audio6` (override with `FV_AUDIO6_CACHE`).
- **Previews in `docs/previews/`:**
  - `audio6_waveforms.png`: a waveform of every key, spectrograms of the 11 loops and of every one-shot.
  - `audio6_demo.mp3`: 76 s "a day in the living city". Morning city (bus, chatter, newspaper), the bank (door, coins counted, stamp, vault), the logistics centre (forklift beeps, boxes, a moving truck, settlement stamp), fire (alarm bell, gasps, flare, the blaze, the fire engine's siren approaching, brakes, hose, steam, cheer), a bread thief (whistle, chase music, police siren, dust-cloud scuffle, whistle, cuffs, cheer), then the next morning's paper.
  - `audio6_report.txt`: the QA table.
  - `audio6_preview.html`: listening page with six scene buttons (Morning city, Bank, Warehouse, Fire, Thief chase, Rebuild) and reference sounds from audio … audio3. Open it through the game's local web server.

### Known issues
- I could not listen. The siren timbres, the scuffle's tiny voices, the crowd and the music arrangement were designed on paper and checked by measurement only.
- **Positional loops use `kind: "ambience"`.** The contract names the five loops `sfx_*` without saying which kind. This follows audio3's vehicle loops.
- **Short beds.** The four beds are 8 s long (older beds are 14–46 s), to keep the payload under 4 MB. Their events repeat every 8 s, so drive them by proximity / reveal rather than leaving them on full everywhere. amb_bank also needed the grid fallback of `fit_loop` (-96 samples).
- **Payload margin.** The payload is 3.93 MB, so there is only about 70 KB of room for more sounds in this folder.
- **Vault timing.** `sfx_vault_door` assumes `anims.vault` runs at about 4 fps; if the civic art uses another rate, re-time it or start the sound a little later.
- **Alarm bell second burst.** In `sfx_fire_alarm_bell`, the second burst starts while the first still rings, so `ring2` is a design time, not a detectable onset.
- **Libvorbis builds.** Exact loop lengths depend on the libvorbis build. On another machine, rebuild and re-run the check.
- **Process-local binding.** `build_audio6` points `build_audio`'s tables at the audio6 set inside its own process only. Don't call `build_audio.main` in that same process.
