"""
check_ui2.py - validates assets/ui2/ (CONTRACT_V3 §F) built by tools/fx/gen_ui2.py.

Re-run (from anywhere; exit code 0 = no errors, 1 = errors):
    python3 frost-village/tools/fx/check_ui2.py
Checks:
  * manifest parses; every path is relative to assets/ and lives in assets/ui2/; files exist; nothing unreferenced
  * every CONTRACT_V3 §F key resolves (atlas frame / image / spritesheet / nineSlice)
  * atlas frames lie inside the PNG, meta.size matches
  * pads: 192x96 (2:1) frame, footprint, white engraved symbol present, fill colour distinct from every other
    pad (new AND existing assets/ui pads, read-only)
  * icons: 96x96, not clipped by the frame, still solid at 32 px (phone legibility)
  * 9-slice cards: margins fit, both cards share size + margins, stretch cleanly (no transparent holes)
  * ground_road: 512x512 opaque, seamless (same seam test as check_assets.py), clearly darker than ground_snow
    and different in hue from ground_plaza
  * road_edge / fog layers: seamless in x (premultiplied RGBA), soft alpha; fog_bank top fully opaque,
    light blue-white, bottom transparent
  * fog_puff: soft edges (transparent border)
  * sheets: grid size (frames left->right, rows <= 2048 px), no empty frames, fps / repeat / anchor,
    blend == NORMAL, loop closure, frames not cut by their edges, visible (contrast) on their intended ground
  * payload of assets/ui2 <= 1.5 MB
"""
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
ASSETS = os.path.join(ROOT, 'assets')
FOLDER = 'ui2'
sys.path.insert(0, HERE)
import check_assets as CA                               # noqa: E402  (read-only reuse of seam_ratio / Frag)

PADS = ['ui_pad_clerk', 'ui_pad_porter', 'ui_pad_build', 'ui_pad_tower', 'ui_pad_boat', 'ui_pad_register']
ICONS = ['ui_icon_zoom_in', 'ui_icon_zoom_out', 'ui_icon_map', 'ui_icon_hammer', 'ui_icon_house', 'ui_icon_people',
         'ui_icon_clerk', 'ui_icon_porter', 'ui_icon_tools', 'ui_icon_food', 'ui_icon_happy', 'ui_icon_lock_open']
CARDS = ['ui_card', 'ui_card_selected']
SHEETS = ['fx_build_dust', 'fx_build_done', 'fx_wake', 'fx_fire_big']
EXTRA_SHEETS = ['fx_wake_ring']
STRIPS = ['road_edge', 'fog_bank']
EXTRA_STRIPS = ['fog_bank_mid', 'fog_bank_front']
PAYLOAD_MAX = int(1.5 * 1024 * 1024)
GROUND = {'fx_wake': (31, 95, 168), 'fx_wake_ring': (31, 95, 168)}      # intended background per sheet
DEFAULT_GROUND = (244, 247, 251)

errors, warns, notes = [], [], []


def err(m):
    errors.append(m)


def warn(m):
    warns.append(m)


def lum(rgb):
    rgb = np.asarray(rgb, np.float32)
    return rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114


def hue_sat(rgb):
    r, g, b = [float(v) / 255.0 for v in rgb]
    mx, mn = max(r, g, b), min(r, g, b)
    if mx - mn < 1e-6:
        return 0.0, 0.0
    if mx == r:
        h = ((g - b) / (mx - mn)) % 6
    elif mx == g:
        h = (b - r) / (mx - mn) + 2
    else:
        h = (r - g) / (mx - mn) + 4
    return h * 60.0, (mx - mn) / max(mx, 1e-6)


def seam_x_rgba(a):
    """Seam ratio in x for an alpha strip, on premultiplied colour so transparent RGB noise is ignored."""
    a = a.astype(np.float32)
    pm = np.dstack([a[..., :3] * a[..., 3:4] / 255.0, a[..., 3]])
    return CA.seam_ratio(pm, 1)


