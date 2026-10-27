#!/usr/bin/env python3
"""행복한 눈꽃마을 이야기 (Snowbloom Village) — Google Play release: an Android App Bundle (.aab) from the artifact build.

    python3 tools/apk/build_aab.py <artifact dir> <out.aab> <versionName> <versionCode>

    or, from any commit without touching the working tree:  bash tools/apk/release_from_commit.sh <commit> 4.2.1 4022 --check

The same app as the sideloaded test APKs (tools/apk/build_apk.py: package com.snowbloom.village, the WebView of
tools/apk/android, minSdk 24, targetSdk 36), packed the way Google Play takes new apps:

  1. www/ + launcher icons + `aapt2 link --proto-format` (protobuf manifest + resources.pb) + javac/dx (classes.dex)
  2. a base module zip (manifest/, dex/, res/, resources.pb, assets/www/) -> `bundletool build-bundle` with a
     BundleConfig that keeps everything in the one base module (no language / density / ABI / texture splits) and
     stores the pictures and sounds uncompressed in the generated APKs (as build_apk.py does)
  3. `bundletool validate`, then the .aab is signed with the UPLOAD key (JDK jarsigner, SHA-256/RSA):
     dist/play/snowbloom-upload.p12 — made on the first run (RSA 4096, 30 years) with its password in
     dist/play/snowbloom-upload.txt and the certificate Play Console asks for in
     dist/play/snowbloom-upload-certificate.pem. An existing key is never replaced.
  4. `bundletool build-apks --mode=universal` -> <out>-universal.apk: the APK Play would make from this bundle, signed
     with the TEST key (dist/apk/snowbloom-test.p12) — the key Play signs with if it is uploaded as the app signing key
     (tools/apk/export_signing_key.sh), so this APK installs over the designer's test install, keeping the save.
     `bundletool get-size total` on the device-split APKs gives Play's download size.
  5. checks (the build fails on any): bundletool validate; the AAB's jar signature = the upload certificate; the
     bundle manifest (package, versions, SDKs, no debuggable); the universal APK: apksig (API 24..36), aapt2 badging,
     zip alignment, its signer = the test key, every staged game file present with the same size.
  -> <out>.aab, <out>.aab.sha256, <out>-universal.apk (+ .sha256), <out>.json

Tools: build_apk.py's Maven Central set (aapt2 from apktool 3.0.3 — its framework resources are Android 16 / API 36)
plus bundletool 1.18.1 from Google's GitHub releases, pinned by SHA-256. Passwords go to the tools through files in
the work folder (mode 600, deleted afterwards), never on a command line and never printed.
"""
import argparse
import hashlib
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import time
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import build_apk as B  # noqa: E402  (same folder: the shared steps)

FV = B.FV
BUNDLETOOL = ('https://github.com/google/bundletool/releases/download/1.18.1/bundletool-all-1.18.1.jar',
              '675786493983787ffa11550bdb7c0715679a44e1643f3ff980a529e9c822595c')

PLAY_DIR = FV / 'dist' / 'play'
UPLOAD_KS = PLAY_DIR / 'snowbloom-upload.p12'
UPLOAD_ALIAS = 'upload'
UPLOAD_DNAME = 'CN=Snowbloom Village upload key, O=Snowbloom Village, C=KR'
UPLOAD_DAYS = 10950          # 30 years
TEST_KS = FV / 'dist' / 'apk' / 'snowbloom-test.p12'

# Play takes the base module's generated APKs up to a compressed download size limit; 200 MB has been the figure for
# the base / install-time download (developer.android.com/guide/app-bundle: "New apps larger than 200 MB are now
# supported by either Play Feature Delivery or Play Asset Delivery"). Over this, the build warns: move media into
# install-time asset packs.
BASE_DOWNLOAD_WARN = 200 * 1000 * 1000

log = B.log
die = B.die
run = B.run


# ---------------------------------------------------------------- keys
def read_txt_field(path, *names):
    """'name: value' lines of a key .txt (dist/apk/snowbloom-test.txt, dist/play/snowbloom-upload.txt)"""
    if not path.exists():
        return None
    for line in path.read_text(encoding='utf-8').splitlines():
        for n in names:
            if line.lower().startswith(n.lower() + ':'):
                return line.split(':', 1)[1].strip()
    return None


