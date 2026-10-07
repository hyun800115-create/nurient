"""
harbor_assets.py - buildings, props and water pieces of the harbour city "갈매기 항구" (docs/CONTRACT_V6.md section T).

Registry HARBOR maps a build key to its builder + metadata in the format of bld_assets.BLD / town_assets.TOWN plus
`ground` (see harbor_render.py: 'land', 'water' or {'land': [rects]}), rendered by harbor_render.render_harbor().
harbor_pack.py packs assets/harbor/.

Conventions (as bld_assets.py / town_assets.py, plus harbor_lib.py)
  * 1 unit = 1 m, world origin = footprint centre = sprite anchor; local front = -Y (screen down-left).
  * z = 0 = quay / pier deck level (walkable); the sea surface is harbor_lib.WATER_Z = -0.55 m.
  * The waterfront buildings face the sea on their -Y side: their front edge (footprint y0) is the quay edge
    (`quayEdge` in the manifest); gangways / slipways reach over the water beyond it.
  * Interaction markers use bld_assets.mark(kind, loc, facing) (recorded by bld_render.markers):
        door -> doorPoint (+doorDir)       customer -> customerPoints/Dirs     staff -> staffPoints/Dirs
        in -> inPoint   out -> outPoint    seat -> seatPoints/Dirs   wait -> waitPoints/Dirs   work -> workPoints/Dirs
        board -> boardPoints/Dirs (gangway)   gangway -> gangwayPoint   berth / moor -> berthPoint / moorPoints
        (ON THE WATER PLANE: where a ship anchor = waterline goes)   hook -> hookPoint (per frame, crane)
        pick / drop -> pickPoint / dropPoint (crane)   buyer -> buyerPoints (auction)   cook -> staffPoints alias
  * Every point a character can stand on is in front of the building geometry or on a walkable deck.

Not run directly - see harbor_render.py.
"""
import math
from collections import OrderedDict

import bpy  # noqa: F401
from mathutils import Vector

import prop_lib as L
from prop_lib import C, flat, snowy, tonal, box, cyl, sphere, blob, log, extrude, hexmix
import prop_assets as PA
import life_assets as LA
import bld_assets as BA
import town_lib as T
import harbor_lib as H
from bld_assets import mark

HARBOR = OrderedDict()


def harbor(key, kind, atlas, fp=None, yaw=0.0, shadow=True, samples=32, notes='', front='-Y', catcher=24.0, work=0,
           fps=8, sprites=None, extra=None, ko=None, en=None, zone=None, anim_name=None, ground='land'):
    """Register a builder (bld_assets.bld spec fields + name / zone / ground metadata)."""
    def deco(fn):
        ex = dict(extra or {})
        if ko or en:
            ex['name'] = {'ko': ko or key, 'en': en or key}
        if zone:
            ex['zone'] = zone
        HARBOR[key] = dict(key=key, fn=fn, kind=kind, atlas=atlas, fp=fp, yaw=yaw, shadow=shadow, samples=samples,
                           notes=notes, front=front, catcher=catcher, work=work, fps=fps, item=None, sprites=sprites,
                           extra=ex, anim_name=anim_name, ground=ground)
        return fn
    return deco


def iso_px(x, y, z=0.0):
    """World metres (yaw 0 builds) -> px offset from the anchor (bl_common.world_to_pixel maths)."""
    return [int(round((x + y) * 45.2548)), int(round((x - y) * 22.6274 - z * 55.4256))]


def arch_window(name, loc, face='y-', w=0.6, h=1.1, frame=H.HWHITE, glow=1.7, mullion=True):
    """Tall arched glowing window (loc = bottom-centre on the wall surface)."""
    fm = flat(frame, 0.7)
    gm = T.glow_mat(name + '_g', glow)
    objs = [T.ext_xz(name + '_fr', PA.arch_pts(w + 0.16, h + 0.1, 12), 0.08, fm, y=0.0),
            T.ext_xz(name + '_gl', PA.arch_pts(w, h, 12), 0.08, gm, y=0.015)]
    objs[0].location.z = -0.05
    if mullion:
        objs.append(box(name + '_m1', (0.045, 0.1, h), (0, -0.07, 0.0), mat=fm, bevel=0.0))
        objs.append(box(name + '_m2', (w, 0.1, 0.045), (0, -0.07, h * 0.55), mat=fm, bevel=0.0))
    objs.append(L.snow_slab(name + '_sill', w + 0.2, 0.16, 0.05, (0, -0.07, -0.1), seed=3))
    objs.append(box(name + '_sb', (w + 0.22, 0.14, 0.06), (0, -0.06, -0.12), mat=fm, bevel=0.02))
    return T.face_group(objs, face, loc, name)


def vault(name, length, r, k, loc, mat, a0=0.0, a1=math.pi, n=20, t=None, cap=None):
    """Half-elliptic barrel vault along X (span 2r across Y, rise k*r) starting at loc (x0, y_centre, z_base).
    t = shell thickness -> an arc band (snow layer); None -> solid half-ellipse.  cap = material of the two end
    faces (default: mat)."""
    pts = []
    for j in range(n + 1):
        a = a0 + (a1 - a0) * j / n
        pts.append((r * math.cos(a), k * r * math.sin(a)))
    if t:
        inner = []
        for j in range(n, -1, -1):
            a = a0 + (a1 - a0) * j / n
            inner.append(((r - t) * math.cos(a), k * (r - t) * math.sin(a)))
        pts = pts + inner
    o = extrude(name, pts, length, rot=(90, 0, 90), top=cap or mat, side=mat, bottom=cap or mat, bevel=0.02)
    o.location = loc
    return o


# =========================================================================== LIGHTHOUSE

LIGHT_NOTE = ('Lighthouse (3.6 x 3.0 m, ~7 m tall): red-white striped round tower on a stone plinth among snowy rocks, '
              'navy gallery with a railing, lantern room with a Fresnel lens drum, red conical roof with a seagull '
              'weather vane, a little keeper cottage on its right side (smoke at fxPoints.smoke). idle = daytime '
              '(lamp off); anims.work / anims.light = 8-frame loop, the lit lens turns and two light beams sweep '
              'around (22.5 deg per frame, two opposite beams -> seamless). fxPoints.light = lens centre (night glow '
              'sprite), doorPoint = in front of the door, staffPoints = the keeper.')


