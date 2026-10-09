"""눈꽃말 voice tools - the eleven village voices and what each one records (library).

Every voice is a consistent timbre: base pitch (Hz) and melodic range, formant scale `alpha`
(vocal-tract size: >1 smaller / cuter), speed, breathiness, spectral tilt / smile, vibrato (or an
elder's tremor) and jitter. All of them speak the same core words (so the runtime can map a bubble's
Korean keywords to the same 눈꽃말 word for everyone) plus two words of their own, 12 meaningless babble
words (from a pool of 20), three fillers, three sentence-ending particles and ten emotive one-shots
(+ two extra takes of 'excited').

Parameters (see vocoder.py for what they do):
    f0      base pitch, Hz (melody targets are semitones over it)
    range   scale of the melodic moves (1 = +-6 st word melodies)
    alpha   formant scale; speed = articulation speed (1 = eSpeak rate 190)
    breath  aperiodicity floor 0..1; smile = dB lift around F2; tilt = dB/oct above 1 kHz
    vib     (cents, Hz, weight on every vowel) - elders use it as a gentle tremor
    jitter  cents of slow random pitch wander; locut / hicut: Hz
"""
from __future__ import annotations

VOICES = {
    # polish: pitches spread so no two types sit within ~1.5 st (kid_boy / sweet and chief / elder_f collided),
    # everyone a bit faster (Minion-like chatter), squeaky faster rather than higher, elders' tremor faster
    # so it is heard on short vowels, low voices with more presence (phone speakers), + young_m
    "kid_boy":   dict(ko="남자아이", en="boy", f0=332, range=1.2, alpha=1.34, speed=1.4, breath=0.10, smile=2.0,
                      tilt=0.0, vib=(28, 6.2, 0.0), jitter=8, locut=150, hicut=8500, laugh="kihi",
                      desc="씩씩하고 빠른 꼬마. 말끝이 통통 튀어요."),
    "kid_girl":  dict(ko="여자아이", en="girl", f0=382, range=1.25, alpha=1.38, speed=1.36, breath=0.12, smile=2.0,
                      tilt=0.0, vib=(30, 6.5, 0.0), jitter=8, locut=170, hicut=8600, laugh="hihi",
                      desc="높고 맑은 목소리, 노래하듯 오르내려요."),
    "adult_m":   dict(ko="어른 남자", en="man", f0=165, range=1.05, alpha=1.12, speed=1.25, breath=0.07, smile=1.8,
                      tilt=0.0, vib=(20, 5.5, 0.0), jitter=7, locut=95, hicut=7800, laugh="haha",
                      desc="부드럽고 다정한 동네 아저씨."),
    "young_m":   dict(ko="청년", en="young man", f0=178, range=1.15, alpha=1.18, speed=1.3, breath=0.08, smile=2.2,
                      tilt=0.0, vib=(22, 5.8, 0.0), jitter=7, locut=105, hicut=8200, laugh="hehe",
                      desc="밝고 싹싹한 동네 청년. 말이 빠르고 가벼워요."),
    "adult_f":   dict(ko="어른 여자", en="woman", f0=258, range=1.2, alpha=1.22, speed=1.3, breath=0.11, smile=2.5,
                      tilt=0.0, vib=(24, 5.8, 0.0), jitter=7, locut=130, hicut=8400, laugh="ahaha",
                      desc="밝고 수다스러운 이웃 아주머니/언니."),
    "elder_m":   dict(ko="할아버지", en="grandpa", f0=140, range=0.9, alpha=1.04, speed=0.98, breath=0.15, smile=2.0,
                      tilt=-0.8, vib=(40, 6.5, 0.7), jitter=10, locut=85, hicut=7200, laugh="hoho_low",
                      desc="느긋하고, 살짝 떨리는 따뜻한 목소리."),
    "elder_f":   dict(ko="할머니", en="grandma", f0=208, range=0.95, alpha=1.15, speed=1.02, breath=0.17, smile=1.5,
                      tilt=-1.0, vib=(45, 7.0, 0.7), jitter=10, locut=115, hicut=7600, laugh="ohoho",
                      desc="다정하고 조금 떨리는 할머니 목소리."),
    "chief":     dict(ko="촌장님 (플레이어)", en="chief", f0=225, range=1.3, alpha=1.17, speed=1.3, breath=0.07,
                      smile=2.5, tilt=0.0, vib=(22, 5.8, 0.0), jitter=6, locut=110, hicut=8400, laugh="ahaha_chief",
                      desc="씩씩하고 따뜻한 우리 촌장님. 신나면 노래하듯."),
    "big_gruff": dict(ko="덩치 큰 아저씨", en="big uncle", f0=108, range=1.0, alpha=0.9, speed=1.06, breath=0.09,
                      smile=2.5, tilt=-1.2, vib=(18, 5.0, 0.0), jitter=9, locut=70, hicut=6600, laugh="wahaha",
                      desc="낮고 둥글둥글한 곰 같은 아저씨. 무섭지 않아요!"),
    "sweet":     dict(ko="상냥한 언니", en="sweet sister", f0=290, range=1.0, alpha=1.25, speed=1.12, breath=0.22,
                      smile=3.0, tilt=-0.5, vib=(26, 5.6, 0.0), jitter=6, locut=140, hicut=8000, laugh="hufu",
                      desc="속삭이듯 부드럽고 숨결이 섞인 목소리."),
    "squeaky":   dict(ko="꼬마 삑삑이", en="squeaky", f0=420, range=1.15, alpha=1.52, speed=1.5, breath=0.08,
                      smile=1.5, tilt=-0.5, vib=(40, 7.2, 0.0), jitter=10, locut=220, hicut=8800, laugh="kihi_fast",
                      desc="아주 작고 신난 삑삑이 (아기·꼬마 요정 같은). 높기보다 빨라요."),
}

