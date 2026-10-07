"""
pet2_anim.py - poses for the dog-play animations of pet_dog (CONTRACT_V4 section I).

Pure python (no bpy).  The five batch-1 anims (idle, walk, run, sit, happy) are taken
UNCHANGED from vil_anim.pet_pose so the re-rendered dog looks and moves exactly like
batch 1; this module only adds:

    eat       6f  8fps loop  S/SE/E   sits and crunches a bone biscuit held across the jaws (^^ eyes, crumbs)
    roll      6f  8fps loop  S/SE/E   flops on its back, belly up for petting, paws paddling, tongue out
    beg       6f  8fps loop  S/SE/E   sits up on the haunches, front paws curled and paddling
    run_ball  8f 16fps loop  5 dirs   the batch-1 run with the red ball in its mouth
    catch     6f 12fps once  S/SE/E   crouch -> leap -> snaps the ball (impactFrame 3) -> lands holding it
    trick     8f 12fps once  S/SE/E   crouch, hop-spin 360 deg, lands with a raised paw (ta-da)

pose(anim, i, d) -> dict for char_geo.Rig.apply() plus
    '_face'  : PET2_FACES key        '_props': set of prop toggles ('ball', 'treat')
    '_loc'   : {crumb_name: head-local (x, y, z) | None}   (eat crumbs)
Joint conventions are vil_anim's (pitch > 0: legs swing forward, body/neck/head tilt back;
knee pitch > 0 bends the shin backward; yaw > 0 = towards the dog's left).
Per-direction "cheats" turn the face / belly towards the camera like vil_anim.CHEAT.
"""
import math

import vil_anim as va

TAU = math.tau
LOCO = va.LOCO_DIRS
SOCIAL = va.SOCIAL_DIRS

ANIMS = {
    'idle':     dict(frames=4, fps=6, repeat=-1, dirs=LOCO),
    'walk':     dict(frames=8, fps=12, repeat=-1, dirs=LOCO),
    'run':      dict(frames=8, fps=16, repeat=-1, dirs=LOCO),
    'sit':      dict(frames=4, fps=4, repeat=-1, dirs=SOCIAL),
    'happy':    dict(frames=6, fps=10, repeat=-1, dirs=SOCIAL),
    'eat':      dict(frames=6, fps=8, repeat=-1, dirs=SOCIAL),
    'roll':     dict(frames=6, fps=8, repeat=-1, dirs=SOCIAL),
    'beg':      dict(frames=6, fps=8, repeat=-1, dirs=SOCIAL),
    'run_ball': dict(frames=8, fps=16, repeat=-1, dirs=LOCO),
    'catch':    dict(frames=6, fps=12, repeat=0, dirs=SOCIAL, impactFrame=3),
    'trick':    dict(frames=8, fps=12, repeat=0, dirs=SOCIAL),
}
ORDER = ['idle', 'walk', 'run', 'sit', 'happy', 'eat', 'roll', 'beg', 'run_ball', 'catch', 'trick']
OLD = ('idle', 'walk', 'run', 'sit', 'happy')
HIDE_SCARF_TAIL = {'roll'}        # lying on its back: the hanging scarf end would poke into the snow
NEW = ('eat', 'roll', 'beg', 'run_ball', 'catch', 'trick')

PET2_FACES = dict(va.PET_FACES)
PET2_FACES.update({
    'ball':       ['p_eye_happy', 'p_m_wide'],        # ball in the open mouth, ^^ eyes
    'ball_dot':   ['p_eye_dot', 'p_m_wide'],
    'gape':       ['p_eye_dot', 'p_m_wide'],          # mouth wide open, about to catch
    'look':       ['p_eye_dot', 'p_m_closed'],
    'chew_open':  ['p_eye_happy', 'p_m_wide'],
    'chew_shut':  ['p_eye_happy', 'p_m_closed'],
})

LEGS = ('FL', 'FR', 'BL', 'BR')


def _face(p, f, props=(), loc=None):
    p['_face'] = f
    p['_props'] = set(props)
    if loc is not None:
        p['_loc'] = loc
    return p


def _legs(p, front=(0.0, 0.0), back=(0.0, 0.0), sides=None):
    """front/back = (leg pitch, knee pitch) for both legs of the pair; sides overrides per leg."""
    for leg in LEGS:
        lp, kp = front if leg[0] == 'F' else back
        p['leg_' + leg] = (lp, 0, 0)
        p['knee_' + leg] = (kp, 0, 0)
    for leg, (lp, kp) in (sides or {}).items():
        p['leg_' + leg] = (lp, 0, 0)
        p['knee_' + leg] = (kp, 0, 0)
    return p


# --------------------------------------------------------------------------- eat

