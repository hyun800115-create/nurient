"""
ship_models.py - builders of the v6 harbour ships (docs/CONTRACT_V6.md section S), registered in ship_lib.SHIPS.

  ferry        여객선   ~16 m passenger ferry: navy / white hull with portholes, two passenger decks with warm
                        windows, red funnel, lifeboats, sun deck.  layered: base + idle(2) / move(4) smoke + foam(4)
  cargo_ship   화물선   ~21 m chunky freighter: green hull, cream bridge house aft, orange funnel, a yellow deck
                        crane, 3 hatches = 6 container-stack slots the game shows / hides.  layered.
  trawler_big  원양어선 ~14 m deep-sea stern trawler: blue hull, high bow, wheelhouse forward, yellow outrigger
                        booms, net drum + orange A-frame at the stern; haul = the full net bag coming up. layered.
  tugboat      예인선   ~6 m fat red tug with tyre fenders and a big bow fender, captain on deck.   full frames
  sailboat     돛단배   ~5.6 m tourist sailboat with a striped mainsail, skipper + a waving tourist. full frames
  yacht        요트     ~7 m white motor yacht with a flybridge + radar arch, two tourists.          full frames

Ship-local frame: bow -Y, stern +Y, z up, origin = waterline centre (see ship_lib).  The camera-near side for the
SE / NE headings is local -X (the gangway / door side).
"""
import math

import bpy  # noqa: F401
from mathutils import Vector, Euler, Matrix

import bl_common as bc
import prop_lib as L
from prop_lib import C, flat, box, cyl, sphere, blob, extrude, tonal, hexmix
import prop_assets as PA
import bld_boats as BB
import ship_lib as SL
from ship_lib import ship, Hull, WHITE, NAVY, GLASS

LAYERED_ANIMS = {'idle': {'frames': 2, 'fps': 3, 'repeat': -1, 'layers': ['smoke']},
                 'move': {'frames': 4, 'fps': 6, 'repeat': -1, 'layers': ['smoke']},
                 'foam': {'frames': 4, 'fps': 8, 'repeat': -1, 'layers': ['foam'], 'with': 'move'}}


def sm(a, b, x):
    """smoothstep from a to b (a may be > b)."""
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def new_group():
    g = bpy.data.objects.new('ship', None)
    bpy.context.scene.collection.objects.link(g)
    return g


def deck_mat():
    return L.stripes('#C99A62', '#B5864F', 4.0, 'X', rough=0.75, soft=0.05)


def snow(name, sx, sy, loc, t=0.1, seed=0, droop=0.0):
    return L.snow_slab(name, sx, sy, t, loc, seed=seed, droop=droop)


def side_windows(name, pts, z, w, h, step, glow=True, skip=None, r=0.11, frame=WHITE):
    objs = []
    for k, (p, n) in enumerate(SL.points_along(pts, step, skip=skip)):
        objs += SL.window('%s%d' % (name, k), Vector((p.x, p.y, z)), n, w=w, h=h, r=r, glow=glow, frame=frame)
    return objs


def layered_pose(B, anim, i, n):
    if anim in ('idle', 'move', 'haul'):
        frames = n
        B['smoke'].set(i, frames)
    if anim == 'foam':
        B['foam'].set(i, n)
    if anim == 'haul' and B.get('haul_pose'):
        B['haul_pose'](B, i, n)


# =========================================================================== FERRY

FE_L, FE_W, FE_F = 16.0, 5.2, 1.7


@ship('ferry', 'layered', dict(LAYERED_ANIMS, idle=dict(LAYERED_ANIMS['idle']), move=dict(LAYERED_ANIMS['move'])),
      length=FE_L, beam=FE_W, samples=24,
      notes='Passenger ferry (~16 m): navy / white hull with a red boot-top and brass portholes, two white passenger '
            'decks with warm windows (bridge with blue glass up front), red funnel with a gold star, two orange '
            'lifeboats, an open sun deck with benches aft, bow capstan, stern ensign. Layered: draw base_<dir>, then '
            'passengers at deckPoints, then foam (while moving), then the idle/move smoke overlay.')
