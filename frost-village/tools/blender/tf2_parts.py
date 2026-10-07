"""
tf2_parts.py - townfolk v5 parts (CONTRACT_V5 Q): wedding & farewell wardrobe.

Imports tf_parts (never edited) and registers the new parts into the same tf_parts.PARTS
registry (in this process only) with the same @part(...) decorator and conventions:

  wedding_dress  top (dress)    body  adult/elder   gown + puff cap sleeves + waist sash & back bow
                                                    (bare arms: sleeves -> 'skin'; tights underneath)
  veil           veil           head  all ages      sheer tulle from the crown down the back
  groom_suit     top            body  adult/elder   tailored jacket + white shirt + bow tie + boutonniere
  flower_crown   headacc        head  all ages      ring of flowers (2 tintable bloom colours + leaves)
  mourning_coat  top            body  all ages      long dark coat + small white flower pin
  black_hat      hat (full)     head  all ages      soft round felt hat with a ribbon band
  held_bouquet   hand item      body  all ages      bouquet in the right hand (2 bloom colours, leaves,
                                                    tinted paper wrap); kept upright every frame by
                                                    the renderer (item joint 'item_R', see place_items)

New tint slots (render refs below; the game tints like every other slot):
  gown (wedding dress), flower / flower2 (crown + bouquet blooms), wrap (bouquet paper).
Defaults when a person has no colour for them: untinted (= the near-white ref).
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import tf_parts as tp                     # noqa: E402
import tf_presets as tpr                  # noqa: E402

PARTS = tp.PARTS
Z = dict(tp.Z)
part, sub = tp.part, tp.sub
PI = math.pi
TAU = math.tau

# new tint slots (sRGB render albedo in layer mode); near-white so whites stay exact
TINT_REF2 = {'gown': '#FAF8F3', 'flower': '#FAF6F2', 'flower2': '#FAF6F2', 'wrap': '#F7F3EC'}
tpr.TINT_REF.update({k: v for k, v in TINT_REF2.items() if k not in tpr.TINT_REF})
TINT_MODEL_SLOTS2 = {'flower': [0, 0, 0], 'flower2': [0, 0, 0]}      # no cloth sky-sheen term on petals

# veil_top: under the hair (69.5) while the face looks at the camera - the cap sits on the back of the head, the
# hair in front must hide it (it only peeks out as a rim); over the hair from behind (NE / N)
Z2 = {'veil_back': {'S': 2.6, 'SE': 2.6, 'E': 2.6, 'NE': 73.0, 'N': 73.0},
      'veil_top': {'S': 69.5, 'SE': 69.5, 'E': 69.5, 'NE': 73.1, 'N': 73.1},
      'crown_leaves': 72.9, 'crown_flowers': 73.2, 'crown_flowers2': 73.3,
      'item': 45.0, 'item_front': 91.5, 'gown_puff': 31.5, 'gown_sash': 31.0}
NEW_PARTS = ['wedding_dress', 'veil', 'groom_suit', 'flower_crown', 'mourning_coat', 'black_hat', 'held_bouquet']
# anims a hand item has NO frames for (hands busy): the game hides the item / picks another anim
ITEM_NO_ANIMS = {'held_bouquet': ['carry_walk', 'clap', 'push']}

FLOWER_GREEN = '#4E9A52'
FLOWER_GREEN2 = '#6DB25A'
FLOWER_CENTRE = '#F2C14E'


def _lazy():
    tp._lazy()
    global bpy, bmesh, Vector, Matrix, Quaternion, bc, g, cb, vd, tb
    import bpy                                  # noqa: F401
    import bmesh                                # noqa: F401
    from mathutils import Vector, Matrix, Quaternion       # noqa: F401
    import bl_common as bc                      # noqa: F401
    import char_geo as g                        # noqa: F401
    import char_build as cb                     # noqa: F401
    import vil_dress as vd                      # noqa: F401
    import tf_body as tb                        # noqa: F401


def M(name, color, rough=0.8, **kw):
    return tp.M(name, color, rough, **kw)


# --------------------------------------------------------------------------- flower helpers

def flower_bm(r=0.035, petals=6, cup=0.35, depth=0.45, seed=0.0):
    """One soft bloom facing local -Y (petals in the XZ plane), radius r."""
    _lazy()
    out = []
    for k in range(petals):
        a = TAU * k / petals + seed
        b = g.bm_ellipsoid(r * 0.55, r * depth * 0.6, r * 0.38, 12, 8)
        g.bm_transform(b, Matrix.Rotation(math.radians(-25 * cup), 4, 'X'))
        g.bm_transform(b, Matrix.Translation(Vector((r * 0.52 * math.cos(a), -r * 0.10, r * 0.52 * math.sin(a)))) @
                       Matrix.Rotation(-a, 4, 'Y'))
        out.append(b)
    return g.merge(*out)


def rose_bm(r=0.035, seed=0.0):
    """Round 'rose / peony' bloom: a ball of curled petals (reads well at 1x)."""
    _lazy()
    outs = [g.bm_ellipsoid(r * 0.62, r * 0.55, r * 0.62, 14, 10)]
    for k in range(7):
        a = TAU * k / 7 + seed
        b = g.bm_ellipsoid(r * 0.42, r * 0.22, r * 0.36, 10, 6)
        g.bm_transform(b, Matrix.Translation(Vector((r * 0.55 * math.cos(a), -r * 0.05, r * 0.55 * math.sin(a)))) @
                       Matrix.Rotation(-a, 4, 'Y') @ Matrix.Rotation(math.radians(30), 4, 'X'))
        outs.append(b)
    return g.merge(*outs)


def leaf_bm(l=0.05, w=0.022):
    _lazy()
    b = g.bm_ellipsoid(w, w * 0.32, l, 10, 6)
    g.bm_transform(b, Matrix.Translation(Vector((0, 0, l * 0.8))))
    return b


def place_q(n):
    """Rotation turning local -Y toward the outward normal n (like char_build.on_head)."""
    return (-Vector(n)).to_track_quat('Y', 'Z')


# =========================================================================== v4 part fix for the new anims
# bot_longskirt's 'under' legs (r 0.060 / 0.050) are thinner than the mannequin core legs (0.062 / 0.052): fine
# while standing (the bell hides them) but in `sit` the core thighs / shins poke out of the skirt front and cut
# holes nobody fills.  townfolk2 renders bot_longskirt for its NEW anims with under-legs a bit thicker than the
# core (the skirt then drapes over the lap); the v4 frames in assets/townfolk are untouched.

def b_bot_longskirt_v5(rig, ctx, put):
    _lazy()
    with put('main'):
        sm = M('lskirt', ctx.col('bottom'), 0.85)
        g.mesh_obj('skirt', g.bm_lathe([(0.300, -0.29), (0.296, -0.26), (0.262, -0.12), (0.228, 0.0), (0.222, 0.06)],
                                       seg=48, sy=0.86, smooth_n=12, cap_top=False, cap_bottom=False), sm, rig.j['hips'])
        tp._legs(rig, sm, thigh=0.074, shin=0.064, name='under')


PARTS['bot_longskirt'].fn = b_bot_longskirt_v5


# =========================================================================== wedding dress

GOWN = [(0.335, -0.29), (0.334, -0.26), (0.312, -0.17), (0.276, -0.07), (0.244, 0.02), (0.218, 0.10),
        (0.209, 0.20), (0.197, 0.30), (0.157, 0.39), (0.07, 0.45), (0.0, 0.46)]


@part('wedding_dress', 'top', 'body',
      {'main': sub('gown', Z['top']), 'puff': sub('gown', Z2['gown_puff']), 'sash': sub('acc2', Z2['gown_sash'])},
      tags=['dress', 'wedding', 'formal'], ages=['adult', 'elder'], label={'ko': '웨딩드레스', 'en': 'wedding dress'})
def b_wedding_dress(rig, ctx, put):
    _lazy()
    gm = M('gown', ctx.col('gown'), 0.62)
    gd = M('gown_d', ctx.col('gown', 0.94), 0.7)
    with put('main'):
        bm = g.bm_lathe(GOWN, seg=56, sy=0.86, smooth_n=30, cap_top=False)
        g.mesh_obj('gown', bm, gm, rig.j['spine'])
        # scalloped hem ruffle + a soft tier in the middle of the skirt
        g.mesh_obj('hem_ruffle', g.bm_ring(0.330, 0.030, seg=72, segr=10, sy=0.86, rz=0.9, tufts=16, bump=0.30,
                                           seed=1.5), gd, rig.j['spine'], loc=(0, 0, -0.272))
        g.mesh_obj('tier', g.bm_ring(0.290, 0.020, seg=72, segr=8, sy=0.86, rz=0.8, tufts=14, bump=0.32, seed=3.1),
                   gd, rig.j['spine'], loc=(0, 0, -0.12))
        # neckline trim (sweetheart edge reads as a soft ridge)
        g.mesh_obj('neck_trim', g.bm_ring(0.150, 0.016, seg=48, segr=8, sy=0.90, rz=1.2, tufts=10, bump=0.25),
                   gd, rig.j['chest'], loc=(0, 0.0, 0.07))
        # 'under-legs' in gown colour: hidden in the bell, they poke out as fabric when walking / sitting
        for n in ('R', 'L'):
            g.mesh_obj('gleg_' + n, g.bm_capsule(0.082, cb.THIGH, r_end=0.078), gm, rig.j['hip_' + n])
            g.mesh_obj('gshin_' + n, g.bm_capsule(0.078, 0.07, r_end=0.076), gm, rig.j['knee_' + n])
        # tiny pearl buttons down the front of the bodice
        pearl = M('pearl', ctx.col('gown', 0.98), 0.25)
        for z in (0.17, 0.23, 0.29):
            p = cb.front_point(z, 0.209 if z < 0.25 else 0.200, 0.002)
            g.mesh_obj('pearl', g.bm_ellipsoid(0.012, 0.009, 0.012, 8, 6), pearl, rig.j['spine'], loc=p)
    with put('puff'):
        for n in ('R', 'L'):
            g.mesh_obj('puff_' + n, vd.fuzz(g.bm_ellipsoid(0.098, 0.094, 0.082, 20, 12), 0.004, 30.0), gm,
                       rig.j['sh_' + n], loc=(0, 0, -0.022))
            g.mesh_obj('puff_band_' + n, g.bm_ring(0.080, 0.016, seg=28, segr=8), gd, rig.j['sh_' + n],
                       loc=(0, 0, -0.085))
    with put('sash'):
        sm = M('sash', ctx.col('acc2'), 0.45)
        g.mesh_obj('sash', g.bm_ring(0.220, 0.030, seg=56, segr=10, sy=0.86, rz=1.2), sm, rig.j['spine'],
                   loc=(0, 0, 0.10))
        for s in (-1, 1):       # big bow at the back
            g.mesh_obj('bow_loop', g.bm_ellipsoid(0.085, 0.030, 0.055, 14, 8), sm, rig.j['spine'],
                       loc=(s * 0.075, 0.205, 0.115), rot=(0, s * -15, 0))
            g.mesh_obj('bow_tail', g.bm_box(0.045, 0.012, 0.16, bevel=0.01), sm, rig.j['spine'],
                       loc=(s * 0.040, 0.200, 0.00), rot=(6, s * 14, 0))
        g.mesh_obj('bow_knot', g.bm_ellipsoid(0.030, 0.026, 0.032, 10, 8), sm, rig.j['spine'], loc=(0, 0.214, 0.11))


PARTS['wedding_dress'].dress = True
PARTS['wedding_dress'].sleeves = 'skin'          # cap sleeves + bare arms (no white-on-grey sleeve clash)


# =========================================================================== veil (head space)

@part('veil', 'veil', 'head', {'top': sub(None, Z2['veil_top']), 'back': sub(None, Z2['veil_back'])},
      tags=['wedding'], label={'ko': '면사포', 'en': 'bridal veil'})
def b_veil(rig, ctx, put):
    _lazy()
    tulle = M('tulle', '#FBFAF7', 0.55, alpha=0.82)
    edge = M('tulle_edge', '#F4F0E8', 0.6, alpha=0.9)
    rx, ry, rz = tb.HEAD_R
    with put('top'):
        # gathered cap over the back of the crown (just outside the hair shell)
        def radial(x, y, z):
            # covers the back-top of the head (unit dirs: front = -y); dips inside the head elsewhere
            t = cb.smoothstep(-0.45, -0.05, y) * cb.smoothstep(-0.15, 0.30, z)
            return 0.88 + (1.17 - 0.88) * t
        cb.shell(rig, tulle, radial, 'veil_cap')
    with put('back'):
        # long drape from the crown down the back, flaring out
        prof = [(0.31, -0.70), (0.30, -0.55), (0.28, -0.35), (0.27, -0.15), (0.27, 0.0), (0.26, 0.12),
                (0.20, 0.22), (0.10, 0.27)]
        bm = g.bm_lathe(prof, seg=48, sy=0.95, smooth_n=20, cap_top=False, cap_bottom=False)
        kill = []
        for f in bm.faces:
            c = f.calc_center_median()
            ang = math.degrees(math.atan2(c.x, c.y))          # 0 = straight back (+Y)
            lim = 100 - 25 * max(0.0, min(1.0, (c.z + 0.1) / 0.3))
            if abs(ang) > lim:
                kill.append(f)
        bmesh.ops.delete(bm, geom=kill, context='FACES')
        for v in bm.verts:                                      # soft waves in the fabric
            a = math.atan2(v.co.x, v.co.y)
            k = max(0.0, -v.co.z) / 0.7
            v.co.x += 0.012 * k * math.sin(a * 9)
            v.co.y += 0.012 * k * math.cos(a * 9) + 0.10 * k * k
        vd.ho(rig, 'veil_drape', bm, tulle, loc=(0, 0.05, 0.02))
        hem = g.bm_ring(0.30, 0.010, seg=48, segr=6, sy=0.95, u0=PI * 0.48, u1=PI * 1.52, closed=False)
        vd.ho(rig, 'veil_hem', hem, edge, loc=(0, 0.13, -0.66), rot=(0, 0, 0))


# =========================================================================== groom suit

SUIT = [(0.256, -0.10), (0.248, -0.02), (0.224, 0.10), (0.216, 0.20), (0.204, 0.30), (0.164, 0.39)]


@part('groom_suit', 'top', 'body',
      {'shirt': sub(None, Z['top'] - 0.5), 'main': sub('top', Z['top'] + 0.5), 'bow': sub('top2', Z['job_detail'] + 0.5),
       'flower': sub(None, Z['job_detail'] + 0.6)},
      tags=['formal', 'wedding', 'smart'], ages=['adult', 'elder'], label={'ko': '예복 정장', 'en': 'wedding suit'})
def b_groom_suit(rig, ctx, put):
    _lazy()
    with put('shirt'):
        w = M('shirt_w', '#F7F5F0', 0.6)
        tp._torso(tp.SHIRT, w, rig, sy=0.84)
        for s in (-1, 1):
            g.mesh_obj('collar', g.bm_ellipsoid(0.050, 0.020, 0.030, 12, 8), w, rig.j['chest'],
                       loc=(s * 0.040, -0.126, 0.090), rot=(40, s * 20, s * 34))
        g.mesh_obj('placket', g.bm_box(0.022, 0.010, 0.22, bevel=0.004), M('shirt_d', '#E8E4DA', 0.6), rig.j['spine'],
                   loc=(0, -0.206, 0.20))
    with put('main'):
        m = M('suit', ctx.col('top'), 0.6)
        md = M('suit_d', ctx.col('top', 0.78), 0.45)
        g.mesh_obj('jacket', cb.vest_lathe(SUIT, gap_deg=17, seg=48, sy=0.88), m, rig.j['spine'])
        for s in (-1, 1):
            g.mesh_obj('lapel', vd.sector_lathe([(0.230, 0.06), (0.222, 0.18), (0.210, 0.29), (0.172, 0.38)],
                                                keep_deg=11, sy=0.88, center_deg=s * 25), md, rig.j['spine'])
            g.mesh_obj('pocket', g.bm_box(0.075, 0.012, 0.014, bevel=0.004), md, rig.j['spine'],
                       loc=(s * 0.14, -0.208, -0.03), rot=(0, 0, s * 12))
        bm_ = M('btn_suit', ctx.col('top', 0.4), 0.35)
        for z in (-0.02, 0.07):
            g.mesh_obj('button', g.bm_ellipsoid(0.016, 0.010, 0.016, 10, 6), bm_, rig.j['spine'],
                       loc=(0.050, -0.214, z))
        # little tails at the back (festive cut)
        for s in (-1, 1):
            g.mesh_obj('tail', g.bm_box(0.09, 0.02, 0.16, bevel=0.018), m, rig.j['spine'],
                       loc=(s * 0.07, 0.218, -0.13), rot=(-8, 0, s * 4))
    with put('bow'):
        bt = M('bowtie', ctx.col('top2'), 0.4)
        for s in (-1, 1):
            g.mesh_obj('bow_w', g.bm_ellipsoid(0.042, 0.016, 0.026, 12, 8), bt, rig.j['chest'],
                       loc=(s * 0.038, -0.140, 0.072), rot=(0, s * -12, 0))
        g.mesh_obj('bow_k', g.bm_ellipsoid(0.016, 0.016, 0.018, 10, 6), bt, rig.j['chest'], loc=(0, -0.150, 0.072))
    with put('flower'):
        wm = M('bout', '#FBF7F2', 0.55)
        q = Quaternion((1, 0, 0), math.radians(-8))
        g.mesh_obj('bout', rose_bm(0.030, 0.4), wm, rig.j['spine'], loc=(0.128, -0.205, 0.27), rot=q)
        lf = leaf_bm(0.034, 0.016)
        g.mesh_obj('bout_leaf', lf, M('leaf', FLOWER_GREEN, 0.6), rig.j['spine'], loc=(0.150, -0.198, 0.245),
                   rot=Quaternion((0, 1, 0), math.radians(140)))


# =========================================================================== flower crown (head space)

@part('flower_crown', 'headacc', 'head',
      {'leaves': sub(None, Z2['crown_leaves']), 'flowers': sub('flower', Z2['crown_flowers']),
       'flowers2': sub('flower2', Z2['crown_flowers2'])},
      tags=['wedding', 'flower'], label={'ko': '화관', 'en': 'flower crown'})
def b_flower_crown(rig, ctx, put):
    _lazy()
    fm = M('crown_bloom', ctx.col('flower'), 0.6)
    fm2 = M('crown_bloom2', ctx.col('flower2'), 0.6)
    lm = M('crown_leaf', FLOWER_GREEN, 0.6)
    cm = M('crown_centre', FLOWER_CENTRE, 0.5)
    n = 14
    spots = []
    for k in range(n):
        az = TAU * k / n
        el = 0.66 - 0.30 * (1 - math.cos(az)) / 2          # front high on the forehead, back lower
        p, nrm = cb.head_point(az, el, out=0.065)
        spots.append((k, az, p, nrm))
    with put('leaves'):
        for k, az, p, nrm in spots:
            for j, tw in enumerate((-50, 50)):
                q = place_q(nrm) @ Quaternion((0, 1, 0), math.radians(tw + 90))
                vd.ho(rig, 'cleaf', leaf_bm(0.040, 0.017), lm, loc=(p.x, p.y, p.z), rot=q)
            if k % 2 == 0:
                q = place_q(nrm)
                vd.ho(rig, 'ccentre', g.bm_ellipsoid(0.011, 0.010, 0.011, 8, 6), cm,
                      loc=tuple(p - nrm * -0.012), rot=q)
    with put('flowers'):
        for k, az, p, nrm in spots:
            if k % 2 == 0:
                vd.ho(rig, 'cbloom', flower_bm(0.040, 6, seed=0.3 * k), fm, loc=tuple(p), rot=place_q(nrm))
    with put('flowers2'):
        for k, az, p, nrm in spots:
            if k % 2 == 1:
                vd.ho(rig, 'cbloom2', rose_bm(0.026, 0.5 * k), fm2, loc=tuple(p - nrm * 0.005), rot=place_q(nrm))


# =========================================================================== mourning coat

MOURN = [(0.268, -0.21), (0.262, -0.10), (0.238, 0.0), (0.215, 0.10), (0.209, 0.22), (0.196, 0.31),
         (0.156, 0.39), (0.07, 0.45), (0.0, 0.46)]


@part('mourning_coat', 'top', 'body', {'main': sub('top', Z['top']), 'pin': sub(None, Z['top_detail'] + 0.3)},
      tags=['formal', 'mourning', 'warm'], label={'ko': '추모 코트', 'en': 'mourning coat'})
def b_mourning_coat(rig, ctx, put):
    _lazy()
    m = M('mcoat', ctx.col('top'), 0.82)
    md = M('mcoat_d', ctx.col('top', 0.82), 0.82)
    with put('main'):
        tp._torso(MOURN, m, rig, sy=0.85)
        g.mesh_obj('stand_collar', g.bm_lathe([(0.150, 0.0), (0.146, 0.04), (0.138, 0.075)], seg=40, sy=0.92,
                                              smooth_n=6, cap_top=False, cap_bottom=False), md, rig.j['chest'],
                   loc=(0, 0.012, 0.075))
        g.mesh_obj('placket', vd.sector_lathe([(0.272, -0.20), (0.262, -0.10), (0.240, 0.0), (0.217, 0.10),
                                               (0.211, 0.22), (0.198, 0.31)], keep_deg=4, sy=0.855), md,
                   rig.j['spine'])
        bm_ = M('btn_m', ctx.col('top', 0.55), 0.4)
        for z in (-0.12, -0.03, 0.06, 0.15, 0.24):
            p = cb.front_point(z, {True: 0.240, False: 0.212}[z < 0.0] if z > -0.1 else 0.258, 0.004)
            g.mesh_obj('button', g.bm_ellipsoid(0.014, 0.009, 0.014, 10, 6), bm_, rig.j['spine'], loc=p)
        for s in (-1, 1):
            g.mesh_obj('pocket', g.bm_box(0.08, 0.012, 0.014, bevel=0.004), md, rig.j['spine'],
                       loc=(s * 0.14, -0.208, -0.05), rot=(0, 0, s * 12))
    with put('pin'):
        # small white chrysanthemum pin on the left chest (gentle farewell custom)
        q = Quaternion((1, 0, 0), math.radians(-6))
        g.mesh_obj('pin_bloom', flower_bm(0.030, 8, cup=0.5, seed=0.2), M('pin_w', '#FBF8F2', 0.6), rig.j['spine'],
                   loc=(0.115, -0.204, 0.25), rot=q)
        g.mesh_obj('pin_c', g.bm_ellipsoid(0.010, 0.008, 0.010, 8, 6), M('pin_c', '#F2DC8A', 0.5), rig.j['spine'],
                   loc=(0.115, -0.214, 0.25))
        g.mesh_obj('pin_leaf', leaf_bm(0.030, 0.013), M('leaf', FLOWER_GREEN, 0.6), rig.j['spine'],
                   loc=(0.130, -0.200, 0.232), rot=Quaternion((0, 1, 0), math.radians(145)))


# =========================================================================== black hat (head space)

@part('black_hat', 'hat', 'head', {'main': sub('hat', Z['hat']), 'band': sub('hat2', Z['hat_detail'])},
      cls='full', tags=['formal', 'mourning'], label={'ko': '검은 모자', 'en': 'black felt hat'})
def b_black_hat(rig, ctx, put):
    _lazy()
    with put('main'):
        m = M('felt', ctx.col('hat'), 0.82)
        cb.cap_shell(rig, m, lambda x, y: 0.34 - 0.16 * y, base=1.13, puff=0.02, name='crown_base', soft=0.03)
        crown = g.bm_lathe([(0.275, 0.0), (0.282, 0.08), (0.26, 0.16), (0.19, 0.215), (0.08, 0.235), (0.0, 0.238)],
                           seg=44, sy=0.95, smooth_n=14, cap_bottom=False)
        vd.ho(rig, 'crown', crown, m, loc=(0, 0.02, 0.20), rot=(-10, 0, 0))
        brim = g.bm_lathe([(0.26, 0.010), (0.33, 0.000), (0.365, 0.018), (0.37, 0.006), (0.33, -0.014),
                           (0.26, -0.006)], seg=56, sy=0.98, cap_top=False, cap_bottom=False)
        vd.ho(rig, 'brim', brim, m, loc=(0, 0.02, 0.20), rot=(-12, 0, 0))
    with put('band'):
        bm_ = M('hatband', ctx.col('hat2'), 0.5)
        vd.ho(rig, 'band', g.bm_ring(0.280, 0.026, seg=48, segr=8, sy=0.95, rz=1.3), bm_, loc=(0, 0.02, 0.23),
              rot=(-10, 0, 0))
        for s in (-1, 1):
            vd.ho(rig, 'band_bow', g.bm_ellipsoid(0.030, 0.012, 0.022, 10, 6), bm_,
                  loc=(0.26, 0.07 + s * 0.035, 0.235), rot=(0, 0, 70 + s * 20))


# =========================================================================== held bouquet (body, hand item)

@part('held_bouquet', 'hand', 'body',
      {'wrap': dict(sub('wrap', Z2['item']), zfrontFollow='hand_R'),
       'green': dict(sub(None, Z2['item'] + 0.1), zfrontFollow='hand_R'),
       'flowers': dict(sub('flower', Z2['item'] + 0.2), zfrontFollow='hand_R'),
       'flowers2': dict(sub('flower2', Z2['item'] + 0.3), zfrontFollow='hand_R')},
      tags=['item', 'flower', 'wedding', 'mourning'], label={'ko': '꽃다발', 'en': 'bouquet'})
def b_held_bouquet(rig, ctx, put):
    """Built around the item joint 'item_R' (child of root; place_items() moves it onto the right
    hand every frame and keeps the bouquet upright, leaning a little forward)."""
    _lazy()
    if 'item_R' not in rig.j:
        rig.add('item_R', 'root', (0, 0, 0))
    j = rig.j['item_R']
    wm = M('wrap', ctx.col('wrap'), 0.7)
    fm = M('bq_bloom', ctx.col('flower'), 0.6)
    fm2 = M('bq_bloom2', ctx.col('flower2'), 0.6)
    lm = M('bq_leaf', FLOWER_GREEN, 0.6)
    lm2 = M('bq_leaf2', FLOWER_GREEN2, 0.6)
    with put('wrap'):
        cone = g.bm_lathe([(0.012, -0.10), (0.030, -0.06), (0.058, 0.02), (0.080, 0.075), (0.074, 0.085)],
                          seg=24, sy=0.9, smooth_n=8, cap_top=False)
        kill = []
        for f in cone.faces:                   # open front of the paper cone (bouquet faces -Y)
            c = f.calc_center_median()
            if c.z > 0.03 and abs(math.degrees(math.atan2(c.x, -c.y))) < 40:
                kill.append(f)
        bmesh.ops.delete(cone, geom=kill, context='FACES')
        g.mesh_obj('wrap', cone, wm, j, loc=(0, 0, 0))
        rib = g.bm_ring(0.026, 0.008, seg=24, segr=6, sy=0.9)
        g.mesh_obj('ribbon', rib, wm, j, loc=(0, 0, -0.035))
        for s in (-1, 1):
            g.mesh_obj('ribbon_loop', g.bm_ellipsoid(0.022, 0.008, 0.014, 10, 6), wm, j,
                       loc=(s * 0.022, -0.026, -0.03), rot=(0, s * -20, 0))
    with put('green'):
        for k in range(6):
            a = TAU * k / 6 + 0.4
            q = Quaternion((0, 0, 1), -a) @ Quaternion((1, 0, 0), math.radians(-38))
            g.mesh_obj('bq_leaf', leaf_bm(0.050, 0.018), lm if k % 2 else lm2, j,
                       loc=(0.035 * math.sin(a), 0.035 * math.cos(a), 0.055), rot=q)
        for k in range(5):                    # little filler buds (baby's breath look: fixed cream)
            a = TAU * k / 5 + 1.0
            g.mesh_obj('bud', g.bm_ellipsoid(0.010, 0.010, 0.010, 8, 6), M('bud', '#FBF6E8', 0.6), j,
                       loc=(0.060 * math.sin(a), 0.055 * math.cos(a) - 0.01, 0.105 + 0.01 * (k % 2)))
    with put('flowers'):
        for k, (x, y, z) in enumerate(((0.0, -0.010, 0.128), (-0.040, 0.002, 0.108), (0.040, 0.004, 0.110),
                                        (0.0, 0.040, 0.112))):
            r = 0.036 if k == 0 else 0.031
            g.mesh_obj('bq_bloom', rose_bm(r, 0.7 * k), fm, j, loc=(x, y, z),
                       rot=Quaternion((1, 0, 0), math.radians(-60 + 12 * (k == 3))))
    with put('flowers2'):
        for k, (x, y, z) in enumerate(((-0.026, -0.036, 0.090), (0.030, -0.034, 0.092), (-0.050, 0.030, 0.090),
                                        (0.050, 0.032, 0.094))):
            g.mesh_obj('bq_bloom2', flower_bm(0.026, 6, seed=0.5 * k), fm2, j, loc=(x, y, z),
                       rot=Quaternion((1, 0, 0), math.radians(-55)))


def item_scale(base_age):
    return {'child': 1.05, 'elder': 1.18}.get(base_age, 1.25)


def place_items(rig):
    """Move the item joint onto the right hand (call after every Rig.apply + IK).  The bouquet
    stays upright in the root's facing frame, tilted forward 12 deg, its grip (local origin) at the
    top of the fist."""
    if 'item_R' not in rig.j:
        return
    bpy.context.view_layer.update()
    root = rig.j['root']
    hw = rig.world('hand_R', (0.0, -0.012, 0.030))
    loc = root.matrix_world.inverted() @ hw
    j = rig.j['item_R']
    j.location = loc
    j.rotation_quaternion = Quaternion((1, 0, 0), math.radians(-12))
    s = item_scale(rig.meta.get('ch', {}).get('age', 'adult'))
    j.scale = (s, s, s)
