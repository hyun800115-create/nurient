# Roadmap patch: money flow, weekly report, neighbourhood shops, care (2026-11-07)

Exact text changes for the two roadmap docs, to apply **after** the 대표 approves `기획서_돈과복지.md` (designer questions 25–41) and `engineering_addendum.md`. Nothing here has been applied; the repo is untouched.

**How to apply**
- Apply the edits in the order listed, section A to `docs/기획서_시장취임_로드맵.md` and section B to `docs/roadmap_mayor/engineering_roadmap.md`.
- Each `old` block is copied from the file at HEAD `96bbe89` and occurs exactly once at the moment it is applied; `new` replaces it. Insertions are written as an anchor `old` that is repeated at the top of `new`.
- Checked by `crit/check_patch.py` (applies every edit to in-memory copies and fails on any missing or repeated anchor).
- With the edits, copy the two finals into the repo: `기획서_돈과복지.md` → `docs/기획서_돈과복지.md`, `engineering_addendum.md` → `docs/roadmap_mayor/econ_welfare_addendum.md` (the new text below refers to those paths).
- If the 대표 picks a non-★ answer, the affected numbers change: question 26 B makes v4.5 44–51; question 28 B keeps 탈것 v5.2 / 안심 v5.3 and puts 돌봄 마을 at v5.4 (drop the renumbering edits); question 29 B moves F20 into v5.1 (31–41) and v5.2 to ≈ 18–21.

---

## A. `docs/기획서_시장취임_로드맵.md`

### K1 · v4.3 「예전 계획에서 바뀌는 것」: 자리표 (질문 25)
````old
  - 테스터가 직접 켜는 "놀이 기록" 첫판을 넣어요 (늦어지면 v4.4로).
````
````new
  - 테스터가 직접 켜는 "놀이 기록" 첫판을 넣어요 (늦어지면 v4.4로).
  - **자리표 (11월 7일 새 부탁, 질문 25):** 학교 자리는 가장 큰 자리로, 진료소 자리는 큰 자리로 키우고, 마을회관이 떠나며 비는 서쪽 큰 자리는 공공 건물 자리로 (보이지 않게) 남겨 둬요. 둘째 걸음 안에서 해요 (반나절쯤).
````

### K2 · 버전 번호 표
````old
| v4.5 | 주민의 부탁 (공개 출시) | 읍장 | 50–80 + 매일 | 34–40 |
| v4.6 | 읍내 장날 | 읍장 | 60–100 | 33–38 |
| 시험판 | 시장 시험판 | 확인용 | — | 10–13 |
| v5.0 | 시장 취임 | 시장 | 100–150 | 34–40 |
| v5.1 | 주민의 일생 | 시장 | 105–150 | 20–28 |
| v5.2 | 탈것의 시대 | 시장 | 115–150 | 18–24 |
| v5.3 | 안심 마을 | 시장 | 110–150 | 14–18 |
````
````new
| v4.5 | 주민의 부탁 (공개 출시) | 읍장 | 50–80 + 매일 | 39–46 |
| v4.6 | 읍내 장날 | 읍장 | 60–100 | 38–45 |
| 시험판 | 시장 시험판 | 확인용 | — | 11–14 |
| v5.0 | 시장 취임 | 시장 | 100–150 | 39–46 |
| v5.1 | 주민의 일생 | 시장 | 105–150 | 21–29 |
| v5.2 | 돌봄 마을 | 시장 | 130–180 | 29–34 |
| v5.3 | 탈것의 시대 | 시장 | 115–150 | 18–24 |
| v5.4 | 안심 마을 | 시장 | 110–150 | 14–18 |
````

### K3 · 번호를 고른 까닭
````old
v5는 한 번에 만들기엔 너무 커서 v5.0–v5.3 네 칸으로 나눴어요 (질문 24).
````
````new
v5는 한 번에 만들기엔 너무 커서 v5.0–v5.3 네 칸으로 나눴어요 (질문 24). 11월 7일 새 부탁으로 「돌봄 마을」을 v5.2에 넣어서 다섯 칸 (v5.0–v5.4)이 됐어요. 탈것의 시대는 v5.3, 안심 마을은 v5.4예요 (질문 28).
````

### K4 · 모두 합치면
````old
- **모두 합치면:** 공개 출시판(v4.5)까지 95–111일, 시장 취임(v5.0)까지 172–202일, 안심 마을(v5.3)까지 224–272일, v8까지 299–375일이에요. 출시 전 테스트 기간 3–5주는 따로예요.
````
````new
- **모두 합치면:** 공개 출시판(v4.5)까지 100–117일, 시장 취임(v5.0)까지 188–222일, 안심 마을(v5.4)까지 270–327일, v8까지 345–430일이에요. 출시 전 테스트 기간 3–5주는 따로예요. 11월 7일 새 부탁 네 가지 (돈의 흐름, 주간 보고서, 동네 가게, 돌봄 마을)로 46–55일 늘었어요 (`docs/기획서_돈과복지.md`).
````

### K5 · v4.5 새로 하는 것: 은행장 편지 번호 + 코인 카드
````old
  - 서리 은행장 편지 「곧 저금과 대출 창구도 열 예정이에요」를 「저금과 대출 창구는 서리시가 된 뒤에 열 거예요」로 바꿔요. 저금은 v5.2에 오기 때문이에요.
````
````new
  - 서리 은행장 편지 「곧 저금과 대출 창구도 열 예정이에요」를 「저금과 대출 창구는 서리시가 된 뒤에 열 거예요」로 바꿔요. 저금은 v5.3에 오기 때문이에요.
  - **코인 카드 「오늘의 돈」 (11월 7일 새 부탁):** 위쪽 코인을 누르면 오늘 번 돈, 쓴 돈, 가게 금고에서 기다리는 돈이 보이는 작은 카드가 떠요 (보기만 해요). 읍장이 되면 [이번 주] 칸도 생겨요. 돈은 처음 생길 때 한 번만 세는 장치로 바르게 세고, 사무실 통장 막대도 이 숫자로 고쳐요.
````

### K6 · v4.5 읍 전에도 일부러 바뀌는 것
````old
  - **읍 전에도 일부러 바뀌는 것:** 출석은 첫날부터, 쉬는 동안 번 돈은 마을이 완성된 뒤부터, 그리고 1–5장 퀘스트예요.
````
````new
  - **읍 전에도 일부러 바뀌는 것:** 출석은 첫날부터, 쉬는 동안 번 돈은 마을이 완성된 뒤부터, 그리고 1–5장 퀘스트와 보기만 하는 코인 카드 「오늘의 돈」 (처음 안내가 끝난 뒤)이에요.
````

### K7 · v4.5 대략 개발 기간
````old
- **대략 개발 기간:** 34–40일. 늦어지면 청혼 장면을 v4.6으로 넘겨요.
````
````new
- **대략 개발 기간:** 39–46일 (돈 바르게 세기와 코인 카드로 5–6일 늘었어요). 늦어지면 청혼 장면을 v4.6으로 넘겨요.
````

### K8 · v4.5 검토 때 봐 주실 것
````old
- **검토 때 봐 주실 것:** 필요 4가지 이름, 하루 부탁 개수 (3개와 5개를 테스터에게 비교), 함께하기 보상, 청혼 장면 문장, 1–5장 퀘스트 목록.
````
````new
- **검토 때 봐 주실 것:** 필요 4가지 이름, 하루 부탁 개수 (3개와 5개를 테스터에게 비교), 함께하기 보상, 청혼 장면 문장, 1–5장 퀘스트 목록, 코인 카드 문장.
````

### K9 · v4.6 새로 하는 것: 돈의 흐름, 주간 보고서, 먼 집 배달
````old
  - 이번 주 목표 1개, 명성 칭호 (믿음직한 촌장 → 존경받는 촌장 …). 칭호는 주민이 부르는 이름이라 '촌장'을 그대로 써요.
````
````new
  - 이번 주 목표 1개, 명성 칭호 (믿음직한 촌장 → 존경받는 촌장 …). 칭호는 주민이 부르는 이름이라 '촌장'을 그대로 써요.
  - **돈의 흐름과 주간 보고서 (11월 7일 새 부탁):** 코인을 누르면 큰 「돈의 흐름」 화면이 열려요 (돈이 도는 동그라미, 이번 주 막대, 버튼이 달린 도움말). 셈이가 게임 속 한 주마다 한 장짜리 보고서를 가져와요: 번 돈·쓴 돈·새 이웃, 이번 주 잘한 일, 버튼이 달린 「다음 주에 해 볼까요?」. 보고서에서 다음 주 목표를 골라요. 첫 보고서는 봇 약 110분, 맛보기 보고서는 약 70분이에요.
  - **먼 집 배달:** 남쪽 들판·동남쪽처럼 광장에서 먼 집에서 금방 마켓 주문이 더 자주 와요. 보고서에 「먼 집 배달 n번」이 적혀요. 동네 가게 (v5.2) 전의 첫 답이에요.