# no clip goes above this pitch (soft knee): small voices stay cute, never piercing; the runtime adds at
# most a little more (VillageVoice MAX_UP) so nothing in the game goes past ~750 Hz
F0_CEIL = 650.0

# every voice records these (runtime keyword mapping relies on it). Polish: me / we / water / go / please
# joined the core (their keywords are common in the game's lines), the per-voice extras went down to two.
CORE_WORDS = ["hello", "bye", "thanks", "yes", "no", "good", "wow", "yummy", "love", "friend", "chief", "village",
              "snow", "cold", "fish", "bread", "money", "work", "home", "very", "what",
              "me", "we", "water", "go", "please"]
FILLERS = ["and", "youknow", "hmm"]
PARTICLES = ["q", "excl", "end"]
# ...plus two of their own (so more of the dictionary is heard somewhere in the village)
EXTRA_WORDS = {
    "kid_boy": ["dog", "play"],
    "kid_girl": ["play", "cute"],
    "adult_m": ["boat", "eat"],
    "young_m": ["train", "music"],
    "adult_f": ["welcome", "eat"],
    "elder_m": ["warm", "tired"],
    "elder_f": ["warm", "baby"],
    "chief": ["help", "welcome"],
    "big_gruff": ["wood", "fire"],
    "sweet": ["flake", "cute"],
    "squeaky": ["play", "dog"],
}
# meaningless babble (lexicon cat 'babble'): what residents chatter when a line has no keyword. Each voice
# records BABBLE_PER_VOICE of the pool, picked by a stable hash, so the village as a whole uses all of them
BABBLE_PER_VOICE = 14


# where each voice's window starts in the shuffled pool: chosen so the voices heard most in the game
# (young_m, adult_m, adult_f, big_gruff: tools/voice/heard.mjs) do not share their words, which keeps every
# babble word under ~2.5 % of all clips heard
BABBLE_START = {"young_m": 0, "adult_m": 14, "adult_f": 7, "big_gruff": 21, "elder_m": 21, "sweet": 7,
                "kid_girl": 21, "elder_f": 7, "kid_boy": 14, "squeaky": 0, "chief": 0}


def babble_list(voice: str):
    """the BABBLE_PER_VOICE babble words this voice records: a window of the (hash-shuffled) pool"""
    import zlib

    import phonology as P
    pool = sorted((w["id"] for w in P.load_lexicon()["words"] if w.get("cat") == "babble"),
                  key=lambda i: zlib.crc32(f"babble|{i}".encode()))
    start = BABBLE_START.get(voice, 0) % len(pool)
    return [pool[(start + j) % len(pool)] for j in range(min(BABBLE_PER_VOICE, len(pool)))]


EMOTES = ["greet", "laugh", "surprise", "excited", "sad", "grumpy", "question", "thanks", "yummy", "oops"]
EMOTE_KO = {"greet": "인사 '뽀얄!'", "laugh": "웃음", "surprise": "놀람 '우와!'", "excited": "신남 '야호!'",
            "sad": "슬픔 '흐잉'", "grumpy": "투덜 '흥!'", "question": "질문 '응?'", "thanks": "고마워 '꼬맙뿌!'",
            "yummy": "냠냠", "oops": "앗!"}


def word_list(voice: str):
    return CORE_WORDS + EXTRA_WORDS[voice] + babble_list(voice) + FILLERS + PARTICLES


# extra takes of an emote (another melody / another word), picked by the runtime by hash so one sound does
# not end every excited line: emote -> [(clip id suffix, roman, hangul)]
EMOTE_TAKES = {"excited": [("2", "wa.ral.la", "와랄라!"), ("3", "pu.rul.lu", "뿌룰루!")]}

# what an emote sounds like, written in hangul (manifest marker `say`, dictionary, previews)
EMOTE_SAY = {"greet": "뽀얄!", "surprise": "우와!", "excited": "야호!", "sad": "흐잉…", "grumpy": "흥!",
             "question": "응?", "thanks": "꼬맙뿌!", "yummy": "냠냠~", "oops": "앗!"}
LAUGH_SAY = {"kihi": "키히히히히", "hihi": "히히히힛", "haha": "하하하하", "hehe": "헤헤헷", "ahaha": "아하하하", "hoho_low": "호호호",
             "ohoho": "오호호호", "ahaha_chief": "아하하핫!", "wahaha": "와하하하", "hufu": "후후히", "kihi_fast": "끼히히히히히"}


def emote_say(voice: str, emote: str) -> str:
    return LAUGH_SAY[VOICES[voice]["laugh"]] if emote == "laugh" else EMOTE_SAY[emote]

