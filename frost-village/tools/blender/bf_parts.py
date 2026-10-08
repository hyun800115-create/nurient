"""
bf_parts.py - beachfolk wardrobe (CONTRACT_V7 Y): swimwear, beach casual, beach / hotel job outfits, anim props.

Imports tf_parts (never edited) and registers the new parts into the same tf_parts.PARTS registry (in this
process only) with the same @part(...) decorator and conventions (subs, tint slots, z, follow, hat classes).

Body-space parts
  bare_skin          the bare body (torso, pelvis, legs, bare feet) - tint skin; every beach person wears it
  bare_arms          skin-shaded arms over the mannequin sleeves (follow the arm limbs, followDz 0.2)
  no_top             placeholder 'top' with no layers (bare chest in swim trunks)
  swimsuit_one       one-piece suit: scoop neck, straps, contrast piping + waist band + front bow
  swim_trunks        swim shorts: drawstring waistband, contrast side stripe
  rash_guard         fitted long-sleeve top: mock neck, contrast side panels + wrist cuffs
  wetsuit            full suit (long sleeves + legs): chest band, side stripes, knee pads, back zip cord
  flip_flops         soles + Y straps (bare feet show)
  towel_shoulder     terry towel around the neck, striped ends
  swim_ring_worn     striped inflatable ring around the waist; split in NEAR / FAR halves (the ring item always
                     faces the camera, so its near half is drawn over the body and the far half under it)
  arm_floaties       kids' inflatable arm bands (follow the arms)
  aloha_shirt        boxy short-sleeve shirt, camp collar, hibiscus print (top2), short sleeves follow the arms
  beach_shorts       knee-length shorts with pockets and rolled hems
  tourist_camera     compact camera on a neck strap
  lifeguard_top      red tank top with a white cross (front + back) and yellow piping
  whistle            lanyard + whistle (lifeguard)
  rescue_tube        red foam rescue tube slung on the back
  bellhop_jacket     short fitted jacket, double row of brass buttons, gold braid, gold cuffs
  hotel_vest         white shirt + waistcoat + neck bow + gold name badge (receptionist)
  doorman_coat       long double-breasted coat, gold buttons, fringed epaulettes, aiguillette, gold cuffs
  housekeeper_dress  dress + white frilled bib apron + collar
  vendor_shirt       candy-striped short-sleeve shirt, bow tie, bib apron (ice-cream vendor)
  bar_apron          short waist apron with a pocket (beach bar)
  surfboard          anim prop: board under the feet in 'surf'
  toy_spade          anim prop: toy spade in the right hand in 'dig'
Head-space parts
  swim_cap, swim_cap_flower, straw_hat, sun_hat_wide, sunglasses, snorkel_mask, bellhop_cap (pillbox),
  doorman_hat (top hat), paper_cap (soda-jerk cap), kerchief (polka-dot headscarf), sun_visor
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import tf_parts as tp                     # noqa: E402
import tf_presets as tpr                  # noqa: E402
import bf_presets as bpr                  # noqa: E402

PARTS = tp.PARTS
Z = dict(tp.Z)
part, sub = tp.part, tp.sub
PI = math.pi
TAU = math.tau

tpr.TINT_REF.update({k: v for k, v in bpr.TINT_REF3.items() if k not in tpr.TINT_REF})

# z of the new subs (the townfolk Z table + these)
Z3 = {
    'skin': 10.0, 'board': 4.0, 'board_stripe': 4.2,
    'ring_far': 3.2, 'ring_far2': 3.3, 'ring_near': 44.6, 'ring_near2': 44.7,
    'item': 45.0, 'shirt_under': 29.5, 'vest_over': 30.5,
    'tube_back': {'S': 3.4, 'SE': 3.4, 'E': 3.4, 'NE': 46.5, 'N': 46.5},
}
NEW_BODY = ['bare_skin', 'bare_arms', 'no_top', 'swimsuit_one', 'swim_trunks', 'rash_guard', 'wetsuit', 'flip_flops',
            'towel_shoulder', 'swim_ring_worn', 'arm_floaties', 'aloha_shirt', 'beach_shorts', 'tourist_camera',
            'lifeguard_top', 'whistle', 'rescue_tube', 'bellhop_jacket', 'hotel_vest', 'doorman_coat',
            'housekeeper_dress', 'vendor_shirt', 'bar_apron', 'surfboard', 'toy_spade']
NEW_HEAD = ['swim_cap', 'swim_cap_flower', 'straw_hat', 'sun_hat_wide', 'sunglasses', 'snorkel_mask', 'bellhop_cap',
            'doorman_hat', 'paper_cap', 'kerchief', 'sun_visor']
NEW_PARTS = NEW_BODY + NEW_HEAD
GOLD = '#E2B13C'
WHITE = '#F7F5F0'


def _lazy():
    tp._lazy()
    global bpy, bmesh, Vector, Matrix, Quaternion, bc, g, cb, vd, tb, vf
    import bpy                                  # noqa: F401
    import bmesh                                # noqa: F401
    from mathutils import Vector, Matrix, Quaternion       # noqa: F401
    import bl_common as bc                      # noqa: F401
    import char_geo as g                        # noqa: F401
    import char_build as cb                     # noqa: F401
    import vil_dress as vd                      # noqa: F401
    import vil_face as vf                       # noqa: F401
    import tf_body as tb                        # noqa: F401


def M(name, color, rough=0.8, **kw):
    return tp.M(name, color, rough, **kw)


def follow(tint, limb, dz=0.5):
    d = {'tint': tint, 'z': Z['arm'] + dz, 'follow': limb}
    if dz != 0.5:
        d['followDz'] = dz
    return d


# --------------------------------------------------------------------------- geometry helpers

def prof_r(prof, z):
    """Radius of a lathe profile [(r, z)...] at height z (linear)."""
    if z <= prof[0][1]:
        return prof[0][0]
    for (r0, z0), (r1, z1) in zip(prof, prof[1:]):
        if z0 <= z <= z1:
            t = (z - z0) / max(1e-6, z1 - z0)
            return r0 + (r1 - r0) * t
    return prof[-1][0]


def surf_pt(prof, sy, az_deg, z, out=0.0):
    """(point, normal) on a lathe surface: az 0 = front (-Y), +90 = character's left (+X)."""
    r = prof_r(prof, z)
    a = math.radians(az_deg)
    x, y = r * math.sin(a), -r * sy * math.cos(a)
    n = Vector((x / max(r, 1e-4), y / max(r * sy * sy, 1e-4), 0.0)).normalized()
    return Vector((x, y, z)) + n * out, n


def ang_front(c):
    """Angle of a point around Z, 0 = front (-Y), + toward the character's left (+X), degrees."""
    return math.degrees(math.atan2(c.x, -c.y))


def kill_faces(bm, pred):
    kill = [f for f in bm.faces if pred(f.calc_center_median())]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    return bm


def interp(pairs, x):
    """Piecewise-linear lookup in [(x, y)...] (x ascending)."""
    if x <= pairs[0][0]:
        return pairs[0][1]
    for (x0, y0), (x1, y1) in zip(pairs, pairs[1:]):
        if x0 <= x <= x1:
            return y0 + (y1 - y0) * (x - x0) / max(1e-6, x1 - x0)
    return pairs[-1][1]


def band_lathe(prof, z0, z1, sy, out=0.003, seg=56):
    """Thin band hugging a lathe surface between heights z0..z1."""
    zs = [z0 + (z1 - z0) * k / 3 for k in range(4)]
    return g.bm_lathe([(prof_r(prof, z) + out, z) for z in zs], seg=seg, sy=sy, cap_top=False, cap_bottom=False)


def decal(points2d, thick=0.006, bevel=0.002):
    """Flat outline [(x, z)...] in the XZ plane facing -Y (a slab along Y), centred."""
    pts = [(-x, z) for x, z in points2d]          # bm_slab extrudes along X: outline is (y, z)
    bm = g.bm_slab(pts, thick, bevel=bevel, segs=1)
    g.bm_transform(bm, Matrix.Rotation(PI / 2, 4, 'Z'))
    return bm


def place_on(bm, p, n, spin=0.0):
    """Orient a decal built facing -Y so it faces along n (outward), then move it to p."""
    q = (-n).to_track_quat('Y', 'Z')
    if spin:
        q = q @ Quaternion((0, 1, 0), math.radians(spin))
    g.bm_transform(bm, Matrix.Translation(p) @ q.to_matrix().to_4x4())
    return bm


def flower5(r=0.032, petals=5, k=0.55):
    """2D hibiscus-like outline."""
    pts = []
    n = petals * 8
    for i in range(n):
        a = TAU * i / n
        rr = r * (k + (1 - k) * abs(math.cos(petals * a / 2)) ** 0.8)
        pts.append((rr * math.cos(a), rr * math.sin(a)))
    return pts


# =========================================================================== bare body

SKIN_TORSO = [(0.176, -0.02), (0.182, 0.02), (0.195, 0.08), (0.204, 0.16), (0.202, 0.24), (0.188, 0.31),
              (0.150, 0.38), (0.076, 0.43), (0.0, 0.448)]
SKIN_SY = 0.82


def skin_mat(ctx):
    return M('skin', ctx.col('skin'), 0.55)


@part('bare_skin', 'skin', 'body', {'main': sub('skin', Z3['skin'])}, tags=['beach', 'skin'],
      label={'ko': '맨살(몸)', 'en': 'bare skin'})
def b_bare_skin(rig, ctx, put):
    _lazy()
    sk = skin_mat(ctx)
    with put('main'):
        g.mesh_obj('skin_torso', g.bm_lathe(SKIN_TORSO, seg=44, sy=SKIN_SY, smooth_n=20, cap_bottom=False), sk,
                   rig.j['spine'])
        g.mesh_obj('skin_pelvis', g.bm_ellipsoid(0.173, 0.143, 0.112, 28, 14), sk, rig.j['hips'], loc=(0, 0, -0.012))
        for n in ('R', 'L'):
            g.mesh_obj('skin_thigh_' + n, g.bm_capsule(0.067, cb.THIGH, r_end=0.059), sk, rig.j['hip_' + n])
            g.mesh_obj('skin_shin_' + n, g.bm_capsule(0.057, 0.118, r_end=0.047), sk, rig.j['knee_' + n])
            # bare foot: soft wedge with a big-toe bump, sole flat on the ground
            g.mesh_obj('skin_foot_' + n, g.bm_ellipsoid(0.050, 0.080, 0.040, 18, 10), sk, rig.j['knee_' + n],
                       loc=(0, -0.030, -0.160))
            g.mesh_obj('skin_toe_' + n, g.bm_ellipsoid(0.022, 0.024, 0.020, 10, 8), sk, rig.j['knee_' + n],
                       loc=(0.020 if n == 'L' else -0.020, -0.098, -0.172))


@part('bare_arms', 'skin', 'body', {'arm_R': follow('skin', 'arm_R', 0.2), 'arm_L': follow('skin', 'arm_L', 0.2)},
      tags=['beach', 'skin'], label={'ko': '맨팔', 'en': 'bare arms'})
def b_bare_arms(rig, ctx, put):
    _lazy()
    sk = skin_mat(ctx)
    for n in ('R', 'L'):
        with put('arm_' + n):
            g.mesh_obj('barm_' + n, g.bm_capsule(0.078, cb.UPPER_ARM, r_end=0.071), sk, rig.j['sh_' + n])
            g.mesh_obj('bfarm_' + n, g.bm_capsule(0.072, cb.FOREARM - 0.02, r_end=0.064), sk, rig.j['el_' + n])


