"""
check_fx_city.py - validates assets/fx_city (CONTRACT_V8 §AC).  Exit code 0 = no errors, 1 = errors.
    python3 frost-village/tools/fx/check_fx_city.py [--quiet]
Checks: manifest format + relative paths + files present; every contract key (17 FX sheets, 24 ui4 icons, 4 panels)
resolves; sheet grid sizes (<= 2048 px wide, row-major wrap), NORMAL blend, sane fps / repeat / anchor; no empty
frames; loops seamless (last -> first change within the normal frame-to-frame change); one-shots visible from
frame 0; FX readable on snow (dark-enough rim / colour against #F4F7FB); hose segment seamless in x and flowing by
a constant shift; atlas frames inside the PNG with 96x96 source size and enough fill to read at 32 px; 9-slice
margins / layout boxes inside their images; payload <= 3 MB; no unlisted files.
"""
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
ASSETS = os.path.join(ROOT, 'assets')
DIR = os.path.join(ASSETS, 'fx_city')

CONTRACT_SHEETS = ['fx_fire_bld_s', 'fx_fire_bld_m', 'fx_fire_bld_l', 'fx_fire_window', 'fx_smoke_column', 'fx_embers',
                   'fx_hose_stream', 'fx_water_mist', 'fx_steam_puff', 'fx_fight_cloud', 'fx_alarm_flash',
                   'fx_siren_glow_red', 'fx_siren_glow_blue', 'fx_demolish_dust', 'fx_question_mark',
                   'fx_lightbulb_idea', 'fx_memory_sparkle']
CONTRACT_ICONS = ['ui_icon_piggy', 'ui_icon_loan', 'ui_icon_interest', 'ui_icon_passbook', 'ui_icon_insurance',
                  'ui_icon_story', 'ui_icon_rumor', 'ui_icon_question', 'ui_icon_friend_new', 'ui_icon_memory',
                  'ui_icon_move_in', 'ui_icon_move_out', 'ui_icon_newspaper', 'ui_icon_badge', 'ui_icon_wanted',
                  'ui_icon_cuffs_cute', 'ui_icon_thief', 'ui_icon_fire_alert', 'ui_icon_firetruck', 'ui_icon_hydrant',
                  'ui_icon_box', 'ui_icon_forklift', 'ui_icon_settle', 'ui_icon_stock']
CONTRACT_PANELS = ['ui_wanted_poster', 'ui_newspaper', 'ui_passbook', 'ui_story_card']
PAYLOAD_MAX = 3 * 1024 * 1024
SNOW = np.array([0xF4, 0xF7, 0xFB], np.float32)
EDGE_OK = {'fx_hose_stream', 'fx_hose_rope', 'fx_hose_rope_long', 'fx_hose_tip'}   # touch their frame edges on purpose (tiling / attach side)
HOLD_LAST = {'fx_lightbulb_idea'}                     # one-shots that end visible on purpose (hold frame)


class Report:
    def __init__(self, quiet=False):
        self.err, self.warn, self.info, self.quiet = [], [], [], quiet

    def e(self, m):
        self.err.append(m)

    def w(self, m):
        self.warn.append(m)

    def i(self, m):
        self.info.append(m)


