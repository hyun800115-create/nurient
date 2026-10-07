"""
tf_proof.py - prove the paper-doll approach: composite the layer renders and compare them
with full renders of the same combination (CONTRACT_V4 J, step 1).

    /tmp/bvenv/bin/python tools/blender/tf_render.py -- --mode head --faces std,kid \
        --parts hair_short,hair_bob,hair_ponytail --cache /tmp/fv_cache/townfolk_proof
    /tmp/bvenv/bin/python tools/blender/tf_render.py -- --mode body --bases adult_slim,child_round \
        --frameset proof --cache /tmp/fv_cache/townfolk_proof
    /tmp/bvenv/bin/python tools/blender/tf_render.py -- --mode full --combos proof --cache /tmp/fv_cache/townfolk_proof
    python3 tools/blender/tf_proof.py [--cache DIR] [--out docs/previews/townfolk_proof.png]

Plain python3 (numpy + Pillow).  Prints per-frame diff stats and writes side-by-side sheets
(full render | composite | diff x4) at 1x and 3x.
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
GAME = os.path.dirname(TOOLS)
sys.path.insert(0, HERE)
sys.path.insert(0, TOOLS)

import tf_anim as ta                      # noqa: E402
import tf_parts as tp                     # noqa: E402
from townfolk_compose import Townfolk, CacheSource   # noqa: E402
from char_pack import ink_outline         # noqa: E402
import tf_layerfx as fx                    # noqa: E402
import townfolk_compose as tc              # noqa: E402


class RingSource(CacheSource):
    """Cache frames with the per-layer ink rings that tf_pack bakes in."""

    def get(self, name):
        key = ('ring', name)
        if key in self._cache:
            return self._cache[key]
        img = CacheSource.get(self, name)
        layer, fr = name.split('/')
        lname = layer.split('@')[0]
        if img is not None and fx.layer_kind(lname) == 'layer':
            if '@' in layer:
                mask = CacheSource.get(self, 'mask@' + layer.split('@')[1] + '/' + fr)
            else:
                mask = CacheSource.get(self, 'head.none/' + fr)
            img = fx.ring_layer(img, None if mask is None else mask[..., 3])
        self._cache[key] = img
        return img

PREV = os.path.join(GAME, 'docs', 'previews')
BG = (201, 214, 232, 255)


def T_from_cache(cache, bases):
    """The manifest 'townfolk' block equivalent, built straight from the cache + registry."""
    import tf_presets as tbc
    tc.SHEEN.update(tbc.SHEEN)
    T = {'tintRef': dict(tbc.TINT_REF), 'tintModel': dict(tbc.TINT_MODEL), 'z': dict(tp.Z), 'faceDirs': ta.FACE_DIRS,
         'parts': {}, 'bases': {}, 'timeline': {}}
    for pn, P in tp.PARTS.items():
        T['parts'][pn] = {'family': P.family, 'space': P.space, 'subs': P.subs, 'hatfit': P.hatfit, 'cls': P.cls}
    tl = ta.timeline()
    for (a, d, i), v in tl.items():
        T['timeline'].setdefault(a, {}).setdefault(d, [None] * ta.ANIMS[a]['frames'])[i] = v
    for b in bases:
        with open(os.path.join(cache, 'body', b, 'meta.json')) as f:
            m = json.load(f)
        ho = {}
        hof = {}
        for k, v in m['headOffset'].items():
            a, d, i = k.rsplit('_', 2)
            ho.setdefault(a, {}).setdefault(d, [None] * ta.ANIMS[a]['frames'])[int(i)] = v
            hof.setdefault(a, {}).setdefault(d, [None] * ta.ANIMS[a]['frames'])[int(i)] = m['headOffsetF'][k]
        T['bases'][b] = {'headOffset': ho, 'headOffsetF': hof, 'age': b.split('_')[0]}
    return T


def stats(a, b):
    """a, b uint8 RGBA arrays. Premultiplied colour difference over the union of both alphas."""
    fa = a.astype(np.float32) / 255
    fb = b.astype(np.float32) / 255
    pa = fa[..., :3] * fa[..., 3:4]
    pb = fb[..., :3] * fb[..., 3:4]
    m = (fa[..., 3] > 0.02) | (fb[..., 3] > 0.02)
    d = np.abs(np.concatenate([pa - pb, fa[..., 3:4] - fb[..., 3:4]], -1)).max(-1)
    dm = d[m]
    return dict(n=int(m.sum()), mean=float(dm.mean() * 255), p99=float(np.percentile(dm, 99) * 255),
                gt16=float((dm > 16 / 255).mean() * 100), gt48=float((dm > 48 / 255).mean() * 100)), d


def on_bg(im, bg=BG):
    c = Image.new('RGBA', im.size, bg)
    c.alpha_composite(im)
    return c


def main():
    args = sys.argv[1:]
    cache = '/tmp/fv_cache/townfolk_proof'
    out = os.path.join(PREV, 'townfolk_proof.png')
    if '--cache' in args:
        cache = args[args.index('--cache') + 1]
    if '--out' in args:
        out = args[args.index('--out') + 1]
    from tf_presets import proof_combos
    combos = proof_combos()
    bases = sorted({c['base'] for c in combos})
    T = T_from_cache(cache, bases)
    tf = Townfolk(T, CacheSource(cache))
    tfr = Townfolk(T, RingSource(cache))
    rows = []
    allst = {'round': [], 'exact': []}
    per_combo = []
    for c in combos:
        person = {'base': c['base'], 'nose': c['nose'], 'face': c['face'], 'parts': c['parts'], 'colors': c['colors']}
        cst = []
        for anim, d, i in c['frames']:
            p = os.path.join(cache, 'full', c['name'], f'{anim}_{d}_{i}.png')
            if not os.path.exists(p):
                continue
            full = Image.open(p).convert('RGBA')
            comp = tf.compose(person, anim, d, i)
            ex = T['bases'][c['base']]['headOffsetF'][anim][d][i]
            comp_ex = tf.compose(person, anim, d, i, exact_head=ex)
            s_r, dmap = stats(np.asarray(full), np.asarray(comp))
            s_e, dmap_e = stats(np.asarray(full), np.asarray(comp_ex))
            allst['round'].append(s_r)
            allst['exact'].append(s_e)
            cst.append(s_e)
            ringed = tfr.compose(person, anim, d, i)
            rows.append((c['name'], f'{anim}_{d}_{i}', full, comp, dmap_e, s_r, s_e, ringed))
        if cst:
            per_combo.append((c['name'], np.mean([s['mean'] for s in cst]), np.mean([s['gt48'] for s in cst])))
    for k in ('round', 'exact'):
        L = allst[k]
        print(f'{k:5s} head offset: frames {len(L)}  mean |d| {np.mean([s["mean"] for s in L]):.2f}/255  '
              f'p99 {np.mean([s["p99"] for s in L]):.1f}  px>16 {np.mean([s["gt16"] for s in L]):.2f}%  '
              f'px>48 {np.mean([s["gt48"] for s in L]):.2f}%')
    for name, m, g48 in per_combo:
        print(f'  {name:45s} mean {m:5.2f}  >48: {g48:5.2f}%')
    # outline check: ringed composite vs ink_outline(full render)
    ost = [stats(np.asarray(ink_outline(r[2])), np.asarray(r[7]))[0] for r in rows]
    print(f'outlined: full+ink_outline vs ringed layers: mean {np.mean([s["mean"] for s in ost]):.2f}  '
          f'px>48 {np.mean([s["gt48"] for s in ost]):.2f}%')
    worst = sorted(rows, key=lambda r: -r[6]['gt48'])[:8]
    print('worst frames:', [(r[0], r[1], round(r[6]['gt48'], 2)) for r in worst])
    # sheets: per combo, 4 frames: full | composite | diff (x3 zoom), plus outlined 1x comparison
    os.makedirs(PREV, exist_ok=True)
    pick = [r for r in rows if r[1] in ('walk_SE_2', 'carry_walk_S_3', 'wave_S_2', 'walk_NE_1', 'happy_E_3', 'talk_E_0')]
    pick = [r for r in pick if r[0].endswith(('top_parka', 'top_sweater')) or 'ponytail' in r[0]][:24]
    z = 3
    cw, chh = 80, 104
    img = Image.new('RGBA', (len(pick) // 2 * 0 + 3 * cw * z + 2 * cw + 20, len(pick) * chh * z // 1), BG)
    W = 3 * cw * z + 3 * cw + 30
    img = Image.new('RGBA', (W, len(pick) * (chh * z + 4) + 30), BG)
    dr = ImageDraw.Draw(img)
    dr.text((6, 6), 'paper-doll proof: full render | composite of layers | |diff| x4   (3x)      1x: full+ink_outline | composite of ringed layers',
            fill=(43, 47, 58, 255))
    y = 26
    for name, fr, full, comp, dmap, sr, se, ringed in pick:
        crop = (24, 4, 104, 108)
        a = on_bg(full.crop(crop)).resize((cw * z, chh * z), Image.NEAREST)
        b = on_bg(comp.crop(crop)).resize((cw * z, chh * z), Image.NEAREST)
        dd = Image.fromarray((np.clip(dmap * 4, 0, 1) * 255).astype(np.uint8)).crop(crop).convert('RGBA')
        dd = dd.resize((cw * z, chh * z), Image.NEAREST)
        img.alpha_composite(a, (0, y))
        img.alpha_composite(b, (cw * z, y))
        img.alpha_composite(dd, (2 * cw * z, y))
        fo = on_bg(ink_outline(full).crop(crop))
        co = on_bg(ringed.crop(crop))
        img.alpha_composite(fo, (3 * cw * z + 10, y))
        img.alpha_composite(co, (3 * cw * z + 10 + cw + 6, y))
        dr.text((3 * cw * z + 10, y + chh + 6), name.replace('__', '\n'), fill=(43, 47, 58, 255))
        dr.text((3 * cw * z + 10, y + chh + 50), f'{fr}\nmean {se["mean"]:.1f} >48 {se["gt48"]:.1f}%',
                fill=(43, 47, 58, 255))
        y += chh * z + 4
    img.convert('RGB').save(out)
    print('->', out)


if __name__ == '__main__':
    main()
