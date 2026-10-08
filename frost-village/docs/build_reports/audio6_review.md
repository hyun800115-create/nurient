# audio6: build, critique, polish

## Polish (final)

# audio6 build report

The audio6 polish pass is finished. `assets/audio6` has all 27 contract sounds, two extra box-drop variants and one new extra, `sfx_ticket_chime`. The final `check_audio6.py` run reports `RESULT: OK` with no warnings, and two full rebuilds from an empty cache gave byte-identical files (SHA-1 of all 60 audio files plus the manifest). Every high and medium issue from the review reproduced and is fixed, except the code-side integration items: those belong to the `src` agents, so they are written out below. The full report is in `docs/build_reports/audio6.md`.

I can't listen to audio. Everything was judged from measurements, spectrograms, a phone-speaker model, a melody-against-chords check and decoding in headless Chromium at 44.1 and 48 kHz. The designer should listen before release, especially to:
- the two sirens
- the scuffle (`sfx_comic_fight`)
- the crowd voices
- the new `bgm_city` tune
- the re-voiced fire bed, collapse, stamp, vault and excavator

**What this pass changed** (details in the table at the end):
- **Phones:**
  - The fire bed, collapse, stamp, vault and excavator now lose at most 4.8 dB on a phone speaker, down from 9.5–17.6 dB.
  - The hose is less hissy and the police whistle is 2 dB quieter.
- **Beds:** the four 8-second beds no longer repeat a recognisable chime, voice or stamp every 8 s. The bank's queue chime is now its own one-shot, `sfx_ticket_chime`.
- **`bgm_city`:** it now has its own tune and chords. The village hook stays in two bars of each A section, and the village B melody survives only as a two-bar quote.
- **Vault:** `sfx_vault_door` is re-timed to the vault animation as the civic tools render it (8 frames at 8 fps).
- **QA:** the check now also tests phone loss, 48 kHz playback in Chromium, and exact `duration` values.

**Tone.** Everything stays cute and family-friendly:
- Both sirens are rounded retro toys with 0.0 % of their energy above 4 kHz.
- The big fire is a warm cartoon blaze; its crackle now carries it on a phone (1.1 % of energy above 4 kHz, low-passed at 6.5 kHz).
- The scuffle is a dust cloud of bonks, boings and tiny "hai!"s, with no pain sounds.
- The collapse tumbles down an F-major arpeggio ("donk-donk-donk") and ends with a comic "plink".

## Fragment and keys
- **Manifest:** `assets/audio6/manifest.json`, version 1. Every key has `files: ["audio6/<key>.ogg", "audio6/<key>.mp3"]`, `volume`, `loop`, `kind` and `duration`.
- **Loop fields:** loops also carry `loopSamples`, `mp3StartPad` (1105), `rotation`, and `bpm` (music), `cycles` (sirens) or `firingHz` (excavator).
- **Loop `duration`:** written as `loopSamples / 44100` to 7 decimals, so `round(duration * 44100) == loopSamples` exactly. `Audio.trimLoops` depends on this.
- **Size:** 30 keys, 60 files, **3,930,544 bytes** including the manifest (limit 4,000,000).
- **Group:** `sfx_box` = `sfx_box_drop`, `sfx_box_drop_2`, `sfx_box_drop_3`. Call `Audio.play('sfx_box', {rate: 0.92–1.1})`; `sfx_box_drop` on its own always plays box 1.
- **Name clashes:** none with `audio` … `audio5`.

### Music (stereo, F major, `kind: "music"`, loop)
Both play at **-26.5 LUFS effective**, the same as `bgm_village`.

| key | vol | length | what it is |
|---|---|---|---|
| `bgm_city` | 0.376 | 60.95 s, 126 bpm, 32 bars, A1 A2 B A3 | Busy, upbeat city theme with its own tune and chords (sections below). |
| `bgm_chase` | 0.376 | 22.86 s, 168 bpm, 16 bars | Unchanged. A comic xylophone gallop on the village hook, then a sneaky tiptoe section, then the race, and a slide whistle back to the top. |

**`bgm_city` A section:** F | Dm7 | Gm7 | C7 | F | D7 | Gm7 C7 | F.
- The village hook "A4 C5 D5 – C5 A4 C5 –" is note for note in bars 1 and 5.
- Off-beat entries get 16th-note "traffic" answers from the other lead instrument; the D7 adds a "city" twist.
- A1: marimba lead, the trumpet answers.
- A2: muted trumpet lead, the marimba answers, plus a new glockenspiel counter-line, brass stabs and a bicycle bell.
- A3: everyone together, with sleigh bells, and a tom fill back to the top.

**`bgm_city` B section:** a new flute tune on Gm7 | C7 | Fmaj7 | Dm7 | Bb | C | Am7 D7 | Gm7 C7.
- The village B melody appears only as a two-bar muted-trumpet quote over Bb | C (bars 5–6).
- A marimba hook fragment fills the bar-4 gap, and a car horn "beep-beep" (E4 + G4) leads back.

### Ambience beds (mono, `kind: "ambience"`, loop) — now texture only
| key | vol | length | what changed |
|---|---|---|---|
| `amb_fire_big` | 0.257 | 8.00 s | Crackle +6 dB, flame flutter ×1.6, a new 1.5 kHz flame "tongue", roar sub shelved -3.5 dB, low-pass 6.5 kHz. |
| `amb_construction` | 0.214 | 8.00 s | Hammering, saw, drill, clanks, far reverse beeps, gravel, rumble. **Worker calls removed.** |
| `amb_bank` | 0.193 | 7.99 s | Murmur, soft footsteps, a faint note counter, paper, hall reverb, air-con. **Chime, stamps, coin and voices removed.** |
| `amb_warehouse` | 0.207 | 8.00 s | Conveyor hum and rattle, boxes, far forklift, tape gun, pallet jack. **Voice removed.** |

### Positional loops (mono, `kind: "ambience"`, loop)
The contract calls these `sfx_*`; like audio3's `sfx_truck_engine` they ship as positional ambience loops.

| key | vol | length | notes |
|---|---|---|---|
| `sfx_siren_fire` | 0.575 | 1.99 s | Unchanged: retro "nee-naw" on D5 / A4. |
| `sfx_siren_police` | 0.531 | 2.41 s | Unchanged: toy "wee-oo", C5 → F5. |
| `sfx_hose_spray` | 0.422 | 2.40 s | Jet hiss -4 dB; splatter, wash and gloops +3 dB; a 1 kHz lift. |
| `sfx_excavator` | 0.372 | 2.00 s | Hydraulic whine 0.07 → 0.36 with its 2nd harmonic, track-link rattle on the engine's firing grid, chug band moved to 420 Hz, sub -5 dB, low-pass 4 kHz. |
| `sfx_comic_fight` | 0.569 | 2.40 s | The "pow" puffs are now a 700 Hz cloud instead of a sub thump. |

