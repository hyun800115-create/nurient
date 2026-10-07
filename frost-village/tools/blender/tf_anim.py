"""
tf_anim.py - poses for the townfolk paper-doll generator (CONTRACT_V4 J).

Pure python (no bpy) so the packer / checker / compositor can import the timing tables.

A townsperson is drawn from two kinds of layers:
  * BODY-SPACE layers (arms, hands, tops, bottoms, shoes, scarves, bags, job details) are
    rendered for every (base body, anim, dir, frame) with the pose below.
  * HEAD-SPACE layers (head skin, face, brows, hair, hats, glasses ...) are rendered ONCE per
    (head pose, dir) with the head pivot at a fixed pixel, and placed per frame at the
    projected head pivot (manifest `headOffset`).  To make that exact, the head's WORLD
    orientation is stabilised: every frame the head joint is counter-rotated so it only
    ever shows one of the HEAD_POSES below (the body still bobs / twists / hunches).

pose(anim, i, n, ch, d) -> dict for char_geo.Rig.apply() plus
    '_hp'    head pose name (HEAD_POSES key, resolved per dir by head_rot())
    '_face'  face expression (FACE_EXPR key)      '_brow'  brow shape ('neutral' | 'up')
    '_zfront' set of limb layers ('arm_R', 'hand_R', ...) drawn ABOVE the head stack this
             frame (raised near-side arms in social anims)

Anims (contract J): idle 4, walk 8, carry_walk 8 in 5 dirs; talk 8, wave 6, happy 6 in S/SE/E.
Joint sign conventions are vil_anim's (see its header).
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import vil_anim as va          # noqa: E402  (pure python helpers)

TAU = math.tau
LOCO_DIRS = ['S', 'SE', 'E', 'NE', 'N']
SOCIAL_DIRS = ['S', 'SE', 'E']

ANIMS = {
    'idle':       dict(frames=4, fps=6, repeat=-1, dirs=LOCO_DIRS),
    'walk':       dict(frames=8, fps=12, repeat=-1, dirs=LOCO_DIRS),
    'carry_walk': dict(frames=8, fps=12, repeat=-1, dirs=LOCO_DIRS),
    'talk':       dict(frames=8, fps=10, repeat=-1, dirs=SOCIAL_DIRS),
    'wave':       dict(frames=6, fps=10, repeat=-1, dirs=SOCIAL_DIRS),
    'happy':      dict(frames=6, fps=10, repeat=-1, dirs=SOCIAL_DIRS),
}
ORDER = ['idle', 'walk', 'carry_walk', 'talk', 'wave', 'happy']
SOCIAL = {'talk', 'wave', 'happy'}

# head pose -> (look_down_deg, tilt_deg, turn_deg) relative to the facing direction.
# Social poses also turn toward the camera in SE/E (CHEAT) so faces stay readable.
HEAD_POSES = {
    'loco': (2.0, 0.0, 0.0),
    'soc':  (0.0, 0.0, 0.0),
    'nod':  (7.0, 0.0, 0.0),
    'up':   (-9.0, 0.0, 0.0),
    'tilt': (-2.0, 8.0, 0.0),
}
HEAD_POSE_DIRS = {'loco': LOCO_DIRS, 'soc': SOCIAL_DIRS, 'nod': SOCIAL_DIRS, 'up': SOCIAL_DIRS,
                  'tilt': SOCIAL_DIRS}
CHEAT_TURN = {'S': 0.0, 'SE': -8.0, 'E': -20.0}
CHEAT_SPINE = {'S': 0.0, 'SE': -3.0, 'E': -9.0}


def head_rot(hp, d):
    down, tilt, turn = HEAD_POSES[hp]
    if hp != 'loco':
        turn += CHEAT_TURN.get(d, 0.0)
    return down, tilt, turn


def head_frames():
    """[(pose, dir)] - every head-space frame that exists."""
    return [(hp, d) for hp in HEAD_POSES for d in HEAD_POSE_DIRS[hp]]


# face expressions (vil_face toggle names; brows are a separate, hair-tinted layer)
FACE_EXPR = {
    'neutral':   ['eye_dot', 'm_smile', 'cheek_blush'],
    'blink':     ['eye_blink', 'm_smile', 'cheek_blush'],
    'smile':     ['eye_dot', 'm_grin', 'cheek_blush'],
    'happy':     ['eye_happy', 'm_grin', 'cheek_blush'],
    'talk_open': ['eye_dot', 'm_open', 'cheek_blush'],
    'talk_mid':  ['eye_dot', 'm_mid', 'cheek_blush'],
}
BROW_SHAPES = {'neutral': 'brow_neutral', 'up': 'brow_up'}
EXPR_BROW = {'neutral': 'neutral', 'blink': 'neutral', 'smile': 'up', 'happy': 'up', 'talk_open': 'up',
             'talk_mid': 'neutral'}
FACE_DIRS = ['S', 'SE', 'E']           # NE / N show the back of the head: no face layer


def face_frames():
    """[(pose, dir, expr)] rendered for every face set (loco: neutral/blink only)."""
    out = []
    for hp, d in head_frames():
        if d not in FACE_DIRS:
            continue
        exprs = ['neutral', 'blink'] if hp == 'loco' else list(FACE_EXPR)
        out += [(hp, d, e) for e in exprs]
    return out


def brow_frames():
    out = []
    for hp, d in head_frames():
        if d not in FACE_DIRS:
            continue
        out += [(hp, d, b) for b in BROW_SHAPES]
    return out


# --------------------------------------------------------------------------- helpers

lean, look, arm, arms, body = va.lean, va.look, va.arm, va.arms, va.body
legs_stand, squat, legs_walk = va.legs_stand, va.squat, va.legs_walk
BASE = va.BASE
CARRY = va.CARRY


def meta(hp, face, zfront=()):
    return {'_hp': hp, '_face': face, '_brow': EXPR_BROW[face], '_zfront': set(zfront)}


def _role(ch):
    return ch.get('age', 'adult')


# --------------------------------------------------------------------------- loco

def p_idle(i, n, ch, d):
    a = TAU * i / n
    s = math.sin(a)
    p = dict(BASE)
    p.update({'chest@': (0, 0, 0.007 * s), 'neck@': (0, 0, 0.004 * s), **lean(-1.5 - 1.0 * s),
              'hips@': (0, 0, -0.004 - 0.004 * s),
              'hip_R': (2 + 1.5 * s, 3, 0), 'hip_L': (2 + 1.5 * s, 3, 0), 'knee_R': (3 + 3 * s, 0, 0),
              'knee_L': (3 + 3 * s, 0, 0), 'sh_R': (4 - 2 * s, 9 + 3 * s + ch.get('arm_out', 0), 0),
              'sh_L': (4 - 2 * s, 9 + 3 * s + ch.get('arm_out', 0), 0)})
    p.update(meta('loco', 'blink' if i == 2 else 'neutral'))
    return p


def p_walk(i, n, ch, d, carry=False):
    a = TAU * i / n
    s = math.sin(a)
    age = _role(ch)
    elder = age == 'elder'
    kid = age == 'child'
    amp, kn = (24.0, 36.0) if elder else ((36.0, 60.0) if kid else (34.0, 55.0))
    bob = 0.014 if elder else (0.03 if kid else 0.022)
    p = legs_walk(a, amp, kn, ch.get('leg_len', 0.34), bob)
    p.update({**lean(-5 if not carry else 2, 0, 7 * s), 'hips': (0, 0, -5 * s),
              'chest@': (0, 0, 0.004 * math.cos(2 * a))})
    if carry:
        p.update(CARRY)
        p.update(lean(3, 0, 3 * s))
        p['hips'] = (0, 0, -6 * s)
        p.update(meta('loco', 'neutral'))
    else:
        sw = 26.0 if elder else (46.0 if kid else 40.0)
        out = 10 + ch.get('arm_out', 0)
        p['sh_R'] = (-sw * s + 4, out, 0)
        p['sh_L'] = (sw * s + 4, out, 0)
        p['el_R'] = (18 + 14 * max(0, -s), 0, 0)
        p['el_L'] = (18 + 14 * max(0, s), 0, 0)
        p.update(meta('loco', 'blink' if i == 5 else 'neutral'))
    return p


# --------------------------------------------------------------------------- social
# Hands stay below the chin / outside the head silhouette unless the arm is listed in
# '_zfront' (then the game draws that arm + hand above the head stack).

def p_talk(i, n, ch, d):
    a = TAU * i / n
    s, c = math.sin(a), math.cos(a)
    mouths = ['talk_open', 'talk_mid', 'neutral', 'talk_open', 'blink', 'talk_open', 'neutral', 'talk_mid']
    poses = ['soc', 'nod', 'soc', 'soc', 'nod', 'soc', 'soc', 'nod']
    p = dict(BASE)
    p.update({**lean(-1 + 1.5 * s, 2.5 * c, 0), 'chest@': (0, 0, 0.004 * math.sin(2 * a)),
              **legs_stand(3, 2)})
    # explaining hand: in front of the chest, palm up, small circles - kept below the chin
    p['ik_R'] = (-0.15 + 0.035 * c, -0.25, -0.075 + 0.04 * s, -1.0, 0.25, -0.6)
    p['hand_R'] = (-15, 0, 18 * s)
    p.update(arm('L', 6 - 3 * s, 10 + ch.get('arm_out', 0), 0, 16))
    p.update(meta(poses[i % 8], mouths[i % 8]))
    return p


def p_wave(i, n, ch, d):
    a = TAU * i / n
    s, c = math.sin(a), math.cos(a)
    p = dict(BASE)
    p.update({**lean(3, -5 + 2 * s, 0), **legs_stand(3, 2), **body(0, 0, 0.012 * abs(s))})
    # right hand raised beside the head, waving; drawn above the head stack (near side in SE/E)
    p['ik_R'] = (-0.33 - 0.05 * s, -0.10 - 0.03 * c, 0.24 + 0.02 * c, -1.0, 0.1, -0.6)
    p['hand_R'] = (0, 0, 24 * s)
    p.update(arm('L', 4, 12 + ch.get('arm_out', 0), 0, 14))
    faces = ['happy', 'happy', 'smile', 'happy', 'happy', 'smile']
    p.update(meta('tilt' if i % 3 != 2 else 'soc', faces[i % 6], ('arm_R', 'hand_R')))
    return p


def p_happy(i, n, ch, d):
    L = ch.get('leg_len', 0.34)
    sc = L / 0.34
    up = va.up_hands
    keys = [
        ({**arms(14, 14, 30), **body(0, 0, -0.03 * sc), **lean(-8), **squat(24, L)}, 'soc', 'smile', ()),
        ({**up(0.34, 0.20), **body(0, 0, 0.05 * sc), **lean(4), **legs_stand(3, 4)}, 'up', 'happy', 'both'),
        ({**up(0.37, 0.30), **body(0, 0, 0.10 * sc), **lean(8), **legs_stand(3, 14),
          'knee_R': (40, 0, 0), 'knee_L': (40, 0, 0)}, 'up', 'happy', 'both'),
        ({**up(0.36, 0.26), **body(0, 0, 0.07 * sc), **lean(6), **legs_stand(3, 8)}, 'up', 'happy', 'both'),
        ({**arms(40, 50, 40), **body(0, 0, -0.025 * sc), **lean(-8), **squat(20, L)}, 'soc', 'happy', ()),
        ({**arms(16, 14, 24), **body(0, 0, -0.008 * sc), **lean(-3), **legs_stand(3, 6)}, 'soc', 'smile', ()),
    ]
    p, hp, f, zf = keys[i % 6]
    p = dict(p)
    if zf == 'both':
        # the far arm stays behind the head in SE/E; both come forward in S
        zf = ('arm_R', 'hand_R', 'arm_L', 'hand_L') if d == 'S' else ('arm_R', 'hand_R')
    p.update(meta(hp, f, zf))
    return p


FN = {'idle': p_idle, 'walk': p_walk, 'carry_walk': lambda i, n, ch, d: p_walk(i, n, ch, d, True),
      'talk': p_talk, 'wave': p_wave, 'happy': p_happy}


def posture(ch, anim):
    h = ch.get('hunch', 0.0)
    if not h:
        return {}
    return {**lean(h), 'neck': (h * 1.15, 0, 0), 'hip_R': (h * 0.3, 0, 0), 'hip_L': (h * 0.3, 0, 0),
            'knee_R': (h * 0.6, 0, 0), 'knee_L': (h * 0.6, 0, 0), 'hips@': (0, 0, -0.004 * h / 10)}


def pose(anim, i, ch, d):
    n = ANIMS[anim]['frames']
    p = FN[anim](i, n, ch, d)
    keep = {k: p[k] for k in p if k.startswith('_')}
    body_p = {k: v for k, v in p.items() if not k.startswith('_')}
    extra = posture(ch, anim)
    if extra:
        body_p = va.add(body_p, extra)
    if anim in SOCIAL and d in CHEAT_SPINE:
        body_p = va.add(body_p, {'spine': (0, 0, CHEAT_SPINE[d])})
    body_p.update(keep)
    return body_p


def all_frames():
    """[(anim, dir, i)] in manifest order."""
    return [(a, d, i) for a in ORDER for d in ANIMS[a]['dirs'] for i in range(ANIMS[a]['frames'])]


def timeline():
    """Per (anim, dir, i): head pose, face, brow, zfront (base independent)."""
    out = {}
    ch = {'age': 'adult', 'leg_len': 0.338}
    for a, d, i in all_frames():
        p = pose(a, i, ch, d)
        out[(a, d, i)] = dict(hp=p['_hp'], face=p['_face'], brow=p['_brow'], zfront=sorted(p['_zfront']))
    return out
