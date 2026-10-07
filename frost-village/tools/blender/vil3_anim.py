"""
vil3_anim.py - the 'operate' anim (station operators, 기획서_v3_분업) + face presets for
the batch-3 residents.  Pure python (no bpy): importable anywhere for checks.

Builds on vil_anim / vil2_anim WITHOUT changing them: the 12 core human anims and
every batch-1 / batch-2 extra come straight from those modules; this module adds

    operate   8f / 10fps loop, ALL 5 dirs (S, SE, E, NE, N)
              the character works a station at hip / chest height with a role tool.
              Not cheated toward the camera (like 'throw'): the operator truly faces the
              station so the tool lines up with it in every direction.

Roles (one per operator; ROLES[role] also carries impactFrame / beats / workTool):
    grill       npc_chef        frying pan flip: the fish tumbles up and lands back
    bakery      npc_aunt        rolling pin over dough on a floured board
    smelter     npc_blacksmith  tongs hold a glowing bar, the hammer strikes it
    sawmill     npc_sawyer      both palms push a log forward into the saw
    smokehouse  npc_smoker      hook a ham up onto the rack, then fan the smoke
    cannery     npc_cannery     pull the bench-press lever down, the ram seals a can

Pose dict = vil_anim conventions plus '_work' (copied into Rig.state by Rig.apply):
    '_work': {'R': (r, f, z) | None, 'L': ..., 'poleR': ..., 'poleL': ...,
              'props': {name: spec}, 'fx': spec, 'fx2': spec}
  (r, f, z) = metres in the FACING frame of the character: r = to the character's right,
  f = forward, z = up from the ground (anchor).  'R'/'L' are mitten-centre targets that
  vil3_dress.pin_hands() reaches with exact 2-bone IK after the pose is applied (they are
  absolute, so the hands meet tools that rest on the station).  A prop spec is
    {'root': (r, f, z)}  or  {'hand': 'R'|'L', 'off': (r, f, z)}  or
    {'parent': name, 'off': (r, f, z)}   (offset in the parent prop's own frame)
  + optional 'rot': (elev, roll, yawR) deg (elev = tilt the prop's forward axis up,
  roll about that axis, yawR = turn toward the character's right) and 'scale'.
  'fx' / 'fx2' are marker specs: vil3_render turns 'fx' on impactFrame into
  impactPoint and 'fx2' into the second entry of 'beats'.
"""
import math

import vil_anim as va
import vil2_anim as va2
from vil_anim import TAU, lean, look, arm, body, legs_stand, squat, face, add  # noqa: F401

LOCO_DIRS = va.LOCO_DIRS
SOCIAL_DIRS = va.SOCIAL_DIRS

ANIMS = {k: dict(v) for k, v in va2.ANIMS.items()}
ANIMS['operate'] = dict(frames=8, fps=10, repeat=-1, dirs=LOCO_DIRS)
CORE = list(va2.CORE)
ORDER = list(va2.ORDER) + ['operate']

FACES = dict(va2.FACES)
FACES.update({
    'focus':       ['eye_dot', 'brow_angry', 'm_smile', 'cheek_blush'],    # determined brows, tiny closed smile
    'focus_blink': ['eye_blink', 'brow_angry', 'm_smile', 'cheek_blush'],
    'focus_o':     ['eye_dot', 'brow_angry', 'm_mid', 'cheek_blush'],      # effort puff
})

# --------------------------------------------------------------------------- small vector helpers


def tool_dir(elev, yawR):
    """Unit forward axis of a prop with rot (elev, *, yawR), in (r, f, z)."""
    e, y = math.radians(elev), math.radians(yawR)
    return (math.cos(e) * math.sin(y), math.cos(e) * math.cos(y), math.sin(e))


def along(p, elev, yawR, dist):
    d = tool_dir(elev, yawR)
    return tuple(a + dist * b for a, b in zip(p, d))


def vadd(a, b):
    return tuple(x + y for x, y in zip(a, b))


