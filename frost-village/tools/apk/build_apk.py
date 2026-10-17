#!/usr/bin/env python3
"""행복한 눈꽃마을 이야기 (Snowbloom Village) — build an Android test APK from the artifact build.

    python3 tools/apk/build_apk.py <artifact dir> <out.apk> <versionName> <versionCode>

    e.g.  node tools/build/build_artifact.mjs --webp --mp3-only
          python3 tools/apk/build_apk.py dist/artifact dist/apk/snowbloom-v4.2-test.apk 4.2 4020

    or, from any commit without touching the working tree:  bash tools/apk/apk_from_commit.sh <commit> 4.2 4020 --check

What it makes: one Activity with a full-screen WebView (tools/apk/android) that serves the packed game from
https://appassets.androidplatform.net/ (APK assets/www/), package com.snowbloom.village, minSdk 24, targetSdk 34,
signed v1 (JDK jarsigner) + v2 (apksig) with the test key in dist/apk/ (made on the first run; keep it: an update
must be signed with the same key, or Android refuses to install it over the old one).

No Android SDK is needed (Google's download host is not reachable here). The tools come from Maven Central and are
pinned by SHA-256 (downloaded once into --tools-dir, default ~/.cache/snowbloom-apk-tools or $SNOWBLOOM_APK_TOOLS):
  - com.google.android:android:4.1.1.4        stub android.jar (API 16) to compile the Java against
  - com.jakewharton.android.repackaged:dalvik-dx:16.0.1   the dx dexer (AOSP), classes -> classes.dex
  - org.apktool:apktool-lib:3.0.3             only for its prebuilt aapt2 + android-framework.jar (resources, manifest)
  - com.android.tools.build:apksig:2.3.0      Google's APK signer library: the v2 signature block (signer/SignApk.java)
Also needed: JDK 11+ (javac, java, jarsigner, keytool), python3 with Pillow (launcher icons).

Steps: stage www/ (wrap the body-only page in a full HTML document) -> launcher icons from assets/title/icon ->
aapt2 compile + link (binary manifest, resources.arsc) -> javac + dx -> zip with resources.arsc and media stored and
4-byte aligned -> jarsigner (v1) -> re-align -> apksig (v2) -> checks (alignment, aapt2 dump badging, apksig verify,
jarsigner -verify) -> <out>.sha256, <out>.json.
"""
import argparse
import hashlib
import io
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import time
import urllib.request
import zipfile
import zlib
from pathlib import Path

HERE = Path(__file__).resolve().parent            # frost-village/tools/apk
FV = HERE.parent.parent                             # frost-village
ANDROID = HERE / 'android'

PACKAGE = 'com.snowbloom.village'
MIN_SDK = 24
TARGET_SDK = 34       # >= 30 needs a v2 signature + resources.arsc stored and aligned: both done here
MAX_CHECK_SDK = 36    # apksig verifies the signature for every platform version MIN_SDK..this
ORIGIN = 'https://appassets.androidplatform.net/'

MAVEN = 'https://repo1.maven.org/maven2/'
TOOLS = {
    'android_jar': ('com/google/android/android/4.1.1.4/android-4.1.1.4.jar',
                    '84072541cbb711eff89f7277100ff854929a446dba7ceb1b195c340e0b4fd3cb'),
    'dx_jar': ('com/jakewharton/android/repackaged/dalvik-dx/16.0.1/dalvik-dx-16.0.1.jar',
               '1e4b645628e3bdb097b5331d669e177ef235a551582a8c646dbe36865e541907'),
    'apktool_jar': ('org/apktool/apktool-lib/3.0.3/apktool-lib-3.0.3.jar',
                    '983773879fd89ede2cd938858e3efce2a90ac1123f6a5140e9d949dcf4464e3e'),
    'apksig_jar': ('com/android/tools/build/apksig/2.3.0/apksig-2.3.0.jar',
                   '9637078c0016244e4be0941836295365a7e2e5b164c59cb7885783c40460bfee'),
}