Levels before the -2 dB headroom (integrated LUFS): sirens -23 / -23.5, hose -26, excavator -27, fight -23.

### One-shots (mono, `kind: "sfx"`)
| key | vol | length | cues | notes |
|---|---|---|---|---|
| `sfx_fire_flare` | 0.372 | 1.50 s | flare 0 | |
| `sfx_steam_hiss` | 0.251 | 2.19 s | hiss 0, pop 1.95 | Mastered to -2.6 dBFS, so its true peak is -1.8 dBTP |
| `sfx_collapse_soft` | 0.724 | 2.37 s | crack .359, donk1 .539, donk2 .779, donk3 .999, flumph 1.159, plink 1.989 | Octave "toks" (phones hear C5 A4 F4), a 1–2 kHz crack, a hollow mid "flumph" |
| `sfx_demolish_crunch` | 0.617 | 1.46 s | bite 0, pour .18 | |
| `sfx_coin_count` | 0.343 | 1.35 s | first 0, ching .72 | |
| `sfx_stamp` | 0.966 | 0.29 s | thunk 0 | 720 Hz desk knock, longer paper slap, 95 Hz thump 4 dB down and shorter; target moved -17.5 → -18.5 |
| `sfx_vault_door` | 0.716 | 1.69 s | spin 0, bolt1 .25, bolt2 .31, bolt3 .375, swing .4, open .875, sparkle .94 | Timed to 8 frames at 8 fps; bright bolt clacks and a 1 kHz knock in the "dunn" |
| `sfx_forklift_beep` | 0.119 | 1.28 s | beep1 0, beep2 .42, beep3 .84 | |
| `sfx_police_whistle` | 0.101 | 1.25 s | blast1 0, blast2 .3 | 2 dB quieter |
| `sfx_crowd_gasp` | 0.385 | 1.40 s | — | |
| `sfx_crowd_cheer_small` | 0.288 | 2.29 s | — | |
| `sfx_cuffs_click` | 0.794 | 0.39 s | ratchet 0, latch .19 | |
| `sfx_fire_alarm_bell` | 0.182 | 2.40 s | ring1 0, ring2 1.15 | |
| `sfx_moving_truck` | 0.767 | 2.50 s | brake .5, door .9, doorTop 1.6, ramp 1.8, rampDown 2.2 | |
| `sfx_box_drop` / `_2` / `_3` | 0.871 / 0.851 / 0.912 | 0.24 / 0.24 / 0.30 s | — | `_2` and `_3` are extras in group `sfx_box` |
| `sfx_newspaper` | 0.733 | 0.71 s | fwap .157 | |
| `sfx_ticket_chime` | 0.263 | 1.24 s | ding 0, dong .34 | **New extra:** the bank's number display, a soft "ding-dong" (C6 → A5) |

**Extra manifest fields** (the game ignores them): `cues`, `notes` (usage text per key), `bars`, `meter`, `tonality`, `rotation`, `cycles`, `firingHz`.

## How the game should play them (the `src` changes are for the code agents)
- **Boxes:** `Audio.play('sfx_box', {rate: 0.92 + Math.random() * 0.18})`, throttled to about 120 ms.
- **Loading:** add `'audio6'` to `FRAGMENTS` in `src/core/Assets.js`.
- **Deferred loading:** without this change, about 1.2 MB is downloaded and about 30 MB of audio decoded before the title screen. Change it to exactly:
  ```js
  isDeferredAudio(key) { return /^(bgm_(village|city|chase)|amb_|sfx_lute|sfx_(siren_fire|siren_police|hose_spray|excavator|comic_fight)$)/.test(key) || V3_SFX.test(key); }
  ```
- **Loop rate:** add the following; without it, play everything at rate 1.
  ```js
  setAmbienceRate(key, r) { const s = this.amb[key]; if (s) try { s.setRate(r); } catch (e) { /* */ } }
  ```
- **trimLoops (optional):** prefer `want = a.loopSamples ? Math.round(a.loopSamples * rate / 44100) : Math.round(a.duration * rate)`.
- **Music:**
  - `playMusic('bgm_city')` in the city by day; `bgm_chase` during a chase.
  - When the chase ends, resume `bgm_city` from where it paused, not bar 1.
- **Beds:**
  - `amb_bank` and `amb_warehouse` follow the cutaway reveal amount (0 → 1) or camera distance.
  - `amb_construction` follows distance to a building site.
  - `amb_fire_big` follows distance × fire size.
  - Add life with audio2 `sfx_chatter_lo` / `sfx_hammer` one-shots at random 6–20 s intervals.
- **Fire:**
  1. Alarm bell + crowd gasp.
  2. `sfx_fire_flare` when flames burst out.
  3. `sfx_siren_fire` loop until about 1 s after arrival (rate 1.03 → 0.97 as it passes is a cute Doppler).
  4. audio3 brakes + door on arrival.
  5. `sfx_hose_spray` loop while spraying (optionally duck it to 0.75 while `amb_fire_big` is above 0.5).
  6. `sfx_steam_hiss` as the fire goes out (fade the fire bed over it).
  7. Small cheer.
  8. If the building is lost, `sfx_collapse_soft`, and swap to the ruin sprite on the `flumph` cue (1.16 s).
- **Rebuild:** excavator loop at rate 0.85 idle / 1.0 working / 1.12 while digging; `sfx_demolish_crunch` on the bucket's contact frame; `amb_construction` during the rebuild; then audio2 `sfx_build_done`.
- **Bank:**
  - `sfx_ticket_chime` when the queue advances.
  - Coins for deposits and interest; stamp for loans and passbook entries.
  - `sfx_vault_door` on frame 0 of `anims.vault`. If the animation runs at another fps, play the sound at rate fps / 8.
- **Logistics:**
  - Forklift beep retriggered every **1.26 s** (3 × 0.42 s) while reversing.
  - `sfx_box` for boxes; stamp + coins at the settlement counter; `sfx_moving_truck` on the unload animation.
- **Police:**
  1. Whistle (play only the first blast for repeats nearby).
  2. `sfx_siren_police` loop during the chase.
  3. `sfx_comic_fight` loop while the dust cloud is up (2–4 s), starting at a random position with rate 0.95–1.05.
  4. Cuffs, and start the arrested walk on the `latch` cue.
  5. Small cheer.
- **Newspaper:** `sfx_newspaper` when the morning paper opens.

## QA (`docs/previews/audio6_report.txt`)
- **Levels:**
  - Every sample peak is -1.0 dBFS or lower and every true peak -1.0 dBTP or lower (the check now warns above that). DC offset is under 0.0003.
  - Every key's in-game level is on target: exactly for the OGG, within 0.5 dB for the MP3.
