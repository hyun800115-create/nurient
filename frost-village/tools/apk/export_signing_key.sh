#!/usr/bin/env bash
# 행복한 눈꽃마을 이야기 (Snowbloom Village) — hand the TEST signing key to Google Play as the app's signing key
# (Play App Signing, "use an existing app signing key" > "Export and upload a key from Java keystore"), with Google's
# PEPK tool. Why: the designer's phone has the test APK (signed with dist/apk/snowbloom-test.p12) holding a long save.
# Android installs an update only when it is signed with the same key; Play signs what it delivers with its app signing
# key. So the save carries over to the Play version only if that key IS the test key. Decide this before the FIRST
# upload to Play: once Play has generated its own key for the app, this route is closed.
#
#   bash frost-village/tools/apk/export_signing_key.sh --pepk <pepk.jar> --encryption-key <encryption_public_key.pem>
#   bash frost-village/tools/apk/export_signing_key.sh --dry-run [--pepk <pepk.jar>]
#
#   --pepk <jar>            the PEPK tool, from the same Play Console page ("Download PEPK tool"); it is not on Maven
#                           Central. The script prints its SHA-256 and never downloads it.
#   --encryption-key <x>    the encryption public key from that page ("Download encryption public key", a .pem). An
#                           older console shows a long hex string instead: pass the string.
#   --keystore <p12>        default frost-village/dist/apk/snowbloom-test.p12 (password: the "store/key password" line
#   --alias <alias>         of the .txt next to it); default alias snowbloom-test
#   --out <zip>             default frost-village/dist/play/snowbloom-app-signing-key.zip (never overwritten)
#   --dry-run               a throw-away RSA-4096 key stands in for the console's encryption key and the zip goes to a
#                           temp folder that is deleted: proves the keystore, alias, password and the exact PEPK command.
#                           Without --pepk it stops before PEPK (exit 3: "dry run incomplete").
# PEPK asks for the keystore and key passwords itself (both are the same; the script shows where to find them).
# Upload the zip on that Play Console page; it also asks for the upload key certificate:
# frost-village/dist/play/snowbloom-upload-certificate.pem (made by tools/apk/build_aab.py).
set -euo pipefail
FV="$(cd "$(dirname "$0")/../.." && pwd)"
KS="$FV/dist/apk/snowbloom-test.p12"; ALIAS=snowbloom-test; OUT="$FV/dist/play/snowbloom-app-signing-key.zip"
PEPK=""; EK=""; DRY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --pepk) PEPK=$2; shift 2;;
    --encryption-key) EK=$2; shift 2;;
    --keystore) KS=$2; shift 2;;
    --alias) ALIAS=$2; shift 2;;
    --out) OUT=$2; shift 2;;
    --dry-run) DRY=1; shift;;
    -h|--help) sed -n '2,30p' "$0"; exit 0;;
    *) echo "unknown option $1 (see --help)"; exit 2;;
  esac
done
say() { echo "[signing-key] $*"; }
for t in java keytool openssl; do command -v $t >/dev/null || { say "$t not found"; exit 2; }; done
[ -f "$KS" ] || { say "keystore $KS not found (restore it from the backup, snowbloom-앱열쇠-보관용.zip)"; exit 2; }
TXT="${KS%.p12}.txt"
TMP="$(mktemp -d)"; chmod 700 "$TMP"
trap 'rm -rf "$TMP"' EXIT

# the keystore password, for keytool only (into a file only we can read; never printed)
PW_FILE="$TMP/pw"; ( umask 077; : > "$PW_FILE" )
if [ -f "$TXT" ] && grep -qiE '^(store/key password|password):' "$TXT"; then
  grep -iE '^(store/key password|password):' "$TXT" | head -1 | sed -E 's/^[^:]+:[[:space:]]*//' > "$PW_FILE"
else
  say "no password line in $TXT: keytool will ask"; PW_FILE=""
fi
if [ -n "$PW_FILE" ]; then PWARG=(-storepass:file "$PW_FILE"); else PWARG=(); fi
LIST="$(keytool -list -v -keystore "$KS" -storetype PKCS12 "${PWARG[@]}" -alias "$ALIAS" 2>&1 | grep -v '^Picked up')" \
  || { say "keytool could not open alias '$ALIAS' in $KS:"; echo "$LIST" | tail -3; exit 1; }
