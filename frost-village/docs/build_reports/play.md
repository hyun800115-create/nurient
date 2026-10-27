# Google Play release pipeline — 행복한 눈꽃마을 이야기 (Snowbloom Village)

The designer wants the game on Google Play now and to keep shipping updates there. This report covers what changed in
`tools/apk/` for that: the app now targets **Android 16 (API 36)**, ships as a signed **Android App Bundle**, has an
**upload key**, a prepared route to keep the designer's **saved village** across the move from the sideloaded test APK
to Play, and **one command** per release. Store listing texts, graphics, privacy policy and the console answers are a
separate kit: `frost-village/docs/store/` (its Korean guide `플레이스토어_등록안내.md` also answers the "12 testers"
question).

| | |
|---|---|
| One command | `APK_PY=<venv>/bin/python bash frost-village/tools/apk/release_from_commit.sh <commit> <versionName> <versionCode> --check` |
| **v4.2.1** (lead) | `APK_PY=<venv>/bin/python bash frost-village/tools/apk/release_from_commit.sh <v4.2.1 commit> 4.2.1 4022 --check` |
| Outputs | `dist/play/snowbloom-<ver>.aab` (+ `.sha256`, `.json`, `.validate.json`), `dist/play/snowbloom-<ver>-universal.apk` (+ `.sha256`), `dist/play/boot_test_<ver>/` |
| App | `com.snowbloom.village`, minSdk 24, **targetSdk 36**, permissions VIBRATE + INTERNET, not debuggable |
| Bundle | one base module, no config splits; ~60 MB; Play download ~63 MB (limit for the base: 200 MB) |
| Keys | `.aab` signed with the **upload key** `dist/play/snowbloom-upload.p12`; universal APK signed with the **test key** `dist/apk/snowbloom-test.p12` (= the app signing key if Play gets it via PEPK) |
| Dry run | commit `aa169bd` (published v4.2), versionName `4.2-play-dryrun`, **versionCode 1** — `dist/play/snowbloom-4.2-play-dryrun.aab` is a dry run: **never upload it** |

`<venv>`: any virtualenv with `androguard` (in this working session: the `apk_dl/pyenv` venv of the session scratchpad).
Do not put it on PATH: the artifact build needs the system `python3` with Pillow.

---

## 1. Play facts this follows (checked where reachable)

Checked on developer.android.com today (reachable from here):
- **Target API**: "New apps and app updates must target Android 16 (API level 36) or higher to be submitted to Google
  Play" from **31 Aug 2026**; an extension to 1 Nov 2026 can be requested in Play Console
  (`developer.android.com/google/play/requirements/target-sdk`).
- **App Bundle**: "From August 2021, new apps are required to publish with the Android App Bundle"
  (`developer.android.com/guide/app-bundle`); the bundle "defers APK generation and signing to Google Play" (Play App
  Signing). Size: "New apps larger than 200 MB are now supported by either Play Feature Delivery or Play Asset
  Delivery"; the page puts the total compressed download of the APKs needed to install at ≤ 4 GB and points to Play
  Console Help for the exact limits.
- **Android 15, targetSdk 35+**: edge-to-edge by default; `layoutInDisplayCutoutMode` DEFAULT / SHORT_EDGES / NEVER
  are treated as ALWAYS; `setStatusBarColor` has no effect; `Window.setDecorFitsSystemWindows` deprecated and disabled.
- **Android 16, targetSdk 36**: `windowOptOutEdgeToEdgeEnforcement` is disabled (no opt-out); predictive back is the
  default — "**`onBackPressed` is not called and `KEYCODE_BACK` is not dispatched anymore**" (opt-out:
  `enableOnBackInvokedCallback="false"`); orientation / resizability / aspect-ratio settings are **ignored on displays
  with smallest width ≥ 600 dp**, except for **games (`android:appCategory`)**.
- **WebView and insets** (`…/webapps/understand-window-insets`): WebView maps cutout + system-bar insets into CSS
  `safe-area-inset-*` (M136 full-screen WebViews, M144 all); the keyboard resizes the visual viewport from M139;
  recommended pattern when the native layout pads: zero the handled inset types for the WebView ("double padding"
  otherwise).

