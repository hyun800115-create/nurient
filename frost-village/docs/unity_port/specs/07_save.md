# 07 · Save and load, old-save remap (R43), 마을 옮기기 transfer code — Unity port spec

Source: Phaser 3.90 game at `/home/user/nurient/frost-village`, build `v4.3.0-a3.2` (`src/data/version.js`), save shape
`SAVE_VERSION = 8`, content level `LV = 43`, layout marker `LAY = 2`.
Target: Unity 6.3 LTS, URP 2D, C# 9, Android phone (Windows editor).
Reader: a C# engineer who does not read JavaScript. Every number and string below is copied from the code. File/line
references are for audit only.

Tags: **SLICE** = needed for the go/no-go vertical slice. **SLICE+** = recommended in the slice if time allows (cheap,
protects villages). **LATER** = after the slice. **DROP** = browser workaround, not needed in Unity.

Companion files written with this spec (same folder):

| File | What |
|---|---|
| `07_save_golden.json` | Golden outputs of the Phaser code for every fixture (load result, R43 moves/refunds, sites, coins, chief spot), 6 full sanitized saves, MIGRATE vectors, a hostile-input sanitize vector, the `storedIsNewer` matrix, transfer-code vectors (CRC32, an exact uncompressed code, a compressed code, 10 decode cases), `isGameKey` and `markImported` cases. §12. |
| `07_save_code_v4202_25min.txt` | A real 마을 옮기기 code (2,302 characters) of fixture `v4202_25min.json` (a 4.2.0.2 village). Paste it into the Unity slice's 불러오기 on the phone to run acceptance test S-3. |

Companion specs: `01_core_view.md` (px space with y down, `JsRound`, Settings fields, app pause), `03_buildings_depth.md`
§5.10 (pictures of finished buildings), `02_world_ground.md` §13 (old saves draw on the same world) and
`02_world_ground_static.json` (`plots`, `towers`), `04_characters_nav.md` §6.6 (chief save/restore), §13.11 (residents),
`06_opening_loop.md` §15 (the loop's save fields: grill stacks, shelf, till, bag, `onb`). This spec owns: the storage keys,
the store, the save JSON as a whole, versions, the MIGRATE chain, the sanitizers, R43, write/hold rules, autosave, the
transfer code and the test data.

---

## 0. Summary (read first)

| # | Decision / fact | Statement |
|---|---|---|
| S1 | One save = one JSON text | Key `frostVillage.save.v1`. Written whole every 5 s, on app pause and on quit. ~1.7 KB (new) … ~8 KB (late village); the "all caps" worst case is < 24,576 characters. §2, §9. |
| S2 | Keep the JSON identical | The Unity app reads and writes **the same JSON text** as the WebView app (same keys, same field names, same number style). This keeps 마을 옮기기 codes working both ways and makes the later WebView → Unity migration a copy. §13. |
| S3 | Store | A small key → string store that behaves like browser `localStorage` (files under `persistentDataPath`, atomic replace). Not `PlayerPrefs`, not `JsonUtility`. §2.2. |
| S4 | Head stamp | Every write starts with `{"v":8,"lv":43,"t":<ms>` in that order — the "is this save from a newer build" test reads only the head. §3. |
| S5 | Load = migrate → R43 → sanitize | `MIGRATE[1..7]` brings any v1–v7 save to v8; R43 moves an old village (no `v43.lay ≥ 2`) onto plot table v2 once (fixed workshop plots, refunds, chief to (370, 680)); `sanitizeSave` keeps only known, clamped fields. All three are pure JSON → JSON functions: port them with the golden file as the oracle. §5–§8. |
| S6 | Never lose a village | A save from a newer build is never loaded and never overwritten; a remap that cannot be proven lossless holds the save (fresh unsaved village + card); an unreadable save is copied aside before anything overwrites it. §9. |
| S7 | Pass-through | Blocks the slice does not simulate (v3, v4, c1, v42, bank, logistics, dog, x, …) are loaded, kept and written back unchanged, exactly as the Phaser game does for systems that are not running yet. §10.3. |
| S8 | Old save into the slice | The designer's real village lives in the WebView app; the only way into a separate Unity test app is the **마을 옮기기 code** (`SNOWBLOOM2.z.<n>.<base64url deflate-raw>.<crc32>`). Decode + dry run + apply is **SLICE**; making codes is LATER (cheap once decode exists). §11. |
| S9 | Slice fixture | `tools/test/fixtures/v4202_25min.json` (4.2.0.2, v7): after R43 6 buildings — toolsmith on `d_tool` (moved from `e_m1`), station `r_station`, houses on `w_s1/w_s2/w_s3`, watchtower `tower_east`; chief at (370, 680); east + rail land open; all 5 zones open. Second: `v43a3_fresh25.json` (a3.1, v8, flag + bakery). §12. |

---

## 1. Source map (Phaser files and line ranges)

| File | Lines | Content |
|---|---|---|
| `src/core/Save.js` | 15–47 | keys, `SAVE_VERSION`, `readJSON` / `writeJSON` / `removeKey` |
| | 49–72 | `LV`, `isNewerSave`, `stamp`, `HEAD_RE`, `storedIsNewer` |
| | 74–101 | site keep-lists (`BUILDINGS`, `SITE_STATES`, `UNIQ`, `XL_ONLY`, `REGIONS`), helpers `isObj`, `num`, `count`, `flags`, `counts` |
| | 102–177 | `MIGRATE` chain 1→8, `LINE_STATION`, `STATION_ZONE`, `PILE_IDS` |
| | 183–308 | `sanitizeSave` (top level) |
| | 310–479 | `sanitizeV42`, `keepBank`, `keepLogistics` |
| | 481–651 | `saveWarnings`, `sanitizeV43`, `X_CAPS`, `fitX`, `keepX`, `SLICES43`, `keepSlice`, `X43` holder |
| | 653–761 | `sanitizeC1`, `sanitizeV4` |
| | 763–838 | `keepCopy`, `migrateSaveEx`, `migrateSave`, `keepPre43` |
| | 842–1006 | `Save` object: `load`, `confirm43`, `failWith`, `write`, `hold`, `release`, `onHold`, `clear`, `quarantine` |
| | 1008–1044 | `ChatSave` (resident chat record), `newChatId` |
| | 1046–1093 | `Settings` |
| `src/core/Remap43.js` | 1–371 | R43: `MOVE43`, `OLD43`, `NEW43_PRICE`, `needsRemap`, `remap43`, `check43`, `check43b`, `sameJSON` |
| `src/core/Transfer.js` | 1–325 | 마을 옮기기 codec: `isGameKey`, `snapshotKeys`, `crc32`, base64url, `encodeVillage`, `decodeVillage`, `dryRun`, `summarize`, `applyVillage`, `markImported`, `backupCode` |
| `src/core/inflate.js` | 1–125 | raw-DEFLATE decoder (fallback for old WebViews) |
| `src/data/ids43.js` | 9–13, 16–32 | `LV`, `LAY`, `PRE43_KEY`, `CODE_FMT`, `PLOT43`, `WORKSHOP_PLOT43` |
| `src/data/version.js` | 1–3 | `VERSION = 'v4.3.0-a3.2'`, `BUILD_DATE = '2026-11-12'` |
| `src/data/items.js` | 6–31 | item lists, `priceOf` |
| `src/flag/design.js` | 16–43 | village flag fields, `CLASSIC`, `sanitizeFlag` |
| `src/scenes/Game.js` | 136–153 | `create`: build in try/catch → quarantine / failure card |
| | 155–291 | `build`: `Save.load`, the restore order, `afterRemap43` |
| | 391–399 | save on `visibilitychange` (hidden) / `pagehide` |
| | 1029–1038, 1113–1170 | `restoreLabour`, `restoreV3` (sites), `afterRemap43`, `restoreV3Stock` |
| | 2301–2302 | autosave timer |
| | 2466–2642 | `serialize`, `save` |
| | 2644–2690, 2715–2722 | `restore`, `resetProgress` (처음부터) |
| `src/systems/v43/hooks.js` | 72–80 | `v43Holder` (the `v43` block at build time) |
| `src/systems/Progression.js` | 165, 238–258, 342–410, 727–730 | `COMES_WITH`, constructor, `init` (replays done steps; `shop43`, `bakery43` fix-ups), `serialize` |
| `src/systems/Territory.js` | 26–41, 385–390 | regions from save, `serialize` |
| `src/entities/Site.js` | 217–240, 420–429 | `start` (restore a site), `serialize` |
| `src/entities/Station.js` | 173–179 | `{ i, o }` |
| `src/entities/Seller.js` | 137–143 | till `serialize` / `restore` |
| `src/systems/Labour.js` | 462–469 | pile `serialize` / `restore` |
| `src/systems/DayClock.js` | 13, 21–41, 152 | the village clock (`v4.clock`) |
| `src/systems/Neighbours.js` | 77–92, 798–812 | when the `v4` block is live, its `serialize` |
| `src/scenes/MovePanel.js` | 23–68, 184, 388–441, 494–557, 616–622 | 마을 옮기기 UI: strings, export, import |
| `src/scenes/SaveHoldCard.js` | 1–30 | the hold cards |
| `tools/test/fixtures/*.json` | — | 33 save fixtures (§12) |
| `tools/test/save_v43.mjs`, `transfer.mjs`, `inflate.test.mjs`, `save_v42.mjs` | — | the Node test suites these rules come from |
| `tools/apk/android/java/com/snowbloom/village/MainActivity.java`, `AssetRouter.java` | 274, 315; 18 | the WebView app: package `com.snowbloom.village`, origin `https://appassets.androidplatform.net`, `localStorage` on |

---

## 2. Storage

### 2.1 Keys (all strings; every value is a UTF-16 string as in `localStorage`)

| Key | Written by | Value | Travels in a code | Slice |
|---|---|---|---|---|
| `frostVillage.save.v1` | `Save.write` | the save JSON (§4) | yes | **SLICE** |
| `frostVillage.settings.v1` | `Settings.save` | settings JSON (Appendix B; full rules in 01) | yes | SLICE (store it under this key, same JSON) |
| `frostVillage.save.v1.chat` | `ChatSave.write` | `{"v":1,"cid":"…","t":ms,"chat":{…}}` resident chat memory, ≤ 600,000 chars read | yes | keep raw (LATER) |
| `frostVillage.save.v1.story` | story module (not wired in this build) | opaque | yes (if present) | keep raw |
| `frostVillage.title.v1` | title scene | `{"introSeen":true,"shown":1,"intro":null}` | yes | keep raw |
| `frostVillage.save.backup` | `keepCopy` | an unreadable / unknown save, kept once (first copy is never overwritten) | no | SLICE |
| `frostVillage.save.backup.2` | `keepCopy` | a second, different unreadable save (overwritten each time) | no | SLICE |
| `frostVillage.save.backup.pre43` | `keepPre43` | the stored text of an old village, byte for byte, before its first R43 | no | SLICE+ |
| `frostVillage.save.backup.pre43.2` | `keepPre43` | second pre-B slot (when slot 1 holds another village) | no | SLICE+ |
| `frostVillage.save.v1.bad` | `Save.quarantine` | a save that crashed the build | no | SLICE |
| `frostVillage.move.backup` | `applyVillage` | a **code** (§11) of the village that was here before the last 불러오기 (되돌리기) | no | SLICE |
| `frostVillage.move.admin` | admin panel | a code: the 관리자 사본 | no | LATER (admin) |

Key pattern accepted anywhere: `^frostVillage\.[A-Za-z0-9_.-]{1,64}$` (`Transfer.js` 39). A future key with the prefix
must be stored and carried even if this build does not know it.

### 2.2 The Unity store (replaces `window.localStorage`) — SLICE

```csharp
public interface IKeyValueStore {
    string GetItem(string key);                 // null when absent; never throws (I/O error -> null)
    void   SetItem(string key, string value);   // throws StoreWriteException (disk full, I/O); value exactly as given
    void   RemoveItem(string key);              // never throws
    IReadOnlyList<string> Keys();               // every stored key, any order
}
```

`FileKvStore` (recommended):
- Folder `Application.persistentDataPath + "/kv/"`. One file per key. File name = the key with every upper-case ASCII
  letter `X` written as `!x` (`frostVillage.save.v1` → `frost!village.save.v1`), so case-insensitive file systems
  (Windows editor, some Android sdcards) never merge two keys. `Keys()` reverses the mapping.
- Content: UTF-8, no BOM. `SetItem`: write `<name>.tmp`, `Flush(true)`, then `File.Replace(tmp, name, null)` when the
  target exists, else `File.Move(tmp, name)`. A crash mid-write leaves the old file intact.
- Keep an in-memory cache (dictionary) filled at start; `GetItem` reads the cache; `SetItem` updates file then cache.
- No quota (browsers had ~5 M characters). A write exception = "could not save" (§9.2).
- Main thread only (the game never saves from another thread); a write of ~10 KB every 5 s is cheap.

Why not `PlayerPrefs`: one XML file rewritten whole on every save, no atomic replace guarantee, no key listing (needed by
`snapshotKeys`). Why not `JsonUtility`: no dictionaries, no `null`, no unknown fields.

### 2.3 JSON text rules (keep the text exactly as JavaScript writes it) — SLICE

Use Newtonsoft Json.NET (Unity package `com.unity.nuget.newtonsoft-json`) with `JObject`/`JToken` for the raw tree.

| Topic | JavaScript behaviour (must match) | C# setting / rule |
|---|---|---|
| Numbers | All numbers are float64. Written by ECMA-262 `Number::toString`: shortest round-trip digits; integral values have **no** `.0` (`5`, not `5.0`); plain decimals for 1e-6 ≤ \|x\| < 1e21 (`0.000001`, `0.00001`, `0.0000015`), else exponent form without padding (`1e-7`, `1.5e-7`, `1e+21`) (checked in Node 22); integers above 2^53 as shortest digits padded with zeros (`123456789012345680`); `-0` as `0`; `NaN`/`Infinity` as `null`. | **(Revised after crit_unity 2; 00 §2.3 wins.)** Our own `JsNumber.Format(double)`: a self-contained shortest-digits routine (Ryu/Grisu-style port, integer maths only, identical on .NET 10, Unity Mono and IL2CPP) + the ECMA k/n placement rules. **Never** `ToString("R"/"G17"/"F0")`: Unity's BCL formats "R" the .NET Framework way (15 then 17 digits), and "R"/"G" switch to `E-05` below 1e-5 with a padded exponent. Never let Json.NET write numbers. Caps that measure JSON length (logistics 2048, `x` caps, slice caps) depend on this. |
| Number reading | Integers beyond 2^53 are just doubles; an out-of-range literal (`1e400`) parses as ±Infinity. | `FloatParseHandling.Double`; treat `JTokenType.Integer` (long or BigInteger) as `double`. Unity's BCL `double.Parse` rejects `1e400` (Newtonsoft then throws `JsonReaderException`): on that exception pre-scan the text for out-of-range numeric literals outside strings, re-read them as ±Infinity, and continue (test in D **and** E). |
| Strings | `JSON.stringify` escapes only `"`, `\`, and U+0000–U+001F (`\b \t \n \f \r` short forms, others `\u00XX` lower-case hex) and, since ES2019, lone surrogates (`\udXXX`, lower-case). Korean, `·`, U+0085, U+2028, U+2029 stay raw. | Our own escaper in `JsJsonWriter` (Newtonsoft's Default escaping always escapes U+0085/2028/2029 and writes lone surrogates raw). |
| Dates | Never parsed. | `DateParseHandling.None` (Json.NET otherwise turns ISO-looking strings into `DateTime` and rewrites them). |
| Key order | Insertion order; **integer-like keys ("12") come first in ascending order** (JS object rule). | `JObject` keeps insertion order. Integer-like keys only appear in hand-edited data; accept the difference (risk R8). |
| Duplicate keys | Last one wins. | `JsonLoadSettings { DuplicatePropertyNameHandling = Replace }` (default). |
| `undefined` members | Left out of the text. | Do not write `null` where JS writes nothing; write `null` only where JS has `null` (`market: null`, `v3.dock: null`, `intro: null`). |
| Length | Caps count UTF-16 code units of the JSON text. | `string.Length` is the same unit. |
| Regex `$` | JS `$` (no `m` flag) = end of text only. | In .NET use `\z` (not `$`, which also matches before a final `\n`). |
| Rounding | `Math.round` = floor(x + 0.5). | `JsRound` from 01. Never `Math.Round` (banker's). |

---

## 3. Versions, stamp, "newer save" test — SLICE

| Constant | Value | Where | Meaning |
|---|---|---|---|
| `SAVE_VERSION` | `8` | Save.js 45 | shape of the save; `MIGRATE[v]` turns v into v+1 |
| `LV` | `43` | ids43.js 10 | content level: every step-B build writes 43; v4.4–4.6 write 44–46, v5.0 writes 50 |
| `LAY` | `2` | ids43.js 11 | `v43.lay`: absent/0/1 = pre-B plot layout (R43 needed), 2 = plot table v2 |
| `CODE_FMT` | `2` | ids43.js 13 | transfer code format written; `CODE_FMT_MIN = 1` still read |
| `autosaveEvery` | `5` (s) | balance.js 253 | autosave interval |

```
stamp(state)  = { "v": 8, "lv": 43, "t": <now ms, integer> } followed by every member of state, in state's order
isNewerSave(o) = o is an object && (num(o.v, 0) > 8 || num(o.lv, 0) > 43)          // numeric strings count ("9" > 8)
HEAD_RE       = ^\{"v":(\d{1,4})(?:,"lv":(\d{1,4})[,}]|,(?!"lv")|\})
storedIsNewer(raw):
    if raw is not a non-empty string: false
    m = HEAD_RE.match(raw)
    if m: return int(m[1]) > 8 || (m[2] present && int(m[2]) > 43)
    try: return isNewerSave(JSON.parse(raw)) catch: false
