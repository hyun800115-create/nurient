# 인트로 실사 이미지 만들기 (로컬 AI용)

인트로 영상의 장면을 그림 대신 실사 사진으로 바꿀 수 있어요.
PC의 로컬 AI(Stable Diffusion, ComfyUI, Fooocus, Forge, Flux 등)로 아래 프롬프트를 넣어
장면별 이미지를 한 장씩 만든 뒤 보내 주시면, 앱과 영상에 바로 넣어요.

- 사진이 있는 장면은 사진이 화면을 꽉 채우고, 안전 수칙 문구가 왼쪽 위에 차례로 나타나요.
- 사진이 없는 장면은 지금처럼 그림으로 나와요. 일부 장면만 바꿔도 돼요.
- 회사 로고와 마지막 화면은 앱이 직접 넣으니, 이미지에는 글자나 로고를 넣지 마세요.

## 보내는 방법

1. **가장 쉬운 방법:** 만든 이미지를 이 Claude 대화창에 첨부하고, 몇 번 장면인지 알려 주세요.
2. **저장소에 직접 넣기:** `tv-remote/src/photos/` 폴더에 `scene1.jpg` ~ `scene7.jpg` 이름으로 넣고
   커밋해서 올려 주세요. 앱과 영상을 다시 만들어 드려요.

## 공통 설정

| 항목 | 권장값 |
|---|---|
| 비율 | 세로 9:16 |
| SDXL 계열 (RealVisXL, Juggernaut XL 등) | 768×1344, Steps 30, CFG 5~7, DPM++ 2M Karras |
| Flux.1 계열 | 1080×1920 (또는 896×1600), Steps 20~28, Guidance 3.5 |
| 장면마다 | 4장쯤 뽑아서 손·안전장구가 가장 자연스러운 것 고르기 |

**네거티브 프롬프트 (모든 장면 공통)**

```
cartoon, illustration, anime, 3d render, text, letters, watermark, logo,
deformed hands, extra fingers, bad anatomy, blurry, missing helmet,
unbuckled chin strap, unsafe posture, cigarette, sunglasses
```

**인물 공통 묘사 (장면 프롬프트 앞에 붙이면 인물이 비슷하게 나와요)**

```
Korean male telecom field technician in his 30s, navy blue work uniform,
orange high-visibility safety vest with silver reflective stripes,
```

## 장면별 프롬프트

### scene1 — 출발 전 차량 점검 (회사 전기차)

```
realistic photo, a Korean male technician in navy work uniform, orange safety vest
and red cap crouching next to a small blue boxy electric car (Kia Ray EV) parked at
an EV charging station, checking the rear tire, charging cable plugged into the car,
apartment parking lot, morning light, documentary style, vertical 9:16
```

### scene2 — 안전운전

```
realistic photo from outside, a small blue boxy electric car (Kia Ray EV) driving on a
city road at moderate speed, driver wearing a seat belt visible through the side window,
roadside trees and buildings, daytime, slight motion blur on the background, vertical 9:16
```

AI가 속도 표지판 숫자를 엉망으로 그리기 쉬워서 표지판은 빼는 게 좋아요. 안전벨트·제한속도 문구는 앱이 넣어요.

### scene3 — 고객 댁 인터넷·B tv 설치

```
realistic photo, Korean male technician in navy work uniform with an ID badge and a red cap,
wearing blue disposable shoe covers, kneeling in a bright modern Korean apartment living room,
connecting cables to an IPTV set-top box under a wall-mounted TV, TV screen glowing,
warm interior light, vertical 9:16
```

### scene4 — 사다리 작업 (2인 1조)

```
realistic photo, two Korean telecom technicians at the exterior wall of a low-rise building,
aluminum ladder leaning on the wall with stabilizer outrigger legs at the base,
top of the ladder tied to the wall with rope, one technician climbing the ladder wearing
a white hard hat with chin strap, orange safety vest and full body harness,
the second technician holding the ladder at the bottom, blue sky, vertical 9:16
```

### scene5 — 전주 작업

```
realistic photo, Korean telecom lineman working on a concrete utility pole at dusk,
standing on pole step bolts, full body safety harness with a pole strap wrapped around the pole,
white hard hat with chin strap and a small voltage detector alarm clipped on the helmet,
orange safety vest, yellow work gloves, grey leg gaiters, working on a cable terminal box
mounted on the pole, power lines far above, orange evening sky, low angle, vertical 9:16
```

### scene6 — 맨홀 작업

```
realistic photo, city street, open underground telecom manhole surrounded by yellow and black
safety barriers and orange traffic cones, metal tripod with a winch over the manhole,
Korean technician in white hard hat and orange safety vest holding a portable gas detector
to measure oxygen before entering, a second worker standing nearby as a watchman,
daytime, vertical 9:16
```

### scene7 — 안전장구 착용 점검

오른쪽에 점검표가 올라가니 인물은 **왼쪽**에 서 있어야 해요.

```
realistic full body photo of a Korean male telecom technician standing straight and facing
the camera, positioned on the left third of the frame, plain dark navy studio background with
empty space on the right, wearing complete safety gear: white hard hat with chin strap fastened,
small voltage detector on the helmet, full body safety harness with yellow X-shaped straps,
orange high-visibility vest, yellow safety gloves, grey leg gaiters, black safety shoes,
confident expression, soft studio lighting, vertical 9:16
```

## 고를 때 확인할 것

- 안전모 턱끈, 안전대(X반도) 체결 상태가 실제 수칙과 맞는지
- 손가락 개수, 사다리 발판, 전주 볼트처럼 AI가 자주 틀리는 부분
- 실제 직원 얼굴을 쓰려면 본인 동의를 받고 쓰기
