"""
vil2_build.py - the batch-2 resident roster (CONTRACT_V3 section D).

Not run directly: vil2_render.py imports
    build(key)                    -> char_geo.Rig ready to pose (scene reset)
    anims_for(key)                -> {anim: {frames, fps, repeat, dirs[, impactFrame]}}
    pose_for(rig, anim, i, d)     -> pose dict incl. '_show' (face parts + props)

Reuses the batch-1 villager system unchanged: vil_body.build_body (chibi body +
the swappable vil_face expression parts), vil_body.apply_proportions, vil_anim
(core anims + face presets) and vil_dress helpers.  New looks live in
vil2_dress.py, new anims in vil2_anim.py.  Batch 1 (vil_build / assets/villagers)
is not touched by anything here.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import vil2_anim as va2           # noqa: E402   (pure python; bpy modules are imported lazily)

KEYS = ['npc_clerk_a', 'npc_clerk_b', 'npc_porter_a', 'npc_porter_b', 'npc_captain', 'npc_chef', 'npc_postman',
        'npc_doctor', 'npc_painter', 'npc_guard', 'npc_skater', 'npc_toddler']
ALL_KEYS = KEYS

# extra anims per key (CONTRACT_V3 D table; the 12 core human anims are for everyone)
EXTRAS = {
    'npc_clerk_a': ['serve', 'bow'], 'npc_clerk_b': ['serve', 'bow'],
    'npc_porter_a': ['run'], 'npc_porter_b': ['run'],
    'npc_captain': ['sit'], 'npc_chef': ['serve', 'dance'], 'npc_postman': ['run'], 'npc_doctor': ['sit'],
    'npc_painter': ['dance'], 'npc_guard': ['salute'], 'npc_skater': ['skate', 'run', 'dance'],
    'npc_toddler': ['run', 'fall'],
}
PORTERS = {'npc_porter_a', 'npc_porter_b'}
SITTERS = {k for k, v in EXTRAS.items() if 'sit' in v}

NOFUR = dict(hem_fur=False, cuff_fur=False, boot_fur=False)

# body presets on top of vil_body.BODY (torso (sx,sy,sz) | head | arm (r, len) | hand | leg (r, thigh, shin) | hip)
BODY2 = {
    'big':     dict(torso=(1.18, 1.12, 1.03), head=1.0, arm=(1.22, 1.04), hand=1.16, leg=(1.16, 1.0, 1.0),
                    hip_w=1.14),
    'toddler': dict(torso=(0.80, 0.84, 0.46), head=0.80, arm=(0.86, 0.64), hand=0.88, leg=(0.86, 0.50, 0.56),
                    hip_w=0.80),
    'stout':   dict(torso=(1.13, 1.12, 1.0), head=1.0, arm=(1.06, 1.0), hand=1.04, leg=(1.08, 0.95, 0.97),
                    hip_w=1.12),
}

SKATE_DRESS = [(0.300, -0.150), (0.272, -0.095), (0.228, -0.02), (0.208, 0.08), (0.208, 0.22), (0.195, 0.31),
               (0.155, 0.39), (0.07, 0.45), (0.0, 0.46)]
SNOWSUIT = [(0.255, -0.105), (0.282, -0.02), (0.285, 0.08), (0.262, 0.18), (0.222, 0.28), (0.170, 0.37),
            (0.08, 0.44), (0.0, 0.46)]
PEA_COAT = [(0.272, -0.15), (0.262, -0.07), (0.238, 0.02), (0.214, 0.10), (0.208, 0.22), (0.195, 0.31),
            (0.155, 0.39), (0.07, 0.45), (0.0, 0.46)]
SMOCK = [(0.285, -0.20), (0.268, -0.10), (0.240, 0.0), (0.216, 0.10), (0.208, 0.22), (0.195, 0.31),
         (0.155, 0.39), (0.07, 0.45), (0.0, 0.46)]

SPECS = {
    'npc_clerk_a': dict(
        name=('점원 미소', 'Miso'), role='adult', traits=['cheerful', 'polite', 'shopkeeper', 'register'],
        body='adult', coat='#F2B84B', hair='#4A2E22', pants='#5A3A4A', boots='#7A4A30', bare_hands=True, **NOFUR,
        hem_r=0.26, hem_z=-0.12, idle_style='clasp', serve_prop='bag',
        face=dict(brow='#4A2E22', lashes=True, blush='#F49090'), shadow=[46, 18]),
    'npc_clerk_b': dict(
        name=('점원 민호', 'Minho'), role='adult', traits=['tidy', 'polite', 'shopkeeper', 'register'],
        body='tall', coat='#FBF8F0', sleeve='#FBF8F0', hair='#2A1E1A', pants='#4A3830', boots='#3B2A20',
        bare_hands=True, **NOFUR, hem_r=0.24, hem_z=-0.07, idle_style='back', serve_prop='bag',
        face=dict(brow='#2A1E1A', brow_thick=0.0135), shadow=[46, 18]),
    'npc_porter_a': dict(
        name=('짐꾼 곰돌', 'Gomdol'), role='adult', traits=['strong', 'hardworking', 'porter', 'carries_on_back'],
        body='big', coat='#9A6A42', sleeve='#E8DCC0', quilted=True, hair='#2A2026', pants='#3A4458',
        boots='#4A3020', mitten='#C98F55', **NOFUR, hem_r=0.25, hem_z=-0.08, carry='back',
        face=dict(brow='#2A2026', brow_thick=0.0175, nose='big', mouth_v=-0.112), shadow=[56, 22]),
    'npc_porter_b': dict(
        name=('짐꾼 다람', 'Daram'), role='teen', traits=['quick', 'cheerful', 'porter', 'carries_on_back'],
        body='teen', coat='#4E7A4A', quilted=True, hair='#A0502A', pants='#5A4636', boots='#3B2A20',
        mitten='#F4E6CC', **NOFUR, hem_r=0.245, hem_z=-0.08, carry='back', carry_face='smile', run_face='happy',
        face=dict(brow='#7A3A1E', eye_w=0.047, eye_h=0.065, blush='#F48A8A'), shadow=[46, 18]),
    'npc_captain': dict(
        name=('선장 바다', 'Captain Bada'), role='elder', traits=['jolly', 'storyteller', 'sea', 'waves'],
        body='plump', coat='#2E3F6E', hair='#F2F0EA', pants='#3A4458', boots='#22222A', mitten='#2A3350',
        **NOFUR, torso_profile=PEA_COAT, hem_r=0.272, hem_z=-0.15, idle_style='back',
        face=dict(brow='#D8D4CC', brow_thick=0.018, mouth_v=-0.118, mouth_out=0.052, nose='big',
                  nose_color='#F2A890', blush='#F2A0A0'), shadow=[54, 21]),
    'npc_chef': dict(
        name=('요리사 쿡', 'Chef Cook'), role='adult', traits=['proud', 'foodie', 'dance', 'serves_food'],
        body='stout', coat='#FBFAF6', hair='#5A3A26', pants='check', boots='#2A2A30', bare_hands=True, **NOFUR,
        hem_r=0.25, hem_z=-0.09, idle_style='hips', serve_prop='dish',
        face=dict(brow='#5A3A26', brow_thick=0.0155, mouth_v=-0.120, nose='big'), shadow=[52, 20]),
    'npc_postman': dict(
        name=('우체부', 'Postman'), role='adult', traits=['punctual', 'friendly', 'runs', 'delivers_mail'],
        body='adult', coat='#3D6FB8', hair='#6B4026', pants='#22305A', boots='#2A2A30', mitten='#22305A',
        **NOFUR, hem_r=0.245, hem_z=-0.08,
        face=dict(brow='#5A3420'), shadow=[46, 18]),
    'npc_doctor': dict(
        name=('의사 선생님', 'Doctor'), role='adult', traits=['caring', 'calm', 'checks_on_people'],
        body='adult', coat='#3E9A9A', sleeve='#F7F7F4', hair='#3A2A30', pants='#5A5A66', boots='#5A3A26',
        bare_hands=True, **NOFUR, hem_r=0.24, hem_z=-0.08, idle_style='clasp',
        face=dict(brow='#3A2A30', lashes=True, blush='#F49A9A'), shadow=[46, 18]),
    'npc_painter': dict(
        name=('화가', 'Painter'), role='adult', traits=['dreamy', 'artist', 'dance', 'paints_scenery'],
        body='adult', coat='splatter', hair='#B5652E', pants='#2E6A6A', boots='#6B4A2E', bare_hands=True,
        **NOFUR, torso_profile=SMOCK, hem_r=0.285, hem_z=-0.20, palette=True,
        face=dict(brow='#8A4A22', lashes=True, blush='#F48A8A'), shadow=[48, 19]),
    'npc_guard': dict(
        name=('경비대장', 'Guard Captain'), role='adult', traits=['brave', 'serious', 'protects', 'salutes'],
        body='strong', coat='#9E3A34', sleeve='#34405A', quilted=True, hair='#3A2A22', pants='#34405A',
        boots='#4A3020', mitten='#7A4E2E', **NOFUR, hem_r=0.255, hem_z=-0.10, spear=True,
        face=dict(brow='#3A2A22', brow_thick=0.018), shadow=[52, 20]),
    'npc_skater': dict(
        name=('스케이트 소녀', 'Skater Girl'), role='teen', traits=['sporty', 'graceful', 'dance', 'skates'],
        body='teen', coat='#5BB6E8', fur='#FFFFFF', hair='#7A4A2E', pants='#F7F4EE', boots='#FBFAF6',
        mitten='#FFFFFF', hem_fur=True, cuff_fur=True, boot_fur=False, torso_profile=SKATE_DRESS, hem_r=0.300,
        hem_z=-0.150, run_face='happy',
        face=dict(brow='#6E4026', lashes=True, eye_w=0.047, eye_h=0.065, blush='#F48A8A'), shadow=[42, 16]),
    'npc_toddler': dict(
        name=('아기 콩콩', 'Baby Kongkong'), role='kid', traits=['toddler', 'wobbly', 'curious', 'cries_easily'],
        body='toddler', coat='#F4F6FA', sleeve='#F4F6FA', quilted=True, torso_profile=SNOWSUIT, hair='#A0703F',
        pants='#F4F6FA', boots='#3B3540', mitten='#E04848', **NOFUR, hem_r=0.255, hem_z=-0.105, toddler=True,
        face=dict(brow='#8A5A33', eye_u=0.120, eye_w=0.056, eye_h=0.076, mouth_v=-0.104, blush='#F48A8A',
                  ears=False, brow_thick=0.0135), shadow=[30, 12]),
}


def anims_for(key):
    """{anim: info} in contract order for this key."""
    want = set(va2.CORE) | set(EXTRAS[key])
    return {n: dict(va2.ANIMS[n]) for n in va2.ORDER if n in want}


def make_spec(key):
    import char_build as cb
    import vil_dress as vd
    import vil2_dress as vd2
    s = dict(SPECS[key])
    face = dict(s.get('face', {}))
    face.setdefault('skin', s.get('skin', cb.SKIN))
    s['face'] = face
    for k, v in face.items():
        s[k] = v
    coat = s['coat']
    if coat == 'splatter':
        s['coat_mat'] = vd2.mat_splatter('smock_splatter', '#F2EAD8', ['#E04848', '#F2C230', '#3D7CC9', '#5FB14E',
                                                                         '#E07AB0'], scale=9.0, size=0.22)
    else:
        s['coat_mat'] = cb.M('coat', coat, rough=s.get('coat_rough', 0.8))
    if s.get('sleeve'):
        s['sleeve_mat'] = cb.M('sleeve', s['sleeve'], rough=0.85)
    if s.get('pants') == 'check':
        s['pants_mat'] = vd2.mat_check('pants_check', '#F2EFE8', '#3A3A44', scale=46.0)
    prof = s.get('torso_profile') or vd.std_profile(s.get('hem_r', 0.245), s.get('hem_z', -0.08))
    s['torso_profile_raw'] = prof
    if s.get('quilted'):
        s['torso_profile'] = vd.quilted_profile(prof, step=0.075, amp=0.06)
    return s


def build(key):
    import bl_common as bc
    import vil_body
    import vil2_dress as vd2
    from mathutils import Vector
    bc.reset_scene()
    spec = make_spec(key)
    rig = vil_body.build_body(spec)
    vd2.DRESS[key](rig, spec)
    P = BODY2.get(spec['body']) or vil_body.BODY[spec['body']]
    vil_body.apply_proportions(rig, P)
    blade = rig.meta.get('blade_h', 0.0)
    if blade:                                       # ice skates: lift the body by the blade height
        lift = blade * P['leg'][2]
        rig.rest_loc['hips'] = rig.rest_loc['hips'] + Vector((0, 0, lift))
        rig.j['hips'].location = rig.rest_loc['hips']
        rig.meta['leg_len'] += lift
    ch = {k: spec.get(k) for k in ('role', 'idle_style', 'hunch', 'run_face', 'carry', 'carry_face', 'toddler',
                                   'spear', 'palette', 'serve_prop') if spec.get(k) is not None}
    ch['leg_len'] = rig.meta['leg_len']
    ch['hip_z'] = rig.meta['leg_len']
    rig.meta.update(key=key, ch=ch, shadow=spec.get('shadow', [46, 18]))
    return rig


def show_set(rig, face, props, anim=None):
    ch = rig.meta.get('ch', {})
    show = set(va2.FACES[face]) | set(props)
    if ch.get('spear'):
        show.add('spear_back' if anim == 'carry_walk' else 'spear')
    return show


def pose_for(rig, anim, i, d):
    ch = rig.meta['ch']
    info = va2.ANIMS[anim]
    p = va2.human_pose(anim, i, info['frames'], ch, d)
    tx, ty, tz = rig.meta['torso_scale']
    for side in ('R', 'L'):
        k = 'ik_' + side
        if k in p:
            v = list(p[k])
            v[0] *= tx
            v[1] *= ty
            v[2] *= tz
            p[k] = tuple(v)
    p['_show'] = show_set(rig, p.pop('_face'), p.pop('_props', set()), anim)
    return p