@harbor('lighthouse', 'building', 'harbor_landmarks', fp=(3.6, 3.0), catcher=34.0, work=8, fps=8, samples=28,
        notes=LIGHT_NOTE,
        ko='등대', en='Lighthouse', zone='landmark', anim_name='light')
def b_lighthouse():
    rnd = L.rng(5)
    rock = snowy('#7D8592', lo=0.5, hi=0.78, noise_amt=0.45)
    for k in range(12):
        a = math.radians(-200 + 230 * k / 11) + rnd.uniform(-0.1, 0.1)
        r = rnd.uniform(1.18, 1.42)
        blob('rock%d' % k, rnd.uniform(0.2, 0.32), (r * math.cos(a), r * math.sin(a), 0.04), rock,
             scale=(1.35, 1.05, 0.72), seed=k + 3, amp=0.32, subdiv=2, flat_bottom=0.45)
    stone = L.brick('#B3B9C3', '#A2A9B4', '#DADDE3', scale=1.6, row_h=0.36, brick_w=0.55, snow_top=True)
    cyl('plinth', 1.16, 0.4, (0, 0, 0), mat=stone, segs=48, bevel=0.04)
    cyl('plinthcap', 1.2, 0.08, (0, 0, 0.36), mat=snowy('#C9CED6', lo=0.55, hi=0.75), segs=48, bevel=0.03)
    for k in range(2):
        box('step', (0.8, 0.3, 0.2 * (2 - k)), (0, -1.2 - 0.26 * (1 - k), 0.0),
            mat=snowy('#B3B9C3', lo=0.6, hi=0.8), bevel=0.03)
    # tower: red-white bands (top band red, under the gallery)
    Z0, TH = 0.44, 4.9
    tower_m = L.stripes(H.HWHITE, H.HRED, 1.0 / 1.225, 'Z', rough=0.5, soft=0.008)
    cyl('tower', 0.8, TH, (0, 0, Z0), mat=tower_m, segs=48, r_top=0.58, bevel=0.02)

    def tr(z):
        return 0.8 - 0.22 * (z - Z0) / TH
    T.door('door', (0, -tr(Z0) + 0.06, Z0), 'y-', w=0.52, h=1.0, col=H.NAVY, frame_col=H.HWHITE, arch=True,
           step=False, glass=False)
    box('dcanopy', (0.78, 0.36, 0.07), (0, -tr(1.5) - 0.12, Z0 + 1.15), mat=flat(H.NAVY, 0.6), bevel=0.02)
    L.snow_slab('dcsnow', 0.72, 0.3, 0.06, (0, -tr(1.5) - 0.12, Z0 + 1.22), seed=2)
    for k, z in enumerate((2.25, 3.65)):
        a = math.radians(-45)
        r = tr(z) - 0.03
        g = T.win('twin%d' % k, (r * math.cos(a), r * math.sin(a), z), 'y-', w=0.3, h=0.42, shutters=None,
                  frame=H.HWHITE, seed=k)
        g.rotation_euler.z = math.radians(45)
    T.lamp_wall('dlamp', (0.36, -tr(1.4) + 0.1, Z0 + 1.0), 'y-', strength=2.5)
    # gallery
    GZ = Z0 + TH
    cyl('gallery', 0.95, 0.14, (0, 0, GZ - 0.04), mat=flat(H.NAVY, 0.6), segs=48, bevel=0.03)
    for k in range(16):
        a = math.tau * k / 16
        box('corbel', (0.16, 0.1, 0.22), (0.66 * math.cos(a), 0.66 * math.sin(a), GZ - 0.24),
            rot=(0, 0, math.degrees(a)), mat=flat(H.NAVY, 0.6), bevel=0.02)
    H.torus('gsnow', 0.78, 0.13, (0, 0, GZ + 0.11), mats=[flat('snow_mat', 0.9)], M=40, K=10).scale = (1, 1, 0.45)
    rail = flat(H.NAVY_DARK, 0.45, 0.3)
    for k in range(20):
        a = math.tau * k / 20
        cyl('rpost', 0.017, 0.46, (0.9 * math.cos(a), 0.9 * math.sin(a), GZ + 0.1), mat=rail, segs=6, bevel=0.0)
    H.torus('rtop', 0.9, 0.024, (0, 0, GZ + 0.56), mats=[rail], M=48, K=8)
    H.torus('rmid', 0.9, 0.015, (0, 0, GZ + 0.33), mats=[rail], M=48, K=6)
    # lantern room: red base ring, mullions, the lens drum inside, cap ring
    LZ = GZ + 0.1
    cyl('lbase', 0.56, 0.24, (0, 0, LZ), mat=flat(H.HRED, 0.5), segs=40, bevel=0.02)
    cyl('lfloor', 0.5, 0.02, (0, 0, LZ + 0.24), mat=flat('#2B2F3A', 0.6), segs=32, bevel=0.0)
    drum_m = L.emissive('drum', '#FFF2C8', '#FFE08A', 0.0)
    eye_m = L.emissive('eye', '#FFF8DE', '#FFF1B0', 0.0)
    rib_m = flat('#E9C46A', 0.35, 0.4)
    with L.Collect() as lc:
        cyl('drum', 0.36, 0.6, (0, 0, LZ + 0.26), mat=drum_m, segs=8, bevel=0.03)
        for k in range(4):
            H.torus('rib%d' % k, 0.365, 0.016, (0, 0, LZ + 0.36 + 0.13 * k), mats=[rib_m], M=8, K=6)
        for s in (-1, 1):
            cyl('eye%d' % (s > 0), 0.15, 0.06, (s * 0.35, 0, LZ + 0.56), rot=(0, 90, 0), mat=eye_m, segs=24,
                origin='center', bevel=0.02)
            bm_ = H.beam_mat('beam%d' % (s > 0), '#FFE48A', 0.62, 2.6)
            bo = cyl('beam%d' % (s > 0), 0.16, 2.4, (s * 0.38, 0, LZ + 0.56), rot=(0, s * 90, 0), mat=bm_, segs=24,
                     r_top=0.58, bevel=0.0)
            bo.visible_shadow = False
            bo.visible_diffuse = False
            bo.visible_glossy = False
    lens = L.group(BA.top_level(lc.objs), 'lens')
    beams = [o for o in lc.objs if o.name.startswith('beam')]
    for k in range(8):
        a = math.tau * (k + 0.5) / 8
        cyl('mull', 0.026, 0.68, (0.5 * math.cos(a), 0.5 * math.sin(a), LZ + 0.24), mat=flat(H.NAVY_DARK, 0.45, 0.3),
            segs=6, bevel=0.0)
    H.torus('glassring', 0.5, 0.012, (0, 0, LZ + 0.6), mats=[flat(H.NAVY_DARK, 0.45, 0.3)], M=32, K=6)
    cyl('lcap', 0.58, 0.1, (0, 0, LZ + 0.9), mat=flat(H.NAVY, 0.6), segs=40, bevel=0.02)
    RZ = LZ + 0.98
    cyl('roof', 0.7, 0.5, (0, 0, RZ), mat=flat(H.HRED, 0.45), segs=40, r_top=0.1, bevel=0.03)
    blob('roofsnow', 0.42, (-0.04, 0.02, RZ + 0.22), flat('snow_mat', 0.9), scale=(1.0, 1.0, 0.42), seed=8, amp=0.12,
         subdiv=3)
    sphere('roofball', 0.11, (0, 0, RZ + 0.55), flat('#F2C14E', 0.3, 0.7), segs=16, rings=10)
    cyl('vane', 0.018, 0.45, (0, 0, RZ + 0.6), mat=flat(H.NAVY_DARK, 0.4, 0.5), segs=8)
    H.gull('vanegull', (0, 0, RZ + 1.02), rz=-60.0, s=0.95)
    box('arrow', (0.6, 0.02, 0.05), (0, 0, RZ + 0.95), rot=(0, 0, -60), mat=flat(H.NAVY_DARK, 0.4, 0.5), bevel=0.0,
        origin='center')
    lamp = L.point_light('lantern_light', (0.2, -0.2, LZ + 0.56), '#FFD27A', 0.0, 0.1)
    # keeper cottage on the right (+X) side
    AX, AY, AW, AD, AH = 1.42, 0.22, 0.86, 1.2, 1.12
    box('aplinth', (AW + 0.1, AD + 0.1, 0.18), (AX, AY, 0), mat=snowy('#8E96A3', lo=0.7, hi=0.88), bevel=0.03)
    box('awalls', (AW, AD, AH - 0.18), (AX, AY, 0.18), mat=T.plaster('#F7F3EA'), bevel=0.04)
    T.gable('aroof', AW, AD, AH, AH + 0.6, 0.16, H.HRED, '#F7F3EA', seed=21, x=AX, y=AY, along='y',
            snow_frac=(0.7, 0.7))
    T.win('awin', (AX + AW / 2, AY + 0.05, 0.98), 'x+', w=0.42, h=0.45, shutters=H.NAVY, seed=22)
    T.win('awin2', (AX, AY - AD / 2, 1.0), 'y-', w=0.36, h=0.4, shutters=H.NAVY, seed=23)
    _, smoke = T.chimney('achim', AX + 0.18, AY + 0.35, AH, AH + 0.75, col='#8E6A5A', w=0.24)
    H.life_ring('aring', (AX + AW / 2 + 0.05, AY - 0.42, 0.62), rz=90.0)
    # decor: gull on the gallery rail, little anchor + bench
    H.gull('railgull', (0.62, -0.62, GZ + 0.58), rz=-40.0, s=0.9)
    H.anchor_model('anch', s=0.75, col=H.IRON, loc=(-1.05, -0.95, 0.3), rot=(0, 0, 45), stock_col='#8A5A33')
    LA.snow_drift('d1', 0.26, (-1.25, 0.55, 0.0), seed=31)
    LA.snow_drift('d2', 0.22, (1.0, -1.15, 0.0), seed=32)
    # markers
    mark('door', (0.0, -1.62, 0.0), facing=(0, 1, 0))
    mark('staff', (-0.62, -1.5, 0.0), facing=(0.4, -1, 0))

    def idle():
        L.set_emission(drum_m, 0.0)
        L.set_emission(eye_m, 0.0)
        lamp.data.energy = 0.0
        for b in beams:
            b.hide_render = True
        lens.rotation_euler.z = math.radians(-20.0)

    def work(i):
        L.set_emission(drum_m, 2.2)
        L.set_emission(eye_m, 5.0)
        lamp.data.energy = 60.0
        for b in beams:
            b.hide_render = False
        lens.rotation_euler.z = math.radians(-20.0 + 22.5 * i)

    idle()
    return {'idle': idle, 'work': work,
            'fx': {'light': (0.0, 0.0, LZ + 0.56), 'smoke': smoke, 'door': (0.0, -0.95, Z0 + 0.6)}}


