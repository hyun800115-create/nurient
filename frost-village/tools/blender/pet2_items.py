"""
pet2_items.py - the two dog-play items of CONTRACT_V4 section I, built exactly like the existing
items (bld_assets item_* / prop_assets item_*): 72x72 frame, anchor (36,54) = bottom centre of the
ground contact, no shadow, chunky shapes readable as UI icons, prop_lib materials (albedo-adjusted).

    item_treat   bone biscuit (toasted brown, lighter baked top, three docking dots)
    item_ball    red rubber ball with a white band (same shape / colours as the ball in the dog's mouth)

The builders are registered into bld_assets' registry IN MEMORY ONLY (bld_assets.py is not edited) under
the atlas name 'pets2_items', and rendered by bld_render.render_build() - the same code path, camera,
light, sample count and sidecar JSON as the v3 items.  Not run directly: pet2_render.py --items.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy  # noqa: E402,F401   (import before mathutils when bpy is a module)
from mathutils import Vector  # noqa: E402

import prop_lib as L  # noqa: E402
import bld_assets as BA  # noqa: E402
import pet2_props as pp  # noqa: E402

ATLAS = 'pets2_items'
ITEMS = ['item_treat', 'item_ball']

TREAT_LEN = 0.74
TREAT_THICK = 0.70             # vertical squash of the round parts (a biscuit, not a real bone)
BALL_R = 0.235


@BA.bld('item_treat', 'item', ATLAS, item={'thickness': 0.15}, samples=64,
        notes='Bone biscuit dog treat (간식): toasted brown with a lighter baked top and three docking dots; '
              'lying flat, long axis screen-right. The dog eats the same biscuit in pets2 pet_dog `eat`.')
def b_item_treat():
    with L.Collect() as c:
        bm = pp.bm_bone(TREAT_LEN, thick=TREAT_THICK, seg=28)
        for f in bm.faces:
            f.material_index = 1 if f.normal.z > 0.45 else 0
        base = L.flat(pp.BISCUIT, 0.78)
        top = L.tonal(pp.BISCUIT_TOP, var=0.10, scale=7.0, rough=0.7)
        L.finish('treat', bm, [base, top], loc=(0, 0, 0))
        dot = L.flat(pp.BISCUIT_DOT, 0.9)
        for (x, y, z) in pp.bone_dots(TREAT_LEN, thick=TREAT_THICK):
            L.sphere('treat_dot', 0.03, (x, y, z), dot, scale=(1, 1, 0.45), segs=12, rings=8)
    BA._ground_item(c.objs, 26.0, 0.0)          # top tipped 26 deg towards the camera


@BA.bld('item_ball', 'item', ATLAS, item={'thickness': 0.24}, samples=64,
        notes='Red rubber play ball (공) with a white band; the chief throws it and the dog brings it back in its '
              'mouth (pets2 pet_dog run_ball / catch show the same ball). stackStep is nominal (balls overlap '
              'when piled).')
def b_item_ball():
    with L.Collect() as c:
        red = L.flat(pp.BALL_RED, 0.32)
        white = L.flat(pp.BALL_WHITE, 0.4)
        L.finish('ball', pp.bm_ball(BALL_R, seg=72, rings=36, axis=(0.55, -0.25, 0.80), band=0.16),
                 [red, white], loc=(0, 0, 0))
        # tiny highlight speck so the ball reads glossy even at 32 px
        L.sphere('ball_glint', 0.04, (-0.09, -0.13, 0.17), L.flat('#FFFFFF', 0.2, emission='#FFFFFF',
                                                               emission_strength=0.6), scale=(1.2, 1, 0.6),
                 segs=10, rings=6)
    BA._ground_item(c.objs, 0.0, 0.0)


def spec(key):
    return BA.BLD[key]


def anchor_check():
    """(for pet2_check) the item frame used by bld_render."""
    return BA.ITEM_FRAME, BA.ITEM_ANCHOR


__all__ = ['ITEMS', 'ATLAS', 'spec', 'Vector']
