"""
cf_parts.py - cityfolk parts (CONTRACT_V8 AD): firefighters, police, burglars, bank, warehouse, delivery,
movers, construction / demolition crews, reporters and detectives.

Imports tf_parts + tf2_parts (never edited) and registers the new parts into the same tf_parts.PARTS
registry (in this process only) with the same @part(...) decorator and conventions.  Re-used v4 parts:
hat_police, det_police, hat_hardhat, det_hivis, det_tie, det_bow, hat_cap, hat_fedora, acc_satchel ...

  part               family    space  ages          what
  top_fire_coat      top       body   adult         turnout coat: stand collar, J-hook clasps, bellows pockets,
                                                    lime / silver reflective bands (+ on both sleeves), flashlight
  bot_fire_pants     bottom    body   adult         bulky turnout trousers with reflective shin bands
  acc_air_tank       bag       body   adult         breathing-air cylinder on a back plate + harness straps
  hat_fire_helmet    hat full  head   adult         tradition fire helmet: dome, comb, long back brim, front shield
  top_police_v2      top       body   adult         padded winter police jacket + hi-vis police vest, radio, patch
  top_stripes        top       body   all           striped long-sleeve shirt (burglar / breton), striped sleeves
  acc_eye_mask       mask      head   all           comic black eye mask with eye holes and a little knot
  hat_burglar_beanie hat full  head   adult         snug docker beanie with a fat rolled cuff
  held_loot_sack     hand      body   adult         burlap sack in the right hand, fish tail + baguette poking out
  top_suit_3pc       top       body   adult/elder   jacket + waistcoat + shirt, pocket square, watch chain
  top_teller_vest    top       body   adult         shirt + buttoned waistcoat, sleeve garters, name pin
  acc_visor          hat top   head   adult/elder   green teller's eyeshade on a band (sits on the hair)
  top_work_jacket    top       body   adult         canvas chore jacket, corduroy collar, flap pockets, pencil
  acc_gloves         hand      body   adult         work-glove gauntlets (hands take the glove colour)
  hat_delivery_cap   hat full  head   adult         courier cap with a parcel badge
  top_delivery_polo  top       body   adult         courier polo: collar, placket, parcel logo
  bot_mover_overalls bottom    body   adult         heavy-duty overalls: knee pads, cargo pocket, hammer loop
  acc_back_brace     belt      body   adult         lifting belt with braces
  top_hivis_jacket   top       body   adult         hi-vis work jacket with silver bands (+ sleeve bands)
  acc_toolbelt       belt      body   adult         leather tool belt: pouches, hammer, tape measure, pliers
  acc_camera         neck      body   adult/elder   retro press camera with flash on a neck strap
  held_notepad       hand      body   adult/elder   reporter's flip pad + pencil in the left hand
  top_trench         top       body   adult/elder   belted double-breasted trench, popped collar, cuff straps
  hat_deerstalker    hat full  head   adult/elder   checked deerstalker, two peaks, flaps tied on top

Anim items (only drawn in their anim, added automatically by the compositor, see cf_anim.ANIM_ITEMS):
  held_box (carry_box), held_hose (spray_hose), held_broom (sweep), held_phone (phone),
  hand_point (point, argue: a pointing finger on the right mitten, tinted like the hands).

New tint slot: none (all new parts use the v4 slots; anim items use 'hands' / 'acc2' or fixed colours).
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import tf_parts as tp                     # noqa: E402
import tf2_parts as tp2                   # noqa: E402,F401  (v5 longskirt fix + wedding parts registered)
import cf_anim as ca                      # noqa: E402

PARTS = tp.PARTS
Z = dict(tp.Z)
part, sub = tp.part, tp.sub
PI = math.pi
TAU = math.tau

Z3 = {'mask': 62.6, 'tank_back': {'S': 3.2, 'SE': 3.2, 'E': 3.2, 'NE': 46.2, 'N': 46.2},
      'tank_straps': 43.5, 'brace': 38.0, 'toolbelt': 42.0, 'camera': 41.0,
      'item': 45.0, 'item_box': {'S': 45.5, 'SE': 45.5, 'E': 45.5, 'NE': 2.5, 'N': 2.5},
      'hose_nozzle': {'S': 45.6, 'SE': 45.6, 'E': 45.6, 'NE': 2.6, 'N': 2.6},
      'hose_line': {'S': 2.7, 'SE': 2.7, 'E': 45.7, 'NE': 45.7, 'N': 45.7},
      'broom': 45.8, 'stripes_torso': 30.6, 'vest3': 29.8}

NEW_PARTS3 = ['top_fire_coat', 'bot_fire_pants', 'acc_air_tank', 'hat_fire_helmet', 'top_police_v2', 'top_stripes',
              'acc_eye_mask', 'hat_burglar_beanie', 'held_loot_sack', 'top_suit_3pc', 'top_teller_vest', 'acc_visor',
              'top_work_jacket', 'acc_gloves', 'hat_delivery_cap', 'top_delivery_polo', 'bot_mover_overalls',
              'acc_back_brace', 'top_hivis_jacket', 'acc_toolbelt', 'acc_camera', 'held_notepad', 'top_trench',
              'hat_deerstalker',
              # polish pass: job looks that read at phone zoom
              'det_lgx_vest', 'hat_bump_cap', 'hat_demo_helmet', 'acc_dust_mask', 'hat_press_fedora']
ANIM_ITEM_PARTS = ['held_box', 'held_hose', 'held_broom', 'held_phone', 'hand_point']
ALL_NEW = NEW_PARTS3 + ANIM_ITEM_PARTS
# anim items: the ONLY anims they have frames in
ONLY_ANIMS = {'held_box': ['carry_box'], 'held_hose': ['spray_hose'], 'held_broom': ['sweep'],
              'held_phone': ['phone'], 'hand_point': ['point', 'argue']}
# hand-held items worn as normal parts: anims with busy hands draw nothing (like tf2 held_bouquet)
ITEM_NO_ANIMS = {
    'held_loot_sack': ['carry_walk', 'clap', 'push', 'carry_box', 'arrested_walk', 'spray_hose', 'sweep', 'phone',
                       'think', 'shocked', 'fight', 'point', 'argue', 'sit', 'wave', 'happy'],
    'held_notepad': ['carry_walk', 'clap', 'push', 'carry_box', 'arrested_walk', 'spray_hose', 'sweep', 'fight',
                     'flee', 'shocked', 'argue', 'think', 'phone', 'wave', 'happy', 'run'],
}
# subs that hang on the hips / legs only (rendered once per LOWER key in the cityfolk anims, see cf_anim)
LOWER_SUBS3 = {'bot_fire_pants.main', 'bot_fire_pants.stripes', 'bot_mover_overalls.main', 'bot_mover_overalls.pads'}
LOWER_SUBS_V4 = {'bot_pants.main', 'bot_snowpants.main', 'bot_skirt.main', 'bot_skirt.tights', 'bot_longskirt.main',
                 'bot_pleated.main', 'bot_pleated.tights', 'bot_overalls.main', 'bot_tights.main', 'shoe_boots.main',
                 'shoe_furboots.main', 'shoe_furboots.fur', 'shoe_rubber.main', 'shoe_shoes.main'}
LOWER_SUBS = LOWER_SUBS_V4 | LOWER_SUBS3
LOWER_JOINTS = {'hips', 'hip_R', 'hip_L', 'knee_R', 'knee_L'}

LIME = '#D8F040'
SILVER = '#E4E9F0'
BRASS = '#E2B13C'
INKY = '#2A2A30'


def _lazy():
    tp._lazy()
    global bpy, bmesh, Vector, Matrix, Quaternion, bc, g, cb, vd, vf, tb
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


def reflect_mat():
    return M('reflect3', SILVER, 0.22, metal=0.35, emission='#FFFFFF', emission_strength=0.12)


def lime_mat():
    return M('lime3', LIME, 0.5, emission='#E8FF60', emission_strength=0.06)


def band(prof, z0, z1, out=0.004, seg=56, sy=0.85, keep=None, center=0.0):
    """Thin band hugging a torso lathe profile between spine-local z0..z1 (keep = sector half angle)."""
    r0 = tp2_interp(prof, z0) + out
    r1 = tp2_interp(prof, z1) + out
    pr = [(r0, z0), (r1, z1)]
    if keep:
        return vd.sector_lathe(pr, keep_deg=keep, seg=seg, sy=sy, center_deg=center)
    return g.bm_lathe(pr, seg=seg, sy=sy, cap_top=False, cap_bottom=False)


def tp2_interp(prof, z):
    _lazy()
    return vd.interp_profile(g.catmull(prof, 40), z)


def limb_ring(rig, name, mat, joint, z, R=0.080, r=0.016, rz=1.4, seg=28):
    return g.mesh_obj(name, g.bm_ring(R, r, seg=seg, segr=8, rz=rz), mat, rig.j[joint], loc=(0, 0, z))


def follow(tint, limb):
    return {'tint': tint, 'z': Z['arm'] + 0.5, 'follow': limb}


def follow_hand(tint, limb):
    return {'tint': tint, 'z': Z['hand'] + 0.5, 'follow': limb}


# =========================================================================== firefighter

FIRE_COAT = [(0.286, -0.20), (0.280, -0.12), (0.258, -0.02), (0.232, 0.10), (0.222, 0.22), (0.206, 0.31),
             (0.162, 0.39), (0.07, 0.45), (0.0, 0.46)]


@part('top_fire_coat', 'top', 'body',
      {'main': sub('top', Z['top']), 'trim': sub(None, Z['top_detail'] + 0.2),
       'stripes': sub(None, Z['top_detail'] + 0.4),
       'band_R': follow(None, 'arm_R'), 'band_L': follow(None, 'arm_L')},
      tags=['job', 'warm', 'fire'], ages=['adult'], label={'ko': '방화복 코트', 'en': 'turnout coat'})
def b_top_fire_coat(rig, ctx, put):
    _lazy()
    m = M('fcoat', ctx.col('top'), 0.78)
    md = M('fcoat_d', ctx.col('top', 0.80), 0.8)
    with put('main'):
        tp._torso(FIRE_COAT, m, rig, sy=0.86)
        # tall stand collar (turned up against the heat), slightly open at the front
        col = vd.sector_lathe([(0.152, 0.0), (0.156, 0.05), (0.150, 0.10)], keep_deg=160, seg=48, sy=0.92,
                              center_deg=180)
        g.mesh_obj('collar', col, md, rig.j['chest'], loc=(0, 0.012, 0.072))
        # storm flap down the front, slightly off-centre (closes over the clasps)
        g.mesh_obj('flap', vd.sector_lathe([(0.290, -0.19), (0.282, -0.12), (0.260, -0.02), (0.234, 0.10),
                                            (0.224, 0.22), (0.208, 0.31)], keep_deg=7, sy=0.865, center_deg=8),
                   md, rig.j['spine'])
        # big bellows pockets with flaps
        for s in (-1, 1):
            g.mesh_obj('pocket', g.bm_box(0.105, 0.030, 0.100, bevel=0.012), m, rig.j['spine'],
                       loc=(s * 0.150, -0.214, -0.090), rot=(0, 0, s * 24))
            g.mesh_obj('pocket_flap', g.bm_box(0.112, 0.034, 0.030, bevel=0.010), md, rig.j['spine'],
                       loc=(s * 0.152, -0.222, -0.035), rot=(-8, 0, s * 24))
        # hem and cuff piping
        g.mesh_obj('hem', g.bm_ring(0.282, 0.014, seg=64, segr=8, sy=0.86, rz=1.1), md, rig.j['spine'],
                   loc=(0, 0, -0.195))
    with put('trim'):
        blk = M('clasp', INKY, 0.35, metal=0.5)
        for z in (-0.13, -0.03, 0.07, 0.17):
            p = cb.front_point(z, tp2_interp(FIRE_COAT, z), 0.010)
            g.mesh_obj('clasp', g.bm_box(0.040, 0.016, 0.018, bevel=0.006), blk, rig.j['spine'],
                       loc=(0.045, p[1], p[2]), rot=(0, 0, 8))
            g.mesh_obj('clasp_hook', g.bm_box(0.012, 0.014, 0.030, bevel=0.004), blk, rig.j['spine'],
                       loc=(0.068, p[1] - 0.002, p[2] - 0.006), rot=(0, 0, 8))
        # collar lining + chin strap tab (dark)
        g.mesh_obj('collar_tab', g.bm_box(0.05, 0.014, 0.04, bevel=0.010), M('fc_tab', '#3A3A44', 0.7),
                   rig.j['chest'], loc=(0.07, -0.135, 0.105), rot=(0, 0, 28))
        # right-angle flashlight clipped to the left chest
        lt = M('flashlight', '#F2C230', 0.45)
        g.mesh_obj('lamp', g.bm_box(0.050, 0.040, 0.075, bevel=0.012), lt, rig.j['spine'],
                   loc=(0.115, -0.208, 0.230), rot=(-6, 0, -16))
        g.mesh_obj('lamp_lens', g.bm_cyl(0.020, 0.020, 0.012, seg=16), M('lamp_lens', '#FFF6C8', 0.2,
                                                                          emission='#FFF2B0',
                                                                          emission_strength=0.6),
                   rig.j['spine'], loc=(0.122, -0.236, 0.258), rot=(90, 0, -16))
    with put('stripes'):
        lm = lime_mat()
        sm = reflect_mat()
        for zc in (-0.150, 0.070):
            g.mesh_obj('band_lime', band(FIRE_COAT, zc - 0.030, zc + 0.030, out=0.006, sy=0.865), lm, rig.j['spine'])
            g.mesh_obj('band_silver', band(FIRE_COAT, zc - 0.011, zc + 0.011, out=0.010, sy=0.865), sm, rig.j['spine'])
        # band over the shoulders (front and back, like suspenders of tape)
        for s in (-1, 1):
            g.mesh_obj('shoulder_tape', g.bm_tube_path([(s * 0.130, -0.175, 0.20), (s * 0.150, -0.11, 0.37),
                                                        (s * 0.145, 0.02, 0.43), (s * 0.14, 0.15, 0.36),
                                                        (s * 0.13, 0.19, 0.20)], 0.012, segr=6,
                                                       side_ref=(1, 0, 0), flat=2.0), lm, rig.j['spine'])
    for n in ('R', 'L'):
        with put('band_' + n):
            limb_ring(rig, 'sl_lime_' + n, lime_mat(), 'el_' + n, -0.060, R=0.074, r=0.020, rz=1.2)
            limb_ring(rig, 'sl_silver_' + n, reflect_mat(), 'el_' + n, -0.060, R=0.080, r=0.010, rz=1.0)
            limb_ring(rig, 'sl_cuff_' + n, M('fc_cuff', '#3A3A44', 0.7), 'el_' + n, -cb.FOREARM + 0.012,
                      R=0.066, r=0.016, rz=1.0)


@part('bot_fire_pants', 'bottom', 'body', {'main': sub('bottom', Z['pants']), 'stripes': sub(None, Z['pants'] + 0.4)},
      tags=['job', 'warm', 'fire'], ages=['adult'], label={'ko': '방화복 바지', 'en': 'turnout trousers'})
def b_bot_fire_pants(rig, ctx, put):
    _lazy()
    pm = M('fpants', ctx.col('bottom'), 0.8)
    with put('main'):
        tp._seat(rig, pm, hem_r=0.228)
        tp._legs(rig, pm, thigh=0.090, shin=0.080)
        for n in ('R', 'L'):          # knee reinforcement
            g.mesh_obj('knee_pad', g.bm_ellipsoid(0.064, 0.030, 0.060, 16, 10), M('fpants_d', ctx.col('bottom', 0.82),
                                                                                0.8),
                       rig.j['knee_' + n], loc=(0, -0.068, 0.0))
    with put('stripes'):
        for n in ('R', 'L'):
            limb_ring(rig, 'shin_lime_' + n, lime_mat(), 'knee_' + n, -0.050, R=0.080, r=0.022, rz=1.1, seg=32)
            limb_ring(rig, 'shin_silver_' + n, reflect_mat(), 'knee_' + n, -0.050, R=0.086, r=0.010, rz=1.0,
                      seg=32)


@part('acc_air_tank', 'bag', 'body', {'tank': sub(None, Z3['tank_back']), 'straps': sub(None, Z3['tank_straps'])},
      tags=['job', 'fire'], ages=['adult'], label={'ko': '공기호흡기', 'en': 'air tank'})
def b_acc_air_tank(rig, ctx, put):
    _lazy()
    blk = M('harness', '#2E2E36', 0.7)
    with put('tank'):
        g.mesh_obj('backplate', g.bm_box(0.22, 0.03, 0.34, bevel=0.03), blk, rig.j['chest'], loc=(0, 0.215, -0.12))
        tank = M('tank', '#F2C230', 0.35, metal=0.15)
        g.mesh_obj('cyl', g.bm_capsule(0.080, 0.26, seg=24, rings=8), tank, rig.j['chest'], loc=(0, 0.300, 0.06))
        g.mesh_obj('cyl_band', g.bm_ring(0.082, 0.012, seg=28, segr=6), M('tank_band', SILVER, 0.3, metal=0.6),
                   rig.j['chest'], loc=(0, 0.300, -0.07))
        g.mesh_obj('valve', g.bm_cyl(0.030, 0.026, 0.06, seg=16), M('valve', '#C9CED6', 0.25, metal=0.8),
                   rig.j['chest'], loc=(0, 0.300, -0.33))
        g.mesh_obj('gauge', g.bm_cyl(0.022, 0.022, 0.012, seg=16), M('gauge', '#F7F5EE', 0.3), rig.j['chest'],
                   loc=(0.06, 0.300, -0.31), rot=(0, 90, 0))
    with put('straps'):
        for s in (-1, 1):
            g.mesh_obj('strap', g.bm_tube_path([(s * 0.10, 0.17, 0.07), (s * 0.115, -0.04, 0.10),
                                                (s * 0.13, -0.175, 0.01), (s * 0.13, -0.19, -0.16)], 0.017,
                                               segr=6, side_ref=(1, 0, 0), flat=1.9), blk, rig.j['chest'])
            g.mesh_obj('strap_buckle', g.bm_box(0.038, 0.012, 0.022, bevel=0.004),
                       M('silver_b', '#C9CED6', 0.3, metal=0.7), rig.j['chest'], loc=(s * 0.13, -0.196, -0.06))
        g.mesh_obj('waist_strap', g.bm_ring(0.240, 0.018, seg=56, segr=6, sy=0.86, rz=1.2), blk, rig.j['spine'],
                   loc=(0, 0, 0.02))


@part('hat_fire_helmet', 'hat', 'head', {'main': sub('hat', Z['hat']), 'shield': sub(None, Z['hat_detail'])},
      cls='full', tags=['job', 'fire', 'jobhat'], ages=['adult'], label={'ko': '소방 헬멧', 'en': 'fire helmet'})
def b_hat_fire_helmet(rig, ctx, put):
    _lazy()
    with put('main'):
        m = M('fhelm', ctx.col('hat'), 0.28)
        cb.cap_shell(rig, m, lambda x, y: 0.34 - 0.12 * y, base=1.14, puff=0.14, name='dome', soft=0.02)
        # comb ridge front-to-back over the crown
        ridge = g.bm_ring(0.300, 0.024, seg=48, segr=8, u0=PI * 0.16, u1=PI * 0.84, closed=False)
        g.bm_transform(ridge, Matrix.Rotation(PI / 2, 4, 'Y'))
        vd.ho(rig, 'comb', ridge, m, loc=(0, 0.0, 0.07), rot=(0, 0, 90))
        # brim: just a lip at the front, long duckbill at the back sweeping down over the neck
        bm = bmesh.new()
        seg = 72
        rows = []
        for k in range(seg):
            a = TAU * k / seg
            back = max(0.0, math.cos(a - PI / 2)) ** 1.5         # +Y (back) = 1
            side = abs(math.cos(a))
            ri = 0.305
            ro = 0.350 + 0.20 * back + 0.035 * side
            droop = -0.15 * back ** 1.3
            prof = ((ri, 0.010), (ro, droop + 0.006), (ro + 0.010, droop - 0.006), (ri, -0.012))
            rows.append([bm.verts.new((r * math.cos(a), r * math.sin(a), dz + (droop * 0.2 if j in (0, 3) else 0.0)))
                         for j, (r, dz) in enumerate(prof)])
        for k in range(seg):
            a_, b_ = rows[k], rows[(k + 1) % seg]
            for j in range(4):
                bm.faces.new((a_[j], b_[j], b_[(j + 1) % 4], a_[(j + 1) % 4]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        vd.ho(rig, 'brim', bm, m, loc=(0, 0.0, 0.098), rot=(-7, 0, 0))
    with put('shield'):
        # reflective lime band around the dome: untinted (in 'main' the hat tint turned it into a darker red)
        cb.tilted_ring(rig, 'helm_band', lime_mat(), tb.HEAD_R[0] * 1.13, 0.021, 0.50, 0.28, sy=1.0, rz=1.3)
        # tall leather front shield above the brim lip: gold rim, white number plate, red '1'
        pts = []
        for k in range(16):
            a = PI * k / 15
            pts.append((0.092 * math.cos(a), 0.118 + 0.066 * math.sin(a)))
        pts += [(-0.088, 0.012), (-0.040, -0.040), (0.0, -0.056), (0.040, -0.040), (0.088, 0.012)][::-1]
        q = Quaternion((1, 0, 0), math.radians(-14))
        sh = g.bm_slab([(y, z) for y, z in pts], 0.018, bevel=0.006)
        g.bm_transform(sh, Matrix.Rotation(PI / 2, 4, 'Z'))
        vd.ho(rig, 'shield', sh, M('shield', '#2A2228', 0.45), loc=(0, -0.336, 0.110), rot=q)
        rim = g.bm_slab([(y * 1.10, z * 1.06 - 0.002) for y, z in pts], 0.010, bevel=0.003)
        g.bm_transform(rim, Matrix.Rotation(PI / 2, 4, 'Z'))
        vd.ho(rig, 'shield_rim', rim, M('badge_g', BRASS, 0.3, metal=0.7), loc=(0, -0.328, 0.110), rot=q)
        plate = g.bm_slab([(0.046 * math.cos(TAU * k / 20), 0.080 + 0.042 * math.sin(TAU * k / 20)) for k in range(20)],
                          0.008, bevel=0.003)
        g.bm_transform(plate, Matrix.Rotation(PI / 2, 4, 'Z'))
        vd.ho(rig, 'shield_plate', plate, M('shield_w', '#F7F2E2', 0.5), loc=(0, -0.350, 0.110), rot=q)
        vd.ho(rig, 'shield_num', g.bm_box(0.016, 0.010, 0.054, bevel=0.004), M('shield_r', '#D9483B', 0.5),
              loc=(0, -0.358 + 0.019, 0.110 + 0.078), rot=q)
        star = []
        for k in range(10):
            a = PI / 2 + k * PI / 5
            r = 0.030 if k % 2 == 0 else 0.013
            star.append((r * math.cos(a), r * math.sin(a)))
        st = g.bm_slab(star, 0.010, bevel=0.003)
        g.bm_transform(st, Matrix.Rotation(PI / 2, 4, 'Z'))
        vd.ho(rig, 'shield_star', st, M('badge_g', BRASS, 0.3, metal=0.7), loc=(0, -0.300, 0.290), rot=q)


# =========================================================================== police v2

POL = [(0.258, -0.09), (0.252, -0.02), (0.230, 0.10), (0.222, 0.22), (0.207, 0.31), (0.165, 0.39),
       (0.07, 0.45), (0.0, 0.46)]
POL_VEST = [(0.270, -0.04), (0.262, 0.04), (0.242, 0.12), (0.234, 0.22), (0.219, 0.30), (0.180, 0.37)]


@part('top_police_v2', 'top', 'body',
      {'main': sub('top', Z['top']), 'fur': sub('fur', Z['top_detail']), 'vest': sub('top2', Z['vest']),
       'strips': sub(None, Z['vest'] + 0.5), 'patch': follow(None, 'arm_L')},
      tags=['job', 'warm', 'police'], ages=['adult'], label={'ko': '겨울 경찰 점퍼', 'en': 'winter police jacket'})
def b_top_police_v2(rig, ctx, put):
    _lazy()
    m = M('pol', ctx.col('top'), 0.7)
    with put('main'):
        prof = vd.quilted_profile(POL, step=0.08, amp=0.035)
        g.mesh_obj('torso', g.bm_lathe(prof, seg=44, sy=0.85, smooth_n=0, cap_top=False), m, rig.j['spine'])
        g.mesh_obj('hood', g.bm_ellipsoid(0.18, 0.10, 0.13, 24, 12), m, rig.j['chest'], loc=(0, 0.20, 0.07),
                   rot=(-25, 0, 0))
        g.mesh_obj('hem_rib', g.bm_ring(0.252, 0.020, seg=56, segr=8, sy=0.85, rz=1.3),
                   M('pol_rib', ctx.col('top', 0.8), 0.9), rig.j['spine'], loc=(0, 0, -0.080))
    with put('fur'):
        cb.collar_fur(rig, {}, R=0.150, r=0.062, dz=0.095, bump=0.40, tufts=10, mat=M('pfur', ctx.col('fur'), 0.95))
    with put('vest'):
        v = M('polvest', ctx.col('top2'), 0.55, emission='#FFFFFF', emission_strength=0.03)
        bm = g.bm_lathe(POL_VEST, seg=48, sy=0.88, smooth_n=16, cap_top=False, cap_bottom=False)
        g.mesh_obj('vest', bm, v, rig.j['spine'])
        g.mesh_obj('vest_zip', g.bm_box(0.012, 0.010, 0.30, bevel=0.003), M('vzip', ctx.col('top2', 0.7), 0.5),
                   rig.j['spine'], loc=(0, -0.236, 0.13))
    with put('strips'):
        sm = reflect_mat()
        for zc in (0.02, 0.22):
            g.mesh_obj('vstrip', band(POL_VEST, zc - 0.014, zc + 0.014, out=0.006, sy=0.885), sm, rig.j['spine'])
        # navy chest panel with a white 'POLICE' plate (reads as a light bar at this size) and a radio
        g.mesh_obj('plate', g.bm_box(0.13, 0.010, 0.030, bevel=0.006), M('plate_bg', '#22305A', 0.6),
                   rig.j['spine'], loc=(-0.06, -0.245, 0.135), rot=(-4, 0, 14))
        g.mesh_obj('plate_txt', g.bm_box(0.09, 0.008, 0.012, bevel=0.003), M('plate_w', '#F4F6FA', 0.5),
                   rig.j['spine'], loc=(-0.06, -0.252, 0.135), rot=(-4, 0, 14))
        rad = M('radio', '#24262E', 0.5)
        g.mesh_obj('radio', g.bm_box(0.040, 0.030, 0.065, bevel=0.010), rad, rig.j['chest'],
                   loc=(0.115, -0.150, 0.065), rot=(-10, 0, -24))
        g.mesh_obj('radio_ant', g.bm_cyl(0.006, 0.006, 0.05, seg=8), rad, rig.j['chest'], loc=(0.126, -0.146, 0.10))
        g.mesh_obj('radio_cord', g.bm_tube_path([(0.11, -0.140, 0.035), (0.15, -0.10, -0.02), (0.16, -0.02, 0.05)],
                                                0.0045, segr=6), rad, rig.j['chest'])
    with put('patch'):
        pm = M('patch', '#3D6FB8', 0.6)
        g.mesh_obj('arm_patch', g.bm_ellipsoid(0.040, 0.018, 0.046, 14, 8), pm, rig.j['sh_L'],
                   loc=(0.060, 0.0, -0.065), rot=(0, 0, 90))
        g.mesh_obj('arm_patch_g', g.bm_ellipsoid(0.020, 0.012, 0.024, 10, 6), M('patch_g', BRASS, 0.4, metal=0.4),
                   rig.j['sh_L'], loc=(0.074, 0.0, -0.065), rot=(0, 0, 90))


# =========================================================================== burglar

STRIPE_SHIRT = [(0.240, -0.09), (0.234, -0.02), (0.214, 0.10), (0.210, 0.22), (0.197, 0.31), (0.157, 0.39),
                (0.07, 0.45), (0.0, 0.46)]


@part('top_stripes', 'top', 'body',
      {'main': sub('top', Z['top']), 'stripes': sub('top2', Z3['stripes_torso']),
       'sleeve_R': follow('top2', 'arm_R'), 'sleeve_L': follow('top2', 'arm_L')},
      tags=['casual', 'stripes'], ages=['adult'], label={'ko': '줄무늬 티셔츠', 'en': 'striped shirt'})
def b_top_stripes(rig, ctx, put):
    _lazy()
    with put('main'):
        tp._torso(STRIPE_SHIRT, M('stripe_base', ctx.col('top'), 0.9), rig, sy=0.85)
        g.mesh_obj('crew', g.bm_ring(0.125, 0.026, seg=48, segr=8, sy=0.92, rz=1.3),
                   M('stripe_rib', ctx.col('top', 0.92), 0.9), rig.j['chest'], loc=(0, 0.01, 0.085))
    with put('stripes'):
        sm = M('stripe_ink', ctx.col('top2'), 0.9)
        for zc in (-0.060, 0.005, 0.070, 0.135, 0.200, 0.265, 0.330, 0.390):
            g.mesh_obj('stripe', band(STRIPE_SHIRT, zc - 0.020, zc + 0.020, out=0.003), sm, rig.j['spine'])
    for n in ('R', 'L'):
        with put('sleeve_' + n):
            sm = M('stripe_ink', ctx.col('top2'), 0.9)
            for jn, z in (('sh_' + n, -0.045), ('sh_' + n, -0.105), ('el_' + n, -0.035), ('el_' + n, -0.090)):
                limb_ring(rig, 'sleeve_stripe', sm, jn, z, R=0.072 if jn.startswith('sh') else 0.066, r=0.016,
                          rz=1.3)


@part('acc_eye_mask', 'mask', 'head', {'main': sub(None, Z3['mask'])}, tags=['burglar'],
      label={'ko': '눈가리개 복면', 'en': 'eye mask'})
def b_acc_eye_mask(rig, ctx, put):
    """Comic black eye mask: a band around the head at eye level with two big round eye holes (the face
    layer's eyes show through; the brows are drawn above it)."""
    _lazy()
    eu, ev = 0.116, -0.030
    rx, ry, rz = tb.HEAD_R
    eyes = []
    for s in (-1, 1):
        p, n = vf.surf(s * eu, ev, 0.0)
        eyes.append(Vector((p.x / rx, p.y / ry, p.z / rz)).normalized())
    zc = (ev + 0.004) / rz

    def radial(x, y, z):
        d = Vector((x, y, z))
        front = cb.smoothstep(0.05, -0.55, y)                  # 1 on the face, 0 at the back
        half = 0.12 + (0.26 - 0.12) * front                    # over the eyes, a strap at the back
        inband = cb.smoothstep(half + 0.03, half - 0.02, abs(z - zc))
        hole = max(cb.smoothstep(0.958, 0.968, d.dot(e)) for e in eyes)
        t = inband * (1.0 - hole)
        return 0.93 + (1.040 - 0.93) * t
    # mid-tone navy (a black mask merged with darker skin tones) + a sheen; white rims make the eyes pop
    mm = M('mask', '#34406A', 0.32)
    rim = M('mask_rim', '#8C98C0', 0.45)
    with put('main'):
        cb.shell(rig, mm, radial, 'eye_mask', seg=96, rings=48)
        th = math.acos(0.963)
        for e in eyes:
            u = e.cross(Vector((0, 0, 1))).normalized()
            v = e.cross(u).normalized()
            pts = []
            for k in range(25):
                ph = TAU * k / 24
                dd = (e * math.cos(th) + (u * math.cos(ph) + v * math.sin(ph)) * math.sin(th)).normalized()
                pts.append((dd.x * rx * 1.045, dd.y * ry * 1.045, dd.z * rz * 1.045))
            vd.ho(rig, 'mask_rim', g.bm_tube_path(pts, 0.0060, segr=6), rim)
        # knot + two ribbon tails at the back
        vd.ho(rig, 'knot', g.bm_ellipsoid(0.035, 0.030, 0.030, 12, 8), mm, loc=(0, 0.300, -0.03))
        for s in (-1, 1):
            vd.ho(rig, 'tail', g.bm_tube_path([(s * 0.012, 0.30, -0.04), (s * 0.05, 0.33, -0.10),
                                                (s * 0.07, 0.31, -0.17)], lambda t: 0.020 - 0.006 * t, segr=6,
                                               side_ref=(0, 1, 0), flat=2.2), mm)


@part('hat_burglar_beanie', 'hat', 'head', {'main': sub('hat', Z['hat'])}, cls='full', tags=['burglar', 'jobhat'],
      ages=['adult'], label={'ko': '도둑 비니', 'en': 'docker beanie'})
def b_hat_burglar_beanie(rig, ctx, put):
    _lazy()
    with put('main'):
        k = M('bbeanie', ctx.col('hat'), 0.95)
        cb.cap_shell(rig, k, lambda x, y: 0.44 - 0.22 * y, base=1.10, puff=0.05, name='beanie', lumps=0.035)
        # fat folded cuff hugging the head above the ears (taller than it is thick), raised in front
        cb.tilted_ring(rig, 'beanie_cuff', M('bbeanie_c', ctx.col('hat', 0.86), 0.95), tb.HEAD_R[0] * 1.06, 0.034,
                       0.64, 0.26, sy=0.98, rz=2.1)
        vd.ho(rig, 'beanie_nub', vd.fuzz(g.bm_ellipsoid(0.05, 0.05, 0.035, 12, 8), 0.004, 40.0), k, loc=(0, 0.02, 0.325))


@part('held_loot_sack', 'hand', 'body', {'main': dict(sub(None, Z3['item']), zfrontFollow='hand_R', noAnims=['flee']),
                                         'flee': dict(sub(None, Z3['item']), onlyAnims=['flee'])},
      tags=['item', 'burglar'], ages=['adult'], label={'ko': '훔친 보따리', 'en': 'loot sack'})
def b_held_loot_sack(rig, ctx, put):
    """Burlap sack hanging from the right fist (item joint 'sack_R', kept upright by place_items3):
    a fish tail and a baguette poke out of the tied neck.  In flee the same sack ('flee' sub, joint 'sack_F')
    hangs from the LEFT mitten over the far shoulder - behind the head in SE / E (it used to hide the face)."""
    _lazy()
    for jn in ('sack_R', 'sack_F'):
        if jn not in rig.j:
            rig.add(jn, 'root', (0, 0, 0))
    for jn, sb in (('sack_R', 'main'), ('sack_F', 'flee')):
        _sack(rig, rig.j[jn], put, sb)


def _sack(rig, j, put, sb):
    burlap = M('burlap', '#C9A46E', 0.95)
    with put(sb):
        prof = [(0.0, -0.30), (0.10, -0.29), (0.150, -0.24), (0.160, -0.16), (0.130, -0.09), (0.060, -0.045),
                (0.040, -0.02), (0.050, 0.005)]
        sack = vd.fuzz(g.bm_lathe(prof, seg=28, sy=0.86, smooth_n=16, cap_top=False), 0.004, 45.0)
        g.mesh_obj('sack', sack, burlap, j, loc=(0, 0, 0))
        g.mesh_obj('patch', g.bm_box(0.06, 0.01, 0.05, bevel=0.006), M('sack_patch', '#8A6A4A', 0.9), j,
                   loc=(0.03, -0.135, -0.18), rot=(0, 0, 12))
        g.mesh_obj('tie', g.bm_ring(0.045, 0.012, seg=20, segr=6), M('rope', '#8A5A33', 0.8), j, loc=(0, 0, -0.035))
        fish = M('fish', '#9DB4C8', 0.35)
        g.mesh_obj('fish_body', g.bm_ellipsoid(0.026, 0.016, 0.06, 12, 8), fish, j, loc=(0.020, 0.0, 0.03),
                   rot=(0, 18, 0))
        for s in (-1, 1):
            g.mesh_obj('fish_tail', g.bm_ellipsoid(0.030, 0.008, 0.020, 10, 6), fish, j,
                       loc=(0.034 + s * 0.022, 0.0, 0.085), rot=(0, 18 + s * 38, 0))
        g.mesh_obj('bread', g.bm_capsule(0.024, 0.13, seg=14, rings=6), M('bread', '#D99A52', 0.7), j,
                   loc=(-0.035, 0.010, 0.12), rot=(0, -22, 0))
        for k in range(3):
            g.mesh_obj('bread_cut', g.bm_box(0.022, 0.012, 0.006, bevel=0.002), M('bread_c', '#F2D29A', 0.7), j,
                       loc=(-0.042 + 0.012 * k, -0.018, 0.10 - 0.035 * k), rot=(0, -22, 30))


# =========================================================================== bank

SUIT3 = [(0.256, -0.10), (0.248, -0.02), (0.224, 0.10), (0.216, 0.20), (0.204, 0.30), (0.164, 0.39)]


@part('top_suit_3pc', 'top', 'body',
      {'shirt': sub(None, Z['top'] - 0.6), 'vest': sub('top', Z3['vest3']), 'main': sub('top', Z['top'] + 0.5),
       'square': sub('top2', Z['top_detail'] + 0.6), 'trim': sub(None, Z['top_detail'] + 0.7)},
      tags=['formal', 'smart', 'bank'], ages=['adult', 'elder'], label={'ko': '쓰리피스 정장', 'en': 'three-piece suit'})
def b_top_suit_3pc(rig, ctx, put):
    _lazy()
    with put('shirt'):
        w = M('shirt_w3', '#F7F5F0', 0.6)
        tp._torso(tp.SHIRT, w, rig, sy=0.84)
        for s in (-1, 1):
            g.mesh_obj('collar', g.bm_ellipsoid(0.048, 0.020, 0.030, 12, 8), w, rig.j['chest'],
                       loc=(s * 0.040, -0.126, 0.090), rot=(40, s * 20, s * 34))
    with put('vest'):
        v = M('wcoat', ctx.col('top', 0.80), 0.7)
        g.mesh_obj('waistcoat', cb.vest_lathe([(0.238, -0.09), (0.232, -0.02), (0.214, 0.10), (0.210, 0.20),
                                               (0.197, 0.27)], gap_deg=9, seg=48, sy=0.86), v, rig.j['spine'])
        g.mesh_obj('v_neck', vd.sector_lathe([(0.212, 0.18), (0.200, 0.27)], keep_deg=18, sy=0.86), v,
                   rig.j['spine'])
        for s in (-1, 1):
            g.mesh_obj('w_pocket', g.bm_box(0.050, 0.010, 0.010, bevel=0.003), M('wcoat_d', ctx.col('top', 0.6), 0.7),
                       rig.j['spine'], loc=(s * 0.10, -0.206, 0.04), rot=(0, 0, s * 12))
    with put('main'):
        m = M('suit3', ctx.col('top'), 0.6)
        md = M('suit3_d', ctx.col('top', 0.78), 0.5)
        g.mesh_obj('jacket', cb.vest_lathe(SUIT3, gap_deg=24, seg=48, sy=0.88), m, rig.j['spine'])
        for s in (-1, 1):
            g.mesh_obj('lapel', vd.sector_lathe([(0.232, 0.10), (0.222, 0.20), (0.210, 0.29), (0.172, 0.38)],
                                                keep_deg=11, sy=0.88, center_deg=s * 30), md, rig.j['spine'])
            g.mesh_obj('pocket_flap', g.bm_box(0.080, 0.014, 0.022, bevel=0.005), md, rig.j['spine'],
                       loc=(s * 0.150, -0.206, -0.035), rot=(0, 0, s * 28))
        g.mesh_obj('breast_pocket', g.bm_box(0.060, 0.012, 0.012, bevel=0.003), md, rig.j['spine'],
                   loc=(0.118, -0.192, 0.235), rot=(0, 0, -22))
    with put('square'):                     # pocket square + matching necktie (one tint: top2)
        sq = M('pocket_sq', ctx.col('top2'), 0.6)
        for k, dx in enumerate((-0.016, 0.0, 0.016)):
            g.mesh_obj('square', g.bm_ellipsoid(0.014, 0.008, 0.020, 8, 6), sq, rig.j['spine'],
                       loc=(0.118 + dx, -0.196, 0.250 + 0.006 * (k == 1)), rot=(0, 0, -22))
        # same tie as the v4 det_tie (that part is only packed for children), slightly slimmer
        g.mesh_obj('tie_knot', g.bm_ellipsoid(0.020, 0.013, 0.019, 10, 6), sq, rig.j['spine'], loc=(0, -0.166, 0.376))
        g.mesh_obj('tie', g.bm_slab([(-0.0, 0.0), (0.026, -0.02), (0.031, -0.19), (0.0, -0.222), (-0.031, -0.19),
                                     (-0.026, -0.02)], 0.011, bevel=0.004), sq, rig.j['spine'], loc=(0, -0.203, 0.37),
                   rot=(-8, 0, 90))
    with put('trim'):
        gold = M('chain', BRASS, 0.3, metal=0.75)
        btn = M('vbtn', '#3A3236', 0.4)
        for z in (-0.06, 0.0, 0.06, 0.12):
            p = cb.front_point(z, 0.226 if z < 0.05 else 0.214, 0.004)
            g.mesh_obj('vbutton', g.bm_ellipsoid(0.011, 0.007, 0.011, 8, 6), btn, rig.j['spine'], loc=p)
        g.mesh_obj('watch_chain', g.bm_tube_path([(0.006, -0.212, 0.03), (0.06, -0.218, 0.005), (0.11, -0.210, 0.02)],
                                                 0.0045, segr=6), gold, rig.j['spine'])
        g.mesh_obj('jbutton', g.bm_ellipsoid(0.016, 0.010, 0.016, 10, 6), btn, rig.j['spine'], loc=(0.070, -0.218, -0.03))


TELLER = [(0.236, -0.085), (0.230, -0.02), (0.212, 0.10), (0.208, 0.22), (0.195, 0.31), (0.155, 0.39),
          (0.07, 0.45), (0.0, 0.46)]


@part('top_teller_vest', 'top', 'body',
      {'shirt': sub('top2', Z['top_detail']), 'main': sub('top', Z['top'] + 0.5),
       'garter_R': follow(None, 'arm_R'), 'garter_L': follow(None, 'arm_L'), 'trim': sub(None, Z['top_detail'] + 0.7)},
      tags=['job', 'smart', 'bank'], ages=['adult'], label={'ko': '은행원 조끼', 'en': 'teller waistcoat'})
def b_top_teller_vest(rig, ctx, put):
    _lazy()
    with put('shirt'):
        sh = M('tshirt', ctx.col('top2'), 0.7)
        tp._torso(TELLER, sh, rig, sy=0.84)
        for s in (-1, 1):
            g.mesh_obj('collar', g.bm_ellipsoid(0.050, 0.020, 0.032, 12, 8), sh, rig.j['chest'],
                       loc=(s * 0.042, -0.124, 0.088), rot=(38, s * 20, s * 32))
    with put('main'):
        # a SHORT, fitted waistcoat (no flare): it hugs the shirt and stops at the waist in two little points,
        # so the trousers / skirt break clearly below it (it used to read as a school pinafore)
        v = M('tvest', ctx.col('top'), 0.6)
        g.mesh_obj('vest', cb.vest_lathe([(0.244, -0.035), (0.238, 0.02), (0.220, 0.10), (0.215, 0.20), (0.203, 0.28),
                                          (0.17, 0.34)], gap_deg=11, seg=48, sy=0.87), v, rig.j['spine'])
        for s in (-1, 1):
            g.mesh_obj('vest_point', vd.sector_lathe([(0.248, -0.085), (0.246, -0.03)], keep_deg=10, sy=0.87,
                                                     center_deg=s * 14), v, rig.j['spine'])
            g.mesh_obj('welt', g.bm_box(0.055, 0.010, 0.010, bevel=0.003), M('tvest_d', ctx.col('top', 0.7), 0.6),
                       rig.j['spine'], loc=(s * 0.112, -0.205, 0.04), rot=(0, 0, s * 14))
        g.mesh_obj('vest_back', vd.sector_lathe([(0.246, -0.04), (0.240, 0.0)], keep_deg=60, sy=0.87, center_deg=180),
                   M('tvest_b', ctx.col('top', 0.82), 0.6), rig.j['spine'])
    for n in ('R', 'L'):
        with put('garter_' + n):
            gm = M('garter', '#C8343A', 0.45)
            limb_ring(rig, 'garter_' + n, gm, 'sh_' + n, -0.100, R=0.078, r=0.012, rz=1.6)
            g.mesh_obj('garter_clip', g.bm_box(0.020, 0.012, 0.016, bevel=0.003), M('garter_m', BRASS, 0.3, metal=0.6),
                       rig.j['sh_' + n], loc=(0.0, -0.085, -0.100))
    with put('trim'):
        btn = M('tvbtn', BRASS, 0.3, metal=0.6)
        for z in (-0.07, -0.01, 0.05, 0.11, 0.17):
            p = cb.front_point(z, 0.238 if z < 0.05 else 0.222, 0.004)
            g.mesh_obj('tbutton', g.bm_ellipsoid(0.012, 0.007, 0.012, 8, 6), btn, rig.j['spine'], loc=p)
        # bank name badge: white card with a red bank stripe, framed in brass (reads at phone zoom)
        g.mesh_obj('name_badge', g.bm_box(0.088, 0.010, 0.050, bevel=0.006), M('badge_w', '#FBF8F0', 0.5),
                   rig.j['spine'], loc=(0.112, -0.205, 0.205), rot=(-6, 0, -16))
        g.mesh_obj('name_badge_s', g.bm_box(0.090, 0.012, 0.014, bevel=0.003), M('badge_r', '#C8343A', 0.5),
                   rig.j['spine'], loc=(0.112, -0.207, 0.222), rot=(-6, 0, -16))
        g.mesh_obj('name_badge_f', g.bm_box(0.096, 0.008, 0.056, bevel=0.007), M('pin_g', BRASS, 0.3, metal=0.6),
                   rig.j['spine'], loc=(0.112, -0.201, 0.205), rot=(-6, 0, -16))
        g.mesh_obj('pen', g.bm_cyl(0.008, 0.008, 0.06, seg=8), M('pen_b', '#2B3A5E', 0.3), rig.j['spine'],
                   loc=(-0.11, -0.196, 0.19))
        bt = M('teller_bowtie', '#2A2A30', 0.45)        # black bow tie at the collar (classic counter clerk)
        for s_ in (-1, 1):
            g.mesh_obj('bowtie_w', g.bm_ellipsoid(0.036, 0.014, 0.024, 12, 8), bt, rig.j['chest'],
                       loc=(s_ * 0.032, -0.160, 0.058), rot=(0, s_ * -14, 0))
        g.mesh_obj('bowtie_k', g.bm_ellipsoid(0.014, 0.013, 0.015, 10, 6), bt, rig.j['chest'], loc=(0, -0.170, 0.058))


@part('acc_visor', 'hat', 'head', {'main': sub(None, Z['hat'])}, cls='top', tags=['bank', 'job'],
      ages=['adult', 'elder'], label={'ko': '은행원 차양모', 'en': 'green eyeshade'})
def b_acc_visor(rig, ctx, put):
    _lazy()
    with put('main'):
        bandm = M('visor_band', '#2F5E48', 0.5)
        cb.tilted_ring(rig, 'visor_band', bandm, tb.HEAD_R[0] * 1.11, 0.022, 0.40, 0.18, sy=1.0, rz=1.6)
        shade = M('visor_green', '#3FA06A', 0.25, alpha=0.78, emission='#5CC08A', emission_strength=0.05)
        vis = vd.sector_lathe([(0.330, 0.0), (0.400, -0.030), (0.450, -0.075)], keep_deg=58, seg=48, sy=0.98)
        vd.ho(rig, 'visor', vis, shade, loc=(0, 0.0, 0.135), rot=(-10, 0, 0))
        edge = g.bm_ring(0.452, 0.007, seg=48, segr=6, sy=0.98, u0=-PI / 2 - math.radians(58),
                         u1=-PI / 2 + math.radians(58), closed=False)
        vd.ho(rig, 'visor_edge', edge, bandm, loc=(0, 0.0, 0.060), rot=(-10, 0, 0))


# =========================================================================== warehouse / delivery / movers

WORKJ = [(0.252, -0.10), (0.246, -0.03), (0.224, 0.10), (0.218, 0.22), (0.203, 0.31), (0.162, 0.39),
         (0.07, 0.45), (0.0, 0.46)]


@part('top_work_jacket', 'top', 'body',
      {'main': sub('top', Z['top']), 'collar': sub('top2', Z['top_detail']), 'trim': sub(None, Z['top_detail'] + 0.3)},
      tags=['job', 'work', 'warm'], ages=['adult'], label={'ko': '작업 재킷', 'en': 'work jacket'})
def b_top_work_jacket(rig, ctx, put):
    _lazy()
    m = M('workj', ctx.col('top'), 0.9)
    md = M('workj_d', ctx.col('top', 0.82), 0.9)
    with put('main'):
        tp._torso(WORKJ, m, rig, sy=0.85)
        g.mesh_obj('placket', vd.sector_lathe([(0.256, -0.10), (0.248, -0.03), (0.226, 0.10), (0.220, 0.22),
                                               (0.205, 0.31)], keep_deg=4, sy=0.855), md, rig.j['spine'])
        for s in (-1, 1):
            g.mesh_obj('chest_pocket', g.bm_box(0.075, 0.016, 0.070, bevel=0.008), m, rig.j['spine'],
                       loc=(s * 0.100, -0.196, 0.205), rot=(-6, 0, s * 12))
            g.mesh_obj('chest_flap', g.bm_box(0.080, 0.020, 0.024, bevel=0.006), md, rig.j['spine'],
                       loc=(s * 0.100, -0.204, 0.245), rot=(-6, 0, s * 12))
            g.mesh_obj('hip_pocket', g.bm_box(0.090, 0.016, 0.075, bevel=0.010), md, rig.j['spine'],
                       loc=(s * 0.140, -0.214, -0.050), rot=(0, 0, s * 24))
        g.mesh_obj('hem', g.bm_ring(0.250, 0.016, seg=56, segr=8, sy=0.85, rz=1.2), md, rig.j['spine'],
                   loc=(0, 0, -0.092))
    with put('collar'):
        cm = M('cord', ctx.col('top2'), 0.95)
        for s in (-1, 1):
            g.mesh_obj('collar', g.bm_ellipsoid(0.075, 0.026, 0.044, 14, 8), cm, rig.j['chest'],
                       loc=(s * 0.064, -0.098, 0.092), rot=(34, s * 20, s * 26))
        g.mesh_obj('collar_back', g.bm_ring(0.135, 0.030, seg=40, segr=8, sy=0.92, rz=1.2, u0=PI * 0.15,
                                            u1=PI * 0.85, closed=False), cm, rig.j['chest'], loc=(0, 0.012, 0.096))
    with put('trim'):
        brass = M('wj_btn', '#B8894A', 0.35, metal=0.5)
        for z in (-0.06, 0.04, 0.14, 0.24):
            p = cb.front_point(z, tp2_interp(WORKJ, z), 0.006)
            g.mesh_obj('button', g.bm_ellipsoid(0.015, 0.009, 0.015, 10, 6), brass, rig.j['spine'], loc=p)
        g.mesh_obj('pencil', g.bm_cyl(0.008, 0.008, 0.075, seg=8), M('pencil', '#F2C230', 0.5), rig.j['spine'],
                   loc=(-0.112, -0.188, 0.235), rot=(0, 8, 0))


@part('acc_gloves', 'hand', 'body', {'cuff_R': follow_hand('hands', 'hand_R'), 'cuff_L': follow_hand('hands', 'hand_L')},
      tags=['work', 'job'], ages=['adult'], label={'ko': '작업 장갑', 'en': 'work gloves'})
def b_acc_gloves(rig, ctx, put):
    _lazy()
    gm = M('glove_cuff', ctx.col('hands'), 0.8)
    for n in ('R', 'L'):
        with put('cuff_' + n):
            g.mesh_obj('gauntlet_' + n, g.bm_lathe([(0.050, 0.010), (0.062, 0.040), (0.072, 0.075)], seg=24, sy=0.95,
                                                   smooth_n=6, cap_top=False, cap_bottom=False), gm,
                       rig.j['hand_' + n], loc=(0, 0, 0.0))
            g.mesh_obj('gauntlet_rim_' + n, g.bm_ring(0.072, 0.009, seg=24, segr=6), M('glove_rim', ctx.col('hands', 0.75),
                                                                                       0.8),
                       rig.j['hand_' + n], loc=(0, 0, 0.075))


@part('hat_delivery_cap', 'hat', 'head', {'main': sub('hat', Z['hat']), 'visor': sub('hat2', Z['hat_detail']),
                                          'logo': sub(None, Z['hat_detail'] + 0.2)},
      cls='full', tags=['job', 'delivery', 'jobhat'], ages=['adult'], label={'ko': '택배 모자', 'en': 'courier cap'})
def b_hat_delivery_cap(rig, ctx, put):
    _lazy()
    with put('main'):
        cap = M('dcap', ctx.col('hat'), 0.75)
        cb.cap_shell(rig, cap, lambda x, y: 0.25 - 0.17 * y, base=1.13, puff=0.16, name='cap', soft=0.03)
        vd.ho(rig, 'cap_btn', g.bm_ellipsoid(0.03, 0.03, 0.022, 10, 6), cap, loc=(0, 0.0, 0.340))
        for k in range(6):                    # panel seams
            a = TAU * k / 6
            seam = g.bm_ring(0.31, 0.006, seg=24, segr=4, u0=PI * 0.08, u1=PI * 0.5, closed=False)
            g.bm_transform(seam, Matrix.Rotation(PI / 2, 4, 'Y'))
            vd.ho(rig, 'seam', seam, M('dcap_s', ctx.col('hat', 0.78), 0.8), loc=(0, 0, 0.04),
                  rot=(0, 0, math.degrees(a)))
    with put('visor'):
        visor = g.bm_lathe([(0.0, 0.0), (0.18, 0.0), (0.19, -0.010), (0.0, -0.014)], seg=32, sy=0.72)
        vd.ho(rig, 'cap_visor', visor, M('dcap_v', ctx.col('hat2'), 0.6), loc=(0, -0.27, 0.125), rot=(-12, 0, 0))
    with put('logo'):
        q = Quaternion((1, 0, 0), math.radians(-22))
        vd.ho(rig, 'logo_bg', g.bm_box(0.150, 0.012, 0.110, bevel=0.016), M('logo_bg', '#FBF8F0', 0.5),
              loc=(0, -0.316, 0.215), rot=q)
        vd.ho(rig, 'logo_box', g.bm_box(0.090, 0.014, 0.070, bevel=0.006), M('logo_box', '#E08A2E', 0.5),
              loc=(0, -0.324, 0.208), rot=q)
        vd.ho(rig, 'logo_tape', g.bm_box(0.018, 0.014, 0.072, bevel=0.003), M('logo_tape', '#7A3A1A', 0.5),
              loc=(0, -0.329, 0.208), rot=q)


POLO = [(0.236, -0.085), (0.230, -0.02), (0.212, 0.10), (0.208, 0.22), (0.195, 0.31), (0.155, 0.39),
        (0.07, 0.45), (0.0, 0.46)]


@part('top_delivery_polo', 'top', 'body',
      {'main': sub('top', Z['top']), 'trim': sub('top2', Z['top_detail']), 'logo': sub(None, Z['top_detail'] + 0.3),
       'short_R': follow('top', 'arm_R'), 'short_L': follow('top', 'arm_L')},
      tags=['job', 'delivery'], ages=['adult'], label={'ko': '택배 셔츠', 'en': 'courier polo'})
def b_top_delivery_polo(rig, ctx, put):
    _lazy()
    with put('main'):
        tp._torso(POLO, M('polo', ctx.col('top'), 0.85), rig, sy=0.85)
        g.mesh_obj('hem', g.bm_ring(0.234, 0.014, seg=56, segr=8, sy=0.85, rz=1.2), M('polo_d', ctx.col('top', 0.85),
                                                                                     0.85),
                   rig.j['spine'], loc=(0, 0, -0.078))
    with put('trim'):
        tm = M('polo_trim', ctx.col('top2'), 0.75)
        for s in (-1, 1):
            g.mesh_obj('collar', g.bm_ellipsoid(0.066, 0.022, 0.040, 14, 8), tm, rig.j['chest'],
                       loc=(s * 0.052, -0.110, 0.086), rot=(32, s * 18, s * 22))
        g.mesh_obj('collar_band', g.bm_ring(0.128, 0.022, seg=40, segr=8, sy=0.92, rz=1.2, u0=PI * 0.1,
                                            u1=PI * 0.9, closed=False), tm, rig.j['chest'], loc=(0, 0.012, 0.090))
        g.mesh_obj('placket', g.bm_box(0.030, 0.010, 0.100, bevel=0.004), tm, rig.j['spine'], loc=(0, -0.200, 0.300))
        for z in (0.27, 0.32):
            g.mesh_obj('pbtn', g.bm_ellipsoid(0.010, 0.006, 0.010, 8, 6), M('pbtn', '#F4F1EA', 0.4), rig.j['spine'],
                       loc=(0, -0.207, z))
        g.mesh_obj('side_stripe', band(POLO, 0.12, 0.15, out=0.003, keep=40, center=0), tm, rig.j['spine'])
    with put('logo'):
        # big parcel logo on a white patch, chest and back (the courier reads at phone zoom)
        for (lx, ly, lz, rz_), sc in (((0.0, -0.212, 0.150, 0.0), 1.0), ((0.0, 0.200, 0.200, 180.0), 1.25)):
            g.mesh_obj('logo_bg', g.bm_box(0.150 * sc, 0.010, 0.110 * sc, bevel=0.016), M('logo_bg', '#FBF8F0', 0.5),
                       rig.j['spine'], loc=(lx, ly, lz), rot=(-4, 0, rz_))
            dy = -0.006 if ly < 0 else 0.006
            g.mesh_obj('logo_box', g.bm_box(0.090 * sc, 0.012, 0.068 * sc, bevel=0.006), M('logo_box', '#E08A2E', 0.5),
                       rig.j['spine'], loc=(lx, ly + dy, lz - 0.004), rot=(-4, 0, rz_))
            g.mesh_obj('logo_tape', g.bm_box(0.018 * sc, 0.012, 0.070 * sc, bevel=0.003), M('logo_tape', '#7A3A1A', 0.5),
                       rig.j['spine'], loc=(lx, ly + 2 * dy, lz - 0.004), rot=(-4, 0, rz_))
        g.mesh_obj('pen', g.bm_cyl(0.008, 0.008, 0.06, seg=8), M('pen_r', '#C8343A', 0.3), rig.j['spine'],
                   loc=(-0.105, -0.192, 0.22))
    for n in ('R', 'L'):
        with put('short_' + n):
            sm = M('polo_sleeve', ctx.col('top'), 0.85)
            g.mesh_obj('short_' + n, g.bm_capsule(0.084, 0.060, r_end=0.082, seg=24, rings=8), sm, rig.j['sh_' + n],
                       loc=(0, 0, 0.0))
            g.mesh_obj('short_rib_' + n, g.bm_ring(0.082, 0.012, seg=24, segr=6, rz=1.3),
                       M('polo_rib', ctx.col('top2'), 0.8), rig.j['sh_' + n], loc=(0, 0, -0.072))


@part('bot_mover_overalls', 'bottom', 'body',
      {'main': sub('bottom', Z['pants']), 'pads': sub(None, Z['pants'] + 0.5), 'bib': sub('bottom', Z['bib'])},
      tags=['work', 'job'], ages=['adult'], label={'ko': '이삿짐 작업복', 'en': 'mover overalls'})
def b_bot_mover_overalls(rig, ctx, put):
    _lazy()
    om = M('movr', ctx.col('bottom'), 0.85)
    omd = M('movr_d', ctx.col('bottom', 0.82), 0.85)
    with put('main'):
        tp._seat(rig, om, hem_r=0.226, top_z=0.10)
        tp._legs(rig, om, thigh=0.080, shin=0.070)
        g.mesh_obj('cargo', g.bm_box(0.030, 0.070, 0.070, bevel=0.010), omd, rig.j['hip_R'], loc=(-0.078, -0.01, -0.09))
        g.mesh_obj('hammer_loop', g.bm_ring(0.022, 0.006, seg=16, segr=6), omd, rig.j['hip_L'],
                   loc=(0.082, 0.0, -0.05), rot=(0, 90, 0))
    with put('pads'):
        pm = M('kneepad', '#2E2E36', 0.55)
        for n in ('R', 'L'):
            g.mesh_obj('kneepad_' + n, g.bm_ellipsoid(0.066, 0.034, 0.064, 16, 10), pm, rig.j['knee_' + n],
                       loc=(0, -0.066, 0.0))
            g.mesh_obj('kneepad_strap_' + n, g.bm_ring(0.072, 0.008, seg=24, segr=6, rz=1.6), pm, rig.j['knee_' + n],
                       loc=(0, 0, -0.035))
    with put('bib'):
        g.mesh_obj('bib', vd.sector_lathe([(0.228, -0.02), (0.224, 0.10), (0.216, 0.20), (0.208, 0.28)], keep_deg=34,
                                          sy=0.88), om, rig.j['spine'])
        g.mesh_obj('bib_pocket', vd.sector_lathe([(0.230, 0.10), (0.225, 0.21)], keep_deg=20, sy=0.88), omd,
                   rig.j['spine'])
        for s in (-1, 1):
            g.mesh_obj('strap', g.bm_tube_path([(s * 0.080, -0.172, 0.27), (s * 0.095, -0.12, 0.40),
                                                (s * 0.095, 0.02, 0.44), (s * 0.085, 0.17, 0.32), (s * 0.08, 0.19, 0.10)],
                                               0.016, segr=6, side_ref=(1, 0, 0), flat=2.2), om, rig.j['spine'])
            g.mesh_obj('buckle', g.bm_box(0.034, 0.012, 0.030, bevel=0.005), M('mbuckle', '#C9CED6', 0.3, metal=0.6),
                       rig.j['spine'], loc=(s * 0.080, -0.190, 0.268))


@part('acc_back_brace', 'belt', 'body', {'main': sub('acc', Z3['brace'])}, tags=['work', 'job'], ages=['adult'],
      label={'ko': '허리 보호대', 'en': 'back brace'})
def b_acc_back_brace(rig, ctx, put):
    _lazy()
    with put('main'):
        bm_ = M('brace', ctx.col('acc'), 0.6)
        g.mesh_obj('brace_belt', g.bm_lathe([(0.250, -0.02), (0.254, 0.04), (0.246, 0.11)], seg=56, sy=0.86,
                                            cap_top=False, cap_bottom=False), bm_, rig.j['spine'])
        g.mesh_obj('brace_panel', vd.sector_lathe([(0.258, -0.01), (0.262, 0.04), (0.252, 0.10)], keep_deg=26,
                                                  sy=0.86), M('brace_d', ctx.col('acc', 0.72), 0.6), rig.j['spine'])
        for s in (-1, 1):
            g.mesh_obj('brace_strap', g.bm_tube_path([(s * 0.090, -0.20, 0.11), (s * 0.10, -0.15, 0.34),
                                                      (s * 0.10, 0.0, 0.44), (s * 0.09, 0.17, 0.33),
                                                      (s * 0.085, 0.215, 0.11)], 0.011, segr=6, side_ref=(1, 0, 0),
                                                     flat=2.0), bm_, rig.j['spine'])


HIVISJ = [(0.256, -0.10), (0.250, -0.03), (0.228, 0.10), (0.220, 0.22), (0.205, 0.31), (0.163, 0.39),
          (0.07, 0.45), (0.0, 0.46)]


@part('top_hivis_jacket', 'top', 'body',
      {'main': sub('top', Z['top']), 'strips': sub(None, Z['top_detail'] + 0.4),
       'band_R': follow(None, 'arm_R'), 'band_L': follow(None, 'arm_L')},
      tags=['job', 'work', 'warm'], ages=['adult'], label={'ko': '형광 작업 점퍼', 'en': 'hi-vis jacket'})
def b_top_hivis_jacket(rig, ctx, put):
    _lazy()
    m = M('hvj', ctx.col('top'), 0.6, emission='#FFFFFF', emission_strength=0.02)
    with put('main'):
        tp._torso(HIVISJ, m, rig, sy=0.85)
        g.mesh_obj('collar', g.bm_ring(0.138, 0.040, seg=48, segr=10, sy=0.92, rz=1.3), m, rig.j['chest'],
                   loc=(0, 0.012, 0.096))
        g.mesh_obj('zip', g.bm_box(0.014, 0.012, 0.36, bevel=0.004), M('hvj_zip', '#3A3A44', 0.5), rig.j['spine'],
                   loc=(0, -0.214, 0.12))
        for s in (-1, 1):
            g.mesh_obj('pocket', g.bm_box(0.085, 0.016, 0.060, bevel=0.008), M('hvj_d', ctx.col('top', 0.85), 0.6),
                       rig.j['spine'], loc=(s * 0.140, -0.212, -0.040), rot=(0, 0, s * 24))
    with put('strips'):
        sm = reflect_mat()
        for zc in (-0.055, 0.075):
            g.mesh_obj('hstrip', band(HIVISJ, zc - 0.017, zc + 0.017, out=0.006), sm, rig.j['spine'])
        for s in (-1, 1):
            g.mesh_obj('brace_tape', g.bm_tube_path([(s * 0.11, -0.19, 0.09), (s * 0.13, -0.15, 0.30),
                                                     (s * 0.13, 0.0, 0.43), (s * 0.12, 0.16, 0.32),
                                                     (s * 0.11, 0.20, 0.09)], 0.013, segr=6, side_ref=(1, 0, 0),
                                                    flat=2.2), sm, rig.j['spine'])
    for n in ('R', 'L'):
        with put('band_' + n):
            limb_ring(rig, 'hv_band_' + n, reflect_mat(), 'el_' + n, -0.055, R=0.074, r=0.016, rz=1.3)
            limb_ring(rig, 'hv_band2_' + n, reflect_mat(), 'sh_' + n, -0.075, R=0.078, r=0.014, rz=1.3)


@part('acc_toolbelt', 'belt', 'body', {'main': sub('bag', Z3['toolbelt']), 'tools': sub(None, Z3['toolbelt'] + 0.5)},
      tags=['work', 'job'], ages=['adult'], label={'ko': '공구 벨트', 'en': 'tool belt'})
def b_acc_toolbelt(rig, ctx, put):
    _lazy()
    lm = M('tbelt', ctx.col('bag'), 0.6)
    lmd = M('tbelt_d', ctx.col('bag', 0.78), 0.6)
    with put('main'):
        g.mesh_obj('belt', g.bm_ring(0.252, 0.028, seg=56, segr=8, sy=0.86, rz=1.0), lm, rig.j['spine'],
                   loc=(0, 0, -0.035))
        for s in (-1, 1):
            g.mesh_obj('pouch', g.bm_box(0.085, 0.060, 0.100, bevel=0.016), lm, rig.j['spine'],
                       loc=(s * 0.210, -0.120, -0.090), rot=(0, 0, s * 40))
            g.mesh_obj('pouch_flap', g.bm_box(0.090, 0.064, 0.026, bevel=0.010), lmd, rig.j['spine'],
                       loc=(s * 0.212, -0.122, -0.040), rot=(-6, 0, s * 40))
        g.mesh_obj('buckle', g.bm_box(0.050, 0.016, 0.040, bevel=0.006), M('tb_buckle', '#C9CED6', 0.3, metal=0.6),
                   rig.j['spine'], loc=(0, -0.220, -0.035))
    with put('tools'):
        wood = M('hammer_wood', '#C98F55', 0.6)
        steel = M('hammer_steel', '#9AA4B2', 0.3, metal=0.8)
        g.mesh_obj('hammer_handle', g.bm_cyl(0.012, 0.012, 0.18, seg=10), wood, rig.j['spine'],
                   loc=(0.252, -0.04, -0.20))
        g.mesh_obj('hammer_head', g.bm_box(0.026, 0.080, 0.026, bevel=0.006), steel, rig.j['spine'],
                   loc=(0.252, -0.04, -0.02))
        g.mesh_obj('tape', g.bm_box(0.050, 0.030, 0.050, bevel=0.012), M('tape', '#F2C230', 0.45), rig.j['spine'],
                   loc=(-0.155, -0.190, -0.06), rot=(0, 0, -30))
        for k in (-1, 1):
            g.mesh_obj('plier', g.bm_cyl(0.008, 0.007, 0.07, seg=8), M('plier', '#D9483B', 0.4), rig.j['spine'],
                       loc=(0.205 + 0.012 * k, -0.150, -0.05), rot=(0, k * 6, 0))


@part('acc_camera', 'neck', 'body', {'main': sub(None, Z3['camera'])}, tags=['press'], ages=['adult', 'elder'],
      label={'ko': '기자 카메라', 'en': 'press camera'})
def b_acc_camera(rig, ctx, put):
    _lazy()
    with put('main'):
        strap = M('cam_strap', '#5A3A26', 0.7)
        g.mesh_obj('cam_strap', g.bm_tube_path([(-0.10, -0.150, -0.08), (-0.13, -0.10, 0.06), (-0.11, 0.02, 0.12),
                                                (0.0, 0.10, 0.14), (0.11, 0.02, 0.12), (0.13, -0.10, 0.06),
                                                (0.10, -0.150, -0.08)], 0.008, segr=6), strap, rig.j['chest'])
        # retro press camera, 1.4x the first pass, with a big silver flash reflector on a stalk (the reporter's
        # icon at phone zoom) and a red PRESS tag on the strap
        body = M('cam_body', '#2A2A30', 0.4)
        chrome = M('cam_chrome', '#D7DFE8', 0.2, metal=0.8)
        g.mesh_obj('cam', g.bm_box(0.26, 0.075, 0.140, bevel=0.020), body, rig.j['chest'], loc=(0, -0.215, -0.125))
        g.mesh_obj('cam_top', g.bm_box(0.24, 0.062, 0.026, bevel=0.008), chrome, rig.j['chest'], loc=(0, -0.215, -0.044))
        g.mesh_obj('lens', g.bm_cyl(0.055, 0.050, 0.070, seg=24), M('cam_lens', '#3A3A44', 0.3), rig.j['chest'],
                   loc=(0, -0.252, -0.13), rot=(90, 0, 0))
        g.mesh_obj('lens_ring', g.bm_ring(0.054, 0.008, seg=24, segr=6), chrome, rig.j['chest'],
                   loc=(0, -0.288, -0.13), rot=(90, 0, 0))
        g.mesh_obj('lens_glass', g.bm_cyl(0.040, 0.040, 0.006, seg=20), M('cam_glass', '#7AA6D8', 0.1,
                                                                           emission='#A8D0F8',
                                                                           emission_strength=0.35),
                   rig.j['chest'], loc=(0, -0.322, -0.13), rot=(90, 0, 0))
        g.mesh_obj('flash_stalk', g.bm_cyl(0.010, 0.010, 0.09, seg=8), chrome, rig.j['chest'],
                   loc=(0.105, -0.215, -0.040))
        g.mesh_obj('flash', g.bm_lathe([(0.016, 0.0), (0.060, 0.030), (0.070, 0.040)], seg=24, cap_top=False),
                   M('flash_dish', '#EEF2F8', 0.18, metal=0.55), rig.j['chest'], loc=(0.105, -0.228, 0.050),
                   rot=(70, 0, 0))
        g.mesh_obj('flash_bulb', g.bm_ellipsoid(0.020, 0.020, 0.020, 10, 8), M('bulb', '#FFF6D8', 0.2,
                                                                                emission='#FFF2C0',
                                                                                emission_strength=0.7),
                   rig.j['chest'], loc=(0.105, -0.242, 0.060))
        g.mesh_obj('press_tag', g.bm_box(0.050, 0.010, 0.030, bevel=0.004), M('press_tag', '#C8343A', 0.5),
                   rig.j['chest'], loc=(-0.12, -0.135, 0.02), rot=(-30, 0, 20))


@part('held_notepad', 'hand', 'body', {'main': dict(sub(None, Z3['item']), zfrontFollow='hand_L')},
      tags=['item', 'press'], ages=['adult', 'elder'], label={'ko': '취재 수첩', 'en': "reporter's notepad"})
def b_held_notepad(rig, ctx, put):
    """Flip pad in the left mitten (parented to the hand: it turns with it) + a pencil behind it."""
    _lazy()
    j = rig.j['hand_L']
    with put('main'):
        g.mesh_obj('pad', g.bm_box(0.075, 0.016, 0.100, bevel=0.006), M('pad_w', '#F7F2E2', 0.6), j,
                   loc=(0.0, -0.045, -0.035), rot=(18, 0, 0))
        g.mesh_obj('pad_cover', g.bm_box(0.077, 0.010, 0.030, bevel=0.004), M('pad_c', '#C8343A', 0.5), j,
                   loc=(0.0, -0.040, 0.020), rot=(-40, 0, 0))
        g.mesh_obj('pad_ring', g.bm_cyl(0.006, 0.006, 0.07, seg=8), M('pad_r', '#9AA4B2', 0.3, metal=0.7), j,
                   loc=(-0.035, -0.045, 0.012), rot=(0, 90, 0))
        for k in range(3):
            g.mesh_obj('pad_line', g.bm_box(0.050, 0.004, 0.004, bevel=0.0), M('pad_l', '#7AA6D8', 0.6), j,
                       loc=(0.0, -0.055 + 0.002 * k, -0.02 - 0.022 * k), rot=(18, 0, 0))


TRENCH = [(0.292, -0.24), (0.274, -0.12), (0.244, 0.0), (0.218, 0.10), (0.212, 0.22), (0.198, 0.31), (0.158, 0.39),
          (0.07, 0.45), (0.0, 0.46)]


@part('top_trench', 'top', 'body',
      {'main': sub('top', Z['top']), 'trim': sub(None, Z['top_detail'] + 0.3),
       'cuff_R': follow('top', 'arm_R'), 'cuff_L': follow('top', 'arm_L')},
      tags=['smart', 'warm', 'detective'], ages=['adult', 'elder'], label={'ko': '트렌치코트', 'en': 'trench coat'})
def b_top_trench(rig, ctx, put):
    _lazy()
    m = M('trench', ctx.col('top'), 0.75)
    md = M('trench_d', ctx.col('top', 0.80), 0.75)
    with put('main'):
        tp._torso(TRENCH, m, rig, sy=0.86)
        # popped collar: stands up around the neck, open in front
        col = vd.sector_lathe([(0.150, 0.0), (0.168, 0.06), (0.180, 0.12)], keep_deg=150, seg=48, sy=0.92,
                              center_deg=180)
        g.mesh_obj('collar_up', col, md, rig.j['chest'], loc=(0, 0.010, 0.070))
        for s in (-1, 1):
            g.mesh_obj('lapel', vd.sector_lathe([(0.226, 0.15), (0.216, 0.24), (0.205, 0.31), (0.172, 0.38)],
                                                keep_deg=13, sy=0.87, center_deg=s * 24), md, rig.j['spine'])
            g.mesh_obj('epaulette', g.bm_box(0.10, 0.055, 0.016, bevel=0.007), md, rig.j['chest'],
                       loc=(s * 0.13, 0.0, 0.062), rot=(0, s * -22, 0))
            g.mesh_obj('slash_pocket', g.bm_box(0.080, 0.014, 0.014, bevel=0.004), md, rig.j['spine'],
                       loc=(s * 0.16, -0.218, -0.08), rot=(0, 30, s * 26))
        # storm flap on the right chest + belt with a buckle
        g.mesh_obj('storm_flap', vd.sector_lathe([(0.220, 0.16), (0.214, 0.24), (0.202, 0.30)], keep_deg=18, sy=0.87,
                                                 center_deg=-28), md, rig.j['spine'])
        g.mesh_obj('belt', g.bm_ring(0.246, 0.026, seg=56, segr=8, sy=0.86, rz=1.3), md, rig.j['spine'],
                   loc=(0, 0, 0.040))
        g.mesh_obj('belt_end', g.bm_tube_path([(0.06, -0.216, 0.04), (0.09, -0.222, 0.00), (0.10, -0.220, -0.08)],
                                              0.012, segr=6, side_ref=(1, 0, 0), flat=2.0), md, rig.j['spine'])
    with put('trim'):
        btn = M('trench_btn', '#4A3226', 0.4)
        for s in (-1, 1):
            for z in (-0.12, -0.03, 0.15, 0.23):
                if -0.01 < z < 0.10:
                    continue
                p = cb.front_point(z, tp2_interp(TRENCH, z), 0.006)
                g.mesh_obj('button', g.bm_ellipsoid(0.016, 0.010, 0.016, 10, 6), btn, rig.j['spine'],
                           loc=(s * 0.070, p[1] + 0.004 * abs(s), p[2]))
        g.mesh_obj('buckle', g.bm_box(0.046, 0.016, 0.040, bevel=0.006), M('trench_buckle', '#3A2A20', 0.4),
                   rig.j['spine'], loc=(0.03, -0.226, 0.040))
    for n in ('R', 'L'):
        with put('cuff_' + n):
            limb_ring(rig, 'trench_cuff_' + n, M('trench_cuff', ctx.col('top', 0.8), 0.75), 'el_' + n,
                      -cb.FOREARM + 0.030, R=0.070, r=0.014, rz=1.6)


@part('hat_deerstalker', 'hat', 'head', {'main': sub('hat', Z['hat']), 'check': sub('hat2', Z['hat_detail'])},
      cls='full', tags=['detective', 'jobhat'], ages=['adult', 'elder'], label={'ko': '탐정 모자', 'en': 'deerstalker'})
def b_hat_deerstalker(rig, ctx, put):
    _lazy()
    m = M('deer', ctx.col('hat'), 0.92)
    with put('main'):
        cb.cap_shell(rig, m, lambda x, y: 0.20 - 0.08 * y, base=1.14, puff=0.16, name='crown', soft=0.03)
        vd.ho(rig, 'crown_btn', g.bm_ellipsoid(0.030, 0.030, 0.022, 10, 6), m, loc=(0, 0.0, 0.345))
        for side in (-1, 1):            # two peaks: front and back
            pk = g.bm_lathe([(0.0, 0.0), (0.15, 0.0), (0.16, -0.010), (0.0, -0.014)], seg=32, sy=0.62)
            vd.ho(rig, 'peak', pk, m, loc=(0, side * 0.27, 0.11), rot=(side * 14, 0, 0))
        for s in (-1, 1):                # ear flaps tied up over the crown
            vd.ho(rig, 'flap', vd.fuzz(g.bm_ellipsoid(0.045, 0.10, 0.11, 14, 8), 0.003, 30.0), m,
                  loc=(s * 0.305, 0.0, 0.12), rot=(0, s * -26, 0))
        tie = M('deer_tie', ctx.col('hat', 0.65), 0.8)
        vd.ho(rig, 'flap_tie', g.bm_ellipsoid(0.040, 0.020, 0.022, 10, 6), tie, loc=(0, 0.0, 0.365))
        for s in (-1, 1):
            vd.ho(rig, 'tie_loop', g.bm_ellipsoid(0.030, 0.012, 0.020, 10, 6), tie, loc=(s * 0.038, 0.0, 0.370),
                  rot=(0, s * 20, 0))
    with put('check'):
        cm = M('deer_check', ctx.col('hat2'), 0.9)

        def edge(x, y):
            return 0.20 - 0.08 * y

        def radial(x, y, z):
            t = cb.smoothstep(edge(x, y) - 0.02, edge(x, y) + 0.04, z)
            az = math.atan2(x, -y)
            lines = max(cb.smoothstep(0.86, 0.97, abs(math.cos(az * 5.0))),
                        cb.smoothstep(0.86, 0.97, abs(math.cos(z * 13.0))))
            base = 1.0 + 0.16 * max(0.0, z) ** 2
            return (0.90 + (1.152 - 0.90) * t * lines) * base
        cb.shell(rig, cm, radial, 'check_lines', seg=112, rings=56)


# =========================================================================== polish: job looks that read at phone zoom
# (the first pass made several jobs look like random residents at 0.6x: warehouse crew, forklift drivers,
#  demolition crews and reporters each get one big, unmistakable cue)

LGX_PROF = [(0.266, -0.08), (0.260, 0.0), (0.236, 0.12), (0.228, 0.24), (0.212, 0.31), (0.170, 0.38)]


@part('det_lgx_vest', 'job', 'body', {'main': sub('acc', Z['vest']), 'trim': sub(None, Z['vest'] + 0.5)},
      tags=['job', 'work', 'logistics'], ages=['adult'], label={'ko': '물류센터 조끼', 'en': 'logistics crew vest'})
def b_det_lgx_vest(rig, ctx, put):
    """Logistics-centre crew vest in the centre's sky-blue (tint 'acc'), sunflower-yellow bands (the centre's door /
    sign yellow) and the parcel logo on the left chest and big on the back."""
    _lazy()
    with put('main'):
        g.mesh_obj('lgx_vest', cb.vest_lathe(LGX_PROF, gap_deg=14, seg=48, sy=0.88), M('lgxv', ctx.col('acc'), 0.6),
                   rig.j['spine'])
    with put('trim'):
        yel = M('lgx_yel', '#F2C230', 0.45, emission='#FFE070', emission_strength=0.05)
        navy = M('lgx_navy', '#2B4F7E', 0.5)
        for z in (0.035,):
            bm = vd.sector_lathe([(0.270, z - 0.022), (0.270, z + 0.022)], keep_deg=172, sy=0.885)
            kill = [f for f in bm.faces if abs(math.degrees(math.atan2(f.calc_center_median().x,
                                                                       -f.calc_center_median().y))) < 14]
            bmesh.ops.delete(bm, geom=kill, context='FACES')
            g.mesh_obj('lgx_band', bm, yel, rig.j['spine'])
        for (lx, ly, lz, rz_), k in (((0.118, -0.205, 0.215, -18.0), 1.0), ((0.0, 0.214, 0.190, 180.0), 1.6)):
            dy = -0.007 if ly < 0 else 0.007
            g.mesh_obj('lgx_logo', g.bm_box(0.074 * k, 0.010, 0.066 * k, bevel=0.010 * k), yel, rig.j['spine'],
                       loc=(lx, ly, lz), rot=(-4, 0, rz_))
            g.mesh_obj('lgx_glyph', g.bm_box(0.040 * k, 0.010, 0.034 * k, bevel=0.004 * k), navy, rig.j['spine'],
                       loc=(lx, ly + dy, lz - 0.004 * k), rot=(-4, 0, rz_))
            g.mesh_obj('lgx_glyph_lid', g.bm_box(0.046 * k, 0.010, 0.010 * k, bevel=0.002 * k), navy, rig.j['spine'],
                       loc=(lx, ly + dy, lz + 0.018 * k), rot=(-4, 0, rz_))


@part('hat_bump_cap', 'hat', 'head', {'main': sub('hat', Z['hat']), 'visor': sub('hat2', Z['hat_detail']),
                                      'muffs': sub(None, Z['hat_detail'] + 0.3)},
      cls='full', tags=['job', 'jobhat', 'logistics'], ages=['adult'],
      label={'ko': '안전 캡 + 귀덮개', 'en': 'bump cap + ear defenders'})
def b_hat_bump_cap(rig, ctx, put):
    """Forklift driver: a baseball-style bump cap (hat_cap's shell) under big red ear defenders on a black band."""
    _lazy()
    tp.PARTS['hat_cap'].fn(rig, ctx, put)
    with put('muffs'):
        cup = M('muff_cup', '#D9483B', 0.35)
        pad = M('muff_pad', '#2A2A30', 0.6)
        band = M('muff_band', '#2A2A30', 0.4)
        for s_ in (-1, 1):
            vd.ho(rig, 'muff', g.bm_ellipsoid(0.052, 0.086, 0.094, 18, 10), cup, loc=(s_ * 0.335, 0.010, -0.020))
            vd.ho(rig, 'muff_pad', g.bm_ring(0.070, 0.020, seg=24, segr=6, rz=1.2), pad,
                  loc=(s_ * 0.300, 0.010, -0.020), rot=(0, 90, 0))
            vd.ho(rig, 'muff_dot', g.bm_ellipsoid(0.012, 0.030, 0.030, 10, 6), M('muff_dot', '#F4F1EA', 0.4),
                  loc=(s_ * 0.386, 0.010, -0.010))
        pts = [(-0.345, 0.012, 0.05), (-0.31, 0.014, 0.22), (-0.17, 0.016, 0.36), (0.0, 0.016, 0.405),
               (0.17, 0.016, 0.36), (0.31, 0.014, 0.22), (0.345, 0.012, 0.05)]
        vd.ho(rig, 'muff_band', g.bm_tube_path(vd.catmull3(pts, 24), 0.018, segr=6, side_ref=(0, 1, 0), flat=1.8),
              band)


@part('hat_demo_helmet', 'hat', 'head', {'main': sub('hat', Z['hat']), 'shield': sub(None, Z['hat_detail'] + 0.3)},
      cls='full', tags=['job', 'jobhat', 'demolition'], ages=['adult'],
      label={'ko': '철거 안전모 (보안면)', 'en': 'hard hat + face shield'})
def b_hat_demo_helmet(rig, ctx, put):
    """Demolition: hat_hardhat's shell with a clear face shield flipped up over the brim (black frame + pivots)."""
    _lazy()
    tp.PARTS['hat_hardhat'].fn(rig, ctx, put)
    with put('shield'):
        clear = M('demo_shield', '#CFEAF6', 0.12, alpha=0.62, emission='#E8F8FF', emission_strength=0.06)
        frame = M('demo_frame', '#2A2A30', 0.45)
        sh = vd.sector_lathe([(0.392, 0.0), (0.385, 0.06), (0.360, 0.13), (0.330, 0.17)], keep_deg=62, seg=48,
                             sy=1.0, center_deg=0)
        vd.ho(rig, 'shield', sh, clear, loc=(0, -0.01, 0.13), rot=(-12, 0, 0))
        edge = g.bm_ring(0.393, 0.011, seg=48, segr=6, sy=1.0, u0=-PI / 2 - math.radians(62),
                         u1=-PI / 2 + math.radians(62), closed=False)
        vd.ho(rig, 'shield_edge', edge, frame, loc=(0, -0.01, 0.13), rot=(-12, 0, 0))
        for s_ in (-1, 1):
            vd.ho(rig, 'pivot', g.bm_cyl(0.034, 0.034, 0.020, seg=16, centered=True), frame,
                  loc=(s_ * 0.360, 0.03, 0.155), rot=(0, 90, 0))


@part('acc_dust_mask', 'mask', 'head', {'main': sub(None, Z3['mask'])}, tags=['job', 'demolition'], ages=['adult'],
      label={'ko': '방진 마스크', 'en': 'dust mask'})
def b_acc_dust_mask(rig, ctx, put):
    """White dust mask over the nose and mouth with a little grey valve and thin elastic straps."""
    _lazy()
    rx, ry, rz = tb.HEAD_R
    with put('main'):
        wm = M('dust_mask', '#E4EAF0', 0.7)
        p, n = vf.surf(0.0, -0.140, 0.010)
        cup = g.bm_ellipsoid(0.112, 0.062, 0.088, 20, 12)
        vd.ho(rig, 'dust_cup', cup, wm, loc=(p.x, p.y + 0.030, p.z), rot=(-8, 0, 0))
        vd.ho(rig, 'dust_valve', g.bm_cyl(0.032, 0.032, 0.022, seg=16, centered=True), M('dust_valve', '#5A6270', 0.4),
              loc=(p.x + 0.035, p.y - 0.028, p.z - 0.020), rot=(90, 0, 0))
        vd.ho(rig, 'dust_seam', g.bm_ring(0.112, 0.006, seg=32, segr=4, sy=0.56, u0=PI * 1.05, u1=PI * 1.95,
                                          closed=False), M('dust_seam', '#D8D4CA', 0.7),
              loc=(p.x, p.y + 0.030, p.z), rot=(82, 0, 0))
        strap = M('dust_strap', '#3B3F4A', 0.6)
        for zz in (-0.09, -0.175):
            pts = []
            for k in range(17):                        # round the back of the head (a = 0 at the back)
                a = math.radians(-112 + 224 * k / 16)
                pts.append((rx * 1.03 * math.sin(a), ry * 1.03 * math.cos(a), zz))
            vd.ho(rig, 'dust_strap', g.bm_tube_path(pts, 0.007, segr=5), strap)


@part('hat_press_fedora', 'hat', 'head', {'main': sub('hat', Z['hat']), 'band': sub('hat2', Z['hat_detail']),
                                          'card': sub(None, Z['hat_detail'] + 0.3)},
      cls='full', tags=['press', 'jobhat'], ages=['adult', 'elder'], label={'ko': '기자 중절모', 'en': 'press fedora'})
def b_hat_press_fedora(rig, ctx, put):
    """Reporter: hat_fedora's shape with a white PRESS card tucked into the band (red stripe + type lines)."""
    _lazy()
    tp.PARTS['hat_fedora'].fn(rig, ctx, put)
    with put('card'):
        th = math.radians(30)                          # toward the wearer's right (screen-left from the front)
        r = 0.318                                      # outside the band (0.284 + 0.028 tube): sticks up from it
        x, y = -r * math.sin(th), -r * math.cos(th) * 0.93 + 0.01
        rot = (-8, 0, -math.degrees(th))
        vd.ho(rig, 'press_card', g.bm_box(0.124, 0.012, 0.092, bevel=0.008), M('press_w', '#FBF8F0', 0.5),
              loc=(x, y, 0.262), rot=rot)
        vd.ho(rig, 'press_red', g.bm_box(0.126, 0.014, 0.024, bevel=0.004), M('press_r', '#C8343A', 0.5),
              loc=(x, y - 0.003, 0.296), rot=rot)
        for k in range(2):
            vd.ho(rig, 'press_type', g.bm_box(0.084 - 0.024 * k, 0.014, 0.010, bevel=0.002), M('press_k', '#2A2A30', 0.5),
                  loc=(x, y - 0.004, 0.266 - 0.022 * k), rot=rot)


# =========================================================================== anim items

@part('held_box', 'item', 'body', {'main': sub(None, Z3['item_box'])}, tags=['anim_item'],
      label={'ko': '안고 나르는 상자', 'en': 'hugged box'})
def b_held_box(rig, ctx, put):
    """Cardboard box (built 1 m unit-ish, scaled per age by place_items3) on joint 'box_J'."""
    _lazy()
    if 'box_J' not in rig.j:
        rig.add('box_J', 'root', (0, 0, 0))
    j = rig.j['box_J']
    age = rig.meta.get('ch', {}).get('age') or 'adult'
    w, dep, h = ca.box_size(age)
    with put('main'):
        card = M('cardboard', '#C9A26B', 0.85)
        g.mesh_obj('box', g.bm_box(w, dep, h, bevel=0.012), card, j)
        tape = M('tape_b', '#E8D7A8', 0.5)
        g.mesh_obj('tape_top', g.bm_box(0.06, dep + 0.004, 0.006, bevel=0.002), tape, j, loc=(0, 0, h / 2))
        g.mesh_obj('tape_front', g.bm_box(0.06, 0.006, h * 0.45, bevel=0.002), tape, j,
                   loc=(0, -dep / 2, h / 2 - h * 0.225))
        g.mesh_obj('label', g.bm_box(w * 0.32, 0.006, h * 0.22, bevel=0.003), M('label_w', '#F7F2E2', 0.6), j,
                   loc=(w * 0.20, -dep / 2 - 0.001, -h * 0.12))
        g.mesh_obj('label_arrow', g.bm_box(w * 0.07, 0.006, h * 0.12, bevel=0.002), M('label_r', '#C8343A', 0.5), j,
                   loc=(w * 0.20, -dep / 2 - 0.004, -h * 0.12))
        g.mesh_obj('flap_line', g.bm_box(w, 0.004, 0.004, bevel=0.0), M('box_line', '#9A7448', 0.8), j,
                   loc=(0, -dep / 2 - 0.001, h / 2 - 0.02))


@part('held_hose', 'item', 'body', {'nozzle': sub(None, Z3['hose_nozzle']), 'line': sub(None, Z3['hose_line'])},
      tags=['anim_item', 'fire'], label={'ko': '소방 호스', 'en': 'fire hose'})
def b_held_hose(rig, ctx, put):
    """'nozzle' (joint hose_J, placed every frame at the midpoint of the two mittens, facing frame, pitched
    SPRAY_PITCH down): nozzle + the hose dropping in front of the feet.  'line' (joint hoseline_J = the
    anchor, facing frame): the hose from between the feet back along the snow, ending in a coupling.
    Needs rig.meta['hose_mid'] = hands midpoint (facing frame, key 0) - cf_render measures it first."""
    _lazy()
    for jn in ('hose_J', 'hoseline_J'):
        if jn not in rig.j:
            rig.add(jn, 'root', (0, 0, 0))
    age = rig.meta.get('ch', {}).get('age') or 'adult'
    s = ca.item_scale(age)
    mx, my, mz = rig.meta.get('hose_mid', (0.0, -0.22, 0.52))
    red = M('hose_red', '#D23A3A', 0.6)
    redd = M('hose_red_d', '#9E2830', 0.65)
    brass = M('hose_brass', BRASS, 0.3, metal=0.75)
    blk = M('hose_blk', INKY, 0.45)
    j = rig.j['hose_J']
    L = 0.30 * s
    # facing frame (-x = the character's right, -y = forward): the hose leaves the nozzle, runs down in front of
    # the RIGHT hip to the snow beside the right boot and trails away to the right / back - a clear red line from
    # every dir (S / SE used to show only a short red tab hanging from the belt)
    hip = Vector((-0.215 * s, -0.255 * s, 0.30 * s))
    ground = Vector((-0.27 * s, -0.10 * s, 0.034 * s))
    with put('nozzle'):
        # nozzle along local -Y (forward): back end at +0.03, tip at -L
        prof = [(0.0, 0.0), (0.032 * s, 0.0), (0.040 * s, 0.05 * s), (0.044 * s, L * 0.40), (0.036 * s, L * 0.62),
                (0.027 * s, L * 0.90), (0.032 * s, L), (0.0, L)]
        noz = g.bm_lathe(prof, seg=24, smooth_n=0, cap_bottom=False, cap_top=False)
        g.bm_transform(noz, Matrix.Rotation(PI / 2, 4, 'X'))            # +Z -> -Y
        g.mesh_obj('nozzle', noz, M('nozzle_black', '#2E3038', 0.35, metal=0.3), j, loc=(0, 0.03, 0))
        g.mesh_obj('nozzle_band', g.bm_ring(0.042 * s, 0.010 * s, seg=24, segr=6), brass, j,
                   loc=(0, 0.03 - L * 0.62, 0), rot=(90, 0, 0))
        tipq = Quaternion((1, 0, 0), math.radians(90))
        g.mesh_obj('nozzle_tip', g.bm_ring(0.021 * s, 0.006 * s, seg=20, segr=6), brass, j,
                   loc=(0, 0.03 - L + 0.004, 0), rot=tipq)
        g.mesh_obj('nozzle_lip', g.bm_ring(0.030 * s, 0.009 * s, seg=20, segr=6), brass, j, loc=(0, 0.03 - L * 0.98, 0), rot=tipq)
        g.mesh_obj('bail', g.bm_ring(0.044 * s, 0.008 * s, seg=20, segr=6, u0=0, u1=PI, closed=False), brass, j,
                   loc=(0, 0.03 - L * 0.42, 0.0), rot=(0, 0, 0))
        g.mesh_obj('pistol_grip', g.bm_box(0.030 * s, 0.036 * s, 0.070 * s, bevel=0.010), blk, j,
                   loc=(0, 0.03 - L * 0.22, -0.045 * s), rot=(-14, 0, 0))
        g.mesh_obj('coupling', g.bm_cyl(0.036 * s, 0.036 * s, 0.040 * s, seg=20, centered=True), brass, j,
                   loc=(0, 0.045, 0), rot=tipq)
        # hose: out of the back end, round the right hip and down to the snow beside the right boot
        o = Vector((mx, my, mz))
        hl, gl = hip - o, ground - o                                     # in hose_J space (key 0)
        pts = [(0, 0.06, 0.0), (-0.02, 0.11, -0.03), (hl.x * 0.55, hl.y * 0.6 + 0.05, hl.z * 0.45),
               (hl.x, hl.y, hl.z), (gl.x * 0.96, gl.y * 0.9 + 0.02, (hl.z + gl.z) * 0.5), (gl.x, gl.y, gl.z)]
        g.mesh_obj('hose_drop', g.bm_tube_path(vd.catmull3(pts, 24), 0.032 * s, segr=10), red, j)
    jl = rig.j['hoseline_J']
    with put('line'):
        g0 = ground
        pts = [tuple(g0), (g0.x - 0.07 * s, g0.y + 0.08 * s, 0.032 * s), (-0.40 * s, 0.10 * s, 0.031 * s),
               (-0.47 * s, 0.26 * s, 0.031 * s), (-0.46 * s, 0.44 * s, 0.031 * s), (-0.40 * s, 0.58 * s, 0.031 * s)]
        g.mesh_obj('hose_line', g.bm_tube_path(vd.catmull3(pts, 24), 0.032 * s, segr=10), red, jl)
        g.mesh_obj('hose_seam', g.bm_tube_path(vd.catmull3(pts, 24)[3:], 0.006 * s, segr=6), redd, jl,
                   loc=(0, 0, 0.028 * s))
        g.mesh_obj('ground_coupling', g.bm_cyl(0.042 * s, 0.042 * s, 0.050 * s, seg=20, centered=True), brass, jl,
                   loc=tuple(g0 + Vector((0, 0.0, 0.004))), rot=(90, 0, 0))
        g.mesh_obj('end_coupling', g.bm_cyl(0.040 * s, 0.040 * s, 0.050 * s, seg=20, centered=True), brass, jl,
                   loc=(-0.40 * s, 0.60 * s, 0.031 * s), rot=(90, 0, 0))


@part('held_broom', 'item', 'body', {'main': sub(None, Z3['broom'])}, tags=['anim_item'],
      label={'ko': '빗자루', 'en': 'broom'})
def b_held_broom(rig, ctx, put):
    """Broom on joint 'broom_J' (origin = where the bristles touch the snow, handle along local +Z), placed
    every frame along the line through the two mittens (place_items3)."""
    _lazy()
    if 'broom_J' not in rig.j:
        rig.add('broom_J', 'root', (0, 0, 0))
    j = rig.j['broom_J']
    age = rig.meta.get('ch', {}).get('age') or 'adult'
    s = ca.item_scale(age)
    L = 1.02 * s
    with put('main'):
        g.mesh_obj('handle', g.bm_cyl(0.017 * s, 0.017 * s, L - 0.26 * s, seg=10), M('broom_wood', '#B07A44', 0.6), j,
                   loc=(0, 0, 0.26 * s))
        g.mesh_obj('handle_tip', g.bm_ellipsoid(0.021 * s, 0.021 * s, 0.021 * s, 10, 6), M('broom_tip', '#C8343A',
                                                                                         0.5),
                   j, loc=(0, 0, L))
        # wide flat fan of straw / twigs (14+ px across at 1x), splayed on the snow
        straw = M('straw', '#E3BC5C', 0.85)
        twig = M('twig', '#B8893C', 0.8)
        head = g.bm_lathe([(0.125 * s, 0.0), (0.118 * s, 0.05 * s), (0.085 * s, 0.13 * s), (0.045 * s, 0.22 * s),
                           (0.026 * s, 0.30 * s)], seg=28, sx=1.0, sy=0.32, smooth_n=10, cap_bottom=True, cap_top=True)
        g.mesh_obj('broom_head', vd.fuzz(head, 0.004, 60.0), straw, j, loc=(0, 0, 0.0))
        for k in range(9):                                    # twig streaks on both faces + ends poking out
            t = (k - 4) / 4.0
            for side in (-1, 1):
                pts = [(t * 0.020 * s, side * 0.008 * s, 0.29 * s), (t * 0.065 * s, side * 0.022 * s, 0.14 * s),
                       (t * 0.118 * s, side * 0.030 * s, -0.004 * s)]
                g.mesh_obj('twig', g.bm_tube_path(vd.catmull3(pts, 8), 0.0042 * s, segr=5), twig, j)
        bind = M('broom_bind', '#6B4026', 0.6)
        for z, r_ in ((0.215, 0.050), (0.262, 0.036)):
            g.mesh_obj('binding', g.bm_ring(r_ * s, 0.010 * s, seg=20, segr=6, sy=0.45), bind, j, loc=(0, 0, z * s))


@part('held_phone', 'item', 'body', {'main': dict(sub('acc2', Z3['item']), zfrontFollow='hand_R')}, tags=['anim_item'],
      label={'ko': '휴대전화', 'en': 'phone'})
def b_held_phone(rig, ctx, put):
    _lazy()
    j = rig.j['hand_R']
    with put('main'):
        body = M('phone_body', ctx.col('acc2'), 0.35)
        g.mesh_obj('phone', g.bm_box(0.030, 0.050, 0.110, bevel=0.012), body, j, loc=(0.040, -0.010, 0.015),
                   rot=(8, 0, 0))
        g.mesh_obj('phone_ant', g.bm_cyl(0.006, 0.006, 0.040, seg=8), body, j, loc=(0.045, 0.004, 0.075))


@part('hand_point', 'item', 'body', {'main': {'tint': 'hands', 'z': Z['hand'] + 0.5, 'follow': 'hand_R'}},
      tags=['anim_item'], label={'ko': '가리키는 손가락', 'en': 'pointing finger'})
def b_hand_point(rig, ctx, put):
    _lazy()
    j = rig.j['hand_R']
    with put('main'):
        hm = M('hand_pt', ctx.col('hands'), 0.6)
        g.mesh_obj('finger', g.bm_capsule(0.017, 0.055, r_end=0.015, seg=12, rings=5), hm, j, loc=(0.0, -0.012, -0.040))


for _pn in ALL_NEW:
    if _pn in ITEM_NO_ANIMS:
        PARTS[_pn].no_anims = list(ITEM_NO_ANIMS[_pn])
    if _pn in ONLY_ANIMS:
        PARTS[_pn].only_anims = list(ONLY_ANIMS[_pn])
PARTS['top_teller_vest'].sleeves = 'top2'
PARTS['top_delivery_polo'].sleeves = 'top2'
PARTS['top_fire_coat'].dress = False


# --------------------------------------------------------------------------- per-frame item placement

def item_scale3(age):
    return {'child': 0.85, 'elder': 0.95}.get(age, 1.0)


def place_items3(rig, d, flags):
    """Place the world-space item joints after Rig.apply + IK: loot sack under the right fist (upright),
    box on its chest-local centre (turning with the chest), fire hose nozzle at the midpoint of the mittens
    (facing frame, pitched down), broom along the line through the mittens down to the snow.
    Returns {'nozzle': (tip, ahead) world, 'sweep': ground point world, 'box': (centre, bottom) world}."""
    _lazy()
    bpy.context.view_layer.update()
    root = rig.j['root']
    inv_root = root.matrix_world.inverted()
    rq = root.matrix_world.to_quaternion()
    age = rig.meta.get('ch', {}).get('age', 'adult')
    out = {}
    if 'sack_R' in rig.j:
        s = item_scale3(age)
        flee = bool(flags.get('_flee'))
        # right fist normally; in flee the left mitten (far side in SE / E) holds it up by the shoulder
        for jname, hand, on in (('sack_R', 'hand_R', not flee), ('sack_F', 'hand_L', flee)):
            if jname not in rig.j:
                continue
            hw = rig.world(hand, (0.0, -0.004, 0.010))
            jn = rig.j[jname]
            jn.location = inv_root @ hw
            jn.rotation_quaternion = Quaternion((1, 0, 0), math.radians(-6))
            k = s if on else 1e-4
            jn.scale = (k, k, k)
    if 'box_J' in rig.j:
        jn = rig.j['box_J']
        tx, ty, tz = rig.meta.get('torso_scale', (1, 1, 1))
        c = ca.box_center(age)
        w = rig.j['chest'].matrix_world @ Vector((c[0] * tx, c[1] * ty, c[2] * tz))
        jn.location = inv_root @ w
        cq = rig.j['chest'].matrix_world.to_quaternion()
        jn.rotation_quaternion = rq.inverted() @ cq
        h = ca.box_size(age)[2]
        bpy.context.view_layer.update()
        out['box'] = (jn.matrix_world @ Vector((0, 0, 0)), jn.matrix_world @ Vector((0, 0, -h / 2)))
    if 'hose_J' in rig.j:
        mid = (rig.world('hand_R') + rig.world('hand_L')) * 0.5
        jn = rig.j['hose_J']
        jn.location = inv_root @ mid
        jn.rotation_quaternion = Quaternion((1, 0, 0), math.radians(-ca.SPRAY_PITCH))
        rig.j['hoseline_J'].location = Vector((0, 0, 0))
        rig.j['hoseline_J'].rotation_quaternion = Quaternion()
        bpy.context.view_layer.update()
        s = ca.item_scale(age)
        L = 0.30 * s
        out['nozzle'] = (jn.matrix_world @ Vector((0, 0.03 - L, 0)), jn.matrix_world @ Vector((0, 0.03 - L - 0.5, 0)))
    if 'broom_J' in rig.j:
        p1 = rig.world('hand_R')
        p2 = rig.world('hand_L')
        dirv = (p1 - p2)
        if dirv.z < 0:
            dirv = -dirv
            p1, p2 = p2, p1
        dirv.normalize()
        if dirv.z < 0.2:
            dirv = (dirv + Vector((0, 0, 0.6))).normalized()
        gz = rig.j['root'].matrix_world.translation.z
        if flags.get('_broom') in (0, len(ca.SWEEP_DX) - 1):
            gz += 0.016                                         # bristles lift a little at both ends of the arc
        t = (p2.z - gz) / dirv.z
        ground = p2 - dirv * t
        jn = rig.j['broom_J']
        jn.location = inv_root @ ground
        jn.rotation_quaternion = rq.inverted() @ dirv.to_track_quat('Z', 'Y')
        out['sweep'] = ground
    bpy.context.view_layer.update()
    return out
