"""
tf_body.py - townfolk paper-doll mannequin, base bodies and the part build context.

Not run directly (tf_render.py imports it).  Same joints / measurements as
char_build.build_human and vil_body (so every char_build / vil_dress helper fits),
but the body itself is a MANNEQUIN split into always-present pieces that the
paper-doll layers are rendered against:

  collection     what                                   in the game
  M_core         torso core, legs core, feet core       never drawn; it is a holdout for every
                 (strictly INSIDE every garment)        body layer so garments get no hidden pixels
  M_arm_R/L      sleeve capsules (= generic sleeves)    layers arm_R / arm_L  (tint: sleeve colour)
  M_hand_R/L     mitten-hands                           layers hand_R / hand_L (tint: skin or gloves)
  M_head         head ellipsoid + ears (+ nose variant)  head-space layer head_<nose> (tint: skin)
  F_<set>_*      vil_face expression parts per face set  head-space face / brow layers

Build context (Ctx): parts never pick colours themselves; they ask ctx.col(slot, shade)
for a colour.  mode='layer' returns the neutral render albedo of that tint slot (the
game multiplies it by the person's colour, see TINT_REF), mode='full' returns the real
colour of a preset (used for the reference full renders that prove the layering).
"""
import contextlib
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy                                 # noqa: E402
from mathutils import Vector               # noqa: E402

import bl_common as bc                     # noqa: E402
import char_geo as g                       # noqa: E402
import char_build as cb                    # noqa: E402
import vil_body                            # noqa: E402
import vil_face                            # noqa: E402

HIP_Z, CHEST_DZ, SHOULDER, NECK_DZ = cb.HIP_Z, cb.CHEST_DZ, cb.SHOULDER, cb.NECK_DZ
HEAD_R, HEAD_C = cb.HEAD_R, cb.HEAD_C
UPPER_ARM, FOREARM, THIGH, HAND_DZ = cb.UPPER_ARM, cb.FOREARM, cb.THIGH, cb.HAND_DZ

from tf_presets import TINT_REF, TINT_MODEL, BASES, BASE_ORDER, FACE_SETS   # noqa: E402,F401


def tint_ref(slot):
    return TINT_REF.get(slot, TINT_REF['default'])


def hex_to_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def rgb_to_hex(c):
    return '#%02X%02X%02X' % tuple(max(0, min(255, int(round(v * 255)))) for v in c)


def shade_hex(h, s):
    return rgb_to_hex(tuple(v * s for v in hex_to_rgb(h)))


# Mannequin core profile (spine-local): strictly inside every garment (garments start at
# r >= ~0.212 around the chest and cover the hips down to the crotch via the bottoms' seat).
CORE_PROFILE = [(0.170, 0.02), (0.186, 0.08), (0.196, 0.16), (0.194, 0.24), (0.180, 0.31),
                (0.140, 0.38), (0.06, 0.43), (0.0, 0.44)]
# standard garment torso profile (what char_build / vil use) for parts to build on
STD_PROFILE = [(0.250, -0.095), (0.238, -0.015), (0.212, 0.10), (0.208, 0.22), (0.195, 0.31),
               (0.155, 0.39), (0.07, 0.45), (0.0, 0.46)]


# --------------------------------------------------------------------------- context

class Ctx:
    """mode 'layer' | 'full'.  colors: slot -> hex (full mode).  Collections are created
    lazily; objects created inside `with ctx.into(name):` are moved into collection name."""

    def __init__(self, mode='layer', colors=None):
        self.mode = mode
        self.colors = dict(colors or {})
        self.cols = {}
        self.sub_tint = {}

    def col(self, slot, shade=1.0):
        if self.mode == 'full':
            base = self.colors.get(slot) or self.colors.get(slot.rstrip('2')) or '#C0C0C0'
        else:
            base = tint_ref(slot)
        return shade_hex(base, shade) if shade != 1.0 else base

    def collection(self, name):
        if name not in self.cols:
            c = bpy.data.collections.new(name)
            bpy.context.scene.collection.children.link(c)
            self.cols[name] = c
        return self.cols[name]

    @contextlib.contextmanager
    def into(self, name):
        before = set(bpy.data.objects)
        yield
        new = [o for o in bpy.data.objects if o not in before]
        self.move(new, name)

    def move(self, objs, name):
        c = self.collection(name)
        for o in objs:
            if o.type not in ('MESH', 'CURVE'):
                continue
            for uc in list(o.users_collection):
                uc.objects.unlink(o)
            c.objects.link(o)


