"""Assemble the code finder page from its parts.

Writes:
  tv-remote/index.html              standalone web page
  tv-remote/android/assets/index.html  page bundled into the Android app (no web fonts)
  <out>/artifact.html               page body for the claude.ai artifact (optional 1st arg)
"""
import base64, json, os, re, sys

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
head = open(os.path.join(here, "head.part.html"), encoding="utf-8").read()
body = open(os.path.join(here, "body.part.html"), encoding="utf-8").read()
intro = open(os.path.join(here, "intro.part.html"), encoding="utf-8").read()
person = open(os.path.join(here, "person.js"), encoding="utf-8").read()


def scene_photos():
    """Images in src/photos/ (scene1..scene7, plus scene8 = seat belt close-up) replace that scene's drawing.
    An optional sceneN.json beside an image gives callout points as [x, y] fractions from the top-left."""
    found = {}
    folder = os.path.join(here, "photos")
    if not os.path.isdir(folder):
        return found
    from io import BytesIO
    from PIL import Image
    for name in sorted(os.listdir(folder)):
        m = re.fullmatch(r"scene(\d+)\.(jpe?g|png|webp)", name, re.I)
        if not m:
            continue
        im = Image.open(os.path.join(folder, name)).convert("RGB")
        im.thumbnail((720, 1280))
        buf = BytesIO()
        im.save(buf, "JPEG", quality=84, optimize=True)
        entry = {"src": "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()}
        spots = os.path.join(folder, f"scene{m.group(1)}.json")
        if os.path.exists(spots):
            entry["a"] = json.load(open(spots, encoding="utf-8"))
        found[m.group(1)] = entry
    return found


def header_logos(height=90):
    """The company logo for the page header as transparent PNGs, one per theme.
    logo.png (752x144) is drawn on white. The dark-theme copy is the reversed logo:
    all lettering turns light and only the SK wing keeps its red and orange."""
    from io import BytesIO
    import numpy as np
    from PIL import Image
    rgb = np.asarray(Image.open(os.path.join(here, "logo.png")).convert("RGB"), float)
    low = rgb.min(axis=2)
    # the red and orange inks never go below ~50 in their weakest channel, black ink does
    colored = rgb.max(axis=2) - low > 40
    alpha = (255 - low) / np.where(colored, 205, 255)
    alpha = np.clip((alpha - 0.04) / 0.96, 0, 1)
    ink = np.clip(255 - (255 - rgb) / np.maximum(alpha, 1e-3)[..., None], 0, 255)
    # the wing sits above and right of SK; the K below it and 브로드밴드 to its lower right are lettering
    y, x = np.mgrid[:rgb.shape[0], :rgb.shape[1]]
    wing = (x >= 460) & (x <= 562) & (y <= 93) & ~((x < 498) & (y >= 76)) & ~((x >= 528) & (y >= 84))
    out = {}
    for theme, light in (("light", None), ("dark", (231, 235, 239))):
        col = ink.copy()
        if light:
            col[wing] = np.clip(col[wing] * 1.12, 0, 255)
            col[~wing] = light
        im = Image.fromarray(np.dstack([col, alpha * 255]).astype(np.uint8), "RGBA")
        im = im.resize((round(im.width * height / im.height), height), Image.LANCZOS)
        buf = BytesIO()
        im.save(buf, "PNG", optimize=True)
        out[theme] = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    return out


intro = intro.replace("/*__PERSON__*/", person).replace("__PHOTOS__", json.dumps(scene_photos()))
logo = "data:image/png;base64," + base64.b64encode(open(os.path.join(here, "logo.png"), "rb").read()).decode()
brand = header_logos()
data = json.dumps(json.load(open(os.path.join(here, "brands.json"), encoding="utf-8")), ensure_ascii=False, separators=(",", ":"))
page = ((head + body + intro).replace("__DATA__", data).replace("__LOGO_LIGHT__", brand["light"])
        .replace("__LOGO_DARK__", brand["dark"]).replace("__LOGO__", logo))

def document(p):
    i = p.index('<div class="wrap">')
    return ('<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            + p[:i] + '</head>\n<body>\n' + p[i:] + '\n</body>\n</html>\n')

open(os.path.join(root, "index.html"), "w", encoding="utf-8").write(document(page))
offline = re.sub(r'<link rel="(?:preconnect|stylesheet)" href="https://fonts\.[^"]+"[^>]*>\n', "", page)
os.makedirs(os.path.join(root, "android", "assets"), exist_ok=True)
open(os.path.join(root, "android", "assets", "index.html"), "w", encoding="utf-8").write(document(offline))
if len(sys.argv) > 1:
    open(os.path.join(sys.argv[1], "artifact.html"), "w", encoding="utf-8").write(page)
