# voice: build, critiques, polish

## Polish (final)

# voice build report — 눈꽃말 (the village language) and its voices

Saved at `/home/user/nurient/frost-village/docs/build_reports/voice.md`.

**VOICE: POLISHED.** This pass fixes the critic review of the first build. Every high and medium issue reproduced and is fixed, except one part of one fix that would have broken the spec (see §11).

I can't listen to audio. Every judgement here comes from measurements, pitch tracking, spectrograms and decoding in headless Chromium. The designer should listen to `docs/previews/voice_demo.mp3` and the preview page before the voices replace the old chatter.

- **The language now sounds less Japanese.** Measured on everything the game says, 27 % of the syllables heard could be Japanese (it was 55 %). Only 5.6 % of the clips heard could be Japanese as a whole (it was 37 %). Those are the designer's own words and the Korean interjections the spec asks for.
- **11 voices.** I added `young_m` and kept `chief`, because the spec requires a chief voice.
  - Each voice is one sprite of 60 clips.
  - The 22 audio files plus the manifest come to 3.50 MB (limit 4 MB).
- **Lines flow instead of sounding like a word list.** Silence inside a line fell from 27 % to 5 %. Pace rose from 4.0 to 5.8 syllables/s.
- **Words with a meaning are heard only when the bubble has that word.** The rest is 28 meaningless babble words, and no single word clip is more than 3 % of what is heard.
- **No clip is shrill.** The highest pitch anywhere in the game is 696 Hz (it was about 1.06 kHz).
- **Checks.** QA passes, with one warning that is the integration step in §7.1. The 29 Node tests, the browser test and a new real-Phaser test all pass. Re-rendering gives byte-identical files.
- **Still needed from the code agents.** The game files are owned by them, so nothing in the game uses the voices yet. The first step is adding `'voice'` to `LATE_FRAGMENTS` in `src/core/Assets.js`; §7 has every step with code.

---

## 1. Files

All of these are files this job owns. No other file was modified.

| path | what |
|---|---|
| `assets/voice/manifest.json` | Audio fragment in the `assets/audio2..6` conventions: `files` [ogg, mp3], `volume`, `loop` false, `kind` "sfx", `duration`.<br>Adds `samples`, `mp3StartPad`, `onset`, `voiceType`, `sprite`.<br>Per-clip `markers` hold `start`, `dur`, `kind` (word / babble / filler / particle / emote), `syl`, `fin` (how it ends), `tail` (quiet end the next clip may overlap), `roman`, `say`, `emote`.<br>A `voices` table also gives each voice's `phoneDrop` / `phoneComp`. |
| `assets/voice/voice_<type>.ogg / .mp3` | 11 mono 44.1 kHz sprites, 21.1–28.2 s each. Vorbis q3; LAME CBR 48 kbps with the gapless tag. |
| `src/voice/VillageVoice.js` | The runtime: planner, scheduler, concurrency, ducking, volume, pause / resume, ready / need, `speakBubble` hook. |
| `src/voice/cast.js` | Voice types (11). Maps character keys to voices, with a role / kind fallback. Gives stable speaker ids and persona pitch tweaks. FNV hash. |
| `src/voice/lexicon.js` | **Generated.** Word id → hangul, romanisation, meaning, category, keywords `kw` (`^` = word start only) and stop list `kwNot`. |
| `src/voice/webaudio.js` | Web Audio backend: bus, channels, per-clip sources, decoder start-delay detection. **Half-rate sprite compaction** (`compactBuffer`) and `memory()`. |
| `src/voice/phaser.js` | Phaser glue `attachVillageVoice(gs, opts)`: late manifest, lazy per-voice loader, cache release, scene pause / resume hooks. Not imported by the game yet. |
| `tools/voice/lexicon.json` | The language data, hand-written. |
| `tools/voice/phonology.py` | Romanisation → eSpeak phonemes and IPA. **Strict Japanese-phonotactics check** (`ja_legal`, `markers`, `stats`). Minionese / Simlish blacklist. |
| `tools/voice/voices.py` | The 11 voices: parameters, recorded word lists, babble windows, emote takes, the 650 Hz pitch ceiling. |
| `tools/voice/prosody.py` | Melodies and timing for words, particles, fillers and emotes: stress, level or rising word ends, emote caps. |
| `tools/voice/render.py` | Renders one clip: articulation → time map → WORLD → post.<br>Unreleased-stop cut-off and open-vowel ring-out; minimum vowel length; soft pitch ceiling. |
| `tools/voice/espeak.py`, `vocoder.py` | eSpeak NG via ctypes, one fresh process per word. WORLD analysis and resynthesis. Both unchanged. |
| `tools/voice/build_voice.py` | Full build: render, level (+ phone compensation), sprite (+ `tail` / `fin`), encode, manifest, `lexicon.js`, dictionary, QA. |
| `tools/voice/check_voice.py` | QA (see §8). Writes `docs/previews/voice_report.txt` and `voice_spectrograms.png`. |
| `tools/voice/heard.mjs` | **New.** Plans every game line through the runtime and counts what the village hears. Used by the QA. |
| `tools/voice/make_dictionary.py` | Writes `docs/눈꽃말_사전.md` from the data. |
| `tools/voice/demo.mjs`, `demo_mix.py` | The demo: the runtime records clip events, which are mixed to mp3 with a transcript. |
| `tools/voice/loudness.py` | Active-speech loudness, plus `phone()` / `phone_drop()`. |
| `tools/voice/deps.py` | Dependency check. |
| `tools/test/voice_runtime.mjs` | 29 Node tests. |
| `tools/test/voice_preview.mjs` | Headless Chromium: the listening page, decoding of all 22 files, a real Web Audio render, half-rate sprites, pause / resume. |
| `tools/test/voice_phaser.mjs` + `docs/previews/voice_phaser_test.html` | **New.** `phaser.js` in a real Phaser 3.90 game: late fragment, lazy load, readiness gate, cache release, scene pause. |
| `docs/눈꽃말_사전.md` | The dictionary (generated). |
| `docs/previews/voice_demo.mp3` + `.txt` | The demo and its transcript. |
| `docs/previews/voice_preview.html` + `.png` | The listening page and a screenshot of it. |
| `docs/previews/voice_report.txt`, `voice_spectrograms.png` | QA output. |

## 2. Method

Neural TTS weights cannot be downloaded (HuggingFace and GitHub are blocked). The voices are built from two classic, deterministic tools.

1. **Articulation: eSpeak NG 1.52.0**, from the PyPI package `espeakng-loader` 0.2.4.
   - Each invented word is spoken as phoneme input with the Finnish table: pure vowels, y / ø / æ, a rolled r, and clusters work.
   - It renders a monotone at about 80 Hz. Only its consonants, vowel formants and phoneme timing are kept.
   - Each word is the first utterance of a fresh helper process, so output is byte-reproducible.
2. **Voice: WORLD vocoder** (pyworld 0.3.5). Analysis is harvest + CheapTrick + D4C at 5 ms. Resynthesis applies:
   - **Time map (`render.time_map`).**
     - Voice speed and snappy consonants (×0.8).
     - **Stress:** the stressed (first) vowel runs ×1.45 at full level with a 2.5 st scoop and the melodic peak. Unstressed vowels run ×0.8 at 0.85 level, never shorter than 32 ms.
     - Measured stressed / unstressed vowel length is **2.03** (median), vocalic nPVI **67**. It was 1.16 / 34, a Japanese-like even rhythm; for reference, Japanese is about 41 and English about 57.
   - **Endings.**
     - A word that ends in a stop (똑땁, 옴뽁, 냠냠뇹) is unreleased like Korean 받침 ㄱ / ㅂ. The vowel runs at full level into the closure, then the sound is cut off in 6 ms (after the room tail too, which keeps only 15 %).
     - A word that ends in an open vowel instead rings out: the last frame is held for about 50 ms while it fades.
     - Decay from the last strong point to −30 dB: unreleased stops **18 ms**, open vowels **58 ms**, nasals / l **57 ms**. In the first build stops and vowels were 32 / 25 ms, so a listener could not tell them apart.
   - **Melody.**
     - Designed per syllable. Words now end **level or rising** (last slope ≥ +0.5 st), so a line is one bouncy chain rather than a list of little falls.
     - The phrase-final fall comes from the runtime: the last word of a statement is played 1.5 st lower, then the falling particle 뇰.
     - Meaning-bearing words keep their own tunes: 뫼? rises, 노뱅 falls.
     - Vibrato; the elders' tremor is now 40–45 cents at 6.5–7 Hz.
     - **A soft pitch ceiling at 650 Hz:** a tanh knee from 553 Hz. No clip is shrill.
   - **Timbre.** Formant warp `alpha`, "smile" lift, tilt, breathiness and soft unvoiced sounds. These are unchanged, but the low voices have more presence (see §5).
3. **Post-processing** reuses the existing `tools/audio/synth.py` (read-only): high-pass, gentle 2.2:1 compression, a 0.32 s room at 7 %, then a trim at −48 dB and fades.
4. **Levelling and sprites.**
   - Every clip is set to the same active-speech loudness, with a limiter keeping peaks at or below −1.8 dBFS.
   - Clips are laid end to end with 40 ms gaps, more than the 25 ms mp3 decoder delay.
   - Each sprite's manifest volume puts its median word at the old `sfx_chatter`'s effective level (−21.1).
   - **Phone compensation:** a voice that loses more than the old chatter through a 550 Hz phone-speaker high-pass gets half of the difference back, at most +1.5 dB. That is big_gruff +0.6 dB, elder_m +0.3, adult_m +0.16, elder_f +0.1.
   - The runtime plays the sprites at the old chatter's 0.4 base gain.

Build time: 40–90 s with cached articulations, about 2 min from scratch.

Re-rendering all 120 clips of two voices in a fresh process gives sample-identical clips. A full rebuild with cached clips gives byte-identical ogg, mp3, manifest and `lexicon.js`.

## 3. Licences and sources

Everything shipped is free for commercial use.

| what | licence | how it is used |
|---|---|---|
| eSpeak NG 1.52.0 (via `espeakng-loader` 0.2.4) | GPL-3.0-or-later | **Build-time tool only.** It speaks our invented phoneme strings, and nothing of eSpeak ships. Under GPL-3.0 §2 a program's output is covered only if its content is a covered work, and synthetic speech of our own words is not. WORLD replaces the voice. |
| WORLD vocoder (M. Morise), via pyworld 0.3.5 | modified BSD / MIT | build time |
| numpy, scipy | BSD | build time |
| ffmpeg + libvorbis (BSD) + LAME (LGPL) | — | encoding, as in every existing audio fragment |
| tools/audio `synth.py`, `ffmpeg_tools.py` | project code | imported read-only |
| the language, words, melodies, voice designs, runtime | **original project work** | — |
| demo bed: `amb_wind`, `bgm_village`, `sfx_dog_bark` | project assets | only inside `voice_demo.mp3` |

- **Analysis only.** `praat-parselmouth` (GPL) was used in my scratch venv to re-run the critic's pitch measurements. It is not used by any project script and nothing of it ships.
- **No borrowed languages.** No Minionese, Simlish or Animalese words or audio are used. `phonology.py` blacklists bello, poopaye, tank yu, bee-do, banana, papoy, hana / dul / sae, sul sul, dag dag, vadish and others, and the build refuses any lexicon entry, babble word included, that contains or resembles one.

## 4. The language — 눈꽃말 (Nunkkot-mal)

### Sounds

- **Vowels:** a e i o u, plus ü [y] (뉘 / 뮈 / 퓌), ö [ø] (뵐 / 뫼 / 푀) and ae [æ] (랭 / 냉). There is also eu [ɯ], only in 브르르.
- **Syllables:** (C)(C)V(C). Onset clusters are bl pl br pr fl fr gl gr kl kr tr; codas are m n ng l r p k. The r is rolled.

### "Does it sound Japanese?" — now measured strictly

`phonology.ja_legal` marks a syllable as Japanese-legal when all of these hold:

- the onset is empty, a single consonant (l counts as Japanese r) or a consonant + y;
- the vowels are a / e / i / o / u / eu;
- the coda is a nasal (ん), a stop before another stop (っ), or the stop of a one-syllable interjection.

The first build counted nasal codas, geminates, reduplication and eu as "not Japanese", which overstated the difference. They count as Japanese now.

What is not Japanese:

- l / r / s codas;
- a word-final stop after the first syllable;
- a stop before a non-stop;
- clusters;
- ü / ö / æ;
- the trill.

Rules enforced by the build (`phonology.check`):

- Every content word must have at least one non-Japanese syllable. The exceptions are the designer's own 꼬맙뿌, 촌촌님 and 우와뿅.
- Every babble word must be at least half non-Japanese syllables.
- `check_voice.py` fails when more than 30 % of the syllables the village hears (play-weighted, every game line through the runtime) are Japanese-legal.