# --------------------------------------------------------------------------- mannequin

def build_rig():
    rig = g.Rig('human')
    rig.add('root', None, (0, 0, 0))
    rig.add('hips', 'root', (0, 0, HIP_Z))
    rig.add('spine', 'hips', (0, 0, 0))
    rig.add('chest', 'spine', (0, 0, CHEST_DZ))
    rig.add('neck', 'chest', (0, 0, NECK_DZ))
    rig.add('head', 'neck', (0, 0, 0))
    for s, name in ((1, 'R'), (-1, 'L')):
        x = -SHOULDER[0] if name == 'R' else SHOULDER[0]
        rig.add('sh_' + name, 'chest', (x, SHOULDER[1], SHOULDER[2]), side=s)
        rig.add('el_' + name, 'sh_' + name, (0, 0, -UPPER_ARM), side=s)
        rig.add('hand_' + name, 'el_' + name, (0, 0, -FOREARM - HAND_DZ), side=s)
        rig.add('hip_' + name, 'hips', (-0.085 if name == 'R' else 0.085, 0, 0), side=s)
        rig.add('knee_' + name, 'hip_' + name, (0, 0, -THIGH), side=s)
    return rig


def build_mannequin(rig, ctx, noses=('dot',)):
    """Core + sleeves + hands + head skin variants.  Returns nothing; collections:
    M_core, M_arm_R, M_arm_L, M_hand_R, M_hand_L, M_head_<nose>."""
    core = bc.mat('mq_core', '#6A6470', rough=0.8)
    with ctx.into('M_core'):
        g.mesh_obj('mq_torso', g.bm_lathe(CORE_PROFILE, seg=36, sy=0.80, smooth_n=20, cap_top=False), core,
                   rig.j['spine'])
        g.mesh_obj('mq_hips', g.bm_ellipsoid(0.165, 0.135, 0.10, 24, 12), core, rig.j['hips'], loc=(0, 0, -0.01))
        for n in ('R', 'L'):
            g.mesh_obj('mq_thigh_' + n, g.bm_capsule(0.062, THIGH, r_end=0.055), core, rig.j['hip_' + n])
            g.mesh_obj('mq_shin_' + n, g.bm_capsule(0.052, 0.085, r_end=0.050), core, rig.j['knee_' + n])
            g.mesh_obj('mq_foot_' + n, g.bm_ellipsoid(0.048, 0.072, 0.050, 16, 10), core, rig.j['knee_' + n],
                       loc=(0, -0.02, -0.15))
    sleeve = bc.mat('sleeve', ctx.col('sleeve'), rough=0.85)
    hand = bc.mat('hand', ctx.col('hands'), rough=0.6)
    for n in ('R', 'L'):
        with ctx.into('M_arm_' + n):
            g.mesh_obj('uarm_' + n, g.bm_capsule(0.076, UPPER_ARM, r_end=0.070), sleeve, rig.j['sh_' + n])
            g.mesh_obj('farm_' + n, g.bm_capsule(0.070, FOREARM - 0.02, r_end=0.062), sleeve, rig.j['el_' + n])
        with ctx.into('M_hand_' + n):
            g.mesh_obj('mitt_' + n, g.bm_ellipsoid(0.058, 0.052, 0.060, 20, 12), hand, rig.j['hand_' + n])
            g.mesh_obj('thumb_' + n, g.bm_ellipsoid(0.024, 0.024, 0.032, 10, 8), hand, rig.j['hand_' + n],
                       loc=(0.0, -0.045, 0.012), rot=(25, 0, 0))
    skin = bc.mat('skin', ctx.col('skin'), rough=0.55)
    head = rig.j['head']
    for k, nose in enumerate(noses):
        with ctx.into('M_head_' + nose):
            g.mesh_obj('head', g.bm_ellipsoid(*HEAD_R, seg=40, rings=20), skin, head, loc=(0, 0, HEAD_C))
            for s in (-1, 1):
                cb.on_head('ear', g.bm_ellipsoid(0.028, 0.055, 0.065, 12, 8), skin, head, s * math.pi / 2 * 0.98,
                           -0.08, out=-0.02)
            nv = -0.052
            if nose == 'dot':
                g.mesh_obj('nose', g.bm_ellipsoid(0.026, 0.018, 0.020, 12, 8), skin, head,
                           loc=tuple(vil_face.surf(0, nv, -0.004)[0] + Vector((0, 0, HEAD_C))))
            elif nose == 'big':
                nm = bc.mat('nose_big', ctx.col('skin', 0.97), rough=0.5)
                g.mesh_obj('nose', g.bm_ellipsoid(0.042, 0.032, 0.034, 14, 10), nm, head,
                           loc=tuple(vil_face.surf(0, nv, -0.008)[0] + Vector((0, 0, HEAD_C))))
            elif nose == 'button':
                nm = bc.mat('nose_btn', ctx.col('skin', 0.95), rough=0.5)
                g.mesh_obj('nose', g.bm_ellipsoid(0.034, 0.024, 0.026, 12, 8), nm, head,
                           loc=tuple(vil_face.surf(0, nv + 0.004, -0.004)[0] + Vector((0, 0, HEAD_C))))


