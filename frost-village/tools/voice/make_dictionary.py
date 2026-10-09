"""눈꽃말 voices - write the designer's dictionary docs/눈꽃말_사전.md from lexicon.json + the voice manifest.

    python3 tools/voice/make_dictionary.py        (build_voice.py runs it too)
The prose is here; the word tables, the emote table and 'who says it' come from the data, so the
dictionary never disagrees with what the game plays.
"""
from __future__ import annotations

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import phonology as P  # noqa: E402
import voices as VV  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
DST = os.path.join(ROOT, "docs", "눈꽃말_사전.md")

CATS = [("greet", "인사"), ("social", "예의 바른 말"), ("answer", "대답"), ("feeling", "기분"), ("food", "먹을 것"),
        ("nature", "눈꽃마을의 자연"), ("thing", "물건과 장소"), ("action", "하는 일"), ("person", "사람"),
        ("animal", "동물"), ("question", "물어보는 말"), ("number", "숫자"), ("size", "크기와 정도"),
        ("filler", "이음말 (말과 말 사이)"), ("particle", "끝말 (문장 끝에 붙는 말)")]

EXAMPLES = [
    ("뽀얌, 촌촌님!", "안녕하세요, 촌장님!"),
    ("꼬맙뿌, 뮐리!", "고마워, 친구야!"),
    ("뿔 브르르… 뉘뉘 봄봄 뇽.", "정말 추워요… 눈이 많이 와요."),
    ("냉 퓌뽈 뭄 녹?", "너 생선 먹을래?"),
    ("뉨! 냠냠뇹!", "응! 맛있어!"),
    ("뮈뮈 마울 뿔 블룸 얍!", "우리 마을 정말 최고야!"),
    ("왈뽕, 플링 녹?", "강아지야, 놀래?"),
    ("엡뿔! 뮈 브랑…", "앗! 내 빵…"),
    ("뫼? 올뮈 프룽 녹?", "뭐? 어디 가?"),
    ("뮌 뇽. 뇨롬 뇽.", "밤이에요. 자요."),
    ("똑땁 똑땁! 옴뽁 봄봄 얍!", "뚝딱뚝딱! 큰 집이 생겼다!"),
    ("뵐랑, 냉.", "너를 정말 좋아해."),
    ("뿔룽뿔룽! 엔뎅 옹 녹?", "잘 가! 언제 또 와?"),
    ("잉, 뒬, 뜨렘, 푀, 빔빔!", "하나, 둘, 셋, 넷, 다섯!"),
    ("끌룹 뿌띵!", "도와주세요!"),
    ("뉘블룸 마울, 왈랑!", "눈꽃마을에 어서 와요!"),
]


