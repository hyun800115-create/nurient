#!/usr/bin/env python3
"""Snowbloom Village Android app (tools/apk): check the app's Java against the real Android 16 (API 36) framework.

    python3 tools/apk/test/api36_check.py [--work dir] [--tools-dir dir] [--json out.json]

The build compiles the Java against the small API 16 stub android.jar plus compile-only stubs of the newer types
(tools/apk/android/stubs) and reaches newer methods of older classes by reflection. This check proves those shortcuts
match what Android 16 really has, using org.robolectric:android-all:16-robolectric-13921718 from Maven Central (the
AOSP Android 16 framework classes Robolectric runs on; pinned by SHA-256, the Maven .sha1/.sha256 matched it):

  1. javac of every app source against that jar alone (no API 16 jar, no stubs): every class, method and field the
     code names directly exists in Android 16 with that signature (`@Override`s included);
  2. every member of every compile-only stub, via javap: same name and descriptor, same static-ness, and the same
     value for each constant (e.g. WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE = 2);
  3. every reflective lookup in the sources (call / callStatic / getField with a literal name) exists, public, on
     the named class with those parameter types, plus the constant the code inlines for it
     (Api30.CUTOUT_MODE_ALWAYS = LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS);
  4. the methods the app overrides without javac seeing the framework method (API 16 jar): View.onApplyWindowInsets,
     WebViewClient.onRenderProcessGone;
  5. 마을 옮기기: WebBridge's copy / share / paste carry the framework's runtime-visible @JavascriptInterface (the build
     compiles them against a compile-only stub of it).
Limit: the jar is the framework implementation, so it also has @hide members; the names checked here are all public
SDK API (the ones Android Studio would offer), but this check alone cannot tell an @hide member from an SDK one.
Exit 1 on any failure.
"""
import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
APK = HERE.parent
sys.path.insert(0, str(APK))
import build_apk as B  # noqa: E402

ANDROID_ALL = ('org/robolectric/android-all/16-robolectric-13921718/android-all-16-robolectric-13921718.jar',
               '8b74a0a137330658d2f33f0dc715d42734f74ba8b2d7014fc2e95aa40d3f682d')
PRIM = {'boolean': 'Z', 'int': 'I', 'long': 'J', 'float': 'F', 'double': 'D', 'byte': 'B', 'char': 'C', 'short': 'S', 'void': 'V'}
JAVA_LANG = {'String', 'Object', 'Integer', 'Boolean', 'Runnable'}


def javap(cp, cls):
    r = subprocess.run(['javap', '-public', '-constants', '-s', '-cp', str(cp), cls], capture_output=True, text=True)
    if r.returncode != 0:
        return None
    members = {}
    lines = [l for l in r.stdout.splitlines() if not l.startswith('Picked up')]
    for i, l in enumerate(lines):
        if l.strip().startswith('descriptor:') and i > 0:
            decl = lines[i - 1].strip().rstrip(';')
            desc = l.split(':', 1)[1].strip()
            const = None
            if ' = ' in decl and '(' not in decl:
                decl, const = decl.split(' = ', 1)
            head = decl.split('(')[0]
            name = head.split()[-1].split('.')[-1]
            mods = set(head.split()[:-1])
            members[(name, desc)] = {'static': 'static' in mods, 'final': 'final' in mods, 'const': const, 'decl': decl}
    return members


def descriptor_of(type_name, imports):
    t = type_name.strip()
    if t.endswith('.class'):
        t = t[:-6]
    if t in PRIM:
        return PRIM[t]
    if t in JAVA_LANG:
        return 'Ljava/lang/%s;' % t
    full = imports.get(t.split('.')[0])
    if full and '.' in t:                                  # Outer.Inner
        full = full + '$' + t.split('.', 1)[1].replace('.', '$')
    if not full:
        raise ValueError('cannot resolve type %r' % t)
    return 'L%s;' % full.replace('.', '/')


