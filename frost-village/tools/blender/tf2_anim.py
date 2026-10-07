"""
tf2_anim.py - townfolk v5 animation additions (CONTRACT_V5 Q).  Pure python (no bpy).

Extends tf_anim (imported, never edited) with
    sad   4 f  S/SE/E   head bowed ('down' head pose), hands folded in front, gentle sad face
    clap  6 f  S/SE/E   applause in front of the chest, happy face (hands drawn above the head stack)
    sit   4 f  S/SE/E   seated on a 0.45 m seat; sprite anchor = FRONT-CENTRE of the seat surface
                        (same convention as villagers / life_props seatPoints)
    push  8 f  5 dirs   walking while pushing a stroller: both hands on a handle bar held at a
                        fixed point in front of the body (HANDLE_H high = life2 stroller grip, see push_grip()); the
                        renderer solves the arms in world space so the grip never bobs.

New head pose 'down' (look down 15 deg, S/SE/E, camera cheat like the other social poses) and new
face expressions 'sad', 'sad_closed', 'tear' (+ brow shape 'sad').

pose2(anim, i, ch, d) -> Rig.apply() dict + '_hp', '_face', '_brow', '_zfront' (+ '_push' for push).
Old anims are delegated to tf_anim.pose unchanged.
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import tf_anim as ta          # noqa: E402
import vil_anim as va         # noqa: E402

TAU = math.tau
LOCO_DIRS = ta.LOCO_DIRS
SOCIAL_DIRS = ta.SOCIAL_DIRS

ANIMS2 = {
    'sad':  dict(frames=4, fps=5, repeat=-1, dirs=SOCIAL_DIRS),
    'clap': dict(frames=6, fps=10, repeat=-1, dirs=SOCIAL_DIRS),
    'sit':  dict(frames=4, fps=4, repeat=-1, dirs=SOCIAL_DIRS),
    'push': dict(frames=8, fps=10, repeat=-1, dirs=LOCO_DIRS),
}
ORDER2 = ['sad', 'clap', 'sit', 'push']
SOCIAL2 = {'sad', 'clap', 'sit'}

SEAT_H = 0.45            # seat height (m); sit frames are anchored on the seat FRONT-CENTRE
SEAT_BACK = 0.12         # hip joint behind the seat front edge
HANDLE_H = 0.64          # stroller grip height (m) = life2 baby_stroller GRIP z (handleHeightM)
HANDLE_W = 0.24          # distance between the two hands on the bar (m)
CHILD_HANDLE_H = HANDLE_H

HEAD_POSES2 = {'down': (15.0, 0.0, 0.0)}
HEAD_POSE_DIRS2 = {'down': SOCIAL_DIRS}

FACE_EXPR2 = {
    'sad':        ['eye_teary', 'm_wavy', 'cheek_blush'],
    'sad_closed': ['eye_sleep', 'm_frown', 'cheek_blush'],
    'tear':       ['eye_teary', 'm_frown', 'cheek_blush', 'fx_tear'],
}
BROW_SHAPES2 = {'sad': 'brow_sad'}
EXPR_BROW2 = {'sad': 'sad', 'sad_closed': 'sad', 'tear': 'sad'}


def head_rot2(hp, d):
    if hp in HEAD_POSES2:
        down, tilt, turn = HEAD_POSES2[hp]
        return down, tilt, turn + ta.CHEAT_TURN.get(d, 0.0)
    return ta.head_rot(hp, d)


def head_frames2():
    """New head-space frames (pose, dir) rendered for EVERY head layer."""
    return [(hp, d) for hp in HEAD_POSES2 for d in HEAD_POSE_DIRS2[hp]]


def all_head_frames():
    return ta.head_frames() + head_frames2()


# face expressions rendered per head pose (old exprs on old poses already exist in assets/townfolk)
NEW_EXPRS = list(FACE_EXPR2)
DOWN_EXPRS = ['neutral', 'blink', 'smile'] + NEW_EXPRS


def face_frames2():
    """[(pose, dir, expr)] face layers townfolk2 adds (for every face set)."""
    out = []
    for hp, d in ta.head_frames():
        if d in ta.FACE_DIRS:
            out += [(hp, d, e) for e in NEW_EXPRS]
    for hp, d in head_frames2():
        out += [(hp, d, e) for e in DOWN_EXPRS]
    return out


def face_exprs_by_pose():
    """{pose: [exprs]} - every face expression that exists (townfolk + townfolk2) per head pose."""
    out = {}
    for hp, d, e in ta.face_frames():
        out.setdefault(hp, [])
        if e not in out[hp]:
            out[hp].append(e)
    for hp, d, e in face_frames2():
        out.setdefault(hp, [])
        if e not in out[hp]:
            out[hp].append(e)
    return out


def meta(hp, face, zfront=()):
    brow = EXPR_BROW2.get(face, ta.EXPR_BROW.get(face, 'neutral'))
    return {'_hp': hp, '_face': face, '_brow': brow, '_zfront': set(zfront)}


lean, look, arm, arms, body = va.lean, va.look, va.arm, va.arms, va.body
legs_stand, legs_walk = va.legs_stand, va.legs_walk


def _age(ch):
    return ch.get('age', 'adult')


# --------------------------------------------------------------------------- sad
# Gentle, respectful: a little bow, shoulders soft, hands folded in front of the belly (a held
# bouquet then rests in front of the body), slow breathing, eyes close softly on the sigh.

def p_sad(i, n, ch, d):
    a = TAU * i / n
    s = math.sin(a)
    p = {**lean(-6 + 1.2 * s), 'chest@': (0, 0, -0.004 + 0.003 * s), **legs_stand(2, 3),
         **body(0, 0, -0.006 + 0.003 * s)}
    # hands folded in front (chest-local IK, standard body; scaled by the torso proportions)
    p['ik_R'] = (-0.045, -0.215, -0.235 + 0.006 * s, -1.0, 0.35, -0.4)
    p['ik_L'] = (0.045, -0.225, -0.225 + 0.006 * s, 1.0, 0.35, -0.4)
    p['hand_R'] = (0, 0, 14)
    p['hand_L'] = (0, 0, -14)
    faces = ['sad', 'sad', 'sad_closed', 'sad']
    p.update(meta('down', faces[i % 4]))
    return p


# --------------------------------------------------------------------------- clap
# Applause in front of the chest (below the chin): apart - closing - CLAP - apart - closing - CLAP.

CLAP_KEYS = [  # (half gap between the hands m, height m, face, head pose, body bounce m)
    (0.125, 0.000, 'happy', 'soc', 0.000),
    (0.070, 0.010, 'happy', 'up', 0.006),
    (0.034, 0.016, 'smile', 'up', 0.010),
    (0.120, 0.004, 'happy', 'soc', 0.002),
    (0.066, 0.012, 'happy', 'tilt', 0.006),
    (0.034, 0.018, 'smile', 'tilt', 0.010),
]


def p_clap(i, n, ch, d):
    gap, h, face, hp, up = CLAP_KEYS[i % 6]
    fwd = -0.255 + (0.12 - gap) * 0.12
    p = {**lean(2 + 2 * (up / 0.01)), **legs_stand(3, 2), **body(0, 0, up)}
    p['ik_R'] = (-gap, fwd, -0.035 + h, -1.0, 0.45, -0.35)
    p['ik_L'] = (gap, fwd, -0.035 + h, 1.0, 0.45, -0.35)
    # palms face each other: mittens turned inward
    p['hand_R'] = (0, 0, 60)
    p['hand_L'] = (0, 0, -60)
    zf = ('hand_R', 'hand_L') if d == 'S' else ('hand_R',)
    p.update(meta(hp, face, zf))
    return p


# --------------------------------------------------------------------------- sit
# Seated on a SEAT_H seat; world origin (= anchor) is the seat's front-centre.  Hands rest on
# the thighs, legs swing a little (chibi legs dangle), friendly face.

def p_sit(i, n, ch, d):
    a = TAU * i / n
    s = math.sin(a)
    hz = ch.get('hip_z', 0.338)
    kid = _age(ch) == 'child'
    p = {'hips@': (0, SEAT_BACK, 0.065 - hz + 0.003 * s),
         'hip_R': (84, 5, 0), 'hip_L': (84, 5, 0),
         'knee_R': (70 + (14 if kid else 8) * s, 0, 0), 'knee_L': (70 - (14 if kid else 8) * s, 0, 0),
         **lean(-3 + 1.2 * s, 1.5 * s), 'chest@': (0, 0, 0.003 * s)}
    p['ik_R'] = (-0.125, -0.215, -0.205, -1.0, 0.2, -0.3)        # hands on the thighs
    p['ik_L'] = (0.125, -0.215, -0.205, 1.0, 0.2, -0.3)
    faces = ['smile', 'neutral', 'neutral', 'blink']
    p.update(meta('soc', faces[i % 4]))
    return p


# --------------------------------------------------------------------------- push
# Walking behind a stroller.  The legs walk (shorter steps), the body leans into the push and the
# hands hold the handle bar: the renderer replaces the IK targets below by the world-space grip
# (push_grip) so both hands stay exactly on the bar while the body bobs.

def push_grip(age):
    """(forward m, height m, half width m) of the handle-bar grip relative to the anchor (root),
    in the pusher's facing frame (forward = facing direction).  Height = the life2 baby_stroller grip
    (handleHeightM 0.64) for every age, so pushPoint lands exactly on the stroller's handlePoint."""
    if age == 'child':                     # short arms: the bar comes closer
        return 0.17, HANDLE_H, HANDLE_W / 2
    if age == 'elder':
        return 0.24, HANDLE_H, HANDLE_W / 2
    return 0.25, HANDLE_H, HANDLE_W / 2


