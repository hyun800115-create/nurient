"""
ch2_anim.py - poses for the v4.2 chief anims (CONTRACT_V42 AH).  Pure python (no bpy).

pose_for(anim, i, n, d) -> a char_geo.Rig.apply() dict for the `player` rig, plus ch2_build extras:
    '_show'        toggles shown (faces, props)
    '_props'       {prop: (loc, rot)}  root-local business point + XYZ euler degrees (or ('aim', vec))
    '_paper'       newspaper spec (sit_read)
    'wik_R/L'      root-local mitten targets (x, y, z) - solved after the body is posed, so mittens stay on
                   the desk while the torso breathes / leans
    '_pole_R/L'    root-local elbow pole for those targets
    '_stretch_R/L' rubber-hose arm lengthening (m) for the high reaches of wave / cheer
    '_hose'        (polish) lengthen the sleeve capsules with the stretch so a long reach stays one sleeve
    '_held'        (polish) {prop: (side, stick dir, flag dir)}: a prop held IN the solved fist, axes root-local
    '_pennant'     (polish) the cheer flag's ripple: phase, amp, droop / lift

Rig signs (char_geo.Rig.apply): spine / chest / neck / head pitch > 0 leans BACK (forward = negative);
limb pitch > 0 swings the limb forward; knee pitch > 0 folds the shin back; roll > 0 = outward.
Root-local: +X = his left, -Y = forward, +Z = up.

Seated anims (sit_idle, sit_write, sit_read, sit_eat, doze): origin = the SEAT POINT = seat front-centre on
top of a 0.45 m seat (townfolk2 `sit` / officefolk desk anims / life2 `seatPoints`).  The hip joint sits
SEAT_BACK behind the seat front and 0.065 m above the seat (thighs resting on it), the desk / table top is
DESK_TOP above the seat (0.72 m from the floor) with its near edge DESK_EDGE in front of the seat front.
Chibi legs (0.34 m) cannot reach a floor 0.45 m down: the shins hang straight down toward it, like every
seated townsperson (the desk front / table hides them in the game).
"""
import math

TAU = math.tau

DIRS = ['S', 'SE', 'E']
HIP_Z = 0.34              # char_build.HIP_Z
SEAT_H = 0.45
SEAT_BACK = 0.12
DESK_TOP = 0.72 - SEAT_H  # 0.27 m above the seat
DESK_EDGE = 0.10          # desk near edge in front of the seat front
ON_DESK = DESK_TOP + 0.042  # mitten centre resting on the desk top

ANIMS = {
    'sit_idle':   dict(frames=4, fps=4, repeat=-1, seated=True),
    'sit_write':  dict(frames=6, fps=8, repeat=-1, seated=True, impactFrame=4),
    'sit_read':   dict(frames=6, fps=6, repeat=-1, seated=True, loopFrom=2),
    'sit_eat':    dict(frames=6, fps=8, repeat=-1, seated=True),
    'doze':       dict(frames=4, fps=3, repeat=-1, seated=True),
    'talk':       dict(frames=8, fps=10, repeat=-1),
    'wave':       dict(frames=6, fps=10, repeat=-1),
    'warm_hands': dict(frames=4, fps=5, repeat=-1),
    'cheer':      dict(frames=6, fps=10, repeat=-1),
}
ORDER = ['sit_idle', 'sit_write', 'sit_read', 'sit_eat', 'doze', 'talk', 'wave', 'warm_hands', 'cheer']
SEATED = {a for a, v in ANIMS.items() if v.get('seated')}
# seated anims that work ON the desk / table: they also get `{anim}_{dir}_{i}_desk` overlay frames (the hands and
# props in front of the desk's near edge and above its top), for the game to draw OVER the desk / table art
DESK_OVERLAY = ['sit_idle', 'sit_write', 'sit_read', 'sit_eat']

BASE_ARMS = {'sh_R': (4, 9, 0), 'sh_L': (4, 9, 0), 'el_R': (12, 0, 0), 'el_L': (12, 0, 0)}


