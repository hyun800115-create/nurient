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
- The INTERNET permission is in every build sent so far (and in Play bundles by default; `AAB_EXTRA=--no-internet`).
  WebView remote debugging (`chrome://inspect`) is on in test APKs and off in Play bundles.
- `--check` needs androguard (`APK_PY=<venv>/bin/python`; keep that venv off PATH: the artifact build needs the system
  `python3` with Pillow) and downloads the Android 16 framework jar once (~200 MB, for `test/api36_check.py`).

Checks: `test/validate_apk.py` (androguard: manifest, targetSdk 36, permissions, not debuggable, appCategory,
back-callback flag, classes, signatures, alignment, every game file byte-identical), `test/api36_check.py` (the Java
against the real Android 16 framework: compile, every stub member, every reflective lookup), `test/boot_test.mjs`
(headless Chromium through the app's own `AssetRouter`: title, new game, 60 s of touch play, offline resident chat,
exit save, reload), `test/AssetServer.java --selftest`, and `test/robolectric/` (MainActivity on Android 16, 14 and 10
under Robolectric: edge-to-edge insets, back callback, exit dialog; `mvn -q -f frost-village/tools/apk/test/robolectric/pom.xml test`).

Reports: `frost-village/docs/build_reports/play.md` (the Play pipeline, keys, limits, Korean summary) and
`frost-village/docs/build_reports/apk.md` (the APK pipeline and the designer's Korean install guide).