def p_push(i, n, ch, d):
    a = TAU * i / n
    s = math.sin(a)
    age = _age(ch)
    amp, kn = (20.0, 30.0) if age == 'elder' else ((28.0, 48.0) if age == 'child' else (26.0, 44.0))
    bob = 0.010 if age == 'elder' else (0.018 if age == 'child' else 0.014)
    p = legs_walk(a, amp, kn, ch.get('leg_len', 0.34), bob)
    p.update({**lean(7, 0, 3 * s), 'hips': (0, 0, -4 * s), 'chest@': (0, 0, 0.003 * math.cos(2 * a))})
    # nominal (chest-local) targets; tf2_render.solve_push() re-solves them in world space
    p['ik_R'] = (-0.12, -0.26, 0.02, -1.0, 0.0, -0.8)
    p['ik_L'] = (0.12, -0.26, 0.02, 1.0, 0.0, -0.8)
    p['hand_R'] = (-20, 0, 70)
    p['hand_L'] = (-20, 0, -70)
    p.update(meta('loco', 'blink' if i == 5 else 'neutral'))
    p['_push'] = True
    return p


FN2 = {'sad': p_sad, 'clap': p_clap, 'sit': p_sit, 'push': p_push}


def posture2(ch, anim):
    h = ch.get('hunch', 0.0)
    if not h:
        return {}
    if anim == 'sit':
        h = h * 0.5
        return {**lean(h), 'neck': (h * 1.15, 0, 0)}
    return ta.posture(ch, anim)