def pad_fill_colour(arr):
    """Mean colour of the translucent pad fill (pixels that are neither the white border/symbol nor empty)."""
    rgb = arr[..., :3].astype(np.float32)
    al = arr[..., 3]
    mx, mn = rgb.max(-1), rgb.min(-1)
    m = (al > 60) & (al < 245) & ((mx - mn) > 25)
    if m.sum() < 50:
        m = (al > 60) & ((mx - mn) > 25)
    return rgb[m].mean(0) if m.any() else np.zeros(3)


def main():
    f = CA.Frag(FOLDER)
    m = f.m
    if not m:
        print('check_ui2: manifest missing')
        return 1
    # --- paths stay inside assets/ui2
    for sect in ('atlases', 'images', 'spritesheets'):
        for e in m.get(sect, []):
            for fld in ('png', 'json'):
                p = e.get(fld)
                if p and not p.startswith(FOLDER + '/'):
                    err('%s %s path %r is not inside assets/%s/' % (sect, e.get('key'), p, FOLDER))
    # --- pads
    new_cols = {}
    for k in PADS:
        a = f.sprite_rgba(k)
        if a is None:
            continue
        h, w = a.shape[:2]
        if (w, h) != (192, 96):
            err('%s is %dx%d, expected 192x96 (2:1 iso pad)' % (k, w, h))
        s = f.sprites[k]
        if s.get('footprint') != [170, 85]:
            err('%s footprint %r (expected [170, 85] like assets/ui pads)' % (k, s.get('footprint')))
        white = ((a[..., :3].min(-1) > 225) & (a[..., 3] > 200)).sum()
        if white < 900:
            err('%s: engraved white symbol/border too small (%d px)' % (k, white))
        col = pad_fill_colour(a)
        new_cols[k] = col
    old_cols = {}
    try:
        fu = CA.Frag('ui')
        for k in ['ui_pad_input', 'ui_pad_output', 'ui_pad_cash', 'ui_pad_hire', 'ui_pad_upgrade']:
            a = fu.sprite_rgba(k)
            if a is not None:
                old_cols[k] = pad_fill_colour(a)
    except Exception as e:  # noqa: BLE001
        warn('could not read existing assets/ui pads for comparison: %s' % e)
    allc = dict(old_cols)
    allc.update(new_cols)
    keys = list(allc)
    for i, k1 in enumerate(keys):
        for k2 in keys[i + 1:]:
            if k1 not in new_cols and k2 not in new_cols:
                continue
            h1, s1 = hue_sat(allc[k1])
            h2, s2 = hue_sat(allc[k2])
            dh = min(abs(h1 - h2), 360 - abs(h1 - h2))
            dl = abs(float(lum(allc[k1])) - float(lum(allc[k2])))
            if dh < 12 and dl < 25:
                err('pad colours too similar: %s vs %s (hue diff %.0f deg, luma diff %.0f)' % (k1, k2, dh, dl))
            elif dh < 20 and dl < 35:
                warn('pad colours close: %s vs %s (hue diff %.0f deg, luma diff %.0f)' % (k1, k2, dh, dl))
    notes.append('pad fills: ' + ', '.join('%s %s' % (k[7:], '#%02X%02X%02X' % tuple(int(v) for v in c))
                                           for k, c in new_cols.items()))
    # --- icons
    for k in ICONS:
        a = f.sprite_rgba(k)
        if a is None:
            continue
        if a.shape[:2] != (96, 96):
            err('%s is %s, expected 96x96' % (k, a.shape[:2][::-1]))
            continue
        if f.sprites[k].get('kind') != 'icon':
            warn('%s kind %r (expected icon)' % (k, f.sprites[k].get('kind')))
        al = a[..., 3]
        border = max(al[0].max(), al[-1].max(), al[:, 0].max(), al[:, -1].max())
        if border > 90:
            err('%s is clipped by its 96 px frame (border alpha %d)' % (k, border))
        elif border > 50:
            warn('%s touches its frame edge (border alpha %d, drop shadow)' % (k, border))
        small = np.asarray(Image.fromarray(a).resize((32, 32), Image.LANCZOS))
        fill = (small[..., 3] > 128).mean()
        if fill < 0.22:
            err('%s too thin at 32 px (%.0f%% solid)' % (k, fill * 100))
        notes.append('icon %-18s 32px solid %3.0f%%, edge alpha %3d' % (k[8:], fill * 100, border))
    # --- cards (9-slice)
    sizes = {}
    for k in CARDS:
        n = f.nine.get(k)
        if not n:
            err('nineSlice[%s] missing' % k)
            continue
        p = f.images.get(n.get('image', k))
        if not p:
            err('nineSlice[%s] image %s unknown' % (k, n.get('image')))
            continue
        im = Image.open(p).convert('RGBA')
        w, h = im.size
        sizes[k] = (im.size, (n['left'], n['right'], n['top'], n['bottom']))
        if n['left'] + n['right'] >= w or n['top'] + n['bottom'] >= h:
            err('nineSlice[%s] margins do not fit %dx%d' % (k, w, h))
        if k not in f.sprites:
            err('sprites[%s] missing' % k)
        # stretched rendition must stay solid inside the body
        import gen_ui as GU
        big = np.asarray(GU.nine_slice(im, 220, 240, dict(left=n['left'], right=n['right'], top=n['top'],
                                                           bottom=n['bottom'])))
        core = big[40:200, 40:180, 3]
        if core.min() < 250:
            err('%s: stretched card has holes in the body (min alpha %d)' % (k, core.min()))
    if len(sizes) == 2 and sizes['ui_card'] != sizes['ui_card_selected']:
        err('ui_card and ui_card_selected differ in size / margins %s vs %s' % (sizes['ui_card'], sizes['ui_card_selected']))
    # --- ground_road
    a = f.sprite_rgba('ground_road')
    if a is not None:
        if a.shape[:2] != (512, 512):
            err('ground_road is %s, expected 512x512' % (a.shape[:2][::-1],))
        if a[..., 3].min() < 255:
            err('ground_road has transparent pixels')
        rx, ry = CA.seam_ratio(a[..., :3], 1), CA.seam_ratio(a[..., :3], 0)
        notes.append('seam ground_road     x %.2f  y %.2f' % (rx, ry))
        if rx > 1.5 or ry > 1.5:
            err('ground_road is not seamless (x %.2f, y %.2f)' % (rx, ry))
        if f.sprites['ground_road'].get('tile') != 'xy':
            warn('ground_road tile should be "xy"')
        road_l = float(lum(a[..., :3].reshape(-1, 3).mean(0)))
        try:
            snow = np.asarray(Image.open(os.path.join(ASSETS, 'ground', 'ground_snow.png')).convert('RGB'))
            plaza = np.asarray(Image.open(os.path.join(ASSETS, 'ground', 'ground_plaza.png')).convert('RGB'))
            snow_l = float(lum(snow.reshape(-1, 3).mean(0)))
            dl = snow_l - road_l
            h_r, s_r = hue_sat(a[..., :3].reshape(-1, 3).mean(0))
            h_p, s_p = hue_sat(plaza.reshape(-1, 3).mean(0))
            dh = min(abs(h_r - h_p), 360 - abs(h_r - h_p))
            notes.append('ground_road luma %.0f vs snow %.0f (diff %.0f), hue %.0f vs plaza %.0f' % (road_l, snow_l, dl,
                                                                                                     h_r, h_p))
            if dl < 20:
                err('ground_road does not stand out from ground_snow (luma diff %.0f < 20)' % dl)
            if dh < 60:
                err('ground_road hue too close to ground_plaza (%.0f deg)' % dh)
            # structure: a cobble road needs visible local contrast
            std = float(lum(a[..., :3]).std())
            notes.append('ground_road local contrast (luma std) %.1f' % std)
            if std < 12:
                warn('ground_road looks flat (luma std %.1f)' % std)
        except Exception as e:  # noqa: BLE001
            warn('ground comparison skipped: %s' % e)
    # --- strips
    for k in STRIPS + EXTRA_STRIPS:
        if k in EXTRA_STRIPS and k not in f.sprites:
            warn('optional %s missing' % k)
            continue
        a = f.sprite_rgba(k)
        if a is None:
            continue
        if a.shape[1] != 512:
            err('%s width %d (expected 512, seamless in x)' % (k, a.shape[1]))
        r = seam_x_rgba(a)
        notes.append('seam %-15s x %.2f' % (k, r))
        if r > 1.5:
            err('%s is not seamless in x (%.2f)' % (k, r))
        if f.sprites[k].get('tile') != 'x':
            warn('%s tile should be "x"' % k)
        al = a[..., 3].astype(np.float32)
        if al[-1].max() > 24:
            err('%s: bottom row not transparent (alpha %d) - edge would be hard' % (k, al[-1].max()))
        if k == 'road_edge':
            if al[0].mean() > 40:
                err('road_edge: road side (top row) should be mostly transparent (mean alpha %.0f)' % al[0].mean())
            el = f.sprites[k].get('edgeLine', 32)
            if al[el:el + 8].mean() < 150:
                err('road_edge: no solid snow lip at the edge line (mean alpha %.0f)' % al[el:el + 8].mean())
            if not (al > 10).any(axis=0).all():
                err('road_edge has columns with no snow at all')
        if k == 'fog_bank':
            s = f.sprites[k]
            if al[:8].min() < 255:
                err('fog_bank top rows must be fully opaque (min alpha %d)' % al[:8].min())
            col = a[..., :3][al > 250].astype(np.float32).mean(0)
            L = float(lum(col))
            if not (L > 200 and col[2] >= col[0] - 2):
                err('fog_bank colour %s is not a light blue-white' % col.astype(int))
            fc = s.get('fillColor')
            if not fc:
                err('fog_bank.fillColor missing')
            else:
                top = a[0, :, :3].astype(np.float32).mean(0)
                want = np.array([int(fc[i:i + 2], 16) for i in (1, 3, 5)], np.float32)
                if np.abs(top - want).max() > 8:
                    err('fog_bank top row %s does not match fillColor %s' % (top.astype(int), fc))
            if s.get('opaqueRows', 0) < 60:
                warn('fog_bank opaque region is only %r rows' % s.get('opaqueRows'))
            notes.append('fog_bank opaque rows %s, body bottom %s, colour %s' % (s.get('opaqueRows'), s.get('bodyBottom'),
                                                                                 col.astype(int)))
        if k in ('fog_bank_mid', 'fog_bank_front') and al[0].max() > 24:
            err('%s: top row should be transparent (it hangs in front of the wall)' % k)
    # --- fog_puff
    a = f.sprite_rgba('fog_puff')
    if a is not None:
        border = max(a[0, :, 3].max(), a[-1, :, 3].max(), a[:, 0, 3].max(), a[:, -1, 3].max())
        if border > 24:
            err('fog_puff touches its frame (border alpha %d)' % border)
        if a[..., 3].max() < 180:
            err('fog_puff too faint')
    # --- sheets
    for k in SHEETS + EXTRA_SHEETS:
        if k not in f.sheets:
            (warn if k in EXTRA_SHEETS else err)('spritesheets[%s] missing' % k)
            continue
        p, s = f.sheets[k]
        img = Image.open(p)
        fw, fh, n = s.get('frameWidth'), s.get('frameHeight'), s.get('frameCount')
        if not (isinstance(fw, int) and isinstance(fh, int) and isinstance(n, int) and n > 0):
            err('%s frame fields invalid' % k)
            continue
        cols = max(1, min(n, img.width // fw))
        rows = -(-n // cols)
        if img.size != (cols * fw, rows * fh):
            err('%s png is %s, expected %s (%d x %d grid)' % (k, img.size, (cols * fw, rows * fh), cols, rows))
            continue
        if img.width > 2048 or img.height > 2048:
            warn('%s sheet larger than 2048 px' % k)
        if s.get('blend') != 'NORMAL':
            err('%s blend must be NORMAL (ADD vanishes on snow), got %r' % (k, s.get('blend')))
        if not (isinstance(s.get('fps'), (int, float)) and s['fps'] > 0):
            err('%s fps invalid' % k)
        if s.get('repeat') not in (-1, 0):
            err('%s repeat must be -1 or 0' % k)
        anc = s.get('anchor')
        if not (isinstance(anc, list) and len(anc) == 2 and all(0 <= v <= 1 for v in anc)):
            err('%s anchor invalid %r' % (k, anc))
        arr = np.asarray(img.convert('RGBA'))
        frames = []
        for i in range(n):
            r, c = divmod(i, cols)
            frames.append(arr[r * fh:(r + 1) * fh, c * fw:(c + 1) * fw])
        empty = [i for i, fr in enumerate(frames) if fr[..., 3].max() < 8]
        if empty and (s.get('repeat') == -1 or len(empty) > 1 or empty[0] != n - 1):
            err('%s has empty frames %s' % (k, empty))
        cut = [i for i, fr in enumerate(frames) if max(fr[0, :, 3].max(), fr[-1, :, 3].max(), fr[:, 0, 3].max(),
                                                       fr[:, -1, 3].max()) > 40]
        if cut:
            warn('%s frames %s touch the frame edge' % (k, cut))
        if s.get('repeat') == -1 and n > 2:
            fr = [x.astype(np.float32) for x in frames]
            steps = [np.abs(fr[i + 1] - fr[i]).mean() for i in range(n - 1)]
            wrap = np.abs(fr[0] - fr[-1]).mean()
            notes.append('loop %-14s wrap %.2f / mean step %.2f' % (k, wrap, np.mean(steps)))
            if wrap > 2.0 * max(np.mean(steps), 1e-3):
                err('%s loop pops at the wrap (%.2f vs %.2f)' % (k, wrap, np.mean(steps)))
        # readability on the intended ground: mean colour difference where the effect is visible
        bg = np.array(GROUND.get(k, DEFAULT_GROUND), np.float32)
        diffs = []
        for fr in frames[:max(1, n - 1)]:
            al = fr[..., 3:4].astype(np.float32) / 255.0
            comp = fr[..., :3] * al + bg * (1 - al)
            vis = al[..., 0] > 0.3
            if vis.sum() > 20:
                diffs.append(float(np.abs(comp - bg).sum(-1)[vis].mean()))
        md = float(np.mean(diffs)) if diffs else 0.0
        notes.append('contrast %-13s on %s: %.0f' % (k, '#%02X%02X%02X' % tuple(int(v) for v in bg), md))
        if md < 45:
            err('%s barely visible on its ground (mean colour diff %.0f)' % (k, md))
    # --- payload + unreferenced
    f.unreferenced()
    d = os.path.join(ASSETS, FOLDER)
    total = sum(os.path.getsize(os.path.join(d, x)) for x in os.listdir(d))
    notes.append('payload assets/%s %.1f KB (limit %.0f KB)' % (FOLDER, total / 1024, PAYLOAD_MAX / 1024))
    if total > PAYLOAD_MAX:
        err('payload %.2f MB exceeds 1.5 MB' % (total / 1048576))
    # CA.Frag reports into check_assets' own lists - merge them
    errors.extend(CA.errors)
    warns.extend(CA.warns)
    for x in notes:
        print('  ' + x)
    for w in warns:
        print('WARN  ' + w)
    for e in errors:
        print('ERROR ' + e)
    print('check_ui2: %d error(s), %d warning(s)' % (len(errors), len(warns)))
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
