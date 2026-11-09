#!/usr/bin/env python3
"""Play release guard (tools/apk/play_release.json): run by release_from_commit.sh (AAB) and apk_from_commit.sh
(preview APK) before and after a build, so a bundle never goes out with a used versionCode or the wrong upload key.

  play_codes.py check-aab <code>              versionCode above every Play code; the upload key's certificate in
                                              dist/play is the one Play accepted (sha1 in play_release.json);
                                              prints '--universal-key upload' when the test key is missing
  play_codes.py record-aab <code> <name> <commit>
  play_codes.py check-preview <code>          versionCode above every preview code
  play_codes.py record-preview <code> <name> <commit>
ALLOW_OLD_CODE=1 skips the versionCode check (a rebuild of a code that never reached Play).
Never prints a password or key material: it only reads the public certificate (.pem) with keytool.
"""
import datetime
import json
import os
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
FV = HERE.parent.parent
CFG = HERE / 'play_release.json'


def load():
    return json.loads(CFG.read_text(encoding='utf-8'))


def save(c):
    CFG.write_text(json.dumps(c, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def die(msg):
    print('[play] ' + msg, file=sys.stderr)
    sys.exit(2)


def sha1_of_pem(pem):
    out = subprocess.run(['keytool', '-printcert', '-file', str(pem)], capture_output=True, text=True).stdout
    m = re.search(r'SHA1:\s*([0-9A-F:]+)', out)
    return m.group(1) if m else None


def check_code(c, key, code):
    used = [int(q['code']) for q in c.get(key, [])]
    if code in used and os.environ.get('ALLOW_OLD_CODE') != '1':
        die('versionCode %d was already used (%s): take %d' % (code, key, max(used) + 1))
    if used and code <= max(used) and os.environ.get('ALLOW_OLD_CODE') != '1':
        die('versionCode %d is not above the last one (%d in %s): take %d' % (code, max(used), key, max(used) + 1))


def record(c, key, code, name, commit):
    lst = c.setdefault(key, [])
    if not any(int(q['code']) == code for q in lst):
        lst.append({'code': code, 'name': name, 'date': datetime.date.today().isoformat(), 'commit': commit[:10]})
        save(c)


def main(a):
    if len(a) < 2:
        print(__doc__)
        sys.exit(2)
    cmd, code = a[0], int(a[1])
    c = load()
    if cmd == 'check-aab':
        check_code(c, 'playCodes', code)
        pem = FV / 'dist' / 'play' / 'snowbloom-upload-certificate.pem'
        p12 = FV / 'dist' / 'play' / 'snowbloom-upload.p12'
        if not p12.exists() or not pem.exists():
            die('the upload key is not in dist/play (lost with the container?): restore snowbloom-upload.p12 / .txt / '
                '-certificate.pem from the designer\'s backup — never make a new one (Play would refuse it)')
        got, want = sha1_of_pem(pem), c['uploadKey']['sha1']
        if got != want:
            die('dist/play holds another upload key (%s), Play accepts %s: restore the right one' % (got, want))
        if not (FV / 'dist' / 'apk' / 'snowbloom-test.p12').exists():
            print('--universal-key upload')
    elif cmd == 'record-aab':
        record(c, 'playCodes', code, a[2], a[3] if len(a) > 3 else '')
    elif cmd == 'check-preview':
        check_code(c, 'previewCodes', code)
    elif cmd == 'record-preview':
        record(c, 'previewCodes', code, a[2], a[3] if len(a) > 3 else '')
    else:
        die('unknown command ' + cmd)


if __name__ == '__main__':
    main(sys.argv[1:])