FP="$(echo "$LIST" | grep -m1 -E '^\s*SHA256:' | sed -E 's/.*SHA256:[[:space:]]*//')"
OWNER="$(echo "$LIST" | grep -m1 '^Owner:' | sed 's/^Owner: //')"
UNTIL="$(echo "$LIST" | grep -m1 'until:' | sed -E 's/.*until: //')"
KEYINFO="$(echo "$LIST" | grep -m1 -E 'Subject Public Key Algorithm' | sed -E 's/.*Algorithm:[[:space:]]*//')"
say "keystore ok: $KS, alias $ALIAS"
say "  certificate: $OWNER, $KEYINFO, valid until $UNTIL"
say "  SHA-256 $FP"
say "  (Play Console shows this fingerprint as the app signing key certificate after the upload: compare them)"

if [ "$DRY" = 1 ]; then
  EK="$TMP/throwaway_encryption_public_key.pem"
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:4096 -out "$TMP/throwaway_private.pem" 2>/dev/null
  openssl pkey -in "$TMP/throwaway_private.pem" -pubout -out "$EK" 2>/dev/null
  OUT="$TMP/out/snowbloom-app-signing-key.zip"; mkdir -p "$TMP/out"
  say "DRY RUN: a throw-away RSA-4096 key stands in for Play's encryption key; the zip goes to a temp folder"
fi
[ -n "$EK" ] || { say "--encryption-key is required (or --dry-run)"; exit 2; }
if [ -f "$EK" ]; then
  KTXT="$(openssl pkey -pubin -in "$EK" -noout -text 2>&1)" || { say "$EK is not a PEM public key"; exit 1; }
  BITS="$(echo "$KTXT" | grep -m1 -oE '[0-9]+ bit' || true)"
  echo "$KTXT" | grep -qiE 'Public-Key|RSA' || { say "$EK: not an RSA public key"; exit 1; }
  say "encryption key ok: $(basename "$EK") (RSA, ${BITS:-? bit})"
  PEPK_ARGS=(--keystore="$KS" --alias="$ALIAS" --output="$OUT" --include-cert --rsa-aes-encryption --encryption-key-path="$EK")
elif echo "$EK" | grep -qE '^[0-9a-fA-F]{64,}$'; then
  say "encryption key: the hex string form (older Play Console page)"
  PEPK_ARGS=(--keystore="$KS" --alias="$ALIAS" --output="$OUT" --include-cert --encryptionkey="$EK")
else
  say "--encryption-key must be the downloaded .pem file or the hex string the console shows"; exit 2
fi

if [ -e "$OUT" ]; then say "$OUT exists: not overwriting it (move it away first)"; exit 1; fi
mkdir -p "$(dirname "$OUT")"
if [ "$DRY" = 0 ]; then
  ( cd "$FV" && git check-ignore -q "$(realpath --relative-to="$FV" "$OUT")" ) \
    || { say "$OUT is not git-ignored: put it under frost-village/dist/"; exit 1; }
fi

CMD="java -jar <pepk.jar> ${PEPK_ARGS[*]}"
say "PEPK command:"
echo "    $CMD"
if [ -z "$PEPK" ]; then
  if [ "$DRY" = 1 ]; then
    say "DRY RUN INCOMPLETE: no --pepk given, so PEPK itself did not run. Everything before it checked out."
    exit 3
  fi
  say "--pepk <pepk.jar> is required (Play Console > Test and release > App integrity > App signing > choose the key > 'Download PEPK tool')"
  exit 2
fi
[ -f "$PEPK" ] || { say "$PEPK not found"; exit 2; }
unzip -tq "$PEPK" >/dev/null 2>&1 || { say "$PEPK is not a jar"; exit 1; }
say "pepk.jar SHA-256 $(sha256sum "$PEPK" | cut -d' ' -f1) ($(stat -c %s "$PEPK") bytes)"
if [ -n "$PW_FILE" ]; then
  say "PEPK will ask for the keystore password and the key password: both are the 'store/key password' line of $(basename "$TXT")"
fi
java -jar "$PEPK" "${PEPK_ARGS[@]}"
[ -s "$OUT" ] || { say "PEPK wrote no $OUT"; exit 1; }
chmod 600 "$OUT"
say "PEPK wrote $(basename "$OUT") ($(stat -c %s "$OUT") bytes):"
unzip -l "$OUT" | sed -n '4,20p' | sed 's/^/    /'
if [ "$DRY" = 1 ]; then
  say "DRY RUN OK: PEPK ran with a throw-away encryption key; the zip is deleted (a real run needs Play's own key)."
else
  say "upload $(realpath "$OUT") on that Play Console page, with the upload key certificate"
  say "  $FV/dist/play/snowbloom-upload-certificate.pem"
  say "the zip holds the app signing key, encrypted for Google: keep it private, delete it after the upload"
fi