def class_name(simple, imports):
    if '.' in simple:
        outer, inner = simple.split('.', 1)
        return imports[outer] + '$' + inner.replace('.', '$')
    return imports[simple]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--work', type=Path, default=None)
    ap.add_argument('--tools-dir', type=Path, default=Path(os.environ.get('SNOWBLOOM_APK_TOOLS') or Path.home() / '.cache' / 'snowbloom-apk-tools'))
    ap.add_argument('--json', type=Path)
    a = ap.parse_args()
    import tempfile
    work = (a.work or Path(tempfile.mkdtemp(prefix='snowbloom-api36-'))).resolve()
    work.mkdir(parents=True, exist_ok=True)
    tools = a.tools_dir.resolve()
    tools.mkdir(parents=True, exist_ok=True)
    jar = tools / Path(ANDROID_ALL[0]).name
    if not jar.exists() or B.sha256_file(jar) != ANDROID_ALL[1]:
        print('[api36] downloading %s (about 200 MB, once) from Maven Central' % jar.name, flush=True)
        B.fetch(B.MAVEN + ANDROID_ALL[0], jar, ANDROID_ALL[1])

    results = []

    def check(name, ok, info=''):
        results.append({'check': name, 'ok': bool(ok), 'info': info})
        print('  %s %s%s' % ('ok  ' if ok else 'FAIL', name, ('  — ' + str(info)) if info != '' else ''))

    srcs = sorted((APK / 'android' / 'java').rglob('*.java'))
    stub_srcs = sorted((APK / 'android' / 'stubs').rglob('*.java'))

    # 1. the app sources against Android 16 alone
    out = work / 'app36'
    out.mkdir(exist_ok=True)
    r = subprocess.run(['javac', '-encoding', 'UTF-8', '-nowarn', '-Xlint:none', '-proc:none', '-cp', str(jar), '-d', str(out)]
                       + [str(s) for s in srcs], capture_output=True, text=True)
    errs = '\n'.join(l for l in (r.stdout + r.stderr).splitlines() if not l.startswith('Picked up') and 'deprecat' not in l.lower() and not l.startswith('Note:'))
    check('the app\'s %d Java sources compile against the Android 16 framework alone (no stubs)' % len(srcs), r.returncode == 0, errs[-1500:])

    # 2. every stub member exists in the real class
    stubs_out = work / 'stubs'
    stubs_out.mkdir(exist_ok=True)
    r = subprocess.run(['javac', '-encoding', 'UTF-8', '-nowarn', '-d', str(stubs_out)] + [str(s) for s in stub_srcs], capture_output=True, text=True)
    if r.returncode != 0:
        check('stubs compile', False, r.stderr[-800:])
    for cf in sorted(stubs_out.rglob('*.class')):
        cls = cf.relative_to(stubs_out).with_suffix('').as_posix().replace('/', '.')
        mine, real = javap(stubs_out, cls), javap(jar, cls)
        if real is None:
            check('stub %s exists in Android 16' % cls, False)
            continue
        bad = []
        for key, m in mine.items():                       # (constructors: javap names them after the class in both)
            rm = real.get(key)
            if rm is None:
                bad.append('missing %s %s' % key)
                continue
            if rm['static'] != m['static']:
                bad.append('%s static mismatch' % key[0])
            if m['const'] is not None and rm['const'] != m['const']:
                bad.append('%s = %s, Android 16 has %s' % (key[0], m['const'], rm['const']))
        check('stub %s: %d members match Android 16 (names, descriptors, static, constants)' % (cls, len(mine)), not bad, '; '.join(bad))

    # 3. reflective lookups in the sources
    lookups = []
    for s in srcs:
        text = s.read_text(encoding='utf-8')
        imports = {m.group(1).split('.')[-1]: m.group(1) for m in re.finditer(r'^import\s+([\w.]+);', text, re.M)}
        imports.setdefault('Window', 'android.view.Window')
        for m in re.finditer(r'\bcall(Static)?\(\s*([\w.]+)\.class\s*,\s*(?:[\w.]+\s*,\s*)?"(\w+)"\s*,\s*new Class<\?>\[(?:\]\s*\{([^}]*)\}|0\])', text):
            static, owner, name, params = bool(m.group(1)), m.group(2), m.group(3), [p for p in (m.group(4) or '').split(',') if p.strip()]
            try:
                cls = class_name(owner, imports)
                desc = '(' + ''.join(descriptor_of(p, imports) for p in params) + ')'
            except (KeyError, ValueError) as e:
                check('reflective lookup %s.%s in %s resolves' % (owner, name, s.name), False, repr(e))
                continue
            lookups.append((s.name, cls, name, desc, static))
        for m in re.finditer(r'([\w.]+)\.class\.getField\("(\w+)"\)', text):
            lookups.append((s.name, class_name(m.group(1), imports), m.group(2), None, False))
    seen = set()
    for src, cls, name, desc, static in lookups:
        if (cls, name, desc) in seen:
            continue
        seen.add((cls, name, desc))
        real = javap(jar, cls) or {}
        if desc is None:                                      # a field
            hits = [(k, v) for k, v in real.items() if k[0] == name and not k[1].startswith('(')]
            check('field %s.%s (%s) is public in Android 16' % (cls, name, src), bool(hits), hits[0][1]['decl'] if hits else '')
        else:
            hits = [(k, v) for k, v in real.items() if k[0] == name and k[1].startswith(desc) and v['static'] == static]
            check('method %s.%s%s (%s, by reflection) is public in Android 16' % (cls, name, desc, src), bool(hits),
                  hits[0][1]['decl'] if hits else '')
    check('the sources have reflective lookups to check', len(seen) >= 8, len(seen))
    lp = javap(jar, 'android.view.WindowManager$LayoutParams') or {}
    always = [v['const'] for k, v in lp.items() if k[0] == 'LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS']
    api30 = (APK / 'android/java/com/snowbloom/village/Api30.java').read_text(encoding='utf-8')
    mine = re.search(r'CUTOUT_MODE_ALWAYS\s*=\s*(\d+)', api30)
    check('Api30.CUTOUT_MODE_ALWAYS = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS', mine and always and always[0] == mine.group(1),
          '%s vs %s' % (mine and mine.group(1), always))
    imm = re.search(r'IMMERSIVE_STICKY\s*=\s*(0x[0-9a-fA-F]+)', (APK / 'android/java/com/snowbloom/village/MainActivity.java').read_text(encoding='utf-8'))
    view = javap(jar, 'android.view.View') or {}
    vimm = [v['const'] for k, v in view.items() if k[0] == 'SYSTEM_UI_FLAG_IMMERSIVE_STICKY']
    check('MainActivity.IMMERSIVE_STICKY = View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY', imm and vimm and int(imm.group(1), 16) == int(vimm[0]), '%s vs %s' % (imm and imm.group(1), vimm))

    # 4. overrides javac cannot see with the API 16 jar
    for cls, name, desc in (('android.view.View', 'onApplyWindowInsets', '(Landroid/view/WindowInsets;)Landroid/view/WindowInsets;'),
                            ('android.webkit.WebViewClient', 'onRenderProcessGone', '(Landroid/webkit/WebView;Landroid/webkit/RenderProcessGoneDetail;)Z'),
                            ('android.window.OnBackInvokedCallback', 'onBackInvoked', '()V')):
        real = javap(jar, cls) or {}
        check('overridden %s.%s%s exists in Android 16' % (cls, name, desc), (name, desc) in real)
    for cls, name, desc in (('com.snowbloom.village.MainActivity$GameFrame', 'onApplyWindowInsets', '(Landroid/view/WindowInsets;)Landroid/view/WindowInsets;'),
                            ('com.snowbloom.village.MainActivity$GameClient', 'onRenderProcessGone', '(Landroid/webkit/WebView;Landroid/webkit/RenderProcessGoneDetail;)Z')):
        mine = javap(out, cls) or {}
        check('the app declares %s.%s with exactly that descriptor' % (cls.split('.')[-1], name), (name, desc) in mine)

    # 5. 마을 옮기기: the methods the game's page calls on window.SnowbloomAndroid carry the framework's runtime-visible
    #    @JavascriptInterface (API 17+ WebView exposes nothing else to the page; the build compiles it against a stub)
    check('android.webkit.JavascriptInterface exists in Android 16', javap(jar, 'android.webkit.JavascriptInterface') is not None)
    jv = subprocess.run(['javap', '-v', '-p', '-cp', str(out), 'com.snowbloom.village.WebBridge'], capture_output=True, text=True).stdout
    for name, desc in (('copy', '(Ljava/lang/String;)Z'), ('share', '(Ljava/lang/String;)Z'), ('paste', '()Ljava/lang/String;')):
        m = re.search(r'\n  public \S+ ' + name + r'\([^)]*\);\n\s+descriptor: ' + re.escape(desc) + r'\n(.*?)(?:\n\n|\n}|\Z)', jv, re.S)
        check('WebBridge.%s%s is public and @JavascriptInterface (runtime-visible)' % (name, desc),
              bool(m) and 'RuntimeVisibleAnnotations' in m.group(1) and 'android.webkit.JavascriptInterface' in m.group(1))

    fails = [x for x in results if not x['ok']]
    print('api36_check: %d checks, %d failed (framework: %s)' % (len(results), len(fails), jar.name))
    if a.json:
        a.json.write_text(json.dumps({'framework': jar.name, 'checks': results, 'failed': len(fails)}, ensure_ascii=False, indent=1), encoding='utf-8')
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
