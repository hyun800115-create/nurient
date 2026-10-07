"""
vil3_build.py - the batch-3 roster: station operators (기획서_v3_분업).

Not run directly: vil3_render.py imports
    build(key)                    -> char_geo.Rig ready to pose (scene reset) incl. the role's work tools
    anims_for(key)                -> {anim: {frames, fps, repeat, dirs[, impactFrame]}}
    pose_for(rig, anim, i, d)     -> pose dict incl. '_show' (face parts + props)

Keys
  NEW (12 core human anims + operate):
    npc_sawyer   제재공 산들      sawmill      body 'tall'
    npc_smoker   훈제사 연기      smokehouse   body 'big'  (vil2_build.BODY2)
    npc_cannery  통조림 기술자 통통 cannery     body 'plump'
  OVERRIDES (complete re-render under the SAME key, every existing anim + operate):
    npc_chef        <- vil2_build (assets/villagers2)   grill
    npc_aunt        <- vil_build  (assets/villagers)    bakery oven
    npc_blacksmith  <- vil_build  (assets/villagers)    smelter
  Their models and every non-operate pose come unchanged from vil_build / vil2_build
  (imported, not copied); the operate tools are extra toggles hidden in all other anims.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import vil_anim as va             # noqa: E402   (pure python; bpy modules are imported lazily)
import vil2_anim as va2           # noqa: E402
import vil3_anim as va3           # noqa: E402
import vil_build as vb1           # noqa: E402   (pure python at import time)
import vil2_build as vb2          # noqa: E402

NEW_KEYS = ['npc_sawyer', 'npc_smoker', 'npc_cannery']
OVERRIDE_KEYS = ['npc_chef', 'npc_aunt', 'npc_blacksmith']
ALL_KEYS = ['npc_chef', 'npc_aunt', 'npc_blacksmith', 'npc_sawyer', 'npc_smoker', 'npc_cannery']
SOURCE = {'npc_chef': 'villagers2', 'npc_aunt': 'villagers', 'npc_blacksmith': 'villagers'}
ROLE = {'npc_chef': 'grill', 'npc_aunt': 'bakery', 'npc_blacksmith': 'smelter', 'npc_sawyer': 'sawmill',
        'npc_smoker': 'smokehouse', 'npc_cannery': 'cannery'}

NOFUR = dict(hem_fur=False, cuff_fur=False, boot_fur=False)

SPECS = {
    'npc_sawyer': dict(
        name=('제재공 산들', 'Sandeul the Sawyer'), role='adult',
        traits=['diligent', 'woodworker', 'operator', 'sawmill'],
        body='tall', coat='#5C8F6A', hair='#C99A5A', pants='#5A4A3E', boots='#6B4A2E', bare_hands=True,
        bare_forearms=True, **NOFUR, hem_r=0.24, hem_z=-0.07, idle_style=None,
        face=dict(brow='#A87A3A', brow_thick=0.0145), shadow=[46, 18]),
    'npc_smoker': dict(
        name=('훈제사 연기', 'Yeongi the Smoker'), role='adult',
        traits=['gruff', 'patient', 'operator', 'smokehouse'],
        body='big', coat='plaid_red', hair='#3A2A22', pants='#4A4038', boots='#3B2A20', mitten='#EFE4CC',
        **NOFUR, hem_r=0.25, hem_z=-0.08, idle_style='back',
        face=dict(brow='#3A2A22', brow_thick=0.0175, nose='big', mouth_v=-0.100), shadow=[56, 22]),
    'npc_cannery': dict(
        name=('통조림 기술자 통통', 'Tongtong the Canner'), role='adult',
        traits=['cheerful', 'round', 'operator', 'cannery'],
        body='plump', coat='#F4EEDF', hair='#6B4026', pants='#3D6FB8', boots='#5A3A26', mitten='#F5C531',
        **NOFUR, hem_r=0.245, hem_z=-0.08, idle_style='clasp', idle_face='smile',
        face=dict(brow='#5A3420', blush='#F48A8A', eye_w=0.047, eye_h=0.064), shadow=[54, 21]),
}


def anims_for(key):
    """{anim: info} in contract order for this key; operate appended last."""
    if key in vb1.SPECS:
        out = vb1.anims_for(key)
    elif key in vb2.SPECS:
        out = vb2.anims_for(key)
    else:
        out = {n: dict(va3.ANIMS[n]) for n in va3.ORDER if n in va3.CORE}
    out['operate'] = va3.operate_info(ROLE[key])
    return out


def make_spec(key):
    import char_build as cb
    import vil_dress as vd
    s = dict(SPECS[key])
    face = dict(s.get('face', {}))
    face.setdefault('skin', s.get('skin', cb.SKIN))
    s['face'] = face
    for k, v in face.items():
        s[k] = v
    if s['coat'] == 'plaid_red':
        s['coat_mat'] = cb.mat_plaid('shirt_plaid', '#B5452E', '#7A2A22', light='#D06A4A', scale=9.0)
    else:
        s['coat_mat'] = cb.M('coat', s['coat'], rough=s.get('coat_rough', 0.8))
    if s.get('sleeve'):
        s['sleeve_mat'] = cb.M('sleeve', s['sleeve'], rough=0.85)
    prof = s.get('torso_profile') or vd.std_profile(s.get('hem_r', 0.245), s.get('hem_z', -0.08))
    s['torso_profile_raw'] = prof
    return s


def build_new(key):
    import bl_common as bc
    import vil_body
    import vil3_dress as vd3
    bc.reset_scene()
    spec = make_spec(key)
    rig = vil_body.build_body(spec)
    vd3.DRESS[key](rig, spec)
    P = vb2.BODY2.get(spec['body']) or vil_body.BODY[spec['body']]
    vil_body.apply_proportions(rig, P)
    ch = {k: spec.get(k) for k in ('role', 'idle_style', 'idle_face', 'walk_face', 'run_face')
          if spec.get(k) is not None}
    ch['leg_len'] = rig.meta['leg_len']
    ch['hip_z'] = rig.meta['leg_len']
    rig.meta.update(key=key, ch=ch, shadow=spec.get('shadow', [46, 18]))
    return rig


def build(key):
    import vil3_dress as vd3
    if key in vb1.SPECS:
        rig = vb1.build(key)
    elif key in vb2.SPECS:
        rig = vb2.build(key)
    else:
        rig = build_new(key)
    vd3.add_work_tools(rig, ROLE[key])
    rig.meta['role3'] = ROLE[key]
    return rig


def _scale_ik(rig, p):
    tx, ty, tz = rig.meta['torso_scale']
    for side in ('R', 'L'):
        k = 'ik_' + side
        if k in p:
            v = list(p[k])
            v[0] *= tx
            v[1] *= ty
            v[2] *= tz
            p[k] = tuple(v)
    return p


def show_operate(rig, face, props):
    ch = rig.meta.get('ch', {})
    sub = ch.get('face_sub') or {}
    return {sub.get(x, x) for x in va3.FACES[face]} | set(props)


def show_set(rig, face, props, anim=None):
    """Face + props for the NEW keys (core anims and operate)."""
    return show_operate(rig, face, props)


def pose_for(rig, anim, i, d):
    key = rig.meta['key']
    ch = rig.meta['ch']
    if anim == 'operate':
        p = va3.operate_pose(ROLE[key], i, ch)
        extra = va.posture(ch, anim)
        if extra:
            p = add_keep(p, extra)
        p = _scale_ik(rig, p)
        p['_show'] = show_operate(rig, p.pop('_face'), p.pop('_props', set()))
        return p
    if key in vb1.SPECS:
        return vb1.pose_for(rig, anim, i, d)
    if key in vb2.SPECS:
        return vb2.pose_for(rig, anim, i, d)
    info = va3.ANIMS[anim]
    p = va2.human_pose(anim, i, info['frames'], ch, d)
    p = _scale_ik(rig, p)
    p['_show'] = show_set(rig, p.pop('_face'), p.pop('_props', set()), anim)
    return p


def add_keep(p, extra):
    work = p.get('_work')
    out = va.add(p, extra)
    if work is not None:
        out['_work'] = work
    return out
