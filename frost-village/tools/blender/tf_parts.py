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
        noclip = PARTS[pname].subs[sname].get('noclip')
        for o in list(src.objects):
            if o.type != 'MESH':
                continue
            c = o.copy()
            c.data = o.data.copy()
            dst.objects.link(c)
            if noclip:
                continue
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
HAIR_BACK = dict(sub('hair', Z['hair_back']), sheen=True)


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


@part('top_puffer', 'top', 'body', {'main': sub('top', Z['top'])},
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
        zm = M('zip', ctx.col('top', 0.62), 0.5)
        g.mesh_obj('zip', g.bm_box(0.014, 0.012, 0.36, bevel=0.004), zm, rig.j['spine'], loc=(0, -0.205, 0.12))
        g.mesh_obj('zip_pull', g.bm_box(0.022, 0.012, 0.036, bevel=0.005), zm, rig.j['spine'], loc=(0, -0.212, 0.29))


def follow(tint, limb):
    """Sub-layer glued to a limb (cuffs): drawn right above that limb, also when the limb is
    brought in front of the head stack (timeline zfront)."""
    return {'tint': tint, 'z': Z['arm'] + 0.5, 'follow': limb}


@part('top_parka', 'top', 'body', {'main': sub('top', Z['top']), 'fur': sub('fur', Z['top_detail']),
                                   'cuff_R': follow('fur', 'arm_R'), 'cuff_L': follow('fur', 'arm_L')},
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
        with put('cuff_' + n):
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


# =========================================================================== more hair
TIE = sub('acc2', Z['hair_top'])


def _hc(ctx):
    return ctx.col('hair')


def _hm(ctx):
    return M('hair', ctx.col('hair'), 0.42)


def _curtain(rig, mat, z_bot, z_top=0.02, r_top=0.315, r_bot=0.25, keep=105, flare=0.0, name='curtain'):
    """Long hair falling down the back: a thick open shell sector behind the head (head-local)."""
    prof = [(r_bot + flare, z_bot), (r_bot * 1.03, z_bot + 0.06), ((r_top + r_bot) / 2, (z_top + z_bot) / 2),
            (r_top * 0.99, z_top - 0.05), (r_top * 0.93, z_top + 0.06)]
    bm = vd.sector_lathe(g.catmull(prof, 18), keep_deg=keep, seg=56, sy=0.98, center_deg=180)
    bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=0.035)
    vd.fuzz(bm, 0.004, 30.0)
    return vd.ho(rig, name, bm, mat, loc=(0, 0.02, 0))


def _front_locks(rig, mat, z_bot=-0.40, spread=0.28):
    for s in (-1, 1):
        pts = [(s * spread, -0.04, 0.04), (s * (spread + 0.03), -0.09, -0.14), (s * (spread + 0.01), -0.12, z_bot)]
        vd.ho(rig, 'lock', g.bm_tube_path(vd.catmull3(pts, 10), lambda t: 0.045 - 0.02 * t, segr=10), mat)


@part('hair_sidepart', 'hair', 'head', {'main': HAIR_MAIN}, hatfit=True, tags=['short', 'neat'],
      label={'ko': '가르마', 'en': 'side part'})
def b_hair_sidepart(rig, ctx, put):
    c = _hc(ctx)
    with put('main'):
        cb.hair_shell(rig, c, fringe=0.36, wave=0.03, waves=6.0, sweep=0.34, back_low=-0.42, top_puff=0.07, base=1.09)
        for az, el, sz in ((0.22, 0.52, 1.0), (-0.08, 0.50, 1.05), (-0.36, 0.44, 0.95), (-0.60, 0.36, 0.8)):
            cb.hair_tuft(rig, c, az, el, size=(0.075 * sz, 0.045, 0.12 * sz), tilt=(-82, -38, 0), name='swoop')


@part('hair_spiky', 'hair', 'head', {'main': HAIR_MAIN}, hatfit=True, tags=['short', 'tall'],
      label={'ko': '삐죽머리', 'en': 'spiky'})
def b_hair_spiky(rig, ctx, put):
    c = _hc(ctx)
    with put('main'):
        cb.hair_shell(rig, c, fringe=0.36, wave=0.10, waves=13.0, sweep=0.10, back_low=-0.45, top_puff=0.10)
        spikes = [(0.0, 1.20, -20), (-0.6, 0.95, 0), (0.6, 0.95, 0), (-1.2, 0.70, 10), (1.2, 0.70, 10),
                  (2.0, 0.65, 30), (-2.0, 0.65, 30), (2.7, 0.55, 40), (-2.7, 0.55, 40), (PI, 0.45, 50),
                  (-0.3, 0.55, -50), (0.35, 0.55, -50), (0.0, 0.62, -55)]
        for az, el, tl in spikes:
            big = 1.0 if abs(az) < 2.2 else 0.85
            cb.hair_tuft(rig, c, az, el, size=(0.06 * big, 0.045 * big, 0.14 * big), tilt=(tl, 0, 0), name='spike')


@part('hair_buzz', 'hair', 'head', {'main': HAIR_MAIN}, hatfit=True, tags=['short'],
      label={'ko': '스포츠머리', 'en': 'buzz cut'})
def b_hair_buzz(rig, ctx, put):
    with put('main'):
        cb.hair_shell(rig, _hc(ctx), fringe=0.50, wave=0.015, waves=8.0, sweep=0.0, back_low=-0.55, top_puff=0.0,
                      base=1.035, inner=0.93)


@part('hair_curly', 'hair', 'head', {'main': HAIR_MAIN}, hatfit=True, tags=['short'],
      label={'ko': '곱슬머리', 'en': 'curly'})
def b_hair_curly(rig, ctx, put):
    c = _hc(ctx)
    m = _hm(ctx)
    with put('main'):
        cb.hair_shell(rig, c, fringe=0.40, wave=0.10, waves=14.0, sweep=0.0, back_low=-0.50, top_puff=0.10,
                      base=1.07)
        n = 70
        rx, ry, rz = tb.HEAD_R
        for k in range(n):
            z = 1 - 2 * (k + 0.5) / n
            r = math.sqrt(max(0.0, 1 - z * z))
            a = k * 2.399963
            x, y = r * math.cos(a), r * math.sin(a)
            front = cb.smoothstep(-0.32, 0.30, -y)
            edge = -0.50 * (1 - front) + 0.40 * front
            if z < edge + 0.06:
                continue
            f = 1.08 * (1.0 + 0.10 * max(0.0, z) ** 2)
            vd.ho(rig, 'curl', g.bm_ellipsoid(0.052, 0.052, 0.048, 10, 6), m,
                  loc=(x * rx * f, y * ry * f, z * rz * f))


@part('hair_bob_long', 'hair', 'head', {'main': HAIR_MAIN, 'back': HAIR_BACK}, hatfit=True, tags=['medium'],
      label={'ko': '어깨 단발', 'en': 'long bob'})
def b_hair_bob_long(rig, ctx, put):
    m = _hm(ctx)
    with put('main'):
        v2.bob_hair(rig, _hc(ctx), fringe=0.30, back_low=-0.55, side_low=-0.50, base=1.10, flare=0.10)
        _front_locks(rig, m, z_bot=-0.30, spread=0.27)
    with put('back'):
        _curtain(rig, m, z_bot=-0.40, r_bot=0.27, keep=100, flare=0.03)


@part('hair_long', 'hair', 'head', {'main': HAIR_MAIN, 'back': HAIR_BACK}, hatfit=True, tags=['long'],
      label={'ko': '긴 생머리', 'en': 'long straight'})
def b_hair_long(rig, ctx, put):
    m = _hm(ctx)
    with put('main'):
        cb.hair_shell(rig, _hc(ctx), fringe=0.34, wave=0.05, waves=10.0, sweep=0.12, back_low=-0.80, top_puff=0.06,
                      side_low=-0.35)
        _front_locks(rig, m, z_bot=-0.36, spread=0.27)
    with put('back'):
        # head-space layers are shared by every base: keep the curtain at shoulder-blade length so
        # it still reads as hair (not a cape) on the short child / chibi bodies
        _curtain(rig, m, z_bot=-0.42, keep=105)


@part('hair_long_xl', 'hair', 'head', {'main': HAIR_MAIN, 'back': HAIR_BACK}, hatfit=True, tags=['long'],
      ages=['adult', 'elder'], label={'ko': '허리까지 긴 머리', 'en': 'waist-long'})
def b_hair_long_xl(rig, ctx, put):
    m = _hm(ctx)
    with put('main'):
        cb.hair_shell(rig, _hc(ctx), fringe=0.36, wave=0.04, waves=8.0, sweep=-0.10, back_low=-0.80, top_puff=0.06,
                      side_low=-0.35)
        _front_locks(rig, m, z_bot=-0.46, spread=0.27)
    with put('back'):
        _curtain(rig, m, z_bot=-0.58, keep=108, r_bot=0.24)        # waist length (was -0.80: floor length)


def _ponytail(rig, ctx, put, length):
    c = _hc(ctx)
    m = _hm(ctx)
    with put('main'):
        cb.hair_shell(rig, c, fringe=0.34, wave=0.06, waves=10.0, sweep=0.18, back_low=-0.30, top_puff=0.05)
        for s in (-1, 1):
            pts = [(s * 0.27, -0.06, 0.02), (s * 0.29, -0.08, -0.10), (s * 0.27, -0.09, -0.20)]
            vd.ho(rig, 'sidelock', g.bm_tube_path(pts, lambda t: 0.035 - 0.018 * t, segr=10), m)
    with put('tie'):
        vd.ho(rig, 'scrunchie', g.bm_ring(0.045, 0.024, seg=24, segr=8, tufts=5, bump=0.3),
              M('scrunchie', ctx.col('acc2'), 0.8), loc=(0, 0.25, 0.20), rot=(-60, 0, 0))
    with put('back'):
        L = length
        pts = [(0, 0.26, 0.22), (0, 0.36, 0.20), (0.02, 0.42, 0.06), (0.03, 0.42, -0.10),
               (0.04, 0.38, -0.10 - 0.18 * L), (0.06, 0.34, -0.10 - 0.30 * L)]
        vd.ho(rig, 'ponytail', g.bm_tube_path(vd.catmull3(pts, 20), lambda t: 0.070 * (1 - 0.75 * t ** 1.3) + 0.012,
                                              segr=14), m)


# ponytails / pigtails keep their full length under a hat (the hat simply covers the root)
PONY_SUBS = {'main': HAIR_MAIN, 'back': dict(HAIR_BACK, noclip=True), 'tie': dict(TIE, noclip=True)}
TAILS = dict(sub('hair', Z['hair']), noclip=True)
PARTS['hair_ponytail'].subs = PONY_SUBS
PARTS['hair_ponytail'].fn = lambda rig, ctx, put: _ponytail(rig, ctx, put, 1.0)


@part('hair_ponytail_long', 'hair', 'head', dict(PONY_SUBS), hatfit=True, tags=['long'],
      label={'ko': '긴 포니테일', 'en': 'long ponytail'})
def b_hair_ponytail_long(rig, ctx, put):
    _ponytail(rig, ctx, put, 1.9)


def _twintails(rig, ctx, put, length):
    c = _hc(ctx)
    m = _hm(ctx)
    with put('main'):
        cb.hair_shell(rig, c, fringe=0.36, wave=0.10, waves=12.0, sweep=0.0, back_low=-0.55, top_puff=0.06)
    with put('tails'):
        for s in (-1, 1):
            vd.ho(rig, 'pigtail_root', g.bm_ellipsoid(0.06, 0.055, 0.06, 14, 8), m, loc=(s * 0.29, 0.06, 0.12))
            L = length
            pts = [(s * 0.33, 0.07, 0.10), (s * 0.40, 0.08, 0.02), (s * 0.41, 0.07, -0.10 * L),
                   (s * 0.37, 0.06, -0.20 * L)]
            vd.ho(rig, 'pigtail', g.bm_tube_path(vd.catmull3(pts, 14), lambda t: 0.072 - 0.035 * t ** 1.5, segr=14), m)
    with put('tie'):
        for s in (-1, 1):
            vd.bow_ribbon(rig, ctx.col('acc2'), (s * 0.31, 0.04, 0.17), rot=(0, s * -35, s * 20), s=0.9)


@part('hair_twintails', 'hair', 'head', {'main': HAIR_MAIN, 'tails': TAILS, 'tie': dict(TIE, noclip=True)}, hatfit=True, tags=['medium'],
      ages=['child', 'adult'], label={'ko': '양갈래', 'en': 'pigtails'})
def b_hair_twintails(rig, ctx, put):
    _twintails(rig, ctx, put, 1.0)


@part('hair_twintails_long', 'hair', 'head', {'main': HAIR_MAIN, 'tails': TAILS, 'tie': dict(TIE, noclip=True)}, hatfit=True, tags=['long'],
      ages=['child', 'adult'], label={'ko': '긴 양갈래', 'en': 'long pigtails'})
def b_hair_twintails_long(rig, ctx, put):
    _twintails(rig, ctx, put, 2.3)


@part('hair_bun', 'hair', 'head', {'main': HAIR_MAIN, 'tie': TIE}, hatfit=True, tags=['tall', 'updo'],
      label={'ko': '올림머리', 'en': 'top bun'})
def b_hair_bun(rig, ctx, put):
    m = _hm(ctx)
    with put('main'):
        cb.hair_shell(rig, _hc(ctx), fringe=0.40, wave=0.05, waves=8.0, sweep=-0.25, back_low=-0.40, top_puff=0.12)
        vd.ho(rig, 'bun', vd.fuzz(g.bm_ellipsoid(0.13, 0.12, 0.11, 20, 12), 0.006, 30.0), m, loc=(0, 0.10, 0.31))
    with put('tie'):
        vd.ho(rig, 'bun_band', g.bm_ring(0.10, 0.018, seg=32, segr=8), M('scrunchie', ctx.col('acc2'), 0.7),
              loc=(0, 0.09, 0.26), rot=(-15, 0, 0))


@part('hair_lowbun', 'hair', 'head', {'main': HAIR_MAIN}, hatfit=True, tags=['updo'],
      label={'ko': '쪽머리', 'en': 'low bun'})
def b_hair_lowbun(rig, ctx, put):
    m = _hm(ctx)
    with put('main'):
        cb.hair_shell(rig, _hc(ctx), fringe=0.42, wave=0.03, waves=2.0, sweep=0.0, back_low=-0.35, top_puff=0.06,
                      base=1.08)
        vd.ho(rig, 'bun', vd.fuzz(g.bm_ellipsoid(0.12, 0.10, 0.105, 20, 12), 0.005, 30.0), m, loc=(0, 0.29, -0.05))


@part('hair_braids', 'hair', 'head', {'main': HAIR_MAIN, 'tie': TIE}, hatfit=True, tags=['long'],
      label={'ko': '땋은 머리', 'en': 'braids'})
def b_hair_braids(rig, ctx, put):
    m = _hm(ctx)
    with put('main'):
        cb.hair_shell(rig, _hc(ctx), fringe=0.26, wave=0.07, waves=11.0, sweep=-0.10, back_low=-0.55)
        for s in (-1, 1):
            pts = [(s * 0.26, 0.10, 0.02), (s * 0.29, 0.08, -0.10), (s * 0.27, 0.06, -0.22), (s * 0.24, 0.05, -0.34),
                   (s * 0.23, 0.04, -0.45)]
            for k, p in enumerate(pts):
                rr = 0.052 - 0.005 * k
                vd.ho(rig, 'braid', g.bm_ellipsoid(rr, rr * 0.9, rr * 1.15, 14, 8), m, loc=p)
            vd.ho(rig, 'braid_end', g.bm_ellipsoid(0.030, 0.028, 0.045, 10, 6), m, loc=(s * 0.225, 0.04, -0.54))
    with put('tie'):
        for s in (-1, 1):
            vd.ho(rig, 'braid_tie', g.bm_ring(0.026, 0.013, seg=16, segr=6), M('tie', ctx.col('acc2'), 0.6),
                  loc=(s * 0.226, 0.04, -0.495))


@part('hair_afro', 'hair', 'head', {'main': HAIR_MAIN}, hatfit=True, tags=['tall', 'big'],
      label={'ko': '아프로', 'en': 'afro'})
def b_hair_afro(rig, ctx, put):
    m = M('afro', ctx.col('hair'), 0.85)
    rx, ry, rz = tb.HEAD_R

    def afro_r(x, y, z):
        face = cb.smoothstep(0.10, 0.45, -y) * (1 - cb.smoothstep(0.30, 0.46, z)) * \
            (1 - cb.smoothstep(0.74, 0.90, abs(x)))
        big = 1.24 + 0.08 * max(0.0, z)
        return big - (big - 0.90) * face
    with put('main'):
        bm = g.bm_shell(rx, ry, rz, afro_r, seg=48, rings=24)
        vd.fuzz(bm, 0.010, 28.0, seed=0.7)
        vd.ho(rig, 'afro', bm, m)
        nb = 80
        for k in range(nb):
            z = 1 - 2 * (k + 0.5) / nb
            r = math.sqrt(max(0.0, 1 - z * z))
            a = k * 2.399963
            x, y = r * math.cos(a), r * math.sin(a)
            f = afro_r(x, y, z)
            if f < 1.12:
                continue
            vd.ho(rig, 'curl', g.bm_ellipsoid(0.048, 0.048, 0.044, 10, 6), m, loc=(x * rx * f, y * ry * f, z * rz * f))


@part('hair_bald', 'hair', 'head', {'main': HAIR_MAIN}, hatfit=True, tags=['short', 'elder'],
      ages=['adult', 'elder'], label={'ko': '대머리', 'en': 'balding'})
def b_hair_bald(rig, ctx, put):
    m = M('hair_side', ctx.col('hair'), 0.75)

    def side_hair(x, y, z):
        band = (1 - cb.smoothstep(0.05, 0.25, z)) * cb.smoothstep(-0.75, -0.45, z) * cb.smoothstep(-0.35, 0.05, y)
        return 0.92 + (1.13 - 0.92) * band
    with put('main'):
        cb.shell(rig, m, side_hair, 'side_hair')
        for s in (-1, 1):
            for az, el in ((1.25, 0.08), (1.95, 0.0)):
                cb.on_head('hair_puff', vd.fuzz(g.bm_ellipsoid(0.06, 0.05, 0.065, 14, 8), 0.006, 40.0), m,
                           rig.j['head'], s * az, el, out=0.02)


@part('hair_wavy', 'hair', 'head', {'main': HAIR_MAIN}, hatfit=True, tags=['medium'],
      label={'ko': '웨이브', 'en': 'wavy'})
def b_hair_wavy(rig, ctx, put):
    m = _hm(ctx)
    with put('main'):
        cb.hair_shell(rig, _hc(ctx), fringe=0.34, wave=0.12, waves=9.0, sweep=0.15, back_low=-0.62, top_puff=0.04)
        for s in (-1, 1):
            pts = [(s * 0.27, 0.02, 0.0), (s * 0.31, 0.04, -0.12), (s * 0.30, 0.06, -0.22), (s * 0.27, 0.08, -0.28)]
            vd.ho(rig, 'curl', g.bm_tube_path(vd.catmull3(pts, 12), lambda t: 0.05 - 0.02 * t, segr=12), m)
            pts = [(s * 0.20, 0.22, -0.05), (s * 0.24, 0.26, -0.17), (s * 0.22, 0.25, -0.27)]
            vd.ho(rig, 'curl_b', g.bm_tube_path(vd.catmull3(pts, 10), lambda t: 0.05 - 0.02 * t, segr=12), m)


# =========================================================================== hats
HAT = sub('hat', Z['hat'])
HAT2 = sub('hat2', Z['hat_detail'])
HATFIX = sub(None, Z['hat_detail'])


def _hatm(ctx, slot='hat', shade=1.0, rough=0.92):
    return M('hat_' + slot, ctx.col(slot, shade), rough)


@part('hat_beanie', 'hat', 'head', {'main': HAT}, cls='full', label={'ko': '비니', 'en': 'beanie'})
def b_hat_beanie(rig, ctx, put):
    with put('main'):
        k = _hatm(ctx)
        cb.cap_shell(rig, k, lambda x, y: 0.22 - 0.22 * y, base=1.13, puff=0.25, name='beanie', lumps=0.03)
        cb.tilted_ring(rig, 'beanie_cuff', _hatm(ctx, shade=0.9), tb.HEAD_R[0] * 1.07, 0.046, 0.44, 0.0, sy=0.97,
                       rz=1.2)


@part('hat_pompom', 'hat', 'head', {'main': HAT, 'pom': HAT2}, cls='full',
      label={'ko': '방울 털모자', 'en': 'pompom hat'})
def b_hat_pompom(rig, ctx, put):
    with put('main'):
        k = _hatm(ctx)
        cb.cap_shell(rig, k, lambda x, y: 0.22 - 0.22 * y, base=1.13, puff=0.30, name='beanie', lumps=0.03)
    with put('pom'):
        cb.tilted_ring(rig, 'beanie_cuff', _hatm(ctx, 'hat2'), tb.HEAD_R[0] * 1.07, 0.046, 0.44, 0.0, sy=0.97, rz=1.2)
        vd.pompom(rig, ctx.col('hat2'), (0.0, 0.02, 0.405), r=0.09)


@part('hat_ushanka', 'hat', 'head', {'main': HAT, 'fur': sub('fur', Z['hat_detail'])}, cls='full',
      label={'ko': '귀달이 털모자', 'en': 'ushanka'})
def b_hat_ushanka(rig, ctx, put):
    with put('main'):
        cb.cap_shell(rig, _hatm(ctx, rough=0.9), lambda x, y: 0.10 - 0.12 * y, base=1.15, puff=0.12, name='ushanka',
                     lumps=0.015)
    with put('fur'):
        fur = M('fur', ctx.col('fur'), 0.95)
        cb.tilted_ring(rig, 'ushanka_band', fur, tb.HEAD_R[0] * 1.12, 0.06, 0.30, 0.02, sy=1.0, tufts=12, bump=0.3,
                       seed=4.0)
        for s in (-1, 1):
            vd.ho(rig, 'earflap', vd.fuzz(g.bm_ellipsoid(0.06, 0.13, 0.15, 16, 10), 0.006, 30.0), fur,
                  loc=(s * 0.30, 0.03, -0.10), rot=(0, s * 12, 0))


@part('hat_flatcap', 'hat', 'head', {'main': HAT}, cls='full', label={'ko': '헌팅캡', 'en': 'flat cap'})
def b_hat_flatcap(rig, ctx, put):
    with put('main'):
        cap = _hatm(ctx)
        cb.cap_shell(rig, cap, lambda x, y: 0.28 - 0.16 * y, base=1.12, puff=0.10, name='cap_base', soft=0.03)
        crown = g.bm_ellipsoid(0.33, 0.335, 0.12, 32, 14)
        vd.ho(rig, 'cap_crown', vd.fuzz(crown, 0.003, 30.0), cap, loc=(0, -0.035, 0.205), rot=(-10, 0, 0))
        vd.ho(rig, 'cap_button', g.bm_ellipsoid(0.03, 0.03, 0.02, 10, 6), cap, loc=(0, -0.05, 0.325))
        brim = g.bm_lathe([(0.0, 0.0), (0.16, 0.0), (0.17, -0.008), (0.0, -0.012)], seg=32, sx=1.0, sy=0.6)
        vd.ho(rig, 'cap_brim', brim, _hatm(ctx, shade=0.85), loc=(0, -0.26, 0.135), rot=(-14, 0, 0))


@part('hat_cap', 'hat', 'head', {'main': HAT, 'visor': HAT2}, cls='full', label={'ko': '야구모자', 'en': 'baseball cap'})
def b_hat_cap(rig, ctx, put):
    with put('main'):
        cap = _hatm(ctx, rough=0.8)
        cb.cap_shell(rig, cap, lambda x, y: 0.26 - 0.18 * y, base=1.12, puff=0.12, name='cap', soft=0.03)
        vd.ho(rig, 'cap_btn', g.bm_ellipsoid(0.03, 0.03, 0.022, 10, 6), cap, loc=(0, 0.0, 0.335))
    with put('visor'):
        visor = g.bm_lathe([(0.0, 0.0), (0.17, 0.0), (0.18, -0.010), (0.0, -0.014)], seg=32, sy=0.70)
        vd.ho(rig, 'cap_visor', visor, _hatm(ctx, 'hat2', rough=0.6), loc=(0, -0.27, 0.120), rot=(-12, 0, 0))


@part('hat_bucket', 'hat', 'head', {'main': HAT, 'band': HAT2}, cls='full', label={'ko': '벙거지', 'en': 'bucket hat'})
def b_hat_bucket(rig, ctx, put):
    with put('main'):
        m = _hatm(ctx, rough=0.9)
        cb.cap_shell(rig, m, lambda x, y: 0.24 - 0.16 * y, base=1.14, puff=0.05, name='crown', soft=0.03)
        vd.ho(rig, 'crown_top', g.bm_ellipsoid(0.30, 0.30, 0.07, 32, 10), m, loc=(0, 0.0, 0.275), rot=(-6, 0, 0))
        brim = g.bm_lathe([(0.28, 0.010), (0.38, -0.030), (0.45, -0.085), (0.455, -0.10), (0.38, -0.045),
                           (0.28, -0.004)], seg=56, sy=1.0, cap_top=False, cap_bottom=False)
        vd.ho(rig, 'brim', brim, m, loc=(0, 0.0, 0.10), rot=(-8, 0, 0))
    with put('band'):
        vd.ho(rig, 'band', g.bm_ring(0.305, 0.026, seg=48, segr=8, sy=1.0, rz=1.3), _hatm(ctx, 'hat2', rough=0.8),
              loc=(0, 0.0, 0.15), rot=(-8, 0, 0))


@part('hat_beret', 'hat', 'head', {'main': HAT}, cls='top', label={'ko': '베레모', 'en': 'beret'})
def b_hat_beret(rig, ctx, put):
    with put('main'):
        b = _hatm(ctx, rough=0.85)
        vd.ho(rig, 'beret', vd.fuzz(g.bm_ellipsoid(0.335, 0.32, 0.085, 32, 14), 0.002), b, loc=(-0.04, 0.02, 0.24),
              rot=(-10, -14, 0))
        vd.ho(rig, 'beret_band', g.bm_ring(0.25, 0.022, seg=40, segr=8), b, loc=(-0.02, 0.01, 0.205), rot=(-10, -10, 0))
        vd.ho(rig, 'beret_nub', g.bm_ellipsoid(0.025, 0.025, 0.03, 8, 6), b, loc=(-0.06, 0.03, 0.33))


@part('hat_earflap', 'hat', 'head', {'main': HAT, 'stripe': HAT2}, cls='full',
      label={'ko': '귀덮개 니트모자', 'en': 'earflap knit'})
def b_hat_earflap(rig, ctx, put):
    with put('main'):
        k = _hatm(ctx)
        cb.cap_shell(rig, k, lambda x, y: 0.14 - 0.16 * y, base=1.13, puff=0.22, name='knit', lumps=0.03)
        for s in (-1, 1):
            vd.ho(rig, 'flap', vd.fuzz(g.bm_ellipsoid(0.05, 0.11, 0.13, 14, 8), 0.004, 40.0), k,
                  loc=(s * 0.30, 0.02, -0.08), rot=(0, s * 10, 0))
            pts = [(s * 0.31, 0.02, -0.20), (s * 0.31, 0.0, -0.30), (s * 0.30, -0.01, -0.38)]
            vd.ho(rig, 'tassel', g.bm_tube_path(pts, 0.016, segr=6), k)
            vd.ho(rig, 'tassel_end', vd.fuzz(g.bm_ellipsoid(0.03, 0.03, 0.04, 10, 6), 0.004, 40.0), k,
                  loc=(s * 0.30, -0.01, -0.41))
        vd.pompom(rig, ctx.col('hat'), (0.0, 0.02, 0.40), r=0.07)
    with put('stripe'):
        for zf, zb in ((0.42, 0.08), (0.62, 0.30)):
            cb.tilted_ring(rig, 'stripe', _hatm(ctx, 'hat2'), tb.HEAD_R[0] * (1.10 if zf < 0.5 else 1.03), 0.022, zf,
                           zb, sy=0.97, rz=1.0)


@part('hat_stocking', 'hat', 'head', {'main': HAT, 'pom': HAT2}, cls='full',
      label={'ko': '긴 방울모자', 'en': 'stocking cap'})
def b_hat_stocking(rig, ctx, put):
    with put('main'):
        k = _hatm(ctx)
        cb.cap_shell(rig, k, lambda x, y: 0.22 - 0.22 * y, base=1.13, puff=0.20, name='beanie', lumps=0.03)
        pts = [(0, 0.04, 0.30), (0.02, 0.14, 0.40), (0.05, 0.30, 0.38), (0.08, 0.40, 0.24)]
        vd.ho(rig, 'sock', vd.fuzz(g.bm_tube_path(vd.catmull3(pts, 14), lambda t: 0.20 * (1 - t) + 0.025, segr=16),
                                   0.004, 40.0), k)
        cb.tilted_ring(rig, 'cuff', _hatm(ctx, shade=0.9), tb.HEAD_R[0] * 1.07, 0.046, 0.44, 0.0, sy=0.97, rz=1.2)
    with put('pom'):
        vd.pompom(rig, ctx.col('hat2'), (0.085, 0.42, 0.20), r=0.07)


@part('hat_fedora', 'hat', 'head', {'main': HAT, 'band': HAT2}, cls='full', ages=['adult', 'elder'],
      label={'ko': '중절모', 'en': 'felt hat'})
def b_hat_fedora(rig, ctx, put):
    with put('main'):
        m = _hatm(ctx, rough=0.8)
        cb.cap_shell(rig, m, lambda x, y: 0.28 - 0.15 * y, base=1.13, puff=0.0, name='crown_base', soft=0.03)
        crown = g.bm_lathe([(0.28, 0.0), (0.285, 0.12), (0.26, 0.20), (0.12, 0.215), (0.0, 0.19)], seg=40, sy=0.92,
                           smooth_n=12, cap_bottom=False)
        vd.ho(rig, 'crown', crown, m, loc=(0, 0.01, 0.17), rot=(-6, 0, 0))
        brim = g.bm_lathe([(0.27, 0.008), (0.40, -0.004), (0.46, 0.020), (0.465, 0.008), (0.40, -0.016),
                           (0.27, -0.006)], seg=56, sy=0.98, cap_top=False, cap_bottom=False)
        vd.ho(rig, 'brim', brim, m, loc=(0, 0.01, 0.17), rot=(-8, 0, 0))
    with put('band'):
        vd.ho(rig, 'band', g.bm_ring(0.284, 0.028, seg=48, segr=8, sy=0.93, rz=1.3), _hatm(ctx, 'hat2', rough=0.7),
              loc=(0, 0.01, 0.205), rot=(-6, 0, 0))


@part('hat_headband', 'hat', 'head', {'main': HAT}, cls='top', label={'ko': '귀마개 밴드', 'en': 'ear warmer'})
def b_hat_headband(rig, ctx, put):
    with put('main'):
        cb.tilted_ring(rig, 'band', _hatm(ctx), tb.HEAD_R[0] * 1.03, 0.052, 0.26, -0.16, sy=1.0, rz=1.45)


def _peaked_cap(rig, ctx, put, slot='hat', top_scale=1.0, band='#1E1E26', badge='#E8B33A', badge_shape='oval'):
    with put('main'):
        m = _hatm(ctx, slot, rough=0.65)
        cb.cap_shell(rig, m, lambda x, y: 0.26 - 0.12 * y, base=1.13, puff=0.10, name='cap', soft=0.03)
        vd.ho(rig, 'cap_top', g.bm_ellipsoid(0.33 * top_scale, 0.33 * top_scale, 0.085, 32, 10), m,
              loc=(0, -0.01, 0.235), rot=(-8, 0, 0))
    with put('trim'):
        visor = g.bm_lathe([(0.0, 0.0), (0.16, 0.0), (0.17, -0.008), (0.0, -0.012)], seg=32, sy=0.62)
        vd.ho(rig, 'cap_visor', visor, M('cap_visor', '#1E1E26', 0.25), loc=(0, -0.26, 0.135), rot=(-12, 0, 0))
        vd.ho(rig, 'cap_band', g.bm_ring(0.300, 0.024, seg=48, segr=8, sy=0.99, rz=1.3), M('cap_band', band, 0.6),
              loc=(0, 0.0, 0.152), rot=(-8, 0, 0))
        if badge_shape == 'star':
            pts = []
            for k in range(10):
                a = PI / 2 + k * PI / 5
                r = 0.042 if k % 2 == 0 else 0.019
                pts.append((r * math.cos(a), r * math.sin(a)))
            st = g.bm_slab([(y, z) for y, z in pts], 0.012, bevel=0.003)
            g.bm_transform(st, Matrix.Rotation(PI / 2, 4, 'Z'))
            vd.ho(rig, 'cap_badge', st, M('badge', badge, 0.3, metal=0.7), loc=(0, -0.305, 0.20), rot=(-8, 0, 0))
        else:
            vd.ho(rig, 'cap_badge', g.bm_ellipsoid(0.042, 0.014, 0.034, 12, 6), M('badge', badge, 0.3, metal=0.7),
                  loc=(0, -0.300, 0.198), rot=(-8, 0, 0))


@part('hat_police', 'hat', 'head', {'main': HAT, 'trim': HATFIX}, cls='full', tags=['job'], ages=['adult', 'elder'],
      label={'ko': '경찰 모자', 'en': 'police cap'})
def b_hat_police(rig, ctx, put):
    _peaked_cap(rig, ctx, put, band='#2A2E3A', badge='#E8C04A', badge_shape='star')


@part('hat_station', 'hat', 'head', {'main': HAT, 'trim': HATFIX}, cls='full', tags=['job'], ages=['adult', 'elder'],
      label={'ko': '역무원 모자', 'en': 'station cap'})
def b_hat_station(rig, ctx, put):
    _peaked_cap(rig, ctx, put, top_scale=1.05, band='#C8343A', badge='#E8B33A')


@part('hat_postal', 'hat', 'head', {'main': HAT, 'trim': HATFIX}, cls='full', tags=['job'], ages=['adult', 'elder'],
      label={'ko': '우체부 모자', 'en': 'postal cap'})
def b_hat_postal(rig, ctx, put):
    _peaked_cap(rig, ctx, put, top_scale=0.97, band='#22305A', badge='#E8B33A')


@part('hat_nurse', 'hat', 'head', {'main': HATFIX}, cls='top', tags=['job'], ages=['adult', 'elder'],
      label={'ko': '간호사 모자', 'en': 'nurse cap'})
def b_hat_nurse(rig, ctx, put):
    with put('main'):
        w = M('nurse_cap', '#FBFAF6', 0.6, emission='#FFFFFF', emission_strength=0.05)
        cap = g.bm_lathe([(0.0, 0.0), (0.20, 0.0), (0.21, 0.07), (0.17, 0.10), (0.0, 0.10)], seg=32, sx=1.0, sy=0.62,
                         smooth_n=8)
        vd.ho(rig, 'nurse_cap', cap, w, loc=(0, -0.02, 0.255), rot=(-28, 0, 0))
        red = M('cross', '#E04848', 0.5)
        vd.ho(rig, 'cross_v', g.bm_box(0.022, 0.012, 0.064, bevel=0.004), red, loc=(0, -0.155, 0.335), rot=(-28, 0, 0))
        vd.ho(rig, 'cross_h', g.bm_box(0.064, 0.012, 0.022, bevel=0.004), red, loc=(0, -0.155, 0.335), rot=(-28, 0, 0))


@part('hat_hardhat', 'hat', 'head', {'main': HAT}, cls='full', tags=['job'], ages=['adult', 'elder'],
      label={'ko': '안전모', 'en': 'hard hat'})
def b_hat_hardhat(rig, ctx, put):
    with put('main'):
        m = _hatm(ctx, rough=0.35)
        cb.cap_shell(rig, m, lambda x, y: 0.22 - 0.12 * y, base=1.16, puff=0.10, name='dome', soft=0.02)
        brim = g.bm_lathe([(0.30, 0.010), (0.37, 0.0), (0.38, -0.012), (0.30, -0.006)], seg=56, sy=1.0, cap_top=False,
                          cap_bottom=False)
        vd.ho(rig, 'brim', brim, m, loc=(0, -0.01, 0.10), rot=(-10, 0, 0))
        ridge = g.bm_ring(0.30, 0.022, seg=48, segr=8, u0=PI * 0.08, u1=PI * 0.92, closed=False)
        g.bm_transform(ridge, Matrix.Rotation(PI / 2, 4, 'Y'))
        vd.ho(rig, 'ridge', ridge, m, loc=(0, 0.0, 0.03), rot=(0, 0, 90))


# =========================================================================== head accessories / faces

@part('acc_glasses', 'glasses', 'head', {'main': sub('glasses', Z['glasses'])}, label={'ko': '동그란 안경', 'en': 'round glasses'})
def b_acc_glasses(rig, ctx, put):
    with put('main'):
        vd.round_glasses(rig, ctx.col('glasses'), r=0.070)


@part('acc_glasses_sq', 'glasses', 'head', {'main': sub('glasses', Z['glasses'])},
      label={'ko': '네모 안경', 'en': 'square glasses'})
def b_acc_glasses_sq(rig, ctx, put):
    import vil_face as vf
    with put('main'):
        fm = M('glasses', ctx.col('glasses'), 0.3, metal=0.4)
        eu, ev = 0.116, -0.030
        for s in (-1, 1):
            rr = vf._round_rect(s * eu, ev, 0.074, 0.056, n=5)
            vd.face_obj(rig, 'sq_rim', vf.bm_stroke(rr, 0.0095, thick=0.013, closed=True, n=40, out=0.024), fm)
            p0, _ = vf.surf(s * (eu + 0.074), ev, 0.024)
            p1 = cb.head_point(s * PI / 2 * 0.92, -0.04, out=0.02)[0]
            vd.ho(rig, 'glass_arm', g.bm_tube_path([p0, (p0 + p1) / 2 + Vector((0, 0, 0.01)), p1], 0.008, segr=6), fm)
        vd.face_obj(rig, 'bridge', vf.bm_stroke([(-0.042, ev + 0.01), (0.0, ev + 0.02), (0.042, ev + 0.01)], 0.008,
                                               thick=0.011, out=0.024), fm)


@part('acc_earmuffs', 'headacc', 'head', {'main': sub('acc', Z['earmuffs']), 'band': sub('acc2', Z['earmuffs'] + 1)},
      label={'ko': '귀마개', 'en': 'earmuffs'})
def b_acc_earmuffs(rig, ctx, put):
    with put('main'):
        for s in (-1, 1):
            vd.ho(rig, 'earmuff', g.bm_ring(0.0, 0.078, seg=24, segr=14, tufts=6, bump=0.3, seed=3.0 + s),
                  M('earmuff', ctx.col('acc'), 0.95), loc=(s * 0.318, 0.0, -0.06))
    with put('band'):
        pts = []
        for k in range(11):
            t = -PI / 2 + PI * k / 10
            pts.append((math.sin(t) * tb.HEAD_R[0] * 1.13, 0.02, math.cos(t) * tb.HEAD_R[2] * 1.17 - 0.03))
        vd.ho(rig, 'earmuff_band', g.bm_tube_path(pts, 0.017, segr=8), M('earmuff_band', ctx.col('acc2'), 0.5))


@part('acc_ribbon', 'headacc', 'head', {'main': sub('acc2', Z['hair_top'] + 1)}, label={'ko': '리본', 'en': 'hair bow'})
def b_acc_ribbon(rig, ctx, put):
    with put('main'):
        vd.bow_ribbon(rig, ctx.col('acc2'), (0.20, -0.02, 0.27), rot=(-20, -35, 25), s=1.35)


@part('acc_hairclip', 'headacc', 'head', {'main': sub('acc2', Z['hair_top'] + 1)},
      label={'ko': '꽃 머리핀', 'en': 'flower clip'})
def b_acc_hairclip(rig, ctx, put):
    with put('main'):
        m = M('clip', ctx.col('acc2'), 0.5)
        c = (-0.25, -0.10, 0.17)
        for k in range(5):
            a = TAU5 * k
            vd.ho(rig, 'petal', g.bm_ellipsoid(0.032, 0.014, 0.022, 10, 6), m,
                  loc=(c[0] + 0.030 * math.cos(a) * 0.6, c[1] - 0.01, c[2] + 0.030 * math.sin(a)),
                  rot=(0, 0, math.degrees(a)))
        vd.ho(rig, 'petal_c', g.bm_ellipsoid(0.016, 0.014, 0.016, 8, 6), M('clip_c', '#F2C14E', 0.5),
              loc=(c[0], c[1] - 0.02, c[2]))


TAU5 = math.tau / 5

FH = sub('hair', Z['facial_hair'])


@part('fh_moustache', 'facial_hair', 'head', {'main': FH}, ages=['adult', 'elder'],
      label={'ko': '콧수염', 'en': 'moustache'})
def b_fh_moustache(rig, ctx, put):
    with put('main'):
        sm = M('stache', ctx.col('hair'), 0.8)
        for s in (-1, 1):
            cb.on_head('stache', vd.fuzz(g.bm_ellipsoid(0.066, 0.032, 0.034, 14, 8), 0.004, 50.0), sm, rig.j['head'],
                       s * 0.13, -0.228, out=0.002, tilt=-s * 18)


@part('fh_handlebar', 'facial_hair', 'head', {'main': FH}, ages=['adult', 'elder'],
      label={'ko': '팔자수염', 'en': 'handlebar'})
def b_fh_handlebar(rig, ctx, put):
    with put('main'):
        sm = M('stache', ctx.col('hair'), 0.75)
        for s in (-1, 1):
            pts = [(s * 0.01, -0.272, -0.07), (s * 0.08, -0.26, -0.085), (s * 0.16, -0.225, -0.075),
                   (s * 0.21, -0.19, -0.04), (s * 0.215, -0.18, -0.005), (s * 0.19, -0.19, 0.005)]
            vd.ho(rig, 'handlebar', g.bm_tube_path(vd.catmull3(pts, 16), lambda t: 0.034 * (1 - 0.72 * t) + 0.004,
                                                   segr=10), sm)


@part('fh_beard', 'facial_hair', 'head', {'main': dict(FH, z=Z['face'] - 0.5)}, ages=['adult', 'elder'],
      label={'ko': '턱수염', 'en': 'beard'})
def b_fh_beard(rig, ctx, put):
    with put('main'):
        c = ctx.col('hair')
        cb.beard(rig, c, edge=-0.36, curve=0.42, base=1.12, chin=0.14)
        bm = M('beard', c, 0.8)
        for s in (-1, 1):
            cb.on_head('stache', g.bm_ellipsoid(0.055, 0.03, 0.03, 12, 8), bm, rig.j['head'], s * 0.11, -0.29,
                       out=-0.004, tilt=-s * 18)


@part('fh_longbeard', 'facial_hair', 'head', {'main': dict(FH, z=Z['face'] - 0.5)}, ages=['elder'],
      label={'ko': '긴 수염', 'en': 'long beard'})
def b_fh_longbeard(rig, ctx, put):
    with put('main'):
        c = ctx.col('hair')
        wm = M('beard', c, 0.75)
        cb.beard(rig, c, edge=-0.40, curve=0.30, base=1.14, chin=0.18)
        vd.ho(rig, 'beard_long', vd.fuzz(g.bm_lathe([(0.0, -0.40), (0.06, -0.36), (0.12, -0.25), (0.14, -0.16),
                                                     (0.12, -0.10), (0.0, -0.08)], seg=20, sy=0.6, smooth_n=12),
                                         0.006, 35.0), wm, loc=(0, -0.20, -0.06), rot=(14, 0, 0))
        for s in (-1, 1):
            cb.on_head('stache', vd.fuzz(g.bm_ellipsoid(0.068, 0.032, 0.030, 14, 8), 0.004, 50.0), wm, rig.j['head'],
                       s * 0.16, -0.215, out=0.006, tilt=-s * 26)


# =========================================================================== more tops
TOP = sub('top', Z['top'])
TOP2 = sub('top2', Z['top_detail'])
TOPFIX = sub(None, Z['top_detail'] + 0.2)
LONG_COAT = [(0.272, -0.20), (0.262, -0.10), (0.236, 0.0), (0.214, 0.10), (0.208, 0.22), (0.195, 0.31),
             (0.155, 0.39), (0.07, 0.45), (0.0, 0.46)]
LONG_DRESS = [(0.29, -0.23), (0.272, -0.10), (0.240, 0.0), (0.214, 0.10), (0.208, 0.22), (0.195, 0.31),
              (0.155, 0.39), (0.07, 0.45), (0.0, 0.46)]
SHIRT = [(0.236, -0.085), (0.230, -0.02), (0.212, 0.10), (0.208, 0.22), (0.195, 0.31), (0.155, 0.39),
         (0.07, 0.45), (0.0, 0.46)]


def _btn(rig, mat, zs, r=0.212, xs=(0.0,), size=0.018, out=0.0):
    for z in zs:
        for x in xs:
            p = cb.front_point(z, r - 0.006 if z > 0.15 else r, out)
            g.mesh_obj('button', g.bm_ellipsoid(size, size * 0.6, size, 10, 6), mat, rig.j['spine'],
                       loc=(x, p[1], p[2]))


@part('top_coat', 'top', 'body', {'main': TOP}, tags=['smart', 'warm'],
      label={'ko': '롱코트', 'en': 'long coat'})
def b_top_coat(rig, ctx, put):
    m = M('coat', ctx.col('top'), 0.8)
    with put('main'):
        _torso(LONG_COAT, m, rig, sy=0.85)
        g.mesh_obj('collar', g.bm_ring(0.142, 0.050, seg=48, segr=10, sy=0.92, rz=1.3), m, rig.j['chest'],
                   loc=(0, 0.015, 0.10))
        for s in (-1, 1):
            g.mesh_obj('lapel', vd.sector_lathe([(0.222, 0.16), (0.214, 0.24), (0.204, 0.31), (0.170, 0.38)],
                                                keep_deg=11, sy=0.86, center_deg=s * 24),
                       M('lapel', ctx.col('top', 0.82), 0.8), rig.j['spine'])
            g.mesh_obj('pocket', g.bm_box(0.08, 0.012, 0.014, bevel=0.004), M('lapel', ctx.col('top', 0.82), 0.8),
                       rig.j['spine'], loc=(s * 0.13, -0.200, -0.04), rot=(0, 0, s * 10))
        bm = M('btn_dark', ctx.col('top', 0.45), 0.4)
        for s in (-1, 1):
            for z in (-0.06, 0.04, 0.14):
                g.mesh_obj('button', g.bm_ellipsoid(0.019, 0.011, 0.019, 10, 6), bm, rig.j['spine'],
                           loc=(s * 0.065, -0.205 + 0.01 * (z < 0), z))


@part('top_hoodie', 'top', 'body', {'main': TOP, 'string': TOP2}, tags=['casual'],
      label={'ko': '후드티', 'en': 'hoodie'})
def b_top_hoodie(rig, ctx, put):
    m = M('hoodie', ctx.col('top'), 0.92)
    with put('main'):
        prof = [(0.240, -0.09), (0.236, -0.03), (0.214, 0.10), (0.210, 0.22), (0.197, 0.31), (0.157, 0.39),
                (0.07, 0.45), (0.0, 0.46)]
        _torso(prof, m, rig, sy=0.85)
        g.mesh_obj('hem_rib', g.bm_ring(0.236, 0.024, seg=56, segr=10, sy=0.86, rz=1.4), M('rib', ctx.col('top', 0.88), 0.95),
                   rig.j['spine'], loc=(0, 0, -0.075))
        g.mesh_obj('hood', vd.fuzz(g.bm_ellipsoid(0.19, 0.12, 0.15, 24, 12), 0.002), m, rig.j['chest'],
                   loc=(0, 0.19, 0.07), rot=(-22, 0, 0))
        g.mesh_obj('hood_rim', g.bm_ring(0.15, 0.03, seg=40, segr=8, sy=0.85), m, rig.j['chest'],
                   loc=(0, 0.06, 0.12), rot=(-35, 0, 0))
        g.mesh_obj('pocket', vd.sector_lathe([(0.226, 0.0), (0.220, 0.12)], keep_deg=46, sy=0.86),
                   M('pocket', ctx.col('top', 0.86), 0.92), rig.j['spine'])
    with put('string'):
        sm = M('string', ctx.col('top2'), 0.8)
        for s in (-1, 1):
            g.mesh_obj('string', g.bm_tube_path([(s * 0.04, -0.17, 0.43), (s * 0.045, -0.205, 0.36),
                                                 (s * 0.05, -0.205, 0.25)], 0.009, segr=6), sm, rig.j['spine'])
            g.mesh_obj('string_end', g.bm_ellipsoid(0.015, 0.015, 0.022, 8, 6), sm, rig.j['spine'],
                       loc=(s * 0.05, -0.205, 0.235))


@part('top_cardigan', 'top', 'body', {'shirt': TOP2, 'main': sub('top', Z['top'] + 0.5)},
      tags=['smart', 'knit'], label={'ko': '가디건', 'en': 'cardigan'})
def b_top_cardigan(rig, ctx, put):
    with put('shirt'):
        _torso(SHIRT, M('shirt', ctx.col('top2'), 0.8), rig, sy=0.84)
        for s in (-1, 1):
            g.mesh_obj('collar', g.bm_ellipsoid(0.055, 0.022, 0.034, 12, 8), M('shirt', ctx.col('top2'), 0.8),
                       rig.j['chest'], loc=(s * 0.050, -0.122, 0.080), rot=(35, s * 20, s * 30))
    with put('main'):
        k = M('cardigan', ctx.col('top'), 0.95)
        bm = cb.vest_lathe([(0.262, -0.10), (0.252, 0.0), (0.226, 0.12), (0.218, 0.24), (0.204, 0.31),
                            (0.162, 0.39), (0.11, 0.43)], gap_deg=16, seg=48, sy=0.88)
        g.mesh_obj('cardigan', vd.fuzz(bm, 0.0025, 55.0), k, rig.j['spine'])
        g.mesh_obj('hem', g.bm_ring(0.258, 0.020, seg=56, segr=8, sy=0.88, rz=1.4, u0=PI * 0.6, u1=PI * 2.4,
                                    closed=False), M('cardigan_rib', ctx.col('top', 0.88), 0.95), rig.j['spine'],
                   loc=(0, 0, -0.09), rot=(0, 0, 0))
        bm_ = M('btn_card', ctx.col('top', 0.55), 0.4)
        for z in (-0.04, 0.05, 0.14, 0.23):
            g.mesh_obj('button', g.bm_ellipsoid(0.016, 0.010, 0.016, 10, 6), bm_, rig.j['spine'],
                       loc=(0.062, -0.215 + 0.012 * (z < 0.1), z))


@part('top_bomber', 'top', 'body', {'main': TOP, 'rib': TOP2}, tags=['casual'],
      label={'ko': '항공 점퍼', 'en': 'bomber jacket'})
def b_top_bomber(rig, ctx, put):
    m = M('bomber', ctx.col('top'), 0.6)
    with put('main'):
        prof = [(0.244, -0.05), (0.240, 0.0), (0.218, 0.10), (0.212, 0.22), (0.197, 0.31), (0.157, 0.39),
                (0.07, 0.45), (0.0, 0.46)]
        _torso(prof, m, rig, sy=0.85)
        for s in (-1, 1):
            g.mesh_obj('patch', g.bm_box(0.07, 0.012, 0.012, bevel=0.004), M('bomber_d', ctx.col('top', 0.8), 0.6),
                       rig.j['spine'], loc=(s * 0.12, -0.196, 0.18), rot=(0, 0, s * 6))
    with put('rib'):
        rib = M('rib', ctx.col('top2'), 0.95)
        g.mesh_obj('hem_rib', g.bm_ring(0.238, 0.030, seg=56, segr=10, sy=0.86, rz=1.4), rib, rig.j['spine'],
                   loc=(0, 0, -0.06))
        g.mesh_obj('collar_rib', g.bm_ring(0.13, 0.032, seg=48, segr=8, sy=0.92, rz=1.4), rib, rig.j['chest'],
                   loc=(0, 0.01, 0.085))
    with put('main'):
        zm = M('zip_b', ctx.col('top', 0.6), 0.4)
        g.mesh_obj('zip', g.bm_box(0.012, 0.012, 0.30, bevel=0.004), zm, rig.j['spine'], loc=(0.0, -0.200, 0.12))


@part('top_dress', 'top', 'body', {'main': TOP, 'collar': TOP2}, tags=['dress'],
      label={'ko': '원피스 코트', 'en': 'coat dress'})
def b_top_dress(rig, ctx, put):
    m = M('dress', ctx.col('top'), 0.85)
    with put('main'):
        _torso(LONG_DRESS, m, rig, sy=0.86)
        cb.belt(rig, ctx.col('top', 0.7), z=0.10, r=0.214, buckle=None, width=0.40)
    with put('collar'):
        cm = M('collar_w', ctx.col('top2'), 0.7)
        for s in (-1, 1):
            g.mesh_obj('collar', g.bm_ellipsoid(0.070, 0.028, 0.040, 14, 8), cm, rig.j['chest'],
                       loc=(s * 0.058, -0.112, 0.085), rot=(30, s * 18, s * 20))
        bm_ = M('btn_dress', ctx.col('top2'), 0.4)
        for z in (0.0, 0.17, 0.26):
            g.mesh_obj('button', g.bm_ellipsoid(0.018, 0.010, 0.018, 10, 6), bm_, rig.j['spine'],
                       loc=cb.front_point(z, 0.215 if z < 0.15 else 0.207))


@part('top_vest', 'top', 'body', {'shirt': TOP2, 'main': sub('top', Z['top'] + 0.5)}, tags=['casual'],
      label={'ko': '패딩 조끼', 'en': 'quilted vest'})
def b_top_vest(rig, ctx, put):
    with put('shirt'):
        sh = M('shirt', ctx.col('top2'), 0.85)
        _torso(SHIRT, sh, rig, sy=0.84)
        g.mesh_obj('collar', g.bm_ring(0.132, 0.034, seg=48, segr=8, sy=0.92, rz=1.3), sh, rig.j['chest'],
                   loc=(0, 0.01, 0.088))
    with put('main'):
        v = M('vest', ctx.col('top'), 0.7)
        prof = vd.quilted_profile([(0.262, -0.09), (0.255, 0.0), (0.230, 0.12), (0.222, 0.24), (0.207, 0.31),
                                   (0.168, 0.38), (0.12, 0.42)], step=0.07, amp=0.06)
        bm = g.bm_lathe(prof, seg=48, sy=0.88, smooth_n=0, cap_top=False, cap_bottom=False)
        kill = [f for f in bm.faces if abs(math.degrees(math.atan2(f.calc_center_median().x,
                                                                   -f.calc_center_median().y))) < 10]
        bmesh.ops.delete(bm, geom=kill, context='FACES')
        g.mesh_obj('vest', bm, v, rig.j['spine'])


@part('top_duffle', 'top', 'body', {'main': TOP, 'toggles': TOPFIX}, tags=['warm'],
      label={'ko': '떡볶이 코트', 'en': 'duffle coat'})
def b_top_duffle(rig, ctx, put):
    m = M('duffle', ctx.col('top'), 0.95)
    with put('main'):
        prof = [(0.268, -0.16), (0.258, -0.08), (0.236, 0.0), (0.214, 0.10), (0.208, 0.22), (0.195, 0.31),
                (0.155, 0.39), (0.07, 0.45), (0.0, 0.46)]
        bm = g.bm_lathe(prof, seg=44, sy=0.85, smooth_n=26, cap_top=False)
        g.mesh_obj('torso', vd.fuzz(bm, 0.002, 60.0), m, rig.j['spine'])
        g.mesh_obj('hood', g.bm_ellipsoid(0.19, 0.12, 0.14, 24, 12), m, rig.j['chest'], loc=(0, 0.20, 0.06),
                   rot=(-25, 0, 0))
        g.mesh_obj('yoke', vd.sector_lathe([(0.205, 0.30), (0.17, 0.37), (0.14, 0.40)], keep_deg=70, sy=0.88),
                   M('duffle_d', ctx.col('top', 0.86), 0.95), rig.j['spine'])
    with put('toggles'):
        wood = M('toggle', '#C9A26A', 0.5)
        cord = M('cord', '#4A3A30', 0.8)
        for z in (-0.02, 0.09, 0.20):
            p = cb.front_point(z, 0.218 if z < 0.15 else 0.21, 0.012)
            g.mesh_obj('toggle', g.bm_capsule(0.012, 0.05, seg=10, rings=4), wood, rig.j['spine'],
                       loc=(0.025, p[1], p[2]), rot=(0, 90, 8))
            g.mesh_obj('cord', g.bm_box(0.07, 0.008, 0.010, bevel=0.003), cord, rig.j['spine'],
                       loc=(-0.015, p[1] + 0.004, p[2]))


# ---- job tops

@part('top_uniform', 'top', 'body', {'main': TOP, 'trim': TOP2, 'brass': TOPFIX}, tags=['job'],
      ages=['adult', 'elder'], label={'ko': '제복', 'en': 'uniform jacket'})
def b_top_uniform(rig, ctx, put):
    m = M('uniform', ctx.col('top'), 0.7)
    with put('main'):
        prof = [(0.250, -0.10), (0.240, -0.02), (0.214, 0.10), (0.209, 0.22), (0.196, 0.31), (0.156, 0.39),
                (0.07, 0.45), (0.0, 0.46)]
        _torso(prof, m, rig, sy=0.85)
        g.mesh_obj('collar', g.bm_ring(0.134, 0.040, seg=48, segr=10, sy=0.92, rz=1.3), m, rig.j['chest'],
                   loc=(0, 0.012, 0.098))
        for s in (-1, 1):
            g.mesh_obj('pocket', g.bm_box(0.075, 0.012, 0.050, bevel=0.006), M('uni_d', ctx.col('top', 0.85), 0.7),
                       rig.j['spine'], loc=(s * 0.10, -0.188, 0.22), rot=(-6, 0, s * 8))
    with put('trim'):
        tm = M('uni_trim', ctx.col('top2'), 0.6)
        for s in (-1, 1):
            g.mesh_obj('epaulette', g.bm_box(0.10, 0.06, 0.018, bevel=0.008), tm, rig.j['chest'],
                       loc=(s * 0.13, 0.0, 0.06), rot=(0, s * -22, 0))
        cb.belt(rig, ctx.col('top2', 0.6), z=-0.02, r=0.238, buckle=None, width=0.5)
    with put('brass'):
        gold = M('brass', '#E8B33A', 0.3, metal=0.7)
        for s in (-1, 1):
            for z in (0.02, 0.11, 0.20):
                g.mesh_obj('button', g.bm_ellipsoid(0.017, 0.010, 0.017, 10, 6), gold, rig.j['spine'],
                           loc=(s * 0.060, -0.198 + 0.006 * (z > 0.15), z))


@part('top_labcoat', 'top', 'body', {'under': TOP2, 'main': sub('top', Z['top'] + 0.5)}, tags=['job'],
      ages=['adult', 'elder'], label={'ko': '의사 가운', 'en': 'lab coat'})
def b_top_labcoat(rig, ctx, put):
    with put('under'):
        sw = M('sweater', ctx.col('top2'), 0.95)
        _torso(SHIRT, sw, rig, sy=0.84)
        g.mesh_obj('turtle', g.bm_ring(0.128, 0.036, seg=48, segr=8, sy=0.92, rz=1.4), sw, rig.j['chest'],
                   loc=(0, 0.01, 0.090))
    with put('main'):
        coat = M('labcoat', ctx.col('top'), 0.7)
        g.mesh_obj('labcoat', cb.vest_lathe([(0.282, -0.24), (0.266, -0.10), (0.243, 0.02), (0.224, 0.14),
                                             (0.216, 0.24), (0.202, 0.31), (0.162, 0.39)], gap_deg=24, seg=44,
                                            sy=0.88), coat, rig.j['spine'])
        for s in (-1, 1):
            g.mesh_obj('lapel', vd.sector_lathe([(0.234, 0.14), (0.226, 0.24), (0.212, 0.31), (0.174, 0.38)],
                                                keep_deg=9, sy=0.88, center_deg=s * 31), coat, rig.j['spine'])
            g.mesh_obj('coat_pocket', g.bm_box(0.08, 0.014, 0.075, bevel=0.008), M('coat_pocket', ctx.col('top', 0.93), 0.7),
                       rig.j['spine'], loc=(s * 0.165, -0.195, -0.08), rot=(0, 0, s * 26))
        g.mesh_obj('pen', g.bm_cyl(0.009, 0.009, 0.065, seg=8), M('pen', ctx.col('top', 0.45), 0.3), rig.j['spine'],
                   loc=(-0.135, -0.18, 0.20))


@part('top_blazer', 'top', 'body', {'main': TOP, 'shirt': sub(None, Z['top'] - 0.5), 'crest': TOPFIX}, tags=['job'],
      label={'ko': '교복 재킷', 'en': 'blazer'})
def b_top_blazer(rig, ctx, put):
    with put('shirt'):
        w = M('shirt_w', '#F7F5F0', 0.6)
        _torso(SHIRT, w, rig, sy=0.84)
        for s in (-1, 1):
            g.mesh_obj('collar', g.bm_ellipsoid(0.056, 0.022, 0.036, 12, 8), w, rig.j['chest'],
                       loc=(s * 0.050, -0.124, 0.082), rot=(35, s * 20, s * 30))
    with put('main'):
        m = M('blazer', ctx.col('top'), 0.75)
        g.mesh_obj('blazer', cb.vest_lathe([(0.252, -0.10), (0.244, -0.02), (0.222, 0.10), (0.216, 0.20),
                                            (0.204, 0.30), (0.164, 0.39)], gap_deg=20, seg=44, sy=0.88), m,
                   rig.j['spine'])
        for s in (-1, 1):
            g.mesh_obj('lapel', vd.sector_lathe([(0.226, 0.08), (0.220, 0.20), (0.208, 0.30), (0.170, 0.38)],
                                                keep_deg=10, sy=0.88, center_deg=s * 27),
                       M('lapel_b', ctx.col('top', 0.82), 0.75), rig.j['spine'])
    with put('crest'):
        g.mesh_obj('crest', g.bm_box(0.05, 0.012, 0.055, bevel=0.008), M('crest', '#F2C14E', 0.4, metal=0.3),
                   rig.j['spine'], loc=(0.11, -0.200, 0.21), rot=(-6, 0, -10))
        gold = M('btn_g', '#E8B33A', 0.3, metal=0.6)
        for z in (-0.03, 0.06):
            g.mesh_obj('button', g.bm_ellipsoid(0.016, 0.010, 0.016, 10, 6), gold, rig.j['spine'],
                       loc=(0.052, -0.214, z))


@part('top_tunic', 'top', 'body', {'main': TOP, 'badge': TOPFIX}, tags=['job', 'dress'], ages=['adult', 'elder'],
      label={'ko': '간호사복', 'en': 'nurse tunic'})
def b_top_tunic(rig, ctx, put):
    m = M('tunic', ctx.col('top'), 0.65)
    with put('main'):
        prof = [(0.282, -0.20), (0.266, -0.10), (0.236, 0.0), (0.214, 0.10), (0.208, 0.22), (0.195, 0.31),
                (0.155, 0.39), (0.07, 0.45), (0.0, 0.46)]
        _torso(prof, m, rig, sy=0.86)
        for s in (-1, 1):
            g.mesh_obj('collar', g.bm_ellipsoid(0.064, 0.026, 0.038, 14, 8), M('tunic_c', ctx.col('top', 0.9), 0.65),
                       rig.j['chest'], loc=(s * 0.056, -0.114, 0.085), rot=(30, s * 18, s * 20))
        cb.belt(rig, ctx.col('top', 0.9), z=0.10, r=0.214, buckle=None, width=0.35)
    with put('badge'):
        red = M('cross', '#E04848', 0.5)
        w = M('badge_w', '#FBFAF6', 0.6)
        g.mesh_obj('badge', g.bm_ellipsoid(0.034, 0.010, 0.034, 14, 6), w, rig.j['spine'], loc=(-0.10, -0.192, 0.22))
        g.mesh_obj('cross_v', g.bm_box(0.012, 0.01, 0.036, bevel=0.003), red, rig.j['spine'], loc=(-0.10, -0.200, 0.22))
        g.mesh_obj('cross_h', g.bm_box(0.036, 0.01, 0.012, bevel=0.003), red, rig.j['spine'], loc=(-0.10, -0.200, 0.22))


PARTS['top_dress'].dress = True
PARTS['top_tunic'].dress = True
PARTS['top_vest'].sleeves = 'top2'


# =========================================================================== more bottoms / shoes
BOT = sub('bottom', Z['pants'])
TIGHTS = sub('bottom2', Z['tights'])
SKIRT = sub('bottom', Z['skirt'])


def _legs(rig, mat, thigh=0.074, shin=0.064, name='leg'):
    for n in ('R', 'L'):
        g.mesh_obj(name + '_thigh_' + n, g.bm_capsule(thigh, cb.THIGH, r_end=thigh - 0.008), mat, rig.j['hip_' + n])
        g.mesh_obj(name + '_shin_' + n, g.bm_capsule(shin, 0.075, r_end=shin - 0.002), mat, rig.j['knee_' + n])


@part('bot_snowpants', 'bottom', 'body', {'main': BOT}, tags=['warm'], label={'ko': '방한 바지', 'en': 'snow pants'})
def b_bot_snowpants(rig, ctx, put):
    pm = M('snowpants', ctx.col('bottom'), 0.7)
    with put('main'):
        _seat(rig, pm, hem_r=0.222)
        _legs(rig, pm, thigh=0.084, shin=0.072)
        for n in ('R', 'L'):
            g.mesh_obj('quilt', g.bm_ring(0.080, 0.012, seg=24, segr=6), M('snow_d', ctx.col('bottom', 0.85), 0.7),
                       rig.j['hip_' + n], loc=(0, 0, -0.08))


@part('bot_skirt', 'bottom', 'body', {'tights': TIGHTS, 'main': SKIRT}, tags=['skirt'],
      label={'ko': '치마', 'en': 'skirt'})
def b_bot_skirt(rig, ctx, put):
    with put('tights'):
        tm = M('tights', ctx.col('bottom2'), 0.8)
        _legs(rig, tm, thigh=0.068, shin=0.060, name='tight')
    with put('main'):
        sm = M('skirt', ctx.col('bottom'), 0.85)
        g.mesh_obj('skirt', g.bm_lathe([(0.300, -0.20), (0.292, -0.17), (0.255, -0.06), (0.225, 0.02), (0.222, 0.06)],
                                       seg=48, sy=0.86, smooth_n=12, cap_top=False, cap_bottom=False), sm, rig.j['hips'])


@part('bot_longskirt', 'bottom', 'body', {'main': SKIRT}, tags=['skirt'],
      label={'ko': '롱스커트', 'en': 'long skirt'})
def b_bot_longskirt(rig, ctx, put):
    with put('main'):
        sm = M('lskirt', ctx.col('bottom'), 0.85)
        g.mesh_obj('skirt', g.bm_lathe([(0.300, -0.29), (0.296, -0.26), (0.262, -0.12), (0.228, 0.0), (0.222, 0.06)],
                                       seg=48, sy=0.86, smooth_n=12, cap_top=False, cap_bottom=False), sm, rig.j['hips'])
        _legs(rig, sm, thigh=0.06, shin=0.05, name='under')


@part('bot_pleated', 'bottom', 'body', {'tights': TIGHTS, 'main': SKIRT}, tags=['skirt', 'school'],
      label={'ko': '주름치마', 'en': 'pleated skirt'})
def b_bot_pleated(rig, ctx, put):
    with put('tights'):
        _legs(rig, M('tights', ctx.col('bottom2'), 0.8), thigh=0.068, shin=0.060, name='tight')
    with put('main'):
        bm = g.bm_lathe([(0.296, -0.18), (0.288, -0.15), (0.250, -0.05), (0.224, 0.02), (0.222, 0.06)], seg=64,
                        sy=0.86, smooth_n=12, cap_top=False, cap_bottom=False)
        for v in bm.verts:
            if v.co.z < 0.0:
                a = math.atan2(v.co.y, v.co.x)
                f = 1 + 0.035 * (abs(((a * 16 / math.tau) % 1.0) - 0.5) * 2 - 0.5) * min(1.0, -v.co.z / 0.12)
                v.co.x *= f
                v.co.y *= f
        g.mesh_obj('pleats', bm, M('pleat', ctx.col('bottom'), 0.85), rig.j['hips'])


@part('bot_overalls', 'bottom', 'body', {'main': BOT, 'bib': sub('bottom', Z['bib'])}, tags=['work'],
      label={'ko': '멜빵바지', 'en': 'overalls'})
def b_bot_overalls(rig, ctx, put):
    om = M('overalls', ctx.col('bottom'), 0.85)
    with put('main'):
        _seat(rig, om, hem_r=0.224, top_z=0.10)
        _legs(rig, om, thigh=0.076, shin=0.066)
    with put('bib'):
        g.mesh_obj('bib', vd.sector_lathe([(0.226, -0.02), (0.222, 0.10), (0.214, 0.20), (0.206, 0.27)], keep_deg=30,
                                          sy=0.88), om, rig.j['spine'])
        g.mesh_obj('bib_pocket', vd.sector_lathe([(0.226, 0.13), (0.222, 0.20)], keep_deg=16, sy=0.88),
                   M('overalls_d', ctx.col('bottom', 0.85), 0.85), rig.j['spine'])
        for s in (-1, 1):
            g.mesh_obj('strap', g.bm_tube_path([(s * 0.075, -0.170, 0.26), (s * 0.090, -0.12, 0.40),
                                                (s * 0.09, 0.02, 0.44), (s * 0.08, 0.17, 0.32), (s * 0.075, 0.19, 0.10)],
                                               0.014, segr=6, side_ref=(1, 0, 0), flat=2.2), om, rig.j['spine'])
        gold = M('buckle', ctx.col('bottom', 1.35), 0.35, metal=0.4)
        for s in (-1, 1):
            g.mesh_obj('btn', g.bm_ellipsoid(0.018, 0.010, 0.018, 10, 6), gold, rig.j['spine'],
                       loc=(s * 0.075, -0.188, 0.262))


@part('bot_tights', 'bottom', 'body', {'main': TIGHTS}, tags=['under_dress'],
      label={'ko': '타이츠', 'en': 'tights'})
def b_bot_tights(rig, ctx, put):
    with put('main'):
        tm = M('tights', ctx.col('bottom2'), 0.8)
        _seat(rig, tm, hem_r=0.205, top_z=0.04)
        _legs(rig, tm, thigh=0.068, shin=0.060, name='tight')


SHOE = sub('shoes', Z['shoes'])


@part('shoe_furboots', 'shoes', 'body', {'main': SHOE, 'fur': sub('fur', Z['shoes'] + 0.5)},
      label={'ko': '털부츠', 'en': 'fur boots'})
def b_shoe_furboots(rig, ctx, put):
    with put('main'):
        bm_ = M('boots', ctx.col('shoes'), 0.65)
        for n in ('R', 'L'):
            _boot(rig, n, bm_)
    with put('fur'):
        fur = M('fur', ctx.col('fur'), 0.95)
        for n in ('R', 'L'):
            g.mesh_obj('bootfur_' + n, g.bm_ring(0.066, 0.028, seg=32, segr=10, tufts=7, bump=0.35, seed=4.0, sy=1.1),
                       fur, rig.j['knee_' + n], loc=(0, -0.006, -0.06))


@part('shoe_rubber', 'shoes', 'body', {'main': sub('shoes', Z['shoes_tall'])}, tags=['tall'],
      label={'ko': '장화', 'en': 'rubber boots'})
def b_shoe_rubber(rig, ctx, put):
    with put('main'):
        rub = M('rubber', ctx.col('shoes'), 0.3)
        for n in ('R', 'L'):
            _boot(rig, n, rub)
            g.mesh_obj('bootleg_' + n, g.bm_lathe([(0.071, -0.16), (0.073, -0.02), (0.077, 0.03), (0.0, 0.031)],
                                                  seg=20, smooth_n=0, cap_top=False), rub, rig.j['knee_' + n])


@part('shoe_shoes', 'shoes', 'body', {'main': SHOE}, label={'ko': '구두', 'en': 'shoes'})
def b_shoe_shoes(rig, ctx, put):
    with put('main'):
        sm = M('shoes', ctx.col('shoes'), 0.4)
        for n in ('R', 'L'):
            prof = [(0.0, -0.200), (0.054, -0.198), (0.066, -0.18), (0.062, -0.15), (0.0, -0.14)]
            g.mesh_obj('shoe_' + n, g.bm_lathe(prof, seg=24, sy=1.35, smooth_n=12,
                                                yoff=lambda z: -0.032 * (1 - (z + 0.2) / 0.06)),
                       sm, rig.j['knee_' + n], loc=(0, -0.016, 0.012))


# =========================================================================== body accessories / job details
ACC_NECK = sub('acc', Z['scarf'])


@part('acc_scarf', 'neck', 'body', {'main': ACC_NECK, 'stripe': sub('acc2', Z['scarf'] + 0.5)},
      label={'ko': '목도리', 'en': 'scarf'})
def b_acc_scarf(rig, ctx, put):
    with put('main'):
        sm = M('scarf', ctx.col('acc'), 0.92)
        g.mesh_obj('scarf', vd.fuzz(g.bm_ring(0.136, 0.068, seg=48, segr=12, sy=0.92), 0.003, 40.0), sm,
                   rig.j['chest'], loc=(0, 0.01, 0.10))
        g.mesh_obj('scarf_tail', g.bm_tube_path([(0.07, -0.165, 0.08), (0.08, -0.21, -0.02), (0.085, -0.23, -0.16)],
                                                0.018, segr=10, side_ref=(1, 0, 0), flat=2.6), sm, rig.j['chest'])
    with put('stripe'):
        st = M('scarf_s', ctx.col('acc2'), 0.92)
        g.mesh_obj('scarf_s', g.bm_ring(0.136, 0.070, seg=48, segr=12, sy=0.92, rz=0.26), st, rig.j['chest'],
                   loc=(0, 0.01, 0.10))
        for z in (-0.04, -0.11):
            g.mesh_obj('tail_s', g.bm_tube_path([(0.081, -0.215, z + 0.012), (0.083, -0.222, z - 0.012)], 0.020, segr=10,
                                                side_ref=(1, 0, 0), flat=2.5), st, rig.j['chest'])


@part('acc_necklace', 'neck', 'body', {'main': sub(None, Z['necklace'])}, label={'ko': '목걸이', 'en': 'necklace'})
def b_acc_necklace(rig, ctx, put):
    with put('main'):
        gold = M('gold', '#F2C14E', 0.25, metal=0.8)
        g.mesh_obj('chain', g.bm_ring(0.13, 0.009, seg=40, segr=6, sy=0.95), gold, rig.j['chest'],
                   loc=(0, -0.03, 0.05), rot=(-28, 0, 0))
        g.mesh_obj('pendant', g.bm_ellipsoid(0.024, 0.012, 0.030, 12, 8), M('gem', '#E04878', 0.2), rig.j['chest'],
                   loc=(0, -0.16, -0.01))


@part('acc_satchel', 'bag', 'body', {'main': sub('bag', Z['bag_front'])}, label={'ko': '크로스백', 'en': 'satchel'})
def b_acc_satchel(rig, ctx, put):
    with put('main'):
        bag = M('satchel', ctx.col('bag'), 0.65)
        g.mesh_obj('strap', g.bm_ring(0.222, 0.015, seg=64, segr=8, sy=0.86, rz=1.6), bag, rig.j['spine'],
                   loc=(0, 0, 0.19), rot=(0, -40, 0))
        g.mesh_obj('satchel', g.bm_box(0.08, 0.17, 0.14, bevel=0.03), bag, rig.j['spine'], loc=(0.262, -0.02, -0.02),
                   rot=(0, -8, 0))
        g.mesh_obj('flap', g.bm_box(0.086, 0.176, 0.055, bevel=0.016), M('satchel_d', ctx.col('bag', 0.8), 0.65),
                   rig.j['spine'], loc=(0.268, -0.02, 0.04), rot=(0, -8, 0))


@part('acc_backpack', 'bag', 'body', {'pack': sub('bag', Z['bag_back']), 'straps': sub('bag', Z['bag_front'])},
      label={'ko': '배낭', 'en': 'backpack'})
def b_acc_backpack(rig, ctx, put):
    with put('pack'):
        pack = M('pack', ctx.col('bag'), 0.7)
        g.mesh_obj('backpack', g.bm_box(0.30, 0.15, 0.30, bevel=0.05, segs=4), pack, rig.j['chest'],
                   loc=(0, 0.27, -0.12))
        g.mesh_obj('pack_flap', g.bm_box(0.26, 0.02, 0.12, bevel=0.01), M('pack_d', ctx.col('bag', 0.8), 0.7),
                   rig.j['chest'], loc=(0, 0.35, -0.04))
        g.mesh_obj('pack_pocket', g.bm_box(0.18, 0.05, 0.10, bevel=0.02), M('pack_d', ctx.col('bag', 0.8), 0.7),
                   rig.j['chest'], loc=(0, 0.355, -0.19))
    with put('straps'):
        st = M('strap', ctx.col('bag', 0.75), 0.7)
        for s in (-1, 1):
            g.mesh_obj('pack_strap', g.bm_tube_path([(s * 0.10, 0.14, 0.07), (s * 0.11, -0.05, 0.10),
                                                     (s * 0.12, -0.17, 0.02), (s * 0.12, -0.17, -0.12)], 0.016,
                                                    segr=6, side_ref=(1, 0, 0), flat=1.8), st, rig.j['chest'])


@part('acc_mailbag', 'bag', 'body', {'main': sub('bag', Z['bag_front']), 'mail': sub(None, Z['bag_front'] + 0.5)},
      tags=['job'], ages=['adult', 'elder'], label={'ko': '우편 가방', 'en': 'mail bag'})
def b_acc_mailbag(rig, ctx, put):
    with put('main'):
        bag = M('mailbag', ctx.col('bag'), 0.6)
        g.mesh_obj('strap', g.bm_ring(0.224, 0.016, seg=64, segr=8, sy=0.86, rz=1.6), bag, rig.j['spine'],
                   loc=(0, 0, 0.19), rot=(0, -40, 0))
        g.mesh_obj('satchel', g.bm_box(0.09, 0.22, 0.18, bevel=0.03), bag, rig.j['spine'], loc=(0.265, -0.02, -0.02),
                   rot=(0, -8, 0))
        g.mesh_obj('flap', g.bm_box(0.096, 0.226, 0.07, bevel=0.018), M('mailbag_d', ctx.col('bag', 0.8), 0.6),
                   rig.j['spine'], loc=(0.272, -0.02, 0.055), rot=(0, -8, 0))
    with put('mail'):
        env = M('envelope', '#FBF8F0', 0.6, emission='#FFFFFF', emission_strength=0.06)
        for k, (dy, tl) in enumerate(((-0.06, -8), (0.04, 10))):
            g.mesh_obj('envelope', g.bm_box(0.012, 0.11, 0.075, bevel=0.003), env, rig.j['spine'],
                       loc=(0.262, -0.02 + dy, 0.11 + 0.01 * k), rot=(tl, -8, 0))
        g.mesh_obj('clasp', g.bm_box(0.012, 0.04, 0.03, bevel=0.005), M('brass', '#E8B33A', 0.3, metal=0.7),
                   rig.j['spine'], loc=(0.322, -0.02, 0.04), rot=(0, -8, 0))


DET = sub(None, Z['job_detail'])


@part('det_police', 'job', 'body', {'main': DET}, tags=['job'], ages=['adult', 'elder'],
      label={'ko': '경찰 배지·벨트', 'en': 'police badge & belt'})
def b_det_police(rig, ctx, put):
    with put('main'):
        gold = M('badge', '#E8C04A', 0.3, metal=0.7)
        pts = []
        for k in range(12):
            a = PI / 2 + k * TAU12
            r = 0.040 if k % 2 == 0 else 0.026
            pts.append((r * math.cos(a), r * math.sin(a)))
        st = g.bm_slab(pts, 0.012, bevel=0.003)
        g.bm_transform(st, Matrix.Rotation(PI / 2, 4, 'Z'))
        g.mesh_obj('badge', st, gold, rig.j['spine'], loc=(-0.10, -0.205, 0.22), rot=(-6, 0, 0))
        blk = M('duty_belt', '#24262E', 0.5)
        g.mesh_obj('duty_belt', g.bm_ring(0.244, 0.032, seg=56, segr=10, sy=0.86, rz=0.9), blk, rig.j['spine'],
                   loc=(0, 0, -0.03))
        for x in (-0.17, 0.17):
            g.mesh_obj('pouch', g.bm_box(0.06, 0.05, 0.07, bevel=0.012), blk, rig.j['spine'], loc=(x, -0.17, -0.05),
                       rot=(0, 0, 30 if x > 0 else -30))
        g.mesh_obj('buckle', g.bm_box(0.05, 0.016, 0.04, bevel=0.006), M('silver', '#C9CED6', 0.3, metal=0.7),
                   rig.j['spine'], loc=(0, -0.222, -0.03))


TAU12 = math.tau / 12


@part('det_station', 'job', 'body', {'armband': {'tint': 'top2', 'z': Z['arm'] + 0.5, 'follow': 'arm_L'},
                                     'whistle': DET}, tags=['job'], ages=['adult', 'elder'],
      label={'ko': '역무원 완장·호루라기', 'en': 'armband & whistle'})
def b_det_station(rig, ctx, put):
    with put('armband'):
        g.mesh_obj('armband', g.bm_ring(0.078, 0.026, seg=28, segr=8, rz=1.6), M('armband', ctx.col('top2'), 0.7),
                   rig.j['sh_L'], loc=(0, 0, -0.07))
    with put('whistle'):
        cord = M('cord', '#E8B33A', 0.5)
        g.mesh_obj('cord', g.bm_tube_path([(0.06, -0.15, 0.30), (0.09, -0.20, 0.20), (0.11, -0.205, 0.12)], 0.006,
                                          segr=6), cord, rig.j['spine'])
        g.mesh_obj('whistle', g.bm_capsule(0.016, 0.04, seg=12, rings=4), M('silver', '#D7DFE8', 0.2, metal=0.8),
                   rig.j['spine'], loc=(0.11, -0.215, 0.12), rot=(0, 70, 0))


@part('det_stethoscope', 'job', 'body', {'main': DET}, tags=['job'], ages=['adult', 'elder'],
      label={'ko': '청진기', 'en': 'stethoscope'})
def b_det_stethoscope(rig, ctx, put):
    with put('main'):
        st = M('stetho', '#5A6070', 0.4)
        ring = [(math.sin(a) * 0.150, 0.015 - math.cos(a) * 0.140 * 0.92, 0.190 + 0.02 * math.cos(a))
                for a in [PI * 0.30 + (math.tau - PI * 0.6) * k / 24 for k in range(25)]]
        g.mesh_obj('stetho_ring', g.bm_tube_path(ring, 0.011, segr=8), st, rig.j['chest'])
        for s in (-1, 1):
            a = PI * 0.30 if s > 0 else -PI * 0.30
            p0 = (math.sin(a) * 0.150, 0.015 - math.cos(a) * 0.140 * 0.92, 0.190 + 0.02 * math.cos(a))
            end = (s * 0.05, -0.205, -0.04) if s > 0 else (s * 0.095, -0.195, 0.03)
            g.mesh_obj('stetho_tube', g.bm_tube_path(vd.catmull3([p0, (p0[0] * 0.8, -0.18, 0.07), end], 10), 0.010,
                                                     segr=8), st, rig.j['chest'])
        g.mesh_obj('stetho_bell', g.bm_cyl(0.030, 0.030, 0.016, seg=16, centered=True),
                   M('stetho_metal', '#D7DFE8', 0.2, metal=0.8), rig.j['chest'], loc=(0.05, -0.212, -0.06),
                   rot=(80, 0, 0))


@part('det_tie', 'job', 'body', {'main': sub('top2', Z['job_detail'])}, tags=['job', 'school'],
      label={'ko': '넥타이', 'en': 'necktie'})
def b_det_tie(rig, ctx, put):
    with put('main'):
        m = M('tie', ctx.col('top2'), 0.6)
        g.mesh_obj('tie_knot', g.bm_ellipsoid(0.022, 0.014, 0.020, 10, 6), m, rig.j['spine'], loc=(0, -0.168, 0.375))
        g.mesh_obj('tie', g.bm_slab([(-0.0, 0.0), (0.03, -0.02), (0.035, -0.20), (0.0, -0.235), (-0.035, -0.20),
                                     (-0.03, -0.02)], 0.012, bevel=0.004), m, rig.j['spine'], loc=(0, -0.205, 0.37),
                   rot=(-8, 0, 90))


@part('det_bow', 'job', 'body', {'main': sub('top2', Z['job_detail'])}, tags=['job', 'school'],
      label={'ko': '교복 리본', 'en': 'uniform bow'})
def b_det_bow(rig, ctx, put):
    with put('main'):
        m = M('bow', ctx.col('top2'), 0.5)
        for s in (-1, 1):
            g.mesh_obj('bow_w', g.bm_ellipsoid(0.048, 0.016, 0.030, 12, 8), m, rig.j['chest'],
                       loc=(s * 0.042, -0.150, 0.040), rot=(0, s * -10, 0))
            g.mesh_obj('bow_t', g.bm_box(0.026, 0.010, 0.07, bevel=0.005), m, rig.j['chest'],
                       loc=(s * 0.02, -0.160, -0.005), rot=(-6, s * 14, 0))
        g.mesh_obj('bow_k', g.bm_ellipsoid(0.018, 0.016, 0.020, 10, 6), m, rig.j['chest'], loc=(0, -0.158, 0.04))


@part('det_lanyard', 'job', 'body', {'main': sub(None, Z['job_detail'] + 1)}, tags=['job'], ages=['adult', 'elder'],
      label={'ko': '사원증', 'en': 'ID lanyard'})
def b_det_lanyard(rig, ctx, put):
    with put('main'):
        cord = M('lanyard', '#3D7CC9', 0.6)
        for s in (-1, 1):
            g.mesh_obj('lanyard', g.bm_tube_path([(s * 0.11, -0.05, 0.13), (s * 0.08, -0.16, 0.08),
                                                  (s * 0.02, -0.19, -0.02)], 0.007, segr=6), cord, rig.j['chest'])
        g.mesh_obj('card', g.bm_box(0.065, 0.010, 0.085, bevel=0.006), M('card', '#FBFAF6', 0.5), rig.j['chest'],
                   loc=(0, -0.205, -0.07), rot=(-8, 0, 0))
        g.mesh_obj('card_photo', g.bm_box(0.024, 0.006, 0.030, bevel=0.003), M('card_p', '#7AA6D8', 0.5),
                   rig.j['chest'], loc=(-0.014, -0.212, -0.06), rot=(-8, 0, 0))
        g.mesh_obj('card_line', g.bm_box(0.040, 0.006, 0.008, bevel=0.002), M('card_l', '#2B2F3A', 0.5),
                   rig.j['chest'], loc=(0.0, -0.212, -0.095), rot=(-8, 0, 0))


def _apron(rig, ctx, slot, keep=56, hem=-0.20, bib=True):
    am = M('apron', ctx.col(slot), 0.85)
    g.mesh_obj('apron', vd.sector_lathe([(0.288, hem), (0.262, -0.05), (0.236, 0.06), (0.226, 0.14)], keep_deg=keep,
                                        sy=0.88), am, rig.j['spine'])
    if bib:
        g.mesh_obj('apron_bib', vd.sector_lathe([(0.220, 0.12), (0.216, 0.22), (0.205, 0.31)], keep_deg=34, sy=0.88),
                   am, rig.j['spine'])
        for s in (-1, 1):
            g.mesh_obj('apron_strap', g.bm_tube_path([(s * 0.07, -0.183, 0.30), (s * 0.09, -0.12, 0.40),
                                                      (s * 0.10, 0.0, 0.43)], 0.012, segr=6), am, rig.j['spine'])
    g.mesh_obj('apron_tie', g.bm_ring(0.222, 0.012, seg=56, segr=6, sy=0.88, rz=1.6), am, rig.j['spine'],
               loc=(0, 0, 0.13))
    g.mesh_obj('apron_pocket', vd.sector_lathe([(0.262, -0.06), (0.250, 0.02)], keep_deg=26, sy=0.88),
               M('apron_d', ctx.col(slot, 0.85), 0.85), rig.j['spine'])


@part('det_apron', 'job', 'body', {'main': sub('acc', Z['apron'])}, tags=['job'], ages=['adult', 'elder'],
      label={'ko': '앞치마', 'en': 'apron'})
def b_det_apron(rig, ctx, put):
    with put('main'):
        _apron(rig, ctx, 'acc')


@part('det_apron_salon', 'job', 'body', {'main': sub('acc', Z['apron']), 'tools': sub(None, Z['apron'] + 0.5)},
      tags=['job'], ages=['adult', 'elder'], label={'ko': '미용 앞치마', 'en': 'salon apron'})
def b_det_apron_salon(rig, ctx, put):
    with put('main'):
        _apron(rig, ctx, 'acc', keep=60, hem=-0.12, bib=False)
    with put('tools'):
        steel = M('steel', '#D7DFE8', 0.2, metal=0.85)
        for s in (-1, 1):
            g.mesh_obj('scissor_blade', g.bm_box(0.010, 0.008, 0.07, bevel=0.003), steel, rig.j['spine'],
                       loc=(0.07 + s * 0.008, -0.248, 0.04), rot=(-8, 0, s * 10))
            g.mesh_obj('scissor_ring', g.bm_ring(0.014, 0.0045, seg=16, segr=6), M('handle', '#E04848', 0.4),
                       rig.j['spine'], loc=(0.07 + s * 0.016, -0.250, -0.005), rot=(90, 0, 0))
        g.mesh_obj('comb', g.bm_box(0.012, 0.008, 0.08, bevel=0.003), M('comb', '#2B2F3A', 0.4), rig.j['spine'],
                   loc=(0.03, -0.247, 0.035), rot=(-8, 0, -6))


@part('det_hivis', 'job', 'body', {'main': sub('acc', Z['vest']), 'strips': sub(None, Z['vest'] + 0.5)},
      tags=['job'], ages=['adult', 'elder'], label={'ko': '형광 조끼', 'en': 'hi-vis vest'})
def b_det_hivis(rig, ctx, put):
    prof = [(0.262, -0.08), (0.256, 0.0), (0.232, 0.12), (0.224, 0.24), (0.209, 0.31), (0.168, 0.38)]
    with put('main'):
        g.mesh_obj('hivis', cb.vest_lathe(prof, gap_deg=14, seg=48, sy=0.88), M('hivis', ctx.col('acc'), 0.6),
                   rig.j['spine'])
    with put('strips'):
        sil = M('reflect', '#E6EAF0', 0.25, metal=0.4, emission='#FFFFFF', emission_strength=0.1)
        for z in (0.02, 0.10):
            bm = vd.sector_lathe([(0.262, z - 0.014), (0.262, z + 0.014)], keep_deg=170, sy=0.885)
            kill = [f for f in bm.faces if abs(math.degrees(math.atan2(f.calc_center_median().x,
                                                                       -f.calc_center_median().y))) < 14]
            bmesh.ops.delete(bm, geom=kill, context='FACES')
            g.mesh_obj('strip', bm, sil, rig.j['spine'])


# wardrobe by age (fewer layers to render for bases that would never wear them)
for _pn in ('top_hoodie', 'top_bomber', 'bot_pleated', 'top_blazer', 'det_bow', 'acc_backpack'):
    PARTS[_pn].ages = ['child', 'adult']

# job outfits that only working-age adults wear (keeps the atlases small)
for _pn in ('top_uniform', 'top_tunic', 'det_hivis', 'det_police', 'det_station', 'det_apron_salon', 'acc_mailbag'):
    PARTS[_pn].ages = ['adult']
