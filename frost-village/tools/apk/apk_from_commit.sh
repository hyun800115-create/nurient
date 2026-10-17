#!/usr/bin/env bash
# 행복한 눈꽃마을 이야기 (Snowbloom Village) — one command: a test APK from any commit, without touching the working tree.
#
#   bash frost-village/tools/apk/apk_from_commit.sh <commit> <versionName> <versionCode> [--check]
#   e.g. bash frost-village/tools/apk/apk_from_commit.sh v42-verified-commit 4.2 4020 --check
#
# 1. git worktree of <commit> in a temp folder (the working tree, where others edit, is never read or changed)
# 2. node tools/build/build_artifact.mjs --webp --mp3-only inside it (esbuild: this checkout's tools/build/node_modules)
# 3. tools/apk/build_apk.py (from THIS checkout) -> frost-village/dist/apk/snowbloom-v<versionName>-test.apk
# 4. with --check: tools/apk/test/boot_test.mjs (headless Chromium, 60 s of play) and, when androguard can be
#    imported (python3 -c 'import androguard'), tools/apk/test/validate_apk.py
# APK_WORK=<dir> keeps the temp files there (default: a new mktemp folder, removed at the end); APK_OUT=<file.apk> sets the output;
# APK_EXTRA="--internet" passes extra options to build_apk.py (and validate_apk.py); APK_PY=<python> runs validate_apk.py
# (e.g. a venv with androguard; keep it off PATH: the artifact build needs the system python3 with Pillow).
set -euo pipefail
[ $# -ge 3 ] || { sed -n '2,13p' "$0"; exit 2; }
COMMIT=$1; NAME=$2; CODE=$3; CHECK=${4:-}
FV="$(cd "$(dirname "$0")/../.." && pwd)"
REPO="$(git -C "$FV" rev-parse --show-toplevel)"
REL="$(realpath --relative-to="$REPO" "$FV")"           # frost-village
OWN_WORK=0
if [ -z "${APK_WORK:-}" ]; then APK_WORK="$(mktemp -d)"; OWN_WORK=1; fi
WT="$APK_WORK/wt-$(date +%s)"
OUT="${APK_OUT:-$FV/dist/apk/snowbloom-v$NAME-test.apk}"

git -C "$REPO" worktree add --detach "$WT" "$COMMIT" >/dev/null
# (an `if`, not `[ … ] && rm`: a false test as the trap's last command would turn a successful run into exit status 1)
cleanup() { git -C "$REPO" worktree remove --force "$WT" >/dev/null 2>&1 || true; if [ "$OWN_WORK" = 1 ]; then rm -rf "$APK_WORK"; fi; }
trap cleanup EXIT
echo "[apk] $(git -C "$WT" log --oneline -1)"

if [ -d "$FV/tools/build/node_modules" ]; then
  ln -s "$FV/tools/build/node_modules" "$WT/$REL/tools/build/node_modules"
else
  (cd "$WT/$REL/tools/build" && npm install --no-audit --no-fund)
fi
(cd "$WT/$REL" && node tools/build/build_artifact.mjs --webp --mp3-only | tail -4)

python3 "$FV/tools/apk/build_apk.py" "$WT/$REL/dist/artifact" "$OUT" "$NAME" "$CODE" --work-dir "$APK_WORK/apk" ${APK_EXTRA:-}

if [ "$CHECK" = "--check" ]; then
  PY=${APK_PY:-python3}
  if "$PY" -c 'import androguard' 2>/dev/null; then
    "$PY" "$FV/tools/apk/test/validate_apk.py" "$OUT" --artifact "$WT/$REL/dist/artifact" ${APK_EXTRA:-}
  else
    echo "[apk] (androguard not installed: skipping validate_apk.py)"
  fi
  node "$FV/tools/apk/test/boot_test.mjs" "$OUT" --out "$FV/dist/apk/boot_test_v$NAME" --work "$APK_WORK/boot"
fi
echo "[apk] done: $OUT"