def b_ferry():
    g = new_group()
    H = Hull(FE_L, FE_W, FE_F, rake=0.9, stern_over=0.18, pb=1.9, qb=1.5, ps=8.0, qs=6.0)
    hm = SL.band_mat('ferry_hull', [(-1.0, '#C8463D'), (0.3, NAVY), (0.98, '#D9483B'), (1.08, WHITE)], rough=0.45)
    H.build('fhull', hm, deck_mat())
    white = flat(WHITE, 0.55)
    cap = flat('#C98F55', 0.6)
    gang_t = H.t_at_y(0.6)
    H.bulwark('fbulw', lambda t: 0.3 + 0.62 * sm(-0.55, -0.98, t), hm, white, cap, thick=0.1,
              gap=[(gang_t - 0.05, gang_t + 0.05, -1.0), (gang_t - 0.05, gang_t + 0.05, 1.0)])
    # portholes along the white band (both sides), skip the gangway gap on the near side
    for side in (-1.0, 1.0):
        for k, t in enumerate([-0.62 + 0.124 * j for j in range(12)]):
            if abs(t - gang_t) < 0.07:
                continue
            p, n = H.side_point(t, 1.36, side, out=0.0)
            SL.porthole('fph%d%d' % (side > 0, k), p, n, r=0.13)
        a, n = H.side_point(-0.8, 1.15, side, out=0.01)
        SL.anchor_on('fanc%d' % (side > 0), a, n, s=0.5)
    # ---- deck 1 (main passenger deck)
    z1, h1 = FE_F, 1.75
    d1, d1pts = SL.cabin('fdeck1', 3.9, -4.0, 6.2, z1, h1, white, roof=flat('#D3DBE4', 0.7), rf=1.6, rb=0.35)
    zt1 = z1 + h1
    side_windows('fw1', d1pts, zt1 - 0.62, 0.6, 0.56, 0.92,
                 skip=lambda p: p.y > 5.9 or abs(p.y - 0.6) < 0.6)
    # gangway door on the near side (-X)
    for s_ in (-1, 1):                      # gangway doors on both sides (near = -X, far = +X)
        dn = Vector((s_, 0, 0))
        SL.panel('fdoor_f%d' % s_, (s_ * 1.95, 0.6, z1 + 0.68), dn, 0.86, 1.36, 0.2, 0.035, flat(WHITE, 0.55))
        SL.panel('fdoor%d' % s_, (s_ * 1.96, 0.6, z1 + 0.66), dn, 0.72, 1.24, 0.16, 0.05, flat('#3D7CC9', 0.5))
        SL.porthole('fdoorw%d' % s_, Vector((s_ * 2.0, 0.6, z1 + 0.95)), dn, r=0.12)
    # aft wall: double doors + life ring
    bn = Vector((0, 1, 0))
    SL.panel('fadoor', (0.0, 6.2, z1 + 0.66), bn, 0.9, 1.24, 0.16, 0.05, flat('#3D7CC9', 0.5))
    SL.life_ring('flr1', (1.2, 6.25, z1 + 1.0), bn)
    SL.life_ring('flr2', (-1.2, 6.25, z1 + 1.0), bn)
    # ---- deck 2 (bridge + upper saloon)
    z2, h2 = zt1, 1.5
    d2, d2pts = SL.cabin('fdeck2', 3.3, -3.3, 2.4, z2, h2, white, roof=flat(NAVY, 0.5), rf=1.3, rb=0.3)
    zt2 = z2 + h2
    side_windows('fw2', d2pts, zt2 - 0.45, 0.56, 0.5, 0.9, skip=lambda p: p.y < -1.9 or p.y > 2.2)
    side_windows('fwb', d2pts, zt2 - 0.38, 0.5, 0.58, 0.62, glow=False, skip=lambda p: p.y > -2.0, r=0.08,
                 frame=NAVY)
    # navy roof band + snow
    SL.cabin('fd2band', 3.42, -3.36, 2.46, zt2 - 0.18, 0.2, flat(NAVY, 0.5), rf=1.32, rb=0.32, bevel=0.05)
    SL.pillow_snow('fd2snow', 2.9, -3.05, 2.15, zt2 - 0.02, rf=1.05, rb=0.12, t=0.14, seed=3)
    # ---- sun deck (deck 1 roof behind deck 2): railing, benches, snow patches
    sun_rail = [(1.84, 2.45)] + [(x * 0.96, y - 0.08) for (x, y) in d1pts if y > 2.5] + [(-1.84, 2.45)]
    SL.railing('fsunrail', sun_rail, zt1, h=0.7, closed=False)
    for k, (x, y) in enumerate(((-0.75, 4.4), (0.75, 4.4))):
        box('fbench%d' % k, (0.5, 1.5, 0.12), (x, y, zt1 + 0.32), mat=flat('#3D7CC9', 0.5), bevel=0.04)
        box('fbback%d' % k, (0.1, 1.5, 0.45), (x + (0.22 if x > 0 else -0.22), y, zt1 + 0.38),
            mat=flat('#3D7CC9', 0.5), bevel=0.04)
        for yy in (y - 0.6, y + 0.6):
            box('fbleg', (0.4, 0.08, 0.32), (x, yy, zt1), mat=flat('#2E3A4A', 0.5), bevel=0.02)
    SL.drift('fsun_s1', (1.45, 5.7, zt1), r=0.32, seed=4)
    SL.drift('fsun_s2', (-1.5, 2.75, zt1), r=0.26, seed=5)
    SL.drift('fsun_s3', (-0.2, 5.95, zt1), r=0.22, seed=6, scale=(1.8, 0.9, 0.34))
    # ---- lifeboats beside deck 2
    for s in (-1, 1):
        SL.lifeboat('flb%d' % (s > 0), (s * 2.05, -0.5, zt1 - 0.02), length=2.2, beam=0.78, yaw=0.0, seed=7 + s)
    # ---- funnel + mast
    fg, ftop = SL.funnel('ffun', (0.0, 0.95, zt2 - 0.02), 1.05, 1.55, 1.5, '#D9483B', band=WHITE, top='#2B2F3A',
                         rake=9.0, logo=lambda nm, p, n: SL.star_logo(nm, p, n, r=0.16))
    mobjs, mtop = SL.mast('fmast', (0.0, -2.1, zt2), 1.7, flag='blue', flag_w=0.6, r=0.1, yard=1.1)
    # whistle on the funnel front + a lamp on the bridge front
    cyl('fwhis', 0.08, 0.3, (0.0, 0.05, zt2 + 1.05), mat=flat('#E9C46A', 0.3, 0.6), segs=12, r_top=0.11)
    # ---- main deck railing (promenade + aft deck), skipping the gangway gap
    for s in (-1.0, 1.0):
        pts = []
        for t in [H.t_at_y(y) for y in [-5.6 + 0.5 * k for k in range(27)]]:
            x, y = H.xy(t, FE_F, s)
            if abs(y - 0.6) < 0.55:
                if pts:
                    SL.railing('frail%d_%d' % (s > 0, len(pts)), pts, FE_F + 0.3, h=0.5, closed=False)
                pts = []
                continue
            pts.append((x - s * 0.05, y))
        if len(pts) > 1:
            SL.railing('frail%d_e' % (s > 0), pts, FE_F + 0.3, h=0.5, closed=False)
    # stern rail across the aft deck
    sp = [(H.xy(t, FE_F, 1.0)[0] - 0.05, H.xy(t, FE_F, 1.0)[1] - 0.05) for t in (0.93, 0.97, 0.995)]
    sp = sp + [(-x, y) for (x, y) in reversed(sp)]
    SL.railing('frail_st', sp, FE_F + 0.3, h=0.5)
    # ---- foredeck: capstan, bollards, jack staff, snow
    cyl('fcap', 0.32, 0.35, (0, -5.5, FE_F), mat=flat('#B23A30', 0.5), segs=24, bevel=0.05)
    cyl('fcapt', 0.22, 0.1, (0, -5.5, FE_F + 0.35), mat=flat('#3D424C', 0.5), segs=20, bevel=0.03)
    for (x, y) in ((-1.25, -4.6), (1.25, -4.6), (-1.1, 6.9), (1.1, 6.9)):
        SL.bollard('fbol', (x, y, FE_F))
    jx, jy = 0.0, -7.55
    cyl('fjack', 0.04, 1.3, (jx, jy, FE_F + 0.5), mat=flat(WHITE, 0.5), segs=10)
    SL.flag_on('fjackflag', (jx, jy + 0.02, FE_F + 1.78), 0.45, 0.28, 'red', seed=3, emblem=False)
    cyl('fens', 0.045, 1.5, (0.0, 7.75, FE_F + 0.3), mat=flat(WHITE, 0.5), segs=10)
    SL.flag_on('fensflag', (0.0, 7.77, FE_F + 1.78), 0.7, 0.42, 'red', seed=5, emblem=True)
    SL.drift('ffore_s', (0.75, -6.6, FE_F), r=0.34, seed=8)
    SL.drift('ffore_s2', (-0.95, -6.2, FE_F), r=0.28, seed=9)
    SL.drift('ffore_s3', (0.0, -7.25, FE_F + 0.05), r=0.3, seed=10, scale=(1.2, 1.0, 0.4))
    SL.drift('faft_s', (-1.6, 7.3, FE_F), r=0.28, seed=11)
    PA.snow_cap('fcap_s', 0.2, (0, -5.5, FE_F + 0.44), 0.06, 2)
    # ---- animated layers
    smk_base = ftop + Vector((0, 0.05, 0.05))
    with L.Collect() as cs:
        smk = SL.smoke('fsmoke', smk_base, big=1.5, seed=3, drift=(0.0, 1.0), n=4, rise=1.7)
    with L.Collect() as cf:
        foam = SL.Foam('ffoam', H, n=8, length=0.4, spread=0.75, r0=0.2, r1=0.42, seed=2, splash=3)
    deck = []
    for x in (-1.2, -0.4, 0.4, 1.2):
        for y in (2.9, 3.6, 5.2, 5.8):
            deck.append(Vector((x, y, zt1)))
    for y in [-3.2 + 0.9 * k for k in range(10)]:
        if abs(y - 0.6) > 0.5:
            deck.append(Vector((-2.28, y, FE_F)))
            deck.append(Vector((2.28, y, FE_F)))
    for x in (-1.5, -0.5, 0.5, 1.5):
        deck.append(Vector((x, 6.85, FE_F)))
    for x in (-1.0, 0.0, 1.0):
        deck.append(Vector((x, -4.7, FE_F)))
    gx, gy = H.xy(gang_t, FE_F, -1.0)
    stern = Vector((0.0, FE_L / 2 + 0.05, 0.0))
    bow = Vector((0.0, -FE_L / 2 + 0.15, 0.0))
    B = {'group': g, 'layers': {'smoke': cs.objs, 'foam': cf.objs}, 'smoke': smk, 'foam': foam,
         'pose': layered_pose,
         'points': {'smoke': smk_base, 'stern': stern, 'bow': bow, 'gangway': Vector((gx, gy, FE_F)),
                    'gangwayDeck': Vector((gx + 0.45, gy, FE_F)),
                    'gangwayFar': Vector((-gx, gy, FE_F)), 'gangwayFarDeck': Vector((-gx - 0.45, gy, FE_F)),
                    'horn': ftop - Vector((0, 0.7, 0.4)), 'deck': deck,
                    'perch': [mtop, Vector((jx, jy, FE_F + 1.82)), Vector((0.0, 7.75, FE_F + 1.82)),
                              Vector((-2.05, -0.5, zt1 + 0.86)), Vector((2.05, -0.5, zt1 + 0.86))],
                    'lights': {'mast': mtop, 'bridge': Vector((0, -3.3, zt2 - 0.4))}}}
    return B


# =========================================================================== CARGO SHIP

CS_L, CS_W, CS_F = 21.0, 5.6, 1.9
CONT_COLS = ['#D9483B', '#3D7CC9', '#F2C14E', '#3FA58C', '#F08A3A', '#F4F1EA', '#8E5AA8', '#2E6B4F']


@ship('cargo_ship', 'layered', dict(LAYERED_ANIMS), length=CS_L, beam=CS_W, samples=24,
      notes='Chunky freighter (~21 m): green hull with a cream sheer stripe, raised bow with a mast, three hatch '
            'covers, a yellow deck crane with a hook, cream bridge house aft with an orange funnel. The six container '
            'stacks are separate pre-occluded sprites slot<k>_<dir> (draw the loaded ones in slotOrder after the '
            'base); cargoPoints are the same spots on the hatch covers for the game\'s own crate / item stacks.')