@part('no_top', 'top', 'body', {}, tags=['beach', 'bare'], label={'ko': '상의 없음', 'en': 'no top'})
def b_no_top(rig, ctx, put):
    return


PARTS['no_top'].sleeves = 'skin'


# =========================================================================== swimsuit

SUIT_PROF = [(0.184, -0.03), (0.190, 0.02), (0.203, 0.08), (0.212, 0.16), (0.210, 0.24), (0.197, 0.31),
             (0.184, 0.335)]
SUIT_SY = 0.83
SUIT_TOP = [(0, 0.236), (25, 0.262), (42, 0.296), (60, 0.312), (90, 0.300), (125, 0.262), (155, 0.226),
            (180, 0.214)]                    # neckline / back height by |angle from front|


def suit_top(c):
    return interp(SUIT_TOP, abs(ang_front(c)))


@part('swimsuit_one', 'top', 'body', {'main': sub('swim', Z['top']), 'trim': sub('swim2', Z['top_detail'])},
      tags=['beach', 'swimwear'], label={'ko': '원피스 수영복', 'en': 'one-piece swimsuit'})
def b_swimsuit_one(rig, ctx, put):
    _lazy()
    sm = M('swimsuit', ctx.col('swim'), 0.42)
    tm = M('swim_trim', ctx.col('swim2'), 0.42)
    with put('main'):
        bm = g.bm_lathe(SUIT_PROF, seg=60, sy=SUIT_SY, smooth_n=26, cap_top=False, cap_bottom=False)
        kill_faces(bm, lambda c: c.z > suit_top(c))
        g.mesh_obj('suit_body', bm, sm, rig.j['spine'])
        seat = g.bm_lathe([(0.0, -0.132), (0.11, -0.128), (0.180, -0.098), (0.196, -0.05), (0.198, 0.0),
                           (0.192, 0.03)], seg=48, sy=0.84, smooth_n=12, cap_top=False)
        # leg openings cut high on the hips (the seat dips at the sides)
        kill_faces(seat, lambda c: c.z < -0.045 - 0.075 * (1 - abs(math.sin(math.radians(ang_front(c)))) ** 2)
                   and abs(math.sin(math.radians(ang_front(c)))) > 0.55)
        g.mesh_obj('suit_seat', seat, sm, rig.j['hips'])
        # straps over the shoulders (front neckline -> over the top -> back)
        for s in (-1, 1):
            p0, _ = surf_pt(SUIT_PROF, SUIT_SY, s * 44, 0.296, 0.002)
            p3, _ = surf_pt(SUIT_PROF, SUIT_SY, s * 150, 0.232, 0.002)
            pts = [p0, (s * 0.105, -0.11, 0.37), (s * 0.115, -0.02, 0.425), (s * 0.110, 0.08, 0.385), p3]
            g.mesh_obj('suit_strap', g.bm_tube_path(vd.catmull3(pts, 14), 0.018, segr=8, side_ref=(1, 0, 0), flat=1.5),
                       sm, rig.j['spine'])
    with put('trim'):
        # piping along the neckline / back edge
        pts = []
        for k in range(73):
            a = -180 + 5 * k
            z = interp(SUIT_TOP, abs(a))
            p, _ = surf_pt(SUIT_PROF, SUIT_SY, a, z - 0.004, 0.006)
            pts.append(p)
        g.mesh_obj('suit_pipe', g.bm_tube_path(pts, 0.0105, segr=8), tm, rig.j['spine'])
        # contrast waist band (sporty colour block)
        g.mesh_obj('suit_band', band_lathe(SUIT_PROF, 0.055, 0.095, SUIT_SY, out=0.004), tm, rig.j['spine'])
        # leg-opening piping around the top of each thigh
        for n, s in (('R', -1), ('L', 1)):
            ring = g.bm_ring(0.074, 0.0115, seg=32, segr=8)
            g.bm_transform(ring, Matrix.Rotation(math.radians(-s * 24), 4, 'Y'))
            g.mesh_obj('suit_leg_pipe', ring, tm, rig.j['hip_' + n], loc=(s * 0.010, 0.0, -0.035))
        # small bow at the neckline
        for s in (-1, 1):
            g.mesh_obj('suit_bow', g.bm_ellipsoid(0.030, 0.012, 0.020, 12, 8), tm, rig.j['spine'],
                       loc=(s * 0.026, -0.172, 0.238), rot=(0, s * -14, 0))
        g.mesh_obj('suit_bow_k', g.bm_ellipsoid(0.012, 0.012, 0.013, 8, 6), tm, rig.j['spine'], loc=(0, -0.178, 0.238))


# =========================================================================== swim trunks

TRUNK_SEAT = [(0.0, -0.136), (0.12, -0.131), (0.188, -0.100), (0.204, -0.045), (0.199, 0.015), (0.193, 0.045)]


def _short_legs(rig, mat, r0, r1, length, name, flare=0.004):
    for n in ('R', 'L'):
        prof = [(r1 + flare, -length), (r1, -length + 0.02), ((r0 + r1) / 2, -length / 2), (r0, 0.0),
                (r0 * 0.9, 0.035)]
        g.mesh_obj(name + '_' + n, g.bm_lathe(prof, seg=28, smooth_n=8, cap_top=False, cap_bottom=False), mat,
                   rig.j['hip_' + n])


@part('swim_trunks', 'bottom', 'body', {'main': sub('swim', Z['pants']), 'stripe': sub('swim2', Z['pants'] + 0.5)},
      tags=['beach', 'swimwear'], label={'ko': '수영 반바지', 'en': 'swim trunks'})
def b_swim_trunks(rig, ctx, put):
    _lazy()
    sm = M('trunks', ctx.col('swim'), 0.6)
    with put('main'):
        g.mesh_obj('trunk_seat', g.bm_lathe(TRUNK_SEAT, seg=48, sy=0.84, smooth_n=12, cap_top=False), sm,
                   rig.j['hips'])
        _short_legs(rig, sm, 0.084, 0.088, 0.105, 'trunk_leg')
        g.mesh_obj('trunk_band', g.bm_ring(0.196, 0.017, seg=56, segr=8, sy=0.84, rz=1.25),
                   M('trunks_d', ctx.col('swim', 0.82), 0.6), rig.j['hips'], loc=(0, 0, 0.036))
        cord = M('cord', '#F4F1EA', 0.6)
        for s in (-1, 1):
            g.mesh_obj('trunk_cord', g.bm_tube_path([(s * 0.012, -0.178, 0.030), (s * 0.026, -0.184, -0.005),
                                                     (s * 0.022, -0.182, -0.040)], 0.006, segr=6), cord,
                       rig.j['hips'])
    with put('stripe'):
        st = M('trunk_stripe', ctx.col('swim2'), 0.6)
        for n, s in (('R', -1), ('L', 1)):
            bm = vd.sector_lathe([(0.091, -0.105), (0.088, -0.05), (0.086, 0.0), (0.078, 0.032)], keep_deg=16,
                                 seg=28, sy=1.0, center_deg=s * 90)
            g.mesh_obj('trunk_side', bm, st, rig.j['hip_' + n])
            hem = g.bm_ring(0.090, 0.0085, seg=28, segr=6)
            g.mesh_obj('trunk_hem', hem, st, rig.j['hip_' + n], loc=(0, 0, -0.096))


# =========================================================================== rash guard

RASH = [(0.223, -0.078), (0.219, -0.02), (0.211, 0.10), (0.208, 0.22), (0.196, 0.31), (0.156, 0.39),
        (0.07, 0.45), (0.0, 0.46)]


def _wrist_cuffs(rig, put, mat, r=0.073, tube=0.019, prefix='cuff'):
    for n in ('R', 'L'):
        with put(prefix + '_' + n):
            g.mesh_obj(prefix + '_' + n, g.bm_ring(r, tube, seg=28, segr=8, rz=1.5), mat, rig.j['el_' + n],
                       loc=(0, 0, -cb.FOREARM + 0.016))


@part('rash_guard', 'top', 'body', {'main': sub('top', Z['top']), 'panel': sub('top2', Z['top_detail']),
                                    'cuff_R': follow('top2', 'arm_R'), 'cuff_L': follow('top2', 'arm_L')},
      tags=['beach', 'swimwear'], label={'ko': '래시가드', 'en': 'rash guard'})
def b_rash_guard(rig, ctx, put):
    _lazy()
    m = M('rash', ctx.col('top'), 0.5)
    pm = M('rash_panel', ctx.col('top2'), 0.5)
    with put('main'):
        g.mesh_obj('rash_torso', g.bm_lathe(RASH, seg=52, sy=0.85, smooth_n=26, cap_top=False), m, rig.j['spine'])
        g.mesh_obj('rash_neck', g.bm_lathe([(0.142, 0.0), (0.136, 0.035), (0.128, 0.065)], seg=40, sy=0.92,
                                           smooth_n=6, cap_top=False, cap_bottom=False), m, rig.j['chest'],
                   loc=(0, 0.01, 0.075))
    with put('panel'):
        for s in (-1, 1):
            g.mesh_obj('rash_side', vd.sector_lathe([(0.226, -0.074), (0.221, 0.0), (0.213, 0.10), (0.211, 0.20),
                                                     (0.203, 0.27)], keep_deg=14, sy=0.855, center_deg=s * 90),
                       pm, rig.j['spine'])
        g.mesh_obj('rash_collar', g.bm_ring(0.135, 0.012, seg=40, segr=6, sy=0.92), pm, rig.j['chest'],
                   loc=(0, 0.01, 0.140))
        g.mesh_obj('rash_chest', band_lathe(RASH, 0.245, 0.275, 0.85, out=0.004), pm, rig.j['spine'])
    _wrist_cuffs(rig, put, pm)


PARTS['rash_guard'].sleeves = 'top'


# =========================================================================== wetsuit

@part('wetsuit', 'top', 'body', {'main': sub('top', Z['top']), 'panel': sub('top2', Z['top_detail'])},
      tags=['beach', 'swimwear', 'surf'], ages=['child', 'adult', 'elder'], label={'ko': '웻슈트', 'en': 'wetsuit'})
