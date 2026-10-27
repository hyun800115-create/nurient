#!/usr/bin/env python3
"""Write docs/store/크롬클로드_2단계_스토어등록정보.md from the texts in listing_ko.md / listing_en.md.

    python3 frost-village/docs/store/tools/make_handoff.py

The hand-off is a Korean prompt the designer pastes into his Claude-in-Chrome assistant. The store texts are copied in
verbatim, so after editing a listing run this again (and count_texts.py) instead of editing the hand-off by hand.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
STORE = os.path.abspath(os.path.join(HERE, '..'))
sys.path.insert(0, HERE)
from count_texts import blocks  # noqa: E402

OUT = os.path.join(STORE, '크롬클로드_2단계_스토어등록정보.md')


def pick(path, *words):
    for head, body in blocks(path):
        if any(w in (head or '') for w in words):
            return body
    raise SystemExit('missing %s in %s' % (words, path))


def main():
    ko = os.path.join(STORE, 'listing_ko.md')
    en = os.path.join(STORE, 'listing_en.md')
    t = {
        'NAME': pick(ko, '앱 이름'), 'SHORT': pick(ko, '간단한 설명'), 'FULL': pick(ko, '자세한 설명'),
        'EN_NAME': pick(en, 'App name'), 'EN_SHORT': pick(en, 'Short description'),
        'EN_FULL': pick(en, 'Full description'),
    }
    for k in list(t):
        t[k + '_N'] = str(len(t[k]))
    text = TEMPLATE
    for k, v in sorted(t.items(), key=lambda kv: -len(kv[0])):
        text = text.replace('{%s}' % k, v)
    if '~~~' in ''.join(t[k] for k in ('NAME', 'SHORT', 'FULL', 'EN_NAME', 'EN_SHORT', 'EN_FULL')):
        raise SystemExit('a store text contains ~~~ (the prompt fence)')
    open(OUT, 'w', encoding='utf-8').write(text)
    print('wrote', os.path.relpath(OUT, os.getcwd()))
    for k in ('NAME', 'SHORT', 'FULL', 'EN_NAME', 'EN_SHORT', 'EN_FULL'):
        print('  %-8s %5s' % (k, t[k + '_N']))


TEMPLATE = r'''# 크롬 Claude 2단계 — 스토어 등록정보 채우기

크롬에 설치한 **Claude 확장 프로그램**(크롬 Claude)에게 붙여 넣는 부탁 글이에요. 크롬 Claude가 Play Console 화면에서
글을 채우고 카테고리를 고르고, **그림 파일을 고를 차례가 되면 디자이너님께 알려 줘요.** 파일 고르기 창은 크롬
Claude가 열 수 없어서, 그 부분만 디자이너님이 직접 해요.

> 이 문서는 `docs/store/tools/make_handoff.py`가 `listing_ko.md` / `listing_en.md`에서 글을 그대로 옮겨 만들었어요.
> 글을 바꿀 때는 listing 파일을 고치고 이 도구를 다시 돌려요(손으로 고치면 두 곳이 달라질 수 있어요).

## 시작하기 전에 (디자이너님)

1. **1단계(앱 만들기)가 끝나 있어야 해요.** Play Console의 「모든 앱」에 `행복한 눈꽃마을 이야기`가 보이면 돼요.
   아직이면 `플레이스토어_등록안내.md` 2단계대로 먼저 만들어 주세요(선언 체크가 있어서 디자이너님이 직접 해요).
2. 크롬에서 **Play Console에 로그인**해 두세요(play.google.com/console). 크롬 Claude는 비밀번호를 넣지 않아요.
3. 그림 파일을 컴퓨터에 준비해 두세요: 저장소의 `frost-village/docs/store/upload_bundle/` 폴더 (또는 그 안의
   `snowbloom_store_upload.zip`을 풀어 둔 폴더). 파일 이름 앞 번호가 올리는 순서예요.

   | 순서 | 파일 | Play Console 칸 |
   |---|---|---|
   | 1 | `1_app_icon_512.png` | 앱 아이콘 |
   | 2 | `2_feature_graphic_1024x500.png` | 그래픽 이미지 |
   | 3 | `3_phone_screenshot_01.jpg` … `3_phone_screenshot_08.jpg` (8장) | 휴대전화 스크린샷 |

4. 아래 부탁 글의 **연락처 이메일** 줄(`＿＿＿＿`)에 스토어에 공개될 이메일을 직접 적은 뒤 붙여 넣으세요.
   비워 두면 크롬 Claude가 이메일 칸은 건드리지 않고 물어봐요.
5. 아래 상자(`~~~` 사이) 안의 글을 **전부** 복사해서 크롬 Claude에게 붙여 넣으세요.

## 크롬 Claude에게 붙여 넣을 글

~~~text
지금 열려 있는 크롬의 Google Play Console에서, 내 게임 「행복한 눈꽃마을 이야기」의 스토어 등록정보를 같이 채워 줘.
아래 [지켜야 할 것]을 먼저 읽고, [순서]대로 하나씩 해 줘. 화면 문구가 조금 달라도 같은 뜻의 메뉴를 찾으면 돼.
모르겠거나 화면이 설명과 다르면 추측하지 말고 멈춰서 나에게 물어봐.

[지켜야 할 것]
1. 절대 누르지 마: 「검토를 위해 보내기」, 「검토를 위해 변경사항 보내기」, 「변경사항 게시」, 「출시」, 「출시 시작」,
   「프로덕션으로 출시」, 「게시」, 「앱 삭제」, 「보관처리」. 「게시 개요」 화면에서도 아무것도 보내지 마.
   내가 나중에 직접 할 거야. 네가 누를 수 있는 저장 버튼은 「저장」(임시 저장)뿐이야.
2. 이런 화면이 나오면 바로 멈추고 나에게 말해: 비밀번호·로그인·2단계 인증, 결제·결제 프로필·카드, 신원 확인
   (신분증·주소 확인), 약관·정책·법적 선언에 동의하는 체크나 버튼. 그런 칸은 내가 직접 해.
3. 아래에 적힌 칸만 고쳐. 다른 앱, 다른 메뉴(앱 무결성, 앱 서명, 테스트, 출시, 앱 콘텐츠, 가격, 국가)는 건드리지 마.
4. 글은 아래 [ ... 시작] 줄과 [ ... 끝] 줄 사이의 내용을 한 글자도 바꾸지 말고 그대로 넣어 줘. 줄바꿈도 그대로,
   맨 앞뒤 공백 없이. 칸에 이미 다른 글이 있으면 지우고 새로 넣어.
5. 파일을 고르는 창(업로드 창)은 네가 다룰 수 없어. 그림 칸에 오면 나에게 어떤 파일을 고를지 말해 주고,
   내가 「골랐어」라고 할 때까지 기다려. 내가 고른 뒤에는 미리보기가 맞게 들어갔는지 확인해 줘.

[순서]
1) 왼쪽 메뉴에서 「모든 앱」 → 「행복한 눈꽃마을 이야기」를 열어. 목록에 이 앱이 없으면 멈추고 말해 줘.
2) 왼쪽 메뉴 「성장」(또는 「사용자 늘리기」) → 「스토어 등록정보」(또는 「스토어 노출」) → 「기본 스토어 등록정보」로 가.
   (「스토어 등록정보」 목록이 먼저 나오면 기본(Default) 등록정보를 열어.)
3) 「앱 세부정보」의 세 칸을 채워.
   - 앱 이름 칸:
[앱 이름 시작]
{NAME}
[앱 이름 끝]
   - 간단한 설명 칸:
[간단한 설명 시작]
{SHORT}
[간단한 설명 끝]
   - 자세한 설명 칸:
[자세한 설명 시작]
{FULL}
[자세한 설명 끝]
   다 넣은 뒤 각 칸 아래 글자 수가 앱 이름 {NAME_N}/30, 간단한 설명 {SHORT_N}/80, 자세한 설명 {FULL_N}/4000 인지 확인해 줘.
   숫자가 다르면 어디가 다른지 찾아서 고쳐 줘(줄바꿈이 빠지거나 두 번 들어간 경우가 많아).
4) 「그래픽」 부분으로 내려가. 순서대로 하나씩:
   a. 「앱 아이콘」: 나에게 "앱 아이콘 칸의 업로드(추가) 버튼을 눌러 1_app_icon_512.png 를 골라 주세요"라고 말하고 기다려.
      내가 고른 뒤 512 x 512 아이콘(유리 스노볼 안의 작은 눈마을 그림)이 보이는지 확인해 줘.
   b. 「그래픽 이미지」: "그래픽 이미지 칸에서 2_feature_graphic_1024x500.png 를 골라 주세요"라고 말하고 기다려.
      바다와 마을 전경 위에 「행복한 눈꽃마을 이야기」 로고가 있는 가로 그림이 보이는지 확인해 줘.
   c. 「휴대전화 스크린샷」: "휴대전화 스크린샷 칸에서 3_phone_screenshot_01.jpg 부터 08.jpg 까지 8장을 골라 주세요
      (한꺼번에 골라도 돼요)"라고 말하고 기다려. 올라간 뒤 순서가 01 → 08 인지 확인해 줘. 맨 위 설명 글로 순서를 볼 수 있어:
      01 내가 만든 작은 마을 / 02 이웃 마을도 오늘은 느긋하게 / 03 기차가 두 마을을 이어 줘요 / 04 모두 모여 따뜻한 한 끼 /
      05 반짝이는 바다, 돌아오는 고깃배 / 06 가만히 지켜보기만 해도 좋아요 / 07 마을이 자라면 다 함께 축하해요 /
      08 해가 지면 창마다 불이 켜져요.
      순서가 다르면 끌어서 맞춰 줘. 예전 스크린샷이 남아 있으면 나에게 지워도 되는지 먼저 물어봐.
   d. 태블릿 스크린샷, 동영상(YouTube 주소) 칸은 비워 둬.
5) 페이지 아래의 「저장」을 눌러. 오류나 경고(빨간 글씨)가 나오면 그대로 읽어 줘.
6) 왼쪽 메뉴 「성장」 → 「스토어 등록정보」 → 「스토어 설정」(또는 「사용자 늘리기」 → 「스토어 노출」 → 「스토어 설정」)으로 가.
   - 앱 카테고리: 앱 또는 게임 = 「게임」, 카테고리 = 「시뮬레이션」.
   - 태그: 지금은 건너뛰어(내가 나중에 고를게).
   - 스토어 등록정보 연락처 세부정보 → 이메일 주소:
[연락처 이메일 시작]
＿＿＿＿
[연락처 이메일 끝]
     (위 줄이 ＿＿＿＿ 그대로이거나 비어 있거나 {{ }}가 남아 있으면 이메일 칸은 건드리지 말고 나에게 물어봐.)
   - 전화번호, 웹사이트: 비워 둬.
   - 외부 마케팅 같은 다른 체크는 지금 상태 그대로 둬.
   - 「저장」을 눌러.
7) 끝나면 나에게 정리해 줘: 채운 칸과 글자 수, 올라간 그림(아이콘 1, 그래픽 이미지 1, 스크린샷 몇 장), 카테고리,
   이메일을 넣었는지, 저장이 됐는지, 남은 경고. 「게시 개요」에 무엇이 쌓였는지 보이면 읽어만 주고 아무것도 보내지 마.
~~~

## (선택) 영어 번역도 넣기

기본 등록정보를 저장한 뒤, 영어 화면도 넣고 싶으면 이 글을 이어서 붙여 넣으세요. 영어 그림은 `upload_bundle`에 없고
`frost-village/docs/store/assets/`에 있어요: 그래픽 이미지 `feature_graphic_en.png`(영어 로고),
스크린샷 `screenshots_caption_en/01_village.jpg` … `08_evening.jpg`(영어 설명 띠). 아이콘은 한국어와 같아요.

~~~text
이어서 영어 번역을 넣어 줘. [지켜야 할 것]은 위와 똑같아(보내기·출시·게시 금지, 파일 고르기는 내가, 약관·결제·비밀번호 화면에서 멈춤).
1) 「기본 스토어 등록정보」 화면의 「번역 관리」(또는 「번역 관리 → 번역 직접 추가」)에서 「영어(미국) – en-US」를 추가해.
   자동 번역(구매·유료 번역)을 고르라는 화면이 나오면 고르지 말고 멈춰.
2) 영어(미국) 탭에서:
   - App name:
[App name 시작]
{EN_NAME}
[App name 끝]
   - Short description:
[Short description 시작]
{EN_SHORT}
[Short description 끝]
   - Full description:
[Full description 시작]
{EN_FULL}
[Full description 끝]
   글자 수가 {EN_NAME_N}/30, {EN_SHORT_N}/80, {EN_FULL_N}/4000 인지 확인해 줘.
3) 그래픽 이미지는 나에게 "assets 폴더의 feature_graphic_en.png 를 골라 주세요", 휴대전화 스크린샷은
   "screenshots_caption_en 폴더의 01_village.jpg 부터 08_evening.jpg 까지 8장을 골라 주세요"라고 말하고 기다려.
   (영어 탭에 그림을 따로 올리지 않으면 한국어 그림이 그대로 보여. 내가 「건너뛰어」라고 하면 건너뛰어.)
4) 「저장」을 누르고 결과를 정리해 줘. 보내기·출시는 누르지 마.
~~~

## 끝나면 (디자이너님)

- 크롬 Claude가 정리해 준 내용을 확인하고, 이상한 곳이 있으면 화면을 캡처해서 Claude(이 작업 공간)에게 보내 주세요.
- **「검토를 위해 보내기」는 아직 누르지 마세요.** 앱 콘텐츠(3단계), 개인정보처리방침 주소, 첫 AAB 업로드가 끝난 뒤
  비공개 테스트를 시작할 때 한꺼번에 보내요 → `플레이스토어_등록안내.md`.
- 다음: `크롬클로드_3단계_앱콘텐츠.md`
'''

if __name__ == '__main__':
    main()
