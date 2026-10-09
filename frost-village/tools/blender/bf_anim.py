"""
bf_anim.py - beachfolk animation additions (CONTRACT_V7 Y).  Pure python (no bpy).

Extends tf_anim / tf2_anim (imported, never edited).  New anims for every townsfolk base:

    swim         8 f  S SE E NE N   head-up crawl; only head / shoulders / arms stay above the water
                                    (everything under the surface is cut away by a holdout water block)
    float        4 f  S SE E        bobbing in a swim ring, arms resting on the ring
    sunbathe     4 f  SE NE         lying on the back (towel / lounger), breathing; dir = where the FEET point
    dig          6 f  S SE E        kneeling, building a sandcastle (toy spade in the right hand)
    ball_throw   6 f  S SE E        two-handed underhand beach-ball toss (once, impactFrame 3 = release)
    ball_catch   6 f  S SE E        ready - catch (once, impactFrame 2) - hug the ball - settle
    splash_play  6 f  S SE E        standing shin-deep in the sea, sweeping water up (impactFrame 2)
    surf         4 f  SE NE         riding a surfboard; dir = where the board's NOSE points

Water anims (swim, float, splash_play, surf) are rendered with the water surface at world z = 0 and the
sprite ANCHOR ON THE WATER SURFACE (see PLACE / WATERLINE below): put the anchor on the sea surface point.

pose3(anim, i, ch, d) -> Rig.apply() dict + meta keys
    '_hp' head pose, '_face', '_brow', '_hd' head-frame dir (default d), '_yaw' body yaw offset (deg),
    '_place' (kind, z) placement of the body relative to the anchor, '_ikw' {side: (kind, (x, f, z), pole)}
    world-space hand targets in the FACING frame (x = character's left, f = forward, z = up),
    '_water' True when the water holdout is on, '_board' / '_ring' prop hints.
Old anims are delegated to tf2_anim.pose2 (which delegates to tf_anim.pose).
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import tf_anim as ta          # noqa: E402
import tf2_anim as ta2        # noqa: E402
import vil_anim as va         # noqa: E402

TAU = math.tau
LOCO_DIRS = ta.LOCO_DIRS
SOCIAL_DIRS = ta.SOCIAL_DIRS
AXIS_DIRS = ['SE', 'NE']

ANIMS3 = {
    'swim':        dict(frames=8, fps=10, repeat=-1, dirs=LOCO_DIRS),
    'float':       dict(frames=4, fps=4, repeat=-1, dirs=SOCIAL_DIRS),
    'sunbathe':    dict(frames=4, fps=3, repeat=-1, dirs=AXIS_DIRS),
    'dig':         dict(frames=6, fps=8, repeat=-1, dirs=SOCIAL_DIRS),
    'ball_throw':  dict(frames=6, fps=10, repeat=0, dirs=SOCIAL_DIRS, impactFrame=3),
    'ball_catch':  dict(frames=6, fps=10, repeat=0, dirs=SOCIAL_DIRS, impactFrame=2),
    'splash_play': dict(frames=6, fps=10, repeat=-1, dirs=SOCIAL_DIRS, impactFrame=2),
    'surf':        dict(frames=4, fps=6, repeat=-1, dirs=AXIS_DIRS),
}
ORDER3 = ['swim', 'float', 'sunbathe', 'dig', 'ball_throw', 'ball_catch', 'splash_play', 'surf']
WATER_ANIMS = {'swim', 'float', 'splash_play', 'surf'}
# anims of the v4 / v5 sets (the new beach PARTS are also rendered for some of them)
OLD_ANIMS = list(ta.ORDER) + list(ta2.ORDER2)
ALL_ANIMS = OLD_ANIMS + ORDER3


def anim_info(a):
    return ANIMS3.get(a) or ta2.ANIMS2.get(a) or ta.ANIMS[a]


# --------------------------------------------------------------------------- water / placement constants
SWIM_HEAD_Z = 0.42        # swim: head CENTRE this high above the water (chin ~6 cm above the surface)
FLOAT_RING_Z = 0.03       # float: swim-ring centre this high above the water (top half shows)
SPLASH_DEPTH = 0.14       # splash_play: feet this deep under the surface (shin-deep)
BOARD_TOP = 0.045         # surf: board deck height above the water (board ~0.07 thick, bottom submerged)
LIE_HIPS_Z = 0.13         # sunbathe: hip joint height above the lying surface (towel / lounger top)
SWIM_HEAD_CUT = SWIM_HEAD_Z   # head frames of pose 'swim' are cut this far below the head centre
FLOAT_BOB = 0.032        # float: ring bobs +-3.2 cm with the swell (~ +-1.5 px; was 1.4 cm = static at phone zoom)
SWIM_BOB = 0.026         # swim: head rises +-2.6 cm with every stroke (2 bobs per 8-frame cycle)

# --------------------------------------------------------------------------- head poses / faces
# (look_down_deg, tilt_deg, turn_deg); 'swim' cheats toward the camera in S/SE/E like the social poses
HEAD_POSES3 = {'swim': (-7.0, 0.0, 0.0), 'lie': (-66.0, 0.0, 0.0)}
HEAD_POSE_DIRS3 = {'swim': LOCO_DIRS, 'lie': AXIS_DIRS}
HEAD_CHEAT3 = {'swim': True, 'lie': False}
# face dirs per new pose: the lying face looks up toward the feet, readable in SE only
FACE_DIRS3 = {'swim': ['S', 'SE', 'E'], 'lie': ['SE']}

FACE_EXPR3 = {
    'laugh': ['eye_happy', 'm_D', 'cheek_blush'],          # splash fights, surfing
    'relax': ['eye_sleep', 'm_smile', 'cheek_blush'],      # sunbathing / floating, content closed eyes
    'wow':   ['eye_round', 'm_O', 'cheek_blush'],          # catching the ball, wave hits
}
EXPR_BROW3 = {'laugh': 'up', 'relax': 'neutral', 'wow': 'up'}
OLD_EXPRS = ['neutral', 'blink', 'smile', 'happy', 'talk_open', 'talk_mid']   # the v4 expressions
# which expressions exist per head pose in THIS fragment (v4 exprs on the new poses + the new exprs)
NEW_EXPR_POSES = {'laugh': ['soc', 'tilt', 'up', 'nod', 'down', 'swim'],
                  'relax': ['lie', 'swim', 'soc'],
                  'wow': ['soc', 'up', 'tilt', 'swim']}
NEW_POSE_EXPRS = {'swim': OLD_EXPRS + ['laugh', 'relax', 'wow'],
                  'lie': ['neutral', 'blink', 'smile', 'happy', 'relax']}


def head_rot3(hp, d):
    if hp in HEAD_POSES3:
        down, tilt, turn = HEAD_POSES3[hp]
        if HEAD_CHEAT3[hp]:
            turn += ta.CHEAT_TURN.get(d, 0.0)
        return down, tilt, turn
    return ta2.head_rot2(hp, d)


def head_frames3():
    """New head-space frames (pose, dir) rendered for EVERY head layer."""
    return [(hp, d) for hp in HEAD_POSES3 for d in HEAD_POSE_DIRS3[hp]]


def all_head_frames():
    return ta2.all_head_frames() + head_frames3()


def face_dirs(hp):
    return FACE_DIRS3.get(hp, ta.FACE_DIRS)


def face_frames3():
    """[(pose, dir, expr)] face layers beachfolk adds (for every face set)."""
    out = []
    for hp, d in ta2.all_head_frames():
        if d not in ta.FACE_DIRS:
            continue
        for e, poses in NEW_EXPR_POSES.items():
            if hp in poses:
                out.append((hp, d, e))
    for hp, d in head_frames3():
        if d in face_dirs(hp):
            out += [(hp, d, e) for e in NEW_POSE_EXPRS[hp]]
    return out


def meta(hp, face, **kw):
    brow = EXPR_BROW3.get(face) or ta2.EXPR_BROW2.get(face) or ta.EXPR_BROW.get(face, 'neutral')
    out = {'_hp': hp, '_face': face, '_brow': brow, '_zfront': set()}
    out.update({'_' + k: v for k, v in kw.items()})
    return out


lean, look, arm, arms, body = va.lean, va.look, va.arm, va.arms, va.body
legs_stand, squat = va.legs_stand, va.squat


def _age(ch):
    return ch.get('age', 'adult')


def _lerp(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def _cyc(keys, ph):
    """Catmull-Rom through cyclic keys (equally spaced over phase 0..1)."""
    n = len(keys)
    u = (ph % 1.0) * n
    k = int(math.floor(u)) % n
    t = u - math.floor(u)
    p0, p1, p2, p3 = keys[(k - 1) % n], keys[k], keys[(k + 1) % n], keys[(k + 2) % n]
    t2, t3 = t * t, t * t * t
    return tuple(0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
                 for a, b, c, d in zip(p0, p1, p2, p3))


# --------------------------------------------------------------------------- swim
# Head-up front crawl ("lifeguard crawl"): body pitched forward under the surface, head held up, arms
# windmilling beside the big head.  Hand keys are SHOULDER-relative in the facing frame of the RIGHT arm
# (x = character's left, f = forward, z = up) + elbow pole; the left arm mirrors x and runs half a cycle later.
SWIM_KEYS = [  # (x, f, z, pole_x, pole_f, pole_z)
    (-0.06, -0.20, -0.06, -0.7, -0.1, 0.7),     # 0.000 hand leaves the water behind the hip
    (-0.16, -0.12, 0.12, -0.6, -0.3, 0.8),      # 0.125 elbow high, hand rising behind the shoulder
    (-0.19, 0.02, 0.19, -0.7, 0.0, 0.7),        # 0.250 high beside the head
    (-0.13, 0.17, 0.15, -0.8, 0.0, 0.6),        # 0.375 swinging forward, still high
    (-0.08, 0.25, 0.00, -0.8, 0.1, 0.3),        # 0.500 reaching forward: entry (splash)
    (-0.04, 0.20, -0.14, -0.9, 0.1, -0.2),      # 0.625 catch under water
    (-0.02, 0.05, -0.22, -0.9, 0.3, 0.0),       # 0.750 pull
    (-0.04, -0.12, -0.17, -0.8, 0.3, 0.3),      # 0.875 push past the hip
]


def p_swim(i, n, ch, d):
    a = TAU * i / n
    s = math.sin(a)
    p = {'root': (-38.0, 10.0 * math.sin(a + 0.6), 0.0),       # pitched forward, rolling with the strokes
         **lean(-10, 0, 4 * s),                                  # arched back (head up)
         'hip_R': (22 * math.sin(2 * a), 4, 0), 'hip_L': (-22 * math.sin(2 * a), 4, 0),
         'knee_R': (24 + 12 * max(0, math.cos(2 * a)), 0, 0), 'knee_L': (24 + 12 * max(0, -math.cos(2 * a)), 0, 0)}
    ik = {}
    for side, ph in (('R', i / n), ('L', i / n + 0.5)):
        k = _cyc(SWIM_KEYS, ph)
        x, f, z, px, pf, pz = k
        if side == 'L':
            x, px = -x, -px
        ik[side] = ('sh', (x, f, z), (px, pf, pz))
    p['hand_R'] = (-20, 0, 0)
    p['hand_L'] = (-20, 0, 0)
    faces = ['smile', 'neutral', 'smile', 'happy', 'smile', 'neutral', 'blink', 'smile']
    p.update(meta('swim', faces[i % 8], place=('head', SWIM_HEAD_Z + SWIM_BOB * math.sin(2 * a)), ikw=ik,
                  water=True))
    return p


# --------------------------------------------------------------------------- float
# Bobbing in a swim ring: sitting inside it, legs dangling under water, forearms resting on top of the ring.

def p_float(i, n, ch, d):
    a = TAU * i / n
    s, c = math.sin(a), math.cos(a)
    p = {'root': (9.0 + 3.5 * s, 4.5 * c, 5.0 * s),
         **lean(-2, 2.5 * c, 0), 'chest@': (0, 0, 0.004 * s),
         'hip_R': (58 + 6 * s, 10, 0), 'hip_L': (52 - 6 * s, 10, 0),
         'knee_R': (60 - 10 * s, 0, 0), 'knee_L': (66 + 10 * s, 0, 0)}
    ik = {'R': ('ring', (-38.0, 0.035), (-0.9, 0.2, 0.3)), 'L': ('ring', (38.0, 0.035), (0.9, 0.2, 0.3))}
    p['hand_R'] = (-50, 0, 20)
    p['hand_L'] = (-50, 0, -20)
    faces = ['smile', 'relax', 'relax', 'blink']
    p.update(meta('swim', faces[i % 4], place=('ring', FLOAT_RING_Z + FLOAT_BOB * s), ikw=ik, water=True,
                  ring=True))
    return p


# --------------------------------------------------------------------------- sunbathe
# Lying on the back, upper body a little raised (rolled towel / lounger back) so the big head rests on it,
# one knee up, hands folded on the tummy; slow breathing.  dir = where the FEET point.

def p_sunbathe(i, n, ch, d):
    a = TAU * i / n
    s = math.sin(a)
    p = {'root': (76.0, 0.0, 0.0),                          # rotated onto the back (14 deg raised)
         **lean(-4, 0, 0),
         'chest@': (0, -0.006 * (1 + s), 0),                 # breathing (chest-front = up)
         'hip_R': (-12.0, 4, 0), 'knee_R': (6 + 2 * s, 0, 0),
         'hip_L': (32.0, 6, 0), 'knee_L': (72.0, 0, 0)}
    p['ik_R'] = (-0.05, -0.235, -0.215, -1.0, 0.3, -0.3)
    p['ik_L'] = (0.05, -0.245, -0.205, 1.0, 0.3, -0.3)
    p['hand_R'] = (0, 0, 16)
    p['hand_L'] = (0, 0, -16)
    faces = ['relax', 'relax', 'smile', 'relax']
    p.update(meta('lie', faces[i % 4], place=('hips', LIE_HIPS_Z)))
    return p


# --------------------------------------------------------------------------- dig
# Kneeling on the sand, leaning over a sandcastle: scoop with the spade (right), pat with the left hand.
DIG_KEYS = [  # (R hand x, f, z) , (L hand x, f, z) relative to the anchor (under the hips), facing frame
    ((-0.10, 0.34, 0.10), (0.12, 0.28, 0.20)),       # 0 spade into the sand
    ((-0.12, 0.30, 0.20), (0.12, 0.30, 0.18)),       # 1 lift a scoop
    ((-0.05, 0.36, 0.26), (0.12, 0.30, 0.18)),       # 2 dump it on the castle
    ((-0.12, 0.28, 0.20), (0.04, 0.38, 0.24)),       # 3 left hand pats the top
    ((-0.12, 0.28, 0.18), (0.06, 0.38, 0.16)),       # 4 pat again
    ((-0.10, 0.32, 0.16), (0.12, 0.30, 0.22)),       # 5 settle
]
DIG_POINT = (0.0, 0.40, 0.0)                         # where the sandcastle stands (facing frame, from the anchor)


def p_dig(i, n, ch, d):
    r, l = DIG_KEYS[i % 6]
    bob = [0.0, -0.01, 0.01, 0.0, -0.012, 0.0][i % 6]
    p = {**lean(34 + 4 * (i in (0, 4)), 0, 0), 'chest@': (0, 0, bob),
         'hip_R': (44, 14, 0), 'hip_L': (44, 14, 0), 'knee_R': (136, 0, 0), 'knee_L': (136, 0, 0)}
    ik = {'R': ('anchor', r, (-0.8, 0.0, 0.4)), 'L': ('anchor', l, (0.8, 0.0, 0.4))}
    p['hand_R'] = (-30, 0, 30)
    p['hand_L'] = (-60, 0, -10)
    hps = ['down', 'down', 'nod', 'down', 'down', 'nod']
    faces = ['smile', 'neutral', 'happy', 'smile', 'blink', 'smile']
    p.update(meta(hps[i % 6], faces[i % 6], place=('lowest', 0.0), ikw=ik, spade=True))
    return p


# --------------------------------------------------------------------------- beach ball
# The held ball has a FIXED world size (not scaled with the body): 0.19 m radius for adults / elders = the beach prop
# beach_ball_bounce (footprintM.radius 0.2), 0.15 m for children (their short chibi arms cannot span a bigger one;
# the game lerps the flying ball's radius between the thrower's and the catcher's radiusPx).
BALL_R = 0.19
BALL_R_AGE = {'child': 0.15}
BALL_GRIP = 0.022        # hand centre this far outside the ball's surface
BALL_HOLD_DEG = 42.0     # palms this far round the back of the ball from its widest point (short arms)


def ball_r(age):
    return BALL_R_AGE.get(age, BALL_R)


def _ball_hands(cx, cf, cz):
    """Both hands on the sides of the ball.  (cx, cf, cz) in adult units from the anchor (facing frame, scaled by the
    body size k): cf = where the ball's BACK surface is, so the centre is at cf * k + radius (it never sinks into a
    round tummy) - see bf_render.solve_world_arms kind 'ball'."""
    return {'R': ('ball', (cx, cf, cz, -1.0), (-0.9, -0.1, -0.3)),
            'L': ('ball', (cx, cf, cz, 1.0), (0.9, -0.1, -0.3))}


THROW_KEYS = [  # ball (x, back-surface f, centre z), body extras, head pose, face
    ((0.0, 0.13, 0.55), {**legs_stand(4, 6)}, 'soc', 'smile'),                                   # hold at the tummy
    ((0.0, 0.12, 0.44), {**squat(22, 0.34), **lean(14)}, 'nod', 'smile'),                       # dip (wind-up)
    ((0.0, 0.16, 0.62), {**legs_stand(4, 4), **lean(2)}, 'soc', 'talk_open'),                   # swing up
    ((0.0, 0.17, 0.82), {**legs_stand(3, 0), **body(0, 0, 0.045), **lean(-8)}, 'up', 'laugh'),   # RELEASE (impact)
    (None, {**legs_stand(3, 2), **body(0, 0, 0.03), **lean(-5)}, 'up', 'happy'),               # follow-through
    (None, {**legs_stand(3, 4)}, 'soc', 'happy'),
]


def p_ball_throw(i, n, ch, d):
    ball, extra, hp, face = THROW_KEYS[i % 6]
    p = dict(extra)
    if ball is not None:
        ik = _ball_hands(*ball)
    elif i % 6 == 4:          # follow-through: arms up and forward in a V after the ball
        ik = {'R': ('anchor', (-0.25, 0.26, 0.86), (-0.8, 0.0, -0.4)), 'L': ('anchor', (0.25, 0.26, 0.86), (0.8, 0.0, -0.4))}
    else:
        ik = {'R': ('anchor', (-0.24, 0.12, 0.52), (-0.8, 0.2, -0.3)), 'L': ('anchor', (0.24, 0.12, 0.52), (0.8, 0.2, -0.3))}
    p['hand_R'] = (0, 0, 60)
    p['hand_L'] = (0, 0, -60)
    p.update(meta(hp, face, ikw=ik, ball=ball))
    return p


CATCH_KEYS = [
    (None, (0.46, 0.24, 0.58), {**legs_stand(5, 8), **lean(6)}, 'up', 'neutral'),        # ready, hands apart
    (None, (0.50, 0.30, 0.70), {**legs_stand(5, 4), **lean(2)}, 'up', 'wow'),            # reach
    ((0.0, 0.19, 0.70), None, {**legs_stand(5, 10), **lean(-2)}, 'up', 'wow'),          # CATCH (impact)
    ((0.0, 0.12, 0.50), None, {**squat(16, 0.34), **lean(8)}, 'soc', 'happy'),          # pull in (hug)
    ((0.0, 0.13, 0.58), None, {**legs_stand(4, 2), **body(0, 0, 0.03)}, 'soc', 'happy'),  # hop
    ((0.0, 0.13, 0.55), None, {**legs_stand(4, 6)}, 'soc', 'smile'),                    # = ball_throw frame 0
]


def p_ball_catch(i, n, ch, d):
    ball, open_, extra, hp, face = CATCH_KEYS[i % 6]
    p = dict(extra)
    if ball is not None:
        ik = _ball_hands(*ball)
    else:
        w, f, z = open_
        ik = {'R': ('anchor', (-w / 2 - 0.04, f, z), (-0.9, 0.1, -0.3)),
              'L': ('anchor', (w / 2 + 0.04, f, z), (0.9, 0.1, -0.3))}
    p['hand_R'] = (0, 0, 60)
    p['hand_L'] = (0, 0, -60)
    p.update(meta(hp, face, ikw=ik, ball=ball))
    return p


# --------------------------------------------------------------------------- splash_play
# Shin-deep in the sea, scooping water up at a friend: wind-up low, sweep along the surface, fling it up.
SPLASH_KEYS = [  # (R hand x f z), (L hand x f z) relative to the anchor (water surface), lean, head, face
    ((-0.16, -0.02, 0.10), (0.16, -0.02, 0.10), 30, 'down', 'smile'),
    ((-0.14, 0.24, 0.03), (0.14, 0.24, 0.03), 26, 'soc', 'laugh'),
    ((-0.16, 0.30, 0.46), (0.16, 0.30, 0.46), 4, 'up', 'laugh'),
    ((-0.24, 0.16, 0.64), (0.24, 0.16, 0.64), -6, 'up', 'laugh'),
    ((-0.22, 0.06, 0.36), (0.22, 0.06, 0.36), 6, 'tilt', 'happy'),
    ((-0.18, 0.02, 0.18), (0.18, 0.02, 0.18), 20, 'soc', 'smile'),
]
SPLASH_POINT = (0.0, 0.46, 0.0)          # where the water flies up (facing frame, from the anchor)


def p_splash_play(i, n, ch, d):
    r, l, lf, hp, face = SPLASH_KEYS[i % 6]
    bob = [-0.03, -0.02, 0.02, 0.03, 0.0, -0.02][i % 6]
    p = {**lean(lf), 'hip_R': (14 + lf * 0.3, 8, 0), 'hip_L': (14 + lf * 0.3, 8, 0),
         'knee_R': (20 + lf * 0.5, 0, 0), 'knee_L': (20 + lf * 0.5, 0, 0)}
    ik = {'R': ('anchor', r, (-0.8, 0.2, -0.2)), 'L': ('anchor', l, (0.8, 0.2, -0.2))}
    p['hand_R'] = (-40, 0, 30)
    p['hand_L'] = (-40, 0, -30)
    p.update(meta(hp, face, place=('feet', -SPLASH_DEPTH + bob * 0.3), ikw=ik, water=True))
    return p


# --------------------------------------------------------------------------- surf
# Board nose toward d; the rider stands sideways (body yaw +-90 from d, chest toward the camera side), knees
# bent, arms out for balance, head turned toward the nose.  'SE': chest faces SW, head looks SE;
# 'NE': chest faces SE, head looks E (the face stays visible in both).
SURF_BODY = {'SE': -90.0, 'NE': -90.0}       # body yaw relative to DIR_YAW[d] (both: rider's left foot forward)
SURF_HEAD = {'SE': 'SE', 'NE': 'E'}


def p_surf(i, n, ch, d):
    a = TAU * i / n
    s, c = math.sin(a), math.cos(a)
    crouch = 26 + 6 * s
    p = {**lean(10 + 3 * s, 3 * c, 28), 'hips': (0, 0, 8),
         'hip_R': (crouch * 0.6, 22, 0), 'hip_L': (crouch * 0.6, 22, 0),
         'knee_R': (crouch * 1.3, 0, 0), 'knee_L': (crouch * 1.3, 0, 0),
         **arm('R', 20 + 8 * c, 72 + 6 * s, 0, 18), **arm('L', 8 - 8 * c, 70 - 6 * s, 0, 22)}
    faces = ['happy', 'laugh', 'happy', 'smile']
    tilt = (2.5 * s, 3.5 * c)                         # board pitch / roll with the swell (deg)
    p.update(meta('soc', faces[i % 4], place=('feet', BOARD_TOP + 0.012 * s), water=True, yaw=SURF_BODY[d],
                  hd=SURF_HEAD[d], board=dict(heading=d, tilt=tilt, z=0.012 * s)))
    return p


FN3 = {'swim': p_swim, 'float': p_float, 'sunbathe': p_sunbathe, 'dig': p_dig, 'ball_throw': p_ball_throw,
       'ball_catch': p_ball_catch, 'splash_play': p_splash_play, 'surf': p_surf}
SOCIAL3 = {'dig', 'ball_throw', 'ball_catch', 'splash_play', 'float'}


def posture3(ch, anim):
    h = ch.get('hunch', 0.0)
    if not h:
        return {}
    if anim in ('swim', 'sunbathe', 'float', 'surf'):
        return {}
    if anim == 'dig':
        return {'neck': (h * 0.6, 0, 0)}
    return ta.posture(ch, anim)


def pose3(anim, i, ch, d):
    if anim not in ANIMS3:
        return ta2.pose2(anim, i, ch, d)
    n = ANIMS3[anim]['frames']
    p = FN3[anim](i, n, ch, d)
    keep = {k: p[k] for k in p if k.startswith('_')}
    body_p = {k: v for k, v in p.items() if not k.startswith('_')}
    extra = posture3(ch, anim)
    if extra:
        body_p = va.add(body_p, extra)
    if anim in SOCIAL3 and d in ta.CHEAT_SPINE:
        body_p = va.add(body_p, {'spine': (0, 0, ta.CHEAT_SPINE[d] * 0.6)})
    body_p.update(keep)
    return body_p


def frames3(anims=None):
    """[(anim, dir, i)] of the new anims in manifest order."""
    return [(a, d, i) for a in ORDER3 if anims is None or a in anims
            for d in ANIMS3[a]['dirs'] for i in range(ANIMS3[a]['frames'])]


def head_dir(anim, d, i, ch=None):
    p = pose3(anim, i, ch or {'age': 'adult', 'leg_len': 0.338, 'hip_z': 0.338}, d)
    return p.get('_hd') or d


def timeline3(zfront=None):
    """Per (anim, dir, i): head pose, face, brow, zfront (+ hd when the head frame dir differs from dir).
    zfront comes from the renderer's 3D test (meta3.json of adult_slim) when given."""
    out = {}
    ch = {'age': 'adult', 'leg_len': 0.338, 'hip_z': 0.338}
    for a, d, i in frames3():
        p = pose3(a, i, ch, d)
        e = dict(hp=p['_hp'], face=p['_face'], brow=p['_brow'],
                 zfront=sorted((zfront or {}).get(f'{a}_{d}_{i}', p['_zfront'])))
        if p.get('_hd') and p['_hd'] != d:
            e['hd'] = p['_hd']
        out[(a, d, i)] = e
    return out
