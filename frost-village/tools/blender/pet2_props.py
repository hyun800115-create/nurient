"""
pet2_props.py - shared geometry for the dog-play props (CONTRACT_V4 section I):
the bone biscuit treat and the red rubber ball.  The SAME shapes are used
  * small, in the dog's mouth (pet2_build: `treat` / `ball` toggles, character materials), and
  * big, as the 72x72 items item_treat / item_ball (pet2_items: prop-style materials),
so the item the chief throws / hands out is exactly the thing the dog carries.

Pure bmesh builders (no scene side effects except in the *_obj helpers).  Not run directly.
"""
import math

import bmesh
from mathutils import Vector

TAU = math.tau

# palette (sRGB) shared by the dog props and the items
BALL_RED = '#E8433A'
BALL_WHITE = '#FFF6EA'
BISCUIT = '#B97638'          # toasted biscuit (darker than the shiba fur)
BISCUIT_TOP = '#DEA764'      # lighter baked top (items: top material)
BISCUIT_DOT = '#7A4520'      # docking holes


def _ellipsoid_into(bm, c, r, seg=20, rings=10):
    """Add an ellipsoid (centre c, radii r) to an existing bmesh."""
    tmp = bmesh.new()
    bmesh.ops.create_uvsphere(tmp, u_segments=seg, v_segments=rings, radius=1.0)
    for v in tmp.verts:
        v.co = Vector((c[0] + v.co.x * r[0], c[1] + v.co.y * r[1], c[2] + v.co.z * r[2]))
    me_verts = {}
    for v in tmp.verts:
        me_verts[v.index] = bm.verts.new(v.co)
    for f in tmp.faces:
        try:
            bm.faces.new([me_verts[v.index] for v in f.verts])
        except ValueError:
            pass
    tmp.free()


def bm_bone(length, thick=0.62, seg=20):
    """Classic dog-bone biscuit lying flat, long axis = local X, centred on the origin,
    z from -h/2 to +h/2.  Union of a flattened shaft and four knobs (overlapping shells
    render as one solid).  `thick` = vertical squash of the round parts."""
    bm = bmesh.new()
    rk = 0.17 * length                       # knob radius
    xk = length / 2 - rk                     # knob centre x
    yk = 0.62 * rk                           # knob centre offset across the bone
    for sx in (-1, 1):
        for sy in (-1, 1):
            _ellipsoid_into(bm, (sx * xk, sy * yk, 0.0), (rk, rk, rk * thick), seg, seg // 2)
    # shaft: a stretched capsule (ellipsoid with a long flat middle)
    sh_r = 0.13 * length
    tmp = bmesh.new()
    bmesh.ops.create_uvsphere(tmp, u_segments=seg + 4, v_segments=seg // 2, radius=1.0)
    half = xk
    for v in tmp.verts:
        x, y, z = v.co
        xx = x * sh_r + (half if x > 0 else -half) * min(1.0, abs(x) * 6.0) * (1 if x != 0 else 0)
        v.co = Vector((xx, y * sh_r, z * sh_r * thick))
    vmap = {v.index: bm.verts.new(v.co) for v in tmp.verts}
    for f in tmp.faces:
        try:
            bm.faces.new([vmap[v.index] for v in f.verts])
        except ValueError:
            pass
    tmp.free()
    return bm


def bone_dots(length, thick=0.62):
    """Docking-hole positions (x, y, z_top) on the bone top for a few dark dots."""
    sh_r = 0.13 * length
    xs = (-0.16 * length, 0.0, 0.16 * length)
    return [(x, 0.0, sh_r * thick * 0.96) for x in xs]


def bm_ball(r, seg=32, rings=16, axis=(0.35, -0.30, 0.89), band=0.17, band2=None):
    """UV sphere with face material indices: 0 = red rubber, 1 = white band (a great
    circle around `axis`, half-width `band` in |cos|).  band2: optional second band axis."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    ax = Vector(axis).normalized()
    ax2 = Vector(band2).normalized() if band2 else None
    for f in bm.faces:
        n = f.calc_center_median().normalized()
        white = abs(n.dot(ax)) < band or (ax2 is not None and abs(n.dot(ax2)) < band)
        f.material_index = 1 if white else 0
    return bm


def ball_obj(g, name, r, mat_red, mat_white, parent=None, loc=(0, 0, 0), rot=None, **kw):
    """char_geo-style object (dog prop) with the two ball materials."""
    ob = g.mesh_obj(name, bm_ball(r, **kw), mat_red, parent, loc=loc, rot=rot)
    ob.data.materials.append(mat_white)
    return ob
