# audio6 build report

AUDIO6 (CONTRACT_V8 §AE, the living city) is done and polished after the critic's review. `assets/audio6` holds all 27 contract sounds, two box-drop variants and one new extra, `sfx_ticket_chime`. `check_audio6.py` reports `RESULT: OK` with no warnings. Two rebuilds in a row from an empty cache produced byte-identical files.

I can't listen to audio. Everything was judged from measurements, spectrograms, a phone-speaker model, a check that the melody notes fit the chords, and decoding in headless Chromium at 44.1 and 48 kHz. The designer should listen before release, especially to:
- the two sirens
- the scuffle (`sfx_comic_fight`)
- the crowd voices
- the new `bgm_city` tune
- the re-voiced fire bed, collapse, stamp, vault and excavator

**What the polish pass changed** (details in the table at the end):
- **Phones:**
  - The fire bed, collapse, stamp, vault and excavator now keep their body on phone speakers. They lose at most 4.8 dB there, down from 9.5–17.6 dB.
  - The hose is less hissy and the whistle is 2 dB quieter.
- **Beds:** the four beds no longer repeat a recognisable chime, voice or stamp every 8 s. The bank's queue chime is now a separate one-shot, `sfx_ticket_chime`.
- **`bgm_city`:** it now has its own tune and chords. The village hook is kept in two bars of each A section, and the village B melody survives only as a two-bar quote.
- **Vault:** `sfx_vault_door` is re-timed to the vault animation as the civic tools render it (8 frames at 8 fps).
- **QA:** the check now also tests phone loss, 48 kHz playback in Chromium, and exact `duration` values.

**Tone.** Everything stays cute and family-friendly:
- Both sirens are rounded retro toys with 0.0 % of their energy above 4 kHz.
- The big fire is a warm cartoon blaze. Its crackle now carries it on a phone, with 1.1 % of energy above 4 kHz and a low-pass at 6.5 kHz.
- The scuffle is a dust cloud of bonks, boings and tiny "hai!"s, with no pain sounds.
- The collapse tumbles down an F-major arpeggio ("donk-donk-donk") and ends with a comic "plink".

**Fragment and keys**
- **Manifest:** `assets/audio6/manifest.json`, version 1. Every key has `files: ["audio6/<key>.ogg", "audio6/<key>.mp3"]`, `volume`, `loop`, `kind` and `duration`.
- **Loop fields:** loops also carry `loopSamples`, `mp3StartPad` (1105), `rotation`, and `bpm` (music), `cycles` (sirens) or `firingHz` (excavator).
- **Loop `duration`:** written as `loopSamples / 44100` to 7 decimals, so `round(duration * 44100) == loopSamples` exactly. `Audio.trimLoops` relies on this.
- **Size:** 30 keys, 60 files. The payload is **3,930,544 bytes** including the manifest (3.93 MB; the limit is 4,000,000).
- **Group:** `sfx_box` = `sfx_box_drop`, `sfx_box_drop_2`, `sfx_box_drop_3`. Call `Audio.play('sfx_box', {rate: 0.92-1.1})`; `Audio.play('sfx_box_drop')` alone always plays box 1. The group is not named `sfx_box_drop`, so it can't take over the contract key.
- **Name clashes:** no key or group name clashes with `audio` … `audio5`. The check scans every `assets/audio*` folder.

### Music (stereo, F major, `kind: "music"`, loop)
| key | vol | length | what it is |
|---|---|---|---|
| `bgm_city` | 0.376 | 60.95 s, 126 bpm light shuffle, 32 bars | Busy, upbeat living-city theme, form A1 A2 B A3. It belongs to bgm_village's family (same key, the village hook "A4 C5 D5 – C5 A4 C5 –" note for note in bars 1 and 5 of every A, the same marimba / muted-trumpet palette), but the tune and chords are its own. See the two notes below this table. |
| `bgm_chase` | 0.376 | 22.86 s, 168 bpm, 16 bars | Comic chase gallop (unchanged). **A:** the village hook as running xylophone eighths, tuba "oom" + "pah", clip-clop woodblocks, a bulb-horn "honk-honk", a chromatic climb into an A7 "uh-oh". **B:** four bars of sneaky tiptoe pizzicato in D minor (tick-tock woodblocks, a cartoon "boing"), then the race (running scales, trumpet + flute). A slide whistle swoops back to the top. Never dark. |

