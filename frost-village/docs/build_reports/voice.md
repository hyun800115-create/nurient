# voice build report — 눈꽃말 (the village language) and its voices

**VOICE: DONE.** The designer's request ("마을 사람들 소리는 좀 일본어로 들리는 거 같은데, 우리의 마을 언어 목소리를
만들자. 미니언즈처럼 귀여운 목소리 같이 어때?") is answered with:

- **눈꽃말**, an original village language: a 78-entry lexicon (69 words with meanings, 6 connective fillers and
  3 sentence-end particles; each with hangul spelling, romanisation and IPA-ish phonemes), a tiny grammar, and a
  fun Korean dictionary for the designer (`docs/눈꽃말_사전.md`).
- **10 voices** (kid_boy, kid_girl, adult_m, adult_f, elder_m, elder_f, chief, big_gruff, sweet, squeaky), each
  one audio sprite with 31 babble clips (21 shared core words + 4 words of its own + 3 fillers + 3 particles) and
  10 emotive one-shots. 20 files, **2.53 MB** with the manifest (limit 4 MB).
- **A standalone runtime** (`src/voice/`) that turns any bubble's Korean text into deterministic 눈꽃말 babble
  for that resident, with prosody, keywords, emotes, a 2-voice limit, a queue, distance, ducking and a volume
  setting. It does not allocate per frame. Nothing in the game imports it yet; see §7 for the integration plan.
- **A 64 s demo** (`docs/previews/voice_demo.mp3`) played by the real runtime, a **listening page**
  (`docs/previews/voice_preview.html`), Node and browser **tests**, and a **QA script**. Everything passes, and
  two clean rebuilds produce byte-identical files.

I can't listen to audio. Every judgement here comes from measurements, spectrograms, pitch tracking and
decoding in headless Chromium. The designer should listen to the demo and the preview page before the voices
replace the old chatter.

---

## 1. Files

| path | what |
|---|---|
| `assets/voice/manifest.json` | Audio fragment in the `assets/audio2..6` conventions. `audio.voice_<type>` = `{files: ["voice/voice_<type>.ogg", "voice/voice_<type>.mp3"], volume, loop: false, kind: "sfx", duration, samples, mp3StartPad, onset, voiceType, sprite: true, markers}`. Each marker is `markers[id] = {start, dur, kind: word/filler/particle/emote, syl, say, emote?}`. A `voices` table holds the timbre parameters. `audioGroups` is empty. |
| `assets/voice/voice_<type>.ogg / .mp3` | 10 mono 44.1 kHz audio sprites, 15.6–20.9 s each. Vorbis q3, LAME CBR 56 kbps with the gapless tag. |
| `src/voice/VillageVoice.js` | The runtime: planner, scheduler, concurrency, ducking, volume, `speakBubble` hook. |
| `src/voice/cast.js` | Voice types; character key → voice; role/kind fallback; stable speaker ids; persona pitch tweaks; FNV hash. |
| `src/voice/lexicon.js` | **Generated** from `tools/voice/lexicon.json`. Word id → hangul, romanisation, meaning, category, Korean keywords. |
| `src/voice/webaudio.js` | Web Audio backend: bus, channels, per-clip source, decoder start-delay detection. |
| `src/voice/phaser.js` | Phaser glue `attachVillageVoice(gs, opts)` (late fragment load, backend on `game.sound`). Not imported anywhere yet. |
| `tools/voice/lexicon.json` | The language data, hand-written. |
| `tools/voice/phonology.py` | Romanisation → eSpeak phonemes and IPA; "not Japanese" markers; blacklist of Minionese and Simlish words; syllable statistics. |
| `tools/voice/voices.py` | The 10 voices: parameters, recorded word lists, emote texts. |
| `tools/voice/prosody.py` | Melody and timing plans for words, particles, fillers and emotes (one laugh style per voice). |
| `tools/voice/espeak.py` | eSpeak NG via ctypes (each word rendered in a fresh helper process, so output is deterministic). |
| `tools/voice/vocoder.py` | WORLD analysis/resynthesis: new timing, designed F0, formant warp, tilt/smile, breathiness, soft unvoiced sounds. |
| `tools/voice/render.py` | Renders one clip: articulation → WORLD → voice → post (high-pass, gentle compression, tiny room, fades). Caches the articulations. |
| `tools/voice/build_voice.py` | Full build: render, level, sprite, encode, measure, manifest, `lexicon.js`, dictionary, QA. |
| `tools/voice/check_voice.py` | QA (see §8). Writes `docs/previews/voice_report.txt` and `voice_spectrograms.png`. |
| `tools/voice/make_dictionary.py` | Writes `docs/눈꽃말_사전.md` from the data. |
| `tools/voice/demo.mjs`, `demo_mix.py` | Demo: the script runs through the real runtime, then the recorded clip events are mixed to mp3 plus a transcript. |
| `tools/voice/loudness.py`, `deps.py` | Active-speech loudness; dependency check. |
| `tools/test/voice_runtime.mjs` | 22 Node tests (determinism, sequencing, prosody, keywords, concurrency, queue, priority, distance, ducking, volume, manifest, no per-frame allocation). |
| `tools/test/voice_preview.mjs` | Headless-Chromium test of the listening page and of real Web Audio playback (OfflineAudioContext). |
| `docs/눈꽃말_사전.md` | Dictionary for the designer, in easy Korean with example sentences. Generated. |
| `docs/previews/voice_demo.mp3` / `.txt` | 64 s demo and its transcript (bubble text → what is heard). |
| `docs/previews/voice_preview.html` / `.png` | Listening page and a screenshot of it. |
| `docs/previews/voice_report.txt`, `voice_spectrograms.png` | QA table and spectrograms of all 10 sprites, with marker labels. |

