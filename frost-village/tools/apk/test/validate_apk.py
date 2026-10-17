#!/usr/bin/env python3
"""Structural checks of a built Snowbloom Village APK with androguard — a parser that has nothing to do with the
tools that built it (aapt2, dx, jarsigner, apksig).

    pip install androguard            (into a virtualenv of its own)
    python3 tools/apk/test/validate_apk.py dist/apk/snowbloom-v4.1-test.apk [--artifact dist/artifact] [--json out.json]

Checks: package / version / SDK levels, the launcher activity and its MAIN+LAUNCHER filter, exported, portrait,
config changes, label and launcher icon resolved through resources.arsc for every density (and the adaptive icon
layers), permissions (no INTERNET), the classes in classes.dex (app classes only, no framework stubs), v1 + v2
signature blocks with the same certificate, zip alignment of stored entries, the packed www/ (full HTML page, every
artifact file present byte for byte). Exit 1 on any failure.
"""
import argparse
import hashlib
import json
import struct
import sys
import zipfile
from pathlib import Path

try:
    from androguard.core.apk import APK
    from androguard.core.dex import DEX
except ImportError:
    sys.exit('androguard is needed: pip install androguard (in a virtualenv)')
try:
    from loguru import logger
    logger.remove()          # androguard logs every step at DEBUG level
except ImportError:
    pass

