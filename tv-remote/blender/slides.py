"""Extra 3D shots for the photo slideshow. Usage: python slides.py -- OUT_DIR [--preview]"""
import sys, os, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy
from mathutils import Vector
from common import *
from human import Person
import props as P
import scenes as S


def team():
    reset()
    world("#bcd7ee", 0.9)
    sun((math.radians(50), 0, math.radians(-20)), 3.0)
    S.lot_ground()
    P.building((0, 10.5, 6), (40, 2, 12), P.facade("fac1"))
    P.ray_ev((0.2, 1.9, 0), logo_path=S.LOGO)
    full = dict(harness=True, alarm=True, gaiters=True)
    Person("t1", pos=(-1.25, -0.55, 0), face=0.12, gear=full, arms={"L": (0.1, 0.15, 0.1, 0.1), "R": (0.1, 0.15, 0.1, 0.1)}).build()
    Person("t2", pos=(-0.42, -0.75, 0), face=0.04, gear=dict(gaiters=True), arms={"L": (0.1, 0.15, 0.1, 0.1), "R": (2.75, 0.35, 2.95, 0.15)}).build()
    Person("t3", pos=(0.42, -0.75, 0), face=-0.04, gear=dict(helmet=False, cap=True, vest=False, gloves=False, badge=True), arms={"L": (0.1, 0.15, 0.1, 0.1), "R": (0.1, 0.15, 0.1, 0.1)}).build()
    Person("t4", pos=(1.25, -0.55, 0), face=-0.12, gear=full, arms={"L": (2.75, 0.35, 2.95, 0.15), "R": (0.1, 0.15, 0.1, 0.1)}).build()
    camera((0.0, -5.6, 1.4), (0.0, 0, 1.1), lens=40, fstop=8)
    S.finish("_team", {})


def helmet():
    reset()
    world("#bcd7ee", 0.9)
    sun((math.radians(45), 0, math.radians(-40)), 3.0)
    S.lot_ground()
    P.building((0, 12, 6), (40, 2, 12), P.facade("fac1"))
    for x in (-5, 4):
        P.tree((x, 8, 0), h=4.6, r=1.4)
    Person("h", pos=(0, 0, 0), face=0.25, head=(-0.2, 0.0), gear=dict(harness=True, alarm=True)).build()
    camera((-0.05, -1.3, 1.62), (0.02, 0, 1.55), lens=50, fstop=2.8, focus=(0, -0.08, 1.62))
    S.finish("_helmet", {})


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    S.configure(args[0], "--preview" in args)
    # the barrier and cones seen low from the side, from the manhole set
    S.VARIANTS[6] = [("scene6_fence", (-3.2, -3.4, 0.75), (-0.4, 0.6, 0.65), 32, 5.6)]
    S.VARIANTS["skip6"] = True
    team()
    helmet()
    S.scene6()
