# Unity port — vertical slice hand-off (read me first)

Written on the cloud side (Linux, no Unity) for the Claude Code session on the designer's Windows PC
(`D:\Work\Snowbloom`). Nothing here is the Unity project itself; the Unity project stays local until the designer
has tested it and decides where to upload it.

| Path | What |
|---|---|
| `README_ko.md` | Plain-Korean summary for the designer (what the slice contains, steps, what the person does) |
| `specs/00_architecture.md` | **The plan to follow**: decisions A1–A22, project layout, packages, asmdefs, rendering, assets, input, save, work packages WP-0…WP-12 + WP-R, `ci.ps1`, risks, §14 critique resolution |
| `specs/01…07_*.md` | Port specs per subsystem (core/view, world/ground, buildings/draw order, characters/navigation, asset formats, opening loop, save) with exact numbers and Phaser file:line sources |
| `review/crit_*.md` | The two reviews (Unity feasibility, fidelity) that revision 2 of the architecture resolved |
| `Golden/` | Oracle files: `02_world_ground_static.json` (→ `Data/world_static.json`), `07_save_golden.json`, `07_save_code_v4202_25min.txt`; the WP-R Phaser references (display list, traces, screenshots) are added here later |
| `Data/*.json` | Phaser data modules exported by `tools/export_data.mjs` (world, balance, strings, items, staff looks, ids43, version) |
| `tools/export_data.mjs` | Re-export with Node 22 when the Phaser data changes |

Notes
- The specs were written in a scratchpad; any path like `/tmp/claude-0/…/scratchpad/unity/specs/<file>` means the file of
  the same name in this folder (`specs/`, `Golden/` or `review/`).
- Phaser source paths (`src/…`, `tools/test/…`, `assets/…`) are relative to `nurient/frost-village` at the commit this
  folder was pushed with (branch `ccr-d4ece854-h4aw8v`).
- Fixed by the owner after revision 2: slice package id **`com.snowbloom.village.slice`**, app label **눈꽃마을 시험판**,
  Unity 6000.3.x already installed at the Hub's default location, project at `D:\Work\Snowbloom\SnowbloomUnity`
  (Universal 2D template), nothing is pushed to GitHub until the designer has tested the slice.
- Rules that carry over: never touch or look for signing keys; the slice uses Unity's debug key only; the admin PIN digits
  are never written anywhere (only the salted SHA-256 digest, as in the Phaser code); talk to the designer in plain
  Korean (해요체).
