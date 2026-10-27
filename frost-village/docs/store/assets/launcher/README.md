# Launcher icon set — snow globe (store icon option A)

The phone home-screen icon that matches the new store icon (`../icon_512.png`). Made by
`docs/store/tools/make_graphics.py` from the Blender render in `docs/store/tools/icon_scenes.py` (scene `globe`, passes
`full` / `fg` / `bg`), built from the game's own house, pine and lamp models.

Nothing here is wired into a build yet. The APK/AAB today still carries the old chief icon from
`frost-village/assets/title/icon/`.

## `source/` — drop-in for `assets/title/icon/`

The same six files, names and sizes as `frost-village/assets/title/icon/`:

| file | size | what |
|---|---|---|
| `icon_1024.png` | 1024², opaque | full icon (legacy launchers get it with rounded corners) |
| `ic_launcher_foreground.png` | 432², transparent | adaptive foreground (108 dp layer; the globe sits inside the 66 dp safe circle) |
| `ic_launcher_background.png` | 432², opaque | adaptive background (navy → peach dusk) |
| `icon_512.png`, `icon_192.png`, `icon_maskable_512.png` | | web/PWA sizes, same art |

`tools/apk/build_apk.py` and `tools/apk/build_aab.py` read the first three (`make_icons()`), from `--icon-dir`, which
defaults to `<artifact>/../../assets/title/icon`. To use the new icon, the lead picks one of these:

- **Next build only**: pass `--icon-dir <repo>/frost-village/docs/store/assets/launcher/source`. With the release
  scripts, that is `AAB_EXTRA="--icon-dir …/docs/store/assets/launcher/source"` for `release_from_commit.sh`, or
  `APK_EXTRA=…` for `apk_from_commit.sh`.
- **For good**: copy the six files over `frost-village/assets/title/icon/` in a game commit (this also changes the
  web build's icons). Then every later build picks them up.

Do this before the first Play upload if possible, so that the store icon and the home-screen icon match.

## `res/` — what the build will produce (for checking)

`res/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/{ic_launcher, ic_launcher_round, ic_launcher_foreground,
ic_launcher_background}.png`, made with the same steps as `make_icons()` (rounded square for `ic_launcher`, circle crop
of the 72 dp view for `ic_launcher_round`, layers resized to 108 dp). The build makes these itself from `source/`;
`res/` is only a preview of the result. There is no monochrome layer (themed icons), as before.