def main():
    lex = P.load_lexicon()
    man_path = os.path.join(ROOT, "assets", "voice", "manifest.json")
    man = json.load(open(man_path, encoding="utf-8")) if os.path.exists(man_path) else {"audio": {}, "voices": {}}
    who = {}
    for e in man["audio"].values():
        for k, m in e["markers"].items():
            if m["kind"] != "emote":
                who.setdefault(k, []).append(VV.VOICES[e["voiceType"]]["ko"])
    nvoice = len(VV.VOICES)
    L = []
    w = L.append
    w("# 눈꽃말 사전 — 우리 마을 말 (Nunkkot-mal)")
    w("")
    w("> 행복한 눈꽃마을 주민들이 쓰는 말이에요. 말풍선 글자는 그대로 **한국어**로 보이고, 소리만 **눈꽃말**로 재잘재잘 들려요.")
    w("> (이 문서는 `tools/voice/make_dictionary.py`가 `tools/voice/lexicon.json`에서 자동으로 만들어요 — 낱말을 고치려면 lexicon.json을 고치고 다시 만들면 돼요.)")
    w("")
    w("## 1. 눈꽃말은 이런 말이에요")
    w("")
    w("- **통통 튀어요.** 받침이 있는 소리(뽀얌, 블룸, 똑땁)가 많아서 말이 콩콩 끊기며 튀어요.")
    w("- **입술이 동그래요.** `뉘 · 뮈 · 퓌`(입술을 쭉 내밀고 '이'), `뵐 · 뫼 · 푀`(입술을 쭉 내밀고 '에'), `랭 · 냉`(입을 옆으로 크게 '애') 소리가 우리 말의 특징이에요.")
    w("- **겹소리가 있어요.** `블 · 프르 · 끌 · 뜨르`처럼 자음 두 개가 붙어서 나는 소리 (블룸, 프룽, 끌룹, 뜨렘).")
    w("- **ㄹ을 또르르 굴려요.** 브르르(춥다!), 끼링(얼음), 뾰롱(귀여워).")
    w("- **노래하듯 말해요.** 낱말마다 높았다 낮았다 통통 튀고, 물어볼 땐 끝이 쭉 올라가고, 신나면 빨라지고 높아지고, 슬프면 느리고 낮아져요.")
    w("- **일본어 같지 않아요.** 예전 소리는 '바·디·부·다'처럼 받침 없는 소리만 이어져서 일본어처럼 들렸어요. "
      "눈꽃말 낱말은 거의 다 받침·겹소리·동글 모음 중 하나를 꼭 갖고 있어요 (프로그램이 검사해요).")
    st = P.stats([x["roman"] for x in lex["words"]])
    w(f"  - 전체 낱말 {len(lex['words'])}개의 소리 마디 중 **받침 있는 마디 {st['closed'] * 100:.0f}%**, "
      f"**겹소리 {st['cluster'] * 100:.0f}%**, **동글·애 모음 {st['nonJaVowel'] * 100:.0f}%** (예전 수다 소리는 셋 다 0%).")
    w("- **미니언즈처럼 귀엽지만, 미니언즈 말은 하나도 안 빌렸어요.** (bello, banana, poopaye 같은 말이나 심즈 말은 쓰지 않아요 — 프로그램이 검사해요.)")
    w("")
    w("## 2. 쉬운 문법 세 가지")
    w("")
    w("1. **두 번 말하면 여럿이 돼요.** 뮈(나) → **뮈뮈**(우리), 뉘(눈 한 송이) → **뉘뉘**(눈), 손을 두 번 흔들면 → **뿔룽뿔룽**(잘 가).")
    w("2. **끝말로 기분을 알려요.** 문장 끝에 **녹?** 을 붙이면 질문, **얍!** 을 붙이면 신나는 말, **뇽** 은 보통 말 끝이에요.")
    w("   - 퓌뽈 뭄 **녹?** = 생선 먹을래?  /  블룸 **얍!** = 좋아!  /  뉘뉘 봄봄 **뇽.** = 눈이 많이 와요.")
    w("3. **'뿔'은 '아주'예요.** 뿔 블룸 = 아주 좋아, 뿔 브르르 = 너무 추워.")
    w("")
    w("## 3. 예문")
    w("")
    w("| 눈꽃말 | 뜻 |")
    w("|---|---|")
    for a, b in EXAMPLES:
        w(f"| **{a}** | {b} |")
    w("")
    w(f"## 4. 낱말 ({len(lex['words'])}개)")
    w("")
    w(f"'누가 말해요'는 그 낱말을 녹음한 목소리예요. **모두**({nvoice}명 다)가 말하는 낱말은 게임 말풍선에 그 뜻의 한국어가 나오면 꼭 들려요 "
      "(예: 말풍선에 '고마워'가 있으면 **꼬맙뿌**). 나머지는 몇몇 주민만 녹음했거나, 사전에만 있는 낱말이에요.")
    w("")
    by = {}
    for x in lex["words"]:
        by.setdefault(x["cat"], []).append(x)
    for cat, title in CATS:
        if cat not in by:
            continue
        w(f"### {title}")
        w("")
        w("| 눈꽃말 | 읽기 (로마자) | 뜻 | 한마디 | 누가 말해요 |")
        w("|---|---|---|---|---|")
        for x in by[cat]:
            ws = who.get(x["id"], [])
            say = "모두" if len(ws) == nvoice else (", ".join(ws) if ws else "사전에만")
            w(f"| **{x['hangul']}** | {x['roman'].replace('.', '-')} | {x['ko']} | {x.get('note', '')} | {say} |")
        w("")
    w("## 5. 감정 소리 (목소리마다 10가지)")
    w("")
    w("말풍선의 기분에 맞으면 말 앞이나 뒤에 한 번 들려요. 인사·놀람·앗·투덜은 **앞에**, 웃음·고마워·냠냠·신남·슬픔·질문은 **뒤에** 나와요.")
    w("")
    head = "| 목소리 | " + " | ".join(VV.EMOTE_KO[e].split(" ")[0] for e in VV.EMOTES) + " |"
    w(head)
    w("|" + "---|" * (len(VV.EMOTES) + 1))
    for t, v in VV.VOICES.items():
        w(f"| {v['ko']} | " + " | ".join(VV.emote_say(t, e) for e in VV.EMOTES) + " |")
    w("")
    w("## 6. 목소리 10명")
    w("")
    w("| 목소리 | 이런 소리 | 기본 높이 | 빠르기 | 이 목소리를 쓰는 주민 (예) |")
    w("|---|---|---|---|---|")
    users = {
        "kid_boy": "꼬마 도윤, 장난꾸러기 준, 짐꾼 다람", "kid_girl": "꼬마 하린, 소녀 서아, 스케이트 소녀",
        "adult_m": "청년 태오, 상인, 음유시인, 우체부, 점원 민호", "adult_f": "빵집 아주머니, 대장장이 언니, 의사 선생님",
        "elder_m": "할아버지, 선장 바다, 바다 할아버지", "elder_f": "할머니", "chief": "촌장님 (플레이어)",
        "big_gruff": "아저씨, 짐꾼 곰돌, 요리사 쿡, 경비대장, 곰 아저씨 장쇠", "sweet": "약초꾼, 멋쟁이, 점원 미소, 화가",
        "squeaky": "아기 콩콩",
    }
    for t, v in VV.VOICES.items():
        w(f"| **{v['ko']}** | {v['desc']} | {v['f0']} Hz | ×{v['speed']} | {users.get(t, '')} |")
    w("")
    w("같은 목소리를 쓰는 주민도 한 명 한 명 높이가 조금씩 달라요 (주민마다 정해진 버릇). 읍내 사람들은 나이(어린이·어른·어르신)에 맞는 목소리를 골라 써요.")
    w("")
    w("## 7. 게임에서는 이렇게 들려요")
    w("")
    w("- 말풍선이 뜨면 그 주민 목소리로 눈꽃말이 재잘재잘 (글이 길면 조금 더 길게, 그래도 3초를 넘지 않아요).")
    w("- **같은 문장은 늘 같은 눈꽃말**로 들려요 — 주민의 말버릇처럼.")
    w("- 말풍선에 아는 말이 있으면 그 눈꽃말이 들려요: 촌장 → 촌촌님, 생선 → 퓌뽈, 빵 → 브랑, 고마워 → 꼬맙뿌, 추워 → 브르르 …")
    w("- `?` 로 끝나면 끝이 올라가고(녹? / 응?), `!` 면 신나게, `ㅠㅠ` 면 느리고 낮게, `ㅋㅋ` 면 웃음이 붙어요.")
    w("- 여러 명이 한꺼번에 말해도 **2명까지만** 소리가 나요. 멀리 있는 주민은 작게, 화면 밖이면 조용히. 중요한 효과음이 나면 잠깐 작아져요.")
    w("- 설정에서 목소리 크기를 따로 조절할 수 있게 만들어 두었어요.")
    w("")
    w("## 8. 들어 보기")
    w("")
    w("- **데모:** `docs/previews/voice_demo.mp3` (약 1분 — 10명의 인사 → 눈 오는 날 수다 장면). 무슨 말을 하는지는 `docs/previews/voice_demo.txt`.")
    w("- **미리듣기 페이지:** 게임 폴더에서 `node tools/test/serve.mjs 8000` 실행 → 브라우저에서 "
      "`http://localhost:8000/docs/previews/voice_preview.html`. 한국어 문장을 쓰고 목소리를 골라 **말하기**를 누르면 눈꽃말로 들려줘요.")
    w("")
    w("## 9. 새 낱말을 만들고 싶을 때")
    w("")
    w("1. `tools/voice/lexicon.json`에 한 줄 추가 (한글, 로마자, 뜻, 말풍선에서 찾을 한국어 `kw`).")
    w("2. 규칙: 받침(ㅁ·ㅇ·ㄹ·ㅂ·ㄱ)이나 겹소리(블·프르…)나 동글 모음(뉘·뵈·애) 중 하나는 꼭 넣기. 다른 작품의 말 따라 하지 않기.")
    w("3. 목소리에 넣으려면 `tools/voice/voices.py`의 낱말 목록에 이름을 넣고 `python3 tools/voice/build_voice.py` (약 1분).")
    w("")
    with open(DST, "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")
    print(f"wrote {os.path.relpath(DST, ROOT)} ({len(lex['words'])} words)")


if __name__ == "__main__":
    main()
