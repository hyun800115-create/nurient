"""
tf_parts.py - townfolk paper-doll part library (CONTRACT_V4 J).

Not run directly.  Every part is registered with @part(...) and built by a function
fn(rig, ctx, put) that creates its meshes with char_build / vil_dress / vil2_dress
helpers.  `put(sub)` is a context manager: meshes created inside go to the Blender
collection of that sub-layer ("P.<part>.<sub>"); each sub-layer becomes ONE sprite
layer in the game.  Colours always come from ctx.col(slot, shade): neutral albedo in
layer renders (the game tints it), the real colour in reference renders.

Part fields
  family   body | hair | hat | face ... (see FAMILIES)          space  'head' | 'body'
  subs     {sub: {'tint': slot | None, 'z': int | {dir: int}}}   (None = fixed colours)
  tags     free-form (used by the combination rules / presets)
  hatfit   hair only: also render '~hat' variants clipped at the hat line (HAT_LINE)
  cls      hats only: 'full' (covers the crown -> wearer uses hair '~hat') | 'top' (small,
           sits on the hair -> wearer keeps normal hair)

Draw order (z) per direction is documented in Z below; per-sub overrides are dicts.
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

PARTS = {}

# default draw order (larger = in front).  hairback / backpack swap sides in NE/N.
Z = {
    'hair_back': {'S': 2, 'SE': 2, 'E': 2, 'NE': 71, 'N': 71},
    'bag_back': {'S': 3, 'SE': 3, 'E': 3, 'NE': 46, 'N': 46},
    'arm': 5, 'hand': 6,             # mannequin limbs (zfront -> 90/91 in some social frames)
    'tights': 11, 'pants': 12, 'shoes': 15, 'shoes_tall': 19, 'skirt': 22,
    'top': 30, 'top_detail': 31, 'bib': 33, 'apron': 34, 'vest': 35, 'job_detail': 37,
    'necklace': 39, 'scarf': 40, 'bag_front': 44,
    'head': 60, 'face': 61, 'facial_hair': 62, 'brow': 63, 'hair': 70, 'hair_top': 72,
    'glasses': 74, 'earmuffs': 76, 'hat': 80, 'hat_detail': 81,
    'arm_front': 90, 'hand_front': 91,
}


class Part:
    def __init__(self, name, family, space, subs, fn, tags=(), hatfit=False, cls=None, ages=None,
                 notes='', label=None):
        self.name, self.family, self.space, self.subs, self.fn = name, family, space, subs, fn
        self.tags = set(tags)
        self.hatfit = hatfit
        self.cls = cls
        self.ages = ages             # None = every base; else list of ages it is rendered for
        self.notes = notes
        self.label = label or {'ko': name, 'en': name}


def part(name, family, space, subs, **kw):
    def deco(fn):
        PARTS[name] = Part(name, family, space, subs, fn, **kw)
        return fn
    return deco


def sub(tint, z):
    return {'tint': tint, 'z': z}


def z_of(subdef, d):
    z = subdef['z']
    return z[d] if isinstance(z, dict) else z


def head_parts():
    return [p for p in PARTS.values() if p.space == 'head']


def body_parts():
    return [p for p in PARTS.values() if p.space == 'body']


# hat line (head-local unit coords): every 'full' hat covers  z_unit > HAT_LINE[0] - HAT_LINE[1]*y_unit
HAT_LINE = (0.31, 0.15)


def _lazy():
    """bpy-dependent imports (kept out of module import so pure-python tools can read PARTS)."""
    global bpy, Vector, Matrix, bc, g, cb, vd, v2, tb, bmesh
    import bpy                                  # noqa: F401
    import bmesh                                # noqa: F401
    from mathutils import Vector, Matrix        # noqa: F401
    import bl_common as bc                      # noqa: F401
    import char_geo as g                        # noqa: F401
    import char_build as cb                     # noqa: F401
    import vil_dress as vd                      # noqa: F401
    import vil2_dress as v2                     # noqa: F401
    import tf_body as tb                        # noqa: F401


def M(name, color, rough=0.8, **kw):
    return bc.mat(name, color, rough=rough, **kw)


PI = math.pi


def build_part(rig, ctx, pname):
    _lazy()
    P = PARTS[pname]

    class _Put:
        def __call__(self, s):
            assert s in P.subs, (pname, s)
            return ctx.into(f'P.{pname}.{s}')
    P.fn(rig, ctx, _Put())
    return P


def hat_clip(rig, ctx, pname):
    """Duplicate every sub collection of hair part `pname` into '<sub>~hat' and cut it at
    the hat line (everything above is removed: a 'full' hat covers it)."""
    _lazy()
    bpy.context.view_layer.update()
    head = rig.j['head']
    hc = head.matrix_world @ Vector((0, 0, tb.HEAD_C))
    rx, ry, rz = tb.HEAD_R
    a, b = HAT_LINE
    # plane in head-local metric coords around the head centre: z = rz*a - b*(rz/ry)*y
    n_loc = Vector((0.0, b * rz / ry, 1.0)).normalized()
    p_loc = Vector((0.0, 0.0, rz * a))
    R = head.matrix_world.to_3x3()
    p_w = hc + R @ p_loc
    n_w = (R @ n_loc).normalized()
    for sname in PARTS[pname].subs:
        src = ctx.cols.get(f'P.{pname}.{sname}')
        if src is None:
            continue
        dst = ctx.collection(f'P.{pname}.{sname}~hat')
        for o in list(src.objects):
            if o.type != 'MESH':
                continue
            c = o.copy()
            c.data = o.data.copy()
            dst.objects.link(c)
            mw = o.matrix_world
            inv = mw.inverted()
            pl = inv @ p_w
            nl = (mw.to_3x3().transposed() @ n_w).normalized()
            bm = bmesh.new()
            bm.from_mesh(c.data)
            geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
            bmesh.ops.bisect_plane(bm, geom=geom, plane_co=pl, plane_no=nl, clear_outer=True)
            bm.to_mesh(c.data)
            bm.free()
            if len(c.data.polygons) == 0:
                bpy.data.objects.remove(c)


# =========================================================================== hair
# (all head-space; 'main' = cap + fringe + side locks (z 70), 'back' = long hair behind)

HAIR_MAIN = dict(sub('hair', Z['hair']), sheen=True)
HAIR_BACK = sub('hair', Z['hair_back'])


@part('hair_short', 'hair', 'head', {'main': HAIR_MAIN}, hatfit=True, tags=['short'],
      label={'ko': '짧은 머리', 'en': 'short'})
def b_hair_short(rig, ctx, put):
    c = ctx.col('hair')
    with put('main'):
        cb.hair_shell(rig, c, fringe=0.36, wave=0.06, waves=10.0, sweep=0.14)
        cb.hair_tuft(rig, c, 0.0, 1.25, size=(0.045, 0.035, 0.075), tilt=(-55, 0, 0))
        for k, az in enumerate((2.7, 3.0, 3.3, 3.6)):
            cb.hair_tuft(rig, c, az, -0.42 + 0.05 * (k % 2), size=(0.055, 0.04, 0.09), tilt=(150, 0, 0),
                         name='nape')
        for az, el in ((2.4, 0.5), (3.9, 0.45), (3.14, 0.9)):
            cb.hair_tuft(rig, c, az, el, size=(0.06, 0.045, 0.07), tilt=(120, 0, 0), name='backtuft')


@part('hair_bob', 'hair', 'head', {'main': HAIR_MAIN}, hatfit=True, tags=['medium'],
      label={'ko': '단발', 'en': 'bob'})
def b_hair_bob(rig, ctx, put):
    with put('main'):
        v2.bob_hair(rig, ctx.col('hair'), fringe=0.30, back_low=-0.40, side_low=-0.34, base=1.10, flare=0.08)


@part('hair_ponytail', 'hair', 'head', {'main': HAIR_MAIN, 'back': HAIR_BACK, 'tie': sub(None, 71)},
      hatfit=True, tags=['long'], label={'ko': '포니테일', 'en': 'ponytail'})
def b_hair_ponytail(rig, ctx, put):
    c = ctx.col('hair')
    with put('main'):
        cb.hair_shell(rig, c, fringe=0.34, wave=0.06, waves=10.0, sweep=0.18, back_low=-0.30, top_puff=0.05)
        for s in (-1, 1):
            pts = [(s * 0.27, -0.06, 0.02), (s * 0.29, -0.08, -0.10), (s * 0.27, -0.09, -0.20)]
            vd.ho(rig, 'sidelock', g.bm_tube_path(pts, lambda t: 0.035 - 0.018 * t, segr=10), M('hair', c, 0.42))
    with put('tie'):
        vd.ho(rig, 'scrunchie', g.bm_ring(0.045, 0.024, seg=24, segr=8, tufts=5, bump=0.3),
              M('scrunchie', '#F08A8A', 0.8), loc=(0, 0.25, 0.20), rot=(-60, 0, 0))
    with put('back'):
        pts = [(0, 0.26, 0.22), (0, 0.36, 0.20), (0.02, 0.42, 0.06), (0.03, 0.42, -0.10), (0.04, 0.38, -0.28),
               (0.06, 0.34, -0.40)]
        vd.ho(rig, 'ponytail', g.bm_tube_path(vd.catmull3(pts, 20), lambda t: 0.070 * (1 - 0.75 * t ** 1.3) + 0.012,
                                              segr=14), M('hair', c, 0.42))


# =========================================================================== tops
# (body-space; main = torso garment, tinted 'top'.  Sleeves are the mannequin arms layer,
# tinted with the person's sleeve colour (= top colour unless the preset says otherwise).)

def _torso(prof, mat, rig, sy=0.84, n=26):
    return g.mesh_obj('torso', g.bm_lathe(prof, seg=44, sy=sy, smooth_n=n, cap_top=False), mat, rig.j['spine'])


@part('top_puffer', 'top', 'body', {'main': sub('top', Z['top']), 'zip': sub(None, Z['top_detail'])},
      tags=['casual', 'warm'], label={'ko': '패딩', 'en': 'puffer'})
def b_top_puffer(rig, ctx, put):
    coat = M('puffer', ctx.col('top'), 0.75)
    with put('main'):
        prof = vd.quilted_profile(vd.std_profile(0.258, -0.10), step=0.075, amp=0.06)
        g.mesh_obj('torso', g.bm_lathe(prof, seg=44, sy=0.84, smooth_n=0, cap_top=False), coat, rig.j['spine'])
        g.mesh_obj('collar', g.bm_ring(0.142, 0.056, seg=48, segr=12, sy=0.92, rz=1.25), coat, rig.j['chest'],
                   loc=(0, 0.01, 0.10))
        g.mesh_obj('hood', g.bm_ellipsoid(0.17, 0.10, 0.12, 24, 12), coat, rig.j['chest'], loc=(0, 0.19, 0.06),
                   rot=(-25, 0, 0))
        for n in ('R', 'L'):
            g.mesh_obj('cuff', g.bm_ring(0.060, 0.026, seg=28, segr=10, rz=1.2), coat, rig.j['el_' + n],
                       loc=(0, 0, -cb.FOREARM + 0.014))
    with put('zip'):
        zm = M('zip', '#C9CED6', 0.35, metal=0.5)
        g.mesh_obj('zip', g.bm_box(0.014, 0.012, 0.36, bevel=0.004), zm, rig.j['spine'], loc=(0, -0.205, 0.12))
        g.mesh_obj('zip_pull', g.bm_box(0.022, 0.012, 0.036, bevel=0.005), zm, rig.j['spine'], loc=(0, -0.212, 0.29))


@part('top_parka', 'top', 'body', {'main': sub('top', Z['top']), 'fur': sub('fur', Z['top_detail'])},
      tags=['warm', 'classic'], label={'ko': '털 파카', 'en': 'fur parka'})
def b_top_parka(rig, ctx, put):
    coat = M('parka', ctx.col('top'), 0.8)
    fur = M('fur', ctx.col('fur'), 0.95)
    with put('main'):
        _torso(vd.std_profile(0.250, -0.095), coat, rig)
        g.mesh_obj('hood', g.bm_ellipsoid(0.18, 0.10, 0.13, 24, 12), coat, rig.j['chest'], loc=(0, 0.19, 0.07),
                   rot=(-25, 0, 0))
        cb.belt(rig, cb_hex(ctx, 'top', 0.55), z=0.08, buckle=None, width=0.45)
    with put('fur'):
        cb.collar_fur(rig, {}, R=0.16, r=0.085, dz=0.10, bump=0.42, tufts=10, mat=fur)
        g.mesh_obj('hem_fur', g.bm_ring(0.246, 0.042, seg=72, segr=12, sy=0.84, rz=0.85, tufts=13, bump=0.35,
                                        seed=1.0), fur, rig.j['spine'], loc=(0, 0, -0.08))
        for n in ('R', 'L'):
            g.mesh_obj('cuff_' + n, g.bm_ring(0.058, 0.029, seg=32, segr=10, tufts=7, bump=0.3,
                                              seed=2.0 if n == 'R' else 3.0), fur, rig.j['el_' + n],
                       loc=(0, 0, -cb.FOREARM + 0.012))


def cb_hex(ctx, slot, shade):
    return ctx.col(slot, shade)


@part('top_sweater', 'top', 'body', {'main': sub('top', Z['top']), 'band': sub('top2', Z['top_detail'])},
      tags=['casual', 'knit'], label={'ko': '니트 스웨터', 'en': 'knit sweater'})
def b_top_sweater(rig, ctx, put):
    knit = M('knit', ctx.col('top'), 0.95)
    with put('main'):
        prof = [(0.236, -0.085), (0.232, -0.02), (0.214, 0.10), (0.210, 0.22), (0.197, 0.31), (0.157, 0.39),
                (0.07, 0.45), (0.0, 0.46)]
        bm = g.bm_lathe(prof, seg=48, sy=0.85, smooth_n=26, cap_top=False)
        vd.fuzz(bm, 0.0025, 60.0)
        g.mesh_obj('torso', bm, knit, rig.j['spine'])
        rib = M('knit_rib', ctx.col('top', 0.86), 0.95)
        g.mesh_obj('hem_rib', g.bm_ring(0.232, 0.026, seg=56, segr=10, sy=0.86, rz=1.4), rib, rig.j['spine'],
                   loc=(0, 0, -0.07))
        g.mesh_obj('turtle', vd.fuzz(g.bm_lathe([(0.150, 0.0), (0.142, 0.05), (0.138, 0.10), (0.120, 0.12)],
                                                seg=40, sy=0.92, smooth_n=10, cap_top=False, cap_bottom=False),
                                     0.003, 50.0), knit, rig.j['chest'], loc=(0, 0.01, 0.06))
        for n in ('R', 'L'):
            g.mesh_obj('cuff', g.bm_ring(0.058, 0.022, seg=28, segr=8, rz=1.5), rib, rig.j['el_' + n],
                       loc=(0, 0, -cb.FOREARM + 0.016))
    with put('band'):
        band = M('knit_band', ctx.col('top2'), 0.95)
        for z in (0.17, 0.25):
            g.mesh_obj('band', g.bm_lathe([(0.2155, z - 0.022), (0.2135, z + 0.022)], seg=48, sy=0.85,
                                          cap_top=False, cap_bottom=False), band, rig.j['spine'])


# =========================================================================== bottoms / shoes

def _seat(rig, mat, hem_r=0.215, top_z=0.06):
    """Hip shell from under the top's hem down to the crotch (covers the mannequin hips)."""
    return g.mesh_obj('seat', g.bm_lathe([(0.0, -0.13), (0.12, -0.125), (0.19, -0.095), (hem_r, -0.03),
                                          (hem_r + 0.004, top_z)], seg=40, sy=0.84, smooth_n=12, cap_top=False),
                      mat, rig.j['hips'])