- **Phone-speaker check (new):**
  - Model: high-pass 500 Hz (4th order) plus low-pass 9 kHz. For loops it uses the integrated loss; for one-shots, the worse of integrated and loudest-moment loss.
  - Fail line is 6 dB. Every key passes; the worst is 4.8 dB.

  Before → after:

  | key | loss | phone-effective level |
  |---|---|---|
  | `amb_fire_big` | 9.5 → 3.5 dB | -41.5 → -35.5 LUFS (v1 `amb_fire`: -37.6) |
  | `sfx_excavator` | 17.6 → 4.8 dB | -46.6 → -33.8 LUFS |
  | `sfx_collapse_soft` | 11.2 → 4.7 dB | -30.0 → -22.8 Mmax |
  | `sfx_vault_door` | 12.0 → 4.1 dB | -31.4 → -23.1 Mmax |
  | `sfx_stamp` | 12.9 → 1.4 dB | -30.1 → -21.8 Mmax |

  - The fire bed is now 2.1 dB louder than the v1 campfire on a phone; before, it was 3.8 dB quieter. The check fails if it is quieter again.
  - On a phone the hose now sits 7 dB above the fire bed, down from 13 dB.
- **Pitch:**

  | sound | note | error |
  |---|---|---|
  | fire siren, low tone | A4 | +1.1 cents |
  | forklift beep | C6 | +1.8 cents |
  | alarm bell | A5 | +0.8 cents |
  | coin "ching" | F6 | +0.1 cents |
  | ticket chime "ding" | C6 | +0.1 cents |
  | police whistle | C7 | -1.7 cents |

- **Cue timing:** every percussive cue is within 8 ms of a detected onset, including the re-timed vault cues and the chime. The one exception is the collapse `crack`, where the detector fires 23 ms early on the creak just before it.
- **Loop seams:** no click at any wrap (fail line 1, OGG / MP3).

  | loop | hf | d2 |
  |---|---|---|
  | bgm_city | .014 / .022 | .065 / .070 |
  | bgm_chase | .25 | .24 / .23 |
  | four beds | .06–.21 | .02–.27 |
  | excavator | .03 / .02 | .08 / .04 |
  | fight | .24 | .11 / .04 |
  | hose | .36 | .25 |
  | police siren | .52 / .55 | .56 / .04 |
  | fire siren | .65 / .63 | .43 / .18 |

  OGG end padding is 0 for all 11 loops. `amb_construction` needed `fit_loop`'s grid-of-64 fallback (+96 samples).
- **Chromium 141:**
  - At 44.1 kHz, both formats of every loop decode to exactly `loopSamples`; seam ratios are 0.02–0.55.
  - New 48 kHz pass (what phones run at): seam ratios are 0.03–0.54.
  - `bgm_city`'s MP3 reproduced the critic's finding at 48 kHz (1.17). The build now tries ten loop-point positions, scores each with an emulated 48 kHz decode, and keeps the loop point 8 ms before the downbeat: 0.148 MP3 / 0.064 OGG.
- **Friendliness** (energy above 4 kHz / spectral centroid):

  | sound | above 4 kHz | centroid |
  |---|---|---|
  | fire siren / police siren | 0.0 % | 719 / 643 Hz |
  | alarm bell | 0.0 % | 911 Hz |
  | forklift beep | 0.0 % | 1070 Hz |
  | whistle | 0.6 % | 2100 Hz |
  | big fire | 1.1 % | 515 Hz |
  | hose | 7.0 % (was 16.4 %) | 1653 Hz (was 2543) |

  In the 2–5 kHz band, the hose fell from 53 % to 24 % of its energy and the fire rose from 0.7 % to 4.2 %.
- **Melody:** every `bgm_city` strong-beat note is a chord tone, and every other note is in F major or its own chord. `bgm_chase` keeps one intended chromatic passing note (B4).
- **Similarity to `bgm_village`:** identical bars 15 → 6 (the hook bars only); matching eighth-note slots 82 % → 36 %; A chords 4 of 8, B chords 3 of 8 and counter-line 1 of 8 now match.
- **Rebuild:** two clean rebuilds were byte-identical.
- **Preview page:** at 390 × 844 in headless Chromium, all six scene buttons start the right loops, all 37 card sounds decode, there are no console errors and no horizontal scroll.

## Files
All in `/home/user/nurient/frost-village/`:
- **Scripts:**
  - `tools/audio/sfx6.py`
  - `tools/audio/music6.py`
  - `tools/audio/build_audio6.py`
  - `tools/audio/check_audio6.py`
  - They only import the existing toolkit; nothing else was edited.
- **Assets:** `assets/audio6/` (manifest + 60 files).
- **Report:** `docs/build_reports/audio6.md`
- **Previews in `docs/previews/`:**
  - `audio6_waveforms.png`
  - `audio6_demo.mp3` (76 s: morning city → bank with the queue chime → warehouse → fire, sirens, hose, steam, cheer → thief chase → whistle, cuffs → newspaper)
  - `audio6_report.txt`
  - `audio6_preview.html`
- **Rebuild:** `python3 tools/audio/build_audio6.py` (about 4–5 min). The cache is `/tmp/fv_cache/audio6`.

## Known issues
- **Not listened to.** Every sound was checked by measurement only.
- **`src` changes are still needed** (deferred loading, `setAmbienceRate`, resuming `bgm_city` after a chase). Until they land, the five positional loops are decoded before the title and rates can't be changed.
- **Vault frame rate is assumed.** The 8 fps comes from `tools/blender/civ_assets.py`; the civic manifest isn't published yet. If its fps differs, scale the playback rate.
- **Bed textures still cycle.** The beds' soft texture events (footsteps, hammering, boxes) still come round every 8 s, but none is an identifiable one-off. Keep the beds driven by distance or reveal.
- **The scuffle's two tiny shouts sit at fixed points** in its 2.4 s cycle.
- **Small payload margin:** about 69 KB left under 4 MB.
- **Alarm bell:** `ring2` is a design time, not a detectable onset, because the second burst starts while the first still rings.
- **Other machines:** exact loop lengths depend on the libvorbis build, so rebuild and re-check there.