# --------------------------------------------------------------------------- face sets

def build_face_set(rig, ctx, set_name):
    """All vil_face toggles for one face set into F_<set>_<toggle> collections.
    Brows use the hair tint slot (brow colour = hair colour x 0.78)."""
    spec = dict(FACE_SETS[set_name])
    lines = spec.pop('lines', False)
    spec.setdefault('skin', ctx.col('skin'))
    spec['brow'] = ctx.col('hair', 0.78)
    spec['ears'] = False
    spec['nose'] = None
    before = set(bpy.data.objects)
    parts = vil_face.build_face(rig, spec)
    for tog, objs in parts.items():
        ctx.move(objs, f'F_{set_name}_{tog}')
    extra = [o for o in bpy.data.objects if o not in before and o.type == 'MESH' and
             not any(o in v for v in parts.values())]
    for o in extra:                  # anything else build_face made (should be none)
        bpy.data.objects.remove(o)
    if lines:                        # elder smile lines + crow's feet (part of every face)
        lm = bc.mat('face_line', '#C99A86', rough=0.7)
        objs = []
        for s in (-1, 1):
            objs.append(vil_face._obj(rig, 'smile_line', vil_face.bm_stroke(
                [(s * 0.105, -0.075), (s * 0.118, -0.098), (s * 0.112, -0.120)], 0.0055, thick=0.006, taper=0.5,
                out=0.0), lm))
            objs.append(vil_face._obj(rig, 'crow', vil_face.bm_stroke(
                [(s * 0.168, -0.012), (s * 0.188, -0.022)], 0.0045, thick=0.005, taper=0.5, out=0.0), lm))
        ctx.move(objs, f'F_{set_name}_lines')
    return parts


# --------------------------------------------------------------------------- proportions

def apply_base(rig, base):
    B = BASES[base]
    vil_body.apply_proportions(rig, B['P'])
    ch = dict(age=B['age'], hunch=B['hunch'], arm_out=B['arm_out'], leg_len=rig.meta['leg_len'],
              hip_z=rig.meta['leg_len'])
    rig.meta['ch'] = ch
    rig.meta['base'] = base
    return ch


def torso_scale(rig):
    return rig.meta.get('torso_scale', (1.0, 1.0, 1.0))


def scale_ik(rig, p):
    tx, ty, tz = torso_scale(rig)
    for side in ('R', 'L'):
        k = 'ik_' + side
        if k in p:
            v = list(p[k])
            v[0] *= tx
            v[1] *= ty
            v[2] *= tz
            p[k] = tuple(v)
    return p