def b_wetsuit(rig, ctx, put):
    _lazy()
    m = M('wetsuit', ctx.col('top'), 0.38)
    pm = M('wet_panel', ctx.col('top2'), 0.4)
    with put('main'):
        g.mesh_obj('wet_torso', g.bm_lathe(RASH, seg=52, sy=0.85, smooth_n=26, cap_top=False), m, rig.j['spine'])
        g.mesh_obj('wet_seat', g.bm_lathe(TRUNK_SEAT, seg=44, sy=0.84, smooth_n=12, cap_top=False), m, rig.j['hips'])
        for n in ('R', 'L'):
            g.mesh_obj('wet_thigh_' + n, g.bm_capsule(0.074, cb.THIGH, r_end=0.066), m, rig.j['hip_' + n])
            g.mesh_obj('wet_shin_' + n, g.bm_lathe([(0.058, -0.125), (0.060, -0.10), (0.064, -0.04), (0.066, 0.0)],
                                                   seg=24, smooth_n=6, cap_top=True, cap_bottom=False), m,
                       rig.j['knee_' + n])
            g.mesh_obj('wet_knee_' + n, g.bm_ellipsoid(0.058, 0.030, 0.050, 14, 8),
                       M('wet_knee', ctx.col('top', 0.7), 0.6), rig.j['knee_' + n], loc=(0, -0.052, -0.012))
        g.mesh_obj('wet_neck', g.bm_lathe([(0.142, 0.0), (0.137, 0.04), (0.130, 0.075)], seg=40, sy=0.92,
                                          smooth_n=6, cap_top=False, cap_bottom=False), m, rig.j['chest'],
                   loc=(0, 0.01, 0.072))
        g.mesh_obj('wet_zip_cord', g.bm_tube_path([(0.0, 0.17, 0.42), (0.03, 0.20, 0.30), (0.05, 0.215, 0.16)], 0.007,
                                                  segr=6), M('zipcord', '#F2C230', 0.5), rig.j['spine'])
    with put('panel'):
        # chest / shoulder colour band and side stripes down the legs
        g.mesh_obj('wet_chest', band_lathe(RASH, 0.215, 0.27, 0.85, out=0.004), pm, rig.j['spine'])
        for n, s in (('R', -1), ('L', 1)):
            g.mesh_obj('wet_leg_stripe', vd.sector_lathe([(0.070, -cb.THIGH), (0.075, -0.07), (0.078, 0.0)],
                                                         keep_deg=12, seg=28, sy=1.0, center_deg=s * 90),
                       pm, rig.j['hip_' + n])
        for s in (-1, 1):
            g.mesh_obj('wet_side', vd.sector_lathe([(0.226, -0.07), (0.214, 0.10), (0.211, 0.20)], keep_deg=8,
                                                   sy=0.855, center_deg=s * 90), pm, rig.j['spine'])


PARTS['wetsuit'].sleeves = 'top'


# =========================================================================== flip-flops

@part('flip_flops', 'shoes', 'body', {'main': sub('shoes', Z['shoes'])}, tags=['beach'],
      label={'ko': '슬리퍼(조리)', 'en': 'flip-flops'})
def b_flip_flops(rig, ctx, put):
    _lazy()
    strap = M('ff_strap', ctx.col('shoes'), 0.45)
    sole = M('ff_sole', ctx.col('shoes', 0.72), 0.7)
    with put('main'):
        for n in ('R', 'L'):
            k = rig.j['knee_' + n]
            s = g.bm_ellipsoid(0.058, 0.098, 0.011, 24, 8)
            g.mesh_obj('ff_sole_' + n, s, sole, k, loc=(0, -0.036, -0.193))
            post = (0.0 if n == 'R' else 0.0, -0.092, -0.186)
            for side in (-1, 1):
                pts = [post, (side * 0.026, -0.066, -0.160), (side * 0.046, -0.030, -0.158), (side * 0.054, -0.012,
                                                                                               -0.186)]
                g.mesh_obj('ff_strap', g.bm_tube_path(vd.catmull3(pts, 10), 0.0085, segr=6, side_ref=(0, 0, 1),
                                                      flat=1.6), strap, k)


# =========================================================================== towel around the neck

@part('towel_shoulder', 'neck', 'body', {'main': sub('acc', Z['scarf']), 'stripe': sub('acc2', Z['scarf'] + 0.5)},
      tags=['beach'], label={'ko': '목에 건 수건', 'en': 'towel round the neck'})
def b_towel_shoulder(rig, ctx, put):
    _lazy()
    tm = M('towel', ctx.col('acc'), 0.97)
    with put('main'):
        ring = vd.fuzz(g.bm_ring(0.138, 0.030, seg=48, segr=10, sy=0.92, rz=0.8), 0.003, 60.0)
        g.mesh_obj('towel_ring', ring, tm, rig.j['chest'], loc=(0, 0.012, 0.100))
        for s in (-1, 1):
            pts = [(s * 0.085, -0.112, 0.095), (s * 0.100, -0.166, 0.030), (s * 0.106, -0.196, -0.080),
                   (s * 0.104, -0.205, -0.205)]
            g.mesh_obj('towel_end', vd.fuzz(g.bm_tube_path(vd.catmull3(pts, 14), 0.016, segr=10, side_ref=(1, 0, 0),
                                                            flat=3.4), 0.0025, 60.0), tm, rig.j['chest'])
    with put('stripe'):
        st = M('towel_s', ctx.col('acc2'), 0.97)
        for s in (-1, 1):
            for z in (-0.135, -0.170):
                g.mesh_obj('towel_band', g.bm_tube_path([(s * 0.105, -0.203, z + 0.010), (s * 0.105, -0.205, z - 0.010)],
                                                        0.0172, segr=10, side_ref=(1, 0, 0), flat=3.45), st,
                           rig.j['chest'])


# =========================================================================== swim ring (item, near / far halves)

RING_R, RING_r = 0.300, 0.088
RING_SEGS = 8          # alternating colour segments (main / stripe); near = segments with local y < 0


def ring_scale(age):
    return {'child': 0.80, 'elder': 1.04}.get(age, 1.0)


def _ensure_item(rig, name):
    if name not in rig.j:
        rig.add(name, 'root', (0, 0, 0))
    j = rig.j[name]
    j.rotation_mode = 'QUATERNION'
    return j


@part('swim_ring_worn', 'bag', 'body',
      {'near': sub('ring', Z3['ring_near']), 'near2': sub('ring2', Z3['ring_near2']),
       'far': sub('ring', Z3['ring_far']), 'far2': sub('ring2', Z3['ring_far2'])},
      tags=['beach', 'item', 'ring'], label={'ko': '튜브', 'en': 'swim ring'})
def b_swim_ring_worn(rig, ctx, put):
    """Ring meshes live on the item joint 'ring_item' (bf_render.place_items3 moves it to the waist every frame
    and keeps its local -Y pointing at the camera)."""
    _lazy()
    j = _ensure_item(rig, 'ring_item')
    m1 = M('ring', ctx.col('ring'), 0.22)
    m2 = M('ring2', ctx.col('ring2'), 0.22)
    step = TAU / RING_SEGS
    for k in range(RING_SEGS):
        u0, u1 = k * step, (k + 1) * step
        near = math.sin((u0 + u1) / 2) < 0
        stripe = k % 2 == 1
        sname = ('near' if near else 'far') + ('2' if stripe else '')
        with put(sname):
            g.mesh_obj('ring_seg', g.bm_ring(RING_R, RING_r, seg=10, segr=16, u0=u0, u1=u1, closed=False),
                       m2 if stripe else m1, j)
    with put('near'):
        # little valve on the front-top
        g.mesh_obj('ring_valve', g.bm_cyl(0.016, 0.013, 0.022, seg=10), M('valve', '#F7F5F0', 0.3), j,
                   loc=(0.10, -RING_R * 0.95, RING_r * 0.82), rot=(-30, 0, 0))


# =========================================================================== arm floaties

@part('arm_floaties', 'floaties', 'body',
      {'R': follow('float', 'arm_R', 0.7), 'L': follow('float', 'arm_L', 0.7)},
      tags=['beach', 'kids'], ages=['child'], label={'ko': '팔튜브', 'en': 'arm floaties'})
def b_arm_floaties(rig, ctx, put):
    _lazy()
    fm = M('floatie', ctx.col('float'), 0.2)
    sm = M('floatie_seam', ctx.col('float', 0.8), 0.3)
    for n in ('R', 'L'):
        with put(n):
            for dz, r in ((-0.048, 0.031), (-0.090, 0.030)):
                g.mesh_obj('floatie', g.bm_ring(0.090, r, seg=32, segr=12, rz=1.15), fm, rig.j['sh_' + n],
                           loc=(0, 0, dz))
            g.mesh_obj('floatie_seam', g.bm_ring(0.094, 0.006, seg=32, segr=6), sm, rig.j['sh_' + n], loc=(0, 0, -0.069))
            g.mesh_obj('floatie_valve', g.bm_cyl(0.010, 0.008, 0.016, seg=8), M('valve', '#F7F5F0', 0.3),
                       rig.j['sh_' + n], loc=(0.0, -0.118, -0.058), rot=(90, 0, 0))


# =========================================================================== aloha shirt

ALOHA = [(0.247, -0.090), (0.243, -0.03), (0.222, 0.10), (0.215, 0.22), (0.201, 0.31), (0.159, 0.39),
         (0.07, 0.45), (0.0, 0.46)]
ALOHA_SY = 0.86


def _short_sleeves(rig, put, mat, r=0.098, length=0.105, prefix='cuff'):
    for n in ('R', 'L'):
        with put(prefix + '_' + n):
            prof = [(r * 1.04, -length), (r, -length + 0.015), (r * 0.98, -length / 2), (r * 0.9, 0.0),
                    (r * 0.55, 0.05)]
            g.mesh_obj('sleeve_' + n, g.bm_lathe(prof, seg=28, smooth_n=8, cap_top=False, cap_bottom=False), mat,
                       rig.j['sh_' + n])
            g.mesh_obj('sleeve_hem_' + n, g.bm_ring(r * 1.02, 0.010, seg=28, segr=6), mat, rig.j['sh_' + n],
                       loc=(0, 0, -length + 0.008))


@part('aloha_shirt', 'top', 'body', {'main': sub('top', Z['top']), 'print': sub('top2', Z['top_detail']),
                                     'cuff_R': follow('top', 'arm_R'), 'cuff_L': follow('top', 'arm_L')},
      tags=['beach', 'casual'], ages=['adult', 'elder'], label={'ko': '알로하 셔츠', 'en': 'aloha shirt'})
def b_aloha_shirt(rig, ctx, put):
    _lazy()
    m = M('aloha', ctx.col('top'), 0.75)
    md = M('aloha_d', ctx.col('top', 0.86), 0.75)
    with put('main'):
        bm = g.bm_lathe(ALOHA, seg=56, sy=ALOHA_SY, smooth_n=26, cap_top=False)
        kill_faces(bm, lambda c: abs(ang_front(c)) < 15 * min(1.0, max(0.0, (c.z - 0.24) / 0.12)) and c.z > 0.24)
        g.mesh_obj('aloha_body', bm, m, rig.j['spine'])
        for s in (-1, 1):     # camp collar flaps lying open
            g.mesh_obj('aloha_collar', g.bm_ellipsoid(0.072, 0.020, 0.044, 14, 8), md, rig.j['chest'],
                       loc=(s * 0.064, -0.118, 0.066), rot=(38, s * 22, s * 34))
        g.mesh_obj('aloha_placket', g.bm_box(0.022, 0.010, 0.30, bevel=0.004), md, rig.j['spine'],
                   loc=(0.012, -0.213, 0.10))
        btn = M('aloha_btn', '#F4EDE0', 0.35)
        for z in (-0.04, 0.05, 0.14):
            g.mesh_obj('button', g.bm_ellipsoid(0.013, 0.008, 0.013, 10, 6), btn, rig.j['spine'],
                       loc=(0.012, -0.222 + 0.004 * (z > 0.1), z))
        g.mesh_obj('aloha_pocket', g.bm_box(0.075, 0.010, 0.07, bevel=0.008), md, rig.j['spine'],
                   loc=(0.105, -0.187, 0.200), rot=(-6, 0, -10))
    with put('print'):
        pm = M('aloha_print', ctx.col('top2'), 0.75)
        k = 0
        for z in (-0.050, 0.035, 0.120, 0.205, 0.275):
            for az in range(-170, 190, 40):
                a = az + (20 if (k % 2) else 0) + 9 * math.sin(k * 2.3)
                k += 1
                if abs(a) < 12 and z > 0.22:
                    continue
                r = 0.030 if (k % 3) else 0.038
                p, nrm = surf_pt(ALOHA, ALOHA_SY, a, z + 0.012 * math.cos(k * 1.7), 0.004)
                g.mesh_obj('hibiscus', place_on(decal(flower5(r), 0.006), p, nrm, spin=37 * k), pm, rig.j['spine'])
                if k % 2 == 0:
                    p2, n2 = surf_pt(ALOHA, ALOHA_SY, a + 9, z - 0.03, 0.004)
                    leaf = [(0.028 * math.cos(t) * (1 if math.sin(t) >= 0 else 1), 0.012 * math.sin(t))
                            for t in [TAU * i / 14 for i in range(14)]]
                    g.mesh_obj('leaf', place_on(decal(leaf, 0.005), p2, n2, spin=25 + 40 * k), pm, rig.j['spine'])
    _short_sleeves(rig, put, m)