**`bgm_city` A section:** F | Dm7 | Gm7 | C7 | F | D7 | Gm7 C7 | F.
- Off-beat entries are answered by 16th-note "traffic" pickups from the other lead instrument.
- A D7 "city" secondary dominant, running eighths, and a "ta – da – da!" answer.
- **A1:** marimba lead, the trumpet answers.
- **A2:** muted trumpet lead, the marimba answers. A new glockenspiel counter-line, brass "pap-pa!" stabs and a bicycle-bell fill.
- **A3:** tutti with sleigh bells, and a tom fill back to the top.

**`bgm_city` B section:** a new lyrical flute tune on Gm7 | C7 | Fmaj7 | Dm7 | Bb | C | Am7 D7 | Gm7 C7.
- The village B melody appears only as a two-bar muted-trumpet quote over Bb | C (bars 5–6), the same chords it had in the village.
- A marimba fragment of the hook fills the bar-4 gap, and a "beep-beep" car horn (E4 + G4) leads back.

Both loops play at **-26.5 LUFS effective**, the same as bgm_village.

### Ambience beds (mono, `kind: "ambience"`, loop)
These are now texture only. Recognisable events are one-shots the game fires (see "How the game should use them").

| key | vol | length | what it is |
|---|---|---|---|
| `amb_fire_big` | 0.257 | 8.00 s | Burning building, cosy cartoon: a warm roar breathing slowly (sub shelved -3.5 dB), flame flutter, a 1.5 kHz flame "tongue", dense wood crackle with rounded snaps (crackle +6 dB), logs shifting, two "fwoosh" licks. Low-passed at 6.5 kHz. |
| `amb_construction` | 0.214 | 8.00 s | Building site across the street: three hammering bursts, a hand saw, a cordless drill, steel clanks, a far dump truck's reverse beeps, gravel shovelled, distant engine rumble, breeze. **No voices.** |
| `amb_bank` | 0.193 | 7.99 s | Inside the bank: hushed marble-hall murmur, soft footsteps on stone, a faint note counter, paper, warm hall reverb, air-con hum. **No chime, stamps, coin or voices.** |
| `amb_warehouse` | 0.207 | 8.00 s | Inside the logistics centre: conveyor hum (G2) + roller rattle, boxes bumping over the roller joints, a far forklift reversing, its motor passing, a tape gun, a pallet jack, big echoing hall. **No voices.** |

### Positional loops (mono, `kind: "ambience"`, loop)
The contract calls these `sfx_*`. Like audio3's `sfx_truck_engine`, they ship as positional ambience loops.

| key | vol | length | what it is |
|---|---|---|---|
| `sfx_siren_fire` | 0.575 | 1.99 s (2 cycles) | Fire engine: retro two-tone "nee-naw", D5 / A4, 0.5 s each. Nasal ~1.15 kHz horn formant, nothing above ~2.5 kHz, a small spin-up scoop, gentle vibrato. |
| `sfx_siren_police` | 0.531 | 2.41 s (4 cycles) | Police car: gliding toy "wee-oo", C5 → F5 → C5, 0.6 s per cycle. |
| `sfx_hose_spray` | 0.422 | 2.40 s | Fire hose, re-balanced toward water hitting the wall: jet hiss -4 dB; splatter, wash and gloops +3 dB; droplets 0.7–3.8 kHz; a 1 kHz lift. |
| `sfx_excavator` | 0.372 | 2.00 s | Toy excavator: diesel chug at 9.5 Hz (chug band 420 Hz, sub -5 dB), a louder hydraulic whine (0.36) with its 2nd harmonic, 1.1–2.3 kHz track-link "tikka-tikka" locked to the firing grid, low-passed at 4 kHz. |
| `sfx_comic_fight` | 0.569 | 2.40 s | Cartoon dust-cloud scuffle: shuffling feet, then "bonk, swish, pow, biff, squeak, bonk, hai!, swish, pow, boiing, biff, ya!, pow". The "pow" puffs are now a 700 Hz cloud rather than a sub thump. |

Levels before the -2 dB headroom (integrated LUFS): sirens -23 / -23.5, hose -26, excavator -27 (the same as the truck engine), fight -23.