# crumbs fall from the mouth corners (head-local metres, unscaled dog) on bite frames
_CRUMBS = {
    1: {'crumb0': (0.060, -0.240, -0.135), 'crumb1': (-0.070, -0.230, -0.130)},
    2: {'crumb0': (0.075, -0.250, -0.200), 'crumb1': (-0.085, -0.240, -0.190), 'crumb2': (0.015, -0.245, -0.140)},
    3: {'crumb2': (0.020, -0.255, -0.215)},
    4: {'crumb0': (-0.060, -0.240, -0.135), 'crumb1': (0.070, -0.230, -0.130)},
    5: {'crumb0': (-0.075, -0.250, -0.200), 'crumb1': (0.085, -0.240, -0.190), 'crumb2': (-0.015, -0.245, -0.140)},
    0: {'crumb2': (-0.020, -0.255, -0.215)},
}

TREAT_YAW = {'S': 0.0, 'SE': 20.0, 'E': 36.0}   # biscuit turned so both knobs show


def eat(i, n, d):
    """Sitting (batch-1 sit base), crunching the biscuit: head dips on each bite, jaw opens
    and shuts, little side-to-side crunch, crumbs, fast happy tail."""
    a = TAU * i / n
    bite = i % 3                     # 0 open (lift), 1 chomp (dip), 2 chew (settle)
    pitch = {0: -2.0, 1: -16.0, 2: -9.0}[bite]
    roll = (7.0 if (i // 3) % 2 == 0 else -7.0) * (0 if bite == 0 else 1)
    p = {'body': (22 + 1.5 * math.sin(a * 2), 0, 0), 'body@': (0, 0.03, -0.075 + (0.004 if bite == 0 else 0.0)),
         'neck': (-12, 0, 0), 'head': (pitch, roll, 0),
         'tail': (0, 0, 32 * (1 if i % 2 else -1))}
    _legs(p, front=(-24, 2), back=(62, -110))
    p['ear_R'] = (-12 if bite == 1 else 2, 0, 0)
    p['ear_L'] = (-12 if bite == 1 else 2, 0, 0)
    face = 'chew_open' if bite == 0 else 'chew_shut'
    loc = {'crumb0': None, 'crumb1': None, 'crumb2': None}
    loc.update(_CRUMBS.get(i, {}))
    p['treat_j@'] = (0, 0, -0.012 if bite == 0 else 0.0)
    p['treat_j'] = (0, 0, TREAT_YAW.get(d, 0.0))
    return _face(p, face, {'treat'}, loc)


# --------------------------------------------------------------------------- roll (belly up)

# per-dir cheat: (root yaw, side, head yaw).  side +1 rolls the belly towards the dog's right
# (= the camera side in SE/E); S turns the dog to lie diagonally with its LEFT side to the camera.
ROLL_CHEAT = {'S': (-62.0, -1, 40.0), 'SE': (-10.0, 1, -40.0), 'E': (-4.0, 1, -55.0)}
ROLL_TILT = 30.0          # head tilt (deg) the same way as the belly roll


def roll(i, n, d):
    """On its back, belly up (tipped towards the camera), four paws paddling in the air,
    head turned to look at you with ^^ eyes and the tongue out, tail wagging."""
    a = TAU * i / n
    s, c = math.sin(a), math.cos(a)
    ry, side, hy = ROLL_CHEAT.get(d, (0.0, 1, -46.0))
    wig = 4 * math.sin(a + 0.6)
    p = {'root': (0, 0, ry),
         'body@': (0, 0.0, -0.082 + 0.005 * s), 'body': (2 * s, side * (160 + wig), 0),
         'neck': (4, -side * 150, 0), 'head': (10 + 4 * c, side * (ROLL_TILT + wig + 5 * s), hy),
         'tail': (-40, 0, 36 * (1 if i % 2 else -1))}
    w = 16.0
    _legs(p, sides={
        'FR': (30 + w * s, 84 + 12 * c), 'FL': (30 - w * s, 90 - 12 * c),
        'BR': (-22 - w * c, -54 + 10 * s), 'BL': (-22 + w * c, -60 - 10 * s)})
    p['ear_R'] = (-18 + 8 * s, 0, 0)
    p['ear_L'] = (-18 - 8 * s, 0, 0)
    return _face(p, 'pet_happy' if i != 4 else 'pet_content')


# --------------------------------------------------------------------------- beg (sit up)

def beg(i, n, d):
    """Sits up on the haunches (body near vertical, hind feet flat in front), front paws curled
    at the chest and paddling in turn, head tilting, tongue out, tail sweeping the snow."""
    a = TAU * i / n
    s, c = math.sin(a), math.cos(a)
    up = 0.008 * max(0.0, s)
    p = {'body': (58 + 2 * s, 0, 0), 'body@': (0, 0.05, -0.004 + up), 'neck': (-26, 0, 0),
         'head': (-24 + 3 * c, 10 * math.sin(a + 0.4), 4 * s),
         'tail': (30, 0, 34 * (1 if i % 2 else -1))}
    pad = 18.0
    ps, ns = max(0.0, s), max(0.0, -s)
    p['leg_FR'] = (58 + pad * ps, 30, 0)
    p['leg_FL'] = (58 + pad * ns, -30, 0)
    p['knee_FR'] = (112 - 30 * ps, 0, 0)
    p['knee_FL'] = (112 - 30 * ns, 0, 0)
    for leg, sx in (('BR', 1), ('BL', -1)):
        p['leg_' + leg] = (-10, 24 * sx, 0)
        p['knee_' + leg] = (-46, 0, 0)
    p['ear_R'] = (6 * s, 0, 0)
    p['ear_L'] = (-6 * s, 0, 0)
    f = 'pet_happy' if i % 3 != 2 else 'look'
    return _face(p, f)


# --------------------------------------------------------------------------- run_ball

def run_ball(i, n, d):
    p = va.pet_pose('pet_dog', 'run', i, n, d)
    hp = p.get('head', (0, 0, 0))
    p['head'] = (hp[0] + 6, hp[1], hp[2])
    return _face(p, 'ball' if i != 5 else 'ball_dot', {'ball'})


# --------------------------------------------------------------------------- catch

CATCH_FRAME = 3


def catch(i, n, d):
    """0 crouch (eyes on the ball) - 1 launch - 2 rising, mouth wide - 3 SNAP (ball caught at the
    top) - 4 falling, front paws reaching - 5 landed, holding the ball (holdable)."""
    k = min(i, 5)
    tbl = [
        # body@z, body pitch, neck, head, front (leg, knee), back (leg, knee), tail yaw, face, ball
        (-0.035, -10, 6, 22, (-18, 34), (26, -60), 26, 'look', False),
        (0.08, 34, -6, 22, (52, 66), (-46, -8), -18, 'gape', False),
        (0.20, 38, -4, 26, (66, 92), (-42, -20), 14, 'gape', False),
        (0.25, 26, 2, 22, (58, 98), (-30, -40), -24, 'ball', True),
        (0.11, -12, 4, 6, (20, 10), (-6, -60), 22, 'ball', True),
        (-0.012, -4, 0, 6, (-4, 6), (6, -14), -26, 'ball', True),
    ]
    z, bp, nk, hd, fr, bk, ty, f, ball = tbl[k]
    p = {'body@': (0, 0, z), 'body': (bp, 0, 0), 'neck': (nk, 0, 0), 'head': (hd, 0, 0),
         'tail': (10 if k in (1, 2) else 0, 0, ty)}
    _legs(p, front=fr, back=bk)
    ears = {0: 10, 1: -26, 2: -30, 3: -22, 4: 16, 5: 0}[k]
    p['ear_R'] = (ears, 0, 0)
    p['ear_L'] = (ears, 0, 0)
    return _face(p, f, {'ball'} if ball else ())


# --------------------------------------------------------------------------- trick (spin)

def trick(i, n, d):
    """0 play-bow crouch - 1..6 hop-spin a full turn (counter-clockwise from above) - 7 lands
    facing you again with one front paw raised (ta-da, holdable)."""
    spin = [0, 52, 112, 172, 232, 292, 338, 360][i]
    hop = [-0.02, 0.07, 0.13, 0.155, 0.13, 0.07, 0.02, 0.0][i]
    p = {'root': (0, 0, spin), 'body@': (0, 0, hop)}
    if i == 0:
        p.update({'body': (-16, 0, 0), 'neck': (10, 0, 0), 'head': (16, 0, 0), 'tail': (14, 0, 30)})
        _legs(p, front=(-38, 58), back=(16, -40))
        f = 'pet_happy'
    elif i == 7:
        p.update({'body': (8, 0, 0), 'neck': (-4, 0, 0), 'head': (10, 12, 0), 'tail': (10, 0, -30)})
        _legs(p, back=(4, -10), sides={'FL': (-6, 4)})
        p['leg_FR'] = (96, 22, 0)              # paw raised high and a little outward: ta-da!
        p['knee_FR'] = (70, 0, 0)
        f = 'pet_happy'
    else:
        lean = 10.0 * math.sin(math.pi * i / 7)
        tuck = 30.0 + 30.0 * math.sin(math.pi * i / 7)
        p.update({'body': (6, -lean, 0), 'neck': (-4, 0, 0), 'head': (4, -lean * 0.6, 14),
                  'tail': (-24, 0, -40)})
        _legs(p, front=(tuck * 0.8, tuck * 1.3), back=(-tuck * 0.6, -tuck * 1.1))
        f = 'pet_happy' if i not in (3, 4) else 'pet_content'
    ears = -20 if 1 <= i <= 6 else 0
    p['ear_R'] = (ears, 0, 0)
    p['ear_L'] = (ears, 0, 0)
    return _face(p, f)


FN = {'eat': eat, 'roll': roll, 'beg': beg, 'run_ball': run_ball, 'catch': catch, 'trick': trick}


def pose(anim, i, d='S'):
    n = ANIMS[anim]['frames']
    if anim in OLD:
        p = va.pet_pose('pet_dog', anim, i, n, d)
        return p
    return FN[anim](i, n, d)