PARTS['aloha_shirt'].sleeves = 'skin'


# =========================================================================== beach shorts

@part('beach_shorts', 'bottom', 'body', {'main': sub('bottom', Z['pants'])}, tags=['beach', 'casual'],
      label={'ko': '반바지', 'en': 'beach shorts'})
def b_beach_shorts(rig, ctx, put):
    _lazy()
    pm = M('shorts', ctx.col('bottom'), 0.85)
    pd = M('shorts_d', ctx.col('bottom', 0.84), 0.85)
    with put('main'):
        g.mesh_obj('shorts_seat', g.bm_lathe([(0.0, -0.136), (0.12, -0.131), (0.19, -0.100), (0.212, -0.04),
                                              (0.212, 0.02), (0.208, 0.06)], seg=48, sy=0.84, smooth_n=12,
                                             cap_top=False), pm, rig.j['hips'])
        _short_legs(rig, pm, 0.088, 0.090, 0.128, 'shorts_leg', flare=0.002)
        for n, s in (('R', -1), ('L', 1)):
            g.mesh_obj('shorts_cuff', g.bm_ring(0.093, 0.014, seg=28, segr=8, rz=1.2), pd, rig.j['hip_' + n],
                       loc=(0, 0, -0.118))
            g.mesh_obj('shorts_pocket', g.bm_box(0.010, 0.060, 0.055, bevel=0.006), pd, rig.j['hip_' + n],
                       loc=(s * 0.088, -0.005, -0.055), rot=(0, s * 6, 0))
        g.mesh_obj('shorts_band', g.bm_ring(0.210, 0.016, seg=56, segr=8, sy=0.84, rz=1.3), pd, rig.j['hips'],
                   loc=(0, 0, 0.050))


# =========================================================================== small accessories

@part('tourist_camera', 'neck', 'body', {'main': sub(None, Z['necklace'])}, tags=['beach', 'tourist'],
      ages=['adult', 'elder'], label={'ko': '목에 건 카메라', 'en': 'tourist camera'})
def b_tourist_camera(rig, ctx, put):
    _lazy()
    with put('main'):
        strap = M('cam_strap', '#3A3440', 0.6)
        for s in (-1, 1):
            g.mesh_obj('cam_strap', g.bm_tube_path(vd.catmull3([(s * 0.11, -0.04, 0.12), (s * 0.12, -0.15, 0.06),
                                                                (s * 0.075, -0.205, -0.03)], 10), 0.008, segr=6,
                                                   side_ref=(1, 0, 0), flat=1.6), strap, rig.j['chest'])
        body = M('cam_body', '#2E2C34', 0.45)
        g.mesh_obj('cam_body', g.bm_box(0.118, 0.052, 0.074, bevel=0.012), body, rig.j['chest'],
                   loc=(0, -0.232, -0.06), rot=(-8, 0, 0))
        g.mesh_obj('cam_top', g.bm_box(0.120, 0.050, 0.020, bevel=0.006), M('cam_silver', '#C9CED6', 0.3, metal=0.6),
                   rig.j['chest'], loc=(0, -0.232, -0.018), rot=(-8, 0, 0))
        g.mesh_obj('cam_lens', g.bm_cyl(0.030, 0.027, 0.045, seg=20), M('cam_lens', '#5A5F6A', 0.25, metal=0.5),
                   rig.j['chest'], loc=(0.008, -0.255, -0.062), rot=(98, 0, 0))
        g.mesh_obj('cam_glass', g.bm_ellipsoid(0.020, 0.006, 0.020, 12, 6), M('cam_glass', '#3D5A80', 0.05),
                   rig.j['chest'], loc=(0.008, -0.302, -0.068), rot=(-8, 0, 0))
        g.mesh_obj('cam_dot', g.bm_ellipsoid(0.008, 0.005, 0.008, 8, 6), M('cam_red', '#E04848', 0.3), rig.j['chest'],
                   loc=(-0.042, -0.262, -0.032))


@part('lifeguard_top', 'top', 'body', {'main': sub('top', Z['top']), 'marks': sub(None, Z['top_detail'])},
      tags=['beach', 'job'], ages=['adult'], label={'ko': '구조요원 민소매', 'en': 'lifeguard tank top'})
def b_lifeguard_top(rig, ctx, put):
    _lazy()
    m = M('lg_top', ctx.col('top'), 0.6)
    with put('main'):
        bm = g.bm_lathe(RASH, seg=56, sy=0.85, smooth_n=26, cap_top=False)
        # tank: arm holes cut at the sides, scoop neck
        kill_faces(bm, lambda c: (c.z > 0.255 and abs(math.sin(math.radians(ang_front(c)))) > 0.72) or
                   (c.z > 0.345 and abs(math.cos(math.radians(ang_front(c)))) > 0.55 and c.z > 0.36 +
                    0.04 * abs(math.sin(math.radians(ang_front(c))))))
        g.mesh_obj('lg_body', bm, m, rig.j['spine'])
    with put('marks'):
        w = M('lg_cross', '#FBFAF6', 0.5)
        y = M('lg_pipe', '#F2C230', 0.5)
        for side, yy, zz in ((-1, -0.180, 0.17), (1, 0.180, 0.18)):
            g.mesh_obj('lg_cross_v', g.bm_box(0.036, 0.012, 0.110, bevel=0.005), w, rig.j['spine'],
                       loc=(0.0, yy + side * 0.010, zz), rot=(side * 6, 0, 0))
            g.mesh_obj('lg_cross_h', g.bm_box(0.110, 0.012, 0.036, bevel=0.005), w, rig.j['spine'],
                       loc=(0.0, yy + side * 0.010, zz), rot=(side * 6, 0, 0))
        g.mesh_obj('lg_hem', g.bm_ring(0.224, 0.010, seg=56, segr=6, sy=0.85), y, rig.j['spine'], loc=(0, 0, -0.074))


@part('whistle', 'neck', 'body', {'main': sub(None, Z['necklace'])}, tags=['beach', 'job'], ages=['adult'],
      label={'ko': '호루라기', 'en': 'whistle'})
def b_whistle(rig, ctx, put):
    _lazy()
    with put('main'):
        cord = M('wh_cord', '#F2C230', 0.5)
        for s in (-1, 1):
            g.mesh_obj('wh_cord', g.bm_tube_path(vd.catmull3([(s * 0.11, -0.03, 0.12), (s * 0.10, -0.16, 0.05),
                                                              (s * 0.02, -0.215, -0.05)], 10), 0.0065, segr=6),
                       cord, rig.j['chest'])
        g.mesh_obj('whistle', g.bm_capsule(0.018, 0.045, seg=14, rings=5), M('wh_body', '#E8E8EC', 0.18, metal=0.85),
                   rig.j['chest'], loc=(0.0, -0.228, -0.05), rot=(0, 80, 0))
        g.mesh_obj('whistle_ring', g.bm_ring(0.012, 0.004, seg=12, segr=5), cord, rig.j['chest'],
                   loc=(0.0, -0.226, -0.045), rot=(90, 0, 0))


@part('rescue_tube', 'bag', 'body', {'tube': sub(None, Z3['tube_back']), 'strap': sub(None, Z['bag_front'])},
      tags=['beach', 'job'], ages=['adult'], label={'ko': '구조 튜브', 'en': 'rescue tube'})
def b_rescue_tube(rig, ctx, put):
    _lazy()
    with put('strap'):
        g.mesh_obj('rt_strap', g.bm_ring(0.224, 0.013, seg=64, segr=8, sy=0.86, rz=1.7),
                   M('rt_strap', '#2B2F3A', 0.6), rig.j['spine'], loc=(0, 0, 0.19), rot=(0, 42, 0))
    with put('tube'):
        red = M('rt_tube', '#E23A2E', 0.55)
        pts = [(-0.20, 0.215, 0.36), (-0.05, 0.255, 0.20), (0.10, 0.255, 0.02), (0.22, 0.225, -0.12)]
        g.mesh_obj('rt_tube', g.bm_tube_path(vd.catmull3(pts, 16), 0.052, segr=14), red, rig.j['spine'])
        blk = M('rt_clip', '#2B2F3A', 0.5)
        for p in (pts[0], pts[-1]):
            g.mesh_obj('rt_end', g.bm_ellipsoid(0.040, 0.040, 0.040, 10, 8), blk, rig.j['spine'], loc=p)
        g.mesh_obj('rt_word', g.bm_box(0.12, 0.012, 0.036, bevel=0.006), M('rt_white', '#FBFAF6', 0.5), rig.j['spine'],
                   loc=(0.02, 0.305, 0.10), rot=(0, -45, 0))


# =========================================================================== hotel / job outfits

def _cuff_bands(rig, put, mat, prefix='cuff', r=0.074, tube=0.016):
    for n in ('R', 'L'):
        with put(prefix + '_' + n):
            g.mesh_obj(prefix + '_' + n, g.bm_ring(r, tube, seg=28, segr=8, rz=1.8), mat, rig.j['el_' + n],
                       loc=(0, 0, -cb.FOREARM + 0.030))


BELLHOP = [(0.236, -0.025), (0.233, 0.03), (0.217, 0.10), (0.212, 0.22), (0.199, 0.31), (0.158, 0.39),
           (0.07, 0.45), (0.0, 0.46)]


@part('bellhop_jacket', 'top', 'body', {'main': sub('top', Z['top']), 'gold': sub(None, Z['top_detail'] + 0.2),
                                        'cuff_R': follow(None, 'arm_R'), 'cuff_L': follow(None, 'arm_L')},
      tags=['job', 'hotel'], ages=['adult'], label={'ko': '벨보이 재킷', 'en': 'bellhop jacket'})
