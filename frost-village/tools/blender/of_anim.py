"""
of_anim.py - officefolk animation additions (CONTRACT_V42 AJ).  Pure python (no bpy).

Extends tf_anim / tf2_anim (imported, never edited) with fourteen office anims for the adult / elder bases:

    sit_idle     4 f  4 fps loop  S/SE/E   seated at a desk, mittens resting on the desk edge, breathing, a blink
    desk_type    6 f 10 fps loop  S/SE/E   hunt-and-peck typing, mittens hopping (typewriter = building overlay)
    desk_write   6 f  8 fps loop  S/SE/E   quill writing (0-2), wind-up flourish (3), STAMP (4 = impactFrame), lift (5)
    desk_phone   4 f  5 fps loop  S/SE/E   candlestick-phone receiver at the ear, free mitten gesturing
    desk_read    4 f  4 fps loop  S/SE/E   an opened letter held up in both mittens
    desk_count   6 f  8 fps loop  S/SE/E   counting coins off a stack in the left mitten onto the desk
    file         6 f  8 fps loop  NE/N     posting letters into the pigeonholes / cabinet (reaching up)
    point_board  6 f  8 fps loop  E/NE/N   tapping the chalkboard bars with a pointer stick
    stamp_stand  6 f  8 fps loop  S/SE/E   standing at a counter: ink, lift, wind-up, SLAM (3 = impactFrame), lift
    bow          6 f  8 fps once  S/SE/E   a polite bow (꾸벅) and back up
    note         4 f  5 fps loop  S/SE/E   taking notes in a little spiral notebook
    hand_over    6 f  9 fps once  SE/E/NE  offers something with both mittens (handPoint: the game flies the real item)
    scoop        6 f  9 fps loop  S/SE/E   dips an open coin sack to a cash pad and jingles it (sackPoint: coin target)
    carry_sack   8 f 12 fps loop  5 dirs   walk cycle with the coin sack slung over the right shoulder, bouncing

ACTING LIMBS (texture memory, the reason a 14-anim office wardrobe fits 15.5 MiB):
every anim except carry_sack is split into a TORSO pose (hips, spine, legs, chest - shared by many frames, even
across anims: 'seat_up', 'seat_work', 'stand', 'bow1' ...) and the ACTING limbs (both arms + mittens + the held
item, posed per body key).  Garments, shoes, scarves, bags and job details are rendered once per (torso key, dir)
WITHOUT limb holdouts; the arms, mittens, cuff sleeves and held items are rendered per body key and drawn on top
(timeline zfront in the front views S / SE / E).  The acting layers are rendered with a thin torso proxy shell and
the head as holdouts, so whatever is behind the body or the head is cut away exactly as if the garment were drawn
over it.  In the back views (NE / N: file, point_board, hand_over NE) the arms act behind the body and stay under
the garments (no zfront).  carry_sack is a normal per-frame walk render (its cover is the courier's wardrobe only).

Seated anims: sprite anchor = the seat point (seat FRONT-CENTRE at 0.45 m, the townfolk2 'sit' convention); the
desk top is 0.72 m (= 0.27 m above the seat), its near edge 0.10 m in front of the seat front.  Seated mittens and
items work at the desk in ROOT-local metres ('wik_R' / 'wik_L', solved by of_render after the body is posed), so
the desk stays put while the torso leans.

Head poses: only existing head frames (no new head art): soc / nod / tilt / up (S/SE/E), loco (every dir) and
townfolk2's 'down' (S/SE/E).  The back views of point_board / hand_over use 'loco' ('soc' has no NE / N frames).
When townfolk2 is not merged, the officefolk merge rewrites hp 'down' -> 'nod' (headPoseFallback); every face
used on a 'down' frame (neutral / blink / smile) exists on 'nod' too.
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
LOCO = ['S', 'SE', 'E', 'NE', 'N']
SOC = ['S', 'SE', 'E']
FRONT = {'S', 'SE', 'E'}

SEAT_H = ta2.SEAT_H              # 0.45 m
SEAT_BACK = ta2.SEAT_BACK        # hip joint 0.12 m behind the seat front
DESK_TOP = 0.72 - SEAT_H         # desk top above the seat (0.27 m)
DESK_EDGE = -0.10                # desk near edge, root-local y (forward = -y)
COUNTER_TOP = 0.56               # standing counter / stamp table height (m above the ground; chibi chest-low: the
                                 # bank counter is taller than a chibi waist, so the teller stamps high and the game
                                 # lifts the teller onto the counter step - manifest counter.places.bank.liftPx)
# held items drawn bigger than life so they read on a phone (chibi prop exaggeration, polish L1); the stamp's rubber
# face sits STAMP_DROP below the fist
ITEM_K = {'held_stamp': 1.4, 'held_receiver': 1.45}
STAMP_DROP = 0.112 * ITEM_K['held_stamp']

ANIMS4 = {
    'sit_idle':    dict(frames=4, fps=4, repeat=-1, dirs=SOC),
    'desk_type':   dict(frames=6, fps=10, repeat=-1, dirs=SOC),
    'desk_write':  dict(frames=6, fps=8, repeat=-1, dirs=SOC, impactFrame=4),
    'desk_phone':  dict(frames=4, fps=5, repeat=-1, dirs=SOC),
    'desk_read':   dict(frames=4, fps=4, repeat=-1, dirs=SOC),
    'desk_count':  dict(frames=6, fps=8, repeat=-1, dirs=SOC),
    'file':        dict(frames=6, fps=8, repeat=-1, dirs=['NE', 'N']),
    'point_board': dict(frames=6, fps=8, repeat=-1, dirs=['E', 'NE', 'N']),
    'stamp_stand': dict(frames=6, fps=8, repeat=-1, dirs=SOC, impactFrame=3),
    'bow':         dict(frames=6, fps=8, repeat=0, dirs=SOC),
    'note':        dict(frames=4, fps=5, repeat=-1, dirs=SOC),
    'hand_over':   dict(frames=6, fps=9, repeat=0, dirs=['SE', 'E', 'NE']),
    'scoop':       dict(frames=6, fps=9, repeat=-1, dirs=SOC),
    'carry_sack':  dict(frames=8, fps=12, repeat=-1, dirs=LOCO),
}
ORDER4 = ['sit_idle', 'desk_type', 'desk_write', 'desk_phone', 'desk_read', 'desk_count', 'file', 'point_board',
          'stamp_stand', 'bow', 'note', 'hand_over', 'scoop', 'carry_sack']
SEATED = {'sit_idle', 'desk_type', 'desk_write', 'desk_phone', 'desk_read', 'desk_count'}
WALKERS4 = {'carry_sack'}
PAGES4 = {'desk': ['sit_idle', 'desk_type', 'desk_write', 'desk_phone', 'desk_read', 'desk_count'],
          'work': ['file', 'point_board', 'stamp_stand'],
          'errand': ['bow', 'note', 'hand_over', 'scoop'],
          'sack': ['carry_sack']}
PAGE_OF4 = {a: g for g, lst in PAGES4.items() for a in lst}

# frame i -> body key (unique pose per dir); repeated keys share their images
KEYS4 = {
    'sit_idle':    [0, 0, 1, 1],
    'desk_type':   [0, 1, 0, 1, 2, 1],
    'desk_write':  [0, 1, 0, 2, 3, 4],          # pen, pen, pen, pen flourish (wind-up), STAMP, stamp lifted
    'desk_phone':  [0, 0, 1, 1],
    'desk_read':   [0, 0, 1, 1],
    'desk_count':  [0, 1, 2, 0, 1, 2],
    'file':        [0, 1, 2, 2, 1, 0],
    'point_board': [0, 1, 2, 1, 0, 1],
    'stamp_stand': [0, 1, 2, 3, 4, 0],
    'bow':         [0, 1, 2, 2, 1, 0],         # stand, bend, deep, deep, bend, stand (eased: 6-7 px head steps)
    'note':        [0, 1, 2, 1],
    'hand_over':   [0, 1, 2, 2, 1, 0],
    'scoop':       [0, 1, 2, 2, 1, 3],         # stand, bend, dip at the pad (held 2 frames), bend, jingle
    'carry_sack':  list(range(8)),
}

# torso key per (anim, body key): the shared torso pose (garments / legs / shoes / accessories are rendered once
# per torso key and dir).  carry_sack has none (per-frame walk render).
TORSO4 = {
    'sit_idle':    ['seat_up', 'seat_up_b'],
    'desk_type':   ['seat_work', 'seat_work', 'seat_dip'],
    'desk_write':  ['seat_work', 'seat_work', 'seat_up', 'seat_dip', 'seat_work'],
    'desk_phone':  ['seat_up', 'seat_up'],
    'desk_read':   ['seat_up', 'seat_up_b'],
    'desk_count':  ['seat_work', 'seat_work', 'seat_dip'],
    'file':        ['stand', 'stand', 'reach'],
    'point_board': ['stand', 'stand', 'stand'],
    'stamp_stand': ['stand_lean', 'stand_lean', 'stand', 'stand_dip', 'stand_lean'],
    'bow':         ['stand', 'bend', 'deep'],     # bow and scoop share 'bend' + 'deep' (the old bow2 / scoop2 pair
    'note':        ['stand_lean', 'stand_lean', 'stand_lean'],          # became one deep pose, so the in-between
    'hand_over':   ['stand', 'stand', 'stand_lean'],                     # pose fits the errand page budget)
    'scoop':       ['stand', 'bend', 'deep', 'stand'],
}

HP4 = {
    'sit_idle':    ['soc'] * 4,
    'desk_type':   ['down'] * 6,
    'desk_write':  ['down'] * 6,
    'desk_phone':  ['soc'] * 4,
    'desk_read':   ['down'] * 4,
    'desk_count':  ['down'] * 6,
    'file':        ['loco'] * 6,
    'point_board': ['soc'] * 6,             # NE / N -> loco (hp_for)
    'stamp_stand': ['down'] * 6,
    'bow':         ['down'] * 6,
    'note':        ['down'] * 4,
    'hand_over':   ['soc'] * 6,             # NE -> loco
    'scoop':       ['down'] * 6,
    'carry_sack':  ['loco'] * 8,
}
FACE4 = {
    'sit_idle':    ['smile', 'neutral', 'blink', 'neutral'],
    'desk_type':   ['neutral', 'neutral', 'neutral', 'blink', 'smile', 'neutral'],
    'desk_write':  ['neutral', 'neutral', 'blink', 'neutral', 'smile', 'smile'],
    'desk_phone':  ['talk_open', 'talk_mid', 'smile', 'talk_open'],
    'desk_read':   ['neutral', 'neutral', 'blink', 'smile'],
    'desk_count':  ['neutral', 'neutral', 'smile', 'neutral', 'blink', 'smile'],
    'file':        ['neutral', 'neutral', 'neutral', 'blink', 'neutral', 'neutral'],
    'point_board': ['talk_open', 'smile', 'talk_mid', 'smile', 'talk_open', 'happy'],
    'stamp_stand': ['neutral', 'neutral', 'neutral', 'blink', 'smile', 'neutral'],
    'bow':         ['smile', 'smile', 'blink', 'blink', 'smile', 'smile'],
    'note':        ['neutral', 'smile', 'neutral', 'blink'],
    'hand_over':   ['smile', 'talk_open', 'happy', 'happy', 'smile', 'smile'],
    'scoop':       ['smile', 'smile', 'neutral', 'smile', 'blink', 'smile'],
    'carry_sack':  ['neutral', 'neutral', 'neutral', 'neutral', 'neutral', 'blink', 'neutral', 'neutral'],
}
DOWN_SAFE = {'neutral', 'blink', 'smile'}       # faces that exist on 'down' (townfolk2) AND 'nod' (fallback)
LOCO_SAFE = {'neutral', 'blink'}
ALL_LIMBS = ('arm_R', 'hand_R', 'arm_L', 'hand_L')
ARM_R = ('arm_R', 'hand_R')


def hp_for(anim, d, i):
    hp = HP4[anim][i]
    if hp in ('soc', 'nod', 'tilt', 'up', 'down') and d not in FRONT:
        return 'loco'                      # these head poses have no NE / N frames
    return hp


def face_for(anim, d, i):
    hp = hp_for(anim, d, i)
    f = FACE4[anim][i]
    if hp == 'loco' and f not in LOCO_SAFE:
        return 'blink' if f == 'blink' else 'neutral'
    if hp == 'down' and f not in DOWN_SAFE:
        return 'smile'
    return f


def expr_brow(face):
    return ta2.EXPR_BROW2.get(face) or ta.EXPR_BROW.get(face, 'neutral')


def zfront4(anim, key, d):
    """Limbs drawn above the head stack.  Acting anims: every limb in the front views (they act in front of the
    body; the acting renders cut whatever the body / head hides), none in the back views.  carry_sack: the right
    arm holding the sack neck at the shoulder, in the front views."""
    if anim == 'carry_sack':
        return ARM_R if d in FRONT else ()
    return ALL_LIMBS if d in FRONT else ()


def acting(anim):
    return anim != 'carry_sack'


# --------------------------------------------------------------------------- helpers
lean, arm, arms, body = va.lean, va.arm, va.arms, va.body
legs_stand, legs_walk, squat = va.legs_stand, va.legs_walk, va.squat


def _age(ch):
    return ch.get('age', 'adult')


def seat_legs(ch):
    """Seated legs (one shared pose for every desk anim): thighs forward on the 0.45 m seat, shins hanging (chibi
    legs do not reach the floor - the desk hides them in the game, but they are drawn whole)."""
    hz = ch.get('hip_z', 0.338)
    return {'hips@': (0, SEAT_BACK, 0.065 - hz), 'hip_R': (84, 5, 0), 'hip_L': (84, 5, 0),
            'knee_R': (74, 0, 0), 'knee_L': (70, 0, 0)}


def torso_pose(tk, ch, d):
    """Rig.apply dict of torso key `tk` (hips / spine / legs / chest; no arms)."""
    if tk.startswith('seat'):
        p = seat_legs(ch)
        f, dz = {'seat_up': (4.0, 0.0), 'seat_up_b': (2.5, 0.006), 'seat_work': (11.0, 0.0),
                 'seat_dip': (15.0, -0.006)}[tk]
        p.update({**lean(f), 'chest@': (0, 0, dz)})
        h = ch.get('hunch', 0.0) * 0.5
        if h:
            p = va.add(p, {**lean(h), 'neck': (h * 1.15, 0, 0)})
    else:
        L = ch.get('leg_len', 0.34)
        if tk == 'stand':
            p = {**legs_stand(4, 2), 'hips@': (0, 0, -0.003)}
        elif tk == 'stand_lean':
            p = {**legs_stand(4, 2), 'hips@': (0, 0, -0.003), **lean(7)}
        elif tk == 'stand_dip':
            p = {**legs_stand(5, 5), 'hips@': (0, 0, -0.008), **lean(11), 'chest@': (0, 0, -0.006)}
        elif tk == 'reach':                       # up on the toes at the pigeonholes
            p = {**legs_stand(3, 0), 'hips@': (0, 0, 0.018), **lean(-3)}
        elif tk == 'bow1':
            p = {**legs_stand(4, 3), 'hips@': (0, 0.012, -0.004), **lean(22)}
        elif tk == 'bow2':
            p = {**legs_stand(4, 5), 'hips@': (0, 0.030, -0.008), **lean(40)}
        elif tk == 'bend':                        # the in-between of bow and scoop
            p = {**legs_stand(4, 4), 'hips@': (0, 0.012, -0.005), **lean(19)}
        elif tk == 'deep':                        # bottom of the bow = the scoop dip: knees give a little, hips back
            p = va.add(squat(12, L), {'hips@': (0, 0.024, 0.0)}, lean(36))
        elif tk == 'scoop1':
            p = {**squat(16, L), **lean(16)}
        elif tk == 'scoop2':
            p = {**squat(30, L), **lean(30)}
        else:
            raise KeyError(tk)
        extra = ta.posture(ch, 'idle')
        if extra:
            p = va.add(p, extra)
    if d in ta.CHEAT_SPINE:
        p = va.add(p, {'spine': (0, 0, ta.CHEAT_SPINE[d])})
    return p


def torso_keys(anims=None):
    """[(torso key, dir)] needed by the acting anims, in a stable order."""
    out = []
    for a in ORDER4:
        if (anims and a not in anims) or a not in TORSO4:
            continue
        for d in ANIMS4[a]['dirs']:
            for tk in TORSO4[a]:
                if (tk, d) not in out:
                    out.append((tk, d))
    return out


def torso_of(anim, key):
    return TORSO4[anim][key]


# --------------------------------------------------------------------------- acting poses
# Root-local mitten targets for the seated anims: (x, y, z) metres from the seat point (x < 0 = the character's
# right, y < 0 = forward toward the desk, z up from the seat surface) + an elbow pole in the same frame.
POLE_R = (-0.75, 0.45, -0.45)
POLE_L = (0.75, 0.45, -0.45)


def wik(side, x, y, z, pole=None):
    pole = pole or (POLE_R if side == 'R' else POLE_L)
    return {'wik_' + side: (x, y, z) + tuple(pole)}


ON = DESK_TOP + 0.045            # mitten centre resting on the desk top


def a_sit_idle(k, ch, d):
    # mittens folded on the desk edge; the right one taps on key 1
    p = {**wik('R', -0.075, -0.125, ON + 0.01), **wik('L', 0.075, -0.125, ON + 0.01)}
    if k == 1:
        p.update(wik('R', -0.085, -0.135, ON + 0.045))
    p.update({'hand_R': (0, 0, 35), 'hand_L': (0, 0, -35)})
    return p


def a_desk_type(k, ch, d):
    hi, lo = ON + 0.09, ON + 0.035
    if k == 0:
        p = {**wik('R', -0.075, -0.16, lo), **wik('L', 0.085, -0.14, hi)}
    elif k == 1:
        p = {**wik('R', -0.085, -0.14, hi), **wik('L', 0.075, -0.16, lo)}
    else:                                       # 'ding': the left mitten swipes the carriage lever
        p = {**wik('R', -0.070, -0.16, lo + 0.01), **wik('L', 0.185, -0.11, ON + 0.09)}
    p.update({'hand_R': (-25, 0, 20), 'hand_L': (-25, 0, -20)})
    return p


def a_desk_write(k, ch, d):
    p = dict(wik('L', 0.095, -0.14, ON))                    # left mitten holds the paper flat
    p['hand_L'] = (0, 0, -40)
    sd = STAMP_DROP - 0.112                                 # the bigger stamp: fist higher by its extra length
    R = {0: (-0.050, -0.15, ON + 0.025), 1: (-0.100, -0.14, ON + 0.035), 2: (-0.165, -0.09, ON + 0.13),
         3: (-0.050, -0.15, ON + 0.07 + sd), 4: (-0.130, -0.10, ON + (0.10 if _age(ch) == 'elder' else 0.14) + sd)}[k]
    p.update(wik('R', *R))
    p['hand_R'] = {0: (-20, 0, 25), 1: (-15, 0, 35), 2: (20, 0, 20), 3: (-10, 0, 10), 4: (10, 0, 10)}[k]
    p['_pen'] = k in (0, 1, 2)
    p['_stamp'] = k in (3, 4)
    return p


def a_desk_phone(k, ch, d):
    # receiver pressed to the side of the (big) head: the fist stays OUTSIDE the head silhouette
    p = {'ik_R': (-0.300, -0.085, 0.255, -1.0, 0.0, -1.0), 'hand_R': (-15, 0, 70)}
    if k == 0:
        p.update(wik('L', 0.08, -0.135, ON + 0.005))
        p['hand_L'] = (0, 0, -35)
    else:                                                   # explaining gesture with the free mitten
        p.update(wik('L', 0.19, -0.11, ON + 0.11, (0.8, 0.3, -0.5)))
        p['hand_L'] = (-15, 0, -20)
    p['_receiver'] = True
    return p


def a_desk_read(k, ch, d):
    zr, zl = (ON + 0.06, ON + 0.06) if k == 0 else (ON + 0.045, ON + 0.075)
    p = {**wik('R', -0.11, -0.15, zr), **wik('L', 0.11, -0.15, zl), 'hand_R': (-30, 0, 60), 'hand_L': (-30, 0, -60)}
    p['_letter'] = 'read'
    return p


def a_desk_count(k, ch, d):
    p = dict(wik('L', 0.105, -0.13, ON + 0.05))             # the coin stack, raised a little in the left mitten
    p['hand_L'] = (-30, 0, -30)
    R = {0: (0.045, -0.15, ON + 0.11), 1: (-0.075, -0.16, ON + 0.12), 2: (-0.12, -0.15, ON + 0.03)}[k]
    p.update(wik('R', *R))
    p['hand_R'] = (-20, 0, 30)
    p['_coins'] = True
    p['_coin'] = k in (0, 1)
    return p


def a_file(k, ch, d):
    # standing at the pigeonholes (root-local, ground = 0): the right mitten posts a letter, the left holds the rest
    p = dict(wik('L', 0.07, -0.17, 0.62, (0.8, 0.3, -0.5)))
    p['hand_L'] = (-30, 0, -40)
    R = {0: (-0.02, -0.20, 0.64), 1: (-0.22, -0.22, 0.86), 2: (-0.30, -0.26, 0.98)}[k]
    p.update(wik('R', *R, (-0.8, 0.2, -0.5)))
    p['hand_R'] = (-40 + 30 * k, 0, 20)
    p['_letter'] = 'post'
    return p


POINT_NE = {'R': {0: (-0.10, -0.20, 0.84), 1: (-0.08, -0.26, 0.90), 2: (-0.08, -0.25, 0.78)},
            'pitch': {0: 58.0, 1: 52.0, 2: 40.0}, 'inward': 0.95}


def a_point_board(k, ch, d):
    p = dict(va.HOLD_STYLES['hips'])                          # left fist on the hip
    p.pop('ik_R', None)
    if d == 'NE':
        # the office board (boardPoint / boardDir NE) hangs up and to the LEFT of a NE-facing clerk: the stick aims
        # steeply up and well inward, so the tip taps the slate (of_check: tip inside office boardRect)
        R = POINT_NE['R'][k]
        p['_pointer'] = POINT_NE['pitch'][k]
        p['_pointer_in'] = POINT_NE['inward']
    else:
        R = {0: (-0.13, -0.22, 0.80), 1: (-0.11, -0.29, 0.85), 2: (-0.11, -0.27, 0.71)}[k]
        p['_pointer'] = {0: 34.0, 1: 28.0, 2: 14.0}[k]       # pointer pitch above horizontal (deg)
    p.update(wik('R', *R, (-0.9, 0.2, -0.4)))
    p['hand_R'] = (-60, 0, 0)
    return p


def a_stamp_stand(k, ch, d):
    ct = COUNTER_TOP - (0.11 if _age(ch) == 'elder' else 0.0)   # elders are shorter: below the big head
    p = dict(wik('L', 0.090, -0.19, ct + 0.045))              # the left mitten holds the paper on the counter
    p['hand_L'] = (0, 0, -40)
    sd = STAMP_DROP - 0.112                                 # the bigger stamp: fist higher by its extra length
    R = {0: (-0.16, -0.17, ct + 0.075 + sd), 1: (-0.14, -0.16, ct + 0.15 + sd),
         2: (-0.17, -0.12, ct + 0.21 + sd), 3: (-0.05, -0.19, ct + 0.085 + sd),
         4: (-0.09, -0.17, ct + 0.15 + sd)}[k]
    p.update(wik('R', *R))
    p['hand_R'] = {0: (-10, 0, 10), 1: (0, 0, 10), 2: (20, 0, 10), 3: (-10, 0, 10), 4: (0, 0, 10)}[k]
    p['_stamp'] = True
    return p


def a_bow(k, ch, d):
    # mittens folded in front (chest-local: they follow the bow)
    return {'ik_R': (-0.055, -0.215, -0.205, -0.4, 0.3, -1.0), 'ik_L': (0.055, -0.215, -0.205, 0.4, 0.3, -1.0),
            'hand_R': (0, 0, 20), 'hand_L': (0, 0, -20)}


def a_note(k, ch, d):
    # notebook in the left mitten at chest height, pencil in the right writing across it
    p = {'ik_L': (0.065, -0.235, -0.135, 1.0, 0.3, -0.6), 'hand_L': (-40, 0, -50)}
    x = {0: -0.030, 1: 0.000, 2: 0.030}[k]
    p['ik_R'] = (x, -0.255, -0.105 + 0.012 * (k == 1), -1.0, 0.3, -0.6)
    p['hand_R'] = (-30, 0, 30)
    p['_note'] = True
    return p


def a_hand_over(k, ch, d):
    # both mittens together at the chest (holding the thing), then reaching it out (handPoint = between the palms)
    t = {0: (0.050, -0.215, -0.15), 1: (0.060, -0.30, -0.13), 2: (0.070, -0.38, -0.10)}[k]
    return {'ik_R': (-t[0], t[1], t[2], -1.0, 0.3, -0.6), 'ik_L': (t[0], t[1], t[2], 1.0, 0.3, -0.6),
            'hand_R': (-40, 0, 55), 'hand_L': (-40, 0, -55), '_offer': True}


def a_scoop(k, ch, d):
    # the open sack held by its rim in both mittens: waist (0), lower (1), down at the pad (2), jingled up (3)
    t = {0: (0.095, -0.235, -0.215), 1: (0.095, -0.255, -0.27), 2: (0.10, -0.27, -0.32), 3: (0.10, -0.225, -0.13)}[k]
    p = {'ik_R': (-t[0], t[1], t[2], -1.0, 0.3, -0.6), 'ik_L': (t[0], t[1], t[2], 1.0, 0.3, -0.6),
         'hand_R': (0, 0, 60), 'hand_L': (0, 0, -60)}
    p['_sack_open'] = k
    return p


ACT4 = {'sit_idle': a_sit_idle, 'desk_type': a_desk_type, 'desk_write': a_desk_write, 'desk_phone': a_desk_phone,
        'desk_read': a_desk_read, 'desk_count': a_desk_count, 'file': a_file, 'point_board': a_point_board,
        'stamp_stand': a_stamp_stand, 'bow': a_bow, 'note': a_note, 'hand_over': a_hand_over, 'scoop': a_scoop}


# --------------------------------------------------------------------------- carry_sack (walk + sack on the shoulder)
SACK_BOUNCE = [0.0, -0.6, -1.0, -0.4, 0.3, -0.5, -0.9, -0.2]       # sack drop per frame (lags the step), x 0.02 m
# where the sack body hangs (chest-local x, y, z of its centre; x < 0 = the character's right, y > 0 = behind) and
# its yaw (deg): outboard of the right shoulder so the front views show the burlap belly and its coin emblem
SACK_HANG = (-0.285, 0.205, 0.035, -30.0)
# per-dir cheat (like CHEAT_SPINE): walking toward the camera (S) the sack swings further out and lower, turned to
# show its emblem, and the fist sits ON the shoulder (beside the face it read as a wave)
SACK_HANG_DIR = {'S': (-0.37, 0.12, -0.02, 40.0)}
SACK_FIST = {'S': (-0.19, -0.07, 0.11)}


def carry_legs(i, ch):
    a = TAU * i / 8
    age = _age(ch)
    amp, kn, bob = (22.0, 34.0, 0.012) if age == 'elder' else (30.0, 50.0, 0.020)
    return legs_walk(a, amp, kn, ch.get('leg_len', 0.34), bob)


def p_carry_sack(i, ch, d):
    a = TAU * i / 8
    s = math.sin(a)
    p = carry_legs(i, ch)
    p.update({**lean(7, 0, 6 * s), 'hips': (0, 0, -5 * s), 'chest@': (0, 0, 0.004 * math.cos(2 * a))})
    # right fist above the right shoulder front, gripping the sack neck; the sack hangs down the back
    fx, fy, fz = SACK_FIST.get(d, (-0.165, -0.085, 0.135))
    p['ik_R'] = (fx, fy, fz + 0.006 * math.cos(2 * a), -1.0, -0.2, -0.6)
    p['hand_R'] = (-60, 0, 50)
    sw = 30.0
    out = 10 + ch.get('arm_out', 0)
    p['sh_L'] = (sw * s + 4, out, 0)                         # the free arm swings with the right leg
    p['el_L'] = (18 + 14 * max(0, s), 0, 0)
    p['_sack'] = i
    return p


# --------------------------------------------------------------------------- full body pose

def body_pose4(anim, key, ch, d):
    """Rig.apply dict (+ '_' item flags and 'wik_' root-local IK) of body key `key`."""
    if anim == 'carry_sack':
        p = p_carry_sack(key, ch, d)
        flags = {k: v for k, v in p.items() if k.startswith('_')}
        body_p = {k: v for k, v in p.items() if not k.startswith('_')}
        extra = ta.posture(ch, 'walk')
        if extra:
            body_p = va.add(body_p, extra)
        body_p.update(flags)
        return body_p
    p = torso_pose(TORSO4[anim][key], ch, d)
    act = ACT4[anim](key, ch, d)
    p.update(act)
    return p


def pose4(anim, i, ch, d):
    k = KEYS4[anim][i]
    p = body_pose4(anim, k, ch, d)
    face = face_for(anim, d, i)
    p.update({'_hp': hp_for(anim, d, i), '_face': face, '_brow': expr_brow(face),
              '_zfront': set(zfront4(anim, k, d)), '_key': k})
    return p


def frames4(anims=None):
    return [(a, d, i) for a in ORDER4 if anims is None or a in anims
            for d in ANIMS4[a]['dirs'] for i in range(ANIMS4[a]['frames'])]


def keys_of(anim):
    out = []
    for k in KEYS4[anim]:
        if k not in out:
            out.append(k)
    return out


def timeline4():
    out = {}
    for a, d, i in frames4():
        k = KEYS4[a][i]
        face = face_for(a, d, i)
        out[(a, d, i)] = dict(hp=hp_for(a, d, i), face=face, brow=expr_brow(face),
                              zfront=sorted(zfront4(a, k, d)))
    return out


# anim items (added for their anim by the compositor; they have frames only there)
ANIM_ITEMS = {'desk_write': ['held_pen', 'held_stamp'], 'desk_phone': ['held_receiver'], 'desk_read': ['held_letter'],
              'desk_count': ['held_coins'], 'file': ['held_letter'], 'point_board': ['held_pointer'],
              'stamp_stand': ['held_stamp'], 'note': ['held_notebook'], 'scoop': ['held_sack_open'],
              'carry_sack': ['held_sack_shoulder']}


def all_anims():
    out = {a: ta.ANIMS[a] for a in ta.ORDER}
    out.update({a: ta2.ANIMS2[a] for a in ta2.ORDER2})
    out.update(ANIMS4)
    return out