def b_cargo_ship():
    g = new_group()
    green = '#2E6B4F'
    cream = '#F2E6C8'
    H = Hull(CS_L, CS_W, CS_F, rake=1.0, stern_over=0.22, pb=1.75, qb=1.7, ps=9.0, qs=7.0)
    hm = SL.band_mat('cargo_hull', [(-1.0, '#C8463D'), (0.32, green), (1.58, cream), (1.76, green)], rough=0.45)
    H.build('chull', hm, flat('#7E8A86', 0.7))
    H.bulwark('cbulw', lambda t: 0.5 + 0.75 * sm(-0.58, -0.86, t), hm, flat('#6E8A7C', 0.6), flat(WHITE, 0.5),
              thick=0.12)
    for side in (-1.0, 1.0):
        a, n = H.side_point(-0.83, 1.25, side, out=0.01)
        SL.anchor_on('canc%d' % (side > 0), a, n, s=0.6)
    # forecastle deck block (raised bow)
    fpts = [p for p in H.deck_outline(inset=0.14) if p[1] < -7.6]          # ring order = CCW, closes across
    extrude('cfore', fpts, 0.62, loc=(0, 0, CS_F), top=flat('#8E9A96', 0.7), side=flat(cream, 0.6), bevel=0.04)
    zf = CS_F + 0.62
    mobjs, ctop = SL.mast('cfmast', (0.0, -9.0, zf), 2.0, radar=False, yard=0.6, flag=None)
    cyl('cwind', 0.28, 0.32, (0.0, -8.0, zf), rot=(0, 90, 0), mat=flat('#B23A30', 0.5), segs=20, bevel=0.04,
        origin='center')
    SL.drift('cfore_s', (0.4, -9.3, zf), r=0.4, seed=3)
    SL.drift('cfore_s2', (-0.6, -8.6, zf), r=0.3, seed=13)
    # hatch covers (3) - slot rows
    rows = [-5.7, -1.1, 1.9]
    hatch_m = flat('#3D6E8F', 0.55)
    coam = flat('#6E8A7C', 0.6)
    for k, y in enumerate(rows):
        box('chco%d' % k, (4.5, 2.75, 0.28), (0, y, CS_F), mat=coam, bevel=0.05)
        for j in range(4):
            box('chc%d%d' % (k, j), (4.3, 0.64, 0.08), (0, y - 1.0 + 0.66 * j, CS_F + 0.28), mat=hatch_m, bevel=0.025)
    zc = CS_F + 0.36
    # crane (yellow) between hatch 1 and 2
    cy = -3.4
    yel = flat('#F2C14E', 0.45)
    cyl('ccr_ped', 0.42, 1.7, (0, cy, CS_F), mat=yel, segs=24, bevel=0.05)
    box('ccr_cab', (0.95, 0.9, 0.85), (0.35, cy + 0.05, CS_F + 1.7), mat=yel, bevel=0.1)
    SL.window('ccr_w', Vector((0.35, cy - 0.4, CS_F + 2.25)), Vector((0, -1, 0)), w=0.5, h=0.3, glow=False,
              frame=WHITE, r=0.06)
    pivot = Vector((0.0, cy - 0.2, CS_F + 2.15))
    ang = math.radians(32)
    jl = 4.6
    tip = pivot + Vector((0, -jl * math.cos(ang), jl * math.sin(ang)))
    mb = L.MB()
    for sx in (-0.13, 0.13):
        mb.seg(pivot + Vector((sx, 0, 0)), tip + Vector((sx * 0.5, 0, 0)), 0.09, yel, segs=10)
    for k in range(1, 6):
        a = pivot + (tip - pivot) * (k / 6.0)
        mb.seg(a + Vector((-0.13, 0, 0)), a + Vector((0.13, 0, 0)), 0.035, yel, segs=6)
    hook_top = tip + Vector((0, -0.12, 0))
    hook_bot = Vector((hook_top.x, hook_top.y, CS_F + 3.2))
    mb.seg(hook_top, hook_bot, 0.018, flat('#3D424C', 0.5), segs=6)
    mb.seg(pivot + Vector((0, 0.5, 0.75)), tip, 0.018, flat('#3D424C', 0.5), segs=6)
    mb.done('ccr_jib')
    cyl('ccr_tip', 0.16, 0.2, tuple(tip - Vector((0, 0, 0.1))), rot=(0, 90, 0), mat=flat('#2B2F3A', 0.5), segs=16,
        origin='center')
    box('ccr_hook', (0.18, 0.1, 0.22), tuple(hook_bot - Vector((0, 0, 0.2))), mat=flat('#D9483B', 0.5), bevel=0.04)
    PA.snow_cap('ccr_s', 0.36, (0.35, cy + 0.05, CS_F + 2.57), 0.07, 4)
    # bridge house aft (3 levels) + funnel + mast
    wall = flat(cream, 0.6)
    z1 = CS_F
    b1, b1p = SL.cabin('cbr1', 4.6, 5.4, 9.4, z1, 1.3, wall, roof=flat('#C9CDD2', 0.7), rf=0.3, rb=0.7)
    b2, b2p = SL.cabin('cbr2', 4.2, 5.7, 9.1, z1 + 1.3, 1.2, wall, roof=flat('#C9CDD2', 0.7), rf=0.3, rb=0.6)
    b3, b3p = SL.cabin('cbr3', 5.2, 5.55, 7.6, z1 + 2.5, 1.05, flat(WHITE, 0.55), roof=flat('#2E6B4F', 0.55),
                       rf=0.25, rb=0.25)
    zt = z1 + 3.55
    side_windows('cbw1', b1p, z1 + 0.95, 0.42, 0.42, 0.85, skip=lambda p: p.y > 9.0, r=0.2)
    side_windows('cbw2', b2p, z1 + 2.15, 0.42, 0.42, 0.85, skip=lambda p: p.y > 8.7, r=0.2)
    side_windows('cbw3', b3p, z1 + 3.28, 0.62, 0.55, 0.7, glow=False, skip=lambda p: p.y > 7.3, r=0.08,
                 frame=WHITE)
    SL.cabin('cbr3band', 5.32, 5.49, 7.66, zt - 0.16, 0.18, flat('#2E6B4F', 0.55), rf=0.27, rb=0.27, bevel=0.04)
    SL.pillow_snow('cbr3s', 4.7, 5.8, 7.35, zt - 0.02, rf=0.15, rb=0.15, t=0.14, seed=5)
    SL.pillow_snow('cbr2s', 3.7, 7.7, 8.85, z1 + 2.48, rf=0.1, rb=0.45, t=0.12, seed=6, drifts=2)
    fg, ftop = SL.funnel('cfun', (0.0, 8.35, z1 + 2.48), 1.0, 1.3, 1.65, '#E8873A', band=WHITE, top='#2B2F3A',
                         rake=8.0, logo=lambda nm, p, n: SL.star_logo(nm, p, n, r=0.15, col='#2E6B4F'))
    mobjs2, mtop = SL.mast('cmast', (0.0, 6.5, zt), 1.35, flag='red', flag_w=0.55)
    for s in (-1, 1):
        SL.life_ring('clr%d' % (s > 0), (s * 2.3, 6.6, z1 + 0.75), Vector((s, 0, 0)))
    SL.lifeboat('clb', (2.35, 8.3, z1 + 1.3), length=1.9, beam=0.72, seed=4)
    for (x, y) in ((-1.9, -6.9), (1.9, -6.9), (-1.9, 4.6), (1.9, 4.6), (-1.6, 9.9), (1.6, 9.9)):
        SL.bollard('cbol', (x, y, CS_F))
    # fixed deck cargo near the bridge: a few crates + barrels
    SL.crate('ccr1', (-1.4, 3.9, CS_F), s=0.62, seed=2)
    SL.crate('ccr2', (-1.35, 4.55, CS_F), s=0.55, seed=3)
    with L.Collect():
        PA.barrel_model('cbar1', loc=(1.5, 3.9, CS_F), seed=4, scale=0.85)
        PA.barrel_model('cbar2', loc=(1.1, 4.3, CS_F), seed=5, scale=0.8)
    SL.drift('cdeck_s', (0.2, 4.2, CS_F), r=0.36, seed=7)
    SL.drift('cdeck_s2', (-2.0, -0.2, CS_F), r=0.3, seed=8, scale=(1.0, 1.8, 0.36))
    # ---- container slots: 3 rows x 2 across, 2 containers high
    slots, centres = [], []
    csz = (1.18, 2.3, 1.05)
    k = 0
    for r_, y in enumerate(rows):
        for xs in (-1.06, 1.06):
            with L.Collect() as cc:
                c1 = CONT_COLS[(2 * k) % len(CONT_COLS)]
                c2 = CONT_COLS[(2 * k + 3) % len(CONT_COLS)]
                SL.container('cs%d_a' % k, (xs, y, zc), csz, c1, snow=False, seed=k)
                SL.container('cs%d_b' % k, (xs, y + 0.02, zc + csz[2] + 0.01), csz, c2, snow=True, seed=k + 9)
            slots.append(cc.objs)
            centres.append(Vector((xs, y, zc)))
            k += 1
    # ---- animated layers
    smk_base = ftop + Vector((0, 0.05, 0.05))
    with L.Collect() as cs:
        smk = SL.smoke('csmoke', smk_base, big=1.4, seed=5, drift=(0.0, 1.0), n=4, rise=1.7)
    with L.Collect() as cf:
        foam = SL.Foam('cfoam', H, n=8, length=0.36, spread=0.8, r0=0.22, r1=0.46, seed=4, splash=3)
    stern = Vector((0.0, CS_L / 2 + 0.1, 0.0))
    bow = Vector((0.0, -CS_L / 2 + 0.2, 0.0))
    B = {'group': g, 'layers': {'smoke': cs.objs, 'foam': cf.objs}, 'smoke': smk, 'foam': foam,
         'slots': slots, 'slot_centres': centres, 'pose': layered_pose,
         'points': {'smoke': smk_base, 'stern': stern, 'bow': bow, 'cargo': centres,
                    'crane': hook_bot, 'horn': ftop - Vector((0, 0.6, 0.4)),
                    'perch': [mtop, ctop, tip + Vector((0, 0, 0.18)), Vector((0.35, cy + 0.05, CS_F + 2.62))],
                    'lights': {'mast': mtop, 'foremast': ctop}}}
    return B


