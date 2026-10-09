# 행복한 눈꽃마을 이야기 (Snowbloom Village) — 배포 안내

> 게임 이름이 **「행복한 눈꽃마을 이야기」 / Snowbloom Village** 로 바뀌었어요 (게임 속 마을 이름은 그대로 서리마을).
> 폴더 이름(`frost-village`)과 저장 데이터는 그대로라서, 예전에 하던 게임도 이어서 할 수 있어요.

게임을 다른 사람에게 보여 주는 방법은 두 가지입니다.

| 방법 | 주소 | 이럴 때 |
|---|---|---|
| **GitHub Pages** | `https://hyun800115-create.github.io/nurient/frost-village/` | 누구나 여는 고정 주소가 필요할 때 (무료) |
| **Claude 아티팩트** | claude.ai 링크 | Claude 안에서 바로 공유할 때 |

> `index.html` 파일을 더블클릭하면 게임이 열리지 않습니다 (“불러오는 중…”에서 멈춤).
> 브라우저 보안 규칙 때문이고, 고장은 아닙니다. 아래 **내 컴퓨터에서 실행하기**처럼 열어 주세요.

---

## 1. 내 컴퓨터에서 실행하기

터미널(맥: 터미널, 윈도우: PowerShell)을 열고, 둘 중 하나를 복사해서 붙여 넣으세요.

**Node.js가 설치돼 있으면**

```
cd nurient/frost-village
npx serve
```

**Python이 설치돼 있으면**

```
cd nurient/frost-village
python -m http.server 8000
```

(맥에서 `python`이 없다고 나오면 `python3 -m http.server 8000`)

그다음 브라우저에서 화면에 나온 주소를 엽니다.
`npx serve`는 보통 `http://localhost:3000`, Python은 `http://localhost:8000` 입니다.

- **휴대폰으로 보기**: 컴퓨터와 같은 와이파이에 연결한 뒤, `npx serve`가 보여 주는
  `Network` 주소(예: `http://192.168.0.12:3000`)를 휴대폰 브라우저에 입력하세요.
- **끄기**: 터미널에서 `Ctrl + C`.
- 주소 끝에 `?debug=1`을 붙이면 FPS 표시가 나오고, `M` 키를 누르면 코인 +1000 (밸런스 테스트용).

---

## 2. GitHub Pages로 올리기 (무료 고정 주소)

저장소: `https://github.com/hyun800115-create/nurient` (공개 저장소, Pages 사용 중)

### 처음 한 번만

1. **게임 파일을 main 브랜치에 넣기**
   게임이 작업 브랜치에 있다면, 저장소 **Pull requests** 탭에서 해당 PR을 열고 **Merge pull request** → **Confirm merge**.
2. **(권장) 빈 `.nojekyll` 파일 만들기**
   저장소 첫 화면 → **Add file** → **Create new file** → 파일 이름에 `.nojekyll` 입력 (내용은 비워 둠) → **Commit changes**.
   GitHub가 파일을 변환하지 않고 그대로 올리게 해서 배포가 빠르고 안전해집니다.
3. **Pages 설정 확인**
   저장소 → **Settings** → 왼쪽 메뉴 **Pages** (Code and automation 아래)
   → **Build and deployment**
   → Source: **Deploy from a branch**
   → Branch: **main**, 폴더: **/ (root)** → **Save**.
4. 1~3분 기다린 뒤 **Actions** 탭에서 “pages build and deployment”에 초록색 체크가 뜨면 완료.
5. 게임 주소: **https://hyun800115-create.github.io/nurient/frost-village/**

### 수정할 때마다

main 브랜치에 바뀐 파일이 올라가면 자동으로 다시 배포됩니다 (1~3분).
예전 화면이 계속 보이면 새로고침하세요. 휴대폰은 탭을 닫았다가 다시 여세요.

### 알아 둘 점

- 주소는 **대소문자를 구분**합니다. `Frost-Village`가 아니라 `frost-village`.
- 공개 저장소라서 `docs/기획서.md`를 포함한 저장소의 모든 파일을 누구나 볼 수 있습니다.
- 진행 상황은 각자의 브라우저에 저장됩니다. 다른 기기로는 이어지지 않습니다.

---

## 3. Claude 아티팩트로 올리기

아티팩트는 Claude가 올려 줍니다. 먼저 **아티팩트용 묶음**을 만들어야 합니다.

### 묶음 만들기

```
cd nurient/frost-village/tools/build
npm install                 # 처음 한 번만 (몇 초)
node build_artifact.mjs
```

끝나면 `frost-village/dist/artifact/` 폴더가 생기고, 파일 개수와 전체 용량이 출력됩니다
(지금은 약 168개, 15 MB — 아티팩트 제한 255개 / 64 MB 안쪽).

- `src/`나 `assets/`를 고친 뒤에는 **꼭 다시 실행**하세요. 묶음은 자동으로 바뀌지 않습니다.
- `dist/` 폴더는 언제든 지우고 다시 만들 수 있습니다.
- **더 가볍게 (권장)**: `node build_artifact.mjs --webp`
  큰 그림 32개를 WebP로 바꿔 첫 로딩이 약 3 MB 줄어듭니다 (12 MB → 9 MB, 눈으로는 차이 없음).
  Python과 Pillow가 필요합니다 (`pip install pillow`). 원본 `assets/`는 바뀌지 않습니다.

### 올리기

Claude에게 이렇게 말하세요:
“`frost-village/dist/artifact/index.html`을 아티팩트로 올려 줘. 같이 올릴 파일 목록은 `frost-village/dist/artifact_files.json`에 있어.
**`capabilities: { sample: {} }`도 같이 선언해 줘.**”