**Not verifiable from here** (the proxy refuses support.google.com, play.google.com, www.gstatic.com, dl.google.com and
the Android Developers Blog): the Play Console Help pages — the exact size-limit table, store listing graphic specs
(icon 512×512, feature graphic 1024×500, 2–8 screenshots, name ≤ 30 / short ≤ 80 / full ≤ 4000 characters), Data
safety, IARC rating, target audience, the "12 testers × 14 days" rule for new personal accounts — and the PEPK tool
itself. Those follow the brief and current knowledge; the store kit (`docs/store/`) handles the listing side.

## 2. What changed in the app (`tools/apk/android/`)

Everything else is identical to the 4.2 test APK: virtual origin `https://appassets.androidplatform.net/`, the game
files byte for byte, DOM storage (the save), save on pause / `pagehide`, `singleTask`, portrait, keep-screen-on, the
night-blue window and Android 12+ splash, renderer-crash recovery, links to the browser, Safe Browsing / metrics off.

**Edge-to-edge (Android 11+, `Api30.java` + `MainActivity.GameFrame`).** On every Android 11+ phone the app now asks
for the window Android 15+ forces on a targetSdk 35+ app: `setDecorFitsSystemWindows(false)` and cutout mode ALWAYS
(one behaviour on Android 11–16). The bars stay hidden as before (now through `WindowInsetsController`: hide system
bars, transient bars by swipe — the old sticky immersive). The root view (`GameFrame`) pads itself by the insets the
game must not be under — **visible system bars, the camera cutout and the keyboard** (`systemBars | displayCutout |
ime`) — and hands the WebView the same insets with exactly those types **zeroed** (the Android docs' pattern above)
and the cutout shape removed (`setDisplayCutout(null)`; older WebViews read safe areas from it), so:
- on a notched phone the game sits below the camera, as in the targetSdk 34 app (night-blue strip above it);
- the chat's keyboard shrinks the game area like `adjustResize` did (on Android 15+ `adjustResize` no longer resizes an
  edge-to-edge window; it only reports the keyboard inset, which `GameFrame` now applies);
- **no double padding**: the WebView is never under a bar/cutout/keyboard and is told so, so the page's
  `env(safe-area-inset-*)` (`#game` top/bottom, `--sat`/`--sab` in `main.js`, the chat sheet) stay 0, exactly as in the
  targetSdk 34 app; the page and `viewport-fit=cover` are unchanged, so the artifact keeps its own behaviour in
  browsers;
- bars that come back for good (split screen, some keyboards) pad the game and are hidden again after 2.5 s.
Android 7–10 keep the old code path untouched (system-UI flags, the window fits the bars and resizes itself).

**Back (Android 13+, `Api33.java`).** `android:enableOnBackInvokedCallback="true"` and an `OnBackInvokedCallback`
registered at `PRIORITY_DEFAULT` on the activity's dispatcher: the back gesture / button opens the same
「게임을 끝낼까요?」 dialog (계속하기 / 끝내기 → `pagehide` save → close) on Android 13–16; `onBackPressed()` still does
it on Android 7–12. The dialog's own back cancels it; a second back while it is open does not stack a second dialog.

**Manifest.** `android:appCategory="game"` (Android 16 keeps the portrait lock on tablets / unfolded foldables for
games only), `enableOnBackInvokedCallback="true"`, targetSdk 36, and a meta-data flag `com.snowbloom.village.WEB_DEBUG`:
WebView remote debugging (`chrome://inspect`) stays **on in the sideloaded test APKs** and is **off in Play bundles**
(`build_aab.py --web-debug` turns it on).

**Compile.** Still `javac --release 8` against the API 16 stub jar plus compile-only stubs of exactly the newer types
the code uses (`android.view.WindowInsets` (+ `Type`, `Builder`), `DisplayCutout`, `WindowInsetsController`, `android.graphics.Insets`,
`android.window.OnBackInvokedCallback`, `OnBackInvokedDispatcher`; never dexed), newer methods of older classes by
reflection. `test/api36_check.py` proves all of it against the real Android 16 framework (below).