def vsub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def lerp3(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


# --------------------------------------------------------------------------- role tables

PAN_C = 0.30          # pan grip -> bowl centre (m), vil3_dress.make_pan
HAMMER_L = 0.26       # hammer grip -> head centre
TONGS_BAR = 0.235     # tongs grip -> hot bar centre
LOG_LEN = 0.44
LOG_R = 0.10
LOG_Z = 0.60          # log axis height (rests on a 0.50 m saw table)
BOARD_Z = 0.50        # bakery: board top
PIN_R = 0.032
PRESS_PIVOT = (0.0, 0.58, 0.70)       # cannery lever pivot (r, f, z)
LEVER_L = 0.30
TBAR = 0.145                          # half width of the lever's T-bar (hands)
CAN_AT = (0.0, 0.50, 0.50)            # can bottom centre on the press plate
CAN_H = 0.090


def gaze(world_down, ln):
    """Head pitch so the head looks `world_down` deg below level whatever the spine lean
    (keeps the face toward the camera in S / SE / E instead of showing the top of the head)."""
    return look(world_down - ln)


def _grill(i, ch):
    """Chef: frying-pan flip.  impactFrame 4 = the fish at the top of its flip."""
    # grip(r,f,z), pan elev, fish (df, dz) from the pan centre of frame 2 (None = in the pan), fish pitch,
    # lean, gaze (deg below level), knee bend, hips dz, face
    K = [
        ((0.165, 0.250, 0.560), 2, None, 0, 7, 6, 3, 0.000, 'focus'),
        ((0.165, 0.225, 0.528), -8, None, 0, 9, 8, 8, -0.010, 'focus'),
        ((0.165, 0.272, 0.640), 26, (-0.03, 0.11), -70, 5, 0, 2, 0.012, 'focus_o'),
        ((0.165, 0.262, 0.612), 9, (-0.05, 0.21), -125, 4, -6, 2, 0.006, 'focus'),
        ((0.165, 0.260, 0.600), 5, (-0.04, 0.255), -180, 4, -8, 2, 0.004, 'smile'),
        ((0.165, 0.258, 0.585), 3, (-0.02, 0.15), -245, 5, -3, 3, 0.000, 'smile'),
        ((0.165, 0.232, 0.520), -8, None, -360, 9, 8, 10, -0.014, 'happy'),
        ((0.165, 0.248, 0.552), 0, None, -360, 8, 6, 4, -0.004, 'focus_blink'),
    ]
    grip, el, fly, rot, ln, gz, bend, dz, f = K[i % 8]
    yawR = -9.0
    centre = along(grip, el, yawR, PAN_C)
    base = along(K[2][0], K[2][1], yawR, PAN_C)
    if fly is None:
        fish = vadd(centre, (0.0, 0.0, 0.034 + 0.012 * math.sin(math.radians(el))))
        frot = (el, 0, yawR + rot)
    else:
        fish = vadd(base, (0.0, fly[0], fly[1]))
        frot = (rot, 0, yawR)
    p = {**legs_stand(3, bend), **lean(ln), **gaze(gz, ln), **body(0, 0, dz)}
    p['ik_L'] = va.HOLD_STYLES['hips']['ik_L']          # left fist on the hip (the chef's idle style)
    work = {'R': grip,
            'props': {'pan': {'hand': 'R', 'rot': (el, 0, yawR)},
                      'fish_op': {'root': fish, 'rot': frot}},
            'fx': {'root': fish},
            'fx2': {'root': vadd(centre, (0, 0, 0.03))}}
    p['_work'] = work
    p.update(face(f, {'pan', 'fish_op'}))
    return p


def _bakery(i, ch):
    """Baker auntie: rolling pin pushed over the dough.  impactFrame 3 = full push (flour puff)."""
    pin_f = [0.285, 0.310, 0.350, 0.388, 0.362, 0.322, 0.292, 0.276][i % 8]
    lift = [0.000, 0.000, 0.000, 0.000, 0.000, 0.000, 0.010, 0.024][i % 8]
    ln = [8, 12, 17, 22, 18, 12, 8, 6][i % 8]
    dough_d = [0.100, 0.102, 0.112, 0.126, 0.126, 0.121, 0.112, 0.104][i % 8]
    dough_h = [0.026, 0.025, 0.022, 0.019, 0.019, 0.020, 0.022, 0.025][i % 8]
    f = ['focus', 'focus', 'focus', 'smile', 'smile', 'focus', 'focus', 'focus_blink'][i % 8]
    zpin = BOARD_Z + 2 * dough_h + PIN_R + lift
    pin = (0.0, pin_f, zpin)
    L = ch.get('leg_len', 0.338)
    p = {**legs_stand(4, 3 + 0.3 * ln), **lean(ln, 0, 0), **gaze(9, ln), **body(0, -0.006 * ln / 10, 0)}
    if i % 8 == 3:
        p.update(squat(8, L))
        p.update(lean(ln))
        p.update(gaze(9, ln))
    work = {'R': vadd(pin, (0.172, 0.0, 0.0)), 'L': vadd(pin, (-0.172, 0.0, 0.0)),
            'poleR': (-0.7, 0.3, -0.7), 'poleL': (0.7, 0.3, -0.7),
            'props': {'rpin': {'root': pin},
                      'board': {'root': (0.0, 0.350, BOARD_Z)},
                      'dough': {'root': (0.0, 0.338, BOARD_Z), 'scale': (1.0, dough_d / 0.10, dough_h / 0.025)}},
            'fx': {'root': (0.0, pin_f + 0.04, BOARD_Z + 0.03)},
            'fx2': {'root': (0.0, pin_f, zpin)}}
    p['_work'] = work
    p.update(face(f, {'rpin', 'board', 'dough'}))
    return p


def _smelter(i, ch):
    """Blacksmith: tongs hold a glowing bar, the hammer comes down on it.  impactFrame 3.
    The hammer is raised on the character's RIGHT, beside the head (visible in S and N)."""
    tong_grip = (-0.110, 0.236, 0.520)
    tong_rot = (-6.0, 0.0, 26.0)
    bar = along(tong_grip, tong_rot[0], tong_rot[2], TONGS_BAR)
    strike = vadd(bar, (0.0, 0.0, 0.020 + 0.058))          # hammer-head centre when it lands on the bar
    hit_dir = (-16.0, -34.0)
    hit_grip = along(strike, hit_dir[0], hit_dir[1], -HAMMER_L)
    #       grip (r, f, z)            elev  yawR  lean gaze bend face
    K = [
        ((0.300, 0.110, 0.840),        55, 55, 8, 4, 2, 'focus'),
        ((0.310, 0.085, 0.870),        62, 70, 7, 2, 1, 'focus_o'),
        ((0.250, 0.190, 0.780),        35, 20, 10, 6, 3, 'focus'),
        (hit_grip,                     hit_dir[0], hit_dir[1], 15, 10, 10, 'smile'),
        (vadd(hit_grip, (0.010, -0.008, 0.045)), -4, -32, 14, 9, 7, 'smile'),
        ((0.215, 0.220, 0.710),        15, -10, 12, 8, 5, 'focus'),
        ((0.260, 0.170, 0.770),        35, 25, 10, 6, 3, 'focus'),
        ((0.290, 0.130, 0.820),        48, 45, 9, 5, 2, 'focus_blink'),
    ]
    grip, el, yR, ln, gz, bend, f = K[i % 8]
    k = i % 8
    jolt = {3: -0.012, 4: -0.006}.get(k, 0.0)
    roll = {5: 14.0, 6: 8.0}.get(k, 0.0)
    tg = vadd(tong_grip, (0.0, 0.0, jolt))
    L = ch.get('leg_len', 0.338)
    p = {**legs_stand(5, bend), **lean(ln, 0, 0), **gaze(gz, ln)}
    if k == 3:
        p.update(squat(9, L))
        p.update({'chest@': (0, 0, -0.008)})
    work = {'R': grip, 'L': tg, 'poleR': (-0.9, 0.2, -0.5),
            'props': {'hammer': {'hand': 'R', 'rot': (el, 0, yR)},
                      'tongs': {'hand': 'L', 'rot': (tong_rot[0], roll, tong_rot[2])},
                      'hotbar': {'parent': 'tongs', 'off': (0.0, TONGS_BAR, 0.0)}},
            'fx': {'parent': 'hammer', 'off': (0.0, HAMMER_L, -0.058)},
            'fx2': {'parent': 'tongs', 'off': (0.0, TONGS_BAR, 0.0)}}
    p['_work'] = work
    p.update(face(f, {'hammer', 'tongs', 'hotbar'}))
    return p


def _sawmill(i, ch):
    """Sawyer: palms on the end of a log, push it forward into the saw.  impactFrame 3 = log hits the blade."""
    k = i % 8
    rear = [0.272, 0.300, 0.345, 0.388, 0.378, 0.345, 0.308, 0.282][k]
    ln = [12, 16, 22, 27, 25, 20, 15, 12][k]
    lunge = [0.25, 0.45, 0.80, 1.00, 0.92, 0.65, 0.42, 0.28][k]
    f = ['focus', 'focus', 'focus_o', 'smile', 'smile', 'focus', 'focus', 'focus_blink'][k]
    L = ch.get('leg_len', 0.36)
    p = {'hip_L': (24 * lunge, 4, 0), 'knee_L': (34 * lunge + 4, 0, 0),
         'hip_R': (-16 * lunge, 4, 0), 'knee_R': (6 + 6 * lunge, 0, 0),
         **body(0, -0.035 * lunge, -0.022 * lunge), **lean(ln), **gaze(4 - 4 * lunge, ln)}
    log_c = (0.0, rear + LOG_LEN / 2, LOG_Z)
    hz = LOG_Z + 0.030
    work = {'R': (0.066, rear - 0.040, hz), 'L': (-0.066, rear - 0.040, hz),
            'poleR': (-0.8, 0.5, -0.4), 'poleL': (0.8, 0.5, -0.4),
            'props': {'log': {'root': log_c}},
            'fx': {'root': (0.0, rear + LOG_LEN + 0.01, LOG_Z)},
            'fx2': {'root': (0.0, rear + LOG_LEN + 0.01, LOG_Z)}}
    p['_work'] = work
    p.update(face(f, {'log'}))
    return p


def _smokehouse(i, ch):
    """Smoker: lift a ham up onto the rack hook (impactFrame 3), then fan the smoke (beat 2 = frame 6)."""
    k = i % 8
    R = [(0.215, 0.205, 0.500), (0.240, 0.225, 0.700), (0.250, 0.235, 0.850), (0.255, 0.240, 0.885),
         (0.230, 0.200, 0.680), (0.215, 0.180, 0.560), (0.210, 0.190, 0.505), (0.212, 0.200, 0.498)][k]
    Lh = [(-0.160, 0.240, 0.640), (-0.160, 0.240, 0.655), (-0.160, 0.235, 0.660), (-0.160, 0.235, 0.660),
          (-0.125, 0.278, 0.530), (-0.150, 0.235, 0.705), (-0.122, 0.282, 0.515), (-0.150, 0.250, 0.620)][k]
    fan_el = [40, 44, 46, 46, -38, 58, -42, 26][k]
    ln = [12, 7, 3, 2, 12, 8, 14, 12][k]
    gz = [10, -4, -14, -16, 12, 6, 13, 10][k]
    meat = k in (0, 1, 2, 3, 7)
    f = ['focus', 'focus', 'focus_o', 'smile', 'focus', 'focus', 'smile', 'focus_blink'][k]
    p = {**legs_stand(5, 3 + 0.4 * ln), **lean(ln, 2 if k in (2, 3) else 0, 0), **look(gz - ln, 0, -6 if k in (2, 3) else 0)}
    props = {'fan': {'hand': 'L', 'rot': (fan_el, 0, 14)}}
    shown = {'fan'}
    if meat:
        props['ham'] = {'hand': 'R', 'off': (0.0, 0.0, 0.0), 'rot': (0, 0, -10)}
        shown.add('ham')
    work = {'R': R, 'L': Lh, 'poleR': (-0.9, 0.2, -0.4), 'props': props,
            'fx': {'hand': 'R', 'off': (0.0, 0.0, 0.040)},
            'fx2': {'parent': 'fan', 'off': (0.0, 0.200, 0.0)}}
    p['_work'] = work
    p.update(face(f, shown))
    return p


def lever_end(theta):
    t = math.radians(theta)
    pr, pf, pz = PRESS_PIVOT
    return (pr, pf - LEVER_L * math.cos(t), pz + LEVER_L * math.sin(t))


LEVER_THETA = [12, 7, -3, -15.5, -14, -6, 4, 10]
RAM_TOP, RAM_DOWN = 0.648, CAN_AT[2] + CAN_H + 0.004


def _cannery(i, ch):
    """Can-press operator: both gloved hands pull the T-bar lever down, the ram seals the can.  impactFrame 3."""
    k = i % 8
    th = LEVER_THETA[k]
    end = lever_end(th)
    t = (LEVER_THETA[0] - th) / (LEVER_THETA[0] - LEVER_THETA[3])
    ram_z = RAM_TOP + (RAM_DOWN - RAM_TOP) * max(0.0, min(1.0, t))
    ln = [9, 11, 14, 16, 15, 13, 11, 10][k]
    bend = [2, 4, 8, 12, 11, 7, 4, 3][k]
    f = ['focus', 'focus', 'focus_o', 'happy', 'happy', 'focus', 'focus', 'focus_blink'][k]
    p = {**squat(bend, ch.get('leg_len', 0.31)), **lean(ln), **gaze(7, ln)}
    p['hip_R'] = (bend, 6, 0)
    p['hip_L'] = (bend, 6, 0)
    sealed = k in (3, 4, 5, 6, 7)
    shown = {'press', 'lever', 'ram', 'can_sealed' if sealed else 'can_open'}
    work = {'R': vadd(end, (TBAR - 0.012, 0.0, 0.0)), 'L': vadd(end, (-TBAR + 0.012, 0.0, 0.0)),
            'poleR': (-0.9, 0.2, -0.5), 'poleL': (0.9, 0.2, -0.5),
            'props': {'press': {'root': (0.0, 0.0, 0.0)},
                      'lever': {'root': PRESS_PIVOT, 'rot': (th, 0, 180)},
                      'ram': {'root': (0.0, CAN_AT[1], ram_z)},
                      'can_open': {'root': CAN_AT}, 'can_sealed': {'root': CAN_AT}},
            'fx': {'root': (0.0, CAN_AT[1], CAN_AT[2] + CAN_H)},
            'fx2': {'root': (0.0, CAN_AT[1], CAN_AT[2] + CAN_H)}}
    p['_work'] = work
    p.update(face(f, shown))
    return p


OPERATE_FN = {'grill': _grill, 'bakery': _bakery, 'smelter': _smelter, 'sawmill': _sawmill,
              'smokehouse': _smokehouse, 'cannery': _cannery}

# impactFrame + an optional second beat (sfx / particle sync) per role
ROLES = {
    'grill': dict(station='station_grill', impactFrame=4, impact='flip_apex', beat2=(6, 'catch_sizzle'),
                  workTool='frying pan (right hand, left fist on the hip) + a roast fish that leaves the pan on '
                           'frame 2, tumbles end over end (apex = impactFrame 4) and lands back on frame 6. '
                           'impactPoint = fish centre at the apex; beats[1] = pan centre on the catch.'),
    'bakery': dict(station='station_bakery', impactFrame=3, impact='rolling_push', beat2=(3, 'pin_on_dough'),
                   workTool='rolling pin held by both handles, rolled forward over a dough sheet on a floured '
                            'board (board top 0.50 m, its centre 0.35 m in front of the anchor = the station '
                            'counter). The dough stretches on the push; impactPoint = flour-puff spot at the '
                            'front edge of the dough on the full push.'),
    'smelter': dict(station='station_smelter', impactFrame=3, impact='hammer_hit', beat2=(5, 'turn_bar'),
                    workTool='smithing tongs (left hand) hold an orange-hot bar; the hammer (right hand) is '
                             'raised on frames 0-1 and lands on the bar on frame 3. impactPoint = bottom of the '
                             'hammer face = spark spawn.'),
    'sawmill': dict(station='station_sawmill', impactFrame=3, impact='log_into_blade', beat2=(4, 'cut'),
                    workTool='0.44 m log (axis 0.60 m high = on the saw table) pushed by both palms on its end '
                             'grain; front end reaches the blade on frame 3. impactPoint = centre of the log\'s '
                             'front end = sawdust spawn.'),
    'smokehouse': dict(station='station_smokehouse', impactFrame=3, impact='ham_hooked', beat2=(6, 'fan_whoosh'),
                       workTool='ham on an S-hook in the right oven mitt is lifted onto the rack hook (frame 3, '
                                'then it stays on the station rack: hidden 4-6, a new ham is picked up on 7); '
                                'round paper fan in the left mitt fans the smoke down on frames 4 and 6. '
                                'impactPoint = the hook; beats[1] = fan centre on the big stroke (smoke puff).'),
    'cannery': dict(station='station_cannery', impactFrame=3, impact='press_down', beat2=(3, 'steam_hiss'),
                    workTool='bench can press (cast plate 0.50 m high, 0.50 m in front of the anchor, column + '
                             'lever + ram) - both yellow-gloved hands pull the T-bar lever down, the ram seals the '
                             'can on frame 3 (open can with fish 0-2, sealed lid 3-7). impactPoint = can lid.'),
}


def operate_pose(role, i, ch):
    return OPERATE_FN[role](i, ch)


def operate_info(role):
    info = dict(ANIMS['operate'])
    info['impactFrame'] = ROLES[role]['impactFrame']
    return info