### One-shots (mono, `kind: "sfx"`)
Cues are seconds from the start of the delivered file; onset detection confirms the percussive ones (see QA).

| key | vol | length | cues | what it is |
|---|---|---|---|---|
| `sfx_fire_flare` | 0.372 | 1.50 s | flare 0 | "FWOOMP!": soft low thump, rising roar whoosh, a shower of crackles |
| `sfx_steam_hiss` | 0.251 | 2.19 s | hiss 0, pop 1.95 | The fire goes out: big soft "PSSSHHHhhh" sweeping down 5.5 → 2 kHz, sizzle, bubbles, a last "pff-pop". Mastered to -2.6 dBFS, so its true peak is -1.8 dBTP. |
| `sfx_collapse_soft` | 0.724 | 2.37 s | crack 0.359, donk1 0.539, donk2 0.779, donk3 0.999, flumph 1.159, plink 1.989 | Creak, a woody crack with a 1–2 kHz "krak", three beams "donk-donk-donk" (C4 A3 F3 with an octave "tok", so phones hear C5 A4 F4), a hollow mid "flumph", rubble pour, dust "poof", a late "plink" |
| `sfx_demolish_crunch` | 0.617 | 1.46 s | bite 0, pour 0.18 | Bucket bite: teeth clank, wood splinters, brick rubble pours down, low thud, dust |
| `sfx_coin_count` | 0.343 | 1.35 s | first 0, ching 0.72 | Eight coins stacked, quickening and rising, a bright F6 "ching" |
| `sfx_stamp` | 0.966 | 0.29 s | thunk 0 | Rubber stamp "ka-THUNK": a 720 Hz desk knock, a longer paper slap, the 95 Hz thump 4 dB down, a pen hops |
| `sfx_vault_door` | 0.716 | 1.69 s | spin 0, bolt1 0.25, bolt2 0.31, bolt3 0.375, swing 0.4, open 0.875, sparkle 0.94 | Timed to `anims.vault` (8 frames at 8 fps): wheel spin (frames 1–2), three bolts "ka-chunk-CLUNK" with bright steel clacks (bolt3 on frame 3), the swing with a hinge groan and air whoosh (frames 3–7), "dunn" + 1 kHz knock on frame 7, a treasure "ting" |
| `sfx_forklift_beep` | 0.119 | 1.28 s | beep1 0, beep2 0.42, beep3 0.84 | Three friendly reverse beeps on C6 |
| `sfx_police_whistle` | 0.101 | 1.25 s | blast1 0, blast2 0.3 | Pea whistle "pweet! pweeeeet!" centred on C7, with the pea's trill (2 dB quieter than before) |
| `sfx_crowd_gasp` | 0.385 | 1.40 s | — | Six onlookers "h-oooh!", then a murmur. Surprised, not scared. |
| `sfx_crowd_cheer_small` | 0.288 | 2.29 s | — | "Hoo-ray!", "yay!", "woo!", a finger whistle, short warm applause |
| `sfx_cuffs_click` | 0.794 | 0.39 s | ratchet 0, latch 0.19 | Toy cuffs: ratchet, latch "clack", tiny chain jingle |
| `sfx_fire_alarm_bell` | 0.182 | 2.40 s | ring1 0, ring2 1.15 | Electric bell (A5, highs tamed), two bursts "brrrring … brrrring" |
| `sfx_moving_truck` | 0.767 | 2.50 s | brake 0.5, door 0.9, doorTop 1.6, ramp 1.8, rampDown 2.2 | Engine putters to a stop, air brake, roll-up door, ramp slides out and lands |
| `sfx_box_drop` | 0.871 | 0.24 s | — | Cardboard box set down: hollow "thup", flaps, contents rattle |
| `sfx_box_drop_2` | 0.851 | 0.24 s | — | Extra, group `sfx_box`: small box with tins clinking |
| `sfx_box_drop_3` | 0.912 | 0.30 s | — | Extra, group `sfx_box`: big heavy box, deeper thump, short scrape |
| `sfx_newspaper` | 0.733 | 0.71 s | fwap 0.157 | Grab, a crisp "FWAP", crinkly rustle |
| `sfx_ticket_chime` | 0.263 | 1.24 s | ding 0, dong 0.34 | **New extra.** The bank's number display calls the next customer: soft electronic "ding-dong" (C6 → A5, vibraphone-like with a slow tremolo), a faint click |