def b_bellhop_jacket(rig, ctx, put):
    _lazy()
    m = M('bellhop', ctx.col('top'), 0.62)
    gold = M('gold', GOLD, 0.28, metal=0.75)
    with put('main'):
        g.mesh_obj('bh_body', g.bm_lathe(BELLHOP, seg=52, sy=0.86, smooth_n=26, cap_top=False), m, rig.j['spine'])
        g.mesh_obj('bh_collar', g.bm_lathe([(0.144, 0.0), (0.140, 0.04), (0.134, 0.070)], seg=40, sy=0.92,
                                           smooth_n=6, cap_top=False, cap_bottom=False), m, rig.j['chest'],
                   loc=(0, 0.012, 0.074))
        for s in (-1, 1):
            g.mesh_obj('bh_board', g.bm_box(0.085, 0.060, 0.016, bevel=0.007), M('bellhop_d', ctx.col('top', 0.8), 0.6),
                       rig.j['chest'], loc=(s * 0.128, 0.0, 0.066), rot=(0, s * -24, 0))
    with put('gold'):
        g.mesh_obj('bh_collar_trim', g.bm_ring(0.136, 0.0085, seg=40, segr=6, sy=0.92), gold, rig.j['chest'],
                   loc=(0, 0.012, 0.145))
        g.mesh_obj('bh_hem_trim', g.bm_ring(0.237, 0.009, seg=56, segr=6, sy=0.86), gold, rig.j['spine'],
                   loc=(0, 0, -0.020))
        for s in (-1, 1):
            for z in (0.03, 0.11, 0.19, 0.27):
                p, _ = surf_pt(BELLHOP, 0.86, s * 22, z, 0.004)
                g.mesh_obj('bh_button', g.bm_ellipsoid(0.016, 0.010, 0.016, 10, 6), gold, rig.j['spine'], loc=p)
            g.mesh_obj('bh_board_trim', g.bm_box(0.090, 0.064, 0.008, bevel=0.003), gold, rig.j['chest'],
                       loc=(s * 0.130, 0.0, 0.076), rot=(0, s * -24, 0))
        # braid loops across the chest (frogging) between the button rows
        for z in (0.07, 0.15, 0.23):
            pts = [surf_pt(BELLHOP, 0.86, a, z, 0.006)[0] for a in (-22, -11, 0, 11, 22)]
            g.mesh_obj('bh_frog', g.bm_tube_path(pts, 0.006, segr=6), gold, rig.j['spine'])
    _cuff_bands(rig, put, gold)


VEST = [(0.233, -0.065), (0.229, 0.0), (0.219, 0.10), (0.215, 0.22), (0.203, 0.31), (0.163, 0.39), (0.112, 0.43)]


@part('hotel_vest', 'top', 'body', {'shirt': sub('top2', Z3['shirt_under']), 'main': sub('top', Z3['vest_over']),
                                    'bow': sub('acc2', Z['job_detail']), 'badge': sub(None, Z['job_detail'] + 0.5)},
      tags=['job', 'hotel'], ages=['adult'], label={'ko': '호텔 조끼 정장', 'en': 'hotel waistcoat'})
def b_hotel_vest(rig, ctx, put):
    _lazy()
    with put('shirt'):
        sh = M('shirt', ctx.col('top2'), 0.6)
        tp._torso(tp.SHIRT, sh, rig, sy=0.84)
        for s in (-1, 1):
            g.mesh_obj('collar', g.bm_ellipsoid(0.052, 0.020, 0.032, 12, 8), sh, rig.j['chest'],
                       loc=(s * 0.044, -0.124, 0.086), rot=(38, s * 20, s * 32))
    with put('main'):
        m = M('vest', ctx.col('top'), 0.62)
        bm = g.bm_lathe(VEST, seg=56, sy=0.88, smooth_n=20, cap_top=False, cap_bottom=False)
        kill_faces(bm, lambda c: abs(ang_front(c)) < 34 * max(0.0, min(1.0, (c.z - 0.12) / 0.26)))
        g.mesh_obj('vest_body', bm, m, rig.j['spine'])
        g.mesh_obj('vest_point', vd.sector_lathe([(0.236, -0.10), (0.233, -0.06)], keep_deg=26, sy=0.88), m,
                   rig.j['spine'])
        btn = M('vest_btn', ctx.col('top', 0.5), 0.35)
        for z in (-0.03, 0.03, 0.09):
            p, _ = surf_pt(VEST, 0.88, 0, z, 0.006)
            g.mesh_obj('button', g.bm_ellipsoid(0.014, 0.009, 0.014, 10, 6), btn, rig.j['spine'], loc=p)
        for s in (-1, 1):
            p, _ = surf_pt(VEST, 0.88, s * 34, 0.02, 0.004)
            g.mesh_obj('welt', g.bm_box(0.06, 0.010, 0.010, bevel=0.003), M('vest_d', ctx.col('top', 0.75), 0.6),
                       rig.j['spine'], loc=p, rot=(0, 0, s * 30))
    with put('bow'):
        bt = M('bow', ctx.col('acc2'), 0.45)
        for s in (-1, 1):
            g.mesh_obj('bow_w', g.bm_ellipsoid(0.040, 0.016, 0.025, 12, 8), bt, rig.j['chest'],
                       loc=(s * 0.036, -0.142, 0.070), rot=(0, s * -12, 0))
        g.mesh_obj('bow_k', g.bm_ellipsoid(0.015, 0.016, 0.017, 10, 6), bt, rig.j['chest'], loc=(0, -0.152, 0.070))
    with put('badge'):
        p, _ = surf_pt(VEST, 0.88, -38, 0.22, 0.008)
        g.mesh_obj('badge', g.bm_box(0.060, 0.010, 0.022, bevel=0.004), M('badge', GOLD, 0.28, metal=0.75),
                   rig.j['spine'], loc=p, rot=(-6, 0, 36))


PARTS['hotel_vest'].sleeves = 'top2'

DOORMAN = [(0.300, -0.27), (0.286, -0.16), (0.262, -0.05), (0.234, 0.05), (0.217, 0.14), (0.211, 0.22),
           (0.198, 0.31), (0.157, 0.39), (0.07, 0.45), (0.0, 0.46)]


@part('doorman_coat', 'top', 'body', {'main': sub('top', Z['top']), 'gold': sub(None, Z['top_detail'] + 0.2),
                                      'cuff_R': follow(None, 'arm_R'), 'cuff_L': follow(None, 'arm_L')},
      tags=['job', 'hotel', 'formal'], ages=['adult'], label={'ko': '도어맨 코트', 'en': 'doorman coat'})
def b_doorman_coat(rig, ctx, put):
    _lazy()
    m = M('doorman', ctx.col('top'), 0.7)
    md = M('doorman_d', ctx.col('top', 0.8), 0.7)
    gold = M('gold', GOLD, 0.28, metal=0.75)
    with put('main'):
        g.mesh_obj('dm_body', g.bm_lathe(DOORMAN, seg=56, sy=0.86, smooth_n=28, cap_top=False), m, rig.j['spine'])
        g.mesh_obj('dm_collar', g.bm_lathe([(0.150, 0.0), (0.145, 0.045), (0.138, 0.078)], seg=40, sy=0.92,
                                           smooth_n=6, cap_top=False, cap_bottom=False), m, rig.j['chest'],
                   loc=(0, 0.012, 0.072))
        tp._legs(rig, m, thigh=0.076, shin=0.060, name='coat_under')
        g.mesh_obj('dm_overlap', vd.sector_lathe([(0.303, -0.26), (0.289, -0.16), (0.265, -0.05), (0.237, 0.05),
                                                  (0.220, 0.14), (0.214, 0.22), (0.201, 0.30)], keep_deg=5, sy=0.862,
                                                 center_deg=-12), md, rig.j['spine'])
        g.mesh_obj('dm_belt', g.bm_ring(0.238, 0.020, seg=56, segr=8, sy=0.86, rz=1.2), md, rig.j['spine'],
                   loc=(0, 0, 0.04))
    with put('gold'):
        for s in (-1, 1):
            for z in (-0.10, -0.02, 0.07, 0.16, 0.25):
                p, _ = surf_pt(DOORMAN, 0.86, s * 26, z, 0.004)
                g.mesh_obj('dm_button', g.bm_ellipsoid(0.017, 0.011, 0.017, 10, 6), gold, rig.j['spine'], loc=p)
            # epaulette with a fringe
            g.mesh_obj('dm_epaulette', g.bm_ellipsoid(0.062, 0.052, 0.018, 16, 8), gold, rig.j['chest'],
                       loc=(s * 0.140, 0.0, 0.066), rot=(0, s * -22, 0))
            for k in range(6):
                a = PI * (k / 5.0) - PI / 2
                g.mesh_obj('dm_fringe', g.bm_capsule(0.0085, 0.045, seg=8, rings=3), gold, rig.j['chest'],
                           loc=(s * (0.170 + 0.012 * math.cos(a)), 0.045 * math.sin(a), 0.052), rot=(0, s * -30, 0))
        g.mesh_obj('dm_collar_trim', g.bm_ring(0.140, 0.008, seg=40, segr=6, sy=0.92), gold, rig.j['chest'],
                   loc=(0, 0.012, 0.150))
        # aiguillette: braided cord looping from the right shoulder across the chest
        pts = [(-0.150, -0.05, 0.060), (-0.150, -0.150, 0.000), (-0.095, -0.192, -0.090), (-0.020, -0.200, -0.060),
               (-0.060, -0.190, 0.020), (-0.140, -0.120, 0.050)]
        g.mesh_obj('dm_aiguillette', g.bm_tube_path(vd.catmull3(pts, 20), 0.0075, segr=6), gold, rig.j['chest'])
        g.mesh_obj('dm_buckle', g.bm_box(0.05, 0.016, 0.036, bevel=0.005), gold, rig.j['spine'],
                   loc=(0, -0.206, 0.04))
    _cuff_bands(rig, put, gold, r=0.076, tube=0.018)


PARTS['doorman_coat'].sleeves = 'top'

HK_DRESS = [(0.292, -0.24), (0.276, -0.12), (0.246, -0.01), (0.218, 0.10), (0.210, 0.22), (0.197, 0.31),
            (0.156, 0.39), (0.07, 0.45), (0.0, 0.46)]


@part('housekeeper_dress', 'top', 'body', {'main': sub('top', Z['top']), 'apron': sub(None, Z['apron'])},
      tags=['job', 'hotel', 'dress'], ages=['adult'], label={'ko': '청소원 원피스', 'en': 'housekeeping dress'})
def b_housekeeper_dress(rig, ctx, put):
    _lazy()
    m = M('hk_dress', ctx.col('top'), 0.8)
    with put('main'):
        g.mesh_obj('hk_body', g.bm_lathe(HK_DRESS, seg=56, sy=0.86, smooth_n=28, cap_top=False), m, rig.j['spine'])
        tp._legs(rig, m, thigh=0.074, shin=0.062, name='hk_under')
        btn = M('hk_btn', ctx.col('top', 0.6), 0.4)
        for z in (0.22, 0.29):
            p, _ = surf_pt(HK_DRESS, 0.86, 0, z, 0.004)
            g.mesh_obj('button', g.bm_ellipsoid(0.013, 0.008, 0.013, 10, 6), btn, rig.j['spine'], loc=p)
    with put('apron'):
        w = M('hk_apron', '#F7F5F0', 0.75)
        g.mesh_obj('hk_apron', vd.sector_lathe([(0.296, -0.22), (0.280, -0.10), (0.252, 0.0), (0.226, 0.10),
                                                (0.218, 0.15)], keep_deg=52, sy=0.875), w, rig.j['spine'])
        frill = g.bm_ring(0.296, 0.016, seg=60, segr=6, sy=0.875, tufts=18, bump=0.35, u0=PI * (0.5 - 0.29),
                          u1=PI * (0.5 + 0.29), closed=False)
        g.bm_transform(frill, Matrix.Rotation(PI, 4, 'Z'))
        g.mesh_obj('hk_frill', frill, w, rig.j['spine'], loc=(0, 0, -0.218))
        g.mesh_obj('hk_bib', vd.sector_lathe([(0.222, 0.12), (0.216, 0.22), (0.206, 0.29)], keep_deg=30, sy=0.88), w,
                   rig.j['spine'])
        for s in (-1, 1):
            g.mesh_obj('hk_strap', g.bm_tube_path([(s * 0.075, -0.180, 0.28), (s * 0.095, -0.12, 0.39),
                                                   (s * 0.10, 0.02, 0.42), (s * 0.08, 0.17, 0.25)], 0.011, segr=6,
                                                  side_ref=(1, 0, 0), flat=2.0), w, rig.j['spine'])
            g.mesh_obj('hk_collar', g.bm_ellipsoid(0.058, 0.022, 0.034, 14, 8), w, rig.j['chest'],
                       loc=(s * 0.052, -0.118, 0.084), rot=(30, s * 18, s * 22))
        g.mesh_obj('hk_tie', g.bm_ring(0.222, 0.011, seg=56, segr=6, sy=0.875), w, rig.j['spine'], loc=(0, 0, 0.12))
        for s in (-1, 1):
            g.mesh_obj('hk_bow', g.bm_ellipsoid(0.055, 0.022, 0.036, 12, 8), w, rig.j['spine'],
                       loc=(s * 0.050, 0.200, 0.125), rot=(0, s * -15, 0))
            g.mesh_obj('hk_bow_tail', g.bm_box(0.030, 0.010, 0.11, bevel=0.006), w, rig.j['spine'],
                       loc=(s * 0.026, 0.204, 0.045), rot=(6, s * 12, 0))
        g.mesh_obj('hk_pocket', vd.sector_lathe([(0.272, -0.11), (0.262, -0.05)], keep_deg=18, sy=0.875,
                                                center_deg=26), M('hk_apron_d', '#E8E4DA', 0.75), rig.j['spine'])