````

### K10 · v4.6 도시 막대 (번호)
````old
버스는 v5.2에 오기 때문이에요.
````
````new
버스는 v5.3에 오기 때문이에요.
````

### K11 · v4.6 대략 개발 기간
````old
- **대략 개발 기간:** 33–38일. 늦어지면 새 손님과 금방 개썰매·새벽배송을 v4.6.1로 넘겨요 (9–10일 줄어요).
````
````new
- **대략 개발 기간:** 38–45일 (큰 돈의 흐름 화면, 주간 보고서, 먼 집 배달로 5–7일 늘었어요). 늦어지면 새 손님과 금방 개썰매·새벽배송을 v4.6.1로 넘겨요 (9–10일 줄어요). 주간 보고서도 v4.6.1로 넘길 수 있어요 (3일쯤 줄어요).
````

### K12 · v4.6 검토 때 봐 주실 것
````old
시청 공사 장면.
````
````new
시청 공사 장면, 주간 보고서 화면과 셈이 말투.
````

### K13 · v5.0 새로 하는 것: 마을 곳간, 건강 체크, 일자리
````old
  - 이사 온 이웃도 한 집씩 카드가 생겨요.
````
````new
  - 이사 온 이웃도 한 집씩 카드가 생겨요.
  - **마을 곳간 (11월 7일 새 부탁):** 취임식 선물이에요. 세금 날의 세금과 솔방울 가게 월세가 알아서 모이고, 진료소·학교의 유지비와 월급이 알아서 나가요. 곳간이 가득 차면 세금 날마다 남는 돈을 지갑으로 보내요. 공공 건물은 곳간에서 먼저 내요. 모자라도 문을 닫지 않고 「아껴 쓰는 중」이 돼요. 유지비는 이 게임에 처음 생기는 "매일 나가는 돈"이에요. 시청 24,000코인은 지갑에서 내요.
  - **진료소 건강 체크 (튼튼 수첩 1단계):** 한 주 마지막 날 아침, 진료소 앞에서 건강 체크를 받아요. 주민 카드에 「튼튼」 스티커가 붙고, 내려가는 일은 없어요.
  - 진료소·학교에서 일하는 주민과 월급이 생겨요.
````

### K14 · v5.0 대략 시간
````old
v5.1–v5.3이 같은 구간을 더 채워요.
````
````new
v5.1–v5.4가 같은 구간을 더 채워요.
````

### K15 · v5.0 예전 계획에서 바뀌는 것 (아스팔트, 취임식 선물)
````old
  - 아스팔트와 버스는 v5.2로 가요. 취임식 선물은 시장 호칭, 시청 간판, 새 시설 자리예요.
````
````new
  - 아스팔트와 버스는 v5.3으로 가요. 취임식 선물은 시장 호칭, 시청 간판, 새 시설 자리, 마을 곳간이에요.
````

### K16 · v5.0 대략 개발 기간
````old
- **대략 개발 기간:** 34–40일. 시장 시험판 결과를 보고 범위를 다시 정하고, 계획 검토 때 날 수를 하나하나 다시 재요.
````
````new
- **대략 개발 기간:** 39–46일 (마을 곳간, 건강 체크, 일자리와 월급으로 5–6일 늘었어요). 시장 시험판 결과를 보고 범위를 다시 정하고, 계획 검토 때 날 수를 하나하나 다시 재요.
````

### K17 · v5.0 검토 때 봐 주실 것
````old
- **검토 때 봐 주실 것:** 시험판 결과, 세율을 둘지, 시청과 결혼식 장면, 저장이 바뀌는 것.
````
````new
- **검토 때 봐 주실 것:** 시험판 결과, 세율을 둘지, 시청과 결혼식 장면, 저장이 바뀌는 것, 곳간 유지비 숫자.
````

### K18 · v5.1 새로 하는 것: 보고서의 이사 간 주민
````old
  - 상태 카드에 가족, 나이, 관계, 오늘 일정이 더해져요.
````
````new
  - 상태 카드에 가족, 나이, 관계, 오늘 일정이 더해져요.
  - **보고서에 이사 간 주민과 생애 소식 (11월 7일 새 부탁):** 결혼·아기·첫 등교 소식이 들어가요. 이사는 결혼·가족·꿈 같은 따뜻한 까닭으로만 아주 가끔 해요. 기분이 나빠서 떠나는 일은 없어요. 떠난 주민은 편지를 보내고, 살던 집에는 곧 새 이웃이 와요.
````

### K19 · v5.1 대략 개발 기간
````old
- **대략 개발 기간:** 20–28일 (대략이에요. 계획 검토 때 다시 재요).
````
````new
- **대략 개발 기간:** 21–29일 (대략이에요. 계획 검토 때 다시 재요).
````

### K20 · 새 버전 v5.2 「돌봄 마을」 넣기 + 탈것의 시대 번호
````old
### v5.2 「탈것의 시대」 (시장 3)
````
````new
### v5.2 「돌봄 마을」 (시장 3)
- **새로 하는 것 (11월 7일 새 부탁):**
  - **동네 가게:** 가게에서 걸어서 먼 집이 3채 이상 모이면 카드가 와요. 자리 2–3곳 가운데 대표님이 골라요. 1단은 먹거리 (생선·고기·빵), 2단은 생활용품 (통조림·연장)이에요. 집 가까이에 동네 가게가 있으면 그 집 주민이 하루에 한 번 더 장을 보러 와서 새로 벌어요. 광장 손님은 그대로예요. 처음 2곳, 인구 140명이면 3곳, 180명이면 4곳, 220명이면 5곳까지예요.
  - **돌봄 시설:** 아장아장 어린이집 (2단은 눈꽃 유치원), 햇살 쉼터, 돌봄 선생님 (어르신 댁을 찾아가요). 늦으면 v5.2.1로: 햇살 실버타워 (쉼터 2단), 튼튼 돌봄 병원 (진료소 2단).
  - **튼튼 수첩 2단계:** 아침 체조, 돌봄 선생님 방문, 가끔 오는 「건강 주간」 카드.
  - 보육·유치원·쉼터 선생님, 돌봄 선생님, 쉼터 요리사 일자리가 생겨요. 월급은 마을 곳간에서 나가요.
  - 카드는 쓸 사람이 생길 때 와요: 첫 아기가 태어나면 어린이집, 어르신이 여러 분 되면 쉼터.
- **느끼는 재미:** 내가 거둔 세금으로 아기부터 어르신까지 돌보는 따뜻함, 먼 동네까지 골고루 살기 좋아지는 뿌듯함이에요.
- **대략 시간:** 봇 130–180분.
- **이미 만들어 둔 것 중 쓰는 것:** 이야기 엔진의 나이·가족·일자리, 지금 잡화점 그림, 진료소와 아파트 그림, 집과 놀이터 소품, 솔방울 마을 사람 그림.
- **예전 계획에서 바뀌는 것:** 11월 7일 새 부탁으로 생긴 버전이에요. 새 필요는 만들지 않고, v5.0의 건강·배움을 아기·어린이·어르신에게도 채워요. 동네 가게는 이야기 엔진 없이도 돌아가요. 탈것의 시대와 안심 마을이 한 칸씩 밀려요 (질문 28).
- **완성 기준:** 돌봄 시설로 아기·어르신의 건강과 배움을 채울 수 있어요. 곳간이 모자라도 아무것도 닫히지 않아요. 업데이트하자마자 행복이 내려가지 않아요. 동네 가게가 생겨도 광장 진열대가 더 자주 비지 않아요. 싼 폰도 버벅이지 않아요.
- **대략 개발 기간:** 29–34일 (대략이에요). 늦어지면 실버타워·돌봄 병원·건강 주간을 v5.2.1로 넘겨요 (3일쯤 줄어요).
- **검토 때 봐 주실 것:** 시설 이름과 말투, 튼튼 수첩 스티커, 유지비 숫자, 동네 가게와 어린이집 자리.

### v5.3 「탈것의 시대」 (시장 4)
````

### K21 · 안심 마을 번호
````old
### v5.3 「안심 마을」 (시장 4)
````
````new
### v5.4 「안심 마을」 (시장 5)
````

### K22 · 안심 마을: 보고서의 작은 사건 칸
````old
  - 「찾습니다」 포스터를 방범 초소 게시판에 붙이면 주민이 제보하고 명성이 올라요.
````
````new
  - 「찾습니다」 포스터를 방범 초소 게시판에 붙이면 주민이 제보하고 명성이 올라요.
  - 주간 보고서에 작은 사건 칸이 생겨요 (「사건·사고 끄기」를 켜면 안 나와요).
````

### K23 · 안심 마을: 경찰차 번호 (쓰는 것)
````old
경찰 그림, v5.2의 경찰차.
````
````new
경찰 그림, v5.3의 경찰차.
````