```

`storedIsNewer` vectors (golden `newerMatrix`): `{"v":8,"lv":43,…}` false · `{"v":8,"lv":44,…}` true · `{"v":9,…}` true ·
`{"v":7,…}` false · `{"v":8,"lv":43.5,…}` true (falls to full parse) · `{"t":1,"v":9}` true · `{"v":"9"}` true ·
`not json` false · `{"v":8}` false · `{"v":8,"lv":"46"}` true.

A Unity build that adds content later must raise `lv` (44, 45 …), never reuse 43 for a different shape: the WebView app
then refuses its villages ("update first") instead of cutting them down.

---

## 4. The save JSON

### 4.1 Top level, in the order `Game.serialize` writes it (after the stamp)

| Key | Type / shape | Meaning | Slice |
|---|---|---|---|
| `v`, `lv`, `t` | int, int, ms (may be fractional in old fixtures, e.g. `1794553655616.3242`) | stamp (§3); `t` is informational (the 불러오기 card shows "saved at") | SLICE |
| `territory` | `{ region: true }` for opened regions: `east`, `south`, `se`, `rail`, `town`, `west_s` (`west` is open from the start and is not written) | land open (fog cleared) | **SLICE** (layout) |
| `sites` | `{ plotOrTowerId: Site }` (§4.3) | construction sites and finished buildings | **SLICE** (layout) |
| `v3` | `{ warehouse?, food, dock, workshops, store? }` | 창고 stock, miners' food box, boathouse, workshops, 잡화점 | pass-through |
| `coins` | int ≥ 0 (≤ 1e12) | wallet | **SLICE** |
| `progress` | §4.4 | steps done, partial payments, upgrades, one-time flags | **SLICE** |
| `stations` | `{ grill|sawmill|bakery|smelter|smokehouse: { i, o } }` | items on each station's input / output stack (incl. items flying there) | **SLICE** (grill; others pass-through) |
| `market` | `{ stock: { item_fish_cooked, item_bread, item_meat_cooked }, cash }` | shop shelf + the shop's one till | **SLICE** |
| `trade` | `{ stock: { item_plank, item_ingot }, cash: 0 }` | the shop's 자재 창구 (cash always 0 since v4.3; an old save's trade cash is added to the market till on load) | pass-through |
| `bakery` | `{ stock: { item_bread }, cash }` | bakery stall case + till | pass-through |
| `player` | `{ x: int, y: int, stack: [itemType…] }` | chief position (JsRound) and carried items, bottom first, + items flying to him | **SLICE** |
| `life` | `{ moved: [charKey…], snowman: 0..3, waiting: [charKey…] }` | residents who moved in (in order), snowman stage, residents waiting for a house | **SLICE** (moved) |
| `labour` | `{ piles: { fish, log, wheat, ore, meat } }` | collection piles; `fish` = the fish crate by the deck | SLICE (fish crate) / pass-through |
| `dog` | `{ love, gifts, tricks, cd: { treat?, play?, pet? }, treats }` | Nuri the dog | pass-through |
| `v4` | Appendix A.4 (`clock`, `town`, `orders`, `cargo`, `shops`, `houses`, `cash`, `rentAcc`, `happy`, `rank`, `porters`) | neighbour town, train, **the village clock** | pass-through |
| `c1` | `{ settlers, settleT, hall?, rest? }` | settlers, town hall tax box, big restaurant | pass-through |
| `cid` | `/^[a-z0-9]{4,16}$/` | chat record id (ties `.chat` to this save) | SLICE (keep / create) |
| `onb` | int 1..1023 (bits) | first-run tutorial state (06 §13) | SLICE |
| `flag` | `{ s, b, p, pc, e, ec }` (+ `mk: 1`) | village flag | pass-through (keep) |
| `adminUses`, `adminInf` | int > 0, `1` | admin marks (only when used) | pass-through |
| `v43` | `{ lay, toggles?, seen?, refunds43?, src? }` | R43 marker and step-B one-time keys (§4.5) | **SLICE** |
| `v42`, `bank`, `logistics` | Appendix A.6–A.8 | v4.2 office/news/letters/train/depot…, bank slice, logistics slice | pass-through |
| `x` | `{ key: value }` ≤ 24 keys, ≤ 6,400 chars | small keys of later builds (`log`, `g43` in v4.3) | pass-through |
| `missions`, `geumbang`, `haul`, `demand` | objects ≤ 3072 / 1400 / 768 / 1024 chars | later modules' slices, carried verbatim | pass-through |

Sizes: new village ≈ 1.7 KB, `v4202_25min` ≈ 4.0 KB, late village ≈ 7.9 KB, all caps < 24,576 characters.

### 4.2 Item and building vocabularies (`items.js`, `Save.js` 77–90)

| List | Values |
|---|---|
| `ITEMS` (18, this order) | item_fish_raw, item_fish_cooked, item_log, item_plank, item_wheat, item_bread, item_ore, item_ingot, item_meat_raw, item_meat_cooked, item_can, item_fish_big, item_axe, item_pickaxe, item_rod, item_sickle, item_bow, item_can_meat |
| `FOODS` | item_fish_cooked, item_bread, item_meat_cooked |
| `GOODS` = `MATERIALS` | item_plank, item_ingot |
| `STORE_GOODS` | item_can, item_axe, item_pickaxe, item_rod, item_sickle, item_bow, item_can_meat |
| `MINER_FOOD` | item_bread, item_meat_cooked |
| `FISH` | item_fish_raw, item_fish_big |
| `priceOf` (coins) | fish_raw 1, fish_cooked 4, log 1, plank 5, wheat 1, bread 7, ore 1, ingot 10, meat_raw 1, meat_cooked 12, can 12, fish_big 1, axe/pickaxe/rod/sickle/bow 40, can_meat 12 |
| `BUILDINGS` (site `b`) | toolsmith, warehouse, boathouse, cannery, store, house_a, house_b, house_c, watchtower, station, town_hall, big_restaurant, deco_snowman, deco_bench, deco_lamp, deco_flowers, deco_rink, deco_playground, deco_fountain, chief_office, bank42, depot42, labour_office |
| `SITE_STATES` | foundation, scaffold, done (a plain plot is not saved) |
| `UNIQ` (one per village) | town_hall, big_restaurant, station, toolsmith, warehouse, boathouse, cannery, store, labour_office |
| `XL_ONLY` | town_hall, big_restaurant |
| `REGIONS` (territory) | east, south, se, rail, town, west, west_s |
| `PILE_IDS` | fish, log, wheat, ore, meat |

### 4.3 `sites` — the village layout — SLICE

```
Site (finished)   = { "b": building, "st": "done" }
Site (unfinished) = { "b": building, "st": "foundation" | "scaffold", "got": { item_plank?: n, item_ingot?: n }, "t": seconds (1 decimal) }
```
- Key = a plot id of `WORLD.plots` or a tower id of `WORLD.towers` (positions in `02_world_ground_static.json`
  `plots` / `towers`). After sanitize, every entry also carries `got: {}` and `t: 0` (sanitized form; harmless).
- `got` = materials delivered (≤ need); `t` = build timer, clamp 0..600.
- Restore (Game.js 1113–1130), per entry in key order: find the `Site` for the id (a plot that is not `hidden`) or make a
  tower site for a tower id; none → add id to `restoreSkipped`. `site.start(b, instant, got)` (a foundation's `t` is not
  restored); `done` → `site.finish(instant)`; `scaffold` → `beginScaffold(instant, t)`. Then `refreshSites()`: a plot holding a building is
  shown as soon as its region is open (whatever its `after` condition says now).

Plot table v2 (37 plots + 3 towers; px, y down; resolved from `world.js` by Node):

| Id | x | y | size | region | only | hidden | Id | x | y | size | region | only | hidden |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| v_house1 | 1600 | 2235 | S | start | | | se_s3 | 2560 | 1700 | S | se | | |
| v_house2 | 430 | 2310 | S | start | | | se_s2 | 2060 | 1820 | S | se | | |
| h43_1 | 600 | 1040 | S | start | house_c | | r_station | 3410 | 1330 | XL | rail | station | |
| h43_2 | 1560 | 1640 | S | start | house_a | | w_rest | −600 | 880 | XL | west | | |
| d_tool | 60 | 1530 | M | start | toolsmith | | w_hall | 180 | 760 | XL | start | town_hall | |
| d_wh | 475 | 1525 | M | start | warehouse | | w_m1 | −250 | 1360 | M | west | | |
| d_cannery | 1890 | 485 | M | east | cannery | | w_m2 | −1100 | 1130 | M | west | | |
| d_store | 1990 | 1070 | M | east | store | | w_s1 | −170 | 1080 | S | west | | |
| e_dock | 2330 | 595 | M | east | boathouse | | w_s2 | −330 | 1660 | S | west | | |
| e_m1 | 2600 | 830 | M | east | | | w_s3 | −1150 | 1660 | S | west | | |
| e_m2 | 2520 | 985 | M | east | | | w_s4 | −440 | 2290 | S | west | | |
| s_m1 | 1360 | 2860 | M | south | | | w_s5 | −250 | 2010 | S | west | | |
| s_m2 | 1470 | 3235 | M | south | | | w_civic | −780 | 1880 | XL | west | civic43 | yes |
| s_l1 | 780 | 3220 | L | south | | | d_school | −1080 | 2000 | XL | west | school43 | yes |
| s_s1 | 1160 | 3190 | S | south | | | d_clinic | −1160 | 870 | L | west | clinic43 | yes |
| se_m1 | 2700 | 2640 | M | se | | | d_labour | −760 | 1440 | L | west | labour_office | yes |
| se_l1 | 2060 | 2860 | L | se | | | v42_office | 600 | 640 | M | start | chief_office | |
| se_s1 | 2560 | 3090 | S | se | | | v42_bank | −340 | 570 | M | west | bank42 | |
| | | | | | | | v42_depot | 3184 | 3101 | L | rail | depot42 | |

Towers: `tower_east` (1660, 845, east) · `tower_south` (1450, 2505, south, pad (−20, −106)) · `tower_se` (2870, 1370, se,
pad (−8, −94)). `WORLD.v43`: `oldStart` = (370, 680), `shopFront` = (1250, 1000). `WORLD.player` = (1130, 412).
World: width 6144, height 3450, left −1400.

### 4.4 `progress` — SLICE

```
progress = {
  "done":   { stepId: true },            // steps / unlocks done (zone_forest, hire_fisherman, mkt_s2, …); only true is kept
  "paid":   { stepId: coins },           // partial payments on standing pads
  "up":     { "capacity": 0..99, "speed": 0..99 },   // upgrade levels (Progression clamps to its table length)
  "celebrated": bool, "hints": { k: true }, "seen": { k: true }, "flags": { k: true },
  "got":    { padId: { itemType: n } },  // items delivered to pads
  "celebrated3": bool
}
```
Zones open = `done.zone_forest | zone_farm | zone_mine | zone_hunt` (the plaza is always open). The Phaser build replays
every done step at load (`Progression.init`, applyStep instant) — that is how stations, clerks, porters, huts and zone
floors of an old save appear. Progression is another spec; the save layer only hands over the object.

Flag-keyed fix-ups that run in `Progression.init` (not in the save layer; each sets its flag so it runs once):

| Fix-up | Trigger | Effect | Slice |
|---|---|---|---|
| `COMES_WITH` | `done.boat_rowboat` → `porter_dock`; `done.zone_forest` → `mkt_s2` | sets the follower step done; refunds its `paid[id]` as coins | SLICE (`mkt_s2`) |
| `shop43` | `flags.shop43` missing | any step done and (`zone_forest` and bread selling: `flags.firstBreadSale` or `hints.farm` or `done.op_bakery` or `done.hire_farmer`) and not `mkt_s3` → `done.mkt_s2 = done.mkt_s3 = true`, `flags.firstBreadSale = true`, drop `paid/got.mkt_s3`; with `hire_clerk_market` also `done.hire_clerk_s3` | LATER (06 Q3) |
| `bakery43` | `flags.bakery43` missing | `done.zone_farm` → `bld_bakery`, `hire_clerk_bakery` done (refund their `paid`); `hints.hunt` or `done.op_smokehouse` → `flags.firstMeatSale` | LATER |

A new village sets `flags.shop43 = flags.bakery43 = true` at once (both functions set their flag before checking for done steps; 06 §11).

### 4.5 `v43` block — SLICE

| Field | Rule (`sanitizeV43`) | Written by |
|---|---|---|
| `lay` | int 0..9, floor | new game: `2`; R43: `2`; a loaded save without the block: `{ lay: 0 }` (then R43 runs at load, so in practice always 2 after load) |
| `toggles` | `{ counters?: { id: false }, stations?: { id: false } }`, only "off" entries (`false` or `0` → `false`), ids `^[a-z0-9_]{1,16}$`, ≤ 12 counters, ≤ 16 stations; dropped when empty | v4.4+ (accepted) |
| `seen` | `{ key: 1 }` for values `1`/`true`, keys `^[a-z0-9_]{1,24}$`, ≤ 32; dropped when empty | new game: `{ letter43: 1, tour43: 1 }` |
| `refunds43` | `{ coins: count ≤ 1e9, items: itemCounts ≤ 1e6, wh: itemCounts ≤ 1e6, moved: n ≤ 16, kept: n ≤ 16 }` (an array for moved/kept counts its length) | R43 |
| `src` | `{ v: count ≤ 999, lv: count ≤ 9999 }` | R43 (`{v, lv}` of the save it remapped; lv 0 = pre-B) |

`v43Holder(saved, isNew)` (hooks.js 72–80): saved block → shallow copy (and copy of `seen`); no save → `{ lay: 2, seen:
{ letter43: 1, tour43: 1 } }`; a save without the block → `{ lay: 0 }`.

### 4.6 Time in the save

There is no total play time. Time-bearing fields:

| Field | Unit | Rule |
|---|---|---|
| top `t` | wall clock ms | stamp; read only by the 불러오기 summary |
| `v4.clock` = `{ t, day, on }` | `t` = seconds into the day (1 decimal), `day` = whole days, `on` = clock started (first train) | DayClock (DayClock.js 21–41, 152): day length `BALANCE.v4.day.length = 600` s, `HOUR = 25` s, start hour 8 → default `t = 200`. `T = day·600 + t`; save `t = round1(T mod 600)`, `day = floor(T/600)`. Sanitize: `t` clamp 0..3600 default 200, `day` count ≤ 1e6, `on === true`. The clock only exists while the rail strip is open (the `v4` block is live); otherwise the loaded block is written back unchanged. Slice: pass-through (clock frozen). |
| `sites.*.t`, `v4.shops.*.t`, `v4.houses.*.t` | build seconds | clamp 0..600 |
| `dog.cd.*`, `c1.settleT`, `v42.full.*` … | seconds | see Appendix A |

---

## 5. Load pipeline — SLICE

### 5.1 `Save.Load()` (Save.js 866–916)

```
Load():
    Release(); Newer = Failed = null; Remapped = false; Remap = null; Pending43 = false; Pre43 = null; LastUnreadable = false
    raw = store.GetItem(SAVE_KEY)
    s   = (raw non-empty) ? TryParseJson(raw) : null                 // parse error -> null
    if s == null or s is not a JSON object (arrays, numbers, null included):   // JS reaches the same end for arrays one step later
        if raw non-empty: KeepCopy(raw); LastUnreadable = true
        return null                                                  // fresh village
    if IsNewerSave(s):
        Newer = { v: floor(num(s.v,0)), lv: floor(num(s.lv,0)) }; LastUnreadable = true
        Hold("newer", Newer); return null                            // fresh village, never saved; stored text untouched
    if NeedsRemap(s) and s.v is a JSON number and 1 <= s.v <= 8:
        Pre43 = KeepPre43(raw)                                       // SLICE+: byte copy before the first remap
    r = MigrateSaveEx(s)
    if r.fail:   Failed = { at: "load", kind: "v43", reason }; LastUnreadable = true; Hold("failed43", Failed); return null
    if r.save == null:  LastUnreadable = true; KeepCopy(raw); return null       // unknown version
    if r.remapped: Remapped = true; Remap = r.r; Pending43 = true             // no write until Confirm43()
    return r.save
