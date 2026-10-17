# Android test APK — 행복한 눈꽃마을 이야기 (Snowbloom Village)

The designer wanted to try the game on an Android phone as an installed app while development goes on. This report covers
the reusable APK pipeline (`tools/apk/`) and the first test APK, built from the **published v4.1** code (commit `65c39f3`,
"v4.1 published"). The working tree (v4.2 in progress) was not read or changed: v4.1 was checked out into a separate
`git worktree`.

| | |
|---|---|
| File | `frost-village/dist/apk/snowbloom-v4.1-test.apk` |
| SHA-256 | `5eb8d983f0000bab810d3ff91dd1471c73139d07417d980b3457c60c8fef925f` |
| Size | 58,109,140 bytes (55.4 MB) |
| App | 행복한 눈꽃마을 이야기 · package `com.snowbloom.village` · version 4.1 (versionCode 4010) |
| Android | 7.0 or newer (minSdk 24), targetSdk 34 |
| Signature | v1 (JAR) + v2 (APK Signature Scheme v2), **test key** `dist/apk/snowbloom-test.p12` |
| Permissions | `VIBRATE` only (the game's haptics). No `INTERNET`: the game never fetches anything remote |
| Game files | the 492 files of the artifact build (`--webp --mp3-only`), unchanged except `index.html` wrapped in a full page |

The Korean install guide for the designer is at the end ([설치 안내](#설치-안내-디자이너용)).

---

## 1. Rebuild for a new version (one command)

From any commit, without touching the working tree (worktree + artifact build + APK + checks):

```
bash frost-village/tools/apk/apk_from_commit.sh <commit> 4.2 4020 --check
```

→ `frost-village/dist/apk/snowbloom-v4.2-test.apk` (+ `.sha256`, `.json`, and `boot_test_v4.2/` with `--check`).

Or, when `dist/artifact` is already the build to ship:

```
cd frost-village
node tools/build/build_artifact.mjs --webp --mp3-only
python3 tools/apk/build_apk.py dist/artifact dist/apk/snowbloom-v4.2-test.apk 4.2 4020
```

Rules for the numbers:
- **versionCode must never go down** (Android refuses a downgrade over the installed app). Scheme used: major·1000 + minor·10
  (+1 for a rebuild of the same version): 4.1 → 4010, 4.2 → 4020, a second 4.2 build → 4021.
- **Always sign with the same key** (`dist/apk/snowbloom-test.p12`, made on the first run). An APK signed with another key
  cannot be installed over the old app; the designer would have to uninstall it first, which deletes the saved game.
  `dist/` is git-ignored, so this key lives only in this working copy: keep a copy somewhere safe, and do not commit it to
  the public repository (it is a throw-away test key, but still).

Needs: JDK 11+ (`javac`, `java`, `jarsigner`, `keytool`), Python 3 with Pillow, Node + esbuild (artifact build). The
Android tools are downloaded once from Maven Central into `~/.cache/snowbloom-apk-tools` (or `--tools-dir`,
`$SNOWBLOOM_APK_TOOLS`), pinned by SHA-256. A build takes about 25 s after the artifact build.

## 2. The app

`tools/apk/android/` (Java 8 source, resources, manifest template):

- **One Activity, one WebView.** `MainActivity` shows the game full screen. The packed game (`assets/www/` in the APK) is
  served from the virtual origin **`https://appassets.androidplatform.net/`** (the host Android reserves for this; the
  same one androidx `WebViewAssetLoader` uses) by `WebViewClient.shouldInterceptRequest`. `AssetRouter.java` maps URL →
  asset path (query/fragment dropped, `%`-decoding, `..`/backslash refused → 404, `/` → `index.html`) and sets the MIME
  type and charset (html, js, json, css, webp, png, jpg, gif, mp3, ogg, m4a, wav, woff, woff2, ttf, wasm, svg, md, …).
  Unknown paths answer a real 404 (so the game's own retry/fallback code sees a normal failed request). No `file://`
  access is used or allowed (file and content access are off). Secure context, so every web API behaves as on https.
- **Saves:** DOM storage on; the game's `localStorage` save lives with the app (separate from Chrome and from the
  claude.ai artifact). The game saves on `visibilitychange`/`pagehide`; the app sends the page to "hidden" when it
  pauses (`WebView.onPause`), and fires `pagehide` before closing from the Back dialog.
- **Back button:** never exits by accident. It asks 「게임을 끝낼까요? 지금까지 한 것은 자동으로 저장돼요」 with
  계속하기 / 끝내기.
- **Screen:** portrait only; full screen with the status and navigation bars hidden (sticky immersive: a swipe from the
  edge shows them for a moment); the screen stays on while the game is open; hardware accelerated; the night-blue page
  colour behind everything (no white flash); Android 12+ splash in the same colour. Rotation/keyboard/size changes do
  not restart the game (`configChanges`), the launcher icon returns to the running game (`singleTask`). With a notch the
  game sits below it (default cutout mode), so nothing is hidden behind the camera.
- **Keyboard (resident chat):** the window shrinks above the keyboard (`adjustResize`; the bars are hidden with system-UI
  flags rather than `FLAG_FULLSCREEN`, which would break that). The chat panel already follows `visualViewport`.
- **Sound:** media may play without a tap (`setMediaPlaybackRequiresUserGesture(false)`); the title's first tap still
  works as before. Phaser pauses the sound when the app goes to the background.
- **Renderer crash / out of memory:** handled (`onRenderProcessGone`, Android 8+): a fresh WebView reloads the game,
  which continues from its save; after three losses within a minute the app closes with a short message.
- **Debugging:** `WebView.setWebContentsDebuggingEnabled(true)` (USB debugging + `chrome://inspect` on a computer shows
  the page's console). Console messages also go to `adb logcat -s Snowbloom`. The user agent ends with
  `SnowbloomVillageApp/<version>`.
- **AI chat:** there is no claude.ai host in the app, so `window.claude` is absent and the resident chat
  (주민과 수다 떨기) uses its offline village voice — the game's own fallback, no code change.
- **Links:** any non-game link opens in the phone's browser. Safe Browsing lookups and WebView metrics are off
  (manifest meta-data): the app only shows its own packed files.
- **Icon:** from the title-art app icon (`assets/title/icon`, see `title_art.md`): adaptive icon (Android 8+) from
  `ic_launcher_foreground/background.png` scaled to 108 dp for mdpi…xxxhdpi (108…432 px); legacy square icon
  (rounded, 48…192 px) from `icon_1024.png`; round icon (Android 7.1) from the adaptive pair's visible 72 dp. Preview:
  `dist/apk/icon_preview.png`. The label is 행복한 눈꽃마을 이야기 (launchers may shorten it to 행복한 눈꽃마을…).

## 3. How the APK is built (no Android SDK)

Google's download host (`dl.google.com`, also behind `maven.google.com`) is blocked here, so the SDK, build-tools, d8 and
Google Maven's apksig are not available. Everything comes from Maven Central, pinned by SHA-256 in `build_apk.py`:

| tool | from | used for |
|---|---|---|
| stub `android.jar` (API 16) | `com.google.android:android:4.1.1.4` | `javac --release 8` class path |
| `dx` 16.0.1 (AOSP dexer) | `com.jakewharton.android.repackaged:dalvik-dx:16.0.1` | classes → `classes.dex` (dex 037, min API 24) |
| `aapt2` + `android-framework.jar` | prebuilt inside `org.apktool:apktool-lib:3.0.3` | binary `AndroidManifest.xml`, `resources.arsc`, compiled icons |
| apksig 2.3.0 | `com.android.tools.build:apksig:2.3.0` | the v2 signature block; verification |
| JDK `jarsigner`, `keytool` | the installed JDK 21 | v1 (JAR) signature; the test key |

Steps (`tools/apk/build_apk.py`):
1. **www/**: copy the artifact folder; the artifact's `index.html` is body-only (the claude.ai host adds the skeleton),
   so it is wrapped in `<!doctype html><html lang="ko"><head>…` with charset and a `viewport-fit=cover`, no-zoom viewport
   (standards mode instead of quirks mode). Remote URLs in the code are listed in the `.json` (v4.1: only `phaser.io` and
   `www.w3.org` strings inside `phaser.min.js`, never fetched).
2. **Icons** (Pillow) and **resources**: `aapt2 compile` + `aapt2 link` against the framework resources — real
   aapt2 output, not a hand-written AXML/ARSC.
3. **Code**: `javac --release 8 -Werror -Xlint:all` against the API-16 stub. Methods newer than API 16 are called by
   reflection on the public API class (`setMediaPlaybackRequiresUserGesture`, `setWebContentsDebuggingEnabled`,
   `WebResourceResponse.setStatusCodeAndReasonPhrase/setResponseHeaders`); `onRenderProcessGone` (API 26) compiles
   against a compile-only stub of `RenderProcessGoneDetail` (`tools/apk/android/stubs`, never dexed). Then `dx`.
4. **Zip**: own writer — `resources.arsc`, PNGs and all media (webp, png, mp3, …) **stored and 4-byte aligned** (the
   zipalign rule, with the same `0xd935` alignment field apksig uses); manifest, dex and text (js, json, html) deflated;
   fixed timestamps.
5. **Signing**: apksig 2.3.0's own v1 signer calls a JDK-internal PKCS#7 method that JDK 17+ no longer has, so v1 is the
   JDK's `jarsigner` (SHA-256/RSA), the zip is re-aligned (byte-identical entries), and `signer/SignApk.java` adds the
   **v2** block with apksig's `DefaultApkSignerEngine` over the whole zip — the same steps `ApkSigner.sign()` takes.
   targetSdk 34 is allowed because the APK has a v2 signature and a stored, aligned `resources.arsc`. No v3 (apksig on
   Maven Central predates it; v3 only matters for key rotation).
6. **Checks** (the build fails on any): every stored entry aligned, `resources.arsc`/PNGs stored, zip CRCs; `aapt2 dump
   badging` (package, version, SDKs, label, icon, launchable activity); apksig `ApkVerifier` for every platform 24…36 (v2)
   and again from 18 (to check v1); `jarsigner -verify`.

Outputs next to the APK: `<name>.apk.sha256`, `<name>.json` (all facts above).

Reproducible: building the same commit again (`apk_from_commit.sh 65c39f3 4.1 4010`, run as a test of the wrapper) gave
an APK whose 520 entries are byte-identical to this one except `META-INF/CERT.RSA` (jarsigner stamps its signing time),
so only the signature blocks and the file hash differ.

## 4. Validation of `snowbloom-v4.1-test.apk`

All on the final file (SHA-256 above). Raw results: `dist/apk/snowbloom-v4.1-test.json` (build checks),
`dist/apk/validate.json` (androguard), `dist/apk/boot_test/boot_test.json` + screenshots (boot test).

**Build-time checks (`build_apk.py`)** — all pass: 520 zip entries (427 stored, all 4-byte aligned; 93 deflated),
`resources.arsc` and every PNG stored, CRCs ok. `aapt2 dump badging`: `com.snowbloom.village`, 4.1 / 4010,
minSdkVersion 24, targetSdkVersion 34, label 행복한 눈꽃마을 이야기, icon `res/mipmap-anydpi-v26/ic_launcher.xml`,
launchable activity `com.snowbloom.village.MainActivity`, permission `VIBRATE` only. apksig `ApkVerifier`: verified
with v2 for Android 7.0–16 (API 24–36), v1 + v2 when checked from API 18, 0 errors (one expected warning: no v1
anti-stripping header, see limits). `jarsigner -verify`: "jar verified". Certificate: `CN=Snowbloom Village TEST ONLY`,
RSA 2048 / SHA256withRSA, valid to 2056, SHA-256 `b1d3104b7acd2931061d2b96fafd0c5cc52936141bb5b5f06218d5d34cd57daf`.

**androguard 4.1.4 (`test/validate_apk.py`) — 38/38 checks pass:** valid APK; package, version, minSdk 24, targetSdk 34;
the only activity is the launcher one with MAIN + LAUNCHER, `exported=true`, portrait, `singleTask`,
`adjustResize`, configChanges covering rotation/size/keyboard; hardware accelerated; no cleartext traffic; permissions =
VIBRATE only; label resolved through `resources.arsc`; the launcher icon resolves for mdpi…xxxhdpi + anydpi-v26, and
`ic_launcher_foreground/background/round` exist in every density; the theme resolves; one `classes.dex` (dex 037) with
only the 11 app classes (the compile-only stub is not packed), `shouldInterceptRequest`, `shouldOverrideUrlLoading`,
`onRenderProcessGone`, `onBackPressed`, `onPause`, `onResume`, `onWindowFocusChanged` present; signed v1 and v2 with the
same certificate; `resources.arsc` stored; every stored entry aligned; `www/index.html` a full standards-mode page; the
492 packed game files are byte-identical to the v4.1 artifact build (0 missing, 0 extra, 0 different).

**Java against the real framework:** the app sources also compile against Robolectric's `android-all` for Android 14
(the real framework classes, not the stub), with no stub needed; `onRenderProcessGone(WebView, RenderProcessGoneDetail)`
has the framework's exact descriptor, and every method called by reflection exists with that signature
(`WebSettings.setMediaPlaybackRequiresUserGesture(boolean)`, `WebView.setWebContentsDebuggingEnabled(boolean)`,
`WebResourceResponse.setStatusCodeAndReasonPhrase(int, String)`, `setResponseHeaders(Map)`).

**AssetRouter self-test (`AssetServer --selftest`, the app's own routing class on the JVM):** all 492 packed files
route from their URL (with a query string) to `assets/www/…` with a known type (81 JSON, 98 mp3, 114 png, 194 webp,
3 js, 1 html, 1 md; 86 served as UTF-8 text); 37 edge cases pass (`/`, no slash, `#frag`, `//`, `./`, upper-case host,
`:443`, `%20`, `+`, non-ASCII `%E2%9D%84` (❄), `..`, `%2e%2e`, bad escapes and backslashes → 404; look-alike hosts, http, other
ports, other sites, `data:` → not intercepted).

**Boot test (`test/boot_test.mjs`) — PASS 16/16** in headless Chromium, 390×844 CSS px, DPR 3, touch, ko-KR, an Android
WebView user agent. Every request to `https://appassets.androidplatform.net/` was answered by the JVM `AssetServer`
reading the **APK file itself** through `AssetRouter`; every other request would have been blocked (none was made).
- the page runs on the virtual origin: secure context, standards mode, `localStorage` works, `window.claude` absent;
- the living title appears with its art (WebGL) in 15 s; a tap starts a **new game** in the village; sound unlocked;
- ~60 s of play with **real touch input** (CDP touch events on the floating joystick — no test hooks for movement):
  net → grill → shelf → register → cash, coins 0 → 4 (the load average was ~17 on the shared 4-core box, the game ran
  at about 2 fps under SwiftShader at DPR 3, so this took 251 s of wall time);
- **resident chat** (빵집 아주머니): opens, mode `offline`, a typed message gets the village voice's answer
  「어머, 오늘 생선 많이 잡았다니! 대단해요~」, closes again. (In an earlier run the chat was opened by tapping the resident
  and the 수다 button; in this one the slow frame rate kept the button from showing, and the test opened the same sheet
  through the game's own `residentChat.open`.)
- **exit save:** with the save removed, firing `pagehide` (what the app does on 끝내기) wrote it back (904 bytes, coins 4,
  plus the chat record); **reload → title → continue**: coins 4 = 4, the resident still remembers the talk;
- **0 page errors, 0 console errors, 0 failed requests, 0 404s**, 560 files served, nothing left the origin.

Earlier runs (test fixes only, no APK change between the last two): the first, on the build before the reflection
lookup moved to the public API classes, passed everything but the chat step (the test tapped the 수다 button before its
pop-in animation ended); the second, on this APK, passed everything but register/coins (the game ran too slowly under
the load for the old waits). Both were fixed in the test; neither was an APK problem.

**Independent second check (other tools, same APK, SHA-256 unchanged):**
- **Signatures.** A v2 verifier written from the AOSP spec (Python `cryptography`, no apksig) recomputes the chunked
  SHA-256 content digest and checks the RSA signature: OK. The v1 MANIFEST/SF digests and the PKCS#7 signature
  (`openssl cms`) check out, with the same certificate as v2.
- **Zip structure.** Local and central headers agree for all 520 entries, every CRC matches, all 427 stored entries are
  4-byte aligned, and the signing block sits directly before the central directory.
- **Manifest and resources.** The manifest was parsed by androguard, pyaxml (Rust) and a hand-written AXML reader. All
  24 manifest attribute IDs and the 9 theme attribute IDs match `android.R.attr` in the real Android 14 and Android 17
  framework (Robolectric `android-all`). Icons resolve for every density.
- **Code.** All 127 framework method references and 6 field references in `classes.dex` resolve in the real API 34
  and API 37 classes. All 17 callback methods override real framework methods. WebViewClient's
  `WebResourceRequest` variants delegate to the `String` variants the app overrides.
- **Game files.** `git archive 65c39f3` + `build_artifact.mjs --webp --mp3-only` reproduces all 492 packed files
  byte for byte (only `index.html` differs, by the wrapper).
- **Rebuild.** `build_apk.py` from an empty tools folder rebuilt an APK identical in all entries except
  `META-INF/CERT.RSA`.
- **Play test.** The APK's files were served straight from the zip (not through AssetRouter), with Chromium at
  390×844 and touch input:
  - one run at DPR 3: boot, about 160 s of play at 2 fps, chat, save and reload;
  - one run at DPR 1: about 460 s of play, coins 0 → 8, chat opened by real taps on the resident and the 수다 button,
    exit save, reload with coins 8 = 8;
  - both runs had 0 page or console errors, 0 failed requests, 0 404s and nothing off-origin;
  - all 293 URLs the game requested route correctly through the app's AssetRouter.
- **No INTERNET permission.** Current Chromium `aw_proxying_url_loader_factory.cc` was read again:
  `shouldInterceptRequest` is asked before the blocked-network cache-only flags could matter, so this is low risk.

## 5. Limits — read before relying on it

- **Not run on a real phone or emulator** (none is available here). Everything that could be checked off-device was:
  real aapt2 resources, two independent parsers (aapt2, androguard), Google's apksig verifier, `jarsigner -verify`, the
  Java compiled against the real Android 14 framework (Robolectric `android-all` 14) with matching override signatures,
  the asset router run on the JVM against the APK itself, and the packed game run end-to-end in Chromium through that
  router. What remains unproven until the first install: the WebView itself on the designer's phone.
- **No INTERNET permission.** The game fetches nothing remote (the build lists every http(s) host the code mentions; for
  v4.1 only two strings inside `phaser.min.js`), and the boot test blocks every request that leaves the virtual origin.
  Without the permission WebView turns on "block network loads", which in the Chromium WebView code only makes real
  network requests cache-only; requests answered by `shouldInterceptRequest` are served before that. This is the one
  behaviour that rests on reading the WebView source rather than on a device test: if the first install shows
  "웹페이지를 사용할 수 없음 / ERR_CACHE_MISS" instead of the loading snowflake, rebuild with `build_apk.py … --internet`
  (one flag; nothing else changes; same key and versionCode, so it installs straight over the first one — this variant
  was built and passes `validate_apk.py --internet` too).
- **Needs a current Android System WebView** (updated through the Play Store, as on any normal phone). A phone whose
  WebView was never updated may lack web features the game uses, exactly as an old Chrome would.
- **The save is per app.** It is not shared with Chrome, GitHub Pages or the claude.ai artifact. Updating the app (same
  key, higher or equal versionCode) keeps it; uninstalling deletes it. Android's own backup may restore it on a new phone.
- **AI chat is offline** in the app (no claude.ai `sample` capability): residents answer with the village voice.
- **Test key only.** `dist/apk/snowbloom-test.p12` (password in `snowbloom-test.txt`) is a throw-away key. A Play Store
  release needs a real upload key, an AAB and Play's current targetSdk rule; this pipeline is for sideloaded test
  builds.
- **Play Protect** shows its "unknown app / unrecognised developer" warning for any sideloaded app signed with a key it
  has not seen; that is expected (see the guide).
- **Samsung Auto Blocker (자동 차단)** blocks every sideloaded APK while it is on (recent One UI versions can ship with it
  on). The guide tells the designer to turn it off for the install. Google's sideloading "developer verification"
  requirement (announced 2025) starts with a few countries in 2026; South Korea is not among them, so it does not affect
  this test build today, but later builds may need a registered developer account or an `adb install`.
- apksig warns that the v1 signature has no "anti-stripping" header (jarsigner cannot add it). Irrelevant here: Android
  7+ always checks the v2 signature, which covers the whole file.
- The adaptive icon has no monochrome layer, so Android 13's "themed icons" show the normal colour icon.
- Size: about 55.4 MB (mostly pictures and sound that are already compressed). The game files are the artifact
  build's, including the `--webp` re-encoding.

## 6. Files

| path | what |
|---|---|
| `tools/apk/build_apk.py` | the pipeline (artifact folder → signed APK + checks) |
| `tools/apk/apk_from_commit.sh` | one command: commit → worktree → artifact → APK (→ checks) |
| `tools/apk/android/AndroidManifest.xml`, `res/` | manifest template, theme, strings, adaptive-icon XML |
| `tools/apk/android/java/com/snowbloom/village/MainActivity.java` | the Activity + WebView client |
| `tools/apk/android/java/com/snowbloom/village/AssetRouter.java` | URL → packed file, MIME types (pure Java, also run on the JVM) |
| `tools/apk/android/stubs/` | compile-only stub (`RenderProcessGoneDetail`), never packed |
| `tools/apk/signer/SignApk.java` | v2 signing + verification with apksig |
| `tools/apk/test/validate_apk.py` | androguard structural checks (`pip install androguard` in a venv) |
| `tools/apk/test/AssetServer.java` | serves an APK's `assets/www` through `AssetRouter`; `--selftest` |
| `tools/apk/test/boot_test.mjs` | headless Chromium boot + 60 s play + chat + save/reload on the virtual origin |
| `dist/apk/snowbloom-v4.1-test.apk` (+ `.sha256`, `.json`) | the first test APK |
| `dist/apk/snowbloom-test.p12`, `snowbloom-test.txt` | the TEST signing key and its password — keep both |
| `dist/apk/boot_test/` | boot-test screenshots + `boot_test.json` |
| `dist/apk/validate.json` | androguard results (38 checks) |
| `dist/apk/icon_preview.png` | the launcher icons (legacy, round, adaptive layers) |

---

## 설치 안내 (디자이너용)

휴대폰에서 게임을 **앱으로** 설치해서 해 볼 수 있어요. 안드로이드 7.0 이상 휴대폰이면 돼요. (아이폰은 안 돼요.)

### 1. 파일을 휴대폰으로 옮기기
`snowbloom-v4.1-test.apk` 파일(약 56 MB)을 휴대폰으로 보내요. 편한 방법 하나만 고르세요.
- **구글 드라이브**: 컴퓨터에서 드라이브에 올리고 → 휴대폰 드라이브 앱에서 파일을 눌러요.
- **USB 케이블**: 휴대폰의 「다운로드(Download)」 폴더에 복사해요.
- 카카오톡으로 보내면 APK 파일이 막힐 수 있어요. 그럴 땐 드라이브를 쓰세요.

### 2. 설치하기
1. 휴대폰에서 파일을 눌러요.
2. **「출처를 알 수 없는 앱」** 이라는 안내가 나오면 **설정** → 지금 쓰는 앱(드라이브, 내 파일, 크롬 등)에서
   **「이 출처 허용」** 을 켜고, 뒤로 돌아와요.
   (삼성: 설정 → 애플리케이션 → 특별한 접근 → 알 수 없는 앱 설치 → 해당 앱 → 허용)
   **삼성 휴대폰에서 「자동 차단」 때문에 설치할 수 없다**는 안내가 나오면(최신 삼성 휴대폰은 처음부터 켜져 있을 수 있어요):
   **설정 → 보안 및 개인정보 보호 → 자동 차단 → 끄기** 한 다음 파일을 다시 눌러요. 설치가 끝나면 다시 켜도 돼요.
   (새 버전을 설치할 때도 같은 방법으로 잠깐 꺼요.)
3. **설치**를 눌러요.
4. **Play 프로텍트 경고가 뜰 수 있어요.** 「Play 프로텍트에서 인식할 수 없는 앱」, 「안전하지 않은 앱이 차단됨」
   같은 창이에요. 우리가 직접 만든 테스트 앱이라 구글이 아직 모르는 앱이어서 그래요.
   **「세부정보 더보기」 → 「무시하고 설치」(또는 「그래도 설치」)** 를 누르면 돼요.
   「앱 검사」를 하겠냐고 물으면 「검사하지 않고 설치」를 눌러도 괜찮아요.
5. 홈 화면에 **「행복한 눈꽃마을 이야기」** 아이콘(촌장님과 콩이)이 생겨요.

### 3. 알아 두면 좋은 점
- **저장은 앱 안에 따로 돼요.** 크롬이나 Claude 링크에서 하던 게임과는 **별개**라서, 앱에서는 처음부터 시작해요.
  앱에서 한 게임은 앱을 껐다 켜도 이어서 할 수 있어요.
- **새 버전이 나오면** 새 APK를 그냥 설치하면 돼요(덮어쓰기). 저장은 그대로 남아요.
  **앱을 삭제하면 저장도 같이 지워지니** 지우지 말고 덮어서 설치하세요.
- **「주민과 수다 떨기」(AI 수다)** 는 앱에서는 Claude가 연결되지 않아서 **마을 대화**로 동작해요.
  주민들이 마을 말투로 대답해 줘요. (Claude 링크에서 할 때만 AI가 대답해요.)
- **뒤로 가기 버튼**을 누르면 바로 꺼지지 않고 「게임을 끝낼까요?」 하고 물어봐요. 「끝내기」를 누르면 저장하고 닫혀요.
- 화면은 **세로로 고정**이고, 게임하는 동안 **화면이 꺼지지 않아요.** 위아래 막대(상태 표시줄)는 숨겨져요.
  화면 가장자리를 쓸어내리면 잠깐 보여요.
- 인터넷이 없어도 돼요. 게임 파일이 전부 앱 안에 들어 있어요.
- 앱을 열었는데 눈송이 로딩 대신 **「웹페이지를 사용할 수 없음」** 같은 글자만 나오면, 그 화면을 캡처해서 보내 주세요.
  고친 파일을 바로 다시 만들어 드릴게요(덮어서 설치하면 돼요).
- 화면이 멈추거나 이상하면 앱을 완전히 닫았다가(최근 앱 목록에서 위로 밀기) 다시 열어 주세요.
  저장된 곳부터 이어져요.
- 이 앱은 **테스트용**이에요. 플레이 스토어에 올린 정식 앱이 아니에요.