### K24 · 안심 마을: 경찰차 번호 (바뀌는 것)
````old
사건 장면에 경찰차 그림이 필요해서 탈것 (v5.2) 뒤에 둬요.
````
````new
사건 장면에 경찰차 그림이 필요해서 탈것 (v5.3) 뒤에 둬요.
````

### K25 · v6–v8 표 (번호)
````old
작은 사건은 v5.3으로 먼저 갔어요 |
````
````new
작은 사건은 v5.4로 먼저 갔어요 |
````

### K26 · 주민 누르기 표 (번호)
````old
소원 들어주기 (v5.2부터 트럭)
````
````new
소원 들어주기 (v5.3부터 트럭)
````

### K27 · 시장 시험판: 날 수
````old
v4.5 비공개 테스트 동안 만들어요 (10–13일).
````
````new
v4.5 비공개 테스트 동안 만들어요 (11–14일).
````

### K28 · 시장 시험판: 곳간 한 줄
````old
  - 진짜로 고치는 사무실 버튼, 같은 놀이 기록과 설문.
````
````new
  - 진짜로 고치는 사무실 버튼, 같은 놀이 기록과 설문.
  - 마을 곳간 한 줄 (세금 → 곳간 → 유지비 한 줄)과 설문 한 줄 「세금이 어디로 가는지 알았나요」 (11월 7일 새 부탁, 질문 40).
````

### K29 · 시장 시험판: 싼 폰 결과
````old
  - 싼 폰에서 버벅이면, 이야기 엔진 (v5.1)은 기다리고 간단한 이야기 장면만 먼저 넣어요.
````
````new
  - 싼 폰에서 버벅이면, 이야기 엔진 (v5.1)은 기다리고 간단한 이야기 장면만 먼저 넣어요. 동네 가게 (v5.2)는 그대로 나가고, 돌봄 시설은 이야기 엔진과 함께 기다려요.
````

### K30 · 출시판까지 날 수
````old
출시판까지는 만드는 날 95–111일과 테스트 기간 3–5주가 들어요.
````
````new
출시판까지는 만드는 날 100–117일과 테스트 기간 3–5주가 들어요.
````

### K31 · 정해 주실 것 안내
````old
꼭 봐 주셨으면 하는 것은 **5, 8, 10, 19–24번**이에요. 나머지는 추천대로 두셔도 돼요.
````
````new
꼭 봐 주셨으면 하는 것은 **5, 8, 10, 19–24번**이에요. 나머지는 추천대로 두셔도 돼요. 11월 7일 새 부탁의 질문 25–41은 질문 목록 맨 아래에 있어요 (25번은 둘째 걸음 자리표라 급해요. 26–30번은 꼭 봐 주세요).
````

### K32 · 11월 7일 새 부탁 → 이렇게 넣어요 (표)
````old
| 9 | 관리자 모드 | 4.2.0.2에 이미 나갔어요 | — |
````
````new
| 9 | 관리자 모드 | 4.2.0.2에 이미 나갔어요 | — |

### 11월 7일 새 부탁 → 이렇게 넣어요
| 부탁하신 것 | 이렇게 넣어요 | 질문 |
|---|---|---|
| 마을이 커지면 시장·잡화점도 더 (주민 이동 거리) | v4.6 금방 마켓이 먼 집 배달부터 챙겨요 → v5.2 「동네 가게」 (1단 먹거리, 2단 생활용품), 주민은 가장 가까운 가게로 | 29, 37 |
| 주간 보고서 (수익, 지출, 세금, 들어온·나간 주민, 사건사고) | v4.6 셈이의 「이번 주 보고서」. 나간 주민은 v5.1, 작은 사건은 v5.4부터 | 26, 32–36 |
| 위쪽 코인을 누르면 돈의 흐름 | v4.5 코인 카드 「오늘의 돈」 → v4.6 큰 「돈의 흐름」 화면 | 26, 31 |
| 세금·공적 자금으로 복지 사업 (요양원, 요양병원, 유치원, 어린이집, 실버타워, 간병인, 병원, 건강 관리) | v5.0 「마을 곳간」과 진료소 건강 체크 → v5.2 「돌봄 마을」 (어린이집·유치원, 햇살 쉼터·실버타워, 돌봄 선생님, 튼튼 돌봄 병원, 튼튼 수첩) | 25, 27, 28, 30, 38–41 |
````

### K33 · 결정 메모 아래: 번호만 바뀐 질문
````old
질문 6에 따라 구글 플레이 비공개 테스트(테스터 12명 × 14일)를 지금 시작해요.
````
````new
질문 6에 따라 구글 플레이 비공개 테스트(테스터 12명 × 14일)를 지금 시작해요.
>
> **번호만 바뀌었어요 (11월 7일, 질문 28):** 「돌봄 마을」이 v5.2에 들어가서, 아래 질문 8, 13, 24의 v5.2 (탈것의 시대)는 v5.3으로, v5.3 (안심 마을)은 v5.4로 읽어 주세요. 정하신 내용은 그대로예요.
````

### K34 · 질문 25–41 덧붙이기
````old
24. **v5를 네 칸 (시장 취임 / 주민의 일생 / 탈것의 시대 / 안심 마을)으로 나눌까요?**
    → ★ 네. 예전 v5.0 한 덩어리는 만드는 날이 50일을 넘어서 테스터 판이 너무 늦어져요. 사건 장면은 경찰차 그림이 있어야 해서 탈것 뒤에 둬요.
````
````new
24. **v5를 네 칸 (시장 취임 / 주민의 일생 / 탈것의 시대 / 안심 마을)으로 나눌까요?**
    → ★ 네. 예전 v5.0 한 덩어리는 만드는 날이 50일을 넘어서 테스터 판이 너무 늦어져요. 사건 장면은 경찰차 그림이 있어야 해서 탈것 뒤에 둬요.

### 11월 7일 새 부탁 질문 (25–41)
자세한 설명은 `docs/기획서_돈과복지.md`에 있어요. 25번은 급하고, 26–30번은 꼭 정해 주세요. 31–41번은 따로 말씀이 없으시면 추천대로 해요.

25. **학교와 진료소 자리를 지금 (둘째 걸음에서) 크게 잡아 둘까요?**
    → ★ 네. 학교 자리는 가장 큰 자리로, 진료소 자리는 큰 자리로 키우고, 서쪽 큰 자리는 공공 건물 자리로 남겨요. 동네 가게와 어린이집은 보통 자리에도 지을 수 있게 해요. 반나절쯤이면 되고, 미루면 v5.0에서 더 커져요.
26. **돈의 흐름과 주간 보고서를 어느 버전에 넣을까요?**
    - (A) ★ 나눠서 넣어요. v4.5에는 돈을 바르게 세는 장치와 코인 카드 (읍 뒤에는 [오늘] [이번 주] 칸), v4.6에는 큰 「돈의 흐름」 화면, 주간 보고서, 보고서에서 다음 주 목표 고르기. 출시판은 5–6일만 늘어요.
    - (B) 모두 v4.5에 넣어요. 출시판이 10–11일 늘어요 (44–51일).
    - (C) 모두 v4.6으로 미뤄요. 출시판에는 코인 카드도 없어요.
27. **공적 자금은 어떻게 할까요?**
    - (A) ★ 시장 취임 선물로 「마을 곳간」을 만들어요. 세금과 월세가 알아서 들어가고 유지비와 월급이 알아서 나가요. 가득 차면 세금 날마다 지갑으로 보내요. 누를 버튼은 없어요. 모자라도 문을 닫지 않아요.
    - (B) 따로 쌓지 않고 돈의 흐름 화면에서 "공공 수입 / 공공 지출"로 묶어 보여 주기만 해요.
    - (C) 곳간을 v4.6 「시청 공사 시작」 때 열어서 시청 24,000코인을 곳간에 모아요. "막대가 다 찬 뒤 봇 3분 안에 24,000" 약속을 다시 맞춰야 해요.
28. **새 버전 「돌봄 마을」은 어디에 넣을까요?**
    - (A) ★ v5.2 (주민의 일생 바로 뒤). 탈것의 시대는 v5.3, 안심 마을은 v5.4로 한 칸씩 밀어요.
    - (B) 맨 뒤 v5.4. 번호는 그대로지만 돌봄이 32–42일 늦게 와요.
    - (C) v5.0과 v5.1에 나눠 넣어요. 두 버전이 너무 커져요.
29. **동네 가게는 언제 넣을까요?**
    - (A) ★ 돌봄 마을 (v5.2). 주민마다 집이 생긴 뒤라 "가까운 가게"가 진짜가 되고, 이야기 엔진 없이도 돌아가요. 그 전까지 먼 집은 v4.6 금방 배달이 챙겨요.
    - (B) 주민의 일생 (v5.1). 한 버전 빨리 오지만 v5.1이 11–13일 커져요 (31–41일).
    - (C) v4.6에 첫 가게 1곳. 주민이 아직 집에서 장을 보러 가지 않아서 같은 손님이 나뉠 뿐이에요.
