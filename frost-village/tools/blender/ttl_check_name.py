"""
ttl_check_name.py - check the game's name BEFORE any Blender time is spent (plain python + Pillow).

    python3 tools/blender/ttl_check_name.py            # exit 1 with a clear message when a logo cannot be built

Prints how TITLE_NAME (src/title/config.js) splits into the logo rows, which font draws every
character, and stops when: the big word is empty or has a space, or a character has no glyph in any
logo font (Jua -> Pretendard ExtraBold fallback for Korean; Fredoka for English).
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import ttl_config as C      # noqa: E402


def main():
    t = C.TITLE
    src = t.get('_source', {})
    print('name (ko): %s   [rows from %s]' % (t['full'], src.get('ko', 'DEFAULT_TITLE')))
    print('   top  : %r' % t['top'])
    print('   main : %r' % t['main'])
    print('   sign : %r' % t['bottom'])
    print('   short: %r' % t['short'])
    print('name (en): %s   [rows from %s]' % (t['en_full'], src.get('en', 'DEFAULT_TITLE')))
    print('   top  : %r' % t.get('en_top', ''))
    print('   main : %r   (emblem replaces an "o" in %r)' % (t['en_main'], t.get('emblem_in_en', '')))
    print('   sign : %r' % t['en_sub'])
    errs, warns = C.validate_title(t)
    for w in warns:
        print('note :', w)
    for e in errs:
        print('ERROR:', e)
    print('TTL_NAME', 'FAIL' if errs else 'OK')
    sys.exit(1 if errs else 0)


if __name__ == '__main__':
    main()