# =========================================================================== TRAWLER (big)

TR_L, TR_W, TR_F = 14.0, 4.6, 1.6
NET_FILL, NET_ROPE = '#2F6B4A', '#8FD18A'


def crew_pose_stand(rig, i=0, yaw=0.0, face='face_normal', wave=None):
    """Standing crew pose (char_anim idle) turned by yaw (deg, 0 = facing the bow)."""
    import char_anim as CA
    p = CA.pose_for('human', 'idle', i % 4, 4, 'fisherman')
    p['root'] = (0, 0, yaw)
    p['_show'] = {face}
    rig.apply(p, yaw_deg=0.0)
    bpy.context.view_layer.update()
    if wave is not None:
        rig.solve_arm('L', tuple(Vector((0.18, -0.05, 0.42 + 0.05 * wave))), (1.0, 0.0, -0.4))


@ship('trawler_big', 'layered',
      dict(LAYERED_ANIMS, haul={'frames': 6, 'fps': 6, 'repeat': -1, 'layers': ['smoke', 'haul'],
                                'dirs': ['NE']}),
      length=TR_L, beam=TR_W, samples=24,
      notes='Deep-sea stern trawler (~14 m): blue hull with a high white bow, white wheelhouse with blue windows and a '
            'red snowy roof forward, yellow outrigger booms in a V, yellow funnel, fish boxes on deck, a green net '
            'wound on the drum and an orange A-frame over the stern ramp, a fisherman on deck. haul = the bulging net '
            'bag coming up out of the water under the A-frame (drum turning, two crew pulling, water dripping); '
            'haul is rendered for NE only (stern toward the camera; NW = mirror) - turn the trawler to NE / NW '
            'before hauling.')
def b_trawler_big():
    import bld_assets as BA
    g = new_group()
    H = Hull(TR_L, TR_W, TR_F, rake=0.8, stern_over=0.08, pb=1.8, qb=1.5, ps=9.0, qs=7.0)
    hm = SL.band_mat('trawl_hull', [(-1.0, '#C8463D'), (0.3, '#3D7CC9'), (1.25, WHITE)], rough=0.45)
    H.build('thull', hm, deck_mat())
    t_ramp = 0.975
    H.bulwark('tbulw', lambda t: 0.55 + 0.85 * sm(-0.5, -0.98, t), hm, flat(WHITE, 0.55), flat('#3D7CC9', 0.5),
              thick=0.11, gap=[(t_ramp, 1.0, None)])
    for side in (-1.0, 1.0):
        a, n = H.side_point(-0.8, 1.2, side, out=0.01)
        SL.anchor_on('tanc%d' % (side > 0), a, n, s=0.5)
        for k, t in enumerate((-0.45, -0.3)):
            p, n = H.side_point(t, 1.45, side)
            SL.porthole('tph%d%d' % (side > 0, k), p, n, r=0.12)
    # stern ramp: dark ridged slipway plate on the aft deck + an orange stern roller in the bulwark gap
    box('tramp', (1.5, 1.45, 0.05), (0, TR_L / 2 - 0.72, TR_F - 0.01), mat=L.stripes('#5A6470', '#48505B', 5.0, 'Y',
                                                                                     soft=0.06), bevel=0.02)
    cyl('troller', 0.13, 1.5, (0, TR_L / 2 - 0.02, TR_F + 0.05), rot=(0, 90, 0), mat=flat('#E8873A', 0.45), segs=18,
        origin='center', bevel=0.02)
    # deck clutter on the working deck: hatch + rope coil
    box('thatch', (1.1, 0.8, 0.14), (0.35, 2.15, TR_F), mat=flat('#3D7CC9', 0.5), bevel=0.04)
    SL.torus_coil('tcoil', (-1.25, 4.7, TR_F), r=0.26)
    # wheelhouse (forward)
    white = flat(WHITE, 0.55)
    w1, w1p = SL.cabin('twh1', 3.2, -3.4, -0.5, TR_F, 1.3, white, roof=flat('#D3DBE4', 0.7), rf=0.8, rb=0.25)
    side_windows('twh1w', w1p, TR_F + 0.95, 0.36, 0.36, 0.8, skip=lambda p: p.y > -0.7, r=0.17)
    z2 = TR_F + 1.3
    w2, w2p = SL.cabin('twh2', 2.9, -3.2, -0.9, z2, 1.15, white, roof=flat('#D9483B', 0.55), rf=0.75, rb=0.2)
    side_windows('twh2w', w2p, z2 + 0.92, 0.48, 0.55, 0.58, glow=False, skip=lambda p: p.y > -1.0, r=0.08,
                 frame=WHITE)
    zt = z2 + 1.15
    SL.cabin('twh2band', 3.0, -3.25, -0.85, zt - 0.16, 0.18, flat('#D9483B', 0.55), rf=0.77, rb=0.22, bevel=0.04)
    SL.pillow_snow('twhsnow', 2.45, -3.0, -1.1, zt - 0.02, rf=0.6, rb=0.12, t=0.13, seed=4, drifts=2)
    SL.panel('twhdoor', (-1.6, -1.2, TR_F + 0.62), Vector((-1, 0, 0)), 0.6, 1.15, 0.12, 0.05, flat('#3D7CC9', 0.5))
    SL.life_ring('tlr', (1.62, -1.5, TR_F + 0.7), Vector((1, 0, 0)))
    mobjs, mtop = SL.mast('tmast', (0.0, -1.9, zt), 1.9, flag='red', flag_w=0.55, r=0.09, yard=1.0)
    # outrigger booms in a V (yellow) with stabiliser 'birds'
    yel = flat('#F2C14E', 0.45)
    mb = L.MB()
    tips = []
    for s in (-1, 1):
        base = Vector((s * 1.45, -0.35, TR_F + 0.2))
        tip = Vector((s * 2.55, -0.55, TR_F + 4.9))
        tips.append(tip)
        mb.seg(base, tip, 0.075, yel, segs=10, r2=0.05)
        mb.seg(tip, Vector((0, -1.9, zt + 1.2)), 0.012, flat('#D9C39A', 0.8), segs=5)
        mb.seg(tip, tip - Vector((0, 0, 1.0)), 0.012, flat('#D9C39A', 0.8), segs=5)
        mb.cone(0.0, 0.12, 0.36, flat('#D9483B', 0.5), loc=tuple(tip - Vector((0, 0, 1.18))), segs=12)
        mb.cube((0.5, 0.04, 0.16), flat('#D9483B', 0.5), loc=tuple(tip - Vector((0, 0, 1.12))))
    mb.done('tbooms')
    # funnel + fish boxes + net drum + A-frame
    fg, ftop = SL.funnel('tfun', (0.0, 0.75, TR_F), 0.72, 0.92, 2.55, '#F2C14E', band='#3D7CC9', top='#2B2F3A',
                         rake=6.0)
    blue = flat('#3D8BE0', 0.45)
    for k, (x, y, z) in enumerate(((-1.35, 1.0, 0), (-1.35, 1.55, 0), (-1.35, 1.0, 1), (1.4, 1.2, 0),
                                   (1.4, 1.75, 0))):
        zz = TR_F + z * 0.36
        box('tfb%d' % k, (0.62, 0.48, 0.34), (x, y, zz), mat=blue, bevel=0.05)
        if z == 1 or (x > 0 and y > 1.5):
            box('tice%d' % k, (0.5, 0.36, 0.06), (x, y, zz + 0.31), mat=flat('#E9EFF7', 0.4), bevel=0.02)
            PA.fish_model('tfbf%d' % k, loc=(x, y, zz + 0.37), rot=(0, 0, 30 + 40 * k), scale=0.42)
    dy = 3.3
    orange = flat('#E8873A', 0.45)
    net_m = BA.net_mat(rope=NET_ROPE, fill=NET_FILL, cells=9.0)
    drum_z = TR_F + 0.75
    for s in (-1, 1):
        box('tdst%d' % s, (0.16, 0.5, 0.75), (s * 1.38, dy, TR_F), mat=orange, bevel=0.04)
        cyl('tdfl%d' % s, 0.66, 0.08, (s * 1.27, dy, drum_z), rot=(0, 90, 0), mat=orange, segs=28, bevel=0.02,
            origin='center')
    cyl('tdrum', 0.52, 2.45, (0, dy, drum_z), rot=(0, 90, 0), mat=net_m, segs=28, bevel=0.05, origin='center')
    ay = TR_L / 2 - 0.7
    atop = TR_F + 3.5
    mb = L.MB()
    for s in (-1, 1):
        mb.seg(Vector((s * 1.75, ay - 0.4, TR_F)), Vector((s * 1.55, ay + 0.15, atop)), 0.12, orange, segs=12)
        mb.sphere(0.16, orange, loc=(s * 1.55, ay + 0.15, atop), segs=12, rings=8)
    mb.seg(Vector((-1.55, ay + 0.15, atop)), Vector((1.55, ay + 0.15, atop)), 0.13, orange, segs=12)
    mb.done('taframe')
    block = Vector((0.0, ay + 0.35, atop - 0.25))
    cyl('tblock', 0.16, 0.14, tuple(block), rot=(0, 90, 0), mat=flat('#3D424C', 0.5), segs=16, origin='center')
    for s in (-1, 1):
        d = cyl('tdoor%d' % s, 0.45, 0.07, (s * 1.98, ay - 0.15, TR_F + 0.9), rot=(0, 90, 0),
                mat=flat('#D9483B', 0.5), segs=24, bevel=0.02, origin='center')
        d.scale = (1.0, 1.0, 1.45)
        sphere('tal%d' % s, 0.07, (s * 1.55, ay + 0.15, atop + 0.2), light_mat_safe('#FFE07A'), segs=10, rings=6)
    for (x, y) in ((-1.5, -4.6), (1.5, -4.6), (-1.6, 5.0), (1.6, 5.0)):
        SL.bollard('tbol', (x, y, TR_F))
    SL.drift('tfore_s', (0.4, -5.3, TR_F), r=0.36, seed=3)
    SL.drift('tfore_s2', (-0.7, -4.9, TR_F), r=0.26, seed=4)
    SL.drift('taft_s', (1.5, 4.4, TR_F), r=0.28, seed=5)
    # deck fisherman (base, static) by the fish boxes
    fis = BB.crew_rig('fisherman')
    fis.j['root'].parent = g
    fis.rest_loc['root'] = Vector((-0.45, 1.75, TR_F))
    crew_pose_stand(fis, 0, yaw=-100.0, face='face_smile')
    # ---- animated layers
    smk_base = ftop + Vector((0, 0.05, 0.05))
    with L.Collect() as cs:
        smk = SL.smoke('tsmoke', smk_base, big=1.1, seed=7, drift=(0.0, 0.9), n=4, rise=1.7)
    with L.Collect() as cf:
        foam = SL.Foam('tfoam', H, n=7, length=0.4, spread=0.6, r0=0.17, r1=0.36, seed=6, splash=3)
    with L.Collect() as ch:
        hb = build_haul(dy, drum_z, block, net_m, g)
    B = {'group': g, 'layers': {'smoke': cs.objs, 'foam': cf.objs, 'haul': ch.objs}, 'smoke': smk, 'foam': foam,
         'pose': layered_pose, 'haul': hb, 'haul_pose': haul_pose, 'rigs': [fis] + hb['rigs']}
    stern = Vector((0.0, TR_L / 2 + 0.1, 0.0))
    bow = Vector((0.0, -TR_L / 2 + 0.15, 0.0))
    B['points'] = {'smoke': smk_base, 'stern': stern, 'bow': bow, 'net': Vector((0.0, ay + 0.9, 0.6)),
                   'horn': ftop - Vector((0, 0.4, 0.5)),
                   'perch': [mtop, tips[0] + Vector((0, 0, 0.1)), tips[1] + Vector((0, 0, 0.1)),
                             Vector((-1.55, ay + 0.15, atop + 0.18)), Vector((1.55, ay + 0.15, atop + 0.18))],
                   'lights': {'mast': mtop, 'aframe': Vector((0, ay + 0.15, atop + 0.2))}}
    return B