No existing file was modified. `git status` shows only new paths under `assets/voice`, `src/voice`,
`tools/voice`, `tools/test/voice_*`, `docs/previews/voice_*` and `docs/눈꽃말_사전.md`. The modified files
belong to the parallel agents.

## 2. Method

Neural TTS weights could not be used (HuggingFace and GitHub are blocked), so the voices are built from two
classic, deterministic tools:

1. **Articulation: eSpeak NG 1.52.0** (formant synthesiser; the PyPI package `espeakng-loader` 0.2.4 bundles the
   library and data). Every invented word is written in our romanisation, converted by `phonology.py` into
   eSpeak phoneme mnemonics, and spoken as phoneme input `[[...]]` in eSpeak's **Finnish** table.
   - Finnish was chosen because it has pure vowels, the front rounded vowels y/ø/æ, a rolled r and clean
     stops.
   - Consonant clusters (bl, pr, fr…) work in phoneme mode.
   - eSpeak renders at rate 190, base pitch about 80 Hz, pitch range 0 (monotone). We only need its consonants,
     vowel formants and phoneme timing; the melody is ours.
   - eSpeak keeps synthesis state between utterances: the same word comes out a few samples different depending
     on what was said before, and Terminate/Initialize does not reset this. Each word is therefore rendered as
     the first utterance of a fresh helper process. The result is cached in `tools/voice/_cache/artic/`
     (gitignored).
2. **Voice: WORLD vocoder** (pyworld 0.3.5). The articulation is analysed with harvest F0, the CheapTrick
   envelope and D4C aperiodicity at a 5 ms frame. It is then resynthesised with:
   - **Timing.** Voice speed × plan vowel lengths; consonants ×0.8 (snappy); the rolled r is kept; eSpeak's
     leading and trailing silence is dropped.
   - **Melody.** The analysed F0 is discarded. Each vowel nucleus gets a target in semitones above the voice's
     base pitch, multiplied by the voice's range: words alternate high and low syllables (H-L, L-H↓, H-L-H…),
     every vowel scoops up about 1.6 st with a small overshoot, plus declination, slow jitter, and vibrato (on
     held vowels, or a gentle tremor for elders).
   - **Formants.** The envelope is warped along frequency by `alpha` (kids 1.30–1.38, squeaky 1.52, big uncle
     0.90), plus a "smile" lift around F2, spectral tilt and a soft high cut.
   - **Breath and sibilants.** An aperiodicity floor that rises with frequency gives breathiness. Unvoiced
     frames get an extra high shelf (−7 dB at 7.5 kHz), so s/ch/f/h and stop bursts stay soft and never hiss.
   - **Level shaping.** Each syllable has its own gain (laughs decay). Word-final stops are unreleased like
     Korean final ㄱ/ㅂ (gain 0.08). The attack is a soft 12 ms ramp, and the last vowel releases to 22 %.
3. **Post-processing** (tools/audio `synth.py`, imported read-only):
   - 2× polyphase upsampling to 44.1 kHz; high-pass at 70–220 Hz depending on the voice.
   - Gentle compression (2.2:1) and a 0.32 s "snowy room" at 7 %.
   - Trim and fades; peak −1.5 dBFS.
4. **Levelling and sprites.**
   - Every clip is normalised to the same active-speech loudness: K-weighted, 100 ms blocks, gated 15 dB under
     the loudest block. Emotes get small offsets (laugh/surprise/excited +0.5 dB, sad −1 dB). A look-ahead
     limiter keeps peaks ≤ −1.8 dBFS.
   - Clips are laid end to end with 45 ms gaps (more than the 25 ms mp3 decoder delay).
   - Each sprite's manifest `volume` brings its median word to the **old chatter's effective level**:
     active LUFS + 20·log10(volume) = −21.1 for `assets/audio2/sfx_chatter_*`, against −21.00 ± 0.01 for the new
     voices. The runtime then plays them at the same 0.4 base gain that `VillageLife.chatter()` uses, so the
     voices sit behind the music exactly like the chatter they replace.