## 3. The bundle (`tools/apk/build_aab.py`)

1. Same steps as the APK up to the resources: www/ (the artifact build, `index.html` wrapped), launcher icons,
   `aapt2 link --proto-format` (protobuf manifest + `resources.pb`), javac + dx.
2. Base module zip (`manifest/AndroidManifest.xml`, `dex/classes.dex`, `res/**`, `resources.pb`, `assets/www/**`) →
   `bundletool build-bundle` with a BundleConfig that **negates the ABI, SCREEN_DENSITY, LANGUAGE and
   TEXTURE_COMPRESSION_FORMAT splits** (one base APK holds everything — the asset layout `AssetRouter` reads is the same
   as the test APK's) and stores `assets/**.webp|png|mp3` uncompressed in the generated APKs (as the test APK does).
3. `bundletool validate`; `jarsigner` (SHA-256/RSA) with the upload key; the `.aab`'s signer certificate must equal
   `snowbloom-upload-certificate.pem`; the bundle manifest is checked (package, versionCode/Name, min/target SDK, no
   `debuggable`, appCategory, back flag).
4. `bundletool build-apks --mode=universal` → `…-universal.apk`, signed with the test key (`--universal-key upload`
   for the other); `bundletool build-apks` (device splits) + `get-size total` → Play's download size.
5. Universal APK checks: apksig (bundletool's own, which knows v3) verifies for API 24–36, signer = the chosen key,
   `aapt2 dump badging` (package, versions, SDKs, launchable activity, permissions, not debuggable), zip alignment, every
   staged game file present with the same size.

**Size.** The base module is the whole game, ~60 MB compressed; bundletool's estimate of Play's download is
~63 MB (`get-size total`, all device configurations alike since there are no splits). That is far below 200 MB — no
asset packs needed. If the game ever grows past ~150 MB, move `assets/www/assets/**` media into an **install-time asset
pack** (Play Asset Delivery; same `AssetManager` paths, so `AssetRouter` keeps working) — `build_aab.py` warns above
200 MB.

Tools added: **bundletool 1.18.1** (`bundletool-all-1.18.1.jar` from github.com/google/bundletool releases, SHA-256
`675786493983787ffa11550bdb7c0715679a44e1643f3ff980a529e9c822595c`; Google's Maven host is unreachable here, so the hash
is pinned on first download, there is no second source to compare it with), and for the checks the AOSP Android 16
framework jar `org.robolectric:android-all:16-robolectric-13921718` (Maven Central; its `.sha1`/`.sha256` matched;
SHA-256 `8b74a0a1…3f682d`). aapt2 is still apktool 3.0.3's (2.20); its bundled framework resources are Android 16
(API 36), so `appCategory` and `enableOnBackInvokedCallback` link normally.

## 4. Keys

| key | file (all in `frost-village/dist/`, git-ignored) | used for |
|---|---|---|
| **upload key** | `play/snowbloom-upload.p12` + `play/snowbloom-upload.txt` (alias `upload`, password) + `play/snowbloom-upload-certificate.pem` | signs every `.aab`; Play checks it on upload. Made once by `build_aab.py` (RSA 4096, SHA256withRSA, 30 years, `CN=Snowbloom Village upload key`), never replaced (the build refuses to make a second one if the `.txt`/`.pem` exist without the `.p12`). Certificate SHA-256 `8d1098e85c941836…` (full value in `snowbloom-upload.txt` and the build `.json`). |
| **test key** | `apk/snowbloom-test.p12` + `apk/snowbloom-test.txt` | every sideloaded test APK, the universal APK — and, if the route below is taken, the **app signing key** Play signs with. Cert SHA-256 `B1:D3:10:4B:7A:CD:29:31:06:1D:2B:96:FA:FD:0C:5C:C5:29:36:14:1B:B5:B5:F0:62:18:D5:D3:4C:D5:7D:AF`. |

Back up `dist/play/` (the `.p12` and the `.txt`) somewhere private outside the repository. The upload key can be reset
through Play Console if lost; the app signing key cannot be replaced for existing installs.

**Keeping the designer's save (the clean route).** The phone has the 4.2 test APK (versionCode 4021) signed with the test
key, with a long save in the WebView's storage. Android installs an update only with the same signing key, and Play
delivers APKs signed with its app signing key. So **before the first upload**, in Play Console's app-signing setup, pick
"use a different / existing app signing key" → "Export and upload a key from Java keystore", download the **PEPK tool**
and the **encryption public key**, and run:

```
bash frost-village/tools/apk/export_signing_key.sh --pepk <pepk.jar> --encryption-key <encryption_public_key.pem>
#   -> frost-village/dist/play/snowbloom-app-signing-key.zip  (upload it there; also upload
#      frost-village/dist/play/snowbloom-upload-certificate.pem as the upload key certificate)
```

The upload certificate step is **not optional with this pipeline**: `build_aab.py` always signs the `.aab` with the upload
key, so if Play is left to use the app signing key as the upload key, every bundle from `release_from_commit.sh` would be
refused as signed with the wrong key (the fix then is an upload-key reset request, or signing the `.aab` with the test
key, which `build_aab.py` has no option for).

The script checks the keystore, alias and password (`keytool`), prints the certificate fingerprint to compare with what
Play Console shows afterwards, checks the encryption key (RSA public key PEM; the older console's hex string also
works), refuses to overwrite, checks the output is git-ignored, prints the exact PEPK command
(`java -jar pepk.jar --keystore=… --alias=snowbloom-test --output=… --include-cert --rsa-aes-encryption
--encryption-key-path=…`) and runs it; PEPK asks for the passwords itself (the `store/key password` line of
`snowbloom-test.txt`). Then the first Play build (4.2.1 = 4022 > 4021) installs **over** the test app and the save stays.
The universal APK of every bundle is signed with the same key, so it carries the certificate Play's APKs will carry.

**Dry run** (`--dry-run`): a throw-away RSA-4096 key stands in for Play's; keystore/alias/password/encryption-key checks
pass and the PEPK command is printed. **PEPK itself could not be run here**: it is only offered from
`www.gstatic.com`, which this machine cannot reach, and it is not on Maven Central (a copy from a third-party mirror was
not used: it would handle the signing key). The script's PEPK step was exercised with a stand-in jar that only records
its arguments (proves the invocation and the zip handling, not PEPK). The lead (or the designer, per
`docs/store/플레이스토어_등록안내.md` §3) runs the real thing with the console's own `pepk.jar`.

**Risk of this route — decide knowingly.** The test key's keystore password is not secret: it is in the public
repository (`tools/apk/build_apk.py`, `KEY_PASS`, since the first test APK). The key itself never left `dist/` and the
backup zip, but once it is the app signing key, **whoever holds any copy of `snowbloom-test.p12` (or
`snowbloom-앱열쇠-보관용.zip`) can sign APKs that Android accepts as updates of the Play app.** Keep every copy private;
consider re-wrapping it in a new keystore with a strong password (same key and certificate, so nothing changes for Play
or the phone: `keytool -importkeystore`) and destroying the old copies. Its certificate also says
`CN=Snowbloom Village TEST ONLY` (users never see it). The other route — let Google generate the app signing key — is
the default and simpler, but then the designer must uninstall the test app and **the save is lost** (the game has no
save export yet; a "save code" export/import in the game would remove this trade-off for good).

## 5. Checks — dry run on `aa169bd` (published v4.2), `4.2-play-dryrun` / versionCode 1

`RELEASE_WORK=<scratch>/play_rel_run APK_PY=<venv>/bin/python bash frost-village/tools/apk/release_from_commit.sh aa169bd 4.2-play-dryrun 1 --check`

All green, 5 min 56 s on the shared 4-core box (load ~10):

| step | result |
|---|---|
| artifact build (worktree of `aa169bd`) | ok, 413 files |
| `dist/play/snowbloom-4.2-play-dryrun.aab` | **62,979,197 bytes (60.06 MB)**, SHA-256 `704f3701c262d1c4b250bef5328d9e00f594b92a8b009d87da33e0a5705fa84f`; `bundletool validate` ok (one module, `base`); jar-signed by the upload key (signer = `snowbloom-upload-certificate.pem`, `8d1098e8…a834a9`); bundle manifest: package, `4.2-play-dryrun` (1), minSdk 24, targetSdk 36, appCategory game, enableOnBackInvokedCallback true, no debuggable |
| `…-universal.apk` | **63,134,130 bytes (60.21 MB)**, SHA-256 `5d079667245f0a7af62d6b0219a4d80322129b20f0bd62b4760f55f48fbe6fe7`; apksig (API 24–36): verified, **v2 + v3** (no v1: bundletool leaves it out at minSdk 24), signer = test key `b1d3104b…57daf`; 439 entries, 336 stored and all aligned |
| Play download size | **62.9 MB** (`bundletool get-size total`, min = max: no splits) — limit for the base 200 MB |
| `validate_apk.py` (androguard) on the universal APK | **44/44**: targetSdk 36, versionCode 1, VIBRATE + INTERNET only, not debuggable, appCategory game, back flag, WEB_DEBUG false, launcher/icons/theme, only app classes (15) incl. `Api33$BackCallback.onBackInvoked` and `GameFrame.onApplyWindowInsets`, v2 cert, `resources.arsc` stored, alignment, **all 413 game files byte-identical to the artifact build** |
| `api36_check.py` | **26/26**: the 4 app sources compile against the Android 16 framework alone; 9 stubs match member by member (incl. `BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE` = 2, `PRIORITY_DEFAULT` = 0); 8 reflective lookups exist and are public; `CUTOUT_MODE_ALWAYS` = 3, `IMMERSIVE_STICKY` = 0x1000; overrides `onApplyWindowInsets`, `onRenderProcessGone`, `onBackInvoked` exist with the app's exact descriptors |
| `boot_test.mjs` on the universal APK | **PASS 16/16**: virtual origin (secure, standards mode, localStorage, no AI host API), title in 4.2 s (WebGL), new game, sound unlocked, 81 s of touch play (net → grill → shelf → register, coins 0 → 12), resident chat by real taps in the offline voice, exit save on `pagehide` (1,337 bytes), reload → same coins, 0 page/console errors, 0 failed requests, 0 404, nothing off-origin |

Reports: `dist/play/snowbloom-4.2-play-dryrun.json` (build), `.validate.json` (androguard), `boot_test_4.2-play-dryrun/`
(screenshots + `boot_test.json`), `snowbloom-4.2-play-dryrun.DO-NOT-UPLOAD.txt`. The first full run of the command
was stopped by my own edit of the running script (bash reads scripts as it goes); the two runs after it passed
end to end (the second after the last code change, `setDisplayCutout(null)`).

**MainActivity under Robolectric** (`tools/apk/test/robolectric`, Robolectric 4.17 — the real Android framework code on
a JVM): **8/8 pass** — on **Android 16 and Android 14**: the window is edge-to-edge with cutout mode ALWAYS, keep-screen-on
and adjustResize kept, bars behaviour "transient by swipe", the game loaded from the virtual origin; the root pads by a
96 px cutout (top) and a 900 px keyboard (bottom) while **the WebView receives `Insets.NONE`** for bars/cutout/keyboard
and no `DisplayCutout`,
padding returns when the keyboard closes, visible bars pad and schedule the re-hide; with
`enableOnBackInvokedCallback` the window's **top `OnBackInvokedCallback` is the game's**, invoking it shows
「게임을 끝낼까요?」 once (a second back does not stack a dialog), 끝내기 fires `pagehide` and closes after it; 계속하기
keeps playing. On **Android 10**: the old flags (FULLSCREEN | HIDE_NAVIGATION | IMMERSIVE_STICKY), cutout mode DEFAULT,
the root does not pad itself, `onBackPressed()` shows the dialog. (Robolectric needs a few `androidx.test` classes that
only exist on Google's Maven host; `src/test/java/androidx/test/**` are minimal test-only stand-ins with the same names.)

Also built with the new code (before the last `setDisplayCutout(null)` change): a **targetSdk 36 sideload test APK** (`build_apk.py … 4.2-t36-dryrun 2 --internet`, to
scratch, not sent): `validate_apk.py --internet --web-debug true` 44/44, v1 + v2 with the test certificate
`b1d3104b…57daf` — the same certificate as the universal APK, i.e. the same app.

## 6. Limits — what needs a real phone

- **Not run on a device or emulator** (none here). Covered off-device: real aapt2/bundletool output, androguard, apksig,
  the Java compiled against the real Android 16 framework, MainActivity executed by Robolectric on Android 16/14/10, the
  packed game played in Chromium through the app's own router.
- **Edge-to-edge on a notched phone**: the cutout padding, the night-blue strip above the game, the keyboard lifting
  the chat box, and bars that come back on some OEM keyboards — Robolectric fed synthetic insets; a real phone (ideally
  the designer's, Android 14–16, punch-hole camera) should confirm. The page's own `env(safe-area-inset-*)` should read
  0 in the app (`chrome://inspect` is off in Play builds — check on a sideloaded test APK).
- **Predictive back on Android 16**: the gesture shows the dialog (verified at the dispatcher level); the system's
  back-swipe animation itself is device-only.
- **Tablets / foldables**: `appCategory="game"` keeps portrait on ≥ 600 dp screens per the Android 16 docs; not seen
  on hardware.
- **PEPK** not run (above). **Play Console** steps, the 200 MB / 4 GB size table and the listing rules come from the
  brief and docs I could not open here.
- `boot_test.mjs` runs the universal APK's files in desktop Chromium (not Android WebView), as for the test APKs.

## 7. Files

| path | what |
|---|---|
| `tools/apk/build_aab.py` | **new** — artifact → signed `.aab` + universal APK + checks; makes the upload key once |
| `tools/apk/release_from_commit.sh` | **new** — one command: commit → worktree → artifact → `.aab` (→ `--check`) |
| `tools/apk/export_signing_key.sh` | **new** — test key → PEPK zip for Play App Signing (`--dry-run`) |
| `tools/apk/build_apk.py` | targetSdk 36, manifest flags, `--no-web-debug`, proto-format resources for the bundle |
| `tools/apk/apk_from_commit.sh` | comment only (targetSdk 36, same app as the bundle) |
| `tools/apk/android/AndroidManifest.xml` | `appCategory="game"`, `enableOnBackInvokedCallback="true"`, WEB_DEBUG meta-data |
| `tools/apk/android/java/com/snowbloom/village/MainActivity.java` | `GameFrame` insets, Android 11+ bars, back → `askToExit()` |
| `tools/apk/android/java/com/snowbloom/village/Api30.java`, `Api33.java` | **new** — edge-to-edge / insets / bars; back callback |
| `tools/apk/android/stubs/android/{view,graphics,window}/…` | **new** compile-only stubs (never packed) |
| `tools/apk/signer/SignApk.java` | `verify` also reports v3 (newer apksig) |
| `tools/apk/test/validate_apk.py` | targetSdk 36 default, debuggable, appCategory, back flag, WEB_DEBUG, `--no-v1`, `--version-code` |
| `tools/apk/test/api36_check.py` | **new** — the Java against the Android 16 framework |
| `tools/apk/test/robolectric/` | **new** — Maven project: `MainActivityTest` (Android 16/14/10) + androidx.test stand-ins |
| `tools/apk/README.md`, `docs/build_reports/play.md` | docs |
| `dist/play/…` (git-ignored) | upload key (+ `.txt`, `.pem`), the dry-run `.aab` + universal APK + reports, `boot_test_4.2-play-dryrun/` |

---

## 한국어 요약 (디자이너용)

- **무엇을 했나요**: 게임을 구글 플레이에 올릴 수 있는 형태(**AAB**)로 만드는 도구를 완성했어요. 2026년 8월 31일부터
  플레이는 **안드로이드 16(API 36) 대상**만 받아서, 앱을 그 기준에 맞췄어요.
  - 화면: 요즘 휴대폰의 **카메라 구멍(노치)·상태 표시줄 밑으로 게임이 들어가지 않게** 했어요. 수다 창에서 키보드가
    올라오면 게임 화면이 키보드 위로 줄어드는 것도 그대로예요.
  - 뒤로 가기: 안드로이드 16의 새 「뒤로 가기 제스처」에서도 「게임을 끝낼까요?」 창이 그대로 떠요.
  - 태블릿·폴더블에서도 세로 화면이 유지되게 "게임"으로 표시했어요.
- **올릴 파일**: 버전마다 명령 하나로 `dist/play/snowbloom-4.2.1.aab`(버전 번호 4022)가 만들어지고, 자동 검사도 같이
  돌아요. 이번에 시험으로 만든 `snowbloom-4.2-play-dryrun.aab`는 **연습용이라 절대 올리면 안 돼요.**
- **열쇠(서명 키)**: 플레이에 올릴 때 쓰는 **업로드 키**를 새로 만들어 비공개 폴더(`dist/play/`)에 두었어요.
  인증서 파일 `snowbloom-upload-certificate.pem`은 Play Console이 달라고 할 때 올리면 돼요. 키 파일과 비밀번호는
  문서나 채팅에 적지 않아요.
- **지금 휴대폰의 저장 기록을 살리려면**: 첫 AAB를 올리기 **전에** Play Console의 앱 서명 화면에서 「다른 키 사용 →
  Java 키 저장소에서 내보내기(PEPK)」를 고르고, 거기서 받는 **PEPK 도구**와 **암호화 공개 키**를 보내 주세요.
  그러면 지금 테스트 앱의 열쇠를 플레이용 열쇠로 등록하는 파일을 만들어 드려요. 그 뒤 플레이 버전(4.2.1)이
  테스트 앱 **위에 업데이트로** 설치되고 저장이 그대로 남아요. 단, 그때부터 테스트 키가 진짜 열쇠가 되니
  `snowbloom-앱열쇠-보관용.zip`을 다른 사람에게 주지 말고 안전하게 보관해 주세요. 구글이 새 열쇠를 만들게 하면
  더 간단하지만 테스트 앱을 지워야 하고 **저장이 처음부터** 시작돼요.
- **12명 비공개 테스트를 해야 하나요?** 사업자 등록 여부가 아니라 **플레이 개발자 계정 종류**로 정해져요.
  **조직(Organization) 계정**이거나 **2023년 11월 13일 이전에 만든 개인 계정**이면 비공개 테스트 없이 바로 프로덕션
  출시를 신청할 수 있어요(검토는 있어요). **그 뒤에 만든 개인 계정**이면 개인사업자라도 테스터 12명·14일 비공개
  테스트를 거쳐야 해요(새 앱마다라는 경험담이 많아요). Play Console **설정 → 개발자 계정 → 계정 세부정보**의 「계정
  유형」과, 새 앱 대시보드에 「프로덕션 액세스 신청」 단계가 보이는지로 확인하세요. 자세한 순서는
  `docs/store/플레이스토어_등록안내.md`에 있어요. (구글 고객센터 페이지는 이 작업 환경에서 열리지 않아 공식 문구를
  이번에 다시 확인하지는 못했어요.)
- **실제 휴대폰에서 꼭 봐 주세요**: 노치 아래로 게임이 내려와 있는지, 수다 키보드가 입력칸을 가리지 않는지, 뒤로
  가기 제스처에 「게임을 끝낼까요?」가 뜨는지. 여기서는 휴대폰 없이 할 수 있는 검사를 모두 통과했어요.