def light_mat_safe(col):
    return SL.light_mat(col, 2.5)


def build_haul(dy, drum_z, block, net_m, g):
    """Haul gear (only visible in the haul overlay): drum wound fatter, the net band from the drum down the ramp to the
    bag, the bag of fish on its lifting wire, drips, splash, two pulling crew."""
    H = {}
    H['drum'] = cyl('thdrum', 0.6, 2.4, (0, dy, drum_z), rot=(0, 90, 0), mat=net_m, segs=28, bevel=0.06,
                    origin='center')
    # bag (codend) under the block, fish poking out
    with L.Collect() as cb:
        blob('thbag', 0.62, (0, 0, 0), net_m, scale=(1.05, 1.0, 1.15), seed=9, amp=0.16, subdiv=3)
        for k, (x, y, z, rz) in enumerate(((0.35, -0.3, 0.2, 30), (-0.3, -0.35, 0.35, 150), (0.1, -0.45, -0.1, 80),
                                           (-0.42, -0.1, -0.2, 200), (0.45, 0.1, -0.3, 260), (-0.1, 0.4, 0.3, 120))):
            v = Vector((x, y, z)).normalized() * 0.66
            PA.fish_model('thf%d' % k, loc=tuple(v), rot=(70 + 10 * k, 0, rz), scale=0.5)
        cyl('thknot', 0.12, 0.25, (0, 0, 0.62), mat=flat(NET_ROPE, 0.8), segs=12)
    bag = L.group([o for o in cb.objs if o.parent is None], 'thbagg')
    H['bag'] = bag
    H['wire'] = cyl('thwire', 0.022, 1.0, (0, 0, 0), mat=flat('#3D424C', 0.5), segs=8, bevel=0.0)
    H['band'] = L.tube('thband', [(0, dy, drum_z + 0.6), (0, dy + 1.2, 1.8), (0, dy + 2.6, 1.3), (0, dy + 3.6, 0.9),
                                  (0, dy + 4.2, 0.9)], 0.15, net_m)
    H['band'].data.bevel_resolution = 3
    H['block'] = block
    drops = []
    for k in range(5):
        drops.append(sphere('thdrop%d' % k, 0.05, (0, 0, 0), SL.foam_mat('thdm%d' % k, 0.9), scale=(0.8, 0.8, 1.3),
                            segs=10, rings=6))
    H['drops'] = drops
    splash = []
    for k in range(6):
        m = SL.foam_mat('thsm%d' % k)
        o = blob('thspl%d' % k, 1.0, (0, 0, 0), m, seed=40 + k, amp=0.3, subdiv=2)
        o.visible_shadow = False
        splash.append((o, m))
    H['splash'] = splash
    rigs = []
    for s in (-1, 1):
        r = BB.crew_rig('fisherman', spec_over={'coat': '#E8B83A', 'coat_desc': ('knit', '#E8B83A', '#C4962A')} if s > 0 else None)
        r.j['root'].parent = g
        r.rest_loc['root'] = Vector((s * 0.8, dy + 1.25, TR_F))
        rigs.append(r)
    H['rigs'] = rigs
    return H