## Critic issues → outcome
| # | sev. | issue | outcome |
|---|---|---|---|
| 1 | high | `amb_fire_big` nearly silent on phones | **Fixed.** Loss 9.5 → 3.5 dB; now louder than the v1 campfire on a phone, and the check enforces both. |
| 2 | high | collapse / stamp / vault lost on phones | **Fixed.** Losses 11.2 / 12.9 / 12.0 → 4.7 / 1.4 / 4.1 dB. Without the sub weight the stamp couldn't reach -17.5 at volume ≤ 1, so its target is now -18.5; it is still 8 dB louder on a phone than before. |
| 3 | medium | beds repeat identifiable events every 8 s | **Fixed.** Chime, voices, stamps and coin removed from the beds; new `sfx_ticket_chime` (7 KB OGG + 16 KB MP3); manifest notes say which one-shots the game fires instead. |
| 4 | medium | `bgm_city` is mostly `bgm_village` sped up | **Fixed.** New A bars, a new B on its own chords, a new counter-line; only the hook bars and a two-bar quote are shared. Still -26.5 LUFS effective. |
| 5 | medium | excavator lost on phones | **Fixed.** Loss 17.6 → 4.8 dB; still seamless. |
| 6 | medium | `src` integration (deferred regex, rate control, chase → city resume) | **Can't fix here.** The `src` files belong to the code agents; the exact strings are in the report and the manifest notes. |
| 7 | low | hose too hissy | **Fixed.** 2–5 kHz share 53 % → 24 %; same level. |
| 8 | low | whistle the loudest sound on phones | **Fixed.** -2 dB (volume 0.127 → 0.101), plus a "single blast for repeats" note. |
| 9 | low | `duration` precision breaks `trimLoops` | **Fixed.** 7 decimals, asserted by the check. |
| 10 | low | 48 kHz not covered; `bgm_city` MP3 seam 1.12 | **Fixed.** Reproduced at 1.17; the new 48 kHz check and loop-point selection bring it to 0.148. |
| 11 | low | forklift beeps limp at a 1.3 s retrigger | **Fixed (notes, preview, demo):** retrigger every 1.26 s. I didn't add a separate loop file because the payload margin is small. |
| 12 | low | vault timing assumes about 4 fps | **Fixed.** The civic tools render 8 fps, so the sound is re-timed: "dunn" on frame 7 at 0.875 s; length 2.69 → 1.69 s. |
| 13 | low | steam hiss true peak -0.5 dBTP | **Fixed.** Now -1.8 dBTP; the check warns above -1. |
| 14 | low | scuffle shouts repeat every 2.4 s | **Won't fix in audio.** A 2–4 s cloud repeats them at most once, and splitting them out would need new game code; a random seek / rate note was added instead. |
| 15 | low | `sfx_box` group naming | **Kept and clarified.** The `Audio.play('sfx_box')` instruction now leads the integration notes and the manifest note; renaming the group would let it shadow its own member key. |

## Critique

