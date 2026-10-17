# tools/apk — Android test APK of 행복한 눈꽃마을 이야기

Wraps the artifact build (`dist/artifact`) in a small Android app: one full-screen WebView that serves the game from
`https://appassets.androidplatform.net/` out of the APK. No Android SDK needed (tools from Maven Central, pinned).

```
# from any commit, without touching the working tree (+ boot test and androguard checks):
bash frost-village/tools/apk/apk_from_commit.sh <commit> 4.2 4020 --check

# or from an existing artifact build:
python3 frost-village/tools/apk/build_apk.py frost-village/dist/artifact frost-village/dist/apk/snowbloom-v4.2-test.apk 4.2 4020
```

- The builds sent to the designer include the INTERNET permission (`APK_EXTRA=--internet` for `apk_from_commit.sh`,
  `--internet` for `build_apk.py`), which removes the one WebView behaviour that was never tested on a device. Run the
  androguard check from a venv with `APK_PY=<venv>/bin/python` (do not put that venv on PATH: the artifact build needs
  the system `python3` with Pillow).
- versionCode only goes up (4.1 = 4010, 4.2 = 4020, rebuilds +1).
- Sign every build with the same test key, `frost-village/dist/apk/snowbloom-test.p12` (made on the first run;
  `dist/` is not in git, keep a copy). Another key = the designer must uninstall first = the save is lost.

Checks: `test/validate_apk.py` (androguard, structure), `test/boot_test.mjs` (headless Chromium through the app's own
`AssetRouter`: title, new game, 60 s of touch play, offline resident chat, exit save, reload), `test/AssetServer.java
--selftest`. Full report, limits and the designer's Korean install guide: `frost-village/docs/build_reports/apk.md`.