def frames_of(img, fw, fh, n):
    cols = min(n, img.width // fw)
    rows = (n + cols - 1) // cols
    out = []
    for i in range(n):
        x, y = (i % cols) * fw, (i // cols) * fh
        out.append(np.asarray(img.crop((x, y, x + fw, y + fh))).astype(np.float32) / 255.0)
    return out, cols, rows


def check_sheet(R, s):
    k = s['key']
    p = os.path.join(ASSETS, s['png'])
    if not os.path.exists(p):
        R.e('%s: missing %s' % (k, s['png']))
        return
    img = Image.open(p).convert('RGBA')
    fw, fh, n = s['frameWidth'], s['frameHeight'], s['frameCount']
    if img.width > 2048 or img.height > 2048:
        R.e('%s: sheet %dx%d exceeds 2048' % (k, img.width, img.height))
    cols = min(n, img.width // fw)
    rows = (n + cols - 1) // cols
    if img.width != cols * fw or img.height != rows * fh:
        R.e('%s: sheet %dx%d does not match %d frames of %dx%d (%dx%d grid)' % (k, img.width, img.height, n, fw, fh,
                                                                            cols, rows))
        return
    if s.get('blend') != 'NORMAL':
        R.e('%s: blend must be NORMAL (ADD vanishes on snow)' % k)
    if not (1 <= s.get('fps', 0) <= 60):
        R.e('%s: fps %r' % (k, s.get('fps')))
    if s.get('repeat') not in (-1, 0):
        R.e('%s: repeat %r' % (k, s.get('repeat')))
    ax, ay = s.get('anchor', [None, None])
    if not (0 <= ax <= 1 and 0 <= ay <= 1):
        R.e('%s: anchor %r' % (k, s.get('anchor')))
    fr, _, _ = frames_of(img, fw, fh, n)
    cover = [float(f[..., 3].sum()) for f in fr]
    for i, cv in enumerate(cover):
        if cv < 4.0 and not (s['repeat'] == 0 and i == n - 1):
            R.e('%s: frame %d is (nearly) empty' % (k, i))
    if s['repeat'] == 0 and cover[0] < 0.15 * max(cover):
        R.e('%s: one-shot must show the effect from frame 0 (coverage %.0f vs max %.0f)' % (k, cover[0], max(cover)))
    if s['repeat'] == 0 and k not in HOLD_LAST and cover[-1] > 0.8 * max(cover):
        R.w('%s: one-shot does not fade out on its last frame' % k)
    # edges (clipping)
    if k not in EDGE_OK:
        worst = 0.0
        for f in fr:
            a = f[..., 3]
            worst = max(worst, float(a[0].max()), float(a[:, 0].max()), float(a[:, -1].max()), float(a[-1].max()))
        if worst > 0.35:
            R.e('%s: art touches the frame edge (alpha %.2f) - clipped' % (k, worst))
        elif worst > 0.12:
            R.w('%s: faint art at the frame edge (alpha %.2f)' % (k, worst))
    # loop seam
    if s['repeat'] == -1 and n > 2:
        def diff(a, b):
            return float(np.abs(a[..., :3] * a[..., 3:] - b[..., :3] * b[..., 3:]).mean() +
                         np.abs(a[..., 3] - b[..., 3]).mean())
        steps = [diff(fr[i], fr[i + 1]) for i in range(n - 1)]
        seam = diff(fr[-1], fr[0])
        med = float(np.median(steps))
        if seam > 1.6 * max(steps) + 1e-4:
            R.e('%s: loop seam %.4f vs max step %.4f' % (k, seam, max(steps)))
        elif seam > 1.6 * med + 1e-4 and seam > max(steps):
            R.w('%s: loop seam %.4f larger than any step (median %.4f)' % (k, seam, med))
    # readable on snow: covered pixels must differ from the snow colour somewhere (rim / core)
    best = 0.0
    for f in fr:
        m = f[..., 3] > 0.6
        if m.any():
            dlt = np.abs(f[..., :3][m] * 255 - SNOW).sum(axis=1)
            best = max(best, float(np.percentile(dlt, 95)))
    if best < 90:
        R.e('%s: hardly visible on snow (95th pct colour distance %.0f)' % (k, best))
    # hose segment: seamless in x + constant flow
    if k in ('fx_hose_stream', 'fx_hose_rope', 'fx_hose_rope_long'):
        sym = max(float(np.abs(f[..., 3] - f[::-1, :, 3]).mean()) for f in fr)
        if sym > 0.02:
            R.e('%s: jet not vertically symmetric (alpha diff %.3f) - leftward aims would look lit from below' % (k, sym))
        wrap, inner = 0.0, 0.0
        for f0 in fr:                      # column step across the tile seam vs. the largest step inside the tile
            a = np.concatenate([f0[..., :3] * f0[..., 3:], f0[..., 3:]], axis=2)
            colstep = np.abs(np.diff(a, axis=1)).mean(axis=(0, 2))
            wrap = max(wrap, float(np.abs(a[:, 0] - a[:, -1]).mean()))
            inner = max(inner, float(colstep.max()))
        if wrap > 1.25 * inner + 0.005:
            R.e('%s: not seamless in x (seam step %.4f vs max inner step %.4f)' % (k, wrap, inner))
        shift = 32 // n                    # one 32 px bead period per loop -> 4 px per frame
        dv = [float(np.abs(np.roll(fr[i], shift, axis=1)[..., 3] - fr[(i + 1) % n][..., 3]).mean()) for i in range(n)]
        if max(dv) > 0.06:
            R.e('%s: frames are not a constant %d px flow (%.3f)' % (k, shift, max(dv)))
        R.i('%s: seamless x (seam step %.4f <= max inner step %.4f), flow %d px/frame (err %.3f)' % (
            k, wrap, inner, shift, max(dv)))
    R.i('%-20s %3dx%-3d x%2d %2dfps %-4s %5.1f KB' % (k, fw, fh, n, s['fps'], 'loop' if s['repeat'] == -1 else 'once',
                                                     os.path.getsize(p) / 1024))


def main(quiet=False):
    R = Report(quiet)
    mp = os.path.join(DIR, 'manifest.json')
    if not os.path.exists(mp):
        print('ERROR: assets/fx_city/manifest.json missing (run tools/fx/gen_fx_city.py)')
        return 1
    with open(mp, encoding='utf-8') as f:
        man = json.load(f)
    if man.get('version') != 1:
        R.e('manifest version must be 1')
    listed = {'manifest.json'}

    def path_ok(pth, what):
        if os.path.isabs(pth) or '..' in pth.split('/') or not pth.startswith('fx_city/'):
            R.e('%s: bad path %r (must be relative fx_city/...)' % (what, pth))
            return False
        listed.add(pth.split('/', 1)[1])
        if not os.path.exists(os.path.join(ASSETS, pth)):
            R.e('%s: missing file %s' % (what, pth))
            return False
        return True

    sheets = {s['key']: s for s in man.get('spritesheets', [])}
    for k in CONTRACT_SHEETS:
        if k not in sheets:
            R.e('contract sheet missing: %s' % k)
    for k, s in sheets.items():
        if path_ok(s['png'], k):
            check_sheet(R, s)
    # atlas + icons
    atl = {a['key']: a for a in man.get('atlases', [])}
    if 'ui4_icons' not in atl:
        R.e('atlas ui4_icons missing')
    frames = {}
    for key, a in atl.items():
        if path_ok(a['png'], key) and path_ok(a['json'], key):
            img = Image.open(os.path.join(ASSETS, a['png']))
            with open(os.path.join(ASSETS, a['json']), encoding='utf-8') as f:
                js = json.load(f)
            for name, fr in js['frames'].items():
                r = fr['frame']
                if r['x'] < 0 or r['y'] < 0 or r['x'] + r['w'] > img.width or r['y'] + r['h'] > img.height:
                    R.e('%s/%s: frame outside the PNG' % (key, name))
                frames[name] = (key, fr, img)
    spr = man.get('sprites', {})
    for k in CONTRACT_ICONS + ['ui_stamp_bank']:
        s = spr.get(k)
        if not s:
            R.e('contract icon missing: %s' % k)
            continue
        if s.get('atlas') != 'ui4_icons' or s.get('frame') not in frames:
            R.e('%s: frame not in ui4_icons' % k)
            continue
        _, fr, img = frames[s['frame']]
        if (fr['sourceSize']['w'], fr['sourceSize']['h']) != (96, 96):
            R.e('%s: source size %r (want 96x96)' % (k, fr['sourceSize']))
        r = fr['frame']
        crop = img.convert('RGBA').crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h']))
        full = Image.new('RGBA', (96, 96))
        full.alpha_composite(crop, (fr['spriteSourceSize']['x'], fr['spriteSourceSize']['y']))
        a32 = np.asarray(full.resize((32, 32), Image.LANCZOS))[..., 3] / 255.0
        fill = float((a32 > 0.5).mean())
        if fill < 0.22:
            R.e('%s: too thin to read at 32 px (fill %.2f)' % (k, fill))
        a = np.asarray(full)[..., 3]
        if max(a[0].max(), a[-1].max(), a[:, 0].max(), a[:, -1].max()) > 90:
            R.w('%s: icon touches its 96 px frame edge' % k)
    # panels / 9-slice
    imgs = {i['key']: i for i in man.get('images', [])}
    for k in CONTRACT_PANELS:
        if k not in spr or k not in imgs:
            R.e('contract panel missing: %s' % k)
    for k, i in imgs.items():
        if not path_ok(i['png'], k):
            continue
        im = Image.open(os.path.join(ASSETS, i['png']))
        s = spr.get(k, {})
        if s.get('frameSize') != [im.width, im.height]:
            R.e('%s: frameSize %r != image %dx%d' % (k, s.get('frameSize'), im.width, im.height))
        ns = man.get('nineSlice', {}).get(k)
        if ns:
            if ns['left'] + ns['right'] >= im.width or ns['top'] + ns['bottom'] >= im.height:
                R.e('%s: 9-slice margins exceed the image' % k)
            mn = s.get('minSize')
            if mn and (mn[0] < ns['left'] + ns['right'] or mn[1] < ns['top'] + ns['bottom']):
                R.e('%s: minSize %r smaller than its margins' % (k, mn))
        for bk, bv in s.items():
            if bk.endswith('Box') or bk in ('portraitWindow', 'rewardIcon'):
                x, y, w, h = bv
                if bk == 'headlineBox':
                    continue
                if x < 0 or y < 0 or x + w > im.width or y + h > im.height:
                    R.e('%s.%s %r outside %dx%d' % (k, bk, bv, im.width, im.height))
        if k == 'ui_wanted_poster':
            x, y, w, h = s['portraitWindow']
            if (w, h) != (128, 128):
                R.e('ui_wanted_poster: portraitWindow must be 128x128 (portrait size)')
    # guidance blocks the game relies on
    for blk in ('hoseAim', 'fireMount', 'fightGuide'):
        if blk not in man:
            R.e('manifest.%s missing' % blk)
    fm = man.get('fireMount', {})
    btab = fm.get('buildings') or {}
    if not btab:
        R.e('fireMount.buildings (per-building mount table) missing or empty')
    for bk, be in btab.items():
        for f in be.get('fires', []):
            if len(f) != 5 or f[2] not in sheets:
                R.e('fireMount.buildings.%s: bad fire entry %r' % (bk, f))
            elif not (0.5 <= f[3] <= 1.2):
                R.e('fireMount.buildings.%s: fire scale %.2f outside 0.5-1.2' % (bk, f[3]))
        for w in be.get('windows', []):
            if len(w) != 4 or not isinstance(w[2], bool):
                R.e('fireMount.buildings.%s: bad window entry %r' % (bk, w))
        for fld in ('smoke', 'embers', 'glow', 'alarm'):
            if fld not in be:
                R.e('fireMount.buildings.%s: %s missing' % (bk, fld))
    try:                                         # every building that exists NOW should have an entry
        sys.path.insert(0, HERE)
        import gen_fx_city_mount as MT
        missing = [k for _f, k, _m in MT.buildings() if k not in btab]
        if missing:
            R.w('fireMount.buildings lacks %d current buildings (run gen_fx_city.py --mount-only): %s' % (
                len(missing), ', '.join(missing[:12])))
        R.i('fireMount.buildings: %d buildings (%d with several fires, %d with guessed windows)' % (
            len(btab), sum(1 for e in btab.values() if len(e['fires']) > 1),
            sum(1 for e in btab.values() if e.get('windowsGuess'))))
    except Exception as ex:                      # pragma: no cover
        R.w('could not cross-check fireMount.buildings: %s' % ex)
    # GPU memory (RGBA8) per load group: lazy groups are only resident during an incident
    vram = {}
    for k, s_ in sheets.items():
        p_ = os.path.join(ASSETS, s_['png'])
        if os.path.exists(p_):
            w_, h_ = Image.open(p_).size
            g = s_.get('group', 'core') if s_.get('lazy') else 'core'
            if s_.get('lazy') and not s_.get('group'):
                R.e('%s: lazy sheet without a group' % k)
            vram[g] = vram.get(g, 0) + w_ * h_ * 4
    for key, a in atl.items():
        p_ = os.path.join(ASSETS, a['png'])
        if os.path.exists(p_):
            w_, h_ = Image.open(p_).size
            vram['core'] = vram.get('core', 0) + w_ * h_ * 4
    for k, i in imgs.items():
        p_ = os.path.join(ASSETS, i['png'])
        if os.path.exists(p_):
            w_, h_ = Image.open(p_).size
            vram['ui'] = vram.get('ui', 0) + w_ * h_ * 4
    R.i('GPU memory by load group (MB): ' + ', '.join('%s %.1f' % (g, v / 1048576) for g, v in sorted(vram.items())) +
        ' (total %.1f; always resident: core + ui %.1f)' % (sum(vram.values()) / 1048576,
                                                            (vram.get('core', 0) + vram.get('ui', 0)) / 1048576))
    if (vram.get('core', 0) + vram.get('ui', 0)) > 8 * 1048576:
        R.w('always-resident fx_city textures exceed 8 MB')
    # payload + stray files
    tot = 0
    for fn in os.listdir(DIR):
        tot += os.path.getsize(os.path.join(DIR, fn))
        if fn not in listed:
            R.w('unlisted file in assets/fx_city: %s' % fn)
    if tot > PAYLOAD_MAX:
        R.e('payload %.2f MB > 3 MB' % (tot / 1048576))
    R.i('payload %.1f KB (limit 3072 KB), %d sheets, %d icons, %d panels' % (
        tot / 1024, len(sheets), sum(1 for s in spr.values() if s.get('kind') == 'icon'), len(imgs)))
    if not quiet:
        for m in R.info:
            print('  ' + m)
    for m in R.warn:
        print('WARN  ' + m)
    for m in R.err:
        print('ERROR ' + m)
    print('check_fx_city: %d errors, %d warnings' % (len(R.err), len(R.warn)))
    return 1 if R.err else 0


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--quiet', action='store_true')
    sys.exit(main(ap.parse_args().quiet))
