"""
vil2_anim.py - poses + per-frame expressions for the batch-2 residents
(CONTRACT_V3 section D).  Pure python (no bpy): importable anywhere for checks.

Builds on vil_anim (batch 1) WITHOUT changing it: the 12 core human anims and
run / dance / sit / wave come straight from vil_anim.HUMAN_FN; this module adds

    skate    8f / 10fps loop, 5 dirs   glide strokes, arms out (npc_skater)
    serve    6f / 10fps once, S/SE/E   hand a parcel / dish across a counter + nod,
                                       impactFrame 3 = hand-over moment (clerks, chef)
    bow      6f / 10fps once, S/SE/E   polite shop bow, hands clasped (clerks)
    salute   6f / 10fps once, S/SE/E   right hand to the helmet, spear kept upright (guard)
    fall     6f / 12fps once, S/SE/E   toddler plops onto its bottom and pouts

and per-character variants of the core anims (selected by flags in `ch`):

    ch['carry'] == 'back'   carry_walk = loaded back carrier: lean forward, both
                            hands gripping the shoulder straps (porters)
    ch['toddler']           run = waddle (side rock, arms flapping), walk rocks more
    ch['spear']             the LEFT hand always holds the spear upright (guard);
                            carry_walk slings it on the back instead
    ch['palette']           idle / talk hold a palette (left) + brush (right) (painter)

pose(anim, i, n, ch, d) -> pose dict for char_geo.Rig.apply() plus '_face'
(a FACES name) and '_props' (prop toggles), exactly like vil_anim.human_pose.
"""
import math

import vil_anim as va
from vil_anim import TAU, lean, look, arm, arms, body, legs_stand, legs_walk, face, BASE, add  # noqa: F401

LOCO_DIRS = va.LOCO_DIRS
SOCIAL_DIRS = va.SOCIAL_DIRS

# anim -> frames, fps, repeat, dirs (core ones are batch-1 objects, copied)
ANIMS = {k: dict(v) for k, v in va.ANIMS.items()}
ANIMS.update({
    'skate':  dict(frames=8, fps=10, repeat=-1, dirs=LOCO_DIRS),
    'serve':  dict(frames=6, fps=10, repeat=0, dirs=SOCIAL_DIRS, impactFrame=3),
    'bow':    dict(frames=6, fps=10, repeat=0, dirs=SOCIAL_DIRS),
    'salute': dict(frames=6, fps=10, repeat=0, dirs=SOCIAL_DIRS),
    'fall':   dict(frames=6, fps=12, repeat=0, dirs=SOCIAL_DIRS),
})
CORE = ['idle', 'walk', 'carry_walk', 'happy', 'talk', 'laugh', 'wave', 'surprised', 'angry', 'sad', 'hit',
        'shiver']
ORDER = ['idle', 'walk', 'run', 'carry_walk', 'skate', 'happy', 'talk', 'laugh', 'wave', 'surprised', 'angry',
         'sad', 'hit', 'shiver', 'serve', 'bow', 'salute', 'dance', 'sit', 'fall']
SOCIAL = set(va.SOCIAL) | {'serve', 'bow', 'salute', 'fall'}

# expression presets: batch-1 presets + a few new combinations of the SAME parts
FACES = dict(va.FACES)
FACES.update({
    'proud':       ['eye_dot', 'brow_angry', 'm_smile', 'cheek_blush'],   # determined little salute face
    'plop':        ['eye_chevron', 'brow_up', 'm_O', 'cheek_blush'],      # >< O  bump on the bottom
    'pout_teary':  ['eye_teary', 'brow_sad', 'm_pout', 'cheek_blush'],    # wobbly lip, wet eyes
    'polite':      ['eye_happy', 'brow_neutral', 'm_smile', 'cheek_blush'],  # bowing ^^ closed smile
})
EYES_SHOWN = va.EYES_SHOWN | {'plop', 'pout_teary'}

