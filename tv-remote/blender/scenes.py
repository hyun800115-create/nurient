"""Builds and renders the intro shots. Usage:
    python scenes.py -- OUT_DIR [scene numbers...] [--preview]
Writes OUT_DIR/sceneN.png and OUT_DIR/sceneN.json (callout anchor points, 0..1 from the top-left).
"""
import sys, os, math, json
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy
from mathutils import Vector, Matrix
from common import *
from human import Person
import props as P

ROOT = os.path.dirname(HERE)
LOGO = os.path.join(ROOT, "src", "logo.png")
OUT, PREVIEW, ANCHORS_ONLY = None, False, False
VARIANTS = {}   # scene number -> [(name, camera loc, target, lens, fstop)] extra shots of the same set


def configure(out, preview=False, anchors_only=False):
    global OUT, PREVIEW, ANCHORS_ONLY
    OUT, PREVIEW, ANCHORS_ONLY = out, preview, anchors_only
    os.makedirs(OUT, exist_ok=True)


def finish(n, anchors, samples=96, res=(810, 1440)):
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = (res[0] // 2, res[1] // 2) if PREVIEW else res
    with open(os.path.join(OUT, f"scene{n}.json"), "w") as f:
        json.dump(project(anchors), f)
    if ANCHORS_ONLY:
        return
    if not VARIANTS.get(f"skip{n}"):
        render(os.path.join(OUT, f"scene{n}.png"), samples=24 if PREVIEW else samples)
    for name, loc, target, lens, fstop in VARIANTS.get(n, []):
        camera(loc, target, lens=lens, fstop=fstop)
        render(os.path.join(OUT, f"{name}.png"), samples=24 if PREVIEW else samples)


def asphalt():
    return P.noisy("asphalt", "#3f444b", "#50565e", scale=40.0, rough=0.9)


def lot_ground():
    ground(120, asphalt())


# 1. pre-departure check at the charger
def scene1():
    reset()
    world("#bcd7ee", 0.9)
    sun((math.radians(52), 0, math.radians(-35)), 3.2)
    lot_ground()
    white = mat("line", "#e9eef3", rough=0.6)
    for x in (-2.6, 2.6):
        box("line", (x, 0.2, 0.004), (0.1, 5.4, 0.008), white)
    box("evbay", (0, 0.2, 0.002), (5.1, 5.4, 0.004), mat("evgreen", "#2c8f55", rough=0.7))
    P.building((0, 9.5, 6), (40, 2, 12), P.facade("fac1"))
    box("curb", (0, 7.6, 0.08), (40, 1.2, 0.16), mat("curbc", "#c9cdd2", rough=0.8))
    for x in (-11, 9, 15):
        P.tree((x, 7.6, 0.16), h=4.6, r=1.4)
    car = P.ray_ev((0, 0, 0), logo_path=LOGO)
    ch = P.charger((2.45, -0.95, 0), yaw=0.42)
    curve_tube("cable", [ch["plug"], ch["plug"] + Vector((-0.05, -0.05, -0.6)), Vector((2.15, -0.75, 0.05)), Vector((1.98, -0.45, 0.3)), car["port"]], 0.022, mat("cablec", "#1d2025", rough=0.5))
    w = Person("w", pos=(1.0, -1.36, 0), face=math.pi - 0.45, hip=0.56,
               legs={"L": (1.45, 0.12, 0.05), "R": (0.08, 0.06, -1.62)}, feet={"L": 0.0, "R": 1.2},
               arms={"L": (0.95, 0.25, 1.15, 0.25), "R": (0.75, 0.05, 1.05, 0.15)}, head=(0.15, -0.25),
               gear=dict(helmet=False, cap=True, gloves=True, vest=True)).build()
    camera((4.7, -5.1, 1.3), (0.7, -0.3, 0.98), lens=33, fstop=5.6, focus=(1.0, -1.3, 0.8))
    finish(1, dict(tire=car["front_tire"], screen=ch["screen"], roof=car["roof"], worker=w.anchors["back"]))


# 2. safe driving (camera tracks the car; background streaks)
def scene2():
    reset()
    sc = bpy.context.scene
    world("#bcd7ee", 0.9)
    sun((math.radians(50), 0, math.radians(-40)), 3.2)
    ground(400, asphalt())
    white = mat("line", "#e9eef3", rough=0.6)
    for i in range(-30, 30):
        box("lane", (i * 6.0, -2.6, 0.004), (3.0, 0.15, 0.008), white)
    box("sidewalk", (0, 4.2, 0.08), (400, 3.0, 0.16), mat("walk", "#c4c9cf", rough=0.85))
    for i in range(-10, 10):
        P.tree((i * 8.0 + 2, 4.6, 0.16), h=4.5, r=1.4)
        P.building((i * 14.0, 12.5 + (i % 3), 4 + (i % 4) * 1.5), (11, 4, 8 + (i % 4) * 3), P.facade(f"fac{i % 3}", glass=("#9fb6cc", "#a9bfd0", "#93acc4")[i % 3]))
    sign = P.speed_sign((-0.6, 3.5, 0.16))
    rig = bpy.data.objects.new("rig", None)
    link(rig)
    car = P.ray_ev((0, 0, 0), logo_path=LOGO, glass_clear=True, wheel_spin=(0, 2, 1.0 / 0.3))
    d = Person("d", pos=(0.42, 0.38, 0.0), face=math.pi / 2, hip=0.66,
               legs={"L": (1.45, 0.05, 0.35), "R": (1.45, 0.05, 0.35)}, arms={"L": (0.95, 0.15, 1.45, 0.1), "R": (0.95, 0.15, 1.45, 0.1)},
               lean=-0.18, gear=dict(helmet=False, vest=False, gloves=False, badge=True)).build()
    d._strap([(-math.pi / 2 + 0.95, 1.43), (-math.pi / 2 - 0.8, 1.0)], "belt_strap", width=0.045, off=0.012, material=mat("seatbelt", "#a7aeb8", rough=0.5))
    movers = car["objs"] + d.objs + [o for o in bpy.data.objects if o.name.startswith("hub")]
    for o in movers:
        if o.parent is None:
            o.parent = rig
    cam = camera((5.6, -5.3, 1.05), (0.55, 0, 1.15), lens=36, fstop=4.0, focus=(1.2, -0.6, 1.0))
    cam.parent = rig
    rig.location.x = -0.5
    rig.keyframe_insert("location", frame=0)
    rig.location.x = 0.5
    rig.keyframe_insert("location", frame=2)
    sc.frame_set(1)
    sc.render.use_motion_blur = True
    sc.render.motion_blur_shutter = 0.5
    finish(2, dict(driver=d.anchors["chest"], window=car["window"], sign=sign, front=car["front_tire"]))


# 3. installing B tv in a living room
def scene3():
    reset()
    world("#20242a", 0.3)
    wall = mat("wall", "#ece5d9", rough=0.9)
    ground(30, P.planks())
    box("backwall", (0, 2.1, 2.5), (14, 0.1, 5.0), wall)
    box("leftwall", (-2.3, 0, 2.5), (0.1, 10, 5.0), wall)
    box("skirting", (0, 2.04, 0.05), (14, 0.03, 0.1), mat("skirt", "#f6f2ea", rough=0.5))
    win = mat("window_light", "#dcefff", emit="#eef6ff", strength=6)
    box("window", (-2.24, 0.2, 1.55), (0.02, 1.4, 1.5), win)
    frame = mat("frame", "#f6f6f6", rough=0.4)
    for z in (0.79, 2.31):
        box("wf", (-2.22, 0.2, z), (0.05, 1.5, 0.06), frame)
    for y in (-0.53, 0.2, 0.93):
        box("wf", (-2.22, y, 1.55), (0.05, 0.06, 1.55), frame)
    area((-1.4, 0.2, 1.7), (0.5, 1.2, 0.6), 220, 1.5, "#eaf4ff")
    area((1.5, -2.0, 2.6), (0.3, 1.2, 0.8), 160, 3, "#ffe4c4")
    wood = mat("cab", "#6b5040", rough=0.5)
    box("cabinet", (0.55, 1.78, 0.26), (1.9, 0.42, 0.52), wood, bevel=0.01)
    tv = P.living_room_tv_image(os.path.join(OUT, "tv_screen.png"))
    box("tv", (0.55, 2.02, 1.32), (1.25, 0.05, 0.73), mat("tvb", "#121418", rough=0.3), bevel=0.01)
    image_plane("tvscreen", tv, (0.55, 1.993, 1.32), 1.19, 0.67, rot=(math.pi / 2, 0, 0), emit=2.2)
    stb = box("stb", (0.72, 1.7, 0.555), (0.42, 0.26, 0.06), mat("stbw", "#f2f3f5", rough=0.35), bevel=0.01)
    ellipsoid("led", (0.87, 1.568, 0.56), (0.006,) * 3, mat("ledg", "#39d96f", emit="#39d96f", strength=10))
    curve_tube("hdmi", [(0.62, 1.84, 0.56), (0.6, 1.98, 0.7), (0.5, 1.99, 1.0)], 0.007, mat("cablec", "#1d2025"))
    sofa = mat("sofa", "#8d939b", rough=0.9)
    box("sofa", (-1.75, 0.9, 0.25), (0.9, 2.0, 0.5), sofa, bevel=0.08)
    box("sofaback", (-2.08, 0.9, 0.62), (0.25, 2.0, 0.6), sofa, bevel=0.08)
    cylinder("pot", (-1.0, 1.75, 0), (-1.0, 1.75, 0.45), 0.2, mat("pot", "#e8e2d6"), r1=0.16)
    for dx, dz, s in ((0, 0.75, 0.32), (0.12, 0.95, 0.24), (-0.1, 1.05, 0.22)):
        ellipsoid("plant", (-1.0 + dx, 1.75, dz), (s, s, s * 1.2), P.noisy("leaf", "#2f7d43", "#4e9e58", 3.0))
    w = Person("w", pos=(1.3, 1.08, 0), face=-math.pi / 2 + 0.4, hip=0.56,
               legs={"L": (0.05, 0.06, -1.62), "R": (1.45, 0.1, 0.05)}, feet={"L": 1.2, "R": 0.0},
               arms={"L": (0.35, 0.15, 0.6, 0.15), "R": (0.8, 0.55, 1.2, 0.7)}, head=(-0.3, -0.35),
               gear=dict(helmet=False, cap=True, vest=False, gloves=False, covers=True, badge=True)).build()
    camera((-0.75, -1.85, 1.3), (0.78, 1.35, 0.85), lens=28, fstop=5.6, focus=(1.2, 1.1, 0.8))
    finish(3, dict(covers=w.anchors["footL"], stb=Vector((0.72, 1.57, 0.56)), tv=Vector((0.55, 1.99, 1.32)), worker=w.anchors["back"]))


# 4. ladder work by two people
def scene4():
    reset()
    world("#bcd7ee", 1.0)
    sun((math.radians(48), 0, math.radians(-60)), 3.2)
    ground(120, P.noisy("concrete_g", "#9aa0a6", "#b1b6bb", 10.0))
    box("wall", (2.0, 0, 4.0), (2.0, 14, 8.0), P.bricks())
    box("tbox", (0.97, -0.75, 4.35), (0.06, 0.45, 0.38), mat("tboxc", "#e9edf2", rough=0.4), bevel=0.01)
    box("tbox_r", (0.94, -0.75, 4.52), (0.02, 0.45, 0.05), mat("red", "#e4002b"))
    base, top = Vector((-0.22, 0, 0.0)), Vector((0.95, 0, 4.7))
    dn, side = P.ladder(base, top)
    yel = mat("outrig", "#f0b21a", rough=0.5)
    cylinder("outrig", base + Vector((0.05, -0.7, 0.08)), base + Vector((0.05, 0.7, 0.08)), 0.03, yel)
    for s in (-1, 1):
        cylinder("brace", base + Vector((0.05, s * 0.68, 0.06)), base + Vector((0.02, s * 0.24, 0.45)), 0.022, yel)
        box("pad", base + Vector((0.05, s * 0.72, 0.02)), (0.14, 0.1, 0.04), mat("padb", "#1e1e1e"), bevel=0.01)
    rope = mat("rope", "#ffd23c", rough=0.7)
    curve_tube("tie", [top + Vector((-0.08, -0.28, -0.25)), top + Vector((0.0, -0.4, -0.2)), Vector((0.98, -0.45, 4.62)), Vector((0.99, -0.42, 4.7))], 0.012, rope)
    box("eye", (0.995, -0.42, 4.7), (0.03, 0.06, 0.06), mat("metal", "#c9cfd6", rough=0.25, metal=1.0))
    h0 = 1.75
    xl = lambda h: base.x + (top.x - base.x) * h / top.z
    c = Person("c", pos=(xl(h0) - 0.24, 0.0, h0), face=math.pi / 2, lean=0.22,
               legs={"L": (0.1, 0.02, 0.0), "R": (0.72, 0.02, 0.12)},
               arms={"L": (2.55, 0.32, 2.75, 0.22), "R": (2.2, 0.32, 2.5, 0.22)}, head=(0.0, 0.25),
               gear=dict(harness=True, gaiters=True)).build()
    s = Person("s", pos=(-0.95, 0.0, 0), face=math.pi / 2, lean=0.08,
               legs={"L": (0.2, 0.08, 0.05), "R": (-0.18, 0.08, -0.1)}, arms={"L": (1.25, 0.38, 1.5, 0.25), "R": (1.25, 0.38, 1.5, 0.25)},
               head=(0.0, 0.35), gear=dict(gaiters=True)).build()
    camera((-5.0, -6.2, 2.1), (0.15, 0.0, 2.45), lens=34, fstop=8)
    finish(4, dict(outrigger=base + Vector((0.05, -0.7, 0.1)), tie=Vector((0.98, -0.45, 4.62)), spotter=s.anchors["chest"], climber=c.anchors["back"]))


# 5. working on a utility pole at dusk
def scene5():
    reset()
    gradient_world("#1d2b4f", "#f0a060", 0.9)
    sun((math.radians(80), 0, math.radians(110)), 2.2, "#ffb070")
    area((-6, -6, 3), (0, 0, 4.5), 1800, 6, "#a8c4ff")
    ground(200, P.noisy("dirt", "#3a3f4a", "#474d58", 10.0))
    for i, (x, y, h) in enumerate(((-12, 18, 7), (-4, 22, 9), (6, 20, 6), (14, 24, 10), (-20, 26, 8))):
        box("house", (x, y, h / 2), (7, 5, h), mat("sil", "#2a3247", rough=0.9))
    conc = P.noisy("concrete", "#a9aeb4", "#c2c6cb", 12.0)
    cylinder("pole", (0, 0, 0), (0, 0, 11.0), 0.2, conc, r1=0.14, segs=40)
    box("crossarm", (0, 0, 10.1), (0.12, 2.4, 0.12), mat("steel", "#5b616b", rough=0.4, metal=0.7))
    ins = mat("insul", "#e3e7ec", rough=0.3)
    wire = mat("wire", "#14171c", rough=0.5)
    for y in (-1.0, -0.4, 0.4, 1.0):
        cylinder("ins", (0, y, 10.16), (0, y, 10.42), 0.05, ins)
        curve_tube("pw", sag((-30, y, 10.42), (30, y, 10.42), 0.8, 24), 0.012, wire)
    for z, r in ((6.3, 0.03), (6.05, 0.02)):
        curve_tube("tel", sag((-30, 0.25, z + 0.5), (30, 0.25, z + 0.5), 0.6, 24), r, wire)
    box("closure", (0.0, 0.25, 6.62), (0.7, 0.16, 0.2), mat("clos", "#2a2e35", rough=0.5), bevel=0.04)
    tb = box("tbox", (-0.27, 0.0, 4.75), (0.14, 0.42, 0.5), mat("tboxc", "#e9edf2", rough=0.4), bevel=0.015)
    box("tbox_r", (-0.35, 0.0, 5.02), (0.02, 0.42, 0.04), mat("red", "#e4002b"))
    curve_tube("drop", [(-0.25, 0.1, 5.0), (-0.2, 0.2, 5.6), (0.0, 0.25, 6.3)], 0.012, wire)
    bolt = mat("bolt", "#6b7078", rough=0.4, metal=0.8)
    for i, z in enumerate([2.0 + 0.45 * k for k in range(16)]):
        a = math.pi + (0.6 if i % 2 else -0.6)
        r = 0.2 - 0.06 * z / 11
        cylinder("bolt", (r * math.cos(a), r * math.sin(a), z), ((r + 0.22) * math.cos(a), (r + 0.22) * math.sin(a), z), 0.016, bolt, segs=12)
    feet_z = 3.35
    w = Person("w", pos=(-0.62, 0.0, feet_z), face=math.pi / 2, lean=-0.22,
               legs={"L": (0.55, 0.08, -0.05), "R": (0.2, 0.08, 0.02)},
               arms={"L": (1.35, 0.3, 1.75, 0.35), "R": (1.15, 0.25, 1.55, 0.3)}, head=(0.0, 0.1),
               gear=dict(harness=True, alarm=True, gaiters=True)).build()
    hl, hr = w.Wu(Vector((0.17, 0.0, 1.0))), w.Wu(Vector((-0.17, 0.0, 1.0)))
    zc = (hl.z + hr.z) / 2
    rr = 0.2 - 0.06 * zc / 11 + 0.03
    curve_tube("polestrap", [hl, Vector((-0.1, 0.24, zc)), Vector((rr * 0.6, rr, zc)), Vector((rr, 0, zc)), Vector((rr * 0.6, -rr, zc)), Vector((-0.1, -0.24, zc)), hr], 0.02,
               mat("harness", "#ffc928", rough=0.55))
    camera((-2.9, -3.4, 2.2), (-0.38, 0.0, 4.45), lens=30, fstop=8)
    finish(5, dict(back=w.anchors["dring"], strap=Vector((rr, 0, zc)), alarm=w.anchors["alarm"], tbox=Vector((-0.35, 0, 4.75))))


# 6. manhole: measure the air before going in
def scene6():
    reset()
    world("#bcd7ee", 0.9)
    sun((math.radians(50), 0, math.radians(-25)), 3.0)
    ground(200, asphalt())
    box("walk", (0, 6.5, 0.08), (60, 3, 0.16), mat("walk", "#c4c9cf", rough=0.85))
    for i in range(-4, 5):
        P.building((i * 12.0, 13.0, 6 + (i % 3) * 2), (10, 5, 12 + (i % 3) * 4), P.facade(f"fac{i % 3}", glass=("#9fb6cc", "#a9bfd0", "#93acc4")[i % 3]))
    for i in range(-4, 5):
        P.tree((i * 7.0 + 3, 6.6, 0.16), h=4.2, r=1.2)
    cylinder("hole", (0, 0, -0.01), (0, 0, 0.012), 0.45, mat("holeb", "#060607", rough=1.0), segs=48)
    bpy.ops.mesh.primitive_torus_add(location=(0, 0, 0.015), major_radius=0.48, minor_radius=0.035, major_segments=48, minor_segments=10)
    bpy.context.object.data.materials.append(mat("rim", "#5d636c", rough=0.4, metal=0.7))
    cylinder("lid", (0.95, -0.55, 0.0), (0.95, -0.55, 0.04), 0.46, mat("lidm", "#4a4f57", rough=0.45, metal=0.8), segs=48)
    yel = mat("tripod", "#f0b21a", rough=0.5)
    apex = Vector((0, 0, 2.05))
    for k in range(3):
        a = 2 * math.pi * k / 3 + 0.3
        cylinder("leg", apex, (0.95 * math.cos(a), 0.95 * math.sin(a), 0.0), 0.032, yel)
    box("winch", (0.3, 0.12, 1.25), (0.18, 0.16, 0.22), mat("winchc", "#2a2e35"), bevel=0.02)
    curve_tube("wcable", [apex, (0, 0, 1.0), (0, 0, -0.1)], 0.006, mat("steel", "#5b616b", rough=0.4, metal=0.7))
    stripe = P.stripes("barrier")
    for (x, y, yaw) in ((-0.2, 1.6, 0.0), (1.6, 0.3, math.pi / 2), (-1.7, 0.6, math.pi / 2)):
        R = Matrix.Rotation(yaw, 3, "Z")
        box("barrier", (x, y, 0.85), (1.6, 0.05, 0.22), stripe, rot=R, bevel=0.01)
        for s in (-0.7, 0.7):
            p = Vector((x, y, 0)) + R @ Vector((s, 0, 0))
            cylinder("bleg", p, p + Vector((0, 0, 0.96)), 0.025, mat("blegm", "#d9dde2", rough=0.4))
            box("bfoot", p + Vector((0, 0, 0.02)), (0.12, 0.45, 0.04), mat("bfootm", "#1e1e1e"), rot=R)
    for p in ((-2.0, -1.4, 0), (2.0, -1.2, 0), (1.5, -2.2, 0), (-2.4, -2.6, 0)):
        P.cone(p)
    a = Person("a", pos=(-0.85, -1.15, 0), face=-0.35, arms={"L": (0.12, 0.12, 0.12, 0.05), "R": (0.55, 0.05, 2.1, -0.35)}, head=(0.25, -0.35),
               gear=dict(gaiters=True)).build()
    hand = a.anchors["handR"]
    det = box("detector", hand + Vector((0.02, -0.06, 0.06)), (0.08, 0.04, 0.14), mat("detc", "#ffc928", rough=0.45), rot=Matrix.Rotation(-0.35, 3, "Z"), bevel=0.01)
    box("detscr", hand + Vector((0.02, -0.083, 0.09)), (0.06, 0.004, 0.05), mat("detg", "#1f3b2a", emit="#53e08a", strength=1.5), rot=Matrix.Rotation(-0.35, 3, "Z"))
    b = Person("b", pos=(1.25, 1.05, 0), face=-math.pi / 2 - 0.4, arms={"L": (0.1, 0.1, 0.1, 0.05), "R": (1.25, 0.1, 1.35, 0.05)}, head=(0.2, -0.2),
               gear=dict(gaiters=True)).build()
    camera((-1.9, -6.6, 1.75), (0.05, -0.1, 0.85), lens=36, fstop=6)
    finish(6, dict(detector=hand + Vector((0.02, -0.08, 0.1)), barrier=Vector((-0.2, 1.6, 0.9)), watchman=b.anchors["chest"], hole=Vector((0, 0, 0))))


# 7. full gear check in the studio
def scene7():
    reset()
    world("#0f1830", 0.5)
    navy = mat("cyc", "#17264d", rough=0.9)
    box("floorc", (0, 1.5, -0.01), (14, 10, 0.02), navy)
    box("backc", (0, 4.0, 4), (14, 0.1, 8), navy)
    area((-2.0, -3.0, 3.0), (-0.2, 0, 1.1), 1500, 2.5, "#fff3e6")
    area((2.4, -2.6, 1.8), (-0.2, 0, 1.1), 450, 2.5, "#c7d8ff")
    area((1.3, 2.2, 2.6), (-0.2, 0, 1.4), 1300, 1.5, "#ff8a3d")
    area((-1.6, 2.0, 2.4), (-0.2, 0, 1.4), 700, 1.5, "#9fc0ff")
    w = Person("w", pos=(-0.08, 0, 0), face=0.16, arms={"L": (0.12, 0.2, 0.18, 0.12), "R": (0.12, 0.2, 0.18, 0.12)},
               legs={"L": (0.02, 0.07, 0.0), "R": (0.02, 0.07, 0.0)}, head=(-0.1, 0.0), gear=dict(harness=True, alarm=True, gaiters=True)).build()
    camera((0.3, -3.9, 1.0), (0.3, 0, 0.93), lens=48, fstop=0)
    finish(7, dict(helmet=w.anchors["helmet"], alarm=w.anchors["alarm"], chest=Vector(w.anchors["chest"]) + Vector((0, 0, 0.0)), hand=w.anchors["handR"],
                   shin=w.anchors["shinR"], foot=w.anchors["footL"]))


# seat belt close-up for the driving scene (square)
def scene8():
    reset()
    world("#9fb8cf", 0.6)
    sun((math.radians(55), 0, math.radians(30)), 2.5)
    car = P.ray_ev((0, 0, 0), glass_clear=True)
    d = Person("d", pos=(0.42, 0.38, 0.0), face=math.pi / 2, hip=0.66,
               legs={"L": (1.45, 0.05, 0.35), "R": (1.45, 0.05, 0.35)}, arms={"L": (0.95, 0.15, 1.45, 0.1), "R": (0.95, 0.15, 1.45, 0.1)},
               lean=-0.18, head=(-0.15, 0.0), gear=dict(helmet=False, vest=False, gloves=False, badge=True)).build()
    d._strap([(-math.pi / 2 + 0.95, 1.43), (-math.pi / 2 - 0.8, 1.0)], "belt_strap", width=0.05, off=0.012, material=mat("seatbelt", "#a7aeb8", rough=0.5))
    area((0.6, -0.2, 1.4), (0.3, 0.38, 1.2), 60, 0.6, "#fff1e0")
    camera((0.62, -0.45, 1.28), (0.28, 0.38, 1.12), lens=20)
    finish(8, dict(belt=d.anchors["chest"]), samples=96, res=(640, 640))


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    configure(args[0], "--preview" in args, "--anchors" in args)
    want = [int(a) for a in args[1:] if not a.startswith("--")] or [1, 2, 3, 4, 5, 6, 7, 8]
    for n in want:
        globals()[f"scene{n}"]()