**Extra manifest fields** (the game ignores them): `cues`, `notes` (usage text for each key), `bars`, `meter`, `tonality`, `rotation`, `cycles`, `firingHz`.

### How the game should use them (the `src` changes are for the code agents)
- **Box sounds:** call the group, `Audio.play('sfx_box', {rate: 0.92 + Math.random() * 0.18})`, throttled to about 120 ms. `sfx_box_drop` on its own is always box 1.
- **Loading:** add `'audio6'` to `FRAGMENTS` in `src/core/Assets.js`.
- **Deferred loading:** Preload decodes every key that `isDeferredAudio` does not match before the title screen appears. Change it to exactly:
  ```js
  isDeferredAudio(key) { return /^(bgm_(village|city|chase)|amb_|sfx_lute|sfx_(siren_fire|siren_police|hose_spray|excavator|comic_fight)$)/.test(key) || V3_SFX.test(key); }
  ```
  Without this, about 1.2 MB is downloaded and about 30 MB of audio is decoded before the title. Decoded, `bgm_city` is about 21.5 MB and `bgm_chase` about 8.1 MB. Each positional loop is 0.35–0.42 MB.
- **Loop rate:** `setAmbience` only sets volume. Add:
  ```js
  setAmbienceRate(key, r) { const s = this.amb[key]; if (s) try { s.setRate(r); } catch (e) { /* */ } }
  ```
  The excavator rates (0.85 / 1.0 / 1.12), the siren Doppler and the fight's random rate need it. Without it, play everything at rate 1.
- **trimLoops (optional):** in `Audio.trimLoops`, prefer `want = a.loopSamples ? Math.round(a.loopSamples * rate / 44100) : Math.round(a.duration * rate)`. Audio6 durations are already exact, so this only hardens the older fragments.
- **Music:**
  - `Audio.playMusic('bgm_city')` in the city districts by day.
  - `bgm_chase` while police chase a thief (or while a fire engine races).
  - When the chase ends, resume `bgm_city` from the position it was paused at, not bar 1. For example, keep the old Phaser sound paused, or remember its `seek` and pass `{seek}` when you play it again.
- **Beds:**
  - `setAmbience('amb_bank', reveal)` and `setAmbience('amb_warehouse', reveal)`, using the cutaway reveal amount (0 → 1) or camera proximity.
  - `setAmbience('amb_construction', near)` at any building site.
  - `setAmbience('amb_fire_big', near × fireSize)` while a building burns.
  - Add life with one-shots at random 6–20 s intervals near people: audio2 `sfx_chatter_lo` in the bank, the warehouse and the building site, and audio2 `sfx_hammer` at the building site.
- **Fire sequence:**
  1. `sfx_fire_alarm_bell` when the fire is reported, plus `sfx_crowd_gasp`.
  2. `sfx_fire_flare` when flames burst out of a window, or flare up again after the hose stops.
  3. The `sfx_siren_fire` loop from dispatch until about 1 s after arrival, by distance. A rate going 1.03 → 0.97 as it passes is a cute Doppler (needs `setAmbienceRate`).
  4. audio3 `sfx_brakes` + `sfx_door` on arrival.
  5. The `sfx_hose_spray` loop while `spray_hose` plays; one instance covers several hoses. Optionally duck it to 0.75 while `amb_fire_big` is above 0.5.
  6. `sfx_steam_hiss` when the fire goes out; fade `amb_fire_big` out over it.
  7. `sfx_crowd_cheer_small`.
  8. If the building is lost, `sfx_collapse_soft`, and swap to the `ruin_*` sprite on the `flumph` cue (1.16 s).
- **Rebuild:** the `sfx_excavator` loop by distance (rate 0.85 idle, 1.0 working, 1.12 while `anims.dig` plays). `sfx_demolish_crunch` on the bucket's contact frame. `amb_construction` while it rebuilds, then audio2 `sfx_build_done`.
- **Bank:**
  - `sfx_ticket_chime` when a teller frees up and the queue advances.
  - `sfx_coin_count` for deposits, withdrawals and interest.
  - `sfx_stamp` when a loan is approved or a passbook entry is made.
  - `sfx_vault_door` on frame 0 of `anims.vault`. It is timed for 8 frames at 8 fps, as `civ_assets.py` renders the overlay. If the animation runs at another fps, play the sound at rate fps / 8 (0.75–1.25 sounds fine).