PARTS['housekeeper_dress'].dress = True
PARTS['housekeeper_dress'].sleeves = 'top'

VENDOR = [(0.240, -0.088), (0.236, -0.03), (0.218, 0.10), (0.213, 0.22), (0.200, 0.31), (0.158, 0.39),
          (0.07, 0.45), (0.0, 0.46)]


@part('vendor_shirt', 'top', 'body', {'main': sub('top', Z['top']), 'stripe': sub('top2', Z['top'] + 0.3),
                                      'apron': sub('acc', Z['apron']), 'bow': sub('acc2', Z['job_detail']),
                                      'cuff_R': follow('top', 'arm_R'), 'cuff_L': follow('top', 'arm_L')},
      tags=['job', 'beach'], ages=['adult', 'elder'], label={'ko': '아이스크림 장수 셔츠', 'en': 'ice-cream vendor shirt'})
def b_vendor_shirt(rig, ctx, put):
    _lazy()
    m = M('vendor', ctx.col('top'), 0.7)
    with put('main'):
        g.mesh_obj('vd_body', g.bm_lathe(VENDOR, seg=56, sy=0.86, smooth_n=26, cap_top=False), m, rig.j['spine'])
        for s in (-1, 1):
            g.mesh_obj('collar', g.bm_ellipsoid(0.056, 0.020, 0.034, 12, 8), m, rig.j['chest'],
                       loc=(s * 0.048, -0.122, 0.084), rot=(36, s * 20, s * 30))
    with put('stripe'):
        st = M('vendor_s', ctx.col('top2'), 0.7)
        for k in range(18):
            a = -180 + 20 * k + 10
            g.mesh_obj('vd_stripe', vd.sector_lathe([(prof_r(VENDOR, z) + 0.003, z) for z in
                                                     (-0.088, -0.03, 0.10, 0.22, 0.31)], keep_deg=4.2, seg=180,
                                                    sy=0.862, center_deg=a), st, rig.j['spine'])
    with put('apron'):
        tp._apron(rig, ctx, 'acc', keep=50, hem=-0.17, bib=True)
    with put('bow'):
        bt = M('bow', ctx.col('acc2'), 0.45)
        for s in (-1, 1):
            g.mesh_obj('bow_w', g.bm_ellipsoid(0.040, 0.016, 0.025, 12, 8), bt, rig.j['chest'],
                       loc=(s * 0.036, -0.142, 0.072), rot=(0, s * -12, 0))
        g.mesh_obj('bow_k', g.bm_ellipsoid(0.015, 0.016, 0.017, 10, 6), bt, rig.j['chest'], loc=(0, -0.152, 0.072))
    _short_sleeves(rig, put, m, r=0.094, length=0.098)


PARTS['vendor_shirt'].sleeves = 'skin'


@part('bar_apron', 'apron', 'body', {'main': sub('acc', Z['apron'])}, tags=['job', 'beach'], ages=['adult'],
      label={'ko': '허리 앞치마', 'en': 'waist apron'})
def b_bar_apron(rig, ctx, put):
    _lazy()
    am = M('bar_apron', ctx.col('acc'), 0.85)
    with put('main'):
        g.mesh_obj('ba_apron', vd.sector_lathe([(0.300, -0.20), (0.275, -0.10), (0.255, -0.02), (0.250, 0.02)],
                                               keep_deg=58, sy=0.88), am, rig.j['spine'])
        g.mesh_obj('ba_tie', g.bm_ring(0.252, 0.012, seg=56, segr=6, sy=0.88, rz=1.6), am, rig.j['spine'],
                   loc=(0, 0, 0.015))
        g.mesh_obj('ba_pocket', vd.sector_lathe([(0.284, -0.13), (0.272, -0.07)], keep_deg=30, sy=0.88),
                   M('bar_apron_d', ctx.col('acc', 0.82), 0.85), rig.j['spine'])
        g.mesh_obj('ba_opener', g.bm_box(0.014, 0.010, 0.060, bevel=0.004), M('opener', '#C9CED6', 0.25, metal=0.8),
                   rig.j['spine'], loc=(0.04, -0.262, -0.095), rot=(-8, 0, 8))


# =========================================================================== anim props

BOARD_L, BOARD_W, BOARD_T = 0.80, 0.215, 0.036       # half length / half width / half thickness (adult)


def board_scale(age):
    return {'child': 0.80, 'elder': 1.0}.get(age, 1.0)


def _board_bm(wide=1.0, lift=0.0, sx=1.0):
    bm = g.bm_ellipsoid(BOARD_W * wide, BOARD_L, BOARD_T, 40, 16)
    for v in bm.verts:
        t = v.co.y / BOARD_L                      # -1 nose .. +1 tail
        if t < 0:
            v.co.x *= 1.0 - 0.55 * t * t          # pointed nose
        else:
            v.co.x *= 1.0 - 0.25 * t ** 4         # squash tail
        v.co.z += 0.07 * max(0.0, -t) ** 2.2 + 0.012 * t * t + lift   # nose rocker
        v.co.x *= sx
    return bm


@part('surfboard', 'board', 'body', {'main': sub('board', Z3['board']), 'stripe': sub('board2', Z3['board_stripe'])},
      tags=['beach', 'prop', 'surf'], label={'ko': '서프보드', 'en': 'surfboard'})
def b_surfboard(rig, ctx, put):
    """On the item joint 'board_item' (bf_render.place_items3: under the feet, nose along the heading)."""
    _lazy()
    j = _ensure_item(rig, 'board_item')
    with put('main'):
        g.mesh_obj('board', _board_bm(), M('board', ctx.col('board'), 0.22), j)
        for x in (-0.07, 0.07):
            g.mesh_obj('fin', g.bm_slab([(0.0, 0.0), (0.06, 0.0), (0.02, -0.07)], 0.010, bevel=0.003),
                       M('fin', '#2B2F3A', 0.4), j, loc=(x, BOARD_L * 0.70, -BOARD_T * 0.5), rot=(0, 0, 90))
    with put('stripe'):
        sm = M('board_s', ctx.col('board2'), 0.22)
        bm = _board_bm(0.16, lift=0.0028)
        kill_faces(bm, lambda c: c.z < 0.012 + 0.07 * max(0.0, -c.y / BOARD_L) ** 2.2)
        g.mesh_obj('board_stripe', bm, sm, j)
        for x in (-1, 1):
            rail = _board_bm(1.0, lift=0.0018)
            kill_faces(rail, lambda c, x=x: c.z < 0.006 + 0.07 * max(0.0, -c.y / BOARD_L) ** 2.2 or c.x * x < BOARD_W * 0.78)
            g.mesh_obj('board_rail', rail, sm, j)


@part('toy_spade', 'hand', 'body', {'main': dict(sub('toy', Z3['item']), zfrontFollow='hand_R')},
      tags=['beach', 'prop', 'item'], label={'ko': '모래삽', 'en': 'toy spade'})
def b_toy_spade(rig, ctx, put):
    """On the item joint 'spade_item' (right fist; blade pointing forward / down)."""
    _lazy()
    j = _ensure_item(rig, 'spade_item')
    tm = M('toy', ctx.col('toy'), 0.3)
    with put('main'):
        g.mesh_obj('spade_handle', g.bm_cyl(0.014, 0.013, 0.17, seg=10), tm, j, loc=(0, 0, -0.03))
        g.mesh_obj('spade_grip', g.bm_capsule(0.016, 0.07, seg=10, rings=4), tm, j, loc=(0.035, 0, 0.13),
                   rot=(0, 90, 0))
        blade = g.bm_ellipsoid(0.055, 0.018, 0.068, 16, 8)
        for v in blade.verts:
            v.co.y += 0.25 * (v.co.x / 0.055) ** 2 * 0.03         # scoop curve
        g.mesh_obj('spade_blade', blade, tm, j, loc=(0, 0, -0.085))


# =========================================================================== head parts

HAT = sub('hat', Z['hat'])
HAT2 = sub('hat2', Z['hat_detail'])
HATFIX = sub(None, Z['hat_detail'])


def _cap_edge(x, y):
    front = cb.smoothstep(-0.5, 0.6, -y)
    return 0.30 * front - 0.36 * (1 - front) + 0.04 * abs(x) * front


@part('swim_cap', 'hat', 'head', {'main': HAT, 'stripe': HAT2}, cls='full', tags=['beach', 'swimwear'],
      label={'ko': '수영모', 'en': 'swim cap'})
def b_swim_cap(rig, ctx, put):
    _lazy()
    with put('main'):
        cb.cap_shell(rig, M('swimcap', ctx.col('hat'), 0.22), _cap_edge, base=1.075, inner=0.90, puff=0.04,
                     name='swimcap', soft=0.025)
    with put('stripe'):
        sm = M('swimcap_s', ctx.col('hat2'), 0.22)
        for x0 in (-0.30, 0.30):
            pts = []
            for k in range(15):
                t = 0.42 + (PI - 0.25 - 0.42) * k / 14
                d = Vector((x0, -math.cos(t), math.sin(t))).normalized()
                rx, ry, rz = tb.HEAD_R
                pts.append(Vector((d.x * rx, d.y * ry, d.z * rz)) * 1.085 + Vector((0, 0, tb.HEAD_C)))
            g.mesh_obj('swimcap_stripe', g.bm_tube_path(pts, 0.016, segr=8), sm, rig.j['head'])


@part('swim_cap_flower', 'hat', 'head', {'main': HAT, 'deco': HAT2}, cls='full', tags=['beach', 'swimwear', 'flower'],
      label={'ko': '꽃 수영모', 'en': 'flowery swim cap'})
