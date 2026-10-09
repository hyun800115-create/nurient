# voice build report — 눈꽃말 (the village language) and its voices

**VOICE: POLISHED.** This pass fixes the critic review of the first build. Every high and medium issue
reproduced and is fixed, except one part of one fix that would have broken the spec (see §11).

The designer's request was "마을 사람들 소리는 좀 일본어로 들리는 거 같은데, 우리의 마을 언어 목소리를 만들자.
미니언즈처럼 귀여운 목소리 같이 어때?" It is now answered with:

- **눈꽃말**, an original village language.
  - 78 dictionary entries (69 words with meanings, 6 fillers, 3 sentence-end particles), plus 28 meaningless
    babble words.
  - Measured on what the game actually plays, **27 %** of the syllables could be Japanese (it was 55 %). Only
    **5.6 %** of the clips could be Japanese as a whole (it was 37 %), and those are the designer's own words
    and the Korean interjections the spec asks for.
  - A fun Korean dictionary for the designer: `docs/눈꽃말_사전.md`.
- **11 voices.** The first build had 10; this pass adds `young_m`.
  - Each voice is one audio sprite of 60 clips: 26 core words, 2 words of its own, 14 babble words, 3 fillers,
    3 particles, 10 emotive one-shots and 2 extra "excited" takes.
  - 22 files plus the manifest come to **3.50 MB** (limit 4 MB).
- **A standalone runtime** (`src/voice/`). It turns any bubble's Korean text into deterministic, legato 눈꽃말
  for that resident.
  - Keywords (with stop lists) give the real words; meaningless babble fills the rest.
  - Prosody follows the punctuation and the mood.
  - 2-voice limit, a queue, distance, ducking, a volume setting.
  - Pause / resume, and protection against stalled frames.
  - Lazy per-voice loading with a readiness gate, so the old chatter stays as the fallback.
  - Decoded sprites are kept at half sample rate.
  - No allocations per frame.
  - Nothing in the game imports it yet; §7 is the integration plan.
- **A 63 s demo** played by the real runtime, a **listening page**, **Node, browser and real-Phaser tests**,
  and a **QA script** that now checks the language and variety on everything the game says. All pass, and
  re-rendering is byte-identical.

I can't listen to audio. Every judgement here comes from measurements, pitch tracking, spectrograms and decoding
in headless Chromium. The designer should listen to `docs/previews/voice_demo.mp3` and the preview page before
the voices replace the old chatter.

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

Neural TTS weights cannot be downloaded (HuggingFace and GitHub are blocked). The voices are built from two
classic, deterministic tools.

1. **Articulation: eSpeak NG 1.52.0**, from the PyPI package `espeakng-loader` 0.2.4.
   - Each invented word is spoken as phoneme input with the Finnish table: pure vowels, y / ø / æ, a rolled r,
     and clusters work.
   - It renders a monotone at about 80 Hz. Only its consonants, vowel formants and phoneme timing are kept.
   - Each word is the first utterance of a fresh helper process, so output is byte-reproducible.
2. **Voice: WORLD vocoder** (pyworld 0.3.5). Analysis is harvest + CheapTrick + D4C at 5 ms. Resynthesis
   applies:
   - **Time map (`render.time_map`).**
     - Voice speed and snappy consonants (×0.8).
     - **Stress:** the stressed (first) vowel runs ×1.45 at full level with a 2.5 st scoop and the melodic peak.
       Unstressed vowels run ×0.8 at 0.85 level, never shorter than 32 ms.
     - Measured stressed / unstressed vowel length is **2.03** (median), vocalic nPVI **67**. It was 1.16 / 34,
       a Japanese-like even rhythm; for reference, Japanese is about 41 and English about 57.
   - **Endings.**
     - A word that ends in a stop (똑땁, 옴뽁, 냠냠뇹) is unreleased like Korean 받침 ㄱ / ㅂ. The vowel runs at
       full level into the closure, then the sound is cut off in 6 ms (after the room tail too, which keeps only
       15 %).
     - A word that ends in an open vowel instead rings out: the last frame is held for about 50 ms while it fades.
     - Decay from the last strong point to −30 dB: unreleased stops **18 ms**, open vowels **58 ms**,
       nasals / l **57 ms**. In the first build stops and vowels were 32 / 25 ms, so a listener could not tell them
       apart.
   - **Melody.**
     - Designed per syllable. Words now end **level or rising** (last slope ≥ +0.5 st), so a line is one bouncy
       chain rather than a list of little falls.
     - The phrase-final fall comes from the runtime: the last word of a statement is played 1.5 st lower, then the
       falling particle 뇰.
     - Meaning-bearing words keep their own tunes: 뫼? rises, 노뱅 falls.
     - Vibrato; the elders' tremor is now 40–45 cents at 6.5–7 Hz.
     - **A soft pitch ceiling at 650 Hz:** a tanh knee from 553 Hz. No clip is shrill.
   - **Timbre.** Formant warp `alpha`, "smile" lift, tilt, breathiness and soft unvoiced sounds. These are
     unchanged, but the low voices have more presence (see §5).