30. **돌봄 시설과 가게 이름, 말투를 이렇게 할까요?**
    → ★ 네. 간병인 → 돌봄 선생님, 요양원 → 햇살 쉼터, 실버타워 → 햇살 실버타워 (쉼터 2단), 요양병원 → 튼튼 돌봄 병원 (진료소 2단), 어린이집 → 아장아장 어린이집, 유치원 → 눈꽃 유치원 (어린이집 2단), 건강 관리 시스템 → 튼튼 수첩, 동네 시장·잡화점 → 동네 가게, 공적 자금 → 마을 곳간. "아프다·환자"는 쓰지 않아요.
31. **코인 카드는 읍 전에도 될까요?** → ★ 네, 보기만 하는 카드로요. 읍 시간은 다시 재요.
32. **주간 보고서의 "한 주"는?** → ★ 게임 속 7일 (놀이 70분). 첫 보고서 봇 약 110분, 맛보기 보고서 약 70분.
33. **보고서는 어떻게 받을까요?** → ★ 셈이가 두고 한 줄 알림만 떠요. 창이 저절로 뜨지 않아요. 지난 4주를 다시 볼 수 있어요.
34. **보고서에서 주민을 어떻게 부를까요?** → ★ 「새로 온 주민」「이사 간 주민」. '이주민'은 이미 "이사 온 이웃"이라는 뜻이에요.
35. **이사 간 주민은?** → ★ v5.1부터, 따뜻한 까닭으로만 아주 가끔. 기분이 나빠서 떠나는 규칙은 꺼요. 보고서 줄은 첫 이사 뒤부터 보여요.
36. **사건·사고 칸은?** → ★ v5.4 전에는 다정한 「마을 소식」, v5.4부터 작은 사건. 끄기 스위치는 그대로예요.
37. **동네 가게가 늘어나는 규칙은?** → ★ 걸어서 먼 집이 3채 이상이면 카드 (자리 2–3곳 중 고르기). 처음 2곳, 140명 3곳, 180명 4곳, 220명 5곳까지. 지금 지도에는 2–3곳 자리가 있어요.
38. **건강은 어떻게 보여 줄까요?** → ★ 건강 필요는 진료소 범위로 채우고, 튼튼 수첩 스티커는 좋은 것만 더해요. 내려가지 않아요. 숫자는 보고서의 마을 평균에만.
39. **곳간에 [기부하기]·[꺼내 쓰기] 버튼을 둘까요?** → ★ 두지 않아요. 기부로 명성을 사면 큰 도시 승격이 너무 쉬워져요.
40. **시장 시험판에 곳간을 넣어 볼까요?** → ★ 네 (1일 더).
41. **복지 살림 단계 (넉넉히 / 보통 / 아껴서)를 둘까요?** → ★ 아직은 두지 않아요. 세율 (v5.0)이 먼저예요.
````

### K35 · 바뀌는 예전 계획 목록: 행복 7가지 (번호 + 돌봄)
````old
건강·배움은 v5.0, 안심은 v5.3. 새 필요는 첫 시설을 지은 뒤부터 행복에 들어가요 |
````
````new
건강·배움은 v5.0, 안심은 v5.4. 새 필요는 첫 시설을 지은 뒤부터 행복에 들어가요. 돌봄 마을 (v5.2)은 새 필요 없이 건강·배움을 아기·어르신에게도 채워요 |
````

### K36 · 바뀌는 예전 계획 목록: 트럭 운전 (번호)
````old
| 트럭 운전 미션 | v5.2의 함께하기 (기사님 보내기와 코인 같음, 별은 배지만) |
````
````new
| 트럭 운전 미션 | v5.3의 함께하기 (기사님 보내기와 코인 같음, 별은 배지만) |
````

### K37 · 바뀌는 예전 계획 목록: 버스·은행 (번호)
````old
| v5의 버스·은행 (읍과 도시 사이) | v5.2 (도시 뒤). 은행 대출은 v8 큰 도시 승격식에 써요 |
````
````new
| v5의 버스·은행 (읍과 도시 사이) | v5.3 (도시 뒤). 은행 대출은 v8 큰 도시 승격식에 써요 |
````

### K38 · 바뀌는 예전 계획 목록: 사건 (번호)
````old
| 사건은 전부 v8 | 작은 사건·소화전·방범 초소는 v5.3 (탈것 뒤), 경찰서·소방서·큰 불·이사 트럭은 v8 |
````
````new
| 사건은 전부 v8 | 작은 사건·소화전·방범 초소는 v5.4 (탈것 뒤), 경찰서·소방서·큰 불·이사 트럭은 v8 |
````

### K39 · 바뀌는 예전 계획 목록: 「찾습니다」 포스터 (번호)
````old
| 현상수배 포스터 (경찰서) | 「찾습니다」 포스터, 방범 초소 게시판 (v5.3) |
````
````new
| 현상수배 포스터 (경찰서) | 「찾습니다」 포스터, 방범 초소 게시판 (v5.4) |
````

### K40 · 바뀌는 예전 계획 목록: 새 줄
````old
| 관망 소개 (스토어) | 그대로 두고 「읍이 되면 지도에서 손가락 하나로 마을을 돌봐요」 한 줄을 더해요 |
````
````new
| 관망 소개 (스토어) | 그대로 두고 「읍이 되면 지도에서 손가락 하나로 마을을 돌봐요」 한 줄을 더해요 |
| 사무실 통장 칸 (딸랑이가 모은 돈만, 일부는 두 번 셈) | v4.5부터 돈이 처음 생길 때 한 번만 세서 바르게 보여요. v4.6에 「돈의 흐름」 화면이 돼요 |
| 세금 상자 (1,500에서 멈춤) | 세금 날 (v4.4) → 시장이 되면 세금이 마을 곳간으로 (v5.0) |
| 주민 장보기 (v5 물류 계획) | v5.2 동네 가게와 함께 (이야기 엔진 없이도 돌아가요) |
| 요양원·요양병원·간병인·건강 관리 (11월 7일 새 부탁) | 햇살 쉼터·튼튼 돌봄 병원·돌봄 선생님·튼튼 수첩 (v5.0, v5.2) |
| 셈이의 「장부 정리했어요」 (쉬는 동안 번 돈) | 그대로 v4.5. v4.6부터 「이번 주 보고서」 안에도 한 줄로 들어가요 |
````

### K41 · 부록
````old
- 이 로드맵의 만드는 사람용 계획: `engineering_roadmap.md` (같은 폴더)
````
````new
- 이 로드맵의 만드는 사람용 계획: `engineering_roadmap.md` (같은 폴더)
- 11월 7일 새 부탁 (돈의 흐름, 주간 보고서, 동네 가게, 돌봄 마을): `docs/기획서_돈과복지.md`, `docs/roadmap_mayor/econ_welfare_addendum.md`
````

---

## B. `docs/roadmap_mayor/engineering_roadmap.md`

### E1 · §0 summary rows
````old
| v4.5 | 주민의 부탁 | 읍장 | 50–80 + daily | kit-lite + F8b ports, 4 needs, requests/board/fame, card + 따라가기 + 함께하기, deliver job, daily loop, 청혼 scene. **Public launch** | v8 + slices | 34–40 |
| v4.6 | 읍내 장날 | 읍장 | 60–100 | 금방 G1, L1a remainder, L1b, 도감, mailbox, weekly goal + titles, 도시 bars + 시청 공사 scene | v8 + slices | 33–38 |
| proto | 시장 시험판 | — | from a bundled 읍 save | in-app sandbox: needs/facilities/conflict cards/tax rate | own keys | 10–13 |
| v5.0 | 시장 취임 | 시장 | 100–150 | full kit, households, welfare + needs, tax rate, rank 3 + scripted wedding, balance pass | **v9** | 34–40 |
| v5.1 | 주민의 일생 | 시장 | 105–150 | story host, life beats (farewell sub-gate, off), conflict cards, card v2 | v9 + side key | 20–28 |
| v5.2 | 탈것의 시대 | 시장 | 115–150 | vehicles era 2/3, asphalt, bank deposit + loans, 금방 G2 | v9 + slices | 18–24 |
| v5.3 | 안심 마을 | 시장 | 110–150 | incidents via ScriptedSource at a village 방범 초소, hydrants, cityfolk merge | v9 + slice | 14–18 |
````
````new
| v4.5 | 주민의 부탁 | 읍장 | 50–80 + daily | kit-lite + F8b ports, 4 needs, requests/board/fame, card + 따라가기 + 함께하기, deliver job, daily loop, 청혼 scene; MoneyBook + coin door 「오늘의 돈」 card (F15, F16a). **Public launch** | v8 + slices | 39–46 |
| v4.6 | 읍내 장날 | 읍장 | 60–100 | 금방 G1, L1a remainder, L1b, 도감, mailbox, weekly goal + titles, 도시 bars + 시청 공사 scene; full 돈의 흐름 view + weekly report by 셈이 (F16b, F17), 금방 far-home deliveries | v8 + slices | 38–45 |
| proto | 시장 시험판 | — | from a bundled 읍 save | in-app sandbox: needs/facilities/conflict cards/tax rate; 마을 곳간 line | own keys | 11–14 |
| v5.0 | 시장 취임 | 시장 | 100–150 | full kit, households, welfare + needs, tax rate, rank 3 + scripted wedding, balance pass; 마을 곳간 (F18), 튼튼 수첩 v1 (F19), facility job slots | **v9** | 39–46 |
| v5.1 | 주민의 일생 | 시장 | 105–150 | story host, life beats (farewell sub-gate, off), conflict cards, card v2; report departures + life news, warm-only move-out | v9 + side key | 21–29 |
| v5.2 | 돌봄 마을 | 시장 | 130–180 | 동네 가게 on a household-basket model (F20), care facilities + care jobs (F21), 튼튼 수첩 v2; cards gated on first users | v9 + slices | 29–34 |
| v5.3 | 탈것의 시대 | 시장 | 115–150 | vehicles era 2/3, asphalt, bank deposit + loans, 금방 G2 | v9 + slices | 18–24 |
| v5.4 | 안심 마을 | 시장 | 110–150 | incidents via ScriptedSource at a village 방범 초소, hydrants, cityfolk merge; report incidents section | v9 + slice | 14–18 |
````

