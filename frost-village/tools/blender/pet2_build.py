"""
pet2_build.py - the batch-1 shiba (vil_pets.build('pet_dog'), unchanged: red scarf, curly tail,
same materials and PET_SCALE) + the dog-play props for CONTRACT_V4 section I:

    toggle 'ball'   red rubber ball with a white band, held in the mouth (joint 'ball_j' on the head)
    toggle 'treat'  bone biscuit held across the jaws (joint 'treat_j' on the head)
    toggles 'crumb0..2'  biscuit crumbs (eat), positioned per frame from pose['_loc'] (head-local)
    toggle 'p_m_wide'    the open mouth WITHOUT the tongue (so the ball / biscuit sits in it)

Not run directly: pet2_render.py imports build() / pose_for().
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import pet2_anim as pa           # noqa: E402  (pure python)

KEY = 'pet_dog'

# head-local placements (unscaled dog metres; vil_pets: muzzle centre (0,-0.115,-0.045), nose y -0.165)
BALL_R = 0.052
BALL_LOC = (0.0, -0.178, -0.072)
TREAT_LEN = 0.30
TREAT_LOC = (0.0, -0.205, -0.078)
CRUMB_R = 0.013


def build():
    import bl_common as bc
    import char_geo as g
    import vil_pets
    import pet2_props as pp
    bc.reset_scene()
    rig = vil_pets.build(KEY)
    rig.meta['key'] = KEY
    rig.meta['ch'] = {'role': 'pet'}
    # open mouth without the tongue (vil_pets: p_m_open = [m_open, tongue])
    rig.toggle('p_m_wide', [rig.toggles['p_m_open'][0]])
    red = bc.mat('ball_red', pp.BALL_RED, rough=0.38)
    white = bc.mat('ball_white', pp.BALL_WHITE, rough=0.45)
    rig.add('ball_j', 'head', BALL_LOC)
    ball = pp.ball_obj(g, 'ball', BALL_R, red, white, rig.j['ball_j'], seg=24, rings=12)
    rig.toggle('ball', [ball])
    rig.add('treat_j', 'head', TREAT_LOC)
    bis = bc.mat('biscuit', pp.BISCUIT, rough=0.8)
    treat = g.mesh_obj('treat', pp.bm_bone(TREAT_LEN, thick=0.78, seg=16), bis, rig.j['treat_j'],
                       rot=(8, 0, 0))
    dot = bc.mat('biscuit_dot', pp.BISCUIT_DOT, rough=0.9)
    dots = []
    for (x, y, z) in pp.bone_dots(TREAT_LEN, thick=0.78)[::2]:
        dots.append(g.mesh_obj('treat_dot', g.bm_ellipsoid(0.008, 0.008, 0.004, 8, 4), dot, treat, loc=(x, y, z)))
    rig.toggle('treat', [treat] + dots)
    # the scarf tail hangs straight down from the neck; on its back (roll) it would poke through the
    # snow, so it becomes a toggle that every anim except roll shows
    tail = [o for o in rig.j['neck'].children if o.name.startswith('scarf_tail')]
    rig.toggle('scarf_tail', tail)
    crumb = bc.mat('crumb', pp.BISCUIT, rough=0.85)
    rig.meta['crumbs'] = {}
    for k in range(3):
        nm = 'crumb%d' % k
        ob = g.mesh_obj(nm, g.bm_ellipsoid(CRUMB_R, CRUMB_R * 0.9, CRUMB_R * 0.8, 8, 5), crumb, rig.j['head'])
        rig.toggle(nm, [ob])
        rig.meta['crumbs'][nm] = ob
    return rig


def anims():
    return {a: dict(pa.ANIMS[a]) for a in pa.ORDER}


def pose_for(rig, anim, i, d):
    p = pa.pose(anim, i, d)
    face = p.pop('_face')
    props = set(p.pop('_props', set()))
    loc = p.pop('_loc', {}) or {}
    show = set(pa.PET2_FACES[face]) | props
    if anim not in pa.HIDE_SCARF_TAIL:
        show.add('scarf_tail')
    for nm, xyz in loc.items():
        if xyz is not None:
            show.add(nm)
    p['_show'] = show
    p['_crumbs'] = loc
    return p


def apply(rig, pose, d):
    """Rig.apply + crumb placement (head-local)."""
    import bl_common as bc
    rig.apply(pose, yaw_deg=bc.DIR_YAW[d])
    for nm, ob in rig.meta.get('crumbs', {}).items():
        xyz = (pose.get('_crumbs') or {}).get(nm)
        if xyz is not None:
            ob.location = xyz
    rig.update_strings()
