"""눈꽃말 voice tools - the ten village voices and what each one records (library).

Every voice is a consistent timbre: base pitch (Hz) and melodic range, formant scale `alpha`
(vocal-tract size: >1 smaller / cuter), speed, breathiness, spectral tilt / smile, vibrato (or an
elder's tremor) and jitter. All of them speak the same core words (so the runtime can map a bubble's
Korean keywords to the same 눈꽃말 word for everyone) plus a few words of their own, three fillers,
three sentence-ending particles and ten emotive one-shots.

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
    "kid_boy":   dict(ko="남자아이", en="boy", f0=290, range=1.2, alpha=1.30, speed=1.24, breath=0.10, smile=2.0,
                      tilt=0.0, vib=(28, 6.2, 0.0), jitter=8, locut=150, hicut=8500, laugh="kihi",
                      desc="씩씩하고 빠른 꼬마. 말끝이 통통 튀어요."),
    "kid_girl":  dict(ko="여자아이", en="girl", f0=345, range=1.3, alpha=1.38, speed=1.2, breath=0.12, smile=3.0,
                      tilt=0.5, vib=(30, 6.5, 0.0), jitter=8, locut=170, hicut=8800, laugh="hihi",
                      desc="높고 맑은 목소리, 노래하듯 오르내려요."),
    "adult_m":   dict(ko="어른 남자", en="man", f0=165, range=1.05, alpha=1.12, speed=1.06, breath=0.07, smile=1.5,
                      tilt=-0.5, vib=(20, 5.5, 0.0), jitter=7, locut=95, hicut=7800, laugh="haha",
                      desc="부드럽고 다정한 동네 아저씨/청년."),
    "adult_f":   dict(ko="어른 여자", en="woman", f0=255, range=1.2, alpha=1.22, speed=1.12, breath=0.11, smile=2.5,
                      tilt=0.0, vib=(24, 5.8, 0.0), jitter=7, locut=130, hicut=8400, laugh="ahaha",
                      desc="밝고 수다스러운 이웃 아주머니/언니."),
    "elder_m":   dict(ko="할아버지", en="grandpa", f0=140, range=0.9, alpha=1.04, speed=0.86, breath=0.15, smile=1.0,
                      tilt=-1.5, vib=(32, 5.0, 0.55), jitter=10, locut=85, hicut=7000, laugh="hoho_low",
                      desc="느릿느릿, 살짝 떨리는 따뜻한 목소리."),
    "elder_f":   dict(ko="할머니", en="grandma", f0=225, range=0.95, alpha=1.15, speed=0.9, breath=0.17, smile=1.5,
                      tilt=-1.0, vib=(36, 5.4, 0.6), jitter=10, locut=120, hicut=7600, laugh="ohoho",
                      desc="다정하고 조금 떨리는 할머니 목소리."),
    "chief":     dict(ko="촌장님 (플레이어)", en="chief", f0=205, range=1.35, alpha=1.17, speed=1.16, breath=0.07,
                      smile=2.5, tilt=0.0, vib=(22, 5.8, 0.0), jitter=6, locut=110, hicut=8400, laugh="ahaha_chief",
                      desc="씩씩하고 따뜻한 우리 촌장님. 신나면 노래하듯."),
    "big_gruff": dict(ko="덩치 큰 아저씨", en="big uncle", f0=108, range=1.0, alpha=0.9, speed=0.94, breath=0.09,
                      smile=0.5, tilt=-2.5, vib=(18, 5.0, 0.0), jitter=9, locut=70, hicut=6200, laugh="wahaha",
                      desc="낮고 둥글둥글한 곰 같은 아저씨. 무섭지 않아요!"),
    "sweet":     dict(ko="상냥한 언니", en="sweet sister", f0=285, range=1.0, alpha=1.25, speed=0.98, breath=0.22,
                      smile=3.0, tilt=-0.5, vib=(26, 5.6, 0.0), jitter=6, locut=140, hicut=8000, laugh="hufu",
                      desc="속삭이듯 부드럽고 숨결이 섞인 목소리."),
    "squeaky":   dict(ko="꼬마 삑삑이", en="squeaky", f0=470, range=1.45, alpha=1.52, speed=1.36, breath=0.08,
                      smile=3.0, tilt=0.5, vib=(40, 7.2, 0.0), jitter=10, locut=220, hicut=9200, laugh="kihi_fast",
                      desc="아주 작고 신난 삑삑이 (아기·꼬마 요정 같은)."),
}

# every voice records these (runtime keyword mapping relies on it)
CORE_WORDS = ["hello", "bye", "thanks", "yes", "no", "good", "wow", "yummy", "love", "friend", "chief", "village",
              "snow", "cold", "fish", "bread", "money", "work", "home", "very", "what"]
FILLERS = ["and", "youknow", "hmm"]
PARTICLES = ["q", "excl", "end"]
# ...plus a few of their own (so most of the dictionary is heard somewhere in the village)
EXTRA_WORDS = {
    "kid_boy": ["play", "dog", "go", "big"],
    "kid_girl": ["play", "cute", "star", "cat"],
    "adult_m": ["boat", "train", "eat", "wood"],
    "adult_f": ["welcome", "please", "three", "water"],
    "elder_m": ["warm", "tired", "water", "two"],
    "elder_f": ["warm", "baby", "sleep", "four"],
    "chief": ["help", "welcome", "go", "come"],
    "big_gruff": ["wood", "fire", "eat", "big"],
    "sweet": ["flake", "music", "moon", "please"],
    "squeaky": ["play", "small", "five", "ice"],
}

EMOTES = ["greet", "laugh", "surprise", "excited", "sad", "grumpy", "question", "thanks", "yummy", "oops"]
EMOTE_KO = {"greet": "인사 '뽀얌!'", "laugh": "웃음", "surprise": "놀람 '우와!'", "excited": "신남 '야호!'",
            "sad": "슬픔 '흐잉'", "grumpy": "투덜 '흥!'", "question": "질문 '응?'", "thanks": "고마워 '꼬맙뿌!'",
            "yummy": "냠냠", "oops": "앗!"}


def word_list(voice: str):
    return CORE_WORDS + EXTRA_WORDS[voice] + FILLERS + PARTICLES

# what an emote sounds like, written in hangul (manifest marker `say`, dictionary, previews)
EMOTE_SAY = {"greet": "뽀얌!", "surprise": "우와!", "excited": "야호!", "sad": "흐잉…", "grumpy": "흥!",
             "question": "응?", "thanks": "꼬맙뿌!", "yummy": "냠냠~", "oops": "앗!"}
LAUGH_SAY = {"kihi": "키히히히히", "hihi": "히히히힛", "haha": "하하하하", "ahaha": "아하하하", "hoho_low": "호호호",
             "ohoho": "오호호호", "ahaha_chief": "아하하핫!", "wahaha": "와하하하", "hufu": "후후히", "kihi_fast": "끼히히히히히"}


def emote_say(voice: str, emote: str) -> str:
    return LAUGH_SAY[VOICES[voice]["laugh"]] if emote == "laugh" else EMOTE_SAY[emote]