def haul_pose(B, i, n):
    H = B['haul']
    g = B['group']
    ph = math.tau * i / float(n)
    ay = TR_L / 2 - 0.7
    bz = 0.45 + 0.8 * math.sin(ph - math.pi / 2)            # -0.35 (dipping) .. 1.25 (lifted)
    by = ay + 1.05 + 0.12 * math.sin(ph)
    H['bag'].location = (0.0, by, bz)
    H['bag'].rotation_euler = Euler((math.radians(6 * math.sin(ph + 1.0)), math.radians(5 * math.cos(ph)), 0), 'XYZ')
    top = Vector((0.0, by, bz + 0.72))
    blk = H['block']
    w = H['wire']
    d = blk - top
    w.location = top
    w.rotation_euler = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_euler()
    w.scale = (1, 1, d.length)
    H['drum'].rotation_mode = 'ZYX'                 # spin about the drum's own axis first, then lay it along X
    H['drum'].rotation_euler = (0.0, math.radians(90), math.radians(-25.0 * i))
    sp = H['band'].data.splines[0]
    dy = 3.3
    pts = [Vector((0, dy, TR_F + 0.75 + 0.6)), Vector((0.0, dy + 1.1, TR_F + 0.35)),
           Vector((0.0, dy + 2.4, TR_F + 0.05)), Vector((0.0, by - 0.35, max(0.25, bz + 0.45))),
           Vector((0.0, by - 0.05, bz + 0.6))]
    for k, p in enumerate(pts):
        sp.points[k].co = (p.x, p.y, p.z, 1.0)
    for k, o in enumerate(H['drops']):
        u = ((k + i / float(n)) / len(H['drops'])) % 1.0
        o.location = (0.25 * math.sin(k * 2.3), by - 0.2 + 0.2 * math.cos(k * 1.7), bz - 0.55 - 1.3 * u)
        o.hide_render = o.hide_viewport = (bz - 0.55 - 1.3 * u) < 0.02
    low = max(0.0, 1.0 - (bz + 0.35) / 0.9)                   # 1 when the bag dips
    for k, (o, m) in enumerate(H['splash']):
        a = math.tau * k / len(H['splash']) + ph * 0.3
        r = 0.62 + 0.2 * low
        o.location = (r * math.cos(a), by + 0.6 * r * math.sin(a), 0.02 + 0.05 * low)
        s = 0.07 + 0.11 * low
        o.scale = (s * 1.4, s * 1.4, s * (0.35 + 0.45 * low))
        o.hide_render = o.hide_viewport = low < 0.05
        L.set_alpha(m, 1.0)
    lean = 10.0 + 8.0 * math.sin(ph)
    for s, r in zip((-1, 1), H['rigs']):
        p = {'root': (0, 0, 180.0 + s * 20.0), 'spine': (-lean, 0, 0), 'chest': (-lean * 0.3, 0, 0),
             'head': (lean * 0.5 - 6, 0, 0), 'hip_R': (-10, 3, 0), 'hip_L': (16, 3, 0), 'knee_R': (8, 0, 0),
             'knee_L': (18, 0, 0), '_show': {'face_happy'} if i in (2, 3) else {'face_normal'}}
        r.apply(p, yaw_deg=0.0)
        bpy.context.view_layer.update()
        inv = r.j['chest'].matrix_world.inverted()
        bp = H['band'].matrix_world @ Vector(pts[1] + (pts[2] - pts[1]) * 0.35)
        bp2 = H['band'].matrix_world @ Vector(pts[1] + (pts[2] - pts[1]) * 0.6)
        r.solve_arm('R', tuple(inv @ (bp + Vector((0, 0, 0.12)))), (-0.8, 0.3, -0.7))
        r.solve_arm('L', tuple(inv @ (bp2 + Vector((0, 0, 0.1)))), (0.8, 0.3, -0.7))
    bpy.context.view_layer.update()


# =========================================================================== small boats (full frames)

SMALL_ANIMS = {'idle': {'frames': 2, 'fps': 3, 'repeat': -1}, 'move': {'frames': 4, 'fps': 7, 'repeat': -1}}


def bob(B, anim, i, n, amp=(0.02, 0.03), pitch=(0.8, 2.0), roll=(1.0, 1.2), heel=0.0, trim=0.0):
    g = B['group']
    if anim == 'idle':
        s = 1 if i else -1
        g.location.z = amp[0] * s
        g.rotation_euler.x = math.radians(pitch[0] * s)
        g.rotation_euler.y = math.radians(roll[0] * -s + heel * 0.3)
    else:
        t = math.tau * i / float(n)
        g.location.z = amp[1] * math.sin(t)
        g.rotation_euler.x = math.radians(pitch[1] * math.cos(t) - trim)
        g.rotation_euler.y = math.radians(roll[1] * math.sin(t) + heel)


def sit_pose(rig, yaw=0.0, face='face_normal', lean=0.0):
    p = {'hips@': (0, 0.10, 0.065 - 0.338), 'hip_R': (82, 6, 0), 'hip_L': (82, 6, 0), 'knee_R': (70, 0, 0),
         'knee_L': (70, 0, 0), 'spine': (-lean, 0, 0), 'root': (0, 0, yaw), '_show': {face}}
    rig.apply(p, yaw_deg=0.0)
    bpy.context.view_layer.update()


TG_L, TG_W, TG_F = 6.2, 3.0, 1.0


@ship('tugboat', 'full', dict(SMALL_ANIMS), length=TG_L, beam=TG_W, samples=26,
      notes='Small fat tugboat (~6 m): red hull with a black rubber fender band, tyre fenders and a big black bow '
            'fender, white two-storey wheelhouse with blue windows and a snowy navy roof, black funnel with a red band '
            'and a white star, tow bitt + rope coil aft, the bearded captain on the aft deck (waves in idle). '
            'idle 2f / move 4f (smoke, bow foam, pitching).')
def b_tugboat():
    g = new_group()
    H = Hull(TG_L, TG_W, TG_F, rake=0.25, stern_over=0.06, pb=2.3, qb=1.9, ps=4.0, qs=3.0, draft=0.5, M=36)
    hm = SL.band_mat('tug_hull', [(-1.0, '#2B2F3A'), (0.24, '#D9483B'), (0.86, WHITE)], rough=0.45)
    H.build('ghull', hm, flat('#8E9AA6', 0.7))
    H.bulwark('gbulw', lambda t: 0.3 + 0.25 * sm(-0.5, -0.98, t), hm, flat(WHITE, 0.55), flat('#2B2F3A', 0.5),
              thick=0.09)
    ring = H.ring(0.72)
    L.tube('gfender', [(x * 1.03, y * 1.01, 0.72) for (x, y) in ring] + [(ring[0][0] * 1.03, ring[0][1] * 1.01, 0.72)],
           0.1, flat('#2A2C31', 0.75))
    blob('gnose', 0.42, (0, -TG_L / 2 - 0.12, 0.66), flat('#2A2C31', 0.75), scale=(1.15, 0.6, 0.72), seed=2, amp=0.05)
    rope = flat('#D9C39A', 0.85)
    for side in (-1.0, 1.0):
        for k, t in enumerate((-0.32, 0.1, 0.5)):
            p, n = H.side_point(t, 0.42, side, out=0.14)
            SL.tyre('gtyre%d%d' % (side > 0, k), p, n, r=0.2, rr=0.08)
            top, _ = H.side_point(t, TG_F + 0.3, side, out=0.02)
            mb = L.MB()
            mb.seg(p + Vector((0, 0, 0.27)), top, 0.016, rope, segs=5)
            mb.done('gtr%d%d' % (side > 0, k))
    white = flat(WHITE, 0.55)
    c1, c1p = SL.cabin('gwh1', 1.9, -1.55, 0.45, TG_F, 0.95, white, roof=flat('#D3DBE4', 0.7), rf=0.55, rb=0.3)
    side_windows('gwh1w', c1p, TG_F + 0.68, 0.3, 0.3, 0.62, skip=lambda p: p.y > 0.25, r=0.14)
    z2 = TG_F + 0.95
    c2, c2p = SL.cabin('gwh2', 2.15, -1.45, 0.2, z2, 0.92, white, roof=flat(NAVY, 0.5), rf=0.55, rb=0.25)
    side_windows('gwh2w', c2p, z2 + 0.72, 0.4, 0.46, 0.5, glow=False, skip=lambda p: p.y > 0.05, r=0.07, frame=NAVY)
    zt = z2 + 0.92
    SL.cabin('gwh2band', 2.25, -1.5, 0.25, zt - 0.15, 0.17, flat(NAVY, 0.5), rf=0.57, rb=0.27, bevel=0.04)
    SL.pillow_snow('gsnow', 1.75, -1.25, 0.0, zt - 0.02, rf=0.4, rb=0.12, t=0.12, seed=3, drifts=1)
    cyl('gsearch', 0.13, 0.22, (0.45, -0.95, zt + 0.06), rot=(80, 0, 0), mat=flat('#3D424C', 0.5), segs=16,
        origin='center')
    SL.disc('gsearchl', Vector((0.45, -1.07, zt + 0.08)), Vector((0, -1, 0)), 0.1, 0.03, SL.light_mat('#FFF4D0', 2.5))
    mobjs, mtop = SL.mast('gmast', (-0.2, -0.3, zt), 0.95, flag='red', flag_w=0.42, r=0.06, yard=0.55, radar=False)
    fg, ftop = SL.funnel('gfun', (0.0, 1.0, TG_F), 0.8, 0.98, 1.75, '#2B2F3A', band='#D9483B', top='#1E2026', rake=7.0,
                         band_z=(0.5, 0.74), logo=lambda nm, p, n: SL.star_logo(nm, p, n, r=0.13, col=WHITE))
    for s in (-1, 1):
        cyl('gbitt%d' % s, 0.1, 0.42, (s * 0.28, 2.3, TG_F), mat=flat('#2B2F3A', 0.45), segs=14, bevel=0.02)
    cyl('gbittx', 0.06, 0.62, (0, 2.3, TG_F + 0.3), rot=(0, 90, 0), mat=flat('#2B2F3A', 0.45), segs=12,
        origin='center')
    SL.torus_coil('gcoil', (0.7, 2.25, TG_F), r=0.24)
    SL.life_ring('glr', (-0.97, -0.6, TG_F + 0.55), Vector((-1, 0, 0)), r=0.17, rr=0.045)
    SL.drift('gsn1', (0.75, -2.15, TG_F), r=0.24, seed=4)
    SL.drift('gsn2', (-0.9, 2.5, TG_F), r=0.2, seed=5)
    cap = BB.crew_rig('fisherman', spec_over={'coat': '#2B3A5C', 'coat_rough': 0.7, 'pants': '#2E3440',
                                              'boots': '#2A2A30', 'mitten': '#F4F1EA', 'coat_desc': None},
                      dress=BB.dress_captain)
    cap.j['root'].parent = g
    cap.rest_loc['root'] = Vector((-0.72, 1.55, TG_F))
    smk_base = ftop + Vector((0, 0.04, 0.04))
    smk = SL.smoke('gsmoke', smk_base, big=0.75, seed=9, drift=(0.0, 0.9), n=3, rise=1.6)
    foam = SL.Foam('gfoam', H, n=6, length=0.5, spread=0.45, r0=0.12, r1=0.27, seed=3, splash=2)

    def pose(B, anim, i, n):
        bob(B, anim, i, n, amp=(0.02, 0.035), pitch=(0.8, 2.4), roll=(1.0, 1.4))
        if anim == 'idle':
            smk.set(i, 2)
            foam.show(False)
            crew_pose_stand(cap, i, yaw=-95.0, face='face_smile', wave=i)
        else:
            smk.set(i, n)
            foam.set(i, n)
            crew_pose_stand(cap, i, yaw=-55.0, face='face_smile' if i in (1, 2) else 'face_normal')
        bpy.context.view_layer.update()

    return {'group': g, 'pose': pose, 'rigs': [cap],
            'points': {'smoke': smk_base, 'stern': Vector((0, TG_L / 2 + 0.05, 0)),
                       'bow': Vector((0, -TG_L / 2 - 0.1, 0)), 'tow': Vector((0, 2.3, TG_F + 0.4)),
                       'horn': ftop - Vector((0, 0.3, 0.3)), 'perch': [mtop, ftop + Vector((0, 0, 0.02))],
                       'lights': {'mast': mtop, 'search': Vector((0.45, -1.1, zt + 0.08))}}}


