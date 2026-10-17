"""
gbf_anim.py - geumbangfolk animation additions (CONTRACT_GEUMBANG AP).  Pure python (no bpy).

Extends tf_anim / tf2_anim (imported, never edited) with six 금방 crew anims for the adult bases:

    carry_parcel   8 f 12 fps loop  S/SE/E/NE/N  brisk walk hugging a 금방 parcel at the belly (held_parcel_gb,
                                                 boxPoint [cx, cy, bx, by], groundSpeed)            page road
    ring_doorbell  6 f  8 fps once  NE/N/E       E: the parcel tucked under the LEFT arm, the right mitten presses;
                                                 NE / N (the door faces the camera): the parcel under the RIGHT arm on
                                                 the camera side, the left mitten presses the bell (impactFrame 2 =
                                                 띵, 3 = 동), back down; holds the
                                                 last frame (waiting at the door).  boxPoint, bellPoint   page road
    hand_parcel    6 f  9 fps once  NE/E/SE      offers the parcel with both mittens (no item: the game flies the
                                                 real gb_parcel from handPoint), f5 = a little bow (꾸벅)  page road
    scan           4 f  6 fps loop  S/SE/E       handheld scanner aimed at a parcel on the counter; impactFrame 2 =
                                                 삑, f3 a glance at the scanner screen.  beamPoint            page hub
    sort_parcel    6 f  8 fps loop  SE/E/NE      reaches to the rack shelf, takes a small parcel, hugs it, turns and
                                                 drops it into the tote at the right side.  handPoint      page hub
    tape_box       6 f 10 fps loop  S/SE/E       left mitten holds the flaps, the tape gun runs across the box top;
                                                 impactFrame 3 = 찌익 + the cutting flick.  (tapePoint)     page hub

ACTING LIMBS (officefolk technique, texture memory): every anim is split into a TORSO pose (hips, spine, legs, chest -
shared by many frames and anims: 'stand', 'stand_lean', 'bend' ...) and the ACTING limbs (both arms + mittens + cuffs +
the held item, posed per body key).  Garments / legs / shoes / scarves / the vest are rendered
once per (torso key, dir) WITHOUT limb holdouts; arms, mittens, cuffs and items are rendered per body key and drawn on
top in the front views (timeline zfront = all four limbs in S / SE / E, none in NE / N), cut by a torso proxy shell
and the head wherever those hide them.  carry_parcel (texture memory, the road page budget): a careful parcel walk whose
upper body takes three keys ('cw_hi_L' / 'cw_lo' / 'cw_hi_R': high + a side sway over the stance foot, low at the step;
polish M1), so the garments, arms and parcel are rendered three times per dir and shared by the 8 frames; only the
trousers and boots are rendered per frame (the LOWER pass, at the walk's own hip height so the planted foot stays put).

Work heights (root-local metres, ground = 0): the counter the clerk scans on (COUNTER_TOP 0.56 m, a parcel on it), the
packing table box top (BOX_TOP 0.58 m), the rack shelf (SHELF 0.84 m), the doorbell (about 0.82 m).  The logistics
centre's counter / table are taller than a chibi waist: the manifest 'hub' block lifts the packers / clerk like
officefolk's bank tellers (gbf_pack measures interior_front at the staffPoints).

Head poses: existing head frames only (no new head art): soc / nod (S/SE/E), loco (every dir) and townfolk2's 'down'
(S/SE/E).  Back views (NE / N) use 'loco'.  Without townfolk2 the merge rewrites 'down' -> 'nod' (headPoseFallback);
faces on 'down' frames are neutral / blink / smile only (they exist on 'nod' too).
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

# (look-dev) the chibi head covers everything above ~0.74 m in the front views, so the hands work at belly / chest
# height and the game lifts the sprite to the real counter / table (manifest 'hub' block, like officefolk's tellers)
COUNTER_TOP = 0.30            # the counter top the clerk scans on (m above the feet, chibi scale)
PARCEL_ON_COUNTER = 0.20      # height of the parcel lying there (gb_parcel_m: critique L8, 0.14 m was a speck at zoom 0.6)
BOX_TOP = 0.42                # packing table + the box being taped
SHELF = {'NE': 0.86, 'SE': 0.62, 'E': 0.64}    # the rack shelf: reaching up from behind, chest high from the front
TOTE = 0.34                   # the tote / cart rim at the picker's right side

ANIMS5 = {
    'carry_parcel':  dict(frames=8, fps=12, repeat=-1, dirs=LOCO),
    'ring_doorbell': dict(frames=6, fps=8, repeat=0, dirs=['NE', 'N', 'E'], impactFrame=2),
    'hand_parcel':   dict(frames=6, fps=9, repeat=0, dirs=['NE', 'E', 'SE'], bowFrame=5),
    'scan':          dict(frames=4, fps=6, repeat=-1, dirs=SOC, impactFrame=2),
    'sort_parcel':   dict(frames=6, fps=8, repeat=-1, dirs=['SE', 'E', 'NE']),
    'tape_box':      dict(frames=6, fps=10, repeat=-1, dirs=SOC, impactFrame=3),
}
ORDER5 = ['carry_parcel', 'ring_doorbell', 'hand_parcel', 'scan', 'sort_parcel', 'tape_box']
WALKERS5 = {'carry_parcel'}
PAGES5 = {'road': ['carry_parcel', 'ring_doorbell', 'hand_parcel'],
          'hub': ['scan', 'sort_parcel', 'tape_box']}
PAGE_OF5 = {a: g for g, lst in PAGES5.items() for a in lst}

# frame i -> body key (unique pose per dir); repeated keys share their images
KEYS5 = {
    'carry_parcel':  [0, 0, 1, 1, 2, 2, 1, 1],    # upper body: hi + sway left, lo, hi + sway right, lo (legs per frame)
    'ring_doorbell': [0, 1, 2, 2, 1, 0],        # stand, reach, PRESS held 2 frames (띵 - 동), retract, stand (held)
    'hand_parcel':   [0, 1, 2, 2, 1, 3],        # hold, offer, out (taken), out (empty), back, bow (held)
    'scan':          [0, 1, 2, 3],              # aim, aim, BEEP, glance at the screen
    'sort_parcel':   [0, 1, 2, 3, 4, 5],        # reach, grab, hug, turn, drop in the tote, rise
    'tape_box':      [0, 1, 2, 3, 4, 5],        # gun up, press down, pull, end + cut flick, lift, return
}
# torso key per (anim, body key)
TORSO5 = {
    'carry_parcel':  ['cw_hi_L', 'cw_lo', 'cw_hi_R'],
    'ring_doorbell': ['stand', 'stand', 'press'],
    'hand_parcel':   ['stand', 'stand_lean', 'stand_lean', 'bend'],
    'scan':          ['stand_lean', 'stand_lean', 'stand_dip', 'stand'],
    'sort_parcel':   ['reach', 'reach', 'stand', 'turn', 'stoop', 'stand'],
    'tape_box':      ['stand_lean', 'stand_lean', 'stand_lean', 'stand_dip', 'stand_lean', 'stand_lean'],
}

HP5 = {
    'carry_parcel':  ['loco'] * 8,
    'ring_doorbell': ['soc'] * 6,                # NE / N -> loco
    'hand_parcel':   ['soc'] * 5 + ['nod'],      # NE -> loco
    'scan':          ['down', 'down', 'down', 'soc'],
    'sort_parcel':   ['down'] * 6,               # NE -> loco
    'tape_box':      ['down'] * 6,
}
FACE5 = {
    'carry_parcel':  ['neutral', 'neutral', 'neutral', 'neutral', 'neutral', 'blink', 'neutral', 'neutral'],
    'ring_doorbell': ['smile', 'smile', 'happy', 'talk_open', 'smile', 'smile'],
    'hand_parcel':   ['smile', 'talk_open', 'happy', 'happy', 'smile', 'blink'],
    'scan':          ['neutral', 'neutral', 'smile', 'smile'],
    'sort_parcel':   ['neutral', 'neutral', 'smile', 'neutral', 'blink', 'neutral'],
    'tape_box':      ['neutral', 'neutral', 'neutral', 'smile', 'blink', 'neutral'],
}
DOWN_SAFE = {'neutral', 'blink', 'smile'}       # faces that exist on 'down' (townfolk2) AND 'nod' (fallback)
LOCO_SAFE = {'neutral', 'blink'}
ALL_LIMBS = ('arm_R', 'hand_R', 'arm_L', 'hand_L')


def hp_for(anim, d, i):
    hp = HP5[anim][i]
    if hp in ('soc', 'nod', 'tilt', 'up', 'down') and d not in FRONT:
        return 'loco'                      # these head poses have no NE / N frames
    return hp


def face_for(anim, d, i):
    hp = hp_for(anim, d, i)
    f = FACE5[anim][i]
    if hp == 'loco' and f not in LOCO_SAFE:
        return 'blink' if f == 'blink' else 'neutral'
    if hp == 'down' and f not in DOWN_SAFE:
        return 'smile'
    return f


def expr_brow(face):
    return ta2.EXPR_BROW2.get(face) or ta.EXPR_BROW.get(face, 'neutral')


def zfront5(anim, key, d):
    """Limbs drawn above the head stack: every limb in the front views (the acting renders are cut wherever the body /
    head hides them), none in the back views - except ring_doorbell NE / N, where the parcel rides under the RIGHT
    (camera-side) arm: that arm + mitten and the parcel (zfrontFollow hand_R) are drawn over the jacket."""
    if anim == 'ring_doorbell' and d in RING_TUCK:
        return ('arm_R', 'hand_R')
    return ALL_LIMBS if d in FRONT else ()


def acting(anim):
    return True


LOWER5 = {'carry_parcel'}           # anims whose trousers / boots are rendered per frame (the walking legs)
# the parcel walk's upper body (critique M1): three keys - high over the stance foot with a side sway toward it
# (frames 0-1: left foot planted, 4-5: right), low at the step (2-3, 6-7).  hips@ z (m) and the spine side lean (deg,
# + = the character's left): ~2 px bob and ~2 px head sway at phone scale, like cityfolk carry_box / townfolk walk.
CARRY_Z = {'cw_hi_L': 0.016, 'cw_lo': -0.018, 'cw_hi_R': 0.016}
CARRY_SWAY = {'cw_hi_L': 5.0, 'cw_lo': 0.0, 'cw_hi_R': -5.0}


# --------------------------------------------------------------------------- helpers
lean, arm, arms, body = va.lean, va.arm, va.arms, va.body
legs_stand, legs_walk, squat = va.legs_stand, va.legs_walk, va.squat


def _age(ch):
    return ch.get('age', 'adult')


def torso_pose(tk, ch, d):
    """Rig.apply dict of torso key `tk` (hips / spine / legs / chest; no arms)."""
    L = ch.get('leg_len', 0.34)
    if tk == 'stand':
        p = {**legs_stand(4, 2), 'hips@': (0, 0, -0.003)}
    elif tk == 'stand_lean':
        p = {**legs_stand(4, 2), 'hips@': (0, 0, -0.003), **lean(7)}
    elif tk == 'stand_dip':
        p = {**legs_stand(5, 5), 'hips@': (0, 0, -0.008), **lean(11), 'chest@': (0, 0, -0.006)}
    elif tk == 'press':                       # up on the toes, leaning toward the door bell
        p = {**legs_stand(3, 0), 'hips@': (0, 0, 0.012), **lean(6)}
    elif tk == 'reach':                       # up on the toes at the rack shelf
        p = {**legs_stand(3, 0), 'hips@': (0, 0, 0.016), **lean(5)}
    elif tk == 'turn':                        # twisting toward the tote on the right
        p = {**legs_stand(4, 3), 'hips@': (0, 0, -0.004), **lean(8, 0, -16)}
    elif tk == 'stoop':                       # dropping the parcel into the tote, knees giving a little
        p = va.add(squat(14, L), lean(18, 0, -18))
    elif tk in CARRY_Z:                       # the parcel walk's upper body (legs per frame in the LOWER pass)
        p = {**legs_stand(4, 2), 'hips@': (0, 0, CARRY_Z[tk]), **lean(2, CARRY_SWAY[tk])}
    elif tk == 'bend':                        # a little bow (꾸벅)
        p = {**legs_stand(4, 4), 'hips@': (0, 0.012, -0.005), **lean(21)}
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
    for a in ORDER5:
        if (anims and a not in anims) or a not in TORSO5:
            continue
        for d in ANIMS5[a]['dirs']:
            for tk in TORSO5[a]:
                if (tk, d) not in out:
                    out.append((tk, d))
    return out


def torso_of(anim, key):
    return TORSO5[anim][key]


# --------------------------------------------------------------------------- acting poses
# 'wik_R' / 'wik_L': ROOT-local mitten targets (x < 0 = the character's right, y < 0 = forward, z up from the ground)
# + an elbow pole in the same frame; solved by gbf_render after the torso is posed.  'ik_*' = chest-local.
POLE_R = (-0.75, 0.45, -0.45)
POLE_L = (0.75, 0.45, -0.45)


def wik(side, x, y, z, pole=None):
    pole = pole or (POLE_R if side == 'R' else POLE_L)
    return {'wik_' + side: (x, y, z) + tuple(pole)}


# the medium parcel (held_parcel_gb 'main'): w x d x h metres (gb_parcel_m-ish, chibi scale)
PARCEL_M = (0.30, 0.24, 0.22)
PARCEL_S = (0.20, 0.16, 0.14)
# where the parcel rides in ring_doorbell facing E (chest-local centre): under the left arm in front of the belly (the door
# side, drawn above the doll), shifted to the left side in the back views so it peeks out beside the body
RING_BOX = {'E': (0.06, -0.25, -0.17)}
RING_BOX_DEFAULT = (0.10, -0.23, -0.16)
# (critique H3) doors face the camera, so the bell is always rung facing NE / NW (or N): there the parcel rides under
# the RIGHT arm on the camera side (turned 90 deg: its short side against the body), the LEFT mitten presses the bell.
RING_TUCK = {'NE', 'N'}
TUCK_BOX = (-0.235, -0.07, -0.13)          # chest-local centre of the tucked parcel (x < 0 = the character's right)
TUCK_YAW = 90.0
BELL_R = {1: (-0.19, -0.17, -0.06), 2: (-0.13, -0.27, 0.035), 3: (-0.12, -0.29, 0.020)}
BELL_HAND = {1: (-30, 0, 20), 2: (-70, 0, 10), 3: (-80, 0, 10)}


def ring_box(d):
    if d in RING_TUCK:
        return TUCK_BOX
    return RING_BOX.get(d, RING_BOX_DEFAULT)


def bell_side(d):
    """the hand that presses the bell"""
    return 'L' if d in RING_TUCK else 'R'


def a_ring_doorbell(k, ch, d):
    cx, cy, cz = ring_box(d)
    w, dd, h = PARCEL_M
    if d in RING_TUCK:
        # right arm round the tucked parcel: the mitten under its outer bottom edge, the elbow out and back
        p = {'ik_R': (cx - dd / 2 - 0.01, cy - 0.03, cz - h / 2 + 0.05, -1.0, 0.6, -0.2), 'hand_R': (0, 0, 75)}
        if k == 0:
            p.update(arm('L', 6, 10 + ch.get('arm_out', 0), 0, 14))
        else:
            x, y, z = BELL_R[k]
            p['ik_L'] = (-x, y, z, 1.0, 0.1, -0.5)
            a, b, c = BELL_HAND[k]
            p['hand_L'] = (a, b, -c)
    else:
        # left mitten on the parcel's outer side, a little forward: it hugs the parcel to the belly
        p = {'ik_L': (cx + w / 2 + 0.03, cy - 0.02, cz + 0.02, 1.0, 0.35, -0.5), 'hand_L': (0, 0, -70)}
        if k == 0:
            p.update(arm('R', 6, 10 + ch.get('arm_out', 0), 0, 14))
        else:
            p['ik_R'] = BELL_R[k] + (-1.0, 0.1, -0.5)
            p['hand_R'] = BELL_HAND[k]
    p['_parcel'] = 'ring'
    p['_bell'] = k in (2, 3)
    return p


HAND_SIDE = {'NE': 0.10}         # hand_parcel handPoint facing away: metres out to the camera side of the right mitten


def a_hand_parcel(k, ch, d):
    if k == 3:                                 # the bow: mittens folded in front (chest-local, they follow the bow)
        return {'ik_R': (-0.055, -0.215, -0.205, -0.4, 0.3, -1.0), 'ik_L': (0.055, -0.215, -0.205, 0.4, 0.3, -1.0),
                'hand_R': (0, 0, 20), 'hand_L': (0, 0, -20)}
    hw = PARCEL_M[0] / 2 + 0.02
    t = {0: (-0.23, -0.15), 1: (-0.31, -0.10), 2: (-0.38, -0.06)}[k]
    return {'ik_R': (-hw, t[0], t[1], -1.0, 0.3, -0.6), 'ik_L': (hw, t[0], t[1], 1.0, 0.3, -0.6),
            'hand_R': (-20, 0, 80), 'hand_L': (-20, 0, -80), '_offer': True}


# scan: the target (the parcel's top on the counter) and the scanner fist per key (root-local)
SCAN_TARGET = (0.02, -0.40, COUNTER_TOP + PARCEL_ON_COUNTER)
SCAN_FIST = {0: (-0.11, -0.25, 0.60), 1: (-0.07, -0.27, 0.58), 2: (-0.08, -0.29, 0.555), 3: (-0.14, -0.21, 0.665)}
SCAN_POLE = (-0.9, 0.3, -0.4)


def a_scan(k, ch, d):
    # (chibi arms are short: the left mitten steadies the parcel's near edge just above the counter, at the belly)
    p = dict(wik('L', 0.13, -0.22, 0.52, (0.8, 0.3, -0.5)))
    p['hand_L'] = (0, 0, -40)
    p.update(wik('R', *SCAN_FIST[k], SCAN_POLE))
    p['hand_R'] = {0: (-30, 0, 20), 1: (-25, 0, 20), 2: (-45, 0, 20), 3: (20, 0, 40)}[k]
    p['_scanner'] = k
    return p


# sort_parcel: mittens per key (root-local) and whether the small parcel is between them
SORT_HANDS = {0: ((-0.07, -0.34, 0.03), (0.07, -0.34, 0.03)),           # z relative to the shelf (SHELF[dir])
              1: ((-0.09, -0.36, 0.0), (0.09, -0.36, 0.0)),
              2: ((-0.10, -0.26, 0.58), (0.10, -0.26, 0.58)),
              3: ((-0.20, -0.22, 0.52), (0.0, -0.27, 0.52)),
              4: ((-0.27, -0.16, TOTE + 0.06), (-0.07, -0.25, TOTE + 0.06)),
              5: ((-0.12, -0.24, 0.56), (0.06, -0.24, 0.60))}
SORT_PARCEL = {1, 2, 3, 4}
SORT_AT_SHELF = {0, 1}


def shelf(d):
    return SHELF.get(d, 0.64)


def a_sort_parcel(k, ch, d):
    r, l = SORT_HANDS[k]
    if k in SORT_AT_SHELF:
        r = (r[0], r[1], r[2] + shelf(d))
        l = (l[0], l[1], l[2] + shelf(d))
    p = {**wik('R', *r, (-0.9, 0.4, -0.4)), **wik('L', *l, (0.9, 0.4, -0.4))}
    p['hand_R'] = (-40, 0, 70)
    p['hand_L'] = (-40, 0, -70)
    p['_small'] = k in SORT_PARCEL
    return p


# tape_box: the tape gun's roller along the box top seam, right to left of the packer (root-local)
# (the right hand pulls from the middle to the right: a chibi arm cannot cross the body)
TAPE_ROLLER = {0: (-0.02, -0.24, BOX_TOP + 0.05), 1: (-0.03, -0.24, BOX_TOP), 2: (-0.11, -0.24, BOX_TOP),
               3: (-0.19, -0.23, BOX_TOP + 0.02), 4: (-0.11, -0.25, BOX_TOP + 0.10), 5: (-0.05, -0.24, BOX_TOP + 0.07)}
# the box being taped (root-local top centre; the game draws gb_parcel_m there: bases.boxPoint.tape_box) - the roller
# runs along its top seam from x -0.02 to -0.19, the left mitten holds the flaps at x +0.12
TAPE_BOX_TOP = (-0.03, -0.24, BOX_TOP)
TAPE_BOX_H = 0.20
TAPE_TILT = {0: 10.0, 1: 0.0, 2: 0.0, 3: -28.0, 4: 6.0, 5: 12.0}       # gun tilt (deg; - = the cutting flick)
TAPE_GRIP = 0.105                     # roller -> fist (the grip sits above the roller), at the gun's own scale
ITEM_K = {'scan': 1.35, 'tape': 1.30}  # props drawn bigger than life so they read on a phone (gbf_parts)


def a_tape_box(k, ch, d):
    p = dict(wik('L', 0.12, -0.22, BOX_TOP + 0.10, (0.8, 0.3, -0.5)))       # flaps held down at the box's left
    p['hand_L'] = (0, 0, -50)
    x, y, z = TAPE_ROLLER[k]
    p.update(wik('R', x - 0.02, y + 0.01, z + TAPE_GRIP * ITEM_K['tape'], (-0.9, 0.3, -0.4)))
    p['hand_R'] = (-50, 0, 30)
    p['_tape'] = k
    return p


ACT5 = {'carry_parcel': None, 'ring_doorbell': a_ring_doorbell, 'hand_parcel': a_hand_parcel, 'scan': a_scan,
        'sort_parcel': a_sort_parcel, 'tape_box': a_tape_box}


# --------------------------------------------------------------------------- carry_parcel (walk + hugged parcel)
CARRY_BOX = (0.0, -0.25, -0.14)       # parcel centre, chest-local (lower than cityfolk's box: clear of the chin)


def carry_legs(i, ch, lower=False):
    """walking legs of frame i.  lower=True (the LOWER pass + the feet / groundSpeed measurement): the walk's own hip
    height, so the planted foot stays on the ground; otherwise the hips sit at the frame's upper-body key height (the
    torso, arms, parcel and head offset follow that key).  The difference (<= 2 cm) hides under the coat hem."""
    a = TAU * i / 8
    p = legs_walk(a, 30.0, 50.0, ch.get('leg_len', 0.34), 0.020)
    if not lower:
        p['hips@'] = (0, 0, CARRY_Z[TORSO5['carry_parcel'][KEYS5['carry_parcel'][i]]])
    p['root'] = (0, 0, 0)
    return p


def a_carry_parcel(k, ch, d):
    """arms hugging the parcel (chest-local: they follow the upper body, the same for every frame of a level)"""
    cx, cy, cz = CARRY_BOX
    w = PARCEL_M[0]
    hx = w / 2 + 0.030
    p = {'ik_R': (cx - hx, cy + 0.01, cz - 0.015, -1.0, 0.35, -0.6),
         'ik_L': (cx + hx, cy + 0.01, cz - 0.015, 1.0, 0.35, -0.6),
         'hand_R': (0, 0, 80), 'hand_L': (0, 0, -80), '_parcel': 'carry'}
    return p


ACT5['carry_parcel'] = a_carry_parcel


# --------------------------------------------------------------------------- full body pose

def body_pose5(anim, key, ch, d, frame=None, lower=False):
    """Rig.apply dict (+ '_' item flags and 'wik_' root-local IK) of body key `key`; carry_parcel with `frame` also
    walks the legs of that frame (the LOWER pass, meta and full renders; lower=True: the legs' own hip height)."""
    tk = TORSO5[anim][key]
    p = torso_pose(tk, ch, d)
    if anim == 'carry_parcel' and frame is not None:
        p.update(carry_legs(frame, ch, lower))
        extra = ta.posture(ch, 'walk')
        if extra:
            p = va.add(p, extra)
    p.update(ACT5[anim](key, ch, d))
    return p


def pose5(anim, i, ch, d):
    k = KEYS5[anim][i]
    p = body_pose5(anim, k, ch, d, frame=i)
    face = face_for(anim, d, i)
    p.update({'_hp': hp_for(anim, d, i), '_face': face, '_brow': expr_brow(face),
              '_zfront': set(zfront5(anim, k, d)), '_key': k})
    return p


def frames5(anims=None):
    return [(a, d, i) for a in ORDER5 if anims is None or a in anims
            for d in ANIMS5[a]['dirs'] for i in range(ANIMS5[a]['frames'])]


def keys_of(anim):
    out = []
    for k in KEYS5[anim]:
        if k not in out:
            out.append(k)
    return out


def timeline5():
    out = {}
    for a, d, i in frames5():
        k = KEYS5[a][i]
        face = face_for(a, d, i)
        out[(a, d, i)] = dict(hp=hp_for(a, d, i), face=face, brow=expr_brow(face), zfront=sorted(zfront5(a, k, d)))
    return out


# anim items (added for their anim by the compositor; they have frames only there)
ANIM_ITEMS = {'carry_parcel': ['held_parcel_gb'], 'ring_doorbell': ['held_parcel_gb'],
              'scan': ['held_scanner'], 'sort_parcel': ['held_parcel_gb'], 'tape_box': ['held_tapegun']}
# which held_parcel_gb sub each anim shows (onlyAnims per sub)
PARCEL_SUB = {'carry_parcel': 'main', 'ring_doorbell': 'main', 'sort_parcel': 'small'}


def all_anims():
    out = {a: ta.ANIMS[a] for a in ta.ORDER}
    out.update({a: ta2.ANIMS2[a] for a in ta2.ORDER2})
    out.update(ANIMS5)
    return out
