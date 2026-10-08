"""
ttl_config.py - ONE place for the title art's texts, fonts and palette.

Rename the game here and re-run tools/blender/ttl_build.sh: the logos, the short logo, the
English logo, the app icon and every preview are rebuilt from these values.  The same values are
copied into assets/title/manifest.json -> "meta" so the game can read them at run time.

Pure python (no bpy): imported by the Blender scripts AND by the plain-python packers.
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))          # frost-village/
FONTS = os.path.join(GAME, 'tools', 'fonts')

# ------------------------------------------------------------------ texts (change the name here)
TITLE = {
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
    'main': [('#9BDCFF', '#3D8BE0'),     # ice blue
             ('#FFB2C6', '#E8506F'),     # berry pink (the flower)
             ('#FFE27A', '#F2A21C'),     # coin gold
             ('#93EBD9', '#24A893')],    # mint
    'top': ('#FFE68A', '#F5A623'),       # 행복한: coin gold
    'en': [('#9BDCFF', '#3D8BE0')],
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