- **Logistics:**
  - `sfx_forklift_beep`, retriggered every **1.26 s** (3 × 0.42 s, so the beeps stay evenly spaced) while a forklift reverses, volume by distance.
  - The `sfx_box` group for boxes.
  - `sfx_stamp` + audio `sfx_coins_many` / `sfx_cash` at the settlement counter.
  - `sfx_moving_truck` on `anims.unload`, after driving in with audio3 `sfx_truck_engine`.
- **Police:**
  1. `sfx_police_whistle`. For repeated incidents nearby, play only the first blast (stop it at the `blast2` cue).
  2. The `sfx_siren_police` loop during a chase.
  3. The `sfx_comic_fight` loop while `fx_fight_cloud` is up (2–4 s). Start each fight at a random position and a rate of 0.95–1.05, so two fights never sound alike.
  4. `sfx_cuffs_click`, and start `arrested_walk` on its `latch` cue.
  5. `sfx_crowd_cheer_small`.
- **Newspaper:** `sfx_newspaper` when `ui_newspaper` opens.

### QA (from `docs/previews/audio6_report.txt`)
- **Levels:**
  - Every file's sample peak is -1.0 dBFS or lower, and every true peak is -1.0 dBTP or lower (the check now warns above that). DC offset is under 0.0003.
  - Every key's in-game level is on target: exactly for the OGG, within 0.5 dB for the MP3.
  - Targets in LUFS before the -2 dB headroom (music and loops integrated, one-shots max momentary): music -24.5; beds -30 / -31.5 / -32.5 / -32; flare -16.5; collapse, crunch, vault and cheer -17; hiss, coins, gasp, alarm and truck -18; stamp, cuffs, boxes and newspaper -18.5; whistle and ticket chime -19; forklift -20.
- **Phone speakers.** The check's new model is a 4th-order high-pass at 500 Hz plus a low-pass at 9 kHz. For each key it measures the level lost through that model: integrated for loops, and for one-shots the worse of integrated and max momentary. The limit is 6 dB, and every key passes, with the worst loss at 4.8 dB.

  Before → after (phone-effective level = phone-weighted level × manifest volume):

  | key | loss before → after | phone-effective before → after |
  |---|---|---|
  | `amb_fire_big` | 9.5 → 3.5 dB | -41.5 → -35.5 LUFS (v1 `amb_fire`: -37.6) |
  | `sfx_excavator` | 17.6 → 4.8 dB | -46.6 → -33.8 LUFS |
  | `sfx_collapse_soft` | 11.2 → 4.7 dB | -30.0 → -22.8 Mmax |
  | `sfx_vault_door` | 12.0 → 4.1 dB | -31.4 → -23.1 Mmax |
  | `sfx_stamp` | 12.9 → 1.4 dB | -30.1 → -21.8 Mmax |
  | `sfx_police_whistle` | 0.1 → 0.0 dB | -19.0 → -20.9 Mmax |

  - The check also fails if `amb_fire_big` is quieter on a phone than the v1 camp fire. It is now 2.1 dB louder; before, it was 3.8 dB quieter.
  - On a phone the hose now sits 7 dB above the fire bed instead of 13 dB.
- **Pitch:**

  | sound | note | error |
  |---|---|---|
  | fire siren, low tone | A4 | +1.1 cents |
  | forklift beep | C6 | +1.8 cents |
  | alarm bell | A5 | +0.8 cents |
  | coin "ching" | F6 | +0.1 cents |
  | ticket chime "ding" | C6 | +0.1 cents |
  | police whistle (band centre of the trill) | C7 | -1.7 cents |

