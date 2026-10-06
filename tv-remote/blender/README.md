# 인트로 3D 장면 (Blender)

인트로 영상의 장면 1~7과 안전벨트 확대 화면(8)은 이 폴더의 스크립트로 Blender에서 만든 3D 렌더예요.

- `human.py` — 현장 직원 3D 인물 (얼굴, 근무복, 조끼, 안전모, X반도, 각반, 장갑, 안전화)
- `props.py` — 회사 전기차(파란 레이), 충전기, 사다리, 전주, 맨홀 장비, 거실 소품
- `scenes.py` — 장면별 배치, 조명, 카메라, 렌더
- `publish.py` — 렌더 결과를 `src/photos/`에 JPEG로 복사

## 다시 만들기

```bash
python3.13 -m venv bvenv && bvenv/bin/pip install bpy==5.2.2 pillow
bvenv/bin/python scenes.py -- /tmp/renders            # 전체 (CPU 4코어 기준 장면당 1~2분)
bvenv/bin/python scenes.py -- /tmp/renders 3 --preview  # 3번 장면만 빠르게 미리보기
bvenv/bin/python publish.py /tmp/renders
python3 ../src/build_page.py                            # 앱 화면에 반영
```

`sceneN.json`에는 안내 문구가 가리킬 위치가 이미지 왼쪽 위 기준 비율로 들어 있어요.