# =========================================================================== HARBOUR CRANE

CRANE_R, TIP_Z, CRATE_S = 4.0, 5.55, 0.7
# frame: (jib heading deg, crate bottom z (or hook top z when empty), carrying)
CRANE_SEQ = [(-90, 0.3, True), (-90, 1.75, True), (-118, 2.9, True), (-150, 2.9, True), (180, 1.7, True),
             (180, 0.02, True), (-148, 2.3, False), (-112, 1.3, False)]
CRANE_NOTE = ('Harbour crane (portal 3.2 x 2.6 m on quay rails along X, jib reach 4 m, ~6.5 m tall): yellow portal '
              'with hazard-striped bogies, white machine house with a red band, glowing operator cab, counterweight, '
              'A-frame mast, lattice jib, red-white hook block. Placed with its front (-Y) at the quay edge '
              '(quayEdge, 1.6 m in front of the anchor): the jib works over the water on the -Y side. idle = jib over '
              'the water, hook up. anims.work / anims.lift = 8-frame loop at 4 fps: frame 0 hooks a crate on the '
              'ship (pickPoint, pickFrame 0), lifts, slews 90 deg to the quay side (-X), lowers and sets it down at '
              'dropPoint (dropFrame 5: the crate is released - spawn / grow a crate_stack there), then swings back '
              'empty. hookPoint = the hook tip for the idle frame, anims.work.hookPoints = per frame (attach your own '
              'cargo / FX there; cargoHangPx = hook-to-crate-bottom offset). staffPoints = signalman by the drop '
              'spot, workPoints = dock workers receiving crates.')


