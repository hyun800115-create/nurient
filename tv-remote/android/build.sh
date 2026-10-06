#!/usr/bin/env bash
# Builds tv-remote/android/out/btv-tvcode.apk without Gradle or the Android SDK installer.
#
# TOOLS must hold: aapt2 (linux), android.jar (API 34), d8.jar, apksigner.jar, ecj.jar.
# ecj is used instead of javac: JDK 21 javac writes MethodParameters entries this d8 cannot read.
# They came from npm packages because Google's download servers were unreachable:
#   aapt2      <- npm aaptjs3@2.0.2      (package/bin/x64/linux/aapt2)
#   android.jar, d8.jar, apksigner.jar, ecj.jar (ecj-3.45.0.jar) <- npm @drxiaozhi/minapk@0.4.0 (package/tools/)
set -euo pipefail
cd "$(dirname "$0")"
TOOLS="${TOOLS:?set TOOLS to the folder with aapt2, android.jar, d8.jar, apksigner.jar, ecj.jar}"
VERSION_CODE="${VERSION_CODE:-1}"
VERSION_NAME="${VERSION_NAME:-1.0}"
KS_PASS="${KS_PASS:-btvcode2026}"

python3 -I ../src/build_page.py
rm -rf build out && mkdir -p build/gen build/classes build/dex out

"$TOOLS/aapt2" compile --dir res -o build/res.zip
"$TOOLS/aapt2" link -I "$TOOLS/android.jar" --manifest AndroidManifest.xml -A assets \
  --min-sdk-version 21 --target-sdk-version 34 \
  --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" \
  --java build/gen -o build/base.apk build/res.zip

java -jar "$TOOLS/ecj.jar" -nowarn -8 -encoding UTF-8 -cp "$TOOLS/android.jar" -d build/classes \
  $(find src -name '*.java')
java -cp "$TOOLS/d8.jar" com.android.tools.r8.D8 --release --min-api 21 \
  --lib "$TOOLS/android.jar" --output build/dex $(find build/classes -name '*.class')

cp build/base.apk build/unaligned.apk
(cd build/dex && zip -q ../unaligned.apk classes.dex)
python3 -I zipalign.py build/unaligned.apk build/aligned.apk

if [ ! -f release.keystore ]; then
  keytool -genkeypair -keystore release.keystore -storepass "$KS_PASS" -keypass "$KS_PASS" \
    -alias btvcode -keyalg RSA -keysize 2048 -validity 36500 \
    -dname "CN=B tv Code Finder, O=nurient, C=KR"
fi
java -jar "$TOOLS/apksigner.jar" sign --ks release.keystore --ks-pass "pass:$KS_PASS" \
  --ks-key-alias btvcode --out out/btv-tvcode.apk build/aligned.apk
java -jar "$TOOLS/apksigner.jar" verify --verbose out/btv-tvcode.apk
ls -la out/btv-tvcode.apk