def b_swim_cap_flower(rig, ctx, put):
    _lazy()
    import tf2_parts as tp2
    with put('main'):
        cb.cap_shell(rig, M('swimcap', ctx.col('hat'), 0.3), _cap_edge, base=1.075, inner=0.90, puff=0.04,
                     name='swimcap', soft=0.025)
    with put('deco'):
        fm = M('swimcap_petal', ctx.col('hat2'), 0.35)
        cm = M('swimcap_c', ctx.col('hat2', 0.8), 0.35)
        k = 0
        for el in (0.30, 0.62, 0.98, 1.32):
            n = {0.30: 8, 0.62: 7, 0.98: 5, 1.32: 2}[el]
            for i in range(n):
                az = TAU * i / n + 0.4 * el
                if el < 0.4 and abs(math.cos(az)) > 0.82 and math.cos(az) > 0:      # keep the forehead clear
                    continue
                p, nrm = cb.head_point(az, el, out=0.035)
                if p.z < -0.05:
                    continue
                q = (-nrm).to_track_quat('Y', 'Z')
                g.mesh_obj('cap_flower', tp2.flower_bm(0.042, 6, cup=0.6, depth=0.35, seed=0.6 * k), fm, rig.j['head'],
                           loc=(p.x, p.y, p.z + tb.HEAD_C), rot=q)
                pc, _ = cb.head_point(az, el, out=0.052)
                g.mesh_obj('cap_flower_c', g.bm_ellipsoid(0.013, 0.013, 0.013, 8, 6), cm, rig.j['head'],
                           loc=(pc.x, pc.y, pc.z + tb.HEAD_C))
                k += 1


@part('straw_hat', 'hat', 'head', {'main': HATFIX, 'band': HAT2}, cls='full', tags=['beach', 'sun'],
      label={'ko': '밀짚모자', 'en': 'straw hat'})
def b_straw_hat(rig, ctx, put):
    _lazy()
    straw = M('straw', '#E6C887', 0.85)
    straw_d = M('straw_d', '#D4AE6A', 0.88)
    with put('main'):
        cb.cap_shell(rig, straw, lambda x, y: 0.26 - 0.14 * y, base=1.13, puff=0.0, name='crown_base', soft=0.03)
        crown = g.bm_lathe([(0.282, 0.0), (0.288, 0.09), (0.270, 0.165), (0.150, 0.198), (0.0, 0.205)], seg=48,
                           sy=0.96, smooth_n=16, cap_bottom=False)
        for v in crown.verts:                                  # woven rows
            v.co.x *= 1 + 0.010 * math.sin(v.co.z * 140)
            v.co.y *= 1 + 0.010 * math.sin(v.co.z * 140)
        vd.ho(rig, 'crown', crown, straw, loc=(0, 0.01, 0.17), rot=(-7, 0, 0))
        prof = []
        for k in range(12):
            r = 0.28 + 0.25 * k / 11
            prof.append((r, -0.004 - 0.05 * ((r - 0.28) / 0.25) ** 1.6 + 0.004 * math.sin(k * PI)))
        brim = g.bm_lathe(prof + [(0.535, -0.062), (0.52, -0.070)] + [(r, z - 0.012) for r, z in prof[::-1]], seg=64,
                          sy=1.0, cap_top=False, cap_bottom=False)
        vd.ho(rig, 'brim', brim, straw, loc=(0, 0.01, 0.17), rot=(-8, 0, 0))
        for r in (0.315, 0.355, 0.395, 0.435, 0.475):
            zr = -0.004 - 0.05 * ((r - 0.28) / 0.25) ** 1.6 + 0.004
            ring = g.bm_ring(r, 0.0055, seg=72, segr=5, rz=0.7)
            vd.ho(rig, 'brim_row', ring, straw_d, loc=(0, 0.01, 0.17 + zr), rot=(-8, 0, 0))
        for zc in (0.04, 0.09, 0.14):
            vd.ho(rig, 'crown_row', g.bm_ring(prof_r([(0.282, 0.0), (0.288, 0.09), (0.270, 0.165)], zc) + 0.002, 0.005,
                                              seg=64, segr=5, sy=0.96, rz=0.7), straw_d, loc=(0, 0.01, 0.17 + zc),
                  rot=(-7, 0, 0))
        vd.ho(rig, 'brim_edge', g.bm_ring(0.525, 0.012, seg=64, segr=6), straw_d, loc=(0, 0.01, 0.17 - 0.064),
              rot=(-8, 0, 0))
    with put('band'):
        bm_ = M('straw_band', ctx.col('hat2'), 0.6)
        vd.ho(rig, 'band', g.bm_ring(0.288, 0.030, seg=56, segr=8, sy=0.96, rz=1.2), bm_, loc=(0, 0.01, 0.20),
              rot=(-7, 0, 0))
        for s in (-1, 1):
            vd.ho(rig, 'band_bow', g.bm_ellipsoid(0.034, 0.014, 0.024, 10, 6), bm_,
                  loc=(0.285, 0.06 + s * 0.035, 0.205), rot=(0, 0, 70 + s * 20))
        vd.ho(rig, 'band_tail', g.bm_box(0.014, 0.028, 0.075, bevel=0.005), bm_, loc=(0.29, 0.085, 0.16),
              rot=(10, 0, 0))


@part('sun_hat_wide', 'hat', 'head', {'main': HAT, 'ribbon': HAT2}, cls='full', tags=['beach', 'sun'],
      label={'ko': '챙 넓은 모자', 'en': 'wide sun hat'})
def b_sun_hat_wide(rig, ctx, put):
    _lazy()
    m = M('sunhat', ctx.col('hat'), 0.9)
    with put('main'):
        cb.cap_shell(rig, m, lambda x, y: 0.24 - 0.14 * y, base=1.13, puff=0.02, name='crown_base', soft=0.03)
        crown = g.bm_lathe([(0.284, 0.0), (0.290, 0.07), (0.262, 0.135), (0.13, 0.160), (0.0, 0.163)], seg=48,
                           sy=0.97, smooth_n=14, cap_bottom=False)
        vd.ho(rig, 'crown', crown, m, loc=(0, 0.01, 0.165), rot=(-6, 0, 0))
        prof = [(0.28, 0.004), (0.36, -0.012), (0.44, -0.040), (0.52, -0.080), (0.56, -0.106), (0.565, -0.118),
                (0.52, -0.094), (0.44, -0.054), (0.36, -0.024), (0.28, -0.008)]
        brim = g.bm_lathe(prof, seg=96, sy=1.0, cap_top=False, cap_bottom=False)
        for v in brim.verts:                                   # floppy waves
            r = math.hypot(v.co.x, v.co.y)
            a = math.atan2(v.co.y, v.co.x)
            k = max(0.0, (r - 0.30) / 0.26)
            v.co.z += k * (0.030 * math.sin(5 * a + 0.6) - 0.018 * max(0.0, math.sin(a)))
        vd.ho(rig, 'brim', brim, m, loc=(0, 0.01, 0.17), rot=(-7, 0, 0))
    with put('ribbon'):
        rm = M('sunhat_ribbon', ctx.col('hat2'), 0.5)
        vd.ho(rig, 'ribbon', g.bm_ring(0.290, 0.032, seg=56, segr=8, sy=0.97, rz=1.25), rm, loc=(0, 0.01, 0.195),
              rot=(-6, 0, 0))
        for s in (-1, 1):
            vd.ho(rig, 'ribbon_bow', g.bm_ellipsoid(0.060, 0.022, 0.036, 12, 8), rm,
                  loc=(s * 0.055, 0.29, 0.205), rot=(0, s * -18, 0))
            pts = [(s * 0.03, 0.30, 0.18), (s * 0.06, 0.36, 0.08), (s * 0.08, 0.39, -0.04)]
            vd.ho(rig, 'ribbon_tail', g.bm_tube_path(vd.catmull3(pts, 10), 0.014, segr=6, side_ref=(1, 0, 0), flat=2.2),
                  rm)
        vd.ho(rig, 'ribbon_knot', g.bm_ellipsoid(0.026, 0.022, 0.026, 10, 6), rm, loc=(0, 0.298, 0.205))


@part('sunglasses', 'glasses', 'head', {'main': sub('glasses', Z['glasses']), 'lens': sub(None, Z['glasses'] + 0.3)},
      tags=['beach', 'sun'], label={'ko': '선글라스', 'en': 'sunglasses'})
def b_sunglasses(rig, ctx, put):
    _lazy()
    eu, ev = 0.116, -0.026
    with put('main'):
        fm = M('sg_frame', ctx.col('glasses'), 0.25)
        for s in (-1, 1):
            rr = vf._round_rect(s * eu, ev, 0.082, 0.062, n=6)
            vd.face_obj(rig, 'sg_rim', vf.bm_stroke(rr, 0.0105, thick=0.016, closed=True, n=44, out=0.030), fm)
            p0, _ = vf.surf(s * (eu + 0.082), ev + 0.02, 0.030)
            p1 = cb.head_point(s * PI / 2 * 0.93, -0.02, out=0.02)[0]
            vd.ho(rig, 'sg_arm', g.bm_tube_path([p0, (p0 + p1) / 2 + Vector((0, 0, 0.012)), p1], 0.009, segr=6), fm)
        vd.face_obj(rig, 'sg_bridge', vf.bm_stroke([(-0.040, ev + 0.024), (0.0, ev + 0.034), (0.040, ev + 0.024)],
                                                  0.009, thick=0.014, out=0.030), fm)
    with put('lens'):
        lens = M('sg_lens', '#1E2633', 0.08)
        glint = M('glint', '#FFFFFF', rough=0.2, emission='#FFFFFF', emission_strength=1.2)
        for s in (-1, 1):
            rr = vf._round_rect(s * eu, ev, 0.078, 0.058, n=6)
            vd.face_obj(rig, 'sg_lens', vf.bm_blob(rr, thick=0.012, out=0.026), lens)
            vd.face_obj(rig, 'sg_glint', vf.bm_stroke([(s * eu - 0.050, ev + 0.010), (s * eu - 0.014, ev + 0.044)],
                                                      0.008, thick=0.006, out=0.040), glint)


@part('snorkel_mask', 'mask', 'head', {'main': sub('acc', Z['glasses'] + 1), 'lens': sub(None, Z['glasses'] + 1.3)},
      tags=['beach', 'swimwear'], label={'ko': '스노클 마스크', 'en': 'snorkel mask'})
def b_snorkel_mask(rig, ctx, put):
    _lazy()
    ev = -0.020
    with put('main'):
        am = M('mask_frame', ctx.col('acc'), 0.35)
        outline = vf._round_rect(0.0, ev, 0.205, 0.092, n=8)
        vd.face_obj(rig, 'mask_frame', vf.bm_stroke(outline, 0.020, thick=0.030, closed=True, n=60, out=0.040), am)
        vd.face_obj(rig, 'mask_nose', vf.bm_blob(vf.ellipse(0.0, -0.088, 0.040, 0.034, 20), thick=0.050, out=0.010),
                    M('mask_skirt', ctx.col('acc', 0.85), 0.35))
        # strap around the head (back part hidden by the head in front views)
        pts = []
        for k in range(25):
            a = -PI * 0.47 + (2 * PI * 0.47) * k / 24 + PI
            pts.append((math.sin(a) * tb.HEAD_R[0] * 1.06, -math.cos(a) * tb.HEAD_R[1] * 1.06, -0.01))
        vd.ho(rig, 'mask_strap', g.bm_tube_path(pts, 0.018, segr=6, side_ref=(0, 0, 1), flat=1.8), am)
        # snorkel on the left side, rising above the head
        tpts = [(0.215, -0.10, -0.08), (0.285, -0.02, 0.0), (0.300, 0.02, 0.18), (0.285, 0.03, 0.40)]
        vd.ho(rig, 'snorkel', g.bm_tube_path(vd.catmull3(tpts, 14), 0.022, segr=10), am)
        vd.ho(rig, 'snorkel_top', g.bm_cyl(0.030, 0.026, 0.045, seg=12), M('snorkel_top', '#F2C230', 0.35),
              loc=(0.285, 0.03, 0.39))
    with put('lens'):
        glass = M('mask_glass', '#BFE6F0', 0.05, alpha=0.38)
        inner = vf._round_rect(0.0, ev, 0.190, 0.080, n=8)
        vd.face_obj(rig, 'mask_glass', vf.bm_blob(inner, thick=0.008, out=0.038), glass)
        glint = M('glint', '#FFFFFF', rough=0.2, emission='#FFFFFF', emission_strength=1.0)
        for s in (-1, 1):
            vd.face_obj(rig, 'mask_glint', vf.bm_stroke([(s * 0.12 - 0.05, ev + 0.01), (s * 0.12 - 0.02, ev + 0.05)],
                                                        0.007, thick=0.005, out=0.052), glint)