Build time: about 85–115 s from an empty cache on the shared 4-core box, 15–30 s when the eSpeak articulations
are cached. Two full clean rebuilds gave **byte-identical** files (ogg, mp3, manifest, `lexicon.js`).

## 3. Licences and sources (everything shipped is free for commercial use)

| what | licence | how it is used |
|---|---|---|
| eSpeak NG 1.52.0 (via `espeakng-loader` 0.2.4) | GPL-3.0-or-later | **Build-time tool only.** It speaks our invented phoneme strings; nothing of eSpeak ships with the game. GPL-3.0 §2: the output of a program is covered only if its content is itself a covered work, and synthetic speech of our own words is not. The voice is further replaced by WORLD resynthesis. |
| WORLD vocoder (M. Morise), via pyworld 0.3.5 | modified BSD / MIT | Build-time analysis and resynthesis. |
| numpy, scipy | BSD | build time |
| ffmpeg 6.1 + libvorbis (BSD) + LAME (LGPL) | — | encoding, as in every existing audio fragment |
| tools/audio `synth.py`, `ffmpeg_tools.py` | project code | imported read-only |
| the language, words, melodies, voice designs, runtime | **original project work** | — |
| demo bed: `assets/audio/amb_wind`, `bgm_village`, `assets/audio2/sfx_dog_bark` | project assets | only inside `voice_demo.mp3` |

`praat-parselmouth` and `phonemizer` (both GPL) were installed in the build venv while exploring. They are **not
used** by any script and are not listed in `deps.py`. **No** Minionese, Simlish or Animalese words or audio are
used. `phonology.py` blacklists bello, poopaye, tank yu, bee-do, banana, papoy, baboi, po-ka, gelato, tulaliloo,
tatata, bapple, muak, hana/dul/sae (the Korean numbers the Minions use), la boda, kanpai, para tu, bulaka,
pwede, sul sul, dag dag, vadish, nooboo, chumcha, geelfrob, fredishay, whippna, boobasnot, shoo flee and litcha,
and the build refuses a lexicon that contains or resembles any of them.

## 4. The language — 눈꽃말 (Nunkkot-mal)

- **Sounds.** Vowels a e i o u, ü [y] (뉘/뮈/퓌), ö [ø] (뵐/뫼/푀), ae [æ] (랭/냉), eu [ɯ] (only in 브르르).
  Consonants p b t d k g m n ng l r f v s sh h w y ch.
- **Syllables.** (C)(C)V(C). Onset clusters are bl pl br pr fl fr gl gr kl kr tr; codas are m n ng l r p k s.
  Stress, which is the melody peak, falls on the first syllable.
- **Why it no longer sounds Japanese.** The old chatter was open CV syllables over a/e/i/o/u with a small range
  (`sfx2.py` CHATTER: ba-di-bu-da, mi-mo-ne…). Every 눈꽃말 content word must carry at least one of:
  - a closed syllable (other than -n),
  - an onset cluster,
  - a vowel outside a/e/i/o/u,
  - l/f/v,
  - reduplication.

  The build enforces this rule. Over the whole dictionary, **73 %** of syllables are closed, **16 %** have
  clusters and **23 %** have ü/ö/æ/ɯ; over the 57 words the voices actually say, it is **75 % / 18 % / 18 %**.
  The old chatter is 0 % / 0 % / 0 %. Melodies are sung: the median pitch range inside one clip is **5.8 st**
  (p90 9.1), and phrases add more through per-word jitter, declination and final rises.
- **Grammar.**
  - Reduplication makes plurals and intensity: 뮈 "I" → 뮈뮈 "we", 뿔룽뿔룽 "bye-bye".
  - Sentence-end particles: **녹?** (question, rising), **얍!** (excited), **뇽** (plain statement, falling).
  - **뿔** means "very".