@harbor('harbor_crane', 'building', 'harbor_landmarks', fp=(3.2, 2.6), catcher=40.0, work=8, fps=4,
        samples=28,
        notes=CRANE_NOTE, ko='항구 크레인', en='Harbour crane', zone='landmark', anim_name='lift',
        ground={'land': [(-12.0, 12.0, -1.6, 12.0)]})
def b_harbor_crane():
    ym = flat(H.YELLOW, 0.45, 0.1)
    dark = flat('#3A3E46', 0.5, 0.3)
    # rails + bogies
    for sy in (-1, 1):
        box('railbed', (4.3, 0.36, 0.03), (0, sy * 1.0, -0.004), mat=flat('#8A919C', 0.9), bevel=0.0)
        box('rail', (4.2, 0.1, 0.05), (0, sy * 1.0, 0.0), mat=flat('#AEB8C4', 0.3, 0.7), bevel=0.01)
    for sx in (-1, 1):
        for sy in (-1, 1):
            bx, by = sx * 1.08, sy * 1.0
            box('bogie', (0.8, 0.34, 0.26), (bx, by, 0.07), mat=dark, bevel=0.04)
            box('bogiehz', (0.82, 0.36, 0.08), (bx, by, 0.27), mat=H.hazard_mat(), bevel=0.01)
            for wx in (-0.22, 0.22):
                cyl('wheel', 0.11, 0.06, (bx + wx, by - 0.2, 0.12), rot=(90, 0, 0), mat=flat('#2B2F3A', 0.5),
                    segs=16, origin='center', cap_mat=flat('#9AA3AE', 0.4, 0.6))
    # portal legs, top frame, braces, ladder
    PZ = 2.5
    legs = {}
    for sx in (-1, 1):
        for sy in (-1, 1):
            p0 = (sx * 1.08, sy * 1.0, 0.33)
            p1 = (sx * 0.82, sy * 0.76, PZ)
            H.beam('leg', p0, p1, 0.26, ym)
            legs[(sx, sy)] = (p0, p1)
    for sy in (-1, 1):
        box('topx', (1.92, 0.28, 0.3), (0, sy * 0.76, PZ - 0.08), mat=ym, bevel=0.03)
    for sx in (-1, 1):
        box('topy', (0.28, 1.8, 0.3), (sx * 0.82, 0, PZ - 0.08), mat=ym, bevel=0.03)
    box('deck', (1.8, 1.7, 0.1), (0, 0, PZ + 0.18), mat=dark, bevel=0.02)
    for (a, b) in (((-1, -1), (1, -1)), ((1, -1), (1, 1))):
        pa0, pa1 = legs[a]
        pb0, pb1 = legs[b]
        for t0, t1 in ((0.12, 0.9), (0.9, 0.12)):
            lerp = lambda p, q, t: tuple(p[i] + (q[i] - p[i]) * t for i in range(3))
            H.beam('brace', lerp(pa0, pa1, t0), lerp(pb0, pb1, t1), 0.1, ym)
    lx, ly = 1.0, -0.98
    for s in (-0.13, 0.13):
        H.beam('lad', (lx + s, ly - 0.08, 0.3), (0.76 + s, ly + 0.14, PZ - 0.2), 0.035, flat('#3A3E46', 0.5))
    for k in range(8):
        t = (k + 0.5) / 8
        z = 0.3 + (PZ - 0.5) * t
        x = lx + (0.76 - lx) * t
        y = ly - 0.08 + 0.22 * t
        box('rung', (0.26, 0.03, 0.03), (x, y, z), mat=flat('#3A3E46', 0.5), bevel=0.0)
    # slewing upper works (built along local +X = jib direction)
    HZ = PZ + 0.32
    win_m = T.glow_mat('cabwin', 1.6)
    with L.Collect() as sg:
        cyl('turn', 0.74, 0.14, (0, 0, PZ + 0.22), mat=dark, segs=36, bevel=0.02)
        box('house', (1.5, 1.16, 0.96), (-0.28, 0, HZ), mat=T.plaster('#F7F5F0'), bevel=0.05)
        box('hband', (1.53, 1.19, 0.15), (-0.28, 0, HZ + 0.14), mat=flat(H.HRED, 0.5), bevel=0.02)
        box('hroof', (1.64, 1.3, 0.1), (-0.28, 0, HZ + 0.96), mat=flat(H.NAVY, 0.6), bevel=0.03)
        L.snow_slab('hsnow', 1.5, 1.14, 0.08, (-0.32, 0.0, HZ + 1.05), seed=41, droop=0.02)
        for s in (-1, 1):
            for k, x in enumerate((-0.62, -0.08)):
                box('hwin', (0.3, 0.06, 0.26), (x, s * 0.585, HZ + 0.5), mat=win_m, bevel=0.02)
                box('hwinf', (0.38, 0.04, 0.34), (x, s * 0.57, HZ + 0.46), mat=flat(H.NAVY, 0.6), bevel=0.02)
        box('cab', (0.62, 0.58, 0.82), (0.72, -0.3, HZ + 0.06), mat=T.plaster('#F7F5F0'), bevel=0.05)
        box('cabglass', (0.06, 0.46, 0.44), (1.03, -0.3, HZ + 0.36), mat=win_m, bevel=0.02)
        box('cabglass2', (0.46, 0.06, 0.4), (0.74, -0.6, HZ + 0.38), mat=win_m, bevel=0.02)
        box('cabroof', (0.72, 0.68, 0.08), (0.72, -0.3, HZ + 0.88), mat=flat(H.HRED, 0.5), bevel=0.02)
        L.snow_slab('cabsnow', 0.6, 0.56, 0.06, (0.72, -0.3, HZ + 0.95), seed=42)
        box('cw', (0.52, 1.12, 0.74), (-1.25, 0, HZ + 0.04), mat=flat('#4A505A', 0.6), bevel=0.04)
        box('cwhz', (0.54, 1.14, 0.16), (-1.25, 0, HZ + 0.55), mat=H.hazard_mat(), bevel=0.01)
        L.snow_slab('cwsnow', 0.44, 1.0, 0.06, (-1.25, 0, HZ + 0.79), seed=43)
        apex = (-0.42, 0.0, 4.75)
        for s in (-1, 1):
            H.beam('mast', (-0.75, s * 0.48, HZ + 1.0), apex, 0.12, ym)
            H.beam('mastb', (-0.05, s * 0.4, HZ + 1.0), apex, 0.08, ym)
        sphere('apex', 0.11, apex, flat(H.HRED, 0.5), segs=14, rings=8)
        # lattice jib
        root = Vector((0.5, 0.0, 3.2))
        tip = Vector((CRANE_R, 0.0, TIP_Z))
        d = (tip - root).normalized()
        nrm = Vector((-d.z, 0.0, d.x))
        mb = L.MB()
        for s in (-1, 1):
            mb.seg(root + Vector((0, s * 0.22, 0)), tip + Vector((0, s * 0.1, 0)), 0.045, ym, segs=10)
        mb.seg(root + nrm * 0.36, tip + nrm * 0.08, 0.04, ym, segs=10)
        n = 9
        for k in range(n + 1):
            t = k / n
            w = 0.22 + (0.1 - 0.22) * t
            hh = 0.36 + (0.08 - 0.36) * t
            p = root.lerp(tip, t)
            a, b, c = p + Vector((0, -w, 0)), p + Vector((0, w, 0)), p + nrm * hh
            mb.seg(a, b, 0.022, ym, segs=6)
            if k < n:
                t2 = (k + 1) / n
                w2 = 0.22 + (0.1 - 0.22) * t2
                h2 = 0.36 + (0.08 - 0.36) * t2
                p2 = root.lerp(tip, t2)
                for s in (-1, 1):
                    q = p2 + Vector((0, s * w2, 0))
                    mb.seg(c if k % 2 == 0 else p + Vector((0, s * w, 0)), q if k % 2 == 0 else p2 + nrm * h2,
                           0.02, ym, segs=6)
        mb.done('jib')
        box('jroot', (0.3, 0.6, 0.4), (0.55, 0, 3.0), mat=dark, bevel=0.03)
        box('jhead', (0.42, 0.34, 0.34), tuple(tip + Vector((0.02, 0, -0.2))), mat=ym, bevel=0.04)
        cyl('sheave', 0.13, 0.12, tuple(tip + Vector((0.12, 0, -0.12))), rot=(90, 0, 0), mat=dark, segs=18,
            origin='center')
        sphere('tiplamp', 0.06, tuple(tip + Vector((0.05, 0, 0.0))), L.emissive('tipl', '#FF6B5A', '#FF4A3A', 2.5),
               segs=10, rings=6)
        mbc = L.MB()
        for s in (-1, 1):
            mbc.seg(Vector(apex) + Vector((0, s * 0.05, 0)), tip + Vector((0, s * 0.05, -0.05)), 0.014,
                    flat('#2B2F3A', 0.5), segs=5)
            mbc.seg(Vector(apex), Vector((-1.25, s * 0.45, HZ + 0.78)), 0.014, flat('#2B2F3A', 0.5), segs=5)
        mbc.done('stays')
        H.gull('jibgull', tuple(root.lerp(tip, 0.55) + nrm * 0.3 + Vector((0, 0, 0.04))), rz=150.0, s=0.8)
    slew = L.group(BA.top_level(sg.objs), 'slew')
    # hook block (origin = top, where the cable attaches) + crate with sling
    with L.Collect() as hc:
        box('hblock', (0.24, 0.2, 0.28), (0, 0, -0.3), mat=L.stripes(H.HRED, H.HWHITE, 1.0 / 0.08, 'Z', soft=0.01),
            bevel=0.04)
        cyl('hsheave', 0.08, 0.22, (0, 0, -0.1), rot=(90, 0, 0), mat=dark, segs=14, origin='center')
        mbh = L.MB()
        steel = flat('#5A606B', 0.35, 0.6)
        mbh.seg((0, 0, -0.3), (0, 0, -0.38), 0.025, steel, segs=8)
        T.ring_seg(mbh, (0.0, 0.0, -0.46), 0.07, 0.022, steel, axis='y', a0=math.radians(-200), a1=math.radians(40),
                     n=10)
        mbh.done('hook')
    hook = L.group(BA.top_level(hc.objs), 'hookg')
    hook_mark = mark('hook', (0.0, 0.0, -0.5), parent=hook)
    with L.Collect() as cc:
        PA.crate_model('crate', s=CRATE_S, loc=(0, 0, 0), snow=False, seed=4)
        mbs = L.MB()
        for sx in (-1, 1):
            for sy in (-1, 1):
                mbs.seg((sx * 0.3, sy * 0.3, CRATE_S), (0, 0, CRATE_S + 0.42), 0.012, flat(H.ROPE, 0.85), segs=5)
        mbs.done('sling')
        box('tarp', (CRATE_S * 0.9, CRATE_S * 0.9, 0.06), (0, 0, CRATE_S - 0.02), mat=flat(H.HBLUE, 0.7),
            bevel=0.02)
    crate = L.group(BA.top_level(cc.objs), 'crateg')
    cable = cyl('cable', 0.02, 1.0, (0, 0, 0), mat=flat('#2B2F3A', 0.5), segs=8, bevel=0.0)
    cable2 = cyl('cable2', 0.016, 1.0, (0, 0, 0), mat=flat('#2B2F3A', 0.5), segs=8, bevel=0.0)
    HANG = 0.5 + 0.42                       # hook block top -> crate top
    del hook_mark

    def pose(theta, z, carry):
        th = math.radians(theta)
        slew.rotation_euler.z = th
        tx, ty = CRANE_R * math.cos(th) + 0.12 * math.cos(th), CRANE_R * math.sin(th) + 0.12 * math.sin(th)
        top = z + CRATE_S + HANG if carry else z
        hook.location = (tx, ty, top)
        hook.rotation_euler.z = th
        crate.location = (tx, ty, z)
        crate.rotation_euler.z = th + math.radians(12)
        crate.hide_render = not carry
        for o in BA.descendants([crate]):
            o.hide_render = not carry
        z_tip = TIP_Z - 0.12
        for k, cb in enumerate((cable, cable2)):
            off = 0.05 * (1 if k else -1)
            cb.location = (tx - math.sin(th) * off, ty + math.cos(th) * off, top)
            cb.scale = (1.0, 1.0, max(0.05, z_tip - top))

    def idle():
        pose(-90, 3.2, False)

    def work(i):
        pose(*CRANE_SEQ[i])

    # static points
    mark('pick', (0.0, -CRANE_R - 0.12, 0.0))
    mark('drop', (-CRANE_R - 0.12, 0.0, 0.0))
    mark('staff', (-3.0, -1.05, 0.0), facing=(-0.7, 0.6, 0))
    mark('work', (-3.6, 0.95, 0.0), facing=(-0.4, -1, 0))
    mark('work', (-4.75, -0.75, 0.0), facing=(0.6, 0.6, 0))
    idle()
    return {'idle': idle, 'work': work,
            'fx': {'cab': (0.95, -0.3, HZ + 0.5), 'tipLamp': (CRANE_R, 0.0, TIP_Z)},
            'extra': {'cargoHangPx': int(round((HANG + CRATE_S - 0.5) * 55.4256)),
                      'pickFrame': 0, 'dropFrame': 5, 'quayEdge': [iso_px(-1.6, -1.6), iso_px(1.6, -1.6)],
                      'jibReachM': CRANE_R, 'craneSeq': [{'headingDeg': a, 'z': z, 'carry': c}
                                                         for a, z, c in CRANE_SEQ]}}