```

`KeepCopy(raw)`: `b = store[BACKUP_KEY]`; if `b == null` → `store[BACKUP_KEY] = raw`; else if `b != raw` →
`store[BACKUP_KEY + ".2"] = raw`. `KeepPre43(raw)`: for `k` in [`…backup.pre43`, `…backup.pre43.2`]: if `store[k] == raw`
→ return k; if `store[k] == null` → write, read back, return k or null; else next slot. Returns null when both are other
villages. Neither ever throws.

### 5.2 `MigrateSaveEx(s)` (Save.js 784–811) — outcomes

```
MigrateSaveEx(s):
    if s is not a plain object: return { save: null }
    if IsNewerSave(s): return { save: null, newer: true }
    from = { v: max(0, floor(num(s.v,0))), lv: max(0, floor(num(s.lv,0))) }
    v = (s.v is a JSON number) ? s.v : -1                            // "7" (string) -> -1 -> unreadable
    while v != 8 and MIGRATE has v:  try { s = MIGRATE[v](s); v = s.v } catch { break }
    if v != 8: return { save: null }                                 // 7.5, 0, 9 (already caught), strings
    if !NeedsRemap(s): return { save: SanitizeSave(s), remapped: false }
    try { rm = Remap43(s, from) } catch e { return Fail("remap43 threw: " + e) }
    c = Check43(s, rm.save, rm.r);           if !c.ok  return Fail("check43 " + c.reason, rm.r)
    out = SanitizeSave(rm.save)  (exception -> null); if null return Fail("sanitize", rm.r)
    c2 = Check43b(rm.save, out, SITE_RULES); if !c2.ok return Fail("check43b " + c2.reason, rm.r)
    return { save: out, remapped: true, r: rm.r }
Fail(reason, r) = { save: null, fail: { kind: "v43", reason: reason[0..160] }, r }
```

| Outcome | Save.Load result | Store | Game |
|---|---|---|---|
| no save / empty | null | nothing | new village (tutorial on) |
| unreadable text / unknown version | null | copy to backup slot | new village, **no tutorial** (`LastUnreadable`) |
| newer (`v > 8` or `lv > 43`) | null | untouched forever | fresh village under the "newer" card, never saved |
| R43 failed | null | untouched | fresh village under the failure card, never saved |
| remapped | save | untouched until `Confirm43` | the old village on the new map |
| loaded (lay 2) | save | — | the village |

`NeedsRemap(s) = !(s is object && s.v43 is object && floor(num(s.v43.lay, 0)) >= 2)`.

---

## 6. MIGRATE chain (Save.js 102–177) — SLICE

Each step returns a shallow copy with `v` raised by one; nothing is ever removed.

| Step | Change |
|---|---|
| 1 → 2 | Rename keys of `progress.done` and `progress.paid`: hire2_fisherman→porter_grill, hire2_lumberjack→porter_sawmill, hire2_farmer→porter_bakery, hire2_miner→porter_smelter, hire2_hunter→porter_smokehouse (other keys unchanged, order kept). `progress.flags` += `firstSale: true` if any `done` value is `true`; += `firstTrade: true` if `done.zone_forest === true`. |
| 2 → 3 | nothing |
| 3 → 4 | `anyDone` = any `done` value `true`. For each line (fisherman→grill, lumberjack→sawmill, farmer→bakery, miner→smelter, hunter→smokehouse) with zone (grill: none, sawmill: zone_forest, bakery: zone_farm, smelter: zone_mine, smokehouse: zone_hunt): if (zone ? `done[zone] === true` : anyDone) → `done["op_"+station] = true`; if `done["hire_"+worker] === true` → `done["op_"+station] = done["raw_"+station] = true`. For every site object with `b` toolsmith or cannery → `done["op_"+b] = true`. |
| 4 → 5 | nothing |
| 5 → 6 | nothing |
| 6 → 7 | If `v4.cargo` is an object: `cap = 2·max(1, floor(num(BALANCE.v42.freight.perTrain = 56)))` = **112**; walk cargo keys sorted by count descending (stable), `n = min(left, count(value, 999))`, keep `n > 0`, `left -= n`. |
| 7 → 8 | nothing (the number moves so 4.2.0.1 refuses 4.2.1 villages) |

Vectors (golden `migrate`): `m1` (v1 with hire2_fisherman, zone_forest) → done gains porter_grill, op_grill, raw_grill,
op_sawmill; flags firstSale + firstTrade. `m3` → op_grill, raw_grill, op_sawmill, raw_sawmill, op_toolsmith, op_cannery.
`m6` cargo `{plank 100, bread 30, ore "5", log 1}` → `{plank 100, bread 12}`. `v: "7"` and `v: 7.5` → unreadable.

---

## 7. `SanitizeSave` (Save.js 183–308) — SLICE (core), Appendix A for the rest

### 7.1 Helpers (exact)

```
isObj(v)      = v is a JSON object (not array, not null)
num(v, d)     = v is a JSON number && finite ? v
              : v is a string && v.trim() != "" && JsNumber(v) finite ? JsNumber(v) : d
              // JsNumber: JS Number(string): trim whitespace; decimal with sign/point/exponent ("5.", ".5", "+5", "1e3");
              // 0x.., 0o.., 0b.. without sign; anything else NaN. Booleans, null, arrays, objects -> d.