### E2 · Totals
````old
**Totals:** launch candidate (v4.3–v4.5) **95–111**; 읍장 stage (v4.4–v4.6) 109–127; to 시장 취임 (v4.3 … v5.0 incl. prototype) **172–202**; to 안심 마을 (… v5.3) **224–272** (≈ 20–25 × step A); v6–v8 75–103; whole roadmap 299–375. Tester windows (≈ 3–5 weeks to launch; 1–2 weeks per version after it) come on top.
````
````new
**Totals:** launch candidate (v4.3–v4.5) **100–117**; 읍장 stage (v4.4–v4.6) 119–140; to 시장 취임 (v4.3 … v5.0 incl. prototype) **188–222**; to 안심 마을 (… v5.4) **270–327** (≈ 25–30 × step A); v6–v8 75–103; whole roadmap 345–430. Tester windows (≈ 3–5 weeks to launch; 1–2 weeks per version after it) come on top. The 2026-11-07 money/welfare request added 43.75 planned builder-days (+46 to +55; `econ_welfare_addendum.md` §13).
````

### E3 · §1 numbering: the 시장 core
````old
- **v5.0–v5.3 = the 시장 core** (시장 취임, 주민의 일생, 탈것의 시대, 안심 마을; question 24).
````
````new
- **v5.0–v5.4 = the 시장 core** (시장 취임, 주민의 일생, 돌봄 마을, 탈것의 시대, 안심 마을; questions 24 and 28).
````

### E4 · §2 principle 1: pre-읍 additions
````old
attendance from day 1, away earnings after village complete and the ch. 1–5 hands-on quests (v4.5, question 19).
````
````new
attendance from day 1, away earnings after village complete, the ch. 1–5 hands-on quests (v4.5, question 19) and the read-only coin card 「오늘의 돈」 (v4.5, question 31).
````

### E5 · §3 F0 row: caps
````old
| F0 | Slice container `x` for the roadmap's own state: total ≈ 4 KB, per-key caps (mgmt 256 B, needs 1 KB, daily 512 B, rewards 512 B, book 1 KB, mail 512 B, log 512 B),
````
````new
| F0 | Slice container `x` for the roadmap's own state: total ≈ 6.3 KB, per-key caps (mgmt 256 B, needs 1 KB, daily 512 B, rewards 512 B, book 1 KB, mail 512 B, log 512 B, money 896 B from v4.5, wk 1,024 B from v4.6),
````

### E6 · §3 F9 row
````old
| F9 | Resident needs (4 now, 7 by v5.3) + need bubbles;
````
````new
| F9 | Resident needs (4 now, 7 by v5.4; v5.2 adds no need, it extends 건강 to elders and 배움 to ages 0–6) + need bubbles;
````

### E7 · §3 F14 row + new rows F15–F21
````old
| F14 | Incidents via ScriptedSource; `sites.offer` becomes a remote offer; POLICE retargeted to a village 방범 초소 | `src/city/incidents/host.js:9-11, 64, 85-95`; `layout.js:22` | F4, F8, vehicles | v5.3 | — (in v5.3) |
````
````new
| F14 | Incidents via ScriptedSource; `sites.offer` becomes a remote offer; POLICE retargeted to a village 방범 초소 | `src/city/incidents/host.js:9-11, 64, 85-95`; `layout.js:22` | F4, F8, vehicles | v5.4 | — (in v5.4) |
| F15 | MoneyBook: value counted once where it is created into any balance (till, wallet, fund); transfers count nothing; refunds as negative expense; per-day invariant over wallet + fund + tills + sacks + savedCash; positional `x.money`; the 통장 bars read it | `Economy.js:3-25`; `CashPad`; `Office.js:335-341`; `Staff.js:579, 592-595`; `Growth.js:386-389`; `ports_v4.js:383-386`; `DepotSystem.js:94` | F8, F12a | v4.5 | 2.25 |
| F16 | Coin door (reuses `UI.panelOpen`) + read-only 「오늘의 돈」 card (F16a, v4.5); full 돈의 흐름 view with flow circle, build badges, 7-day bars, row tips, office 통장 tab → 돈, pooled text (F16b, v4.6) | `UI.js:48-53, 142`; `OfficePanel.js:22, 24, 245-271` | F15, C | v4.5 / v4.6 | 1.5 + 1.5 |
| F17 | Weekly report from 셈이: 7 game days, 08:00 on day 7k, one screen (3 numbers, ≤ 3 wins, 1–3 rows each with one action, next-week goal pick), taste report, 4 kept in `x.wk`, one inbox row | `Save.js:286`; `VillageNews.js:72-99`; `story/tuning.js:23` | F15, F16b, weekly goal | v4.6 (cut → v4.6.1) | 2.5 |
| F18 | 마을 곳간: automatic second balance from the rank-3 ceremony; tax + rent in, upkeep + wages out, overflow above `7 × due + next public price` → wallet at payday; public builds fund-first with an automatic wallet remainder; 시청 stays wallet-paid; no donate/withdraw | `TownHall.js:79-99`; `Growth.js:645-657`; `UnlockPad.js:245-256` | F12a, F12b, F4, F15, P17 | v5.0 | 3.75 (incl. upkeep, job slots, balance, tests) |
| F19 | 튼튼 수첩: 건강 = clinic coverage; internal bonus-only score (base 75, never lower) shown as stickers; v1 weekly check-up; v2 visits, 체조, 건강 주간 | `story/engine/src/plans.js:172-175` | F9, households; v2 F13 | v5.0 / v5.2 | 1.0 + 1.0 |
| F20 | 동네 가게: one kind with two levels (food; + goods), main-thread household-basket demand (no story worker), candidate-plot card, porter in the price, shelf priorities 36/41/44, multi-shelf ledger | `Game.js:1247-1280`; `Logistics.js:18-26`; `StockLedger.js:13` | households, L1a, F4, coverage overlay | v5.2 | 10.5 |
| F21 | Care: 어린이집 (2단 = 유치원 look), 햇살 쉼터, 돌봄 선생님 visits, care jobs (`care_cook`, one wage table); cut line 실버타워 and 돌봄 병원; 건강/배움 extended to elders and ages 0–6; cards gated on first users | `story/engine/data/places.js:66-80`; `story/tuning.js:9, 18` | F13, F18, F19, F4, F9 | v5.2 | 15.75 |
````

### E8 · §3 dependency order
````old
→ F12b → F13 → F14. C can be built in parallel
````
````new
→ F12b → F13 → F14; F8 → F15 → F16a (v4.5) → {F16b, F17} (v4.6); F12a + F12b + F4 + households → F18 → F19 v1; households + L1a + coverage overlay → F20; F13 + F18 + F19 → F21 + F19 v2. F15 is built serially right after F8 (same `Economy`/`CashPad` hot spots). C can be built in parallel
````

### E9 · §4.1 v4.3: plot table for later civic use
````old
  - The walk-length targets (§4.6) still apply: play before 읍 stays hands-on.
