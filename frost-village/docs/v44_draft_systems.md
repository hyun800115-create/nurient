# v4.4+ draft — systems architecture & mobile UX (촌장 성장 · 퀘스트 · 임무 · 보상 · 행복 · 자원 · 관리자 · 계정)

Status: **DRAFT** (systems architect + mobile UX, 2026-10-18). No source or test file was changed.

This is the "how it is built" companion of `docs/v44_draft_design.md` (the game and economy design: XP table, 14 skills,
67 quests, reward numbers). Numbers are not repeated here. Where this draft decides differently, §0.2 says so and why.

Read with:
- `src/core/Save.js`, `src/scenes/Game.js`, `src/scenes/UI.js`, `UIv4.js`, `UIv42.js`, `OfficePanel.js`;
- `src/systems/Progression.js`, `Tutorial.js`, `Navigator.js`, `StockLedger.js`, `V42.js`, `v42/index.js`;
- `src/missions/**`, `docs/build_reports/missions_bank.md` §12, `docs/build_reports/geumbang_module.md` §8;
- `docs/v5_v8_plan.md` §5 (the kit), `tools/apk/**`, `docs/build_reports/apk.md`, `tools/build/build_artifact.mjs`.

Line numbers below are from today's working tree. They move: **anchor on the function names**.

---

## 0. Summary

### 0.1 디자이너께 (쉬운 말)

- **새 기능은 모두 '부품'으로 따로 만들어 끼워요.** 지금 게임(v4.2)과 금방(v4.3)은 건드리지 않고, 부품마다 저장 칸을 따로 둬요.
- **화면은 붐비지 않게 했어요.**
  - 왼쪽 위 코인 옆에 **레벨 동그라미**가 생겨요. 누르면 스킬 창이 열려요.
  - 오른쪽 위에는 **우편함**과 **선물 상자**가 생겨요. 받을 게 없으면 숨어요.
  - 왼쪽 칩 줄 맨 위에 **퀘스트 칩**이 생겨요. 칩이 너무 많으면 작은 화면에서는 '더보기'로 접혀요.
  - 행복도와 지역 자원은 지금 있는 '마을' 칩과 '전체 보기' 지도 안에 들어가요. 새 버튼이 없어요.
  - 관리자 모드와 로그인은 설정 안에 있어요.
- **로그인은 이렇게 돼요.**
  - 앱(APK)과 GitHub 주소(웹)에서는 구글 로그인이 돼요. 로그인하면 다른 기기에서 이어 할 수 있어요.
  - Claude 아티팩트 링크에서는 구글 로그인이 안 될 가능성이 커요. 대신 **저장 코드**(글자 복사)로 옮길 수 있어요.
  - 로그인하려면 디자이너님이 두 가지를 해 주셔야 해요 (§8.8에 순서대로 적었어요).
    1. 새 무료 Supabase 프로젝트를 만들어도 된다는 허락
    2. 구글 클라우드에서 'OAuth 클라이언트' 만들기 (10분쯤)
- **관리자 모드**는 지금 마을을 따로 보관한 뒤 '연습용 마을'에서 켜져요. 끝내면 원래 마을로 그대로 돌아가요.

### 0.2 Decisions (and where this differs from `v44_draft_design.md`)