CLASP = {'ik_R': (-0.075, -0.215, -0.19, -0.4, 0.3, -1.0), 'ik_L': (0.075, -0.215, -0.19, 0.4, 0.3, -1.0)}
SPEAR_HOLD = (0.215, -0.105, -0.150, 1.0, 0.45, -0.5)     # left fist at the hip, forearm forward
PALETTE_L = (0.165, -0.205, -0.105, 1.0, 0.35, -0.8)      # palette held at the waist
BRUSH_R = (-0.150, -0.200, -0.060, -1.0, 0.35, -0.8)      # brush hand by the chest


# --------------------------------------------------------------------------- new anims

def h_serve(i, n, ch):
    """Hand a parcel / dish across a counter, then a small nod.  impactFrame 3."""
    keys = [
        ((-0.090, -0.215, -0.170), (0.090, -0.215, -0.170), -2, 6, 'smile', True),
        ((-0.095, -0.245, -0.070), (0.095, -0.245, -0.070), -4, 2, 'talk_open', True),
        ((-0.090, -0.300, -0.010), (0.090, -0.300, -0.010), -8, -2, 'smile', True),
        ((-0.080, -0.360, 0.005), (0.080, -0.360, 0.005), -12, 3, 'happy', True),       # hand-over
        ((-0.100, -0.300, -0.050), (0.100, -0.300, -0.050), -15, 13, 'happy', False),   # nod, hands free
        (CLASP['ik_R'][:3], CLASP['ik_L'][:3], -4, 3, 'smile', False),
    ]
    r, l, ln, lk, f, prop = keys[i % 6]
    p = {**legs_stand(3, 2), **lean(-ln), **look(lk),
         'ik_R': tuple(r) + (-0.5, 0.25, -1.0), 'ik_L': tuple(l) + (0.5, 0.25, -1.0)}
    if i % 6 == 3:
        p.update(body(0, -0.01, 0))
    props = {ch.get('serve_prop', 'bag')} if prop else set()
    p.update(face(f, props))
    return p


def h_bow(i, n, ch):
    """Polite shop bow from the hips, hands clasped in front."""
    k = i % 6
    depth = [0.0, 14.0, 32.0, 36.0, 15.0, 0.0][k]
    nod = [0.0, 4.0, 10.0, 12.0, 4.0, 0.0][k]
    p = {**legs_stand(2, 2), **lean(depth), **look(nod), **CLASP, **body(0, 0.018 * depth / 36.0, 0)}
    p.update(face(['smile', 'smile', 'polite', 'polite', 'happy', 'smile'][k]))
    return p


def h_salute(i, n, ch):
    """Snap to attention, right hand to the helmet brim, hold, lower."""
    k = i % 6
    att = {**legs_stand(1, 0), **lean(-3), **look(-4), **arm('R', 0, 7, 0, 8), **arm('L', 0, 7, 0, 8)}
    p = dict(att)
    if k == 1:
        p['ik_R'] = (-0.285, -0.140, 0.080, -1.0, 0.2, -0.3)
        p.update(look(-2))
    elif k in (2, 3, 4):
        lift = [0.0, 0.0, 0.035, 0.040, 0.038][k]
        p['ik_R'] = (-0.300, -0.095, 0.285 + 0.01 * (k == 3), -1.0, 0.35, 0.35)
        p['sh_R@'] = (0.0, -0.012, lift)
        p['hand_R'] = (-10, 0, 35)
        p.update({**look(-6, -5, 4), **lean(-5)})
        p['chest@'] = (0, 0, 0.006)
    elif k == 5:
        p['ik_R'] = (-0.255, -0.110, 0.020, -1.0, 0.2, -0.5)
    f = ['smile', 'smile', 'proud', 'proud', 'blink', 'smile'][k]
    p.update(face(f))
    return p


