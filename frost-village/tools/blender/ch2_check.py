"""
ch2_check.py - verify assets/chief2 (CONTRACT_V42 AH: the chief's v4.2 anims, character player_b).

    python3 tools/blender/ch2_check.py            # exit code 1 on any error

Checks: the 3-file budget; manifest shape (extends player, atlas, frameSize / anchor identical to the player);
every contract anim with its frames / fps / repeat / dirs (S, SE, E) and the sit_write impactFrame + sit_read
loopFrom; every frame name present, 128 x 128 source size, inside the sheet, no two frames overlapping; sheet
<= 2048 a side and the RGBA source-sum <= 3.5 MiB; anchors (standing feet on the anchor line, seated boots hanging
below the seat point), headTop = the player's, headTopSit ~ -62; impactPoint / seat points inside the frame and the
impact point on the stamp; `_desk` overlays aligned with (a subset of) their full frames; the props really show;
and the existing char_player / tools untouched (git).

Polish checks (docs/build_reports/v42_chief2_critique.md): the alias anims sit_read_in / sit_read_loop point at the
very same rectangles as sit_read 0-1 / 2-5 (M2); every standing frame keeps the idle's boots - same ground row and
boot columns as char_player idle within 1 px - except the cheer hop frames (L2); the cheer hop lifts the boots
>= 8 px and the pennant shows in every cheer frame (H1); per-anim headTop / cheer propTop cover the frames (L4);
the pacing hints exist (L3); no `_desk` overlay pixel lies more than 3 px past the desk's near-edge line toward
him (L5).
"""
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import ch2_anim as ca      # noqa: E402

A = os.path.join(GAME, 'assets')
OUT = os.path.join(A, 'chief2')
CONTRACT = {   # CONTRACT_V42 AH table: frames, fps, repeat (+ extras)
    'sit_idle': (4, 4, -1), 'sit_write': (6, 8, -1), 'sit_read': (6, 6, -1), 'sit_eat': (6, 8, -1),
    'doze': (4, 3, -1), 'talk': (8, 10, -1), 'wave': (6, 10, -1), 'warm_hands': (4, 5, -1), 'cheer': (6, 10, -1),
}
SEATED = {'sit_idle', 'sit_write', 'sit_read', 'sit_eat', 'doze'}
errors, notes = [], []


def err(msg):
    errors.append(msg)


