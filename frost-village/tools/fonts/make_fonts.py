"""
make_fonts.py - fetch the open-licensed (SIL OFL 1.1) display fonts used by the title art and
rebuild whole TTF files from the npm @fontsource packages (github raw downloads are blocked here;
the npm registry works).  Only rendered images ship in the game - these fonts are build tools.

    python3 -m venv v && v/bin/pip install fonttools brotli
    v/bin/python tools/fonts/make_fonts.py [cache_dir]   # writes tools/fonts/*.ttf + OFL texts
                                                          # (downloads cached in $TMP/fv_fonts_cache)

Fonts
  Jua-Regular.ttf      BM JUA (Woowa Brothers), rounded chunky Hangul + Latin.   @fontsource/jua 5.3.0
                       = files/jua-korean-400-normal.woff2 (2,515 code points: all KS X 1001
                       syllables) merged with files/jua-latin-400-normal.woff2.
  Fredoka-Bold.ttf     Fredoka 700 (Milena Brandao), round toy Latin.          @fontsource/fredoka 5.3.0
  Fredoka-SemiBold.ttf Fredoka 600.
  Pretendard-ExtraBold.ttf  Pretendard ExtraBold (all 11,172 Hangul) - fallback for syllables Jua lacks.
                       npm pretendard 1.3.9 (dist/public/static/alternative/Pretendard-ExtraBold.ttf, as is)
Licences: OFL-Jua.txt, OFL-Fredoka.txt, OFL-Pretendard.txt (copied from the packages' LICENSE files).
"""
import io
import os
import sys
import tarfile
import urllib.request

from fontTools.ttLib import TTFont
from fontTools.merge import Merger

HERE = os.path.dirname(os.path.abspath(__file__))
REG = 'https://registry.npmjs.org/@fontsource/{p}/-/{p}-{v}.tgz'
PKGS = {'jua': '5.3.0', 'fredoka': '5.3.0'}
PRETENDARD = ('https://registry.npmjs.org/pretendard/-/pretendard-1.3.9.tgz', 'pretendard-1.3.9.tgz')


def fetch(pkg, ver, cache):
    os.makedirs(cache, exist_ok=True)
    tgz = os.path.join(cache, '%s-%s.tgz' % (pkg, ver))
    if not os.path.exists(tgz):
        with urllib.request.urlopen(REG.format(p=pkg, v=ver)) as r, open(tgz, 'wb') as f:
            f.write(r.read())
    return tarfile.open(tgz)


def member(tf, name):
    return io.BytesIO(tf.extractfile('package/' + name).read())


def to_ttf(buf, out):
    t = TTFont(buf)
    t.flavor = None
    t.save(out)
    return out


def main():
    import tempfile
    cache = sys.argv[1] if len(sys.argv) > 1 else os.path.join(tempfile.gettempdir(), 'fv_fonts_cache')
    tmp = os.path.join(cache, 'tmp')
    os.makedirs(tmp, exist_ok=True)
    # Jua: korean + latin subsets -> one TTF
    tf = fetch('jua', PKGS['jua'], cache)
    ko = to_ttf(member(tf, 'files/jua-korean-400-normal.woff2'), os.path.join(tmp, 'jua_ko.ttf'))
    la = to_ttf(member(tf, 'files/jua-latin-400-normal.woff2'), os.path.join(tmp, 'jua_la.ttf'))
    merged = Merger().merge([ko, la])
    merged.save(os.path.join(HERE, 'Jua-Regular.ttf'))
    with open(os.path.join(HERE, 'OFL-Jua.txt'), 'wb') as f:
        f.write(member(tf, 'LICENSE').read())
    # Fredoka 600 / 700 latin
    tf = fetch('fredoka', PKGS['fredoka'], cache)
    for w, nm in ((700, 'Bold'), (600, 'SemiBold')):
        to_ttf(member(tf, 'files/fredoka-latin-%d-normal.woff2' % w), os.path.join(HERE, 'Fredoka-%s.ttf' % nm))
    with open(os.path.join(HERE, 'OFL-Fredoka.txt'), 'wb') as f:
        f.write(member(tf, 'LICENSE').read())
    # Pretendard ExtraBold (fallback for the rare syllables Jua does not draw) - copied unmodified
    tgz = os.path.join(cache, PRETENDARD[1])
    if not os.path.exists(tgz):
        with urllib.request.urlopen(PRETENDARD[0]) as r, open(tgz, 'wb') as f:
            f.write(r.read())
    tf = tarfile.open(tgz)
    with open(os.path.join(HERE, 'Pretendard-ExtraBold.ttf'), 'wb') as f:
        f.write(member(tf, 'dist/public/static/alternative/Pretendard-ExtraBold.ttf').read())
    with open(os.path.join(HERE, 'OFL-Pretendard.txt'), 'wb') as f:
        f.write(member(tf, 'dist/LICENSE.txt').read())
    for fn in sorted(os.listdir(HERE)):
        if fn.endswith('.ttf'):
            t = TTFont(os.path.join(HERE, fn))
            print('%-22s %5d code points' % (fn, len(t.getBestCmap())))


if __name__ == '__main__':
    main()