def h_skate(i, n, ch):
    """Ice-skating glide: alternating side pushes, arms out for balance."""
    a = TAU * i / n
    s, c = math.sin(a), math.cos(a)
    push = abs(s)
    pr = 'R' if s >= 0 else 'L'          # pushing leg
    gl = 'L' if pr == 'R' else 'R'       # gliding leg
    L = ch.get('leg_len', 0.34)
    p = {'hip_' + gl: (10, 3, 0), 'knee_' + gl: (24, 0, 0),
         'hip_' + pr: (-16 * push + 6 * (1 - push), 4 + 24 * push, 0), 'knee_' + pr: (6 + 4 * push, 0, 0)}
    drop = L * (1 - math.cos(math.radians(12))) * 1.6
    side = 1.0 if gl == 'L' else -1.0                  # + = character's left
    p['hips@'] = (0.030 * side * push, 0, -drop + 0.010 * math.cos(2 * a))
    p.update({**lean(13, 8 * side * push, 5 * side * push), **look(-7, -6 * side * push, 0),
              'root': (0, 0, 6 * side * push)})
    p.update(arm('R', 12 - 8 * s, 74 + 8 * c, 0, 14))
    p.update(arm('L', 12 + 8 * s, 74 - 8 * c, 0, 14))
    p['hand_R'] = (0, 0, -10)
    p['hand_L'] = (0, 0, -10)
    p.update(face('happy' if i % 4 == 2 else 'smile'))
    return p


def h_fall(i, n, ch):
    """Toddler plop: stumble, tip back, land on the bottom, bounce, pout."""
    L = ch.get('leg_len', 0.18)
    k = i % 6
    seat = -(L - 0.062)                     # hips drop so the bottom touches the snow
    if k == 0:
        p = {**lean(16), **look(-10), **arms(70, 30, 10), 'hip_R': (32, 4, 0), 'knee_R': (40, 0, 0),
             'hip_L': (-10, 4, 0), 'knee_L': (6, 0, 0), **body(0, -0.01, 0.006)}
        f = 'startle'
    elif k == 1:
        p = {**lean(-16), **look(-14), **arms(140, 40, 10), 'hip_R': (46, 8, 0), 'hip_L': (40, 8, 0),
             'knee_R': (20, 0, 0), 'knee_L': (16, 0, 0), **body(0, 0.03, -L * 0.30)}
        f = 'surprised'
    elif k == 2:
        p = {**lean(-8), **look(8), **arms(26, 58, 22), 'hip_R': (86, 14, 0), 'hip_L': (86, 14, 0),
             'knee_R': (6, 0, 0), 'knee_L': (6, 0, 0), **body(0, 0.05, seat - 0.008), 'chest@': (0, 0, -0.010)}
        f = 'plop'
    elif k == 3:
        p = {**lean(-11), **look(-4), **arms(46, 52, 20), 'hip_R': (80, 14, 0), 'hip_L': (80, 14, 0),
             'knee_R': (10, 0, 0), 'knee_L': (10, 0, 0), **body(0, 0.05, seat + 0.022)}
        f = 'surprised'
    else:
        tilt = 0.0 if k == 4 else 8.0
        p = {**lean(-3), **look(9, tilt), **arms(12, 32, 34), 'hip_R': (84, 12, 0), 'hip_L': (84, 12, 0),
             'knee_R': (8, 0, 0), 'knee_L': (14, 0, 0), **body(0, 0.05, seat)}
        f = 'pout_teary' if k == 4 else 'sad'
    p.update(face(f))
    return p


def h_waddle(i, n, ch):
    """Toddler run: tiny quick steps, big side rock, arms flapping out."""
    a = TAU * i / n
    s, c = math.sin(a), math.cos(a)
    p = legs_walk(a, 30.0, 52.0, ch.get('leg_len', 0.18), 0.0)
    p['hips@'] = (0, 0, 0.026 * abs(math.sin(2 * a + 0.6)) - 0.008)
    p['root'] = (0, 10.0 * c, 0)
    p.update({**lean(5, 0, 6 * s), 'hips': (0, 0, -8 * s), **look(-8, -5 * c, 0)})
    p.update(arm('R', 34 - 14 * s, 62 + 14 * c, 0, 26))
    p.update(arm('L', 34 + 14 * s, 62 - 14 * c, 0, 26))
    p.update(face('laugh' if i % 4 in (1, 2) else 'happy'))
    return p