| # | Decision | Why |
|---|---|---|
| D1 | Build a **kit-lite** (`src/kit/`: GameFeed, IncomeMeter, Ports, ModuleHost, slice registry) in v4.4. The new systems are kit modules. No throw-away `V44` orchestrator. *(design §14.3 proposed V44 now, ModuleHost in v5)* | v4.5 must wire `missions_bank`, which is already a ModuleHost module. Building V44 first means building and migrating twice. The kit API follows `v5_v8_plan.md` §5.2–5.4, so v5 only adds ports. |
| D2 | **One mission system.** The quest chain lives inside `missions_bank` as a new model (`src/missions/model/chain.js`) and a new catalog (`src/missions/data/chain.js`). Its state goes in the `missions` slice (`qc`). The monthly card is `missions.mo`. *(design §14.1 put quests in `chief.q`)* | This is the brief ("extend missions_bank, do not build a second system"). It reuses `signals.js` / `units.js` counting, the pay formula, the chip and the panel. The chief module owns XP and skills only. |
| D3 | The missions module gets **sub-gates**: chain always on; calendar after q210; board, requests, events and fame stay at 읍 (as built). | The chain must run from minute 0. The v5 parts keep their gate and their port needs. |
| D4 | Rewards (출석, 접속 선물, 오프라인 정산, 우편함, 쿠폰) form one module, `src/rewards/`, with slice `rewards`. *(design: `chief.att/gift/off/mail`)* | Separate ownership, cap and tests. The chief slice stays tiny (≤ 512 B). |
| D5 | **One hidden door.** Tapping the version label 7× opens the 관리자 sheet. The v5 "이야기 미리보기" (planned on 5× taps, `v5_v8_plan.md` §5.8) becomes a row inside that sheet. | Two hidden counts on one label would collide. |
| D6 | **First 출석 sheet after chapter 1** (q109), not at the very first launch. Afterwards: the first load of each new day key. *(design §7.1: "after the title")* | A brand-new player meets the name sheet, the first loop and the tutorial. A reward sheet in minute 1 is noise. |
| D7 | **저장 코드 is text only** (copy / paste, or a file where the platform allows). No QR. *(design §12: "copy text or QR")* | The v4.4 save is ≈ 10–14 KB JSON → ≈ 6–7 KB as compressed base64. A phone-scannable QR holds ≈ 2.9 KB. |
| D8 | `progress.up` is not a downgrade path. *(design §14.1)* | `Save.load` refuses any future save version (it keeps a copy and starts fresh). `progress.up` stays only as a read-only mirror of the base ranks, for old tools and fixtures. |
| D9 | Account + cloud is a **platform service** (`src/account/`), outside the game save, guest by default. Login exists in the APK (Custom Tab + deep link) and on GitHub Pages (redirect). In the claude.ai artifact the game stays guest-only, with two optional extras: the artifact `db` capability (per-viewer storage, for viewers at Contributor or above) and 저장 코드. | Google refuses OAuth inside embedded WebViews. The artifact frame cannot navigate away and likely cannot reach Supabase. |
| D10 | Supabase: a **new free project** (needs the designer's OK), the **publishable key** (`sb_publishable_…`), RLS on one `saves` table, writes through one compare-and-swap RPC. Never `nuripang`, never a secret key in any client. | Supabase docs: the legacy anon keys work only until the end of 2026. Today is 2026-10-18. |
| D11 | **Art: one new UI page `ui7`** (≤ 1024×1024, +2 files at most). v4.4 can ship on stand-ins (Graphics plus existing icons) and swap the art in place when it lands (the `HudV42.reskin()` pattern). | Artifact: 412 files today → ≈ 457 after 금방. The gate is 480. |
| D12 | `ui_icon_piggy` and `ui_icon_box` (the design's B2 skill icon and the gift box) live in `fx_city` (ui4). That fragment is not shipped. They are redrawn in `ui7`; using them as they are would add the whole ui4 sheet. | File and texture budget. |

---

## 1. What the code does today (facts this draft builds on)

| Area | Fact | Where |
|---|---|---|
| Save | One JSON in `localStorage['frostVillage.save.v1']`, `SAVE_VERSION = 7`, autosave every 5 s (`BALANCE.autosaveEvery`), on `visibilitychange` and `pagehide`. | `src/core/Save.js` (`Save.write`, `Game.save`) |
| Save | `sanitizeSave` **builds a new object field by field**. Any key it does not know is dropped. New slices need a keep rule. v4.2 used local copies: `keepBank`, `keepLogistics` (and 금방's `keepGeumbang`, G-P5). | `Save.js` `sanitizeSave()` |
| Save | `MIGRATE[v]` turns version v into v+1. An unknown or future version is backed up to `frostVillage.save.backup` (or `.backup.2`), then the game starts fresh. | `Save.load()` |
| Save | The chat record is a separate key (`.chat`), tied by `cid`. | `ChatSave` |
| Upgrades | `Progression.up = { capacity 0–5, speed 0–4 }`. The two bench pads appear after `hire_lumberjack` (`openBench`). Partial payments are kept in `paid.up_capacity` / `paid.up_speed`. The player reads `progress.capacity()` / `speedMult()`. | `Progression.js`, `Player.js` `get capacity` / `get speed`, `PickupPolicy.js` |
| Upgrades | `Tutorial.upgradeHint` and three loops in `Tutorial` read `prog.upPads`. `Game.installHooks().where()` lists `up_*` pads. | `Tutorial.js` |
| Costs | One choke point for building costs: `buildCost(bkey, siteId)`. One for pad prices: `stepCost(s)`. A lowered price already refunds overpaid partials (`syncPads`, `sanePrice`). | `Site.js`, `Progression.js` |
| Coins | `Economy.add(n, x, y, fly)` / `spend(n)` carry no tag. Every pad pays through `spend`. | `Economy.js`, `UnlockPad.update` |
| Orchestration | v4.2 systems hang off `V42` (`src/systems/v42/index.js`, list `SYSTEMS`). 금방 (v4.3) joins as the V42 system `gb`. Its adapter emits `gs.events.emit('gb', e)`. | `V42.js`, `geumbang/ports_v4.js:498` |
| Kit | `src/kit/` **does not exist**. `missions_bank` needs ModuleHost, Ports, GameFeed and IncomeMeter (missions report §12.1). Its gate today is 읍 (`rank2`). | `src/missions/index.js` |
| Events | Phaser scene events with positional arguments (`'sold', value, c` …). There is no normalized feed (inventory in §3). | many |
| Panels | Settings is pausing (560×1020, two tabs). OfficePanel is non-pausing (`min(W−24,700)` × `min(H−220−insets,1100)`), tap outside closes, and it sets `ui.v42PanelOpen`. The UI scene stops the joystick while `panelOpen / buildOpen / v4PanelOpen / v42PanelOpen` (`UI.js:130`). | `UI.js`, `OfficePanel.js` |
| DOM input | The resident chat is a DOM sheet that follows `visualViewport`. While it is open it sets `game.input.keyboard.enabled = false`, so Phaser's captured W/A/S/D, arrows and space do not eat typing. | `ChatPanel.js`, `ResidentChat.pauseGame()` |
| Navigator | Draws a route only while the chief carries something (`wanted()`: bag not empty, nav on, no tutorial, no 관망, no panel, no ceremony). It cannot point at an arbitrary place yet. | `Navigator.js` |
| StockLedger | Registry of every stock, sampled at 1 Hz. Gives per-line status short / jam / surplus / ok and flows per minute. Each stock has a `place`. | `StockLedger.js`, `V42.registerStocks()` |
| Title | One "tap to start" pill. It continues the save, or starts a new game when there is none. Reset is in settings (처음부터 하기). | `src/title/*`, `UI.panelFooter()` |
| Artifact | 412 files + page (v4.2 build3), ≈ 457 after 금방 (estimate), gate 480. The page declares `capabilities: { sample: {} }`. | `docs/build_reports/v42_code2.md` §3.7, `geumbang_plan.md` D14 |
| APK | One Activity and one WebView. The game is served from `https://appassets.androidplatform.net/`. Built against the API-16 stub `android.jar` (anything newer is called by reflection). `singleTask`, INTERNET + VIBRATE. Any non-game link goes to the phone's browser (`shouldOverrideUrlLoading`). The manifest template is filled by `build_apk.py`. There is no androidx (maven.google.com is blocked). | `tools/apk/**` |
| Supabase | Org "hyun800115@gmail.com's Org": `nuripang` ACTIVE_HEALTHY (unrelated: do not use); `gideon1-cell`, `idle-sword-master` INACTIVE. All in ap-northeast-2. Checked with `list_projects`, read-only. | — |

---

## 2. Architecture

### 2.1 Map

```
 Game (v4 code) ── Progression · Site · Seller · Station · Player · Territory · Civic · Growth · Rank · Tutorial · Navigator · UI
     │  positional gs.events (legacy)            ▲ read-time hooks: gs.chief.mod(key, base)   ▲ Ports (calls)
     ▼                                            │                                             │
 ┌──────────────────────────── src/kit (v4.4 "kit-lite", v5 completes it) ─────────────────────────────────────┐
 │ GameFeed (one stream) · IncomeMeter · Ports (subset) · ModuleHost (gates, order, slices) · slices registry      │
 └──▲───────────────▲───────────────────▲──────────────────▲────────────────▲───────────────────▲─────────────────┘
  chief          missions (+chain     rewards           admin            insight (v4.6)       album (v4.6)
  XP · Lv · SP   +monthly; calendar   출석 · 접속 선물     관리자 모드        행복 · 지역 자원       도감 · 업적
  skills · name  early; v5 board…)    오프라인 · 우편함                       · 통계
                                                            account (platform service, not a module): Google login · cloud save · 저장 코드
```

- **Module shape**: exactly `v5_v8_plan.md` §5.2. Each module is `index.js` (entry), `model/` (pure, seeded, no Phaser / window / Date), `view/` (Phaser), `host.js`, `save.js`, `tuning.js`, `strings.js`.
- **Import rules**: as in §5.1 of that plan.
  - v4 code may import `src/kit/ModuleHost.js`, plus **one** read-time facade: `gs.chief` (a frozen object the chief host publishes; §2.5).
  - A purity test greps the import graph.

### 2.2 `src/kit` — what v4.4 builds (L0 subset)

| File | v4.4 scope | Left for v5 |
|---|---|---|
| `GameFeed.js` | The bus (§3.1), the v4 normalizer table (§3.2), `emit(obj)`, `on(fn, name, order)`, `__FV.feed.log(n)` | module events of story / vehicles / harbor … (they already speak objects) |
| `income.js` | `IncomeMeter`: samples `economy.earned` every 5 s, rolling 300 s, `perMin()`, `dayAvg()` (30 min), minus tagged payouts (`quest`, `mission`, `gift`, `attend`, `offline`, `admin`, `loan`) | — |
| `Ports.js` / `FakePorts.js` | `coins` (with tag), `income`, `ui` (toast, banner, safeTop/Bottom, panelOpened, scene), `clock` (T, hour, day, wall, localDate), `lang`, `rank`, `facts.has/count` (§2.3), `progress.setFlag`, `settings.get`, `sound`, `view`, `emit`, `later` | people, places, town, roads, water, sites.offer, residency … (v5) |
| `ModuleHost.js` | gates polled at 1 Hz (and on load), construction in `needs` order, a fixed tick order, perf EWMA, slice pass-through while a module is not built, `gs.later.<id>` = host.api, `__FV.later` hooks, `tap(wx, wy)` routing | previews |
| `slices.js` | registry `[{ key, version, cap, sanitize }]`, `fitCap`, used by `Save.sanitizeSave` (§2.6) | — |
| `rng.js` | mulberry32 + named streams | — |

`Game.js` gets one block (the plan's P1), placed **right after `buildV42(this, sv)`**, earlier than v5 planned. Reason: the chief must exist before `this.restore(sv)` runs, because the player's stack is restored up to `this.player.capacity`. The plan put the block after `Neighbours.attach`; it moves up one line. Modules with an always-true gate are created synchronously inside the ModuleHost constructor.

### 2.3 Modules

| Module | Folder | Gate | Slice (cap) | Public API (`gs.later.<id>`) | Depends |
|---|---|---|---|---|---|
| **chief** | `src/chief/` | always | `chief` (512 B) | `name()`, `title()` (by `Rank.level`: 촌장 / 읍장 / 시장 v5), `display()` → `눈송이 읍장`; `level()`, `xp()`, `sp()`, `rank(skill)`, `canLearn(skill)`, `learn(skill)`, `respec()`, `addXp(n, why)` (admin), `openSkills()`, `rename(nm)` · **facade** `gs.chief.mod(key, base)` (§2.5) | kit; reads `gs.v42.pilot.on` (관망 XP ×0.25) |
| **missions** (+chain, +monthly) | `src/missions/` | module always; **sub-gates**: chain always, calendar after `q210`, board / requests / events / fame / craft / followers at 읍 (as built) | `missions` (3,072 → **3,584 B**: + `qc` ≤ 380 B, + `mo` ≤ 40 B) | existing api + `chain()` → `{ id, title, done, n, need, target }`, `chainFocus()`, `claim(id)`, `openNotebook(tab)` | kit; bank? story? vehicles? (v5) |
| **rewards** | `src/rewards/` | always (sheets wait for their own conditions) | `rewards` (1,536 B) | `mail(kind, payload, why)`, `mailCount()`, `coupon(bkey)` / `useCoupon(bkey)`, `attendDue()`, `giftState()`, `offlinePending()` | kit, missions (stamps) |
| **admin** | `src/admin/` | built only while admin mode is on | none in the normal save; admin saves carry `adm` | `on()`, `flags`, `open()`, `exit(kind)` | kit, chief, missions |
| **insight** (v4.6) | `src/insight/` | after `hire_miner` (residents with homes exist) | `insight` (≤ 256 B: seen flags, last TOP 3) | `happiness()`, `resident(pid)`, `regions()`, `shortTop3()`, `guideTo(rowId)` | kit, StockLedger, chief (관찰력, 인기도) |
| **album** (v4.6) | `src/album/` | always | `album` (≤ 768 B) | 도감 · 업적 counters, stamps | kit |
| **account** (service) | `src/account/` | not a module; started from `main.js` before the Title scene | **outside** the save (§2.6 keys) | `state()`, `signIn()`, `signOut()`, `syncNow()`, `export()`, `import(code)` | platform (§8.1) |

**Facts** (`ports.facts.has(cap)`), the subset v4.4 and v4.5 need, extending missions report §12.4:
- `step:<id>`, `b:<key>`, `r:<region>`, `f:<flag>`: the `Progression.met()` grammar, so the same strings work;
- `rank:n`, `shops:n`, `people:n`;
- `skill:<key>:<r>`;
- `q:<questId>`: a quest is done;
- `gb`: 금방 open;
- `v42:office` / `bank` / `depot`.

### 2.4 Construction and tick order

```
Game.build():
  … Player, Economy, Progression, Tutorial
  buildV42(this, sv)                         (v4.2 + 금방 gb system)
  this.later = new ModuleHost(this, sv, LATER_MODULES)    ← NEW (chief, missions, rewards, insight, album; admin when on)
  Neighbours.attach · restoreV3 · progress.init · restore(sv) · …
  this.later.afterRestore(sv)                ← NEW: quest catch-up (once), chief base ranks applied, rewards offline check
Game.update(dt):   … v4.update → v42.update → later.update (order: chief → missions → rewards → insight → album)
Game.serialize():  …, ...(this.later ? this.later.serialize() : passThroughSlices(this.saved))
```

`progress.init()` must not create the bench upgrade pads any more. `openBench(true)` creates the **촌장 수련대** pad instead (§5.2). `upPads` stays `{}` so the old loops in `Tutorial` and `where()` become no-ops.

### 2.5 Hooks into v4 code: the skills (read-time, BALANCE never mutated)

`gs.chief.mod(key, base)` returns `base` unchanged when the chief module is missing (tests, a broken module). Every call site below is one line.

| Skill (design §4.2) | Key | Call site (file · function) | What changes |
|---|---|---|---|
| A1 큰 가방 | `bag` | `Progression.capacity()` | `gs.chief.value('bag')` (the skill's `values[r]`); falls back to `BALANCE.upgrades.capacity.values[up.capacity]` |
| A2 가벼운 발걸음 | `speed` | `Progression.speedMult()` | same with `speed` |
| A3 손재주 | `hands` | `Station` update (`labour.chiefSpeed`, `:97`); `Register` chief branch (pay time); `Player` gather swing timer | multipliers |
| A4 넓은 손길 | `reach`, `stillS` | `Player.update` (`gatherRange`, `:126`, `:136`); `PickupPolicy` still wait | radius, seconds |
| B1 뚝딱 건축 | `buildTime` | **`buildCost()`** (`Site.js:27`): `time` field. `Growth` carpenter houses / founding time. Logistics site porter capacity | one choke point covers the build menu, Site, towers, Tutorial |
| B2 알뜰 건축 | `buildCoins` | `buildCost()`: `coins` | — |
| B3 꼼꼼한 설계 | `buildMats` | `buildCost()`: `item_plank` / `item_ingot` (floor rule of the design); `Growth` houses `item_plank` | — |
| C1 설득력 | `hire` | **`stepCost(s)`** for hire / hire2 / hire3 / operator / raw / porter / clerk / stationPorter / restStaff, not zone / tower / rank / boat. `Office` hire price, `LineUpgrades` porter2 costs. r3–r4 extras: `Growth` founding need, swap timers | after a rank is learned: `Progression.reprice()` (new) re-reads every live pad, refunds overpaid partials (same code as `syncPads`) |
| C2 인기도 | `happyCap`, `settlers`, `visitors` | `Civic.happyBonus()` cap, `Civic.updateSettlers()` interval, `Neighbours` riders base; insight 촌장 need | — |
| C3 리더십 | `workerSpeed`, `cheer` | `Worker` speed, `StationPorter`, `ChiefAura` cheer mult / radius / still | — |
| C4 협상 | `rates` | `Growth.payWholesale()`, `Freight.payExports()` rate, `DepotSystem` sell rate, `Seller` trade slowness, 금방 `settle` (through its ports) | — |
| D1 관찰력 | `insight` | insight panel detail level (§5.9) | — |
| D2 행운 | `luck` | `Player.impact()` after `n.hit(this)`: +1 item roll (seeded stream `luck`); `DogPlay` gift interval | — |
| D3 든든한 금고 | `vault` | rewards offline cap / rate; `Growth` rent cap, `TownHall` tax cap | — |

Caps are clamped twice: in `balanceCheck` (§2.7) and in `mod()` (the design's §4.5 hard caps), so a typo can never make a 0-cost building.

### 2.6 Save: slices, version bump, migration

**Registry instead of more local copies.**
- `Save.sanitizeSave()` gains one loop:
  ```js
  for (const S of SLICES) { const v = S.sanitize(raw[S.key]); if (v) s[S.key] = fitCap(v, S.cap); }
  ```
  `SLICES` comes from `src/kit/slices.js`. The v4.4 modules' `save.js` files are pure (data imports only), so `Save.js` may import them; a purity test checks that.
- The v4.2 / 금방 local copies (`keepBank`, `keepLogistics`, `keepGeumbang`) stay as they are, with their parity tests.

**Slices** (all pure, idempotent, never throw; 500 fuzzed blobs each in tests):

```
chief:    { v:1, nm:'눈송이', vn:'', xp:12345, sp:3,
            sk:{ bag:4, speed:4, hands:1, … }, base:{ bag:4, speed:4 },      // base = ranks paid on the old map pads
            rs:[respecs, lastDayKey], star:0, seen:{ name:1, bench:1, skillTip:1 },
            mig:{ refund:120, cu:1 } }                                        // set by MIGRATE[7], cleared after the summary card
missions: { …existing…,
            qc:{ i:23, p:[7], d:'<base64 bitset>', cl:['q502'], sd:{ s01:[0] }, cu:0 },   // active main quest index, its units, done bits, unclaimed ≤ 3, side ≤ 3
            mo:{ m:24322, s:12, got:3 } }                                     // month key, stamps, milestone bits
rewards:  { v:1, att:{ n, loop, board, bi, last }, gift:{ d, s, got }, off:{ seen, iday },
            mail:[[id, kind, payload, dayKey]] (≤ 20), cp:{ deco_snowman:1 } (≤ 12 kinds), first:{ cloud:0 } }
insight:  { v:1, seen:{…}, top:[…] }          (v4.6)
album:    { v:1, c:{…counters…}, st:'<bits>' } (v4.6)
later:    { v:1, g:{…gates seen…} }            (kit, 128 B, as planned for v5)
adm:      { money, inst, all, happy, spd, dk }  (admin saves only)
```

Size: today's save is ≤ 10 KB (`save_v42.mjs`). The worst case with every new slice adds ≈ 3 KB, so ≤ 14 KB. This is checked in the save suite.

**`SAVE_VERSION` 7 → 8 in v4.4, with `MIGRATE[7]`** (pure, JSON only):

```js
7: (s) => {
  const o = Object.assign({}, s, { v: 8 });
  const pr = isObj(s.progress) ? s.progress : {}, up = isObj(pr.up) ? pr.up : {}, paid = isObj(pr.paid) ? pr.paid : {};
  const c = clampInt(up.capacity, 0, 5), sp = clampInt(up.speed, 0, 4);
  const refund = count(paid.up_capacity) + count(paid.up_speed);        // partial payments on the old pads come back
  const p2 = Object.assign({}, paid); delete p2.up_capacity; delete p2.up_speed;
  o.progress = Object.assign({}, pr, { paid: p2 });                      // `up` kept as a read-only mirror (D8)
  o.coins = count(s.coins, 1e12) + refund;
  o.chief = { v: 1, nm: '', xp: 0, sp: 0, sk: { bag: c, speed: sp }, base: { bag: c, speed: sp },
              mig: { refund, cu: 1 } };                                  // cu = the quest catch-up runs once at the next afterRestore
  return o;
}
```

- **Equal value** (design §4.4): the old bag and boots ranks become **base ranks**. They are never charged again and never respecced. The partial payments come back as coins (toast `작업대에 냈던 코인 {n}개를 돌려드려요`).
- **Catch-up runs at runtime, once**, in `missions.afterRestore` (needs live facts: built buildings, regions, people). Order:
  1. quests auto-complete;
  2. XP and SP are computed;
  3. the base ranks' SP cost is subtracted (floor 0);
  4. +2 SP thank-you gift;
  5. coins are capped at 10 × I;
  6. the 그동안의 이야기 card;
  7. `mig.cu = 0`.

  It is idempotent: the flag is cleared only after the slices are written.
- **Nickname default**: `nm: ''` displays as 촌장님. The name sheet opens after the 새로워진 것 card and can be skipped (`seen.name`).
- **Renumbering**: v5's planned "7 → 8" (missions report §12.6 P2) becomes **8 → 9**. 금방 (v4.3) adds its slice with no bump, as planned.
- **Future-version guard** for cloud saves: a client never writes a cloud save whose `save_version` is above its own `SAVE_VERSION` into `SAVE_KEY`. It shows `앱을 새 버전으로 바꿔 주세요` (§8.6).

**localStorage keys** (all writes wrapped in try/catch, as today):

| Key | Holds | Synced |
|---|---|---|
| `frostVillage.save.v1` | the village (normal mode) | yes (slot 0) |
| `frostVillage.save.v1.chat` | chat record (`cid`) | phase 2 only (§8.6) |
| `frostVillage.save.backup`, `.backup.2`, `.v1.bad` | existing safety copies | no |
| `frostVillage.save.admin` (+ `.chat`) | the admin village | never |
| `frostVillage.save.normal` | copy of the normal save taken when admin mode starts | no |
| `frostVillage.mode` | `{ admin: 1, since }` | no |
| `frostVillage.settings.v1` | settings (+ `xpFloat`, `shortageToast`, `missionToasts`, `cloudAuto`) | language and sound only, as `summary.settings` of the cloud row (§8.6) |
| `frostVillage.auth.v1` | `{ at, rt, exp, uid }` session (no email, no name) | no |
| `frostVillage.auth.pkce` | `{ verifier, t }` (10 min) | no |
| `frostVillage.cloud.v1` | `{ uid, baseRev, baseHash, dirty, lastPush, lastPull, paused, backoff }` | no |

### 2.7 Balance blocks and `balanceCheck`

| Block | Contents (numbers in the design doc) | `balanceCheck.js` rules |
|---|---|---|
| `BALANCE.chief` | `level {base,k,p,max}`, `spPerLevel`, `spEvery5`, `pilotXp`, `pilotNapAfter`, `xp` (per source, §3.4), `skills.{key}.{values, sp, fee, lv, per…}`, `skills.version`, `feeOn`, `respec`, `caps` | a `CHIEF_SPEC` table `[min, max, default, whole?]` through `fixSpec` (the v4.2 pattern); per skill: `sp`, `fee`, `lv` lengths = ranks, `lv` ascending, `bag.values` strictly increasing 6..40, `speed.values` 1.0..1.8; per-rank effects ≤ the design's caps (build discount per rank ≤ 0.10 and total ≤ 0.30, hire ≤ 0.25, happyCap add ≤ 10); warn when total SP needed > SP available at `max` |
| `BALANCE.v5.missions` (+) | `chain.ch[[F,m]…]`, `chain.catchupXp`, `chain.catchupCoinsMin`, `calendarGate`, `tiers`, `monthly {stamps, milestones, pay, xp}`, `streak.missHalves`, `eraMult` | `eraMult` ascending ≥ 0.1; tier arrays length 4; monthly milestones ascending ≤ 31; pays ≥ 0 |
| `BALANCE.rewards` | `attend {strip[7], xp[7], board}`, `gifts {at[3], pay[3], xp[3], pilotHalf}`, `offline {rate, capH, minAwayMin, afterComplete}`, `mail {max}` | `gifts.at` ascending; `offline.rate` 0..0.10; `capH` 1..8; `mail.max` 5..40 |
| `BALANCE.insight` (v4.6) | needs, weights, floors, effects | weights sum 100; floors 0..80 |

The `isOptional` regex grows: `chief|rewards|insight`, so old balance files fill in silently. **BALANCE is never written by skills.** `balanceCheck` keeps checking the raw values only.

### 2.8 Budgets

| Budget | Target | How checked |
|---|---|---|
| CPU | feed dispatch + chief + chain ≤ 0.02 ms / tick avg (missions model is 0.0006) | Node bench, `__FV.later.perf()` |
| HUD objects | new HUD ≤ 40 display objects; panels built once per tab, live fields updated in place (missions_bank M-6 rule) | soak, `review_robust_drawcalls` |
| Files | ≤ +4 artifact files across v4.4–v4.6 (`ui7` page ≤ 2, `ui7b` optional); gate 480 | `build_artifact.mjs` |
| Texture | `ui7` ≤ 4 MiB RGBA | `texbudget.mjs` |
| Save | ≤ 16 KB worst case; cloud row ≤ 64 KB | save suite, server check constraint |

---

## 3. One event bus: the GameFeed

### 3.1 Rules

- `gs.feed = new GameFeed(gs)`. It subscribes **once** to the legacy positional `gs.events` names (§3.2) and turns each into one object `{ t, …fields, T }`.
  - `T` is the game time (`DayClock.T`).
  - New hook points call `gs.feed.emit({ t, … })` directly. They do not add new positional Phaser events.
- **Consumers subscribe only to the feed**, never to `gs.events`. Fixed order (registration priority):
  1. chief (XP);
  2. missions (chain, calendar, v5 board);
  3. rewards;
  4. album;
  5. insight;
  6. v5 modules (story → bank → vehicles …).
- **Queue, not recursion**:
  - an emit during dispatch is appended to a FIFO;
  - the outer dispatch drains it, at most 200 events per drain (a loop guard; console.error once);
  - so `quest:done` → `xp` → `level:up` → `quest`(skill objective) is deterministic.
- **Fault isolation**: each consumer runs in `try/catch`. Errors are counted (3 logs per name, like `V42.fail`), and the others go on.
- **Test hooks**: `__FV.feed.log(n)` (ring buffer of 400), `__FV.feed.emit(obj)`. `SIGNAL_EVENTS` (missions `signals.js`) and a new `XP_EVENTS` list feed a kit test: "every listened-to `t` is emitted somewhere in `src/`".

### 3.2 Existing emits (normalize only; payload patches are the missions report's P/E numbers)

| Feed `t` | Today's emit (file · function) | Payload after the patch |
|---|---|---|
| `sold`, `storeSold` | `Seller.js` `complete(c)` (`:374`) | `{ value, item, n, chief }`: **P8** + `chief: !!this.register.chief` ✚ |
| `traded` | `Seller.js` trade loop (`:694`) | `{ value, item, n: 1, chief }` (E2 + chief) |
| `crafted` | `Workshop.js:181` | `{ kind, item, n: 1, chief }` (chief when no operator) |
| `restMeal` | `BigRestaurant.js:581` | `{ price, combo, chief }` (chief at its register / kitchen pad) |
| `built` | `Site.js` `finish()` (`:381`) | `{ key, siteId, x, y }` |
| `step` | `Progression.completeStep()` (`:341`) | `{ id }` |
| `flag` | `Progression.setFlag()` (`:259`) | `{ id }` |
| `region` | `Territory.reveal()` (`:294/316/348`) | `{ id, instant }` |
| `settlers` | `Civic.js:226` | `{ n }` (+ `house`, P27 in v5) |
| `shopOpen`, `shopBuilt` | `Shop.js:291/268` | `{ shop, lot }` |
| `houseDone`, `cardDone` | `Growth.js:479/348` | as today |
| `visitorDone` | `Visitor.js:253` | as today |
| `rank` | `Rank.ceremony()` → `'v4:rankUp'` (`:121`), `'v4:rank'` | `{ level, ceremony }` |
| `train` | `Neighbours.js:377` `'v4:train'` | `{ ev, stop, line }` (+ E4 riders, P14 chief ride) |
| `hour` | `TownSim.js:816` `'v4:hour'` | `{ h, name }` |
| `dogLove` | `DogPlay.js:188` | `{ love }` |
| `boatHome` | `Boathouse.js:203` | E3: `{ catch }` |
| `fedMiners`, `minersHungry`, `waitingHouse` | `FoodBox.js:90`, `Worker.js:286`, `VillageLife.js:247` | as today |
| `letter`, `courier` | `Office.js:289/345` | `{}` / `{ n }` |
| `gb:*` | 금방 adapter `gs.events.emit('gb', e)` (`ports_v4.js:498`) | `e` as is (`gb:open`, `gb:delivered`, `gb:upgrade`, `gb:firstDone`, `gb:letter` …) |

### 3.3 New emits (✚ = one line each)

| Feed `t` | Payload | Where (file · function) | Consumers |
|---|---|---|---|
| `chiefGather` | `{ item, n, node }` | `Player.js` `impact()`, after `const item = n.hit(this)` (count = `n.lastYield`) | XP, chain q101/q202/q302, F13/F14, G7, album |
| `produced` | `{ station, item, n, chief }` | `Station.js` after `this.outStack.push(this.output, s)` (`:145`) = **P9**; `chief = this.op && this.op.chief && !this.op.operator` | XP (`chief`), chain `made`, dailies, album |
| `chiefDrop` | `{ item, to }` | `Game.js` `moveItem(from, to, …)` when `from === this.player.stack` and the move succeeded; `to` = the target kind (station / shelf / site / order / shop / food / warehouse) | XP (1 per 3 items via an accumulator) |
| `collect` | `{ pad, n }` | `Seller.js` `CashPad` collect branch (`:63–69`) = E8 (+ `tag` for every till) | XP (≥ 50 coins), F12 tax |
| `tap` | `{ pid, x, y }` | `VillageLife.react(r)` (`:780`), `Neighbours.tap()` (`:748`) = P11 | XP (≤ 10 a day), chain q210, insight 촌장 need |
| `chat` | `{ pid }` | `ResidentChat.js:227` `onChange` = E7 | XP, F5, insight |
| `dogAct` | `{ kind }` | `DogPlay.start(kind)` (`:150`) = E6 | XP, q307, F4 |
| `day` | `{ day }` | `DayClock.js:76` after `this.T += dt` = P10 | calendar (game clock option), rewards |
| `wholesale`, `shopSold` | `{ n, item }` | `Growth.payWholesale()` (`:322`) E5, `Shop.takeOut()` (`:335`) E1 | missions |
| `letterReply` | `{ tpl, choice }` | `VillageNews.answer(id, bi)` (`:163`) | XP, q605, F24 |
| `officeHire` | `{ role }` | `Office.hire(role, pad)` (`:140`) | XP, q602/q604/q606 |
| `lineUp` | `{ line, kind }` | `LineUpgrades.done(o, pad)` (`:166`) | XP (성장 30) |
| `exported` | `{ n, coins }` | `Freight.payExports()` (`:179`) | q609 |
| `cheer` | `{ n }` | `ChiefAura` cheer fired | F21 |
| `pilot` | `{ on, reason }` | `ChiefPilot.start()` / `stop()` (`:76/:93`) | XP multiplier, rewards (gift time half), s01 |
| `ui` | `{ panel, tab }` | `OfficePanel.show(tab)`, the new shell panels (§5), `HudV4.openRank/openOrders` | q603 (`ui officeStock`), album |
| `paperRead` | `{ day }` | `OfficePanel` news tab first open of a paper | XP once a day |
| `skill:learn`, `level:up`, `xp` | `{ skill, r }` / `{ lv, sp }` / `{ n, why }` | chief host | chain (`skill` objectives), album, UI |
| `quest:done`, `quest:claim`, `quest:chapter` | `{ id, ch }` | missions host (chain) | chief (XP / SP), rewards (mail, coupons), monthly stamps |
| `daily:*`, `weekly:*`, `monthly:*`, `streak:*` | as missions report §4.2 (+ monthly) | missions host | chief (XP), rewards |
| `attend`, `gift`, `offline`, `mail` | `{ day, loop }` … | rewards host | chief (XP), monthly stamps |
| `admin` | `{ op }` | admin host | all (consumers may ignore admin-sourced events) |

**XP is data**: `src/chief/data/xp.js` maps feed `t` (+ field filters) to XP and daily limits, from `BALANCE.chief.xp`. The chief host never needs a code change for a new XP source, only a table line. 관망: XP × `pilotXp` while `gs.v42.pilot.on`, and 0 after `pilotNapAfter` s without a touch.

### 3.4 One counting vocabulary

The chain reuses `src/missions/model/signals.js` (feed → signals `sold:item`, `made:item`, `cust`, `traded:item` …) and `units.js` (objective units). Two additions:
- **chief-only signals**: `chiefGather:<item>`, `served` (`sold` with `chief`);
- **state objectives**: `step`, `built`, `region`, `flag`, `count` (shops / people / rank), `skill`, `ui`. They are checked against `facts` when the quest becomes active and again every 1 s. The design (§5.1) wants them to complete on arrival after 1.5 s.

Dailies, weeklies, the chain and album counters therefore count the same event the same way.

---

## 4. HUD (measured) and where the new entry points go

All coordinates are **logical** (the layout is always 720 wide). Height = 720 × innerHeight / innerWidth, clamped to 1280..1600:
- **390×844 → 720×1558** (1 css px = 1.846 logical);
- **360×640 → 720×1280** (1 css px = 2 logical).

`top = 62 + safeTop`, `zb = H − 168 − safeBottom`.

### 4.1 Today (v4.2)

| Element | Anchor (x, y) | Size | 390×844 (y css) | 360×640 (y css) |
|---|---|---|---|---|
| coin pill | x 26–256, y top | 230×74 | 34 | 31 |
| settings | (658, top) | ⌀84 | 34 | 31 |
| hint / objective bar | (360, top+88) | ≤ 400×62 | 81 | 75 |
| clock (v4) | (658, top+92) | ⌀≈60 | 83 | 77 |
| popBox / rank chip ("마을") | x 28–178 / 188–344, y top+152 | 150×50 / 156×54 | 116 | 107 |
| order chip (정기 납품) | x 28–288, y top+212 | 260×56 | 148 | 137 |
| 업무 chip (v4.2) | x 28–160, y top+348 | 132×50 | 222 | 205 |
| 관망 caption | (360, top+300) | ≤ 690×76 | 196 | 181 |
| banner | (360, 0.27 H) | 460×104 | 228 | 173 |
| toast | (360, H−230) | 300×64 | 719 | 525 |
| nav chip | (360, H−92) | ≤ 680×54 | 794 | 594 |
| 관망 button | (663, zb−264) | ⌀64 | 610 | 424 |
| zoom +, −, map | (664, zb−160 / −84 / 0) | ⌀70 | 666 / 707 / 753 | 476 / 514 / 556 |
| 줍기 | (546, zb−87) | ⌀76 | 706 | 512 |
| whistle | (62, zb) | ⌀80 | 753 | 556 |
| edge badges (nav / train) | clamped x ∈ [M, W−M], y ∈ [220 or 480 on the left, H−240] | ⌀≈70 | — | — |
| (v5 planned) mission chip / fame chip | (28, top+212 or +290) / right-aligned (696, top+162) | — | — | — |

**Free space**:
- **row 1 between the coin pill and settings** (x 262–610);
- the right column y 190 … the 관망 button (transient edge badges only).

The **bottom third is the joystick's home**: any HUD element there steals drags, because the pointer handler returns early on `over.length`. So no new element goes in the bottom third.

### 4.2 Proposed (v4.4–v4.6)

```
 x:  26   98 104            334   458 522 536 600 616      700
 row1 ┌Lv┐ ┌🪙  8,298      ┐        [✉3]    [🎁]   (⚙)          y = top (31–34 css)
      └──┘ └───────────────┘   [관리자]  (admin only, between pill and mail; the gift box hides in admin)
 row2                 ┌──────── hint bar ────────┐   (◷)      y = top+88   (unchanged)
 stack ┌📜 바다의 선물 · 물고기 3/5 ▮▮▯ │오늘 2/3┐                y = top+160  (quest chip, 300×64; the 오늘 mini-pill from v4.5)
       ┌👥 23/30┐ ┌▲ 마을 ▬▬▬┐                                  y = top+229  (pop + rank row, unchanged look; today top+152)
       ┌📋 23/30 정기 납품    ┐                                   y = top+294  (order chip; today top+212)
       ┌🏢 업무 ●┐                                               y = top+357  (work chip; today top+348; folds at 360×640)
       (v5: mission chip joins the stack)
                       … village …                 (관망)(＋)(－)(🗺)   right column unchanged
   (🐶)                 [nav chip]                 (줍기)
```

| New element | Where | Size (logical) | Shown when | Tap |
|---|---|---|---|---|
| **Lv ring** | (62, top), the coin pill shifts +78 (x 104–334) | ⌀72 drawn ring (Graphics) with level number 30 px, XP arc 6 px, SP red dot ⌀18 at 1 o'clock; hit area ⌀88 | always (Lv 1 from the start) | 스킬창 (§5.2) |
| **우편함** | (490, top) | ⌀64, count badge | ≥ 1 item | 우편함 (§5.7) |
| **선물 상자** (접속 보상) | (568, top) | ⌀64 + ring timer | v4.5, after the calendar gate, until the day's 3 gifts are claimed | open the ready box (§5.6) |
| **관리자 ribbon** | (398, top) | 110×40 | admin mode | 관리자 panel |
| **퀘스트 chip** | stack slot 1 | 300×64 (+ 96×48 "오늘 n/3" mini-pill at its right end, v4.5) | an active chain quest | 수첩 → 이야기 (mini-pill → 오늘) |
| **자원 지도 toggle** | (360, top+88), replaces the hint bar while the overview is on | 2-segment 360×56 | overview mode (the map button) | overlay on / off (§5.9) |
| **수련대 pad** | plaza bench (`WORLD.bench`) | world pad | after `hire_lumberjack` (as the old pads) | stand 0.4 s → 스킬창 |

**Stack manager** (`src/scenes/hud/Stack.js`, new). This is the one place that decides the left column. It replaces the fixed y values in `HudV4.layout()` (`:80–81`), `HudV42.layout()` (`:170`) and the planned missions P12 position.
- Entries register `{ id, order, h, visible() }`.
- Visible entries stack from `top+128` (just below the hint bar's bottom edge, `top+119`) with a 10 px gap.
- **Max visible rows**: 4 when H ≥ 1400 (390×844), 3 when H < 1400 (360×640). The rest fold into a `＋2` pill that expands for 6 s on tap.
- Order: quest (1) → pop/rank (2) → order (3) → work (4) → v5 mission (5).
- The left nav edge badge already clamps to y ≥ 480. The stack's 4th row ends at y ≈ 444 (`top+382`), so they never meet.
- The 관망 caption (today fixed at `top+300`, where it already touches the work chip) is placed at `stack.bottom() + 48` instead.

**Touch targets.** The existing HUD uses 64–84 logical (35–46 css px at 390). New controls are drawn at the same sizes, with hit areas padded to ≥ 88 logical (≥ 47 css at 390, ≥ 44 at 360).

**Flags.** Every new panel sets `ui.v42PanelOpen = true` (or a new `ui.v44PanelOpen`, added to the four checks: `UI.js:130`, `showChatButton`, `Navigator.wanted`, `UIProxy`), so the joystick, the chat pill, 관망 and the navigator wait as they do for the office panel.

---

## 5. Screens (phone first; logical 720 wide; ko strings, en in `strings.js`)

**Common shell** — `src/scenes/panels/Shell.js` (new), generalized from `OfficePanel`:
- non-pausing; `pw = min(W−24, 700)`, `ph = min(H − 220 − insets, 1100)` (1060 at 360×640, 1100 at 390×844);
- dim 35 % (a tap on it closes); title row 92; tab row at `top+112` on `ui_office_tab(_on)` plates (ui5 panels page, cream stand-ins while it loads);
- body scrolls by drag (masked container); a close ⌀60;
- a tab builds once per open and updates its live fields in place.

**Sheets**: modal, centered, pause the game (like settings). They are the name sheet, the 출석 sheet, the conflict sheet and the confirm sheets.

### 5.1 Name sheet (first start, and old saves after 새로워진 것) — DOM, IME-safe

```
┌────────────────────────────────────────┐  sheet 640×520, top at 14 % of the visual viewport
│      (portrait_player)                  │  (kept in the upper half: the keyboard never covers it)
│   촌장님의 이름을 지어 주세요            │
│  ┌──────────────────────────┐  3/8      │  <input> 520×88, 32 px font, counter right
│  │ 눈송이▌                  │           │
│  └──────────────────────────┘           │
│  [추천 이름]   눈송이 · 솔방울 · 고드름… │  suggest chips rotate (design §3.1)
│  마을 이름: [서리마을      ] (선택)      │  optional second field, collapsed by default
│        [나중에]        [이걸로 할게요]   │  buttons 240×84; 나중에 → "촌장님"
└────────────────────────────────────────┘
```

- **Why DOM**: Phaser has no text input, and phones only show a keyboard for a real focused field. `src/chief/view/NameSheet.js` follows `ChatPanel`'s pattern:
  - its own `<style>` injected once (class prefix `nm-`);
  - `inert` on the game container while open;
  - `visualViewport` resize/scroll → the sheet moves to stay above the keyboard (`--nm-kb`).
- **Phaser keyboard off while open**: `game.input.keyboard.enabled = false` (the `ResidentChat.pauseGame` pattern). Otherwise the captured W A S D, arrows and space are swallowed on desktop and on Bluetooth keyboards. The Game scene is paused (the sheet is modal).
- **Korean IME rules**:
  1. Field attributes: `<input type="text" lang="ko" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" inputmode="text">`, **no tight `maxlength`** (a guard of 24 only). Android Gboard / Samsung keyboards can cut or duplicate a composing syllable at the limit.
  2. Track `compositionstart` / `compositionend`. While composing: never rewrite `value`, only update the counter with the composing text.
  3. Count with `Array.from(value.normalize('NFC')).length` (one Hangul syllable = 1). After `compositionend` (and on `input` when not composing) trim to 8 and put the caret at the end.
  4. Valid at submit: `/^[가-힣A-Za-z0-9·]([가-힣A-Za-z0-9· ]*[가-힣A-Za-z0-9·])?$/`.
     - A lone jamo (ㄱ, ㅏ) gives `글자를 끝까지 적어 주세요`.
     - The blocklist (`src/data/nameBlock.js`) gives `다른 이름을 써 주세요`.
  5. Submit on the form's `submit` (it fires after the IME commits) and on the button. On `keydown` Enter: ignore when `e.isComposing || e.keyCode === 229`.
  6. **No autofocus when the sheet opens by itself** (a new game, or after 새로워진 것). iOS and Android WebViews do not open the keyboard without a user gesture, and an autofocused field without a keyboard confuses. The field shows a pulsing caret plate `여기를 눌러 이름을 적어요`. Opened from a tap (✎ in the skill window), it focuses synchronously in that tap handler.
- **APK specifics**: `adjustResize` shrinks the window. `main.js` `onResize` → `View.H` clamps at 1280 → the canvas letterboxes for a moment. That is harmless; the DOM sheet follows `visualViewport`. The Game scene is paused, so nothing relayouts under the sheet in a way that matters.
- **Artifact specifics**: inside the claude.ai frame the iframe may not shrink. The sheet sits high (14 %) and also listens to `window.innerHeight`. It is tested in the Playwright IME run (§9.2).
- **Where the name shows**: the skill window header, the Lv ring long-press tooltip, letters (`{nm} 촌장님께`), resident greetings (`{nm} 촌장님!`, josa by `src/story/engine/lang/josa.js`), the chat prompt's chief name (only the viewer's own Claude sees it), and the cloud conflict cards.

### 5.2 스킬창 (skill window) — shell panel, 4 tabs

```
┌──────────────────────────────────────────┐
│ (Lv 12)  눈송이 읍장 ✎        ✦ 3         │  header: ring ⌀96, name 30 px, ✎ = rename (NameSheet)
│ ▓▓▓▓▓▓▓▓▓▓▓░░░░  다음 레벨까지 230        │  XP bar 9-slice 560×24 (ui7_xpbar or Graphics)
│ [✋일솜씨] [🔨건축] [👥사람] [🔭지혜]      │  ui_office_tab plates, 4 × 160
│ ┌──────────────────────────────────────┐ │
│ │(node) 큰 가방  ●●●○○○ 장비  18 → 22개 │ │  card 640×150: node ⌀96 (state art), pips, effect line
│ │                [배우기 · ✦2 · 300코인]│ │  button 260×72 (green / gray when locked)
│ ├──────────────────────────────────────┤ │
│ │(node) 손재주   ○○○  Lv 3에 열려요     │ │  locked: node gray + the reason line
│ └──────────────────────────────────────┘ │  3.5 cards visible at 390×844, 3 at 360×640; drag to scroll
│        [재능 다시 배우기 (처음 1번 무료)]   │
└──────────────────────────────────────────┘
```

- **Node states** (each a node frame in `ui7`):
  - `locked` (system missing: gray + reason);
  - `gated` (needs Lv n);
  - `learnable` (pulse);
  - `learned`;
  - `maxed` (gold rim);
  - `gear` (장비 ring for bag / boots).
- **Learn flow**:
  1. confirm sheet `큰 가방 4단계를 배울까요? (스킬 포인트 2 · 300코인)`;
  2. `chief.learn('bag')`: SP and fee (the fee through `ports.coins.spend`, refused politely when short);
  3. feed `skill:learn`;
  4. `fx_levelup` on the chief and a banner;
  5. `Progression.reprice()` when a price skill changed.
- **Entry points**: the Lv ring; the 수련대 pad; quest q109 / q206 (the arrow points to the 수련대); the level-up banner's `스킬 보기` button.

### 5.3 퀘스트 chip + 촌장 수첩 (이야기 tab)

- **Chip**: `ui_chip` plate (ui5; the `ui_panel` stand-in before the v42_core page arrives).
  - Content: `ui_icon_goal` (ui3, late: `ui_icon_mission` / item icon stand-in), then `바다의 선물 · 물고기 3/5`, then a 4 px bar.
  - It pulses on progress.
  - Done: the chip flips to `✓ 받기` (green). A tap claims. After 20 s it auto-claims into the 우편함 (design §5.1).
  - Long-press (0.5 s), or the 길 안내 button in the panel: `nav.guideTo(target, { label, icon, ttl: 15 })` (§5.9).
- **수첩 panel**: shell, tabs **이야기 · 오늘 · 이번 주 · 이달 · 출석** (the last four arrive in v4.5; v5 adds 게시판 · 칭호).
  - The tab providers live in their modules: chain and calendar tabs in `src/missions/view/`, 출석 in `src/rewards/view/`.
  - The missions report's `MissionPanel` tab builders become providers with the interface `{ id, label, icon, badge(), locked(), build(body, box), update(dt), destroy() }`.

```
이야기 tab
┌ 2장 · 숲과 밭 ─────────────────────────────┐  chapter ribbon (ui7_ribbon 9-slice; stand-in ui_button_blue)
│ ┌[ui_mission_card]──────────────────────┐ │  current quest card 640×220
│ │ (item_log)  나무꾼 촌장                │ │
│ │ "통나무 10개만 베어 주시겠어요?" — 산들 │ │  the line, spoken by a resident (portrait 64)
│ │ ▓▓▓▓▓▓░░░░ 6/10      보상 🪙20 · ✦40XP │ │  ui_progress_bg/fill (ui3)
│ │              [길 안내]                 │ │
│ └───────────────────────────────────────┘ │
│ ▸ 끝낸 이야기 (4)                          │  folded list (ui_mission_card_done rows 640×72)
│ ▸ 곁가지 이야기                            │  side quests (design §5.3)
│ ▸ 지난 이야기 다시 보기                     │
└───────────────────────────────────────────┘
```

**Tutorial merge** (patches in `Tutorial.evaluate`):
- the "다음 목표" text (`obj_next`, `goalText()`, `v42Goal`) is suppressed while `missions.chainCovers()`; arrows unchanged;
- a new idle fallback after the existing ones: `missions.chainFocus()` (the P30 pattern);
- `upgradeHint` → `skillHint`: once, arrow to the 수련대 + Lv ring pulse.

### 5.4 임무 tabs (오늘 · 이번 주 · 이달) — v4.5

```
오늘 tab: three cards 640×170 (ui_mission_card): icon · title · bar · reward · [다른 미션] (after 2 min no progress)
          footer: 연속 7일 ❄ (streak, halves on a miss) · 내일 새벽 5시에 바뀌어요 (countdown)
이번 주 tab: one card with three stage pips; the week's decor preview (life2 art); "월요일 새벽 5시에 바뀌어요"
이달 tab: 4×5 snowflake stamp grid (cells 112, ui7_cal_cell states), milestones 5/10/15/20 on the right with rewards;
          the month's decor preview; "스탬프는 오늘의 미션 3개 · 주간 단계 · 출석 7일째 · 이야기 장 끝에서 받아요"
```

The "오늘 n/3" mini-pill on the quest chip opens this tab. The missions model's calendar (day key 05:00, forward-only) is unchanged except the design's additions (§6.1 there): the early gate, tiers, `mo`, and the streak that halves.

### 5.5 출석 sheet + tab — v4.5

```
┌──────────── 출석 체크 · 10월 18일 ────────────┐   sheet 660×760, pausing, never forced
│ [1][2][3][4][5][6][7★]   7일 꾸러미            │   7 day plates 80×104 (ui7_day_plate states: past / today / next)
│        ↑ 오늘: 코인 1,800 + 40XP               │
│ ─ 28칸 도장판 ─ (ui_mission_board frame, ui3) │
│ ❄❄❄❄❄❄❄ / ❄❄❄❄○○○ / ○○○○○○○ / ○○○○○○○       │   4×7 cells 64 (stamped / empty / reward cell)
│  7 이글루 쿠폰 · 14 코인 · 21 랜턴 · 28 ✦1      │
│            [받기]        (닫기 = 우편함에 둘게요) │
└───────────────────────────────────────────────┘
```

- **When**: the first load of a new day key, after Ch1 (D6), after the name sheet and 새로워진 것, never during a ceremony, the tutorial or the admin mode.
- **Close without 받기**: the check-in goes to the 우편함 (nothing lost).
- **Tab copy** in the 수첩 (read-only + 받기 when pending).

### 5.6 접속 보상 상자 (HUD) — v4.5

- **Look**: ⌀64 at row 1 with a ring timer (`ui_ring_bg` / `ui_ring_fill`, base ui atlas).
  - Inside, the chest art: `ui7_chest_closed` / `_open`; stand-in `ui_icon_coin` on a circle.
  - Ready = a 3-frame wiggle (`ui7_chest_shake`) every 4 s.
- **Tap when ready**: a burst (`fx_*` existing) plus a coin fly to the pill and an XP float. The ring restarts for the next box.
- **Active time** = a touch in the last 60 s or a panel open; 관망 counts half (`Input.lastActivity`, `pilot.on`). It is kept in `rewards.gift.s` and saved every autosave.
- **Day change**: unclaimed boxes go to the 우편함.

### 5.7 우편함 (mailbox) — v4.4

```
┌ 우편함 ─────────────────────── [모두 받기] ┐   shell panel, one tab
│ (ui_letter) 퀘스트 '바다의 선물' 보상  🪙5 ✦20  [받기] │   rows 640×96 on ui_letter (ui5 panels page) or ui_card
│ (ui_letter) 꾸미기 쿠폰 · 눈사람 동상     🎫    [쓰기] │   coupon rows: 쓰기 → opens the build menu on the decor tab
│ (ui_letter) 출석 3일째                   🪙1,800 [받기] │
└──────────────────────────── 최대 20개 · 쿠폰은 사라지지 않아요 ┘
```

- **Rows**: id, kind (`coins` / `xp` / `sp` / `coupon` / `treats` / `halo`), payload, why, day.
- **When full**: the oldest coins-only row auto-claims. Coupons never expire.
- **Coupons**: the build menu shows `쿠폰 1장` on the decor card. On build, the coin price is waived (`Game.chooseBuild` → `rewards.useCoupon(bkey)`); materials are still needed.

### 5.8 행복도 — v4.6: 마을 panel (tabs 등급 · 행복 · 자원 · 통계) + resident card

- The rank chip ("마을") opens the new **마을 panel**. 등급 is today's rank panel content (moved from `HudV4.openRank`). The popBox opens the 행복 tab.

```
행복 tab
┌ 주민 행복 82  (face 4/5) ▬▬▬▬▬▬▬▬░░   손님 만족 76 ┐  village number + the old visitor metric
│ 가장 바라는 것: 🍞 먹거리 (7명) · 🏠 집 (3명)       │  top 2 needs with [길 안내]
│ ┌ 순자 할머니  (face) 91  🍞🏠⚒🛒🌸🎵👑 ┐             │  resident rows 640×88: portrait 64, score, 7 need dots
│ ┌ 산들        (face) 58  🍞 낮음 · 👑 낮음 ┐           │  sorted low first; tap → resident card
└──────────────────────────────────────────────┘
```

**Resident card**: the existing tap card (persona + 수다 떨기 pill) gains a strip:
- the face (5 steps, `ui7_face_0..4`), the score, the two lowest needs as icon chips;
- one line: `빵이 먹고 싶어요…` (design §8.4).

Need icons reuse: `ui_icon_food` (ui2), `ui_icon_house` (ui2), `ui_icon_worker` (ui), `ui_icon_people` (ui2), `ui_icon_flower` (ui3), `emote_music` (emotes), `ui_icon_halo` (ui5).

### 5.9 지역 자원 — v4.6: 마을 panel 자원 tab + overview overlay + 부족 list + 길 안내

```
자원 tab
┌ [전체] [광장] [숲] [밭] [광산] [사냥터] [동쪽] [남쪽] … ┐   chips row (scroll), only open regions
│ 지금 부족한 것 TOP 3                                    │
│ 🔴 빵이 부족해요 ← 빵 짐꾼이 없어요         [해결하러 가기] │
│ 🟠 제련소 출구가 꽉 찼어요 ← 주괴 짐꾼 필요   [해결하러 가기] │
│ 🔴 집이 부족해요: 이사 기다리는 주민 3명      [해결하러 가기] │
│ ─ 밀밭 ─ (ui_chalk_panel, the office 재고 renderer)    │
│  밀 더미 12/40 ↗ · 오븐 입구 3/30 · 빵 진열 0 🔴  47/분 < 66/분 │
└─────────────────────────────────────────────────────────┘
```

- **One renderer** for the office 재고 tab and this tab: `src/insight/view/LedgerRows.js`.
- **Detail level** by 관찰력 (design §9.4): dots + counts → flows + why → forecasts + fix buttons → toasts.
- **Overview overlay**: while the map button's overview is on, the hint bar is replaced by `[마을 보기 | 자원 지도]`.
  - 자원 지도 places ≤ 12 world-space pins (`ui7_pin`, tinted by the worst status, red-count badge) at `Territory` region centres and zone centres.
  - Pins are scaled by 1/zoom (constant ≈ 64 logical px on screen) and drawn at `DEPTH.LABEL`.
  - A tap on a pin opens the 자원 tab on that region.
- **길 안내 to a place** (new `Navigator.guideTo({ x, y, label, icon, ttl, src })`):
  - a **pinned destination** that makes `wanted()` true with an empty bag (same exclusions: tutorial, 관망, panel, ceremony);
  - it clears on arrival (≤ 140 px), after `ttl` s (default 90), or when tapped again;
  - when the chief also carries something, the pin wins for the pinned target. The chip shows `+가방` and a tap cycles, as `next()` does today.
  - Quests (§5.3) and the happiness tab use the same call.

### 5.10 관리자 panel — v4.4 (§7 for the code)

```
┌ 관리자 모드 · 연습용 마을 ────────────────── ✕ ┐   shell panel, red-gold ribbon art (ui7_admin_ribbon)
│ 돈 무제한            [켬]                      │   rows 640×88, buttons 200×72
│ 코인 +10만           [넣기]                    │
│ 모든 땅 열기          [열기]                    │
│ 모든 건물 열기        [켬]                      │
│ 짓기 바로 완공        [켬]   지금 짓는 것 모두 [완공] │
│ 고용 전부            [하기]                     │
│ 주민 행복 가득        [켬]                      │
│ 레벨 +1 / +5 · 스킬 포인트 +10 · 스킬 무료 초기화 │
│ 시간 ×1 ×2 ×4 · 다음 날 아침 · 실제 하루 넘기기   │
│ 퀘스트: 다음 · 모두 완료 · 처음부터 · 미션 다시 뽑기 │
│ 이야기 미리보기 (v5) ▸                           │
│ ─────────────────────────────────────────────  │
│ [원래 마을로 돌아가기]   [이 마을로 계속하기…]      │
└────────────────────────────────────────────────┘
```

### 5.11 계정 · 클라우드 저장 — settings tab 3 + conflict sheet + title link

The settings panel gets a third tab: `[소리·화면] [놀이] [계정]`, three plates of 168 at `cx−176 / cx / cx+176` (today: two of 236 at `cx±122`).

```
계정 tab (guest)                                  계정 tab (signed in)
┌──────────────────────────────────────┐        ┌──────────────────────────────────────┐
│ ☁ 마을을 안전하게 보관해요            │        │ ☁ 클라우드 저장 · 2분 전 (이 기기)     │
│ 로그인하면 다른 기기에서도 이어 해요   │        │ 눈송이 읍장 · Lv 17 · 코인 18,000      │
│ [ G  Google 계정으로 로그인 ]          │        │ [지금 저장하기]  [클라우드에서 불러오기] │
│ 로그인하지 않아도 모든 기능을 쓸 수 있어요 │      │ 자동 저장 [켬]                          │
│ ─ 저장 코드 ─                          │        │ ─ 저장 코드 ─ [내보내기] [가져오기]      │
│ [내보내기]  [가져오기]                  │        │ [로그아웃]   [계정과 클라우드 저장 지우기]  │
│ 개인정보: 별명과 마을 저장만 보관해요 ▸  │        │ 개인정보 ▸                              │
└──────────────────────────────────────┘        └──────────────────────────────────────┘
```

- **Artifact build**: the Google button is replaced by `이 화면에서는 로그인할 수 없어요. 앱이나 웹 주소에서 로그인해요`, and 저장 코드 stays. With the artifact `db` option (§8.2c): `[이 아티팩트에 보관하기]` for viewers who can write.
- **Google button**: Google's official "Sign in with Google" mark and colours, per Google's branding guidelines (official asset, not redrawn). Light theme 560×88.
- **Conflict sheet** (modal, at boot or after login):

```
┌──────────── 어느 마을로 할까요? ────────────┐
│ ┌ 이 기기 ───────────── [더 최근] ┐        │  two stacked cards 620×250
│ │ 눈송이 읍장 · Lv 17 · 🪙 18,000  │        │  nickname/title, Lv, rank badge, coins,
│ │ 이야기 50/67 · 놀이 12시간        │        │  quests done, play time,
│ │ 마지막 저장: 오늘 오후 3:12 (앱)  │        │  last save time (relative + absolute) + device kind
│ │            [이 마을로 하기]       │        │
│ └─────────────────────────────────┘        │
│ ┌ 클라우드 ───────────────────────┐        │
│ │ 눈송이 촌장 · Lv 9 · 🪙 2,400     │        │
│ │ 마지막 저장: 어제 밤 10:40 (웹)   │        │
│ │            [이 마을로 하기]       │        │
│ └─────────────────────────────────┘        │
│ 고르지 않은 마을은 '예전 마을 보관함'에 하나 남겨 둬요 │
│               [나중에 정하기]                │  keeps local, pauses sync (flag `paused`)
└─────────────────────────────────────────────┘
```

- **Title link** (APK and Pages only, when **no local save exists** and login is available): a quiet text button under the start pill: `☁ 다른 기기의 마을 불러오기`. This is the reinstall / new-phone path. Guests never see a nag anywhere else.

**Strings** (new keys; en in `strings.js`):

| Key | ko |
|---|---|
| `acc_tab` | 계정 |
| `acc_pitch` | 마을을 안전하게 보관해요 |
| `acc_pitch2` | 로그인하면 다른 기기에서도 이어 해요 |
| `acc_google` | Google 계정으로 로그인 |
| `acc_guestOk` | 로그인하지 않아도 모든 기능을 쓸 수 있어요 |
| `acc_saved` | 클라우드 저장 · {when} |
| `acc_saveNow` | 지금 저장하기 |
| `acc_load` | 클라우드에서 불러오기 |
| `acc_auto` | 자동 저장 |
| `acc_out` | 로그아웃 |
| `acc_delete` | 계정과 클라우드 저장 지우기 |
| `acc_deleteConfirm` | 클라우드에 있는 마을과 계정이 모두 지워져요. 이 기기의 마을은 그대로 있어요. |
| `acc_noLogin` | 이 화면에서는 로그인할 수 없어요. 앱이나 웹 주소에서 로그인해요 |
| `acc_offline` | 인터넷이 없어서 나중에 저장할게요 |
| `acc_asleep` | 클라우드가 잠들어 있어요. 마을은 이 기기에 잘 저장돼요 |
| `acc_newer` | 앱을 새 버전으로 바꿔 주세요. 클라우드 마을이 더 새 버전이에요 |
| `acc_signedIn` | 로그인했어요! |
| `acc_failed` | 로그인하지 못했어요. 다시 해 볼까요? |
| `cf_title` | 어느 마을로 할까요? |
| `cf_here` | 이 기기 |
| `cf_cloud` | 클라우드 |
| `cf_newer` | 더 최근 |
| `cf_pick` | 이 마을로 하기 |
| `cf_note` | 고르지 않은 마을은 '예전 마을 보관함'에 하나 남겨 둬요 |
| `cf_later` | 나중에 정하기 |
| `code_export` | 내보내기 |
| `code_import` | 가져오기 |
| `code_copied` | 저장 코드를 복사했어요 |
| `code_bad` | 저장 코드가 맞지 않아요 |
| `code_preview` | 이 마을을 불러올까요? 지금 마을은 보관함에 남겨 둬요 |
| `title_cloud` | 다른 기기의 마을 불러오기 |
| `priv_line` | 개인정보: 별명과 마을 저장만 보관해요 |

---

## 6. UI art: what is reused and the new `ui7` page

### 6.1 Reuse (no new art)

| Need | Existing key (fragment) | Note |
|---|---|---|
| panel / button 9-slices | `ui_panel`, `ui_button_{blue,green,gray}` (ui) | boot atlas |
| tab plates, chips, chalkboard, letter paper, status dots | `ui_office_tab(_on)`, `ui_chip`, `ui_chalk_panel`, `ui_letter`, `ui_status_0..3` (ui5) | `v42_core` page (after the first sale) and `ui5_icons@panels` (on demand): stand-ins until they arrive (`reskin`) |
| cards, progress, board, calendar, goal, rank badges | `ui_card(_selected)` (ui2), `ui_mission_card(_done)`, `ui_progress_bg/fill`, `ui_mission_board`, `ui_icon_calendar`, `ui_icon_goal`, `ui_badge_rank_1..5` (ui3) | ui3 is a LATE fragment: never on screen in minute 1 |
| skill icons | `ui_icon_backpack`, `ui_icon_speed` (ui); `ui_icon_tools`, `ui_icon_hammer`, `ui_icon_happy`, `ui_icon_people` (ui2); `ui_icon_request`, `ui_icon_delivery` (ui3); `ui_icon_hand`, `ui_icon_halo`, `ui_icon_cheer`, `ui_icon_binoculars`, `ui_icon_bank` (ui5); `ui_icon_heart_full` (pets2) | B2's piggy is **not** reused (D12) |
| rings / timers | `ui_ring_bg`, `ui_ring_fill` (ui) | the Lv ring and the gift timer can be pure Graphics |
| mail | `ui_icon_letter` (ui5) | — |

`ui6` is the 금방 brand. It is not reused outside 금방 (brand confusion).

### 6.2 New: `ui7` (one packed page, ≤ 1024×1024, built by `tools/gen_ui7.py`, procedural like ui5)

Source px = 2× the logical display size (sharp at `View.k` ≤ 2).

| Key | Source px | Display (logical) | States / frames | Version | Stand-in until it lands |
|---|---|---|---|---|---|
| `ui7_lv_frame` | 176 | ⌀88 ring frame (snowflake rim) | normal · `_gold` (Lv 60) | 4.4 | Graphics circle |
| `ui7_lv_glow` | 208 | ⌀104 additive | SP available | 4.4 | none |
| `ui7_xpbar_bg` / `_fill` / `_shine` | 128×32 9-slice (caps 14) | 560×24 | — | 4.4 | Graphics rounded rect |
| `ui7_node` | 192 | ⌀96 skill node frame | locked · gated · learnable · learned · maxed · gear | 4.4 | Graphics ring + tint |
| `ui7_pip_on` / `_off` | 32 | 16 | — | 4.4 | Graphics dots |
| `ui7_br_hand`, `_build`, `_people`, `_wise` | 96 | 40 (tab icons) | — | 4.4 | ui5 / ui2 icons above |
| `ui7_icon_piggy` | 96 | 48 | — | 4.4 | `ui_icon_coin` |
| `ui7_bench_sign` | 160×96 | world label | — | 4.4 | pad label text |
| `ui7_ribbon` | 256×64 9-slice | chapter ribbon 640×56 | — | 4.4 | `ui_button_blue` |
| `ui7_stamp_done` | 192 | ⌀96 ✓ stamp | — | 4.4 | `ui_icon_check` |
| `ui7_icon_quest` | 96 | 40 (scroll) | — | 4.4 | `ui_icon_goal` / `ui_icon_mission` |
| `ui7_admin_ribbon` | 220×80 | 110×40 | — | 4.4 | red Graphics pill |
| `ui7_cal_cell` | 128 | 64–112 | empty · today · stamped · reward · locked | 4.5 | Graphics + `emote_sparkle` |
| `ui7_day_plate` / `_7` | 160×208 | 80×104 | past · today · next | 4.5 | `ui_card` |
| `ui7_stamp_snow` | 128 | 56 | — | 4.5 | `fx_snowflake` |
| `ui7_chest_closed` / `_open` / `_shake0..2` | 160 | ⌀64 inside the ring | 5 frames | 4.5 | `ui_icon_coin` |
| `ui7_face_0..4` | 96 | 40 | 5 moods | 4.6 | emotes (`emote_tear` … `emote_love`) |
| `ui7_pin` | 128×160 | 64×80 map pin | tinted per status | 4.6 | `ui_status_*` dot |
| `ui7_icon_cloud` | 96 | 40 | synced · syncing (2 frames) · offline · conflict | login | text |
| `ui7_icon_code` | 96 | 40 (저장 코드) | — | 4.4 | `ui_icon_letter` |

**Budget**: about 60 frames, ≤ 1024×1024 → ≤ 4 MiB GPU, +2 files (webp + json; or +1 with the manifest inside `_packed/index.json`, the `v42_core` way). Loaded with the boot UI (it is small and the Lv ring is in minute 1), or as a page prefetched on the title.

**Not ours to draw**: the Google sign-in mark. Use Google's official asset (branding guidelines), one small separate file, shipped only in builds where login exists (APK, Pages).

---

## 7. 관리자 모드 (admin) in code terms

### 7.1 Door, backup, isolation

1. **Door**: settings → the version label (`UI.panelFooter`, today a plain text, made interactive). On tap 3–6 the toast says `관리자 모드까지 {n}번`. On tap 7 the sheet opens:
   > 관리자 모드는 시험해 보는 곳이에요. 지금 마을은 따로 보관하고, 연습용 마을에서 마음껏 놀 수 있어요.

   Buttons `켜기 · 취소`. The v5 preview menu is a row inside this panel (D5).
2. **Enter** (`src/admin/store.js`, pure over a storage interface, unit-tested with a fake `localStorage`):
   1. `gs.save(true)` (the normal save is fresh);
   2. copy `SAVE_KEY` → `frostVillage.save.normal`, and `.chat` → `.normal.chat` (a safety copy);
   3. if `frostVillage.save.admin` is missing: copy the normal save to it, give it a new `cid`, set `adm: {}`;
   4. write `frostVillage.mode = { admin: 1, since }`;
   5. `scene.restart()`.
3. **Active key**: `Save.key()` returns `ADMIN_KEY` while the mode flag is set; every `Save.write` / `load` / `ChatSave` call goes through it. So the normal save is **never written** in admin mode. That is enforced in one function and covered by a byte-compare test.
4. **Visible**: the ribbon at (398, top). The title shows `관리자 마을` under the start pill. A reload stays in admin mode until the player exits.
5. **Exit**:
   - `원래 마을로 돌아가기`: save the admin village, clear the mode flag, `scene.restart()`. The normal save loads exactly as left. The admin village is kept for next time (`관리자 마을 지우기` row).
   - `이 마을로 계속하기`: confirm twice. Normal → `BACKUP_KEY`; admin → `SAVE_KEY` with `chief.adm = 1`; flag cleared; restart.
6. **Isolation**:
   - the cloud never uploads while the mode flag is set;
   - a promoted save (`adm = 1`) uploads only after its own confirm;
   - rewards: no 출석 / 선물 / 오프라인 in admin (the gift box hides);
   - the calendar keys of the admin save may be offset (`dk`) without touching the normal save.

### 7.2 Switches

| Switch | Code |
|---|---|
| 돈 무제한 | `Economy.unlimited = true`: `spend(n)` returns `n` and keeps `coins ≥ 9,999,999`; the pill shows `∞`. All pads pay through `spend` (`UnlockPad.update` checks `eco.coins` first, and coins never fall). Coins added are tagged `admin`, so the IncomeMeter ignores them. |
| 코인 +10만 | `ports.coins.add(100000, …, 'admin')` |
| 모든 땅 열기 | for each `Territory.regions[id]` not open: `reveal(id, true, true)` (the `rail` and `west_s` links open with their partners). Then `Progression.forceStep()` (new) for `zone_*` and `tower_*`: `done = true`, `applyStep(s, true)`, the pad vanishes, `step` emitted. Tower sites finish via `Site.finish(true)`. `Neighbours.attach` runs when rail opens (as on load). |
| 모든 건물 열기 | flag read by `Civic.choices` / the build menu: `BUILD_UNLOCK` and rank conditions ignored. Uniques stay unique. The v4.2 sites (office, bank, depot) and the 금방 opening pad are offered now (their own `offer()` gates read the flag). |
| 짓기 바로 완공 | flag read at the end of `Site.start()`: fill `stock` from `need`, then `this.finish(false)` (the normal finish: `built` emitted, residents react). The button `지금 짓는 것 모두 완공` loops `gs.sites` + v4.2 sites + `Growth` houses / shop builds. |
| 고용 전부 | `Progression.forceAll()`: repeated passes over `STEPS` in order, completing each visible step whose `after` is met. Building conditions (`b:`) are met by finishing the needed sites first. Stops when a pass completes nothing. Then `LineUpgrades` offers are done. |
| 주민 행복 가득 | flag read by `Growth.happiness()` (returns 100) and by insight (every resident 100, v4.6) |
| 레벨 / SP / 초기화 | `chief.addXp(toNext)`, `chief.sp += 10`, `chief.respec({ all: true, free: true })` (gear included, admin only) |
| 시간 ×1 / ×2 / ×4 | `Game.update` multiplies `dt` by `adm.spd` before every system (tweens: `this.tweens.timeScale`). The sim steps are already dt-based. |
| 다음 날 아침 | `DayClock.T` → the next day 06:00 |
| 실제 하루 넘기기 | `adm.dk += 1`: the calendar / rewards `localDate()` port adds `dk` days (admin save only) |
| 퀘스트 / 미션 | chain `next()`, `completeAll()`, `reset()`; calendar `draw()` |

Every switch emits feed `admin { op }`. The admin panel never pauses the game.

---

## 8. Account + cloud save

### 8.1 Where login works

| Build | Origin | Network to Supabase | Can leave the page for Google | Login | Cloud |
|---|---|---|---|---|---|
| **APK** | `https://appassets.androidplatform.net` | yes (INTERNET; `shouldInterceptRequest` passes non-game hosts through) | yes, through the system browser / Custom Tab | **Google (PKCE + deep link)** | Supabase |
| **GitHub Pages** (`hyun800115-create.github.io/nurient/frost-village/`) | own https origin | yes (Supabase sends CORS for any origin) | yes (full-page redirect) | **Google (PKCE + redirect)** | Supabase |
| **claude.ai artifact** | sandboxed usercontent frame | likely blocked (CSP `connect-src`); probed at runtime, 3 s | no (no top navigation) | none | optional artifact `db` (§8.2c) + 저장 코드 |
| localhost (dev) | `http://localhost:8000` | yes | yes | Google (dev redirect URL) | Supabase |

`src/account/platform.js` decides this once at boot:
- `apk` when the user agent contains `SnowbloomVillageApp/`;
- `artifact` when in a cross-origin frame, or `window.claude` is present;
- `pages` on `github.io`;
- `local` on `localhost`.

Each platform has a capability record `{ login, cloud, artifactDb, download, clipboard }`. The settings tab and the title link read that record and nothing else.

### 8.2 Flows

**(a) APK — Supabase PKCE through a Custom Tab, back by deep link**

```
game (WebView)                         Android (MainActivity)                Chrome Custom Tab          Supabase / Google
──────────────                         ──────────────────────                ─────────────────          ─────────────────
1 pkce: verifier (64 random bytes, base64url) → localStorage 'frostVillage.auth.pkce' { verifier, t }
  challenge = base64url(SHA-256(verifier))      (crypto.subtle: the WebView origin is a secure context)
2 location.href = https://<ref>.supabase.co/auth/v1/authorize?provider=google
       &redirect_to=com.snowbloom.village://auth/callback&code_challenge=…&code_challenge_method=s256
                                       3 shouldOverrideUrlLoading: host == <ref>.supabase.co && path == /auth/v1/authorize
                                         → launch a Custom Tab (VIEW intent + customtabs extras), return true
                                                                              4 Google account chooser
                                                                                → Supabase /auth/v1/callback
                                                                                → 302 com.snowbloom.village://auth/callback?code=…
                                       5 intent-filter matches → singleTask: onNewIntent(i) (or onCreate on a cold start)
                                         DeepLink.parse(uri) → { code } | { error } (strict, §8.3)
                                         web.evaluateJavascript("window.__fvAuthReturn(" + JSONObject.quote(url) + ")")
                                         (retried until the page answers: cold start, page still loading)
6 __fvAuthReturn(url): POST /auth/v1/token?grant_type=pkce { auth_code, code_verifier } (apikey header)
  → { access_token, refresh_token, expires_in, user.id } → 'frostVillage.auth.v1' { at, rt, exp, uid } (email dropped)
7 toast 로그인했어요! → sync (§8.6)
```

Why it is safe:
- the code alone is useless without the verifier, which never leaves the WebView's storage (PKCE);
- a hostile app that registers the same scheme gains nothing;
- `redirect_to` must be on the project's allow-list.

**(b) GitHub Pages — same PKCE, full-page redirect**

1. Steps 1–2 as in the APK.
2. The page leaves, and the game saves on `pagehide` (exists).
3. Supabase returns to `https://…/frost-village/?code=…`.
4. `main.js` reads `code` before booting Phaser, strips it with `history.replaceState`, and exchanges it in the background.

**(c) claude.ai artifact — guest, plus two optional extras**
- **저장 코드** (always):
  - export: `JSON` → `CompressionStream('deflate-raw')` (fallback: none) → base64url, framed as `SV8.<crc32>.<data>`;
  - **copy** via `navigator.clipboard.writeText` (inside the user tap); fallback: a selected read-only textarea;
  - import: paste → checksum, version and sanitize → a preview card → confirm → the current village goes to `BACKUP_KEY` → load;
  - in the artifact, the `downloads` capability can offer `파일로 저장` (declare `downloads: true`; the viewer confirms each save).
- **Artifact `db` capability** (optional, small):
  - declare `capabilities: { sample: {}, db: {}, user: {} }`. A non-empty declaration is a full set: `sample` must be restated;
  - store the save at `data/users/<user.id()>/saves/slot0`: private per viewer, ≤ 256 KiB per document;
  - **only viewers at Contributor or above can write** (the owner; org members by default). Outside visitors by public link hold `view`: they get `null` / refusals and stay on `localStorage`;
  - this syncs the designer's own play between devices **inside claude.ai**. It does not reach the APK or Pages (that is what 저장 코드 is for);
  - load the `artifact-capabilities` skill before implementing. The runtime contract is pinned per artifact.

### 8.3 APK wrapper changes (`tools/apk/`)

| File | Change |
|---|---|
| `android/AndroidManifest.xml` | inside `MainActivity`, a second `<intent-filter>` (always present; harmless without login): `<action android:name="android.intent.action.VIEW"/> <category …DEFAULT/> <category …BROWSABLE/> <data android:scheme="com.snowbloom.village" android:host="auth"/>`. No new permission. `<queries>` with `android.support.customtabs.action.CustomTabsService` (Android 11+ package visibility, to find a Custom-Tab browser). |
| `android/java/…/DeepLink.java` (new, pure Java like `AssetRouter`, desktop-JVM testable) | `parse(String uri)`: scheme `com.snowbloom.village`, host `auth`, path `/callback` only. `code` ≤ 512 chars of `[A-Za-z0-9._~-]`, or `error` / `error_description` (≤ 300, printable, no `<>"'\`). Everything else returns null. `toJs(result)` → `JSONObject.quote`-safe call text. |
| `android/java/…/MainActivity.java` | `onNewIntent(Intent)` + the `getIntent()` check in `onCreate` → `deliver(uri)` (keeps `pendingDeepLink`, retries every 500 ms up to 20 s until `typeof window.__fvAuthReturn === 'function'`, via `evaluateJavascript` by reflection: API 19). In `GameClient.shouldOverrideUrlLoading`: an https URL whose host ends with `.supabase.co` and whose path starts with `/auth/v1/authorize` → `openCustomTab(url)`: `Intent(ACTION_VIEW)` + `Bundle.putBinder("android.support.customtabs.extra.SESSION", null)` (reflection: API 18) + toolbar colour `0xFF2A64A8`. With no Custom-Tab browser it is a plain browser tab: the same flow. Other links keep today's behaviour. |
| `android/stubs/…` | nothing new (no `@JavascriptInterface`: no JS bridge is needed, D9) |
| `build_apk.py` | nothing for the filter (it is in the template). A `--supabase-ref` value is written into `www/account_config.json` (the game reads it; the URL and publishable key are public values). |
| `test/validate_apk.py` | assert the VIEW / BROWSABLE filter and scheme (`aapt2 dump xmltree`), and that permissions are still only VIBRATE + INTERNET |
| `test/boot_test.mjs` | a login scenario against a mock Supabase (§9.4) |

**Risk to test on a real phone**: Chrome may ask before handing a server redirect to an app scheme. The fallback ships ready but off:
- `redirect_to` = a tiny https page on GitHub Pages (`frost-village/auth.html`);
- it shows `앱으로 돌아가기`, an `intent://auth/callback?code=…#Intent;scheme=com.snowbloom.village;package=com.snowbloom.village;end` link;
- the user's tap is a gesture, so it always works.

### 8.4 Client modules (`src/account/`)

| File | Pure? | Does |
|---|---|---|
| `config.js` | yes | project URL, publishable key, redirects per platform; `enabled` when filled (reads `account_config.json` in the APK) |
| `platform.js` | no | §8.1 detection |
| `pkce.js` | yes (WebCrypto injected) | verifier / challenge; the RFC 7636 test vector in tests |
| `auth.js` | no | `signIn()`, `onReturn(url)`, `refresh()` (`grant_type=refresh_token`, 60 s before `exp`), `signOut()` (`/auth/v1/logout`); session store; never stores the email or the profile |
| `rest.js` | no | `fetch` with `apikey` + `Authorization: Bearer`, 8 s `AbortController` timeout, JSON errors → codes (`offline`, `asleep` 5xx / paused, `auth` 401 → refresh once, `conflict`, `tooOld`) |
| `sync.js` | **yes** | the decision engine (§8.6 table): input `{ local, remote, mode }` → action. Exhaustively unit-tested |
| `outbox.js` | no | dirty flag + backoff 30 s → 2 → 10 → 30 min; triggers `online`, `visibilitychange` visible, every 120 s while dirty, `pagehide` (fetch `keepalive`, body ≤ 64 KB) |
| `code.js` | yes (stream injected) | 저장 코드 encode / decode / crc32 |
| `view/AccountTab.js`, `view/ConflictSheet.js`, `view/TitleLink.js` | no | §5.11 |

**No supabase-js**: about 200 lines of `fetch` cover auth (3 endpoints) and REST (2 calls). That saves ≈ 50 KB of bundle and a CDN dependency the artifact may not allow.

### 8.5 Supabase schema (one migration, applied with `apply_migration` after the designer's OK)

```sql
-- 행복한 눈꽃마을 이야기: cloud saves. One row per (player, slot): 0 = 마을, 1 = 예전 마을 보관함.
create table public.saves (
  user_id        uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  slot           smallint    not null default 0 check (slot in (0, 1)),
  rev            integer     not null default 1,
  save_version   smallint    not null check (save_version between 1 and 99),
  game_version   text        not null check (char_length(game_version) <= 16),
  device         text        not null check (device in ('apk', 'web', 'artifact')),
  summary        jsonb       not null default '{}'::jsonb check (octet_length(summary::text) <= 1024),  -- nm, title, lv, rank, coins, q, pt
  save           jsonb       not null check (octet_length(save::text) <= 65536),
  client_saved_at timestamptz,
  updated_at     timestamptz not null default now(),
  primary key (user_id, slot)
);
alter table public.saves enable row level security;
revoke all on public.saves from anon;
grant select, insert, update, delete on public.saves to authenticated;
create policy saves_select on public.saves for select to authenticated using (user_id = (select auth.uid()));
create policy saves_insert on public.saves for insert to authenticated with check (user_id = (select auth.uid()));
create policy saves_update on public.saves for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy saves_delete on public.saves for delete to authenticated using (user_id = (select auth.uid()));

-- compare-and-swap write: 'ok' | 'conflict' (someone else wrote) | 'tooOld' (a newer save format is there) | 'gone'
create or replace function public.put_save(p_slot smallint, p_base_rev integer, p_save jsonb, p_save_version smallint,
  p_game_version text, p_device text, p_summary jsonb, p_client_saved_at timestamptz)
returns table (status text, rev integer, updated_at timestamptz)
language plpgsql security invoker set search_path = '' as $$
declare cur public.saves%rowtype;
begin
  select * into cur from public.saves s where s.user_id = auth.uid() and s.slot = p_slot for update;
  if not found then
    if p_base_rev <> 0 then return query select 'gone'::text, 0, now(); return; end if;
    insert into public.saves (user_id, slot, rev, save_version, game_version, device, summary, save, client_saved_at)
      values (auth.uid(), p_slot, 1, p_save_version, p_game_version, p_device, p_summary, p_save, p_client_saved_at);
    return query select 'ok'::text, 1, now(); return;
  end if;
  if cur.save_version > p_save_version then return query select 'tooOld'::text, cur.rev, cur.updated_at; return; end if;
  if cur.rev <> p_base_rev then return query select 'conflict'::text, cur.rev, cur.updated_at; return; end if;
  update public.saves s set rev = cur.rev + 1, save = p_save, save_version = p_save_version, game_version = p_game_version,
    device = p_device, summary = p_summary, client_saved_at = p_client_saved_at, updated_at = now()
    where s.user_id = auth.uid() and s.slot = p_slot;
  return query select 'ok'::text, cur.rev + 1, now();
end $$;
revoke execute on function public.put_save from public, anon;
grant execute on function public.put_save to authenticated;

-- 계정과 클라우드 저장 지우기 (cascades to saves); security definer is needed to delete the auth user
create or replace function public.delete_me() returns void
language sql security definer set search_path = '' as $$ delete from auth.users where id = auth.uid(); $$;
revoke execute on function public.delete_me from public, anon;
grant execute on function public.delete_me to authenticated;
```

- **Reads**:
  - `GET /rest/v1/saves?slot=eq.0&select=rev,save_version,device,summary,updated_at` (the head, ≈ 300 B);
  - `GET …&select=save` only when pulling.
- **Server time**: the `Date` header of any response. It feeds the conflict card and the design's "server date for 출석 when online" rule.
- **After applying**: run `get_advisors` (security + performance) and fix any finding before the client points at it.

### 8.6 Sync rules

`local` = `{ exists, dirty, baseRev, hash, t, version, summary }` (`baseRev` = the cloud rev this village was last synced with; `dirty` = changed since).
`remote` = the row head or none.

| # | Situation | Action |
|---|---|---|
| 1 | not signed in / admin mode / `paused` / platform without cloud | nothing |
| 2 | remote none, local exists | first login: sheet `이 마을을 클라우드에 보관할게요` → push (`baseRev 0`) |
| 3 | remote none, local none (new phone, fresh install) | nothing (the title link offers nothing to load) |
| 4 | remote exists, local none (reinstall / new device) | pull (no question) → write `SAVE_KEY` → start the Game |
| 5 | `remote.rev == baseRev`, local dirty | push (CAS) |
| 6 | `remote.rev == baseRev`, local clean | nothing |
| 7 | `remote.rev > baseRev`, local clean | at boot / title: pull silently with a toast `다른 기기에서 저장한 마을을 불러왔어요`. In play (resume): a small sheet `다른 기기에서 더 최근에 저장했어요. 불러올까요?` [불러오기 / 이 기기 마을 계속]. Loading restarts the Game scene after `save(true)`. |
| 8 | `remote.rev > baseRev`, local dirty (both changed) | **conflict sheet** (§5.11). The newer `updated_at` vs local `t` gets the `더 최근` badge (a suggestion, never automatic). The losing village is written to slot 1 (`예전 마을 보관함`) or to `BACKUP_KEY` locally. Nothing is ever deleted. |
| 9 | local never synced (`baseRev` none) and remote exists (first login on a second device, or after 처음부터 하기) | conflict sheet |
| 10 | `remote.save_version > SAVE_VERSION` | never pull: `acc_newer`; pushes are refused server-side (`tooOld`) |
| 11 | push → `conflict` | re-read the head → row 8 |
| 12 | network error / 5xx / project paused | outbox backoff; the tab shows `acc_offline` or `acc_asleep`; play is never blocked |

- **처음부터 하기** (reset) clears `baseRev`. Without that, the fresh village would silently overwrite the cloud one (row 9 catches it).
- **Chat record** (up to 600 K chars): phase 2. A separate `chats` row, ≤ 256 KB, uploaded at most every 10 min, never on `pagehide`. Until then, switching device keeps the village but not the chat memories (said in the privacy page).
- **Settings** ride in a small `settings` field of the summary (language, sound) and apply only on a pull.
- **Volume**: ≤ 14 KB per push, at most one per 120 s while dirty + one on hide. A 30-min session ≈ 15 pushes ≈ 210 KB, well inside the free tier.

### 8.7 Privacy and security

- **The game stores**: the nickname (inside the save and its summary), the village save, a coarse device kind (`apk` / `web` / `artifact`) and timestamps. No email, no Google name or photo in our tables or in `localStorage`.
- **Supabase Auth itself keeps the Google account's email, name and picture URL** in `auth.users` / `auth.identities`. Login needs them; the game never selects them. The privacy page says this plainly.
- **One privacy page** (`frost-village/privacy.html`, Korean and English, on GitHub Pages). It is needed for Google's consent screen when the app is published beyond test users. It says:
  - what is kept;
  - why;
  - how to delete it (`계정과 클라우드 저장 지우기` → `delete_me()`; also by email);
  - that guests keep everything on the device.
- **Keys**:
  - the publishable key in the client is fine with RLS on every table (the only table is `saves`);
  - **never** a secret / `service_role` key in the game, the APK or the repo;
  - the Google client secret is pasted by the designer into Supabase only.
- **Auth settings**:
  - disable the Email provider (Google only), so the public key cannot mass-create accounts;
  - keep refresh-token rotation on (default);
  - the redirect allow-list holds exact URLs only (no `**` in production).
- **WebView**: no JS bridge. The deep-link value is validated in Java, then quoted. Only `*.supabase.co/auth/v1/authorize` goes to a Custom Tab.
- **Free-plan notes**:
  - free projects pause after about a week without activity. The game treats the cloud as optional (row 12), and the designer can restore the project from the dashboard;
  - the org has 1 active free project (`nuripang`); the new one makes 2, the free-plan maximum. Restoring a paused old project later would mean pausing another.

### 8.8 What the designer clicks (in order)

**A. 허락만 해 주세요** — We create a new free Supabase project `snowbloom-village` (region Seoul, ap-northeast-2, $0) with the connected Supabase tool, once you say OK. You do not need to click anything for A.

**B. Google Cloud: OAuth 클라이언트 만들기** (≈ 10분)
1. https://console.cloud.google.com 에 들어가요 → 위쪽 프로젝트 선택 → **새 프로젝트** → 이름 `snowbloom-village` → **만들기**.
2. 왼쪽 메뉴 **Google Auth Platform** (또는 **API 및 서비스 → OAuth 동의 화면**) → **시작하기**.
   - 앱 이름 `행복한 눈꽃마을 이야기`, 사용자 지원 이메일 = 디자이너님 메일.
   - 대상 **외부(External)**, 연락처 이메일 = 디자이너님 메일 → **만들기**.
3. **대상(Audience) → 테스트 사용자 → 사용자 추가**: 디자이너님 Gmail과 함께 해 볼 사람들의 Gmail. 테스트 중에는 여기 적은 사람만 로그인돼요 (최대 100명).
4. **데이터 액세스(Data Access)**: 기본 범위(`openid`, 이메일, 프로필)만 두고 저장해요. 민감한 범위가 아니라서 심사가 필요 없어요.
5. **클라이언트(Clients) → 클라이언트 만들기**:
   - 유형 **웹 애플리케이션**, 이름 `Supabase`.
   - **승인된 리디렉션 URI**에 우리가 알려 드리는 주소 하나를 붙여 넣어요 (`https://<프로젝트ID>.supabase.co/auth/v1/callback`) → **만들기**.
6. 화면에 **클라이언트 ID**와 **클라이언트 보안 비밀번호(secret)**가 나와요. 다음 C에서 Supabase에만 붙여 넣어요. 채팅이나 다른 곳에는 보내지 마세요.

**C. Supabase: 구글 로그인 켜기** (≈ 5분, https://supabase.com/dashboard → `snowbloom-village`)
1. **Authentication → Sign In / Providers → Google** → 켜기 → B-6의 Client ID와 Client Secret 붙여 넣기 → **Save**.
2. 같은 화면의 **Email** → 끄기 (구글 로그인만 써요).
3. **Authentication → URL Configuration**
   - **Site URL**: `https://hyun800115-create.github.io/nurient/frost-village/`
   - **Redirect URLs → Add URL**:
     - `com.snowbloom.village://auth/callback`
     - `https://hyun800115-create.github.io/nurient/frost-village/`
     - (개발용) `http://localhost:8000/**`
   - **Save**.

**D. (친구들에게 공개할 때만)** Google Auth Platform → **대상 → 앱 게시(Publish app)**.
- 로고는 넣지 않아요 (넣으면 브랜드 심사가 생겨요).
- 개인정보처리방침 주소는 우리가 만든 `…/frost-village/privacy.html`을 넣어요.

### 8.9 What we do (after A–C)

1. `create_project` (after the cost confirmation).
2. `apply_migration` (§8.5), then `get_advisors` (security, performance) and fix any finding.
3. `get_publishable_keys` → `src/account/config.js` / `account_config.json`.
4. Tell the designer the exact callback URL for B-5.
5. Build: APK (deep link), Pages, artifact (guest + 저장 코드).
6. Run the §9.4 tests and hand over the on-device checklist.

---

## 9. Testing

### 9.1 Node (pure models, `node --test`, seeded, fast)

| Suite | Checks |
|---|---|
| `tools/test/kit/feed.test.mjs` | normalizer table (every §3.2 / §3.3 `t` has a producer; grep), FIFO order with re-entrant emits, 200-event guard, consumer error isolation, `SIGNAL_EVENTS ∪ XP_EVENTS` all emitted somewhere |
| `kit/income.test.mjs` | tagged payouts excluded; 5-min and 30-min averages |
| `chief/chief.test.mjs` | the level curve (design §3.3 table exact), SP grants (every 5th +2), learn gates / fees / SP, base ranks never respecced or charged, `mod()` caps, 관망 multiplier and nap, rename validation (graphemes, NFC, jamo, blocklist) |
| `missions_lab/chain.test.mjs` | 67 quests reachable in order (closure: every objective's facts are produced by an earlier step), counters start on activation, state objectives complete on arrival, claim / auto-claim → mail, catch-up from facts (fixtures) and idempotency, chapter SP / coupons |
| `missions_lab/missions.test.mjs` (+) | early calendar gate, tiered counts, monthly card keys (month rollover at 05:00 of the 1st), streak halves |
| `rewards/rewards.test.mjs` | attendance: one per day key, keys forward only, clock moved back gives 0, clock ahead uses future days; gifts (active time, 관망 half); offline (`lastSeen` max-only, negative → 0, cap, `I_day`); mailbox ≤ 20 and the overflow rule |
| `account/pkce.test.mjs` | RFC 7636 appendix-B vector (`dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk` → `E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM`) |
| `account/sync.test.mjs` | the §8.6 table exhaustively (every local × remote × mode combination → exactly one action); reset clears `baseRev`; admin never pushes |
| `account/code.test.mjs` | 저장 코드 round trip, CRC catches 1-char edits, a future version is refused, size of a 14 KB save |
| `admin/store.test.mjs` | enter / exit / promote over a fake storage: the normal save is **byte-identical** after any admin session; chat keys follow the mode |
| `slices.test.mjs` | `sanitizeChief`, `sanitizeRewards`, extended `sanitizeMissions`: 500 fuzzed blobs each, never throw, idempotent, cap respected |
| `balance.test.mjs` | `balanceCheck` repairs a bad `BALANCE.chief` / `rewards` (wrong lengths, non-ascending gates, out-of-cap effects) |
| `purity.test.mjs` (+) | `src/{chief,rewards,admin,insight,album}/model/**`, `src/account/{sync,pkce,code}.js`: no Phaser, window, document or Date |

### 9.2 Playwright phone runs (`tools/test/v44*.mjs`, the `pw.mjs` harness)

- **Viewports**: 390×844 DPR 3 and 360×640 DPR 2, touch, ko-KR and en.
- **New game**:
  - the name sheet appears;
  - **IME**: CDP `Input.imeSetComposition` steps `ㄴ → 누 → 눈`, then `insertText('송이')`, an Enter during composition (must not submit), then 확인;
  - the keyboard is simulated by resizing the visual viewport (`page.setViewportSize` with `innerHeight` 420): the field and the OK button stay visible.
- **Ch1 by touch**: the joystick (`boot_test` CDP touch helpers), quest chip progress, claim, Lv-up banner, learn 큰 가방 at the 수련대.
- **HUD overlap checker**: bounding boxes of every interactive HUD object from `__FV` hooks. Assert:
  - no two overlap;
  - every one ≥ 64 logical drawn and ≥ 88 hit;
  - nothing new in the bottom third except today's;
  - with a late save (rank chip + order chip + work chip + quest chip): the stack folds to 3 rows at 360×640 and 4 at 390×844.
- **Panels**: screenshots of skill / 수첩 / 우편함 / 관리자 / 계정 / conflict / 출석 / 마을 at both sizes, both languages; long English labels fit (the `setScale` shrink rule).
- **Admin**: enter → `돈 무제한` → build everything instantly → exit → hash compare of `frostVillage.save.v1` before and after.
- **Existing suites stay green**: `smoke`, `v42`, `v4`, `rail`, `town`, `v3`, `labour`, `dog`, `life`, `plots`, `restaurant`, `c2`, `nav`, `pickup`, saves, chat, unit tests, `texbudget`, `soak`; the artifact file count ≤ 480.

### 9.3 Save migration fuzz

- **Fixtures**: `tools/test/fixtures/v35_save_*`, `v41_save_*`, plus new v4.2 fixtures written by the bots (25 / 46 / 90 min, with bag / boots at 0, mid and max, and partial payments on the old pads).
- **For each**: load in v4.4 → `capacity()` and `speedMult()` identical to before; coins = before + refunds; the catch-up chapter and Lv within the design's ranges (§5.6 there); coins ≤ 10 × I; the 그동안의 이야기 card once; reload → no second catch-up.
- **1,000 fuzzed v7 saves** through `MIGRATE[7]` + `sanitizeSave`: never throws; load → save → load stable; ≤ 16 KB.
- **A v8 save in a v7 build** (the published v4.2): kept as backup (existing rule), proven, so a stale artifact tab cannot destroy a v8 village.

### 9.4 Login without a real phone: mock Supabase + APK checks

- **Mock server** (`tools/test/account/mock_supabase.mjs`):
  - `/auth/v1/authorize` (302 to the redirect with `code`);
  - `/auth/v1/token` (PKCE check: it verifies `S256(verifier) == challenge`, refresh);
  - `/rest/v1/saves`, `/rest/v1/rpc/put_save` (same CAS rules as the SQL), `/auth/v1/logout`;
  - switches: paused (503), slow (5 s), offline.
- **Web (Pages mode)**: full redirect round trip on `localhost`; first login push; a second browser profile = a second device → conflict sheet; offline → outbox → back online → push.
- **APK mode** (`boot_test.mjs` + AssetServer):
  - intercept the navigation to `/auth/v1/authorize`, as `shouldOverrideUrlLoading` would;
  - call `window.__fvAuthReturn('com.snowbloom.village://auth/callback?code=…')`, as `MainActivity` would;
  - assert session, push, pull, and that the code is refused after reuse.
- **Java**: `DeepLink` unit test on the desktop JVM (the `AssetServer` approach). Valid callback; wrong scheme / host / path; a code with `'`, `"`, `\`, `</script>`, a 600-char code, an `error` with HTML, a fragment token (ignored) — every hostile case gives null or a safely quoted string.
- **`validate_apk.py`**: the intent-filter and `<queries>` are present; permissions unchanged; versionCode monotonic.
- **Database**: after `apply_migration`, a SQL test with two fake users (`set local role authenticated; set local request.jwt.claims = '{"sub": "…"}'`). User B cannot read or write user A's rows; `put_save` CAS returns `conflict` / `tooOld` correctly; `delete_me` cascades. Then `get_advisors`.
- **On-device checklist** for the designer (Korean, in the build report). These are the things only a real phone proves:
  1. install the new APK over the old one;
  2. 설정 → 계정 → Google 로그인 → the Chrome sheet → pick the account → back in the game: `로그인했어요!`;
  3. play 3 minutes → the 계정 tab says `클라우드 저장 · 방금`;
  4. uninstall + install → title `다른 기기의 마을 불러오기` → same village;
  5. airplane mode → play → back online → saved;
  6. close the app while the Chrome sheet is open → reopen → log in again works.

  If we ever get a device on adb: `adb shell am start -W -a android.intent.action.VIEW -d "com.snowbloom.village://auth/callback?code=test" com.snowbloom.village`.

### 9.5 Bots (`review_gameplay_sim.mjs` policies, from the design §15.4)

`--skills bagfirst`, `--skills none`, the quest audit (arrow-only bot finishes Ch1–Ch5), the XP audit (Lv at 30 min 9–13), the catch-up audit. Plus a **HUD audit**: the bot logs each frame's stack rows and the edge-badge positions, and fails if any overlap.

---

## 10. Version split and effort

Effort = agent build days + review/fix days. **v4.3 = 금방 integration (as planned) ships first.** Everything below assumes it, and the Ch7 quests skip themselves when 금방 is not in.

| Version | Theme | In | Effort | Gate to ship |
|---|---|---|---|---|
| **v4.2 / v4.2.x** | (in verification) | restaurant back tables + porters touch | — | as planned |
| **v4.3** | 금방 | `geumbang_module.md` §8 patches G-P1…G-P17 | as planned | v4.2 shipped |
| **v4.4** | 촌장 성장 + 이야기 | kit-lite (§2.2) · chief (name sheet, XP / Lv ring, 14 skills, 수련대, migration v7 → 8, refunds) · the skill hooks (§2.5) · the chain in `missions_bank` (67 quests, catch-up, chip, 수첩 shell 이야기 tab, tutorial merge, `Navigator.guideTo`) · 우편함 + coupons · 관리자 모드 · 저장 코드 · `ui7` core frames (stand-ins acceptable) · settings tab row for 저장 코드 | **≈ 11 + 3** (kit-lite 1.5 · chief + migration 2 · hooks 1 · skill UI + name sheet 2 · chain 2.5 · mail 0.5 · admin 1 · 저장 코드 0.5) | §9.1–9.3, §9.5 green; artifact ≤ 480 files |
| *(fallback cut)* | | If v4.4 runs long: **v4.4** = kit-lite + chief + skills + admin + 저장 코드 (≈ 7 + 2); **v4.4.1** = chain + 수첩 + 우편함 (≈ 4.5 + 1.5). The migration lands with v4.4 either way. | | |
| **v4.5** | 매일의 즐거움 | calendar early gate + tiers + monthly + softer streak (missions refactor) · 수첩 tabs 오늘 / 이번 주 / 이달 / 출석 · 출석 sheet · 접속 선물 상자 · 오프라인 정산 · `ui7` calendar / chest frames | **≈ 7 + 2** | clock tests (§9.1 rewards), 05:00 rollover in an open tab |
| **v4.6** | 행복한 주민 · 지역 자원 | insight (per-resident happiness, the 마을 panel with tabs 등급 / 행복 / 자원 / 통계, resident card strip, region rows + TOP 3 + why-chain, overview overlay pins) · album (도감 · 업적) · 사진 모드 (artifact: `downloads` capability; APK: needs a small wrapper hook, a DownloadListener / MediaStore save) | **≈ 8 + 2** | panel perf (≤ 0.05 ms at 60 residents), 0 rebuilds per tick |
| **로그인 track** (parallel, after A–C in §8.8) | 저장 지키기 | Supabase project + schema + RLS + RPC · `src/account/*` · settings 계정 tab · conflict sheet · title link · APK deep link + Custom Tab · Pages redirect · privacy page · mock-server tests · on-device checklist | **≈ 6.5 + 2** (APK wrapper 1.5 · client + sync 2 · UI 1 · schema 0.5 · tests 1.5) | §9.4 green + designer's on-device checklist |
| *(optional)* artifact `db` saves | | §8.2c | ≈ 1 + 0.5 | after the login track |
| **v5** | 생활과 미션 | as `v5_v8_plan.md`; the kit grows (people, places, town, sites…); save 8 → 9; Ch8 quests | per plan | v4.6 |

Login can ship as v4.5.x or v4.6.x, whichever is current when the designer's setup is done. It touches no gameplay file except settings and the title.

---

## 11. Risks and open points

| Risk | Mitigation |
|---|---|
| The missions host refactor (sub-gates) breaks the polished v5 module | keep its 56 tests green; the new sub-gate tests run the board parts with v5 ports stubbed null; v5 features stay behind `rank2` |
| Left-column crowding at 360×640 in late v4 | stack manager with fold (§4.2) and the HUD audit bot |
| Chrome Custom Tab refuses the app-scheme redirect on some phones | the bounce page fallback (§8.3), ready but off |
| Supabase free project pauses | cloud is optional; clear `acc_asleep` state; the designer restores |
| A stale artifact tab (v4.2) meets a v8 save in the same browser | the existing future-version rule keeps a backup; proven in §9.3 |
| Two hidden doors (admin vs. v5 preview) | merged (D5) |
| ui3 / ui5 icons arrive late (after the title / first sale) | every new HUD element has a Graphics or base-atlas stand-in and a `reskin()` swap |
| The Phaser keyboard eats typing in DOM fields | `keyboard.enabled = false` while any DOM sheet is open (the chat pattern), in one helper used by the name sheet, 저장 코드 import and future fields |

**Questions for the designer** (defaults ship when unanswered):
1. OK to create the new free Supabase project? (default: wait)
2. 저장 코드 as text only, no QR? (default: yes, D7)
3. First 출석 after chapter 1, not in minute 1? (default: yes, D6)
4. The artifact `db` option for your own claude.ai play? (default: later)

---

## 12. The designer's request → where it is answered

| # | Request | Systems (this doc) | Design numbers (`v44_draft_design.md`) |
|---|---|---|---|
| 1 | 퀘스트 (물고기 잡기부터, 레벨마다) | §2.3 D2 chain in missions, §3 feed, §5.3 | §5 |
| 2 | 하루 · 주간 · 월간 임무 | §5.4, missions sub-gates | §6 |
| 3 | 출석 · 접속 보상 | §2.3 rewards, §5.5, §5.6 | §7 |
| 4 | 주민 행복도 | §5.8 (insight, v4.6) | §8 |
| 5 | 지역 자원 · 부족한 것 | §5.9, `Navigator.guideTo` | §9 |
| 6 | 구글 로그인 / 로그인 없이 · 저장 / 불러오기 | §8 | §11 |
| 7 | 시장 이름 (닉네임) | §5.1, §2.6 migration default | §3.1 |
| 8 | 스킬창 (가방 · 이동 → 스킬, + 더 많은 스킬) | §2.5, §2.6, §5.2 | §3–§4 |
| 9 | 관리자 모드 | §7, §5.10 | §10 |
| 10 | 추가 기능 | 우편함 §5.7, 저장 코드 §8.2c, album / 사진 v4.6 §10 | §12 |
