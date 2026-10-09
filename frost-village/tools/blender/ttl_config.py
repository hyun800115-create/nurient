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
DEFAULT_TITLE = {
    'full': '행복한 눈꽃마을 이야기',     # store / official name
    'top': '행복한',                      # small line above the main word
    'main': '눈꽃마을',                   # the big chunky word (also the short logo / icon word)
    'bottom': '이야기',                   # on the little wooden sign
    'short': '눈꽃마을',                  # short logo (splash / icon / store badge)
    'en_main': 'Snowbloom',              # English logo, line 1 (one 'o' becomes the emblem)
    'en_sub': 'Village',                 # English logo, line 2 (on the sign)
    'en_full': 'Snowbloom Village',
    'emblem_in_en': 'bloom',             # the first 'o' of this part of en_main is replaced by the emblem
}
TITLE_CONFIG_JS = os.path.join(GAME, 'src', 'title', 'config.js')


def _read_js_title(path):
    """Pull TITLE_NAME { ko, koLines, koShort, en, enLines } out of src/title/config.js (no JS engine:
    a tolerant regex read of the string literals)."""
    import re
    src = open(path, encoding='utf-8').read()
    m = re.search(r'TITLE_NAME\s*=\s*\{(.*?)\n\};', src, re.S)
    if not m:
        return None
    body = m.group(1)

    def s(key):
        mm = re.search(r'\b%s\s*:\s*([\'"])(.*?)\1' % key, body)
        return mm.group(2) if mm else None

    def arr(key):
        mm = re.search(r'\b%s\s*:\s*\[(.*?)\]' % key, body, re.S)
        return re.findall(r'([\'"])(.*?)\1', mm.group(1)) if mm else None
    ko, ko_short, en = s('ko'), s('koShort'), s('en')
    ko_lines = [x[1] for x in (arr('koLines') or [])]
    en_lines = [x[1] for x in (arr('enLines') or [])]
    if not ko or not en:
        return None
    t = dict(DEFAULT_TITLE)
    t['full'] = ko
    t['en_full'] = en
    if len(ko_lines) >= 2:
        t['top'] = ko_lines[0]
        rest = ko_lines[1].split(' ', 1)
        t['main'] = rest[0]
        t['bottom'] = rest[1] if len(rest) > 1 else ''
    else:
        words = ko.split(' ')
        t['top'], t['main'], t['bottom'] = (words + ['', '', ''])[:3] if len(words) >= 3 else ('', ko, '')
    t['short'] = ko_short or t['main']
    if len(en_lines) >= 2:
        t['en_main'], t['en_sub'] = en_lines[0], en_lines[1]
    else:
        parts = en.split(' ', 1)
        t['en_main'], t['en_sub'] = parts[0], (parts[1] if len(parts) > 1 else '')
    # the emblem replaces an 'o' in the second half of the English word when there is one
    w = t['en_main']
    t['emblem_in_en'] = w[len(w) // 2:] if 'o' in w[len(w) // 2:] else ''
    return t


def load_title():
    if os.path.exists(TITLE_CONFIG_JS):
        try:
            t = _read_js_title(TITLE_CONFIG_JS)
            if t:
                return t
        except Exception as e:          # pragma: no cover
            print('ttl_config: could not read %s (%s) - using DEFAULT_TITLE' % (TITLE_CONFIG_JS, e))
    else:
        print('ttl_config: %s not found - using DEFAULT_TITLE' % TITLE_CONFIG_JS)
    return dict(DEFAULT_TITLE)


TITLE = load_title()

FONT_KO = os.path.join(FONTS, 'Jua-Regular.ttf')          # SIL OFL 1.1 (tools/fonts/OFL-Jua.txt)
FONT_EN = os.path.join(FONTS, 'Fredoka-Bold.ttf')         # SIL OFL 1.1 (tools/fonts/OFL-Fredoka.txt)

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