def aim(dx, dy, dz):
    """XYZ euler (deg) turning a prop's +Z axis to the root-local direction (dx, dy, dz)."""
    n = math.sqrt(dx * dx + dy * dy + dz * dz) or 1.0
    dx, dy, dz = dx / n, dy / n, dz / n
    a = math.asin(max(-1.0, min(1.0, -dy)))
    b = math.atan2(dx, dz)
    return (math.degrees(a), math.degrees(b), 0.0)


def lerp3(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


# --------------------------------------------------------------------------- bodies

def seat_body(lean=8.0, bob=0.0, knees=(80, 76), spread=7.0, twist=0.0, roll=0.0):
    """Seated hips + legs (shins hanging straight down) + spine lean (deg forward)."""
    return {'hips@': (0, SEAT_BACK, 0.065 - HIP_Z + bob),
            'hip_R': (86, spread, 0), 'hip_L': (86, spread, 0),
            'knee_R': (knees[0], 0, 0), 'knee_L': (knees[1], 0, 0),
            'spine': (-lean, roll, twist)}


def stand_body(s=0.0, sway=0.0):
    return {'hip_R': (2 + 1.5 * s, 3, 0), 'hip_L': (2 + 1.5 * s, 3, 0),
            'knee_R': (3 + 3 * s, 0, 0), 'knee_L': (3 + 3 * s, 0, 0),
            'hips@': (0, 0, -0.004 - 0.004 * s), 'root': (0, sway, 0)}


def show(face, *props):
    return {face, *props}


# --------------------------------------------------------------------------- seated

def p_sit_idle(i, n, d):
    a = TAU * i / n
    s = math.sin(a)
    p = seat_body(lean=7 + 1.2 * s)
    p['chest@'] = (0, 0, 0.005 * s)
    p['head'] = (-3 - 1.5 * s, 0, (0, 5, 3, -2)[i % 4])
    p['neck'] = (2, 0, 0)
    p['wik_R'] = (-0.115, -0.150, ON_DESK)
    p['wik_L'] = (0.115, -0.150, ON_DESK)
    if i == 1:                                     # a little finger tap
        p['wik_R'] = (-0.112, -0.158, ON_DESK + 0.030)
    p['hand_R'] = (-20, 0, 30)
    p['hand_L'] = (-20, 0, -30)
    p['_show'] = show(['face_normal', 'face_smile', 'face_blink', 'face_normal'][i % 4])
    return p


# quill nib path on the desk (root-local x, y) and lift for frames 0..5
QUILL_DIR = (-0.58, 0.22, 0.78)          # shaft leans out to his right (and a little back)


def p_sit_write(i, n, d):
    nib = [(-0.050, -0.200, 0.000), (-0.022, -0.204, 0.004), (-0.055, -0.196, 0.002), (-0.032, -0.200, 0.012),
           (-0.085, -0.160, 0.100), (-0.065, -0.180, 0.050)][i]
    q_aim = [QUILL_DIR, (-0.50, 0.24, 0.83), (-0.62, 0.18, 0.76), (-0.55, 0.26, 0.79),
             (-0.80, 0.10, 0.58), (-0.70, 0.18, 0.68)][i]
    # stamp: rests by the paper (0-2), wind-up (3), SLAM (4 = impactFrame), lifts (5)
    st = [((0.125, -0.195, 0.000), (0, 0, 8)), ((0.125, -0.195, 0.000), (0, 0, 8)),
          ((0.125, -0.198, 0.012), (2, 0, 8)), ((0.200, -0.215, 0.160), (-12, 24, 4)),
          ((0.110, -0.245, 0.000), (0, 0, 0)), ((0.135, -0.235, 0.065), (-6, 10, 2))][i]
    lean = [9, 10, 9, 7, 13, 10][i]
    p = seat_body(lean=lean)
    p['chest@'] = (0, 0, [0.0, 0.002, 0.0, 0.006, -0.008, 0.0][i])
    p['head'] = ([-12, -13, -12, -6, -14, -9][i], 0, [-4, 0, -5, 6, 4, 2][i])
    p['neck'] = (0, 0, 0)
    p['_props'] = {'quill': ((nib[0], nib[1], DESK_TOP + nib[2]), aim(*q_aim)),
                   'stamp': ((st[0][0], st[0][1], DESK_TOP + st[0][2]), st[1])}
    p['hand_R'] = (-10, 0, 20)
    p['hand_L'] = (-6, 0, -10)
    p['_pole_L'] = (0.8, 0.35, -0.55)
    p['_stretch_L'] = 0.05 if i in (3, 4, 5) else 0.0
    p['_stretch_R'] = 0.03
    face = ['face_normal', 'face_normal', 'face_blink', 'face_smile', 'face_smile', 'face_happy'][i]
    p['_show'] = show(face, 'quill', 'stamp')
    return p


# per-dir cheat: in the 3/4 and profile views he turns the open paper a little toward the camera (to his
# right), so the spread reads as a sheet instead of an edge (the townfolk 'soc' head cheat, for a prop)
READ_CHEAT = {'S': 0.0, 'SE': -20.0, 'E': -30.0}


def p_sit_read(i, n, d):
    # 0 folded paper lifted off the desk, 1 shaking it open, 2 open (settling), 3-5 reading wobbles
    specs = [
        dict(loc=(0.02, -0.210, 0.115), rot=(-22, 0, 8), fold=180, vee=0, curl=0.0),
        dict(loc=(0.00, -0.222, 0.140), rot=(-16, 0, 3), fold=95, vee=12, curl=0.010, flutter=0.025),
        dict(loc=(0.00, -0.225, 0.150), rot=(-14, 0, 0), fold=-8, vee=20, curl=0.030, flutter=0.040, sag=0.012),
        dict(loc=(0.00, -0.225, 0.146), rot=(-15, 0, -2), fold=0, vee=18, curl=0.022, flutter=0.010, sag=0.006),
        dict(loc=(0.00, -0.225, 0.149), rot=(-14, 0, 1), fold=3, vee=18, curl=0.026, flutter=0.024, sag=0.009),
        dict(loc=(0.00, -0.225, 0.146), rot=(-15, 0, 3), fold=0, vee=17, curl=0.020, flutter=0.004, sag=0.006),
    ]
    sp = dict(specs[i])
    sp['loc'] = (sp['loc'][0], sp['loc'][1], DESK_TOP + sp['loc'][2])
    r = sp['rot']
    sp['rot'] = (r[0], r[1], r[2] + READ_CHEAT[d] * (0.4 if i == 0 else 1.0))
    p = seat_body(lean=[8, 8, 8, 8, 9, 8][i])
    p['chest@'] = (0, 0, [0.0, 0.004, 0.0, 0.002, 0.004, 0.0][i])
    # eyes follow the lines: head turns a little left -> right while reading
    p['head'] = ([-6, -4, -8, -9, -10, -9][i], 0, [0, 3, -2, -7, 0, 6][i])
    p['neck'] = (-2, 0, 0)
    p['_paper'] = sp
    p['hand_R'] = (-30, 0, 20)
    p['hand_L'] = (-30, 0, -20)
    p['_pole_R'] = (-0.8, 0.4, -0.5)
    p['_pole_L'] = (0.8, 0.4, -0.5)
    p['_stretch_R'] = 0.08
    p['_stretch_L'] = 0.09
    face = ['face_smile', 'face_normal', 'face_normal', 'face_normal', 'face_blink', 'face_normal'][i]
    p['_show'] = show(face, 'paper')
    return p


BOWL_AT = (0.050, -0.190, 0.0)           # bowl foot on the table top (root-local, z from the desk top)


def p_sit_eat(i, n, d):
    bowl = (BOWL_AT[0], BOWL_AT[1], DESK_TOP + BOWL_AT[2])
    bowl_rot = [(0, 0, 0), (0, 0, 0), (0, 0, 0), (0, 0, 0), (0, 0, 0), (0, 0, 0)][i]
    lean = [9, 9, 7, 6, 8, 9][i]
    p = seat_body(lean=lean, bob=[0, 0, 0, 0.006, 0, 0][i])
    p['_stretch_L'] = 0.03
    p['_stretch_R'] = 0.05 if i in (2, 3) else 0.02
    p['head'] = ([-9, -8, -4, 2, -6, -9][i], [0, 0, 0, 7, 3, 0][i], [0, 0, 0, 0, 0, 0][i])
    p['neck'] = ([-2, 0, 2, 2, 0, -2][i], 0, 0)
    p['chest@'] = (0, 0, [0, 0.003, 0.006, 0.008, 0.004, 0][i])
    spoon = [(('rel', 'bowl', (-0.008, 0.000, 0.052)), ('aim', (-0.40, 0.42, 0.82))),
             ((-0.030, -0.215, DESK_TOP + 0.165), ('aim', (-0.35, 0.55, 0.20))),
             (('rel', 'mouth', (0.0, -0.028, -0.012)), ('to', 'sh_R')),
             (('rel', 'mouth', (0.0, -0.050, -0.030)), ('to', 'sh_R')),
             ((-0.045, -0.205, DESK_TOP + 0.150), ('aim', (-0.40, 0.55, 0.30))),
             (('rel', 'bowl', (-0.010, 0.004, 0.095)), ('aim', (-0.42, 0.45, 0.78)))][i]
    p['_props'] = {'bowl': (bowl, bowl_rot), 'spoon': spoon}
    p['hand_R'] = (-10, 0, 20)
    p['hand_L'] = (0, 0, -40)
    p['_pole_L'] = (0.8, 0.5, -0.4)
    p['_pole_R'] = (-0.9, 0.3, -0.5)
    face = ['face_normal', 'face_smile', 'face_smile', 'face_happy', 'face_content', 'face_normal'][i]
    extra = ('spoon_food',) if i in (1, 2) else ()
    p['_show'] = show(face, 'bowl', 'spoon', *extra)
    return p


def p_doze(i, n, d):
    # head sinks forward (0 -> 2), then a little jerk back up (3); slow sleepy breathing
    p = seat_body(lean=[-2, -1, 0, -3][i], bob=[0, -0.002, -0.004, 0.0][i])
    p['chest@'] = (0, 0, [0.006, 0.002, -0.004, 0.002][i])
    p['neck'] = ([-4, -8, -12, -2][i], 0, 0)
    p['head'] = ([-6, -12, -18, -3][i], [4, 6, 8, 2][i], [3, 4, 5, 1][i])
    # mittens folded on the lap
    p['wik_R'] = (-0.065, -0.080, 0.262)
    p['wik_L'] = (0.065, -0.080, 0.262)
    p['_stretch_R'] = p['_stretch_L'] = 0.03
    p['_pole_R'] = (-0.9, 0.3, -0.3)
    p['_pole_L'] = (0.9, 0.3, -0.3)
    p['hand_R'] = (-40, 0, 40)
    p['hand_L'] = (-40, 0, -40)
    p['_show'] = show('face_sleep')
    return p


# --------------------------------------------------------------------------- standing

def p_talk(i, n, d):
    """Townfolk `talk` timing: mouth open / mid / closed / open / blink / open / closed / mid,
    nods on 1, 4, 7; the right mitten explains out to the side in small palm-up circles."""
    a = TAU * i / n
    s, c = math.sin(a), math.cos(a)
    p = dict(BASE_ARMS)
    p.update(stand_body(0.5 * s))
    p['spine'] = (1 - 1.5 * s, 2.5 * c, 4 * s)
    p['chest@'] = (0, 0, 0.004 * math.sin(2 * a))
    nod = i in (1, 4, 7)
    p['head'] = ((-6 if nod else -1), 2 * c, 4 * s)
    p['ik_R'] = (-0.25 + 0.035 * c, -0.17 + 0.02 * s, -0.07 + 0.045 * s, -1.0, 0.1, -0.8)
    p['hand_R'] = (-50, 0, 25 + 20 * s)
    p['sh_L'] = (6 - 3 * s, 11, 0)
    p['el_L'] = (16, 0, 0)
    faces = ['face_smile', 'face_mid', 'face_normal', 'face_smile', 'face_blink', 'face_smile', 'face_normal',
             'face_mid']
    p['_show'] = show(faces[i % 8])
    return p


# where the raised mitten goes per render dir (chest-local, so it rides along with the hop / sway).
# S: beside the head (unchanged).  Polish M1: in SE and E the mitten is kept OUT of the head's silhouette with a
# few px of clear space - SE up-left of the head (his right-back: the only way "up and out" points in that view),
# E forward of the face toward the camera side, reaching ahead (the train he waves at is in front of him) - and he
# leans a little away from it, so the wave never reads as a hand at the mouth.  The longer reach uses the
# rubber-hose sleeves (ch2_build '_hose').
WAVE_AT = {'S': (-0.385, -0.05, 0.255), 'SE': (-0.355, 0.265, 0.290), 'E': (-0.200, -0.385, 0.215)}
WAVE_POLE = {'S': (-1.0, 0.3, -0.4), 'SE': (-1.0, 0.6, -0.4), 'E': (-0.9, -0.1, -0.7)}
WAVE_STRETCH = {'S': 0.07, 'SE': 0.13, 'E': 0.15}


def p_wave(i, n, d):
    """Right mitten raised, waving side to side toward the camera; happy sway."""
    a = TAU * i / n
    s, c = math.sin(a), math.cos(a)
    p = dict(BASE_ARMS)
    p.update(stand_body(0.6 * s, sway=2.5 * s))
    p['hips@'] = (0, 0, -0.004 + 0.008 * abs(s))
    x, y, z = WAVE_AT[d]
    if d == 'S':
        p['spine'] = (2, -4 + 2 * s, 0)
        p['head'] = (-1, -3 * s, 4 * s)
        p['sh_R@'] = (0, 0, 0.015)
        wag = (0.035 * s, 0.0, 0.0)
        p['ik_R'] = (x + wag[0], y + wag[1], z + 0.012 * c) + WAVE_POLE[d]
    else:
        # lean a little away from the raised mitten (spine roll to his left) and look up / ahead
        p['spine'] = ((3, 5)[d == 'E'], 4 + 1.5 * s, 0)
        p['head'] = (2, 2 + 2 * s, 4 * s) if d == 'SE' else (4, 2 + 2 * s, -12 + 3 * s)
        p['sh_R@'] = (-0.01, 0, 0.03)
        # the wag swings the mitten OUTWARD from its clear spot and back (never in toward the face)
        out = 0.5 + 0.5 * s
        if d == 'SE':
            wag = (-0.028 * out, 0.010 * out, 0.012 * c)
        else:
            wag = (0.0, -0.020 * out, 0.026 * c)
        p['ik_R'] = (x + wag[0], y + wag[1], z + wag[2]) + WAVE_POLE[d]
        p['_hose'] = True
    p['hand_R'] = (-15, 0, 30 * s)
    p['_stretch_R'] = WAVE_STRETCH[d]
    p['sh_L'] = (8, 13, 0)
    p['el_L'] = (16, 0, 0)
    p['_show'] = show(['face_happy', 'face_happy', 'face_smile', 'face_happy', 'face_happy', 'face_smile'][i % 6])
    return p


def p_warm_hands(i, n, d):
    """Both mittens held out in front, palms toward a fire; shoulders shrug up with cosy cold, a little
    shiver, then settle.  Polish L1: facing the camera (S) the 'forward' is lost to foreshortening, so there the
    mittens are spread wider at chest height with the palms turned out (thumbs up) and rub a little on 1-2."""
    shrug = [0.000, 0.026, 0.032, 0.012][i]
    p = stand_body(0.0)
    p['spine'] = ([-4, -6, -6, -5][i], 0, [0, 2, -2, 0][i])
    p['chest@'] = (0, 0, [0.0, 0.006, 0.004, 0.002][i])
    p['neck@'] = (0, 0, -shrug * 0.7)
    p['head'] = ([-2, 2, 1, -1][i], [0, 3, -3, 0][i], 0)
    p['sh_R@'] = (0, 0, shrug)
    p['sh_L@'] = (0, 0, shrug)
    if d == 'S':
        gap = [0.158, 0.140, 0.140, 0.152][i]
        zz = [-0.010, 0.006, 0.006, -0.004][i]
        yy = [-0.250, -0.240, -0.240, -0.250][i]
        rub = [0.0, 0.024, -0.024, 0.0][i]          # one mitten up, the other down: rubbing them warm
        p['ik_R'] = (-gap, yy, zz + rub, -1.0, 0.0, -0.7)
        p['ik_L'] = (gap, yy, zz - rub, 1.0, 0.0, -0.7)
        p['_stretch_R'] = 0.04
        p['_stretch_L'] = 0.04
        p['hand_R'] = (-80, -25, 15)
        p['hand_L'] = (-80, -25, -15)
    else:
        gap = [0.110, 0.085, 0.078, 0.100][i]
        zz = [-0.085, -0.070, -0.070, -0.080][i]
        yy = [-0.255, -0.245, -0.245, -0.255][i]
        p['ik_R'] = (-gap, yy, zz, -1.0, 0.0, -0.7)
        p['ik_L'] = (gap, yy, zz, 1.0, 0.0, -0.7)
        p['_stretch_L'] = 0.03
        p['_stretch_R'] = 0.05 if i in (2, 3) else 0.02
        p['hand_R'] = (-70, 0, 15)
        p['hand_L'] = (-70, 0, -15)
    p['_show'] = show(['face_smile', 'face_content', 'face_content', 'face_blink'][i])
    return p


# ---- cheer (polish H1 / M1 / L2) -------------------------------------------------------------------------------
# The 촌장 응원 pose: a little teal 서리마을 pennant (ch2_build 'pennant') punched up high in the right fist, a real
# hop on frame 2 (the feet leave the snow by ~10 px) and an "아자!" fist pump of the left mitten.  The chibi arm
# (0.275 m) cannot reach over a head 0.6 m wide, so the PENNANT carries the "overhead": its flag flies out above the
# head line, on the side away from the face in every dir (S / SE: out past his right ear, E: forward past the
# face).  The fist itself always stays clear of the face (M1).  Crouch frames are planted squats: the hips sit back
# while the shins stay vertical, so the boots keep the idle stance and ground line (L2).
CHEER_FIST = {      # chest-local fist (up = 1): S beside the head, SE up-left of it (his right-back), E forward
    'S': (-0.405, -0.05, 0.345),
    'SE': (-0.320, 0.255, 0.310),
    'E': (-0.215, -0.340, 0.160),
}
CHEER_POLE = {'S': (-1.0, 0.3, -0.5), 'SE': (-1.0, 0.6, -0.4), 'E': (-0.9, -0.1, -0.7)}
# root-local stick direction (up) and the way the flag flies, per dir
CHEER_STICK = {
    'S': ((-0.14, 0.10, 1.0), (-1.0, 0.30, 0.30)),
    'SE': ((-0.10, 0.12, 1.0), (-0.75, 0.75, 0.30)),
    'E': ((0.0, -0.47, 1.0), (0.0, -1.0, 0.45)),
}
CHEER_STRETCH = {'S': 0.10, 'SE': 0.11, 'E': 0.085}
# anticipation (frame 0): the pennant pulled in low by the right shoulder (chest-local fist, root-local stick), the
# flag still showing out to the side - never across the face (SE: further out to his right, beside the head)
FIST_LOW = {'S': (-0.21, -0.19, 0.00), 'SE': (-0.29, 0.02, 0.00), 'E': (-0.21, -0.19, 0.00)}
STICK_LOW = {'S': (-0.22, -0.30, 1.0), 'SE': (-0.30, 0.10, 1.0), 'E': (-0.22, -0.30, 1.0)}
THIGH = 0.150


def squat(h):
    """Planted squat for hip pitch h (deg): shin vertical (knee = h), hips back + down so the boots stay put."""
    back = THIGH * math.sin(math.radians(h)) - THIGH * math.sin(math.radians(2))
    drop = THIGH * (math.cos(math.radians(2)) - math.cos(math.radians(h)))
    return back, drop


def p_cheer(i, n, d):
    """Pennant punched up high with a hop on frame 2 (the 촌장 응원 / ribbon pose)."""
    k = [
        # 0 anticipation: planted squat, pennant pulled in at the chest
        dict(h=42, knee=None, z=0.0, spine=-12, roll=0, head=-4, up=0.0, face='face_smile',
             l=((14, 18, 0), 70), fl=dict(phase=0.0, amp=0.012, droop=0.030)),
        # 1 spring up: legs straight, body stretched, the pennant swings up
        dict(h=2, knee=None, z=0.004, spine=5, roll=4, head=6, up=0.85, face='face_happy',
             l=((-8, 30, 0), 45), fl=dict(phase=1.0, amp=0.030, lift=0.020)),
        # 2 HOP: feet ~10 px off the snow, legs tucked, pennant high, left arm out for balance
        dict(h=30, knee=62, z=0.150, spine=7, roll=6, head=10, up=1.0, face='face_happy',
             l=((8, 58, 0), 22), fl=dict(phase=2.1, amp=0.034, lift=0.035)),
        # 3 coming down, legs reaching for the snow
        dict(h=10, knee=18, z=0.065, spine=5, roll=5, head=8, up=1.0, face='face_happy',
             l=((4, 46, 0), 30), fl=dict(phase=3.2, amp=0.030, lift=0.015)),
        # 4 landing squash + "아자!" pump: left fist pulled in at the chest, pennant dips a little
        dict(h=36, knee=None, z=0.0, spine=-6, roll=2, head=-2, up=0.82, face='face_smile',
             l=((-16, 14, 0), 100), fl=dict(phase=4.3, amp=0.024, droop=0.020)),
        # 5 stand tall, pennant up high, flag fluttering
        dict(h=2, knee=None, z=0.0, spine=3, roll=4, head=6, up=1.0, face='face_happy',
             l=((-4, 26, 0), 52), fl=dict(phase=5.3, amp=0.028, lift=0.010)),
    ][i]
    h = k['h']
    if k['knee'] is None:                       # planted: shin vertical, the hips sit back
        back, drop = squat(h)
        knee = h + 1
        hips = (0, back, -0.004 - drop)
    else:                                       # airborne
        knee = k['knee']
        hips = (0, 0.0, -0.004 + k['z'])
    p = {'hip_R': (h, 3, 0), 'hip_L': (h, 3, 0), 'knee_R': (knee, 0, 0), 'knee_L': (knee, 0, 0),
         'hips@': hips, 'spine': (k['spine'], k['roll'], 0), 'neck': (2, 0, 0), 'head': (k['head'], -3, 0),
         'sh_R@': (-0.01 * k['up'], 0, 0.035 * k['up'])}
    sh_l, el_l = k['l']
    p['sh_L'] = sh_l
    p['el_L'] = (el_l, 0, 0)
    p['hand_L'] = (-10, 0, -20)
    t = k['up']
    hi = CHEER_FIST[d]
    p['ik_R'] = tuple(lo + (hh - lo) * t for lo, hh in zip(FIST_LOW[d], hi)) + CHEER_POLE[d]
    p['_stretch_R'] = CHEER_STRETCH[d] * t
    p['_hose'] = True
    p['hand_R'] = (0, 0, 0)
    zdir, xdir = CHEER_STICK[d]
    stick = tuple(lo + (hh - lo) * t for lo, hh in zip(STICK_LOW[d], zdir))
    p['_held'] = {'pennant': ('R', stick, xdir)}
    p['_pennant'] = dict(k['fl'])
    p['_show'] = show(k['face'], 'pennant')
    return p


FN = {'sit_idle': p_sit_idle, 'sit_write': p_sit_write, 'sit_read': p_sit_read, 'sit_eat': p_sit_eat,
      'doze': p_doze, 'talk': p_talk, 'wave': p_wave, 'warm_hands': p_warm_hands, 'cheer': p_cheer}


def pose_for(anim, i, n=None, d='S'):
    n = n or ANIMS[anim]['frames']
    return FN[anim](i, n, d)