NS = '{http://schemas.android.com/apk/res/android}'
PKG = 'com.snowbloom.village'
ACT = PKG + '.MainActivity'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('apk', type=Path)
    ap.add_argument('--artifact', type=Path, help='the artifact folder the APK was built from: every file must be in assets/www')
    ap.add_argument('--json', type=Path)
    ap.add_argument('--target-sdk', default='34')
    ap.add_argument('--internet', action='store_true', help='the APK was built with build_apk.py --internet')
    a = ap.parse_args()

    results = []

    def check(name, ok, info=''):
        results.append({'check': name, 'ok': bool(ok), 'info': info})
        print('  %s %s%s' % ('ok  ' if ok else 'FAIL', name, ('  — ' + str(info)) if info != '' else ''))

    apk = APK(str(a.apk))
    check('valid APK (androguard)', apk.is_valid_APK())
    check('package', apk.get_package() == PKG, apk.get_package())
    check('version', bool(apk.get_androidversion_name()) and str(apk.get_androidversion_code()).isdigit(),
          '%s (%s)' % (apk.get_androidversion_name(), apk.get_androidversion_code()))
    check('minSdk 24', str(apk.get_min_sdk_version()) == '24', apk.get_min_sdk_version())
    check('targetSdk ' + a.target_sdk, str(apk.get_target_sdk_version()) == a.target_sdk, apk.get_target_sdk_version())
    check('launcher activity', apk.get_main_activity() == ACT and apk.get_activities() == [ACT], apk.get_main_activity())
    filt = apk.get_intent_filters('activity', ACT)
    check('MAIN + LAUNCHER intent filter', 'android.intent.action.MAIN' in filt.get('action', []) and
          'android.intent.category.LAUNCHER' in filt.get('category', []), filt)

    man = apk.get_android_manifest_xml()
    act = [e for e in man.iter('activity') if e.get(NS + 'name') == ACT][0]
    app = man.find('application')
    check('activity exported (required for targetSdk 31+)', act.get(NS + 'exported') == 'true', act.get(NS + 'exported'))
    check('portrait', act.get(NS + 'screenOrientation') in ('1', 'portrait'), act.get(NS + 'screenOrientation'))
    cc = int(act.get(NS + 'configChanges') or '0', 0)
    check('rotation / resize / keyboard do not restart the game (configChanges)', cc & 0x0080 and cc & 0x0400 and cc & 0x0020, hex(cc))
    check('soft input resizes the window (chat box above the keyboard)', (int(act.get(NS + 'windowSoftInputMode') or '0', 0) & 0xf0) == 0x10,
          act.get(NS + 'windowSoftInputMode'))
    check('single task (the launcher icon returns to the running game)', act.get(NS + 'launchMode') in ('2', 'singleTask'), act.get(NS + 'launchMode'))
    check('hardware accelerated', app.get(NS + 'hardwareAccelerated') == 'true' and act.get(NS + 'hardwareAccelerated') == 'true')
    check('no cleartext traffic', app.get(NS + 'usesCleartextTraffic') == 'false')
    perms = sorted(apk.get_permissions())
    want = sorted(['android.permission.VIBRATE'] + (['android.permission.INTERNET'] if a.internet else []))
    check('permissions: VIBRATE' + (' + INTERNET' if a.internet else ' only (no INTERNET)'), perms == want, perms)

    label = apk.get_app_name()
    check('label', label == '행복한 눈꽃마을 이야기', label)
    res = apk.get_android_resources()
    icon_ref = app.get(NS + 'icon') or ''
    icon_id = int(icon_ref.lstrip('@'), 16)
    configs = res.get_resolved_res_configs(icon_id)
    paths = sorted(v for _, v in configs)
    names = set(apk.get_files())
    check('launcher icon resolves for every density + adaptive', len(paths) >= 6 and all(p in names for p in paths) and
          any('anydpi-v26' in p for p in paths) and all(any(d + '-' in p or p.endswith(d + '/ic_launcher.png') or ('mipmap-' + d) in p for p in paths)
                                                        for d in ('mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi')), paths)
    for layer in ('ic_launcher_foreground', 'ic_launcher_background', 'ic_launcher_round'):
        rid = res.get_res_id_by_key(PKG, 'mipmap', layer)
        lp = sorted(v for _, v in res.get_resolved_res_configs(rid)) if rid else []
        check('mipmap/%s in every density' % layer, rid and all(p in names for p in lp) and len([p for p in lp if p.endswith('.png')]) == 5, lp)
    theme = app.get(NS + 'theme') or ''
    check('application theme resolves', theme.startswith('@') and res.get_resolved_res_configs(int(theme.lstrip('@'), 16)), theme)

    # code
    dexes = list(apk.get_all_dex())
    check('one classes.dex', len(dexes) == 1, len(dexes))
    d = DEX(dexes[0])
    cls = sorted(c.get_name() for c in d.get_classes())
    check('dex version', dexes[0][:8] in (b'dex\n035\0', b'dex\n037\0', b'dex\n038\0', b'dex\n039\0'), dexes[0][:8])
    check('only the app\'s classes (framework stubs not packed)', cls and all(c.startswith('Lcom/snowbloom/village/') for c in cls), cls)
    meths = {(m.get_class_name(), m.get_name()) for m in d.get_methods()}
    client = 'Lcom/snowbloom/village/MainActivity$GameClient;'
    for m in ('shouldInterceptRequest', 'shouldOverrideUrlLoading', 'onRenderProcessGone'):
        check('WebViewClient.%s implemented' % m, (client, m) in meths)
    for m in ('onBackPressed', 'onPause', 'onResume', 'onWindowFocusChanged'):
        check('Activity.%s implemented' % m, ('Lcom/snowbloom/village/MainActivity;', m) in meths)

    # signatures
    check('signed v1 (JAR)', apk.is_signed_v1())
    check('signed v2 (APK Signature Scheme v2)', apk.is_signed_v2())
    try:
        c1 = [hashlib.sha256(c).hexdigest() for c in apk.get_certificates_der_v2()]
        v1c = [hashlib.sha256(c.dump()).hexdigest() for c in apk.get_certificates_v1()]
        check('v1 and v2 use the same certificate', c1 and v1c and set(c1) == set(v1c), c1[:1])
    except Exception as e:          # noqa: BLE001
        check('v1 and v2 use the same certificate', False, repr(e))

    # zip layout
    bad = []
    with open(a.apk, 'rb') as f, zipfile.ZipFile(a.apk) as z:
        infos = z.infolist()
        for i in infos:
            if i.compress_type == zipfile.ZIP_STORED:
                f.seek(i.header_offset)
                h = f.read(30)
                nl, xl = struct.unpack('<HH', h[26:30])
                if (i.header_offset + 30 + nl + xl) % 4:
                    bad.append(i.filename)
        arsc = z.getinfo('resources.arsc')
        check('resources.arsc stored (uncompressed)', arsc.compress_type == zipfile.ZIP_STORED)
        check('every stored entry 4-byte aligned (zipalign)', not bad, bad[:5])
        page = z.read('assets/www/index.html').decode('utf-8')
        check('www/index.html is a full standards-mode page', page.lower().startswith('<!doctype html>') and '<head>' in page and
              'lib/phaser.min.js' in page and 'game.js' in page)
        www = {i.filename[len('assets/www/'):]: i for i in infos if i.filename.startswith('assets/www/')}
        info = '%d files' % len(www)
        ok = len(www) > 100
        if a.artifact:
            src = {p.relative_to(a.artifact).as_posix(): p for p in a.artifact.rglob('*') if p.is_file()}
            missing = sorted(set(src) - set(www))
            extra = sorted(set(www) - set(src))
            differ = [k for k in src if k in www and k != 'index.html' and z.read(www[k]) != src[k].read_bytes()]
            ok = ok and not missing and not extra and not differ
            info += ', vs artifact: missing %d, extra %d, different %d' % (len(missing), len(extra), len(differ))
        check('the game files are all in assets/www', ok, info)

    fails = [r for r in results if not r['ok']]
    print('%s: %d checks, %d failed' % (a.apk.name, len(results), len(fails)))
    if a.json:
        a.json.write_text(json.dumps({'apk': str(a.apk), 'checks': results, 'failed': len(fails)}, ensure_ascii=False, indent=1, default=repr), encoding='utf-8')
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
