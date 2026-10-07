"""
townfolk_compose.py - reference compositor for the townfolk paper-doll layers (CONTRACT_V4 J).

The game (Phaser) mirrors exactly this logic; keep the two in sync.  Plain python3 +
numpy + Pillow.  Usage as a library:

    from townfolk_compose import Townfolk
    tf = Townfolk.from_assets()                      # assets/townfolk/manifest.json + atlases
    person = tf.random_person(seed=7)                # or tf.preset('police', seed=1)
    img = tf.compose(person, 'walk', 'SW', 3)        # 128x128 RGBA, anchor (64,104)

CLI:
    python3 tools/townfolk_compose.py --seed 7 --anim walk --dir SE --out /tmp/p.png

A person = {base, nose, face, parts: [part names], colors: {slot: '#hex'}}.

Per frame (anim, dir, i):
  1. mirrored dirs (SW/W/NW) are composed as SE/E/NE and flipped at the end.
  2. BODY layers come from frame  '<layer>@<base>/<anim>_<dir>_<i>'  placed at (0,0) of the
     128x128 frame: limbs arm_R/arm_L/hand_R/hand_L + every sub of every body part.
  3. HEAD layers come from frame  '<layer>/<hp>_<dir>'  (hp = timeline head pose) placed so the
     head-frame anchor HEAD_ANCHOR lands on body anchor + headOffset[base][anim][dir][i]:
     head.<nose> (skin), face.<set>.<expr> (no tint, S/SE/E only), brow.<set>.<shape> (hair),
     every sub of every head part ('<part>.<sub>~hat' instead of '<part>.<sub>' for hair when a
     'full' hat is worn).
  4. each layer is tinted:  rgb *= T,  T = colour / tintRef[slot] per channel, clamped to 1
     (Phaser setTint on the same sRGB values); fixed-colour subs (tint null) are not tinted.
  5. layers are drawn in ascending z (sub z may differ per dir; limbs listed in the frame's
     timeline zfront use z 90 / 91 instead of 5 / 6), ties keep insertion order:
     limbs, body parts, head, face, brows, head parts.
Missing frames (fully transparent, dropped by the packer) are simply skipped.
"""
import json
import os
import random
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
ASSETS = os.path.join(GAME, 'assets')
FRAME = 128
ANCHOR = (64, 104)
HEAD_ANCHOR = (64, 72)
MIRROR = {'SW': 'SE', 'W': 'E', 'NW': 'NE'}
LIMBS = [('arm_R', 'sleeve', 5, 90), ('arm_L', 'sleeve', 5, 90), ('hand_R', 'hands', 6, 91),
         ('hand_L', 'hands', 6, 91)]


def hex_rgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], np.float32)


def srgb_to_lin(v):
    v = np.asarray(v, np.float32)
    return np.where(v <= 0.04045, v / 12.92, ((v + 0.055) / 1.055) ** 2.4)


def lin_to_srgb(v):
    v = np.clip(np.asarray(v, np.float32), 0, None)
    return np.where(v <= 0.0031308, v * 12.92, 1.055 * v ** (1 / 2.4) - 0.055)


TINT_MODEL = {'K': 0.85, 'S': [0.030, 0.033, 0.040]}


def tint_for(color, ref, model=None):
    """Phaser tint (0..1 per channel) that turns a layer rendered with albedo `ref` into `color`:
    T = clamp01( sRGB(K*lin(C) + S) / sRGB(K*lin(ref) + S) )  (K typical irradiance, S additive
    sky specular - plain C/ref ignores the specular film and makes dark colours too dark)."""
    m = model or TINT_MODEL
    K, S = m['K'], np.asarray(m['S'], np.float32)
    num = lin_to_srgb(K * srgb_to_lin(hex_rgb(color)) + S)
    den = lin_to_srgb(K * srgb_to_lin(hex_rgb(ref)) + S)
    return np.clip(num / np.maximum(den, 1e-3), 0.0, 1.0)


def tint_hex(color, ref, model=None):
    t = tint_for(color, ref, model)
    return '#%02X%02X%02X' % tuple(int(round(float(v) * 255)) for v in t)


