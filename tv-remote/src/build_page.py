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
logo = "data:image/png;base64," + base64.b64encode(open(os.path.join(here, "logo.png"), "rb").read()).decode()
data = json.dumps(json.load(open(os.path.join(here, "brands.json"), encoding="utf-8")), ensure_ascii=False, separators=(",", ":"))
page = (head + body + intro).replace("__DATA__", data).replace("__LOGO__", logo)

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