# =========================================================================== FERRY TERMINAL

TERM_NOTE = ('Ferry terminal (6.4 x 4.0 m + a 2.6 m gangway over the water): cream waiting hall with tall arched '
             'windows, a teal barrel-vault roof with snow, a clock tower with a seagull vane, a big round ferry sign '
             'on the roof, teal-white awning over two benches, ticket window, rope-lane queue to the boarding gate '
             'and an open railed gangway on pillars reaching 2.6 m over the sea (front edge of the footprint = the '
             'quay edge, quayEdge). doorPoint = hall door, customerPoints = ticket queue, staffPoints = gate '
             'attendant, waitPoints = queue lane (first = at the gate), seatPoints = benches, boardPoints = gate -> '
             'gangway -> tip (walk them in order to board, reverse to land), gangwayPoint = gangway tip (deck level: '
             'align the ferry\'s own gangwayPoint here), berthPoint = the tip projected onto the sea (ferry hull side '
             'touches here, ship lies along world X = berthAxis).')


@harbor('ferry_terminal', 'building', 'harbor_buildings', fp=(6.4, 4.0), catcher=40.0, notes=TERM_NOTE,
        ko='여객선 터미널', en='Ferry terminal', zone='port', ground={'land': [(-12.0, 12.0, -2.0, 12.0)]})