- **Lexicon (78 entries).**

  | category | entries |
  |---|---|
  | greetings | 뽀얌 hello, 뿔룽뿔룽 bye |
  | social | 꼬맙뿌 thanks, 왈랑 welcome, 뿌띵 please, 뮈앙 sorry |
  | answers | 뉨 yes, 노뱅 no |
  | feelings | 블룸 good, 우와뿅 wow, 엡뿔 oops, 뵐랑 love, 랄랄 happy, 뮝뮝 sad, 그롱 grumpy, 브릅 scared, 뉠롱 tired, 킥뽕 funny, 뾰롱 cute |
  | food | 냠냠뇹 yummy, 퓌뽈 fish, 브랑 bread, 뭄 eat, 구룩 hungry |
  | nature | 뉘뉘 snow, 뉘블룸 snowflake/flower, 브르르 cold, 뫼옹 warm, 끼링 ice, 랭 sun, 쁘릴 star, 뮌 moon, 올롱 water, 폭폴 fire |
  | things | 똘롬 wood, 옴뽁 home, 마울 village, 링딩 money, 블롭 boat, 칙폭 train, 띵롱 music |
  | actions | 똑땁 work, 뇨롬 sleep, 플링 play, 프룽 go, 옹 come, 끌룹 help |
  | people | 촌촌님 chief, 뮐리 friend, 뽀뇽 baby, 뮈 I, 냉 you, 뮈뮈 we |
  | animals | 왈뽕 dog, 미울 cat |
  | questions | 뫼? what, 뉩? who, 올뮈? where, 엔뎅? when, 퓌웅? why, 앙뚤? how |
  | numbers | 잉 1, 뒬 2, 뜨렘 3, 푀 4, 빔빔 5 |
  | size | 봄봄 big, 찌밍 small, 뿔 very |
  | fillers | 엘 and, 드 the, 넹 you know, 음 hmm, 뚜리 so-then, 뵹 hey |
  | particles | 녹? 얍! 뇽 |

  The design doc's sample words are kept where they fit (꼬맙뿌, 촌촌님) and made "ours" where they were plain
  CV (뽀야 → 뽀얌, 냠냠뇨 → 냠냠뇹, 누누 → 뉘뉘, 피뽀 → 퓌뽈, 모모 → 뫼; momo is also Japanese for peach).
- **Keywords.** Each word lists Korean stems (`kw`) that make the runtime say it when a bubble contains them:
  고마 → 꼬맙뿌, 촌장 → 촌촌님, 생선/물고기 → 퓌뽈, 빵 → 브랑, 추워/춥 → 브르르, 정말/너무 → 뿔, and so on.
  The longest keyword wins (물고기 is fish, not 물 water + 고기). The 21 core words were picked by counting
  keyword hits over the game's 887 Korean strings (`strings.js`, chat lines).

## 5. Voices

| type | who (CAST in `cast.js`) | F0 Hz | range | alpha | speed | breath | vibrato / tremor | laugh |
|---|---|---|---|---|---|---|---|---|
| kid_boy | 도윤, 준, 짐꾼 다람 | 290 | 1.2 | 1.30 | 1.24 | 0.10 | 28 c @6.2 Hz on held vowels | 키히히히히 |
| kid_girl | 하린, 서아, 스케이트 소녀 | 345 | 1.3 | 1.38 | 1.20 | 0.12 | 30 c @6.5 | 히히히힛 |
| adult_m | 태오, 상인, 음유시인, 우체부, 민호, 나무꾼 다온… | 165 | 1.05 | 1.12 | 1.06 | 0.07 | 20 c @5.5 | 하하하하 |
| adult_f | 빵집 아주머니, 대장장이 언니, 의사, 밭일 이모… | 255 | 1.2 | 1.22 | 1.12 | 0.11 | 24 c @5.8 | 아하하하 |
| elder_m | 할아버지, 선장 바다, 바다/농부 할아버지, 광부 영감 | 140 | 0.9 | 1.04 | 0.86 | 0.15 | 32 c @5.0, tremor on every vowel | 호호호 |
| elder_f | 할머니 | 225 | 0.95 | 1.15 | 0.90 | 0.17 | 36 c @5.4, tremor | 오호호호 |
| chief | the player | 205 | 1.35 | 1.17 | 1.16 | 0.07 | 22 c @5.8 | 아하하핫! |
| big_gruff | 아저씨, 곰돌, 요리사 쿡, 경비대장, 곰 아저씨 장쇠… | 108 | 1.0 | 0.90 | 0.94 | 0.09 | 18 c @5.0 | 와하하하 |
| sweet | 약초꾼, 멋쟁이, 점원 미소, 화가, 어부 아가씨 수아 | 285 | 1.0 | 1.25 | 0.98 | 0.22 | 26 c @5.6 | 후후히 |
| squeaky | 아기 콩콩 | 470 | 1.45 | 1.52 | 1.36 | 0.08 | 40 c @7.2 | 끼히히히히히 |

Notes on the table:
- "range" scales the melody: 1 means word moves of about ±4.5 st.
- "speed" scales articulation: 1 means eSpeak rate 190.
- Measured median F0 per sprite runs 113 Hz (big_gruff) to 523 Hz (squeaky), each 3–14 % above its base
  because the melodies are mostly above base.