def h_back_carry(i, n, ch):
    """Loaded back carrier (A-frame / pack frame): forward lean, hands on the straps."""
    a = TAU * i / n
    s, c = math.sin(a), math.cos(a)
    L = ch.get('leg_len', 0.34)
    p = legs_walk(a, 30.0, 50.0, L, 0.016)
    p.update({**lean(10, 0, 4 * s), 'hips': (0, 0, -4 * s), **look(-9, 0, -3 * s),
              'chest@': (0, 0, 0.003 * math.cos(2 * a))})
    p['ik_R'] = (-0.110, -0.205, 0.075 + 0.010 * s, -1.0, 0.3, -0.7)
    p['ik_L'] = (0.110, -0.205, 0.075 - 0.010 * s, 1.0, 0.3, -0.7)
    p.update(face('blink' if i == 5 else ch.get('carry_face', 'neutral')))
    return p


NEW_FN = {'skate': h_skate, 'serve': h_serve, 'bow': h_bow, 'salute': h_salute, 'fall': h_fall}


# --------------------------------------------------------------------------- per-character tweaks

def _spear_left(p, anim, i, n):
    """Guard: the left fist keeps the spear (overrides whatever the left arm did)."""
    for k in ('sh_L', 'el_L', 'hand_L'):
        p.pop(k, None)
    t = list(SPEAR_HOLD)
    if anim in ('walk', 'run'):
        s = math.sin(TAU * i / n)
        t[1] += 0.02 * s
    p['ik_L'] = tuple(t)
    return p


def _palette(p, anim, i, n):
    for k in ('sh_L', 'el_L', 'hand_L'):
        p.pop(k, None)
    p['ik_L'] = PALETTE_L
    if anim == 'idle':
        for k in ('sh_R', 'el_R', 'hand_R'):
            p.pop(k, None)
        s = math.sin(TAU * i / n)
        r = list(BRUSH_R)
        r[2] += 0.010 * s
        p['ik_R'] = tuple(r)
    props = set(p.get('_props', set())) | {'palette', 'brush'}
    p['_props'] = props
    return p


def human_pose(anim, i, n, ch, d='S'):
    """Like vil_anim.human_pose, plus the batch-2 anims and character variants."""
    if anim in NEW_FN:
        p = NEW_FN[anim](i, n, ch)
    elif anim == 'carry_walk' and ch.get('carry') == 'back':
        p = h_back_carry(i, n, ch)
    elif anim == 'run' and ch.get('toddler'):
        p = h_waddle(i, n, ch)
    else:
        p = va.HUMAN_FN[anim](i, n, ch)
        if anim == 'walk' and ch.get('toddler'):
            c = math.cos(TAU * i / n)
            p['root'] = (0, 7.0 * c, 0)
            sh_r, sh_l = p['sh_R'], p['sh_L']
            p['sh_R'] = (sh_r[0], 24.0, 0)
            p['sh_L'] = (sh_l[0], 24.0, 0)
    if ch.get('spear') and anim not in ('carry_walk',):
        p = _spear_left(p, anim, i, n)
    if ch.get('palette') and anim in ('idle', 'talk'):
        p = _palette(p, anim, i, n)
    extra = va.posture(ch, anim)
    if extra:
        p = add(p, extra)
    if anim in SOCIAL and anim not in va.NO_CHEAT and d in va.CHEAT:
        sp, hd = va.CHEAT[d]
        if anim == 'serve':                 # keep the hand-over pointing at the customer
            sp, hd = sp * 0.4, hd * 0.6
        p = add(p, {'spine': (0, 0, sp), 'head': (0, 0, hd)})
    return p