```json
[
 {
  "verdict": "polish",
  "summary": "I re-measured audio6 independently: LUFS and true peak for all 58 files against every earlier audio folder, a crude phone-speaker model (4th-order high-pass at 500 Hz plus low-pass at 9 kHz), band shares, loop seams in OGG and MP3, decode lengths in Chromium 141 at 44.1 kHz and 48 kHz, spectrograms, heads and tails, periodicity of the loops, and the note data. All evidence is in /tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v8_audio6_critic_audio/ (levels.log, probe.log, phone_loss.png, beds.png, sirens.png, bells.png, crowd.png, wraps.png, chrome/dec.log).\n\nThe engineering holds up. Levels match the house conventions: music at -26.5 LUFS effective, the same as bgm_village; beds at -32 to -34.5; one-shots at -18.5 to -22 Mmax. Every sample peak is -1 dBFS or lower. All 22 loop files decode to exactly loopSamples in Chromium and in ffmpeg, and no wrap clicks. The sirens are band-limited, show no aliasing, and are not piercing (1.0 % and 0.4 % of their energy in 2-5 kHz).\n\nThree things should be fixed before the designer judges this on a phone:\n1. The key sounds of the fire and bank story are almost entirely below 300 Hz, so a phone speaker drops most of them. On a phone they are the quietest sounds in the whole catalogue, and on a phone `amb_fire_big` is 3.8 dB quieter than the small v1 campfire.\n2. The four 8 s beds repeat recognisable events every 8.0 s: the bank's 'ding-dong' chime, a construction worker's calls and a warehouse voice.\n3. `bgm_city` is mostly `bgm_village` played faster: 82 % of its eighth-note slots are identical, 15 of 32 bars are identical, and the chords, form and counter-melody are the same.\n\nThe rest are small integration and metadata fixes.",
  "issues": [
   {
    "severity": "high",
    "area": "amb_fire_big (fire scene on phone speakers)",
    "problem": "On a phone, the big-fire bed is almost silent, quieter than the small v1 campfire and buried under the hose. 88.2 % of its energy is below 300 Hz, and only 0.7 % is in 2-5 kHz (`amb_fire` has 6.1 %). The crackle that makes fire read as fire on a small speaker was turned down to avoid 'scary highs'. The burning scene the designer asked for will sound like distant rumble while the hose and siren dominate.",
    "evidence": "levels.log and phone_loss.png: phone loss -9.5 dB, so `amb_fire_big` lands at -41.5 LUFS phone-effective. `audio/amb_fire` is at -37.7 and `amb_town` at -37.0. The 3rd-quietest ambience-type loop in the catalogue. Full-range it is 1 dB louder than `amb_fire` (-32.0 vs -33.0). `sfx_hose_spray` is at -28.3 on a phone, 13 dB above the fire. probe.log bands: amb_fire_big <300 Hz 88.2 %, 2-5k 0.7 %, >5k 0.2 %; amb_fire 81.3 / 6.1 / 4.1 %. Source: sfx6.py render_fire_big, bed mix about lines 339-345 (roar 0.25, flame 0.08, hiss 0.012).",
    "fix": "Re-voice the bed so the crackle carries it on a phone, while staying cosy:\n- Raise the crackle and snap layer about 6 dB, aiming for a 2-5 kHz share of 4-6 % like amb_fire. Keep the snaps rounded with LP at about 6 kHz and no harsh hiss.\n- Raise the 850 Hz flame flutter band 2x.\n- Shelve the roar below 150 Hz down 3-4 dB.\n- Re-target the volume so full-range stays at about -32 LUFS effective, but the phone-weighted level is at least that of amb_fire (≥ -37.5).\n- Add a phone-weighted check to check_audio6.py: high-pass at 500 Hz, 4th order, then LUFS. Fail if a loop's or one-shot's phone loss is more than 6 dB, or if amb_fire_big is quieter on a phone than amb_fire."
   },
   {
    "severity": "high",
    "area": "sfx_collapse_soft, sfx_stamp, sfx_vault_door (phone translation)",
    "problem": "These are the climaxes and feedback sounds of the fire and bank stories, and they are almost entirely sub-300 Hz:\n- The collapse donks are tuned C4, A3 and F3 (262, 220 and 175 Hz).\n- The stamp is a 240→95 Hz blip plus a 310 Hz knock.\n- The vault bolts are 160-190 Hz clanks plus 120→55 Hz blips.\n\nOn a phone the intended hierarchy flips. The frequent `sfx_police_whistle` plays at -19.0 phone-effective, while the 'building is lost' collapse is at -30.0, 11 dB lower. The stamp that confirms every loan and settlement drops to a faint tick next to `sfx_coin_count` (-20.3).",
    "evidence": "levels.log and phone_loss.png, phone-weighted effective Mmax: `sfx_vault_door` -31.4 (loss -12.0 dB), `sfx_stamp` -30.1 (-12.9), `sfx_collapse_soft` -30.0 (-11.2). These are 3 of the 5 quietest sfx in all six folders, against a median loss of -1.6 dB for earlier sfx. Share of energy below 300 Hz (probe.log): stamp 90.4 %, vault 90.8 %, collapse 89.3 %. Sources in sfx6.py: line 457 (donks C4 A3 F3), line 697 (`wood_knock(r, 310…)`), line 724 (`steel_clank(r, 160+15k…)`).",
    "fix": "Keep the low weight but give each sound a 0.6-3 kHz body:\n- **Collapse:** tune the donks an octave up (C5 A4 F4), or keep them and add a harmonic 2x 'tok' partial at 0.5 gain so the falling F-major arpeggio still reads on phones. Add a 1-2 kHz woody crack.\n- **Stamp:** move the knock to about 650-800 Hz and lengthen the 1.9 kHz paper-slap band from 0.05 to 0.08 s. Keep the 95 Hz thump at -4 dB.\n- **Vault:** give each bolt a 1.2-2.5 kHz metallic 'clack' partial, and add a 1 kHz knock to the final 'dunn'.\n- Re-level to the same full-range Mmax targets. Re-run the onset check for the bolt and donk cues.\n- Target a phone loss of 6 dB or less, enforced by the check proposed above."
   },
   {
    "severity": "medium",
    "area": "amb_bank / amb_construction / amb_warehouse (8 s beds)",
    "problem": "The beds are 8 s long, where earlier beds run 14-46 s, but each one contains recognisable one-off events that now repeat exactly every 8.0 s:\n- **Bank:** the number-ticket 'ding-dong' (C6 A5), two stamps, two note-counter 'brrrt's, a coin and 5 voices.\n- **Construction:** two worker calls (the second sits exactly at the loop end).\n- **Warehouse:** a voice.\n\nWhile the designer watches the bank cutaway, the bank will 'call the next number' every 8 s whatever its queue is doing. The texture parts (murmur, hum, roller rattle) loop fine at 8 s.",
    "evidence": "beds.png (two tiles, 16 s): identical chime partials (2.8 / 5.6 kHz) and identical voice formant ladders recur 8.0 s apart. probe.log: amb_bank envelope autocorrelation is 0.41 at 7.84 s. Sources in sfx6.py: `_bank_events` lines 636-647 (ding-dong at 3.6*k9, stamps, voices); `_construction_events` line 570 (worker calls at 6.0 and 9.0*k9 = 8.0 s); `_warehouse_events` line 766 (voice). Build report, 'Short beds': cut to 8 s to stay under a self-chosen 4 MB budget. `assets/audio` is already 4.97 MB, and no contract sets 4 MB.",
    "fix": "Take the identifiable events out of the beds and let the game trigger them, which also frees bytes:\n- **Bank:** keep the murmur, footsteps-free air, HVAC and a faint counter. Add a ~15 KB one-shot `sfx_ticket_chime` played when a teller calls the next customer. Fire `sfx_stamp`, `sfx_coin_count` and audio2 `sfx_chatter_lo` on bank events.\n- **Construction:** drop the worker calls and fire audio2 `sfx_chatter_lo` / `sfx_hammer` at random 6-20 s intervals.\n- **Warehouse:** drop the voice.\n\nIf you prefer to keep the events baked in, lengthen the three beds to 16 s or more and space each identifiable event at least 12 s apart, raising the budget to about 4.5 MB."
   },
   {
    "severity": "medium",
    "area": "bgm_city melodic identity (music6.py)",
    "problem": "The contract asks for the 'same melodic family', but `bgm_city` is essentially `bgm_village` at 126 instead of 100 bpm with new instruments:\n- Same form (A1 A2 B A3, 32 bars).\n- Identical chord progression in A and B.\n- The village B melody verbatim.\n- The village glockenspiel counter-melody (COUNTER_A3).\n- The village turnaround.\n\nThe village B melody is now in three themes: village, beach (audio5) and city. Walking from the village into the city would sound like the same song sped up, not a new 'living city' theme. bgm_harbor shows the house can keep the family with a new B and C.",
    "evidence": "Note-data comparison (run in this review): 211 of 256 eighth-note slots (82 %) and 15 of 32 bars are identical to bgm_village; `CITY_CH_A == music.CH_A` and `CITY_CH_B == music.CH_B` are both True. Sources in music6.py: line 199 (`CITY_SECTIONS` uses `MEL_B`), line 286 (`COUNTER_A3[i][half]`). In music5.py, `B_MEL` is the same village B.",
    "fix": "Keep the family markers: F major, the hook 'A4 C5 D5 – C5 A4 C5 –' verbatim in bars 1 and 5, and the marimba/trumpet palette.\n- Rewrite A bars 2-4 and 6-8 with a city rhythm, such as syncopated 16th pickups or a trumpet/marimba 'traffic' call-and-response.\n- Replace B with a new 8-bar section on its own progression, for example Gm7 | C7 | Fmaj7 | Dm7 | Bb | C | Am7 D7 | Gm7 C7. Quote the village B only as a 2-bar trumpet call-back.\n- Write a new glockenspiel counter-line.\n- Re-run the chord-tone check and loudness match (-26.5 LUFS effective)."
   },
   {
    "severity": "medium",
    "area": "sfx_excavator (phone translation)",
    "problem": "The excavator loop vanishes on a phone. 95.8 % of its energy is below 300 Hz (68 Hz diesel tone, 420 Hz LP pops). The hydraulic whine that should carry it sits at 0.07 gain, about -25 dB. During the rebuild, only `sfx_demolish_crunch` will be heard.",
    "evidence": "levels.log: phone-effective -46.6 LUFS, a loss of -17.6 dB. That is the quietest and most phone-lossy loop in the catalogue, worse than audio3 `sfx_truck_engine` (-14.1). probe.log: <300 Hz 95.8 %, 0.5-2 kHz 1.1 %. Source: sfx6.py line 503 (`0.07 * whine`).",
    "fix": "Raise the whine to about 0.2 and give it a 2nd harmonic at 0.5. Add a 1-2.5 kHz track-link rattle locked to the firing grid (whole cycles per loop, so it stays seamless). Keep a toy feel with LP at 4 kHz. Aim for a phone loss of 6 dB or less, with the full-range effective level still -29 LUFS."
   },
   {
    "severity": "medium",
    "area": "integration notes for code agents (src/core/Assets.js, Audio.js)",
    "problem": "Preload loads every key that `isDeferredAudio` does not match before the title appears (Preload.js line 30). The current regex `^(bgm_village|amb_|sfx_lute)` does not match `bgm_city`, `bgm_chase` or the five `sfx_*` loops. Adding 'audio6' to FRAGMENTS as the report says would download about 1.2 MB and decode about 30 MB of PCM before the title. Also, `setAmbience` has no rate or seek control, so the report's excavator rates (0.85 / 1.0 / 1.12) and siren Doppler cannot be applied as written.",
    "evidence": "src/core/Assets.js line 241 (`isDeferredAudio`) and src/scenes/Preload.js line 30 (`musicFilter`). src/core/Audio.js `updateAmbience` only sets volume.",
    "fix": "Code agents:\n- Extend the deferred regex to `^(bgm_(village|city|chase)|amb_|sfx_lute|sfx_(siren_fire|siren_police|hose_spray|excavator|comic_fight)$)`, or load the two city tracks on first entry to the city.\n- Expose `Audio.setAmbienceRate(key, r)` that calls `this.amb[key].setRate(r)`.\n- When returning from `bgm_chase`, resume `bgm_city` from its saved seek instead of bar 1.\n\nAudio builder: list these exact strings in the report so they are not missed."
   },
   {
    "severity": "low",
    "area": "sfx_hose_spray balance",
    "problem": "The hose is the harshest continuous loop in the set: 53.3 % of its energy is in 2-5 kHz, with a 2.5 kHz centroid. It runs for the whole firefight at -28 LUFS effective and loses only 0.3 dB on a phone, so on phones it sits about 13 dB above the fire bed.",
    "evidence": "probe.log bands for sfx_hose_spray: 2-5k 53.3 %, >5k 6.8 %. levels.log: phone-effective -28.3 vs amb_fire_big -41.5. check report: 16.4 % of energy above 4 kHz, centroid 2543 Hz.",
    "fix": "Shift the hose balance toward water hitting the wall: splatter and gloops at 0.5-1.5 kHz up about 3 dB, jet hiss at 2-5 kHz down about 4 dB, aiming for a 2-5 kHz share of 35 % or less. Then re-level to -28 LUFS. Or let the code duck the hose to 0.75 while `amb_fire_big` is above 0.5."
   },
   {
    "severity": "low",
    "area": "sfx_police_whistle level",
    "problem": "The pea whistle is centred at 2.1 kHz, the ear's and phone speakers' most sensitive region. It loses nothing on a phone, so it is the loudest audio6 sound there, and it recurs on every scuffle and theft.",
    "evidence": "levels.log: full-range effective Mmax -19.0, phone-effective -19.0. audio5 `sfx_lifeguard_whistle` is at -20.0. The stamp and collapse are at -30 on a phone.",
    "fix": "Lower the volume from 0.127 to 0.10 (-2 dB, about -21 Mmax), the same class as the forklift beep and chatter. Or let the code play a single blast (cut at the `blast2` cue) for repeat incidents."
   },
   {
    "severity": "low",
    "area": "manifest duration precision vs Audio.trimLoops",
    "problem": "`duration` is written with 4 decimals. Audio.js trimLoops (the path for Safari when it ignores the MP3 gapless header) computes `want = round(duration*rate)`, so the trimmed loops come out 1-2 samples off. The siren, hose, excavator and fight loops are +2: two padding samples are spliced into the wrap of steady tones. The same rounding exists in audio..audio5, but audio6's short tonal loops are the most exposed.",
    "evidence": "probe.log trimLoops emulation: sfx_siren_fire 1.9897 → 87746 vs loopSamples 87744 (+2); sfx_hose_spray, sfx_excavator and sfx_comic_fight +2; bgm_chase -2; bgm_city -1. Source: build_audio6.py line 282 (`round(m['duration'], 4)`).",
    "fix": "In build_audio6.py, write `duration` as `loopSamples/44100` rounded to 7 decimals, so `round(duration*44100) == loopSamples` (assert it in check_audio6). Ask the code agents to make trimLoops prefer `a.loopSamples * rate / 44100` when it is present."
   },
   {
    "severity": "low",
    "area": "48 kHz playback (phones) not covered by QA",
    "problem": "The Chromium check decodes only into a 44.1 kHz OfflineAudioContext. Phones (iOS especially) usually run the context at 48 kHz, where the decoded loop length is fractional and gets truncated. At 48 kHz the `bgm_city` MP3 seam ratio is 1.12, above the house fail line of 1. Every other file is 0.54 or below.",
    "evidence": "chrome/dec.log (Chromium 141): bgm_city mp3 44.1k seam 0.74; at 48k n=2925783 (ideal 2925783.95) seam 1.12. bgm_city ogg 48k seam 0.53. Sirens 0.23-0.54.",
    "fix": "Add a 48 kHz pass to check_audio6. For `bgm_city`, pick the loop length among the fit_loop candidates whose MP3 seam stays below 1 after 48 kHz resampling, or nudge the rotation and fold so the wrap lands in a quieter, smoother spot. No change is needed for the other loops."
   },
   {
    "severity": "low",
    "area": "sfx_forklift_beep cadence",
    "problem": "The file holds three beeps 0.42 s apart. The suggested retrigger every 1.3 s makes the gap across retriggers 0.46 s, so the reverse alarm limps (0.42, 0.42, 0.46). The game loop adds about ±17 ms of jitter on top.",
    "evidence": "manifest cues beep1 0, beep2 0.42, beep3 0.84; build report: 'about every 1.3 s while a forklift reverses'.",
    "fix": "Tell the code to retrigger every 1.26 s (3 × 0.42). Better, ship a 0.84 s loopable two-beep `sfx_forklift_beep_loop` (kind ambience, about 8 KB) and drive it with setAmbience by distance while reversing."
   },
   {
    "severity": "low",
    "area": "sfx_vault_door vs anims.vault (8 frames, fps unspecified)",
    "problem": "The sound assumes about 4 fps. At 4 fps the 8-frame door animation ends at 2.0 s, but the 'open' thud lands at 2.147 s and the sparkle at 2.197 s, after the last frame.",
    "evidence": "CONTRACT_V8 §AB: 'vault with anims.vault round door 8 f' (no fps). manifest cues: swing 1.247, open 2.147.",
    "fix": "Agree a frame rate with the civic agent: 8 frames at about 3.7 fps puts the last frame at 2.15 s. Otherwise re-time `open` to 1.95 s and `sparkle` to 2.0 s, and state the assumed fps in the manifest notes."
   },
   {
    "severity": "low",
    "area": "sfx_steam_hiss true peak",
    "problem": "The OGG's true peak is -0.5 dBTP, the highest in the whole audio catalogue (earlier maximum -0.8). The report says 'every file peaks at -1.0 dBFS or lower'; that holds for sample peak only.",
    "evidence": "levels.log: sfx_steam_hiss tp -0.5 (sample peak -1.0).",
    "fix": "Limit this file to -1.5 dBFS sample peak, or use a -1 dBTP true-peak ceiling, then re-level with volume (≈0.23)."
   },
   {
    "severity": "low",
    "area": "sfx_comic_fight loop repetition",
    "problem": "The 2.4 s loop contains two voiced shouts ('hai!', 'ya!') and a squeak at fixed times. A 4 s dust cloud plays them twice, exactly 2.4 s apart, and `setAmbience` resumes from wherever the loop phase was left.",
    "evidence": "crowd.png (identical boing/squeak shapes per cycle). probe.log envelope autocorrelation 0.41 at 0.42 s; manifest duration 2.4004.",
    "fix": "Code: start each fight at a random `seek` and rate between 0.95 and 1.05. Or audio: take the two shouts out of the loop and fire them as a tiny one-shot group at random times."
   },
   {
    "severity": "low",
    "area": "audioGroups naming (sfx_box)",
    "problem": "The contract key `sfx_box_drop` always plays variant 1. Code only gets variation if it knows to call the group `sfx_box`.",
    "evidence": "manifest audioGroups `{\"sfx_box\": [\"sfx_box_drop\", \"sfx_box_drop_2\", \"sfx_box_drop_3\"]}`. Audio.play resolves the group first and then plays the member key directly (src/core/Audio.js `play`).",
    "fix": "Either keep it and put the instruction `Audio.play('sfx_box', {rate: 0.92-1.1})` at the top of the integration notes, or rename the group to `sfx_box_drop`. A group that includes its own name is safe with this Audio.play (no recursion), but check_audio6's 'group equals key' rule would then need to allow it within the same fragment."
   }
  ],
  "keep": [
   "Loudness calibration against the house: both music loops are exactly -26.5 LUFS effective like bgm_village, beds -32 to -34.5, positional loops -25 to -29, one-shots -18.5 to -22 Mmax; every sample peak is -1.0 dBFS or lower and DC is negligible (levels.log). Keep the volumes as they are except the police whistle.",
   "Loop engineering: OGG end padding 0. ffmpeg and Chromium 141 decode all 22 loop files to exactly `loopSamples` at 44.1 kHz (chrome/dec.log). Wraps are click-free in both codecs: seam d2 ratio 0.55 or less, sirens continuous (wraps.png). Rotation puts the wraps at quiet spots.",
   "Siren design: polyBLEP and additive band-limited oscillators with no visible aliasing (sirens.png). 2-5 kHz share is 1.0 % / 0.4 % and phone loss only about 2.9 dB, so they are rounded and not piercing yet still audible. D5/A4 and C5-F5 are diatonic to F major, so they sit inside bgm_city and bgm_chase. Cycle timing is derived from L, so every half-cycle is equal.",
   "bgm_chase as written: the village hook (A C D C A C D F) as a 168 bpm xylophone gallop, F major / D minor. The tiptoe bars are only about 1.6 dB under the A section (per-bar -16.5 to -19.9 LUFS), so the energy never drops out. Never dark; good stereo mono-compatibility (L/R correlation 0.970).",
   "Pitch accuracy (all within 2 cents) and cue accuracy (percussive cues within 8 ms of detected onsets).",
   "Phone-robust one-shots (phone loss 2.3 dB or less): sfx_fire_alarm_bell, sfx_forklift_beep, sfx_coin_count, sfx_cuffs_click, sfx_box_drop 1-3, sfx_steam_hiss (level aside), sfx_newspaper, sfx_fire_flare.",
   "Click-free heads and tails on every one-shot in both codecs: the last 10 ms is -65 dB or lower relative to peak (probe.log).",
   "Manifest schema matches audio..audio5 (files ordered ogg then mp3, volume/loop/kind/duration, loopSamples, mp3StartPad 1105, rotation, cues, notes). No key or group collisions. The five positional loops are mono with kind 'ambience', like audio3 sfx_truck_engine.",
   "Music stereo image matches its siblings (bgm_city side/mid -15.5 dB, the same as bgm_harbor and bgm_beach).",
   "Deterministic, byte-identical rebuild and the strict check_audio6 harness; extend it with the phone-weighted and 48 kHz passes rather than replacing it."
  ]
 }
]
```

## Build

AUDIO6 (CONTRACT_V8 §AE) is done: all 27 contract sounds plus two extra box-drop variants are in `assets/audio6`, and `check_audio6.py` reports `RESULT: OK`. I can't listen to audio, so I judged everything from measurements, spectrograms, a melody-against-chords check and headless Chromium decoding. The designer should listen before release, especially to the two sirens, the cartoon scuffle, the crowd voices and both music loops.

**Fragment**
- Manifest: `assets/audio6/manifest.json`, version 1. 29 keys, 58 files, each with `files: ["audio6/<key>.ogg", "audio6/<key>.mp3"]`, `volume`, `loop`, `kind` and `duration`.
- Loops also carry `loopSamples`, `mp3StartPad` (1105) and `rotation`; one-shots carry `cues` (seconds from the start of the file) and `notes`.
- One group: `sfx_box` = `sfx_box_drop`, `sfx_box_drop_2`, `sfx_box_drop_3`. No key or group clashes with `audio` … `audio5`.
- Payload is 3,929,456 bytes (limit 4,000,000).

**Keys, kinds, volumes**

| kind | key | volume | length |
|---|---|---|---|
| music (stereo, loop) | `bgm_city` | 0.376 | 60.95 s, 126 bpm |
| music (stereo, loop) | `bgm_chase` | 0.376 | 22.86 s, 168 bpm |
| ambience (mono, loop) | `amb_fire_big` | 0.254 | 8.0 s |
| ambience (mono, loop) | `amb_construction` | 0.216 | 8.0 s |
| ambience (mono, loop) | `amb_bank` | 0.193 | 8.0 s |
| ambience (mono, loop) | `amb_warehouse` | 0.207 | 8.0 s |
| ambience (positional loop) | `sfx_siren_fire` | 0.575 | 1.99 s |
| ambience (positional loop) | `sfx_siren_police` | 0.531 | 2.41 s |
| ambience (positional loop) | `sfx_hose_spray` | 0.422 | 2.40 s |
| ambience (positional loop) | `sfx_excavator` | 0.372 | 2.00 s |
| ambience (positional loop) | `sfx_comic_fight` | 0.589 | 2.40 s |
| sfx | `sfx_fire_flare` | 0.372 | |
| sfx | `sfx_steam_hiss` | 0.221 | |
| sfx | `sfx_collapse_soft` | 0.442 | |
| sfx | `sfx_demolish_crunch` | 0.617 | |
| sfx | `sfx_coin_count` | 0.343 | |
| sfx | `sfx_stamp` | 0.708 | |
| sfx | `sfx_vault_door` | 0.562 | |
| sfx | `sfx_forklift_beep` | 0.119 | |
| sfx | `sfx_police_whistle` | 0.127 | |
| sfx | `sfx_crowd_gasp` | 0.385 | |
| sfx | `sfx_crowd_cheer_small` | 0.288 | |
| sfx | `sfx_cuffs_click` | 0.794 | |
| sfx | `sfx_fire_alarm_bell` | 0.182 | |
| sfx | `sfx_moving_truck` | 0.767 | |
| sfx | `sfx_box_drop` | 0.871 | |
| sfx | `sfx_box_drop_2` (extra) | 0.851 | |
| sfx | `sfx_box_drop_3` (extra) | 0.912 | |
| sfx | `sfx_newspaper` | 0.733 | |

- **Sirens:** fire is a retro two-tone "nee-naw" on D5/A4; police is a gliding toy "wee-oo" from C5 to F5. Both are rounded, with almost nothing above 4 kHz.
- **Music:** both loops are in F major and play at the same loudness as `bgm_village` (-26.5 LUFS after volume). `bgm_city` uses the village hook note for note and the village B melody. `bgm_chase` is a xylophone gallop built on the hook, with a tiptoe middle section and a slide-whistle return.

**How the game should play them** (the `src` changes are for the code agents)
- **Loading:** add `'audio6'` to `FRAGMENTS` in `src/core/Assets.js`.
- **Lazy loading:**
  - Load `bgm_city` (about 21.5 MB once decoded) and `bgm_chase` (about 8.1 MB) only when first needed.
  - The four `amb_` beds already match the deferred pattern.
  - Add the five positional loops to `isDeferredAudio`.
- **Music:** `playMusic('bgm_city')` by day in the city districts. Switch to `bgm_chase` during a police chase and back on the arrest.
- **Beds:** drive `amb_bank` and `amb_warehouse` with `setAmbience` by how far the cutaway is revealed. Drive `amb_construction` by distance to a building site, and `amb_fire_big` by distance times fire size.
- **Fire:**
  1. `sfx_fire_alarm_bell` and `sfx_crowd_gasp` when the fire is reported.
  2. `sfx_fire_flare` when flames burst from a window.
  3. `sfx_siren_fire` loop from dispatch until about 1 s after arrival, then audio3 `sfx_brakes`.
  4. `sfx_hose_spray` loop while the hose sprays.
  5. `sfx_steam_hiss` when it goes out (fade `amb_fire_big` over it), then `sfx_crowd_cheer_small`.
  6. If the building is lost, `sfx_collapse_soft`: swap to the ruin sprite on the `flumph` cue (1.16 s).
- **Rebuild:** `sfx_excavator` loop with rate 0.85 idle, 1.0 working, about 1.12 while digging. Play `sfx_demolish_crunch` on each bucket-contact frame, keep `amb_construction` running during the rebuild, then audio2 `sfx_build_done`.
- **Bank:**
  - `sfx_coin_count` for deposits and interest.
  - `sfx_stamp` for loans and passbook entries.
  - `sfx_vault_door` on frame 0 of the vault animation.
- **Logistics:**
  - `sfx_forklift_beep` about every 1.3 s while a forklift reverses.
  - The `sfx_box` group (rate 0.92–1.1) when boxes are put down.
  - `sfx_stamp` plus coins at the settlement counter.
  - `sfx_moving_truck` when the truck unloads.
- **Police:** `sfx_police_whistle`, then the `sfx_siren_police` loop during the chase. Loop `sfx_comic_fight` while the dust cloud is up, then `sfx_cuffs_click` (start the arrested walk on its `latch` cue) and `sfx_crowd_cheer_small`.
- **Newspaper:** `sfx_newspaper` when the morning paper opens.

**QA**
- **Levels:** every file peaks at -1.0 dBFS or lower. Each key's in-game level is exactly on target for the OGG and within 0.5 dB for the MP3.
- **Pitch:** fire siren A4 +1.1 cents, forklift beep C6 +1.8, alarm bell A5 +0.8, coin "ching" F6 +0.1, whistle C7 -1.7.
- **Cues:** every percussive cue is within 8 ms of a detected onset. The one exception is the collapse `crack`, where the detector fires 23 ms early on the creak just before it.
- **Loops:** all 11 have zero OGG end padding and no click at the wrap (worst score 0.65 on the fire siren against a fail line of 1; its rendered wrap is exactly continuous). Chromium 141 decodes the OGG and MP3 of every loop to exactly `loopSamples`.
- **Rebuild:** a rebuild from an empty cache gave byte-identical audio files.
- **Preview page:** at 390×844 in headless Chromium, all six scene buttons work, all 36 card sounds decode, and there are no console errors or horizontal scroll.

**Known issues**
- The contract calls the five positional loops `sfx_*`; I shipped them as `kind: "ambience"`, as audio3 did for its vehicle loops.
- The four beds are only 8 s long so the folder fits under 4 MB, so their events repeat every 8 s. Drive them by distance or reveal rather than leaving them on full.
- Only about 70 KB of room is left for more sounds in this folder.
- `sfx_vault_door` assumes the vault animation runs at about 4 fps; the contract doesn't say.
- The alarm bell's second burst (`ring2`) overlaps the first ringing out, so it can't be confirmed as a separate onset.
- Exact loop lengths depend on the libvorbis build; on another machine, rebuild and re-run the check.

**Rebuild:** `python3 tools/audio/build_audio6.py` (about 4–6 minutes). The cache is `/tmp/fv_cache/audio6`. No existing script or asset was edited.

Files are in `/home/user/nurient/frost-village`:
- `assets/audio6/` (manifest + 58 audio files)
- `tools/audio/sfx6.py`
- `tools/audio/music6.py`
- `tools/audio/build_audio6.py`
- `tools/audio/check_audio6.py`
- `docs/build_reports/audio6.md`
- `docs/previews/audio6_waveforms.png`
- `docs/previews/audio6_demo.mp3` — 76 s: morning city, bank, warehouse, fire, thief chase, newspaper
- `docs/previews/audio6_report.txt`
- `docs/previews/audio6_preview.html`