- **Cue timing:** every percussive cue is within 8 ms of a detected onset: vault bolts and `open`, collapse donks / flumph / plink, ticket ding / dong, beeps, whistle blasts, cuffs, truck, coins, stamp, flare, crunch and hiss. The one exception is the collapse `crack`, where the detector fires 23 ms early on the creak's last slip. `swing`, `ring2` and `fwap` are soft swells, so they are reported but not onset-checked.
- **Loop seams** (fail threshold 1; OGG / MP3 decoded with ffmpeg):

  | loop | hf | d2 |
  |---|---|---|
  | bgm_city | 0.014 / 0.022 | 0.065 / 0.070 |
  | bgm_chase | 0.25 | 0.24 / 0.23 |
  | four beds | 0.06–0.21 | 0.02–0.27 |
  | excavator | 0.03 / 0.02 | 0.08 / 0.04 |
  | fight | 0.24 | 0.11 / 0.04 |
  | hose | 0.36 | 0.25 |
  | police siren | 0.52 / 0.55 | 0.56 / 0.04 |
  | fire siren | 0.65 / 0.63 | 0.43 / 0.18 |

  The fire siren's rendered wrap is sample-continuous. Its hf score only reflects that a steady, low-passed tone has very little high-frequency energy to compare against. OGG end padding is 0 for all 11 loops. `amb_construction` needed `fit_loop`'s grid-of-64 fallback (+96 samples).
- **Chromium 141, `decodeAudioData`:**
  - At 44.1 kHz, the OGG and MP3 of every loop decode to exactly `loopSamples` frames, with seam ratios 0.02–0.55.
  - **New 48 kHz pass** (what phones run at; the loop length becomes fractional and is truncated): every loop's seam ratio is 0.03–0.54 in both formats.
  - `bgm_city`'s MP3 reproduced the critic's finding at 48 kHz: 1.17 with the loop point 12 ms before the downbeat. The build now tries ten loop-point positions, scores each with an emulated 48 kHz decode (which tracks Chromium within about 0.1), and keeps 8 ms. Its 48 kHz seam is now 0.148 (MP3) and 0.064 (OGG).
- **Friendliness** (energy above 4 kHz / spectral centroid):

  | sound | above 4 kHz | centroid |
  |---|---|---|
  | fire siren | 0.0 % | 719 Hz |
  | police siren | 0.0 % | 643 Hz |
  | alarm bell | 0.0 % | 911 Hz |
  | forklift beep | 0.0 % | 1070 Hz |
  | whistle | 0.6 % | 2100 Hz |
  | big fire | 1.1 % | 515 Hz |
  | hose (before polish: 16.4 % / 2543 Hz) | 7.0 % | 1653 Hz |
  | audio3 bus horn (reference) | 0.0 % | 667 Hz |

  In the 2–5 kHz band the hose fell from 53 % to 24 % of its energy, and the fire rose from 0.7 % to 4.2 %.
- **Melody check:**
  - Every `bgm_city` melody note on a strong beat is a chord tone, and every other note is in F major or a tone of its own chord. That covers the F#5 on D7 and the counter-line and answer notes too.
  - `bgm_chase` has a single chromatic passing note, B4 in its "chromatic climb" (unchanged).
  - **Identity versus bgm_village:**
    - 6 of 32 bars are identical; these are the deliberate hook bars, down from 15.
    - 36 % of eighth-note slots match, counting rests and holds; before, 82 % did.
    - 4 of 8 A chords and 3 of 8 B chords match; before, all of them did.
    - 1 of 8 counter-line pairs matches; before, the whole counter-line was the village's.
- **Rebuild:** two full rebuilds in a row from an empty cache gave byte-identical files (SHA-1 of all 60 audio files + the manifest).
- **Preview page:** in headless Chromium at 390 × 844, all six scene buttons start the right loops, all 37 card sounds decode, there are no console errors and no horizontal scroll.

### Files
- **Scripts (new, owned by audio6):** `tools/audio/sfx6.py`, `tools/audio/music6.py`, `tools/audio/build_audio6.py`, `tools/audio/check_audio6.py`.
  - They import `synth`, `instruments`, `ambience`, `sfx`, `sfx2`, `sfx3`, `sfx4`, `music`, `music2`, `build_audio` and `check_audio`. None of those were edited.
  - `fit_loop_seam` is a copy of build_audio3's. For `bgm_city` it now also scores the emulated 48 kHz decode (`seam48`).