- Town citizens (`TownSim`, `Neighbours` actors and visitors) get a voice from their kind (student/teen/elder/
  adult) and a hash of their id, so one person always keeps the same voice.

**Recorded clips per voice (41).** Clip lengths: words 0.21–0.82 s (median 0.36), emotes 0.19–0.76 s.
- 21 core words: hello, bye, thanks, yes, no, good, wow, yummy, love, friend, chief, village, snow, cold, fish,
  bread, money, work, home, very, what.
- 4 words of its own (kid_boy: play dog go big; kid_girl: play cute star cat; adult_m: boat train eat wood;
  adult_f: welcome please three water; elder_m: warm tired water two; elder_f: warm baby sleep four; chief:
  help welcome go come; big_gruff: wood fire eat big; sweet: flake music moon please; squeaky: play small five
  ice).
- 3 fillers: 엘, 넹, 음.
- 3 particles: 녹?, 얍!, 뇽.
- 10 emotes:
  - greet 뽀얌!
  - laugh (its own style)
  - surprise 우와!
  - excited 야호!
  - sad 흐잉…
  - grumpy 흥!
  - question 응?
  - thanks 꼬맙뿌!
  - yummy 냠냠~
  - oops 앗!

  Each emote has its own melody: 우와 rises 8 st then falls, 응? rises 10 st, 흐잉 falls slowly with a 62-cent
  whimper vibrato, 흥 is a short low fall, laughs step down with decaying, breathy "h" syllables.

## 6. Runtime API (`src/voice/VillageVoice.js`)

```js
import { VillageVoice } from './voice/VillageVoice.js';
const vv = new VillageVoice({ manifest, backend, maxVoices: 2, maxPending: 3, maxWait: 1.2,
                              baseGain: 0.4, volume: 1, maxDur: 2.6, distance: (x, y, sp) => 0..1 });
vv.speak(text, speaker, opts)     // -> pooled utterance ({uid, duration, state}) or null
vv.speakBubble(text, who, emoteIconKey)   // Bubbles.chat hook: icon -> mood, "name\n" line skipped, chief = priority 2
vv.emote(speaker, 'laugh')        // just a one-shot
vv.plan(text, speaker, opts)      // read-only: {voice, mood, duration, items:[{id, at, rate, gain, hangul}], say}
vv.update(dt)                     // every frame; allocation-free
vv.duck(level = 0.35, hold = 0.6) // under important sfx (fast down, 0.25 s back up)
vv.setVolume(0..1); vv.setEnabled(bool); vv.stop(speaker); vv.stopAll(); vv.isSpeaking(speaker)
vv.setDistanceModel(fn); vv.keysFor(types)   // sprite keys to load
```

- **speaker** can be:
  - a voice type ('kid_girl');
  - `{voice, voiceId}`;
  - a Resident (`key`, `role`, `persona`) → `CAST`, falling back to the role;
  - a TownBody, Actor or Visitor (`.c` / `.citizen`) → the citizen's kind, and the id is the citizen's id;
  - a pet → silent.
- **opts:**
  - `emotion` — one of the 10 emotions.
  - `emote` — chance 0..1, or 0 for never.
  - `volume`.
  - `priority` — 0 chatter, 1 important, 2 the chief; a higher priority preempts a lower one with a 40 ms fade.
  - `x` / `y`, `maxDur`, `queue: false`.
  - `voice`, `pitch` (semitones), `words`, `variant`.
- **Planning.** Fully deterministic: the only random numbers come from
  `mulberry32(FNV(voice | speakerId | text | variant))`.
  - **Mood** comes from the text: ㅋㅋ/하하 → laugh, ㅠ/슬퍼 → sad, 흥/짜증 → grumpy, 앗/이런 → oops, 우와/헉 →
    surprise, 고마 → thanks, 맛있 → yummy, 안녕 → greet, 야호/!! → excited; otherwise `?` → question and `!` →
    excited.
  - **Word count** ≈ Korean syllables ÷ 2.6, clamped to 1–6, with babble trimmed to `maxDur` (2.6 s; the worst
    measured case is 2.83 s with the end emote).
  - **Keywords** first, in text order and proportional positions; the rest is neutral babble (nature, thing,
    food, action and size words, plus fillers at 22 %). A grumpy line never says "thank you" by accident, and
    the same word is never repeated by chance.
  - **Particle:** 녹? for questions, 얍! (55 %) after "!", 뇽 (30 %) after plain statements.
  - **Emote:** at the start (greet, surprise, oops, grumpy) or the end (the rest). The chance is 92 % when the
    line opens with the cue (야호!, 앗…), 65 % when the cue is later in the line, 35 % for punctuation-only
    moods. An emote that says a keyword replaces that word (고마워요! → just 꼬맙뿌!).
