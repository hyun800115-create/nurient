"""Test lineup of the 3D technician: front, side, back and a face close-up."""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
from human import Person

out = sys.argv[-1]
sc = reset()
sc.render.resolution_x, sc.render.resolution_y = 1400, 800
world("#c9d6e3", 0.7)
ground(40, mat("floor", "#b8c0c9", rough=0.8))
sun((math.radians(50), 0, math.radians(30)), 3.0)
area((-3, -5, 4), (0, 0, 1), 900, 4)
gear = dict(harness=True, alarm=True, gaiters=True)
Person("a", pos=(-2.1, 0, 0), gear=gear).build()
Person("b", pos=(-0.7, 0, 0), face=math.pi / 2, gear=gear,
       arms={"L": (0.3, 0.05, 0.6, 0.05), "R": (-0.2, 0.05, 0.1, 0.05)}, legs={"L": (0.25, 0.03, 0.05), "R": (-0.15, 0.03, -0.2)}).build()
Person("c", pos=(0.7, 0, 0), face=math.pi, gear=gear).build()
Person("d", pos=(2.1, 0, 0), gear=dict(helmet=False, cap=True, vest=False, gloves=False, covers=True, badge=True),
       arms={"L": (0.9, 0.1, 1.4, 0.05), "R": (0.1, 0.12, 0.2, 0.05)}).build()
camera((0, -9.5, 1.05), (0, 0, 0.98), lens=50)
render(out, samples=48)