def b_ferry_terminal():
    Y0 = -2.0
    H.ground_tiles('apron', -3.2, 3.2, Y0, 2.0, c1='#D6DAE0', c2='#C8CDD5', n=2.4)
    box('coping', (6.4, 0.22, 0.05), (0, Y0 + 0.11, -0.03), mat=flat('#E3E6EB', 0.8), bevel=0.02)
    # hall
    X0, X1, HY0, HY1 = -3.0, 1.35, -0.2, 1.85
    W, D, CX, CY = X1 - X0, HY1 - HY0, (X0 + X1) / 2, (HY0 + HY1) / 2
    PL, WH = 0.16, 2.25
    T.plinth('plinth', W, D, h=PL, col='#8E96A3', x=CX, y=CY)
    box('walls', (W, D, WH - PL), (CX, CY, PL), mat=T.plaster('#F6EEDB'), bevel=0.04)
    T.corner_trims('ctrim', W, D, PL, WH - PL, H.HWHITE, x=CX, y=CY)
    T.band('cornice', W, D, WH - 0.12, H.HWHITE, h=0.14, out=0.07, x=CX, y=CY)
    roof_m = L.stripes(H.TEAL, hexmix(H.TEAL, '#000000', 0.14), 1.0 / 0.42, 'Z', rough=0.6, soft=0.03)
    RR = D / 2 + 0.22
    vault('vault', W + 0.36, RR, 0.62, (X0 - 0.18, CY, WH - 0.02), roof_m, cap=T.plaster('#F6EEDB'))
    vault('vsnow', W + 0.2, RR + 0.04, 0.62, (X0 - 0.1, CY, WH - 0.02), flat('snow_mat', 0.9), a0=math.radians(38),
          a1=math.radians(142), t=0.09)
    T.win('lunw', (X1 + 0.18, CY, WH + 0.6), 'x+', w=0.4, round_=True, seed=61)
    # front: arched windows, door, ticket window, awning
    for k, x in enumerate((-2.55, -1.75, 0.15, 0.95)):
        if k == 0:
            continue
        arch_window('aw%d' % k, (x, HY0, PL + 0.3), 'y-', w=0.5, h=1.0)
    T.door('door', (-0.8, HY0, PL), 'y-', w=0.86, h=1.36, col=H.TEAL, frame_col=H.HWHITE, double=True, step=False)
    T.shop_window('ticket', (-2.55, HY0, PL + 0.62), 'y-', w=0.62, h=0.52, frame_col=H.NAVY, mullions=0)
    box('tsill', (0.8, 0.3, 0.06), (-2.55, HY0 - 0.15, PL + 0.62), mat=flat(H.NAVY, 0.7), bevel=0.02)
    T.awning_on('y-', W + 0.1, abs(HY0) + 0.0, WH - 0.12, WH - 0.42, 0.62, H.TEAL, 'cream', 12, x=CX, name='awn')
    T.town_bench('bench0', (0.6, HY0 - 0.42, 0.0), rot_z=0.0, col='#8A5A33')
    T.lamp_wall('wl1', (-1.32, HY0, PL + 1.45), 'y-')
    T.lamp_wall('wl2', (-0.28, HY0, PL + 1.45), 'y-')
    T.win('sw1', (X1, CY - 0.4, PL + 1.35), 'x+', w=0.5, h=0.62, shutters=None, frame=H.HWHITE, seed=62)
    T.win('sw2', (X1, CY + 0.45, PL + 1.35), 'x+', w=0.5, h=0.62, shutters=None, frame=H.HWHITE, seed=63)
    # clock tower at the back-right
    TX, TY, TW = 0.75, 1.25, 0.72
    TH_ = 3.6
    box('tbody', (TW, TW, TH_), (TX, TY, 0.0), mat=T.plaster('#F6EEDB'), bevel=0.04)
    T.band('tband', TW, TW, TH_ - 0.1, H.HWHITE, h=0.12, out=0.06, x=TX, y=TY)
    with L.Collect() as ck:
        T.em_clock(0.62)
    L.group(BA.top_level(ck.objs), 'clock', loc=(TX, TY - TW / 2 - 0.02, TH_ - 0.45))
    with L.Collect() as ck2:
        T.em_clock(0.62, hh=-30.0, mm=90.0)
    L.group(BA.top_level(ck2.objs), 'clock2', loc=(TX + TW / 2 + 0.02, TY, TH_ - 0.45), rot=(0, 0, 90))
    T.hip_cap('troof', TW + 0.3, TW + 0.3, TH_ + 0.02, 0.72, H.HRED, seed=64, x=TX, y=TY)
    cyl('tvane', 0.02, 0.5, (TX, TY, TH_ + 0.7), mat=flat(H.NAVY_DARK, 0.4, 0.5), segs=8)
    H.gull('tgull', (TX, TY, TH_ + 1.17), rz=-70.0, s=1.0)
    # roof sign (ferry emblem) facing the camera, on two legs
    sx, sy, sz = -1.0, CY - 0.2, WH + 0.62 * RR - 0.05
    for s in (-1, 1):
        cyl('rsleg', 0.04, 0.45, (sx + s * 0.3, sy + s * 0.3, sz - 0.12), mat=flat('#3D424C', 0.45, 0.6), segs=8)
    T.sign_disc('rsign', (sx, sy, sz + 0.85), r=0.58, bg='#F4F1EA', rim=H.NAVY, emblem=H.em_ship, es=1.15, tilt=8.0)
    # queue lane: stanchions with red ropes from x = -0.35 to the gate
    GX = 2.2
    post_m = flat('#C9CED6', 0.3, 0.7)
    lane = [-0.35, 0.45, 1.25]
    for y in (-1.08, -1.62):
        pts = []
        for x in lane:
            cyl('stb', 0.1, 0.04, (x, y, 0.0), mat=post_m, segs=14, bevel=0.01)
            cyl('stp', 0.03, 0.72, (x, y, 0.0), mat=post_m, segs=10, bevel=0.0)
            sphere('stk', 0.045, (x, y, 0.74), post_m, segs=10, rings=6)
            pts.append((x, y, 0.68))
        for a, b in zip(pts, pts[1:]):
            m = ((a[0] + b[0]) / 2, a[1], 0.5)
            L.smooth_tube('rope', [a, m, b], 0.018, flat(H.HRED, 0.6))
    # boarding gate: two posts + arched sign board + flags
    for s in (-1, 1):
        box('gpost', (0.16, 0.16, 1.85), (GX + s * 0.62, -1.5, 0.0), mat=flat(H.HWHITE, 0.6), bevel=0.03)
        PA.snow_cap('gps', 0.1, (GX + s * 0.62, -1.5, 1.86), 0.05, 3 + (s > 0))
    box('gbeam', (1.5, 0.16, 0.3), (GX, -1.5, 1.72), mat=flat(H.NAVY, 0.6), bevel=0.04)
    L.snow_slab('gbsnow', 1.42, 0.14, 0.05, (GX, -1.5, 2.02), seed=65)
    with L.Collect() as gs:
        H.em_ship(0.42)
    L.group(BA.top_level(gs.objs), 'gship', loc=(GX, -1.6, 1.86))
    H.signal_flags('flags', (GX + 0.62, -1.5, 1.86), (GX - 0.5, -4.1, 1.75), n=8, sag=0.28, size=0.2)
    # gangway over the water
    GY0, GY1, GW = -1.55, -4.35, 1.1
    gx0, gx1 = GX - GW / 2, GX + GW / 2
    H.deck_planks('gplank', GY1, GY0, gx0, gx1, along='y', pitch=0.24, seed=7)
    for s in (-1, 1):
        box('gedge', (0.1, GY0 - GY1, 0.12), (GX + s * (GW / 2 - 0.02), (GY0 + GY1) / 2, -0.16), mat=flat(H.NAVY, 0.6),
            bevel=0.02)
    box('ggirder', (GW - 0.3, GY0 - GY1 + 0.0, 0.16), (GX, (GY0 + GY1) / 2, -0.3), mat=flat(H.NAVY_DARK, 0.6),
        bevel=0.02)
    rail_m = flat(H.HWHITE, 0.45)
    for s in (-1, 1):
        x = GX + s * (GW / 2 - 0.04)
        n = 7
        for k in range(n):
            y = GY0 - 0.35 - (GY0 - 0.35 - GY1 - 0.08) * k / (n - 1)
            cyl('grp', 0.025, 0.66, (x, y, 0.0), mat=rail_m, segs=8, bevel=0.0)
        H.beam('grtop', (x, GY0 - 0.35, 0.68), (x, GY1 + 0.08, 0.68), 0.05, rail_m)
        H.beam('grmid', (x, GY0 - 0.35, 0.36), (x, GY1 + 0.08, 0.36), 0.03, flat(H.HBLUE, 0.5))
        L.snow_slab('grsnow', 0.06, (GY0 - GY1) * 0.5, 0.03, (x, (GY0 + GY1) / 2 + 0.3, 0.71), seed=66 + (s > 0))
    for y in (-2.85, -4.1):
        for s in (-1, 1):
            cyl('pillar', 0.13, -H.WATER_Z - 0.3 + 0.1, (GX + s * 0.4, y, H.WATER_Z - 0.1), mat=snowy('#C9CED6',
                                                                                                    lo=0.8, hi=0.95),
                segs=16, bevel=0.02)
            H.foam_ring('pfoam', GX + s * 0.4, y, 0.16)
    box('flap', (GW - 0.1, 0.42, 0.05), (GX, GY1 - 0.18, -0.04), rot=(-8, 0, 0), mat=H.hazard_mat(), bevel=0.01)
    H.life_ring('gring', (gx1 + 0.03, -3.55, 0.46), rz=90.0)
    T.street_lamp('glamp', (gx0 + 0.06, GY1 + 0.25, 0.0), h=1.9, col=H.NAVY_DARK)
    H.gull('ggull', (gx1 - 0.04, GY1 + 0.1, 0.7), rz=-120.0, s=0.85)
    # decor: luggage cart, timetable board, planters, snow
    lx, ly = -1.7, -1.5
    box('lcart', (0.8, 0.5, 0.07), (lx, ly, 0.2), mat=flat('#8A5A33', 0.7), bevel=0.02)
    for s in (-1, 1):
        cyl('lwheel', 0.1, 0.05, (lx + s * 0.28, ly - 0.27, 0.1), rot=(90, 0, 0), mat=flat('#3D424C', 0.5), segs=14,
            origin='center')
    box('lhandle', (0.05, 0.05, 0.55), (lx - 0.42, ly, 0.27), rot=(0, -25, 0), mat=flat('#3D424C', 0.5), bevel=0.0)
    for k, (dx, dz, w, col) in enumerate(((-0.17, 0.27, 0.4, '#C0473A'), (0.2, 0.27, 0.36, '#3D7CC9'),
                                          (0.02, 0.5, 0.34, '#E2B85A'))):
        box('suit', (w, 0.28, 0.22), (lx + dx, ly, dz), mat=flat(col, 0.55), bevel=0.04)
    for s in (-1, 1):
        cyl('ttpost', 0.04, 1.35, (-3.05 + s * 0.3, -1.7, 0.0), mat=flat(H.NAVY_DARK, 0.45, 0.5), segs=8)
    box('ttboard', (0.78, 0.07, 0.6), (-3.05, -1.7, 0.85), mat=flat('#2F3B46', 0.7), bevel=0.03)
    box('ttframe', (0.86, 0.05, 0.68), (-3.05, -1.67, 0.81), mat=flat(H.NAVY, 0.6), bevel=0.02)
    for k in range(4):
        box('ttline', (0.5 - 0.06 * (k % 2), 0.01, 0.04), (-3.08, -1.74, 1.28 - 0.12 * k),
            mat=flat(['#F2C14E', '#F4F1EA'][k % 2], 0.6), bevel=0.0)
    L.snow_slab('ttsnow', 0.8, 0.1, 0.04, (-3.05, -1.7, 1.46), seed=67)
    T.flower_tub('tub1', (-3.0, HY0 - 0.25, 0.0), r=0.2, evergreen=True, seed=68)
    T.flower_tub('tub2', (1.5, HY0 - 0.3, 0.0), r=0.2, evergreen=True, seed=69)
    LA.snow_drift('d1', 0.3, (X1 + 0.4, HY1 - 0.2, 0.0), seed=70)
    LA.snow_drift('d2', 0.22, (X0 + 0.2, HY1 + 0.1, 0.0), seed=71)
    # markers
    mark('door', (-0.8, HY0 - 0.85, 0.0), facing=(0, 1, 0))
    for k in range(3):
        mark('customer', (-2.55 + 0.06 * k, HY0 - 0.55 - 0.42 * k, 0.0), facing=(0, 1, 0))
    mark('staff', (GX + 0.95, -1.25, 0.0), facing=(-1, -0.4, 0))
    for k, x in enumerate((1.75, 1.2, 0.65, 0.1, -0.45)):
        mark('wait', (x, -1.35, 0.0), facing=(1, 0, 0))
    for x in (0.25, 0.95):
        mark('seat', (x, HY0 - 0.42, 0.0), facing=(0, -1, 0))
    for y in (-1.75, -2.95, -4.1):
        mark('board', (GX, y, 0.0), facing=(0, -1, 0))
    mark('gangway', (GX, GY1 - 0.3, 0.0))
    mark('berth', (GX, GY1 - 0.42, H.WATER_Z))
    return {'fx': {'bell': (TX, TY - 0.4, TH_ - 0.4), 'clock': (TX, TY - TW / 2, TH_ - 0.45), 'flag': (GX, -1.5, 2.1),
                   'sign': (sx, sy, sz + 0.85)},
            'extra': {'quayEdge': [iso_px(-3.2, Y0), iso_px(3.2, Y0)], 'berthAxis': 'x', 'berthSide': '-Y'}}


# water tiles (piers, quay walls, breakwater, buoy) and the remaining buildings / props register themselves here
import harbor_water  # noqa: E402,F401
import harbor_bld  # noqa: E402,F401
import harbor_props  # noqa: E402,F401