- **Prosody** is applied through `playbackRate`, so higher is also slightly faster.
  - Per resident: ±1.4 st from a hash of the speaker id, plus persona tweaks (teen −1.6, prankster +1.2,
    toddler +1.5…).
  - Per mood: excited +1.6 st with 0.7× gaps; sad −1.7 st with 1.5× gaps; grumpy −1.1 st; and so on.
  - Statements decline −0.35 st per word; questions get +1.2 st on the last word and the rising particle.
  - Word jitter is ±0.9 st; gaps are 50–110 ms × the voice's tempo (kids 0.85, elders 1.3); a comma or sentence
    break adds 120–200 ms.
- **Scheduling.** Clips go to the audio clock 0.12 s ahead (`source.start(when, offset, dur)` on the sprite).
  Utterances and items are pooled objects, and `update()` only walks fixed arrays. 300 k frames grew the heap by
  3 KB; a single 16-byte allocation per frame would be 4.8 MB.
- **Concurrency.**
  - At most `maxVoices` (2) lines sound at once.
  - Up to 3 wait, for at most `maxWait` (1.2 s). If the queue is full, the oldest, least important waiting line
    is dropped.
  - A new bubble from the same speaker replaces what they were saying.
  - A spare channel lets a preempted line fade out without blocking the new one.
- **Distance.** `distance(x, y)` is checked when the line starts and 4× per second. 0 means not voiced at all,
  or stopped after 0.5 s out of range; other values ramp the channel gain over 0.15 s. The Phaser glue uses the
  same rule as `Game.sfxAt`: 1 on screen, 0.5 within 220 px of the edge, 0 farther away.
- **Backend** (`webaudio.js`):
  - Signal path: per-clip source (+ gain) → channel gain → voice bus (volume × 0.4 × duck) → `game.sound.destination`,
    so the game's mute and master volume apply.
  - Start delay: a decoded sprite whose first sound (above −34 dBFS) arrives more than 12 ms after the manifest
    `onset` gets every marker shifted. This covers mp3 decoders that ignore the LAME gapless tag.
  - In Chromium, the ogg end padding (up to about 1000 samples) only adds harmless silence after the last clip;
    the mp3 decodes gapless, so no shift is needed.

## 7. Integration plan (for the code agents — none of these files were edited)

All bubbles go through `Bubbles.chat()`: VillageLife residents (`Resident.say`), TownSim citizens
(`B.chat(b, line(cat), …)`), and Neighbours actors and visitors. One hook therefore covers everything; the old
chatter calls are removed so nothing sounds twice.

1. **Create** it once per Game scene, after the title (it loads lazily; nothing at boot):
   ```js
   // scenes/Game.js
   import { attachVillageVoice } from '../voice/phaser.js';
   // in create(), after the village systems exist:
   this.voice = attachVillageVoice(this, { volume: Settings.data.voice ?? 1 });   // null without Web Audio
   ```
   To save memory, pass only the types present, for example
   `attachVillageVoice(this, { types: [...new Set(this.life.residents.map(voiceFor).filter(Boolean)), 'chief'] })`.
2. **Tick** it, following the sound toggle:
   ```js
   // Game.update(time, delta)
   if (this.voice) {
     const on = Audio.started && Settings.data.sound && Audio.live;
     if (on !== this.voice.enabled) this.voice.setEnabled(on);
     this.voice.update(delta / 1000);
   }
   ```
3. **Speak bubbles** with one line in `systems/Bubbles.js` `chat()`, right after `this.active.push(b);`:
   ```js
   if (this.gs.voice) this.gs.voice.speakBubble(text, who, emote);
   ```
   The info card in `Neighbours.js` (`B.chat(w, s, …)` with the `tfCard` text) is not speech. Either skip it
   there, or give `Bubbles.chat` an `opts.silent` flag.
4. **Remove the old chatter**, but only when the voice exists:
   ```js
   // systems/VillageLife.js
   chatter(r) {
     if (this.gs.voice) return;                       // 눈꽃말 voices speak through Bubbles.chat
     ...old sfx_chatter code (kept for browsers without Web Audio)...
   }
   sfxLaugh(r) { if (this.gs.voice) this.gs.voice.emote(r, 'laugh'); else this.life.sfx('sfx_laugh', r.x, r.y, 0.45); }
   ```
   Also replace the two direct `life.sfx('sfx_laugh', …)` calls (snowball tag and snowman events, around lines
   1324 and 1469) with `gs.voice ? gs.voice.emote(o, 'laugh') : …`. `TownSim.chatter()` needs no change: its
   `B.chat` already speaks.