KEY_ALIAS = 'snowbloom-test'
KEY_PASS = 'snowbloom-test-only'        # TEST KEY ONLY — never use it for a store release
KEY_DNAME = 'CN=Snowbloom Village TEST ONLY, OU=Test builds, O=Snowbloom Village, C=KR'

# what is deflated in the APK (text); everything else (pictures, sound, fonts) is stored and 4-byte aligned
DEFLATE_EXT = {'.html', '.htm', '.js', '.mjs', '.json', '.map', '.css', '.txt', '.md', '.svg', '.xml', '.webmanifest', '.wasm'}
JUNK = re.compile(r'(^|/)(\.DS_Store|Thumbs\.db|desktop\.ini)$|(^|/)\.[^/]*$', re.I)
# launcher icon sizes: legacy icon px and adaptive layer px (108 dp) per density
DENSITIES = {'mdpi': (48, 108), 'hdpi': (72, 162), 'xhdpi': (96, 216), 'xxhdpi': (144, 324), 'xxxhdpi': (192, 432)}

DOS_TIME, DOS_DATE = 0, ((2008 - 1980) << 9) | (1 << 5) | 1      # fixed 2008-01-01 00:00: reproducible zips


def log(msg):
    print('[apk] ' + msg, flush=True)


def die(msg):
    print('[apk] ERROR: ' + msg, file=sys.stderr, flush=True)
    sys.exit(1)


def run(cmd, **kw):
    """run a command; on failure print its output and stop"""
    r = subprocess.run([str(c) for c in cmd], capture_output=True, text=True, **kw)
    out = (r.stdout or '') + (r.stderr or '')
    out = '\n'.join(l for l in out.splitlines() if not l.startswith('Picked up JAVA_TOOL_OPTIONS'))
    if r.returncode != 0:
        die('command failed (%d): %s\n%s' % (r.returncode, ' '.join(str(c) for c in cmd[:6]), out[-4000:]))
    return out