- **`sample` 선언이 꼭 필요해요 (v4-C2 주민과 수다 떨기).** 이 선언이 있으면 주민과 수다를 떨 때 보는 사람의 Claude가
  주민의 대답을 만들어 줘요 (처음 한 번 "이 페이지가 Claude를 써도 될까요?" 확인 창이 떠요). 선언이 없거나 보는 사람이
  허락하지 않으면 주민은 **마을 말투**(오프라인)로 대답해요 — 게임은 그대로 돼요.
  `artifact_files.json`에도 `"capabilities": { "sample": {} }`가 적혀 있어요.
- 파일이 500개쯤이라 **두 번에 나눠** 올려요 (`artifact_files.json`의 `batches`: 첫 묶음은 페이지와 함께, 둘째 묶음은 같은 링크로).
  게임 코드와 목록 파일(`game.js`, `chat.js`, `lib/`, `manifest.json`, 타이틀 목록)은 마지막 묶음에 있어서, 중간에 열어도 섞여서 깨지지 않아요.
  (그림 조각 목록 `__FV_FRAGMENTS` 도 페이지가 아니라 `game.js` 맨 위에 들어 있어요: 첫 묶음과 함께 바뀌는 페이지가 예전 코드에 새 목록을 주지 않게.)
  한 번에 올리는 크기는 64 MB, 한 버전 전체는 256 MB · 파일 511개까지예요 (빌드가 묶음마다 확인해요).
- 주민 수다 코드는 `chat.js`라는 따로 된 파일이에요. 처음 "수다 떨기"를 누를 때만 내려받아요 (첫 화면이 가벼워요).

이미 올린 아티팩트를 고칠 때는 “같은 아티팩트 링크로 업데이트해 줘”라고 하면 주소가 그대로 유지됩니다.

### 올린 뒤 확인

1. 링크를 열고 화면을 탭 → 마을이 나오고 소리가 나는지 확인 (소리는 첫 탭 이후에만 나옵니다).
2. 그물 앞에 서서 물고기가 쌓이는지 확인.

### 그림이 회색 상자로 나오거나 “불러오는 중”에서 멈추면

아티팩트 환경에서 파일을 읽지 못한 경우입니다. v4부터는 **예비 묶음(`--inline`)을 쓰지 않아요**:
그림·소리가 너무 많아져서(약 80 MB) 한 번에 올릴 수 있는 크기(64 MB)를 넘고, 열 때 전부 내려받아야 해서 아주 느려요.
(`dist/artifact_inline/`은 v3 이전에 만든 옛 묶음이라 쓰지 마세요.)

대신 이렇게 해 보세요:
1. 링크를 새로 고침 → 게임이 잠시 뒤 받지 못한 그림을 다시 받아요 (몇 번까지 저절로 다시 시도해요).
2. 그래도 그대로면 Claude에게 “`dist/artifact_files.json`으로 같은 아티팩트를 다시 올려 줘”라고 하세요
   (`batches`가 있으면 묶음 순서대로).

### 아티팩트에서 알아 둘 점

- 진행 상황은 보는 사람의 브라우저에만 저장됩니다. 시크릿 창이나 미리보기에서는 저장되지 않을 수 있지만 게임은 그대로 됩니다
  (이때는 게임 안에 “이 환경에서는 진행 상황이 저장되지 않아요”라고 한 번 알려 줍니다).
- 주소 뒤에 `?debug=1`을 붙이는 디버그 모드는 아티팩트에서는 쓸 수 없습니다.
- 묶음에는 게임이 실제로 읽는 그림 폴더만 들어갑니다 (`src/core/Assets.js`의 `FRAGMENTS` 목록).
  아직 게임에 연결하지 않은 새 폴더(예: `assets/villagers/`)는 빌드할 때 “not loaded by the game yet”으로 빠집니다.

### 다른 웹사이트에 iframe으로 넣을 때

- `<iframe src=".../frost-village/" sandbox="allow-scripts allow-same-origin">` 처럼 **allow-same-origin**을 꼭 넣으세요.
  `allow-scripts`만 있으면 게임 파일을 읽지 못해서 “게임을 불러오지 못했어요” 안내가 뜹니다
  (서버가 `Access-Control-Allow-Origin: *` 헤더를 보내면 되기는 하지만, 그때도 저장은 되지 않습니다).
- sandbox 속성이 없거나 itch.io 같은 사이트에 올릴 때는 그대로 잘 됩니다.
- 화살표 키·스페이스바를 눌러도 바깥 페이지가 스크롤되지 않습니다.

---

## 4. 개발자용: 자동 점검

```
node frost-village/tools/build/build_artifact.mjs            # 아티팩트 묶음
node frost-village/tools/build/build_artifact.mjs --inline   # (v3 까지의 예비 묶음: v4 는 64 MB 를 넘어서 빌드가 멈춰요)
node frost-village/tools/build/test_deploy.mjs               # 전체 점검 (약 15~25분)
node frost-village/tools/build/test_deploy.mjs pages sameorigin --quick
```

`test_deploy.mjs` 모드: `pages`(GitHub Pages 하위 주소), `standalone`, `raw`, `sandbox-cors`,
`sameorigin`, `sandbox-inline`. `sandbox`(origin 없는 샌드박스 iframe + CSP, CORS 없음)는 최악의 경우를
보여 주는 모드라 일반 묶음으로는 실패하는 게 정상이고, 기본 실행에서는 빠집니다.
스크린샷은 `frost-village/dist/deploy_test/`에 저장됩니다.