5. **Duck** under important sounds. `core/Audio.js` `play()`, after `this.sm.play(k, cfg)`:
   ```js
   if (this.onImportant && /^sfx_(levelup|complete|unlock|build_done|hire|mission_done|fame_up|cash)/.test(k)) this.onImportant();
   ```
   and in `Game.create`: `Audio.onImportant = () => this.voice && this.voice.duck(0.35, 0.7);`
6. **Settings:** add `Settings.data.voice` (0..1, default 1) with a slider "주민 목소리" next to the sound toggle,
   calling `gs.voice.setVolume(v)`.
7. **Chief lines** get priority 2 automatically in `speakBubble` (the player key maps to `chief`). Scripted
   moments can call `gs.voice.speak(text, gs.player, { priority: 2, emotion: 'thanks' })`.

## 8. QA numbers

`python3 tools/voice/check_voice.py` → **RESULT: OK** (`docs/previews/voice_report.txt`):

| key | clips | s | vol | effective | word spread dB | peak ogg/mp3 dBFS | >6 kHz % | F0 Hz (base) | range st | KB |
|---|---|---|---|---|---|---|---|---|---|---|
| voice_kid_boy | 41 | 16.49 | 0.401 | −21.01 | 0.84 | −1.40 / −2.12 | 0.52 | 316 (290) | 6.1 | 220 |
| voice_kid_girl | 41 | 17.06 | 0.401 | −21.00 | 1.14 | −1.52 / −1.70 | 0.85 | 384 (345) | 6.5 | 230 |
| voice_adult_m | 41 | 18.08 | 0.406 | −21.01 | 1.02 | −1.40 / −1.67 | 0.28 | 174 (165) | 5.6 | 240 |
| voice_adult_f | 41 | 17.69 | 0.403 | −21.01 | 0.46 | −1.17 / −1.72 | 0.38 | 265 (255) | 6.0 | 234 |
| voice_elder_m | 41 | 20.91 | 0.406 | −21.01 | 1.10 | −1.40 / −1.67 | 0.14 | 148 (140) | 5.0 | 275 |
| voice_elder_f | 41 | 20.45 | 0.402 | −21.00 | 0.51 | −1.62 / −1.93 | 0.20 | 237 (225) | 5.5 | 267 |
| voice_chief | 41 | 17.19 | 0.403 | −21.00 | 0.67 | −1.37 / −1.89 | 0.51 | 231 (205) | 6.4 | 227 |
| voice_big_gruff | 41 | 19.55 | 0.419 | −20.99 | 1.05 | −1.40 / −1.98 | 0.03 | 113 (108) | 5.0 | 256 |
| voice_sweet | 41 | 19.15 | 0.401 | −21.01 | 0.39 | −1.49 / −1.71 | 0.31 | 307 (285) | 5.5 | 253 |
| voice_squeaky | 41 | 15.61 | 0.401 | −21.00 | 0.40 | −1.43 / −1.87 | 0.99 | 523 (470) | 7.3 | 212 |

- **Old chatter reference:** −21.14 effective, range −20.7 to −21.3. The new voices sit at −21.00 ± 0.01.
- **Other checks:**
  - No clipped samples.
  - DC ≤ 0.0002 per clip.
  - Clip edges ≤ 0.024 (no clicks).
  - Gaps between clips ≤ −55 dBFS when measured 8 ms away from the clips, so no bleed between markers.
  - Energy above 6 kHz ≤ 1 % per clip (round, never harsh); unvoiced segments sit 19–23 dB under the vowels.
  - Payload **2,531,579 bytes**.
- **Node tests:** `node --expose-gc tools/test/voice_runtime.mjs` → **22 passed, 0 failed**.
  - Determinism: 336 (line, speaker) pairs give identical plans across instances; 28/28 lines are distinct;
    40/40 pairs of same-type residents differ.
  - Length: mean 0.67 s for 4-syllable lines, 1.85 s for 14 syllables, 2.43 s for long lines; worst 2.83 s.
  - Prosody: playback rate sad 0.873 < neutral 0.975 < excited 1.094; gaps sad 107 ms > neutral 71 ms >
    excited 51 ms. Questions always end with 녹? or 응?, and 100 % rise.
  - Concurrency: a 60 s random chatter session never has more than 2 lines (or clips) at once. Waiting lines
    start later, stale ones expire, the chief preempts, distance stops lines, ducking and volume work.
  - Allocation: +3 KB of heap for 300 k frames.
- **Browser test:** `node tools/test/voice_preview.mjs` → **ALL PASS**.
  - The page loads with no errors.
  - All 20 files decode in Chromium to the right length, with clips starting on time (≤ 4.7 ms codec smoothing).
  - A real Web Audio render (OfflineAudioContext stepped like frames) sounds while speaking (RMS 0.066) and is
    silent afterwards. Its peak is 0.35 with three lines requested at once, and only 2 voices played.
  - Typing "촌장님, 생선 사세요!" plays 촌촌님 퓌뽈 …