| play-weighted, over the game's 185 Korean bubble lines × 6 speakers | first build | now |
|---|---|---|
| syllables that could be Japanese | 54.8 % | **27.3 %** |
| clips that could be Japanese as a whole | 36.6 % | **5.6 %** (the designer's 촌촌님 / 꼬맙뿌 and the spec's Korean interjections: 흥 / 응 / 앗 / laughs / 야호 / 우와 / 냠냠) |
| dictionary words that could be Japanese | 27 of 78 | **3 of 106** (the designer's words) |
| closed syllables / clusters / ü-ö-æ | 70 / 12 / 19 % | 67 / 25 / 28 % |

### Respelled words

Only the high-frequency words that were fully Japanese-legal were respelled:

| meaning | was | now |
|---|---|---|
| hello | 뽀얌 | 뽀얄 |
| please | 뿌띵 | 뿌띨 |
| funny | 킥뽕 | 킥뽈 |
| cute | 뾰롱 | 뾰롤 |
| ice | 끼링 | 끼릴 |
| eat | 뭄 | 묌 |
| money | 링딩 | 링들 |
| music | 띵롱 | 띨롱 |
| sleep | 뇨롬 | 쿨롬 |
| come | 옹 | 욍 |
| baby | 뽀뇽 | 뽀뉼 |
| when | 엔뎅 | 엘뎅 |
| one | 잉 | 윙 |
| five | 빔빔 | 뵘뵘 |
| big | 봄봄 | 볼봄 |
| small | 찌밍 | 찌밀 |
| the | 드 | 델 |
| you know | 넹 | 넬 |
| hmm | 음 | 윔 |
| so then | 뚜리 | 뚤리 |
| hey | 뵹 | 뵬 |
| question particle | 녹? | 뀰? |
| excited particle | 얍! | 얄! |
| statement particle | 뇽 | 뇰 |

The designer's 꼬맙뿌, 촌촌님 and 우와뿅 are kept as they are.

### Grammar

- Saying a word twice makes a plural or adds emphasis: 뮈 "I" → 뮈뮈 "we", 뿔룽뿔룽 "bye-bye".
- Sentence-end particles: **뀰?** for questions (rising), **얄!** for excitement, **뇰** for a plain statement (falling).
- **뿔** means "very".

### Lexicon (78 entries with meanings)

| category | entries |
|---|---|
| greetings, social | 뽀얄 hello, 뿔룽뿔룽 bye, 꼬맙뿌 thanks, 왈랑 welcome, 뿌띨 please, 뮈앙 sorry |
| answers | 뉨 yes, 노뱅 no |
| feelings | 블룸 good, 우와뿅 wow, 엡뿔 oops, 뵐랑 love, 랄랄 happy, 뮝뮝 sad, 그롱 grumpy, 브릅 scared, 뉠롱 tired, 킥뽈 funny, 뾰롤 cute |
| food | 냠냠뇹 yummy, 퓌뽈 fish, 브랑 bread, 묌 eat, 구룩 hungry |
| nature | 뉘뉘 snow, 뉘블룸 snowflake, 브르르 cold, 뫼옹 warm, 끼릴 ice, 랭 sun, 쁘릴 star, 뮌 moon, 올롱 water, 폭폴 fire |
| things | 똘롬 wood, 옴뽁 home, 마울 village, 링들 money, 블롭 boat, 칙폭 train, 띨롱 music |
| actions | 똑땁 work, 쿨롬 sleep, 플링 play, 프룽 go, 욍 come, 끌룹 help |
| people, animals | 촌촌님 chief, 뮐리 friend, 뽀뉼 baby, 뮈 I, 냉 you, 뮈뮈 we, 왈뽕 dog, 미울 cat |
| questions | 뫼? what, 뉩? who, 올뮈? where, 엘뎅? when, 퓌웅? why, 앙뚤? how |
| numbers, size | 윙 1, 뒬 2, 뜨렘 3, 푀 4, 뵘뵘 5, 볼봄 big, 찌밀 small, 뿔 very |
| fillers | 엘 and, 델 the, 넬 you know, 윔 hmm, 뚤리 so then, 뵬 hey |
| particles | 뀰? 얄! 뇰 |

### Babble (new, 28 words, no meaning)

브뢸까, 플뤼몹, 가릴롭, 쁠림빽, 뛸락, 발뤼, 끄림봅, 뇔빡, 뜨뤼빅, 뽈뤽, 빔블로, 프륄랄, 까블림, 댈롭, 롬뷜, 글뢰모, 퀼뽀릭, 밸삑, 쁠록까, 되뤽, 뾸로, 뜨림발, 플로삑, 귈룸, 브래뽐, 뉙까롭, 돌블립, 끌뢰밀.

- Residents babble these when a line has no keyword. Dictionary words are heard only when the bubble has their keyword, so the share of heard words that carry an unrelated meaning drops from 78 % to **0 %**.
- Each voice records a window of 14 from a hash-shuffled pool. The windows were chosen so the most-heard voices (young_m, adult_m, adult_f, big_gruff) do not share their words, and each word is said by 5–6 voices.

### Keywords

Korean stems in a bubble trigger the matching word: 고마 → 꼬맙뿌, 촌장 → 촌촌님, 생선 / 물고기 → 퓌뽈, 빵 → 브랑, 추워 → 브르르, 정말 / 너무 → 뿔, and so on. The longest keyword wins.

- **`^`** means the keyword must start a word: `^응` matches 응, but not 응원.
- **`kwNot`** lists longer words that contain a keyword but mean something else. For example:
  - water: 물감, 물건, 선물, 물어, 동물, 보물, 물러…
  - fire: 불러, 불어, 배불…
  - star: 특별, 별로…
  - cat: 사냥
  - sleep: 잠깐
  - baby: 이야기
  - very: 아주머니
  - boat: 배가 고…
  - yes: 그래도, 그래서
  - me: 하나는, 신나는…
  - dog: 안개가, 콩콩
- Risky one-character stems were replaced: 방 → 방에 / 방이, 작 → 작은 / 작아, 강 → 강물 / 강가, 냥 → 냥이, 화가 → 화가 나. 고기 no longer means fish, and 일이 no longer means work.
- me, we, water, go and please joined the core words that every voice records.
- Keyword hits that a voice did not record dropped from 45 % to 33 %.

## 5. Voices

| type | who (`cast.js`) | base F0 Hz | measured F0 | range | alpha | speed | breath | smile / tilt | vibrato or tremor | laugh |
|---|---|---|---|---|---|---|---|---|---|---|
| kid_boy | 도윤, 준, 짐꾼 다람 | 332 | 384 | 1.2 | 1.34 | 1.40 | .10 | 2.0 / 0 | 28 c @6.2 | 키히히히히 |
| kid_girl | 하린, 서아, 스케이트 소녀 | 382 | 441 | 1.25 | 1.38 | 1.36 | .12 | 2.0 / 0 | 30 c @6.5 | 히히히힛 |
| adult_m | 상인, 나무꾼, 광부, 어부… | 165 | 186 | 1.05 | 1.12 | 1.25 | .07 | 1.8 / 0 | 20 c @5.5 | 하하하하 |
| **young_m** (new) | 태오, 음유시인, 우체부, 점원 민호, 사냥꾼… | 178 | 205 | 1.15 | 1.18 | 1.30 | .08 | 2.2 / 0 | 22 c @5.8 | 헤헤헷 |
| adult_f | 빵집 아주머니, 대장장이, 의사… | 258 | 303 | 1.2 | 1.22 | 1.30 | .11 | 2.5 / 0 | 24 c @5.8 | 아하하하 |
| elder_m | 할아버지, 선장, 농부 / 광부 영감 | 140 | 156 | 0.9 | 1.04 | 0.98 | .15 | 2.0 / −0.8 | **40 c @6.5 tremor** | 호호호 |
| elder_f | 할머니 | 208 | 231 | 0.95 | 1.15 | 1.02 | .17 | 1.5 / −1.0 | **45 c @7.0 tremor** | 오호호호 |
| chief | the player | 225 | 269 | 1.3 | 1.17 | 1.30 | .07 | 2.5 / 0 | 22 c @5.8 | 아하하핫! |
| big_gruff | 아저씨, 곰돌, 요리사, 경비대장… | 108 | 121 | 1.0 | 0.90 | 1.06 | .09 | 2.5 / −1.2 | 18 c @5.0 | 와하하하 |
| sweet | 약초꾼, 멋쟁이, 점원 미소, 화가… | 290 | 326 | 1.0 | 1.25 | 1.12 | .22 | 3.0 / −0.5 | 26 c @5.6 | 후후히 |
| squeaky | 아기 콩콩 | 420 | 481 | 1.15 | 1.52 | 1.50 | .08 | 1.5 / −0.5 | 40 c @7.2 | 끼히히히히히 |

- **Distinct pitches.** The closest pair is now adult_f / sweet at 1.28 st. Before, kid_boy / sweet and chief / elder_f were both 0.3 st apart; they are now 2.8 st and 2.6 st apart.
- **young_m** splits the old adult_m crowd. adult_m now covers 8 cast keys and young_m 7. Town adults are 40 % adult_f, 20 % adult_m, 20 % young_m, 10 % sweet and 10 % big_gruff. Teens are kid_girl or young_m.
- **Registers within a type.** Residents who share a voice sit on one of five registers (−2.2, −1.1, 0, +1.1, +2.2 st) chosen by their id; it used to be a uniform ±1.4 st. On top come the persona tweaks: toddler +1.5, prankster +1.2, teen −1.6, and so on.
- **Never piercing.** No clip goes above 650 Hz, and the measured clip peak is 641 Hz.
  - The runtime may play a voice only a little higher than recorded: squeaky +1.0 st, kid_girl +2.0, kid_boy +2.5, others +4.5. The highest pitch anywhere in the game is therefore **696 Hz**. Before, a clip peaked at 913 Hz and the runtime could reach about 1.06 kHz.
  - squeaky is now "faster, not higher": speed 1.5, range 1.15, smile 1.5, tilt −0.5. Its 2–5 kHz share fell from 11.2 % to 5.8 % (the critic's measure).
- **Phone speakers.** Low voices got more presence (big_gruff smile 2.5 / tilt −1.2, elder_m tilt −0.8) plus the volume compensation in §2. Across the voices, levels through a phone speaker now spread 0.96 dB (QA measure); it was 2.2 dB.
- **Emotes** (each with its own melody):
  - greet 뽀얄!, laugh (one style per voice), surprise 우와!, sad 흐잉…, grumpy 흥!, question 응?, thanks 꼬맙뿌!, yummy 냠냠~, oops 앗!
  - excited has three takes: **야호!** for lines that cheer (야호 / 신나 / 만세), and **와랄라!** or **뿌룰루!** for other excited lines.
  - For wide-range voices (range > 1.2), question slopes are capped at +7 st and excited targets at +6 st.

## 6. Runtime API (`src/voice/VillageVoice.js`)

```js
import { VillageVoice } from './voice/VillageVoice.js';
const vv = new VillageVoice({ manifest, backend, maxVoices: 2, maxPending: 3, maxWait: 1.2, baseGain: 0.4,
                              volume: 1, maxDur: 2.6, distance: (x, y, sp) => 0..1, loader: (key, type) => {} });
vv.speak(text, speaker, opts)        // -> pooled utterance ({uid, duration, state}) or null
vv.speakBubble(text, who, emoteIcon) // Bubbles.chat hook: icon -> mood, "name\n" line skipped, chief = priority 2
vv.emote(speaker, 'laugh')           // just a one-shot
vv.ready(who)                        // true when that voice can be heard now; if not, asks the loader for it
vv.need(type)                        // fetch a voice type's sprite (once)
vv.plan(text, speaker, opts)         // read-only: {voice, mood, duration, items:[{id, kind, at, dur, tail, rate, gain, kw, hangul}], say}
vv.update(dt)                        // every frame; allocation-free
vv.pause(); vv.resume()              // menus pause the Game scene (phaser.js wires the scene events)
vv.duck(level = 0.35, hold = 0.6)    // under important sfx (fast down, 0.25 s back up)
vv.setVolume(0..1); vv.setEnabled(bool); vv.stop(speaker); vv.stopAll(); vv.isSpeaking(speaker)
vv.setDistanceModel(fn); vv.keysFor(types)
```

### Planning

Planning is deterministic: every random number comes from `mulberry32(FNV(voice | speakerId | text | variant))`. The same line from the same resident always sounds the same.

- **Mood.** The earliest cue in the line wins:
  - laugh: ㅋㅋ / 하하 / 깔깔 / 까르륵 / 껄껄 / 허허 / 키득
  - sad: ㅠ / 흐잉 / 슬퍼
  - grumpy: 흥 / 짜증 / 차가워 / 가만 안 둬 / 야아!
  - oops: 앗 / 이런 / 아이고
  - surprise: 우와 / 와아! / 헉
  - thanks: 고마; yummy: 맛있; greet: 안녕
  - excited: 야호 / 신나 / !! / 최고

  A line whose only cue is a final "!" gets a **bright** delivery (+0.6 st, slightly quicker) and no emote. That covers 46 % of the game's lines; before, all of them were "excited" and 35 % of them got 야호!.
- **Words.** About 1 word per 2.4 Korean syllables, clamped to 1–6, with babble trimmed to `maxDur` (2.6 s).
  - Keywords go first, in text order at proportional positions.
  - The rest is babble, with a 20 % chance of a filler in the middle.
  - No word repeats by chance; now and then a short keyword word is doubled.
- **Particle and emote.**
  - 뀰? ends every question, unless the 응? emote ends it.
  - 얄! follows 25 % of "!" lines.
  - 뇰 follows 40 % of statements.
  - An emote goes at the start (greet, surprise, oops, grumpy) or at the end (the rest). The chance is 92 % when the line opens with the cue and 65 % when the cue comes later.

### Delivery

- **Legato.** Each clip starts where the previous clip's sound ends: its `tail` (the end below −20 dB) is overlapped. The added gap is ((−15…+25 ms) × mood gap + mood pause) × voice tempo, never negative after an unreleased stop, so the closure stays. A real pause of 120–200 ms comes only at a comma or a sentence break.
- **Measured over the game's lines:**
  - pace **5.8 syllables/s** (was 4.0);
  - sound fills **92 %** of each line (critic's audio measure: 5 % silence, was 27 %);
  - 0.5 silent runs per line (was 3.1);
  - median gap after the tail 6 ms.
- **Prosody**, applied through `playbackRate`, so higher is also slightly faster.
  - The speaker's register (five steps), plus the mood: excited +1.5 st, sad −1.7 st with +70 ms pauses, grumpy −1.1 st, and so on.
  - Declination per word.
  - Questions get +1.2 st on the last word, then the rising 뀰?.
  - Statements get −1.5 st on the last word, then the falling 뇰.
  - Rate is clamped between 0.72 and the voice's MAX_UP.

### Scheduling and robustness

- **Lookahead.** Clips are handed to the audio clock 0.12 s ahead.
- **Stalled frames.** A clip handed out more than 50 ms late (stalled frames, or a scene pause without the hook) moves the rest of its line along instead of firing everything at once. The critic's repro used to start 5 clips at 4.300 s; now they start spaced 230–250 ms apart.
- **Pause.** `pause()` takes back clips that have not started and lets the current word finish. `resume()` goes on from there, and waiting lines wait too.
- **Concurrency.**
  - At most 2 lines sound at once.
  - Up to 3 more wait, for at most 1.2 s.
  - A more important line (the chief) preempts with a 40 ms fade.
  - A new bubble from the same speaker replaces what that speaker was saying.
- **Distance.** Checked at the start of a line and 4× a second.
- **Loading.**
  - `speak()` for a voice whose sprite is not decoded returns null and calls `need()`. `ready()` lets the game keep its old chatter for that line.
  - Without a manifest (the fragment is not packaged, or the app is offline), `ready()` stays false.
- **Memory per frame.** `update()` allocates nothing: 300 k frames grew the heap by 3 KB.

### Backend (`webaudio.js`)

- Signal path: per-clip source (+ gain) → channel gain → voice bus (volume × 0.4 × duck) → the game's sound destination, so mute and master volume apply.
- **Start delay.** The decoder start delay is detected per sprite and shifted away when it is more than 12 ms.
- **Half-rate sprites.** On first use each decoded sprite is converted to half its sample rate with a 7-tap half-band filter and 2:1 decimation, about 5 ms per sprite. The voices have nothing above about 10 kHz. `release(key)` lets Phaser drop its full-rate copy.

## 7. Integration plan

This is for the code agents; none of these files were edited.

Every bubble goes through `Bubbles.chat()`: `Resident.say`, `TownSim.chatter`, Neighbours actors and visitors. One hook covers all of them, and the old chatter remains the fallback.

1. **Ship the fragment.** In `src/core/Assets.js`:
   ```js
   export const LATE_FRAGMENTS = ['town', 'townfolk', 'roads', 'audio3', 'voice'];
   ```
   `tools/build/build_artifact.mjs` then packages `assets/voice` like the other late fragments. Add a `test_deploy` check that `assets/voice/manifest.json` and one sprite are in the artifact. Until this line exists, `check_voice.py` prints a WARN.
2. **Create it** in `scenes/Game.js`, in `create()`, after the village systems exist:
   ```js
   import { attachVillageVoice } from '../voice/phaser.js';
   import { voiceFor } from '../voice/cast.js';
   // optional: fetch the voices of the residents already living here (the chief is left out: the player has no bubbles)
   const types = [...new Set(this.life.residents.map(voiceFor).filter((t) => t && t !== 'chief'))];
   this.voice = attachVillageVoice(this, { volume: Settings.data.voice ?? 1, types });   // null without Web Audio
   ```
   Pausing and resuming the Game scene pause and resume the voices automatically (`phaser.js` listens to the scene's `pause` / `resume` events).
3. **Tick it** in `Game.update(time, delta)`, following the sound toggle:
   ```js
   if (this.voice) {
     const on = Audio.started && Settings.data.sound && Audio.live;
     if (on !== this.voice.enabled) this.voice.setEnabled(on);
     this.voice.update(delta / 1000);
   }
   ```
4. **Speak bubbles.** In `systems/Bubbles.js` `chat(who, text, emote, dur)`, right after the bubble is shown:
   ```js
   if (this.gs.voice && !(opts && opts.silent)) this.gs.voice.speakBubble(text, who, emote);
   ```
   Give the info card in `Neighbours.js` (`B.chat(w, s, …)` with the `tfCard` text) an `opts.silent`; it is not speech.
5. **Keep the old chatter as the fallback**, gated by readiness and not just by existence. In `systems/VillageLife.js`:
   ```js
   chatter(r) {
     if (this.gs.voice && this.gs.voice.ready(r)) return;     // 눈꽃말 spoke through Bubbles.chat
     ...old sfx_chatter code (first line of a not-yet-loaded voice, no Web Audio, fragment missing)...
   }
   sfxLaugh(r) { if (this.gs.voice && this.gs.voice.ready(r)) this.gs.voice.emote(r, 'laugh'); else this.life.sfx('sfx_laugh', r.x, r.y, 0.45); }
   ```
   Change the two direct `life.sfx('sfx_laugh', …)` calls the same way (the snowball-tag and snowman events, around lines 1324 and 1469): `const v = gs.voice; v && v.ready(o) ? v.emote(o, 'laugh') : …`. `TownSim.chatter()` needs no change, because its `B.chat` already speaks.
6. **Duck only under milestone sounds, not on every sale.** In `core/Audio.js` `play()`, after `this.sm.play(k, cfg)`:
   ```js
   if (this.onImportant && /^sfx_(levelup|complete|unlock|build_done|hire|mission_done|fame_up)$/.test(k)) this.onImportant();
   ```
   and in `Game.create`: `Audio.onImportant = () => this.voice && this.voice.duck(0.35, 0.7);`. `sfx_cash` and `sfx_register` play on every sale and must not duck.
7. **Settings.** `Settings.load()` currently drops unknown keys, so the volume would not be saved. In `core/Save.js`:
   ```js
   data: { sound: true, music: true, lang: null, zoom: null, daynight: true, voice: 1 },
   // in load():
   this.data.voice = typeof s.voice === 'number' && s.voice >= 0 && s.voice <= 1 ? s.voice : 1;
   ```
   Add a "주민 목소리" slider next to the sound toggle that calls `Settings.save()` and `gs.voice && gs.voice.setVolume(v)`.
8. **Chief lines** get priority 2 automatically in `speakBubble`. Scripted moments can call `gs.voice.speak(text, gs.player, { priority: 2, emotion: 'thanks' })`.

### Memory

The 11 sprites hold 263.6 s of mono audio.

- Decoded at a 48 kHz context, that is about 4.6 MB per voice. The backend keeps each sprite at half rate: about **2.0–2.6 MB per voice**, 25 MB if all 11 were loaded.
- Only the voices that actually speak are loaded. The chief never loads unless something makes the player speak.
- A typical village with 8 types is about **18 MB**. Before, all 10 were loaded at full rate: 35 MB.
- The old chatter used about 0.8 MB.

## 8. QA numbers

`python3 tools/voice/check_voice.py` → **RESULT: OK** (`docs/previews/voice_report.txt`). The one WARN is the integration step in §7.1.

| key | clips | s | vol | effective | word spread dB | peak ogg/mp3 dBFS | >6 kHz % | F0 Hz (base) | range st | KB |
|---|---|---|---|---|---|---|---|---|---|---|
| voice_kid_boy | 60 | 21.97 | 0.400 | −20.99 | 0.35 | −1.52 / −1.87 | 0.69 | 384 (332) | 4.7 | 278 |
| voice_kid_girl | 60 | 22.70 | 0.400 | −21.00 | 0.32 | −1.55 / −1.90 | 0.70 | 441 (382) | 4.8 | 288 |
| voice_adult_m | 60 | 23.39 | 0.414 | −20.84 | 0.94 | −1.45 / −1.71 | 0.53 | 186 (165) | 4.2 | 292 |
| voice_young_m | 60 | 22.59 | 0.415 | −20.95 | 0.88 | −1.31 / −1.97 | 0.61 | 205 (178) | 4.5 | 281 |
| voice_adult_f | 60 | 22.54 | 0.401 | −21.01 | 0.46 | −1.39 / −1.77 | 0.52 | 303 (258) | 5.0 | 280 |
| voice_elder_m | 60 | 28.23 | 0.422 | −20.69 | 1.12 | −1.00 / −1.71 | 0.26 | 156 (140) | 3.9 | 350 |
| voice_elder_f | 60 | 26.93 | 0.406 | −20.89 | 0.74 | −1.40 / −1.69 | 0.31 | 231 (208) | 4.1 | 330 |
| voice_chief | 60 | 22.68 | 0.401 | −20.99 | 0.45 | −1.36 / −1.54 | 0.68 | 269 (225) | 4.8 | 281 |
| voice_big_gruff | 60 | 26.41 | 0.444 | −20.40 | 0.97 | −1.27 / −1.44 | 0.08 | 121 (108) | 4.3 | 328 |
| voice_sweet | 60 | 25.05 | 0.400 | −21.00 | 0.66 | −1.38 / −1.70 | 0.40 | 326 (290) | 4.3 | 312 |
| voice_squeaky | 60 | 21.08 | 0.400 | −21.00 | 0.33 | −1.61 / −1.97 | 0.55 | 481 (420) | 4.8 | 268 |

### Levels and files

- **Effective level.** The old chatter is at −21.14. The voices sit at −21.0 ± 0.15, plus their phone compensation (big_gruff −20.40 = −21.0 + 0.6).
- **Clean audio.**
  - No clipped samples, and DC ≤ 0.0003.
  - Clip edges ≤ 0.017, so no clicks.
  - Gaps between clips ≤ −55.9 dBFS.
  - Energy above 6 kHz ≤ 0.7 %.
- **Clip lengths.** Words 0.17–0.82 s (median 0.34); emotes 0.16–0.67 s.
- **Payload** 3,499,418 bytes.

### New checks, all passing

- **Pitch.**
  - Voice types at least 1 st apart; the closest pair is 1.28 st.
  - Clip peak 641 Hz, the two pitch trackers agreeing; in-game maximum 696 Hz (limit 760).
- **Phone-speaker levels.** Spread 0.96 dB (limit 2).
- **Endings.** Unreleased stops 18 ms vs open vowels 58 ms (stops ≤ 25 and vowels ≥ 45 required).
- **Stress.** Stressed / unstressed ratio 2.03 (≥ 1.6 required), nPVI 67 (≥ 50 required).
- **What the village hears** (`heard.mjs`: 1110 planned lines, 3844 clips):
  - Japanese-legal syllables **27.3 %** (≤ 30 % required);
  - the most-heard word **2.97 %** (쁠록까; ≤ 3.5 % required); the particles are 뇰 3.67 % and 얄! 3.25 %;
  - the most common emote ending **2.4 %** of lines (응?; ≤ 8 % required);
  - pace **5.8 syllables/s** (≥ 5.5 required).

### Tests

- **Node:** `node --expose-gc tools/test/voice_runtime.mjs` → **29 passed, 0 failed**. Beyond the earlier coverage (determinism, length, prosody, keywords, concurrency, queue, priority, distance, ducking, volume, not-loaded, no per-frame allocation), it now covers:
  - legato delivery (median gap after the tail 11 ms, 5.8 % silence);
  - polish moods (hit lines grumpy, laughs, 와아; a bare "!" gets no emote and no 야호!; 야호! only for cheering lines);
  - the keyword stop lists: 15 game lines that used to misfire, plus 5 that must still match;
  - register steps and squeaky's pitch limit;
  - pause / resume;
  - stalled frames (spaced, not a burst);
  - lazy loading (ready / need / loader called once / no manifest → not ready).
- **Browser:** `node tools/test/voice_preview.mjs` → **ALL PASS**.
  - All 22 files decode in Chromium to the right length; clips start within 8.3 ms, under the 12 ms decoder rule.
  - A real Web Audio render sounds while speaking and is silent after, peaks at 0.55, and never has more than 2 voices.
  - Sprites are held at 22.05 kHz: 6.3 MB instead of 12.7 MB for three voices.
  - Pause / resume in Web Audio: RMS 0.047 while speaking, 0 while paused, 0.062 after resume.
  - The typed line "촌장님, 생선 사세요!" → 촌촌님 퓌뽈 ….
- **Phaser:** `node tools/test/voice_phaser.mjs` → **ALL PASS**.
  - In a real Phaser 3.90 game the fragment merges late.
  - The aunt is not ready before her sprite decodes; only `voice_adult_f` is fetched; then she speaks.
  - The sprite is held at half rate, and Phaser's full-rate copy is dropped from the cache.
  - Scene pause and resume pause and resume the voices.

### The critic's own scripts, re-run on the new build

| measure | before | after |
|---|---|---|
| clips on the first frame after a 4 s pause | 5 at 4.300 s | 1 (the rest spaced) |
| lines mapped to excited / 야호! endings | 51 % / 19.5 % | bright delivery only / 0.5 % |
| top-10 share / distinct clips / entropy | 60.2 % / 62 / 4.91 bits | 27.7 % / 84 / 5.79 bits |
| Japanese-legal syllables / clips | 54.8 % / 36.6 % | 27.4 % / 5.6 % |
| silence inside lines / silent runs per line | 27 % / 3.1 | 5 % / 0.5 |
| decay: stop-final vs vowel-final | 32 / 25 ms | 19 / 71 ms |
| phone spread across voices | 2.24 dB | 1.3 dB |

## 9. How to listen

- **Demo:** `docs/previews/voice_demo.mp3`, 63.2 s, −16.7 LUFS. `voice_demo.txt` lists each bubble and what is heard.
  - 0–27 s: all 11 voices say hello and something in character. For example the boy says "안녕! 콩이랑 같이 놀자!" → 뽀얄! 왈뽕 플링 플로삑 얄!
  - 28 s on: a snowy-day scene.
    - Three neighbours chat: greeting, gossip, and a joke with laughter (헤헤헷 / 와하하하).
    - A question and answer: the kid asks "축제는 언제 해요?" (… 뀰?) and the chief answers 와랄라!.
    - The chief thanks the baker (… 냠냠뇹 꼬맙뿌!).
    - The kids squeal at the dog, which barks back.
    - Grandpa grumbles (흥! …) and then laughs (호호호), and grandma slips (앗! …).
    - Everyone says goodbye (뿔룽뿔룽).
  - From 50 s, `bgm_village` fades in at the game's balance.
- **Listening page:** run `node tools/test/serve.mjs 8000` and open `http://localhost:8000/docs/previews/voice_preview.html`. The page has:
  - a box to type any Korean line and hear it in any voice; keyword words are underlined;
  - emotion and resident-number pickers;
  - every clip of every voice, grouped as emotes, words and babble;
  - the crowd button (2 at a time), the ducking demo, a volume slider and the in-game level switch;
  - the whole dictionary.
- **Rebuild:** `python3 -m pip install numpy scipy pyworld "setuptools<81" espeakng-loader`, then `python3 tools/voice/build_voice.py`.
  - After editing keywords only: `--lexicon-only`.
  - Demo: `node tools/voice/demo.mjs && python3 tools/voice/demo_mix.py`.
  - What the game says: `node tools/voice/heard.mjs`.

## 10. Known issues and limits

- **Nobody has listened yet.** WORLD resynthesis of eSpeak gives a soft, toy-like vocoder voice, not a recorded human. The designer should judge especially:
  - the stronger stress bounce;
  - legato delivery, which is now faster;
  - squeaky, now faster rather than higher;
  - the elder tremor at 6.5–7 Hz;
  - young_m against adult_m.

  Every voice is one parameter dictionary in `tools/voice/voices.py`, and a rebuild takes 1–2 min.
- **Particles are the most frequent clips.** 뇰 is 3.7 % and 얄! 3.3 % of what is heard. That is grammar, like Korean 요; every word and babble clip is ≤ 3 %.
- **Keyword coverage.** A keyword whose word a voice did not record is babbled instead: 33 % of hits, mostly big, cute, oops and dog in the adult voices. Each extra core word costs about 0.3 s per voice.
- **Varispeed.** Register and mood offsets go through `playbackRate`, so pitch and tempo move together, within 0.72 to MAX_UP.
- **Decoded memory** is 2.0–2.6 MB per loaded voice (§7). That is still well above the old chatter.
- **Pitch tracking.** Harvest misreads one squeaky babble clip, 쁠림빽, as 822 Hz; Praat and DIO give 537 Hz. The QA uses the lower of two agreeing trackers.
- **Reproducibility** depends on the eSpeak NG and libvorbis builds. Another machine may produce slightly different bytes; rebuild and run the check there.

## 11. Critic issues → outcome

| # | issue (severity) | outcome |
|---|---|---|
| 1 | `voice` not shipped: not in LATE_FRAGMENTS; `if (gs.voice) return` would silence residents (high) | **Fixed on my side; one line left for the code agents.**<br>`ready(who)` gates the fallback (manifest + backend + decoded sprite), and `need()` / `loader` load lazily.<br>§7.1 / §7.5 give the exact `LATE_FRAGMENTS` line and the `ready()`-gated chatter code; `check_voice.py` WARNs until 'voice' is in LATE_FRAGMENTS.<br>Tested in real Phaser. I cannot edit `Assets.js` myself. |
| 2 | Resuming after a menu pause fires every remaining clip at once (high) | **Fixed.** `pause()` / `resume()` are wired to the scene events in `phaser.js`, and a 50 ms resync in `_schedule` covers missing hooks. Node and Web Audio tests added. |
| 3 | 51 % of lines "excited" by "!"; 야호! ends 19.5 %, even on angry lines (high) | **Fixed.**<br>A bare "!" gets a bright delivery and no emote. 얄! (was 얍!) drops from 55 % to 25 %.<br>야호! is used only for 야호 / 신나 / 만세, with two new excited takes (와랄라!, 뿌룰루!).<br>MOOD_RX additions (차가워, 가만 안 둬, 야아, 깔깔, 까르륵, 껄껄, 허허, 키득, 와아), and the earliest cue now wins.<br>야호! endings 0.5 %; the largest emote ending is 2.4 %. |
| 4 | 8 words make up 49 % of what is heard; 78 % unrelated meanings (high) | **Fixed.** 28 meaningless babble words; each voice records 14 in windows balanced by usage. Dictionary words only on keywords. Top word 2.97 %, top-10 27.7 %, unrelated meanings 0 %.<br>**Won't fix:** the "last 8 clips" ring buffer. It makes the same line sound different over time, which breaks the spec's "same line sounds the same" determinism. The larger pool reaches the variety target without it. |
| 5 | The "not Japanese" check overstates itself (medium) | **Fixed.** Strict `ja_legal` with nasal codas, geminates, reduplication and eu counted as Japanese. 24 words respelled; the designer's words kept. Build fails above 30 % play-weighted: now 27.3 % (was 55 %). |
| 6 | List-like delivery: 27 % silence, 4 syllables/s, per-word falls (medium) | **Fixed.** Marker `tail` + legato gaps; pauses only at commas; speeds raised as suggested; level or rising word ends with the phrase-final fall from the runtime; 뇰 at 40 %. Now 5 % silence, 5.8 syllables/s, words ending rising 15 % → 37 %. |
| 7 | No stress contrast: ratio 1.16, nPVI 34 (medium) | **Fixed.** Stressed ×1.45 with scoop 2.5 and the melodic peak; unstressed ×0.8 at 0.85 level; 32 ms vowel floor. Ratio 2.03, nPVI 67, checked in QA.<br>×1.6 / ×0.7 overshot to 2.74 / 78, so it was tuned back. |
| 8 | Final stops fade like open vowels (medium) | **Fixed.** 6 ms cut at the closure, room tail kept at 15 %, 30 ms closure kept before the next clip; open vowels ring out. 18 vs 58 ms (critic's script: 19 vs 71). |
| 9 | Voice pairs collide; tremor too slow; adult_m crowd; ±1.4 st uniform (medium) | **Fixed.** Pitches re-spaced (closest pair 1.28 st); tremor 6.5–7 Hz; **young_m added** with chief kept, since the spec requires a chief voice and it is cheap with lazy loading; five register steps. |
| 10 | squeaky / kid_girl shrill: 913 Hz clips, ~1.06 kHz at runtime, bright 2–5 kHz (medium) | **Fixed.** 650 Hz soft ceiling, per-voice MAX_UP, the suggested squeaky / kid_girl parameters and emote caps. Max 696 Hz in game; squeaky 2–5 kHz 11.2 → 5.8 %. |
| 11 | Ducking on `sfx_cash` every sale (medium) | **Fixed in the plan** (§7.6): milestone sounds only. |
| 12 | Keyword misfires (물감, 솔방울, 건강, 제일이야, 그래도, 배가 고파…) and 45 % unheard hits (medium) | **Fixed.** `kwNot` stop lists, `^` word-start keywords, risky stems replaced, 5 words promoted to the core. All listed misfires are gone (tested). Unheard hits 45 → 33 %. |
| 13 | All sprites loaded, 35 MB decoded, chief never speaks (medium) | **Fixed.** Default is lazy per-voice loading (`opts.types` optional), and the chief loads only if it speaks. Half-rate sprites, with the Phaser copy released (tested). About 18 MB for a typical village; figures in §7. |
| 14 | Low voices lose more on phone speakers (low) | **Fixed.** More presence for big_gruff and elder_m, plus up to +1.5 dB volume compensation (big_gruff +0.6). Phone spread 2.24 → 0.96–1.3 dB. |
| 15 | Settings would not save a `voice` key (medium, plan) | **Fixed in the plan** (§7.7), with the exact `Save.js` lines. |
| — | Other low issues (the review text I received was cut off after #14) | **Not reproduced.** I re-ran the critic's remaining script `onset.py`: 5 of 660 clips put more than 25 % of their peak in the first 5 ms. They are the vowel-initial words with a 12 ms attack (올롱, 옴뽁, 우와!), and the first 2 ms stay ≤ 1 % of the peak, so there are no clicks. Clip edges ≤ 0.017 in QA. |

## Critiques

```json
[
 {
  "verdict": "polish",
  "summary": "The build is solid and shippable in principle. The pipeline is deterministic, clips are loudness-matched (−21.00 vs the old chatter's −21.14), there are no clicks or clipping, and the spectrum is clean (>6 kHz ≤1%). Jitter and HNR are in the same range as the old chatter, so there is no sign of robotic buzz. The runtime is allocation-free and its concurrency limits work. The most-heard content words (마울, 뉘뉘, 브랑, 퓌뽈, 뮐리) carry strong non-Japanese cues, a real step up from the old chatter, which was 100% CV syllables.\n\nMeasurements show several problems that should be fixed before it replaces the chatter.\n\nIntegration:\n- 'voice' is missing from LATE_FRAGMENTS, so the artifact build never ships the voice files. Together with the planned `if (gs.voice) return` in chatter(), the published village would go silent.\n- After a menu pause (scene.pause('Game')), every remaining clip of a line plays at the same instant. A simulation reproduced this: 5 clips started at t=4.300.\n\nVariety and mood:\n- 51% of the game's lines map to 'excited' just because they contain '!'. 야호! ends 19.5% of all lines, including angry hit lines.\n- 8 babble words make up 49% of the words heard. In the 64 s demo, 뉘뉘 plays 8 times and 링딩 7 times.\n\nLanguage and prosody:\n- The build's 'not Japanese' check overstates itself: it counts nasal codas (ん), stop+stop (っ), reduplication and ㅡ [ɯ] as non-Japanese. Under strict rules, 55% of heard syllables and 37% of clip plays are fully Japanese-legal, and 27 of 78 lexicon words are too, e.g. 끼링 = 'kirin'.\n- Rhythm is even (nPVI-V 34; stressed vowels only 1.16× unstressed; vowels 62–101 ms).\n- Delivery is choppy: 27% of each line is silence, with about 3 pauses of roughly 130 ms per line. The pace is 4.0 syllables/s against the old chatter's ~7, and 72% of words end in their own fall. That reads more as a recited word list than as bouncy Minion-style chatter.\n- Final stops fade out like open vowels (−6 to −30 dB in 32 ms vs 25 ms), so 똑땁 and 옴뽁 are likely heard as open syllables.\n\nVoices:\n- Several pairs nearly collide: kid_boy 316 Hz vs sweet 310 Hz, chief 233 Hz vs elder_f 237 Hz. adult_m covers 15 cast keys with only ±1.4 st of variation.\n- squeaky peaks at 913 Hz in clips and up to about 1.06 kHz at runtime.\n- On a simulated phone speaker, big_gruff loses 3.5 dB vs squeaky's 1.1 dB.\n\nPlan accuracy:\n- Ducking on sfx_cash would trigger on every sale.\n- Settings.load ignores a 'voice' key, so the volume setting would not be saved.\n- Loading all 10 sprites costs about 35 MB decoded, including the chief voice, which never speaks.\n- Single-syllable keywords misfire on about 10 of the 185 lines: 물감/선물 → water, 솔방울/금방 → home, 건강 → water, 제일이야 → work.\n\nAll of these have concrete parameter or code fixes below.\n\nEvidence scripts and outputs are in /tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/voice_critic_sound/ (acoustic.py, plans.mjs, kw.mjs, jlegal.py, timing.py, decay.py, seq.py, phone.py, pause.mjs, onset.py, out/).",
  "issues": [
   {
    "severity": "high",
    "area": "integration / shipping (core/Assets.js LATE_FRAGMENTS, tools/build/build_artifact.mjs, src/voice/phaser.js, voice.md §7 step 4)",
    "problem": "The artifact build packages only FRAGMENTS + LATE_FRAGMENTS, and 'voice' is in neither, so assets/voice/** is not shipped. attachVillageVoice() returns a non-null VillageVoice before its manifest loads, and ready() returns silently when the manifest fails. The plan's `chatter(r){ if (this.gs.voice) return; }` therefore makes residents mute: permanently in the published game, and in dev until all sprites decode.",
    "evidence": "Assets.js:27 `LATE_FRAGMENTS = ['town','townfolk','roads','audio3']`. build_artifact.mjs:312-319 lateFragments() and :436-440 copy only those folders. grep finds no mention of LATE_FRAGMENTS or the artifact in docs/build_reports/voice.md. phaser.js ready(): `if (!man) return;`, and vv is returned regardless.",
    "fix": "(1) Add 'voice' to LATE_FRAGMENTS (the build already drops .ogg under file pressure; the mp3 path is covered by startShift). (2) Add `VillageVoice.ready(who)` = manifest merged && backend && backend.has(key of voiceFor(who)). Use it as the fallback gate: `chatter(r){ if (this.gs.voice && this.gs.voice.ready(r)) return; ...old sfx_chatter... }`, and the same in sfxLaugh and the two direct sfx_laugh calls. (3) Add a voice manifest/sprite check to test_deploy."
   },
   {
    "severity": "high",
    "area": "runtime scheduling (VillageVoice._schedule / update) vs scene pause",
    "problem": "UI menus pause the Game scene (UI.js:540 m.pause('Game')), so voice.update() stops while the AudioContext keeps running. On resume, _schedule hands every overdue clip to play() with when<now→now, so all remaining words of the line start at the same instant: a 4–5 word chord burst, about +7 dB.",
    "evidence": "pause.mjs: speak a 6-clip line, advance 0.3 s, jump the clock 4 s with no update, then call update once. Result: 5 clips handed out with start times 4.300, 4.300, 4.300, 4.300, 4.300.",
    "fix": "In _schedule: `const late = now - (u.t0 + it.at); if (late > 0.05) u.t0 += late;`, which resumes the line where it stopped, or `_halt(u)` when late > 0.3. Also in Game.create: `this.events.on('pause', () => this.voice && this.voice.stopAll())`. Add a Node test for it."
   },
   {
    "severity": "high",
    "area": "variety / mood mapping (VillageVoice MOOD_RX, moodOf weak exclaim, emote/particle chances)",
    "problem": "Ending a line with '!' alone makes it 'excited', which then gets the excited emote 야호! (35%) or particle 얍! (55%). Over the game's own lines, 야호! becomes the single most characteristic sound, and it also lands on angry and surprised lines.",
    "evidence": "plans.mjs over all 185 LINES.ko × 6 speakers (1110 plans): moods excited 564 (51%), neutral 366. Line endings: 야호! 216 (19.5%), 얍! 194, 뇽 163; only 413 (37%) end on a word. kw.mjs: hitAngry '차가워!!', '야아!', '가만 안 둬!' → excited (sample plan: '야아! -> 퓌뽈 야호!'). '깔깔깔!', '까르륵!', '껄껄 …!' → excited instead of laugh. '와아! 새 구역이다!' misses surprise because the regex is `^와[!~]`.",
    "fix": "(1) In _plan, a weak (punctuation-only) exclaim gets no emote (`want = mo.weak && mood==='excited' ? 0 : …`), and the 얍! particle drops 0.55→0.3. Reserve 야호! for explicit cues (야호|신나|만세). (2) MOOD_RX: grumpy += /차가워|가만 안 둬|^야아+|에잇/; laugh += /깔깔|까르륵|껄껄|허허|키득/; surprise: change /^와[!~]/ → /^와+아*[!~]/. (3) Render 2 more excited takes per voice with different melodies (or two new non-Japanese words) and pick one by hash. Target: no single clip above 3% of plays and no emote ending more than 8% of lines."
   },
   {
    "severity": "high",
    "area": "variety: babble pool (VillageVoice BABBLE_CAT, voices.py CORE/EXTRA words)",
    "problem": "Each voice babbles from about 10 dictionary words, all identical recordings, so a handful of words dominate everything heard. 78% of the words heard are content words with an unrelated dictionary meaning, which undercuts the dictionary. Example: grandma's '아이고 우리 강아지, 따뜻하게 입어라~' → '앗! 링딩 음 브랑 뫼옹 푀' = oops, money, hmm, bread, warm, four.",
    "evidence": "plans.mjs: 62 distinct clips heard, top-10 = 60.2% of plays: 마울 7.7%, 뉘뉘 6.3%, 똑땁 6.2%, 브랑 6.1%, 옴뽁 6.0%, 야호! 5.8%, 링딩 5.8%, 뮐리 5.6%, 퓌뽈 5.5%. 8 babble words = 49% of word plays. The demo transcript (28 lines / 64 s) has 뉘뉘 ×8, 링딩 ×7, 옴뽁/브랑/뮐리/마울 ×6.",
    "fix": "Add 12–14 meaningless babble words per voice (2–3 syllables, built from the same non-Japanese inventory, not in the dictionary, e.g. 'bröl.ka', 'flü.mop', 'ga.ril.lop'). Use them as the babble pool; dictionary words then sound only for keyword hits. Budget: about 12 × 0.3 s × 10 voices = 36 s, roughly +0.5 MB (total about 3.0 MB < 4 MB). In the runtime, add an allocation-free ring buffer of the last 8 clip ids per voice type and skip recently used ones when choosing babble."
   },
   {
    "severity": "medium",
    "area": "language: 'not Japanese' check and metrics (tools/voice/phonology.py markers/stats, check_voice report)",
    "problem": "markers() counts as non-Japanese several things Japanese has: nasal codas (Japanese ん), stop+stop (Japanese っ geminate), reduplication (the canonical Japanese mimetic template, e.g. ぽんぽん) and 'eu' [ɯ] (the Japanese u vowel). The reported 73–75% closed / 18% non-aeiou therefore overstate the difference. Several words pass the check yet are fully katakana-able, and some are real Japanese or Japanese mimetics.",
    "evidence": "jlegal.py, strict Japanese phonotactics (N for any nasal coda, Q for a stop before a stop, ɯ for eu): 54.8% of heard syllables (play-weighted) are Japanese-legal, and 36.6% of all clip plays are fully Japanese-legal clips. 27 of 78 lexicon words are fully legal: 뽀얌 po.yam, 꼬맙뿌 ko.map.pu (komappu), 끼링 ki.ring (= kirin, a real Japanese word), 링딩 ling.ding (5.8% of plays), 촌촌님 (chonchon), 뾰롱 (pyoron), 우와뿅 (pyon), 빔빔/봄봄 (CVN-CVN), 뇨롬, 찌밍, 넹, 음, 뇽, 녹, 얍. Builder metric on the same heard set: closed 70.1%, cluster 12.3%, non-aeiou 19.3%.",
    "fix": "Rewrite markers(): non-Japanese = l/r coda, word-final p/t/k, a stop coda before a different-place consonant, an onset cluster, ü/ö/æ, or a diphthong. Remove 'redup' and 'eu' as markers. Report the strict Japanese-legal share in check_voice and fail the build if it exceeds about 30% of play-weighted syllables. Respell the high-frequency legal babble/filler items, e.g. 링딩→링들 ling.dül, 넹→넬 nel, 뇽→뇰 nyol, 끼링→끼릴 ki.ril. Keep the designer's 꼬맙뿌 and 촌촌님."
   },
   {
    "severity": "medium",
    "area": "prosody / rhythm (VillageVoice gapW + clip tails; prosody.py WORD_PATTERNS)",
    "problem": "Lines are delivered word by word with a pause after each word, and each word carries its own complete high-to-low fall. That sounds like reading a list rather than fast, bouncy Minion-style chatter, and the per-word H-L falls with pauses resemble Japanese pitch-accent phrasing. The design doc asks for '살짝 높고 빠르게'.",
    "evidence": "seq.py renders 135 planned lines from the sprites: 27% of each utterance is below −35 dB, with 3.1 silent runs ≥40 ms per line (median 130 ms). plans.mjs: 4.02 눈꽃말 syllables/s including gaps; the old chatter is about 7 (sfx2.py: 3–4 syllables in 0.50–0.59 s). Inter-clip gaps p10/median/p90 = 24/67/138 ms on top of each clip's reverb/fade tail. acoustic.py: 72% of word clips end ≥2 st below their peak (median −3.6 st), and only 15% end rising.",
    "fix": "(1) Store each marker's `tail` (time the clip spends below −20 dB at its end) and schedule the next clip at `at + (dur − tail)/rate`. Set gapW = (−0.015 + rnd*0.04)·P.gap·tempo, keeping the 120–200 ms pause only at commas. Target ≤10% silence and ≥5.5 syllables/s. (2) Speed: adult_m 1.06→1.25, adult_f 1.12→1.3, chief 1.16→1.3, kid_boy 1.24→1.4, kid_girl 1.2→1.36. (3) Change non-final WORD_PATTERNS endings to level or rising (last slope ≥ +0.5 st). The phrase-final fall comes from the runtime: last word −1.5 st, and 뇽 at 50% instead of 30%. Or render a 'medial' take of the 8 core babble words (about +26 s, +0.35 MB)."
   },
   {
    "severity": "medium",
    "area": "prosody / Minion bounce (prosody.py nucleus dur, render.py timing)",
    "problem": "There is almost no stress contrast: every syllable has dur 1.0 and gain 1.0. With eSpeak's Finnish syllable-timing this gives an even, mora-like rhythm with very short vowels, which is a Japanese-like cue and the opposite of the Minions' stretched, swooping stressed vowels.",
    "evidence": "timing.py replicates render_clip timing for all 310 word clips. Stressed/unstressed vowel duration ratio median 1.16 (p10 0.72). Final/non-final ratio 0.86. Within-word vocalic nPVI 34 (reference values: Japanese ≈41, Spanish ≈30, English ≈57). Vowel medians: 62 ms (squeaky) to 101 ms (elder_m).",
    "fix": "In word_plan: stressed nucleus dur 1.0→1.6 with gain 1.0, unstressed dur 0.7 with gain 0.85, and put the melodic peak and overshoot on the stressed vowel (scoop 1.6→2.5 st on it only). Overall word length stays about the same, while the stressed/unstressed ratio rises to about 2 (nPVI ≈55–60). Check it in check_voice."
   },
   {
    "severity": "medium",
    "area": "articulation of final stops (render.py level track: last_voiced ramp to 0.22, stop gain 0.08, 20 ms dry fade)",
    "problem": "Words that end in an unreleased stop (똑땁, 옴뽁, 블롭, 냠냠뇹, 녹, 얍) end the same way as open-vowel words. The 받침 cue (an abrupt cut-off of a full-level vowel) is lost, so listeners are likely to hear tok-ta, om-po, blo: open CV endings.",
    "evidence": "decay.py, time from the last point within 6 dB of peak to −30 dB: stop-final words median 32 ms (n=53), vowel-final 25 ms (n=51), nasal-final 86 ms, liquid-final 83 ms. Stop-final and vowel-final words are therefore indistinguishable by their decay.",
    "fix": "In render_clip: when the last sound is a stop, do not apply the 0.22 release ramp. Hold the vowel at full gain to the closure, cut to silence within 6–8 ms, and add a 25–35 ms silent closure (optionally a −24 dB burst for p/k). For open-vowel finals, let the vowel decay over 60–90 ms instead (gain ramp over the last 40% to 0.15) so the two endings contrast."
   },
   {
    "severity": "medium",
    "area": "voice distinctness (voices.py VOICES, cast.js, VillageVoice spkSt)",
    "problem": "Several voice types nearly coincide in pitch. The elder tremor is too slow to hear on such short vowels. Residents who share a type differ only by a ±1.4 st varispeed, and adult_m is by far the most common type.",
    "evidence": "acoustic.py measured median F0 / spectral centroid: kid_boy 316 Hz / 991, sweet 310 / 908 (0.3 st apart); chief 233 / 916, elder_f 237 / 803 (0.3 st apart); adult_f 276. Elder vibrato is 5.0–5.4 Hz on 95–101 ms median vowels, less than half a cycle per vowel. CAST: adult_m covers 15 of 52 keys, and the town hash gives adult_m about 23%. With a uniform ±1.4 st offset, about 1/3 of same-type pairs are within 0.5 st of each other. Same text from two adult_f residents: '뿔 브르르' vs '뿔 브르르 뇽' (rates 1.055 vs 1.10).",
    "fix": "kid_boy f0 290→330, alpha 1.30→1.34. kid_girl f0 345→380. elder_f f0 225→195, vib (36,5.4,0.6)→(45,7.0,0.7). elder_m vib→(40,6.5,0.7). Add a second adult male timbre 'young_m' (f0 195, alpha 1.18, speed 1.3, breath .08) and assign half the adult_m keys and citizens to it by hash (+1 sprite, about 0.23 MB; drop 'chief' to pay for it). Runtime: spkSt from 5 quantised bins {−2.2, −1.1, 0, +1.1, +2.2} st by hash instead of uniform ±1.4."
   },
   {
    "severity": "medium",
    "area": "cuteness vs shrillness (squeaky / kid_girl in voices.py, prosody emotes, runtime rate)",
    "problem": "squeaky and some kid_girl emotes go above 700 Hz. Runtime pitch offsets push the toddler past 1 kHz. Both are also much brighter in the 2–5 kHz band than the old chatter, the region where phone speakers are loudest, so they are likely to sound piercing rather than cute.",
    "evidence": "acoustic.py: 11 clips >700 Hz, all squeaky: 야호! 913 Hz, 앗! 851, 우와! 838, 응? 836, laugh 820. kid_girl peaks at 628 Hz. Runtime max rate for npc_toddler is 1.161 → about 1.06 kHz. 2–5 kHz energy share: squeaky 11.2%, kid_girl 8.9%, old chatter 1.5% (+8.7 dB / +7.7 dB in that band at equal loudness).",
    "fix": "squeaky: f0 470→420, range 1.45→1.15, smile 3.0→1.5, tilt 0.5→−0.5, speed 1.36→1.5 (keep it fast, not higher). kid_girl smile 3.0→2.0. In the emote specs, cap 'question' slope at +7 st and 'excited' st at +6 for range>1.2 voices. Runtime: a per-voice maxUp ({squeaky:1.5, kid_girl:2.5, kid_boy:2.5} st) when clamping rate, so absolute F0 stays below about 750 Hz."
   },
   {
    "severity": "medium",
    "area": "integration: ducking (voice.md §7 step 5)",
    "problem": "The proposed duck regex includes sfx_cash, which plays on every sale, so voices would be ducked constantly in a busy shop.",
    "evidence": "Seller.js:354 `Audio.play('sfx_cash', {volume:0.55, throttle:250})` on every sale. Register.js:103/178 also fall back to sfx_cash. The plan's duck is 0.35 for 0.7 s each time.",
    "fix": "Duck only on milestone sounds: /^sfx_(levelup|complete|unlock|build_done|hire|mission_done|fame_up)$/. Drop sfx_cash."
   },
   {
    "severity": "medium",
    "area": "keyword mapping (lexicon.json kw, VillageVoice keywordsOf) and coverage",
    "problem": "One-character stems match inside unrelated words. Separately, many keyword hits are not voiced because the speaker's voice did not record that word.",
    "evidence": "kw.mjs over the game's 185 lines: '하늘색 물감', '손주 줄 선물', '서리마을 물건', '안전선 밖으로 물러나' → 올롱 water. '솔방울 마을' ×2, '금방 지어' → 옴뽁 home. '건강해' → water (강). '빵이 제일이야' → 똑땁 work. '껄껄, 그래도' → 뉨 yes. The demo's '배가 고팠나' → boat. plans.mjs: 45% of keyword hits are not heard (most: me@adult_m 17, big@adult_m 16, water@adult_m 14, please@adult_m 13, cute@adult_m 12, we@adult_m 11).",
    "fix": "Add a per-word `kwNot` stop list checked around each hit: water ['물감','물건','선물','물러','건강','동물'], home ['방울','금방','방법','가방'], work ['제일','내일이'], yes ['그래도','그래서'], boat ['배가 고','배고'], small ['시작','작업']. Or require a following particle or space for 1-character stems (물이|물을|물 ). Promote me/we/good/water/go/please to CORE_WORDS in place of the per-voice extras (net about +0)."
   },
   {
    "severity": "medium",
    "area": "memory / loading (phaser.js default types, voice.md §7.1)",
    "problem": "attachVillageVoice defaults to loading all 10 sprites. That is 182 s of mono audio, about 35 MB decoded at 48 kHz float32 (the old chatter was about 0.8 MB). The 'chief' sprite is never used, because the player has no chat bubbles. Voice also adds about 23% to the game's total audio seconds.",
    "evidence": "phaser.js: `const types = opts.types || VOICE_TYPES`. Manifest sprite durations sum to 182.2 s. Only 6 Bubbles.chat call sites exist (Resident, TownSim, Neighbours ×2, Visitor ×2), none for the player. Audio manifests otherwise total 803 s.",
    "fix": "Default types to the types actually present minus 'chief', and add `vv.need(type)` so a voice type loads on its first line (that first line falls back to the old chatter through ready()). Optionally decode the sprites only after the first 'town open'. Document the memory figure in voice.md §7."
   },
   {
    "severity": "low",
    "area": "phone audibility of low voices (big_gruff, elder_m in voices.py)",
    "problem": "On a simulated phone speaker, big_gruff and elder_m lose more level than the other voices. big_gruff's alpha 0.9 also makes its vocal tract larger than an adult human's, which is the opposite of 'cute toy'.",
    "evidence": "phone.py (HP 550 Hz / LP 9 kHz, K-weighted active level): big_gruff −3.52 dB, elder_m −2.75, squeaky −1.06; spread across voices 2.24 dB on phone vs ±0.1 on full range. big_gruff has 26% of its energy below 400 Hz.",
    "fix": "big_gruff f0 108→122, alpha 0.90→1.02, tilt −2.5→−1.2, smile 0.5→1.5. elder_m tilt −1.5→−0.8. Re-level with the existing EFFECTIVE target and confirm a phone spread ≤1 dB in check_voice (add the phone filter to the QA table)."
   },
   {
    "severity": "low",
    "area": "pronunciation: vowel hiatus merged by eSpeak (phonology.to_espeak)",
    "problem": "마울 (village, the most-played clip at 7.7%) and 미울 (cat) are written as 2 syllables, but eSpeak renders them as 1-syllable diphthongs ('maul', 'miul'). Their planned 2-note melodies collapse, and the designer hears something different from the dictionary.",
    "evidence": "eSpeak events from the articulation cache: ma.ul → `m 'au l`, mi.ul → `m 'iu l` (1 vowel each, planned 2). All other words keep their syllable count.",
    "fix": "In to_espeak, put a secondary-stress mark or a short glottal before a vowel-initial syllable that follows a vowel (e.g. m'a,ul), or respell as ma.wul / mi.yul. Add a check that the number of eSpeak vowel events equals the syllable count."
   },
   {
    "severity": "low",
    "area": "runtime: emote one-shots lag (VillageVoice._plan)",
    "problem": "emote(speaker,'laugh') adds the end-emote gap even when nothing comes before it, so a laugh starts 110–180 ms after the laugh animation.",
    "evidence": "_plan: `add(V.emotes[emote], (0.08 + rnd()*0.07)*tempo, …)` with u.count = 0, plus START_LAG 0.03.",
    "fix": "Use `add(V.emotes[emote], u.count ? (0.08 + rnd()*0.07)*tempo : 0, …)`."
   },
   {
    "severity": "low",
    "area": "integration: settings persistence (voice.md §7 step 6, core/Save.js)",
    "problem": "Settings.load() only copies whitelisted keys, so a 'voice' volume would reset on every launch.",
    "evidence": "Save.js:257-268: data {sound, music, lang, zoom, daynight}; load() parses only those.",
    "fix": "Add `voice: 1` to Settings.data and in load(): `const v = typeof s.voice === 'number' ? s.voice : 1; this.data.voice = v >= 0 && v <= 1 ? v : 1;`. List this in voice.md §7."
   },
   {
    "severity": "low",
    "area": "mix presence vs the old chatter",
    "problem": "Each clip is matched in level, but lines are about 2.8× longer than the old chatter (1.40 s vs about 0.5 s), and TownSim citizens, who were silent before, will now speak. Voice time per minute is likely to roughly triple.",
    "evidence": "plans.mjs: mean line 1.40 s. Old chatter clips 0.49–0.59 s. TownSim.chatter (TownSim.js:777-793) called no sound before. Resident chats every 5 s × 0.6–1.4 (balance.js chatEvery).",
    "fix": "Voice TownSim/Visitor lines at volume 0.75 and only about 60% of them (by hash, keeping determinism), or add a 'voice-seconds per 10 s' budget (e.g. ≤5 s) in speak(). Re-check the demo from 50 s with bgm_village."
   }
  ],
  "keep": [
   "Deterministic, cached, byte-reproducible build (eSpeak rendered first in a fresh process each time, WORLD resynthesis, code-hash clip cache); keep the pipeline and only change parameters.",
   "Loudness matched to the old chatter (−21.00 ±0.01 vs −21.14), word spread ≤1.14 dB, peaks ≤ −1.17 dBFS, no clipping, DC ≤0.0002.",
   "Clean clip edges: the first 2 ms of every clip is ≤3% of peak, the 50% point arrives in 10–30 ms, tails are ≤0.2% of peak at marker end + 4 ms in both ogg and mp3. Inter-clip gaps ≤ −55 dB.",
   "Round, non-sibilant spectrum (energy above 6 kHz ≤1%, s/ch/h softened). Jitter 0.8–1.8% and HNR 10.8–13.9 dB are in the same range as the old chatter (1.0% / 13.8 dB), so there is no measurable robotic monotone or buzz.",
   "Sung melodies: 4.7–6.5 st range per clip. Questions rise at 100%.",
   "The most-heard content words carry strong non-Japanese cues and should stay as they are: 마울 (l coda), 뉘뉘/퓌뽈/뮐리 (ü), 브랑/블룸/블롭 (clusters), 뵐랑, 노뱅 (æ). The designer's 꼬맙뿌 and 촌촌님 are also kept.",
   "Originality: the FORBIDDEN list (bello, poopaye, tank yu, banana, papoy, hana/dul/sae, sul sul, dag dag, vadish…) is enforced by the build, and no Minionese or Simlish word was found.",
   "Licensing: eSpeak NG is used at build time only, WORLD/pyworld are BSD/MIT, and sources are recorded in the report.",
   "Runtime architecture: pooled and allocation-free update(); at most 2 voices plus a spare fade channel; a bounded queue with 1.2 s expiry; priority preemption with a 40 ms fade; distance checked 4× a second; ducking; bus into game.sound.destination so mute and master volume apply; mp3 start-delay detection.",
   "One hook in Bubbles.chat covers Resident, TownSim, Neighbours and Visitor, and speakBubble strips the 'name\\n' tap line. Same text from the same speaker always gives the same plan.",
   "Emote set with one laugh style per voice, the sad whimper vibrato, and the 2.53 MB payload (room under 4 MB for the babble and medial-take additions)."
  ]
 },
 {
  "verdict": "polish",
  "summary": "Overall, 눈꽃말 is charming and easy to say. The dictionary is warm, natural Korean that a designer can enjoy reading, and it is a real step away from the old chatter, which had no closed syllables, clusters or rounded vowels. Four things need fixing before the designer signs off.\n\n1. **The \"not Japanese\" numbers are inflated for Korean listeners.** The build counts ㅇ받침, ㅐ and ㅡ as non-Japanese. Koreans hear Japanese ん as ㅇ (스미마셍, 다나카상), they hear ㅐ and ㅔ as the same vowel, and ㅡ is close to Japanese う. With those removed:\n   - closed syllables are 42–47%, not 73–75%;\n   - clusters are only 8% of what is actually heard in the demo;\n   - 5 clips that every voice says, and 6 more that some voices say, fit Japanese sound rules completely.\n2. **Korean keywords are matched as plain substrings and often pick the wrong word.** For example, a line ending in -네! is read as \"yes\", 배가 고파 as \"boat\", 선물 as \"water\" and 사냥꾼 as \"cat\". One of the preview page's own sample lines shows this.\n3. **The designer cannot open the listening page without a terminal.** The dictionary also describes the voices as already in the game, but the game does not use them yet.\n4. **Some words have small spelling, collision or originality problems.**\n   - 뒬 (two) is the Minions' counting word \"dul\" with an umlaut. The blacklist misses it because ü is not treated as u.\n   - 뽀뇽 (baby) sounds like Ponyo (포뇨).\n   - 미울 (cat) sounds like the Korean for \"hateful\", and 넹 (you know) sounds like 넹, cute Korean for \"yes\".\n   - ㅍ and ㅃ are both used for the same sound.\n\nAll of these are fixed by editing the lexicon, the keyword lists and the documents, then doing one rebuild. The sound pipeline itself does not need rework.\n\nI checked everything with scripts. I did not listen to any audio. The scripts are in /tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/voice_critic_ko_doc/:\n- ja.py and jalegal.py: Korean-ear sound statistics, and the list of words that fit Japanese sound rules;\n- kwctx.mjs and kwt.mjs: where each keyword matches in the game's Korean strings, and spot checks;\n- plan.mjs: what the preview's sample lines actually play;\n- count.mjs: how often each keyword appears and how many voices record each word.\n\nFiles reviewed:\n- /home/user/nurient/frost-village/docs/눈꽃말_사전.md\n- /home/user/nurient/frost-village/tools/voice/lexicon.json\n- /home/user/nurient/frost-village/tools/voice/phonology.py\n- /home/user/nurient/frost-village/tools/voice/voices.py\n- /home/user/nurient/frost-village/tools/voice/prosody.py\n- /home/user/nurient/frost-village/tools/voice/make_dictionary.py\n- /home/user/nurient/frost-village/src/voice/VillageVoice.js\n- /home/user/nurient/frost-village/docs/previews/voice_preview.html\n- /home/user/nurient/frost-village/docs/previews/voice_demo.txt",
  "issues": [
   {
    "severity": "high",
    "area": "Sound plan vs Japanese (Korean listener)",
    "problem": "The 'not Japanese' check and the dictionary's numbers count three things as non-Japanese that Korean ears treat as Japanese or neutral. (1) ㅇ받침: Koreans hear Japanese ん as ㅇ (스미마셍, 다나카상, 닛뽄). (2) ㅐ: Koreans pronounce ㅐ and ㅔ the same, and Japanese has e. (3) ㅡ: it is close to Japanese う [ɯ]. As a result, several of the most-heard clips still fit Japanese sound rules, and the 73% / 23% figures in §1 overstate the difference.",
    "evidence": "Recomputed with phonology.syllables (ja.py). Closed syllables not counting -ng: 42.4% of all words, 46.5% of the 57 spoken words, 43.7% of the demo's actual 213 syllables. The dictionary claims 73%. Front-rounded ü/ö vowels: 17% / 13% / 14% (claim 23%). Clusters are only 8% of what is heard in the demo, and 20% of heard syllables are still plain open CV. 18 words fit Japanese sound rules when ㅇ/ㄴ/ㅁ-before-labial is read as ん and a doubled stop as っ (jalegal.py). Five of them are said by all 10 voices: 꼬맙뿌, 노뱅, 우와뿅, 넹 (filler), 뇽 (particle). Others are spoken by some voices: 뿌띵, 끼링, 옹, 뾰롱, 뽀뇽, 찌밍. phonology.markers() only leaves out 'n' codas: `if any(c != \"n\" for c in co)`.",
    "fix": "1. In phonology.markers(), treat 'ng' like 'n' for the 'closed' marker. Count 'ae' and 'eu' as Japanese-like vowels for the 'vowel' marker. check() will then flag the weak words.\n2. Edit the words that matter most:\n   - 노뱅 → 놉뱅 (nop.baeng; 놉 is Korean net slang for 'nope', so it stays easy to guess)\n   - 넹 → 넬 (nel)\n   - 뿌띵 → 뿌띰 (pu.tim)\n   - 끼링 → 끼릴 (ki.ril)\n   - 찌밍 → 찌뮐 (chi.mül)\n   - 뽀뇽 → 꼬물 (ko.mul; '꼬물이' is a common nickname for babies)\n3. Keep 꼬맙뿌, 우와뿅 and 뇽: the Korean echo or aegyo outweighs the Japanese shape.\n4. Rewrite the numbers in dictionary §1, for example 'ㅇ받침 말고 ㄹ·ㅁ·ㅂ·ㄱ 받침 46%, 겹소리 18%, 위·외 모음 13%'.\n5. Add a rule in §9: new words should use ㄹ/ㅁ/ㅂ/ㄱ endings, clusters or 위/외, because ㅇ받침 does not count."
   },
   {
    "severity": "high",
    "area": "Designer access to the listening page",
    "problem": "The designer does not code, yet the listening page only works after running a terminal command. It fails on file:// by design. The page opens with code paths, and dictionary §8 says the same. The build report makes her listening the sign-off step, so in practice she can only play the fixed 64-second demo mp3.",
    "evidence": "voice_preview.html header: 'node tools/test/serve.mjs 8000 → http://localhost:8000/docs/previews/voice_preview.html'. On failure it says 'file:// 는 안 돼요'. Dictionary §8 gives the same instructions. The screenshot voice_preview.png shows the code path as the first thing on the page.",
    "fix": "Publish voice_preview.html as a hosted page with src/voice/*.js and assets/voice/* (about 2.5 MB) as supporting files, or build a single self-contained HTML with the audio embedded (about 3.5 MB). Put that one link at the top of dictionary §8, next to voice_demo.mp3. Move the serve.mjs instructions to a developer note at the bottom."
   },
   {
    "severity": "medium",
    "area": "Keyword mapping (Korean grammar)",
    "problem": "Korean keywords are matched as plain substrings, so common endings and compound words trigger the wrong word. The dictionary promises that '말풍선에 그 뜻이 나오면 꼭 들려요', and the preview's own sample chips show the errors.",
    "evidence": "keywordsOf() run over the game's 1,929 Korean string literals (kwctx.mjs, kwt.mjs).\n- A sentence ending in -네! becomes 뉨 'yes': the preview chip '앗, 깜빡했네!' plays '앗! 뉨'. Demo lines at 35.4 s ('…보네!'), 51.9 s ('그래도') and 54.4 s ('뻔했네!') all get 뉨.\n- '배가 고파요' → 블롭 (boat).\n- 선물, 물어봐, 스물 → 올롱 (water); 46 hits on '물', mostly false.\n- 사냥꾼 and 그냥 → 미울 (cat); 7 of 7 hits are false.\n- 시작 → 찌밍 (small); 잠깐 → 뇨롬 (sleep).\n- 솔방울, 가방, 금방 → 옴뽁 (home); 특별히, 별로 → 쁘릴 (star).\n- 훈제 고기 (meat) → 퓌뽈 (fish); 흥정 → 그롱 (grumpy); 축하하러 → 킥뽕 (funny).\n- 얼마나 → 링딩 (money); 거짓말 → 똑땁 (work); '좋네!' → yes instead of good.",
    "fix": "1. Support two new things in lexicon.json:\n   - line-start anchors, so '^네', '^응', '^그래', '^이런', '^어머', '^흥' only match at the start of the line or after punctuation or a space;\n   - per-word exclusions, for example water `ex: [\"선물\",\"물어\",\"스물\",\"건물\",\"동물\",\"물건\",\"보물\",\"물론\"]`.\n2. Remove the bare stems 물, 강, 냥, 방, 작, 잠, 별, 불, 고기, 일이, 짓, 화가, 얱마. Use forms instead: 물이/물을/바닷물, 냥이/냐옹, 작은/작아, 잠이/낮잠, 별이/별빛, 불이/불꽃, 짓자/짓는, 화가 나, 얼마예/얼마야.\n3. Add '배가 고' and '배 고' to hungry, and 좋네, 좋구나 to good.\n4. Make check_voice.py print every keyword's hit contexts over the game strings, so a Korean reader can review them."
   },
   {
    "severity": "medium",
    "area": "Originality / blacklist",
    "problem": "뒬 (dül) means 'two', which is the Minions' Korean counting word 'dul' with an umlaut. The builder's own blacklist contains 'dul', but the check compares the raw romanisation, so 'dül' passes. The dictionary example '잉, 뒬, 뜨렘, 푀, 빔빔!' (counting) echoes the Minions' 'hana, dul, sae' gag. There is also no guard against other famous cute-creature words: 뽀뇽 is about one sound from Ponyo (포뇨/ポニョ), and the greeting 뽀얌 is close to Kirby's 'poyo'.",
    "evidence": "phonology.check(): `if flat == ff or (len(ff) >= 4 and ff in flat)`. 'dül' ≠ 'dul', and 'dul' is too short for the substring test. FORBIDDEN includes 'hana', 'dul', 'sae'. lexicon: two = 뒬 'dül'; baby = 뽀뇽 'po.nyong'.",
    "fix": "1. Before matching the blacklist, normalise ü→u, ö→o, ae→e, eu→u. Also compare the hangul against 둘/하나/세/벨로/바나나/뽀요/포뇨.\n2. Add poyo, ponyo and pika to FORBIDDEN.\n3. Rename 뒬 → 뎀뎀 (dem.dem): 'two' said twice fits grammar rule 1. Update the counting example, then rebuild elder_m.\n4. Change 뽀뇽 → 꼬물, as in the first issue."
   },
   {
    "severity": "medium",
    "area": "Hangul ↔ sound consistency",
    "problem": "The same sound is spelled with different hangul.\n- p is ㅃ in 뽀얌/뿔/퓌뽈 but ㅍ in 플링 (pling), 폭폴 (pok.pol) and 칙폭 (chik.pok). ㅍ is also used for f in 퓌뽈/프룽/푀/퓌웅.\n- k is ㄲ in 꼬맙뿌/끼링 but ㅋ in 킥뽕.\n- ch is ㅊ in 촌촌님/칙폭 but ㅉ in 찌밍.\nThe Finnish eSpeak table has unaspirated stops, so 폭폴 is heard as 뽁뽈 and 플링 as 쁠링: the designer hears something different from what she reads. The '읽기 (로마자)' column uses ü/ö/ae/eu with no legend. It is not the standard romanisation the title uses: 'Nunkkot-mal' writes ㄲ as kk, but 꼬맙뿌 is written 'ko-map-pu', which reads as 코맙푸. Section 9 asks the designer to write romanisation without giving a table.",
    "evidence": "lexicon.json roman fields: 플링 'pling', 폭폴 'pok.pol', 칙폭 'chik.pok', 킥뽕 'kik.pong', 찌밍 'chi.ming', 퓌뽈 'fü.pol'. phonology.CONS maps p→eSpeak 'p' and f→'f' with no aspirated stop.",
    "fix": "1. Fix one table: ㅃ=p, ㅍ=f, ㅂ=b, ㄸ=t, ㄷ=d, ㄲ=k, ㄱ=g, ㅊ=ch, 위=ü, 외=ö, 애=ae, 으=eu, ㄹ받침=l, ㄹ between vowels=r.\n2. Respell to match: 플링→쁠링, 폭폴→뽁뽈, 칙폭→칙뽁, 킥뽕→끽뽕 (or 킥뿅), 찌밍→치밍.\n3. Add a hangul↔romanisation consistency test to check_voice.py.\n4. In the dictionary, rename the column '소리 기호' and add the table as a one-line legend. Better still, let §9 accept hangul only and derive the romanisation automatically."
   },
   {
    "severity": "medium",
    "area": "Dictionary §7 vs the real game",
    "problem": "§7 '게임에서는 이렇게 들려요' describes the voices, distance fading and a voice-volume setting in the present tense. Nothing in the game uses them yet and there is no voice setting, so the designer will open the game, hear the old chatter, and look for a setting that isn't there.",
    "evidence": "Dictionary §7: '설정에서 목소리 크기를 따로 조절할 수 있게 만들어 두었어요'. grep: no file under src/ outside src/voice imports VillageVoice or attachVillageVoice, and src/core has no voice setting. The build report says 'Nothing in the game uses the runtime yet'.",
    "fix": "Open §7 with: '아직 게임에는 안 들어갔어요 — 다음 버전에서 지금 수다 소리를 이 목소리로 바꿔요 (기획서_마을말 §5). 지금은 §8에서 들어 보세요.' Rewrite the bullets in the future tense ('~하게 될 거예요')."
   },
   {
    "severity": "medium",
    "area": "Voice coverage of shop greetings",
    "problem": "The dictionary calls 왈랑 '가게 주인들이 제일 많이 하는 말', but only adult_f and chief record it. The shopkeeper voices adult_m (상인, 점원 민호), sweet (점원 미소) and big_gruff (요리사 쿡) cannot say it, so their '어서 오세요!' plays random words instead.",
    "evidence": "voices.py EXTRA_WORDS: welcome appears only for adult_f and chief. Dictionary §6 cast table: 상인 and 점원 민호 use 어른 남자, 점원 미소 uses 상냥한 언니. The 왈랑 row lists '어른 여자, 촌장님'.",
    "fix": "Add 'welcome' to adult_m's extra words (replacing 'wood', which big_gruff already has) and to sweet's (replacing 'moon'). Alternatively make welcome a core word and drop a rarely matched one, such as money (17 hits) or yummy (4 hits, already covered by the 냠냠~ emote)."
   },
   {
    "severity": "medium",
    "area": "Random filler words with strong meanings (transcripts read as nonsense)",
    "problem": "Random filler words are drawn from concrete core nouns (money, home, village, fish, bread). When the designer reads voice_demo.txt or the preview's result line, the 'translation' looks wrong. 링딩 'money' is the most frequent filler word.",
    "evidence": "In voice_demo.txt, 링딩 appears in 7 of 28 lines.\n- 할아버지 '오늘 참 춥구먼…' → '뽀얌 마울 링딩 브르르'.\n- 상냥한 언니 '정말 따뜻해요' → '뮐리 뿔 뉘뉘 꼬맙뿌!': 'very snow', because sweet has no 뫼옹 (warm).\n- 어른 여자 '빵 하나 드세요' → '촌촌님 브랑 퓌뽈'.\n- Preview: '흥, 시끄러워.' → '흥! 링딩'; kid_girl '배고파 ㅠㅠ' → '플링 흐잉…' ('let's play' + sob).\n- VillageVoice.js: BABBLE_CAT includes the categories thing, food and number.",
    "fix": "1. Make money, fish, bread, home and village keyword-only (add them to BABBLE_NOT), and pick filler words mostly from the fillers and the neutral nature/action words.\n2. In the preview result line and demo.txt, show keyword words in bold with their meaning (for example 브랑(빵)) and filler words in grey, with the legend '회색 = 뜻 없는 재잘재잘'."
   },
   {
    "severity": "low",
    "area": "Korean real-word collisions",
    "problem": "Several words sound like real Korean words or loanwords, which a Korean listener or reader will notice:\n- 미울 (cat): a form of 밉다, so it is close to '미워!' (I hate you); said by kid_girl.\n- 냉 (you): means 冷 (cold) in a snow village where cold is 브르르. 냉 alone is also the medical word for vaginal discharge. Because ㅐ and ㅔ sound the same, it is a homophone of 넹.\n- 넹 (filler, all voices): cute Korean for 'yes', which clashes with 뉨 = yes.\n- 봄봄 (big): reads as 'spring spring'; the example '뉘뉘 봄봄 뇽' reads as 'snow snow spring spring'.\n- 끼링 ≈ 기린 (giraffe; also Japanese kirin).\n- 엡뿔 ≈ 애플/apple (close to Minion 'bapple').\n- 뽕 in 킥뽕 and 왈뽕 carries slang (국뽕, 뽕 맞다, a fart '뽕').",
    "evidence": "lexicon.json: cat 미울 'mi.ul' (kid_girl), you 냉 'naeng', youknow 넹 'neng' (all voices), big 봄봄 'bom.bom' (kid_boy, big_gruff), ice 끼링, oops 엡뿔, funny 킥뽕. Dictionary §2 and §3 examples.",
    "fix": "- 미울 → 미욜 (mi.yol)\n- 냉 → 뉼 (nyul)\n- 넹 → 넬 (nel)\n- 엡뿔 → 웁뿔 (up.pul)\n- 킥뽕 → 킥뿅\n- 끼링 → 끼릴, as in the first issue\n- Keep 봄봄, but add the note \"봄(계절)이 아니라 '크다'예요!\" to its 한마디 cell."
   },
   {
    "severity": "low",
    "area": "Mood detection: 아이고",
    "problem": "Any line containing 아이고 plays the startled oops sound '앗!'. In Korean, 아이고 is just as often affectionate or a sigh, especially for grandparents.",
    "evidence": "MOOD_RX oops: /^앗|^이런|^어머|아이고|어이쿠|깜빡|실수/ (아이고 is not anchored to the start). Demo at 13.6 s: 할머니 '아이고 우리 강아지, 따뜻하게 입어라~' → '앗! 링딩 음 브랑 뫼옹 푀'. Game strings include '아이고 귀여워' and '아이고, 고마'.",
    "fix": "Treat 아이고 as oops only when trouble words follow it (아파|넘어|미끄|큰일|어쩌|깜빡). Otherwise use neutral, or use thanks/cute when 고마/귀여 follows."
   },
   {
    "severity": "low",
    "area": "Dictionary wording and layout",
    "problem": "Several small points in the dictionary:\n- Rule 1 '두 번 말하면 여럿이 돼요' is contradicted by its own example 뿔룽뿔룽 (bye) and by 빔빔, 봄봄, 랄랄 and 똑땁 똑땁. It also cites 뉘 (눈 한 송이), which is not in the dictionary.\n- The §1 heading '입술이 동그래요' lists 랭 and 냉, which are said with spread lips.\n- '거의 다 … 꼭' contradicts itself.\n- 브르르 '제일 많이 들려요' is wrong: it is never used as random filler and has 11 keyword hits, against 100 for 촌촌님.\n- The §5 emote table repeats the same 9 cells 10 times.\n- §6 shows Hz and × numbers.\n- The note about the script that generates the file sits at the top.\n- The designer's own example words (뽀야, 냠냠뇨, 누누, 피뽀, 모모) were changed, and this is explained only in the English build report.",
    "evidence": "docs/눈꽃말_사전.md lines 9, 13, 19, 102 and 206–217. tools/voice/make_dictionary.py holds the prose. 기획서_마을말.md §2 lists the original examples.",
    "fix": "- Rewrite rule 1 as \"두 번 말하면 '여럿' 또는 '더 많이·더 세게'\", and either add 뉘 as an entry or drop that example.\n- Add a small table '대표님 아이디어 → 눈꽃말': 뽀야→뽀얌, 냠냠뇨→냠냠뇹, 누누→뉘뉘, 피뽀→퓌뽈, 모모→뫼; 꼬맙뿌, 촌촌님 and 우와뿅 stay as they are. Add one line on why: 받침 and 위/외 sounds make it sound less Japanese.\n- Collapse §5 into one row of shared emotes plus a laugh for each voice.\n- Replace Hz with 아주 높게, 높게, 보통 or 낮게.\n- Move the generator note into §9, and replace §9's JSON and python steps with '낱말과 뜻을 적어 주시면 넣어 드려요'."
   },
   {
    "severity": "low",
    "area": "Preview page wording for a non-technical designer",
    "problem": "The result line shows English mood names. Each voice card shows its internal id and Hz/× numbers. The dictionary table shows the unexplained romanisation column. Emote chips repeat their label ('앗 앗!', '냠냠 냠냠~'). There is no Korean guidance on what to listen for: the questions in the report's §10 exist only in English.",
    "evidence": "voice_preview.html show(): `${plan.mood}` produces 'excited · 1.63초' (visible in voice_preview.png). The card header prints `${t}` (kid_boy) and `기본 높이 ${v.f0} Hz · 빠르기 ×${v.speed}`. The dictionary table has a column `<th>읽기</th>` showing w.roman.",
    "fix": "- Map the mood through EMO_KO, with neutral shown as 보통.\n- Hide the internal ids and Hz, and show chips as '앗!' with the 감정 name as a tooltip.\n- Drop the romanisation column.\n- Add a short '들어 보고 알려 주세요' box: 일본어처럼 들리는 말이 있나요? 제일 귀여운 목소리는? 너무 빠르거나 높은 목소리는? 웃음소리는 괜찮나요?"
   }
  ],
  "keep": [
   "The designer's own words 꼬맙뿌, 촌촌님 and 우와뿅, kept as she wrote them.",
   "Words that echo Korean the way Minion speech echoes real languages, so listeners can guess them: 꼬맙뿌 (고마워), 브르르 (부르르), 똑땁 (뚝딱), 칙폭 (칙칙폭폭), 냠냠뇹, 뾰롱 (뾰로롱), 구룩 (꼬르륵), 마울 (마을), 그롱 (그르렁).",
   "위/외-type vowels plus rolled r and ㄹ받침 words (뵐랑, 뿔룽뿔룽, 똘롬, 올롱, 뮐리, 퓌뽈, 뉘블룸). These are the strongest non-Japanese, non-Korean signals.",
   "Clusters such as 블룸, 브랑, 끌룹, 뜨렘, 쁘릴 and 프룽.",
   "The sentence endings: 뇽 reads as Korean aegyo, 얍! is fun, and 뿔 = very is a simple, cute intensifier.",
   "Saying a word twice for plural: 뮈 → 뮈뮈 (we).",
   "The dictionary's 한마디 column of gestures and mouth shapes (뽀뽀하는 입 모양, 도리도리, 두 손을 모으고). It is warm, natural Korean.",
   "The fun example-sentence table, with only the 뒬 and 봄봄 tweaks.",
   "The 'who says it' column and the '사전에만' label, which honestly show coverage.",
   "Generating the dictionary from lexicon.json, so the document never disagrees with what plays.",
   "phonology.check(), which guards against Japanese-shaped words and blacklisted words. Extend it rather than replace it.",
   "Deterministic playback: the same line always sounds the same, which works like a resident's verbal habit.",
   "Emotes written in hangul (뽀얌!, 흐잉…, 흥!, 꼬맙뿌!, 냠냠~) and a different laugh for each voice.",
   "On the preview page: the type-any-Korean-line box, sample chips, a chip for every clip, and the 마을 수다 crowd button.",
   "The demo transcript format (Korean bubble → 눈꽃말 actually heard), which makes review easy."
  ]
 }
]
```

## Build

# voice build report — 눈꽃말 (the village language) and its voices

Saved at `/home/user/nurient/frost-village/docs/build_reports/voice.md`.

**VOICE: DONE.** The village language, 10 voices, a runtime, a demo, a listening page, tests and a QA script are built, and every check passes. Nothing in the game uses the runtime yet; §6 has the integration plan. I can't listen to audio, so every judgement here comes from measurements, spectrograms, pitch tracking and decoding in headless Chromium. The designer should listen to the demo and the preview page before the voices replace the old chatter.

- **눈꽃말 (the village language)**
  - A 78-entry lexicon: 69 words with meanings, 6 fillers and 3 sentence-end particles. Each entry has a hangul spelling, a romanisation, IPA-ish phonemes and the Korean stems that trigger it.
  - A small grammar.
  - A dictionary for the designer in easy Korean with example sentences: `docs/눈꽃말_사전.md`.
- **10 voices**
  - kid_boy, kid_girl, adult_m, adult_f, elder_m, elder_f, chief, big_gruff, sweet, squeaky.
  - Each voice is one audio sprite with 31 babble clips and 10 emotive one-shots.
  - The babble clips are 21 core words every voice records, 4 words of its own, 3 fillers and 3 particles.
  - 20 files plus the manifest come to **2.53 MB** (limit 4 MB).
- **Runtime:** `src/voice/` turns any bubble's Korean text into 눈꽃말 for that resident.
  - The same line always sounds the same, and Korean keywords map to their 눈꽃말 words.
  - It adds emotes and a sentence-end particle, and shapes the melody from punctuation and mood.
  - At most 2 voices sound at once; extra lines wait in a short queue or are dropped.
  - It has a distance hook, ducking under important sounds, a volume setting, and no per-frame allocations.
- **Demo, listening page, tests and QA:** a 64 s demo played through the real runtime, a listening page, Node and browser tests, and a QA script. All pass, and clean rebuilds produce byte-identical files.

## 1. Files
| path | what |
|---|---|
| `assets/voice/manifest.json` | Audio fragment in the `assets/audio2..6` conventions: `files` [ogg, mp3], `volume`, `loop` false, `kind` "sfx", `duration`. Adds `samples`, `mp3StartPad`, `onset`, `voiceType`, `sprite`, per-clip `markers` (`start`, `dur`, `kind`, `syl`, `say`, `emote`) and a `voices` table. |
| `assets/voice/voice_<type>.ogg/.mp3` | 10 mono 44.1 kHz sprites, 15.6–20.9 s each. Vorbis q3; LAME 56 kbps with the gapless tag. |
| `src/voice/VillageVoice.js` | Runtime: planning, scheduling, concurrency, ducking, volume, `speakBubble` hook. |
| `src/voice/cast.js` | Character → voice type, role fallback, stable speaker ids. |
| `src/voice/lexicon.js` | Generated from `lexicon.json`. |
| `src/voice/webaudio.js` | Web Audio playback backend. |
| `src/voice/phaser.js` | `attachVillageVoice(gs, opts)` glue (not imported by the game yet). |
| `tools/voice/` | `lexicon.json`, `phonology.py`, `voices.py`, `prosody.py`, `espeak.py`, `vocoder.py`, `render.py`, `build_voice.py`, `check_voice.py`, `make_dictionary.py`, `demo.mjs`, `demo_mix.py`, `loudness.py`, `deps.py`. |
| `tools/test/voice_runtime.mjs` | 22 Node tests. |
| `tools/test/voice_preview.mjs` | Headless-Chromium test of the page and of real Web Audio playback. |
| `docs/눈꽃말_사전.md` | The dictionary (generated). |
| `docs/previews/voice_demo.mp3` + `.txt` | The demo and its transcript. |
| `docs/previews/voice_preview.html` + `.png` | The listening page and a screenshot of it. |
| `docs/previews/voice_report.txt`, `voice_spectrograms.png` | QA table and spectrograms of all 10 sprites. |

No existing file was modified; all of these paths are new.

## 2. Method
Neural TTS weights could not be downloaded (HuggingFace and GitHub are blocked), so the voices are built from two classic, deterministic tools.

1. **eSpeak NG 1.52.0** (from the PyPI package `espeakng-loader` 0.2.4) pronounces each invented word.
   - Words are given as eSpeak phoneme input using its Finnish table. Finnish has pure vowels, ü/ö/æ, a rolled r, and accepts clusters in phoneme mode.
   - It renders a monotone at about 80 Hz; only its consonants, vowel formants and phoneme timing are kept.
   - eSpeak carries state from one utterance to the next, so each word is rendered as the first utterance of a fresh helper process. That makes builds byte-reproducible.
2. **WORLD vocoder (pyworld 0.3.5)** turns that recording into the cute voices.
   - The analysed pitch is thrown away and replaced by a designed melody: high/low syllables, scoops into each vowel, declination, jitter, and vibrato (a gentle tremor for elders).
   - Timing is re-made: voice speed, short consonants, set vowel lengths.
   - Formants are scaled by `alpha` for vocal-tract size, with a "smile" lift, spectral tilt, and breathiness.
   - s, ch, f and h are softened so nothing hisses. Final stops are unreleased like Korean ㄱ/ㅂ, with a 12 ms soft attack and a release on the last vowel.
3. **Post-processing** reuses the existing `tools/audio/synth.py` (read-only): high-pass, gentle 2.2:1 compression, a small 0.32 s room at 7 %, fades.
4. **Levelling and sprites.**
   - Every clip is set to the same active-speech loudness, with a limiter keeping peaks at or below −1.8 dBFS.
   - Clips are packed into sprites with 45 ms gaps, longer than the 25 ms mp3 decoder delay.
   - Each sprite's manifest volume matches the old `sfx_chatter` effective level (−21.1). The runtime plays at the same 0.4 base gain the old chatter used.

A build takes 85–115 s from an empty cache and 15–30 s when the eSpeak renders are cached.

## 3. Licences
Everything shipped is free for commercial use.

| what | licence | how it is used |
|---|---|---|
| eSpeak NG (inside `espeakng-loader`) | GPL-3.0 | Build time only; nothing of it ships. Under GPL-3.0 §2, program output is covered only if its content is a covered work, and synthetic speech of our own invented words is not. WORLD then replaces the voice. |
| WORLD / pyworld | modified BSD / MIT | build time |
| numpy, scipy | BSD | build time |
| ffmpeg + libvorbis (BSD) + LAME (LGPL) | — | encoding, same as the existing audio fragments |

- The language, words, melodies, voice designs and runtime are original project work.
- The demo's background (wind, `bgm_village`, the dog bark) uses existing project assets, only inside `voice_demo.mp3`.
- `praat-parselmouth` and `phonemizer` (both GPL) were installed while exploring and are not used by anything.
- No Minionese, Simlish or Animalese words or audio are used. The build refuses any word that matches or resembles a blacklist, which includes bello, poopaye, banana, tank yu, bee-do, papoy, the Minions' Korean numbers hana/dul/sae, sul sul, dag dag and vadish.

## 4. The language
- **Sounds.**
  - Vowels: a e i o u, plus ü (뉘), ö (뵐), ae (랭) and eu (ㅡ).
  - Syllables are (C)(C)V(C), with onset clusters like bl, pr, fr and codas m, ng, l, p, k.
  - The r is rolled.
- **Why it no longer sounds Japanese.** Every content word must have at least one of: a closed syllable, a cluster, a vowel outside a/e/i/o/u, l/f/v, or reduplication. The build enforces this.

  | share of syllables | closed | clusters | ü/ö/æ/ɯ vowels |
  |---|---|---|---|
  | whole dictionary | 73 % | 16 % | 23 % |
  | the 57 words the voices actually say | 75 % | 18 % | 18 % |
  | old chatter | 0 % | 0 % | 0 % |

  Melodies are sung: the median pitch range inside one clip is 5.8 semitones (90th percentile 9.1).
- **Grammar.**
  - Saying a word twice makes a plural or adds emphasis: 뮈 "I" → 뮈뮈 "we".
  - Sentence-end particles: 녹? for questions, 얍! for excitement, 뇽 for a plain statement.
  - 뿔 means "very".
- **Lexicon.**

  | category | entries |
  |---|---|
  | greetings, social | 뽀얌 hello, 뿔룽뿔룽 bye, 꼬맙뿌 thanks, 왈랑 welcome, 뿌띵 please, 뮈앙 sorry |
  | answers | 뉨 yes, 노뱅 no |
  | feelings | 블룸 good, 우와뿅 wow, 엡뿔 oops, 뵐랑 love, 랄랄 happy, 뮝뮝 sad, 그롱 grumpy, 브릅 scared, 뉠롱 tired, 킥뽕 funny, 뾰롱 cute |
  | food | 냠냠뇹 yummy, 퓌뽈 fish, 브랑 bread, 뭄 eat, 구룩 hungry |
  | nature | 뉘뉘 snow, 뉘블룸 snowflake, 브르르 cold, 뫼옹 warm, 끼링 ice, 랭 sun, 쁘릴 star, 뮌 moon, 올롱 water, 폭폴 fire |
  | things | 똘롬 wood, 옴뽁 home, 마울 village, 링딩 money, 블롭 boat, 칙폭 train, 띵롱 music |
  | actions | 똑땁 work, 뇨롬 sleep, 플링 play, 프룽 go, 옹 come, 끌룹 help |
  | people, animals | 촌촌님 chief, 뮐리 friend, 뽀뇽 baby, 뮈 I, 냉 you, 뮈뮈 we, 왈뽕 dog, 미울 cat |
  | questions | 뫼? what, 뉩? who, 올뮈? where, 엔뎅? when, 퓌웅? why, 앙뚤? how |
  | numbers, size | 잉 1, 뒬 2, 뜨렘 3, 푀 4, 빔빔 5, 봄봄 big, 찌밍 small, 뿔 very |
  | fillers | 엘 and, 드 the, 넹 you know, 음 hmm, 뚜리 so then, 뵹 hey |

- **From the design doc.** 꼬맙뿌 and 촌촌님 are kept. The plain-CV examples were given closed syllables or rounded vowels: 뽀야 → 뽀얌, 냠냠뇨 → 냠냠뇹, 누누 → 뉘뉘, 피뽀 → 퓌뽈, 모모 → 뫼.
- **Keywords.** Korean stems in a bubble trigger the matching word: 고마 → 꼬맙뿌, 촌장 → 촌촌님, 생선/물고기 → 퓌뽈, 빵 → 브랑, 추워 → 브르르, 정말/너무 → 뿔, and so on. The longest keyword wins, so 물고기 is fish, not water. The 21 core words were picked by counting keyword hits over the game's 887 Korean strings.

## 5. Voices
| type | F0 Hz | range | alpha | speed | breath | vibrato | laugh |
|---|---|---|---|---|---|---|---|
| kid_boy | 290 | 1.2 | 1.30 | 1.24 | .10 | 28 cents | 키히히히히 |
| kid_girl | 345 | 1.3 | 1.38 | 1.20 | .12 | 30 | 히히히힛 |
| adult_m | 165 | 1.05 | 1.12 | 1.06 | .07 | 20 | 하하하하 |
| adult_f | 255 | 1.2 | 1.22 | 1.12 | .11 | 24 | 아하하하 |
| elder_m | 140 | 0.9 | 1.04 | 0.86 | .15 | 32, tremor on every vowel | 호호호 |
| elder_f | 225 | 0.95 | 1.15 | 0.90 | .17 | 36, tremor | 오호호호 |
| chief | 205 | 1.35 | 1.17 | 1.16 | .07 | 22 | 아하하핫! |
| big_gruff | 108 | 1.0 | 0.90 | 0.94 | .09 | 18 | 와하하하 |
| sweet | 285 | 1.0 | 1.25 | 0.98 | .22 | 26 | 후후히 |
| squeaky | 470 | 1.45 | 1.52 | 1.36 | .08 | 40 | 끼히히히히히 |

- The other nine emotes are 뽀얌! (greeting), 우와! (surprise), 야호! (excited), 흐잉… (sad), 흥! (grumpy), 응? (question), 꼬맙뿌! (thanks), 냠냠~ (yummy) and 앗! (oops). Each has its own melody.
- Words last 0.21–0.82 s (median 0.36); emotes last 0.19–0.76 s.
- Who speaks with which voice is set in `CAST`, for example 할아버지 and 선장 → elder_m, and 아저씨, 곰돌 and 요리사 → big_gruff.
- Town citizens get a voice from their kind (student, teen, elder, adult) plus a hash of their id, so each person always keeps the same voice.

## 6. Runtime API and integration plan
**API**
- `new VillageVoice({manifest, backend, maxVoices:2, maxPending:3, maxWait:1.2, baseGain:0.4, volume, maxDur:2.6, distance})` creates the runtime.
- `speak(text, speaker, {emotion, emote, volume, priority, x, y, maxDur, queue, voice, pitch, words, variant})` says a line.
- `speakBubble(text, who, emoteIcon)` is the bubble hook. The emote icon sets the mood, a "name\n" first line is not spoken, and the chief always gets top priority.
- `emote(speaker, 'laugh')` plays a one-shot only.
- `plan(text, speaker)` describes what would be said, without playing.
- `update(dt)` runs every frame.
- Also: `duck(level, hold)`, `setVolume`, `setEnabled`, `stop`, `stopAll`, `isSpeaking`, `setDistanceModel`, `keysFor(types)`.

**How a line is built**
- The only randomness is seeded from the voice, the speaker id and the text, so plans are deterministic.
- Word count is about one word per 2.6 Korean syllables, 1–6 words, capped at 2.6 s.
- Keyword words come first; the rest is neutral babble, so a grumpy line never says "thank you" by accident.
- An emote that says a keyword replaces that word: 고마워요! becomes just 꼬맙뿌!.
- Pitch and speed come from `playbackRate`:
  - each resident is ±1.4 semitones from the voice, plus small persona tweaks;
  - excited is +1.6, sad −1.7;
  - questions rise on the last word.
- Clips are handed to the audio clock 0.12 s ahead.
- Waiting lines expire after 1.2 s, a higher priority line takes over from a lower one, and a new bubble from the same resident replaces its old line.

**Integration plan (none of these files were edited)**
1. In `Game.create`: `this.voice = attachVillageVoice(this, {volume: Settings.data.voice ?? 1})`. It returns null without Web Audio. To save memory, pass only the voice types present with `types`.
2. In `Game.update`: follow the sound toggle with `setEnabled(Audio.started && Settings.data.sound && Audio.live)`, then call `this.voice.update(delta/1000)`.
3. In `Bubbles.chat()`, after `this.active.push(b)`: `if (this.gs.voice) this.gs.voice.speakBubble(text, who, emote)`. This one line covers residents, TownSim citizens and Neighbours actors. Skip or silence the `tfCard` info bubble in `Neighbours.js`.
4. In `VillageLife.chatter(r)`: add `if (this.gs.voice) return;` at the top. Then:
   - `sfxLaugh(r)` → `gs.voice.emote(r, 'laugh')` when the voice exists;
   - the two direct `sfx_laugh` calls (around lines 1324 and 1469) the same way.
5. In `core/Audio.play`: call an `onImportant` hook for the level-up, complete, unlock, build-done, hire, mission-done, fame-up and cash sounds. Set it in Game to `this.voice.duck(0.35, 0.7)`.
6. Add a `Settings.data.voice` slider that calls `gs.voice.setVolume`.

## 7. QA results
- **`check_voice.py`: RESULT OK.**
  - Effective level −21.00 ± 0.01 against the old chatter's −21.14.
  - Loudness spread between words ≤ 1.14 dB; peaks ≤ −1.17 dBFS (ogg) and ≤ −1.67 (mp3); no clipping; DC ≤ 0.0002.
  - Clip edges ≤ 0.024 (no clicks); gaps between clips ≤ −55 dBFS, so no bleed between markers.
  - Energy above 6 kHz ≤ 1 % per clip, so nothing harsh. Median pitch is 113–523 Hz, 3–14 % above each voice's base.
  - Payload 2,531,579 bytes.
- **Node tests: 22 passed, 0 failed.**
  - 336 line/speaker pairs give identical plans; 40/40 pairs of residents sharing a voice type sound different.
  - Length: about 0.67 s for 4 syllables, 1.85 s for 14, 2.43 s for long lines; worst 2.83 s.
  - Playback rate sad 0.873 < neutral 0.975 < excited 1.094; gaps sad 107 ms > neutral 71 ms > excited 51 ms.
  - Every question ends with 녹? or 응? and rises.
  - Never more than 2 voices; the queue, expiry, priority, distance, ducking and volume all work.
  - The heap grew 3 KB over 300,000 frames.
- **Browser test (headless Chromium): all pass.**
  - All 20 files decode to the right length, with clips starting on time (within 4.7 ms).
  - A real Web Audio render has sound while speaking and silence afterwards, peaks at 0.34, and plays only 2 voices when 3 lines are requested.
  - Typing "촌장님, 생선 사세요!" plays 촌촌님 퓌뽈 ….
- **Reproducibility:** three clean rebuilds produced byte-identical files.

## 8. How to listen
- **Demo:** `docs/previews/voice_demo.mp3` (63.7 s, −16.7 LUFS). `voice_demo.txt` shows each bubble and what is heard.
  - First, each of the 10 voices says hello and something in character.
  - Then a snowy-day scene: neighbours gossip, someone tells a joke and they laugh, a kid asks the chief a question and gets an answer, the chief thanks the baker, the kids squeal at the dog and it barks back, grandpa grumbles and then laughs, and everyone says goodbye.
  - From 50 s the village music fades in at the game's real balance, so you can hear the voices sitting behind it.
- **Listening page:** run `node tools/test/serve.mjs 8000`, then open `http://localhost:8000/docs/previews/voice_preview.html`.
  - Type any Korean line and hear it with any voice; pick an emotion and a resident number.
  - Play every clip of every voice, and use the crowd, ducking and in-game-volume buttons.
  - The whole dictionary is there with play buttons.
- **Rebuild:**
  - `pip install numpy scipy pyworld "setuptools<81" espeakng-loader`, then `python3 tools/voice/build_voice.py` (about 1.5 min).
  - After editing only keywords: `python3 tools/voice/build_voice.py --lexicon-only`.
  - Demo: `node tools/voice/demo.mjs && python3 tools/voice/demo_mix.py`.

## 9. Known issues
- **Not yet listened to.** The result is a soft, toy-like vocoder voice, not a recorded human. Please judge squeaky (about 520 Hz), the elders' tremor, sweet's breathiness and the laughs. Every voice is one set of parameters in `voices.py`, and a rebuild takes about 1.5 min.
- **Decoded memory is about 35 MB if all 10 voices load** (182 s of audio; about 0.8 MB for the old chatter). Mitigations:
  - load only the voice types present;
  - drop the 4 personal words per voice (about −15 %);
  - map rarely heard voices to a neighbouring type in `CAST`.
- **Coverage.** Only the 21 core words are guaranteed in every voice. 21 dictionary words are not recorded by any voice yet.
- **Pitch and speed move together**, because per-resident and mood offsets use `playbackRate` (clamped to 0.72–1.4). Fine for babble, but not independent pitch control.
- **Keyword matching is plain substring search**, so it can misfire: 그래도 contains 그래 → 뉨 ("yes"). 눈 is only matched in snow phrases (눈이, 눈사람…) so that 눈 "eye" does not trigger "snow".
- **The mp3 start-delay fix is tested in Chromium only.** It assumes the first clip's attack rises above −34 dBFS.
- **Byte-for-byte rebuilds** depend on the exact eSpeak NG and libvorbis builds; on another machine, rebuild and run the check.