SHEEN = {'gain': 1.6, 'pow': 0.8}


def sheen_alpha(img):
    """Specular-only render (black glossy override) -> white highlight with alpha.
    alpha = 1.6 * S_lin^0.8 approximates adding the specular in linear light when drawn as a
    normal-alpha white overlay (screen-like) on top of the diffuse layer."""
    a = img[..., 3:4]
    s = srgb_to_lin(img[..., :3]).max(-1, keepdims=True)
    al = np.clip(SHEEN['gain'] * np.power(np.maximum(s, 0), SHEEN['pow']), 0, 1) * a
    return np.concatenate([np.ones_like(img[..., :3]), al], -1).astype(np.float32)


def over(dst, src):
    """src over dst, both float32 straight-alpha RGBA arrays (H, W, 4) in 0..1."""
    sa = src[..., 3:4]
    da = dst[..., 3:4]
    oa = sa + da * (1 - sa)
    rgb = (src[..., :3] * sa + dst[..., :3] * da * (1 - sa)) / np.maximum(oa, 1e-6)
    return np.concatenate([rgb, oa], -1)


def paste(canvas_shape, img, dx, dy):
    """Place img (h, w, 4) with its top-left at (dx, dy) on an empty canvas (integer shift)."""
    H, W = canvas_shape
    out = np.zeros((H, W, 4), np.float32)
    h, w = img.shape[:2]
    x0, y0 = max(0, dx), max(0, dy)
    x1, y1 = min(W, dx + w), min(H, dy + h)
    if x1 <= x0 or y1 <= y0:
        return out
    out[y0:y1, x0:x1] = img[y0 - dy:y1 - dy, x0 - dx:x1 - dx]
    return out


# --------------------------------------------------------------------------- sources

class AtlasSource:
    """Frames from the packed atlases (assets/townfolk)."""

    def __init__(self, assets=ASSETS):
        self.assets = assets
        with open(os.path.join(assets, 'townfolk', 'manifest.json'), encoding='utf-8') as f:
            self.man = json.load(f)
        self.T = self.man['townfolk']
        self.sheets = {}
        self.frames = {}
        for at in self.man['atlases']:
            with open(os.path.join(assets, at['json'])) as f:
                js = json.load(f)
            for name, fr in js['frames'].items():
                self.frames[name] = (at['key'], fr)
            self.sheets[at['key']] = os.path.join(assets, at['png'])
        self._img = {}
        self._cache = {}

    def _sheet(self, key):
        if key not in self._img:
            self._img[key] = np.asarray(Image.open(self.sheets[key]).convert('RGBA')).astype(np.float32) / 255.0
        return self._img[key]

    def get(self, name):
        if name in self._cache:
            return self._cache[name]
        hit = self.frames.get(name)
        if hit is None:
            self._cache[name] = None
            return None
        key, fr = hit
        sh = self._sheet(key)
        r = fr['frame']
        ss = fr['spriteSourceSize']
        out = np.zeros((fr['sourceSize']['h'], fr['sourceSize']['w'], 4), np.float32)
        out[ss['y']:ss['y'] + r['h'], ss['x']:ss['x'] + r['w']] = sh[r['y']:r['y'] + r['h'], r['x']:r['x'] + r['w']]
        self._cache[name] = out
        return out


class CacheSource:
    """Raw renders straight from the tf_render cache (used to prove the layering before packing)."""

    def __init__(self, cache):
        self.cache = cache
        self._cache = {}

    def get(self, name):
        if name in self._cache:
            return self._cache[name]
        layer, fr = name.split('/')
        if '@' in layer:
            lname, base = layer.split('@')
            p = os.path.join(self.cache, 'body', base, fr, lname + '.png')
        else:
            p = os.path.join(self.cache, 'head', fr, layer + '.png')
        out = None
        if os.path.exists(p):
            out = np.asarray(Image.open(p).convert('RGBA')).astype(np.float32) / 255.0
            if layer.endswith('.sheen'):
                out = sheen_alpha(out)
            if out[..., 3].max() <= 1.0 / 255:
                out = None
        self._cache[name] = out
        return out