- **Determinism:** two clean rebuilds (85 s and 99 s) produced byte-identical files, and the final assets match a third
  clean rebuild (113 s) byte for byte.

## 9. How to listen

- **Demo:** `docs/previews/voice_demo.mp3`, 63.7 s, −16.7 LUFS. The transcript `voice_demo.txt` lists, for each
  bubble, what is heard.
  - 0–26 s: each voice says hello and something in character. For example the boy says
    "안녕! 콩이랑 같이 놀자!" → 뽀얌! 왈뽕 플링 얍!
  - 27 s on: a snowy-day scene. Two neighbours greet and gossip ("할아버지네 강아지가 눈사람 코를 먹었대요!"
    → 우와! …). There is a joke with laughter (하하하하 / 와하하하), a question and answer (kid → chief: 언제 해요?
    … 응? / 저녁에요! … 야호!), the chief thanks the baker (… 냠냠뇹 꼬맙뿌!), and the kids squeal at the dog,
    which barks back. Grandpa grumbles (흥! …) and then laughs (호호호), grandma slips (앗! …), and everyone says
    goodbye (뿔룽뿔룽).
  - From 50 s, `bgm_village` fades in at the game's real balance, so you can hear how the voices sit behind
    the music, just like the old chatter.
- **Listening page:** run `node tools/test/serve.mjs 8000`, then open
  `http://localhost:8000/docs/previews/voice_preview.html`. The page has:
  - a box to type any Korean line and hear it with any voice, with emotion and resident-number pickers (other
    residents of the same type sound slightly different);
  - sample lines;
  - every clip of every voice;
  - a "마을 수다" crowd button that shows the 2-at-a-time limit;
  - a ducking demo, a volume slider, and a "게임 속 크기" switch that plays at the in-game 0.4 bus;
  - the whole dictionary with play buttons.
- **Rebuild:** `python3 -m pip install numpy scipy pyworld "setuptools<81" espeakng-loader`, then run
  `python3 tools/voice/build_voice.py`, which renders, encodes, writes the manifest, `lexicon.js` and the
  dictionary, and runs the QA (about 1.5 min).
  - After editing only keywords: `python3 tools/voice/build_voice.py --lexicon-only`.
  - Demo: `node tools/voice/demo.mjs && python3 tools/voice/demo_mix.py`.
  - `FV_VOICE_PYTHON=/path/to/venv/python` lets the scripts re-run themselves with a venv.

## 10. Known issues and limits

- **Nobody has listened yet.** WORLD resynthesis of eSpeak articulations gives a soft, toy-like vocoder voice
  rather than a recorded human. The designer should judge the cuteness, especially:
  - squeaky, at around 520 Hz;
  - elder tremor;
  - sweet's breathiness;
  - the laughs, whose breathy "h" syllables sit 19–23 dB under the vowels.

  Every voice is one dictionary of parameters in `tools/voice/voices.py` (pitch, range, alpha, speed, breath,
  vibrato), and a rebuild takes about 1.5 min.
- **Decoded memory.** The sprites total 182 s of mono audio. Decoded to 48 kHz float32, that is about 3.3 MB per
  voice and **35 MB if all 10 are loaded**, against about 0.8 MB for the old chatter. Mitigations:
  - load only the types present (`types` option, §7.1);
  - drop the 4 personal words per voice in `EXTRA_WORDS` (about −15 %);
  - drop rarely heard voices on low-memory devices by mapping them to a neighbouring type in `CAST`.
- **Coverage.** Only the 21 core words are guaranteed for every voice. A keyword whose word a given voice did
  not record is simply babbled; for example, kid_girl has no 'dog'. 21 dictionary words are not recorded by any
  voice yet ("사전에만" in the dictionary).
- **Varispeed.** Per-resident and mood offsets use `playbackRate`, so pitch and tempo move together (typically
  within ±3 st, clamped to rate 0.72–1.4). That is fine for babble, but it is not independent pitch control.
- **Keyword matching** is plain substring search, so it can misfire: 그래도 contains 그래 → 뉨 "yes", and 눈
  "snow" is only matched in snow phrases (눈이/눈사람…) to avoid 눈 "eye".
- **mp3 start-delay fallback.** The detection is tested with Chromium only. It assumes the first clip's attack
  (12 ms) rises above −34 dBFS; every sprite starts with the 뽀얌 word.
- **Build reproducibility** depends on the eSpeak NG and libvorbis builds. Another machine can produce slightly
  different bytes; rebuild and run the check there.