count(v, max = 1e9) = max(0, min(max, floor(num(v, 0))))
flags(v)      = { k: true for each own key k of v where v[k] is the JSON literal true }   // {} if v not an object
counts(v, keys?) = keys given: { k: count(v[k], 1e7) for k in keys (list order) if v has own key k }
                   keys absent: the same over every own key of v (its order)        // {} if v not an object
```

### 7.2 Field rules, in output order

| Out key | Rule |
|---|---|
| `v` | `8` |
| `coins` | `count(raw.coins, 1e12)` (always present) |
| `cid` | if string matching `^[a-z0-9]{4,16}\z` |
| `onb` | if present: `n = floor(num(onb, 0))`; keep if `0 < n < 1024` |
| `flag` | if present: `sanitizeFlag` (below); keep if not null |
| `adminUses` | if present: `n = count(…, 1e6)`; keep if `n > 0` |
| `adminInf` | `1` if value is `1` or `true` |
| `progress` | `{ done: flags(done), paid: counts(paid) /* every key */, up: { capacity: count(up.capacity, 99), speed: count(up.speed, 99) }, celebrated: (=== true), hints: flags, seen: flags, flags: flags, celebrated3: (=== true), got: {} }`; then for each id of `got` matching `^[a-z0-9_]{1,40}\z` with an object value: `got[id] = counts(value, ITEMS)` |
| `stations` | every id (no id check) whose value is an object → `{ i: count(i, 1000), o: count(o, 1000) }` |
| `market` | object → `{ stock: counts(stock, FOODS), cash: count(cash, 1e9) }`, else **`null`** (always written) |
| `trade` | same with `GOODS`, else `null` |
| `bakery` | only if object: same with `["item_bread"]` |
| `player` | `{ x: num(x, NaN) if finite else omitted, y: same, stack: stack array filtered to strings in ITEMS, first 200 }` |
| `life` | only if object: `keys(a)` = array → strings matching `^[a-z0-9_]{1,40}\z`, de-duplicated (first wins), first 80; `{ moved: keys(moved) (omitted if not an array), snowman: clamp(floor(num(snowman,0)), 0, 3) }`, + `waiting: keys(waiting)` if an array |
| `territory` | for r in REGIONS order: `true` if `raw.territory[r] === true`; then if `east` → `rail = true` (appended) |
| `sites` | §7.3 |
| `v3` | Appendix A.1 |
| `labour` | `{ piles: { k: count(piles[k], 500) for k in PILE_IDS if present } }` |
| `dog` | `{ love: clamp(num(love,0), 0, 100), gifts: count(…,1e6), tricks: count(…,1e6), treats: count(…,3), cd: { k: clamp(num(cd[k],0), 0, 3600) for k in [treat, play, pet] if present } }` (love and cd are not floored) |
| `v4` | `sanitizeV4` if object (Appendix A.4) |
| `c1` | `sanitizeC1` if object (A.5) |
| (territory) | after c1: if `territory.south` → `territory.west_s = true` (appended) |
| `v42`, `bank`, `logistics` | A.6–A.8 |
| `v43` | §4.5 |
| `x` | `keepX` if present (A.10) |
| `missions`, `geumbang`, `haul`, `demand` | object whose JSON length ≤ 3072 / 1400 / 768 / 1024 → deep copy; else dropped (+ warning) |
| (last) | `v3.dock.catch`: `left = 30`; for k in FISH order if present: `catch[k] = min(left, catch[k]); left -= catch[k]` |

Everything else (unknown top-level keys, `t`, `lv`) is dropped. `sanitizeFlag(v)` (design.js 32–43): fields in order
`s` (< 5), `b` (< 12), `p` (< 6), `pc` (< 12), `e` (< 14), `ec` (< 12); `int(x)` = finite number → floor, string
`^\d{1,3}$` → number, else NaN; a field in range is kept (and marks the flag valid), otherwise the classic value
(`CLASSIC = { s: 0, b: 0, p: 0, pc: 11, e: 1, ec: 2 }`); no valid field → null; `mk: 1` when `v.mk` is `1` or `true`.

### 7.3 `sites` keep rule

```
ids = own keys of raw.sites, stable-sorted so entries with st == "done" come first
seenUnique = {}
for id in ids:
    d = raw.sites[id]
    skip unless id matches ^[a-z0-9_]{1,40}\z, d is an object, d.b in BUILDINGS, d.st in SITE_STATES
    p = WORLD.plots[id]                                     // hidden plots count here; towers / unknown ids have no p
    if p and ((p.only and d.b != p.only) or (!p.only and d.b == "station") or (d.b in XL_ONLY and p.size != "XL")): skip
    if d.b == "labour_office" and id != "d_labour": skip
    if d.b in UNIQ: if d.b in seenUnique: skip; add
    out[id] = { b: d.b, st: d.st, got: counts(d.got, MATERIALS), t: clamp(num(d.t, 0), 0, 600) }     // t not floored
```

Golden `sanitize.hostile` exercises every branch (town hall on an S plot, station off `r_station`, second toolsmith,
bad id, unknown building, state `plot`, `t: 900` → 600, `got.item_plank: 3.7` → 3).

---

## 8. R43 — moving an old village onto plot table v2 (Remap43.js) — SLICE

Runs once, on JSON, after the MIGRATE chain and before `SanitizeSave`, for any save where `NeedsRemap` is true (every
4.2.x save and the 4.3 previews a1…a3.1). Pure: never changes its input; works on a deep copy.

### 8.1 Constants

| Name | Value |
|---|---|
| `MOVE43` (kind → home plot) | toolsmith → `d_tool`, warehouse → `d_wh`, cannery → `d_cannery`, store → `d_store`, town_hall → `w_hall`, big_restaurant → `w_rest` |
| `OLD43` (pre-B price) | town_hall: coins 2400, plank 30, ingot 10, time 14 · chief_office: coins 1800, plank 20, ingot 6, time 10 |
| `NEW43_PRICE` | town_hall: coins 1200, plank 16, ingot 4, time 14 · chief_office: coins 400, plank 8, ingot 0, time 8 |
| unfinished states | foundation, scaffold |
| warehouse capacity `whCap` | `max(10, floor(BALANCE.warehouse.capacity = 300))` = 300; counts all ITEMS except raw (item_log, item_wheat, item_ore, item_meat_raw) |
| chief start | `oldStart` (370, 680); `shopFront` (1250, 1000) when `sites.v42_office` is a chief_office foundation/scaffold |
| `isEup(s)` | `progress.flags.rankEup === true` or `v4.rank === 2` |

### 8.2 Algorithm

```
Remap43(src, from):
    s = DeepCopy(src); R = empty result { coins 0, extra {}, fromGot {}, fromFrame {}, toWh {}, asCoins {}, moved [], kept [],
                                          repriced [], s4half false, start null, from null, noop true }
    if !NeedsRemap(s): return (s, R)                          // already lay 2: an equal copy, noop
    R.noop = false; R.from = { v: max(0,floor(num(from.v,0))), lv: max(0,floor(num(from.lv,0))) }
    if s.sites not object: s.sites = {}
    // 1. movers, two-phase
    movers = [ (id, d) for id in key order of sites if d object, d.b string, d.b in MOVE43, id != MOVE43[d.b] ]
    sort movers: done first, then id ascending (ordinal)
    remove every mover from sites
    stays = {}
    repeat until a pass makes no change:
        claimed = {}
        for m in movers (sorted), skipping stays:
            home = MOVE43[m.d.b]
            if sites has key home  or  home in claimed  or  some k in stays has k.id == home:
                stays.add(m); restart the pass
            claimed.add(home)
    for m in movers (sorted):
        if m in stays: sites[m.id] = m.d;      R.kept.add([m.id, home, m.d.b])
        else:          sites[home] = m.d;      R.moved.add([m.id, home, m.d.b])     // appended at the end of sites
    // 2. reprice unfinished hall / office (key order of sites)
    for (id, d) where d.b in OLD43 and d.st in {foundation, scaffold}:
        O = OLD43[d.b]; N = NEW43[d.b]; frame = (d.st == "scaffold")
        row = { id, b, st, coins: max(0, O.coins − N.coins), extra {}, t: null }; R.coins += row.coins
        for m in [item_plank, item_ingot]:
            if frame: extra = max(0, O[m] − N[m])                                   // the frame took the whole old need
            else if d.got has own m: have = cnt(d.got[m]); extra = max(0, have − N[m]); if extra: d.got[m] = have − extra
            else extra = 0
            if extra: row.extra[m] = extra; R.extra[m] += extra; (frame ? R.fromFrame : R.fromGot)[m] += extra
        if d.t present and num(d.t,0) > N.time: row.t = [d.t, N.time]; d.t = N.time
        R.repriced.add(row)
    // extras: the 창고 first (a finished warehouse anywhere in sites), the rest as coins
    if R.extra not empty:
        room = 0
        if any site is { b: warehouse, st: done }: if s.v3 not object: s.v3 = {}; room = max(0, 300 − whTotal(s.v3.warehouse))
        for m in [item_plank, item_ingot]: n = R.extra[m]; w = min(n, room); if w > 0: R.toWh[m] = w; room −= w
                                           c = n − w; if c > 0: R.asCoins[m] = c; R.coins += c · priceOf(m)   // plank 5, ingot 10
    // 3. wallet and 창고
    if R.coins > 0: s.coins = min(1e12, max(0, floor(num(s.coins,0)))) + R.coins
    for m in R.toWh: s.v3.warehouse[m] = cnt(s.v3.warehouse[m]) + R.toWh[m]      // create the object if missing
    // 4. stage 4 at half price for a 읍 village
    if isEup(s) and progress.flags.s4half != true: progress.flags.s4half = true; R.s4half = true   // create objects if missing
    // 5. the chief
    p = (sites.v42_office is chief_office in foundation/scaffold) ? (1250, 1000) : (370, 680)
    s.player (create if not object).x = p.x; .y = p.y; R.start = p                                  // the bag is kept
    // 6. the marker
    s.v43 = copy of existing v43 object (or {}) with lay = 2, refunds43 = { coins: R.coins, items: R.extra (n>0),
            wh: R.toWh (n>0), moved: count(R.moved), kept: count(R.kept) }, src = R.from
    return (s, R)
cnt(v) = max(0, min(1e7, floor(num(v,0))))
```

Golden checks: `v43_reprice_room` → refund 2,705 coins (1,200 + 1,400 + 1 plank·5 + 10 ingots·10), 20 planks to the
창고, chief at (1250, 1000); `v43_xl_swap_both` → hall `w_rest→w_hall` and restaurant `w_hall→w_rest` swap;
`v43_xl_swap_kept` → **failed43** `check43b house_b on w_hall would be dropped`.

### 8.3 `Check43(pre, post, R)` — proof the move lost nothing (port it: it catches porting bugs on real villages) — SLICE+

Any exception → `{ ok: false }`. `pre` is compared as JSON (deep copy). `sameJSON` = deep equality, key order ignored,
`undefined` members ignored. Checks in order:

| # | Check |
|---|---|
| a | every top-level key except `sites, coins, v3, player, v43, progress` is unchanged; `v3` unchanged except `warehouse`; `progress` unchanged except `flags`; `flags` unchanged except `s4half`; `s4half` newly true only if 읍; 읍 ⇒ `s4half` true; `player` unchanged except `x`, `y` |
| b | the multiset of `b:st` over sites is the same before and after |
| c | no MOVE43 kind stands off its home unless its id is in `R.kept`; every `R.moved [from, to, b]` has `post.sites[to].b == b`, `MOVE43[b] == to`, `pre.sites[from].b == b`; every post site comes from the same id (or its move origin) and is unchanged, except repriced ones (scaffold: only `t` may change; foundation: only `got` materials and `t`) |
| d | each repriced site: scaffold → `extra[m] == max(0, O[m] − N[m])`; foundation → `after == min(before, N[m])` and `before − after == extra[m]`; `t ≤ N.time`; every unfinished hall/office was repriced; per material `Σ extra == R.extra == R.toWh + R.asCoins` |
| e | `R.coins == Σ(O.coins − N.coins) + Σ asCoins·priceOf`; coins after − coins before == `R.coins` (or coins unchanged when 0) |
| f | `toWh` only with a finished warehouse, warehouse total ≤ max(300, total before), each item changed by exactly `toWh` |
| g | `post.v43.lay ≥ 2`, `refunds43` and `src` present and equal to R; `Remap43(post)` is a noop and returns an equal copy |

### 8.4 `Check43b(post, out, rules)` — after sanitize, every kept building has a place

For each site of `post` that sanitize would keep by itself (valid id, object, known `b`, known `st`): `out` must hold the
same `b` and `st` at that id, unless `b` is unique and `out` has that kind elsewhere. Then every site of `out` must stand
on a plot that is not `hidden` or on a tower id. Otherwise fail with `"<b> on <id> would be dropped"` / `"… has no place"`.

### 8.5 After the build: `Confirm43` / failure (Game.js 1137–1152)

After `restoreV3`: if `Save.Pending43` and `restoreSkipped` is empty → `Save.Confirm43()` (writes allowed again; the next
autosave stores the remapped village). Non-empty → `Save.FailWith("skip", ids)`: hold `failed43`, the stored pre-B text
stays untouched. If the build throws while `Pending43 || Remapped` → `FailWith("restore", e)` instead of quarantine.

---

## 9. Writing, holds, backups — SLICE

### 9.1 `Save.Write(state)` (Save.js 930–948)

```
Write(state):
    if SaveGuard.NoSave: return false            // set while a hold is active and while an import is being applied
    if Pending43: return false                   // remapped village not confirmed yet
    raw = store.GetItem(SAVE_KEY)
    if raw != null and StoredIsNewer(raw): Hold("stale"); return false
    text = JsJson(Stamp(state))
    try { store.SetItem(SAVE_KEY, text); LastWriteOk = true } catch { LastWriteOk = false }
    return LastWriteOk
