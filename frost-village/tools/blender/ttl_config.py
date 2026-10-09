"""
ttl_config.py - ONE place for the title art's texts, fonts and palette.

The game's name is read from src/title/config.js (TITLE_NAME) - see "texts" below - so renaming is:
edit TITLE_NAME there, run tools/blender/ttl_build.sh; the logos (main, short, English), the
previews and assets/title/manifest.json -> meta.texts are rebuilt from it.

Pure python (no bpy): imported by the Blender scripts AND by the plain-python packers.
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))          # frost-village/
FONTS = os.path.join(GAME, 'tools', 'fonts')

# ------------------------------------------------------------------ texts
# The game's name lives in ONE place: src/title/config.js -> TITLE_NAME (the title code's config; its
# tools/title/apply_name.mjs also updates index.html / manifest.webmanifest / strings.js).  This file
# reads it from there, so a rename = edit TITLE_NAME + run tools/blender/ttl_build.sh.  If that file is
# missing or unreadable, DEFAULT_TITLE below is used (and a warning is printed).
#
# How the logo rows are chosen (first match wins):
#   1. TITLE_NAME.logo.ko / .en = { top, main, sign }  - the split the title code's text logo uses too
#   2. TITLE_NAME.koLines / enLines (older two-line form)
#   3. split the name on spaces: sign = last word, main = the word before it, top = the rest
#      ('눈꽃마을' -> main only; '눈꽃마을 이야기' -> main + sign; '아주 행복한 눈꽃마을 이야기' ->
#       top '아주 행복한', main '눈꽃마을', sign '이야기')
# validate_title() checks the result BEFORE any Blender time is spent (empty / spaced main word,
# characters no logo font can draw) - see tools/blender/ttl_check_name.py.
DEFAULT_TITLE = {
    'full': '행복한 눈꽃마을 이야기',     # store / official name
    'top': '행복한',                      # small line above the main word
    'main': '눈꽃마을',                   # the big chunky word (also the short logo / icon word)
    'bottom': '이야기',                   # on the little wooden sign
    'short': '눈꽃마을',                  # short logo (splash / icon / store badge)
    'en_top': '',                        # English logo, small line above (optional)
    'en_main': 'Snowbloom',              # English logo, big word (one 'o' becomes the emblem)
    'en_sub': 'Village',                 # English logo, on the sign
    'en_full': 'Snowbloom Village',
    'emblem_in_en': 'bloom',             # the first 'o' of this part of en_main is replaced by the emblem
}
TITLE_CONFIG_JS = os.path.join(GAME, 'src', 'title', 'config.js')


def split_name(name):
    """'a b c d' -> (top 'a b', main 'c', sign 'd'); 'a b' -> ('', 'a', 'b'); 'a' -> ('', 'a', '')."""
    words = [w for w in (name or '').split() if w]
    if not words:
        return '', '', ''
    if len(words) == 1:
        return '', words[0], ''
    return ' '.join(words[:-2]), words[-2], words[-1]


def _balanced(src, i):
    """src[i] == '{' -> index just past its matching '}' (skips quoted strings and // comments)."""
    depth, q, n = 0, None, len(src)
    while i < n:
        c = src[i]
        if q:
            if c == '\\':
                i += 1
            elif c == q:
                q = None
        elif c in '\'"`':
            q = c
        elif c == '/' and src[i:i + 2] == '//':
            j = src.find('\n', i)
            i = n if j < 0 else j
            continue
        elif c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    return n


def _object(src, key):
    """The text inside `key: { ... }` (or `KEY = { ... }`), balanced, or None."""
    import re
    m = re.search(r'\b%s\s*[:=]\s*\{' % re.escape(key), src)
    if not m:
        return None
    i = m.end() - 1
    return src[i + 1:_balanced(src, i) - 1]


def _top_level(body):
    """`body` with every nested { ... } blanked out (so a key only matches at this level)."""
    out, i, n = [], 0, len(body)
    while i < n:
        if body[i] == '{':
            j = _balanced(body, i)
            out.append(' ' * (j - i))
            i = j
        else:
            out.append(body[i])
            i += 1
    return ''.join(out)


def _read_js_title(path):
    """Pull TITLE_NAME out of src/title/config.js (no JS engine: a tolerant read of the string
    literals, brace-balanced).  Returns the texts dict, or None when the object is not found."""
    import re
    src = open(path, encoding='utf-8').read()
    obj = _object(src, 'TITLE_NAME')
    if obj is None:
        return None
    body = _top_level(obj)

    def s(key, where=None):
        mm = re.search(r'\b%s\s*:\s*([\'"])(.*?)\1' % key, where if where is not None else body)
        return mm.group(2) if mm else None

    def arr(key):
        mm = re.search(r'\b%s\s*:\s*\[(.*?)\]' % key, body, re.S)
        return [x[1] for x in re.findall(r'([\'"])(.*?)\1', mm.group(1))] if mm else None

    def logo(lang):
        """TITLE_NAME.logo.<lang> = { top, main, sign } -> (top, main, sign) or None"""
        lo = _object(obj, 'logo')
        part = _object(lo, lang) if lo is not None else None
        if part is None:
            return None
        main = s('main', part)
        if main is None:
            return None
        return (s('top', part) or '').strip(), main.strip(), (s('sign', part) or '').strip()

    ko, ko_short, en = s('ko'), s('koShort'), s('en')
    if not ko or not en:
        return None
    t = dict(DEFAULT_TITLE)
    t['full'] = ko
    t['en_full'] = en
    src_ko = src_en = 'split'
    lk = logo('ko')
    if lk:
        t['top'], t['main'], t['bottom'] = lk
        src_ko = 'logo.ko'
    else:
        lines = arr('koLines') or []
        if len(lines) >= 2:
            t['top'] = lines[0]
            t['main'], t['bottom'] = (split_name(lines[1])[1:] if ' ' in lines[1] else (lines[1], ''))
            src_ko = 'koLines'
        else:
            t['top'], t['main'], t['bottom'] = split_name(ko)
    t['short'] = ko_short or t['main']
    le = logo('en')
    if le:
        t['en_top'], t['en_main'], t['en_sub'] = le
        src_en = 'logo.en'
    else:
        lines = arr('enLines') or []
        if len(lines) >= 2:
            t['en_top'], t['en_main'], t['en_sub'] = '', lines[0], lines[1]
            src_en = 'enLines'
        else:
            t['en_top'], t['en_main'], t['en_sub'] = split_name(en)
    # the emblem replaces an 'o' in the second half of the English word when there is one
    w = t['en_main']
    t['emblem_in_en'] = w[len(w) // 2:] if 'o' in w[len(w) // 2:].lower() else ''
    t['_source'] = {'ko': src_ko, 'en': src_en, 'file': 'src/title/config.js'}
    return t


def load_title():
    if os.path.exists(TITLE_CONFIG_JS):
        try:
            t = _read_js_title(TITLE_CONFIG_JS)
            if t:
                return t
            print('ttl_config: TITLE_NAME not found in %s - using DEFAULT_TITLE' % TITLE_CONFIG_JS)
        except Exception as e:          # pragma: no cover
            print('ttl_config: could not read %s (%s) - using DEFAULT_TITLE' % (TITLE_CONFIG_JS, e))
    else:
        print('ttl_config: %s not found - using DEFAULT_TITLE' % TITLE_CONFIG_JS)
    return dict(DEFAULT_TITLE)


TITLE = load_title()

FONT_KO = os.path.join(FONTS, 'Jua-Regular.ttf')          # SIL OFL 1.1 (tools/fonts/OFL-Jua.txt)
# Jua draws 2,367 Hangul syllables (all 2,350 of KS X 1001 + 17) - no version of Jua / BM JUA draws all
# 11,172 (the 2014 BM JUA TTF maps them, but 8,805 of its glyphs are empty).  A syllable Jua lacks
# (똠, 햏, 쌰, 큥 ...) is drawn with this full-coverage heavy font instead, so a rename never silently
# loses a letter; validate_title() reports which characters fall back.
FONT_KO_FALLBACK = os.path.join(FONTS, 'Pretendard-ExtraBold.ttf')   # SIL OFL 1.1 (OFL-Pretendard.txt)
FONT_EN = os.path.join(FONTS, 'Fredoka-Bold.ttf')         # SIL OFL 1.1 (tools/fonts/OFL-Fredoka.txt)
FONT_EN_MAIN = os.path.join(FONTS, 'Fredoka-SemiBold.ttf')  # the big English word: 600 keeps the o / b / e
                                                          # counters open (42 % of the letter vs 31 % in 700)

_GLYPH_CACHE = {}


def has_glyph(fpath, ch):
    """True when the font really draws `ch` (in its cmap AND not an empty outline); spaces count as
    drawn.  Pure Pillow, so it works in Blender's python and in the packers alike."""
    if not ch.strip():
        return True
    key = (fpath, ch)
    if key in _GLYPH_CACHE:
        return _GLYPH_CACHE[key]
    from PIL import ImageFont
    if not os.path.exists(fpath):
        _GLYPH_CACHE[key] = False
        return False
    f = ImageFont.truetype(fpath, 64)

    def sig(c):
        m = f.getmask(c)
        return (m.size, bytes(m))
    m = f.getmask(ch)
    ok = m.getbbox() is not None and sig(ch) != sig('\U0010FFFD')     # empty glyph / .notdef box
    _GLYPH_CACHE[key] = ok
    return ok


def font_for(ch, lang='ko'):
    """The font that draws one logo character: Jua (ko) / Fredoka (en), else the fallback chain."""
    chain = [FONT_KO, FONT_KO_FALLBACK] if lang == 'ko' else [FONT_EN_MAIN, FONT_EN, FONT_KO, FONT_KO_FALLBACK]
    for fp in chain:
        if has_glyph(fp, ch):
            return fp
    return None


def validate_title(t=None):
    """Check the logo texts before any Blender time is spent.  -> (errors, warnings): lists of strings.
    Errors stop the build (ttl_check_name.py / ttl_logo.py exit with the message)."""
    t = t or TITLE
    errs, warns = [], []
    for k, lang, label in (('main', 'ko', 'Korean big word (logo.ko.main)'),
                           ('en_main', 'en', 'English big word (logo.en.main)')):
        v = t.get(k, '')
        if not v.strip():
            errs.append('%s is empty - set TITLE_NAME.logo.%s.main in src/title/config.js' % (label, lang))
        elif any(c.isspace() for c in v):
            errs.append('%s "%s" contains a space - the big row is ONE word; put the other words in '
                        'TITLE_NAME.logo.%s.top / .sign' % (label, v, lang))
    if any(c.isspace() for c in t.get('short', '')):
        errs.append('short name "%s" contains a space (TITLE_NAME.koShort is drawn as one block)' % t['short'])
    for k, lang in (('top', 'ko'), ('main', 'ko'), ('bottom', 'ko'), ('short', 'ko'),
                    ('en_top', 'en'), ('en_main', 'en'), ('en_sub', 'en')):
        for ch in t.get(k, ''):
            fp = font_for(ch, lang)
            first = FONT_KO if lang == 'ko' else FONT_EN_MAIN
            if fp is None:
                errs.append('"%s" in %s "%s": no logo font can draw this character (U+%04X)' % (ch, k, t[k], ord(ch)))
            elif fp != first:
                warns.append('"%s" in %s "%s" is not in %s - drawn with %s' % (
                    ch, k, t[k], os.path.basename(first), os.path.basename(fp)))
    # the logo rows must spell the name (a rename that edits TITLE_NAME.ko but not TITLE_NAME.logo.ko)
    for rows, full, lang in (((t.get('top', ''), t.get('main', ''), t.get('bottom', '')), t.get('full', ''), 'ko'),
                             ((t.get('en_top', ''), t.get('en_main', ''), t.get('en_sub', '')), t.get('en_full', ''), 'en')):
        if full and ''.join(rows).replace(' ', '') != full.replace(' ', ''):
            warns.append('TITLE_NAME.logo.%s (%s) does not spell TITLE_NAME.%s "%s" - the logo is built from '
                         'logo.%s; update it too if the name changed' % (lang, ' / '.join(r for r in rows if r),
                                                                         lang, full, lang))
    if len(t.get('main', '')) > 6:
        warns.append('main word has %d letters - the logo width is fixed, so the letters get small; '
                     'check docs/previews/title_art_sheet.png' % len(t['main']))
    return errs, warns

# ------------------------------------------------------------------ palette (sRGB hex)
# game colours: snow white, ice blue (#3D8BE0 ui blue), coin gold (#FFC83D), ribbon red (#D9483B)
PAL = {
    'ink': '#1D2F5E',            # thick logo outline (deep navy)
    'ink_wood': '#4A2A17',       # outline of the wooden sign
    'shadow': (14, 30, 70, 120), # drop shadow rgba
    'snow': '#FFFFFF',
    'snow_shade': '#D6E6F7',
    # main-word letters: (top colour, bottom colour) - one per syllable, cycled
    'main': [('#74C9FF', '#2C74D8'),     # ice blue
             ('#FF97B4', '#DE3A66'),     # berry pink (the flower)
             ('#FFD447', '#EE930F'),     # coin gold
             ('#6FE0C6', '#169C86')],    # mint
    'top': ('#FF8E7E', '#D2303A'),       # 행복한: ribbon red
    'en': [('#74C9FF', '#2C74D8')],
    'sign_wood': ('#D8A066', '#9C6232'),
    'sign_text': '#FFF6E6',
    'emblem_petal': ('#FFFFFF', '#CFE7FF'),
    'emblem_core': '#FFC83D',
    'emblem_line': '#6FB6F2',
    'gold': '#FFC83D',
    'red': '#D9483B',
}

# ------------------------------------------------------------------ outputs
OUT_DIR = os.path.join(GAME, 'assets', 'title')
LOGO_W2X = 900          # main logo width at @2x (game draws it at 0.5 -> 450 css px on a 1080 canvas)
LOGO_W1X = 450
SHORT_W2X = 640         # short logo (눈꽃 / 마을 block) width at @2x
ICON_SIZES = (1024, 512, 192)
