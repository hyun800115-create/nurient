"""
market_check.py - checks assets/market/ (the first shop's stall stages) against what the game reads.

    python3 tools/blender/market_check.py            exit 1 on any error

  * every atlas in the manifest exists, its JSON frames are the manifest's frames (nothing missing, nothing extra)
  * <stage>_back: building with staffPoints / staffDirs / staffDepth "front" / overlay / signQuad / signText /
    stepLiftPx (5-12 px = 9-22 cm at PPU 64) / footprint; <stage>_front: overlay of it, same frameSize + anchor
  * the staff point, the customer point and the sign corners lie inside the frame; the customer point is in front of
    the clerk (larger y) and to her left (smaller x): the front customer does not stand between camera and clerk
  * signQuad is the board face of a -Y wall: top and bottom edges fall 1 px per 2 px to the right (+-0.08), left /
    right edges vertical; signText is a key of src/data/strings.js in both languages
  * the front layer is smaller than the back layer (it is only the counter) and sits inside it
  * page budget: each stage page <= 1 MiB on disk and <= 1.5 MiB in GPU memory (RGBA)
"""
import json
import os
import re
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(GAME, 'assets', 'market')
errors, notes = [], []


def err(m):
    errors.append(m)


def main():
    man = json.load(open(os.path.join(OUT, 'manifest.json'), encoding='utf-8'))
    strings = open(os.path.join(GAME, 'src', 'data', 'strings.js'), encoding='utf-8').read()
    frames_all = {}
    for a in man.get('atlases', []):
        png, js = os.path.join(GAME, 'assets', a['png']), os.path.join(GAME, 'assets', a['json'])
        if not (os.path.exists(png) and os.path.exists(js)):
            err('atlas %s: missing file' % a['key'])
            continue
        fr = json.load(open(js))['frames']
        im = Image.open(png)
        if os.path.getsize(png) > 1048576:
            err('atlas %s: %d bytes > 1 MiB' % (a['key'], os.path.getsize(png)))
        if im.width * im.height * 4 > 1.5 * 1048576:
            err('atlas %s: %dx%d = %.2f MiB GPU > 1.5' % (a['key'], im.width, im.height, im.width * im.height * 4 / 1048576))
        for n in fr:
            frames_all[n] = (a['key'], fr[n])
        notes.append('%s %dx%d %d frames %.1f KB' % (a['key'], im.width, im.height, len(fr), os.path.getsize(png) / 1024))
    sp = man.get('sprites', {})
    used = set()
    for k, s in sp.items():
        if s.get('frame') not in frames_all or frames_all[s['frame']][0] != s.get('atlas'):
            err('%s: frame %s not in atlas %s' % (k, s.get('frame'), s.get('atlas')))
            continue
        used.add(s['frame'])
        f = frames_all[s['frame']][1]
        if [f['sourceSize']['w'], f['sourceSize']['h']] != s.get('frameSize'):
            err('%s: frameSize %s != atlas source size' % (k, s.get('frameSize')))
    for n in frames_all:
        if n not in used:
            err('frame %s is in an atlas but no sprite uses it' % n)
    for k, s in sp.items():
        if s.get('kind') != 'building':
            continue
        W, H = s['frameSize']
        ax, ay = s['anchor'][0] * W, s['anchor'][1] * H

        def inside(p, what):
            if not (0 <= ax + p[0] < W and 0 <= ay + p[1] < H):
                err('%s: %s %s outside the frame' % (k, what, p))
        for f in ('staffPoints', 'staffDirs', 'overlay', 'signQuad', 'signText', 'stepLiftPx', 'footprint', 'customerPoints'):
            if f not in s:
                err('%s: no %s' % (k, f))
        if errors:
            continue
        if s.get('staffDepth') != 'front':
            err('%s: staffDepth must be "front" (clerk between the layers)' % k)
        if not (5 <= s['stepLiftPx'] <= 12):
            err('%s: stepLiftPx %s outside 5-12' % (k, s['stepLiftPx']))
        st = s['staffPoints'][0]
        inside(st, 'staff point')
        for c in s['customerPoints']:
            inside(c, 'customer point')
            if not (c[1] > st[1] and c[0] < st[0] - 40):
                err('%s: customer point %s is not front-left of the clerk %s' % (k, c, st))
        q = s['signQuad']
        if len(q) != 4:
            err('%s: signQuad needs 4 corners' % k)
        else:
            for p in q:
                inside(p, 'sign corner')
            w = q[1][0] - q[0][0]
            for (a, b) in ((q[0], q[1]), (q[3], q[2])):
                sl = (b[1] - a[1]) / max(1, b[0] - a[0])
                if abs(sl - 0.5) > 0.08:
                    err('%s: sign edge slope %.3f (a -Y wall face falls 0.5)' % (k, sl))
            if q[0][0] != q[3][0] or q[1][0] != q[2][0]:
                err('%s: sign side edges not vertical' % k)
            if w < 60:
                err('%s: sign only %d px wide' % (k, w))
        key = s['signText']
        if len(re.findall(r'\b%s\s*:' % re.escape(key), strings)) < 2:
            err('%s: signText %s missing in strings.js (ko + en)' % (k, key))
        ov = sp.get(s['overlay'])
        if not ov or ov.get('kind') != 'overlay' or ov.get('of') != s['frame']:
            err('%s: overlay %s missing or not marked as its overlay' % (k, s['overlay']))
        elif ov['frameSize'] != s['frameSize'] or ov['anchor'] != s['anchor']:
            err('%s: overlay frameSize / anchor differ' % k)
        else:
            fb, fo = frames_all[s['frame']][1], frames_all[ov['frame']][1]
            bb, ob = fb['spriteSourceSize'], fo['spriteSourceSize']
            if ob['w'] * ob['h'] >= bb['w'] * bb['h'] * 0.6:
                err('%s: front layer %dx%d is not much smaller than the back (%dx%d): more than the counter?' % (
                    k, ob['w'], ob['h'], bb['w'], bb['h']))
            if ob['x'] < bb['x'] - 1 or ob['y'] < bb['y'] - 1 or ob['x'] + ob['w'] > bb['x'] + bb['w'] + 1:
                err('%s: front layer pokes out of the back layer' % k)
    for n in notes:
        print('  ' + n)
    for e in errors:
        print('ERROR ' + e)
    print('market_check: %d sprites, %d errors' % (len(sp), len(errors)))
    sys.exit(1 if errors else 0)


if __name__ == '__main__':
    main()
