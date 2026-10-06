"""Draw the launcher icon (remote above the company logo) into android/res/mipmap-*."""
import os
from PIL import Image, ImageDraw

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
N = 1024
img = Image.new("RGBA", (N, N), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle((0, 0, N - 1, N - 1), radius=220, fill="#ffffff")

# remote, drawn upright on its own layer then tilted
R = Image.new("RGBA", (420, 760), (0, 0, 0, 0))
r = ImageDraw.Draw(R)
r.rounded_rectangle((40, 20, 380, 740), radius=150, fill="#18212b")
r.rounded_rectangle((62, 42, 358, 718), radius=130, outline="#2e3a4a", width=6)
r.ellipse((168, 80, 252, 164), fill="#ea002c")                      # power
r.ellipse((120, 200, 300, 380), fill="#2e3a4a")                     # d-pad ring
r.ellipse((172, 252, 248, 328), fill="#f47725")                     # ok
for row in range(3):                                                # number keys
    for col in range(3):
        cx, cy = 125 + col * 85, 445 + row * 82
        r.rounded_rectangle((cx - 30, cy - 24, cx + 30, cy + 24), radius=14, fill="#e9edf2")
R = R.resize((340, 615), Image.LANCZOS).rotate(-18, resample=Image.BICUBIC, expand=True)
img.alpha_composite(R, (N // 2 - R.width // 2 - 60, 60))

# IR signal arcs from the remote tip
for i, pad in enumerate((70, 130, 190)):
    box = (660 - pad, 230 - pad, 660 + pad, 230 + pad)
    d.arc(box, 285, 345, fill="#f47725" if i % 2 else "#ea002c", width=34)

# company logo along the bottom
logo = Image.open(os.path.join(here, "logo.png")).convert("RGBA")
lw = 900
lh = round(logo.height * lw / logo.width)
img.alpha_composite(logo.resize((lw, lh), Image.LANCZOS), ((N - lw) // 2, 845 - lh // 2))

for name, size in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
    out = os.path.join(root, "android", "res", "mipmap-" + name)
    os.makedirs(out, exist_ok=True)
    img.resize((size, size), Image.LANCZOS).save(os.path.join(out, "ic_launcher.png"))
img.resize((512, 512), Image.LANCZOS).save(os.path.join(root, "android", "icon-512.png"))
