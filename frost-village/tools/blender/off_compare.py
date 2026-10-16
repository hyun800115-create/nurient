"""
off_compare.py - before / after sheet of the v42_office polish (docs/build_reports/v42_office_critique.md): the packed
set before the polish (a copy of the first assets/office, or git `rev`) next to assets/office (after), drawn with the
same compositor and the same real staff as off_preview.py.  Writes docs/previews/off_polish_before_after.png.

    python3 tools/blender/off_compare.py --before DIR      # a saved copy of the pre-polish assets/office
    python3 tools/blender/off_compare.py [--rev HEAD]      # or the set as committed at rev

Rows:  H1 the closed office as src/entities/Cutaway.js draws it by day (glow + doubled shadow before)
       H2 소복이 at desk 2 in the default reveal (the door frame across her face before)
       M1 / M2 the visitor bench with two visitors and the chief at his pad
       M5 the safe opened in the default reveal
       M4 the mailbox flag down / up (4x)
       L3 the coin sacks S / M / L (3x)
"""
import io
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(GAME, 'tools'))
import off_preview as OP  # noqa: E402

KEY = 'chief_office'


def git_dir(rev):
    """extract assets/office at `rev` into a temp folder (returns its path, or None)"""
    out = tempfile.mkdtemp(prefix='off_before_')
    try:
        names = subprocess.check_output(['git', '-C', GAME, 'ls-tree', '--name-only', rev, 'assets/office/'],
                                        text=True).split()
    except Exception:                           # noqa: BLE001
        return None
    for n in names:
        data = subprocess.check_output(['git', '-C', GAME, 'show', '%s:./%s' % (rev, n)])
        with open(os.path.join(out, os.path.basename(n)), 'wb') as f:
            f.write(data)
    return out if os.path.exists(os.path.join(out, 'manifest.json')) else None


def gamecut_closed(o):
    """the closed office exactly as src/entities/Cutaway.js draws it (its own rules, on the manifest's cutaway block)"""
    cw = o.e.get('cutaway', {})
    lay = cw.get('layers', {})
    hidden = {lay.get('interior'), lay.get('back'), lay.get('front')}
    cut = cw.get('cut', {}).get('layer')
    cv = Image.new('RGBA', (o.W, o.H), (0, 0, 0, 0))
    for n in cw.get('drawOrder', []):
        if n.startswith('@') or n == cut or n in hidden or n not in o.S:
            continue
        cv.alpha_composite(o.F.frame(o.S[n]['atlas'], o.S[n]['frame']))
    return cv


def crop_at(cv, o, pt, w, h, dy=0, s=2, origin=(40, 30)):
    x = origin[0] + o.ax + pt[0]
    y = origin[1] + o.ay + pt[1] + dy
    c = cv.crop((int(x - w / 2), int(y - h / 2), int(x + w / 2), int(y + h / 2)))
    return c.resize((c.width * s, c.height * s), Image.LANCZOS)


def on_bg(im, bg=(244, 247, 251, 255)):
    b = Image.new('RGBA', im.size, bg)
    b.alpha_composite(im)
    return b


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    rev = argv[argv.index('--rev') + 1] if '--rev' in argv else 'HEAD'
    if '--before' in argv:
        bdir = argv[argv.index('--before') + 1]
        rev = 'pre-polish copy'
    else:
        bdir = git_dir(rev)
        rev = 'git ' + rev
    if not bdir or not os.path.exists(os.path.join(bdir, 'manifest.json')):
        print('no before set (%s) - nothing to compare' % rev)
        return 0
    before, after = OP.Office(bdir), OP.Office(os.path.join(GAME, 'assets', 'office'))
    St = OP.Staff()
    rows = []
    # H1
    r = []
    for o in (before, after):
        g = gamecut_closed(o)
        b = Image.new('RGBA', g.size, (226, 232, 240, 255))
        b.alpha_composite(g)
        r.append(b.crop((60, 40, o.W - 20, o.H - 10)))
    rows.append(('H1  closed office by day, drawn by src/entities/Cutaway.js', r))
    # H2: bok in the default reveal
    r = []
    for o, st in ((before, 'cut'), (after, 'open')):
        cv, _ = OP.compose(o, st, St.cast(o, 1))
        r.append(crop_at(cv, o, o.e['deskPoints'][1], 150, 130, dy=-40))
    rows.append(('H2  소복이 at desk 2, default reveal (door frame)', r))
    # M1 / M2: bench + chief pad
    r = []
    for o, st in ((before, 'cut'), (after, 'open')):
        ppl = [p for p in St.cast(o, 0) if p[0] != 'outside']
        im, an = St.chief('idle', 'NE', 0)
        ppl.append(('front', o.e['chiefDeskPad'], im, an, False))
        cv, _ = OP.compose(o, st, ppl)
        mid = [(o.e['seatPoints'][0][0] + o.e['chiefDeskPad'][0]) / 2, (o.e['seatPoints'][0][1] + o.e['chiefDeskPad'][1]) / 2]
        r.append(crop_at(cv, o, mid, 190, 170, dy=-30))
    rows.append(('M1 / M2  visitor bench + the chief at his pad', r))
    # M5: the safe open in the default reveal
    r = []
    for o, st in ((before, 'cut'), (after, 'open')):
        cv, _ = OP.compose(o, st, [], ovl={'safe': 1})
        gp = o.S['%s_safe' % KEY].get('groundPoint') or [150, -10]
        r.append(crop_at(cv, o, gp, 110, 120, dy=-35, s=3))
    rows.append(('M5  the safe opened, default reveal', r))
    # M4: mailbox down / up
    r = []
    for o in (before, after):
        s = o.S['office_mailbox']
        cell = Image.new('RGBA', (200, 120), (244, 247, 251, 255))
        for k, f in enumerate((s['states']['down'], s['states']['up'])):
            im, an = o.sprite('office_mailbox', f)
            cell.alpha_composite(im, (10 + k * 100 + int(50 - an[0]), int(110 - an[1])))
        r.append(cell.resize((cell.width * 3, cell.height * 3), Image.LANCZOS))
    rows.append(('M4  mailbox flag: down | up', r))
    # L3: coin sacks
    r = []
    for o in (before, after):
        cell = Image.new('RGBA', (3 * 72, 72), (244, 247, 251, 255))
        for k, key in enumerate(('item_coin_sack_s', 'item_coin_sack_m', 'item_coin_sack_l')):
            im, an = o.sprite(key)
            cell.alpha_composite(im, (k * 72, 0))
        r.append(cell.resize((cell.width * 3, cell.height * 3), Image.LANCZOS))
    rows.append(('L3  coin sacks S / M / L', r))
    # layout
    colw = max(max(a.width, b.width) for _, (a, b) in rows)
    H = 50 + sum(max(a.height, b.height) + 44 for _, (a, b) in rows)
    out = Image.new('RGBA', (2 * colw + 60, H), (226, 232, 240, 255))
    OP.title_bar(out, '촌장 사무실 polish: before (%s) | after (assets/office)' % rev)
    y = 50
    for t, (a, b) in rows:
        OP.label(out, t, 20, y, size=15, center=False)
        y += 28
        for k, im in enumerate((a, b)):
            x = 20 + k * (colw + 20)
            out.alpha_composite(on_bg(im), (x, y))
            OP.label(out, 'before' if k == 0 else 'after', x + 40, y + 4, size=13)
        y += max(a.height, b.height) + 16
    path = os.path.join(GAME, 'docs', 'previews', 'off_polish_before_after.png')
    OP.save_rgb(out, path)
    print('[compare] wrote', path)
    return 0


if __name__ == '__main__':
    sys.exit(main())
