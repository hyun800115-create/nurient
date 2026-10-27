#!/usr/bin/env bash
# 행복한 눈꽃마을 이야기 (Snowbloom Village) — one command: a Google Play release bundle from any commit, without
# touching the working tree.
#
#   bash frost-village/tools/apk/release_from_commit.sh <commit> <versionName> <versionCode> [--check]
#   e.g. bash frost-village/tools/apk/release_from_commit.sh <v4.2.1 commit> 4.2.1 4022 --check
#
# 1. git worktree of <commit> in a temp folder (the working tree, where others edit, is never read or changed)
# 2. node tools/build/build_artifact.mjs --webp --mp3-only inside it
# 3. tools/apk/build_aab.py (from THIS checkout) -> frost-village/dist/play/snowbloom-<versionName>.aab (+ .sha256, .json),
#    signed with the upload key (dist/play/snowbloom-upload.p12, made on the first run), and
#    snowbloom-<versionName>-universal.apk (+ .sha256): the APK Play makes from it, signed with the test key
# 4. with --check: validate_apk.py on the universal APK (androguard: targetSdk 36, permissions, not debuggable,
#    versionCode, every game file identical to the artifact build), test/api36_check.py (the Java against the real
#    Android 16 / API 36 framework classes) and boot_test.mjs on the universal APK (headless Chromium, 60 s of play)
# RELEASE_WORK=<dir> keeps the temp files there (default: a new mktemp folder, removed at the end);
# RELEASE_OUT=<file.aab> sets the output; AAB_EXTRA="..." passes options to build_aab.py; APK_PY=<python> runs
# validate_apk.py (a venv with androguard; keep it off PATH: the artifact build needs the system python3 with Pillow).
set -euo pipefail
[ $# -ge 3 ] || { sed -n '2,19p' "$0"; exit 2; }
COMMIT=$1; NAME=$2; CODE=$3; CHECK=${4:-}
case "$NAME" in *[!A-Za-z0-9._-]*|'') echo "versionName may only use letters, digits, '.', '_' and '-'"; exit 2;; esac
case "$CODE" in *[!0-9]*|'') echo "versionCode must be a whole number"; exit 2;; esac
FV="$(cd "$(dirname "$0")/../.." && pwd)"
REPO="$(git -C "$FV" rev-parse --show-toplevel)"
REL="$(realpath --relative-to="$REPO" "$FV")"           # frost-village
PY=${APK_PY:-python3}
if [ "$CHECK" = "--check" ] && ! "$PY" -c 'import androguard' 2>/dev/null; then
  echo "[release] --check needs androguard: APK_PY=<venv>/bin/python (pip install androguard into that venv)"; exit 2
fi
OWN_WORK=0
if [ -z "${RELEASE_WORK:-}" ]; then RELEASE_WORK="$(mktemp -d)"; OWN_WORK=1; fi
mkdir -p "$RELEASE_WORK"
WT="$RELEASE_WORK/wt-$(date +%s)"
OUT="${RELEASE_OUT:-$FV/dist/play/snowbloom-$NAME.aab}"
UNI="${OUT%.aab}-universal.apk"

git -C "$REPO" worktree add --quiet --detach "$WT" "$COMMIT" >/dev/null
# (an `if`, not `[ … ] && rm`: a false test as the trap's last command would turn a successful run into exit status 1)
cleanup() { git -C "$REPO" worktree remove --force "$WT" >/dev/null 2>&1 || true; if [ "$OWN_WORK" = 1 ]; then rm -rf "$RELEASE_WORK"; fi; }
trap cleanup EXIT
echo "[release] $(git -C "$WT" log --oneline -1)"

if [ -d "$FV/tools/build/node_modules" ]; then
  ln -s "$FV/tools/build/node_modules" "$WT/$REL/tools/build/node_modules"
else
  (cd "$WT/$REL/tools/build" && npm install --no-audit --no-fund)
fi
(cd "$WT/$REL" && node tools/build/build_artifact.mjs --webp --mp3-only | tail -4)

python3 "$FV/tools/apk/build_aab.py" "$WT/$REL/dist/artifact" "$OUT" "$NAME" "$CODE" --work-dir "$RELEASE_WORK/aab" ${AAB_EXTRA:-}

if [ "$CHECK" = "--check" ]; then
  INTERNET=--internet
  case " ${AAB_EXTRA:-} " in *" --no-internet "*) INTERNET=;; esac
  WEBDBG=false
  case " ${AAB_EXTRA:-} " in *" --web-debug "*) WEBDBG=true;; esac
  echo "[release] validate_apk.py (androguard) on $(basename "$UNI")"
  "$PY" "$FV/tools/apk/test/validate_apk.py" "$UNI" --artifact "$WT/$REL/dist/artifact" $INTERNET --target-sdk 36 \
    --version-code "$CODE" --no-v1 --web-debug "$WEBDBG" --json "${OUT%.aab}.validate.json"
  echo "[release] api36_check.py (the app's Java against the Android 16 framework)"
  python3 "$FV/tools/apk/test/api36_check.py" --work "$RELEASE_WORK/api36"
  echo "[release] boot_test.mjs on $(basename "$UNI")"
  node "$FV/tools/apk/test/boot_test.mjs" "$UNI" --out "$FV/dist/play/boot_test_$NAME" --work "$RELEASE_WORK/boot"
fi
echo "[release] done: $OUT"
echo "[release]       $UNI"