SB_L, SB_W, SB_F = 5.6, 2.0, 0.75


@ship('sailboat', 'full', dict(SMALL_ANIMS, move={'frames': 4, 'fps': 6, 'repeat': -1}), length=SB_L, beam=SB_W,
      samples=26,
      notes='Tourist sailboat (~5.6 m): white hull with a red stripe, wooden deck, small cabin, a big red-and-cream '
            'striped mainsail + a sky-blue jib, a skipper at the tiller and a waving tourist. idle = sails luffing, '
            'boom amidships; move = sails filled, heeled away from the camera, bow foam.')
def b_sailboat():
    g = new_group()
    H = Hull(SB_L, SB_W, SB_F, rake=0.4, stern_over=0.18, pb=1.55, qb=1.2, ps=6.0, qs=4.0, draft=0.4, M=36)
    hm = SL.band_mat('sail_hull', [(-1.0, NAVY), (0.15, WHITE), (0.42, '#D9483B'), (0.53, WHITE)], rough=0.4)
    H.build('shull', hm, deck_mat())
    H.bulwark('sbulw', lambda t: 0.1 + 0.08 * sm(-0.6, -0.98, t), hm, flat(WHITE, 0.55), flat('#C98F55', 0.6),
              thick=0.06)
    white = flat(WHITE, 0.55)
    cb, cbp = SL.cabin('scab', 1.15, -1.55, 0.1, SB_F, 0.36, white, roof=deck_mat(), rf=0.45, rb=0.12, bevel=0.05)
    for s in (-1, 1):
        for k, y in enumerate((-1.0, -0.45)):
            SL.porthole('sph%d%d' % (s > 0, k), Vector((s * 0.575, y, SB_F + 0.19)), Vector((s, 0, 0)), r=0.07)
    wood = flat('#C98F55', 0.6)
    for s in (-1, 1):
        box('sbench%d' % s, (0.3, 1.55, 0.26), (s * 0.58, 1.25, SB_F), mat=wood, bevel=0.04)
    box('sfloor', (0.8, 1.6, 0.04), (0, 1.25, SB_F), mat=flat('#9A6A3C', 0.7), bevel=0.01)
    mb = L.MB()
    mb.seg(Vector((0, 2.75, SB_F + 0.3)), Vector((0, 1.95, SB_F + 0.42)), 0.035, wood, segs=8)
    mb.seg(Vector((0, 2.75, SB_F + 0.3)), Vector((0, 2.85, SB_F - 0.05)), 0.05, wood, segs=8)
    mb.done('stiller')
    cyl('sstaff', 0.025, 0.9, (0.0, 2.9, SB_F), mat=flat('#DDE3EA', 0.3, 0.6), segs=8)
    SL.flag_on('sflag', (0.0, 2.92, SB_F + 0.88), 0.36, 0.22, 'red', seed=4, emblem=False)
    mast_y = -0.55
    mast_top = SB_F + 5.55
    alu = flat('#DDE3EA', 0.3, 0.5)
    cyl('smast', 0.06, mast_top - SB_F, (0, mast_y, SB_F), mat=alu, segs=12, r_top=0.045)
    box('sspreader', (1.0, 0.05, 0.05), (0, mast_y, SB_F + 3.3), mat=alu, bevel=0.02)
    sphere('smlight', 0.06, (0, mast_y, mast_top + 0.04), SL.light_mat('#FFF4D0', 2.5), segs=10, rings=6)
    pen = SL.flag_on('spen', (0.0, mast_y, mast_top), 0.42, 0.14, 'blue', seed=6, emblem=False)
    mbs = L.MB()
    for s in (-1, 1):
        mbs.seg(Vector((0, mast_y, mast_top - 0.1)), Vector((s * 0.75, mast_y + 0.3, SB_F + 0.1)), 0.008,
                flat('#9AA3AE', 0.5), segs=4)
    mbs.seg(Vector((0, mast_y, mast_top - 0.1)), Vector((0, -SB_L / 2 - 0.1, SB_F + 0.25)), 0.008,
            flat('#9AA3AE', 0.5), segs=4)
    mbs.seg(Vector((0, mast_y, mast_top - 0.1)), Vector((0, SB_L / 2 + 0.1, SB_F + 0.25)), 0.008,
            flat('#9AA3AE', 0.5), segs=4)
    mbs.done('sstays')
    # boom + mainsail in a pivot group (swings), jib separately
    piv = Vector((0, mast_y + 0.06, SB_F + 0.8))
    boom = cyl('sboom', 0.05, 2.75, (0, 0, 0), rot=(-90, 0, 0), mat=flat('#C98F55', 0.55), segs=12)
    bg = L.group([boom], 'sboomg', loc=tuple(piv))
    main_m = L.stripes('#FFF8EC', '#D9483B', 1.15, 'Z', rough=0.75, soft=0.01)
    main = SL.Sail('smain', main_m, nu=10, nv=14)
    main.ob.parent = bg
    jib = SL.Sail('sjib', flat('#7EC3EA', 0.75), nu=8, nv=10)
    skip = BB.crew_rig('villager_c')
    skip.j['root'].parent = g
    skip.rest_loc['root'] = Vector((0.55, 2.0, SB_F + 0.26))
    tour = BB.crew_rig('villager_a')
    tour.j['root'].parent = g
    tour.rest_loc['root'] = Vector((-0.58, 1.0, SB_F + 0.26))
    foam = SL.Foam('sfoam', H, n=6, length=0.45, spread=0.4, r0=0.1, r1=0.22, seed=5, splash=2)

    def pose(B, anim, i, n):
        mov = anim == 'move'
        bob(B, anim, i, n, amp=(0.02, 0.03), pitch=(0.8, 1.6), roll=(1.4, 1.2), heel=7.0 if mov else 0.0)
        side = 1.0
        swing = 24.0 if mov else 4.0 * (1 if i else -1)
        bg.rotation_euler = (0.0, 0.0, math.radians(-swing))
        # mainsail in the boom frame: luff along +z at y = 0, foot along the boom (+y)
        if mov:
            main.shape((0, 0.0, 0.08), (0, 0.0, 5.05), (0, 2.6, 0.12), camber=0.42, side=side,
                       flutter=0.02, phase=i * 1.6)
            jib.shape((0, -SB_L / 2 - 0.05, SB_F + 0.22), (0, mast_y - 0.08, SB_F + 4.4),
                      (0.75, mast_y + 0.25, SB_F + 0.55), camber=0.38, side=-side, flutter=0.015, phase=i)
            foam.set(i, n)
        else:
            main.shape((0, 0.0, 0.08), (0, 0.0, 5.05), (0, 2.6, 0.12), camber=0.08, side=side,
                       flutter=0.12, phase=i * 3.0)
            jib.shape((0, -SB_L / 2 - 0.05, SB_F + 0.22), (0, mast_y - 0.08, SB_F + 4.4),
                      (0.15, mast_y + 0.3, SB_F + 0.55), camber=0.06, side=-side, flutter=0.1, phase=i * 2.0)
            foam.show(False)
        pen.rotation_euler.z = math.radians(90 + (8 * (1 if i % 2 else -1)))
        sit_pose(skip, yaw=0.0, face='face_smile' if mov else 'face_normal')
        inv = skip.j['chest'].matrix_world.inverted()
        bpy.context.view_layer.update()
        tiller = B['group'].matrix_world @ Vector((0, 2.0, SB_F + 0.42))
        skip.solve_arm('R', tuple(inv @ tiller), (-0.8, 0.3, -0.7))
        sit_pose(tour, yaw=-70.0, face='face_happy' if (i % 2 == 0) else 'face_smile')
        if not mov or i % 2 == 0:
            tour.solve_arm('L', tuple(Vector((0.2, -0.05, 0.45 + 0.06 * (i % 2)))), (1.0, 0.0, -0.4))
        bpy.context.view_layer.update()

    return {'group': g, 'pose': pose, 'rigs': [skip, tour],
            'points': {'stern': Vector((0, SB_L / 2 + 0.1, 0)), 'bow': Vector((0, -SB_L / 2 - 0.05, 0)),
                       'perch': [Vector((0, mast_y, mast_top + 0.1)), Vector((0, -SB_L / 2 - 0.2, SB_F + 0.2))],
                       'lights': {'mast': Vector((0, mast_y, mast_top + 0.05))}}}


