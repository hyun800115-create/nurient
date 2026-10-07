"""
wkr_build.py - the v4 worker variants (CONTRACT_V4 H, fragment assets/workers).

Ten extra workers, two per profession, with a different age / gender / body type and
their own colours and accessories, built from the same gear library (char_gear.py) and
the same chibi rig as the base workers, so they share the base worker's anims (idle,
walk, carry_idle, carry_walk, work with the tool), impactFrame/impactPoint and carryPoint
logic.  char_build.build(key) delegates here for these keys; char_anim.POSE_MODS gets a
per-variant posture hook (elder hunch, wider arms for round bodies, IK targets scaled to
the body).

    VARIANTS[key] = dict(base=<profession key>, body=<BODY preset>, spec={...build_human /
                         coat overrides...}, look={...char_gear look overrides...},
                         name=(ko, en), traits=[...], hunch=deg, shadow=[w, h])

Importable without bpy (the render driver imports it lazily from char_build / char_anim).
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import char_anim as ca          # noqa: E402  (pure python)

PROFESSIONS = ['fisherman', 'lumberjack', 'farmer', 'miner', 'hunter']

# body presets: torso (sx, sy, sz) | head s | arm (radius, length) | hand s | leg (radius, thigh, shin) | hip spread
BODY = {
    'adult': dict(torso=(1.0, 1.0, 1.0), head=1.0, arm=(1.0, 1.0), hand=1.0, leg=(1.0, 1.0, 1.0), hip_w=1.0),
    'slim': dict(torso=(0.90, 0.90, 0.97), head=0.97, arm=(0.88, 1.0), hand=0.92, leg=(0.88, 1.02, 1.0),
                 hip_w=0.92),
    'tall': dict(torso=(1.0, 0.98, 1.06), head=0.97, arm=(1.0, 1.07), hand=1.0, leg=(1.0, 1.14, 1.08), hip_w=1.0),
    'burly': dict(torso=(1.16, 1.10, 1.0), head=0.98, arm=(1.24, 1.04), hand=1.16, leg=(1.12, 1.0, 1.0),
                  hip_w=1.12),
    'plump': dict(torso=(1.24, 1.20, 0.97), head=1.0, arm=(1.12, 0.97), hand=1.06, leg=(1.16, 0.88, 0.94),
                  hip_w=1.24),
    'elder': dict(torso=(1.02, 1.0, 0.92), head=0.98, arm=(1.0, 0.96), hand=0.96, leg=(1.0, 0.88, 0.92), hip_w=1.0),
    'stout_elder': dict(torso=(1.14, 1.12, 0.93), head=0.99, arm=(1.08, 0.96), hand=1.02, leg=(1.08, 0.88, 0.92),
                        hip_w=1.12),
}
ARM_OUT = {'plump': 9.0, 'burly': 7.0, 'stout_elder': 6.0}      # extra outward shoulder roll (deg)

VARIANTS = {
    # ------------------------------------------------------------------ fisherman
    'fisherman_b': dict(
        base='fisherman', body='stout_elder', hunch=6.0, name=('바다 할아버지', 'Old Salt'),
        traits=['veteran', 'pipe', 'tall_tales'], shadow=[50, 19],
        spec=dict(coat='#2E3F5E', coat_desc=('knit', '#2E3F5E', '#1C2840'), pants='#E8692E',
                  pants_desc=('oil', '#E8692E'), boots='#26282C', mitten='#F2C230',
                  mitt_desc=('rough', '#F2C230', 0.35), skin='#F2C3A2', blush='#EE8C8C'),
        look=dict(hair='#E8E4DC', beard='chin', beard_color='#F4F1EA', stache=True, brows='#E8E4DC', bushy=True,
                  cap=('knit', '#7D8C99'), cap_front=0.52, cap_back=0.20, overalls=('oil', '#E8692E'),
                  boot_band=None, rope='#B89A6A', pipe=True, knife=True)),
    'fisherman_c': dict(
        base='fisherman', body='slim', name=('어부 아가씨 수아', 'Sua'),
        traits=['cheerful', 'early_riser'], shadow=[42, 16],
        spec=dict(coat='#F2EDE2', coat_desc=('stripes', '#F2EDE2', '#2E4A7A', 22.0), pants='#E8B830',
                  pants_desc=('oil', '#E8B830'), boots='#2E3A55', mitten='#3D7CC9',
                  mitt_desc=('rough', '#3D7CC9', 0.35)),
        look=dict(hair='#5A3422', ponytail='#2E8A8A', beard=None, stache=False, brows=None, lashes=True,
                  cap=('knit', '#2E8A8A'), cap_front=0.60, cap_back=0.26, pom='#F2EDE2',
                  overalls=('oil', '#E8B830'), boot_band='#F2EDE2', rope='#E8D2A0', knife=True)),
    # ------------------------------------------------------------------ lumberjack
    'lumberjack_b': dict(
        base='lumberjack', body='burly', name=('곰 아저씨 장쇠', 'Big Bear'),
        traits=['strong', 'quiet', 'gentle_giant'], shadow=[52, 20],
        spec=dict(coat='#3E6B3A', coat_desc=('check', '#3E6B3A', '#1E3A1E', '#141E14', 9.0), pants='#8A7350',
                  pants_desc=('rough', '#8A7350', 0.9), boots='#5A3A22', mitten='#8A5A33',
                  mitt_desc=('rough', '#8A5A33', 0.6)),
        look=dict(hair='#3A2A22', beard='full', beard_color='#3A2A22', brows='#2E221C', bushy=True, hat='earflap',
                  cap_desc=('check', '#C8402F', '#7A2420', '#2A1414', 9.0), pants=('rough', '#8A7350', 0.9),
                  suspenders='#B8302A', socks='#A8A8A4', sock_stripe='#ECE4D2')),
    'lumberjack_c': dict(
        base='lumberjack', body='slim', name=('나무꾼 다온', 'Daon'),
        traits=['energetic', 'competitive'], shadow=[42, 16],
        spec=dict(coat='#4E6F9A', coat_desc=('check', '#4E6F9A', '#2A3A55', '#1A2234', 10.0), pants='#3A3530',
                  pants_desc=('rough', '#3A3530', 0.9), boots='#7A5235', mitten='#C99A5E',
                  mitt_desc=('rough', '#C99A5E', 0.6)),
        look=dict(hair='#B5562E', braid='#E07A2E', beard=None, stache=False, brows=None, lashes=True,
                  cap=('knit', '#E07A2E', None, False), cap_front=0.60, cap_back=0.02, pants=('rough', '#3A3530', 0.9),
                  suspenders='#6B4A2E', socks='#ECE4D2', sock_stripe='#2E8A8A', bushy=False)),
    # ------------------------------------------------------------------ farmer
    'farmer_b': dict(
        base='farmer', body='elder', hunch=10.0, name=('농부 할아버지', 'Grandpa Farmer'),
        traits=['patient', 'weather_wise'], shadow=[46, 18],
        spec=dict(coat='#C9C1A9', coat_desc=('check', '#D9D0B8', '#9A6A48', '#6A4430', 22.0, 0.34),
                  pants='#8A6A44', pants_desc=('rough', '#8A6A44', 0.88), boots='#2A2A2E', mitten='#E8DCC0',
                  mitt_desc=('rough', '#E8DCC0', 0.9), skin='#F2C6A6', blush='#EE9A9A'),
        look=dict(hair='#D8D4CC', braids=None, beard=None, stache=True, beard_color='#D8D4CC', brows='#C8C2B8',
                  bushy=True, lashes=False, hat='felt', felt='#5A4A3A', band='#2E2420', vest=('rough', '#3E4A5A', 0.9),
                  overalls=('rough', '#8A6A44', 0.88), kerchief='#3D7CC9', glove='#E8DCC0')),
    'farmer_c': dict(
        base='farmer', body='plump', name=('밭일 이모', 'Auntie Farmer'),
        traits=['chatty', 'generous', 'sings_at_work'], shadow=[54, 21],
        spec=dict(coat='#F2E8D5', coat_desc=('rough', '#F2E8D5', 0.85), pants='#7A4A8A',
                  pants_desc=('dots', '#7A4A8A', ['#F7C6D6', '#FFFFFF'], 24.0), boots='#3E6B3A', mitten='#D9483B',
                  mitt_desc=('rough', '#D9483B', 0.45), blush='#F28C8C'),
        look=dict(hair='#3A2A22', braids=None, beard=None, stache=False, brows=None, lashes=True, hat='scarf',
                  scarf_desc=('polka', '#E86A8E', '#FFF4F6', 16.0), vest=('rough', '#C8463D', 0.9),
                  momppe=('dots', '#7A4A8A', ['#F7C6D6', '#FFFFFF'], 24.0), kerchief=None,
                  toshi=('dots', '#3D7CC9', ['#FFFFFF', '#9AC6F0'], 34.0), glove='#D9483B',
                  collar_desc=('rough', '#F2E8D5', 0.85))),
    # ------------------------------------------------------------------ miner
    'miner_b': dict(
        base='miner', body='plump', hunch=4.0, name=('광부 영감', 'Old Miner'),
        traits=['grumpy', 'experienced'], shadow=[54, 21],
        spec=dict(coat='#3F5E8C', coat_desc=('stain', '#3F5E8C', '#1E2A3A', 4.0, 0.5),
                  sleeve_desc=('stain', '#3F5E8C', '#1E2A3A', 4.0, 0.5), pants='#3F5E8C',
                  pants_desc=('stain', '#3F5E8C', '#1E2A3A', 4.0, 0.5), boots='#2E2A28', mitten='#8A5A33',
                  mitt_desc=('stain', '#8A5A33', '#3A2A1E', 9.0, 0.6), skin='#F2C3A2'),
        look=dict(hair='#C8C4BC', stache='#D8D4CC', walrus=True, brows='#C8C4BC', bushy=True, hat_color='#F2F0EA',
                  jacket=None, coverall=True, scarf='#C8463D', suspenders=None, shirt_buttons=False)),
    'miner_c': dict(
        base='miner', body='slim', name=('광부 하늘', 'Haneul'),
        traits=['curious', 'brave'], shadow=[42, 16],
        spec=dict(coat='#E8E2D6', coat_desc=('stain', '#E8E2D6', '#8A8070', 8.0, 0.4),
                  sleeve_desc=('stain', '#B8622E', '#4A2A1A', 3.5, 0.5), pants='#3A3E48',
                  pants_desc=('stain', '#3A3E48', '#1E1E22', 7.0, 0.5), boots='#2E2A28', mitten='#C99A5E',
                  mitt_desc=('stain', '#C99A5E', '#5A3E28', 9.0, 0.5)),
        look=dict(hair='#2A2026', hair_style='bob', stache=None, brows=None, lashes=True, hat_color='#F08A3A',
                  goggles=('#5A4A3A', '#7FD0E8'), jacket=('stain', '#B8622E', '#4A2A1A', 3.5, 0.5),
                  suspenders='#2E4A7A', soot_spots=((0.52, -0.14, 0.03),))),
    # ------------------------------------------------------------------ hunter
    'hunter_b': dict(
        base='hunter', body='tall', name=('늑대 사냥꾼', 'Wolf Hunter'),
        traits=['stoic', 'tracker'], shadow=[46, 18],
        spec=dict(coat='#6E4A30', coat_desc=('stain', '#6E4A30', '#4A3020', 5.0, 0.6), pants='#3A2A20',
                  boots='#4A3020', mitten='#4A3020', mitt_desc=('rough', '#4A3020', 0.7)),
        look=dict(hair='#5A3A24', beard='short', beard_color='#7A4A2A', stache=True, brows='#4A2E1C', hat='wolf',
                  mantle=('fur', '#5A5450', '#8A847C'), fringe='#6E4A30', sash=None, belt='#2A1E18',
                  quiver='#4A3020', fletch='#F2EFE8', qstrap='#2A1E18', mukluk='#4A3020', mukluk_fur='#8A847C')),
    'hunter_c': dict(
        base='hunter', body='slim', name=('여우 사냥꾼 루미', 'Rumi'),
        traits=['quick', 'sharp_eyed'], shadow=[42, 16],
        spec=dict(coat='#C8A27A', coat_desc=('stain', '#C8A27A', '#9A7A54', 5.0, 0.5), pants='#5A4030',
                  boots='#8A5E3C', mitten='#8A5E3C', mitt_desc=('rough', '#8A5E3C', 0.7)),
        look=dict(hair='#2A2026', braid='#C8463D', beard=None, stache=False, brows=None, lashes=True, hat='fox',
                  mantle=('fur', '#F2EEE6', '#FFFFFF'), fringe='#C8A27A',
                  sash=('check', '#2E6B5A', '#F2C14E', '#C8463D', 30.0, 0.22), quiver='#8A5E3C', fletch='#2E8A8A',
                  mukluk='#8A5E3C', mukluk_fur='#FFFFFF')),
}
KEYS = list(VARIANTS)
PORTRAIT_FIT = {'fisherman_b': (124, 1.0), 'farmer_b': (120, 1.0), 'farmer_c': (124, 1.02),
                'hunter_b': (122, 1.06), 'hunter_c': (122, 1.04), 'lumberjack_b': (124, 1.02),
                'miner_b': (124, 1.0)}


def profession(key):
    return VARIANTS[key]['base'] if key in VARIANTS else ca.base_key(key)


# --------------------------------------------------------------------------- posture

def _add(p, k, v):
    a = p.get(k, (0.0, 0.0, 0.0))
    if isinstance(a, (int, float)):
        a = (float(a), 0.0, 0.0)
    a = tuple(a) + (0.0,) * (3 - len(a))
    p[k] = tuple(x + y for x, y in zip(a, v))


def make_mod(key):
    V = VARIANTS[key]
    P = BODY[V['body']]
    tx, ty, tz = P['torso']
    hunch = V.get('hunch', 0.0)
    arm_out = ARM_OUT.get(V['body'], 0.0)

    def mod(anim, i, n, pose):
        p = dict(pose)
        if hunch:
            _add(p, 'spine', (-hunch, 0, 0))                 # forward lean (spine pitch > 0 = back)
            _add(p, 'neck', (hunch * 0.9, 0, 0))             # look up again
            _add(p, 'hip_R', (hunch * 0.3, 0, 0))
            _add(p, 'hip_L', (hunch * 0.3, 0, 0))
            _add(p, 'knee_R', (hunch * 0.6, 0, 0))
            _add(p, 'knee_L', (hunch * 0.6, 0, 0))
            _add(p, 'root@', (0, 0, -0.004 * hunch / 10))
        if arm_out:
            for s in ('R', 'L'):
                if 'sh_' + s in p and 'ik_' + s not in p:
                    _add(p, 'sh_' + s, (0, arm_out, 0))
        for s in ('R', 'L'):                               # IK targets are chest-local: follow the torso scale
            k = 'ik_' + s
            if k in p:
                v = list(p[k])
                v[0] *= tx * (1.0 + 0.4 * (tx - 1.0))
                v[1] *= ty
                v[2] *= tz
                p[k] = tuple(v)
        return p
    return mod


for _k in VARIANTS:
    ca.POSE_MODS[_k] = make_mod(_k)


# --------------------------------------------------------------------------- build (bpy)

def apply_proportions(rig, P):
    """Scale part groups + child joint rest positions after dressing (same method as
    vil_body.apply_proportions): every joint's non-joint children move under a scale
    empty, child joint rest positions follow, the hips are re-seated on the legs."""
    import char_geo as g
    import char_build as cb
    from mathutils import Vector
    tx, ty, tz = P['torso']
    hs = P['head']
    ar, al = P['arm']
    hd = P['hand']
    lr, lt, ls = P['leg']
    scales = {'spine': (tx, ty, tz), 'chest': (tx, ty, tz), 'neck': (1, 1, 1), 'head': (hs, hs, hs),
              'hips': (tx, ty, 1.0)}
    for side in ('R', 'L'):
        scales['sh_' + side] = (ar, ar, al)
        scales['el_' + side] = (ar, ar, al)
        scales['hand_' + side] = (hd, hd, hd)
        scales['hip_' + side] = (lr, lr, lt)
        scales['knee_' + side] = (lr, lr, ls)
    joints = set(rig.j.values())
    for jn, sc in scales.items():
        if jn not in rig.j or tuple(sc) == (1.0, 1.0, 1.0):
            continue
        j = rig.j[jn]
        kids = [c for c in j.children if c not in joints]
        if not kids:
            continue
        e = g.empty(jn + '_S', j, (0, 0, 0))
        e.scale = sc
        for c in kids:
            mw = c.matrix_parent_inverse.copy()
            c.parent = e
            c.matrix_parent_inverse = mw
    for jn, e in rig.j.items():
        par = e.parent
        pname = next((k for k, v in rig.j.items() if v == par), None)
        if pname is None or pname not in scales:
            continue
        sx, sy, sz = scales[pname]
        rl = rig.rest_loc[jn]
        rig.rest_loc[jn] = Vector((rl.x * sx, rl.y * sy, rl.z * sz))
        e.location = rig.rest_loc[jn]
    for side, sx in (('R', -1), ('L', 1)):
        rig.rest_loc['hip_' + side] = Vector((sx * 0.085 * P['hip_w'], 0, 0))
        rig.j['hip_' + side].location = rig.rest_loc['hip_' + side]
    sole = 0.188
    hip_z = cb.THIGH * lt + sole * ls
    rig.rest_loc['hips'] = Vector((0, 0, hip_z))
    rig.j['hips'].location = rig.rest_loc['hips']
    rig.meta['body'] = dict(P)
    rig.meta['torso_scale'] = (tx, ty, tz)
    return rig


def make_spec(key):
    import char_build as cb
    V = VARIANTS[key]
    spec = dict(cb.SPECS[V['base']])
    spec.update(V.get('spec', {}))
    spec['look'] = dict(V.get('look', {}))
    return spec


def build(key):
    import bl_common as bc
    import char_build as cb
    bc.reset_scene()
    V = VARIANTS[key]
    rig = cb.build_from_spec(make_spec(key), key)
    apply_proportions(rig, BODY[V['body']])
    rig.meta['shadow'] = V.get('shadow', [46, 18])
    rig.meta['key'] = key
    return rig