3. **Post-processing** reuses the existing `tools/audio/synth.py` (read-only): high-pass, gentle 2.2:1
   compression, a 0.32 s room at 7 %, then a trim at −48 dB and fades.
4. **Levelling and sprites.**
   - Every clip is set to the same active-speech loudness, with a limiter keeping peaks at or below −1.8 dBFS.
   - Clips are laid end to end with 40 ms gaps, more than the 25 ms mp3 decoder delay.
   - Each sprite's manifest volume puts its median word at the old `sfx_chatter`'s effective level (−21.1).
   - **Phone compensation:** a voice that loses more than the old chatter through a 550 Hz phone-speaker
     high-pass gets half of the difference back, at most +1.5 dB. That is big_gruff +0.6 dB, elder_m +0.3,
     adult_m +0.16, elder_f +0.1.
   - The runtime plays the sprites at the old chatter's 0.4 base gain.

Build time: 40–90 s with cached articulations, about 2 min from scratch.

Re-rendering all 120 clips of two voices in a fresh process gives sample-identical clips. A full rebuild with
cached clips gives byte-identical ogg, mp3, manifest and `lexicon.js`.

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

- **Analysis only.** `praat-parselmouth` (GPL) was used in my scratch venv to re-run the critic's pitch
  measurements. It is not used by any project script and nothing of it ships.
- **No borrowed languages.** No Minionese, Simlish or Animalese words or audio are used. `phonology.py`
  blacklists bello, poopaye, tank yu, bee-do, banana, papoy, hana / dul / sae, sul sul, dag dag, vadish and
  others, and the build refuses any lexicon entry, babble word included, that contains or resembles one.

## 4. The language — 눈꽃말 (Nunkkot-mal)

### Sounds

- **Vowels:** a e i o u, plus ü [y] (뉘 / 뮈 / 퓌), ö [ø] (뵐 / 뫼 / 푀) and ae [æ] (랭 / 냉). There is also eu [ɯ],
  only in 브르르.
- **Syllables:** (C)(C)V(C). Onset clusters are bl pl br pr fl fr gl gr kl kr tr; codas are m n ng l r p k.
  The r is rolled.

### "Does it sound Japanese?" — now measured strictly

`phonology.ja_legal` marks a syllable as Japanese-legal when all of these hold:

- the onset is empty, a single consonant (l counts as Japanese r) or a consonant + y;
- the vowels are a / e / i / o / u / eu;
- the coda is a nasal (ん), a stop before another stop (っ), or the stop of a one-syllable interjection.

The first build counted nasal codas, geminates, reduplication and eu as "not Japanese", which overstated the
difference. They count as Japanese now.

What is not Japanese:

- l / r / s codas;
- a word-final stop after the first syllable;
- a stop before a non-stop;
- clusters;
- ü / ö / æ;
- the trill.

Rules enforced by the build (`phonology.check`):

- Every content word must have at least one non-Japanese syllable. The exceptions are the designer's own
  꼬맙뿌, 촌촌님 and 우와뿅.
- Every babble word must be at least half non-Japanese syllables.
- `check_voice.py` fails when more than 30 % of the syllables the village hears (play-weighted, every game line
  through the runtime) are Japanese-legal.

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
- Sentence-end particles: **뀰?** for questions (rising), **얄!** for excitement, **뇰** for a plain statement
  (falling).
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