def pose2(anim, i, ch, d):
    if anim not in ANIMS2:
        return ta.pose(anim, i, ch, d)
    n = ANIMS2[anim]['frames']
    p = FN2[anim](i, n, ch, d)
    keep = {k: p[k] for k in p if k.startswith('_')}
    body_p = {k: v for k, v in p.items() if not k.startswith('_')}
    extra = posture2(ch, anim)
    if extra:
        body_p = va.add(body_p, extra)
    if anim in SOCIAL2 and d in ta.CHEAT_SPINE:
        body_p = va.add(body_p, {'spine': (0, 0, ta.CHEAT_SPINE[d])})
    body_p.update(keep)
    return body_p


def frames2(anims=None):
    """[(anim, dir, i)] of the new anims in manifest order."""
    return [(a, d, i) for a in ORDER2 if anims is None or a in anims
            for d in ANIMS2[a]['dirs'] for i in range(ANIMS2[a]['frames'])]


def timeline2():
    out = {}
    ch = {'age': 'adult', 'leg_len': 0.338, 'hip_z': 0.338}
    for a, d, i in frames2():
        p = pose2(a, i, ch, d)
        out[(a, d, i)] = dict(hp=p['_hp'], face=p['_face'], brow=p['_brow'], zfront=sorted(p['_zfront']))
    return out