def sha256_file(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


# ---------------------------------------------------------------- tools
def fetch(url, dst, want):
    for attempt in range(6):
        try:
            tmp = dst.with_suffix(dst.suffix + '.part')
            with urllib.request.urlopen(url, timeout=120) as r, open(tmp, 'wb') as f:
                shutil.copyfileobj(r, f)
            got = sha256_file(tmp)
            if got != want:
                tmp.unlink()
                die('%s: SHA-256 %s, expected %s (refusing to use it)' % (url, got, want))
            tmp.rename(dst)
            return
        except urllib.error.HTTPError as e:
            if e.code == 429 or e.code >= 500:          # Maven Central rate limit: wait and retry
                time.sleep(5 * (attempt + 1))
                continue
            die('%s: HTTP %d' % (url, e.code))
        except OSError as e:
            if attempt == 5:
                die('%s: %s' % (url, e))
            time.sleep(3 * (attempt + 1))
    die('%s: gave up after retries' % url)


def ensure_tools(tools_dir):
    tools_dir.mkdir(parents=True, exist_ok=True)
    out = {}
    for key, (rel, sha) in TOOLS.items():
        dst = tools_dir / Path(rel).name
        if not dst.exists() or sha256_file(dst) != sha:
            log('downloading ' + Path(rel).name + ' from Maven Central')
            fetch(MAVEN + rel, dst, sha)
        out[key] = dst
    # aapt2 + the framework resources (android-framework.jar = framework AndroidManifest.xml + resources.arsc)
    plat = 'macosx' if sys.platform == 'darwin' else ('windows' if os.name == 'nt' else 'linux')
    exe = 'aapt2.exe' if plat == 'windows' else 'aapt2'
    xdir = tools_dir / ('apktool-3.0.3-' + plat)
    aapt2, fw = xdir / exe, xdir / 'android-framework.jar'
    if not aapt2.exists() or not fw.exists():
        xdir.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(out['apktool_jar']) as z:
            aapt2.write_bytes(z.read('prebuilt/%s/%s' % (plat, exe)))
            fw.write_bytes(z.read('prebuilt/android-framework.jar'))
        aapt2.chmod(0o755)
    out['aapt2'], out['framework_jar'] = aapt2, fw
    for t in ('javac', 'java', 'keytool'):
        if not shutil.which(t):
            die(t + ' not found: install a JDK (11 or newer)')
    return out


# ---------------------------------------------------------------- www/
HEAD = ('<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">\n'
        '<meta name="color-scheme" content="dark">\n<meta name="format-detection" content="telephone=no">\n')
HEAD_PART = re.compile(r'(?:\s+|<title>.*?</title>|<style[^>]*>.*?</style>|<meta\b[^>]*>|<link\b[^>]*>|<!--.*?-->)*', re.S | re.I)


def wrap_page(page):
    """the artifact's index.html is body-only (the claude.ai host adds the skeleton): make it a standards-mode page"""
    if re.match(r'\s*<!doctype', page, re.I):
        return page
    m = HEAD_PART.match(page)
    head, body = page[:m.end()], page[m.end():]
    return HEAD + head.strip() + '\n</head>\n<body>\n' + body.lstrip('\n') + '</body>\n</html>\n'


def stage_www(artifact, www):
    if www.exists():
        shutil.rmtree(www)
    files, skipped = [], []
    for p in sorted(artifact.rglob('*')):
        if not p.is_file():
            continue
        rel = p.relative_to(artifact).as_posix()
        if JUNK.search(rel):
            skipped.append(rel)
            continue
        dst = www / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        if rel == 'index.html':
            dst.write_text(wrap_page(p.read_text(encoding='utf-8')), encoding='utf-8')
        else:
            shutil.copyfile(p, dst)
        files.append(rel)
    if 'index.html' not in files:
        die('%s has no index.html (build it first: node tools/build/build_artifact.mjs --webp --mp3-only)' % artifact)
    return files, skipped


def remote_refs(www):
    """hosts the page's code mentions in http(s) URLs (a remote fetch would fail: the app has no INTERNET permission)"""
    hosts = {}
    for p in www.rglob('*'):
        if p.suffix.lower() not in ('.html', '.js', '.css', '.json') or not p.is_file():
            continue
        for m in re.finditer(rb'https?://([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})', p.read_bytes()):
            h = m.group(1).decode().lower()
            hosts.setdefault(h, set()).add(p.relative_to(www).as_posix())
    return {h: sorted(v)[:5] for h, v in sorted(hosts.items())}


# ---------------------------------------------------------------- launcher icons
def make_icons(icon_dir, res):
    try:
        from PIL import Image, ImageChops, ImageDraw
    except ImportError:
        die('Pillow is needed for the launcher icons: pip install Pillow')
    need = ['icon_1024.png', 'ic_launcher_foreground.png', 'ic_launcher_background.png']
    for n in need:
        if not (icon_dir / n).exists():
            die('missing %s (the title art app icon; --icon-dir points at assets/title/icon)' % (icon_dir / n))
    full = Image.open(icon_dir / 'icon_1024.png').convert('RGBA')
    fg = Image.open(icon_dir / 'ic_launcher_foreground.png').convert('RGBA')
    bg = Image.open(icon_dir / 'ic_launcher_background.png').convert('RGBA')
    comp = Image.alpha_composite(bg.resize(fg.size, Image.LANCZOS), fg)
    s = comp.size[0]
    inner = comp.crop((s // 6, s // 6, s - s // 6, s - s // 6))      # the 72 dp a launcher shows of the 108 dp layers

    def masked(img, size, shape):
        big = size * 4
        mask = Image.new('L', (big, big), 0)
        d = ImageDraw.Draw(mask)
        if shape == 'circle':
            d.ellipse((0, 0, big - 1, big - 1), fill=255)
        else:                                                         # rounded square, small margin (legacy icon)
            m = big // 24
            d.rounded_rectangle((m, m, big - 1 - m, big - 1 - m), radius=int(big * 0.2), fill=255)
        mask = mask.resize((size, size), Image.LANCZOS)
        out = img.resize((size, size), Image.LANCZOS)
        out.putalpha(ImageChops.multiply(out.getchannel('A'), mask))
        return out

    made = []
    for dens, (legacy, layer) in DENSITIES.items():
        d = res / ('mipmap-' + dens)
        d.mkdir(parents=True, exist_ok=True)
        masked(full, legacy, 'square').save(d / 'ic_launcher.png', optimize=True)          # Android 7.x
        masked(inner, legacy, 'circle').save(d / 'ic_launcher_round.png', optimize=True)   # Android 7.1 round launchers
        fg.resize((layer, layer), Image.LANCZOS).save(d / 'ic_launcher_foreground.png', optimize=True)   # Android 8+
        bg.convert('RGB').resize((layer, layer), Image.LANCZOS).save(d / 'ic_launcher_background.png', optimize=True)
        made += [d.name + '/' + n for n in ('ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png', 'ic_launcher_background.png')]
    return made


# ---------------------------------------------------------------- resources + manifest (aapt2)
def build_resources(t, work, icon_dir, version_name, version_code, internet):
    res = work / 'res'
    if res.exists():
        shutil.rmtree(res)
    shutil.copytree(ANDROID / 'res', res)
    icons = make_icons(icon_dir, res)
    perms = '<uses-permission android:name="android.permission.INTERNET" />' if internet else ''
    man = (ANDROID / 'AndroidManifest.xml').read_text(encoding='utf-8')
    man = (man.replace('@@PACKAGE@@', PACKAGE).replace('@@MIN_SDK@@', str(MIN_SDK))
              .replace('@@TARGET_SDK@@', str(TARGET_SDK)).replace('@@EXTRA_PERMISSIONS@@', perms))
    assert '@@' not in man, 'unfilled manifest placeholder'
    (work / 'AndroidManifest.xml').write_text(man, encoding='utf-8')
    compiled = work / 'compiled.zip'
    run([t['aapt2'], 'compile', '--dir', res, '-o', compiled])
    res_apk = work / 'res.apk'
    run([t['aapt2'], 'link', '-o', res_apk, '-I', t['framework_jar'], '--manifest', work / 'AndroidManifest.xml',
         '--min-sdk-version', MIN_SDK, '--target-sdk-version', TARGET_SDK,
         '--version-code', version_code, '--version-name', version_name, compiled])
    return res_apk, icons


# ---------------------------------------------------------------- code (javac + dx)
def build_dex(t, work):
    stubs, classes = work / 'stubs_classes', work / 'classes'
    for d in (stubs, classes):
        if d.exists():
            shutil.rmtree(d)
        d.mkdir(parents=True)
    # compile-only stubs for API > 16 types (never dexed: only on the class path of the next javac)
    run(['javac', '--release', '8', '-encoding', 'UTF-8', '-nowarn', '-cp', t['android_jar'], '-d', stubs]
        + sorted((ANDROID / 'stubs').rglob('*.java')))
    out = run(['javac', '--release', '8', '-encoding', 'UTF-8', '-Xlint:all', '-Xlint:-options', '-Werror',
               '-cp', os.pathsep.join([str(t['android_jar']), str(stubs)]), '-d', classes]
              + sorted((ANDROID / 'java').rglob('*.java')))
    if out.strip():
        log('javac: ' + out.strip())
    dex = work / 'classes.dex'
    run(['java', '-cp', t['dx_jar'], 'com.android.dx.command.Main', '--dex', '--min-sdk-version=%d' % MIN_SDK,
         '--output=' + str(dex), classes])
    names = sorted(p.relative_to(classes).as_posix() for p in classes.rglob('*.class'))
    if any(n.startswith('android/') for n in names):
        die('a framework stub ended up in the app classes')
    return dex, names


# ---------------------------------------------------------------- zip writer (zipalign built in)
class ApkZip:
    """Minimal ZIP writer: stored entries start on a 4-byte boundary (like zipalign -p 4), using the same
    alignment extra field (0xd935) as apksig; fixed timestamps so the same input gives the same file."""

    def __init__(self, path):
        self.f = open(path, 'wb')
        self.central = []
        self.names = set()

    def add(self, name, data, deflate):
        if name in self.names:
            die('duplicate zip entry ' + name)
        self.names.add(name)
        crc = zlib.crc32(data) & 0xffffffff
        payload, method = data, 0
        if deflate and data:
            co = zlib.compressobj(9, zlib.DEFLATED, -15)
            comp = co.compress(data) + co.flush()
            if len(comp) < len(data):
                payload, method = comp, 8
        nb = name.encode('utf-8')
        flags = 0x0800 if any(ord(c) > 127 for c in name) else 0
        off = self.f.tell()
        extra = b''
        if method == 0:
            start = off + 30 + len(nb)
            if start % 4:
                need = (-(start + 6)) % 4
                extra = struct.pack('<HHH', 0xd935, 2 + need, 4) + b'\0' * need
        ver = 20 if method == 8 else 10
        self.f.write(struct.pack('<IHHHHHIIIHH', 0x04034b50, ver, flags, method, DOS_TIME, DOS_DATE, crc,
                                 len(payload), len(data), len(nb), len(extra)))
        self.f.write(nb)
        self.f.write(extra)
        self.f.write(payload)
        self.central.append(struct.pack('<IHHHHHHIIIHHHHHII', 0x02014b50, 20, ver, flags, method, DOS_TIME, DOS_DATE,
                                         crc, len(payload), len(data), len(nb), 0, 0, 0, 0, 0, off) + nb)

    def close(self):
        cd = self.f.tell()
        for c in self.central:
            self.f.write(c)
        size = self.f.tell() - cd
        n = len(self.central)
        if n > 0xffff or cd > 0xffffffff:
            die('too many entries / too big for a plain zip')
        self.f.write(struct.pack('<IHHHHIIH', 0x06054b50, 0, 0, n, n, size, cd, 0))
        self.f.close()


def assemble(unsigned, res_apk, dex, www):
    z = ApkZip(unsigned)
    with zipfile.ZipFile(res_apk) as r:
        names = r.namelist()
        z.add('AndroidManifest.xml', r.read('AndroidManifest.xml'), True)
        z.add('classes.dex', dex.read_bytes(), True)
        z.add('resources.arsc', r.read('resources.arsc'), False)          # stored + aligned (targetSdk >= 30 needs it)
        for n in sorted(names):
            if n in ('AndroidManifest.xml', 'resources.arsc'):
                continue
            z.add(n, r.read(n), not n.lower().endswith('.png'))
    count = 0
    for p in sorted(www.rglob('*')):
        if p.is_file():
            rel = p.relative_to(www).as_posix()
            z.add('assets/www/' + rel, p.read_bytes(), p.suffix.lower() in DEFLATE_EXT)
            count += 1
    z.close()
    return count


def check_zip(apk):
    """zipalign -c -p 4 equivalent + the entries that must be stored; returns a report dict"""
    bad, stored, deflated = [], 0, 0
    with open(apk, 'rb') as f, zipfile.ZipFile(apk) as z:
        for info in z.infolist():
            f.seek(info.header_offset)
            h = f.read(30)
            nlen, xlen = struct.unpack('<HH', h[26:30])
            data = info.header_offset + 30 + nlen + xlen
            if info.compress_type == zipfile.ZIP_STORED:
                stored += 1
                if data % 4:
                    bad.append(info.filename + ' @%d' % data)
            else:
                deflated += 1
        must_store = [i.filename for i in z.infolist() if (i.filename == 'resources.arsc' or i.filename.endswith('.png'))
                      and i.compress_type != zipfile.ZIP_STORED]
        crc_bad = z.testzip()
    return {'entries': stored + deflated, 'stored': stored, 'deflated': deflated, 'misaligned': bad,
            'compressedButMustBeStored': must_store, 'crcError': crc_bad}


# ---------------------------------------------------------------- signing
def ensure_keystore(ks):
    info = ks.with_suffix('.txt')
    if ks.exists():
        return False
    ks.parent.mkdir(parents=True, exist_ok=True)
    log('making a new TEST signing key: ' + str(ks))
    run(['keytool', '-genkeypair', '-keystore', ks, '-storetype', 'PKCS12', '-storepass', KEY_PASS, '-keypass', KEY_PASS,
         '-alias', KEY_ALIAS, '-keyalg', 'RSA', '-keysize', '2048', '-sigalg', 'SHA256withRSA', '-validity', '10950',
         '-dname', KEY_DNAME])
    info.write_text(
        'TEST SIGNING KEY for the Snowbloom Village test APKs (tools/apk/build_apk.py). NOT for a store release.\n'
        'keystore: %s (PKCS12)\nalias: %s\nstore/key password: %s\n\n'
        'Keep this file: an APK signed with another key cannot be installed over the app already on the phone\n'
        '(Android then asks to uninstall it first, and uninstalling deletes the saved game).\n' % (ks.name, KEY_ALIAS, KEY_PASS),
        encoding='utf-8')
    return True


# apksig 2.3.0 reaches into these JDK packages (class init of its v1 code, PKCS#7 parsing when verifying v1)
JAVA_EXPORTS = ['--add-exports=java.base/sun.security.%s=ALL-UNNAMED' % p for p in ('x509', 'pkcs', 'util')]


def realign(src, dst):
    """jarsigner rewrites the zip without alignment: write the same entries again (same order, same compression
    kind, byte-identical content, so the v1 signature stays valid) with stored entries on 4-byte boundaries"""
    z = ApkZip(dst)
    with zipfile.ZipFile(src) as r:
        for info in r.infolist():
            z.add(info.filename, r.read(info), info.compress_type != zipfile.ZIP_STORED)
    z.close()


def sign(t, work, unsigned, out, ks):
    """v1 = JDK jarsigner (SHA-256 / RSA), then re-align, then v2 = apksig's signing engine over the whole zip"""
    v1 = work / 'v1.apk'
    shutil.copyfile(unsigned, v1)
    run(['jarsigner', '-keystore', ks, '-storetype', 'PKCS12', '-storepass', KEY_PASS, '-keypass', KEY_PASS,
         '-digestalg', 'SHA-256', '-sigalg', 'SHA256withRSA', '-sigfile', 'CERT', v1, KEY_ALIAS])
    v1a = work / 'v1_aligned.apk'
    realign(v1, v1a)
    cp = signer_classes(t, work)
    run(['java'] + JAVA_EXPORTS + ['-cp', cp, 'SignApk', 'v2', v1a, out, ks, KEY_PASS, KEY_ALIAS, MIN_SDK])


def verify(t, work, apk):
    """apksig's ApkVerifier and the JDK's jarsigner -verify. apksig checks v2 for the platforms the app installs on
    (MIN_SDK..MAX_CHECK_SDK: Android 7+ only reads v2 when it is there); a second pass from API 18 makes it check
    the v1 signature too (that is what an Android older than 7 would read)."""
    cp = os.pathsep.join([str(t['apksig_jar']), str(work / 'signer')])

    def one(lo):
        r = subprocess.run(['java'] + JAVA_EXPORTS + ['-cp', cp, 'SignApk', 'verify', str(apk), str(lo), str(MAX_CHECK_SDK)],
                           capture_output=True, text=True)
        lines = [l for l in r.stdout.strip().splitlines() if l.startswith('{')]
        if not lines:
            die('apksig verify gave no result:\n' + r.stdout[-2000:] + r.stderr[-2000:])
        return json.loads(lines[-1])

    ver, ver1 = one(MIN_SDK), one(18)
    ver['v1'] = bool(ver1['v1'] and ver1['verified'] and not ver1['errors'])
    ver['v1Pass'] = {k: ver1[k] for k in ('verified', 'v1', 'v2', 'checkedSdk', 'errors', 'warnings')}
    jv = run(['jarsigner', '-verify', apk])
    return ver, 'jar verified.' in jv


def signer_classes(t, work):
    d = work / 'signer'
    if d.exists():
        shutil.rmtree(d)
    d.mkdir(parents=True)
    run(['javac', '--release', '11', '-encoding', 'UTF-8', '-cp', t['apksig_jar'], '-d', d, HERE / 'signer' / 'SignApk.java'])
    return os.pathsep.join([str(t['apksig_jar']), str(d)])


def badging(t, apk):
    out = run([t['aapt2'], 'dump', 'badging', apk])
    g = lambda pat: (re.search(pat, out) or [None, None])[1]
    return {
        'package': g(r"package: name='([^']+)'"), 'versionCode': g(r"versionCode='([^']+)'"), 'versionName': g(r"versionName='([^']*)'"),
        'minSdk': g(r"(?:minSdkVersion|sdkVersion):'(\d+)'"), 'targetSdk': g(r"targetSdkVersion:'(\d+)'"), 'label': g(r"application-label:'([^']*)'"),
        'icon': g(r"application-icon-640:'([^']+)'") or g(r"application: label='[^']*' icon='([^']+)'"),
        'launchable': g(r"launchable-activity: name='([^']+)'"),
        'permissions': re.findall(r"uses-permission: name='([^']+)'", out), 'raw': out,
    }


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0], formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('artifact', type=Path, help='the artifact build folder (dist/artifact)')
    ap.add_argument('out', type=Path, help='output .apk')
    ap.add_argument('version_name', help='e.g. 4.2')
    ap.add_argument('version_code', type=int, help='whole number, higher than the installed one for an update (e.g. 4020)')
    ap.add_argument('--tools-dir', type=Path, default=Path(os.environ.get('SNOWBLOOM_APK_TOOLS') or Path.home() / '.cache' / 'snowbloom-apk-tools'))
    ap.add_argument('--icon-dir', type=Path, default=None, help='default: <artifact>/../../assets/title/icon')
    ap.add_argument('--keystore', type=Path, default=FV / 'dist' / 'apk' / 'snowbloom-test.p12')
    ap.add_argument('--work-dir', type=Path, default=None, help='scratch folder (default: a new temp folder, removed after)')
    ap.add_argument('--internet', action='store_true', help='add the INTERNET permission (only if the game ever fetches remote files)')
    a = ap.parse_args()

    t0 = time.time()
    artifact = a.artifact.resolve()
    if not (artifact / 'index.html').exists():
        die('%s/index.html missing' % artifact)
    if a.version_code < 1 or a.version_code > 2100000000:
        die('versionCode must be 1..2100000000')
    icon_dir = (a.icon_dir or artifact.parent.parent / 'assets' / 'title' / 'icon').resolve()
    out = a.out.resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    own_work = a.work_dir is None
    work = Path(tempfile.mkdtemp(prefix='snowbloom-apk-')) if own_work else a.work_dir.resolve()
    work.mkdir(parents=True, exist_ok=True)

    t = ensure_tools(a.tools_dir.resolve())
    log('tools ok (%s)' % a.tools_dir)

    www = work / 'www'
    files, skipped = stage_www(artifact, www)
    hosts = remote_refs(www)
    log('www: %d files from %s%s' % (len(files), artifact, (' (skipped %s)' % ', '.join(skipped)) if skipped else ''))
    res_apk, icons = build_resources(t, work, icon_dir, a.version_name, a.version_code, a.internet)
    log('resources: aapt2 link ok, %d icon files from %s' % (len(icons), icon_dir))
    dex, classes = build_dex(t, work)
    log('code: %d classes -> classes.dex (%d bytes)' % (len(classes), dex.stat().st_size))

    unsigned = work / 'unsigned.apk'
    n = assemble(unsigned, res_apk, dex, www)
    pre = check_zip(unsigned)
    if pre['misaligned'] or pre['compressedButMustBeStored'] or pre['crcError']:
        die('unsigned zip check failed: ' + json.dumps(pre))

    new_key = ensure_keystore(a.keystore)
    tmp_out = out.with_suffix('.apk.part')
    sign(t, work, unsigned, tmp_out, a.keystore)
    ver, jar_ok = verify(t, work, tmp_out)
    post = check_zip(tmp_out)
    b = badging(t, tmp_out)
    problems = []
    if not (ver['verified'] and ver['v1'] and ver['v2']) or ver['errors']:
        problems.append('signature: ' + json.dumps(ver))
    if not jar_ok:
        problems.append('jarsigner -verify did not say "jar verified."')
    if post['misaligned'] or post['compressedButMustBeStored'] or post['crcError']:
        problems.append('zip: ' + json.dumps(post))
    want = {'package': PACKAGE, 'versionCode': str(a.version_code), 'versionName': a.version_name, 'minSdk': str(MIN_SDK),
            'targetSdk': str(TARGET_SDK), 'launchable': PACKAGE + '.MainActivity'}
    for k, v in want.items():
        if b[k] != v:
            problems.append('badging %s=%r, expected %r' % (k, b[k], v))
    if not b['icon'] or not b['label']:
        problems.append('badging: no label or icon')
    if problems:
        die('checks failed:\n  ' + '\n  '.join(problems))
    tmp_out.replace(out)

    sha = sha256_file(out)
    size = out.stat().st_size
    (out.parent / (out.name + '.sha256')).write_text('%s  %s\n' % (sha, out.name))
    summary = {
        'apk': out.name, 'sha256': sha, 'bytes': size, 'MB': round(size / 1048576, 2),
        'package': PACKAGE, 'versionName': a.version_name, 'versionCode': a.version_code,
        'minSdk': MIN_SDK, 'targetSdk': TARGET_SDK, 'label': b['label'], 'icon': b['icon'], 'activity': b['launchable'],
        'permissions': b['permissions'], 'origin': ORIGIN, 'wwwFiles': n, 'artifact': str(artifact),
        'signature': dict({k: ver[k] for k in ('verified', 'v1', 'v2', 'checkedSdk', 'signers', 'warnings', 'v1Pass')},
                          v1Tool='JDK jarsigner (SHA-256/RSA)', v2Tool='apksig 2.3.0 DefaultApkSignerEngine', jarsignerVerify=jar_ok),
        'zip': post, 'remoteHostsMentioned': hosts, 'classes': classes, 'newKeyMade': new_key,
        'keystore': str(a.keystore), 'builtAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'seconds': round(time.time() - t0, 1),
    }
    out.with_suffix('.json').write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding='utf-8')
    if own_work:
        shutil.rmtree(work, ignore_errors=True)
    log('OK %s  %.2f MB  sha256 %s' % (out, size / 1048576, sha))
    log('   %s %s (%d)  minSdk %d  targetSdk %d  signed v1+v2  %d game files  %.0f s'
        % (b['label'], a.version_name, a.version_code, MIN_SDK, TARGET_SDK, n, time.time() - t0))
    if new_key:
        log('   NEW test key made: keep %s (+ .txt) for the next builds' % a.keystore)


if __name__ == '__main__':
    main()