def main():
    files = sorted(os.listdir(OUT)) if os.path.isdir(OUT) else []
    if files != ['char_player_b.json', 'char_player_b.png', 'manifest.json']:
        err(f'assets/chief2 must hold exactly the 3 budget files, has {files}')
    with open(os.path.join(OUT, 'manifest.json'), encoding='utf-8') as f:
        man = json.load(f)
    with open(os.path.join(A, 'characters', 'manifest.json'), encoding='utf-8') as f:
        player = json.load(f)['characters']['player']
    for k in ('version', 'generator', 'conventions', 'atlases', 'characters'):
        if k not in man:
            err(f'manifest: missing {k}')
    at = man['atlases'][0]
    if at != {'key': 'char_player_b', 'png': 'chief2/char_player_b.png', 'json': 'chief2/char_player_b.json'}:
        err(f'manifest atlases[0] = {at}')
    ch = man['characters'].get('player_b')
    if not ch:
        err('characters.player_b missing')
        return
    if ch.get('extends') != 'player' or ch.get('atlas') != 'char_player_b':
        err('player_b must extend "player" with atlas "char_player_b"')
    for k in ('frameSize', 'anchor', 'frameName'):
        if ch.get(k) != player.get(k):
            err(f'player_b.{k} {ch.get(k)} != player {player.get(k)}')
    if ch.get('dirs') != ['S', 'SE', 'E'] or ch.get('mirror') != {'SW': 'SE', 'W': 'E'}:
        err(f'dirs / mirror: {ch.get("dirs")} {ch.get("mirror")}')
    if ch.get('headTop') != player.get('headTop'):
        err(f'headTop {ch.get("headTop")} != player {player.get("headTop")}')
    anims = ch['anims']
    if not set(CONTRACT) <= set(anims):
        err(f'anims {sorted(anims)} miss contract anims {sorted(set(CONTRACT) - set(anims))}')
    extra = {a for a in anims if a not in CONTRACT}
    if extra != {'sit_read_in', 'sit_read_loop'}:
        err(f'unexpected extra anims {sorted(extra)} (only the sit_read aliases are allowed)')
    for al in sorted(extra):
        if not anims[al].get('aliasOf'):
            err(f'{al}: an extra anim must be an alias (aliasOf)')
    for an, (n, fps, rep) in CONTRACT.items():
        e = anims.get(an, {})
        if (e.get('frames'), e.get('fps'), e.get('repeat')) != (n, fps, rep):
            err(f'{an}: frames/fps/repeat {e.get("frames")}/{e.get("fps")}/{e.get("repeat")} != {n}/{fps}/{rep}')
        if e.get('dirs') != ['S', 'SE', 'E']:
            err(f'{an}: dirs {e.get("dirs")}')
        if bool(e.get('seated')) != (an in SEATED):  # noqa: E501  (contract anims)
            err(f'{an}: seated flag {e.get("seated")}')
    if anims['sit_write'].get('impactFrame') != 4:
        err('sit_write impactFrame must be 4')
    if anims['sit_read'].get('loopFrom') != 2:
        err('sit_read loopFrom must be 2')
    if anims['sit_read'].get('playAs') != ['sit_read_in', 'sit_read_loop']:
        err('sit_read.playAs must name the alias anims')
    if 'whole 0-5 loop' in json.dumps(man['conventions']):
        err('conventions still offer the plain 0-5 sit_read loop (M2)')
    if not anims['cheer'].get('repeatDelay') or not anims['doze'].get('frameHold'):
        err('pacing hints missing: cheer.repeatDelay / doze.frameHold (L3)')
    if 'stovePoint' not in anims['doze'].get('placeAt', ''):
        err('doze.placeAt must warn against office stovePoint (M3)')

    # ---- atlas
    with open(os.path.join(OUT, 'char_player_b.json')) as f:
        aj = json.load(f)
    sheet = Image.open(os.path.join(OUT, 'char_player_b.png')).convert('RGBA')
    sw, sh = sheet.size
    if [sw, sh] != [aj['meta']['size']['w'], aj['meta']['size']['h']]:
        err(f'atlas json size {aj["meta"]["size"]} != png {sheet.size}')
    if sw > 2048 or sh > 2048:
        err(f'sheet {sw}x{sh} > 2048')
    mib = sw * sh * 4 / 1048576
    if mib > 3.5:
        err(f'RGBA source-sum {mib:.2f} MiB > 3.5 MiB budget')
    fr = aj['frames']
    rects = []
    for name, e in fr.items():
        r = e['frame']
        if e['sourceSize'] != {'w': 128, 'h': 128}:
            err(f'{name}: sourceSize {e["sourceSize"]}')
        if r['x'] < 0 or r['y'] < 0 or r['x'] + r['w'] > sw or r['y'] + r['h'] > sh:
            err(f'{name}: frame rect outside the sheet')
        ss = e['spriteSourceSize']
        if ss['x'] < 0 or ss['y'] < 0 or ss['x'] + ss['w'] > 128 or ss['y'] + ss['h'] > 128:
            err(f'{name}: spriteSourceSize outside 128 x 128')
        rects.append((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h'], name))
    # alias frames share their source's rectangle on purpose: check overlaps between DISTINCT rectangles only
    uniq = {}
    for r in sorted(rects):
        uniq.setdefault(r[:4], r)
    rects = sorted(uniq.values())
    for i, a in enumerate(rects):
        for b in rects[i + 1:]:
            if b[0] >= a[2]:
                break
            if b[1] < a[3] and a[1] < b[3]:
                err(f'frames overlap in the sheet: {a[4]} / {b[4]}')

    def full(name):
        e = fr[name]
        f_, ss = e['frame'], e['spriteSourceSize']
        im = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
        im.paste(sheet.crop((f_['x'], f_['y'], f_['x'] + f_['w'], f_['y'] + f_['h'])), (ss['x'], ss['y']))
        return np.asarray(im)

    for al, e in anims.items():
        src = e.get('aliasOf')
        if not src:
            continue
        sa = anims.get(src['anim'], {})
        if e.get('fps') != sa.get('fps') or e.get('dirs') != sa.get('dirs') or \
                src['from'] + e['frames'] > sa.get('frames', 0):
            err(f'{al}: alias does not fit {src}')
        for d in e['dirs']:
            for i in range(e['frames']):
                for suf in (('', '_desk') if e.get('deskOverlay') else ('',)):
                    n1, n2 = f'{al}_{d}_{i}{suf}', f'{src["anim"]}_{d}_{src["from"] + i}{suf}'
                    if n1 in fr and n2 in fr and fr[n1] != fr[n2]:
                        err(f'{n1}: alias entry differs from {n2} (must share the rectangle)')
    expected = set()
    for an, e in anims.items():
        for d in e['dirs']:
            for i in range(e['frames']):
                expected.add(f'{an}_{d}_{i}')
                if e.get('deskOverlay'):
                    expected.add(f'{an}_{d}_{i}_desk')
    missing = sorted(expected - set(fr))
    extra = sorted(set(fr) - expected)
    if missing:
        err(f'{len(missing)} frames missing, e.g. {missing[:5]}')
    if extra:
        err(f'{len(extra)} unexpected frames, e.g. {extra[:5]}')
    if set(ch.get('deskOverlay', {}).get('anims', [])) != {a for a, e in anims.items() if e.get('deskOverlay')}:
        err('deskOverlay.anims does not match the anims flagged deskOverlay')

    # ---- anchors, head tops, opaque content
    ay = 104
    sit_tops = []
    hops, stand_tops = [], {}
    psheet = Image.open(os.path.join(A, 'characters', 'char_player.png')).convert('RGBA')
    with open(os.path.join(A, 'characters', 'char_player.json')) as f:
        pfr = json.load(f)['frames']

    def pfull(name):
        e = pfr[name]
        f_, ss = e['frame'], e['spriteSourceSize']
        im = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
        im.paste(psheet.crop((f_['x'], f_['y'], f_['x'] + f_['w'], f_['y'] + f_['h'])), (ss['x'], ss['y']))
        return np.asarray(im)

    def feet(a, rows=7):
        m = a[..., 3] > 128
        bot = int(np.where(m.any(1))[0][-1])
        cols = m[bot - rows + 1:bot + 1].any(0)
        runs, i = [], 0
        while i < 128:
            if cols[i]:
                j = i
                while j < 128 and cols[j]:
                    j += 1
                runs.append((i, j - 1))
                i = j
            else:
                i += 1
        return bot, runs
    IDLE_FEET = {d: feet(pfull(f'idle_{d}_0')) for d in ('S', 'SE', 'E')}
    for an, e in anims.items():
        for d in e['dirs']:
            for i in range(e['frames']):
                name = f'{an}_{d}_{i}'
                if name not in fr:
                    continue
                a = full(name)[..., 3]
                op = a > 40
                n_op = int(op.sum())
                if n_op < 1500:
                    err(f'{name}: only {n_op} opaque px')
                ys = np.where(op.any(1))[0]
                top, bot = int(ys[0]), int(ys[-1])
                if top <= 1:
                    err(f'{name}: touches the frame top (clipped)')
                if e.get('seated'):
                    if not (ay + 8 <= bot <= 127):
                        err(f'{name}: seated boots should hang below the seat point (bottom {bot - ay:+d} px)')
                    if an == 'sit_idle' and d == 'S':
                        sit_tops.append(int(np.where((a > 0).any(1))[0][0]) - ay)
                else:
                    hop = an == 'cheer' and i in (2, 3)
                    if not hop and not (ay - 1 <= bot <= ay + 8):
                        err(f'{name}: standing feet bottom {bot - ay:+d} px off the anchor line')
                    if not hop:
                        # (L2) planted: the boots keep the char_player idle ground row and stance (+-1 px)
                        fb, runs = feet(full(name))
                        ib, iruns = IDLE_FEET[d]
                        if abs(fb - ib) > 1:
                            err(f'{name}: boots at {fb - ay:+d} px, idle {ib - ay:+d} (feet sink / float)')
                        if len(runs) != len(iruns) or any(abs(r[0] - q[0]) > 1 or abs(r[1] - q[1]) > 1
                                                          for r, q in zip(runs, iruns)):
                            if not (an == 'cheer' and d == 'E' and i == 0 and len(runs) == len(iruns) and
                                    runs[-1][1] == iruns[-1][1]):      # the squat's coat hem reaches the boot row
                                err(f'{name}: boot columns {runs} != idle {iruns} (stance shuffles)')
                    if an == 'cheer' and i == 2:
                        settled = int(np.where((full(f'cheer_{d}_5')[..., 3] > 40).any(1))[0][-1])
                        hop_px = settled - bot
                        hops.append(hop_px)
                        if hop_px < 8:
                            err(f'{name}: the hop should lift his boots >= 8 px (lifts {hop_px})')
                    if an == 'cheer':
                        aa = full(name).astype(int)
                        flag = ((aa[..., 2] > aa[..., 0] + 60) & (aa[..., 1] > aa[..., 0] + 30) &
                                (aa[..., 3] > 160)).sum()
                        if flag < 25:
                            err(f'{name}: the pennant hardly shows ({flag} teal px)')
                    if an in ('talk', 'wave', 'warm_hands'):
                        stand_tops[an] = min(stand_tops.get(an, 0), top - ay)
                    if an == 'talk' and d == 'S' and abs((top - ay) - player['headTop']) > 2:
                        err(f'{name}: head top {top - ay} vs player headTop {player["headTop"]} (scale drift?)')
                xs = np.where(op.any(0))[0]
                if xs[0] <= 0 or xs[-1] >= 127:
                    err(f'{name}: touches the frame side (clipped)')
                if e.get('deskOverlay'):
                    # the overlay is cut from its own full frame: its opaque pixels lie on the full frame's
                    # opaque pixels with the same colours (the palette dither may differ by a few levels)
                    dk = full(name + '_desk').astype(int)
                    base = full(name).astype(int)
                    m = dk[..., 3] > 128
                    if m.any():
                        inside = (base[..., 3][m] > 64).mean()
                        if inside < 0.99:
                            err(f'{name}_desk: {100 * (1 - inside):.1f} % of the overlay lies off its frame (misaligned)')
                        dc = np.abs(dk[m][:, :3] - base[m][:, :3]).mean()
                        if dc > 6:
                            err(f'{name}_desk: overlay colours differ from its frame by {dc:.1f} (misaligned)')
                        if ((dk[..., 3] - base[..., 3]) > 48).mean() > 0.002:
                            err(f'{name}_desk: overlay more opaque than its frame')
    hts = ch.get('headTopSit')
    if sit_tops and abs(hts - min(sit_tops)) > 1:
        err(f'headTopSit {hts} != measured {min(sit_tops)}')
    if not (-75 <= (hts or 0) <= -55):
        err(f'headTopSit {hts} outside [-75, -55] (contract ~ -62)')

    # ---- (L4) per-anim head tops cover the frames; cheer propTop = the pennant's top
    for an, t in stand_tops.items():
        ht = anims[an].get('headTop', ch.get('headTop'))
        if t < ht - 1:
            err(f'{an}: frames reach {t} px but its headTop is {ht} (add anims.{an}.headTop)')
    ct = min(int(np.where((full(f'cheer_{d}_{i}')[..., 3] > 0).any(1))[0][0]) - ay
             for d in ('S', 'SE', 'E') for i in range(6))
    if anims['cheer'].get('propTop') != ct:
        err(f'cheer.propTop {anims["cheer"].get("propTop")} != measured {ct}')
    if not (ct <= anims['cheer'].get('headTop', 0) <= ch['headTop']):
        err(f'cheer.headTop {anims["cheer"].get("headTop")} outside [{ct}, {ch["headTop"]}]')

    # ---- (L5) desk overlays stay on the desk side of the desk's near-edge line (on screen)
    import math
    yaw = {'S': 45.0, 'SE': 90.0, 'E': 135.0}

    def proj(v, yd):
        x, y, z = v
        a_ = math.radians(yd)
        wx, wy = x * math.cos(a_) - y * math.sin(a_), x * math.sin(a_) + y * math.cos(a_)
        c = math.cos(math.radians(45))
        return (wx + wy) * c * 64, -((-wx + wy) * c * 0.5 + z * math.cos(math.radians(30))) * 64
    worst = 0.0
    for d in ('S', 'SE', 'E'):
        tx, ty = proj((1, 0, 0), yaw[d])
        fx, fy = proj((0, -1, 0), yaw[d])
        tl = math.hypot(tx, ty)
        tx, ty = tx / tl, ty / tl
        nx, ny = fx - (fx * tx + fy * ty) * tx, fy - (fx * tx + fy * ty) * ty
        nl = math.hypot(nx, ny)
        nx, ny = nx / nl, ny / nl
        ex, ey = 64 + ch['seat']['deskEdgePoint'][d][0], ay + ch['seat']['deskEdgePoint'][d][1]
        yy, xx = np.mgrid[0:128, 0:128].astype(np.float32)
        dist = (xx + 0.5 - ex) * nx + (yy + 0.5 - ey) * ny
        for an in ch.get('deskOverlay', {}).get('anims', []):
            if anims.get(an, {}).get('aliasOf'):
                continue
            for i in range(anims[an]['frames']):
                m = full(f'{an}_{d}_{i}_desk')[..., 3] > 0
                if m.any():
                    worst = min(worst, float(dist[m].min()))
    if worst < -3.0:
        err(f'a _desk overlay reaches {-worst:.1f} px past the desk edge line toward him (L5: <= 3)')
    notes.append(f'cheer hop {min(hops) if hops else 0} px, pennant top {ct}, cheer headTop {anims["cheer"].get("headTop")}; '
                 f'desk overlays <= {-worst:.1f} px past the edge line')

    # ---- points inside the frame; the impact point sits on the stamp
    ip = anims['sit_write'].get('impactPoint', {})
    for d in ('S', 'SE', 'E'):
        if d not in ip:
            err(f'sit_write impactPoint missing {d}')
            continue
        x, y = 64 + ip[d][0], ay + ip[d][1]
        if not (0 <= x < 128 and 0 <= y < 128):
            err(f'sit_write impactPoint {d} {ip[d]} outside the frame')
            continue
        a = full(f'sit_write_{d}_4').astype(int)
        win = a[max(0, y - 5):y + 6, max(0, x - 5):x + 6]
        stamp = ((win[..., 0] > win[..., 1] + 30) & (win[..., 0] > 90) & (win[..., 3] > 100)).sum()
        if stamp < 2:
            err(f'sit_write impactPoint {d}: no stamp (red face / wood) within 5 px')
    for d, p in ch['seat'].get('deskEdgePoint', {}).items():
        if not (0 <= 64 + p[0] < 128 and 0 <= ay + p[1] < 128):
            err(f'seat.deskEdgePoint.{d} {p} outside the frame')
    if ch['seat'].get('floorBelowPx') != 25:
        err(f'seat.floorBelowPx {ch["seat"].get("floorBelowPx")} != 25 (0.45 m x 64 x cos 30)')
    if ch['seat'].get('heightM') != 0.45 or abs(ch['seat'].get('deskTopM', 0) - 0.72) > 1e-6:
        err('seat heightM / deskTopM must be 0.45 / 0.72')

    # ---- the props really show (colour counts in the packed frames)
    def count(name, pred):
        a = full(name).astype(int)
        return int((pred(a) & (a[..., 3] > 160)).sum())
    paper = lambda a: (a[..., 0] > 200) & (a[..., 1] > 190) & (a[..., 2] > 150) & (a[..., 0] - a[..., 2] > 18)
    teal = lambda a: (a[..., 2] > a[..., 0] + 50) & (a[..., 1] > a[..., 0] + 20)
    red = lambda a: (a[..., 0] > 150) & (a[..., 0] > a[..., 1] + 40) & (a[..., 0] > a[..., 2] + 70)   # bowl + stew
    for d in ('S', 'SE'):
        for i in range(2, 6):
            if count(f'sit_read_{d}_{i}', paper) < 60:
                err(f'sit_read_{d}_{i}: the newspaper hardly shows')
        if max(count(f'sit_write_{d}_{i}', teal) for i in range(6)) < 8:
            err(f'sit_write {d}: the quill hardly shows')
        if count(f'sit_eat_{d}_0', red) < 15:
            err(f'sit_eat_{d}_0: the bowl hardly shows')

    # ---- nothing else touched (git)
    try:
        out = subprocess.run(['git', 'status', '--porcelain', '--', 'assets/characters', 'tools/blender/char_anim.py',
                              'tools/blender/char_build.py', 'tools/blender/char_geo.py', 'tools/blender/char_render.py',
                              'tools/blender/char_pack.py', 'tools/blender/bl_common.py', 'tools/pack_utils.py'],
                             cwd=GAME, capture_output=True, text=True, timeout=30).stdout.strip()
        if out:
            err(f'protected files changed: {out}')
        else:
            notes.append('assets/characters + char_* / bl_common / pack_utils unchanged (git)')
    except Exception as ex:      # pragma: no cover
        notes.append(f'git check skipped ({ex})')

    n_alias = sum(1 for k in fr if k.startswith(('sit_read_in_', 'sit_read_loop_')))
    n_base = sum(1 for k in fr if not k.endswith('_desk')) - sum(1 for k in fr if k.startswith(('sit_read_in_', 'sit_read_loop_')) and not k.endswith('_desk'))
    notes.append(f'{n_base} frames + {len(fr) - n_base - n_alias} desk overlays (+ {n_alias} alias names), {len(rects)} '
                 f'rectangles, sheet {sw}x{sh}, RGBA source-sum {mib:.2f} MiB, '
                 f'png {os.path.getsize(os.path.join(OUT, "char_player_b.png")) / 1024:.0f} KB, headTopSit {hts}')


if __name__ == '__main__':
    main()
    for n in notes:
        print('  ok  ', n)
    for e in errors:
        print('  ERROR', e)
    print(f'ch2_check: {len(errors)} error(s)')
    sys.exit(1 if errors else 0)
