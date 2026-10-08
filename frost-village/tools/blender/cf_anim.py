"""
cf_anim.py - cityfolk animation additions (CONTRACT_V8 AD).  Pure python (no bpy).

Extends tf_anim / tf2_anim (imported, never edited) with twelve anims for every base body:

    run            8 f  5 dirs   hurried jog: forward lean, pumping fists, a little flight phase
    flee           8 f  5 dirs   comic panic run: SAME legs as run, arms waving beside the head, '><' face
    arrested_walk  8 f  5 dirs   slow sheepish walk, hands behind the back, head down-ish
    carry_box      8 f  5 dirs   slow walk hugging a big box against the chest (anim item held_box, boxPoint)
    argue          6 f  S/SE/E   fist on the hip, finger wagging, a cross little foot stomp
    fight          6 f  S/SE/E   comic windmill flailing + hops (meant to peek out of fx_fight_cloud)
    point          6 f  S/SE/E   'over there!': arm out with a pointing finger (anim item hand_point)
    think          4 f  S/SE/E   hand on the chin, other arm folded, head up / tilted
    shocked        4 f  S/SE/E   jolt, then both mittens on the cheeks
    phone          4 f  S/SE/E   handset at the ear (anim item held_phone), chatting
    sweep          6 f  S/SE/E   broom across the front, ping-pong sweep (anim item held_broom, sweepPoint)
    spray_hose     4 f  S/SE/E/NE braced stance, nozzle in both hands (anim item held_hose, nozzlePoint)

SHARED LAYERS (texture memory): every anim frame names a BODY KEY (unique pose of that anim/dir); frames
that repeat a key reuse the same rendered images (ping-pong / held poses), and every key names a LOWER KEY
(legs + hips + root only).  Lower-body layers (trousers, skirts, tights, shoes...) are rendered once per
lower key WITHOUT arm holdouts and shared by every anim that uses it:  run + flee share 'runlegs',
arrested_walk + carry_box share 'slowlegs', think / phone / point / shocked / sweep / argue share the
planted 'stand' stance (+ argue's 'stomp'), fight has 'hop', spray_hose 'brace'.  In those anims the hands
never pass in front of the trousers (checked in cf_check), and hands that do sit over the seat (arrested
walk seen from behind) are drawn with zfront.

New head poses: none (the cityfolk anims use loco / soc / nod / up / tilt / down, so every existing head
layer is reused).  New face expressions (rendered for every face set on every face pose):
    shocked, panic, angry, shout, thinking, determined, sheepish   (+ brow shape 'angry')
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
SPRAY_DIRS = ['S', 'SE', 'E', 'NE']

ANIMS3 = {
    'run':           dict(frames=8, fps=14, repeat=-1, dirs=LOCO_DIRS),
    'flee':          dict(frames=8, fps=14, repeat=-1, dirs=LOCO_DIRS),
    'arrested_walk': dict(frames=8, fps=9, repeat=-1, dirs=LOCO_DIRS),
    'carry_box':     dict(frames=8, fps=10, repeat=-1, dirs=LOCO_DIRS),
    'argue':         dict(frames=6, fps=8, repeat=-1, dirs=SOCIAL_DIRS),
    'fight':         dict(frames=6, fps=12, repeat=-1, dirs=SOCIAL_DIRS),
    'point':         dict(frames=6, fps=8, repeat=-1, dirs=SOCIAL_DIRS),
    'think':         dict(frames=4, fps=3, repeat=-1, dirs=SOCIAL_DIRS),
    'shocked':       dict(frames=4, fps=8, repeat=-1, dirs=SOCIAL_DIRS),
    'phone':         dict(frames=4, fps=5, repeat=-1, dirs=SOCIAL_DIRS),
    'sweep':         dict(frames=6, fps=8, repeat=-1, dirs=SOCIAL_DIRS),
    'spray_hose':    dict(frames=4, fps=10, repeat=-1, dirs=SPRAY_DIRS),
}
ORDER3 = ['run', 'flee', 'arrested_walk', 'carry_box', 'argue', 'fight', 'point', 'think', 'shocked', 'phone',
          'sweep', 'spray_hose']
WALKERS = {'run', 'flee', 'arrested_walk', 'carry_box'}
SOCIAL3 = {'argue', 'fight', 'point', 'think', 'shocked', 'phone', 'sweep'}     # camera cheat on the spine

# frame i -> body key (unique pose per dir).  Repeated keys = shared images.
KEYS3 = {
    'run': list(range(8)), 'flee': list(range(8)), 'arrested_walk': list(range(8)), 'carry_box': list(range(8)),
    'argue': [0, 1, 2, 0, 1, 2],          # wag up, wag down, stomp ... twice
    'fight': [0, 1, 2, 0, 1, 2],          # 3-step windmill, twice
    'point': [0, 1, 2, 1, 2, 1],          # raise, point, jab, point, jab, point
    'think': [0, 0, 1, 1],                # tap chin (two holds; the head moves every frame)
    'shocked': [0, 1, 1, 1],              # jolt, then mittens on the cheeks
    'phone': [0, 0, 1, 1],                # free hand on the hip / gesturing
    'sweep': [0, 1, 2, 3, 2, 1],          # ping-pong across the front
    'spray_hose': [0, 1, 0, 1],           # tiny recoil
}

# per frame: head pose, face, zfront limbs (dir dependent where needed)
HP3 = {
    'run': ['loco'] * 8, 'flee': ['loco'] * 8, 'arrested_walk': ['loco'] * 8, 'carry_box': ['loco'] * 8,
    'argue': ['soc', 'nod', 'tilt', 'soc', 'nod', 'tilt'],
    'fight': ['tilt', 'soc', 'nod', 'tilt', 'soc', 'nod'],
    'point': ['soc', 'soc', 'tilt', 'soc', 'tilt', 'soc'],
    'think': ['up', 'tilt', 'up', 'tilt'],
    'shocked': ['up', 'soc', 'up', 'soc'],
    'phone': ['tilt', 'soc', 'tilt', 'nod'],
    'sweep': ['nod', 'nod', 'soc', 'nod', 'nod', 'soc'],
    'spray_hose': ['loco'] * 4,
}
FACE3 = {
    'run': ['neutral', 'neutral', 'neutral', 'neutral', 'neutral', 'blink', 'neutral', 'neutral'],
    'flee': ['panic'] * 8,
    'arrested_walk': ['sheepish'] * 8,
    'carry_box': ['neutral', 'neutral', 'determined', 'neutral', 'neutral', 'blink', 'determined', 'neutral'],
    'argue': ['shout', 'angry', 'shout', 'angry', 'shout', 'angry'],
    'fight': ['shout', 'angry', 'panic', 'shout', 'angry', 'panic'],
    'point': ['shocked', 'talk_open', 'shout', 'talk_mid', 'shout', 'talk_open'],
    'think': ['thinking', 'thinking', 'blink', 'thinking'],
    'shocked': ['shocked', 'shocked', 'shocked', 'panic'],
    'phone': ['talk_open', 'talk_mid', 'neutral', 'talk_open'],
    'sweep': ['smile', 'neutral', 'smile', 'blink', 'neutral', 'smile'],
    'spray_hose': ['determined'] * 4,
}

ARM_R = ('arm_R', 'hand_R')
BOTH = ('arm_R', 'hand_R', 'arm_L', 'hand_L')


def zfront3(anim, key, d):
    """Limbs drawn above the head stack (90/91) for this anim key / dir."""
    if anim == 'flee':
        return BOTH if d == 'S' else (ARM_R if d in ('SE', 'E') else ())
    if anim == 'arrested_walk':
        return ('hand_R', 'hand_L') if d in ('NE', 'N') else ()
    if anim in ('think', 'phone'):
        return ARM_R
    if anim == 'shocked':
        return BOTH if d == 'S' else ARM_R
    if anim == 'point':
        return ARM_R
    if anim == 'fight':
        return BOTH if d == 'S' else ARM_R
    return ()


# --------------------------------------------------------------------------- faces
FACE_EXPR3 = {
    'shocked':    ['eye_round', 'm_O', 'cheek_blush'],
    'panic':      ['eye_chevron', 'm_D', 'cheek_blush', 'fx_sweat'],
    'angry':      ['eye_glare', 'm_pout', 'cheek_red'],
    'shout':      ['eye_glare', 'm_open', 'cheek_red'],
    'thinking':   ['eye_dot', 'm_smirk', 'cheek_blush'],
    'determined': ['eye_dot', 'm_grin', 'cheek_blush'],
    'sheepish':   ['eye_sleep', 'm_wavy', 'cheek_blush', 'fx_sweat'],
}
BROW_SHAPES3 = {'angry': 'brow_angry'}
EXPR_BROW3 = {'shocked': 'up', 'panic': 'sad', 'angry': 'angry', 'shout': 'angry', 'thinking': 'up',
              'determined': 'angry', 'sheepish': 'sad'}
NEW_EXPRS3 = list(FACE_EXPR3)


def expr_brow(face):
    return EXPR_BROW3.get(face) or ta2.EXPR_BROW2.get(face) or ta.EXPR_BROW.get(face, 'neutral')


def face_poses():
    """Every face head frame (pose, dir) of townfolk + townfolk2 (S/SE/E only)."""
    return [(hp, d) for hp, d in ta2.all_head_frames() if d in ta.FACE_DIRS]


def face_frames3():
    """[(pose, dir, expr)] - the new expressions on every face frame."""
    return [(hp, d, e) for hp, d in face_poses() for e in NEW_EXPRS3]


def meta(hp, face, zfront=()):
    return {'_hp': hp, '_face': face, '_brow': expr_brow(face), '_zfront': set(zfront)}


# --------------------------------------------------------------------------- helpers
lean, arm, arms, body = va.lean, va.arm, va.arms, va.body
legs_stand, legs_walk = va.legs_stand, va.legs_walk


def _age(ch):
    return ch.get('age', 'adult')


def run_legs(i, n, ch):
    """Shared by run and flee (identical hips / legs / root every frame)."""
    a = TAU * i / n
    s, c = math.sin(a), math.cos(a)
    age = _age(ch)
    amp, kn, fly = {'elder': (28.0, 50.0, 0.010), 'child': (46.0, 84.0, 0.030)}.get(age, (42.0, 80.0, 0.026))
    L = ch.get('leg_len', 0.34)
    p = legs_walk(a, amp, kn, L, 0.0)
    drop = L * (1 - math.cos(math.radians(amp * 0.85 * abs(s)))) * 0.7
    p['hips@'] = (0, 0, fly * abs(math.sin(2 * a + 0.6)) - drop - 0.004)
    p['root'] = (0, 3.0 * c, 0)
    p['hips'] = (0, 0, -7 * s)
    return p


def slow_legs(i, n, ch):
    """Shared by arrested_walk and carry_box: short, careful steps."""
    a = TAU * i / n
    s, c = math.sin(a), math.cos(a)
    age = _age(ch)
    amp, kn, bob = {'elder': (20.0, 30.0, 0.010), 'child': (28.0, 44.0, 0.018)}.get(age, (25.0, 38.0, 0.014))
    p = legs_walk(a, amp, kn, ch.get('leg_len', 0.34), bob)
    p['root'] = (0, 2.5 * c, 0)
    p['hips'] = (0, 0, -4 * s)
    return p


def stand_legs(ch, stomp=False):
    p = {**legs_stand(4, 2), 'hips@': (0, 0, -0.003)}
    if stomp:                      # right foot lifted for a cross little stomp
        p['hip_R'] = (30, 6, 0)
        p['knee_R'] = (58, 0, 0)
        p['hips@'] = (0, 0, 0.004)
    return p


def brace_legs(ch):
    """spray_hose: wide braced stance, knees a little bent, left foot forward."""
    L = ch.get('leg_len', 0.34)
    t = 10.0
    drop = L * 0.5 * (1 - math.cos(math.radians(t))) * 1.15
    return {'hip_R': (t - 10, 9, 0), 'hip_L': (t + 14, 8, 0), 'knee_R': (2 * t, 0, 0), 'knee_L': (2 * t - 4, 0, 0),
            'hips@': (0, 0, -drop - 0.006)}


def hop_legs(k, ch):
    """fight: 3-step hop with alternating kicks (feet leave the ground)."""
    L = ch.get('leg_len', 0.34)
    up = [0.030, 0.010, 0.022][k] * (L / 0.34)
    kick = [('R', 40, 30), (None, 0, 0), ('L', 40, 30)][k]
    p = {**legs_stand(6, 6), 'hips@': (0, 0, up)}
    if kick[0]:
        p['hip_' + kick[0]] = (kick[1], 8, 0)
        p['knee_' + kick[0]] = (kick[2], 0, 0)
    else:
        p['knee_R'] = (26, 0, 0)
        p['knee_L'] = (26, 0, 0)
    return p


LOWER_JOINTS = ('root', 'hips', 'hips@', 'hip_R', 'hip_L', 'knee_R', 'knee_L')


def lower_key(anim, key):
    """(group, lower key) for a body key - lower-body layers are rendered once per (group, lkey, dir)."""
    if anim in ('run', 'flee'):
        return 'runlegs', key
    if anim in ('arrested_walk', 'carry_box'):
        return 'slowlegs', key
    if anim == 'argue':
        return 'stand', ('stomp' if key == 2 else 0)
    if anim in ('point', 'think', 'shocked', 'phone', 'sweep'):
        return 'stand', 0
    if anim == 'fight':
        return 'hop', key
    if anim == 'spray_hose':
        return 'brace', 0
    raise KeyError(anim)


LOWER_GROUPS = {'runlegs': ['run', 'flee'], 'slowlegs': ['arrested_walk', 'carry_box'],
                'stand': ['point', 'think', 'shocked', 'phone', 'sweep', 'argue'], 'hop': ['fight'],
                'brace': ['spray_hose']}


def legs_for(anim, key, ch):
    g, lk = lower_key(anim, key)
    if g == 'runlegs':
        return run_legs(lk, 8, ch)
    if g == 'slowlegs':
        return slow_legs(lk, 8, ch)
    if g == 'stand':
        return stand_legs(ch, stomp=(lk == 'stomp'))
    if g == 'hop':
        return hop_legs(lk, ch)
    return brace_legs(ch)


# --------------------------------------------------------------------------- items geometry (metres, facing frame)
# Item poses the renderer places in WORLD space after posing; the hands are IK-solved onto their grips.
def box_size(age):
    """(width, depth, height) of the hugged box per age (cardboard_box_m-ish for adults)."""
    return {'child': (0.27, 0.22, 0.22), 'elder': (0.32, 0.26, 0.26)}.get(age, (0.36, 0.28, 0.28))


def box_center(age):
    """Box centre in chest-local metres for the standard torso (scaled with the torso like ik targets)."""
    return {'child': (0.0, -0.21, -0.08), 'elder': (0.0, -0.23, -0.10)}.get(age, (0.0, -0.25, -0.10))


SPRAY_PITCH = -7.0           # nozzle axis below horizontal (deg)
SWEEP_DX = [-0.035, -0.012, 0.012, 0.035]


def item_scale(age):
    return {'child': 0.82, 'elder': 0.94}.get(age, 1.0)


# --------------------------------------------------------------------------- pose functions (body key -> pose)

def p_run(k, ch, d):
    n = 8
    a = TAU * k / n
    s = math.sin(a)
    age = _age(ch)
    p = run_legs(k, n, ch)
    lf = {'elder': 8, 'child': 10}.get(age, 11)
    p.update({**lean(lf, 0, 8 * s), 'chest@': (0, 0, 0.004 * math.cos(2 * a))})
    sw = {'elder': 34.0, 'child': 52.0}.get(age, 48.0)
    out = 14 + ch.get('arm_out', 0)
    p['sh_R'] = (-sw * s + 14, out, 0)
    p['sh_L'] = (sw * s + 14, out, 0)
    p['el_R'] = (82 + 10 * max(0, -s), 0, 0)
    p['el_L'] = (82 + 10 * max(0, s), 0, 0)
    p['hand_R'] = (-10, 0, 0)
    p['hand_L'] = (-10, 0, 0)
    return p


def p_flee(k, ch, d):
    n = 8
    a = TAU * k / n
    s, c = math.sin(a), math.cos(a)
    p = run_legs(k, n, ch)
    p.update({**lean(3, 3 * s, 5 * s), 'chest@': (0, 0, 0.004 * math.cos(2 * a))})
    # arms flung up beside the head, waving out of phase (IK targets are unreachable on purpose:
    # the arm straightens toward them, hands end beside the ears)
    w = 0.05
    p['ik_R'] = (-0.31 - w * s, -0.04 - 0.03 * c, 0.34 + w * s, -1.0, 0.1, -0.5)
    p['ik_L'] = (0.31 - w * s, -0.04 + 0.03 * c, 0.34 - w * s, 1.0, 0.1, -0.5)
    p['hand_R'] = (0, 0, 28 * s)
    p['hand_L'] = (0, 0, -28 * s)
    return p


def p_arrested(k, ch, d):
    n = 8
    a = TAU * k / n
    s = math.sin(a)
    p = slow_legs(k, n, ch)
    p.update({**lean(5, 0, 3 * s), 'chest@': (0, 0, 0.003 * math.cos(2 * a))})
    # hands together behind the lower back (wrists 'cuffed'), elbows out and back
    p['ik_R'] = (-0.055, 0.205, -0.285, -1.0, 0.55, 0.1)
    p['ik_L'] = (0.055, 0.205, -0.285, 1.0, 0.55, 0.1)
    p['hand_R'] = (0, 0, 40)
    p['hand_L'] = (0, 0, -40)
    return p


def p_carry_box(k, ch, d):
    n = 8
    a = TAU * k / n
    s = math.sin(a)
    age = _age(ch)
    p = slow_legs(k, n, ch)
    p.update({**lean(-3, 0, 3 * s), 'chest@': (0, 0, 0.003 * math.cos(2 * a))})
    w, dep, h = box_size(age)
    cx, cy, cz = box_center(age)
    # palms on the box sides, a little below the middle (hugging it up against the chest)
    hx = w / 2 + 0.035
    p['ik_R'] = (cx - hx, cy + 0.01, cz - 0.02, -1.0, 0.35, -0.6)
    p['ik_L'] = (cx + hx, cy + 0.01, cz - 0.02, 1.0, 0.35, -0.6)
    p['hand_R'] = (0, 0, 80)
    p['hand_L'] = (0, 0, -80)
    p['_box'] = True
    return p


def p_argue(k, ch, d):
    p = stand_legs(ch, stomp=(k == 2))
    wag = [1.0, -1.0, 0.4][k]
    p.update({**lean(7 + 2 * (k == 2), 2 * wag, 0), 'chest@': (0, 0, 0.004 * wag)})
    p['ik_L'] = va.HOLD_STYLES['hips']['ik_L']                  # fist on the hip
    # finger wagging in front of the chest, toward the other person
    p['ik_R'] = (-0.13 - 0.02 * wag, -0.26, 0.02 + 0.045 * wag, -1.0, 0.3, -0.6)
    p['hand_R'] = (-30, 0, 18 * wag)
    p['_finger'] = True
    return p


def p_fight(k, ch, d):
    p = hop_legs(k, ch)
    th = TAU * k / 3
    p.update({**lean(6, 5 * math.sin(th), 10 * math.sin(th + 1.0))})
    # windmill: each arm sweeps a big circle in the sagittal plane, half a turn apart
    for side, ph in (('R', 0.0), ('L', math.pi)):
        ang = th + ph
        sx = -1.0 if side == 'R' else 1.0
        p['ik_' + side] = (sx * (0.24 + 0.05 * math.cos(ang)), -0.16 - 0.10 * math.cos(ang),
                           0.05 + 0.20 * math.sin(ang), sx, 0.2, -0.4)
        p['hand_' + side] = (0, 0, 0)
    return p


def p_point(k, ch, d):
    p = stand_legs(ch)
    ext = [0.55, 1.0, 1.12][k]
    p.update({**lean(3 + 3 * (k == 2), -2, -6), 'chest@': (0, 0, 0.003 * (k == 2))})
    p['ik_L'] = va.HOLD_STYLES['hips']['ik_L']
    # pointing arm: forward and 35 deg out to the right, at shoulder height, finger along the forearm
    r = 0.31 * ext
    ang = math.radians(35)
    p['ik_R'] = (-0.185 - r * math.sin(ang), -r * math.cos(ang), 0.06 + 0.06 * (1 - ext), -1.0, 0.0, -1.0)
    p['hand_R'] = (-70, 0, 0)
    p['_finger'] = True
    return p


def p_think(k, ch, d):
    p = stand_legs(ch)
    p.update({**lean(-2, 2 * (k - 0.5), 0), 'chest@': (0, 0, 0.002 * k)})
    p['ik_R'] = (-0.060, -0.198, 0.175 + 0.010 * k, -1.0, 0.2, -1.0)       # mitten on the chin
    p['hand_R'] = (-40, 0, 30)
    p['ik_L'] = (-0.03, -0.235, -0.125, 1.0, 0.25, -1.0)                    # arm folded under it
    p['hand_L'] = (0, 0, -70)
    return p


def p_shocked(k, ch, d):
    p = stand_legs(ch)
    if k == 0:                     # jolt: lean back, arms flung out
        p.update({**lean(-7), 'chest@': (0, 0, 0.006)})
        p['ik_R'] = (-0.33, -0.12, 0.12, -1.0, 0.1, -0.8)
        p['ik_L'] = (0.33, -0.12, 0.12, 1.0, 0.1, -0.8)
        p['hand_R'] = (0, 0, 20)
        p['hand_L'] = (0, 0, -20)
    else:                          # mittens on the cheeks
        p.update({**lean(-3), 'chest@': (0, 0, 0.002)})
        p['ik_R'] = (-0.215, -0.205, 0.275, -1.0, 0.1, -1.0)
        p['ik_L'] = (0.215, -0.205, 0.275, 1.0, 0.1, -1.0)
        p['hand_R'] = (-20, 0, 60)
        p['hand_L'] = (-20, 0, -60)
    return p


def p_phone(k, ch, d):
    p = stand_legs(ch)
    p.update({**lean(-1 + k, 3, 0), 'chest@': (0, 0, 0.002 * k)})
    p['ik_R'] = (-0.255, -0.06, 0.335, -1.0, 0.0, -1.0)            # handset at the right ear
    p['hand_R'] = (-15, 0, 70)
    if k == 0:
        p['ik_L'] = va.HOLD_STYLES['hips']['ik_L']
    else:                          # little explaining gesture with the free hand
        p['ik_L'] = (0.14, -0.25, -0.06, 1.0, 0.25, -0.6)
        p['hand_L'] = (-15, 0, -18)
    p['_phone'] = True
    return p


def p_sweep(k, ch, d):
    p = stand_legs(ch)
    dx = SWEEP_DX[k]
    p.update({**lean(11, 0, -4 + 8 * k / 3), 'chest@': (0, 0, 0.002 * (k % 2))})
    # both mittens stacked on the handle in front of the chest (upper = right); the broom is built along the
    # line through the two hands and reaches the snow in front-left (sweepPoint)
    p['ik_R'] = (-0.035 + 0.5 * dx, -0.205, 0.005, -1.0, 0.2, -0.6)
    p['ik_L'] = (0.030 + 1.6 * dx, -0.235, -0.115, 1.0, 0.2, -0.6)
    p['hand_R'] = (0, 0, 70)
    p['hand_L'] = (0, 0, -70)
    p['_broom'] = k
    return p


def p_spray(k, ch, d):
    p = brace_legs(ch)
    p.update({**lean(8 - 1.5 * k, 0, 0), 'chest@': (0, 0, -0.002 * k)})
    # both mittens either side of the nozzle in front of the belly ('big water pistol' grip);
    # key 1 = recoil: the nozzle kicks up / back a little
    rk = 0.012 * k
    p['ik_R'] = (-0.075, -0.238 + rk, -0.095 + 0.5 * rk, -1.0, 0.25, -0.8)
    p['ik_L'] = (0.075, -0.238 + rk, -0.095 + 0.5 * rk, 1.0, 0.25, -0.8)
    p['hand_R'] = (-10, 0, 85)
    p['hand_L'] = (-10, 0, -85)
    p['_hose'] = k
    return p


FN3 = {'run': p_run, 'flee': p_flee, 'arrested_walk': p_arrested, 'carry_box': p_carry_box, 'argue': p_argue,
       'fight': p_fight, 'point': p_point, 'think': p_think, 'shocked': p_shocked, 'phone': p_phone,
       'sweep': p_sweep, 'spray_hose': p_spray}

# anim items (body parts added automatically for that anim; they have frames only there)
ANIM_ITEMS = {'carry_box': ['held_box'], 'spray_hose': ['held_hose'], 'sweep': ['held_broom'],
              'phone': ['held_phone'], 'point': ['hand_point'], 'argue': ['hand_point']}


def posture3(ch, anim):
    h = ch.get('hunch', 0.0)
    if not h:
        return {}
    if anim in ('run', 'flee'):          # elders jog a little more upright than they walk
        h *= 0.7
    return ta.posture(ch, anim)


def body_pose3(anim, key, ch, d):
    """Rig.apply dict for body key `key` (no '_' meta except item flags) incl. posture + camera cheat."""
    p = FN3[anim](key, ch, d)
    flags = {k: p[k] for k in p if k.startswith('_')}
    body_p = {k: v for k, v in p.items() if not k.startswith('_')}
    extra = posture3(ch, anim)
    if extra:
        body_p = va.add(body_p, extra)
    if anim in SOCIAL3 and d in ta.CHEAT_SPINE:
        body_p = va.add(body_p, {'spine': (0, 0, ta.CHEAT_SPINE[d])})
    body_p.update(flags)
    return body_p


def pose3(anim, i, ch, d):
    """Full per-frame pose (+ '_hp', '_face', '_brow', '_zfront', '_key') like tf2_anim.pose2."""
    if anim not in ANIMS3:
        return ta2.pose2(anim, i, ch, d)
    k = KEYS3[anim][i]
    p = body_pose3(anim, k, ch, d)
    p.update(meta(HP3[anim][i], FACE3[anim][i], zfront3(anim, k, d)))
    p['_key'] = k
    return p


def frames3(anims=None):
    """[(anim, dir, i)] of the new anims in manifest order."""
    return [(a, d, i) for a in ORDER3 if anims is None or a in anims
            for d in ANIMS3[a]['dirs'] for i in range(ANIMS3[a]['frames'])]


def keys_of(anim):
    """Unique body keys of an anim (render order)."""
    out = []
    for k in KEYS3[anim]:
        if k not in out:
            out.append(k)
    return out


def timeline3():
    out = {}
    for a, d, i in frames3():
        k = KEYS3[a][i]
        out[(a, d, i)] = dict(hp=HP3[a][i], face=FACE3[a][i], brow=expr_brow(FACE3[a][i]),
                              zfront=sorted(zfront3(a, k, d)))
    return out


def all_anims():
    """Every anim (v4 + v5 + v8) -> info dict."""
    out = {a: ta.ANIMS[a] for a in ta.ORDER}
    out.update({a: ta2.ANIMS2[a] for a in ta2.ORDER2})
    out.update(ANIMS3)
    return out