브뢸까, 플뤼몹, 가릴롭, 쁠림빽, 뛸락, 발뤼, 끄림봅, 뇔빡, 뜨뤼빅, 뽈뤽, 빔블로, 프륄랄, 까블림, 댈롭, 롬뷜, 글뢰모,
퀼뽀릭, 밸삑, 쁠록까, 되뤽, 뾸로, 뜨림발, 플로삑, 귈룸, 브래뽐, 뉙까롭, 돌블립, 끌뢰밀.

- Residents babble these when a line has no keyword. Dictionary words are heard only when the bubble has their
  keyword, so the share of heard words that carry an unrelated meaning drops from 78 % to **0 %**.
- Each voice records a window of 14 from a hash-shuffled pool. The windows were chosen so the most-heard voices
  (young_m, adult_m, adult_f, big_gruff) do not share their words, and each word is said by 5–6 voices.

### Keywords

Korean stems in a bubble trigger the matching word: 고마 → 꼬맙뿌, 촌장 → 촌촌님, 생선 / 물고기 → 퓌뽈, 빵 → 브랑,
추워 → 브르르, 정말 / 너무 → 뿔, and so on. The longest keyword wins.

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
- Risky one-character stems were replaced: 방 → 방에 / 방이, 작 → 작은 / 작아, 강 → 강물 / 강가, 냥 → 냥이,
  화가 → 화가 나. 고기 no longer means fish, and 일이 no longer means work.
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

- **Distinct pitches.** The closest pair is now adult_f / sweet at 1.28 st. Before, kid_boy / sweet and
  chief / elder_f were both 0.3 st apart; they are now 2.8 st and 2.6 st apart.
- **young_m** splits the old adult_m crowd. adult_m now covers 8 cast keys and young_m 7. Town adults are
  40 % adult_f, 20 % adult_m, 20 % young_m, 10 % sweet and 10 % big_gruff. Teens are kid_girl or young_m.
- **Registers within a type.** Residents who share a voice sit on one of five registers (−2.2, −1.1, 0, +1.1,
  +2.2 st) chosen by their id; it used to be a uniform ±1.4 st. On top come the persona tweaks: toddler +1.5,
  prankster +1.2, teen −1.6, and so on.