- **Rebuild:** `python3 tools/audio/build_audio6.py` (about 4–5 min on 2 busy cores). Also `--only k1,k2`, `--skip-render`, `--no-check`. QA alone: `python3 tools/audio/check_audio6.py`. The 44.1 / 48 kHz Chromium pass needs Playwright; without it, it is skipped with a warning.
- **Cache:** `/tmp/fv_cache/audio6` (override with `FV_AUDIO6_CACHE`).
- **Previews in `docs/previews/`:**
  - `audio6_waveforms.png`: a waveform of every key, spectrograms of the 11 loops and of every one-shot.
  - `audio6_demo.mp3`: 76 s "a day in the living city". Morning city; the bank (door, queue chime, chatter, coins counted, stamp, vault, chime); the logistics centre (forklift beeps 1.26 s apart, boxes, chatter, a moving truck, settlement stamp); fire (alarm bell, gasps, flare, the blaze, the siren approaching, brakes, hose, steam, cheer); a bread thief (whistle, chase music, police siren, dust-cloud scuffle, whistle, cuffs, cheer); then the next morning's paper.
  - `audio6_report.txt`: the QA tables, including the phone and 48 kHz passes.
  - `audio6_preview.html`: listening page with six scene buttons (Morning city, Bank, Warehouse, Fire, Thief chase, Rebuild); the bank, warehouse and rebuild scenes now fire the chime and chatter one-shots. It also has reference sounds from audio … audio3. Open it through the game's local web server.

### Known issues
- **Not listened to.** The siren timbres, the scuffle's voices, the crowd, the new `bgm_city` arrangement and the re-voiced fire, stamp, vault, collapse and excavator were designed on paper and checked by measurement only.
- **`src` changes are needed.** The deferred-loading regex, `setAmbienceRate` and resuming `bgm_city` after a chase are code-agent work (exact strings above). Until then the five positional loops would be decoded before the title, and rates other than 1 cannot be set.
- **The vault's frame rate is assumed.** `sfx_vault_door` is timed for `anims.vault` at 8 fps, read from `tools/blender/civ_assets.py`. The civic manifest isn't published yet, so if its fps changes, scale the playback rate by fps / 8.
- **Short beds.** The beds are 8 s and texture-only. Their remaining soft events still recur every 8 s: footsteps, a faint counter and paper in the bank; hammering, saw and drill at the site; boxes, beeps and tape in the warehouse. They are not identifiable one-offs, but keep the beds proximity-driven, and let the game's chatter and chime one-shots carry the life.
- **The scuffle loop has fixed shouts.** `sfx_comic_fight` still has its two tiny shouts at fixed points in the 2.4 s cycle. A 2–4 s cloud repeats them at most once; the random seek / rate note covers the rest.
- **Small payload margin.** About 69 KB of room is left under 4 MB.
- **The alarm bell's second burst** starts while the first still rings, so `ring2` is a design time, not a detectable onset.
- **libvorbis builds.** Exact loop lengths depend on the libvorbis build. On another machine, rebuild and re-run the check.
- **Process-local binding.** `build_audio6` points `build_audio`'s tables at the audio6 set only inside its own process. Don't call `build_audio.main` in that same process.