```

`Game.Save(force)`: skip while resetting / after a broken build / before the chief exists; `ok = Save.Write(Serialize())`;
then the chat record's own save (LATER); if `!ok && Held == null && !Pending43` and not yet warned → toast `noSave` once.

### 9.2 When to save

| Trigger (Phaser) | Unity |
|---|---|
| every `autosaveEvery = 5` s: `saveT += dt` (dt = min(0.05, frame seconds)), `saveT ≥ 5` → save, `saveT = 0` | same, in the Game update (06 step 16) |
| `visibilitychange` → hidden; `pagehide` | `OnApplicationPause(true)`, `OnApplicationFocus(false)` on Android, `OnApplicationQuit` |
| 마을 옮기기 export | `saveNow` (save, then read the stored text) — LATER |

### 9.3 Holds (Save.js 842–1006)

`Held ∈ { null, "newer", "stale", "failed43" }`. `Hold(why, info)`: no-op if already that hold; remember the guard state;
`SaveGuard.NoSave = true`; `ChatSave.Blocked = true`; notify listeners (UI card). `Release()`: restore the remembered
guard; `ChatSave.Blocked = remembered || ChatSave.Newer`.

| Hold | Cause | While held | Ways out |
|---|---|---|---|
| newer | stored save from a newer build | fresh village, nothing written, no quarantine, no tutorial | update app; export the stored keys (LATER); 새 마을로 시작 (`Clear`) |
| stale | a write found a newer save in storage | game playable, nothing written | reload |
| failed43 | R43 not proven lossless / site without plot | fresh village, nothing written | retry (reload); export (LATER); 새 마을로 시작 |

Slice UI: one simple modal per hold (Korean text from `strings`/SaveHoldCard: 「더 새 버전에서 저장된 마을이에요」,
「마을을 새 지도로 옮기지 못했어요」) with 「새 마을로 시작」; full cards LATER.

`Clear()` (처음부터 / 새 마을로 시작): `why = Held`; `stale` → `Release()` and return (storage untouched). If held:
`KeepCopy(raw)`; if neither backup slot now equals `raw` → return (keep the hold, remove nothing); `Release()`. Then
remove `SAVE_KEY` and the chat key. Then restart the Game scene with `fresh = true` (no `Load`).

`Quarantine()`: if held → nothing; else `store[BAD_KEY] = raw`, remove `SAVE_KEY`. Called when the build throws on a
normal save (Game.js 136–153), then the scene restarts fresh with `broken = true` (no tutorial).

### 9.4 Chat record (`ChatSave`, LATER — keep the key raw meanwhile)

`{ v: 1, cid, t, chat }`; read only when `≤ 600,000` chars, `v == 1`, `cid` equals the save's `cid`; `v > 1` → `Blocked`
and `Newer` (never overwritten). Written only when a chat changed it, refused while blocked / held / `Pending43` or when
the stored save is newer (→ stale hold). New chat id: `(Date.now().toString(36) + random base36 6 chars)`, last 12 chars.

---

## 10. Game build: load order and what the slice reconstructs

### 10.1 Order in `Game.build` (Game.js 155–291), save-relevant steps only

```
 1  saved = fresh ? null : Save.Load();  saveHold = Save.Held
 2  cid = saved.cid ?? NewChatId();  v43 = V43Holder(saved.v43, saved == null);  x43 = new X43(saved.x)
 3  civic(saved.c1); territory = Territory(saved.territory)  -> regions open: start, cfg.open (west), saved[id], openWith
 4  zones, fences, decor, trees, resources, stations, labour piles, sellers (shop, bakery, trash, workshop43), huts, plots (buildV3)
 5  chief position (below); Player; Economy(saved.coins ?? BALANCE.start.coins = 0); admin marks
 6  Progression(saved.progress); Tutorial; Onboarding(saved.onb, isNew); VillageFlags(saved, isNew); V42(saved)
 7  Neighbours.attach(saved.v4)   (live only when territory 'rail' is open)
 8  restoreV3(saved)              sites (§4.3), restoreSkipped
 9  progress.Init()               COMES_WITH, shop43, bakery43, replay done steps
10  restore(saved)                stations {i,o}; market stock (bread -> bakery); trade stock; till = market.cash + trade.cash;
                                  bakery; player stack (first `capacity` types); shop.RestoreQueue(3)   (06 §15)
