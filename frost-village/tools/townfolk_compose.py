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
  2. BODY layers come from frame  '<layer>@<render base>/<anim>_<dir>_<i>'  placed at (0,0) of
     the 128x128 frame: limbs arm_R/arm_L/hand_R/hand_L + every sub of every body part.  'round'
     bases have render = the slim base of their age and scaleX (body layers stretched around the
     anchor; head layers never - their headOffset already includes the stretch).
  3. HEAD layers come from frame  '<layer>/<hp>_<dir>'  (hp = timeline head pose) placed so the
     head-frame anchor HEAD_ANCHOR lands on body anchor + headOffset[base][anim][dir][i]:
     head.<nose> (skin), face.<set>.<expr> (no tint, S/SE/E only), brow.<set>.<shape> (hair),
     every sub of every head part ('<part>.<sub>~hat' instead of '<part>.<sub>' for hair when a
     'full' hat is worn).
  4. each layer is tinted:  rgb *= T,  T = colour / tintRef[slot] per channel, clamped to 1
     (Phaser setTint on the same sRGB values); fixed-colour subs (tint null) are not tinted.
  5. layers are drawn in ascending z (sub z may differ per dir; limbs listed in the frame's
     timeline zfront use z 90 / 91 instead of 5 / 6; subs with 'follow': limb (cuffs) use that
     limb's z + 0.5), ties keep insertion order:
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


TINT_MODEL = {'K': 1.0, 'S': [0.020, 0.022, 0.028],
              'slotS': {'skin': [0, 0, 0], 'hands': [0, 0, 0], 'hair': [0, 0, 0], 'fur': [0, 0, 0]}}


def tint_for(color, ref, model=None, slot=None):
    """Phaser tint (0..1 per channel) that turns a layer rendered with albedo `ref` into `color`:
    T = clamp01( sRGB(K*lin(C) + S) / sRGB(K*lin(ref) + S) )  (K typical irradiance, S additive
    sky specular - plain C/ref ignores the specular film and makes dark colours too dark)."""
    m = model or TINT_MODEL
    K = m['K']
    S = np.asarray(m.get('slotS', {}).get(slot, m['S']), np.float32)
    num = lin_to_srgb(K * srgb_to_lin(hex_rgb(color)) + S)
    den = lin_to_srgb(K * srgb_to_lin(hex_rgb(ref)) + S)
    return np.clip(num / np.maximum(den, 1e-3), 0.0, 1.0)


def tint_hex(color, ref, model=None, slot=None):
    t = tint_for(color, ref, model, slot)
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

CHANCE_KEY = {'hats': 'hat'}          # generator table key -> its '<x>Chance' probability key


def iter_tf_frames(js):
    """(name, (x, y, w, h, dx, dy)) for every frame of a 'tfatlas' JSON (see tf_pack.compact_atlas)."""
    for prefix, groups in js['frames'].items():
        for g, v in groups.items():
            if not any(isinstance(e, list) for e in v):          # single rect (0 = missing frame in lists)
                yield f'{prefix}/{g}', tuple(v)
                continue
            for i, r in enumerate(v):
                if r:
                    yield f'{prefix}/{g}_{i}', tuple(r)


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
            for name, rect in iter_tf_frames(js):
                self.frames[name] = (at['key'], rect)
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
        key, (x, y, w, h, dx, dy) = hit
        sh = self._sheet(key)
        out = np.zeros((128, 128, 4), np.float32)
        out[dy:dy + h, dx:dx + w] = sh[y:y + h, x:x + w]
        self._cache[name] = out
        return out


class CacheSource:
    """Raw renders straight from the tf_render cache (used to prove the layering before packing).
    Cache layout (tiled renders, 128x128 tiles):
      body/<base>/<anim>_<dir>/<layer>.png   tile i = frame i (body/<base>/meta.json 'tile': w, h, cols and
                                             the tile's offset ox, oy inside the 128x128 frame)
      head/<pose>_<dir>/<layer>.png          (head/meta.json layout 'dirs'; one 128x128 file per frame)"""
    BODY_COLS = 4

    def __init__(self, cache):
        self.cache = cache
        self._cache = {}
        self._sheets = {}
        hm = os.path.join(cache, 'head', 'meta.json')
        self.head_meta = json.load(open(hm)) if os.path.exists(hm) else {'frames': [], 'cols': 6}
        self.head_index = {f: k for k, f in enumerate(self.head_meta['frames'])}

    def _tile(self, base):
        key = ('tile', base)
        if key not in self._sheets:
            mp = os.path.join(self.cache, 'body', base, 'meta.json')
            m = json.load(open(mp)) if os.path.exists(mp) else {}
            self._sheets[key] = m.get('tile', {'w': FRAME, 'h': FRAME, 'cols': self.BODY_COLS, 'ox': 0, 'oy': 0})
        return self._sheets[key]

    def _sheet(self, p):
        if p not in self._sheets:
            self._sheets[p] = (np.asarray(Image.open(p).convert('RGBA')).astype(np.float32) / 255.0
                               if os.path.exists(p) else None)
        return self._sheets[p]

    def raw(self, name):
        layer, fr = name.split('/')
        if '@' in layer:
            lname, base = layer.split('@')
            anim_dir, i = fr.rsplit('_', 1)
            p = os.path.join(self.cache, 'body', base, anim_dir, lname + '.png')
            tl = self._tile(base)
            sh = self._sheet(p)
            if sh is None:
                return None
            k = int(i)
            x, y = (k % tl['cols']) * tl['w'], (k // tl['cols']) * tl['h']
            out = np.zeros((FRAME, FRAME, 4), np.float32)
            out[tl['oy']:tl['oy'] + tl['h'], tl['ox']:tl['ox'] + tl['w']] = sh[y:y + tl['h'], x:x + tl['w']]
            return out
        elif self.head_meta.get('layout') == 'dirs':
            p = os.path.join(self.cache, 'head', fr, layer + '.png')
            sh = self._sheet(p)
            return None if sh is None else sh.copy()
        else:
            p = os.path.join(self.cache, 'head', layer + '.png')
            if fr not in self.head_index:
                return None
            k, cols = self.head_index[fr], self.head_meta.get('cols', 6)
        sh = self._sheet(p)
        if sh is None:
            return None
        x, y = (k % cols) * FRAME, (k // cols) * FRAME
        return sh[y:y + FRAME, x:x + FRAME].copy()

    def get(self, name):
        if name in self._cache:
            return self._cache[name]
        out = self.raw(name)
        layer = name.split('/')[0]
        if out is not None and layer.endswith('.sheen'):
            out = sheen_alpha(out)
        if out is not None and out[..., 3].max() <= 1.0 / 255:
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
        return tint_for(col, ref, self.T.get('tintModel'), slot)

    def render_base(self, base):
        B = self.T['bases'][base]
        return B.get('render', base), B.get('scaleX', 1.0)

    def layers(self, person, anim, d, i):
        """[(z, frame name, tint or None, 'body'|'head')] in draw order for a RENDERED dir."""
        base, _ = self.render_base(person['base'])
        tl = self.tl(anim, d, i)
        hp = tl['hp']
        out = []
        zf = set(tl.get('zfront', []))
        limbz = {}
        for name, slot, z, zfront in LIMBS:
            limbz[name] = zfront if name in zf else z
            out.append((limbz[name], f'{name}@{base}/{anim}_{d}_{i}', self.tint(person, slot), 'body'))
        hat = self.wears_full_hat(person)
        heads = []
        for pn in person['parts']:
            P = self.parts[pn]
            for s, sd in P['subs'].items():
                z = sd['z'][d] if isinstance(sd['z'], dict) else sd['z']
                if sd.get('follow'):
                    z = limbz[sd['follow']] + 0.5
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
        _, sx = self.render_base(person['base'])
        for z, name, tint, space in self.layers(person, anim, rd, i):
            img = self.src.get(name)
            if img is None:
                continue
            if tint is not None:
                img = img.copy()
                img[..., :3] *= tint
            if space == 'body' and sx != 1.0:
                img = scale_x(img, sx)
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
        return generate(self.T, rng or random.Random(seed))

    def preset(self, name, seed=0, rng=None):
        return generate(self.T, rng or random.Random(seed), preset=name)


def scale_x(img, s, cx=ANCHOR[0]):
    """Stretch a frame horizontally by s around column cx (round body builds), bilinear on
    premultiplied colour - what Phaser does for sprite.setScale(s, 1) with origin x 0.5."""
    W = img.shape[1]
    xs = cx + (np.arange(W, dtype=np.float32) + 0.5 - cx) / s - 0.5
    x0 = np.floor(xs).astype(int)
    f = (xs - x0)[None, :, None]
    pm = img.copy()
    pm[..., :3] *= pm[..., 3:4]
    pad = np.zeros((img.shape[0], W + 2, 4), np.float32)
    pad[:, 1:W + 1] = pm
    a = pad[:, np.clip(x0 + 1, 0, W + 1)]
    b = pad[:, np.clip(x0 + 2, 0, W + 1)]
    out = a * (1 - f) + b * f
    al = out[..., 3:4]
    out[..., :3] /= np.maximum(al, 1e-6)
    return out


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
    """opts: list of names or {name: weight}; returns None for an empty table."""
    if not opts:
        return None
    if isinstance(opts, dict):
        names = [n for n in opts if opts[n] > 0]
        if not names:
            return None
        return rng.choices(names, [opts[n] for n in names])[0]
    return rng.choice(list(opts))


def _matches(T, pn, key):
    P = T['parts'].get(pn)
    if P is None:
        return False
    if key.startswith('family:'):
        return P['family'] == key[7:]
    if key.startswith('tag:'):
        return key[4:] in P.get('tags', [])
    return pn == key


def conflicts(T, a, b):
    for x, y in T['generator']['exclude']:
        if (_matches(T, a, x) and _matches(T, b, y)) or (_matches(T, a, y) and _matches(T, b, x)):
            return True
    return False


def generate(T, rng, preset=None):
    """A random person (or one of the named job presets) from the manifest 'generator' block.
    Deterministic for a given rng state; the game ports this function 1:1."""
    G = T['generator']
    P = dict(G['presets'][preset]) if preset else {}
    base = _pick(rng, P.get('bases') or G['baseWeights'])
    age = T['bases'][base]['age']
    A = G['byAge'][age]
    look = P.get('look') or rng.choice(['A', 'B'])
    avail = set(T['bases'][base]['parts'])          # body parts rendered for this base

    def ok(pn):
        part = T['parts'].get(pn)
        if part is None:
            return False
        if part.get('ages') and age not in part['ages']:
            return False
        return part['space'] == 'head' or pn in avail

    def table(key):
        if key in P:
            v = P[key]
        else:
            v = A.get(key)
        if isinstance(v, dict) and v and set(v) <= {'A', 'B'}:
            v = v.get(look, {})
        if v is None:
            return None
        if isinstance(v, str):
            v = [v]
        if isinstance(v, list):
            return [x for x in v if ok(x)]
        return {k: w for k, w in v.items() if ok(k)}

    def chance(key, default=1.0):
        ck = CHANCE_KEY.get(key, key) + 'Chance'                  # 'hats' -> 'hatChance'
        return P.get(ck, A.get(ck, default))

    def maybe(key, default=1.0, avoid=()):
        opts = table(key)
        if not opts or rng.random() >= chance(key, default):
            return None
        if avoid:
            opts = ({k: w for k, w in opts.items() if not any(conflicts(T, k, a) for a in avoid)}
                    if isinstance(opts, dict) else [k for k in opts if not any(conflicts(T, k, a) for a in avoid)])
        return _pick(rng, opts)

    chosen = []
    top = maybe('tops')
    if top:
        chosen.append(top)
    if top and T['parts'][top].get('dress'):
        bottom = _pick(rng, [b for b in G['underDress'] if ok(b)])
    else:
        bottom = maybe('bottoms', 1.0, avoid=chosen)
    for x in (bottom, maybe('shoes')):
        if x:
            chosen.append(x)
    extra = P.get('extra')
    if isinstance(extra, dict):
        extra = [_pick(rng, {k: w for k, w in extra.items() if ok(k)})]
    for x in (extra or []):
        if x and ok(x) and not any(conflicts(T, x, c) for c in chosen):
            chosen.append(x)
    hat = maybe('hats', 0.5, avoid=chosen)
    hair = maybe('hair', 1.0, avoid=[hat] if hat else ())
    if hat and hair is None:                        # no hair fits that hat: drop the hat instead
        hat = None
        hair = maybe('hair', 1.0)
    for x in (hair, hat):
        if x:
            chosen.append(x)
    for key, dflt in (('facialHair', 0.0), ('glasses', 0.2), ('neck', 0.3), ('bag', 0.2), ('headAcc', 0.1)):
        x = maybe(key, dflt, avoid=chosen)
        if x:
            chosen.append(x)
    person = {'base': base, 'look': look, 'preset': preset, 'parts': chosen,
              'face': _pick(rng, table('faces') if 'faces' in P else (A['faces'].get(look) or A['faces'].get('A'))),
              'nose': _pick(rng, P.get('noses') or A['noses'])}
    # ---- colours
    pal = T['palettes']
    pcols = P.get('colors', {})
    acols = A.get('colors', {})
    cols = {}

    def col(slot, default_pal):
        v = pcols.get(slot, acols.get(slot))
        if isinstance(v, list):
            v = rng.choice(v)
            if v == 'skin':
                return cols.get('skin')
            return v if v.startswith('#') else rng.choice(pal[v])
        if isinstance(v, str):
            return v if v.startswith('#') else rng.choice(pal[v])
        return rng.choice(pal[default_pal])
    slot_pal = dict(G['slotPalette'])
    slot_pal['hair'] = A.get('hairPalette', 'hair')
    for slot in ('skin', 'hair', 'top', 'top2', 'fur', 'bottom', 'bottom2', 'shoes', 'hat', 'hat2', 'acc', 'acc2',
                 'bag', 'glasses'):
        cols[slot] = col(slot, slot_pal[slot])
    if 'skirt' in T['parts'].get(bottom or '', {}).get('tags', []) and 'bottom' not in pcols:
        cols['bottom'] = rng.choice(pal['skirt'])
    # a top and its accent should not be the same colour
    if cols['top2'] == cols['top'] and 'top2' not in pcols:
        cols['top2'] = rng.choice([c for c in pal[slot_pal['top2']] if c != cols['top']])
    if top and T['parts'][top].get('sleeves'):
        cols['sleeve'] = cols[T['parts'][top]['sleeves']]
    else:
        cols['sleeve'] = cols['top']
    if 'hands' in pcols:
        cols['hands'] = col('hands', 'gloves')
    else:
        cols['hands'] = rng.choice(pal['gloves']) if rng.random() < P.get('gloveChance', A.get('gloveChance', 0.3)) \
            else cols['skin']
    person['colors'] = cols
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