YT_L, YT_W, YT_F = 7.2, 2.6, 1.05


@ship('yacht', 'full', dict(SMALL_ANIMS, move={'frames': 4, 'fps': 8, 'repeat': -1}), length=YT_L, beam=YT_W,
      samples=26,
      notes='Small white motor yacht (~7 m): sleek white hull with a navy pinstripe, teak decks, dark tinted windows, '
            'a flybridge under a radar arch, chrome bow rail, swim platform, two tourists on the aft deck (one '
            'waving). idle 2f bobbing, move 4f planing (bow up, big bow foam + stern wash).')
def b_yacht():
    g = new_group()
    H = Hull(YT_L, YT_W, YT_F, rake=0.75, stern_over=0.0, pb=1.45, qb=1.15, ps=10.0, qs=8.0, draft=0.5, M=40)
    hm = SL.band_mat('yacht_hull', [(-1.0, NAVY), (0.2, WHITE), (0.6, NAVY), (0.68, WHITE)], rough=0.3)
    teak = L.stripes('#C99A62', '#A97C48', 6.0, 'X', rough=0.7, soft=0.05)
    H.build('yhull', hm, teak)
    H.bulwark('ybulw', lambda t: 0.12, hm, flat(WHITE, 0.5), flat(WHITE, 0.4), thick=0.07)
    white = flat(WHITE, 0.45)
    chrome = '#E3E8EE'
    rp = [(x * 0.94, y) for (x, y) in H.deck_outline(inset=0.08) if y < -1.0]
    SL.railing('ybowrail', rp, YT_F + 0.1, h=0.42, col=chrome, step=0.5, r=0.025, mid=False)
    cab, cabp = SL.cabin('ycab', 2.1, -1.9, 1.25, YT_F, 0.82, white, roof=white, rf=1.0, rb=0.2)
    dg = SL.dark_glass()
    for s in (-1, 1):
        SL.panel('ywin%d' % s, (s * 1.05, -0.35, YT_F + 0.5), Vector((s, 0, 0)), 2.0, 0.3, 0.12, 0.03, dg)
    for k, (p, nrm) in enumerate(SL.points_along(cabp, 0.42, skip=lambda p: p.y > -1.15)):
        SL.panel('ywsc%d' % k, (p.x, p.y, YT_F + 0.55), nrm, 0.36, 0.34, 0.06, 0.03, dg)
    zf = YT_F + 0.82
    fl, flp = SL.cabin('yfly', 1.7, -0.8, 1.1, zf, 0.32, white, roof=teak, rf=0.6, rb=0.12, bevel=0.04)
    SL.panel('yflyws', (0, -0.95, zf + 0.5), Vector((0, -1, 0.0)), 1.2, 0.26, 0.1, 0.03, dg)
    box('yflyseat', (0.9, 0.4, 0.3), (0, 0.55, zf + 0.32), mat=flat(NAVY, 0.6), bevel=0.08)
    mb = L.MB()
    arch = flat(WHITE, 0.4)
    ytop = zf + 1.15
    for s in (-1, 1):
        mb.seg(Vector((s * 0.9, 1.15, zf)), Vector((s * 0.62, 1.45, ytop)), 0.07, arch, segs=10)
    mb.seg(Vector((-0.62, 1.45, ytop)), Vector((0.62, 1.45, ytop)), 0.075, arch, segs=10)
    mb.done('yarch')
    sphere('yradar', 0.24, (0, 1.45, ytop + 0.16), white, scale=(1.0, 1.0, 0.5), segs=20, rings=10)
    sphere('ylight', 0.05, (0.45, 1.45, ytop + 0.08), SL.light_mat('#FFF4D0', 2.5), segs=10, rings=6)
    box('ysofa', (1.7, 0.45, 0.32), (0, 3.0, YT_F), mat=flat(WHITE, 0.6), bevel=0.1)
    box('ysofab', (1.7, 0.16, 0.5), (0, 3.25, YT_F), mat=flat(NAVY, 0.6), bevel=0.06)
    box('yswim', (2.0, 0.55, 0.08), (0, YT_L / 2 + 0.2, 0.14), mat=teak, bevel=0.02)
    cyl('ystaff', 0.025, 1.0, (0.6, YT_L / 2 - 0.15, YT_F), mat=flat(chrome, 0.3, 0.6), segs=8)
    SL.flag_on('yflag', (0.6, YT_L / 2 - 0.13, YT_F + 0.98), 0.42, 0.26, 'red', seed=8, emblem=True)
    SL.drift('ysn1', (0.25, -2.6, YT_F), r=0.22, seed=6)
    SL.pillow_snow('yflys', 1.0, 0.75, 1.0, ytop + 0.02, rf=0.05, rb=0.05, t=0.07, seed=7, drifts=0)
    t1 = BB.crew_rig('villager_b')
    t1.j['root'].parent = g
    t1.rest_loc['root'] = Vector((0.45, 2.15, YT_F))
    t2 = BB.crew_rig('villager_a')
    t2.j['root'].parent = g
    t2.rest_loc['root'] = Vector((-0.5, 1.75, YT_F))
    foam = SL.Foam('yfoam', H, n=7, length=0.5, spread=0.42, r0=0.12, r1=0.24, seed=8, splash=3)
    wash = []
    for k in range(6):
        m = SL.foam_mat('ywm%d' % k)
        o = blob('ywash%d' % k, 1.0, (0, 0, 0), m, seed=60 + k, amp=0.3, subdiv=2)
        o.visible_shadow = False
        wash.append((o, m))

    def pose(B, anim, i, n):
        mov = anim == 'move'
        bob(B, anim, i, n, amp=(0.02, 0.025), pitch=(0.7, 1.0), roll=(1.0, 0.6), trim=1.5 if mov else 0.0)
        if mov:
            foam.set(i, n)
            for k, (o, m) in enumerate(wash):
                u = ((k + i / float(n)) / len(wash)) % 1.0
                o.location = (0.55 * math.sin(k * 2.4), YT_L / 2 + 0.3 + 1.4 * u, 0.05)
                s = (0.22 + 0.3 * u) * (1.0 - 0.7 * u ** 2)
                o.scale = (s * 1.3, s * 1.3, s * 0.35)
                o.hide_render = o.hide_viewport = False
                L.set_alpha(m, 1.0)
        else:
            foam.show(False)
            for o, m in wash:
                o.hide_render = o.hide_viewport = True
        crew_pose_stand(t1, i, yaw=-80.0, face='face_happy', wave=i % 2)
        crew_pose_stand(t2, i + 1, yaw=-110.0, face='face_smile')
        bpy.context.view_layer.update()

    return {'group': g, 'pose': pose, 'rigs': [t1, t2],
            'points': {'stern': Vector((0, YT_L / 2 + 0.3, 0)), 'bow': Vector((0, -YT_L / 2 - 0.1, 0)),
                       'perch': [Vector((0, 1.45, ytop + 0.32)), Vector((0.6, YT_L / 2 - 0.15, YT_F + 1.02))],
                       'lights': {'arch': Vector((0.45, 1.45, ytop + 0.08))}}}
