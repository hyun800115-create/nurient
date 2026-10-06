"""Draw the launcher icon (a remote with a keypad) into android/res/mipmap-*."""
import os
from PIL import Image, ImageDraw

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
N = 768
img = Image.new("RGBA", (N, N), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle((0, 0, N - 1, N - 1), radius=170, fill="#18212b")
# remote body
x0, y0, x1, y1 = 254, 160, 514, 720
d.rounded_rectangle((x0, y0, x1, y1), radius=96, fill="#eceff2")
# power button
d.ellipse((351, 210, 417, 276), fill="#c8392b")
# 3x4 keypad
for r in range(4):
    for c in range(3):
        cx, cy = 306 + c * 78, 356 + r * 82
        d.rounded_rectangle((cx - 26, cy - 22, cx + 26, cy + 22), radius=12, fill="#18212b")
# IR signal arcs
for i, w in enumerate((0, 1)):
    pad = 40 + i * 44
    d.arc((384 - pad - 60, 112 - pad, 384 + pad + 60, 112 + pad + 40), 200, 340, fill="#c8392b", width=20)
for name, size in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
    out = os.path.join(root, "android", "res", "mipmap-" + name)
    os.makedirs(out, exist_ok=True)
    img.resize((size, size), Image.LANCZOS).save(os.path.join(out, "ic_launcher.png"))
img.resize((512, 512), Image.LANCZOS).save(os.path.join(root, "android", "icon-512.png"))
