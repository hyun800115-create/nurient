# tools/apk — Android app of 행복한 눈꽃마을 이야기 (test APKs + Google Play bundles)

Wraps the artifact build (`dist/artifact`) in a small Android app: one full-screen WebView that serves the game from
`https://appassets.androidplatform.net/` out of the APK. Package `com.snowbloom.village`, minSdk 24, **targetSdk 36**
(Google Play's rule for new apps and updates from 31 Aug 2026). No Android SDK needed (tools from Maven Central and
Google's GitHub releases, pinned by SHA-256).

```
# Google Play: a signed .aab from any commit, without touching the working tree (+ all checks):
APK_PY=<venv with androguard>/bin/python bash frost-village/tools/apk/release_from_commit.sh <commit> 4.2.1 4022 --check
#   -> frost-village/dist/play/snowbloom-4.2.1.aab (+ .sha256, .json) and snowbloom-4.2.1-universal.apk (+ .sha256)

# sideloaded test APK (same app, same test key) from any commit:
APK_EXTRA=--internet bash frost-village/tools/apk/apk_from_commit.sh <commit> 4.2.1 4022 --check

# or from an existing artifact build:
python3 frost-village/tools/apk/build_aab.py frost-village/dist/artifact frost-village/dist/play/snowbloom-4.2.1.aab 4.2.1 4022
python3 frost-village/tools/apk/build_apk.py frost-village/dist/artifact frost-village/dist/apk/snowbloom-v4.2.1-test.apk 4.2.1 4022 --internet
```

- **versionCode only goes up**, on Play and on the phone alike: 4.1 = 4010, 4.2 = 4020/4021, **4.2.1 = 4022**. A
  versionCode used once on Play can never be uploaded again. A file whose versionName contains `dryrun` gets a
  `.DO-NOT-UPLOAD.txt` next to it: never upload it.
- **Keys** (all under `frost-village/dist/`, git-ignored; keep copies outside the repository, never commit them):
  - `dist/play/snowbloom-upload.p12` (+ `.txt` with alias and password, + `snowbloom-upload-certificate.pem`): the
    Play **upload key**, made by the first `build_aab.py` run (RSA 4096, 30 years), never replaced. Every `.aab` is
    signed with it.
  - `dist/apk/snowbloom-test.p12` (+ `.txt`): the **test key** of every sideloaded APK. The designer's phone has the
    4.2 test APK with a long save; only an update signed with this key installs over it. To keep that save when the
    game moves to Play, give this key to Play as the app signing key **before the first upload**:
    `bash frost-village/tools/apk/export_signing_key.sh --pepk <pepk.jar> --encryption-key <encryption_public_key.pem>`
    (both files come from Play Console's "use an existing app signing key" page; `--dry-run` checks everything up to
    PEPK). The universal APK made from each bundle is signed with this key, i.e. it is the APK Play would deliver.
- **마을 옮기기 (Move village)**: the game's own pages get `window.SnowbloomAndroid` (`android/java/.../WebBridge.java`:
  `copy(text)`, `share(text)` = the phone's share sheet with the village code, `paste()`), refused on any other page; no
  new permission. The game side is `src/core/Transfer.js` + `src/scenes/MovePanel.js` (settings → 마을 옮기기).
- **Sound only while the game is on screen** (4.2.0.1): WebView.onPause() hides the page but never blurs it, and the
  game used to go quiet only on blur, so the music played on behind Home, another app, the lock screen and the exit
  dialog. `MainActivity` now tells the page itself (`window.__fvApp.pause('android')` / `resume('android')`,
  `src/core/Audio.js`; the page also reads `SnowbloomAndroid.audioAllowed()` as it boots): silent from the start of
  `onPause` (before `WebView.onPause()`; `pauseTimers()` waits until the page says its AudioContext has really stopped,
  asked every 100 ms, 0.4-2 s), while 「게임을 끝낼까요?」 is open (계속하기 / back bring the sound back, 끝내기 keeps it
  silent), on a lock screen the app was resumed under (until the window has the focus), and while audio focus is lost
  (a call, an alarm, another app's music). A renderer rebuilt in the background starts hidden and silent and gets its
  own `pauseTimers()`. Audio focus (`USAGE_GAME`) is held only while the game's music setting is on
  (`SnowbloomAndroid.gameMusic(on)`, reported by the page as it boots, before any music): with the music off, a
  player's own music app keeps playing. It is asked for when the game can be heard (not under the lock screen or the
  exit dialog) and given back on every pause. After another app's music took it for good, a tap on the game (or the
  notification shade closing) asks again once no other app is playing music; a refusal during a call (Android 7 has no
  DELAYED; also KakaoTalk-style voice calls) keeps the game silent until a tap after the call. The volume keys set the
  media volume (`setVolumeControlStream`). The WebView lets sound start without a tap
  (`setMediaPlaybackRequiresUserGesture(false)`), and the game starts its sound as it boots there, so the title's intro
  plays its music and sounds untouched (a browser that wants a tap keeps the tap-to-start). No new permission.
  `test/validate_apk.py` fails an APK whose packed `game.js` lacks these hooks (built from a game older than the fix).
- The INTERNET permission is in every build sent so far (and in Play bundles by default; `AAB_EXTRA=--no-internet`).
  WebView remote debugging (`chrome://inspect`) is on in test APKs and off in Play bundles.
- `--check` needs androguard (`APK_PY=<venv>/bin/python`; keep that venv off PATH: the artifact build needs the system
  `python3` with Pillow) and downloads the Android 16 framework jar once (~200 MB, for `test/api36_check.py`).

Checks: `test/validate_apk.py` (androguard: manifest, targetSdk 36, permissions, not debuggable, appCategory,
back-callback flag, classes, signatures, alignment, every game file byte-identical), `test/api36_check.py` (the Java
against the real Android 16 framework: compile, every stub member, every reflective lookup), `test/boot_test.mjs`
(headless Chromium through the app's own `AssetRouter`: title, new game, 60 s of touch play, offline resident chat,
exit save, reload), `test/AssetServer.java --selftest`, and `test/robolectric/` (MainActivity on Android 16, 14 and 10
under Robolectric: edge-to-edge insets, back callback, exit dialog, the 마을 옮기기 bridge, the game's sound across
pause / resume / lock screen / exit dialog / audio focus / a renderer rebuilt in the background, in the order the
WebView gets the calls, sound without a tap;
`mvn -q -f frost-village/tools/apk/test/robolectric/pom.xml test`). The page side of the game's sound:
`node frost-village/tools/test/bgaudio.mjs`.

Reports: `frost-village/docs/build_reports/play.md` (the Play pipeline, keys, limits, Korean summary) and
`frost-village/docs/build_reports/apk.md` (the APK pipeline and the designer's Korean install guide).
