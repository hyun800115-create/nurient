"""
gbf_parts.py - geumbangfolk parts (CONTRACT_GEUMBANG AP): the 금방 uniform and the crew's held items.

Imports tf_parts + tf2_parts (never edited) and registers the new parts into the same tf_parts.PARTS registry (in this
process only) with the same @part(...) decorator and conventions.

  part             family  space  ages   subs (tint)                                  what
  top_gb_jacket    top     body   adult  main (top), trim / cuff_R / cuff_L (fixed)   gold quilted puffer, cream stand
                                                                                      collar + chest band + cuffs, the
                                                                                      mark centred on the band (front)
                                                                                      and big on the back (on 'trim')
  det_gb_vest      job     body   adult  main (fixed)                                 gold work vest, 2 cream stripes,
                                                                                      the mark big on the back
  hat_gb_cap       hat     head   -      main (fixed)                                 charcoal cap, navy ear flaps, gold band
                                                                                      + brim + button, the mark centred
                                                                                      on the crown front (cls 'full'):
                                                                                      ONE fixed-colour layer
  held_parcel_gb   held    body   (anim) main (carry_parcel, ring_doorbell), small    kraft 금방 parcel: gold tape cross,
                                         (sort_parcel)                                the mark sticker on the front and
                                                                                      both sides
  held_scanner     held    body   (anim) main                                         handheld scanner (charcoal grip,
                                                                                      cream head, glowing window)
  held_tapegun     held    body   (anim) main                                         tape gun with a gold tape roll

Brand (CONTRACT_GEUMBANG): gold #F2B33D, goldDark #D9962A, cream #F4EDE0, charcoal #3B3F52, navy #2B4F7E.  The cream
trims, the marks, the vest, the cap and the items are FIXED colours (tint None: a cream tint cannot be lighter than the
#E6E6E6 render reference; one layer instead of three saves texture memory on the resident road page); only the jacket
body is tinted (gold, goldDark for the night crew).
The mark 금방이 is a texture decal (tools/blender/gbf_mark.py, symmetric -> mirror-safe) conformed onto the garment
surface by ray casting, so it follows the quilting; no letters anywhere.
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import tf_parts as tp                     # noqa: E402
import tf2_parts as tp2                   # noqa: E402,F401  (v5 parts registered)
import gbf_anim as ga                     # noqa: E402

PARTS = tp.PARTS
Z = dict(tp.Z)
part, sub = tp.part, tp.sub
PI = math.pi

GOLD = '#F2B33D'
GOLD_D = '#D9962A'
CREAM = '#F4EDE0'
CHARCOAL = '#3B3F52'
NAVY = '#2B4F7E'
KRAFT = '#C99A62'          # = lgx_lib.KRAFT (the logistics / gb_parcel cardboard)
KRAFT_D = '#A98250'
MARK_PNG = os.environ.get('GBF_MARK', '/tmp/fv_cache/geumbangfolk/mark/gb_mark_512.png')

# z keys of the new subs (manifest 'z' as gbf_<key>)
Z5 = {'item': 45.0, 'parcel': {'S': 45.5, 'SE': 45.5, 'E': 45.5, 'NE': 2.5, 'N': 2.5},
      'small': {'S': 45.2, 'SE': 45.2, 'E': 45.2, 'NE': 2.6, 'N': 2.6},
      'jacket_trim': Z['top_detail'] + 0.4}

NEW_WEAR5 = ['top_gb_jacket', 'det_gb_vest']
NEW_HEAD5 = ['hat_gb_cap']
ANIM_ITEM_PARTS5 = ['held_parcel_gb', 'held_scanner', 'held_tapegun']
ALL_NEW5 = NEW_WEAR5 + NEW_HEAD5 + ANIM_ITEM_PARTS5
ONLY_ANIMS5 = {it: [a for a in ga.ORDER5 if it in ga.ANIM_ITEMS.get(a, [])] for it in ANIM_ITEM_PARTS5}


def _lazy():
    tp._lazy()
    global bpy, bmesh, Vector, Matrix, Quaternion, BVHTree, bc, g, cb, vd, tb
    import bpy                                  # noqa: F401
    import bmesh                                # noqa: F401
    from mathutils import Vector, Matrix, Quaternion       # noqa: F401
    from mathutils.bvhtree import BVHTree       # noqa: F401
    import bl_common as bc                      # noqa: F401
    import char_geo as g                        # noqa: F401
    import char_build as cb                     # noqa: F401
    import vil_dress as vd                      # noqa: F401
    import tf_body as tb                        # noqa: F401


def M(name, color, rough=0.8, **kw):
    return tp.M(name, color, rough, **kw)


def joint(rig, name):
    if name not in rig.j:
        rig.add(name, 'root', (0, 0, 0))
    return rig.j[name]


def held(z=None, hand=None, **kw):
    d = {'tint': None, 'z': Z5['item'] if z is None else z}
    if hand:
        d['zfrontFollow'] = hand
    d.update(kw)
    return d


# --------------------------------------------------------------------------- the mark decal

_TEX = {}


def mark_material():
    """Principled material with the 금방이 texture (sRGB, cubic), fully opaque inside the disc."""
    if 'm' in _TEX and _TEX['m'].name in bpy.data.materials:
        return _TEX['m']
    if not os.path.exists(MARK_PNG):
        import gbf_mark
        os.makedirs(os.path.dirname(MARK_PNG), exist_ok=True)
        gbf_mark.mark_texture(512)[0].save(MARK_PNG)
    m = bpy.data.materials.new('gb_mark')
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(MARK_PNG, check_existing=True)
    tex.image.colorspace_settings.name = 'sRGB'
    tex.interpolation = 'Cubic'
    tex.extension = 'EXTEND'
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.55
    _TEX['m'] = m
    return m


def conform_decal(targets, center, normal, up, diameter, seg=48, rings=7, lift=0.0045):
    """A round decal mesh lying on the target surfaces (bmeshes in the decal's own local frame): every vertex of a
    polar disc grid (centre `center`, facing `normal`, texture up `up`) is ray-cast onto the outermost target surface
    and lifted along the normal.  UVs map the disc onto the mark texture (seen from outside, not mirrored)."""
    _lazy()
    import bmesh as _bm
    merged = _bm.new()
    for t in targets:
        tmp = t.copy()
        me = bpy.data.meshes.new('_tmp_decal')
        tmp.to_mesh(me)
        tmp.free()
        merged.from_mesh(me)
        bpy.data.meshes.remove(me)
    tree = BVHTree.FromBMesh(merged)
    n = Vector(normal).normalized()
    upv = Vector(up)
    upv = (upv - n * upv.dot(n)).normalized()
    right = (-n).cross(upv).normalized()
    c = Vector(center)
    R = diameter / 2.0
    bm = _bm.new()
    uv_of = {}

    def place(x, y):
        p = c + right * x + upv * y
        hit, hn, _, _ = tree.ray_cast(p + n * 0.35, -n, 0.8)
        q = (hit + n * lift) if hit is not None else p
        v = bm.verts.new(q)
        uv_of[v] = (0.5 + x / (2 * R), 0.5 + y / (2 * R))
        return v
    centre = place(0.0, 0.0)
    ring_v = []
    for r_i in range(1, rings + 1):
        rr = R * r_i / rings
        ring_v.append([place(rr * math.cos(2 * PI * k / seg), rr * math.sin(2 * PI * k / seg)) for k in range(seg)])
    for k in range(seg):
        bm.faces.new((centre, ring_v[0][k], ring_v[0][(k + 1) % seg]))
    for r_i in range(rings - 1):
        a, b = ring_v[r_i], ring_v[r_i + 1]
        for k in range(seg):
            bm.faces.new((a[k], b[k], b[(k + 1) % seg], a[(k + 1) % seg]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # make the faces point outward (toward +n)
    if sum(f.normal.dot(n) for f in bm.faces) < 0:
        for f in bm.faces:
            f.normal_flip()
    uvl = bm.loops.layers.uv.new('UVMap')
    for f in bm.faces:
        for lp in f.loops:
            lp[uvl].uv = uv_of[lp.vert]
    merged.free()
    return bm


def lathe_r(prof, z):
    """radius of a (r, z) profile at height z (linear)"""
    for (r0, z0), (r1, z1) in zip(prof, prof[1:]):
        if z0 <= z <= z1 and z1 > z0:
            t = (z - z0) / (z1 - z0)
            return r0 + (r1 - r0) * t
    return prof[0][0] if z < prof[0][1] else prof[-1][0]


# =========================================================================== wearables

def follow(tint, limb):
    return {'tint': tint, 'z': Z['arm'] + 0.5, 'follow': limb}


JACKET_PROF = None
BAND_Z = (0.232, 0.306)           # chest band (spine-local z)


@part('top_gb_jacket', 'top', 'body',
      {'main': sub('top', Z['top']), 'trim': sub(None, Z5['jacket_trim']),
       'cuff_R': follow(None, 'arm_R'), 'cuff_L': follow(None, 'arm_L')},
      tags=['job', 'geumbang', 'warm'], ages=['adult'], label={'ko': '금방 패딩 점퍼', 'en': 'Geumbang puffer jacket'})
def b_top_gb_jacket(rig, ctx, put):
    """Gold quilted puffer (tint top), cream stand collar + chest band + cuffs (fixed cream), a centre zip, the mark
    centred on the chest band and big on the back (fixed)."""
    _lazy()
    coat = M('gbj_puffer', ctx.col('top'), 0.72)
    cream = M('gbj_cream', CREAM, 0.8)
    prof = vd.quilted_profile(vd.std_profile(0.262, -0.10), step=0.072, amp=0.062)
    torso_bm = g.bm_lathe(prof, seg=48, sy=0.84, smooth_n=0, cap_top=False)
    keep_torso = torso_bm.copy()
    rb = max(r for r, z in prof if BAND_Z[0] - 0.015 <= z <= BAND_Z[1] + 0.015) + 0.004
    zb = (BAND_Z[0] + BAND_Z[1]) / 2
    band_prof = [(rb - 0.004, BAND_Z[0]), (rb + 0.004, BAND_Z[0] + 0.012), (rb + 0.006, zb),
                 (rb + 0.004, BAND_Z[1] - 0.012), (rb - 0.004, BAND_Z[1])]
    with put('main'):
        g.mesh_obj('torso', torso_bm, coat, rig.j['spine'])
        zm = M('gbj_zip', ctx.col('top', 0.66), 0.5)
        zr = lathe_r(prof, 0.12) * 0.84
        g.mesh_obj('zip', g.bm_box(0.014, 0.012, 0.40, bevel=0.004), zm, rig.j['spine'], loc=(0, -zr - 0.004, 0.13))
        g.mesh_obj('zip_pull', g.bm_box(0.024, 0.012, 0.036, bevel=0.005), zm, rig.j['spine'],
                   loc=(0, -zr - 0.010, 0.31))
    with put('trim'):
        g.mesh_obj('collar', g.bm_ring(0.140, 0.048, seg=48, segr=12, sy=0.92, rz=1.45), cream, rig.j['chest'],
                   loc=(0, 0.01, 0.105))
        band_bm = g.bm_lathe(band_prof, seg=56, sy=0.84, smooth_n=0, cap_top=False, cap_bottom=False)
        keep_band = band_bm.copy()
        g.mesh_obj('band', band_bm, cream, rig.j['spine'])
        # (texture memory) the marks live on the trim layer: one untinted layer for collar + band + marks
        mm = mark_material()
        front = conform_decal([keep_torso, keep_band], (0, -rb * 0.84, zb), (0, -1, 0), (0, 0, 1), 0.122)
        g.mesh_obj('mark_front', front, mm, rig.j['spine'], smooth=True)
        back = conform_decal([keep_torso, keep_band], (0, rb * 0.84, zb - 0.006), (0, 1, 0), (0, 0, 1), 0.250)
        g.mesh_obj('mark_back', back, mm, rig.j['spine'], smooth=True)
    keep_torso.free()
    keep_band.free()
    for n in ('R', 'L'):
        with put('cuff_' + n):
            g.mesh_obj('cuff_' + n, g.bm_ring(0.060, 0.026, seg=32, segr=10, rz=1.3), cream, rig.j['el_' + n],
                       loc=(0, 0, -cb.FOREARM + 0.014))


VEST_PROF = [(0.268, -0.08), (0.262, 0.0), (0.238, 0.12), (0.230, 0.24), (0.214, 0.31), (0.172, 0.38)]
VEST_GAP = 15.0
VEST_STRIPES = (0.030, 0.112)


@part('det_gb_vest', 'job', 'body', {'main': sub(None, Z['vest'])},
      tags=['job', 'geumbang'], ages=['adult'], label={'ko': '금방 조끼', 'en': 'Geumbang work vest'})
def b_det_gb_vest(rig, ctx, put):
    """Gold work vest open at the front, two cream stripes around, the mark big on the back: ONE fixed-colour layer
    (every preset wears the brand gold; texture memory: one layer instead of three)."""
    _lazy()
    vest_bm = cb.vest_lathe(VEST_PROF, gap_deg=VEST_GAP, seg=56, sy=0.88)
    keep = vest_bm.copy()
    with put('main'):
        g.mesh_obj('gbvest', vest_bm, M('gbvest', GOLD, 0.62), rig.j['spine'])
        edge = M('gbvest_edge', GOLD_D, 0.62)
        g.mesh_obj('gbvest_hem', vd.sector_lathe([(0.272, -0.082), (0.274, -0.070), (0.272, -0.058)],
                                                 keep_deg=180 - VEST_GAP, sy=0.885, seg=56, center_deg=180),
                   edge, rig.j['spine'])
        cream = M('gbvest_cream', CREAM, 0.7)
        for z in VEST_STRIPES:
            r = lathe_r(VEST_PROF, z) + 0.005
            bm = vd.sector_lathe([(r, z - 0.017), (r + 0.002, z), (r, z + 0.017)], keep_deg=180, sy=0.885, seg=56)
            kill = [f for f in bm.faces if abs(math.degrees(math.atan2(f.calc_center_median().x,
                                                                       -f.calc_center_median().y))) < VEST_GAP]
            bmesh.ops.delete(bm, geom=kill, context='FACES')
            g.mesh_obj('gbvest_stripe', bm, cream, rig.j['spine'])
        zc = 0.262
        back = conform_decal([keep], (0, lathe_r(VEST_PROF, zc) * 0.88, zc), (0, 1, 0), (0, 0, 1), 0.180)
        g.mesh_obj('gbvest_mark', back, mark_material(), rig.j['spine'])
    keep.free()


@part('hat_gb_cap', 'hat', 'head', {'main': sub(None, Z['hat'])}, cls='full',
      tags=['job', 'geumbang'], label={'ko': '금방 귀달이 모자', 'en': 'Geumbang ear-flap cap'})
def b_hat_gb_cap(rig, ctx, put):
    """Charcoal cap with small NAVY ear flaps tucked under a gold band, a gold brim + crown button, the mark on the
    crown front above the band: ONE fixed-colour layer (every cap wearer - driver, dockhand, night driver - wears the
    same brand cap; texture memory: one head layer instead of three).  Brand: navy is an accent <= 15 % of a sprite -
    a navy dome on the big chibi head is 30-40 % of the sprite (measured), so the crown is the brand charcoal and the
    navy stays on the flaps.  The crown sits on the beanie line (front 0.44, back 0.0) so the band fits like the
    beanie cuff."""
    _lazy()
    with put('main'):
        cap = M('gbcap', CHARCOAL, 0.82)
        flap = M('gbcap_flap', NAVY, 0.85)
        shell_obj = cb.cap_shell(rig, cap, lambda x, y: 0.22 - 0.22 * y, base=1.10, puff=0.05, name='gbcap',
                                 soft=0.03)
        for s_ in (-1, 1):
            vd.ho(rig, 'gbcap_flap', vd.fuzz(g.bm_ellipsoid(0.042, 0.080, 0.098, 18, 10), 0.002, 30.0), flap,
                  loc=(s_ * 0.312, 0.045, -0.035), rot=(6, s_ * 12, 0))
        brim_m = M('gbcap_brim', GOLD, 0.55)
        cb.tilted_ring(rig, 'gbcap_band', brim_m, tb.HEAD_R[0] * 1.045, 0.030, 0.44, 0.0, sy=0.97, rz=1.15)
        visor = g.bm_lathe([(0.0, 0.0), (0.17, 0.0), (0.18, -0.010), (0.0, -0.014)], seg=32, sy=0.70)
        vd.ho(rig, 'gbcap_visor', visor, brim_m, loc=(0, -0.265, 0.112), rot=(-12, 0, 0))
        vd.ho(rig, 'gbcap_btn', g.bm_ellipsoid(0.036, 0.036, 0.024, 12, 6), brim_m, loc=(0, 0.0, 0.322))
        me = shell_obj.data
        sbm = bmesh.new()
        sbm.from_mesh(me)
        nrm = Vector((0, -1.0, 0.55)).normalized()
        dec = conform_decal([sbm], (0, -0.27, 0.215), nrm, (0, 0.55, 1.0), 0.120, lift=0.004)
        sbm.free()
        g.mesh_obj('gbcap_mark', dec, mark_material(), shell_obj)


# =========================================================================== held items (anim items)

def _parcel(j, size, prefix):
    """A kraft 금방 parcel centred on joint j: gold tape cross over the top and down every face, the mark sticker on
    the front (-Y) and on both sides (+-X) - every face the camera can see while it is carried."""
    w, d, h = size
    kraft = M('gbp_kraft', KRAFT, 0.85)
    tape = M('gbp_tape', GOLD, 0.45)
    edge = M('gbp_edge', KRAFT_D, 0.85)
    g.mesh_obj(prefix + 'box', g.bm_box(w, d, h, bevel=0.012), kraft, j)
    tw = 0.050 * min(1.0, w / 0.26)
    t = 0.004
    # tape cross: one strip along X over the top and down both side faces, one along Y over the top, front and back
    g.mesh_obj(prefix + 'tape_x', g.bm_box(w + 2 * t, tw, t, bevel=0.0015), tape, j, loc=(0, 0, h / 2 + t / 2))
    g.mesh_obj(prefix + 'tape_y', g.bm_box(tw, d + 2 * t, t, bevel=0.0015), tape, j, loc=(0, 0, h / 2 + t / 2 + 0.0005))
    for s in (-1, 1):
        g.mesh_obj(prefix + 'tape_sx', g.bm_box(t, tw, h * 0.62, bevel=0.0015), tape, j,
                   loc=(s * (w / 2 + t / 2), 0, h / 2 - h * 0.31))
        g.mesh_obj(prefix + 'tape_sy', g.bm_box(tw, t, h * 0.62, bevel=0.0015), tape, j,
                   loc=(0, s * (d / 2 + t / 2), h / 2 - h * 0.31))
    # flap seam on the top
    g.mesh_obj(prefix + 'seam', g.bm_box(0.004, d * 0.98, 0.003, bevel=0.0), edge, j, loc=(w * 0.26, 0, h / 2 + 0.002))
    g.mesh_obj(prefix + 'seam2', g.bm_box(0.004, d * 0.98, 0.003, bevel=0.0), edge, j,
               loc=(-w * 0.26, 0, h / 2 + 0.002))
    # mark stickers (a flat textured disc a hair above each face, over the tape)
    mm = mark_material()
    dia = min(w, h) * 0.56
    for name, cen, nrm, up in ((prefix + 'stk_f', (0, -d / 2 - t - 0.002, -h * 0.05), (0, -1, 0), (0, 0, 1)),
                               (prefix + 'stk_r', (-w / 2 - t - 0.002, 0, -h * 0.05), (-1, 0, 0), (0, 0, 1)),
                               (prefix + 'stk_l', (w / 2 + t + 0.002, 0, -h * 0.05), (1, 0, 0), (0, 0, 1))):
        disc = conform_decal([g.bm_box(w + 2 * t, d + 2 * t, h, bevel=0.0)], cen, nrm, up, dia, seg=32, rings=3,
                             lift=0.0025)
        g.mesh_obj(name, disc, mm, j)


@part('held_parcel_gb', 'held', 'body',
      {'main': held(z=Z5['parcel'], hand='hand_L', onlyAnims=['carry_parcel', 'ring_doorbell']),
       'small': held(z=Z5['small'], hand='hand_R', onlyAnims=['sort_parcel'])},
      tags=['anim_item', 'geumbang'], label={'ko': '금방 택배 상자', 'en': 'Geumbang parcel'})
def b_held_parcel_gb(rig, ctx, put):
    """'main': the medium 금방 parcel (joint pclm_J at its centre, local axes = the chest's); 'small': a small one
    between the picker's mittens (joint pcls_J)."""
    _lazy()
    jm = joint(rig, 'pclm_J')
    js = joint(rig, 'pcls_J')
    with put('main'):
        _parcel(jm, ga.PARCEL_M, 'm_')
    with put('small'):
        _parcel(js, ga.PARCEL_S, 's_')


@part('held_scanner', 'held', 'body', {'main': held(hand='hand_R')}, tags=['anim_item', 'geumbang'],
      label={'ko': '바코드 스캐너', 'en': 'handheld scanner'})
def b_held_scanner(rig, ctx, put):
    """Pistol-grip scanner on joint scan_J: origin = in the fist, local +Z = where it points (the window at the tip),
    local -Y = up (the screen faces the user, +Y)."""
    _lazy()
    j = joint(rig, 'scan_J')
    body = M('scan_body', CHARCOAL, 0.45)
    head = M('scan_head', CHARCOAL, 0.42)
    gold = M('scan_gold', GOLD, 0.4)
    win = M('scan_win', '#9FE0FF', 0.3, emission='#C8F4FF', emission_strength=2.2)
    scr = M('scan_screen', '#7FB8E8', 0.3, emission='#7FB8E8', emission_strength=0.9)
    with put('main'):
        g.mesh_obj('scan_grip', g.bm_box(0.034, 0.040, 0.100, bevel=0.012), body, j, loc=(0, 0.035, -0.010),
                   rot=(-62, 0, 0))
        g.mesh_obj('scan_head', g.bm_box(0.060, 0.066, 0.130, bevel=0.018), head, j, loc=(0, -0.040, 0.050))
        g.mesh_obj('scan_nose', g.bm_box(0.066, 0.074, 0.030, bevel=0.010), gold, j, loc=(0, -0.040, 0.118))
        g.mesh_obj('scan_win', g.bm_box(0.048, 0.050, 0.008, bevel=0.003), win, j, loc=(0, -0.040, 0.134))
        g.mesh_obj('scan_screen', g.bm_box(0.042, 0.006, 0.054, bevel=0.003), scr, j, loc=(0, -0.076, 0.040))
        g.mesh_obj('scan_trig', g.bm_box(0.018, 0.020, 0.030, bevel=0.006), gold, j, loc=(0, 0.004, 0.030),
                   rot=(-30, 0, 0))


TAPE_ROLL_R = 0.066


@part('held_tapegun', 'held', 'body', {'main': held(hand='hand_R')}, tags=['anim_item', 'geumbang'],
      label={'ko': '테이프 커터', 'en': 'tape gun'})
def b_held_tapegun(rig, ctx, put):
    """Tape gun on joint tape_J: origin = the roller's contact with the box top, local +Z up to the grip (the fist
    at ga.TAPE_GRIP), local -X = the pulling direction (the cutter leads), the roll axle along local Y."""
    _lazy()
    j = joint(rig, 'tape_J')
    frame = M('tape_frame', CHARCOAL, 0.45)
    steel = M('tape_steel', '#C9D2DC', 0.25, metal=0.8)
    gold = M('tape_gold', GOLD, 0.4)
    goldd = M('tape_gold_d', GOLD_D, 0.5)
    G = ga.TAPE_GRIP
    cream = M('tape_core', CREAM, 0.6)
    with put('main'):
        # side plate on the BODY side (+Y), the handle loop up to the fist
        g.mesh_obj('tape_plate', g.bm_box(0.120, 0.010, 0.095, bevel=0.010), frame, j, loc=(0.010, 0.034, 0.060))
        g.mesh_obj('tape_handle', g.bm_box(0.032, 0.040, 0.080, bevel=0.013), frame, j, loc=(0.045, 0.0, G - 0.010),
                   rot=(0, -25, 0))
        g.mesh_obj('tape_neck', g.bm_box(0.022, 0.026, 0.060, bevel=0.008), frame, j, loc=(0.040, 0.0, 0.075))
        # the gold tape roll (axle along local Y): on its camera side (-Y) a cream core and a charcoal hub, held by a
        # charcoal front arm from the handle - so the roll reads on a gold vest too
        roll = g.bm_cyl(TAPE_ROLL_R, TAPE_ROLL_R, 0.050, seg=28, centered=True)
        g.mesh_obj('tape_roll', roll, gold, j, loc=(-0.010, 0.0, 0.072), rot=(90, 0, 0))
        g.mesh_obj('tape_rim', g.bm_ring(TAPE_ROLL_R - 0.004, 0.006, seg=28, segr=6), goldd, j,
                   loc=(-0.010, -0.026, 0.072), rot=(90, 0, 0))
        g.mesh_obj('tape_core', g.bm_cyl(0.036, 0.036, 0.054, seg=20, centered=True), cream, j,
                   loc=(-0.010, 0.0, 0.072), rot=(90, 0, 0))
        g.mesh_obj('tape_hub', g.bm_cyl(0.016, 0.016, 0.066, seg=12, centered=True), frame, j,
                   loc=(-0.010, 0.0, 0.072), rot=(90, 0, 0))
        g.mesh_obj('tape_arm', g.bm_tube_path([(0.045, -0.034, G - 0.040), (0.020, -0.036, 0.100),
                                               (-0.010, -0.036, 0.072), (-0.040, -0.034, 0.016)], 0.009, segr=8,
                                              side_ref=(0, 1, 0), flat=0.6), frame, j)
        # roller at the bottom front + the steel cutter leading the pull
        g.mesh_obj('tape_roller', g.bm_cyl(0.015, 0.015, 0.058, seg=12, centered=True), frame, j,
                   loc=(-0.040, 0.0, 0.015), rot=(90, 0, 0))
        g.mesh_obj('tape_cutter', g.bm_box(0.008, 0.060, 0.026, bevel=0.002), steel, j, loc=(-0.062, 0.0, 0.016))
        # the tape web from the roll to the roller
        g.mesh_obj('tape_web', g.bm_box(0.006, 0.048, 0.050, bevel=0.0), gold, j, loc=(-0.052, 0.0, 0.040),
                   rot=(0, -20, 0))


for _pn in ANIM_ITEM_PARTS5:
    PARTS[_pn].only_anims = list(ONLY_ANIMS5[_pn])


# --------------------------------------------------------------------------- per-frame item placement

def item_scale(age):
    return {'child': 0.85, 'elder': 0.95}.get(age, 1.0)


ITEM_K = {'scan_J': ga.ITEM_K['scan'], 'tape_J': ga.ITEM_K['tape']}    # props bigger than life (read on a phone)


def _set(rig, name, loc_world, quat_root=None, on=True, scale=1.0):
    """Joint `name` (a root child) at world position loc_world, rotation quat_root in the ROOT (facing) frame."""
    if name not in rig.j:
        return
    root = rig.j['root']
    jn = rig.j[name]
    jn.location = root.matrix_world.inverted() @ loc_world
    jn.rotation_mode = 'QUATERNION'
    jn.rotation_quaternion = quat_root if quat_root is not None else Quaternion()
    k = scale if on else 1e-4
    jn.scale = (k, k, k)


def _dir_quat(v, up_hint=(0, -1, 0)):
    """Quaternion turning local +Z onto vector v (root frame), local -Y kept near up_hint (Blender track quat)."""
    v = Vector(v).normalized()
    return v.to_track_quat('Z', 'Y')


def place_items5(rig, d, flags, anim=None):
    """Place every geumbangfolk item joint after Rig.apply + IK (world space; joints are root children).
    Hidden items are scaled to ~0 so their frames come out empty.  Returns item points (world):
      'box'    (centre, bottom) of the carried / tucked parcel (carry_parcel, ring_doorbell)
      'hand'   between the mittens (hand_parcel, sort_parcel)
      'bell'   the right mitten's fingertip (ring_doorbell)
      'beam'   (window, target) of the scanner (scan)
      'tape'   the tape gun roller on the box top (tape_box)"""
    _lazy()
    bpy.context.view_layer.update()
    root = rig.j['root']
    rq = root.matrix_world.to_quaternion()
    rqi = rq.inverted()
    rm = root.matrix_world
    age = rig.meta.get('ch', {}).get('age', 'adult')
    s = item_scale(age)
    out = {}
    hr = rig.world('hand_R')
    hl = rig.world('hand_L')
    up = rq @ Vector((0, 0, 1))
    fwd = rq @ Vector((0, -1, 0))
    tx, ty, tz = rig.meta.get('torso_scale', (1, 1, 1))
    chest = rig.j['chest'].matrix_world
    cq = chest.to_quaternion()
    # the medium parcel: hugged (carry) / tucked under the left arm (ring) - chest-local centre, turns with the chest
    if 'pclm_J' in rig.j:
        mode = flags.get('_parcel')
        if mode == 'carry':
            c = ga.CARRY_BOX
        elif mode == 'ring':
            c = ga.ring_box(d)
        else:
            c = (0, -0.25, -0.14)
        w = chest @ Vector((c[0] * tx, c[1] * ty, c[2] * tz))
        _set(rig, 'pclm_J', w, rqi @ cq, mode is not None, s)
        if mode is not None:
            h = ga.PARCEL_M[2] * s
            out['box'] = (w, w - (cq @ Vector((0, 0, 1))) * (h / 2))
    # the small parcel between the picker's mittens
    if 'pcls_J' in rig.j:
        on = bool(flags.get('_small'))
        mid = (hr + hl) * 0.5 + up * 0.012
        side = rqi @ (hl - hr)
        yaw = math.atan2(side.y, side.x)
        _set(rig, 'pcls_J', mid, Quaternion((0, 0, 1), yaw), on, s)
    if anim in ('sort_parcel', 'hand_parcel'):
        out['hand'] = (hr + hl) * 0.5 + up * 0.012
    # scanner: in the right fist, pointing at the parcel on the counter (key 3: tipped up toward the face)
    if 'scan_J' in rig.j:
        k = flags.get('_scanner')
        on = k is not None
        tgt = rm @ Vector(ga.SCAN_TARGET)
        v = rqi @ (tgt - hr)
        if k == 3:
            v = Vector((0.15, -0.35, 0.75))          # screen up toward the face, nose forward-up
        q = _dir_quat(v)
        # roll: keep the screen (local -Y side) facing up / back toward the user
        q = q @ Quaternion((0, 0, 1), math.radians(180.0))
        _set(rig, 'scan_J', hr + up * 0.005, q, on, s * ITEM_K['scan_J'])
        if on:
            bpy.context.view_layer.update()
            win = rig.j['scan_J'].matrix_world @ Vector((0, -0.040, 0.137))   # (joint scale applies)
            out['beam'] = (win, tgt)
    # tape gun: grip in the right fist, roller on the box top below it, tilted per key (the cutting flick)
    if 'tape_J' in rig.j:
        k = flags.get('_tape')
        on = k is not None
        tilt = math.radians(ga.TAPE_TILT.get(k or 0, 0.0))
        # local axes -> root: local X = root +X (the gun leads toward the character's right = root -X), local Y =
        # root -Y (axle along the forward axis), local Z = up; tilt about the axle
        q = Quaternion((0, 1, 0), tilt)
        kt = s * ITEM_K['tape_J']
        roller = hr - up * (ga.TAPE_GRIP * kt) + (rq @ Vector((0.02, -0.01, 0.0)))
        _set(rig, 'tape_J', roller, q, on, kt)
        if on:
            out['tape'] = roller
    # the doorbell finger: the front of the right mitten
    if anim == 'ring_doorbell':
        bpy.context.view_layer.update()
        out['bell'] = rig.world('hand_R') + fwd * 0.045 + up * 0.01
    bpy.context.view_layer.update()
    return out