@part('bot_pants', 'bottom', 'body', {'main': sub('bottom', Z['pants'])},
      label={'ko': '바지', 'en': 'trousers'})
def b_bot_pants(rig, ctx, put):
    pm = M('pants', ctx.col('bottom'), 0.85)
    with put('main'):
        _seat(rig, pm)
        for n in ('R', 'L'):
            g.mesh_obj('thigh_' + n, g.bm_capsule(0.074, cb.THIGH, r_end=0.066), pm, rig.j['hip_' + n])
            g.mesh_obj('shin_' + n, g.bm_capsule(0.064, 0.075, r_end=0.062), pm, rig.j['knee_' + n])


def _boot(rig, n, mat):
    bprof = [(0.0, -0.200), (0.055, -0.198), (0.072, -0.17), (0.070, -0.12), (0.066, -0.07), (0.0, -0.05)]
    return g.mesh_obj('boot_' + n, g.bm_lathe(bprof, seg=24, sy=1.25, smooth_n=14,
                                               yoff=lambda z: -0.028 * (1 - (z + 0.2) / 0.15)),
                      mat, rig.j['knee_' + n], loc=(0, -0.012, 0.012))


@part('shoe_boots', 'shoes', 'body', {'main': sub('shoes', Z['shoes'])},
      label={'ko': '부츠', 'en': 'boots'})
def b_shoe_boots(rig, ctx, put):
    bm_ = M('boots', ctx.col('shoes'), 0.6)
    with put('main'):
        for n in ('R', 'L'):
            _boot(rig, n, bm_)