````
````new
  - The walk-length targets (§4.6) still apply: play before 읍 stays hands-on.
  - **Plot table for later civic use** (2026-11-07 request, designer question 25; `econ_welfare_addendum.md` §1, §12): `d_school` M → XL and `d_clinic` M → L (`engineering_plan.md:329`; footprints 480×240 and 308×154 do not fit M 272×136); keep the old `w_hall` XL footprint as a hidden reserved `w_civic` plot for v5.0+; keep the M/L `types` allowlist data-driven so `br` and `care_*` kinds can be added later. Re-run `v43_layout` (the clinic's west edge sits 59 px inside `WORLD.left`) and check against the bakery branch's plots. Absorbed in step B (≈ 0.25 d).
````

### E10 · §4.3 v4.5: money scope
````old
- **Moved to v4.6 by default:** the weekly goal and fame titles.
````
````new
- **Moved to v4.6 by default:** the weekly goal and fame titles.
- **Money (2026-11-07 request, addendum §2–3):** F15 MoneyBook (value counted once at creation into any balance; per-day invariant over wallet + tills + sacks + savedCash; the office 통장 bars read it, which fixes the depot double count, the session export bar and the station 0 after 읍) and F16a: the coin counter becomes a door to a read-only 「오늘의 돈」 card (a deliberate pre-읍 addition; after 읍 [오늘] [이번 주] tabs). The full view and the weekly report are v4.6 (designer question 26).
````

### E11 · §4.3 v4.5: save
````old
- **Save:** `missions` (top-level module format, 3 KB cap, keep-rule from v4.3), `x.needs`, `x.rewards`, `x.daily`. `lv` 45.
````
````new
- **Save:** `missions` (top-level module format, 3 KB cap, keep-rule from v4.3), `x.needs`, `x.rewards`, `x.daily`, `x.money` (≤ 896 B, positional). `lv` 45.
````

### E12 · §4.3 v4.5: gates
````old
  - pre-읍 re-runs listed above.
````
````new
  - pre-읍 re-runs listed above;
  - money (addendum §12): the invariant holds exactly per game day (admin on and off) in fresh25, the pacing bots and a 10-day soak; depot sale + collection, export, D10 station cash and a sack in transit are each counted once; refunds as negative expense; an untagged `Economy.add` fails a dev assert; 통장 bars equal MoneyBook; coin door: a tap opens it, a drag does nothing, no joystick or `onHuman`, no overlap at 360×640 / 412×915, disabled during onboarding and ceremonies.
````

### E13 · §4.3 v4.5: effort
````old
- **Effort:** 34–40 (planned 31.75: F8 2.5, F8b 3.5, F9 3.25, F10 4.5, F11 4.25, J 1.5, daily 1.5, attendance 1, away 1.5, 수첩 + ch. 1–5 quests 2.5, payday link + light retune 1.5, 청혼 scene 1.25, letters 0.25, gates 2.75).
````
````new
- **Effort:** 39–46 (planned 36.25: F8 2.5, F8b 3.5, F9 3.25, F10 4.5, F11 4.25, J 1.5, daily 1.5, attendance 1, away 1.5, 수첩 + ch. 1–5 quests 2.5, payday link + light retune 1.5, 청혼 scene 1.25, letters 0.25, gates 2.75, F15 2.25, F16a 1.5, money tests 0.75). F15 runs serially right after F8.
````

### E14 · §4.3 v4.5: cut line
````old
- **Cut line:** 청혼 scene → v4.6 (−1.25–1.5).
````
````new
- **Cut line:** 청혼 scene → v4.6 (−1.25–1.5); the card's [이번 주] tab → v4.6 (−0.5).
````

### E15 · §4.4 v4.6: money view and weekly report scope
````old
  - 도감 (`v44_plan.md` §3.4), mailbox/보관함 (§14), the weekly goal, fame titles (they keep the 촌장 names: they are what residents call the chief).
````
````new
  - 도감 (`v44_plan.md` §3.4), mailbox/보관함 (§14), the weekly goal, fame titles (they keep the 촌장 names: they are what residents call the chief).
  - **Money view and weekly report** (2026-11-07 request, addendum §3–4): F16b full 돈의 흐름 view (flow circle with node numbers and the return arrow, build badges, 7-day bars, row tips with actions, office 통장 tab → 돈, pooled text); F17 weekly report by 셈이 (7 game days, 08:00 on day 7k, one screen: 번 돈 / 쓴 돈 / 새 이웃, ≤ 3 wins, 1–3 rows each with one action, next week's goal picked from the report; a taste report once ≥ 3 min after the last lesson and not on a scene day; 4 kept; one inbox row); report lines for 금방 (its direct till write becomes `addQuiet(n, 'gb')`), L1b and far-home deliveries; 금방 orders weighted toward far homes (남쪽, 동남쪽).
````

### E16 · §4.4 v4.6: save
````old
all top-level with v4.3's keep-rules; `x.book`, `x.mail`. `lv` 46.
````
````new
all top-level with v4.3's keep-rules; `x.book`, `x.mail`, `x.wk` (≤ 1,024 B, positional, headlines regenerated). `lv` 46.
````

### E17 · §4.4 v4.6: gates
````old
30-day manage-mode soak with toggles + 금방 orders, no softlock; whole-save size gate with every slice at its cap.
````
````new
30-day manage-mode soak with toggles + 금방 orders, no softlock; whole-save size gate with every slice at its cap. Money/report (addendum §12): week roll-over at days 7 and 14 (week 1 = 「첫 주」 with 6 paydays); report numbers equal MoneyBook sums and start + 번 돈 − 쓴 돈 = end (wallet + holders); the taste report fires once; every tip row has an action; one `wk_report` inbox row; 금방 recorded once as `gb`; money-view text transient ≤ +3 MiB.
````

### E18 · §4.4 v4.6: effort
````old
- **Effort:** 33–38 (planned 30.25: 금방 G1 6, G1b 3, L1a remainder 7, L1b 5.5, 도감 2.5, mailbox 1.5, bars + 시청 공사 scene + letter 1.5, weekly goal + titles 1.25, gates 2).
````
````new
- **Effort:** 38–45 (planned 35.5: 금방 G1 6, G1b 3, L1a remainder 7, L1b 5.5, 도감 2.5, mailbox 1.5, bars + 시청 공사 scene + letter 1.5, weekly goal + titles 1.25, gates 2, F16b 1.5, F17 2.5, report lines + far-home + goal pick 0.75, report tests 0.5).
````

### E19 · §4.4 v4.6: cut line
````old
- **Cut line:** L1b + G1b → v4.6.1 (−9 to −10).
````
````new
- **Cut line:** L1b + G1b → v4.6.1 (−9 to −10); F17 weekly report → v4.6.1 (−3 to −3.5).
````

### E20 · §4.5 prototype: scope
````old
6 conflict cards; 세금 날 + rate; the v4.4 fix buttons; the same play log and survey.
````
````new
6 conflict cards; 세금 날 + rate; the v4.4 fix buttons; the same play log and survey; the 마을 곳간 line (tax → 곳간 → one upkeep row) and a survey item 「세금이 어디로 가는지 알았나요」 (designer question 40).
````

### E21 · §4.5 prototype: effort
````old
- **Effort:** 10–13 (the sandbox, keys, flag and tests add ≈ 1 d to the old 9–12).
````
````new
- **Effort:** 11–14 (the sandbox, keys, flag and tests add ≈ 1 d to the old 9–12; the 곳간 line adds ≈ 1).
````

### E22 · §4.5 prototype: low-end result
````old
Low-end phones miss budgets → the story engine (v5.1) waits; scripted scenes only.
````
````new
Low-end phones miss budgets → the story engine (v5.1) waits; scripted scenes only. v5.2's neighbourhood shops still ship (main-thread basket); its care facilities wait with the story engine.
````

### E23 · §4.6 v5.0: scope
````old
policy window only if question 10 = B (+3–4 d, not in the range).
````
````new
policy window only if question 10 = B (+3–4 d, not in the range). **2026-11-07 request (addendum §5–6):** F18 마을 곳간 opened at the rank-3 ceremony after the wallet-paid 24,000 시청 (payday + rent in; daily upkeep + wages out; overflow above `7 × due + next public price` to the wallet at payday; never below 0, 「아껴 쓰는 중」 + a 셈이 tip; public builds fund-first with an automatic wallet remainder on the F4 buy card; no donate/withdraw; per-facility upkeep < covered tax); facility job slots with wages from the story `JOBS` table; F19 튼튼 수첩 v1 (건강 = clinic coverage; a bonus-only sticker score; weekly check-up on the week's last day).
````

### E24 · §4.6 v5.0: not in v5.0
````old
- **Not in v5.0:** story host, life beats, conflict cards, card v2 (v5.1); asphalt and buses (v5.2); library (no art).
````
````new
- **Not in v5.0:** story host, life beats, conflict cards, card v2 (v5.1); care facilities and neighbourhood shops (v5.2); asphalt and buses (v5.3); library (no art).
````

### E25 · §4.6 v5.0: rank 3 bars (bus riders)
````old
uses bus riders 120/day, which needs v5.2.
````
````new
uses bus riders 120/day, which needs v5.3.
````

### E26 · §4.6 v5.0: rank 3 bars (loans)
````old
Loans do not exist yet (v5.2), so the coin bar
````
````new
Loans do not exist yet (v5.3), so the coin bar
````

### E27 · §4.6 v5.0: save
````old
This is the first migration that reaches public players. `lv` 50.
````
````new
This is the first migration that reaches public players. `lv` 50. Adds `x.fund` (≤ 96 B); the money/welfare addendum adds no per-household fields.
````

### E28 · §4.6 v5.0: gates
````old
v9 fixtures incl. forced failure; whole-save size gate (E11).
````
````new
v9 fixtures incl. forced failure; whole-save size gate (E11); 곳간 (addendum §12): fund invariant, never below 0, a shortage gives 「아껴 쓰는 중」 + a tip and no closure, overflow at payday, per-facility upkeep < covered tax and total upkeep 20–35 % of tax + rent at bot 150; the weekly check-up fires; scores never below base.
````

### E29 · §4.6 v5.0: effort
````old
- **Effort:** 34–40 (planned ≈ 31.75: the critique's split estimate of ≈ 28 planned for kit + households/v9 + facilities/needs/tax rate + rank 3, plus the scripted wedding 1, the balance pass 2.5, the no-drop fixture 0.25). Rescoped after the prototype.
````
````new
- **Effort:** 39–46 (planned ≈ 36.5: the critique's split estimate of ≈ 28 planned for kit + households/v9 + facilities/needs/tax rate + rank 3, plus the scripted wedding 1, the balance pass 2.5, the no-drop fixture 0.25, F18 1.5, upkeep 0.5, job slots 0.75, F19 v1 1.0, fund balance 0.5, fund tests 0.5). Rescoped after the prototype. Cut line: the F19 v1 check-up event → v5.2 (−1.1 to −1.3).
````

### E30 · §4.7 v5.1: scope
````old
resident card v2 (relationships, family, age, today's schedule); remaining story missions.
````
````new
resident card v2 (relationships, family, age, today's schedule); remaining story missions. Report departures (`move_out` facts) and life news; move-out only for warm reasons: disable the unhappiness branch at `src/story/engine/src/life.js:492` and make both branches pick warm reasons; a departed household sends a letter and its home refills (addendum E15). Farewell scheduling: never within 3 game days of that resident's clinic visit (not shown).
````

### E31 · §4.7 v5.1: effort
````old
- **Effort:** 20–28 (±40 %).
````
````new
- **Effort:** 21–29 (±40 %; the report and warm move-out add 1.0 planned).
````

### E32 · New §4.8 v5.2 「돌봄 마을」 + vehicles renumbered
````old
### 4.8 v5.2 「탈것의 시대」
````
````new
### 4.8 v5.2 「돌봄 마을」 (new, 2026-11-07 request)

- **Why here:** care users need ages and households (F13 over v5.0 households); neighbourhood shops need residents with homes (v9). Vehicles and safety depend on neither and shift one slot (designer question 28).
- **Scope:** F20 동네 가게 (one kind `br`: L1 food, L2 + goods; offered when ≥ 3 homes are beyond 45 m of any food shop, as a card with ≤ 3 candidate plots and 「닿는 집 n채」; cap `min(5, 2 + ⌊max(0, people − 100)/40⌋)`, 2–3 sites on today's map; main-thread household-basket demand that only adds trips, plaza and train demand untouched; built-in porter; shelf priorities 36/41/44; multi-shelf ledger); F21 (어린이집 with the 유치원 look as L2, 햇살 쉼터, 돌봄 선생님 visits, care jobs paid from the 곳간; cut line 실버타워 and 돌봄 병원 = clinic L2 as elder coverage + check-up capacity; 건강/배움 extended to elders and ages 0–6 with the ramp rule); F19 v2; report and panel care/shops sections. Cards gate on first users (first birth → 어린이집, elders ≥ 6 → 쉼터, L2 by usage); one coverage layer at a time.
- **Naming/tone:** designer question 30; no sick state, no 환자/아프다, no ambulance; farewell never scheduled within 3 game days of a clinic visit (not shown).
- **If the story engine waits** (prototype result, §4.5): shops and the 곳간 ship; care waits with F13 (ages come from it).
- **Save:** `shops` (≤ 512 B, top-level, v9 keep-rule), `x.care` (≤ 256 B), visit days in the story side store. `lv` 52.
- **Texture:** `village_care` ≤ 3.62 MiB (2.0 without 실버타워; ≈ 0.6 if the v5.0 apartment frames are tint-shared) + 0–0.55 for shops; the measured village-view budget stays ≤ 415 steady and ≤ 455 transient; plaza ≤ 340 with the pages resident.
- **Gates:** addendum §12 v5.2 (branch draw ≤ 15 % of line output at bot 150, income Δ +2–6 points, plaza SHELF_EMPTY ≤ baseline + 10 %, shops work with F13 off, no-drop fixture v5.1 → v5.2, no closure on a fund shortfall, content-rating re-run).
- **Effort:** 29–34 (planned 27.25: F20 10.5, F21 15.5, card gating 0.25, F19 v2 1.0), ±40 %.
- **Cut line:** 실버타워, 돌봄 병원, 건강 주간 → v5.2.1 (−3 to −3.5).
- **Risks:** child and elder counts (story-lab run before the plan review, addendum E25); basket tuning vs income bands; XL plot supply for the 실버타워; care wording; the texture budget.

### 4.9 v5.3 「탈것의 시대」
````

### E33 · Vehicles: save level
````old
- **Save:** `vehicles` (1.5 KB), `bank` (existing top-level slice). `lv` 52. **Effort:** 18–24 (±40 %).
````
````new
- **Save:** `vehicles` (1.5 KB), `bank` (existing top-level slice). `lv` 53. **Effort:** 18–24 (±40 %).
````

### E34 · Safety: heading
````old
### 4.9 v5.3 「안심 마을」
````
````new
### 4.10 v5.4 「안심 마을」
````

### E35 · Safety: why after vehicles (1)
````old
the incidents module depends on v5.2 and v8 content.
````
````new
the incidents module depends on v5.3 and v8 content.
````

### E36 · Safety: why after vehicles (2)
````old
(the v5.2 vehicles fragment)
````
````new
(the v5.3 vehicles fragment)
````

### E37 · Safety: scope (police car)
````old
with the police car from v5.2;
````
````new
with the police car from v5.3;
````

### E38 · Safety: save level + report section
````old
- **Save:** `incidents` slice. `lv` 53. **Effort:** 14–18 (the old 10–13 plus ≈ 3.5 planned for the POLICE retarget, the cityfolk merge and C14 handling, with overrun).
````
````new
- **Save:** `incidents` slice. `lv` 54. **Effort:** 14–18 (the old 10–13 plus ≈ 3.5 planned for the POLICE retarget, the cityfolk merge and C14 handling, with overrun; the weekly report's incidents section, 0.25 planned, sits inside the range and shows only with the switch on).
````

### E39 · v6–v8 heading
````old
### 4.10 v6 갈매기 항구 · v7 햇살 해변 · v8 살아 있는 도시
````
````new
### 4.11 v6 갈매기 항구 · v7 햇살 해변 · v8 살아 있는 도시
````

### E40 · §5 save table
````old
| v4.5 | 8 | 45 | `missions` (top-level), `x.needs`, `x.rewards`, `x.daily` | slices |
| v4.6 | 8 | 46 | `geumbang`, `haul`, `demand` (top-level), `x.book`, `x.mail` | slices |
| v5.0 | 9 | 50 | households, XL plots | `MIGRATE[8]` + failure path |
| v5.1 | 9 | 51 | story side key | side key |
| v5.2 | 9 | 52 | `vehicles`, `bank` | slices |
| v5.3 | 9 | 53 | `incidents` | slice |
````
````new
| v4.5 | 8 | 45 | `missions` (top-level), `x.needs`, `x.rewards`, `x.daily`, `x.money` | slices |
| v4.6 | 8 | 46 | `geumbang`, `haul`, `demand` (top-level), `x.book`, `x.mail`, `x.wk` | slices |
| v5.0 | 9 | 50 | households, XL plots, `x.fund` | `MIGRATE[8]` + failure path |
| v5.1 | 9 | 51 | story side key | side key |
| v5.2 | 9 | 52 | `shops` (top-level), `x.care`; visit days in the story side key | slices |
| v5.3 | 9 | 53 | `vehicles`, `bank` | slices |
| v5.4 | 9 | 54 | `incidents` | slice |
````

### E41 · §5 size budget
````old
`demand` 1 + `x` ≈ 4.3 + existing `bank`/`logistics` ≈ 20–21 KB: under the 24 KB fail line, over the 16 KB warning.
````
````new
`demand` 1 + `x` ≈ 6.3 (incl. `money` 0.9 and `wk` 1.0) + existing `bank`/`logistics` ≈ 22–23 KB: under the 24 KB fail line with ≈ 1 KB headroom, over the 16 KB warning (if v4.6's gate fails, `x.wk` keeps 2 records or moves to a side key).
````

### E42 · §7 launch candidate
````old
Launch candidate: 95–111 builder-days
````
````new
Launch candidate: 100–117 builder-days
````

### E43 · §8 table: 금방 G2
````old
G1 v4.6, G1b v4.6/4.6.1, G2 v5.2, G3 v8
````
````new
G1 v4.6, G1b v4.6/4.6.1, G2 v5.3, G3 v8
````

### E44 · §8 table: needs
````old
4 needs v4.5; +건강/배움 v5.0; +안심 v5.3; new needs count after their first facility
````
````new
4 needs v4.5; +건강/배움 v5.0; v5.2 extends 건강/배움 to elders and ages 0–6 (no new need); +안심 v5.4; new needs count after their first facility
````

### E45 · §8 table: v5 contents split
````old
requests/board/fame v4.5; welfare/rank 3 v5.0; story/life/conflicts v5.1; vehicles/bank v5.2; safety v5.3
````
````new
requests/board/fame v4.5; welfare/rank 3 v5.0 (+ 마을 곳간); story/life/conflicts v5.1; care/neighbourhood shops v5.2; vehicles/bank v5.3; safety v5.4
````

### E46 · §8 table: cityfolk merge
````old
| `v5_v8_plan.md` §11.2 | cityfolk merge (v8 phase) | moved | v5.3 |
````
````new
| `v5_v8_plan.md` §11.2 | cityfolk merge (v8 phase) | moved | v5.4 |
````

### E47 · §8 table: incidents
````old
| `v5_v8_plan.md` D14 | incidents v8 only | split | small incidents + safety v5.3; police station/fire/moving v8 |
````
````new
| `v5_v8_plan.md` D14 | incidents v8 only | split | small incidents + safety v5.4; police station/fire/moving v8 |
````

### E48 · §8 table: 생활과미션
````old
| redistributed | v5.2; v4.5 + v5.0; v5.1; v5.0 |
````
````new
| redistributed | v5.3; v4.5 + v5.0; v5.1; v5.0 (+ care v5.2) |
````

### E49 · §8 table: posters
````old
wanted posters → 「찾습니다」 at the 방범 초소 (v5.3) |
````
````new
wanted posters → 「찾습니다」 at the 방범 초소 (v5.4) |
````

### E50 · §8 table: new rows
````old
| `store/플레이스토어_진행상황.md`, `store/console_answers_ko.md` | Play steps, data safety, rating | kept; updated per §6–7 | data safety stays 「수집 안 함」 (E5) |
````
````new
| `store/플레이스토어_진행상황.md`, `store/console_answers_ko.md` | Play steps, data safety, rating | kept; updated per §6–7 | data safety stays 「수집 안 함」 (E5) |
| `Office.income` 통장 bars (courier-fed; depot counted twice; session export bar; station 0 after 읍) | income bars | replaced | MoneyBook F15 (v4.5); the tab becomes 돈 (v4.6) |
| `logistics_plan.md` D7 주민 장보기 (v5) | residents shop from home | moved, changed | v5.2 동네 가게 on a household-basket model (F20), independent of the story worker |
| `v5_v8_plan_player.md:215, :220` | school, clinic | kept, extended | v5.0 with 곳간 upkeep, job slots and the weekly check-up (F18, F19) |
| `v5_v8_plan.md:512` | no illness/hospital/death words | kept, applied | care naming (designer question 30): 돌봄 선생님, 햇살 쉼터, 튼튼 돌봄 병원, 튼튼 수첩; no ambulance |
| `src/story/engine/src/life.js:492` | move-out after unhappiness | changed | v5.1: warm reasons only (addendum E15) |
````

### E51 · §9 conflicts: numbering
````old
→ v4.6 kept; v5 split into v5.0–v5.3 (question 24).
````
````new
→ v4.6 kept; v5 split into v5.0–v5.3 (question 24), then v5.0–v5.4 with 돌봄 마을 at v5.2 (question 28).
````

### E52 · §9 conflicts: safety
````old
→ v5.3, after vehicles, because the incidents module needs the police car (v5.2), the cityfolk merge and a village POLICE placement (§4.9)
````
````new
→ v5.4, after vehicles, because the incidents module needs the police car (v5.3), the cityfolk merge and a village POLICE placement (§4.10)
````

### E53 · §9 conflicts: bank loans / vehicles
````old
(engineering) → v5.2. Loans serve the v8 ceremony
````
````new
(engineering) → v5.3. Loans serve the v8 ceremony
````

### E54 · §9 conflicts: new item 15
````old
the critique added more (§0) → 224–272.
````
````new
the critique added more (§0) → 224–272.
15. **Money/welfare request (2026-11-07):** the draft put the full money view and the weekly report in the launch build, shops on story errands and a two-wallet fund with donate/withdraw; the critiques moved the view and report to v4.6, put shops on a main-thread basket model and made the fund automatic → counting + coin card v4.5; view + report v4.6; 마을 곳간 + check-ups v5.0; care + shops in a new v5.2; vehicles v5.3, safety v5.4 (`econ_welfare_addendum.md` §17).
````

### E55 · §10 designer questions 25–41
````old
24 split v5 into v5.0–v5.3 with safety after vehicles (★ yes).
````
````new
24 split v5 into v5.0–v5.3 with safety after vehicles (★ yes).

**2026-11-07 request (designer questions 25–41, `기획서_돈과복지.md` ⑦; ★ = recommendation):** 25 grow `d_school` to XL and `d_clinic` to L in step B, keep a hidden west `w_civic` (★ yes, urgent); 26 money: (A★) counting + coin card in v4.5, full view + weekly report + goal pick in v4.6, (B) all in v4.5 (v4.5 44–51), (C) all in v4.6; 27 public fund: (A★) automatic 마을 곳간 from the rank-3 ceremony, (B) grouped display only, (C) open the 곳간 at v4.6's 시청 공사 scene; 28 돌봄 마을: (A★) v5.2 with vehicles v5.3 and safety v5.4, (B) v5.4, (C) split over v5.0/v5.1; 29 shops: (A★) v5.2 on a basket model, (B) v5.1 (31–41), (C) one branch in v4.6; 30 care/shop names (★ yes); 31 coin card before 읍 (★ yes); 32 week = 7 game days (★); 33 delivery by 셈이, banner only, 4 kept (★); 34 「새로 온 주민 / 이사 간 주민」 (★); 35 departures from v5.1, warm reasons only (★); 36 incidents only from v5.4 with the switch (★); 37 shop offer rule and cap (★); 38 health = coverage + bonus-only stickers (★); 39 no donate/withdraw buttons (★); 40 곳간 line in the prototype (★ yes); 41 no welfare budget levels yet (★). Numbering note: in the decided answers 8, 13 and 24 above, read vehicles v5.2 → v5.3 and safety v5.3 → v5.4 (question 28); the decisions themselves are unchanged.
````

### E56 · §10 engineering questions E14–E28
````old
- E13. Where the 「시청 공사 시작」 scaffold stands (hall vs a 시청 site) and which site art it reuses.
````
````new
- E13. Where the 「시청 공사 시작」 scaffold stands (hall vs a 시청 site) and which site art it reuses.
- E14–E28 (money/welfare request; details in `econ_welfare_addendum.md` §15): first week close ≈ bot 110 (measure); warm move-out in both `life.js:492` branches; count at creation, not at `'sold'`; v4.6 office tab gating; multi-shelf ledger; which page the v5.0 apartments use and the measured village-view budget; step-B plot check; v5.0+ save budget (+ ≈ 0.9 KB); the public (fund-first) catalog; admin/debug adds tagged; report archive in `x.wk` vs a side key; story-lab child/elder counts before the v5.2 plan review; basket trip rate and the 15 % supply cap; `shop_general` residency after the v3 split; v5.3 bank transfers in the invariant.
````

### E57 · §11 not verified
````old
- v5.0 effort is the critique's split estimate plus additions; v5.1–v8 effort has no prior estimate in the plan docs; ranges are rough.
````
````new
- v5.0 effort is the critique's split estimate plus additions; v5.1–v8 effort has no prior estimate in the plan docs; ranges are rough.
- Money/welfare request: the first-week (≈ bot 110) and taste-report (≈ bot 70) minutes, child and elder counts, the `village_civic` / `village_care` page sizes (packed from frame sizes by a script) and the save sizes (synthetic records) are estimates; every coin figure in `기획서_돈과복지.md` is illustrative.
````

### E58 · §8 table: ladder cross-reference (v6–v8 section renumbered)
````old
harbour/beach/큰 도시 later (§4.10) |
````
````new
harbour/beach/큰 도시 later (§4.11) |
````