- **Never piercing.** No clip goes above 650 Hz, and the measured clip peak is 641 Hz.
  - The runtime may play a voice only a little higher than recorded: squeaky +1.0 st, kid_girl +2.0,
    kid_boy +2.5, others +4.5. The highest pitch anywhere in the game is therefore **696 Hz**. Before, a clip
    peaked at 913 Hz and the runtime could reach about 1.06 kHz.
  - squeaky is now "faster, not higher": speed 1.5, range 1.15, smile 1.5, tilt −0.5. Its 2–5 kHz share fell
    from 11.2 % to 5.8 % (the critic's measure).
- **Phone speakers.** Low voices got more presence (big_gruff smile 2.5 / tilt −1.2, elder_m tilt −0.8) plus
  the volume compensation in §2. Across the voices, levels through a phone speaker now spread 0.96 dB (QA
  measure); it was 2.2 dB.
- **Emotes** (each with its own melody):
  - greet 뽀얄!, laugh (one style per voice), surprise 우와!, sad 흐잉…, grumpy 흥!, question 응?, thanks 꼬맙뿌!,
    yummy 냠냠~, oops 앗!
  - excited has three takes: **야호!** for lines that cheer (야호 / 신나 / 만세), and **와랄라!** or **뿌룰루!**
    for other excited lines.
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

Planning is deterministic: every random number comes from `mulberry32(FNV(voice | speakerId | text | variant))`.
The same line from the same resident always sounds the same.

- **Mood.** The earliest cue in the line wins:
  - laugh: ㅋㅋ / 하하 / 깔깔 / 까르륵 / 껄껄 / 허허 / 키득
  - sad: ㅠ / 흐잉 / 슬퍼
  - grumpy: 흥 / 짜증 / 차가워 / 가만 안 둬 / 야아!
  - oops: 앗 / 이런 / 아이고
  - surprise: 우와 / 와아! / 헉
  - thanks: 고마; yummy: 맛있; greet: 안녕
  - excited: 야호 / 신나 / !! / 최고

  A line whose only cue is a final "!" gets a **bright** delivery (+0.6 st, slightly quicker) and no emote. That
  covers 46 % of the game's lines; before, all of them were "excited" and 35 % of them got 야호!.
- **Words.** About 1 word per 2.4 Korean syllables, clamped to 1–6, with babble trimmed to `maxDur` (2.6 s).
  - Keywords go first, in text order at proportional positions.
  - The rest is babble, with a 20 % chance of a filler in the middle.
  - No word repeats by chance; now and then a short keyword word is doubled.
- **Particle and emote.**
  - 뀰? ends every question, unless the 응? emote ends it.
  - 얄! follows 25 % of "!" lines.
  - 뇰 follows 40 % of statements.
  - An emote goes at the start (greet, surprise, oops, grumpy) or at the end (the rest). The chance is 92 % when
    the line opens with the cue and 65 % when the cue comes later.

### Delivery

- **Legato.** Each clip starts where the previous clip's sound ends: its `tail` (the end below −20 dB) is
  overlapped. The added gap is ((−15…+25 ms) × mood gap + mood pause) × voice tempo, never negative after an
  unreleased stop, so the closure stays. A real pause of 120–200 ms comes only at a comma or a sentence break.
- **Measured over the game's lines:**
  - pace **5.8 syllables/s** (was 4.0);
  - sound fills **92 %** of each line (critic's audio measure: 5 % silence, was 27 %);
  - 0.5 silent runs per line (was 3.1);
  - median gap after the tail 6 ms.
- **Prosody**, applied through `playbackRate`, so higher is also slightly faster.
  - The speaker's register (five steps), plus the mood: excited +1.5 st, sad −1.7 st with +70 ms pauses,
    grumpy −1.1 st, and so on.
  - Declination per word.
  - Questions get +1.2 st on the last word, then the rising 뀰?.
  - Statements get −1.5 st on the last word, then the falling 뇰.
  - Rate is clamped between 0.72 and the voice's MAX_UP.

### Scheduling and robustness

- **Lookahead.** Clips are handed to the audio clock 0.12 s ahead.
- **Stalled frames.** A clip handed out more than 50 ms late (stalled frames, or a scene pause without the hook)
  moves the rest of its line along instead of firing everything at once. The critic's repro used to start
  5 clips at 4.300 s; now they start spaced 230–250 ms apart.
- **Pause.** `pause()` takes back clips that have not started and lets the current word finish. `resume()` goes
  on from there, and waiting lines wait too.
- **Concurrency.**
  - At most 2 lines sound at once.
  - Up to 3 more wait, for at most 1.2 s.
  - A more important line (the chief) preempts with a 40 ms fade.
  - A new bubble from the same speaker replaces what that speaker was saying.
- **Distance.** Checked at the start of a line and 4× a second.
- **Loading.**
  - `speak()` for a voice whose sprite is not decoded returns null and calls `need()`. `ready()` lets the game
    keep its old chatter for that line.
  - Without a manifest (the fragment is not packaged, or the app is offline), `ready()` stays false.
- **Memory per frame.** `update()` allocates nothing: 300 k frames grew the heap by 3 KB.

### Backend (`webaudio.js`)

- Signal path: per-clip source (+ gain) → channel gain → voice bus (volume × 0.4 × duck) → the game's sound
  destination, so mute and master volume apply.
- **Start delay.** The decoder start delay is detected per sprite and shifted away when it is more than 12 ms.
- **Half-rate sprites.** On first use each decoded sprite is converted to half its sample rate with a 7-tap
  half-band filter and 2:1 decimation, about 5 ms per sprite. The voices have nothing above about 10 kHz.
  `release(key)` lets Phaser drop its full-rate copy.

## 7. Integration plan

This is for the code agents; none of these files were edited.

Every bubble goes through `Bubbles.chat()`: `Resident.say`, `TownSim.chatter`, Neighbours actors and visitors.
One hook covers all of them, and the old chatter remains the fallback.

1. **Ship the fragment.** In `src/core/Assets.js`:
   ```js
   export const LATE_FRAGMENTS = ['town', 'townfolk', 'roads', 'audio3', 'voice'];
   ```
   `tools/build/build_artifact.mjs` then packages `assets/voice` like the other late fragments. Add a
   `test_deploy` check that `assets/voice/manifest.json` and one sprite are in the artifact. Until this line
   exists, `check_voice.py` prints a WARN.
2. **Create it** in `scenes/Game.js`, in `create()`, after the village systems exist:
   ```js
   import { attachVillageVoice } from '../voice/phaser.js';
   import { voiceFor } from '../voice/cast.js';
   // optional: fetch the voices of the residents already living here (the chief is left out: the player has no bubbles)
   const types = [...new Set(this.life.residents.map(voiceFor).filter((t) => t && t !== 'chief'))];
   this.voice = attachVillageVoice(this, { volume: Settings.data.voice ?? 1, types });   // null without Web Audio
   ```
   Pausing and resuming the Game scene pause and resume the voices automatically (`phaser.js` listens to the
   scene's `pause` / `resume` events).
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
   Give the info card in `Neighbours.js` (`B.chat(w, s, …)` with the `tfCard` text) an `opts.silent`; it is not
   speech.
5. **Keep the old chatter as the fallback**, gated by readiness and not just by existence. In
   `systems/VillageLife.js`:
   ```js
   chatter(r) {
     if (this.gs.voice && this.gs.voice.ready(r)) return;     // 눈꽃말 spoke through Bubbles.chat
     ...old sfx_chatter code (first line of a not-yet-loaded voice, no Web Audio, fragment missing)...
   }
   sfxLaugh(r) { if (this.gs.voice && this.gs.voice.ready(r)) this.gs.voice.emote(r, 'laugh'); else this.life.sfx('sfx_laugh', r.x, r.y, 0.45); }
   ```
   Change the two direct `life.sfx('sfx_laugh', …)` calls the same way (the snowball-tag and snowman events,
   around lines 1324 and 1469): `const v = gs.voice; v && v.ready(o) ? v.emote(o, 'laugh') : …`.
   `TownSim.chatter()` needs no change, because its `B.chat` already speaks.
6. **Duck only under milestone sounds, not on every sale.** In `core/Audio.js` `play()`, after
   `this.sm.play(k, cfg)`:
   ```js
   if (this.onImportant && /^sfx_(levelup|complete|unlock|build_done|hire|mission_done|fame_up)$/.test(k)) this.onImportant();
   ```
   and in `Game.create`: `Audio.onImportant = () => this.voice && this.voice.duck(0.35, 0.7);`.
   `sfx_cash` and `sfx_register` play on every sale and must not duck.
7. **Settings.** `Settings.load()` currently drops unknown keys, so the volume would not be saved. In
   `core/Save.js`:
   ```js
   data: { sound: true, music: true, lang: null, zoom: null, daynight: true, voice: 1 },
   // in load():
   this.data.voice = typeof s.voice === 'number' && s.voice >= 0 && s.voice <= 1 ? s.voice : 1;
   ```
   Add a "주민 목소리" slider next to the sound toggle that calls `Settings.save()` and
   `gs.voice && gs.voice.setVolume(v)`.
8. **Chief lines** get priority 2 automatically in `speakBubble`. Scripted moments can call
   `gs.voice.speak(text, gs.player, { priority: 2, emotion: 'thanks' })`.

### Memory

The 11 sprites hold 263.6 s of mono audio.

- Decoded at a 48 kHz context, that is about 4.6 MB per voice. The backend keeps each sprite at half rate:
  about **2.0–2.6 MB per voice**, 25 MB if all 11 were loaded.
- Only the voices that actually speak are loaded. The chief never loads unless something makes the player speak.
- A typical village with 8 types is about **18 MB**. Before, all 10 were loaded at full rate: 35 MB.
- The old chatter used about 0.8 MB.

## 8. QA numbers

`python3 tools/voice/check_voice.py` → **RESULT: OK** (`docs/previews/voice_report.txt`). The one WARN is the
integration step in §7.1.

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

- **Effective level.** The old chatter is at −21.14. The voices sit at −21.0 ± 0.15, plus their phone
  compensation (big_gruff −20.40 = −21.0 + 0.6).
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

- **Node:** `node --expose-gc tools/test/voice_runtime.mjs` → **29 passed, 0 failed**. Beyond the earlier
  coverage (determinism, length, prosody, keywords, concurrency, queue, priority, distance, ducking, volume,
  not-loaded, no per-frame allocation), it now covers:
  - legato delivery (median gap after the tail 11 ms, 5.8 % silence);
  - polish moods (hit lines grumpy, laughs, 와아; a bare "!" gets no emote and no 야호!; 야호! only for cheering
    lines);
  - the keyword stop lists: 15 game lines that used to misfire, plus 5 that must still match;
  - register steps and squeaky's pitch limit;
  - pause / resume;
  - stalled frames (spaced, not a burst);
  - lazy loading (ready / need / loader called once / no manifest → not ready).
- **Browser:** `node tools/test/voice_preview.mjs` → **ALL PASS**.
  - All 22 files decode in Chromium to the right length; clips start within 8.3 ms, under the 12 ms decoder
    rule.
  - A real Web Audio render sounds while speaking and is silent after, peaks at 0.55, and never has more than
    2 voices.
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

- **Demo:** `docs/previews/voice_demo.mp3`, 63.2 s, −16.7 LUFS. `voice_demo.txt` lists each bubble and what is
  heard.
  - 0–27 s: all 11 voices say hello and something in character. For example the boy says
    "안녕! 콩이랑 같이 놀자!" → 뽀얄! 왈뽕 플링 플로삑 얄!
  - 28 s on: a snowy-day scene.
    - Three neighbours chat: greeting, gossip, and a joke with laughter (헤헤헷 / 와하하하).
    - A question and answer: the kid asks "축제는 언제 해요?" (… 뀰?) and the chief answers 와랄라!.
    - The chief thanks the baker (… 냠냠뇹 꼬맙뿌!).
    - The kids squeal at the dog, which barks back.
    - Grandpa grumbles (흥! …) and then laughs (호호호), and grandma slips (앗! …).
    - Everyone says goodbye (뿔룽뿔룽).
  - From 50 s, `bgm_village` fades in at the game's balance.
- **Listening page:** run `node tools/test/serve.mjs 8000` and open
  `http://localhost:8000/docs/previews/voice_preview.html`. The page has:
  - a box to type any Korean line and hear it in any voice; keyword words are underlined;
  - emotion and resident-number pickers;
  - every clip of every voice, grouped as emotes, words and babble;
  - the crowd button (2 at a time), the ducking demo, a volume slider and the in-game level switch;
  - the whole dictionary.
- **Rebuild:** `python3 -m pip install numpy scipy pyworld "setuptools<81" espeakng-loader`, then
  `python3 tools/voice/build_voice.py`.
  - After editing keywords only: `--lexicon-only`.
  - Demo: `node tools/voice/demo.mjs && python3 tools/voice/demo_mix.py`.
  - What the game says: `node tools/voice/heard.mjs`.

## 10. Known issues and limits

- **Nobody has listened yet.** WORLD resynthesis of eSpeak gives a soft, toy-like vocoder voice, not a recorded
  human. The designer should judge especially:
  - the stronger stress bounce;
  - legato delivery, which is now faster;
  - squeaky, now faster rather than higher;
  - the elder tremor at 6.5–7 Hz;
  - young_m against adult_m.

  Every voice is one parameter dictionary in `tools/voice/voices.py`, and a rebuild takes 1–2 min.
- **Particles are the most frequent clips.** 뇰 is 3.7 % and 얄! 3.3 % of what is heard. That is grammar, like
  Korean 요; every word and babble clip is ≤ 3 %.
- **Keyword coverage.** A keyword whose word a voice did not record is babbled instead: 33 % of hits, mostly big,
  cute, oops and dog in the adult voices. Each extra core word costs about 0.3 s per voice.
- **Varispeed.** Register and mood offsets go through `playbackRate`, so pitch and tempo move together, within
  0.72 to MAX_UP.
- **Decoded memory** is 2.0–2.6 MB per loaded voice (§7). That is still well above the old chatter.
- **Pitch tracking.** Harvest misreads one squeaky babble clip, 쁠림빽, as 822 Hz; Praat and DIO give 537 Hz. The QA
  uses the lower of two agreeing trackers.
- **Reproducibility** depends on the eSpeak NG and libvorbis builds. Another machine may produce slightly
  different bytes; rebuild and run the check there.

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