def secret_file(work, name, value):
    """a password file only the owner can read (bundletool file:, jarsigner/keytool :file)"""
    p = work / ('.' + name)
    fd = os.open(str(p), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        f.write(value + '\n')
    return p


def cert_sha256(pem_or_jar, jar=False):
    out = run(['keytool', '-printcert', '-jarfile' if jar else '-file', pem_or_jar])
    m = re.search(r'SHA256:\s*([0-9A-F:]{95})', out)
    return m.group(1).replace(':', '').lower() if m else None


def ensure_upload_key(work):
    """dist/play/snowbloom-upload.p12 (+ .txt with alias/password, + the certificate .pem). Never overwritten."""
    info = UPLOAD_KS.with_suffix('.txt')
    pem = UPLOAD_KS.with_name('snowbloom-upload-certificate.pem')
    if UPLOAD_KS.exists():
        pw = read_txt_field(info, 'password')
        if not pw:
            die('%s exists but its password is not in %s ("password: ..." line): restore that file' % (UPLOAD_KS, info))
        if not pem.exists():                                   # the certificate is public: export it again
            pwf = secret_file(work, 'upload_pw', pw)
            try:
                run(['keytool', '-exportcert', '-rfc', '-keystore', UPLOAD_KS, '-storetype', 'PKCS12', '-storepass:file', pwf,
                     '-alias', UPLOAD_ALIAS, '-file', pem])
            finally:
                pwf.unlink(missing_ok=True)
        return pw, False
    if info.exists() or pem.exists():
        die('%s is missing but %s / %s exist: restore the keystore from your backup (never make a second upload key '
            'by accident)' % (UPLOAD_KS, info.name, pem.name))
    PLAY_DIR.mkdir(parents=True, exist_ok=True)
    pw = secrets.token_urlsafe(24)
    pwf = secret_file(work, 'upload_pw', pw)
    try:
        log('making the Google Play UPLOAD key (RSA 4096, %d days): %s' % (UPLOAD_DAYS, UPLOAD_KS))
        run(['keytool', '-genkeypair', '-keystore', UPLOAD_KS, '-storetype', 'PKCS12', '-storepass:file', pwf,
             '-keypass:file', pwf, '-alias', UPLOAD_ALIAS, '-keyalg', 'RSA', '-keysize', '4096', '-sigalg', 'SHA256withRSA',
             '-validity', str(UPLOAD_DAYS), '-dname', UPLOAD_DNAME])
        os.chmod(UPLOAD_KS, 0o600)
        listing = run(['keytool', '-list', '-v', '-keystore', UPLOAD_KS, '-storetype', 'PKCS12', '-storepass:file', pwf, '-alias', UPLOAD_ALIAS])
        m = re.search(r'SHA256:\s*([0-9A-F:]{95})', listing)
        fp = m.group(1).replace(':', '').lower() if m else '?'
        # the password file first (a keystore without it would be lost), then the public certificate
        fd = os.open(str(info), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.write(
                'GOOGLE PLAY UPLOAD KEY of 행복한 눈꽃마을 이야기 (com.snowbloom.village). tools/apk/build_aab.py signs every .aab with it.\n'
                'keystore: %s (PKCS12)\nalias: %s\npassword: %s\n(the store and the key password are the same)\n'
                'certificate: %s (Play Console > Test and release > App integrity asks for it when it wants the upload key certificate)\n'
                'certificate SHA-256: %s\n\n'
                'PRIVATE. Never commit, mail or paste this file or the .p12. Keep a copy of both somewhere safe (not in the repository).\n'
                'Lost or leaked: with Play App Signing the upload key can be reset through Play Console (account owner request);\n'
                'the app signing key is not affected.\n' % (UPLOAD_KS.name, UPLOAD_ALIAS, pw, pem.name, fp))
        run(['keytool', '-exportcert', '-rfc', '-keystore', UPLOAD_KS, '-storetype', 'PKCS12', '-storepass:file', pwf,
             '-alias', UPLOAD_ALIAS, '-file', pem])
    finally:
        pwf.unlink(missing_ok=True)
    return pw, True


def test_key_password():
    return read_txt_field(TEST_KS.with_suffix('.txt'), 'store/key password', 'password') or B.KEY_PASS


# ---------------------------------------------------------------- bundle
def ensure_bundletool(tools_dir):
    url, sha = BUNDLETOOL
    dst = tools_dir / url.rsplit('/', 1)[1]
    if not dst.exists() or B.sha256_file(dst) != sha:
        log('downloading ' + dst.name + ' (GitHub google/bundletool)')
        B.fetch(url, dst, sha)
    return dst


def bundletool(t, args, **kw):
    return run(['java', '-jar', t['bundletool']] + [str(a) for a in args], **kw)


def bundle_config(path, www):
    """no config splits (one base APK with everything, the same layout as the test APK); media stored uncompressed"""
    stored_ext = sorted({p.suffix.lower() for p in www.rglob('*') if p.is_file() and p.suffix
                         and p.suffix.lower() not in B.DEFLATE_EXT})
    cfg = {
        'optimizations': {
            'splitsConfig': {'splitDimension': [{'value': v, 'negate': True} for v in
                                                ('ABI', 'SCREEN_DENSITY', 'LANGUAGE', 'TEXTURE_COMPRESSION_FORMAT')]},
        },
        'compression': {'uncompressedGlob': ['assets/**%s' % e for e in stored_ext]},
    }
    path.write_text(json.dumps(cfg, indent=1), encoding='utf-8')
    return cfg


def module_zip(dst, res_proto, dex, www):
    """the base module: manifest/AndroidManifest.xml, resources.pb, res/**, dex/classes.dex, assets/www/**"""
    n = 0
    with zipfile.ZipFile(dst, 'w') as z, zipfile.ZipFile(res_proto) as r:
        names = r.namelist()
        for need in ('AndroidManifest.xml', 'resources.pb'):
            if need not in names:
                die('aapt2 --proto-format output has no ' + need)
        z.writestr('manifest/AndroidManifest.xml', r.read('AndroidManifest.xml'), zipfile.ZIP_DEFLATED)
        z.writestr('resources.pb', r.read('resources.pb'), zipfile.ZIP_DEFLATED)
        for name in sorted(names):
            if name in ('AndroidManifest.xml', 'resources.pb'):
                continue
            if not name.startswith('res/'):
                die('unexpected entry in the proto resources: ' + name)
            z.writestr(name, r.read(name), zipfile.ZIP_STORED if name.endswith('.png') else zipfile.ZIP_DEFLATED)
        z.writestr('dex/classes.dex', dex.read_bytes(), zipfile.ZIP_DEFLATED)
        for p in sorted(www.rglob('*')):
            if p.is_file():
                rel = p.relative_to(www).as_posix()
                z.write(p, 'assets/www/' + rel, zipfile.ZIP_DEFLATED if p.suffix.lower() in B.DEFLATE_EXT else zipfile.ZIP_STORED)
                n += 1
    return n


def check_bundle_manifest(t, aab, want):
    xml = bundletool(t, ['dump', 'manifest', '--bundle', aab])
    attr = lambda name: (re.search(r'android:%s="([^"]*)"' % name, xml) or [None, None])[1]
    got = {'package': (re.search(r'package="([^"]+)"', xml) or [None, None])[1], 'versionCode': attr('versionCode'),
           'versionName': attr('versionName'), 'minSdk': attr('minSdkVersion'), 'targetSdk': attr('targetSdkVersion')}
    problems = ['bundle manifest %s=%r, expected %r' % (k, got[k], v) for k, v in want.items() if got[k] != v]
    if re.search(r'android:debuggable="true"', xml):
        problems.append('bundle manifest: android:debuggable="true"')
    for a, ok in (('appCategory', ('game', '0')), ('enableOnBackInvokedCallback', ('true',))):   # appCategory game = enum 0
        if attr(a) not in ok:
            problems.append('bundle manifest android:%s=%r, expected %r' % (a, attr(a), ok[0]))
    return got, problems, xml


def apk_www(apk):
    with zipfile.ZipFile(apk) as z:
        return {i.filename[len('assets/www/'):]: i.file_size for i in z.infolist() if i.filename.startswith('assets/www/')}


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0], formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('artifact', type=Path, help='the artifact build folder (dist/artifact)')
    ap.add_argument('out', type=Path, help='output .aab (the universal APK and reports go next to it)')
    ap.add_argument('version_name', help='e.g. 4.2.1')
    ap.add_argument('version_code', type=int, help='whole number, higher than every one uploaded or installed before (4.2.1 = 4022)')
    ap.add_argument('--tools-dir', type=Path, default=Path(os.environ.get('SNOWBLOOM_APK_TOOLS') or Path.home() / '.cache' / 'snowbloom-apk-tools'))
    ap.add_argument('--icon-dir', type=Path, default=None, help='default: <artifact>/../../assets/title/icon')
    ap.add_argument('--work-dir', type=Path, default=None, help='scratch folder (default: a new temp folder, removed after)')
    ap.add_argument('--no-internet', action='store_true', help='leave out the INTERNET permission (the builds sent so far have it)')
    ap.add_argument('--web-debug', action='store_true', help='turn WebView remote debugging on (off in Play builds)')
    ap.add_argument('--universal-key', choices=('test', 'upload'), default='test',
                    help='key for the universal APK: test (= the app signing key if Play gets the test key; default) or upload')
    a = ap.parse_args()

    t0 = time.time()
    artifact = a.artifact.resolve()
    if not (artifact / 'index.html').exists():
        die('%s/index.html missing' % artifact)
    if a.version_code < 1 or a.version_code > 2100000000:
        die('versionCode must be 1..2100000000')
    icon_dir = (a.icon_dir or artifact.parent.parent / 'assets' / 'title' / 'icon').resolve()
    out = a.out.resolve()
    if out.suffix != '.aab':
        die('the output must end in .aab')
    out.parent.mkdir(parents=True, exist_ok=True)
    stem = out.with_suffix('')
    uni_out = stem.with_name(stem.name + '-universal.apk')
    dry = 'dryrun' in a.version_name.replace('-', '').replace('_', '').lower()
    own_work = a.work_dir is None
    work = Path(tempfile.mkdtemp(prefix='snowbloom-aab-')) if own_work else a.work_dir.resolve()
    work.mkdir(parents=True, exist_ok=True)
    secrets_made = []

    try:
        t = B.ensure_tools(a.tools_dir.resolve())
        t['bundletool'] = ensure_bundletool(a.tools_dir.resolve())
        log('tools ok (%s; bundletool %s)' % (a.tools_dir, bundletool(t, ['version']).strip().splitlines()[-1]))

        upload_pw, new_upload_key = ensure_upload_key(work)
        upload_pem = UPLOAD_KS.with_name('snowbloom-upload-certificate.pem')
        if not TEST_KS.exists():
            die('the test key %s is missing: it signs the universal APK (and the sideloaded test APKs); restore it from the '
                'backup (snowbloom-앱열쇠-보관용.zip) — a new one would not update the installed app' % TEST_KS)

        www = work / 'www'
        files, skipped = B.stage_www(artifact, www)
        hosts = B.remote_refs(www)
        log('www: %d files from %s%s' % (len(files), artifact, (' (skipped %s)' % ', '.join(skipped)) if skipped else ''))
        res_proto, icons = B.build_resources(t, work, icon_dir, a.version_name, a.version_code, not a.no_internet,
                                             web_debug=a.web_debug, proto=True)
        log('resources: aapt2 link --proto-format ok, %d icon files' % len(icons))
        dex, classes = B.build_dex(t, work)
        log('code: %d classes -> classes.dex (%d bytes)' % (len(classes), dex.stat().st_size))

        base = work / 'base.zip'
        n = module_zip(base, res_proto, dex, www)
        cfg_path = work / 'BundleConfig.json'
        cfg = bundle_config(cfg_path, www)
        unsigned = work / 'unsigned.aab'
        unsigned.unlink(missing_ok=True)
        bundletool(t, ['build-bundle', '--modules=' + str(base), '--output=' + str(unsigned), '--config=' + str(cfg_path)])
        validate = bundletool(t, ['validate', '--bundle=' + str(unsigned)])
        log('bundletool validate: ok')

        # sign the bundle with the upload key (Play checks this signature against the registered upload certificate)
        upf = secret_file(work, 'upload_pw', upload_pw)
        secrets_made.append(upf)
        tmp_aab = out.with_suffix('.aab.part')
        tmp_aab.unlink(missing_ok=True)
        run(['jarsigner', '-keystore', UPLOAD_KS, '-storetype', 'PKCS12', '-storepass:file', upf, '-keypass:file', upf,
             '-digestalg', 'SHA-256', '-sigalg', 'SHA256withRSA', '-signedjar', tmp_aab, unsigned, UPLOAD_ALIAS])
        jv = run(['jarsigner', '-verify', tmp_aab])
        aab_signer = cert_sha256(tmp_aab, jar=True)
        upload_fp = cert_sha256(upload_pem)
        bundletool(t, ['validate', '--bundle=' + str(tmp_aab)])

        want = {'package': B.PACKAGE, 'versionCode': str(a.version_code), 'versionName': a.version_name,
                'minSdk': str(B.MIN_SDK), 'targetSdk': str(B.TARGET_SDK)}
        man, problems, man_xml = check_bundle_manifest(t, tmp_aab, want)
        if 'jar verified.' not in jv:
            problems.append('jarsigner -verify on the .aab did not say "jar verified."')
        if not aab_signer or aab_signer != upload_fp:
            problems.append('the .aab is not signed with the upload certificate (%s vs %s)' % (aab_signer, upload_fp))

        # the APKs Play would make: universal (one APK, for testing) and the device split set (for the download size)
        if a.universal_key == 'test':
            ks, alias, kpw = TEST_KS, B.KEY_ALIAS, test_key_password()
        else:
            ks, alias, kpw = UPLOAD_KS, UPLOAD_ALIAS, upload_pw
        kpf = secret_file(work, 'apk_pw', kpw)
        secrets_made.append(kpf)
        sign_args = ['--ks=' + str(ks), '--ks-pass=file:' + str(kpf), '--ks-key-alias=' + alias, '--key-pass=file:' + str(kpf),
                     '--aapt2=' + str(t['aapt2'])]
        uni_apks, split_apks = work / 'universal.apks', work / 'split.apks'
        for p in (uni_apks, split_apks):
            p.unlink(missing_ok=True)
        bundletool(t, ['build-apks', '--bundle=' + str(tmp_aab), '--output=' + str(uni_apks), '--mode=universal'] + sign_args)
        bundletool(t, ['build-apks', '--bundle=' + str(tmp_aab), '--output=' + str(split_apks)] + sign_args)
        size_csv = bundletool(t, ['get-size', 'total', '--apks=' + str(split_apks)]).strip().splitlines()
        dl_min, dl_max = [int(x) for x in size_csv[-1].split(',')[:2]]
        with zipfile.ZipFile(split_apks) as z:
            split_names = sorted(n_ for n_ in z.namelist() if n_.endswith('.apk'))
        with zipfile.ZipFile(uni_apks) as z:
            if 'universal.apk' not in z.namelist():
                die('bundletool made no universal.apk: ' + ', '.join(z.namelist()))
            tmp_uni = uni_out.with_suffix('.apk.part')
            tmp_uni.write_bytes(z.read('universal.apk'))

        B.signer_classes(t, work)                     # apksig's verifier (signer/SignApk.java)
        ver, jar_ok = B.verify(t, work, tmp_uni, apksig_jar=t['bundletool'])   # bundletool's apksig knows v3
        post = B.check_zip(tmp_uni)
        b = B.badging(t, tmp_uni)
        if not ver['verified'] or not ver['v2'] or ver['errors']:
            problems.append('universal APK signature: ' + json.dumps({k: ver[k] for k in ('verified', 'v1', 'v2', 'errors')}))
        signer_fp = (ver.get('signers') or [{}])[0].get('sha256')
        key_out = run(['keytool', '-list', '-v', '-keystore', ks, '-storetype', 'PKCS12', '-storepass:file', kpf, '-alias', alias])
        m = re.search(r'SHA256:\s*([0-9A-F:]{95})', key_out)
        key_fp = m.group(1).replace(':', '').lower() if m else None
        if not signer_fp or signer_fp != key_fp:
            problems.append('universal APK signer %s is not the %s key %s' % (signer_fp, a.universal_key, key_fp))
        if post['misaligned'] or post['crcError']:
            problems.append('universal APK zip: ' + json.dumps(post))
        bwant = dict(want, launchable=B.PACKAGE + '.MainActivity')
        for k, v in bwant.items():
            if b[k] != v:
                problems.append('universal APK badging %s=%r, expected %r' % (k, b[k], v))
        if 'application-debuggable' in b['raw']:
            problems.append('universal APK is debuggable')
        want_perms = sorted(['android.permission.VIBRATE'] + ([] if a.no_internet else ['android.permission.INTERNET']))
        if sorted(b['permissions']) != want_perms:
            problems.append('universal APK permissions %s, expected %s' % (b['permissions'], want_perms))
        packed = apk_www(tmp_uni)
        staged = {p.relative_to(www).as_posix(): p.stat().st_size for p in www.rglob('*') if p.is_file()}
        if packed != staged:
            miss = sorted(set(staged) - set(packed))[:5]
            extra = sorted(set(packed) - set(staged))[:5]
            diff = sorted(k for k in staged if k in packed and packed[k] != staged[k])[:5]
            problems.append('universal APK assets/www differs from the staged game: missing %s extra %s size %s' % (miss, extra, diff))
        if problems:
            die('checks failed:\n  ' + '\n  '.join(problems))

        tmp_aab.replace(out)
        tmp_uni.replace(uni_out)
    finally:
        for p in secrets_made:
            p.unlink(missing_ok=True)

    sums = {}
    for f in (out, uni_out):
        sums[f.name] = B.sha256_file(f)
        (f.parent / (f.name + '.sha256')).write_text('%s  %s\n' % (sums[f.name], f.name))
    with zipfile.ZipFile(out) as z:
        aab_entries = len(z.namelist())
    summary = {
        'aab': out.name, 'sha256': sums[out.name], 'bytes': out.stat().st_size, 'MB': round(out.stat().st_size / 1048576, 2),
        'doNotUpload': dry, 'package': B.PACKAGE, 'versionName': a.version_name, 'versionCode': a.version_code,
        'minSdk': B.MIN_SDK, 'targetSdk': B.TARGET_SDK, 'permissions': b['permissions'], 'webViewDebugging': a.web_debug,
        'appCategory': 'game', 'enableOnBackInvokedCallback': True, 'wwwFiles': n, 'artifact': str(artifact),
        'bundle': {'entries': aab_entries, 'bundletool': BUNDLETOOL[0].rsplit('/', 1)[1], 'config': cfg,
                   'validate': [l for l in validate.strip().splitlines() if not l.strip().startswith('File:')][:12], 'manifest': man},
        'uploadKey': {'keystore': str(UPLOAD_KS), 'alias': UPLOAD_ALIAS, 'certificateSha256': upload_fp,
                      'certificatePem': str(upload_pem), 'madeThisRun': new_upload_key, 'aabSignerSha256': aab_signer},
        'universalApk': {'file': uni_out.name, 'sha256': sums[uni_out.name], 'bytes': uni_out.stat().st_size,
                         'MB': round(uni_out.stat().st_size / 1048576, 2), 'signedWith': a.universal_key,
                         'signerSha256': signer_fp, 'signature': {k: ver.get(k) for k in ('verified', 'v1', 'v2', 'v3', 'checkedSdk', 'warnings')},
                         'zip': post, 'label': b['label'], 'icon': b['icon']},
        'playDownload': {'splitApks': split_names, 'minBytes': dl_min, 'maxBytes': dl_max,
                         'note': 'bundletool get-size total: compressed download size over all device configurations'},
        'remoteHostsMentioned': hosts, 'classes': classes,
        'builtAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'seconds': round(time.time() - t0, 1),
    }
    out.with_suffix('.json').write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding='utf-8')
    if own_work:
        shutil.rmtree(work, ignore_errors=True)
    log('OK %s  %.2f MB  sha256 %s' % (out, summary['MB'], sums[out.name]))
    log('   %s %s (%d)  minSdk %d  targetSdk %d  signed with the upload key (cert SHA-256 %s)'
        % (b['label'], a.version_name, a.version_code, B.MIN_SDK, B.TARGET_SDK, upload_fp[:16] + '…'))
    log('   universal APK %s  %.2f MB, signed with the %s key; Play download %.1f-%.1f MB (limit for the base: 200 MB)'
        % (uni_out.name, summary['universalApk']['MB'], a.universal_key, dl_min / 1e6, dl_max / 1e6))
    if dl_max > BASE_DOWNLOAD_WARN:
        log('   WARNING: the download is over 200 MB: move media into install-time asset packs before uploading')
    if new_upload_key:
        log('   NEW upload key made: back up %s and %s (private!) and keep %s for Play Console'
            % (UPLOAD_KS, UPLOAD_KS.with_suffix('.txt').name, upload_pem.name))
    if dry:
        note = out.with_name(out.stem + '.DO-NOT-UPLOAD.txt')
        note.write_text('%s is a DRY RUN (versionName %s, versionCode %d). Never upload it to Google Play: a versionCode,\n'
                        'once used on Play, can never be used again for this app.\n' % (out.name, a.version_name, a.version_code),
                        encoding='utf-8')
        log('   DRY RUN: never upload %s (see %s)' % (out.name, note.name))


if __name__ == '__main__':
    main()