### Polish pass: critic issues → outcome
| # | sev. | issue | outcome |
|---|---|---|---|
| 1 | high | `amb_fire_big` almost silent on phones (loss 9.5 dB, quieter than v1 `amb_fire`) | **Fixed.** Reproduced (9.3 dB loss from source). Re-voiced the bed: crackle +6 dB, flame flutter ×1.6, a new 1.5 kHz flame tongue, roar sub -3.5 dB, LP 6.5 kHz. Loss is now 3.5 dB; the bed is 2.1 dB louder than `amb_fire` on a phone; 2–5 kHz share 4.2 %. The check enforces both. |
| 2 | high | `sfx_collapse_soft`, `sfx_stamp`, `sfx_vault_door` vanish on phones (loss 11–13 dB) | **Fixed.** Reproduced. The collapse donks got octave "toks", a 1–2 kHz crack and a mid "flumph" body; the stamp knock moved to 720 Hz, with a longer paper slap and the thump -4 dB and shorter; the vault bolts got 1.3–2 kHz clacks and the "dunn" a 1 kHz knock. Losses are now 4.7 / 1.4 / 4.1 dB. The stamp target moved -17.5 → -18.5 so its volume stays ≤ 1 without the sub weight; it is still 8 dB louder on a phone than before. |
| 3 | medium | beds repeat identifiable events every 8 s | **Fixed.** Reproduced from the source event lists. The bank chime, stamps, coin and voices, the construction worker calls and the warehouse voice are gone. New one-shot `sfx_ticket_chime` (7 KB OGG + 16 KB MP3), with notes telling the game when to fire it, `sfx_stamp`, `sfx_coin_count` and audio2 `sfx_chatter_lo` / `sfx_hammer`. |
| 4 | medium | `bgm_city` is mostly `bgm_village` faster (82 % of slots, 15 bars, same chords and counter-line) | **Fixed.** Reproduced (`CITY_CH_A == CH_A`, `MEL_B` verbatim). New A bars 2–4 and 6–8 with 16th "traffic" answers and a D7, a new B tune on Gm7 C7 Fmaj7 Dm7 Bb C Am7-D7 Gm7-C7 with the village B only as a two-bar trumpet quote, and a new glock counter-line. Now 6 bars (the hook bars) and 36 % of slots are shared; harmony check: 0 issues; still -26.5 LUFS effective. |
| 5 | medium | `sfx_excavator` vanishes on phones (loss 17.6 dB) | **Fixed.** Reproduced. Louder whine (0.07 → 0.36) plus its 2nd harmonic, track-link rattle on the firing grid (still seamless, seam 0.08 / 0.04), chug band 300 → 420 Hz, sub -5 dB, LP 4 kHz. Loss is now 4.8 dB, phone-effective -33.8 instead of -46.6. |
| 6 | medium | integration: deferred regex, no rate control, chase → city resume | **Documented, can't fix here.** Reproduced by reading `Assets.js` / `Audio.js`. The `src` files belong to the code agents, so the exact regex, `setAmbienceRate` and the resume note are in "How the game should use them" and in the manifest notes. |
| 7 | low | hose harsh (53 % in 2–5 kHz) | **Fixed.** 2–5 kHz share is now 24 %, above 4 kHz 7.0 %, centroid 1653 Hz, level unchanged (-28 effective). |
| 8 | low | police whistle loudest on phones | **Fixed.** Target -17 → -19 (volume 0.127 → 0.101). Note added to play a single blast on repeats. |
| 9 | low | `duration` 4 decimals → `trimLoops` off by 1–2 samples | **Fixed.** Loop durations now have 7 decimals and the check asserts `round(duration*44100) == loopSamples`. Optional `trimLoops` hardening listed for the code agents. |
| 10 | low | 48 kHz playback not in QA; `bgm_city` MP3 seam 1.12 | **Fixed.** Reproduced: 1.17 in Chromium 141 at 48 kHz. The 48 kHz Chromium pass now fails above 1. `bgm_city`'s loop point is chosen with an emulated 48 kHz score: 0.148 MP3 / 0.064 OGG. |
| 11 | low | forklift retrigger 1.3 s makes the beeps limp | **Fixed (notes).** Notes, preview and demo now say 1.26 s. A separate loop file was not added (cheap note instead; payload margin). |
| 12 | low | vault sound assumes 4 fps; anim fps unspecified | **Fixed.** Found `fps=8` in `civ_assets.py`'s vault overlay. Re-timed to 8 frames at 8 fps (bolt3 on frame 3, "dunn" on frame 7 at 0.875 s; length 2.69 → 1.69 s). The notes say to scale the rate by fps / 8. |
| 13 | low | `sfx_steam_hiss` true peak -0.5 dBTP | **Fixed.** Mastered to -2.6 dBFS: true peak -1.8 dBTP, level unchanged via volume. The check warns on any true peak above -1. |
| 14 | low | `sfx_comic_fight` shouts repeat every 2.4 s | **Won't fix in audio (note added).** Reproduced (shouts at fixed cycle points). A 2–4 s cloud plays the cycle at most 1.7 times, and splitting the shouts into a group needs new game code. The note asks for a random seek and a rate of 0.95–1.05 per fight. |
| 15 | low | `sfx_box` group naming | **Kept, clarified.** The `Audio.play('sfx_box', …)` instruction is now the first integration note and is in the `sfx_box_drop` manifest note. Renaming the group would let it shadow its own member key. |