# --------------------------------------------------------------------------- composer

class Townfolk:
    def __init__(self, T, source):
        """T = the manifest's 'townfolk' block (or an equivalent dict built from the cache)."""
        self.T = T
        self.src = source
        self.parts = T['parts']

    @classmethod
    def from_assets(cls, assets=ASSETS):
        src = AtlasSource(assets)
        return cls(src.T, src)

    # ---- frame bookkeeping
    def tl(self, anim, d, i):
        return self.T['timeline'][anim][d][i]

    def head_offset(self, base, anim, d, i):
        return self.T['bases'][base]['headOffset'][anim][d][i]

    def wears_full_hat(self, person):
        return any(self.parts[p]['family'] == 'hat' and self.parts[p].get('cls') == 'full' for p in person['parts'])

    def tint(self, person, slot):
        if slot is None:
            return None
        col = person['colors'].get(slot)
        if col is None and slot.endswith('2'):
            col = person['colors'].get(slot[:-1])
        if col is None:
            return None
        ref = self.T['tintRef'].get(slot, self.T['tintRef']['default'])
        return tint_for(col, ref, self.T.get('tintModel'))

    def layers(self, person, anim, d, i):
        """[(z, frame name, tint or None, 'body'|'head')] in draw order for a RENDERED dir."""
        base = person['base']
        tl = self.tl(anim, d, i)
        hp = tl['hp']
        out = []
        zf = set(tl.get('zfront', []))
        for name, slot, z, zfront in LIMBS:
            out.append((zfront if name in zf else z, f'{name}@{base}/{anim}_{d}_{i}', self.tint(person, slot), 'body'))
        hat = self.wears_full_hat(person)
        heads = []
        for pn in person['parts']:
            P = self.parts[pn]
            for s, sd in P['subs'].items():
                z = sd['z'][d] if isinstance(sd['z'], dict) else sd['z']
                if P['space'] == 'body':
                    out.append((z, f'{pn}.{s}@{base}/{anim}_{d}_{i}', self.tint(person, sd['tint']), 'body'))
                else:
                    suffix = '~hat' if (hat and P.get('hatfit')) else ''
                    heads.append((z, f'{pn}.{s}{suffix}/{hp}_{d}', self.tint(person, sd['tint']), 'head'))
                    if sd.get('sheen'):
                        heads.append((z + 0.5, f'{pn}.{s}{suffix}.sheen/{hp}_{d}', None, 'head'))
        Zh = self.T['z']
        out.append((Zh['head'], f'head.{person.get("nose", "dot")}/{hp}_{d}', self.tint(person, 'skin'), 'head'))
        if d in self.T['faceDirs']:
            fs = person.get('face', 'std')
            out.append((Zh['face'], f'face.{fs}.{tl["face"]}/{hp}_{d}', None, 'head'))
            out.append((Zh['brow'], f'brow.{fs}.{tl["brow"]}/{hp}_{d}', self.tint(person, 'hair'), 'head'))
        out += heads
        order = {id(x): k for k, x in enumerate(out)}
        out.sort(key=lambda x: (x[0], order[id(x)]))
        return out

    def compose(self, person, anim, d, i, exact_head=None):
        """RGBA uint8 PIL image (128x128, anchor (64,104)).  exact_head=(dx,dy) floats overrides
        the integer head offset (sub-pixel bilinear shift, for error analysis only)."""
        flip = d in MIRROR
        rd = MIRROR.get(d, d)
        canvas = np.zeros((FRAME, FRAME, 4), np.float32)
        hoff = self.head_offset(person['base'], anim, rd, i)
        for z, name, tint, space in self.layers(person, anim, rd, i):
            img = self.src.get(name)
            if img is None:
                continue
            if tint is not None:
                img = img.copy()
                img[..., :3] *= tint
            if space == 'head':
                if exact_head is not None:
                    img = shift_float(img, ANCHOR[0] + exact_head[0] - HEAD_ANCHOR[0],
                                      ANCHOR[1] + exact_head[1] - HEAD_ANCHOR[1])
                else:
                    img = paste((FRAME, FRAME), img, ANCHOR[0] + hoff[0] - HEAD_ANCHOR[0],
                                ANCHOR[1] + hoff[1] - HEAD_ANCHOR[1])
            canvas = over(canvas, img)
        out = Image.fromarray((np.clip(canvas, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')
        if flip:
            out = out.transpose(Image.FLIP_LEFT_RIGHT)
        return out

    def sprite_count(self, person, anim='walk', d='S', i=0):
        return sum(1 for _, name, _, _ in self.layers(person, anim, MIRROR.get(d, d), i) if self.src.get(name) is not None)

    # ---- people
    def random_person(self, seed=None, rng=None):
        rng = rng or random.Random(seed)
        gen = self.T['generator']
        return generate(self.T, gen, rng)

    def preset(self, name, seed=0):
        rng = random.Random(seed)
        return generate(self.T, self.T['presets'][name], rng, preset=name)


def shift_float(img, dx, dy):
    """Bilinear sub-pixel shift (premultiplied) - analysis helper."""
    ix, iy = int(np.floor(dx)), int(np.floor(dy))
    fx, fy = dx - ix, dy - iy
    pm = img.copy()
    pm[..., :3] *= pm[..., 3:4]
    acc = np.zeros((FRAME, FRAME, 4), np.float32)
    for ox, oy, w in ((0, 0, (1 - fx) * (1 - fy)), (1, 0, fx * (1 - fy)), (0, 1, (1 - fx) * fy), (1, 1, fx * fy)):
        acc += w * paste((FRAME, FRAME), pm, ix + ox, iy + oy)
    a = acc[..., 3:4]
    acc[..., :3] /= np.maximum(a, 1e-6)
    return acc


# --------------------------------------------------------------------------- generator

def _pick(rng, opts):
    """opts: list of names or {name: weight}."""
    if isinstance(opts, dict):
        names = list(opts)
        w = [opts[n] for n in names]
        return rng.choices(names, w)[0]
    return rng.choice(opts)


def generate(T, gen, rng, preset=None):
    """Build a person from a generator / preset description (see manifest 'generator', 'presets',
    'rules').  Pure data-driven so the game can port it 1:1."""
    rules = T['rules']
    pal = T['palettes']
    base = gen.get('base') if isinstance(gen.get('base'), str) else _pick(rng, gen.get('bases', rules['baseWeights']))
    age = T['bases'][base]['age']
    agerule = rules['byAge'][age]
    person = {'base': base, 'parts': [], 'colors': {}, 'preset': preset}
    person['face'] = _pick(rng, gen.get('faces', agerule['faces']))
    person['nose'] = _pick(rng, gen.get('noses', agerule['noses']))

    def allowed(pn):
        P = T['parts'][pn]
        return pn in T['parts'] and (not P.get('ages') or age in P['ages'])

    def choose(fam_key, default_opts, chance=1.0):
        opts = gen.get(fam_key, default_opts)
        if opts is None:
            return None
        if isinstance(opts, str):
            opts = [opts]
        if isinstance(opts, list):
            opts = [o for o in opts if o == 'none' or allowed(o)]
        else:
            opts = {k: v for k, v in opts.items() if k == 'none' or allowed(k)}
        if not opts:
            return None
        ch = gen.get(fam_key + 'Chance', chance)
        if rng.random() > ch:
            return None
        p = _pick(rng, opts)
        return None if p == 'none' else p

    top = choose('tops', agerule['tops'])
    bottom = choose('bottoms', agerule['bottoms'])
    if top and T['parts'][top].get('dress'):
        bottom = choose('bottomsUnderDress', agerule.get('bottomsUnderDress', ['bot_tights']))
    shoes = choose('shoes', agerule['shoes'])
    hat = choose('hats', agerule['hats'], agerule.get('hatChance', 0.5))
    hair = choose('hair', agerule['hair'])
    if hat and hair:
        bad = set(T['parts'][hat].get('excludeHair', [])) | set(T['parts'][hair].get('excludeHat', []))
        if hair in bad or hat in bad or ('tall' in T['parts'][hair].get('tags', []) and T['parts'][hat].get('cls') == 'full'
                                         and hair not in T['parts'][hat].get('allowHair', [hair])):
            if 'hats' not in gen:
                hat = None
            else:
                hair = choose('hairUnderHat', agerule.get('hairUnderHat', agerule['hair']))
    facial = choose('facialHair', agerule.get('facialHair', ['none']), agerule.get('facialHairChance', 0.0))
    accs = []
    for fam, default, ch in (('glasses', agerule.get('glasses', ['none']), agerule.get('glassesChance', 0.2)),
                             ('neck', agerule.get('neck', ['none']), agerule.get('neckChance', 0.4)),
                             ('bag', agerule.get('bag', ['none']), agerule.get('bagChance', 0.25)),
                             ('headAcc', agerule.get('headAcc', ['none']), agerule.get('headAccChance', 0.15))):
        a = choose(fam, default, ch)
        if a:
            accs.append(a)
    extra = list(gen.get('extra', []))
    chosen = [x for x in [hair, hat, facial, top, bottom, shoes] + accs + extra if x]
    # exclusions (e.g. earmuffs + full hat, scarf + high collar)
    final = []
    for pn in chosen:
        P = T['parts'][pn]
        if any(e in final for e in P.get('exclude', [])) or any(pn in T['parts'][f].get('exclude', []) for f in final):
            continue
        final.append(pn)
    person['parts'] = final
    # colours
    cols = person['colors']
    gcol = gen.get('colors', {})

    def col(slot, palname):
        v = gcol.get(slot)
        if isinstance(v, str) and v.startswith('#'):
            return v
        if isinstance(v, str):
            palname = v
        elif isinstance(v, list):
            return rng.choice(v)
        return rng.choice(pal[palname])
    cols['skin'] = col('skin', 'skin')
    cols['hair'] = col('hair', agerule.get('hairPalette', 'hair'))
    cols['top'] = col('top', 'cloth')
    cols['top2'] = col('top2', 'accent')
    cols['fur'] = col('fur', 'fur')
    cols['bottom'] = col('bottom', 'pants')
    cols['bottom2'] = col('bottom2', 'tights')
    cols['shoes'] = col('shoes', 'shoes')
    cols['hat'] = col('hat', 'knit')
    cols['hat2'] = col('hat2', 'accent')
    cols['acc'] = col('acc', 'knit')
    cols['acc2'] = col('acc2', 'accent')
    cols['bag'] = col('bag', 'leather')
    cols['glasses'] = col('glasses', 'metal')
    cols['job'] = col('job', 'cloth')
    cols['job2'] = col('job2', 'accent')
    sleeve = gcol.get('sleeve')
    cols['sleeve'] = sleeve if (isinstance(sleeve, str) and sleeve.startswith('#')) else \
        (cols.get(sleeve) if isinstance(sleeve, str) else (cols['top2'] if top and T['parts'][top].get('sleeves') == 'top2'
                                                          else cols['top']))
    gl = gen.get('gloveChance', agerule.get('gloveChance', 0.3))
    cols['hands'] = gcol.get('hands') if isinstance(gcol.get('hands'), str) and gcol.get('hands', '').startswith('#') \
        else (rng.choice(pal['gloves']) if rng.random() < gl else cols['skin'])
    return person


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--preset', default=None)
    ap.add_argument('--anim', default='walk')
    ap.add_argument('--dir', default='S')
    ap.add_argument('--frame', type=int, default=0)
    ap.add_argument('--out', default='townfolk_person.png')
    a = ap.parse_args()
    tf = Townfolk.from_assets()
    p = tf.preset(a.preset, a.seed) if a.preset else tf.random_person(a.seed)
    print(json.dumps(p, ensure_ascii=False))
    tf.compose(p, a.anim, a.dir, a.frame).save(a.out)
    print('->', a.out)


if __name__ == '__main__':
    main()