11  restoreV3Stock(saved)         warehouse, food box, boathouse, workshops, store, hall tax, restaurant  (LATER)
12  settleShopOver; restoreLabour (piles: restore(n) up to max(stack.max + 8, 2·stack.max)); v42.afterRestore
13  unstickChief (if the saved position was used); afterRemap43 (§8.5); after-load hooks (letter, tour …)
14  VillageLife(saved.life); DogPlay(saved.dog); camera on the chief; register pause/quit saving
```
`isNew` for tutorial and flag maker = `saved == null && !brokenRestart && !(!fresh && Save.LastUnreadable)`.

Chief position rule (Game.js 247–252): `X0 = min(0, WORLD.left) = −1400`; the saved `(x, y)` is used when both are finite
and `x ≥ −1360`, `x ≤ 6104`, `y ≥ 0`, `y ≤ 3410`, then `collision.resolve(pos, 16, true)` and, after all walls exist,
`unstickChief`; otherwise the spawn (1130, 412). Details in 04 §6.6.

### 10.2 What the slice must reconstruct from a loaded save

| Save part | Slice reconstruction |
|---|---|
| `territory` | regions open/closed → fog walls, camera bounds, region objects (02 §8) |
| `progress.done` zone_* / mkt_s2 / station steps | zone floors and decor open; stations shown; clerks/cook at posts (06) |
| `sites` | buildings drawn on plots/towers at the right picture and depth (03 §5.10), sites under construction drawn as foundation/scaffold (no builders needed) |
| `player` | position + bag |
| `coins` | HUD |
| `stations.grill`, `market`, `labour.piles.fish`, `onb` | the opening loop (06 §15) |
| `life.moved` | the first residents who walk (04 §13) — the slice may show only the first 2–3 keys it has art for and keep the rest in the list |
| everything else | kept and written back unchanged (§10.3) |

### 10.3 Writing back: the pass-through rule

`Serialize()` writes, for each top-level key of §4.1: the live system's state when the slice runs that system, else the
sanitized block exactly as loaded (`saved[key]`), else nothing. Inside a live block keep what the slice does not model:
`progress` keeps every step id it loaded (unknown ones too); `stations` keeps loaded entries of stations the slice does
not build; `labour.piles` keeps the other piles; `life.moved` keeps keys without art. This mirrors the Phaser code
(`this.v4 ? this.v4.serialize() : this.saved.v4`, Game.js 2610, 2615, 2617, 2624, 2628–2629).

Serialize order (Game.js 2595–2630; only the stamp position matters to readers): territory, sites, v3, coins, progress,
stations, market, trade, bakery, player, life, labour, dog, v4, c1, cid, onb, flag, adminUses, adminInf, v43, v42, bank,
logistics, x, missions, geumbang, haul, demand. Site serialize: plot → nothing; done → `{ b, st: "done" }`; else
`{ b, st, got: { m: min(need, count incl. incoming + carried by porters) }, t: JsRound(buildT·10)/10 }`.
Items in flight are saved at their destination; the full "nothing vanishes" chain for porters is LATER (Game.js 2470–2577,
06 R12 for the slice part).

---

## 11. 마을 옮기기 — the transfer code (Transfer.js, MovePanel.js)

### 11.1 Format (exact)

```
code    = head + "." + crc
head    = "SNOWBLOOM" + fmt + "." + comp + "." + n + "." + data
fmt     = 2 (decimal digits; 1 = a pre-B village's code, still read)
comp    = "z" (payload compressed with raw DEFLATE, RFC 1951, no zlib/gzip header) | "j" (payload not compressed)
n       = data.Length in characters (decimal, 1–9 digits)
data    = base64url(payloadBytes): standard base64 with '+' -> '-', '/' -> '_', trailing '=' removed
crc     = CRC-32 of head, 8 lower-case hex digits (zero-padded)
CRC-32  = reflected, polynomial 0xEDB88320, init 0xFFFFFFFF, final XOR 0xFFFFFFFF, over the bytes (char & 0xFF) of head
          (head is pure ASCII).  crc32("123456789") = "cbf43926", crc32("SNOWBLOOM") = "c5b2ccab", crc32("") = "00000000"
payload = UTF-8 bytes of JSON, members in this order:
          { "app": "snowbloom", "fmt": 2, "made": <ms, integer>, "saveV": 8, "lv": 43,
            "build": "<VERSION> · <BUILD_DATE>",   // e.g. "v4.3.0-a3.2 · 2026-11-12" (U+00B7 middle dot); readers ignore it
            "keys": { "<storage key>": "<raw stored string>", … } }     // keys sorted by ordinal string compare
```
Each value in `keys` is the stored text itself (so the save JSON appears as an escaped string inside the payload JSON).
The game shows the code under one header line, e.g. `[행복한 눈꽃마을 이야기] 마을 옮기기 코드 · 서리마을 1,034코인 · <date>`
(English: `[Snowbloom Village] village code · …`); readers skip any text around the code.

Exact vector (golden `transfer.tinyJ`): keys `{"frostVillage.save.v1":"{\"v\":8,\"lv\":43,\"t\":1,\"coins\":5}"}`, made
`1700000000000`, build `v4.3.0-a3.2 · 2026-11-12`, uncompressed →
`SNOWBLOOM2.j.235.eyJhcHAiOiJzbm93Ymxvb20iLCJmbXQiOjIsIm1hZGUiOjE3MDAwMDAwMDAwMDAsInNhdmVWIjo4LCJsdiI6NDMsImJ1aWxkIjoidjQuMy4wLWEzLjIgwrcgMjAyNi0xMS0xMiIsImtleXMiOnsiZnJvc3RWaWxsYWdlLnNhdmUudjEiOiJ7XCJ2XCI6OCxcImx2XCI6NDMsXCJ0XCI6MSxcImNvaW5zXCI6NX0ifX0.3332f6e8`
A compressed code is not byte-identical across DEFLATE implementations; test 'z' by round trip and by decoding
`transfer.tinyZ` / `transfer.v4202` (made by Node's zlib, like Chrome's).

### 11.2 Which keys travel (`isGameKey`, Transfer.js 46–52)

`true` iff the key matches `^frostVillage\.[A-Za-z0-9_.-]{1,64}\z` and is not `frostVillage.save.backup` or anything
starting with `frostVillage.save.backup.`, not `frostVillage.save.v1.bad` or anything ending `.bad`, and does not start
with `frostVillage.move.`. Travels: save, `.chat`, `.story`, settings, title prefs, any future `frostVillage.*` key.
Never: backup, backup.2, backup.pre43(.2), `.bad`, `move.backup`, `move.admin`. (golden `transfer.isGameKey`)

### 11.3 Encode (`encodeVillage`, LATER for the slice)

```
EncodeVillage(keys, made, fmt = 2 unless the save inside is pre-B (not newer and NeedsRemap) -> 1, compress = true):
    payload = JsJson({ app, fmt, made: JsRound(made), saveV: 8, lv: 43, build, keys })
    bytes = UTF8(payload); comp = "j"; data = bytes
    if compress: try { data = DeflateRaw(bytes); comp = "z" } catch { comp = "j"; data = bytes }
    b64 = Base64Url(data); head = "SNOWBLOOM" + fmt + "." + comp + "." + b64.Length + "." + b64
    return head + "." + Crc32Hex(head)
CurrentKeys() = every isGameKey key of the store (sorted), with SAVE_KEY replaced by a save made just now
                (while held: the STORED save text as is); a store-less fallback adds the settings JSON.
```
C#: `System.IO.Compression.DeflateStream(…, CompressionLevel.Optimal)` writes raw DEFLATE (no header) — accepted by the
WebView app (DecompressionStream 'deflate-raw' or its inflate.js).

### 11.4 Decode (`decodeVillage`, Transfer.js 141–199) — SLICE

```
DecodeVillage(text):
    if text is blank: fail "empty";  if text.Length > 12,000,000: fail "tooBig"
    normalise line ends (\r\n, \r, U+2028, U+2029 -> \n)                                   // C# only; JS ^ already sees them
    flat = remove, at every line start, the pattern [ \t ]*(>[ \t ]*)+          // e-mail quote marks
    flat = remove every char of [\t\n\v\f\r    -     　﻿­​-‍⁠]
    at = flat.IndexOf("SNOWBLOOM") (ordinal); if at < 0: fail "notCode"
    first = null
    repeat up to 8 times while at >= 0:
        r = DecodeAt(flat.Substring(at)); if r.ok: return r; first ??= r
        at = flat.IndexOf("SNOWBLOOM", at + 9)
    return first

DecodeAt(rest):
    ver = match ^SNOWBLOOM(\d+);   if none: fail "notCode"
    fmt = int(ver);  if fmt > 2: fail "newer";  if fmt < 1: fail "foreign"
    m = match ^SNOWBLOOM\d+\.([a-z])\.(\d{1,9})\.([A-Za-z0-9_-]*)(?:\.([0-9a-fA-F]{8}))?
    if none: fail (rest matches ^SNOWBLOOM\d+\.?[a-z]?\.?\d*\z) ? "cut" : "damaged"
    comp = m1; want = int(m2); data = m3
    if data.Length < want: fail "cut" { have, want }
    if data.Length > want: fail "damaged" { have, want };   if no m4: fail "cut" { have, want }
    if Crc32Hex("SNOWBLOOM" + fmt + "." + comp + "." + want + "." + data) != lower(m4): fail "damaged"
        // fmt and want re-printed as plain decimals: "SNOWBLOOM02…" or a leading-zero length fails here
    bytes = Base64UrlDecode(data)  (pad with "===".Substring((len+3) % 4); invalid -> fail "damaged")
    if comp == "z": bytes = InflateRaw(bytes, limit 9,000,000)   // over limit -> "tooBig"; any error -> "damaged"
    else if comp != "j": fail "newer"
    if bytes.Length > 9,000,000: fail "tooBig"
    json = strict UTF-8 decode (invalid -> "damaged"); p = JSON.parse (error -> "damaged")
    if p not object or p.app != "snowbloom": fail "foreign"
    if p.fmt is a number > 2: fail "newer"
    if p.fmt not an integer number or < 1, or p.keys not an object: fail "foreign"
    keys = {}; dropped = []
    for k in own keys of p.keys sorted ordinal:
        v = p.keys[k]
        if !IsGameKey(k) or v not a string or v.Length > 2,000,000 or keys.Count >= 64: dropped.add(k) else keys[k] = v
    if keys[SAVE_KEY] not a string: fail "noVillage"
    return ok { payload: p, keys, dropped }
```
Golden `transfer.decodeCases`: empty, notCode, cut `{have 232, want 235}`, cut without checksum `{235, 235}`, one changed
letter → damaged, `SNOWBLOOM3…` → newer, `SNOWBLOOM0…` → foreign, a code wrapped over lines with `> ` quote marks and a
Korean header → ok, a cut copy followed by a whole one → ok, unknown comp letter with a valid checksum → newer.

### 11.5 Dry run and the confirm card (`dryRun`, `summarize`) — SLICE

```
DryRun(keys, made):
    raw = JSON.parse(keys[SAVE_KEY]) (error -> "badSave"); not an object -> "badSave"
    if IsNewerSave(raw): fail "newerSave"
    r = MigrateSaveEx(raw) (exception -> null)
    if r.fail: fail "migrateFail" { reason };  if r == null or r.save == null: fail "badSave"
    return ok { save: r.save, summary: Summarize(r.save, keys, made, raw, r) }
Summary = { coins: floor(save.coins), rank: (v4.rank == 2 ? 2 : 1),
            residents: count of life.moved keys starting "npc_" + c1.settlers,
            day: v4.clock.day finite ? max(1, floor(day)) : 0, sites: count of sites with st "done",
            office: v42.office.st >= 1, chat: keys[".chat"] non-empty, keys: keys.Count,
            savedAt: raw.t finite ? JsRound(raw.t) : 0, made, fromV: raw.v (number) or 0, fromLv: raw.lv > 0 ? floor : 0,
            flag: save.flag parts or null, remap43: r.remapped ? { coins: r.r.coins, moved: r.r.moved.Count, kept: r.r.kept.Count } : null }
```
Card lines (ko): `서리마을|서리읍 · {n} 코인` / `주민 {n}명 · {n}일째 · 건물 {n}채` / `촌장 사무실 있음` /
`새 지도로 옮겨요: 건물 {n}채가 새 자리로` (+ ` · {c}코인을 돌려받아요`) / `주민들과의 수다 기억 포함` /
`{d}에 만든 코드`; question `지금 마을을 이 마을로 바꿀까요? 지금 마을은 예비 사본으로 남겨 둬요.` buttons `바꾸기` / `취소`.
Expected for `v4202_25min`: coins 1,034, rank 1, residents 26, day 1, sites 6, office false, chat false, keys 2,
fromV 7, fromLv 0, remap43 { coins 0, moved 1, kept 0 }.

Error messages (ko, MovePanel.js 52–67), each followed by ` 지금 마을은 그대로예요.` except `empty`:

| error | text |
|---|---|
| empty | 먼저 코드를 붙여 넣어 주세요. |
| notCode | 마을 코드가 아니에요. 「SNOWBLOOM」으로 시작하는 코드를 통째로 붙여 넣어 주세요. |
| cut | 코드가 중간에 잘렸어요{ (have / want) only when have < want}. 처음부터 끝까지 다시 복사해 붙여 넣어 주세요. |
| damaged | 코드의 글자가 바뀌었거나 빠졌어요. 받은 코드를 그대로 다시 복사해 붙여 넣어 주세요. |
| newer | 더 새 버전의 게임에서 만든 코드예요. 게임을 업데이트한 뒤 다시 해 주세요. |
| foreign | 이 게임의 마을 코드가 아니에요. |
| noVillage | 코드 안에 마을이 없어요. |
| tooBig | 코드가 너무 커서 열 수 없어요. |
| newerSave | 더 새 버전의 게임에서 만든 마을이에요. 게임을 업데이트한 뒤 다시 해 주세요. |
| badSave | 코드 안의 마을을 읽을 수 없어요. |
| migrateFail | 이 마을을 새 지도로 옮기지 못했어요. 코드는 그대로 보관해 두고, 게임을 업데이트한 뒤 다시 해 주세요. |
| noStorage | 이 화면에서는 저장을 할 수 없어서 마을을 불러올 수 없어요. |
| noRoom | 저장 공간이 모자라서 바꾸지 못했어요. |

### 11.6 Apply (`applyVillage`, Transfer.js 254–292) — SLICE

```
ApplyVillage(keys, undo = false, spareKey = MOVE_BACKUP_KEY):
    if !undo: MarkImported(keys)
    guard0 = SaveGuard.NoSave; SaveGuard.NoSave = true                // the running game must never write again
    before = all isGameKey keys of the store with their values
    spare0 = store[spareKey]
    if before has SAVE_KEY:
        try store[spareKey] = EncodeVillage(before).code              // fmt 2, compressed (되돌리기 = paste that code back)
        catch: restore spare0; SaveGuard.NoSave = guard0; fail "noRoom"
    try: write every key of keys; read each back and compare
    catch: remove keys that were not in before; write back before's values; restore spare0; NoSave = guard0; fail "noRoom"
    remove every key of before that keys does not have
    ok -> after ~450 ms reload: Unity = reload the Game scene from Boot (Save.Load runs again)
MarkImported(keys):        // a village from elsewhere: tutorial done, no admin marks; text untouched when none of these appear
    t = keys[SAVE_KEY]; if t does not contain "onb", "adminInf" or "adminUses" (quoted): return
    o = parse; changed = false
    if o.onb is a number > 0: o.onb = (floor(o.onb) | 14) & 1023; changed       // 1 -> 15, 1015 -> 1023  (C#: JsMath.ToInt32(Math.Floor(onb)) | 14) & 1023 — never a bare (int) cast, 00 §2.3
    remove o.adminInf, o.adminUses if present (changed)
    if changed: keys[SAVE_KEY] = JsJson(o)        // re-serialised: keep JS number formatting (§2.3)
```
`backupCode(key)`: the spare's text if it contains `SNOWBLOOM`. 되돌리기 = `Check(backupCode)` then apply with `undo`.

Slice UI: settings → 「마을 옮기기」 → 「불러오기」 page with a text box (or a 「붙여넣기」 button reading
`GUIUtility.systemCopyBuffer`), 「불러오기」 → `DecodeVillage` → `DryRun` → card → 「바꾸기」 → `ApplyVillage` → reload.
A 2–5 K character code in a `TMP_InputField` on Android is fine; a long chat record can make codes of 100 K+ (risk R6).

### 11.7 Old-WebView decoder (`inflate.js`) — DROP

The JS fallback exists for WebViews without DecompressionStream. Unity uses `DeflateStream` (decompress mode) with an
output counter that aborts at 9,000,000 bytes → `tooBig`. If `DeflateStream` misbehaves on a target (risk R4), port
`inflate.js` (a 125-line puff-style inflater: stored / fixed / dynamic blocks, throws `damaged` or `too big`) or use any
RFC 1951 inflater in "no header" mode.

---

## 12. Fixtures and golden data

### 12.1 Fixtures (`tools/test/fixtures`, 33 files)

Format A: the file is the save object (plus `_note`/`_expect` keys starting with `_`, to be removed). Format B:
`{ _note, _from?, keys: { storageKey: rawString } }` — exactly what a code carries; the save is `keys["frostVillage.save.v1"]`.

| Fixture | Format | From | v / lv | Phaser load result | Use in C# tests |
|---|---|---|---|---|---|
| `v4202_25min.json` | B | 4.2.0.2 (38c233c), 25 min | 7 / – | remapped: toolsmith e_m1→d_tool; chief (370, 680); 6 sites | **slice fixture**, golden `full` |
| `v43a3_fresh25.json` | B | a3.1 (e28089a), new game 25 min, tutorial + flag + bakery | 8 / – | remapped: e_m1→d_tool; 5 sites (h43_1, h43_2, r_station, tower_east, d_tool) | second slice fixture, golden `full` |
| `v4202_fresh_tut.json` | B | 4.2.0.2 new game 3.5 min, `onb` | 7 / – | remapped, no sites | small village, tutorial bits |
| `v4202_46min_admin.json` | B | 4.2.0.2, admin used (`move.admin`, adminInf 1, adminUses 1) | 7 / – | remapped (4 movers) | `markImported`, `isGameKey` (move.admin never travels) |
| `v421_meatcan.json` | B | 4.2.1 (977f02e) | 8 / – | remapped (4 movers) | v8 pre-B |
| `v42_village_late.json` | B | late 4.2 (135,000 coins, office/bank/depot, chat, settings) | 7 / – | remapped (4 movers) | transfer round trip with 4 keys; full sanitize of v42/bank/logistics |
| `v43a22_late.json`, `v43a3_late.json` | B | a2.2 / a3.1 late | 8 / – | remapped (4 movers) | 17 sites, all regions |
| `v43a1_village.json`, `v43a2_bread.json` | A | a1 / a2 | 8 / – | remapped | shop43 / bakery43 fix-up inputs (LATER) |
| `v35_save_*.json` (4) | A | v3.5 | 4 / – | remapped (MIGRATE 4→8) | migrate chain; `v35_save_21min` golden `full` |
| `v41_save_*.json` (5), `v42_save_office_ttal.json` | A | v4.1 / v4.2 | 6, 7 / – | remapped | migrate 6→7 cargo cap |
| `v43_reprice_room.json`, `_full`, `_nowh` | A | hand-made | 7 / – | remapped with refunds 2,705 / 1,330 / 2,725 coins | R43 reprice; golden `full` (room) |
| `v43_xl_swap_both`, `_hall`, `_rest` | A | hand-made | 7 / – | remapped (XL swap / moves) | R43 two-phase movers |
| `v43_xl_swap_kept.json` | A | hand-made | 7 / – | **failed43** (`check43b house_b on w_hall would be dropped`) | failure path, migrateFail |
| `v43_samelv_x.json` | A | step-B, lay 2, x + slices at caps | 8 / 43 | loaded (no remap) | pass-through byte-for-byte; golden `full` |
| `v43_newer_lv46.json`, `_v9`, `_v9lv50` | B | newer builds | 8/46, 9/–, 9/50 | **newer** | never loaded, never written |

The per-fixture results (moves, refunds, chief start, sites as `b:st`, territory, `v43`) are in golden `fixtures`.

### 12.2 Golden file layout (`07_save_golden.json`)

| Path | Content |
|---|---|
| `fixtures[<file>]` | `inV, inLv, storedIsNewer, needsRemap, result (loaded / remapped / failed43 / newer / unreadable), coins, player, stackLen, territory, sites, r (moved, kept, coins, extra, toWh, asCoins, repriced, s4half, start, from), v43` |
| `full[<file>]` | the complete `MigrateSaveEx(...).save` (sanitized) for 6 fixtures: compare with `sameJSON` (and, if the C# port follows §7.2 order, text equality) |
| `migrate.*` | MIGRATE chain-only vectors and the full-load result |
| `sanitize.hostile`, `sanitize.empty` | `SanitizeSave` input → output |
| `newerMatrix` | `storedIsNewer` vectors |
| `transfer.*` | `tinyKeys`, `made`, `build`, `tinyJ` (exact), `tinyJfmt1`, `tinyZ`, `v4202.code`, `crc32`, `isGameKey`, `markImported`, `decodeCases` |

### 12.3 C# test list (EditMode tests)

| # | Test | Pass |
|---|---|---|
| T1 | `JsJson` number writer (D **and** E) | `5`→`5`, `5.5`→`5.5`, `1e21`→`1e+21`, `0.1+0.2`→`0.30000000000000004`, `-0`→`0`, `0.1+0.7`→`0.7999999999999999`, `1e-7`→`1e-7`, `0.00001`→`0.00001`, `1.5e-6`→`0.0000015`, `2**53+2`→`9007199254740994`, `123456789012345678`→`123456789012345680`, parse `1e400`→∞→written `null`; string with U+2028 written raw; lone surrogate `\ud800` written `\ud800` |
| T2 | `StoredIsNewer` | golden `newerMatrix` |
| T3 | MIGRATE | golden `migrate.*.chainOnly` |
| T4 | `SanitizeSave` | golden `sanitize.*` |
| T5 | every fixture through `MigrateSaveEx` | result kind and every field of golden `fixtures` |
| T6 | 6 full outputs | `sameJSON(golden.full[f], cs)` |
| T7 | `Remap43` idempotent | `Remap43(out)` noop on every remapped fixture |
| T8 | CRC32, base64url, `tinyJ` encode | exact strings |
| T9 | decode | `tinyZ`, `v4202.code`, all `decodeCases` (ok / error / info) |
| T10 | encode→decode round trip | every format-B fixture's keys, compressed and plain |
| T11 | `ApplyVillage` with a failing store (throw on the 2nd write) | store restored byte for byte, spare restored, guard restored |
| T12 | Load/write guards with a memory store | newer save never overwritten (byte-identical after 100 writes), stale hold once, failed43 holds, `Pending43` blocks writes until `Confirm43`, `KeepCopy` / `KeepPre43` slots |

### 12.4 Slice acceptance (on the phone)

| # | Scenario | Pass |
|---|---|---|
| S-1 | New game, play the loop ≥ 10 s, swipe the app away, start again | same coins, chief spot (after collision resolve), bag, grill stacks, shelf, till, residents |
| S-2 | Home button mid-loop, kill from recents, start | the state of the moment the app went to background |
| S-3 | Paste `07_save_code_v4202_25min.txt` (or the designer's own code from the WebView app: 설정 → 마을 옮기기 → 내보내기 → 복사하기) into 불러오기 | card shows 1,034 코인 · 주민 26명 · 1일째 · 건물 6채 · 새 지도로 옮겨요: 건물 1채가 새 자리로; after 바꾸기: toolsmith at d_tool (60, 1530), station r_station (3410, 1330), house_c w_s1 (−170, 1080), house_a w_s2 (−330, 1660), house_c w_s3 (−1150, 1660), watchtower (1660, 845); east + rail land open; 5 zones open; chief near (370, 680); HUD 1,034 |
| S-4 | Paste a code of `v43_newer_lv46` (make it with the C# encoder from the fixture keys) | `newerSave` message, nothing changed |
| S-5 | After S-3, play 10 s, restart the app | village unchanged, no second remap (`v43.lay` 2 stored), coins as left |

---

## 13. C# data model sketch (same JSON)

Two layers: the **raw tree** (`JObject`) used by migrate / R43 / sanitize / pass-through, and **typed views** for the
systems the slice runs. Never round-trip the whole save through typed classes (unknown fields would be lost).

```csharp
public static class SaveConst {
    public const string SaveKey = "frostVillage.save.v1", SettingsKey = "frostVillage.settings.v1",
        BackupKey = "frostVillage.save.backup", BadKey = "frostVillage.save.v1.bad",
        Pre43Key = "frostVillage.save.backup.pre43", ChatKey = "frostVillage.save.v1.chat",
        MoveBackupKey = "frostVillage.move.backup", AdminBackupKey = "frostVillage.move.admin";
    public const int SaveVersion = 8, Lv = 43, Lay = 2, CodeFmt = 2, CodeFmtMin = 1;
    public const float AutosaveEvery = 5f;
}

public sealed class LoadResult {                 // Save.Load()
    public JObject Save;                         // sanitized v8 tree, or null (fresh village)
    public bool Remapped; public RemapResult R;  // R43 details for the after-load letter / card
}

// typed views (read from the sanitized tree; written back into a copy of it)
public sealed class SiteData   { public string b; public string st; public Dictionary<string,int> got; public double t; }
public sealed class PlayerData { public double? x, y; public List<string> stack = new(); }
public sealed class StationIO  { public int i, o; }
public sealed class ShopData   { public Dictionary<string,int> stock = new(); public long cash; }
public sealed class LifeData   { public List<string> moved, waiting; public int snowman; }
public sealed class ProgressData {
    public Dictionary<string,bool> done = new(), hints = new(), seen = new(), flags = new();
    public Dictionary<string,long> paid = new();
    public UpData up = new(); public bool celebrated, celebrated3;
    public Dictionary<string, Dictionary<string,int>> got = new();
}
public sealed class UpData { public int capacity, speed; }
public sealed class V43Data { public int lay; public JObject toggles, seen, refunds43, src; }
public sealed class FlagData { public int s, b, p, pc, e, ec; public int? mk; }

public sealed class SaveModel {                  // what Game.Build reads
    public JObject Raw;                          // the sanitized tree: source of every pass-through block
    public long Coins; public string Cid; public int? Onb;
    public PlayerData Player; public ProgressData Progress;
    public OrderedMap<string, SiteData> Sites;   // insertion-ordered (order = restore order)
    public OrderedMap<string, bool> Territory;
    public OrderedMap<string, StationIO> Stations;
    public ShopData Market;                      // null allowed
    public LifeData Life;                        // null allowed
    public V43Data V43;
    public JToken Get(string topKey) => Raw[topKey];          // v3, v4, c1, v42, bank, logistics, dog, x, …
}

public interface ISaveSection {                  // each live system contributes its block
    string Key { get; }                          // "territory", "sites", "progress", …
    JToken Serialize();                          // null = leave out
}
// Game.Serialize(): JObject o = new(); foreach key in SerializeOrder (§10.3):
//     o[key] = liveSection?.Serialize() ?? saved.Raw[key]?.DeepClone()   (null/absent -> omit)
// Save.Write(o) adds the stamp in front.
```
- Use `long` for coins and tills, `int` for counts (all clamps ≤ 1e7 except coins/cash), `double` for positions and
  timers. Convert through `num()` semantics when reading the tree, never `(int)token` directly (strings, floats, BigInteger).
- `OrderedMap` = insertion-ordered dictionary (or keep `JObject` and read on demand).
- Keep `SaveModel.Raw` alive for the whole session (the Phaser `this.saved`) for pass-through.
- Later migration from the WebView app: if the Unity app ships as an update of `com.snowbloom.village` (same Play signing
  key), the WebView's `localStorage` is still in the app's data folder under origin `https://appassets.androidplatform.net`.
  One-time importer (LATER): an invisible Android WebView loading a tiny page at that origin (same asset-loader host) reads
  every `frostVillage.*` key and hands them to Unity → `ApplyVillage(keys)` (no markImported). Otherwise the code path
  (§11) always works. Because the JSON is identical, no conversion step exists in either direction.

---

## 14. Scope

| Item | Tag |
|---|---|
| `FileKvStore`, JS-compatible JSON writer, key constants | SLICE |
| Stamp, `IsNewerSave`, `StoredIsNewer`, newer / stale / failed43 holds with minimal modal | SLICE |
| `Load` with `KeepCopy`, `Quarantine`, `Clear` (처음부터) | SLICE |
| MIGRATE 1→8 | SLICE |
| `SanitizeSave` core (§7.2 rows up to `sites`, `labour`, `v43`, `flag`) | SLICE |
| Sanitizers of v3, dog, v4, c1, v42, bank, logistics, x, slices (Appendix A) | SLICE+ (else keep the blocks verbatim: they are not read by the slice and the WebView app sanitizes them anyway) |
| R43 `Remap43` + `Check43b` + `Confirm43` / `FailWith` | SLICE |
| `Check43`, `KeepPre43` | SLICE+ |
| Autosave 5 s + pause/quit saves; pass-through serialize | SLICE |
| Transfer: decode, dry run, summary card, apply, markImported, spare | SLICE |
| Transfer: encode / export / share / 되돌리기 / pre-43 code rows | LATER |
| Hold cards with export, 업데이트 link (`https://play.google.com/store/apps/details?id=com.snowbloom.village`) | LATER |
| Chat record, story key, admin backup | LATER (keys kept raw) |
| `shop43` / `bakery43` fix-ups, porter "nothing vanishes" save chain, v4 clock running | LATER |
| `inflate.js`, `window.__FV_*` test switches, CompressionStream feature tests | DROP |

---

## 15. Porting risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | **Number text.** Json.NET writes `5.0` and `1E+21`; caps measured on JSON length (logistics 2,048, `x` caps, slice caps) and byte-for-byte pass-through break. | Custom double writer (§2.3) + T1; compare golden `full` as text, not only as trees. |
| R2 | **Date parsing.** Json.NET's default turns ISO-looking strings (chat memories, names) into `DateTime`. | `DateParseHandling.None` everywhere (one shared `JsonSerializerSettings`). |
| R3 | **Head order.** A writer that sorts keys or puts `t` first breaks `StoredIsNewer` head matching in the WebView app. | Build the stamped object as `v, lv, t` + state; test the first 20 chars. |
| R4 | **DeflateStream on IL2CPP/Android.** Older Unity versions lacked native zlib for `System.IO.Compression` on some targets. | Test decode/encode on the device in week 1; fallback = port `inflate.js` / SharpZipLib `Inflater(noHeader: true)`. |
| R5 | **Regex dialects.** .NET `$` matches before a final `\n`; .NET `\s` differs from JS `\s`; JS `^` with `m` also matches after `\r`. | `\z` anchors; explicit whitespace class (§11.4); normalise line ends first. |
| R6 | **Paste size.** A village with a large chat record gives codes of 100 K+ characters; Android `TouchScreenKeyboard`/`TMP_InputField` gets slow. | 「붙여넣기」 button via `GUIUtility.systemCopyBuffer`; do not echo the whole code into the field (show its length). |
| R7 | **Unity writes something the WebView app cannot read.** | Never write `lv > 43` while the shape is unchanged; never drop loaded blocks (pass-through); run T5/T6 on every Unity-written save too (load it back through the C# sanitizer and compare). |
| R8 | **Integer-like object keys** are ordered first by JS; `JObject` keeps text order. | Only in hand-edited saves; ignore (affects ordering, not content). |
| R9 | **Rounding.** `Math.Round` (banker's) vs JS `Math.round`. | `JsRound` (01) for player x/y, site `t`, summary times. |
| R10 | **Lost writes on Android kill.** The OS may kill the app right after pause. | Save synchronously in `OnApplicationPause(true)`; atomic file replace. |
| R11 | **Remapped village saved before its build finished** would store a half-restored village. | Keep `Pending43` blocking writes until `Confirm43`; T12. |
| R12 | **Lone UTF-16 surrogates** (possible in free text of the chat record) cannot be stored as UTF-8 by .NET (become U+FFFD). | Store the file as UTF-8 but escape lone surrogates as `\uDXXX` in JSON text before writing, or store raw strings as UTF-16LE files. Saves themselves never contain free text. |
| R13 | **Fixture `t` is fractional** (`1794553655616.3242`). | Read `t` as double; write new `t` as an integer (ms). |
| R14 | **Golden data is from `v4.3.0-a3.2`.** If the JS world table (`WORLD.plots`) changes, R43 results change. | Regenerate the golden file with the Node scripts (they only import the game's pure modules) when the JS tree moves. |

---

## 16. Open questions

| # | Question | Proposal |
|---|---|---|
| Q1 | Should the slice be a separate test app (own package id) or an update of `com.snowbloom.village`? | Separate test package for the slice (no risk to players' villages); import via code (§11). |
| Q2 | Port the non-slice sanitizers (Appendix A) now or keep those blocks verbatim? | Verbatim in the slice (not consumed); port with the systems that read them. |
| Q3 | What does the slice show for a `newer` / `failed43` hold? | A one-screen Korean modal + 「새 마을로 시작」; full cards later. |
| Q4 | Does the slice need 「내보내기」 (making codes) for the designer to send villages back? | Not for go/no-go; add right after (encode is ~40 lines once decode exists). |

---

## Appendix A — keep-rules of the blocks the slice passes through (exact, for the later port)

Notation: `count(v, max)`, `counts(v, keys)`, `num(v, d)` as §7.1; `clamp(x, a, b)`; `itemCounts(v, max = 999)` =
`{ k: count(v[k], max) for k in ITEMS order if present and count > 0 }`; `u32(v)` = `num(v,0) ≥ 0 ? floor(n) mod 2^32 : 0`;
`st012(v)` = `clamp(floor(num(v,0)), 0, 2)`; `TPL` = `^[a-z][a-z0-9_]{0,23}\z`. Each block function returns null on any
exception (block dropped).

**A.1 `v3`** (always written, members `undefined` → omitted): `warehouse`: object → `counts(v, ITEMS)`; `food`: object →
`{ on: on === true, food: counts(food, MINER_FOOD) }`; `dock`: object → `{ level: count(level, 2), catch: counts(catch,
FISH) }` (then the 30-fish cap of §7.2); `workshops`: for k in [toolsmith, cannery] with an object → `{ ins: counts(ins,
[item_plank, item_ingot, item_fish_raw, item_fish_big, item_meat_raw]), outs: counts(outs, STORE_GOODS) }`; `store`: object →
`{ stock: counts(stock, STORE_GOODS), cash: count(cash, 1e9) }`.

**A.2 `labour`, A.3 `dog`**: §7.2.

**A.4 `v4`** (`sanitizeV4`, Save.js 688–761):
`{ v: 1, clock: { t: clamp(num(t,200),0,3600), day: count(day,1e6), on: on === true }, town: { seed: clamp(floor(num(seed,2611)),0,4294967295), open: open === true, extra: [ e for e in extra if array, len ≥ 2, e[0] finite number, e[1] string ^[a-z]{1,20}\z ][0..64] → [count(e[0],999), e[1] (≤ 20 chars), e[2] string ^[A-Za-z0-9_]{1,40}\z else null], regulars: [ e array with e[0], e[1] finite numbers ][0..40] → [count(e[0],999), count(e[1],999)] }, orders: …, cargo: counts(cargo, ITEMS) each min 999, shops: …, houses: …, cash: count(cash,1e9), rentAcc: count(rentAcc, 2000), happy: { n: count(n,200), sum: clamp(num(sum,0), 0, n) }, rank: rank === 2 ? 2 : 1, porters: count(porters, 2) }`.
`orders`: `cards` = first 3 objects of `orders.cards`: `shop` = known founding shop (cafe, restaurant, carpenter_workshop,
hardware_store, supermarket) or null (a named unknown shop → card dropped); `need = counts(need, ITEMS)` minus values
outside 1..999; dropped when no shop and no need; `got = counts(got, keys of the shop's need or of need)`;
`idle = clamp(num(idle,0),0,3600)`. `done` = unique known shops, ≤ 5. `standing = count(standing, 1e6)`. `kept` (only when
non-empty) = `{ shop: counts(v, keys of its need) }` for known shops with a non-empty result.
Shop needs: cafe {bread 30}, restaurant {fish_cooked 40, meat_cooked 15}, carpenter_workshop {plank 50}, hardware_store
{ingot 25, axe 1, pickaxe 1}, supermarket {can 10, bread 20}; sells: cafe [bread], restaurant [fish_cooked, meat_cooked],
carpenter_workshop [], hardware_store [axe, pickaxe, rod, sickle, bow], supermarket [can, bread].
`shops`: for each lot id in lots (lotA1, lotA2, lotA3, lotB1, lotB2, lotB3, lotB5, lotH1…lotH5) with an object whose `shop`
is a known shop not seen before → `{ shop, st: wait|build|ribbon|open (else wait), t: clamp(num(t,0),0,600), stock:
counts(stock, its sells) each min 999 }`. `houses`: lot ids that are not shops, object → `{ st: site|build|done (else site),
got: { item_plank: count(got.item_plank, 999) }, t: clamp 0..600, look: clamp(floor(num(look,0)),0,3) }`.

**A.5 `c1`** (`sanitizeC1`, 654–682): `{ settlers: count(settlers,500), settleT: clamp(num(settleT,0),0,3600) }`; `hall`
(object) → `{ tax: count(tax, 1500), acc: clamp(num(acc,0),0,1000) }` + `stn = count(stn, 2000)` if > 0; `rest` (object) →
`{ pantry: { f: count(pantry[f], 30) for f in FOODS if present }, cash: count(cash,1e9), served: count(served,1e9) }` +
`tables = count(tables, 2)` if > 0, `busyT = JsRound(clamp(num,0,3600))` if > 0, `server2: 1` if 1/true,
`serveWaitT` like busyT.

**A.6 `v42`** (`sanitizeV42`, 321–386), output `{ v: 1, office, news, letters, up, p2, train, freight, depot, ledger, seen, full?, sleighWait?, offerPaid?, crew? }`:
- `office` = `{ st: st012, staff: first 4 of staff mapped u32, padded with 0 to 4, bag: count(1e9), safe: count(1e9), log }`
  + `site` = `{ got: counts(got, MATERIALS), t: clamp 0..600 }` if present + `bankSt: st012` if present + `hirePaid =
  count(1e6)` if > 0 + `inc = [count(inc[0],1e6), { k: count(v,1e9) > 0, keys ^[a-z0-9_]{1,12}\z, ≤ 12 }]` if non-empty;
  `log` = last 8 rows `r` (array, len ≥ 3, `r[1]` string ^[a-z0-9_]{1,16}\z) → `[count(r0,1e6), r1, JsRound(clamp(num(r2),−1e9,1e9)), JsRound(clamp(num(r3),0,1439))]`.
- `news` = `{ day: clamp(floor(num(day,−1)),−1,1e6), papers: last 3 of [day, heads] → [count(day,1e6), first 5 heads h (array, h[0] TPL) → [h0, JsRound(clamp(num(h1),±1e9)), JsRound(clamp(num(h2),±1e9))]] }`.
- `letters` = `{ seq: count(1e9), inbox: last 6 rows (len ≥ 4, r[1] TPL) → [count(r0,1e9), r1, clamp(floor(num(r2)),0,3), count(r3,1e6)], once: unique TPL strings ≤ 16 }` + `nextT = clamp(num,0,1e6)` if present + `happy = count(99)` if present + `tg = [JsRound(clamp(tg0,0,3600)), JsRound(clamp(tg1,0,86400)), count(tg2,99)]` if array + `bk = count(1e6)` if `num(bk,−1) ≥ 0`.
- `up` = `{ line: 1 }` for line in [grill, sawmill, bakery, smelter, smokehouse] when 1/true.
- `p2` = unique entries of [grill, sawmill, bakery, smelter, smokehouse, toolsmith, cannery, dock], ≤ 8.
- `train` = `{ stage: stage === 2 ? 2 : 1, big: big ? 1 : 0, labels: count(99) }`; `freight` = `{ dock: itemCounts(dock, 9999), cars: itemCounts(cars, 999) }`.
- `depot` = `{ st: st012, sleighs: sleighs === 2 ? 2 : 1, load: itemCounts(load,999), porters34: clamp(floor,0,2), sales: [count(1e6), count(1e9), count(1e12)] (default [0,0,0]) }` + `site` like office + `hires = clamp(floor,0,3)` if present + `fork = fork ? 1 : 0` if present + `hp = { staff: count(1e6), fork: count(1e6) }` if object.
- `ledger` = `{ full: first 40 keys ^[a-z0-9_:]{1,32}\z → JsRound(clamp(num,0,1e6)) }`.
- `seen` = `{ whatsNew|pickupTip|trainNew|halo: 1 if truthy, cheer: count(99) }` + `boost = count(3)` if > 0 + for k in [p2, up, big, p34, sl2, tb] with an object: `{ q: 1 }` for keys ^[a-z0-9_]{1,16}\z with truthy values.
- `full` (object) = `{ line: JsRound(clamp(num,0,3600)) }` for the 8 lines present; `sleighWait` = JsRound(clamp 0..3600) if > 0;
  `offerPaid` = first 8 keys ^[a-z0-9_]{1,24}\z with `count(1e6) > 0`; `crew` (object) = `{ n: count(12) }` + `rate = count(1e5)` if > 0 + `since = JsRound(clamp(num,0,600))` if > 0.

**A.7 `bank`** (`keepBank`, 393–425): null unless object with `v` absent, 1 or 2. Helpers here use **only real JSON
numbers** (strings → default). `{ v: 1, open: open ? 1 : 0, sv: int(0..1e9, 0), ld: int(−1..1e7, −1), tk: int(1..999, 1) }`
(int = floor of clamped number) + `v6: 1` if truthy + `so: 1` if truthy + `t5 = round(clamp(−1e9..1e10))` if a number +
`ln` (object with `l` > 0 after int(0..1e9)) = `{ a, l, f: min(l, f), t0: round(clamp), d0: int(0..1e7), rs: int(0..9), ps: ps ? 1 : 0, k: k === "ceremony" ? "ceremony" : "build" }` +
`rw` = last 8 rows `[n, op, a, b]` (exactly 4, op in deposit|withdraw|interest|loan|repay|premium|claim|waive, numbers in
range) → `[floor, op, round, round]` + `ins` = up to 24 unique `[id (1–10 chars), c (int ±1e6, ≠ 0), int(0..999983)]`,
and then `v = 2`.

**A.8 `logistics`** (`keepLogistics`, 431–479): v8 format, ids without `item_`; `int(x, lo, hi, d) = Number(x)` finite →
`clamp(round)`; `{ v: 1, open, gift, tut (truthy → 1/0), day: int(−1..1e7, −1), seq: int(0..1e9), stock: items(stock, 9999),
orders, cash: int(0..1e8), chains, lv3, days, made: [0,0], tot: [0,0,0] }`. `items(q, max, lim = 40)` = sorted keys
`^[a-z][a-z0-9_]{0,23}\z`, `int > 0`, ≤ lim. `orders` ≤ 12 rows `[id ^[A-Za-z0-9_:.-]{1,40}\z unique, to ^(shop|story|home):[A-Za-z0-9_.:+-]{1,40}\z, f ^[syh][vwc][pkrg][s]?[3m]?\z with to's kind = {s: shop, y: story, h: home}[f0], got items(…,999,12), miss items(…,999,12)]`, dropped when got and miss are empty.
`chains` ≤ 6 `{ id unique, k: f|a, in: int(0..99), out: ≤ 8 of (f: chair|table|sofa|bed|wardrobe; a: radio|stove_iron|washer|fridge|tv_retro), m: int(0..1e7), r: int(0..1e7) }`.
`lv3` ≤ 32 unique id strings; `days` = first 10 → int(0..1e6); `made` = 2 × int(0..1e7); `tot` = [int(0..1e8), int(0..1e10), int(0..1e9)].
Then while JSON length > 2048: remove the first order whose flags have no `s` from index 3 and `f[2] != 'g'` (else the first
with `f[2] != 'g'`), adding its `got` back to `stock` (≤ 9999); then pop `days` (keep ≥ 1); then pop `lv3` (keep ≥ 8).

**A.9 `v43`**: §4.5.

**A.10 `x` drawer** (`keepX`, 579–615): caps (JSON length) `log 512, mgmt 256, needs 1024, daily 512, rewards 512, money
896, book 1024, mail 512, wk 1024, g43 48`, unknown key 512, total 6,400, ≤ 24 keys, key `^[a-z][a-z0-9_]{0,15}\z` and not
an `Object.prototype` member name (with the key pattern above this excludes only `constructor`). Each value: deep copy;
over its cap → `fitX`: an array drops its oldest (first) elements; an object repeatedly drops the first element of its
longest array member; still over → key dropped. Then while the drawer is over 6,400: unknown keys (newest first), then the
known keys in reverse table order, each trimmed by the excess (dropped if it cannot fit). Every trim/drop is logged.
Not a plain object (and not null/absent) → dropped. Empty result → omitted.

**A.11 module slices**: `missions` 3072, `geumbang` 1400, `haul` 768, `demand` 1024 — a plain object within its JSON-length
cap is deep-copied, otherwise dropped.

## Appendix B — settings record (`frostVillage.settings.v1`, Save.js 1046–1093; behaviour in 01)

Written whole by `Settings.save()` (refused while `SaveGuard.NoSave`). Fields and load rules:

| Field | Default | Kept when |
|---|---|---|
| `sound`, `music`, `daynight`, `nav`, `halo`, `observeEvents` | true | anything but `false` → true |
| `lang` | null | `"ko"` or `"en"` |
| `zoom` | null | number with 0.2 < z < 5 |
| `gfx` | `"auto"` | `high` / `mid` / `low` |
| `gfxAuto` | null | `high` / `mid` / `low`; `gfxDev`: string < 80 chars; `gfxWhy`: string < 12 chars |
| `perfInfo`, `obsPanHint` | false | `true` |
| `water` | null | `low` / `high` |
| `voice` | 1 | number 0..1 |
| `pickup` | `"auto"` | `still` / `off` |
| `observeAfter` | 60 | one of 0, 30, 60, 120 |
| `observeSpend` | `"none"` | `hire` |
| `vol` | `{ master: 1, music: 1, sfx: 1, amb: 1 }` | each number 0..1, rounded to 0.01 |

Write order: sound, music, lang, zoom, daynight, gfx, water, voice, pickup, nav, halo, observeAfter, observeEvents,
observeSpend, vol, obsPanHint, gfxAuto, gfxDev, gfxWhy, perfInfo.
