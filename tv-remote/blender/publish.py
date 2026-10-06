"""Copy rendered shots into src/photos as JPEG with their callout points.
Usage: python publish.py RENDER_DIR [scene numbers...]"""
import json, os, shutil, sys
from PIL import Image

here = os.path.dirname(os.path.abspath(__file__))
dest = os.path.join(os.path.dirname(here), "src", "photos")
src = sys.argv[1]
nums = sys.argv[2:] or [str(n) for n in range(1, 9)]
os.makedirs(dest, exist_ok=True)
for n in nums:
    png = os.path.join(src, f"scene{n}.png")
    if not os.path.exists(png):
        continue
    Image.open(png).convert("RGB").save(os.path.join(dest, f"scene{n}.jpg"), "JPEG", quality=90, optimize=True)
    js = os.path.join(src, f"scene{n}.json")
    if os.path.exists(js):
        shutil.copy(js, os.path.join(dest, f"scene{n}.json"))
    print("published scene", n)