@part('bellhop_cap', 'hat', 'head', {'main': HAT, 'gold': HATFIX}, cls='top', tags=['job', 'hotel'],
      ages=['adult', 'elder'], label={'ko': '벨보이 모자', 'en': 'pillbox cap'})
def b_bellhop_cap(rig, ctx, put):
    _lazy()
    rot = Quaternion((0, 1, 0), math.radians(-16)) @ Quaternion((1, 0, 0), math.radians(-8))
    with put('main'):
        vd.ho(rig, 'pillbox', g.bm_lathe([(0.0, 0.0), (0.150, 0.0), (0.156, 0.06), (0.152, 0.105), (0.13, 0.118),
                                          (0.0, 0.12)], seg=40, sy=0.95, smooth_n=8), M('pillbox', ctx.col('hat'), 0.6),
              loc=(0.05, 0.0, 0.27), rot=rot)
    with put('gold'):
        gold = M('gold', GOLD, 0.28, metal=0.75)
        for dz in (0.012, 0.104):
            vd.ho(rig, 'pill_band', g.bm_ring(0.154, 0.0095, seg=40, segr=6, sy=0.95),
                  gold, loc=(0.05 + 0.29 * math.sin(math.radians(-16)) * dz, 0.0, 0.27 + dz), rot=rot)
        vd.ho(rig, 'pill_button', g.bm_ellipsoid(0.026, 0.026, 0.018, 10, 6), gold, loc=(0.017, -0.012, 0.39), rot=rot)


@part('doorman_hat', 'hat', 'head', {'main': HAT, 'gold': HATFIX}, cls='full', tags=['job', 'hotel', 'formal'],
      ages=['adult', 'elder'], label={'ko': '도어맨 실크해트', 'en': 'doorman top hat'})
def b_doorman_hat(rig, ctx, put):
    _lazy()
    m = M('tophat', ctx.col('hat'), 0.45)
    with put('main'):
        cb.cap_shell(rig, m, lambda x, y: 0.30 - 0.12 * y, base=1.12, puff=0.0, name='crown_base', soft=0.03)
        crown = g.bm_lathe([(0.240, 0.0), (0.232, 0.12), (0.236, 0.25), (0.250, 0.31), (0.0, 0.315)], seg=48,
                           sy=0.94, smooth_n=10, cap_bottom=False)
        vd.ho(rig, 'tophat_crown', crown, m, loc=(0, 0.015, 0.205), rot=(-6, 0, 0))
        brim = g.bm_lathe([(0.24, 0.010), (0.33, 0.002), (0.37, 0.028), (0.375, 0.012), (0.33, -0.012), (0.24, -0.006)],
                          seg=56, sy=0.94, cap_top=False, cap_bottom=False)
        for v in brim.verts:
            a = math.atan2(v.co.y, v.co.x)
            v.co.z += 0.030 * abs(math.cos(a)) * max(0.0, (math.hypot(v.co.x, v.co.y) - 0.26) / 0.11)
        vd.ho(rig, 'tophat_brim', brim, m, loc=(0, 0.015, 0.205), rot=(-7, 0, 0))
    with put('gold'):
        vd.ho(rig, 'tophat_band', g.bm_lathe([(0.236, 0.0), (0.234, 0.05)], seg=48, sy=0.94, cap_top=False,
                                             cap_bottom=False),
              M('gold', GOLD, 0.28, metal=0.75), loc=(0, 0.015, 0.218), rot=(-6, 0, 0))
        vd.ho(rig, 'tophat_badge', g.bm_ellipsoid(0.030, 0.012, 0.026, 12, 6), M('gold', GOLD, 0.28, metal=0.75),
              loc=(0, -0.222, 0.244), rot=(-6, 0, 0))


@part('paper_cap', 'hat', 'head', {'main': HAT, 'stripe': HAT2}, cls='top', tags=['job', 'beach'],
      ages=['adult', 'elder'], label={'ko': '종이 모자', 'en': 'paper cap'})
def b_paper_cap(rig, ctx, put):
    """Folded 'soda-jerk' paper cap: a soft boat-shaped wedge sitting front-to-back on the crown."""
    _lazy()
    m = M('paper', ctx.col('hat'), 0.7)
    with put('main'):
        cap = g.bm_ellipsoid(0.115, 0.300, 0.150, 32, 16)
        kill_faces(cap, lambda c: c.z < 0.0)
        for v in cap.verts:
            v.co.x *= 1.0 - 0.55 * max(0.0, v.co.z / 0.15) ** 1.5      # pinched top fold
        vd.ho(rig, 'paper_cap', cap, m, loc=(0, 0.0, 0.245), rot=(-10, 0, 0))
        vd.ho(rig, 'paper_rim', g.bm_ring(0.10, 0.022, seg=40, segr=8, sx=1.12, sy=2.85, rz=1.0), m,
              loc=(0, 0.0, 0.255), rot=(-10, 0, 0))
    with put('stripe'):
        sm = M('paper_s', ctx.col('hat2'), 0.7)
        vd.ho(rig, 'paper_stripe', g.bm_ring(0.104, 0.014, seg=40, segr=8, sx=1.12, sy=2.85, rz=1.0), sm,
              loc=(0, 0.0, 0.292), rot=(-10, 0, 0))


@part('kerchief', 'hat', 'head', {'main': HAT, 'dots': HAT2}, cls='full', tags=['job', 'hotel'],
      label={'ko': '머릿수건', 'en': 'kerchief'})
def b_kerchief(rig, ctx, put):
    _lazy()
    with put('main'):
        m = M('kerchief', ctx.col('hat'), 0.85)
        cb.cap_shell(rig, m, lambda x, y: 0.26 - 0.30 * y - 0.06 * abs(x), base=1.10, puff=0.05, name='kerchief',
                     soft=0.025)
        vd.ho(rig, 'kerchief_knot', g.bm_ellipsoid(0.050, 0.045, 0.045, 12, 8), m, loc=(0, 0.30, -0.10))
        for s in (-1, 1):
            vd.ho(rig, 'kerchief_tail', g.bm_slab([(0.0, 0.0), (0.05, -0.02), (0.02, -0.13)], 0.012, bevel=0.004), m,
                  loc=(s * 0.03, 0.315, -0.12), rot=(0, s * 20, 90))
    with put('dots'):
        dm = M('kerchief_dot', ctx.col('hat2'), 0.85)
        for el in (0.55, 0.95, 1.30):
            n = {0.55: 10, 0.95: 7, 1.30: 3}[el]
            for i in range(n):
                az = TAU * i / n + 0.3 * el
                p, nrm = cb.head_point(az, el, out=0.034)
                if el < 0.7 and math.cos(az) > 0.7:
                    continue
                vd.ho(rig, 'kdot', place_on(decal([(0.020 * math.cos(t), 0.020 * math.sin(t))
                                                   for t in [TAU * k / 12 for k in range(12)]], 0.006), p, nrm), dm)


@part('sun_visor', 'hat', 'head', {'main': HAT, 'bill': HAT2}, cls='top', tags=['beach', 'job', 'sun'],
      label={'ko': '썬캡', 'en': 'sun visor'})
def b_sun_visor(rig, ctx, put):
    _lazy()
    with put('main'):
        cb.tilted_ring(rig, 'visor_band', M('visor', ctx.col('hat'), 0.6), tb.HEAD_R[0] * 1.05, 0.034, 0.36, 0.05,
                       sy=1.0, rz=1.6)
    with put('bill'):
        bill = g.bm_lathe([(0.0, 0.0), (0.24, 0.0), (0.25, -0.012), (0.0, -0.016)], seg=36, sy=0.86)
        for v in bill.verts:
            v.co.z -= 0.30 * (v.co.x ** 2)
        kill_faces(bill, lambda c: c.y > 0.02)
        vd.ho(rig, 'visor_bill', bill, M('visor_bill', ctx.col('hat2'), 0.4), loc=(0, -0.26, 0.112), rot=(-14, 0, 0))


# =========================================================================== item placement

SPADE_FROM_HAND = (0.0, -0.010, 0.020)


def place_items3(rig, info):
    """Re-place the item joints after every pose (call after Rig.apply + IK + head).
    info: {'yaw': body yaw deg, 'ring': bool, 'board': dict | None, 'anchor': Vector, 'age': str}."""
    import bf_anim as ba
    _lazy()
    bpy.context.view_layer.update()
    age = rig.meta.get('ch', {}).get('age', 'adult')
    cam_yaw = Quaternion((0, 0, 1), math.radians(bc.DIR_YAW['S']))
    tx, ty, tz = rig.meta.get('torso_scale', (1, 1, 1))
    if 'ring_item' in rig.j:
        j = rig.j['ring_item']
        c = rig.world('spine', (0, 0, 0.215 * tz))
        s = ring_scale(age) * (0.5 * (tx + ty))
        wobble = info.get('ring_tilt', (0.0, 0.0))
        rotw = cam_yaw @ Quaternion((1, 0, 0), math.radians(wobble[0])) @ Quaternion((0, 1, 0), math.radians(wobble[1]))
        j.matrix_world = Matrix.Translation(c) @ rotw.to_matrix().to_4x4() @ Matrix.Diagonal((s, s, s, 1.0))
    if 'board_item' in rig.j:
        j = rig.j['board_item']
        b = info.get('board') or {}
        heading = b.get('heading', 'SE')
        pitch, roll = b.get('tilt', (0.0, 0.0))
        anchor = info.get('anchor', Vector((0, 0, 0)))
        s = board_scale(age)
        rotw = Quaternion((0, 0, 1), math.radians(bc.DIR_YAW[heading])) @ Quaternion((1, 0, 0), math.radians(pitch)) \
            @ Quaternion((0, 1, 0), math.radians(roll))
        pos = Vector((anchor.x, anchor.y, b.get('z', 0.0) + ba.BOARD_TOP - BOARD_T * 1.15))
        j.matrix_world = Matrix.Translation(pos) @ rotw.to_matrix().to_4x4() @ Matrix.Diagonal((s, s, s, 1.0))
    if 'spade_item' in rig.j:
        j = rig.j['spade_item']
        hw = rig.world('hand_R', SPADE_FROM_HAND)
        yaw = Quaternion((0, 0, 1), math.radians(info.get('yaw', 0.0)))
        rotw = yaw @ Quaternion((1, 0, 0), math.radians(-35))
        s = {'child': 0.95, 'elder': 1.05}.get(age, 1.1)
        j.matrix_world = Matrix.Translation(hw) @ rotw.to_matrix().to_4x4() @ Matrix.Diagonal((s, s, s, 1.0))
    bpy.context.view_layer.update()
